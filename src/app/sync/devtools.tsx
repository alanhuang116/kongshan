/**
 * 首页五连击开发调试面板（仅开发态，挂载条件见 src/main.tsx）。
 *
 * 这是给人肉测试同步用的一扇小门：题名页「安乐窝」的「安」字，2 秒内点 5 次才开面板。
 * 命中区用 Range 量出首字真实字形框（随字体/缩放/窗口变化自动重算），叠一层极淡的轮廓；
 * 轮廓 pointer-events:none，计数靠 document 上的 pointerdown + 坐标命中，
 * 所以单击会原样穿过交给游戏——不抢焦点、不改存档、不碰笔迹。
 *
 * 只读写两个 localStorage 键（形状与既有模块逐字一致）：
 *   · anlewo:id:v1   —— 见 id.ts 的 SyncId { v:1, uid, key, createdAt }，id.ts 独占写入
 *   · anlewo:sync:v1 —— 见 sync/index.ts 与 reconcile.ts 的 Anchor { v:1, revision, hash }
 * 另读一份**内存状态**（sync/state.ts）：存档字节、最近一次推成功的时间、是不是已经超限停推。
 * 那份状态不落盘、不上报；同步 flag 没开时它一直是初值，面板据此说“没在同步”。
 * 本文件不新增任何键、不发任何请求、不碰服务端。
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { isSyncKey, isV4Uuid, loadId, newSyncKey, type SyncId } from './id';
import type { Anchor } from './reconcile';
import { syncState, type SyncState } from './state';
import { storageState, type StorageState } from '../store';

/** 与 id.ts 的 KEY 一致（那边没导出，这里照抄；改了要两边一起改） */
const ID_KEY = 'anlewo:id:v1';
/** 与 sync/index.ts 的 ANCHOR_KEY 一致（那边没导出，这里照抄） */
const ANCHOR_KEY = 'anlewo:sync:v1';

/** 连击判据：滚动窗口 2 秒，窗口内累计 5 次 */
const CLICK_WINDOW_MS = 2000;
const CLICK_COUNT = 5;
/** 写入成功后留一点时间让人看见提示，再重载（同步层只在启动时读身份） */
const RELOAD_DELAY_MS = 300;

/** 只用浏览器给的 localStorage；读不到/坏了都当没有 */
function readAnchor(): Anchor | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(ANCHOR_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Anchor>;
    if (o && o.v === 1 && typeof o.revision === 'number' && typeof o.hash === 'string') {
      return { v: 1, revision: o.revision, hash: o.hash };
    }
  } catch {
    // 锚坏了就当没有：面板只读，不修
  }
  return null;
}

/** 量出题名页「安乐窝」首字「安」的字形框；题名页不在（已入）时返回 null */
function findAnRect(): DOMRect | null {
  const title = document.querySelector('.title-name');
  if (!title) return null;
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const i = node.data.indexOf('安');
    if (i < 0) continue;
    const range = document.createRange();
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
  }
  return null;
}

/** key 默认打码：只露头 4 尾 4 */
function maskKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

/** 字节数说人话：小于 1KB 报字节，上头报 KB / MB（一位小数） */
function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** 时刻：只到秒，本机时区 */
function fmtClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 多久以前：给人看个量级就行 */
function fmtAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒`;
  if (s < 3600) return `${Math.round(s / 60)} 分钟`;
  return `${Math.round(s / 3600)} 小时`;
}

/** 没推成的原因翻成人话 */
const ERR_TEXT: Record<string, string> = {
  too_large: '存档超过 4MB 上限，已停推（本地完好）',
  unserializable: '存档没法序列化成 JSON',
  conflict: '服务端有别的版本，正在重推',
  network_down: '网络没通（下次变动再试）',
  bad_credential: '凭证不被服务端认（要重新注册）',
  identity_disabled: '身份对接关着',
};
const errText = (code: string): string => ERR_TEXT[code] ?? code;

const S: Record<string, CSSProperties> = {
  dot: {
    position: 'fixed',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: 2,
    pointerEvents: 'none',
    zIndex: 2147483646,
  },
  panel: {
    position: 'fixed',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 2147483647,
    boxSizing: 'border-box',
    width: 480,
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'calc(100vh - 24px)',
    overflow: 'auto',
    padding: '16px 18px',
    borderRadius: 12,
    background: 'rgba(16,18,22,0.97)',
    color: '#e9e9e9',
    border: '1px solid rgba(255,255,255,0.20)',
    boxShadow: '0 14px 44px rgba(0,0,0,0.55)',
    font: '13px/1.65 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  section: {
    marginTop: 12,
    paddingTop: 10,
    borderTop: '1px solid rgba(255,255,255,0.12)',
  },
  label: {
    display: 'inline-block',
    minWidth: 58,
    color: '#9fb4c7',
  },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    margin: '4px 0',
    wordBreak: 'break-all',
  },
  code: {
    color: '#f2d7a0',
    userSelect: 'text',
  },
  hint: {
    marginTop: 6,
    color: '#8c98a6',
    fontSize: 11,
  },
  input: {
    boxSizing: 'border-box',
    width: '100%',
    marginTop: 6,
    padding: '7px 9px',
    borderRadius: 6,
    background: 'rgba(0,0,0,0.35)',
    color: '#e9e9e9',
    border: '1px solid rgba(255,255,255,0.22)',
    font: 'inherit',
    outline: 'none',
  },
  buttons: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  button: {
    padding: '5px 10px',
    borderRadius: 6,
    background: 'rgba(255,255,255,0.10)',
    color: '#e9e9e9',
    border: '1px solid rgba(255,255,255,0.20)',
    font: 'inherit',
    cursor: 'pointer',
  },
  close: {
    padding: '0 6px',
    background: 'transparent',
    color: '#9fb4c7',
    border: 'none',
    font: '16px/1 inherit',
    cursor: 'pointer',
  },
  error: {
    minHeight: 18,
    marginTop: 10,
    color: '#ff9b9b',
    fontSize: 12,
    wordBreak: 'break-word',
  },
  notice: {
    minHeight: 18,
    marginTop: 2,
    color: '#9dd6a5',
    fontSize: 12,
    wordBreak: 'break-word',
  },
};

/** 面板本体：只读展示 + 三个动作，状态全在组件内，不触碰游戏 store */
function Devtools(): ReactElement {
  const [open, setOpen] = useState<boolean>(false);
  const [identity, setIdentity] = useState<SyncId | null>(() => loadId());
  const [anchor, setAnchor] = useState<Anchor | null>(() => readAnchor());
  const [revealKey, setRevealKey] = useState<boolean>(false);
  const [draftUid, setDraftUid] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  /** 同步层的内存状态（面板开着时每秒读一次；关着不跑） */
  const [sync, setSync] = useState<Readonly<SyncState>>(() => syncState());
  const [store, setStore] = useState<Readonly<StorageState>>(() => storageState());

  const dotRef = useRef<HTMLDivElement | null>(null);
  /** 「安」字当前字形框；题名页出现/消失、字体与窗口变化时重算 */
  const [anRect, setAnRect] = useState<DOMRect | null>(null);
  /** 2 秒滚动窗口内的 pointerdown 时间戳 */
  const clicksRef = useRef<number[]>([]);

  const refresh = useCallback((): void => {
    setIdentity(loadId());
    setAnchor(readAnchor());
  }, []);

  // 「安」字的位置由题名页排版决定，字体加载/窗口缩放/进入游戏都会让它变化。
  // 只在开发态轮询（300ms）；位置没变就不 setState，不引发多余渲染。
  useEffect(() => {
    const measure = (): void => {
      const r = findAnRect();
      setAnRect((prev) => {
        if (!r) return prev ? null : prev;
        if (prev && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.top - r.top) < 0.5
          && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5) return prev;
        return r;
      });
    };
    measure();
    const timer = window.setInterval(measure, 300);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, []);

  // 热点不接收指针事件，所以在 document 的捕获阶段按坐标判断命中；
  // 没命中就清空计数，避免"点别处又点安字"被连起来算成五连击。
  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      if (open) return;
      const dot = dotRef.current;
      if (!dot) return;
      const r = dot.getBoundingClientRect();
      const hit = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!hit) {
        clicksRef.current = [];
        return;
      }
      const now = Date.now();
      const recent = clicksRef.current.filter((t) => now - t <= CLICK_WINDOW_MS);
      recent.push(now);
      clicksRef.current = recent;
      if (recent.length >= CLICK_COUNT) {
        clicksRef.current = [];
        refresh();
        setError('');
        setNotice('');
        setOpen(true);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, refresh]);

  const close = useCallback((): void => {
    clicksRef.current = [];
    setOpen(false);
  }, []);

  // 同步状态：每秒照一份快照（同步层自己是事件驱动的，没有订阅接口，轮询最省事）
  useEffect(() => {
    if (!open) return;
    // 同步锚也每秒重读：它只在上一次推送成功时被改写，只在开面板时读一次会停在旧 revision
    const tick = (): void => {
      setSync({ ...syncState() });
      setStore({ ...storageState() });
      setAnchor(readAnchor());
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  /** 应用 uid：形状严格照 id.ts，非法 uuid 一律不写 */
  const applyUid = useCallback((): void => {
    setError('');
    setNotice('');
    const uid = draftUid.trim();
    if (!isV4Uuid(uid)) {
      setError('uid 非法：必须是小写 v4 uuid（形如 550e8400-e29b-41d4-a716-446655440000）。未写入。');
      return;
    }

    const existing = loadId();
    // 本地已有合法 key 就沿用（让服务端仍认这台设备），否则用安全随机源造 32 字节 base64url
    const key: string | null = existing && isSyncKey(existing.key) ? existing.key : newSyncKey();
    if (!key) {
      setError('本机没有可用的安全随机源，造不出 key。未写入。');
      return;
    }

    const next: SyncId = { v: 1, uid, key, createdAt: existing?.createdAt ?? Date.now() };
    try {
      localStorage.setItem(ID_KEY, JSON.stringify(next));
    } catch (err) {
      setError(`写入 ${ID_KEY} 失败：${String(err)}。未生效。`);
      return;
    }

    setIdentity(next);
    // 旧锚的 revision/hash 属于上一个身份，不能拿来给新身份对账。
    // 只有 uid 真的变了才清；同一 uid 重复应用保留锚，免得白白触发 push-first。
    const prevUid = existing?.uid?.toLowerCase();
    if (prevUid && prevUid !== uid.toLowerCase()) {
      try {
        localStorage.removeItem(ANCHOR_KEY);
        setNotice('已换 uid，同步锚已清除（新身份按无基线对账）；正在重载页面…');
      } catch (err) {
        setNotice(`已换 uid，但清除同步锚失败：${String(err)}；正在重载页面…`);
      }
    } else {
      setNotice('已写入身份；同步层只在启动时读身份，正在重载页面…');
    }
    window.setTimeout(() => {
      try {
        location.reload();
      } catch {
        setNotice('已写入，但自动重载失败，请手动刷新页面。');
      }
    }, RELOAD_DELAY_MS);
  }, [draftUid]);

  const clearAnchor = useCallback((): void => {
    setError('');
    setNotice('');
    try {
      localStorage.removeItem(ANCHOR_KEY);
    } catch (err) {
      setError(`清除同步锚失败：${String(err)}`);
      return;
    }
    setNotice(`已清除 ${ANCHOR_KEY}。`);
    refresh();
  }, [refresh]);

  const copyIdentity = useCallback(async (): Promise<void> => {
    const current = loadId();
    if (!current) {
      setError('本机没有可复制的身份。');
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(current, null, 2));
      setError('');
      setNotice('身份 JSON 已复制到剪贴板（含 key，别外传）。');
    } catch (err) {
      setError(`复制失败：${String(err)}`);
    }
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        style={anRect ? {
          ...S.dot,
          left: anRect.left,
          top: anRect.top,
          width: anRect.width,
          height: anRect.height,
        } : { ...S.dot, display: 'none' }}
        aria-hidden="true"
      />
      {open && (
        <div style={S.panel} role="dialog" aria-label="开发调试面板">
          <div style={S.head}>
            <span>开发调试 · 同步身份</span>
            <button type="button" style={S.close} onClick={close} aria-label="关闭">×</button>
          </div>

          <div style={S.section}>
            <div style={S.row}>
              <span style={S.label}>uid</span>
              <code style={S.code}>{identity?.uid ?? '（无）'}</code>
            </div>
            <div style={S.row}>
              <span style={S.label}>key</span>
              <code style={S.code}>{identity ? (revealKey ? identity.key : maskKey(identity.key)) : '（无）'}</code>
              <button type="button" style={S.button} onClick={() => setRevealKey((v) => !v)}>
                {revealKey ? '隐藏' : '显示'}
              </button>
            </div>
            <div style={S.hint}>key 是凭证，默认打码；只在本机与请求头里出现。</div>
          </div>

          <div style={S.section}>
            <div style={S.row}>
              <span style={S.label}>同步锚</span>
              <span>
                {anchor
                  ? `存在 · revision ${anchor.revision} · hash ${anchor.hash}`
                  : `不存在（${ANCHOR_KEY}）`}
              </span>
            </div>
            <div style={S.hint}>只读展示；点「清除同步锚」会删掉这个键。</div>
          </div>

          <div style={S.section}>
            <div style={S.row}>
              <span style={S.label}>最近推送</span>
              <span>
                {sync.lastPushAt
                  ? `成功 · ${fmtClock(sync.lastPushAt)}（${fmtAgo(Date.now() - sync.lastPushAt)}前）`
                  : sync.started ? '这次会话还没推成功过' : '没在同步（同步层未启动）'}
              </span>
            </div>
            <div style={S.row}>
              <span style={S.label}>存档字节</span>
              <span>
                {fmtBytes(sync.bytes)} / {fmtBytes(sync.limit)}
                {`（余 ${fmtBytes(Math.max(0, sync.limit - sync.bytes))}，占 ${((sync.bytes / sync.limit) * 100).toFixed(1)}%）`}
              </span>
            </div>
            <div style={S.row}>
              <span style={S.label}>本机落盘</span>
              <span>
                {store.ok ? `正常 · ${store.bytes} 字` : `写不进 localStorage（${store.lastError ?? 'unknown'}）`}
                {store.trimmed > 0 ? ` · 为写下去已丢最老起居注 ${store.trimmed} 条` : ''}
              </span>
            </div>
            {sync.overLimit && (
              <div style={S.error} role="alert">
                超上限停推：整包 {fmtBytes(sync.bytes)} 已超 {fmtBytes(sync.limit)}，本地照旧、但不再上传（改回小一点之前，服务端停在上一版）
              </div>
            )}
            {!sync.overLimit && sync.lastError && (
              <div style={S.error} role="alert">上次没推成：{errText(sync.lastError)}</div>
            )}
            <div style={S.hint}>
              字节数是整包存档 JSON 的 UTF-8 长度（与推送、存档上限那条 CHECK 同一个口径，含 journal 与 world 八份）；每秒刷一次，不落盘。
            </div>
          </div>

          <div style={S.section}>
            <div style={S.row}>
              <span style={S.label}>应用 uid</span>
              <span>输入一个 v4 uuid，覆盖本机身份</span>
            </div>
            <input
              style={S.input}
              value={draftUid}
              onChange={(e) => setDraftUid(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyUid();
              }}
              placeholder="550e8400-e29b-41d4-a716-446655440000"
              spellCheck={false}
              aria-label="新的 uid"
            />
            <div style={S.buttons}>
              <button type="button" style={S.button} onClick={applyUid}>应用</button>
              <button type="button" style={S.button} onClick={() => void copyIdentity()}>复制身份</button>
              <button type="button" style={S.button} onClick={() => void clearAnchor()}>清除同步锚</button>
              <button type="button" style={S.button} onClick={close}>关闭</button>
            </div>
            <div style={S.hint}>应用成功后会重载一次页面，让同步层用新身份启动；非法 uid 不写入。</div>
          </div>

          <div style={S.error} role="alert">{error}</div>
          <div style={S.notice}>{notice}</div>
        </div>
      )}
    </>
  );
}

let mountedRoot: Root | null = null;

/** 由 main.tsx 在开发态调用；重复调用（含 HMR）不会重复挂节点 */
export function mount(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (mountedRoot || document.querySelector('[data-anlewo-devtools]')) return;
  const host = document.createElement('div');
  host.setAttribute('data-anlewo-devtools', '1');
  document.body.appendChild(host);
  mountedRoot = createRoot(host);
  mountedRoot.render(<Devtools />);
}
