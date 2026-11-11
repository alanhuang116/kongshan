/**
 * 会动的「筒」：长衫与两只袖子都是若干圈点连成的曲面，每一帧按身体的姿势把每一圈重新摆好，再重算法线。
 * 几张筒共用一个几何（一次绘制）。每张筒：rings 圈 × (segs + 1) 个点（首尾两点重合，那里是贴图的接缝）。
 * 圈的顺序自下而上（或自肩到袖口）、圈上的点按角度递增时，面朝外；一圈往回折（下摆、袖口的里子）时面自然朝里。
 */
import * as THREE from 'three';

export interface Patch { rings: number; segs: number; off: number }

export class LoftGeo {
  geo = new THREE.BufferGeometry();
  pos: Float32Array; nor: Float32Array; uv: Float32Array; col: Float32Array;
  patches: Patch[] = [];
  private pa: THREE.BufferAttribute; private na: THREE.BufferAttribute;

  constructor(defs: Array<{ rings: number; segs: number }>) {
    let n = 0, tris = 0;
    for (const d of defs) { this.patches.push({ rings: d.rings, segs: d.segs, off: n }); n += d.rings * (d.segs + 1); tris += (d.rings - 1) * d.segs * 2; }
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
    this.pa = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.na = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pa);
    this.geo.setAttribute('normal', this.na);
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    // 点每帧都在动：不靠包围球做视锥剔除（由外面关掉 frustumCulled）
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 2.2);
  }
  get triangles() { return this.geo.index!.count / 3; }
  /** 某张筒第 j 圈第 i 个点在数组里的下标 */
  at(p: number, j: number, i: number) { const P = this.patches[p]; return P.off + j * (P.segs + 1) + i; }

  /** 由相邻的点重算法线（沿圈的方向 × 沿筒的方向） */
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
  commit() { this.pa.needsUpdate = true; this.na.needsUpdate = true; }
}
