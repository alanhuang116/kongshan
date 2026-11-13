/**
 * 远景里会动的几样：伊水上的帆与渔舟，天上的雁阵与盘旋的飞鸟。都只是几笔墨——离得远，慢慢地走。
 * 每一样是一个小小的点笔网格；每帧只改它几何里现成的数组（不新建东西）。
 */
import * as THREE from 'three';
import { dabMat, dabMesh, type Dab } from '../../ink/ink';
import type { Atlas } from '../../ink/brush';
import { RIVER_FINE, waterY } from './plain';
import { M } from './tiles';

const arr = (m: THREE.Mesh, name: string) => (m.geometry.attributes[name] as THREE.InstancedBufferAttribute);

export interface BoatDef {
  /** 起头在河上哪里（中线的里程，米；自上游起）、往下游走的快慢（米/秒，负是逆水）、只在哪一段里来回 */ s: number; v: number; range: [number, number];
  /** 偏离中线多少（半宽的几成：正是左岸一侧） */ off: number;
  tile: number; size: number;
}
/** 江上的舟：顺着伊水的中线慢慢走，到了头掉过来 */
export class Boats {
  mesh: THREE.Mesh;
  private k: Int32Array; private s: Float32Array; private v: Float32Array;
  constructor(A: Atlas, private defs: BoatDef[]) {
    const dabs: Dab[] = defs.map((d) => ({ x: 0, y: 0, z: 0, size: d.size, tile: d.tile, sway: 0, nx: 0.3, ny: 1, nz: 0.3 }));
    // 船身是墨，帆是淡淡的一片（点缀色）
    this.mesh = dabMesh(dabs, dabMat({ ...A, pig: [0.5, 0.5, 0.52], accent: [0.97, 0.955, 0.9], dens: 1.7, shade: 1.15, snow: 0 }));
    this.mesh.frustumCulled = false; this.mesh.name = '舟';
    this.k = new Int32Array(defs.length); this.s = new Float32Array(defs.length); this.v = new Float32Array(defs.length);
    defs.forEach((d, i) => { this.s[i] = d.s; this.v[i] = d.v; });
    this.update(0, 0);
  }
  update(dt: number, t: number) {
    const P = arr(this.mesh, 'aPos'), a = P.array as Float32Array, R = RIVER_FINE, n = R.length;
    for (let i = 0; i < this.defs.length; i++) {
      const d = this.defs[i];
      let s = this.s[i] + this.v[i] * dt;
      if (s > d.range[1]) { s = d.range[1]; this.v[i] = -Math.abs(this.v[i]); } else if (s < d.range[0]) { s = d.range[0]; this.v[i] = Math.abs(this.v[i]); }
      this.s[i] = s;
      let k = this.k[i];
      while (k < n - 2 && R[k + 1].s < s) k++;
      while (k > 0 && R[k].s > s) k--;
      this.k[i] = k;
      const p = R[k], q = R[k + 1], f = Math.max(0, Math.min(1, (s - p.s) / (q.s - p.s || 1)));
      const x = p.x + (q.x - p.x) * f + p.nx * d.off * p.w, z = p.z + (q.z - p.z) * f + p.nz * d.off * p.w;
      a[i * 4] = x; a[i * 4 + 1] = waterY(x, z) + d.size * 0.47 + Math.sin(t * 0.7 + i * 2.1) * 0.12; a[i * 4 + 2] = z;
    }
    P.needsUpdate = true;
  }
}

export interface FlockDef {
  /** 盘旋的中心、半径、离地多高、几只、一圈要多少秒、多大 */ x: number; y: number; z: number; r: number; n: number; period: number; size: number;
  /** 乘着风滑翔的（少扇翅） */ glide?: boolean;
}
/** 远处盘旋的飞鸟：一圈一圈慢慢地转，翅一起一落 */
export class Birds {
  mesh: THREE.Mesh;
  private ph: Float32Array; private who: Int32Array;
  constructor(A: Atlas, private defs: FlockDef[]) {
    const dabs: Dab[] = [], who: number[] = [];
    defs.forEach((d, f) => { for (let i = 0; i < d.n; i++) { dabs.push({ x: d.x, y: d.y, z: d.z, size: d.size * (0.8 + 0.4 * ((i * 0.618) % 1)), tile: M.birdUp, sway: 0, ny: 1 }); who.push(f); } });
    this.mesh = dabMesh(dabs, dabMat({ ...A, pig: [0.46, 0.46, 0.5], dens: 2.2, shade: 1, flat: 1, snow: 0 }));
    this.mesh.frustumCulled = false; this.mesh.name = '飞鸟';
    this.who = Int32Array.from(who); this.ph = new Float32Array(dabs.length);
    for (let i = 0; i < dabs.length; i++) this.ph[i] = (i * 2.399) % 6.283;
    this.update(0, 0);
  }
  update(_dt: number, t: number) {
    const P = arr(this.mesh, 'aPos'), a = P.array as Float32Array, D = arr(this.mesh, 'aDir'), dd = D.array as Float32Array, C = arr(this.mesh, 'aCol'), cc = C.array as Float32Array;
    for (let i = 0; i < this.who.length; i++) {
      const d = this.defs[this.who[i]], ph = this.ph[i];
      const ang = (t / d.period) * 6.2832 * (0.85 + 0.3 * ((ph * 0.37) % 1)) + ph, rr = d.r * (0.55 + 0.45 * Math.sin(ph * 3.1 + t * 0.021) ** 2);
      a[i * 4] = d.x + Math.cos(ang) * rr; a[i * 4 + 2] = d.z + Math.sin(ang) * rr * 0.8;
      a[i * 4 + 1] = d.y + Math.sin(t * 0.13 + ph * 2.0) * d.r * 0.16 + Math.sin(ph * 5.0) * d.r * 0.2;
      // 扇翅：一起一落；滑翔的只偶尔扇两下，平时翅略略上扬、身子随风侧一侧
      const beat = d.glide ? (Math.sin(t * 0.31 + ph) > 0.86 ? Math.sin(t * 9 + ph) : 1) : Math.sin(t * (6.5 + (ph % 1.7)) + ph * 4.0);
      dd[i * 4 + 3] = beat > 0 ? M.birdUp : M.birdDn;
      cc[i * 4 + 3] = (d.glide ? 0.22 : 0.12) * Math.sin(t * 0.4 + ph * 1.3);
    }
    P.needsUpdate = true; D.needsUpdate = true; C.needsUpdate = true;
  }
}

/** 雁阵：一个「人」字，从东南天上慢慢横过去（头雁在前，两翼错落）。秋天才有 */
export class Geese {
  mesh: THREE.Mesh;
  private n: number;
  /** from → to：一趟的起止；speed 米/秒；gap：过完一趟歇多少秒再来 */
  constructor(A: Atlas, private from: THREE.Vector3, private to: THREE.Vector3, private speed = 13, private gap = 70, count = 13, private size = 13) {
    const dabs: Dab[] = [];
    for (let i = 0; i < count; i++) dabs.push({ x: from.x, y: from.y, z: from.z, size: size * (i === 0 ? 1.1 : 0.85 + 0.25 * ((i * 0.618) % 1)), tile: M.gooseUp, sway: 0, ny: 1 });
    this.mesh = dabMesh(dabs, dabMat({ ...A, pig: [0.44, 0.44, 0.48], dens: 2.3, shade: 1, flat: 1, snow: 0 }));
    this.mesh.frustumCulled = false; this.mesh.name = '雁阵';
    this.n = count;
    this.update(0, 0);
  }
  update(_dt: number, t: number) {
    const P = arr(this.mesh, 'aPos'), a = P.array as Float32Array, D = arr(this.mesh, 'aDir'), dd = D.array as Float32Array;
    const dx = this.to.x - this.from.x, dy = this.to.y - this.from.y, dz = this.to.z - this.from.z, L = Math.hypot(dx, dy, dz), T = L / this.speed + this.gap;
    // 头一趟一开场就已经在半路上（不必等）
    const p = (((t + T * 0.3) % T) * this.speed) / L;
    this.mesh.visible = this.mesh.userData.on !== false && p <= 1.02;
    if (!this.mesh.visible) return;
    const ux = dx / L, uz = dz / L, sp = this.size * 1.25;
    for (let i = 0; i < this.n; i++) {
      // 「人」字：头雁之后，左一只右一只往后排；一翼长一翼短
      const k = Math.ceil(i / 2), side = i % 2 ? 1 : -0.82, back = k * sp * 0.9, out = k * sp * 0.62 * side, wob = Math.sin(t * 0.5 + i * 1.7) * sp * 0.12;
      a[i * 4] = this.from.x + dx * p - ux * back + uz * out; a[i * 4 + 2] = this.from.z + dz * p - uz * back - ux * out;
      a[i * 4 + 1] = this.from.y + dy * p + wob - k * sp * 0.05;
      dd[i * 4 + 3] = Math.sin(t * 5.2 + i * 0.9) > 0 ? M.gooseUp : M.gooseDn;
    }
    P.needsUpdate = true; D.needsUpdate = true;
  }
}
