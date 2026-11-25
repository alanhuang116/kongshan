/**
 * 配置：全部从环境变量来。
 *
 * 纪律：这个文件里没有任何口令，也不会把配置值打出去——
 * 连接串只存在于部署时注入的环境里，或者未进版本库的 server/sync/.env.local（见 .gitignore 的 .env*）。
 *
 * 同目录的 .env.local 会被自动读（已存在的环境变量不覆盖），这样 `node index.mjs` 本机直接能跑；
 * 线上由 systemd 的 EnvironmentFile= 注入，同样的键名。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** 两个正式的站：GitHub Pages 与测试机。localhost/127.0.0.1 的任意端口总是放行（见 originAllowed） */
export const DEFAULT_CORS = Object.freeze([
  'https://alanhuang116.github.io',
  'https://kongshan.169-58-39-104.nip.io',
]);

/** 配置有问题：启动时抛出，进程直接退出（不带着半套配置跑） */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function int(v, fallback, min, max) {
  const n = Number.parseInt(str(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/**
 * 读一份 .env 格式的文本（KEY=VALUE、# 注释、可有成对引号）。
 * 只做够用的事：不做变量展开，也不做多行值。
 */
export function parseDotEnv(text) {
  const out = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
    let v = t.slice(i + 1).trim();
    if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

/**
 * 把同目录的 .env.local 读进 env（已存在的键不覆盖，所以真实环境变量永远优先）。
 * ANLEWO_SYNC_NO_DOTENV=1 可关掉（冒烟、测试里想用纯环境变量时）。
 */
export function loadDotEnv(env = process.env, file = join(HERE, '.env.local')) {
  if (str(env.ANLEWO_SYNC_NO_DOTENV) === '1') return env;
  try {
    if (!existsSync(file)) return env;
    const kv = parseDotEnv(readFileSync(file, 'utf8'));
    for (const [k, v] of Object.entries(kv)) if (env[k] === undefined) env[k] = v;
  } catch {
    // 读不到就算了：还有真实环境变量这条路，不该因为少一个文件起不来
  }
  return env;
}

function corsList(raw) {
  const given = str(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // 显式给的与默认的两个正式站求并集：部署时只加不减，免得漏一个来源就整站同步不了
  return Object.freeze([...new Set([...DEFAULT_CORS, ...given])]);
}

/**
 * 读配置。缺关键项（DATABASE_URL / 矛盾项）直接抛 ConfigError。
 * @param {NodeJS.ProcessEnv|Record<string,string|undefined>} env
 * @param {{dotenv?: boolean}} opts
 */
export function loadConfig(env = process.env, { dotenv = true } = {}) {
  if (dotenv) loadDotEnv(env);

  const databaseUrl = str(env.DATABASE_URL);
  if (!databaseUrl) {
    throw new ConfigError(
      'DATABASE_URL 未设置：照 server/sync/.env.example 写 server/sync/.env.local，或由 systemd 的 EnvironmentFile 注入',
    );
  }
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new ConfigError('DATABASE_URL 必须是 postgres:// 或 postgresql:// 开头的连接串');
  }

  const redisUrl = str(env.REDIS_URL);
  if (redisUrl && !/^rediss?:\/\//i.test(redisUrl)) {
    throw new ConfigError('REDIS_URL 必须是 redis:// 或 rediss:// 开头的连接串（留空则用内存实现）');
  }

  const identityIssuer = str(env.IDENTITY_ISSUER).replace(/\/+$/, '');
  if (identityIssuer && !/^https?:\/\//i.test(identityIssuer)) {
    throw new ConfigError('IDENTITY_ISSUER 必须是 http(s):// 开头的 issuer（本期可留空＝身份对接关闭）');
  }
  const identityEnabled = str(env.IDENTITY_ENABLED) === '1';
  if (identityEnabled && !identityIssuer) {
    throw new ConfigError('IDENTITY_ENABLED=1 时必须同时给 IDENTITY_ISSUER（不能写死 localhost）');
  }

  const ratePerMin = int(env.RATE_PER_MIN, 120, 1, 100000);

  return Object.freeze({
    databaseUrl,
    redisUrl,
    port: int(env.PORT, 3830, 1, 65535),
    host: str(env.HOST) || '127.0.0.1',
    cors: corsList(env.ANLEWO_CORS),
    identityIssuer,
    identityEnabled,
    // 请求体上限要**大于** payload 上限（4MB）：JSON 转义还会胖一圈，留到 6MB
    bodyLimit: int(env.BODY_LIMIT, 6291456, 1024, 8 * 1024 * 1024),
    // 每个 uid 每分钟（公平那一维：一台设备正常每分钟 12 次上下）
    ratePerMin,
    // 每个来源地址每分钟（兜底那一维）：覆盖十几台设备共用一个 NAT 出口，
    // 又挡得住"换 uid 刷"与"单 IP 无限建行"——**这一维绝不能带客户端可控的字符串**
    rateIpPerMin: int(env.IP_RATE_PER_MIN, Math.max(ratePerMin * 4, 240), 1, 1000000),
    // /link 的**建行**预算（不是请求预算）：只数真的新建出来的身份，
    // 已注册用户每次开页面的报到一次都不占——否则共享出口（学校/公司/CGNAT）里
    // 25 个陌生人打出的 401 就能让整个办公室一分钟内注册不上（那是可用性故障，不是限流）。
    linkPerMin: int(env.LINK_PER_MIN, 25, 1, 100000),
  });
}

/**
 * 来源放行没有：两个正式站按 origin 精确匹配；localhost / 127.0.0.1 / ::1 的任意端口总是放行
 * （开发时端口会变，不为此改配置）。
 */
export function originAllowed(origin, cors = DEFAULT_CORS) {
  if (typeof origin !== 'string' || !origin) return false;
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const h = u.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;
  return cors.includes(u.origin);
}
