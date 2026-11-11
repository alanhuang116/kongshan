/**
 * 哪里能走：把整座寺压成一张「地面高度 + 挡路的东西」的图，小人按它走。
 *
 *   地面：院子、平台、殿内是平的；踏跺、石阶是一级一级的；石桥是一道弧。每一处给一个矩形和它的高度。
 *   挡路：墙、柱、门扇、供桌、佛座、香炉、石灯、树、池水、钟鼓楼的砖台……给成方块和圆。
 *   规则：一步之内高差超过一级台阶（0.36 米）的地方上不去也下不来——所以平台只能从踏跺上，人也不会从台沿、桥上掉下去。
 *        碰到挡路的东西会被推开，于是贴着墙走时是顺着墙滑过去的。
 *   钟楼、鼓楼的楼上各是单独的一小块（zone），从楼下的门「上楼」换过去。
 *
 * 数字都从 layout.ts 和各殿的柱网推出来（柱网见 arch/temple.ts）。改了总图或殿的尺寸，要回来对一遍；
 * tests/walk.test.ts 会从山脚把能走到的地方灌一遍，确认各处都走得到、池里和墙外走不到。
 */
import { L, stairY } from './layout';

export type Zone = 'ground' | 'bell' | 'drum';
export interface Box { x0: number; x1: number; z0: number; z1: number; /** 高墙：镜头也过不去 */ tall?: boolean }
export interface Disc { x: number; z: number; r: number }
interface Surf { x0: number; x1: number; z0: number; z1: number; y: number | ((x: number, z: number) => number) }

export const RADIUS = 0.26;
/** 一步能跨的高差 */
export const STEP_MAX = 0.36;
/** 几处地面的高度 */
export const HALL_Y = 1.55, SIDE_Y = 0.54, GATE_Y = 0.72, PAV_Y = 0.43, TOWER_Y = L.tower.h + 0.3, FOOT_Y = -L.stair.drop;
const hx = L.hall.x, hz = L.hall.z, P = L.pond, T = L.terrace, W = L.wall, WH = L.wharf;

/** 踏跺：离台沿 d 处的高度（top 是台面高，共 n 级，每级进深 run） */
const steps = (top: number, d: number, run = 0.34) => { const n = Math.max(1, Math.round(top / 0.16)), rise = top / n; return Math.max(0, top - Math.min(n, Math.floor(Math.max(0, d) / run + 1e-6)) * rise); };
const stepRun = (top: number, run = 0.34) => Math.max(1, Math.round(top / 0.16)) * run;
/** 山道石阶：一级一级的 */
const pathY = (z: number) => { const S = L.stair, n = Math.round(S.drop / 0.16), run = (S.z1 - S.z0) / n; return -Math.min(n, Math.floor(Math.max(0, z - S.z0) / run + 1e-6) + 1) * (S.drop / n); };
const bridgeY = (z: number) => { const t = (z - (P.z0 - 0.5)) / (P.z1 - P.z0 + 1); return L.bridge.rise * (1 - (2 * t - 1) ** 2); };

// —— 平地（高度为 0 的几大块） ——
const BASES: Surf[] = [
  { x0: W.x0 + 0.25, x1: W.x1 - 0.25, z0: W.z0 + 0.25, z1: W.z1 - 0.25, y: 0 },                 // 院内
  { x0: -8.5, x1: 8.5, z0: W.z1 - 0.3, z1: L.stair.z0, y: 0 },                                  // 山门外的平台
  { x0: T.x0 - 0.3, x1: T.x1 - 0.28, z0: T.z0 + 0.28, z1: T.z1 - 0.28, y: 0 },                  // 云台
  { x0: W.x1 - 0.6, x1: T.x0, z0: L.moonGate.z - 0.78, z1: L.moonGate.z + 0.78, y: 0 },         // 月洞门里那一小段
];
// —— 高起来的地面（后面的盖过前面的） ——
const fr = stepRun(1.5), gr = stepRun(0.7), sr = stepRun(0.5), pr = stepRun(0.4);
const SURFS: Surf[] = [
  // 月洞门的门槛
  { x0: W.x1 - 0.45, x1: W.x1 + 0.45, z0: L.moonGate.z - 0.95, z1: L.moonGate.z + 0.95, y: 0.16 },
  // 大殿：台基（连殿内）、正面与东西两侧的踏跺
  { x0: hx - 14, x1: hx + 14, z0: hz - 9, z1: hz + 9, y: HALL_Y },
  { x0: hx - 2.8, x1: hx + 2.8, z0: hz + 9, z1: hz + 9 + fr, y: (_x, z) => steps(1.5, z - (hz + 9)) },
  { x0: hx - 14 - fr, x1: hx - 14, z0: hz + 3.5 - 1.2, z1: hz + 3.5 + 1.2, y: (x) => steps(1.5, hx - 14 - x) },
  { x0: hx + 14, x1: hx + 14 + fr, z0: hz + 3.5 - 1.2, z1: hz + 3.5 + 1.2, y: (x) => steps(1.5, x - (hx + 14)) },
  // 山门：台基与前后踏跺
  { x0: -6.9, x1: 6.9, z0: L.gate.z - 3.6, z1: L.gate.z + 3.6, y: GATE_Y },
  { x0: -2.3, x1: 2.3, z0: L.gate.z + 3.6, z1: L.gate.z + 3.6 + gr, y: (_x, z) => steps(0.7, z - (L.gate.z + 3.6)) },
  { x0: -2.3, x1: 2.3, z0: L.gate.z - 3.6 - gr, z1: L.gate.z - 3.6, y: (_x, z) => steps(0.7, L.gate.z - 3.6 - z) },
  // 经房（西厢，朝东）：台基、踏跺
  { x0: L.study.x - 3.4, x1: L.study.x + 3.4, z0: L.study.z - 6.3, z1: L.study.z + 6.3, y: SIDE_Y },
  { x0: L.study.x + 3.4, x1: L.study.x + 3.4 + sr, z0: L.study.z - 1.5, z1: L.study.z + 1.5, y: (x) => steps(0.5, x - (L.study.x + 3.4)) },
  // 茶寮（东厢，朝西）
  { x0: L.tea.x - 3.4, x1: L.tea.x + 3.4, z0: L.tea.z - 6.3, z1: L.tea.z + 6.3, y: SIDE_Y },
  { x0: L.tea.x - 3.4 - sr, x1: L.tea.x - 3.4, z0: L.tea.z - 1.5, z1: L.tea.z + 1.5, y: (x) => steps(0.5, L.tea.x - 3.4 - x) },
  // 云台的亭：台基、西面的踏跺
  { x0: T.cx - 2.65, x1: T.cx + 2.65, z0: T.cz - 2.65, z1: T.cz + 2.65, y: PAV_Y },
  { x0: T.cx - 2.65 - pr, x1: T.cx - 2.65, z0: T.cz - 0.85, z1: T.cz + 0.85, y: (x) => steps(0.4, T.cx - 2.65 - x) },
  // 池南岸的石埠：驳岸在这里开了口（与铺地齐平），往下一级、再到水边的平台
  { x0: WH.x - WH.w / 2, x1: WH.x + WH.w / 2, z0: P.z1 - 0.36, z1: P.z1, y: WH.step },
  { x0: WH.x - WH.w / 2, x1: WH.x + WH.w / 2, z0: P.z1 - 0.36 - WH.d, z1: P.z1 - 0.36, y: WH.y },
  // 石桥
  { x0: -1.7, x1: 1.7, z0: P.z0 - 0.5, z1: P.z1 + 0.5, y: (_x, z) => bridgeY(z) },
  // 山道石阶、山脚的平台
  { x0: -L.stair.w / 2, x1: L.stair.w / 2, z0: L.stair.z0, z1: L.stair.z1, y: (_x, z) => pathY(z) },
  { x0: -4, x1: 4, z0: L.stair.z1, z1: L.stair.z1 + 6, y: FOOT_Y },
];

// —— 挡路的东西 ——
const B: Box[] = [], D: Disc[] = [];
const wall = (x0: number, x1: number, z0: number, z1: number, tall = true) => B.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), tall });
const wx = (x: number, z0: number, z1: number, t = 0.15, tall = true) => wall(x - t, x + t, z0, z1, tall);      // 沿 z 走的墙
const wz = (z: number, x0: number, x1: number, t = 0.15, tall = true) => wall(x0, x1, z - t, z + t, tall);      // 沿 x 走的墙
const col = (x: number, z: number, r = 0.32) => D.push({ x, z, r });
// 院墙：南墙让出山门，东墙让出月洞门
wz(W.z1, W.x0, -6.9, 0.25); wz(W.z1, 6.9, W.x1, 0.25); wx(W.x0, W.z0, W.z1, 0.25); wz(W.z0, W.x0, W.x1, 0.25);
wx(W.x1, W.z0, L.moonGate.z - 0.78, 0.25); wx(W.x1, L.moonGate.z + 0.78, W.z1, 0.25);
// 大殿：后墙、两山墙、前檐两梢间的窗；门扇（往里开着）、柱
wz(hz - 6, hx - 11, hx + 11); wx(hx - 11, hz - 6, hz + 6); wx(hx + 11, hz - 6, hz + 6);
wz(hz + 6, hx - 11, hx - 7); wz(hz + 6, hx + 7, hx + 11);
for (const [a, b] of [[-6.9, -6.5], [-2.96, -2.6], [-2.4, -2.0], [2.0, 2.4], [2.6, 2.96], [6.5, 6.9]]) wall(hx + a, hx + b, hz + 3.95, hz + 5.95, false);
for (const x of [-7, -2.5, 2.5, 7]) { col(hx + x, hz + 6, 0.42); col(hx + x, hz - 2); col(hx + x, hz + 2); }
// 殿内：佛座、供桌、木鱼与磬的小几、签筒的几
D.push({ x: hx, z: hz - 3.5, r: 2.0 }); wall(hx - 1.86, hx + 1.86, hz - 1.05, hz - 0.05, false);
col(hx - 3.1, hz + 0.2, 0.42); col(hx + 3.1, hz + 0.2, 0.42); wall(hx + 4.62, hx + 5.18, hz + 3.37, hz + 3.83, false);
// 三张拜垫：垫子不是地面，人不从上面踩过去（挡的范围比垫子小一圈，好让人挨着它站）
{
  const K = L.kneeler;
  for (const [x, z] of [[hx, hz + K.dz], [hx - K.side, hz + K.dz + K.sideDz], [hx + K.side, hz + K.dz + K.sideDz]]) wall(x - 0.33, x + 0.33, z - 0.2, z + 0.2, false);
}
// 四个蒲团：同样只挡中间一小块
for (const s of Object.values(L.seat)) col(s.x, s.z, 0.12);
// 山门：两侧的窗间墙、两山墙、门扇、门柱
const gz = L.gate.z;
wz(gz + 2.3, -5.6, -2.1); wz(gz + 2.3, 2.1, 5.6); wz(gz - 2.3, -5.6, -2.1); wz(gz - 2.3, 2.1, 5.6); wx(-5.6, gz - 2.3, gz + 2.3); wx(5.6, gz - 2.3, gz + 2.3);
wall(-2.04, -1.62, gz + 0.5, gz + 2.26, false); wall(1.62, 2.04, gz + 0.5, gz + 2.26, false);
for (const x of [-2.1, 2.1]) { col(x, gz + 2.3, 0.34); col(x, gz - 2.3, 0.3); }
// 经房：后墙、两山墙、前檐两窗间；门扇、门柱；书案
{
  const c = L.study, xb = c.x - 2.5, xf = c.x + 2.5;
  wx(xb, c.z - 5.4, c.z + 5.4); wz(c.z - 5.4, xb, xf); wz(c.z + 5.4, xb, xf); wx(xf, c.z - 5.4, c.z - 1.8); wx(xf, c.z + 1.8, c.z + 5.4);
  wall(xf - 1.45, xf - 0.05, c.z - 1.78, c.z - 1.38, false); wall(xf - 1.45, xf - 0.05, c.z + 1.38, c.z + 1.78, false);
  col(xf, c.z - 1.8, 0.3); col(xf, c.z + 1.8, 0.3);
  wall(c.x - 1.35 - 0.33, c.x - 1.35 + 0.33, c.z - 0.78, c.z + 0.78, false);
}
// 茶寮：后墙、两山墙、前檐两边的矮墙；茶几
{
  const c = L.tea, xb = c.x + 2.5, xf = c.x - 2.5;
  wx(xb, c.z - 5.4, c.z + 5.4); wz(c.z - 5.4, xf, xb); wz(c.z + 5.4, xf, xb); wx(xf, c.z - 5.4, c.z - 1.8, 0.15, false); wx(xf, c.z + 1.8, c.z + 5.4, 0.15, false);
  col(xf, c.z - 1.8, 0.3); col(xf, c.z + 1.8, 0.3);
  wall(c.x - 0.25 - 0.27, c.x - 0.25 + 0.27, c.z - 0.47, c.z + 0.47, false);
}
// 钟楼、鼓楼的砖台
for (const c of [L.bell, L.drum]) wall(c.x - L.tower.r - 0.46, c.x + L.tower.r + 0.46, c.z - L.tower.r - 0.46, c.z + L.tower.r + 0.46);
// 亭柱
for (const sx of [-1.9, 1.9]) for (const sz of [-1.9, 1.9]) col(T.cx + sx, T.cz + sz, 0.2);
// 院里：香炉与两座烛台、石灯、银杏的树池、几棵枫与梅、墙根的竹
D.push({ x: L.censer.x, z: L.censer.z, r: 0.86 }, { x: L.censer.x - 0.92, z: L.censer.z + 0.8, r: 0.2 }, { x: L.censer.x + 0.92, z: L.censer.z + 0.8, r: 0.2 });
D.push({ x: L.lantern.x, z: L.lantern.z, r: 0.52 }, { x: L.ginkgo.x, z: L.ginkgo.z, r: 2.56 });
for (const [x, z] of [[16.2, 31.6], [-18.2, 10.6], [17.4, -7.2], [-20.5, 41], [21, 40.4]]) col(x, z, 0.3);
for (const [x, z] of [[23.4, -12.6], [23.9, -19.2], [23.3, 10.8], [-23.6, 22]]) col(x, z, 0.24);
wall(W.x0, W.x1, W.z0, -22.7, false); wall(W.x0, -23.4, -22.7, -8.2, false);
// 莲池（连驳岸）：桥的两侧各一块；西边那块在石埠处让出一个口子（口子里只挡到水边平台的外沿）
wall(P.x0 - 0.42, WH.x - WH.w / 2, P.z0 - 0.42, P.z1 + 0.42, false); wall(WH.x + WH.w / 2, -1.5, P.z0 - 0.42, P.z1 + 0.42, false);
wall(WH.x - WH.w / 2, WH.x + WH.w / 2, P.z0 - 0.42, P.z1 - 0.36 - WH.d, false);
wall(1.5, P.x1 + 0.42, P.z0 - 0.42, P.z1 + 0.42, false);

/** 楼上：一小块方的地面，中间是钟（连撞木）或鼓 */
const TOP_R = 2.02;
const topBlocked = (zone: Zone, x: number, z: number, r: number) => {
  const c = zone === 'bell' ? L.bell : L.drum, dx = x - c.x, dz = z - c.z;
  if (Math.abs(dx) > TOP_R - r + 0.26 || Math.abs(dz) > TOP_R - r + 0.26) return true;
  if (zone === 'bell') return Math.hypot(dx, dz) < 0.9 + r || (Math.abs(dx) < 0.2 + r && dz > 0.7 && dz < 2.4);
  return Math.abs(dx) < 0.78 + r && Math.abs(dz) < 0.86 + r;
};

const inRect = (s: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;

/** 这一点的地面高度（不看挡路的东西）；界外则 null */
export function groundAt(x: number, z: number, zone: Zone = 'ground'): number | null {
  if (zone !== 'ground') { const c = zone === 'bell' ? L.bell : L.drum; return Math.abs(x - c.x) <= TOP_R && Math.abs(z - c.z) <= TOP_R ? TOWER_Y : null; }
  let y: number | null = null;
  for (const s of BASES) if (inRect(s, x, z)) { y = 0; break; }
  for (const s of SURFS) if (inRect(s, x, z)) y = typeof s.y === 'number' ? s.y : s.y(x, z);
  return y;
}
/** 这一点站不站得住人（半径 r）：被东西挡着、在界外都不行 */
export function blocked(x: number, z: number, zone: Zone = 'ground', r = RADIUS): boolean {
  if (zone !== 'ground') return topBlocked(zone, x, z, r);
  for (const b of B) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  for (const d of D) { const dx = x - d.x, dz = z - d.z, rr = d.r + r; if (dx * dx + dz * dz < rr * rr) return true; }
  return false;
}
/** 把一点从挡路的东西里推出来（原地改 p） */
function pushOut(p: { x: number; z: number }, zone: Zone, r: number) {
  if (zone !== 'ground') return;
  for (let it = 0; it < 3; it++) {
    let hit = false;
    for (const d of D) {
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
    if (!hit) break;
  }
}

const PROBE = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707]];
/**
 * 身子放不放得下：脚下高度为 y 的人站在 (x, z)，
 *   身周一圈（半径 r）不能有比脚下高出一截的台子、也不能出界（不然半个身子嵌进台基或栏外）；
 *   脚边（0.12 米）不能就是台沿（不然站到沿外去了）。
 */
function fits(x: number, z: number, y: number, zone: Zone, r: number): boolean {
  for (const [a, b] of PROBE) {
    const g = groundAt(x + a * r, z + b * r, zone);
    if (g == null || g - y > STEP_MAX) return false;
    const g2 = groundAt(x + a * 0.12, z + b * 0.12, zone);
    if (g2 == null || y - g2 > STEP_MAX) return false;
  }
  return true;
}
/** 从高度 fromY 能不能一步站到 (x, z)：能则返回那里的地面高度 */
export function passable(x: number, z: number, fromY: number, zone: Zone = 'ground', r = RADIUS): number | null {
  if (blocked(x, z, zone, r - 0.005)) return null;
  const y = groundAt(x, z, zone);
  if (y == null || Math.abs(y - fromY) > STEP_MAX || !fits(x, z, y, zone, r)) return null;
  return y;
}

export interface Walker { x: number; y: number; z: number; zone: Zone }
/**
 * 从 w 想走到 (nx, nz)：返回实际到得了的位置与那里的地面高度。
 * 被挡住就顺着滑；高差太大（平台的沿、池岸）就停在原处那一侧。
 */
export function move(w: Walker, nx: number, nz: number, r = RADIUS): { x: number; y: number; z: number } {
  const ok = (x: number, z: number): { x: number; y: number; z: number } | null => {
    const p = { x, z };
    pushOut(p, w.zone, r);
    const y = passable(p.x, p.z, w.y, w.zone, r);
    return y == null ? null : { x: p.x, y, z: p.z };
  };
  return ok(nx, nz) ?? ok(nx, w.z) ?? ok(w.x, nz) ?? { x: w.x, y: w.y, z: w.z };
}
/** 能不能站在这里（给点地面行走、落脚点用） */
export function standable(x: number, z: number, zone: Zone = 'ground'): number | null {
  if (blocked(x, z, zone)) return null;
  const y = groundAt(x, z, zone);
  return y != null && fits(x, z, y, zone, RADIUS) ? y : null;
}

// —— 找路 ——
// 点了远处的地面、或点了一件事，人要自己走过去：绕开桌子、柱子、池子，该过桥过桥，该上踏跺上踏跺。
// 把地面按 0.2 米一格看（格子站不站得住人是现算现记的），在格子上找一条最短的路，再把拐弯处拉直。
const CELL = 0.2, OFF = 2048;
const cells: Record<Zone, Map<number, number>> = { ground: new Map(), bell: new Map(), drum: new Map() };
const ck = (i: number, j: number) => (i + OFF) * 4096 + (j + OFF);
/** 格点处能站人的地面高度；站不住是 NaN */
function cellY(i: number, j: number, zone: Zone): number {
  const m = cells[zone], k = ck(i, j);
  let y = m.get(k);
  if (y === undefined) { const s = standable(i * CELL, j * CELL, zone); y = s == null ? NaN : s; m.set(k, y); }
  return y;
}
/** 从 a（脚下高 ay）能不能直着走到 b：每 0.1 米探一步。能则返回 b 处的地面高度 */
export function clearLine(ax: number, az: number, ay: number, bx: number, bz: number, zone: Zone = 'ground'): number | null {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.1));
  let y = ay;
  for (let s = 1; s <= n; s++) { const t = s / n, g = passable(ax + (bx - ax) * t, az + (bz - az) * t, y, zone); if (g == null) return null; y = g; }
  return y;
}
const DIRS: Array<[number, number, number]> = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
/**
 * 从 a 走到 b 的路：一串要依次走到的点（不含起点）。b 站不住人时走到它旁边最近的能站处。实在没有路则 null。
 * 直着能到就只有一个点。
 */
export function findPath(ax: number, az: number, ay: number, bx: number, bz: number, zone: Zone = 'ground', maxNodes = 26000): Array<[number, number]> | null {
  if (clearLine(ax, az, ay, bx, bz, zone) != null) return [[bx, bz]];
  // 起点、终点各落到最近的能站的格子上
  const near = (x: number, z: number, rad: number, y?: number): [number, number] | null => {
    const i0 = Math.round(x / CELL), j0 = Math.round(z / CELL);
    let best: [number, number] | null = null, bd = 1e9;
    for (let di = -rad; di <= rad; di++) for (let dj = -rad; dj <= rad; dj++) {
      const cy = cellY(i0 + di, j0 + dj, zone);
      if (Number.isNaN(cy) || (y != null && Math.abs(cy - y) > STEP_MAX)) continue;
      const d = Math.hypot((i0 + di) * CELL - x, (j0 + dj) * CELL - z);
      if (d < bd) { bd = d; best = [i0 + di, j0 + dj]; }
    }
    return best;
  };
  const s = near(ax, az, 2, ay), e = near(bx, bz, 4);
  if (!s || !e) return null;
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
  const h = (i: number, j: number) => { const dx = Math.abs(i - e[0]), dz = Math.abs(j - e[1]); return (Math.max(dx, dz) + 0.4142 * Math.min(dx, dz)) * 1.15; };
  let found = false, count = 0;
  while (heap.length && count++ < maxNodes) {
    const [, i, j] = pop(), k = ck(i, j);
    if (done.has(k)) continue;
    done.add(k);
    if (k === ek) { found = true; break; }
    const y = cellY(i, j, zone), gk = g.get(k)!;
    for (const [di, dj, w] of DIRS) {
      const ny = cellY(i + di, j + dj, zone);
      if (Number.isNaN(ny) || Math.abs(ny - y) > STEP_MAX) continue;
      // 斜着走不许擦着角过去
      if (di && dj) { const a = cellY(i + di, j, zone), b = cellY(i, j + dj, zone); if (Number.isNaN(a) || Number.isNaN(b) || Math.abs(a - y) > STEP_MAX || Math.abs(b - y) > STEP_MAX) continue; }
      const nk = ck(i + di, j + dj), ng = gk + w;
      if (done.has(nk) || (g.get(nk) ?? 1e9) <= ng) continue;
      g.set(nk, ng); from.set(nk, k);
      push([ng + h(i + di, j + dj), i + di, j + dj]);
    }
  }
  if (!found) return null;
  // 回溯成点列（格子的中心）
  const pts: Array<[number, number]> = [];
  for (let k = ek; k !== sk; k = from.get(k)!) pts.push([(Math.floor(k / 4096) - OFF) * CELL, ((k % 4096) - OFF) * CELL]);
  pts.reverse();
  // 终点本身站得住、从最后一格又直着走得到，就把它接上
  const end = pts[pts.length - 1] ?? [s[0] * CELL, s[1] * CELL];
  if (standable(bx, bz, zone) != null && clearLine(end[0], end[1], cellY(e[0], e[1], zone), bx, bz, zone) != null) pts.push([bx, bz]);
  // 把拐弯拉直：每次取从当前位置能直着走到的最远一个点
  const out: Array<[number, number]> = [];
  let cx = ax, cz = az, cy = ay, i = 0;
  while (i < pts.length) {
    let far = i, fy: number | null = null;
    for (let j = Math.min(pts.length - 1, i + 80); j > i; j--) { const y = clearLine(cx, cz, cy, pts[j][0], pts[j][1], zone); if (y != null) { far = j; fy = y; break; } }
    if (fy == null) fy = clearLine(cx, cz, cy, pts[i][0], pts[i][1], zone) ?? groundAt(pts[i][0], pts[i][1], zone) ?? cy;
    out.push(pts[far]);
    cx = pts[far][0]; cz = pts[far][1]; cy = fy;
    i = far + 1;
  }
  return out;
}

/** 镜头的杆：从小人到镜头的连线在水平面上被高墙挡住了没有。返回能伸到几成（0…1） */
export function boom(ax: number, az: number, bx: number, bz: number, zone: Zone = 'ground'): number {
  if (zone !== 'ground') return 1;
  const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 0.22)), m = 0.22;
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    for (const b of B) if (b.tall && x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) return Math.max(0, (i - 1) / n);
  }
  return 1;
}

// —— 处：人在哪里 ——
export interface Place { id: string; indoor: number; water: number; height: number; /** 头顶多高处有顶（镜头不能更高） */ ceil: number }
const near = (x: number, z: number, c: { x: number; z: number }, r: number) => (x - c.x) ** 2 + (z - c.z) ** 2 < r * r;
export function placeAt(x: number, z: number, zone: Zone = 'ground'): Place {
  const p = (id: string, indoor = 0, water = 0, height = 0, ceil = 99): Place => ({ id, indoor, water, height, ceil });
  if (zone === 'bell') return p('bell', 0.15, 0, 0.8, TOWER_Y + 3.0);
  if (zone === 'drum') return p('drum', 0.15, 0, 0.8, TOWER_Y + 3.0);
  if (Math.abs(x - hx) < 11 && Math.abs(z - hz) < 6) return p('hall', 1, 0, 0, HALL_Y + 4.6);
  if (Math.abs(x - hx) < 14.6 && z > hz - 9.6 && z < hz + 9.6 + fr) return p('steps', Math.abs(x - hx) < 14 && z < hz + 9 ? 0.25 : 0, 0, 0, Math.abs(x - hx) < 13.5 && z < hz + 8.6 ? HALL_Y + 5.4 : 99);
  if (Math.abs(x) < 5.6 && Math.abs(z - gz) < 2.3) return p('gate', 0.4, 0, 0, GATE_Y + 3.5);
  if (z > L.stair.z0 - 0.5) return p(z > L.stair.z0 + 14 ? 'foot' : 'gate', 0, 0, 0.2);
  if (Math.abs(x) < 7.5 && z > gz - 4.4) return p('gate');
  if (Math.abs(x - L.study.x) < 2.5 && Math.abs(z - L.study.z) < 5.4) return p('study', 0.9, 0, 0, SIDE_Y + 3.2);
  if (Math.abs(x - L.tea.x) < 2.5 && Math.abs(z - L.tea.z) < 5.4) return p('tea', 0.5, 0, 0, SIDE_Y + 3.2);
  if (x > W.x1 - 0.3) return p('terrace', 0, 0, 0.7, Math.abs(x - T.cx) < 1.9 && Math.abs(z - T.cz) < 1.9 ? PAV_Y + 2.7 : 99);
  if (Math.abs(x) < 1.7 && z > P.z0 - 0.5 && z < P.z1 + 0.5) return p('court', 0, 0.7);
  if (near(x, z, L.censer, 4.2)) return p('censer', 0, z > P.z0 - 2.6 ? 0.6 : 0);
  if (x > P.x0 - 3 && x < P.x1 + 3 && z > P.z0 - 2.6 && z < P.z1 + 2.6) return p('pond', 0, 1);
  if (near(x, z, L.ginkgo, 6.2)) return p('tree');
  if (z < hz - 9) return p('back');
  return p('yard');
}

/** 给测试与调试用 */
export const _debug = { B, D, SURFS, BASES };
