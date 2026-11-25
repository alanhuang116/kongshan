/**
 * 与鸡犬牛鸭、猫鱼蚁打交道的几件事（生灵本身在 life/fauna/）：
 *   喂鸡 —— 草堂鸡埘边的瓦盆：行囊里有小米、麦粒就抓一把（用去一升），没有就抓一把糠；往地上一撒，鸡咯咯地围过来抢。
 *   捡蛋 —— 清早到上午，母鸡挨个钻进鸡埘下蛋、出来「咯咯哒」；蹲下伸手进草窝，一个一个摸出来（得鸡蛋）。一天两三个。
 *   喂鱼 —— 屋后池的南岸，蹲下往水里撒一点饭粒，鱼聚过来，嘴凑到水面一张一合，水面一圈一圈。
 *   摸狗 —— 甲家的黄狗：蹲下，它过来坐在跟前；按住了摸它的头，它闭着眼往手上拱，摸舒服了往地上一倒、翻出肚皮。
 *   逗猫 —— 松下矮凳上的猫：蹲下，拿一根狗尾草晃；它跳下来伏低了盯着，草一停，屁股一扭扑上去，再拿爪子拍。
 *   赶鸭 —— 黄昏，鸭子在鸭栏西边的岸上：绕到它们身后，慢慢往栏口赶。跑急了它们扑通扑通跳回水里。
 *   观蚁 —— 夏天的午后、闷热起雾的日子：院子里蚂蚁成行地搬家，蹲下来看（《易林》：蚁封穴户，大雨将集）。
 *   添草 —— 牛在棚里的时候（夜里、清早、冬天、雨天）：从棚口的草捆上抱一抱草，添进食槽，牛低头嚼起来。
 *   抱鸡 —— 有一只鸡走散了（托事里会说起）：走近了蹲下抱起来，抱着它送回乙家门前放下。
 * 做完一件，k.log({ kind: 'beast', text }) 记进起居注。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { cylUp, merge, sphere, type Geo } from '../core/geo';
import { PIG, wash } from '../ink/ink';
import { SITE, YARD_Y, ground } from '../site';
import { groundAt, standable } from '../walk';
import type { Fauna } from '../life/fauna';
import { say } from '../life/fauna/kit';
import { Parts, creatureMat, paint, tone, trs } from '../life/rig';
import type { Act } from './types';
import { PAIRS, V, openShot, shot } from './lib';
import { hitPlaneY, jpos } from './util';

type St = Record<string, unknown>;
function base(k: Anlewo) {
  const state: St = {};
  const set = (p: St) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); };
  return { state, set };
}
const faunaOf = (k: Anlewo): Fauna | null => (k.life as unknown as { fauna?: Fauna } | null)?.fauna ?? null;
/** 出一声（生灵新要的几声，声音那边没做出来之前借一声） */
const snd = (k: Anlewo, name: string, x: number, z: number, vel = 0.5) => { const s = say(name); if (s) k.sfxAt(s, { x, z, vel }); };
/** 离 (x, z) 最近的能站人的地方 */
function standNear(x: number, z: number, r0 = 0): [number, number] | null {
  for (let r = r0; r <= 3; r += 0.2) for (let a = 0; a < (r ? 16 : 1); a++) { const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r; if (standable(px, pz) != null) return [px, pz]; }
  return null;
}
const geo = (g: Geo) => { if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)); return g; };
const STRAW = wash({ pig: PIG.mao, dens: 1.35, shade: 1.45, streak: [40, 3, 0.45], grain: 2 });

// —— 存档：自家鸡埘的蛋、做过的事 ——
interface BeastMem { eggs?: { day: number; n: number; laid: number; taken: number } }
const mem = (k: Anlewo): BeastMem => k.mem.get<BeastMem>('beasts', {});

// ———————————————————————— 喂鸡 ————————————————————————
function feedHens(k: Anlewo, F: Fauna): Act | null {
  const H = F.hens, C = H.coop;
  const at = standNear(C.basin.x - 0.95, C.basin.z + 0.1);
  if (!at) return null;
  const { state, set } = base(k);
  let feed: string | null = null, n = 0, t = -1, aim = new THREE.Vector3(), holding = false, holdT = 0;
  const TOTAL = 4;
  const ask = () => set({ title: '喂鸡', hint: '抓一把，往地上撒', text: '瓦盆里有糠。行囊里若有小米、麦粒，也可以抓一把。', items: [{ id: 'millet', n: k.bag.count('millet') }, { id: 'wheat', n: k.bag.count('wheat') }], choices: [{ id: 'bran', label: '抓一把糠', main: true }, { id: 'done', label: '罢' }] });
  const ready = () => set({ title: '喂鸡', count: n, total: TOTAL, hint: n === 0 ? '点地面撒在那里，或按住「撒」' : '再撒一把', hold: { id: 'throw', label: '撒', v: 0 }, choices: [{ id: 'done', label: '罢' }] });
  const throwAt = (x: number, z: number) => {
    if (t >= 0 || n >= TOTAL) return;
    aim.set(x, ground(x, z), z); t = 0;
    k.player.faceTo = Math.atan2(x - k.player.pos.x, z - k.player.pos.z);
  };
  const act: Act = {
    id: 'hens', name: '喂鸡', anchor: V(C.basin.x, C.basin.y + 0.9, C.basin.z), spot: { x: at[0], z: at[1], yaw: -Math.PI / 2 }, radius: 2.2, state, noZoom: true,
    enter() {
      feed = null; n = 0; t = -1; holding = false;
      k.player.av.setHands('free');
      k.nav.setPose(shot(V(at[0] - 1.4, YARD_Y + 0.3, at[1]), 2.4, 4.2, 2.2, 0.1, 44, { yaw: 24, up: 10, down: 10 }), 1.5);
      ask();
    },
    exit() { k.player.av.reach('R', null); k.player.av.reach('L', null); k.player.av.bow = 0; k.player.faceTo = null; if (n > 0) k.log({ kind: 'beast', text: '喂鸡' }); },
    update(dt) {
      const av = k.player.av, p = k.player.pos;
      if (holding && feed && t < 0) { holdT += dt; if (holdT > 0.45) { holdT = 0; const a = k.player.yaw + (Math.random() - 0.5) * 0.9, d = 1.4 + Math.random() * 1.2; throwAt(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d); } }
      if (t < 0) return;
      t += dt;
      // 一把：手伸进左手捧着的那一捧里抓，往外一扬，松开
      const chest = jpos(av.joints.chest, _c);
      if (t < 0.45) { av.reach('R', _v.copy(chest).add(_w.set(Math.sin(k.player.yaw) * 0.18, -0.12, Math.cos(k.player.yaw) * 0.18)), { rate: 10 }); av.bow = 0.15; }
      else if (t < 0.85) { av.reach('R', _v.copy(chest).lerp(aim, 0.28).setY(chest.y + 0.05), { rate: 14 }); av.bow = 0.05; if (t - dt < 0.6) { H.scatter(aim.x, aim.z, feed === 'bran' ? 10 : 14); snd(k, 'grain', aim.x, aim.z, 0.5); } }
      else { av.reach('R', null); av.bow = 0; t = -1; n++;
        if (n >= TOTAL) set({ title: '喂鸡', count: n, total: TOTAL, text: feed === 'bran' ? '三只母鸡头一点一点地啄，糠末子沾在嘴边上。' : feed === 'wheat' ? '麦粒撒了一地，鸡咯咯地争，谁也不让谁。' : '小米撒在地上黄黄的一片，鸡咯咯地争，谁也不让谁。', choices: [{ id: 'done', label: feed === 'bran' ? '拍拍手上的糠' : '拍拍手' }], done: true });
        else ready();
      }
      av.reach('L', _v.copy(chest).add(_w.set(Math.sin(k.player.yaw) * 0.22 - Math.cos(k.player.yaw) * 0.05, -0.18, Math.cos(k.player.yaw) * 0.22 + Math.sin(k.player.yaw) * 0.05)), { rate: 8 });
    },
    input: {
      tap(pt) {
        if (!feed) return true;
        const hit = hitPlaneY(k.world.ray(pt.nx, pt.ny).ray, k.player.pos.y + 0.02, _h);
        if (hit && Math.hypot(hit.x - k.player.pos.x, hit.z - k.player.pos.z) < 5) throwAt(hit.x, hit.z);
        return true;
      },
    },
    cmd(c, arg) {
      if (c === 'done') { k.exitAct(); return; }
      if (!feed && c === 'item' && (arg === 'millet' || arg === 'wheat')) { if (k.bag.take(arg, 1, { verb: '用去' })) { feed = arg; ready(); } return; }
      if (!feed && c === 'bran') { feed = 'bran'; snd(k, 'grain', C.basin.x, C.basin.z, 0.3); ready(); return; }
      if (feed && c === 'throw') { holding = arg === 'down'; if (holding) { holdT = 1; } }
    },
  };
  return act;
}

// ———————————————————————— 捡蛋 ————————————————————————
function eggs(k: Anlewo, F: Fauna): Act | null {
  const H = F.hens, C = H.coop, fx = Math.sin(C.yaw), fz = Math.cos(C.yaw);
  const at = standNear(C.door.x + fx * 0.25, C.door.z + fz * 0.25);
  if (!at) return null;
  const { state, set } = base(k);
  let reach = -1, rt = 0, got = 0;
  const tags = () => { const out: St[] = []; for (let i = 0; i < Math.min(3, H.eggs); i++) { const p = H.eggPos(i, _v); out.push({ id: 'e' + i, text: '蛋', x: p.x, y: p.y + 0.06, z: p.z, kind: 'hot' }); } return out; };
  const show = () => H.eggs > 0 ? set({ title: '捡蛋', count: got, hint: '点一个蛋，伸手摸出来', tags: tags(), choices: [{ id: 'done', label: '罢' }] })
    : set({ title: '捡蛋', count: got, text: got ? `摸出来${got === 1 ? '一' : got === 2 ? '两' : '三'}个，还温着。` : '窝里空空的，只有几根草。', choices: [{ id: 'done', label: '起身' }], done: got > 0 });
  return {
    id: 'eggs', name: '捡蛋', anchor: V(C.nest.x, C.nest.y + 0.55, C.nest.z), spot: { x: at[0], z: at[1], yaw: C.yaw + Math.PI }, radius: 2.0, state, noZoom: true,
    on: () => H.eggs > 0,
    enter() {
      got = 0; reach = -1;
      const av = k.player.av; av.setPose('crouch', 1.0); av.setHands('free'); av.lookAt(C.nest);
      k.nav.setPose({ pos: V(at[0] + fx * 1.25 - fz * 0.5, C.nest.y + 0.95, at[1] + fz * 1.25 + fx * 0.5), look: V(C.nest.x, C.nest.y + 0.05, C.nest.z), fov: 40, yaw: 16, up: 8, down: 8 }, 1.4);
      show();
    },
    exit() { const av = k.player.av; av.reach('R', null); av.lookAt(null); if (got) k.log({ kind: 'beast', text: `捡蛋 ${got} 个` }); },
    update(dt) {
      if (reach < 0) return;
      rt += dt;
      const av = k.player.av, p = H.eggPos(reach, _v);
      av.reach('R', rt < 0.9 ? p.clone().add(_w.set(0, 0.02, 0)) : jpos(av.joints.chest, _c).add(_w.set(0, -0.15, 0)), { rate: 7 });
      if (rt > 0.9 && rt - dt <= 0.9) { H.takeEgg(); got++; k.bag.add('egg', 1); k.sfxAt('swish', { x: p.x, z: p.z, vel: 0.2 }); saveEggs(k, F); }
      if (rt > 1.5) { reach = -1; av.reach('R', null); show(); }
    },
    cmd(c, arg) {
      if (c === 'done') { k.exitAct(); return; }
      if (c === 'tag' && reach < 0 && typeof arg === 'string' && H.eggs > 0) { reach = Math.min(H.eggs - 1, Number(arg.slice(1)) || 0); rt = 0; k.sfxAt('swish', { x: C.nest.x, z: C.nest.z, vel: 0.15 }); set({ title: '捡蛋', count: got, hint: '' }); }
    },
  } as Act & { on(): boolean };
}
function saveEggs(k: Anlewo, F: Fauna) { const L = F.hens.lay; k.mem.patch('beasts', { eggs: { day: L.day, n: L.n, laid: L.laid, taken: L.taken } }); }

// ———————————————————————— 喂鱼 ————————————————————————
function feedFish(k: Anlewo, F: Fauna): Act | null {
  const P = SITE.pond;
  const at = standNear(P.x - 1.4, P.z + P.rz + 0.85);
  if (!at) return null;
  const { state, set } = base(k);
  let n = 0, t = -1;
  const aim = new THREE.Vector3();
  const hint = () => set({ title: '喂鱼', count: n, hint: n ? '鱼聚过来了，嘴一张一合' : '点水面，撒一点饭粒', choices: [{ id: 'toss', label: '撒一点', main: true }, { id: 'done', label: '罢' }] });
  const toss = (x: number, z: number) => { if (t >= 0) return; aim.set(x, P.y, z); t = 0; };
  return {
    id: 'fishFeed', name: '喂鱼', anchor: V(at[0], P.y + 0.9, at[1] - 0.8), spot: { x: at[0], z: at[1], yaw: Math.PI }, radius: 2.2, state, noZoom: true,
    on: () => k.atmos.night < 0.6 && k.atmos.w.snow < 0.5,
    enter() {
      n = 0; t = -1;
      const av = k.player.av; av.setPose('crouch', 1.0); av.setHands('free');
      k.nav.setPose({ pos: V(at[0] + 1.6, P.y + 2.2, at[1] + 1.8), look: V(at[0] - 0.4, P.y, at[1] - 2.2), fov: 44, yaw: 22, up: 10, down: 10 }, 1.5);
      hint();
    },
    exit() { k.player.av.reach('R', null); if (n) k.log({ kind: 'beast', text: '喂鱼' }); },
    update(dt) {
      if (t < 0) return;
      t += dt;
      const av = k.player.av;
      av.reach('R', jpos(av.joints.chest, _c).lerp(aim, t < 0.4 ? 0.15 : 0.3).setY(P.y + 0.45), { rate: 10 });
      if (t > 0.45 && t - dt <= 0.45) { F.fish.feed(aim.x, aim.z); k.land.ripple(aim.x, aim.z, 0.6); k.sfxAt('ripple', { x: aim.x, z: aim.z, vel: 0.3 }); }
      if (t > 0.8) { t = -1; av.reach('R', null); n++; hint(); }
    },
    input: {
      tap(pt) {
        const hit = hitPlaneY(k.world.ray(pt.nx, pt.ny).ray, P.y, _h);
        if (hit && Math.hypot((hit.x - P.x) / P.rx, (hit.z - P.z) / P.rz) < 0.85 && Math.hypot(hit.x - at[0], hit.z - at[1]) < 6) toss(hit.x, hit.z);
        return true;
      },
    },
    cmd(c) { if (c === 'done') k.exitAct(); else if (c === 'toss') toss(at[0] - 0.3 + (Math.random() - 0.5), at[1] - 1.9 - Math.random()); },
  } as Act & { on(): boolean };
}

// ———————————————————————— 摸狗 ————————————————————————
function petDog(k: Anlewo, F: Fauna): Act {
  const D = F.dog;
  const { state, set } = base(k);
  const spot = { x: D.pos.x, z: D.pos.z + 1, yaw: Math.PI }, anchor = new THREE.Vector3();
  let happy = 0, holding = false, belly = false, scratched = 0;
  const show = () => set({ title: '摸狗', hint: belly ? '它躺倒了，翻出肚皮' : holding ? '它眯着眼，往你手上拱' : '按住「摸」，摸它的头', meter: { v: happy, label: '欢喜' }, hold: { id: 'pat', label: belly ? '挠' : '摸', v: happy }, choices: [{ id: 'done', label: '罢' }] });
  return {
    id: 'dog', name: '摸狗', anchor, spot, radius: 2.4, state, noZoom: true,
    on() {
      // 跟着狗：站在它朝人的那一侧一米远
      const p = k.player.pos, dx = p.x - D.pos.x, dz = p.z - D.pos.z, d = Math.hypot(dx, dz) || 1;
      spot.x = D.pos.x + (dx / d) * 1.0; spot.z = D.pos.z + (dz / d) * 1.0; spot.yaw = Math.atan2(-dx, -dz);
      anchor.set(D.pos.x, D.pos.y + 0.9, D.pos.z);
      return D.awake && k.atmos.night < 0.6 && k.atmos.w.rain < 0.5;
    },
    enter() {
      happy = 0; holding = false; belly = false; scratched = 0;
      // 远远点了它走过来的，常是狗迎上来又跟在身后，人到了还得掉过身来——没转完就开始了（Anlewo 等转身最多一两秒），
      // 所以按他转完以后面朝的那一边算（faceTo）：狗绕到那一边坐下，镜头也按那一边摆
      const av = k.player.av, p = k.player.pos, y = k.player.faceTo ?? k.player.yaw;
      av.setPose('crouch', 1.0); av.setHands('free');
      // 狗过来坐在他跟前 0.72 米（dog.ts 的 Pet）
      D.pet('come', { x: p.x, z: p.z, yaw: y });
      // 机位：从侧面看人与狗（两个都是侧影，摸它的右手在近处），看的是两个当中、齐手高的那一点。
      // 先试右手那一侧（略偏后一点，狗的脸转过来一些），挡着就试左边，再试前面斜着；人的正背后不去——从那里看，狗全被他的身子挡住了。
      // 狗常卧在甲家矮墙根：哪一面有墙、篱笆、过路的人挡着，就换一面（openShot）。拖动时绕着转，也只转到背后斜四十五度为止。
      const c = V(p.x + Math.sin(y) * 0.36, p.y + 0.42, p.z + Math.cos(y) * 0.36), deg = Math.PI / 180;
      const side = [-100, -88, -112, -76, 100, 88, 112, 76, -55, 55, -35, 35, -15, 15];
      const s = openShot(c, side.map((a) => y + a * deg), k.world.camera.aspect < 1 ? 3.0 : 2.6, 0.85, 0, 42, { up: 28, down: 8 });
      const th = Math.atan2(Math.sin(s.dirYaw - y), Math.cos(s.dirYaw - y)) / deg;
      k.nav.setPose({ ...s, orbit: [-135 - th, 135 - th] }, 1.4);
      snd(k, 'dogWhine', D.pos.x, D.pos.z, 0.4);
      show();
    },
    exit() { D.pet(null); const av = k.player.av; av.reach('R', null); av.reach('L', null); av.bow = 0; if (happy > 0.3) k.log({ kind: 'beast', text: belly ? '摸狗，它翻了肚皮' : '摸狗' }); },
    update(dt) {
      const av = k.player.av, p = D.pos;
      if (holding) {
        happy = Math.min(1, happy + dt * (belly ? 0.12 : 0.16));
        // 手：在头上、背上一下一下地捋；翻了肚皮就挠肚皮
        const fx = Math.sin(D.q.yaw), fz = Math.cos(D.q.yaw), s = Math.sin(performance.now() * 0.006);
        const target = belly ? _v.set(p.x + fz * 0.05, p.y + 0.3, p.z - fx * 0.05) : _v.set(p.x + fx * (0.18 + 0.08 * s), p.y + 0.62, p.z + fz * (0.18 + 0.08 * s));
        av.reach('R', target, { rate: 9 }); av.bow = 0.25;
        if (!belly && happy > 0.6) { D.pet('lean'); }
        if (!belly && happy >= 0.98) { belly = true; happy = 0.5; D.pet('belly'); snd(k, 'dogWhine', p.x, p.z, 0.5); show(); }
        if (belly) { scratched += dt; if (scratched > 4) { holding = false; set({ title: '摸狗', text: '它四脚朝天，尾巴在土里扫来扫去。挠够了，一翻身起来，抖一抖毛。', meter: { v: 1, label: '欢喜' }, choices: [{ id: 'done', label: '起身' }], done: true }); D.pet('come'); av.reach('R', null); } }
        if (Math.floor(happy * 10) !== Math.floor((happy - dt * 0.16) * 10)) k.emitAct();
        (state.meter as { v: number }).v = happy; if (state.hold) (state.hold as { v: number }).v = happy;
      } else { av.reach('R', null); av.bow = Math.max(0, av.bow - dt); }
    },
    cmd(c, arg) {
      if (c === 'done') { k.exitAct(); return; }
      if (c === 'pat') { holding = arg === 'down'; if (holding && !belly) D.pet('lean'); else if (!belly && !holding) D.pet('come'); show(); }
    },
  } as Act & { on(): boolean };
}

// ———————————————————————— 逗猫 ————————————————————————
function teaseCat(k: Anlewo, F: Fauna): Act | null {
  const Cc = F.cat, B = { x: (SITE.pines[0].x + SITE.pines[1].x) / 2 + 0.05, z: (SITE.pines[0].z + SITE.pines[1].z) / 2 };
  const at = standNear(B.x - 1.55, B.z);
  if (!at) return null;
  const { state, set } = base(k);
  // 狗尾草：一根细茎，梢上一穗毛
  const grass = new THREE.Mesh(merge([geo(cylUp(0.0025, 0.0035, 0.34, 4)), geo(sphere(1, 6, 5).scale(0.012, 0.04, 0.012).translate(0.004, 0.36, 0))]), wash({ pig: [0.86, 0.86, 0.7], dens: 1.2, shade: 1.3 }));
  grass.visible = false; k.world.scene.add(grass);
  const tip = new THREE.Vector3();
  let waving = false, t = 0, n0 = 0, still = 0;
  const show = () => set({ title: '逗猫', count: Cc.pounced - n0, hint: waving ? '草一停，它就扑' : '按住「晃」，晃那根狗尾草', hold: { id: 'wave', label: '晃', v: Math.min(1, (Cc.pounced - n0) / 3) }, choices: [{ id: 'done', label: '罢' }] });
  return {
    id: 'cat', name: '逗猫', anchor: V(B.x, YARD_Y + 0.9, B.z), spot: { x: at[0], z: at[1], yaw: Math.PI / 2 }, radius: 2.2, state, noZoom: true,
    on: () => Cc.onBench,
    enter() {
      waving = false; t = 0; still = 0; n0 = Cc.pounced;
      const av = k.player.av; av.setPose('crouch', 1.0); av.setHands('free');
      grass.visible = true; av.joints.handR.add(grass); grass.position.set(0, 0.02, 0); grass.rotation.set(-0.9, 0, 0);
      k.nav.setPose({ pos: V(at[0] - 0.4, YARD_Y + 1.15, at[1] + 2.2), look: V(at[0] + 0.9, YARD_Y + 0.15, at[1]), fov: 44, yaw: 22, up: 8, down: 8 }, 1.4);
      show();
    },
    exit() { Cc.lure(null); grass.removeFromParent(); grass.visible = false; k.world.scene.add(grass); k.player.av.reach('R', null); if (Cc.pounced > n0) k.log({ kind: 'beast', text: '逗猫' }); },
    update(dt) {
      t += dt;
      const av = k.player.av, p = k.player.pos, y = k.player.yaw, fx = Math.sin(y), fz = Math.cos(y), rx = -Math.cos(y), rz = Math.sin(y);
      // 手：晃的时候草梢在身前地上左右跳；不晃就停在那里
      const sway = waving ? Math.sin(t * 5.2) * 0.32 + Math.sin(t * 11.3) * 0.08 : 0, hop = waving ? Math.abs(Math.sin(t * 7)) * 0.12 : 0;
      if (!waving) still += dt; else still = 0;
      av.reach('R', _v.set(p.x + fx * 0.42 + rx * (0.12 + sway * 0.5), p.y + 0.42 + hop * 0.6, p.z + fz * 0.42 + rz * (0.12 + sway * 0.5)), { rate: 12, dir: _w.set(fx, -0.55, fz).normalize() });
      grass.updateWorldMatrix(true, false); tip.set(0, 0.36, 0).applyMatrix4(grass.matrixWorld);
      Cc.lure(tip, waving);
      if (Cc.pounced - n0 >= 3 && state.done !== true) { set({ title: '逗猫', count: 3, text: '扑了三回，猫忽然没了兴致，坐下来舔起爪子，好像刚才扑草的不是它。', choices: [{ id: 'done', label: '起身' }], done: true }); }
      else if (state.done !== true && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) show();
    },
    cmd(c, arg) {
      if (c === 'done') { k.exitAct(); return; }
      if (c === 'wave') { waving = arg === 'down'; show(); }
    },
  } as Act & { on(): boolean };
}

// ———————————————————————— 赶鸭 ————————————————————————
function herdDucks(k: Anlewo, F: Fauna): Act | null {
  const Dk = F.ducks, at = standNear(Dk.bank.x0 - 1.2, (Dk.bank.z0 + Dk.bank.z1) / 2);
  if (!at) return null;
  const { state, set } = base(k);
  let doneOnce = false;
  const show = () => {
    const n = Dk.inPen, T = Dk.total;
    if (n >= T) { if (!doneOnce) { doneOnce = true; k.log({ kind: 'beast', text: '赶鸭进栏' }); } set({ title: '赶鸭', count: n, total: T, text: '五只都进了栏，挤在一处「嘎嘎」两声，就不响了。日之夕矣。', choices: [{ id: 'done', label: '罢' }], done: true }); return; }
    set({ title: '赶鸭', count: n, total: T, hint: '绕到它们身后，慢慢往栏口赶；别跑，一跑就扑通扑通跳回水里', choices: [{ id: 'done', label: '罢' }] });
  };
  return {
    id: 'ducks', name: '赶鸭', anchor: V(at[0] + 2.5, ground(at[0], at[1]) + 1.0, at[1]), spot: { x: at[0], z: at[1], yaw: Math.PI / 2 }, radius: 3.5, state, free: true,
    on: () => Dk.onBank > 0 && Dk.inPen < Dk.total,
    enter() { doneOnce = false; Dk.herd(true); k.player.av.setHands('sleeve'); show(); },
    exit() { Dk.herd(false); },
    update() { const n = Dk.inPen; if (n !== state.count) show(); },
    cmd(c) { if (c === 'done') k.exitAct(); },
  } as Act & { on(): boolean };
}

// ———————————————————————— 观蚁 ————————————————————————
function ants(k: Anlewo): Act | null {
  const at = standNear(-7.6, 14.4);
  if (!at) return null;
  const { state, set } = base(k);
  // 一行蚂蚁：从旧穴（A）到新穴（B），一路弯弯的；有的叼着白白的蚁卵
  const gy = groundAt(at[0], at[1]) ?? YARD_Y;
  const A = new THREE.Vector3(at[0] + 0.35, gy, at[1] - 0.95), Bp = new THREE.Vector3(at[0] + 1.45, gy, at[1] - 0.25);
  const P = new Parts(creatureMat({ body: 0.1, shade: 1.3, line: 0.4 }), 'ants'), dark = tone(PIG.jiao, 2.4);
  const ant = merge([paint(sphere(1, 5, 4).scale(0.0018, 0.0016, 0.0022), dark).translate(0, 0.0018, 0.0034), paint(sphere(1, 5, 4).scale(0.0015, 0.0014, 0.0018), dark).translate(0, 0.0018, 0.0006), paint(sphere(1, 5, 4).scale(0.0024, 0.002, 0.0032), dark).translate(0, 0.002, -0.0035)]);
  const egg = paint(sphere(1, 5, 4).scale(0.0016, 0.0013, 0.0024), [0.97, 0.96, 0.92]);
  const N = 34, ks: number[] = [], eggsK: number[] = [];
  for (let i = 0; i < N; i++) { ks.push(P.add(ant)); eggsK.push(P.add(egg)); }
  const mound = paint(sphere(1, 8, 4).scale(0.05, 0.012, 0.045), tone(PIG.tu, 1.6));
  const mk = [P.add(mound), P.add(mound)];
  P.build(); P.mesh.visible = false; k.world.scene.add(P.mesh);
  for (let i = 0; i < N; i++) { P.hide(ks[i]); P.hide(eggsK[i]); }
  const path = (u: number, lane: number, out: THREE.Vector3) => { const w = Math.sin(u * Math.PI) * 0.12 + Math.sin(u * 9 + lane) * 0.012; out.lerpVectors(A, Bp, u); out.x += -0.3 * w; out.z += 0.4 * w; out.y = (groundAt(out.x, out.z) ?? gy) + 0.0005; return out; };
  let t = 0, done = false;
  const yi = '「蚁封穴户，大雨将集。」';
  return {
    id: 'ants', name: '观蚁', anchor: V(at[0] + 0.8, gy + 0.6, at[1] - 0.6), spot: { x: at[0], z: at[1], yaw: Math.atan2(Bp.x - at[0], Bp.z - at[1]) - 0.6 }, radius: 2.0, state, noZoom: true,
    on: () => (k.season === 'summer' || (k.season === 'spring' && k.atmos.w.mist > 0.2) || (k.season !== 'winter' && k.atmos.w.mist > 0.3)) && k.atmos.night < 0.3 && k.atmos.w.rain < 0.2 && (k.atmos.hour > 12.5 || k.atmos.w.mist > 0.2),
    enter() {
      t = 0; done = false;
      const av = k.player.av; av.setPose('crouch', 1.0); av.setHands('lap'); av.bow = 0.55;
      P.mesh.visible = true;
      P.place(mk[0], trs(_m, A.x, A.y, A.z)); P.place(mk[1], trs(_m, Bp.x, Bp.y, Bp.z, 0.7));
      const mid = new THREE.Vector3().lerpVectors(A, Bp, 0.5);
      k.nav.setPose({ pos: V(mid.x - 0.25, gy + 0.38, mid.z + 0.55), look: V(mid.x + 0.05, gy, mid.z - 0.05), fov: 36, yaw: 18, up: 8, down: 6 }, 1.6);
      k.world.fpsCap = 30;
      set({ title: '观蚁', hint: '蚂蚁成行地搬家', progress: 0, quiet: true });
    },
    exit() { P.mesh.visible = false; k.player.av.bow = 0; k.world.fpsCap = 0; },
    update(dt) {
      t += dt;
      for (let i = 0; i < N; i++) {
        // 一来一去两股：去的叼着卵，回的空着
        const back = i % 3 === 2, sp = 0.055 + 0.01 * ((i * 7) % 5) / 5, u0 = ((t * sp + i / N) % 1 + 1) % 1, u = back ? 1 - u0 : u0;
        path(u, back ? 1.3 : 0, _v); path(Math.min(1, Math.max(0, u + (back ? -0.01 : 0.01))), back ? 1.3 : 0, _w);
        const yaw = Math.atan2(_w.x - _v.x, _w.z - _v.z) + 0.25 * Math.sin(t * 12 + i);
        P.place(ks[i], trs(_m, _v.x, _v.y, _v.z, yaw));
        if (!back) P.place(eggsK[i], trs(_m, _v.x + Math.sin(yaw) * 0.006, _v.y + 0.003, _v.z + Math.cos(yaw) * 0.006, yaw)); else P.hide(eggsK[i]);
      }
      P.commit();
      state.progress = Math.min(1, t / 16);
      if (!done && t > 16) { done = true; k.log({ kind: 'beast', text: '看蚂蚁搬家' }); set({ title: '观蚁', text: '一只跟着一只，叼着白白的卵，从墙根的旧穴搬到高处去。怕是要下雨了。', lines: [yi.slice(1, 5), yi.slice(6, 10)], source: '《焦氏易林·震之蹇》（《东观汉记》引；《太平御览》卷九百四十七引作「蚁封户穴」）', choices: [{ id: 'done', label: '起身' }] }); }
      else if (!done && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) k.emitAct();
    },
    input: { tap: () => { if (!done && t > 3) t = 16; return true; } },
    cmd(c) { if (c === 'done') k.exitAct(); },
  } as Act & { on(): boolean };
}

// ———————————————————————— 添草 ————————————————————————
function oxHay(k: Anlewo, F: Fauna): Act | null {
  const O = SITE.more.oxShed, c = Math.cos(O.yaw), s = Math.sin(O.yaw);
  const W = (lx: number, lz: number): [number, number] => [O.x + lx * c + lz * s, O.z - lx * s + lz * c];
  const front = W(0.2, 2.15), at = standNear(front[0], front[1]);
  if (!at) return null;
  const { state, set } = base(k);
  const ox = F.ox, trough = W(-0.5, -0.72), shedYaw = O.yaw + Math.PI;
  // 一抱草（拿在手里）、槽里的一堆、棚口的草捆
  const lump = (sx: number, sy: number, sz: number) => { const g = geo(sphere(1, 7, 5)); const p = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) { const k2 = 1 + 0.18 * Math.sin(p.getX(i) * 9 + p.getZ(i) * 7) * Math.sin(p.getY(i) * 11); p.setXYZ(i, p.getX(i) * sx * k2, p.getY(i) * sy, p.getZ(i) * sz * k2); } g.computeVertexNormals(); return g; };
  const arm = new THREE.Mesh(lump(0.22, 0.11, 0.17), STRAW), pile = new THREE.Mesh(lump(0.55, 0.07, 0.14), STRAW), bale = new THREE.Mesh(lump(0.32, 0.22, 0.28), STRAW);
  arm.visible = pile.visible = false;
  const bp = W(1.75, 1.75); bale.position.set(bp[0], ground(bp[0], bp[1]) + 0.12, bp[1]); bale.rotation.y = O.yaw;
  pile.position.set(trough[0], ground(trough[0], trough[1]) + 0.55, trough[1]); pile.rotation.y = O.yaw;
  k.world.scene.add(arm, pile, bale);
  let step = 0, t = 0, eatT = 0, fedAt = -1e9;
  const inShed = () => {
    const here = ox.present && !ox.hitched && Math.hypot(ox.x - W(-0.4, 0.45)[0], ox.z - W(-0.4, 0.45)[1]) < 1.6;
    // 槽里的草吃完了（一分半钟），或牛被牵走了：收起来
    if (pile.visible && k.act?.id !== 'oxHay' && (!here || performance.now() - fedAt > 90000)) { pile.visible = false; ox.eat = 0; }
    return here;
  };
  return {
    id: 'oxHay', name: '添草', anchor: V(front[0], ground(front[0], front[1]) + 1.3, front[1]), spot: { x: at[0], z: at[1], yaw: shedYaw }, radius: 2.2, state, noZoom: true,
    on: inShed,
    enter() {
      step = 0; t = 0;
      k.player.av.setHands('free');
      k.nav.setPose({ pos: V(front[0] + Math.sin(O.yaw + 0.5) * 3.0, ground(front[0], front[1]) + 1.7, front[1] + Math.cos(O.yaw + 0.5) * 3.0), look: V(trough[0], ground(trough[0], trough[1]) + 0.6, trough[1]), fov: 46, yaw: 22, up: 10, down: 8 }, 1.5);
      set({ title: '添草', steps: ['抱草', '添进槽', '看它吃'], step: 0, hint: '棚口有一捆草', choices: [{ id: 'grab', label: '抱一抱草', main: true }, { id: 'done', label: '罢' }] });
      ox.eat = 0;
    },
    exit() { arm.removeFromParent(); k.world.scene.add(arm); arm.visible = false; const av = k.player.av; av.reach('R', null); av.reach('L', null); av.bow = 0; av.setPose('stand'); if (step >= 2) k.log({ kind: 'beast', text: '给牛添草' }); },
    update(dt) {
      const av = k.player.av;
      t += dt;
      if (step === 1) {
        // 蹲下去抱，起来，两手捧在胸前
        if (t < 1.0) { av.setPose('crouch', 0.8); av.reach('R', bale.position, { rate: 6 }); av.reach('L', bale.position, { rate: 6 }); }
        else if (!arm.visible) { arm.visible = true; av.joints.chest.add(arm); arm.position.set(0, -0.12, 0.28); av.setPose('stand', 0.8); k.sfxAt('swish', { x: bale.position.x, z: bale.position.z, vel: 0.3 }); set({ title: '添草', steps: ['抱草', '添进槽', '看它吃'], step: 1, hint: '', choices: [{ id: 'put', label: '添进槽里', main: true }, { id: 'done', label: '罢' }] }); }
        if (arm.visible) { const cpos = jpos(av.joints.chest, _c); av.reach('R', _v.copy(cpos).add(_w.set(Math.sin(k.player.yaw) * 0.3 + Math.cos(k.player.yaw) * 0.12, -0.15, Math.cos(k.player.yaw) * 0.3 - Math.sin(k.player.yaw) * 0.12)), { rate: 8 }); av.reach('L', _v.copy(cpos).add(_w.set(Math.sin(k.player.yaw) * 0.3 - Math.cos(k.player.yaw) * 0.12, -0.15, Math.cos(k.player.yaw) * 0.3 + Math.sin(k.player.yaw) * 0.12)), { rate: 8 }); }
      } else if (step === 2) {
        // 往前一送，撒进槽里；牛低下头嚼
        if (t < 0.9) { av.bow = 0.35 * Math.sin(Math.PI * t / 0.9); }
        if (t > 0.5 && arm.visible) { arm.removeFromParent(); k.world.scene.add(arm); arm.visible = false; pile.visible = true; fedAt = performance.now(); av.reach('R', null); av.reach('L', null); k.sfxAt('swish', { x: trough[0], z: trough[1], vel: 0.35 }); ox.eat = 1; eatT = 0; }
        if (ox.eat > 0) { eatT += dt; if (Math.floor(eatT / 1.6) !== Math.floor((eatT - dt) / 1.6)) snd(k, 'munch', trough[0], trough[1], 0.45); if (eatT > 1.2 && eatT - dt <= 1.2) k.sfxAt('ox', { x: ox.x, z: ox.z, vel: 0.3 }); }
        if (t > 3 && state.step !== 2) set({ title: '添草', steps: ['抱草', '添进槽', '看它吃'], step: 2, text: '牛把头埋进槽里，一嘴一嘴地卷着草，嚼得咯吱咯吱的，鼻子里喷出白气。', choices: [{ id: 'done', label: '罢' }], done: true });
      }
    },
    cmd(cn) {
      if (cn === 'done') { k.exitAct(); return; }
      if (cn === 'grab' && step === 0) { step = 1; t = 0; k.player.faceTo = Math.atan2(bale.position.x - k.player.pos.x, bale.position.z - k.player.pos.z); }
      if (cn === 'put' && step === 1 && arm.visible) { step = 2; t = 0; k.player.faceTo = Math.atan2(trough[0] - k.player.pos.x, trough[1] - k.player.pos.z); }
    },
  } as Act & { on(): boolean };
}

// ———————————————————————— 抱鸡（托事里走散的那只） ————————————————————————
function catchHen(k: Anlewo, F: Fauna): Act {
  const H = F.hens, spot = { x: 0, z: 0, yaw: 0 }, anchor = new THREE.Vector3(0, -100, 0);
  const { state, set } = base(k);
  const hand = new THREE.Object3D();
  let phase: 'catch' | 'carry' | 'put' | 'over' = 'catch', t = 0;
  const show = () => {
    const home = H.lost.home, near = Math.hypot(k.player.pos.x - home.x, k.player.pos.z - home.z) < 6;
    set({ title: '抱鸡', hint: near ? '到了乙家门前，放下吧' : '抱着它，送回乙家门前', choices: [{ id: 'put', label: '放下', main: near, sub: near ? '这里就是乙家门前' : undefined }, { id: 'done', label: '罢' }] });
  };
  return {
    id: 'henCatch', name: '抱鸡', anchor, spot, radius: 2.0, state, free: true,
    on() {
      if (H.lost.state !== 'wander') return false;
      const b = H.strayBird();
      if (!b) return false;
      const p = k.player.pos, dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz) || 1;
      spot.x = b.x + (dx / d) * 0.55; spot.z = b.z + (dz / d) * 0.55; spot.yaw = Math.atan2(-dx, -dz);
      anchor.set(b.x, ground(b.x, b.z) + 0.8, b.z);
      return true;
    },
    enter() {
      phase = 'catch'; t = 0;
      const av = k.player.av; av.setPose('crouch', 0.8); av.setHands('free');
      H.squat(true);
      set({ title: '抱鸡', hint: '它一蹲，不跑了' });
    },
    exit() {
      if (phase === 'carry') { H.carry(null); }
      hand.removeFromParent();
      const av = k.player.av; av.reach('R', null); av.reach('L', null); av.setPose('stand');
    },
    update(dt) {
      t += dt;
      const av = k.player.av;
      if (phase === 'catch') {
        const b = H.strayBird();
        if (b) { av.reach('R', _v.set(b.x, ground(b.x, b.z) + 0.15, b.z), { rate: 6 }); av.reach('L', _v.set(b.x, ground(b.x, b.z) + 0.12, b.z), { rate: 6 }); }
        if (t > 1.1) {
          // 抱起来：挂在胸前一点，两手托着
          av.joints.chest.add(hand); hand.position.set(0, -0.2, 0.26); hand.rotation.set(0, 0, 0);
          H.squat(false); H.carry(hand); av.setPose('stand', 0.8);
          k.sfxAt('flap', { x: k.player.pos.x, z: k.player.pos.z, vel: 0.35 }); k.sfxAt('hen', { x: k.player.pos.x, z: k.player.pos.z, vel: 0.35 });
          phase = 'carry'; show();
        }
      } else if (phase === 'carry') {
        const cpos = hand.getWorldPosition(_c), y = k.player.yaw, rx = -Math.cos(y), rz = Math.sin(y);
        av.reach('R', _v.set(cpos.x + rx * 0.1, cpos.y - 0.06, cpos.z + rz * 0.1), { rate: 10 });
        av.reach('L', _w.set(cpos.x - rx * 0.1, cpos.y - 0.06, cpos.z - rz * 0.1), { rate: 10 });
        if (Math.floor(t) !== Math.floor(t - dt)) show();
      } else if (phase === 'put') {
        if (t > 0.9 && t - dt <= 0.9) {
          H.carry(null); hand.removeFromParent(); av.reach('R', null); av.reach('L', null); av.setPose('stand', 0.8);
          if (H.lost.state === 'back') { phase = 'over'; k.log({ kind: 'beast', text: '把走散的鸡送回乙家' }); set({ title: '抱鸡', text: '一落地，它扑扑翅膀，咯咯两声，钻回鸡群里去了。', choices: [{ id: 'done', label: '罢' }], done: true }); }
          else {
            // 乙家在哪一边：从行者此刻站的地方说（+x 东，+z 南）
            const home = H.lost.home, dx = home.x - k.player.pos.x, dz = home.z - k.player.pos.z, ew = dx > 0 ? '东' : '西', ns = dz > 0 ? '南' : '北';
            const dir = Math.abs(dx) > 2 * Math.abs(dz) ? ew : Math.abs(dz) > 2 * Math.abs(dx) ? ns : ew + ns;
            phase = 'over'; set({ title: '抱鸡', text: `一落地它又溜达开了。乙家在${dir}边，那家门前那一群里才是它的伴。`, choices: [{ id: 'done', label: '罢' }] });
          }
        }
      }
    },
    cmd(c) {
      if (c === 'done') { k.exitAct(); return; }
      if (c === 'put' && phase === 'carry') { phase = 'put'; t = 0; k.player.av.setPose('crouch', 0.8); }
    },
  } as Act & { on(): boolean };
}

// ———————————————————————— 接线：生灵要总装那边给的几样；过一夜；存档 ————————————————————————
function wire(k: Anlewo, F: Fauna) {
  F.hook.ripple = (x, z, s) => k.land.ripple(x, z, s);
  F.hook.splash = (x, y, z, n) => k.fx?.burst('splash', new THREE.Vector3(x, y, z), n);
  F.hook.note = (t) => k.note(t);
  F.hook.loop = (name, level, at) => k.events.loop?.(name, level, at);
  F.fish.ripple = (x, z, s) => k.land.ripple(x, z, s);
  F.fish.splash = (x, y, z, n) => k.fx?.burst('splash', new THREE.Vector3(x, y, z), n ?? 5);
  // 自家鸡埘的蛋：每天两三个，存在 'beasts' 那一份里
  const lay = (day: number) => {
    const m = mem(k).eggs;
    if (m && m.day === day) F.hens.newLay(day, m.n, m.laid, m.taken);
    else { const n = 1 + ((day * 7 + 3) % 3 === 0 ? 0 : 1) + ((day * 13 + 5) % 4 === 0 ? 1 : 0); F.hens.newLay(day, n, 0, 0); saveEggs(k, F); }
  };
  lay(k.day);
  k.onDay.push((d) => lay(d));
  F.hens.onLaid = () => saveEggs(k, F);
  // 难得一见的：头一回看见，画面下方浮一句（一天一回）
  const seen = new Map<string, number>();
  const geese = PAIRS.find((p) => p.b === '旅雁两三行');
  F.sky.onSight = (w) => {
    if (seen.get(w) === k.day) return;
    seen.set(w, k.day);
    if (w === 'geese' && geese) k.note(`${geese.a}，${geese.b}。——邵雍《${geese.from}》`);
    else if (w === 'crows') k.note('寒鸦一阵阵往北坡的林子里落。');
    else if (w === 'crane') k.note('一对白鹤顺着伊水飞过去。');
  };
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _h = new THREE.Vector3(), _m = new THREE.Matrix4();

export function create(k: Anlewo): Act[] {
  const F = faunaOf(k);
  if (!F) return [];
  try { wire(k, F); } catch (e) { console.warn('生灵的接线没接上', e); }
  const out: Array<Act | null> = [];
  for (const mk of [feedHens, eggs, feedFish, petDog, teaseCat, herdDucks, (kk: Anlewo) => ants(kk), oxHay, catchHen] as Array<(k: Anlewo, F: Fauna) => Act | null>) {
    try { out.push(mk(k, F)); } catch (e) { console.warn('与生灵的事有一件没备好', e); }
  }
  return out.filter((a): a is Act => !!a);
}
