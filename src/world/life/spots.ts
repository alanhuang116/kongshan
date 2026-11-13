/**
 * 村里的人与生灵各在哪。都从总图（site.ts）算出来：总图挪了屋、挪了田，这里跟着走。
 *
 * 屋舍、凳、桌、船、桥是别人搭的（build/），人只是「坐在、站在它们旁边」——凡是要与那些东西对得上的数
 * （凳在哪、多高，矮桌、石墩、船上的横板……）都集中在这里，各写明了是照着 build/ 里哪一处的做法算的；那边改了，改这里的一行。
 * 角度：yaw = 0 面朝南（+z），π/2 面朝东（+x）。
 */
import { PLOTS, RIVER_Y, SITE, STREAM, TREES, YARD_Y, ground, houseY, streamAt, waterAt, type Plot } from '../site';
import { mulberry32 } from '../core/rng';
import { groundAt, terrainY } from '../walk';

export interface Spot { x: number; z: number; yaw: number }
/** 一个坐处：人的脚（root）放在哪、面朝哪，凳面比脚下高多少，凳心在脚后多远（avatar 的 bench 姿态用） */
export interface Seat extends Spot {
  h: number; cz: number;
  /** 脚踩的那个面有多高（世界高度：台子、屋里的地面、船板）；不给就是地面 */ y?: number;
  /** 从哪一点迈过来坐下（凳前有桌的，得从旁边进）；不给就是正前方半米多 */ from?: [number, number];
}
const H = (id: string) => SITE.houses.find((h) => h.id === id)!;
const X = SITE.more;
/** 某个带朝向的东西（屋、亭、桌）旁边的一点：lx 朝它自己的 +x、lz 朝它自己的 +z。yaw 是相对它再转多少 */
const beside = (o: { x: number; z: number; yaw: number }, lx: number, lz: number, yaw = 0): Spot => {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c, yaw: o.yaw + yaw };
};
/** 某一户屋前屋后的一点（lz 朝屋前） */
export const atHouse = (id: string, lx: number, lz: number, yaw = 0): Spot => beside(H(id), lx, lz, yaw);
/** 各家的门开在正面的哪里（build/village.ts：甲正中，乙偏西，丁偏东，戊偏西） */
const DOOR_X: Record<string, number> = { a: 0, b: -0.9, d: 0.8, e: -0.7, school: 0 };
/** 各家门口（人回家就是走到这里不见了） */
export const door = (id: string): Spot => atHouse(id, DOOR_X[id] ?? 0, H(id).d / 2 + 0.45, Math.PI);
/** 坐在一只凳上：凳心在 (x, z)，人面朝 yaw；脚在凳心前 fwd 米 */
const seatAt = (x: number, z: number, yaw: number, h: number, fwd = 0.34, y?: number, from?: [number, number]): Seat => ({ x: x + Math.sin(yaw) * fwd, z: z + Math.cos(yaw) * fwd, yaw, h, cz: -fwd, y, from });

// —— 修着的木桥（build/waterside.ts plankBridge）：桥横跨溪——总图的 yaw 有两种读法，取与溪更垂直的那一种 ——
const PK = SITE.plank;
export const PLANK = (() => {
  const st = streamAt(PK.x, PK.z), nx = -st.tz, nz = st.tx, a1 = [Math.sin(PK.yaw), Math.cos(PK.yaw)], a2 = [-Math.sin(PK.yaw), Math.cos(PK.yaw)];
  const u = Math.abs(a1[0] * nx + a1[1] * nz) >= Math.abs(a2[0] * nx + a2[1] * nz) ? a1 : a2;
  return { x: PK.x, z: PK.z, yaw: Math.atan2(u[0], u[1]), half: PK.len / 2, /** 桥面高 */ top: st.y + 0.85 };
})();
/** 桥自己坐标里的一点：lz 沿桥朝南岸，lx 朝东 */
const atPlank = (lx: number, lz: number, yaw = 0): Spot => beside(PLANK, lx, lz, yaw);

/**
 * 人脚下的高度：地势；石桥、踏石上是桥面、石面（walk.ts 的 groundAt）；修着的木桥铺好的那一半上是桥面。
 * 深水里（走不到的地方）退回水底的地势。
 */
export function footY(x: number, z: number): number {
  const dx = x - PLANK.x, dz = z - PLANK.z, c = Math.cos(PLANK.yaw), s = Math.sin(PLANK.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c;
  if (Math.abs(lx) < 0.85 && lz > -0.35 && lz < PLANK.half + 0.3) return Math.max(ground(x, z), PLANK.top);
  return groundAt(x, z) ?? ground(x, z);
}

/** 树干：走路的人绕着它（按六米一格分桶） */
const TRUNKS = new Map<number, Array<[number, number, number]>>();
for (const t of TREES) if (t.kind !== 'bamboo' && t.z > -40) {
  const key = Math.floor(t.x / 6) * 4096 + Math.floor(t.z / 6);
  let a = TRUNKS.get(key); if (!a) TRUNKS.set(key, (a = []));
  a.push([t.x, t.z, t.r * t.s + 0.32]);
}
/** 把一点从树干里推出来（原地改） */
export function clearOfTrees(p: { x: number; z: number }) {
  const bx = Math.floor(p.x / 6), bz = Math.floor(p.z / 6);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [tx, tz, r] of TRUNKS.get((bx + i) * 4096 + bz + j) ?? []) {
    const dx = p.x - tx, dz = p.z - tz, d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 1e-8) { const d = Math.sqrt(d2); p.x = tx + (dx / d) * r; p.z = tz + (dz / d) * r; }
  }
}
/** 从岸上一点朝水里走，找到水边；返回离水 back 米的那一点（back 为负就是站进水里），面朝水 */
function shore(x: number, z: number, dx: number, dz: number, back: number): Spot {
  let k = 0;
  while (k < 40 && !waterAt(x + dx * k, z + dz * k)) k += 0.1;
  return { x: x + dx * (k - back), z: z + dz * (k - back), yaw: Math.atan2(dx, dz) };
}

// ———————————————————————— 田 ————————————————————————
/** 正在耕的那一畦（井田当中的一畦） */
export const FIELD: Plot = PLOTS.find((p) => p.crop === 'plough') ?? PLOTS[0];
/** 垄沿哪个方向：[dx, dz]（rows 0 是东西向） */
export const ROW: [number, number] = FIELD.rows === 0 ? [1, 0] : [0, 1];
/** 畦里的一点：u 沿垄（0…1），v 横着垄（0…1） */
export function inField(u: number, v: number): { x: number; z: number } {
  return FIELD.rows === 0 ? { x: FIELD.x0 + (FIELD.x1 - FIELD.x0) * u, z: FIELD.z0 + (FIELD.z1 - FIELD.z0) * v } : { x: FIELD.x0 + (FIELD.x1 - FIELD.x0) * v, z: FIELD.z0 + (FIELD.z1 - FIELD.z0) * u };
}
/** 送饭的路（自邻家甲过石桥、沿田间路到这一畦的东埂）的最后一点：放下饭篮的地方 */
export const LUNCH_END: [number, number] = X.lunch[X.lunch.length - 1];
const LEND = LUNCH_END;
/** 田埂：农夫歇晌、吃饭坐的地方（畦的东沿，饭篮旁边），面朝田里 */
export const BUND: Spot = { x: FIELD.x1 - 0.5, z: LEND[1] + 0.9, yaw: -Math.PI / 2 };
/** 饭篮、水罐放下的地方；送饭的人站着等的地方 */
export const LUNCH_SET: Spot = { x: FIELD.x1 + 0.15, z: LEND[1] + 0.15, yaw: -Math.PI / 2 };
export const LUNCH_WAIT: Spot = { x: LEND[0] + 0.1, z: LEND[1] - 0.9, yaw: -Math.PI / 2 + 0.5 };
/** 牛白天歇着吃草的地方（畦里东北角）；打谷的场（畦里靠北沿） */
export const OX_REST: Spot = { x: FIELD.x1 - 3.2, z: FIELD.z0 + 3.4, yaw: -Math.PI / 2 + 0.3 };
export const THRESH: Spot = { x: FIELD.x0 + (FIELD.x1 - FIELD.x0) * 0.4, z: FIELD.z0 + 3.2, yaw: 0 };
/** 田间的窝棚（build/fields.ts：棚在 (25.2, 69.6)，西头敞着）：冬天农夫在棚口修农具 */
export const HUT: Spot = { x: 25.2 - 2.3, z: 69.6 + 0.75, yaw: -Math.PI / 2 - 0.5 };
/** 牛棚（build/more.ts oxShed）：牛在棚里站的地方，头朝食槽 */
export const OX_SHED: Spot = beside(X.oxShed, -0.4, 0.45, Math.PI);
/** 牛棚门口（牵牛进出经过的一点） */
export const OX_SHED_FRONT: Spot = beside(X.oxShed, 0.3, 2.6, Math.PI);

// ———————————————————————— 桑园、晒场 ————————————————————————
export const MULBERRIES = (() => {
  const M = SITE.mulberry, cx = (M.x0 + M.x1) / 2, cz = (M.z0 + M.z1) / 2;
  return TREES.filter((t) => t.kind === 'mulberry').sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)).slice(0, 5)
    .sort((a, b) => Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx));
})();
/** 桑园里歇晌的地方 */
export const ORCHARD_REST: Spot = { x: MULBERRIES[0].x + 1.4, z: MULBERRIES[0].z + 0.6, yaw: 0.6 };
/** 晒场上的一领晒席（build/more.ts dryYard：席心在场心 (−1.6, +0.3)，2.7 × 1.7，转 0.12）：秋天摊谷的人沿着它的长边耙 */
export const DRY_MAT = { x: X.dryYard.x - 1.6, z: X.dryYard.z + 0.3, yaw: 0.12, w: 2.7, d: 1.7 };
/** 冬天纺线的地方：邻家甲屋前东头、矮墙没围住的那个口上（院里晾着衣、摆着晒匾，坐在里面从路上看不见），朝着东南 */
export const SPIN: Spot = atHouse('a', 5.1, 4.5, 0.7);

// ———————————————————————— 村塾（build/village.ts） ————————————————————————
/** 屋里的地面比屋基高 0.16；两排矮桌，学童坐在桌西边的席上朝东；先生的坐墩在东头的高桌后面（墩高 0.42），朝西 */
export const SCHOOL_FLOOR = 0.16;
export const SCHOOL_Y = houseY('school') + SCHOOL_FLOOR;
export const DESKS: Spot[] = ([[-2.5 - 0.58, 0.75], [1.0 - 0.58, 0.75], [-0.95 - 0.58, -0.95]] as Array<[number, number]>).map(([lx, lz]) => atHouse('school', lx, lz, Math.PI / 2));
export const TEACHER: Seat = (() => { const tx = H('school').w / 2 - 1.5, st = atHouse('school', tx + 0.62, 0, -Math.PI / 2), fr = atHouse('school', tx + 0.72, 1.2); return seatAt(st.x, st.z, st.yaw, 0.42, 0.34, SCHOOL_Y, [fr.x, fr.z]); })();
/** 先生进屋绕到桌后去经过的一点（前檐当中那一间里） */
export const TEACHER_IN: Spot = atHouse('school', H('school').w / 2 - 2.5, 2.0);
/** 午后先生看书的地方：前檐下西头那一间的台沿上，面朝外（脚下是屋里的地面） */
export const TEACHER_PORCH: Spot = atHouse('school', -3.3, H('school').d / 2 + 0.2, 0.25);
/** 到檐下去先走到的一点（台前） */
export const TEACHER_PORCH_IN: Spot = atHouse('school', -3.3, H('school').d / 2 + 1.5);
/** 进出村塾经过的一点（前檐外） */
export const SCHOOL_FRONT: Spot = atHouse('school', 0, H('school').d / 2 + 1.5, Math.PI);
/** 秋千（build/more.ts swing）：板面离地 0.555，荡的方向是它自己的 z；孩子坐在板上、脚悬着 */
export const SWING = { x: X.swing.x, z: X.swing.z, yaw: 0.3, seatY: 0.555, /** 从秋千正前方（村路边）走过去 */ front: [X.swing.x + Math.sin(0.3) * 1.7, X.swing.z + Math.cos(0.3) * 1.7] as [number, number] };

// ———————————————————————— 槐树下（build/village.ts、build/more.ts） ————————————————————————
/** 石凳：凳心在槐树北 2.2 米，长向东西，凳面高 0.44。老人坐在西头，面朝南（对着树与路） */
export const ELDER: Seat = seatAt(SITE.elm.x + 0.25 - 0.36, SITE.elm.z - 2.2, 0.04, 0.44, 0.33);
/** 邻家妇人送茶过来站的地方（老人身前偏右） */
export const VISIT: Spot = { x: ELDER.x - 1.05, z: ELDER.z + 0.3, yaw: Math.PI / 2 - 0.25 };
/** 棋：矮石桌（面高 0.4）在 more.chess，转 0.25；两只石墩（高 0.3）在它南北两头各 0.78 米 */
export const CHESS = (() => {
  const C = X.chess, ry = 0.25, s = Math.sin(ry), c = Math.cos(ry);
  return {
    x: C.x, z: C.z, yaw: ry, top: 0.4,
    /** 北头的石墩（老人）、南头的石墩（另一位） */
    north: seatAt(C.x - 0.78 * s, C.z - 0.78 * c, ry, 0.3, 0.27, undefined, [C.x - 1.0, C.z - 0.6]), south: seatAt(C.x + 0.78 * s, C.z + 0.78 * c, ry + Math.PI, 0.3, 0.27, undefined, [C.x + 1.05, C.z + 0.65]),
    /** 看棋的孩子站在桌东 */
    watch: { x: C.x + 0.98 * c, z: C.z - 0.98 * s, yaw: ry - Math.PI / 2 } as Spot,
  };
})();

// ———————————————————————— 邻家门前 ————————————————————————
export const FEED: Spot = atHouse('b', -1.6, H('b').d / 2 + 4.0, 0.2);
export const SWEEP: Spot[] = [atHouse('b', 2.4, H('b').d / 2 + 3.2, 0.5), atHouse('b', -1.4, H('b').d / 2 + 3.5, -0.4), atHouse('b', 0.5, H('b').d / 2 + 4.4, 0.1)];
/** 黄狗卧在甲家矮墙的口子外面，贴着墙根 */
export const DOG_BED: Spot = atHouse('a', 2.0, 6.75, 1.1);
/** 鸡群常在的两处（甲、乙两家门前） */
export const COOPS: Spot[] = [atHouse('a', 0.6, 8.6, 0), atHouse('b', -0.6, H('b').d / 2 + 4.4, 0)];
/** 鹅在的地方（丁家门前） */
export const GEESE: Spot = atHouse('d', -1.0, H('d').d / 2 + 3.2, 0);
/** 酒家（build/more.ts wineShop）：桌在 more.wineShop.bench，顺着屋的朝向摆，桌面高 0.72；南北各一条凳（高 0.42） */
export const WINE = (() => {
  const B = { ...X.wineShop.bench, yaw: H(X.wineShop.house).yaw };
  const seat = beside(B, -0.25, -0.62), fr = beside(B, -1.2, -0.9);
  return {
    table: B as Spot, top: 0.72,
    /** 靠屋那条凳东头的酒客，面朝桌、朝路；从凳的东头迈进去 */ drinker: seatAt(seat.x, seat.z, B.yaw, 0.42, 0.3, undefined, [fr.x, fr.z]),
    /** 他的碗在桌上哪（桌自己的坐标） */ bowl: [-0.2, -0.14] as [number, number],
    /** 掌柜站在桌的一头 */ keeper: beside(B, -0.86, 0.06, Math.PI / 2),
    /** 掌柜进出的门口 */ door: door(X.wineShop.house),
  };
})();
/** 洗衣埠（build/more.ts wash）：三块石板一级级下到水里；人跪在中间那块上，朝着水 */
export const WASH = (() => {
  const W = X.wash, wy = streamAt(W.x, W.z).y;
  let ze = W.z;
  while (ze < W.z + 5 && ground(W.x, ze) > wy - 0.02) ze += 0.05;
  return { x: W.x - 0.12, z: ze - 0.78, yaw: 0, /** 她膝下那块石板的面、水面 */ y: wy + 0.2, water: wy, /** 最下一块石板（搓洗、漂衣的地方） */ low: { z: ze + 0.1, y: wy + 0.05 }, way: [[W.x - 0.1, ze - 2.6]] as Array<[number, number]> };
})();
/**
 * 水碓（build/more.ts mill）：碓屋北、西两面是墙，朝溪的一面敞着却紧贴着水，东头横着水轮的长轴——
 * 人只能从东头贴着北墙（轴承桩与墙之间）进去。舂米人蹲在石臼的北边，面朝石臼（也就朝着溪）。
 */
export const MILL = (() => {
  const Mi = X.mill, st = streamAt(Mi.x, Mi.z), l = Math.hypot(st.tx, st.tz) || 1, tx = st.tx / l, tz = st.tz / l, sd = streamAt(Mi.x - tz, Mi.z + tx).d < st.d ? 1 : -1;
  const W = (lx: number, lz: number): [number, number] => [Mi.x + lx * tx - lz * sd * tz, Mi.z + lx * tz + lz * sd * tx];
  const a = W(-2.95, -1.36), b = W(0.05, -1.62), c = W(1.7, -1.75);
  return { /** 臼旁 */ at: { x: a[0], z: a[1], yaw: Math.atan2(W(-3.0, -0.6)[0] - a[0], W(-3.0, -0.6)[1] - a[1]) } as Spot, /** 进出碓屋经过的两点（轴承桩与北墙之间、东头外） */ way: [b, c] as Array<[number, number]> };
})();
/**
 * 茶亭（build/more.ts teaShed）：垫平的台（北沿敞着对着路）、靠南的一条板凳（高 0.44）、东边是茶瓮架。
 * 货郎把担子卸在亭口（台的北沿外），人从担子西头进亭，坐在凳上朝北；孩子们围在担子北边。
 */
export const TEA = (() => {
  const T = X.teaShed, y0 = ground(T.x, T.z - 1.3), b = beside(T, -0.25, 0.68), inn = beside(T, -0.7, -0.35);
  const seat = seatAt(b.x - 0.35, b.z, T.yaw + Math.PI, 0.44, 0.34, y0, [inn.x, inn.z]);
  return {
    seat, y0, /** 担子放下的地方（扁担顺着亭口） */ load: beside(T, 0.25, -1.65) as Spot, /** 卸担、挑担时人站的地方（担子北边，面朝亭） */ stand: beside(T, 0.25, -2.35) as Spot,
    /** 进亭经过的一点（担子西头与亭柱之间） */ inn: beside(T, -0.85, -1.5) as Spot,
    /** 孩子们围过来站的地方（担子北边、路边） */ crowd: [beside(T, -0.6, -2.85, 0), beside(T, 0.5, -3.1, 0), beside(T, 1.35, -2.75, 0)],
  };
})();

// ———————————————————————— 孩子们玩的地方 ————————————————————————
/** 午后玩的空地（槐树以南、溪岸上）；看蚂蚁处；放纸鸢处 */
export const PLAY = { x: SITE.elm.x + 10, z: SITE.elm.z + 16.1, rx: 4.6, rz: 2.2 };
export const ANTS: Spot = { x: PLAY.x - 4.6, z: PLAY.z + 1.1, yaw: -0.8 };
export const KITE: Spot = { x: PLAY.x + 5.6, z: PLAY.z - 1.6, yaw: 0 };
/** 黄昏时童子在石桥上站的地方（桥的东沿，朝下游） */
export const ON_BRIDGE: Spot = { x: SITE.bridge.x + SITE.bridge.w / 2 - 0.42, z: SITE.bridge.z - 0.6, yaw: Math.PI / 2 };

// ———————————————————————— 草堂的院里 ————————————————————————
/** 石桌东北角的那只石凳（build/yard.ts：四只凳在桌心四角各 0.69，高 0.42）：客坐在这里，面朝桌 */
export const GUEST: Seat = seatAt(SITE.table.x + 0.69, SITE.table.z - 0.69, -Math.PI / 4, 0.42, 0.34, undefined, [SITE.table.x - 0.15, SITE.table.z - 1.35]);
/** 客进院的路（柴门里 → 石桌西北，绕开西北角的石凳） */
export const GUEST_WAY: Array<[number, number]> = [[SITE.gate.x, SITE.gate.z - 0.6], [SITE.table.x - 2.6, SITE.table.z - 1.2]];
/** 竹篱的顶有多高（build/yard.ts fence：一米零八，桩再高出一点） */
export const FENCE_TOP = 1.1;
export const FENCE_PERCH = { x0: SITE.gate.x + 3.2, x1: SITE.gate.x + 7.4, z: SITE.yard.z1, y: YARD_Y + FENCE_TOP };
/**
 * 老梅上两只雀落的那一处：就在那根朝石桌探出去的横枝上（x、y、z 是枝背上的一点；dx、dz、dy 是枝在这里的走向）。
 * 梅是草木那边种的（env/flora/plum.ts），枝往哪里折由那棵树的种子定——这里照着它的做法把横枝重走了一遍
 * （同一粒种子、同样的取数次序）。那边改了枝的画法，这里要跟着改：lab 里 flora=1 对着看。
 */
export const PLUM_PERCH = (() => {
  const P = SITE.plum, gy = ground(P.x, P.z), tr = TREES.filter((t) => t.kind === 'plum').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
  if (!tr) return { x: P.x - 0.75, y: gy + 1.95, z: P.z + 0.45, dx: 1, dz: 0, dy: 0 };
  const R = mulberry32(tr.seed), pm = (a: number) => (R() * 2 - 1) * a, rr = (a: number, b: number) => a + (b - a) * R();
  const unit = (v: number[]) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  // 树自己的 +x 朝着石桌，再偏一点
  const yaw = Math.atan2(-(SITE.table.z - tr.z), SITE.table.x - tr.x) + pm(0.2);
  pm(0.05); pm(0.12); pm(0.06); pm(0.14);                                   // 干的头两折
  let p = [0.42, 1.5 + pm(0.08), pm(0.12)];                                   // 横枝从干的第三折上出来
  pm(0.06); pm(0.1); rr(0, 1);                                              // 干梢、节疤
  let d = unit([1, 0.05, pm(0.25)]);
  const len = rr(2.5, 3.0), to = unit([0.8, 0.5, 0]), pts = [p];
  for (let i = 0; i < 8; i++) R();                                          // 另外四根老枝的朝向、长短
  for (let k = 1; k <= 5; k++) {
    const pl = 0.42 * (k / 5);
    d = unit(d.map((v, i) => v + (to[i] - v) * pl));
    const a = (k % 2 ? 1 : -1) * rr(0.4, 1) * 0.8, ca = Math.cos(a), sa = Math.sin(a);
    d = [d[0] * ca + d[2] * sa, d[1], -d[0] * sa + d[2] * ca];
    d = unit([d[0] + pm(0.16), d[1] + pm(0.096), d[2] + pm(0.16)]);
    p = [p[0] + (d[0] * len) / 5, p[1] + (d[1] * len) / 5, p[2] + (d[2] * len) / 5];
    pts.push(p);
  }
  for (let i = 1; i < 5; i++) pts[i][1] -= 0.32 * Math.sin((Math.PI * i) / 5);  // 中段往下压一压
  // 落在第一、二节之间：离干一米上下，枝还粗
  const A = pts[1], B = pts[2], u = 0.5, q = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u], rad = 0.112 + (0.016 - 0.112) * Math.pow((1 + u) / 5, 0.8);
  const c = Math.cos(yaw), sn = Math.sin(yaw), W = (v: number[]) => [(v[0] * c + v[2] * sn) * tr.s, v[1] * tr.s, (-v[0] * sn + v[2] * c) * tr.s];
  const wq = W(q), wd = W([B[0] - A[0], B[1] - A[1], B[2] - A[2]]), hl = Math.hypot(wd[0], wd[2]) || 1;
  return { x: tr.x + wq[0], y: gy + wq[1] + rad * tr.s + 0.004, z: tr.z + wq[2], dx: wd[0] / hl, dz: wd[2] / hl, dy: wd[1] / hl };
})();
/** 草堂南檐下的燕窝（build/life.ts：门东 2.35 米的墙头；墙顶比院子高 floor + wall） */
export const NEST = { x: SITE.hall.x + 2.35, y: YARD_Y + SITE.hall.floor + SITE.hall.wall - 0.32, z: SITE.hall.z + SITE.hall.d / 2 + 0.17 };
/** 猫睡的两处：屋里的榻上（build/inside.ts：榻靠北墙，榻面比屋里地面高 0.42）；松下的矮凳上（build/life.ts：两松之间，凳面高 0.4） */
export const CAT = {
  couch: { x: SITE.inside.couch.x - 0.25, y: YARD_Y + SITE.hall.floor + 0.44, z: SITE.hall.z - (SITE.hall.d / 2 - 0.4) + 0.36, yaw: 1.3 },
  bench: { x: (SITE.pines[0].x + SITE.pines[1].x) / 2 + 0.05, y: YARD_Y + 0.41, z: (SITE.pines[0].z + SITE.pines[1].z) / 2 - 0.35, yaw: 0.2 },
};

// ———————————————————————— 屋后的池 ————————————————————————
/** 老龟晒背的地方：亭前池边半探在水上的那块平石（build/pavilion.ts：石面比水面高 0.2） */
export const TURTLE = (() => {
  const P = SITE.pond, V = SITE.pavilion, z = V.z + 0.4;
  let x = V.x + V.half;
  while (x < P.x && ground(x, z) > P.y - 0.04) x += 0.05;
  return { x: x - 0.3, z, yaw: Math.PI / 2 - 0.5, y: P.y + 0.2 };
})();

// ———————————————————————— 修桥处（build/waterside.ts） ————————————————————————
/** 木马（上面架着一块板，板面离地约 0.7）在桥南头西侧；人贴着板的南头站着，朝北刨 */
export const SAWHORSE = { at: atPlank(-1.87, PLANK.half + 1.9 + 1.1, Math.PI), top: 0.72 };
/** 桥面上钉板的地方（铺到一半的那几块松板跟前，人跪在铺好的桥面上朝北）；上桥经过的桥头 */
export const NAIL: Spot = atPlank(0.05, 1.25, Math.PI);
export const BRIDGE_END: Spot = atPlank(0, PLANK.half + 0.9, Math.PI);
/** 板垛（桥南头东侧一摞板）旁扛板的地方；板送到桥面上放下的地方 */
export const STACK: Spot = atPlank(1.15, PLANK.half + 1.5, Math.PI / 2);
export const CARRY_TO: Spot = atPlank(-0.3, 2.3, Math.PI);
/** 歇晌坐的两处（板垛南边的岸上） */
export const WRIGHT_REST: Spot[] = [atPlank(0.6, PLANK.half + 3.3, Math.PI - 0.4), atPlank(-0.7, PLANK.half + 3.6, Math.PI + 0.5)];
/** 木匠回家的路：木桥没修好，沿溪南的路往西走 */
export const WRIGHT_HOME: Array<[number, number]> = [[PK.x - 4, PK.z + 5.5], [104, 44], [84, 40.5]];

// ———————————————————————— 渡口（build/waterside.ts ferry、build/more.ts netRack） ————————————————————————
export const FERRY = (() => {
  const F = SITE.ferry, gx = ground(F.x + 2, F.z) - ground(F.x - 2, F.z), gz = ground(F.x, F.z + 2) - ground(F.x, F.z - 2), gl = Math.hypot(gx, gz) || 1;
  const o = { x: F.x, z: F.z, yaw: Math.atan2(-gx / gl, -gz / gl) };
  let L = 4;
  while (L < 11 && ground(beside(o, 0, L).x, beside(o, 0, L).z) > RIVER_Y - 0.3) L += 0.25;
  // 乌篷小渔船：泊在栈桥东边 7.2 米，船身转 −0.95；船板比水面低 0.065，尾上一道横板（高出船板 0.24）
  const boat = { ...beside(o, 7.2, L + 0.4), yaw: o.yaw - 0.95 }, floor = RIVER_Y - 0.14 + 0.09;
  // 他斜坐在尾上那道横板上（船尾朝着岸，朝后坐就对着岸了），面朝下游一侧的河水；夜里钻进篷里
  const th = beside(boat, -0.13, -1.53), cab = beside(boat, 0, -1.05), seat = seatAt(th.x, th.z, boat.yaw + Math.PI / 2 + 0.6, 0.24, 0.3, floor, [cab.x, cab.z]);
  return { ...o, L, boat, /** 渔父坐的地方 */ seat, floorY: floor, /** 篷口（他从这里钻进篷里去） */ cabin: { x: cab.x, z: cab.z, yaw: boat.yaw } as Spot };
})();
/** 晒网架（more.netRack，转 0.5）：补网的人站在网前 */
export const NET: Spot = { x: X.netRack.x + Math.sin(0.5) * 0.75, z: X.netRack.z + Math.cos(0.5) * 0.75, yaw: 0.5 + Math.PI };
/**
 * 伊水边上的几处，要按「画出来的地面」来定：那张地面在河边比总图的地势低一截，水边也就更靠里；
 * 所以不在这里先算好，等地面备好了（createLife 的时候）现算。
 */
function riverBank(x: number, z: number, dx: number, dz: number, back: number): Spot {
  let k = 0;
  while (k < 60 && terrainY(x + dx * k, z + dz * k) > RIVER_Y + 0.03) k += 0.1;
  return { x: x + dx * (k - back), z: z + dz * (k - back), yaw: Math.atan2(dx, dz) };
}
/** 樵夫歇脚的地方：渔船东边的岸上，朝着船尾的渔父 */
export function woodcutterSpot(): Spot { const e = beside(FERRY, 12.2, FERRY.L - 22), s = riverBank(e.x, e.z, Math.sin(FERRY.yaw), Math.cos(FERRY.yaw), 0.8); return { x: s.x, z: s.z, yaw: Math.atan2(FERRY.seat.x - s.x, FERRY.seat.z - s.z) }; }
/** 白鹭站的浅水（渡口以西的河滩，离岸一两步） */
export function egretSpots(): Spot[] { return [[-13, 0.2], [-16.5, -0.5], [-21, 0.9]].map(([lx, off], i) => { const e = beside(FERRY, lx, FERRY.L - 22), s = riverBank(e.x, e.z, Math.sin(FERRY.yaw), Math.cos(FERRY.yaw), -1.1 - off); return { ...s, yaw: s.yaw + 1.2 + i * 0.9 }; }); }

// ———————————————————————— 溪上 ————————————————————————
/** 溪上的鸭：石桥下游这一段（沿溪的里程） */
export const DUCK_REACH = (() => { const i0 = STREAM.findIndex((p) => p.x > SITE.bridge.x + 4), i1 = STREAM.findIndex((p) => p.x > SITE.bridge.x + 30); return { s0: STREAM[i0].s, s1: STREAM[i1].s }; })();
/** 牧童放牛的那一带（溪南的草地，桥以西）：两头 */
export const HERD: Array<[number, number]> = X.herd;
/** 那一带当中有一个草垛：牛绕着它走 */
export const HERD_HAY = X.haystacks.reduce((a, b) => { const m = (HERD[0][0] + HERD[1][0]) / 2, n = (HERD[0][1] + HERD[1][1]) / 2; return Math.hypot(b.x - m, b.z - n) < Math.hypot(a.x - m, a.z - n) ? b : a; });
/** 瓜架 */
export const TRELLIS = X.trellis;
