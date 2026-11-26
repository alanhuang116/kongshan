/**
 * 发光路标：游人在园里「观物取象」取了一卦，在脚下留一盏灯；后来路过的人点开，看见是谁、什么时候、取的哪一象。
 * 不是起卦——上卦下卦是人自己看着天地取的（天、泽、火、雷、风、水、山、地），卦只当象看，不说吉凶。
 *
 *   画：地上一方极淡的印，印里是那一卦的六爻（初爻在南边，人从南边走来正着读）；印上浮一点小小的灯光。
 *       白天只是一方淡墨的印；夜里印发亮，灯光远远看得见（远了也不小于几个像素）。
 *       全园至多画最近的二十四盏，挨得近的并成一盏（study/cluster.ts）。印一次绘制、灯一次绘制。
 *   数：同游连上了、中转认得路标时，用中转那一份（人人看得见，留三天，一人至多三盏）；
 *       自己留的另记在世界的存档里（mem 'marks'）——没连上、旧的中转不认得时，只自己看得见，也留三天。
 *   卦的序号：data/yi.ts 的 GUA，通行本卦序，0 是乾。月：夏历几月（1…12）；时：0…23 点；天气：net 的 WEATHERS 序号。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { FX_LAYER, FX_PARS, INK_PARS, U } from '../ink/ink';
import { getTogether } from '../net';
import { WEATHERS, nameOf } from '../net/proto';
import { GUA } from '../../data/yi';
import { groundAt, standable } from '../walk';
import { ground } from '../site';
import { cluster, nearest, type Cluster } from './study/cluster';

/** 一盏灯（中转来的、自己存的，合成一样） */
export interface Mark {
  key: string;
  /** 中转上的编号（只在自己这里的没有） */
  id: number | null;
  x: number; z: number;
  /** 卦（GUA 的序号 0…63）、夏历几月（1…12）、几点（0…23）、天气（WEATHERS 的序号） */
  g: number; mo: number; h: number; w: number;
  /** 谁留的（雅号）、衣色 */
  who: string; c: number;
  mine: boolean;
  /** 只在自己这里（那时没连上同游） */
  local: boolean;
  /** 还留几分钟 */
  left: number;
}
interface Saved { x: number; z: number; g: number; mo: number; h: number; w: number; t: number; net: boolean }
const NS = 'marks';
/** 留多久（分钟）：三天 */
export const TTL_MIN = 3 * 24 * 60;
/** 一人至多几盏 */
export const MAX_MINE = 3;
/** 画几盏、点得着的几盏、多近才点得着 */
const DRAW_N = 24, SLOT_N = 4, NEAR = 16;
const DAY_MS = 60000;

const readSaved = (k: Anlewo): Saved[] => {
  const m = k.mem.get<{ list?: unknown }>(NS, {});
  const now = Date.now();
  return (Array.isArray(m.list) ? m.list : []).filter((s): s is Saved => !!s && typeof s === 'object' && Number.isFinite((s as Saved).x) && Number.isFinite((s as Saved).z) && Number.isInteger((s as Saved).g))
    .filter((s) => now - s.t < TTL_MIN * DAY_MS);
};
const writeSaved = (k: Anlewo, list: Saved[]) => k.mem.set(NS, { list });

/** 此刻的夏历月（世界的月建：子 0 是十一月） */
export const lunarMonth = (k: Anlewo) => ((k.month + 10) % 12) + 1;
/** 月、时、天气说成字：「正月　辰时　晴」 */
const YUE = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const WCN: Record<string, string> = { clear: '晴', mist: '雾', rain: '雨', snow: '雪' };
export const whenText = (m: Pick<Mark, 'mo' | 'h' | 'w'>) => `${YUE[(m.mo - 1 + 12) % 12]}　${ZHI[Math.floor(((m.h + 1) % 24) / 2)]}时　${WCN[WEATHERS[m.w] ?? 'clear'] ?? '晴'}`;
/** 留了多久：「刚留下」「一个时辰前」「两日前」 */
export function ageText(leftMin: number): string {
  const age = Math.max(0, TTL_MIN - leftMin);
  if (age < 20) return '刚留下';
  if (age < 120) return '不到一个时辰前';
  if (age < 24 * 60) return `${['', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十', '十一'][Math.min(11, Math.floor(age / 120))]}个时辰前`;
  return `${['', '一', '两', '三'][Math.min(3, Math.floor(age / 1440))]}日前`;
}

class Marks {
  list: Mark[] = [];
  clusters: Array<Cluster<Mark>> = [];
  /** 点得着的那几盏（近的在前） */
  slots: Array<Cluster<Mark> | null> = new Array(SLOT_N).fill(null);
  private sig = ''; private t = 0;
  private seal: THREE.Mesh; private glow: THREE.Mesh;
  private born = new Map<string, number>();
  private subs = new Set<() => void>();
  constructor(private k: Anlewo) {
    const geo = () => {
      const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1);
      g.index = q.index; g.setAttribute('position', q.attributes.position);
      g.setAttribute('aPos', new THREE.InstancedBufferAttribute(new Float32Array(DRAW_N * 4), 4));
      g.setAttribute('aK', new THREE.InstancedBufferAttribute(new Float32Array(DRAW_N * 4), 4));
      g.instanceCount = 0;
      return g;
    };
    this.seal = new THREE.Mesh(geo(), new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: SEAL_V, fragmentShader: SEAL_F, transparent: true, depthTest: false, depthWrite: false }));
    this.glow = new THREE.Mesh(geo(), new THREE.ShaderMaterial({ uniforms: { ...U, uMin: { value: 0.004 } }, vertexShader: GLOW_V, fragmentShader: GLOW_F, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (const m of [this.seal, this.glow]) { m.layers.set(FX_LAYER); m.frustumCulled = false; m.renderOrder = 6; k.world.scene.add(m); }
    this.seal.name = 'marks:seal'; this.glow.name = 'marks:glow';
  }
  /** 有变（多了、少了一盏）：界面据此重画。返回取消的函数 */
  subscribe(f: () => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }

  /** 把中转的、自己存的合成一份 */
  collect(): Mark[] {
    const k = this.k, tg = getTogether(), out: Mark[] = [];
    const online = !!tg && tg.ext && tg.view.ext;
    const meName = tg ? nameOf(tg.me.n) : k.persona.name || '我', meC = tg?.me.c ?? 0;
    if (online && tg) for (const m of tg.marks.values()) {
      const left = tg.markLeft(m.id);
      if (left <= 0) continue;
      out.push({ key: `n${m.id}`, id: m.id, x: m.x, z: m.z, g: m.g, mo: m.mo, h: m.h, w: m.w, who: nameOf(m.n), c: m.c, mine: !!m.mine, local: false, left });
    }
    const saved = readSaved(k), now = Date.now();
    for (const s of saved) {
      // 连上了：交给中转的那几盏以中转那一份为准（中转那边收回了、过期了，就不再画）；只在自己这里的照画
      if (online && s.net) continue;
      out.push({ key: `l${s.t}`, id: null, x: s.x, z: s.z, g: s.g, mo: s.mo, h: s.h, w: s.w, who: meName, c: meC, mine: true, local: true, left: TTL_MIN - (now - s.t) / DAY_MS });
    }
    return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  /** 每帧 */
  tick(dt: number) {
    this.t -= dt;
    const k = this.k, p = k.player.pos;
    if (this.t <= 0) {
      this.t = 0.5;
      this.list = this.collect();
      this.clusters = cluster(this.list);
      const sig = this.list.map((m) => m.key).join(',');
      if (sig !== this.sig) { this.sig = sig; for (const f of this.subs) f(); }
      // 点得着的：最近的几盏（十六米内）；画的：最近的二十四盏
      const near = nearest(this.clusters, p.x, p.z, SLOT_N, NEAR);
      for (let i = 0; i < SLOT_N; i++) this.slots[i] = near[i] ?? null;
      this.upload(nearest(this.clusters, p.x, p.z, DRAW_N));
    }
    // 远处的灯也不小于几个像素：一像素多大（弧度）
    const cam = k.world.camera, h = k.world.size?.y || 700;
    (this.glow.material as THREE.ShaderMaterial).uniforms.uMin.value = ((cam.fov * Math.PI) / 180 / h) * 7;
  }
  private upload(cs: Array<Cluster<Mark>>) {
    const now = this.k.world.time;
    for (const g of [this.seal.geometry, this.glow.geometry] as THREE.InstancedBufferGeometry[]) {
      const P = g.getAttribute('aPos') as THREE.InstancedBufferAttribute, K = g.getAttribute('aK') as THREE.InstancedBufferAttribute;
      cs.forEach((c, i) => {
        const m = c.items[c.items.length - 1], y = groundAt(c.x, c.z) ?? ground(c.x, c.z);
        let b = this.born.get(m.key);
        if (b == null) { b = this.sig && this.born.size ? now : now - 10; this.born.set(m.key, b); }
        const lines = GUA[m.g]?.lines ?? [1, 1, 1, 1, 1, 1];
        const code = lines.reduce((a, v, j) => a + (v ? 1 << j : 0), 0);
        P.setXYZW(i, c.x, y + 0.025, c.z, code);
        K.setXYZW(i, b, m.mine ? 1 : 0, Math.min(5, c.items.length), (m.x * 13.1 + m.z * 7.7) % 97);
      });
      P.needsUpdate = true; K.needsUpdate = true;
      g.instanceCount = cs.length;
    }
  }

  /** 在脚下留一盏：gua 是 GUA 的序号。返回说什么 */
  place(gua: number): { ok: boolean; net: boolean; dropped: boolean } {
    const k = this.k, p = k.player.pos, tg = getTogether();
    const m = { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, g: Math.max(0, Math.min(63, Math.floor(gua))), mo: lunarMonth(k), h: Math.floor(k.atmos.hour) % 24, w: Math.max(0, WEATHERS.indexOf(k.atmos.weather)) };
    const net = !!tg && tg.canPlay && tg.placeMark(m);
    const list = readSaved(k);
    list.push({ ...m, t: Date.now(), net });
    let dropped = false;
    while (list.length > MAX_MINE) { list.shift(); dropped = true; }
    writeSaved(k, list);
    this.t = 0;
    return { ok: true, net, dropped };
  }
  /** 收回自己的一盏 */
  take(m: Mark): boolean {
    const k = this.k, tg = getTogether();
    if (!m.mine) return false;
    if (m.id != null) tg?.unmark(m.id);
    const list = readSaved(k).filter((s) => !(s.g === m.g && Math.hypot(s.x - m.x, s.z - m.z) < 0.6));
    writeSaved(k, list);
    this.t = 0;
    return true;
  }
  /** 自己留的（册页里列出来） */
  mine(): Mark[] { return this.list.filter((m) => m.mine); }
  /** 第 i 个点得着的那一盏旁边站在哪（朝着它） */
  standFor(c: { x: number; z: number }, from: { x: number; z: number }): { x: number; z: number; yaw: number } {
    const a0 = Math.atan2(from.x - c.x, from.z - c.z);
    for (let n = 0; n < 8; n++) {
      const a = a0 + (n % 2 ? 1 : -1) * Math.ceil(n / 2) * (Math.PI / 4), x = c.x + Math.sin(a) * 0.9, z = c.z + Math.cos(a) * 0.9;
      if (standable(x, z) != null) return { x, z, yaw: a + Math.PI };
    }
    return { x: c.x, z: c.z + 0.9, yaw: Math.PI };
  }
  dispose() { for (const m of [this.seal, this.glow]) { m.removeFromParent(); m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }
}

// —— 地上的印：一方淡淡的方框，里面六爻（阳爻一横，阴爻断开），初爻在南边 ——
const SEAL_V = /* glsl */ `
attribute vec4 aPos; attribute vec4 aK;
varying vec2 vUv; varying float vCode; varying vec4 vK; varying float vZ;
void main() {
  vec3 w = aPos.xyz + vec3(position.x, 0.0, -position.y) * 0.84;
  vec4 v = viewMatrix * vec4(w, 1.0);
  vZ = -v.z; vUv = position.xy + 0.5; vCode = aPos.w; vK = aK;
  gl_Position = projectionMatrix * v;
}`;
const SEAL_F = /* glsl */ `
${INK_PARS}${FX_PARS}
uniform vec3 uInk;
varying vec2 vUv; varying float vCode; varying vec4 vK; varying float vZ;
float bitOf(float code, float i) { return mod(floor(code / exp2(i)), 2.0); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float n = ih(vec3(floor(vUv * 21.0), vK.w));
  float box = max(abs(p.x), abs(p.y));
  // 印边：一圈不齐的细框
  float border = smoothstep(0.985, 0.93, box + 0.02 * n) * smoothstep(0.82, 0.88, box - 0.025 * n);
  // 六爻：自南往北（vUv.y 小的是南边——平面朝上铺时 −position.y 对着 +z）
  float row = (p.y + 0.69) / 0.23, ri = floor(row), fy = fract(row), bars = 0.0;
  if (ri >= 0.0 && ri < 6.0 && abs(p.x) < 0.58) {
    float yang = bitOf(vCode, ri);
    float body = smoothstep(0.16, 0.3, fy) * smoothstep(0.84, 0.7, fy) * (0.75 + 0.25 * n);
    float gap = yang > 0.5 ? 1.0 : smoothstep(0.07, 0.14, abs(p.x));
    bars = body * gap * smoothstep(0.58, 0.5, abs(p.x));
  }
  float born = clamp((uTime - vK.x) / 1.6, 0.0, 1.0);
  float a = max(border * 0.85, bars) * born * fxSeen(vZ - 0.08, 0.3);
  // 白天一方淡墨；夜里是一点暖光（香槟色），自己留的略亮
  vec3 lit = mix(vec3(0.98, 0.88, 0.66), vec3(1.0, 0.93, 0.78), vK.y);
  vec3 c = mix(uInk, lit, uNight);
  a *= mix(0.26, 0.62 + 0.12 * vK.y, uNight);
  if (a < 0.003) discard;
  gl_FragColor = vec4(c, a);
}`;
// —— 灯：印上浮着的一点光，朝着看的人；远了也不小于几个像素；夜里才亮 ——
const GLOW_V = /* glsl */ `
uniform float uMin;
attribute vec4 aPos; attribute vec4 aK;
varying vec2 vP; varying float vZ; varying vec4 vK;
void main() {
  vec4 v = viewMatrix * vec4(aPos.xyz + vec3(0.0, 0.42, 0.0), 1.0);
  float size = max(0.5 + 0.06 * aK.z, -v.z * uMin);
  v.xy += position.xy * size;
  vZ = -v.z; vP = position.xy * 2.0; vK = aK;
  gl_Position = projectionMatrix * v;
}`;
const GLOW_F = /* glsl */ `
${INK_PARS}${FX_PARS}
varying vec2 vP; varying float vZ; varying vec4 vK;
void main() {
  float r = length(vP);
  float flick = 0.9 + 0.1 * sin(uTime * 2.3 + vK.w);
  float a = (pow(max(0.0, 1.0 - r), 2.4) * 0.55 + pow(max(0.0, 1.0 - r * 3.4), 2.0) * 0.9) * flick;
  float born = clamp((uTime - vK.x) / 1.6, 0.0, 1.0);
  a *= uNight * born * fxSeen(vZ - 0.25, 0.4);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.55), a);
}`;

let cur: Marks | null = null;
/** 世界建好时调一回（做事那一路 acts/marks.ts 调） */
export function startMarks(k: Anlewo): Marks {
  if (cur && (cur as unknown as { k: Anlewo }).k === k) return cur;
  cur?.dispose();
  const m = new Marks(k);
  cur = m;
  // 存档里过了三天的灯：开场时扫掉
  { const raw = k.mem.get<{ list?: unknown[] }>(NS, {}).list, kept = readSaved(k); if (Array.isArray(raw) && raw.length !== kept.length) writeSaved(k, kept); }
  let errs = 0;
  k.world.tick.push((dt) => {
    if (errs >= 3) return;
    try { m.tick(dt); } catch (e) { errs++; console.warn(`路标出错（第 ${errs} 次）`, e); }
  });
  if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__marks = m;
  return m;
}
/** 此刻的路标（世界还没建好是 null） */
export const marksOf = (): Marks | null => cur;
export type { Marks };
