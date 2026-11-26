/**
 * 骑牛（牛在棚里、或在田角歇着吃草的时候，王伯家那头黄牛）、骑驴（白天拴在碓房东头的那头灰驴）。
 *   走过去点「骑牛」「骑驴」：牲口站起来（卧着的先起身），你横坐上去——两腿垂在左边，身子坐直，随着它的步子轻轻起落。
 *   怎么走与平常一样：摇杆（W A S D），镜头在哪边「前」就是哪边；「疾」（Shift）走快些——牛还是牛的快慢，驴能小跑；点地面它自己走过去。
 *   它是牲口：转身有个慢，掉头要兜个小圈；进不了屋、过不了汀步，水深的地方不下去，碰到人会停下等。
 *   绕村一圈：牛棚、井、大槐树、村塾、碓房、洗衣埠、土地庙，到了头一处起表，挨个经过（哪个方向绕都行），回到起头那一处停表（榜 'ride'，用时少的在前）。
 *   下一处在哪，画里有一枚小签。骑牛时还能「吹笛」——牧童那样把短笛横在嘴边。
 *   哪里都能「下来」：它在那里吃一会儿草，过一阵自己慢慢走回去（棚里、田角、拴驴桩边）。
 *   同游的人看你：他们那边在你身下照样画着这头牛（驴），步子跟着你走（registerRemoteProp）。近处另有骑着的人：「邀某某赛一圈」，
 *   两边一起数三声出发，各绕各的一圈，回来比谁快。
 * 牲口与人怎么摆在 play/ride.ts；记圈在 play/games/lap.ts。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Pointer } from '../core/World';
import type { Act, Spot } from './types';
import type { Fauna } from '../life/fauna';
import { MOUNT, MountDonkey, MountOx, RING, SEAT, remoteDonkey, remoteOx, riderRoot, type MountKind } from '../play/ride';
import { DONKEY } from '../life/fauna/donkey';
import { Lap } from '../play/games/lap';
import { Match, inboxChoices, inviteChoices, type MatchHooks } from '../play/games/match';
import { DEBUG, afterFrame, cn, hasKb, rankText, shunning } from '../play/games/kit';
import { secsText } from '../play/games/boards';
import { report } from '../play/board';
import { V, clamp, onFrame, sfx, stateOf, wrap } from '../play/kit';
import { OX_SHED, OX_SHED_FRONT, footY } from '../life/spots';
import { blocked, boom, groundAt, passable, placeAt, setDynamic, type Disc, type SolidLike } from '../walk';
import { travel } from '../travel';
import { registerRemoteProp } from '../net/props';
import { getTogether } from '../net';
import { actIndex } from '../net/proto';
import { mats } from '../play/kit';

const faunaOf = (k: Anlewo): Fauna | null => (k.life as unknown as { fauna?: Fauna } | null)?.fauna ?? null;
const OP_GO = 10, OP_DONE = 11;
const XV = new THREE.Vector3(1, 0, 0);

/** 这一回正骑着的是哪一件（同一时候只骑一头） */
let riding: MountKind | null = null;

export function create(k: Anlewo): Act[] {
  const F = faunaOf(k);
  registerRemoteProp('ox', remoteOx());
  registerRemoteProp('donkey', remoteDonkey());
  if (!F) return [];
  // 骑牛、骑驴共用一条同游的线：邀、应、比赛的消息交给此刻正骑着的那一件（没在骑就交给牛那一件，好提一句「有人邀你」）
  const routes: Partial<Record<MountKind, MatchHooks>> = {};
  const to = () => routes[riding ?? 'ox'] ?? routes.donkey;
  const match = new Match('ride', ['ox', 'donkey'], {
    range: 45,
    invited: (fr, label) => to()?.invited?.(fr, label),
    start: (p, side, seed) => to()?.start?.(p, side, seed),
    msg: (op, d, fr) => to()?.msg?.(op, d, fr),
    end: (why, label) => to()?.end?.(why, label),
  });
  afterFrame(k, 'ride:match', (dt) => match.tick(dt));
  const out: Act[] = [];
  for (const kind of ['ox', 'donkey'] as MountKind[]) {
    try { const a = mkRide(k, kind, F, match, (h) => { routes[kind] = h; }); if (a) out.push(a); } catch (e) { console.warn(`骑${MOUNT[kind].name}没备好`, e); }
  }
  return out;
}

function mkRide(k: Anlewo, kind: MountKind, F: Fauna, match: Match, route: (h: MatchHooks) => void): Act | null {
  const M = MOUNT[kind], name = kind === 'ox' ? '骑牛' : '骑驴';
  const { state, set, put, flush } = stateOf(k);
  // —— 村里的那一头 ——
  const vox = F.ox, vdk = F.donkey;
  const village = {
    get present() { return kind === 'ox' ? vox.present && !vox.hitched : vdk.present; },
    get x() { return kind === 'ox' ? vox.x : vdk.q.x; }, get z() { return kind === 'ox' ? vox.z : vdk.q.z; }, get yaw() { return kind === 'ox' ? vox.yaw : vdk.q.yaw; },
    hide() { if (kind === 'ox') vox.parts.mesh.visible = false; else vdk.parts.mesh.visible = false; },
    /** 它挡路的那几个圆（骑着走的时候不算） */
    discs: (kind === 'ox' ? vox.blockers : [F.blockers[0]]) as Disc[],
  };
  // 牛：站着不动两秒以上才算歇着（被牵着走、正耕地的不能骑）
  let stillT = 0, lastX = 0, lastZ = 0;
  /** 同游的人里正骑着这一样的是谁（0：没有）；隔半秒看一回 */
  let takenBy = 0, takenT = 0;
  // —— 骑的那一份 ——
  const mox = kind === 'ox' ? new MountOx() : null, mdk = kind === 'donkey' ? new MountDonkey() : null;
  const mesh = (mox?.parts.mesh ?? mdk!.parts.mesh);
  mesh.visible = false;
  k.world.scene.add(mesh);
  if (mox) mox.ox.parts.cull = true; if (mdk) mdk.parts.cull = true;
  /** 骑的那一份：在哪、朝哪、多快；out 是不是换出来了（村里那一头藏着） */
  const S = { x: 0, z: 0, yaw: 0, v: 0, out: false, mode: 'idle' as 'idle' | 'ride' | 'graze' | 'home', t: 0, path: null as Array<[number, number]> | null, pi: 0, post: null as { x: number; z: number } | null };
  // 笛（骑牛时）：一根细竹
  const flute = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.42, 5).rotateZ(Math.PI / 2), mats().bamboo);
  flute.visible = false; flute.name = 'games:flute';
  k.world.scene.add(flute);

  /** 换出来：照着村里那一头的位置、朝向、样子 */
  const swapOut = () => {
    S.x = village.x; S.z = village.z; S.yaw = village.yaw; S.v = 0; S.out = true;
    if (mox) { mox.ox.put(S.x, S.z, S.yaw); mox.ox.lie = vox.lie; mox.ox.graze = vox.graze; mox.ox.hitched = false; mox.ox.present = true; }
    if (mdk) { const q = mdk.q, v = vdk.q; q.x = v.x; q.z = v.z; q.yaw = v.yaw; q.snap(DONKEY.STAND); for (const key of ['y', 'pitch', 'np', 'ny'] as const) (q.cur as unknown as Record<string, number>)[key] = (v.cur as unknown as Record<string, number>)[key]; S.post = { ...vdk.home }; }
    mesh.visible = true;
  };
  /** 换回去：村里那一头站到骑的那一份此刻的地方 */
  const swapBack = () => {
    S.out = false; S.mode = 'idle'; mesh.visible = false;
    if (kind === 'ox') vox.parts.mesh.visible = vox.present;
    else { const q = vdk.q; q.x = S.x; q.z = S.z; q.yaw = S.yaw; vdk.parts.mesh.visible = vdk.present; }
    if (mdk) mdk.hide();
  };

  // —— 走：一步能不能到（牲口的身子：前、中、后三处）——
  const others = (): Disc[] => (k.life?.blockers ?? []).filter((b) => !village.discs.includes(b as Disc)) as Disc[];
  const fits = (x: number, z: number, yaw: number, fromY: number): number | null => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const y = passable(x, z, fromY, 'ground', M.r);
    if (y == null || placeAt(x, z).indoor > 0.3) return null;
    for (const s of [1, -1]) {
      const px = x + fx * M.half * s, pz = z + fz * M.half * s, g = groundAt(px, pz);
      if (g == null || Math.abs(g - y) > 0.5 || blocked(px, pz, 'ground', M.r * 0.7) || placeAt(px, pz).indoor > 0.3) return null;
    }
    return y;
  };

  // —— 骑着：人、镜头、圈 ——
  type Phase = 'lead' | 'mount' | 'ride' | 'off';
  let phase: Phase = 'off', t = 0, kb = false, lap: Lap | null = null, lastSec = -1, fluteOn = false, fluteT = 0, dragAt = 0, turnKey = 0, mountT = 0, lieWait = 0;
  let goal: Array<[number, number]> | null = null, gi = 0, finished: number | null = null;
  /** 镜头：隔一会儿看一回身后那一线、此刻那一线过不过棚顶；过了要挪去的方位 */
  let camT = 0, behindOk = true, camGoal: number | null = null;
  const from = V(), root = V(), seat = V(), tmp = V(), tmp2 = V();
  let from2Yaw = 0;
  let riderYaw = 0, bob = 0, sway = 0;
  const keep = shunning(2);
  /** 牛在棚里没有；牵出来站到哪（棚口外一步，朝南） */
  const inShed = () => kind === 'ox' && Math.hypot(village.x - OX_SHED.x, village.z - OX_SHED.z) < 2.2;
  const LEAD = { x: OX_SHED_FRONT.x + Math.sin(OX_SHED_FRONT.yaw + Math.PI) * 0.9, z: OX_SHED_FRONT.z + Math.cos(OX_SHED_FRONT.yaw + Math.PI) * 0.9, yaw: OX_SHED_FRONT.yaw + Math.PI };
  /** 比赛（同游）：数三声的那一刻、对面的用时 */
  let race: { at: number; foe: number | null; me: number | null } | null = null;
  route({
    invited: (fr, label) => { k.note(`${label}邀你赛一圈——骑上牛或驴，点「${name}」里的「应邀」`, 'net'); if (k.act === act) view(true); },
    start: () => { race = { at: performance.now() + 3200, foe: null, me: null }; lap = null; finished = null; k.note(`与${match.label(match.peer)}赛一圈：数三声就走`, 'net'); view(true); },
    msg: (op, d) => {
      if (op === OP_DONE && race) { race.foe = d[2]; settleRace(); }
      else if (op === OP_GO) { race = { at: performance.now() + 3200, foe: null, me: null }; lap = null; finished = null; }
    },
    end: (why, label) => { if (why === 'left' || why === 'quit' || why === 'timeout') { k.note(`${label}${why === 'timeout' ? '久不应' : '走了'}，这一圈各骑各的`, 'net'); race = null; } else k.note(`${label}${why === 'busy' ? '正忙' : '谢绝了'}`, 'net'); if (k.act === act) view(true); },
  });
  const settleRace = () => {
    if (!race || race.me == null || race.foe == null) return;
    const foe = match.label(match.peer), mine = race.me, theirs = race.foe;
    k.note(mine < theirs ? `你先到：${secsText(mine)}，${foe}${secsText(theirs)}` : mine > theirs ? `${foe}先到：${secsText(theirs)}，你${secsText(mine)}` : `同时到：都是${secsText(mine)}`, 'net');
    race = null;
  };

  const nextTags = () => {
    const marks = lap ? lap.next() : RING.slice().sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z)).slice(0, 1);
    return marks.map((m, i) => ({ id: `mk:${m.id}`, text: m.name, sub: lap?.started ? (i === 0 && lap.n >= lap.total ? '回到这里' : '下一处') : lap ? '从这里起' : '绕村一圈从这里起', x: m.x, y: footY(m.x, m.z) + 2.2, z: m.z, kind: 'hot' }));
  };
  const hint = () => {
    if (phase === 'mount') return '坐稳了';
    if (race && performance.now() < race.at) return `数三声：${cn(Math.ceil((race.at - performance.now()) / 1000))}`;
    const how = kb ? 'W A S D 走，Shift 快些' : '摇杆走，「疾」快些';
    if (finished != null) return `绕村一圈，${secsText(finished)}。接着骑，或「下来」`;
    if (!lap) return `${how}；绕村一圈从最近的一处起`;
    if (!lap.started) return `${how}；出发就起表`;
    return `${secsText(Math.floor(lap.t))}${lap.n ? `　经过了${cn(lap.n)}处` : `　往${lap.next().map((m) => m.name).join("或")}去`}`;
  };
  const view = (now = false) => {
    if (phase === 'off') return;
    const ch: Array<Record<string, unknown>> = [];
    if (kind === 'ox') ch.push({ id: 'flute', label: fluteOn ? '收笛' : '吹笛' });
    if (!match.cur) ch.push(...inboxChoices(match, '赛一圈'), ...inviteChoices(match, '赛一圈'));
    ch.push({ id: 'done', label: '下来' });
    put({ kind: 'ride', title: name, hint: hint(), count: lap?.started ? lap.n : undefined, total: lap?.started ? lap.total : undefined, tags: nextTags(), choices: ch, compact: true }, now);
  };

  const act: Act & { on(): boolean } = {
    id: kind, name, anchor: V(), spot: { x: 0, z: 0, yaw: 0 } as Spot, radius: 2.6, state, free: true,
    on() {
      if (riding && riding !== kind) return false;
      if (S.out) return S.mode === 'graze' || S.mode === 'home';
      // 同游的人正骑着它（他那边借走了，这边身下也画着一头）：这一头不在这里
      if (takenBy) return false;
      return village.present && (kind === 'donkey' || stillT > 2);
    },
    enter() {
      kb = hasKb();
      riding = kind;
      if (!S.out) { swapOut(); S.mode = 'ride'; }
      S.mode = 'ride'; S.path = null;
      if (mox) mox.ox.present = true;
      if (mox) { lieWait = mox.ox.lie > 0.5 ? 1.7 : 0; mox.ox.lie = 0; mox.ox.graze = 0; mox.ox.eat = 0; }
      if (mdk) mdk.q.goal = DONKEY.STAND;
      const p = k.player, av = p.av;
      from.copy(p.pos); from2Yaw = p.yaw;
      // 牛在棚里：先自己转过身、走出棚来，人再上去
      const lead = kind === 'ox' && Math.hypot(S.x - OX_SHED.x, S.z - OX_SHED.z) < 2.2;
      if (lead) { S.path = [[LEAD.x, LEAD.z], [LEAD.x + Math.sin(LEAD.yaw) * 0.6, LEAD.z + Math.cos(LEAD.yaw) * 0.6]]; S.pi = 0; }
      else av.setPose('bench', 0.9);
      phase = lead ? 'lead' : 'mount'; t = 0; mountT = 0; lap = null; finished = null; fluteOn = false; goal = null;
      camT = 0; camGoal = null; behindOk = true;
      av.setHands('lap', 0.6);
      av.setSeat?.({ h: SEAT.h, cz: SEAT.cz });
      // 镜头：跟在身后（平常走路的那一个），转到牲口身后
      k.nav.setPose(null);
      k.nav.yaw = clearYaw(wrap(S.yaw + Math.PI));
      sfx(k, kind === 'ox' ? 'ox' : 'donkey', { vel: 0.35, x: S.x, z: S.z });
      set({ kind: 'ride', title: name, hint: phase === 'lead' ? (lieWait ? '牛慢慢站起来，转身出棚' : '牛转身出棚') : lieWait ? '牛慢慢站起来' : '坐上去', tags: [], compact: true, choices: [{ id: 'done', label: '下来' }] });
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); window.addEventListener('blur', onBlur);
    },
    exit() {
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('blur', onBlur);
      turnKey = 0;
      if (match.cur) match.leave();
      race = null;
      const p = k.player, av = p.av;
      av.reach('L', null); av.reach('R', null); av.lookAt(null); av.twist = 0;
      flute.visible = false; fluteOn = false;
      if (phase === 'lead' || (phase === 'mount' && mountT < 0.3)) {
        // 还没坐上去（牛正出棚、刚要上）：人就站在原处
        p.settleAt(from.x, from.z);
      } else {
        // 从左边滑下来：落在人朝的那一边一步外
        const fx = Math.sin(riderYaw), fz = Math.cos(riderYaw);
        let dx = root.x + fx * 0.45, dz = root.z + fz * 0.45;
        if (groundAt(dx, dz) == null || blocked(dx, dz)) { dx = root.x; dz = root.z; }
        p.pos.x = root.x; p.pos.z = root.z;
        p.settleAt(dx, dz);
      }
      S.mode = 'graze'; S.t = 0; S.v = 0;
      phase = 'off'; riding = null;
      keep.off();
    },
    update(dt) {
      t += dt; flush();
      const p = k.player, av = p.av;
      // 人：横坐在背上（上去的那一段从站处送上去，见 riderTarget），身子随步子起落
      if ((phase === 'mount' && lieWait > 0) || phase === 'lead') return;
      riderTarget(root);
      av.root.position.copy(root); av.root.rotation.y = riderYaw;
      p.yaw = riderYaw;
      // 头看着前头的路；上身略往前头那边扭一点（人是横着坐的）
      av.lookAt(tmp.set(S.x + Math.sin(S.yaw) * 6, footY(S.x, S.z) + 1.5, S.z + Math.cos(S.yaw) * 6));
      av.twist = -0.32;
      // 手：驴的缰攥在右手里；吹笛时两手横着笛凑到嘴边；不然叠在膝上
      if (fluteOn) {
        av.joints.head.getWorldPosition(tmp);
        const fx = Math.sin(riderYaw), fz = Math.cos(riderYaw), rx = -Math.cos(riderYaw), rz = Math.sin(riderYaw);
        const mx = tmp.x + fx * 0.11, my = tmp.y - 0.07, mz = tmp.z + fz * 0.11;
        av.reach('R', V(mx + rx * 0.1, my, mz + rz * 0.1), { rate: 9 });
        av.reach('L', V(mx - rx * 0.1, my, mz - rz * 0.1), { rate: 9 });
        flute.visible = true; flute.position.set(mx, my, mz); flute.quaternion.setFromUnitVectors(XV, tmp2.set(rx, 0.06, rz).normalize());
        fluteT -= dt;
        if (fluteT <= 0) { fluteT = 9; sfx(k, 'flute', { vel: 0.55, x: S.x, z: S.z }); }
      } else if (mdk && phase === 'ride') {
        av.reach('L', null);
        // 缰攥在右手里，手搁在腿上（缰自笼头斜斜地垂到手里）
        av.reach('R', tmp.set(root.x + Math.sin(S.yaw) * 0.16 + Math.sin(riderYaw) * 0.2, root.y + SEAT.h + 0.2, root.z + Math.cos(S.yaw) * 0.16 + Math.cos(riderYaw) * 0.2), { rate: 6 });
        flute.visible = false;
      } else { av.reach('L', null); av.reach('R', null); flute.visible = false; }
      if (phase === 'ride' && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) view();
    },
    input: {
      tap(pt: Pointer) {
        if (phase !== 'ride') return true;
        const g = k.player.pickGround(k.world.ray(pt.nx, pt.ny).ray);
        if (g) { const path = travel(S.x, S.z, footY(S.x, S.z), g.x, g.z); goal = path?.length ? path : [[g.x, g.z]]; gi = 0; k.events.sfx?.('tick', { vel: 0.2 }); }
        return true;
      },
      move() { dragAt = performance.now(); return false; },
    },
    cmd(c, arg) {
      if (c === 'done') { k.exitAct(); return; }
      // 点地面走过去（界面上是点画面；测试、键鼠以外的路子也可以直接给一点）
      if (c === 'goto' && Array.isArray(arg) && phase === 'ride') { const [x, z] = arg as number[]; const path = travel(S.x, S.z, footY(S.x, S.z), x, z); goal = path?.length ? path : [[x, z]]; gi = 0; return; }
      if (c === 'flute' && kind === 'ox') { fluteOn = !fluteOn; fluteT = 0.4; view(true); }
      else if (c === 'accept') match.accept();
      else if (c === 'decline') { match.decline(); view(true); }
      else if (c.startsWith('inv:')) { const id = Number(c.slice(4)); if (match.invite(id)) { k.note(`邀${match.label(id)}赛一圈，等他应`, 'net'); view(true); } }
    },
  };
  function onKey(e: KeyboardEvent) {
    const d = e.type === 'keydown', key = e.key.toLowerCase();
    if (key === 'q' || key === 'arrowleft') { turnKey = d ? -1 : turnKey === -1 ? 0 : turnKey; }
    else if (key === 'e' || key === 'arrowright') { turnKey = d ? 1 : turnKey === 1 ? 0 : turnKey; }
  }
  function onBlur() { turnKey = 0; }

  /** 顶子占的地：敞着的棚（牛棚、茶亭、窝棚、带檐的）放宽一些；各家屋舍、村塾、碓房再放宽到檐口外（镜头只在碰着墙时收近，檐伸出墙外那一截照样遮人） */
  let roofList: Array<{ x: number; z: number; hw: number; hd: number; c: number; s: number }> | null = null;
  function roofs() {
    if (roofList) return roofList;
    const sol = (k.build?.group.userData.solids ?? []) as SolidLike[];
    roofList = sol.filter((s) => s.kind === 'rect' && s.w && s.d && (/牛棚|茶亭|窝棚|檐|^邻家·|^村塾$|^碓房$/.test(s.id) || s.roof != null))
      .map((s) => { const pad = /^邻家·/.test(s.id) ? 0.7 : /^村塾$|^碓房$/.test(s.id) ? 0.9 : 0.45; return { x: s.x, z: s.z, hw: s.w! / 2 + pad, hd: s.d! / 2 + pad, c: Math.cos(s.yaw ?? 0), s: Math.sin(s.yaw ?? 0) }; });
    return roofList;
  }
  /** 镜头摆在 yaw 那一边好不好（0…1）：那一线从顶子上过是 0（人和牲口被棚顶、屋檐遮了）；不然是镜头退得出去几成（高墙挡着时镜头收近，贴到人背上）。
   *  从人那里量（镜头跟着的是人，人横坐在牲口左边） */
  function camScore(yaw: number): number {
    const R = roofs(), L = clamp(k.nav.dist, 3, 10), sx = Math.sin(yaw), sz = Math.cos(yaw), px = k.player.pos.x, pz = k.player.pos.z;
    for (let d = 1; d <= L; d += 0.5) {
      const x = px + sx * d, z = pz + sz * d;
      for (const o of R) { const dx = x - o.x, dz = z - o.z; if (Math.abs(dx * o.c - dz * o.s) < o.hw && Math.abs(dx * o.s + dz * o.c) < o.hd) return 0; }
    }
    return boom(px, pz, px + sx * L, pz + sz * L);
  }
  /** 镜头的方位：牲口身后；身后那一线过棚顶（牛刚牵出棚，身后就是棚）或贴着高墙，就往两边偏——同样好时先试人坐着的左边 */
  function clearYaw(base: number): number {
    let best = base, score = -1;
    for (const off of [0, -0.35, 0.35, -0.7, 0.7, -1.05, 1.05, -1.4, 1.4, -1.75, 1.75, -2.1, 2.1]) {
      const y = wrap(base + off), sc = camScore(y);
      if (sc > 0.9) return y;
      if (sc > score) { score = sc; best = y; }
    }
    return best;
  }
  /** 此刻镜头那一线过了棚顶、贴着墙：从它在的地方往两边找最近的好的（先往牲口身后那边找） */
  function nearestOk(cur: number, behind: number): number | null {
    const toward = wrap(behind - cur) >= 0 ? 1 : -1;
    for (const m of [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1, 2.4, 2.7]) for (const sg of [toward, -toward]) { const y = wrap(cur + sg * m); if (camScore(y) > 0.6) return y; }
    return null;
  }
  /** 镜头从此刻那里转到牲口身后（按近的那一边转）：身后好，一路上也不过棚顶、不贴墙（不然转过去又得转回来） */
  function followOk(cur: number, behind: number): boolean {
    if (camScore(behind) < 0.5) return false;
    const d = wrap(behind - cur), n = Math.ceil(Math.abs(d) / 0.3);
    for (let i = 1; i < n; i++) if (camScore(cur + (d * i) / n) < 0.25) return false;
    return true;
  }
  /** 走到一点了没有：近到半米多就算；中途的拐点已经从旁边擦过去了（在身后、一米以内）也算。
   *  （拐点别放得太宽：路是照人的身量找的，牲口宽，抄近路切墙角就卡在墙边） */
  function reached(g: [number, number], d: number, last: boolean) {
    if (d < 0.6) return true;
    if (last) return false;
    const ahead = Math.sin(S.yaw) * (g[0] - S.x) + Math.cos(S.yaw) * (g[1] - S.z);
    return ahead < 0 && d < 1.0;
  }
  /** 骑着的人此刻该在哪：上去的那一段从站处缓缓送上背；坐稳了就是背上那一处 */
  function riderTarget(out: THREE.Vector3) {
    if (phase !== 'mount') return currentRoot(out);
    const r = currentRoot(tmp2), e = clamp(mountT / 0.9), s = e * e * (3 - 2 * e);
    // 先转过身来（背朝牲口），再往上一送
    riderYaw = from2Yaw + wrap(riderYaw - from2Yaw) * clamp(mountT / 0.5);
    return out.set(from.x + (r.x - from.x) * s, from.y + (r.y - from.y) * s + 0.12 * Math.sin(Math.PI * s), from.z + (r.z - from.z) * s);
  }
  /** 骑着的人的 root 此刻该在哪（背上那一点往外、往下；随步子起落） */
  function currentRoot(out: THREE.Vector3) {
    if (mox) mox.seat(seat); else seat.copy(mdk!.seat);
    const walk = clamp(S.v / 0.3), ph = mox ? mox.ph * Math.PI * 2 : (mdk!.q.ph);
    bob = mox ? 0.012 * walk * Math.sin(ph * 2) : 0.012 * walk * Math.abs(Math.sin(ph));
    sway = 0.01 * walk * Math.sin(ph);
    const r = riderRoot(seat, S.yaw, bob, sway, out);
    riderYaw = r.yaw;
    return out;
  }

  // —— 每帧：牲口怎么走（骑着时听你的，下来以后自己吃草、回去）；人跟着 ——
  onFrame(k, `ride:${kind}`, (dt, time) => { step(dt, time); publish(); });
  /** 测试、调试看的那几样（每帧都写，不论这一帧走到哪一步） */
  const publish = () => { DEBUG[`ride:${kind}`] = { mode: S.mode, phase, x: S.x, z: S.z, yaw: S.yaw, v: S.v, lap: lap ? { n: lap.n, t: lap.t, started: lap.started, dir: lap.dir, start: lap.start } : null, finished, out: S.out, race: race ? { ...race } : null, match: match.cur ? { peer: match.peer, side: match.side } : null }; };
  const step = (dt: number, time: number) => {
    // 村里那一头：站着不动多久（牛被牵着走、耕着地时不能骑）
    // 同游的人正骑着这一样牲口：这边村里那一头也算被他借走了（不然画里同时有两头）
    takenT -= dt;
    if (takenT <= 0) {
      takenT = 0.5;
      const tg = getTogether(), want = actIndex(kind);
      takenBy = 0;
      if (tg) for (const r of tg.remotes.values()) if (r.seen && !r.hidden && r.act === want) { takenBy = r.id; break; }
    }
    if (!S.out) {
      const moved = Math.hypot(village.x - lastX, village.z - lastZ);
      lastX = village.x; lastZ = village.z;
      stillT = moved < 0.002 ? stillT + dt : 0;
      // 签与站处跟着它：站在它左边一步外，面朝它；牛在棚里时站在棚口东边（牛牵出来骑）
      const lx = Math.cos(village.yaw), lz = -Math.sin(village.yaw);
      act.anchor.set(village.x, footY(village.x, village.z) + M.back + 0.5, village.z);
      if (inShed()) { act.spot.x = LEAD.x + 1.15; act.spot.z = LEAD.z - 0.2; act.spot.yaw = -Math.PI / 2; }
      else { act.spot.x = village.x + lx * 0.95; act.spot.z = village.z + lz * 0.95; act.spot.yaw = village.yaw - Math.PI / 2; }
      return;
    }
    const gy0 = footY(S.x, S.z);
    act.anchor.set(S.x, gy0 + M.back + 0.5, S.z);
    { const lx = Math.cos(S.yaw), lz = -Math.sin(S.yaw); act.spot.x = S.x + lx * 0.95; act.spot.z = S.z + lz * 0.95; act.spot.yaw = S.yaw - Math.PI / 2; }
    let want = 0, wantYaw = S.yaw;
    if (S.mode === 'ride' && phase === 'lead') {
      // 牵出棚：先起身，再转过身走两步
      if (lieWait > 0) lieWait -= dt;
      else if (S.path) {
        const g = S.path[S.pi], d = Math.hypot(g[0] - S.x, g[1] - S.z);
        if (d < 0.25) { S.pi++; if (S.pi >= S.path.length) { S.path = null; phase = 'mount'; mountT = 0; k.player.av.setPose('bench', 0.9); from.copy(k.player.pos); from2Yaw = k.player.yaw; } }
        if (S.path) { wantYaw = Math.atan2(g[0] - S.x, g[1] - S.z); want = M.walk * 0.8; }
      }
    } else if (S.mode === 'ride' && phase === 'ride') {
      const p = k.player;
      // 手上的方向（与走路一样：相对镜头）
      const ix = clamp(k.keyMove.x + k.stick.x, -1, 1), iy = clamp(k.keyMove.y + k.stick.y, -1, 1), mag = Math.min(1, Math.hypot(ix, iy));
      const cy = k.nav.camYaw, fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
      const brisk = (p.run || p.fast) && (!race || performance.now() >= race.at);
      const top = brisk ? M.brisk : M.walk;
      if (race && performance.now() < race.at) { /* 数三声：先不走 */ }
      else if (mag > 0.05) {
        goal = null;
        const wx = rx * ix + fx * iy, wz = rz * ix + fz * iy;
        wantYaw = Math.atan2(wx, wz); want = top * mag;
      } else if (goal) {
        const g = goal[gi], d = Math.hypot(g[0] - S.x, g[1] - S.z);
        // 中途的拐点：走到近处（或已经走过了头）就奔下一个；牲口转身慢，绕着一点打转是转不进去的
        if (reached(g, d, gi >= goal.length - 1)) { gi++; if (gi >= goal.length) goal = null; }
        if (goal) { wantYaw = Math.atan2(g[0] - S.x, g[1] - S.z); want = gi >= goal.length - 1 ? Math.min(top, 0.3 + d * 0.8) : top; }
      }
      // 键盘转镜头（Q E ← →）
      if (turnKey) k.nav.yaw = wrap(k.nav.yaw - turnKey * 1.5 * dt);
    } else if (S.mode === 'graze') {
      // 下来以后：在原地低头吃一会儿草，再回去
      S.t += dt;
      if (S.t > 25 || (Math.hypot(k.player.pos.x - S.x, k.player.pos.z - S.z) > 40)) {
        const home = kind === 'ox' ? { x: vox.x, z: vox.z } : vdk.home;
        const path = travel(S.x, S.z, gy0, home.x, home.z);
        S.path = path?.length ? path : [[home.x, home.z]]; S.pi = 0; S.mode = 'home';
      }
    } else if (S.mode === 'home' && S.path) {
      const home = kind === 'ox' ? { x: vox.x, z: vox.z } : vdk.home;
      const g = S.path[S.pi], d = Math.hypot(g[0] - S.x, g[1] - S.z);
      if (reached(g, d, S.pi >= S.path.length - 1)) S.pi++;
      if (S.pi >= S.path.length || Math.hypot(home.x - S.x, home.z - S.z) < 1.2) { swapBack(); return; }
      wantYaw = Math.atan2(g[0] - S.x, g[1] - S.z); want = Math.min(M.walk * 0.75, 0.2 + d * 0.6);
      // 没人看着、离得远：直接回去
      const cam = k.world.camera.position;
      if (Math.hypot(cam.x - S.x, cam.z - S.z) > 70) { swapBack(); return; }
    }
    // 转身有个慢：差得多时先放慢、兜着转过去
    const off = wrap(wantYaw - S.yaw), turn = M.turn * (phase === 'lead' ? 1.8 : want > 0 ? 1 : 0.6);
    if (want > 0 || Math.abs(off) > 0.02) S.yaw = wrap(S.yaw + clamp(off, -turn * dt, turn * dt));
    // 要去的方向在身后：先放慢、原地兜过来（不然转弯半径大过要去的那一点，绕着它打转）
    const targetV = want * (Math.abs(off) > 1.1 ? 0.12 : Math.max(0.3, Math.cos(Math.min(Math.abs(off), Math.PI / 2))));
    S.v += clamp(targetV - S.v, -1.6 * dt, 0.8 * dt);
    // 挪一步：不撞墙、不进屋、不下深水、不踩人（村里那一头留下的圆不算）
    if (S.v > 0.01) {
      setDynamic(others());
      const nx = S.x + Math.sin(S.yaw) * S.v * dt, nz = S.z + Math.cos(S.yaw) * S.v * dt;
      let ok = fits(nx, nz, S.yaw, gy0) != null ? [nx, nz] : fits(nx, S.z, S.yaw, gy0) != null ? [nx, S.z] : fits(S.x, nz, S.yaw, gy0) != null ? [S.x, nz] : null;
      if (S.mode === 'home' || phase === 'lead') ok = [nx, nz];
      setDynamic((k.life?.blockers ?? []) as Disc[]);
      if (ok) { S.x = ok[0]; S.z = ok[1]; } else { S.v = 0; goal = null; }
    }
    // 牲口
    if (mox) {
      mox.ox.graze = S.mode === 'graze' && S.t > 2 ? 1 : 0;
      mox.step(S.x, S.z, S.yaw, S.v, dt);
      mox.ox.update(dt, time);
    } else if (mdk) {
      const q = mdk.q;
      q.x = S.x; q.z = S.z; q.yaw = S.yaw; q.v = S.v;
      q.gait = S.v > 1.5 ? 1 : 0;
      q.goal = S.mode === 'graze' && S.t > 2 ? DONKEY.GRAZE : DONKEY.STAND;
      const hand = S.mode === 'ride' && phase === 'ride' ? k.player.av.joints.handR.getWorldPosition(tmp) : null;
      mdk.place(dt, time, { hand, post: S.post });
    }
    // 骑着：人跟着（行者的位置写在牲口背上这一处；落地的高度按脚下）
    if (S.mode === 'ride' && phase !== 'off' && phase !== 'lead') {
      const p = k.player;
      if (phase === 'mount') {
        if (lieWait > 0) lieWait -= dt;
        else { mountT += dt; if (mountT > 1.0) { phase = 'ride'; k.nav.yaw = clearYaw(wrap(S.yaw + Math.PI)); view(true); } }
      }
      riderTarget(root);
      const g = groundAt(root.x, root.z) ?? footY(root.x, root.z);
      p.pos.set(root.x, g, root.z); p.yaw = riderYaw;
      p.settleAt(root.x, root.z);
      p.lift = root.y - g;
      // 镜头：走着、手又没在转镜头时，慢慢转到牲口身后
      // （只转到正后方，不另外绕开树：绕开了「前」就不是牲口的前，人会骑着兜圈子）
      // 身后那一线从棚顶上过（牛刚出棚，身后就是棚）、贴着高墙：先不跟，镜头停在原处；此刻镜头那一线也过了棚顶、贴了墙，就挪到最近的好地方
      if (phase === 'ride') {
        if (turnKey) dragAt = performance.now();
        camT -= dt;
        if (camT <= 0) {
          camT = 0.2;
          const behind = wrap(S.yaw + Math.PI);
          camGoal = camScore(k.nav.yaw) > 0.35 ? null : nearestOk(k.nav.yaw, behind);
          behindOk = camGoal == null && followOk(k.nav.yaw, behind);
        }
        const handsOff = performance.now() - dragAt > 1400;
        if (camGoal != null && handsOff) k.nav.yaw = wrap(k.nav.yaw + wrap(camGoal - k.nav.yaw) * Math.min(1, dt * 3));
        else if (behindOk && S.v > 0.2 && handsOff) k.nav.yaw = wrap(k.nav.yaw + wrap(S.yaw + Math.PI - k.nav.yaw) * Math.min(1, dt * 0.35) * Math.min(1, S.v / 1.0));
      }
      keep.set(0, S.x + Math.sin(S.yaw) * 0.5, S.z + Math.cos(S.yaw) * 0.5, 0.75);
      keep.set(1, S.x - Math.sin(S.yaw) * 0.5, S.z - Math.cos(S.yaw) * 0.5, 0.75);
      // 圈：到了头一处起表；经过、回到起头那一处
      if (phase === 'ride' && (!race || performance.now() >= race.at)) {
        if (!lap) { const i = RING.findIndex((m) => Math.hypot(m.x - S.x, m.z - S.z) <= m.r); if (i >= 0) { lap = new Lap(RING, i); view(true); } }
        else if (!lap.done) {
          const e = lap.update(S.x, S.z, dt);
          if (e?.kind === 'go') view(true);
          else if (e?.kind === 'pass') { k.note(`过了${e.mark.name}`, 'ride'); sfx(k, kind === 'ox' ? 'ox' : 'donkey', { vel: 0.2, x: S.x, z: S.z }); view(true); }
          else if (e?.kind === 'done') {
            finished = e.secs;
            const rep = report(k, 'ride', e.secs);
            k.log({ kind: 'play', text: `${name}绕村一圈，${secsText(e.secs)}` });
            k.note(`绕村一圈，${secsText(e.secs)}${rep.best && rep.prev != null ? '，比以往都快' : ''}——${rankText(rep.rank)}`);
            if (race && match.cur) { race.me = e.secs; match.send(OP_DONE, e.secs); settleRace(); }
            lap = null;
            view(true);
          }
          const sec = Math.floor(lap?.t ?? -1);
          if (sec !== lastSec) { lastSec = sec; view(); }
        }
      }
    }
  };
  // 村里那一头：骑的那一份换出来时藏着（在村里人、生灵都摆完以后再藏）
  afterFrame(k, `ride:${kind}`, () => { if (S.out || takenBy) village.hide(); });
  return act;
}
