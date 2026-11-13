/**
 * 远景：安乐窝四围三百六十度的一卷山水（近处淡彩，远景水墨）。八方即八卦，照邵雍的先天方位布——
 *
 *   南 · 乾（天）  最空阔的一面：伊水从伊阙那道「天门」里出来，朝着人流，阙后是淡淡的几重远山；前面不放高的东西。
 *   北 · 坤（地）  邙山：一带宽而低的土冈，米家山水的烟树——几道缓缓的支脉前后相叠，谷里是烟，冈上一径、一亭。
 *   东 · 离（日）  东峰：村后的一丛石峰。峰与峰之间留着一道缺——日头从嵩山坳里出来，就升在这道缺里。
 *   西 · 坎（水）  西口：桃林尽处「山有小口」的那道石门，门里有光；北边的峡里一线飞泉，溪就从那里来。
 *   东南 · 兑（泽） 伊水的大湾与泽地：沙渚、芦荡、几片积水、帆影；泽中一座孤峰，嵩山（少室峭、太室浑）在它后面。
 *   西北 · 艮（山） 最高最静的一座大山，浑然一块，顶上一松一亭。
 *   东北 · 震（雷） 一面绝壁，大瀑自壁顶直下，脚下水气，壁顶聚着云。
 *   西南 · 巽（风） 一片长长的平畴：成行的柳、杨被风梳向一边，一座矮矮的风蚀土冈上几株偃松，芦花飘着。
 *
 * 山是立体的（走动时前后的山会错开），高度有意夸大——画里的山比眼见的高；树也比真的大得多（靠它们见出山的大）。
 * 山脚化在雾里是 ink.ts 的雾自己做的；这里只管山形、笔墨与那几片会走的云烟。
 * 各部分：far/field 山形与网 · far/stone 山石的画法 · far/crag 石峰 · far/plain 平畴与伊水 · far/veil 水、瀑、云烟 · far/tiles 笔触 · far/life 舟、雁、鸟。
 */
import * as THREE from 'three';
import { FX_LAYER, PIG, dabMat, dabMesh, wash, type Dab, type RGB } from '../ink/ink';
import { atlas } from '../ink/brush';
import { fbm, mulberry32, smooth, type Rng } from '../core/rng';
import { RIVER_Y, SITE, ground } from '../site';
import type { Season } from './atmos';
import { azOf, crestPeaks, fan, polar, quilt, relief, type Field, type Peak, type ReliefOpts, type Sheet } from './far/field';
import { stoneMat } from './far/stone';
import { Crag, peak } from './far/crag';
import { M, MARK, P as PT, PINE, REED, W, WOOD } from './far/tiles';
import { FallGeo, farWaterMat, puffs, type Puff } from './far/veil';
import { NEAR, PLAIN_DENS, PLAIN_PIG, RIVER_FINE, buildPlain, plainY, waterY, type Bar, type Brook, type Field as Plot, type Pool } from './far/plain';
import { Birds, Boats, Geese } from './far/life';

export interface FarOpts { density: number; tex: number }
export interface Far {
  group: THREE.Group;
  update(dt: number, t: number, o: { camera: THREE.PerspectiveCamera; hour: number; night: number; season: Season; wind: number }): void;
  setSeason(s: Season): void;
}

/** 四季：树色（颜料、浓度、疏密）、芦苇与芦花。远了的东西要褪成墨色（只留一成颜色），所以远处的树另给一种艳些的颜料，才留得住一点季相 */
const TONE: Record<Season, { wood: RGB; far: RGB; woodD: number; woodA: number; reed: RGB; plume: RGB; reedD: number }> = {
  spring: { wood: [0.6, 0.73, 0.52], far: [0.44, 0.78, 0.36], woodD: 1.15, woodA: 1, reed: [0.64, 0.76, 0.5], plume: [0.9, 0.87, 0.72], reedD: 1.2 },
  summer: { wood: [0.5, 0.65, 0.5], far: [0.38, 0.66, 0.4], woodD: 1.4, woodA: 1, reed: [0.55, 0.7, 0.46], plume: [0.88, 0.85, 0.68], reedD: 1.4 },
  autumn: { wood: [0.82, 0.6, 0.4], far: [0.93, 0.5, 0.25], woodD: 1.2, woodA: 1, reed: [0.86, 0.76, 0.5], plume: [0.97, 0.94, 0.86], reedD: 1.15 },
  winter: { wood: [0.58, 0.57, 0.57], far: [0.55, 0.56, 0.6], woodD: 1.0, woodA: 0.55, reed: [0.88, 0.82, 0.66], plume: [0.96, 0.94, 0.9], reedD: 0.95 },
};
/** 日落的时刻（与 atmos.ts 一致）：水面的霞色用 */
const DUSK: Record<Season, number> = { spring: 18.2, summer: 19.1, autumn: 17.5, winter: 17.0 };

type Seg = { a: [number, number]; b: [number, number]; ha: number; hb: number; wa: number; wb: number };
/** 一道冈（从 a 到 b，高与宽都渐变）在这一点有多高：横断面是圆浑的 */
function segH(s: Seg, x: number, z: number): number {
  const ex = s.b[0] - s.a[0], ez = s.b[1] - s.a[1], l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - s.a[0]) * ex + (z - s.a[1]) * ez) / l2));
  const u = Math.hypot(s.a[0] + ex * t - x, s.a[1] + ez * t - z) / (s.wa + (s.wb - s.wa) * t);
  return u >= 1 ? 0 : (s.ha + (s.hb - s.ha) * t) * Math.pow(1 - u * u, 1.7);
}
/** 一条折线的冈（各点 [x, z, 高, 半宽]）：取各段里最高的（接头处不鼓包） */
function lineH(pts: Array<[number, number, number, number]>, x: number, z: number): number {
  let m = 0;
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], h = segH({ a: [a[0], a[1]], b: [b[0], b[1]], ha: a[2], hb: b[2], wa: a[3], wb: b[3] }, x, z); if (h > m) m = h; }
  return m;
}

export function createFar(o: FarOpts & { season: Season }): Far {
  const g = new THREE.Group();
  g.name = 'far';
  const dn = Math.max(0.35, o.density), q = Math.sqrt(dn), R: Rng = mulberry32(20261113);
  let season = o.season;
  // 点笔按「哪一种颜料」分开攒，最后各并成一个网格（最多的两种再按方位分成四块，看不见的不画）
  const D: Record<'wood' | 'ever' | 'pine' | 'pineNear' | 'mark' | 'reed' | 'reedNear', Dab[]> = { wood: [], ever: [], pine: [], pineNear: [], mark: [], reed: [], reedNear: [] };
  const mist: Puff[] = [], falls = new FallGeo(), brooks: Brook[] = [];
  const P = (az: number, d: number, h: number, r: number, p?: number, flat?: number, sq?: number): Peak => { const [x, z] = polar(az, d); return { x, z, h, r, p, flat, sq }; };
  const add = (m: THREE.Object3D, name: string) => { m.name = name; g.add(m); return m; };
  const slopeOf = (H: Field, x: number, z: number, e: number): [number, number] => [(H(x + e, z) - H(x - e, z)) / (2 * e), (H(x, z + e) - H(x, z - e)) / (2 * e)];

  // ———————————————————— 远山（几公里外：朝着安乐窝铺开的扇面网） ————————————————————
  const inkBlue: RGB = [0.58, 0.61, 0.665];
  const mFar = stoneMat({ pig: PIG.mo, dens: 0.3, shade: 1.9, grain: 0.0035, cun: 1.0, cunSize: 110, line: 1, snow: 0.7, ink: 2.4, inkPig: inkBlue });
  const mMid = stoneMat({ pig: PIG.mo, dens: 0.32, shade: 1.9, grain: 0.007, cun: 1.0, cunSize: 52, line: 1, snow: 0.7, ink: 2.3, inkPig: inkBlue });
  const mPale = stoneMat({ pig: PIG.mo, dens: 0.22, shade: 1.7, grain: 0.004, cun: 0.7, cunSize: 120, line: 0.8, snow: 0.7, ink: 1.5, inkPig: inkBlue });
  const range = (name: string, m: THREE.Material, ro: ReliefOpts, az: [number, number], d: [number, number], nAz: number, nD: number, o2: { crest?: number; veg?: number; gully?: number } = {}): Sheet => {
    const s = fan({ az, d, nAz: nAz * q, nD: nD * q, H: relief(ro), sink: 25, cull: 0.6, ink: { dens: 0.3, crest: o2.crest ?? 5, gully: o2.gully ?? 0.5, veg: o2.veg ?? 0.5 } });
    add(new THREE.Mesh(s.geo, m), name);
    return s;
  };
  /** 远山肩上的松点：缓处、朝着人的一面、成片 */
  const sprinkle = (s: Sheet, az: [number, number], d: [number, number], n: number, top: number, big = 1) => {
    for (let i = 0; i < n * dn; i++) {
      const a = az[0] + (az[1] - az[0]) * R(), dd = d[0] + (d[1] - d[0]) * R(), [x, z] = polar(a, dd), y = s.H(x, z);
      if (y < top * 0.26 || y > top * 0.88 || fbm(x * 0.0017, z * 0.0017, 2, 9) < 0.47) continue;
      const [sx, sz] = slopeOf(s.H, x, z, dd * 0.004);
      if (Math.hypot(sx, sz) > 0.9 || sx * x + sz * z < 0) continue;
      const size = dd * (0.0085 + 0.004 * R()) * big, tone = 0.72 + 0.4 * R();
      D.ever.push({ x, y: y - s.sink + size * 0.42, z, size, tile: R() < 0.62 ? W.pine : R() < 0.5 ? W.pine2 : W.pepper, r: tone, g: tone, b: tone, rot: (R() - 0.5) * 0.1, sway: 0, nx: -sx, ny: 1, nz: -sz });
    }
  };
  /** 崖上的一线泉：从 (x, z) 起顺着坡往下淌，到坡缓了为止 */
  const thread = (H: Field, sink: number, x: number, z: number, wide: number, maxDrop: number) => {
    const pts: THREE.Vector3[] = [];
    let ax = 0, az2 = 0;
    const y0 = H(x, z);
    for (let k = 0; k < 70; k++) {
      const y = H(x, z), [sx, sz] = slopeOf(H, x, z, 12), sl = Math.hypot(sx, sz);
      pts.push(new THREE.Vector3(x, y - sink, z));
      if ((sl < 0.3 && k > 3) || y0 - y > maxDrop) break;
      const st = 22 / Math.max(0.6, Math.sqrt(1 + sl * sl));
      x -= (sx / (sl || 1)) * st; z -= (sz / (sl || 1)) * st; ax += sx / (sl || 1); az2 += sz / (sl || 1);
    }
    if (pts.length < 4) return null;
    const l = Math.hypot(ax, az2) || 1;
    falls.ribbon(pts, (t) => wide * (0.7 + 0.6 * t), [-az2 / l, ax / l]);
    return pts[pts.length - 1];
  };

  /** 一道挂在石柱竖槽里的瀑布：从崖口往下，贴着槽走；遇到悬岩不往里收（水是直落的） */
  const fallOn = (c: Crag, th: number, drop: number, pad: [number, number], n: number): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [], [bx, bz] = c.lastBase, y0 = c.lastTop - 1.5;
    let dPrev = 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n, y = y0 - drop * Math.pow(t, 0.92);
      let [x, z] = c.lastAt(th, y, pad[0] + pad[1] * t * t);
      const d = Math.hypot(x - bx, z - bz);
      if (d < dPrev && d > 1e-3) { x = bx + ((x - bx) * dPrev) / d; z = bz + ((z - bz) * dPrev) / d; }
      dPrev = Math.max(dPrev, d);
      pts.push(new THREE.Vector3(x, y, z));
    }
    return pts;
  };

  // —— 嵩山：少室在南（三十六峰，峭拔壁立），太室在东（浑厚如屏） ——
  const shaoLine = ([[28, 6850, 900], [32.2, 7250, 1150], [36, 6900, 1380], [39.8, 6800, 1220], [44.5, 7100, 980]] as Array<[number, number, number]>).map(([a, d, h]) => { const [x, z] = polar(a, d); return [x, z, h] as [number, number, number]; });
  const shao = range('少室', mFar, { seed: 11, warp: 170, lam: 380, detail: 0.5, oct: 3, terrace: 4, spur: [7, 0.24], peaks: [
    P(36, 6900, 1380, 760, 0.95, 0, 2.2), P(32.2, 7250, 1150, 600, 1.0, 0, 2.2), P(39.8, 6800, 1220, 560, 1.0, 0, 2.3), P(44.5, 7100, 980, 700, 1.3, 0, 1.6),
    P(28, 6850, 900, 620, 1.2, 0, 1.8), P(38, 6200, 820, 470, 1.1, 0, 2.0), P(33.6, 6100, 680, 430, 1.2, 0, 1.8), P(24, 7300, 700, 900, 1.9), P(42.4, 6250, 600, 460, 1.4, 0, 1.6),
    P(35, 6700, 520, 2300, 1.6), P(30, 6300, 400, 1500, 1.7), P(41, 6400, 420, 1500, 1.7),
    ...crestPeaks(5, shaoLine, 15, { h: [0.74, 0.97], r: [150, 270], off: 190, p: 0.9, sq: 2.5 }),
  ] }, [14, 56], [4300, 8100], 270, 50);
  sprinkle(shao, [18, 50], [5200, 7300], 520, 1300);
  // 少室壁上的几线飞泉，泉脚一团水气
  for (const [a, d, w] of [[34.6, 6560, 20], [38.6, 6500, 16], [31.2, 6820, 16], [42.2, 6700, 15]] as Array<[number, number, number]>) {
    const [x, z] = polar(a, d), end = thread(shao.H, shao.sink, x, z, w, 520);
    if (end) mist.push({ x: end.x, y: end.y + 30, z: end.z, w: 330, h: 110, amount: 0.85 });
  }
  const tai = range('太室', mFar, { seed: 23, warp: 240, lam: 600, detail: 0.42, oct: 3, terrace: 3, spur: [9, 0.2], peaks: [
    P(62, 7800, 1300, 1900, 0.9, 0.12, 2.0), P(55.5, 7500, 1080, 1300, 1.1, 0, 1.8), P(68.5, 8100, 1150, 1500, 1.0, 0.1, 1.9), P(75.5, 8300, 880, 1400, 1.5),
    P(58, 6700, 620, 1100, 1.9), P(66, 6900, 580, 1200, 1.9), P(82, 8600, 660, 1500, 1.8), P(63, 7600, 480, 3200, 1.7),
  ] }, [38, 96], [4300, 9400], 250, 44);
  sprinkle(tai, [46, 88], [5600, 8000], 560, 1250);
  // 太室南麓一支小冈上的塔（嵩岳寺塔）
  { const [x, z] = polar(58.2, 6260), y = tai.H(x, z) - tai.sink; D.mark.push({ x, y: y + 62, z, size: 132, tile: M.pagoda, sway: 0 }); D.ever.push({ x: x - 90, y: y + 30, z: z + 20, size: 80, tile: W.pepper, sway: 0, r: 0.8, g: 0.8, b: 0.8 }, { x: x + 100, y: y + 28, z: z - 10, size: 74, tile: W.pine, sway: 0, r: 0.8, g: 0.8, b: 0.8 }); }
  const qian = range('嵩前', mMid, { seed: 37, warp: 200, lam: 420, detail: 0.6, oct: 3, spur: [6, 0.22], peaks: [
    P(24, 4300, 330, 1100, 1.9), P(33, 4000, 430, 1000, 2.0), P(42, 4200, 370, 1150, 1.9), P(51, 4500, 470, 1200, 2.0), P(60, 4300, 340, 1100, 1.9),
    P(69, 4700, 410, 1250, 1.9), P(78, 4500, 300, 1100, 1.8), P(88, 4900, 330, 1300, 1.8), P(97, 4600, 230, 1100, 1.8),
  ] }, [6, 114], [2800, 5700], 330, 26);
  sprinkle(qian, [10, 110], [3200, 4900], 420, 440, 1.15);
  const dong = range('东冈', mMid, { seed: 41, warp: 130, lam: 260, detail: 0.6, oct: 3, spur: [5, 0.2], peaks: [
    P(47, 2500, 190, 620, 1.9), P(57, 2300, 150, 560, 1.8), P(66, 2600, 220, 680, 2.0), P(76, 2400, 140, 600, 1.8), P(87, 2700, 180, 700, 1.9), P(99, 2500, 130, 640, 1.8), P(110, 2900, 170, 800, 1.8),
  ] }, [30, 128], [1600, 3500], 270, 22);
  sprinkle(dong, [36, 122], [1900, 3000], 300, 200, 1.3);

  // —— 伊阙：两山对峙如门，朝着水的一面是壁；伊水从中间出来 ——
  const [gx, gz] = polar(-8, 2600);
  const longmen = range('龙门山', mMid, { seed: 53, warp: 50, lam: 210, detail: 0.5, oct: 3, terrace: 4, spur: [6, 0.2], peaks: [
    { x: gx - 236, z: gz + 20, h: 356, r: 164, p: 0.75, sq: 5.5 }, { x: gx - 420, z: gz + 200, h: 290, r: 260, p: 1.0, sq: 2.6 }, { x: gx - 640, z: gz + 440, h: 380, r: 520, p: 1.4 }, { x: gx - 780, z: gz - 300, h: 190, r: 400, p: 1.3, sq: 1.6 },
    { x: gx - 980, z: gz + 150, h: 240, r: 560, p: 1.7 }, { x: gx - 1250, z: gz + 700, h: 350, r: 700, p: 1.8 },
  ] }, [-46, -4], [1650, 4300], 230, 38);
  const xiang = range('香山', mMid, { seed: 59, warp: 50, lam: 210, detail: 0.5, oct: 3, terrace: 4, spur: [6, 0.2], peaks: [
    { x: gx + 232, z: gz + 40, h: 322, r: 160, p: 0.75, sq: 5.5 }, { x: gx + 430, z: gz + 230, h: 262, r: 260, p: 1.0, sq: 2.6 }, { x: gx + 660, z: gz + 500, h: 340, r: 520, p: 1.4 }, { x: gx + 780, z: gz - 310, h: 170, r: 400, p: 1.3, sq: 1.6 },
    { x: gx + 1000, z: gz + 250, h: 220, r: 560, p: 1.7 }, { x: gx + 1350, z: gz + 800, h: 320, r: 700, p: 1.8 },
  ] }, [-12, 31], [1650, 4400], 230, 38);
  sprinkle(longmen, [-42, -9], [2000, 3600], 240, 320, 1.5); sprinkle(xiang, [-7, 28], [2000, 3600], 240, 300, 1.5);
  // 香山腰里一座寺
  { const x = gx + 520, z = gz - 150, y = xiang.H(x, z) - xiang.sink; D.mark.push({ x, y: y + 26, z, size: 62, tile: M.temple, sway: 0 }); }
  // 阙后的群山（淡，只是几重影子）
  range('阙南', mPale, { seed: 61, warp: 240, lam: 520, detail: 0.6, oct: 3, spur: [6, 0.2], peaks: [
    P(-22, 5600, 620, 1400, 1.9), P(-12, 6000, 800, 1500, 2.0), P(-3, 5700, 560, 1300, 1.9), P(7, 6200, 720, 1500, 2.0), P(16, 5800, 540, 1300, 1.9),
  ] }, [-34, 28], [3900, 7600], 190, 20, { veg: 0.3 });

  // —— 西面的山（溪水来处）、东北的远山 ——
  const xiPeaks = [P(-38, 3600, 300, 1100, 1.9), P(-52, 3200, 370, 1100, 2.0), P(-66, 3500, 440, 1200, 2.0), P(-80, 3100, 320, 1100, 1.9), P(-95, 3400, 400, 1250, 2.0), P(-110, 3000, 280, 1100, 1.9), P(-126, 3500, 360, 1300, 2.0), P(-142, 3300, 250, 1200, 1.8)];
  const xiRo: ReliefOpts = { seed: 67, warp: 200, lam: 400, detail: 0.58, oct: 3, spur: [6, 0.22], peaks: xiPeaks };
  const xiA = range('西山南', mMid, xiRo, [-90, -24], [1800, 4800], 205, 22), xiB = range('西山北', mMid, xiRo, [-156, -90], [1800, 4800], 205, 22);
  sprinkle(xiA, [-88, -28], [2300, 3900], 260, 420, 1.3); sprinkle(xiB, [-150, -90], [2300, 3900], 260, 400, 1.3);
  range('西远', mPale, { seed: 71, warp: 260, lam: 600, detail: 0.6, oct: 3, terrace: 3, spur: [7, 0.2], peaks: [
    P(-60, 6800, 850, 1700, 2.0), P(-76, 7200, 1080, 1900, 2.1), P(-92, 6900, 800, 1700, 2.0), P(-108, 7400, 940, 1900, 2.0),
  ] }, [-122, -46], [5000, 9200], 190, 18, { veg: 0.3 });
  range('东北远', mPale, { seed: 79, warp: 220, lam: 460, detail: 0.6, oct: 3, spur: [6, 0.2], peaks: [
    P(116, 3900, 290, 1100, 1.9), P(128, 4300, 400, 1200, 2.0), P(141, 4000, 330, 1100, 1.9), P(153, 4500, 380, 1300, 1.9), P(165, 4200, 270, 1150, 1.8), P(176, 4600, 300, 1200, 1.8),
  ] }, [104, 188], [2600, 5800], 205, 18, { veg: 0.3 });

  // ———————————————————— 北 · 坤：邙山 ————————————————————
  const mangRidge: Array<[number, number, number, number]> = [[-580, -600, 58, 170], [-420, -640, 116, 210], [-270, -615, 150, 235], [-110, -660, 136, 230], [40, -630, 163, 245], [200, -665, 141, 230], [350, -620, 153, 225], [480, -650, 108, 200], [610, -610, 56, 170]];
  const mangBack: Array<[number, number, number, number]> = [[-520, -860, 150, 260], [-330, -890, 206, 300], [-120, -930, 188, 300], [70, -940, 226, 320], [260, -925, 192, 300], [430, -895, 204, 290], [600, -860, 140, 250]];
  const mangSpurs: Seg[] = [
    { a: [-420, -640], b: [-470, -330], ha: 102, hb: 46, wa: 122, wb: 86 }, { a: [-270, -615], b: [-238, -300], ha: 134, hb: 58, wa: 132, wb: 92 },
    { a: [-110, -660], b: [-62, -352], ha: 118, hb: 52, wa: 122, wb: 86 }, { a: [40, -630], b: [112, -288], ha: 148, hb: 62, wa: 132, wb: 92 },
    { a: [200, -665], b: [272, -342], ha: 126, hb: 50, wa: 122, wb: 86 }, { a: [350, -620], b: [424, -300], ha: 136, hb: 56, wa: 126, wb: 86 },
  ];
  const mangKnolls: Array<[number, number, number, number]> = [[-640, -390, 60, 155], [-128, -238, 34, 96], [334, -226, 30, 92], [600, -366, 56, 145], [-362, -216, 28, 86], [-700, -540, 72, 175], [712, -512, 68, 175], [60, -206, 22, 78]];
  const mangH: Field = (x, z) => {
    let s = Math.pow(lineH(mangRidge, x, z), 4) + Math.pow(lineH(mangBack, x, z), 4);
    for (const sp of mangSpurs) { const h = segH(sp, x, z); if (h > 0) s += h * h * h * h; }
    for (const k of mangKnolls) { const u = Math.hypot(x - k[0], z - k[1]) / k[3]; if (u < 1) s += Math.pow(k[2] * Math.pow(1 - u * u, 1.7), 4); }
    if (s <= 0) return 0;
    let y = Math.pow(s, 0.25);
    y *= 0.9 + 0.2 * fbm(x / 150 + 3, z / 150, 3, 71);
    return y + (fbm(x * 0.021, z * 0.021, 2, 73) - 0.5) * 6 * smooth(3, 30, y);
  };
  const mMang = stoneMat({ pig: [0.66, 0.67, 0.63], dens: 0.26, shade: 1.5, grain: 0.012, cun: 0.5, cunSize: 22, line: 0.35, snow: 0.6, ink: 1.9, inkPig: [0.6, 0.63, 0.66], keep: 0.25, inkNear: [0.4, 420] });
  const mang = quilt({ x: [-940, 940], z: [-150, -1180], cell: 15 / q, H: mangH, sink: 6, eye: [0, 40], ink: { dens: 0.26, crest: 4.2, gully: 0.5, veg: 0.9, foot: [0.4, 26] } });
  add(new THREE.Mesh(mang.geo, mMang), '邙山');
  // 冈上的一径（从一道支脉的脚盘上去，过亭，上主脊）与亭
  const pathPts: Array<[number, number]> = [[120, -272], [100, -322], [124, -366], [98, -406], [76, -452], [54, -502], [66, -556], [44, -612]];
  const pathCurve = new THREE.CatmullRomCurve3(pathPts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal').getPoints(64);
  const pathNear = (x: number, z: number) => { let m = 1e9; for (const p of pathCurve) m = Math.min(m, Math.hypot(p.x - x, p.z - z)); return m; };
  {
    const pos: number[] = [], idx: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
    pathCurve.forEach((p, i) => {
      const a = pathCurve[Math.max(0, i - 1)], b = pathCurve[Math.min(pathCurve.length - 1, i + 1)];
      let nx = -(b.z - a.z), nz = b.x - a.x; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      for (const s of [-1, 1]) { const x = p.x + nx * s * 2.6, z = p.z + nz * s * 2.6; pos.push(x, mangH(x, z) - mang.sink + 0.9, z); nor.push(0, 1, 0); uv.push(s, i); col.push(1, 1, 1); }
      if (i > 0) { const k = i * 2; idx.push(k - 2, k, k + 1, k - 2, k + 1, k - 1); }
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); pg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); pg.setIndex(idx);
    add(new THREE.Mesh(pg, wash({ pig: [0.97, 0.96, 0.93], dens: 0.5, flat: 1, line: 0, grain: 0.2, snow: 1, side: THREE.DoubleSide })), '邙山径');
  }
  D.mark.push({ x: 98, y: mangH(98, -406) - mang.sink + 8.5, z: -406, size: 19, tile: M.pavilion, sway: 0 });
  // 烟树：一层一层横着的林带，带与带之间留着烟。每一带：下沿是浓的树冠（近树），往上、往后一笔比一笔淡（树后的烟），
  // 再往上是空的；带脚疏疏几株露着干的树。带的高低跟着山形走，又各处错开，不成一条条齐的线
  for (let i = 0; i < 40000 * dn; i++) {
    const x = -900 + 1800 * R(), z = -180 - 900 * R(), y = mangH(x, z);
    if (y < 9 || pathNear(x, z) < 7) continue;
    const band = y / 23 + 2.4 * fbm(x * 0.0042 + 5, z * 0.0042, 2, 5) + 0.35 * fbm(x * 0.02, z * 0.02, 2, 15), f = band - Math.floor(band);
    // 这一带有没有林（有的地方整段空着）
    const grove = fbm(x * 0.006 + Math.floor(band) * 3.7, z * 0.006, 2, 25);
    if (f > 0.64 || grove < 0.36 || R() > 0.35 + 0.65 * smooth(0.64, 0.2, f)) continue;
    const [sx, sz] = slopeOf(mangH, x, z, 10), yy = y - mang.sink, far = smooth(-250, -700, z), u = f / 0.64;
    // 浓淡：带脚最浓，往上淡下去；远的一重整体淡些
    const t = (0.5 + 0.85 * Math.pow(u, 1.1)) * (0.88 + 0.24 * R()) * (1 + 0.2 * far), s = (7 + 5 * R()) * (1 + 0.6 * u) * (1 + 0.35 * far);
    D.wood.push({ x, y: yy + s * 0.34, z, size: s, tile: u > 0.7 && R() < 0.4 ? W.smoke : [W.mi, W.mi2, W.mi, W.dash, W.mi2][Math.floor(R() * 5)], r: t, g: t * (0.97 + 0.06 * R()), b: t, rot: (R() - 0.5) * 0.2, sway: 0.16, nx: -sx, ny: 0.9, nz: -sz });
    // 带脚：露着干的树、寒林的光干（近些才看得见干）
    if (u < 0.22 && z > -480 && R() < 0.2) { const s2 = 10 + 6 * R(), t2 = 0.7 + 0.25 * R(); D.wood.push({ x: x + 3, y: yy + s2 * 0.42 - 2, z: z + 2, size: s2, tile: R() < 0.6 ? W.clump : W.twin, r: t2, g: t2, b: t2, rot: (R() - 0.5) * 0.14, sway: 0.2, nx: -sx, ny: 0.9, nz: -sz }); }
    if (u < 0.3 && R() < 0.035) { const s2 = 8 + 5 * R(); D.ever.push({ x: x + 4, y: yy + s2 * 0.46 - 2, z: z + 3, size: s2, tile: W.bare, r: 0.85, g: 0.85, b: 0.85, rot: (R() - 0.5) * 0.2, sway: 0.1 }); }
  }
  // 冈脊上再压一排浓点（每一重冈的天际线是最浓的一笔）
  const crestDabs = (pts: Array<[number, number]>, n: number, tone: number, big: number) => {
    for (let i = 0; i < n * dn; i++) {
      const f = R() * (pts.length - 1), k = Math.floor(f), t = f - k, x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t + (R() - 0.5) * 30, z = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t + (R() - 0.5) * 30, y = mangH(x, z);
      if (y < 14) continue;
      const s = (8 + 6 * R()) * big, tn = tone * (0.85 + 0.3 * R());
      D.wood.push({ x, y: y - mang.sink + s * 0.36, z, size: s, tile: R() < 0.6 ? W.mi : W.mi2, r: tn, g: tn, b: tn, rot: (R() - 0.5) * 0.2, sway: 0.16, ny: 1 });
    }
  };
  crestDabs(mangRidge.map(([x, z]) => [x, z] as [number, number]), 700, 0.5, 1.1); crestDabs(mangBack.map(([x, z]) => [x, z] as [number, number]), 420, 0.62, 1.5);
  for (const sp of mangSpurs) crestDabs([sp.a, sp.b], 120, 0.5, 1);
  // 谷里的烟
  for (const [x, z, w] of [[-355, -430, 250], [-175, -450, 270], [-10, -440, 230], [165, -470, 270], [312, -440, 230], [-500, -470, 250], [505, -470, 250], [-230, -250, 420], [240, -246, 440], [0, -760, 700]] as Array<[number, number, number]>) mist.push({ x, y: Math.max(14, mangH(x, z) - mang.sink + 14), z, w, h: z < -700 ? 60 : z > -300 ? 30 : 44, amount: 0.9 });

  // ———————————————————— 石峰 ————————————————————
  const mCrag = stoneMat({ pig: [0.66, 0.645, 0.59], dens: 0.34, shade: 1.85, grain: 0.03, cun: 0.8, cunSize: 13, cunBreak: 0.11, strata: [13, 0.16], moss: [2.4, 0.5], line: 1, snow: 0.8, ink: 2.0, inkPig: [0.56, 0.6, 0.68], keep: 0.35, inkNear: [0.45, 320] });
  const mCragBig = stoneMat({ pig: [0.66, 0.645, 0.59], dens: 0.34, shade: 1.85, grain: 0.012, cun: 0.8, cunSize: 22, cunBreak: 0.07, strata: [22, 0.15], moss: [4.5, 0.45], line: 1, snow: 0.8, ink: 2.2, inkPig: [0.56, 0.6, 0.68], keep: 0.3 });
  /** 给一座石峰立松：柱顶几株平顶松，棱台上小些的，崖头垂着灌木；脚下的土石堆上是杂树 */
  const dress = (c: Crag, into: Dab[], size: [number, number], o2: { rim?: number; foot?: boolean; near?: boolean } = {}) => {
    for (const a of c.anchors) {
      const base = Math.max(size[0], Math.min(size[1], a.r * 0.5)), ny = 0.8;
      if (a.kind === 'top') {
        const s = base * (0.75 + 0.5 * R()), t = 0.8 + 0.35 * R();
        into.push({ x: a.x, y: a.y + s * 0.47, z: a.z, size: s, tile: [PT.a, PT.b, PT.c, PT.tall, PT.a, PT.firs][Math.floor(R() * 6)], r: t, g: t, b: t, rot: (R() - 0.5) * 0.1, sway: 0.12, nx: a.nx, ny, nz: a.nz });
        if (R() < (o2.rim ?? 0.5)) { const s2 = base * 0.6; into.push({ x: a.x + a.nx * a.r * 0.2, y: a.y + s2 * 0.2, z: a.z + a.nz * a.r * 0.2, size: s2, tile: PT.scrub, r: 0.85, g: 0.9, b: 0.85, rot: (R() - 0.5) * 0.2, sway: 0.1, nx: a.nx, ny: 0.6, nz: a.nz }); }
      } else if (a.kind === 'ledge') {
        const s = base * (0.5 + 0.35 * R()), t = 0.78 + 0.3 * R();
        into.push({ x: a.x, y: a.y + s * 0.46, z: a.z, size: s, tile: R() < 0.65 ? [PT.a, PT.b, PT.bent][Math.floor(R() * 3)] : PT.scrub, r: t, g: t, b: t, rot: (R() - 0.5) * 0.12, sway: 0.12, nx: a.nx, ny: 0.5, nz: a.nz });
      } else if (o2.near) {
        const s = Math.max(9, Math.min(16, base * 0.8)) * (0.8 + 0.4 * R()), t = 0.8 + 0.3 * R();
        into.push({ x: a.x, y: a.y + s * (0.3 + 0.16 * R()), z: a.z, size: s, tile: [PT.scrub, PT.firs, PT.b, PT.scrub][Math.floor(R() * 4)], r: t, g: t, b: t, rot: (R() - 0.5) * 0.14, sway: 0.15, nx: a.nx, ny: 0.8, nz: a.nz });
      } else if (o2.foot !== false) {
        const s = Math.max(12, Math.min(26, base * 0.9)) * (0.8 + 0.4 * R()), t = 0.85 + 0.3 * R();
        D.wood.push({ x: a.x, y: a.y + s * 0.42, z: a.z, size: s, tile: [W.mi, W.clump, W.broad, W.mi2][Math.floor(R() * 4)], r: t, g: t, b: t, rot: (R() - 0.5) * 0.16, sway: 0.15, nx: a.nx, ny: 0.8, nz: a.nz });
      }
    }
  };

  // —— 西北 · 艮：最高最静的一座大山（是「山」不是「柱」：浑然一块，壁立而顶圆，像范宽的主峰） ——
  {
    const G: [number, number] = [-800, -790];
    const gen = fan({ az: [199, 251], d: [540, 1560], nAz: 250 * q, nD: 56 * q, sink: 8, cull: 0.8, H: relief({ seed: 97, warp: 34, lam: 130, detail: 0.3, oct: 4, terrace: 5, spur: [9, 0.2], peaks: [
      { x: G[0], z: G[1], h: 316, r: 300, p: 0.82, sq: 2.7 }, { x: G[0] - 140, z: G[1] + 150, h: 262, r: 190, p: 0.9, sq: 2.5 }, { x: G[0] + 168, z: G[1] - 130, h: 236, r: 190, p: 0.95, sq: 2.4 },
      { x: G[0] + 120, z: G[1] + 122, h: 150, r: 150, p: 1.0, sq: 2.1 }, { x: G[0] - 10, z: G[1] + 10, h: 84, r: 560, p: 1.7 }, { x: G[0] + 260, z: G[1] + 40, h: 96, r: 130, p: 1.1, sq: 1.8 },
    ] }), ink: { dens: 0.3, crest: 5.5, gully: 0.6, veg: 0.6 } });
    add(new THREE.Mesh(gen.geo, stoneMat({ pig: [0.63, 0.66, 0.65], dens: 0.3, shade: 2.0, grain: 0.012, cun: 1.0, cunSize: 28, line: 1, snow: 0.8, ink: 2.3, inkPig: [0.56, 0.6, 0.68], keep: 0.3 })), '艮');
    // 山顶、山肩密密的杂木与松；顶上独立一松，右肩一亭
    for (let i = 0; i < 2600 * dn; i++) {
      const x = G[0] - 420 + 840 * R(), z = G[1] - 420 + 840 * R(), y = gen.H(x, z);
      if (y < 60) continue;
      const [sx, sz] = slopeOf(gen.H, x, z, 8), sl = Math.hypot(sx, sz);
      if (sl > 0.75 || sx * x + sz * z < -0.2 * Math.hypot(x, z) * sl) continue;
      const s = (15 + 11 * R()) * (y > 200 ? 1 : 0.85), t = 0.72 + 0.4 * R();
      D.pine.push({ x, y: y - gen.sink + s * (R() < 0.5 ? 0.3 : 0.45), z, size: s, tile: [PT.firs, PT.scrub, PT.a, PT.b, PT.firs, PT.c][Math.floor(R() * 6)], r: t, g: t, b: t, rot: (R() - 0.5) * 0.1, sway: 0.1, nx: -sx, ny: 0.8, nz: -sz });
    }
    { const y = gen.H(G[0] + 14, G[1] + 16) - gen.sink; D.pine.push({ x: G[0] + 14, y: y + 27, z: G[1] + 16, size: 60, tile: PT.a, r: 0.72, g: 0.75, b: 0.72, rot: 0.03, sway: 0.1, nx: 0.5, ny: 0.8, nz: 0.5 }); }
    { const x = G[0] + 150, z = G[1] - 110, y = gen.H(x, z) - gen.sink; D.mark.push({ x, y: y + 11, z, size: 26, tile: M.pavilion, sway: 0 }); }
    // 山脚两根石柱（与大山相衬）
    const c = new Crag(0.34);
    c.shaft({ x: G[0] + 30, z: G[1] + 330, h: 112, r: 44, seed: 705, crown: 0.3, ribs: 0.9 });
    c.shaft({ x: G[0] + 64, z: G[1] + 372, h: 70, r: 24, seed: 711, crown: 0.5, ribs: 0.9 });
    c.shaft({ x: G[0] + 350, z: G[1] + 10, h: 86, r: 36, seed: 706, crown: 0.4, ribs: 0.9 });
    for (const [dx, dz, h, r, sd] of [[60, 330, 40, 170, 707], [330, 60, 36, 150, 708]] as Array<[number, number, number, number, number]>) c.shaft({ x: G[0] + dx, z: G[1] + dz, h, r, seed: sd, mound: true, squash: 1.4, turn: -0.7 });
    add(new THREE.Mesh(c.build(), mCrag), '艮前石');
    dress(c, D.pine, [16, 24]);
    mist.push({ x: G[0] + 210, y: 46, z: G[1] + 230, w: 720, h: 90, amount: 1 }, { x: G[0] + 40, y: 60, z: G[1] + 360, w: 520, h: 70, amount: 0.9 }, { x: G[0] + 150, y: 150, z: G[1] + 190, w: 430, h: 44, amount: 0.5 }, { x: G[0] - 260, y: 70, z: G[1] + 330, w: 480, h: 80, amount: 0.8 });
  }

  // —— 东北 · 震：绝壁与大瀑 ——
  {
    const c = new Crag(0.34), Z: [number, number] = [790, -800], thW = Math.atan2(800, -790);            // 朝着安乐窝的那一面
    c.shaft({ x: Z[0] + 30, z: Z[1] - 210, h: 300, r: 190, seed: 722, squash: 1.5, turn: Math.PI / 4, crownStyle: 'stepped', taper: 0.3, ribs: 1, count: Math.round(15 * q), blocks: 3, tone: -0.1 });
    c.shaft({ x: Z[0] + 214, z: Z[1] + 214, h: 212, r: 70, seed: 723, ribs: 1, squash: 1.3, turn: 0.9, lean: [0.03, 0.02] });
    c.shaft({ x: Z[0] - 250, z: Z[1] - 160, h: 188, r: 62, seed: 724, ribs: 1, squash: 1.2, turn: 0.6, lean: [-0.03, 0.01] });
    c.shaft({ x: Z[0] - 150, z: Z[1] + 196, h: 90, r: 40, seed: 725, crown: 0.8, ribs: 0.9 });
    c.shaft({ x: Z[0] + 84, z: Z[1] + 286, h: 66, r: 30, seed: 726, crown: 1.6, ribs: 0.7 });
    for (const [dx, dz, h, r, sd] of [[-120, 190, 46, 210, 727], [170, 250, 42, 190, 728], [-330, -20, 48, 190, 729]] as Array<[number, number, number, number, number]>) c.shaft({ x: Z[0] + dx, z: Z[1] + dz, h, r, seed: sd, mound: true, squash: 1.4, turn: 0.8 });
    // 正面的大壁：平顶，棱棱如管；当中一道深槽，瀑布从槽口下来（最后搭它，好贴着它的壁面挂瀑布）
    c.shaft({ x: Z[0], z: Z[1], h: 276, r: 250, seed: 721, squash: 1.7, turn: Math.PI / 4, crownStyle: 'flat', taper: 0.16, overhang: 0.08, ribs: 1, count: Math.round(24 * q), blocks: 2, flare: 0.14, notch: [thW, 0.17], tilt: [thW, 0.012] });
    const pts = fallOn(c, thW, c.lastTop - 16, [5, 18], 18);
    falls.ribbon(pts, (t) => 26 + 22 * t, [-Math.sin(thW), Math.cos(thW)]);
    add(new THREE.Mesh(c.build(), mCragBig), '震');
    dress(c, D.pine, [18, 30]);
    const foot = pts[pts.length - 1];
    brooks.push({ w: 9, pts: [[foot.x - 6, foot.z + 8], [foot.x - 60, foot.z + 90], [foot.x - 40, foot.z + 210], [foot.x + 60, foot.z + 320], [foot.x + 210, foot.z + 400], [foot.x + 420, foot.z + 450], [foot.x + 720, foot.z + 480]] });
    // 瀑下的水气；壁顶聚着的云（带墨）
    mist.push({ x: foot.x, y: 30, z: foot.z, w: 190, h: 86, amount: 1 }, { x: foot.x - 50, y: 22, z: foot.z + 60, w: 300, h: 60, amount: 0.95 }, { x: foot.x + 120, y: 60, z: foot.z - 20, w: 260, h: 80, amount: 0.7 }, { x: Z[0] - 150, y: 40, z: Z[1] + 300, w: 620, h: 70, amount: 0.9 });
    for (const [dx, dy, dz, w, h, tn] of [[-120, 330, -120, 620, 110, 0.75], [160, 350, -160, 560, 120, 0.9], [20, 306, 60, 500, 80, 0.5], [-330, 290, -60, 420, 80, 0.4], [330, 300, 120, 430, 86, 0.6], [40, 390, -260, 520, 100, 0.8]] as Array<[number, number, number, number, number, number]>) mist.push({ x: Z[0] + dx, y: dy, z: Z[1] + dz, w, h, tone: tn, amount: 0.95 });
  }

  // —— 东 · 离：东峰（日出的那道缺在 D1 与 D2 之间） ——
  {
    const c = new Crag(0.34);
    peak(c, 800, -40, 217, 92, { seed: 741, sides: 4, spires: 1 });
    peak(c, 826, 30, 190, 66, { seed: 742, sides: 2, spires: 1, talus: false });
    peak(c, 690, -150, 170, 62, { seed: 743, sides: 3, spires: 1 });
    peak(c, 902, -172, 236, 80, { seed: 744, sides: 3, spires: 0, main: { tone: -0.12 } });
    peak(c, 796, 255, 164, 60, { seed: 745, sides: 3, spires: 1 });
    peak(c, 1012, 152, 96, 46, { seed: 746, sides: 2, spires: 1, main: { tone: -0.2 } });
    peak(c, 668, 20, 60, 30, { seed: 747, sides: 1, spires: 1, talus: false });
    c.shaft({ x: 820, z: 110, h: 46, r: 240, seed: 748, mound: true, squash: 1.5, turn: 1.3 });
    add(new THREE.Mesh(c.build(), mCrag), '东峰');
    dress(c, D.pine, [15, 26]);
    mist.push({ x: 760, y: 34, z: 0, w: 560, h: 70, amount: 0.95 }, { x: 760, y: 30, z: 250, w: 420, h: 60, amount: 0.9 }, { x: 860, y: 40, z: -180, w: 480, h: 70, amount: 0.9 }, { x: 880, y: 108, z: 60, w: 300, h: 40, amount: 0.5 });
  }

  // —— 西 · 坎：西口（石门，门里有光；北边峡里一线飞泉） ——
  {
    const c = new Crag(0.34), thF = 0.5;
    // 石门的两扇：北高南低，当中一道二十来米宽的缝，正对着桃林的路
    c.shaft({ x: -338, z: -7, h: 100, r: 44, seed: 761, squash: 1.5, turn: 0.06, crownStyle: 'split', taper: 0.38, overhang: 0.12, ribs: 1, count: Math.round(24 * q), blocks: 4, flare: 0.2, lean: [0.012, -0.02], green: 0.6, fade: 0.1, warm: 0.7 });
    c.shaft({ x: -334, z: 86, h: 86, r: 42, seed: 762, squash: 1.45, turn: -0.08, crownStyle: 'stepped', taper: 0.42, overhang: 0.12, ribs: 1, count: Math.round(22 * q), blocks: 3, flare: 0.2, lean: [0.01, 0.025], green: 0.6, fade: 0.1, warm: 0.7 });
    c.shaft({ x: -372, z: -52, h: 74, r: 26, seed: 763, crown: 0.5, ribs: 0.9, green: 0.6 });
    c.shaft({ x: -366, z: 132, h: 62, r: 30, seed: 764, crown: 0.6, ribs: 0.9, green: 0.6 });
    c.shaft({ x: -300, z: 122, h: 30, r: 14, seed: 765, crownStyle: 'dome', ribs: 0.7, green: 0.6 });
    peak(c, -505, 172, 150, 82, { seed: 766, sides: 3, spires: 1, main: { green: 0.6 } });
    peak(c, -590, -60, 168, 86, { seed: 768, sides: 3, spires: 0, main: { tone: -0.15, green: 0.6 } });
    c.shaft({ x: -452, z: -76, h: 134, r: 62, seed: 772, squash: 1.2, turn: 0.5, crownStyle: 'dome', ribs: 0.9, count: Math.round(11 * q), green: 0.6 });
    for (const [x, z, h, r, sd] of [[-350, -30, 16, 70, 769], [-345, 110, 15, 66, 770], [-470, 0, 26, 150, 771], [-415, -160, 22, 96, 773]] as Array<[number, number, number, number, number]>) c.shaft({ x, z, h, r, seed: sd, mound: true, squash: 1.3, turn: 0.2, green: 0.6 });
    // 北边的峡：溪水来处。一线飞泉挂在这座峰朝着安乐窝的一面（最后搭它，好贴着它的壁面挂）；它比近处北坡上的林子高，院里、桥上、桃林里都望得见
    c.shaft({ x: -452, z: -184, h: 96, r: 26, seed: 774, crown: 0.4, ribs: 0.9, green: 0.6 });
    c.shaft({ x: -380, z: -204, h: 72, r: 20, seed: 775, crown: 0.7, ribs: 0.9, green: 0.6 });
    c.shaft({ x: -410, z: -150, h: 130, r: 40, seed: 767, squash: 1.25, turn: 2.1, crownStyle: 'flat', taper: 0.3, ribs: 0.9, count: Math.round(13 * q), notch: [thF, 0.17], green: 0.6 });
    const pts = fallOn(c, thF, c.lastTop - 4, [2.5, 6], 14);
    falls.ribbon(pts, (t) => 4.6 + 5 * t, [-Math.sin(thF), Math.cos(thF)]);
    add(new THREE.Mesh(c.build(), stoneMat({ pig: [0.66, 0.645, 0.59], dens: 0.34, shade: 1.85, grain: 0.05, cun: 0.85, cunSize: 7, cunBreak: 0.2, strata: [6.5, 0.26], moss: [1.5, 0.65], line: 1, snow: 0.8, ink: 2.0, inkPig: [0.56, 0.6, 0.68], keep: 0.4, inkNear: [0.3, 240] })), '西口');
    dress(c, D.pineNear, [10, 19], { rim: 0.7, near: true });
    const foot = pts[pts.length - 1];
    brooks.push({ w: 3.5, pts: [[foot.x + 3, foot.z + 2], [foot.x + 40, foot.z + 8], [foot.x + 84, foot.z + 24], [foot.x + 116, foot.z + 44], [-256, -86]] });
    // 泉脚的水气、峡里的湿烟（高些的几片从北坡的林梢上露出来）
    mist.push({ x: foot.x + 6, y: 12, z: foot.z + 4, w: 70, h: 34, amount: 1 }, { x: foot.x + 40, y: 10, z: foot.z + 10, w: 150, h: 28, amount: 0.9 }, { x: foot.x + 10, y: 50, z: foot.z + 14, w: 130, h: 46, amount: 0.75 }, { x: foot.x - 50, y: 64, z: foot.z + 60, w: 170, h: 40, amount: 0.6 });
    // 门脚：贴地一带烟（从入口望过去门脚是虚的），烟前疏疏的树
    mist.push({ x: -282, y: 9, z: -12, w: 150, h: 24, amount: 1 }, { x: -280, y: 8, z: 96, w: 150, h: 22, amount: 1 }, { x: -300, y: 7, z: 40, w: 120, h: 16, amount: 0.8 }, { x: -278, y: 12, z: 150, w: 120, h: 26, amount: 0.8 });
    for (let i = 0; i < 40 * dn; i++) {
      const x = -262 - 22 * R(), z = -80 + 230 * R();
      if (Math.abs(z - 40) < 13) continue;                                          // 门缝前留空（门里有光）
      const sz = 9 + 8 * R(), t = 0.8 + 0.35 * R();
      D.wood.push({ x, y: -1.2 + sz * 0.42, z, size: sz, tile: [W.clump, W.twin, W.broad, W.mi, W.willow][Math.floor(R() * 5)], r: t, g: t, b: t, rot: (R() - 0.5) * 0.12, sway: 0.25, ny: 1 });
    }
    // 门缝里的光（一团亮的烟）；峰脚的烟
    mist.push({ x: -352, y: 20, z: 40, w: 46, h: 58, amount: 1 }, { x: -380, y: 30, z: 40, w: 70, h: 90, amount: 0.8 }, { x: -420, y: 16, z: 20, w: 320, h: 44, amount: 0.9 }, { x: -470, y: 22, z: 160, w: 300, h: 50, amount: 0.85 }, { x: -500, y: 26, z: -110, w: 340, h: 56, amount: 0.85 });
  }

  // —— 东南 · 兑：泽中孤峰 ——
  {
    const c = new Crag(0.34);
    peak(c, 760, 652, 128, 60, { seed: 781, sides: 3, spires: 1 });
    c.shaft({ x: 838, z: 704, h: 66, r: 26, seed: 782, crown: 0.7, ribs: 0.9 });
    c.shaft({ x: 694, z: 606, h: 44, r: 17, seed: 783, crown: 1.5, ribs: 0.7 });
    add(new THREE.Mesh(c.build(), mCrag), '泽中孤峰');
    dress(c, D.pine, [15, 24]);
    mist.push({ x: 760, y: 22, z: 640, w: 330, h: 40, amount: 0.85 });
  }

  // —— 西南 · 巽：风蚀的矮冈，顶上几株偃松 ——
  const bluffH: Field = (x, z) => {
    // 朝东北（迎着河）的一面是陡坎，背后缓缓伏下去
    const u = (x + 450) * 0.62 + (z - 430) * -0.78, v = (x + 450) * 0.78 + (z - 430) * 0.62;
    const k = Math.pow(Math.max(0, 1 - (v / 240) ** 2), 1.2) * smooth(-170, -12, u) * smooth(30, -6, u - 22 * (fbm(v * 0.018, 3, 2, 91) - 0.5) * 2);
    return 56 * k * (0.84 + 0.32 * fbm(x * 0.012, z * 0.012, 3, 93));
  };
  {
    const b = quilt({ x: [-760, -220], z: [240, 680], cell: 9 / q, H: bluffH, sink: 3, eye: [0, 100], ink: { dens: 0.3, crest: 3, gully: 0.6, veg: 0.7 } });
    add(new THREE.Mesh(b.geo, stoneMat({ pig: [0.68, 0.66, 0.6], dens: 0.3, shade: 1.8, grain: 0.03, cun: 0.8, cunSize: 9, strata: [4, 0.3], line: 0.8, snow: 0.85, ink: 1.6, inkPig: [0.6, 0.62, 0.66], keep: 0.3 })), '巽冈');
    for (let i = 0; i < 90 * dn; i++) {
      const x = -720 + 480 * R(), z = 260 + 380 * R(), y = bluffH(x, z);
      if (y < 38 || R() < 0.5) continue;
      const s = 19 + 10 * R(), t = 0.75 + 0.3 * R();
      D.pine.push({ x, y: y - 3 + s * 0.46, z, size: s, tile: R() < 0.8 ? PT.bent : PT.bent2, r: t, g: t, b: t, rot: (R() - 0.5) * 0.08, sway: 0.25, ny: 1 });
    }
  }

  // ———————————————————— 平畴与伊水 ————————————————————
  const tAt = (i: number): [number, number] => { const a = RIVER_FINE[Math.max(0, i - 1)], b = RIVER_FINE[Math.min(RIVER_FINE.length - 1, i + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return [(b.x - a.x) / l, (b.z - a.z) / l]; };
  /** 河上某一段里程附近的那个点 */
  const riverAtS = (s: number) => { let k = 0; while (k < RIVER_FINE.length - 2 && RIVER_FINE[k + 1].s < s) k++; return k; };
  // 沙渚：大湾里几座、南来的那一段几座、东去的一段疏疏几座
  const bars: Bar[] = [];
  for (const [s, off, a, b, h] of [[3565, 0.3, 105, 22, 0.8], [3180, 0.34, 120, 30, 0.9], [3330, -0.3, 90, 26, 0.75], [3470, 0.1, 150, 34, 1.0], [3560, -0.45, 70, 20, 0.6], [3720, -0.5, 110, 26, 0.8], [3850, 0.2, 140, 30, 0.9], [4040, -0.3, 160, 34, 0.9], [4300, 0.36, 130, 30, 0.8], [4620, -0.2, 190, 38, 1.0], [2900, -0.25, 130, 28, 0.9], [2620, 0.3, 150, 30, 0.9], [2300, -0.2, 160, 30, 0.9], [1900, 0.25, 150, 26, 0.8], [5050, 0.3, 200, 40, 1.0]] as Array<[number, number, number, number, number]>) {
    const i = riverAtS(s), p = RIVER_FINE[i], [tx, tz] = tAt(i);
    bars.push({ x: p.x + p.nx * off * p.w, z: p.z + p.nz * off * p.w, a, b, h, tx, tz });
  }
  // 泽：伊水东去那一段南岸外的一片片积水
  const pools: Pool[] = ([[520, 590, 120, 34, 0.2], [700, 560, 150, 30, -0.1], [880, 640, 170, 40, 0.15], [600, 720, 130, 30, 0.3], [1010, 600, 190, 36, -0.2], [1180, 700, 220, 44, 0.1], [820, 800, 200, 36, 0.05], [1380, 620, 240, 40, -0.1], [460, 690, 80, 22, 0.5], [1100, 860, 260, 40, 0.12]] as Array<[number, number, number, number, number]>).map(([x, z, rx, rz, rot]) => ({ x, z, rx, rz, rot }));
  // 田：一块一个走向
  const plots: Plot[] = [];
  for (const [x, z, l, w, rot, n] of [
    [-420, 330, 260, 150, 0.12, 7], [-640, 250, 240, 130, -0.2, 6], [-560, 760, 300, 170, 0.5, 8], [-860, 520, 320, 180, 0.3, 8], [-360, 640, 220, 120, -0.1, 6], [-900, 900, 340, 200, 0.6, 8], [-1180, 640, 360, 200, 0.2, 8],
    [-110, 360, 230, 46, 0.04, 3], [-330, 150, 110, 150, 1.5, 6],
    [400, 20, 230, 150, 0.1, 7], [380, -160, 200, 130, -0.15, 6], [560, 120, 180, 120, 0.3, 6], [420, 200, 200, 90, -0.05, 4],
    [400, -420, 240, 150, 0.4, 7], [600, -330, 200, 130, 0.1, 6], [300, -600, 200, 120, 0.3, 5],
    [-420, -220, 200, 130, 0.2, 6], [-560, -360, 220, 130, -0.3, 6],
  ] as Array<[number, number, number, number, number, number]>) plots.push({ x, z, l, w, rot, n });
  const roads = [
    { w: 4.5, pts: [[262, 12], [330, 40], [420, 96], [520, 70], [640, -60], [800, -230], [1000, -330], [1240, -420]] as Array<[number, number]> },
    { w: 4, pts: [[-250, 60], [-290, 190], [-400, 400], [-560, 560], [-760, 720], [-980, 900], [-1300, 1000]] as Array<[number, number]> },
  ];
  const plain = buildPlain({ density: dn, bars, fields: plots, roads }, pools, brooks);
  add(new THREE.Mesh(plain.geo, wash({ pig: PLAIN_PIG, dens: PLAIN_DENS, flat: 1, grain: 0.012, line: 0, streak: [40, 700, 0.28], snow: 0.9 })), '平畴');
  const mWater = farWaterMat({ pig: [0.7, 0.78, 0.86], dens: 0.32, light: 0.18, ripple: 1, deep: 0.2 });
  const water = new THREE.Mesh(plain.water, mWater);
  water.layers.set(FX_LAYER); water.renderOrder = -12; water.frustumCulled = false;
  add(water, '伊水');
  // —— 岸上的东西：迎水面的芦苇成带，埂顶上疏疏的树 ——
  for (const sh of plain.shore) {
    const far = Math.hypot(sh.x, sh.z - 100);
    if (far > 2600) continue;
    const bed = fbm(sh.s * 0.004 + sh.side * 5.1, 7.7, 2, 61), n = bed > 0.52 ? 2 + Math.floor(R() * 3) : R() < 0.25 ? 1 : 0;
    for (let k = 0; k < n * dn; k++) {
      const along = (R() - 0.5) * 24, across = -3 + 9 * R(), x = sh.x + sh.nx * across - sh.nz * along, z = sh.z + sh.nz * across + sh.nx * along;
      const s = (far < 700 ? 5.5 : 8) + 4 * R(), t = 0.8 + 0.4 * R();
      D.reed.push({ x, y: waterY(x, z) + s * 0.4, z, size: s, tile: W.reed, r: t, g: t, b: t, rot: (R() - 0.5) * 0.1, sway: 0.5, ny: 1 });
    }
    // 埂上的树：一丛一丛，隔一段空着
    const grove = fbm(sh.s * 0.0026 + sh.side * 2.3, 1.1, 2, 67);
    if (sh.crest > 0.7 && grove > 0.55 && R() < 0.6 * dn) {
      const x = sh.x + sh.nx * (12 + 14 * R()), z = sh.z + sh.nz * (12 + 14 * R()), s = 13 + 9 * R(), t = 0.8 + 0.4 * R();
      D.wood.push({ x, y: waterY(x, z) + 0.6 + s * 0.42, z, size: s, tile: [W.clump, W.twin, W.broad, W.mi, W.bare][Math.floor(R() * 4.3)], r: t, g: t, b: t, rot: (R() - 0.5) * 0.12, sway: 0.2, ny: 1 });
    }
  }
  // 沙渚上的几丛芦苇
  for (const b of bars) for (let k = 0; k < 3; k++) { const u = (R() - 0.5) * 1.2, x = b.x + b.tx * u * b.a, z = b.z + b.tz * u * b.a, s = 6 + 4 * R(); if (R() < 0.6) D.reed.push({ x, y: waterY(x, z) + b.h * 0.5 + s * 0.4, z, size: s, tile: W.reed, sway: 0.5, ny: 1 }); }
  // 泽里的芦荡：一带一带横着的，带与带之间是水
  for (const pl of pools) for (let k = 0; k < 26 * dn; k++) {
    const a = R() * 6.283, d = 0.8 + 0.5 * R(), x = pl.x + Math.cos(a) * pl.rx * d, z = pl.z + Math.sin(a) * pl.rz * d * 1.2, s = 7 + 5 * R(), t = 0.75 + 0.45 * R();
    D.reed.push({ x, y: waterY(x, z) + s * 0.4 - 0.2, z, size: s, tile: W.reed, r: t, g: t, b: t, sway: 0.5, ny: 1 });
  }
  // 近岸（近处那块地的水边）：水线上几丛芦苇，把地与水相接的那条线打破。渡口跟前留空
  for (let i = 0; i < RIVER_FINE.length; i += 1) {
    const p = RIVER_FINE[i];
    if (p.x < -70 || p.x > 330) continue;
    const bx = p.x + p.nx * p.w, bz = p.z + p.nz * p.w;
    if (bx < NEAR.x0 + 20 || bx > NEAR.x1 - 6 || bz > NEAR.z1 - 4) continue;
    // 往岸上找水线
    let wl = -1;
    for (let d = -6; d < 44; d += 1.5) { if (ground(bx + p.nx * d, bz + p.nz * d) > RIVER_Y - 0.04) { wl = d; break; } }
    if (wl < 0) continue;
    const bed = fbm(p.s * 0.012, 3.3, 2, 83);
    for (let k = 0, n = bed > 0.5 ? 4 : bed > 0.4 ? 1 : 0; k < n; k++) {
      const d = wl - 3.5 + 6 * R(), al = (R() - 0.5) * 20, x = bx + p.nx * d - p.nz * al, z = bz + p.nz * d + p.nx * al;
      if (Math.hypot(x - SITE.ferry.x, z - SITE.ferry.z) < 17) continue;
      const s = 2.6 + 1.6 * R(), t = 0.8 + 0.4 * R();
      D.reedNear.push({ x, y: Math.max(ground(x, z), RIVER_Y - 0.25) + s * 0.47, z, size: s, tile: Math.floor(R() * 4), r: t, g: t, b: t, rot: (R() - 0.5) * 0.12, sway: 0.7, ny: 1 });
    }
  }

  // —— 平畴上的树：沿着看不见的田界、堤岸排成行，行与行之间是空的 ——
  const onPlain = (x: number, z: number) => { const d = Math.max(NEAR.x0 - x, x - NEAR.x1, NEAR.z0 - z, z - NEAR.z1); if (d < 16) return false; let m = 1e9; for (let i = 0; i < RIVER_FINE.length; i += 3) { const p = RIVER_FINE[i]; m = Math.min(m, Math.hypot(p.x - x, p.z - z) - p.w); } return m > 16; };
  const row = (x0: number, z0: number, ang: number, n: number, gap: number, tiles: number[], size: [number, number], o2: { lean?: boolean; jit?: number; dark?: number } = {}) => {
    for (let i = 0; i < n; i++) {
      if (R() < 0.16 || R() > dn + 0.25) continue;
      const x = x0 + Math.cos(ang) * i * gap + (R() - 0.5) * (o2.jit ?? 7), z = z0 + Math.sin(ang) * i * gap + (R() - 0.5) * (o2.jit ?? 7);
      if (!onPlain(x, z)) continue;
      const s = size[0] + (size[1] - size[0]) * R(), t = (o2.dark ?? 0.82) * (0.85 + 0.4 * R());
      D.wood.push({ x, y: plainY(x, z) + s * 0.44, z, size: s, tile: tiles[Math.floor(R() * tiles.length)], r: t, g: t, b: t, rot: o2.lean ? -0.03 - 0.05 * R() : (R() - 0.5) * 0.12, sway: o2.lean ? 0.5 : 0.2, ny: 1 });
    }
  };
  // 西南（巽）：一行行柳、杨，全被风梳向一边
  for (const [x, z, a, n] of [[-285, 150, 2.9, 12], [-290, 250, 2.75, 14], [-270, 345, 2.6, 15], [-150, 350, 3.0, 7], [-300, 470, 2.72, 16], [-280, 600, 2.6, 15], [-560, 640, 2.35, 12], [-420, 780, 2.7, 18], [-640, 900, 2.8, 16], [-900, 700, 2.5, 14], [-300, 920, 2.75, 18], [-1100, 520, 2.6, 12]] as Array<[number, number, number, number]>) row(x, z, a, n, 23, [W.willow, W.wind, W.willow, W.poplar, W.wind], [17, 26], { lean: true, jit: 5, dark: 0.72 });
  // 风里的芦花（巽）
  for (let i = 0; i < 150 * dn; i++) { const x = -260 - 700 * R(), z = 240 + 760 * R(); if (!onPlain(x, z) || fbm(x * 0.006, z * 0.006, 2, 97) < 0.55 || bluffH(x, z) > 2) continue; const s = 7 + 5 * R(), t = 0.8 + 0.4 * R(); D.reed.push({ x, y: plainY(x, z) + s * 0.42, z, size: s, tile: W.reed, r: t, g: t, b: t, sway: 0.7, rot: -0.04, ny: 1 }); }
  // 别处：东边、东北、南岸外、北面山脚
  for (const [x, z, a, n] of [[300, -20, 0.2, 9], [330, 130, -0.1, 11], [420, -110, 1.3, 9], [520, 20, 0.4, 8], [300, -260, 0.3, 12], [380, -400, 1.2, 9], [520, -230, -0.2, 10], [640, -480, 0.5, 9], [300, -520, 0.1, 10],
    [-120, 350, 0.05, 12], [-420, -200, 0.3, 10], [-560, -330, -0.2, 9], [-330, 60, 1.5, 8], [-300, -330, 0.2, 9],
    [-250, 700, 1.2, 10], [-380, 1000, 0.3, 14], [150, 700, 0.1, 10], [380, 760, 0.25, 9], [-150, 1300, 0.4, 14], [-520, 1250, 0.2, 14], [900, 960, 0.1, 14], [1300, 900, -0.1, 14], [1500, 200, 0.6, 12], [1250, -150, 0.3, 12]] as Array<[number, number, number, number]>) row(x, z, a, n, 19, [W.clump, W.twin, W.broad, W.mi, W.clump, W.poplar], [13, 21]);

  // —— 村、塔、渡 ——
  const hamlet = (x: number, z: number, big = 1, smoke = true) => {
    const y = plainY(x, z);
    D.mark.push({ x, y: y + 9 * big, z, size: 20 * big, tile: M.hamlet, sway: 0 }, { x: x + 21 * big, y: y + 6.5 * big, z: z + 9, size: 14 * big, tile: R() < 0.5 ? M.hut : M.hut2, sway: 0 });
    for (let k = 0; k < 5; k++) { const s = (13 + 8 * R()) * big, tx = x + (R() - 0.5) * 70 * big, tz = z + (R() - 0.5) * 50 * big; D.wood.push({ x: tx, y: plainY(tx, tz) + s * 0.44, z: tz, size: s, tile: [W.clump, W.broad, W.twin][Math.floor(R() * 3)], sway: 0.2, ny: 1 }); }
    if (smoke) mist.push({ x: x + 4, y: y + 30 * big, z, w: 13 * big, h: 44 * big, amount: 0.8 });
  };
  hamlet(430, 64, 1); hamlet(-600, 560, 1.1); hamlet(-340, 800, 1.2); hamlet(520, -270, 1.1); hamlet(-980, 900, 1.5, false); hamlet(1040, 980, 1.6, false); hamlet(-430, -250, 1, false);
  // 东北偏东的平畴上一座塔
  { const x = 1250, z = -420, y = plainY(x, z); D.mark.push({ x, y: y + 23, z, size: 48, tile: M.pagoda, sway: 0 }, { x: x + 44, y: y + 9, z: z + 14, size: 22, tile: M.temple, sway: 0 }); for (let k = 0; k < 6; k++) { const s = 16 + 8 * R(), tx = x + (R() - 0.5) * 130, tz = z + (R() - 0.5) * 70; D.wood.push({ x: tx, y: plainY(tx, tz) + s * 0.44, z: tz, size: s, tile: [W.clump, W.mi, W.twin][Math.floor(R() * 3)], sway: 0.2, ny: 1 }); } }
  // 对岸的渡头；泽里泊着的一只船
  { const i = riverAtS(3660), p = RIVER_FINE[i], x = p.x - p.nx * (p.w + 6), z = p.z - p.nz * (p.w + 6); D.mark.push({ x, y: waterY(x, z) + 5.6, z, size: 13, tile: M.landing, sway: 0 }, { x: x + 26, y: waterY(x, z) + 6, z: z + 12, size: 13, tile: M.hut, sway: 0 }); }
  D.mark.push({ x: 640, y: waterY(640, 570) + 3.6, z: 570, size: 8.5, tile: M.skiff, sway: 0 }, { x: 930, y: waterY(930, 650) + 4, z: 650, size: 9.5, tile: M.boat, sway: 0 });

  // —— 水上、平畴上的烟 ——
  for (const [x, z, w, h] of [[-90, 900, 520, 16], [-240, 1500, 800, 22], [640, 470, 560, 14], [1200, 520, 800, 18], [900, 760, 700, 16], [-620, 700, 700, 16], [-900, 420, 620, 14], [420, -260, 520, 16], [-460, -170, 420, 16]] as Array<[number, number, number, number]>) mist.push({ x, y: plainY(x, z) + h * 0.55, z, w, h, amount: 0.75 });
  // 伊阙：两山脚下的烟，门里一带
  mist.push({ x: gx - 420, y: 70, z: gz - 120, w: 900, h: 110, amount: 0.9 }, { x: gx + 440, y: 70, z: gz - 120, w: 900, h: 110, amount: 0.9 }, { x: gx, y: 52, z: gz - 60, w: 420, h: 46, amount: 0.7 });

  // ———————————————————— 把点笔并成网格 ————————————————————
  const woodA = atlas(WOOD.tiles, WOOD.cols, Math.round(128 * o.tex), 13), pineA = atlas(PINE.tiles, PINE.cols, Math.round(224 * o.tex), 19), markA = atlas(MARK.tiles, MARK.cols, Math.round(128 * o.tex), 23), reedA = atlas(REED.tiles, REED.cols, Math.round(176 * o.tex), 29);
  const T0 = TONE[season];
  const mats = {
    wood: dabMat({ ...woodA, pig: T0.wood, dens: T0.woodD, shade: 1.5, sway: 0.5, alpha: T0.woodA, snow: 0.4 }),
    woodFar: dabMat({ ...woodA, pig: T0.far, dens: T0.woodD, shade: 1.5, sway: 0.5, alpha: T0.woodA, snow: 0.4 }),
    ever: dabMat({ ...woodA, pig: [0.5, 0.56, 0.53], dens: 1.7, shade: 1.4, sway: 0.4, snow: 0.6 }),
    pine: dabMat({ ...pineA, pig: [0.36, 0.62, 0.42], dens: 1.75, shade: 1.4, sway: 0.4, snow: 0.7 }),
    pineNear: dabMat({ ...pineA, pig: [0.5, 0.67, 0.53], dens: 1.8, shade: 1.4, sway: 0.4, snow: 0.7 }),
    mark: dabMat({ ...markA, pig: [0.5, 0.5, 0.52], accent: [0.9, 0.86, 0.76], dens: 2.0, shade: 1.2, snow: 0.5 }),
    reed: dabMat({ ...woodA, pig: T0.reed, accent: T0.plume, dens: T0.reedD, shade: 1.3, sway: 0.8, snow: 0.4 }),
    reedNear: dabMat({ ...reedA, pig: T0.reed, accent: T0.plume, dens: T0.reedD + 0.25, shade: 1.3, sway: 0.9, snow: 0.4 }),
  };
  /** 多的按方位分成四块（南、东、北、西各九十度；看不见的不画），少的并成一个 */
  const flush = (list: Dab[], mat: THREE.ShaderMaterial, name: string, split = false) => {
    if (!list.length) return;
    if (!split) { add(dabMesh(list, mat), name); return; }
    const parts: Dab[][] = Array.from({ length: 4 }, () => []);
    for (const d of list) parts[Math.floor(((azOf(d.x, d.z) + 45) % 360) / 90)].push(d);
    // 太少的一块并给下一块（省一次绘制）
    for (let i = 0; i < 4; i++) if (parts[i].length && parts[i].length < 60) { parts[(i + 1) % 4].push(...parts[i]); parts[i] = []; }
    parts.forEach((p, i) => { if (p.length) add(dabMesh(p, mat), `${name}${'南东北西'[i]}`); });
  };
  // 树：离得近的（走到跟前还有颜色）与远的分开两种颜料
  flush(D.wood.filter((d) => Math.hypot(d.x, d.z) <= 560), mats.wood, '烟树', true); flush(D.wood.filter((d) => Math.hypot(d.x, d.z) > 560), mats.woodFar, '远烟树', true); flush(D.ever, mats.ever, '远树'); flush(D.pine, mats.pine, '峰松'); flush(D.pineNear, mats.pineNear, '西口松');
  flush(D.mark, mats.mark, '村塔'); flush(D.reed, mats.reed, '芦'); flush(D.reedNear, mats.reedNear, '近岸芦');
  if (falls.count) g.add(falls.build());
  const veil = puffs(mist.slice(0, Math.max(8, Math.round(mist.length * Math.min(1, 0.5 + dn * 0.5)))), { near: [60, 170] });
  g.add(veil);

  // ———————————————————— 舟、雁、鸟 ————————————————————
  const boats = new Boats(markA, [
    { s: 3180, v: -0.8, range: [2500, 3340], off: -0.15, tile: M.sail, size: 20 }, { s: 2700, v: 0.9, range: [1700, 3300], off: 0.3, tile: M.sail2, size: 18 }, { s: 4250, v: 0.9, range: [3920, 5300], off: 0.1, tile: M.sail, size: 19 }, { s: 2250, v: 0.7, range: [1500, 2900], off: -0.3, tile: M.sail, size: 20 },
    { s: 3700, v: 0.04, range: [3688, 3716], off: -0.34, tile: M.boat, size: 8.5 }, { s: 3255, v: 0.03, range: [3246, 3262], off: 0.12, tile: M.skiff, size: 8 }, { s: 3606, v: 0.02, range: [3600, 3612], off: 0.46, tile: M.skiff, size: 6.5 },
  ]);
  const birds = new Birds(markA, [
    { x: 520, y: 150, z: 520, r: 140, n: 5, period: 46, size: 5 }, { x: 840, y: 262, z: 20, r: 120, n: 4, period: 60, size: 6.5 }, { x: -760, y: 384, z: -740, r: 170, n: 3, period: 80, size: 10, glide: true },
    { x: -520, y: 112, z: 520, r: 120, n: 4, period: 54, size: 5.5, glide: true }, { x: -400, y: 150, z: 20, r: 70, n: 3, period: 40, size: 3.6 }, { x: 760, y: 330, z: -760, r: 150, n: 4, period: 66, size: 9 },
  ]);
  const geese = new Geese(markA, new THREE.Vector3(2600, 430, 1250), new THREE.Vector3(-2600, 380, 2050));
  g.add(boats.mesh, birds.mesh, geese.mesh);

  const paint = (s: Season) => {
    season = s;
    const T = TONE[s];
    const set = (m: THREE.ShaderMaterial, pig: RGB, dens: number, alpha = 1, accent?: RGB) => {
      (m.uniforms.uPig.value as THREE.Color).setRGB(pig[0], pig[1], pig[2]);
      (m.uniforms.uAccent.value as THREE.Color).setRGB((accent ?? pig)[0], (accent ?? pig)[1], (accent ?? pig)[2]);
      (m.uniforms.uP.value as THREE.Vector4).x = dens; (m.uniforms.uQ.value as THREE.Vector4).z = alpha;
    };
    set(mats.wood, T.wood, T.woodD, T.woodA); set(mats.woodFar, T.far, T.woodD, T.woodA); set(mats.reed, T.reed, T.reedD, 1, T.plume); set(mats.reedNear, T.reed, T.reedD + 0.25, 1, T.plume);
    geese.mesh.userData.on = s === 'autumn';
  };
  paint(season);

  return {
    group: g,
    setSeason: paint,
    update(dt, t, f) {
      if (f.season !== season) paint(f.season);
      boats.update(dt, t);
      const day = f.night < 0.55;
      birds.mesh.visible = day;
      if (day) birds.update(dt, t);
      geese.mesh.userData.on = season === 'autumn' && day;
      geese.update(dt, t);
      // 水面的霞：晨在东，昏在西
      const gl = mWater.uniforms.uGlowDir.value as THREE.Vector4, h = f.hour, ss = DUSK[season];
      if (h < 12) gl.set(1, 0, 0.14, 0.8 * Math.max(0, 1 - Math.abs(h - 6.3) / 1.4)); else gl.set(-1, 0, 0.14, 1.1 * Math.max(0, 1 - Math.abs(h - (ss - 0.25)) / 1.5));
      // 云烟：晨起重些，夜里薄些
      (veil.material as THREE.ShaderMaterial).uniforms.uPuff.value.x = 0.9 + 0.35 * Math.max(0, 1 - Math.abs(h - 6.3) / 1.6) - 0.3 * f.night;
    },
  };
}

/** 只要一份不动的远景（台子上用） */
export function buildFar(o: FarOpts): THREE.Group { return createFar({ ...o, season: 'spring' }).group; }
