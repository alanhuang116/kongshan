/**
 * 点灯（黄昏到夜里，院里）：就着屋里的灯火点着一根纸捻，走到檐下、门口，一盏一盏把灯笼点亮。
 *   画面上没点的灯笼各钉一枚小签，点签人就走过去点；走到灯底下站一站也就点了。人一直可以走动。
 *   三盏都亮了，记一笔。点亮的灯一直亮到天明（存在 mem 里，夜里来回进出也还亮着）；不点就黑着。
 * 灯笼在 play/lantern.ts。记（mem 'play' 的 lantern）：day 哪一天点的、lit 各盏亮没亮、n 点过几晚。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { wash } from '../ink/ink';
import { SITE } from '../site';
import type { Act } from './types';
import { lanternSpots, makeLanterns } from '../play/lantern';
import { PAIRS } from './lib';
import { V, clamp, inkGeo, mats, onFrame, playGet, playSet, setStatic, sfx, stateOf } from '../play/kit';

const SUN: Record<string, [number, number]> = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] };

export function create(k: Anlewo): Act | null {
  if (!k.build) return null;
  const { state, set, put, flush } = stateOf(k);
  const spots = lanternSpots();
  const L = makeLanterns(spots);
  k.world.scene.add(L.paperMesh, L.glow.mesh);
  setStatic(k, 'yard', 'lanternCaps', L.capsGeo);
  // 各盏站在哪里点：灯的正下方往外半步
  const stands = spots.map((s) => {
    const out = s.id === 'gate' ? V(0, 0, 1) : V(0, 0, 1);
    const p = V(s.c.x, 0, s.c.z).addScaledVector(out, s.id === 'gate' ? 0.55 : 0.45);
    return { x: p.x, z: p.z, yaw: Math.PI };
  });
  // 存着的：哪一天点的、哪几盏亮着
  const saved = playGet<{ day?: number; lit?: boolean[]; n?: number }>(k, 'lantern', {});
  const lit: boolean[] = spots.map((_s, i) => saved.day === k.day && !!saved.lit?.[i]);
  const glowK: number[] = spots.map((_s, i) => (lit[i] ? 1 : 0)), kk = glowK.slice();
  const save = () => playSet(k, 'lantern', { ...playGet(k, 'lantern', {}), day: k.day, lit: [...lit] });

  // 纸捻：一根细竹签，头上一点火（夜里自己亮）
  const taper = new THREE.Group();
  const stick = new THREE.Mesh(inkGeo(new THREE.CylinderGeometry(0.003, 0.004, 0.3, 4).translate(0, 0.15, 0)), mats().bamboo);
  const flame = new THREE.Mesh(inkGeo(new THREE.SphereGeometry(0.012, 6, 4).scale(0.8, 1.6, 0.8).translate(0, 0.315, 0)), wash({ pig: [1, 0.92, 0.7], dens: 1, body: 1, flat: 1, line: 0, glow: [0.9, 0.55, 0.2], snow: 0 }));
  taper.add(stick, flame); taper.visible = false; taper.name = 'play:taper';

  let phase: 'walk' | 'light' | 'done' | 'off' = 'off', t = 0, cur = -1, lightT = 0;
  const tmp = V();
  const tags = () => spots.map((s, i) => ({ id: s.id, text: lit[i] ? '亮着' : '点灯', sub: s.name, x: s.c.x, y: s.c.y + 0.22, z: s.c.z, kind: lit[i] ? 'done' : 'hot', on: i === cur }));
  const litN = () => lit.filter(Boolean).length;
  const show = (hint?: string) => set({ title: '点灯', hint: hint ?? (litN() ? `亮了${['', '一', '两', '三'][litN()]}盏` : '点小签，或走到灯底下'), count: litN(), total: spots.length, tags: tags(), choices: [{ id: 'done', label: '罢' }] });

  const act: Act & { on(): boolean } = {
    id: 'lantern', name: '点灯', anchor: spots[0].c.clone().add(V(0, 0.4, 0)), spot: { x: SITE.hall.x + 0.3, z: SITE.hall.z + SITE.hall.d / 2 + 1.9, yaw: 0 }, radius: 2.8, state, free: true,
    // 黄昏到夜里（白天下雨时灯火也亮几分，那不算）
    on: () => (k.atmos.night > 0.3 || (k.atmos.dusk > 0.35 && k.atmos.hour > 12)) && !lit.every(Boolean) && k.atmos.w.rain < 0.85,
    enter() {
      phase = 'walk'; t = 0; cur = -1;
      k.player.av.setHands('free');
      k.player.av.joints.handR.add(taper); taper.position.set(0, 0.01, 0.02); taper.rotation.set(0.15, 0, 0); taper.visible = true;
      sfx(k, 'ignite', { vel: 0.35 });
      show('纸捻就着灯火点着了');
    },
    exit() {
      taper.removeFromParent(); taper.visible = false;
      const av = k.player.av; av.reach('R', null); av.lookAt(null);
      phase = 'off';
      save();
    },
    update(dt) {
      t += dt; flush();
      const p = k.player;
      if (phase === 'walk') {
        // 走到某盏灯底下站住了：就点它
        if (!p.walking && p.speed < 0.2) for (let i = 0; i < spots.length; i++) if (!lit[i] && Math.hypot(p.pos.x - stands[i].x, p.pos.z - stands[i].z) < 0.75) { begin(i); break; }
      } else if (phase === 'light') {
        lightT += dt;
        const s = spots[cur], av = p.av;
        // 举起纸捻凑到灯笼底下
        av.reach('R', tmp.copy(s.c).add(V(0, -0.22 + 0.05 * Math.sin(lightT * 9) * (lightT > 0.8 ? 1 : 0), 0)).addScaledVector(V(p.pos.x - s.c.x, 0, p.pos.z - s.c.z).normalize(), 0.06), { rate: 6 });
        av.lookAt(s.c);
        if (lightT > 1.3 && !lit[cur]) {
          lit[cur] = true; save();
          sfx(k, 'lamp', { vel: 0.55, x: s.c.x, z: s.c.z });
          k.buzz(8);
        }
        if (lightT > 2.0) {
          av.reach('R', null); av.lookAt(null);
          const i = cur; cur = -1; phase = 'walk';
          if (lit.every(Boolean)) finish();
          else show(`${spots[i].name}的灯亮了`);
        }
      }
    },
    cmd(c, arg) {
      if (c === 'tag' && phase === 'walk' && typeof arg === 'string') {
        const i = spots.findIndex((s) => s.id === arg);
        if (i < 0 || lit[i]) return;
        cur = i;
        put({ tags: tags(), hint: `去${spots[i].name}` }, true);
        k.player.goTo(stands[i].x, stands[i].z, { r: 0.1, then: () => begin(i), fail: () => { cur = -1; put({ tags: tags(), hint: '过不去' }, true); } });
      } else if (c === 'done') k.exitAct();
    },
  };
  function begin(i: number) {
    if (phase !== 'walk' || lit[i]) return;
    phase = 'light'; cur = i; lightT = 0;
    const s = spots[i], p = k.player;
    p.stop();
    p.faceTo = Math.atan2(s.c.x - p.pos.x, s.c.z - p.pos.z);
    put({ tags: tags(), hint: `点${s.name}的灯` }, true);
  }
  function finish() {
    phase = 'done';
    const r = playGet<{ n?: number }>(k, 'lantern', {});
    playSet(k, 'lantern', { ...r, n: (r.n ?? 0) + 1, day: k.day, lit: [...lit] });
    k.log({ kind: 'play', text: '黄昏，把院里的三盏灯一盏一盏点亮了' });
    const pr = PAIRS.find((x) => x.id === (k.atmos.night > 0.6 ? 'c25' : 'c11')) ?? null;
    set({ title: '点灯', text: '三盏灯都亮了。檐下两盏，门头一盏，院里有了暖暖的一圈。', lines: pr ? [pr.a, pr.b] : undefined, source: pr ? `邵雍《${pr.from}》` : undefined, count: 3, total: 3, tags: tags(), choices: [{ id: 'done', label: '吹熄纸捻' }], done: true });
  }

  // —— 每帧：灯火（亮的那几盏轻轻地跳），天亮了吹熄 ——
  onFrame(k, 'lantern', (dt, tt) => {
    const a = k.atmos, [sr] = SUN[k.season] ?? [6, 18];
    if (lit.some(Boolean) && a.hour > sr + 0.2 && a.hour < 12) { for (let i = 0; i < lit.length; i++) lit[i] = false; save(); }
    for (let i = 0; i < spots.length; i++) glowK[i] += ((lit[i] ? 1 : 0) - glowK[i]) * Math.min(1, dt * (lit[i] ? 2.2 : 4));
    const flick = 1 + 0.06 * Math.sin(tt * 7.1) + 0.04 * Math.sin(tt * 12.3 + 1.1);
    for (let i = 0; i < glowK.length; i++) kk[i] = clamp(glowK[i]);
    L.setLit(kk, flick);
  });
  return act;
}
