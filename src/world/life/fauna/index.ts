/**
 * 生灵：鸡犬牛羊、鸭鹅鹭雀燕、驴兔鼠鹿、鱼龟蛙、虫，与天上过的雁、归林的鸦、伊水上的鹤。
 * 人（村人）在 people.ts；这里只管不是人的。总入口：
 *
 *   const fauna = createFauna({ q, season, ox, buf });   group.add(fauna.group);
 *   每帧 fauna.update(c, folk.feedAt)（c 是 life/person.ts 的 Ctx）
 *   fauna.blockers：大牲口挡路的圆（交给 walk.ts 的 setDynamic，与人的放在一起）
 *   fauna.hens / sheep / donkey / ducks / dog / cat / fish ……：做事（acts/beasts.ts）与别的几路要用的
 *   fauna.hook：总装那边接上的几样（水面一圈涟漪、溅水、画面下方浮一句话），没接就不做
 *
 * 远近：每一种各按离镜头的远近分级（近的每帧动、远的隔几帧动、看不见的偶尔动一下、再远不画）；
 * 一共花了多少毫秒在 fauna.ms（平滑过的），各种各多少在 fauna.per。
 */
import * as THREE from 'three';
import type { Quality } from '../../core/World';
import type { Season } from '../../env/atmos';
import { U } from '../../ink/ink';
import type { OxTeam } from '../ox';
import type { Ctx } from '../person';
import { Fishes, Turtle } from '../beasts';
import { Egrets, FenceSparrows, Geese, NestSwallows, PlumSparrows, Swallows } from '../fowl';
import { makeInsects } from '../insects';
import { TRELLIS } from '../spots';
import { FAUNA } from './api';
import { Cat } from './cat';
import { Dog } from './dog';
import { Donkey } from './donkey';
import { Ducks } from './ducks';
import { Hens } from './hens';
import { dayOf, type Day } from './kit';
import { SheepFlock } from './sheep';
import { SkyBirds } from './sky';
import { Perched } from './perch';
import { Wild } from './wild';
import { Tracks } from './tracks';

export interface FaunaOpts { q: Quality; season: Season; ox: OxTeam; buf: OxTeam }
/** 总装那边接上的（acts/beasts.ts 里接）：没接上就不做 */
export interface FaunaHook {
  /** 水面荡一圈（x, z, 大小 0…1） */ ripple?(x: number, z: number, s: number): void;
  /** 溅起几点水 */ splash?(x: number, y: number, z: number, n?: number): void;
  /** 画面下方浮一句话 */ note?(text: string): void;
  /** 一样持续的声（一片蛙、蜂）开到几成，在世界里哪一处；0 停 */ loop?(name: string, level: number, at: { x: number; z: number }): void;
}

export function createFauna(o: FaunaOpts) {
  const group = new THREE.Group();
  group.name = 'fauna';
  const hook: FaunaHook = {};
  const loopLv: Record<string, number> = {};
  const loop = (name: string, lv: number, x: number, z: number) => {
    const was = loopLv[name] ?? 0;
    if (Math.abs(lv - was) < 0.04 && !(lv === 0 && was > 0)) return;
    loopLv[name] = lv; hook.loop?.(name, lv, { x, z });
  };
  const hens = new Hens(), ducks = new Ducks(), geese = new Geese(), egrets = new Egrets(), fence = new FenceSparrows(), plum = new PlumSparrows(), swallows = new Swallows(), nest = new NestSwallows();
  const dog = new Dog(), cat = new Cat(), fish = new Fishes(), turtle = new Turtle(), insects = makeInsects(o.q, { trellis: TRELLIS });
  const sheep = new SheepFlock(), donkey = new Donkey(), sky = new SkyBirds(o.q), perched = new Perched(), wild = new Wild(), tracks = new Tracks();
  for (const p of [hens.parts, ducks.parts, geese.parts, egrets.parts, fence.parts, plum.parts, swallows.parts, nest.parts, dog.parts, cat.parts, fish.parts, turtle.parts, sheep.parts, donkey.parts, perched.parts, wild.parts, tracks.parts]) group.add(p.mesh);
  // 各种各一块：整块不在画面里时剔掉（rig.ts 的 Parts.cull）
  for (const p of [o.ox.parts, o.buf.parts, hens.parts, ducks.parts, geese.parts, egrets.parts, fence.parts, plum.parts, swallows.parts, nest.parts, dog.parts, cat.parts, fish.parts, turtle.parts, sheep.parts, donkey.parts, perched.parts, wild.parts, tracks.parts]) p.cull = true;
  // 雪地上留脚印的：篱上的雀落到地上、鸡、狗
  for (let i = 0; i < fence.count; i++) tracks.follow('bird', () => fence.onGround(i));
  for (let i = 0; i < hens.birdCount; i++) tracks.follow('hen', () => hens.birdAt(i));
  tracks.follow('dog', () => dog.pos);
  group.add(insects.group, sky.mesh, hens.group);
  turtle.onPlop = (x, z) => fish.scatter(x, z);
  FAUNA.hens = hens; FAUNA.sheep = sheep; FAUNA.donkey = donkey;

  const day: Day = { sr: 6, ss: 18, light: 1, up: true, fine: true };
  const last = new THREE.Vector3(1e9, 0, 0);
  let pv = 0;
  const per: Record<string, number> = {};
  /** 量着跑一种：花了多少毫秒记进 per（平滑） */
  /** 各种各自出错只停它自己（记三次就不再跑，免得一种的毛病把村里人也拖停） */
  const bad: Record<string, number> = {};
  /** 手机（低档）上各种隔帧轮着动（一半单帧、一半双帧），没动的那一帧的时长攒到下一回；牛要跟农夫一帧一帧对齐，不隔 */
  const half = o.q.tier === 'low', acc: Record<string, number> = {};
  let order = 0;
  const run = (name: string, fn: () => void, c?: Ctx) => {
    if ((bad[name] ?? 0) >= 3) return;
    const slot = order++;
    if (half && c && name !== 'ox') {
      acc[name] = (acc[name] ?? 0) + c.dt;
      if ((c.frame + slot) % 2) return;
    }
    const dt0 = c ? c.dt : 0, f0 = c ? c.frame : 0;
    // 隔帧轮着动时，给它看的帧号也减半（各种自己按帧号分级的，才不会与这里的隔帧错开、一直轮不上）
    if (half && c && name !== 'ox') { c.dt = Math.min(0.2, acc[name] ?? c.dt); acc[name] = 0; c.frame = Math.floor(c.frame / 2); }
    const a = performance.now();
    try { fn(); } catch (e) { bad[name] = (bad[name] ?? 0) + 1; console.warn(`生灵「${name}」出错（第 ${bad[name]} 次）`, e); }
    if (c) { c.dt = dt0; c.frame = f0; }
    const d = performance.now() - a; per[name] = (per[name] ?? d) + (d - (per[name] ?? d)) * 0.05;
  };
  /** 挡路的：驴（不在场时挪到天边） */
  const blockers: Array<{ x: number; z: number; r: number }> = [{ x: 1e6, z: 1e6, r: 0 }];

  const fauna = {
    group, hook, blockers, per, ms: 0,
    hens, ducks, geese, egrets, dog, cat, fish, turtle, plum, fence, swallows, nest, insects, sheep, donkey, sky, perched, wild, ox: o.ox, buf: o.buf,
    /** 行者走得多快（米/秒，平滑过的） */
    get pv() { return pv; },
    update(c: Ctx, feedAt: { x: number; z: number } | null) {
      const a0 = performance.now();
      order = 0;
      // 行者的快慢：从位置差算（跑过鸡群会惊散它们）
      const d = last.x > 1e8 ? 0 : Math.hypot(c.player.x - last.x, c.player.z - last.z);
      last.copy(c.player);
      if (d < 6) pv += (d / Math.max(c.dt, 1e-3) - pv) * Math.min(1, c.dt * 8); else pv = 0;
      dayOf(c, day);
      void U;
      run('ox', () => { o.ox.update(c.dt, c.t); o.buf.update(c.dt, c.t); }, c);
      run('hens', () => hens.update(c, day, pv, feedAt), c);
      run('ducks', () => ducks.update(c, day, pv), c);
      run('geese', () => geese.update(c), c);
      run('egrets', () => egrets.update(c), c);
      run('sparrows', () => { fence.update(c); plum.update(c); }, c);
      run('swallows', () => { swallows.update(c); nest.update(c); }, c);
      run('dog', () => dog.update(c, day, pv), c);
      run('cat', () => cat.update(c, day, pv), c);
      run('pond', () => { fish.update(c); turtle.update(c); }, c);
      run('insects', () => insects.update(c), c);
      run('sheep', () => sheep.update(c, day, pv), c);
      run('donkey', () => donkey.update(c, day), c);
      run('sky', () => sky.update(c, day), c);
      run('perched', () => perched.update(c, day, hook.ripple), c);
      run('wild', () => wild.update(c, day, pv), c);
      run('tracks', () => tracks.update(c), c);
      // 持续的声：池塘那一片蛙、瓜架边的蜂（远近由声音那边按听的人算；这里只在要变的时候说一声）
      if (c.frame % 15 === 0) { loop('frog', perched.chorus.level, perched.chorus.x, perched.chorus.z); if (insects.buzz) loop('bee', insects.buzz.level, insects.buzz.x, insects.buzz.z); }
      const b = blockers[0];
      if (donkey.present) { b.x = donkey.pos.x; b.z = donkey.pos.z; b.r = 0.55; } else { b.x = b.z = 1e6; b.r = 0; }
      const ms = performance.now() - a0;
      fauna.ms += (ms - fauna.ms) * 0.05;
    },
  };
  return fauna;
}
export type Fauna = ReturnType<typeof createFauna>;
