/**
 * 农事的笔：田里庄稼的样子大半借草木那边的（麦苗、熟麦、麦茬、谷穗、菜、豆、草——FIELD 图集里的格），
 * 自己另画几样它们没有的：割倒铺着的麦（麦铺）、捆好立着的麦捆、新翻的土块、撒下的种子、掐过穗的谷秆、萝卜，
 * 还有飞起来的那些：糠、麦粒、水点、草屑，以及树上的果子。
 * 规矩同 docs/INK.md：红通道是浓淡，绿通道是点缀色，透明度是形状；笔要肥（细节不小于格宽的 6%）。
 */
import { blob, ink, stroke, type Ctx, type Tile } from '../ink/brush';
import type { Rng } from '../core/rng';
import { W, bs, haze, sheet } from '../env/flora/tiles';
import { FIELD } from '../env/flora/tiles2';

const TAU = Math.PI * 2;
const F = (k: keyof typeof FIELD.idx): Tile => FIELD.tiles[FIELD.idx[k]];

/** 一茎麦秆，带穗：从 (x0,y0) 到 (x1,y1)，穗在 (x1,y1) 那头 */
function stalk(g: Ctx, r: Rng, x0: number, y0: number, x1: number, y1: number, d: number, head = true) {
  stroke(g, [[x0, y0], [(x0 + x1) / 2 + (r() - 0.5) * 0.02, (y0 + y1) / 2 + (r() - 0.5) * 0.02], [x1, y1]], (t) => 0.024 * (1 - 0.3 * t), ink(d * 0.8));
  if (!head) return;
  const a = Math.atan2(y1 - y0, x1 - x0) + (r() - 0.5) * 0.3, L = 0.13 + 0.05 * r();
  bs(g, [[x1, y1], [x1 + Math.cos(a) * L * 0.5, y1 + Math.sin(a) * L * 0.5], [x1 + Math.cos(a) * L, y1 + Math.sin(a) * L]], W.leaf(0.06, 0.6), Math.min(1, d * 1.15), d, 0.25, 0.35);
}
/** 麦铺：割倒的一把一把，顺着一个方向躺着，穗都在右头 */
const swath: Tile = (g, r) => {
  haze(g, 0.5, 0.82, 0.46, 0.12, 0.45, 0.22);
  for (let i = 0; i < 16; i++) {
    const y = 0.7 + 0.24 * r(), x0 = 0.04 + 0.2 * r(), len = 0.5 + 0.25 * r(), tilt = (r() - 0.5) * 0.16;
    stalk(g, r, x0, y + 0.02, x0 + len, y - len * tilt, 0.45 + 0.5 * r());
  }
};
/** 麦捆：一束立着，腰里一道草绳扎紧，穗在上头散开，根头在下头张开 */
const sheaf: Tile = (g, r) => {
  haze(g, 0.5, 0.55, 0.22, 0.42, 0.5, 0.25);
  const waist = 0.56;
  for (let i = 0; i < 15; i++) {
    const u = i / 14 - 0.5, xb = 0.5 + u * 0.3 + (r() - 0.5) * 0.03, xw = 0.5 + u * 0.09, xt = 0.5 + u * 0.36 + (r() - 0.5) * 0.06, yt = 0.12 + 0.08 * Math.abs(u) + 0.05 * r();
    const d = 0.5 + 0.5 * r();
    stroke(g, [[xb, 0.97], [xw, waist], [xt, yt + 0.06]], (t) => 0.026 * (1 - 0.25 * t), ink(d * 0.85));
    const a = -Math.PI / 2 + u * 1.6 + (r() - 0.5) * 0.4, L = 0.12 + 0.05 * r();
    bs(g, [[xt, yt + 0.06], [xt + Math.cos(a) * L * 0.5, yt + 0.06 + Math.sin(a) * L * 0.5], [xt + Math.cos(a) * L, yt + 0.06 + Math.sin(a) * L]], W.leaf(0.065, 0.6), Math.min(1, d * 1.2), d, 0.25, 0.35);
  }
  // 腰绳：深一道
  stroke(g, [[0.4, waist + 0.01], [0.5, waist + 0.035], [0.6, waist]], () => 0.04, ink(1, 0.1));
};
/** 新翻的土：几块土坷垃，一道犁沟似的暗线 */
const clod: Tile = (g, r) => {
  stroke(g, [[0.05, 0.86], [0.35, 0.83 + 0.03 * r()], [0.65, 0.85], [0.95, 0.82 + 0.03 * r()]], (t) => 0.05 * Math.sin(Math.PI * t) + 0.012, ink(0.5));
  for (let i = 0; i < 6; i++) blob(g, r, 0.12 + 0.76 * r(), 0.78 + 0.12 * r(), 0.045 + 0.04 * r(), ink(0.55 + 0.4 * r()), 3, 0.6);
};
/** 撒下的种子：疏疏几点 */
const seed: Tile = (g, r) => {
  for (let i = 0; i < 14; i++) { g.fillStyle = ink(0.35 + 0.4 * r(), 0.6); g.beginPath(); g.ellipse(0.08 + 0.84 * r(), 0.72 + 0.22 * r(), 0.022 + 0.012 * r(), 0.016, r() * 3, 0, TAU); g.fill(); }
};
/** 掐过穗的谷秆：直直的几根，叶子耷拉着 */
const guStalk: Tile = (g, r) => {
  for (let i = 0; i < 6; i++) {
    const x = 0.14 + 0.72 * ((i + r()) / 6), top = 0.12 + 0.2 * r(), d = 0.5 + 0.5 * r(), lean = (r() - 0.5) * 0.08;
    stroke(g, [[x, 0.97], [x + lean, (0.97 + top) / 2], [x + lean * 2, top]], (t) => 0.024 * (1 - 0.4 * t), ink(d * 0.85));
    for (const k of [0.35, 0.6]) { const s = r() < 0.5 ? -1 : 1, y = 0.97 - (0.97 - top) * k; bs(g, [[x + lean * k * 2, y], [x + s * 0.1, y + 0.04], [x + s * 0.16, y + 0.14]], W.leaf(0.035, 0.6), d * 0.8, d * 0.5); }
  }
};
/** 萝卜：一蓬叶，根头露出地面一截（点缀色） */
const radish: Tile = (g, r) => {
  for (let i = 0; i < 7; i++) { const u = i / 6 - 0.5, a = -Math.PI / 2 + u * 1.8 + (r() - 0.5) * 0.2, L = 0.32 + 0.12 * r(), d = 0.45 + 0.5 * r(); bs(g, [[0.5, 0.74], [0.5 + Math.cos(a) * L * 0.5, 0.74 + Math.sin(a) * L * 0.55], [0.5 + Math.cos(a) * L, 0.74 + Math.sin(a) * L]], W.drop(0.11, 0.55), d, d * 0.75); }
  g.fillStyle = ink(0.35, 1); g.beginPath(); g.ellipse(0.5, 0.82, 0.1, 0.09, 0, 0, TAU); g.fill();
};
/** 飞起来的：糠（几片薄薄的屑）、麦粒（几点）、水点（一滴）、草屑（一小截） */
const chaff: Tile = (g, r) => { for (let i = 0; i < 6; i++) { g.fillStyle = ink(0.3 + 0.4 * r()); g.beginPath(); g.ellipse(0.25 + 0.5 * r(), 0.25 + 0.5 * r(), 0.07 + 0.05 * r(), 0.03, r() * 3, 0, TAU); g.fill(); } };
const grain: Tile = (g, r) => { for (let i = 0; i < 5; i++) { g.fillStyle = ink(0.7 + 0.3 * r(), 0.2); g.beginPath(); g.ellipse(0.3 + 0.4 * r(), 0.3 + 0.4 * r(), 0.06, 0.04, r() * 3, 0, TAU); g.fill(); } };
const drop: Tile = (g) => { stroke(g, [[0.5, 0.12], [0.5, 0.5], [0.5, 0.86]], (t) => 0.05 + 0.14 * t * t, ink(0.6)); };
const bit: Tile = (g, r) => { stroke(g, [[0.25, 0.6 + 0.1 * r()], [0.5, 0.5], [0.78, 0.42 + 0.1 * r()]], () => 0.06, ink(0.7)); };
/** 果子：一只圆果，顶上一点深（桃有一道沟，柿有蒂） */
const fruit: Tile = (g, r) => {
  const gr = g.createRadialGradient(0.44, 0.44, 0.04, 0.5, 0.52, 0.34);
  gr.addColorStop(0, ink(0.45, 0.6)); gr.addColorStop(1, ink(0.95, 0));
  g.fillStyle = gr; g.beginPath(); g.ellipse(0.5, 0.53, 0.3, 0.28 + 0.02 * r(), 0, 0, TAU); g.fill();
  stroke(g, [[0.5, 0.26], [0.47, 0.2], [0.44, 0.13]], () => 0.045, ink(1));
};
/** 一小片叶（采桑、摘果时落下来的） */
const leafBit: Tile = (g, r) => { bs(g, [[0.2, 0.7], [0.5, 0.42 + 0.1 * r()], [0.82, 0.3]], W.leaf(0.24, 0.7), 0.8, 0.55); };
/** 一堆东西的面（晒场上的麦堆、糠堆、磨盘上的面）：一团淡底上几笔 */
const heapTop: Tile = (g, r) => { haze(g, 0.5, 0.62, 0.45, 0.3, 0.6, 0.8); for (let i = 0; i < 9; i++) { g.fillStyle = ink(0.55 + 0.4 * r()); g.beginPath(); g.ellipse(0.2 + 0.6 * r(), 0.45 + 0.3 * r(), 0.04, 0.025, r() * 3, 0, TAU); g.fill(); } };

export const FARM_TILES = sheet(6, [
  ['maiYoung', F('maiYoung')], ['maiRipe', F('maiRipe')], ['maiStub', F('maiStub')], ['maiSprout', F('maiSprout')], ['guRipe', F('guRipe')], ['cao0', F('cao0')],
  ['caoShort', F('caoShort')], ['hao', F('hao')], ['haoDry', F('haoDry')], ['douLow', F('douLow')], ['douVine', F('douVine')], ['douDry', F('douDry')],
  ['baicai', F('baicai')], ['qingcai', F('qingcai')], ['cong', F('cong')], ['caiSeed', F('caiSeed')], ['swath', swath], ['sheaf', sheaf],
  ['clod', clod], ['seed', seed], ['guStalk', guStalk], ['radish', radish], ['chaff', chaff], ['grain', grain],
  ['drop', drop], ['bit', bit], ['fruit', fruit], ['leafBit', leafBit], ['heapTop', heapTop], ['cao1', F('cao1')],
  // 庄稼地里的杂草：阔叶的（车前一类）、三叶的，与禾苗分得出来
  ['kuo', F('kuo')], ['sanye', F('sanye')],
]);
export const T = FARM_TILES.idx;
