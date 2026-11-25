/**
 * 统一身份（identity）客户端 + 跨站免登录用的 cookie 小工具。
 *
 * 为什么要服务端代理登录：identity 的 `/login`、`/signup/email`、`/login/email` 都要求
 * `ClientSecretBasic`（应用密钥），密钥只能留在服务端；浏览器里放不住。这里用 `anlewo`
 * 这个客户端去换令牌，**令牌不进前端**（前端只拿到「我是谁」）。
 *
 * 免登录（参考六爻的登录与 yiwen-server identity 的 SsoController）：
 *   1. 任一站点登录成功后，服务端拿自己的 access token 换一张 identity 签的长效 SSO 票据；
 *   2. 票据写进父域 cookie（`SSO_COOKIE_DOMAIN`，如 `.iwenxuai.com`），httpOnly；
 *   3. 别的站点读到同一枚 cookie，用 `/userinfo` 认人（票据带 `scope=openid`，账号停用立刻 401），
 *      要本地会话就用 `/sso/exchange` 换自己的令牌。
 *
 * 这个文件不发 HTTP、不碰数据库，纯拼请求与 cookie 字符串，方便单测。
 */
import { makeTimeoutSignal } from './auth.mjs';

/** 父域 cookie 名：六爻、知己、安乐窝共用这一枚 */
export const SSO_COOKIE = 'yiwen_sso';

/** 服务端调 identity 的默认超时（发信那两条由调用方放宽） */
const TIMEOUT_MS = 8000;

/** 从 Cookie 头里取一枚（名字大小写敏感；同名的取第一个） */
export function readCookie(header, name) {
  if (typeof header !== 'string' || !header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

/**
 * 拼 Set-Cookie。域名留空＝host-only（本地 / IP 访问时就是这样）；
 * 生产给 `.iwenxuai.com` 这枚 cookie 才能在六爻、知己、安乐窝之间共享。
 */
export function ssoCookie(config, value, maxAgeSeconds) {
  const parts = [`${SSO_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (config.ssoCookieDomain) parts.push(`Domain=${config.ssoCookieDomain}`);
  if (config.ssoCookieSecure) parts.push('Secure');
  parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  return parts.join('; ');
}

/** 清掉（Max-Age=0 且值留空）；Domain 必须与写入时一致，否则删不掉 */
export function clearSsoCookie(config) {
  return ssoCookie(config, '', 0);
}

function basic(config) {
  const raw = `${config.identityClientId}:${config.identityClientSecret}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

/**
 * 调 identity。永不抛：网络/超时/坏 JSON 都折成 {ok:false, status, code}，
 * 调用方据此回统一的错误体（不把上游细节透给客户端）。
 *
 * @returns {Promise<{ok:true, status:number, body:any}|{ok:false, status:number, code:string}>}
 */
export async function identityCall(config, path, payload, opts = {}) {
  const { bearer, timeoutMs = TIMEOUT_MS, fetchImpl = globalThis.fetch } = opts;
  if (typeof fetchImpl !== 'function') return { ok: false, status: 0, code: 'no_fetch' };
  let url;
  try {
    url = new URL(`${config.identityIssuer}${path}`);
  } catch {
    return { ok: false, status: 0, code: 'bad_issuer' };
  }
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: bearer ? `Bearer ${bearer}` : basic(config),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload ?? {}),
      cache: 'no-store',
      signal: makeTimeoutSignal(timeoutMs),
    });
  } catch (err) {
    const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return { ok: false, status: 0, code: timeout ? 'timeout' : 'network' };
  }
  let body = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const code = body && typeof body === 'object' && typeof body.error === 'string' ? body.error : `status_${res.status}`;
    return { ok: false, status: res.status, code };
  }
  return { ok: true, status: res.status, body };
}

/** 邮箱 + 密码登录 */
export function loginPassword(config, email, password, opts) {
  return identityCall(config, '/login', { email, password }, opts);
}

/** 邮箱 + 验证码登录 */
export function loginCode(config, email, code, opts) {
  return identityCall(config, '/login/email', { email, code }, opts);
}

/** 留名（注册）：称呼 + 邮箱 + 密码 + 验证码 */
export function signupEmail(config, { name, email, password, code }, opts) {
  return identityCall(config, '/signup/email', { name, email, password, code }, opts);
}

/** 发验证码：kind=login 走 /login/email/code，kind=signup 走 /signup/email/code */
export function sendEmailCode(config, kind, email, opts) {
  const path = kind === 'signup' ? '/signup/email/code' : '/login/email/code';
  return identityCall(config, path, { email }, { timeoutMs: 15000, ...(opts ?? {}) });
}

/** 用 SSO 票据（或 access token）认人；返回 {user} 或失败 */
export async function userinfo(config, token, opts = {}) {
  const { timeoutMs = TIMEOUT_MS, fetchImpl = globalThis.fetch } = opts;
  let url;
  try {
    url = new URL(`${config.identityIssuer}/userinfo`);
  } catch {
    return { ok: false, status: 0, code: 'bad_issuer' };
  }
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      cache: 'no-store',
      signal: makeTimeoutSignal(timeoutMs),
    });
  } catch (err) {
    const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return { ok: false, status: 0, code: timeout ? 'timeout' : 'network' };
  }
  let body = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok || !body || typeof body !== 'object') return { ok: false, status: res.status, code: 'invalid_token' };
  const u = body.user && typeof body.user === 'object' ? body.user : null;
  const id = u && typeof u.id === 'string' ? u.id : null;
  if (!id) return { ok: false, status: res.status, code: 'invalid_token' };
  return {
    ok: true,
    status: res.status,
    user: {
      id,
      name: typeof u.name === 'string' ? u.name : '',
      email: typeof u.email === 'string' ? u.email : '',
    },
  };
}

/** 把一次登录换来的 access token 换成一张长效 SSO 票据 */
export async function mintSso(config, accessToken, opts) {
  const out = await identityCall(config, '/sso/token', {}, { ...(opts ?? {}), bearer: accessToken });
  if (!out.ok) return out;
  const token = out.body && typeof out.body.token === 'string' ? out.body.token : '';
  const expiresIn = out.body && Number.isFinite(out.body.expires_in) ? Number(out.body.expires_in) : 0;
  if (!token || expiresIn <= 0) return { ok: false, status: 0, code: 'bad_sso_response' };
  return { ok: true, status: out.status, token, expiresIn };
}

