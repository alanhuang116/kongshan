/**
 * 投壶（院里，石桌西南的空地上）：十二支矢，左臂拥着，右手一支一支地投进二箭半外的铜壶。
 *   瞄：左右拖动画面（键盘 ← →）；力：按住「投」（空格），力道一起一落，到合适的那一段松手。
 *   计筭照司马光《投壶新格》：有初（头一支中）十筭，连中五筭，散箭（断过以后再中）一筭，贯耳十筭（有初、连中而贯耳二十），
 *   有终（末一支中）十五筭；倚竿（斜倚在壶口）不计筭也不算断；矢碰在壶上反跃回来，眼疾手快接住了再投而中，是骁箭，十筭；
 *   十二支都中是全壶，一支不中是败壶。
 * 壶、矢在 play/pot.ts。平时壶就立在那里，十二支矢插在壶里。
 * 记（mem 'play' 的 pot）：投过几局、最多几筭、全壶几回、贯耳几支。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { YARD_Y } from '../site';
import { addDisc, groundAt } from '../walk';
import type { Act } from './types';
import { ARROW, POT, THROW_DIST, arrowGeo, makePot, potGeo } from '../play/pot';
import { V, clamp, cnNum, onFrame, playGet, playSet, setStatic, sfx, stateOf } from '../play/kit';
import { merge } from '../core/geo';
import { dye } from '../build/kit';

const G = 9.8;
type S = 'pot' | 'bundle' | 'hand' | 'fly' | 'ear' | 'lean' | 'ground' | 'bounce';
interface Arrow { s: S; p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; /** 这一程从哪里、以多快出发，飞了多久（按抛物线算，不一步步积） */ p0: THREE.Vector3; v0: THREE.Vector3; ft: number; /** 这一支的轻重（各支略有不同，合适的那一段力道跟着挪） */ w: number; /** 投出去了还没有个结果 */ open: boolean }
/** 出手的仰角、表上 0…1 对应的出手快慢（米/秒） */
const ALPHA = (54 * Math.PI) / 180, VMIN = 2.85, VMAX = 3.8;

export function create(k: Anlewo): Act | null {
  if (!k.build) return null;
  const { state, set, put, flush } = stateOf(k);
  // 壶立在石桌西南的空地上；投的人站在它东边二箭半处，朝西投
  const gy = groundAt(2.35, 14.0) ?? YARD_Y;
  const P = V(2.35, gy, 14.0), dir = V(-1, 0, 0), right = V(0, 0, -1);
  const stand = { x: P.x - dir.x * (THROW_DIST + 0.18), z: P.z - dir.z * (THROW_DIST + 0.18), yaw: Math.atan2(dir.x, dir.z) };
  // 壶是不动的：并进院里那一块不动的小器物里（两只耳在投的人的左右两侧）；投的时候十二支矢才单独画
  const { arrows } = makePot();
  arrows.visible = false;
  k.world.scene.add(arrows);
  const potW = () => potGeo().rotateY(Math.PI / 2).translate(P.x, P.y, P.z);
  /** 平时：壶连同插在里面的十二支矢 */
  const idleStatic = () => {
    const gs = [potW()];
    for (const a of A) { const g = dye(arrowGeo(), [0.78, 0.7, 0.6], 1.6); g.applyMatrix4(tmpM.compose(a.p, a.q, one)); gs.push(g); }
    setStatic(k, 'yard', 'pot', merge(gs));
  };
  addDisc(P.x, P.z, 0.15);
  const ears = [-1, 1].map((s) => V(P.x + right.x * s * POT.earX, 0, P.z + right.z * s * POT.earX));

  // —— 矢 ——
  const A: Arrow[] = [];
  for (let i = 0; i < ARROW.n; i++) A.push({ s: 'pot', p: V(), v: V(), q: new THREE.Quaternion(), p0: V(), v0: V(), ft: 0, w: 1 + (((i * 7919) % 13) / 13 - 0.5) * 0.05, open: false });
  const UPV = V(0, 1, 0), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), one = V(1, 1, 1), tv = V(), tv2 = V(), tv3 = V();
  /** 一支矢立在壶里：粗头落在豆上，细头斜靠着壶口（各支朝不同的方向斜） */
  const inPot = (a: Arrow, i: number, ang = i * 2.39996 + 0.3, off = 0.012) => {
    // 细头斜靠在口沿上：粗头在豆里往另一边偏，斜多少由口径定（口沿挡着）
    const lean = 0.13 + 0.07 * (0.5 + 0.5 * Math.sin(i * 1.7 + 0.4));
    a.p.set(P.x + Math.cos(ang + Math.PI) * off, P.y + POT.mouthY - POT.depth, P.z + Math.sin(ang + Math.PI) * off);
    a.q.setFromUnitVectors(UPV, tv.set(Math.cos(ang) * Math.sin(lean), Math.cos(lean), Math.sin(ang) * Math.sin(lean)));
    a.v.set(0, 0, 0);
  };
  const resetAll = () => { A.forEach((a, i) => { a.s = 'pot'; a.open = false; inPot(a, i); }); };
  /** 从此刻的位置、速度起一程抛物线 */
  const launch = (a: Arrow) => { a.p0.copy(a.p); a.v0.copy(a.v); a.ft = 0; };
  resetAll();
  idleStatic();
  const draw = () => {
    for (let i = 0; i < A.length; i++) { tmpM.compose(A[i].p, A[i].q, one); arrows.setMatrixAt(i, tmpM); }
    arrows.instanceMatrix.needsUpdate = true;
  };
  draw();

  // —— 一局 ——
  type Phase = 'take' | 'aim' | 'charge' | 'throw' | 'wait' | 'end' | 'off';
  let phase: Phase = 'off', t = 0, cur = -1, forced = -1, thrown = 0, score = 0, hits = 0, leans = 0, chain = true, earN = 0, xiao = false;
  let aim = 0, sway = 0, power = 0, chT = 0, last = '', catchable = -1, catchT = 0, keyAim = 0;
  const results: string[] = [];
  const aimDir = V();
  /** 出手点：右手前面、胸口高 */
  const launchAt = (out: THREE.Vector3) => out.set(stand.x, gy + 1.28, stand.z).addScaledVector(dir, 0.32).addScaledVector(right, 0.16);
  /** 瞄准：0 是从出手点正对着壶心；正的往左 */
  const base = (() => { const L0 = launchAt(V()); return V(P.x - L0.x, 0, P.z - L0.z).normalize(); })();
  const aimVec = (yaw: number, out: THREE.Vector3) => out.copy(base).applyAxisAngle(UPV, yaw);
  /** 力道 p 的这一支，按此刻的瞄准落在壶口那一层高处的哪里；够不着那么高返回 null */
  const land = (p: number, w: number, out: THREE.Vector3) => {
    const L0 = launchAt(tv2), sp = (VMIN + (VMAX - VMIN) * p) / w, d = aimVec(aim + sway, aimDir);
    const vh = sp * Math.cos(ALPHA), vy = sp * Math.sin(ALPHA), dy = P.y + POT.mouthY - L0.y;
    const disc = vy * vy - 2 * G * dy;
    if (disc < 0) return null;
    const tt = (vy + Math.sqrt(disc)) / G;
    return out.copy(L0).addScaledVector(d, vh * tt).setY(P.y + POT.mouthY);
  };
  /** 正好落进壶口的那一段力道（表上的位置） */
  const zone = (w: number): [number, number] | null => {
    let lo = -1, hi = -1;
    for (let i = 0; i <= 160; i++) {
      const p = i / 160, x = land(p, w, tv3);
      if (!x) continue;
      const along = (x.x - P.x) * base.x + (x.z - P.z) * base.z;
      if (Math.abs(along) < POT.r - 0.008) { if (lo < 0) lo = p; hi = p; }
    }
    return lo < 0 ? null : [lo, hi];
  };
  const cn = (n: number) => cnNum(n);
  const keys = [{ key: '左右键', label: '瞄' }, { key: '空格', label: '按住，松手投' }];
  const aimWord = () => { const a = aim + sway; return Math.abs(a) < 0.006 ? '正对着壶口' : Math.abs(a - POT.earX / THROW_DIST) < 0.004 || Math.abs(a + POT.earX / THROW_DIST) < 0.004 ? '对着壶耳' : a > 0 ? '偏左了' : '偏右了'; };
  const view = () => {
    const a = cur >= 0 ? A[cur] : null, z = a ? zone(a.w) : null;
    put({
      title: '投壶', count: thrown, total: ARROW.n, hint: last || aimWord(), aim: Math.round((aim + sway) * 1e4) / 1e4,
      meter: { v: power, lo: z ? z[0] : undefined, hi: z ? z[1] : undefined, label: '力' },
      hold: phase === 'aim' || phase === 'charge' ? { id: 'throw', label: '投', v: power } : undefined,
      keys, choices: [{ id: 'done', label: '罢' }],
    });
  };
  const fresh = (hint: string) => {
    phase = 'take'; t = 0; cur = -1; forced = -1; thrown = 0; score = 0; hits = 0; leans = 0; chain = true; earN = 0; xiao = false; last = ''; results.length = 0; catchable = -1;
    set({ title: '投壶', hint, count: 0, total: ARROW.n, choices: [{ id: 'done', label: '罢' }] });
  };

  const act: Act = {
    id: 'pitchpot', name: '投壶', anchor: P.clone().add(V(0, 0.8, 0)), spot: stand, radius: 2.6, state, noZoom: true,
    enter() {
      const av = k.player.av;
      resetAll(); draw();
      // 矢从那一块不动的里头拿出来，单独画（壶留在里头）
      setStatic(k, 'yard', 'pot', potW()); arrows.visible = true;
      av.setHands('free'); av.lookAt(P.clone().add(V(0, 0.3, 0)));
      // 镜头：投的人右肩后头，低低地看着壶
      const c = V(stand.x, gy, stand.z);
      k.nav.setPose({ pos: c.clone().addScaledVector(dir, -2.5).addScaledVector(right, 1.65).add(V(0, 2.15, 0)), look: P.clone().add(V(0, 0.28, 0)).addScaledVector(dir, -0.55), fov: 34, yaw: 10, up: 6, down: 6 }, 1.6);
      fresh('先把十二支矢从壶里抽出来');
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    },
    exit() {
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null); av.bow = 0;
      if (thrown > 0 && phase !== 'end') record(false);
      phase = 'off'; keyAim = 0; resetAll(); draw();
      arrows.visible = false; idleStatic();
    },
    update(dt) {
      t += dt; flush();
      const av = k.player.av;
      if (phase === 'take') {
        // 弯腰把矢从壶里抽出来，拥在左臂里
        av.bow = 0.3 * Math.sin(Math.PI * Math.min(1, t / 1.5));
        if (t > 0.75) for (const a of A) if (a.s === 'pot') a.s = 'bundle';
        if (t > 1.6) { av.bow = 0; nextArrow(); }
      }
      if (phase === 'aim' || phase === 'charge') {
        // 手不会一点不晃：瞄准带着一点轻轻的摆
        sway = 0.0035 * Math.sin(t * 1.9) + 0.002 * Math.sin(t * 3.7 + 1);
        aim = clamp(aim + keyAim * dt * 0.05, -0.12, 0.12);
        if (phase === 'charge') {
          chT += dt;
          // 力道一起一落：按住越久越大，到顶又慢慢落回来
          const T = 0.95, u = (chT % (2 * T)) / T;
          power = u < 1 ? 0.5 - 0.5 * Math.cos(Math.PI * u) : 0.5 + 0.5 * Math.cos(Math.PI * (u - 1));
        }
        view();
      }
      // 手：左臂拥着矢；右手捏着这一支，指着壶（蓄力时往后收一点）；投出去时往前一递
      const lpos = tv.set(stand.x, gy + 1.0, stand.z).addScaledVector(dir, 0.2).addScaledVector(right, -0.16);
      av.reach('L', lpos, { dir: tv2.set(0, 1, 0).addScaledVector(dir, 0.25).normalize(), palm: right, rate: 8 });
      if (phase === 'aim' || phase === 'charge') {
        const back = phase === 'charge' ? power : 0;
        launchAt(tv2).addScaledVector(dir, -0.2 - 0.12 * back).add(V(0, -0.06 + 0.05 * back, 0));
        av.reach('R', tv2, { dir: aimVec(aim + sway, aimDir).add(V(0, 0.3, 0)).normalize(), rate: 12 });
      } else if (phase === 'throw') {
        launchAt(tv2).addScaledVector(dir, 0.14 * Math.min(1, t / 0.15)).add(V(0, 0.06, 0));
        av.reach('R', tv2, { dir: aimVec(aim, aimDir).add(V(0, 0.55, 0)).normalize(), rate: 20 });
        if (t > 0.45) { phase = 'wait'; t = 0; }
      } else if (phase !== 'take') av.reach('R', null);
      if (phase === 'wait') {
        // 等矢落定（或接那支反跃回来的）
        if (catchable >= 0) { catchT -= dt; if (catchT <= 0) catchable = -1; }
        const busy = A.some((a) => a.open);
        if (!busy && catchable < 0 && t > 0.5) nextArrow();
      }
      av.lookAt(tv.copy(P).add(V(0, 0.3, 0)));
    },
    input: {
      move(p) {
        if (phase !== 'aim' && phase !== 'charge') return false;
        aim = clamp(aim - p.dx * 0.00045, -0.12, 0.12);
        return true;
      },
      tap() { if (catchable >= 0) grab(); return true; },
    },
    cmd(c, arg) {
      if (c === 'throw') {
        if (arg === 'down' && catchable >= 0) { grab(); return; }
        if (arg === 'down' && phase === 'aim') { phase = 'charge'; chT = 0; power = 0; }
        else if (arg === 'up' && phase === 'charge') release();
      } else if (c === 'aim' && typeof arg === 'number') aim = clamp(aim + arg, -0.12, 0.12);
      else if (c === 'again') { resetAll(); fresh('再来一局'); }
      else if (c === 'done') k.exitAct();
    },
  };
  function onKey(e: KeyboardEvent) {
    const d = e.type === 'keydown';
    if (e.key === 'ArrowLeft') { keyAim = d ? 1 : keyAim === 1 ? 0 : keyAim; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { keyAim = d ? -1 : keyAim === -1 ? 0 : keyAim; e.preventDefault(); }
  }
  function nextArrow() {
    const i = forced >= 0 && A[forced].s === 'bundle' ? forced : A.findIndex((a) => a.s === 'bundle');
    forced = -1;
    if (i < 0 || thrown >= ARROW.n) { end(); return; }
    cur = i; A[i].s = 'hand'; phase = 'aim'; power = 0;
    // 刚换上一支：手里的准头有点偏，要自己扶正（接住的那一支照原来的瞄）
    if (!xiao) aim = (Math.random() - 0.5) * 0.05;
    if (!xiao) last = '';
    view();
  }
  function release() {
    if (cur < 0) return;
    const a = A[cur], L0 = launchAt(V()), sp = (VMIN + (VMAX - VMIN) * power) / a.w, d = aimVec(aim + sway, aimDir);
    a.s = 'fly'; a.open = true; a.p.copy(L0); a.v.copy(d).multiplyScalar(sp * Math.cos(ALPHA)).setY(sp * Math.sin(ALPHA)); launch(a);
    phase = 'throw'; t = 0; thrown++; last = '';
    sfx(k, 'toss', { vel: 0.3 + 0.2 * power });
    cur = -1;
    put({ hold: undefined, count: thrown, meter: { v: power, label: '力' } }, true);
  }
  /** 接住反跃回来的那一支：再投而中是骁箭 */
  function grab() {
    const i = catchable, a = A[i];
    catchable = -1;
    if (!a || a.s !== 'bounce') return;
    a.s = 'bundle'; a.open = false; thrown--; xiao = true; forced = i;
    sfx(k, 'catch', { vel: 0.5 });
    last = '接住了！再投，中了是骁箭';
    k.buzz(12);
    put({ hint: last, count: thrown }, true);
  }
  /** 一支落定：计筭 */
  function settle(a: Arrow, how: 'in' | 'ear' | 'lean' | 'miss') {
    a.open = false;
    const first = results.length === 0, lastOne = thrown === ARROW.n, ear = how === 'ear';
    let got = 0, word = '';
    if (how === 'in' || ear) {
      hits++; if (ear) earN++;
      if (xiao) { got = ear ? 20 : 10; word = ear ? '骁箭，贯耳' : '骁箭'; }
      else if (first) { got = ear ? 20 : 10; word = ear ? '有初，贯耳' : '有初'; }
      else if (lastOne) { got = ear ? 20 : 15; word = ear ? '有终，贯耳' : '有终'; }
      else if (chain) { got = ear ? 20 : 5; word = ear ? '连中，贯耳' : '连中'; }
      else { got = ear ? 10 : 1; word = ear ? '贯耳' : '散箭'; }
    } else if (how === 'lean') { word = '倚竿'; leans++; }
    else { word = '不中'; chain = false; }
    xiao = false;
    score += got;
    results.push(word);
    last = got ? `${word}　${cn(got)}筭（共${cn(score)}筭）` : how === 'lean' ? '倚竿：斜倚在壶口，不计筭' : `不中（共${cn(score)}筭）`;
    put({ hint: last, count: thrown }, true);
  }
  function end() {
    phase = 'end'; cur = -1;
    // 倚竿不计筭，但也不算失：「于连中、全壶，皆为通数」
    const full = hits > 0 && hits + leans === ARROW.n, lose = hits === 0 && leans === 0;
    record(full);
    const verdict = full ? '十二支都中：全壶。' : lose ? '十二支一支未中：败壶。' : `中了${cn(hits)}支，共${cn(score)}筭。`;
    set({
      title: '投壶', count: thrown, total: ARROW.n, done: true,
      text: `${verdict}${earN ? `其中贯耳${cn(earN)}支。` : ''}\n「是故投壶可以治心，可以修身，可以为国，可以观人。」`,
      source: '司马光《投壶新格》序',
      choices: [{ id: 'again', label: '再来一局' }, { id: 'done', label: '罢' }],
    });
  }
  function record(full: boolean) {
    const r = playGet<{ n?: number; best?: number; full?: number; ears?: number }>(k, 'pot', {});
    const better = r.best == null || score > r.best;
    playSet(k, 'pot', { ...r, n: (r.n ?? 0) + 1, best: better ? score : r.best, full: (r.full ?? 0) + (full ? 1 : 0), ears: (r.ears ?? 0) + earN });
    k.log({ kind: 'play', text: full ? '投壶，全壶' : `投壶，得${cn(score)}筭` });
    if (better && (r.best ?? 0) > 0) k.note(`投壶得${cn(score)}筭，比以往都多`);
  }

  // —— 每帧：矢怎么飞、怎么落 ——
  const prev = V();
  onFrame(k, 'pitchpot', (dt) => {
    const on = act === k.act;
    if (!on) return;
    const av = k.player.av;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.s === 'bundle') {
        // 拥在左臂里：一小捆，竖着，粗头朝下
        av.joints.handL.getWorldPosition(tv);
        const j = i % 6, r = 0.012 * (1 + (i % 3));
        a.p.set(tv.x + Math.cos(j * 1.1) * r, tv.y - 0.36, tv.z + Math.sin(j * 1.1) * r);
        a.q.setFromUnitVectors(UPV, tv2.set(0, 1, 0).addScaledVector(dir, 0.16).addScaledVector(right, -0.08).normalize());
      } else if (a.s === 'hand') {
        // 捏在右手里，捏在离细头不到一半处，粗头指着壶
        av.joints.handR.getWorldPosition(tv);
        const d = aimVec(aim + sway, aimDir).add(V(0, 0.3, 0)).normalize();
        a.p.copy(tv).addScaledVector(d, ARROW.len * 0.42);
        a.q.setFromUnitVectors(UPV, d.multiplyScalar(-1));
      } else if (a.s === 'fly' || a.s === 'bounce') {
        prev.copy(a.p);
        a.ft += dt;
        a.p.copy(a.p0).addScaledVector(a.v0, a.ft); a.p.y -= 0.5 * G * a.ft * a.ft;
        a.v.copy(a.v0); a.v.y -= G * a.ft;
        if (a.s === 'fly') a.q.setFromUnitVectors(UPV, tv.copy(a.v).normalize().multiplyScalar(-1));
        else { tmpQ.setFromAxisAngle(right, dt * 9); a.q.premultiply(tmpQ); }
        if (a.s === 'fly') hitPot(a, i);
        // 落地
        if ((a.s === 'fly' || a.s === 'bounce') && a.p.y < P.y + 0.01) {
          const h = tv.copy(a.v).setY(0);
          if (h.lengthSq() < 1e-6) h.copy(dir);
          h.normalize();
          a.s = 'ground'; a.p.y = P.y + 0.007;
          a.q.setFromUnitVectors(UPV, h.multiplyScalar(-1));
          tmpQ.setFromAxisAngle(tv2.set(-h.z, 0, h.x).normalize(), 0.05); a.q.premultiply(tmpQ);
          sfx(k, 'arrowLand', { vel: 0.4, x: a.p.x, z: a.p.z });
          if (catchable === i) catchable = -1;
          if (a.open) settle(a, 'miss');
        }
      }
    }
    draw();
  });
  /** 一支正飞着的矢碰没碰着壶：入壶、贯耳、倚竿、碰口沿弹开、碰壶腹弹开 */
  function hitPot(a: Arrow, i: number) {
    const mouthY = P.y + POT.mouthY, earY = P.y + POT.earY;
    if (prev.y >= mouthY && a.p.y < mouthY) {
      const f = (prev.y - mouthY) / (prev.y - a.p.y), x = prev.x + (a.p.x - prev.x) * f, z = prev.z + (a.p.z - prev.z) * f;
      const dc = Math.hypot(x - P.x, z - P.z);
      // 入壶：粗头落进豆里，细头朝着来的方向斜靠在口沿上
      if (dc < POT.r - 0.006) { a.s = 'pot'; inPot(a, i, Math.atan2(-a.v.z, -a.v.x) + Math.sin(i * 2.4 + thrown) * 1.1, 0.012 + dc * 0.25); sfx(k, 'potIn', { vel: 0.6, x: P.x, z: P.z }); settle(a, 'in'); return; }
      if (dc < POT.r + 0.012) {
        // 碰在壶口上：斜倚在口里，或者弹开
        if (dc < POT.r + 0.003 && Math.random() < 0.32) { a.s = 'lean'; leanAt(a, x, z); sfx(k, 'potRim', { vel: 0.35, x: P.x, z: P.z }); settle(a, 'lean'); }
        else bounce(a, i, x, z);
        return;
      }
    }
    if (prev.y >= earY && a.p.y < earY) {
      const f = (prev.y - earY) / (prev.y - a.p.y), x = prev.x + (a.p.x - prev.x) * f, z = prev.z + (a.p.z - prev.z) * f;
      for (const e of ears) {
        const de = Math.hypot(x - e.x, z - e.z);
        if (de < POT.ear - 0.003) { a.s = 'ear'; earAt(a, e.x, e.z); sfx(k, 'potEar', { vel: 0.6, x: P.x, z: P.z }); settle(a, 'ear'); return; }
        if (de < POT.ear + 0.016) { bounce(a, i, x, z); return; }
      }
    }
    // 碰在壶腹、壶颈上
    const r = Math.hypot(a.p.x - P.x, a.p.z - P.z), yy = a.p.y - P.y;
    if (yy < POT.h && yy > 0 && r < (yy < 0.17 ? POT.belly + 0.006 : 0.04)) bounce(a, i, a.p.x, a.p.z);
  }
  function earAt(a: Arrow, ex: number, ez: number) {
    // 从耳里穿下去，粗头着地；细头朝外斜一点
    const ox = ex - P.x, oz = ez - P.z, l = Math.hypot(ox, oz) || 1;
    a.p.set(ex + (ox / l) * 0.035, P.y, ez + (oz / l) * 0.035);
    a.q.setFromUnitVectors(UPV, tv.set((-ox / l) * 0.06, 1, (-oz / l) * 0.06).normalize());
    a.v.set(0, 0, 0);
  }
  function leanAt(a: Arrow, x: number, z: number) {
    // 粗头卡在壶口里，身子斜斜地倚在口沿上
    const dx = x - P.x, dz = z - P.z, l = Math.hypot(dx, dz) || 1;
    a.p.set(P.x + (dx / l) * 0.02, P.y + POT.mouthY - 0.05, P.z + (dz / l) * 0.02);
    a.q.setFromUnitVectors(UPV, tv.set(-(dx / l) * 0.85, 0.55, -(dz / l) * 0.85).normalize());
    a.v.set(0, 0, 0);
  }
  function bounce(a: Arrow, i: number, x: number, z: number) {
    // 撞在壶上弹开：多半往外跌；也有往回跃的——那一支接得住
    const dx = x - P.x, dz = z - P.z, l = Math.hypot(dx, dz) || 1;
    const back = Math.random() < 0.32;
    a.s = 'bounce';
    if (back) a.v.copy(dir).multiplyScalar(-1.5 - Math.random() * 0.5).setY(2.6 + Math.random() * 0.5);
    else a.v.set((dx / l) * 1.1 + dir.x * 0.6, 1.0 + Math.random() * 0.8, (dz / l) * 1.1 + dir.z * 0.6);
    a.p.set(x, Math.max(a.p.y, P.y + POT.h * 0.85), z);
    launch(a);
    sfx(k, 'potRim', { vel: 0.55, x: P.x, z: P.z });
    if (back) { catchable = i; catchT = 0.85; put({ hint: '反跃回来了——接！' }, true); }
  }
  return act;
}
