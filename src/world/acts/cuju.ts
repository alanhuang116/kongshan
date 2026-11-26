/**
 * 蹴鞠（门前明堂东边的草地上；白打，二人场）：没有球门，两人对踢，鞠不落地。
 *   鞠飞过来，脚下一圈墨晕越收越小、表上的针走进那一段时按「踢」（空格）——早了晚了都踢个空，鞠落了地，这一趟就完了。
 *   接到的头一脚是颠（鞠起来一人来高，落回自己跟前），第二脚传给对面；时机越准，传得越准、对面越好接。连踢越久，那一段越窄。
 *   人会自己挪到鞠落的地方去，不用管脚下。一趟里两人一共踢了几脚，就是这一趟的数（榜 'cuju'：最多几脚）。
 *   一个人来：村里的一位后生陪你踢（谁此刻不在近处就请谁）。
 *   同游时近处有人：「邀某某蹴鞠」，他应了就站到对面；每一脚都把出脚那一刻鞠在哪、多快发过去，两边算出来的弧一样；
 *   鞠飞到他跟前、他那边还没踢出来（路上有一点慢），这边就让鞠在他脚下颠着等一等。他走了、久不应，村里的后生过来接着陪你。
 * 鞠怎么飞在 play/games/ball.ts，鞠在 play/cuju.ts。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from './types';
import { R as BALL_R, TOUCH_Y, bounce, fromInts, hitTime, judge, kick, posAt, toInts, touchWindow, velAt, type Flight, type V3 } from '../play/games/ball';
import { Match, inboxChoices, inviteChoices } from '../play/games/match';
import { DEBUG, Partner, afterFrame, cn, hasKb, pickWho, rankText, shunning, type Who } from '../play/games/kit';
import { dice, hash } from '../play/games/dice';
import '../play/games/boards';
import { report } from '../play/board';
import { ballMesh } from '../play/cuju';
import { DOT_INK, DOT_ZHU, Dots } from '../play/pot';
import { V, clamp, onFrame, sfx, stateOf } from '../play/kit';
import { footY } from '../life/spots';
import { groundAt } from '../walk';

/** 场心；两人站处（西、东），相距四米八 */
const FIELD = { x: 12, z: 51 };
const SPOTS = [{ x: FIELD.x - 2.4, z: FIELD.z, yaw: Math.PI / 2 }, { x: FIELD.x + 2.4, z: FIELD.z, yaw: -Math.PI / 2 }];
const PLAYERS: Who[] = [{ id: 'carpenter2', look: 'carpenter2', name: '小乙' }, { id: 'farmson', look: 'farmson', name: '二郎' }, { id: 'miller', look: 'miller', name: '柱子' }, { id: 'kid2', look: 'kid2', name: '虎子' }];
const OP_KICK = 10, OP_DROP = 11, OP_AGAIN = 12;
/** 脚背在身前多远接鞠 */
const REACH = 0.36;

export function create(k: Anlewo): Act | null {
  if (groundAt(FIELD.x, FIELD.z) == null) return null;
  const { state, set, put, flush } = stateOf(k);
  const ball = ballMesh();
  k.world.scene.add(ball);
  const dots = new Dots(40, 2);
  dots.mesh.name = 'games:dots:cuju';
  k.world.scene.add(dots.mesh);
  const g0 = footY(FIELD.x, FIELD.z);
  const restAt = V(FIELD.x + 0.4, g0 + BALL_R, FIELD.z + 0.3);
  ball.position.copy(restAt);

  // —— 一趟 ——
  type Phase = 'intro' | 'play' | 'dropped' | 'off';
  let phase: Phase = 'off', t = 0, me: 0 | 1 = 0, rally = 0, best = 0, seq = 0, kb = false, fb = '', server: 0 | 1 = 0, salt = 1;
  /** 鞠：这一程从哪起飞、飞了多久、谁踢的、飞给谁、他接下来是第几脚（1 颠、2 传）、落到脚背那么高的那一刻 */
  const B = { f: null as Flight | null, t: 0, by: 0 as 0 | 1, to: 0 as 0 | 1, touch: 1 as 1 | 2, hitT: Infinity, held: false, heldT: 0, decided: false };
  /** 落了地：从哪、以多快落下，过了多久 */
  let drop: { p: V3; v: V3; t: number; g: number } | null = null;
  const at: V3 = [0, 0, 0], vel: V3 = [0, 0, 0];
  let partner: Partner | null = null;
  const leaving: Partner[] = [];
  const keep = shunning(3);
  const match = new Match('cuju', 'cuju', {
    range: 26,
    invited: (fr, label) => { k.note(`${label}邀你蹴鞠——到柴门南边明堂东头的草地，点「蹴鞠」应邀`, 'net'); if (k.act === act && phase !== 'play') intro(); },
    start: (_peer, side) => startMatch(side),
    msg: (op, d) => onMsg(op, d),
    end: (why, label) => endMatch(why, label),
  });
  const foe = () => (1 - me) as 0 | 1;
  const foeName = () => (match.cur ? match.label(match.peer) : partner?.name ?? '');
  const fwd = (i: number) => V(Math.sin(SPOTS[i].yaw), 0, Math.cos(SPOTS[i].yaw));
  /** 某人接鞠的那一点（脚背高，身前一点） */
  const touchAt = (i: number, ox = 0, oz = 0): V3 => { const s = SPOTS[i], f = fwd(i); return [s.x + f.x * REACH + ox, TOUCH_Y + footY(s.x, s.z), s.z + f.z * REACH + oz]; };

  // —— 陪你的人 ——
  const ensurePartner = (walkIn: boolean) => {
    if (partner) return;
    const o = foe(), s = SPOTS[o];
    const who = pickWho(k, PLAYERS, FIELD.x, FIELD.z);
    partner = new Partner(k, who, walkIn ? { x: s.x + 2.5, z: s.z - 4, yaw: Math.PI } : s);
    if (walkIn) partner.walkTo(s.x, s.z, () => partner?.turnTo(s.yaw)); else partner.turnTo(s.yaw);
  };
  const dropPartner = () => {
    const p = partner;
    if (!p) return;
    partner = null;
    p.walkTo(p.pos.x + 3, p.pos.z - 5, () => { p.dispose(); const i = leaving.indexOf(p); if (i >= 0) leaving.splice(i, 1); });
    leaving.push(p);
  };

  // —— 界面 ——
  const method = () => (kb ? '鞠落到脚下、墨晕收紧、针走进那一段时按空格' : '鞠落到脚下、墨晕收紧、针走进那一段时按「踢」');
  const intro = () => {
    phase = 'intro'; t = 0;
    const others = match.cur ? [] : [...inboxChoices(match, '蹴鞠'), ...inviteChoices(match, '蹴鞠')];
    const waiting = match.out ? `已邀${match.label(match.out.to)}，等他应。` : '';
    const name = partner?.name ?? '村里的后生';
    set({
      kind: 'cuju', title: '蹴鞠',
      text: `白打，二人场：不设球门，两人对踢，鞠不落地。接到的头一脚颠起来，第二脚传给${name}。${best ? `这一回最多连踢${cn(best)}脚。` : ''}${waiting}`,
      choices: [{ id: 'go', label: '开踢', main: !match.inbox }, ...others, { id: 'done', label: '罢' }],
    });
  };
  const meter = () => {
    if (!B.f || B.to !== me || B.held || drop) return undefined;
    const w = touchWindow(rally), span = 1.25, s0 = B.hitT - 1.0;
    return { v: clamp((B.t - s0) / span), lo: clamp((1.0 - w) / span), hi: clamp((1.0 + w) / span), label: '鞠' };
  };
  const view = (now = false) => {
    if (phase !== 'play') return;
    const mine = !!B.f && B.to === me && !drop;
    put({
      kind: 'cuju', title: '蹴鞠', count: rally, hint: fb || (mine ? method() : B.f ? `${foeName()}接` : ''),
      meter: meter(), hold: { id: 'kick', label: '踢' }, keys: kb ? [{ key: '空格', label: '踢' }] : undefined, choices: [{ id: 'done', label: '罢' }],
    }, now);
  };

  // —— 踢 ——
  /** 某人踢一脚：q 是准头（0…1）；这一脚是他的第几脚（1 颠给自己、2 传给对面）；from 是鞠此刻在哪 */
  const kickBy = (who: 0 | 1, q: number, touch: 1 | 2, from: V3) => {
    const r = dice(hash(salt, seq, who, 31)), self = touch === 1;
    const err = (self ? 0.3 : 0.85) * (1 - q), a = r() * Math.PI * 2, e = err * Math.sqrt(r());
    const to = self ? who : (1 - who) as 0 | 1;
    const tgt = touchAt(to, Math.cos(a) * e, Math.sin(a) * e * 0.6);
    const apex = self ? TOUCH_Y + g0 + 1.05 + 0.4 * r() : g0 + 2.5 + 0.8 * r();
    const f = kick([from[0], Math.max(from[1], g0 + BALL_R), from[2]], tgt, apex);
    launch(f, who, to, self ? 2 : 1);
    if (match.cur && who === me) match.send(OP_KICK, seq, who, touch, ...toInts(f));
    sfx(k, 'catch', { vel: 0.35 + 0.25 * q, pitch: self ? 1 : 0.85, x: from[0], z: from[2] });
  };
  const launch = (f: Flight, by: 0 | 1, to: 0 | 1, touch: 1 | 2) => {
    B.f = f; B.t = 0; B.by = by; B.to = to; B.touch = touch; B.held = false; B.decided = false;
    B.hitT = hitTime(f, touchAt(to)[1]);
    drop = null; rally++; seq++;
    // 对面踢过来了：上一脚自己的那句话收起，提示改说怎么接
    if (by !== me) fb = '';
    // 接的人挪到鞠落的地方
    posAt(f, B.hitT, at);
    const fw = fwd(to), sx = at[0] - fw.x * REACH, sz = at[2] - fw.z * REACH;
    if (to === me) { if (Math.hypot(k.player.pos.x - sx, k.player.pos.z - sz) > 0.12) k.player.goTo(sx, sz, { r: 0.05 }); }
    else if (partner && !match.cur) partner.walkTo(sx, sz, undefined, 1.7);
    view(true);
  };
  /** 自己按了「踢」 */
  const press = () => {
    if (phase !== 'play' || !B.f || B.to !== me || drop || B.decided) return;
    const dt = B.t - B.hitT, q = judge(dt, rally);
    B.decided = true;
    if (q < 0) {
      fb = dt < 0 ? '早了——脚踢了个空' : '晚了——鞠已经落过脚背';
      miss(me);
      return;
    }
    posAt(B.f, B.t, at);
    fb = q > 0.8 ? (B.touch === 1 ? '好！颠起来了' : '好！传过去了') : q > 0.45 ? (B.touch === 1 ? '颠' : '传') : '险——差一点';
    stepKick(me, at);
    kickBy(me, q, B.touch, at);
  };
  /** 踢的那一下：身子往鞠那边一凑，两手往外一展 */
  const kickPose = { t: 9, who: -1 };
  const stepKick = (who: number, _p: V3) => {
    kickPose.t = 0; kickPose.who = who;
    if (who === me) k.player.av.bow = 0.12;
    else if (partner) { const f = fwd(who); partner.step(partner.pos.x + f.x * 0.12, partner.pos.z + f.z * 0.12, 0.22); }
  };
  /** 谁没接住：鞠落地 */
  const miss = (who: 0 | 1) => {
    if (!B.f) return;
    const tt = Math.max(B.t, B.hitT);
    posAt(B.f, tt, at); velAt(B.f, tt, vel);
    drop = { p: [at[0], at[1], at[2]], v: [vel[0], vel[1], vel[2]], t: 0, g: footY(at[0], at[2]) };
    // 鞠此刻往下落到地上（不是一下子停在地上）
    B.f = null;
    if (match.cur && who === me) match.send(OP_DROP, seq);
    server = (1 - who) as 0 | 1;
    endRally(who);
  };
  const endRally = (who: 0 | 1) => {
    phase = 'dropped'; t = 0;
    const n = rally;
    best = Math.max(best, n);
    const rep = n > 0 ? report(k, 'cuju', n) : null;
    k.log({ kind: 'play', text: `蹴鞠，连踢${cn(n)}脚` });
    const whoName = who === me ? '你' : foeName();
    set({
      kind: 'cuju', title: '蹴鞠', count: n, done: n >= 10,
      text: `${whoName}没接住，鞠落了地。这一趟两人连踢${cn(n)}脚${n >= 20 ? '，旁边看的人都叫好' : ''}。${rep ? `\n${rep.best && rep.prev != null ? '比以往都多。' : ''}${rankText(rep.rank)}。` : ''}`,
      hint: fb || undefined,
      choices: [{ id: 'again', label: '再踢一趟', main: true }, ...(match.cur ? [] : inviteChoices(match, '蹴鞠')), { id: 'done', label: '罢' }],
    });
  };
  /** 开一趟：发球的人把鞠从地上挑起来颠一下 */
  const serve = () => {
    phase = 'play'; t = 0; rally = 0; fb = '';
    drop = null; B.f = null;
    set({ kind: 'cuju', title: '蹴鞠', count: 0, hint: server === me ? '你发球' : `${foeName()}发球`, hold: { id: 'kick', label: '踢' }, choices: [{ id: 'done', label: '罢' }] });
    // 同游时由发球的那一边踢出头一脚（对面等他的消息）
    if (match.cur && server !== me) return;
    const s = touchAt(server);
    if (server !== me && partner) partner.walkTo(SPOTS[server].x, SPOTS[server].z);
    window.setTimeout(() => { if (phase === 'play' && !B.f && rally === 0) { stepKick(server, s); kickBy(server, 0.9, 1, [s[0], g0 + 0.35, s[2]]); } }, server === me ? 700 : 1100);
  };

  // —— 同游 ——
  const startMatch = (side: 0 | 1) => {
    dropPartner();
    me = side; server = 0; salt = match.seed;
    const s = SPOTS[me];
    if (k.act === act) { k.player.settleAt(s.x, s.z); k.player.faceTo = s.yaw; camTo(); }
    k.note(`与${match.label(match.peer)}蹴鞠：${me === 0 ? '你发球' : '他发球'}`, 'net');
    serve();
  };
  const onMsg = (op: number, d: number[]) => {
    if (op === OP_KICK) {
      const sq = d[2], who = d[3] as 0 | 1, touch = d[4] as 1 | 2, f = fromInts(d, 5);
      if (who === me) return;
      if (phase !== 'play') { phase = 'play'; rally = 0; set({ kind: 'cuju', title: '蹴鞠', count: 0, hold: { id: 'kick', label: '踢' }, choices: [{ id: 'done', label: '罢' }] }); }
      // 对面发的是踢过以后的序号：这边记到同一处
      seq = sq - 1;
      stepKick(who, f.p);
      launch(f, who, touch === 1 ? who : me, touch === 1 ? 2 : 1);
    } else if (op === OP_DROP) {
      if (B.f && B.to === foe()) { B.held = false; miss(foe()); }
    } else if (op === OP_AGAIN) { salt = match.seed + d[2]; if (phase === 'dropped' || phase === 'intro') serve(); }
  };
  const endMatch = (why: string, label: string) => {
    const words: Record<string, string> = { left: `${label}走了`, quit: `${label}不踢了`, timeout: `${label}久不应`, declined: `${label}谢绝了`, busy: `${label}正忙` };
    k.note(words[why] ?? `${label}走了`, 'net');
    if (k.act !== act) return;
    ensurePartner(true);
    if (phase === 'play') {
      k.note(`${partner?.name}过来接着陪你踢`);
      // 鞠正在他那边（等他踢）：算他没接住
      if (B.f && B.to === foe()) { B.held = false; miss(foe()); }
    } else intro();
  };

  // —— 镜头：北边（南边溪岸上一株垂柳，竖屏退远了会钻进柳条里），看得见两个人与鞠飞的那一道弧；背后是溪与田 ——
  const camTo = () => {
    const tall = k.world.camera.aspect < 1;
    k.nav.setPose({ pos: V(FIELD.x - 0.2, g0 + (tall ? 3.3 : 2.6), FIELD.z - (tall ? 8.8 : 6.6)), look: V(FIELD.x, g0 + (tall ? 1.4 : 1.1), FIELD.z), fov: tall ? 60 : 42, yaw: 10, up: 8, down: 6 }, 1.4);
  };

  const act: Act = {
    id: 'cuju', name: '蹴鞠', anchor: V(restAt.x, g0 + 0.7, restAt.z), radius: 3.2, state, noZoom: true,
    get spot() {
      const tg = (window as unknown as { __net?: { remotes: Map<number, { pos: THREE.Vector3; hidden: boolean }> } }).__net;
      let i = 0;
      if (tg) for (const r of tg.remotes.values()) if (!r.hidden && Math.hypot(r.pos.x - SPOTS[0].x, r.pos.z - SPOTS[0].z) < 0.9) i = 1;
      return { ...SPOTS[i] };
    },
    enter() {
      kb = hasKb();
      const p = k.player;
      me = Math.hypot(p.pos.x - SPOTS[1].x, p.pos.z - SPOTS[1].z) < Math.hypot(p.pos.x - SPOTS[0].x, p.pos.z - SPOTS[0].z) ? 1 : 0;
      p.av.setHands('free');
      camTo();
      if (!match.inbox) ensurePartner(true);
      intro();
    },
    exit() {
      if (match.cur) match.leave(); else match.cancel();
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null); av.bow = 0;
      dropPartner();
      phase = 'off'; B.f = null; drop = null;
      ball.position.copy(restAt); ball.rotation.set(0, 0, 0);
      dots.clear(); dots.commit();
      keep.off();
    },
    update(dt) {
      t += dt; flush();
      const av = k.player.av, s = SPOTS[me];
      keep.set(0, k.player.pos.x, k.player.pos.z, 0.7);
      if (phase === 'play') keep.set(2, FIELD.x, FIELD.z, 1.8);
      // 看着鞠
      av.lookAt(ball.position);
      // 踢的那一下两手往外一展；平时两手垂着
      kickPose.t += dt;
      if (kickPose.who === me && kickPose.t < 0.45) {
        const p = k.player.pos, f = fwd(me), side = V(-f.z, 0, f.x), up = Math.sin(Math.PI * clamp(kickPose.t / 0.45));
        av.reach('L', V(p.x + side.x * 0.45 + f.x * 0.1, p.y + 1.05 + 0.1 * up, p.z + side.z * 0.45 + f.z * 0.1), { rate: 12 });
        av.reach('R', V(p.x - side.x * 0.45 + f.x * 0.1, p.y + 1.05 + 0.1 * up, p.z - side.z * 0.45 + f.z * 0.1), { rate: 12 });
        av.bow = 0.14 * up;
      } else if (kickPose.who === me) { av.reach('L', null); av.reach('R', null); av.bow = 0; kickPose.who = -1; }
      // 不在接鞠：慢慢回到自己的站处
      if (phase === 'play' && (!B.f || B.to !== me) && !k.player.walking && Math.hypot(k.player.pos.x - s.x, k.player.pos.z - s.z) > 0.3) k.player.goTo(s.x, s.z, { r: 0.1 });
      if (phase === 'play' && !k.player.walking && k.player.settled) k.player.faceTo = s.yaw;
      if (phase === 'play') view(B.to === me);
    },
    input: { tap() { if (phase === 'play') press(); return true; } },
    cmd(c, arg) {
      if (c === 'kick') { if (arg === 'down' || arg == null) press(); }
      else if (c === 'go' && phase === 'intro') { match.cancel(); ensurePartner(true); salt = hash(Date.now() & 0xffff, 7); server = me; serve(); }
      else if (c === 'again' && phase === 'dropped') {
        if (match.cur) { const add = 1 + (Date.now() % 997); salt = match.seed + add; match.send(OP_AGAIN, add); serve(); }
        else { ensurePartner(true); salt = hash(Date.now() & 0xffff, 8); serve(); }
      } else if (c === 'accept') match.accept();
      else if (c === 'decline') { match.decline(); intro(); }
      else if (c.startsWith('inv:')) { const id = Number(c.slice(4)); if (match.invite(id)) { k.note(`邀${match.label(id)}蹴鞠，等他应`, 'net'); if (phase === 'intro') intro(); } }
      else if (c === 'done') k.exitAct();
    },
  };

  // —— 每帧：鞠飞、落、颠着等；陪你的人接鞠 ——
  onFrame(k, 'cuju', (dt, time) => {
    if (act !== k.act) { if (dots.mesh.visible) { dots.clear(); dots.commit(); } for (const p of leaving) p.update(dt, time); return; }
    if (B.f) {
      B.t += dt;
      const o = foe();
      // 飞到对面（同游的人）跟前了，他那边还没踢出来：在他脚下颠着等
      if (B.to === o && match.cur && B.t >= B.hitT) {
        if (!B.held) { B.held = true; B.heldT = 0; }
        B.heldT += dt;
        posAt(B.f, B.hitT, at);
        ball.position.set(at[0], at[1] + 0.05 * Math.abs(Math.sin(B.heldT * 6)), at[2]);
        if (B.heldT > 8) { B.held = false; miss(o); }
      } else {
        posAt(B.f, B.t, at);
        ball.position.set(at[0], at[1], at[2]);
        // 陪你的人：到了那一刻踢（踢不踢得着照种子）
        if (B.to === o && !match.cur && partner && !B.decided && B.t >= B.hitT - 0.02) {
          B.decided = true;
          const r = dice(hash(salt, seq, 77))(), ok = r < Math.max(0.86, 0.985 - 0.0035 * rally);
          if (ok) { const q = 0.45 + 0.55 * dice(hash(salt, seq, 78))(); stepKick(o, at); kickBy(o, q, B.touch, [at[0], at[1], at[2]]); }
          else { fb = `${foeName()}没接住`; miss(o); }
        }
        // 自己没按：鞠落过了脚背
        if (B.f && B.to === me && !B.decided && B.t > B.hitT + touchWindow(rally)) { B.decided = true; fb = '没踢——鞠落过了脚背'; miss(me); }
      }
      ball.rotation.x += dt * 9; ball.rotation.z += dt * 4;
    } else if (drop) {
      drop.t += dt;
      // 先落到地上，再弹几下、滚一滚
      const fall = drop.p[1] - (drop.g + BALL_R), vy = drop.v[1];
      const tf = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * 9.8 * Math.max(0, fall)))) / 9.8;
      if (drop.t < tf) { ball.position.set(drop.p[0] + drop.v[0] * drop.t, drop.p[1] + vy * drop.t - 4.9 * drop.t * drop.t, drop.p[2] + drop.v[2] * drop.t); }
      else {
        const p0: V3 = [drop.p[0] + drop.v[0] * tf, drop.g + BALL_R, drop.p[2] + drop.v[2] * tf], v0: V3 = [drop.v[0], vy - 9.8 * tf, drop.v[2]];
        const r = bounce(p0, v0, drop.g, drop.t - tf, at);
        ball.position.set(r.at[0], r.at[1], r.at[2]);
        if (drop.t - tf < 0.02) sfx(k, 'catch', { vel: 0.25, pitch: 0.6, x: p0[0], z: p0[2] });
        if (!r.done) { ball.rotation.x += dt * 5; }
      }
    }
    // 陪你的人：看着鞠，不接鞠时回到站处
    if (partner) {
      const o = foe(), s = SPOTS[o];
      partner.fig.lookAt(ball.position);
      if (kickPose.who === o && kickPose.t < 0.45) {
        const f = fwd(o), side = V(-f.z, 0, f.x), p = partner.pos, up = Math.sin(Math.PI * clamp(kickPose.t / 0.45));
        partner.fig.reach('L', V(p.x + side.x * 0.42, p.y + 1.0 + 0.08 * up, p.z + side.z * 0.42), { rate: 12 });
        partner.fig.reach('R', V(p.x - side.x * 0.42, p.y + 1.0 + 0.08 * up, p.z - side.z * 0.42), { rate: 12 });
        partner.fig.bow = 0.14 * up;
      } else { partner.fig.reach('L', null); partner.fig.reach('R', null); partner.fig.bow = 0; }
      if (!partner.walking && (!B.f || B.to !== o) && Math.hypot(partner.pos.x - s.x, partner.pos.z - s.z) > 0.3) partner.walkTo(s.x, s.z, () => partner?.turnTo(s.yaw), 0.9);
      if (!partner.walking && Math.hypot(partner.pos.x - s.x, partner.pos.z - s.z) < 0.3) partner.turnTo(s.yaw);
      partner.update(dt, time);
      keep.set(1, partner.pos.x, partner.pos.z, 0.7);
    }
    for (const p of leaving) p.update(dt, time);
    // 地上：鞠的影子；飞给自己时脚下那一圈墨晕（越近越小，到了那一段转朱）
    dots.clear();
    const gb = footY(ball.position.x, ball.position.z), hgt = ball.position.y - gb;
    dots.add(ball.position.x, gb + 0.02, ball.position.z, 0.1, DOT_INK, 0.42 * clamp(1 - hgt / 4.5));
    if (B.f && B.to === me && !B.held && !B.decided) {
      posAt(B.f, B.hitT, at);
      const left = B.hitT - B.t, w = touchWindow(rally), r = 0.12 + 0.55 * clamp(left / 1.2), on = Math.abs(left) <= w;
      const gy = footY(at[0], at[2]) + 0.025;
      for (let j = 0; j < 18; j++) { const a = (j / 18) * Math.PI * 2 + time * 0.6; dots.add(at[0] + Math.cos(a) * r, gy, at[2] + Math.sin(a) * r, 0.016, on ? DOT_ZHU : DOT_INK, 0.62 * clamp(1 - left / 1.6)); }
    }
    dots.commit();
    DEBUG.cuju = { phase, me, rally, best, seq, server, to: B.f ? B.to : -1, touch: B.touch, t: B.t, hitT: B.hitT, held: B.held, drop: !!drop, partner: partner?.name ?? null, match: match.cur ? { peer: match.peer, side: match.side } : null };
  });
  afterFrame(k, 'cuju', (dt) => match.tick(dt));
  return act;
}
