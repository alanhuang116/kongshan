/**
 * 秋千（村塾前，SITE.more.swing）：坐上去，两手攥住绳，按节奏一下一下地蹬——荡到头、刚往回走的那一刻蹬，越荡越高；
 * 蹬早了蹬晚了只是白费一点劲。袖子跟着风兜起来。荡够了「下来」，脚尖在地上拖一拖，停稳了再站起来。
 *
 * 秋千板是屋舍那边做的（k.build.parts.swingSeat：原点在梁上的悬点，绕自己的 x 轴荡，userData.len 是绳长）。
 * 人坐上去以后把他的身子挂在一层架子上（play/carry.ts），架子跟着板一起转。
 * 放学后、午后，村塾的小女孩常来荡（life 里的 npcs.swinger）：她在、或正往这边来，就让给她。
 * 记：荡过几回、荡得最高的一回（度）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from './types';
import { Carrier } from '../play/carry';
import { V, clamp, cnNum, onFrame, playGet, playScore, sfx, stateOf, wrap } from '../play/kit';

const G = 9.8;
/** 振幅的上限（弧度）：再高绳就要软了 */
const TOP = 1.25;

export function create(k: Anlewo): Act | null {
  const seat = k.build?.parts.swingSeat, anc = k.build?.anchors.swing;
  if (!seat || !anc) return null;
  const { state, set, put, flush } = stateOf(k);
  const ry = seat.rotation.y, L = Number(seat.userData.len ?? 2.2), piv = seat.position.clone();
  const fwd = V(Math.sin(ry), 0, Math.cos(ry)), side = V(Math.cos(ry), 0, -Math.sin(ry));
  /** 板面（静止时）的高与板心 */
  const boardY = piv.y - L + 0.0075, board = V(anc.position.x, boardY, anc.position.z);
  /** 人坐上去时脚（root）在板心前多远、凳面（板面）比脚高多少 */
  const FOOT = 0.3, SEAT_H = 0.44;
  const rootRest = board.clone().addScaledVector(fwd, FOOT);
  /** 摆长：悬点到人身重心（比绳略长一点） */
  const Leff = L + 0.25;
  const carry = new Carrier(k, 'swing');

  // —— 秋千此刻的样子（不论有没有人在上面）：振幅 A（追着 aim 走）、相位 ph（0 荡到最前，±π 荡到最后）——
  let A = 0, aim = 0, ph = 0, braking = false, backPrev = 0;
  const omega = () => Math.sqrt(G / Leff) / (1 + (A * A) / 16);
  /** 此刻荡出去的角度（往前为正） */
  const angle = () => A * Math.cos(ph);
  const m4 = new THREE.Matrix4(), rq = new THREE.Matrix4(), tr = new THREE.Matrix4();
  /** 只有转动的那一份：沿梁的那根轴转 a（往前为正） */
  const rot = (a: number, out: THREE.Matrix4) => out.makeRotationY(ry).multiply(tr.makeRotationX(-a)).multiply(m4.makeRotationY(-ry));
  /** 静止 → 此刻：绕悬点转 */
  const swingM = new THREE.Matrix4();
  const pose = (a: number) => { rot(a, rq); swingM.makeTranslation(piv.x, piv.y, piv.z).multiply(rq).multiply(m4.makeTranslation(-piv.x, -piv.y, -piv.z)); };

  // —— 小女孩：她在秋千上、或正往这边来，就让给她 ——
  const girlNear = (r: number) => { const g = k.life?.npcs.swinger; return !!g && g.present && Math.hypot(g.pos.x - board.x, g.pos.z - board.z) < r; };

  // —— 做的时候 ——
  type Phase = 'sit' | 'swing' | 'brake' | 'off';
  let phase: Phase = 'off', t = 0, kicks = 0, good = 0, best = 0, back = 0, backV = 0, said = '', lastHalf = 0;
  const ropeL = V(), ropeR = V(), up = V(), tmp = V(), look = V();
  /** 荡到头以后走了半程的几成（0 刚到头，1 到另一头） */
  const half = () => { const x = ph / Math.PI; return x - Math.floor(x); };
  const deg = (a: number) => Math.round((a * 180) / Math.PI);
  const hintFor = () => {
    if (aim < 0.06) return '点一下，两脚一蹬';
    if (aim < 0.3) return '荡到头、刚往回走的时候再蹬';
    if (aim < 0.75) return '越荡越高';
    return deg(aim) > 62 ? '再高就要荡过梁去了' : '风从袖子里灌进来';
  };
  const meter = () => ({ v: half(), lo: 0, hi: 0.2, label: '蹬' });
  const show = () => set({ title: '秋千', hint: hintFor(), meter: meter(), hold: { id: 'kick', label: '蹬' }, keys: [{ key: '空格', label: '蹬' }], choices: [{ id: 'done', label: '下来' }] });

  const act: Act & { on(): boolean } = {
    id: 'swing', name: '秋千', anchor: board.clone().add(V(0, 1.25, 0)), spot: { x: board.x + fwd.x * 0.62, z: board.z + fwd.z * 0.62, yaw: ry }, radius: 2.4, state, noZoom: true,
    on: () => !girlNear(6) && k.atmos.w.rain < 0.6,
    enter() {
      const p = k.player, av = p.av;
      phase = 'sit'; t = 0; kicks = 0; good = 0; best = 0; back = 0; backV = 0; braking = false; said = ''; aim = A;
      // 背对秋千站在板前，往后一坐：凳面就是秋千板（比脚下高 0.44），脚悬着
      av.setSeat?.({ h: SEAT_H, cz: -FOOT });
      av.setPose('bench', 1.0); av.setHands('free');
      p.slideTo(rootRest.x, rootRest.z, 0.9);
      p.lift = boardY - SEAT_H - p.pos.y;
      // 镜头：在秋千的侧前方，看得见整道弧
      const c = V(board.x, boardY + 0.55, board.z);
      k.nav.setPose({ pos: c.clone().addScaledVector(side, 4.4).addScaledVector(fwd, 4.6).add(V(0, 0.75, 0)), look: c.clone().add(V(0, 0.45, 0)).addScaledVector(fwd, 0.3), fov: 50, yaw: 16, up: 10, down: 8 }, 1.6);
      set({ title: '秋千', hint: '坐稳了，两手攥住绳', choices: [{ id: 'done', label: '下来' }] });
    },
    exit() {
      const av = k.player.av;
      carry.detach();
      av.root.rotation.x = 0; av.root.rotation.order = 'XYZ';
      av.reach('L', null); av.reach('R', null); av.lookAt(null); av.setSeat?.(null);
      phase = 'off'; braking = false;
      if (best > 0.05) record();
    },
    update(dt) {
      t += dt; flush();
      if (phase === 'sit' && t > 1.15) {
        // 坐稳了：身子挂到架子上（此刻架子与板都在原位，看不出变化），手去攥绳
        carry.attach();
        k.player.av.root.rotation.order = 'YXZ';
        phase = 'swing'; t = 0; show();
      }
      if (phase !== 'swing' && phase !== 'brake') return;
      best = Math.max(best, A);
      const h = half();
      if (phase === 'swing') {
        // 到了另一头换一句提示；表一直跟着走
        if (h < lastHalf - 0.5) { const s = hintFor(); if (s !== said) { said = s; put({ hint: s }); } }
        put({ meter: meter() });
        // 小女孩来了：让给她
        if (girlNear(4.5)) { braking = true; phase = 'brake'; set({ title: '秋千', hint: '小女孩来了，让给她荡', progress: 0 }); }
      } else {
        put({ progress: clamp(1 - A / Math.max(0.05, best)) });
        if (A < 0.035 && aim < 0.035) finish();
      }
      lastHalf = h;
    },
    input: { tap: () => { kick(); return true; } },
    cmd(c, arg) {
      if (c === 'kick') { if (arg !== 'up') kick(); }
      else if (c === 'done') {
        if (phase === 'swing' && A > 0.05) { braking = true; phase = 'brake'; set({ title: '秋千', hint: '脚尖在地上拖一拖，慢慢停下', progress: 0 }); }
        else if (phase !== 'brake') k.exitAct();
      }
    },
  };

  /** 蹬一下：荡到头、刚往回走时蹬最得劲；从静止起是两脚一蹬地 */
  function kick() {
    if (phase !== 'swing') return;
    const h = half(), first = aim < 0.06;
    // 时机：刚过头（0…0.2）最好；快到头（0.92 以上）也还行；半中间蹬是白费，甚至把自己蹬乱了
    const q = first ? 1 : h < 0.2 ? 1 - Math.max(0, h - 0.06) / 0.2 : h > 0.9 ? 0.5 : Math.max(-0.4, 0.15 - Math.abs(h - 0.5));
    if (first && A < 0.02) ph = -Math.PI / 2;                  // 从静止起：正从最低处往前走
    kicks++; if (q > 0.6) good++;
    aim = clamp(aim + (q > 0 ? 0.09 * q * (1 - (aim / TOP) ** 2) : 0.05 * q), 0, TOP);
    // 往前荡时身子后仰、往后荡时前倾：蹬的那一下仰（俯）得最多
    backV += (Math.sin(ph) < 0 ? 1 : -1) * 2.6 * Math.max(0.3, q);
    if (q > 0.6 && aim > 0.3) sfx(k, 'swish', { vel: 0.2 + 0.45 * (aim / TOP) });
    k.buzz(q > 0.6 ? 10 : 4);
  }
  function record() {
    const d = deg(best);
    const prev = playGet<{ best?: number }>(k, 'swing', {}).best ?? 0;
    const better = playScore(k, 'swing', d, true, { h: Math.round(Math.max(0, Leff * (1 - Math.cos(best))) * 100) / 100 });
    k.log({ kind: 'play', text: `荡秋千，最高荡到${cnNum(d)}度` });
    if (better && prev > 0) k.note(`比上回荡得高（${cnNum(d)}度）`);
    best = 0;
  }
  function finish() {
    const b = best, d = deg(b), hgt = Math.max(0, Leff * (1 - Math.cos(b)));
    k.player.av.reach('L', null); k.player.av.reach('R', null);
    record();
    const text = d < 8 ? '坐着晃了晃，脚尖点着地。' : `最高的那一下，荡出去${cnNum(d)}度，板离地${hgt >= 1.3 ? '一人多高' : hgt >= 0.6 ? '半人来高' : '一尺来高'}。`;
    set({ title: '秋千', text, choices: [{ id: 'done', label: '起身' }], done: true });
    phase = 'off';
  }

  // —— 每帧：秋千怎么荡（有人没人都算），人怎么跟着 ——
  onFrame(k, 'swing', (dt) => {
    const onIt = act === k.act && (phase === 'swing' || phase === 'brake');
    // 空着的秋千慢慢停下；有人刹着时停得快；小女孩要坐上来时很快就停稳
    const damp = onIt ? (braking ? 0.75 : 0.025) : girlNear(3) ? 1.8 : 0.09;
    aim = Math.max(0, aim - aim * damp * dt);
    if (!onIt) aim = Math.min(aim, A);
    A += (aim - A) * Math.min(1, dt * 2.6);
    if (A < 0.004 && aim < 0.004) { A = aim = 0; }
    ph = wrap(ph + omega() * dt);
    pose(angle());
    seat.rotation.x = -angle();
    if (carry.on) carry.set(swingM);
    // 绳吃劲时「吱——」：每荡一个来回一声（荡到最后头的那一刻起）
    const bk = Math.cos(ph) < -0.95 ? 1 : 0;
    if (bk && !backPrev && A > 0.12) sfx(k, 'swing', { vel: 0.15 + 0.5 * Math.min(1, A / 1.1), dur: (2 * Math.PI) / omega(), x: board.x, z: board.z });
    backPrev = bk;
    if (!onIt) return;
    const av = k.player.av, a = angle();
    // 身子：随着荡的方向微微前俯后仰（往前荡时后仰），蹬的那一下更多；弹簧带着走，不是一下一下地跳
    const base = 0.08 * Math.tanh(-3 * Math.sin(ph)) * Math.min(1, A / 0.3);
    backV += (-(back - base) * 24 - backV * 7) * dt;
    back = clamp(back + backV * dt, -0.24, 0.24);
    av.root.rotation.x = -back;
    av.bow = braking ? 0.18 : Math.max(0, -back) * 0.7;
    // 手攥着两根绳（离板 0.47 米处），跟着架子走；手指顺着绳朝上
    for (const [s, out] of [[1, ropeL], [-1, ropeR]] as Array<[number, THREE.Vector3]>) {
      tmp.copy(board).addScaledVector(side, s * 0.27); tmp.y += 0.47;
      out.copy(tmp).applyMatrix4(swingM);
    }
    up.set(0, 1, 0).applyMatrix4(rq).normalize();
    av.reach('L', ropeL, { dir: up, palm: tmp.copy(side).multiplyScalar(-1), rate: 40 });
    av.reach('R', ropeR, { dir: up, palm: side, rate: 40 });
    // 看着前面；荡到前头时抬眼看远处
    look.copy(board).addScaledVector(fwd, 8); look.y += 1.1 + 2.2 * Math.max(0, a / TOP);
    av.lookAt(look);
  });
  return act;
}
