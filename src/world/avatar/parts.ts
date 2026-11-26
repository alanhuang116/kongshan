/**
 * 小人身上不变形的部件与那一张贴图：头（脸、发、髻或巾、须、颈、耳）、手、脚、斗笠、蓑衣；
 * 贴图上画着衣（交领、绦带、衣缘、几笔衣纹）与脸（发际、眉眼）。会变形的长衫与袖子在 figure.ts 里每帧现算。
 *
 * 都按画法来（docs/INK.md）：没有写实的皮肤与布纹——脸近乎空白，只两道阖着的眼线、极淡的眉；
 * 衣是平涂的一层颜料，衣纹是几笔两头尖的线。颜色全写在贴图与顶点色里（材质的颜料是纯白、浓度是 1），
 * 所以一个人身上深的发、浅的衣、赭的斗笠可以是同一个材质、同一次绘制。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, type Rng } from '../core/rng';
import { stroke } from '../ink/brush';
import { PIG, type RGB } from '../ink/ink';
import type { Look } from './types';

/** 读书人那一身（你操纵的那个人）：月白的长衫，深色的绦带，髻上裹一方软巾，颔下一绺须 */
export const SCHOLAR: Look = {
  robe: [0.9, 0.93, 0.965], robeDens: 1, body: 1,
  trim: [0.6, 0.66, 0.76], trimDens: 1.7,
  sash: [0.5, 0.55, 0.66], sashDens: 2.4,
  hair: PIG.jiao, hairDens: 2.1,
  skin: [0.99, 0.91, 0.83], skinDens: 1,
  shoes: PIG.mo, shoesDens: 3.2,
  hat: 'jin', hatWorn: true, hatPig: [0.52, 0.55, 0.62], hatDens: 1.75,
  scale: 1, head: 1, sleeve: 1, hem: 0.085,
  beard: 0.45, cape: false, folds: 1, shade: 1.45,
};
export const resolveLook = (l?: Partial<Look>): Look => ({ ...SCHOLAR, ...(l ?? {}) });

const c01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 颜料叠了几层之后的颜色 */
export const tone = (p: RGB, d: number): RGB => [Math.pow(p[0], d), Math.pow(p[1], d), Math.pow(p[2], d)];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const css = (c: RGB, a = 1) => `rgba(${Math.round(255 * c01(c[0]))},${Math.round(255 * c01(c[1]))},${Math.round(255 * c01(c[2]))},${a})`;
const INK: RGB = [0.2, 0.2, 0.23];

/** 一身打扮换算成各处实际的颜色 */
export interface Tones { robe: RGB; skirt: RGB; trim: RGB; sash: RGB; hair: RGB; skin: RGB; shoes: RGB; hat: RGB; leg: RGB; tie: RGB; fold: RGB; inner: RGB; coat: RGB | null; flower: RGB }
export function tones(l: Look): Tones {
  const robe = tone(l.robe, l.robeDens), skin = tone(l.skin, l.skinDens), trim = tone(l.trim, l.trimDens);
  return {
    robe, skin, trim,
    skirt: l.skirt ? tone(l.skirt, l.skirtDens ?? l.robeDens) : robe,
    sash: tone(l.sash, l.sashDens), hair: tone(l.hair, l.hairDens), shoes: tone(l.shoes, l.shoesDens), hat: tone(l.hatPig, l.hatDens),
    leg: l.leg ? tone(l.leg, l.legDens ?? 1) : [0.95, 0.95, 0.93],
    tie: l.accent ? tone(l.accent, 1) : trim,
    fold: mix(robe, INK, 0.5),
    inner: l.inner ? tone(l.inner, l.innerDens ?? 1) : [0.97, 0.97, 0.95],
    coat: l.coat ? tone(l.coat, l.coatDens ?? l.robeDens) : null,
    flower: l.flower ? tone(l.flower, 1) : [0.93, 0.62, 0.62],
  };
}
/** 裹着头的布帽（巾、东坡巾、幞头）：头顶那一层是帽，不是发 */
export const clothHat = (h: Look['hat']) => h === 'jin' || h === 'dongpo' || h === 'futou';

/**
 * 贴图的排法（uv）：左半张是衣；右上四分之一是头（经纬展开）；右下靠左的一小块是斗笠的篾纹；
 * 右下角是一块纯白——只用顶点色的部件（手、鞋、髻、须……）都指到那里。
 */
export const ATLAS = {
  robeU: 0.5,
  head: { u0: 0.5, v0: 0.5, du: 0.5, dv: 0.5 },
  hat: { u0: 0.5, v0: 0.25, du: 0.25, dv: 0.25 },
  white: [0.875, 0.125] as const,
};
/** 衣那半张：上面 73% 是衣身（v=0.27 垂到脚踝的下摆 … 1 领口），最下面 24% 给袖子（v=0.012 肩 … 0.24 袖口） */
export const TEX = { body0: 0.27, sleeve0: 0.012, sleeve1: 0.24 };
/** 衣身上某个站立高度对应贴图的 v */
export const bodyV = (y: number) => TEX.body0 + (1 - TEX.body0) * Math.max(0, Math.min(1, (y - 0.085) / (1.316 - 0.085)));

/** 发际线：经度（度，正前为 0，朝左为正）处头发盖到的纬度（度） */
export function hairline(lon: number): number {
  const a = Math.abs(lon), s = (x: number) => x * x * (3 - 2 * x);
  if (a <= 52) return 39 - 5 * (a / 52) * (a / 52) + 2.2 * Math.exp(-(a / 9) * (a / 9));
  if (a <= 80) return 34 - 30 * s((a - 52) / 28);
  if (a <= 100) return 4 - 9 * ((a - 80) / 20);
  if (a <= 142) return -5 - 31 * s((a - 100) / 42);
  return -36;
}
/** 巾的沿：前面压在额上，绕过耳上，脑后低到颈窝——一道斜着的圈 */
const capline = (lon: number) => 5 + 31 * Math.cos((lon * Math.PI) / 180);
/** 头顶那一层（发，或巾）盖到哪：纬度高过它的地方就是。童子剃了头，只留额前一撮与两个小髻 */
function topLine(l: Look): (lon: number) => number {
  if (clothHat(l.hat)) return capline;
  if (l.hat === 'tufts') return () => 200;
  return hairline;
}

// —— 贴图 ——
function paintRobe(g: CanvasRenderingContext2D, l: Look, T: Tones, W: number, H: number, r: Rng) {
  const k = W / 256, X = (u: number) => W * u, Y = (y: number) => H * (1 - bodyV(y));
  const hem = l.hem, long = hem < 0.2, collar = l.collar ?? 'cross', coat = T.coat, cHem = Math.max(hem + 0.04, l.coatHem ?? 0.45);
  g.fillStyle = css(T.robe); g.fillRect(0, 0, W, H);
  // 襦裙：腰以下另一色
  if (l.skirt) { g.fillStyle = css(T.skirt); g.fillRect(0, Y(0.99), W, Y(hem) - Y(0.99) + 2); }
  // 褙子（罩在外头的那一件）：自领口到它的下摆；对襟敞开处（前心）、两侧开衩处露出里面的长衣或裙。
  // 贴图的横向绕身一周：u 0 是背心，0.25 右胁，0.5 前心，0.75 左胁
  const OPEN = 0.022;
  if (coat) {
    g.fillStyle = css(coat);
    g.fillRect(0, 0, X(0.5 - OPEN), Y(cHem)); g.fillRect(X(0.5 + OPEN), 0, W - X(0.5 + OPEN), Y(cHem));
    // 两侧开衩：自下摆往上到胯下，一道窄窄的三角露出里面
    const slit = (u: number) => {
      g.fillStyle = css(l.skirt && cHem < 0.99 ? T.skirt : T.robe);
      g.beginPath(); g.moveTo(X(u - 0.018), Y(cHem) + 1); g.lineTo(X(u), Y(Math.min(0.8, cHem + 0.36))); g.lineTo(X(u + 0.018), Y(cHem) + 1); g.closePath(); g.fill();
      g.strokeStyle = css(mix(T.trim, INK, 0.25)); g.lineWidth = 1.6 * k;
      g.beginPath(); g.moveTo(X(u - 0.018), Y(cHem)); g.lineTo(X(u), Y(Math.min(0.8, cHem + 0.36))); g.lineTo(X(u + 0.018), Y(cHem)); g.stroke();
    };
    slit(0.25); slit(0.75);
  }
  // 衣纹：几笔两头尖的线。下摆自腰往下垂的长褶，腋下往腰里收的短褶
  if (l.folds > 0) {
    const fold = (pts: Array<[number, number]>, w: number, col: RGB) => stroke(g, pts, (t) => w * k * (0.12 + 0.88 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.96 + 0.02)), 0.7)), css(col, Math.min(1, 0.55 + 0.45 * l.folds)));
    const n = l.skirt ? 13 : 9, fc = l.skirt ? mix(T.skirt, INK, 0.45) : T.fold;
    for (let i = 0; i < n; i++) {
      const u = 0.05 + (0.9 * (i + 0.5)) / n + (r() - 0.5) * 0.04, top = hem + (0.9 - hem) * (0.55 + 0.42 * r()), bot = hem + 0.025 + 0.05 * r(), sw = (r() - 0.5) * 0.035;
      fold([[X(u), Y(top)], [X(u + sw * 0.6), Y(top + (bot - top) * 0.4)], [X(u + sw), Y(top + (bot - top) * 0.75)], [X(u + sw * 0.7), Y(bot)]], (1.5 + 1.6 * r()) * l.folds, fc);
    }
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const u = 0.5 + s * (0.2 + 0.07 * i + 0.02 * r());
      fold([[X(u), Y(1.15 - 0.03 * i)], [X(u - s * 0.012), Y(1.08)], [X(u - s * 0.03), Y(1.0)]], (1.3 + r()) * l.folds, T.fold);
    }
  }
  // 襕：膝下一道横襕（襕衫），上沿一道淡墨
  if (l.lan) {
    const y0 = Y(l.lan + 0.035), y1 = Y(l.lan);
    g.fillStyle = css(T.trim); g.fillRect(0, y0, W, y1 - y0);
    g.fillStyle = css(mix(T.trim, INK, 0.5)); g.fillRect(0, y0 - 0.8 * k, W, 1.1 * k);
  }
  // 下摆的边
  g.fillStyle = css(T.trim); g.fillRect(0, Y(hem + (long ? 0.03 : 0.022)), W, Y(hem) - Y(hem + (long ? 0.03 : 0.022)) + 2 * k);
  // 褙子的下摆一道边、对襟两道直下的襟缘
  if (coat) {
    g.fillStyle = css(T.trim);
    g.fillRect(0, Y(cHem + 0.026), X(0.5 - OPEN), Y(cHem) - Y(cHem + 0.026) + 1); g.fillRect(X(0.5 + OPEN), Y(cHem + 0.026), W - X(0.5 + OPEN), Y(cHem) - Y(cHem + 0.026) + 1);
  }
  const band = (pts: Array<[number, number]>, w: number, col: string) => {
    g.strokeStyle = col; g.lineWidth = w * k; g.lineCap = 'butt'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(([u, y], i) => (i ? g.lineTo(X(u), Y(y)) : g.moveTo(X(u), Y(y)))); g.stroke();
  };
  const topY = 1.33, neckY = 1.296;
  if (collar === 'cross') {
    // 交领（右衽）：先画压在下面的右襟，再画盖在上面的左襟；两襟之间露出一小块中衣
    g.fillStyle = css(T.inner); g.beginPath(); g.moveTo(X(0.432), Y(topY)); g.lineTo(X(0.568), Y(topY)); g.lineTo(X(0.538), Y(1.215)); g.lineTo(X(0.503), Y(1.15)); g.lineTo(X(0.47), Y(1.215)); g.closePath(); g.fill();
    band([[0.418, topY], [0.445, 1.24], [0.488, 1.165], [0.512, 1.135]], 7.5, css(T.trim));
    band([[0.582, topY], [0.556, 1.245], [0.5, 1.13], [0.44, 1.02], [0.408, 0.965]], 8, css(T.trim));
    band([[0.566, topY], [0.541, 1.243], [0.487, 1.134], [0.43, 1.03], [0.398, 0.975]], 1.1, css(mix(T.trim, INK, 0.55)));
  } else if (collar === 'round') {
    // 圆领：领口一圈圆的领缘（前低后高），右肩一颗纽；右胁一道开襟的线自领下到腰
    band([[0.405, topY], [0.43, 1.292], [0.468, 1.268], [0.5, 1.262], [0.532, 1.268], [0.57, 1.292], [0.595, topY]], 7, css(T.trim));
    band([[0.405, 1.31], [0.43, 1.28], [0.468, 1.256], [0.5, 1.25], [0.532, 1.256], [0.57, 1.28], [0.595, 1.31]], 1, css(mix(T.trim, INK, 0.55)));
    g.fillStyle = css(mix(T.trim, INK, 0.3)); g.beginPath(); g.ellipse(X(0.405), Y(1.285), 3.2 * k, 2.6 * k, 0, 0, 6.2832); g.fill();
    band([[0.405, 1.28], [0.39, 1.18], [0.375, 1.0]], 1.2, css(mix(T.robe, INK, 0.45)));
  } else {
    // 对襟：两襟自领口直下，不交；中间露出里面的衣（有褙子时是褙子的两襟，到它的下摆；没有就到衣摆）
    const bottom = coat ? cHem : hem + 0.03;
    if (!coat) { g.fillStyle = css(T.inner); g.fillRect(X(0.5 - OPEN), Y(topY), X(0.5 + OPEN) - X(0.5 - OPEN), Y(1.05) - Y(topY)); }
    for (const s of [-1, 1]) {
      const u0 = 0.5 + s * OPEN;
      band([[0.5 + s * 0.085, topY], [0.5 + s * 0.05, 1.27], [u0 + s * 0.006, 1.2], [u0 + s * 0.006, bottom]], 7, css(T.trim));
      band([[0.5 + s * 0.072, topY], [0.5 + s * 0.04, 1.27], [u0 - s * 0.004, 1.2], [u0 - s * 0.004, bottom]], 1, css(mix(T.trim, INK, 0.5)));
    }
    // 领口里露出的那一点里衣（交领的中衣）
    g.fillStyle = css(T.inner); g.beginPath(); g.moveTo(X(0.44), Y(topY)); g.lineTo(X(0.56), Y(topY)); g.lineTo(X(0.5 + OPEN), Y(1.24)); g.lineTo(X(0.5 - OPEN), Y(1.24)); g.closePath(); g.fill();
  }
  // 后领：一圈立着的领缘
  g.fillStyle = css(T.trim); g.fillRect(0, 0, X(0.418) + 1, Y(neckY)); g.fillRect(X(0.582) - 1, 0, W - X(0.582) + 1, Y(neckY));
  // 绦带：腰间一条，左前打结；长衫垂两条带梢，短衣只一个结。罩着褙子时只在敞开处露出一截与带结
  const sy0 = Y(0.99), sy1 = Y(0.942), kx = coat ? X(0.5) : X(0.578), ky = (sy0 + sy1) / 2;
  g.fillStyle = css(T.sash);
  if (coat) g.fillRect(X(0.5 - OPEN), sy0, X(0.5 + OPEN) - X(0.5 - OPEN), sy1 - sy0); else g.fillRect(0, sy0, W, sy1 - sy0);
  const tail = (dx: number, len: number, w: number) => {
    g.strokeStyle = css(T.sash); g.lineWidth = w * k; g.lineCap = 'round';
    g.beginPath(); g.moveTo(kx, ky); g.quadraticCurveTo(kx + dx * k * 0.4, ky + len * 0.5, kx + dx * k, ky + len); g.stroke();
  };
  if (long) { tail(-3.5, Y(0.62) - ky, 4); tail(6.5, Y(0.68) - ky, 3.5); } else { tail(-3, (Y(0.8) - ky) * 0.8, 3.5); tail(5, (Y(0.84) - ky) * 0.8, 3); }
  g.fillStyle = css(mul(T.sash, 0.85)); g.beginPath(); g.ellipse(kx, ky, 6 * k, 5.2 * k * (H / W / 2), 0.3, 0, 6.2832); g.fill();
  // 袖子那一条：素面，几笔顺着袖长的褶，袖口一道边（罩着褙子时是褙子的袖）
  const s0 = H * (1 - TEX.sleeve1), s1 = H * (1 - TEX.sleeve0);
  g.fillStyle = css(coat ?? T.robe); g.fillRect(0, s0 - 7 * k, W, H - s0 + 7 * k);
  if (l.folds > 0) for (let i = 0; i < 5; i++) {
    const u = 0.1 + 0.2 * i + (r() - 0.5) * 0.06, a = s1 - (s1 - s0) * (0.08 + 0.2 * r()), b = s0 + (s1 - s0) * (0.12 + 0.1 * r());
    stroke(g, [[X(u), a], [X(u + (r() - 0.5) * 0.03), (a + b) / 2], [X(u + (r() - 0.5) * 0.04), b]], (t) => (1.2 + 1.2 * r()) * k * l.folds * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.96 + 0.02)), 0.7), css(T.fold, 0.9));
  }
  g.fillStyle = css(T.trim); g.fillRect(0, s0 - 7 * k, W, 7 * k + (s1 - s0) * 0.1);
}

function paintHead(g: CanvasRenderingContext2D, l: Look, T: Tones, x0: number, y0: number, w: number, h: number) {
  g.save();
  g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  // 之后的坐标：x 是经度（度，正前为 0），y 是纬度（度，朝上）
  g.translate(x0 + w / 2, y0 + h / 2); g.scale(w / 360, -h / 180);
  g.fillStyle = css(T.skin); g.fillRect(-180, -90, 360, 180);
  const child = l.hat === 'tufts', line = topLine(l), cloth = clothHat(l.hat), top = cloth ? T.hat : T.hair, fem = l.build === 'f';
  if (!child) {
    g.fillStyle = css(top);
    g.beginPath(); g.moveTo(-180, line(-180));
    for (let lon = -180; lon <= 180; lon += 2) g.lineTo(lon, line(lon));
    g.lineTo(180, 90); g.lineTo(-180, 90); g.closePath(); g.fill();
    // 巾沿压一道深边；发则自发际往髻上梳几道淡的丝
    if (cloth) {
      g.strokeStyle = css(mul(top, 0.72)); g.lineWidth = 3.2; g.beginPath();
      for (let lon = -180; lon <= 180; lon += 4) (lon === -180 ? g.moveTo(lon, line(lon) + 1.6) : g.lineTo(lon, line(lon) + 1.6));
      g.stroke();
    } else {
      g.lineWidth = 1.1;
      for (let lon = -176; lon <= 176; lon += 9) { g.strokeStyle = css(mix(top, [0.6, 0.6, 0.6], 0.16 + 0.1 * Math.sin(lon * 1.7))); g.beginPath(); g.moveTo(lon, line(lon) + 3); g.lineTo(lon * 0.985, 90); g.stroke(); }
    }
  } else {
    // 童子：额前一撮，头顶两侧各一个小髻的发根
    g.fillStyle = css(T.hair);
    g.beginPath(); g.ellipse(0, 60, 24, 17, 0, 0, 6.2832); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 72, 62, 22, 9, 0, 0, 6.2832); g.fill(); }
    // 两颊一点红
    for (const s of [-1, 1]) { const gr = g.createRadialGradient(s * 31, -20, 1, s * 31, -20, 15); gr.addColorStop(0, 'rgba(226,128,110,0.42)'); gr.addColorStop(1, 'rgba(226,128,110,0)'); g.fillStyle = gr; g.fillRect(s * 31 - 16, -36, 32, 32); }
  }
  // 眼：阖着的两道；眉：更淡的两笔。须发白了的人，眉也淡
  const feat = mix(T.skin, [0.2, 0.15, 0.13], 0.86), brow = mix(T.skin, mix(T.hair, [0.22, 0.17, 0.15], 0.5), 0.5);
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    const ex = s * 19.5, ey = child ? -1 : 1.5;
    g.strokeStyle = css(feat); g.lineWidth = child ? 2.2 : fem ? 1.55 : 1.7;
    // 女子：眼尾略长、微微上挑
    if (fem) { g.beginPath(); g.moveTo(ex - s * 6.4, ey + 0.2); g.quadraticCurveTo(ex + s * 0.6, ey - 3.0, ex + s * 9.2, ey + 0.9); g.stroke(); }
    else { g.beginPath(); g.moveTo(ex - s * 6.7, ey + 0.3); g.quadraticCurveTo(ex, ey - 3.2, ex + s * 8.1, ey - 0.4); g.stroke(); }
    g.strokeStyle = css(brow); g.lineWidth = fem ? 1.05 : 1.3;
    // 女子的眉细而长，弯一点（远山眉）
    if (fem) { g.beginPath(); g.moveTo(ex - s * 5.5, ey + 12.4); g.quadraticCurveTo(ex + s * 2.2, ey + 16.2, ex + s * 11.6, ey + 12.6); g.stroke(); }
    else { g.beginPath(); g.moveTo(ex - s * 7, ey + 11.4); g.quadraticCurveTo(ex + s * 0.7, ey + 14.7, ex + s * 9.8, ey + 12.2); g.stroke(); }
  }
  // 女子：唇上一点朱，两颊极淡的一层胭脂
  if (fem && !child) {
    g.fillStyle = 'rgba(196,84,78,0.78)'; g.beginPath(); g.ellipse(0, -30.5, 4.3, 1.7, 0, 0, 6.2832); g.fill();
    for (const s of [-1, 1]) { const gr = g.createRadialGradient(s * 30, -18, 1, s * 30, -18, 15); gr.addColorStop(0, 'rgba(232,150,140,0.15)'); gr.addColorStop(1, 'rgba(232,150,140,0)'); g.fillStyle = gr; g.fillRect(s * 30 - 16, -34, 32, 32); }
  }
  // 髭：唇上两撇（有须的人）
  if (l.beard > 0) {
    g.strokeStyle = css(mix(T.skin, T.hair, 0.72)); g.lineWidth = 1.9;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 6.5, -27); g.lineTo(s * 14.5, -35 - 3 * l.beard); g.stroke(); }
  }
  g.restore();
}

function paintHat(g: CanvasRenderingContext2D, T: Tones, x0: number, y0: number, w: number, h: number, r: Rng) {
  // 竹篾：一圈圈（横线）与放射的骨（竖线）。v：0 在笠沿（这块的下边），1 在笠顶
  g.fillStyle = css(T.hat); g.fillRect(x0, y0, w, h);
  const dark = css(mul(T.hat, 0.74));
  for (let i = 1; i < 9; i++) { g.fillStyle = dark; g.globalAlpha = 0.45 + 0.4 * r(); g.fillRect(x0, y0 + (h * i) / 9, w, Math.max(1, h * 0.012)); }
  for (let i = 0; i < 16; i++) { g.globalAlpha = 0.3 + 0.3 * r(); g.fillRect(x0 + (w * i) / 16, y0, Math.max(1, w * 0.012), h); }
  g.globalAlpha = 1;
  g.fillStyle = css(mul(T.hat, 0.6)); g.fillRect(x0, y0 + h * 0.94, w, h * 0.06); g.fillRect(x0, y0, w, h * 0.05);
}

/** 这一身打扮的那张贴图。px 是边长 */
export function paintAtlas(l: Look, px: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d')!, T = tones(l), r = mulberry32(3301);
  g.fillStyle = '#fff'; g.fillRect(0, 0, px, px);
  paintRobe(g, l, T, px / 2, px, r);
  paintHead(g, l, T, px / 2, 0, px / 2, px / 2);
  paintHat(g, T, px / 2, px / 2, px / 4, px / 4, r);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

// —— 部件 ——
const KEEP = ['position', 'normal', 'uv', 'color'];
/** 整理成能并在一起的样子：带索引，恰有 position / normal / uv / color。col 是这一块的颜色；uv 不给就整块指到贴图的白处 */
export function piece(g: THREE.BufferGeometry, col: RGB | null, uv: readonly [number, number] | 'keep' = ATLAS.white): THREE.BufferGeometry {
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.index) { const ix = new Uint16Array(n); for (let i = 0; i < n; i++) ix[i] = i; g.setIndex(new THREE.BufferAttribute(ix, 1)); }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (uv !== 'keep') { const a = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < n; i++) a.setXY(i, uv[0], uv[1]); }
  const c = new Float32Array(n * 3), k = col ?? [1, 1, 1];
  for (let i = 0; i < n; i++) { c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const key of Object.keys(g.attributes)) if (!KEEP.includes(key)) g.deleteAttribute(key);
  return g;
}
export function weld(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(list, false);
  if (!m) throw new Error('avatar: 部件的属性不一致');
  for (const g of list) g.dispose();
  return m;
}
/** 把 uv（0…1）挪进贴图上的一块 */
function intoAtlas(g: THREE.BufferGeometry, r: { u0: number; v0: number; du: number; dv: number }): THREE.BufferGeometry {
  const a = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < a.count; i++) a.setXY(i, r.u0 + r.du * Math.min(0.999, Math.max(0.001, a.getX(i))), r.v0 + r.dv * Math.min(0.999, Math.max(0.001, a.getY(i))));
  return g;
}
/** 一条两面都看得见的窄带（带梢）：沿 pts 走，宽 w，面大致朝 n */
export function strip(pts: THREE.Vector3[], w: number, n: THREE.Vector3): THREE.BufferGeometry {
  const pos: number[] = [];
  const side = (i: number) => new THREE.Vector3().subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).cross(n).normalize().multiplyScalar(w / 2);
  for (let i = 0; i < pts.length - 1; i++) {
    const s0 = side(i), s1 = side(i + 1);
    const a = pts[i].clone().sub(s0), b = pts[i].clone().add(s0), c = pts[i + 1].clone().add(s1), d = pts[i + 1].clone().sub(s1);
    for (const tri of [[a, b, c], [a, c, d], [a, c, b], [a, d, c]]) for (const p of tri) pos.push(p.x, p.y, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** 一幅两面都看得见的布：rows[j][i] 是点阵（自上而下、自左而右），正反各一层 */
export function sheet(rows: THREE.Vector3[][]): THREE.BufferGeometry {
  const nj = rows.length, ni = rows[0].length, pos: number[] = [], idx: number[] = [];
  for (let side = 0; side < 2; side++) for (const row of rows) for (const p of row) pos.push(p.x, p.y, p.z);
  for (let side = 0; side < 2; side++) for (let j = 0; j < nj - 1; j++) for (let i = 0; i < ni - 1; i++) {
    const a = side * nj * ni + j * ni + i, b = a + 1, c = a + ni + 1, d = a + ni;
    if (side) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** 斗笠：尖顶、宽沿。原点在笠沿的圆心，尖朝 +y。uv 落在贴图的篾纹上；里面一层压暗 */
function liHat(T: Tones, R: number, Hh: number, seg: number): THREE.BufferGeometry {
  const outer: Array<[number, number]> = [[0.0001, Hh + 0.004], [0.016, Hh + 0.003], [0.03, Hh - 0.004], [R * 0.4, Hh * 0.7], [R * 0.75, Hh * 0.36], [R - 0.012, 0.012], [R, 0.0], [R + 0.004, -0.004]];
  const top = new THREE.LatheGeometry(outer.map(([x, y]) => new THREE.Vector2(x, y)).reverse(), seg);
  top.computeVertexNormals();
  const inner: Array<[number, number]> = [[R + 0.004, -0.004], [R - 0.004, -0.008], [R * 0.7, Hh * 0.33], [R * 0.22, Hh * 0.78], [0.0001, Hh - 0.012]];
  const under = new THREE.LatheGeometry(inner.map(([x, y]) => new THREE.Vector2(x, y)).reverse(), seg);
  under.computeVertexNormals();
  return weld([intoAtlas(piece(top, null, 'keep'), ATLAS.hat), piece(under, mul(T.hat, 0.5))]);
}

export const HEAD_UP = 0.152;   // 头心在颈根（头的转轴）上方多少
/**
 * 头：原点在颈根（转轴），面朝 +z。发、髻或巾、须、耳、颈，戴着的斗笠，都在这一块里。
 * tall 给了的话，高出头顶的那几样（东坡巾、幞头的巾子、小冠、高髻、包髻、花冠）放进 tall 里另做一块（同样的坐标）——
 * 雨天戴上斗笠时那一块压低收进笠里（figure.ts），不然从笠顶戳出来
 */
export function buildHead(l: Look, low: boolean, tall?: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const T = tones(l), line = topLine(l), jin = clothHat(l.hat);
  const ws = low ? 18 : 30, hs = low ? 12 : 20;
  const s = new THREE.SphereGeometry(1, ws, hs).rotateY(-Math.PI / 2);
  const p = s.attributes.position as THREE.BufferAttribute;
  const rx = 0.0975, ry = 0.121, rz = 0.104, DEG = 180 / Math.PI;
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i), dy = p.getY(i), dz = p.getZ(i);
    const lon = Math.atan2(dx, dz) * DEG, lat = Math.asin(Math.max(-1, Math.min(1, dy))) * DEG;
    let x = dx * rx, y = dy * ry, z = dz * rz;
    if (dy < 0) { const k = Math.pow(-dy, 1.5); x *= 1 - 0.17 * k; z *= dz > 0 ? 1 - 0.06 * k : 1 - 0.13 * k; }
    if (dz < 0) z *= 1.07;
    if (dz > 0) {
      // 脸的体面：额与颧略平，鼻梁只一点起伏，眼窝极浅——宁可空，不要怪
      z *= 1 - 0.03 * (1 - Math.abs(dy)) * Math.exp(-(lon / 60) * (lon / 60));
      z += 0.0062 * Math.exp(-((lon / 7.5) ** 2) - (((lat + 10) / 13) ** 2));
      z -= 0.0022 * Math.exp(-(((Math.abs(lon) - 20) / 11) ** 2) - (((lat - 2) / 8) ** 2));
      z += 0.003 * Math.exp(-((lon / 26) ** 2) - (((lat + 60) / 18) ** 2));
    }
    // 发比头皮高出一层；巾更厚些，沿上有一道棱（勾线会落在这里）
    const h = Math.max(0, Math.min(1, (lat - line(lon) + 2) / (jin ? 3 : 5)));
    const k = 1 + (jin ? 0.1 : 0.062) * h * h * (3 - 2 * h);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  s.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [intoAtlas(piece(s, null, 'keep'), ATLAS.head)];
  const tp = tall ?? parts;
  const worn = l.hat === 'li' && l.hatWorn;
  if (l.hat === 'jin') {
    // 幅巾：髻裹在巾里，在头顶偏后撑起一个矮而方的顶；脑后两条短短的巾带，朝两边撇开
    const crown = new THREE.LatheGeometry([[0.0001, 0.05], [0.036, 0.049], [0.057, 0.04], [0.064, 0.02], [0.066, -0.01], [0.07, -0.05]].map(([x, y]) => new THREE.Vector2(x, y)).reverse(), low ? 10 : 16);
    crown.computeVertexNormals();
    parts.push(piece(crown.scale(1, 1, 0.86).rotateX(-0.3).translate(0, 0.122, -0.022), T.hat));
    for (const sx of [-1, 1]) {
      const rows = [0, 1, 2, 3].map((j) => { const t = j / 3, c = V(sx * (0.02 + 0.045 * t), -0.04 - 0.105 * t, -0.109 - 0.022 * Math.sin(t * 2.2)), w = 0.016 + 0.004 * t; return [c.clone().add(V(-w, 0, 0)), c.clone().add(V(w, 0, 0))]; });
      parts.push(piece(sheet(rows), mul(T.hat, 0.9)));
    }
  } else if (l.hat === 'dongpo') {
    // 东坡巾：高而方的一顶巾，里一重墙高、外一重墙矮一些，外墙的四角对着前后左右；墙是软的，上沿略收
    const box = (half: number, y0: number, y1: number, rot: number, col: RGB, n = 4) => {
      const seg = low ? 16 : 24, rows = 3, pos: number[] = [], idx: number[] = [];
      for (let j = 0; j < rows; j++) {
        const t = j / (rows - 1), y = y0 + (y1 - y0) * t, h = half * (1 - 0.06 * t);
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2 + rot, c = Math.cos(a), s = Math.sin(a);
          const rr = h * Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), -1 / n);
          pos.push(s * rr, y, c * rr * 0.94);
        }
      }
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 2, d = a + seg + 1; idx.push(a, b, c, a, c, d); }
      // 顶：一片平的
      const top0 = pos.length / 3; pos.push(0, y1, 0);
      for (let i = 0; i < seg; i++) idx.push(top0, (rows - 1) * (seg + 1) + i + 1, (rows - 1) * (seg + 1) + i);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      return piece(geo, col);
    };
    tp.push(box(0.083, 0.04, 0.215, 0, T.hat));
    // 外一重墙浅一层（墨色的帽上看得出两重）
    tp.push(box(0.094, 0.032, 0.172, Math.PI / 4, mix(T.hat, [0.9, 0.9, 0.9], 0.16)));
  } else if (l.hat === 'futou') {
    // 软脚幞头：裹着头，脑后上方一个高起的巾子（包着髻），两条软脚自脑后垂到肩上、略往两边撇
    tp.push(piece(new THREE.SphereGeometry(1, low ? 10 : 16, low ? 8 : 12).scale(0.062, 0.058, 0.06).translate(0, 0.118, -0.032), T.hat));
    for (const sx of [-1, 1]) {
      const rows = [0, 1, 2, 3, 4].map((j) => { const t = j / 4, c = V(sx * (0.02 + 0.06 * t), 0.07 - 0.2 * t, -0.112 - 0.03 * Math.sin(t * 2.6)), w = 0.017 + 0.003 * t; return [c.clone().add(V(-w, 0, 0)), c.clone().add(V(w, 0, 0))]; });
      parts.push(piece(sheet(rows), mul(T.hat, 0.92)));
    }
  } else if (l.hat === 'guan') {
    // 小冠：头顶偏后一个髻，上面一顶小冠（前低后高的一道弯），横贯一根簪
    tp.push(piece(new THREE.SphereGeometry(1, low ? 9 : 14, low ? 7 : 10).scale(0.044, 0.034, 0.044).rotateX(-0.28).translate(0, 0.136, -0.03), T.hair));
    const crown = new THREE.LatheGeometry([[0.0001, 0.0], [0.03, 0.0], [0.036, 0.018], [0.034, 0.04], [0.02, 0.056], [0.0001, 0.06]].map(([x, y]) => new THREE.Vector2(x, y)).reverse(), low ? 10 : 16);
    crown.computeVertexNormals();
    tp.push(piece(crown.scale(0.95, 1, 1.25).rotateX(-0.42).translate(0, 0.142, -0.032), l.hatPig ? T.hat : [0.32, 0.3, 0.3]));
    tp.push(piece(new THREE.CylinderGeometry(0.0032, 0.0032, 0.15, 5).rotateZ(Math.PI / 2).translate(0, 0.165, -0.03), [0.92, 0.9, 0.8]));
  } else if (l.hat === 'gaoji') {
    // 高髻：发自四面梳上去，头顶偏后盘一个扁髻，上面立起一道髻环（略往前倾，像一弯新月立着），脑后挽一个小的。
    // 髻环上顺着发的走向几道深浅（不然是一团墨）
    tp.push(piece(new THREE.SphereGeometry(1, low ? 10 : 16, low ? 8 : 12).scale(0.056, 0.032, 0.052).translate(0, 0.128, -0.028), T.hair));
    const loop = new THREE.TorusGeometry(0.034, 0.012, low ? 6 : 9, low ? 16 : 26, Math.PI * 1.32).rotateZ(Math.PI / 2 - Math.PI * 0.66).scale(0.95, 1.3, 0.9).rotateX(-0.22).translate(0, 0.168, -0.032);
    const lp = piece(loop, T.hair), lc = lp.attributes.color as THREE.BufferAttribute, lpos = lp.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < lpos.count; i++) {
      const k = 1 + 0.5 * Math.max(0, Math.sin(Math.atan2(lpos.getY(i) - 0.168, lpos.getX(i)) * 7 + lpos.getZ(i) * 300));
      lc.setXYZ(i, Math.min(1, T.hair[0] * k), Math.min(1, T.hair[1] * k), Math.min(1, T.hair[2] * k));
    }
    tp.push(lp);
    parts.push(piece(new THREE.SphereGeometry(1, low ? 8 : 12, low ? 6 : 9).scale(0.034, 0.028, 0.032).translate(0, 0.05, -0.112), T.hair));
    // 髻前一把小梳（宋人插梳）：一弯浅月牙
    tp.push(piece(new THREE.TorusGeometry(0.032, 0.0055, 4, low ? 10 : 16, Math.PI * 0.85).rotateZ(Math.PI * 0.075).scale(1, 0.55, 0.5).rotateX(-0.5).translate(0, 0.142, 0.012), [0.92, 0.88, 0.78]));
  } else if (l.hat === 'baoji') {
    // 包髻：髻用一方帕子包起来，帕角在前面打一个结、两个角翘着
    tp.push(piece(new THREE.SphereGeometry(1, low ? 10 : 16, low ? 8 : 12).scale(0.066, 0.052, 0.064).rotateX(-0.35).translate(0, 0.128, -0.04), T.hat));
    tp.push(piece(new THREE.SphereGeometry(1, 8, 6).scale(0.022, 0.017, 0.016).translate(0, 0.158, 0.008), mul(T.hat, 0.85)));
    for (const sx of [-1, 1]) parts.push(piece(new THREE.ConeGeometry(0.011, 0.038, 5).rotateZ(-sx * 1.05).rotateX(0.3).translate(sx * 0.026, 0.168, 0.01), mul(T.hat, 0.9)));
  } else if (l.hat === 'huaguan') {
    // 花冠：头顶盘一个髻，髻根一圈细冠，冠上一圈花——几朵大的在前，两侧小些，一片两片叶
    tp.push(piece(new THREE.SphereGeometry(1, low ? 10 : 16, low ? 8 : 12).scale(0.054, 0.048, 0.052).translate(0, 0.134, -0.028), T.hair));
    tp.push(piece(new THREE.TorusGeometry(0.052, 0.006, 5, low ? 14 : 22).rotateX(Math.PI / 2 - 0.25).translate(0, 0.118, -0.024), [0.82, 0.72, 0.5]));
    const n = low ? 7 : 9, leaf: RGB = [0.42, 0.56, 0.42];
    for (let i = 0; i < n; i++) {
      // 花立着、朝外开（正前那几朵最大最高，往两边低下去、小下去），朵与朵之间留一点空
      const a = -1.55 + (3.1 * i) / (n - 1), big = 1 - 0.45 * Math.abs(a) / 1.55, rr = 0.058;
      const x = Math.sin(a) * rr, z = Math.cos(a) * rr * 0.92 - 0.024, y = 0.134 + 0.05 * big;
      const col = i % 3 === 0 ? T.flower : i % 3 === 1 ? mix(T.flower, [0.98, 0.96, 0.9], 0.55) : mix(T.flower, [0.95, 0.8, 0.5], 0.5);
      const fr = 0.015 * big + 0.008, f = new THREE.SphereGeometry(1, 8, 6).scale(fr, fr, fr * 0.42).rotateX(-0.25).rotateY(a).translate(x, y, z);
      tp.push(piece(f, col));
      tp.push(piece(new THREE.SphereGeometry(1, 5, 4).scale(fr * 0.35, fr * 0.35, fr * 0.35).translate(x + Math.sin(a) * fr * 0.4, y, z + Math.cos(a) * fr * 0.4), [0.96, 0.82, 0.4]));
      if (i % 2 === 0) tp.push(piece(new THREE.SphereGeometry(1, 5, 4).scale(0.014, 0.0028, 0.007).rotateZ(0.5).rotateY(a + 0.7).translate(x * 1.08, y - fr * 0.8, z * 1.06), leaf));
    }
  } else if (l.hat === 'bun') {
    // 妇人的髻：脑后偏上一个大的，横插一根簪（身上另戴了簪、步摇的，就用那一根）
    parts.push(piece(new THREE.SphereGeometry(1, low ? 10 : 14, low ? 7 : 10).scale(0.056, 0.046, 0.058).rotateX(-0.5).translate(0, 0.112, -0.055), T.hair));
    parts.push(piece(new THREE.SphereGeometry(1, 8, 6).scale(0.03, 0.026, 0.03).translate(0, 0.15, -0.035), T.hair));
    if (!(l.orn ?? []).some((o) => o.startsWith('zan') || o === 'buyao')) parts.push(piece(new THREE.CylinderGeometry(0.0035, 0.0035, 0.17, 5).rotateZ(Math.PI / 2).rotateY(0.25).translate(0, 0.126, -0.06), [0.9, 0.86, 0.72]));
  } else if (l.hat === 'tufts') {
    // 总角：头顶两侧各一个小髻，扎一圈红绳
    for (const sx of [-1, 1]) {
      parts.push(piece(new THREE.SphereGeometry(0.024, 8, 6).scale(1, 1.15, 1).translate(sx * 0.055, 0.128, -0.008), T.hair));
      parts.push(piece(new THREE.TorusGeometry(0.014, 0.0055, 5, 9).rotateX(Math.PI / 2).rotateZ(-sx * 0.42).translate(sx * 0.05, 0.111, -0.008), T.tie));
    }
  } else if (!worn) {
    // 光着的髻：头顶偏后一个，束一条带，带梢垂在脑后
    parts.push(piece(new THREE.SphereGeometry(1, low ? 9 : 14, low ? 7 : 10).scale(0.046, 0.036, 0.046).rotateX(-0.28).translate(0, 0.136, -0.03), T.hair));
    parts.push(piece(new THREE.TorusGeometry(0.041, 0.0088, low ? 5 : 7, low ? 12 : 18).rotateX(Math.PI / 2).rotateX(-0.28).translate(0, 0.118, -0.024), T.tie));
    for (const sx of [-1, 1]) {
      const pts = [V(sx * 0.012, 0.112, -0.064), V(sx * 0.02, 0.085, -0.094), V(sx * 0.03, 0.04, -0.118), V(sx * 0.036, -0.012, -0.124)];
      parts.push(piece(strip(pts, 0.02, V(sx * 0.25, 0.2, -1).normalize()), T.tie));
    }
  }
  if (worn) {
    // 戴着的斗笠：沿压到眉上，略往后仰，露出脸来
    const hat = liHat(T, 0.262, 0.118, low ? 18 : 30);
    hat.applyMatrix4(new THREE.Matrix4().compose(V(0, 0.018, -0.012), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.13, 0, 0.03)), V(1, 1, 1)));
    parts.push(hat);
  }
  // 须：颔下一绺（扁的一片，上宽下尖，略朝前飘）
  if (l.beard > 0) {
    const len = 0.04 + 0.14 * l.beard, w = 0.017 + 0.011 * l.beard, col = mix(T.hair, [0.72, 0.72, 0.72], 0.2);
    const b = new THREE.LatheGeometry([[0.0001, -len], [w * 0.3, -len * 0.9], [w * 0.75, -len * 0.62], [w, -len * 0.3], [w * 0.92, -0.008], [w * 0.5, 0.004]].map(([x, y]) => new THREE.Vector2(x, y)), 8);
    b.scale(1.3, 1, 0.5).rotateX(-0.42); b.computeVertexNormals();
    parts.push(piece(b.translate(0, -0.098, 0.066), col));
  }
  // 耳、颈
  for (const sx of [-1, 1]) parts.push(piece(new THREE.SphereGeometry(1, 7, 5).scale(0.0105, 0.027, 0.017).rotateY(sx * 0.25).translate(sx * 0.0935, -0.008, -0.004), T.skin));
  parts.push(piece(new THREE.CylinderGeometry(0.042, 0.047, 0.13, low ? 9 : 14, 1, true).translate(0, -0.125, -0.002), T.skin));
  const g = weld(parts).translate(0, HEAD_UP, 0.008);
  if (l.head !== 1) g.scale(l.head, l.head, l.head);
  return g;
}

/**
 * 背上的东西：挂着的斗笠（笠面朝后，略歪，两根绳过肩在领口下打结）、蓑衣。
 * 坐标是「胸」的坐标（原点在胸心，x 朝左、y 沿脊向上、z 朝前）。没有就返回 null。
 */
export function buildBack(l: Look, low: boolean): THREE.BufferGeometry | null {
  const T = tones(l), parts: THREE.BufferGeometry[] = [];
  if (l.hat === 'li' && !l.hatWorn) {
    const hat = liHat(T, 0.228, 0.095, low ? 18 : 32);
    hat.applyMatrix4(new THREE.Matrix4().compose(V(0.012, -0.03, -0.14), new THREE.Quaternion().setFromEuler(new THREE.Euler(-(Math.PI / 2 - 0.2), 0.06, 0.14, 'YXZ')), V(1, 1, 1)));
    parts.push(hat);
    const cordC = mul(T.hat, 0.5);
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([V(sx * 0.1, 0.172, -0.126), V(sx * 0.098, 0.136, -0.06), V(sx * 0.088, 0.129, 0.012), V(sx * 0.062, 0.108, 0.076), V(sx * 0.028, 0.086, 0.099), V(0.002, 0.07, 0.105)]);
      parts.push(piece(new THREE.TubeGeometry(c, low ? 8 : 14, 0.0026, 4, false), cordC));
    }
    parts.push(piece(new THREE.SphereGeometry(0.0066, 6, 5).translate(0.002, 0.069, 0.106), cordC));
  }
  if (l.cape) {
    // 蓑衣：两层草，上一层披在肩上（一圈），下一层盖着背与两胁（前面敞着）；下沿参差
    const seg = low ? 16 : 24, straw = T.hat;
    const tier = (y0: number, y1: number, ax0: number, az0: number, ax1: number, az1: number, arc: number, dz: number) => {
      const pos: number[] = [], col: number[] = [], idx: number[] = [], rows = 3;
      for (let j = 0; j < rows; j++) {
        const t = j / (rows - 1), bulge = 1 + 0.1 * Math.sin(Math.PI * t);
        for (let i = 0; i <= seg; i++) {
          const a = Math.PI + (i / seg - 0.5) * arc, rag = j === rows - 1 ? (i % 2 ? 1.07 : 0.95) : 1, drop = j === rows - 1 ? (i % 2 ? -0.03 : 0.012) + 0.012 * Math.sin(i * 2.7) : 0;
          pos.push(Math.sin(a) * (ax0 + (ax1 - ax0) * t) * bulge * rag, y0 + (y1 - y0) * t + drop, Math.cos(a) * (az0 + (az1 - az0) * t) * bulge * rag + dz * t);
          const c = mul(straw, 1.04 - 0.3 * t * t - (i % 3 === 0 ? 0.07 : 0)); col.push(c[0], c[1], c[2]);
        }
      }
      // 圈自上而下排：面朝外的绕向是 a,c,b / a,d,c
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 2, d = a + seg + 1; idx.push(a, c, b, a, d, c); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const out = piece(g, null); (out.attributes.color as THREE.BufferAttribute).array.set(col);
      return out;
    };
    parts.push(tier(0.135, -0.11, 0.075, 0.075, 0.33, 0.24, Math.PI * 2, 0));
    parts.push(tier(-0.02, -0.47, 0.24, 0.19, 0.35, 0.3, Math.PI * 1.4, -0.04));
  }
  return parts.length ? weld(parts) : null;
}

/**
 * 手：原点在掌心，+y 指尖，+z 手心。右手（s = −1）的拇指在 +x 一侧，左手在 −x。连指的一只手。
 * 腕与一截小臂（袖子褪下去时露出来）另是一块（buildWrist），顺着小臂摆——手攥着东西、腕折着的时候，那一截不跟着手歪出袖子去
 */
export function buildHand(l: Look, low: boolean, s: number): THREE.BufferGeometry {
  const T = tones(l), seg = low ? 7 : 10;
  const g = weld([
    piece(new THREE.SphereGeometry(1, seg, seg - 2).scale(0.035, 0.047, 0.0145).translate(0, -0.006, 0), T.skin),
    // 四指并拢，略向手心蜷
    piece(new THREE.SphereGeometry(1, seg, seg - 2).scale(0.03, 0.043, 0.0115).rotateX(0.3).translate(0, 0.046, 0.0075), T.skin),
    piece(new THREE.SphereGeometry(1, 6, 5).scale(0.0105, 0.03, 0.0105).rotateZ(-0.62).rotateX(0.2).translate(0.036, 0.004, 0.008), T.skin),
  ]);
  if (s > 0) {
    // 左手是右手的镜像：翻过去之后把每个三角的绕向调回来
    g.scale(-1, 1, 1);
    const ix = g.index!.array as Uint16Array | Uint32Array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  if (l.build === 'f') g.scale(0.89, 0.92, 0.89);
  return g;
}

// —— 雨具：下雨下雪在外头时戴的斗笠、披的蓑衣（谁都一样的草色，不随这一身的衣色；figure.ts 按 gear 的成数摆上、卸下） ——
/** 斗笠的篾色、蓑衣的草色（都压着一点，在水墨里不跳）：颜料与浓度 */
const STRAW: RGB = [0.9, 0.85, 0.7], STRAW_D = 1.25, COIR: RGB = [0.84, 0.78, 0.64], COIR_D = 1.55;
/**
 * 雨天的斗笠：尖顶、宽沿，比背着、戴着的那种深一些（髻、巾顶都容得下）。原点在笠沿的圆心，尖朝 +y。
 * 篾纹用顶点色画：一圈圈的篾（隔行深浅）、几道放射的骨；里面一层压暗。只用贴图上的白处，所以谁戴都是草色
 */
export const RAIN_HAT = { r: 0.272, h: 0.17 };
export function buildRainHat(low: boolean): THREE.BufferGeometry {
  const R = RAIN_HAT.r, Hh = RAIN_HAT.h, seg = low ? 16 : 28, base = tone(STRAW, STRAW_D);
  const outer: Array<[number, number]> = [[0.0001, Hh + 0.006], [0.018, Hh + 0.004], [0.034, Hh - 0.006], [R * 0.3, Hh * 0.74], [R * 0.55, Hh * 0.47], [R * 0.8, Hh * 0.2], [R - 0.012, 0.012], [R, 0.0], [R + 0.004, -0.005]];
  const top = new THREE.LatheGeometry(outer.map(([x, y]) => new THREE.Vector2(x, y)).reverse(), seg);
  top.computeVertexNormals();
  const inner: Array<[number, number]> = [[R + 0.004, -0.005], [R - 0.006, -0.009], [R * 0.7, Hh * 0.2], [R * 0.3, Hh * 0.62], [0.0001, Hh - 0.014]];
  const under = new THREE.LatheGeometry(inner.map(([x, y]) => new THREE.Vector2(x, y)).reverse(), seg);
  under.computeVertexNormals();
  const a = piece(top, base), b = piece(under, mul(base, 0.52));
  // 篾：按高度一圈深一圈浅；按经度每隔几格一道深的骨；笠沿一道深边
  const p = a.attributes.position as THREE.BufferAttribute, c = a.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), lon = Math.atan2(x, z), r = Math.hypot(x, z);
    const ring = Math.floor((y / Hh) * 9) % 2 ? 0.93 : 1.02, rib = Math.abs(Math.sin(lon * 8)) > 0.97 ? 0.8 : 1, rim = r > R - 0.016 ? 0.66 : 1;
    const k = ring * rib * rim * (1 - 0.08 * (y / Hh));
    c.setXYZ(i, base[0] * k, base[1] * k, base[2] * k);
  }
  return weld([a, b]);
}

/**
 * 雨天的蓑衣：棕草编的一领披，三层，一层压着一层（上一层的下沿参差地盖住下一层的上头）；领口一圈围着颈，往下前面敞开，
 * 披过肩、盖着背与两胁，下沿到胯下一点。坐标是「胸」的坐标（原点在胸心，x 朝左、y 沿脊向上、z 朝前）。
 * 草的一道道丝用顶点色画（隔几格一道深的），每层下沿深、上头浅。两面都画（衣的材质两面都画）。
 */
export const CAPE = { top: 0.135, bottom: -0.4 };
export function buildRainCape(low: boolean): THREE.BufferGeometry {
  const seg = low ? 18 : 30, base = tone(COIR, COIR_D), parts: THREE.BufferGeometry[] = [];
  // 一层：自 t0 到 t1（0 领口 … 1 下沿）。半径按 t 取（左右宽、前后窄），盖住的角度自领口的整圈到下面前襟敞开
  const radX = (t: number) => (t < 0.18 ? 0.078 + (0.215 - 0.078) * (t / 0.18) : t < 0.4 ? 0.215 + (0.305 - 0.215) * ((t - 0.18) / 0.22) : 0.305 + (0.37 - 0.305) * ((t - 0.4) / 0.6));
  const radZ = (t: number) => (t < 0.18 ? 0.074 + (0.15 - 0.074) * (t / 0.18) : t < 0.4 ? 0.15 + (0.215 - 0.15) * ((t - 0.18) / 0.22) : 0.215 + (0.29 - 0.215) * ((t - 0.4) / 0.6));
  const half = (t: number) => Math.PI * (t < 0.1 ? 1 : t < 0.35 ? 1 - 0.27 * ((t - 0.1) / 0.25) : 0.73);
  const Y = (t: number) => CAPE.top + (CAPE.bottom - CAPE.top) * t;
  const tier = (t0: number, t1: number, grow: number, seed: number) => {
    const rows = 4, pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let j = 0; j < rows; j++) {
      const u = j / (rows - 1), t = t0 + (t1 - t0) * u, last = j === rows - 1;
      const k = 1 + grow * u, hf = half(t);
      for (let i = 0; i <= seg; i++) {
        const v = i / seg, a = Math.PI + (v - 0.5) * 2 * hf;
        // 下沿参差：一绺长一绺短
        const rag = last ? ((i + seed) % 2 ? 1.04 : 0.97) : 1, drop = last ? ((i + seed) % 3 === 0 ? -0.035 : (i + seed) % 2 ? -0.012 : 0.008) : 0;
        pos.push(Math.sin(a) * radX(t) * k * rag, Y(t) + drop, Math.cos(a) * radZ(t) * k * rag);
        const strand = (i + seed) % 3 === 0 ? 0.8 : (i + seed) % 3 === 1 ? 0.95 : 1.04, shadeK = (1.06 - 0.32 * u * u) * strand;
        col.push(base[0] * shadeK, base[1] * shadeK, base[2] * shadeK);
      }
    }
    for (let j = 0; j < rows - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 2, d = a + seg + 1; idx.push(a, c, b, a, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const out = piece(g, null); (out.attributes.color as THREE.BufferAttribute).array.set(col);
    return out;
  };
  parts.push(tier(0, 0.42, 0.06, 0));
  parts.push(tier(0.34, 0.74, 0.05, 1));
  parts.push(tier(0.66, 1, 0.04, 2));
  return weld(parts);
}

/** 腕与一截小臂：原点在腕上，+y 顺着小臂指向手（自腕往前探进掌根 3 厘米，往后 12 厘米），两头敞着（藏在掌里、袖里） */
export function buildWrist(l: Look, low: boolean): THREE.BufferGeometry {
  const r = l.build === 'f' ? 0.88 : 1;
  return piece(new THREE.CylinderGeometry(0.021 * r, 0.027 * r, 0.15, low ? 6 : 7, 1, true).translate(0, -0.045, 0), tones(l).skin);
}

/** 脚：一只布鞋（或草鞋、光脚——只是颜色不同）。原点在踝的正下方的地面，脚尖朝 +z */
export function buildFoot(l: Look, low: boolean): THREE.BufferGeometry {
  const T = tones(l), NZ = low ? 7 : 11, NS = low ? 8 : 12;
  const z0 = -0.062, z1 = 0.152;
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  // 布鞋有一道白的千层底；草鞋、光脚没有
  const sole: RGB = l.shoesDens > 2 ? [0.86, 0.85, 0.8] : mul(T.shoes, 0.85);
  for (let j = 0; j <= NZ; j++) {
    const t = j / NZ, z = z0 + (z1 - z0) * t;
    // 两头收圆：脚跟是半个圆，鞋头是圆而略翘的
    const eh = t < 0.16 ? Math.sqrt(Math.max(0, 1 - ((0.16 - t) / 0.16) ** 2)) : 1, et = t > 0.74 ? Math.sqrt(Math.max(0, 1 - ((t - 0.74) / 0.26) ** 2)) : 1;
    const w = (0.03 + 0.013 * Math.sin(Math.PI * Math.min(1, t * 1.3))) * eh * et;
    const h = (0.056 - 0.028 * Math.pow(t, 1.4)) * (0.72 + 0.28 * eh) * (0.5 + 0.5 * et);
    const lift = 0.007 * Math.pow(Math.max(0, (t - 0.7) / 0.3), 2);
    for (let i = 0; i <= NS; i++) {
      const a = (i / NS) * Math.PI * 2, sn = Math.sin(a), cs = Math.cos(a);
      const sy = Math.sign(sn) * Math.pow(Math.abs(sn), 0.6);
      const y = h * (0.5 + 0.5 * sy);
      pos.push(w * Math.sign(cs) * Math.pow(Math.abs(cs), 0.75), y + lift, z);
      const c = y < 0.0105 ? sole : T.shoes; col.push(c[0], c[1], c[2]);
    }
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NS; i++) { const a = j * (NS + 1) + i, b = a + 1, c = a + NS + 2, d = a + NS + 1; idx.push(a, b, c, a, c, d); }
  const shoe = new THREE.BufferGeometry();
  shoe.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shoe.setIndex(idx); shoe.computeVertexNormals();
  const out = piece(shoe, null);
  (out.attributes.color as THREE.BufferAttribute).array.set(col);
  if (l.build === 'f') out.scale(0.86, 0.92, 0.88);
  return out;
}
