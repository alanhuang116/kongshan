/**
 * 各家都做的那些小事：坐在矮凳上干手里的活、喂鸡、扫地、挑水、两个人坐着说话、听书。
 * 每样是一个「事」的做法（返回 Act），各人在 people.ts / villagers.ts 里按自己的地方、家什拿去用。
 *
 * 写法同 people.ts：手伸到哪里由脚本每帧告诉小人（reach），东西挂在掌心的挂点上；位置用 p.loc(左, 上, 前)。
 */
import * as THREE from 'three';
import type { HandsName } from '../avatar/types';
import { FAUNA } from './fauna/api';
import { Person, type Act, type Ctx, type Script } from './person';
import { door, footY, type Spot, type StoolSeat } from './spots';
import type { Kit } from './people';

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const UPV = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();

/** 一边走一段脚本，一边每帧做一件事（挎着篮子走、扛着担子走） */
export function* during(g: Script, fn: () => void): Script {
  for (;;) { const r = g.next(); if (r.done) return; fn(); yield; }
}
/** 把一件家什摆在地上某处（世界坐标），显出来；换事时随人收起 */
export function setDown(p: Person, o: THREE.Object3D, s: { x: number; z: number; yaw?: number }, y = 0) {
  p.hold(o, 'world'); o.position.set(s.x, footY(s.x, s.z) + y, s.z); o.rotation.set(0, s.yaw ?? 0, 0);
}
/** 搬出矮凳坐下：凳摆在 s.stool，人坐上去（两腿垂着） */
export function* sitStool(p: Person, s: StoolSeat, stool: THREE.Object3D, speed = 0.9, hands: HandsName = 'free'): Script {
  yield* p.go({ x: s.x, z: s.z }, speed, [[s.x + Math.sin(s.yaw) * 0.55, s.z + Math.cos(s.yaw) * 0.55]]);
  setDown(p, stool, s.stool);
  yield* p.bench(s, speed, undefined, hands);
}
/** 挑在肩上（扁担顺着肩，两头的东西垂着）：人的右肩 */
export function shoulder(p: Person, o: THREE.Object3D) { p.hold(o, 'chest'); o.position.set(-0.15, 0.21, 0.02); o.rotation.set(0, Math.PI / 2, 0); }
/** 挑担走路时右手扶着扁担 */
export const steadyPole = (p: Person) => p.fig.reach('R', p.loc(-0.17, 1.37, 0.24, v1), { dir: p.dir(0.4, 0.5, 0.75, v2), palm: DOWN, rate: 12 });

/**
 * 喂鸡（鹅）：左臂托着簸箕，右手抓一把撒出去；撒在身前一步半，鸡群围过来（fauna 的 hens.scatter）。
 * 喂完了若给了扫地的几处，接着扫地。
 */
export function feedAct(k: Kit, at: Spot, tray: THREE.Object3D, sweep?: { spots: Spot[]; broom: THREE.Object3D }, hens = true): Act {
  return function* (p, c) {
    const f = p.fig;
    yield* p.go(at, 0.9);
    p.pose('stand'); p.hold(tray, 'L');
    const carry = () => f.reach('L', p.loc(0.16, 0.98, 0.25, v5), { dir: p.dir(-0.4, 0, 1, v4), palm: UPV, rate: 14 });
    p.rest = () => { carry(); f.reach('R', null); };
    const pt = p.loc(-0.3, 0, 1.5, new THREE.Vector3());
    if (hens) k.folk.feedAt = { x: pt.x, z: pt.z };
    for (let n = 0; n < (sweep ? 9 : 1e9); n++) {
      yield* p.tween(0.8, (u) => { carry(); f.reach('R', p.loc(lerp(-0.2, 0.1, u), lerp(0.9, 1.02, u), 0.26, v1), { dir: p.dir(0.6, -0.5, 0.4, v2), rate: 10 }); });
      yield* p.tween(0.55, (u) => { carry(); f.reach('R', p.loc(lerp(0.1, -0.42, u), lerp(1.02, 0.86, u), lerp(0.26, 0.58, u), v1), { dir: p.dir(-0.3, -0.2, 1, v2), palm: DOWN, rate: 16 }); });
      if (hens) FAUNA.hens?.scatter(pt.x + (k.R() - 0.5), pt.z + (k.R() - 0.5), 6);
      yield* during(p.wait(0.5), carry);
      f.reach('R', null);
      yield* during(p.wait(k.rnd(1.2, 2.6)), carry);
    }
    if (hens && k.folk.feedAt && Math.abs(k.folk.feedAt.x - pt.x) < 0.01) k.folk.feedAt = null;
    tray.visible = false; f.reach('L', null);
    if (sweep) yield* sweepAct(k, sweep.spots, sweep.broom)(p, c);
  };
}
/** 扫地：帚竖着提在手里走到一处，左右一下一下地扫；扫过几处再从头 */
export function sweepAct(k: Kit, spots: Spot[], broom: THREE.Object3D): Act {
  return function* (p, c) {
    const f = p.fig;
    const carry = () => f.reach('R', p.loc(-0.22, 0.98, 0.16, v1), { dir: p.dir(0, 1, 0.12, v2), rate: 10 });
    // 扫的几处先都记上（摸狗时狗挑地方卧，不卧在她待会儿要扫的那一块上）
    for (const s of spots) p.mark(s);
    for (let n = 0; ; n++) {
      const s = spots[n % spots.length];
      p.hold(broom, 'R');
      yield* during(p.go(s, 0.85), carry);
      p.pose('stand');
      const stroke = (u: number) => {
        const r = p.loc(-0.14 + 0.2 * u, 1.02, 0.26, v1), d = v2.set(-0.28 + 0.56 * u, -0.9, 0.36).normalize(), wd = p.dir(d.x, d.y, d.z, v3);
        f.reach('R', r, { dir: v4.copy(wd).multiplyScalar(-1), palm: p.dir(1, 0, 0, v5), rate: 12 });
        f.reach('L', v4.copy(r).addScaledVector(wd, 0.36 * p.scale), { dir: v5.copy(wd).multiplyScalar(-1), rate: 12 });
        f.bow = 0.2;
      };
      p.rest = () => stroke(0.5);
      for (let i = 0, N = 5 + (n % 3); i < N; i++) { c.sfx('broom', p.pos.x, p.pos.z, 0.3); yield* p.tween(0.9, (u) => stroke(u)); yield* p.tween(0.5, (u) => stroke(1 - u)); }
      f.reach('L', null); f.reach('R', null); f.bow = 0; p.rest = null;
      // 扫完一处直直腰
      yield* p.wait(k.rnd(1.5, 3.5));
    }
  };
}

/**
 * 坐在矮凳上干手里的活（搓草绳、纳鞋底、编小筐、拣豆子……）：work(t) 每帧摆两只手；隔一阵直直腰、抬头看看。
 * look：干活时眼睛看着哪（他自己坐标里的一点）。
 */
export function stoolWork(k: Kit, seat: StoolSeat, stool: THREE.Object3D, o: { props?: (p: Person) => void; work: (p: Person, t: number) => void; look?: [number, number, number]; sfx?: { name: string; every: number; vel?: number }; hands?: HandsName }): Act {
  return function* (p, c) {
    const f = p.fig;
    yield* sitStool(p, seat, stool, 0.9, o.hands ?? 'free');
    o.props?.(p);
    p.rest = () => { f.reach('R', null); f.reach('L', null); f.bow = 0.04; };
    let next = o.sfx ? o.sfx.every * (0.5 + k.R()) : 1e9;
    for (;;) {
      for (let t = 0, T = k.rnd(14, 26); t < T; t += p.dt) {
        o.work(p, t);
        if (o.look) f.lookAt(p.loc(o.look[0], o.look[1], o.look[2], v3));
        if ((next -= p.dt) < 0 && o.sfx) { next = o.sfx.every * (0.7 + 0.6 * k.R()); c.sfx(o.sfx.name, p.pos.x, p.pos.z, o.sfx.vel ?? 0.3); }
        yield;
      }
      // 歇一歇：手放下，直起腰，看看路上
      f.reach('R', null); f.reach('L', null); f.lookAt(null);
      yield* p.tween(0.8, (u) => { f.bow = lerp(f.bow, 0, u); });
      yield* p.wait(k.rnd(2.5, 5));
    }
  };
}
/** 搓草绳：两掌合着来回搓，隔一阵左手把搓好的那截往外一抻 */
export function ropeWork(p: Person, t: number) {
  const f = p.fig, a = Math.sin(t * 5.2), pull = Math.max(0, Math.sin(t * 0.55)) ** 6;
  f.reach('R', p.loc(-0.05 + 0.06 * a, 0.42, 0.3, v1), { dir: p.dir(0.6, 0, 0.8, v2), palm: p.dir(1, 0.4, 0, v4), rate: 16 });
  f.reach('L', p.loc(0.06 - 0.06 * a + 0.2 * pull, 0.43 + 0.05 * pull, 0.3 + 0.12 * pull, v3), { dir: p.dir(-0.6, 0, 0.8, v2), palm: p.dir(-1, 0.4, 0, v5), rate: 16 });
  f.bow = 0.24;
}
/** 纳鞋底：左手拿着鞋底在胸前，右手一针一针往外拽线（拽得长长的） */
export function sewWork(p: Person, t: number) {
  const f = p.fig, ph = (t * 0.45) % 1, pull = ph < 0.55 ? Math.sin((ph / 0.55) * Math.PI) : 0;
  f.reach('L', p.loc(0.06, 0.62, 0.3, v1), { dir: p.dir(-0.2, 0.9, 0.3, v2), palm: p.dir(-0.6, 0, -0.8, v4), rate: 10 });
  f.reach('R', p.loc(lerp(0.02, -0.3, pull), lerp(0.64, 0.82, pull), lerp(0.3, 0.38, pull), v3), { dir: p.dir(-0.3, 0.6, 0.5, v2), rate: 12 });
  f.bow = 0.16 - 0.05 * pull;
}
/** 拣豆子：簸箕搁在膝上，右手在里头拨、拈出一粒扔到一边 */
export function pickWork(p: Person, t: number) {
  const f = p.fig, ph = (t * 0.6) % 1, fling = ph > 0.8 ? Math.sin(((ph - 0.8) / 0.2) * Math.PI) : 0;
  f.reach('L', p.loc(0.16, 0.5, 0.36, v1), { dir: p.dir(0, 0, 1, v2), palm: UPV, rate: 10 });
  f.reach('R', p.loc(-0.03 + 0.07 * Math.sin(t * 3.3) - 0.28 * fling, 0.53 + 0.08 * fling, 0.36 + 0.05 * Math.cos(t * 2.1), v3), { dir: p.dir(0, -0.6, 0.8, v4), rate: 12 });
  f.bow = 0.3;
}

/**
 * 两个人坐着（或站着）说话：轮着一个说一个听，说的那个抬手比划，听的那个点头、有时笑；
 * mate() 给对面那个人（不在场就自己坐着歇）。talkT 是两人共用的钟（各取 c.t），lead 决定谁先开口。
 */
export function* chatWith(k: Kit, p: Person, mate: () => Person | undefined, lead: boolean): Script {
  const f = p.fig;
  let laughs = 0;
  for (let t = 0; ; t += p.dt) {
    const q = mate();
    if (q?.here) {
      f.lookAt(v1.set(q.pos.x, q.pos.y + 1.0 * q.scale + (q.seated ? 0 : 0.4), q.pos.z));
      const kk = (p.c.t / 3.1) | 0, mine = (kk % 2 === 0) === lead, u = (p.c.t / 3.1) % 1;
      if (mine) {
        const g = Math.max(0, Math.sin(u * Math.PI)) * (0.6 + 0.4 * Math.sin(t * 2.7));
        f.reach('R', p.loc(-0.2, (p.seated ? 0.62 : 1.0) + 0.1 * g, 0.32 + 0.06 * g, v2), { dir: p.dir(0.2, 0.5, 0.85, v3), palm: p.dir(0, 0.8, 0.2, v4), rate: 6 });
        f.bow = 0.08 + 0.04 * g;
      } else {
        f.reach('R', null);
        f.bow = 0.06 + 0.06 * Math.max(0, Math.sin(u * Math.PI * 4)) * (u < 0.4 ? 1 : 0);
        if (lead && laughs < 3 && Math.random() < p.dt * 0.03) { laughs++; p.c.sfx('laugh', p.pos.x, p.pos.z, 0.22 + 0.12 * Math.random()); }
      }
    } else { f.reach('R', null); f.lookAt(null); f.bow = 0.04; }
    yield;
  }
}

/** 挑水：挑着空桶到井边，放下担子，探身打两桶水上来倒进桶里，挑起来送到 to（门口或水缸），倒了再去 */
export function waterAct(k: Kit, well: { draw: Spot; load: Spot; mouth: { x: number; z: number }; y: number }, load: THREE.Object3D, to: Spot, pourVat = false): Act {
  return function* (p, c) {
    const f = p.fig;
    for (let trip = 0; ; trip++) {
      shoulder(p, load); p.rest = () => steadyPole(p);
      yield* during(p.go(well.draw, 1.0), () => steadyPole(p));
      // 放下担子
      yield* p.tween(1.0, (u) => { f.bow = 0.55 * u; steadyPole(p); });
      setDown(p, load, well.load, 0.56); f.reach('R', null); p.rest = null;
      yield* p.tween(0.8, (u) => { f.bow = 0.55 * (1 - u); });
      // 探身往井里放绳、一把一把地拽上来（两回）
      for (let n = 0; n < 2; n++) {
        yield* p.tween(0.9, (u) => { f.bow = 0.45 * u; f.reach('R', p.loc(-0.12, lerp(1.0, 0.75, u), 0.45, v1), { dir: DOWN, rate: 10 }); f.reach('L', p.loc(0.12, lerp(1.0, 0.8, u), 0.45, v2), { dir: DOWN, rate: 10 }); });
        for (let i = 0; i < 6; i++) {
          const side = i % 2 ? 'L' : 'R', sx = i % 2 ? 0.12 : -0.12;
          yield* p.tween(0.45, (u) => { f.reach(side, p.loc(sx, lerp(0.72, 1.12, u), lerp(0.48, 0.36, u), v1), { dir: DOWN, rate: 14 }); f.bow = 0.4 - 0.1 * u; });
          yield* p.tween(0.25, (u) => f.reach(side, p.loc(sx, lerp(1.12, 0.72, u), lerp(0.36, 0.48, u), v1), { dir: DOWN, rate: 14 }));
        }
        c.sfx('bucketLift', well.mouth.x, well.mouth.z, 0.35);
        // 倒进担子里的桶
        yield* p.tween(1.2, (u) => { f.bow = 0.3 + 0.25 * Math.sin(u * Math.PI); f.reach('R', p.loc(-0.3, lerp(1.0, 0.75, u), 0.5, v1), { dir: p.dir(-0.5, -0.5, 0.7, v2), rate: 8 }); f.reach('L', p.loc(-0.05, lerp(1.0, 0.8, u), 0.55, v3), { dir: p.dir(-0.3, -0.6, 0.7, v2), rate: 8 }); });
        c.sfx('pour', p.pos.x, p.pos.z, 0.3);
        f.reach('R', null); f.reach('L', null); f.bow = 0;
        yield* p.wait(0.4);
      }
      // 挑起来送去
      yield* p.go({ x: well.load.x + 0.55, z: well.load.z, yaw: -Math.PI / 2 }, 0.8, undefined, true);
      yield* p.tween(1.0, (u) => { f.bow = 0.55 * u; });
      shoulder(p, load); p.rest = () => steadyPole(p);
      c.sfx('pole', p.pos.x, p.pos.z, 0.35);
      yield* p.tween(1.1, (u) => { f.bow = 0.55 * (1 - u); steadyPole(p); });
      yield* during(p.go(to, 0.95), () => steadyPole(p));
      if (pourVat) {
        // 倒进水缸：卸下担子，两手提起一桶往缸里倾
        yield* p.tween(0.9, (u) => { f.bow = 0.5 * u; steadyPole(p); });
        setDown(p, load, p.loc(-0.7, 0, 0.1, v4), 0.56); load.rotation.y = p.yaw + Math.PI / 2; f.reach('R', null);
        for (let i = 0; i < 2; i++) {
          yield* p.tween(1.3, (u) => { f.bow = 0.3 + 0.2 * Math.sin(u * Math.PI); f.reach('R', p.loc(-0.15, lerp(0.7, 1.0, u), 0.45, v1), { dir: p.dir(0, -0.3, 1, v2), rate: 8 }); f.reach('L', p.loc(0.15, lerp(0.7, 1.0, u), 0.45, v3), { dir: p.dir(0, -0.3, 1, v2), rate: 8 }); });
          c.sfx('pour', p.pos.x, p.pos.z, 0.35);
          yield* p.wait(0.8);
        }
        f.reach('R', null); f.reach('L', null); f.bow = 0;
      } else {
        // 送到门口：放下，提进屋里（人到门口一站、一俯身，桶就算进屋了）
        yield* p.tween(1.0, (u) => { f.bow = 0.5 * u; steadyPole(p); });
        yield* p.wait(1.5);
        yield* p.tween(1.0, (u) => { f.bow = 0.5 * (1 - u); steadyPole(p); });
      }
      if (trip >= 1) {
        // 挑够了：把空担子放回门边，这一早上的水就算挑完了
        load.visible = false; f.reach('R', null); p.rest = null;
        yield* p.away(1e5);
      }
    }
  };
}

/**
 * 听书：走到自己那个位置（坐矮凳、坐地上、蹲着、站着），看着说书人；他抖一个包袱（story.beat 变了），
 * 隔一小会儿跟着笑（身子一俯一仰，孩子笑出声）。夏天手里一把蒲扇慢慢摇。说书人还没开口、或说完了，就跟身边的人说两句。
 */
export function listenAct(k: Kit, slot: { kind: 'ground' | 'crouch' | 'stool' | 'stand'; at: Spot }, o: { stool?: THREE.Object3D; fan?: THREE.Object3D; kid?: boolean }): Act {
  return function* (p, c) {
    const f = p.fig, s = slot.at, S = k.story;
    if (slot.kind === 'stool' && o.stool) {
      const seat: StoolSeat = { x: s.x + Math.sin(s.yaw) * 0.3, z: s.z + Math.cos(s.yaw) * 0.3, yaw: s.yaw, h: 0.26, cz: -0.3, stool: { x: s.x, z: s.z, yaw: s.yaw } };
      yield* sitStool(p, seat, o.stool, 0.9);
    } else {
      yield* p.go(s, o.kid ? 1.5 : 0.9);
      if (slot.kind === 'ground') yield* p.sit(0, 'lap');
      else if (slot.kind === 'crouch') { p.pose('crouch'); p.seated = true; }
      else p.pose('stand', 'sleeve');
    }
    p.curious = false;
    const fan = c.season === 'summer' ? o.fan : undefined;
    if (fan) p.hold(fan, 'R');
    p.rest = () => { if (!fan) f.reach('R', null); };
    let seen = S.beat, laughAt = -1, mood = 0;
    for (let t = 0; ; t += p.dt) {
      if (S.on) f.lookAt(S.head); else f.lookAt(t % 9 < 5 ? null : v1.set(S.head.x, S.head.y - 0.3, S.head.z));
      // 包袱：隔零点几秒笑起来，笑一阵
      if (S.beat !== seen) { seen = S.beat; laughAt = t + 0.25 + k.R() * 0.6; }
      if (laughAt > 0 && t > laughAt) { laughAt = -1; mood = 1; if (o.kid && k.R() < 0.4) c.sfx('kidsLaugh', p.pos.x, p.pos.z, 0.3); else if (!o.kid && k.R() < 0.25) c.sfx('laugh', p.pos.x, p.pos.z, 0.22); }
      mood = Math.max(0, mood - p.dt * 0.6);
      const base = slot.kind === 'stand' ? 0.04 : slot.kind === 'stool' ? 0.12 : 0.18;
      f.bow = base + 0.16 * mood * (0.5 + 0.5 * Math.sin(t * 9));
      if (fan) {
        // 慢慢地摇，隔一阵停一停
        const w = Math.sin(t * 2.2) * (Math.sin(t * 0.21 + slot.at.x) > -0.3 ? 1 : 0.15);
        f.reach('R', p.loc(-0.17 + 0.04 * w, (p.seated ? 0.74 : 1.18), 0.26, v2), { dir: p.dir(0.18 * w, 0.85, 0.45, v3), palm: p.dir(0.9, 0, -0.3, v4), rate: 7 });
      }
      yield;
    }
  };
}

/** 回家前在家门口站一站（傍晚收工的人到了门口不马上进去：放下手里的、拍拍身上的土） */
export function* atDoor(p: Person, id: string): Script {
  yield* p.go(door(id), 1.05);
  yield* p.wait(1.2);
}
