/**
 * 放纸鸢（春天，河滩上那一大片开阔的草地）：一只纸糊的鹞。
 *   起：先看风从哪边来，迎着风跑起来（按住 Shift 快跑），跑出劲来按住「放」，纸鸢就借着风起去了。
 *   放：纸鸢拽得紧（表往右走）就按住「放」放线——线放出去，它退一退、高一高；拽得松了就别放，迎着风走几步把它带起来。
 *       太紧了线会断，纸鸢顺风飘远；太松了它会栽下来。线放得越长、立得越陡，飞得越高，高到后来只是天上一点。
 *   放够了点「收线」，一把一把收回来。人一直可以走动（这件事做着也能走）。
 * 器物在 play/kite.ts。记（mem 'play' 的 kite）：放过几回、最高几丈（米）、断过几回线。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { U } from '../ink/ink';
import { groundAt } from '../walk';
import type { Act } from './types';
import type { Pose } from '../nav';
import { kiteInTree, makeKite } from '../play/kite';
import { V, clamp, cnNum, onFrame, playGet, playSet, sfx, smooth, stateOf } from '../play/kit';

/** 风从哪个方向来（给提示用；dir 是风吹去的方向） */
const FROM = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const fromWord = (dx: number, dz: number) => { const a = Math.atan2(-dx, dz); return FROM[Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8]; };

export function create(k: Anlewo): Act | null {
  const { state, set, put, flush } = stateOf(k);
  const spot0 = { x: 92, z: 190 }, gy = groundAt(spot0.x, spot0.z);
  if (gy == null) return null;
  const { kite, tails, line } = makeKite();
  k.world.scene.add(kite, tails[0].mesh, tails[1].mesh, line.mesh);
  kite.visible = tails[0].mesh.visible = tails[1].mesh.visible = line.mesh.visible = false;
  // 给村人那一路：孩子的纸鸢挂在树上了
  (k as unknown as { play?: Record<string, unknown> }).play = { ...((k as unknown as { play?: Record<string, unknown> }).play ?? {}), kiteInTree: (at: { x: number; y: number; z: number }, yaw?: number) => kiteInTree(k, at, yaw) };

  type Phase = 'ready' | 'fly' | 'reel' | 'held' | 'lost' | 'fallen' | 'off';
  let phase: Phase = 'off', t = 0, Lk = 0, el = 0, lat = 0, T = 0, payout = false, high = 0, best = 0, snapT = 0, flopT = 0, lostT = 0, rel = 0;
  const kp = V(), hand = V(), dir = V(), side = V(), prev = V(), vel = V(), lostV = V(), tmp = V(), tmp2 = V();
  const pts = Array.from({ length: 28 }, () => V()), tp = Array.from({ length: 10 }, () => V());
  const cam: Pose = { pos: V(), look: V(), fov: 56, yaw: 18, up: 12, down: 8 };
  /** 风：吹去的方向与快慢（米/秒）；阵风一阵一阵 */
  const wind = (out: THREE.Vector3) => { const w = U.uWind.value; out.set(w.x, 0, w.y); if (out.lengthSq() < 1e-6) out.set(1, 0, 0); out.normalize(); return 3.4 + 26 * k.atmos.wind; };
  const gust = () => 0.18 * Math.sin(t * 0.73) + 0.1 * Math.sin(t * 2.1 + 1.3) + 0.06 * Math.sin(t * 4.7);
  const keysFly = [{ key: '空格', label: '按住放线' }, { key: 'Shift', label: '跑' }, { key: 'W A S D', label: '走' }];

  const ready = (hint?: string) => {
    phase = 'ready'; Lk = 0; el = 0; T = 0; payout = false;
    wind(dir);
    set({ title: '放纸鸢', hint: hint ?? `风从${fromWord(dir.x, dir.z)}来，迎着风跑起来，够劲了按住「放」`, meter: { v: 0, lo: 0.62, hi: 1, label: '风' }, hold: { id: 'let', label: '放' }, keys: keysFly, choices: [{ id: 'done', label: '罢' }] });
    k.nav.setPose(null);
  };

  const act: Act & { on(): boolean } = {
    id: 'kite', name: '纸鸢', anchor: V(spot0.x, gy + 1.6, spot0.z), spot: { x: spot0.x, z: spot0.z, yaw: 0 }, radius: 3.2, state, free: true,
    on: () => k.season === 'spring' && k.atmos.w.rain < 0.4 && k.atmos.w.snow < 0.3 && k.atmos.night < 0.5,
    enter() {
      t = 0; best = 0; high = 0; snapT = 0;
      kite.visible = tails[0].mesh.visible = tails[1].mesh.visible = true; line.mesh.visible = false;
      k.player.av.setHands('free');
      prev.copy(k.player.pos);
      ready();
      // 先转身迎着风
      wind(dir); k.player.faceTo = Math.atan2(-dir.x, -dir.z);
    },
    exit() {
      const av = k.player.av;
      kite.visible = tails[0].mesh.visible = tails[1].mesh.visible = line.mesh.visible = false;
      av.reach('L', null); av.reach('R', null); av.lookAt(null);
      k.events.loop?.('kiteWind', 0);
      if (best > 1) record(false);
      phase = 'off';
    },
    update(dt) {
      t += dt; flush();
      const p = k.player.pos;
      vel.subVectors(p, prev).divideScalar(Math.max(dt, 1e-3)); prev.copy(p);
      const w = wind(dir) * (1 + gust());
      side.set(-dir.z, 0, dir.x);
      // 迎着风跑：风对纸鸢更大
      const up = -(vel.x * dir.x + vel.z * dir.z);
      rel = w + Math.max(-2, up);
      if (phase === 'ready') {
        put({ meter: { v: clamp(rel / 11), lo: 0.62, hi: 1, label: '风' } });
        if (flopT > 0) flopT -= dt;
      } else if (phase === 'fly') fly(dt);
      else if (phase === 'reel') {
        // 收线：一把一把往回收，纸鸢慢慢落下来
        Lk = Math.max(0, Lk - dt * (4 + Lk * 0.12));
        el = Math.max(0.15, el - dt * 0.05);
        if (Lk < 2.5) { phase = 'held'; k.events.loop?.('kiteWind', 0); line.mesh.visible = false; k.nav.setPose(null); finish(); }
      } else if (phase === 'lost') {
        lostT += dt;
        kp.addScaledVector(lostV, dt); lostV.y = Math.max(-0.6, lostV.y - dt * 0.15);
        if (lostT > 9) { kite.visible = tails[0].mesh.visible = tails[1].mesh.visible = false; phase = 'off'; }
      }
    },
    cmd(c, arg) {
      if (c === 'let') {
        if (arg === 'down' && phase === 'ready') launch();
        else if (phase === 'fly') payout = arg === 'down';
      } else if (c === 'reel' && phase === 'fly') { phase = 'reel'; payout = false; set({ title: '放纸鸢', hint: '一把一把往回收线', choices: [{ id: 'done', label: '罢' }] }); }
      else if (c === 'again') { kite.visible = tails[0].mesh.visible = tails[1].mesh.visible = true; ready(); }
      else if (c === 'done') {
        if (phase === 'fly') { phase = 'reel'; payout = false; set({ title: '放纸鸢', hint: '一把一把往回收线', choices: [{ id: 'done', label: '罢' }] }); return; }
        if (phase === 'reel') return;
        k.exitAct();
      }
    },
  };

  function launch() {
    if (rel < 11 * 0.62) {
      flopT = 1;
      sfx(k, 'kiteFall', { vel: 0.3 });
      put({ hint: '风不够，纸鸢扑了一下又落回手里。再跑快些' }, true);
      return;
    }
    phase = 'fly'; Lk = 5; el = 0.45; lat = 0; T = 0.5; payout = true;
    line.mesh.visible = true;
    sfx(k, 'flutter', { vel: 0.5 });
    cam.pos.copy(k.world.camera.position); cam.look.copy(kp);
    k.nav.setPose(cam, 1.6);
    set({ title: '放纸鸢', hint: '起去了！拽得紧就放线', meter: { v: T, lo: 0.36, hi: 0.78, label: '劲' }, hold: { id: 'let', label: '放' }, keys: keysFly, choices: [{ id: 'reel', label: '收线' }, { id: 'done', label: '罢' }] });
  }
  function fly(dt: number) {
    // 拽劲：风对纸鸢的相对快慢（放线时它往后退，相对的风小了）
    const pay = payout ? 1.2 + 3.2 * clamp(T) : 0;
    const v = Math.max(0, rel - pay * 0.75);
    const Traw = (v * v) / 62 * (0.55 + 0.45 * Math.cos(el * 0.9));
    T += (Traw - T) * Math.min(1, dt * 3);
    // 立起来多陡：劲足就往上立，劲不够就往下栽；放线时退一退
    el += (0.55 * (T - 0.3) - (payout ? 0.6 * pay / Math.max(6, Lk) : 0)) * dt;
    el = clamp(el, -0.05, 1.22);
    if (payout) Lk = Math.min(110, Lk + pay * dt);
    lat = 0.2 * Math.sin(t * 0.37) + 0.07 * Math.sin(t * 1.3 + 0.4);
    high = Math.max(0, Lk * Math.sin(el));
    best = Math.max(best, high);
    snapT = T > 0.95 ? snapT + dt : Math.max(0, snapT - dt);
    k.events.loop?.('kiteWind', clamp(0.3 + 0.7 * T) * smooth(2, 12, Lk));
    const word = T > 0.86 ? '拽得太紧了，放线！' : T < 0.28 ? '松了，要栽下来——别放线，迎着风走几步' : Lk >= 110 ? '线放到头了' : high > 45 ? '高得只剩天上一点' : '稳在风里';
    put({ meter: { v: clamp(T), lo: 0.36, hi: 0.78, label: '劲' }, hold: { id: 'let', label: '放', v: Lk / 110 }, hint: `${word}（约${cnNum(Math.round(high))}米高）` });
    if (snapT > 0.7) {
      // 线断了：纸鸢顺风飘走
      phase = 'lost'; lostT = 0; line.mesh.visible = false;
      lostV.copy(dir).multiplyScalar(4).setY(1.2);
      sfx(k, 'snap', { vel: 0.6 }); k.events.loop?.('kiteWind', 0);
      record(true);
      set({ title: '放纸鸢', text: `线断了，纸鸢顺着风飘远了。断之前飞到${cnNum(Math.round(best))}米上下。`, choices: [{ id: 'again', label: '再糊一只' }, { id: 'done', label: '罢' }], done: true });
      best = 0;
    } else if (el <= 0.02) {
      phase = 'fallen'; line.mesh.visible = false; k.events.loop?.('kiteWind', 0);
      sfx(k, 'kiteFall', { vel: 0.4 });
      set({ title: '放纸鸢', hint: '纸鸢栽下来了', choices: [{ id: 'again', label: '捡回来再放' }, { id: 'done', label: '罢' }] });
    }
  }
  function finish() {
    record(false);
    set({ title: '放纸鸢', text: `收回来了。最高的时候，离地${cnNum(Math.round(best))}米上下${best > 45 ? '，只剩天上一点' : ''}。`, choices: [{ id: 'again', label: '再放一回' }, { id: 'done', label: '罢' }], done: true });
    best = 0;
  }
  function record(snapped: boolean) {
    const h = Math.round(best);
    const r = playGet<{ n?: number; best?: number; lost?: number }>(k, 'kite', {});
    const better = h > (r.best ?? 0);
    playSet(k, 'kite', { ...r, n: (r.n ?? 0) + 1, best: Math.max(r.best ?? 0, h), lost: (r.lost ?? 0) + (snapped ? 1 : 0) });
    k.log({ kind: 'play', text: snapped ? `放纸鸢，线断了（飞到${cnNum(h)}米）` : `放纸鸢，飞到${cnNum(h)}米高` });
    if (better && (r.best ?? 0) > 0) k.note(`纸鸢放得比以往都高（${cnNum(h)}米）`);
  }

  // —— 每帧：纸鸢、纸尾、线、手、镜头 ——
  onFrame(k, 'kite', () => {
    if (act !== k.act || phase === 'off') return;
    const av = k.player.av, p = k.player.pos, c = k.world.camera.position;
    av.joints.handR.getWorldPosition(hand);
    if (phase === 'ready' || phase === 'fallen' || phase === 'held') {
      // 拿在手里：右手举着，纸鸢面朝后（风来的方向反面）
      kp.copy(p).add(V(0, 1.75 + (flopT > 0 ? 0.25 * Math.sin(flopT * Math.PI) : 0), 0)).addScaledVector(dir, 0.12);
      if (phase === 'fallen') kp.copy(p).addScaledVector(dir, 1.5).setY((groundAt(p.x + dir.x * 1.5, p.z + dir.z * 1.5) ?? p.y) + 0.05);
      av.reach('R', tmp.copy(p).add(V(0, 1.5, 0)).addScaledVector(dir, 0.1), { rate: 10 });
      av.reach('L', null);
      av.lookAt(null);
      kite.position.copy(kp);
      kite.lookAt(tmp2.copy(kp).sub(dir));
      if (phase === 'fallen') kite.rotateX(-1.3);
    } else if (phase === 'fly' || phase === 'reel') {
      // 在下风处：线长 × 立得多陡；左右轻轻地摆
      const ce = Math.cos(el), r = Lk;
      kp.copy(hand).addScaledVector(dir, r * ce * Math.cos(lat)).addScaledVector(side, r * ce * Math.sin(lat)); kp.y = hand.y + r * Math.sin(el);
      kp.y = Math.max(kp.y, (groundAt(kp.x, kp.z) ?? kp.y) + 0.3);
      kite.position.copy(kp);
      kite.lookAt(hand);
      kite.rotateX(-0.45 - 0.2 * (1 - T));
      kite.rotateZ(0.25 * Math.sin(t * 0.37 + 1) + 0.08 * Math.sin(t * 2.3));
      // 线：从手到纸鸢，松的时候往下垂
      const sag = r * 0.07 * (1 - clamp(T)) + 0.2;
      for (let i = 0; i < 28; i++) { const u = i / 27; pts[i].lerpVectors(hand, kp, u); pts[i].y -= Math.sin(Math.PI * u) * sag; }
      line.set(pts, c);
      // 手：右手捏着线，往纸鸢那边伸；拽紧时往回带一带；左手在胸前理线
      const tug = clamp(T - 0.5) * 0.15;
      tmp.copy(p).add(V(0, 1.32, 0)).addScaledVector(tmp2.subVectors(kp, p).setY(0).normalize(), 0.42 - tug);
      av.reach('R', tmp, { dir: tmp2.subVectors(kp, tmp).normalize(), rate: 12 });
      av.reach('L', tmp2.copy(p).add(V(0, 1.12, 0)).addScaledVector(dir, 0.22), { rate: 8 });
      av.lookAt(kp);
      // 镜头：在人身后（背着纸鸢的那一边）低低地仰看，人在画下方，纸鸢在画上方
      const toK = tmp2.subVectors(kp, p).setY(0); const dk = toK.length() || 1; toK.multiplyScalar(1 / dk);
      cam.pos.copy(p).addScaledVector(toK, -5.6).add(V(0, 1.25, 0)).addScaledVector(side, 1.1);
      // 人（胸口）与纸鸢各在镜头的哪个仰角：取中间看过去，视角放到两样都装得下
      const hP = Math.hypot(p.x - cam.pos.x, p.z - cam.pos.z), hK = Math.hypot(kp.x - cam.pos.x, kp.z - cam.pos.z);
      const aP = Math.atan2(p.y + 0.9 - cam.pos.y, hP), aK = Math.atan2(kp.y - cam.pos.y, hK), mid = (aP + aK) / 2;
      cam.look.copy(cam.pos).addScaledVector(toK, Math.cos(mid) * 10); cam.look.y += Math.sin(mid) * 10;
      cam.fov = clamp((((aK - aP) * 180) / Math.PI) * 1.18 + 12, 46, 80);
      // 走路的「前」跟着这个镜头走
      k.nav.yaw = Math.atan2(cam.pos.x - p.x, cam.pos.z - p.z);
    } else if (phase === 'lost') {
      kite.position.copy(kp);
      kite.rotateZ(0.02);
      av.reach('R', null); av.reach('L', null); av.lookAt(kp);
    }
    // 纸尾：从鸢尾垂下，顺风飘
    kite.updateMatrixWorld(true);
    for (let s = 0; s < 2; s++) {
      tmp.set((s ? 1 : -1) * 0.05, -0.36, 0).applyMatrix4(kite.matrixWorld);
      const flow = phase === 'fly' || phase === 'reel' || phase === 'lost' ? 1 : 0.25;
      for (let i = 0; i < 10; i++) { const u = i / 9; tp[i].copy(tmp).addScaledVector(dir, u * 1.2 * flow).add(V(0, -u * (1.25 - flow * 0.6), 0)).addScaledVector(side, 0.12 * Math.sin(t * 3.1 + u * 4 + s * 1.5) * u); }
      tails[s].set(tp, c);
    }
  });
  return act;
}
