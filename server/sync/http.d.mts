/**
 * `http.mjs` 的手写类型（只声明测试用到的入口）。
 *
 * 同 `identity.d.mts`：服务端跑的是 Node 侧的 .mjs，仓库里没有 TS 版本；
 * `tsc --noEmit` 会连 `tests/` 一起检查，所以测试 import 它时需要这份形状。
 */
export interface SyncLimiter {
  kind: string;
  incrWithTtl(key: string, ttlMs: number): Promise<number>;
  decr?(key: string): Promise<number>;
}

export function createApp(deps: {
  config: any;
  pool: any;
  limiter: SyncLimiter;
  fetchImpl?: typeof fetch;
  log?: { log?(...args: unknown[]): void; warn?(...args: unknown[]): void; error?(...args: unknown[]): void };
}): {
  handle: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>;
  routes: unknown[];
};
