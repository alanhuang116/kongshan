/**
 * 会动的「筒」：长衫与两只袖子都是若干圈点连成的曲面，每一帧按身体的姿势把每一圈重新摆好，再重算法线。
 * 几张筒共用一个几何（一次绘制）。每张筒：rings 圈 × (segs + 1) 个点（首尾两点重合，那里是贴图的接缝）。
 * 圈的顺序自下而上（或自肩到袖口）、圈上的点按角度递增时，面朝外；一圈往回折（下摆、袖口的里子）时面自然朝里。
 *
 * 不变形的部件（头、手、鞋、斗笠）也收在这同一个几何里：各是一「块」，每帧按它的关节整块搬过去——
 * 于是一个人从头到脚只有一次绘制（村里十几个人，就是十几次）。
 */
import * as THREE from 'three';

export interface Patch { rings: number; segs: number; off: number }
/** 一块不变形的部件：在大数组里从哪开始、有几个点，以及它自己坐标里的原样 */
export interface Chunk { off: number; n: number; src: Float32Array; srcN: Float32Array }

export class LoftGeo {
  geo = new THREE.BufferGeometry();
  pos: Float32Array; nor: Float32Array; uv: Float32Array; col: Float32Array;
  patches: Patch[] = [];
  chunks: Chunk[] = [];
  private pa: THREE.BufferAttribute; private na: THREE.BufferAttribute;

  /** rigid：不变形的部件（要有 position / normal / uv / color，带索引）。它们的 uv、顶点色在这里抄一次就不变了 */
  constructor(defs: Array<{ rings: number; segs: number }>, rigid: THREE.BufferGeometry[] = []) {
    let n = 0, tris = 0;
    for (const d of defs) { this.patches.push({ rings: d.rings, segs: d.segs, off: n }); n += d.rings * (d.segs + 1); tris += (d.rings - 1) * d.segs * 2; }
    for (const g of rigid) {
      const c = g.attributes.position.count;
      this.chunks.push({ off: n, n: c, src: new Float32Array(g.attributes.position.array), srcN: new Float32Array(g.attributes.normal.array) });
      n += c; tris += g.index!.count / 3;
    }
    this.pos = new Float32Array(n * 3); this.nor = new Float32Array(n * 3); this.uv = new Float32Array(n * 2); this.col = new Float32Array(n * 3).fill(1);
    const idx = n > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
    let k = 0;
    for (const p of this.patches) {
      const w = p.segs + 1;
      for (let j = 0; j < p.rings - 1; j++) for (let i = 0; i < p.segs; i++) {
        const a = p.off + j * w + i, b = a + 1, c = a + w + 1, d = a + w;
        idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = a; idx[k++] = c; idx[k++] = d;
      }
    }
    rigid.forEach((g, ci) => {
      const c = this.chunks[ci], ix = g.index!.array;
      for (let i = 0; i < ix.length; i++) idx[k++] = ix[i] + c.off;
      this.uv.set(g.attributes.uv.array as Float32Array, c.off * 2);
      this.col.set(g.attributes.color.array as Float32Array, c.off * 3);
      this.pos.set(c.src, c.off * 3); this.nor.set(c.srcN, c.off * 3);
    });
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.na = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pa);
    this.geo.setAttribute('normal', this.na);
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    // 点每帧都在动：包围球给得宽些（人怎么伸手、俯身都出不了这个球），视锥剔除照常可用
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 2.2);
  }
  get triangles() { return this.geo.index!.count / 3; }
  /** 某张筒第 j 圈第 i 个点在数组里的下标 */
  at(p: number, j: number, i: number) { const P = this.patches[p]; return P.off + j * (P.segs + 1) + i; }

  /** 由相邻的点重算法线（沿圈的方向 × 沿筒的方向）。只管筒；整块搬的部件的法线在 place 里跟着转 */
  normals() {
    const P = this.pos, N = this.nor;
    for (const p of this.patches) {
      const w = p.segs + 1, s = p.segs;
      for (let j = 0; j < p.rings; j++) {
        const jm = j > 0 ? j - 1 : 0, jp = j < p.rings - 1 ? j + 1 : j;
        for (let i = 0; i < w; i++) {
          const im = i === 0 ? s - 1 : i - 1, ip = i === s ? 1 : i + 1;
          const a = (p.off + j * w + im) * 3, b = (p.off + j * w + ip) * 3, c = (p.off + jm * w + i) * 3, d = (p.off + jp * w + i) * 3;
          const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
          const vx = P[d] - P[c], vy = P[d + 1] - P[c + 1], vz = P[d + 2] - P[c + 2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const l = Math.hypot(nx, ny, nz);
          if (l > 1e-12) { nx /= l; ny /= l; nz /= l; } else { nx = 0; ny = 1; nz = 0; }
          const o = (p.off + j * w + i) * 3;
          N[o] = nx; N[o + 1] = ny; N[o + 2] = nz;
        }
      }
    }
  }

  /** 把第 k 块部件整块搬到 m 这个位置上（m 是它在小人坐标里的矩阵；只许转、移、等比缩放）。null：收成一点（看不见） */
  place(k: number, m: THREE.Matrix4 | null) {
    const c = this.chunks[k], P = this.pos, N = this.nor, S = c.src, SN = c.srcN;
    let o = c.off * 3;
    if (!m) { for (let i = 0; i < c.n; i++) { P[o] = 0; P[o + 1] = 0.5; P[o + 2] = 0; o += 3; } return; }
    const e = m.elements, e0 = e[0], e1 = e[1], e2 = e[2], e4 = e[4], e5 = e[5], e6 = e[6], e8 = e[8], e9 = e[9], e10 = e[10], tx = e[12], ty = e[13], tz = e[14];
    const inv = 1 / (Math.hypot(e0, e1, e2) || 1);
    for (let i = 0, q = 0; i < c.n; i++, q += 3, o += 3) {
      const x = S[q], y = S[q + 1], z = S[q + 2], a = SN[q] * inv, b = SN[q + 1] * inv, d = SN[q + 2] * inv;
      P[o] = e0 * x + e4 * y + e8 * z + tx; P[o + 1] = e1 * x + e5 * y + e9 * z + ty; P[o + 2] = e2 * x + e6 * y + e10 * z + tz;
      N[o] = e0 * a + e4 * b + e8 * d; N[o + 1] = e1 * a + e5 * b + e9 * d; N[o + 2] = e2 * a + e6 * b + e10 * d;
    }
  }
  commit() { this.pa.needsUpdate = true; this.na.needsUpdate = true; }
}
