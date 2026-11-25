/**
 * 同步层的运行状态：只在内存里，不落 localStorage、不上报、不发任何请求。
 *
 * 为什么单独立一份而不是从 `sync/index.ts` 导出：关闭同步 flag（`VITE_ANLEWO_SYNC` 未设）时
 * `index.ts` 根本不会被加载（红线 C10），而开发调试面板要能读这份状态、又要说明"没在同步"。
 * 这个文件没有副作用，两边各自 import 都不会把同步层拉起来。
 */

/** 推送的硬上限：与 `db/V3__anlewo_payload_limit.sql` 的 CHECK、服务端 `MAX_PAYLOAD_BYTES` 一致 */
export const SYNC_PUSH_LIMIT = 1048576;

export interface SyncState {
  /** 同步层有没有真的跑起来（注册成功、订阅挂上）；flag 关着时永远是 false */
  started: boolean;
  /** 最近一次推送成功的时间（ms）；null = 这次会话还没推成功过 */
  lastPushAt: number | null;
  /** 最近一次尝试推送的字节数（整包存档 JSON 的 UTF-8 长度） */
  bytes: number;
  /** 上限（见 SYNC_PUSH_LIMIT），给面板直接算余量 */
  limit: number;
  /** 存档超过上限、已经停推：本地完好，只是不再上传 */
  overLimit: boolean;
  /** 最近一次没推成的原因：`too_large` / `unserializable` / `conflict` / 服务端错误码 */
  lastError: string | null;
}

const state: SyncState = {
  started: false,
  lastPushAt: null,
  bytes: 0,
  limit: SYNC_PUSH_LIMIT,
  overLimit: false,
  lastError: null,
};

/** 读的人拿到的就是这一份对象：只读它的字段，别改 */
export const syncState = (): Readonly<SyncState> => state;

/** 由 `sync/index.ts` 在每次推送（成功、超限、失败）后更新 */
export function setSyncState(p: Partial<SyncState>): void {
  Object.assign(state, p);
}
