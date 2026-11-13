/**
 * 村里的一个人：一副身子（avatar/Figure）加上「此刻该做哪件事」。
 *
 *   日程（plan）—— 看时辰、时令、晴雨，说出此刻该做的那件事的名字；null 是回家。
 *   事（acts）—— 每件事是一段脚本（生成器）：走到地方、摆好姿势、一下一下地干，干完一轮从头再来。
 *     脚本一帧走一步（yield 一次）；里面用 p.go / p.wait / p.tween 这些小步子拼。
 *   换事 —— 有人看着、时辰是自己走到的，就走过去（回家是沿着路走到门口不见）。路是自己认的（route.ts）：沿村路、过桥、出入院门；
 *     没人看着、或时辰是被一下子拨过去的，就直接出现在该在的地方。
 *   被叫到（attend）—— 停下脚本，把手里的活放稳（各件事自己说怎么放），转过身（坐着的只转头）看着来人。
 *   留意（notice）—— 行者走到三米以内，不用谁叫：手里一顿，抬头看他，微微一点头，再接着干。
 *   远了就省：四十多米外隔帧动，九十米外四帧一动，看不见的只偶尔动一下，两百六十米外不画。
 */
import * as THREE from 'three';
import { Figure } from '../avatar/figure';
import type { HandsName, Look, PoseName } from '../avatar/types';
import type { Quality } from '../core/World';
import type { Season } from '../env/atmos';
import { route } from './route';
import { clearOfTrees, footY, type Seat } from './spots';

export interface Ctx {
  dt: number; t: number; frame: number;
  hour: number; night: number; rain: number; snow: number; season: Season;
  player: THREE.Vector3; camera: THREE.Camera; camPos: THREE.Vector3; frustum: THREE.Frustum;
  /** 时辰正被一下子拨动（或刚开场）：人直接出现在该在的地方 */
  wound: boolean;
  /** 不下大雨、大雪 */
  fair: boolean;
  /** 出一声（位置是世界坐标） */
  sfx(shot: string, x: number, z: number, vel?: number): void;
}
export type Script = Generator<void, void, void>;
export type Act = (p: Person, c: Ctx) => Script;

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
export const ease = (k: number) => k * k * (3 - 2 * k);
const _s = new THREE.Sphere(), _v = new THREE.Vector3();
let SEQ = 0;

export class Person {
  /** 试的时候用：当作人人都有人看着（换事一律走过去，每帧都动），好把一整天的路都走一遍 */
  static watchAll = false;
  root: THREE.Group; avatar: Figure; fig: Figure;
  /** 此刻在哪（世界坐标，脚下） */
  pos = new THREE.Vector3();
  /** 此刻在不在场（在家、走开了一阵都是 false） */
  present = false;
  yaw = 0;
  /** 身子另外抬高多少（坐在垫高的东西上、站在台子上）、朝一侧歪多少（摇头晃脑）——都是他自己尺度里的量 */
  lift = 0; tilt = 0;
  /** 这一步的时长、此刻的时间、天时（脚本里用） */
  dt = 0; t = 0; c!: Ctx;
  /** 坐着（被叫到时只转头） */
  seated = false;
  /** 被叫到时手里的活怎么放稳（每帧调用） */
  rest: (() => void) | null = null;
  /** 这件事开头要不要直接到位（没人看着时）。脚本里第一次 go 会用掉它 */
  snap = true;
  /** 来人走近了会不会自己抬头看一眼、点个头（要自己管头朝哪的事把它关掉） */
  curious = true;
  /** 这件事要散的时候怎么走开（不给就是沿回家的路走到门口）。骑在牛背上的人是连牛一起走 */
  leave: (() => Script) | null = null;
  /** 挡路的圆（不在场时挪到天边） */
  blocker = { x: 1e6, z: 1e6, r: 0 };
  /** 身量 */
  readonly scale: number;
  /** 此刻做的事的名字（null：在家，或正往家走） */
  act: string | null = null;
  /** 离镜头多远、在不在画面里（上一帧量的） */
  dist = 1e6; inView = false;
  /** 这一步是不是「直接到位」的（没人看着时不做过渡） */
  snapNow = false;

  private script: Script | null = null;
  private att: THREE.Vector3 | null = null; private attOn = false;
  private held: THREE.Object3D[] = [];
  private acc = 0; private idx = SEQ++;
  private lastX = 0; private lastZ = 0; private lastYaw = 0; private y = 0; private climb = 0; private speed = 0;
  private glance = 0; private nod = 0; private bow0 = 0;
  private gone = false; private gS = NaN;
  private tmp = new THREE.Vector3(); private tmp2 = new THREE.Vector3();

  /**
   * plan：此刻该做哪件事；acts：各件事的脚本；
   * home：家。最后一点是门口（人到那里就不见了，出门也是从那里出来）；前面若还有几点，是进门前一定要经过的（直着走）。
   *       从别处走到头一点的路是自己认的。
   */
  constructor(public id: string, public name: string, q: Quality, look: Partial<Look>, private plan: (c: Ctx) => string | null, private acts: Record<string, Act>, private home: Array<[number, number]>) {
    // 村里人离得远：网用粗的那一档，贴图小一半
    this.fig = this.avatar = new Figure({ ...q, tier: 'low', tex: q.tex * 0.5 }, look);
    this.root = this.fig.root;
    this.root.name = `npc:${id}`;
    this.root.visible = false;
    this.scale = this.fig.look.scale;
  }

  /** 让他停下手里的活、转过来对着某处（给 null 就接着干自己的） */
  attend(p: THREE.Vector3 | null) { this.att = p ? (this.att ?? new THREE.Vector3()).copy(p) : null; }

  // —— 脚本里用的小步子 ——
  /** 他自己坐标里的一点（x 是他的左手边、y 朝上、z 朝前，米，按他的身量）在世界里的位置 */
  loc(x: number, y: number, z: number, out = this.tmp): THREE.Vector3 {
    const s = this.scale, c = Math.cos(this.yaw), n = Math.sin(this.yaw);
    return out.set(this.pos.x + (x * c + z * n) * s, this.y + y * s, this.pos.z + (-x * n + z * c) * s);
  }
  /** 他自己坐标里的一个方向在世界里朝哪 */
  dir(x: number, y: number, z: number, out = this.tmp2): THREE.Vector3 {
    const c = Math.cos(this.yaw), n = Math.sin(this.yaw);
    return out.set(x * c + z * n, y, -x * n + z * c);
  }
  /** 把一样东西交到他手里（或挂在胸、放在身上、摆在地上）并显出来；换事时自动收起 */
  hold(o: THREE.Object3D, at: 'L' | 'R' | 'chest' | 'root' | 'world' = 'R'): THREE.Object3D {
    const parent = at === 'L' ? this.fig.joints.handL : at === 'R' ? this.fig.joints.handR : at === 'chest' ? this.fig.joints.chest : at === 'root' ? this.root : this.root.parent;
    if (parent && o.parent !== parent) parent.add(o);
    // 握在手里的：原点就在掌心、杆身顺着手指（别处摆过的位置清掉）
    if (at === 'L' || at === 'R') { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); }
    o.visible = true;
    if (!this.held.includes(o)) this.held.push(o);
    return o;
  }
  /** 摆姿势（直接到位时不做过渡） */
  pose(p: PoseName, hands: HandsName = 'free', dur = 0.9) { this.fig.setPose(p, this.snapNow ? 0 : dur); this.fig.setHands(hands, this.snapNow ? 0 : 0.5); }
  /** 席地坐下（盘腿）：坐到比地面高 h（他自己的尺度）的东西上。走过来的就慢慢坐下去 */
  *sit(h = 0, hands: HandsName = 'free'): Script {
    this.pose('sit', hands); this.seated = true;
    if (this.snapNow || h === this.lift) { this.lift = h; return; }
    const l0 = this.lift;
    yield* this.tween(0.9, (k) => { this.lift = l0 + (h - l0) * k; });
  }
  /** 走到一只凳前坐下（两腿垂着）：脚落在 s 那一点，凳在身后。先走到凳前（或 s.from 说的那一侧），再迈过去 */
  *bench(s: Seat, speed = 1.0, via?: Array<[number, number]>, hands: HandsName = 'free', raw = false): Script {
    yield* this.go(s, speed, [...(via ?? []), s.from ?? [s.x + Math.sin(s.yaw) * 0.55, s.z + Math.cos(s.yaw) * 0.55]], raw);
    this.lift = s.y != null ? this.liftTo(s.y) : 0;
    this.fig.setSeat({ h: s.h / this.scale, cz: s.cz / this.scale });
    this.pose('bench', hands); this.seated = true;
    if (!this.snapNow) yield* this.wait(0.9);
  }
  /** 要让脚下落在世界高度 y 上（台子、屋里的地面、船板），lift 该给多少 */
  liftTo(y: number) { return (y - footY(this.pos.x, this.pos.z)) / this.scale; }
  /** 直接站到某处 */
  place(s: { x: number; z: number; yaw?: number }) { this.pos.x = s.x; this.pos.z = s.z; if (s.yaw != null) this.yaw = s.yaw; this.lastX = s.x; this.lastZ = s.z; this.lastYaw = this.yaw; }
  /**
   * 到某处去：没人看着就直接到；到了转向 yaw。
   * 头一程（到 via 的头一点；没有 via 就是到 s）自己认路；via 余下的几点与 s 是最后那几步（进屋、上桥面、到凳前），直着走。
   * raw：头一程也直着走（船上、水边这些路网管不到的地方）。
   */
  *go(s: { x: number; z: number; yaw?: number }, speed = 1.05, via?: Array<[number, number]>, raw = false): Script {
    this.tilt = 0; this.seated = false;
    if (this.snap) { this.snap = false; this.place(s); this.snapNow = true; this.lift = 0; this.fig.setSeat(null); return; }
    this.snapNow = false;
    this.fig.setPose('stand');
    if (this.lift) { const l0 = this.lift; yield* this.tween(0.8, (k) => { this.lift = l0 * (1 - k); }); }
    this.fig.setSeat(null);
    const first = via?.[0] ?? [s.x, s.z];
    if (!raw && Math.hypot(first[0] - this.pos.x, first[1] - this.pos.z) > 3) for (const v of yield* this.way(first[0], first[1])) yield* this.walk(v[0], v[1], speed, 0.5);
    if (via) for (const v of via) yield* this.walk(v[0], v[1], speed, 0.4);
    yield* this.walk(s.x, s.z, speed);
    if (s.yaw != null) yield* this.face(s.yaw);
  }
  /** 认一条到 (x, z) 的路（这一帧已经有人在认了，就等下一帧） */
  private *way(x: number, z: number): Generator<void, Array<[number, number]>, void> {
    for (;;) { const r = route(this.pos.x, this.pos.z, x, z, this.c.frame); if (r) return r; yield; }
  }
  /** 朝一点走过去（转着身走，转得急就先慢下来） */
  *walk(x: number, z: number, speed = 1.05, r = 0.1): Script {
    for (let n = 0; n < 9000; n++) {
      const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < r) return;
      const off = wrap(Math.atan2(dx, dz) - this.yaw), turn = Math.max(-3.4 * this.dt, Math.min(3.4 * this.dt, off));
      this.yaw = wrap(this.yaw + turn);
      const k = Math.max(0, Math.cos(Math.min(Math.abs(off), Math.PI / 2))) ** 0.7, step = Math.min(d, speed * (0.15 + 0.85 * k) * Math.min(1, 0.3 + d / 0.8) * this.dt);
      // 离得很近了又没对准：直接挪过去，免得绕着它打转
      if (d < 0.35) { this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step; } else { this.pos.x += Math.sin(this.yaw) * step; this.pos.z += Math.cos(this.yaw) * step; }
      // 行者正挡在跟前：往旁边让半步，绕过去
      const pl = this.c.player, px = pl.x - this.pos.x, pz = pl.z - this.pos.z, pd = px * px + pz * pz;
      if (pd < 0.72 && px * Math.sin(this.yaw) + pz * Math.cos(this.yaw) > 0) { const side = px * Math.cos(this.yaw) - pz * Math.sin(this.yaw) > 0 ? -1 : 1; this.pos.x += Math.cos(this.yaw) * side * 0.8 * this.dt; this.pos.z -= Math.sin(this.yaw) * side * 0.8 * this.dt; }
      yield;
    }
  }
  /** 原地转向 */
  *face(yaw: number, rate = 2.6): Script {
    for (let n = 0; n < 600; n++) {
      const off = wrap(yaw - this.yaw);
      if (Math.abs(off) < 0.02) { this.yaw = yaw; return; }
      this.yaw = wrap(this.yaw + Math.max(-rate * this.dt, Math.min(rate * this.dt, off)));
      yield;
    }
  }
  *wait(sec: number): Script { for (let t = 0; t < sec; t += this.dt) yield; }
  /** 在 sec 秒里把 k 从 0 推到 1（缓起缓止），每步调用 fn */
  *tween(sec: number, fn: (k: number) => void): Script {
    for (let t = 0; t < sec; t += this.dt) { fn(ease(Math.min(1, t / sec))); yield; }
    fn(1);
  }
  /** 一直做到这件事被换掉：每帧调用 fn（t 是这一段开始后的秒数） */
  *forever(fn: (t: number) => void): Script { for (let t = 0; ; t += this.dt) { fn(t); yield; } }
  /** 走开一阵（这件事还没完，人暂时不在场——挑着担子走远了的货郎、送完饭回了家的人） */
  *away(sec: number): Script {
    this.gone = true;
    for (let t = 0; t < sec; t += this.dt) yield;
    this.gone = false; this.snap = true;
  }

  // —— 每帧 ——
  /** 不在场了（回到家、走远了） */
  vanish() {
    this.present = false; this.root.visible = false; this.script = null; this.gone = false;
    this.blocker.x = this.blocker.z = 1e6; this.blocker.r = 0;
    this.release();
    this.lift = 0; this.seated = false; this.fig.setSeat(null);
  }
  /** 放下手里的东西、收起姿势（换事的时候） */
  private release() {
    const f = this.fig;
    for (const o of this.held) o.visible = false;
    this.held.length = 0;
    f.reach('L', null); f.reach('R', null); f.lookAt(null); f.bow = 0;
    this.rest = null; this.curious = true; this.tilt = 0; this.glance = 0; this.nod = 0;
  }
  /** 回家：认着路走到门口，不见了 */
  *goHome(): Script {
    this.fig.setHands('free');
    if (this.fig.pose !== 'stand') { this.fig.setPose('stand'); if (this.lift) { const l0 = this.lift; yield* this.tween(0.8, (k) => { this.lift = l0 * (1 - k); }); } }
    this.fig.setSeat(null);
    yield* this.wait(0.5);
    const h = this.home;
    for (const v of yield* this.way(h[0][0], h[0][1])) yield* this.walk(v[0], v[1], 1.15, 0.5);
    for (const [x, z] of h) yield* this.walk(x, z, 1.15, 0.35);
    this.vanish();
  }

  tick(c: Ctx) {
    this.c = c;
    // —— 日程 ——
    const want = this.plan(c);
    this.dist = c.camPos.distanceTo(this.pos);
    this.inView = this.dist < 260 && c.frustum.intersectsSphere(_s.set(_v.set(this.pos.x, this.y + 0.9, this.pos.z), 2.4));
    const seen = (Person.watchAll || (this.inView && this.dist < 130)) && !c.wound && !this.gone;
    if (want !== this.act) {
      this.act = want; this.root.userData.act = want;
      const leave = this.leave;
      this.leave = null;
      this.release();
      if (want == null) { if (this.present && seen) { this.snap = false; this.script = leave ? leave() : this.goHome(); } else this.vanish(); }
      else {
        if (!this.present) {
          // 从家里出来：门口离镜头近就从门口走出来，否则直接在那里了
          const d = this.home[this.home.length - 1];
          this.place({ x: d[0], z: d[1] });
          _v.set(d[0], footY(d[0], d[1]) + 1, d[1]);
          this.snap = c.wound || (!Person.watchAll && (c.camPos.distanceTo(_v) > 110 || !c.frustum.containsPoint(_v)));
          this.fig.setPose('stand', 0); this.fig.setHands('free', 0); this.lift = 0; this.fig.setSeat(null);
        } else this.snap = !seen;
        this.present = true; this.gone = false;
        this.script = this.acts[want](this, c);
      }
    } else if (want == null && this.present && !seen) this.vanish();      // 回家的路上没人看着了：就到家了
    if (!this.present) return;

    // —— 远了就省 ——
    const vis = this.dist < 260 && !this.gone;
    this.root.visible = vis;
    this.acc += c.dt;
    const stride = Person.watchAll ? 1 : !vis ? 8 : !this.inView ? 5 : this.dist < 45 ? 1 : this.dist < 90 ? 2 : 4;
    if ((c.frame + this.idx) % stride !== 0 && !this.snap) return;
    const dt = Math.min(this.acc, 0.2); this.acc = 0;
    this.dt = dt; this.t = c.t;
    const f = this.fig;

    // —— 被叫到；留意到来人；或接着干 ——
    const pd = Math.hypot(c.player.x - this.pos.x, c.player.z - this.pos.z);
    if (this.att) {
      this.attOn = true;
      this.rest?.();
      if (!this.seated) { const off = wrap(Math.atan2(this.att.x - this.pos.x, this.att.z - this.pos.z) - this.yaw); this.yaw = wrap(this.yaw + Math.max(-2.4 * dt, Math.min(2.4 * dt, off))); }
      // 给的是脚下的一点，就看那人的脸
      f.lookAt(_v.copy(this.att).setY(this.att.y - this.y < 0.9 ? this.att.y + 1.4 : this.att.y));
    } else {
      if (this.attOn) { this.attOn = false; f.lookAt(null); }
      // 来人走到三米以内：手里一顿、抬头、点一点头（看过了，人不走开就不再看）
      if (this.curious && !this.gone) {
        if (this.glance === 0 && pd < 3.2) { this.glance = 3.6 + (this.idx % 3) * 0.4; this.nod = 1.1; this.bow0 = f.bow; }
        else if (this.glance < 0 && pd > 5) this.glance = 0;
      }
      if (this.nod > 0) {
        this.nod -= dt;
        f.bow = this.bow0 + 0.1 * Math.sin(Math.PI * Math.max(0, Math.min(1, (0.85 - this.nod) / 0.7)));
        if (this.nod <= 0) f.bow = this.bow0;
      } else {
        for (let n = 0; n < 2; n++) {
          const r = this.script?.next();
          if (!r || !r.done) break;
          // 一轮做完：从头再来（回家的那一段做完就不在了）
          this.script = this.act && this.present ? this.acts[this.act](this, c) : null;
        }
        if (!this.present) return;
      }
      if (this.glance > 0) {
        this.glance -= dt;
        if (this.glance > 0 && pd < 7) f.lookAt(_v.copy(c.player).setY(c.player.y + 1.4)); else { f.lookAt(null); this.glance = -1; }
      }
    }
    if (this.gone) { this.blocker.x = this.blocker.z = 1e6; this.blocker.r = 0; return; }

    // —— 落到地上 ——
    if (this.pos.x !== this.lastX || this.pos.z !== this.lastZ) clearOfTrees(this.pos);
    const s = this.scale, moved = Math.hypot(this.pos.x - this.lastX, this.pos.z - this.lastZ), v = dt > 0 ? moved / dt : 0;
    // 脚下的高度略抹一抹（上桥面、过田埂时不是一顿）
    const g0 = footY(this.pos.x, this.pos.z), g = (this.gS = moved < 2 && !this.snapNow && Number.isFinite(this.gS) ? this.gS + (g0 - this.gS) * Math.min(1, dt * 11) : g0);
    if (moved > 0.002 && moved < 2) { const ax = this.pos.x + Math.sin(this.yaw) * 0.3, az = this.pos.z + Math.cos(this.yaw) * 0.3; this.climb += (Math.max(-0.5, Math.min(0.5, (footY(ax, az) - g) / 0.3)) - this.climb) * Math.min(1, dt * 6); } else this.climb *= Math.max(0, 1 - dt * 6);
    this.speed += ((moved < 2 ? v : 0) - this.speed) * Math.min(1, dt * 10);
    this.y = g + this.lift * s;
    this.pos.y = g;
    this.root.position.set(this.pos.x, this.y, this.pos.z);
    this.root.rotation.set(0, this.yaw, this.tilt);
    const turn = dt > 0 ? wrap(this.yaw - this.lastYaw) / dt : 0;
    this.lastX = this.pos.x; this.lastZ = this.pos.z; this.lastYaw = this.yaw;
    if (vis) f.update(dt, c.t, { speed: this.speed / s < 0.06 ? 0 : this.speed / s, climb: this.climb, turn: Math.abs(turn) < 8 ? turn : 0 });
    this.snapNow = false;
    const b = this.blocker; b.x = this.pos.x; b.z = this.pos.z; b.r = 0.3 * s;
  }
  /** 此刻真的看得见（在场、没走开） */
  get here() { return this.present && !this.gone; }
}
