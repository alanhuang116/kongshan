/**
 * 投壶（院里，石桌西南的空地上）：十二支矢，左臂拥着，右手一支一支地投进二箭半外的铜壶。
 *   瞄：左右拖动画面（键盘 ← →）。地上一溜淡墨点是矢要走的方向——对准了壶口，那一溜点转朱；壶上的小签写着「对准了」「偏左」「偏右」。
 *   力：按住「投」（空格）蓄力，表上的指针从左走到右、到头再走回来；走进「正好」那一段（表上标出的、底下写着「正好」）时松手。按着的时候空中一道淡淡的弧是这一下的去处。
 *   投出去以后说落在哪：中了、远了（力大了）、近了（力小了）、偏左、偏右、碰着壶口沿——矢落下的地方一圈淡墨、一枚小签；下一支的提示照着说怎么改。
 *   计筭照司马光《投壶新格》：有初（头一支中）十筭，连中五筭，散箭（断过以后再中）一筭，贯耳十筭（有初、连中而贯耳二十），
 *   有终（末一支中）十五筭；倚竿（斜倚在壶口）不计筭也不算断；矢碰在壶上反跃回来，眼疾手快接住了再投而中，是骁箭，十筭；
 *   十二支都中是全壶，一支不中是败壶。
 * 壶、矢、淡墨点在 play/pot.ts。平时壶就立在那里，十二支矢插在壶里。
 * 记（mem 'play' 的 pot）：投过几局、最多几筭、全壶几回、贯耳几支。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { YARD_Y } from '../site';
import { addDisc, groundAt } from '../walk';
import type { Act } from './types';
import { ARROW, DOT_INK, DOT_ZHU, Dots, POT, THROW_DIST, arrowGeo, makePot, potGeo } from '../play/pot';
import { V, clamp, cnNum, onFrame, playGet, playSet, setStatic, sfx, stateOf } from '../play/kit';
import { report } from '../play/board';
import { merge } from '../core/geo';
import { dye } from '../build/kit';

const G = 9.8;
type S = 'pot' | 'bundle' | 'hand' | 'fly' | 'ear' | 'lean' | 'ground' | 'bounce';
/** 矢过壶口那一层时离壶心多远：along 顺着投的方向（正是过了壶），across 横着（正是偏左） */
interface Rel { along: number; across: number }
interface Arrow {
  s: S; p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion;
  /** 这一程从哪里、以多快出发，飞了多久（按抛物线算，不一步步积） */ p0: THREE.Vector3; v0: THREE.Vector3; ft: number;
  /** 这一支的轻重（各支略有不同，合适的那一段力道跟着挪） */ w: number;
  /** 投出去了还没有个结果 */ open: boolean;
  /** 过壶口那一层、壶耳那一层时在哪；碰着了壶的哪里（口沿、壶腹、耳） */ cross: Rel | null; earRel: Rel | null; why: '' | 'rim' | 'body' | 'ear';
  /** 松手时指针比合适的那一段大（+1）、小（−1）、正在段里（0） */ pow: number;
}
/** 一支投出去的结果：哪一类、怎么说、下一支怎么改、签上的两个字 */
interface Verdict { code: 'in' | 'ear' | 'lean' | 'far' | 'near' | 'left' | 'right' | 'rim'; word: string; advice: string; tag: string; sub: string }
/** 出手的仰角、表上 0…1 对应的出手快慢（米/秒） */
const ALPHA = (54 * Math.PI) / 180, VMIN = 2.85, VMAX = 3.8;
/** 按住以后指针从 0 走到 1 要几秒（再同样慢地走回来） */
const SWEEP = 1.35;

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
  const dots = new Dots(120);
  k.world.scene.add(dots.mesh);
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
  for (let i = 0; i < ARROW.n; i++) A.push({ s: 'pot', p: V(), v: V(), q: new THREE.Quaternion(), p0: V(), v0: V(), ft: 0, w: 1 + (((i * 7919) % 13) / 13 - 0.5) * 0.05, open: false, cross: null, earRel: null, why: '', pow: 0 });
  const UPV = V(0, 1, 0), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), one = V(1, 1, 1), tv = V(), tv2 = V(), tv3 = V(), tv4 = V();
  /** 一支矢立在壶里：粗头落在豆上，细头斜靠着壶口（各支朝不同的方向斜） */
  const inPot = (a: Arrow, i: number, ang = i * 2.39996 + 0.3, off = 0.012) => {
    // 细头斜靠在口沿上：粗头在豆里往另一边偏，斜多少由口径定（口沿挡着）
    const lean = 0.13 + 0.07 * (0.5 + 0.5 * Math.sin(i * 1.7 + 0.4));
    a.p.set(P.x + Math.cos(ang + Math.PI) * off, P.y + POT.mouthY - POT.depth, P.z + Math.sin(ang + Math.PI) * off);
    a.q.setFromUnitVectors(UPV, tv.set(Math.cos(ang) * Math.sin(lean), Math.cos(lean), Math.sin(ang) * Math.sin(lean)));
    a.v.set(0, 0, 0);
  };
  const resetAll = () => { A.forEach((a, i) => { a.s = 'pot'; a.open = false; a.cross = null; a.earRel = null; a.why = ''; inPot(a, i); }); };
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
  let aim = 0, aimSet = 0, sway = 0, power = 0, chT = 0, last = '', catchable = -1, catchT = 0, keyAim = 0, kb = false;
  /** 上一支的结果（下一支的提示照着它说怎么改）；落地的那一点（地上一圈淡墨、一枚签） */
  let fb: Verdict | null = null, fall: { x: number; z: number; t: number; tag: string; sub: string } | null = null, potSay: { tag: string; sub: string } | null = null;
  const results: string[] = [];
  const aimDir = V();
  /** 出手点：右手前面、胸口高 */
  const launchAt = (out: THREE.Vector3) => out.set(stand.x, gy + 1.28, stand.z).addScaledVector(dir, 0.32).addScaledVector(right, 0.16);
  /** 瞄准：0 是从出手点正对着壶心；正的往左 */
  const base = (() => { const L0 = launchAt(V()); return V(P.x - L0.x, 0, P.z - L0.z).normalize(); })();
  /** 投的方向的左手边 */
  const leftOf = V(base.z, 0, -base.x);
  const aimVec = (yaw: number, out: THREE.Vector3) => out.copy(base).applyAxisAngle(UPV, yaw);
  /** 一点离壶心多远（顺着投的方向、横着） */
  const rel = (x: number, z: number): Rel => ({ along: (x - P.x) * base.x + (z - P.z) * base.z, across: (x - P.x) * leftOf.x + (z - P.z) * leftOf.z });
  /** 出手的快慢 */
  const speedOf = (p: number, w: number) => (VMIN + (VMAX - VMIN) * p) / w;
  /** 力道 p 的这一支，按此刻的瞄准落在壶口那一层高处的哪里；够不着那么高返回 null */
  const land = (p: number, w: number, out: THREE.Vector3) => {
    const L0 = launchAt(tv2), sp = speedOf(p, w), d = aimVec(aim + sway, aimDir);
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
  let zoneNow: [number, number] | null = null;
  const cn = (n: number) => cnNum(n);
  /** 此刻的瞄准线在壶那里横着偏了多少（正是偏左）：力道合适时矢就从那里过 */
  const aimAcross = () => {
    const L0 = launchAt(tv2), d = aimVec(aim + sway, aimDir), s = ((P.x - L0.x) * base.x + (P.z - L0.z) * base.z) / Math.max(0.2, d.x * base.x + d.z * base.z);
    return rel(L0.x + d.x * s, L0.z + d.z * s).across;
  };
  /** 瞄得怎样：对准壶口、对着壶耳、偏左、偏右 */
  const aimState = () => {
    const c = aimAcross();
    if (Math.abs(c) < POT.r - 0.012) return { ok: true, tag: '对准了', sub: '' };
    // 耳比口低：力道要比「正好」那段的当中略小一点，矢才落进耳里
    if (Math.abs(Math.abs(c) - POT.earX) < POT.ear - 0.002) return { ok: true, tag: '对着壶耳', sub: '力道略小些' };
    return c > 0 ? { ok: false, tag: '偏左', sub: kb ? '按 →' : '往右拖' } : { ok: false, tag: '偏右', sub: kb ? '按 ←' : '往左拖' };
  };
  const method = () => (kb ? '← → 瞄准壶口，按住空格蓄力，指针走进「正好」那段就松手' : '左右拖画面瞄准，按住「投」蓄力，指针走进「正好」那段就松手');
  const keys = [{ key: '← →', label: '瞄准' }, { key: '空格', label: '按住蓄力，松手投' }];
  /** 签：瞄着时在壶上说瞄得怎样；投出去落定了，在落下的地方（中了在壶上）说结果 */
  const tagNow = () => {
    if (phase === 'aim' || phase === 'charge') { const s = aimState(); return [{ id: 'pot', text: s.tag, sub: s.sub || undefined, x: P.x, y: P.y + POT.h + 0.06, z: P.z, kind: s.ok ? 'hot' : undefined }]; }
    if (phase === 'throw' || phase === 'wait' || phase === 'end') {
      // 签挂在落点上头、比壶口略高（落在壶前壶后时不压着壶）；落点本身地上有一圈淡墨
      if (fall) return [{ id: 'fall', text: fall.tag, sub: fall.sub || undefined, x: fall.x, y: gy + POT.h + 0.14, z: fall.z }];
      if (potSay) return [{ id: 'pot', text: potSay.tag, sub: potSay.sub || undefined, x: P.x, y: P.y + POT.h + 0.06, z: P.z, kind: 'hot' }];
    }
    return [];
  };
  const view = (now = false) => {
    const a = cur >= 0 ? A[cur] : null;
    if ((phase === 'aim' || phase === 'charge') && a) zoneNow = zone(a.w);
    const hint = phase === 'charge' ? '指针走进「正好」那段就松手' : last || (fb ? `上一支${fb.word}：${fb.advice}` : method());
    put({
      kind: 'pitchpot', title: '投壶', count: thrown, total: ARROW.n, hint, aim: Math.round((aim + sway) * 1e4) / 1e4,
      meter: { v: power, lo: zoneNow ? zoneNow[0] : undefined, hi: zoneNow ? zoneNow[1] : undefined, label: '力道' },
      hold: phase === 'aim' || phase === 'charge' ? { id: 'throw', label: '投', v: power } : undefined,
      keys, tags: tagNow(), result: fb?.code, choices: [{ id: 'done', label: '罢' }],
    }, now);
  };
  const fresh = (hint: string) => {
    phase = 'take'; t = 0; cur = -1; forced = -1; thrown = 0; score = 0; hits = 0; leans = 0; chain = true; earN = 0; xiao = false; last = ''; results.length = 0; catchable = -1;
    fb = null; fall = null; potSay = null; zoneNow = null; aim = aimSet = 0;
    set({ kind: 'pitchpot', title: '投壶', hint, count: 0, total: ARROW.n, choices: [{ id: 'done', label: '罢' }] });
  };

  const act: Act = {
    id: 'pitchpot', name: '投壶', anchor: P.clone().add(V(0, 0.8, 0)), spot: stand, radius: 2.6, state, noZoom: true,
    enter() {
      const av = k.player.av;
      kb = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
      resetAll(); draw();
      // 矢从那一块不动的里头拿出来，单独画（壶留在里头）
      setStatic(k, 'yard', 'pot', potW()); arrows.visible = true;
      av.setHands('free'); av.lookAt(P.clone().add(V(0, 0.3, 0)));
      // 镜头：投的人右肩后头，低低地看着壶
      const c = V(stand.x, gy, stand.z);
      k.nav.setPose({ pos: c.clone().addScaledVector(dir, -2.5).addScaledVector(right, 1.65).add(V(0, 2.15, 0)), look: P.clone().add(V(0, 0.28, 0)).addScaledVector(dir, -0.55), fov: 34, yaw: 10, up: 6, down: 6 }, 1.6);
      fresh('先把十二支矢从壶里抽出来');
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); window.addEventListener('blur', onBlur);
    },
    exit() {
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('blur', onBlur);
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null); av.bow = 0;
      if (thrown > 0 && phase !== 'end') record(false);
      phase = 'off'; keyAim = 0; resetAll(); draw();
      arrows.visible = false; idleStatic();
      dots.clear(); dots.commit();
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
          // 力道：按住了从小到大匀匀地走，到头再匀匀地走回来（指针一来一回）
          const u = (chT % (2 * SWEEP)) / SWEEP;
          power = u < 1 ? u : 2 - u;
        }
        // 蓄力时表一帧一报（指针不落后于真的力道）；瞄着时一秒十几次就够
        view(phase === 'charge');
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
        // 等矢落定（或接那支反跃回来的）；落定了再停一会儿，让人看清落在哪
        if (catchable >= 0) { catchT -= dt; if (catchT <= 0) { catchable = -1; put({ hold: undefined }, true); } }
        const busy = A.some((a) => a.open);
        if (busy) t = 0;
        if (!busy && catchable < 0 && t > 0.9) nextArrow();
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
      if (c === 'catch') { if (arg === 'down' && catchable >= 0) grab(); }
      else if (c === 'throw') {
        if (arg === 'down' && catchable >= 0) { grab(); return; }
        if (arg === 'down' && phase === 'aim') { phase = 'charge'; chT = 0; power = 0; view(true); }
        else if (arg === 'up' && phase === 'charge') release();
      } else if (c === 'aim' && typeof arg === 'number') aim = clamp(aim + arg, -0.12, 0.12);
      else if (c === 'again') { resetAll(); fresh('再来一局'); }
      else if (c === 'done') k.exitAct();
    },
  };
  function onKey(e: KeyboardEvent) {
    const d = e.type === 'keydown', key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'a') { keyAim = d ? 1 : keyAim === 1 ? 0 : keyAim; e.preventDefault(); }
    else if (key === 'arrowright' || key === 'd') { keyAim = d ? -1 : keyAim === -1 ? 0 : keyAim; e.preventDefault(); }
  }
  function onBlur() { keyAim = 0; }
  function nextArrow() {
    const i = forced >= 0 && A[forced].s === 'bundle' ? forced : A.findIndex((a) => a.s === 'bundle');
    forced = -1;
    if (i < 0 || thrown >= ARROW.n) { end(); return; }
    cur = i; A[i].s = 'hand'; phase = 'aim'; power = 0; t = 0;
    fall = null; potSay = null;
    // 刚换上一支：手里的准头照上一支瞄的，只是略有一点偏（接住的那一支照原来的瞄）
    if (!xiao) aim = clamp(aimSet + (Math.random() - 0.5) * 0.024, -0.12, 0.12);
    if (!xiao) last = '';
    view(true);
  }
  function release() {
    if (cur < 0) return;
    const a = A[cur], L0 = launchAt(V()), sp = speedOf(power, a.w), d = aimVec(aim + sway, aimDir);
    a.s = 'fly'; a.open = true; a.cross = null; a.earRel = null; a.why = ''; a.p.copy(L0); a.v.copy(d).multiplyScalar(sp * Math.cos(ALPHA)).setY(sp * Math.sin(ALPHA)); launch(a);
    a.pow = zoneNow ? (power > zoneNow[1] ? 1 : power < zoneNow[0] ? -1 : 0) : 0;
    aimSet = aim;
    phase = 'throw'; t = 0; thrown++; last = '';
    sfx(k, 'toss', { vel: 0.3 + 0.2 * power });
    cur = -1;
    // 表停在松手的那一刻（「正好」那一段还标着）：看得出这一下是早了还是晚了
    put({ hold: undefined, count: thrown, tags: [], meter: { v: power, lo: zoneNow ? zoneNow[0] : undefined, hi: zoneNow ? zoneNow[1] : undefined, label: '力道' } }, true);
  }
  /** 接住反跃回来的那一支：再投而中是骁箭 */
  function grab() {
    const i = catchable, a = A[i];
    catchable = -1;
    if (!a || a.s !== 'bounce') return;
    a.s = 'bundle'; a.open = false; thrown--; xiao = true; forced = i; fall = null;
    sfx(k, 'catch', { vel: 0.5 });
    last = '接住了！再投，中了是骁箭';
    k.buzz(12);
    put({ hint: last, count: thrown, tags: [], hold: undefined }, true);
  }
  /** 没中的那一支：落在哪、为什么、下一支怎么改 */
  function judge(a: Arrow): Verdict {
    const c = a.cross ?? rel(a.p.x, a.p.z), side = Math.abs(c.across) > Math.abs(c.along) * 0.9;
    const left = { code: 'left' as const, word: '偏左了', advice: kb ? '按 → 往右瞄一点' : '往右拖一点再投', tag: '偏左', sub: '往右瞄' };
    const rightV = { code: 'right' as const, word: '偏右了', advice: kb ? '按 ← 往左瞄一点' : '往左拖一点再投', tag: '偏右', sub: '往左瞄' };
    const far = { code: 'far' as const, word: '力大了', advice: '指针过了「正好」那段才松手', tag: '远了', sub: '力大了' };
    const near = { code: 'near' as const, word: '力小了', advice: '指针还没走到「正好」那段就松了手', tag: '近了', sub: '力小了' };
    if (a.why === 'rim' || a.why === 'ear') {
      const how = side ? (c.across > 0 ? '稍偏左' : '稍偏右') : c.along > 0 ? '力稍大' : '力稍小';
      return { code: 'rim', word: a.why === 'ear' ? '碰着壶耳弹开了' : '碰着壶口沿弹开了', advice: `差一点点，${how}`, tag: '差一点', sub: how };
    }
    if (a.why === 'body') return { ...near, word: '力小了，碰在壶腹上' };
    // 瞄的是壶耳、从耳边擦过去的
    const e = a.earRel;
    if (e && Math.abs(Math.abs(e.across) - POT.earX) < POT.ear + 0.02 && Math.abs(e.along) < 0.1) {
      const dl = e.across - Math.sign(e.across) * POT.earX;
      const how = Math.abs(dl) > Math.abs(e.along) ? (dl > 0 ? '稍偏左' : '稍偏右') : e.along > 0 ? '力稍大' : '力稍小';
      return { code: 'rim', word: '擦着壶耳过去了', advice: `差一点点，${how}`, tag: '擦耳', sub: how };
    }
    if (side && Math.abs(c.across) > POT.r * 0.8) return c.across > 0 ? left : rightV;
    // 顺着投的方向：远了还是近了（松手时指针在段外，就照指针说）
    if (a.pow > 0 || (a.pow === 0 && c.along > 0)) return far;
    return near;
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
    fall = null; potSay = null;
    if (got) {
      fb = { code: ear ? 'ear' : 'in', word: '中了', advice: '照这样再投一支', tag: ear ? '贯耳' : '中', sub: `${cn(got)}筭` };
      potSay = { tag: fb.tag, sub: fb.sub };
      last = `中！${word}，${cn(got)}筭（共${cn(score)}筭）`;
    } else if (how === 'lean') {
      fb = { code: 'lean', word: '倚竿', advice: '斜倚在壶口，差一点点', tag: '倚竿', sub: '不计筭' };
      potSay = { tag: fb.tag, sub: fb.sub };
      last = '倚竿：斜倚在壶口，不计筭';
    } else {
      fb = judge(a);
      fall = { x: a.p.x, z: a.p.z, t: 0, tag: fb.tag, sub: fb.sub };
      last = `不中：${fb.code === 'far' ? '力大了，越过了壶' : fb.code === 'near' && a.why !== 'body' ? '力小了，没到壶' : fb.word}`;
    }
    put({ hint: last, count: thrown, tags: tagNow(), result: fb.code }, true);
  }
  function end() {
    phase = 'end'; cur = -1;
    // 倚竿不计筭，但也不算失：「于连中、全壶，皆为通数」
    const full = hits > 0 && hits + leans === ARROW.n, lose = hits === 0 && leans === 0;
    record(full);
    // 投满十二支的一局上榜（几筭）
    report(k, 'pitchpot', score);
    const verdict = full ? '十二支都中：全壶。' : lose ? '十二支一支未中：败壶。' : `中了${cn(hits)}支，共${cn(score)}筭。`;
    set({
      kind: 'pitchpot', title: '投壶', count: thrown, total: ARROW.n, done: true,
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

  // —— 淡墨点：瞄着时地上一溜（矢要走的方向），蓄力时空中一道弧（这一下的去处），落下的地方一圈 ——
  /** 力道 p 的这一下，从出手到落定（进壶口、碰着壶、落地）一路上的点 */
  function arcDots(p: number, w: number) {
    const L0 = launchAt(tv4.set(0, 0, 0)), sp = speedOf(p, w), d = aimVec(aim + sway, aimDir);
    const vh = sp * Math.cos(ALPHA), vy = sp * Math.sin(ALPHA);
    const tg = (vy + Math.sqrt(vy * vy + 2 * G * (L0.y - P.y))) / G;
    const N = 30, mouthY = P.y + POT.mouthY;
    let into = false, py = L0.y;
    const pts: Array<[number, number, number]> = [];
    for (let i = 0; i <= N; i++) {
      const tt = (tg * i) / N, x = L0.x + d.x * vh * tt, z = L0.z + d.z * vh * tt, y = L0.y + vy * tt - 0.5 * G * tt * tt;
      const rr = Math.hypot(x - P.x, z - P.z);
      // 进了壶口：停在口上；碰着壶腹、壶颈：停在那里
      if (py >= mouthY && y < mouthY && rr < POT.r + 0.004) { into = rr < POT.r - 0.006; pts.push([x, mouthY, z]); break; }
      if (y - P.y < POT.h && rr < (y - P.y < 0.17 ? POT.belly : 0.045)) { pts.push([x, y, z]); break; }
      pts.push([x, y, z]); py = y;
    }
    return { pts, into };
  }
  function drawDots(dt: number) {
    dots.clear();
    if (phase === 'aim' || phase === 'charge') {
      // 地上：从脚前到壶后，矢在地上的投影走的那一条（对准了壶口转朱）
      const s = aimState(), L0 = launchAt(tv4.set(0, 0, 0)), d = aimVec(aim + sway, aimDir);
      const reach = ((P.x - L0.x) * base.x + (P.z - L0.z) * base.z) / Math.max(0.2, d.x * base.x + d.z * base.z);
      for (let m = 0.45; m < reach + 0.55; m += 0.085) {
        const x = L0.x + d.x * m, z = L0.z + d.z * m, fade = m > reach ? 1 - (m - reach) / 0.6 : Math.min(1, (m - 0.4) / 0.35);
        dots.add(x, gy + 0.025, z, 0.011, s.ok ? DOT_ZHU : DOT_INK, (s.ok ? 0.62 : 0.4) * fade);
      }
      // 空中：按着的时候，这一下会怎么飞（进了壶口转朱）
      if (phase === 'charge' && cur >= 0) {
        const { pts, into } = arcDots(power, A[cur].w);
        pts.forEach(([x, y, z], i) => { if (i >= 2) dots.add(x, y, z, 0.0095, into ? DOT_ZHU : DOT_INK, (into ? 0.66 : 0.46) * Math.min(1, (i - 1) / 4)); });
      }
    }
    // 没中的那一支落下的地方：一圈淡墨，慢慢淡去
    if (fall) {
      fall.t += dt;
      const a = 0.62 * clamp(1 - (fall.t - 2.5) / 2.5);
      if (a > 0.02) for (let i = 0; i < 16; i++) { const g = (i / 16) * Math.PI * 2; dots.add(fall.x + Math.cos(g) * 0.1, gy + 0.025, fall.z + Math.sin(g) * 0.1, 0.009, DOT_INK, a); }
    }
    dots.commit();
  }

  // —— 每帧：矢怎么飞、怎么落 ——
  const prev = V();
  onFrame(k, 'pitchpot', (dt) => {
    const on = act === k.act;
    if (!on) { if (dots.mesh.visible) { dots.clear(); dots.commit(); } return; }
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
          if (catchable === i) { catchable = -1; put({ hold: undefined }, true); }
          if (a.open) settle(a, 'miss');
        }
      }
    }
    draw();
    drawDots(dt);
  });
  /** 一支正飞着的矢碰没碰着壶：入壶、贯耳、倚竿、碰口沿弹开、碰壶腹弹开 */
  function hitPot(a: Arrow, i: number) {
    const mouthY = P.y + POT.mouthY, earY = P.y + POT.earY;
    if (prev.y >= mouthY && a.p.y < mouthY) {
      const f = (prev.y - mouthY) / (prev.y - a.p.y), x = prev.x + (a.p.x - prev.x) * f, z = prev.z + (a.p.z - prev.z) * f;
      const dc = Math.hypot(x - P.x, z - P.z);
      a.cross = rel(x, z);
      // 入壶：粗头落进豆里，细头朝着来的方向斜靠在口沿上
      if (dc < POT.r - 0.006) { a.s = 'pot'; inPot(a, i, Math.atan2(-a.v.z, -a.v.x) + Math.sin(i * 2.4 + thrown) * 1.1, 0.012 + dc * 0.25); sfx(k, 'potIn', { vel: 0.6, x: P.x, z: P.z }); settle(a, 'in'); return; }
      if (dc < POT.r + 0.012) {
        // 碰在壶口上：斜倚在口里，或者弹开
        if (dc < POT.r + 0.003 && Math.random() < 0.32) { a.s = 'lean'; leanAt(a, x, z); sfx(k, 'potRim', { vel: 0.35, x: P.x, z: P.z }); settle(a, 'lean'); }
        else { a.why = 'rim'; bounce(a, i, x, z); }
        return;
      }
    }
    if (prev.y >= earY && a.p.y < earY) {
      const f = (prev.y - earY) / (prev.y - a.p.y), x = prev.x + (a.p.x - prev.x) * f, z = prev.z + (a.p.z - prev.z) * f;
      a.earRel = rel(x, z);
      for (const e of ears) {
        const de = Math.hypot(x - e.x, z - e.z);
        if (de < POT.ear - 0.003) { a.s = 'ear'; earAt(a, e.x, e.z); sfx(k, 'potEar', { vel: 0.6, x: P.x, z: P.z }); settle(a, 'ear'); return; }
        if (de < POT.ear + 0.016) { a.why = 'ear'; bounce(a, i, x, z); return; }
      }
    }
    // 碰在壶腹、壶颈上
    const r = Math.hypot(a.p.x - P.x, a.p.z - P.z), yy = a.p.y - P.y;
    if (yy < POT.h && yy > 0 && r < (yy < 0.17 ? POT.belly + 0.006 : 0.04)) { a.why = 'body'; if (!a.cross) a.cross = rel(a.p.x, a.p.z); bounce(a, i, a.p.x, a.p.z); }
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
    if (back) { catchable = i; catchT = 0.95; put({ hint: '反跃回来了——快接！', hold: { id: 'catch', label: '接' }, tags: [] }, true); }
  }
  return act;
}
