/**
 * 香烟：不是一团团的粒子，而是一缕缕的线。
 * 每一缕是一串点：新的点不断从香头生出来，旧的点被一个缓慢翻卷的流场带着往上、往旁边走；
 * 画的时候把这串点拉成一条始终朝着镜头的细带，越往上越宽、越淡。所以它会打旋、会分叉、会被风吹斜。
 */
import * as THREE from 'three';
import { enhance, shared } from '../core/mats';

export interface SmokeOpts {
  /** 一缕有多少个点（越多越长） */
  points?: number;
  /** 上升速度（米/秒） */
  rise?: number;
  /** 起始宽度与最宽处 */
  w0?: number; w1?: number;
  /** 翻卷的强度、流场的疏密 */
  curl?: number; freq?: number;
  /** 最浓处的不透明度 */
  alpha?: number;
  /** 多久生一个新的点（秒） */
  every?: number;
  /** 受风的程度 */
  wind?: number;
}

// 一个便宜的、随时间变化的旋度场（几层正弦叠出来的，足够让烟打旋）
function flow(x: number, y: number, z: number, t: number, out: THREE.Vector3) {
  const a = Math.sin(y * 1.7 + t * 0.5 + z * 1.3) + Math.sin(y * 3.1 - t * 0.37 + x * 2.1) * 0.5;
  const b = Math.cos(y * 1.3 - t * 0.43 + x * 1.7) + Math.cos(y * 2.7 + t * 0.29 + z * 2.3) * 0.5;
  const c = Math.sin(x * 2.3 + t * 0.31) * Math.cos(z * 1.9 - t * 0.41);
  out.set(a, c * 0.35, b);
}

class Strand {
  pts: Float32Array; age: Float32Array; n = 0; acc = 0; seed: number;
  constructor(public max: number, seed: number) { this.pts = new Float32Array(max * 3); this.age = new Float32Array(max); this.seed = seed; }
}

export class Smoke {
  mesh: THREE.Mesh;
  /** 0…1：烟的浓淡（香点着了才有） */
  strength = 1;
  private strands: Strand[] = [];
  private o: Required<SmokeOpts>;
  private pos: Float32Array; private col: Float32Array; private geo: THREE.BufferGeometry;
  private v = new THREE.Vector3(); private side = new THREE.Vector3(); private tan = new THREE.Vector3(); private view = new THREE.Vector3();
  /** 每一缕的源头（世界坐标），可以每帧移动（手里拿着的香） */
  sources: THREE.Vector3[];

  constructor(sources: THREE.Vector3[], opts: SmokeOpts = {}) {
    this.o = { points: 56, rise: 0.3, w0: 0.004, w1: 0.11, curl: 0.085, freq: 1.4, alpha: 0.5, every: 0.07, wind: 0.5, ...opts };
    this.sources = sources;
    const N = this.o.points;
    sources.forEach((_s, i) => this.strands.push(new Strand(N, i * 7.31 + 1)));
    const quads = (N - 1) * sources.length;
    this.pos = new Float32Array(quads * 6 * 3); this.col = new Float32Array(quads * 6 * 4);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const mat = enhance(new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: true }));
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.name = 'smoke';
  }

  /** tint：烟此刻的颜色（由天时给：白天灰白、夜里被灯映成暖色） */
  update(dt: number, t: number, cam: THREE.Camera, tint: THREE.Color) {
    const o = this.o, wind = shared.uWind.value;
    let q = 0;
    const P = this.pos, C = this.col;
    this.view.copy(cam.position);
    for (let si = 0; si < this.strands.length; si++) {
      const s = this.strands[si], src = this.sources[si], N = s.max;
      // 生新点
      s.acc += dt;
      while (s.acc >= o.every) {
        s.acc -= o.every;
        if (this.strength > 0.02) {
          const m = Math.min(s.n, N - 1);
          s.pts.copyWithin(3, 0, m * 3); s.age.copyWithin(1, 0, m);
          s.pts[0] = src.x; s.pts[1] = src.y; s.pts[2] = src.z; s.age[0] = 0;
          s.n = Math.min(N, s.n + 1);
        } else if (s.n > 0) {
          // 熄了：不再生新点，余烟散尽
          s.n--;
          s.pts.copyWithin(3, 0, s.n * 3); s.age.copyWithin(1, 0, s.n);
          s.age[0] = Math.max(s.age[0], 0.05);
        }
      }
      const life = N * o.every;
      // 走
      for (let i = 0; i < s.n; i++) {
        const k = i * 3, a = (s.age[i] += dt), u = Math.min(1, a / life);
        if (i === 0 && this.strength > 0.02) { s.pts[0] = src.x; s.pts[1] = src.y; s.pts[2] = src.z; continue; }
        flow(s.pts[k] * o.freq + s.seed, s.pts[k + 1] * o.freq, s.pts[k + 2] * o.freq + s.seed * 0.7, t, this.v);
        const c = o.curl * (0.15 + 2.2 * u);
        s.pts[k] += (this.v.x * c + wind.x * wind.z * o.wind * (0.3 + u * 1.6)) * dt;
        s.pts[k + 1] += (o.rise * (1 - 0.45 * u) + this.v.y * c) * dt;
        s.pts[k + 2] += (this.v.z * c + wind.y * wind.z * o.wind * (0.3 + u * 1.6)) * dt;
      }
      // 画
      for (let i = 0; i < N - 1; i++) {
        const base = q * 18, cb = q * 24; q++;
        if (i >= s.n - 1) { for (let z = 0; z < 18; z++) P[base + z] = 0; for (let z = 0; z < 24; z++) C[cb + z] = 0; continue; }
        const k0 = i * 3, k1 = k0 + 3;
        const u0 = Math.min(1, s.age[i] / life), u1 = Math.min(1, s.age[i + 1] / life);
        const w0 = (o.w0 + (o.w1 - o.w0) * Math.pow(u0, 1.4)) * 0.5, w1 = (o.w0 + (o.w1 - o.w0) * Math.pow(u1, 1.4)) * 0.5;
        const A = (u: number) => o.alpha * this.strength * Math.min(1, u * 14) * Math.pow(1 - u, 1.6) * (0.006 / (0.006 + (o.w0 + (o.w1 - o.w0) * Math.pow(u, 1.4)) * 0.22));
        const a0 = A(u0), a1 = A(u1);
        this.tan.set(s.pts[k1] - s.pts[k0], s.pts[k1 + 1] - s.pts[k0 + 1], s.pts[k1 + 2] - s.pts[k0 + 2]);
        this.side.set(s.pts[k0] - this.view.x, s.pts[k0 + 1] - this.view.y, s.pts[k0 + 2] - this.view.z).cross(this.tan).normalize();
        const sx = this.side.x, sy = this.side.y, sz = this.side.z;
        const ax = s.pts[k0], ay = s.pts[k0 + 1], az = s.pts[k0 + 2], bx = s.pts[k1], by = s.pts[k1 + 1], bz = s.pts[k1 + 2];
        const V = (j: number, x: number, y: number, z: number, al: number) => {
          P[base + j * 3] = x; P[base + j * 3 + 1] = y; P[base + j * 3 + 2] = z;
          C[cb + j * 4] = tint.r; C[cb + j * 4 + 1] = tint.g; C[cb + j * 4 + 2] = tint.b; C[cb + j * 4 + 3] = al;
        };
        V(0, ax - sx * w0, ay - sy * w0, az - sz * w0, a0); V(1, ax + sx * w0, ay + sy * w0, az + sz * w0, a0); V(2, bx + sx * w1, by + sy * w1, bz + sz * w1, a1);
        V(3, ax - sx * w0, ay - sy * w0, az - sz * w0, a0); V(4, bx + sx * w1, by + sy * w1, bz + sz * w1, a1); V(5, bx - sx * w1, by - sy * w1, bz - sz * w1, a1);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  /** 让烟先「预热」：一出场就已经升起来了，而不是从零开始冒 */
  warm(seconds: number, cam: THREE.Camera, tint: THREE.Color) {
    const step = 1 / 30;
    for (let t = 0; t < seconds; t += step) this.update(step, t, cam, tint);
  }
  dispose() { this.geo.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
