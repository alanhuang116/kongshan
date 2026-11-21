/**
 * 亭角的风铃（观物亭西南角的檐下）：一只小铜铃，铃舌下面坠一片风摆。风起时它自己晃、自己响，风越大响得越勤；
 * 走到底下抬手拨一拨风摆，它也「叮——」地一声。
 * 铃的样子在这里（一张网：铃身、铃舌、风摆、挂绳）；铃与风摆是两节摆，铃舌碰到铃壁才响。
 * 记（mem 'play' 的 chime）：拨过几回。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { lathe, merge } from '../core/geo';
import { INK, dye, pole, v3 } from '../build/kit';
import { SITE, ground } from '../site';
import type { Act } from './types';
import { PAIRS } from './lib';
import { V, camFar, clamp, inkGeo, mats, onFrame, playGet, playSet, sfx, stateOf } from '../play/kit';

export function create(k: Anlewo): Act | null {
  const { state, set, flush } = stateOf(k);
  const P = SITE.pavilion, g0 = ground(P.x, P.z), e = P.half - 0.16;
  // 西南角檐下：挂绳顶、铃心
  const top = V(P.x - e - 0.42, g0 + P.floor + 1.76, P.z + e + 0.42);
  const bronze: [number, number, number] = [0.66, 0.62, 0.54];
  // 铃（原点在挂绳顶）：绳、铃身（口朝下）
  const bellG = merge([
    dye(pole(v3(0, 0, 0), v3(0, -0.2, 0), 0.0035, 0.0035, 4), INK.hemp, 1.6),
    dye(lathe([[0.001, -0.2], [0.016, -0.2], [0.03, -0.225], [0.042, -0.27], [0.05, -0.31], [0.046, -0.312], [0.038, -0.29], [0.026, -0.245], [0.012, -0.215], [0.001, -0.212]], 12), bronze, 2.1),
  ]);
  // 铃舌与风摆（原点在铃里的挂点）：一截细绳、一颗舌、再一截绳、一片竖着的风摆
  const tabG = merge([
    dye(pole(v3(0, 0, 0), v3(0, -0.1, 0), 0.002, 0.002, 3), INK.hemp, 1.5),
    dye(lathe([[0.001, -0.075], [0.01, -0.08], [0.012, -0.09], [0.008, -0.1], [0.001, -0.102]], 6), bronze, 2.4),
    dye(pole(v3(0, -0.1, 0), v3(0, -0.2, 0), 0.0018, 0.0018, 3), INK.hemp, 1.5),
    dye(inkGeo(new THREE.BoxGeometry(0.075, 0.11, 0.004).translate(0, -0.26, 0)), [0.9, 0.86, 0.76], 1.3),
  ]);
  const bell = new THREE.Mesh(bellG, mats().obj), tab = new THREE.Mesh(tabG, mats().obj);
  bell.name = 'play:chime'; tab.name = 'play:chimeTab';
  bell.position.copy(top); tab.position.set(0, -0.21, 0);
  bell.add(tab);
  k.world.scene.add(bell);

  // —— 两节摆：铃（绕挂绳顶）、风摆（绕铃里的挂点）；各两个方向 ——
  const B = { ax: 0, az: 0, vx: 0, vz: 0 }, Tb = { ax: 0, az: 0, vx: 0, vz: 0 };
  let ringT = 0, flicks = 0, phase: 'look' | 'off' = 'off', t = 0, reachT = 9;
  const ring = (v: number) => { if (ringT > 0.75) { ringT = 0; sfx(k, 'eaveBell', { vel: clamp(v, 0.15, 0.85), pitch: (Math.random() - 0.5) * 0.6, x: top.x, z: top.z }); } };
  const flick = () => { Tb.vx += 3.2 + Math.random(); Tb.vz += (Math.random() - 0.5) * 2; B.vx += 0.6; reachT = 0; flicks++; };

  const act: Act = {
    id: 'chime', name: '风铃', anchor: top.clone().add(V(0, -0.1, 0)), spot: { x: top.x + 0.45, z: top.z + 0.55, yaw: Math.atan2(-0.45, -0.55) }, radius: 2.0, state, noZoom: true,
    enter() {
      phase = 'look'; t = 0; flicks = 0;
      k.player.av.setHands('free'); k.player.av.lookAt(top.clone().add(V(0, -0.3, 0)));
      k.nav.setPose({ pos: top.clone().add(V(2.4, -0.85, 2.7)), look: top.clone().add(V(-0.1, -0.75, 0)), fov: 46, yaw: 16, up: 10, down: 8 }, 1.4);
      set({ title: '风铃', hint: '风起时它自己会响。点画面，抬手拨一拨', choices: [{ id: 'done', label: '罢' }] });
      setTimeout(() => { if (phase === 'look') flick(); }, 900);
    },
    exit() { const av = k.player.av; av.reach('R', null); av.lookAt(null); phase = 'off'; if (flicks) { const r = playGet<{ n?: number }>(k, 'chime', {}); playSet(k, 'chime', { ...r, n: (r.n ?? 0) + 1 }); } },
    update(dt) {
      t += dt; flush();
      reachT += dt;
      const av = k.player.av;
      // 抬手：拨的那一下手伸到风摆上，随即放下
      if (reachT < 0.6) av.reach('R', tab.getWorldPosition(V()).add(V(0.03, -0.05, 0.05)), { rate: 12 });
      else av.reach('R', null);
      if (flicks === 3 && state.lines == null) {
        const p = PAIRS.find((x) => x.id === 'c39');
        k.log({ kind: 'play', text: '在亭角拨了拨风铃' });
        set({ title: '风铃', lines: p ? [p.a, p.b] : undefined, source: p ? `邵雍《${p.from}》` : undefined, text: p ? undefined : '叮——', choices: [{ id: 'done', label: '罢' }] });
      }
    },
    input: { tap: () => { flick(); return true; } },
    cmd(c) { if (c === 'done') k.exitAct(); },
  };

  // —— 每帧：风吹着晃，铃舌碰着铃壁就响 ——
  onFrame(k, 'chime', (dt, tt) => {
    ringT += dt;
    const near = camFar(k, top.x, top.z) < 45;
    bell.visible = near || act === k.act;
    if (!bell.visible) return;
    const w = k.atmos.wind, wd = { x: Math.cos(tt * 0.05), z: Math.sin(tt * 0.05) };
    // 风：一阵一阵地推；越大越勤
    const gust = Math.max(0, w - 0.1) * Math.max(0, 0.3 + 0.7 * Math.sin(tt * 0.9) + 0.4 * Math.sin(tt * 2.3 + 1)) * 14;
    const step = (s: typeof B, k0: number, damp: number, fx: number, fz: number) => {
      s.vx += (-k0 * s.ax - damp * s.vx + fx) * dt; s.vz += (-k0 * s.az - damp * s.vz + fz) * dt;
      s.ax += s.vx * dt; s.az += s.vz * dt;
    };
    step(B, 14, 1.2, gust * wd.x * 0.25, gust * wd.z * 0.25);
    step(Tb, 26, 0.9, gust * wd.x + (B.ax - Tb.ax) * 6, gust * wd.z + (B.az - Tb.az) * 6);
    Tb.ax = clamp(Tb.ax, -0.7, 0.7); Tb.az = clamp(Tb.az, -0.7, 0.7);
    bell.rotation.set(B.az, 0, -B.ax);
    tab.rotation.set(Tb.az - B.az, 0, -(Tb.ax - B.ax));
    // 铃舌离铃心偏得够了，碰着铃壁：响一声
    const rel = Math.hypot(Tb.ax - B.ax, Tb.az - B.az), relV = Math.hypot(Tb.vx - B.vx, Tb.vz - B.vz);
    if (rel > 0.27 && relV > 0.95) ring(0.2 + relV * 0.1);
  });
  return act;
}
