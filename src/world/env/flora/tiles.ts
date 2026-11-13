/**
 * 草木的笔：点叶、点花用的图。各种树各有各的画法——
 *   介字点、个字点（杂树、竹）、胡椒点（槐、远树）、混点（阔叶）、垂丝（柳）、攒针（松）、点花（桃、梅）、鹿角枝（寒林）。
 * 都是开场时在画布上现画的。规矩（见 docs/INK.md）：红通道是浓淡，绿通道是点缀色占几成，透明度是形状；笔要肥。
 *
 * 另有一条自己的规矩：叶团底下垫一层「不到一半透明」的淡底（haze）。近看它是镂空的（笔与笔之间透着纸），
 * 缩小了（远树）透明度的门槛放低，它才显出来，把一团叶连成一片——远树不稀，近树不闷。
 */
import { blob, ink, leaf, stroke, type Ctx, type Tile } from '../../ink/brush';
import type { Rng } from '../../core/rng';

type P2 = [number, number];
const TAU = Math.PI * 2;

/** 一笔，带浓淡：起笔 d0、收笔 d1；a0、a1 是点缀色占几成 */
export function bs(g: Ctx, pts: P2[], w: (t: number) => number, d0: number, d1 = d0, a0 = 0, a1 = a0) {
  const a = pts[0], b = pts[pts.length - 1];
  const gr = g.createLinearGradient(a[0], a[1], b[0] + 1e-4, b[1] + 1e-4);
  gr.addColorStop(0, ink(d0, a0)); gr.addColorStop(1, ink(d1, a1));
  stroke(g, pts, w, gr as unknown as string);
}
/** 笔的宽窄怎么随行程变 */
export const W = {
  /** 两头尖（叶） */ leaf: (w: number, p = 0.75) => (t: number) => w * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), p),
  /** 起笔重、收笔尖（钉头鼠尾） */ nail: (w: number, p = 1) => (t: number) => w * Math.pow(1 - t, p) * Math.min(1, 0.4 + t * 8),
  /** 起笔尖、肥处偏前、收笔尖（点叶的一撇） */ drop: (w: number, at = 0.38) => { const p = Math.log(0.5) / Math.log(at); return (t: number) => w * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, t)), p)), 0.8); },
};
/** 远看才显的淡底（见文件头） */
export function haze(g: Ctx, x: number, y: number, rx: number, ry: number, dens = 0.5, a = 0.3) {
  g.save(); g.translate(x, y); g.scale(rx, ry);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, ink(dens, 0, a)); gr.addColorStop(0.6, ink(dens, 0, a * 0.75)); gr.addColorStop(1, ink(dens, 0, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
}
/** 图集的一页：各格的名字与次序 */
export function sheet<K extends string>(cols: number, entries: Array<[K, Tile]>) {
  const idx = {} as Record<K, number>;
  entries.forEach(([k], i) => { idx[k] = i; });
  return { cols, tiles: entries.map((e) => e[1]), idx };
}

// ———————————————————————————— 花：桃、梅 ————————————————————————————
/** 一朵正面的花：五瓣，瓣根深、瓣尖淡；花心一点深色，几点蕊。round 大的是梅（瓣圆），小的是桃（瓣略长） */
function bloom(g: Ctx, r: Rng, x: number, y: number, rad: number, dens: number, round = 0) {
  const a0 = r() * TAU;
  for (let i = 0; i < 5; i++) {
    const a = a0 + (i / 5) * TAU + (r() - 0.5) * 0.28, d = rad * (0.56 - 0.06 * round), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    const gr = g.createRadialGradient(x, y, rad * 0.06, x + Math.cos(a) * rad * 0.7, y + Math.sin(a) * rad * 0.7, rad * 0.8);
    gr.addColorStop(0, ink(Math.min(1, dens * 1.55))); gr.addColorStop(0.45, ink(dens * 0.9)); gr.addColorStop(1, ink(dens * (0.3 + 0.25 * r())));
    g.fillStyle = gr;
    // 瓣不是规整的椭圆：大小不一，边上再凸出一小块（笔锋）
    const k = 0.86 + 0.28 * r(), rx = rad * (0.5 - 0.04 * round + 0.05 * r()) * k, ry = rad * (0.39 + 0.07 * round + 0.05 * r()) * k;
    g.beginPath(); g.ellipse(px, py, rx, ry, a, 0, TAU); g.fill();
    const b = a + (r() - 0.5) * 1.6;
    g.beginPath(); g.ellipse(px + Math.cos(b) * rx * 0.45, py + Math.sin(b) * rx * 0.45, rx * 0.6, ry * 0.62, b, 0, TAU); g.fill();
  }
  const hr = rad * 0.3, hg = g.createRadialGradient(x, y, 0, x, y, hr);
  hg.addColorStop(0, ink(1, 0.62)); hg.addColorStop(0.5, ink(0.9, 0.3)); hg.addColorStop(1, ink(dens, 0, 0));
  g.fillStyle = hg; g.beginPath(); g.arc(x, y, hr, 0, TAU); g.fill();
  g.fillStyle = ink(1, 1);
  for (let i = 0; i < 4; i++) { const a = r() * TAU, d = rad * (0.2 + 0.2 * r()); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rad * 0.062, 0, TAU); g.fill(); }
}
/** 侧着开的一朵：三瓣合成一只盏，根上是萼 */
function cup(g: Ctx, r: Rng, x: number, y: number, rad: number, ang: number, dens: number) {
  for (const [da, k] of [[-0.62, 0.86], [0.62, 0.86], [0, 1]] as Array<[number, number]>) {
    const a = ang + da + (r() - 0.5) * 0.15, px = x + Math.cos(a) * rad * 0.52, py = y + Math.sin(a) * rad * 0.52;
    const gr = g.createLinearGradient(x, y, x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    gr.addColorStop(0, ink(Math.min(1, dens * 1.5))); gr.addColorStop(1, ink(dens * 0.4));
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(px, py, rad * 0.52 * k, rad * 0.36 * k, a, 0, TAU); g.fill();
  }
  g.fillStyle = ink(1, 0.8);
  g.beginPath(); g.ellipse(x - Math.cos(ang) * rad * 0.05, y - Math.sin(ang) * rad * 0.05, rad * 0.2, rad * 0.16, ang, 0, TAU); g.fill();
}
/** 苞：一粒深色的 */
function bud(g: Ctx, r: Rng, x: number, y: number, rad: number, round = 0) {
  const a = r() * TAU;
  g.fillStyle = ink(0.95, 0.3 + 0.2 * r());
  g.beginPath(); g.ellipse(x, y, rad * (0.72 + 0.2 * round), rad, a, 0, TAU); g.fill();
  g.fillStyle = ink(1, 0.85);
  g.beginPath(); g.arc(x + Math.sin(a) * rad * 0.75, y - Math.cos(a) * rad * 0.75, rad * 0.42, 0, TAU); g.fill();
}
/** 桃：一小枝上三五朵，有正有侧，梢上带苞 */
const taoSpray: Tile = (g, r) => {
  const a = r() * TAU, dx = Math.cos(a), dy = Math.sin(a), n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5, off = (r() - 0.5) * 0.36, x = 0.5 + dx * t * 0.6 - dy * off, y = 0.5 + dy * t * 0.6 + dx * off, rad = 0.125 + 0.05 * r();
    if (r() < 0.7) bloom(g, r, x, y, rad, 0.42 + 0.22 * r()); else cup(g, r, x, y, rad * 1.15, r() * TAU, 0.5 + 0.2 * r());
  }
  const nb = 2 + Math.floor(r() * 4);
  for (let i = 0; i < nb; i++) { const b = r() * TAU, d = 0.27 + 0.13 * r(); bud(g, r, 0.5 + Math.cos(b) * d, 0.5 + Math.sin(b) * d, 0.034 + 0.016 * r()); }
};
/** 桃：开足的一朵 */
const taoOne: Tile = (g, r) => { bloom(g, r, 0.5, 0.5, 0.34, 0.45 + 0.15 * r()); };
/** 桃：两朵相叠，带两三粒苞 */
const taoPair: Tile = (g, r) => {
  const a = r() * TAU;
  cup(g, r, 0.5 - Math.cos(a) * 0.16, 0.5 - Math.sin(a) * 0.16, 0.25, a + Math.PI + (r() - 0.5), 0.55);
  bloom(g, r, 0.5 + Math.cos(a) * 0.12, 0.5 + Math.sin(a) * 0.12, 0.22, 0.45 + 0.15 * r());
  for (let i = 0; i < 3; i++) { const b = a + 1.3 + i * 1.3 + r() * 0.5, d = 0.3 + 0.1 * r(); bud(g, r, 0.5 + Math.cos(b) * d, 0.5 + Math.sin(b) * d, 0.04 + 0.014 * r()); }
};
/** 桃：将开未开，一串苞 */
const taoBuds: Tile = (g, r) => {
  const a = r() * TAU, n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5, off = (r() - 0.5) * 0.2; bud(g, r, 0.5 + Math.cos(a) * t * 0.7 - Math.sin(a) * off, 0.5 + Math.sin(a) * t * 0.7 + Math.cos(a) * off, 0.045 + 0.022 * r()); }
  cup(g, r, 0.5 + (r() - 0.5) * 0.2, 0.5 + (r() - 0.5) * 0.2, 0.17, r() * TAU, 0.6);
};
/** 桃：先染的一团（淡粉的底，上面几点花心）——花团的「水」 */
const taoMass: Tile = (g, r) => {
  for (let i = 0; i < 7; i++) { const a = r() * TAU, d = 0.21 * Math.sqrt(r()); blob(g, r, 0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d * 0.85, 0.11 + 0.07 * r(), ink(0.06 + 0.22 * r()), 4, 0.9); }
  for (let i = 0; i < 3; i++) { const a = r() * TAU, d = 0.25 * Math.sqrt(r()); g.fillStyle = ink(0.8, 0.25 + 0.2 * r()); g.beginPath(); g.arc(0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, 0.024 + 0.012 * r(), 0, TAU); g.fill(); }
};
/** 梅：疏疏的两三朵，瓣圆；旁边几粒圆苞 */
const meiSpray: Tile = (g, r) => {
  const n = 2 + Math.floor(r() * 2), a = r() * TAU;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5, off = (r() - 0.5) * 0.3, x = 0.5 + Math.cos(a) * t * 0.56 - Math.sin(a) * off, y = 0.5 + Math.sin(a) * t * 0.56 + Math.cos(a) * off, rad = 0.13 + 0.045 * r();
    if (r() < 0.75) bloom(g, r, x, y, rad, 0.5 + 0.2 * r(), 1); else cup(g, r, x, y, rad * 1.1, r() * TAU, 0.6);
  }
  for (let i = 0; i < 3; i++) { const b = r() * TAU, d = 0.28 + 0.12 * r(); bud(g, r, 0.5 + Math.cos(b) * d, 0.5 + Math.sin(b) * d, 0.04 + 0.015 * r(), 1); }
};
const meiOne: Tile = (g, r) => { bloom(g, r, 0.5, 0.5, 0.33, 0.55 + 0.15 * r(), 1); };
const meiBuds: Tile = (g, r) => {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) { const a = r() * TAU, d = 0.3 * Math.sqrt(r()); bud(g, r, 0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, 0.055 + 0.025 * r(), 1); }
};
export const BLOOM = sheet(4, [
  ['tao0', taoSpray], ['tao1', taoSpray], ['tao2', taoSpray], ['tao3', taoSpray],
  ['taoOne', taoOne], ['taoPair', taoPair], ['taoBuds', taoBuds], ['taoMass', taoMass],
  ['mei0', meiSpray], ['mei1', meiSpray], ['mei2', meiSpray], ['meiOne', meiOne],
  ['meiBuds', meiBuds], ['taoMass2', taoMass], ['taoPair2', taoPair], ['meiBuds2', meiBuds],
]);

// ———————————————————————————— 叶：杂树、桃、柳；枯枝 ————————————————————————————
/** 介字点：一个梢上四五笔往下撇开 */
function jieGroup(g: Ctx, r: Rng, cx: number, cy: number, sc: number, dens: number) {
  const n = 4 + (r() < 0.45 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) - 0.5, a = Math.PI / 2 + u * (1.5 + 0.3 * r()) + (r() - 0.5) * 0.14;
    const len = sc * (0.58 - 0.2 * Math.abs(u) + 0.1 * r()), bend = -(u + (r() - 0.5) * 0.3) * 0.2;
    const ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
    const mx = (cx + ex) / 2 - Math.sin(a) * bend * len, my = (cy + ey) / 2 + Math.cos(a) * bend * len, d = dens * (0.6 + 0.4 * r());
    bs(g, [[cx, cy], [mx, my], [ex, ey]], W.drop(sc * (0.15 + 0.04 * r()), 0.4), Math.min(1, d * 1.2), d * 0.65);
  }
}
const jie0: Tile = (g, r) => { haze(g, 0.5, 0.46, 0.4, 0.4); jieGroup(g, r, 0.5 + (r() - 0.5) * 0.06, 0.12, 1, 0.82); };
const jie1: Tile = (g, r) => { haze(g, 0.5, 0.48, 0.42, 0.4); jieGroup(g, r, 0.33, 0.1, 0.68, 0.62); jieGroup(g, r, 0.65, 0.3, 0.72, 0.92); };
const jie2: Tile = (g, r) => { haze(g, 0.5, 0.5, 0.42, 0.42); jieGroup(g, r, 0.28, 0.28, 0.56, 0.6); jieGroup(g, r, 0.7, 0.12, 0.56, 0.75); jieGroup(g, r, 0.52, 0.44, 0.6, 0.96); };
/** 胡椒点：一簇小圆点，有浓有淡 */
const pepper: Tile = (g, r) => {
  haze(g, 0.5, 0.5, 0.42, 0.36);
  const n = 15 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.34; blob(g, r, 0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d * 0.82, 0.048 + 0.034 * r(), ink(0.38 + 0.62 * r()), 2); }
};
/** 混点：横着的几笔，叠成一团（阔叶） */
const hun: Tile = (g, r) => {
  haze(g, 0.5, 0.5, 0.42, 0.36);
  const n = 6 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const x = 0.5 + (r() - 0.5) * 0.48, y = 0.5 + (r() - 0.5) * 0.44, l = 0.2 + 0.13 * r(), a = (r() - 0.5) * 0.5, d = 0.42 + 0.58 * r();
    bs(g, [[x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2], [x, y + (r() - 0.5) * 0.03], [x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2]], W.leaf(0.11 + 0.04 * r(), 0.5), d, d * 0.72);
  }
};
/** 桑：两三片心形的大叶，从一个节上披下来 */
const sang: Tile = (g, r) => {
  haze(g, 0.5, 0.5, 0.4, 0.4, 0.5, 0.26);
  const n = 2 + Math.floor(r() * 2), x = 0.5 + (r() - 0.5) * 0.1, y = 0.2 + 0.08 * r();
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i - (n - 1) / 2) * (1.0 + 0.3 * r()) + (r() - 0.5) * 0.35, len = 0.42 + 0.14 * r(), d = 0.45 + 0.5 * r(), b = (r() - 0.5) * 0.14;
    bs(g, [[x, y], [x + Math.cos(a) * len * 0.5 - Math.sin(a) * b, y + Math.sin(a) * len * 0.5 + Math.cos(a) * b], [x + Math.cos(a) * len, y + Math.sin(a) * len]], W.drop(0.3 + 0.07 * r(), 0.34), Math.min(1, d * 1.15), d * 0.7);
  }
};
/** 槐：羽状的复叶，两三枝，成对的小叶 */
function frond(g: Ctx, r: Rng, x0: number, y0: number, ang: number, len: number, dens: number) {
  const n = 5 + Math.floor(r() * 2), bend = (r() - 0.5) * 0.6;
  for (let i = 1; i <= n; i++) {
    const t = i / n, a = ang + bend * t, px = x0 + Math.cos(ang + bend * t * 0.5) * len * t, py = y0 + Math.sin(ang + bend * t * 0.5) * len * t;
    for (const s of [-1, 1]) {
      if (i === n && s === 1) continue;
      const la = i === n ? a : a + s * (1.0 + 0.25 * r()), ll = len * (0.21 + 0.05 * r()) * (i === n ? 1.15 : 1);
      g.fillStyle = ink(dens * (0.6 + 0.4 * r()));
      g.beginPath(); g.ellipse(px + Math.cos(la) * ll * 0.55, py + Math.sin(la) * ll * 0.55, ll * 0.56, ll * 0.31, la, 0, TAU); g.fill();
    }
  }
}
const huai0: Tile = (g, r) => { haze(g, 0.5, 0.5, 0.42, 0.4); for (let i = 0; i < 3; i++) frond(g, r, 0.5 + (i - 1) * 0.07, 0.14 + 0.05 * r(), Math.PI / 2 + (i - 1) * (0.75 + 0.2 * r()), 0.5 + 0.12 * r(), 0.6 + 0.4 * r()); };
const huai1: Tile = (g, r) => { haze(g, 0.5, 0.5, 0.42, 0.42); const a0 = r() * TAU; for (let i = 0; i < 4; i++) frond(g, r, 0.5, 0.5, a0 + (i / 4) * TAU + (r() - 0.5) * 0.5, 0.36 + 0.08 * r(), 0.55 + 0.45 * r()); };
/** 桃叶：一小段梢上互生的六七片披针形的叶，都往下披 */
const taoLeaf: Tile = (g, r) => {
  haze(g, 0.5, 0.52, 0.4, 0.34, 0.5, 0.26);
  const n = 6 + Math.floor(r() * 2), tilt = (r() - 0.5) * 0.5, arch = 0.06 + 0.08 * r();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), x = 0.14 + 0.72 * t, y = 0.3 + (t - 0.5) * tilt - arch * Math.sin(Math.PI * t), s = i % 2 ? 1 : -1;
    const a = Math.PI / 2 + s * (0.25 + 0.5 * r()) + (t - 0.5) * 0.5;
    leaf(g, x, y, a, 0.36 + 0.14 * r(), 0.1 + 0.03 * r(), ink(0.42 + 0.55 * r()), s * (0.08 + 0.12 * r()));
  }
};
/** 嫩叶：两三片小的，朝上，叶尖带一点赭红（点缀色） */
const taoYoung: Tile = (g, r) => {
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * (0.75 + 0.2 * r()) + (r() - 0.5) * 0.2, len = 0.42 + 0.16 * r(), b = (r() - 0.5) * 0.14;
    bs(g, [[0.5, 0.8], [0.5 + Math.cos(a) * len * 0.5 - Math.sin(a) * b, 0.8 + Math.sin(a) * len * 0.5 + Math.cos(a) * b], [0.5 + Math.cos(a) * len, 0.8 + Math.sin(a) * len]], W.leaf(0.135, 0.7), 0.75, 0.45, 0.05, 0.8);
  }
};
/** 垂柳：一条垂下来的丝，两边成对的小叶 */
function strand(g: Ctx, r: Rng, x: number, y0: number, y1: number, dens: number, leafy = 1) {
  const sw = (r() - 0.5) * 0.12, c2 = (r() - 0.5) * 0.05, ph = r() * 6;
  const X = (t: number) => x + sw * t * t + c2 * Math.sin(t * 5 + ph);
  const pts: P2[] = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push([X(t), y0 + (y1 - y0) * t]); }
  stroke(g, pts, (t) => 0.021 * (1 - 0.4 * t), ink(Math.min(1, dens + 0.2)));
  const n = Math.round(((y1 - y0) / 0.072) * leafy);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.25 + 0.5 * r()) / n, s = k % 2 ? 1 : -1;
    leaf(g, X(t), y0 + (y1 - y0) * t, Math.PI / 2 + s * (0.4 + 0.3 * r()), 0.085 + 0.04 * r(), 0.038 + 0.012 * r(), ink(dens * (0.55 + 0.45 * r())), s * 0.1);
  }
}
const liu0: Tile = (g, r) => { haze(g, 0.5, 0.5, 0.42, 0.55, 0.45, 0.26); for (let i = 0; i < 5; i++) strand(g, r, 0.14 + 0.18 * i + (r() - 0.5) * 0.07, 0, 0.84 + 0.15 * r(), 0.5 + 0.4 * r()); };
const liu1: Tile = (g, r) => { haze(g, 0.5, 0.42, 0.42, 0.5, 0.45, 0.26); for (let i = 0; i < 5; i++) strand(g, r, 0.13 + 0.185 * i + (r() - 0.5) * 0.08, 0, 0.5 + 0.48 * r(), 0.5 + 0.4 * r()); };
/** 柳梢：长短不齐地收住 */
const liuTip: Tile = (g, r) => { haze(g, 0.5, 0.3, 0.4, 0.36, 0.45, 0.24); for (let i = 0; i < 4; i++) strand(g, r, 0.18 + 0.21 * i + (r() - 0.5) * 0.1, 0, 0.35 + 0.55 * r(), 0.45 + 0.4 * r(), 0.9); };
/** 鹿角枝：一枝朝上，梢上分叉再分叉 */
function antler(g: Ctx, r: Rng, x: number, y: number, ang: number, len: number, w: number, depth: number, dens: number, droop = 0) {
  const bend = (r() - 0.5) * 0.4, a1 = ang + bend + droop;
  const mx = x + Math.cos(ang) * len * 0.5, my = y + Math.sin(ang) * len * 0.5, ex = mx + Math.cos(a1) * len * 0.5, ey = my + Math.sin(a1) * len * 0.5;
  bs(g, [[x, y], [mx, my], [ex, ey]], (t) => w * (1 - 0.42 * t), dens, dens * 0.92);
  if (depth <= 0) return;
  const k = r() < 0.3 ? 3 : 2;
  for (let i = 0; i < k; i++) {
    const s = k === 2 ? (i ? 1 : -1) : i - 1, back = i === 0 ? 0.45 * r() : 0;
    antler(g, r, ex - (ex - mx) * back, ey - (ey - my) * back, a1 + s * (0.36 + 0.28 * r()), len * (0.66 + 0.2 * r()), w * 0.64, depth - 1, dens, droop * 1.5);
  }
}
const lujiao: Tile = (g, r) => { antler(g, r, 0.5, 0.97, -Math.PI / 2 + (r() - 0.5) * 0.3, 0.28, 0.058, 3, 0.9); };
/** 蟹爪枝：往外探，梢头勾下来（老树） */
const xiezhao: Tile = (g, r) => { const s = r() < 0.5 ? -1 : 1; antler(g, r, 0.5 - s * 0.2, 0.9, -Math.PI / 2 + s * 0.5, 0.3, 0.058, 3, 0.9, s * 0.2); };
/** 冬柳：几条光的垂丝 */
const liuBare: Tile = (g, r) => {
  for (let i = 0; i < 6; i++) {
    const x = 0.12 + 0.152 * i + (r() - 0.5) * 0.08, sw = (r() - 0.5) * 0.14, y1 = 0.55 + 0.43 * r();
    stroke(g, [[x, 0], [x + sw * 0.3, y1 * 0.5], [x + sw, y1]], (t) => 0.026 * (1 - 0.55 * t), ink(0.75 + 0.25 * r()));
  }
};
/** 远树的一团叶：浓淡相破的大点 */
const far0: Tile = (g, r) => {
  for (let i = 0; i < 8; i++) { const a = r() * TAU, d = 0.24 * Math.sqrt(r()); blob(g, r, 0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d * 0.8, 0.13 + 0.08 * r(), ink(0.28 + 0.36 * r()), 5, 0.88); }
  for (let i = 0; i < 9; i++) { const a = r() * TAU, d = 0.3 * Math.sqrt(r()); blob(g, r, 0.5 + Math.cos(a) * d, 0.56 + Math.sin(a) * d * 0.7, 0.04 + 0.035 * r(), ink(0.7 + 0.3 * r()), 2); }
};
/** 远树：横点一层层叠上去（米点） */
const far1: Tile = (g, r) => {
  haze(g, 0.5, 0.5, 0.4, 0.4, 0.4, 0.34);
  for (let i = 0; i < 17; i++) {
    const y = 0.16 + 0.68 * r(), half = 0.1 + 0.3 * Math.sin(Math.PI * Math.min(1, (y - 0.1) / 0.8)), x = 0.5 + (r() - 0.5) * 2 * half, l = 0.16 + 0.12 * r(), d = 0.35 + 0.65 * r();
    bs(g, [[x - l / 2, y + (r() - 0.5) * 0.02], [x, y - 0.012], [x + l / 2, y + (r() - 0.5) * 0.02]], W.leaf(0.075 + 0.035 * r(), 0.5), d, d * 0.8);
  }
};
/** 寒林：干梢上分出七八枝，成一个疏疏的冠 */
const hanlin: Tile = (g, r) => {
  haze(g, 0.5, 0.42, 0.42, 0.4, 0.3, 0.3);
  for (let i = 0; i < 7; i++) { const u = i / 6 - 0.5; antler(g, r, 0.5 + u * 0.1, 0.97 - 0.1 * (1 - Math.abs(u) * 2), -Math.PI / 2 + u * 2.3 + (r() - 0.5) * 0.2, 0.25 + 0.1 * r(), 0.04, 2, 0.75 + 0.25 * r()); }
};
export const TREE = sheet(6, [
  ['jie0', jie0], ['jie1', jie1], ['jie2', jie2], ['jie3', jie1], ['pepper0', pepper], ['pepper1', pepper],
  ['hun0', hun], ['hun1', hun], ['sang0', sang], ['sang1', sang], ['huai0', huai0], ['huai1', huai1],
  ['taoLeaf0', taoLeaf], ['taoLeaf1', taoLeaf], ['taoYoung', taoYoung], ['liu0', liu0], ['liu1', liu1], ['liuTip', liuTip],
  ['lujiao0', lujiao], ['lujiao1', lujiao], ['xiezhao', xiezhao], ['liuBare0', liuBare], ['liuBare1', liuBare], ['far0', far0],
  ['far1', far1], ['far2', far0], ['hanlin0', hanlin], ['hanlin1', hanlin], ['huai2', huai0], ['hun2', hun],
]);

// ———————————————————————————— 常青：松针、竹叶 ————————————————————————————
/** 攒针：一把朝上张开的松针，根上一点浓墨 */
function fan(g: Ctx, r: Rng, cx: number, cy: number, rad: number, spread: number, dens: number) {
  haze(g, cx, cy - rad * 0.42, rad * 0.86, rad * 0.62, 0.5 * dens, 0.34);
  const n = 12 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) - 0.5, a = -Math.PI / 2 + u * spread + (r() - 0.5) * 0.1, l = rad * (0.78 + 0.22 * r()) * (1 - 0.25 * Math.abs(u) * r());
    const d = dens * (0.7 + 0.3 * r());
    bs(g, [[cx, cy], [cx + Math.cos(a) * l * 0.5, cy + Math.sin(a) * l * 0.5 - 0.01], [cx + Math.cos(a) * l, cy + Math.sin(a) * l]], W.nail(rad * 0.085, 0.8), Math.min(1, d * 1.2), d * 0.6);
  }
  blob(g, r, cx, cy - rad * 0.04, rad * 0.11, ink(Math.min(1, dens * 1.2)), 3, 0.7);
}
const zhen0: Tile = (g, r) => { fan(g, r, 0.5, 0.86, 0.66, 2.3 + 0.3 * r(), 0.85); };
const zhen1: Tile = (g, r) => { fan(g, r, 0.5, 0.78, 0.56, 2.9 + 0.2 * r(), 0.8); };
const zhen2: Tile = (g, r) => { fan(g, r, 0.3, 0.84, 0.44, 2.4, 0.7); fan(g, r, 0.68, 0.74, 0.48, 2.5, 0.95); };
/** 松盖：几把针排在一道横枝上，底下是平的 */
const zhenPad: Tile = (g, r) => {
  for (let i = 0; i < 4; i++) { const t = i / 3; fan(g, r, 0.16 + 0.68 * t + (r() - 0.5) * 0.05, 0.7 - 0.07 * Math.sin(Math.PI * t) + (r() - 0.5) * 0.04, 0.3 + 0.07 * r(), 2.5, 0.7 + 0.3 * r()); }
  bs(g, [[0.1, 0.73], [0.36, 0.69], [0.64, 0.69], [0.9, 0.73]], W.leaf(0.075, 0.45), 1, 0.9);
};
/** 松盖的底：横着的几笔浓墨，垂下几根短针 */
const zhenBelly: Tile = (g, r) => {
  haze(g, 0.5, 0.5, 0.42, 0.2, 0.7, 0.36);
  for (let i = 0; i < 4; i++) { const y = 0.42 + 0.06 * i + (r() - 0.5) * 0.03, x0 = 0.1 + 0.12 * r(), x1 = 0.9 - 0.12 * r(); bs(g, [[x0, y + 0.02], [(x0 + x1) / 2, y - 0.02], [x1, y + 0.02]], W.leaf(0.07 + 0.03 * r(), 0.45), 0.75 + 0.25 * r(), 0.9); }
  for (let i = 0; i < 9; i++) { const x = 0.14 + 0.72 * r(), a = Math.PI / 2 + (r() - 0.5) * 0.9, l = 0.1 + 0.08 * r(); bs(g, [[x, 0.56], [x + Math.cos(a) * l, 0.56 + Math.sin(a) * l]], W.nail(0.03), 0.9, 0.6); }
};
/** 竹叶的一笔：起笔按下去，中间肥，收笔拖出一个长尖 */
function zhuLeaf(g: Ctx, r: Rng, x: number, y: number, ang: number, len: number, wid: number, dens: number) {
  const b = (r() - 0.5) * 0.14;
  bs(g, [[x, y], [x + Math.cos(ang) * len * 0.5 - Math.sin(ang) * b * len, y + Math.sin(ang) * len * 0.5 + Math.cos(ang) * b * len], [x + Math.cos(ang) * len, y + Math.sin(ang) * len]], W.drop(wid, 0.3), Math.min(1, dens * 1.15), dens * 0.75);
}
/** 个字：三片往下（叶要窄长，不然像枫叶）。长短不齐，偶尔多出一片 */
function geGroup(g: Ctx, r: Rng, x: number, y: number, sc: number, dens: number, tilt = 0) {
  const n = 3 + (r() < 0.3 ? 1 : 0);
  for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5; zhuLeaf(g, r, x, y, Math.PI / 2 + tilt + u * (0.95 + 0.35 * r()) + (r() - 0.5) * 0.2, sc * (0.7 - 0.2 * Math.abs(u) * 2 * r() + 0.1 * r()), sc * (0.1 + 0.022 * r()), dens * (0.7 + 0.3 * r())); }
}
const zhu0: Tile = (g, r) => { haze(g, 0.5, 0.48, 0.3, 0.4, 0.5, 0.26); geGroup(g, r, 0.5, 0.06, 1.25, 0.85, (r() - 0.5) * 0.5); };
const zhu1: Tile = (g, r) => { haze(g, 0.5, 0.48, 0.4, 0.42, 0.5, 0.28); geGroup(g, r, 0.36, 0.05, 0.9, 0.6, 0.35); geGroup(g, r, 0.6, 0.26, 0.95, 0.95, -0.3); };
const zhu2: Tile = (g, r) => { haze(g, 0.5, 0.5, 0.42, 0.44, 0.5, 0.3); geGroup(g, r, 0.26, 0.2, 0.8, 0.55, 0.45); geGroup(g, r, 0.72, 0.05, 0.8, 0.75, -0.4); geGroup(g, r, 0.5, 0.34, 0.86, 1, (r() - 0.5) * 0.3); };
/** 偃叶：都往下垂着（雨里、梢头） */
const zhuDown: Tile = (g, r) => {
  haze(g, 0.5, 0.5, 0.34, 0.44, 0.5, 0.26);
  for (let i = 0; i < 5; i++) zhuLeaf(g, r, 0.3 + 0.1 * i + (r() - 0.5) * 0.06, 0.06 + 0.2 * r(), Math.PI / 2 + (i - 2) * 0.16 + (r() - 0.5) * 0.2, 0.5 + 0.3 * r(), 0.09 + 0.02 * r(), 0.55 + 0.45 * r());
};
/** 竹梢：一小段弯下来的梢，叶互生 */
const zhuTip: Tile = (g, r) => {
  const s = r() < 0.5 ? -1 : 1;
  const X = (t: number) => 0.5 - s * 0.3 + s * 0.6 * t, Y = (t: number) => 0.12 + 0.5 * t * t;
  stroke(g, [[X(0), Y(0)], [X(0.5), Y(0.5)], [X(1), Y(1)]], (t) => 0.022 * (1 - 0.5 * t), ink(0.9));
  for (let i = 0; i < 5; i++) { const t = 0.12 + 0.2 * i; zhuLeaf(g, r, X(t), Y(t), Math.PI / 2 + (i % 2 ? 1 : -1) * (0.3 + 0.35 * r()) + s * 0.3 * t, 0.3 + 0.1 * r(), 0.085 + 0.02 * r(), 0.6 + 0.4 * r()); }
};
/** 远竹：一团淡影，边上露几片叶尖 */
const zhuFar: Tile = (g, r) => {
  for (let i = 0; i < 6; i++) { const a = r() * TAU, d = 0.2 * Math.sqrt(r()); blob(g, r, 0.5 + Math.cos(a) * d, 0.44 + Math.sin(a) * d * 0.8, 0.13 + 0.07 * r(), ink(0.25 + 0.3 * r()), 4, 0.9); }
  for (let i = 0; i < 9; i++) { const x = 0.16 + 0.68 * r(), y = 0.3 + 0.36 * r(); zhuLeaf(g, r, x, y, Math.PI / 2 + (r() - 0.5) * 1.3, 0.2 + 0.1 * r(), 0.07 + 0.02 * r(), 0.5 + 0.4 * r()); }
};
export const EVER = sheet(4, [
  ['zhen0', zhen0], ['zhen1', zhen1], ['zhen2', zhen2], ['zhen3', zhen0],
  ['zhenPad', zhenPad], ['zhenBelly', zhenBelly], ['zhen4', zhen1], ['zhenPad2', zhenPad],
  ['zhu0', zhu0], ['zhu1', zhu1], ['zhu2', zhu2], ['zhu3', zhuDown],
  ['zhu4', zhu1], ['zhuTip0', zhuTip], ['zhuTip1', zhuTip], ['zhuFar', zhuFar],
]);
