/**
 * 递东西、接东西（说话那一路用；不是一件事，不导出 create）。
 *
 * 先生送人一样东西：从袖里取出来（一篮鸡蛋、一碗茶、一捆柴、一枝花……现做的一件小器物），两手捧着，
 * 离得远就往前走一步，转身递过去；他放下手里的活伸手来接，东西从先生手里到了他手里（面板上他那句话就在这一刻出来），
 * 点一点头（出家人合十），再蹲下放在脚边、放在腿上（坐着的）、拎在手里（走着路的）、揣进怀里（小东西）、
 * 插在头上（姑娘媳妇收了花）、吃了（孩子收了糖）、喝一口（茶）、拿起来看（懂诗的人收了诗笺）。不肯收的，他摆摆手，先生收回袖里。
 * 他给先生东西也一样，反过来：他取出来递过来，先生两手接住，收进行囊（腰边），点头谢过；「得……」在接到的那一刻浮出来。
 * 够不着（他在船上、桌后）：先生蹲下把东西放在跟前；他给先生的，隔着一点扔过来。
 *
 *   const ex = new Exchange(k, person);                      // 一场说话一个（person 是 life/person.ts 的人）
 *   ex.give('egg', 4, { onTake: () => …, refuse: false });   // 先生 → 他；onTake 是他接住（或推辞）的那一刻
 *   ex.take('jujube', 1, { onStart, onTake });              // 他 → 先生；onStart 是他取出来那一刻，onTake 是先生接住
 *   ex.update(dt)                                            // 说话那件事每帧调
 *   ex.finish()                                              // 说完了（别过、走开）：一下子收到头——没递到手的作罢，递到了的放好
 *
 * 村里人这一边的手是写进 person.cue 的（他那一帧在「把手里的活放稳」之后照着摆，见 person.ts）；先生这一边直接伸手。
 * 东西自己是主：每帧按这一步该在哪摆好，谁拿着谁的两手就伸到它两边的握处（反向运动学跟着）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Avatar, HandsName, PoseName, Side } from '../avatar/types';
import { M, V, box, cyl, lathe, merge, sphere, sweep, type Geo } from '../core/geo';
import { mulberry32 } from '../core/rng';
import { PIG, type RGB } from '../ink/ink';
import { C, propMats } from '../life/props';
import { paint, tone } from '../life/rig';
import type { CueHand, Person } from '../life/person';
import { groundAt, setDynamic, standable } from '../walk';
import { giftOf } from '../bag';
import { FOLK_BY_ID } from '../../data/folk';
import type { GiftLook } from '../../data/itemUses';
import { jpos } from './util';

// ———————————————————————— 东西：一件小器物 ————————————————————————
/** 一件递来递去的东西：原点在底面正中，+y 朝上；握处、拎处 */
export interface Prop {
  obj: THREE.Object3D; look: GiftLook; item: string;
  /** 两手握处：离中心左右各 w、比底高 h。one：一只手拿（花、诗笺、一包糖、鱼），另一只手托在它下面 */
  w: number; h: number; one: boolean;
  /** 一只手拎着时（篮的提梁、壶颈、袋口、鱼的草绳），拎处比底高多少；没有拎处的是 0 */
  top: number;
}
const hoop = (R: number, r: number, c: RGB, seg = 12): Geo => {
  const g = new THREE.TorusGeometry(R, r, 4, seg).rotateX(Math.PI / 2).toNonIndexed();
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return paint(g, c);
};
const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, c: RGB, seg = 4) => paint(cyl(r, r, 1, seg).applyMatrix4(M.span(a, b)), c);
const ball = (r: number, x: number, y: number, z: number, c: RGB, sx = 1, sy = 1, sz = 1, seg = 7) => paint(sphere(r, seg, Math.max(4, seg - 2)).scale(sx, sy, sz).translate(x, y, z), c);
const EGG: RGB = [0.97, 0.95, 0.9], CLOTH = tone([0.92, 0.88, 0.78], 1.3), LEAF = tone(PIG.cao, 1.35), TEA: RGB = tone([0.93, 0.88, 0.62], 0.8);
const FILL: Record<string, { c: RGB; r: number; sy: number }> = {
  egg: { c: EGG, r: 0.024, sy: 1.3 }, peach: { c: tone(PIG.zhi, 1.25), r: 0.032, sy: 1 }, persimmon: { c: tone([0.96, 0.66, 0.42], 1.35), r: 0.031, sy: 0.8 },
  jujube: { c: tone([0.82, 0.46, 0.4], 1.6), r: 0.013, sy: 1.25 },
};
const SACK_FILL: Record<string, RGB> = { flour: [0.97, 0.96, 0.92], grain: tone(PIG.huang, 1.05), millet: tone(PIG.huang, 1.35), bean: tone([0.86, 0.8, 0.6], 1.4) };

/** 一只小竹篮（提梁横跨左右），篮里 n 个鸡蛋、桃、柿子，或一捧枣 */
function basketGeo(fill: string, n: number): Geo {
  const parts: Geo[] = [paint(lathe([[0.001, 0.006], [0.07, 0], [0.095, 0.04], [0.105, 0.085], [0.098, 0.085], [0.088, 0.045], [0.066, 0.012], [0.001, 0.016]], 12), C.bamboo)];
  parts.push(hoop(0.103, 0.006, C.strawDark).translate(0, 0.086, 0));
  const arch: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arch.push(V(Math.cos(a) * 0.1, 0.086 + Math.sin(a) * 0.11, 0)); }
  parts.push(paint(sweep(arch, [[-0.006, -0.004], [0.006, -0.004], [0.006, 0.004], [-0.006, 0.004]], { up: V(0, 0, 1) }), C.bamboo));
  parts.push(paint(cyl(0.085, 0.085, 0.01, 10).translate(0, 0.058, 0), C.straw));     // 垫着的一层草
  const f = FILL[fill] ?? FILL.egg, R = mulberry32(7);
  const m = fill === 'jujube' ? 11 : Math.max(1, Math.min(5, n));
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2 + 0.4, d = m === 1 ? 0 : fill === 'jujube' ? 0.02 + 0.045 * R() : 0.042, up = fill === 'jujube' ? 0.012 * R() : 0;
    parts.push(ball(f.r, Math.cos(a) * d, 0.068 + f.r * f.sy * 0.8 + up, Math.sin(a) * d * 0.85, f.c, 1, f.sy, 1));
  }
  if (fill === 'peach') parts.push(paint(sphere(1, 6, 3).scale(0.03, 0.006, 0.014).applyMatrix4(M.mul(M.t(0.02, 0.112, 0.01), M.ry(0.6))), LEAF));
  return merge(parts);
}
/** 扎口的小布袋（面、麦粒、小米、豆、种子），袋口露一点里头的东西 */
function sackGeo(fill: string): Geo {
  const parts: Geo[] = [paint(lathe([[0.001, 0], [0.058, 0.003], [0.08, 0.04], [0.084, 0.09], [0.068, 0.13], [0.034, 0.155], [0.028, 0.166], [0.042, 0.19], [0.001, 0.196]], 11), CLOTH)];
  parts.push(hoop(0.031, 0.006, C.rope, 9).translate(0, 0.16, 0));
  parts.push(ball(0.03, 0, 0.192, 0, SACK_FILL[fill] ?? SACK_FILL.grain, 1, 0.35, 1));
  return merge(parts);
}
/** 碗（fill tea：一碗茶） */
function bowlGeo(tea: boolean): Geo {
  const r = 0.064, parts: Geo[] = [paint(lathe([[0.001, 0], [r * 0.55, 0], [r, r * 0.72], [r * 0.96, r * 0.72], [r * 0.55, 0.016], [0.001, 0.014]], 12), C.china)];
  if (tea) parts.push(paint(cyl(r * 0.86, r * 0.86, 0.003, 12).translate(0, r * 0.6, 0), TEA));
  return merge(parts);
}
/** 一把酒壶：陶壶，颈上系绳，口上塞一团红布 */
function jarGeo(): Geo {
  return merge([
    paint(lathe([[0.001, 0], [0.05, 0], [0.072, 0.05], [0.07, 0.1], [0.045, 0.135], [0.03, 0.15], [0.034, 0.165], [0.001, 0.168]], 11), tone([0.78, 0.7, 0.62], 1.9)),
    hoop(0.031, 0.005, C.rope, 9).translate(0, 0.148, 0),
    ball(0.028, 0, 0.175, 0, tone(PIG.zhu, 1.1), 1, 0.65, 1),
  ]);
}
/** 草绳穿着鳃的鱼（一尾、两尾），头朝上垂着；绳圈在顶上 */
function fishGeo(n: number): Geo {
  const parts: Geo[] = [], fishC = tone([0.74, 0.76, 0.76], 1.55), fin = tone([0.7, 0.72, 0.72], 2.0);
  const xs = n >= 2 ? [-0.028, 0.028] : [0];
  for (const x of xs) {
    parts.push(ball(1, x, 0.13, 0, fishC, 0.03, 0.1, 0.013, 9));
    parts.push(paint(box(0.05, 0.035, 0.004).applyMatrix4(M.mul(M.t(x, 0.02, 0), M.rz(0.0))), fin));
    parts.push(rod(V(x, 0.225, 0), V(0, 0.29, 0), 0.0035, C.rope, 3));
  }
  parts.push(hoop(0.018, 0.004, C.rope, 8).applyMatrix4(M.mul(M.t(0, 0.305, 0), M.rx(Math.PI / 2))));
  return merge(parts);
}
/** 一捆柴：十来根枯枝顺着左右捆在一起，两道草绳 */
function faggotGeo(): Geo {
  const R = mulberry32(41), parts: Geo[] = [];
  for (let i = 0; i < 12; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * 0.05, len = 0.5 + 0.12 * R();
    parts.push(paint(cyl(0.011 + 0.006 * R(), 0.013 + 0.006 * R(), len, 4).applyMatrix4(M.mul(M.t((R() - 0.5) * 0.05, 0.065 + Math.sin(a) * d, Math.cos(a) * d), M.rz(Math.PI / 2 + (R() - 0.5) * 0.08))), C.twig));
  }
  for (const x of [-0.14, 0.14]) parts.push(hoop(0.066, 0.007, C.rope, 9).applyMatrix4(M.mul(M.t(x, 0.065, 0), M.rz(Math.PI / 2))));
  return merge(parts);
}
/** 一把青菜、桑叶、草药：梗朝自己（−z）、叶朝前，腰里一道草 */
function bunchGeo(fill: string): Geo {
  const R = mulberry32(fill.length * 13), parts: Geo[] = [];
  const leafC = fill === 'leaf' ? tone(PIG.lao, 1.25) : fill === 'herb' ? tone([0.8, 0.74, 0.58], 1.5) : LEAF, stem = fill === 'herb' ? tone([0.72, 0.62, 0.5], 1.8) : tone(PIG.zhi_lv, 1.1);
  for (let i = 0; i < 7; i++) {
    const x = (R() - 0.5) * 0.05, y = 0.02 + R() * 0.03, a = (R() - 0.5) * 0.35;
    parts.push(rod(V(x * 0.5, y, -0.14), V(x + Math.sin(a) * 0.04, y + 0.01, 0.0), 0.004, stem, 3));
    const big = fill === 'leaf' ? 1.35 : 1;
    parts.push(paint(sphere(1, 6, 3).scale(0.03 * big, 0.008, 0.07 * big).applyMatrix4(M.mul(M.t(x + Math.sin(a) * 0.05, y + 0.012, 0.06), M.ry(a))), leafC));
  }
  parts.push(hoop(0.026, 0.005, C.straw, 8).applyMatrix4(M.mul(M.t(0, 0.03, -0.08), M.rx(Math.PI / 2))));
  return merge(parts);
}
/** 一枝花：一根细枝立着，梢上几朵（桃花是胭脂，秋天是菊的黄） */
function flowerGeo(): Geo {
  const parts: Geo[] = [rod(V(0, 0, 0), V(0.01, 0.2, 0.005), 0.0035, C.twig, 3), rod(V(0.006, 0.12, 0.003), V(0.05, 0.2, 0), 0.0025, C.twig, 3)];
  const petal = tone(PIG.zhi, 1.05);
  for (const [x, y, z] of [[0.01, 0.21, 0.006], [0.0, 0.18, -0.012], [0.02, 0.16, 0.012], [0.05, 0.205, 0.0], [0.035, 0.18, -0.008]] as Array<[number, number, number]>) parts.push(ball(0.013, x, y, z, petal, 1, 0.75, 1, 6));
  for (const [x, y] of [[0.012, 0.13], [-0.008, 0.1]] as Array<[number, number]>) parts.push(paint(sphere(1, 5, 3).scale(0.018, 0.005, 0.009).translate(x, y, 0.004), LEAF));
  return merge(parts);
}
/** 一小包：纸包的糖、布包的针线（一道红线）、纸包的菜籽 */
function packetGeo(fill: string): Geo {
  const thread = fill === 'thread', c = thread ? tone([0.66, 0.72, 0.8], 1.3) : C.paper;
  return merge([
    paint(box(0.075, 0.035, 0.055).translate(0, 0.0175, 0), c),
    paint(box(0.078, 0.004, 0.008).translate(0, 0.036, 0), thread ? tone(PIG.zhu, 1.2) : C.rope),
    paint(box(0.008, 0.004, 0.058).translate(0, 0.036, 0), thread ? tone(PIG.zhu, 1.2) : C.rope),
  ]);
}
/** 一张诗笺：立着，正面（+z）写着两行字 */
function paperGeo(): Geo {
  const ink = tone(PIG.mo, 2.6), parts: Geo[] = [paint(box(0.11, 0.16, 0.003).translate(0, 0.08, 0), C.paper)];
  for (const x of [0.02, -0.02]) parts.push(paint(box(0.006, 0.11, 0.001).translate(x, 0.085, 0.002), ink));
  return merge(parts);
}
const whistleGeo = () => merge([paint(cyl(0.008, 0.008, 0.1, 6).applyMatrix4(M.mul(M.t(0, 0.01, 0), M.rz(Math.PI / 2))), C.bamboo), paint(box(0.012, 0.004, 0.006).translate(0.03, 0.018, 0), C.woodDark)]);
const bunGeo = (n: number) => merge(Array.from({ length: Math.max(1, Math.min(2, n)) }, (_, i) => ball(0.045, n >= 2 ? (i ? 0.03 : -0.03) : 0, 0.028 + (i ? 0.02 : 0), i ? 0.01 : 0, [0.97, 0.96, 0.92], 1, 0.62, 1, 9)));
const tofuGeo = () => merge([paint(cyl(0.085, 0.07, 0.006, 10).translate(0, 0.003, 0), tone(PIG.lao, 1.1)), paint(box(0.085, 0.045, 0.085).translate(0, 0.028, 0), [0.97, 0.97, 0.94])]);

/** 现做一件：这样东西、几个 */
export function makeProp(item: string, n: number): Prop {
  const g = giftOf(item), look: GiftLook = g?.look ?? 'packet', fill = g?.fill ?? '';
  let geo: Geo, w = 0.08, h = 0.06, one = false, top = 0, pale = false;
  switch (look) {
    case 'basket': geo = basketGeo(fill, n); w = 0.106; h = 0.075; top = 0.196; break;
    case 'sack': geo = sackGeo(fill); w = 0.084; h = 0.08; top = 0.175; break;
    case 'bowl': geo = bowlGeo(fill === 'tea'); w = 0.066; h = 0.028; pale = true; break;
    case 'jar': geo = jarGeo(); w = 0.072; h = 0.075; top = 0.148; break;
    case 'fish': geo = fishGeo(n); w = 0; h = 0.305; one = true; top = 0.305; break;
    case 'faggot': geo = faggotGeo(); w = 0.17; h = 0.065; top = 0; break;
    case 'bunch': geo = bunchGeo(fill); w = 0; h = 0.03; one = true; break;
    case 'flower': geo = flowerGeo(); w = 0; h = 0.02; one = true; break;
    case 'paper': geo = paperGeo(); w = 0; h = 0.012; one = true; pale = true; break;
    case 'whistle': geo = whistleGeo(); w = 0; h = 0.01; one = true; break;
    case 'bun': geo = bunGeo(n); w = 0.06; h = 0.025; pale = true; break;
    case 'tofu': geo = tofuGeo(); w = 0.075; h = 0.02; pale = true; break;
    default: geo = packetGeo(fill); w = 0; h = 0.02; one = true;
  }
  const m = new THREE.Mesh(geo, pale ? propMats().pale : propMats().wood);
  m.name = `gift:${item}`;
  m.frustumCulled = false;
  return { obj: m, look, item, w, h, one, top };
}

// ———————————————————————— 两个人 ————————————————————————
/** 一个人：身子、脚下、朝哪、身量；手怎么伸、俯多少、看哪（行者直接伸；村里人写进 cue） */
interface Who {
  av: Avatar; pos: THREE.Vector3; yaw(): number; s: number;
  hand(side: Side, at: THREE.Vector3 | null, palm?: THREE.Vector3 | null, dir?: THREE.Vector3 | null, rate?: number): void;
  bow(b: number | null): void; look(p: THREE.Vector3 | null): void; pose(p: PoseName | null): void; hands(h: HandsName | null): void;
  end(): void;
}
function playerWho(k: Anlewo, faceOf: () => THREE.Vector3): Who {
  const p = k.player, av = p.av;
  return {
    av, pos: p.pos, yaw: () => p.yaw, s: 1,
    hand(side, at, palm, dir, rate = 12) { if (at) av.reach(side, at, { palm: palm ?? undefined, dir: dir ?? undefined, rate }); else av.reach(side, null); },
    bow(b) { if (b != null) av.bow = b; },
    look(q) { av.lookAt(q); },
    pose(q) { if (av.pose !== (q ?? 'stand')) av.setPose(q ?? 'stand', q ? 0.6 : 0.75); },
    hands(h) { if (h) av.setHands(h, 0.4); },
    end() { av.reach('L', null); av.reach('R', null); av.bow = 0; if (av.pose === 'crouch') av.setPose('stand', 0.7); av.lookAt(faceOf()); },
  };
}
function personWho(P: Person): Who {
  const H: Record<Side, CueHand> = { L: { at: new THREE.Vector3(), dir: new THREE.Vector3(), palm: new THREE.Vector3() }, R: { at: new THREE.Vector3(), dir: new THREE.Vector3(), palm: new THREE.Vector3() } };
  const look = new THREE.Vector3();
  const cue = () => (P.cue ??= {});
  // 这只手此刻归我们摆（伸出去过）：放回去时才去碰它，没碰过的手（拿着活计的）一直由他自己的活计摆
  const used: Record<Side, boolean> = { L: false, R: false };
  return {
    av: P.fig, pos: P.pos, yaw: () => P.yaw, s: P.scale,
    hand(side, at, palm, dir, rate = 12) {
      if (!at) { if (used[side]) { cue()[side] = null; used[side] = false; } return; }
      used[side] = true;
      const h = H[side]; h.at.copy(at); h.rate = rate;
      if (palm) h.palm!.copy(palm); if (dir) h.dir!.copy(dir);
      cue()[side] = { at: h.at, palm: palm ? h.palm : undefined, dir: dir ? h.dir : undefined, rate };
    },
    bow(b) { cue().bow = b; },
    look(q) { cue().look = q ? look.copy(q) : undefined; },
    pose(q) { cue().pose = q; },
    hands(h) { cue().hands = h; },
    end() { P.endCue(); },
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const fwdOf = (w: Who, out = new THREE.Vector3()) => out.set(Math.sin(w.yaw()), 0, Math.cos(w.yaw()));
const leftOf = (w: Who, out = new THREE.Vector3()) => out.set(Math.cos(w.yaw()), 0, -Math.sin(w.yaw()));
const chestOf = (w: Who, out = new THREE.Vector3()) => jpos(w.av.joints.chest, out);
const headOf = (w: Who, out = new THREE.Vector3()) => jpos(w.av.joints.head, out);
const ease = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
/** 一点在 a、b 之间（k 已缓过） */
const mix = (a: THREE.Vector3, b: THREE.Vector3, k: number, out: THREE.Vector3) => out.lerpVectors(a, b, k);

export interface GiveOpts { refuse?: boolean; onTake?: () => void; onDone?: () => void }
export interface TakeOpts { onStart?: () => void; onTake?: () => void }
type Seq = Generator<void, void, void>;
/** 他收下以后怎么放：蹲下放在脚边 · 放在腿上（坐着的）· 地上就够得着（盘坐、跪着、蹲着的）· 拎在手里（走着路的）· 揣进怀里 · 插在头上 · 吃了 · 喝一口 · 拿起来看 */
type After = 'set' | 'lap' | 'low' | 'carry' | 'tuck' | 'hair' | 'eat' | 'drink' | 'read';

export class Exchange {
  private q: Array<() => Seq> = [];
  private cur: Seq | null = null;
  private dt = 0;
  /** 一下子收到头（说完了）：每一段都不等、直接到位 */
  private snap = false;
  /** 先生走近一步之前站在哪（递完了退回去） */
  private home: THREE.Vector3 | null = null;
  /** 他放在腿上的东西（说完了挪到凳边地上） */
  private laps: THREE.Object3D[] = [];
  private me: Who; private him: Who;
  /** 各段里用的几个临时量（grip、holdPt 各有自己的，不与它们混用） */
  private v = Array.from({ length: 12 }, () => new THREE.Vector3());
  private gv = Array.from({ length: 8 }, () => new THREE.Vector3());
  private hv = new THREE.Vector3();
  /** 这一回两人之间差多少够不着（米）：递的时候各自多俯一些探过去 */
  private stretch = 0;
  /** view：说话时镜头在哪（走近时别挡在镜头与他之间）；reframe：先生挪了地方以后，请说话那一路重摆一下镜头。都可不给 */
  constructor(private k: Anlewo, private P: Person, private view: (() => THREE.Vector3 | null) | null = null, private reframe: (() => void) | null = null) {
    this.him = personWho(P);
    this.me = playerWho(k, () => headOf(this.him, new THREE.Vector3()));
  }
  /** 还在递、接，或者排着队 */
  get busy() { return !!this.cur || this.q.length > 0; }
  /** 先生要递给他的东西还没到他手里（排着队的也算） */
  get pending() { return this.open > 0; }
  private open = 0;
  /** 东西正在谁手上（测试、截图用）：'me' 先生 · 'him' 他 · null 没有 */
  holder: 'me' | 'him' | null = null;
  /** 此刻手上那一件（测试、截图用） */
  prop: Prop | null = null;
  /** 歇一会儿再接着（见面就塞东西：等他转过身来） */
  pause(sec: number) { this.q.push(() => this.waitSeq(sec)); }
  give(item: string, n: number, o: GiveOpts = {}) { this.open++; this.q.push(() => this.giveSeq(item, n, o)); }
  take(item: string, n: number, o: TakeOpts = {}) { this.q.push(() => this.takeSeq(item, n, o)); }
  update(dt: number) { this.dt = Math.min(Math.max(dt, 0), 0.1); this.pump(); }
  /** 说完了：一下子收到头 */
  finish() {
    this.snap = true;
    for (let i = 0; i < 4000 && this.busy; i++) this.pump();
    this.snap = false;
    // 放在腿上的：挪到凳边的地上，留在他身边
    for (const o of this.laps) { const g = this.groundBeside(this.v[0]); o.removeFromParent(); this.k.world.scene.add(o); o.position.copy(g); o.rotation.set(0, this.P.yaw + 0.7, 0); o.scale.setScalar(1); this.P.keep(o, 'world'); }
    this.laps.length = 0;
    this.me.end(); this.him.end();
    this.home = null; this.holder = null; this.prop = null;
  }
  private pump() {
    for (let i = 0; i < 8; i++) {
      if (!this.cur) {
        const f = this.q.shift();
        if (f) this.cur = f();
        else if (this.home && !this.snap) this.cur = this.backSeq();
        else return;
      }
      if (!this.cur.next().done) return;
      this.cur = null;
    }
  }

  // —— 小步子（都听 snap：收到头时不等） ——
  private *wait(sec: number): Seq { for (let t = 0; t < sec && !this.snap; t += this.dt) yield; }
  private *waitSeq(sec: number): Seq { yield* this.wait(sec); }
  /** 在 sec 秒里把 k 从 0 推到 1，每步调 fn（缓起缓止）；收到头时直接给 1 */
  private *tween(sec: number, fn: (k: number, t: number) => void): Seq {
    for (let t = 0; t < sec && !this.snap; t += this.dt) { fn(ease(t / sec), t); yield; }
    fn(1, sec);
  }

  // —— 东西摆在哪、手伸到哪 ——
  /** 把东西摆好：握处的中心在 g（底在它下面 h）、朝 yaw、大小 s */
  private place(p: Prop, g: THREE.Vector3, yaw: number, s = 1, tilt = 0) {
    const o = p.obj;
    o.position.set(g.x, g.y - p.h * s, g.z); o.rotation.set(tilt, yaw, 0, 'YXZ'); o.scale.setScalar(s);
    o.updateMatrixWorld();
  }
  /**
   * 谁拿着它：两只手（或一只手、另一只托着）伸到它的握处。
   * only：只用 side 那一只手，另一只不去管（他那只手正拿着活计里的东西，还由他自己的活计摆）；要放回去另调 letGo
   */
  private grip(w: Who, p: Prop, g: THREE.Vector3, yaw: number, o: { rate?: number; side?: Side; only?: boolean; up?: number } = {}) {
    const [X, F, L, a, b, pa, pb, d] = this.gv;
    X.set(Math.cos(yaw), 0, -Math.sin(yaw)); fwdOf(w, F); leftOf(w, L);
    const rate = o.rate ?? 13, s = w.s;
    d.copy(F).multiplyScalar(0.85).addScaledVector(UP, -0.3).normalize();
    if (!p.one && !o.only) {
      const sg = X.dot(L) >= 0 ? 1 : -1;
      a.copy(g).addScaledVector(X, p.w * sg); b.copy(g).addScaledVector(X, -p.w * sg);
      pa.copy(X).multiplyScalar(-sg); pb.copy(X).multiplyScalar(sg);
      w.hand('L', a, pa, d, rate); w.hand('R', b, pb, d, rate);
      return;
    }
    // 一只手拿着；另一只手托在它的腕下（双手奉上的意思）
    const side = o.side ?? 'R', other: Side = side === 'R' ? 'L' : 'R', sg = side === 'R' ? 1 : -1;
    a.copy(g).addScaledVector(UP, o.up ?? 0);
    pa.copy(L).multiplyScalar(sg).addScaledVector(UP, -0.25).normalize();
    pb.copy(F).multiplyScalar(0.75).addScaledVector(UP, 0.3).normalize();
    w.hand(side, a, pa, pb, rate);
    if (o.only) return;
    b.copy(a).addScaledVector(F, -0.1 * s).addScaledVector(UP, -0.06 * s).addScaledVector(L, 0.04 * sg * s);
    w.hand(other, b, UP, F, rate);
  }
  private free(w: Who) { w.hand('L', null); w.hand('R', null); }
  /** 只留 side 那只手拿着：另一只放回去（两手捧着改成一只手拿的时候调一次） */
  private letGo(w: Who, side: Side) { w.hand(side === 'R' ? 'L' : 'R', null); }
  /** 两手捧在身前的那一点（握处的中心） */
  private holdPt(w: Who, out: THREE.Vector3, fwd = 0.27, down = 0.13) { chestOf(w, out); const F = fwdOf(w, this.hv); return out.addScaledVector(F, fwd * w.s).addScaledVector(UP, -down * w.s); }
  /** 他手边的地上（坐着的放在凳边，站着的蹲下放在脚前偏一点） */
  private groundBeside(out: THREE.Vector3): THREE.Vector3 {
    const P = this.P, W = this.him, F = fwdOf(W, this.v[9]), L = leftOf(W, this.v[10]);
    const me = this.k.player.pos, toMe = (me.x - P.pos.x) * L.x + (me.z - P.pos.z) * L.z;
    const sat = P.fig.pose === 'bench';
    for (const side of [toMe > 0 ? -1 : 1, toMe > 0 ? 1 : -1, 0]) {
      out.copy(P.pos).addScaledVector(F, (sat ? 0.02 : 0.3) * W.s).addScaledVector(L, side * (sat ? 0.42 : 0.12) * W.s);
      const y = groundAt(out.x, out.z);
      if (y != null && Math.abs(y - P.pos.y) < 0.3) { out.y = y; return out; }
    }
    out.copy(P.pos).addScaledVector(F, 0.3 * W.s); out.y = P.pos.y;
    return out;
  }

  /**
   * 先生要不要走近、走到哪；交出：两人之间递东西的那一点（够不着就是 null）。
   * 两人胸口之间隔得比两臂伸出去还远：先顺着他的方向往前挪（一路站得住、不挤着别人）；挪到跟前还差得多
   * （隔着石凳、桌子、篱笆），就在他身边另找一处站得住的地方绕过去——离他胸口两臂远，不站到他背后，走得越少越好。
   * 差一点点够不着的，两个人各自俯身探过去（stretch 记着差多少，递的时候多俯一些）。
   */
  private *approach(): Generator<void, THREE.Vector3 | null, void> {
    const k = this.k, p = k.player, P = this.P, me = this.me, him = this.him;
    const cp = chestOf(me, this.v[0]), cv = chestOf(him, this.v[1]);
    let dx = cv.x - cp.x, dz = cv.z - cp.z, d = Math.hypot(dx, dz) || 1;
    const sat = P.fig.pose !== 'stand';
    const rV = (sat ? 0.36 : 0.42) * P.scale, rP = 0.42, want = rP + rV, minD = (sat ? 0.22 : 0.34) + 0.3 * P.scale;
    this.stretch = 0;
    if (!this.snap && d > want + 0.05) {
      // 一、顺着他的方向往前挪
      const ux = dx / d, uz = dz / d, keep = k.life?.blockers ?? [];
      let step = 0;
      setDynamic(keep.filter((b) => b !== P.blocker));
      try {
        for (let st = 0.05; st <= d - want + 0.001; st += 0.05) {
          const x = p.pos.x + ux * st, z = p.pos.z + uz * st;
          if (standable(x, z, 'ground', 0.16) == null || Math.hypot(x - P.pos.x, z - P.pos.z) < minD) break;
          step = st;
        }
      } finally { setDynamic(keep); }
      const x0 = p.pos.x, z0 = p.pos.z;
      let spot: [number, number, boolean] | null = null;
      if (d - step <= want + 0.3) spot = step > 0.06 ? [x0 + ux * step, z0 + uz * step, true] : null;
      // 二、挪到跟前还差得多：另找一处，绕过去
      else spot = this.standSpot(cv, want + (sat ? 0.1 : 0)) ?? (step > 0.06 ? [x0 + ux * step, z0 + uz * step, true] : null);
      if (spot) {
        if (!this.home) this.home = p.pos.clone();
        yield* this.walkTo(spot[0], spot[1], spot[2]);
        p.faceTo = Math.atan2(P.pos.x - p.pos.x, P.pos.z - p.pos.z);
        P.attend(p.pos);
        // 绕了一段路过来的：镜头跟着重摆，两个人都在画里
        if (!this.snap && Math.hypot(p.pos.x - x0, p.pos.z - z0) > 1.2) this.reframe?.();
        for (let t = 0; t < 0.6 && !this.snap && p.faceTo != null; t += this.dt) yield;
      }
      chestOf(me, cp); chestOf(him, cv); dx = cv.x - cp.x; dz = cv.z - cp.z; d = Math.hypot(dx, dz) || 1;
    }
    // 递东西的那一点：两人胸口之间，按两臂的长短分；高在矮的那个胸口下一点（不低过高的那个胸口下四十来厘米）
    const lo = Math.min(cp.y, cv.y), hi = Math.max(cp.y, cv.y);
    const y = Math.min(hi - 0.16, Math.max(lo - 0.1, hi - 0.42));
    if (d > want + 0.34) return null;
    this.stretch = Math.max(0, d - want);
    const f = (rP + this.stretch * 0.55) / d;
    return new THREE.Vector3(cp.x + dx * f, y, cp.z + dz * f);
  }
  /**
   * 他身边站得住的一点（脚下）：离他胸口约两臂远（want），离他的脚不太近；不在他背后、不挡镜头；先生走过去最省事的那一处。
   * 返回 [x, z, 直着走得过去]；近处都站不住（他在船上、桌后）是 null。
   */
  private standSpot(cv: THREE.Vector3, want: number): [number, number, boolean] | null {
    const k = this.k, p = k.player.pos, P = this.P, cam = this.view?.() ?? null;
    const sat = P.fig.pose !== 'stand', minD = (sat ? 0.22 : 0.34) + 0.3 * P.scale, fy = P.yaw;
    const keep = k.life?.blockers ?? [];
    setDynamic(keep.filter((b) => b !== P.blocker));
    let best: [number, number, boolean] | null = null, bs = Infinity;
    try {
      const clear = (x: number, z: number) => { const l = Math.hypot(x - p.x, z - p.z), n = Math.ceil(l / 0.1); for (let i = 1; i <= n; i++) { const t = i / n; if (standable(p.x + (x - p.x) * t, p.z + (z - p.z) * t, 'ground', 0.16) == null) return false; } return true; };
      const ca = cam ? Math.atan2(cam.x - cv.x, cam.z - cv.z) : 0;
      for (const r of [want * 0.92, want, want * 1.1]) for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, x = cv.x + Math.sin(a) * r, z = cv.z + Math.cos(a) * r;
        if (Math.hypot(x - P.pos.x, z - P.pos.z) < minD || standable(x, z, 'ground', 0.16) == null) continue;
        const walk = Math.hypot(x - p.x, z - p.z);
        if (walk > 3.6) continue;
        let sc = walk * 1.3;
        const front = Math.cos(a - fy);
        if (front < -0.2) sc += 2 * (-0.2 - front);                                   // 他背后
        if (sat && front > 0.8) sc += 1.2 * (front - 0.8) / 0.2;                       // 坐着的：正对着膝
        if (cam) { const da = Math.abs(((a - ca + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da < 0.5) sc += (0.5 - da) * 3; }   // 挡着镜头
        const ok = clear(x, z);
        if (!ok) sc += 1.2;
        if (sc < bs) { bs = sc; best = [x, z, ok]; }
      }
    } finally { setDynamic(keep); }
    return best;
  }
  /** 先生走到 (x, z)：直着走得过去、又不远就迈几步，不然认着路绕过去；到了站准 */
  private *walkTo(x: number, z: number, straight: boolean): Seq {
    const p = this.k.player;
    if (straight && Math.hypot(x - p.pos.x, z - p.pos.z) < 1.1) p.settleAt(x, z);
    else p.goTo(x, z, { r: 0.06, then: () => p.settleAt(x, z), fail: () => p.settleAt(x, z) });
    for (let t = 0; t < 4.5 && !this.snap && (t < 0.15 || !p.settled); t += this.dt) yield;
    // 走到半路说完了（别过、走开）：就地站住，不在说完以后自己接着走
    if (this.snap && !p.settled) p.settleAt(p.pos.x, p.pos.z);
  }
  /** 递完了：先生退回原处（走近过的话），转回来对着他 */
  private *backSeq(): Seq {
    const p = this.k.player, h = this.home!;
    this.home = null;
    if (Math.hypot(p.pos.x - h.x, p.pos.z - h.z) < 0.2) return;
    yield* this.wait(0.3);
    const far = Math.hypot(p.pos.x - h.x, p.pos.z - h.z) > 0.7;
    yield* this.walkTo(h.x, h.z, !far);
    if (far && !this.snap) this.reframe?.();
    p.faceTo = Math.atan2(this.P.pos.x - p.pos.x, this.P.pos.z - p.pos.z);
    this.P.attend(p.pos);
  }

  /** 他收下以后怎么放 */
  private afterFor(p: Prop): After {
    const P = this.P, pose = P.fig.pose, kid = P.scale < 0.85, girl = FOLK_BY_ID[P.id]?.sex === 'f';
    if (p.item === 'tea') return 'drink';
    if (p.look === 'flower') return girl ? 'hair' : 'tuck';
    if (p.item === 'candy') return kid ? 'eat' : 'tuck';
    if (p.look === 'paper') return P.id === 'teacher' || P.id === 'guest' ? 'read' : 'tuck';
    if (p.look === 'packet' || p.look === 'whistle') return 'tuck';
    return this.setWay();
  }
  /** 大一点的东西怎么放：坐凳的放腿上，盘坐、跪着、蹲着的就近放在地上，走着路的拎着，站着的蹲下放在脚边 */
  private setWay(): After {
    const pose = this.P.fig.pose;
    if (pose === 'bench') return 'lap';
    if (pose === 'sit' || pose === 'kneel' || pose === 'crouch') return 'low';
    if (this.P.walking) return 'carry';
    return 'set';
  }

  // —— 先生 → 他 ——
  private *giveSeq(item: string, n: number, o0: GiveOpts): Seq {
    const k = this.k, me = this.me, him = this.him, p = makeProp(item, n), g = this.v[2], a = this.v[3];
    const yaw = k.player.yaw;
    k.world.scene.add(p.obj); this.prop = p; this.holder = 'me';
    this.makeRoom();
    let passed = false, closed = false;
    const close = () => { if (!closed) { closed = true; this.open = Math.max(0, this.open - 1); } };
    const o: GiveOpts = { ...o0, onTake: () => { close(); o0.onTake?.(); } };
    try {
      // 一、从袖里取出来，捧到身前（要走近的，一边走一边取）
      const out = new THREE.Vector3(), ap = this.approach();
      let H: THREE.Vector3 | null = null, arrived = false, t = 0;
      while (!arrived || t < 0.55) {
        if (!arrived) { const r = ap.next(); if (r.done) { arrived = true; H = r.value; } }
        if (this.snap) { if (arrived) break; continue; }
        this.holdPt(me, out, 0.14, 0.3); this.holdPt(me, a); mix(out, a, ease(t / 0.55), g);
        this.place(p, g, yaw, 0.55 + 0.45 * Math.min(1, t / 0.25)); this.grip(me, p, g, yaw);
        t += this.dt;
        yield;
      }
      if (this.snap) { this.drop(p); return; }
      if (!H) { yield* this.leave(p, yaw, o); passed = true; return; }
      // 二、递过去：两手往前送，身子略俯（他坐着、是孩子，就俯得多些）
      const low = chestOf(me, this.v[0]).y - H.y > 0.3, bowP = Math.min(0.5, (low ? 0.34 : 0.13) + this.stretch * 0.9), bowV = Math.min(0.4, 0.12 + this.stretch * 0.8);
      him.look(H);
      const start = this.holdPt(me, new THREE.Vector3()), side = this.freeSide(), one = this.oneHand(), up = p.one ? 0.045 : 0;
      // （他看见递过来了，后一半就抬手迎上来——不肯收的不迎）
      yield* this.tween(0.7, (e) => {
        mix(start, H!, e, g); this.place(p, g, yaw); this.grip(me, p, g, yaw); me.bow(bowP * e);
        if (!o.refuse && e > 0.45) this.grip(him, p, H!, yaw, { rate: 4, side, only: one, up });
      });
      if (this.snap) { this.drop(p); return; }
      if (o.refuse) { yield* this.decline(p, H, yaw, bowP, o); return; }
      // 三、他伸手来接：手到了（或等了一会儿）就过手
      for (let t2 = 0; t2 < 1.4 && !this.snap; t2 += this.dt) {
        this.place(p, H, yaw); this.grip(me, p, H, yaw); me.bow(bowP);
        this.grip(him, p, H, yaw, { rate: 9, side, only: one, up });
        him.bow(bowV); him.look(H);
        if (t2 > 0.25 && this.reached(him, p, H, yaw, side)) break;
        yield;
      }
      if (this.snap) { this.drop(p); return; }
      // 四、过手：他那句话在这一刻出来；先生的手收回袖里
      passed = true; this.holder = 'him';
      o.onTake?.();
      k.sfxAt(p.look === 'paper' ? 'paper' : p.look === 'bowl' ? 'cup' : 'rustle', { vel: 0.22, x: H.x, z: H.z });
      this.free(me);
      const s0 = H.clone();
      yield* this.tween(0.55, (e) => { this.holdPt(him, a, 0.24, 0.14); mix(s0, a, e, g); this.place(p, g, yaw); this.grip(him, p, g, yaw, { side, only: one, up }); me.bow(bowP * (1 - e)); him.look(g); him.bow(0.08 * (1 - e)); });
      me.bow(0);
      // 五、放好、点头
      yield* this.settle(p, yaw, side);
      yield* this.thank();
    } finally {
      close();
      if (!passed && p.obj.parent) this.drop(p);
      this.free(me); this.free(him); him.bow(null); him.look(null); this.P.unstowHands();
      this.prop = null; this.holder = null;
      o.onDone?.();
    }
  }
  /** 他两只手都拿着活计（杖与茶碗、灯笼与梆子……）：先把右手的放下，腾出手来；这一回递完了再拿回去 */
  private makeRoom() { const P = this.P; if (P.busyHand('L') && P.busyHand('R')) P.stowHand('R'); }
  /** 一只手接的：东西本来就一只手拿，或者他另一只手占着 */
  private oneHand(): boolean { return this.P.busyHand('L') || this.P.busyHand('R'); }
  /** 他用哪只手接（一只手的时候）：右手占着就用左手 */
  private freeSide(): Side { return this.P.busyHand('R') && !this.P.busyHand('L') ? 'L' : 'R'; }
  /** 他的手到了握处没有 */
  private reached(w: Who, p: Prop, g: THREE.Vector3, yaw: number, side: Side): boolean {
    const hand = jpos(side === 'R' ? w.av.joints.handR : w.av.joints.handL, this.v[0]);
    const X = this.v[1].set(Math.cos(yaw), 0, -Math.sin(yaw));
    if (p.one || this.oneHand()) return hand.distanceTo(this.v[2].copy(g).addScaledVector(UP, p.one ? 0.045 : 0)) < 0.07 || hand.distanceTo(g) < 0.09;
    const d1 = hand.distanceTo(this.v[2].copy(g).addScaledVector(X, p.w)), d2 = hand.distanceTo(this.v[3].copy(g).addScaledVector(X, -p.w));
    return Math.min(d1, d2) < 0.07;
  }
  /** 东西收回去（作罢）：缩进袖里不见 */
  private drop(p: Prop) { p.obj.removeFromParent(); (p.obj as THREE.Mesh).geometry?.dispose(); }

  /** 他不肯收：抬手摆一摆、摇摇头；先生收回袖里 */
  private *decline(p: Prop, H: THREE.Vector3, yaw: number, bowP: number, o: GiveOpts): Seq {
    const me = this.me, him = this.him, g = this.v[2], a = this.v[3], face = headOf(me, new THREE.Vector3());
    o.onTake?.();
    const L = leftOf(him, new THREE.Vector3()), F = fwdOf(him, new THREE.Vector3());
    // 空着的那只手抬起来摆一摆（两只手都拿着活计的，只摇头）
    const side = this.freeSide(), handy = !this.P.busyHand(side), sg = side === 'R' ? -1 : 1;
    yield* this.tween(1.35, (e, t) => {
      this.place(p, H, yaw); this.grip(me, p, H, yaw);
      chestOf(him, a).addScaledVector(F, 0.27 * him.s).addScaledVector(L, (sg * 0.06 + 0.035 * Math.sin(t * 9)) * him.s).addScaledVector(UP, -0.02 * him.s);
      if (handy) him.hand(side, e < 0.92 ? a : null, this.v[5].copy(F).negate(), UP, 9);
      him.look(this.v[6].copy(face).addScaledVector(L, 0.22 * Math.sin(t * 7.5)));
    });
    if (handy) him.hand(side, null);
    him.look(null);
    const back = this.holdPt(me, new THREE.Vector3(), 0.14, 0.3);
    yield* this.tween(0.8, (e) => { mix(H, back, e, g); this.place(p, g, yaw, 1 - 0.6 * Math.max(0, (e - 0.6) / 0.4)); this.grip(me, p, g, yaw); me.bow(bowP * (1 - e)); });
    this.drop(p); this.free(me); me.bow(0);
  }

  /** 够不着他：先生蹲下，把东西放在跟前（他的那一边），站起来 */
  private *leave(p: Prop, yaw: number, o: GiveOpts) {
    const k = this.k, me = this.me, P = this.P, g = this.v[2];
    const pp = k.player.pos, ux = P.pos.x - pp.x, uz = P.pos.z - pp.z, l = Math.hypot(ux, uz) || 1;
    const spot = new THREE.Vector3(pp.x + (ux / l) * 0.36, pp.y, pp.z + (uz / l) * 0.36);
    spot.y = groundAt(spot.x, spot.z) ?? pp.y;
    me.pose('crouch'); me.bow(0.5);
    const from = this.holdPt(me, new THREE.Vector3()), end = spot.clone().add(this.v[3].set(0, p.h, 0));
    yield* this.tween(1.1, (e) => { mix(from, end, e, g); this.place(p, g, yaw); this.grip(me, p, g, yaw); });
    this.place(p, end, yaw); this.free(me);
    this.holder = 'him';
    o.onTake?.();
    P.keep(p.obj, 'world');
    k.sfxAt('rustle', { vel: 0.18, x: spot.x, z: spot.z });
    yield* this.wait(0.3);
    me.bow(0); me.pose(null);
    this.him.look(spot);
    yield* this.wait(0.6);
    this.him.look(null);
    yield* this.thank();
  }

  /** 他收下以后：放在脚边 / 腿上 / 拎着 / 揣起来 / 插在头上 / 吃了 / 喝一口 / 看一看 */
  private *settle(p: Prop, yaw: number, side: Side): Seq {
    const him = this.him, P = this.P, g = this.v[2], a = this.v[3], k = this.k;
    let way = this.afterFor(p);
    const one = this.oneHand();
    if (way === 'drink') {
      const from = this.holdPt(him, new THREE.Vector3(), 0.24, 0.14);
      const mouth = () => headOf(him, a).addScaledVector(fwdOf(him, this.v[8]), 0.11 * him.s).addScaledVector(UP, -0.07 * him.s);
      yield* this.tween(0.6, (e) => { mix(from, mouth(), e, g); this.place(p, g, yaw, 1, -0.5 * e); this.grip(him, p, g, yaw, { side, only: one }); him.look(null); });
      k.sfxAt('cup', { vel: 0.2, x: P.pos.x, z: P.pos.z });
      yield* this.tween(0.9, () => { mouth(); this.place(p, a, yaw, 1, -0.5); this.grip(him, p, a, yaw, { side, only: one }); him.bow(0.05); });
      const m0 = mouth().clone();
      yield* this.tween(0.5, (e) => { mix(m0, this.holdPt(him, this.v[7], 0.24, 0.14), e, g); this.place(p, g, yaw, 1, -0.5 * (1 - e)); this.grip(him, p, g, yaw, { side, only: one }); });
      way = this.setWay();
    }
    if (way === 'read') {
      // 拿起来看：两行字朝着他自己
      const from = this.holdPt(him, new THREE.Vector3(), 0.24, 0.14), up = chestOf(him, new THREE.Vector3()).addScaledVector(fwdOf(him, this.v[8]), 0.3 * him.s).addScaledVector(UP, 0.08 * him.s);
      const ry = this.P.yaw + Math.PI;
      if (!one) this.letGo(him, side);
      yield* this.tween(0.6, (e) => { mix(from, up, e, g); this.place(p, g, yaw + this.turn(yaw, ry) * e); this.grip(him, p, g, yaw, { side, only: true }); him.look(g); });
      yield* this.tween(1.4, () => { this.place(p, up, ry); this.grip(him, p, up, yaw, { side, only: true }); him.look(this.v[9].copy(up).addScaledVector(UP, 0.05)); });
      way = 'tuck';
    }
    if (way === 'tuck' || way === 'eat') {
      // 揣进怀里（衣襟里）、送进嘴里：一只手拿过去，东西没进去
      const to = () => (way === 'eat' ? headOf(him, a).addScaledVector(fwdOf(him, this.v[8]), 0.09 * him.s).addScaledVector(UP, -0.05 * him.s) : chestOf(him, a).addScaledVector(fwdOf(him, this.v[8]), 0.07 * him.s).addScaledVector(UP, -0.05 * him.s));
      const from = this.v[7].copy(p.obj.position).addScaledVector(UP, p.h);
      const f0 = from.clone();
      if (!one) this.letGo(him, side);
      yield* this.tween(0.6, (e) => { mix(f0, to(), e, g); this.place(p, g, yaw, 1 - 0.75 * Math.max(0, (e - 0.55) / 0.45)); this.grip(him, p, g, yaw, { side, only: true }); him.look(e < 0.5 ? g : null); });
      this.drop(p); this.free(him);
      return;
    }
    if (way === 'hair') {
      // 插在鬓边：空着的那只手举上去，插在那一边
      const sg = side === 'L' ? 1 : -1;
      if (!one) this.letGo(him, side);
      const to = () => headOf(him, a).addScaledVector(leftOf(him, this.v[8]), sg * 0.095 * him.s).addScaledVector(UP, 0.05 * him.s).addScaledVector(fwdOf(him, this.v[9]), -0.03 * him.s);
      const f0 = this.v[7].copy(p.obj.position).addScaledVector(UP, p.h).clone();
      yield* this.tween(0.75, (e) => { mix(f0, to(), e, g); this.place(p, g, yaw + this.turn(yaw, P.yaw + sg * Math.PI / 2) * e, 1 - 0.45 * e, 0.5 * e); this.grip(him, p, g, yaw, { side, only: true }); });
      this.free(him);
      P.keep(p.obj, 'head');     // 挂上去时保持此刻在世界里的位置、大小
      return;
    }
    if (way === 'carry') {
      // 拎在手里（篮的提梁、壶颈、鱼的草绳；没有拎处的夹在手里）
      const s2: Side = side;
      const hand = s2 === 'R' ? P.fig.joints.handR : P.fig.joints.handL;
      this.free(him);
      yield* this.wait(0.2);
      const ws = hand.getWorldScale(this.v[10]).x || 1;
      hand.add(p.obj);
      p.obj.position.set(0, p.top > 0 ? p.top / ws : 0.05 / ws, 0); p.obj.rotation.set(0, 0, Math.PI); p.obj.scale.setScalar(1 / ws);
      P.keep(p.obj, s2);
      return;
    }
    if (way === 'lap') {
      // 坐着的：放在腿上，两手搭在上头
      const from = this.v[7].copy(p.obj.position).addScaledVector(UP, p.h).clone();
      const lap = () => jpos(P.fig.joints.hips, a).addScaledVector(fwdOf(him, this.v[8]), 0.21 * him.s).addScaledVector(UP, 0.025 * him.s + p.h);
      yield* this.tween(0.7, (e) => { mix(from, lap(), e, g); this.place(p, g, yaw); this.grip(him, p, g, yaw, { side, only: one }); him.look(g); });
      this.place(p, lap(), yaw);
      yield* this.wait(0.25);
      this.free(him); him.look(null);
      this.laps.push(p.obj);
      return;
    }
    // 放在地上：站着的蹲下去（盘坐、跪着、蹲着的就近放），拎处在上头的拎着放
    const spot = this.groundBeside(new THREE.Vector3()), end = spot.clone().addScaledVector(UP, p.h);
    const handle = p.top > 0 && !p.one;
    if (way === 'set') { him.pose('crouch'); him.bow(0.5); }
    const from = this.v[7].copy(p.obj.position).addScaledVector(UP, p.h).clone();
    let lifted = false;
    yield* this.tween(way === 'set' ? 1.2 : 0.8, (e) => {
      mix(from, end, e, g); this.place(p, g, yaw);
      if (handle && e > 0.35 && !lifted) { lifted = true; if (!one) this.letGo(him, side); }
      if (handle && e > 0.35) this.grip(him, { ...p, one: true, h: p.top }, this.v[8].copy(p.obj.position).addScaledVector(UP, p.top), yaw, { side, only: true }); else this.grip(him, p, g, yaw, { side, only: one });
      him.look(spot);
    });
    this.place(p, end, yaw);
    k.sfxAt('rustle', { vel: 0.14, x: spot.x, z: spot.z });
    yield* this.wait(0.2);
    this.free(him);
    P.keep(p.obj, 'world');
    if (way === 'set') { yield* this.wait(0.15); him.bow(null); him.pose(null); yield* this.wait(0.55); }
    him.look(null);
  }
  /** 从 a 转到 b 的最小角 */
  private turn(a: number, b: number) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
  /** 点一点头谢过（出家人合十） */
  private *thank(): Seq {
    const him = this.him, pray = this.P.greetBy === 'pray';
    if (pray) him.hands('pray');
    him.look(headOf(this.me, new THREE.Vector3()));
    yield* this.tween(pray ? 1.3 : 0.75, (e) => him.bow(0.04 + (pray ? 0.18 : 0.16) * Math.sin(Math.PI * e)));
    him.bow(null); him.look(null);
    if (pray) { him.hands(null); yield* this.wait(0.3); }
  }

  // —— 他 → 先生 ——
  private *takeSeq(item: string, n: number, o: TakeOpts): Seq {
    const k = this.k, me = this.me, him = this.him, P = this.P, p = makeProp(item, n), g = this.v[2], a = this.v[3];
    const yaw = P.yaw;
    this.makeRoom();
    const side = this.freeSide(), one = this.oneHand();
    k.world.scene.add(p.obj); this.prop = p; this.holder = 'him';
    let got = false;
    try {
      o.onStart?.();
      // 一、他取出来捧在身前
      const out = this.holdPt(him, new THREE.Vector3(), 0.14, 0.3);
      yield* this.tween(0.55, (e) => { this.holdPt(him, a); mix(out, a, e, g); this.place(p, g, yaw, 0.55 + 0.45 * e); this.grip(him, p, g, yaw, { side, only: one }); him.look(g); });
      // 二、先生走近一步（要的话），他递过来
      const ap = this.approach();
      let H: THREE.Vector3 | null = null;
      for (;;) { const r = ap.next(); this.holdPt(him, a); this.place(p, a, yaw); this.grip(him, p, a, yaw, { side, only: one }); if (r.done) { H = r.value; break; } if (!this.snap) yield; }
      const toss = !H;
      if (!H) { const F = fwdOf(him, new THREE.Vector3()); H = chestOf(him, new THREE.Vector3()).addScaledVector(F, 0.38 * him.s).addScaledVector(UP, -0.14 * him.s); }
      const start = this.holdPt(him, new THREE.Vector3());
      const bowV = Math.min(0.4, 0.12 + this.stretch * 0.8);
      yield* this.tween(0.7, (e) => { mix(start, H!, e, g); this.place(p, g, yaw); this.grip(him, p, g, yaw, { side, only: one }); him.bow(bowV * e); him.look(headOf(me, this.v[8])); });
      // 三、先生伸两手来接
      const low = chestOf(me, this.v[0]).y - H.y > 0.3, bowP = Math.min(0.5, (low ? 0.34 : 0.13) + this.stretch * 0.9);
      if (toss) {
        // 够不着：轻轻扔过来，先生在身前接住
        const catchAt = this.holdPt(me, new THREE.Vector3(), 0.3, 0.1);
        yield* this.tween(0.35, (e) => { this.place(p, H!, yaw); this.grip(him, p, H!, yaw, { side, only: one }); this.grip(me, p, catchAt, yaw, { rate: 8 }); me.bow(0.1 * e); });
        this.free(him); him.bow(null);
        const h0 = H.clone();
        k.sfxAt('toss', { vel: 0.2, x: h0.x, z: h0.z });
        yield* this.tween(0.6, (e, t) => { mix(h0, catchAt, t / 0.6, g); g.y += Math.sin(Math.PI * Math.min(1, t / 0.6)) * 0.28; this.place(p, g, yaw + 0.6 * e); this.grip(me, p, catchAt, yaw, { rate: 10 }); });
        H = catchAt;
      } else {
        for (let t2 = 0; t2 < 1.5 && !this.snap; t2 += this.dt) {
          this.place(p, H, yaw); this.grip(him, p, H, yaw, { side, only: one });
          this.grip(me, p, H, yaw, { rate: t2 < 0.2 ? 3 : 8 }); me.bow(bowP * Math.min(1, t2 / 0.5));
          if (t2 > 0.4 && this.reached(me, p, H, yaw, 'R')) break;
          yield;
        }
      }
      // 四、过手：「得……」在这一刻浮出来
      got = true; this.holder = 'me';
      o.onTake?.();
      if (!toss) k.sfxAt('rustle', { vel: 0.2, x: H.x, z: H.z });
      this.free(him); him.bow(null); him.look(null);
      // 五、收进行囊（腰边），点头谢过
      const L = leftOf(me, new THREE.Vector3()), F = fwdOf(me, new THREE.Vector3());
      const hip = () => a.copy(k.player.pos).addScaledVector(L, 0.21).addScaledVector(F, 0.05).addScaledVector(UP, 0.84);
      const h0 = H.clone();
      yield* this.tween(0.75, (e) => { mix(h0, hip(), e, g); this.place(p, g, yaw, 1 - 0.8 * Math.max(0, (e - 0.6) / 0.4)); this.grip(me, p, g, yaw, { side: 'R', only: e > 0.3 }); if (e > 0.3) this.letGo(me, 'R'); me.bow(bowP * (1 - e)); });
      this.drop(p); this.free(me);
      yield* this.tween(0.6, (e) => me.bow(0.16 * Math.sin(Math.PI * e)));
      me.bow(0);
    } finally {
      if (p.obj.parent) this.drop(p);
      if (!got) o.onTake?.();
      this.free(me); this.free(him); him.bow(null); him.look(null); P.unstowHands();
      this.prop = null; this.holder = null;
    }
  }
}
