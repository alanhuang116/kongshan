import { describe, expect, it, vi } from 'vitest';
import {
  SSO_COOKIE,
  clearSsoCookie,
  loginPassword,
  mintSso,
  readCookie,
  ssoCookie,
  userinfo,
} from '../server/sync/identity.mjs';

const base = {
  identityIssuer: 'https://identity.example',
  identityClientId: 'anlewo',
  identityClientSecret: 'secret',
  ssoCookieDomain: '',
  ssoCookieSecure: false,
};

describe('SSO cookie', () => {
  it('正式配父域时带 Domain/Secure，本地不带', () => {
    const flat = ssoCookie(base, 'ticket', 60);
    expect(flat).toContain(`${SSO_COOKIE}=ticket`);
    expect(flat).toContain('HttpOnly');
    expect(flat).toContain('SameSite=Lax');
    expect(flat).toContain('Max-Age=60');
    expect(flat).not.toContain('Domain=');
    expect(flat).not.toContain('Secure');

    const shared = ssoCookie({ ...base, ssoCookieDomain: '.iwenxuai.com', ssoCookieSecure: true }, 'ticket', 60);
    expect(shared).toContain('Domain=.iwenxuai.com');
    expect(shared).toContain('Secure');
  });

  it('清除用 Max-Age=0 且保留同一个 Domain', () => {
    const gone = clearSsoCookie({ ...base, ssoCookieDomain: '.iwenxuai.com', ssoCookieSecure: true });
    expect(gone).toContain(`${SSO_COOKIE}=;`);
    expect(gone).toContain('Max-Age=0');
    expect(gone).toContain('Domain=.iwenxuai.com');
  });

  it('能从那串 Cookie 头里取出票据', () => {
    expect(readCookie('a=1; yiwen_sso=abc.def; b=2', SSO_COOKIE)).toBe('abc.def');
    expect(readCookie('a=1', SSO_COOKIE)).toBeNull();
    expect(readCookie(undefined, SSO_COOKIE)).toBeNull();
  });
});

describe('identity 调用', () => {
  it('登录用 Basic 客户端认证，不把密码放查询串', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: 'a', user: { user_id: 'u' } }), { status: 200 }));
    const out = await loginPassword(base, 'me@example.com', 'abcd1234', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('https://identity.example/login');
    expect(init.method).toBe('POST');
    expect(String((init.headers as Record<string, string>).authorization)).toMatch(/^Basic /);
    // 密码走 JSON 体、不进查询串（也就不会进访问日志）
    expect(String(url)).not.toContain('abcd1234');
    expect(String(url)).not.toContain('password');
    expect(JSON.parse(String(init.body))).toMatchObject({ email: 'me@example.com', password: 'abcd1234' });
  });

  it('mintSso 只认带 token 与 expires_in 的响应', async () => {
    const good = vi.fn(async () => new Response(JSON.stringify({ token: 'sso', expires_in: 2592000 }), { status: 200 }));
    const ok = await mintSso(base, 'access', { fetchImpl: good as unknown as typeof fetch });
    expect(ok).toEqual({ ok: true, status: 200, token: 'sso', expiresIn: 2592000 });

    const bad = vi.fn(async () => new Response(JSON.stringify({ token: '' }), { status: 200 }));
    const out = await mintSso(base, 'access', { fetchImpl: bad as unknown as typeof fetch });
    expect(out.ok).toBe(false);
  });

  it('userinfo 401 折成 invalid_token，不抛', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 }));
    const out = await userinfo(base, 'stale', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out.ok).toBe(false);
  });

  it('网络不通也只回一句话', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline'); });
    const out = await userinfo(base, 'x', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out.ok).toBe(false);
    expect((out as { code?: string }).code).toBe('network');
  });
});
