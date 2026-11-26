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
 *   路上碰见（meet）—— 走着路碰见村里别的人：互相看一眼、点个头；两个都在走、又都是爱说话的，就站下来说一会儿
 *          （一个说、一个点头，轮着来，有时笑一声），说完各走各的。碰见的是在干活的人，那人手里一顿、抬头点一点。
 *   远了就省：二十来米内每帧动，五十米内隔帧，百米内三帧一动，再远五帧一动；看不见的偶尔动一下（身子不重摆），两百六十米外不画。
 *   手上的事（cue）—— 被叫着说话时，说话那一路要他接东西、递东西（acts/gift.ts）：每帧在「把手里的活放稳」之后，
 *          照 cue 把手伸到哪、看哪、俯多少、蹲不蹲；endCue() 收住（蹲下的站起来）。收下的东西 keep() 放在身边，换事、回家时收走。
 */
import * as THREE from 'three';
import { Figure } from '../avatar/figure';
import type { HandsName, Look, PoseName, Side } from '../avatar/types';
import type { Quality } from '../core/World';
import type { Season } from '../env/atmos';
import { clear, route } from './route';
import { blocked } from '../walk';
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
/** 一只手伸到世界里的哪一点（掌心）、手指朝哪、手心朝哪、跟得多紧 */
export interface CueHand { at: THREE.Vector3; dir?: THREE.Vector3; palm?: THREE.Vector3; rate?: number }
/**
 * 手上的事（说话那一路接东西、递东西时给的）：每一样不给（undefined）就是不管它、由他自己的活计摆；
 * L / R 给 null 是那只手放回去；pose 给了就换成那个姿势（蹲下放东西），换回 null 就还原；hands 给 'pray' 是合十。
 */
export interface Cue { L?: CueHand | null; R?: CueHand | null; look?: THREE.Vector3 | null; bow?: number | null; pose?: PoseName | null; hands?: HandsName | null }

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
/** 收走一样东西：从画里拿掉，几何丢掉（材质是大家共用的，不动） */
function dropObj(o: THREE.Object3D) {
  o.removeFromParent();
  o.traverse((x) => { const g = (x as THREE.Mesh).geometry; if (g) g.dispose(); });
}
export const ease = (k: number) => k * k * (3 - 2 * k);
const _s = new THREE.Sphere(), _v = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3();
let SEQ = 0;
/** (x, z) 落没落在哪个要让开的圆里（me：自己的身宽，算在圆外头） */
function inShun(x: number, z: number, me: number): boolean {
  for (const d of Person.shun) if (d.r > 0) { const dx = x - d.x, dz = z - d.z, R = d.r + me; if (dx * dx + dz * dz < R * R) return true; }
  return false;
}
/** 离 (x, z) 最近、出了各个要让开的圆、站得住的一处（同样远的先取朝着 (fx, fz) 的那一边）；两米半内找不到就 null */
function rimOf(x: number, z: number, fx: number, fz: number, me: number): [number, number] | null {
  const a0 = Math.atan2(fx - x, fz - z);
  for (let rr = 0.25; rr < 2.6; rr += 0.15) for (let i = 0; i < 16; i++) {
    const a = a0 + (i & 1 ? -1 : 1) * Math.ceil(i / 2) * (Math.PI / 8), px = x + Math.sin(a) * rr, pz = z + Math.cos(a) * rr;
    if (!inShun(px, pz, me + 0.06) && !blocked(px, pz, 'ground', 0.2)) return [px, pz];
  }
  return null;
}
/** 从 a 直着走到 b，头一个碰上的要让开的圆（碰上的地方离 a 超过 far 的不算——还远，先照直走）；不碰就 null */
function firstHit(ax: number, az: number, bx: number, bz: number, me: number, far = 1e9): { x: number; z: number; r: number } | null {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz, L = Math.sqrt(L2);
  let hit: { x: number; z: number; r: number } | null = null, ht = 2;
  for (const d of Person.shun) {
    if (!(d.r > 0)) continue;
    // 起步处正贴着圈边（刚被挡在边上）不算碰：比挡人的那一圈（walk 里）略松一点
    const R = d.r + me - 0.01, t = L2 > 1e-8 ? Math.max(0, Math.min(1, ((d.x - ax) * vx + (d.z - az) * vz) / L2)) : 0;
    const hx = ax + vx * t - d.x, hz = az + vz * t - d.z;
    if (hx * hx + hz * hz < R * R && t * L - R < far && t < ht) { hit = d; ht = t; }
  }
  return hit;
}
/**
 * 绕着圆 d 走（几个圆挨成一团时，就是绕着这一团）：从 p 在它的哪个方位，朝 sense 那一边（1、−1）挪六七十公分，取圆外再半步的那一圈上的一点；
 * 那一点落在挨着的别的圆里就往外推出来。那一点（或走过去的半路）站不住（墙、篱笆）就 null
 */
function around(px: number, pz: number, d: { x: number; z: number; r: number }, sense: number, me: number): [number, number] | null {
  const R = d.r + me + 0.3, a = Math.atan2(px - d.x, pz - d.z) + (sense * 0.65) / R;
  let qx = d.x + Math.sin(a) * R, qz = d.z + Math.cos(a) * R;
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (const e of Person.shun) {
      if (!(e.r > 0) || e === d) continue;
      const Re = e.r + me + 0.15, dx = qx - e.x, dz = qz - e.z, l = Math.hypot(dx, dz);
      if (l < Re && l > 1e-3) { qx = e.x + (dx / l) * Re; qz = e.z + (dz / l) * Re; moved = true; }
    }
    if (!moved) break;
  }
  if (inShun(qx, qz, me + 0.05) || blocked(qx, qz, 'ground', 0.2) || blocked((px + qx) / 2, (pz + qz) / 2, 'ground', 0.18)) return null;
  return [qx, qz];
}

export class Person {
  /** 试的时候用：当作人人都有人看着（换事一律走过去，每帧都动），好把一整天的路都走一遍 */
  static watchAll = false;
  /** 全村的人（路上碰见谁，从这里找） */
  static all: Person[] = [];
  /**
   * 要让开的地方：一个个圆（x、z、r）。行者蹲下摸狗、在牛棚口添草、蹲下抱鸡放鸡的时候，做事那一路（acts/beasts.ts）把行者、那只生灵占的地方放进来
   * （每帧挪到它们此刻在的地方），做完拿走。
   * 村里人走路绕着它（认定一边绕过去；两边都过不去就站在圈边上等）；要去的那一点落在圈里，就走到圈外最近的一处站着等它空出来
   * （半路上的折点只等两三秒，过得去就不踩它了）；站着的人被它挨上了（行者蹲到了跟前、狗过来卧在脚边），往外让开一步。
   * 坐着、蹲着干活的不挪——挑地方的那一头（狗、行者）避开他们。
   */
  static shun: Array<{ x: number; z: number; r: number }> = [];
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
  /** 这件事里去站过、正要去站的几处（go 的终点，最多记六处；换事时清掉）：摸狗时行者挑地方蹲、狗挑地方卧，避开这些 */
  spots: Array<{ x: number; z: number }> = [];
  /** 要去的那一点落在要让开的圈里时，圈外的那一处（隔一会儿重找一回：圈会挪） */
  private rim = { x: 0, z: 0, gx: NaN, gz: NaN, t: -1, ok: false };
  /** 照直走会碰上要让开的圆时，绕着它往哪一边走（1、−1；0 是没在绕）、掉过几回头、两边都绕不过去是几时（过一会儿再试） */
  private bend = { sense: 0, flips: 0, t: -1 };
  /** 身量 */
  readonly scale: number;
  /** 此刻做的事的名字（null：在家，或正往家走） */
  act: string | null = null;
  /** 离镜头多远、在不在画面里（上一帧量的） */
  dist = 1e6; inView = false;
  /** 这一步是不是「直接到位」的（没人看着时不做过渡） */
  snapNow = false;
  /** 爱不爱在路上站下来说话（0…1；孩子小，老人、妇人大） */
  chatty = 0.3;
  /** 住哪一家（一家人一块儿出门不站在路上寒暄） */
  household = '';
  /** 碰见人时怎么打招呼：点头（nod）还是合十（pray，出家人） */
  greetBy: 'nod' | 'pray' = 'nod';
  /** 此刻正走着（walk 里）；trip：走的是一段远路（去上工、回家、串门），不是干活时挪一两步 */
  walking = false; trip = false;
  /** 正站在路上和谁说话 */
  talkTo: Person | null = null;
  private talkEnd = 0; private talkT0 = 0; private talkLead = false;
  private met = new Map<Person, number>(); private meetNext = 0;
  /** 走路时各个折点偏开多少（米，各人不同） */
  private ox = 0; private oz = 0;
  /** 招手：还剩几秒、朝哪、招之前面朝哪 */
  private waveT = 0; private waveAt = new THREE.Vector3(); private waveYaw = 0;
  /** 抬头看的是谁（null：看行者） */
  private glanceAt: Person | null = null;
  /** 手上的事（被叫着时照它摆；见 Cue） */
  cue: Cue | null = null;
  /** cue 换姿势、换手的摆法之前是什么样（endCue 时还原） */
  private cuePose0: PoseName | null = null; private cueHands0: HandsName | null = null;
  /** 收下的东西（放在身边地上的、拿在手里的、插在头上的）：换事、回家时收走 */
  private keeps: THREE.Object3D[] = [];
  /** 接东西时暂且放下的活计（stowHand） */
  private stowed: THREE.Object3D[] = [];
  /** 身子的根 → 人（说话那一路从 npcs[id].root 找到他） */
  private static byRoot = new WeakMap<THREE.Object3D, Person>();
  static of(root: THREE.Object3D | null | undefined): Person | null { return root ? Person.byRoot.get(root) ?? null : null; }

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
    Person.all.push(this);
    Person.byRoot.set(this.root, this);
    { const a = this.idx * 2.39996, r = 0.18 + 0.2 * ((this.idx * 0.618) % 1); this.ox = Math.cos(a) * r; this.oz = Math.sin(a) * r; }
  }

  /** 让他停下手里的活、转过来对着某处（给 null 就接着干自己的） */
  attend(p: THREE.Vector3 | null) { this.att = p ? (this.att ?? new THREE.Vector3()).copy(p) : null; }
  /**
   * 远远地朝某人招一招手（说话那一路：相熟的人看见先生在十来步外）：手里的活停一停，转过身来，抬手摇两下，再转回去接着干。
   * 正被叫着、正站在路上和人说话、已经在招手的时候不招。
   */
  wave(p: THREE.Vector3) {
    if (!this.here || this.att || this.talkTo || this.waveT > 0) return;
    this.waveAt.copy(p); this.waveT = 2.4; this.waveYaw = this.yaw;
  }
  /** 这只手此刻拿着活计里的东西（锄、篮、灯笼……）：接东西时先用另一只手 */
  busyHand(side: Side): boolean {
    const j = side === 'L' ? this.fig.joints.handL : this.fig.joints.handR;
    return this.held.some((o) => o.visible && o.parent === j);
  }
  /** 两只手都拿着活计、又要腾一只手接东西时：先把这只手里的东西放下（收起来），unstowHands / endCue 时拿回手里 */
  stowHand(side: Side) {
    const j = side === 'L' ? this.fig.joints.handL : this.fig.joints.handR;
    for (const o of this.held) if (o.visible && o.parent === j) { o.visible = false; this.stowed.push(o); }
  }
  unstowHands() { for (const o of this.stowed) if (this.held.includes(o)) o.visible = true; this.stowed.length = 0; }
  /** 收起手上的事：手放回去，蹲下的站起来，合十的放下，放下的活计拿回手里 */
  endCue() {
    const f = this.fig;
    if (this.cue) { if (this.cue.L !== undefined) f.reach('L', null); if (this.cue.R !== undefined) f.reach('R', null); if (this.cue.look !== undefined) f.lookAt(null); }
    this.cue = null;
    this.unstowHands();
    if (this.cuePose0) { f.setPose(this.cuePose0, 0.7); this.cuePose0 = null; }
    if (this.cueHands0) { f.setHands(this.cueHands0, 0.4); this.cueHands0 = null; }
  }
  /** 照 cue 摆（在 rest 之后，这一帧的手、头、俯身以它为准） */
  private applyCue() {
    const q = this.cue!, f = this.fig;
    for (const side of ['L', 'R'] as const) {
      const h = q[side];
      if (h === undefined) continue;
      // null：放回去一次，之后这只手还给他自己的活计（rest）摆
      if (h) f.reach(side, h.at, { dir: h.dir, palm: h.palm, rate: h.rate }); else { f.reach(side, null); delete q[side]; }
    }
    if (q.look !== undefined) f.lookAt(q.look);
    if (q.bow != null) f.bow = q.bow;
    if (q.pose) { if (f.pose !== q.pose) { this.cuePose0 ??= f.pose; f.setPose(q.pose, 0.6); } }
    else if (this.cuePose0) { f.setPose(this.cuePose0, 0.7); this.cuePose0 = null; }
    if (q.hands) { if (f.hands !== q.hands) { this.cueHands0 ??= f.hands; f.setHands(q.hands, 0.35); } }
    else if (this.cueHands0) { f.setHands(this.cueHands0, 0.4); this.cueHands0 = null; }
  }
  /**
   * 收下一样东西：world 是放在身边（东西已经摆在世界里它该在的地方）；L / R 拿在那只手里、head 插在头上（都保持此刻在世界里的位置挂上去）；
   * 换事、回家时收走（东西的几何一并丢掉）。身边最多留四样，多了先收走最早的。
   */
  keep(o: THREE.Object3D, at: 'world' | 'L' | 'R' | 'head' = 'world') {
    const j = at === 'L' ? this.fig.joints.handL : at === 'R' ? this.fig.joints.handR : at === 'head' ? this.fig.joints.head : null;
    if (j) j.attach(o);
    if (!this.keeps.includes(o)) this.keeps.push(o);
    while (this.keeps.length > 4) dropObj(this.keeps.shift()!);
  }
  /** 收走收下的东西 */
  private dropKeeps() { for (const o of this.keeps) dropObj(o); this.keeps.length = 0; }

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
  /** 记下这件事里要去站的一处（go 自己记；几处轮着去的活，开头就把几处都记上） */
  mark(s: { x: number; z: number }) {
    if (this.spots.some((q) => Math.abs(q.x - s.x) < 0.3 && Math.abs(q.z - s.z) < 0.3)) return;
    this.spots.push({ x: s.x, z: s.z });
    if (this.spots.length > 6) this.spots.shift();
  }
  /** 直接站到某处 */
  place(s: { x: number; z: number; yaw?: number }) { this.pos.x = s.x; this.pos.z = s.z; if (s.yaw != null) this.yaw = s.yaw; this.lastX = s.x; this.lastZ = s.z; this.lastYaw = this.yaw; }
  /**
   * 到某处去：没人看着就直接到；到了转向 yaw。
   * 头一程（到 via 的头一点；没有 via 就是到 s）自己认路；via 余下的几点与 s 是最后那几步（进屋、上桥面、到凳前），直着走。
   * raw：头一程也直着走（船上、水边这些路网管不到的地方）。
   */
  *go(s: { x: number; z: number; yaw?: number }, speed = 1.05, via?: Array<[number, number]>, raw = false): Script {
    this.tilt = 0; this.seated = false;
    this.mark(s);
    if (this.snap) { this.snap = false; this.place(s); this.snapNow = true; this.lift = 0; this.fig.setSeat(null); return; }
    this.snapNow = false;
    this.fig.setPose('stand');
    if (this.lift) { const l0 = this.lift; yield* this.tween(0.8, (k) => { this.lift = l0 * (1 - k); }); }
    this.fig.setSeat(null);
    const first = via?.[0] ?? [s.x, s.z];
    this.trip = !raw && Math.hypot(first[0] - this.pos.x, first[1] - this.pos.z) > 6;
    // 路上的各个折点各人略偏一点（同一家几个人一块儿走，不叠成一个人）。每一点都告诉 walk 下一点在哪（那一点正被让开的圈占着时，等一等就绕过它）
    if (!raw && Math.hypot(first[0] - this.pos.x, first[1] - this.pos.z) > 3) {
      const r = yield* this.way(first[0], first[1]);
      for (let i = 0; i < r.length; i++) yield* this.walk(r[i][0] + this.ox, r[i][1] + this.oz, speed, 0.5, i + 1 < r.length ? [r[i + 1][0] + this.ox, r[i + 1][1] + this.oz] : first);
    }
    // 远路走到头一点就算到了；余下那几步（进屋、绕到凳前坐下）不算赶路
    if (via) { for (let i = 0; i < via.length; i++) { if (i === 1) this.trip = false; yield* this.walk(via[i][0], via[i][1], speed, 0.4, via[i + 1] ?? [s.x, s.z]); } this.trip = false; }
    yield* this.walk(s.x, s.z, speed);
    this.trip = false;
    if (s.yaw != null) yield* this.face(s.yaw);
  }
  /** 认一条到 (x, z) 的路（这一帧已经有人在认了，就等下一帧） */
  private *way(x: number, z: number): Generator<void, Array<[number, number]>, void> {
    for (;;) { const r = route(this.pos.x, this.pos.z, x, z, this.c.frame); if (r) return r; yield; }
  }
  /**
   * 朝一点走过去（转着身走，转得急就先慢下来）；路上碰见人打个招呼，有时站下来说几句。
   * next：这是半路上的一个折点，走过它还要去 next（那一点正被让开的圈占着时，在圈外等一会儿，过得去就不再非踩那一点，直接往 next 去）
   */
  *walk(x: number, z: number, speed = 1.05, r = 0.1, next?: [number, number]): Script {
    const to = { x, z };
    let waited = 0;
    for (let n = 0; n < 9000; n++) {
      // 碰上要让开的地方（行者蹲着摸狗……）：路正穿过就先从旁边绕；要去的那一点落在圈里，就到圈外站着等它空出来
      const how = Person.shun.length ? this.steer(x, z, to) : 0, gx = how ? to.x : x, gz = how ? to.z : z;
      const dx = gx - this.pos.x, dz = gz - this.pos.z, d = Math.hypot(dx, dz);
      if (d < r && !how) { this.walking = false; return; }
      this.walking = true;
      if (this.talkTo) { yield* this.roadTalk(); continue; }
      const x0 = this.pos.x, z0 = this.pos.z;
      if (how === 1 && d < 0.15) {
        // 到了圈外：站着等，脸朝着要去的那一处。半路上的折点：等上两三秒，从这里直着走得到下一点，就不踩它了
        waited += this.dt;
        if (next && waited > 2.5 && clear(this.pos.x, this.pos.z, next[0], next[1])) { this.walking = false; return; }
        const off = wrap(Math.atan2(x - this.pos.x, z - this.pos.z) - this.yaw);
        this.yaw = wrap(this.yaw + Math.max(-2 * this.dt, Math.min(2 * this.dt, off)));
      } else {
        // 快走到了就不再招呼人（几个人往同一处去，到了跟前不站在路上寒暄）
        if (d > 4 && this.trip && this.c.t > this.meetNext) this.meet();
        const off = wrap(Math.atan2(dx, dz) - this.yaw), turn = Math.max(-3.4 * this.dt, Math.min(3.4 * this.dt, off));
        this.yaw = wrap(this.yaw + turn);
        const k = Math.max(0, Math.cos(Math.min(Math.abs(off), Math.PI / 2))) ** 0.7, step = Math.min(d, speed * (0.15 + 0.85 * k) * Math.min(1, 0.3 + d / 0.8) * this.dt);
        // 离得很近了又没对准：直接挪过去，免得绕着它打转
        if (d < 0.35) { this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step; } else { this.pos.x += Math.sin(this.yaw) * step; this.pos.z += Math.cos(this.yaw) * step; }
      }
      // 村里别的人挨得太近（一块儿走路的、迎面来的）：各往旁边让一点，不叠在一起
      if ((n & 3) === 0) for (const q of Person.all) {
        if (q === this || !q.here) continue;
        const qx = this.pos.x - q.pos.x, qz = this.pos.z - q.pos.z, q2 = qx * qx + qz * qz;
        if (q2 < 0.3 && q2 > 1e-6) { const ql = Math.sqrt(q2), push = (0.55 - ql) * 2.4 * this.dt, nx = this.pos.x + (qx / ql) * push, nz = this.pos.z + (qz / ql) * push; if (!blocked(nx, nz, 'ground', 0.18)) { this.pos.x = nx; this.pos.z = nz; } }
      }
      // 行者正挡在跟前：往旁边让半步，绕过去（他蹲在要让开的圈里时不用：上面已经绕着圈走了）
      const pl = this.c.player, px = pl.x - this.pos.x, pz = pl.z - this.pos.z, pd = px * px + pz * pz;
      if (pd < 0.72 && px * Math.sin(this.yaw) + pz * Math.cos(this.yaw) > 0 && !(Person.shun.length && inShun(pl.x, pl.z, 0))) { const side = px * Math.cos(this.yaw) - pz * Math.sin(this.yaw) > 0 ? -1 : 1; this.pos.x += Math.cos(this.yaw) * side * 0.8 * this.dt; this.pos.z -= Math.sin(this.yaw) * side * 0.8 * this.dt; }
      // 不迈进要让开的圈里：这一步迈进去了就退回原处（贴着圈边擦过去的两三公分不算，由 giveWay 推出来）
      if (Person.shun.length) { const me = 0.3 * this.scale - 0.03; if (inShun(this.pos.x, this.pos.z, me) && !inShun(x0, z0, me)) { this.pos.x = x0; this.pos.z = z0; } }
      yield;
    }
  }
  /**
   * 朝 (x, z) 走的这一步，碰上要让开的圆时该往哪儿去（放进 to）：
   *   0 —— 不碍事，照直走；1 —— (x, z) 落在圈里：改去圈外最近、站得住的那一处，到了站着等（圈外找不到站处就走到圈边上等）；
   *       也是绕不过去的时候：就地站着等；
   *   2 —— 照直走（三米内）会碰上圆：绕着它（几个圆挨在一起时绕着这一团）走，认定一边绕到底，直着走得过去了就照直走；
   *       那一边碰上墙、篱笆就掉头从另一边绕，两边都不通就站着等（隔两秒再试）。
   */
  private steer(x: number, z: number, to: { x: number; z: number }): number {
    const me = 0.3 * this.scale, px = this.pos.x, pz = this.pos.z, t = this.c.t;
    let how = 0, tx = x, tz = z;
    if (inShun(x, z, me)) {
      const m = this.rim;
      if (m.gx !== x || m.gz !== z || t - m.t > 0.4 || t < m.t) {
        const q = rimOf(x, z, px, pz, me);
        m.gx = x; m.gz = z; m.t = t; m.ok = !!q;
        if (q) { m.x = q[0]; m.z = q[1]; }
      }
      // 圈外近处找不到站处（窄巷里）：照直朝它走，走到圈边上迈不进去，就站在那里等
      if (!m.ok) { to.x = x; to.z = z; return 1; }
      tx = m.x; tz = m.z; how = 1;
    }
    const b = this.bend, hit = firstHit(px, pz, tx, tz, me, 3);
    if (!hit) { b.sense = 0; b.flips = 0; to.x = tx; to.z = tz; return how; }
    // 两边都绕不过去：站着等一会儿再试
    if (b.flips > 1 && t - b.t < 2 && t >= b.t) { to.x = px; to.z = pz; return 1; }
    let w: [number, number] | null;
    if (b.flips > 1 || b.sense === 0) {
      // 先认往哪一边绕：挪一小段以后离要去处近的那一边
      const L = around(px, pz, hit, 1, me), Rt = around(px, pz, hit, -1, me);
      b.flips = 0; b.sense = !L ? -1 : !Rt ? 1 : Math.hypot(L[0] - tx, L[1] - tz) <= Math.hypot(Rt[0] - tx, Rt[1] - tz) ? 1 : -1;
      w = b.sense > 0 ? L : Rt;
    } else {
      w = around(px, pz, hit, b.sense, me);
      if (!w) { b.sense = -b.sense; b.flips++; w = around(px, pz, hit, b.sense, me); }
    }
    if (w) { to.x = w[0]; to.z = w[1]; return 2; }
    b.flips = 2; b.t = t;
    to.x = px; to.z = pz;
    return 1;
  }
  /** 站着的人被要让开的圈挨上了（圈挪到了他身上）：往外让开（每秒不到一米；身后是墙就斜着让） */
  private giveWay(dt: number) {
    const me = 0.3 * this.scale;
    for (const d of Person.shun) {
      if (!(d.r > 0)) continue;
      const R = d.r + me, qx = this.pos.x - d.x, qz = this.pos.z - d.z, l = Math.hypot(qx, qz);
      if (l >= R) continue;
      const ux = l > 1e-3 ? qx / l : -Math.sin(this.yaw), uz = l > 1e-3 ? qz / l : -Math.cos(this.yaw), k = Math.min(R - l, 0.9 * dt);
      for (const a of [0, 0.7, -0.7, 1.4, -1.4]) {
        const c = Math.cos(a), s = Math.sin(a), nx = this.pos.x + (ux * c + uz * s) * k, nz = this.pos.z + (uz * c - ux * s) * k;
        if (!blocked(nx, nz, 'ground', 0.18)) { this.pos.x = nx; this.pos.z = nz; break; }
      }
    }
  }
  /**
   * 走着路看看身边有没有村里人：两三步内碰见了，互相点个头（两分钟内同一个人不再招呼）；
   * 两个都在走、都还爱说话，就站下来说一会儿。
   */
  private meet() {
    const c = this.c;
    this.meetNext = c.t + 0.45;
    for (const q of Person.all) {
      if (q === this || !q.here || q.talkTo || (this.household && q.household === this.household)) continue;
      const dx = q.pos.x - this.pos.x, dz = q.pos.z - this.pos.z;
      if (dx * dx + dz * dz > 6.8 || c.t - (this.met.get(q) ?? -1e9) < 120) continue;
      this.met.set(q, c.t); q.met.set(this, c.t);
      if (q.walking && q.trip && Math.random() < Math.min(this.chatty, q.chatty)) {
        // 站下来说话：谁先开口、说多久
        const T = 5 + Math.random() * 6;
        this.talkTo = q; q.talkTo = this;
        this.talkEnd = q.talkEnd = c.t + T; this.talkT0 = q.talkT0 = c.t;
        this.talkLead = true; q.talkLead = false;
        c.sfx('murmur', this.pos.x, this.pos.z, 0.22);
        return;
      }
      // 打个招呼：看一眼、点个头（出家人合十）；对方若在干活，手里一顿、抬头
      this.greet(q);
      if (q.curious || q.walking) q.greet(this);
      c.sfx('greet', this.pos.x, this.pos.z, 0.2);
      return;
    }
  }
  /** 看某人一眼、点个头 */
  greet(q: Person) {
    if (this.nod > 0 || this.att) return;
    this.glanceAt = q; this.glance = 2.2 + (this.idx % 3) * 0.3; this.nod = 1.1; this.bow0 = this.fig.bow;
    if (this.greetBy === 'pray') this.fig.setHands('pray', 0.3);
  }
  /** 站在路上和 talkTo 说话：面对面，一个说（抬手比划）、一个听（点头），轮着来；有时笑一声 */
  private *roadTalk(): Script {
    const q = this.talkTo!, f = this.fig, c = this.c;
    let laughed = 0;
    for (;;) {
      if (!q.here || q.talkTo !== this || c.t > this.talkEnd) break;
      const off = wrap(Math.atan2(q.pos.x - this.pos.x, q.pos.z - this.pos.z) - this.yaw);
      this.yaw = wrap(this.yaw + Math.max(-2.4 * this.dt, Math.min(2.4 * this.dt, off)));
      f.lookAt(_t1.set(q.pos.x, q.pos.y + 1.42 * q.scale, q.pos.z));
      // 每两三秒换一个人说；说的那个抬手比划、身子微微前倾，听的那个点头
      const k = (c.t - this.talkT0) / 2.7, mine = (Math.floor(k) % 2 === 0) === this.talkLead, u = k % 1;
      if (mine && this.greetBy !== 'pray') {
        const g = Math.max(0, Math.sin(u * Math.PI)) * (0.6 + 0.4 * Math.sin(c.t * 3.1 + this.idx));
        f.reach('R', this.loc(-0.2, 1.0 + 0.12 * g, 0.3 + 0.08 * g, _t1), { dir: this.dir(0.25, 0.5, 0.85, _t2), palm: this.dir(0, 0.7, 0.3, _t3), rate: 6 });
        f.bow = 0.06 + 0.04 * g;
      } else {
        f.reach('R', null);
        f.bow = 0.04 + 0.07 * Math.max(0, Math.sin(u * Math.PI * 4)) * (u < 0.5 ? 1 : 0);
      }
      // 说到高兴处笑一声（只一个人出声，免得两声叠在一起）
      if (this.talkLead && laughed < 1 && c.t - this.talkT0 > 3 && Math.random() < this.dt * 0.12) { laughed++; c.sfx('laugh', this.pos.x, this.pos.z, 0.25 + 0.15 * Math.random()); }
      yield;
    }
    f.reach('R', null); f.lookAt(null); f.bow = 0;
    if (this.greetBy === 'pray') f.setHands('free', 0.4);
    if (this.talkTo === q) this.talkTo = null;
  }
  /** 先等 sec 秒再做 g */
  private *after(sec: number, g: Script): Script { yield* this.wait(sec); yield* g; }
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
    this.stowed.length = 0;
    if (this.cue) this.endCue();
    this.dropKeeps();
    f.reach('L', null); f.reach('R', null); f.lookAt(null); f.bow = 0;
    this.rest = null; this.curious = true; this.tilt = 0; this.glance = 0; this.nod = 0; this.glanceAt = null; this.walking = false; this.trip = false; this.waveT = 0;
    this.spots.length = 0;
    if (this.talkTo) { if (this.talkTo.talkTo === this) this.talkTo.talkEnd = 0; this.talkTo = null; }
  }
  /** 回家：认着路走到门口，不见了 */
  *goHome(): Script {
    this.fig.setHands('free');
    if (this.fig.pose !== 'stand') { this.fig.setPose('stand'); if (this.lift) { const l0 = this.lift; yield* this.tween(0.8, (k) => { this.lift = l0 * (1 - k); }); } }
    this.fig.setSeat(null);
    // 一家几个人一块儿收工：各人略等一等再走，不叠在一起
    yield* this.wait(0.5 + (this.idx % 4) * 1.3);
    const h = this.home;
    this.trip = true;
    const r = yield* this.way(h[0][0], h[0][1]);
    for (let i = 0; i < r.length; i++) yield* this.walk(r[i][0] + this.ox, r[i][1] + this.oz, 1.15, 0.5, i + 1 < r.length ? [r[i + 1][0] + this.ox, r[i + 1][1] + this.oz] : h[0]);
    for (let i = 0; i < h.length; i++) yield* this.walk(h[i][0], h[i][1], 1.15, 0.35, h[i + 1]);
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
        const fromDoor = !this.present && !this.snap;
        this.present = true; this.gone = false;
        this.script = this.acts[want](this, c);
        // 从门里出来的：各人隔一两秒再出门（一家人同一个钟点出门，别叠成一串）
        if (fromDoor && this.idx % 4) this.script = this.after((this.idx % 4) * 1.4, this.script);
      }
    } else if (want == null && this.present && !seen) this.vanish();      // 回家的路上没人看着了：就到家了
    if (!this.present) return;

    // —— 远了就省 ——
    const vis = this.dist < 260 && !this.gone;
    this.root.visible = vis;
    this.acc += c.dt;
    // 离镜头二十来米内每帧动，五十米内隔帧，百米内三帧一动，再远五帧；在画面外的六帧一动（身子不重摆，见下）。
    // 不走动的（坐着听书的、站着干活的）近处也隔帧动、中间三帧一动——一群人围着时省一半；正被叫着说话的每帧动
    const calm = !this.walking && this.speed < 0.08 && !this.att;
    const stride = Person.watchAll || this.att ? 1 : !vis ? 8 : !this.inView ? 6 : this.dist < 22 ? (calm ? 2 : 1) : this.dist < 50 ? (calm ? 3 : 2) : this.dist < 100 ? 3 : 5;
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
      // 手上的事（接东西、递东西）：以它为准
      if (this.cue) this.applyCue();
    } else {
      if (this.attOn) { this.attOn = false; f.lookAt(null); }
      // 来人走到三米以内：手里一顿、抬头、点一点头（看过了，人不走开就不再看）
      if (this.curious && !this.gone) {
        if (this.glance === 0 && pd < 3.2) { this.glance = 3.6 + (this.idx % 3) * 0.4; this.nod = 1.1; this.bow0 = f.bow; }
        else if (this.glance < 0 && pd > 5) this.glance = 0;
      }
      if (this.waveT > 0) {
        // 招手：先转过来（坐着的只转头），抬起右手左右摇，末了转回原来的朝向
        this.waveT -= dt;
        const w = this.waveAt, T = 2.4 - this.waveT, k = Math.min(1, T / 0.45) * Math.min(1, Math.max(0, this.waveT - 0.5) / 0.4);
        if (!this.seated) {
          const want = this.waveT > 0.5 ? Math.atan2(w.x - this.pos.x, w.z - this.pos.z) : this.waveYaw;
          const off = wrap(want - this.yaw); this.yaw = wrap(this.yaw + Math.max(-3 * dt, Math.min(3 * dt, off)));
        }
        this.rest?.();
        f.lookAt(this.waveT > 0.5 ? _v.set(w.x, w.y + 1.4, w.z) : null);
        const sw = Math.sin(T * 9) * k;
        f.reach('R', this.loc(-0.27, 1.2 + 0.42 * k, 0.16 + 0.04 * sw, _t1), { dir: this.dir(-0.1 + 0.4 * sw, 1, 0.15, _t2), palm: this.dir(0, 0, 1, _t3), rate: 14 });
        if (this.waveT <= 0) { this.waveT = 0; f.reach('R', null); f.lookAt(null); if (!this.seated) this.yaw = this.waveYaw; }
      } else if (this.nod > 0) {
        this.nod -= dt;
        f.bow = this.bow0 + 0.1 * Math.sin(Math.PI * Math.max(0, Math.min(1, (0.85 - this.nod) / 0.7)));
        if (this.nod <= 0) { f.bow = this.bow0; if (this.greetBy === 'pray' && !this.talkTo && f.hands === 'pray') f.setHands('free', 0.4); }
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
        const g = this.glanceAt, gd = g ? Math.hypot(g.pos.x - this.pos.x, g.pos.z - this.pos.z) : pd;
        if (this.glance > 0 && gd < 7 && (!g || g.here)) f.lookAt(g ? _v.set(g.pos.x, g.pos.y + 1.42 * g.scale, g.pos.z) : _v.copy(c.player).setY(c.player.y + 1.4)); else { f.lookAt(null); this.glance = -1; this.glanceAt = null; }
      }
    }
    if (this.gone) { this.blocker.x = this.blocker.z = 1e6; this.blocker.r = 0; return; }
    // 站着的被要让开的圈挨上了（行者蹲到了跟前、狗过来卧在脚边）：往外让开（坐着、蹲着干活的不挪）
    if (Person.shun.length && !this.seated) this.giveWay(dt);

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
    if (vis && (this.inView || Person.watchAll)) f.update(dt, c.t, { speed: this.speed / s < 0.06 ? 0 : this.speed / s, climb: this.climb, turn: Math.abs(turn) < 8 ? turn : 0 });
    this.snapNow = false;
    const b = this.blocker; b.x = this.pos.x; b.z = this.pos.z; b.r = 0.3 * s;
  }
  /** 此刻真的看得见（在场、没走开） */
  get here() { return this.present && !this.gone; }
}
