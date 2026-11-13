/**
 * 笔触：点叶、点花用的小图，都是开场时在画布上现画的（没有图片素材）。
 * 一张图集分成若干格，每格是一笔（或一小簇）。三个通道各管一件事：
 *   红 —— 这一处着色多浓（0 淡 … 1 浓）；绿 —— 点缀色占几成（花蕊、嫩芽）；透明度 —— 形状。
 * 画的时候用 ink(浓, 点缀, 透明) 取颜色。坐标都按「一格是 1×1」给，原点在格子左上角，y 朝下。
 */
import * as THREE from 'three';
import { mulberry32, type Rng } from '../core/rng';

export type Ctx = CanvasRenderingContext2D;
export type Tile = (g: Ctx, r: Rng) => void;
export interface Atlas { map: THREE.CanvasTexture; cols: number; rows: number; count: number }

export const ink = (dens: number, accent = 0, alpha = 1) => `rgba(${Math.round(Math.max(0, Math.min(1, dens)) * 255)},${Math.round(Math.max(0, Math.min(1, accent)) * 255)},0,${alpha})`;

/** 把若干格画成一张图集。px 是每格的边长（像素） */
export function atlas(tiles: Tile[], cols: number, px = 192, seed = 7): Atlas {
  const rows = Math.ceil(tiles.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * px; c.height = rows * px;
  const g = c.getContext('2d')!;
  tiles.forEach((t, i) => {
    g.save();
    g.beginPath(); g.rect((i % cols) * px, Math.floor(i / cols) * px, px, px); g.clip();
    g.translate((i % cols) * px, Math.floor(i / cols) * px); g.scale(px, px);
    t(g, mulberry32(seed * 131 + i * 17 + 3));
    g.restore();
  });
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.NoColorSpace;
  map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter;
  map.anisotropy = 4;
  return { map, cols, rows, count: tiles.length };
}

/** 一笔：沿着几个点走，笔的宽度随行程变（w(t)，t 从 0 到 1）。一次填成一个形，边是利落的 */
export function stroke(g: Ctx, pts: Array<[number, number]>, w: (t: number) => number, fill: string) {
  // 先把折线加密成顺滑的曲线
  const P: Array<[number, number]> = [];
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < 8; k++) {
      const t = k / 8, t2 = t * t, t3 = t2 * t;
      P.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  P.push(pts[n - 1]);
  const L: Array<[number, number]> = [], R: Array<[number, number]> = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const h = Math.max(0, w(i / (P.length - 1))) / 2;
    L.push([P[i][0] + nx * h, P[i][1] + ny * h]); R.push([P[i][0] - nx * h, P[i][1] - ny * h]);
  }
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (const p of L) g.lineTo(p[0], p[1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
  g.fillStyle = fill; g.fill();
}

/** 一团不规则的墨点（边上有几处凸出去，像蘸饱了墨点下去） */
export function blob(g: Ctx, r: Rng, x: number, y: number, rad: number, fill: string, lumps = 5, squash = 1) {
  g.fillStyle = fill;
  g.beginPath(); g.ellipse(x, y, rad, rad * squash, r() * 3.14, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < lumps; i++) {
    const a = r() * Math.PI * 2, d = rad * (0.45 + 0.5 * r()), q = rad * (0.35 + 0.4 * r());
    g.beginPath(); g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * squash, q, q * squash, 0, 0, Math.PI * 2); g.fill();
  }
}
/** 一片柳叶形的叶（两头尖）：从 (x,y) 朝 ang 伸出去 len 长 */
export function leaf(g: Ctx, x: number, y: number, ang: number, len: number, wid: number, fill: string, bend = 0) {
  const c = Math.cos(ang), s = Math.sin(ang), nx = -s, ny = c;
  const mx = x + c * len * 0.5 + nx * bend * len, my = y + s * len * 0.5 + ny * bend * len;
  stroke(g, [[x, y], [mx, my], [x + c * len, y + s * len]], (t) => wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.75), fill);
}
/** 五瓣的花：花心深、瓣尖淡，中间几点蕊 */
export function flower5(g: Ctx, r: Rng, x: number, y: number, rad: number, dens = 0.6, petals = 5) {
  const a0 = r() * 6.28;
  for (let i = 0; i < petals; i++) {
    const a = a0 + (i / petals) * Math.PI * 2 + (r() - 0.5) * 0.25, px = x + Math.cos(a) * rad * 0.52, py = y + Math.sin(a) * rad * 0.52;
    const gr = g.createRadialGradient(x, y, rad * 0.05, px, py, rad * 0.62);
    gr.addColorStop(0, ink(dens * 1.5)); gr.addColorStop(1, ink(dens * (0.45 + 0.25 * r())));
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(px, py, rad * (0.46 + 0.08 * r()), rad * (0.36 + 0.08 * r()), a, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 5; i++) { const a = r() * 6.28, d = rad * 0.2 * r(); g.fillStyle = ink(1, 1); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rad * 0.055, 0, 6.3); g.fill(); }
}

// —— 现成的几格（各种树自己再配） ——
export const TILES = {
  /** 一团墨点：远树、苔点 */
  blob: ((g, r) => { blob(g, r, 0.5, 0.5, 0.3, ink(0.55 + 0.3 * r())); blob(g, r, 0.5 + (r() - 0.5) * 0.2, 0.5 + (r() - 0.5) * 0.2, 0.17, ink(0.95), 3); }) as Tile,
  /** 胡椒点：一簇小圆点 */
  dots: ((g, r) => { for (let i = 0; i < 16; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 0.36; blob(g, r, 0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d * 0.8, 0.045 + 0.045 * r(), ink(0.45 + 0.5 * r()), 2); } }) as Tile,
  /** 桃花：一小枝上三五朵，带几个苞 */
  blossom: ((g, r) => {
    for (let i = 0; i < 4; i++) { const a = r() * 6.28, d = 0.1 + 0.2 * r(); flower5(g, r, 0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, 0.13 + 0.05 * r(), 0.5 + 0.25 * r()); }
    for (let i = 0; i < 4; i++) { const a = r() * 6.28, d = 0.28 + 0.12 * r(); g.fillStyle = ink(0.95); g.beginPath(); g.ellipse(0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, 0.035, 0.05, a, 0, 6.3); g.fill(); }
  }) as Tile,
  /** 一朵开足的花 */
  bloom: ((g, r) => { flower5(g, r, 0.5, 0.5, 0.36, 0.55 + 0.2 * r()); }) as Tile,
  /** 个字 / 介字：一个梢上三四片尖叶 */
  spray: ((g, r) => {
    const n = 3 + Math.floor(r() * 3), a0 = Math.PI / 2 + (r() - 0.5) * 0.5;
    for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * (0.5 + 0.15 * r()); leaf(g, 0.5, 0.2, a, 0.5 + 0.2 * r(), 0.12 + 0.04 * r(), ink(0.5 + 0.45 * r()), (r() - 0.5) * 0.2); }
  }) as Tile,
  /** 松针：一把向上张开的扇 */
  pine: ((g, r) => {
    const n = 15;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.5 + (r() - 0.5) * 0.12, l = 0.36 + 0.08 * r(); stroke(g, [[0.5, 0.8], [0.5 + Math.cos(a) * l, 0.8 + Math.sin(a) * l]], (t) => 0.03 * (1 - t * 0.75), ink(0.6 + 0.4 * r())); }
  }) as Tile,
  /** 圆叶一簇（桑、梧、杂树） */
  round: ((g, r) => { for (let i = 0; i < 7; i++) { const a = r() * 6.28, d = 0.26 * Math.sqrt(r()); g.fillStyle = ink(0.4 + 0.55 * r()); g.beginPath(); g.ellipse(0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, 0.15 + 0.05 * r(), 0.11 + 0.04 * r(), r() * 3.14, 0, 6.3); g.fill(); } }) as Tile,
  /** 一丛草：几笔向上的弧 */
  grass: ((g, r) => { for (let i = 0; i < 7; i++) { const x = 0.5 + (r() - 0.5) * 0.25, lean = (r() - 0.5) * 0.7, h = 0.45 + 0.4 * r(); stroke(g, [[x, 0.97], [x + lean * 0.25, 0.97 - h * 0.6], [x + lean * 0.6, 0.97 - h]], (t) => 0.045 * (1 - t), ink(0.5 + 0.5 * r())); } }) as Tile,
  /** 一株松：斜出的干，三四层平展的松盖（远山、石峰顶上用） */
  pineTree: ((g, r) => {
    const lean = (r() - 0.5) * 0.3, top: [number, number] = [0.5 + lean, 0.2];
    stroke(g, [[0.5, 0.98], [0.5 + lean * 0.3, 0.7], [0.5 + lean * 0.8, 0.42], top], (t) => 0.05 * (1 - t * 0.6), ink(1));
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), y = 0.22 + t * 0.4 + (r() - 0.5) * 0.04, cx = 0.5 + lean * (1 - t * 0.8) + (i % 2 ? 1 : -1) * (0.06 + 0.1 * r()), w = 0.2 + 0.22 * t + 0.08 * r();
      stroke(g, [[cx - w, y + 0.035], [cx - w * 0.4, y - 0.02], [cx + w * 0.4, y - 0.025], [cx + w, y + 0.03]], (u) => 0.085 * Math.sin(Math.PI * Math.min(1, u * 1.05 + 0.02)) + 0.012, ink(0.6 + 0.35 * r()));
      for (let k = 0; k < 7; k++) blob(g, r, cx + (r() - 0.5) * 2 * w * 0.85, y - 0.025 + (r() - 0.5) * 0.03, 0.028 + 0.02 * r(), ink(0.75 + 0.25 * r()), 2, 0.6);
    }
  }) as Tile,
  /** 一株杂树：干、几团叶 */
  tree: ((g, r) => {
    stroke(g, [[0.5, 0.98], [0.5 + (r() - 0.5) * 0.08, 0.7], [0.5 + (r() - 0.5) * 0.12, 0.45]], (t) => 0.055 * (1 - t * 0.5), ink(1));
    for (let i = 0; i < 6; i++) blob(g, r, 0.5 + (r() - 0.5) * 0.5, 0.36 + (r() - 0.5) * 0.36, 0.13 + 0.07 * r(), ink(0.5 + 0.4 * r()), 4, 0.8);
  }) as Tile,
  /** 垂柳：几条垂下来的细枝，带着成对的小叶 */
  willow: ((g, r) => {
    for (let i = 0; i < 4; i++) {
      const x = 0.2 + 0.2 * i + (r() - 0.5) * 0.08, sw = (r() - 0.5) * 0.14;
      stroke(g, [[x, 0.02], [x + sw * 0.5, 0.5], [x + sw, 0.98]], () => 0.012, ink(0.9));
      for (let k = 0; k < 9; k++) { const t = 0.08 + 0.1 * k, px = x + sw * t, py = 0.02 + 0.96 * t; for (const s of [-1, 1]) leaf(g, px, py, Math.PI / 2 + s * (0.5 + 0.2 * r()), 0.11 + 0.04 * r(), 0.03, ink(0.45 + 0.4 * r())); }
    }
  }) as Tile,
};
