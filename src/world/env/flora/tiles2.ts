/**
 * 地上、田里、水边的笔（接 tiles.ts）：
 *   FIELD —— 草、苔点、芦苇、麦、谷、油菜、菜、豆、蒿、菊叶、瓜叶（淡彩，透在纸上）；
 *   PETAL —— 菜花、菊、莲、芦花、野花、葫芦（粉：夜里、远处留着颜色）。
 * 庄稼的笔是「一小段垄」：一格里一排，一笔挨一笔排下去就是一行。
 */
import { blob, ink, stroke, type Ctx, type Tile } from '../../ink/brush';
import type { Rng } from '../../core/rng';
import { W, bs, haze, sheet } from './tiles';

const TAU = Math.PI * 2;

// ———————————————————————————— 草、苔、芦苇 ————————————————————————————
/** 一茎草叶：从 (x,y) 朝上、偏 lean，梢头略弯 */
function blade(g: Ctx, r: Rng, x: number, y: number, h: number, lean: number, w: number, dens: number) {
  const k = (r() - 0.5) * 0.25;
  bs(g, [[x, y], [x + lean * h * 0.35, y - h * 0.55], [x + lean * h * (0.8 + k), y - h]], W.nail(w, 0.9), Math.min(1, dens * 1.15), dens * 0.7);
}
/** 一丛草：七八茎，朝四面披开 */
const cao: Tile = (g, r) => {
  const n = 7 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5; blade(g, r, 0.5 + u * 0.16 + (r() - 0.5) * 0.05, 0.96, 0.45 + 0.42 * r() * (1 - Math.abs(u)), u * 1.5 + (r() - 0.5) * 0.4, 0.05 + 0.015 * r(), 0.5 + 0.5 * r()); }
};
const caoShort: Tile = (g, r) => {
  for (let i = 0; i < 6; i++) { const u = i / 5 - 0.5; blade(g, r, 0.5 + u * 0.45 + (r() - 0.5) * 0.08, 0.92, 0.22 + 0.2 * r(), u * 1.2 + (r() - 0.5) * 0.6, 0.05, 0.5 + 0.5 * r()); }
};
/** 苔点：几笔横的小点 */
const tai: Tile = (g, r) => {
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) { const x = 0.2 + 0.6 * r(), y = 0.42 + 0.26 * r(); g.fillStyle = ink(0.6 + 0.4 * r()); g.beginPath(); g.ellipse(x, y, 0.05 + 0.04 * r(), 0.032 + 0.02 * r(), (r() - 0.5) * 0.5, 0, TAU); g.fill(); }
};
/** 三叶的小草：几簇 */
const sanye: Tile = (g, r) => {
  for (let i = 0; i < 5; i++) {
    const x = 0.22 + 0.56 * r(), y = 0.5 + 0.36 * r(), a0 = r() * TAU, s = 0.05 + 0.025 * r();
    g.fillStyle = ink(0.5 + 0.5 * r());
    for (let k = 0; k < 3; k++) { const a = a0 + (k / 3) * TAU; g.beginPath(); g.ellipse(x + Math.cos(a) * s, y + Math.sin(a) * s, s * 0.95, s * 0.7, a, 0, TAU); g.fill(); }
  }
};
/** 阔叶的草（车前一类）：五六片叶从根上摊开 */
const kuo: Tile = (g, r) => {
  const n = 5 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.6 + (r() - 0.5) * 0.2, len = 0.3 + 0.12 * r(), d = 0.5 + 0.5 * r(); bs(g, [[0.5, 0.9], [0.5 + Math.cos(a) * len * 0.5, 0.9 + Math.sin(a) * len * 0.5 - 0.02], [0.5 + Math.cos(a) * len, 0.9 + Math.sin(a) * len]], W.drop(0.13, 0.5), d, d * 0.75); }
};
/** 芦苇的一茎：直上去，叶从节上斜出、叶尖垂下来；kink 不为零则折了腰 */
function reedStem(g: Ctx, r: Rng, x: number, top: number, lean: number, dens: number, leaves: number, kink = 0) {
  const X = (t: number) => x + lean * t * t + (kink && t > 0.6 ? kink * (t - 0.6) : 0), Y = (t: number) => 0.98 - (0.98 - top) * t + (kink && t > 0.6 ? Math.abs(kink) * (t - 0.6) * 1.2 : 0);
  stroke(g, [[X(0), Y(0)], [X(0.5), Y(0.5)], [X(0.62), Y(0.62)], [X(1), Y(1)]], (t) => 0.024 * (1 - 0.5 * t), ink(Math.min(1, dens + 0.1)));
  for (let i = 0; i < leaves; i++) {
    const t = 0.25 + (0.68 * (i + r())) / leaves, s = (i + (lean > 0 ? 0 : 1)) % 2 ? 1 : -1, len = 0.22 + 0.14 * r(), px = X(t), py = Y(t);
    bs(g, [[px, py], [px + s * len * 0.6, py - len * 0.42], [px + s * len, py - len * (0.25 - 0.5 * r())]], W.leaf(0.042 + 0.012 * r(), 0.6), dens, dens * 0.7);
  }
}
const lu: Tile = (g, r) => { haze(g, 0.5, 0.55, 0.36, 0.44, 0.45, 0.24); const n = 4 + Math.floor(r() * 3); for (let i = 0; i < n; i++) reedStem(g, r, 0.3 + (0.4 * i) / (n - 1) + (r() - 0.5) * 0.06, 0.05 + 0.3 * r(), (i / (n - 1) - 0.5) * 0.4 + (r() - 0.5) * 0.2, 0.55 + 0.45 * r(), 3 + Math.floor(r() * 2)); };
const luDry: Tile = (g, r) => { const n = 4 + Math.floor(r() * 2); for (let i = 0; i < n; i++) reedStem(g, r, 0.28 + (0.44 * i) / (n - 1) + (r() - 0.5) * 0.06, 0.12 + 0.35 * r(), (i / (n - 1) - 0.5) * 0.5 + (r() - 0.5) * 0.3, 0.55 + 0.45 * r(), 1 + Math.floor(r() * 2), r() < 0.5 ? (r() - 0.5) * 1.2 : 0); };
const luShoot: Tile = (g, r) => { for (let i = 0; i < 7; i++) { const x = 0.18 + 0.64 * r(); blade(g, r, x, 0.97, 0.25 + 0.4 * r(), (r() - 0.5) * 0.3, 0.05, 0.55 + 0.45 * r()); } };

// ———————————————————————————— 庄稼 ————————————————————————————
/** 麦苗：一小段垄，密密的一排短叶 */
const maiYoung: Tile = (g, r) => { for (let i = 0; i < 15; i++) { const x = 0.05 + 0.9 * ((i + r()) / 15); blade(g, r, x, 0.96, 0.32 + 0.34 * r(), (r() - 0.5) * 0.7, 0.05, 0.5 + 0.5 * r()); } };
/** 熟麦：一排秆，顶上是穗（略垂） */
const maiRipe: Tile = (g, r) => {
  haze(g, 0.5, 0.5, 0.46, 0.42, 0.4, 0.26);
  for (let i = 0; i < 10; i++) {
    const x = 0.07 + 0.86 * ((i + r()) / 10), h = 0.56 + 0.2 * r(), lean = (r() - 0.5) * 0.3, tx = x + lean * h, ty = 0.97 - h, d = 0.5 + 0.5 * r();
    stroke(g, [[x, 0.97], [x + lean * h * 0.4, 0.97 - h * 0.5], [tx, ty]], () => 0.02, ink(d * 0.8));
    const a = -Math.PI / 2 + lean * 1.5 + (r() - 0.5) * 0.7;
    bs(g, [[tx, ty], [tx + Math.cos(a) * 0.09, ty + Math.sin(a) * 0.09], [tx + Math.cos(a) * 0.19, ty + Math.sin(a) * 0.17 + 0.02]], W.leaf(0.07, 0.6), Math.min(1, d * 1.2), d);
  }
};
/** 麦茬：短短的一排，倒着几根秸 */
const maiStub: Tile = (g, r) => {
  for (let i = 0; i < 12; i++) { const x = 0.06 + 0.88 * ((i + r()) / 12); blade(g, r, x, 0.95, 0.1 + 0.12 * r(), (r() - 0.5) * 0.5, 0.045, 0.5 + 0.5 * r()); }
  for (let i = 0; i < 2; i++) { const x = 0.15 + 0.6 * r(), l = 0.1 + 0.1 * r(), y = 0.88 + 0.05 * r(); stroke(g, [[x, y], [x + l, y - 0.06 + 0.12 * r()]], (t) => 0.026 * (1 - 0.5 * t), ink(0.5 + 0.3 * r())); }
};
/** 新出的苗：一排小小的「丫」 */
const maiSprout: Tile = (g, r) => {
  for (let i = 0; i < 7; i++) {
    if (r() < 0.2) continue;
    const x = 0.08 + 0.84 * ((i + 0.2 + 0.6 * r()) / 7), n = 2 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) blade(g, r, x + (r() - 0.5) * 0.03, 0.95, 0.12 + 0.17 * r(), (r() - 0.5) * 1.3, 0.04, 0.6 + 0.4 * r());
  }
};
/** 谷子（粟）：秆上垂着沉沉的穗 */
const guRipe: Tile = (g, r) => {
  haze(g, 0.5, 0.52, 0.44, 0.4, 0.4, 0.24);
  for (let i = 0; i < 7; i++) {
    const x = 0.1 + 0.8 * ((i + r()) / 7), h = 0.6 + 0.16 * r(), s = r() < 0.5 ? -1 : 1, d = 0.5 + 0.5 * r(), ty = 0.97 - h;
    stroke(g, [[x, 0.97], [x + s * 0.02, 0.97 - h * 0.6], [x + s * 0.05, ty]], () => 0.022, ink(d * 0.8));
    bs(g, [[x + s * 0.05, ty], [x + s * 0.13, ty - 0.03], [x + s * 0.2, ty + 0.07], [x + s * 0.21, ty + 0.2]], (t) => 0.03 + 0.055 * Math.sin(Math.PI * Math.min(1, t * 1.1)), d, Math.min(1, d * 1.25));
    for (const k of [0.3, 0.55]) bs(g, [[x + s * 0.02, 0.97 - h * k], [x - s * 0.12, 0.97 - h * k - 0.12], [x - s * 0.24, 0.97 - h * k - 0.04]], W.leaf(0.04, 0.6), d * 0.9, d * 0.6);
  }
};
/** 油菜：两三茎，下半截是叶（花另点在上头） */
const caiPlant: Tile = (g, r) => {
  for (let i = 0; i < 3; i++) {
    const x = 0.28 + 0.22 * i + (r() - 0.5) * 0.08, top = 0.2 + 0.2 * r(), d = 0.5 + 0.5 * r(), lean = (r() - 0.5) * 0.12;
    stroke(g, [[x, 0.97], [x + lean, (0.97 + top) / 2], [x + lean * 2, top]], (t) => 0.026 * (1 - 0.4 * t), ink(d));
    for (let k = 0; k < 4; k++) { const t = 0.1 + 0.16 * k + 0.05 * r(), s = k % 2 ? 1 : -1, y = 0.97 - (0.97 - top) * t, len = 0.2 - 0.03 * k + 0.05 * r(), a = -Math.PI / 2 + s * (0.95 + 0.3 * r()); bs(g, [[x + lean * t * 2, y], [x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + 0.02], [x + Math.cos(a) * len, y + Math.sin(a) * len + 0.05]], W.drop(0.09, 0.45), d, d * 0.7); }
  }
};
/** 结荚的油菜：茎上一排斜上的细荚 */
const caiPod: Tile = (g, r) => {
  haze(g, 0.5, 0.5, 0.38, 0.44, 0.4, 0.24);
  for (let i = 0; i < 3; i++) {
    const x = 0.28 + 0.22 * i + (r() - 0.5) * 0.08, top = 0.1 + 0.15 * r(), d = 0.5 + 0.5 * r(), lean = (r() - 0.5) * 0.14;
    stroke(g, [[x, 0.97], [x + lean, (0.97 + top) / 2], [x + lean * 2, top]], (t) => 0.024 * (1 - 0.4 * t), ink(d));
    for (let k = 0; k < 9; k++) { const t = 0.3 + 0.075 * k, s = k % 2 ? 1 : -1, y = 0.97 - (0.97 - top) * t, a = -Math.PI / 2 + s * (0.6 + 0.3 * r()), len = 0.12 + 0.05 * r(), px = x + lean * t * 2; stroke(g, [[px, y], [px + Math.cos(a) * len, y + Math.sin(a) * len]], (u) => 0.028 * (1 - 0.6 * u), ink(d * (0.7 + 0.3 * r()))); }
  }
};
/** 菜秧、越冬的油菜：贴地的一小盘叶 */
const caiSeed: Tile = (g, r) => {
  for (let k = 0; k < 2; k++) {
    const cx = 0.3 + 0.4 * k + (r() - 0.5) * 0.1, n = 5;
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * 2.7, len = 0.16 + 0.07 * r(), d = 0.5 + 0.5 * r(); bs(g, [[cx, 0.93], [cx + Math.cos(a) * len * 0.5, 0.93 + Math.sin(a) * len * 0.5], [cx + Math.cos(a) * len, 0.93 + Math.sin(a) * len]], W.drop(0.085, 0.5), d, d * 0.75); }
  }
};
/** 白菜：一棵，阔叶一层层包着 */
const baicai: Tile = (g, r) => {
  const n = 7;
  for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5, a = -Math.PI / 2 + u * 2.5 + (r() - 0.5) * 0.15, len = 0.42 - 0.14 * Math.abs(u) + 0.06 * r(), d = 0.4 + 0.5 * r(); bs(g, [[0.5 + u * 0.1, 0.92], [0.5 + Math.cos(a) * len * 0.55, 0.92 + Math.sin(a) * len * 0.5], [0.5 + Math.cos(a) * len, 0.92 + Math.sin(a) * len]], W.drop(0.24, 0.55), d, d * 0.8); }
  bs(g, [[0.5, 0.9], [0.5, 0.7], [0.5, 0.52]], W.drop(0.2, 0.5), 0.3, 0.25);
};
/** 青菜：五六片勺形的叶 */
const qingcai: Tile = (g, r) => {
  for (let k = 0; k < 2; k++) {
    const cx = 0.3 + 0.4 * k + (r() - 0.5) * 0.08;
    for (let i = 0; i < 5; i++) { const u = i / 4 - 0.5, a = -Math.PI / 2 + u * 1.5 + (r() - 0.5) * 0.2, len = 0.36 + 0.14 * r(), d = 0.5 + 0.5 * r(); bs(g, [[cx + u * 0.04, 0.95], [cx + Math.cos(a) * len * 0.5, 0.95 + Math.sin(a) * len * 0.5], [cx + Math.cos(a) * len, 0.95 + Math.sin(a) * len]], W.drop(0.13, 0.68), d * 0.8, d); }
  }
};
/** 葱韭：一排细而直的叶 */
const cong: Tile = (g, r) => { for (let i = 0; i < 11; i++) { const x = 0.08 + 0.84 * ((i + r()) / 11); blade(g, r, x, 0.96, 0.4 + 0.3 * r(), (r() - 0.5) * 0.35, 0.04, 0.55 + 0.45 * r()); } };
/** 心形的叶（豆、瓜藤） */
function heart(g: Ctx, x: number, y: number, a: number, len: number, d: number) {
  bs(g, [[x, y], [x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5], [x + Math.cos(a) * len, y + Math.sin(a) * len]], W.drop(len * 0.85, 0.36), Math.min(1, d * 1.1), d * 0.7);
}
/** 豆：缠着架往上爬的藤 */
const douVine: Tile = (g, r) => {
  haze(g, 0.5, 0.5, 0.3, 0.46, 0.45, 0.24);
  const ph = r() * 6, X = (t: number) => 0.5 + 0.07 * Math.sin(t * 9 + ph);
  stroke(g, [[X(0), 0.98], [X(0.25), 0.74], [X(0.5), 0.5], [X(0.75), 0.27], [X(1), 0.04]], () => 0.02, ink(0.8));
  for (let i = 0; i < 11; i++) { const t = (i + 0.5 * r()) / 11, s = i % 2 ? 1 : -1; heart(g, X(t) + s * 0.03, 0.98 - 0.94 * t, Math.PI / 2 - s * (0.9 + 0.5 * r()), 0.17 + 0.07 * r(), 0.45 + 0.55 * r()); }
};
const douLow: Tile = (g, r) => { for (let i = 0; i < 8; i++) { const x = 0.24 + 0.52 * r(), y = 0.5 + 0.36 * r(); heart(g, x, y, Math.PI / 2 + (r() - 0.5) * 2.2, 0.16 + 0.07 * r(), 0.45 + 0.55 * r()); } };
const douDry: Tile = (g, r) => {
  const ph = r() * 6, X = (t: number) => 0.5 + 0.08 * Math.sin(t * 9 + ph);
  stroke(g, [[X(0), 0.98], [X(0.25), 0.74], [X(0.5), 0.5], [X(0.75), 0.27], [X(1), 0.08]], () => 0.022, ink(0.8));
  for (let i = 0; i < 5; i++) { const t = 0.15 + 0.8 * r(), s = i % 2 ? 1 : -1; heart(g, X(t) + s * 0.03, 0.98 - 0.9 * t, Math.PI / 2 - s * 0.3, 0.1 + 0.05 * r(), 0.5 + 0.5 * r()); }
};
/** 蒿：荒地上的高草，茎上是细碎的叶 */
const hao: Tile = (g, r) => {
  for (let i = 0; i < 4; i++) {
    const x = 0.22 + 0.19 * i + (r() - 0.5) * 0.06, top = 0.08 + 0.3 * r(), lean = (r() - 0.5) * 0.2, d = 0.5 + 0.5 * r();
    stroke(g, [[x, 0.98], [x + lean * 0.5, (0.98 + top) / 2], [x + lean, top]], (t) => 0.022 * (1 - 0.5 * t), ink(d));
    for (let k = 0; k < 8; k++) { const t = 0.15 + 0.1 * k, s = k % 2 ? 1 : -1, y = 0.98 - (0.98 - top) * t, px = x + lean * t, a = -Math.PI / 2 + s * (0.8 + 0.4 * r()), len = 0.1 + 0.05 * r(); stroke(g, [[px, y], [px + Math.cos(a) * len, y + Math.sin(a) * len]], (u) => 0.04 * Math.sin(Math.PI * Math.min(1, u + 0.1)), ink(d * (0.7 + 0.3 * r()))); }
  }
};
const haoDry: Tile = (g, r) => {
  for (let i = 0; i < 5; i++) {
    const x = 0.2 + 0.15 * i + (r() - 0.5) * 0.06, top = 0.15 + 0.4 * r(), lean = (r() - 0.5) * 0.35, d = 0.55 + 0.45 * r();
    stroke(g, [[x, 0.98], [x + lean * 0.4, (0.98 + top) / 2], [x + lean, top]], (t) => 0.022 * (1 - 0.5 * t), ink(d));
    for (let k = 0; k < 3; k++) { g.fillStyle = ink(d); g.beginPath(); g.arc(x + lean * (1 - 0.1 * k) + (r() - 0.5) * 0.05, top + 0.05 * k, 0.022 + 0.012 * r(), 0, TAU); g.fill(); }
  }
};
/** 有裂的叶（菊）：三瓣合成一片 */
function lobed(g: Ctx, x: number, y: number, a: number, len: number, d: number) {
  for (const [da, k] of [[-0.55, 0.7], [0.55, 0.7], [0, 1]] as Array<[number, number]>) { const b = a + da; bs(g, [[x, y], [x + Math.cos(b) * len * k * 0.5, y + Math.sin(b) * len * k * 0.5], [x + Math.cos(b) * len * k, y + Math.sin(b) * len * k]], W.drop(len * 0.42, 0.5), d, d * 0.75); }
}
/** 菊的叶：几茎，互生的裂叶 */
const juLeaf: Tile = (g, r) => {
  haze(g, 0.5, 0.55, 0.36, 0.42, 0.5, 0.24);
  for (let i = 0; i < 4; i++) {
    const x = 0.26 + 0.16 * i + (r() - 0.5) * 0.06, top = 0.1 + 0.25 * r(), lean = (i / 3 - 0.5) * 0.3 + (r() - 0.5) * 0.1, d = 0.5 + 0.5 * r();
    stroke(g, [[x, 0.98], [x + lean * 0.5, (0.98 + top) / 2], [x + lean, top]], () => 0.022, ink(Math.min(1, d + 0.2)));
    for (let k = 0; k < 5; k++) { const t = 0.2 + 0.17 * k, s = k % 2 ? 1 : -1; lobed(g, x + lean * t, 0.98 - (0.98 - top) * t, -Math.PI / 2 + s * (1.0 + 0.3 * r()), 0.15 + 0.05 * r(), d * (0.75 + 0.25 * r())); }
  }
};
/** 枯菊：干茎，垂着枯叶，梢头是干了的花托 */
const juDry: Tile = (g, r) => {
  for (let i = 0; i < 4; i++) {
    const x = 0.25 + 0.17 * i + (r() - 0.5) * 0.06, top = 0.2 + 0.3 * r(), lean = (i / 3 - 0.5) * 0.5 + (r() - 0.5) * 0.2, d = 0.6 + 0.4 * r();
    stroke(g, [[x, 0.98], [x + lean * 0.5, (0.98 + top) / 2], [x + lean, top]], () => 0.022, ink(d));
    for (let k = 0; k < 3; k++) { const t = 0.3 + 0.2 * k, s = k % 2 ? 1 : -1, px = x + lean * t, py = 0.98 - (0.98 - top) * t; bs(g, [[px, py], [px + s * 0.05, py + 0.04], [px + s * 0.06, py + 0.13]], W.leaf(0.05, 0.6), d, d * 0.7); }
    g.fillStyle = ink(d); g.beginPath(); g.arc(x + lean, top, 0.035, 0, TAU); g.fill();
  }
};
/** 瓜叶：两三片掌状的大叶（五裂，裂片尖） */
const guaLeaf: Tile = (g, r) => {
  haze(g, 0.5, 0.5, 0.4, 0.4, 0.5, 0.26);
  for (let i = 0; i < 3; i++) {
    const a0 = r() * TAU, d0 = 0.15 * Math.sqrt(r()) + 0.05, x = 0.5 + Math.cos(a0) * d0, y = 0.5 + Math.sin(a0) * d0, f = r() * TAU, len = 0.2 + 0.07 * r(), d = 0.4 + 0.55 * r();
    for (let k = 0; k < 5; k++) { const a = f + (k - 2) * 0.62, l = len * (1 - 0.14 * Math.abs(k - 2)); bs(g, [[x, y], [x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5], [x + Math.cos(a) * l, y + Math.sin(a) * l]], W.drop(l * 0.62, 0.45), d, d * 0.8); }
  }
};
type P2 = [number, number];
/** 蕨：几片羽叶从心里拱出来，先扬后垂 */
const jue: Tile = (g, r) => {
  const n = 5 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) - 0.5, a0 = -Math.PI / 2 + u * 2.0, len = 0.5 + 0.18 * r(), d = 0.5 + 0.5 * r(), droop = u * 1.1;
    const at = (t: number): P2 => [0.5 + Math.cos(a0 + droop * t) * len * t, 0.93 + Math.sin(a0 + droop * t) * len * t + 0.1 * t * t];
    for (let k = 1; k <= 7; k++) {
      const t = k / 7, [x, y] = at(t), [x1, y1] = at(t - 0.1), ta = Math.atan2(y - y1, x - x1), l2 = 0.12 * (1 - 0.62 * t) + 0.025;
      g.fillStyle = ink(d * (0.7 + 0.3 * r()));
      for (const s of [-1, 1]) { const b = ta + s * 1.25; g.beginPath(); g.ellipse(x + Math.cos(b) * l2 * 0.5, y + Math.sin(b) * l2 * 0.5, l2 * 0.56, l2 * 0.27, b, 0, TAU); g.fill(); }
    }
  }
};
/** 菖蒲：一丛剑一样的叶，直而微弯 */
const changpu: Tile = (g, r) => {
  for (let i = 0; i < 9; i++) { const u = i / 8 - 0.5, h = (0.6 + 0.32 * r()) * (1 - 0.3 * Math.abs(u)), d = 0.5 + 0.5 * r(); bs(g, [[0.5 + u * 0.14, 0.97], [0.5 + u * 0.42 + (r() - 0.5) * 0.04, 0.97 - h * 0.5], [0.5 + u * (0.8 + 0.4 * r()), 0.97 - h]], W.drop(0.062, 0.3), Math.min(1, d * 1.1), d * 0.7); }
};
/** 水草：贴着水面的几笔横叶、几片小圆叶 */
const shuicao: Tile = (g, r) => {
  for (let i = 0; i < 5; i++) { const x = 0.16 + 0.5 * r(), y = 0.42 + 0.22 * r(), l = 0.14 + 0.12 * r(), d = 0.5 + 0.5 * r(); bs(g, [[x, y], [x + l * 0.5, y - 0.015], [x + l, y + 0.01]], W.leaf(0.05, 0.5), d, d * 0.8); }
  for (let i = 0; i < 6; i++) { g.fillStyle = ink(0.45 + 0.5 * r()); g.beginPath(); g.ellipse(0.2 + 0.6 * r(), 0.5 + 0.2 * r(), 0.045 + 0.02 * r(), 0.028 + 0.012 * r(), 0, 0, TAU); g.fill(); }
};
/** 蜀葵：直直的高茎，茎上是圆的大叶，越往上越小（花另点） */
const kui: Tile = (g, r) => {
  for (let i = 0; i < 3; i++) {
    const x = 0.3 + 0.2 * i + (r() - 0.5) * 0.06, top = 0.05 + 0.2 * r(), lean = (r() - 0.5) * 0.08, d = 0.5 + 0.5 * r();
    stroke(g, [[x, 0.98], [x + lean * 0.5, (0.98 + top) / 2], [x + lean, top]], (t) => 0.028 * (1 - 0.4 * t), ink(Math.min(1, d + 0.15)));
    for (let k = 0; k < 5; k++) { const t = 0.08 + 0.13 * k, s = k % 2 ? 1 : -1, rad = 0.085 - 0.01 * k; blob(g, r, x + lean * t + s * (rad + 0.02), 0.98 - (0.98 - top) * t - 0.02, rad, ink(d * (0.7 + 0.3 * r())), 4, 0.9); }
  }
};
/** 藤：横着爬的一段，心形的叶上下错落（篱上的牵牛、地上的南瓜） */
const teng: Tile = (g, r) => {
  const ph = r() * 6, Y = (t: number) => 0.5 + 0.06 * Math.sin(t * 8 + ph);
  stroke(g, [[0.03, Y(0)], [0.27, Y(0.25)], [0.5, Y(0.5)], [0.73, Y(0.75)], [0.97, Y(1)]], () => 0.02, ink(0.8));
  for (let i = 0; i < 10; i++) { const t = (i + 0.5 * r()) / 10, s = i % 2 ? 1 : -1; heart(g, 0.04 + 0.92 * t, Y(t), s * (Math.PI / 2) + (r() - 0.5) * 0.9, 0.16 + 0.08 * r(), 0.45 + 0.55 * r()); }
};
const tengDry: Tile = (g, r) => {
  const ph = r() * 6, Y = (t: number) => 0.5 + 0.07 * Math.sin(t * 8 + ph);
  stroke(g, [[0.03, Y(0)], [0.27, Y(0.25)], [0.5, Y(0.5)], [0.73, Y(0.75)], [0.97, Y(1)]], () => 0.022, ink(0.8));
  for (let i = 0; i < 4; i++) { const t = 0.1 + 0.8 * r(); heart(g, 0.04 + 0.92 * t, Y(t), Math.PI / 2 + (r() - 0.5) * 0.6, 0.09 + 0.04 * r(), 0.5 + 0.5 * r()); }
};
export const FIELD = sheet(6, [
  ['cao0', cao], ['cao1', cao], ['caoShort', caoShort], ['tai', tai], ['sanye', sanye], ['kuo', kuo],
  ['lu0', lu], ['lu1', lu], ['luDry', luDry], ['luShoot', luShoot], ['maiYoung', maiYoung], ['maiRipe', maiRipe],
  ['maiStub', maiStub], ['maiSprout', maiSprout], ['guRipe', guRipe], ['caiPlant', caiPlant], ['caiPod', caiPod], ['caiSeed', caiSeed],
  ['baicai', baicai], ['qingcai', qingcai], ['cong', cong], ['douVine', douVine], ['douLow', douLow], ['douDry', douDry],
  ['hao', hao], ['haoDry', haoDry], ['juLeaf', juLeaf], ['juDry', juDry], ['guaLeaf', guaLeaf], ['tai2', tai],
  ['jue', jue], ['changpu', changpu], ['shuicao', shuicao], ['kui', kui], ['teng', teng], ['tengDry', tengDry],
]);

// ———————————————————————————— 花（粉）：菜花、菊、莲、芦花、野花 ————————————————————————————
/** 菜花：几穗，每穗一簇小黄点，穗尖是未开的苞；茎用点缀色（绿） */
const caihua: Tile = (g, r) => {
  for (let i = 0; i < 3; i++) {
    const x = 0.24 + 0.26 * i + (r() - 0.5) * 0.1, y = 0.36 + 0.2 * r();
    stroke(g, [[x, 0.98], [x + (r() - 0.5) * 0.04, y + 0.1]], () => 0.022, ink(0.8, 1));
    const n = 8 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) { const a = r() * TAU, d = Math.sqrt(r()); g.fillStyle = ink(0.35 + 0.5 * r()); g.beginPath(); g.arc(x + Math.cos(a) * d * 0.11, y + Math.sin(a) * d * 0.14, 0.034 + 0.02 * r(), 0, TAU); g.fill(); }
    g.fillStyle = ink(0.7, 0.55); g.beginPath(); g.ellipse(x, y - 0.17, 0.03, 0.05, 0, 0, TAU); g.fill();
  }
};
/** 菊：正面的一朵。瓣是一笔笔勾出来的，外长内短，瓣尖略勾 */
const ju: Tile = (g, r) => {
  const a0 = r() * TAU;
  // 三层瓣：外长内短，细而密，瓣尖往里勾；花心是最深的一小团（菊是重瓣，不露蕊）
  for (let ring = 0; ring < 3; ring++) {
    const n = [20, 15, 9][ring], len0 = [0.38, 0.26, 0.14][ring];
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * TAU + (r() - 0.5) * 0.25 + ring * 0.17, len = len0 + 0.07 * r(), hook = (r() - 0.5) * 0.7, d = [0.36, 0.58, 0.85][ring] + 0.2 * r();
      bs(g, [[0.5 + Math.cos(a) * 0.03, 0.5 + Math.sin(a) * 0.03], [0.5 + Math.cos(a) * len * 0.6, 0.5 + Math.sin(a) * len * 0.6], [0.5 + Math.cos(a + hook) * len, 0.5 + Math.sin(a + hook) * len]], W.leaf(0.064, 0.5), Math.min(1, d * 1.25), d * 0.7);
    }
  }
};
/** 菊：侧着的一朵（瓣往上、往两边披），底下一点萼 */
const juSide: Tile = (g, r) => {
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 9 : 17;
    for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5, a = -Math.PI / 2 + u * (ring ? 1.8 : 3.4) + (r() - 0.5) * 0.15, len = (ring ? 0.3 : 0.4) - 0.1 * Math.abs(u) + 0.08 * r(), d = (ring ? 0.7 : 0.38) + 0.25 * r(), hook = u * 0.7; bs(g, [[0.5, 0.66], [0.5 + Math.cos(a) * len * 0.6, 0.66 + Math.sin(a) * len * 0.6], [0.5 + Math.cos(a + hook) * len, 0.66 + Math.sin(a + hook) * len]], W.leaf(0.064, 0.5), Math.min(1, d * 1.25), d * 0.7); }
  }
  g.fillStyle = ink(0.9, 1); g.beginPath(); g.ellipse(0.5, 0.7, 0.06, 0.045, 0, 0, TAU); g.fill();
};
const juBud: Tile = (g, r) => {
  for (let i = 0; i < 3; i++) { const x = 0.28 + 0.22 * i + (r() - 0.5) * 0.06, y = 0.4 + 0.25 * r(); g.fillStyle = ink(0.8, 1); g.beginPath(); g.ellipse(x, y + 0.05, 0.06, 0.05, 0, 0, TAU); g.fill(); g.fillStyle = ink(0.5 + 0.3 * r()); g.beginPath(); g.ellipse(x, y, 0.065, 0.075, 0, 0, TAU); g.fill(); }
};
/** 莲瓣：瓣根白、瓣尖红（浓淡在尖上） */
function lianPetal(g: Ctx, r: Rng, x: number, y: number, a: number, len: number, wid: number, d: number) {
  const b = (r() - 0.5) * 0.1;
  bs(g, [[x, y], [x + Math.cos(a) * len * 0.5 - Math.sin(a) * b, y + Math.sin(a) * len * 0.5 + Math.cos(a) * b], [x + Math.cos(a) * len, y + Math.sin(a) * len]], W.drop(wid, 0.52), d * 0.12, Math.min(1, d * 1.25));
}
/** 莲：开足的一朵（侧看）。外瓣披开，内瓣合抱，中间露出一点莲蓬 */
const lian: Tile = (g, r) => {
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) lianPetal(g, r, 0.5 + s * 0.03, 0.74, -Math.PI / 2 + s * (1.25 - 0.36 * i + (r() - 0.5) * 0.12), 0.4 + 0.04 * i + 0.05 * r(), 0.19, 0.65 + 0.3 * r());
  g.fillStyle = ink(0.7, 1); g.beginPath(); g.ellipse(0.5, 0.56, 0.085, 0.075, 0, 0, TAU); g.fill();
  for (const s of [-1, 0, 1]) lianPetal(g, r, 0.5 + s * 0.05, 0.76, -Math.PI / 2 + s * 0.2 + (r() - 0.5) * 0.08, s ? 0.4 : 0.34, 0.2, 0.8);
};
/** 莲：半开，几瓣合成一只盏 */
const lianCup: Tile = (g, r) => {
  for (const s of [-1, 1]) lianPetal(g, r, 0.5 + s * 0.03, 0.78, -Math.PI / 2 + s * (0.62 + (r() - 0.5) * 0.15), 0.46, 0.2, 0.7);
  for (const s of [-1, 0, 1]) lianPetal(g, r, 0.5 + s * 0.04, 0.8, -Math.PI / 2 + s * 0.24 + (r() - 0.5) * 0.06, 0.56 - 0.06 * Math.abs(s), 0.22, 0.85);
};
/** 莲苞：尖尖的一枚，根上带一点绿 */
const lianBud: Tile = (g, r) => { lianPetal(g, r, 0.5, 0.86, -Math.PI / 2 + (r() - 0.5) * 0.15, 0.62, 0.24, 0.9); g.fillStyle = ink(0.8, 0.9); g.beginPath(); g.ellipse(0.5, 0.85, 0.06, 0.04, 0, 0, TAU); g.fill(); };
/** 莲蓬：倒着的一只小碗，顶面几粒莲子 */
const lianPeng: Tile = (g, r) => {
  g.fillStyle = ink(0.7); g.beginPath(); g.moveTo(0.26, 0.4); g.lineTo(0.74, 0.4); g.quadraticCurveTo(0.7, 0.66, 0.53, 0.76); g.lineTo(0.47, 0.76); g.quadraticCurveTo(0.3, 0.66, 0.26, 0.4); g.closePath(); g.fill();
  g.fillStyle = ink(0.5); g.beginPath(); g.ellipse(0.5, 0.4, 0.24, 0.085, 0, 0, TAU); g.fill();
  g.fillStyle = ink(1);
  for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(0.34 + 0.065 * i + (r() - 0.5) * 0.02, 0.4 + (i % 2 ? 0.025 : -0.02), 0.024, 0.017, 0, 0, TAU); g.fill(); }
};
/** 芦花：一穗，朝一边垂 */
const luhua: Tile = (g, r) => {
  const s = r() < 0.5 ? -1 : 1, X = (t: number) => 0.5 - s * 0.14 + s * 0.34 * t * t, Y = (t: number) => 0.95 - 0.8 * t + 0.28 * t * t * t;
  haze(g, 0.5 + s * 0.04, 0.5, 0.26, 0.4, 0.4, 0.3);
  for (let i = 0; i < 16; i++) {
    const t = 0.18 + 0.8 * (i / 15), a = Math.atan2(Y(t + 0.02) - Y(t), X(t + 0.02) - X(t)) + (i % 2 ? 1 : -1) * (0.5 + 0.4 * r()), len = 0.2 * (1 - 0.5 * t) + 0.05 * r(), d = 0.35 + 0.5 * r();
    bs(g, [[X(t), Y(t)], [X(t) + Math.cos(a) * len * 0.5, Y(t) + Math.sin(a) * len * 0.5 + 0.02], [X(t) + Math.cos(a) * len, Y(t) + Math.sin(a) * len + 0.06]], W.leaf(0.055, 0.6), d, d * 0.6);
  }
  stroke(g, [[X(0), Y(0)], [X(0.5), Y(0.5)], [X(1), Y(1)]], (t) => 0.03 * (1 - 0.6 * t), ink(0.7));
};
/** 野花：几点小的 */
const yehua: Tile = (g, r) => {
  for (let i = 0; i < 5; i++) {
    const x = 0.2 + 0.6 * r(), y = 0.25 + 0.5 * r(), rad = 0.06 + 0.03 * r(), a0 = r() * TAU;
    g.fillStyle = ink(0.4 + 0.3 * r());
    for (let k = 0; k < 5; k++) { const a = a0 + (k / 5) * TAU; g.beginPath(); g.ellipse(x + Math.cos(a) * rad * 0.6, y + Math.sin(a) * rad * 0.6, rad * 0.5, rad * 0.38, a, 0, TAU); g.fill(); }
    g.fillStyle = ink(0.9, 1); g.beginPath(); g.arc(x, y, rad * 0.26, 0, TAU); g.fill();
  }
};
/** 葫芦：上小下大的两截，顶上一点蒂 */
const hulu: Tile = (g, r) => {
  const gr = g.createLinearGradient(0.3, 0.3, 0.72, 0.8); gr.addColorStop(0, ink(0.3)); gr.addColorStop(1, ink(0.8));
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(0.5, 0.66, 0.2 + 0.03 * r(), 0.22, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(0.5, 0.36, 0.11, 0.12, 0, 0, TAU); g.fill();
  g.beginPath(); g.rect(0.44, 0.38, 0.12, 0.14); g.fill();
  stroke(g, [[0.5, 0.26], [0.52, 0.16], [0.47, 0.08]], () => 0.03, ink(0.9, 1));
};
/** 柿、枣、石榴、南瓜：一只圆果，顶上一点蒂（点缀色） */
const guo: Tile = (g, r) => {
  const gr = g.createRadialGradient(0.42, 0.44, 0.03, 0.5, 0.54, 0.34);
  gr.addColorStop(0, ink(0.28)); gr.addColorStop(0.6, ink(0.6)); gr.addColorStop(1, ink(0.95));
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(0.5, 0.55, 0.31 + 0.02 * r(), 0.28, 0, 0, TAU); g.fill();
  g.fillStyle = ink(0.9, 1); g.beginPath(); g.ellipse(0.5, 0.29, 0.1, 0.05, 0, 0, TAU); g.fill();
  stroke(g, [[0.5, 0.29], [0.52, 0.17]], () => 0.035, ink(0.9, 1));
};
/** 石榴花：一小盏，瓣皱，萼厚 */
const liuhua: Tile = (g, r) => {
  for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5 + (r() - 0.5) * 0.2; blob(g, r, 0.5 + Math.cos(a) * 0.2, 0.5 + Math.sin(a) * 0.2, 0.13 + 0.03 * r(), ink(0.45 + 0.4 * r()), 3, 0.9); }
  bs(g, [[0.5, 0.86], [0.5, 0.7], [0.5, 0.52]], (t) => 0.1 + 0.1 * t, 1, 0.8);
};
/** 蜀葵花：圆圆的一朵，五瓣相叠，花心深 */
const kuihua: Tile = (g, r) => {
  const a0 = r() * TAU;
  for (let i = 0; i < 5; i++) {
    const a = a0 + (i / 5) * TAU + (r() - 0.5) * 0.2, px = 0.5 + Math.cos(a) * 0.18, py = 0.5 + Math.sin(a) * 0.18;
    const gr = g.createRadialGradient(0.5, 0.5, 0.03, px, py, 0.3);
    gr.addColorStop(0, ink(0.95)); gr.addColorStop(0.4, ink(0.55)); gr.addColorStop(1, ink(0.25 + 0.15 * r()));
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(px, py, 0.22, 0.19, a, 0, TAU); g.fill();
  }
  g.fillStyle = ink(1, 0.9); g.beginPath(); g.arc(0.5, 0.5, 0.055, 0, TAU); g.fill();
};
/** 牵牛：一只喇叭，正面是圆的，五道浅纹成星 */
const qianniu: Tile = (g, r) => {
  const gr = g.createRadialGradient(0.5, 0.5, 0.02, 0.5, 0.5, 0.36);
  gr.addColorStop(0, ink(0.05)); gr.addColorStop(0.35, ink(0.3)); gr.addColorStop(1, ink(0.9));
  blob(g, r, 0.5, 0.5, 0.3, gr as unknown as string, 5, 1);
  const a0 = r() * TAU;
  for (let i = 0; i < 5; i++) { const a = a0 + (i / 5) * TAU; stroke(g, [[0.5, 0.5], [0.5 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3]], (t) => 0.05 * (1 - 0.6 * t), ink(0.15)); }
};
export const PETAL = sheet(5, [
  ['caihua0', caihua], ['caihua1', caihua], ['ju0', ju], ['ju1', ju], ['juSide', juSide],
  ['juBud', juBud], ['lian0', lian], ['lianCup', lianCup], ['lianBud', lianBud], ['lianPeng', lianPeng],
  ['luhua0', luhua], ['luhua1', luhua], ['yehua0', yehua], ['yehua1', yehua], ['hulu', hulu],
  ['ju2', juSide], ['guo', guo], ['liuhua', liuhua], ['kuihua', kuihua], ['qianniu', qianniu],
]);
