/**
 * 远景的笔触：烟树、米点、峰顶的松、芦苇、帆与舟、茅舍、塔、亭、雁与飞鸟。
 * 画法同 ink/brush.ts：每格 1×1，原点在左上、y 朝下；颜色用 ink(浓, 点缀)。
 * 远景的笔在画面上往往只有一二十个像素高，所以笔画都肥、形都简——要的是「一笔就认得出」。
 * 有上下的东西（树、屋、舟）根脚都落在格子底边正中。
 */
import { blob, ink, stroke, type Ctx, type Tile } from '../../ink/brush';
import type { Rng } from '../../core/rng';

const oval = (g: Ctx, x: number, y: number, rx: number, ry: number, rot: number, fill: string) => { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
const poly = (g: Ctx, pts: Array<[number, number]>, fill: string) => { g.fillStyle = fill; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); };

// —— 树 ——
/** 米点：三五笔横卧的墨点攒成一小簇——边上参差，上头压一两笔浓的（不是整整齐齐的一摞） */
const mi = (wide: number): Tile => (g, r) => {
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = 0.26 * Math.sqrt(r()), y = 0.54 + Math.sin(a) * d * 0.62;
    oval(g, 0.5 + Math.cos(a) * d * 1.25 * wide, y, (0.15 + 0.09 * r()) * wide, 0.07 + 0.035 * r(), (r() - 0.5) * 0.4, ink(0.3 + 0.35 * r() + 0.5 * Math.max(0, 0.6 - y)));
  }
  for (let i = 0; i < 2; i++) oval(g, 0.5 + (r() - 0.5) * 0.34 * wide, 0.4 + 0.08 * r(), 0.1 + 0.05 * r(), 0.048 + 0.015 * r(), (r() - 0.5) * 0.3, ink(0.88 + 0.12 * r()));
};
/** 横点：一笔长的、旁边带一小笔（远林的边、坡脚的草树） */
const dash: Tile = (g, r) => {
  oval(g, 0.48, 0.52, 0.3 + 0.06 * r(), 0.085 + 0.03 * r(), (r() - 0.5) * 0.2, ink(0.45 + 0.3 * r()));
  oval(g, 0.62 + 0.1 * r(), 0.42 + 0.06 * r(), 0.14, 0.06, (r() - 0.5) * 0.3, ink(0.85));
  oval(g, 0.3 + 0.1 * r(), 0.6 + 0.05 * r(), 0.12, 0.05, (r() - 0.5) * 0.3, ink(0.4));
};
/** 烟树：淡淡的一团，上头压几点浓的，底下两三根细干 */
const clump = (twin: boolean): Tile => (g, r) => {
  const xs = twin ? [0.34, 0.66] : [0.5];
  for (const cx of xs) {
    for (let k = 0; k < (twin ? 1 : 2); k++) { const x = cx + (k - 0.5) * 0.14 * (twin ? 0 : 1) + (r() - 0.5) * 0.05; stroke(g, [[x, 0.99], [x + (r() - 0.5) * 0.05, 0.8], [x + (r() - 0.5) * 0.08, 0.6]], (t) => 0.055 * (1 - 0.4 * t), ink(1)); }
    const rad = twin ? 0.2 : 0.27;
    blob(g, r, cx, 0.42 + (twin ? (r() - 0.5) * 0.1 : 0), rad, ink(0.3 + 0.1 * r()), 5, 0.8);
    blob(g, r, cx - rad * 0.3, 0.34, rad * 0.55, ink(0.62), 4, 0.8);
    for (let i = 0; i < 5; i++) oval(g, cx + (r() - 0.5) * rad * 1.3, 0.26 + (r() - 0.5) * 0.14, 0.05 + 0.02 * r(), 0.032, 0, ink(0.95));
  }
};
/** 一株杂树：干、几团叶。lean：被风梳向左（负）还是直立 */
const broad = (lean: number): Tile => (g, r) => {
  stroke(g, [[0.5, 0.99], [0.5 + lean * 0.12, 0.72], [0.5 + lean * 0.3, 0.46]], (t) => 0.065 * (1 - 0.45 * t), ink(1));
  for (let i = 0; i < 6; i++) blob(g, r, 0.5 + lean * (0.3 + 0.45 * r()) + (r() - 0.5) * 0.4, 0.36 + (r() - 0.5) * 0.32, 0.12 + 0.07 * r(), ink(0.42 + 0.45 * r()), 4, lean ? 0.62 : 0.82);
  // 被风梳过的：梢头拖出几笔
  if (lean) for (let i = 0; i < 4; i++) { const y = 0.22 + 0.1 * i + (r() - 0.5) * 0.05; stroke(g, [[0.5 + lean * 0.5, y], [0.5 + lean * 1.0, y - 0.02], [0.5 + lean * 1.45, y + 0.01]], (t) => 0.05 * (1 - t), ink(0.55 + 0.3 * r())); }
};
/** 寒林：光干，几根分叉的枝 */
const bare: Tile = (g, r) => {
  const lean = (r() - 0.5) * 0.25, top: [number, number] = [0.5 + lean, 0.14];
  stroke(g, [[0.5, 0.99], [0.5 + lean * 0.3, 0.6], top], (t) => 0.06 * (1 - 0.6 * t), ink(1));
  for (let i = 0; i < 5; i++) {
    const t = 0.3 + 0.13 * i, x = 0.5 + lean * t * 1.1, y = 0.99 - t * 0.85, s = i % 2 ? 1 : -1, l = 0.24 - 0.025 * i + 0.05 * r();
    stroke(g, [[x, y], [x + s * l * 0.6, y - l * 0.5], [x + s * l, y - l * 1.05]], (u) => 0.04 * (1 - 0.7 * u), ink(0.95));
    stroke(g, [[x + s * l * 0.55, y - l * 0.45], [x + s * l * 0.5, y - l * 1.1]], (u) => 0.03 * (1 - 0.6 * u), ink(0.9));
  }
};
/** 白杨：一条瘦高的树冠 */
const poplar: Tile = (g, r) => {
  stroke(g, [[0.5, 0.99], [0.5, 0.6]], () => 0.055, ink(1));
  for (let i = 0; i < 7; i++) oval(g, 0.5 + (r() - 0.5) * 0.07, 0.72 - i * 0.095, 0.13 - 0.012 * i + 0.02 * r(), 0.075, (r() - 0.5) * 0.4, ink(0.4 + 0.45 * r()));
};
/** 柳，被风梳向左：干斜，丝全往一边飘 */
const willowWind: Tile = (g, r) => {
  stroke(g, [[0.6, 0.99], [0.56, 0.7], [0.48, 0.46], [0.42, 0.3]], (t) => 0.07 * (1 - 0.5 * t), ink(1));
  for (let i = 0; i < 9; i++) {
    const x = 0.34 + 0.34 * r(), y = 0.2 + 0.2 * r(), l = 0.3 + 0.25 * r();
    stroke(g, [[x, y], [x - l * 0.55, y + l * 0.3], [x - l * 0.95, y + l * 0.85]], (t) => 0.05 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), ink(0.4 + 0.45 * r()));
  }
  blob(g, r, 0.42, 0.24, 0.13, ink(0.65), 4, 0.7);
};
/** 一带矮的灌丛、苔点 */
const shrub: Tile = (g, r) => { for (let i = 0; i < 7; i++) blob(g, r, 0.14 + 0.12 * i + (r() - 0.5) * 0.05, 0.84 - 0.1 * r() - 0.1 * Math.sin((i / 6) * Math.PI), 0.085 + 0.045 * r(), ink(0.45 + 0.5 * r()), 3, 0.8); };
/** 极淡的一抹（树后的烟） */
const smoke: Tile = (g, r) => { blob(g, r, 0.5, 0.52, 0.33, ink(0.12), 6, 0.6); blob(g, r, 0.42 + 0.16 * r(), 0.46, 0.2, ink(0.22), 4, 0.6); };
/** 胡椒点：远山上的林 */
const pepper: Tile = (g, r) => { for (let i = 0; i < 13; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 0.36; oval(g, 0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d * 0.7, 0.06 + 0.035 * r(), 0.045 + 0.02 * r(), 0, ink(0.45 + 0.5 * r())); } };
/** 远山上的松：一根粗干，三层平的松盖（只求远看是「松」） */
const pineFar: Tile = (g, r) => {
  const lean = (r() - 0.5) * 0.2;
  stroke(g, [[0.5, 0.99], [0.5 + lean * 0.5, 0.6], [0.5 + lean, 0.2]], (t) => 0.075 * (1 - 0.5 * t), ink(1));
  for (let i = 0; i < 3; i++) { const y = 0.2 + i * 0.2, w = 0.2 + 0.1 * i, cx = 0.5 + lean * (1 - i * 0.4) + (i % 2 ? 0.06 : -0.06); stroke(g, [[cx - w, y + 0.03], [cx, y - 0.03], [cx + w, y + 0.03]], (u) => 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.04 + 0.02)) + 0.02, ink(0.6 + 0.3 * r())); }
};

/** 芦苇，被风压向左：几茎斜的秆，穗全往一边飘 */
const reedWind: Tile = (g, r) => {
  for (let i = 0; i < 8; i++) {
    const x = 0.34 + 0.5 * (i / 7) + (r() - 0.5) * 0.05, hgt = 0.5 + 0.4 * r(), lean = 0.22 + 0.2 * r();
    stroke(g, [[x, 0.99], [x - lean * 0.3, 0.99 - hgt * 0.55], [x - lean, 0.99 - hgt]], (t) => 0.036 * (1 - 0.5 * t), ink(0.55 + 0.4 * r()));
    stroke(g, [[x - lean, 0.99 - hgt], [x - lean - 0.1, 0.99 - hgt + 0.01], [x - lean - 0.2, 0.99 - hgt + 0.06]], (t) => 0.06 * Math.sin(Math.PI * Math.min(1, t + 0.1)), ink(0.35, 0.8));
  }
};
export const WOOD = { cols: 4, tiles: [mi(1), mi(1.2), clump(false), clump(true), broad(0), dash, bare, reedWind, poplar, willowWind, broad(-0.3), shrub, smoke, pepper, pineFar, pineFar] as Tile[] };
export const W = { mi: 0, mi2: 1, clump: 2, twin: 3, broad: 4, dash: 5, bare: 6, reed: 7, poplar: 8, willow: 9, wind: 10, shrub: 11, smoke: 12, pepper: 13, pine: 14, pine2: 15 } as const;

// —— 峰上的松 ——
/** 一株松：屈曲的干，几层平展的松盖（上小、中宽、下偏），层与层之间看得见干与枝 */
function pineOn(g: Ctx, r: Rng, lean: number, tiers: number, o: { base?: number; span?: number; wide?: number } = {}) {
  const yTop = o.base ?? 0.16, span = o.span ?? 0.44, x0 = 0.5 - lean * 0.3, bend = (r() - 0.5) * 0.1;
  const at = (y: number) => { const t = Math.max(0, Math.min(1, (0.99 - y) / (0.99 - yTop))); return x0 + lean * (0.15 * t + 0.85 * t * t) + bend * Math.sin(t * Math.PI); };
  stroke(g, [[at(0.99), 0.99], [at(0.78), 0.78], [at(0.58), 0.58], [at(0.38), 0.38], [at(yTop + 0.02), yTop + 0.02]], (t) => 0.06 * (1 - 0.62 * t), ink(1));
  for (let i = 0; i < tiers; i++) {
    const t = tiers > 1 ? i / (tiers - 1) : 0, y = yTop + t * span + (r() - 0.5) * 0.03, side = i === 0 ? 0 : i % 2 ? 1 : -1;
    const w = (o.wide ?? 1) * (0.12 + 0.16 * Math.sin(Math.PI * (0.22 + 0.6 * t)) + 0.05 * r()), cx = at(y) + side * (0.07 + 0.09 * r()) + lean * 0.12 * (1 - t);
    // 枝：从干上斜出到这一层松盖底下
    if (i > 0) stroke(g, [[at(y + 0.06), y + 0.06], [cx - side * w * 0.2, y + 0.022]], () => 0.026, ink(1));
    // 松盖：一排压扁的墨团（上缘起伏），底下一笔平的收住
    for (let k = 0; k < 6; k++) { const u = (k + 0.5) / 6 - 0.5; oval(g, cx + u * 2 * w * 0.86, y - 0.022 * Math.cos(u * 3.1) - 0.012 * r(), w * 0.3 + 0.022, 0.036 + 0.014 * r(), 0, ink(0.5 + 0.35 * r())); }
    stroke(g, [[cx - w, y + 0.026], [cx, y + 0.032], [cx + w, y + 0.024]], (u) => 0.034 * Math.sin(Math.PI * Math.min(1, u + 0.03)) + 0.008, ink(0.85));
    for (let k = 0; k < 3; k++) oval(g, cx + (r() - 0.5) * 1.5 * w, y - 0.03, 0.03, 0.02, 0, ink(1));
  }
}
const pineA: Tile = (g, r) => pineOn(g, r, 0.22, 4);
const pineB: Tile = (g, r) => pineOn(g, r, -0.18, 3, { wide: 1.15 });
const pineC: Tile = (g, r) => pineOn(g, r, 0.05, 5, { span: 0.5 });
/** 高干的松：盖只在梢头，干上留一截枯枝 */
const pineTall: Tile = (g, r) => { pineOn(g, r, 0.12, 3, { base: 0.1, span: 0.2, wide: 1.1 }); stroke(g, [[0.5, 0.62], [0.62, 0.55], [0.7, 0.56]], (t) => 0.028 * (1 - 0.5 * t), ink(1)); };
/** 被风压弯的松：干往左探出去，松盖全拖在左边 */
const pineBent: Tile = (g, r) => {
  stroke(g, [[0.66, 0.99], [0.62, 0.74], [0.5, 0.55], [0.32, 0.46], [0.16, 0.44]], (t) => 0.065 * (1 - 0.55 * t), ink(1));
  const tiers: Array<[number, number, number]> = [[0.2, 0.36, 0.17], [0.42, 0.42, 0.2], [0.33, 0.56, 0.15]];
  for (const [cx, y, w] of tiers) {
    for (let k = 0; k < 6; k++) { const u = (k + 0.5) / 6 - 0.5; oval(g, cx + u * 2 * w * 0.86, y - 0.02 * Math.cos(u * 3.1) - 0.01 * r(), w * 0.3 + 0.022, 0.036 + 0.012 * r(), -0.12, ink(0.5 + 0.35 * r())); }
    stroke(g, [[cx - w, y + 0.03], [cx, y + 0.03], [cx + w, y + 0.016]], (u) => 0.034 * Math.sin(Math.PI * Math.min(1, u + 0.03)) + 0.008, ink(0.85));
  }
};
/** 崖头垂下来的一丛灌木 */
const scrub: Tile = (g, r) => {
  for (let i = 0; i < 9; i++) blob(g, r, 0.16 + 0.085 * i + (r() - 0.5) * 0.05, 0.78 - 0.16 * Math.sin((i / 8) * Math.PI) - 0.08 * r(), 0.08 + 0.05 * r(), ink(0.42 + 0.5 * r()), 3, 0.78);
  for (let i = 0; i < 3; i++) { const x = 0.2 + 0.3 * i + 0.08 * r(); stroke(g, [[x, 0.8], [x - 0.03, 0.9], [x - 0.02, 0.99]], (t) => 0.05 * (1 - 0.6 * t), ink(0.7)); }
};
/** 峰顶上密密的杂木：几株高矮不齐的小树挤成一排，干细、冠是一团团的 */
const firs: Tile = (g, r) => {
  for (let k = 0; k < 4; k++) {
    const x = 0.14 + 0.24 * k + (r() - 0.5) * 0.09, hgt = 0.42 + 0.44 * r(), top = 0.99 - hgt, lean = (r() - 0.5) * 0.12;
    stroke(g, [[x, 0.99], [x + lean * 0.5, 0.99 - hgt * 0.5], [x + lean, top + 0.08]], (t) => 0.04 * (1 - 0.4 * t), ink(1));
    for (let i = 0; i < 4; i++) { const y = top + 0.07 + (i / 4) * hgt * 0.6, w = 0.07 + 0.035 * i + 0.03 * r(); blob(g, r, x + lean * (1 - i / 4) + (r() - 0.5) * 0.06, y, w, ink(0.5 + 0.45 * r()), 3, 0.62); }
  }
};
export const PINE = { cols: 4, tiles: [pineA, pineB, pineC, pineTall, pineBent, pineBent, scrub, firs] as Tile[] };
export const P = { a: 0, b: 1, c: 2, tall: 3, bent: 4, bent2: 5, scrub: 6, firs: 7 } as const;

// —— 舟、屋、塔、亭、鸟 ——
/** 帆船：一道深的船身，淡的帆（点缀色），帆上几道横的篾 */
const sail = (two: boolean): Tile => (g, r) => {
  stroke(g, [[0.16, 0.84], [0.5, 0.91], [0.86, 0.82]], (t) => 0.035 + 0.05 * Math.sin(Math.PI * t), ink(1));
  const one = (mx: number, top: number, w: number) => {
    stroke(g, [[mx, 0.88], [mx, top]], () => 0.03, ink(1));
    const s: Array<[number, number]> = [[mx - w * 0.12, top + 0.05], [mx + w * 0.9, top + 0.1], [mx + w, 0.74], [mx - w * 0.2, 0.78]];
    poly(g, s, ink(0.18, 1));
    for (let i = 1; i < 5; i++) { const t = i / 5; stroke(g, [[s[0][0] + (s[3][0] - s[0][0]) * t, s[0][1] + (s[3][1] - s[0][1]) * t], [s[1][0] + (s[2][0] - s[1][0]) * t, s[1][1] + (s[2][1] - s[1][1]) * t]], () => 0.016, ink(0.75, 0.55)); }
    stroke(g, [s[1], s[2]], () => 0.022, ink(0.9, 0.3));
  };
  if (two) { one(0.34, 0.26, 0.24); one(0.62, 0.12, 0.26); } else one(0.46, 0.1, 0.34 + 0.04 * r());
};
/** 篷船：弯弯的船身，一拱乌篷，船头一个人 */
const boat: Tile = (g) => {
  stroke(g, [[0.08, 0.76], [0.3, 0.87], [0.7, 0.87], [0.94, 0.74]], (t) => 0.03 + 0.06 * Math.sin(Math.PI * t), ink(1));
  g.fillStyle = ink(0.8); g.beginPath(); g.ellipse(0.55, 0.82, 0.2, 0.16, 0, Math.PI, 0); g.fill();
  oval(g, 0.22, 0.66, 0.035, 0.04, 0, ink(1)); stroke(g, [[0.22, 0.69], [0.23, 0.82]], () => 0.045, ink(1));
  stroke(g, [[0.3, 0.52], [0.12, 0.92]], () => 0.016, ink(1));
};
/** 小划子：一叶舟，一人立着撑篙 */
const skiff: Tile = (g) => {
  stroke(g, [[0.12, 0.84], [0.5, 0.92], [0.9, 0.82]], (t) => 0.025 + 0.045 * Math.sin(Math.PI * t), ink(1));
  oval(g, 0.58, 0.6, 0.035, 0.04, 0, ink(1)); stroke(g, [[0.58, 0.63], [0.57, 0.86]], () => 0.05, ink(1));
  stroke(g, [[0.74, 0.4], [0.5, 0.96]], () => 0.016, ink(1));
};
/** 茅舍的顶：一道深的脊，淡的坡面，底下一条檐影 */
function roofOn(g: Ctx, x: number, y: number, w: number, h: number) {
  poly(g, [[x - w, y], [x - w * 0.62, y - h], [x + w * 0.62, y - h], [x + w, y]], ink(0.45));
  stroke(g, [[x - w * 0.66, y - h], [x + w * 0.66, y - h]], () => 0.035, ink(1));
  stroke(g, [[x - w, y], [x + w, y]], () => 0.028, ink(0.9));
  poly(g, [[x - w * 0.8, y], [x + w * 0.8, y], [x + w * 0.8, y + h * 0.55], [x - w * 0.8, y + h * 0.55]], ink(0.16));
  oval(g, x + w * 0.1, y + h * 0.36, w * 0.1, h * 0.2, 0, ink(0.95));
}
/** 一个小村：两三间茅舍，屋后一团树 */
const hamlet: Tile = (g, r) => {
  blob(g, r, 0.3, 0.52, 0.2, ink(0.45), 4, 0.8); blob(g, r, 0.7, 0.56, 0.16, ink(0.6), 4, 0.8);
  stroke(g, [[0.3, 0.9], [0.31, 0.6]], () => 0.04, ink(1));
  roofOn(g, 0.62, 0.76, 0.24, 0.13); roofOn(g, 0.3, 0.84, 0.2, 0.11); roofOn(g, 0.8, 0.88, 0.15, 0.085);
};
const hut: Tile = (g, r) => { blob(g, r, 0.68, 0.5, 0.2, ink(0.5), 4, 0.8); stroke(g, [[0.7, 0.9], [0.69, 0.56]], () => 0.045, ink(1)); roofOn(g, 0.42, 0.8, 0.3, 0.16); };
/** 塔：一层层出檐，越上越小，顶上一根刹 */
const pagoda: Tile = (g) => {
  const n = 6;
  for (let i = 0; i < n; i++) {
    const y = 0.92 - i * 0.125, w = 0.2 - i * 0.024;
    poly(g, [[0.5 - w * 0.62, y], [0.5 + w * 0.62, y], [0.5 + w * 0.56, y - 0.125], [0.5 - w * 0.56, y - 0.125]], ink(0.7));
    stroke(g, [[0.5 - w - 0.03, y - 0.085], [0.5, y - 0.11], [0.5 + w + 0.03, y - 0.085]], () => 0.042, ink(1));
  }
  stroke(g, [[0.5, 0.2], [0.5, 0.04]], (t) => 0.035 * (1 - 0.7 * t), ink(1));
  poly(g, [[0.24, 0.92], [0.76, 0.92], [0.8, 0.99], [0.2, 0.99]], ink(0.85));
};
/** 亭：四角攒尖的顶，檐角微翘，几根柱 */
const pavilion: Tile = (g) => {
  poly(g, [[0.5, 0.26], [0.86, 0.56], [0.14, 0.56]], ink(0.75));
  stroke(g, [[0.08, 0.53], [0.3, 0.56], [0.5, 0.52], [0.7, 0.56], [0.92, 0.53]], () => 0.05, ink(1));
  stroke(g, [[0.5, 0.3], [0.5, 0.18]], () => 0.04, ink(1)); oval(g, 0.5, 0.17, 0.035, 0.035, 0, ink(1));
  for (const x of [0.24, 0.5, 0.76]) stroke(g, [[x, 0.56], [x, 0.93]], () => 0.04, ink(1));
  stroke(g, [[0.14, 0.95], [0.86, 0.95]], () => 0.05, ink(0.9));
};
/** 山寺：一座歇山顶的殿，旁边两株树 */
const temple: Tile = (g, r) => {
  blob(g, r, 0.2, 0.6, 0.17, ink(0.55), 4, 0.85); blob(g, r, 0.84, 0.66, 0.13, ink(0.6), 3, 0.85);
  poly(g, [[0.2, 0.7], [0.36, 0.5], [0.66, 0.5], [0.82, 0.7]], ink(0.7));
  stroke(g, [[0.34, 0.5], [0.68, 0.5]], () => 0.045, ink(1));
  stroke(g, [[0.14, 0.68], [0.5, 0.72], [0.86, 0.68]], () => 0.045, ink(1));
  poly(g, [[0.26, 0.72], [0.76, 0.72], [0.76, 0.92], [0.26, 0.92]], ink(0.28));
  for (const x of [0.3, 0.44, 0.58, 0.72]) stroke(g, [[x, 0.72], [x, 0.92]], () => 0.03, ink(0.95));
  stroke(g, [[0.18, 0.95], [0.84, 0.95]], () => 0.05, ink(0.85));
};
/** 渡头：一道伸进水里的栈桥，系着两只船，岸上一竿 */
const landing: Tile = (g) => {
  stroke(g, [[0.04, 0.8], [0.6, 0.82]], () => 0.035, ink(1));
  for (const x of [0.2, 0.4, 0.58]) stroke(g, [[x, 0.8], [x, 0.93]], () => 0.03, ink(1));
  stroke(g, [[0.5, 0.9], [0.72, 0.95], [0.96, 0.88]], (t) => 0.02 + 0.04 * Math.sin(Math.PI * t), ink(1));
  stroke(g, [[0.62, 0.74], [0.8, 0.78], [0.97, 0.72]], (t) => 0.02 + 0.035 * Math.sin(Math.PI * t), ink(0.9));
  stroke(g, [[0.12, 0.8], [0.12, 0.34]], () => 0.026, ink(1));
  poly(g, [[0.13, 0.36], [0.34, 0.42], [0.13, 0.5]], ink(0.6, 0.5));
};
/** 飞鸟：两笔翅。up：翅在上（扬起）还是在下（压下去） */
const bird = (up: boolean): Tile => (g) => {
  const k = up ? -1 : 1;
  stroke(g, [[0.5, 0.52], [0.3, 0.52 + k * 0.17], [0.08, 0.52 + k * 0.1]], (t) => 0.085 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.12)), ink(1));
  stroke(g, [[0.5, 0.52], [0.7, 0.52 + k * 0.17], [0.92, 0.52 + k * 0.1]], (t) => 0.085 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.12)), ink(1));
  oval(g, 0.5, 0.52, 0.06, 0.045, 0, ink(1));
};
/** 雁：伸着长颈的身子（头朝右），一对长翅 */
const goose = (up: boolean): Tile => (g) => {
  const k = up ? -1 : 1;
  stroke(g, [[0.18, 0.54], [0.5, 0.52], [0.78, 0.48], [0.95, 0.46]], (t) => 0.02 + 0.075 * Math.sin(Math.PI * Math.min(1, t * 1.25)), ink(1));
  stroke(g, [[0.46, 0.52], [0.36, 0.52 + k * 0.2], [0.22, 0.52 + k * 0.3]], (t) => 0.08 * (1 - 0.75 * t), ink(1));
  stroke(g, [[0.5, 0.52], [0.52, 0.52 + k * 0.17], [0.44, 0.52 + k * 0.33]], (t) => 0.07 * (1 - 0.75 * t), ink(0.9));
};
/** 小桥：一拱 */
const bridge: Tile = (g) => {
  stroke(g, [[0.04, 0.84], [0.3, 0.62], [0.5, 0.56], [0.7, 0.62], [0.96, 0.84]], () => 0.06, ink(1));
  g.fillStyle = ink(0.4); g.beginPath(); g.moveTo(0.04, 0.84); g.quadraticCurveTo(0.5, 0.36, 0.96, 0.84); g.lineTo(0.76, 0.84); g.quadraticCurveTo(0.5, 0.58, 0.24, 0.84); g.closePath(); g.fill();
};
export const MARK = { cols: 4, tiles: [sail(false), sail(true), boat, skiff, hamlet, hut, pagoda, pavilion, temple, landing, bird(true), bird(false), goose(true), goose(false), bridge, hut] as Tile[] };
export const M = { sail: 0, sail2: 1, boat: 2, skiff: 3, hamlet: 4, hut: 5, pagoda: 6, pavilion: 7, temple: 8, landing: 9, birdUp: 10, birdDn: 11, gooseUp: 12, gooseDn: 13, bridge: 14, hut2: 15 } as const;

// —— 芦苇（近岸，看得清一茎一茎）——
/** 一丛芦苇：几茎向上张开的秆与长叶，梢头是穗（点缀色） */
const reed = (lean: number): Tile => (g, r) => {
  for (let i = 0; i < 9; i++) {
    const x = 0.5 + (r() - 0.5) * 0.36, hgt = 0.5 + 0.45 * r(), l = lean + (r() - 0.5) * 0.5;
    const tip: [number, number] = [x + l * hgt * 0.5, 0.99 - hgt];
    stroke(g, [[x, 0.99], [x + l * hgt * 0.14, 0.99 - hgt * 0.55], tip], (t) => 0.026 * (1 - 0.45 * t), ink(0.5 + 0.45 * r()));
    if (i % 3 !== 2) stroke(g, [tip, [tip[0] + l * 0.06 + 0.02, tip[1] - 0.07], [tip[0] + l * 0.16 + 0.03, tip[1] - 0.1]], (t) => 0.055 * Math.sin(Math.PI * Math.min(1, t + 0.12)), ink(0.3, 0.85));
    else { const y = 0.99 - hgt * (0.4 + 0.3 * r()), s = r() < 0.5 ? -1 : 1; stroke(g, [[x + l * 0.08, y], [x + s * 0.12, y - 0.1], [x + s * 0.24, y - 0.06]], (t) => 0.03 * (1 - t), ink(0.6 + 0.3 * r())); }
  }
};
export const REED = { cols: 2, tiles: [reed(0.1), reed(-0.25), reed(0.3), reed(-0.6)] as Tile[] };
