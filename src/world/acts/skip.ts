/**
 * 打水漂（渡口西边的河滩上，伊水边）：弯腰拣一块扁石，侧过身，贴着水面甩出去，数它在水上点了几下。
 *   三步：拣石——看是扁是圆；定角——表上的针来回走，落在「贴着水面」那一段时按下；使劲——按住蓄劲，到合适的那一段松手。
 *   角越平、石越扁、劲越足，漂得越多；角一陡就「咚」地一声沉下去了。
 *   每点一下水，水上荡开一圈。
 * 石子与水纹在 play/ripples.ts 与这里。记（mem 'play' 的 skip）：甩过几块、最多漂几下、最远多少步。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { RIVER_Y, SITE, ground } from '../site';
import { groundAt, waterDepth } from '../walk';
import type { Act } from './types';
import { Rings } from '../play/ripples';
import { flatRock } from '../build/kit';
import { V, cnNum, mats, onFrame, playGet, playSet, sfx, stateOf } from '../play/kit';
import { report } from '../play/board';

const G = 9.8;
export function create(k: Anlewo): Act | null {
  const fa = k.build?.anchors.ferry;
  if (!fa) return null;
  const { state, set, put, flush } = stateOf(k);
  const F = SITE.ferry, jy = fa.rotation.y - Math.PI;
  // 甩石的地方：栈桥头上（河滩上能走到的水边只有渡口这一小段），斜着朝西南的开阔水面甩——
  // 正前方泊着渡船、东边是渔父的船，都避开
  const W = (lx: number, lz: number) => V(F.x + lx * Math.cos(jy) + lz * Math.sin(jy), 0, F.z - lx * Math.sin(jy) + lz * Math.cos(jy));
  let L = 4;
  while (L < 11 && ground(W(0, L).x, W(0, L).z) > RIVER_Y - 0.3) L += 0.25;
  const at = W(-0.22, L - 0.4);
  const outDir = W(-0.59, 0.81).sub(W(0, 0)).normalize();
  const gy0 = groundAt(at.x, at.z);
  if (gy0 == null) return null;
  const gy: number = gy0;
  const right = V(-outDir.z, 0, outDir.x);   // 面朝水时的右手边
  const rings = new Rings(16);
  const stoneGeo = flatRock(9301, 0.045, 0.014, 0.035, 1, 0.9);
  const stone = new THREE.Mesh(stoneGeo, mats().stone);
  stone.name = 'play:skipstone';
  stone.visible = false;
  k.world.scene.add(rings.mesh, stone);

  type Phase = 'pick' | 'angle' | 'power' | 'fly' | 'sunk' | 'off';
  let phase: Phase = 'off', t = 0, flat = 0.8, ang = 0, angV = 0, power = 0, chT = 0, skips = 0, dist = 0, spin = 0, lastSkip = '';
  const sp = V(), sv = V(), start = V(), tmp = V();
  const steps = ['拣石', '定角', '使劲'];
  const keys = [{ key: '空格', label: '按下 / 按住' }];
  /** 角度：表的 0…1 对着出手的仰角（度）0…40 */
  const deg = (v: number) => v * 40;
  const pick = () => {
    phase = 'pick'; t = 0;
    set({ title: '打水漂', hint: '河滩上的石子，扁的漂得远', steps, step: 0, choices: [{ id: 'pick', label: '弯腰拣一块', main: true }, { id: 'done', label: '罢' }] });
  };

  const act: Act = {
    id: 'skip', name: '打水漂', anchor: V(at.x, gy + 1.0, at.z).addScaledVector(outDir, 1.2), spot: { x: at.x, z: at.z, yaw: Math.atan2(outDir.x, outDir.z) }, radius: 2.6, state, noZoom: true,
    enter() {
      k.player.av.setHands('free');
      // 镜头：身后偏右，低低地看出去，看得见一路点过去的水
      k.nav.setPose({ pos: V(at.x, gy + 1.65, at.z).addScaledVector(outDir, -3.2).addScaledVector(right, 1.3), look: V(at.x, RIVER_Y + 0.8, at.z).addScaledVector(outDir, 16), fov: 46, yaw: 16, up: 8, down: 8 }, 1.5);
      pick();
    },
    exit() {
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.lookAt(null); av.bow = 0;
      stone.visible = false; phase = 'off';
    },
    update(dt) {
      t += dt; flush();
      const av = k.player.av;
      if (phase === 'angle') {
        // 针来回走：慢一点，好按
        ang += angV * dt;
        if (ang > 1) { ang = 1; angV = -angV; } else if (ang < 0) { ang = 0; angV = -angV; }
        put({ meter: { v: ang, lo: 0.18, hi: 0.4, label: '角' } });
      } else if (phase === 'power') {
        chT += dt;
        const T = 0.85, u = (chT % (2 * T)) / T;
        power = u < 1 ? 0.5 - 0.5 * Math.cos(Math.PI * u) : 0.5 + 0.5 * Math.cos(Math.PI * (u - 1));
        put({ meter: { v: power, lo: 0.72, hi: 0.96, label: '劲' }, hold: { id: 'go', label: '甩', v: power } });
      }
      // 手：拣石时弯腰去够地上；定角、使劲时右手往后侧拉开；甩出去时往前一扫
      if (phase === 'pick' && t < 1.6 && state.picking) {
        av.bow = 0.55 * Math.sin(Math.PI * Math.min(1, t / 1.6));
        av.reach('R', tmp.set(at.x, gy + 0.05, at.z).addScaledVector(outDir, 0.35).addScaledVector(right, 0.2), { rate: 8 });
        if (t > 1.5) { state.picking = false; av.bow = 0; startAngle(); }
      } else if (phase === 'angle' || phase === 'power') {
        const back = phase === 'power' ? power : 0.2;
        av.reach('R', tmp.set(at.x, gy + 0.74 - 0.08 * back, at.z).addScaledVector(right, 0.45).addScaledVector(outDir, -0.15 - 0.25 * back), { rate: 10 });
        av.bow = 0.26 + 0.14 * back;
      } else if (phase === 'fly' && t < 0.4) {
        av.reach('R', tmp.set(at.x, gy + 0.66, at.z).addScaledVector(right, -0.1).addScaledVector(outDir, 0.55), { rate: 18 });
        av.bow = 0.2;
      } else { av.reach('R', null); av.bow = Math.max(0, av.bow - dt); }
      av.lookAt(tmp.set(at.x, RIVER_Y + 0.5, at.z).addScaledVector(outDir, 10));
    },
    input: { tap: () => { if (phase === 'angle') lockAngle(); return true; } },
    cmd(c, arg) {
      if (c === 'pick' && phase === 'pick') {
        flat = 0.55 + Math.random() * 0.45; t = 0; state.picking = true;
        set({ title: '打水漂', hint: '弯腰拣石……', steps, step: 0, picking: true });
      } else if (c === 'go') {
        if (phase === 'angle' && arg === 'down') lockAngle();
        else if (phase === 'power' && arg === 'down') { chT = 0; power = 0; state.charging = true; }
        else if (phase === 'power' && arg === 'up' && state.charging) throwIt();
      } else if (c === 'again') pick();
      else if (c === 'done') k.exitAct();
    },
  };

  function startAngle() {
    phase = 'angle'; ang = 0.65; angV = -0.75;
    stone.visible = true;
    const word = flat > 0.85 ? '这块又扁又薄，好石头' : flat > 0.7 ? '这块还算扁' : '这块有点圆，不大好漂';
    set({ title: '打水漂', hint: `${word}。针走到「贴着水面」那一段时按下`, steps, step: 1, meter: { v: ang, lo: 0.18, hi: 0.4, label: '角' }, hold: { id: 'go', label: '定' }, keys, choices: [{ id: 'done', label: '罢' }] });
  }
  function lockAngle() {
    phase = 'power'; power = 0; chT = 0; state.charging = false;
    const d = deg(ang);
    set({ title: '打水漂', hint: d < 7 ? '平得贴着水皮。按住蓄劲，松手甩' : d < 17 ? '角正好。按住蓄劲，松手甩' : '有点陡了。按住蓄劲，松手甩', steps, step: 2, meter: { v: 0, lo: 0.72, hi: 0.96, label: '劲' }, hold: { id: 'go', label: '甩', v: 0 }, keys, choices: [{ id: 'done', label: '罢' }] });
  }
  function throwIt() {
    phase = 'fly'; t = 0; skips = 0; dist = 0; lastSkip = '';
    const a = (deg(ang) * Math.PI) / 180, v = 6 + 12 * power;
    // 侧身矮着甩：出手低（栈桥离水一人来高，出手越低越贴水面）
    start.set(at.x, gy + 0.6, at.z).addScaledVector(right, 0.24).addScaledVector(outDir, 0.4);
    sp.copy(start);
    sv.copy(outDir).multiplyScalar(v * Math.cos(a)).addScaledVector(right, (Math.random() - 0.5) * 0.6).setY(v * Math.sin(a) - 0.3);
    spin = 30 + 20 * power;
    sfx(k, 'toss', { vel: 0.4 + 0.3 * power });
    set({ title: '打水漂', hint: '', steps, step: 3 });
  }
  function done(sank: boolean) {
    phase = 'sunk';
    const steps2 = Math.round(dist / 0.75);
    const r = playGet<{ n?: number; best?: number; far?: number }>(k, 'skip', {});
    const better = skips > (r.best ?? 0);
    playSet(k, 'skip', { ...r, n: (r.n ?? 0) + 1, best: Math.max(r.best ?? 0, skips), far: Math.max(r.far ?? 0, Math.round(dist)) });
    k.log({ kind: 'play', text: skips ? `打水漂，漂了${cnNum(skips)}下` : '打水漂，一下就沉了' });
    // 漂了几下上榜
    if (skips > 0) report(k, 'skip', skips);
    if (better && (r.best ?? 0) > 0) k.note(`漂了${cnNum(skips)}下，比以往都多`);
    const text = skips === 0 ? '「咚」的一声，直直地沉下去了。' : `漂了${cnNum(skips)}下，${sank ? '最后' : ''}在${cnNum(Math.max(1, steps2))}步开外沉下去。`;
    set({ title: '打水漂', text, count: skips, choices: [{ id: 'again', label: '再拣一块' }, { id: 'done', label: '罢' }], done: skips > 0 });
  }

  onFrame(k, 'skip', (dt) => {
    rings.update();
    if (act !== k.act || phase === 'off') return;
    const av = k.player.av;
    if (phase === 'angle' || phase === 'power' || (phase === 'pick' && state.picking && t > 0.9)) {
      av.joints.handR.getWorldPosition(stone.position);
      stone.visible = true;
    } else if (phase === 'fly') {
      const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
      for (let i = 0; i < n && phase === 'fly'; i++) {
        sv.y -= G * h; sp.addScaledVector(sv, h);
        if (sp.y <= RIVER_Y + 0.01 && sv.y < 0) {
          const deep = waterDepth(sp.x, sp.z) > 0.05, hs = Math.hypot(sv.x, sv.z), inc = Math.atan2(-sv.y, hs);
          dist = Math.hypot(sp.x - start.x, sp.z - start.z);
          if (!deep) {
            // 落在岸上（甩歪了）
            sp.y = (groundAt(sp.x, sp.z) ?? ground(sp.x, sp.z)) + 0.01; sfx(k, 'arrowLand', { vel: 0.3, x: sp.x, z: sp.z }); done(false); break;
          }
          // 角平、劲足、石扁就弹起来；不然沉下去
          const ok = inc < (0.3 + 0.1 * flat) && hs > 2.6 && skips < 24;
          if (ok) {
            skips++;
            sv.y = -sv.y * (0.5 + 0.22 * flat);
            const loss = 0.73 + 0.13 * flat - 0.015 * skips * (1 - flat);
            sv.x *= loss; sv.z *= loss;
            sp.y = RIVER_Y + 0.011;
            rings.add(sp.x, RIVER_Y, sp.z, 0.45 + 0.25 * Math.min(1, hs / 8), 0.55);
            sfx(k, 'skip', { vel: 0.35 + 0.35 * Math.min(1, hs / 10), pitch: Math.min(6, skips * 0.5) });
            lastSkip = `${cnNum(skips)}！`;
            put({ hint: lastSkip, count: skips }, true);
          } else {
            rings.add(sp.x, RIVER_Y, sp.z, 0.9, 0.5);
            sfx(k, 'plop', { vel: 0.45 });
            stone.visible = false;
            done(true);
          }
        }
      }
      stone.position.copy(sp);
      stone.rotation.y += spin * dt;
    }
  });
  return act;
}
