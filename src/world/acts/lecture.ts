/**
 * 听讲：村塾里邵先生讲卦的时候（play/lecture.ts 定什么时候、讲什么），走到前檐下就能听。
 *
 *   聚 —— 屋里六领席上钉着小签：三领是孩子们的（淡），空着的那几领点一下就去坐（同游时谁先要谁得，两边算的一样）；
 *          不坐，就在檐下站着听。坐下以后，镜头在你身后，越过一排矮桌看东头的先生。
 *   讲 —— 面板收成贴底一条：谁在说、说的什么、原文的出处（本应用的话不带出处）。独游时点画面听下一句。
 *   问 —— 三题四选一，答得快多得几分；答完先生说一声对不对。
 *   散 —— 这一回谁答得好。先生起身走了，面板留着，点「起身」走开。
 * 坐着时起身，先沿着矮桌之间的空当走回檐下，再站定（不从桌子、孩子身上穿过去）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from './types';
import { SITE, houseY } from '../site';
import { HINTS, QUIZ_IN, REPLY } from '../../data/lecture';
import { MASTER_SEAT, SEATS, STAND, seatPos, seatVia, startLecture, type LectureState } from '../play/lecture';
import { T } from '../play/study/schedule';
import { SCHOOL_Y, atHouse } from '../life/spots';
import { cn } from '../../util/cn';

const SC = SITE.houses.find((h) => h.id === 'school')!;
const W = (lx: number, lz: number, y: number) => { const s = atHouse('school', lx, lz); return new THREE.Vector3(s.x, y, s.z); };
const FACE_EAST = SC.yaw + Math.PI / 2;
const GY = houseY('school');

export function create(k: Anlewo): Act | null {
  const L = startLecture(k);
  const state: Record<string, unknown> = {};
  const set = (p: Record<string, unknown>) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); };
  /** 正沿着几点走（进席、出席） */
  let walk: { pts: Array<{ x: number; z: number }>; i: number; then: () => void } | null = null;
  /** 身子此刻坐在哪一席（−1 站着）；正往哪一席去 */
  let sat = -1, going = -1;
  let sig = '', emitT = 0, doneT = 0, stoodT = 0;
  const seatObj = new THREE.Object3D();
  const p = () => k.player;

  // —— 镜头：站在檐下时从屋前西南看进屋里；坐下了在自己身后，越过矮桌看东头的先生 ——
  const standCam = () => ({ pos: W(-1.4, 7.6, GY + 2.5), look: W(2.4, 0.3, SCHOOL_Y + 0.85), fov: 46, yaw: 22, up: 10, down: 8 });
  const seatCam = (i: number) => {
    const s = SEATS[i], cx = Math.max(-4.35, s.lx - 1.55);
    return { pos: W(cx, s.lz + 0.85, SCHOOL_Y + 1.28), look: W(3.9, 0, SCHOOL_Y + 0.82), fov: 50, yaw: 18, up: 8, down: 8 };
  };

  // —— 走：一点一点挪过去（不问挡不挡：屋里的地面行走图里是走不到的），身子朝着去的方向 ——
  function stepWalk(dt: number) {
    // 刚起身：等身子站直了再迈步
    if (!walk || stoodT > 0) return;
    const pl = p(), w = walk.pts[walk.i], dx = w.x - pl.pos.x, dz = w.z - pl.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) {
      walk.i++;
      if (walk.i >= walk.pts.length) { const f = walk.then; walk = null; f(); }
      return;
    }
    pl.settleAt(w.x, w.z);
    if (d > 0.12) { const want = Math.atan2(dx, dz), off = Math.atan2(Math.sin(want - pl.yaw), Math.cos(want - pl.yaw)); pl.yaw += off * Math.min(1, dt * 8); }
  }
  /** 坐到第 i 席上（人已经站在席边） */
  function sitOn(i: number) {
    const sp = seatPos(i), pl = p(), av = pl.av;
    seatObj.position.set(sp.x, sp.y, sp.z); seatObj.rotation.y = FACE_EAST;
    pl.yaw = FACE_EAST; pl.faceTo = FACE_EAST;
    // 席长的那一边横在身前（村塾的南北），坐下后左右宽、前后窄
    av.setSeat?.({ h: Math.max(0.01, sp.y - pl.pos.y), hx: 0.38, hz: 0.3 });
    av.setPose('sit', 1.2); av.setHands('lap', 0.6);
    pl.slideTo(sp.x, sp.z, 1.0); pl.lift = sp.y - pl.pos.y;
    av.lookAt(new THREE.Vector3(MASTER_SEAT.x, SCHOOL_Y + 1.15, MASTER_SEAT.z));
    sat = i; going = -1;
    k.nav.setPose(seatCam(i), 1.6);
  }
  /** 去第 i 席：沿着空当走到席边，再坐下 */
  function goSit(i: number) {
    going = i;
    const via = seatVia(i);
    // 席边：席南（前檐那一侧）一步
    const s = SEATS[i], edge = atHouse('school', s.lx, s.lz + 0.62);
    walk = { pts: [...via, { x: edge.x, z: edge.z }], i: 0, then: () => sitOn(i) };
  }
  /** 起身，沿原路走回檐下；then：走到了做什么 */
  function standUp(then: () => void) {
    const i = sat, pl = p(), av = pl.av;
    if (i < 0) { then(); return; }
    sat = -1;
    av.setPose('stand', 0.9); av.setSeat?.(null); pl.lift = 0; av.lookAt(null); av.setHands('sleeve', 0.4);
    stoodT = 0.95;
    const s = SEATS[i], edge = atHouse('school', s.lx, s.lz + 0.62);
    const back = [{ x: edge.x, z: edge.z }, ...seatVia(i).reverse(), { x: STAND.x, z: STAND.z }];
    walk = { pts: back, i: 0, then: () => { pl.faceTo = STAND.yaw; k.nav.setPose(standCam(), 1.4); then(); } };
  }

  // —— 面板 ——
  const tags = (v: LectureState) => v.seats.map((s) => ({
    id: `seat${s.i}`, text: s.kind === 'free' ? '空席' : s.who, x: s.x, y: s.y + 0.78, z: s.z,
    kind: s.kind === 'free' ? 'hot' : s.kind === 'me' ? null : 'dim', on: s.kind === 'me' || v.pending === s.i,
    sub: s.kind === 'kid' ? '天天坐这里' : s.kind === 'peer' ? '同游' : null,
  }));
  function compose(force = false) {
    const v = L.view(), pl = v.plan, ph = v.phase;
    if (!pl) return;
    const n = pl.lesson.lines.length, g = pl.lesson.gua;
    const answered = ph.kind === 'ask' ? v.answers.find((a) => a.q === ph.i) : undefined;
    const s = `${pl.id}|${ph.kind}|${'i' in ph ? ph.i : ''}|${v.seats.map((x) => x.kind + x.who).join(',')}|${v.mySeat}|${v.pending}|${sat}|${going}|${walk ? 1 : 0}|${answered ? answered.pick : ''}|${v.board.map((b) => b.score).join(',')}`;
    const now = performance.now();
    const moving = ph.kind === 'gather' || ph.kind === 'line' || (ph.kind === 'ask' && !answered) || (ph.kind === 'ask' && pl.group);
    if (!force && s === sig && !(moving && now - emitT > 240)) return;
    const fresh = s !== sig;
    sig = s; emitT = now;
    const choosing = sat < 0 && going < 0 && !walk;
    const exitC = { id: 'done', label: sat >= 0 ? '起身走开' : '走开' };
    const standC = sat >= 0 ? [{ id: 'stand', label: '起身让座' }] : [];
    if (ph.kind === 'gather') {
      // 坐下了等先生：贴底一条（提示一行、让座与走开一行），不另出一块空板
      if (sat >= 0) set({ kind: 'lecture', compact: true, title: '听讲', hint: HINTS.seated, choices: [...standC, exitC] });
      else set({ kind: 'lecture', title: '听讲', hint: walk ? '' : HINTS.gather, progress: ph.t / ph.t1, tags: choosing ? tags(v) : [], choices: [exitC] });
    } else if (ph.kind === 'line') {
      const ln = pl.lesson.lines[ph.i], u = (ph.t - (ph.t1 - T.line)) / T.line, last = ph.i === n - 1;
      // 末一句收尾时先生说要问三句、提示一行说答得快多得分——问的时候面板里就只有题、四个答案、时辰条（手机上矮，放得下四个）
      set({ kind: 'lecture', compact: true, title: '听讲', count: g.name, who: '邵先生', hint: ln.lead || (last ? HINTS.quiz : pl.group ? '' : ph.i === 0 ? '点画面，听下一句' : ''), text: last ? `${ln.text}${QUIZ_IN}` : ln.text, source: ln.source, progress: Math.min(1, (ph.i + Math.max(0, Math.min(1, u))) / n), tags: choosing ? tags(v).filter((t) => t.kind === 'hot') : [], choices: [...standC, exitC] });
    } else if (ph.kind === 'ask') {
      const Q = pl.lesson.quiz[ph.i], left = Math.max(0, (ph.t1 - ph.t) / T.ask);
      if (answered) {
        const reply = answered.right ? REPLY.right : REPLY.wrong.replace('{answer}', Q.options[Q.answer]);
        set({ kind: 'lecture', title: '听讲', count: `${cn(ph.i + 1)}问`, who: '邵先生', said: Q.ask, text: `${reply}${answered.right ? `　得${cn(answered.score)}分` : ''}`, hint: pl.group ? HINTS.wait : '', progress: pl.group ? left : undefined, choices: [exitC] });
      } else {
        // 只有题、四个答案、时辰条：谁问的、答得快多得分，末一句里已经说过（375×548 上四个答案一屏放得下）
        set({ kind: 'lecture', title: '听讲', count: `${cn(ph.i + 1)}问`, text: Q.ask, progress: left, choices: [...Q.options.map((o, j) => ({ id: `a${j}`, label: o })), exitC] });
      }
    } else if (ph.kind === 'show') {
      const rows = v.board.map((b, i) => `${cn(i + 1)}　${b.name}${b.kid ? '（村塾）' : b.peer ? '（同游）' : ''}　答对${cn(b.right)}题　${cn(b.score)}分`);
      const mine = v.board.find((b) => b.me);
      set({ kind: 'lecture', title: '听讲', count: g.name, who: '邵先生', said: '今日就到这里。', text: rows.join('\n') || '这一回没有人作答。', hint: mine ? '' : '这一回你没有作答', choices: [{ id: 'done', label: '起身' }], done: !!mine });
    }
    if (fresh && ph.kind === 'ask' && !answered) k.sfx('page', { vel: 0.25 });
  }

  const act: Act & { on(): boolean } = {
    id: 'lecture', name: '听讲',
    anchor: W(1.6, 3.2, GY + 2.3),
    spot: { x: STAND.x, z: STAND.z, yaw: STAND.yaw },
    radius: 2.8, state, noZoom: true,
    on: () => L.on,
    enter() {
      sat = -1; going = -1; walk = null; sig = ''; doneT = 0; stoodT = 0;
      L.attending = true;
      const av = p().av;
      av.setHands('sleeve', 0.4);
      av.lookAt(new THREE.Vector3(MASTER_SEAT.x, SCHOOL_Y + 1.15, MASTER_SEAT.z));
      k.nav.setPose(standCam(), 1.6);
      compose(true);
    },
    exit() {
      L.attending = false;
      if (L.mySeatNow() != null || L.pendSeat != null || sat >= 0) L.release();
      walk = null; sat = -1; going = -1;
      const av = p().av;
      av.setSeat?.(null); av.lookAt(null);
    },
    update(dt) {
      stepWalk(dt);
      if (stoodT > 0) stoodT -= dt;
      const v = L.view(), ph = v.phase;
      // 讲散了：面板再留一会儿，自己起身
      if (!v.plan || ph.kind === 'done') { doneT += dt; if (doneT > 1.2 && !walk) { if (sat >= 0) standUp(() => k.exitAct()); else k.exitAct(); } return; }
      // 要的那一席坐定了：走过去坐下；让人先坐了：说一声
      if (going < 0 && sat < 0 && !walk && v.mySeat != null) goSit(v.mySeat);
      if (L.lostSeat) { L.lostSeat = false; k.note(HINTS.lost, 'study'); }
      // 坐着的那一席被更早要的人占了（同游时消息晚到）：起身，回檐下
      if (sat >= 0 && v.mySeat !== sat && v.pending == null && !walk) standUp(() => compose(true));
      compose();
    },
    input: {
      tap: () => {
        // 独游：点画面听下一句
        const v = L.view();
        if (v.plan && !v.plan.group && v.phase.kind === 'line' && v.phase.t - (v.phase.t1 - T.line) > 1.2) L.skipLine();
        return true;
      },
    },
    cmd(c, arg) {
      if (c === 'tag' && typeof arg === 'string' && arg.startsWith('seat')) {
        const i = Number(arg.slice(4));
        if (sat >= 0 || walk || going >= 0) return;
        if (!L.claim(i)) k.note(HINTS.lost, 'study');
        compose(true);
      } else if (c === 'stand') { L.release(); standUp(() => compose(true)); }
      else if (/^a\d$/.test(c)) { L.answer((L.phase() as { i: number }).i, Number(c.slice(1))); compose(true); }
      else if (c === 'done') { L.release(); if (sat >= 0) standUp(() => k.exitAct()); else k.exitAct(); }
    },
  };
  return act;
}
