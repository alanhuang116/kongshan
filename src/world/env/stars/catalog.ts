/**
 * 星表与星官：把 src/data/stars.ts、src/data/xingguan.ts 里压紧的数据解开，备好查找用的表。只有数，不碰画法。
 *
 *   loadStars()  —— 每颗星的方向（J2000 赤道坐标的单位向量）、星等、色指数；按星等由亮到暗排。
 *   loadSky()    —— 星表 + 星官（名、所属的垣或宿、星、连线、星官的中心）、星名、二十八宿的距星、北斗。
 *   nearest()    —— 给一个方向（J2000），找附近最显眼的那颗星。
 */
import { STAR_DATA, STAR_LIMIT, STAR_N } from '../../../data/stars';
import { DIPPER_STARS, JU_XING, REGIONS, STAR_NAMES, XINGGUAN } from '../../../data/xingguan';

export interface Stars { n: number; limit: number; dir: Float32Array; mag: Float32Array; bv: Float32Array }
export interface Asterism {
  i: number; name: string;
  /** 所属区：REGIONS 的序号（0 紫微垣 1 太微垣 2 天市垣 3… 角宿起的二十八宿） */
  region: number;
  stars: number[];
  /** 连线：两两一段的星序号 */
  segs: number[];
  /** 星官的中心（J2000 单位向量）与半径（弧度，中心到最远那颗星） */
  center: [number, number, number]; radius: number;
}
export interface SkyData {
  stars: Stars; asterisms: Asterism[]; regions: string[];
  /** 星 → 它所在的星官（可能不止一个） */
  byStar: Map<number, number[]>;
  /** 星名（织女一、角宿增一；没有的是 null） */
  starName(i: number): string | null;
  /** 二十八宿各宿的距星、北斗七星 + 北极星 */
  ju: number[]; dipper: number[];
  /** 名字 → 星官 */
  find(name: string): Asterism | null;
}

const b64 = (s: string): Uint8Array => {
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};

let starsCache: Stars | null = null;
export function loadStars(): Stars {
  if (starsCache) return starsCache;
  const u = b64(STAR_DATA), dv = new DataView(u.buffer), n = STAR_N;
  const dir = new Float32Array(n * 3), mag = new Float32Array(n), bv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ra = (dv.getUint16(i * 6, true) / 65536) * Math.PI * 2, de = (dv.getUint16(i * 6 + 2, true) / 65535 - 0.5) * Math.PI;
    dir[i * 3] = Math.cos(de) * Math.cos(ra); dir[i * 3 + 1] = Math.cos(de) * Math.sin(ra); dir[i * 3 + 2] = Math.sin(de);
    mag[i] = dv.getUint8(i * 6 + 4) / 20 - 1.5; bv[i] = dv.getUint8(i * 6 + 5) / 100 - 0.4;
  }
  starsCache = { n, limit: STAR_LIMIT, dir, mag, bv };
  return starsCache;
}

const NUM = '〇一二三四五六七八九';
/** 1 → 一，12 → 十二，23 → 二十三 */
export const cnNum = (n: number) => (n < 10 ? NUM[n] : n < 20 ? '十' + (n % 10 ? NUM[n % 10] : '') : NUM[Math.floor(n / 10)] + '十' + (n % 10 ? NUM[n % 10] : ''));

let skyCache: SkyData | null = null;
export function loadSky(): SkyData {
  if (skyCache) return skyCache;
  const stars = loadStars(), D = stars.dir;
  const asterisms: Asterism[] = XINGGUAN.map(([name, region, s, segs], i) => {
    let x = 0, y = 0, z = 0;
    for (const k of s) { x += D[k * 3]; y += D[k * 3 + 1]; z += D[k * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    const center: [number, number, number] = [x / l, y / l, z / l];
    let radius = 0;
    for (const k of s) radius = Math.max(radius, Math.acos(Math.min(1, D[k * 3] * center[0] + D[k * 3 + 1] * center[1] + D[k * 3 + 2] * center[2])));
    return { i, name, region, stars: s, segs, center, radius };
  });
  const byStar = new Map<number, number[]>();
  for (const a of asterisms) for (const s of a.stars) { const l = byStar.get(s); if (l) { if (!l.includes(a.i)) l.push(a.i); } else byStar.set(s, [a.i]); }
  const nm = b64(STAR_NAMES), nv = new Uint16Array(nm.buffer, nm.byteOffset, nm.byteLength / 2), names = new Map<number, string>();
  for (let i = 0; i + 2 < nv.length; i += 3) {
    const s = nv[i], a = asterisms[nv[i + 1]], num = nv[i + 2];
    if (!a) continue;
    names.set(s, num === 0 ? a.name : num > 100 ? `${a.name}增${cnNum(num - 100)}` : `${a.name}${cnNum(num)}`);
    // 星名里提到的星官也算它的（有的星不在连线里，只在名字里）
    const l = byStar.get(s); if (!l) byStar.set(s, [a.i]); else if (!l.includes(a.i)) l.push(a.i);
  }
  const byName = new Map(asterisms.map((a) => [a.name, a]));
  skyCache = {
    stars, asterisms, regions: REGIONS, byStar, ju: JU_XING, dipper: DIPPER_STARS,
    starName: (i) => names.get(i) ?? null,
    find: (name) => byName.get(name) ?? null,
  };
  return skyCache;
}

/** 二十八宿在 REGIONS 里从第 3 个起；四象各七宿 */
export const XIANG = [
  { id: 'long', name: '东方苍龙', short: '苍龙', dir: '东', from: 3 },
  { id: 'wu', name: '北方玄武', short: '玄武', dir: '北', from: 10 },
  { id: 'hu', name: '西方白虎', short: '白虎', dir: '西', from: 17 },
  { id: 'que', name: '南方朱雀', short: '朱雀', dir: '南', from: 24 },
] as const;
/** 某一区属于哪一象（三垣返回 null） */
export const xiangOf = (region: number) => (region < 3 ? null : XIANG[Math.floor((region - 3) / 7)]);

let juRa: number[] | null = null;
/**
 * 一个方向（J2000）落在二十八宿的哪一宿：按各宿距星的赤经划分（从本宿距星往东到下一宿距星）。
 * 觜、参两宿的距星今天前后颠倒了不到一度（觜参颠倒）：这里让参宿从觜宿距星往东一点起，觜宿只占那一点（与清代改参宿距星后的划法相近）。
 */
export function mansionOf(v: ArrayLike<number>): string {
  const sky = loadSky(), S = sky.stars.dir;
  if (!juRa) {
    juRa = sky.ju.map((s) => { const r = Math.atan2(S[s * 3 + 1], S[s * 3]); return r < 0 ? r + Math.PI * 2 : r; });
    const zi = sky.regions.indexOf('觜宿') - 3, shen = sky.regions.indexOf('参宿') - 3;
    if (zi >= 0 && shen >= 0) juRa[shen] = Math.max(juRa[shen], juRa[zi] + 0.3 * (Math.PI / 180));
  }
  let ra = Math.atan2(v[1], v[0]); if (ra < 0) ra += Math.PI * 2;
  let best = 0, bd = Infinity;
  juRa.forEach((r, k) => { const d = (((ra - r) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); if (d < bd) { bd = d; best = k; } });
  return sky.regions[best + 3];
}

/**
 * 给一个方向（J2000 单位向量），找附近最显眼的星：角距在 maxAng 以内、亮于 limit 等；越亮越优先（亮一等抵 0.3 倍的角距）。
 * 没有返回 −1。
 */
export function nearest(st: Stars, v: ArrayLike<number>, maxAng: number, limit = st.limit): number {
  const cmax = Math.cos(maxAng);
  let best = -1, bs = Infinity;
  for (let i = 0; i < st.n; i++) {
    if (st.mag[i] > limit) continue;
    const c = st.dir[i * 3] * v[0] + st.dir[i * 3 + 1] * v[1] + st.dir[i * 3 + 2] * v[2];
    if (c < cmax) continue;
    const ang = Math.acos(Math.min(1, c)), score = ang / maxAng + 0.3 * (st.mag[i] - 2) / 4;
    if (score < bs) { bs = score; best = i; }
  }
  return best;
}
/** 点到大圆弧段的角距（都是单位向量）：给「点在连线上」用 */
export function segDist(p: ArrayLike<number>, a: ArrayLike<number>, b: ArrayLike<number>): number {
  // 投到 a、b 张成的平面上，看落点在不在 a…b 之间
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nl = Math.hypot(n[0], n[1], n[2]) || 1;
  const off = (p[0] * n[0] + p[1] * n[1] + p[2] * n[2]) / nl;
  const q = [p[0] - (n[0] / nl) * off, p[1] - (n[1] / nl) * off, p[2] - (n[2] / nl) * off];
  const ql = Math.hypot(q[0], q[1], q[2]) || 1, ab = a[0] * b[0] + a[1] * b[1] + a[2] * b[2], qa = (q[0] * a[0] + q[1] * a[1] + q[2] * a[2]) / ql, qb = (q[0] * b[0] + q[1] * b[1] + q[2] * b[2]) / ql;
  const ang = (x: number) => Math.acos(Math.max(-1, Math.min(1, x)));
  if (qa >= ab && qb >= ab) return Math.asin(Math.min(1, Math.abs(off)));
  return Math.min(ang(p[0] * a[0] + p[1] * a[1] + p[2] * a[2]), ang(p[0] * b[0] + p[1] * b[1] + p[2] * b[2]));
}
