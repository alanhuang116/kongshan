/**
 * 天文：日、月、五星的位置，恒星时，坐标之间的换算。只有数，不碰画法（单元测试直接用）。
 *
 * 坐标：
 *   赤道（J2000）—— 星表的坐标：x 指春分点，z 指北天极。
 *   赤道（当日）—— 加了岁差的赤道坐标（J2000 → 画里那一年）。
 *   世界 —— 画里的方向：+x 东、+y 上、+z 南（与 site.ts 一致）。
 *
 * 时辰：画里的钟点按「当地真太阳时」算（日头正南是十二点）。所以太阳的时角就是 (钟点 − 12) × 15°，
 * 当地恒星时 = 太阳的赤经 + 太阳的时角——用不着经度、时区。只有算五星、月亮的交点时要一个大致的世界时（差几个钟头无妨）。
 *
 * 日出日落：atmos.ts 里每季有一张日出、日落的表（别的模块都按它定昼夜）。真实的日出日落与表差不过半个钟头，
 * 这里把画里的钟点「拉一拉」（warpHour）：表上的日出那一刻，算出来的太阳正好在地平线上；白天、夜里各自匀着拉。
 * 这样太阳走的是那一天真实的路（多高、从哪里升起），又和表对得上。
 */

export const D2R = Math.PI / 180;
/** 洛阳：北纬、东经（度） */
export const LAT = 34.6, LON = 112.4;
/** 画里用哪一年的天（岁差、五星）：就用今年 */
export const SKY_YEAR = (() => { try { return new Date().getFullYear(); } catch { return 2026; } })();

/** 3×3 矩阵，按行存（m[0..2] 是第一行） */
export type M3 = Float64Array;
export const m3 = (a: ArrayLike<number>): M3 => Float64Array.from(a);
export function mul3(a: M3, b: M3, out: M3 = new Float64Array(9)): M3 {
  const r = new Float64Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  out.set(r);
  return out;
}
export function tr3(a: M3, out: M3 = new Float64Array(9)): M3 {
  const r = [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
  out.set(r);
  return out;
}
export function app3(m: M3, x: number, y: number, z: number, out: number[] | Float64Array = [0, 0, 0]): number[] | Float64Array {
  out[0] = m[0] * x + m[1] * y + m[2] * z; out[1] = m[3] * x + m[4] * y + m[5] * z; out[2] = m[6] * x + m[7] * y + m[8] * z;
  return out;
}
const rotZ = (a: number): M3 => m3([Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1]);
const rotY = (a: number): M3 => m3([Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)]);

/** 赤经、赤纬（弧度）→ 单位向量 */
export const eqVec = (ra: number, dec: number): [number, number, number] => [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
/** 单位向量 → [赤经 0…2π, 赤纬] */
export const vecEq = (v: ArrayLike<number>): [number, number] => { const ra = Math.atan2(v[1], v[0]); return [ra < 0 ? ra + Math.PI * 2 : ra, Math.asin(Math.max(-1, Math.min(1, v[2])))]; };

// —— 日子 ——
/** 某年第 doy 天（1 月 1 日是 1）世界时 0 点的儒略日 */
export function jd0(year: number, doy: number): number {
  // 公历 year 年 1 月 0 日 0 时的儒略日（Meeus 7.1，取 M=1、D=0）
  const y = year - 1, A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
  const jan0 = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * 14) + 0 + B - 1524.5;
  return jan0 + doy;
}
/** 画里的那一刻（某年第 doy 天、当地真太阳时 h 点）距 J2000.0 的日数（世界时，差几分钟无妨） */
export const daysJ2000 = (year: number, doy: number, h: number) => jd0(year, doy) + (h - LON / 15) / 24 - 2451545.0;

/** 季节的那一天：atmos 里每季一个日子（DAY），第几日往后推，推到季末再回到季初（季节由人定，天不能跑到别的季节去） */
export const SEASON_WINDOW: Record<string, [number, number]> = { spring: [35, 126], summer: [126, 219], autumn: [219, 312], winter: [312, 400] };
export function skyDay(season: string, base: number, kday: number): number {
  const w = SEASON_WINDOW[season] ?? [1, 366];
  let b = base; if (b < w[0]) b += 365;
  const len = w[1] - w[0], d = w[0] + ((((b - w[0] + Math.max(0, Math.floor(kday))) % len) + len) % len);
  return ((d - 1) % 365) + 1;
}

// —— 太阳 ——
/** 太阳（低精度，约 0.01°）：黄经 λ、赤经 ra、赤纬 dec、黄赤交角 eps（弧度，当日的平春分） */
export function sun(d: number): { lambda: number; ra: number; dec: number; eps: number } {
  const L = (280.46 + 0.9856474 * d) * D2R, g = (357.528 + 0.9856003 * d) * D2R;
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 0.0000004 * d) * D2R;
  let ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)); if (ra < 0) ra += Math.PI * 2;
  return { lambda: ((lambda % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), ra, dec: Math.asin(Math.sin(eps) * Math.sin(lambda)), eps };
}
/** 太阳赤纬为 dec 时，半个白昼有几个钟头（日面上缘在地平线上，含蒙气差：−0.833°） */
export function halfDay(dec: number, lat = LAT * D2R): number {
  const c = (Math.sin(-0.833 * D2R) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  return (Math.acos(Math.max(-1, Math.min(1, c))) / D2R) / 15;
}
/**
 * 画里的钟点 → 「算天用的」真太阳时：表上的日出 sr、日落 ss 对到真实的日出日落（半昼长 H0 个钟头），白天、夜里各自匀着拉。
 */
export function warpHour(h: number, sr: number, ss: number, H0: number): number {
  h = ((h % 24) + 24) % 24;
  let out: number;
  if (h >= sr && h <= ss) out = 12 + (h - (sr + ss) / 2) * ((2 * H0) / (ss - sr));
  else { const hn = h < sr ? h + 24 : h; out = 12 + H0 + (hn - ss) * ((24 - 2 * H0) / (24 - (ss - sr))); }
  return ((out % 24) + 24) % 24;
}

// —— 坐标 ——
/** 岁差（IAU 1976）：J2000 的赤道坐标 → d 日（距 J2000.0）那天的平赤道坐标 */
export function precession(d: number): M3 {
  const T = d / 36525, s = D2R / 3600;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * s;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * s;
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * s;
  return mul3(rotZ(z), mul3(rotY(-theta), rotZ(zeta)));
}
/** 当日赤道坐标 → 世界（+x 东、+y 上、+z 南）。lst 当地恒星时（弧度） */
export function horizon(lst: number, lat = LAT * D2R): M3 {
  const cL = Math.cos(lst), sL = Math.sin(lst), cP = Math.cos(lat), sP = Math.sin(lat);
  return m3([-sL, cL, 0, cP * cL, cP * sL, sP, sP * cL, sP * sL, -cP]);
}
/** 赤道（J2000）→ 银道。行是银道的 x（指银心）、y（银经 90°）、z（北银极） */
export const EQ_TO_GAL = m3([-0.0548755604, -0.8734370902, -0.4838350155, 0.4941094279, -0.44482963, 0.7469822445, -0.867666149, -0.1980763734, 0.4559837762]);
/** 黄道坐标（黄经、黄纬，弧度）→ 赤道（同一历元） */
export function eclVec(lambda: number, beta: number, eps: number): [number, number, number] {
  const x = Math.cos(beta) * Math.cos(lambda), y = Math.cos(beta) * Math.sin(lambda), z = Math.sin(beta);
  return [x, y * Math.cos(eps) - z * Math.sin(eps), y * Math.sin(eps) + z * Math.cos(eps)];
}

// —— 月 ——
/**
 * 月亮：盈亏由界面按今天的农历给（0 朔、0.5 望）。位置跟着盈亏走：月在日之东 360°×盈亏 处（黄经），
 * 黄纬按白道（倾 5.145°，交点每天退 0.053°）算，所以有时高有时低，与真的一样。返回当日赤道坐标的单位向量。
 */
export function moon(d: number, phase: number, s = sun(d)): [number, number, number] {
  const lambda = s.lambda + phase * Math.PI * 2;
  const node = (125.0445 - 0.0529539 * d) * D2R;
  const beta = 5.145 * D2R * Math.sin(lambda - node);
  return eclVec(lambda, beta, s.eps);
}

// —— 五星 ——
/**
 * JPL「Keplerian Elements for Approximate Positions of the Major Planets」表一（J2000 黄道，1800–2050 年可用）：
 * a(au)、e、I、L、ϖ（近日点黄经）、Ω（升交点黄经）（度）与每世纪的变化。
 */
const EL: Record<string, number[]> = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
};
function helio(id: string, T: number): [number, number, number] {
  const e0 = EL[id], a = e0[0] + e0[6] * T, e = e0[1] + e0[7] * T, I = (e0[2] + e0[8] * T) * D2R, L = e0[3] + e0[9] * T, w = e0[4] + e0[10] * T, O = e0[5] + e0[11] * T;
  const om = (w - O) * D2R, Om = O * D2R;
  let M = (((L - w) % 360) + 540) % 360 - 180;
  M *= D2R;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(om), sw = Math.sin(om), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I);
  return [(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp, (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp, sw * sI * xp + cw * sI * yp];
}
/** 五星：古名、今名、色（给星点的色指数） */
export const PLANETS: Array<{ id: string; name: string; alias: string; bv: number }> = [
  { id: 'jupiter', name: '岁星', alias: '木星', bv: 0.8 },
  { id: 'mars', name: '荧惑', alias: '火星', bv: 1.45 },
  { id: 'saturn', name: '镇星', alias: '土星', bv: 1.0 },
  { id: 'venus', name: '太白', alias: '金星', bv: 0.75 },
  { id: 'mercury', name: '辰星', alias: '水星', bv: 0.9 },
];
const EPS0 = 23.43928 * D2R;
/** 五星此刻在哪（J2000 赤道坐标的单位向量）、多亮（星等）、离太阳多远（角距，弧度） */
export function planets(d: number): Array<{ id: string; dir: [number, number, number]; mag: number; elong: number }> {
  const T = d / 36525, E = helio('earth', T), out: Array<{ id: string; dir: [number, number, number]; mag: number; elong: number }> = [];
  const sunGeo = [-E[0], -E[1], -E[2]], rE = Math.hypot(...E);
  for (const p of PLANETS) {
    const P = helio(p.id, T), g = [P[0] - E[0], P[1] - E[1], P[2] - E[2]];
    const r = Math.hypot(...P), del = Math.hypot(...g);
    // 相角（日—星—地）
    const ci = (r * r + del * del - rE * rE) / (2 * r * del), i = Math.acos(Math.max(-1, Math.min(1, ci))) / D2R;
    const k = 5 * Math.log10(r * del);
    const mag = p.id === 'mercury' ? -0.42 + k + 0.038 * i - 0.000273 * i * i + 0.000002 * i * i * i
      : p.id === 'venus' ? -4.4 + k + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i
        : p.id === 'mars' ? -1.52 + k + 0.016 * i
          : p.id === 'jupiter' ? -9.4 + k + 0.005 * i
            : -8.88 + k + 0.044 * i;
    const x = g[0] / del, y = g[1] / del, z = g[2] / del;
    const dir: [number, number, number] = [x, y * Math.cos(EPS0) - z * Math.sin(EPS0), y * Math.sin(EPS0) + z * Math.cos(EPS0)];
    const sg = [sunGeo[0] / rE, sunGeo[1] / rE, sunGeo[2] / rE];
    const elong = Math.acos(Math.max(-1, Math.min(1, (g[0] * sg[0] + g[1] * sg[1] + g[2] * sg[2]) / del)));
    out.push({ id: p.id, dir, mag, elong });
  }
  return out;
}

// —— 一刻的天 ——
export interface SkyNow {
  /** 距 J2000.0 的日数 */ d: number;
  /** 当地恒星时（弧度）：星斗用的（含「候星移」多拨的） */ lst: number;
  /** 不含多拨的恒星时（日、月用） */ lst0: number;
  /** J2000 赤道 → 世界：星斗用（含多拨）、日月五星用（不含） */ M: M3; M0: M3;
  /** 岁差 */ P: M3;
  /** 太阳、月亮在世界里的方向 */ sunW: [number, number, number]; moonW: [number, number, number];
  /** 太阳的黄经、赤纬 */ sunLambda: number; sunDec: number;
}
/**
 * 一刻的天：某年第 doy 天、「算天用的」真太阳时 h（已经 warpHour 过）、月相、星斗另外多拨几个钟头。
 */
export function skyNow(year: number, doy: number, h: number, phase: number, shift = 0): SkyNow {
  const d = daysJ2000(year, doy, h), s = sun(d), P = precession(d);
  const lst0 = s.ra + (h - 12) * 15 * D2R, lst = lst0 + shift * 15.041 * D2R;
  const H0 = horizon(lst0), H = horizon(lst);
  const M0 = mul3(H0, P), M = mul3(H, P);
  const sv = eqVec(s.ra, s.dec), mv = moon(d, phase, s);
  const sunW = app3(H0, sv[0], sv[1], sv[2], [0, 0, 0]) as [number, number, number];
  const moonW = app3(H0, mv[0], mv[1], mv[2], [0, 0, 0]) as [number, number, number];
  return { d, lst, lst0, M, M0, P, sunW, moonW, sunLambda: s.lambda, sunDec: s.dec };
}
/**
 * 画里的天：季节（与那一季的日子 base）、第几日、画里的钟点（表上的日出 sr、日落 ss 定昼夜）、月相、星斗多拨几个钟头。
 * 返回那一刻的天，外加用的是哪一天（doy）、算天用的真太阳时（hEff）。
 */
export function sceneSky(o: { year?: number; season: string; base: number; sr: number; ss: number; kday: number; hour: number; phase: number; shift?: number }): SkyNow & { doy: number; hEff: number } {
  const year = o.year ?? SKY_YEAR, doy = skyDay(o.season, o.base, o.kday);
  const dec = sun(daysJ2000(year, doy, 12)).dec, hEff = warpHour(o.hour, o.sr, o.ss, halfDay(dec));
  return { ...skyNow(year, doy, hEff, o.phase, o.shift ?? 0), doy, hEff };
}
/** 世界里的方向 → 高度角、方位角（度；方位从正北起往东量） */
export function altAz(w: ArrayLike<number>): { alt: number; az: number } {
  const alt = Math.asin(Math.max(-1, Math.min(1, w[1]))) / D2R;
  let az = Math.atan2(w[0], -w[2]) / D2R; if (az < 0) az += 360;
  return { alt, az };
}
