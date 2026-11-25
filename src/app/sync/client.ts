/**
 * 与同步服务说话的薄客户端。
 *
 * 纪律（C9）：这里**不抛异常给界面**、不改任何界面状态、不写 localStorage。
 * 每次失败只 console.debug 一行，然后当作"这一回没同步上"——本地那边照旧。
 *
 * 超时：每个请求 8s（服务端自己 5s 语句超时，客户端留点余量；断网时不至于挂着）。
 */

/** 服务端那一份存档 */
export interface RemoteSave {
  revision: number;
  payload: unknown;
  updatedAt: string;
}

/** 身份（注册结果） */
export interface LinkResult {
  uid: string;
  status: 'anonymous' | 'bound' | 'merged' | 'retired';
  boundIdentity?: string | null;
}

/** 一般的失败：这一回没成，但没什么要商量的（网络、401、503…） */
type Fail = { ok: false; status: number; code: string; conflict?: false };
export type RegisterResult = { ok: true; data: LinkResult } | Fail;
export type PullResult = { ok: true; data: RemoteSave | null } | Fail;
/**
 * 推存档的结果。409 那一支也带 status/code（值固定），这样调用方
 * `if (!r.ok) { r.status }` 这种最自然的写法在类型上也成立，不必先分辨是哪一支。
 */
export type PushResult =
  | { ok: true; revision: number }
  | { ok: false; conflict: true; status: 409; code: 'conflict'; revision: number; payload: unknown; updatedAt: string }
  | Fail;
export type InkResult = { ok: true; pieceHash: string; updatedAt: string } | Fail;

const TIMEOUT_MS = 8000;

/** AbortSignal.timeout 不可用时自己造一个（老运行时） */
function timeoutSignal(ms: number): AbortSignal | undefined {
  const S = globalThis.AbortSignal as (typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }) | undefined;
  if (S && typeof S.timeout === 'function') {
    try {
      return S.timeout(ms);
    } catch {
      // 落到下面
    }
  }
  if (typeof AbortController === 'function') {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  }
  return undefined;
}

interface CallResult {
  status: number;
  body: unknown;
}

export interface SyncClientOptions {
  /** 端点前缀：空串＝同源 /api/anlewo；也可以给完整 http(s)://host/api/anlewo */
  base: string;
  uid: string;
  credential: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class SyncClient {
  private readonly base: string;
  private readonly uid: string;
  private readonly credential: string;
  private readonly fetchImpl: typeof fetch | null;
  private readonly timeoutMs: number;

  constructor(opts: SyncClientOptions) {
    this.base = (opts.base || '/api/anlewo').replace(/\/+$/, '');
    this.uid = opts.uid;
    this.credential = opts.credential;
    // 绑定到 globalThis：fetch 存进实例后再以 this.fetchImpl(...) 调用会触发 Illegal invocation
    this.fetchImpl = opts.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this.timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  }

  /** 一次请求：把状态码与解析后的 JSON 交回去，其余一概不管（不抛） */
  private async call(path: string, init: { method: string; body?: unknown; headers?: Record<string, string> }): Promise<CallResult> {
    if (!this.fetchImpl) return { status: 0, body: { error: 'no_fetch' } };
    const headers: Record<string, string> = {
      'x-anlewo-uid': this.uid,
      authorization: `Bearer ${this.credential}`,
      ...(init.headers ?? {}),
    };
    let payload: string | undefined;
    if (init.body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(init.body);
    }
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method: init.method,
      headers,
      body: payload,
      cache: 'no-store',
      credentials: 'omit',
      signal: timeoutSignal(this.timeoutMs),
    });
    let text = '';
    try {
      text = await res.text();
    } catch {
      text = '';
    }
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: res.status, body };
  }

  /** 统一收口：网络层的意外都变成本地能认的 fail，界面不受影响 */
  private async safe(
    path: string,
    init: { method: string; body?: unknown; headers?: Record<string, string> },
    what: string,
  ): Promise<CallResult | Fail> {
    try {
      return await this.call(path, init);
    } catch (err) {
      console.debug(`[anlewo-sync] ${what}：请求没发出去/没回来`, err);
      return { ok: false, status: 0, code: 'network_down' };
    }
  }

  /** POST /link：匿名注册（或确认还是我）。已注册且凭证不对会 401 */
  async register(device?: { deviceId?: string; kind?: string; label?: string }): Promise<RegisterResult> {
    const out = await this.safe('/link', { method: 'POST', body: device ?? {} }, '注册');
    if ('ok' in out) return out;
    const body = out.body as Partial<LinkResult> | null;
    if (out.status === 200 && body && typeof body.uid === 'string') {
      return {
        ok: true,
        data: {
          uid: body.uid,
          status: (body.status ?? 'anonymous') as LinkResult['status'],
          boundIdentity: body.boundIdentity ?? null,
        },
      };
    }
    const code = (out.body as { error?: string } | null)?.error ?? `http_${out.status}`;
    console.debug('[anlewo-sync] 注册失败', out.status, code);
    return { ok: false, status: out.status, code };
  }

  /** GET /save：204 表示服务端还没有这一份 */
  async pullSave(): Promise<PullResult> {
    const out = await this.safe('/save', { method: 'GET' }, '拉存档');
    if ('ok' in out) return out;
    if (out.status === 204) return { ok: true, data: null };
    const body = out.body as Partial<RemoteSave> | null;
    if (out.status === 200 && body && typeof body.revision === 'number') {
      return {
        ok: true,
        data: { revision: body.revision, payload: body.payload ?? null, updatedAt: String(body.updatedAt ?? '') },
      };
    }
    const code = (out.body as { error?: string } | null)?.error ?? `http_${out.status}`;
    console.debug('[anlewo-sync] 拉存档失败', out.status, code);
    return { ok: false, status: out.status, code };
  }

  /**
   * PUT /save：整包替换 + revision 比对。409 是"服务端有别的版本"，不是错误，是岔口。
   * `snapshotBefore`：本次要覆盖服务端已有的一版时让服务端**先在同一个事务里留快照**（C4 的"保底不丢"）。
   * 只在首轮对账/冲突重推时置 true；常规 5 秒防抖推送不置，免得每次改动都堆一行快照。
   */
  async pushSave(
    payload: unknown,
    baseRevision: number,
    opts: { clientId?: string; snapshotBefore?: boolean } = {},
  ): Promise<PushResult> {
    const body: Record<string, unknown> = { payload, baseRevision };
    if (opts.clientId) body.clientId = opts.clientId;
    if (opts.snapshotBefore) body.snapshotBefore = true;
    const out = await this.safe('/save', { method: 'PUT', body }, '推存档');
    if ('ok' in out) return out;

    if (out.status === 200) {
      const rev = (out.body as { revision?: unknown } | null)?.revision;
      if (typeof rev === 'number') return { ok: true, revision: rev };
    }
    if (out.status === 409) {
      const b = (out.body ?? {}) as { revision?: unknown; payload?: unknown; updatedAt?: unknown };
      return {
        ok: false,
        conflict: true,
        status: 409,
        code: 'conflict',
        revision: typeof b.revision === 'number' ? b.revision : 0,
        payload: b.payload ?? null,
        updatedAt: String(b.updatedAt ?? ''),
      };
    }
    const code = (out.body as { error?: string } | null)?.error ?? `http_${out.status}`;
    console.debug('[anlewo-sync] 推存档失败', out.status, code);
    return { ok: false, status: out.status, code };
  }

  /** POST /ink：一篇没写完的笔迹（chars 是定长数组，没写的位是空串） */
  async pushInk(pieceKey: string, chars: string[]): Promise<InkResult> {
    const out = await this.safe('/ink', { method: 'POST', body: { pieceKey, chars, charTotal: chars.length } }, '推笔迹');
    if ('ok' in out) return out;
    if (out.status === 200) {
      const b = (out.body ?? {}) as { pieceHash?: unknown; updatedAt?: unknown };
      if (typeof b.pieceHash === 'string') return { ok: true, pieceHash: b.pieceHash, updatedAt: String(b.updatedAt ?? '') };
    }
    const code = (out.body as { error?: string } | null)?.error ?? `http_${out.status}`;
    console.debug('[anlewo-sync] 推笔迹失败', out.status, code);
    return { ok: false, status: out.status, code };
  }

  /** GET /ink：只取索引（不含 chars） */
  async listInk(limit = 20): Promise<{ ok: true; items: Array<{ pieceHash: string; pieceKey: string; charTotal: number; updatedAt: string }> } | Fail> {
    const out = await this.safe(`/ink?limit=${limit}`, { method: 'GET' }, '拉笔迹列表');
    if ('ok' in out) return out;
    if (out.status === 200) {
      const items = (out.body as { items?: unknown } | null)?.items;
      return { ok: true, items: Array.isArray(items) ? (items as Array<{ pieceHash: string; pieceKey: string; charTotal: number; updatedAt: string }>) : [] };
    }
    const code = (out.body as { error?: string } | null)?.error ?? `http_${out.status}`;
    return { ok: false, status: out.status, code };
  }
}
