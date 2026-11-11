/**
 * 几件安静的事（都由行者去做）：
 *   放灯 —— 他下到池南的石埠，在水边跪下，两手捧一盏莲灯。灯上可以写一句话；点了灯，他俯身把灯放到水面上；
 *           你轻轻一推，他伸手送它出去，然后合掌看它漂远。
 *   吃茶 —— 他在茶几前坐下。候汤；按住，他左手提壶往盏里注汤；再点一下，右手端起盏来，吃茶去。
 *   抄经 —— 他在经房的案前坐下，取笔。纸上的字在界面那一层写（Copy.tsx）；你在那里落笔，他的手也跟着在纸上动。
 */
import * as THREE from 'three';
import type { Kongshan } from '../Kongshan';
import { Smoke } from '../fx/smoke';
import { enhance } from '../core/mats';
import { L } from '../layout';
import type { Act } from './types';
import { SEAT, Spring, UP, ZAFU, ZAFU_BACK, behind, clamp01, ease, fwdOf, hold, jpos, rightOf, wpos } from './util';

// —— 放灯 ——
interface Lamp { g: THREE.Group; v: THREE.Vector3; flame: number; glow: THREE.MeshStandardMaterial; ph: number; lit: number; on: boolean; free: boolean; rip: number; born: number }
export function createLamp(k: Kongshan): Act {
  const P = L.pond, WH = L.wharf;
  /** 水边那块平台的外沿 */
  const edge = P.z1 - 0.36 - WH.d;
  const spot = { x: WH.x, z: edge + 0.3, yaw: Math.PI };
  const f = fwdOf(spot.yaw), r = rightOf(spot.yaw);
  const waterAt = new THREE.Vector3(WH.x, P.y + 0.004, edge - 0.14);
  // 机位：池西的水面上方，从侧前方看——人俯身、两手、灯、水面都看得见；他身后是石桥与东岸
  const pose = { pos: new THREE.Vector3(WH.x - 2.5, P.y + 0.95, edge - 1.5), look: new THREE.Vector3(WH.x + 0.35, P.y + 0.42, edge + 0.0), fov: 44, yaw: 30, up: 14, down: 10 };
  const lamps: Lamp[] = [];
  const state: Record<string, unknown> = { phase: 'write' };
  /** 俯身放灯时拜下去几成（跪姿里 bow=1 是五体投地） */
  const BOW = 0.84;
  let held: Lamp | null = null, cur: Lamp | null = null, gone: Lamp | null = null;
  let tL = 0, afloat = 0, shove = 9, n = 0, active = false, wish = '';
  const set = (p: Record<string, unknown>) => { Object.assign(state, p); k.emitAct(); };
  const fpos = new THREE.Vector3();
  const make = (): Lamp => {
    if (lamps.length >= 12) { const i = lamps.findIndex((l) => l.free); if (i >= 0) { const old = lamps.splice(i, 1)[0]; k.world.scene.remove(old.g); k.flames.set(old.flame, false); } }
    const g = k.parts.lotusLamp();
    g.rotation.y = Math.random() * 6.28; g.scale.setScalar(0.01);
    k.adopt(g); k.world.scene.add(g);
    const glow = g.userData.glow as THREE.MeshStandardMaterial;
    glow.emissiveIntensity = 0;
    const l: Lamp = { g, v: new THREE.Vector3(), flame: k.flames.add(new THREE.Vector3(), 0.03, { halo: 0.42, on: false }), glow, ph: Math.random() * 10, lit: 0, on: false, free: false, rip: 0, born: 0 };
    lamps.push(l);
    return l;
  };
  // 灯一直漂着（不在放灯时也在漂），所以挂在总循环上
  k.world.tick.push((dt, t) => {
    for (const l of lamps) {
      l.born = Math.min(1, l.born + dt / 0.5); l.g.scale.setScalar(ease(l.born));
      l.lit = clamp01(l.lit + (l.on ? dt * 0.8 : -dt * 2));
      const p = l.g.position;
      if (l.free) {
        // 水的阻力；一点很慢的漂流（往桥那边、往北）
        l.v.multiplyScalar(Math.exp(-dt * 0.42));
        if (l !== cur) { l.v.x += (0.012 + 0.01 * Math.sin(t * 0.07 + l.ph)) * dt; l.v.z += (-0.008 + 0.01 * Math.cos(t * 0.05 + l.ph * 1.3)) * dt; }
        p.x += l.v.x * dt; p.z += l.v.z * dt;
        // 池岸与桥墩：轻轻挡回来；石埠也是
        const m = 0.55;
        if (p.x < P.x0 + m) { p.x = P.x0 + m; l.v.x = Math.abs(l.v.x) * 0.3; } if (p.x > P.x1 - m) { p.x = P.x1 - m; l.v.x = -Math.abs(l.v.x) * 0.3; }
        if (p.z < P.z0 + m) { p.z = P.z0 + m; l.v.z = Math.abs(l.v.z) * 0.3; } if (p.z > P.z1 - m) { p.z = P.z1 - m; l.v.z = -Math.abs(l.v.z) * 0.3; }
        if (Math.abs(p.x - WH.x) < WH.w / 2 + 0.16 && p.z > edge - 0.16) { p.z = edge - 0.16; l.v.z = -Math.abs(l.v.z) * 0.3; }
        p.y = P.y + 0.004 + Math.sin(t * 1.1 + l.ph) * 0.004;
        l.g.rotation.y += dt * 0.05 * Math.sin(l.ph);
        l.g.rotation.z = Math.sin(t * 0.9 + l.ph) * 0.02;
        l.rip += dt * (0.2 + l.v.length() * 6);
        if (l.rip > 1) { l.rip = 0; k.pond.ripple(p.x, p.z, 0.18 + l.v.length() * 0.6); }
      }
      l.glow.emissiveIntensity = l.lit * (0.9 + 1.6 * k.atmos.night) * (0.92 + 0.08 * Math.sin(t * 9 + l.ph));
      l.g.updateMatrixWorld();
      k.flames.move(l.flame, fpos.copy(l.g.userData.flame as THREE.Vector3).applyMatrix4(l.g.matrixWorld));
    }
  });
  const light = (text: string) => {
    if (!held || !active || state.phase !== 'write') return;
    wish = text;
    held.on = true; k.flames.set(held.flame, true);
    k.sfx('lamp', { vel: 0.6, space: 'near' });
    tL = 0;
    set({ phase: 'lower', hint: '' });
  };
  const push = (dx: number, dy: number, speed: number) => {
    if (!cur || state.phase !== 'push') return;
    // 总是离岸往池心去；手在屏幕上往哪边划，就往那边带一点偏
    const cf = new THREE.Vector3().subVectors(pose.look, pose.pos).setY(0).normalize(), cr = new THREE.Vector3(-cf.z, 0, cf.x);
    const s = 0.35 + Math.min(1.1, speed * 0.02), tot = Math.abs(dx) + Math.abs(dy) + 1e-3;
    cur.v.copy(f).multiplyScalar(0.7).addScaledVector(cr, 0.45 * (dx / tot)).addScaledVector(cf, 0.45 * (-dy / tot));
    if (cur.v.dot(f) < 0.35) cur.v.addScaledVector(f, 0.35 - cur.v.dot(f));
    cur.v.normalize().multiplyScalar(s);
    k.sfx('ripple', { vel: 0.5, space: 'near' }); k.buzz(8);
    k.pond.ripple(cur.g.position.x, cur.g.position.z, 0.8);
    gone = cur; cur = null; afloat = 0; shove = 0;
    set({ phase: 'afloat', hint: '' });
  };
  const key = (e: KeyboardEvent) => { if (e.key === ' ' && !e.repeat && state.phase === 'push') { e.preventDefault(); push(0, -1, 6); } };
  const chest = new THREE.Vector3(), carry = new THREE.Vector3(), tmp = new THREE.Vector3(), palmR = new THREE.Vector3(), palmL = new THREE.Vector3();
  const goal = new THREE.Vector3(), mid = new THREE.Vector3(), hl = new THREE.Vector3(), hr = new THREE.Vector3();
  return {
    id: 'lamp', name: '放灯', anchor: new THREE.Vector3(WH.x, 0.75, P.z1 + 0.1), spot, radius: 2.4, state, noZoom: true, dynamicShadow: true,
    enter() {
      active = true; n = 0; cur = null; gone = null; shove = 9;
      const av = k.player.av;
      av.setPose('kneel', 1.2); av.setHands('free', 0.4);
      held = make();
      held.g.position.copy(jpos(av.joints.handL, hl)).add(jpos(av.joints.handR, hr)).multiplyScalar(0.5);
      k.nav.setPose(pose, 2.0);
      window.addEventListener('keydown', key);
      set({ phase: 'write', hint: '', count: '' });
    },
    exit() {
      active = false;
      window.removeEventListener('keydown', key);
      // 还捧在手里的那盏收起来；已经在水面的让它自己漂走
      if (held) { const i = lamps.indexOf(held); if (i >= 0) lamps.splice(i, 1); k.world.scene.remove(held.g); k.flames.set(held.flame, false); held = null; }
      if (cur) { cur.v.set(0.06, 0, -0.22); cur = null; }
      state.phase = 'write';
    },
    cmd(name, arg) { if (name === 'light') light(String(arg ?? '')); },
    input: {
      up: (p) => { const d = Math.hypot(p.x - p.x0, p.y - p.y0), ms = performance.now() - p.t0; if (state.phase === 'push' && d > 14) push(p.x - p.x0, p.y - p.y0, d / Math.max(0.05, ms / 1000) / 30); },
      tap: () => { if (state.phase === 'push') push(0, -1, 6); return true; },
      move: () => true,
    },
    update(dt) {
      if (!active) return;
      const av = k.player.av;
      jpos(av.joints.chest, chest);
      carry.copy(chest).addScaledVector(f, 0.27).addScaledVector(UP, -0.13);
      palmR.copy(UP).multiplyScalar(0.8).addScaledVector(r, -0.6).normalize(); palmL.copy(UP).multiplyScalar(0.8).addScaledVector(r, 0.6).normalize();
      if (held) {
        const p = held.g.position;
        // 灯不离手：两手到了哪，灯就在哪（两掌之间、略低一点）
        mid.copy(jpos(av.joints.handL, hl)).add(jpos(av.joints.handR, hr)).multiplyScalar(0.5);
        p.copy(mid).addScaledVector(UP, -0.012);
        if (p.y < waterAt.y) p.y = waterAt.y;
        goal.copy(carry);
        if (state.phase === 'lower') {
          // 俯身，两手把灯从胸前送到水面
          tL = Math.min(1.5, tL + dt / 1.7);
          const e = ease(tL);
          av.bow = BOW * e;
          goal.lerpVectors(carry, waterAt, e); goal.y += Math.sin(e * Math.PI) * 0.03;
          // 手真的到了水面（或者等得够久了）才松手
          if (tL >= 1 && (mid.distanceTo(tmp.copy(waterAt).addScaledVector(UP, 0.012)) < 0.03 || tL >= 1.5)) {
            held.free = true; held.v.set(0, 0, 0); cur = held; held = null;
            k.sfx('plop', { vel: 0.3, space: 'near' }); k.pond.ripple(waterAt.x, waterAt.z, 0.6);
            k.log({ kind: 'lamp', text: wish || undefined });
            n++;
            set({ phase: 'push', hint: '轻轻一推，送它出去', count: n > 1 ? `${n} 盏` : '' });
          }
        } else { av.bow += (0 - av.bow) * Math.min(1, dt * 3); av.lookAt(p); }
        // 两手从下面托着灯（手要去的地方是 goal 的两侧）
        if (held) {
          av.reach('R', tmp.copy(goal).addScaledVector(r, 0.085).addScaledVector(UP, 0.012), { dir: f, palm: palmR, rate: 14 });
          av.reach('L', tmp.copy(goal).addScaledVector(r, -0.085).addScaledVector(UP, 0.012), { dir: f, palm: palmL, rate: 14 });
        }
      } else if (cur) {
        // 灯在水面上了，两手还虚扶着，等那一推
        av.bow = BOW; av.lookAt(cur.g.position);
        av.reach('R', tmp.copy(cur.g.position).addScaledVector(r, 0.1).addScaledVector(UP, 0.03), { dir: f, palm: palmR, rate: 10 });
        av.reach('L', tmp.copy(cur.g.position).addScaledVector(r, -0.1).addScaledVector(UP, 0.03), { dir: f, palm: palmL, rate: 10 });
      } else if (gone) {
        // 送出去：右手跟着送一小段，然后收手、直起身、合掌
        shove += dt;
        if (shove < 0.45) {
          av.reach('R', tmp.copy(waterAt).addScaledVector(f, 0.16 * ease(shove / 0.45)).addScaledVector(UP, 0.05), { dir: f, palm: f, rate: 14 });
          av.reach('L', null);
        } else if (shove - dt < 0.45) { av.reach('R', null); av.setHands('pray', 0.9); }
        if (shove > 0.3) av.bow += (0.06 - av.bow) * Math.min(1, dt * 2.2);
        av.lookAt(gone.g.position);
        afloat += dt;
        if (afloat > 4.6) {
          // 再捧一盏
          gone = null;
          av.setHands('free', 0.5); av.bow = 0;
          held = make(); held.g.position.copy(carry);
          set({ phase: 'write', hint: '' });
        }
      }
    },
  };
}

// —— 吃茶 ——
export function createTea(k: Kongshan): Act {
  const g = k.parts.tea, kettle = g.userData.kettle as THREE.Object3D, cup = g.userData.cup as THREE.Object3D;
  const seat = k.parts.seat.tea, spot = behind(seat, -Math.PI / 2, ZAFU_BACK);
  const f = fwdOf(spot.yaw), r = rightOf(spot.yaw);
  const cupTop = wpos(g, (g.userData.cupTop as THREE.Vector3).clone()), steamAt = wpos(g, (g.userData.steam as THREE.Vector3).clone());
  const ember = g.userData.ember as THREE.MeshStandardMaterial | undefined;
  // 机位：门口那一侧、略偏南，隔着茶几看人；他身后是月洞窗
  const pose = { pos: new THREE.Vector3(L.tea.x - 2.0, seat.y + 0.98, L.tea.z + 1.05), look: new THREE.Vector3(L.tea.x + 0.1, seat.y + 0.56, L.tea.z - 0.04), fov: 44, yaw: 30, up: 20, down: 12 };
  const sip = { pos: new THREE.Vector3(L.tea.x - 1.15, seat.y + 0.98, L.tea.z + 0.62), look: new THREE.Vector3(seat.x - 0.12, seat.y + 0.82, L.tea.z - 0.06), fov: 38, yaw: 12, up: 8, down: 8 };
  const home = { p: kettle.position.clone(), q: kettle.quaternion.clone() }, cupHome = { p: cup.position.clone(), q: cup.quaternion.clone() };
  // 壶提到盏上方时的位置（茶具自己的坐标里）
  const cupLocal = (g.userData.cupTop as THREE.Vector3).clone(), spout = (g.userData.spout as THREE.Vector3).clone();
  const over = cupLocal.clone().add(new THREE.Vector3(-spout.x * 0.82, 0.2, 0));
  const steam = k.addSmoke(new Smoke([steamAt.clone()], { points: 30, rise: 0.36, w0: 0.012, w1: 0.2, alpha: 0.5, curl: 0.12, every: 0.06 }));
  steam.strength = 0;
  const steamPt = cupTop.clone();
  const cupSteam = k.addSmoke(new Smoke([steamPt], { points: 36, rise: 0.2, w0: 0.03, w1: 0.16, alpha: 0.5, curl: 0.09 }));
  cupSteam.strength = 0;
  // 盏里的茶汤：道具自带一片汤面，这里管它有没有（注汤前是空盏）
  let teaMat: THREE.Material | null = null;
  cup.traverse((o) => { const m = (o as THREE.Mesh).material; for (const x of Array.isArray(m) ? m : m ? [m] : []) if ((x as THREE.MeshStandardMaterial).color?.getHex() === 0x8c7a2c) teaMat = x; });
  const setTea = (a: number) => { const m = teaMat as THREE.MeshStandardMaterial | null; if (m) { m.opacity = 0.82 * a; m.visible = a > 0.02; } };
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0016, 1, 6).translate(0, -0.5, 0), enhance(new THREE.MeshStandardMaterial({ color: 0xdfe6e4, roughness: 0.05, transparent: true, opacity: 0.75 })));
  stream.visible = false; k.world.scene.add(stream);
  const state: Record<string, unknown> = {};
  let step = 0, wait = 0, held = false, grasp = 0, raise = 0, fill = 0, level = 0, pouring = false, sipT = 0, active = false, logged = false;
  const HINT = ['候汤——等水响', '按住，提壶注汤', '吃茶去', ''];
  const sync = () => { state.step = step; state.hint = HINT[step]; k.emitAct(); };
  const boil = new Spring(0, 1.2, 1);
  const tap = () => {
    if (!active) return;
    if (step === 0) wait = Math.max(wait, 5.2);
    else if (step === 2) { step = 3; sipT = 0; k.nav.setPose(sip, 2.4); sync(); }
  };
  const key = (e: KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); if (step === 1) held = e.type === 'keydown'; else if (e.type === 'keydown' && !e.repeat) tap(); } };
  const q = new THREE.Quaternion(), e3 = new THREE.Euler(), tmp = new THREE.Vector3(), hp = new THREE.Vector3(), mouth = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  return {
    id: 'tea', name: '吃茶', anchor: cupTop.clone().setY(cupTop.y + 0.4), spot, radius: 2.4, state, noZoom: true, dynamicShadow: true,
    enter() {
      active = true; step = 0; wait = 0; fill = 0; level = 0; raise = 0; grasp = 0; held = false; logged = false; pouring = false;
      setTea(0); cupSteam.strength = 0;
      const av = k.player.av;
      av.setSeat?.(ZAFU);
      av.setPose('sit', 1.4); av.setHands('lap', 1.0); av.lookAt(steamAt);
      k.player.slideTo(seat.x, seat.z, 1.3); k.player.lift = SEAT;
      k.nav.setPose(pose, 2.0);
      window.addEventListener('keydown', key); window.addEventListener('keyup', key);
      sync();
    },
    exit() {
      active = false;
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', key);
      kettle.position.copy(home.p); kettle.quaternion.copy(home.q); cup.position.copy(cupHome.p); cup.quaternion.copy(cupHome.q);
      stream.visible = false; steam.strength = 0; cupSteam.strength = 0; setTea(1);
      if (ember) ember.emissiveIntensity = 1;
    },
    input: { down: () => { held = true; }, up: () => { held = false; }, tap: () => { tap(); return true; }, move: () => true },
    update(dt, t) {
      if (!active) return;
      const av = k.player.av;
      if (step === 0) {
        wait += dt;
        steam.strength = boil.step(Math.min(1, wait / 6), dt);
        if (ember) ember.emissiveIntensity = 1.2 + 0.5 * Math.sin(t * 2.3);
        if (wait > 6.5) { step = 1; sync(); }
      }
      // 提壶：左手先握住提梁，再提起来、移到盏上、倾下去
      const want = step === 1 && held ? 1 : 0;
      if (step === 1 || raise > 0.001 || grasp > 0.001) {
        grasp += Math.max(-dt * 2.2, Math.min(dt * 2.4, (want || raise > 0.02 ? 1 : 0) - grasp));
        if (grasp > 0.92 || !want) raise += Math.max(-dt * 1.6, Math.min(dt * 1.2, want - raise));
        const e = ease(raise);
        kettle.position.lerpVectors(home.p, over, e);
        kettle.quaternion.copy(home.q).multiply(q.setFromEuler(e3.set(0, 0, -0.62 * ease(Math.max(0, (raise - 0.55) / 0.45)))));
        if (grasp > 0.02) { av.reach('L', wpos(kettle, hp.set(0, 0.012, 0)), { dir: f, palm: down, rate: 5 + 14 * grasp }); av.lookAt(raise > 0.4 ? cupTop : steamAt); }
        else av.reach('L', null);
        av.bow = Math.max(ease(grasp) * (1 - e) * 0.9, e);
        const on = raise > 0.93 && step === 1;
        if (on && !pouring) k.sfx('pour', { dur: 2.6, vel: 0.6, space: 'near' });
        pouring = on;
        stream.visible = on;
        if (on) {
          const sp = wpos(kettle, tmp.copy(spout));
          stream.position.copy(sp); stream.scale.set(1, Math.max(0.02, sp.y - (cupTop.y - 0.03 + fill * 0.025)), 1);
          fill = Math.min(1, fill + dt / 2.6); level = fill;
          setTea(level); cupSteam.strength = fill;
          if (fill >= 1) { step = 2; held = false; k.sfx('cup', { vel: 0.4, space: 'near', delay: 0.9 }); sync(); }
        }
      }
      if (step === 3) {
        // 端盏：伸手 → 端到嘴边 → 啜一口 → 放回去
        sipT += dt;
        const up = ease((sipT - 0.9) / 1.3) * (1 - ease((sipT - 3.7) / 1.2));
        jpos(av.joints.head, mouth).addScaledVector(f, 0.13).addScaledVector(UP, -0.1).addScaledVector(r, 0.02);
        g.worldToLocal(mouth);
        cup.position.lerpVectors(cupHome.p, mouth, up);
        cup.quaternion.copy(cupHome.q).multiply(q.setFromEuler(e3.set(0.5 * ease((sipT - 2.0) / 0.5) * (1 - ease((sipT - 3.2) / 0.5)), 0, 0)));
        if (sipT > 2.3 && level > 0.3) { level = Math.max(0.3, level - dt * 0.5); setTea(level); }
        if (sipT < 5.4) { av.reach('R', wpos(cup, hp.set(0, 0.022, 0)).addScaledVector(r, 0.05), { dir: f, palm: tmp.copy(r).negate(), rate: 6 + 10 * up }); av.lookAt(wpos(cup, tmp.set(0, 0.04, 0))); }
        else { av.reach('R', null); av.lookAt(null); }
        av.bow = 0.25 * up;
        cupSteam.strength = fill * Math.max(0, 1 - up * 6) * (sipT > 4.6 ? 0.5 : 1);
        if (sipT > 5 && !logged) { logged = true; k.log({ kind: 'tea' }); state.hint = '茶吃了。'; k.emitAct(); }
      }
      wpos(cup, steamPt.set(0, 0.05, 0));
    },
  };
}

// —— 抄经（纸上的字在界面里写；这里是案前的人） ——
export function createCopy(k: Kongshan): Act {
  const d = k.parts.desk, paper = d.userData.paper as THREE.Object3D, brush = d.userData.brush as THREE.Object3D, sheet = d.userData.sheet as { w: number; h: number };
  const seat = k.parts.seat.study, spot = behind(seat, -Math.PI / 2, ZAFU_BACK);
  const f = fwdOf(spot.yaw), r = rightOf(spot.yaw);
  const c = wpos(paper, new THREE.Vector3());
  // 机位：人的左后上方，越过肩头看案上的纸
  const pose = { pos: new THREE.Vector3(seat.x + 1.0, seat.y + 1.3, seat.z + 0.95), look: new THREE.Vector3(c.x + 0.1, c.y + 0.12, c.z - 0.25), fov: 46, yaw: 14, up: 10, down: 8 };
  const state: Record<string, unknown> = {};
  /** 笔尖在纸上的位置（0…1：x 自左而右，y 自上而下）；down 是落着笔 */
  const pen = { x: 0.62, y: 0.4, down: false, at: 0 };
  /** 一个字在纸上占多大（米） */
  const CELL = 0.09;
  let active = false, t0 = 0, took = false, back: (() => void) | null = null;
  const tip = new THREE.Vector3(), tgt = new THREE.Vector3(), dir = new THREE.Vector3(), grip = new THREE.Vector3(), hov = new Spring(1, 14, 1);
  return {
    id: 'copy', name: '抄经', anchor: c.clone().setY(c.y + 0.45), spot, radius: 2.4, state, noZoom: true, dynamicShadow: true,
    enter() {
      active = true; t0 = 0; took = false; pen.down = false; pen.x = 0.62; pen.y = 0.4;
      const av = k.player.av;
      av.setSeat?.(ZAFU);
      av.setPose('sit', 1.4); av.setHands('lap', 1.0); av.lookAt(c);
      k.player.slideTo(seat.x, seat.z, 1.3); k.player.lift = SEAT;
      k.nav.setPose(pose, 2.0);
      k.sfx('paper', { vel: 0.4, space: 'near' });
      k.emitAct();
    },
    exit() { active = false; back?.(); back = null; /* 写了几个字由界面那一层记进功课簿 */ },
    cmd(name, arg) {
      if (name !== 'pen') return;
      const a = arg as { x: number; y: number; down: boolean };
      pen.x = clamp01(a.x); pen.y = clamp01(a.y); pen.down = a.down; pen.at = performance.now();
    },
    input: { move: () => true, tap: () => true },
    update(dt, t) {
      if (!active) return;
      const av = k.player.av;
      t0 += dt;
      if (!took) {
        // 坐稳了，伸手到笔山上取笔
        if (t0 > 1.3) {
          wpos(brush, grip.set(0, 0.13, 0));
          av.reach('R', tgt.copy(grip).addScaledVector(UP, 0.012), { dir: dir.copy(f).multiplyScalar(0.5).addScaledVector(UP, -0.85).normalize(), rate: 6 });
          av.bow = 0.8 * ease((t0 - 1.3) / 0.7);
          if (t0 > 2.15) { took = true; back = hold(brush, av.joints.handR, [0, 0.1, 0.014], [Math.PI - 0.42, 0, 0]); }
        }
        return;
      }
      // 笔尖：落笔时贴着纸，提笔时离纸两三厘米；没人写的时候在纸上方缓缓悬着
      const idle = performance.now() - pen.at > 2500;
      const px = idle ? 0.62 + 0.02 * Math.sin(t * 0.5) : pen.x, py = idle ? 0.4 + 0.02 * Math.cos(t * 0.37) : pen.y;
      const h = hov.step(pen.down && !idle ? 0 : 1, dt);
      wpos(paper, tip.set(sheet.w * 0.2 + (px - 0.5) * CELL, 0.002 + 0.03 * h, sheet.h * 0.27 + (py - 0.5) * CELL));
      dir.copy(UP).multiplyScalar(-0.9).addScaledVector(f, 0.34).addScaledVector(r, -0.1).normalize();
      av.reach('R', tgt.copy(tip).addScaledVector(dir, -0.1), { dir, rate: 22 });
      av.lookAt(tip);
      av.bow += (0.8 - av.bow) * Math.min(1, dt * 3);
    },
  };
}
