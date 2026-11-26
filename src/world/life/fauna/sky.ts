/**
 * 天上过的鸟：远看本来就是画上的几笔，所以都是「点」上去的笔触（见 ink.ts 的 dabMesh，一次绘制），翅膀一上一下换两格笔触。
 *   雁阵（秋）：七到十三只排成「人」字，自北往南从高空过，叫着；隔一两分钟一行。
 *   寒鸦（冬）：黄昏从南边的田里成群飞回北坡的林子，一路「呱——」地叫，落在光秃秃的树梢上成一个个墨点，一夜都在，天亮了又散开飞走。
 *   归林（春夏秋）：黄昏一团小鸟在屋后竹林上空打两个旋，一个个落进竹子里，叽叽喳喳。
 *   鹤（偶尔）：一对白鹤顺着伊水慢慢飞过去，脖子伸得长长的，两腿拖在后头。
 *   布谷（春、初夏）：远远一只掠过田野，「布谷、布谷」。
 */
import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import type { Quality } from '../../core/World';
import { atlas, ink, stroke, type Tile } from '../../ink/brush';
import { PIG, dabMat, dabMesh, type Dab } from '../../ink/ink';
import { TREES, RIVER_Y, ground } from '../../site';
import type { Ctx } from '../person';
import { camDist, sfx, type Day } from './kit';

// —— 笔触 ——
const W = (g: CanvasRenderingContext2D, pts: Array<[number, number]>, w: number, d = 1) => stroke(g, pts, (t) => w * Math.sin(Math.PI * (0.08 + 0.84 * t)) + 0.006, ink(d));
const dot = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, a = 0, d = 1) => { g.fillStyle = ink(d); g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 6.3); g.fill(); };
const smallUp: Tile = (g) => { dot(g, 0.5, 0.52, 0.06, 0.045); for (const s of [-1, 1]) W(g, [[0.5, 0.52], [0.5 + s * 0.17, 0.4], [0.5 + s * 0.38, 0.3]], 0.09); };
const smallDn: Tile = (g) => { dot(g, 0.5, 0.48, 0.06, 0.045); for (const s of [-1, 1]) W(g, [[0.5, 0.48], [0.5 + s * 0.2, 0.52], [0.5 + s * 0.4, 0.62]], 0.08); };
const gooseUp: Tile = (g) => {
  dot(g, 0.5, 0.56, 0.05, 0.075); W(g, [[0.5, 0.52], [0.5, 0.36], [0.5, 0.26]], 0.035); dot(g, 0.5, 0.25, 0.022, 0.026);
  for (const s of [-1, 1]) W(g, [[0.5, 0.55], [0.5 + s * 0.16, 0.44], [0.5 + s * 0.42, 0.38]], 0.1);
};
const gooseDn: Tile = (g) => {
  dot(g, 0.5, 0.56, 0.05, 0.075); W(g, [[0.5, 0.52], [0.5, 0.36], [0.5, 0.26]], 0.035); dot(g, 0.5, 0.25, 0.022, 0.026);
  for (const s of [-1, 1]) W(g, [[0.5, 0.55], [0.5 + s * 0.18, 0.58], [0.5 + s * 0.43, 0.68]], 0.1);
};
const crow = (up: boolean): Tile => (g) => {
  dot(g, 0.5, 0.5, 0.07, 0.06); dot(g, 0.5, 0.42, 0.04, 0.035);
  // 扇形的尾
  stroke(g, [[0.5, 0.52], [0.5, 0.64], [0.5, 0.7]], (t) => 0.03 + 0.07 * t, ink(1));
  for (const s of [-1, 1]) {
    const tip: [number, number] = up ? [0.5 + s * 0.42, 0.32] : [0.5 + s * 0.43, 0.6];
    W(g, [[0.5, 0.5], [0.5 + s * 0.2, up ? 0.42 : 0.52], tip], 0.14);
    // 翼梢几根分开的「指」
    for (let k = 0; k < 3; k++) stroke(g, [tip, [tip[0] + s * (0.05 + 0.01 * k), tip[1] + (up ? -0.02 : 0.03) + 0.025 * (k - 1)]], (t) => 0.02 * (1 - t), ink(1));
  }
};
const crane = (up: boolean, dir: number): Tile => (g) => {
  // 侧影：长颈朝前（dir），两腿拖在后头
  const x = (v: number) => (dir > 0 ? v : 1 - v);
  dot(g, x(0.47), 0.5, 0.11, 0.04, 0, 0.55);
  stroke(g, [[x(0.56), 0.49], [x(0.72), 0.47], [x(0.88), 0.46]], (t) => 0.025 * (1 - 0.4 * t), ink(0.6));
  dot(g, x(0.9), 0.455, 0.022, 0.016, 0, 0.9); g.fillStyle = ink(0.4, 1); g.beginPath(); g.arc(x(0.905), 0.445, 0.008, 0, 6.3); g.fill();
  stroke(g, [[x(0.37), 0.51], [x(0.2), 0.53], [x(0.06), 0.54]], () => 0.01, ink(0.9));
  // 翅：白的，翅尖、次级飞羽一抹墨
  if (up) { stroke(g, [[x(0.48), 0.49], [x(0.44), 0.32], [x(0.36), 0.14]], (t) => 0.09 * Math.sin(Math.PI * (0.1 + 0.8 * t)), ink(0.35)); stroke(g, [[x(0.4), 0.24], [x(0.36), 0.14]], (t) => 0.05 * (1 - t), ink(1)); }
  else { stroke(g, [[x(0.48), 0.51], [x(0.44), 0.66], [x(0.38), 0.84]], (t) => 0.09 * Math.sin(Math.PI * (0.1 + 0.8 * t)), ink(0.35)); stroke(g, [[x(0.41), 0.76], [x(0.38), 0.84]], (t) => 0.05 * (1 - t), ink(1)); }
};
const perched: Tile = (g) => { dot(g, 0.5, 0.52, 0.12, 0.15); dot(g, 0.5, 0.33, 0.07, 0.065); stroke(g, [[0.5, 0.6], [0.53, 0.78], [0.55, 0.9]], (t) => 0.06 * (1 - 0.5 * t), ink(1)); };
const perchedSmall: Tile = (g) => { dot(g, 0.5, 0.55, 0.09, 0.1, 0, 0.85); dot(g, 0.52, 0.42, 0.055, 0.05, 0, 0.85); stroke(g, [[0.46, 0.6], [0.4, 0.72]], (t) => 0.045 * (1 - t), ink(0.85)); };
const TILE = { smallUp: 0, smallDn: 1, gooseUp: 2, gooseDn: 3, crowUp: 4, crowDn: 5, craneRUp: 6, craneRDn: 7, craneLUp: 8, craneLDn: 9, perched: 10, perchedSmall: 11 };

interface Bird { x: number; y: number; z: number; ph: number; size: number; tile: number; on: boolean; vx: number; vz: number; ox: number; oy: number; oz: number; rot: number }
const N_GEESE = 13, N_CROWS = 28, N_ROOST = 22, N_CRANE = 2, N_CUCKOO = 1;

export class SkyBirds {
  mesh: THREE.Mesh;
  private birds: Bird[] = [];
  private P: Float32Array; private D: Float32Array; private C: Float32Array;
  private pa: THREE.InstancedBufferAttribute; private da: THREE.InstancedBufferAttribute; private ca: THREE.InstancedBufferAttribute;
  private R = mulberry32(2026);
  /** 一行雁：起点、方向、走了多远；没有是 null */
  private geese: { x: number; z: number; y: number; dx: number; dz: number; s: number; L: number; n: number; honk: number } | null = null;
  private geeseNext = 25;
  /** 寒鸦：0 没有；1 往林子飞；2 落在树上；3 早上散开 */
  private crowSt = 0; private crowT = 0; private crowC = new THREE.Vector3(); private crowGoal = new THREE.Vector3(); private crowCaw = 0; private crowDay = -1;
  private perches: THREE.Vector3[] = [];
  private roost = { on: false, t: 0, day: -1, cx: 6, cz: -40 };
  private crane = { on: false, s: 0, next: 60, dir: 1, call: 0 };
  // （头一只布谷在进来一分半钟以后才飞过：刚进门的那一会儿静一些）
  private cuckoo = { on: false, s: 0, next: 100, x0: 0, z0: 0, x1: 0, z1: 0, calls: 0 };
  private dayN = 0; private lastHour = 0;
  /** 头一回看见了：给浮一句话用（雁、鹤） */
  onSight: ((what: 'geese' | 'crane' | 'crows') => void) | null = null;

  constructor(q: Quality) {
    const A = atlas([smallUp, smallDn, gooseUp, gooseDn, crow(true), crow(false), crane(true, 1), crane(false, 1), crane(true, -1), crane(false, -1), perched, perchedSmall], 4, Math.round(128 * Math.max(0.75, q.tex)), 11);
    const n = N_GEESE + N_CROWS + N_ROOST + N_CRANE + N_CUCKOO, dabs: Dab[] = [];
    for (let i = 0; i < n; i++) { dabs.push({ x: 0, y: -500, z: 0, size: 0, tile: 0, sway: 0 }); this.birds.push({ x: 0, y: -500, z: 0, ph: this.R() * 6.28, size: 0, tile: 0, on: false, vx: 0, vz: 0, ox: 0, oy: 0, oz: 0, rot: 0 }); }
    this.mesh = dabMesh(dabs, dabMat({ ...A, pig: PIG.jiao, dens: 1.55, flat: 1, body: 0.15, sway: 0, line: 0, snow: 0 }));
    this.mesh.frustumCulled = false; this.mesh.name = 'sky-birds';
    const a = this.mesh.geometry.attributes;
    this.pa = a.aPos as THREE.InstancedBufferAttribute; this.da = a.aDir as THREE.InstancedBufferAttribute; this.ca = a.aCol as THREE.InstancedBufferAttribute;
    this.P = this.pa.array as Float32Array; this.D = this.da.array as Float32Array; this.C = this.ca.array as Float32Array;
    for (const at of [this.pa, this.da, this.ca]) at.setUsage(THREE.DynamicDrawUsage);
    // 寒鸦落的树：北坡林边几棵（从院里、亭里、村里都望得见）
    const woods = TREES.filter((t) => t.kind === 'wood' && t.z < -36 && t.z > -80 && t.x > -60 && t.x < 110).sort((p, q2) => Math.abs(p.x - 20) - Math.abs(q2.x - 20)).slice(0, 7);
    for (const t of woods) for (let k = 0; k < 4; k++) { const a2 = this.R() * 6.28, r = this.R() * 2.2; this.perches.push(new THREE.Vector3(t.x + Math.cos(a2) * r, ground(t.x, t.z) + (6.2 + 2.2 * this.R()) * t.s, t.z + Math.sin(a2) * r)); }
  }
  private range(kind: 'geese' | 'crows' | 'roost' | 'crane' | 'cuckoo'): [number, number] {
    const o = { geese: 0, crows: N_GEESE, roost: N_GEESE + N_CROWS, crane: N_GEESE + N_CROWS + N_ROOST, cuckoo: N_GEESE + N_CROWS + N_ROOST + N_CRANE }[kind];
    const n = { geese: N_GEESE, crows: N_CROWS, roost: N_ROOST, crane: N_CRANE, cuckoo: N_CUCKOO }[kind];
    return [o, o + n];
  }
  private off(kind: Parameters<SkyBirds['range']>[0]) { const [a, b] = this.range(kind); for (let i = a; i < b; i++) this.birds[i].on = false; }
  /**
   * 叫一行雁从站在 (x, z)、朝 az（度：0 正南，同观象的 far）看的人头顶上过去：自北边来，斜斜地往南偏西去，
   * 一出现就在他眼前的天上（前头一百五十米、略偏左、四十来米高：画的上三分之一，手机竖着也在画里），慢慢走远（观象「渐」）。
   * 天上已经有一行（多半在别处、看不见）：就叫那一行改走这一条。下一行照常隔一两分钟。
   */
  geeseAcross(x: number, z: number, az: number) {
    const a = ((az - 8) * Math.PI) / 180, dx = Math.sin(a), dz = Math.cos(a), f = (az * Math.PI) / 180, fx = Math.sin(f), fz = Math.cos(f);
    // 起处：看的方向前头 150 米、往左（东）15 米
    const sx = x + fx * 150 + fz * 15, sz = z + fz * 150 - fx * 15;
    this.geese = { x: sx, z: sz, y: ground(x, z) + 46, dx, dz, s: 0, L: 640, n: 9, honk: 0.6 };
    this.geeseNext = Math.max(this.geeseNext, 80);
  }

  update(c: Ctx, day: Day) {
    const R = this.R, dt = c.dt, t = c.t, h = c.hour;
    if (h < this.lastHour - 12) this.dayN++;
    this.lastHour = h;
    const clear = c.rain < 0.4 && c.snow < 0.5;
    const outdoorsY = ground(c.player.x, c.player.z);
    // —— 雁阵 ——
    this.geeseNext -= dt;
    if (!this.geese && c.season === 'autumn' && clear && c.night < 0.6 && this.geeseNext < 0) {
      // 自北往南（略偏西）从人头顶一侧过
      const a = Math.PI + (R() - 0.5) * 0.6, dx = Math.sin(a + Math.PI), dz = Math.cos(a + Math.PI), side = (R() - 0.5) * 220;
      const L = 900, n = 7 + 2 * Math.floor(R() * 4);
      this.geese = { x: c.player.x - dx * L / 2 + dz * side, z: c.player.z - dz * L / 2 - dx * side, y: outdoorsY + 80 + R() * 45, dx, dz, s: 0, L, n, honk: 2 };
      this.geeseNext = 70 + R() * 110;
    }
    if (this.geese) {
      const G = this.geese, [a0] = this.range('geese');
      G.s += 13 * dt;
      const lx = G.x + G.dx * G.s, lz = G.z + G.dz * G.s;
      for (let i = 0; i < N_GEESE; i++) {
        const b = this.birds[a0 + i];
        if (i >= G.n) { b.on = false; continue; }
        // 人字：领头一只，两翼各一串
        const arm = i === 0 ? 0 : i % 2 ? 1 : -1, k = Math.ceil(i / 2), back = k * 3.4, lat = arm * k * 2.3;
        b.on = true;
        b.x = lx - G.dx * back + G.dz * lat + Math.sin(t * 0.3 + i) * 0.5; b.z = lz - G.dz * back - G.dx * lat + Math.cos(t * 0.27 + i) * 0.5; b.y = G.y + Math.sin(t * 0.5 + i * 0.7) * 0.6 - k * 0.15;
        b.size = 2.1; b.ph += dt * (2.2 + 0.1 * (i % 3));
        b.tile = Math.sin(b.ph * Math.PI) > 0 ? TILE.gooseUp : TILE.gooseDn; b.rot = 0;
      }
      G.honk -= dt;
      const dd = Math.hypot(lx - c.player.x, lz - c.player.z);
      if (G.honk < 0 && dd < 420) { G.honk = 4 + R() * 5; sfx(c, 'geese', lx, lz, 0.6); if (dd < 300) this.onSight?.('geese'); }
      if (G.s > G.L) { this.geese = null; this.off('geese'); }
    }
    // —— 寒鸦（冬天黄昏归林、夜里栖着、天亮散开） ——
    const [c0, c1] = this.range('crows');
    if (c.season === 'winter') {
      const dusk = h > day.ss - 0.9 && h < day.ss + 0.4, nightish = h > day.ss + 0.4 || h < day.sr + 0.2;
      if (this.crowSt === 0 && dusk && clear && this.crowDay !== this.dayN) {
        this.crowSt = 1; this.crowT = 0; this.crowDay = this.dayN;
        this.crowC.set(c.player.x - 40 + R() * 80, outdoorsY + 32, 150 + R() * 60); this.crowGoal.set(20, outdoorsY + 22, -55);
        for (let i = c0; i < c1; i++) { const b = this.birds[i]; b.on = true; b.ox = (R() - 0.5) * 30; b.oy = (R() - 0.5) * 8; b.oz = (R() - 0.5) * 22; b.ph = R() * 6; }
      }
      if (this.crowSt === 0 && nightish && !c.wound) { /* 没赶上黄昏：夜里直接在树上 */ }
      if ((this.crowSt === 0 || c.wound) && nightish && this.perches.length) { this.crowSt = 2; for (let i = c0; i < c1; i++) { const b = this.birds[i], p = this.perches[(i - c0) % this.perches.length]; b.on = true; b.x = p.x + (R() - 0.5) * 0.4; b.y = p.y; b.z = p.z; } }
      if (this.crowSt === 1) {
        // 一大团往北飞：各自绕着团心飘，翅膀扇几下滑一段
        this.crowT += dt;
        const k = Math.min(1, this.crowT / 75);
        const cx = this.crowC.x + (this.crowGoal.x - this.crowC.x) * k, cz = this.crowC.z + (this.crowGoal.z - this.crowC.z) * k, cy = this.crowC.y + (this.crowGoal.y - this.crowC.y) * k;
        const spread = 1 - 0.75 * k;
        for (let i = c0; i < c1; i++) {
          const b = this.birds[i], j = i - c0;
          if (k > 0.85 && this.perches.length) {
            // 一只只落到树梢上
            const p = this.perches[j % this.perches.length], m = Math.min(1, (k - 0.85) / 0.15);
            b.x += (p.x - b.x) * Math.min(1, dt * 1.5 * m); b.y += (p.y - b.y) * Math.min(1, dt * 1.5 * m); b.z += (p.z - b.z) * Math.min(1, dt * 1.5 * m);
          } else {
            b.x = cx + (b.ox + 6 * Math.sin(t * 0.21 + j)) * spread; b.y = cy + b.oy * spread + 2 * Math.sin(t * 0.4 + j * 1.3); b.z = cz + (b.oz + 5 * Math.cos(t * 0.17 + j * 0.7)) * spread;
          }
          b.size = 0.95; b.ph += dt * 3.2;
          b.tile = Math.sin(t * 0.7 + j) > 0.35 ? TILE.crowDn : Math.sin(b.ph * Math.PI) > 0 ? TILE.crowUp : TILE.crowDn;
        }
        this.crowCaw -= dt;
        if (this.crowCaw < 0) { this.crowCaw = 1.5 + R() * 3; const b = this.birds[c0 + Math.floor(R() * N_CROWS)]; if (Math.hypot(b.x - c.player.x, b.z - c.player.z) < 300) { sfx(c, 'crow', b.x, b.z, 0.55); this.onSight?.('crows'); } }
        if (k >= 1) this.crowSt = 2;
      } else if (this.crowSt === 2) {
        for (let i = c0; i < c1; i++) { const b = this.birds[i]; b.size = 0.62; b.tile = TILE.perched; }
        this.crowCaw -= dt;
        if (this.crowCaw < 0 && h > day.ss) { this.crowCaw = 8 + R() * 20; const b = this.birds[c0]; if (Math.hypot(b.x - c.player.x, b.z - c.player.z) < 200 && c.night < 0.9) sfx(c, 'crow', b.x, b.z, 0.3); }
        if (h > day.sr + 0.2 && h < 12) { this.crowSt = 3; this.crowT = 0; for (let i = c0; i < c1; i++) { const b = this.birds[i]; b.vx = (R() - 0.5) * 6; b.vz = 6 + R() * 6; } }
      } else if (this.crowSt === 3) {
        this.crowT += dt;
        for (let i = c0; i < c1; i++) { const b = this.birds[i]; b.x += b.vx * dt; b.z += b.vz * dt; b.y += 1.5 * dt; b.size = 0.95; b.ph += dt * 3.2; b.tile = Math.sin(b.ph * Math.PI) > 0 ? TILE.crowUp : TILE.crowDn; }
        if (this.crowT > 40) { this.crowSt = 0; this.off('crows'); }
      }
    } else if (this.crowSt) { this.crowSt = 0; this.off('crows'); }
    // —— 归林：黄昏一团小鸟在竹林上空打旋、落进去 ——
    const [r0, r1] = this.range('roost'), RO = this.roost;
    if (c.season !== 'winter' && clear && h > day.ss - 0.55 && h < day.ss + 0.1 && RO.day !== this.dayN && !RO.on) { RO.on = true; RO.t = 0; RO.day = this.dayN; for (let i = r0; i < r1; i++) { const b = this.birds[i]; b.on = true; b.ox = (R() - 0.5) * 10; b.oy = (R() - 0.5) * 3; b.oz = (R() - 0.5) * 8; b.ph = R() * 6; } }
    if (RO.on) {
      RO.t += dt;
      const gy = ground(RO.cx, RO.cz);
      for (let i = r0; i < r1; i++) {
        const b = this.birds[i], j = i - r0, sink = Math.max(0, (RO.t - 26 - j * 0.6) / 4);
        const a = t * 0.55 + j * 0.31, r = 9 + 3 * Math.sin(t * 0.3 + j);
        b.x = RO.cx + Math.cos(a) * r + b.ox * 0.4; b.z = RO.cz + Math.sin(a) * r * 0.6 + b.oz * 0.4; b.y = gy + 14 + b.oy + 2 * Math.sin(t * 0.8 + j) - sink * 9;
        b.size = 0.42; b.ph += dt * 9; b.tile = Math.sin(b.ph * Math.PI) > 0 ? TILE.smallUp : TILE.smallDn;
        b.on = sink < 1;
      }
      if (RO.t > 4 && RO.t < 30 && Math.floor(RO.t * 0.5) !== Math.floor((RO.t - dt) * 0.5) && camDist(c, RO.cx, RO.cz) < 120) sfx(c, 'sparrow', RO.cx, RO.cz, 0.45);
      if (RO.t > 26 + N_ROOST * 0.6 + 4) { RO.on = false; this.off('roost'); }
    }
    // —— 鹤：一对顺着伊水飞过 ——
    const CR = this.crane, [k0] = this.range('crane');
    CR.next -= dt;
    if (!CR.on && CR.next < 0 && c.night < 0.5 && clear && camDist(c, 120, 230) < 700) { CR.on = true; CR.s = 0; CR.dir = R() < 0.5 ? 1 : -1; CR.call = 3; }
    if (CR.on) {
      CR.s += 9 * dt;
      const x = CR.dir > 0 ? -260 + CR.s : 520 - CR.s;
      for (let i = 0; i < N_CRANE; i++) {
        const b = this.birds[k0 + i];
        b.on = true; b.x = x - CR.dir * i * 7; b.z = 262 + i * 4 + 8 * Math.sin(CR.s * 0.01 + i); b.y = RIVER_Y + 30 + 3 * Math.sin(CR.s * 0.02 + i * 2) + i * 2;
        b.ph += dt * 0.75; b.size = 3.4;
        // 侧影朝哪：看它在画面上往左还是往右
        _v.set(b.x, b.y, b.z).project(c.camera); _w.set(b.x + CR.dir, b.y, b.z).project(c.camera);
        const right = _w.x > _v.x, up = Math.sin(b.ph * Math.PI * 2) > 0;
        b.tile = right ? (up ? TILE.craneRUp : TILE.craneRDn) : up ? TILE.craneLUp : TILE.craneLDn; b.rot = 0;
      }
      CR.call -= dt;
      const lead = this.birds[k0], dd = Math.hypot(lead.x - c.player.x, lead.z - c.player.z);
      if (CR.call < 0 && dd < 360) { CR.call = 9 + R() * 8; sfx(c, 'crane', lead.x, lead.z, 0.6); this.onSight?.('crane'); }
      if (CR.s > 780) { CR.on = false; this.off('crane'); CR.next = 200 + R() * 260; }
    }
    // —— 布谷：春、初夏，远远一只掠过田野 ——
    const CU = this.cuckoo, [u0] = this.range('cuckoo');
    CU.next -= dt;
    if (!CU.on && CU.next < 0 && (c.season === 'spring' || (c.season === 'summer' && h < 12)) && c.night < 0.4 && clear) {
      CU.on = true; CU.s = 0; CU.calls = 3; const left = R() < 0.5;
      CU.x0 = left ? -80 : 110; CU.x1 = left ? 110 : -80; CU.z0 = 70 + R() * 50; CU.z1 = 70 + R() * 50;
    }
    if (CU.on) {
      CU.s += dt / 22;
      const b = this.birds[u0];
      b.on = true; b.x = CU.x0 + (CU.x1 - CU.x0) * CU.s; b.z = CU.z0 + (CU.z1 - CU.z0) * CU.s; b.y = ground(b.x, b.z) + 12 + 3 * Math.sin(CU.s * 9);
      b.size = 0.55; b.ph += dt * 6; b.tile = Math.sin(b.ph * Math.PI) > -0.2 ? TILE.smallUp : TILE.smallDn;
      if (CU.calls > 0 && CU.s > 0.25 + (3 - CU.calls) * 0.15) { CU.calls--; sfx(c, 'cuckoo', b.x, b.z, 0.55); }
      if (CU.s >= 1) { CU.on = false; b.on = false; CU.next = 90 + R() * 120; }
    }
    // —— 写进几何 ——
    const P = this.P, D = this.D, C = this.C;
    let any = false;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i], o = i * 4;
      if (!b.on) { if (P[o + 3] !== 0) { P[o + 3] = 0; P[o + 1] = -500; } continue; }
      any = true;
      P[o] = b.x; P[o + 1] = b.y; P[o + 2] = b.z; P[o + 3] = b.size;
      D[o + 3] = b.tile; C[o + 3] = b.rot;
    }
    this.mesh.visible = any;
    if (any || c.frame % 30 === 0) { this.pa.needsUpdate = true; this.da.needsUpdate = true; this.ca.needsUpdate = true; }
  }
}
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
