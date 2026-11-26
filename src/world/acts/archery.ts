/**
 * 射箭（乡射：村塾东南、村路南边的射圃。侯张在南边二十步外，背后是溪与田）。
 *   四矢一轮，两人一耦，轮着射：上射（西边的物）先发一矢，下射（东边）再发一矢，如此四番。
 *   瞄：侯上那一点墨是「满弓、无风」时这一箭会中的地方——拖动画面（键盘 ← → ↑ ↓）把它挪到鹄上。风从哪来看侯东那条幡：风推着箭走，墨点要往上风头补一点。
 *   引：按住「引」（空格）开弓，弓满了墨点会轻轻地晃，晃到鹄上就松手；引得太久臂酸了，晃得厉害。没引满就发，箭落得低。
 *   中鹄（正中朱圆）三筹，中正（那一圈墨）二筹，中侯（布上别处）一筹，不中无筹。箭钉在布上，布一颤一颤；射过了侯落进草里、溪里。
 *   一个人来：村里的一位后生站在下射的物上陪你，轮着射（谁来看此刻谁不在近处）；射完了比筹，不胜的举觯自饮（只是一句话）。
 *   同游时近处有人：「邀某某同射」，他应了就站到另一个物上，两边各射各的、看得见对面的箭（发出去的是出手那一刻的数，两边算出来的弧一样）。
 *   他走了、久不发箭：村里的后生接过弓，替他把这一轮射完。
 * 器物在 play/archery.ts，箭怎么飞、中在哪在 play/games/arrow.ts。成绩上榜（一轮几筹，play/board.ts 的 'archery'）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from './types';
import { ARROW_LEN, ArrowStrips, Bow, Cloth, Flag, RANGE, markY, rangeGeo, targetCenter } from '../play/archery';
import { HOU, RING_NAME, WIND_K, arrowAt, arrowVel, crossTarget, loose, ring, shotFrom, shotInts, type Shot, type Target } from '../play/games/arrow';
import { Match, inboxChoices, inviteChoices } from '../play/games/match';
import { DEBUG, Partner, afterFrame, cn, hasKb, pickWho, rankText, shunning, windFrom, type Who } from '../play/games/kit';
import { dice, hash } from '../play/games/dice';
import '../play/games/boards';
import { report } from '../play/board';
import { DOT_INK, DOT_ZHU, Dots } from '../play/pot';
import { V, camFar, clamp, onFrame, sfx, setStatic, stateOf } from '../play/kit';
import { U } from '../ink/ink';
import { addDisc, groundAt } from '../walk';
import { registerRemoteProp } from '../net/props';
import { getTogether } from '../net';

/** 陪射的后生：谁此刻不在近处就请谁 */
const ARCHERS: Who[] = [{ id: 'carpenter2', look: 'carpenter2', name: '小乙' }, { id: 'farmson', look: 'farmson', name: '二郎' }, { id: 'miller', look: 'miller', name: '柱子' }];
/** 一回合里第 n 箭是哪个物上的人射：上射、下射轮着 */
const SHOOTER = (n: number) => (n % 2) as 0 | 1;
const ARROWS = 4;
const OP_SHOT = 10, OP_AGAIN = 12;

type ArrowS = 'rack' | 'hand' | 'fly' | 'stuck' | 'ground' | 'gone';
interface Arr { s: ArrowS; shot: Shot | null; t: number; hitT: number; hit: { u: number; v: number; r: number } | null; p: THREE.Vector3; d: THREE.Vector3 }

export function create(k: Anlewo): Act | null {
  if (groundAt(RANGE.target.x, RANGE.target.z) == null) return null;
  const { state, set, put, flush } = stateOf(k);
  const C = targetCenter(), T: Target = { c: [C.x, C.y, C.z], n: [0, -1] };
  const camPos = () => k.world.camera.position;
  // —— 器物 ——
  setStatic(k, 'range', 'range', rangeGeo(true));
  for (const s of [-1, 1]) addDisc(C.x + s * RANGE.postX, C.z, 0.08);
  addDisc(RANGE.rack.x, RANGE.rack.z, 0.34); addDisc(RANGE.flag.x, RANGE.flag.z, 0.06);
  const cloth = new Cloth(C), flag = new Flag();
  k.world.scene.add(cloth.mesh, flag.mesh);
  const bows = [new Bow(), new Bow()];
  for (const b of bows) { b.add(k.world.scene); b.visible = false; }
  const strips = new ArrowStrips(ARROWS * 2), arrowMesh = strips.mesh;
  arrowMesh.visible = false;
  k.world.scene.add(arrowMesh);
  const dots = new Dots(64, 2.2);
  // （与投壶那一份的名字分开：别处按名字找 play:dots 的找的是投壶的）
  dots.mesh.name = 'games:dots:archery';
  k.world.scene.add(dots.mesh);
  const A: Arr[] = Array.from({ length: ARROWS * 2 }, () => ({ s: 'rack' as ArrowS, shot: null, t: 0, hitT: 0, hit: null, p: V(), d: V(0, 0, 1) }));
  const fwdV = V();

  // —— 射位 ——
  const markPos = (i: number) => V(RANGE.marks[i].x, markY(i), RANGE.marks[i].z);
  const dirT = (i: number) => { const m = RANGE.marks[i]; return V(C.x - m.x, 0, C.z - m.z).normalize(); };
  /** 射的人面朝哪：左肩对着侯（面朝侯的右边，再往侯那边回转一点） */
  const faceYaw = (i: number) => { const d = dirT(i); return Math.atan2(d.x, d.z) - Math.PI / 2 + 0.32; };
  const spotOf = (i: number) => ({ x: RANGE.marks[i].x, z: RANGE.marks[i].z, yaw: faceYaw(i) });
  /** 射的人自己的前、右（面朝 faceYaw） */
  const fwdA = (i: number, out = V()) => { const y = faceYaw(i); return out.set(Math.sin(y), 0, Math.cos(y)); };
  const rightA = (i: number, out = V()) => { const y = faceYaw(i); return out.set(-Math.cos(y), 0, Math.sin(y)); };
  /** 握弓的那一点：左肩往侯那边伸直一臂，肩那么高 */
  const gripAt = (i: number, out = V()) => out.copy(markPos(i)).addScaledVector(rightA(i, fwdV), -0.15).addScaledVector(dirT(i), 0.5).add(V(0, 1.38, 0));
  /** 扣弦的手引满时在哪：右腮边 */
  const anchorAt = (i: number, out = V()) => out.copy(markPos(i)).addScaledVector(dirT(i), 0.07).addScaledVector(rightA(i, fwdV), 0.05).add(V(0, 1.42, 0));
  /** 出手处（箭离弦那一刻镞在哪）：弓前一点 */
  const nockAt = (i: number, out = V()) => gripAt(i, out).addScaledVector(dirT(i), 0.16);

  // —— 一轮 ——
  type Phase = 'intro' | 'ready' | 'draw' | 'fly' | 'look' | 'npc' | 'wait' | 'end' | 'off';
  let phase: Phase = 'off', t = 0, n = 0, me: 0 | 1 = 0, draw = 0, holdT = 0, seed = 1, kb = false, keyU = 0, keyV = 0;
  let lookLong = false;
  /** 侯上中过的地方（一点淡墨，一轮完了才收） */
  const marks: THREE.Vector3[] = [];
  let aimU = 0, aimV = 0, swayU = 0, swayV = 0, fb = '', lastTag: { text: string; sub: string; x: number; y: number; z: number } | null = null, waitT = 0;
  const score: [number, number] = [0, 0], rings: [number[], number[]] = [[], []];
  let partner: Partner | null = null, npc: { t: number; aim: [number, number]; draw: number; hold: number; fired: boolean } | null = null;
  const keep = shunning(5);
  const match = new Match('archery', 'archery', {
    range: 30,
    invited: (fr, label) => { k.note(`${label}在射圃邀你同射——到村塾东南的射圃，点「射箭」应邀`, 'net'); if (k.act === act && (phase === 'intro' || phase === 'end')) intro(); },
    start: (peer, side) => startMatch(peer, side),
    msg: (op, d) => onMsg(op, d),
    end: (why, label) => endMatch(why, label),
  });
  /** 对面是谁：同游的那一位，或陪射的村里人 */
  const foeName = () => (match.cur ? match.label(match.peer) : partner?.name ?? '');
  const wind = (out: THREE.Vector3) => { const w = U.uWind.value; out.set(w.x, 0, w.y); if (out.lengthSq() < 1e-6) out.set(1, 0, 0); out.normalize(); return 0.8 + 14 * k.atmos.wind; };
  const windV = V();
  const windWord = () => { const s = wind(windV); return `风自${windFrom(windV.x, windV.z)}来${s < 1.6 ? '，很轻' : s < 3 ? '' : '，有点急'}`; };
  const right = V(-1, 0, 0);
  /** 侯面上 (u, v) 那一点在世界的哪里（u 往右、v 往上，从射位看） */
  const onTarget = (u: number, v: number, out = V()) => out.set(C.x + right.x * u, C.y + v, C.z + right.z * u);

  const keysAim = [{ key: '方向键', label: '瞄' }, { key: '空格', label: '按住引弓，松手发' }];
  const method = () => (kb ? '方向键把墨点挪到鹄上（正中的朱圆），按住空格引弓，弓满了松手' : '拖动画面把墨点挪到鹄上（正中的朱圆），按住「引」，弓满了松手');
  const tags = () => {
    const out: Array<Record<string, unknown>> = [];
    if (lastTag) out.push({ id: 'hit', text: lastTag.text, sub: lastTag.sub || undefined, x: lastTag.x, y: lastTag.y, z: lastTag.z, kind: 'hot' });
    // 两个射位上各一枚：谁、几筹
    const both = phase !== 'intro' && (!!partner || !!match.cur);
    if (both) for (const i of [0, 1] as const) {
      const p = markPos(i), mine = i === me;
      out.push({ id: `m${i}`, text: mine ? '你' : foeName(), sub: rings[i].length ? `${cn(score[i])}筹` : undefined, x: p.x, y: p.y + 2.05, z: p.z, kind: SHOOTER(n) === i && phase !== 'end' ? 'hot' : 'dim' });
    }
    return out;
  };
  const myCount = () => rings[me].length;
  const turnHint = () => {
    if (phase === 'ready') return fb || (myCount() === 0 ? method() : `${windWord()}。${method()}`);
    if (phase === 'draw') return holdT > 3.2 ? '臂酸了，墨点晃得厉害——松手吧' : draw < 0.92 ? '引……' : '弓满了，墨点晃到鹄上就松手';
    if (phase === 'npc') return `${foeName()}引弓`;
    if (phase === 'wait') return `等${foeName()}发箭`;
    return fb;
  };
  const view = (now = false) => {
    put({
      kind: 'archery', title: '射箭', count: myCount(), total: ARROWS, hint: turnHint(),
      meter: phase === 'ready' || phase === 'draw' ? { v: draw, lo: 0.92, hi: 1, label: '引' } : undefined,
      hold: phase === 'ready' || phase === 'draw' ? { id: 'draw', label: '引', v: draw } : undefined,
      keys: phase === 'ready' || phase === 'draw' ? keysAim : undefined, tags: tags(), choices: [{ id: 'done', label: '罢' }],
    }, now);
  };

  // —— 陪射的人 ——
  const ensurePartner = (walkIn: boolean) => {
    if (partner) return;
    const o = 1 - me as 0 | 1, m = markPos(o);
    const who = pickWho(k, ARCHERS, C.x, RANGE.marks[0].z);
    // 从射位北边几步走过来
    const from = walkIn ? { x: m.x + 3.5, z: m.z - 4.5, yaw: Math.PI } : { x: m.x, z: m.z, yaw: faceYaw(o) };
    partner = new Partner(k, who, from);
    partner.fig.setHands('free', 0);
    if (walkIn) partner.walkTo(m.x, m.z, () => partner?.turnTo(faceYaw(o)));
    else partner.turnTo(faceYaw(o));
    bows[1].visible = true;
  };
  const dropPartner = () => {
    if (!partner) return;
    const p = partner;
    partner = null; bows[1].visible = false;
    // 走开几步再收走
    p.fig.reach('L', null); p.fig.reach('R', null); p.fig.lookAt(null); p.fig.twist = 0;
    p.walkTo(p.pos.x + 4, p.pos.z - 6, () => { p.dispose(); const i = leaving.indexOf(p); if (i >= 0) leaving.splice(i, 1); });
    leaving.push(p);
  };
  const leaving: Partner[] = [];

  // —— 一轮怎么走 ——
  const resetArrows = () => { for (const a of A) { a.s = 'rack'; a.shot = null; a.hit = null; a.t = 0; } };
  const arrowOf = (who: 0 | 1, k2: number) => who * ARROWS + k2;
  const intro = () => {
    phase = 'intro'; t = 0;
    const others = match.cur ? [] : [...inboxChoices(match, '同射'), ...inviteChoices(match, '同射')];
    const waiting = match.out ? `已邀${match.label(match.out.to)}，等他应。` : '';
    set({
      kind: 'archery', title: '射箭',
      text: `侯张在二十步外，鹄是正中那一圆朱。四矢一轮，与${partner?.name ?? '村里的后生'}轮着射：中鹄三筹，中正二筹，中侯一筹。${waiting}`,
      choices: [{ id: 'go', label: '开射', main: !match.inbox }, ...others, { id: 'done', label: '罢' }],
    });
  };
  const freshRound = (s: number) => {
    seed = s; n = 0; score[0] = score[1] = 0; rings[0] = []; rings[1] = []; fb = ''; lastTag = null; marks.length = 0;
    // 开头那一段话、几枚签收起来（射的时候只留提示、表与大键）
    set({ kind: 'archery', title: '射箭', count: 0, total: ARROWS });
    resetArrows();
    setStatic(k, 'range', 'range', rangeGeo(false));
    arrowMesh.visible = true;
    nextShot();
  };
  const nextShot = () => {
    if (n >= ARROWS * 2) { endRound(); return; }
    const who = SHOOTER(n), a = A[arrowOf(who, Math.floor(n / 2))];
    a.s = 'hand';
    t = 0;
    camTo(who);
    if (who === me) {
      phase = 'ready'; draw = 0; holdT = 0;
      // 换上一支：准头照上一支的，只是略有一点偏
      const r = dice(hash(seed, n, 3));
      aimU = clamp(aimU + (r() - 0.5) * 0.12, -1.6, 1.6); aimV = clamp(aimV + (r() - 0.5) * 0.12, -1.2, 1.4);
      view(true);
    } else if (match.cur) { phase = 'wait'; waitT = 0; view(true); }
    else { phase = 'npc'; ensurePartner(false); planNpc(); view(true); }
  };
  /** 村里人这一箭怎么射：照着风补，补得不全；手上有一点抖（种子定） */
  const planNpc = () => {
    const r = dice(hash(seed, n, 7)), s = wind(windV);
    // 风推着走多少（满弓约在天上 0.7 秒）：他补个六成到一成多
    const drift = 0.5 * WIND_K * s * 0.49, comp = 0.5 + 0.7 * r();
    const g = () => (r() + r() + r() - 1.5) * 0.62;
    const au = -(windV.x * right.x + windV.z * right.z) * drift * comp + g() * 0.95, av = g() * 0.85 + 0.03;
    npc = { t: 0, aim: [au, av], draw: r() < 0.82 ? 1 : 0.9 + 0.08 * r(), hold: 0.35 + 0.7 * r(), fired: false };
  };
  const release = () => {
    if (phase !== 'draw') return;
    const a = A[arrowOf(me, Math.floor(n / 2))];
    const aim = onTarget(aimU + swayU, aimV + swayV);
    const s = wind(windV);
    const shot = loose(nockAt(me).toArray() as [number, number, number], aim.toArray() as [number, number, number], draw, [windV.x * s, windV.z * s]);
    const x = crossTarget(shot, T), r = x && Math.abs(x.u) <= HOU.hw && Math.abs(x.v) <= HOU.hh ? ring(x.u, x.v) : 0;
    fly(a, shot, r);
    if (match.cur) match.send(OP_SHOT, n, ...shotInts(shot), r);
    // 说这一箭
    fb = '';
    if (draw < 0.9) fb = '没引满就发了，箭落得低。';
  };
  const fly = (a: Arr, shot: Shot, r: number) => {
    a.s = 'fly'; a.shot = shot; a.t = 0; a.hit = null;
    const x = crossTarget(shot, T);
    if (x && Math.abs(x.u) <= HOU.hw && Math.abs(x.v) <= HOU.hh) { a.hitT = x.t; a.hit = { u: x.u, v: x.v, r }; } else a.hitT = Infinity;
    phase = 'fly'; t = 0;
    sfx(k, 'snap', { vel: 0.55, x: shot.p[0], z: shot.p[2] });
    sfx(k, 'swish', { vel: 0.35, delay: 0.05 });
    view(true);
  };
  /** 一箭落定：记筹、说话 */
  const landed = (who: 0 | 1, a: Arr) => {
    const r = a.hit ? a.hit.r : 0;
    rings[who].push(r); score[who] += r;
    const mine = who === me;
    let where = '';
    if (a.hit) {
      const p = onTarget(a.hit.u, a.hit.v);
      lastTag = { text: RING_NAME[r], sub: r ? `${cn(r)}筹` : '', x: p.x, y: p.y + 0.42, z: p.z };
      const du = a.hit.u, dv = a.hit.v;
      if (r < 3) where = `${Math.abs(du) > Math.abs(dv) * 0.7 ? (du > 0 ? '偏右' : '偏左') : ''}${Math.abs(dv) > Math.abs(du) * 0.7 ? (dv > 0 ? '偏高' : '偏低') : ''}`;
    } else {
      lastTag = { text: '不中', sub: '', x: a.p.x, y: a.p.y + 0.5, z: a.p.z };
      const x = a.shot ? crossTarget(a.shot, T) : null;
      if (x) where = `${Math.abs(x.u) > HOU.hw ? (x.u > 0 ? '偏右' : '偏左') : ''}${Math.abs(x.v) > HOU.hh ? (x.v > 0 ? '偏高' : '偏低') : ''}`;
    }
    if (mine) {
      const fix = where ? `${where}了：墨点往${where.includes('右') ? '左' : where.includes('左') ? '右' : ''}${where.includes('高') ? '下' : where.includes('低') ? '上' : ''}挪一点` : '';
      fb = r === 3 ? `中鹄！三筹。${windWord()}，照这样再来` : `${RING_NAME[r]}${r ? `，${cn(r)}筹` : ''}。${fb}${fix}${fix ? '。' : ''}${windWord()}`;
    } else fb = `${foeName()}${RING_NAME[r]}${r ? `，${cn(r)}筹` : ''}`;
    phase = 'look'; t = 0; lookLong = !!a.hit;
    if (a.hit) { peek(onTarget(a.hit.u, a.hit.v)); marks.push(onTarget(a.hit.u, a.hit.v).addScaledVector(V(0, 0, -1), 0.02)); }
    view(true);
  };
  let againLater: number | null = null;
  const endRound = () => {
    phase = 'end';
    if (againLater != null && match.cur) { const add = againLater; againLater = null; window.setTimeout(() => { if (phase === 'end' && match.cur) freshRound(match.seed + add); }, 2200); }
    const mine = score[me], theirs = score[1 - me], foe = foeName();
    const rep = report(k, 'archery', mine);
    const kinds = [3, 2, 1, 0].map((r) => [r, rings[me].filter((x) => x === r).length]).filter(([, c]) => c > 0).map(([r, c]) => `${RING_NAME[r]}${cn(c)}`).join('、');
    const verdict = mine > theirs ? `${foe}不胜，举觯自饮。` : mine < theirs ? '你不胜，举觯自饮。' : '两边一样多，相揖而退。';
    k.log({ kind: 'play', text: `射箭，四矢${cn(mine)}筹` });
    set({
      kind: 'archery', title: '射箭', count: ARROWS, total: ARROWS, done: mine > 0,
      text: `你四矢：${kinds}，共${cn(mine)}筹；${foe}${cn(theirs)}筹。${verdict}\n${rep.best && rep.prev != null ? '比以往都多。' : ''}${rankText(rep.rank)}。`,
      tags: tags(),
      choices: [{ id: 'again', label: '再射一轮', main: true }, ...(match.cur ? [] : inviteChoices(match, '同射')), { id: 'done', label: '罢' }],
    });
  };

  // —— 同游 ——
  const startMatch = (_peer: number, side: 0 | 1) => {
    dropPartner();
    me = side;
    const s = spotOf(me), p = k.player;
    if (k.act === act) { p.settleAt(s.x, s.z); p.faceTo = s.yaw; camAt = -1; camTo(0); }
    k.note(`与${match.label(match.peer)}同射：${me === 0 ? '你是上射，先发' : '他是上射，先发'}`, 'net');
    freshRound(match.seed);
  };
  const onMsg = (op: number, d: number[]) => {
    if (op === OP_SHOT) {
      const nn = d[2], shot = shotFrom(d, 3), r = d[11] ?? 0, who = SHOOTER(nn);
      if (who === me) return;
      // 跟上对面的那一箭（中间漏了的就跳过去）
      if (nn !== n) n = nn;
      const a = A[arrowOf(who, Math.floor(nn / 2))];
      fly(a, shot, r);
    } else if (op === OP_AGAIN) {
      // 对面先射完、先点了「再射一轮」：这边最后一箭还没落定就记着，这一轮完了再开
      if (phase === 'end' || phase === 'intro') freshRound(match.seed + d[2]); else againLater = d[2];
    }
  };
  const endMatch = (why: string, label: string) => {
    const words: Record<string, string> = { left: `${label}走了`, quit: `${label}不射了`, timeout: `${label}久不应`, declined: `${label}谢绝了`, busy: `${label}正忙` };
    k.note(words[why] ?? `${label}走了`, 'net');
    if (k.act !== act) return;
    if (phase === 'wait' || phase === 'fly' || phase === 'look' || phase === 'ready' || phase === 'draw') {
      // 村里的后生接过弓，替他射完这一轮
      ensurePartner(true);
      k.note(`${partner?.name}接过弓：「我替他射完」`);
      if (phase === 'wait') { phase = 'npc'; planNpc(); view(true); }
    } else if (phase === 'intro' || phase === 'end') intro();
  };

  // —— 镜头：在射的那个人右肩后头，顺着箭看过去（换人射时缓缓挪过去） ——
  let camAt = -1;
  const camTo = (i: 0 | 1 = SHOOTER(n), dur = 1.2, force = false) => {
    if (camAt === i && !force) return;
    camAt = i;
    const m = markPos(i), d = dirT(i), west = V(-d.z, 0, d.x), tall = k.world.camera.aspect < 1;
    // （竖着的手机：镜头正在身后、高一些，人在画的下沿，侯在当中偏上）
    const pos = m.clone().addScaledVector(d, tall ? -3.6 : -3.8).addScaledVector(west, tall ? 0.25 : 0.95).add(V(0, tall ? 2.9 : 2.5, 0));
    k.nav.setPose({ pos, look: C.clone().add(V(0, tall ? -0.3 : 0.05, 0)), fov: tall ? 28 : 24, yaw: 7, up: 5, down: 5 }, dur);
  };
  /** 中了：镜头不动、往侯上那一点推近看一眼（看得清箭钉在哪） */
  const peek = (at: THREE.Vector3) => {
    const cam = k.world.camera.position.clone(), tall = k.world.camera.aspect < 1;
    k.nav.setPose({ pos: cam, look: at.clone(), fov: tall ? 13 : 9, yaw: 3, up: 3, down: 3 }, 0.55);
    camAt = -1;
  };

  const act: Act = {
    id: 'archery', name: '射箭', anchor: V(RANGE.rack.x, markY(0) + 1.1, RANGE.rack.z), radius: 3.2, state, noZoom: true,
    // 另一个射位上已经站着人了（同游的人正在这里射），就站到空着的那一个上
    get spot() {
      const tg = getTogether();
      let i: 0 | 1 = 0;
      if (tg) for (const r of tg.remotes.values()) if (!r.hidden && Math.hypot(r.pos.x - RANGE.marks[0].x, r.pos.z - RANGE.marks[0].z) < 0.6) i = 1;
      return spotOf(i);
    },
    enter() {
      kb = hasKb();
      const p = k.player;
      me = Math.hypot(p.pos.x - RANGE.marks[1].x, p.pos.z - RANGE.marks[1].z) < Math.hypot(p.pos.x - RANGE.marks[0].x, p.pos.z - RANGE.marks[0].z) ? 1 : 0;
      p.av.setHands('free');
      bows[0].visible = true;
      camAt = -1; camTo(me, 1.4);
      if (!match.inbox) ensurePartner(true);
      // 有人邀着：先说清楚，应不应由他点
      intro();
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); window.addEventListener('blur', onBlur);
    },
    exit() {
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('blur', onBlur);
      keyU = keyV = 0;
      if (match.cur) match.leave(); else match.cancel();
      if (rings[me].length > 0 && phase !== 'end' && rings[me].length >= ARROWS) report(k, 'archery', score[me]);
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null); av.twist = 0;
      dropPartner();
      bows[0].visible = false;
      phase = 'off'; lastTag = null;
      resetArrows(); arrowMesh.visible = false;
      setStatic(k, 'range', 'range', rangeGeo(true));
      dots.clear(); dots.commit();
      keep.off();
    },
    update(dt) {
      t += dt; flush();
      const av = k.player.av, p = markPos(me);
      keep.set(0, p.x, p.z, 0.7);
      // 射着的时候：箭道上留出来（侯与射位之间）
      if (phase !== 'intro' && phase !== 'end') for (let j = 0; j < 3; j++) keep.set(2 + j, C.x, RANGE.marks[0].z + (C.z - RANGE.marks[0].z) * (0.25 + 0.3 * j), 1.6);
      if (phase === 'ready' || phase === 'draw') {
        aimU = clamp(aimU - keyU * dt * 0.7, -1.6, 1.6); aimV = clamp(aimV + keyV * dt * 0.7, -1.2, 1.4);
        // 手不会一点不晃：弓满了晃得明显些，引得太久臂酸了晃得更厉害
        const full = phase === 'draw' ? draw : 0.3, tire = phase === 'draw' ? Math.max(0, holdT - 2.6) : 0;
        const amp = 0.035 + 0.05 * full + 0.11 * Math.min(1.5, tire);
        swayU = amp * (Math.sin(t * 1.3 + 0.4) + 0.5 * Math.sin(t * 2.9 + 1.1));
        swayV = amp * 0.8 * (Math.sin(t * 1.1 + 2.0) + 0.5 * Math.sin(t * 3.3));
        if (phase === 'draw') { holdT += dt; draw = Math.min(1, draw + dt / 1.05); }
        view(phase === 'draw');
      } else if (phase === 'look') {
        if (t > (lookLong ? 1.9 : 1.2)) { n++; camAt = -1; nextShot(); }
      } else if (phase === 'wait') {
        waitT += dt;
        if (waitT > 45 && match.cur) { const label = match.label(match.peer); match.leave(); endMatch('timeout', label); }
      }
      // 自己：左手执弓、右手扣弦（引的时候往后拉到腮边）
      const myTurn = SHOOTER(n) === me && (phase === 'ready' || phase === 'draw' || (phase === 'fly' && t < 0.45));
      pose(av, me, myTurn ? (phase === 'fly' ? 1 : phase === 'draw' ? draw : 0) : -1, phase === 'fly' && myTurn, bows[0]);
    },
    input: {
      move(pt) {
        if (phase !== 'ready' && phase !== 'draw') return false;
        aimU = clamp(aimU - pt.dx * 0.0042, -1.6, 1.6);
        aimV = clamp(aimV - pt.dy * 0.0042, -1.2, 1.4);
        return true;
      },
      tap() { return true; },
    },
    cmd(c, arg) {
      if (c === 'draw') {
        if (arg === 'down' && phase === 'ready') { phase = 'draw'; draw = 0; holdT = 0; view(true); }
        else if (arg === 'up' && phase === 'draw') release();
      } else if (c === 'go' && (phase === 'intro')) { match.cancel(); ensurePartner(true); freshRound(hash(Date.now() & 0xffff, 1)); }
      else if (c === 'again' && phase === 'end') {
        if (match.cur) { const add = 1 + (Date.now() % 997); match.send(OP_AGAIN, add); freshRound(match.seed + add); }
        else { ensurePartner(true); freshRound(hash(Date.now() & 0xffff, 2)); }
      } else if (c === 'accept') { match.accept(); }
      else if (c === 'decline') { match.decline(); intro(); }
      else if (c.startsWith('inv:')) { const id = Number(c.slice(4)); if (match.invite(id)) { k.note(`邀${match.label(id)}同射，等他应`, 'net'); if (phase === 'intro') intro(); else if (phase === 'end') endRound(); } }
      else if (c === 'aim' && Array.isArray(arg)) { aimU = clamp(aimU + Number(arg[0]), -1.6, 1.6); aimV = clamp(aimV + Number(arg[1]), -1.2, 1.4); }
      else if (c === 'done') k.exitAct();
    },
  };
  function onKey(e: KeyboardEvent) {
    const dn = e.type === 'keydown', key = e.key.toLowerCase();
    const set1 = (v: number, cur: number) => (dn ? v : cur === v ? 0 : cur);
    if (key === 'arrowleft' || key === 'a') { keyU = set1(-1, keyU); e.preventDefault(); }
    else if (key === 'arrowright' || key === 'd') { keyU = set1(1, keyU); e.preventDefault(); }
    else if (key === 'arrowup' || key === 'w') { keyV = set1(1, keyV); e.preventDefault(); }
    else if (key === 'arrowdown' || key === 's') { keyV = set1(-1, keyV); e.preventDefault(); }
  }
  function onBlur() { keyU = keyV = 0; }

  // —— 射的人怎么摆：左手执弓（伸向侯）、右手扣弦，引几成就往后拉几成；-1 是弓垂在身侧 ——
  // （侧身站：左肩对着侯，头转过去看侯；肩膀往侯那边回一点）
  const tv = V(), tv2 = V(), tv3 = V(), upB = V(), backB = V(), rA = V(), dA = V();
  type Archer = { reach: (s: 'L' | 'R', p: THREE.Vector3 | null, o?: object) => void; lookAt: (p: THREE.Vector3 | null) => void; twist?: number; joints: { handL: THREE.Object3D; handR: THREE.Object3D } };
  /** 只摆手（身子走这一帧之前调） */
  function reachPose(av: Archer, i: 0 | 1, k01: number, loosed: boolean) {
    const m = markPos(i), d = dirT(i), r = rightA(i, rA);
    av.lookAt(C);
    if (k01 < 0) {
      // 弓提在左手里垂着，梢朝下朝前
      av.reach('L', tv.copy(m).addScaledVector(r, -0.2).addScaledVector(fwdA(i, dA), 0.1).add(V(0, 0.8, 0)), { grip: upB.set(0, 1, 0).addScaledVector(d, 0.3).normalize(), rate: 6 });
      av.reach('R', null);
      av.twist = 0.1;
      return;
    }
    const grip = gripAt(i, tv);
    av.reach('L', grip, { grip: bowUp(i, upB), rate: 9 });
    // 扣弦的手：从弓上（不引）往后拉到腮边（满弓）；发出去以后手顺势往后一撒
    const rest = tv2.copy(grip).addScaledVector(d, -0.14).add(V(0, -0.02, 0)), anchor = anchorAt(i, tv3);
    const nock = rest.lerp(anchor, Math.min(1, k01));
    if (loosed) nock.addScaledVector(d, -0.1).addScaledVector(r, 0.06).add(V(0, 0.015, 0));
    av.reach('R', nock, { dir: dA.copy(d).multiplyScalar(-1).add(V(0, -0.3, 0)).normalize(), rate: loosed ? 22 : 12 });
    av.twist = 0.42;
  }
  /** 弓身朝上的方向：略往外斜一点 */
  const bowUp = (i: 0 | 1, out: THREE.Vector3) => out.set(0, 1, 0).addScaledVector(rightA(i, rA), -0.1).normalize();
  /** 按手此刻的位置摆弓与弦（身子走过这一帧以后调） */
  function bowPose(av: Archer, i: 0 | 1, k01: number, loosed: boolean, bow: Bow) {
    const d = dirT(i);
    av.joints.handL.getWorldPosition(tv);
    if (k01 < 0) { bow.set(tv, upB.set(0, 1, 0).addScaledVector(d, 0.3), backB.copy(d).addScaledVector(rightA(i, rA), -0.5), null, camPos()); return; }
    av.joints.handR.getWorldPosition(tv2);
    bow.set(tv, bowUp(i, upB), backB.copy(d), loosed || k01 < 0.02 ? null : tv2, camPos());
  }
  function pose(av: Archer, i: 0 | 1, k01: number, loosed: boolean, bow: Bow) { reachPose(av, i, k01, loosed); bowPose(av, i, k01, loosed, bow); }

  // —— 每帧：箭、侯、幡、墨点、陪射的人 ——
  const pv = V(), pv2 = V(), upV = V(), backV = V(), vt: [number, number, number] = [0, 0, 0], vv: [number, number, number] = [0, 0, 0];
  onFrame(k, 'archery', (dt, time) => {
    const near = camFar(k, C.x, C.z) < 90;
    const ws = wind(windV);
    if (near) { flag.update(dt, windV.x, windV.z, ws); cloth.update(dt, Math.min(1, ws / 4)); }
    if (act !== k.act) { if (dots.mesh.visible) { dots.clear(); dots.commit(); } return; }
    // 陪射的人：先摆手、走一帧，再照手摆弓；轮到他时引、发
    if (partner) {
      const o = 1 - me as 0 | 1;
      let k01 = -1, loosed = false;
      if (partner.walking) k01 = -2;
      else if (phase === 'npc' && npc) {
        npc.t += dt;
        k01 = npc.t < 0.7 ? 0 : clamp((npc.t - 0.7) / 1.3) * npc.draw;
        if (!npc.fired && npc.t > 2.0 + npc.hold) {
          npc.fired = true;
          const a = A[arrowOf(o, Math.floor(n / 2))];
          const shot = loose(nockAt(o).toArray() as [number, number, number], onTarget(npc.aim[0], npc.aim[1]).toArray() as [number, number, number], npc.draw, [windV.x * ws, windV.z * ws]);
          const x = crossTarget(shot, T), r = x && Math.abs(x.u) <= HOU.hw && Math.abs(x.v) <= HOU.hh ? ring(x.u, x.v) : 0;
          fly(a, shot, r);
        }
      } else if (phase === 'fly' && SHOOTER(n) === o && npc?.fired) { k01 = 1; loosed = true; }
      if (k01 === -2) { partner.fig.reach('L', null); partner.fig.reach('R', null); partner.fig.lookAt(null); partner.fig.twist = 0; }
      else reachPose(partner.fig, o, k01, loosed);
      partner.update(dt, time);
      if (k01 === -2) { partner.fig.joints.handL.getWorldPosition(pv); bows[1].set(pv, upV.set(0, -1, 0.25), backV.set(0, 0, 1), null, camPos()); }
      else bowPose(partner.fig, o, k01, loosed, bows[1]);
      keep.set(1, partner.pos.x, partner.pos.z, 0.7);
    }
    for (const p of leaving) p.update(dt, time);
    // 箭：一支一支摆（远处也看得见的细带）
    const cam = camPos(), px = (2 * Math.tan((k.world.camera.fov * Math.PI) / 360)) / Math.max(200, k.world.size.y || 800);
    for (let i = 0; i < A.length; i++) {
      const a = A[i], who = (i < ARROWS ? 0 : 1) as 0 | 1;
      if (a.s === 'hand') {
        // 在弦上：箭尾扣在右手、箭身搭在弓上朝侯
        const fig = who === me ? k.player.av : partner?.fig;
        if (!fig) { strips.set(i, null, a.d, cam, px); continue; }
        fig.joints.handR.getWorldPosition(pv);
        fig.joints.handL.getWorldPosition(pv2);
        const dir = pv2.sub(pv);
        if (dir.lengthSq() < 0.01) dir.copy(dirT(who));
        dir.normalize();
        a.d.copy(dir);
        a.p.copy(pv).addScaledVector(dir, ARROW_LEN - 0.03);
      } else if (a.s === 'fly' && a.shot) {
        a.t += dt;
        const tt = Math.min(a.t, a.hitT);
        arrowAt(a.shot, tt, vt); arrowVel(a.shot, tt, vv);
        a.p.set(vt[0], vt[1], vt[2]);
        a.d.set(vv[0], vv[1], vv[2]).normalize();
        if (a.t >= a.hitT && a.hit) {
          // 钉在布上：镞没进布里一点
          a.s = 'stuck';
          a.p.addScaledVector(a.d, 0.06);
          cloth.hit(a.hit.u, a.hit.v, 1);
          sfx(k, 'strike', { vel: 0.5 + 0.12 * a.hit.r, x: C.x, z: C.z });
          if (a.hit.r === 3) sfx(k, 'drum', { vel: 0.35, x: C.x, z: C.z, delay: 0.12 });
          landed(who, a);
        } else if (!a.hit) {
          const g = groundAt(a.p.x, a.p.z);
          if (g == null && a.p.y < C.y - 3) {
            // 落进溪里
            a.s = 'gone'; k.land.ripple(a.p.x, a.p.z, 0.6); sfx(k, 'plop', { vel: 0.3, x: a.p.x, z: a.p.z }); landed(who, a);
          } else if (g != null && a.p.y < g + 0.02) {
            a.s = 'ground'; a.p.y = g + 0.02 - 0.14 * Math.max(0.3, -a.d.y);
            sfx(k, 'arrowMiss', { vel: 0.4, x: a.p.x, z: a.p.z }); landed(who, a);
          } else if (a.t > 4) { a.s = 'gone'; landed(who, a); }
        }
      }
      strips.set(i, a.s === 'rack' || a.s === 'gone' ? null : a.p, a.d, cam, px);
    }
    strips.commit();

    // 墨点：瞄着时侯上一点（落在鹄上转朱）
    dots.clear();
    for (const m of marks) dots.add(m.x, m.y, m.z, 0.022, DOT_INK, 0.75);
    if (phase === 'ready' || phase === 'draw') {
      const u = aimU + swayU, v = aimV + swayV, on = Math.hypot(u, v) < HOU.hu;
      onTarget(u, v, pv).addScaledVector(V(0, 0, -1), 0.04);
      // 一圈十二个小墨点围着一点：白布上、朱鹄上都看得清；对在鹄上时浓些
      for (let j = 0; j < 12; j++) { const g = (j / 12) * Math.PI * 2; dots.add(pv.x + Math.cos(g) * 0.075, pv.y + Math.sin(g) * 0.075, pv.z, 0.011, DOT_INK, on ? 0.95 : 0.6); }
      dots.add(pv.x, pv.y, pv.z, 0.014, on ? DOT_ZHU : DOT_INK, 0.9);
    }
    dots.commit();
    DEBUG.archery = { phase, n, me, score: [...score], rings: [rings[0].slice(), rings[1].slice()], aim: [aimU, aimV], sway: [swayU, swayV], draw, match: match.cur ? { peer: match.peer, side: match.side } : null, partner: partner?.name ?? null };
  });
  afterFrame(k, 'archery', (dt) => { match.tick(dt); });

  // 同游的人在射箭：手里一张弓（垂在左手边）
  registerRemoteProp('archery', {
    make() {
      const root = new THREE.Group(), b = new Bow();
      b.mesh.matrixAutoUpdate = true;
      b.mesh.position.set(0.24, 0.82, 0.12); b.mesh.rotation.set(0.3, Math.PI / 2, 0);
      root.add(b.mesh);
      return { root, dispose() { b.mesh.geometry.dispose(); b.string.mesh.geometry.dispose(); } };
    },
  });
  return act;
}
