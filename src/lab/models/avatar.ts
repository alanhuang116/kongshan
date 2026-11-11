/**
 * 行者（小人）在台子上：
 *   avatar       一个人，按网址参数摆姿态：
 *                pose=stand|kneel|sit|crouch  from=（先摆这个姿态，再换到 pose，停在第 k 秒看过渡）  k=0.45  dur=0.9
 *                hands=free|sleeve|pray|lap   bow=0…1  bowt=（俯身开始后第几秒，默认等它落定）
 *                speed=1.9  phase=0…1  climb=坡度  turn=角速度   look=x,y,z（相对小人）
 *                reach=L|R|LR  rp=x,y,z（相对小人，右手的；左手取镜像）  rd=x,y,z（指向）  stick=1（右手挂一根 0.34 的小棍）
 *                seat=zafu|kneeler  sz=（拜垫中心在人前多少，默认 0.1）  yaw=度  live=1（一直动着；speed>0 时绕圈走）
 *   avatarWalk   一排八个，定格在一个步态周期的八个相位：speed=1.9 row=z|x climb= hands=
 *   avatarPoses  站 / 拢袖 / 合十 / 鞠躬 / 跪 / 叩拜一半 / 叩拜到底 / 坐 / 蹲 / 左手够球 / 右手够球 / 右手持棍；sel=4,5,6 只看这几个（排成一排）  face=各自转多少度
 *   avatarScale  站在三米的门框里，旁边是蒲团、拜垫、香炉；后排一个坐在蒲团上、一个跪在拜垫上
 *   avatarStairs 上下台阶（每级高 rise=0.155、进深 depth=0.34）：左边四个往上走，右边四个往下走，各停在不同的地方；ground=0 则不给真实地面（只按坡）
 *   avatarStats  量 update 的耗时、三角数、绘制次数（打在控制台的 warn 里）
 */
import * as THREE from 'three';
import type { LabCtx, Make } from '../models';
import * as P from '../../world/props';
import { boxUp, cylUp, merge, sphere, tint } from '../../world/core/geo';
import { Figure, type Seat } from '../../world/avatar/figure';
import type { HandsName, PoseName, Side } from '../../world/avatar/types';

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qs.has(k) && qs.get(k) !== '' ? Number(qs.get(k)) : d);
const str = (k: string, d: string) => qs.get(k) ?? d;
const vec = (k: string): THREE.Vector3 | null => { const s = qs.get(k); if (!s) return null; const [x, y, z] = s.split(',').map(Number); return new THREE.Vector3(x, y, z); };
const DT = 1 / 90;
type Move = { speed: number; climb?: number; turn?: number };
const STILL: Move = { speed: 0 };

/** 一个人和他脚下的架子：slot 定在台子上的位置与朝向；lift 是垫子的高；holder 把「走出去的那段路」挪回来 */
interface Rig { slot: THREE.Group; lift: THREE.Group; holder: THREE.Group; av: Figure; t: number }
function rig(c: LabCtx, x = 0, z = 0, yaw = 0): Rig {
  const slot = new THREE.Group(), lift = new THREE.Group(), holder = new THREE.Group(), av = new Figure(c.mats, c.q);
  slot.position.set(x, 0, z); slot.rotation.y = yaw; slot.add(lift); lift.add(holder); holder.add(av.root);
  return { slot, lift, holder, av, t: 0 };
}
/** 走一帧：真的把 root 往前挪（小人靠 root 在世界里的位移算袖子的惯性） */
function step(r: Rig, m: Move) {
  r.av.root.position.z += m.speed * DT; r.av.root.position.y += m.speed * (m.climb ?? 0) * DT;
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
const ball = (c: LabCtx, p: THREE.Vector3, r = 0.022) => { const m = new THREE.Mesh(tint(sphere(r, 12, 8), 0.9, 0.35, 0.2), c.mats.paper); m.position.copy(p); m.castShadow = true; return m; };
/** 一根 0.34 长的小棍（沿 +y，握在下端往上 0.06 处） */
const stick = (c: LabCtx) => { const m = new THREE.Mesh(cylUp(0.006, 0.008, 0.34, 8).translate(0, -0.06, 0), c.mats.woodPale); m.castShadow = true; return m; };
/** 垫子：摆在人身下，把人垫高，并告诉小人垫子有多大（垫子外面的衣摆会垂下去） */
function seat(c: LabCtx, r: Rig, kind: string | null, sz = 0.1) {
  if (kind === 'zafu') { r.slot.add(P.zafu(c.mats, c.q)); r.lift.position.y = 0.14; r.av.setSeat({ h: 0.14, r: 0.31 }); }
  else if (kind === 'kneeler') { const k = P.kneeler(c.mats, c.q); k.position.z = sz; r.slot.add(k); r.lift.position.y = 0.17; r.av.setSeat({ h: 0.17, hx: 0.39, hz: 0.26, cz: sz } satisfies Seat); }
}
const local = (r: Rig, p: THREE.Vector3) => { r.slot.updateWorldMatrix(true, false); return p.clone().applyMatrix4(r.slot.matrixWorld); };
const mirror = (p: THREE.Vector3) => new THREE.Vector3(-p.x, p.y, p.z);

interface Spec { pose?: PoseName; hands?: HandsName; bow?: number; seat?: string; reach?: Side; rp?: THREE.Vector3; rd?: THREE.Vector3; stick?: boolean; look?: THREE.Vector3 }
function posed(c: LabCtx, x: number, z: number, s: Spec, yaw = 0): Rig {
  const r = rig(c, x, z, yaw);
  seat(c, r, s.seat ?? null);
  r.av.setPose(s.pose ?? 'stand', 0); r.av.setHands(s.hands ?? 'free', 0);
  r.av.bow = s.bow ?? 0;
  if (s.look) r.av.lookAt(local(r, s.look));
  if (s.reach && s.rp) {
    const wp = local(r, s.rp);
    r.av.reach(s.reach, wp, { dir: s.rd ? s.rd.clone().applyQuaternion(r.slot.quaternion) : undefined });
    if (!s.stick) r.slot.add(ball(c, s.rp.clone()));
  }
  if (s.stick) r.av.joints.handR.add(stick(c));
  run(r, 3);
  return r;
}

const MODELS: Record<string, Make> = {
  avatar: (c) => {
    const g = new THREE.Group();
    const r = rig(c, 0, 0, (num('yaw', 0) * Math.PI) / 180); g.add(r.slot);
    const av = r.av, pose = str('pose', 'stand') as PoseName, from = qs.get('from') as PoseName | null;
    seat(c, r, qs.get('seat'), num('sz', 0.1));
    av.setHands(str('hands', 'free') as HandsName, 0);
    if (from) { av.setPose(from, 0); run(r, 0.6); av.setPose(pose, num('dur', 0.9)); run(r, num('k', 0.45)); } else av.setPose(pose, 0);
    const look = vec('look'); if (look) av.lookAt(local(r, look));
    const rs = qs.get('reach');
    if (rs) {
      const rp = vec('rp') ?? new THREE.Vector3(-0.2, 1.2, 0.42), rd = vec('rd');
      for (const side of ['L', 'R'] as Side[]) if (rs.includes(side)) {
        const p = side === 'R' ? rp : mirror(rp);
        av.reach(side, local(r, p), { dir: rd ? (side === 'R' ? rd : mirror(rd)).clone().applyQuaternion(r.slot.quaternion) : undefined, rate: num('rate', 10) });
        r.slot.add(ball(c, p));
      }
    }
    if (qs.get('stick')) av.joints.handR.add(stick(c));
    av.bow = num('bow', 0);
    const m: Move = { speed: num('speed', 0), climb: num('climb', 0), turn: num('turn', 0) };
    if (qs.has('bowt')) run(r, num('bowt', 3));
    else if (m.speed > 0) walkTo(r, m, num('phase', 0.25));
    else if (!from) run(r, 3);
    settle(r);
    if (qs.get('live')) {
      // 一直动着：站着就是呼吸；走就绕着圈走
      const R = num('rad', 2.2); let a = 0;
      c.world.tick.push((dt, t) => {
        if (m.speed > 0) { a += (m.speed / R) * dt; r.holder.position.set(0, 0, 0); r.av.root.position.set(R * Math.cos(a) - R, 0, R * Math.sin(a)); r.av.root.rotation.y = -a; }
        av.update(dt, t, { speed: m.speed, climb: m.climb, turn: m.speed > 0 ? -m.speed / R : 0 });
      });
    }
    return g;
  },

  avatarWalk: (c) => {
    const g = new THREE.Group(), n = 8, alongX = str('row', 'z') === 'x', gap = num('gap', 1.0);
    const m: Move = { speed: num('speed', 1.45), climb: num('climb', 0), turn: num('turn', 0) };
    for (let i = 0; i < n; i++) {
      const k = (n - 1) / 2 - i, r = rig(c, alongX ? k * gap : 0, alongX ? 0 : k * gap);
      r.av.setHands(str('hands', 'free') as HandsName, 0);
      walkTo(r, m, (i + 0.001) / n);
      g.add(r.slot);
    }
    return g;
  },

  avatarPoses: (c) => {
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
      const r = posed(c, x, z, s, sel ? (num('face', 0) * Math.PI) / 180 : 0);
      settle(r);
      g.add(r.slot);
    });
    return g;
  },

  avatarScale: (c) => {
    const g = new THREE.Group(), { mats, q } = c;
    // 三米的门框
    const frame = new THREE.Mesh(merge([boxUp(0.18, 3.0, 0.18).translate(-0.85, 0, 0), boxUp(0.18, 3.0, 0.18).translate(0.85, 0, 0), boxUp(2.1, 0.22, 0.2).translate(0, 3.0, 0)]), mats.woodDark);
    frame.position.set(-2.2, 0, 0); frame.castShadow = true; g.add(frame);
    const a = posed(c, -2.2, 0.25, { hands: 'sleeve' }); g.add(a.slot);
    const b = posed(c, -0.75, 0.1, {}); g.add(b.slot);
    const z1 = P.zafu(mats, q); z1.position.set(0.15, 0, 0.1); g.add(z1);
    const k1 = P.kneeler(mats, q); k1.position.set(1.25, 0, 0.1); g.add(k1);
    const cen = P.courtCenser(mats, q); cen.position.set(3.3, 0, -0.3); g.add(cen);
    const d = posed(c, 2.25, 0.2, { hands: 'pray' }); g.add(d.slot);
    // 后排（靠近镜头的一排）：坐在蒲团上、跪在拜垫上
    const e = posed(c, 0.15, 1.7, { pose: 'sit', hands: 'lap', seat: 'zafu' }); g.add(e.slot);
    const f = posed(c, 1.25, 1.7, { pose: 'kneel', hands: 'pray', seat: 'kneeler' }); g.add(f.slot);
    return g;
  },

  avatarStairs: (c) => {
    const g = new THREE.Group(), rise = num('rise', 0.155), depth = num('depth', 0.34), N = 8, speed = num('speed', 1.45), useG = qs.get('ground') !== '0';
    const top = N * rise, end = N * depth;
    // 真实的地面：z<0 是平地，0…end 是台阶，再往后是平台
    const ground = (_x: number, z: number): number | null => (z < 0 ? 0 : z >= end ? top : (Math.floor(z / depth) + 1) * rise);
    const parts = [boxUp(2.4, top, 3.2).translate(0, 0, end + 1.6)];
    for (let k = 0; k < N; k++) parts.push(boxUp(2.4, (k + 1) * rise, depth).translate(0, 0, (k + 0.5) * depth));
    const st = new THREE.Mesh(merge(parts), c.mats.stone); st.receiveShadow = true; st.castShadow = true; g.add(st);
    // 与 player.ts 同样的办法给 root 定高：身前身后各 0.17 米内地面的平均（走着）；坡度取同一段
    const walk = (x: number, z0: number, dir: 1 | -1, secs: number) => {
      const av = new Figure(c.mats, c.q), r = av.root;
      r.position.set(x, ground(x, z0)!, z0); r.rotation.y = dir > 0 ? 0 : Math.PI; g.add(r);
      if (useG) av.setGround(ground);
      av.setHands(str('hands', 'free') as HandsName, 0);
      let cl = 0, t = 0;
      for (let i = 0, n = Math.round(secs / DT); i < n; i++) {
        const z = r.position.z + dir * speed * DT;
        let s = 0; for (let k = -2; k <= 2; k++) s += ground(x, z + k * 0.085)!;
        const slope = ((ground(x, z + dir * 0.17)! - ground(x, z - dir * 0.17)!) / 0.34);
        cl += (slope - cl) * Math.min(1, DT * 6);
        r.position.z = z; r.position.y += (s / 5 - r.position.y) * Math.min(1, DT * 13);
        t += DT; av.update(DT, t, { speed, climb: cl });
      }
      return av;
    };
    const T = [0.8, 1.35, 1.9, 2.45];
    const only = qs.get('only');           // only=up|down：只看上行或下行的
    if (only !== 'down') for (const s of T) walk(-0.5, -1.5, 1, s + num('dt', 0));
    if (only !== 'up') for (const s of T) walk(0.5, end + 1.5, -1, s + num('dt', 0));
    return g;
  },

  avatarStats: (c) => {
    const g = new THREE.Group(), r = rig(c); g.add(r.slot);
    const av = r.av;
    const time = (label: string, m: Move, n = 4000) => {
      run(r, 0.5, m);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) av.update(1 / 60, i / 60, m);
      return `${label} ${((performance.now() - t0) / n).toFixed(4)}ms`;
    };
    const out = [time('站', STILL), time('走', { speed: 1.45 }), time('跑', { speed: 3.0, turn: 1 })];
    av.setGround((_x, z) => (z < 0 ? 0 : Math.floor(z / 0.34) * 0.155)); out.push(time('走（量着地面）', { speed: 1.45, climb: 0.45 })); av.setGround(null);
    av.setPose('kneel', 0); av.setHands('pray', 0); av.bow = 1; out.push(time('叩拜', STILL));
    av.setPose('sit', 0); av.setHands('lap', 0); av.bow = 0; av.setSeat({ h: 0.14, r: 0.31 }); out.push(time('坐（有垫）', STILL));
    av.setSeat(null); av.setPose('stand', 0); av.setHands('free', 0); run(r, 2);
    // 各姿态下整个人最低到哪（不该伸到地面以下）
    const low: string[] = [], box = new THREE.Box3();
    const minY = (label: string) => { av.root.position.set(0, 0, 0); run(r, 2.5); av.root.position.set(0, 0, 0); av.update(DT, 0, STILL); r.slot.updateMatrixWorld(true); box.setFromObject(av.root, true); low.push(`${label} ${box.min.y.toFixed(3)}`); };
    minY('站'); av.bow = 1; minY('鞠躬'); av.bow = 0;
    av.setPose('kneel', 0); minY('跪'); av.bow = 1; minY('叩拜'); av.bow = 0;
    av.setPose('sit', 0); minY('坐'); av.setPose('crouch', 0); minY('蹲');
    av.setPose('stand', 0); run(r, 2);
    console.warn('STATS 最低点 ' + low.join('  '));
    // 叩拜到底时头的最低点（额头离地多少）：平地；垫着拜垫
    const headLow = (): number => { av.root.position.set(0, 0, 0); run(r, 3); av.root.position.set(0, 0, 0); av.update(DT, 0, STILL); r.slot.updateMatrixWorld(true); return box.setFromObject(av.root.getObjectByName('avatar:head')!, true).min.y; };
    av.setPose('kneel', 0); av.setHands('pray', 0); av.bow = 1; const h0 = headLow();
    av.setSeat({ h: 0.15, hx: 0.39, hz: 0.26 }); const h1 = headLow() + 0.15; av.setSeat(null);
    av.bow = 0; av.setPose('stand', 0); av.setHands('free', 0); run(r, 2);
    // 走台阶时每帧量几次地面
    let calls = 0; const stair = (_x: number, z: number) => { calls++; return z < 0 ? 0 : Math.floor(z / 0.34) * 0.155; };
    av.root.position.set(0, 0, -30); av.setGround((_x, _z) => { calls++; return 0; }); run(r, 1, { speed: 1.45 }); calls = 0; run(r, 4, { speed: 1.45 }); const flat = calls / Math.round(4 / DT);
    av.root.position.set(0, 0, -1); av.setGround(stair); run(r, 1, { speed: 1.45, climb: 0.45 }); calls = 0; run(r, 4, { speed: 1.45, climb: 0.45 }); const st = calls / Math.round(4 / DT);
    av.setGround(null); av.root.position.set(0, 0, 0); run(r, 2);
    console.warn(`STATS 叩拜时头最低：平地 ${h0.toFixed(3)}  拜垫前的地面以上 ${h1.toFixed(3)}；量地面的次数/帧：平地 ${flat.toFixed(1)}  台阶 ${st.toFixed(1)}`);
    console.warn(`STATS 小人 ${c.q.tier}：三角 ${av.stats.triangles}  绘制 ${av.stats.draws}  update：${out.join('  ')}`);
    return g;
  },
};
export default MODELS;
