/**
 * 箭怎么飞、中在哪（只有数，没有画）。
 *   飞：出弦的速度随引弓几成（满弓约三十米每秒），一路受重力、受横风（风推着走，按风速给一个横向的加速度）；写成解析式，两边拿同一份出手的数一算就是。
 *   侯：一幅竖着张开的布，正对射位。中在哪按离侯心多远分三等——鹄（正中一圆，朱）三筹，正（鹄外一圈墨）二筹，侯（布上别处）一筹，不中无筹。
 *   瞄：画面上那一点墨，是「满弓、无风」时这一箭会中的地方；风、没引满，都会让它偏开——这一点要自己补。
 * 坐标与世界一样：+x 东、+y 上、+z 南，米、秒。
 */

export const G = 9.8;
/** 一米每秒的风给箭多大的横向加速度（米/秒²） */
export const WIND_K = 0.3;
/** 满弓、半弓出弦的快慢（米/秒） */
export const V_MIN = 15, V_MAX = 30;
/** 侯：布的半宽、半高（米）；鹄、正的半径 */
export const HOU = { hw: 0.9, hh: 0.9, hu: 0.17, zheng: 0.42 };

export type V3 = [number, number, number];
/** 一箭：从 p 以速度 v 出弦；w 是那一刻的风（x、z，米/秒） */
export interface Shot { p: V3; v: V3; w: [number, number] }

/** 引了几成弓 → 出弦多快 */
export const speedOf = (draw: number) => V_MIN + (V_MAX - V_MIN) * Math.pow(Math.max(0, Math.min(1, draw)), 1.3);
/** 出弦 t 秒后箭镞在哪 */
export function arrowAt(s: Shot, t: number, out: V3 = [0, 0, 0]): V3 {
  const ax = s.w[0] * WIND_K, az = s.w[1] * WIND_K;
  out[0] = s.p[0] + s.v[0] * t + 0.5 * ax * t * t;
  out[1] = s.p[1] + s.v[1] * t - 0.5 * G * t * t;
  out[2] = s.p[2] + s.v[2] * t + 0.5 * az * t * t;
  return out;
}
export function arrowVel(s: Shot, t: number, out: V3 = [0, 0, 0]): V3 {
  out[0] = s.v[0] + s.w[0] * WIND_K * t; out[1] = s.v[1] - G * t; out[2] = s.v[2] + s.w[1] * WIND_K * t;
  return out;
}

/** 侯所在的那一面：侯心 c、朝着射位的那一面的法线 n（水平）、侯的右手（从射位看过去的右）r */
export interface Target { c: V3; n: [number, number]; }
/** 从射位看过去的右手（射的人朝 −n 看） */
const rightOf = (T: Target): [number, number] => [T.n[1], -T.n[0]];

/**
 * 这一箭过侯那一面时在哪：t 秒、在侯上的横（u，从射位看往右为正）竖（v，往上为正）。过不去（往回飞）给 null
 */
export function crossTarget(s: Shot, T: Target): { t: number; u: number; v: number } | null {
  const nx = T.n[0], nz = T.n[1];
  // n·(p(t) − c) = 0：t 的二次式
  const a = 0.5 * (s.w[0] * WIND_K * nx + s.w[1] * WIND_K * nz);
  const b = s.v[0] * nx + s.v[2] * nz;
  const c = (s.p[0] - T.c[0]) * nx + (s.p[2] - T.c[2]) * nz;
  let t: number;
  if (Math.abs(a) < 1e-9) { if (Math.abs(b) < 1e-9) return null; t = -c / b; }
  else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc), t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
    t = t1 > 0 && (t1 < t2 || t2 <= 0) ? t1 : t2;
  }
  if (!(t > 0)) return null;
  const p = arrowAt(s, t), r = rightOf(T);
  return { t, u: (p[0] - T.c[0]) * r[0] + (p[2] - T.c[2]) * r[1], v: p[1] - T.c[1] };
}

/** 中在侯上的 (u, v) 得几筹：鹄三、正二、侯一、不中零 */
export function ring(u: number, v: number): 0 | 1 | 2 | 3 {
  const d = Math.hypot(u, v);
  if (d <= HOU.hu) return 3;
  if (d <= HOU.zheng) return 2;
  if (Math.abs(u) <= HOU.hw && Math.abs(v) <= HOU.hh) return 1;
  return 0;
}
export const RING_NAME = ['不中', '中侯', '中正', '中鹄'] as const;

/**
 * 出手：从 p（箭在弦上的那一点），朝 aim 那一点（侯那一面上的一点：满弓、无风时会中的地方）射，引了 draw 成弓，此刻的风 w。
 * 先解出满弓无风时中 aim 要抬多高（仰角），再按真的引弓几成、真的风出手。
 */
export function loose(p: V3, aim: V3, draw: number, w: [number, number]): Shot {
  const dx = aim[0] - p[0], dz = aim[2] - p[2], D = Math.hypot(dx, dz) || 1e-6, dy = aim[1] - p[1];
  const V = V_MAX, ux = dx / D, uz = dz / D;
  // 满弓无风：D = V cosθ t，dy = V sinθ t − g t²/2 → 取低的那一个仰角
  const k = (G * D * D) / (2 * V * V);
  // k tan²θ − D tanθ + (dy + k) = 0
  const disc = D * D - 4 * k * (dy + k);
  const tan = disc >= 0 ? (D - Math.sqrt(disc)) / (2 * k) : D / (2 * k);
  const th = Math.atan(tan), sp = speedOf(draw);
  const q = (x: number) => Math.round(x * 1000) / 1000;
  return { p: [q(p[0]), q(p[1]), q(p[2])], v: [q(ux * Math.cos(th) * sp), q(Math.sin(th) * sp), q(uz * Math.cos(th) * sp)], w: [q(w[0]), q(w[1])] };
}

/** 发给对面的那几个整数（千分之一）与收回来 */
export const shotInts = (s: Shot): number[] => [...s.p, ...s.v, ...s.w].map((x) => Math.round(x * 1000));
export const shotFrom = (d: number[], at = 0): Shot => ({ p: [d[at] / 1000, d[at + 1] / 1000, d[at + 2] / 1000], v: [d[at + 3] / 1000, d[at + 4] / 1000, d[at + 5] / 1000], w: [d[at + 6] / 1000, d[at + 7] / 1000] });
