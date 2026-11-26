/**
 * 鞠怎么飞（只有数，没有画）。鞠是十二片皮缝的，里头一个吹足了气的胞，轻、有一点风阻：
 *   飞起来按「重力 + 与速度成正比的风阻」算，写成解析式（不一步步积），某一刻在哪一算就是——两边拿同一份出脚时的位置、速度，算出来一样。
 *   出脚：给出脚的那一点、要落到的那一点（接的人的脚背那么高）、飞到多高，解出出脚的速度（kick）；速度按百分之一米每秒取整（发出去的就是这几个整数），
 *   两边都用取整以后的那一份算，接的人那边看见的弧与踢的人那边一样。
 *   接：鞠落到脚背那么高的那一刻（hitTime）前后有一小段「正好」，早了晚了都踢不着——时机越准，下一脚越稳、越准。
 * 坐标与世界一样：+x 东、+y 上、+z 南，米、秒。
 */

export const G = 9.8;
/** 风阻（1/秒）：越大越飘 */
export const DRAG = 0.16;
/** 鞠的半径（宋鞠约七寸见方的一团，按 0.11 米） */
export const R = 0.11;
/** 接鞠时脚背那么高（鞠心离地） */
export const TOUCH_Y = 0.42;

export type V3 = [number, number, number];
/** 一脚出去以后的鞠：从 p 以速度 v 起飞（t = 0 是出脚的那一刻） */
export interface Flight { p: V3; v: V3 }

const ek = (t: number) => Math.exp(-DRAG * t);
/** 出脚 t 秒后鞠心在哪 */
export function posAt(f: Flight, t: number, out: V3 = [0, 0, 0]): V3 {
  const e = 1 - ek(t), gk = G / DRAG;
  out[0] = f.p[0] + (f.v[0] / DRAG) * e;
  out[1] = f.p[1] + ((f.v[1] + gk) / DRAG) * e - gk * t;
  out[2] = f.p[2] + (f.v[2] / DRAG) * e;
  return out;
}
/** 出脚 t 秒后的速度 */
export function velAt(f: Flight, t: number, out: V3 = [0, 0, 0]): V3 {
  const e = ek(t), gk = G / DRAG;
  out[0] = f.v[0] * e; out[1] = (f.v[1] + gk) * e - gk; out[2] = f.v[2] * e;
  return out;
}
/** 到最高处要几秒（往下踢的给 0） */
export function apexTime(f: Flight): number {
  const gk = G / DRAG;
  return f.v[1] <= 0 ? 0 : Math.log((f.v[1] + gk) / gk) / DRAG;
}
/** 往下落、落到 y 那么高的那一刻（落不到给 Infinity） */
export function hitTime(f: Flight, y: number): number {
  let lo = apexTime(f);
  if (posAt(f, lo)[1] < y) return lo > 0 ? Infinity : posAt(f, 0)[1] >= y ? 0 : Infinity;
  let hi = lo + 0.5;
  for (let i = 0; i < 40 && posAt(f, hi)[1] > y; i++) hi += 1;
  if (posAt(f, hi)[1] > y) return Infinity;
  for (let i = 0; i < 48; i++) { const m = (lo + hi) / 2; if (posAt(f, m)[1] > y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** 速度取到百分之一（发出去的那几个整数）；两边都用这个 */
export const q100 = (x: number) => Math.round(x * 100) / 100;
export const toInts = (f: Flight): number[] => [...f.p.map((x) => Math.round(x * 100)), ...f.v.map((x) => Math.round(x * 100))];
export const fromInts = (d: number[], at = 0): Flight => ({ p: [d[at] / 100, d[at + 1] / 100, d[at + 2] / 100], v: [d[at + 3] / 100, d[at + 4] / 100, d[at + 5] / 100] });

/**
 * 出脚：从 from 踢到 to（落到 to 那么高时正在 to 的上方），最高飞到 apex（世界高度）。返回取过整的那一份。
 */
export function kick(from: V3, to: V3, apex: number): Flight {
  const top = Math.max(apex, from[1] + 0.25, to[1] + 0.25), gk = G / DRAG;
  // 竖直方向：最高处恰好是 top（对 v0y 二分；最高处随 v0y 单调升高）
  const peak = (vy: number) => from[1] + vy / DRAG - (gk / DRAG) * Math.log(1 + (DRAG * vy) / G);
  let lo = 0, hi = 40;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (peak(m) < top) lo = m; else hi = m; }
  const vy = (lo + hi) / 2;
  // 落到 to 那么高要多久
  const T = hitTime({ p: from, v: [0, vy, 0] }, to[1]);
  const dx = to[0] - from[0], dz = to[2] - from[2], D = Math.hypot(dx, dz);
  const vh = !Number.isFinite(T) || D < 1e-6 ? 0 : (D * DRAG) / (1 - ek(T));
  const ux = D < 1e-6 ? 0 : dx / D, uz = D < 1e-6 ? 0 : dz / D;
  return { p: [q100(from[0]), q100(from[1]), q100(from[2])], v: [q100(ux * vh), q100(vy), q100(uz * vh)] };
}

/** 这一脚的「正好」有多宽（秒，前后各这么多）：连踢得越久越窄 */
export const touchWindow = (rally: number) => Math.max(0.085, 0.2 - 0.0035 * rally);
/**
 * 接得怎样：dt 是按下的那一刻减去鞠落到脚背的那一刻（秒）。返回 0…1（1 最准），踢不着给 −1。
 */
export function judge(dt: number, rally: number): number {
  const w = touchWindow(rally);
  if (Math.abs(dt) > w) return -1;
  return 1 - Math.abs(dt) / w;
}

/**
 * 落地以后弹几下、滚一滚（只是画；从落地那一刻的位置、速度起）。返回 t 秒后的位置；这一程走完了 done 为真。
 */
export function bounce(p: V3, v: V3, ground: number, t: number, out: V3 = [0, 0, 0]): { at: V3; done: boolean } {
  // 一下一下地弹：每下竖直速度剩四成五、横着的剩七成
  let x = p[0], z = p[2], vx = v[0], vz = v[2], vy = Math.abs(v[1]) * 0.45, tt = t;
  for (let i = 0; i < 4; i++) {
    const T = (2 * vy) / G;
    if (vy < 0.25) break;
    if (tt < T) { out[0] = x + vx * tt; out[2] = z + vz * tt; out[1] = ground + R + vy * tt - 0.5 * G * tt * tt; return { at: out, done: false }; }
    tt -= T; x += vx * T; z += vz * T; vx *= 0.7; vz *= 0.7; vy *= 0.45;
  }
  // 滚：慢慢停下
  const s = Math.hypot(vx, vz), stop = s / 1.6, u = Math.min(tt, stop);
  const k2 = s > 1e-6 ? (s * u - 0.8 * u * u) / s : 0;
  out[0] = x + vx * k2; out[2] = z + vz * k2; out[1] = ground + R;
  return { at: out, done: tt >= stop };
}
