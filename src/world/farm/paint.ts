/**
 * 田里的笔：行者那几畦的庄稼（按此刻长到哪一步、每一垄做到哪儿）、草、割倒铺着的麦、捆好立着的麦捆、地头邻家放下的那一垛；
 * 挨着的邻家那片麦（按季节，夏天割到哪儿）；晒场上摊开的麦、打下来的秸秆。另有飞起来的那些（土、种子、水、糠、麦粒、草屑）。
 *
 * 笔都是点叶那一套（docs/INK.md：dabMat / dabMesh）：一种材质一次绘制。笔的个数会变，所以池子先开够大，
 * 重画时把数重写一遍、改 instanceCount。每一笔的位置、大小都由坐标算出来的伪随机定（重画时不跳）。
 */
import * as THREE from 'three';
import { dabMat, dabMesh, type Dab } from '../ink/ink';
import type { Atlas } from '../ink/brush';
import { GROW, type CropId, type Season, type Stage } from '../../data/farm';
import { binds, perRow, rowDir, VILLAGE_ROWS, type Bed, type FarmState, type Floor } from './model';
import { BED_GEO, END, FLOOR, HEAP, PLOT, VILLAGE, rowLen, type BedGeo } from './layout';
import { T } from './tiles';

type RGB = [number, number, number];
/** 由几个整数定一个 0…1 的数（同样的坐标总是同一个数，重画时笔不跳） */
export function h3(a: number, b: number, c: number): number { const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return s - Math.floor(s); }

/** 一池笔：开好 cap 个，按需写 */
export class DabPool {
  mesh: THREE.Mesh;
  private P: Float32Array; private D: Float32Array; private C: Float32Array; private n = 0;
  constructor(public cap: number, mat: THREE.ShaderMaterial, name: string, center: THREE.Vector3, radius: number) {
    const dummy: Dab[] = new Array(cap).fill(0).map(() => ({ x: center.x, y: center.y, z: center.z, size: 0 }));
    this.mesh = dabMesh(dummy, mat);
    this.mesh.name = name;
    const g = this.mesh.geometry as THREE.InstancedBufferGeometry;
    this.P = (g.attributes.aPos as THREE.InstancedBufferAttribute).array as Float32Array;
    this.D = (g.attributes.aDir as THREE.InstancedBufferAttribute).array as Float32Array;
    this.C = (g.attributes.aCol as THREE.InstancedBufferAttribute).array as Float32Array;
    g.boundingSphere = new THREE.Sphere(center.clone(), radius);
    g.boundingBox = new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(radius * 2, radius * 2, radius * 2));
    g.instanceCount = 0;
  }
  begin() { this.n = 0; }
  get count() { return this.n; }
  /** 一笔：位置（笔的中心）、大小、格、颜色、转、摆；朝外的方向（定阴阳） */
  put(x: number, y: number, z: number, size: number, tile: number, c: RGB, rot = 0, sway = 0.5, nx = 0, ny = 1, nz = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++ * 4, l = Math.hypot(nx, ny, nz) || 1;
    this.P[i] = x; this.P[i + 1] = y; this.P[i + 2] = z; this.P[i + 3] = size;
    this.D[i] = nx / l; this.D[i + 1] = ny / l; this.D[i + 2] = nz / l; this.D[i + 3] = Math.floor(tile) + Math.min(0.49, Math.max(0, sway * 0.5));
    this.C[i] = c[0]; this.C[i + 1] = c[1]; this.C[i + 2] = c[2]; this.C[i + 3] = rot;
  }
  end() {
    const g = this.mesh.geometry as THREE.InstancedBufferGeometry;
    g.instanceCount = this.n;
    for (const k of ['aPos', 'aDir', 'aCol']) { const a = g.attributes[k] as THREE.InstancedBufferAttribute; a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(4, this.n * 4)); }
    this.mesh.visible = this.n > 0;
  }
}
/** 田里笔的材质（淡彩，颜料写在每一笔上） */
export const fieldMat = (A: Atlas) => dabMat({ ...A, pig: [1, 1, 1], dens: 1.15, shade: 1.3, snow: 1, sway: 0.3 });

/** 一样庄稼在某一步、某一季的笔：格、大小、颜色、笔心离地几成、摆多少 */
interface Look { tile: number; size: [number, number]; c: RGB; up: number; sway: number; step: number }
function cropLook(crop: CropId, stage: Stage, season: Season): Look | null {
  const au = season === 'autumn', wi = season === 'winter', su = season === 'summer';
  switch (crop) {
    case 'wheat':
      if (stage === 'sown') return { tile: T.seed, size: [0.34, 0.44], c: [0.84, 0.76, 0.6], up: 0.42, sway: 0, step: 1.1 };
      if (stage === 'sprout') return { tile: T.maiSprout, size: wi ? [0.45, 0.58] : [0.5, 0.66], c: wi ? [0.66, 0.77, 0.58] : [0.7, 0.83, 0.56], up: 0.46, sway: 0.2, step: 0.55 };
      if (stage === 'growing') return { tile: T.maiYoung, size: [0.82, 1.02], c: [0.7, 0.82, 0.56], up: 0.46, sway: 0.6, step: 0.5 };
      if (stage === 'ripe') return { tile: T.maiRipe, size: [1.05, 1.26], c: [0.93, 0.86, 0.64], up: 0.47, sway: 0.8, step: 0.5 };
      if (stage === 'stubble') return { tile: T.maiStub, size: [0.62, 0.8], c: au || wi ? [0.86, 0.8, 0.66] : [0.88, 0.8, 0.62], up: 0.46, sway: 0.1, step: 0.6 };
      return null;
    case 'millet':
      if (stage === 'sown') return { tile: T.seed, size: [0.34, 0.44], c: [0.86, 0.78, 0.58], up: 0.42, sway: 0, step: 1.1 };
      if (stage === 'sprout') return { tile: T.maiSprout, size: [0.45, 0.6], c: [0.7, 0.84, 0.56], up: 0.46, sway: 0.2, step: 0.6 };
      if (stage === 'growing') return su ? { tile: T.maiYoung, size: [1.1, 1.34], c: [0.64, 0.78, 0.52], up: 0.46, sway: 0.7, step: 0.55 } : { tile: T.maiYoung, size: [0.62, 0.8], c: [0.68, 0.82, 0.55], up: 0.46, sway: 0.5, step: 0.55 };
      if (stage === 'ripe') return { tile: T.guRipe, size: [1.25, 1.48], c: [0.92, 0.84, 0.6], up: 0.47, sway: 0.8, step: 0.62 };
      if (stage === 'stubble') return { tile: T.guStalk, size: [0.9, 1.15], c: [0.86, 0.8, 0.64], up: 0.47, sway: 0.3, step: 0.7 };
      return null;
    case 'bean':
      if (stage === 'sown') return { tile: T.seed, size: [0.34, 0.44], c: [0.82, 0.78, 0.62], up: 0.42, sway: 0, step: 1.1 };
      if (stage === 'sprout') return { tile: T.douLow, size: [0.38, 0.5], c: [0.72, 0.84, 0.58], up: 0.36, sway: 0.3, step: 0.6 };
      if (stage === 'growing') return { tile: T.douLow, size: [0.7, 0.88], c: [0.64, 0.79, 0.55], up: 0.4, sway: 0.4, step: 0.5 };
      if (stage === 'ripe') return { tile: T.douDry, size: [0.75, 0.95], c: [0.86, 0.76, 0.56], up: 0.48, sway: 0.4, step: 0.55 };
      if (stage === 'stubble') return { tile: T.douDry, size: [0.4, 0.55], c: [0.84, 0.78, 0.66], up: 0.4, sway: 0.2, step: 1.3 };
      return null;
    case 'greens':
      if (stage === 'sown') return { tile: T.seed, size: [0.32, 0.4], c: [0.82, 0.8, 0.64], up: 0.42, sway: 0, step: 1.0 };
      if (stage === 'sprout') return { tile: T.caiSeed, size: [0.3, 0.4], c: [0.72, 0.85, 0.58], up: 0.42, sway: 0.15, step: 0.5 };
      if (stage === 'growing') return { tile: T.qingcai, size: [0.32, 0.42], c: [0.66, 0.8, 0.55], up: 0.44, sway: 0.2, step: 0.5 };
      if (stage === 'ripe') return au ? { tile: T.baicai, size: [0.5, 0.62], c: [0.74, 0.85, 0.6], up: 0.42, sway: 0.1, step: 0.62 } : { tile: T.qingcai, size: [0.44, 0.56], c: [0.64, 0.79, 0.54], up: 0.45, sway: 0.2, step: 0.55 };
      if (stage === 'stubble') return { tile: T.caiSeed, size: [0.28, 0.36], c: [0.78, 0.82, 0.62], up: 0.42, sway: 0.1, step: 1.1 };
      return null;
  }
}
const rr = (a: [number, number], u: number) => a[0] + (a[1] - a[0]) * u;

export interface FieldOpts { season: Season; density: number; snow: number; /** 正在锄草的那一畦：草按这一份画（拔掉的不画） */ weeds?: Map<string, Array<{ x: number; y: number; z: number; alive: boolean }>> }

/** 画行者的一畦 */
function drawBed(P: DabPool, b: Bed, g: BedGeo, o: FieldOpts) {
  const bi = g.id.charCodeAt(0) * 7 + g.id.length * 131;
  const L = rowLen(g), keep = 0.6 + 0.4 * o.density, se = o.season;
  const drills = g.axis === 'x' ? [-0.3, 0.3] : [0];
  /** 垄上 f 处（顺着这一垄的走向）、横着偏 off 的那一点 */
  const at = (row: number, f: number, off: number): [number, number, number] => {
    const d = rowDir(row), L0 = g.axis === 'x' ? g.x0 : g.z0, a = d > 0 ? L0 + END + L * f : L0 + END + L * (1 - f), c = g.lines[row] + off;
    const x = g.axis === 'x' ? a : c, z = g.axis === 'x' ? c : a;
    return [x, g.y(x, z) + 0.05, z];
  };
  const stand = cropLook(b.crop ?? 'wheat', b.stage, se);
  const stub = b.crop ? cropLook(b.crop, 'stubble', se) : null;
  for (let row = 0; row < g.rows; row++) {
    const done = b.rows[row], bound = b.bound[row];
    for (const [di, off] of drills.entries()) {
      const look = GROW.includes(b.stage) || b.stage === 'stubble' ? (b.stage === 'stubble' ? stub : stand) : null;
      const step = look?.step ?? 0.6, n = Math.max(2, Math.round(L / step));
      for (let k = 0; k < n; k++) {
        const u1 = h3(bi, row * 13 + di, k), u2 = h3(bi + 1, row * 13 + di, k), f = (k + 0.25 + 0.5 * u1) / n;
        if (u2 > keep && b.stage !== 'ripe') continue;
        const [x, y, z] = at(row, f, off + (u2 - 0.5) * 0.08);
        let lk: Look | null = look;
        if (b.op === 'till' && f <= done) lk = null;                       // 这一截翻过了：只剩土块
        if (b.op === 'reap' && f <= done) lk = stub;                       // 割过了：茬
        if (b.op === 'sow' && f > done) lk = null;
        if (b.op === 'sow' && f <= done) lk = cropLook(b.crop ?? 'wheat', 'sown', se) ?? null;
        if (b.stage === 'tilled' && b.op !== 'sow') lk = null;
        if (!lk) continue;
        if (b.crop === 'wheat' && b.stage === 'sprout' && se === 'winter' && u1 > 0.62) continue;
        // 秋天的菜畦：一垄白菜、一垄萝卜
        if (lk && b.crop === 'greens' && se === 'autumn' && row % 2 === 1 && (b.stage === 'ripe' || b.stage === 'growing')) lk = { ...lk, tile: T.radish, size: [lk.size[0] * 0.95, lk.size[1] * 0.95], c: [0.68, 0.82, 0.56] };
        const s = rr(lk.size, u1) * (1 + 0.25 * (1 - keep));
        P.put(x, y - 0.05 + s * lk.up, z, s, lk.tile, [lk.c[0] * (0.92 + 0.1 * u2), lk.c[1] * (0.92 + 0.1 * u2), lk.c[2] * (0.92 + 0.1 * u2)], (u1 - 0.5) * 0.12, lk.sway, (u2 - 0.5) * 0.6, 1, (u1 - 0.5) * 0.6);
      }
    }
    // 割下来铺着的（还没捆）：顺着垄躺成一溜
    if (b.op === 'reap' && binds(b.crop) && done - bound > 0.01) {
      const n = Math.max(1, Math.round(((done - bound) * L) / 0.42));
      for (let k = 0; k < n; k++) {
        const u = h3(bi + 5, row, k), f = bound + ((k + 0.5) / n) * (done - bound);
        const [x, y, z] = at(row, f, 0.42 + (u - 0.5) * 0.12);
        const s = 0.82 + 0.16 * u;
        P.put(x, y - 0.05 + s * 0.42, z, s, T.swath, [0.95 * (0.95 + 0.06 * u), 0.88, 0.66], (u - 0.5) * 0.14, 0.05);
      }
    }
    // 翻过的那一截：土块；正翻着的那一头堆得多一点
    if ((b.op === 'till' && done > 0) || b.stage === 'tilled') {
      const to = b.stage === 'tilled' && b.op !== 'sow' ? 1 : b.op === 'till' ? done : 0, n = Math.round((to * L) / 0.9);
      for (let k = 0; k < n; k++) {
        const u = h3(bi + 9, row, k), f = ((k + u) / Math.max(1, n)) * to;
        const [x, y, z] = at(row, f, (u - 0.5) * 0.7);
        const s = 0.42 + 0.2 * u;
        P.put(x, y - 0.05 + s * 0.42, z, s, T.clod, [0.84, 0.76, 0.66], (u - 0.5) * 0.3, 0);
      }
      if (b.op === 'till' && done < 0.999) for (let k = 0; k < 3; k++) { const u = h3(bi + 11, row, k), [x, y, z] = at(row, done, (u - 0.5) * 0.8); P.put(x, y - 0.05 + (0.5 + 0.2 * u) * 0.42, z, 0.5 + 0.2 * u, T.clod, [0.78, 0.69, 0.59], (u - 0.5) * 0.4, 0); }
    }
  }
  // 草：荒地满地都是；长着庄稼的，按草的多少长在垄沟里（正在锄的那一畦按锄草那件事给的那一份画）
  const own = o.weeds?.get(b.id);
  if (own) for (const [k, w] of own.entries()) { if (!w.alive) continue; const u = h3(bi + 71, k, 0), s = 0.42 + 0.22 * u; P.put(w.x, w.y + s * 0.4, w.z, s, u > 0.45 ? T.kuo : T.sanye, [0.6, 0.72, 0.5], (u - 0.5) * 0.4, 0.4); }
  const weedy = b.stage === 'wild' ? Math.max(0.55, b.weed) : b.weed * (GROW.includes(b.stage) ? 1 : 0.6);
  if (!own && weedy > 0.08 && !(b.stage === 'tilled' && b.weed < 0.2)) {
    const n = Math.round(weedy * (g.axis === 'x' ? 46 : 18) * (b.stage === 'wild' ? 1.6 : 1));
    for (let k = 0; k < n; k++) {
      const u1 = h3(bi + 21, k, 1), u2 = h3(bi + 22, k, 2), u3 = h3(bi + 23, k, 3), row = Math.min(g.rows - 1, Math.floor(u3 * g.rows));
      if (b.op === 'till' && u1 <= b.rows[row]) continue;
      const off = b.stage === 'wild' ? (u2 - 0.5) * g.pitch : (u2 < 0.5 ? -0.5 : 0.5) * g.pitch * (0.7 + 0.25 * u2);
      const [x, y, z] = at(row, u1, off);
      const tall = b.stage === 'wild' && (se === 'summer' || se === 'autumn') && u2 > 0.6;
      const dry = se === 'winter' || (se === 'autumn' && u3 > 0.5);
      // 荒地是草与蒿；庄稼地里是阔叶的、三叶的杂草（与禾苗分得出来）
      const crop = b.stage !== 'wild' && GROW.includes(b.stage);
      const tile = tall ? (dry ? T.haoDry : T.hao) : crop ? (u3 > 0.5 ? T.kuo : T.sanye) : u3 > 0.5 ? T.cao0 : u3 > 0.25 ? T.caoShort : T.cao1;
      const s = tall ? 0.9 + 0.4 * u1 : 0.36 + 0.3 * u1;
      const c: RGB = dry ? [0.86, 0.8, 0.64] : se === 'spring' ? [0.74, 0.85, 0.6] : [0.66, 0.79, 0.56];
      P.put(x, y - 0.05 + s * 0.46, z, s, tile, c, (u2 - 0.5) * 0.15, 0.5);
    }
  }
  // 捆好立着的麦捆：一捆一捆排在割过的垄上（挑走一捆少一捆）
  if (b.sheaves > 0 && b.crop) {
    const spr = Math.max(1, perRow(b));
    for (let k = 0; k < b.sheaves; k++) {
      const row = Math.min(g.rows - 1, Math.floor(k / spr)), f = ((k % spr) + 0.5) / spr, u = h3(bi + 31, k, 0);
      const [x, y, z] = at(row, f, 0.15 + (u - 0.5) * 0.2);
      P.put(x, y - 0.05 + 0.52, z, 1.0 + 0.1 * u, T.sheaf, [0.95, 0.88, 0.67], (u - 0.5) * 0.18, 0.15);
    }
  }
  // 地头邻家放下的：麦是一垛立着靠在一起的麦捆，别的是一小堆
  if (b.left && b.left.n > 0) {
    const ax = (g.x0 + g.x1) / 2, az = g.z0 - 0.75, y = g.y(ax, az);
    const n = Math.min(10, b.left.n);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, r = b.left.item === 'sheaf' ? 0.32 : 0.2, u = h3(bi + 41, k, 0);
      const tile = b.left.item === 'sheaf' ? T.sheaf : b.left.item === 'greens' ? T.qingcai : T.heapTop;
      const c: RGB = b.left.item === 'sheaf' ? [0.94, 0.87, 0.66] : b.left.item === 'milletEar' ? [0.93, 0.83, 0.58] : b.left.item === 'bean' ? [0.86, 0.78, 0.6] : [0.68, 0.8, 0.56];
      P.put(ax + Math.cos(a) * r, y + 0.5, az + Math.sin(a) * r * 0.6, b.left.item === 'sheaf' ? 1.05 : 0.5, tile, c, -Math.cos(a) * 0.25 + (u - 0.5) * 0.1, 0.1);
    }
  }
}

/** 邻家那片麦：照季节画（与草木那边的麦田一个样子）；夏天割过的那一截是茬，隔一段立一捆 */
function drawVillage(P: DabPool, cut: number[], o: FieldOpts) {
  const V = VILLAGE, se = o.season, keep = 0.55 + 0.45 * o.density, big = 1 + 0.25 * (1 - keep), y = PLOT.y;
  const len = V.x1 - V.x0, n = Math.round(len / 0.8);
  for (let r = 0; r < VILLAGE_ROWS; r++) {
    const z0 = V.lines[r], f = cut[r] ?? 0;
    for (let k = 0; k < n; k++) {
      const u1 = h3(7, r, k), u2 = h3(8, r, k), u3 = h3(9, r, k);
      if (u2 > keep) continue;
      const fx = (k + 0.2 + 0.6 * u1) / n, x = V.x0 + len * fx, z = z0 + (u3 - 0.5) * 0.12;
      if (fx < 0.03 || fx > 0.97) continue;
      let tile = T.maiYoung, s = 0.86 + 0.2 * u1, c: RGB = [0.7, 0.82, 0.56], up = 0.46, sw = 0.6;
      if (se === 'summer') {
        if (fx <= f) { tile = T.maiStub; s = 0.6 + 0.2 * u1; c = [0.88, 0.8, 0.62]; sw = 0.1; }
        else { tile = T.maiRipe; s = 1.05 + 0.23 * u1; c = [0.93, 0.86, 0.64]; up = 0.47; sw = 0.8; }
      } else if (se === 'autumn') {
        if (u3 < 0.3) { tile = T.maiStub; s = 0.7 + 0.2 * u1; c = [0.87, 0.79, 0.62]; sw = 0.1; } else { tile = T.maiSprout; s = 0.6 + 0.2 * u1; c = [0.7, 0.83, 0.56]; sw = 0.3; }
      } else if (se === 'winter') {
        if (u3 > 0.62) continue;
        tile = T.maiSprout; s = 0.5 + 0.2 * u1; c = [0.66, 0.77, 0.58]; sw = 0.2;
      }
      s *= big;
      const t = 0.86 + 0.2 * u2;
      P.put(x, y + s * up, z, s, tile, [c[0] * t, c[1] * t, c[2] * t], (u3 - 0.5) * 0.14, sw, (u2 - 0.5) * 0.6, 1, (u1 - 0.5) * 0.6);
    }
    // 夏天割过的那一截：隔三米立一捆
    if (se === 'summer' && f > 0.02 && r % 2 === 0) {
      for (let x = V.x0 + 1.5; x < V.x0 + len * f - 0.5; x += 3) { const u = h3(11, r, x); P.put(x + (u - 0.5) * 0.6, y + 0.5, z0 + 0.5, 1.0 + 0.1 * u, T.sheaf, [0.94, 0.87, 0.66], (u - 0.5) * 0.2, 0.15); }
    }
  }
}

/** 田里（行者的几畦 + 邻家那片）整个重画 */
export function drawField(P: DabPool, st: FarmState, o: FieldOpts) {
  P.begin();
  for (const b of Object.values(st.beds)) { const g = BED_GEO[b.id]; if (g) drawBed(P, b, g, o); }
  drawVillage(P, st.village, o);
  P.end();
}

/** 晒场：摊开的麦（一圈，穗朝外）、打过的秸秆堆在一边 */
export function drawYard(P: DabPool, f: Floor) {
  P.begin();
  const y = FLOOR.y;
  if (f.spread > 0 && f.crop) {
    const n = Math.min(64, f.spread * 4), wheat = f.crop === 'wheat', flat = f.beaten;
    for (let k = 0; k < n; k++) {
      const u1 = h3(3, k, 1), u2 = h3(3, k, 2), a = (k / n) * Math.PI * 2 + u1 * 0.3, r = FLOOR.r * (0.35 + 0.6 * u2);
      const x = FLOOR.x + Math.cos(a) * r, z = FLOOR.z + Math.sin(a) * r;
      const c: RGB = wheat ? [0.95 - 0.06 * flat, 0.88 - 0.06 * flat, 0.66] : [0.93, 0.83, 0.58];
      P.put(x, y + 0.06, z, (0.8 + 0.25 * u1) * (1 - 0.25 * flat), wheat ? T.swath : T.guRipe, c, a + (u2 - 0.5) * 0.4, 0.05);
    }
  }
  // 连糠带粒的那一堆：堆面上几笔（堆本身是 props.ts 的 heap）
  if (f.heap > 0) {
    const s = 0.55 + 0.45 * Math.min(1, f.heap / 16), r = 0.62 * s * 1.1, h = 0.33 * s * (0.8 + 0.4 * Math.min(1, f.heap / 16));
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.3, rr = r * (0.25 + 0.45 * h3(6, k, 1)); P.put(HEAP.x + Math.cos(a) * rr, y + h * (1 - (rr / r) * 0.6) + 0.06, HEAP.z + Math.sin(a) * rr, 0.36 + 0.1 * h3(6, k, 2), T.heapTop, [0.95, 0.9, 0.74], a, 0); }
  }
  if (f.straw > 0) {
    const n = Math.round(14 * f.straw), sx = FLOOR.x - 2.1, sz = FLOOR.z - 0.4;
    for (let k = 0; k < n; k++) { const u1 = h3(5, k, 1), u2 = h3(5, k, 2), a = u1 * 6.28, r = 0.5 * Math.sqrt(u2); P.put(sx + Math.cos(a) * r, y + 0.18 + 0.25 * (1 - r / 0.5), sz + Math.sin(a) * r * 0.7, 0.85 + 0.2 * u2, T.swath, [0.95, 0.9, 0.72], a, 0.1); }
  }
  P.end();
}

// —— 飞起来的：土、种子、水、糠、麦粒、草屑、叶、果 ——
export type BitKind = 'clod' | 'seed' | 'drop' | 'chaff' | 'grain' | 'bit' | 'leaf' | 'fruit';
const BIT: Record<BitKind, { tile: number; c: RGB; size: [number, number]; g: number; drag: number; life: number }> = {
  clod: { tile: T.clod, c: [0.8, 0.71, 0.6], size: [0.18, 0.3], g: 9.8, drag: 0.4, life: 0.9 },
  seed: { tile: T.grain, c: [0.9, 0.82, 0.62], size: [0.08, 0.12], g: 9.8, drag: 0.6, life: 1.0 },
  drop: { tile: T.drop, c: [0.82, 0.88, 0.92], size: [0.1, 0.16], g: 9.8, drag: 0.2, life: 0.8 },
  chaff: { tile: T.chaff, c: [0.95, 0.91, 0.78], size: [0.14, 0.24], g: 1.4, drag: 2.2, life: 2.6 },
  grain: { tile: T.grain, c: [0.9, 0.78, 0.55], size: [0.08, 0.13], g: 9.8, drag: 0.3, life: 1.4 },
  bit: { tile: T.bit, c: [0.93, 0.86, 0.64], size: [0.12, 0.2], g: 6, drag: 1.2, life: 1.2 },
  leaf: { tile: T.leafBit, c: [0.66, 0.79, 0.55], size: [0.14, 0.22], g: 2.5, drag: 2.0, life: 2.2 },
  fruit: { tile: T.fruit, c: [0.95, 0.55, 0.42], size: [0.12, 0.16], g: 9.8, drag: 0.1, life: 1.4 },
};
interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number; kind: BitKind; s: number; rot: number; spin: number; floor: number; c?: RGB }
/** 一池飞起来的笔：每帧挪一挪；落了地停一会儿就没了 */
export class Bits {
  pool: DabPool;
  private list: Bit[] = [];
  /** 风（糠顺风飘）：x z 方向、大小 */
  wind = new THREE.Vector3();
  constructor(A: Atlas) {
    this.pool = new DabPool(160, dabMat({ ...A, pig: [1, 1, 1], dens: 1.05, shade: 1.2, snow: 0, sway: 0 }), 'farm:bits', new THREE.Vector3(), 1);
    this.pool.mesh.frustumCulled = false;
  }
  /** 撒出 n 个：从 p 出发，初速 v（随机散开 spread） */
  emit(kind: BitKind, p: THREE.Vector3, v: THREE.Vector3, n: number, spread = 0.6, floor?: number, c?: RGB) {
    const B = BIT[kind];
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.pool.cap) this.list.shift();
      const r = () => Math.random() * 2 - 1;
      this.list.push({ x: p.x + r() * 0.05, y: p.y + r() * 0.05, z: p.z + r() * 0.05, vx: v.x + r() * spread, vy: v.y + r() * spread * 0.6, vz: v.z + r() * spread, t: 0, life: B.life * (0.7 + 0.6 * Math.random()), kind, s: B.size[0] + (B.size[1] - B.size[0]) * Math.random(), rot: Math.random() * 6.28, spin: r() * 4, floor: floor ?? p.y - 1.5, c });
    }
  }
  get busy() { return this.list.length > 0; }
  update(dt: number) {
    const P = this.pool;
    if (!this.list.length) { if (P.count) { P.begin(); P.end(); } return; }
    P.begin();
    const keep: Bit[] = [];
    for (const b of this.list) {
      const B = BIT[b.kind];
      b.t += dt;
      if (b.y > b.floor + 0.01) {
        b.vy -= B.g * dt;
        const k = Math.exp(-B.drag * dt);
        b.vx = b.vx * k + this.wind.x * this.wind.y * (1 - k) * (b.kind === 'chaff' || b.kind === 'leaf' ? 3.2 : 0.3);
        b.vz = b.vz * k + this.wind.z * this.wind.y * (1 - k) * (b.kind === 'chaff' || b.kind === 'leaf' ? 3.2 : 0.3);
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.rot += b.spin * dt;
        if (b.y <= b.floor) { b.y = b.floor; b.vx = b.vy = b.vz = 0; }
      }
      if (b.t > b.life) continue;
      keep.push(b);
      const fade = Math.min(1, (b.life - b.t) / 0.3);
      P.put(b.x, b.y + b.s * 0.3, b.z, b.s * (0.6 + 0.4 * fade), B.tile, b.c ?? B.c, b.rot, 0);
    }
    this.list = keep;
    P.end();
  }
}

