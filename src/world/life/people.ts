/**
 * 村里的人各做各的事：谁、什么时候、在哪里、做什么（一览在 docs/LIFE.md）。
 *
 *   农夫 —— 春耕（扶犁跟着牛，一垄一垄来回）、夏锄、秋天打谷、冬天在窝棚口修农具；午间坐在田埂上，等家里送饭来。
 *   送饭的女儿 —— 近午提着饭篮水罐自家里走到田头，放下，等他吃完再回去。
 *   采桑女 —— 春夏在桑园，一株一株采过去；秋天在晒场上摊谷，冬天在门前纺线。
 *   童子 —— 上午在村塾里摇头晃脑地念书；午后在槐树南边的空地上玩（追、看蚂蚁，春天有一个放纸鸢），一个看老人下棋；
 *          货郎来了都跑过去看；黄昏有一个独自走到石桥上看水、等星星。一个小女孩坐在秋千上。塾师上午教书，午后在檐下看书。
 *   老人 —— 槐树下的石凳上拄杖坐着，打盹、喝茶，邻家妇人隔一阵端一碗过来；午后与另一位老人在树下对弈。
 *   邻家妇人 —— 清早喂鸡，白天在门前扫地。浣衣女 —— 清早在溪边捣衣、漂衣。
 *   木匠两个 —— 修着的木桥南头：一个刨板、上桥钉板，一个从板垛往桥上扛板。舂米人 —— 扛着谷袋往来于晒场与水碓。
 *   渔父 —— 渡口的小船上垂钓，晴雨雪都在；近午在岸上补网。樵夫午后挑着柴来，在船边歇脚说话。
 *   牧童 —— 午后横坐在水牛背上，在溪南的草地上来回，不时吹一阵短笛。
 *   酒家掌柜 —— 抹桌、筛酒；傍晚有个酒客。货郎 —— 午后挑着担摇着鼓自东头来，在茶亭歇脚。客 —— 午后来访，坐在院里石桌旁。
 *
 * 后来添的几位在 villagers.ts；各家都做的小事（喂鸡、扫地、挑水、坐矮凳干活、说话、听书）在 chores.ts；夏天的麦收在 harvest.ts。
 * 一天怎么过照着名册（src/data/folk.ts 的 plan）：此刻名册里这一步的 act 就是要做的事（没有 act 就是在家）；
 * 只有几处临时的变化写在这里（货郎来了孩子们跑去看、饭还没送到农夫就多坐一会儿……）。
 *
 * 写法：每件事是一段脚本（见 person.ts）。手里的东西挂在掌心的挂点上，手伸到哪里由脚本每帧告诉小人
 * （avatar 的 reach）——所以是「人去够东西」，不是东西飞到手里。
 * 走路：脚本只说去哪（p.go），路是自己认的（route.ts）；只有最后几步（进屋、上桥面、绕到桌后）才写明经过哪里。
 */
import * as THREE from 'three';
import type { Quality } from '../core/World';
import { mulberry32 } from '../core/rng';
import type { Season } from '../env/atmos';
import { PATHS, SITE, ground, streamAt, waterAt } from '../site';
import { FOLK_BY_ID, planNow } from '../../data/folk';
import { LOOKS, type LookName } from './looks';
import type { OxTeam } from './ox';
import { Person, type Act, type Ctx, type Script } from './person';
import * as P from './props';
import { span } from './rig';
import {
  ANTS, BRIDGE_END, BUND, CARRY_TO, CHESS, DESKS, DRY_MAT, ELDER, FEED, FERRY, FIELD, GUEST, GUEST_WAY, HERD, HERD_HAY, KITE, LUNCH_END, LUNCH_SET, LUNCH_WAIT, MILL, MULBERRIES, NAIL, NET,
  ON_BRIDGE, ORCHARD_REST, OX_REST, OX_SHED, OX_SHED_FRONT, PLAY, ROW, SAWHORSE, SCHOOL_FRONT, SCHOOL_Y, SPIN, STACK, SWEEP, SWING, TEA, TEACHER, TEACHER_IN, TEACHER_PORCH, TEACHER_PORCH_IN, THRESH, VISIT, WASH, WINE,
  WRIGHT_REST, door, footY, inField, woodcutterSpot, type Spot,
  A_FRONT, B_LOOM, D_FRONT, E_FRONT, OVERSEE, REAP, STORY, WELL,
} from './spots';
import { listenAct, ropeWork, sewWork, sitStool, stoolWork, sweepAct, waterAct } from './chores';
import { makeHarvest, type Harvest } from './harvest';
import { addVillagers } from './villagers';
import { SCHOOL } from '../play/study/school';

/** 后添的几路共用的一套家当：造人、摆东西、每帧要照看的、几样大家都看着的事 */
export interface Kit {
  q: Quality; group: THREE.Group; ox: OxTeam; buf: OxTeam; folk: Folk;
  R(): number; rnd(a: number, b: number): number;
  /** 造一个人：日程照名册；extra 可以按眼前的事改一改名册给的那件事 */
  add(id: string, look: LookName, acts: Record<string, Act>, home: Array<[number, number]>, extra?: (c: Ctx, act: string | null) => string | null): Person;
  onGround<T extends THREE.Object3D>(o: T, s: Spot, y?: number): T;
  tends: Array<(c: Ctx) => void>;
  /** 按 id 找人（还没造出来就是 undefined） */
  who(id: string): Person | undefined;
  /** 槐树下说书：说书人在说着没有、抖了第几个包袱（听的人跟着笑）、他的头在哪 */
  story: { on: boolean; beat: number; head: THREE.Vector3 };
  /** 晌午送饭：饭摆在埂上了没有、送饭的人还在路上没有 */
  lunch: { served: boolean; coming: boolean };
  harvest: Harvest;
  /** 下田（先去牛棚牵牛，收工送牛回棚） */
  toField(p: Person, c: Ctx, s: { x: number; z: number; yaw?: number }, speed?: number): Script;
  /** 几样可以给别人也用的事：锄地（碎土）、晌午坐在埂上等饭（0 农夫、1 二郎）、晒场上耙谷（第几个人）、采桑（第几个人） */
  hoe(): Act; noon(i: number): Act; sun(i: number): Act; pick(i: number): Act;
  /** 村路东头、桃林路西边远处（村外来的人从这里来去） */
  EAST: [number, number]; WEST: [number, number];
  /** 杏儿坐在娘的织机旁（villagers.ts 里给） */
  byAct: Act | null;
}

/** 日出、日落（与 env/atmos.ts 的那张表一致） */
const SUN: Record<Season, [number, number]> = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const UPV = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3();
const _spot = { x: 0, z: 0, yaw: 0 };

/** 一边走一段脚本，一边每帧做一件事（挎着篮子走、扛着板走） */
function* during(g: Script, fn: () => void): Script {
  for (;;) { const r = g.next(); if (r.done) return; fn(); yield; }
}
/** 村路的东头（村外来的人从这里进村）；桃林那条路上往西走远了的一点（过客从这里来、往这里去） */
const EAST: [number, number] = (() => { const r = PATHS.find((p) => p.id === '村路')!.pts, a = r[r.length - 1], b = r[r.length - 2], l = Math.hypot(a[0] - b[0], a[1] - b[1]); return [a[0] - ((a[0] - b[0]) / l) * 0.8, a[1] - ((a[1] - b[1]) / l) * 0.8] as [number, number]; })();
const WEST: [number, number] = (() => { const r = PATHS.find((p) => p.id === '桃林')!.pts, x = -50; for (let i = 0; i < r.length - 1; i++) if ((x - r[i][0]) * (x - r[i + 1][0]) <= 0) return [x, r[i][1] + ((r[i + 1][1] - r[i][1]) * (x - r[i][0])) / (r[i + 1][0] - r[i][0])] as [number, number]; return r[0]; })();

export interface Folk {
  people: Person[];
  /** 喂鸡的人此刻撒食的地方（鸡群凑过去）；没在喂是 null */
  feedAt: { x: number; z: number } | null;
  /** 每帧：牛、水牛该怎么着（人不在时也要管），几样摆在地上的东西收不收 */
  tend(c: Ctx): void;
}

export function makeFolk(q: Quality, group: THREE.Group, ox: OxTeam, buf: OxTeam): Folk {
  const R = mulberry32(20261114), rnd = (a: number, b: number) => a + (b - a) * R();
  const folk: Folk = { people: [], feedAt: null, tend: () => undefined };
  Person.all = [];
  /**
   * 造一个人：名字取名册里的；日程照名册（此刻那一步的 act，没有就是在家）；extra 按眼前的事改一改。
   * 名册里写了而这里没有的事，开发时报一声（当在家）——两处要一起改。
   */
  const add = (id: string, look: LookName, acts: Record<string, Act>, home: Array<[number, number]>, extra?: (c: Ctx, act: string | null) => string | null): Person => {
    const def = FOLK_BY_ID[id];
    if (!def) console.warn(`名册里没有 ${id}`);
    for (const s of def?.plan ?? []) if (s.act && !acts[s.act]) { console.warn(`名册里 ${id} 的「${s.act}」没有脚本`); break; }
    const plan = (c: Ctx) => { const a = planNow(id, c.hour, c.season, !c.fair)?.act ?? null, b = extra ? extra(c, a) : a; return b && acts[b] ? b : null; };
    const p = new Person(id, def?.name ?? id, q, LOOKS[look], plan, acts, home);
    p.household = def?.home ?? '';
    group.add(p.root); folk.people.push(p);
    return p;
  };
  const pt = (s: { x: number; z: number }): [number, number] => [s.x, s.z];
  /** 摆在地上的东西（谁的事一停就收起来） */
  const onGround = <T extends THREE.Object3D>(o: T, s: Spot, y = 0): T => { o.position.set(s.x, footY(s.x, s.z) + y, s.z); o.rotation.y = s.yaw; o.visible = false; group.add(o); return o; };
  const tends: Array<(c: Ctx) => void> = [];
  const day = (c: Ctx, a: number, b: number) => c.hour >= a && c.hour < b;

  // ———————————————————————— 农夫、牛、送饭的 ————————————————————————
  const hoe = P.hoe(), hoe2 = P.hoe(), flail = P.flail(), whip = P.switchRod(), cup = P.bowl(0.055), cup2 = P.bowl(0.055), floor = onGround(P.threshFloor(), THRESH);
  hoe.visible = hoe2.visible = flail.obj.visible = whip.visible = cup.visible = cup2.visible = false;
  const lanes: number[] = []; for (let v = 0.1; v <= 0.905; v += 0.0895) lanes.push(v);
  const rowYaw = Math.atan2(ROW[0], ROW[1]);
  const F = { lane: 2, dir: 1, step: 1, u: 0.35, /** 碎土的人锄到哪了 */ hoe: { lane: 4, u: 0.3, dir: 1 }, /** 人到了田里没有（没到之前牛是跟着人走的） */ at: false };
  /** 晌午送饭：饭摆上埂了没有、送饭的还在路上没有、吃完了没有 */
  const LUNCH = { served: false, coming: false, eaten: false };
  /** 牛此刻是不是由农夫牵着：清早到牛棚牵出来，傍晚送回棚才放手 */
  const LED = { on: false };
  /** 下田：农夫先到牛棚把牛牵上再走（已经牵着了、没人看着、冬天不用牛，就直接去）；并说好收工时先送牛回棚。别人下田就直接去 */
  function* toField(p: Person, c: Ctx, s: { x: number; z: number; yaw?: number }, speed = 1.0): Script {
    if (c.season !== 'winter' && p.id === 'farmer') {
      if (!LED.on && !p.snap) { yield* p.go(OX_SHED_FRONT, 1.0); LED.on = true; yield* p.wait(1.2); }
      LED.on = true;
      p.leave = function* (): Script { F.at = false; if (LED.on) { yield* p.go(OX_SHED_FRONT, 1.05); LED.on = false; yield* p.wait(2.5); } yield* p.goHome(); };
    }
    yield* p.go(s, speed);
    if (p.id === 'farmer') F.at = true;
  }
  /** 锄地（碎土）：两手握锄，举起、落下、往回一带；三锄一挪步。st 是这个人自己锄到哪了 */
  const hoeAct = (st: { lane: number; u: number; dir: number }, tool: THREE.Object3D): Act => function* (p, c) {
    const f = p.fig, at = () => { const a = inField(st.u, lanes[st.lane]); return { x: a.x, z: a.z, yaw: st.dir > 0 ? rowYaw : rowYaw + Math.PI }; };
    yield* toField(p, c, at());
    p.pose('stand'); p.hold(tool, 'R');
    // 锄的姿势：k = 0 锄头落在身前地上，1 举到头前
    const swing = (k: number) => {
      const r = p.loc(-0.13, 0.9 + 0.12 * k, 0.2, v1), d = v2.set(0.16, lerp(-0.74, 0.36, k), lerp(0.655, 0.92, k)).normalize();
      const wd = p.dir(d.x, d.y, d.z, v3);
      f.reach('R', r, { dir: wd, palm: UPV, rate: 18 });
      f.reach('L', v4.copy(r).addScaledVector(wd, 0.5 * p.scale), { dir: wd, palm: UPV, rate: 18 });
      f.bow = lerp(0.42, 0.14, k);
    };
    p.rest = () => { swing(0); f.bow = 0.1; };
    for (let n = 0; ; n++) {
      for (let i = 0; i < 3; i++) {
        yield* p.tween(0.95, (k) => swing(k));
        yield* p.tween(0.28, (k) => swing(1 - k * k));
        c.sfx('hoe', p.pos.x, p.pos.z, 0.5 + 0.3 * R());
        yield* p.tween(0.6, (k) => { swing(0); f.bow = 0.42 - 0.08 * Math.sin(k * Math.PI); });
      }
      if (n % 4 === 3) {
        // 直起腰，抬手擦一把汗
        yield* p.tween(1.0, (k) => { swing(0); f.bow = lerp(0.42, 0.03, k); });
        f.reach('L', null);
        yield* p.tween(2.2, (k) => { f.reach('L', p.loc(0.07, 1.47, 0.13, v1), { dir: p.dir(-0.7, 0.5, 0.2, v2), rate: 7 }); f.bow = 0.03 + 0.02 * k; });
        f.reach('L', null);
        yield* p.wait(1.2);
      }
      st.u += st.dir * 0.019;
      if (st.u > 0.86 || st.u < 0.14) { st.dir = -st.dir; st.lane = (st.lane + 1) % lanes.length; }
      yield* during(p.go(at(), 0.7, undefined, true), () => swing(0.15));
    }
  };
  /** 晌午：坐在田埂上喝口水；饭送到了就端起碗吃（i：0 农夫；1 二郎，挨着爹坐）。夏天在麦地的地头 */
  const noonAct = (i: number, bowl: THREE.Object3D): Act => function* (p, c) {
    const f = p.fig, summer = c.season === 'summer', s = summer ? (i ? REAP.bund2 : REAP.bund) : { x: BUND.x, z: BUND.z + 1.1 * i, yaw: BUND.yaw };
    if (i === 0) yield* toField(p, c, s); else yield* p.go(s, 1.0);
    yield* p.sit(); p.hold(bowl, 'R');
    p.rest = () => { f.reach('R', null); f.reach('L', null); };
    const mouth = () => f.joints.head.getWorldPosition(v1).add(p.dir(0, -0.075, 0.1, v2));
    for (;;) {
      if (LUNCH.served) {
        // 左手端碗，右手一筷一筷地送到嘴边；吃上四五十秒算吃完
        p.hold(bowl, 'L');
        for (let t = 0; LUNCH.served; t += p.dt) {
          const k = Math.max(0, Math.sin(t * 2.4));
          f.reach('L', p.loc(0.08, 0.44, 0.3, v3), { dir: p.dir(-0.6, 0.2, 0.75, v4), palm: UPV, rate: 8 });
          f.reach('R', v5.lerpVectors(p.loc(0.02, 0.5, 0.3, v4), mouth(), k), { dir: p.dir(0.5, 0.6, 0.2, v2), rate: 12 });
          f.bow = 0.2;
          if (t > 45 && i === 0) LUNCH.eaten = true;
          yield;
        }
        f.reach('L', null); f.reach('R', null); f.bow = 0; p.hold(bowl, 'R');
      }
      for (let t = 0, T = rnd(7, 13); t < T && !LUNCH.served; t += p.dt) yield;
      if (LUNCH.served) continue;
      yield* p.tween(1.0, () => f.reach('R', mouth(), { dir: p.dir(0.6, 0.6, 0, v3), palm: UPV, rate: 6 }));
      yield* p.wait(1.4);
      f.reach('R', null);
    }
  };

  // —— 后添的几路共用的这一套（villagers.ts、harvest.ts、chores.ts 用） ——
  const kit: Kit = {
    q, group, ox, buf, folk, R, rnd, add, onGround, tends,
    who: (id) => folk.people.find((p) => p.id === id),
    story: { on: false, beat: 0, head: new THREE.Vector3() },
    lunch: LUNCH, harvest: null as unknown as Harvest, toField,
    hoe: () => hoeAct(F.hoe, hoe2), noon: (i) => noonAct(i, i ? cup2 : cup), sun: (i) => sunAct(i), pick: (i) => pickAct(i),
    EAST, WEST, byAct: null,
  };
  const harvest = (kit.harvest = makeHarvest(kit));
  tends.push((c) => harvest.tend(c));
  const stoolOf = () => { const s = P.stool(); s.visible = false; return s; };
  const fanOf = () => { const f = P.fan(); f.visible = false; return f; };
  /** 听书（槐树下各人的位置在 spots.ts 的 STORY.slots） */
  /** 夏夜摇蒲扇的：老人、妇人、几个当家的（不是人人一把，免得一片扇子） */
  const FAN = new Set(['elder', 'elder2', 'farmwife', 'neighbor', 'tofu', 'weaver', 'farmer', 'basketman']);
  const listen = (id: string, kid = false): Act => listenAct(kit, STORY.slots[id], { stool: stoolOf(), fan: FAN.has(id) ? fanOf() : undefined, kid });
  const ropeHeap = P.ropeHeap(), ropeStool = stoolOf(), mendStool = stoolOf();
  ropeHeap.visible = false;

  const farmer = add('farmer', 'farmer', {
    /** 春耕：右手扶犁梢，左手一根竹枝，弓着背跟在牛后头 */
    *plough(p, c) {
      const f = p.fig, a = inField(F.u, lanes[F.lane]), yaw0 = F.dir > 0 ? rowYaw : rowYaw + Math.PI;
      if (p.snap || (F.at && ox.hitched)) { if (p.snap) ox.put(a.x, a.z, yaw0); ox.stand(_spot); yield* toField(p, c, _spot); }
      else {
        // 牵着牛走到这一垄的头上（人站在垄旁），让牛走进垄里站好，套上犁，再转到犁后
        yield* toField(p, c, { x: a.x - Math.sin(yaw0) * 2.4 + Math.cos(yaw0) * 1.4, z: a.z - Math.cos(yaw0) * 2.4 - Math.sin(yaw0) * 1.4, yaw: yaw0 });
        for (let t = 0; t < 40 && ox.toward(a.x, a.z, 0.55, p.dt) > 0.5; t += p.dt) yield;
        ox.halt();
        yield* p.wait(0.8);
        ox.hitched = true; ox.stand(_spot);
        yield* p.go(_spot, 0.8, undefined, true);
      }
      ox.hitched = true; ox.lie = 0; ox.graze = 0;
      p.pose('stand'); p.hold(whip, 'L');
      p.rest = () => { f.reach('R', null); f.bow = 0.04; ox.halt(); };
      const follow = () => {
        ox.stand(_spot); p.pos.x = _spot.x; p.pos.z = _spot.z; p.yaw = _spot.yaw;
        f.reach('R', ox.handle(v1), { dir: p.dir(0, 0.1, 1), palm: DOWN, rate: 16 }); f.bow = 0.3;
      };
      for (let n = 0; ; n++) {
        const end = inField(F.dir > 0 ? 0.88 : 0.12, lanes[F.lane]);
        for (let t = 0; ox.toward(end.x, end.z, 0.52, p.dt) > 0.7; t += p.dt) { follow(); if (t > 5) { t = 0; c.sfx('plough', ox.px, ox.pz, 0.4); } yield; }
        // 地头：掉头，换到下一垄
        F.lane += F.step; if (F.lane >= lanes.length || F.lane < 0) { F.step = -F.step; F.lane += 2 * F.step; }
        const turn = inField(F.dir > 0 ? 0.9 : 0.1, lanes[F.lane]);
        F.dir = -F.dir;
        while (ox.toward(turn.x, turn.z, 0.44, p.dt) > 0.9) { follow(); yield; }
        F.u = F.dir > 0 ? 0.15 : 0.85;
        if (n % 3 === 2) c.sfx('ox', ox.x, ox.z, 0.4);
      }
    },
    hoe: hoeAct(F.hoe, hoe),
    /** 秋：连枷打谷。举过头顶，甩下去，枷拍在席上 */
    *thresh(p, c) {
      const f = p.fig, st = { x: THRESH.x - 0.25, z: THRESH.z + 1.5, yaw: Math.PI };
      p.hold(floor, 'world');
      yield* toField(p, c, st);
      p.pose('stand'); p.hold(flail.obj, 'R');
      const swing = (k: number, beat: number) => {
        const r = p.loc(-0.1, 0.98 + 0.34 * k, 0.2 - 0.06 * k, v1), d = v2.set(0.03, lerp(-0.42, 0.93, k), lerp(0.905, -0.36, k * k)).normalize();
        const wd = p.dir(d.x, d.y, d.z, v3);
        f.reach('R', r, { dir: wd, palm: UPV, rate: 20 });
        f.reach('L', v4.copy(r).addScaledVector(wd, 0.42 * p.scale), { dir: wd, palm: UPV, rate: 20 });
        f.bow = lerp(0.36, 0.0, k);
        flail.beater.rotation.x = beat;
      };
      p.rest = () => { swing(0, 0.5); f.bow = 0.06; };
      for (;;) {
        yield* p.tween(1.15, (k) => swing(k, lerp(0.5, -2.1, k)));
        yield* p.wait(0.12);
        yield* p.tween(0.34, (k) => swing(1 - k * k, lerp(-2.1, 0.35, k * k * k)));
        c.sfx('flail', p.pos.x, p.pos.z, 0.6 + 0.3 * R());
        yield* p.tween(0.35, (k) => swing(0, 0.35 + 0.2 * Math.sin(k * Math.PI)));
        yield* p.wait(rnd(0.5, 1.1));
      }
    },
    /** 冬：坐在自家门前的矮凳上，锄横在膝上，一下一下地磨 */
    *mend(p) {
      const f = p.fig;
      yield* sitStool(p, A_FRONT.mend, mendStool, 1.0);
      p.hold(hoe, 'root'); hoe.position.set(0.55, 0.46, 0.34); hoe.rotation.set(0, 0, Math.PI / 2 + 0.06);
      p.rest = () => { f.reach('R', null); f.reach('L', null); };
      for (;;) {
        f.reach('L', p.loc(0.3, 0.49, 0.34, v1), { dir: p.dir(1, 0, 0, v2), palm: DOWN });
        for (let t = 0, T = rnd(3.5, 5.5); t < T; t += p.dt) { f.reach('R', p.loc(-0.5 + 0.07 * Math.sin(t * 7.5), 0.5, 0.34, v1), { dir: p.dir(-1, 0, 0.2, v2), palm: DOWN, rate: 16 }); f.lookAt(p.loc(-0.5, 0.46, 0.38, v3)); f.bow = 0.42; yield; }
        f.lookAt(null); f.bow = 0.15;
        yield* p.wait(rnd(1.5, 3));
      }
    },
    noon: noonAct(0, cup),
    /** 夏：割麦（harvest.ts） */
    reap: harvest.reap,
    /** 雨天：坐在自家檐下搓草绳 */
    rope: stoolWork(kit, A_FRONT.rope[0], ropeStool, { props: (p) => { p.hold(ropeHeap, 'world'); const s = A_FRONT.rope[0].stool; ropeHeap.position.set(s.x - Math.cos(s.yaw) * 0.5, footY(s.x, s.z), s.z + Math.sin(s.yaw) * 0.5); ropeHeap.rotation.set(0, s.yaw, 0); }, work: ropeWork, look: [0, 0.42, 0.4] }),
    listen: listen('farmer'),
  }, [pt(door('a'))], (c, a) => (a !== 'noon' && farmer.act === 'noon' && LUNCH.coming && c.season !== 'winter' ? 'noon' : a));

  /**
   * 牛：春天套着犁（农夫歇晌时就站在垄里等）；夏秋的白天在田角吃草；
   * 清早农夫到牛棚把它牵出来，跟在他身后两三步走到田里；收工跟着他走回村里，送进棚。夜里、冬天在牛棚里。
   * 没人看着时就直接在该在的地方。
   */
  let oxMode = '', lunchP: Person | null = null;
  tends.push((c) => {
    const winter = c.season === 'winter', here = farmer.present;
    if (!here) { LED.on = false; F.at = false; }
    const want = winter || !here || !LED.on ? 'shed' : !F.at || farmer.act === null ? 'follow' : farmer.act === 'plough' || (farmer.act === 'noon' && c.season === 'spring') ? 'work' : 'rest';
    const seen = !c.wound && c.camPos.distanceTo(v1.set(ox.x, c.camPos.y, ox.z)) < 140 && c.frustum.containsPoint(v1.set(ox.x, footY(ox.x, ox.z) + 1, ox.z));
    ox.present = true;
    if (want === 'work') {
      if (oxMode !== 'work' && farmer.act === 'noon') { const a = inField(F.u, lanes[F.lane]); ox.put(a.x, a.z, F.dir > 0 ? rowYaw : rowYaw + Math.PI); }
      ox.hitched = farmer.act === 'noon' ? true : ox.hitched; ox.lie = 0; ox.graze = 0;
      if (farmer.act !== 'plough') ox.halt();
    } else if (want === 'follow') {
      // 牵着走：跟在人后头两三步
      ox.hitched = false; ox.lie = 0; ox.graze = 0;
      const tx = farmer.pos.x - Math.sin(farmer.yaw) * 2.3, tz = farmer.pos.z - Math.cos(farmer.yaw) * 2.3, d = Math.hypot(tx - ox.x, tz - ox.z);
      if (d > 30 && !seen) ox.put(tx, tz, farmer.yaw); else if (d > 0.5) ox.toward(tx, tz, Math.min(1.25, 0.3 + d * 0.5), c.dt); else ox.halt();
    } else if (want === 'rest') {
      ox.hitched = false;
      const OR = c.season === 'summer' ? REAP.ox : OX_REST, d = Math.hypot(OR.x - ox.x, OR.z - ox.z);
      if (d > 1 && (oxMode !== 'rest' || d < 60) && seen && d < 60) { ox.lie = 0; ox.graze = 0; ox.toward(OR.x, OR.z, 0.6, c.dt); }
      else { if (d > 1) ox.put(OR.x, OR.z, OR.yaw); ox.halt(); ox.lie = c.hour > 11.5 && c.hour < 13.5 ? 1 : 0; ox.graze = ox.lie ? 0 : Math.sin(c.t * 0.05) > -0.2 ? 1 : 0; }
    } else {
      ox.hitched = false;
      const d = Math.hypot(OX_SHED.x - ox.x, OX_SHED.z - ox.z);
      if (d > 0.7 && d < 14 && seen && oxMode !== '') { ox.lie = 0; ox.graze = 0; ox.toward(OX_SHED.x, OX_SHED.z, 0.6, c.dt); }
      else { if (d > 0.7) ox.put(OX_SHED.x, OX_SHED.z, OX_SHED.yaw); ox.halt(); ox.lie = c.night > 0.5 ? 1 : 0; ox.graze = ox.lie ? 0 : Math.sin(c.t * 0.07) > 0.1 ? 0.5 : 0; }
    }
    oxMode = want;
    if (farmer.act !== 'noon') LUNCH.served = false;
    LUNCH.coming = !!lunchP && lunchP.here && lunchP.act === 'bring' && !LUNCH.eaten;
  });

  const lunchBasket = P.foodBasket(), lunchJug = P.jug(), lunchBroom = P.broom(), lunchSole = P.shoeSole(), lunchStool = stoolOf();
  lunchBasket.visible = lunchJug.visible = lunchBroom.visible = lunchSole.visible = false;
  lunchP = add('lunch', 'lunch', {
    /** 提着饭篮、水罐走到田头（夏天是麦地的地头），放在埂上；等爹吃完，空着手回去 */
    *bring(p, c) {
      const f = p.fig, summer = c.season === 'summer';
      const end = summer ? { x: REAP.set.x - 0.55, z: REAP.set.z - 0.05, yaw: Math.PI / 2 } : { x: LUNCH_END[0] - 0.25, z: LUNCH_END[1] + 0.1, yaw: -Math.PI / 2 };
      const set = summer ? REAP.set : LUNCH_SET, wait = summer ? REAP.wait : LUNCH_WAIT;
      LUNCH.served = false; LUNCH.eaten = false;
      p.pose('stand'); p.hold(lunchBasket, 'L'); p.hold(lunchJug, 'R');
      const carry = () => {
        f.reach('L', p.loc(0.2, 0.92, 0.2, v5), { dir: DOWN, palm: p.dir(-1, 0, 0.2, v4), rate: 16 });
        f.reach('R', p.loc(-0.23, 0.8, 0.1, v3), { dir: DOWN, palm: p.dir(1, 0, 0, v2), rate: 16 });
      };
      p.rest = carry;
      yield* during(p.go(end, 1.05), carry);
      yield* p.tween(1.2, (k) => { f.bow = 0.7 * k; carry(); });
      // 放下：篮与罐留在埂上
      p.hold(lunchBasket, 'world'); lunchBasket.position.set(set.x, footY(set.x, set.z) + 0.41, set.z); lunchBasket.rotation.set(Math.PI, 0.4, 0);
      p.hold(lunchJug, 'world'); lunchJug.position.set(set.x + 0.1, footY(set.x, set.z) + 0.37, set.z + 0.34); lunchJug.rotation.set(Math.PI, 0, 0);
      f.reach('L', null); f.reach('R', null); p.rest = null;
      LUNCH.served = true;
      yield* p.tween(1.0, (k) => { f.bow = 0.7 * (1 - k); });
      yield* p.go(wait, 0.8);
      p.pose('stand', 'sleeve');
      for (let t = 0; t < 75 && !LUNCH.eaten; t += p.dt) { f.lookAt(t % 14 < 6 ? v1.copy(farmer.pos).setY(farmer.pos.y + 0.6) : null); yield; }
      LUNCH.eaten = true;
      f.lookAt(null); p.pose('stand', 'free');
      yield* p.go(door('a'), 1.1);
      yield* p.away(1e5);
    },
    sweep: sweepAct(kit, A_FRONT.sweep, lunchBroom),
    sew: stoolWork(kit, A_FRONT.sew2, lunchStool, { props: (p) => p.hold(lunchSole, 'L'), work: sewWork, look: [0.05, 0.62, 0.4] }),
    glean: harvest.glean,
    listen: listen('lunch'),
  }, [pt(door('a'))]);
  lunchP.chatty = 0.45;

  // ———————————————————————— 采桑女（桂姐）；采桑、翻晒也给后添的几位用 ————————————————————————
  const basket = P.basket(), wheel = P.spinningWheel();
  onGround(wheel.obj, { x: SPIN.x + Math.sin(SPIN.yaw) * 0.55 - Math.cos(SPIN.yaw) * 0.1, z: SPIN.z + Math.cos(SPIN.yaw) * 0.55 + Math.sin(SPIN.yaw) * 0.1, yaw: SPIN.yaw + Math.PI / 2 });
  basket.visible = false;
  /** 各采桑人采到第几株了（几个人错开着采，不挤在一株下） */
  const K = [{ i: 0 }, { i: 2 }, { i: 4 }];
  /** 采桑：左臂挎篮，右手探到枝上，采一把放进篮里；一株采三四把，换下一株（i：第几个采桑的人） */
  const pickAct = (i: number): Act => {
    const bk = i ? P.basket() : basket, k = K[i % K.length];
    bk.visible = false;
    return function* (p) {
      const f = p.fig;
      p.pose('stand'); p.hold(bk, 'L');
      const carry = () => f.reach('L', p.loc(0.2, 0.94, 0.2, v5), { dir: DOWN, palm: p.dir(-1, 0, 0.2, v4), rate: 16 });
      p.rest = () => { carry(); f.reach('R', null); };
      for (;;) {
        const tr = MULBERRIES[k.i % MULBERRIES.length], a = k.i * 2.4 + 0.6 + i * 2.1, sx = tr.x + Math.cos(a) * 0.95, sz = tr.z + Math.sin(a) * 0.95;
        yield* during(p.go({ x: sx, z: sz, yaw: Math.atan2(tr.x - sx, tr.z - sz) }, 0.85), carry);
        for (let n = 0, N = 3 + (k.i % 2); n < N; n++) {
          const tx = rnd(-0.22, 0.08), ty = rnd(1.58, 1.74), tz = rnd(0.34, 0.46);
          yield* p.tween(1.25, (u) => { carry(); f.reach('R', p.loc(lerp(-0.2, tx, u), lerp(0.95, ty, u), lerp(0.2, tz, u), v1), { dir: UPV, rate: 12 }); f.lookAt(p.loc(tx, ty + 0.1, tz + 0.2, v2)); });
          // 掐几下
          for (let t = 0; t < 1.3; t += p.dt) { carry(); f.reach('R', p.loc(tx + 0.03 * Math.sin(t * 9), ty - 0.035 * Math.max(0, Math.sin(t * 9)), tz, v1), { dir: UPV, rate: 20 }); yield; }
          yield* p.tween(0.95, (u) => { carry(); f.reach('R', p.loc(lerp(tx, 0.16, u), lerp(ty, 0.84, u), lerp(tz, 0.24, u), v1), { dir: DOWN, rate: 12 }); f.lookAt(u > 0.4 ? p.loc(0.2, 0.7, 0.4, v2) : null); });
          yield* during(p.wait(0.35), carry);
        }
        f.reach('R', null); f.lookAt(null);
        k.i++;
      }
    };
  };
  /** 秋：在晒场上摊谷，拿木耙沿着晒席一下一下地推（i：第几个人——0、2 在席南边，1 在席北边） */
  const sunAct = (i: number): Act => {
    const rake = P.rake();
    rake.visible = false;
    return function* (p) {
      const f = p.fig, M = DRY_MAT, c0 = Math.cos(M.yaw), s0 = Math.sin(M.yaw), sg = i === 1 ? -1 : 1;
      const side = (k: number) => ({ x: M.x + k * c0 + sg * (M.d / 2 + 0.8) * s0, z: M.z - k * s0 + sg * (M.d / 2 + 0.8) * c0, yaw: M.yaw + (sg > 0 ? Math.PI : 0) });
      let k = i === 2 ? 0.3 : -0.9;
      yield* p.go(side(k), 0.9);
      p.pose('stand'); p.hold(rake, 'R');
      const push = (u: number) => {
        const r = p.loc(-0.12, 0.92, 0.18 + 0.2 * u, v1), d = v2.set(0.1, -0.6 + 0.08 * u, 0.79).normalize(), wd = p.dir(d.x, d.y, d.z, v3);
        f.reach('R', r, { dir: wd, palm: UPV, rate: 14 }); f.reach('L', v4.copy(r).addScaledVector(wd, 0.45 * p.scale), { dir: wd, palm: UPV, rate: 14 });
        f.bow = 0.16 + 0.16 * u;
      };
      p.rest = () => push(0);
      for (;;) {
        for (let n = 0; n < 4; n++) { yield* p.tween(1.2, (u) => push(u)); yield* p.tween(1.0, (u) => push(1 - u)); }
        k = k > 0.8 ? -0.9 : k + 0.6;
        yield* during(p.go(side(k), 0.6), () => push(0));
      }
    };
  };
  const picker = add('picker', 'picker', {
    pick: pickAct(0),
    /** 午间：坐在桑树下，篮子放在身边 */
    *shade(p) {
      yield* p.go(ORCHARD_REST, 0.9);
      yield* p.sit(0, 'lap');
      p.hold(basket, 'root'); basket.position.set(0.42, 0.42, 0.12); basket.rotation.set(Math.PI, 0, 0);
      yield* p.forever(() => undefined);
    },
    sun: sunAct(0),
    /** 冬：门前纺线。右手摇轮，左手往后抽纱 */
    *spin(p) {
      const f = p.fig;
      p.hold(wheel.obj, 'world');
      yield* p.go(SPIN, 0.9);
      yield* p.sit();
      p.rest = () => { f.reach('R', null); f.reach('L', null); };
      const hub = new THREE.Vector3();
      yield* p.forever((t) => {
        const a = t * 2.4; wheel.wheel.rotation.x = -a;
        wheel.wheel.getWorldPosition(hub);
        const side = p.dir(-1, 0, 0, v2);
        f.reach('R', v1.copy(hub).addScaledVector(side, -0.16).add(v3.set(0, Math.cos(a) * 0.11, 0)).addScaledVector(p.dir(0, 0, 1, v4), Math.sin(a) * 0.11), { dir: p.dir(0.3, 0, 1, v5), rate: 18 });
        const u = 0.5 - 0.5 * Math.cos(t * 0.8);
        f.reach('L', p.loc(0.24 + 0.16 * u, 0.42 + 0.1 * u, 0.42 - 0.2 * u, v1), { dir: p.dir(0.2, 0.3, 1, v5), palm: UPV, rate: 8 });
        f.lookAt(p.loc(0.2, 0.3, 0.6, v3));
      });
    },
    listen: listen('picker'),
  }, [pt(door('a'))]);
  picker.chatty = 0.35;

  // ———————————————————————— 村塾：童子与先生；秋千上的小女孩 ————————————————————————
  const kite = P.kite(), string = P.lineMesh(0.004), books = P.book(), rule = P.ruler();
  kite.obj.visible = string.visible = books.visible = rule.visible = false;
  group.add(kite.obj, string);
  const kids: Person[] = [];
  /** 货郎在茶亭歇着、招呼孩子的时候 */
  const PED = { call: false };
  const GO = { turn: 0, on: [false, false] };
  let recite = 0;
  /** 孩子们的日程照名册；午后货郎来了都跑去茶亭看，石头看棋只在两位老人真坐下来下的时候（不然还是去玩） */
  const kidExtra = (c: Ctx, a: string | null): string | null => {
    // 邵先生回村塾讲卦（play/study/school.ts）：都回到自己的席上听（大雨大雪天照旧不来）
    if (SCHOOL.on && c.rain <= 0.85 && c.snow <= 0.85) return 'school';
    if (a === 'play' || a === 'watch') { if (PED.call) return 'gather'; if (a === 'watch' && !GO.on[0]) return 'play'; }
    // 大雨大雪天不上学（小雨照上：下雨天书声最齐）
    if (a === 'school' && (c.rain > 0.85 || c.snow > 0.85)) return null;
    return a;
  };
  const kidActs = (i: number): Record<string, Act> => ({
    /** 念书：坐在矮桌旁的席上，身子左右摇，头跟着晃；领头的那个每念一句出一声 */
    *school(p, c) {
      const f = p.fig, d = DESKS[i], ph = i * 1.9;
      yield* p.go(d, 1.2, [pt(SCHOOL_FRONT), [d.x - 0.2, d.z + 1.1]]);
      yield* p.sit(p.liftTo(SCHOOL_Y), 'lap'); p.curious = false;
      yield* p.forever((t) => {
        const w = t * 2.5 + ph;
        // 先生在讲：不念书，坐直了抬头看先生，偶尔点一点头
        if (SCHOOL.on && SCHOOL.at) { p.tilt = 0.012 * Math.sin(w * 0.3); f.bow = 0.05 + 0.05 * Math.max(0, Math.sin(t * 0.7 + ph)) ** 6; f.lookAt(SCHOOL.at); return; }
        p.tilt = 0.085 * Math.sin(w);
        f.bow = 0.16 + 0.1 * Math.sin(w * 2 + 0.6);
        f.lookAt(p.loc(0.5 * Math.sin(w + 0.4), 0.42 + 0.12 * Math.sin(w * 2), 1, v1));
        if (i === 0 && (t < recite || t - recite > 2.5132)) { recite = t; c.sfx('recite', p.pos.x, p.pos.z, 0.55 + 0.25 * R()); }
      });
    },
    /** 玩：一个跑、一个追；另一个蹲着看蚂蚁（春天是放纸鸢） */
    *play(p, c) {
      const f = p.fig, spring = c.season === 'spring';
      const role = i === 0 ? 'run' : (i === 1) === spring ? (spring ? 'kite' : 'ants') : 'chase';
      const at = (a: number) => ({ x: PLAY.x + Math.cos(a) * PLAY.rx, z: PLAY.z + Math.sin(a) * PLAY.rz });
      if (role === 'run') {
        let a = 0.5, sgn = 1;
        yield* p.go(at(a), 1.9);
        for (;;) {
          for (let t = 0, T = rnd(9, 15); t < T; t += p.dt) {
            const g = at(a + sgn * 0.75), o = wrap(Math.atan2(g.x - p.pos.x, g.z - p.pos.z) - p.yaw);
            p.yaw += Math.max(-4.2 * p.dt, Math.min(4.2 * p.dt, o));
            const v = 2.05 * Math.max(0.3, Math.cos(o));
            p.pos.x += Math.sin(p.yaw) * v * p.dt; p.pos.z += Math.cos(p.yaw) * v * p.dt;
            a = Math.atan2((p.pos.z - PLAY.z) / PLAY.rz, (p.pos.x - PLAY.x) / PLAY.rx);
            yield;
          }
          // 跑累了：手撑着膝喘一喘，回头看追的人（春天是仰头看纸鸢）
          yield* p.tween(0.8, (k) => { f.bow = 0.42 * k; });
          for (let t = 0, T = rnd(3, 5); t < T; t += p.dt) { f.bow = spring ? 0 : 0.42; f.lookAt(spring && kite.obj.visible ? kite.obj.position : v1.copy(kids[spring ? 2 : 1].pos).setY(p.pos.y + 0.9)); yield; }
          f.lookAt(null); f.bow = 0;
          if (R() < 0.35) sgn = -sgn;
        }
      } else if (role === 'chase') {
        yield* p.go(at(-0.6), 1.9);
        const lead = kids[0];
        yield* p.forever(() => {
          const dx = lead.pos.x - p.pos.x, dz = lead.pos.z - p.pos.z, d = Math.hypot(dx, dz), o = wrap(Math.atan2(dx, dz) - p.yaw);
          p.yaw += Math.max(-4.5 * p.dt, Math.min(4.5 * p.dt, o));
          const v = (lead.act !== 'play' || d > 20 ? 0 : d > 2.4 ? 2.0 : d > 1.3 ? 1.1 : 0) * Math.max(0.2, Math.cos(o));
          p.pos.x += Math.sin(p.yaw) * v * p.dt; p.pos.z += Math.cos(p.yaw) * v * p.dt;
          f.bow += ((v === 0 && d < 1.6 ? 0.3 : 0) - f.bow) * Math.min(1, p.dt * 3);
        });
      } else if (role === 'ants') {
        yield* p.go(ANTS, 1.6);
        p.pose('crouch'); p.seated = true;
        for (;;) {
          for (let t = 0, T = rnd(6, 11); t < T; t += p.dt) { f.lookAt(p.loc(0.1 * Math.sin(t * 0.4), 0.02, 0.5, v1)); yield; }
          // 伸手指一指
          yield* p.tween(0.8, (k) => f.reach('R', p.loc(-0.12, lerp(0.4, 0.07, k), lerp(0.25, 0.5, k), v1), { dir: p.dir(0, -0.5, 1, v2), rate: 8 }));
          yield* p.wait(rnd(1.5, 3));
          f.reach('R', null);
        }
      } else {
        // 放纸鸢：仰着头，右手举着线，一下一下地带；纸鸢在下风处的天上慢慢地摆
        yield* p.go(KITE, 1.6);
        p.pose('stand'); p.curious = false;
        p.hold(kite.obj, 'world'); p.hold(string, 'world');
        const hand = new THREE.Vector3(), kp = new THREE.Vector3(), wx = 0.75, wz = 0.66;
        yield* p.forever((t) => {
          // 纸鸢：下风处十几米远、十来米高，画着一个扁的「8」字
          const sx = Math.sin(t * 0.31), sy = Math.sin(t * 0.62 + 0.4);
          kp.set(p.pos.x + wx * (13 + 1.5 * sy) - wz * 4.5 * sx, p.pos.y + 11 + 1.6 * sy + 0.5 * Math.sin(t * 1.3), p.pos.z + wz * (13 + 1.5 * sy) + wx * 4.5 * sx);
          kite.obj.position.copy(kp); kite.obj.rotation.set(-0.65, Math.atan2(-wx, -wz), 0.3 * Math.cos(t * 0.31) + 0.08 * Math.sin(t * 2.1), 'YXZ');
          kite.tails.forEach((tl, n) => tl.rotation.set(0.5 + 0.25 * Math.sin(t * 3.1 + n * 1.7), 0, 0.25 * Math.sin(t * 2.3 + n * 2.9)));
          p.yaw += wrap(Math.atan2(kp.x - p.pos.x, kp.z - p.pos.z) - p.yaw) * Math.min(1, p.dt * 1.5);
          const tug = Math.max(0, Math.sin(t * 1.7)) ** 4;
          f.reach('R', p.loc(-0.2, 1.22 - 0.12 * tug, 0.34 - 0.08 * tug, v1), { dir: v2.subVectors(kp, v1).normalize(), rate: 12 });
          f.lookAt(kp);
          f.joints.handR.getWorldPosition(hand);
          span(string.matrix, hand.x, hand.y, hand.z, kp.x, kp.y - 0.05, kp.z); string.matrixWorldNeedsUpdate = true;
        });
      }
    },
    /** 看棋：站在石桌旁，袖着手探头看 */
    *watch(p) {
      const f = p.fig;
      yield* p.go(CHESS.watch, 1.6);
      p.pose('stand', 'sleeve');
      yield* p.forever((t) => { f.bow = 0.16 + 0.06 * Math.sin(t * 0.5); f.lookAt(v1.set(CHESS.x, footY(CHESS.x, CHESS.z) + CHESS.top, CHESS.z)); });
    },
    /** 货郎来了：跑到茶亭前围着看 */
    *gather(p) {
      const f = p.fig, s = TEA.crowd[i % TEA.crowd.length];
      yield* p.go({ x: s.x, z: s.z, yaw: Math.atan2(TEA.load.x - s.x, TEA.load.z - s.z) }, 2.1);
      p.pose('stand');
      yield* p.forever((t) => { f.bow = 0.12 + 0.08 * Math.sin(t * 1.3 + i); f.lookAt(v1.set(TEA.load.x + 0.5 * Math.sin(t * 0.4 + i * 2), TEA.y0 + 0.45, TEA.load.z)); });
    },
    /** 黄昏：一个人走到石桥上，趴在桥边看水；天黑了就仰头看星 */
    *bridge(p, c) {
      const f = p.fig;
      yield* p.go(ON_BRIDGE, 1.15);
      const wy = streamAt(SITE.bridge.x, SITE.bridge.z).y;
      for (;;) {
        p.pose('stand'); p.seated = false;
        for (let t = 0, T = rnd(7, 12); t < T; t += p.dt) {
          if (c.night > 0.55) { f.bow = 0; f.lookAt(v1.set(p.pos.x - 6, p.pos.y + 14, p.pos.z - 20)); }
          else { f.bow = 0.22; f.lookAt(v1.set(p.pos.x + 2.2 + 0.6 * Math.sin(t * 0.5), wy, p.pos.z + 0.8 * Math.sin(t * 0.3))); }
          yield;
        }
        if (c.night > 0.55) continue;
        f.bow = 0; p.pose('crouch'); p.seated = true;
        for (let t = 0, T = rnd(6, 10); t < T; t += p.dt) { f.lookAt(v1.set(p.pos.x + 1.6, wy, p.pos.z + 0.5 * Math.sin(t * 0.4))); yield; }
      }
    },
  });
  ([['kid1', pt(door('a'))], ['kid2', pt(door('b'))], ['kid3', pt(door('d'))]] as Array<[string, [number, number]]>).forEach(([id, home], i) => {
    const acts = kidActs(i);
    if (i > 0) acts.listen = listen(id, true);
    const kid = add(id, id as LookName, acts, [home], kidExtra);
    kid.chatty = 0.08;
    kids.push(kid);
  });

  /** 秋千上的小女孩（npcs.swinger）：放了学、午后，坐在秋千板上，两手攥着绳。板是别人搭的——荡不荡由外面带着她动 */
  const swinger = add('swinger', 'kid4', {
    *swing(p) {
      const f = p.fig, s = p.scale, fwd = 0.3 * s;
      yield* p.go({ x: SWING.x + Math.sin(SWING.yaw) * fwd, z: SWING.z + Math.cos(SWING.yaw) * fwd, yaw: SWING.yaw }, 1.3, [SWING.front]);
      // 脚够不着地：把「脚下」垫到板下面一个凳高的地方，两条小腿就垂着
      f.setSeat({ h: 0.44, cz: -0.3 }); p.pose('bench'); p.seated = true;
      const up = p.liftTo(ground(SWING.x, SWING.z) + SWING.seatY - 0.44 * s);
      if (p.snapNow) p.lift = up; else yield* p.tween(0.9, (k) => { p.lift = up * k; });
      yield* p.forever((t) => {
        for (const sd of [-1, 1]) f.reach(sd > 0 ? 'L' : 'R', p.loc(sd * 0.27 / s, 0.44 + 0.42 / s, -0.3 + 0.02, sd > 0 ? v1 : v2), { dir: UPV, palm: p.dir(-sd, 0, 0, v3), rate: 12 });
        f.lookAt(Math.sin(t * 0.3) > 0.6 ? p.loc(Math.sin(t * 0.7), 0.6, 2, v4) : null);
      });
    },
    /** 挨着娘坐在织机旁（villagers.ts 里写的，那边才有织机） */
    by: (p, c) => kit.byAct!(p, c),
    listen: listen('swinger', true),
  }, [pt(door('d'))]);
  swinger.chatty = 0.05;

  const tLamp = P.oilLamp();
  tLamp.visible = false;
  const teacher = add('teacher', 'teacher', {
    /** 教书：坐在高桌后的坐墩上，左手一卷书，右手戒尺打着拍子，点着头听 */
    *teach(p) {
      const f = p.fig;
      yield* p.bench(TEACHER, 1.0, [pt(SCHOOL_FRONT), pt(TEACHER_IN)]);
      p.hold(books, 'L'); p.hold(rule, 'R');
      p.rest = () => f.reach('R', null);
      yield* p.forever((t) => {
        f.reach('L', p.loc(0.14, 0.92, 0.3, v1), { dir: p.dir(0, 0.9, 0.4, v2), palm: p.dir(-0.3, 0.2, -1, v3), rate: 8 });
        f.reach('R', p.loc(-0.22, 0.8 + 0.045 * Math.max(0, Math.sin(t * 2.5)), 0.34, v1), { dir: p.dir(0.2, 0.2, 1, v2), palm: DOWN, rate: 14 });
        f.bow = 0.06 + 0.05 * Math.sin(t * 1.25);
        if (Math.sin(t * 0.21) > 0.55) f.lookAt(v4.copy(kids[Math.floor(t * 0.07) % 3].pos).setY(p.pos.y + 0.5)); else f.lookAt(null);
      });
    },
    /** 午后：檐下坐着看书，看一阵翻一页 */
    *read(p) {
      const f = p.fig;
      yield* p.go(TEACHER_PORCH, 0.9, [pt(TEACHER_PORCH_IN)]);
      yield* p.sit(p.liftTo(SCHOOL_Y)); p.hold(books, 'L');
      for (;;) {
        for (let t = 0, T = rnd(8, 14); t < T; t += p.dt) { f.reach('L', p.loc(0.1, 0.44, 0.3, v1), { dir: p.dir(0, 0.9, 0.4, v2), palm: p.dir(-0.3, 0.2, -1, v3), rate: 8 }); f.lookAt(p.loc(0.1, 0.4, 0.4, v4)); f.bow = 0.1; yield; }
        yield* p.tween(1.1, (k) => f.reach('R', p.loc(lerp(-0.1, 0.16, Math.sin(k * Math.PI)), 0.46, 0.32, v1), { rate: 10 }));
        f.reach('R', null);
      }
    },
    /** 夜里（雨天的午后也是）：坐回高桌后，桌角一盏灯，捧着书看，看一阵翻一页；前檐敞着，路上望得见那一点灯 */
    *night(p) {
      const f = p.fig;
      yield* p.bench(TEACHER, 1.0, [pt(SCHOOL_FRONT), pt(TEACHER_IN)]);
      p.hold(books, 'L');
      const lp = p.loc(0.3, 0, 0.45, v5); p.hold(tLamp, 'world'); tLamp.position.set(lp.x, SCHOOL_Y + 0.73, lp.z);
      p.rest = () => f.reach('R', null);
      for (;;) {
        for (let t = 0, T = rnd(10, 16); t < T; t += p.dt) { f.reach('L', p.loc(0.08, 0.86, 0.36, v1), { dir: p.dir(0, 0.9, 0.4, v2), palm: p.dir(-0.3, 0.2, -1, v3), rate: 8 }); f.lookAt(p.loc(0.08, 0.84, 0.48, v4)); f.bow = 0.14; yield; }
        yield* p.tween(1.1, (k) => f.reach('R', p.loc(lerp(-0.1, 0.14, Math.sin(k * Math.PI)), 0.88, 0.38, v1), { rate: 10 }));
        f.reach('R', null);
      }
    },
  }, [pt(door('d'))], (c, a) => (SCHOOL.on ? 'read' : a === 'teach' && (c.rain > 0.85 || c.snow > 0.85) ? null : a));
  teacher.chatty = 0.35;

  // ———————————————————————— 槐树下：老人、弈棋的另一位、邻家妇人 ————————————————————————
  const staff = P.staff(1.12), tea = P.bowl(0.052), tea2 = P.bowl(0.06), broom = P.broom(), trayM = P.tray();
  staff.visible = tea.visible = tea2.visible = broom.visible = trayM.visible = false;
  /** 端茶：送来了没有、碗递到哪了（老人伸手去接）、她说着话没有 */
  const V = { visit: 0, last: -1e3, offer: null as THREE.Vector3 | null, talk: false };
  /** 对弈：轮到谁（0 北头的老人，1 南头的那位），各自的棋罐在桌上哪 */
  const boardY = () => footY(CHESS.x, CHESS.z) + CHESS.top;
  const onBoard = (lx: number, lz: number, out: THREE.Vector3) => { const c = Math.cos(CHESS.yaw), s = Math.sin(CHESS.yaw); return out.set(CHESS.x + lx * c + lz * s, boardY() + 0.02, CHESS.z - lx * s + lz * c); };
  function* game(p: Person, c: Ctx, me: 0 | 1, seat: typeof CHESS.north): Script {
    const f = p.fig, sgn = me ? 1 : -1, other = () => folk.people.find((q) => q.id === (me ? 'elder' : 'elder2'))!;
    yield* p.bench(seat, 0.6);
    GO.on[me] = true;
    p.rest = () => { f.reach('R', null); f.bow = 0.1; };
    for (;;) {
      // 等着：看着棋盘，偶尔抬眼看对面
      for (let t = 0; GO.turn !== me || !GO.on[1 - me]; t += p.dt) { f.bow = 0.26 + 0.03 * Math.sin(t * 0.6); f.lookAt(Math.sin(t * 0.23 + me) > 0.8 ? v1.copy(other().pos).setY(other().pos.y + 1.0) : onBoard(0, 0, v1)); yield; }
      // 想：手托着下巴
      for (let t = 0, T = rnd(4, 9); t < T; t += p.dt) { f.bow = 0.3; f.lookAt(onBoard(0, 0, v1)); f.reach('R', f.joints.head.getWorldPosition(v2).add(p.dir(-0.03, -0.13, 0.09, v3)), { dir: p.dir(0.3, 0.9, 0, v4), rate: 5 }); yield; }
      // 从罐里拈一子，落到盘上
      yield* p.tween(0.8, () => { f.bow = 0.34; f.reach('R', onBoard(sgn * 0.31, sgn * 0.2, v2).setY(boardY() + 0.1), { dir: DOWN, rate: 9 }); });
      const lx = rnd(-0.17, 0.17), lz = rnd(-0.17, 0.17);
      yield* p.tween(0.9, () => { f.bow = 0.4; f.reach('R', onBoard(lx, lz, v2).setY(boardY() + 0.045), { dir: p.dir(0, -0.8, 0.6, v3), rate: 9 }); });
      c.sfx('stone', CHESS.x, CHESS.z, 0.45 + 0.3 * R());
      yield* p.wait(0.35);
      f.reach('R', null);
      GO.turn = 1 - me;
    }
  }
  const elder = add('elder', 'elder', {
    /** 坐在石凳上：右手拄着杖，左手一碗茶；头一点一点地打盹，醒了喝一口；有人送茶来就抬头 */
    *sit(p, c) {
      const f = p.fig;
      yield* p.bench(ELDER, 0.6);
      p.hold(staff, 'root'); staff.position.set(-0.26, 0, 0.3); staff.rotation.set(-0.1, 0, -0.03);
      p.hold(tea, 'L');
      const lean = () => f.reach('R', p.loc(-0.25, 0.88, 0.26, v1), { dir: p.dir(0.4, 0.2, 1, v2), palm: p.dir(0.3, -0.4, -1, v4), rate: 8 });
      p.rest = () => { lean(); f.bow = 0.02; };
      for (;;) {
        // 打盹：头慢慢垂下去，忽然一醒
        const T = rnd(7, 13);
        for (let t = 0; t < T && !V.visit; t += p.dt) { lean(); f.bow = 0.05 + 0.4 * Math.min(1, t / T) ** 1.6 + 0.03 * Math.sin(t * 1.1); yield; }
        yield* p.tween(0.5, (k) => { lean(); f.bow = lerp(f.bow, 0.03, k); });
        if (V.visit) {
          // 邻家送茶来了：抬头看她，点点头
          // 邻家送茶来了：抬头看她；她把碗递过来就伸手去接；她说着话就一下一下地点头，接过来的茶抿一口
          for (let t = 0; V.visit; t += p.dt) {
            lean(); f.lookAt(v3.copy(neighbor.pos).setY(neighbor.pos.y + 1.4));
            if (V.offer) f.reach('L', V.offer, { dir: p.dir(-0.4, 0.2, 1, v4), palm: UPV, rate: 6 }); else f.reach('L', null);
            f.bow = 0.03 + (V.talk ? 0.06 : 0.04) * Math.max(0, Math.sin(t * 2.2));
            yield;
          }
          f.lookAt(null);
        }
        // 喝一口
        yield* p.tween(1.3, () => { lean(); f.reach('L', f.joints.head.getWorldPosition(v3).add(p.dir(0, -0.07, 0.1, v4)), { dir: p.dir(-0.7, 0.55, 0, v5), palm: UPV, rate: 5 }); });
        c.sfx('cup', p.pos.x, p.pos.z, 0.3);
        yield* during(p.wait(1.5), lean);
        f.reach('L', null);
        yield* during(p.wait(rnd(2, 5)), lean);
      }
    },
    go: (p, c) => game(p, c, 0, CHESS.north),
    listen: listen('elder'),
  }, [pt(door('b'))]);
  elder.chatty = 0.5;
  const staff2 = P.staff(1.08);
  staff2.visible = false;
  const elder2 = add('elder2', 'elder2', {
    go: (p, c) => game(p, c, 1, CHESS.south),
    /** 上午：坐在修桥处的岸上，杖靠在身边，看儿子刨板钉板；隔一阵抬手指一指，说两句 */
    *oversee(p) {
      const f = p.fig, son = () => kit.who('carpenter1');
      yield* p.go(OVERSEE, 0.6);
      yield* p.sit(0, 'lap');
      p.hold(staff2, 'root'); staff2.position.set(-0.32, 0, 0.32); staff2.rotation.set(-0.45, 0, 0.12);
      p.rest = () => f.reach('R', null);
      yield* p.forever((t) => {
        const s = son(), point = Math.max(0, Math.sin(t * 0.19)) ** 10;
        f.lookAt(s?.here ? v1.set(s.pos.x, s.pos.y + 0.9, s.pos.z) : null);
        if (point > 0.05 && s?.here) f.reach('R', v2.lerpVectors(p.loc(-0.2, 0.55, 0.3, v2), v3.set(s.pos.x, s.pos.y + 0.7, s.pos.z), 0.22 * point), { rate: 6 }); else f.reach('R', null);
        f.bow = 0.08 + 0.04 * point;
      });
    },
    listen: listen('elder2'),
  }, [pt(door('d'))]);
  elder2.chatty = 0.5;

  const neighbor: Person = add('neighbor', 'neighbor', {
    /** 喂鸡：左臂托着簸箕，右手抓一把撒出去 */
    *feed(p) {
      const f = p.fig;
      yield* p.go(FEED, 0.9);
      p.pose('stand'); p.hold(trayM, 'L');
      const carry = () => f.reach('L', p.loc(0.16, 0.98, 0.25, v5), { dir: p.dir(-0.4, 0, 1, v4), palm: UPV, rate: 14 });
      p.rest = () => { carry(); f.reach('R', null); };
      p.loc(-0.3, 0, 1.5, v3);
      folk.feedAt = { x: v3.x, z: v3.z };
      for (;;) {
        yield* p.tween(0.8, (k) => { carry(); f.reach('R', p.loc(lerp(-0.2, 0.1, k), lerp(0.9, 1.02, k), 0.26, v1), { dir: p.dir(0.6, -0.5, 0.4, v2), rate: 10 }); });
        yield* p.tween(0.55, (k) => { carry(); f.reach('R', p.loc(lerp(0.1, -0.42, k), lerp(1.02, 0.86, k), lerp(0.26, 0.58, k), v1), { dir: p.dir(-0.3, -0.2, 1, v2), palm: DOWN, rate: 16 }); });
        yield* during(p.wait(0.5), carry);
        f.reach('R', null);
        yield* during(p.wait(rnd(1.2, 2.6)), carry);
      }
    },
    /** 扫地；隔一阵端一碗茶去槐树下给老人 */
    *sweep(p, c) {
      const f = p.fig;
      // 走动时帚竖着提在手里（帚头朝下）
      const carry = () => f.reach('R', p.loc(-0.22, 0.98, 0.16, v1), { dir: p.dir(0, 1, 0.12, v2), rate: 10 });
      for (let n = 0; ; n++) {
        const s = SWEEP[n % SWEEP.length];
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
        for (let i = 0, N = 5 + (n % 3); i < N; i++) { c.sfx('broom', p.pos.x, p.pos.z, 0.35); yield* p.tween(0.9, (u) => stroke(u)); yield* p.tween(0.5, (u) => stroke(1 - u)); }
        f.reach('L', null); f.reach('R', null); f.bow = 0; p.rest = null;
        if (elder.here && elder.act === 'sit' && c.t - V.last > 95 && n % 2 === 1) {
          // 端茶过去：两手捧着碗，走到老人跟前递一递，站着说几句，再回来
          V.last = c.t;
          yield* during(p.go(door('b'), 0.9), carry);
          f.reach('R', null); broom.visible = false;
          yield* p.wait(1.5);
          p.hold(tea2, 'R');
          const hold = () => { f.reach('R', p.loc(-0.06, 1.02, 0.3, v1), { dir: p.dir(0.7, 0, 0.7, v2), palm: UPV, rate: 14 }); f.reach('L', p.loc(0.07, 1.0, 0.3, v3), { dir: p.dir(-0.7, 0, 0.7, v4), palm: UPV, rate: 14 }); };
          yield* during(p.go(VISIT, 0.95), hold);
          V.visit = 1; V.offer = null; V.talk = false;
          yield* p.tween(1.2, (k) => { f.reach('R', p.loc(-0.06, lerp(1.02, 0.86, k), lerp(0.3, 0.5, k), v1), { dir: p.dir(0.7, 0, 0.7, v2), palm: UPV, rate: 10 }); f.reach('L', p.loc(0.07, lerp(1.0, 0.85, k), lerp(0.3, 0.48, k), v3), { dir: p.dir(-0.7, 0, 0.7, v4), palm: UPV, rate: 10 }); f.bow = 0.3 * k; f.lookAt(v5.copy(elder.pos).setY(elder.pos.y + 1.0)); });
          // 递过去：碗停在两人之间，老人伸手接（他手里原有一只，接过来就算换了一碗热的）
          V.offer = tea2.getWorldPosition(new THREE.Vector3());
          yield* p.wait(1.6);
          tea2.visible = false; f.reach('L', null); f.reach('R', null); V.offer = null; V.talk = true;
          // 站着说几句：抬手比划，看着他
          for (let t = 0, T = rnd(8, 13); t < T; t += p.dt) {
            const g = Math.max(0, Math.sin(t * 1.1)) * (0.6 + 0.4 * Math.sin(t * 3.1));
            f.reach('R', p.loc(-0.2, 1.0 + 0.1 * g, 0.3 + 0.06 * g, v1), { dir: p.dir(0.2, 0.5, 0.85, v2), palm: p.dir(0, 0.8, 0.2, v3), rate: 6 });
            f.bow = 0.08 + 0.04 * Math.sin(t * 1.6); f.lookAt(v5.copy(elder.pos).setY(elder.pos.y + 1.0));
            if (t > 4 && t - p.dt <= 4 && R() < 0.5) c.sfx('laugh', p.pos.x, p.pos.z, 0.2);
            yield;
          }
          f.reach('R', null); V.talk = false;
          f.lookAt(null); f.bow = 0; V.visit = 0;
          yield* p.go(s, 0.95);
        }
      }
    },
    /** 午后：坐到东头披屋下的织机前织布（织机是屋舍那边摆的）：右手把梭从经面上推过去、左手接住，两手扳过筘来一打；再投回来 */
    *weave(p, c) {
      const f = p.fig, L = B_LOOM, co = Math.cos(L.yaw), sn = Math.sin(L.yaw);
      /** 织机自己坐标里的一点（z 朝织的人，y 从屋基起） */
      const W = (lx: number, ly: number, lz: number, out: THREE.Vector3) => out.set(L.loom.x + lx * co + lz * sn, L.y + ly, L.loom.z - lx * sn + lz * co);
      yield* p.bench(L.seat, 0.9);
      p.curious = false;
      p.rest = () => { f.reach('R', null); f.reach('L', null); };
      for (let n = 0; ; n++) {
        for (const side of [1, -1]) {
          yield* p.tween(0.75, (u) => {
            const x = lerp(0.26 * side, -0.26 * side, u), hand = side > 0 ? (u < 0.5 ? 'R' : 'L') : (u < 0.5 ? 'L' : 'R');
            f.reach(hand, W(x, 0.8, 0.12, v1), { dir: p.dir(0, -0.3, 1, v2), palm: DOWN, rate: 16 });
            f.reach(hand === 'R' ? 'L' : 'R', W(hand === 'R' ? -0.3 * side : 0.3 * side, 0.8, 0.16, v3), { dir: p.dir(0, -0.3, 1, v2), palm: DOWN, rate: 10 });
            f.bow = 0.16;
          });
          yield* p.tween(0.4, (u) => {
            const z = -0.18 + 0.14 * Math.sin(u * Math.PI);
            f.reach('R', W(-0.16, 0.95, z, v1), { dir: p.dir(0, 0.2, 1, v2), palm: DOWN, rate: 20 }); f.reach('L', W(0.16, 0.95, z, v3), { dir: p.dir(0, 0.2, 1, v2), palm: DOWN, rate: 20 });
            f.bow = 0.12 + 0.08 * Math.sin(u * Math.PI);
          });
          if (side > 0) c.sfx('loom', p.pos.x, p.pos.z, 0.32);
        }
        if (n % 10 === 9) {
          f.reach('R', null); f.reach('L', null);
          yield* p.tween(1.2, (u) => { f.bow = lerp(0.12, -0.02, u); });
          f.lookAt(elder.here ? v4.set(elder.pos.x, elder.pos.y + 1.2, elder.pos.z) : null);
          yield* p.wait(rnd(2.5, 4.5));
          f.lookAt(null);
        }
      }
    },
    listen: listen('neighbor'),
  }, [pt(door('b'))]);
  neighbor.chatty = 0.75;
  tends.push(() => { const w = kit.who('farmwife'); if (!(neighbor.here && neighbor.act === 'feed') && !(w?.here && w.act === 'feed')) folk.feedAt = null; if (!neighbor.here) { V.visit = 0; V.offer = null; V.talk = false; } if (!kit.who('carpenter2')?.here) HAND.waiting = false; if (!elder.here || elder.act !== 'go') GO.on[0] = false; const e2 = folk.people.find((q) => q.id === 'elder2')!; if (!e2.here) GO.on[1] = false; });

  /** 浣衣女：清早跪在溪边的石板上，一下一下地捣，再探身到水里漂 */
  const bat = P.washBat(), cloth = P.washCloth();
  bat.visible = cloth.visible = false; group.add(cloth);
  const washer = add('washer', 'washer', {
    *wash(p, c) {
      const f = p.fig;
      yield* p.go(WASH, 0.9, WASH.way);
      const up = p.liftTo(WASH.y);
      p.pose('kneel'); p.seated = true;
      if (p.snapNow) p.lift = up; else yield* p.tween(0.8, (k) => { p.lift = up * k; });
      p.hold(cloth, 'world');
      const slab = new THREE.Vector3(WASH.x + Math.sin(WASH.yaw) * 0.53, WASH.y + 0.03, WASH.z + Math.cos(WASH.yaw) * 0.53);
      p.rest = () => { f.reach('R', null); f.reach('L', null); f.bow = 0.05; };
      for (;;) {
        // 捣：左手按着衣，右手举杵落下
        p.hold(bat, 'R'); cloth.position.copy(slab); cloth.rotation.set(0, 0.3, 0);
        for (let n = 0, N = 6 + Math.floor(R() * 5); n < N; n++) {
          yield* p.tween(0.42, (k) => { f.bow = 0.34 - 0.1 * k; f.reach('L', v1.copy(slab).add(p.dir(0.16, 0.03, 0, v2)), { dir: p.dir(-0.3, 0, 1, v3), palm: DOWN, rate: 12 }); f.reach('R', p.loc(-0.2, lerp(0.3, 0.74, k), 0.3, v4), { dir: p.dir(0, lerp(0.2, 0.9, k), lerp(1, 0.4, k), v5), rate: 14 }); });
          yield* p.tween(0.14, (k) => { f.bow = 0.24 + 0.12 * k; f.reach('R', p.loc(-0.2 + 0.1 * k, lerp(0.74, 0.2, k), lerp(0.3, 0.36, k), v4), { dir: p.dir(0.2, lerp(0.9, -0.1, k), 1, v5), rate: 40 }); });
          c.sfx('pound', p.pos.x, p.pos.z, 0.5 + 0.3 * R());
          yield* p.wait(0.16);
        }
        bat.visible = false;
        // 漂：两手攥着衣探到水里，来回摆几下；拧一拧
        for (let t = 0; t < 5.5; t += p.dt) {
          const k = Math.min(1, t / 0.9) * Math.min(1, (5.5 - t) / 0.9), sw = 0.14 * Math.sin(t * 3.2);
          f.bow = 0.36 + 0.5 * k;
          cloth.position.copy(p.loc(sw, lerp(0.05, -0.16, k), lerp(0.56, 0.94, k), v1)); cloth.rotation.y = 0.3 + sw * 3;
          f.reach('R', v2.copy(cloth.position).add(p.dir(-0.08, 0.03, 0, v3)), { dir: p.dir(0.2, -0.5, 1, v4), palm: DOWN, rate: 12 });
          f.reach('L', v2.copy(cloth.position).add(p.dir(0.08, 0.03, 0, v3)), { dir: p.dir(-0.2, -0.5, 1, v4), palm: DOWN, rate: 12 });
          if (t > 1 && t < 1 + p.dt * 1.5) c.sfx('water', p.pos.x, p.pos.z + 0.8, 0.4);
          yield;
        }
        f.reach('L', null); f.reach('R', null);
        yield* p.tween(1.0, (k) => { f.bow = 0.36 * (1 - k); });
        yield* p.wait(rnd(1, 2.5));
      }
    },
    pick: pickAct(1), sun: sunAct(2),
    listen: listen('washer'),
  }, [pt(door('b'))]);
  washer.chatty = 0.6;

  // ———————————————————————— 木匠 ————————————————————————
  const hammer = P.hammer(), plane = P.planeTool(), carried = P.plank(2.0);
  /** 递板：徒弟扛着板到了桥上、师傅正跪在那里钉，就等师傅起身来接（waiting）；接过去了 taken */
  const HAND = { waiting: false, taken: false };
  hammer.visible = plane.visible = carried.visible = false;
  group.add(plane);
  const SH = SAWHORSE.at;
  const plane2 = P.planeTool(), board = P.plank(1.6);
  plane2.visible = board.visible = false;
  /** 雨天：木工凳上架一块料（顺着凳），师傅站在凳南头往北推刨，徒弟在北头侧着身扶着 */
  const benchBoard = (p: Person) => { const B = D_FRONT.bench; p.hold(board, 'world'); board.position.set(B.x, D_FRONT.benchTop + 0.02, B.z); board.rotation.set(0, B.yaw, 0); };
  const carpenter1 = add('carpenter1', 'carpenter1', {
    /** 刨板：站在木马上那块板的一头，两手按着刨往前推；刨一阵，上桥去跪着钉几锤 */
    *work(p, c) {
      const f = p.fig;
      for (;;) {
        // —— 刨 ——
        yield* p.go(SH, 1.0, p.pos.distanceTo(v1.set(NAIL.x, p.pos.y, NAIL.z)) < 2 ? [pt(BRIDGE_END)] : undefined);
        p.pose('stand'); p.hold(plane, 'world');
        const gy = footY(SH.x, SH.z) + SAWHORSE.top + 0.03, fx = Math.sin(SH.yaw), fz = Math.cos(SH.yaw);
        const push = (u: number) => {
          const d = 0.3 + 0.36 * u, x = SH.x + fx * d, z = SH.z + fz * d;
          plane.position.set(x, gy, z); plane.rotation.set(0, SH.yaw, 0);
          f.reach('R', v1.set(x - fz * 0.075, gy + 0.075, z + fx * 0.075), { dir: p.dir(0.2, -0.2, 1, v2), palm: DOWN, rate: 18 });
          f.reach('L', v3.set(x + fz * 0.075 + fx * 0.06, gy + 0.075, z - fx * 0.075 + fz * 0.06), { dir: p.dir(-0.2, -0.2, 1, v4), palm: DOWN, rate: 18 });
          f.bow = 0.3 + 0.36 * u;
        };
        p.rest = () => push(0);
        for (let n = 0, N = 6 + Math.floor(R() * 4); n < N; n++) {
          c.sfx('plane', p.pos.x, p.pos.z, 0.5 + 0.2 * R());
          yield* p.tween(0.85, (u) => push(u));
          yield* p.tween(0.6, (u) => push(1 - u));
        }
        f.reach('L', null); f.reach('R', null); f.bow = 0; p.rest = null;
        yield* p.wait(1.2);
        // —— 钉 ——
        yield* p.go(NAIL, 1.0, [pt(BRIDGE_END)]);
        p.pose('crouch'); p.seated = true; p.hold(hammer, 'R');
        const up = () => f.reach('R', p.loc(-0.17, 0.78, 0.3, v1), { dir: p.dir(0, 0.9, 0.45, v2), rate: 9 });
        p.rest = up;
        for (let n = 0; n < 4; n++) {
          f.reach('L', p.loc(0.14, 0.08, 0.5, v3), { dir: p.dir(0, -0.2, 1, v4), palm: DOWN });
          for (let k = 0; k < 3 + (n % 2); k++) {
            yield* p.tween(0.42, up);
            yield* p.tween(0.13, (u) => f.reach('R', p.loc(-0.12, lerp(0.78, 0.26, u), lerp(0.3, 0.44, u), v1), { dir: p.dir(0, lerp(0.9, -0.25, u), lerp(0.45, 0.95, u), v2), rate: 40 }));
            c.sfx('hammer', p.pos.x, p.pos.z, 0.6 + 0.35 * R());
            yield* p.wait(0.1);
          }
          yield* during(p.wait(rnd(0.8, 1.8)), up);
          // 徒弟扛着板等在跟前：站起来转过身，两手托住板接过来，弯腰放在桥面上
          const ap = kit.who('carpenter2');
          if (HAND.waiting && ap?.here) {
            f.reach('L', null); hammer.visible = false; p.pose('stand'); p.seated = false;
            yield* p.face(Math.atan2(ap.pos.x - p.pos.x, ap.pos.z - p.pos.z));
            yield* p.tween(1.1, () => { carried.getWorldPosition(v4); const ax = Math.sin(ap.yaw) * 0.5, az = Math.cos(ap.yaw) * 0.5; f.reach('R', v1.set(v4.x - ax, v4.y - 0.02, v4.z - az), { dir: p.dir(-0.3, 0.3, 0.9, v2), palm: UPV, rate: 8 }); f.reach('L', v3.set(v4.x + ax * 0.2, v4.y - 0.02, v4.z + az * 0.2), { dir: p.dir(0.3, 0.3, 0.9, v2), palm: UPV, rate: 8 }); });
            HAND.taken = true; HAND.waiting = false; carried.visible = false;
            yield* p.tween(1.1, (u) => { f.bow = 0.6 * Math.sin(u * Math.PI); });
            f.reach('L', null); f.reach('R', null);
            yield* p.face(NAIL.yaw);
            p.pose('crouch'); p.seated = true; p.hold(hammer, 'R');
          }
        }
        f.reach('L', null); f.reach('R', null); hammer.visible = false; p.rest = null;
        p.pose('stand'); p.seated = false;
        yield* p.wait(1.0);
      }
    },
    *lunch(p) { yield* p.go(WRIGHT_REST[0], 1.0); yield* p.sit(0, 'lap'); yield* p.forever(() => undefined); },
    *shed(p, c) {
      const f = p.fig, gy = D_FRONT.benchTop + 0.05;
      yield* p.go(D_FRONT.plane, 0.9);
      benchBoard(p); p.pose('stand'); p.hold(plane2, 'world');
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const push = (u: number) => {
        const d = 0.45 + 0.75 * u, x = p.pos.x + fx * d, z = p.pos.z + fz * d;
        plane2.position.set(x, gy, z); plane2.rotation.set(0, p.yaw, 0);
        f.reach('R', v1.set(x - fz * 0.075, gy + 0.075, z + fx * 0.075), { dir: p.dir(0.2, -0.2, 1, v2), palm: DOWN, rate: 18 });
        f.reach('L', v3.set(x + fz * 0.075 + fx * 0.06, gy + 0.075, z - fx * 0.075 + fz * 0.06), { dir: p.dir(-0.2, -0.2, 1, v4), palm: DOWN, rate: 18 });
        f.bow = 0.3 + 0.32 * u;
      };
      p.rest = () => push(0);
      for (;;) {
        for (let n = 0, M = 6 + Math.floor(R() * 4); n < M; n++) { c.sfx('plane', p.pos.x, p.pos.z, 0.45); yield* p.tween(0.9, (u) => push(u)); yield* p.tween(0.6, (u) => push(1 - u)); }
        f.reach('L', null); f.reach('R', null); f.bow = 0;
        yield* p.wait(rnd(2, 4));
      }
    },
    listen: listen('carpenter1'),
  }, [pt(door('d'))]);
  carpenter1.chatty = 0.3;
  const carpenter2 = add('carpenter2', 'carpenter2', {
    /** 扛板：到板垛弯腰扛起一块，送到桥上放下 */
    *work(p) {
      const f = p.fig;
      for (;;) {
        yield* p.go(STACK, 1.0, p.pos.distanceTo(v1.set(CARRY_TO.x, p.pos.y, CARRY_TO.z)) < 2 ? [pt(BRIDGE_END)] : undefined);
        p.pose('stand');
        yield* p.tween(1.2, (k) => { f.bow = 0.8 * k; });
        p.hold(carried, 'chest'); carried.position.set(-0.17, 0.2, 0.06); carried.rotation.set(-0.1, 0, 0);
        const steady = () => f.reach('R', p.loc(-0.2, 1.39, 0.2, v1), { dir: p.dir(0.5, 0.6, 0.6, v2), palm: p.dir(0.4, -0.9, 0, v3), rate: 12 });
        p.rest = steady;
        yield* p.tween(1.3, (k) => { f.bow = 0.8 * (1 - k); steady(); });
        yield* during(p.go(CARRY_TO, 0.92, [pt(BRIDGE_END)]), steady);
        // 师傅正跪在跟前钉板：站着等他起身来接（等不来就自己放下）
        const mst = kit.who('carpenter1');
        HAND.taken = false;
        if (mst?.here && mst.act === 'work' && mst.seated && Math.hypot(mst.pos.x - p.pos.x, mst.pos.z - p.pos.z) < 3.5) {
          HAND.waiting = true;
          for (let t = 0; t < 14 && HAND.waiting; t += p.dt) { steady(); f.lookAt(v4.set(mst.pos.x, mst.pos.y + 0.7, mst.pos.z)); yield; }
          HAND.waiting = false; f.lookAt(null);
        }
        if (!HAND.taken) {
          yield* p.tween(1.1, (k) => { f.bow = 0.75 * k; steady(); });
          carried.visible = false; f.reach('R', null); p.rest = null;
          yield* p.tween(1.1, (k) => { f.bow = 0.75 * (1 - k); });
        } else { f.reach('R', null); p.rest = null; yield* p.wait(0.8); }
        // 直直腰，捶两下背
        yield* p.tween(1.6, (k) => f.reach('R', p.loc(-0.12, 0.98 + 0.03 * Math.sin(k * 12), -0.12, v1), { dir: DOWN, rate: 10 }));
        f.reach('R', null);
        yield* p.wait(rnd(1, 2.5));
      }
    },
    *lunch(p) { yield* p.go(WRIGHT_REST[1], 1.0); yield* p.sit(); yield* p.forever(() => undefined); },
    *shed(p) {
      const f = p.fig, B = D_FRONT.bench, gy = D_FRONT.benchTop + 0.04;
      yield* p.go(D_FRONT.hold, 0.9);
      p.pose('stand');
      p.rest = () => { f.reach('R', null); f.reach('L', null); };
      const m = kit.who('carpenter1');
      yield* p.forever((t) => {
        const ex = B.x - Math.sin(B.yaw) * 0.72, ez = B.z - Math.cos(B.yaw) * 0.72;
        f.reach('L', v1.set(ex + Math.cos(B.yaw) * 0.08, gy, ez - Math.sin(B.yaw) * 0.08), { dir: DOWN, palm: DOWN, rate: 10 });
        f.reach('R', v3.set(ex - Math.cos(B.yaw) * 0.08, gy, ez + Math.sin(B.yaw) * 0.08), { dir: DOWN, palm: DOWN, rate: 10 });
        f.bow = 0.3; f.lookAt(m?.here && Math.sin(t * 0.3) > 0.5 ? v4.set(m.pos.x, m.pos.y + 1.3, m.pos.z) : v4.set(ex, gy, ez));
      });
    },
    listen: listen('carpenter2'),
  }, [pt(door('d'))]);
  carpenter2.chatty = 0.2;

  /** 舂米人：扛着谷袋往来于晒场与水碓之间；到了碓屋里蹲着照看一阵 */
  const sackM = P.sack();
  sackM.visible = false;
  const yardAt = { x: SITE.more.dryYard.x + 2.9, z: SITE.more.dryYard.z + 3.2, yaw: -2.3 };
  const millerLoad = P.waterLoad();
  millerLoad.visible = false;
  const miller = add('miller', 'miller', {
    water: waterAct(kit, WELL, millerLoad, E_FRONT.vat, true),
    listen: listen('miller'),
    *mill(p) {
      const f = p.fig;
      const shoulder = () => { p.hold(sackM, 'chest'); sackM.position.set(-0.16, 0.24, 0.02); sackM.rotation.set(0.12, 0, 0); };
      const steady = () => f.reach('R', p.loc(-0.2, 1.4, 0.16, v1), { dir: p.dir(0.5, 0.6, 0.6, v2), palm: p.dir(0.4, -0.9, 0, v3), rate: 12 });
      const snapped = p.snap;
      if (!snapped) {
        // 在晒场上扛起一袋，送去水碓
        yield* p.go(yardAt, 1.0);
        yield* p.tween(1.2, (k) => { f.bow = 0.8 * k; });
        shoulder(); p.rest = steady;
        yield* p.tween(1.2, (k) => { f.bow = 0.8 * (1 - k); steady(); });
        yield* during(p.go(MILL.at, 1.0, [MILL.way[1], MILL.way[0]]), steady);
        yield* p.tween(1.1, (k) => { f.bow = 0.7 * k; steady(); });
        sackM.visible = false; f.reach('R', null); p.rest = null; f.bow = 0;
      } else yield* p.go(MILL.at, 1.0);
      // 碓屋里：蹲下拨一拨臼里的谷，站起来看一阵
      for (let n = 0; n < 2; n++) {
        p.pose('crouch'); p.seated = true;
        for (let t = 0, T = rnd(5, 8); t < T; t += p.dt) { f.reach('R', p.loc(-0.1 + 0.1 * Math.sin(t * 2.2), 0.3, 0.5, v1), { dir: p.dir(0, -0.6, 0.8, v2), rate: 8 }); f.lookAt(p.loc(0, 0.2, 0.7, v3)); yield; }
        f.reach('R', null); f.lookAt(null); p.pose('stand', 'sleeve'); p.seated = false;
        yield* p.wait(rnd(6, 11));
        p.pose('stand', 'free');
      }
      // 扛一袋舂好的回去
      yield* p.tween(1.2, (k) => { f.bow = 0.8 * k; });
      shoulder(); p.rest = steady;
      yield* p.tween(1.2, (k) => { f.bow = 0.8 * (1 - k); steady(); });
      yield* during(p.go({ x: MILL.way[1][0], z: MILL.way[1][1] }, 1.0, [MILL.way[0]], true), steady);
      yield* during(p.go(yardAt, 1.0), steady);
      yield* p.tween(1.1, (k) => { f.bow = 0.7 * k; steady(); });
      sackM.visible = false; f.reach('R', null); p.rest = null;
      yield* p.tween(1.0, (k) => { f.bow = 0.7 * (1 - k); });
      yield* p.wait(rnd(8, 16));
    },
  }, [pt(door('e'))]);
  miller.chatty = 0.5;

  // ———————————————————————— 渡口：渔父与樵夫 ————————————————————————
  const rod = P.fishingRod(), line = P.lineMesh(0.003), bob = P.floatBob(), wood = P.firewood();
  rod.obj.visible = line.visible = bob.visible = wood.visible = false;
  group.add(line, bob);
  const Q = { chat: 0 };
  const WOODCUTTER = woodcutterSpot(), woodAt = { x: WOODCUTTER.x - Math.cos(WOODCUTTER.yaw) * 0.95, z: WOODCUTTER.z + Math.sin(WOODCUTTER.yaw) * 0.95 };
  const fisher = add('fisher', 'fisher', {
    /** 垂钓：坐在船尾的横板上，竿搁在膝上伸出去；浮子一沉就提竿，再甩回去 */
    *fish(p, c) {
      const f = p.fig, S = FERRY.seat;
      yield* p.bench(S, 0.9, undefined, 'free', true);
      p.hold(rod.obj, 'R'); p.hold(line, 'world'); p.hold(bob, 'world');
      const fx = S.x + Math.sin(S.yaw) * 3.3, fz = S.z + Math.cos(S.yaw) * 3.3, wy = waterAt(fx, fz)?.y ?? footY(fx, fz) + 0.1, tip = new THREE.Vector3();
      let lift = 0, dip = 0;
      const hold = (t: number) => {
        f.reach('R', p.loc(-0.2, 0.6 + 0.3 * lift, 0.34 - 0.06 * lift, v1), { dir: p.dir(-0.03, 0.34 + 0.5 * lift, 0.94 - 0.3 * lift, v2), palm: p.dir(1, 0.3, 0, v3), rate: 9 });
        rod.obj.localToWorld(tip.copy(rod.tip));
        // 浮子：平时浮在水上轻轻地动；提竿时被线带起来
        const by = wy + 0.012 * Math.sin(t * 2.1) - 0.05 * dip;
        bob.position.set(lerp(fx, tip.x, lift * 0.75), lerp(by, tip.y - 1.5, lift), lerp(fz, tip.z, lift * 0.75));
        span(line.matrix, tip.x, tip.y, tip.z, bob.position.x, bob.position.y + 0.05, bob.position.z); line.matrixWorldNeedsUpdate = true;
        if (Q.chat > 0) f.lookAt(v4.copy(woodcutter.pos).setY(woodcutter.pos.y + 0.75)); else f.lookAt(v4.set(fx, wy, fz));
      };
      p.rest = () => hold(c.t);
      for (let T = 0; ; ) {
        for (let t = 0, W = rnd(22, 45); t < W; t += p.dt) { T += p.dt; lift = 0; dip = 0; hold(T); yield; }
        // 咬钩了
        for (let t = 0; t < 1.4; t += p.dt) { T += p.dt; dip = Math.max(0, Math.sin(t * 9)); hold(T); yield; }
        c.sfx('plop', fx, fz, 0.3);
        yield* p.tween(0.7, (k) => { lift = k; dip = 0; hold(T); });
        yield* during(p.wait(1.6), () => hold(T));
        yield* p.tween(1.3, (k) => { lift = 1 - k; hold(T); });
      }
    },
    /** 近午：站在晒网架前补网，两手一上一下地穿梭 */
    *net(p, c) {
      const f = p.fig;
      yield* p.go(NET, 0.9, undefined, true);
      p.pose('stand'); p.curious = true;
      p.rest = () => { f.reach('R', null); f.reach('L', null); };
      yield* p.forever((t) => {
        f.reach('L', p.loc(0.14, 1.16 + 0.03 * Math.sin(t * 0.9), 0.4, v1), { dir: p.dir(0, 0.6, 0.8, v2), rate: 8 });
        f.reach('R', p.loc(-0.12 + 0.07 * Math.sin(t * 2.6), 1.1 + 0.09 * Math.sin(t * 2.6 + 1.2), 0.4, v3), { dir: p.dir(0.3, 0.4, 0.85, v4), rate: 12 });
        f.lookAt(p.loc(0, 1.12, 0.5, v5));
        if (Math.floor(t / 9) !== Math.floor((t - p.dt) / 9)) c.sfx('net', p.pos.x, p.pos.z, 0.3);
      });
    },
  }, [pt(FERRY.cabin)]);
  fisher.chatty = 0.4;
  /** 渔火：天黑了渔父钻进篷里，船头挑起一盏灯（到二更天吹灭） */
  const fishLamp = P.lantern();
  fishLamp.visible = false; group.add(fishLamp);
  fishLamp.position.set(FERRY.cabin.x + Math.sin(FERRY.boat.yaw) * 0.95, FERRY.floorY + 1.18, FERRY.cabin.z + Math.cos(FERRY.boat.yaw) * 0.95); fishLamp.rotation.set(Math.PI, 0, 0);
  tends.push((c) => { const ss = SUN[c.season][1]; fishLamp.visible = !fisher.present && c.hour >= ss + 0.3 && c.hour < 22; if (fishLamp.visible) fishLamp.rotation.z = 0.05 * Math.sin(c.t * 0.8); });
  const woodcutter: Person = add('woodcutter', 'woodcutter', {
    /** 挑着柴来，放下担子，在船边的岸上坐下，隔着水与渔父说话 */
    *rest(p) {
      const f = p.fig;
      if (!p.snap) {
        p.hold(wood, 'chest'); wood.position.set(-0.15, 0.2, 0.02); wood.rotation.set(0, Math.PI / 2, 0);
        const steady = () => f.reach('R', p.loc(-0.17, 1.37, 0.24, v1), { dir: p.dir(0.4, 0.5, 0.75, v2), palm: DOWN, rate: 12 });
        yield* during(p.go({ x: woodAt.x, z: woodAt.z, yaw: WOODCUTTER.yaw + 1.4 }, 0.95), steady);
        yield* p.tween(1.2, (k) => { f.bow = 0.6 * k; steady(); });
        f.reach('R', null);
      }
      p.hold(wood, 'world'); wood.position.set(woodAt.x, footY(woodAt.x, woodAt.z) + 0.4, woodAt.z); wood.rotation.set(0, WOODCUTTER.yaw + 0.5, 0);
      f.bow = 0;
      yield* p.go(WOODCUTTER, 0.8);
      yield* p.sit();
      p.rest = () => f.reach('R', null);
      for (;;) {
        Q.chat = 0;
        for (let t = 0, T = rnd(5, 10); t < T; t += p.dt) { f.lookAt(null); yield; }
        // 说话：转头看着渔父，抬手比划
        Q.chat = 1;
        for (let t = 0, T = rnd(4, 7); t < T; t += p.dt) {
          f.lookAt(v3.copy(fisher.pos).setY(fisher.pos.y + 0.8));
          f.reach('R', p.loc(-0.24 + 0.05 * Math.sin(t * 2.3), 0.52 + 0.07 * Math.sin(t * 3.1), 0.36, v1), { dir: p.dir(0.3, 0.5, 0.8, v2), palm: UPV, rate: 6 });
          yield;
        }
        f.reach('R', null);
      }
    },
  }, [[78, 192]]);
  tends.push(() => { if (!woodcutter.here) Q.chat = 0; });

  // ———————————————————————— 牧童与水牛 ————————————————————————
  const fluteM = P.flute();
  fluteM.visible = false;
  const herdboy = add('herdboy', 'herdboy', {
    /** 横坐在牛背上，由着牛在草地上来回走、停下吃草、踩进浅水里；隔一阵把短笛凑到嘴边吹一段 */
    *herd(p, c) {
      const f = p.fig, s = p.scale, a = HERD[0], b = HERD[1];
      buf.present = true;
      // 草地当中有个草垛：落脚的地方离它远些；要到垛的另一侧去，先绕到垛北边那一点
      const hay = HERD_HAY, clearOfHay = (x: number, z: number) => Math.hypot(x - hay.x, z - hay.z) > 4;
      const pick = (): [number, number] => { for (;;) { const u = rnd(0.05, 0.95), x = lerp(a[0], b[0], u), z = lerp(a[1], b[1], u) + rnd(-1.5, 1.5); if (clearOfHay(x, z)) return [x, z]; } };
      if (p.snap || !buf.parts.mesh.visible) { const [x, z] = pick(); buf.put(x, z, Math.PI / 2); }
      p.snap = false; p.snapNow = true;
      f.setSeat({ h: 0.44, cz: -0.3 }); p.pose('bench', 'lap'); p.seated = true;
      p.hold(fluteM, 'R');
      const ride = () => {
        buf.back(v1);
        p.yaw = buf.yaw + Math.PI / 2;
        p.pos.x = v1.x + Math.sin(p.yaw) * 0.3 * s; p.pos.z = v1.z + Math.cos(p.yaw) * 0.3 * s;
        p.lift = (v1.y - 0.44 * s - footY(p.pos.x, p.pos.z)) / s;
      };
      let blow = 0, next = rnd(4, 9);
      const play = () => {
        // 吹笛：笛横在嘴边，两手一左一右按着孔
        next -= p.dt;
        if (blow <= 0 && next < 0) { blow = rnd(7, 11); c.sfx('flute', p.pos.x, p.pos.z, 0.6); }
        if (blow > 0) {
          blow -= p.dt;
          f.joints.head.getWorldPosition(v2).add(p.dir(0, -0.085, 0.1, v3));
          f.reach('R', v4.copy(v2).add(p.dir(-0.11, 0, 0, v3)), { dir: p.dir(1, 0.05, 0.1, v5), palm: p.dir(0, 0, -1, v3), rate: 9 });
          f.reach('L', v4.copy(v2).add(p.dir(0.1, 0, 0.01, v3)), { dir: p.dir(-1, 0.1, 0.2, v5), palm: p.dir(0, 0, -1, v3), rate: 9 });
          if (blow <= 0) { next = rnd(12, 24); f.reach('R', null); f.reach('L', null); }
        }
      };
      p.rest = () => { ride(); buf.halt(); };
      /** 骑着牛走到一处（要过草垛那一线，先到垛北） */
      const rideTo = function* (tx: number, tz: number, speed: number, each: () => void): Script {
        if ((buf.x - hay.x) * (tx - hay.x) < 0) for (let t = 0; buf.toward(hay.x, hay.z - 3.6, speed, p.dt) > 1.2 && t < 90; t += p.dt) { ride(); each(); yield; }
        for (let t = 0; buf.toward(tx, tz, speed, p.dt) > 0.9 && t < 150; t += p.dt) { ride(); each(); yield; }
      };
      // 散的时候：骑着牛朝西头的桃林走远
      p.leave = function* (): Script { yield* rideTo(a[0] - 30, a[1] - 5.5, 0.62, () => undefined); buf.present = false; p.vanish(); };
      ride();
      for (;;) {
        // 走一段：多半沿着草地，有时踩到溪边的浅水里站着
        const wade = R() < 0.3;
        let [tx, tz] = pick();
        if (wade) { const st = streamAt(tx, tz - 10); let z = tz; while (z > tz - 16 && !(waterAt(tx, z)?.depth)) z -= 0.25; tz = z - Math.min(0.5, st.w * 0.2); }
        yield* rideTo(tx, tz, 0.46, play);
        buf.halt(); buf.graze = wade ? 0 : 1;
        for (let t = 0, T = rnd(9, 20); t < T; t += p.dt) { ride(); play(); yield; }
        buf.graze = 0;
        if (R() < 0.2) c.sfx('ox', buf.x, buf.z, 0.35);
      }
    },
  }, [[HERD[0][0] - 30, HERD[0][1] - 5.5]]);
  tends.push(() => { if (!herdboy.present) buf.present = false; });

  // ———————————————————————— 酒家：掌柜与酒客 ————————————————————————
  const pot = P.winePot(), ragM = P.rag(), wineBowl = P.bowl(0.05);
  pot.visible = ragM.visible = wineBowl.visible = false;
  const tableY = () => footY(WINE.table.x, WINE.table.z) + WINE.top;
  const onTable = (lx: number, lz: number, out: THREE.Vector3) => { const c = Math.cos(WINE.table.yaw), s = Math.sin(WINE.table.yaw); return out.set(WINE.table.x + lx * c + lz * s, tableY() + 0.03, WINE.table.z - lx * s + lz * c); };
  const idleStool = P.stool();
  idleStool.visible = false;
  const keeper = add('keeper', 'keeper', {
    /** 雨天没有客：袖着手坐在门边檐下看雨 */
    *idle(p) {
      yield* sitStool(p, E_FRONT.idle, idleStool, 0.9, 'sleeve');
      yield* p.forever((t) => { p.fig.lookAt(p.loc(1.6 * Math.sin(t * 0.17), 1.3, 3, v1)); p.fig.bow = 0.04 + 0.02 * Math.sin(t * 0.5); });
    },
    /** 抹桌；有客就提壶筛酒；闲了袖着手站在桌边 */
    *serve(p, c) {
      const f = p.fig;
      yield* p.go(WINE.keeper, 0.9);
      p.pose('stand');
      p.rest = () => { f.reach('R', null); f.bow = 0; };
      for (;;) {
        p.hold(ragM, 'R'); pot.visible = false;
        for (let t = 0, T = rnd(5, 9); t < T; t += p.dt) { f.bow = 0.26; f.reach('R', onTable(-0.26 + 0.14 * Math.cos(t * 3.1), 0.02 + 0.12 * Math.sin(t * 3.1), v1), { dir: p.dir(0, -0.3, 1, v2), palm: DOWN, rate: 14 }); yield; }
        f.reach('R', null); f.bow = 0; ragM.visible = false;
        if (drinker.here && drinker.act === 'drink') {
          // 筛酒：提壶凑到客人碗上，一倾
          p.hold(pot, 'R');
          yield* p.tween(1.0, (k) => { f.bow = 0.2 * k; f.reach('R', onTable(WINE.bowl[0] - 0.1, WINE.bowl[1], v1).setY(tableY() + 0.3), { dir: p.dir(0.2, 0.9, 0.3, v2), rate: 8 }); });
          c.sfx('pour', WINE.table.x, WINE.table.z, 0.4);
          yield* p.tween(1.6, (k) => { f.reach('R', onTable(WINE.bowl[0] - 0.1, WINE.bowl[1], v1).setY(tableY() + 0.27), { dir: p.dir(0.5 + 0.4 * Math.sin(k * Math.PI), 0.7, 0.3, v2), rate: 8 }); });
          f.reach('R', null); f.bow = 0;
          yield* p.wait(0.8);
          pot.visible = false;
        }
        p.pose('stand', 'sleeve');
        for (let t = 0, T = rnd(6, 12); t < T; t += p.dt) { f.lookAt(drinker.here ? v1.copy(drinker.pos).setY(drinker.pos.y + 1.0) : null); yield; }
        f.lookAt(null); p.pose('stand', 'free');
        yield* p.wait(0.5);
      }
    },
  }, [pt(WINE.door)]);
  const drinker: Person = add('drinker', 'drinker', {
    /** 坐在凳上，端起碗抿一口，放下，看着路 */
    *drink(p, c) {
      const f = p.fig;
      yield* p.bench(WINE.drinker, 0.9);
      p.hold(wineBowl, 'world');
      const rest = onTable(WINE.bowl[0], WINE.bowl[1], new THREE.Vector3());
      wineBowl.position.copy(rest).setY(tableY());
      p.rest = () => f.reach('R', null);
      for (;;) {
        for (let t = 0, T = rnd(7, 14); t < T; t += p.dt) { f.lookAt(keeper.here && Math.sin(t * 0.4) > 0.3 ? v1.copy(keeper.pos).setY(keeper.pos.y + 1.4) : null); yield; }
        f.lookAt(null);
        yield* p.tween(0.8, () => f.reach('R', v1.copy(rest).setY(tableY() + 0.05), { dir: p.dir(0.3, 0, 1, v2), palm: p.dir(1, 0, 0, v3), rate: 9 }));
        p.hold(wineBowl, 'R'); wineBowl.position.set(0.02, 0.02, 0.05); wineBowl.rotation.set(Math.PI / 2, 0, 0);
        yield* p.tween(1.1, () => f.reach('R', f.joints.head.getWorldPosition(v1).add(p.dir(-0.02, -0.08, 0.11, v2)), { dir: p.dir(0.7, 0.55, 0, v3), palm: UPV, rate: 6 }));
        c.sfx('cup', p.pos.x, p.pos.z, 0.3);
        yield* p.wait(1.2);
        yield* p.tween(0.9, () => f.reach('R', v1.copy(rest).setY(tableY() + 0.05), { dir: p.dir(0.3, 0, 1, v2), palm: p.dir(1, 0, 0, v3), rate: 7 }));
        p.hold(wineBowl, 'world'); wineBowl.position.copy(rest).setY(tableY()); wineBowl.rotation.set(0, 0, 0);
        f.reach('R', null);
      }
    },
  }, [EAST]);

  // ———————————————————————— 货郎 ————————————————————————
  const load = P.peddlerLoad(), drum = P.rattle();
  load.visible = drum.visible = false;
  let rounds = 0;
  const peddler = add('peddler', 'peddler', {
    /** 挑着担、摇着拨浪鼓自东头沿村路走来，在茶亭的凳上歇脚（孩子们围过来），歇够了挑起担子往西去；过一阵再来 */
    *round(p, c) {
      const f = p.fig;
      const shoulder = () => { p.hold(load, 'chest'); load.position.set(-0.15, 0.21, 0.02); load.rotation.set(0, Math.PI / 2, 0); };
      let shake = 0;
      const carry = () => {
        // 左手扶着担，右手举着鼓，走几步摇一阵
        f.reach('L', p.loc(0.17, 1.36, 0.26, v1), { dir: p.dir(-0.4, 0.5, 0.75, v2), palm: DOWN, rate: 12 });
        shake -= p.dt;
        if (shake < -2.6) { shake = 1.1; c.sfx('rattle', p.pos.x, p.pos.z, 0.6); }
        const k = shake > 0 ? Math.sin(shake * 26) : 0;
        f.reach('R', p.loc(-0.26, 1.18, 0.3, v3), { dir: p.dir(0.5 * k, 1, 0.2, v4), palm: p.dir(k, 0, 1, v5), rate: 14 });
      };
      /** 担子此刻是不是卸在亭口 */
      let down = false;
      /** 挑起担子往西走远（担子若卸在亭口，先走过去挑上） */
      const depart = function* (): Script {
        if (down) {
          p.hold(load, 'world');
          yield* p.go(TEA.stand, 0.8, p.seated ? [TEA.seat.from!, pt(TEA.inn)] : undefined, true);
          p.pose('stand');
          yield* p.tween(1.2, (k) => { f.bow = 0.5 * Math.sin(k * Math.PI); });
          down = false;
        }
        shoulder(); p.hold(drum, 'R'); p.rest = carry;
        yield* during(p.go({ x: WEST[0], z: WEST[1] }, 1.0), carry);
      };
      // 头一回、又没人看着：已经歇在亭里了；此后每一回都是自东头走来
      const walkIn = !p.snap || rounds > 0;
      rounds++;
      // 时候到了（或者落雨了）：挑上担子走，不是空着手回家
      p.leave = function* (): Script { yield* depart(); p.vanish(); };
      if (walkIn) {
        p.snap = false;
        p.place({ x: EAST[0], z: EAST[1], yaw: -Math.PI / 2 });
        p.pose('stand'); shoulder(); p.hold(drum, 'R');
        p.rest = carry;
        yield* during(p.go(TEA.stand, 1.0), carry);
        yield* p.tween(1.2, (k) => { f.bow = 0.5 * k; carry(); });
        f.reach('L', null); f.reach('R', null); f.bow = 0; p.rest = null;
      }
      // 担子卸在亭口，人进亭坐在凳上
      p.hold(load, 'world'); load.position.set(TEA.load.x, footY(TEA.load.x, TEA.load.z) + 0.78, TEA.load.z); load.rotation.set(0, TEA.load.yaw, 0); down = true;
      yield* p.bench(TEA.seat, 0.8, [pt(TEA.inn)]);
      p.hold(drum, 'R');
      PED.call = true;
      for (let t = 0, T = rnd(50, 75); t < T; t += p.dt) {
        // 举着鼓朝孩子们摇两下；擦一把汗
        const k = t % 9 < 1.2 ? Math.sin(t * 26) : 0;
        if (t % 9 < p.dt * 1.5) c.sfx('rattle', p.pos.x, p.pos.z, 0.5);
        f.reach('R', p.loc(-0.2, 1.02, 0.36, v3), { dir: p.dir(0.5 * k, 1, 0.3, v4), palm: p.dir(k, 0, 1, v5), rate: 12 });
        f.lookAt(kids[0].act === 'gather' ? v1.copy(kids[Math.floor(t / 6) % 3].pos).setY(p.pos.y + 0.9) : null);
        yield;
      }
      PED.call = false; f.lookAt(null); f.reach('R', null);
      // 挑起担子接着往西走；走远了，过一阵再从东头来
      yield* depart();
      yield* p.away(rnd(420, 660));
    },
  }, [WEST]);
  tends.push(() => { if (!peddler.here || peddler.act !== 'round') PED.call = false; if (peddler.act !== 'round') rounds = 0; });

  // ———————————————————————— 客 ————————————————————————
  const guestCup = P.bowl(0.045);
  guestCup.visible = false;
  add('guest', 'guest', {
    /** 一位读书的朋友来访：坐在院里石桌东北角的石凳上，手边一盏茶，说着话 */
    *visit(p, c) {
      const f = p.fig, T = SITE.table, ty = footY(T.x, T.z) + 0.72;
      yield* p.bench(GUEST, 0.95, GUEST_WAY);
      const rest = new THREE.Vector3(T.x + 0.3, ty, T.z - 0.3);
      p.hold(guestCup, 'world'); guestCup.position.copy(rest); guestCup.rotation.set(0, 0, 0);
      p.rest = () => f.reach('R', null);
      for (;;) {
        // 说话：手略抬一抬；看看对面、看看梅
        for (let t = 0, W = rnd(8, 16); t < W; t += p.dt) {
          const g = Math.max(0, Math.sin(t * 0.9)) ** 2;
          f.reach('R', p.loc(-0.2, 0.62 + 0.1 * g, 0.32 + 0.05 * g, v1), { dir: p.dir(0.2, 0.4, 0.9, v2), palm: UPV, rate: 5 });
          f.lookAt(Math.sin(t * 0.17) > 0.4 ? v3.set(SITE.plum.x, ty + 1.2, SITE.plum.z) : v3.set(T.x - 0.69, ty + 0.6, T.z + 0.69));
          yield;
        }
        yield* p.tween(0.8, () => f.reach('R', v1.copy(rest).setY(ty + 0.05), { dir: p.dir(0.3, 0, 1, v2), palm: p.dir(1, 0, 0, v3), rate: 9 }));
        p.hold(guestCup, 'R'); guestCup.position.set(0.02, 0.02, 0.05); guestCup.rotation.set(Math.PI / 2, 0, 0);
        yield* p.tween(1.1, () => f.reach('R', f.joints.head.getWorldPosition(v1).add(p.dir(-0.02, -0.08, 0.11, v2)), { dir: p.dir(0.7, 0.55, 0, v3), palm: UPV, rate: 6 }));
        c.sfx('cup', p.pos.x, p.pos.z, 0.25);
        yield* p.wait(1.3);
        yield* p.tween(0.9, () => f.reach('R', v1.copy(rest).setY(ty + 0.05), { dir: p.dir(0.3, 0, 1, v2), palm: p.dir(1, 0, 0, v3), rate: 7 }));
        p.hold(guestCup, 'world'); guestCup.position.copy(rest); guestCup.rotation.set(0, 0, 0);
        f.reach('R', null);
      }
    },
  }, [WEST]);

  // ———————————————————————— 后添的几位（villagers.ts） ————————————————————————
  addVillagers(kit);

  folk.tend = (c) => { for (const t of tends) t(c); };
  return folk;
}
