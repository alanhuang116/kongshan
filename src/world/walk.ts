/**
 * 哪里能走：把这一方水土压成一张「地面高度 + 挡路的东西」的图，小人按它走。
 *
 *   地面：就是地势（site.ts 的 ground），外加几块架起来的面——草堂的屋里、亭子里、石桥、踏石。
 *   水：溪、池、伊水里水深过脚踝（0.3 米）的地方不能走；过溪走桥或踏石。
 *   挡路：墙、篱、树、石、桌凳、屋里的家什、邻家的房子……给成方块（可以斜着放）和圆。村里的人和牲口是会动的圆。
 *   规则：一步之内高差超过 0.36 米的地方上不去也下不来——所以人不会从桥上、亭沿掉下去，陡岸也下不去。
 *        碰到挡路的东西会被推开，于是贴着篱笆走时是顺着滑过去的。
 *
 * 位置都从 site.ts 取。tests/walk.test.ts 会从入口把能走到的地方灌一遍，确认各处都走得到、水里墙里走不到。
 */
import { ROCKS, SITE, TREES, YARD_Y, ground, placeId, streamAt, waterAt } from './site';

/** 只有一层地面（留着这个类型，免得别处改签名） */
export type Zone = 'ground';
export interface Box { x0: number; x1: number; z0: number; z1: number; /** 高墙：镜头也过不去 */ tall?: boolean }
/** 斜放的方块：中心、半宽半深、转角 */
export interface OBox { x: number; z: number; hw: number; hd: number; c: number; s: number; tall?: boolean }
export interface Disc { x: number; z: number; r: number }
/** 能踩上去的面：方的（可以斜着放）或圆的；y 是面的高度 */
interface Surf { kind: 'rect' | 'disc'; x: number; z: number; hw: number; hd: number; c: number; s: number; r: number; y: number; R: number }
const rectSurf = (x0: number, x1: number, z0: number, z1: number, y: number): Surf => { const hw = (x1 - x0) / 2, hd = (z1 - z0) / 2; return { kind: 'rect', x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw, hd, c: 1, s: 0, r: 0, y, R: Math.hypot(hw, hd) }; };
/** 屋舍那边报上来的一件东西占的地方（与 build/kit.ts 的 Solid 同形） */
export interface SolidLike { id: string; kind: 'rect' | 'disc'; x: number; z: number; w?: number; d?: number; yaw?: number; r?: number; top?: number; walk?: boolean }

export const RADIUS = 0.26;
/** 一步能跨的高差 */
export const STEP_MAX = 0.36;
/** 水深过这个数就不下去 */
export const WADE = 0.3;
const H = SITE.hall, PV = SITE.pavilion, BR = SITE.bridge;
/** 几处地面的高度 */
export const HALL_Y = YARD_Y + H.floor, PAV_Y = ground(PV.x, PV.z) + PV.floor, BRIDGE_Y = streamAt(BR.x, BR.z).y + 0.55 + 0.25;

// —— 架起来的面（屋舍备好之后，换成它们报上来的那些：台基、踏步石、桥面、汀步、亭台、井台、栈桥……） ——
let SURFS: Surf[] = [
  rectSurf(H.x - H.w / 2 + 0.15, H.x + H.w / 2 - 0.15, H.z - H.d / 2 + 0.15, H.z + H.d / 2 + 0.25, HALL_Y),     // 草堂屋里（连门槛外一小条）
  rectSurf(PV.x - PV.half, PV.x + PV.half, PV.z - PV.half, PV.z + PV.half, PAV_Y),                               // 亭
  rectSurf(BR.x - BR.w / 2, BR.x + BR.w / 2, BR.z - BR.len / 2, BR.z + BR.len / 2, BRIDGE_Y),                    // 石桥
];
// 踏石：南北一溜，每块一小方
{
  const S = SITE.stones, wy = streamAt(S.x, S.z).y + 0.12;
  for (let k = -3; k <= 3; k++) SURFS.push(rectSurf(S.x - 0.46 + 0.1 * Math.sin(k * 2.1), S.x + 0.46 + 0.1 * Math.sin(k * 2.1), S.z + k * 0.92 - 0.5, S.z + k * 0.92 + 0.5, wy));
}
const onSurf = (s: Surf, x: number, z: number) => {
  const dx = x - s.x, dz = z - s.z;
  if (dx > s.R || dx < -s.R || dz > s.R || dz < -s.R) return false;
  if (s.kind === 'disc') return dx * dx + dz * dz <= s.r * s.r;
  const lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
  return Math.abs(lx) <= s.hw && Math.abs(lz) <= s.hd;
};

// —— 挡路的东西 ——
const B: Box[] = [], OB: OBox[] = [], D: Disc[] = [];
/** 村里的人和牲口（每帧由外面更新） */
let DYN: Disc[] = [];
export const setDynamic = (d: Disc[]) => { DYN = d; };
const wall = (x0: number, x1: number, z0: number, z1: number, tall = false) => B.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), tall });
const col = (x: number, z: number, r: number) => D.push({ x, z, r });
/** 外面（屋舍、器物备好之后）再添挡路的东西 */
export const addBox = (x0: number, x1: number, z0: number, z1: number, tall = false) => { wall(x0, x1, z0, z1, tall); cells.clear(); };
export const addDisc = (x: number, z: number, r: number) => { col(x, z, r); cells.clear(); };
export const addOBox = (x: number, z: number, w: number, d: number, yaw: number, tall = false) => { OB.push({ x, z, hw: w / 2, hd: d / 2, c: Math.cos(yaw), s: Math.sin(yaw), tall }); cells.clear(); };
/**
 * 用屋舍那边报上来的东西：能踩的面换掉这里自己估的（台基、桥面、汀步……高度以它们为准，脚才落在画出来的面上），
 * 别的都当挡路的。檐口只是头顶上的，不挡路。
 */
export function useSolids(list: SolidLike[]) {
  // 估的那些拿掉（位置、转角以屋舍为准）；菊圃、菜畦只有一圈矮边，屋舍那边不报，这里补回来
  B.splice(0, HARD.b); OB.splice(0, HARD.ob); D.splice(0, HARD.d);
  HARD.b = HARD.ob = HARD.d = 0;
  { const M = SITE.mums, V = SITE.veg; wall(M.x0, M.x1, M.z0, M.z1); wall(V.x0, V.x1, V.z0, V.z1); }
  const surf: Surf[] = [];
  for (const s of list) {
    if (/檐/.test(s.id)) continue;
    const yaw = s.yaw ?? 0, c = Math.cos(yaw), sn = Math.sin(yaw);
    if (s.walk && s.top != null) {
      // 每块放大 4 厘米：相邻的两块（踏步石与台、桥头石与桥面）之间那一线缝，不该当成台沿
      // 汀步一块一块隔着水：人是一步一块跨过去的，所以把它们连成一条（每块放大到与邻块相接）
      const grow = /汀步/.test(s.id) ? 0.3 : 0.04;
      if (s.kind === 'disc') surf.push({ kind: 'disc', x: s.x, z: s.z, hw: 0, hd: 0, c: 1, s: 0, r: (s.r ?? 0.3) + grow, y: s.top, R: (s.r ?? 0.3) + grow });
      else { const hw = (s.w ?? 1) / 2 + 0.04, hd = (s.d ?? 1) / 2 + 0.04; surf.push({ kind: 'rect', x: s.x, z: s.z, hw, hd, c, s: sn, r: 0, y: s.top, R: Math.hypot(hw, hd) }); }
    } else if (s.kind === 'disc') D.push({ x: s.x, z: s.z, r: s.r ?? 0.2 });
    else OB.push({ x: s.x, z: s.z, hw: (s.w ?? 0.2) / 2, hd: (s.d ?? 0.2) / 2, c, s: sn, tall: /墙|东厢|邻家|村塾|碓房/.test(s.id) });
  }
  if (surf.length) SURFS = surf;
  tiles.clear(); cells.clear();
}

// 草堂：北墙、两山墙、南墙（当中留门）；屋里的家什
{
  const x0 = H.x - H.w / 2, x1 = H.x + H.w / 2, z0 = H.z - H.d / 2, z1 = H.z + H.d / 2, t = 0.3;
  wall(x0, x1, z0, z0 + t, true); wall(x0, x0 + t, z0, z1, true); wall(x1 - t, x1, z0, z1, true);
  wall(x0, H.x - H.door / 2, z1 - t, z1, true); wall(H.x + H.door / 2, x1, z1 - t, z1, true);
  const I = SITE.inside;
  for (const s of I.shelves) wall(s.x - 0.7, s.x + 0.7, s.z - 0.22, s.z + 0.24);
  wall(I.desk.x - 0.8, I.desk.x + 0.8, I.desk.z - 0.36, I.desk.z + 0.36);
  wall(I.qin.x - 0.72, I.qin.x + 0.72, I.qin.z - 0.26, I.qin.z + 0.26);
  col(I.stove.x, I.stove.z, 0.3); col(I.jar.x, I.jar.z, 0.42);
  wall(I.couch.x - 0.95, I.couch.x + 0.95, I.couch.z - 0.42, I.couch.z + 0.42);
}
// 东厢、邻家的房子
{ const G = SITE.wing; wall(G.x - G.w / 2, G.x + G.w / 2, G.z - G.d / 2, G.z + G.d / 2, true); }
for (const h of SITE.houses) OB.push({ x: h.x, z: h.z, hw: h.w / 2 + 0.15, hd: h.d / 2 + 0.15, c: Math.cos(h.yaw), s: Math.sin(h.yaw), tall: true });
// 竹篱：四面，南面让出柴门，西面让出小门
{
  const Y = SITE.yard, g = SITE.gate, sg = SITE.sideGate, t = 0.1;
  wall(Y.x0, g.x - g.w / 2, Y.z1 - t, Y.z1 + t); wall(g.x + g.w / 2, Y.x1, Y.z1 - t, Y.z1 + t);
  wall(Y.x0, Y.x1, Y.z0 - t, Y.z0 + t); wall(Y.x1 - t, Y.x1 + t, Y.z0, Y.z1);
  wall(Y.x0 - t, Y.x0 + t, Y.z0, sg.z - sg.w / 2); wall(Y.x0 - t, Y.x0 + t, sg.z + sg.w / 2, Y.z1);
  col(g.x - g.w / 2 - 0.08, Y.z1, 0.14); col(g.x + g.w / 2 + 0.08, Y.z1, 0.14);
}
// 院里：菊圃（不踩）、石桌与四只石凳、圭表的表
{
  const M = SITE.mums, T = SITE.table, N = SITE.gnomon;
  wall(M.x0, M.x1, M.z0, M.z1);
  col(T.x, T.z, 0.52);
  for (let k = 0; k < 4; k++) col(T.x + Math.cos(k * Math.PI / 2 + Math.PI / 4) * 0.98, T.z + Math.sin(k * Math.PI / 2 + Math.PI / 4) * 0.98, 0.2);
  col(N.x, N.z, 0.1);
  const V = SITE.veg; wall(V.x0, V.x1, V.z0, V.z1);
}
// 亭：八根柱，北面、西面的坐凳
{
  const h = PV.half;
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) col(PV.x + a * h, PV.z + b * h, 0.11);
  wall(PV.x - h, PV.x + h, PV.z - h, PV.z - h + 0.36); wall(PV.x - h, PV.x - h + 0.36, PV.z - h, PV.z + h);
}
// 井、槐树下的石凳、修着的木桥（过不去）
col(SITE.well.x, SITE.well.z, 0.8);
OB.push({ x: SITE.plank.x, z: SITE.plank.z, hw: 1.3, hd: SITE.plank.len / 2 + 0.8, c: Math.cos(SITE.plank.yaw), s: Math.sin(SITE.plank.yaw) });
// 村里村外的人情物事（大小是约数，屋舍那边建好了会再报准的）
{
  const M = SITE.more;
  for (const [a, b] of [[-1.25, -1.05], [1.25, -1.05], [-1.25, 1.05], [1.25, 1.05]]) col(M.teaShed.x + a, M.teaShed.z + b, 0.1);
  col(M.teaShed.x + 0.7, M.teaShed.z - 0.5, 0.36);
  OB.push({ x: M.mill.x, z: M.mill.z, hw: 1.7, hd: 1.4, c: Math.cos(M.mill.yaw), s: Math.sin(M.mill.yaw), tall: true });
  OB.push({ x: M.oxShed.x, z: M.oxShed.z, hw: 2.1, hd: 1.5, c: Math.cos(M.oxShed.yaw), s: Math.sin(M.oxShed.yaw) });
  col(M.dryYard.x + 2.4, M.dryYard.z - 1.2, 0.45);
  col(M.chess.x, M.chess.z, 0.5); col(M.swing.x - 1.1, M.swing.z, 0.12); col(M.swing.x + 1.1, M.swing.z, 0.12);
  wall(M.duckPen.x - 1.3, M.duckPen.x + 1.3, M.duckPen.z - 0.9, M.duckPen.z + 0.9);
  col(M.shrine.x, M.shrine.z, 0.5); wall(M.cart.x - 0.75, M.cart.x + 0.75, M.cart.z - 1.2, M.cart.z + 1.2);
  col(M.wineShop.bench.x, M.wineShop.bench.z, 0.55);
  for (const h of M.haystacks) col(h.x, h.z, 1.25);
  col(M.netRack.x, M.netRack.z, 0.5);
}
/** 上面这些是按总图估的；屋舍那边报上来真的以后，就换成它们（见 useSolids） */
const HARD = { b: B.length, ob: OB.length, d: D.length };
// 树与石
for (const t of TREES) if (t.z > SITE.bounds.z0 - 3) col(t.x, t.z, t.kind === 'bamboo' ? 0.75 : t.r * t.s);
for (const r of ROCKS) if (r.r > 0.36) col(r.x, r.z, r.r * 0.82);

// —— 地势（现算现记，按 8 米见方一块）与水深 ——
/** 画出来的地面（env/land.ts 的网格）。给了它，脚下的高度就与画面一模一样；没给（测试里）就用总图上的地势 */
let terrainFn: ((x: number, z: number) => number) | null = null;
export const setTerrain = (fn: ((x: number, z: number) => number) | null) => { terrainFn = fn; tiles.clear(); cells.clear(); };
const TS = 0.25, TN = 32, tiles = new Map<number, { h: Float32Array; w: Float32Array }>();
function tile(ti: number, tj: number) {
  const key = (ti + 512) * 2048 + tj + 512;
  let t = tiles.get(key);
  if (!t) {
    const n = TN + 1, h = new Float32Array(n * n), w = new Float32Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = (ti * TN + i) * TS, z = (tj * TN + j) * TS;
      h[i * n + j] = terrainFn ? terrainFn(x, z) : ground(x, z);
      w[i * n + j] = waterAt(x, z)?.depth ?? 0;
    }
    tiles.set(key, (t = { h, w }));
  }
  return t;
}
function sample(x: number, z: number, which: 'h' | 'w'): number {
  const gx = x / TS, gz = z / TS, i0 = Math.floor(gx), j0 = Math.floor(gz), ti = Math.floor(i0 / TN), tj = Math.floor(j0 / TN);
  const a = tile(ti, tj)[which], n = TN + 1, i = i0 - ti * TN, j = j0 - tj * TN, fx = gx - i0, fz = gz - j0;
  return (a[i * n + j] * (1 - fx) + a[(i + 1) * n + j] * fx) * (1 - fz) + (a[i * n + j + 1] * (1 - fx) + a[(i + 1) * n + j + 1] * fx) * fz;
}
/** 地势的高度（不管水、不管架起来的面） */
export const terrainY = (x: number, z: number) => sample(x, z, 'h');
/** 这一处水有多深（没有水是 0） */
export const waterDepth = (x: number, z: number) => sample(x, z, 'w');

const inRect = (s: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;

/** 这一点的地面高度（不看挡路的东西）；界外、深水里则 null */
export function groundAt(x: number, z: number, _zone: Zone = 'ground'): number | null {
  if (!inRect(SITE.bounds, x, z)) return null;
  let y: number | null = null;
  for (const s of SURFS) if (onSurf(s, x, z) && (y == null || s.y > y)) y = s.y;
  // 踩得上去的面不会低过看得见的地（踏步石半埋在土里时，脚落在土上）
  if (y != null) return Math.max(y, terrainY(x, z));
  if (waterDepth(x, z) > WADE) return null;
  return terrainY(x, z);
}
/** 这一点站不站得住人（半径 r）：被东西挡着不行 */
export function blocked(x: number, z: number, _zone: Zone = 'ground', r = RADIUS): boolean {
  for (const b of B) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  for (const o of OB) { const dx = x - o.x, dz = z - o.z, lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c; if (Math.abs(lx) < o.hw + r && Math.abs(lz) < o.hd + r) return true; }
  for (const d of D) { const dx = x - d.x, dz = z - d.z, rr = d.r + r; if (dx * dx + dz * dz < rr * rr) return true; }
  for (const d of DYN) { const dx = x - d.x, dz = z - d.z, rr = d.r + r; if (dx * dx + dz * dz < rr * rr) return true; }
  return false;
}
/** 把一点从挡路的东西里推出来（原地改 p） */
function pushOut(p: { x: number; z: number }, r: number) {
  for (let it = 0; it < 3; it++) {
    let hit = false;
    for (const list of [D, DYN]) for (const d of list) {
      const dx = p.x - d.x, dz = p.z - d.z, rr = d.r + r, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) { const l = Math.sqrt(d2) || 1e-4; p.x = d.x + (dx / l) * rr; p.z = d.z + (dz / l) * rr; hit = true; }
    }
    for (const b of B) {
      if (p.x > b.x0 - r && p.x < b.x1 + r && p.z > b.z0 - r && p.z < b.z1 + r) {
        const a = p.x - (b.x0 - r), c = b.x1 + r - p.x, e = p.z - (b.z0 - r), f = b.z1 + r - p.z, m = Math.min(a, c, e, f);
        if (m === a) p.x = b.x0 - r; else if (m === c) p.x = b.x1 + r; else if (m === e) p.z = b.z0 - r; else p.z = b.z1 + r;
        hit = true;
      }
    }
    for (const o of OB) {
      const dx = p.x - o.x, dz = p.z - o.z;
      let lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
      if (Math.abs(lx) < o.hw + r && Math.abs(lz) < o.hd + r) {
        const a = o.hw + r - Math.abs(lx), b = o.hd + r - Math.abs(lz);
        if (a < b) lx = Math.sign(lx || 1) * (o.hw + r); else lz = Math.sign(lz || 1) * (o.hd + r);
        p.x = o.x + lx * o.c + lz * o.s; p.z = o.z - lx * o.s + lz * o.c;
        hit = true;
      }
    }
    if (!hit) break;
  }
}

const PROBE = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707]];
/**
 * 身子放不放得下：脚下高度为 y 的人站在 (x, z)，
 *   身周一圈（半径 r）不能有比脚下高出一截的台子（不然半个身子嵌进去）；
 *   脚边（0.12 米）不能就是沿（不然站到桥外、亭外去了）。水边不算沿——人可以站在水边。
 */
function fits(x: number, z: number, y: number, r: number): boolean {
  for (const [a, b] of PROBE) {
    const g = groundAt(x + a * r, z + b * r);
    if (g != null && g - y > STEP_MAX) return false;
    const g2 = groundAt(x + a * 0.12, z + b * 0.12);
    if (g2 == null || y - g2 > STEP_MAX) return false;
  }
  return true;
}
/** 从高度 fromY 能不能一步站到 (x, z)：能则返回那里的地面高度 */
export function passable(x: number, z: number, fromY: number, zone: Zone = 'ground', r = RADIUS): number | null {
  if (blocked(x, z, zone, r - 0.005)) return null;
  const y = groundAt(x, z);
  if (y == null || Math.abs(y - fromY) > STEP_MAX || !fits(x, z, y, r)) return null;
  return y;
}

export interface Walker { x: number; y: number; z: number; zone: Zone }
/**
 * 从 w 想走到 (nx, nz)：返回实际到得了的位置与那里的地面高度。
 * 被挡住就顺着滑；高差太大、水太深就停在原处那一侧。
 */
export function move(w: Walker, nx: number, nz: number, r = RADIUS): { x: number; y: number; z: number } {
  const ok = (x: number, z: number): { x: number; y: number; z: number } | null => {
    const p = { x, z };
    pushOut(p, r);
    const y = passable(p.x, p.z, w.y, 'ground', r);
    return y == null ? null : { x: p.x, y, z: p.z };
  };
  return ok(nx, nz) ?? ok(nx, w.z) ?? ok(w.x, nz) ?? { x: w.x, y: w.y, z: w.z };
}
/** 能不能站在这里（给点地面行走、落脚点用）；r 是身子的半径 */
export function standable(x: number, z: number, zone: Zone = 'ground', r = RADIUS): number | null {
  if (blocked(x, z, zone, r)) return null;
  const y = groundAt(x, z);
  return y != null && fits(x, z, y, r) ? y : null;
}
/** 找路时身子算宽一点（离柱子、桌角留几厘米），人沿着路走、拐弯时才不会蹭上去 */
const PLAN_R = RADIUS + 0.06;

// —— 找路 ——
// 点了远处的地面、或点了一件事，人要自己走过去：绕开篱笆、树、桌凳，该过桥过桥。
// 把地面按 0.2 米一格看（格子站不站得住人是现算现记的），在格子上找一条最短的路，再把拐弯处拉直。
const CELL = 0.2, OFF = 4096;
const cells = new Map<number, number>();
const ck = (i: number, j: number) => (i + OFF) * 8192 + (j + OFF);
/** 格点处能站人的地面高度；站不住是 NaN。（只记不动的东西：算的时候先把会动的拿开） */
function cellY(i: number, j: number): number {
  const k = ck(i, j);
  let y = cells.get(k);
  if (y === undefined) { const keep = DYN; DYN = []; const s = standable(i * CELL, j * CELL, 'ground', PLAN_R); DYN = keep; y = s == null ? NaN : s; cells.set(k, y); }
  return y;
}
/** 从 a（脚下高 ay）能不能直着走到 b：每 0.1 米探一步。能则返回 b 处的地面高度 */
export function clearLine(ax: number, az: number, ay: number, bx: number, bz: number, zone: Zone = 'ground', r = RADIUS): number | null {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.1));
  let y = ay;
  for (let s = 1; s <= n; s++) { const t = s / n, g = passable(ax + (bx - ax) * t, az + (bz - az) * t, y, zone, r); if (g == null) return null; y = g; }
  return y;
}
const DIRS: Array<[number, number, number]> = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
/**
 * 从 a 走到 b 的路：一串要依次走到的点（不含起点）。b 站不住人时走到它旁边最近的能站处。实在没有路则 null。
 * 直着能到就只有一个点。
 */
export function findPath(ax: number, az: number, ay: number, bx: number, bz: number, zone: Zone = 'ground', maxNodes = 60000): Array<[number, number]> | null {
  const dist = Math.hypot(bx - ax, bz - az);
  if (dist < 60 && clearLine(ax, az, ay, bx, bz, zone, PLAN_R) != null) return [[bx, bz]];
  // 起点、终点各落到最近的能站的格子上
  const near = (x: number, z: number, rad: number, y?: number): [number, number] | null => {
    const i0 = Math.round(x / CELL), j0 = Math.round(z / CELL);
    let best: [number, number] | null = null, bd = 1e9;
    for (let di = -rad; di <= rad; di++) for (let dj = -rad; dj <= rad; dj++) {
      const cy = cellY(i0 + di, j0 + dj);
      if (Number.isNaN(cy) || (y != null && Math.abs(cy - y) > STEP_MAX)) continue;
      const d = Math.hypot((i0 + di) * CELL - x, (j0 + dj) * CELL - z);
      if (d < bd) { bd = d; best = [i0 + di, j0 + dj]; }
    }
    return best;
  };
  const s = near(ax, az, 3, ay), e = near(bx, bz, 6);
  // 窄处（留不出余量）：直着走得到就直着走
  if (!s || !e) return dist < 8 && clearLine(ax, az, ay, bx, bz, zone) != null ? [[bx, bz]] : null;
  const sk = ck(s[0], s[1]), ek = ck(e[0], e[1]);
  const g = new Map<number, number>([[sk, 0]]), from = new Map<number, number>(), done = new Set<number>();
  // 小顶堆：[f, i, j]
  const heap: Array<[number, number, number]> = [[0, s[0], s[1]]];
  const push = (n: [number, number, number]) => {
    heap.push(n);
    let c = heap.length - 1;
    while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let p = 0;
      for (;;) { const l = p * 2 + 1, r = l + 1; let m = p; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === p) break; [heap[p], heap[m]] = [heap[m], heap[p]]; p = m; }
    }
    return top;
  };
  // 估得偏大一点（1.3 倍）：地方大，宁可路稍绕也要快些找到
  const h = (i: number, j: number) => { const dx = Math.abs(i - e[0]), dz = Math.abs(j - e[1]); return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * 1.3; };
  let found = false, count = 0;
  while (heap.length && count++ < maxNodes) {
    const [, i, j] = pop(), k = ck(i, j);
    if (done.has(k)) continue;
    done.add(k);
    if (k === ek) { found = true; break; }
    const y = cellY(i, j), gk = g.get(k)!;
    for (const [di, dj, w] of DIRS) {
      const ny = cellY(i + di, j + dj);
      if (Number.isNaN(ny) || Math.abs(ny - y) > STEP_MAX) continue;
      // 斜着走不许擦着角过去
      if (di && dj) { const a = cellY(i + di, j), b = cellY(i, j + dj); if (Number.isNaN(a) || Number.isNaN(b) || Math.abs(a - y) > STEP_MAX || Math.abs(b - y) > STEP_MAX) continue; }
      const nk = ck(i + di, j + dj), ng = gk + w;
      if (done.has(nk) || (g.get(nk) ?? 1e9) <= ng) continue;
      g.set(nk, ng); from.set(nk, k);
      push([ng + h(i + di, j + dj), i + di, j + dj]);
    }
  }
  if (!found) return dist < 8 && clearLine(ax, az, ay, bx, bz, zone) != null ? [[bx, bz]] : null;
  // 回溯成点列（格子的中心）
  const pts: Array<[number, number]> = [];
  for (let k = ek; k !== sk; k = from.get(k)!) pts.push([(Math.floor(k / 8192) - OFF) * CELL, ((k % 8192) - OFF) * CELL]);
  pts.reverse();
  // 终点本身站得住、从最后一格又直着走得到，就把它接上
  const end = pts[pts.length - 1] ?? [s[0] * CELL, s[1] * CELL];
  if (standable(bx, bz, zone) != null && clearLine(end[0], end[1], cellY(e[0], e[1]), bx, bz, zone) != null) pts.push([bx, bz]);
  // 把拐弯拉直：每次取从当前位置能直着走到的最远一个点
  const out: Array<[number, number]> = [];
  let cx = ax, cz = az, cy = ay, i = 0;
  while (i < pts.length) {
    let far = i, fy: number | null = null;
    for (let j = Math.min(pts.length - 1, i + 80); j > i; j -= j - i > 12 ? 4 : 1) { const y = clearLine(cx, cz, cy, pts[j][0], pts[j][1], zone, j === pts.length - 1 ? RADIUS : PLAN_R); if (y != null) { far = j; fy = y; break; } }
    if (fy == null) fy = clearLine(cx, cz, cy, pts[i][0], pts[i][1], zone) ?? groundAt(pts[i][0], pts[i][1]) ?? cy;
    out.push(pts[far]);
    cx = pts[far][0]; cz = pts[far][1]; cy = fy;
    i = far + 1;
  }
  return out;
}

/** 镜头的杆：从小人到镜头的连线在水平面上被高墙挡住了没有。返回能伸到几成（0…1） */
export function boom(ax: number, az: number, bx: number, bz: number, _zone: Zone = 'ground'): number {
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 0.22)), m = 0.22;
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const b of B) if (b.tall && x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) return Math.max(0, (i - 1) / n);
    for (const o of OB) { if (!o.tall) continue; const dx = x - o.x, dz = z - o.z; if (Math.abs(dx * o.c - dz * o.s) < o.hw + m && Math.abs(dx * o.s + dz * o.c) < o.hd + m) return Math.max(0, (i - 1) / n); }
  }
  return 1;
}

// —— 处：人在哪里 ——
export interface Place { id: string; /** 在屋里几成（草堂里是 1，亭里算小半） */ indoor: number; /** 离水多近（0…1） */ water: number; /** 镜头宜高一些的地方（0…1） */ height: number; /** 头顶多高处有顶（镜头不能更高） */ ceil: number }
export function placeAt(x: number, z: number, _zone: Zone = 'ground'): Place {
  const id = placeId(x, z);
  const inHall = Math.abs(x - H.x) < H.w / 2 - 0.1 && Math.abs(z - H.z) < H.d / 2 - 0.1;
  const inPav = Math.abs(x - PV.x) < PV.half && Math.abs(z - PV.z) < PV.half;
  const st = streamAt(x, z), P = SITE.pond, pe = Math.hypot((x - P.x) / P.rx, (z - P.z) / P.rz);
  const water = Math.max(0, 1 - (st.d - st.w) / 9, 1 - (pe - 1) * 2.2, z > 205 ? 0.8 : 0);
  return { id, indoor: inHall ? 1 : inPav ? 0.35 : 0, water: Math.min(1, water), height: id === 'fields' || id === 'ferry' ? 0.5 : 0, ceil: inHall ? HALL_Y + 2.5 : inPav ? PAV_Y + 2.2 : 99 };
}

/** 给测试与调试用 */
export const _debug = { B, OB, D, get SURFS() { return SURFS; } };
