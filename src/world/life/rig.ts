/**
 * 生灵的骨架：牛、鸡、鸭、狗、鸟都是几块不变形的小件（身、头颈、腿、翅……）拼的，
 * 每帧按各自的位置整块搬一遍，收在同一个几何里——一群鸡是一次绘制，不是几十次。
 * （做法与小人身上的头、手、鞋相同，见 avatar/loft.ts 的 place。）
 *
 * 颜色全写在顶点上（材质的颜料是纯白、浓度 1）：tone(颜料, 浓度) 就是那一处的颜色。
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { colorize, grid, type Geo } from '../core/geo';
import { wash, type RGB, type WashOpts } from '../ink/ink';

/** 颜料叠了几层之后的颜色 */
export const tone = (p: RGB, d = 1): RGB => [Math.pow(p[0], d), Math.pow(p[1], d), Math.pow(p[2], d)];
/** 整块涂一个颜色 */
export const paint = (g: Geo, c: RGB): Geo => colorize(g, (_x, _y, _z, _nx, _ny, _nz, o) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
/** 生灵身上用的材质：颜色在顶点上，这里只管粉不粉、明暗、勾不勾线 */
export const creatureMat = (o: WashOpts = {}) => wash({ pig: [1, 1, 1], dens: 1, shade: 1.5, grain: 2.4, body: 0.15, ...o });

interface Piece { off: number; n: number; src: Float32Array; srcN: Float32Array }

export class Parts {
  mesh: THREE.Mesh;
  private pcs: Piece[] = [];
  private staged: Geo[] = [];
  private cache = new Map<Geo, Geo>();
  private pos!: Float32Array; private nor!: Float32Array;
  private pa!: THREE.BufferAttribute; private na!: THREE.BufferAttribute;

  constructor(mat: THREE.Material, name: string) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.name = name;
    // 各块都在世界里到处走：不靠包围球剔除（三角很少，画了也不费）
    this.mesh.frustumCulled = false;
  }
  /** 添一块（它自己坐标里的样子；同一个几何可以添许多次）。返回这一块的编号 */
  add(g: Geo): number {
    let m = this.cache.get(g);
    if (!m) { m = g.index ? g : mergeVertices(g, 1e-5); this.cache.set(g, m); }
    this.staged.push(m);
    return this.staged.length - 1;
  }
  /** 都添完了：攒成一个几何 */
  build(): this {
    let n = 0, ni = 0;
    for (const g of this.staged) { n += g.attributes.position.count; ni += g.index!.count; }
    this.pos = new Float32Array(n * 3); this.nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3), idx = n > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let o = 0, k = 0;
    for (const g of this.staged) {
      const c = g.attributes.position.count, src = g.attributes.position.array as Float32Array, srcN = g.attributes.normal.array as Float32Array;
      this.pcs.push({ off: o, n: c, src, srcN });
      this.pos.set(src, o * 3); this.nor.set(srcN, o * 3);
      uv.set(g.attributes.uv.array as Float32Array, o * 2); col.set(g.attributes.color.array as Float32Array, o * 3);
      const ix = g.index!.array;
      for (let i = 0; i < ix.length; i++) idx[k++] = ix[i] + o;
      o += c;
    }
    const geo = this.mesh.geometry;
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.na = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pa); geo.setAttribute('normal', this.na);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.staged = []; this.cache.clear();
    return this;
  }
  get triangles() { return (this.mesh.geometry.index?.count ?? 0) / 3; }
  /** 把第 k 块搬到 m 这个位置上（世界矩阵；可以沿自己的 y 拉长——绳、线就是这样拉出来的） */
  place(k: number, m: THREE.Matrix4) {
    const c = this.pcs[k], P = this.pos, N = this.nor, S = c.src, SN = c.srcN;
    const e = m.elements, e0 = e[0], e1 = e[1], e2 = e[2], e4 = e[4], e5 = e[5], e6 = e[6], e8 = e[8], e9 = e[9], e10 = e[10], tx = e[12], ty = e[13], tz = e[14];
    const inv = 1 / (Math.hypot(e0, e1, e2) || 1), invY = 1 / (Math.hypot(e4, e5, e6) || 1);
    let o = c.off * 3;
    for (let i = 0, q = 0; i < c.n; i++, q += 3, o += 3) {
      const x = S[q], y = S[q + 1], z = S[q + 2], a = SN[q] * inv, b = SN[q + 1] * invY, d = SN[q + 2] * inv;
      P[o] = e0 * x + e4 * y + e8 * z + tx; P[o + 1] = e1 * x + e5 * y + e9 * z + ty; P[o + 2] = e2 * x + e6 * y + e10 * z + tz;
      N[o] = e0 * a + e4 * b + e8 * d; N[o + 1] = e1 * a + e5 * b + e9 * d; N[o + 2] = e2 * a + e6 * b + e10 * d;
    }
  }
  /** 收起来（缩成一点，看不见） */
  hide(k: number) {
    const c = this.pcs[k], P = this.pos;
    let o = c.off * 3;
    for (let i = 0; i < c.n; i++, o += 3) { P[o] = 0; P[o + 1] = -500; P[o + 2] = 0; }
  }
  commit() { this.pa.needsUpdate = true; this.na.needsUpdate = true; }
}

// —— 摆矩阵（不新建对象） ——
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** 位置、转角（先绕自己的 y 转 ry，再俯仰 rx，再侧滚 rz）、大小 */
export function trs(out: THREE.Matrix4, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1): THREE.Matrix4 {
  _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
  return out.compose(_p.set(x, y, z), _q, _s.set(s, s, s));
}
/** out = 父 × 子（子用 trs 的参数给） */
export function child(out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1): THREE.Matrix4 {
  return out.multiplyMatrices(parent, trs(_m, x, y, z, ry, rx, rz, s));
}
const _m = new THREE.Matrix4();
/** 把一根沿 +y、长 1、底在原点的料摆成从 a 到 b（绳、线、缰） */
export function span(out: THREE.Matrix4, ax: number, ay: number, az: number, bx: number, by: number, bz: number): THREE.Matrix4 {
  _a.set(bx - ax, by - ay, bz - az);
  const len = _a.length() || 1e-6;
  _q.setFromUnitVectors(_up, _a.multiplyScalar(1 / len));
  return out.compose(_p.set(ax, ay, az), _q, _s.set(1, len, 1));
}

// —— 捏形 ——
/**
 * 沿 z 捏一个身子：若干截面 [z, 中心高 y, 半宽 rx, 半高 ry]，自后（−z）到前（+z）；两头收成点。
 * 截面是上下可以不一样圆的椭圆（belly：下半截比上半截鼓多少）。接缝在肚子底下。
 */
export function loftZ(secs: Array<[number, number, number, number]>, seg = 10, belly = 1): Geo {
  const pts: THREE.Vector3[][] = [];
  const ring = (z: number, y: number, rx: number, ry: number) => {
    const row: THREE.Vector3[] = [];
    for (let j = 0; j <= seg; j++) {
      const a = -Math.PI / 2 + (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      row.push(new THREE.Vector3(c * rx, y + s * ry * (s < 0 ? belly : 1), z));
    }
    return row;
  };
  const f = secs[0], l = secs[secs.length - 1];
  pts.push(ring(f[0] - f[2] * 0.35, f[1], 1e-4, 1e-4));
  for (const [z, y, rx, ry] of secs) pts.push(ring(z, y, rx, ry));
  pts.push(ring(l[0] + l[2] * 0.35, l[1], 1e-4, 1e-4));
  // 沿长度是 i、绕一圈是 j：这个次序面朝里，翻过来
  return grid(pts, (i, j) => [j / seg, i / (pts.length - 1)], true);
}
