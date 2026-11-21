/**
 * 雪地上的脚印：雀跳过去一对对的「个」字、鸡走过去一行大些的「个」字、狗跑过去一串梅花似的爪印。
 * 只在地上积着雪的时候有（U.uSnow，由天时那边记着积雪几成）；印子过一两分钟就被新雪填平（慢慢缩小、淡下去），雪下得紧时填得快。
 * 每一个印是一小块平贴在雪面上的薄片（不积雪、不勾线），全在一个几何里，一次绘制。
 */
import * as THREE from 'three';
import { M, box, merge, sphere, type Geo } from '../../core/geo';
import { U } from '../../ink/ink';
import type { Ctx } from '../person';
import { Parts, creatureMat, paint, trs } from '../rig';
import { footY } from '../spots';

const DENT: [number, number, number] = [0.8, 0.84, 0.9];
/** 鸟的「个」字：三个朝前的趾、一个朝后的 */
function birdPrint(s: number): Geo {
  const toe = (a: number, l: number) => paint(box(0.12 * s, 0.004, l * s).translate(0, 0, (l * s) / 2), DENT).applyMatrix4(M.ry(a));
  return merge([toe(-0.5, 0.55), toe(0, 0.65), toe(0.5, 0.55), toe(Math.PI, 0.35)]);
}
/** 狗的爪印：一个掌垫、四个趾垫 */
function pawPrint(): Geo {
  const pad = (x: number, z: number, r: number) => paint(sphere(1, 6, 3).scale(r, 0.004, r * 1.15), DENT).translate(x, 0, z);
  return merge([pad(0, -0.012, 0.018), pad(-0.016, 0.016, 0.008), pad(-0.006, 0.026, 0.008), pad(0.006, 0.026, 0.008), pad(0.016, 0.016, 0.008)]);
}
type Kind = 'bird' | 'hen' | 'dog';
interface Print { k: number; age: number; x: number; z: number; y: number; yaw: number; on: boolean }
/** 一个会留脚印的：位置从 get 里取；走够 stride 米落一印（雀是双脚一跳落一对） */
interface Source { get(): { x: number; z: number; y?: number } | null; kind: Kind; stride: number; lx: number; lz: number; side: number }

export class Tracks {
  parts: Parts;
  private pool: Record<Kind, Print[]> = { bird: [], hen: [], dog: [] };
  private next: Record<Kind, number> = { bird: 0, hen: 0, dog: 0 };
  private src: Source[] = [];
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0, line: 0, flat: 1, shade: 1, snow: 0, grain: 1 }), 'tracks'));
    const g = { bird: birdPrint(0.05), hen: birdPrint(0.11), dog: pawPrint() };
    for (const [kind, n] of [['bird', 90], ['hen', 60], ['dog', 50]] as Array<[Kind, number]>) for (let i = 0; i < n; i++) this.pool[kind].push({ k: P.add(g[kind]), age: 0, x: 0, z: 0, y: 0, yaw: 0, on: false });
    P.build();
    for (let k = 0; k < P.count; k++) P.hide(k);
    P.mesh.visible = false;
  }
  /** 登记一个会留脚印的 */
  follow(kind: Kind, get: Source['get']) { this.src.push({ get, kind, stride: kind === 'bird' ? 0.09 : kind === 'hen' ? 0.13 : 0.28, lx: 1e9, lz: 1e9, side: 1 }); }
  private drop(kind: Kind, x: number, z: number, y: number, yaw: number) {
    const pool = this.pool[kind], p = pool[this.next[kind]];
    this.next[kind] = (this.next[kind] + 1) % pool.length;
    p.on = true; p.age = 0; p.x = x; p.z = z; p.y = y; p.yaw = yaw;
  }
  update(c: Ctx) {
    const snow = U.uSnow.value, P = this.parts;
    const on = snow > 0.3;
    if (!on && !P.mesh.visible) return;
    if (on) for (const s of this.src) {
      const p = s.get();
      if (!p) { s.lx = 1e9; continue; }
      const d = Math.hypot(p.x - s.lx, p.z - s.lz);
      if (d > 3) { s.lx = p.x; s.lz = p.z; continue; }
      if (d < s.stride) continue;
      const yaw = Math.atan2(p.x - s.lx, p.z - s.lz), y = p.y ?? footY(p.x, p.z), ox = Math.cos(yaw) * 0.025, oz = -Math.sin(yaw) * 0.025;
      if (s.kind === 'bird') { this.drop('bird', p.x + ox, p.z + oz, y, yaw); this.drop('bird', p.x - ox, p.z - oz, y, yaw); }
      else { s.side = -s.side; this.drop(s.kind, p.x + ox * s.side * (s.kind === 'dog' ? 2.4 : 1.6), p.z + oz * s.side * (s.kind === 'dog' ? 2.4 : 1.6), y, yaw); }
      s.lx = p.x; s.lz = p.z;
    }
    // 慢慢被新雪填平
    const fill = c.dt * (c.snow > 0.5 ? 1 / 60 : 1 / 140);
    let any = false;
    for (const kind of ['bird', 'hen', 'dog'] as Kind[]) for (const p of this.pool[kind]) {
      if (!p.on) continue;
      p.age += fill;
      if (p.age >= 1 || !on) { p.on = false; P.hide(p.k); continue; }
      any = true;
      P.place(p.k, trs(_m, p.x, p.y + 0.008, p.z, p.yaw, 0, 0, 1 - 0.6 * p.age * p.age));
    }
    P.mesh.visible = any;
    if (any || !on) P.commit();
  }
}
const _m = new THREE.Matrix4();
