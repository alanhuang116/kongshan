/**
 * 认路的几样小算法（不碰三维，测试里直接跑）：
 *   一条路（依次要走到的几个点，头一个是起点）上，人此刻走到了哪一段、离路多远、还剩多长；顺着路往前十来米是哪一点；
 *   世界里的一个方向换成「北、东北……」，米数换成「约九十步」；路上还要过哪几处（石桥、汀步、柴门）。
 * 坐标同总图：+x 东、+z 南。
 */
import { cn } from '../../util/cn';

export type P2 = [number, number];
/** 一步多远（米）：先生散步的一步；挑着担子步子小些，也差不多 */
export const STEP = 0.7;
const WORDS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];

/** 世界里的一个方向（dx 往东为正、dz 往南为正）是哪一方 */
export function compass(dx: number, dz: number): string {
  const a = Math.atan2(dx, -dz);
  return WORDS[((Math.round((a / (Math.PI * 2)) * 8) % 8) + 8) % 8];
}

/** 多远换成几步：不到十来步是「几步」，再远些按五步、十步取整 */
export function stepsText(m: number): string {
  const n = m / STEP;
  if (n < 12) return '几步';
  const r = n < 60 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10;
  return `约${cn(r)}步`;
}

/** 一条路有多长 */
export function routeLen(route: P2[]): number {
  let s = 0;
  for (let i = 1; i < route.length; i++) s += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  return s;
}

export interface Along {
  /** 落在第 i 段（route[i] → route[i+1]）的 t 处 */ i: number; t: number;
  /** 路上离人最近的那一点 */ px: number; pz: number;
  /** 人离路多远 */ off: number;
  /** 从那一点到路的尽头还有多长 */ left: number;
  /** 从路的起头走到那一点有多长 */ done: number;
}
/** 人在 (x, z)：落在路上的哪儿 */
export function along(route: P2[], x: number, z: number): Along {
  if (route.length < 2) {
    const p = route[0] ?? [x, z];
    return { i: 0, t: 0, px: p[0], pz: p[1], off: Math.hypot(p[0] - x, p[1] - z), left: 0, done: 0 };
  }
  let best = { i: 0, t: 0, px: route[0][0], pz: route[0][1], d: Infinity };
  for (let i = 0; i < route.length - 1; i++) {
    const [ax, az] = route[i], [bx, bz] = route[i + 1], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)) : 0;
    const px = ax + ex * t, pz = az + ez * t, d = Math.hypot(px - x, pz - z);
    // 一样近时取靠后的那一段（走过的不再回头）
    if (d <= best.d + 1e-6) best = { i, t, px, pz, d };
  }
  let left = 0, done = 0;
  for (let j = 0; j < route.length - 1; j++) {
    const L = Math.hypot(route[j + 1][0] - route[j][0], route[j + 1][1] - route[j][1]);
    if (j < best.i) done += L; else if (j === best.i) { done += L * best.t; left += L * (1 - best.t); } else left += L;
  }
  return { i: best.i, t: best.t, px: best.px, pz: best.pz, off: best.d, left, done };
}

/** 从路上 a 那一点顺着路往前 ahead 米是哪一点（不过尽头） */
export function aheadOf(route: P2[], a: Along, ahead: number): P2 {
  if (route.length < 2) return route[0] ?? [a.px, a.pz];
  let x = a.px, z = a.pz, rest = ahead;
  for (let j = a.i; j < route.length - 1; j++) {
    const [bx, bz] = route[j + 1], L = Math.hypot(bx - x, bz - z);
    if (L >= rest) { const k = rest / Math.max(L, 1e-9); return [x + (bx - x) * k, z + (bz - z) * k]; }
    rest -= L; x = bx; z = bz;
  }
  return route[route.length - 1];
}

/**
 * 该朝哪一点走：路上下一个拐点（离得不到 near 米，就是再下一个——正拐着弯时不来回跳）；人离路远了（off 米以上），先回到路上。
 * 拐点远在 far 米以外的，取顺着路 far 米那一点（方向一样）
 */
export function nextTurn(route: P2[], a: Along, x: number, z: number, o: { near?: number; far?: number; off?: number } = {}): P2 {
  const near = o.near ?? 2.5, far = o.far ?? 14;
  if (route.length < 2) return route[0] ?? [x, z];
  if (a.off > (o.off ?? 6)) return [a.px, a.pz];
  let j = a.i + 1;
  while (j < route.length - 1 && Math.hypot(route[j][0] - x, route[j][1] - z) < near) j++;
  const [cx, cz] = route[j];
  return Math.hypot(cx - x, cz - z) > far ? aheadOf(route, a, far) : [cx, cz];
}

export interface Mark { x: number; z: number; r: number; say: string }
/** 顺着路往前（从 a 那一点起），依次要过哪几处：路从它 r 米以内经过的；最多 max 处 */
export function passes(route: P2[], a: Along, marks: Mark[], max = 2): string[] {
  const hit: Array<{ s: number; say: string }> = [];
  for (const m of marks) {
    let s = 0, at = Infinity;
    for (let j = 0; j < route.length - 1 && at === Infinity; j++) {
      const [ax, az] = route[j], [bx, bz] = route[j + 1], ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez), l2 = L * L;
      const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((m.x - ax) * ex + (m.z - az) * ez) / l2)) : 0;
      if (Math.hypot(ax + ex * t - m.x, az + ez * t - m.z) < m.r) at = s + L * t;
      s += L;
    }
    // 已经走过去了的不提（差一两米、正站在桥上的也算过了）
    if (at < Infinity && at > a.done + 1.5) hit.push({ s: at, say: m.say });
  }
  return hit.sort((p, q) => p.s - q.s).slice(0, max).map((h) => h.say);
}
