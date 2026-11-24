/**
 * 人物与生灵：安乐窝里的村人（都在做事，不是闲坐）和鸡犬牛鸭、燕雀虫鱼。
 * 谁在哪、什么时候、做什么，写在 docs/LIFE.md；各人的日程与动作在 people.ts，位置在 spots.ts。
 *
 * 用法：
 *   const life = createLife({ q, season, sfx });  scene.add(life.group);
 *   每帧 life.update(dt, t, { hour, night, rain, snow, player, camera })；换季 life.setSeason(s)。
 *   life.blockers 交给 walk.ts 的 setDynamic（人与牛挡路；r 为 0 的是此刻不在场的）；
 *   找人说话时 life.npcs.farmer.attend(行者的位置)，说完 attend(null)。
 *   全村的名册（谁、叫什么、住哪、一天怎么过）在 src/data/folk.ts；npcs[id].act 是此刻做的那件事，doing 是人话（名册里这一步怎么说）。
 */
import * as THREE from 'three';
import type { Quality } from '../core/World';
import type { Season } from '../env/atmos';
import type { Avatar } from '../avatar/types';
import { WET, nearRoof, setSky, shelterAt } from '../avatar/gear';
import { setDynamic } from '../walk';
import { createFauna, type Fauna } from './fauna';
import { OxTeam } from './ox';
import { makeFolk } from './people';
import type { Ctx } from './person';
import { route } from './route';
import { FOLK_BY_ID, planNow, type FolkDef } from '../../data/folk';
import { SHOT_NAMES } from '../../audio/types';
import { A_FRONT, BUND, E_FRONT, MILL, MULBERRIES, OX_SHED_FRONT, REAP, SAWHORSE, SCHOOL_FRONT, STORY, TEA, VEG, WASH, WELL, door } from './spots';

export { planNow } from '../../data/folk';
export type { FolkDef, FolkPlanStep } from '../../data/folk';

export interface LifeOpts { q: Quality; season: Season; /** 出一声（名字在 docs/LIFE.md 里列出来，声音由别人做） */ sfx?(shot: string, o?: { vel?: number; x?: number; z?: number }): void }
export interface Npc {
  id: string; name: string; root: THREE.Object3D; avatar?: Avatar;
  /** 此刻在哪（世界坐标，随他走动更新） */ pos: THREE.Vector3;
  /** 此刻在不在场（夜里回家了、雨天不出门就是 false） */ present: boolean;
  /** 让他停下手里的活、转过来对着某处（给 null 就接着干自己的） */ attend(p: THREE.Vector3 | null): void;
  /** 此刻做的那件事的名字（名册 plan 里的 act；在家、正往家走是 null）。只有人有 */ readonly act?: string | null;
  /** 此刻在做什么，人话：名册里这一步的 doing；在路上是「正往某处去」，站着跟人说话是「在路上和谁说话」。只有人有 */ readonly doing?: string;
  /** 名册里的这个人（名字、称呼、身份、住哪、家里有谁、脾气、喜欢什么、日程）。只有人有 */ readonly def?: FolkDef;
  /** 远远地朝某人招一招手（停一停手里的活、转身、抬手摇两下，再接着干）。只有人有 */ wave?(p: THREE.Vector3): void;
}
export interface Life {
  group: THREE.Group;
  npcs: Record<string, Npc>;
  /** 人不能穿过去的（人和大牲口）：每帧就地更新 */ blockers: Array<{ x: number; z: number; r: number }>;
  setSeason(s: Season): void;
  update(dt: number, t: number, o: { hour: number; night: number; rain: number; snow: number; player: THREE.Vector3; camera: THREE.Camera }): void;
  /** 不是人的那些生灵（鸡犬牛羊……，见 fauna/index.ts）：做事、别的几路要用 */
  fauna?: Fauna;
  /** 村里人的日程与动作每帧花了多少毫秒（平滑过的；量性能用） */
  readonly folkMs?: number;
}

/** 声音那一路认得的名字；新添的名字在那边做出来之前先借哪一声（null 不出声） */
const KNOWN = new Set<string>(SHOT_NAMES);
/** 不照名册、临时改了的那几件事此刻怎么说 */
const OFF_PLAN: Record<string, string> = { gather: '货郎来了，跑到茶亭前围着看', noon: '还坐在埂上，等家里把饭送来', play: '和伙伴们在槐树南边的空地上玩' };
const STANDIN: Record<string, string | null> = { clapper: 'knock', sickle: 'broom', sheaf: null, flail: 'pound', winnow: null, millstone: null, dig: 'hoe', pluck: null, loom: 'knock', split: null, chop: 'hammer', whip: null, wood: 'knock', murmur: null, kidsLaugh: 'laugh', greet: null, drumrim: 'drum', bucketLift: 'bucket', pole: null };

export function createLife(o: LifeOpts): Life {
  const group = new THREE.Group();
  group.name = 'life';
  const ox = new OxTeam('ox'), buf = new OxTeam('buffalo'), folk = makeFolk(o.q, group, ox, buf);
  // 生灵（鸡犬牛羊、鸟雀虫鱼……）都在 fauna/ 里；老龟、梅上的雀下面 npcs 那里要用
  const fauna = createFauna({ q: o.q, season: o.season, ox, buf }), turtle = fauna.turtle, plum = fauna.plum;
  group.add(ox.parts.mesh, buf.parts.mesh, fauna.group);
  buf.present = false;

  // 把常走的几条路先认一遍：地势与挡路的图是现算现记的，头一回认一条远路要几十毫秒——放在开场时做，免得清早有人出门时画面顿一下
  try {
    const A = door('a'), B = door('b'), D = door('d'), E = door('e'), P = (x: number, z: number) => ({ x, z });
    for (const [a, b] of [[A, OX_SHED_FRONT], [OX_SHED_FRONT, BUND], [A, BUND], [A, MULBERRIES[0]], [A, SCHOOL_FRONT], [B, SCHOOL_FRONT], [D, SCHOOL_FRONT], [B, P(WASH.way[0][0], WASH.way[0][1])], [D, SAWHORSE.at], [E, P(MILL.way[1][0], MILL.way[1][1])], [P(149, 9), TEA.stand], [TEA.stand, P(-50, 38.8)]]) route(a.x, a.z, b.x, b.z);
    // 后添的几位常走的：挑水、麦地、菜地、去槐树下听书、东头来的人到王家门前
    for (const [a, b] of [[A, WELL.draw], [WELL.draw, E_FRONT.vat], [OX_SHED_FRONT, REAP.bund], [A, REAP.set], [A, VEG.at(0)], [A, STORY.teller], [B, STORY.teller], [D, STORY.teller], [P(149, 9), STORY.teller], [P(149, 9), A_FRONT.chat[1]]]) route(a.x, a.z, b.x, b.z);
  } catch (e) { console.warn('认路的预备没做成', e); }

  const npcs: Record<string, Npc> = {};
  for (const p of folk.people) npcs[p.id] = {
    id: p.id, name: p.name, root: p.root, avatar: p.avatar, pos: p.pos, def: FOLK_BY_ID[p.id],
    get present() { return p.here; }, attend: (v) => p.attend(v), wave: (v) => p.wave(v),
    get act() { return p.act; },
    get doing() {
      const s = planNow(p.id, c.hour, c.season, !c.fair);
      if (!p.here) return s?.doing ?? '';
      if (p.talkTo) return `站在路上和${p.talkTo.name}说话`;
      if (p.act == null) return '收了工，正往家里去';
      if (s?.act !== p.act) return OFF_PLAN[p.act] ?? s?.doing ?? '';
      return p.walking && p.trip ? `正往${s.where}去，${s.doing}` : s.doing;
    },
  };
  // 老龟、梅上的两只雀：不是人，但别处要知道它们在哪、在不在（attend 对它们无用）。雀正往下跌的那一刻 falling 为真
  npcs.turtle = { id: 'turtle', name: '老龟', root: turtle.parts.mesh, pos: turtle.pos, get present() { return turtle.present; }, attend: () => undefined };
  npcs.sparrows = Object.defineProperty({ id: 'sparrows', name: '雀', root: plum.parts.mesh, pos: plum.pos, get present() { return plum.present; }, attend: () => undefined } as Npc, 'falling', { get: () => plum.falling, enumerable: true });
  const blockers = [...folk.people.map((p) => p.blocker), ...ox.blockers, ...buf.blockers, ...fauna.blockers];

  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), NONE: Array<{ x: number; z: number; r: number }> = [];
  const c: Ctx = {
    dt: 0, t: 0, frame: 0, hour: 9, night: 0, rain: 0, snow: 0, season: o.season,
    player: new THREE.Vector3(), camera: null as unknown as THREE.Camera, camPos: new THREE.Vector3(), frustum, wound: true, fair: true,
    // 太远的不报（鸡鸣、犬吠、笛声传得远，三百米外才算远；各声传多远、多响由听的那一头定）。
    // 声音那一路还没做出来的名字先借一个相近的（借不到就不出声），免得那边一声没有就出错
    sfx: (shot, x, z, vel = 0.5) => { const s = KNOWN.has(shot) ? shot : STANDIN[shot]; if (s && o.sfx && Math.hypot(x - c.player.x, z - c.player.z) < 330) o.sfx(s, { vel, x, z }); },
  };
  let lastHour = -1, age = 0, windT = 1, rate = 0, folkMs = 0;

  return {
    group, npcs, blockers, fauna,
    get folkMs() { return folkMs; },
    setSeason(s) { if (s !== c.season) { c.season = s; windT = 0.6; } },
    update(dt, t, e) {
      c.dt = Math.min(dt, 0.1); c.t = t; c.frame++;
      c.hour = e.hour; c.night = e.night; c.rain = e.rain; c.snow = e.snow;
      c.player.copy(e.player); c.camera = e.camera;
      e.camera.updateMatrixWorld();
      c.camPos.setFromMatrixPosition(e.camera.matrixWorld);
      frustum.setFromProjectionMatrix(pm.multiplyMatrices((e.camera as THREE.PerspectiveCamera).projectionMatrix, e.camera.matrixWorldInverse));
      // 时辰是不是被一下子拨过去的（或刚开场、刚换季）：是的话人直接出现在该在的地方，不一个个走过去。
      // 「跟着真钟走」时钟点是半分钟一跳（一跳 0.008 个钟点），那不算拨；一跳超过四十来秒、或者钟走得飞快（每秒二十分之一个钟点以上）才算
      let dh = lastHour < 0 ? 0 : e.hour - lastHour; if (dh > 12) dh -= 24; else if (dh < -12) dh += 24;
      lastHour = e.hour; age += dt;
      rate += (Math.min(Math.abs(dh), 0.012) / Math.max(dt, 1e-3) - rate) * Math.min(1, dt / 1.5);
      if (age < 0.5 || Math.abs(dh) > 0.012 || rate > 0.045) windT = 0.4;
      windT -= dt;
      c.wound = windT > 0;
      c.fair = e.rain < 0.5 && e.snow < 0.5;

      // 村里人认路时问 walk.ts「这里走不走得过去」——那张图里「会动的圆」正是他们自己，先拿开，问完放回去
      setDynamic(NONE);
      const f0 = performance.now();
      folk.tend(c);
      for (const p of folk.people) p.tick(c);
      // 雨具：下雨下雪、人在外头就戴斗笠、披蓑衣，到了檐下、进了棚就卸下（身子自己慢慢戴、卸）。走着路的按头顶有没有屋顶算；
      // 站下来干活的，离屋檐不到一步半就算在檐下（雨天的活本来就排在檐下，站处多半在檐口外一点）。
      // 没人看着的、时辰被一下子拨过去的，直接换好。天时也报给行者那一路（avatar/gear.ts 的 SKY：行者取雪用）
      setSky(e.rain, e.snow);
      const wetSky = Math.max(e.rain, e.snow) > WET;
      for (let i = 0; i < folk.people.length; i++) {
        const p = folk.people[i];
        if (!p.here || ((c.frame + i) % 4 && !c.wound)) continue;
        const dry = shelterAt(p.pos.x, p.pos.y + 1.35 * p.scale, p.pos.z) || (!p.walking && nearRoof(p.pos.x, p.pos.z, 1.5));
        p.fig.setGear(wetSky && !dry ? 1 : 0, c.wound || !p.inView);
      }
      folkMs += (performance.now() - f0 - folkMs) * 0.05;
      setDynamic(blockers);
      // 牛、水牛与别的生灵（量着各花了多少：fauna.ms、fauna.per）
      fauna.update(c, folk.feedAt);
    },
  };
}
