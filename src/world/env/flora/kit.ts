/**
 * 草木的骨架件（画法无关）：
 *   FGeo —— 攒顶点的篮子（位置、法线、uv、顶点色，外加随风摆的 sway）；
 *   tube —— 干、枝、茎是沿折线扫出的管，返回每一环的位置与标架，好往上接枝、落叶点；
 *   limb —— 一根枝怎么长（带点曲折，可朝某处偏）。
 * 叶与花不在这里：它们是一笔一笔点上去的（ink.ts 的 dabMesh）。
 */
import * as THREE from 'three';
import { mulberry32, type Rng } from '../../core/rng';

export type V3 = THREE.Vector3;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = new THREE.Vector3(0, 1, 0);
export type RGB = [number, number, number];

export interface Rand { (): number; r(a: number, b: number): number; i(n: number): number; pm(a: number): number; pick<T>(xs: readonly T[]): T }
export function rand(seed: number): Rand {
  const base: Rng = mulberry32(seed);
  const f = (() => base()) as Rand;
  f.r = (a, b) => a + (b - a) * base();
  f.i = (n) => Math.min(n - 1, Math.floor(base() * n));
  f.pm = (a) => (base() * 2 - 1) * a;
  f.pick = (xs) => xs[Math.min(xs.length - 1, Math.floor(base() * xs.length))];
  return f;
}
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export class FGeo {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; sw: number[] = []; idx: number[] = [];
  get n() { return this.pos.length / 3; }
  get tris() { return this.idx.length / 3; }
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, vv: number, r: number, g: number, b: number, s: number): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, vv); this.col.push(r, g, b); this.sw.push(s);
    return i;
  }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  /** 把另一篮并进来（可带变换） */
  add(o: FGeo, m?: THREE.Matrix4) {
    const base = this.n;
    if (m) {
      const e = m.elements, nm = new THREE.Matrix3().getNormalMatrix(m).elements;
      for (let i = 0; i < o.pos.length; i += 3) {
        const x = o.pos[i], y = o.pos[i + 1], z = o.pos[i + 2];
        this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        const a = o.nor[i], b = o.nor[i + 1], c = o.nor[i + 2];
        const nx = nm[0] * a + nm[3] * b + nm[6] * c, ny = nm[1] * a + nm[4] * b + nm[7] * c, nz = nm[2] * a + nm[5] * b + nm[8] * c;
        const l = Math.hypot(nx, ny, nz) || 1;
        this.nor.push(nx / l, ny / l, nz / l);
      }
    } else { for (const x of o.pos) this.pos.push(x); for (const x of o.nor) this.nor.push(x); }
    for (const x of o.uv) this.uv.push(x);
    for (const x of o.col) this.col.push(x);
    for (const x of o.sw) this.sw.push(x);
    for (const x of o.idx) this.idx.push(x + base);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sw, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** 折线抹顺：过这些点的样条上取 n+1 个点 */
export function smoothPath(ctrl: V3[], n: number, tension = 0.5): V3[] {
  if (ctrl.length < 3) return ctrl.map((p) => p.clone());
  return new THREE.CatmullRomCurve3(ctrl, false, 'centripetal', tension).getPoints(n);
}
export function pathLength(p: V3[]): number { let l = 0; for (let i = 1; i < p.length; i++) l += p[i].distanceTo(p[i - 1]); return l; }
/** 折线上按长度比例 t（0…1）取点与方向 */
export function along(p: V3[], t: number, outDir?: V3): V3 {
  const L = pathLength(p); let d = clamp01(t) * L;
  for (let i = 1; i < p.length; i++) {
    const s = p[i].distanceTo(p[i - 1]);
    if (d <= s || i === p.length - 1) {
      outDir?.subVectors(p[i], p[i - 1]).normalize();
      return p[i - 1].clone().lerp(p[i], s > 1e-6 ? Math.min(1, d / s) : 0);
    }
    d -= s;
  }
  return p[p.length - 1].clone();
}

export interface Ring { p: V3; t: V3; n: V3; b: V3; r: number }
export interface TubeOpts {
  sides: number;
  /** 每个环的摆动权重（0 不动 … 1 梢头） */
  sway?: (i: number, p: V3) => number;
  /** 颜色（线性 rgb 的乘数）；给一个数就是灰度 */
  col?: number | RGB | ((i: number, k: number) => RGB | number);
  /** 贴图：绕一圈 u 跨多少、沿长度每米 v 走多少、v 的起点 */
  uSpan?: number; vPerM?: number; v0?: number;
  /** 半径随角度的起伏（树根的棱、老干的疙瘩） */
  bulge?: (i: number, ang: number) => number;
  /** 末端收尖封口 */
  cap?: boolean;
  startN?: V3;
}
/** 沿折线扫一根管（干、枝、茎）。返回每一环的位置与标架，好往上接枝 */
export function tube(g: FGeo, pts: V3[], rad: number[], o: TubeOpts): Ring[] {
  const n = pts.length, S = o.sides, rings: Ring[] = [];
  const uSpan = o.uSpan ?? 1, vPerM = o.vPerM ?? 1;
  let N: V3 | null = o.startN ? o.startN.clone() : null;
  let len = o.v0 ?? 0;
  const base = g.n;
  for (let i = 0; i < n; i++) {
    const T = new THREE.Vector3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    if (!N) N = (Math.abs(T.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).cross(T).normalize();
    else { N.addScaledVector(T, -N.dot(T)); if (N.lengthSq() < 1e-8) N.set(1, 0, 0).cross(T); N.normalize(); }
    const B = new THREE.Vector3().crossVectors(T, N);
    if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
    rings.push({ p: pts[i], t: T, n: N.clone(), b: B, r: rad[i] });
    const sw = o.sway ? o.sway(i, pts[i]) : 0, p = pts[i];
    for (let k = 0; k <= S; k++) {
      const a = (k / S) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const rr = rad[i] * (o.bulge ? o.bulge(i, a) : 1);
      const nx = N.x * ca + B.x * sa, ny = N.y * ca + B.y * sa, nz = N.z * ca + B.z * sa;
      const c = typeof o.col === 'function' ? o.col(i, k % S) : (o.col ?? 1);
      const cr = typeof c === 'number' ? c : c[0], cg = typeof c === 'number' ? c : c[1], cb = typeof c === 'number' ? c : c[2];
      g.v(p.x + nx * rr, p.y + ny * rr, p.z + nz * rr, nx, ny, nz, (k / S) * uSpan, len * vPerM, cr, cg, cb, sw);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < S; k++) {
    const a = base + i * (S + 1) + k;
    g.quad(a, a + 1, a + S + 2, a + S + 1);
  }
  if (o.cap) {
    const e = rings[n - 1], sw = o.sway ? o.sway(n - 1, e.p) : 0;
    const c = typeof o.col === 'function' ? o.col(n - 1, 0) : (o.col ?? 1), cr = typeof c === 'number' ? c : c[0], cg = typeof c === 'number' ? c : c[1], cb = typeof c === 'number' ? c : c[2];
    const tip = g.v(e.p.x + e.t.x * e.r * 1.2, e.p.y + e.t.y * e.r * 1.2, e.p.z + e.t.z * e.r * 1.2, e.t.x, e.t.y, e.t.z, 0.5 * uSpan, (len + e.r) * vPerM, cr, cg, cb, sw);
    const b0 = base + (n - 1) * (S + 1);
    for (let k = 0; k < S; k++) g.tri(b0 + k, b0 + k + 1, tip);
  }
  return rings;
}

/** 一根枝：从 start 朝 dir 长 len，分 steps 段；toward 给了就往那边偏 */
export function limb(R: Rand, start: V3, dir: V3, len: number, steps: number, o: { toward?: V3; pull?: number; jitter?: number; zig?: number; pullEnd?: number } = {}): V3[] {
  const pts = [start.clone()], d = dir.clone().normalize();
  let p = start.clone();
  for (let k = 1; k <= steps; k++) {
    if (o.toward) { const q = k / steps, pl = lerp(o.pull ?? 0.2, o.pullEnd ?? o.pull ?? 0.2, q); d.lerp(o.toward, pl).normalize(); }
    if (o.zig) d.applyAxisAngle(UP, (k % 2 ? 1 : -1) * R.r(0.4, 1) * o.zig);
    if (o.jitter) { d.x += R.pm(o.jitter); d.y += R.pm(o.jitter * 0.6); d.z += R.pm(o.jitter); d.normalize(); }
    p = p.clone().addScaledVector(d, len / steps);
    pts.push(p);
  }
  return pts;
}
/** 与 t 垂直的一个随机方向 */
export function perp(R: Rand, t: V3, upBias = 0): V3 {
  const a = v3(R.pm(1), R.pm(1) + upBias, R.pm(1));
  a.addScaledVector(t, -a.dot(t));
  if (a.lengthSq() < 1e-6) a.set(t.z, 0, -t.x);
  return a.normalize();
}
