/**
 * 静坐：在云台的亭子里，朝东，面前是云海与远山。
 *   行者在蒲团上盘腿坐下，两手叠放膝上。镜头退到他身后：一个小小的人，对着一片云海。
 *   计时的是一炷香——插在前面的小炉里，按选定的时长一点点烧短；三声引磬起，香尽一声止。
 *   坐着的时候界面全部收起，只剩山、雾、那一缕烟（和可选的一圈呼吸）。点一下画面，可以随时起身。
 * 「一炷香」在丛林里并没有固定的长短（由看香的人按冬夏调度），这里的五分、十分、一刻是本应用自己的设定。
 */
import * as THREE from 'three';
import type { Kongshan } from '../Kongshan';
import { enhance } from '../core/mats';
import { Smoke } from '../fx/smoke';
import type { Act } from './types';
import { SEAT, ZAFU, ZAFU_BACK, behind } from './util';

export function createSit(k: Kongshan): Act {
  const seat = k.parts.seat.sit, holder = k.parts.holder;
  holder.updateMatrixWorld(true);
  const base = new THREE.Vector3(0, holder.userData.ashY as number, 0).applyMatrix4(holder.matrixWorld);
  const LEN = 0.2;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0017, 0.0017, 1, 6).translate(0, 0.5, 0), enhance(new THREE.MeshStandardMaterial({ color: 0x5c4a36, roughness: 0.9 })));
  stick.position.copy(base); stick.scale.set(1, LEN, 1); stick.visible = false; stick.castShadow = true;
  k.world.scene.add(stick);
  const tip = base.clone().setY(base.y + LEN);
  const ember = k.flames.add(tip, 0.011, { ember: true, halo: 0.12, on: false });
  const smoke = k.addSmoke(new Smoke([tip], { points: 60, rise: 0.25, w1: 0.1, alpha: 0.62, curl: 0.07 }));
  smoke.strength = 0;

  // 机位：人的右后方、略高。人在画面左下，前面是香炉、亭柱之间的云海
  const pose = { pos: new THREE.Vector3(seat.x - 2.7, seat.y + 1.42, seat.z + 1.15), look: new THREE.Vector3(seat.x + 26, seat.y - 4.6, seat.z - 2.4), fov: 50, yaw: 60, up: 30, down: 24 };
  const far = new THREE.Vector3(seat.x + 60, seat.y + 1.5, seat.z);
  const state: Record<string, unknown> = { phase: 'choose' };
  let minutes = 10, t0 = 0, elapsed = 0, timers: number[] = [];
  const set = (p: Record<string, unknown>) => { Object.assign(state, p); k.emitAct(); };
  const clear = () => { timers.forEach((t) => clearTimeout(t)); timers = []; };
  const burn = (frac: number) => {
    const h = Math.max(0.012, LEN * (1 - frac));
    stick.scale.y = h; tip.y = base.y + h;
    k.flames.move(ember, tip);
  };
  const finish = (full: boolean) => {
    if (state.phase !== 'sitting' && state.phase !== 'opening') return;
    clear();
    k.sfx('chime', { vel: 0.6, space: 'open' });
    k.flames.set(ember, false); smoke.strength = 0;
    k.world.fpsCap = 0;
    const mins = elapsed / 60;
    if (mins >= 0.5) k.log({ kind: 'sit', minutes: Math.max(1, Math.round(mins)) });
    set({ phase: 'done', full });
  };

  const act: Act = {
    id: 'sit', name: '静坐', anchor: new THREE.Vector3(seat.x, seat.y + 0.7, seat.z), spot: behind(seat, Math.PI / 2, ZAFU_BACK), radius: 2.2, state,
    enter() {
      const av = k.player.av;
      av.setSeat?.(ZAFU);
      av.setPose('sit', 1.5); av.setHands('lap', 1.2); av.lookAt(far);
      k.player.slideTo(seat.x, seat.z, 1.4); k.player.lift = SEAT;
      k.nav.setPose(pose, 2.4);
      stick.visible = true; burn(0); elapsed = 0;
      set({ phase: 'choose', peekAt: 0, full: false });
    },
    exit() {
      if (state.phase === 'sitting' || state.phase === 'opening') finish(false);
      clear();
      stick.visible = false; k.flames.set(ember, false); smoke.strength = 0;
      k.world.fpsCap = 0;
      state.phase = 'choose';
    },
    cmd(name, arg) {
      if (name === 'start' && state.phase === 'choose') {
        minutes = Number(arg) || 0; elapsed = 0;
        burn(0); k.flames.set(ember, true); smoke.strength = 1;
        k.sfx('ignite', { vel: 0.5, space: 'near' });
        // 止静：垂目
        k.player.av.lookAt(null);
        // 三声引磬，止静
        for (let i = 0; i < 3; i++) timers.push(window.setTimeout(() => k.sfx('chime', { vel: 0.62 - i * 0.06, space: 'open' }), 900 + i * 2300));
        timers.push(window.setTimeout(() => { t0 = performance.now(); k.world.fpsCap = 30; set({ phase: 'sitting' }); }, 900 + 3 * 2300));
        set({ phase: 'opening' });
      } else if (name === 'stop') finish(false);
    },
    input: {
      tap: () => { if (state.phase === 'sitting' || state.phase === 'opening') set({ peekAt: performance.now() }); return true; },
    },
    update() {
      if (state.phase !== 'sitting') return;
      elapsed = (performance.now() - t0) / 1000;
      if (minutes > 0) {
        const f = elapsed / (minutes * 60);
        burn(Math.min(1, f));
        if (f >= 1) finish(true);
      } else burn((elapsed % 1800) / 1800 * 0.92);   // 不计时：半个钟头烧一支，烧完自己续上
    },
  };
  return act;
}
