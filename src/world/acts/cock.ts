/**
 * 斗鸡（土地庙南边、茶亭东南的空地上，一圈草绳围的场）：借王家二郎的两只鸡——你抱赤羽，陪你的人抱芦花。
 *   下场：两人蹲在场边把鸡放下，两只鸡颈羽一炸，对上了。
 *   一回合两边同时出一招：啄（费力一）、扑（费力二）、闪（不费力，缓一口气）。扑压得住啄，啄啄得着闪，闪让得开扑；
 *   同招时力足的占上风。鸡的「气」（斗志）五、「力」六，写在鸡头上的小签里；力不够的招出不来。
 *   哪一只气尽了，就怯了——掉头扑着翅膀跑开；胜的那只引颈一啼。九个回合没分出来，气多的胜。不见血，不伤。
 *   一个人来：村里的后生蹲在对面，他的鸡怎么出招看他（种子定，偏爱克你上一招）。
 *   同游时近处有人：「邀某某斗鸡」，他应了就蹲到对面；两边各自出招，都出了才一起亮出来（谁先出谁后出，对面都看不见），
 *   一边十二秒没出就替他出一招（他自己那边替的，两边一样）；他走了、久不应，就收场，鸡还给二郎。
 * 规矩在 play/games/cock.ts，鸡与场在 play/cock.ts。胜一场记一场（榜 'cock'：一共胜过几场）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from './types';
import { COCKS, Roosters, ringGeo } from '../play/cock';
import { COST, DODGE, MOVE_NAME, PECK, POUNCE, apply, can, fresh, legal, pick, resolve, verdict, type Bird, type Clash, type Move } from '../play/games/cock';
import { Match, inboxChoices, inviteChoices } from '../play/games/match';
import { DEBUG, Partner, afterFrame, cn, pickWho, rankText, shunning, type Who } from '../play/games/kit';
import { hash } from '../play/games/dice';
import '../play/games/boards';
import { report } from '../play/board';
import { V, camFar, clamp, onFrame, setStatic, sfx, stateOf } from '../play/kit';
import { footY } from '../life/spots';
import { addDisc, groundAt } from '../walk';
import { registerRemoteProp } from '../net/props';

/** 场心、半径；两个蹲处（西、东）；两只鸡罩（场北） */
const RING = { x: 39.5, z: 32.2, r: 1.2 };
const HANDLER = [{ x: RING.x - 1.55, z: RING.z, yaw: Math.PI / 2 }, { x: RING.x + 1.55, z: RING.z, yaw: -Math.PI / 2 }];
const CAGES = [{ x: RING.x - 0.9, z: RING.z - 2.15 }, { x: RING.x + 0.9, z: RING.z - 2.15 }];
/** 鸡在场里对峙时离场心多远 */
const STAND = 0.52;
const HANDLERS: Who[] = [{ id: 'farmson', look: 'farmson', name: '二郎' }, { id: 'miller', look: 'miller', name: '柱子' }, { id: 'carpenter2', look: 'carpenter2', name: '小乙' }];
const OP_MOVE = 10, OP_AGAIN = 11;
/** 出招要在几秒内 */
const CHOOSE_S = 12;

export function create(k: Anlewo): Act | null {
  if (groundAt(RING.x, RING.z) == null) return null;
  const { state, set, put, flush } = stateOf(k);
  setStatic(k, 'cock', 'ring', ringGeo(RING, RING.r, CAGES));
  for (const c of CAGES) addDisc(c.x, c.z, 0.3);
  const cocks = new Roosters(COCKS);
  cocks.parts.cull = true;
  k.world.scene.add(cocks.parts.mesh);
  const R = cocks.rigs;
  const gy = footY(RING.x, RING.z);

  // —— 一场 ——
  type Phase = 'hold' | 'enter' | 'choose' | 'waitFoe' | 'clash' | 'over' | 'end' | 'off';
  let phase: Phase = 'off', t = 0, round = 0, me: 0 | 1 = 0, seed = 1, line = '', chooseT = 0;
  const birds: [Bird, Bird] = [fresh(), fresh()];
  const moves: [number, number] = [-1, -1];
  const last: [number, number] = [-1, -1];
  let clash: Clash | null = null, result: 1 | -1 | 0 | null = null;
  /** 同游时对面先到的招（回合 → 招） */
  const early = new Map<number, number>();
  let partner: Partner | null = null;
  const leaving: Partner[] = [];
  const keep = shunning(3);
  const match = new Match('cock', 'cock', {
    range: 26,
    invited: (fr, label) => { k.note(`${label}邀你斗鸡——到土地庙南边的场子，点「斗鸡」应邀`, 'net'); if (k.act === act && (phase === 'hold' || phase === 'end')) intro(); },
    start: (_peer, side) => startMatch(side),
    msg: (op, d) => onMsg(op, d),
    end: (why, label) => endMatch(why, label),
  });
  const foeName = () => (match.cur ? match.label(match.peer) : partner?.name ?? '二郎');
  /** 「赤羽」「芦花」：第 i 只（i 是西、东） */
  const cockName = (i: number) => COCKS[i].name;

  // —— 陪你的人 ——
  const ensurePartner = (walkIn: boolean) => {
    if (partner) return;
    const o = (1 - me) as 0 | 1, h = HANDLER[o];
    const who = pickWho(k, HANDLERS, RING.x, RING.z);
    partner = new Partner(k, who, walkIn ? { x: h.x + 3, z: h.z - 3.5, yaw: Math.PI } : h);
    if (walkIn) partner.walkTo(h.x, h.z, () => partner?.turnTo(h.yaw)); else partner.turnTo(h.yaw);
  };
  const dropPartner = () => {
    const p = partner;
    if (!p) return;
    partner = null;
    p.fig.setPose('stand', 0.8); p.fig.reach('L', null); p.fig.reach('R', null); p.fig.lookAt(null);
    p.walkTo(p.pos.x + 3.5, p.pos.z - 5, () => { p.dispose(); const i = leaving.indexOf(p); if (i >= 0) leaving.splice(i, 1); });
    leaving.push(p);
  };

  // —— 界面 ——
  const status = (i: number) => `气${cn(birds[i].qi)} · 力${cn(birds[i].li)}`;
  const tags = () => {
    const out: Array<Record<string, unknown>> = [];
    if (phase === 'hold' || phase === 'off') return out;
    for (const i of [0, 1]) {
      const r = R[i];
      if (r.hidden) continue;
      const showMove = (phase === 'clash' && t < 2.0) && clash;
      const mv = showMove ? MOVE_NAME[i === 0 ? clash!.a : clash!.b] : '';
      out.push({ id: `c${i}`, text: `${cockName(i)}${mv ? ` · ${mv}` : ''}`, sub: status(i), x: r.x, y: gy + 0.5 + r.lift, z: r.z, kind: i === me ? 'hot' : undefined });
    }
    return out;
  };
  const moveChoices = () => ([PECK, POUNCE, DODGE] as Move[]).map((m) => {
    const ok = can(birds[me], m);
    const sub = !ok ? '力不足' : m === DODGE ? '缓一口气' : `费力${cn(COST[m])}`;
    return { id: `m${m}`, label: MOVE_NAME[m], sub, off: !ok || undefined };
  });
  const intro = () => {
    phase = 'hold'; t = 0;
    const others = match.cur ? [] : [...inboxChoices(match, '斗鸡'), ...inviteChoices(match, '斗鸡')];
    const waiting = match.out ? `已邀${match.label(match.out.to)}，等他应。` : '';
    set({
      kind: 'cock', title: '斗鸡',
      text: `${foeName()}把赤羽递给你，自己抱着芦花。两只都是好斗的鸡，只是斗志高低，不见血。一回合各出一招：扑压得住啄，啄啄得着闪，闪让得开扑。${waiting}`,
      choices: [{ id: 'go', label: '下场', main: !match.inbox }, ...others, { id: 'done', label: '罢' }],
    });
  };
  const chooseView = () => {
    const left = clamp(1 - chooseT / CHOOSE_S);
    // 斗起来面板收紧（贴底一条，三招排成一行）：场子让出来，小屏上三招也都看得见
    if (phase === 'choose') set({ kind: 'cock', title: '斗鸡', count: round + 1, compact: true, hint: `第${cn(round + 1)}回合，出一招`, text: line || `${cockName(me)}${status(me)}；${cockName(1 - me)}${status(1 - me)}。`, choices: [...moveChoices(), { id: 'done', label: '罢' }], progress: left, tags: tags() });
    else if (phase === 'waitFoe') set({ kind: 'cock', title: '斗鸡', count: round + 1, compact: true, hint: `已出：${MOVE_NAME[moves[me]]}。等${foeName()}出招`, text: line || `第${cn(round + 1)}回合。`, progress: left, tags: tags(), choices: [{ id: 'done', label: '罢' }] });
  };

  // —— 鸡怎么动 ——
  const toward = (i: number) => (i === 0 ? 1 : -1);
  const baseX = (i: number) => RING.x - toward(i) * STAND;
  const placeStand = (i: number) => { const r = R[i]; r.hidden = false; r.held = null; r.x = baseX(i); r.z = RING.z; r.yaw = i === 0 ? Math.PI / 2 : -Math.PI / 2; r.lift = 0; r.lean = 0; r.neck = 0; r.nod = 0; r.wing = 0; r.flap = 0; r.walk = 0; r.crouch = 0; r.roll = 0; r.flare = 0.3; };
  /** 抱在手里：在那个人胸前，两手托着 */
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = V(), _s = V(1, 1, 1), _c = V();
  const holdIn = (i: number, fig: { joints: { chest: THREE.Object3D }; reach: (s: 'L' | 'R', p: THREE.Vector3 | null, o?: object) => void }, yaw: number) => {
    const r = R[i];
    fig.joints.chest.getWorldPosition(_c);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    _p.set(_c.x + fx * 0.24, _c.y - 0.2, _c.z + fz * 0.24);
    _q.setFromEuler(_e.set(-0.25, yaw + 0.6, 0, 'YXZ'));
    r.held = (r.held ?? new THREE.Matrix4()).compose(_p, _q, _s); r.hidden = false; r.flare = 0; r.wing = 0; r.flap = 0; r.neck = 0; r.lean = 0;
    fig.reach('L', V(_p.x - fz * 0.09, _p.y - 0.02, _p.z + fx * 0.09), { rate: 8 });
    fig.reach('R', V(_p.x + fz * 0.09, _p.y - 0.02, _p.z - fx * 0.09), { rate: 8 });
  };

  // —— 一场怎么走 ——
  const freshMatch = (s: number) => {
    seed = s; round = 0; birds[0] = fresh(); birds[1] = fresh(); last[0] = last[1] = -1; line = ''; result = null; clash = null; early.clear();
    phase = 'enter'; t = 0;
    sfx(k, 'flap', { vel: 0.4, x: RING.x, z: RING.z });
    set({ kind: 'cock', title: '斗鸡', hint: '两人蹲下，把鸡放进场里', tags: [] });
  };
  const startRound = () => {
    moves[0] = moves[1] = -1; chooseT = 0; phase = 'choose'; t = 0;
    // 对面是村里人：他这时就想好了（看不见）
    const o = 1 - me;
    if (!match.cur) moves[o] = pick(birds[o], birds[me], last[me], seed, round, o, 0.55);
    else if (early.has(round)) { moves[o] = legal(birds[o], early.get(round)!); early.delete(round); }
    chooseView();
  };
  const choose = (m: number) => {
    if (phase !== 'choose' || !can(birds[me], m as Move)) return;
    moves[me] = m;
    if (match.cur) match.send(OP_MOVE, round, m);
    if (moves[1 - me] >= 0) reveal(); else { phase = 'waitFoe'; chooseView(); }
  };
  const reveal = () => {
    const a = moves[0], b = moves[1];
    clash = resolve(birds[0], birds[1], a, b, seed, round);
    phase = 'clash'; t = 0;
    line = clashWords(clash);
    set({ kind: 'cock', title: '斗鸡', count: round + 1, compact: true, text: line, tags: tags(), choices: [{ id: 'done', label: '罢' }] });
    sfx(k, 'flap', { vel: 0.5, x: RING.x, z: RING.z });
  };
  const clashWords = (c: Clash): string => {
    const A = cockName(0), B = cockName(1), w = c.win > 0 ? A : B, l = c.win > 0 ? B : A;
    switch (c.kind) {
      case 'pounce': return `${w}腾身一扑，正压在${l}的颈上；${l}退了两步。`;
      case 'peck': return `${l}往旁边一让，${w}伸颈一啄，啄个正着。`;
      case 'dodge': return `${l}扑过来，${w}侧身一让——扑了个空，落地一个踉跄。`;
      case 'pecks': return c.win ? `两只对啄，你来我往，${w}力足，占了上风。` : '两只对啄，你来我往，不分上下。';
      case 'clash': return `两只同时腾起，在半空撞在一处——${w}落得稳些。`;
      default: return '两只绕着场子转，谁也不先动，各自缓了一口气。';
    }
  };
  const afterClash = () => {
    if (!clash) return;
    apply(birds[0], birds[1], clash);
    last[0] = clash.a; last[1] = clash.b;
    round++;
    result = verdict(birds[0], birds[1], round);
    if (result != null) { phase = 'over'; t = 0; overStart(); return; }
    startRound();
  };
  const overStart = () => {
    const draw = result === 0, W = result === 1 ? 0 : 1, L = 1 - W;
    if (!draw) { sfx(k, 'rooster', { vel: 0.6, x: R[W].x, z: R[W].z, delay: 0.6 }); sfx(k, 'flap', { vel: 0.6, x: R[L].x, z: R[L].z }); }
    set({ kind: 'cock', title: '斗鸡', compact: true, text: draw ? '九个回合斗下来，两只气力相当，各自收了颈羽。' : `${cockName(L)}颈羽一落，掉头扑着翅膀跑开了。${cockName(W)}引颈一啼。`, tags: tags() });
  };
  let againLater: number | null = null;
  const finish = () => {
    phase = 'end';
    if (againLater != null && match.cur) { const add = againLater; againLater = null; window.setTimeout(() => { if (phase === 'end' && match.cur) freshMatch(match.seed + add); }, 2200); }
    const won = result === (me === 0 ? 1 : -1), draw = result === 0;
    const mem = k.mem.get<{ wins?: number; n?: number }>('games', {}) as Record<string, unknown>;
    const rec = (mem.cock as { wins?: number; n?: number } | undefined) ?? {};
    const wins = (rec.wins ?? 0) + (won ? 1 : 0);
    k.mem.patch('games', { cock: { wins, n: (rec.n ?? 0) + 1 } });
    let rankLine = '';
    if (won) { const r = report(k, 'cock', wins); rankLine = `胜过${cn(wins)}场，${rankText(r.rank)}。`; }
    k.log({ kind: 'play', text: won ? '斗鸡，胜了一场' : draw ? '斗鸡，和了' : '斗鸡，输了一场' });
    const foe = foeName();
    set({
      kind: 'cock', title: '斗鸡', done: won,
      text: `${won ? `${cockName(me)}胜了。${foe}笑着把${cockName(1 - me)}抱回去理毛。` : draw ? '和了。两人各抱各的鸡。' : `${cockName(1 - me)}胜了。${foe}朝你一笑：「再来一场？」`}\n${rankLine}`,
      tags: tags(),
      choices: [{ id: 'again', label: '再斗一场', main: true }, ...(match.cur ? [] : inviteChoices(match, '斗鸡')), { id: 'done', label: '罢' }],
    });
  };

  // —— 同游 ——
  const startMatch = (side: 0 | 1) => {
    dropPartner();
    me = side;
    const h = HANDLER[me];
    if (k.act === act) { k.player.settleAt(h.x, h.z); k.player.faceTo = h.yaw; camTo(); }
    k.note(`与${match.label(match.peer)}斗鸡：你抱${cockName(me)}`, 'net');
    freshMatch(match.seed);
  };
  const onMsg = (op: number, d: number[]) => {
    if (op === OP_MOVE) {
      const r = d[2], m = d[3], o = 1 - me;
      if (r === round && (phase === 'choose' || phase === 'waitFoe') && moves[o] < 0) {
        moves[o] = legal(birds[o], m);
        if (moves[me] >= 0) reveal();
      } else if (r >= round) early.set(r, m);
    } else if (op === OP_AGAIN) {
      // 对面先点了「再斗一场」：这边鸡还在跑、在啼，等这一场收了再开
      if (phase === 'end' || phase === 'hold') freshMatch(match.seed + d[2]); else againLater = d[2];
    }
  };
  const endMatch = (why: string, label: string) => {
    const words: Record<string, string> = { left: `${label}走了`, quit: `${label}不斗了`, timeout: `${label}久不应`, declined: `${label}谢绝了`, busy: `${label}正忙` };
    k.note(words[why] ?? `${label}走了`, 'net');
    if (k.act !== act) return;
    if (phase === 'hold' || phase === 'end') { intro(); return; }
    // 斗到一半对面走了：二郎来接过他的鸡，这一场照样斗完
    ensurePartner(true);
    k.note(`${partner?.name}过来接过鸡：「我替他斗完」`);
    const o = 1 - me;
    if ((phase === 'choose' || phase === 'waitFoe') && moves[o] < 0) { moves[o] = pick(birds[o], birds[me], last[me], seed, round, o, 0.55); if (moves[me] >= 0) reveal(); }
  };

  // —— 镜头：场南边，低低地看过去，两人一左一右 ——
  const camTo = () => {
    const tall = k.world.camera.aspect < 1;
    k.nav.setPose({ pos: V(RING.x + 0.3, gy + (tall ? 1.9 : 1.35), RING.z + (tall ? 4.9 : 3.5)), look: V(RING.x, gy + 0.2, RING.z), fov: tall ? 54 : 40, yaw: 10, up: 6, down: 6 }, 1.4);
  };

  const act: Act = {
    id: 'cock', name: '斗鸡', anchor: V(RING.x, gy + 0.9, RING.z - 2.15), radius: 3.0, state, noZoom: true,
    get spot() {
      // 西边的蹲处有人了（同游的人在这里斗），就到东边
      const tg = (window as unknown as { __net?: { remotes: Map<number, { pos: THREE.Vector3; hidden: boolean }> } }).__net;
      let i = 0;
      if (tg) for (const r of tg.remotes.values()) if (!r.hidden && Math.hypot(r.pos.x - HANDLER[0].x, r.pos.z - HANDLER[0].z) < 0.6) i = 1;
      return { x: HANDLER[i].x, z: HANDLER[i].z, yaw: HANDLER[i].yaw };
    },
    enter() {
      const p = k.player;
      me = Math.hypot(p.pos.x - HANDLER[1].x, p.pos.z - HANDLER[1].z) < Math.hypot(p.pos.x - HANDLER[0].x, p.pos.z - HANDLER[0].z) ? 1 : 0;
      p.av.setHands('free');
      camTo();
      if (!match.inbox) ensurePartner(true);
      intro();
    },
    exit() {
      if (match.cur) match.leave(); else match.cancel();
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null);
      dropPartner();
      for (const r of R) { r.hidden = true; r.held = null; }
      phase = 'off';
      keep.off();
    },
    update(dt) {
      t += dt; flush();
      const av = k.player.av, h = HANDLER[me];
      keep.set(0, h.x, h.z, 0.6);
      keep.set(2, RING.x, RING.z, RING.r + 0.3);
      if (phase === 'hold' || phase === 'end') {
        if (av.pose !== 'stand') av.setPose('stand', 0.8);
        holdIn(me, av, k.player.yaw);
      } else if (phase === 'off') { /* 无 */ }
      else {
        if (av.pose !== 'crouch') av.setPose('crouch', 0.7);
        // 蹲在场边：放鸡时两手往前送，斗起来手搭在膝上、看着鸡
        if (phase === 'enter' && t < 1.0) { const r = R[me]; av.reach('L', V(r.x - 0.06, gy + 0.18, r.z + 0.08), { rate: 8 }); av.reach('R', V(r.x - 0.06, gy + 0.18, r.z - 0.08), { rate: 8 }); }
        else { av.reach('L', null); av.reach('R', null); }
        av.lookAt(V(RING.x, gy + 0.2, RING.z));
      }
      if (phase === 'enter') {
        // 自己的鸡这就放下；对面的鸡等那个人蹲下了才放（同游的人那边自己放，这里直接放下）
        // （还抱在手里的就是还没放：不靠这一帧快慢——卡了一下也照样放下）
        if (R[me].held || R[me].hidden) { placeStand(me); R[me].x = HANDLER[me].x + toward(me) * 0.42; released[me] = t; }
        const o = 1 - me;
        if ((R[o].held || R[o].hidden) && (!partner || !partner.walking)) { placeStand(o); R[o].x = HANDLER[o].x + toward(o) * 0.42; released[o] = t; }
        if (t > 2.0 && t - released[1 - me] > 1.6 && !R[1 - me].held) startRound();
      } else if (phase === 'choose' || phase === 'waitFoe') {
        chooseT += dt;
        if (Math.floor(chooseT * 4) !== Math.floor((chooseT - dt) * 4)) put({ progress: clamp(1 - chooseT / CHOOSE_S) });
        // 到时候了还没出：替自己出一招（同游时对面那边也是这么替他的）
        if (phase === 'choose' && chooseT > CHOOSE_S) { line = '想得太久——鸡自己出了一招。'; choose(pick(birds[me], birds[1 - me], last[1 - me], seed, round, me, 0.4)); }
        // 对面久不出：多等一会儿再收场（对面那边会替他出，这里收不到就是断了）
        if (phase === 'waitFoe' && chooseT > CHOOSE_S + 14 && match.cur) { const label = match.label(match.peer); match.leave(); endMatch('timeout', label); }
      } else if (phase === 'clash') {
        if (t > 2.6) afterClash();
      } else if (phase === 'over') {
        if (t > 3.2) finish();
      }
    },
    cmd(c) {
      if (c === 'go' && phase === 'hold') { match.cancel(); ensurePartner(true); freshMatch(hash(Date.now() & 0xffff, 5)); }
      else if (c.startsWith('m') && c.length === 2) choose(Number(c[1]));
      else if (c === 'again' && phase === 'end') {
        if (match.cur) { const add = 1 + (Date.now() % 997); match.send(OP_AGAIN, add); freshMatch(match.seed + add); }
        else { ensurePartner(true); freshMatch(hash(Date.now() & 0xffff, 6)); }
      } else if (c === 'accept') match.accept();
      else if (c === 'decline') { match.decline(); intro(); }
      else if (c.startsWith('inv:')) { const id = Number(c.slice(4)); if (match.invite(id)) { k.note(`邀${match.label(id)}斗鸡，等他应`, 'net'); if (phase === 'hold') intro(); else if (phase === 'end') finish(); } }
      else if (c === 'done') k.exitAct();
    },
  };

  // —— 每帧：两只鸡照时间线动；陪你的人 ——
  let caged = true;
  /** 两只鸡各在什么时候放进场里 */
  const released = [0, 0];
  const animate = (dt: number, time: number) => {
    const fight = phase === 'enter' || phase === 'choose' || phase === 'waitFoe' || phase === 'clash' || phase === 'over';
    if (!fight) return;
    for (const i of [0, 1]) {
      const r = R[i], s = toward(i), bx = baseX(i);
      if (phase === 'enter') {
        // 放下以后往场心走几步，颈羽慢慢炸开
        r.x += (bx - r.x) * Math.min(1, dt * 2.2); r.walk = Math.abs(bx - r.x) > 0.02 ? 0.3 : 0; r.flare = Math.min(1, t / 1.6) * 0.8;
        r.nod = 0.15 * Math.sin(time * 2 + i);
      } else if (phase === 'choose' || phase === 'waitFoe') {
        // 对峙：头一伸一缩地盯着对面，偶尔挪一小步
        r.x += (bx - r.x) * Math.min(1, dt * 3); r.walk = 0; r.lift = 0; r.wing = 0; r.flap = 0;
        r.flare = 0.55 + 0.25 * Math.sin(time * 1.3 + i * 2);
        r.neck = 0.1 + 0.1 * Math.max(0, Math.sin(time * 2.4 + i * 1.7)); r.nod = 0.1 * Math.sin(time * 3.1 + i);
        r.crouch = 0.25; r.lean = 0.12;
      } else if (phase === 'clash' && clash) {
        const m = i === 0 ? clash.a : clash.b, won = (clash.win > 0 && i === 0) || (clash.win < 0 && i === 1), lost = clash.win !== 0 && !won;
        const u = t;
        // 先凑近
        const close = clamp(u / 0.45) * (1 - clamp((u - 2.15) / 0.45));
        let x = bx + s * 0.2 * close, side = 0, lift = 0, neck = 0.1, wing = 0, flap = 0, lean = 0.2 * close;
        if (m === PECK) { const k1 = Math.max(0, Math.sin(Math.PI * clamp((u - 0.55) / 0.35))); neck = 0.1 + 0.9 * k1; x += s * 0.1 * k1; lean += 0.35 * k1; }
        else if (m === POUNCE) { const k1 = clamp((u - 0.5) / 0.75), arc = Math.sin(Math.PI * k1); lift = 0.3 * arc; x += s * 0.22 * arc; wing = arc; flap = arc > 0.05 ? 1 : 0; lean -= 0.3 * arc; }
        else { const k1 = Math.sin(Math.PI * clamp((u - 0.55) / 0.6)); side = 0.24 * k1 * (i === 0 ? 1 : -1); flap = k1 > 0.3 ? 0.4 : 0; wing = 0.3 * k1; }
        // 结果：输的往后退、甩甩头；赢的往前一挺、颈羽炸着
        if (u > 1.25) {
          const k2 = Math.sin(Math.PI * clamp((u - 1.25) / 0.9));
          if (lost) { x -= s * 0.32 * k2; neck = 0.05; r.turn = 0.4 * Math.sin(time * 22) * k2; flap = Math.max(flap, 0.5 * k2); }
          else if (won) { x += s * 0.06 * k2; r.turn = 0; }
        } else r.turn = 0;
        r.x = x; r.z = RING.z + side; r.lift = lift; r.neck = neck; r.wing = wing; r.flap = flap; r.lean = lean;
        r.flare = won ? 1 : lost && u > 1.3 ? 0.2 : 0.8; r.walk = close > 0 && close < 1 ? 0.35 : 0; r.crouch = 0.2;
        if (m === POUNCE && Math.abs(u - 0.5) < dt) sfx(k, 'flap', { vel: 0.55, x: r.x, z: r.z });
        if (m === PECK && Math.abs(u - 0.6) < dt) sfx(k, 'peck', { vel: 0.5, x: r.x, z: r.z });
      } else if (phase === 'over') {
        const W = result === 1 ? 0 : result === -1 ? 1 : -1;
        if (W < 0) { r.flare = Math.max(0, r.flare - dt); r.neck = 0; r.walk = 0; continue; }
        if (i === W) {
          // 胜的：引颈一啼，扇两下翅
          r.x += (bx - r.x) * Math.min(1, dt * 2); r.walk = 0;
          const k3 = Math.sin(Math.PI * clamp((t - 0.4) / 1.4));
          r.nod = -0.9 * k3; r.neck = 0.25 * k3; r.wing = 0.6 * k3; r.flap = k3 > 0.5 ? 0.6 : 0; r.flare = 0.7; r.lean = -0.3 * k3;
        } else {
          // 怯了：掉头，扑着翅膀跑回自己的人身边
          const h = HANDLER[i], tx = h.x + toward(i) * 0.45, want = Math.atan2(tx - r.x, h.z + 0.25 - r.z);
          r.yaw += Math.max(-dt * 8, Math.min(dt * 8, Math.atan2(Math.sin(want - r.yaw), Math.cos(want - r.yaw))));
          const d = Math.hypot(tx - r.x, h.z + 0.25 - r.z);
          if (d > 0.05) { const v = Math.min(1.6, d * 4) * dt; r.x += Math.sin(r.yaw) * v; r.z += Math.cos(r.yaw) * v; r.walk = 1.2; r.flap = 1; r.wing = 0.8; }
          else { r.walk = 0; r.flap = 0; r.wing = 0; }
          r.flare = 0; r.neck = 0; r.lean = 0.3; r.lift = 0.05 * Math.abs(Math.sin(time * 14)) * (d > 0.05 ? 1 : 0);
        }
      }
    }
  };
  onFrame(k, 'cock', (dt, time) => {
    if (act !== k.act) {
      // 不斗的时候：两只鸡在罩里（远了不画）
      const near = camFar(k, RING.x, RING.z) < 30;
      if (!near && !caged) { for (const p of leaving) p.update(dt, time); return; }
      caged = near;
      for (const i of [0, 1]) {
        const r = R[i];
        if (!near) { r.hidden = true; continue; }
        r.hidden = false; r.held = null; r.x = CAGES[i].x; r.z = CAGES[i].z; r.lift = 0; r.walk = 0; r.wing = 0; r.flap = 0; r.flare = 0; r.crouch = 0.1;
        r.yaw = Math.PI * 0.5 * (i ? -1 : 1) + 0.6 * Math.sin(time * 0.21 + i * 3);
        r.nod = 0.25 * Math.max(0, Math.sin(time * 0.9 + i * 2)) - 0.05; r.neck = 0.05; r.turn = 0.5 * Math.sin(time * 0.53 + i);
      }
      cocks.update(dt, time);
      for (const p of leaving) p.update(dt, time);
      return;
    }
    animate(dt, time);
    // 陪你的人：抱着鸡站着；斗起来蹲在场边
    if (partner) {
      const o = (1 - me) as 0 | 1, f = partner.fig, h = HANDLER[o];
      if (partner.walking || phase === 'hold' || phase === 'end') {
        if (f.pose !== 'stand') f.setPose('stand', 0.8);
        holdIn(o, f, partner.yaw);
      } else {
        if (f.pose !== 'crouch') f.setPose('crouch', 0.7);
        // 蹲稳了才把鸡放进场里（他是走过来的，可能比你晚）
        if (R[o].held) { placeStand(o); R[o].x = h.x + toward(o) * 0.42; released[o] = t; }
        if (phase === 'enter' && t - released[o] < 1.0) { const r = R[o]; f.reach('L', V(r.x + 0.06 * toward(o), gy + 0.18, r.z - 0.08), { rate: 8 }); f.reach('R', V(r.x + 0.06 * toward(o), gy + 0.18, r.z + 0.08), { rate: 8 }); }
        else { f.reach('L', null); f.reach('R', null); }
        f.lookAt(V(RING.x, gy + 0.2, RING.z));
      }
      partner.update(dt, time);
      keep.set(1, h.x, h.z, 0.6);
    } else if (match.cur && (phase === 'hold' || phase === 'end')) R[1 - me].hidden = true;
    for (const p of leaving) p.update(dt, time);
    cocks.update(dt, time);
    if (phase === 'clash' || phase === 'over' || phase === 'enter') put({ tags: tags() });
    DEBUG.cock = { phase, round, me, birds: birds.map((b) => ({ ...b })), moves: [...moves], result, partner: partner?.name ?? null, match: match.cur ? { peer: match.peer, side: match.side } : null };
  });
  afterFrame(k, 'cock', (dt) => match.tick(dt));

  // 同游的人在斗鸡：抱着他的鸡（蹲在场边放鸡斗的时候，鸡在场里——这边那一场是他们两个的，不另画）
  registerRemoteProp('cock', {
    make() {
      const one = new Roosters([COCKS[0]], 'net:cock'), root = new THREE.Group(), r = one.rigs[0];
      root.add(one.parts.mesh);
      const m = new THREE.Matrix4();
      return {
        root,
        update(dt, t) {
          // 在场边蹲处（正在斗）：不抱
          const near = HANDLER.some((h) => Math.hypot(root.position.x - h.x, root.position.z - h.z) < 0.45);
          r.hidden = near;
          r.held = m.compose(V(0.04, 1.02, 0.24), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0.6, 0, 'YXZ')), V(1, 1, 1));
          one.update(dt, t);
        },
        dispose() { one.parts.mesh.geometry.dispose(); },
      };
    },
  });
  return act;
}
