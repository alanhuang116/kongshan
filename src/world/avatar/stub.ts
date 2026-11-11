/**
 * 替身：小人的正式模型没备好（或出了错）时用的一个最简的人形——一根袍子似的锥、一个头。
 * 接口齐全，动作从简；有了它，行走、镜头、各项活动都能照常跑。
 */
import * as THREE from 'three';
import { enhance, type Mats } from '../core/mats';
import type { Avatar, HandsName, PoseName, Side } from './types';

export function createStubAvatar(mats: Mats): Avatar {
  const root = new THREE.Group();
  root.name = 'avatar-stub';
  const robe = enhance(new THREE.MeshStandardMaterial({ color: 0x8f969a, roughness: 0.95 }));
  const skin = enhance(new THREE.MeshStandardMaterial({ color: 0xd9b99b, roughness: 0.8 }));
  void mats;
  const hips = new THREE.Group(), chest = new THREE.Group(), head = new THREE.Group();
  const handL = new THREE.Group(), handR = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.3, 0], [0.26, 0.5], [0.19, 0.95], [0.21, 1.25], [0.08, 1.36]].map(([x, y]) => new THREE.Vector2(x, y)), 16), robe);
  body.castShadow = true;
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin);
  hd.castShadow = true;
  head.position.set(0, 1.47, 0); head.add(hd);
  chest.position.set(0, 1.15, 0); hips.position.set(0, 0.85, 0);
  handL.position.set(0.24, 0.85, 0.08); handR.position.set(-0.24, 0.85, 0.08);
  root.add(body, hips, chest, head, handL, handR);
  let pose: PoseName = 'stand', k = 1, kGoal = 1, bowNow = 0, phase = 0;
  const H: Record<PoseName, number> = { stand: 1, kneel: 0.62, sit: 0.55, crouch: 0.6 };
  const rest = { L: handL.position.clone(), R: handR.position.clone() };
  const goal: Record<Side, THREE.Vector3 | null> = { L: null, R: null };
  const tmp = new THREE.Vector3();
  const av: Avatar = {
    root, height: 1.58, eyeY: 1.47,
    joints: { hips, chest, head, handL, handR },
    get pose() { return pose; },
    setPose(p) { pose = p; kGoal = H[p]; },
    setHands(_h: HandsName) { /* 替身没有手 */ },
    bow: 0,
    reach(side, target) { goal[side] = target ? target.clone() : null; },
    lookAt() { /* 替身不转头 */ },
    onStep: null,
    update(dt, _t, move) {
      k += (kGoal - k) * Math.min(1, dt * 5);
      bowNow += (av.bow - bowNow) * Math.min(1, dt * 6);
      body.scale.set(1 + (1 - k) * 0.5, k, 1 + (1 - k) * 0.5);
      body.rotation.x = bowNow * (pose === 'kneel' ? 1.1 : 0.7);
      head.position.set(0, 1.47 * k * Math.cos(bowNow * 1.0), 0.6 * bowNow * k);
      chest.position.y = 1.15 * k; hips.position.y = 0.85 * k;
      for (const s of ['L', 'R'] as const) {
        const h = s === 'L' ? handL : handR, g = goal[s];
        if (g) h.position.lerp(root.worldToLocal(tmp.copy(g)), Math.min(1, dt * 10));
        else h.position.lerp(tmp.copy(rest[s]).setY(rest[s].y * k), Math.min(1, dt * 8));
      }
      if (move.speed > 0.05) {
        const before = Math.floor(phase);
        phase += (move.speed / 0.62) * dt;
        if (Math.floor(phase) !== before) av.onStep?.(Math.floor(phase) % 2 ? 'L' : 'R');
        body.position.y = Math.abs(Math.sin(phase * Math.PI)) * 0.02;
      } else body.position.y *= 0.8;
    },
    setVisible(v) { root.visible = v; },
    dispose() { root.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); }); },
  };
  return av;
}
