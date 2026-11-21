/**
 * 钓鱼的器物：一根竹竿（会弯）、一根钓丝、一枚芦管做的浮子、一尾鱼（上了钩才出来）、一只竹鱼篓，坐的一块平石。
 * 竿与丝每帧改点，不重建几何；鱼是几笔扁扁的身子，挂在丝头上扑腾。
 */
import * as THREE from 'three';
import { lathe, merge } from '../core/geo';
import { dye } from '../build/kit';
import { Line, inkGeo, mats } from './kit';

/** 一根会弯的管：n 圈，每圈 sides 个点；每帧给一串中心点与半径，就地改顶点 */
export class Tube {
  mesh: THREE.Mesh;
  private pos: Float32Array; private nor: Float32Array;
  constructor(private n: number, private sides: number, mat: THREE.Material, private radius: (t: number) => number) {
    const g = new THREE.BufferGeometry(), v = n * sides;
    this.pos = new Float32Array(v * 3); this.nor = new Float32Array(v * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    const uv = new Float32Array(v * 2);
    for (let i = 0; i < n; i++) for (let j = 0; j < sides; j++) { uv[(i * sides + j) * 2] = (j / sides) * 0.05; uv[(i * sides + j) * 2 + 1] = i * 0.4; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(v * 3).fill(1), 3));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + ((j + 1) % sides), c = a + sides, d = b + sides;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
  }
  private t = new THREE.Vector3(); private u = new THREE.Vector3(); private w = new THREE.Vector3(); private ref = new THREE.Vector3(0, 1, 0);
  set(pts: THREE.Vector3[]) {
    const P = this.pos, N = this.nor, n = this.n, s = this.sides;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i], r = this.radius(i / (n - 1));
      this.t.subVectors(b, a).normalize();
      this.ref.set(0, 1, 0); if (Math.abs(this.t.y) > 0.95) this.ref.set(1, 0, 0);
      this.u.crossVectors(this.t, this.ref).normalize(); this.w.crossVectors(this.u, this.t);
      for (let j = 0; j < s; j++) {
        const an = (j / s) * Math.PI * 2, c = Math.cos(an), sn = Math.sin(an), k = (i * s + j) * 3;
        const nx = this.u.x * c + this.w.x * sn, ny = this.u.y * c + this.w.y * sn, nz = this.u.z * c + this.w.z * sn;
        N[k] = nx; N[k + 1] = ny; N[k + 2] = nz;
        P[k] = p.x + nx * r; P[k + 1] = p.y + ny * r; P[k + 2] = p.z + nz * r;
      }
    }
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true; (g.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
    g.computeBoundingSphere();
  }
}

/** 浮子：一截芦管，上半截染一点朱（好看见），原点在水线上 */
export function floatGeo(): THREE.BufferGeometry {
  const body = dye(lathe([[0.001, -0.05], [0.006, -0.04], [0.007, 0.0], [0.006, 0.05], [0.004, 0.09], [0.001, 0.1]], 6), [0.93, 0.88, 0.72], 1.2);
  const top = dye(lathe([[0.0042, 0.05], [0.0045, 0.07], [0.0035, 0.095], [0.001, 0.102]], 6), [0.92, 0.55, 0.45], 1.1);
  return merge([body, top]);
}
/** 一尾鱼：扁扁的身子（沿 +z 是头），背深腹浅；尾巴单独一块好摆 */
export function fishGeo(len: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const L = len, H = len * 0.26;
  s.moveTo(L * 0.5, 0); s.quadraticCurveTo(L * 0.3, H * 0.55, -L * 0.18, H * 0.4); s.lineTo(-L * 0.36, H * 0.08);
  s.lineTo(-L * 0.5, H * 0.42); s.lineTo(-L * 0.47, 0); s.lineTo(-L * 0.5, -H * 0.42); s.lineTo(-L * 0.36, -H * 0.08);
  s.lineTo(-L * 0.18, -H * 0.38); s.quadraticCurveTo(L * 0.3, -H * 0.5, L * 0.5, 0);
  const g0 = new THREE.ExtrudeGeometry(s, { depth: len * 0.07, bevelEnabled: true, bevelThickness: len * 0.03, bevelSize: len * 0.025, bevelSegments: 1, curveSegments: 6 });
  g0.translate(0, 0, -len * 0.035);
  // 平放的形状是在 xy 里：转成头朝 +z、背朝 +y
  g0.rotateY(-Math.PI / 2);
  const g = inkGeo(g0);
  const p = g.attributes.position as THREE.BufferAttribute, c = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / H; const k = y > 0.1 ? 0.62 : y > -0.15 ? 0.8 : 0.95; c.setXYZ(i, k * 0.96, k * 0.97, k * 0.95); }
  return g;
}

export function makeRodKit() {
  const M = mats();
  const rod = new Tube(10, 5, M.bamboo, (t) => 0.0085 * (1 - t) + 0.0028 * t);
  rod.mesh.name = 'play:rod';
  const line = new Line(18, 0.0035);
  line.mesh.name = 'play:fishline';
  const float = new THREE.Mesh(floatGeo(), M.obj);
  float.name = 'play:float';
  const fish = new THREE.Mesh(fishGeo(0.2), M.obj);
  fish.name = 'play:fish';
  return { rod, line, float, fish };
}
/** 鱼篓（钓的时候放在身边） */
export function seatGeo(): { creel: THREE.BufferGeometry } {
  const creel = merge([
    lathe([[0.001, 0], [0.075, 0], [0.105, 0.07], [0.115, 0.15], [0.095, 0.22], [0.055, 0.26], [0.05, 0.3], [0.062, 0.315], [0.048, 0.32], [0.04, 0.29], [0.001, 0.27]], 12),
  ]);
  return { creel };
}
