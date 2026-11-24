// 客户端只做一件事：把 HTTP 说什么翻译成"成 / 冲突 / 没成"，绝不抛给界面。这里用注入的 fetch 逐条钉住。
import { describe, expect, it, vi } from 'vitest';
import { SyncClient } from '../src/app/sync/client';

const UID = '11111111-1111-4111-8111-111111111111';
const KEY = 'k'.repeat(43);

/** 造一个只够 client.ts 用的 Response */
const reply = (status: number, body?: unknown) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  }) as unknown as Response;

type Call = { url: string; init: RequestInit };
const make = (fn: (status: number, body?: unknown) => Response, calls: Call[] = []) =>
  new SyncClient({
    base: '/api/anlewo',
    uid: UID,
    credential: KEY,
    timeoutMs: 1000,
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const body = (init.body as string | undefined) ? JSON.parse(init.body as string) : undefined;
      return fn(statusFor(url, init, body), bodyFor(url, init, body));
    }) as unknown as typeof fetch,
  });

/** 下面两个小函数让每个用例只写"我期待什么回应" */
let plan: (url: string, init: RequestInit, body: unknown) => { status: number; body?: unknown } = () => ({ status: 500 });
const statusFor = (u: string, i: RequestInit, b: unknown) => plan(u, i, b).status;
const bodyFor = (u: string, i: RequestInit, b: unknown) => plan(u, i, b).body;
const client = (p: typeof plan, calls: Call[] = []) => {
  plan = p;
  return make(reply, calls);
};

describe('SyncClient', () => {
  it('注册成功：带回 uid/status', async () => {
    const c = client(() => ({ status: 200, body: { uid: UID, status: 'anonymous', boundIdentity: null } }));
    const r = await c.register();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.uid).toBe(UID);
  });

  it('注册 401：不重试、不抛，只报 bad_credential', async () => {
    const c = client(() => ({ status: 401, body: { error: 'bad_credential' } }));
    const r = await c.register();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.code).toBe('bad_credential');
    }
  });

  it('拉存档 204：当作"服务端还没有"', async () => {
    const c = client(() => ({ status: 204 }));
    const r = await c.pullSave();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBeNull();
  });

  it('拉存档 200：给出 revision 与 payload', async () => {
    const c = client(() => ({ status: 200, body: { revision: 5, payload: { v: 1 }, updatedAt: '2026-11-24T00:00:00.000Z' } }));
    const r = await c.pullSave();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.revision).toBe(5);
  });

  it('推存档 200：给新 revision', async () => {
    const c = client(() => ({ status: 200, body: { revision: 6 } }));
    const r = await c.pushSave({ v: 1 }, 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.revision).toBe(6);
  });

  it('推存档 409：是岔口不是错误，带回服务端那一份', async () => {
    const c = client(() => ({ status: 409, body: { error: 'conflict', revision: 9, payload: { v: 1, visits: 9 }, updatedAt: 'x' } }));
    const r = await c.pushSave({ v: 1, visits: 1 }, 5);
    expect(r.ok).toBe(false);
    if (!r.ok && r.conflict) {
      expect(r.revision).toBe(9);
      expect(r.payload).toEqual({ v: 1, visits: 9 });
    }
  });

  it('请求没发出去（断网）：status 0、network_down，绝不抛', async () => {
    const c = new SyncClient({
      base: '/api/anlewo',
      uid: UID,
      credential: KEY,
      timeoutMs: 1000,
      fetchImpl: (async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch,
    });
    const r = await c.pushSave({ v: 1 }, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(0);
      expect(r.code).toBe('network_down');
    }
  });

  it('请求头带 uid 与凭证，且 snapshotBefore 只在要求时出现', async () => {
    const calls: Call[] = [];
    const c = client(() => ({ status: 200, body: { revision: 2 } }), calls);
    await c.pushSave({ v: 1 }, 1);
    await c.pushSave({ v: 1 }, 2, { snapshotBefore: true });
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['x-anlewo-uid']).toBe(UID);
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(calls[0].init.body)).snapshotBefore).toBeUndefined();
    expect(JSON.parse(String(calls[1].init.body)).snapshotBefore).toBe(true);
  });

  it('推笔迹 200：带回 pieceHash', async () => {
    const c = client(() => ({ status: 200, body: { pieceHash: 'a'.repeat(64), updatedAt: 'x' } }));
    const r = await c.pushInk('一篇字', ['一', '', '二']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pieceHash).toBe('a'.repeat(64));
  });

  it('笔迹列表不带 chars', async () => {
    const c = client(() => ({ status: 200, body: { items: [{ pieceHash: 'a'.repeat(64), pieceKey: 'k', charTotal: 2, updatedAt: 'x' }] } }));
    const r = await c.listInk();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items[0]).not.toHaveProperty('chars');
  });
});

describe('超时', () => {
  it('AbortSignal 被触发时不抛，算 network_down', async () => {
    const c = new SyncClient({
      base: '/api/anlewo',
      uid: UID,
      credential: KEY,
      timeoutMs: 10,
      fetchImpl: ((_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })) as unknown as typeof fetch,
    });
    const r = await c.pullSave();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(0);
      expect(r.code).toBe('network_down');
    }
  });
});
