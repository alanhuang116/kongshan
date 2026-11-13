/**
 * 几件事共用的：文字从哪里取、挂点与器物怎么找、站在哪、镜头放哪、身下垫着什么。
 * （本文件不导出 create，acts/index.ts 不会把它当成一件事。）
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Season } from '../env/atmos';
import type { PoseName, Seat } from '../avatar/types';
import type { Spot } from './types';

// —— 文字 ——
export interface Verse { id: string; title: string; author: string; lines: string[]; source: string; gloss?: string }
export interface Pair { id: string; a: string; b: string; from: string; source: string; when: string[] }
export interface Saying { id: string; text: string; source: string; gloss?: string; on: string[] }
export interface Page { id: string; book: 'yi' | 'huangji'; text: string; source: string; gloss?: string }
export interface Trigram { id: string; name: string; lines: [number, number, number]; image: string; nature: string; xiantian: string }
export interface Gua { n: number; name: string; lines: number[]; upper: string; lower: string; image: string; judgment: string; gloss: string }
const D = import.meta.glob<Record<string, unknown>>(['../../data/shaoyong.ts', '../../data/yi.ts', '../../data/talk.ts', '../../data/almanac.ts'], { eager: true });
const pick = <T,>(key: string, fb: T): T => { for (const m of Object.values(D)) if (m[key] !== undefined) return m[key] as T; return fb; };
export const POEMS = pick<Verse[]>('POEMS', []);
export const PAIRS = pick<Pair[]>('PAIRS', []);
export const SAYINGS = pick<Saying[]>('SAYINGS', []);
export const PAGES = pick<Page[]>('PAGES', []);
export const TRIGRAMS = pick<Trigram[]>('TRIGRAMS', []);
export const GUA = pick<Gua[]>('GUA', []);
export const YI_WORDS = pick<Array<{ id: string; text: string; source: string }>>('YI_WORDS', []);
export const WORDS = pick<{ honest: string[] } | null>('WORDS', null);
export const poem = (id: string): Verse | null => POEMS.find((p) => p.id === id) ?? null;
/** 取一首诗（按 id 依次试，都没有就按题目里的字找） */
export const poemOf = (ids: string[], titleHas?: string): Verse | null => { for (const id of ids) { const p = poem(id); if (p) return p; } return titleHas ? POEMS.find((p) => p.title.includes(titleHas)) ?? null : null; };
/** 易里的一句（按 id，或按含有的字） */
export const yiWord = (idOrHas: string): { text: string; source: string } | null => YI_WORDS.find((w) => w.id === idOrHas) ?? YI_WORDS.find((w) => w.text.includes(idOrHas)) ?? null;
/** 打乱后依次取，不重复，取完再打乱 */
export function deck<T>(items: T[]): () => T | null {
  let q: T[] = [];
  return () => { if (!items.length) return null; if (!q.length) { q = [...items]; for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; } } return q.pop()!; };
}
/** 此刻的时令、时辰标签（给挑诗句、观物用） */
export function tagsNow(k: Anlewo): Set<string> {
  const a = k.atmos, s = new Set<string>([k.season, 'any']);
  if (a.night > 0.5) s.add('night'); else if (a.dawn > 0.35) s.add('dawn'); else if (a.dusk > 0.35) s.add('dusk'); else if (a.hour > 11 && a.hour < 14) s.add('noon'); else s.add('day');
  if (a.w.rain > 0.5) s.add('rain'); if (a.w.snow > 0.5) s.add('snow');
  if (a.night > 0.5 && a.w.rain + a.w.mist < 0.4) s.add('moon');
  if (k.season === 'spring') s.add('flower');
  return s;
}
/** 按时令挑一联：合得上的越多越好，同分的随便挑 */
export function pairFor(k: Anlewo, extra: string[] = []): Pair | null {
  if (!PAIRS.length) return null;
  const t = tagsNow(k); for (const e of extra) t.add(e);
  let best: Pair[] = [], bs = -1;
  for (const p of PAIRS) { const sc = p.when.reduce((n, w) => n + (t.has(w) ? (w === 'any' ? 0.2 : 1) : 0), 0) - (p.when.some((w) => /^(spring|summer|autumn|winter)$/.test(w) && w !== k.season) ? 5 : 0); if (sc > bs + 1e-6) { bs = sc; best = [p]; } else if (Math.abs(sc - bs) < 1e-6) best.push(p); }
  return best[Math.floor(Math.random() * best.length)] ?? null;
}
export function sayingFor(on: string): Saying | null {
  const a = SAYINGS.filter((s) => s.on.includes(on)), b = a.length ? a : SAYINGS.filter((s) => s.on.includes('any'));
  return b[Math.floor(Math.random() * b.length)] ?? null;
}

// —— 挂点、器物 ——
export const anchor = (k: Anlewo, name: string): THREE.Object3D | null => k.build?.anchors[name] ?? null;
export const part = (k: Anlewo, name: string): THREE.Object3D | null => k.build?.parts[name] ?? null;
/** 站在挂点的「来人一侧」dist 米处、面朝它（挂点的 +z 朝着来人的那一侧）；side 往人的右手挪 */
export function before(a: THREE.Object3D, dist: number, side = 0): Spot {
  const y = a.rotation.y, fx = Math.sin(y), fz = Math.cos(y);
  return { x: a.position.x + fx * dist - fz * side, z: a.position.z + fz * dist + fx * side, yaw: y + Math.PI };
}
/** 坐处的挂点（它的 +z 就是坐下后面朝的方向）后面 back 米：人先站在这里，再挪上去坐 */
export function behindSeat(a: THREE.Object3D, back: number): Spot {
  const y = a.rotation.y;
  return { x: a.position.x - Math.sin(y) * back, z: a.position.z - Math.cos(y) * back, yaw: y };
}
/** 以 c 为中心的一个机位：从 dirYaw 那一侧（0 是南边）退 dist 米、高 h 米，看着 c 抬高 lookUp 的地方 */
export function shot(c: THREE.Vector3, dirYaw: number, dist: number, h: number, lookUp = 0, fov = 40, o: { yaw?: number; up?: number; down?: number } = {}) {
  return { pos: new THREE.Vector3(c.x + Math.sin(dirYaw) * dist, c.y + h, c.z + Math.cos(dirYaw) * dist), look: new THREE.Vector3(c.x, c.y + lookUp, c.z), fov, yaw: o.yaw ?? 18, up: o.up ?? 10, down: o.down ?? 8 };
}
/** 小人会不会「坐凳」（坐在凳上、腿垂下）：有就用，没有就盘腿坐 */
export function canBench(k: Anlewo): boolean {
  const w = (k.player.av as unknown as { w?: Record<string, number> }).w;
  return !!w && 'bench' in w;
}
/** 坐下：bench 是坐凳（root 在脚下，座面在身后），sit 是盘腿坐在垫面上（root 在垫面上） */
export function sitDown(k: Anlewo, seat: THREE.Object3D, o: { mat?: Seat; ground: number; dur?: number } ): 'bench' | 'sit' {
  const p = k.player, av = p.av, h = seat.position.y - o.ground, y = seat.rotation.y;
  if (canBench(k) && h > 0.25) {
    // 坐凳：脚落在座面前 0.2 米的地上；告诉它座面在哪
    const fx = seat.position.x + Math.sin(y) * 0.2, fz = seat.position.z + Math.cos(y) * 0.2;
    av.setSeat?.({ h, cz: -0.2, hx: 0.18, hz: 0.15 });
    av.setPose('bench' as PoseName, o.dur ?? 1.1);
    p.slideTo(fx, fz, 1.0); p.lift = 0;
    return 'bench';
  }
  av.setSeat?.(o.mat ?? { h, hx: 0.3, hz: 0.25 });
  av.setPose('sit', o.dur ?? 1.4);
  p.slideTo(seat.position.x, seat.position.z, 1.2); p.lift = h;
  return 'sit';
}
/** 季节的名字 */
export const SEASON_CN: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
