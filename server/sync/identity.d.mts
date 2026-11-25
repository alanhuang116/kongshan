/**
 * `identity.mjs` 的手写类型。
 *
 * 它跑在 Node 侧（同步服务），仓库里没有 TS 版本；但 `tsc --noEmit` 会连测试一起检查，
 * 测试要 import 它，所以在这里给出形状。返回值一律是「成 / 没成」，从不抛。
 */
export const SSO_COOKIE: string;

export interface IdentityConfig {
  identityIssuer: string;
  identityClientId: string;
  identityClientSecret: string;
  ssoCookieDomain: string;
  ssoCookieSecure: boolean;
}

export interface IdentityFailure {
  ok: false;
  status: number;
  code: string;
}

export interface IdentityUser {
  id: string;
  name: string;
  email: string;
}

export interface IdentityCallOk {
  ok: true;
  status: number;
  body: any;
}

export function readCookie(header: string | undefined, name: string): string | null;
export function ssoCookie(config: IdentityConfig, value: string, maxAgeSeconds: number): string;
export function clearSsoCookie(config: IdentityConfig): string;
export function identityCall(
  config: IdentityConfig,
  path: string,
  payload?: unknown,
  opts?: { bearer?: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<IdentityCallOk | IdentityFailure>;
export function loginPassword(config: IdentityConfig, email: string, password: string, opts?: any): Promise<IdentityCallOk | IdentityFailure>;
export function loginCode(config: IdentityConfig, email: string, code: string, opts?: any): Promise<IdentityCallOk | IdentityFailure>;
export function signupEmail(
  config: IdentityConfig,
  input: { name: string; email: string; password: string; code: string },
  opts?: any,
): Promise<IdentityCallOk | IdentityFailure>;
export function sendEmailCode(config: IdentityConfig, kind: 'login' | 'signup', email: string, opts?: any): Promise<IdentityCallOk | IdentityFailure>;
export function userinfo(
  config: IdentityConfig,
  token: string,
  opts?: any,
): Promise<{ ok: true; status: number; user: IdentityUser } | IdentityFailure>;
export function mintSso(
  config: IdentityConfig,
  accessToken: string,
  opts?: any,
): Promise<{ ok: true; status: number; token: string; expiresIn: number } | IdentityFailure>;
export function explain(code: string | undefined, status: number): string;
