/**
 * 四样比试（射箭、蹴鞠、斗鸡、骑）共用的家什：
 *   afterFrame —— 每帧在画之前、总装与村里人都走完以后再调一回（借来的牛、驴要在村里人摆完之后藏起来，才压得住）；
 *   Partner —— 陪你玩的村里人：一副现做的身子（村里人那一副，粗的一档），走过来、站定、做动作，玩完走开收走；
 *     挑谁来陪：名单上此刻不在近处、不在画面里的那一位（免得画里同时有两个小乙）；
 *   让开 —— 比试时村里人绕开的几个圆（life/person.ts 的 Person.shun）；
 *   几句常用的话。
 */
import * as THREE from 'three';
import type { Anlewo } from '../../Anlewo';
import { Figure } from '../../avatar/figure';
import type { Look } from '../../avatar/types';
import { LOOKS } from '../../life/looks';
import { Person } from '../../life/person';
import { footY } from '../../life/spots';
import { cnNum } from '../kit';

// —— 画之前再调一回 ——
type Fn = (dt: number) => void;
const AFTER = new WeakMap<Anlewo, { fns: Array<{ f: Fn; bad: number; name: string }>; t: number }>();
/** 每帧在画之前调 fn（总装、村里人、生灵都走完了）。出错三次就停掉那一个 */
export function afterFrame(k: Anlewo, name: string, f: Fn) {
  let a = AFTER.get(k);
  if (!a) {
    const A = (a = { fns: [] as Array<{ f: Fn; bad: number; name: string }>, t: performance.now() });
    AFTER.set(k, A);
    k.world.pre.push(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - A.t) / 1000);
      A.t = now;
      for (const e of A.fns) {
        if (e.bad >= 3) continue;
        try { e.f(dt); } catch (err) { e.bad++; console.warn(`比试·${e.name} 出错（第 ${e.bad} 次）`, err); }
      }
    });
  }
  a.fns.push({ f, bad: 0, name });
}

// —— 让开 ——
/** 一组村里人要绕开的圆：set 放进去（每帧挪），off 拿走 */
export function shunning(n: number) {
  const ds = Array.from({ length: n }, () => ({ x: 1e6, z: 1e6, r: 0 }));
  return {
    set(i: number, x: number, z: number, r: number) { const d = ds[i]; d.x = x; d.z = z; d.r = r; if (!Person.shun.includes(d)) Person.shun.push(d); },
    off() { for (const d of ds) { d.r = 0; const i = Person.shun.indexOf(d); if (i >= 0) Person.shun.splice(i, 1); } },
  };
}

// —— 陪你玩的村里人 ——
export interface Who { id: string; look: keyof typeof LOOKS | Partial<Look>; name: string }
/**
 * 挑一位：名单上此刻不在场、或离 (x, z) 远过 45 米又不在镜头近处的那一位；都在近处就挑第一位
 * （他本人就在这里——那就由这一副身子替他，本人那一副藏不了，至少不挑画里正看得见的）
 */
export function pickWho(k: Anlewo, list: Who[], x: number, z: number): Who {
  const npcs = k.life?.npcs ?? {}, cam = k.world.camera.position;
  for (const w of list) {
    const n = npcs[w.id];
    if (!n || !n.present) return w;
    const d = Math.hypot(n.pos.x - x, n.pos.z - z), dc = Math.hypot(n.pos.x - cam.x, n.pos.z - cam.z);
    if (d > 45 && dc > 45) return w;
  }
  return list[0];
}

const lowQ = (k: Anlewo) => ({ ...k.q, tier: 'low' as const, tex: k.q.tex * 0.5 });
const wrapA = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

export class Partner {
  fig: Figure; name: string; id: string;
  pos = new THREE.Vector3(); yaw = 0;
  speed = 0;
  /** 要走到哪、到了做什么 */
  private goal: { x: number; z: number; then?: () => void; v: number } | null = null;
  private face: number | null = null;
  /** 迈一小步（踢鞠时往前一凑）：从哪到哪、走了几成 */
  private hop: { x0: number; z0: number; x1: number; z1: number; t: number; dur: number } | null = null;
  constructor(k: Anlewo, who: Who, at: { x: number; z: number; yaw: number }) {
    this.name = who.name; this.id = who.id;
    const look = typeof who.look === 'string' ? (LOOKS[who.look] as Partial<Look>) : who.look;
    this.fig = new Figure(lowQ(k), look);
    this.fig.root.name = `games:partner:${who.id}`;
    this.fig.setGround((x, z) => footY(x, z));
    this.fig.setHands('free', 0);
    this.pos.set(at.x, footY(at.x, at.z), at.z); this.yaw = at.yaw;
    k.world.scene.add(this.fig.root);
    this.place();
    for (let i = 0; i < 20; i++) this.fig.update(0.05, i * 0.05, { speed: 0 });
  }
  /** 在路上没有 */
  get walking() { return !!this.goal || !!this.hop; }
  walkTo(x: number, z: number, then?: () => void, v = 1.15) { this.goal = { x, z, then, v }; this.face = null; }
  turnTo(yaw: number) { this.face = yaw; }
  /** 往前一凑（米），dur 秒 */
  step(x: number, z: number, dur = 0.32) { this.hop = { x0: this.pos.x, z0: this.pos.z, x1: x, z1: z, t: 0, dur }; }
  stop() { this.goal = null; this.hop = null; }
  private place() {
    const r = this.fig.root;
    r.position.copy(this.pos); r.rotation.set(0, this.yaw, 0);
  }
  update(dt: number, t: number) {
    dt = Math.min(dt, 0.1);
    let sp = 0;
    if (this.hop) {
      const h = this.hop; h.t = Math.min(1, h.t + dt / h.dur);
      const e = h.t * h.t * (3 - 2 * h.t), px = this.pos.x, pz = this.pos.z;
      this.pos.x = h.x0 + (h.x1 - h.x0) * e; this.pos.z = h.z0 + (h.z1 - h.z0) * e;
      sp = Math.hypot(this.pos.x - px, this.pos.z - pz) / Math.max(dt, 1e-3);
      if (h.t >= 1) this.hop = null;
    } else if (this.goal) {
      const g = this.goal, dx = g.x - this.pos.x, dz = g.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.04) { this.goal = null; g.then?.(); }
      else {
        const want = Math.atan2(dx, dz), off = wrapA(want - this.yaw);
        this.yaw = wrapA(this.yaw + Math.max(-dt * 6, Math.min(dt * 6, off)));
        const v = Math.min(g.v, 0.25 + d * 1.6) * Math.max(0.2, Math.cos(Math.min(Math.abs(off), 1.5)));
        const s = Math.min(d, v * dt);
        this.pos.x += (dx / d) * s; this.pos.z += (dz / d) * s; sp = s / Math.max(dt, 1e-3);
      }
    } else if (this.face != null) {
      const off = wrapA(this.face - this.yaw);
      this.yaw = wrapA(this.yaw + Math.max(-dt * 5, Math.min(dt * 5, off)));
      if (Math.abs(off) < 0.01) this.face = null;
    }
    this.speed += (sp - this.speed) * Math.min(1, dt * 12);
    this.pos.y = footY(this.pos.x, this.pos.z);
    this.place();
    this.fig.update(dt, t, { speed: this.speed < 0.05 ? 0 : this.speed });
  }
  dispose() {
    const r = this.fig.root;
    r.removeFromParent();
    try { this.fig.dispose(); } catch { /* 无妨 */ }
  }
}

// —— 几句常用的话 ——
export const cn = cnNum;
/** 「榜上第三」「榜上第一」 */
export const rankText = (rank: number) => (rank <= 1 ? '榜上第一' : `榜上第${cnNum(rank)}`);
/** 风从哪来（dx, dz 是风吹去的方向） */
const FROM = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
export const windFrom = (dx: number, dz: number) => { const a = Math.atan2(-dx, dz); return FROM[Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]; };
/** 有没有键盘、鼠标（键盘上的提示只给它们看） */
export const hasKb = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/** 测试、调试用：各样比试把自己的几样状态挂在这里（window.__games） */
export const DEBUG: Record<string, unknown> = {};
if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__games = DEBUG;
