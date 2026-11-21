/**
 * 农事各件事共用的：面板 state 的写法、跟着人走的镜头、按住的那一枚键、人身上的几个方向、把家什交到手里、
 * 「此刻能不能干活」（夜里、雨天、冬天）、农事链的那几步。
 * （这个文件不在 acts/ 底下，不会被当成一件事。）
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from '../acts/types';
import { hold as gripObj } from '../acts/util';
import { CHAIN, TIPS, type CropId } from '../../data/farm';
import { blocked, standable } from '../walk';

export type St = Record<string, unknown>;
/** 农事的一件事：此刻有没有（on）由田里的样子定 */
export type FAct = Act & { on(): boolean };
/** 一件事的骨架：state 整个换（set）或改几样（put） */
export function base(k: Anlewo) {
  const state: St = {};
  const undo: Array<() => void> = [];
  let last = 0;
  return {
    state, undo,
    set(p: St) { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); last = performance.now(); },
    /** 改几样；quick 为真时一秒最多发二十回（表的指针、进度） */
    put(p: St, quick = false) { Object.assign(state, p); const n = performance.now(); if (!quick || n - last > 50) { k.emitAct(); last = n; } },
    restore() { while (undo.length) undo.pop()!(); },
  };
}

/** 跟着人的镜头：先缓缓过去，之后每帧把机位挪一点（直接改交给 Nav 的那一份） */
export class Cam {
  pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, yaw: 16, up: 10, down: 8 };
  private goalPos = new THREE.Vector3(); private goalLook = new THREE.Vector3();
  constructor(private k: Anlewo) {}
  start(pos: THREE.Vector3, look: THREE.Vector3, fov = 40, dur = 1.5) {
    this.pose.pos.copy(pos); this.pose.look.copy(look); this.pose.fov = fov;
    this.goalPos.copy(pos); this.goalLook.copy(look);
    this.k.nav.setPose(this.pose, dur);
  }
  /** 要去的机位（每帧给也行，它自己慢慢跟过去） */
  aim(pos: THREE.Vector3, look: THREE.Vector3) { this.goalPos.copy(pos); this.goalLook.copy(look); }
  update(dt: number, rate = 1.6) {
    const s = 1 - Math.exp(-dt * rate);
    this.pose.pos.lerp(this.goalPos, s); this.pose.look.lerp(this.goalLook, s);
  }
}
/** 以 c 为中心、从 fromYaw 那边（0 是南）退 dist 米、高 h 米看过去的机位 */
export function view(c: THREE.Vector3, fromYaw: number, dist: number, h: number, lookUp = 0.6) {
  return { pos: new THREE.Vector3(c.x + Math.sin(fromYaw) * dist, c.y + h, c.z + Math.cos(fromYaw) * dist), look: new THREE.Vector3(c.x, c.y + lookUp, c.z) };
}

/**
 * 找一个看得见的机位：从 fromYaw 起左右转着试，镜头脚下要能站人、镜头到 c 之间不隔着墙、篱、鸡埘一类的东西。
 * 都不行就还用 fromYaw 那一个
 */
export function clearView(c: THREE.Vector3, fromYaw: number, dist: number, h: number, lookUp = 0.6) {
  for (const d of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, 2.6, -2.6]) {
    const v = view(c, fromYaw + d, dist, h, lookUp), px = v.pos.x, pz = v.pos.z;
    if (standable(px, pz) == null) continue;
    let ok = true;
    for (let t = 0.3; t <= 1.0001 && ok; t += 0.1) { const x = c.x + (px - c.x) * t, z = c.z + (pz - c.z) * t; if (blocked(x, z)) ok = false; }
    if (ok) return v;
  }
  return view(c, fromYaw, dist, h, lookUp);
}
/** 人自己坐标里的一点、一个方向在世界里（+x 是他的左手边，+z 是前） */
export function loc(k: Anlewo, lx: number, ly: number, lz: number, out = new THREE.Vector3()) {
  const p = k.player, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return out.set(p.pos.x + lx * c + lz * s, p.pos.y + ly, p.pos.z - lx * s + lz * c);
}
export function dirL(k: Anlewo, lx: number, ly: number, lz: number, out = new THREE.Vector3()) {
  const c = Math.cos(k.player.yaw), s = Math.sin(k.player.yaw);
  return out.set(lx * c + lz * s, ly, -lx * s + lz * c).normalize();
}
export const UPV = new THREE.Vector3(0, 1, 0), DOWNV = new THREE.Vector3(0, -1, 0);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const ease = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };

/** 把家什交到手里（挂到掌心）；返回「放回去」。还会记进 undo，事一完自动放回 */
export function grip(k: Anlewo, undo: Array<() => void>, obj: THREE.Object3D, side: 'L' | 'R', pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) {
  const hand = side === 'L' ? k.player.av.joints.handL : k.player.av.joints.handR;
  obj.visible = true;
  const back = gripObj(obj, hand, pos, rot);
  const u = () => { back(); obj.visible = false; obj.removeFromParent(); };
  undo.push(u);
  return u;
}

/** 按住的那一枚键（界面上的大键、键盘空格）：down 按着没有、按下了多久、刚刚松开 */
export class Press {
  down = false; t = 0; released = false; pressed = false;
  cmd(arg: unknown) {
    if (arg === 'down' && !this.down) { this.down = true; this.t = 0; this.pressed = true; }
    else if (arg === 'up' && this.down) { this.down = false; this.released = true; }
  }
  /** 每帧：记按住多久；返回这一帧有没有刚按下、刚松开（读过就清掉） */
  step(dt: number) { if (this.down) this.t += dt; const r = { pressed: this.pressed, released: this.released }; this.pressed = this.released = false; return r; }
  reset() { this.down = false; this.t = 0; this.pressed = this.released = false; }
}

/** 此刻能不能做田里的活：夜里看不清、冬天地冻、（场上的活）雨天不行。返回为什么不行（行就是 null） */
export function why(k: Anlewo, o: { night?: number; rain?: boolean; winter?: boolean } = {}): string | null {
  if (k.atmos.night > (o.night ?? 0.62)) return TIPS.night;
  if (o.winter && k.season === 'winter') return TIPS.winter;
  if (o.rain && k.atmos.w.rain > 0.45) return TIPS.rain;
  return null;
}
/** 农事链（界面的 steps）：这样庄稼的几步、此刻在第几步 */
export function chain(crop: CropId | null, step: string): { steps: string[]; step: number } {
  const list = CHAIN[crop ?? 'wheat'];
  return { steps: list, step: Math.max(0, list.indexOf(step)) };
}

/** 让人自己走到一点（做事时一步一步挪）：返回一个「到了没有」 */
export function walk(k: Anlewo, x: number, z: number, yaw?: number) {
  const st = { done: false, fail: false };
  const p = k.player;
  if (Math.hypot(p.pos.x - x, p.pos.z - z) < 0.06) { st.done = true; if (yaw != null) p.faceTo = yaw; return st; }
  p.goTo(x, z, { r: 0.06, then: () => { st.done = true; if (yaw != null) p.faceTo = yaw; }, fail: () => { st.done = true; st.fail = true; if (yaw != null) p.faceTo = yaw; } });
  return st;
}
/**
 * 顺着几个点一段一段走过去（远路：每一段交给找路，过桥、绕篱都由它）；走到了调用 then。
 * 半路自己动了手（按了方向键、推了摇杆）就作罢。
 */
export function walkVia(k: Anlewo, pts: Array<[number, number]>, then: () => void) {
  const p = k.player;
  let i = 0;
  const leg = () => {
    if (i >= pts.length) { then(); return; }
    const [x, z] = pts[i++];
    p.goTo(x, z, { r: 0.6, then: leg, fail: () => { if (Math.hypot(p.pos.x - x, p.pos.z - z) < 2.5) leg(); } });
  };
  leg();
}
/** 一件事做完、该起身时的那一枚签 */
export const BYE = { id: 'done', label: '歇一歇' };
/** 给 Act 补上：spot / anchor 是可以就地改的（下一回从做到的地方接着做） */
export function movable(a: Act, x: number, z: number, yaw: number, ax: number, ay: number, az: number) {
  a.spot.x = x; a.spot.z = z; a.spot.yaw = yaw; a.anchor.set(ax, ay, az);
}
