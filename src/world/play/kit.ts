/**
 * 器物游戏（秋千、摇橹、钓鱼、纸鸢、投壶、打水漂、堆雪人、点灯笼、扫叶、风铃、柴门……）共用的家什：
 *   state 的写法（set 整份换、put 改几样、一秒至多十几次地告诉界面）；
 *   每帧一次的钩子（onFrame：挂在 world.tick 上，排在总装那一帧之前——要先把人摆好、再让总装去走他的步子与镜头）；
 *   存档（k.mem 里 'play' 那一份）、出声、几种材质与几何的小工具。
 * 本文件不导出 create，acts/index.ts 不会把它当成一件事（它也不在 acts/ 底下）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Anlewo } from '../Anlewo';
import { PIG, wash, type RGB } from '../ink/ink';

export type St = Record<string, unknown>;

// —— state ——
/**
 * 一件事的状态：set 整份换掉（换一步时用），put 只改其中几样（表、进度这类一秒变十几次的），
 * put 也不是每次都告诉界面——至多每秒十五次（最后一次总会送到）。
 */
export function stateOf(k: Anlewo) {
  const state: St = {};
  let last = 0, pend = false;
  const emit = () => { last = performance.now(); pend = false; if (k.act && k.act.state === state) k.emitAct(); };
  const set = (p: St) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); emit(); };
  const put = (p: St, now = false) => {
    Object.assign(state, p);
    if (now || performance.now() - last > 66) emit(); else pend = true;
  };
  /** 每帧调一下：攒着没送的送出去 */
  const flush = () => { if (pend && performance.now() - last > 66) emit(); };
  return { state, set, put, flush };
}

// —— 每帧 ——
type Fn = (dt: number, t: number) => void;
const FRAMES = new WeakMap<Anlewo, Array<{ f: Fn; bad: number; name: string }>>();
/**
 * 每帧调一次 fn（不论做没做这件事：柴门开合、风铃、灯笼、荡完了慢慢停下的秋千）。
 * 挂在 world.tick 上——各件事是在总装把它自己那一帧挂上去之前建的，所以排在总装之前：
 * 这里先把人、船、秋千摆好，总装再接着走人的步子、摆镜头。哪一个出错三次就停掉那一个，别的照常。
 */
export function onFrame(k: Anlewo, name: string, f: Fn) {
  let list = FRAMES.get(k);
  if (!list) {
    const L: Array<{ f: Fn; bad: number; name: string }> = (list = []);
    FRAMES.set(k, L);
    k.world.tick.push((dt, t) => {
      for (const e of L) {
        if (e.bad >= 3) continue;
        try { e.f(dt, t); } catch (err) { e.bad++; console.warn(`器物游戏·${e.name} 出错（第 ${e.bad} 次）`, err); }
      }
    });
  }
  list.push({ f, bad: 0, name });
}

// —— 存档 ——
export interface Rec { n?: number; best?: number; [k: string]: unknown }
/** 'play' 那一份里的某一样（swing、boat、fish、kite、pot、skip、snowman、lantern、sweep、shuttle……） */
export function playGet<T extends object>(k: Anlewo, key: string, fb: T): T {
  const all = k.mem.get<Record<string, unknown>>('play', {});
  const v = all[key];
  return v && typeof v === 'object' ? ({ ...fb, ...(v as T) }) : fb;
}
export function playSet(k: Anlewo, key: string, v: unknown) {
  const all = { ...k.mem.get<Record<string, unknown>>('play', {}) };
  if (v == null) delete all[key]; else all[key] = v;
  k.mem.set('play', all);
}
/** 玩了一回：次数加一；score 比旧的好（higher 为真时越大越好）就记下。返回是不是新的最好 */
export function playScore(k: Anlewo, key: string, score: number | null, higher = true, extra: Record<string, unknown> = {}): boolean {
  const r = playGet<Rec>(k, key, {});
  const better = score != null && (r.best == null || (higher ? score > r.best : score < r.best));
  playSet(k, key, { ...r, ...extra, n: (r.n ?? 0) + 1, ...(better ? { best: score } : {}) });
  return better;
}

// —— 出声 ——
export interface Snd { vel?: number; pitch?: number; dur?: number; delay?: number; variant?: string; x?: number; z?: number; pan?: number }
/** 出一声（名字与选项照声音那一路的约定；不认得的名字声音那边自己不出） */
export function sfx(k: Anlewo, name: string, o: Snd = {}) {
  if (o.x != null && o.z != null) {
    const p = k.player.pos;
    if (Math.hypot(o.x - p.x, o.z - p.z) > 360) return;
  }
  (k.events.sfx as ((s: string, o?: Snd) => void) | undefined)?.(name, o);
}

// —— 材质（画法的 wash；同参数的共用一个着色器）——
let M: ReturnType<typeof mk> | null = null;
function mk() {
  return {
    /** 不上漆的木（与屋舍那边的木同一种） */ wood: wash({ pig: [0.745, 0.685, 0.615], dens: 1.6, shade: 1.5, grain: 1.6, streak: [24, 1.3, 0.34] }),
    /** 深一些的木（船、橹） */ darkwood: wash({ pig: [0.72, 0.64, 0.57], dens: 2.0, shade: 1.5, grain: 1.4, streak: [20, 1.2, 0.38] }),
    /** 竹 */ bamboo: wash({ pig: [0.86, 0.83, 0.64], dens: 1.15, shade: 1.42, grain: 2, line: 0.62 }),
    /** 小物件：颜料全在顶点色里 */ obj: wash({ pig: [1, 1, 1], dens: 1, shade: 1.5, grain: 2.2, side: THREE.DoubleSide }),
    /** 石（带皴） */ stone: wash({ pig: PIG.mo, dens: 0.6, shade: 1.9, cun: 0.8, grain: 1.2 }),
    /** 雪：粉彩，夜里也白 */ snow: wash({ pig: [0.97, 0.975, 0.985], dens: 1, body: 1, shade: 1.18, grain: 1.8, line: 0.7, snow: 0 }),
    /** 纸（纸鸢的面）：带三分粉 */ paper: wash({ pig: [0.96, 0.94, 0.88], dens: 1, body: 0.35, shade: 1.15, grain: 1.5, line: 0.5, side: THREE.DoubleSide, snow: 0 }),
    /** 线（钓丝、鸢线）：极细的墨，不勾线 */ thread: wash({ pig: PIG.mo, dens: 1.6, flat: 1, line: 0, snow: 0, side: THREE.DoubleSide }),
  };
}
export const mats = () => (M ??= mk());

// —— 不动的小器物并成一块（省绘制）——
/**
 * 一处（region，如 'yard'）里几件事各自的不动的小器物（壶、灯笼的木盖……，都用 obj 材质、颜料在顶点色里）
 * 并成一张网，一次绘制。setStatic(k, 'yard', '壶', geo) 换掉那一件（null 拿掉），下一帧重并。
 */
const STATICS = new WeakMap<Anlewo, Map<string, { geos: Map<string, THREE.BufferGeometry>; mesh: THREE.Mesh | null; dirty: boolean }>>();
export function setStatic(k: Anlewo, region: string, key: string, geo: THREE.BufferGeometry | null) {
  let all = STATICS.get(k);
  if (!all) {
    const A = (all = new Map());
    STATICS.set(k, A);
    onFrame(k, 'statics', () => {
      for (const [name, r] of A) {
        if (!r.dirty) continue;
        r.dirty = false;
        if (r.mesh) { r.mesh.removeFromParent(); r.mesh.geometry.dispose(); r.mesh = null; }
        const gs = [...r.geos.values()].map((g) => g.clone());
        if (!gs.length) continue;
        const merged = gs.length === 1 ? gs[0] : mergeGeometries(gs, false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        r.mesh = new THREE.Mesh(merged, mats().obj);
        r.mesh.name = `play:statics:${name}`;
        k.world.scene.add(r.mesh);
      }
    });
  }
  let r = all.get(region);
  if (!r) all.set(region, (r = { geos: new Map(), mesh: null, dirty: true }));
  if (geo) r.geos.set(key, geo); else r.geos.delete(key);
  r.dirty = true;
}

// —— 几何 ——
/** 给 three 自带的几何补上画法要的顶点色（全 1），并去掉索引 */
export function inkGeo(g: THREE.BufferGeometry, tint: RGB = [1, 1, 1]): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  const c = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) { c[i] = tint[0]; c[i + 1] = tint[1]; c[i + 2] = tint[2]; }
  n.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}

/**
 * 一根会动的细线（钓丝、鸢线）：一条沿折线走的细带，每帧改它的点（不重建几何）。
 * 带子总是侧着朝镜头，粗细按像素不至于细到看不见（远了略加粗）。
 */
export class Line {
  mesh: THREE.Mesh;
  private pos: Float32Array; private n: number;
  constructor(n: number, public width = 0.006, mat = mats().thread) {
    this.n = n;
    const g = new THREE.BufferGeometry(), v = n * 2;
    this.pos = new Float32Array(v * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const nor = new Float32Array(v * 3); for (let i = 0; i < v; i++) nor[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(v * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(v * 3).fill(1), 3));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'play:line';
  }
  private t = new THREE.Vector3(); private s = new THREE.Vector3(); private e = new THREE.Vector3();
  /** pts 是 n 个点；cam 是镜头位置（带子侧着朝它） */
  set(pts: THREE.Vector3[], cam: THREE.Vector3) {
    const P = this.pos, n = this.n;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
      this.t.subVectors(b, a).normalize();
      this.e.subVectors(cam, p);
      const d = this.e.length();
      this.s.crossVectors(this.t, this.e).normalize().multiplyScalar(this.width * (1 + d * 0.012) * 0.5);
      P[i * 6] = p.x - this.s.x; P[i * 6 + 1] = p.y - this.s.y; P[i * 6 + 2] = p.z - this.s.z;
      P[i * 6 + 3] = p.x + this.s.x; P[i * 6 + 4] = p.y + this.s.y; P[i * 6 + 5] = p.z + this.s.z;
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

// —— 小算 ——
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** 「三」「十二」：给提示里的数用 */
export function cnNum(n: number): string {
  const D = '〇一二三四五六七八九';
  n = Math.max(0, Math.floor(n));
  if (n < 10) return D[n];
  if (n < 20) return '十' + (n % 10 ? D[n % 10] : '');
  if (n < 100) return D[Math.floor(n / 10)] + '十' + (n % 10 ? D[n % 10] : '');
  if (n < 1000) { const r = n % 100; return D[Math.floor(n / 100)] + '百' + (r ? (r < 10 ? '零' + D[r] : r < 20 ? '一' + cnNum(r) : cnNum(r)) : ''); }
  return String(n);
}
/** 人离某处多远（平面上） */
export const farFrom = (k: Anlewo, x: number, z: number) => Math.hypot(k.player.pos.x - x, k.player.pos.z - z);
/** 镜头离某处多远：远了就不画（省绘制） */
export const camFar = (k: Anlewo, x: number, z: number) => Math.hypot(k.world.camera.position.x - x, k.world.camera.position.z - z);
