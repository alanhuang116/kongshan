/**
 * 殿里的一套：供桌（五供、供果、清水）、拜垫、蒲团、木鱼、大磬、签筒。
 * 都取素的：黑漆、暗金的铜、白瓷青瓷、赭黄的布。
 */
import * as THREE from 'three';
import { M, V, box, colorize, cylUp, grid, merge, prism, shade, sphere, tint } from '../core/geo';
import { enhance, variant, type Mats } from '../core/mats';
import { canvas, canvasTex } from '../core/tex';
import { clamp, mulberry32, smooth } from '../core/rng';
import type { Quality } from '../core/World';
import { candle } from './censer';
import { lowTable, slab } from './furniture';
import { Builder, blob, curve3, disc, dyed, finish, isLow, type P2, part, pillow, pmats, prof, rib, ring, sg, spl, table, tube, turn } from './kit';

const LIN = (hex: number) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b] as [number, number, number]; };

// —— 供桌上的小件 ——
/** 案上的小铜炉：三足、双耳，径 2r。底在 y=0。返回 { ashY, ashR } */
function tableCenser(b: Builder, q: Quality, r = 0.13): { ashY: number; ashR: number } {
  const n = sg(q, 36), f = r * 0.42, k = r / 0.13;
  b.add('brass', turn(prof(
    spl([[0.001, f], [r * 0.4, f + r * 0.02], [r * 0.82, f + r * 0.2], [r, f + r * 0.52], [r * 0.99, f + r * 0.74], [r * 0.9, f + r * 0.95], [r * 0.88, f + r * 1.03], [r * 0.97, f + r * 1.13]], 18),
    [[r * 0.97, f + r * 1.13], [r * 0.965, f + r * 1.16], [r * 0.87, f + r * 1.16], [r * 0.86, f + r * 1.13]],
    [[r * 0.86, f + r * 1.13], [r * 0.85, f + r * 1.02], [r * 0.87, f + r * 0.95]],
  ), n, { tile: 0.9 }));
  for (let i = 0; i < 3; i++) {
    b.push(M.mul(M.ry((i * Math.PI * 2) / 3), M.t(0, 0, r * 0.74), M.rx(-0.2)));
    b.add('brass', turn(spl([[0.001, 0], [0.012 * k, 0], [0.017 * k, 0.004 * k], [0.013 * k, 0.02 * k], [0.011 * k, 0.04 * k], [0.02 * k, 0.062 * k], [0.03 * k, 0.078 * k]], 10), sg(q, 12)));
    b.pop();
  }
  for (const s of [1, -1]) b.add('brass', ring(0.028 * k, 0.0075 * k, sg(q, 16), 8, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(s * r * 0.915, f + r * 1.15, 0));
  const ay = f + r * 0.98;
  b.add('ash', disc(r * 0.86, ay, sg(q, 24), 0.006 * k));
  return { ashY: ay + 0.005 * k, ashR: r * 0.6 };
}
/** 案上的烛台（连烛）。返回烛芯顶端的高度 */
function candlestick(b: Builder, q: Quality, h = 0.3): number {
  const k = h / 0.3;
  b.add('brass', turn(prof(
    spl([[0.001, 0], [0.085 * k, 0], [0.09 * k, 0.008 * k], [0.07 * k, 0.022 * k], [0.03 * k, 0.045 * k], [0.016 * k, 0.085 * k]], 9),
    [[0.016 * k, 0.085 * k], [0.014 * k, 0.13 * k]], rib(0.014 * k, 0.142 * k, 0.02 * k, 0.009 * k), [[0.014 * k, 0.155 * k], [0.013 * k, 0.2 * k]],
    spl([[0.013 * k, 0.2 * k], [0.02 * k, 0.222 * k], [0.05 * k, 0.236 * k], [0.072 * k, 0.244 * k], [0.078 * k, 0.254 * k]], 8),
    [[0.078 * k, 0.254 * k], [0.075 * k, 0.26 * k], [0.05 * k, 0.252 * k], [0.022 * k, 0.256 * k]],
    spl([[0.022 * k, 0.256 * k], [0.018 * k, 0.275 * k], [0.03 * k, 0.293 * k], [0.034 * k, 0.3 * k]], 6),
    [[0.034 * k, 0.3 * k], [0.032 * k, 0.304 * k], [0.001, 0.302 * k]],
  ), sg(q, 22), { tile: 0.9 }));
  b.push(M.t(0, 0.302 * k, 0));
  const top = candle(b, 0.022 * k, 0.2 * k, 'wax', sg(q, 16));
  b.pop();
  return 0.302 * k + top;
}
/** 花瓶（玉壶春式的白瓷瓶），高 h。底在 y=0 */
function vase(b: Builder, q: Quality, h = 0.34, mat = 'porcelain') {
  const k = h / 0.34;
  b.add(mat, turn(prof(
    [[0.001, 0.004 * k], [0.04 * k, 0.004 * k], [0.046 * k, 0], [0.05 * k, 0.004 * k]],
    spl([[0.05 * k, 0.004 * k], [0.048 * k, 0.018 * k], [0.07 * k, 0.05 * k], [0.092 * k, 0.1 * k], [0.086 * k, 0.15 * k], [0.052 * k, 0.21 * k], [0.03 * k, 0.262 * k], [0.027 * k, 0.295 * k], [0.036 * k, 0.325 * k], [0.05 * k, 0.34 * k]], 26),
    [[0.05 * k, 0.34 * k], [0.047 * k, 0.341 * k], [0.033 * k, 0.322 * k], [0.024 * k, 0.29 * k]],
  ), sg(q, 32)));
}
/** 瓶里的莲：一朵半开的花、一个莲蓬、一片卷着的叶，各有各的姿态。茎从瓶口（原点）出来 */
function lotusSpray(b: Builder, q: Quality, flip = 1, seed = 1) {
  const r = mulberry32(seed), s = flip;
  const stem = (pts: Array<[number, number, number]>) => { b.add('plant', tint(tube(curve3(pts, 9), 0.0036, 5), 0.2, 0.3, 0.14)); return new THREE.Vector3(...pts[pts.length - 1]); };
  const pink = LIN(0xe9b7c0), white = LIN(0xf6eee8), deep = LIN(0xc56f8a);
  // 花
  const f = stem([[0, -0.1, 0], [0.004 * s, 0.1, 0.004], [0.03 * s, 0.24, 0.012], [0.05 * s, 0.34, 0.02]]);
  const petal = (len: number, wid: number, open: number, twist: number) => {
    const rows: THREE.Vector3[][] = [];
    for (let i = 0; i <= 4; i++) {
      const row: THREE.Vector3[] = [], t = i / 4;
      for (let j = 0; j <= 4; j++) {
        const u = j / 4 - 0.5, w = wid * Math.sin(Math.PI * (0.12 + 0.88 * t) * 0.92) * (1 - 0.3 * t * t);
        const out = Math.sin(t * 1.5) * len * open, up = t * len * Math.cos(open * 0.9);
        row.push(V(u * w, up, out - 0.02 * (4 * u * u) * (1 - t * 0.4) + 0.018));
      }
      rows.push(row);
    }
    return colorize(grid(rows, (i, j) => [j / 4, i / 4]), (_x, y, _z, _nx, _ny, _nz, o) => {
      const t = clamp(y / len), c = t > 0.72 ? deep : pink;
      const kk = smooth(0.0, 0.6, t);
      o[0] = white[0] + (c[0] - white[0]) * kk; o[1] = white[1] + (c[1] - white[1]) * kk; o[2] = white[2] + (c[2] - white[2]) * kk;
    }).rotateY(twist);
  };
  b.push(M.mul(M.t(f.x, f.y, f.z), M.rz(-0.16 * s), M.rx(0.1)));
  b.add('plant', tint(turn([[0.001, 0], [0.012, 0.002], [0.016, 0.014], [0.012, 0.024], [0.001, 0.026]], 10), 0.62, 0.6, 0.28));
  const np = isLow(q) ? 6 : 8;
  for (let i = 0; i < np; i++) b.add('plant', petal(0.075, 0.05, 0.42, (i / np) * Math.PI * 2));
  for (let i = 0; i < np - 2; i++) b.add('plant', petal(0.066, 0.042, 0.2, ((i + 0.5) / (np - 2)) * Math.PI * 2));
  b.pop();
  // 莲蓬
  const p = stem([[0, -0.1, 0], [-0.008 * s, 0.08, -0.004], [-0.04 * s, 0.17, -0.014], [-0.062 * s, 0.235, -0.022]]);
  b.push(M.mul(M.t(p.x, p.y, p.z), M.rz(0.36 * s), M.rx(-0.1)));
  b.add('plant', tint(turn(prof(spl([[0.003, 0], [0.012, 0.012], [0.024, 0.03], [0.03, 0.042]], 6), [[0.03, 0.042], [0.028, 0.046], [0.001, 0.047]]), 12), 0.34, 0.36, 0.17));
  b.pop();
  // 叶：一片浅盘，边上起伏
  const l = stem([[0, -0.1, 0], [0.0, 0.05, 0.012], [-0.012 * s, 0.12, 0.05], [-0.02 * s, 0.165, 0.085]]);
  const rows: THREE.Vector3[][] = [], rs = isLow(q) ? 10 : 16;
  for (let i = 0; i <= 3; i++) {
    const row: THREE.Vector3[] = [], t = i / 3;
    for (let j = 0; j <= rs; j++) {
      const a = (j / rs) * Math.PI * 2, rad = 0.078 * t * (1 + 0.05 * Math.sin(a * 5 + r() * 0.2));
      row.push(V(Math.cos(a) * rad, 0.03 * t * t + 0.008 * t * Math.sin(a * 4 + 1), Math.sin(a) * rad));
    }
    rows.push(row);
  }
  b.push(M.mul(M.t(l.x, l.y, l.z), M.rx(0.7), M.rz(0.25 * s)));
  b.add('plant', colorize(grid(rows, (i, j) => [j / rs, i / 3], true), (x, _y, z, _nx, _ny, _nz, o) => { const t = Math.hypot(x, z) / 0.078; o[0] = 0.1 + 0.05 * t; o[1] = 0.2 + 0.07 * t; o[2] = 0.1 + 0.02 * t; }));
  b.pop();
}
/** 高足盘上叠着的供果。kind：0 橘、1 桃、2 苹果 */
function fruitPlate(b: Builder, q: Quality, kind: number) {
  b.add('celadon', turn(prof(
    spl([[0.001, 0], [0.05, 0], [0.054, 0.006], [0.03, 0.022], [0.018, 0.045], [0.02, 0.07], [0.06, 0.088], [0.12, 0.1], [0.134, 0.108]], 16),
    [[0.134, 0.108], [0.131, 0.112], [0.1, 0.104], [0.04, 0.098], [0.001, 0.097]],
  ), sg(q, 32)));
  const cols = [[LIN(0xe08a1e), LIN(0xf0b23c)], [LIN(0xe8a39a), LIN(0xf3dcae)], [LIN(0x9c1f1d), LIN(0xc9502e)]][kind % 3];
  const one = (x: number, y: number, z: number, ry: number) => {
    const rf = 0.04;
    // 橘扁、桃带尖、苹果上下有窝
    const g = blob(sg(q, 14), sg(q, 10), (v) => {
      const yy = v.y, sq = kind === 0 ? 0.84 : kind === 1 ? 1 + 0.16 * Math.max(0, yy) ** 3 : 0.92 - 0.1 * yy * yy * yy * yy;
      v.multiplyScalar(rf); v.y *= sq;
    });
    colorize(g, (_x, yy, zz, _nx, _ny, _nz, o) => { const t = clamp(0.5 + yy / (rf * 2) + zz * 3); const a = cols[0], c = cols[1]; o[0] = a[0] + (c[0] - a[0]) * t; o[1] = a[1] + (c[1] - a[1]) * t; o[2] = a[2] + (c[2] - a[2]) * t; });
    b.add('fruit', g.rotateY(ry).translate(x, y, z));
    b.add('plant', tint(cylUp(0.0018, 0.0022, 0.008, 4), 0.2, 0.16, 0.08).translate(x, y + rf * (kind === 0 ? 0.8 : 0.92), z));
  };
  const y0 = 0.1 + 0.036, rr = 0.047;
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5 + kind; one(Math.cos(a) * rr, y0, Math.sin(a) * rr, a * 3); }
  one(0, y0 + 0.058, 0, kind);
}
/** 清水盏 */
function waterCup(b: Builder, q: Quality) {
  b.add('porcelain', turn(prof(
    spl([[0.001, 0.003], [0.016, 0.003], [0.019, 0], [0.021, 0.003], [0.024, 0.012], [0.034, 0.03], [0.038, 0.042]], 12),
    [[0.038, 0.042], [0.0365, 0.043], [0.032, 0.03], [0.02, 0.012], [0.001, 0.009]],
  ), sg(q, 24)));
  b.add('water', disc(0.0338, 0.036, sg(q, 20)));
}

/** 供桌一套：黑漆长案 3.6 × 0.95、高 1.05，正面垂桌围；案上五供、三盘果、三盏清水 */
export function altarTable(mats: Mats, q: Quality): THREE.Group {
  const b = new Builder(), W = 3.6, D = 0.95, H = 1.05;
  lowTable(b, W, D, H, 'lacquer', { top: 0.07, leg: 0.13, waist: 0.05, apron: 0.16, over: 0.05 });
  // 桌围：从案沿下垂到离地一掌，有几道软褶；上缘一道织金、下面一道暗红
  const cw = W - 0.14, cy1 = H - 0.075, cy0 = 0.07, cz = D / 2 - 0.035;
  const nxs = isLow(q) ? 36 : 72, rows: THREE.Vector3[][] = [];
  for (let i = 0; i <= nxs; i++) {
    const row: THREE.Vector3[] = [], x = -cw / 2 + (cw * i) / nxs;
    for (let j = 0; j <= 6; j++) {
      const t = j / 6, y = cy1 + (cy0 - cy1) * t;
      const fold = (Math.sin(x * 8.5) * 0.62 + Math.sin(x * 21 + 1.3) * 0.38) * 0.026 * Math.pow(t, 1.5) + 0.006 * t;
      row.push(V(x, y + (j === 6 ? 0.004 * Math.sin(x * 9.5 + 1) : 0), cz + fold));
    }
    rows.push(row);
  }
  b.add('clothYellow', shade(grid(rows, (_i, _j, p) => [p.x, p.y], true), (_x, y, z) => (0.82 + 0.18 * clamp((y - cy0) / 0.5)) * (0.86 + 0.14 * clamp((z - cz) / 0.02 + 0.5))));
  b.add('brocade', box(cw, 0.085, 0.006, 'x').translate(0, cy1 - 0.045, cz + 0.004));
  b.add('clothRed', box(cw, 0.03, 0.005, 'x').translate(0, cy1 - 0.104, cz + 0.0035));
  // 案上
  const flames: THREE.Vector3[] = [];
  b.push(M.t(0, H, 0.06));
  const cs = tableCenser(b, q, 0.135);
  b.pop();
  for (const s of [-1, 1]) {
    b.push(M.t(s * 0.72, H, 0.02));
    flames.push(new THREE.Vector3(s * 0.72, H + candlestick(b, q, 0.34), 0.02));
    b.pop();
    b.push(M.t(s * 1.42, H, -0.02));
    vase(b, q, 0.36);
    b.push(M.t(0, 0.34, 0)); lotusSpray(b, q, -s, 11 + s); b.pop();
    b.pop();
  }
  const fx = [-1.06, 0, 1.06];
  for (let i = 0; i < 3; i++) { b.push(M.t(fx[i], H, i === 1 ? -0.26 : -0.04)); fruitPlate(b, q, i); b.pop(); }
  for (let i = -1; i <= 1; i++) { b.push(M.t(i * 0.13, H, 0.34)); waterCup(b, q); b.pop(); }
  const g = finish(b, mats, q, 'altarTable');
  g.userData = { top: H, flames: flames.sort((a, c) => a.x - c.x), censer: { pos: new THREE.Vector3(0, H, 0.06), ashY: H + cs.ashY, ashR: cs.ashR } };
  return g;
}

/** 拜垫：0.78 × 0.52 × 0.17，赭黄布面，上下各一道包边，中间微陷 */
export function kneeler(mats: Mats, q: Quality): THREE.Group {
  const b = new Builder(), w = 0.78, d = 0.52, h = 0.17, e1 = 0.3, e2 = 0.42;
  b.add('clothYellow', shade(pillow(w, h, d, e1, e2, 0.02, sg(q, 40), sg(q, 16)).translate(0, h / 2, 0), (_x, y) => 0.82 + 0.18 * clamp(y / h)));
  const sp = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (const lat of [0.62, -0.62]) {
    const cl = sp(Math.cos(lat), e2), y = h / 2 + (h / 2) * sp(Math.sin(lat), e2), pts: THREE.Vector3[] = [];
    const n = sg(q, 56);
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(V((w / 2) * cl * sp(Math.cos(a), e1) * 1.004, y, (d / 2) * cl * sp(Math.sin(a), e1) * 1.004)); }
    b.add('clothBrown', tube(pts, 0.0055, 6));
  }
  return finish(b, mats, q, 'kneeler');
}

/** 蒲团：草编的圆垫，径 0.62、高 0.14；一圈圈草辫盘出来的 */
export function zafu(mats: Mats, q: Quality): THREE.Group {
  const b = new Builder(), R = 0.31, h = 0.14, rr = 0.05, cw = 0.0235, bh = 0.0055;
  // 底线：自下而上走下圆角、侧面、上圆角、顶面到中心；再沿法线鼓出一圈圈草辫
  const step = cw / (isLow(q) ? 3 : 5), q4 = (Math.PI / 2) * rr;
  const la = q4, lb = h - rr * 2, lc = q4, ld = R - rr, total = la + lb + lc + ld;
  const at = (s: number) => {
    if (s < la) { const a = -Math.PI / 2 + (s / la) * (Math.PI / 2); return { x: R - rr + rr * Math.cos(a), y: rr + rr * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) }; }
    if (s < la + lb) return { x: R, y: rr + (s - la), nx: 1, ny: 0 };
    if (s < la + lb + lc) { const a = ((s - la - lb) / lc) * (Math.PI / 2); return { x: R - rr + rr * Math.cos(a), y: h - rr + rr * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) }; }
    return { x: R - rr - (s - la - lb - lc), y: h, nx: 0, ny: 1 };
  };
  const vs: number[] = [], pr: P2[] = [];
  for (let s = cw * 0.5; s <= total + 1e-6; s += step) {
    const p = at(Math.min(s, total));
    const ph = (s / cw) % 1, bump = bh * Math.pow(Math.sin(ph * Math.PI), 0.7);
    const dip = p.ny > 0.99 ? 0.012 * Math.exp(-((p.x / (R * 0.55)) ** 2)) : 0;
    pr.push([Math.max(0.0005, p.x + p.nx * bump), Math.max(0, p.y + p.ny * bump - dip)]);
    vs.push((s / cw) * 0.025);
  }
  pr.push([0.0005, h - 0.012 + bh * 0.6]); vs.push((total / cw) * 0.025 + 0.012);
  b.add('straw', shade(turn(pr, sg(q, 44), { tile: 0.05, vs }), (_x, y) => 0.8 + 0.2 * clamp(y / h)));
  return finish(b, mats, q, 'zafu');
}
/** 蒲团下的方垫：0.8 见方的薄垫，深青灰的毡 */
export function mat(mats: Mats, q: Quality): THREE.Group {
  const b = new Builder();
  b.add('felt', slab(0.8, 0.045, 0.8, 0.014, 0.05).translate(0, 0.045, 0));
  void q;
  return finish(b, mats, q, 'mat');
}

// —— 木鱼 ——
const FISH = { A: 0.23, B: 0.205, H: 0.165, th: -0.2, del: 0.05, phm: 1.34, rho: 0.15 };
/** 鱼身上一点：纬 th、经 ph（0 朝前）。返回位置（底在 y=0） */
function fishPoint(th: number, ph: number, out = new THREE.Vector3()): THREE.Vector3 {
  const c = Math.pow(Math.max(0, Math.cos(th)), 0.8), s = Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), 0.92);
  const pear = 1 + 0.05 * Math.sin(th);
  let y = FISH.H + FISH.H * s;
  if (y < 0.02) y = 0.02 * Math.pow(Math.max(0, y) / 0.02, 2.2);
  return out.set(FISH.A * c * pear * Math.sin(ph), y, FISH.B * c * pear * Math.cos(ph));
}
/** 鱼口（一道横缝，两头各一个圆孔）在 (th, ph) 处开了几成：0 实 … 1 空 */
function fishMouth(th: number, ph: number, widen = 1): number {
  const { th: t0, del, phm, rho } = FISH, a = Math.abs(ph);
  const slit = (1 - smooth(del * 0.6 * widen, del * 1.3 * widen, Math.abs(th - t0))) * (1 - smooth(phm - 0.03, phm + 0.02, a));
  const d = Math.hypot(th - t0, (a - phm) * Math.cos(t0));
  return Math.max(slit, 1 - smooth(rho * 0.74 * widen, rho * 1.12 * widen, d));
}
function fishArt(size: number): { map: THREE.Texture; orm: THREE.Texture; bump: THREE.Texture } {
  const W = size, Hh = size / 2;
  const X = (ph: number) => ((ph + Math.PI) / (Math.PI * 2)) * W, Y = (th: number) => (1 - (th + Math.PI / 2) / Math.PI) * Hh;
  const draw = (g: CanvasRenderingContext2D, stroke: string, lw: number, mouth = '') => {
    g.strokeStyle = stroke; g.lineCap = 'round'; g.lineJoin = 'round';
    const { th: t0, del, phm, rho } = FISH;
    const outline = (off: number, width: number, fill = false) => {
      // 沿着鱼口（横缝 + 两端圆孔）外廓走一圈
      g.lineWidth = width; g.beginPath();
      const k = Math.cos(t0), r = rho + off, hs = del + off;
      const a0 = Math.asin(Math.min(0.999, hs / r));
      g.moveTo(X(-phm + (r * Math.cos(a0)) / k), Y(t0 + hs));
      g.lineTo(X(phm - (r * Math.cos(a0)) / k), Y(t0 + hs));
      for (let i = 0; i <= 40; i++) { const a = Math.PI - a0 - ((Math.PI * 2 - 2 * a0) * i) / 40; g.lineTo(X(phm + (r * Math.cos(a)) / k), Y(t0 + r * Math.sin(a))); }
      g.lineTo(X(-phm + (r * Math.cos(a0)) / k), Y(t0 - hs));
      for (let i = 0; i <= 40; i++) { const a = -a0 - ((Math.PI * 2 - 2 * a0) * i) / 40; g.lineTo(X(-phm + (r * Math.cos(a)) / k), Y(t0 + r * Math.sin(a))); }
      g.closePath();
      if (fill) g.fill(); else g.stroke();
    };
    // 鱼口：凹进去的地方（连同斜下去的口沿）整个涂黑；口沿外一粗一细两道金线
    if (mouth) { g.fillStyle = mouth; outline(0.022, 0, true); }
    outline(0.046, lw * 1.5); outline(0.082, lw * 0.8);
    // 鳞：两肋各几排，一排压一排
    const sw = 0.2, sh = 0.13;
    g.lineWidth = lw;
    for (let row = 0; row < 6; row++) {
      const th = 0.06 + row * sh;
      for (let i = -20; i <= 20; i++) {
        const ph = (i + (row % 2) * 0.5) * sw;
        const a = Math.abs(ph);
        if (a < 0.62 - row * 0.04 || a > 2.75) continue;                 // 额头留素；背后留一条
        if (th < 0.3 && Math.hypot(th + 0.06 - t0, (a - phm) * 0.9) < rho + 0.2) continue; // 让开圆孔
        const stretch = 1 / Math.max(0.35, Math.pow(Math.cos(th), 0.8));
        g.beginPath();
        for (let q = 0; q <= 14; q++) { const t = (q / 14) * Math.PI; g.lineTo(X(ph + Math.cos(t) * sw * 0.5 * stretch * (1 - row * 0.035)), Y(th + Math.sin(t) * sh * 0.95 - sh * 0.1)); }
        g.stroke();
      }
    }
    // 顶上一圈（提梁根部）
    g.lineWidth = lw * 1.2;
    for (const th of [0.86, 0.93]) { g.beginPath(); g.moveTo(0, Y(th)); g.lineTo(W, Y(th)); g.stroke(); }
  };
  const [c1, g1] = canvas(W, Hh), [c2, g2] = canvas(W, Hh), [c3, g3] = canvas(W, Hh);
  // 颜色：朱褐的漆，额头敲出来的一块略浅
  g1.fillStyle = '#4c1811'; g1.fillRect(0, 0, W, Hh);
  const worn = g1.createRadialGradient(X(0), Y(0.42), 2, X(0), Y(0.42), W * 0.07);
  worn.addColorStop(0, 'rgba(150,84,52,0.55)'); worn.addColorStop(1, 'rgba(150,84,52,0)');
  g1.fillStyle = worn; g1.fillRect(0, 0, W, Hh);
  draw(g1, '#d2a857', W / 340, '#030202');
  // 粗糙（G）与金属（B）：漆面亮、金线是金属、敲旧处发乌
  g2.fillStyle = 'rgb(255,74,0)'; g2.fillRect(0, 0, W, Hh);
  const w2 = g2.createRadialGradient(X(0), Y(0.42), 2, X(0), Y(0.42), W * 0.07);
  w2.addColorStop(0, 'rgba(255,150,0,0.8)'); w2.addColorStop(1, 'rgba(255,150,0,0)');
  g2.fillStyle = w2; g2.fillRect(0, 0, W, Hh);
  draw(g2, 'rgb(255,84,255)', W / 340, 'rgb(0,255,0)');
  // 高度：线是刻下去的
  g3.fillStyle = '#808080'; g3.fillRect(0, 0, W, Hh);
  g3.shadowColor = '#303030'; g3.shadowBlur = W / 500;
  draw(g3, '#303030', W / 340);
  const map = canvasTex(c1), orm = canvasTex(c2, false), bump = canvasTex(c3, false);
  for (const t of [map, orm, bump]) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }
  return { map, orm, bump };
}
let fishMat: THREE.MeshStandardMaterial | null = null;
function fishBody(q: Quality): THREE.Mesh {
  // 网格：经纬网，在鱼口与两个圆孔附近加密
  const low = isLow(q), ths = new Set<number>(), phs = new Set<number>();
  const nT = low ? 20 : 34, nP = low ? 40 : 64, { th: t0, phm, rho } = FISH, kk = Math.cos(t0);
  for (let i = 0; i <= nT; i++) ths.add(+(-Math.PI / 2 + (Math.PI * i) / nT).toFixed(4));
  for (let i = 0; i <= nP; i++) phs.add(+(-Math.PI + (Math.PI * 2 * i) / nP).toFixed(4));
  const fine = low ? 0.045 : 0.02;
  for (let t = t0 - rho * 1.5; t <= t0 + rho * 1.5; t += fine) ths.add(+t.toFixed(4));
  for (const s of [-1, 1]) for (let p = phm - (rho * 1.5) / kk; p <= phm + (rho * 1.5) / kk; p += fine / kk) phs.add(+(s * p).toFixed(4));
  const T = [...ths].sort((a, c) => a - c).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 0.006);
  const Pp = [...phs].sort((a, c) => a - c).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 0.006);
  T[0] = -Math.PI / 2; T[T.length - 1] = Math.PI / 2; Pp[0] = -Math.PI; Pp[Pp.length - 1] = Math.PI;
  const nt = T.length, np = Pp.length;
  const pos = new Float32Array(nt * np * 3), uv = new Float32Array(nt * np * 2), col = new Float32Array(nt * np * 3), idx: number[] = [];
  const p = new THREE.Vector3(), pa = new THREE.Vector3(), pb = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < nt; i++) for (let j = 0; j < np; j++) {
    const th = T[i], ph = Pp[j], k = i * np + j;
    fishPoint(th, ph, p);
    // 法线（解析地取两个切向的叉积）
    fishPoint(Math.min(Math.PI / 2 - 1e-3, th + 0.01), ph, pa).sub(fishPoint(Math.max(-Math.PI / 2 + 1e-3, th - 0.01), ph, pb));
    fishPoint(th, ph + 0.01, pb).sub(fishPoint(th, ph - 0.01, nn));
    nn.crossVectors(pb, pa).normalize();
    if (Math.abs(th) > Math.PI / 2 - 0.02) nn.set(0, Math.sign(th), 0);
    const m = fishMouth(th, ph), wide = fishMouth(th, ph, 1.7);
    const lip = wide * (1 - m) * 0.0045;
    p.addScaledVector(nn, lip - 0.04 * m);
    pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
    uv[k * 2] = (ph + Math.PI) / (Math.PI * 2); uv[k * 2 + 1] = (th + Math.PI / 2) / Math.PI;
    const dk = 1 - 0.6 * smooth(0.4, 0.95, m), base = 0.86 + 0.14 * clamp(p.y / 0.12);
    col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = dk * base;
  }
  for (let i = 0; i < nt - 1; i++) for (let j = 0; j < np - 1; j++) {
    const a = i * np + j, c = a + 1, d = a + np, e = d + 1;
    idx.push(a, e, d, a, c, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nr = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < nt; i++) {
    const a = i * np, c = i * np + np - 1;
    const x = nr.getX(a) + nr.getX(c), y = nr.getY(a) + nr.getY(c), z = nr.getZ(a) + nr.getZ(c), l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(a, x / l, y / l, z / l); nr.setXYZ(c, x / l, y / l, z / l);
  }
  if (!fishMat) {
    const art = fishArt(low ? 512 : 1024);
    const P = low ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
    fishMat = enhance(new P({ map: art.map, roughnessMap: art.orm, metalnessMap: art.orm, roughness: 1, metalness: 1, bumpMap: art.bump, bumpScale: 1.6, vertexColors: true,
      ...(low ? {} : { clearcoat: 0.5, clearcoatRoughness: 0.24, clearcoatMap: art.orm }) } as THREE.MeshStandardMaterialParameters));
  }
  return part(g, fishMat, 'fishBody');
}

/** 木鱼一套：团鱼形的大木鱼（宽 0.46）卧在一圈绣垫上，下面一张小方几；槌横在几上右侧。stand=false 时不要几 */
export function muyu(mats: Mats, q: Quality, stand = true): THREE.Group {
  const grp = new THREE.Group(), T = table(mats, q), b = new Builder();
  grp.name = 'muyu';
  const top = stand ? lowTable(b, 0.6, 0.6, 0.45, 'lacquer') : 0;
  // 绣垫：一圈布垫，上下两道织金的线
  b.add('clothYellow', ring(0.15, 0.04, sg(q, 44), sg(q, 12)).scale(1, 0.8, 1).translate(0, top + 0.032, 0));
  for (const [rr, y] of [[0.174, 0.054], [0.126, 0.054]] as Array<[number, number]>) b.add('clothBrown', ring(rr, 0.0035, sg(q, 44), 5).translate(0, top + y, 0));
  grp.add(b.build(T, { name: 'muyuStand' }));
  // 鱼
  const fish = new THREE.Group();
  fish.name = 'fish';
  fish.position.set(0, top + 0.03, 0);
  fish.add(fishBody(q));
  const hb = new Builder(), lac = 'fishLac';
  // 提梁：两条鱼首自两肩抬起，在顶上衔一颗珠
  for (const s of [-1, 1]) {
    const path = curve3([[s * 0.128, 0.27, -0.02], [s * 0.114, 0.325, -0.022], [s * 0.074, 0.364, -0.024], [s * 0.012, 0.378, -0.025]], 12);
    hb.add(lac, tube(path, (t) => 0.037 - 0.009 * t + 0.007 * Math.exp(-((t - 0.8) ** 2) / 0.014), sg(q, 12), true));
  }
  hb.add('gilt', sphere(0.03, sg(q, 16), sg(q, 12)).translate(0, 0.381, -0.025));
  const lacM = variant(mats.lacquerRed, { color: 0x4c1811 });
  fish.add(hb.build(new Proxy(T, { get: (t, k: string) => (k === lac ? lacM : t[k]) }), { name: 'fishHandle' }));
  grp.add(fish);
  // 槌：杆、布包的槌头、束口的一道金线
  const mallet = new THREE.Group();
  mallet.name = 'mallet';
  mallet.add(part(dyed([
    [turn(spl([[0.001, 0], [0.008, 0.002], [0.0095, 0.012], [0.007, 0.03], [0.0062, 0.2], [0.0058, 0.29]], 12), sg(q, 10)), 0x6a1a14],
    [sphere(1, sg(q, 14), sg(q, 12)).scale(0.027, 0.045, 0.027).translate(0, 0.325, 0), 0xb58238],
    [ring(0.012, 0.003, sg(q, 12), 5).translate(0, 0.287, 0), 0xcfa94e],
  ]), pmats(mats, q).tool, 'malletMesh'));
  // 横放：握端朝外（+z），槌头朝里
  mallet.position.set(0.245, top + 0.0095, 0.215);
  mallet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.02, 0.055, -1).normalize());
  grp.add(mallet);
  const sp = fishPoint(0.5, 0).add(fish.position);
  grp.userData = { fish, mallet, strike: sp, top: top + 0.03 + FISH.H * 2, handleTop: top + 0.03 + 0.411 };
  return grp;
}

/** 大磬一套：钵形铜磬（口径 0.5、高 0.34）坐在布垫上，下面一座矮架；磬槌搁在架上。stand=false 时不要架 */
export function qing(mats: Mats, q: Quality, stand = true): THREE.Group {
  const grp = new THREE.Group(), T = table(mats, q), b = new Builder();
  grp.name = 'qing';
  const top = stand ? lowTable(b, 0.66, 0.66, 0.34, 'lacquer') : 0;
  b.add('clothYellow', ring(0.125, 0.04, sg(q, 40), sg(q, 12)).scale(1, 0.8, 1).translate(0, top + 0.032, 0));
  b.add('brocade', ring(0.15, 0.0035, sg(q, 40), 5).translate(0, top + 0.054, 0));
  grp.add(b.build(T, { name: 'qingStand' }));
  // 磬：钵形，口沿略收，沿下两道细弦纹；壁有厚度
  const bowl = new THREE.Group(), bb = new Builder(), H = 0.34;
  bowl.name = 'bowl';
  bb.add('brass', turn(prof(
    spl([[0.001, 0], [0.07, 0.002], [0.15, 0.03], [0.215, 0.09], [0.252, 0.17], [0.261, 0.24], [0.258, 0.275]], 22),
    rib(0.2575, 0.285, 0.012, 0.0035), [[0.2565, 0.293], [0.2555, 0.3]], rib(0.255, 0.307, 0.012, 0.0035),
    spl([[0.254, 0.314], [0.251, 0.33], [0.2505, H - 0.004], [0.246, H]], 5),
    [[0.246, H], [0.238, H - 0.001], [0.233, H - 0.008]],
    spl([[0.233, H - 0.008], [0.243, 0.24], [0.236, 0.17], [0.2, 0.095], [0.14, 0.04], [0.06, 0.016], [0.001, 0.014]], 18),
  ), sg(q, 56), { tile: 0.9 }));
  bowl.add(bb.build(T, { name: 'bowlMesh' }));
  bowl.position.set(0, top + 0.026, 0);
  grp.add(bowl);
  // 磬槌：木柄，头上裹了布
  const striker = new THREE.Group();
  striker.name = 'striker';
  striker.add(part(dyed([
    [turn(spl([[0.001, 0], [0.009, 0.002], [0.01, 0.02], [0.0085, 0.06], [0.009, 0.3]], 10), sg(q, 10)), 0x9a7d5c],
    [turn(prof(spl([[0.009, 0.285], [0.02, 0.295], [0.0215, 0.34], [0.021, 0.385], [0.012, 0.4], [0.001, 0.402]], 12)), sg(q, 12)), 0x5b3d2b],
    [ring(0.0125, 0.003, sg(q, 12), 5).translate(0, 0.29, 0), 0xcfa94e],
  ]), pmats(mats, q).tool, 'strikerMesh'));
  striker.position.set(0.285, top + 0.0105, 0.2);
  striker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.05, 0.028, -1).normalize());
  grp.add(striker);
  // strike：口沿外侧、右前方的一点
  grp.userData = { bowl, striker, strike: new THREE.Vector3(Math.sin(0.7) * 0.252, top + 0.026 + H - 0.025, Math.cos(0.7) * 0.252), top: top + 0.026 + H };
  return grp;
}

// —— 签筒 ——
let stickGeo: THREE.BufferGeometry | null = null;
function lotStickGeo(): THREE.BufferGeometry {
  if (stickGeo) return stickGeo;
  const w = 0.0045, L = 0.27, hd = 0.02, pts: P2[] = [[-w, L - hd], [w, L - hd], [w, L - w]];
  for (let i = 1; i < 6; i++) { const a = (i / 6) * Math.PI; pts.push([w * Math.cos(a), L - w + w * Math.sin(a)]); }
  pts.push([-w, L - w]);
  const red = LIN(0x8a2015);
  stickGeo = merge([
    tint(prism([[-w, 0], [w, 0], [w, L - hd], [-w, L - hd]], 0.003, 'y'), 1.1, 1.06, 0.95),
    tint(prism(pts, 0.003, 'y'), red[0] * 1.6, red[1] * 1.6, red[2] * 1.6),
  ]);
  return stickGeo;
}
/** 一支签：扁竹片，签头削圆、染朱。原点在下端，+y 沿签身 */
export function lotStick(mats: Mats, q: Quality): THREE.Mesh {
  return part(lotStickGeo(), pmats(mats, q).bamboo, 'lotStick');
}
/**
 * 签筒：竹筒（高 0.3、径 0.115，两道竹节），里面三十二支签参差斜插着。
 * live=true（默认）每支签是一个单独的节点，可以逐支动（33 次绘制，只在抽签的特写里用）；
 * live=false 时签并成一块（2 次绘制），远看摆着用，userData.sticks 为空。
 */
export function lotTube(mats: Mats, q: Quality, live = true): THREE.Group {
  const grp = new THREE.Group(), b = new Builder(), H = 0.3, R = 0.0575, Ri = 0.0495, fy = 0.085;
  grp.name = 'lotTube';
  const node = (y: number): P2[] => [[R, y - 0.006], [R - 0.0012, y - 0.0035], [R + 0.0016, y - 0.001], [R + 0.0018, y + 0.002], [R, y + 0.006]];
  const outer = prof(
    [[0.001, 0.004], [R - 0.012, 0.004], [R - 0.008, 0], [R - 0.003, 0.0005], [R, 0.004]],
    [[R, 0.004], [R, fy - 0.006]], node(fy), [[R, fy + 0.006], [R, 0.205 - 0.006]], node(0.205), [[R, 0.211], [R, H - 0.004]],
    [[R, H - 0.004], [R - 0.0012, H - 0.001], [R - 0.004, H], [Ri + 0.0015, H - 0.0008], [Ri, H - 0.004]],
    [[Ri, H - 0.004], [Ri, fy + 0.006], [Ri - 0.004, fy + 0.001], [0.001, fy]],
  );
  b.add('bamboo', colorize(turn(outer, sg(q, 40), { tile: 0.25 }), (x, y, z, _nx, _ny, _nz, o) => {
    const inner = Math.hypot(x, z) < Ri + 0.0008 && y < H - 0.002;
    const nd = Math.max(Math.exp(-(((y - fy) / 0.004) ** 2)), Math.exp(-(((y - 0.205) / 0.004) ** 2)));
    const k = (inner ? 0.42 + 0.3 * clamp((y - fy) / 0.2) : 1) * (1 - 0.28 * nd);
    o[0] = k; o[1] = k * 0.98; o[2] = k * 0.94;
  }));
  grp.add(b.build(table(mats, q), { name: 'tube' }));
  const sticks: THREE.Object3D[] = [], r = mulberry32(2026), depth = H - fy, up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), qq = new THREE.Quaternion();
  const mat = pmats(mats, q).bamboo, n = 32, fixed: THREE.BufferGeometry[] = [], one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) {
    const ab = r() * Math.PI * 2, rb = Math.sqrt(r()) * 0.036;
    const at = ab + (r() - 0.5) * 1.6, rt = 0.014 + r() * 0.028;
    d.set(Math.cos(at) * rt - Math.cos(ab) * rb, depth, Math.sin(at) * rt - Math.sin(ab) * rb).normalize();
    const pos = new THREE.Vector3(Math.cos(ab) * rb, fy + 0.001, Math.sin(ab) * rb);
    const rot = new THREE.Quaternion().setFromUnitVectors(up, d).multiply(qq.setFromAxisAngle(up, r() * Math.PI));
    if (!live) { fixed.push(lotStickGeo().clone().applyMatrix4(new THREE.Matrix4().compose(pos, rot, one))); continue; }
    const m = part(lotStickGeo(), mat, `stick${i}`);
    m.position.copy(pos); m.quaternion.copy(rot);
    sticks.push(m); grp.add(m);
  }
  if (!live) grp.add(part(merge(fixed), mat, 'sticksStatic'));
  grp.userData = { sticks, mouth: new THREE.Vector3(0, H, 0), radius: Ri, depth, floorY: fy };
  return grp;
}
