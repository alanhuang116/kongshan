/**
 * 生灵共用的小件：时辰、远近分级、几样捏形的办法、几种颜色。
 * （牲口鸟雀都是 rig.ts 的 Parts 拼的：一种或几种并成一个几何、一次绘制；颜色写在顶点上。）
 */
import * as THREE from 'three';
import { M, V, colorize, cyl, merge, sphere, sweep, type Geo } from '../../core/geo';
import type { Season } from '../../env/atmos';
import { PIG, type RGB } from '../../ink/ink';
import type { Ctx } from '../person';
import { paint, tone } from '../rig';
import { SHOT_NAMES } from '../../../audio/types';

/** 日出、日落（与 env/atmos.ts 的那张表一致） */
export const SUN: Record<Season, [number, number]> = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] };
export const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp01 = (k: number) => (k < 0 ? 0 : k > 1 ? 1 : k);
export const sm = (k: number) => { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
/** 一下起一下落：0…1 里中间最高 */
export const bump = (k: number) => (k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k));
/** 朝着目标角转，每秒最多 rate 弧度 */
export const turnTo = (a: number, goal: number, rate: number, dt: number) => a + Math.max(-rate * dt, Math.min(rate * dt, wrap(goal - a)));

// —— 声音 ——
/** 声音那一路已经认得的名字；生灵新要的几声（羊、羊羔、鹤、嚼草、狗哼唧）在那边做出来之前先借一声 */
const KNOWN = new Set<string>(SHOT_NAMES);
const STANDIN: Record<string, string | null> = { sheep: 'goat', lamb: 'goat', crane: 'geese', munch: null, dogWhine: 'dog' };
export const say = (name: string): string | null => (KNOWN.has(name) ? name : STANDIN[name] ?? null);
/** 生灵在 (x, z) 出一声 */
export function sfx(c: Ctx, name: string, x: number, z: number, vel = 0.5) { const s = say(name); if (s) c.sfx(s, x, z, vel); }

// —— 颜色 ——
export const RED = tone(PIG.zhu, 1.05), OCHRE = tone([0.93, 0.82, 0.55], 1.3), INK = tone(PIG.jiao, 2.2), DARK = tone(PIG.jiao, 1.6), WHITE: RGB = [0.97, 0.97, 0.95];
export const mul = (c: RGB, k: number): RGB => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
export const mixc = (a: RGB, b: RGB, k: number): RGB => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

// —— 捏形 ——
/** 一个椭球 */
export const ell = (rx: number, ry: number, rz: number, c: RGB, ws = 8, hs = 6) => paint(sphere(1, ws, hs).scale(rx, ry, rz), c);
/** 一个朝 +z 的尖（喙、嘴） */
export const beak = (r: number, len: number, c: RGB, seg = 5) => paint(cyl(0.0005, r, len, seg).applyMatrix4(M.rx(Math.PI / 2)), c);
/** 一根沿着几点的细管（颈、尾、角、腿）：r 从粗到细 */
export const rod = (pts: THREE.Vector3[], r0: number, r1: number, c: RGB, up = V(1, 0, 0)) => paint(sweep(pts, [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [a * r0, b * r0] as [number, number]), { scale: (t) => lerp(1, r1 / r0, t), up }), c);
/** 一条腿：自原点（腿根）往下 len，粗 r0→r1；foot 给了就在脚下添一只蹄 / 爪 */
export const leg = (len: number, r0: number, r1: number, c: RGB, foot?: { c: RGB; w: number; h: number; d: number }, seg = 5) => {
  const g: Geo[] = [paint(cyl(r1, r0, len, seg).translate(0, -len / 2, 0), c)];
  if (foot) g.push(ell(foot.w, foot.h, foot.d, foot.c, 6, 4).translate(0, -len + foot.h * 0.4, foot.d * 0.3));
  return merge(g);
};
/** 按位置给顶点上色：fn(x, y, z) 返回这一点的颜色（背深腹浅、斑纹） */
export function shadeBy(g: Geo, fn: (x: number, y: number, z: number, o: [number, number, number]) => void): Geo {
  // 直接写（不与原有的顶点色相乘）：fn 给的就是这一点的颜色
  const p = g.attributes.position as THREE.BufferAttribute, n = p.count;
  if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const c = g.attributes.color as THREE.BufferAttribute, o: [number, number, number] = [1, 1, 1];
  for (let i = 0; i < n; i++) { o[0] = c.getX(i); o[1] = c.getY(i); o[2] = c.getZ(i); fn(p.getX(i), p.getY(i), p.getZ(i), o); c.setXYZ(i, o[0], o[1], o[2]); }
  c.needsUpdate = true;
  return g;
}
/** 上下两色：y 在 y0 以下是 low，y1 以上是 high，中间渐变 */
export const twoTone = (g: Geo, low: RGB, high: RGB, y0: number, y1: number) => shadeBy(g, (_x, y, _z, o) => { const k = clamp01((y - y0) / (y1 - y0 || 1)); o[0] = lerp(low[0], high[0], k); o[1] = lerp(low[1], high[1], k); o[2] = lerp(low[2], high[2], k); });
/** 把几何上原有的顶点色乘上一种颜色（借别处的几何来用时） */
export const colorizeMul = (g: Geo, c: RGB) => { if (!g.attributes.color) { const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); } return colorize(g, (_x, _y, _z, _a, _b, _c, o) => { o[0] *= c[0]; o[1] *= c[1]; o[2] *= c[2]; }); };
/** 每个顶点略深略浅一点（毛、羽不是一片平涂） */
export const mottle = (g: Geo, amt: number, seed = 1) => colorize(g, (x, y, z, _a, _b, _c, o) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.3) * 43758.5453, k = 1 + amt * ((h - Math.floor(h)) - 0.5) * 2;
  o[0] = Math.min(1, o[0] * k); o[1] = Math.min(1, o[1] * k); o[2] = Math.min(1, o[2] * k);
});
/** 顶点往外鼓出一些不匀的小包（羊毛、鸟胸） */
export function lumpy(g: Geo, amt: number, freq: number, seed = 1): Geo {
  const p = g.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  g.computeBoundingBox(); g.boundingBox!.getCenter(c);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), dx = x - c.x, dy = y - c.y, dz = z - c.z, l = Math.hypot(dx, dy, dz) || 1;
    const n = Math.sin(x * freq + seed) * Math.sin(y * freq * 1.3 + seed * 2.1) * Math.sin(z * freq * 0.9 + seed * 0.7);
    const k = 1 + amt * n / l;
    p.setXYZ(i, c.x + dx * k, c.y + dy * k, c.z + dz * k);
  }
  g.computeVertexNormals();
  return g;
}

// —— 远近分级：远了少动、看不见的偶尔动一下 ——
let SEQ = 0;
export class Pace {
  private acc = 0; private idx = SEQ++ * 3;
  /**
   * 这一帧动不动。dist 离镜头多远（米）；seen 在不在画面里。
   * 返回这一步该用的 dt（攒着的那几帧的和，最多 0.25 秒）；0 就是这一帧不动。
   */
  tick(c: Ctx, dist: number, seen = true): number {
    this.acc += c.dt;
    const stride = !seen ? 9 : dist < 28 ? 1 : dist < 60 ? 2 : dist < 120 ? 3 : 6;
    if ((c.frame + this.idx) % stride !== 0) return 0;
    const dt = Math.min(this.acc, 0.25);
    this.acc = 0;
    return dt;
  }
  reset() { this.acc = 0; }
}

/** 日子里几个常用的量 */
export interface Day {
  /** 日出、日落 */ sr: number; ss: number;
  /** 天亮着几成（0 夜 … 1 昼） */ light: number;
  /** 白天（日出后、日落前） */ up: boolean;
  /** 好天（不下雨雪） */ fine: boolean;
}
export function dayOf(c: Ctx, out: Day): Day {
  const [sr, ss] = SUN[c.season];
  out.sr = sr; out.ss = ss; out.light = 1 - c.night; out.up = c.hour > sr && c.hour < ss; out.fine = c.rain < 0.35 && c.snow < 0.35;
  return out;
}

/** 一个点在不在画面里（不新建对象） */
const _v = new THREE.Vector3(), _s = new THREE.Sphere();
export function inView(c: Ctx, x: number, y: number, z: number, r = 1): boolean { return c.frustum.intersectsSphere(_s.set(_v.set(x, y, z), r)); }
/** 离镜头多远（水平） */
export const camDist = (c: Ctx, x: number, z: number) => Math.hypot(c.camPos.x - x, c.camPos.z - z);
