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
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const css = (c: RGB, a = 1) => `rgba(${Math.round(255 * c01(c[0]))},${Math.round(255 * c01(c[1]))},${Math.round(255 * c01(c[2]))},${a})`;
const INK: RGB = [0.2, 0.2, 0.23];

/** 一身打扮换算成各处实际的颜色 */
export interface Tones { robe: RGB; skirt: RGB; trim: RGB; sash: RGB; hair: RGB; skin: RGB; shoes: RGB; hat: RGB; leg: RGB; tie: RGB; fold: RGB; inner: RGB }
export function tones(l: Look): Tones {
  const robe = tone(l.robe, l.robeDens), skin = tone(l.skin, l.skinDens), trim = tone(l.trim, l.trimDens);
  return {
    robe, skin, trim,
    skirt: l.skirt ? tone(l.skirt, l.skirtDens ?? l.robeDens) : robe,
    sash: tone(l.sash, l.sashDens), hair: tone(l.hair, l.hairDens), shoes: tone(l.shoes, l.shoesDens), hat: tone(l.hatPig, l.hatDens),
    leg: l.leg ? tone(l.leg, l.legDens ?? 1) : [0.95, 0.95, 0.93],
    tie: l.accent ? tone(l.accent, 1) : trim,
    fold: mix(robe, INK, 0.5),
    inner: [0.97, 0.97, 0.95],
  };
}

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
  if (l.hat === 'jin') return capline;
  if (l.hat === 'tufts') return () => 200;
  return hairline;
}

// —— 贴图 ——
function paintRobe(g: CanvasRenderingContext2D, l: Look, T: Tones, W: number, H: number, r: Rng) {
  const k = W / 256, X = (u: number) => W * u, Y = (y: number) => H * (1 - bodyV(y));
  const hem = l.hem, long = hem < 0.2;
  g.fillStyle = css(T.robe); g.fillRect(0, 0, W, H);
  // 襦裙：腰以下另一色
  if (l.skirt) { g.fillStyle = css(T.skirt); g.fillRect(0, Y(0.99), W, Y(hem) - Y(0.99) + 2); }
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
  // 下摆的边
  g.fillStyle = css(T.trim); g.fillRect(0, Y(hem + (long ? 0.03 : 0.022)), W, Y(hem) - Y(hem + (long ? 0.03 : 0.022)) + 2 * k);
  // 交领（右衽）：先画压在下面的右襟，再画盖在上面的左襟；两襟之间露出一小块中衣
  const band = (pts: Array<[number, number]>, w: number, col: string) => {
    g.strokeStyle = col; g.lineWidth = w * k; g.lineCap = 'butt'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(([u, y], i) => (i ? g.lineTo(X(u), Y(y)) : g.moveTo(X(u), Y(y)))); g.stroke();
  };
  const topY = 1.33, neckY = 1.296;
  g.fillStyle = css(T.inner); g.beginPath(); g.moveTo(X(0.432), Y(topY)); g.lineTo(X(0.568), Y(topY)); g.lineTo(X(0.538), Y(1.215)); g.lineTo(X(0.503), Y(1.15)); g.lineTo(X(0.47), Y(1.215)); g.closePath(); g.fill();
  band([[0.418, topY], [0.445, 1.24], [0.488, 1.165], [0.512, 1.135]], 7.5, css(T.trim));
  band([[0.582, topY], [0.556, 1.245], [0.5, 1.13], [0.44, 1.02], [0.408, 0.965]], 8, css(T.trim));
  band([[0.566, topY], [0.541, 1.243], [0.487, 1.134], [0.43, 1.03], [0.398, 0.975]], 1.1, css(mix(T.trim, INK, 0.55)));
  // 后领：一圈立着的领缘
  g.fillStyle = css(T.trim); g.fillRect(0, 0, X(0.418) + 1, Y(neckY)); g.fillRect(X(0.582) - 1, 0, W - X(0.582) + 1, Y(neckY));
  // 绦带：腰间一条，左前打结；长衫垂两条带梢，短衣只一个结
  const sy0 = Y(0.99), sy1 = Y(0.942), kx = X(0.578), ky = (sy0 + sy1) / 2;
  g.fillStyle = css(T.sash); g.fillRect(0, sy0, W, sy1 - sy0);
  const tail = (dx: number, len: number, w: number) => {
    g.strokeStyle = css(T.sash); g.lineWidth = w * k; g.lineCap = 'round';
    g.beginPath(); g.moveTo(kx, ky); g.quadraticCurveTo(kx + dx * k * 0.4, ky + len * 0.5, kx + dx * k, ky + len); g.stroke();
  };
  if (long) { tail(-3.5, Y(0.62) - ky, 4); tail(6.5, Y(0.68) - ky, 3.5); } else { tail(-3, (Y(0.8) - ky) * 0.8, 3.5); tail(5, (Y(0.84) - ky) * 0.8, 3); }
  g.fillStyle = css(mul(T.sash, 0.85)); g.beginPath(); g.ellipse(kx, ky, 6 * k, 5.2 * k * (H / W / 2), 0.3, 0, 6.2832); g.fill();
  // 袖子那一条：素面，几笔顺着袖长的褶，袖口一道边
  const s0 = H * (1 - TEX.sleeve1), s1 = H * (1 - TEX.sleeve0);
  g.fillStyle = css(T.robe); g.fillRect(0, s0 - 7 * k, W, H - s0 + 7 * k);
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
  const child = l.hat === 'tufts', line = topLine(l), top = l.hat === 'jin' ? T.hat : T.hair;
  if (!child) {
    g.fillStyle = css(top);
    g.beginPath(); g.moveTo(-180, line(-180));
    for (let lon = -180; lon <= 180; lon += 2) g.lineTo(lon, line(lon));
    g.lineTo(180, 90); g.lineTo(-180, 90); g.closePath(); g.fill();
    // 巾沿压一道深边；发则自发际往髻上梳几道淡的丝
    if (l.hat === 'jin') {
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
    g.strokeStyle = css(feat); g.lineWidth = child ? 2.2 : 1.7;
    g.beginPath(); g.moveTo(ex - s * 6.7, ey + 0.3); g.quadraticCurveTo(ex, ey - 3.2, ex + s * 8.1, ey - 0.4); g.stroke();
    g.strokeStyle = css(brow); g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(ex - s * 7, ey + 11.4); g.quadraticCurveTo(ex + s * 0.7, ey + 14.7, ex + s * 9.8, ey + 12.2); g.stroke();
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
function piece(g: THREE.BufferGeometry, col: RGB | null, uv: readonly [number, number] | 'keep' = ATLAS.white): THREE.BufferGeometry {
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
function weld(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
function strip(pts: THREE.Vector3[], w: number, n: THREE.Vector3): THREE.BufferGeometry {
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
function sheet(rows: THREE.Vector3[][]): THREE.BufferGeometry {
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
/** 头：原点在颈根（转轴），面朝 +z。发、髻或巾、须、耳、颈，戴着的斗笠，都在这一块里 */
export function buildHead(l: Look, low: boolean): THREE.BufferGeometry {
  const T = tones(l), line = topLine(l), jin = l.hat === 'jin';
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
  } else if (l.hat === 'bun') {
    // 妇人的髻：脑后偏上一个大的，横插一根簪
    parts.push(piece(new THREE.SphereGeometry(1, low ? 10 : 14, low ? 7 : 10).scale(0.056, 0.046, 0.058).rotateX(-0.5).translate(0, 0.112, -0.055), T.hair));
    parts.push(piece(new THREE.SphereGeometry(1, 8, 6).scale(0.03, 0.026, 0.03).translate(0, 0.15, -0.035), T.hair));
    parts.push(piece(new THREE.CylinderGeometry(0.0035, 0.0035, 0.17, 5).rotateZ(Math.PI / 2).rotateY(0.25).translate(0, 0.126, -0.06), [0.9, 0.86, 0.72]));
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

/** 手：原点在掌心，+y 指尖，+z 手心。右手（s = −1）的拇指在 +x 一侧，左手在 −x。连指的一只手，带一截小臂（袖子褪下去时露出来） */
export function buildHand(l: Look, low: boolean, s: number): THREE.BufferGeometry {
  const T = tones(l), seg = low ? 7 : 10;
  const g = weld([
    piece(new THREE.SphereGeometry(1, seg, seg - 2).scale(0.035, 0.047, 0.0145).translate(0, -0.006, 0), T.skin),
    // 四指并拢，略向手心蜷
    piece(new THREE.SphereGeometry(1, seg, seg - 2).scale(0.03, 0.043, 0.0115).rotateX(0.3).translate(0, 0.046, 0.0075), T.skin),
    piece(new THREE.SphereGeometry(1, 6, 5).scale(0.0105, 0.03, 0.0105).rotateZ(-0.62).rotateX(0.2).translate(0.036, 0.004, 0.008), T.skin),
    piece(new THREE.CylinderGeometry(0.021, 0.027, 0.15, 7, 1, true).translate(0, -0.114, 0), T.skin),
  ]);
  if (s > 0) {
    // 左手是右手的镜像：翻过去之后把每个三角的绕向调回来
    g.scale(-1, 1, 1);
    const ix = g.index!.array as Uint16Array | Uint32Array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  }
  return g;
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
  return out;
}
