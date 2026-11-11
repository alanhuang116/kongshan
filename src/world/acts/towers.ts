/**
 * 钟楼与鼓楼（都在楼上，从楼下的门上去）：
 *   撞钟 —— 行者站在撞木旁，两手扶着木。按住，他把木往后引；松手，木荡回去撞在钟上。引得越开，钟声越大。
 *           钟一响，林子里惊起一群鸟。每一声配闻钟偈的一句：「闻钟声，烦恼轻，智慧长，菩提生……」
 *   击鼓 —— 行者执双槌立在鼓前。点鼓面哪里，槌就落在哪里：鼓心声沉，偏到边上声亮，敲到鼓帮是木头的一声。
 */
import * as THREE from 'three';
import type { Kongshan } from '../Kongshan';
import { cn } from '../../util/cn';
import { L } from '../layout';
import { TOWER_Y } from '../walk';
import type { Act } from './types';
import { Spring, UP, ease, fwdOf, hold, jpos, rightOf, wpos } from './util';

const VERSE = ['闻钟声', '烦恼轻', '智慧长', '菩提生', '离地狱', '出火坑', '愿成佛', '度众生'];

// —— 撞钟 ——
export function createBell(k: Kongshan): Act {
  const bell = k.parts.bell, log = k.parts.log;
  const R = log.userData.radius as number, yc = (log.userData.head as THREE.Vector3).y, SZ = log.scale.z;
  /** 摆长（吊点到木心）；撞木的摆角 a：负为往后引开，HIT 处碰到钟 */
  const Lp = -yc, G = 9.8 / Lp, HIT = Math.asin(0.04 / Lp), PULL = 0.5, MAX = Math.asin(PULL / Lp);
  const VMAX = Math.sqrt(2 * G * (1 - Math.cos(MAX)));
  // 两手扶在木头的中段偏后：左手近钟、右手近尾（人在木的西侧，面朝东）。都是撞木自己的坐标
  const MID = 0.12;
  const gl = new THREE.Vector3(-R * 0.55, yc + R * 0.84, (MID - 0.13) / SZ), gr = new THREE.Vector3(-R * 0.55, yc + R * 0.84, (MID + 0.13) / SZ), gm = new THREE.Vector3(0, yc, MID / SZ);
  const spot = { x: log.position.x - 0.46, z: log.position.z + MID + PULL * 0.4, yaw: Math.PI / 2, zone: 'bell' as const };
  const strike = wpos(bell, (bell.userData.strike as THREE.Vector3).clone());
  // 机位：楼上东南角，隔着撞木看人与钟；身后是敞开的西面，望得见院子
  const pose = { pos: new THREE.Vector3(L.bell.x + 1.78, TOWER_Y + 1.7, L.bell.z + 2.0), look: new THREE.Vector3(L.bell.x - 0.28, TOWER_Y + 1.13, L.bell.z + 0.98), fov: 54, yaw: 26, up: 16, down: 12 };
  const base = pose.pos.clone();
  const state: Record<string, unknown> = {};
  let a = 0, v = 0, grab = false, pull = 0, auto = 0, t0 = 0, n = 0, total = 0, armed = false, quiet = 0, active = false;
  const sway = new Spring(0, 5.5, 0.08), kick = new Spring(0, 14, 0.5);
  const sync = () => { state.count = n ? `第${cn(n)}声` : ''; state.hint = n === 0 ? '按住，把撞木往后引；松手' : VERSE[(n - 1) % 8]; k.emitAct(); };
  // 撞木一直按摆来算（人走开了它也自己荡到停）
  k.world.tick.push((dt) => {
    if (!active && Math.abs(a) < 1e-4 && Math.abs(v) < 1e-4 && Math.abs(sway.x) < 1e-4 && Math.abs(sway.v) < 1e-4) return;
    const steps = Math.max(1, Math.ceil(dt / 0.006)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      if (grab || auto > 0) {
        if (grab) pull = Math.min(1, pull + h * 0.72);
        const goal = -(grab ? pull : auto) * MAX;
        v = (goal - a) * 9; a += v * h;
        // 轻点一下：自己引开一小段，随即松手
        if (!grab && a <= goal * 0.94) { auto = 0; armed = true; v = 0; }
        continue;
      }
      v += (-G * Math.sin(a) - (quiet > 0 || !active ? 4.5 : 0.25) * v) * h;
      a += v * h;
      if (a >= HIT && v > 0) {
        const s = Math.min(1, v / VMAX);
        a = HIT; v = -v * 0.22;
        if (s > 0.12 && armed) {
          armed = false; n++; total++; quiet = 3.5;
          k.sfx('bell', { vel: 0.35 + 0.65 * s, space: 'open' }); k.buzz([30, 30, 60]);
          sway.v += 0.09 * s; kick.v += 0.05 * s;
          if (s > 0.3) k.ambient.startle(new THREE.Vector3(L.bell.x + 16, 9, L.bell.z - 6), Math.round(5 + 7 * s));
          sync();
        }
      }
    }
    quiet = Math.max(0, quiet - dt);
    // 绕两根吊绳的上端摆：正角朝钟（−z），负角是往后引开
    log.rotation.x = a;
    bell.rotation.x = sway.step(0, dt) * 0.25;
  });
  // 手又搭上去引木：上一声之后「稳住撞木」的那段阻尼就不要了（不然紧接着的一下撞不响）
  const press = () => { if (!active || grab) return; grab = true; armed = false; auto = 0; quiet = 0; pull = Math.max(0, -a / MAX); t0 = performance.now(); };
  const release = () => {
    if (!grab) return;
    grab = false;
    if (performance.now() - t0 < 260 && pull < 0.42) auto = 0.42; else armed = a < -MAX * 0.16;
  };
  const key = (e: KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); if (e.type === 'keydown') { if (!e.repeat) press(); } else release(); } };
  const pl = new THREE.Vector3(), pr = new THREE.Vector3(), pm = new THREE.Vector3();
  const dirF = new THREE.Vector3(0.84, 0.55, 0).normalize(), palm = new THREE.Vector3(0.55, -0.84, 0).normalize();
  return {
    id: 'bell', name: '撞钟', anchor: new THREE.Vector3(log.position.x, TOWER_Y + 1.5, log.position.z + 0.2), spot, state, noZoom: true, dynamicShadow: true,
    enter() {
      active = true; n = 0; total = 0; grab = false; auto = 0;
      const av = k.player.av;
      av.setHands('free', 0.4); av.lookAt(strike);
      k.nav.setPose(pose, 1.9);
      window.addEventListener('keydown', key); window.addEventListener('keyup', key);
      sync();
    },
    exit() {
      active = false; grab = false; auto = 0;
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', key);
      if (total > 0) k.log({ kind: 'bell', n: total });
    },
    input: { down: () => press(), up: () => release(), move: () => true, tap: () => true },
    update(dt) {
      if (!active) return;
      const p = k.player, av = p.av;
      wpos(log, pl.copy(gl)); wpos(log, pr.copy(gr)); wpos(log, pm.copy(gm));
      // 身子跟着木头转过去一些，余下的由两臂去够
      p.faceTo = Math.PI / 2 + 0.7 * (Math.atan2(pm.x - p.pos.x, pm.z - p.pos.z) - Math.PI / 2);
      av.reach('L', pl, { dir: dirF, palm, rate: 22 });
      av.reach('R', pr, { dir: dirF, palm, rate: 22 });
      // 钟响那一下，镜头也跟着一震
      pose.pos.copy(base).y += kick.step(0, dt) * 0.2;
    },
  };
}

// —— 击鼓 ——
export function createDrum(k: Kongshan): Act {
  const drum = k.parts.drum, skin = drum.userData.skin as THREE.Object3D, sticks = drum.userData.sticks as THREE.Object3D[];
  drum.updateMatrixWorld(true);
  const center = wpos(drum, (drum.userData.center as THREE.Vector3).clone()), R = drum.userData.radius as number;
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(drum.matrixWorld);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center);
  // 人立在鼓面前七十多厘米处，面朝鼓
  const yaw = Math.atan2(-normal.x, -normal.z), AWAY = 0.74, LEN = 0.475;
  const spot = { x: center.x + normal.x * AWAY, z: center.z + normal.z * AWAY, yaw, zone: 'drum' as const };
  const f = fwdOf(yaw), r = rightOf(yaw);
  // 机位：从人的左后方斜看鼓面（鼓面朝东，机位在楼上东南）
  const pose = {
    pos: center.clone().addScaledVector(normal, 1.85).addScaledVector(r, -1.5).setY(TOWER_Y + 1.9),
    look: center.clone().addScaledVector(normal, 0.1).addScaledVector(r, 0.06).setY(TOWER_Y + 1.34), fov: 56, yaw: 20, up: 14, down: 12,
  };
  const state: Record<string, unknown> = {};
  const pulse = new Spring(0, 60, 0.12);
  const swing = [1, 1], target = [center.clone(), center.clone()], rest = [0, 1].map((i) => center.clone().addScaledVector(normal, 0.2).addScaledVector(UP, -0.42).addScaledVector(r, i ? 0.2 : -0.2));
  let n = 0, total = 0, last = 0, active = false, back: Array<() => void> = [];
  const sync = () => { state.count = n ? `${cn(n)}声` : ''; state.hint = n === 0 ? '点鼓面。鼓心沉，鼓边亮' : ''; k.emitAct(); };
  const hitAt = new THREE.Vector3(), tmp = new THREE.Vector3(), head = new THREE.Vector3(), sh = new THREE.Vector3(), dir = new THREE.Vector3(), tgt = new THREE.Vector3();
  const strikeAt = (p: THREE.Vector3) => {
    if (!active) return;
    const d = p.distanceTo(center) / R;
    if (d > 1.22) return;
    // 偏左的用左手、偏右的用右手；落在中间就两手轮着来
    const side = tmp.subVectors(p, center).dot(r) / R;
    const hand = Math.abs(side) < 0.22 ? 1 - last : side > 0 ? 1 : 0;
    if (swing[hand] < 0.5) return;
    last = hand; swing[hand] = 0; target[hand].copy(p);
    window.setTimeout(() => {
      if (!active) return;
      if (d > 0.97) k.sfx('drumrim', { vel: 0.7, space: 'open' });
      else { k.sfx('drum', { vel: 0.95 - 0.35 * d, pitch: 1 + 0.22 * d * d, space: 'open' }); pulse.v -= 2.4 * (1 - 0.5 * d); }
      k.buzz(d > 0.97 ? 8 : 22);
      n++; total++; sync();
    }, 70);
  };
  const key = (e: KeyboardEvent) => {
    if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat) return;
    e.preventDefault();
    const an = Math.random() * 6.283, rad = Math.random() * 0.34 * R;
    strikeAt(hitAt.copy(center).addScaledVector(r, Math.cos(an) * rad).addScaledVector(UP, Math.sin(an) * rad));
  };
  return {
    id: 'drum', name: '击鼓', anchor: center.clone().addScaledVector(normal, 0.3).setY(TOWER_Y + 1.55), spot, state, noZoom: true, dynamicShadow: true,
    enter() {
      active = true; n = 0; total = 0; swing[0] = swing[1] = 1;
      const av = k.player.av;
      av.setHands('free', 0.4); av.lookAt(center);
      back = [hold(sticks[0], av.joints.handL), hold(sticks[1], av.joints.handR)];
      k.nav.setPose(pose, 1.9);
      window.addEventListener('keydown', key);
      sync();
    },
    exit() {
      active = false;
      window.removeEventListener('keydown', key);
      back.forEach((b) => b()); back = [];
      skin.scale.set(1, 1, 1);
      if (total > 0) k.log({ kind: 'drum', n: total });
    },
    input: {
      down: (p) => { const ray = k.world.ray(p.nx, p.ny).ray; if (ray.intersectPlane(plane, hitAt)) strikeAt(hitAt); },
      move: () => true, tap: () => true,
    },
    update(dt) {
      if (!active) return;
      const av = k.player.av, pv = pulse.step(0, dt);
      skin.scale.set(1 + pv * 0.01, 1 + pv * 0.01, 1);
      const chest = jpos(av.joints.chest, tmp);
      for (let i = 0; i < 2; i++) {
        swing[i] = Math.min(1, swing[i] + dt / 0.4);
        // 0→0.16 落槌，在鼓面上停一瞬（到 0.3），之后收回；槌头落在点到的地方
        const w = swing[i] < 0.16 ? ease(swing[i] / 0.16) : swing[i] < 0.3 ? 1 : 1 - ease((swing[i] - 0.3) / 0.7);
        head.copy(target[i]).addScaledVector(normal, 0.035).sub(rest[i]).multiplyScalar(w * w).add(rest[i]);
        // 槌从握处指向槌头：顺着肩到槌头的方向；歇着时槌头再翘起一些
        sh.copy(chest).addScaledVector(r, i ? 0.17 : -0.17).addScaledVector(UP, 0.1);
        dir.subVectors(head, sh).normalize().addScaledVector(UP, 0.4 * (1 - w)).normalize();
        tgt.copy(head).addScaledVector(dir, -LEN);
        av.reach(i ? 'R' : 'L', tgt, { dir, rate: swing[i] < 0.32 ? 90 : 22 });
      }
      void f;
    },
  };
}
