/**
 * 殿里的三件事（都由行者去做，镜头在一旁看着）：
 *   礼佛 —— 走到拜垫后面站定，往前跪到垫上，合十。按住，他伏身下拜；松开，起身。拜到底时磬响一声。三拜为一礼。
 *   木鱼 —— 在木鱼前跪坐，右手持槌，左手单掌当胸。点一下敲一下，一击一字，跟着《心经》二百六十字走一遍。
 *   拈一则 —— 捧起签筒，左右摇（拖动，或者摇手机），摇出一支落在几上；签上不是吉凶，是一则古人的话。
 */
import * as THREE from 'three';
import type { Kongshan } from '../Kongshan';
import { cn } from '../../util/cn';
import { H } from '../scene';
import type { Act } from './types';
import { KNEELER, KNEEL_BACK, KNEEL_ROOT, Spring, UP, behind, clamp01, ease, fwdOf, hold, jpos, lift, rightOf, wpos } from './util';

// —— 礼佛 ——
export function createBow(k: Kongshan): Act {
  const kn = k.parts.kneel, bud = k.parts.buddha;
  const eye = bud ? new THREE.Vector3(bud.position.x, bud.position.y + bud.userData.eyeY, bud.position.z) : new THREE.Vector3(kn.x, kn.y + 4.2, kn.z - 5);
  const pose = { pos: new THREE.Vector3(kn.x - 1.2, H + 1.5, kn.z + 3.6), look: new THREE.Vector3(kn.x + 0.2, H + 1.55, kn.z - 3.0), fov: 54, yaw: 22, up: 16, down: 10 };
  const state: Record<string, unknown> = {};
  let held = false, b = 0, counted = false, n = 0, total = 0;
  const sync = () => { state.count = n ? `${cn(n)}拜` : ''; state.hint = n === 0 ? '按住，俯身下拜；松开，起身' : n === 3 ? '三拜毕' : ''; k.emitAct(); };
  const key = (e: KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); held = e.type === 'keydown'; } };
  return {
    id: 'bow', name: '礼佛', anchor: new THREE.Vector3(kn.x, kn.y + 0.75, kn.z), spot: behind(kn, Math.PI, KNEEL_BACK), state, noZoom: true, dynamicShadow: true,
    enter() {
      n = 0; total = 0; b = 0; held = false;
      const av = k.player.av;
      // 两膝落在垫心略靠后处：root（膝下的那个面）在垫心之后 KNEEL_ROOT，抬到垫面那么高；脚在垫后落到地上
      const at = behind(kn, Math.PI, KNEEL_ROOT);
      k.player.slideTo(at.x, at.z, 1.0); k.player.lift = KNEELER.h;
      av.setSeat?.({ ...KNEELER, cz: KNEEL_ROOT });
      av.setPose('kneel', 1.2); av.setHands('pray', 0.8); av.lookAt(eye);
      k.nav.setPose(pose, 2.0);
      window.addEventListener('keydown', key); window.addEventListener('keyup', key);
      sync();
    },
    exit() { window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); if (total > 0) k.log({ kind: 'bow', n: total }); },
    input: { down: () => { held = true; }, up: () => { held = false; }, move: () => true, tap: () => true },
    update(dt) {
      b += Math.max(-dt * 0.66, Math.min(dt * 0.6, (held ? 1 : 0) - b));
      const av = k.player.av;
      av.bow = ease(b);
      av.lookAt(b > 0.1 ? null : eye);
      if (b > 0.97 && !counted) { counted = true; n++; total++; k.sfx('bowl', { vel: 0.55, space: 'hall' }); k.buzz(14); sync(); }
      if (b < 0.2) counted = false;
    },
  };
}

// —— 木鱼 ——
export function createMuyu(k: Kongshan): Act {
  const g = k.parts.muyu, fish = g.userData.fish as THREE.Object3D, mallet = g.userData.mallet as THREE.Object3D;
  const S = wpos(g, (g.userData.strike as THREE.Vector3).clone());
  // 人跪坐在鱼口这一侧，面朝木鱼
  const ry = g.rotation.y, spot = { x: g.position.x + Math.sin(ry) * 0.7, z: g.position.z + Math.cos(ry) * 0.7, yaw: ry + Math.PI };
  const f = fwdOf(spot.yaw), r = rightOf(spot.yaw);
  const pose = { pos: new THREE.Vector3(spot.x, 0, spot.z).addScaledVector(r, -2.05).addScaledVector(f, -0.5).setY(H + 1.12), look: S.clone().lerp(new THREE.Vector3(spot.x, S.y, spot.z), 0.45).setY(H + 0.72), fov: 44, yaw: 16, up: 10, down: 8 };
  const LEN = 0.325;
  const state: Record<string, unknown> = { sutra: true };
  let struck = 0, total = 0, rounds = 0, anim = 1, pulse = 0, active = false, back: (() => void) | null = null;
  const TOTAL = 260;
  const sync = () => {
    state.struck = struck;
    state.count = total === 0 ? '' : `${rounds ? `${cn(rounds)}遍　` : ''}${struck ? `第${cn(struck)}字` : ''}`;
    state.hint = total === 0 ? '点一下，敲一下。一击一字' : struck === 0 ? '一遍毕' : '';
    k.emitAct();
  };
  const hit = () => {
    if (!active || anim < 0.6) return;
    anim = 0;
    window.setTimeout(() => {
      if (!active) return;
      k.sfx('muyu', { vel: 0.62 + Math.random() * 0.2, pitch: 0.98 + Math.random() * 0.04, space: 'hall' }); k.buzz(8);
      pulse = 1; struck++; total++;
      if (struck >= TOTAL) { struck = 0; rounds++; window.setTimeout(() => k.sfx('bowl', { vel: 0.6, space: 'hall' }), 420); }
      sync();
    }, 70);
  };
  const key = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); hit(); } };
  const head = new THREE.Vector3(), dir = new THREE.Vector3(), tgt = new THREE.Vector3();
  return {
    id: 'muyu', name: '木鱼', anchor: S.clone().setY(S.y + 0.2), spot, state, noZoom: true, dynamicShadow: true,
    enter() {
      active = true; struck = 0; total = 0; rounds = 0; anim = 1;
      const av = k.player.av;
      av.setPose('kneel', 1.1); av.setHands('pray', 0.8);
      back = hold(mallet, av.joints.handR);
      k.nav.setPose(pose, 1.9);
      window.addEventListener('keydown', key);
      sync();
    },
    exit() {
      active = false;
      window.removeEventListener('keydown', key);
      back?.(); back = null;
      fish.scale.set(1, 1, 1);
      if (total > 0) k.log({ kind: 'muyu', n: total, text: rounds ? `诵《心经》${cn(rounds)}遍` : undefined });
    },
    input: { down: () => hit(), move: () => true, tap: () => true },
    cmd(name) { if (name === 'sutra') { state.sutra = !state.sutra; k.emitAct(); } },
    update(dt) {
      if (!active) return;
      anim = Math.min(1, anim + dt / 0.42);
      // 0→0.18 落槌，之后提起
      const s = anim < 0.18 ? ease(anim / 0.18) : 1 - ease((anim - 0.18) / 0.82);
      head.copy(S).addScaledVector(UP, 0.014 + 0.12 * (1 - s));
      // 槌从握处指向槌头：朝前、朝下
      dir.copy(f).multiplyScalar(0.72).addScaledVector(UP, -0.25 - 0.55 * s).addScaledVector(r, -0.12).normalize();
      tgt.copy(head).addScaledVector(dir, -LEN);
      k.player.av.reach('R', tgt, { dir, rate: 26 });
      pulse = Math.max(0, pulse - dt / 0.14);
      fish.scale.set(1 + 0.012 * pulse, 1 - 0.03 * pulse, 1 + 0.012 * pulse);
    },
  };
}

// —— 拈一则 ——
export function createLots(k: Kongshan): Act {
  const g = k.parts.lots, sticks = g.userData.sticks as THREE.Object3D[];
  const home = wpos(g, new THREE.Vector3());
  const spot = { x: home.x, z: home.z + 0.66, yaw: Math.PI };
  const pose = { pos: new THREE.Vector3(home.x - 1.75, H + 1.38, home.z - 1.15), look: new THREE.Vector3(home.x + 0.05, H + 1.02, home.z + 0.42), fov: 42, yaw: 14, up: 8, down: 8 };
  const base = sticks.map((s) => ({ p: s.position.clone(), q: s.quaternion.clone() }));
  const state: Record<string, unknown> = { phase: 'shake', nonce: 0 };
  const tilt = new Spring(0, 16, 0.3), take = new Spring(0, 5, 1);
  let energy = 0, pick = 0, jitter = 0, lastDir = 0, pop = -1, active = false, lastShake = 0, back: (() => void) | null = null, stickBack: (() => void) | null = null;
  const rest = new THREE.Vector3(home.x + 0.14, home.y + 0.006, home.z - 0.02), restQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.6, Math.PI / 2 - 0.02));
  const set = (p: Record<string, unknown>) => { Object.assign(state, p); k.emitAct(); };
  const from = new THREE.Vector3(), fromQ = new THREE.Quaternion();
  const reset = () => {
    stickBack?.(); stickBack = null;
    energy = 0; pop = -1; pick = Math.floor(Math.random() * sticks.length); jitter = 0;
    sticks.forEach((s, i) => { s.position.copy(base[i].p); s.quaternion.copy(base[i].q); });
    set({ phase: 'shake', hint: '左右拖动，摇出一支', count: '' });
  };
  const shake = (force: number) => {
    if (!active || state.phase !== 'shake') return;
    const now = performance.now();
    if (now - lastShake < 90) return;
    lastShake = now;
    energy = Math.min(1.02, energy + 0.07 + 0.05 * force);
    jitter = Math.min(1, jitter + 0.5 + 0.4 * force);
    k.sfx('sticks', { vel: 0.4 + 0.5 * force, space: 'near' }); k.buzz(10);
    if (energy >= 1) {
      // 那一支脱出筒口：拿到世界里，让它自己落到几上
      const s = sticks[pick];
      stickBack = lift(k.world.scene, s);
      from.copy(s.position); fromQ.copy(s.quaternion);
      pop = 0;
      set({ phase: 'falling', hint: '' });
    }
  };
  const motion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const m = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
    if (Math.abs(m - 9.8) > 7) { tilt.v += (Math.random() - 0.5) * 6; shake(0.8); }
  };
  let asked = false;
  const e3 = new THREE.Euler(), q2 = new THREE.Quaternion(), qy = new THREE.Quaternion(), hp = new THREE.Vector3(), ax = new THREE.Vector3(), tmp = new THREE.Vector3();
  const f = fwdOf(spot.yaw), r = rightOf(spot.yaw);
  return {
    id: 'lots', name: '拈一则', anchor: home.clone().setY(home.y + 0.5), spot, state, noZoom: true, dynamicShadow: true,
    enter() {
      active = true;
      k.player.av.setHands('sleeve', 0.5);
      k.nav.setPose(pose, 1.8);
      back = lift(k.world.scene, g);
      take.set(0);
      reset();
      window.addEventListener('devicemotion', motion);
    },
    exit() {
      active = false;
      window.removeEventListener('devicemotion', motion);
      stickBack?.(); stickBack = null;
      back?.(); back = null;
      sticks.forEach((s, i) => { s.position.copy(base[i].p); s.quaternion.copy(base[i].q); });
      state.phase = 'shake';
    },
    cmd(name) { if (name === 'again') { state.nonce = (state.nonce as number) + 1; reset(); } },
    input: {
      down: () => {
        // 苹果手机要先问一声才给用「摇一摇」
        if (!asked) { asked = true; const D = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent; void D?.requestPermission?.().catch(() => { /* 不给就用手拖 */ }); }
      },
      move: (p) => {
        if (state.phase !== 'shake') return true;
        tilt.v += p.dx * 0.05;
        const d = Math.sign(p.dx);
        if (d !== 0 && d !== lastDir && Math.abs(p.dx) > 2.5) { lastDir = d; shake(clamp01(Math.abs(p.dx) / 26)); }
        return true;
      },
      tap: () => { tilt.v += (Math.random() < 0.5 ? -1 : 1) * 5; shake(0.5); return true; },
    },
    update(dt, t) {
      if (!active) return;
      const av = k.player.av;
      // 捧筒：从几上端到胸前，筒口朝前上方斜着
      const up = take.step(1, dt), a = tilt.step(0, dt);
      const chest = jpos(av.joints.chest, tmp);
      hp.copy(chest).addScaledVector(f, 0.3).addScaledVector(UP, -0.1);
      g.position.lerpVectors(home, hp, ease(up));
      qy.setFromAxisAngle(UP, spot.yaw);
      g.quaternion.copy(qy).multiply(q2.setFromEuler(e3.set(0.95 * ease(up) + Math.abs(a) * 0.1, 0, Math.max(-0.4, Math.min(0.4, a * 0.3)))));
      ax.set(0, 1, 0).applyQuaternion(g.quaternion);
      g.position.addScaledVector(ax, -0.13 * ease(up));
      // 两手扶在筒身两侧
      const mid = tmp.copy(g.position).addScaledVector(ax, 0.14);
      av.reach('R', hp.copy(mid).addScaledVector(r, 0.07), { dir: ax, palm: r.clone().negate(), rate: 18 });
      av.reach('L', hp.copy(mid).addScaledVector(r, -0.07), { dir: ax, palm: r, rate: 18 });
      jitter = Math.max(0, jitter - dt * 2.2);
      if (state.phase === 'shake') {
        sticks.forEach((s, i) => {
          const j = jitter * 0.05;
          s.quaternion.copy(base[i].q).multiply(q2.setFromEuler(e3.set(Math.sin(t * 31 + i * 1.7) * j, 0, Math.cos(t * 27 + i * 2.3) * j)));
          s.position.copy(base[i].p);
          s.position.y += Math.abs(Math.sin(t * 23 + i)) * jitter * 0.012 + (i === pick ? ease(energy) * 0.105 : 0);
        });
      } else if (pop >= 0 && pop < 1) {
        pop = Math.min(1, pop + dt / 0.7);
        const s = sticks[pick], e = ease(pop);
        // 先顺着筒口滑出去一截，再落到几上
        s.position.lerpVectors(from, rest, e).addScaledVector(ax, Math.sin(pop * Math.PI) * 0.16);
        s.position.y += Math.sin(pop * Math.PI) * 0.06;
        s.quaternion.copy(fromQ).slerp(restQ, Math.pow(e, 1.4));
        if (pop >= 1) {
          k.sfx('stickfall', { vel: 0.7, space: 'near' }); k.buzz([8, 40, 6]);
          window.setTimeout(() => { if (active && state.phase === 'falling') set({ phase: 'drawn' }); }, 900);
        }
      }
    },
  };
}
