/**
 * 行者的田在哪：几畦地、每一垄、挨着的那片邻家麦、晒场上打场扬场的地方、石磨、打水的地方、几棵果树与桑。
 * 都从总图（site.ts）算出来；总图挪了，这里跟着走。
 *
 *   西畦、东畦 —— 过了石桥往南，井田东北那一畦（总图上标了 farm 的那一块）的北头，两畦并排，中间一条埂。
 *                 各 8×4.8 米，四垄，垄东西走向。
 *   邻家的麦   —— 同一块地南边的一大片（王伯家的），十九垄；夏天可以帮着割。
 *   菜畦       —— 院西菜畦的东头、西头两小畦（当中是瓜架，仍归草木那边画），各两垄，垄南北走向。
 *   晒场       —— 村里那块夯平的场的南半边：打场、扬场在这里；石磨立在场东南角。
 */
import { PLOTS, SITE, TREES, ground, streamAt, waterAt, type Plot, type Rect } from '../site';
import { BEDS, VILLAGE_ROWS, rowDir } from './model';
import { siteExtras } from '../env/flora/extras';

/** 行者接管的那一块井田（总图上标了 farm） */
export const PLOT: Plot = PLOTS.find((p) => p.farm) ?? PLOTS[2];

export interface BedGeo extends Rect {
  id: string; name: string;
  /** 垄顺着哪个方向走 */ axis: 'x' | 'z';
  rows: number;
  /** 每一垄的中线（横着垄的那个坐标） */ lines: number[];
  /** 一垄占多宽 */ pitch: number;
  /** 这一处的地面多高 */ y(x: number, z: number): number;
}
const flatY = (_x: number, _z: number) => PLOT.y;
const bed = (id: string, x0: number, x1: number, z0: number, z1: number, axis: 'x' | 'z', y: (x: number, z: number) => number): BedGeo => {
  const s = BEDS.find((b) => b.id === id)!, n = s.rows, a0 = axis === 'x' ? z0 : x0, a1 = axis === 'x' ? z1 : x1, pitch = (a1 - a0) / n;
  return { id, name: s.name, x0, x1, z0, z1, axis, rows: n, pitch, lines: Array.from({ length: n }, (_, i) => a0 + pitch * (i + 0.5)), y };
};
/** 两畦正对着石桥南边：中间那条埂在 x≈1.5 */
const cx = (PLOT.x0 + PLOT.x1) / 2, nz = PLOT.z0 + 1.6;
export const BED_GEO: Record<string, BedGeo> = {
  west: bed('west', cx - 9, cx - 1, nz, nz + 4.8, 'x', flatY),
  east: bed('east', cx + 1, cx + 9, nz, nz + 4.8, 'x', flatY),
  vegE: bed('vegE', -16.5, -14.9, 2.6, 12.4, 'z', ground),
  vegW: bed('vegW', -23.5, -21.9, 6.2, 12.4, 'z', ground),
};
/** 垄的两头留多少（人站在垄头） */
export const END = 0.35;
/** 第 row 垄、做到 f（0…1，顺着这一垄的走向）那一点；side 往垄的一侧偏（米，沿横着垄的方向） */
export function rowPoint(g: BedGeo, row: number, f: number, side = 0): { x: number; z: number; yaw: number } {
  const d = rowDir(row), L0 = g.axis === 'x' ? g.x0 : g.z0, L1 = g.axis === 'x' ? g.x1 : g.z1, len = L1 - L0 - END * 2;
  const a = d > 0 ? L0 + END + len * f : L1 - END - len * f, c = g.lines[row] + side;
  // 朝着往前做的方向：垄东西走向时，自西往东是 +x（yaw π/2）
  const yaw = g.axis === 'x' ? (d > 0 ? Math.PI / 2 : -Math.PI / 2) : d > 0 ? 0 : Math.PI;
  return g.axis === 'x' ? { x: a, z: c, yaw } : { x: c, z: a, yaw };
}
/** 一垄有多长（两头留过之后） */
export const rowLen = (g: BedGeo) => (g.axis === 'x' ? g.x1 - g.x0 : g.z1 - g.z0) - END * 2;
/** 世界里的一点落在这一畦的第几垄、做到哪里（不在畦里返回 null） */
export function rowAt(g: BedGeo, x: number, z: number): { row: number; f: number } | null {
  if (x < g.x0 - 0.2 || x > g.x1 + 0.2 || z < g.z0 - 0.2 || z > g.z1 + 0.2) return null;
  const c = g.axis === 'x' ? z : x, a = g.axis === 'x' ? x : z, a0 = g.axis === 'x' ? g.z0 : g.x0, L0 = g.axis === 'x' ? g.x0 : g.z0;
  const row = Math.max(0, Math.min(g.rows - 1, Math.floor((c - a0) / g.pitch))), u = (a - L0 - END) / rowLen(g);
  return { row, f: Math.max(0, Math.min(1, rowDir(row) > 0 ? u : 1 - u)) };
}

/** 邻家那片麦：同一块地的南边，垄东西走向，自西往东割 */
export const VILLAGE: Rect & { rows: number; lines: number[] } = (() => {
  const x0 = PLOT.x0 + 1.0, x1 = PLOT.x1 - 1.0, z0 = BED_GEO.west.z1 + 2.0, z1 = PLOT.z1 - 1.0;
  const pitch = (z1 - z0) / VILLAGE_ROWS;
  return { x0, x1, z0, z1, rows: VILLAGE_ROWS, lines: Array.from({ length: VILLAGE_ROWS }, (_, i) => z0 + pitch * (i + 0.5)) };
})();

// —— 晒场 ——
const D = SITE.more.dryYard;
/** 打场、扬场的地方（场的南半边，晒席与碌碡的南面）：摊麦的圆心与半径；人站在它南边 */
export const FLOOR = { x: D.x - 1.4, z: D.z + 5.1, r: 1.35, y: ground(D.x - 1.4, D.z + 5.1) };
/** 扬场时连糠带粒的那一堆、扬净的那一堆、糠落下的那一边（按风向现算，这里只给堆的位置） */
export const HEAP = { x: FLOOR.x + 2.3, z: FLOOR.z + 0.4 };
/** 石磨：场的东南角。磨盘半径、推磨的人绕着走的半径 */
export const MILL = { x: D.x + 4.6, z: D.z + 5.6, base: 0.62, walk: 1.28, y: ground(D.x + 4.6, D.z + 5.6) };

// —— 打水 ——
/** 从岸上一点朝水里走，找到水边；返回离水 back 米处，面朝水 */
function shore(x: number, z: number, dx: number, dz: number, back: number) {
  let s = 0;
  while (s < 30 && !waterAt(x + dx * s, z + dz * s)) s += 0.05;
  const px = x + dx * (s - back), pz = z + dz * (s - back), w = streamAt(px, pz);
  return { x: px, z: pz, yaw: Math.atan2(dx, dz), water: { x: x + dx * (s + 0.3), z: z + dz * (s + 0.3), y: w.y } };
}
/** 溪边打水的两处：石桥西南的南岸（离两畦近），菜畦南边的北岸（离菜畦近） */
export const DIPS = [
  { id: 'dip', name: '溪边', ...shore(-4.2, 40, 0, -1, 0.42) },
  { id: 'dip2', name: '溪边', ...shore(-16.5, 18, 0, 1, 0.42) },
];
/** 井（辘轳的曲柄在井东头）：人站在曲柄东边，面朝西摇 */
export const WELL = (() => {
  const Wl = SITE.well, top = ground(Wl.x, Wl.z) + 0.14, ay = top + 1.32;
  return { x: Wl.x, z: Wl.z, top, axle: ay, crankX: Wl.x + 1.34, crankR: 0.316, spot: { x: Wl.x + 1.9, z: Wl.z + 0.08, yaw: -Math.PI / 2 } };
})();

// —— 果树与桑 ——
export interface TreeAt { x: number; z: number; s: number; seed: number; kind: string; to?: [number, number] }
/** 离石桥最近的一株桃（夏天摘桃） */
export const PEACH: TreeAt = (() => {
  let best = TREES[0], bd = 1e9;
  for (const t of TREES) if (t.kind === 'peach') { const d = Math.hypot(t.x - SITE.bridge.x, t.z - (SITE.bridge.z + 6)); if (d < bd) { bd = d; best = t; } }
  return { x: best.x, z: best.z, s: best.s, seed: best.seed, kind: 'peach' };
})();
/** 邻家门前屋后的枣（甲家）、柿（乙家）：位置从草木那边的单子里取（它们是那边现找的） */
export const FRUIT: { jujube: TreeAt | null; persimmon: TreeAt | null } = (() => {
  let jujube: TreeAt | null = null, persimmon: TreeAt | null = null;
  try {
    for (const t of siteExtras().trees) {
      if (t.kind === 'jujube' && !jujube) jujube = { ...t };
      if (t.kind === 'persimmon' && (!persimmon || Math.hypot(t.x - 70, t.z) < Math.hypot(persimmon.x - 70, persimmon.z))) persimmon = { ...t };
    }
  } catch { /* 单子取不到：这两样就没有 */ }
  return { jujube, persimmon };
})();
/** 桑园西北角挨着路的一株（采桑叶） */
export const MULBERRY: TreeAt = (() => {
  let best = TREES[0], bd = 1e9;
  for (const t of TREES) if (t.kind === 'mulberry') { const d = Math.hypot(t.x - (SITE.mulberry.x0 + 6), t.z - (SITE.mulberry.z0 + 2)); if (d < bd) { bd = d; best = t; } }
  return { x: best.x, z: best.z, s: best.s, seed: best.seed, kind: 'mulberry' };
})();

/** 给别人看的：行者的几畦、邻家那片麦、晒场上占着的两处（村里人别在这里打谷） */
export const FARM_SITE = {
  beds: Object.values(BED_GEO).map((g) => ({ id: g.id, name: g.name, x0: g.x0, x1: g.x1, z0: g.z0, z1: g.z1 })),
  village: { x0: VILLAGE.x0, x1: VILLAGE.x1, z0: VILLAGE.z0, z1: VILLAGE.z1, rows: VILLAGE.rows },
  floor: { x: FLOOR.x, z: FLOOR.z, r: FLOOR.r + 1.6 },
  mill: { x: MILL.x, z: MILL.z, r: MILL.walk + 0.4 },
};
