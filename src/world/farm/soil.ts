/**
 * 畦面：每一畦一张贴地的网，四周一道矮埂。翻过的地起垄（垄脊、垄沟）、颜色深一层；浇过水更深；荒着、留茬时是平的、淡的。
 * 一垄翻到哪儿，垄就起到哪儿（翻的那一头堆着几块土，由笔去点）。颜色写在顶点上（材质颜料是白的），雪由材质自己积。
 * 所有畦并在一张网里（一次绘制）；某一畦变了，只重写它那一段顶点。
 */
import * as THREE from 'three';
import { wash } from '../ink/ink';
import type { Season } from '../../data/farm';
import { GROW } from '../../data/farm';
import { rowDir, type Bed } from './model';
import { END, type BedGeo } from './layout';

/** 网格多密（米） */
const CELL = 0.2;
/** 畦外一圈埂有多宽 */
const RIM = 0.32;
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hash = (x: number, z: number) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 各季的土色：荒地、翻过的（干）、湿土、埂上的草 */
const TONE: Record<Season, { wild: RGB; turned: RGB; wet: RGB; rim: RGB; stub: RGB }> = {
  spring: { wild: [0.86, 0.87, 0.73], turned: [0.84, 0.75, 0.64], wet: [0.72, 0.63, 0.54], rim: [0.8, 0.85, 0.68], stub: [0.9, 0.86, 0.74] },
  summer: { wild: [0.82, 0.86, 0.68], turned: [0.83, 0.74, 0.63], wet: [0.7, 0.62, 0.53], rim: [0.76, 0.83, 0.64], stub: [0.92, 0.86, 0.7] },
  autumn: { wild: [0.88, 0.85, 0.7], turned: [0.84, 0.75, 0.64], wet: [0.72, 0.64, 0.55], rim: [0.86, 0.84, 0.68], stub: [0.91, 0.85, 0.72] },
  winter: { wild: [0.89, 0.88, 0.8], turned: [0.86, 0.79, 0.7], wet: [0.78, 0.71, 0.63], rim: [0.88, 0.87, 0.78], stub: [0.9, 0.87, 0.78] },
};

interface Part { g: BedGeo; off: number; nu: number; nv: number }
/** 畦外头那一圈走道（行者两畦与邻家麦之间、两畦当中的埂）：铺一层土色，盖住底下的麦地底色 */
export interface Margin { x0: number; x1: number; z0: number; z1: number; y: (x: number, z: number) => number }
const MCELL = 0.5;

export class Soil {
  mesh: THREE.Mesh;
  private parts = new Map<string, Part>();
  private pos: Float32Array; private col: Float32Array;
  private geo: THREE.BufferGeometry;

  private margin: { m: Margin; off: number; nu: number; nv: number } | null = null;
  constructor(beds: BedGeo[], margin?: Margin) {
    let n = 0;
    const idx: number[] = [], uv: number[] = [];
    if (margin) {
      const nu = Math.round((margin.x1 - margin.x0) / MCELL), nv = Math.round((margin.z1 - margin.z0) / MCELL);
      this.margin = { m: margin, off: 0, nu, nv };
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) uv.push(i * MCELL, j * MCELL);
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
      n = (nu + 1) * (nv + 1);
    }
    for (const g of beds) {
      const L = g.axis === 'x' ? g.x1 - g.x0 : g.z1 - g.z0, A = g.axis === 'x' ? g.z1 - g.z0 : g.x1 - g.x0;
      const nu = Math.max(2, Math.round((L + RIM * 2) / CELL)), nv = Math.max(2, Math.round((A + RIM * 2) / CELL));
      this.parts.set(g.id, { g, off: n, nu, nv });
      for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) uv.push((i * (L + RIM * 2)) / nu, (j * (A + RIM * 2)) / nv);
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const a = n + i * (nv + 1) + j, b = a + nv + 1;
        // 正面朝上：按坐标轴的走向定三角形的绕法
        if (g.axis === 'x') idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      n += (nu + 1) * (nv + 1);
    }
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3).fill(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, wash({ pig: [1, 1, 1], dens: 1.0, shade: 1.65, grain: 1.3, line: 0.3, snow: 1, streak: [1.5, 9, 0.12] }));
    this.mesh.name = 'farm:soil';
  }

  /** 重画某一畦 */
  draw(b: Bed, season: Season) {
    const P = this.parts.get(b.id);
    if (!P) return;
    const { g, off, nu, nv } = P, T = TONE[season];
    const L0 = g.axis === 'x' ? g.x0 : g.z0, L1 = g.axis === 'x' ? g.x1 : g.z1, A0 = g.axis === 'x' ? g.z0 : g.x0, A1 = g.axis === 'x' ? g.z1 : g.x1;
    const grown = GROW.includes(b.stage) || b.stage === 'tilled';
    const wet = Math.min(1, Math.max(0, (b.water - 0.25) / 0.75));
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const u = L0 - RIM + ((L1 - L0 + RIM * 2) * i) / nu, v = A0 - RIM + ((A1 - A0 + RIM * 2) * j) / nv;
      const x = g.axis === 'x' ? u : v, z = g.axis === 'x' ? v : u;
      const base = g.y(x, z);
      // 埂：畦外那一圈高起一点，再落到地里
      const inside = Math.min(u - L0, L1 - u, v - A0, A1 - v);
      const edge = i === 0 || j === 0 || i === nu || j === nv;
      let h = 0.015, c: RGB;
      if (inside < 0) {
        h = edge ? -0.03 : 0.05 * Math.sin(Math.PI * Math.min(1, -inside / RIM));
        c = T.rim;
      } else {
        // 这一点在第几垄、顺着这一垄做到了哪儿
        const row = Math.max(0, Math.min(g.rows - 1, Math.floor((v - A0) / g.pitch))), across = (v - g.lines[row]) / g.pitch;
        const along = Math.max(0, Math.min(1, (u - L0 - END) / (L1 - L0 - END * 2))), f = rowDir(row) > 0 ? along : 1 - along;
        const turned = grown || (b.op === 'till' && f <= b.rows[row]) || (b.op === 'reap' && grown);
        const taper = smooth(0, 0.35, inside);
        if (turned) {
          const ridge = Math.pow(0.5 + 0.5 * Math.cos(across * Math.PI * 2), 1.4);
          h += 0.11 * ridge * taper;
          c = mix(T.turned, T.wet, wet * (0.75 + 0.25 * (1 - ridge)));
          c = mix(c, [c[0] * 0.86, c[1] * 0.86, c[2] * 0.88], 1 - ridge);
          // 刚翻的那一头：翻过与没翻的交界处压一道深
          if (b.op === 'till' && f > b.rows[row] - 0.03 && f <= b.rows[row]) c = mix(c, T.wet, 0.4);
        } else {
          c = b.stage === 'stubble' ? T.stub : T.wild;
          c = mix(c, [c[0] * 0.86, c[1] * 0.84, c[2] * 0.82], wet * 0.6);
          h += 0.012 * (hash(x, z) - 0.5);
        }
        if (b.op === 'sow' && f <= b.rows[row]) c = mix(c, T.wet, 0.18);
      }
      const k = 0.96 + 0.08 * hash(x * 1.3, z * 0.7);
      const o = (off + i * (nv + 1) + j) * 3;
      this.pos[o] = x; this.pos[o + 1] = base + h; this.pos[o + 2] = z;
      this.col[o] = c[0] * k; this.col[o + 1] = c[1] * k; this.col[o + 2] = c[2] * k;
    }
    this.dirty = true;
  }
  private dirty = false;
  /** 走道那一层（换季时重画） */
  drawMargin(season: Season) {
    const M = this.margin;
    if (!M) return;
    const { m, nu, nv } = M, T = TONE[season];
    const path: RGB = mix(T.stub, T.rim, 0.35), grass = T.rim;
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const x = m.x0 + i * MCELL, z = m.z0 + j * MCELL, edge = i === 0 || j === 0 || i === nu || j === nv;
      const g = smooth(0.35, 0.75, hash(x * 0.37, z * 0.41) * 0.6 + hash(Math.floor(x * 0.5), Math.floor(z * 0.5)) * 0.4);
      const c = mix(path, grass, g), k = 0.95 + 0.07 * hash(x * 1.7, z * 1.3), o = (i * (nv + 1) + j) * 3;
      this.pos[o] = x; this.pos[o + 1] = m.y(x, z) + (edge ? -0.06 : 0.008); this.pos[o + 2] = z;
      this.col[o] = c[0] * k; this.col[o + 1] = c[1] * k; this.col[o + 2] = c[2] * k;
    }
    this.dirty = true;
  }
  /** 有重写过的就交给显卡（一帧最多一回） */
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}
