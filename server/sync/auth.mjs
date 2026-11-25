/**
 * 凭证：解析、比对、以及"用 token 换 user.id"的那一步。
 *
 * 两种凭证（契约 C1：uid 只作标识，凭证另算）：
 *   1) 匿名期：客户端生成的 sync_key（32 字节随机 → base64url，43 字符）。库里只有 sha256。
 *   2) 统一身份：OIDC access token（JWT 形状，含两个 '.'）。只有 IDENTITY_ENABLED=1 且
 *      /userinfo 认过之后才写库，所以写进去的 identity_uid 必是真实存在的 users.user_id。
 *
 * 这个文件不碰数据库、不打印任何凭证值。
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** sync_key 的形状：32 字节 base64url，43 字符，无填充（与前端 id.ts 的 newSyncKey 一致） */
const SYNC_KEY_RE = /^[A-Za-z0-9_-]{43}$/;

/** 是不是一个 uuid（大小写都收，统一小写处理交给调用方） */
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/** identity 的 /userinfo 把用户 ID 序列化为 user_id；兼容旧字段 id。 */
export function userIdOf(user) {
  if (!user || typeof user !== 'object') return null;
  const id = typeof user.user_id === 'string' ? user.user_id : user.id;
  return typeof id === 'string' && id ? id : null;
}

/** sha256 的小写十六进制（凭证、pieceKey 都用它做单向摘要） */
export const sha256Hex = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

/**
 * 解析 authorization 头。
 * @returns {{kind:'sync_key'|'oidc', value:string}|null} 形状不对一律 null
 */
export function parseAuthorization(header) {
  if (typeof header !== 'string') return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) return null;
  const value = m[1];
  // 43 字符的 sync_key 与常见 JWT 都落在这个区间；太短太长都不看
  if (value.length < 16 || value.length > 4096) return null;
  let dots = 0;
  for (const ch of value) if (ch === '.') dots += 1;
  if (dots === 2) return { kind: 'oidc', value };
  // sync_key 的形状是固定的：32 字节 base64url（43 字符，无填充）。不认别的形状，
  // 免得"16 个字符也算合法凭证"这种与客户端约定不一致的口子（P2-3）。
  if (!SYNC_KEY_RE.test(value)) return null;
  return { kind: 'sync_key', value };
}

/**
 * 凭证对不对：定长比较，不因长度/内容差异泄漏时序信息。
 * @param {string} credential 明文凭证
 * @param {string} keyHashHex 库里存的 sha256 十六进制
 */
export function keyMatches(credential, keyHashHex) {
  if (typeof keyHashHex !== 'string' || keyHashHex.length !== 64) return false;
  const hex = sha256Hex(credential);
  const a = Buffer.from(hex, 'utf8');
  const b = Buffer.from(keyHashHex.toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * 拿 access token 去统一身份换 user.id（参照 liuyao 的 /api/auth/profile：15s 超时、失败降级）。
 * 失败不抛：返回 {ok:false}，调用方据此**不写库**、保持匿名态（C11）。
 *
 * @param {{issuer:string, accessToken:string, fetchImpl?:Function, timeoutMs?:number}} p
 * @returns {Promise<{ok:true, userId:string, raw:any}|{ok:false, reason:string}>}
 */
export async function fetchUserInfo({ issuer, accessToken, fetchImpl = globalThis.fetch, timeoutMs = 15000 }) {
  if (!issuer) return { ok: false, reason: 'no_issuer' };
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no_fetch' };
  let url;
  try {
    url = new URL(`${issuer.replace(/\/+$/, '')}/userinfo`);
  } catch {
    return { ok: false, reason: 'bad_issuer' };
  }

  const signal = makeTimeoutSignal(timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      cache: 'no-store',
      signal,
    });
  } catch (err) {
    return { ok: false, reason: err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'timeout' : 'network' };
  }
  if (!res || !res.ok) return { ok: false, reason: `status_${res?.status ?? 0}` };

  let body;
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: 'bad_json' };
  }
  const id = userIdOf(body && typeof body === 'object' ? body.user : null);
  if (!isUuid(id)) return { ok: false, reason: 'bad_user_id' };
  return { ok: true, userId: String(id).toLowerCase(), raw: body };
}

/** AbortSignal.timeout 的兜底（老一点的运行时没有） */
export function makeTimeoutSignal(ms) {
  const S = globalThis.AbortSignal;
  if (S && typeof S.timeout === 'function') {
    try {
      return S.timeout(ms);
    } catch {
      /* 落到下面自己造 */
    }
  }
  if (typeof AbortController === 'function') {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    if (typeof t?.unref === 'function') t.unref();
    return c.signal;
  }
  return undefined;
}
