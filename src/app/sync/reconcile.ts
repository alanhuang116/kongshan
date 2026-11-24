/**
 * 首轮对账的决策：给定「本地存档」「服务端存档」「本机会话锚」，决定这一轮做什么。
 *
 * 单独抽出来是为了能真单测（tests/sync-reconcile.test.ts）——这段逻辑出错的代价是丢档，
 * 不能只靠肉眼和真机试。
 *
 * 三条不变量（来自 docs/DB_SPLIT_FINAL.md §7 的 C4 / C6）：
 *   1. **不空写**：本地与服务端已经对齐（锚的 revision 与本地文本摘要都对得上）时，什么也不做。
 *      否则每开一次页面就 +1 revision，白造与别的设备的冲突窗口。
 *   2. **不拿旧档盖新档**：本地自上次同步以来没动过（文本摘要 == 锚的摘要），而服务端前进了
 *      → 说明是另一台设备写的，采纳服务端（写回本地后由调用方重载页面）。
 *   3. **本地真有新改动才算"本地优先"**：本地与服务端都动了 → 推本地，服务端那一版由
 *      服务端在覆盖前留快照（db.mjs 的 snapshotBefore），保底能找回。
 *
 * 服务端存档的 jsonb 不保留键序，所以这里只比**本地自己**的文本摘要，
 * 从不拿本地文本与服务端文本直接比字节。
 */

/** 服务端那一份（与 client.ts 的 RemoteSave 同形，只取用得着的两个字段） */
export interface RemoteLike {
  revision: number;
  payload: unknown;
}

/** 本机会话锚：上一次与服务端对齐时的 revision，以及当时本地文本的摘要 */
export interface Anchor {
  v: 1;
  revision: number;
  hash: string;
}

export type ReconcileAction =
  /** 什么都不做（已对齐，或服务端不可用） */
  | 'noop'
  /** 采纳服务端：把 payload 写回本地，然后调用方重载页面 */
  | 'adopt'
  /** 服务端还没有这一份：本地首发 */
  | 'push-first'
  /** 推本地，baseRevision = 服务端当前 revision */
  | 'push';

export interface Decision {
  action: ReconcileAction;
  /** 决策理由（只进 console.debug，给人排错用） */
  reason: string;
  /** action === 'push' 时应带的 baseRevision */
  baseRevision: number;
}

/**
 * 文本摘要：FNV-1a 32 位，两个种子拼成 16 位十六进制。
 * 只用来判断"本地文本变没变"，不是安全哈希，也不需要抗碰撞证明。
 */
export function hashText(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    a ^= c;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= c + i;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/**
 * 决定这一轮做什么。
 *
 * @param local  {raw: localStorage 里的文本（没有就是 null）, hash: 该文本的摘要}
 * @param remote {ok: 拉取成功没有, data: 服务端那一份（没有就是 null）}
 * @param anchor 本机会话锚（第一次来就是 null）
 */
export function decideReconcile(
  local: { raw: string | null; hash: string },
  remote: { ok: boolean; data: RemoteLike | null },
  anchor: Anchor | null,
): Decision {
  // 拉不到服务端：这一轮别动（本地是唯一真相源，等下一次变动再说）
  if (!remote.ok) return { action: 'noop', reason: 'remote-unavailable', baseRevision: anchor?.revision ?? 0 };

  // 服务端还没有这一份
  if (!remote.data) {
    return local.raw
      ? { action: 'push-first', reason: 'remote-empty-local-has', baseRevision: 0 }
      : { action: 'noop', reason: 'both-empty', baseRevision: 0 };
  }

  const rev = remote.data.revision;

  // 本机这一份没了（换浏览器 / 清了站点数据）：采纳服务端
  if (!local.raw) return { action: 'adopt', reason: 'local-empty', baseRevision: rev };

  // 已对齐：不空写
  if (anchor && anchor.revision === rev && anchor.hash === local.hash) {
    return { action: 'noop', reason: 'in-sync', baseRevision: rev };
  }

  // 本地自上次同步以来没动过，服务端前进了 → 另一台设备写的，采纳服务端
  if (anchor && anchor.hash === local.hash && anchor.revision !== rev) {
    return { action: 'adopt', reason: 'local-unchanged-remote-ahead', baseRevision: rev };
  }

  // 本地有（或可能有）新改动：本地优先，服务端覆盖前会留快照
  return { action: 'push', reason: anchor ? 'local-changed' : 'no-anchor', baseRevision: rev };
}
