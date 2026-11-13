/**
 * 总图：安乐窝这一方水土在哪里是什么。草木、屋舍、人物、行走、镜头都从这里取数——改位置只改这里。
 *
 * 坐标：+x 东，+z 南，y 向上，单位米。原点是草堂正中。地势北高南低：屋后是竹林与邙山脚，屋前下到溪边，
 * 过溪是一畦畦田，再往南是河滩与伊水。溪自西北来，绕到屋前向东流去，桃林沿溪在西。
 *
 *   西   桃林（沿溪两岸，入口在最西头）
 *   中   小石桥 → 柴门 → 院（菊圃、石桌石凳、老梅、双松）→ 草堂、东厢；屋后小池、观物亭、竹林
 *   南   田畴（麦、菜花、新翻的地、菜畦）、桑园，田间小路通到河滩的渡口
 *   东   邻家几户、村塾、大槐树、井；东头一座正在修的木桥
 *   远   伊水、伊阙、嵩山、邙山（env/far.ts）
 *
 * 这片地方暗里合着邵雍的先天之学：
 *   八方即八卦（先天方位）—— 南乾（天：伊水上的长空、伊阙）、北坤（地：邙山）、东离（日出、村里的烟火）、西坎（溪水出山处）、
 *     东南兑（河湾泽地、渡口）、东北震（飞瀑）、西南巽（风过平畴）、西北艮（最高的石峰）。
 *   加一倍法 —— 一株梅、两株松、四只石凳、八根亭柱、十六丛菊、三十二丛竹、六十四株桃。
 *   四时四花 —— 桃（春）、莲（夏）、菊（秋）、梅（冬）。
 *   井田 —— 溪南西边那九畦田是一个「井」字，当中一畦正在耕。
 */
import { fbm, lerp, mulberry32, smooth } from './core/rng';

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Pt { x: number; z: number }

// —— 院落 ——
/** 院子的地面高度（整平的） */
export const YARD_Y = 8;
export const SITE = {
  /** 草堂：三间，坐北朝南。w×d 是外墙的尺寸；floor 是屋里地面比院子高多少；门开在南墙正中 */
  hall: { x: 0, z: 0, w: 9.6, d: 5.4, floor: 0.3, wall: 2.7, door: 1.6 },
  /** 东厢（灶屋）：门朝西，不进去 */
  wing: { x: 10.4, z: 6.6, w: 3.8, d: 5.2 },
  /** 竹篱围着的一圈 */
  yard: { x0: -11.5, x1: 14.5, z0: -5.5, z1: 16 } as Rect,
  /** 柴门（朝南，门上挂联） */
  gate: { x: 0, z: 16, w: 1.9 },
  /** 西边的小门（去池边、菜畦） */
  sideGate: { x: -11.5, z: 1.5, w: 1.3 },
  /** 菊圃：院里不铺砖石，留一块泥地种菊 */
  mums: { x0: -9.2, x1: -3.8, z0: 6.8, z1: 12.8 } as Rect,
  /** 石桌石凳（凳四只） */
  table: { x: 6.2, z: 11.4 },
  /** 圭表：一根表、一条朝正北的圭，看日影长短知节气 */
  gnomon: { x: 3.4, z: 7.6, h: 1.0, len: 1.9 },
  /** 老梅一株、松两株，都在石桌那一角 */
  plum: { x: 9.2, z: 13.4 }, pines: [{ x: 12.4, z: 10.25 }, { x: 12.7, z: 14.1 }] as Pt[],
  /** 屋里的东西（相对草堂正中；屋里地面是 YARD_Y + hall.floor） */
  inside: {
    /** 书架两架，靠北墙东头 */ shelves: [{ x: 2.2, z: -2.15 }, { x: 3.75, z: -2.15 }] as Pt[],
    /** 书案（东间窗下，诗稿散在上面；《易》《皇极经世》在手边） */ desk: { x: 3.2, z: 0.9 },
    /** 琴（西间，琴几上） */ qin: { x: -3.3, z: -1.2 },
    /** 茶炉（西间靠门） */ stove: { x: -2.4, z: 1.3 },
    /** 酒瓮（堂屋西北角） */ jar: { x: -1.2, z: -2.1 },
    /** 榻（西间靠北墙） */ couch: { x: -3.5, z: -2.0 },
  },
  /** 菜畦（院西） */
  veg: { x0: -24, x1: -14, z0: 2, z1: 13 } as Rect,
  /** 屋后小池（椭圆）与水面的高度 */
  pond: { x: 7, z: -19.5, rx: 8, rz: 6, y: 8.75 },
  /** 观物亭：池西岸的矮亭。floor 是亭里地面比外面高多少 */
  pavilion: { x: -3.8, z: -21, half: 1.9, floor: 0.32 },
  /** 小石桥：三条石板，南北向跨溪 */
  bridge: { x: 0, z: 30, w: 2.0, len: 7.2 },
  /** 汀步：溪里的几块踏脚石（村口） */
  stones: { x: 62, z: 30.6 },
  /** 东头正在修的木桥 */
  plank: { x: 128, z: 49.5, len: 7, yaw: 0.5 },
  /** 村子：几户人家（都不进去）。school 是村塾，前面敞着 */
  houses: [
    { id: 'a', x: 52, z: 6, w: 8.4, d: 5, yaw: 0.12 }, { id: 'b', x: 74, z: -8, w: 7.6, d: 4.8, yaw: -0.2 },
    { id: 'school', x: 99, z: 2, w: 10.2, d: 5.6, yaw: 0.06 }, { id: 'd', x: 120, z: -12, w: 7.6, d: 4.8, yaw: -0.35 }, { id: 'e', x: 82, z: 22, w: 7, d: 4.6, yaw: Math.PI + 0.1 },
  ],
  /** 大槐树（树下石凳，老人常坐）、井 */
  elm: { x: 90, z: 12.5 }, well: { x: 66, z: 15.5 },
  /** 桑园 */
  mulberry: { x0: 74, x1: 121, z0: 47, z1: 68 } as Rect,
  /** 渡口：伊水北岸，渔舟泊在这里 */
  ferry: { x: 132, z: 226 },
  /**
   * 村里村外的人情物事（屋舍、人物各取所需）：
   *   茶亭——路边一间草亭，瓮里是给过路人自取的茶；洗衣埠——溪边几块石板；碓房——溪上一架水碓，咚、咚地舂米；
   *   晒场——两家之间一块夯平的地，碌碡、晒席；牛棚；酒家（村里第五户 e，挑一面酒旗，门口一张桌两条凳）；
   *   秋千（村塾前）；棋（槐树下的石桌）；鸭栏；土地庙；小车（先生出门坐的那辆，停在柴门外的草棚下）；瓜棚（菜畦里）；
   *   草垛；渡口的晒网架；牧童骑牛来回的一段溪岸；晌午给田里送饭走的路。
   */
  more: {
    teaShed: { x: 33.5, z: 24.8, yaw: 0 }, wash: { x: 47, z: 28.7 }, mill: { x: 107, z: 36.2, yaw: 0.4 }, dryYard: { x: 63, z: 3.5, r: 5.6 },
    oxShed: { x: 45.2, z: 0.4, yaw: 0.12 }, wineShop: { house: 'e', bench: { x: 81.4, z: 17.8 } }, swing: { x: 105.6, z: 8.2 }, chess: { x: 91.9, z: 14.6 },
    duckPen: { x: 56.4, z: 26.9 }, shrine: { x: 40.6, z: 19.1 }, cart: { x: -4.8, z: 18.2 }, trellis: { x: -19, z: 8.6 },
    haystacks: [{ x: 26.8, z: 45.3 }, { x: -45.2, z: 44.1 }, { x: 70.8, z: 95.2 }, { x: 58.6, z: -3.4 }] as Pt[],
    netRack: { x: 137.6, z: 221.8 },
    herd: [[-66, 43.6], [-24, 43.9]] as Array<[number, number]>,
    lunch: [[52, 9], [34, 21], [2, 23], [0, 35.4], [22, 41], [22, 77], [-13, 77], [-13, 90]] as Array<[number, number]>,
  },
  /** 入口：桃林最西头，面朝东 */
  entry: { x: -176, z: 41.5, yaw: Math.PI / 2 },
  /** 能走到的范围 */
  bounds: { x0: -188, x1: 152, z0: -46, z1: 236 } as Rect,
};

// —— 田畴 ——
export type Crop = 'wheat' | 'rape' | 'plough' | 'veg' | 'bean' | 'fallow';
export interface Plot extends Rect { crop: Crop; /** 垄的走向：0 东西向，1 南北向 */ rows: 0 | 1; y: number }
const PLOT_DEF: Array<[number, number, number, number, Crop, 0 | 1]> = [
  // 井田：九畦成一个「井」字，当中一畦（公田）正在耕
  [-70, -43, 47, 76, 'wheat', 1], [-41, -14, 47, 76, 'rape', 0], [-12, 15, 47, 76, 'wheat', 0],
  [-70, -43, 78, 107, 'rape', 1], [-41, -14, 78, 107, 'plough', 0], [-12, 15, 78, 107, 'wheat', 1],
  [-70, -43, 109, 138, 'bean', 0], [-41, -14, 109, 138, 'wheat', 0], [-12, 15, 109, 138, 'rape', 1],
  // 路东的几畦
  [27, 69, 47, 68, 'veg', 0], [27, 69, 71, 91, 'wheat', 1], [73, 121, 71, 91, 'rape', 0], [27, 69, 95, 116, 'wheat', 0],
  [73, 121, 95, 116, 'wheat', 1], [27, 69, 119, 139, 'rape', 1], [73, 121, 119, 139, 'fallow', 0],
];

// —— 溪 ——
/** 溪的中线（自上游而下）与各处的半宽 */
const STREAM_CTRL: Array<[number, number, number]> = [
  [-232, -78, 1.3], [-204, -44, 1.5], [-178, -6, 1.6], [-158, 21, 1.8], [-128, 31, 2.0], [-96, 27.5, 2.0], [-62, 31.5, 2.1], [-30, 28.5, 2.1], [0, 30, 2.0],
  [30, 33, 2.2], [62, 30.6, 2.4], [96, 36, 2.3], [128, 49.5, 2.3], [164, 78, 2.5], [206, 126, 2.8], [248, 188, 3.2], [300, 262, 4],
];
/** 伊水的中线与半宽（从伊阙出来，朝北流到田畴之南，折向东） */
export const RIVER: Array<[number, number, number]> = [
  [-420, 3900, 60], [-380, 3100, 62], [-362, 2600, 58], [-330, 2150, 72], [-260, 1650, 95], [-170, 1200, 115], [-80, 820, 130],
  [10, 540, 140], [150, 392, 145], [420, 340, 150], [1000, 390, 155], [1900, 320, 165], [3200, 470, 180], [5200, 150, 200], [8000, -500, 220],
];
/** 伊水水面的高度 */
export const RIVER_Y = -1;

function spline(ctrl: Array<[number, number, number]>, per: number): Array<{ x: number; z: number; w: number; s: number }> {
  const out: Array<{ x: number; z: number; w: number; s: number }> = [], n = ctrl.length;
  const cr = (a: number, b: number, c: number, d: number, t: number) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, x = cr(p0[0], p1[0], p2[0], p3[0], t), z = cr(p0[1], p1[1], p2[1], p3[1], t);
      if (out.length) s += Math.hypot(x - out[out.length - 1].x, z - out[out.length - 1].z);
      out.push({ x, z, w: lerp(p1[2], p2[2], t), s });
    }
  }
  const e = ctrl[n - 1], l = out[out.length - 1];
  out.push({ x: e[0], z: e[1], w: e[2], s: s + Math.hypot(e[0] - l.x, e[1] - l.z) });
  return out;
}
/** 溪：每隔一小段一个点（位置、半宽、自上游起的里程 s、水面高 y） */
export const STREAM: Poly & Array<{ y: number }> = spline(STREAM_CTRL, 10).map((p) => ({ ...p, y: 0 }));
export const RIVER_PTS: Poly = spline(RIVER, 12);

/** 没有溪、池、院子时的地势 */
function base(x: number, z: number): number {
  let h = YARD_Y + Math.min(60, Math.max(0, -z)) * 0.05 + (2.5 + 5.5 * fbm(x * 0.011 + 2, 0.5, 2, 33)) * smooth(-44, -84 - 14 * fbm(x * 0.02, 1.5, 2, 35), z) * smooth(-140, -100, z) - 3 * smooth(-100, -140, z);
  // 院前到溪边是一道缓坡（散步的地方，别陡）
  h -= 1.7 * smooth(12, 32, z) + 2.3 * smooth(42, 140, z) + 2.9 * smooth(140, 262, z);
  h -= 0.007 * Math.max(-200, Math.min(200, x));
  h += (fbm(x * 0.018 + 7, z * 0.018 + 3, 3, 11) - 0.5) * 0.9 * smooth(4, 30, Math.hypot(x, z - 5) - 14);
  return h;
}
// 水往低处流：水面高取「到这里为止岸最低处」再低半米多
{
  let m = 1e9;
  for (const p of STREAM) { m = Math.min(m, base(p.x, p.z) - 0.62); p.y = m; }
}

export interface Near { /** 到中线的距离 */ d: number; /** 那一处的半宽、水面高、里程 */ w: number; y: number; s: number; /** 那一处水流的方向 */ tx: number; tz: number }
type Poly = Array<{ x: number; z: number; w: number; s: number; y?: number }> & { boxes?: Float64Array };
const CH = 12;
function nearest(pts: Poly, x: number, z: number): Near {
  if (!pts.boxes) {
    const n = Math.ceil(pts.length / CH), b = new Float64Array(n * 4);
    for (let c = 0; c < n; c++) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = c * CH; i < Math.min(pts.length, (c + 1) * CH + 1); i++) { x0 = Math.min(x0, pts[i].x); x1 = Math.max(x1, pts[i].x); z0 = Math.min(z0, pts[i].z); z1 = Math.max(z1, pts[i].z); }
      b.set([x0, x1, z0, z1], c * 4);
    }
    pts.boxes = b;
  }
  let bi = 0, bd = 1e18;
  const B = pts.boxes;
  for (let c = 0; c * 4 < B.length; c++) {
    const ex = Math.max(B[c * 4] - x, 0, x - B[c * 4 + 1]), ez = Math.max(B[c * 4 + 2] - z, 0, z - B[c * 4 + 3]);
    if (ex * ex + ez * ez > bd) continue;
    for (let i = c * CH; i < Math.min(pts.length, (c + 1) * CH); i++) { const dx = pts[i].x - x, dz = pts[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
  }
  // 在相邻两段上取最近点
  let best: Near = { d: Math.sqrt(bd), w: pts[bi].w, y: pts[bi].y ?? 0, s: pts[bi].s, tx: 1, tz: 0 };
  for (const j of [bi - 1, bi]) {
    if (j < 0 || j >= pts.length - 1) continue;
    const a = pts[j], b = pts[j + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2)), d = Math.hypot(a.x + ex * t - x, a.z + ez * t - z), l = Math.sqrt(l2);
    if (d <= best.d + 1e-9) best = { d, w: lerp(a.w, b.w, t), y: lerp(a.y ?? 0, b.y ?? 0, t), s: lerp(a.s, b.s, t), tx: ex / l, tz: ez / l };
  }
  return best;
}
/** 离溪多远、那一处的水面多高 */
export const streamAt = (x: number, z: number): Near => nearest(STREAM, x, z);
/** 离伊水中线多远（减去半宽就是离岸多远） */
export const riverAt = (x: number, z: number): Near => nearest(RIVER_PTS, x, z);

const inRect = (r: Rect, x: number, z: number, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
/** 到矩形的距离（里面为负） */
export const rectDist = (r: Rect, x: number, z: number) => { const dx = Math.max(r.x0 - x, x - r.x1), dz = Math.max(r.z0 - z, z - r.z1); return dx > 0 && dz > 0 ? Math.hypot(dx, dz) : Math.max(dx, dz); };

/** 田：每一畦是平的，高度取它正中的地势 */
export const PLOTS: Plot[] = PLOT_DEF.map(([x0, x1, z0, z1, crop, rows]) => ({ x0, x1, z0, z1, crop, rows, y: base((x0 + x1) / 2, (z0 + z1) / 2) - 0.12 }));
export function plotAt(x: number, z: number): Plot | null { for (const p of PLOTS) if (inRect(p, x, z)) return p; return null; }

/** 屋基：各家门前屋后整平的一块（半宽半深，随屋转） */
const PADS = SITE.houses.map((h) => ({ ...h, y: base(h.x, h.z), c: Math.cos(h.yaw), s: Math.sin(h.yaw) }));
/** 邻家屋基的高度 */
export const houseY = (id: string) => PADS.find((p) => p.id === id)?.y ?? YARD_Y;

/** 地面的高度（溪床、池底也算在内） */
export function ground(x: number, z: number): number {
  let h = base(x, z);
  // 院子与屋后池边是整平的
  const yd = rectDist({ x0: SITE.yard.x0 - 1.5, x1: SITE.yard.x1 + 1.5, z0: -30, z1: SITE.yard.z1 + 1 }, x, z);
  if (yd < 9) h = lerp(h, YARD_Y + (z < -6 ? Math.min(1.1, (-z - 6) * 0.075) : 0), smooth(9, 0, yd));
  for (const p of PADS) {
    const lx = (x - p.x) * p.c - (z - p.z) * p.s, lz = (x - p.x) * p.s + (z - p.z) * p.c;
    const d = Math.max(Math.abs(lx) - p.w / 2 - 3, Math.abs(lz) - p.d / 2 - 4);
    if (d < 5) h = lerp(h, p.y, smooth(5, 0, d));
  }
  { const D = SITE.more.dryYard, d = Math.hypot(x - D.x, z - D.z) - D.r; if (d < 4) h = lerp(h, base(D.x, D.z), smooth(4, 0, d)); }
  // 田：畦面是平的，四周一道矮埂
  const pl = plotAt(x, z);
  if (pl) { const e = -rectDist(pl, x, z); h = lerp(h, pl.y + 0.2 * smooth(0.9, 0.35, e), smooth(0, 0.5, e)); }
  // 溪：两岸顺着水面走，中间挖下去
  const st = streamAt(x, z);
  if (st.d < 15) {
    h = lerp(h, st.y + 0.55, smooth(15, 4.5, st.d) * 0.9);
    h -= 1.2 * smooth(st.w + 1.9, st.w * 0.3, st.d);
  }
  // 池
  const P = SITE.pond, pe = Math.hypot((x - P.x) / P.rx, (z - P.z) / P.rz);
  if (pe < 1.5) { h = lerp(h, P.y + 0.3, smooth(1.5, 1.08, pe)); h -= 1.25 * smooth(1.06, 0.55, pe); }
  // 河滩：近伊水处落到水面以下
  const rv = riverAt(x, z), rd = rv.d - rv.w;
  if (rd < 40) h = lerp(h, RIVER_Y - 1.2, smooth(40, -6, rd)) + 0.5 * smooth(40, 14, rd) * smooth(-6, 10, rd);
  return h;
}

/** 这一处有多深的水（没有水是 0）；y 是水面高 */
export function waterAt(x: number, z: number): { depth: number; y: number; kind: 'stream' | 'pond' | 'river' } | null {
  const g = ground(x, z);
  const st = streamAt(x, z);
  if (st.d < st.w + 2 && g < st.y) return { depth: st.y - g, y: st.y, kind: 'stream' };
  const P = SITE.pond;
  if (Math.hypot((x - P.x) / P.rx, (z - P.z) / P.rz) < 1.1 && g < P.y) return { depth: P.y - g, y: P.y, kind: 'pond' };
  if (g < RIVER_Y) return { depth: RIVER_Y - g, y: RIVER_Y, kind: 'river' };
  return null;
}

// —— 路 ——
/** 土路（折线），人走出来的 */
export const PATHS: Array<{ id: string; w: number; pts: Array<[number, number]> }> = [
  { id: '桃林', w: 1.5, pts: [[-186, 42], [-166, 39.5], [-150, 37.5], [-128, 39.5], [-98, 36.5], [-64, 40], [-34, 37.5], [-10, 38], [0, 35.4]] },
  { id: '过桥进门', w: 1.5, pts: [[0, 35.4], [0, 24.6], [0.4, 20], [0, 16]] },
  { id: '村路', w: 1.6, pts: [[0, 22], [16, 22.5], [34, 21], [50, 17], [66, 18.5], [82, 13.5], [98, 11.5], [116, 8], [136, 6], [150, 9]] },
  { id: '溪南', w: 1.4, pts: [[0, 35.4], [10, 39.5], [22, 41], [44, 40], [62, 36.5], [84, 40.5], [104, 44], [124, 54.5], [133, 56]] },
  { id: '田间', w: 1.2, pts: [[22, 41], [22, 69.5], [22, 93], [22, 117.5], [22.5, 141], [40, 165], [78, 192], [112, 214], [132, 226]] },
  { id: '井田横一', w: 1.0, pts: [[-71, 77], [-42, 77], [-13, 77], [22, 77]] },
  { id: '井田横二', w: 1.0, pts: [[-71, 108], [-42, 108], [-13, 108], [22, 108]] },
  { id: '井田纵一', w: 1.0, pts: [[-42, 45.5], [-42, 77], [-42, 108], [-42, 139]] },
  { id: '井田纵二', w: 1.0, pts: [[-13, 45.5], [-13, 77], [-13, 108], [-13, 139]] },
  { id: '田埂东', w: 1.0, pts: [[22, 93], [71, 93], [122, 93]] },
  { id: '池边', w: 1.1, pts: [[-11.5, 1.5], [-15, 0], [-14.5, -10], [-9, -17.5], [-5.6, -20]] },
  { id: '菜畦', w: 1.0, pts: [[-15, 0], [-19, 0.8], [-25, 7]] },
  { id: '踏石', w: 1.2, pts: [[62, 36.5], [62, 30.6], [63, 24.5], [66, 18.5]] },
  { id: '洗衣埠', w: 1.0, pts: [[50, 17], [48.6, 23], [47, 27.9]] },
  { id: '碓房', w: 1.0, pts: [[98, 11.5], [101, 20], [105, 29], [106.4, 34.2]] },
  { id: '茶亭', w: 1.0, pts: [[34, 21], [33.6, 23.4]] },
];
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / l2));
  return Math.hypot(ax + ex * t - px, az + ez * t - pz);
}
/** 离最近的路多远（减去半宽；负的就是在路上） */
export function pathDist(x: number, z: number): number {
  let m = 1e9;
  for (const p of PATHS) for (let i = 0; i < p.pts.length - 1; i++) {
    const a = p.pts[i], b = p.pts[i + 1];
    if (Math.min(a[0], b[0]) - 8 > x || Math.max(a[0], b[0]) + 8 < x || Math.min(a[1], b[1]) - 8 > z || Math.max(a[1], b[1]) + 8 < z) continue;
    m = Math.min(m, segDist(x, z, a[0], a[1], b[0], b[1]) - p.w / 2);
  }
  return m;
}

// —— 草木各在哪（画的人、挡路的图都用这一份） ——
export type TreeKind = 'peach' | 'willow' | 'pine' | 'plum' | 'mulberry' | 'elm' | 'bamboo' | 'wood';
export interface Tree { kind: TreeKind; x: number; z: number; /** 大小（1 是寻常） */ s: number; seed: number; /** 树干多粗（挡路用） */ r: number }
export const TREES: Tree[] = (() => {
  const R = mulberry32(20261113), out: Tree[] = [];
  const rr = (a: number, b: number) => a + (b - a) * R();
  const clear = (x: number, z: number, gap: number) => {
    if (pathDist(x, z) < 1.3 || inRect(SITE.yard, x, z, 1.2) || plotAt(x, z)) return false;
    const st = streamAt(x, z); if (st.d < st.w + 1.6) return false;
    for (const h of SITE.houses) if (Math.hypot(x - h.x, z - h.z) < 8.5) return false;
    for (const t of out) if (Math.hypot(t.x - x, t.z - z) < gap) return false;
    return true;
  };
  const add = (kind: TreeKind, x: number, z: number, s: number, r: number) => out.push({ kind, x, z, s, seed: Math.floor(R() * 1e6), r });
  // 院里：老梅、双松
  add('plum', SITE.plum.x, SITE.plum.z, 1, 0.24);
  SITE.pines.forEach((p, i) => add('pine', p.x, p.z, i ? 0.92 : 1.12, 0.26));
  add('elm', SITE.elm.x, SITE.elm.z, 1.5, 0.55);
  // 桃：沿溪两岸，西头密、近桥疏
  let peach = 0;
  for (let i = 0; i < 4000 && peach < 64; i++) {
    const p = STREAM[Math.floor(rr(34, 92))], side = R() < 0.5 ? -1 : 1, off = p.w + 2.2 + Math.pow(R(), 1.5) * (p.x < -60 ? 24 : 11);
    const x = p.x + rr(-3, 3), z = p.z + side * off;
    if (x > -22 && R() < 0.6) continue;
    if (clear(x, z, 4.6)) { add('peach', x, z, rr(0.85, 1.25), 0.15); peach++; }
  }
  // 柳：溪湾、桥头、池边、河滩
  for (const [x, z, s] of [[-142, 26.5, 1.2], [-78, 24.8, 1.1], [-12, 25.2, 1.25], [14, 36.8, 1.0], [46, 27.6, 1.15], [70, 35.6, 1.1], [112, 37, 1.2], [15.8, -22, 1.0], [150, 62, 1.2], [118, 219, 1.3], [146, 215, 1.15]] as Array<[number, number, number]>) add('willow', x, z, s, 0.3);
  // 桑园：一行一行
  const M = SITE.mulberry;
  for (let x = M.x0 + 4; x < M.x1 - 2; x += 6.6) for (let z = M.z0 + 3.5; z < M.z1 - 2; z += 6) { const tx = x + rr(-0.7, 0.7), tz = z + rr(-0.7, 0.7), ts = rr(0.85, 1.1); if (pathDist(tx, tz) > 1.4) add('mulberry', tx, tz, ts, 0.17); }
  // 村里村外的杂树
  for (let i = 0; i < 220 && out.filter((t) => t.kind === 'wood').length < 26; i++) { const x = rr(40, 150), z = rr(-34, 30); if (clear(x, z, 6.5)) add('wood', x, z, rr(0.8, 1.3), 0.25); }
  // 屋后的竹：一丛一丛（r 是这一丛占的地方）
  let bamboo = 0;
  for (let i = 0; i < 4000 && bamboo < 32; i++) {
    const x = rr(-40, 40), z = rr(-49, -27.5);
    const P = SITE.pond; if (Math.hypot((x - P.x) / (P.rx + 3.5), (z - P.z) / (P.rz + 3.5)) < 1) continue;
    if (Math.hypot(x - SITE.pavilion.x, z - SITE.pavilion.z) < 6) continue;
    if (clear(x, z, 6.2)) { add('bamboo', x, z, rr(0.9, 1.3), 1.1); bamboo++; }
  }
  // 北坡与四围的林（走不到的地方，只是景）
  for (let i = 0; i < 2600 && out.filter((t) => t.kind === 'wood').length < 190; i++) {
    const x = rr(-250, 200), z = rr(-125, -36);
    if (z > -60 && x > -50 && x < 48) continue;
    if (clear(x, z, 7)) add('wood', x, z, rr(0.9, 1.5), 0.28);
  }
  return out;
})();

// —— 石：溪边溪里、池边、桃林路旁 ——
export interface Rock { x: number; z: number; /** 大小（半径，米） */ r: number; seed: number }
export const ROCKS: Rock[] = (() => {
  const R = mulberry32(77), out: Rock[] = [];
  for (let i = 0; i < 90; i++) {
    const p = STREAM[Math.floor(16 + R() * 122)], side = R() < 0.5 ? -1 : 1, x = p.x + (R() - 0.5) * 4, z = p.z + side * p.w * (0.4 + R() * 1.5);
    if (pathDist(x, z) < 0.9 || (Math.abs(x - SITE.bridge.x) < 3 && Math.abs(z - SITE.bridge.z) < 6) || Math.hypot(x - SITE.stones.x, z - SITE.stones.z) < 4.5 || Math.hypot(x - SITE.plank.x, z - SITE.plank.z) < 6) continue;
    out.push({ x, z, r: 0.22 + R() * R() * 0.95, seed: i + 3 });
  }
  const P = SITE.pond;
  for (let i = 0; i < 10; i++) { const a = 0.5 + R() * 5.2, x = P.x + Math.cos(a) * P.rx * 1.03, z = P.z + Math.sin(a) * P.rz * 1.03; out.push({ x, z, r: 0.28 + R() * 0.5, seed: 200 + i }); }
  for (const [x, z, r] of [[-170, 47, 1.5], [-166.5, 48.4, 0.8], [-139, 44.5, 1.1], [-101, 42.5, 1.3], [-99, 44, 0.6], [-52, 44.8, 0.9], [-18.5, 21.2, 1.0], [17, 18.8, 0.7], [30, 44.5, 1.1], [47.5, 33.5, 0.9], [115.5, 222, 1.3], [143, 224.5, 1.0], [-30.5, -14, 1.2], [18.5, -27.5, 1.1]] as Array<[number, number, number]>) out.push({ x, z, r, seed: Math.floor(R() * 1e5) });
  return out;
})();

// —— 分区：这一处是什么（镜头、脚步声、界面上的地名用） ——
export interface PlaceDef { id: string; name: string; /** 村图上点了去的地方：人落在哪、面朝哪 */ spawn: [number, number, number]; /** 一句话 */ note: string }
export const PLACES: PlaceDef[] = [
  { id: 'grove', name: '桃林', spawn: [SITE.entry.x, SITE.entry.z, SITE.entry.yaw], note: '入口是桃林' },
  { id: 'bridge', name: '石桥', spawn: [0, 36.2, Math.PI], note: '溪水清浅' },
  { id: 'yard', name: '院中', spawn: [1.2, 13.6, Math.PI], note: '竹篱茅舍' },
  { id: 'hall', name: '草堂', spawn: [0, 1.2, Math.PI], note: '有书数架' },
  { id: 'pavilion', name: '观物亭', spawn: [-6.6, -19.2, Math.PI * 0.6], note: '看云起，候星移' },
  { id: 'fields', name: '田畴', spawn: [22, 80, 0], note: '春种秋收' },
  { id: 'village', name: '邻家', spawn: [79.5, 12.2, Math.PI / 2], note: '深处是书声' },
  { id: 'ferry', name: '渡口', spawn: [126, 220, 0.3], note: '伊水绕前' },
];
/** 人在哪一处 */
export function placeId(x: number, z: number): string {
  const H = SITE.hall;
  if (Math.abs(x - H.x) < H.w / 2 && Math.abs(z - H.z) < H.d / 2) return 'hall';
  if (inRect(SITE.yard, x, z) && z > -5) return 'yard';
  if (Math.hypot(x - SITE.pavilion.x, z - SITE.pavilion.z) < 9 || (z < -6 && Math.abs(x) < 30)) return 'pavilion';
  if (z > 150) return 'ferry';
  if (z > 44 && x > -72) return 'fields';
  if (x > 36 && z < 34) return 'village';
  if (x < -24) return 'grove';
  return 'bridge';
}
