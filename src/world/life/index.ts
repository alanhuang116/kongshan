/**
 * 人物与生灵：安乐窝里的村人（都在做事，不是闲坐）和鸡犬牛鸭、燕雀虫鱼。
 * 谁在哪、什么时候、做什么，写在 docs/LIFE.md；各人的日程与动作在 people.ts，位置在 spots.ts。
 *
 * 用法：
 *   const life = createLife({ q, season, sfx });  scene.add(life.group);
 *   每帧 life.update(dt, t, { hour, night, rain, snow, player, camera })；换季 life.setSeason(s)。
 *   life.blockers 交给 walk.ts 的 setDynamic（人与牛挡路；r 为 0 的是此刻不在场的）；
 *   找人说话时 life.npcs.farmer.attend(行者的位置)，说完 attend(null)。
 */
import * as THREE from 'three';
import type { Quality } from '../core/World';
import type { Season } from '../env/atmos';
import type { Avatar } from '../avatar/types';
import { setDynamic } from '../walk';
import { Cat, Dog, Fishes, Turtle } from './beasts';
import { Chickens, Ducks, Egrets, FenceSparrows, Geese, NestSwallows, PlumSparrows, Swallows } from './fowl';
import { makeInsects } from './insects';
import { OxTeam } from './ox';
import { makeFolk } from './people';
import type { Ctx } from './person';
import { route } from './route';
import { BUND, MILL, MULBERRIES, OX_SHED_FRONT, SAWHORSE, SCHOOL_FRONT, TEA, TRELLIS, WASH, door } from './spots';

export interface LifeOpts { q: Quality; season: Season; /** 出一声（名字在 docs/LIFE.md 里列出来，声音由别人做） */ sfx?(shot: string, o?: { vel?: number; x?: number; z?: number }): void }
export interface Npc {
  id: string; name: string; root: THREE.Object3D; avatar?: Avatar;
  /** 此刻在哪（世界坐标，随他走动更新） */ pos: THREE.Vector3;
  /** 此刻在不在场（夜里回家了、雨天不出门就是 false） */ present: boolean;
  /** 让他停下手里的活、转过来对着某处（给 null 就接着干自己的） */ attend(p: THREE.Vector3 | null): void;
}
export interface Life {
  group: THREE.Group;
  npcs: Record<string, Npc>;
  /** 人不能穿过去的（人和大牲口）：每帧就地更新 */ blockers: Array<{ x: number; z: number; r: number }>;
  setSeason(s: Season): void;
  update(dt: number, t: number, o: { hour: number; night: number; rain: number; snow: number; player: THREE.Vector3; camera: THREE.Camera }): void;
}

export function createLife(o: LifeOpts): Life {
  const group = new THREE.Group();
  group.name = 'life';
  const ox = new OxTeam('ox'), buf = new OxTeam('buffalo'), folk = makeFolk(o.q, group, ox, buf);
  const chickens = new Chickens(), ducks = new Ducks(), geese = new Geese(), egrets = new Egrets(), fence = new FenceSparrows(), plum = new PlumSparrows(), swallows = new Swallows(), nest = new NestSwallows();
  const dog = new Dog(), cat = new Cat(), fish = new Fishes(), turtle = new Turtle(), insects = makeInsects(o.q, { trellis: TRELLIS });
  for (const p of [ox.parts, buf.parts, chickens.parts, ducks.parts, geese.parts, egrets.parts, fence.parts, plum.parts, swallows.parts, nest.parts, dog.parts, cat.parts, fish.parts, turtle.parts]) group.add(p.mesh);
  group.add(insects.group);
  buf.present = false;
  turtle.onPlop = (x, z) => fish.scatter(x, z);

  // 把常走的几条路先认一遍：地势与挡路的图是现算现记的，头一回认一条远路要几十毫秒——放在开场时做，免得清早有人出门时画面顿一下
  try {
    const A = door('a'), B = door('b'), D = door('d'), E = door('e'), P = (x: number, z: number) => ({ x, z });
    for (const [a, b] of [[A, OX_SHED_FRONT], [OX_SHED_FRONT, BUND], [A, BUND], [A, MULBERRIES[0]], [A, SCHOOL_FRONT], [B, SCHOOL_FRONT], [D, SCHOOL_FRONT], [B, P(WASH.way[0][0], WASH.way[0][1])], [D, SAWHORSE.at], [E, P(MILL.way[1][0], MILL.way[1][1])], [P(149, 9), TEA.stand], [TEA.stand, P(-50, 38.8)]]) route(a.x, a.z, b.x, b.z);
  } catch (e) { console.warn('认路的预备没做成', e); }

  const npcs: Record<string, Npc> = {};
  for (const p of folk.people) npcs[p.id] = { id: p.id, name: p.name, root: p.root, avatar: p.avatar, pos: p.pos, get present() { return p.here; }, attend: (v) => p.attend(v) };
  // 老龟、梅上的两只雀：不是人，但别处要知道它们在哪、在不在（attend 对它们无用）。雀正往下跌的那一刻 falling 为真
  npcs.turtle = { id: 'turtle', name: '老龟', root: turtle.parts.mesh, pos: turtle.pos, get present() { return turtle.present; }, attend: () => undefined };
  npcs.sparrows = Object.defineProperty({ id: 'sparrows', name: '雀', root: plum.parts.mesh, pos: plum.pos, get present() { return plum.present; }, attend: () => undefined } as Npc, 'falling', { get: () => plum.falling, enumerable: true });
  const blockers = [...folk.people.map((p) => p.blocker), ...ox.blockers, ...buf.blockers];

  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), NONE: Array<{ x: number; z: number; r: number }> = [];
  const c: Ctx = {
    dt: 0, t: 0, frame: 0, hour: 9, night: 0, rain: 0, snow: 0, season: o.season,
    player: new THREE.Vector3(), camera: null as unknown as THREE.Camera, camPos: new THREE.Vector3(), frustum, wound: true, fair: true,
    // 太远的不报（鸡鸣、犬吠、笛声传得远，三百米外才算远；各声传多远、多响由听的那一头定）
    sfx: (shot, x, z, vel = 0.5) => { if (o.sfx && Math.hypot(x - c.player.x, z - c.player.z) < 330) o.sfx(shot, { vel, x, z }); },
  };
  let lastHour = -1, age = 0, windT = 1, rate = 0;

  return {
    group, npcs, blockers,
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
      folk.tend(c);
      for (const p of folk.people) p.tick(c);
      setDynamic(blockers);
      ox.update(c.dt, t); buf.update(c.dt, t);
      chickens.update(c, folk.feedAt); ducks.update(c); geese.update(c); egrets.update(c); fence.update(c); plum.update(c); swallows.update(c); nest.update(c);
      dog.update(c); cat.update(c); fish.update(c); turtle.update(c); insects.update(c);
    },
  };
}
