/**
 * 添的几样笔（接 tiles2.ts）。不另开图集：build.ts 把它们拼在 FIELD、PETAL 两张图集的末尾，所以不多一次绘制。
 *   淡彩（WILDW，拼在 FIELD 后）：兰叶（写兰的撇叶）、竹笋、狗尾草、紫苏薄荷、枸杞、浮萍、萱草叶、香蒲（带蒲棒）
 *   粉（WILDB，拼在 PETAL 后）：蓼花、蒲公英的绒球、蘑菇、萱草花、芍药、丝瓜、皂角、椿树的蒴果
 * 用的时候：fw('lan') / pb('liao') 给出它在拼好的图集里是第几格。
 */
import { blob, ink, stroke, type Tile } from '../../ink/brush';
import { W, bs, haze, sheet } from './tiles';
import { FIELD, PETAL } from './tiles2';

const TAU = Math.PI * 2;
type P2 = [number, number];
/** 折线上按比例取点 */
const on = (p: P2[], t: number): P2 => { const k = Math.min(p.length - 2, Math.floor(t * (p.length - 1))), f = t * (p.length - 1) - k; return [p[k][0] + (p[k + 1][0] - p[k][0]) * f, p[k][1] + (p[k + 1][1] - p[k][1]) * f]; };

// ———————————————————————————— 淡彩 ————————————————————————————
/** 兰：几片长叶从根上撇出去，一长一短、一片弯过来交叉，叶尖垂下（写兰的「交凤眼」）；中间一两片直的 */
const lan: Tile = (g, r) => {
  const n = 6 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? 1 : -1, reach = 0.22 + 0.32 * r(), h = 0.42 + 0.42 * r(), x0 = 0.5 + (r() - 0.5) * 0.05;
    const cross = i === 2 ? -1 : 1;
    bs(g, [[x0, 0.97], [x0 + s * cross * reach * 0.2, 0.97 - h * 0.62], [x0 + s * reach * 0.75, 0.97 - h * 0.98], [x0 + s * reach * (1.05 + 0.2 * r()), 0.97 - h * 0.72 + 0.18 * r()]], W.leaf(0.034 + 0.012 * r(), 0.55), 0.82 + 0.18 * r(), 0.45);
  }
  for (let i = 0; i < 2; i++) { const x0 = 0.5 + (r() - 0.5) * 0.06; bs(g, [[x0, 0.97], [x0 + (r() - 0.5) * 0.08, 0.66], [x0 + (r() - 0.5) * 0.2, 0.4]], W.leaf(0.03, 0.6), 0.9, 0.5); }
};
/** 竹笋：尖尖的一只（有时两只），一层层裹着带斑的箨，尖上一点嫩 */
const sun: Tile = (g, r) => {
  const n = r() < 0.6 ? 1 : 2;
  for (let k = 0; k < n; k++) {
    const x = n === 1 ? 0.5 : 0.38 + k * 0.28, h = (k === 0 ? 0.78 : 0.48) * (0.85 + 0.2 * r()), w = (k === 0 ? 0.13 : 0.1), lean = (r() - 0.5) * 0.1;
    g.fillStyle = ink(0.5);
    g.beginPath(); g.moveTo(x - w, 0.98); g.quadraticCurveTo(x - w * 0.95, 0.98 - h * 0.55, x + lean, 0.98 - h); g.quadraticCurveTo(x + w * 0.95, 0.98 - h * 0.55, x + w, 0.98); g.closePath(); g.fill();
    for (let i = 0; i < 5; i++) { const t = 0.1 + i * 0.17, y = 0.98 - h * t, ww = w * (1 - t * 0.8), s = i % 2 ? 1 : -1; bs(g, [[x - s * ww, y + 0.02], [x + s * ww * 0.2, y - 0.05], [x + s * ww * 0.9 + lean * t, y - 0.12]], W.drop(ww * 0.95, 0.4), 0.55, 1.0); }
    for (let i = 0; i < 7; i++) { g.fillStyle = ink(0.95); g.beginPath(); g.ellipse(x + (r() - 0.5) * w * 1.1, 0.98 - h * (0.12 + 0.5 * r()), 0.014, 0.009, 0, 0, TAU); g.fill(); }
    g.fillStyle = ink(0.6, 1); g.beginPath(); g.ellipse(x + lean, 0.98 - h + 0.035, 0.022, 0.045, 0, 0, TAU); g.fill();
  }
};
/** 狗尾草：几茎细秆，顶上一条毛茸茸的穗，穗头垂着；根上几片叶 */
const gouwei: Tile = (g, r) => {
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x0 = 0.32 + 0.36 * r(), h = 0.5 + 0.35 * r(), lean = (r() - 0.5) * 0.55, tx = x0 + lean * 0.5, ty = 0.97 - h, dir = Math.sign(lean || 1);
    stroke(g, [[x0, 0.97], [x0 + lean * 0.2, 0.97 - h * 0.5], [tx, ty]], (t) => 0.018 * (1 - 0.4 * t), ink(0.7));
    for (let k = 0; k < 14; k++) { const t = k / 13, px = tx + dir * 0.12 * t, py = ty + 0.08 * t * t, a = (r() - 0.5) * 3.2; stroke(g, [[px, py], [px + Math.cos(a) * 0.035, py + Math.sin(a) * 0.035]], () => 0.011, ink(0.45 + 0.4 * r())); }
    g.fillStyle = ink(0.72); g.beginPath(); g.ellipse(tx + dir * 0.06, ty + 0.025, 0.07, 0.026, dir * 0.4, 0, TAU); g.fill();
  }
  for (let i = 0; i < 4; i++) { const s = i % 2 ? 1 : -1; bs(g, [[0.5, 0.97], [0.5 + s * 0.1, 0.83], [0.5 + s * 0.24, 0.76]], W.leaf(0.035, 0.6), 0.7, 0.45); }
};
/** 紫苏、薄荷：三五茎，对生的阔叶一层层往上 */
const zisu: Tile = (g, r) => {
  for (let s = 0; s < 3; s++) {
    const x = 0.32 + s * 0.18 + (r() - 0.5) * 0.05, h = 0.5 + 0.32 * r();
    stroke(g, [[x, 0.97], [x + (r() - 0.5) * 0.04, 0.97 - h]], (t) => 0.02 * (1 - 0.5 * t), ink(0.75));
    for (let k = 0; k < 4; k++) {
      const y = 0.97 - h * (0.25 + 0.22 * k), sz = 0.11 * (1 - 0.15 * k);
      for (const d of [-1, 1]) { const a = d > 0 ? -0.35 : Math.PI + 0.35; g.fillStyle = ink(0.5 + 0.45 * r()); g.beginPath(); g.ellipse(x + Math.cos(a) * sz * 0.85, y + Math.sin(a) * sz * 0.85, sz, sz * 0.6, a, 0, TAU); g.fill(); }
    }
  }
};
/** 枸杞：几根弯弯垂下的细枝，叶小而疏（果另点） */
const gouqi: Tile = (g, r) => {
  for (let i = 0; i < 5; i++) {
    const s = i % 2 ? 1 : -1, x0 = 0.5 + (r() - 0.5) * 0.1, up = 0.42 + 0.35 * r(), out = 0.2 + 0.24 * r();
    const pts: P2[] = [[x0, 0.97], [x0 + s * out * 0.3, 0.97 - up], [x0 + s * out * 0.8, 0.97 - up * 0.95], [x0 + s * out, 0.97 - up * 0.55]];
    stroke(g, pts, (t) => 0.016 * (1 - 0.6 * t), ink(0.8));
    for (let k = 0; k < 6; k++) { const [px, py] = on(pts, 0.25 + 0.7 * (k / 5)), a = (r() - 0.5) * 3 - Math.PI / 2; bs(g, [[px, py], [px + Math.cos(a) * 0.04, py + Math.sin(a) * 0.04], [px + Math.cos(a) * 0.075, py + Math.sin(a) * 0.075]], W.leaf(0.03, 0.6), 0.6 + 0.3 * r(), 0.45); }
  }
};
/** 浮萍：贴着水的一小片圆点 */
const fuping: Tile = (g, r) => { for (let i = 0; i < 16; i++) { const x = 0.12 + 0.76 * r(), y = 0.44 + 0.16 * r(); g.fillStyle = ink(0.45 + 0.5 * r()); g.beginPath(); g.ellipse(x, y, 0.035 + 0.02 * r(), 0.015 + 0.008 * r(), 0, 0, TAU); g.fill(); } };
/** 萱草叶：一丛宽长的叶，从根上向两边弯垂 */
const xuanLeaf: Tile = (g, r) => {
  for (let i = 0; i < 8; i++) {
    const s = i % 2 ? 1 : -1, reach = 0.18 + 0.3 * r(), h = 0.38 + 0.4 * r(), x0 = 0.5 + (r() - 0.5) * 0.06;
    bs(g, [[x0, 0.97], [x0 + s * reach * 0.25, 0.97 - h * 0.7], [x0 + s * reach * 0.8, 0.97 - h], [x0 + s * reach * 1.1, 0.97 - h * 0.7]], W.leaf(0.06 + 0.015 * r(), 0.5), 0.7 + 0.3 * r(), 0.45);
  }
};
/** 香蒲（蒲草）：一丛长长的带状叶，直上而梢头垂；两三根花茎，顶上一截深色的「蒲棒」 */
const xiangpu: Tile = (g, r) => {
  for (let i = 0; i < 9; i++) { const u = i / 8 - 0.5, h = (0.7 + 0.25 * r()) * (1 - 0.25 * Math.abs(u)), lean = u * 0.5 + (r() - 0.5) * 0.15; bs(g, [[0.5 + u * 0.12, 0.98], [0.5 + u * 0.2 + lean * 0.2, 0.98 - h * 0.6], [0.5 + u * 0.25 + lean * 0.5, 0.98 - h], [0.5 + u * 0.3 + lean * 0.75, 0.98 - h * 0.9]], W.leaf(0.045, 0.4), 0.6 + 0.35 * r(), 0.45); }
  for (let i = 0; i < 2 + Math.floor(r() * 2); i++) {
    const x = 0.4 + 0.2 * r(), top = 0.06 + 0.1 * r();
    stroke(g, [[x, 0.98], [x + (r() - 0.5) * 0.03, top + 0.2]], () => 0.014, ink(0.75));
    g.fillStyle = ink(1); g.beginPath(); g.ellipse(x, top + 0.12, 0.024, 0.075, 0, 0, TAU); g.fill();
    stroke(g, [[x, top + 0.04], [x, top]], () => 0.008, ink(0.8));
  }
};
export const WILDW = sheet(6, [['lan', lan], ['sun', sun], ['gouwei', gouwei], ['zisu', zisu], ['gouqi', gouqi], ['fuping', fuping], ['xuanLeaf', xuanLeaf], ['xiangpu', xiangpu]]);

// ———————————————————————————— 粉 ————————————————————————————
/** 蓼花：几茎细梗，梗头一条下垂的穗，穗是密密的小粒；梗上几片披针叶（点缀色） */
const liao: Tile = (g, r) => {
  for (let i = 0; i < 4; i++) {
    const x0 = 0.3 + 0.4 * r(), h = 0.58 + 0.3 * r(), lean = (r() - 0.5) * 0.45, tx = x0 + lean * 0.4, ty = 0.97 - h, dir = Math.sign(lean || 1);
    stroke(g, [[x0, 0.97], [x0 + lean * 0.15, 0.97 - h * 0.5], [tx, ty]], (t) => 0.016 * (1 - 0.3 * t), ink(0.8, 1));
    for (let k = 0; k < 14; k++) { const t = k / 13, px = tx + dir * 0.1 * t + (r() - 0.5) * 0.016, py = ty + 0.17 * t * t; g.fillStyle = ink(0.45 + 0.45 * r()); g.beginPath(); g.ellipse(px, py, 0.022, 0.027, 0, 0, TAU); g.fill(); }
  }
  for (let i = 0; i < 3; i++) { const s = i % 2 ? 1 : -1, y = 0.88 - i * 0.1; bs(g, [[0.5, y], [0.5 + s * 0.1, y - 0.05], [0.5 + s * 0.21, y - 0.06]], W.leaf(0.04, 0.6), 0.8, 0.6, 1, 1); }
};
/** 蒲公英的绒球：一根细梗顶一个白绒球；根上一圈锯齿叶（点缀色） */
const pugong: Tile = (g, r) => {
  const x = 0.5 + (r() - 0.5) * 0.06, y = 0.36;
  stroke(g, [[0.5, 0.97], [0.51, 0.7], [x, y + 0.1]], () => 0.016, ink(0.7, 1));
  for (let k = 0; k < 36; k++) { const a = r() * TAU, l = 0.12 + 0.03 * r(); stroke(g, [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], (t) => 0.007 + 0.004 * t, ink(0.18 + 0.2 * r())); g.fillStyle = ink(0.28); g.beginPath(); g.arc(x + Math.cos(a) * l, y + Math.sin(a) * l, 0.012, 0, TAU); g.fill(); }
  g.fillStyle = ink(0.75); g.beginPath(); g.arc(x, y, 0.026, 0, TAU); g.fill();
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i / 4 - 0.5) * 2.7; bs(g, [[0.5, 0.97], [0.5 + Math.cos(a) * 0.12, 0.97 + Math.sin(a) * 0.08], [0.5 + Math.cos(a) * 0.24, 0.97 + Math.sin(a) * 0.14]], W.drop(0.055, 0.5), 0.8, 0.6, 1, 1); }
};
/** 蘑菇：两三朵，伞盖上深下浅，盖下一线褶；柄白（点缀色） */
const mogu: Tile = (g, r) => {
  const n = 2 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    const x = 0.28 + (0.44 * (k + 0.5 * r())) / n + 0.1, s = 0.6 + 0.5 * r(), h = 0.26 * s, w = 0.16 * s;
    g.fillStyle = ink(0.1); g.beginPath(); g.moveTo(x - w * 0.16, 0.97); g.lineTo(x - w * 0.13, 0.97 - h); g.lineTo(x + w * 0.13, 0.97 - h); g.lineTo(x + w * 0.18, 0.97); g.closePath(); g.fill();
    const gr = g.createLinearGradient(x, 0.97 - h - w * 0.6, x, 0.97 - h + w * 0.1); gr.addColorStop(0, ink(0.95)); gr.addColorStop(1, ink(0.42));
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, 0.97 - h + 0.01, w, w * 0.58, 0, Math.PI, TAU); g.fill();
    g.fillStyle = ink(0.3); g.beginPath(); g.ellipse(x, 0.97 - h + 0.012, w * 0.93, w * 0.12, 0, 0, Math.PI); g.fill();
  }
};
/** 萱草花：一枝花茎，顶上两朵喇叭形的花（六瓣，瓣尖反卷）、一个苞；茎用点缀色 */
const xuanhua: Tile = (g, r) => {
  stroke(g, [[0.5, 0.97], [0.5, 0.62], [0.48, 0.36]], (t) => 0.02 * (1 - 0.3 * t), ink(0.8, 1));
  for (let k = 0; k < 2; k++) {
    const x = 0.48 + (k ? 0.13 : -0.09), y = 0.3 + k * 0.09, a0 = -Math.PI / 2 + (k ? 0.5 : -0.4);
    for (let i = 0; i < 6; i++) { const a = a0 + (i / 6 - 0.5) * 2.3, l = 0.15 + 0.04 * r(); bs(g, [[x, y + 0.04], [x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5], [x + Math.cos(a) * l, y + Math.sin(a) * l + 0.03]], W.leaf(0.056, 0.5), 0.92, 0.32); }
    g.fillStyle = ink(1); g.beginPath(); g.ellipse(x, y + 0.04, 0.025, 0.03, 0, 0, TAU); g.fill();
  }
  g.fillStyle = ink(0.7, 0.35); g.beginPath(); g.ellipse(0.42, 0.44, 0.024, 0.07, -0.4, 0, TAU); g.fill();
};
/** 芍药：一朵重瓣的大花，瓣一层层叠，外大内小，瓣根深；花心一点 */
const shaoyao: Tile = (g, r) => {
  for (let ring = 0; ring < 4; ring++) {
    const n = [9, 8, 7, 5][ring], rad = [0.37, 0.29, 0.21, 0.12][ring];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + ring * 0.4 + (r() - 0.5) * 0.3, px = 0.5 + Math.cos(a) * rad * 0.5, py = 0.52 + Math.sin(a) * rad * 0.42;
      const gr = g.createRadialGradient(0.5, 0.52, 0.02, px, py, rad * 0.75);
      gr.addColorStop(0, ink(0.85)); gr.addColorStop(1, ink(0.22 + 0.14 * ring));
      g.fillStyle = gr; g.beginPath(); g.ellipse(px, py, rad * 0.55, rad * 0.4, a, 0, TAU); g.fill();
    }
  }
  g.fillStyle = ink(1, 0.5); g.beginPath(); g.arc(0.5, 0.52, 0.05, 0, TAU); g.fill();
};
/** 丝瓜：一条长长的瓜垂着，几道纵纹，瓜蒂一点（点缀色） */
const sigua: Tile = (g, r) => {
  const bend = (r() - 0.5) * 0.14;
  stroke(g, [[0.5, 0.07], [0.5 + bend * 0.5, 0.45], [0.5 + bend, 0.94]], (t) => 0.06 + 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.03 * t, ink(0.55));
  for (let i = -1; i <= 1; i++) stroke(g, [[0.5 + i * 0.03, 0.15], [0.5 + bend * 0.5 + i * 0.045, 0.5], [0.5 + bend + i * 0.03, 0.9]], () => 0.009, ink(0.85));
  g.fillStyle = ink(0.9, 1); g.beginPath(); g.ellipse(0.5, 0.07, 0.03, 0.045, 0, 0, TAU); g.fill();
};
/** 皂角：几条长而扁的荚，扭着垂下来 */
const zaojia: Tile = (g, r) => {
  for (let i = 0; i < 4; i++) {
    const x = 0.25 + i * 0.17 + (r() - 0.5) * 0.06, tw = (r() - 0.5) * 0.2, l = 0.6 + 0.3 * r();
    stroke(g, [[x, 0.05], [x + tw * 0.4, 0.05 + l * 0.4], [x - tw * 0.2, 0.05 + l * 0.75], [x + tw * 0.3, 0.05 + l]], (t) => 0.045 * Math.sin(Math.PI * Math.min(1, 0.08 + t)) + 0.012, ink(0.7 + 0.25 * r()));
  }
  haze(g, 0.5, 0.45, 0.3, 0.35, 0.5, 0.15);
};
/** 椿、桐的蒴果：几颗干裂的小果，五瓣张开像小星（冬天挂在光枝上） */
const chunguo: Tile = (g, r) => {
  for (let k = 0; k < 5; k++) {
    const x = 0.2 + 0.6 * r(), y = 0.25 + 0.5 * r(), rad = 0.07 + 0.03 * r(), a0 = r() * TAU;
    for (let i = 0; i < 5; i++) { const a = a0 + (i / 5) * TAU; bs(g, [[x, y], [x + Math.cos(a) * rad * 0.6, y + Math.sin(a) * rad * 0.6], [x + Math.cos(a) * rad, y + Math.sin(a) * rad]], W.leaf(rad * 0.55, 0.5), 0.9, 0.5); }
    blob(g, r, x, y, rad * 0.25, ink(1), 2);
  }
};
export const WILDB = sheet(5, [['liao', liao], ['pugong', pugong], ['mogu', mogu], ['xuanhua', xuanhua], ['shaoyao', shaoyao], ['sigua', sigua], ['zaojia', zaojia], ['chunguo', chunguo]]);

/** 拼好的两张图集（FIELD + WILDW、PETAL + WILDB）的格子；build.ts 用它们画图集 */
export const FIELD_ALL = { cols: FIELD.cols, tiles: [...FIELD.tiles, ...WILDW.tiles] };
export const PETAL_ALL = { cols: PETAL.cols, tiles: [...PETAL.tiles, ...WILDB.tiles] };
/** 添的笔在拼好的图集里是第几格 */
export const fw = (k: keyof typeof WILDW.idx) => FIELD.tiles.length + WILDW.idx[k];
export const pb = (k: keyof typeof WILDB.idx) => PETAL.tiles.length + WILDB.idx[k];
