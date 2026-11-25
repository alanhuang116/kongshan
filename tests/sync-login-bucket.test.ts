/**
 * `/identity/login` 的登录预算：这条路径每次都带着服务端客户端密钥去敲身份服务，
 * 未登录流量不能无限重放。这里起一个真的 HTTP 服务，确认第 LOGIN_PER_MIN+1 次只回 429，
 * 而且**没有**再往身份服务发请求（限流在代理前面，不是代理之后再补救）。
 */
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/sync/http.mjs';

const LOGIN_PER_MIN = 3;

const config = {
  identityEnabled: true,
  identityIssuer: 'https://identity.example',
  identityClientId: 'anlewo',
  identityClientSecret: 'secret',
  ssoCookieDomain: '',
  ssoCookieSecure: false,
  bodyLimit: 4096,
  // 全局两档放到很大，确保先撞到的是登录那一档
  ratePerMin: 100000,
  rateIpPerMin: 1000000,
  linkPerMin: 25,
  loginPerMin: LOGIN_PER_MIN,
};

function memoryLimiter() {
  const counts = new Map<string, number>();
  return {
    kind: 'memory',
    async incrWithTtl(key: string) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    },
    async decr(key: string) {
      counts.set(key, Math.max(0, (counts.get(key) ?? 0) - 1));
      return counts.get(key) ?? 0;
    },
  };
}

const silent = { log() {}, warn() {}, error() {} };

describe('/identity/login 的限流', () => {
  it('超过 LOGIN_PER_MIN 之后回 429，且不再带着客户端密钥去敲身份服务', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 }));
    const app = createApp({ config, pool: {}, limiter: memoryLimiter(), fetchImpl, log: silent });
    const server = createServer(app.handle);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as { port: number };

    try {
      const statuses: number[] = [];
      for (let i = 0; i <= LOGIN_PER_MIN; i += 1) {
        const res = await fetch(`http://127.0.0.1:${port}/api/anlewo/identity/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'me@example.com', password: 'abcd1234' }),
        });
        statuses.push(res.status);
        await res.text();
      }
      expect(statuses.slice(0, LOGIN_PER_MIN)).toEqual(Array(LOGIN_PER_MIN).fill(401));
      expect(statuses[LOGIN_PER_MIN]).toBe(429);
      expect(fetchImpl).toHaveBeenCalledTimes(LOGIN_PER_MIN);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
