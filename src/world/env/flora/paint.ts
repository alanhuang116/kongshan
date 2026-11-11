/**
 * 叶的画法：松针束、银杏、枫、竹、梅、草、蕨……都是在画布上现画的小图，再拼成图集。
 * 约定：枝梢的小图「着枝处」在下边正中，叶往上、往两边长；画布的上方就是卡片的上方。
 * 要跟着季节变色的（银杏、枫）画成发白的灰阶，颜色由材质与顶点色去染；常绿的（松、竹）直接画成绿。
 */
import * as THREE from 'three';
import { fbm } from '../../core/rng';
import { bake, type TexSet } from '../../core/tex';
import type { Painter, Rand } from './util';

const rgb = (r: number, g: number, b: number, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const mix = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// —— 松 ——
const N_DARK = [9, 20, 11], N_MID = [28, 52, 24], N_LIGHT = [64, 96, 40], N_TIP = [112, 136, 62];
const needleColor = (t: number) => (t < 0.45 ? mix(N_DARK, N_MID, t / 0.45) : t < 0.88 ? mix(N_MID, N_LIGHT, (t - 0.45) / 0.43) : mix(N_LIGHT, N_TIP, (t - 0.88) / 0.12));
/** 一个新梢，侧看：一根小枝，针从四面斜着朝梢头长，像一把瓶刷。(x0, y0) 是梢根，ang 是朝向（0 朝上），len 是梢长 */
function brush(g: CanvasRenderingContext2D, x0: number, y0: number, ang: number, len: number, R: Rand, n: number, lw: number) {
  const dx = Math.sin(ang), dy = -Math.cos(ang), nl = len * 0.6;
  // 先垫一团实的底：远看它是一块墨绿，近看才见针
  g.save(); g.translate(x0 + dx * len * 0.56, y0 + dy * len * 0.56); g.rotate(ang);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, len * 0.6);
  gr.addColorStop(0, rgb(11, 24, 14, 0.97)); gr.addColorStop(0.62, rgb(14, 29, 16, 0.93)); gr.addColorStop(1, rgb(18, 36, 20, 0));
  g.fillStyle = gr; g.scale(0.74, 1);
  g.beginPath(); g.arc(0, 0, len * 0.6, 0, Math.PI * 2); g.fill();
  g.restore();
  g.lineCap = 'round';
  g.strokeStyle = rgb(44, 30, 22); g.lineWidth = lw * 2.2;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + dx * len * 0.4, y0 + dy * len * 0.4); g.stroke();
  const items: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const t = Math.pow(R(), 0.8), side = R() < 0.5 ? -1 : 1;
    items.push([t, ang + side * R.r(0.18, 1.2) * (1 - 0.62 * t), nl * R.r(0.66, 1.06) * (0.72 + 0.28 * (1 - t)), R()]);
  }
  items.sort((p, q) => p[3] - q[3]);
  for (const [t, a, l, tone] of items) {
    const sx = x0 + dx * len * (0.14 + 0.86 * t), sy = y0 + dy * len * (0.14 + 0.86 * t);
    const c = needleColor(tone);
    g.strokeStyle = rgb(c[0], c[1], c[2], 0.97); g.lineWidth = lw * (0.75 + tone * 0.5);
    const ex = sx + Math.sin(a) * l, ey = sy - Math.cos(a) * l, k = R.pm(0.12) * l;
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo((sx + ex) / 2 + Math.cos(a) * k, (sy + ey) / 2 + Math.sin(a) * k, ex, ey); g.stroke();
  }
}
/** 一个新梢，俯看：针四面散开 */
function star(g: CanvasRenderingContext2D, cx: number, cy: number, rad: number, R: Rand, n: number, lw: number) {
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad * 0.78);
  gr.addColorStop(0, rgb(11, 24, 14, 0.97)); gr.addColorStop(0.6, rgb(14, 29, 16, 0.92)); gr.addColorStop(1, rgb(18, 36, 20, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rad * 0.78, 0, Math.PI * 2); g.fill();
  g.lineCap = 'round';
  const items: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) items.push([R.r(0, Math.PI * 2), rad * R.r(0.5, 1), R()]);
  items.sort((p, q) => p[2] - q[2]);
  for (const [a, l, tone] of items) {
    const c = needleColor(tone);
    g.strokeStyle = rgb(c[0], c[1], c[2], 0.97); g.lineWidth = lw * (0.75 + tone * 0.5);
    const ox = R.pm(rad * 0.1), oy = R.pm(rad * 0.1);
    g.beginPath(); g.moveTo(cx + ox, cy + oy); g.lineTo(cx + ox + Math.cos(a) * l, cy + oy + Math.sin(a) * l); g.stroke();
  }
}
const twigTo = (g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number) => {
  g.strokeStyle = rgb(46, 32, 24); g.lineCap = 'round'; g.lineWidth = w;
  g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + (x1 - x0) * 0.25, y0 + (y1 - y0) * 0.85, x1, y1); g.stroke();
};
/** 一小枝松，侧看：分叉的小枝上六七个新梢，凑成底平顶圆的一小团 */
export const pineSprig: Painter = (g, S, R) => {
  const n = 7, lw = (S / 512) * 1.5 + 0.35;
  const sh: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n * 2 - 1 + R.pm(0.08), dome = 1 - u * u;
    sh.push([S * (0.5 + 0.34 * u), S * (0.83 - 0.15 * dome + R.pm(0.03)), u * 0.62 + R.pm(0.14), S * R.r(0.36, 0.46) * (0.82 + 0.18 * dome)]);
  }
  // 每个梢下面一小截枝（不收拢到一点：那样每张卡底下都是一把伞骨，一眼假）
  for (const [x, y] of sh) twigTo(g, x + (S * 0.5 - x) * 0.3, y + S * 0.13, x, y, S * 0.011);
  // 底边两头各垂下一两个小梢，把齐刷刷的底边打散
  for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) brush(g, S * (0.5 + sd * R.r(0.12, 0.36)), S * R.r(0.8, 0.88), sd * R.r(1.5, 2.3), S * R.r(0.16, 0.24), R, 60, lw);
  sh.sort(() => R() - 0.5);
  for (const [x, y, a, l] of sh) brush(g, x, y, a, l, R, 120, lw);
};
/** 一小枝松，俯看：七八个新梢凑成一团 */
export const pineCluster: Painter = (g, S, R) => {
  const lw = (S / 512) * 1.5 + 0.35, pts: Array<[number, number]> = [[0.5 + R.pm(0.03), 0.5 + R.pm(0.03)]];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + R.pm(0.25), q = R.r(0.22, 0.3); pts.push([0.5 + Math.cos(a) * q, 0.5 + Math.sin(a) * q]); }
  for (const [x, y] of pts.slice(1)) twigTo(g, S * 0.5, S * 0.5, x * S, y * S, S * 0.01);
  pts.sort(() => R() - 0.5);
  for (const [x, y] of pts) star(g, x * S, y * S, S * R.r(0.17, 0.215), R, 110, lw);
};
/** 远松用的整片「云片」，侧看：一排新梢，底平顶圆（画的时候竖向拉长，贴到扁卡片上正好） */
export const pinePadSide: Painter = (g, S, R) => {
  const lw = (S / 512) * 1.7 + 0.4, K = 2.3;
  g.translate(0, S); g.scale(1, K); g.translate(0, -S);
  for (let i = 0; i < 6; i++) twigTo(g, S * 0.5, S, S * (0.14 + 0.72 * (i / 5)), S * (1 - 0.1 / K * 3), S * 0.008);
  for (let i = 0; i < 26; i++) {
    const u = R.r(-1, 1), dome = Math.sqrt(Math.max(0, 1 - u * u));
    brush(g, S * (0.5 + 0.41 * u), S * (1 - (0.06 + 0.13 * dome * R()) ), u * 0.55 + R.pm(0.2), S * R.r(0.13, 0.17), R, 46, lw);
  }
};
export const pinePadTop: Painter = (g, S, R) => {
  const lw = (S / 512) * 1.7 + 0.4;
  g.fillStyle = rgb(12, 26, 15, 0.95);
  g.beginPath(); g.arc(S * 0.5, S * 0.5, S * 0.33, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 40; i++) {
    const a = R.r(0, Math.PI * 2), q = Math.sqrt(R()) * 0.39;
    star(g, S * (0.5 + Math.cos(a) * q), S * (0.5 + Math.sin(a) * q), S * R.r(0.075, 0.105), R, 36, lw);
  }
};

// —— 银杏 ——
/** 一片银杏叶：柄在 (x, y)，朝 ang 方向（0 朝上）展开，半径 r。lum 是亮度（灰阶，留给材质染色） */
function ginkgoLeaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, r: number, R: Rand, lum: number, warm: number, stem = 0.55) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const half = R.r(0.95, 1.2), notch = R.r(0.12, 0.34), nw = R.r(0.05, 0.12);
  const L = (k: number) => rgb(255 * lum * k, 255 * lum * k * (1 - warm * 0.06), 255 * lum * k * (1 - warm * 0.2));
  // 柄
  g.strokeStyle = L(0.74); g.lineWidth = Math.max(1, r * 0.045); g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r * stem); g.stroke();
  g.translate(0, -r * stem);
  const P = (a: number, k: number): [number, number] => [Math.sin(a) * r * k, -Math.cos(a) * r * k];
  g.beginPath(); g.moveTo(0, 0);
  const [lx, ly] = P(-half, 0.96);
  g.quadraticCurveTo(lx * 0.42, ly * 0.2, lx, ly);
  const n = 12;
  for (let i = 1; i <= n; i++) {
    const a = -half + (2 * half * i) / n, mid = Math.abs(a) < nw;
    const k = mid ? 1 - notch : 1 + 0.035 * Math.sin(i * 2.6 + r) - 0.05 * Math.abs(a / half) ** 3;
    const [px, py] = P(a, k);
    const [qx, qy] = P(a - half / n, (mid ? 1 - notch * 0.4 : 1.045) * (1 - 0.03 * Math.abs(a / half)));
    g.quadraticCurveTo(qx, qy, px, py);
  }
  g.quadraticCurveTo(-lx * 0.42, ly * 0.2, 0, 0);
  g.closePath();
  const gr = g.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.05);
  gr.addColorStop(0, L(0.8)); gr.addColorStop(0.55, L(0.95)); gr.addColorStop(1, L(1.0));
  g.fillStyle = gr; g.fill();
  g.strokeStyle = L(0.7); g.lineWidth = Math.max(0.6, r * 0.014); g.stroke();
  // 扇骨一样的细脉
  g.lineWidth = Math.max(0.5, r * 0.011); g.strokeStyle = rgb(120 * lum, 112 * lum, 80 * lum, 0.5);
  for (let i = 1; i < 11; i++) {
    const a = -half * 0.94 + (2 * half * 0.94 * i) / 11;
    if (Math.abs(a) < nw * 0.6) continue;
    const [px, py] = P(a, 0.9);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(px, py); g.stroke();
  }
  g.restore();
}
/** 一小枝银杏：主枝带一根侧枝，短枝上一簇簇扇叶 */
export const ginkgoSpray: Painter = (g, S, R) => {
  g.strokeStyle = rgb(44, 34, 26); g.lineCap = 'round'; g.lineJoin = 'round';
  const nodes: Array<[number, number, number]> = [];
  const twig = (x: number, y: number, a: number, len: number, n: number, w: number) => {
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < n; i++) { a += R.pm(0.22); x += Math.sin(a) * len / n; y -= Math.cos(a) * len / n; g.lineTo(x, y); nodes.push([x, y, a]); }
    g.stroke();
  };
  twig(S * 0.5, S, R.pm(0.08), S * 0.62, 5, S * 0.016);
  const br = nodes[1], side = R() < 0.5 ? -1 : 1;
  twig(br[0], br[1], br[2] + side * R.r(0.6, 0.9), S * 0.36, 3, S * 0.011);
  twig(nodes[0][0], nodes[0][1], nodes[0][2] - side * R.r(0.7, 1.0), S * 0.26, 2, S * 0.01);
  const leaves: Array<[number, number, number, number, number]> = [];
  for (const [x, y, a] of nodes) {
    const n = 4 + R.i(3);
    for (let k = 0; k < n; k++) leaves.push([x + R.pm(S * 0.012), y + R.pm(S * 0.012), a + (k - (n - 1) / 2) * R.r(0.55, 0.85) + R.pm(0.2), S * R.r(0.1, 0.145), R()]);
  }
  leaves.sort((p, q) => p[4] - q[4]);
  for (const [x, y, a, r, t] of leaves) ginkgoLeaf(g, x, y, a, r, R, 0.72 + 0.28 * t, R.r(0, 1), R.r(0.45, 0.9));
};
/** 冬天的细枝：一小片光枝的网 */
export const twigSpray: Painter = (g, S, R) => {
  g.lineCap = 'round';
  const grow = (x: number, y: number, a: number, len: number, w: number, d: number) => {
    const x1 = x + Math.sin(a) * len, y1 = y - Math.cos(a) * len;
    g.strokeStyle = rgb(118, 104, 92); g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x1) / 2 + R.pm(len * 0.12), (y + y1) / 2, x1, y1); g.stroke();
    if (d <= 0) return;
    const n = d > 1 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const t = R.r(0.35, 1);
      grow(x + (x1 - x) * t, y + (y1 - y) * t, a + (i % 2 ? 1 : -1) * R.r(0.3, 0.75), len * R.r(0.5, 0.72), Math.max(S / 256 * 1.4, w * 0.62), d - 1);
    }
    // 短枝上的小疙瘩（银杏的短枝）
    for (let i = 0; i < 3; i++) { const t = R(); g.fillStyle = rgb(104, 92, 80); g.fillRect(x + (x1 - x) * t - w * 0.8, y + (y1 - y) * t - w * 0.8, w * 1.6, w * 1.6); }
  };
  grow(S * 0.5, S * 1.0, R.pm(0.12), S * 0.44, S * 0.016, 3);
};

// —— 枫 ——
function mapleLeaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, r: number, R: Rand, lum: number, warm: number) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const L = (k: number) => rgb(255 * lum * k, 255 * lum * k * (1 - warm * 0.1), 255 * lum * k * (1 - warm * 0.22));
  g.strokeStyle = L(0.7); g.lineWidth = Math.max(0.8, r * 0.035); g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, r * 0.5); g.lineTo(0, 0); g.stroke();
  const lobes = [[0, 1], [0.62, 0.9], [-0.62, 0.9], [1.25, 0.7], [-1.25, 0.7], [1.95, 0.42], [-1.95, 0.42]];
  g.fillStyle = L(0.94);
  for (const [a, k] of lobes) {
    const len = r * k * R.r(0.92, 1.05), w = len * 0.2, ca = Math.sin(a), sa = -Math.cos(a);
    const px = -sa, py = ca;
    g.beginPath(); g.moveTo(0, 0);
    // 一裂：两边带一两个小锯齿，尖头
    g.quadraticCurveTo(ca * len * 0.3 + px * w * 1.15, sa * len * 0.3 + py * w * 1.15, ca * len * 0.56 + px * w * 0.8, sa * len * 0.56 + py * w * 0.8);
    g.lineTo(ca * len * 0.62 + px * w * 1.0, sa * len * 0.62 + py * w * 1.0);
    g.lineTo(ca * len, sa * len);
    g.lineTo(ca * len * 0.62 - px * w * 1.0, sa * len * 0.62 - py * w * 1.0);
    g.lineTo(ca * len * 0.56 - px * w * 0.8, sa * len * 0.56 - py * w * 0.8);
    g.quadraticCurveTo(ca * len * 0.3 - px * w * 1.15, sa * len * 0.3 - py * w * 1.15, 0, 0);
    g.fill();
  }
  g.strokeStyle = rgb(110 * lum, 96 * lum, 80 * lum, 0.55); g.lineWidth = Math.max(0.5, r * 0.016);
  for (const [a, k] of lobes) { g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(a) * r * k * 0.86, -Math.cos(a) * r * k * 0.86); g.stroke(); }
  g.restore();
}
/** 一小枝枫叶：从上往下看，叶都摊平了朝着光 */
export const mapleSpray: Painter = (g, S, R) => {
  g.strokeStyle = rgb(58, 40, 34); g.lineCap = 'round';
  const tw: Array<[number, number, number, number]> = [];
  const grow = (x: number, y: number, a: number, len: number, w: number, d: number) => {
    const x1 = x + Math.sin(a) * len, y1 = y - Math.cos(a) * len;
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.stroke();
    tw.push([x1, y1, a, d]);
    if (d > 0) { grow(x1, y1, a + R.r(0.25, 0.6), len * 0.78, w * 0.7, d - 1); grow(x1, y1, a - R.r(0.25, 0.6), len * 0.78, w * 0.7, d - 1); }
  };
  grow(S * 0.5, S, 0, S * 0.3, S * 0.016, 2);
  const leaves: Array<[number, number, number, number, number]> = [];
  for (const [x, y, a] of tw) for (let k = 0; k < 2; k++) leaves.push([x + R.pm(S * 0.05), y + R.pm(S * 0.05), a + R.pm(1.0), S * R.r(0.13, 0.19), R()]);
  for (let k = 0; k < 4; k++) leaves.push([S * R.r(0.2, 0.8), S * R.r(0.15, 0.6), R.pm(1.4), S * R.r(0.12, 0.17), R()]);
  leaves.sort((p, q) => p[4] - q[4]);
  for (const [x, y, a, r, t] of leaves) mapleLeaf(g, x, y, a, r, R, 0.72 + 0.28 * t, R());
};

// —— 竹 ——
function bambooLeaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, R: Rand, t: number) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const w = len * R.r(0.075, 0.105);
  const c = t < 0.5 ? mix([42, 78, 36], [70, 112, 48], t * 2) : mix([70, 112, 48], [124, 150, 72], (t - 0.5) * 2);
  const gr = g.createLinearGradient(0, 0, 0, -len);
  gr.addColorStop(0, rgb(c[0] * 0.8, c[1] * 0.82, c[2] * 0.8)); gr.addColorStop(0.5, rgb(c[0], c[1], c[2])); gr.addColorStop(1, rgb(c[0] * 1.12, c[1] * 1.08, c[2] * 0.95));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0, 0);
  g.bezierCurveTo(w * 1.5, -len * 0.14, w * 1.25, -len * 0.62, 0, -len);
  g.bezierCurveTo(-w * 1.25, -len * 0.62, -w * 1.5, -len * 0.14, 0, 0);
  g.fill();
  g.strokeStyle = rgb(c[0] * 1.3 + 18, c[1] * 1.18 + 16, c[2] * 1.1 + 8, 0.6); g.lineWidth = Math.max(0.6, w * 0.13);
  g.beginPath(); g.moveTo(0, -len * 0.04); g.lineTo(0, -len * 0.94); g.stroke();
  g.restore();
}
/** 一梢竹叶：三五片成「个」「介」字 */
export const bambooSpray: Painter = (g, S, R) => {
  g.strokeStyle = rgb(88, 110, 54); g.lineCap = 'round'; g.lineWidth = S * 0.012;
  const nodes: Array<[number, number, number]> = [];
  let x = S * 0.5, y = S, a = R.pm(0.1);
  for (let i = 0; i < 4; i++) {
    const len = S * R.r(0.16, 0.22), x1 = x + Math.sin(a) * len, y1 = y - Math.cos(a) * len;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.stroke();
    x = x1; y = y1; nodes.push([x, y, a]); a += R.pm(0.3);
  }
  const leaves: Array<[number, number, number, number, number]> = [];
  nodes.forEach(([nx, ny, na], i) => {
    const last = i === nodes.length - 1, n = last ? 4 : R.i(2) + 2;
    for (let k = 0; k < n; k++) {
      const side = last ? (k - (n - 1) / 2) * 0.62 : (i % 2 ? 1 : -1) * R.r(0.55, 1.15) + (k - (n - 1) / 2) * 0.5;
      leaves.push([nx, ny, na + side + R.pm(0.12), S * R.r(0.3, 0.42), R()]);
    }
  });
  leaves.sort((p, q) => p[4] - q[4]);
  for (const [lx, ly, la, ll, t] of leaves) bambooLeaf(g, lx, ly, la, ll, R, t);
};

// —— 梅 ——
function blossom(g: CanvasRenderingContext2D, x: number, y: number, r: number, R: Rand, pink: number, side = false) {
  g.save(); g.translate(x, y); g.rotate(R.r(0, Math.PI * 2));
  const base = mix([255, 252, 248], [246, 196, 204], pink), deep = mix([244, 226, 226], [222, 132, 150], pink);
  // 萼
  g.fillStyle = rgb(108, 44, 44);
  g.beginPath(); g.arc(0, 0, r * 0.34, 0, Math.PI * 2); g.fill();
  const n = side ? 3 : 5;
  for (let i = 0; i < n; i++) {
    const a = side ? -0.9 + i * 0.9 : (i / 5) * Math.PI * 2;
    const px = Math.sin(a) * r * 0.56, py = -Math.cos(a) * r * 0.56;
    const gr = g.createRadialGradient(px * 0.3, py * 0.3, 0, px, py, r * 0.52);
    gr.addColorStop(0, rgb(deep[0], deep[1], deep[2])); gr.addColorStop(0.7, rgb(base[0], base[1], base[2])); gr.addColorStop(1, rgb(base[0], base[1], base[2]));
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(px, py, r * 0.47, r * 0.44, a, 0, Math.PI * 2); g.fill();
  }
  if (!side) {
    g.strokeStyle = rgb(236, 214, 150, 0.9); g.lineWidth = Math.max(0.6, r * 0.035);
    for (let i = 0; i < 16; i++) {
      const a = R.r(0, Math.PI * 2), l = r * R.r(0.25, 0.5);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(a) * l, -Math.cos(a) * l); g.stroke();
      g.fillStyle = rgb(224, 178, 60); g.beginPath(); g.arc(Math.sin(a) * l, -Math.cos(a) * l, Math.max(0.7, r * 0.045), 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = rgb(198, 190, 110); g.beginPath(); g.arc(0, 0, r * 0.09, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
function plumTwig(g: CanvasRenderingContext2D, S: number, R: Rand): Array<[number, number]> {
  g.strokeStyle = rgb(38, 30, 30); g.lineCap = 'round'; g.lineJoin = 'miter';
  const pts: Array<[number, number]> = [[S * 0.5, S]];
  let a = R.pm(0.2), x = S * 0.5, y = S;
  for (let i = 0; i < 5; i++) {
    const len = S * R.r(0.14, 0.22);
    x += Math.sin(a) * len; y -= Math.cos(a) * len; pts.push([x, y]);
    a += (i % 2 ? 1 : -1) * R.r(0.25, 0.7);
  }
  g.lineWidth = S * 0.022;
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.stroke();
  // 一根旁出的小枝
  const b = pts[2], ba = R.pick([-1, 1]) * R.r(0.7, 1.1), bl = S * R.r(0.2, 0.3);
  g.lineWidth = S * 0.013;
  g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] + Math.sin(ba) * bl, b[1] - Math.cos(ba) * bl); g.stroke();
  pts.push([b[0] + Math.sin(ba) * bl * 0.55, b[1] - Math.cos(ba) * bl * 0.55], [b[0] + Math.sin(ba) * bl, b[1] - Math.cos(ba) * bl]);
  return pts;
}
/** 一枝梅：瘦枝上疏疏几朵，带蕾 */
export const plumSpray: Painter = (g, S, R) => {
  const pts = plumTwig(g, S, R);
  for (const [x, y] of pts.slice(1)) {
    const n = R.i(2) + 1;
    for (let k = 0; k < n; k++) {
      const bx = x + R.pm(S * 0.07), by = y + R.pm(S * 0.07);
      if (R() < 0.3) { // 蕾
        g.fillStyle = rgb(108, 44, 44); g.beginPath(); g.arc(bx, by + S * 0.012, S * 0.03, 0, Math.PI * 2); g.fill();
        g.fillStyle = rgb(248, 226, 228); g.beginPath(); g.arc(bx, by - S * 0.006, S * 0.028, 0, Math.PI * 2); g.fill();
      } else blossom(g, bx, by, S * R.r(0.075, 0.105), R, R() < 0.5 ? R.r(0, 0.25) : R.r(0.2, 0.7), R() < 0.25);
    }
  }
};
function ovateLeaf(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, R: Rand, c: number[]) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const w = len * R.r(0.26, 0.32);
  const gr = g.createLinearGradient(-w, 0, w, 0);
  gr.addColorStop(0, rgb(c[0] * 0.86, c[1] * 0.88, c[2] * 0.86)); gr.addColorStop(0.5, rgb(c[0], c[1], c[2])); gr.addColorStop(1, rgb(c[0] * 1.08, c[1] * 1.06, c[2]));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0, 0);
  g.bezierCurveTo(w * 1.5, -len * 0.2, w * 1.1, -len * 0.7, 0, -len);
  g.bezierCurveTo(-w * 1.1, -len * 0.7, -w * 1.5, -len * 0.2, 0, 0);
  g.fill();
  g.strokeStyle = rgb(c[0] * 0.7, c[1] * 0.74, c[2] * 0.7, 0.7); g.lineWidth = Math.max(0.5, w * 0.07);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.95); g.stroke();
  for (let i = 1; i < 5; i++) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, -len * i * 0.17); g.lineTo(s * w * 0.8, -len * (i * 0.17 + 0.14)); g.stroke(); }
  g.restore();
}
/** 梅的叶（花后才长） */
export const plumLeaves: Painter = (g, S, R) => {
  const pts = plumTwig(g, S, R);
  const leaves: Array<[number, number, number, number, number]> = [];
  for (const [x, y] of pts.slice(1)) for (let k = 0; k < 3; k++) leaves.push([x, y, R.pm(1.5), S * R.r(0.16, 0.24), R()]);
  leaves.sort((p, q) => p[4] - q[4]);
  for (const [x, y, a, l, t] of leaves) ovateLeaf(g, x, y, a, l, R, mix([46, 84, 40], [96, 132, 58], t));
};

// —— 草、蕨、麦冬 ——
export const grassTuft: Painter = (g, S, R) => {
  g.lineCap = 'round';
  const blades: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 46; i++) blades.push([R.pm(0.9), R.r(0.4, 0.94), R(), R.pm(0.5)]);
  blades.sort((p, q) => p[2] - q[2]);
  for (const [a, len, t, bend] of blades) {
    const c = mix([40, 70, 30], [128, 150, 66], t);
    const x0 = S * (0.5 + R.pm(0.07)), y0 = S;
    const x1 = x0 + Math.sin(a) * len * S * 0.8, y1 = y0 - Math.cos(a * 0.7) * len * S;
    const mx = (x0 + x1) / 2 + bend * S * 0.1, my = (y0 + y1) / 2 - S * 0.08;
    // 叶片由粗到细：分两段画
    g.strokeStyle = rgb(c[0], c[1], c[2]);
    g.lineWidth = S * 0.02; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + mx) / 2, (y0 + my) / 2, mx, my); g.stroke();
    g.lineWidth = S * 0.011; g.beginPath(); g.moveTo(mx, my); g.quadraticCurveTo((mx + x1) / 2 + bend * S * 0.03, (my + y1) / 2, x1, y1); g.stroke();
  }
};
export const fernFrond: Painter = (g, S, R) => {
  g.lineCap = 'round';
  const n = 17;
  g.strokeStyle = rgb(60, 84, 38); g.lineWidth = S * 0.014;
  g.beginPath(); g.moveTo(S * 0.5, S); g.lineTo(S * 0.5, S * 0.05); g.stroke();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y = S * (0.9 - 0.84 * t), len = S * 0.36 * Math.sin(Math.PI * (0.16 + 0.84 * (1 - t))) * (0.9 + R.pm(0.08));
    for (const s of [-1, 1]) {
      const c = mix([52, 96, 40], [112, 150, 62], R());
      g.fillStyle = rgb(c[0], c[1], c[2]);
      g.save(); g.translate(S * 0.5, y); g.rotate(s * (1.25 - 0.3 * t));
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(S * 0.03, -len * 0.3, S * 0.022, -len * 0.8, 0, -len); g.bezierCurveTo(-S * 0.022, -len * 0.8, -S * 0.03, -len * 0.3, 0, 0); g.fill();
      g.restore();
    }
  }
};
export const strapTuft: Painter = (g, S, R) => {
  g.lineCap = 'round';
  const blades: Array<[number, number, number]> = [];
  for (let i = 0; i < 34; i++) blades.push([R.pm(1.15), R.r(0.55, 0.98), R()]);
  blades.sort((p, q) => p[2] - q[2]);
  for (const [a, len, t] of blades) {
    const c = mix([24, 52, 30], [74, 112, 56], t);
    const x0 = S * (0.5 + R.pm(0.05)), y0 = S;
    const rise = len * S * (0.86 - 0.3 * Math.abs(a));
    const x1 = x0 + Math.sin(a) * len * S * 0.62, y1 = y0 - rise * 0.55;
    const mx = x0 + Math.sin(a) * len * S * 0.3, my = y0 - rise;
    g.strokeStyle = rgb(c[0], c[1], c[2]);
    g.lineWidth = S * 0.026; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + Math.sin(a) * S * 0.04, y0 - rise * 0.7, mx, my); g.stroke();
    g.lineWidth = S * 0.017; g.beginPath(); g.moveTo(mx, my); g.quadraticCurveTo((mx + x1) / 2 + Math.sin(a) * S * 0.06, my - S * 0.01, x1, y1); g.stroke();
  }
};

// —— 荷 ——
/** 荷叶（俯看的一整张圆叶）：中心一点脐，脉从脐散到边 */
export function lotusLeafTex(S: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = rgb(196, 204, 182); g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, rgb(226, 232, 196)); gr.addColorStop(0.06, rgb(196, 210, 168)); gr.addColorStop(0.16, rgb(166, 188, 150));
  gr.addColorStop(0.6, rgb(178, 196, 164)); gr.addColorStop(0.9, rgb(200, 212, 186)); gr.addColorStop(1, rgb(214, 222, 198));
  g.fillStyle = gr; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
  g.lineCap = 'round';
  const n = 21;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.07 * Math.sin(i * 3.1);
    const line = (a0: number, r0: number, a1: number, r1: number, w: number) => {
      g.strokeStyle = rgb(232, 238, 214, 0.78); g.lineWidth = w;
      g.beginPath(); g.moveTo(S / 2 + Math.cos(a0) * r0 * S / 2, S / 2 + Math.sin(a0) * r0 * S / 2); g.lineTo(S / 2 + Math.cos(a1) * r1 * S / 2, S / 2 + Math.sin(a1) * r1 * S / 2); g.stroke();
    };
    line(a, 0.03, a, 0.62, S * 0.007);
    line(a, 0.62, a - 0.07, 0.98, S * 0.005); line(a, 0.62, a + 0.07, 0.98, S * 0.005);
    line(a - 0.07, 0.85, a - 0.11, 0.99, S * 0.003); line(a + 0.07, 0.85, a + 0.11, 0.99, S * 0.003);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
/** 荷花瓣：瓣根白、瓣尖粉，细细的纵纹 */
export const lotusPetal: Painter = (g, S, R) => {
  const gr = g.createLinearGradient(0, S, 0, 0);
  gr.addColorStop(0, rgb(250, 248, 236)); gr.addColorStop(0.45, rgb(250, 232, 232)); gr.addColorStop(1, rgb(238, 170, 190));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(S * 0.5, S * 0.99);
  g.bezierCurveTo(S * 0.98, S * 0.74, S * 0.9, S * 0.26, S * 0.5, S * 0.01);
  g.bezierCurveTo(S * 0.1, S * 0.26, S * 0.02, S * 0.74, S * 0.5, S * 0.99);
  g.fill();
  g.save(); g.clip();
  for (let i = 0; i < 22; i++) {
    const u = R.r(0.1, 0.9);
    g.strokeStyle = rgb(228, 150, 174, 0.3); g.lineWidth = S * 0.007;
    g.beginPath(); g.moveTo(S * (0.5 + (u - 0.5) * 0.3), S * 0.98); g.quadraticCurveTo(S * u, S * 0.5, S * (0.5 + (u - 0.5) * 0.25), S * 0.03); g.stroke();
  }
  g.restore();
};
/** 莲蓬的顶面 */
export function lotusPodTex(S: number, R: Rand): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = rgb(150, 150, 96); g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, rgb(176, 178, 112)); gr.addColorStop(1, rgb(124, 130, 78));
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const holes: Array<[number, number]> = [[0, 0]];
  for (let i = 0; i < 6; i++) holes.push([Math.cos(i * 1.047) * 0.34, Math.sin(i * 1.047) * 0.34]);
  for (let i = 0; i < 11; i++) holes.push([Math.cos(i * 0.571 + 0.2) * 0.68, Math.sin(i * 0.571 + 0.2) * 0.68]);
  for (const [x, y] of holes) {
    g.fillStyle = rgb(52, 50, 30); g.beginPath(); g.arc(S / 2 + x * S / 2 + R.pm(S * 0.01), S / 2 + y * S / 2, S * 0.075, 0, Math.PI * 2); g.fill();
    g.fillStyle = rgb(96, 104, 62); g.beginPath(); g.arc(S / 2 + x * S / 2, S / 2 + y * S / 2, S * 0.042, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// —— 单片的叶（落叶、落花的粒子用） ——
function single(S: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = S;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
export function singleLeaves(R: Rand): Record<'ginkgo' | 'maple' | 'petal' | 'needle', THREE.Texture> {
  const S = 64;
  return {
    ginkgo: single(S, (g) => {
      ginkgoLeaf(g, S * 0.5, S * 0.98, 0, S * 0.56, R, 1, 0.3, 0.42);
      g.globalCompositeOperation = 'source-atop';
      const gr = g.createLinearGradient(0, S, 0, 0); gr.addColorStop(0, rgb(196, 168, 40, 0.92)); gr.addColorStop(0.6, rgb(236, 190, 30, 0.92)); gr.addColorStop(1, rgb(246, 208, 60, 0.92));
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }),
    maple: single(S, (g) => {
      mapleLeaf(g, S * 0.5, S * 0.6, 0, S * 0.5, R, 1, 0.5);
      g.globalCompositeOperation = 'source-atop';
      const gr = g.createLinearGradient(0, S, S, 0); gr.addColorStop(0, rgb(170, 38, 26, 0.94)); gr.addColorStop(1, rgb(214, 86, 30, 0.94));
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
    }),
    petal: single(S, (g) => {
      const gr = g.createRadialGradient(S * 0.5, S * 0.8, 0, S * 0.5, S * 0.5, S * 0.5);
      gr.addColorStop(0, rgb(240, 196, 206)); gr.addColorStop(1, rgb(253, 246, 244));
      g.fillStyle = gr; g.beginPath(); g.ellipse(S * 0.5, S * 0.5, S * 0.36, S * 0.42, 0, 0, Math.PI * 2); g.fill();
    }),
    needle: single(S, (g) => {
      g.lineCap = 'round'; g.lineWidth = S * 0.035;
      g.strokeStyle = rgb(140, 112, 60); g.beginPath(); g.moveTo(S * 0.5, S * 0.95); g.lineTo(S * 0.28, S * 0.06); g.stroke();
      g.strokeStyle = rgb(124, 104, 52); g.beginPath(); g.moveTo(S * 0.5, S * 0.95); g.lineTo(S * 0.7, S * 0.08); g.stroke();
    }),
  };
}

// —— 树皮 ——
const P = (u: number, v: number, fu: number, fv: number, oct: number, seed: number) => fbm(u * fu, v * fv, oct, seed, fu, fv);
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** 银杏的皮：灰褐，一道道竖的木栓脊，脊与脊之间是深裂，脊时分时合 */
export function ginkgoBark(): TexSet {
  return bake(256, (u, v, o) => {
    const wob = P(u, v, 3, 2, 3, 301), wob2 = P(u, v, 9, 5, 2, 306);
    const x = u * 9 + (wob - 0.5) * 2.4 + (wob2 - 0.5) * 0.5;
    const cell = Math.abs((((x % 1) + 1) % 1) - 0.5) * 2;                // 0 在脊心，1 在裂缝
    const wide = 0.55 + 0.3 * P(u, v, 5, 3, 2, 302);                      // 裂缝宽窄不一
    const fissure = sm(wide, wide + 0.3, cell);
    const cross = sm(0.955, 0.998, 1 - Math.abs(P(u, v, 3, 20, 2, 303) * 2 - 1)) * (1 - fissure) * 0.28;   // 脊上偶尔的横裂
    const m = P(u, v, 40, 12, 2, 304), k = 0.86 + 0.34 * (m - 0.5) + 0.18 * (P(u, v, 4, 3, 2, 305) - 0.5);
    const top = 1 - 0.25 * cell;                                           // 脊心亮一点
    o[0] = 0.5 * k * top; o[1] = 0.46 * k * top; o[2] = 0.4 * k * top;
    const c = Math.min(1, fissure * 0.9 + cross);
    o[0] += (0.1 - o[0]) * c; o[1] += (0.082 - o[1]) * c; o[2] += (0.07 - o[2]) * c;
    o[3] = 0.7 + 0.12 * (m - 0.5) - 0.3 * cell - 0.5 * c;
    o[4] = 0.95;
  }, 3.0);
}
/** 竹竿：一格是一节，节上一道白粉环、环下一线深 */
export function bambooCulmTex(R: Rand): THREE.CanvasTexture {
  const W = 32, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, H, 0, 0);
  // v 朝上：画布底是节（v=0），往上是节间
  gr.addColorStop(0, rgb(58, 74, 40)); gr.addColorStop(0.018, rgb(52, 66, 36)); gr.addColorStop(0.03, rgb(196, 204, 170)); gr.addColorStop(0.05, rgb(168, 184, 132));
  gr.addColorStop(0.075, rgb(98, 132, 62)); gr.addColorStop(0.5, rgb(92, 128, 58)); gr.addColorStop(0.86, rgb(98, 132, 62)); gr.addColorStop(0.95, rgb(150, 170, 122)); gr.addColorStop(1, rgb(176, 188, 150));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) { g.fillStyle = rgb(R.r(60, 130), R.r(100, 160), R.r(40, 80), 0.1); g.fillRect(R.i(W), 0, 1, H); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
