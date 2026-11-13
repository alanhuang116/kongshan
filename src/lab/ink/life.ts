/**
 * 台子上看人与生灵。
 *
 * 小人（avatar/）：
 *   avatar       一个人，按网址参数摆姿态：
 *                who=farmer|picker|kid1|…（村里人的打扮；不给就是读书人）
 *                pose=stand|kneel|sit|crouch  from=（先摆这个姿态，再换到 pose，停在第 k 秒看过渡）  k=0.45  dur=0.9
 *                hands=free|sleeve|pray|lap   bow=0…1  bowt=（俯身开始后第几秒，默认等它落定）
 *                speed=1.45  phase=0…1  climb=坡度  turn=角速度   look=x,y,z（相对小人，头看向哪）
 *                reach=L|R|LR  rp=x,y,z（相对小人，右手的；左手取镜像）  rd=x,y,z（指向）  stick=1（右手挂一根 0.34 的小棍）
 *                seat=zafu（蒲团，配 pose=sit）| stool | bench（凳，配 pose=bench；sh=凳高 sz=凳心在脚后多远）  yaw=度  live=1（一直动着；speed>0 时绕圈走）
 *   avatarWalk   一排八个，定格在一个步态周期的八个相位：speed=1.45 row=z|x climb= hands= who=
 *   avatarPoses  站 / 拢袖 / 合十 / 鞠躬 / 跪 / 叩拜一半 / 叩拜到底 / 坐 / 蹲 / 左手够球 / 右手够球 / 右手持棍；sel=4,5,6 只看这几个  face=各自转多少度  who=
 *   looks        村里人的打扮排成一排（连读书人）；far=1 再在四十米外排一排
 *
 * 人物与生灵（life/）：farmer picker kids elder carpenters fisher animals lifeAll——都是整村的人与生灵，只是机位各对着一处。
 *   t=几点  season=  w=  clock=每秒走几个时辰  p=x,z 行者站在哪（惊鸟、引狗、让人抬头）  tx= ty= tz= d= az= el= 挪机位
 */
import * as THREE from 'three';
import type { LabCtx, LabMake } from '../ink-lab';
import { Figure } from '../../world/avatar/figure';
import type { HandsName, Look, PoseName, Seat, Side } from '../../world/avatar/types';
import { boxUp, cylUp, sphere } from '../../world/core/geo';
import { createLand } from '../../world/env/land';
import { PIG, wash } from '../../world/ink/ink';
import { createLife } from '../../world/life';
import { LOOKS, type LookName } from '../../world/life/looks';
import { Person } from '../../world/life/person';
import { FIELD, footY } from '../../world/life/spots';
import { SITE } from '../../world/site';
import { setTerrain, useSolids, type SolidLike } from '../../world/walk';

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qs.has(k) && qs.get(k) !== '' ? Number(qs.get(k)) : d);
const str = (k: string, d: string) => qs.get(k) ?? d;
const vec = (k: string): THREE.Vector3 | null => { const s = qs.get(k); if (!s) return null; const [x, y, z] = s.split(',').map(Number); return new THREE.Vector3(x, y, z); };
const DT = 1 / 90;
type Move = { speed: number; climb?: number; turn?: number };
const STILL: Move = { speed: 0 };
const who = (): Partial<Look> | undefined => { const w = qs.get('who') as LookName | null; return w && LOOKS[w] ? LOOKS[w] : undefined; };

const M = {
  red: wash({ pig: PIG.zhu, dens: 1, body: 1, shade: 1.2 }),
  wood: wash({ pig: [0.72, 0.6, 0.5], dens: 1.9, shade: 1.5, streak: [22, 1.2, 0.35] }),
  straw: wash({ pig: PIG.mao, dens: 1.3, shade: 1.5, streak: [30, 2, 0.4] }),
  stone: wash({ pig: PIG.mo, dens: 0.8, shade: 2.0, cun: 1.1, grain: 1.2 }),
};

/** 一个人和他脚下的架子：slot 定在台子上的位置与朝向；lift 是垫子的高；holder 把「走出去的那段路」挪回来 */
interface Rig { slot: THREE.Group; lift: THREE.Group; holder: THREE.Group; av: Figure; t: number }
function rig(c: LabCtx, x = 0, z = 0, yaw = 0, look?: Partial<Look>): Rig {
  const slot = new THREE.Group(), lift = new THREE.Group(), holder = new THREE.Group(), av = new Figure(c.q, look);
  slot.position.set(x, 0, z); slot.rotation.y = yaw; slot.add(lift); lift.add(holder); holder.add(av.root);
  return { slot, lift, holder, av, t: 0 };
}
/** 走一帧：真的把 root 往前挪（小人靠 root 在世界里的位移算袖子的惯性）。speed 是他自己尺度里的速度 */
function step(r: Rig, m: Move) {
  const k = r.av.look.scale;
  r.av.root.position.z += m.speed * k * DT; r.av.root.position.y += m.speed * k * (m.climb ?? 0) * DT;
  r.t += DT; r.av.update(DT, r.t, m);
}
function run(r: Rig, secs: number, m: Move = STILL) { for (let i = 0, n = Math.max(1, Math.round(secs / DT)); i < n; i++) step(r, m); }
/** 把架子往回挪，看上去人还在原处 */
function settle(r: Rig) { r.holder.position.copy(r.av.root.position).multiplyScalar(-1); }
/** 先走一阵（步子、下摆、袖子都进了状态），再走到指定的相位停住 */
function walkTo(r: Rig, m: Move, phase: number, warm = 2.4) {
  run(r, warm, m);
  for (let i = 0; i < 500; i++) {
    const a = r.av.gaitPhase; step(r, m); const b = r.av.gaitPhase;
    if (a <= b ? phase > a && phase <= b : phase > a || phase <= b) break;
  }
  settle(r);
}
const ball = (p: THREE.Vector3, r = 0.022) => { const m = new THREE.Mesh(sphere(r, 12, 8), M.red); m.position.copy(p); return m; };
/** 一根 0.34 长的小棍（沿 +y，握在下端往上 0.06 处） */
const stick = () => new THREE.Mesh(cylUp(0.006, 0.008, 0.34, 8).translate(0, -0.06, 0), M.wood);
/** 垫子：摆在人身下，把人垫高，并告诉小人垫子有多大（垫子外面的衣摆会垂下去） */
function seat(r: Rig, kind: string | null) {
  const k = r.av.look.scale;
  if (kind === 'zafu') { r.slot.add(new THREE.Mesh(cylUp(0.3, 0.31, 0.14 * k, 20), M.straw)); r.lift.position.y = 0.14 * k; r.av.setSeat({ h: 0.14, r: 0.31 }); }
  else if (kind === 'stool' || kind === 'bench') {
    // 凳（pose=bench 用）：root 仍在脚踩的地上；凳面高 sh、凳心在脚后 sz（都按他自己的尺度）
    const h = num('sh', 0.44), cz = num('sz', -0.34);
    r.slot.add(new THREE.Mesh((kind === 'stool' ? cylUp(0.19 * k, 0.2 * k, h * k, 14) : boxUp(1.6 * k, h * k, 0.44 * k)).translate(0, 0, cz * k), M.stone));
    r.av.setSeat({ h, cz } satisfies Seat);
  }
}
const local = (r: Rig, p: THREE.Vector3) => { r.slot.updateWorldMatrix(true, false); return p.clone().applyMatrix4(r.slot.matrixWorld); };
const mirror = (p: THREE.Vector3) => new THREE.Vector3(-p.x, p.y, p.z);

interface Spec { pose?: PoseName; hands?: HandsName; bow?: number; seat?: string; reach?: Side; rp?: THREE.Vector3; rd?: THREE.Vector3; stick?: boolean; look?: THREE.Vector3 }
function posed(c: LabCtx, x: number, z: number, s: Spec, yaw = 0, look?: Partial<Look>): Rig {
  const r = rig(c, x, z, yaw, look);
  seat(r, s.seat ?? null);
  r.av.setPose(s.pose ?? 'stand', 0); r.av.setHands(s.hands ?? 'free', 0);
  r.av.bow = s.bow ?? 0;
  if (s.look) r.av.lookAt(local(r, s.look));
  if (s.reach && s.rp) {
    const wp = local(r, s.rp);
    r.av.reach(s.reach, wp, { dir: s.rd ? s.rd.clone().applyQuaternion(r.slot.quaternion) : undefined });
    if (!s.stick) r.slot.add(ball(s.rp.clone()));
  }
  if (s.stick) r.av.joints.handR.add(stick());
  run(r, 3);
  return r;
}

const avatar: LabMake = (c) => {
  const g = new THREE.Group();
  const r = rig(c, 0, 0, (num('yaw', 0) * Math.PI) / 180, who()); g.add(r.slot);
  const av = r.av, pose = str('pose', 'stand') as PoseName, from = qs.get('from') as PoseName | null;
  seat(r, qs.get('seat'));
  av.setHands(str('hands', 'free') as HandsName, 0);
  if (from) { av.setPose(from, 0); run(r, 0.6); av.setPose(pose, num('dur', 0.9)); run(r, num('k', 0.45)); } else av.setPose(pose, 0);
  const look = vec('look'); if (look) av.lookAt(local(r, look));
  const rs = qs.get('reach');
  if (rs) {
    const rp = vec('rp') ?? new THREE.Vector3(-0.2, 1.2, 0.42), rd = vec('rd');
    for (const side of ['L', 'R'] as Side[]) if (rs.includes(side)) {
      const p = side === 'R' ? rp : mirror(rp);
      av.reach(side, local(r, p), { dir: rd ? (side === 'R' ? rd : mirror(rd)).clone().applyQuaternion(r.slot.quaternion) : undefined, rate: num('rate', 10) });
      r.slot.add(ball(p));
    }
  }
  if (qs.get('stick')) av.joints.handR.add(stick());
  av.bow = num('bow', 0);
  const m: Move = { speed: num('speed', 0), climb: num('climb', 0), turn: num('turn', 0) };
  if (qs.has('bowt')) run(r, num('bowt', 3));
  else if (m.speed > 0) walkTo(r, m, num('phase', 0.25));
  else if (!from) run(r, 3);
  settle(r);
  let update: ((dt: number, t: number) => void) | undefined;
  if (qs.get('live')) {
    // 一直动着：站着就是呼吸；走就绕着圈走
    const R = num('rad', 2.2), k = av.look.scale; let a = 0;
    update = (dt, t) => {
      if (m.speed > 0) { a += ((m.speed * k) / R) * dt; r.holder.position.set(0, 0, 0); av.root.position.set(R * Math.cos(a) - R, 0, R * Math.sin(a)); av.root.rotation.y = -a; }
      av.update(dt, t, { speed: m.speed, climb: m.climb, turn: m.speed > 0 ? (-m.speed * k) / R : 0 });
    };
  }
  console.warn(`STATS 小人 ${c.q.tier}：三角 ${av.stats.triangles}  绘制 ${av.stats.draws}`);
  return { obj: g, update, view: { az: 25, el: 8, d: 4.2, tx: 0, ty: 0.85, tz: 0 } };
};

const avatarWalk: LabMake = (c) => {
  const g = new THREE.Group(), n = 8, alongX = str('row', 'z') === 'x', gap = num('gap', 1.0);
  const m: Move = { speed: num('speed', 1.45), climb: num('climb', 0), turn: num('turn', 0) };
  for (let i = 0; i < n; i++) {
    const k = (n - 1) / 2 - i, r = rig(c, alongX ? k * gap : 0, alongX ? 0 : k * gap, 0, who());
    r.av.setHands(str('hands', 'free') as HandsName, 0);
    walkTo(r, m, (i + 0.001) / n);
    g.add(r.slot);
  }
  return { obj: g, view: { az: 90, el: 6, d: 9, tx: 0, ty: 0.85, tz: 0 } };
};

const avatarPoses: LabMake = (c) => {
  const g = new THREE.Group();
  const list: Spec[] = [
    {},
    { hands: 'sleeve' },
    { hands: 'pray' },
    { hands: 'pray', bow: 1 },
    { pose: 'kneel', hands: 'pray' },
    { pose: 'kneel', hands: 'pray', bow: 0.5 },
    { pose: 'kneel', hands: 'pray', bow: 1 },
    { pose: 'sit', hands: 'lap', seat: 'zafu' },
    { pose: 'crouch' },
    { reach: 'L', rp: new THREE.Vector3(0.24, 1.38, 0.4), rd: new THREE.Vector3(0, 1, 0) },
    { reach: 'R', rp: new THREE.Vector3(-0.3, 0.92, 0.46), rd: new THREE.Vector3(0, -0.4, 1).normalize(), hands: 'sleeve' },
    { stick: true, reach: 'R', rp: new THREE.Vector3(-0.2, 1.12, 0.34), rd: new THREE.Vector3(0, 0.75, 0.66).normalize() },
  ];
  // sel=4,5,6：只看这几个，排成一排（左起）
  const sel = qs.get('sel') ? qs.get('sel')!.split(',').map(Number) : null, gx = num('gap', 1.15), gz = 1.7;
  list.forEach((s, i) => {
    const at = sel ? sel.indexOf(i) : i;
    if (at < 0) return;
    const col = i % 6, row = Math.floor(i / 6);
    const x = sel ? ((sel.length - 1) / 2 - at) * gx : (2.5 - col) * gx + (row ? gx * 0.5 : 0), z = sel ? 0 : row ? 0 : gz;
    const r = posed(c, x, z, s, sel ? (num('face', 0) * Math.PI) / 180 : 0, who());
    settle(r);
    g.add(r.slot);
  });
  return { obj: g, view: { az: 12, el: 12, d: 8.5, tx: 0, ty: 0.8, tz: 0.8 } };
};

/** 村里人的打扮排成一排（最左是读书人）。far=1：四十米外再排一排，看远处还认不认得出 */
const looks: LabMake = (c) => {
  const g = new THREE.Group(), names = Object.keys(LOOKS) as LookName[], face = (num('face', 0) * Math.PI) / 180;
  const row = (z: number) => {
    [undefined, ...names].forEach((n, i) => {
      const r = rig(c, ((names.length) / 2 - i) * 0.95, z, face, n ? LOOKS[n] : undefined);
      if (qs.get('hands')) r.av.setHands(str('hands', 'free') as HandsName, 0);
      run(r, 2); settle(r); g.add(r.slot);
    });
  };
  row(0);
  if (qs.get('far')) row(-num('far', 40));
  return { obj: g, view: { az: 0, el: 8, d: 9.5, tx: 0, ty: 0.85, tz: 0 } };
};

// ———————————————————————— 人物与生灵（life/）：摆在总图上的真位置，脚下是真的地与屋舍 ————————————————————————
/**
 * 整村的人与生灵。钟点用 t=（台子的参数）；另有：
 *   clock=每秒走几个时辰（0 不走）  p=x,z 行者站在哪（不给就在天边：没人惊动它们）  build=0 不要屋舍  land=0 不要地  flora=1 连草木
 *   window.__life 里有 life、set(hour)、player（现场改着看）。
 */
async function lifeScene(c: LabCtx, view: Partial<{ az: number; el: number; d: number; tx: number; ty: number; tz: number }>) {
  const g = new THREE.Group(), land = qs.get('land') !== '0' ? createLand(c.q, c.season) : null;
  if (land) { g.add(land.group); setTerrain(land.height); }
  if (qs.get('build') !== '0') {
    // 屋舍是别人搭的：取得到就摆上（看人与凳、桌、船对不对得上），取不到也不碍事
    try { const m = await import('../../world/build/make'); const B = await m.assemble({ q: c.q }); g.add(B.group); (window as unknown as Record<string, unknown>).__build = B; const sol = B.group.userData.solids as SolidLike[] | undefined; if (sol?.length) useSolids(sol); } catch (e) { console.warn('屋舍没取到', e); }
  }
  // 草木也是别人种的：flora=1 时摆上（看采桑的人够不够得着枝、雀落的那一枝对不对）
  let flora: { group: THREE.Group; update(dt: number, t: number, o: { night: number; wind: number; player: THREE.Vector3 }): void } | null = null;
  if (qs.get('flora') === '1') { try { const m = await import('../../world/env/flora/index'); flora = m.createFlora({ q: c.q, season: c.season }); g.add(flora.group); } catch (e) { console.warn('草木没取到', e); } }
  const shots: Record<string, number> = {};
  const life = createLife({ q: c.q, season: c.season, sfx: (s) => { shots[s] = (shots[s] ?? 0) + 1; } });
  g.add(life.group);
  const p = vec('p'), player = new THREE.Vector3(p ? p.x : -900, 0, p ? p.y : -900);
  if (p) { player.y = footY(player.x, player.z); const m = new THREE.Mesh(cylUp(0.2, 0.2, 1.6, 8), M.red); m.position.copy(player); g.add(m); }
  let hour = c.atmos.hour;
  const clock = num('clock', 0);
  // manual：台子不再自己推它，由外面一步一步地推（tests 里把一整天走一遍用）；watch(true)：当作人人有人看着
  const L = { life, player, shots, manual: false, set: (h: number) => { hour = h; c.atmos.setHour(h, true); }, watch: (on: boolean) => { Person.watchAll = on; }, camera: c.world.camera, ground: footY };
  (window as unknown as Record<string, unknown>).__life = L;
  return {
    obj: g, view,
    update(dt: number, t: number) {
      flora?.update(dt, t, { night: c.atmos.night, wind: c.atmos.wind, player });
      if (L.manual) return;
      if (clock) { hour = (hour + clock * dt) % 24; c.atmos.setHour(hour, true); }
      life.update(dt, t, { hour, night: c.atmos.night, rain: c.atmos.w.rain, snow: c.atmos.w.snow, player, camera: c.world.camera });
    },
  };
}
const at = (x: number, z: number, d: number, az = 20, el = 14, up = 1.1) => ({ tx: x, ty: footY(x, z) + up, tz: z, d, az, el });
const school = SITE.houses.find((h) => h.id === 'school')!, houseA = SITE.houses.find((h) => h.id === 'a')!;

export const MODELS: Record<string, LabMake> = {
  avatar, avatarWalk, avatarPoses, looks,
  farmer: (c) => lifeScene(c, at((FIELD.x0 + FIELD.x1) / 2, (FIELD.z0 + FIELD.z1) / 2, 34, 30, 16)),
  picker: (c) => lifeScene(c, at((SITE.mulberry.x0 + SITE.mulberry.x1) / 2 - 3, (SITE.mulberry.z0 + SITE.mulberry.z1) / 2 - 2, 22, 30, 14)),
  kids: (c) => lifeScene(c, at(school.x, school.z + 1, 15, 4, 12)),
  elder: (c) => lifeScene(c, at(SITE.elm.x + 0.5, SITE.elm.z - 1, 11, 25, 12)),
  carpenters: (c) => lifeScene(c, at(SITE.plank.x - 1, SITE.plank.z + 3.5, 17, 210, 14)),
  fisher: (c) => lifeScene(c, at(SITE.ferry.x + 4, SITE.ferry.z + 2, 16, 150, 12)),
  animals: (c) => lifeScene(c, at(houseA.x + 1, houseA.z + 5, 12, 20, 14)),
  lifeAll: (c) => lifeScene(c, { tx: 40, ty: 6, tz: 40, d: 150, az: 20, el: 34 }),
};
