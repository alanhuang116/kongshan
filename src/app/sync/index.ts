/**
 * 同步层的入口（只在 VITE_ANLEWO_SYNC === '1' 时被 src/main.tsx 动态 import）。
 *
 * flag 关着的时候这个文件根本不会加载：不注册订阅、不生成 uid、不开 IndexedDB、
 * 不写任何新 key、不发任何请求（红线 3 / C10）。
 *
 * 三条规矩：
 *   1. 本地优先：localStorage 写成功就算成功，服务端只是备份（C9）。
 *   2. **恢复要真的接得住**：本机没有存档而服务端有时，把服务端那份原样写回 localStorage，
 *      然后**本会话不再推送、重载一次页面**——因为内存里的 `saved` 是启动时按空档建的，
 *      若不重载，用户点「入」时 `ks.ts` 的 visits 自增会让 `store.ts` 的 300ms 回写把刚恢
 *      复的那份盖掉，5 秒后还会把空档推上服务端（P0-2）。
 *   3. **不空写、不拿旧档盖新档**：首轮对账的判据在 reconcile.ts（纯函数、有单测）。
 *      只有"本地自上次同步以来真的改过"才推，覆盖前会让服务端留一份快照（P0-1）。
 *
 * 笔迹这边不动 Copy.tsx（那是异地协作的物理边界）：每 8 秒读一次 anlewo:write:v1，变了才推。
 */
import { saved, type Saved } from '../store';
import { SyncClient } from './client';
import { ensureId } from './id';
import { decideReconcile, hashText, type Anchor } from './reconcile';
import { SYNC_PUSH_LIMIT, setSyncState } from './state';

/** 与 store.ts 里同一个键（那边没导出，这里只能照抄；改了要两边一起改） */
const SAVE_KEY = 'anlewo:v1';
/** 与 acts/Copy.tsx 里同一个键，内容是 {key, chars: string[]} */
const INK_KEY = 'anlewo:write:v1';
/** 本机会话锚：上一次与服务端对齐时的 revision 与本地文本摘要（不装任何存档内容） */
const ANCHOR_KEY = 'anlewo:sync:v1';
/** 一次性重载守卫（sessionStorage，不是 localStorage；**按 uid 区分**，见 reloadOnce） */
const RELOAD_GUARD_PREFIX = 'anlewo:sync:reloaded:';

const PUSH_DEBOUNCE_MS = 5000;
const INK_POLL_MS = 8000;
const CONFLICT_RETRY_MS = 700;


interface Session {
  stop: () => void;
}

let session: Session | null = null;

function readLocal(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 存不下就算了：这一回照样能玩，下次再说
  }
}

function readAnchor(): Anchor | null {
  const raw = readLocal(ANCHOR_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Anchor>;
    if (o && o.v === 1 && typeof o.revision === 'number' && typeof o.hash === 'string') {
      return { v: 1, revision: o.revision, hash: o.hash };
    }
  } catch {
    // 坏了就当没有：多推一次而已
  }
  return null;
}

function writeAnchor(a: Anchor): void {
  writeLocal(ANCHOR_KEY, JSON.stringify(a));
}

/** 恢复之后重载一次（一次性、按 uid 记）：让 store.ts 的 load() 真正接住写回去的那份 */
function canReloadOnce(uid: string): boolean {
  try {
    if (typeof sessionStorage === 'undefined' || typeof location === 'undefined') return false;
    return sessionStorage.getItem(RELOAD_GUARD_PREFIX + uid) !== '1';
  } catch {
    // 隐私模式 / 不让存：返回 false，调用方据此**绝不写本地**
    return false;
  }
}

function markReloaded(uid: string): boolean {
  try {
    sessionStorage.setItem(RELOAD_GUARD_PREFIX + uid, '1');
    return true;
  } catch {
    return false;
  }
}

function removeAnchor(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(ANCHOR_KEY);
  } catch {
    // 删不掉就算了
  }
}

/** 这次推送会覆盖服务端已有的一版，让服务端在覆盖前留快照 */
function bytesOf(text: string): number {
  try {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
  } catch {
    // 落到按字符估
  }
  return text.length * 3;
}

/** 注册失败会不会是"过一会儿就好"（限流/断网/服务端一时不在）——这类要退避重试，否则会永久静默不同步 */
function worthRetrying(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

/**
 * 注册（带退避）。`/link` 有限流，首次注册被 429 掉就不能一句"下次再说"了事——
 * 那样用户永远不知道自己没备份。401 是凭证问题，重试无意义，直接放弃。
 */
async function registerWithRetry(client: SyncClient, attempts = 3, waitMs = 15000) {
  let last = await client.register({ kind: 'web', label: 'web' });
  for (let i = 1; i < attempts && !last.ok && worthRetrying(last.status); i += 1) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, waitMs));
    last = await client.register({ kind: 'web', label: 'web' });
  }
  return last;
}

/**
 * 起同步。永远不抛：这个函数在页面启动之后才跑，它出什么事都不该影响游戏。
 */
export async function start(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (session) return;
  try {
    await boot();
  } catch (err) {
    console.debug('[anlewo-sync] 起不来，本地照旧', err);
  }
}

/** 停掉（登出、测试）；定时器与订阅都清干净 */
export function stop(): void {
  session?.stop();
  session = null;
}

async function boot(): Promise<void> {
  const apiBase = (import.meta.env.VITE_ANLEWO_SYNC_API ?? '').trim();
  const id = await ensureId();
  if (!id) {
    console.debug('[anlewo-sync] 这台机器造不出安全随机的 id，不参与同步');
    return;
  }

  const client = new SyncClient({ base: apiBase || '/api/anlewo', uid: id.uid, credential: id.key });
  const reg = await registerWithRetry(client);
  if (!reg.ok) {
    console.debug('[anlewo-sync] 注册没成（不影响本地），先不同步', reg.status, reg.code);
    return;
  }

  // 上限取小的那个：服务端报的是「库里的 CHECK 与服务端常量取小」，问不到就只用本地默认值。
  // 滚动发布时库/服务端可能还停在旧上限，这时按旧的停推，好过推上去撞 413（只留一行 console.debug）。
  const pushLimit = Math.min(SYNC_PUSH_LIMIT, (await client.payloadLimit()) ?? Number.POSITIVE_INFINITY);

  let baseRevision = 0;
  /** 上一次和服务端对齐时的本地文本（用来跳过没变的推送） */
  let lastPushed = '';
  /** 下一次推送是否要求服务端覆盖前留快照 */
  let snapshotNext = false;
  let pushTimer: number | undefined;
  let inkTimer: number | undefined;
  let paused = false;
  let conflictRetried = false;
  /** 超限的那一行 console 只在“刚进入超限”时打一次，不是每次 patch 都打 */
  let overLimitLogged = false;
  setSyncState({ limit: pushLimit });

  /**
   * 推一次当前存档。force=true 时忽略"内容没变"，用于首轮对账与冲突重试。
   */
  async function pushNow(force = false): Promise<void> {
    const payload: Saved = saved.get();
    let text: string;
    try {
      text = JSON.stringify(payload);
    } catch {
      setSyncState({ lastError: 'unserializable' });
      console.debug('[anlewo-sync] 存档没法序列化，这一回不推');
      return;
    }
    if (!force && text === lastPushed) return;
    const bytes = bytesOf(text);
    setSyncState({ bytes });
    if (bytes > pushLimit) {
      // 超限只留一行 console 的话，人以为在同步、其实早停了：挂到面板上（sync/state.ts）
      setSyncState({ overLimit: true, lastError: 'too_large' });
      if (!overLimitLogged) {
        overLimitLogged = true;
        console.debug('[anlewo-sync] 存档超过上限（' + pushLimit + ' 字节），这一回不推（本地完好；需要时再升上限）');
      }
      return;
    }

    const r = await client.pushSave(payload, baseRevision, { snapshotBefore: snapshotNext });
    if (r.ok) {
      baseRevision = r.revision;
      lastPushed = text;
      snapshotNext = false;
      conflictRetried = false;
      writeAnchor({ v: 1, revision: r.revision, hash: hashText(text) });
      overLimitLogged = false;
      setSyncState({ overLimit: false, lastPushAt: Date.now(), lastError: null });
      return;
    }
    if (r.conflict) {
      setSyncState({ lastError: 'conflict' });
      // 服务端在此期间又前进了：本地一个字都不改。
      // 本地确有新改动（走到这里说明是"本地优先"那一支），所以用服务端的新版本号再推一次；
      // 覆盖前让服务端留快照，另一台设备那一版保底能找回。
      console.debug('[anlewo-sync] 服务端有更新的版本（revision', r.revision, '），保留本地并留底后重推');
      baseRevision = r.revision;
      if (!conflictRetried) {
        conflictRetried = true;
        snapshotNext = true;
        window.setTimeout(() => void pushNow(true), CONFLICT_RETRY_MS);
      }
      return;
    }
    setSyncState({ lastError: r.code || String(r.status) });
    console.debug('[anlewo-sync] 推存档没成', r.status, r.code);
  }

  /** saved 一变就排队；5 秒内的连续改动合成一次（存档本身 300ms 才落 localStorage） */
  function schedulePush(): void {
    if (paused) return;
    window.clearTimeout(pushTimer);
    pushTimer = window.setTimeout(() => void pushNow(), PUSH_DEBOUNCE_MS);
  }

  /** 上一次推成功的笔迹原文（跳过没变的） */
  let lastInkRaw: string | null = null;

  /** 笔迹：只认 Copy.tsx 已经写进 localStorage 的那一份，变了才推 */
  async function inkTick(): Promise<void> {
    if (paused) return;
    const raw = readLocal(INK_KEY);
    if (!raw || raw === lastInkRaw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const o = (parsed ?? {}) as { key?: unknown; chars?: unknown };
    const pieceKey = typeof o.key === 'string' ? o.key : '';
    const chars = Array.isArray(o.chars) ? o.chars : [];
    if (!pieceKey || chars.length === 0) return;
    for (const c of chars) if (typeof c !== 'string') return;
    const r = await client.pushInk(pieceKey, chars as string[]);
    if (r.ok) lastInkRaw = raw;
  }

  function startTimers(): void {
    if (inkTimer === undefined) inkTimer = window.setInterval(() => void inkTick(), INK_POLL_MS);
  }

  function stopTimers(): void {
    window.clearTimeout(pushTimer);
    pushTimer = undefined;
    if (inkTimer !== undefined) window.clearInterval(inkTimer);
    inkTimer = undefined;
  }

  const onVisibility = (): void => {
    paused = document.visibilityState === 'hidden';
    if (paused) {
      // 藏起来之前先把攒着的那一次推掉：关掉页面时不必干等 5 秒的防抖
      void pushNow();
      stopTimers();
    } else {
      startTimers();
      schedulePush();
    }
  };

  /** 真要走了（关标签、切后台被回收）也尽量推最后一次；推不上去就算了，本地还在 */
  const onPageHide = (): void => {
    void pushNow();
  };

  // ---- 首轮对账（只做一次；判据在 reconcile.ts） ----
  const localRaw = readLocal(SAVE_KEY);
  const localHash = localRaw ? hashText(localRaw) : '';
  const remote = await client.pullSave();
  const anchor = readAnchor();
  const decision = decideReconcile(
    { raw: localRaw, hash: localHash },
    { ok: remote.ok, data: remote.ok ? remote.data : null },
    anchor,
  );

  if (decision.action === 'adopt' && remote.ok && remote.data) {
    // 先确认"恢复之后确实能重载"，再动本地（P1-A）：只写 localStorage 而重载不了的话，
    // 内存里的空档会在 300ms 后把刚恢复的那份盖掉。不能重载就一个字也不写。
    if (!canReloadOnce(id.uid) || !markReloaded(id.uid)) {
      console.debug('[anlewo-sync] 这一会话不允许重载：保持本地原样、不同步（下次开页面再接）');
      return;
    }
    const text = JSON.stringify(remote.data.payload);
    writeLocal(SAVE_KEY, text);
    writeAnchor({ v: 1, revision: remote.data.revision, hash: hashText(text) });
    console.debug('[anlewo-sync] 按服务端那份放回本地（revision', remote.data.revision, '·', decision.reason, '），重载后由 load() 接住');
    try {
      location.reload();
    } catch {
      // 重载没发生：撤掉会话锚，下次按"没有锚"处理 → 覆盖前服务端会留底，可找回
      removeAnchor();
      console.debug('[anlewo-sync] 重载失败：已撤掉会话锚，下次开页面按未对齐处理');
    }
    return;
  }

  baseRevision = decision.baseRevision;
  // 首轮就"本地优先"地覆盖服务端时让服务端留底。
  // 判据是"这个服务端版本不是我们锚住的那一个"：锚对得上说明是我们自己这一支写出来的，
  // 不用留底；锚对不上、或者压根没有锚（换了设备/清过锚键）→ 覆盖的是别人的版本，必须留底。
  snapshotNext = decision.action === 'push' && (!anchor || anchor.revision !== baseRevision);
  if (decision.action === 'push' || decision.action === 'push-first') {
    await pushNow(true);
  } else {
    // 已对齐（noop）：把本地文本记成"上次推过的"，免得开页面就白推一次
    if (decision.reason === 'in-sync') lastPushed = localRaw ?? '';
  }

  // ---- 订阅 + 定时器 ----
  const unsubscribe = saved.sub(schedulePush);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pagehide', onPageHide);
  if (document.visibilityState !== 'hidden') startTimers();

  setSyncState({ started: true });
  session = {
    stop() {
      setSyncState({ started: false });
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('pagehide', onPageHide);
      stopTimers();
    },
  };
}
