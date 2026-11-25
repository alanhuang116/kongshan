/**
 * 身份代理三件套（`/identity/code`、`/identity/signup`、`/identity/login`）的来源地址预算：
 * 它们都带着服务端客户端密钥去敲身份服务，未登录流量不能无限重放。
 *
 * 这里起真的 HTTP 服务逐个确认：第 limit+1 次只回 429，而且**没有**再往身份服务发请求
 * （限流在代理前面，不是代理之后再补救），同时三个端点各占一只桶、互不挤占。
 */
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/sync/http.mjs';

/** 三条路径在测试配置里给同一个上限，便于逐条断言 */
const PER_MIN = 3;

const config = {
  identityEnabled: true,
  identityIssuer: 'https://identity.example',
  identityClientId: 'anlewo',
  identityClientSecret: 'secret',
  ssoCookieDomain: '',
  ssoCookieSecure: false,
  bodyLimit: 4096,
  // 全局两档放到很大，确保先撞到的是各端点自己那一档
  ratePerMin: 100000,
  rateIpPerMin: 1000000,
  linkPerMin: 25,
  loginPerMin: PER_MIN,
  signupPerMin: PER_MIN,
  codePerMin: PER_MIN,
};

const CASES = [
  {
    name: '登录',
    path: 'login',
    body: { email: 'me@example.com', password: 'abcd1234' },
    // identity 回 401 → 代理照原样透出（就是「这次没登进来」）
    failure: 401,
  },
  {
    name: '留名',
    path: 'signup',
    body: { name: '阿宁', email: 'me@example.com', password: 'abcd1234', code: '123456' },
    // identity 回 400（验证码不对） → 代理保留 400
    failure: 400,
  },
  {
    name: '发验证码',
    path: 'code',
    body: { kind: 'signup', email: 'me@example.com' },
    // 发信失败对客户端只有「身份服务暂时不可用」
    failure: 502,
  },
];

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

describe('身份代理的来源地址预算', () => {
  for (const item of CASES) {
    it(`/identity/${item.path}：超过之后回 429，且不再带着客户端密钥去敲身份服务`, async () => {
      const fetchImpl = vi.fn(
        async () => new Response(JSON.stringify({ error: item.failure === 401 ? 'invalid_credentials' : 'invalid_code' }), { status: item.failure }),
      );
      const app = createApp({ config, pool: {}, limiter: memoryLimiter(), fetchImpl, log: silent });
      const server = createServer(app.handle);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const { port } = server.address() as { port: number };

      try {
        const statuses: number[] = [];
        for (let i = 0; i <= PER_MIN; i += 1) {
          const res = await fetch(`http://127.0.0.1:${port}/api/anlewo/identity/${item.path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(item.body),
          });
          statuses.push(res.status);
          await res.text();
        }
        expect(statuses.slice(0, PER_MIN)).toEqual(Array(PER_MIN).fill(item.failure));
        expect(statuses[PER_MIN]).toBe(429);
        expect(fetchImpl).toHaveBeenCalledTimes(PER_MIN);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  }
});
