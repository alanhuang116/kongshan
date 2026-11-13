/**
 * 虫：蝶（春天，桃林里、菜花上）、蜻蜓（夏天，池上）、萤（夏夜，溪边竹下）、蜂（瓜架旁）。
 * 都是「点」上去的：每只是一笔（一张朝着看画人的小方片，见 ink.ts 的 dabMesh），一种一次绘制；每帧只改它们的位置。
 */
import * as THREE from 'three';
import { mulberry32, type Rng } from '../core/rng';
import type { Quality } from '../core/World';
import { atlas, ink, stroke, type Tile } from '../ink/brush';
import { dabMat, dabMesh, type Dab, type RGB } from '../ink/ink';
import { PATHS, PLOTS, SITE, STREAM, TREES, ground } from '../site';
import type { Ctx } from './person';

// —— 笔触：蝶（张着、半合）、蜻蜓、一点萤火、蜂 ——
const butterfly = (fold: number): Tile => (g) => {
  g.save(); g.translate(0.5, 0.5); g.scale(fold, 1); g.translate(-0.5, -0.5);
  for (const s of [-1, 1]) {
    g.fillStyle = ink(0.55); g.beginPath(); g.ellipse(0.5 + s * 0.2, 0.38, 0.21, 0.16, s * 0.55, 0, 6.3); g.fill();
    g.fillStyle = ink(0.75); g.beginPath(); g.ellipse(0.5 + s * 0.15, 0.64, 0.13, 0.12, -s * 0.4, 0, 6.3); g.fill();
    g.fillStyle = ink(1, 1); g.beginPath(); g.ellipse(0.5 + s * 0.3, 0.3, 0.05, 0.04, 0, 0, 6.3); g.fill();
  }
  g.restore();
  stroke(g, [[0.5, 0.26], [0.5, 0.5], [0.5, 0.74]], (t) => 0.06 * Math.sin(Math.PI * (0.1 + 0.8 * t)) + 0.02, ink(1, 1));
};
const dragonfly: Tile = (g) => {
  for (const s of [-1, 1]) {
    stroke(g, [[0.5, 0.34], [0.5 + s * 0.24, 0.27], [0.5 + s * 0.45, 0.25]], (t) => 0.085 * Math.sin(Math.PI * (0.15 + 0.8 * t)), ink(0.35));
    stroke(g, [[0.5, 0.4], [0.5 + s * 0.22, 0.44], [0.5 + s * 0.42, 0.5]], (t) => 0.085 * Math.sin(Math.PI * (0.15 + 0.8 * t)), ink(0.35));
  }
  stroke(g, [[0.5, 0.2], [0.5, 0.5], [0.5, 0.92]], (t) => 0.075 - 0.045 * t, ink(1, 1));
  g.fillStyle = ink(1, 1); g.beginPath(); g.arc(0.5, 0.2, 0.06, 0, 6.3); g.fill();
};
const glow: Tile = (g) => { g.fillStyle = ink(0.3); g.beginPath(); g.arc(0.5, 0.5, 0.3, 0, 6.3); g.fill(); g.fillStyle = ink(0.1); g.beginPath(); g.arc(0.5, 0.5, 0.16, 0, 6.3); g.fill(); };
const bee: Tile = (g) => {
  for (const s of [-1, 1]) { g.fillStyle = ink(0.25); g.beginPath(); g.ellipse(0.5 + s * 0.2, 0.36, 0.2, 0.1, s * 0.5, 0, 6.3); g.fill(); }
  g.fillStyle = ink(1, 1); g.beginPath(); g.ellipse(0.5, 0.55, 0.13, 0.2, 0, 0, 6.3); g.fill();
};

interface Bug { hx: number; hy: number; hz: number; r: number; ph: number; sp: number; x: number; y: number; z: number; tx: number; ty: number; tz: number; t: number }
/** 一群虫：一个网格。每只绕着自己的「家」转 */
class Swarm {
  mesh: THREE.Mesh; bugs: Bug[] = [];
  P: Float32Array; D: Float32Array; C: Float32Array;
  private pa: THREE.BufferAttribute; private da: THREE.BufferAttribute; private ca: THREE.BufferAttribute;
  constructor(homes: Array<[number, number, number, number]>, per: number, size: number, mat: THREE.ShaderMaterial, R: Rng, tint?: (i: number) => RGB) {
    const dabs: Dab[] = [];
    homes.forEach(([x, y, z, r]) => { for (let k = 0; k < per; k++) { this.bugs.push({ hx: x, hy: y, hz: z, r, ph: R() * 6.28, sp: 0.7 + 0.6 * R(), x, y, z, tx: x, ty: y, tz: z, t: 0 }); const c = tint?.(dabs.length) ?? [1, 1, 1]; dabs.push({ x, y, z, size: size * (0.85 + 0.3 * R()), tile: 0, r: c[0], g: c[1], b: c[2], rot: R() * 6.28, sway: 0 }); } });
    this.mesh = dabMesh(dabs, mat);
    this.mesh.frustumCulled = false;
    const a = this.mesh.geometry.attributes;
    this.pa = a.aPos as THREE.BufferAttribute; this.da = a.aDir as THREE.BufferAttribute; this.ca = a.aCol as THREE.BufferAttribute;
    this.P = this.pa.array as Float32Array; this.D = this.da.array as Float32Array; this.C = this.ca.array as Float32Array;
    for (const at of [this.pa, this.da, this.ca]) at.setUsage(THREE.DynamicDrawUsage);
  }
  commit(dir = false, col = false) { this.pa.needsUpdate = true; if (dir) this.da.needsUpdate = true; if (col) this.ca.needsUpdate = true; }
  /** 整群显多少（0 不显） */
  show(a: number) { this.mesh.visible = a > 0.02; (this.mesh.material as THREE.ShaderMaterial).uniforms.uQ.value.z = a; }
}

export interface Insects { group: THREE.Group; update(c: Ctx): void }

export function makeInsects(q: Quality, more: { trellis?: { x: number; z: number } } = {}): Insects {
  const group = new THREE.Group(), R = mulberry32(404);
  group.name = 'insects';
  const A = atlas([butterfly(1), butterfly(0.42), dragonfly, glow, bee], 4, Math.round(96 * Math.max(0.75, q.tex)), 5);
  const gy = (x: number, z: number) => ground(x, z);
  const n = (k: number) => Math.max(1, Math.round(k * (0.5 + 0.5 * q.density)));

  // —— 蝶：桃林的路旁、几畦菜花、菊圃 ——
  const bHomes: Array<[number, number, number, number]> = [];
  const grove = PATHS.find((p) => p.id === '桃林')!.pts;
  for (let i = 1; i < grove.length - 1; i++) bHomes.push([grove[i][0] + (R() - 0.5) * 6, 0, grove[i][1] + (R() - 0.5) * 5, 3.2]);
  for (const p of PLOTS) if (p.crop === 'rape') bHomes.push([(p.x0 + p.x1) / 2 + (R() - 0.5) * 8, 0, (p.z0 + p.z1) / 2 + (R() - 0.5) * 8, 5.5]);
  const peach = TREES.filter((t) => t.kind === 'peach' && t.x > -60);
  for (let i = 0; i < 3 && i < peach.length; i++) bHomes.push([peach[i * 3 % peach.length].x, 0, peach[i * 3 % peach.length].z, 2.6]);
  for (const h of bHomes) h[1] = gy(h[0], h[2]) + 0.9;
  const flies = new Swarm(bHomes, n(3), 0.13, dabMat({ ...A, pig: [0.99, 0.98, 0.93], accent: [0.42, 0.36, 0.34], dens: 0.9, shade: 1.1, body: 1, sway: 0 }), R, (i) => (i % 3 === 0 ? [1, 0.95, 0.66] : i % 3 === 1 ? [1, 1, 1] : [1, 0.9, 0.86]));
  // —— 蜻蜓：池上、池的西岸 ——
  const Pd = SITE.pond, dHomes: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n(9); i++) { const a = R() * 6.28, r = 0.3 + 0.8 * R(); dHomes.push([Pd.x + Math.cos(a) * Pd.rx * r, Pd.y + 0.35 + 0.5 * R(), Pd.z + Math.sin(a) * Pd.rz * r, 2.2]); }
  const dragons = new Swarm(dHomes, 1, 0.16, dabMat({ ...A, pig: [0.86, 0.9, 0.9], accent: [0.72, 0.36, 0.3], dens: 0.8, shade: 1.1, body: 0.4, sway: 0 }), R, (i) => (i % 2 ? [1, 1, 1] : [0.8, 0.9, 1]));
  // —— 萤：溪边（桥的上下游）、屋后的竹丛下、池边 ——
  const fHomes: Array<[number, number, number, number]> = [];
  for (let i = 0; i < STREAM.length; i += 2) { const p = STREAM[i]; if (p.x > -46 && p.x < 44) fHomes.push([p.x + (R() - 0.5) * 3, p.y + 0.5 + R() * 0.9, p.z + (R() < 0.5 ? -1 : 1) * (p.w + 0.6 + R() * 2.4), 1.8]); }
  for (const t of TREES) if (t.kind === 'bamboo' && R() < 0.5) fHomes.push([t.x + (R() - 0.5) * 3, gy(t.x, t.z) + 0.5 + R() * 1.4, t.z + 1.5 + R() * 2, 2.2]);
  for (let i = 0; i < 5; i++) { const a = R() * 6.28; fHomes.push([Pd.x + Math.cos(a) * Pd.rx * 1.08, Pd.y + 0.4 + R() * 0.7, Pd.z + Math.sin(a) * Pd.rz * 1.08, 1.6]); }
  const fires = new Swarm(fHomes, n(2), 0.075, dabMat({ ...A, pig: [0.92, 1, 0.55], dens: 0.7, flat: 1, body: 1, sway: 0 }), R);
  // —— 蜂：瓜架旁（夏天；瓜架在哪由总图给，没有就不放） ——
  const bees = more.trellis ? new Swarm([[more.trellis.x, gy(more.trellis.x, more.trellis.z) + 1.5, more.trellis.z, 1.5]], n(6), 0.05, dabMat({ ...A, pig: [0.95, 0.95, 0.9], accent: [0.62, 0.5, 0.3], dens: 1, shade: 1.1, body: 0.6, sway: 0 }), R) : null;
  group.add(flies.mesh, dragons.mesh, fires.mesh);
  if (bees) group.add(bees.mesh);
  for (let i = 0; i < dragons.bugs.length; i++) dragons.D[i * 4 + 3] = 2;
  for (let i = 0; i < fires.bugs.length; i++) fires.D[i * 4 + 3] = 3;
  if (bees) for (let i = 0; i < bees.bugs.length; i++) bees.D[i * 4 + 3] = 4;
  dragons.commit(true); fires.commit(true); bees?.commit(true);

  return {
    group,
    update(c) {
      const t = c.t, dt = c.dt, day = 1 - c.night, dry = c.rain < 0.4 && c.snow < 0.3 ? 1 : 0;
      // 蝶：绕着一处忽上忽下地飞；翅一开一合（换两格笔触）
      flies.show(c.season === 'spring' ? day * dry : 0);
      if (flies.mesh.visible) {
        flies.bugs.forEach((b, i) => {
          const u = t * 0.33 * b.sp + b.ph, o = i * 4;
          flies.P[o] = b.hx + b.r * Math.sin(u) * Math.cos(u * 0.37 + b.ph); flies.P[o + 2] = b.hz + b.r * Math.sin(u * 0.83 + 1) * Math.cos(u * 0.29);
          flies.P[o + 1] = b.hy + 0.45 * Math.sin(u * 1.7) + 0.08 * Math.sin(t * 7 * b.sp + b.ph);
          flies.D[o + 3] = Math.sin(t * 13 * b.sp + b.ph) > 0 ? 0 : 1;
          flies.C[o + 3] = 0.6 * Math.sin(u * 1.3 + b.ph);
        });
        flies.commit(true, true);
      }
      // 蜻蜓：停一停，倏地换一处
      dragons.show(c.season === 'summer' ? day * dry : 0);
      if (dragons.mesh.visible) {
        dragons.bugs.forEach((b, i) => {
          b.t -= dt;
          if (b.t < 0) { b.t = 0.6 + R() * 2.2; const a = R() * 6.28, r = R() * b.r; b.tx = b.hx + Math.cos(a) * r; b.tz = b.hz + Math.sin(a) * r; b.ty = b.hy + (R() - 0.5) * 0.5; dragons.C[i * 4 + 3] = Math.atan2(b.tx - b.x, b.tz - b.z); }
          const k = Math.min(1, dt * 7);
          b.x += (b.tx - b.x) * k; b.y += (b.ty - b.y) * k; b.z += (b.tz - b.z) * k;
          const o = i * 4; dragons.P[o] = b.x; dragons.P[o + 1] = b.y + 0.02 * Math.sin(t * 9 + b.ph); dragons.P[o + 2] = b.z;
        });
        dragons.commit(false, true);
      }
      // 萤：夏夜，慢慢地飘，一明一灭
      const dark = Math.max(0, (c.night - 0.55) / 0.45);
      fires.show(c.season === 'summer' ? dark * dry : 0);
      if (fires.mesh.visible) {
        fires.bugs.forEach((b, i) => {
          const u = t * 0.12 * b.sp + b.ph, o = i * 4, lit = Math.max(0, Math.sin(t * 0.8 * b.sp + b.ph * 3)) ** 2;
          fires.P[o] = b.hx + b.r * Math.sin(u); fires.P[o + 2] = b.hz + b.r * Math.sin(u * 0.7 + b.ph); fires.P[o + 1] = b.hy + 0.35 * Math.sin(u * 1.9);
          fires.P[o + 3] = 0.03 + 0.07 * lit;
        });
        fires.commit();
      }
      if (bees) {
        bees.show(c.season === 'summer' || c.season === 'spring' ? day * dry : 0);
        if (bees.mesh.visible) { bees.bugs.forEach((b, i) => { const u = t * 1.1 * b.sp + b.ph, o = i * 4; bees.P[o] = b.hx + b.r * Math.sin(u) * Math.cos(u * 0.41); bees.P[o + 2] = b.hz + b.r * Math.sin(u * 0.77 + 2); bees.P[o + 1] = b.hy + 0.35 * Math.sin(u * 1.3) + 0.02 * Math.sin(t * 30); }); bees.commit(); }
      }
    },
  };
}
