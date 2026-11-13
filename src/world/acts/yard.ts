/**
 * 院里院外的几件事：
 *   浇菊 —— 拿葫芦瓢从桶里舀水，绕着菊圃一丛一丛地浇。十六丛（一分为二、二分为四……到十六）。人可以走动。
 *   小车 —— 柴门外草棚下那辆小车。站在车旁，手搭在车帮上（邵雍出门坐的就是这样一辆小车）。
 *   讨茶 —— 路边茶亭里的茶瓮，谁渴了谁喝。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { SITE, YARD_Y } from '../site';
import { standable } from '../walk';
import type { Act } from './types';
import { hold } from './util';
import { anchor, before, part, POEMS, poemOf, sayingFor, shot, sitDown, V } from './lib';

type St = Record<string, unknown>;
function base(k: Anlewo) {
  const state: St = {};
  const set = (p: St) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); };
  return { state, set };
}

// —— 浇菊 ——
function mums(k: Anlewo): Act | null {
  const edge = anchor(k, 'mumsEdge');
  if (!edge) return null;
  const { state, set } = base(k);
  const M = SITE.mums, gourd = part(k, 'gourd');
  // 十六丛：四行四列（与草木那边种的位置大致相合）
  const clumps: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) clumps.push(V(M.x0 + (M.x1 - M.x0) * (i + 0.5) / 4, YARD_Y, M.z0 + (M.z1 - M.z0) * (j + 0.5) / 4));
  const done = new Array<boolean>(16).fill(false);
  let undo: (() => void) | null = null, pouring = -1, pt = 0, queued = -1;
  const count = () => done.filter(Boolean).length;
  const hint = () => set({ kind: 'mums', title: '浇菊', hint: count() === 0 ? '走到菊丛边，点哪一丛就浇哪一丛' : '', count: count(), total: 16, choices: [{ id: 'done', label: '罢' }] });
  /** 菊圃边上离这一丛最近的能站处 */
  const edgeNear = (c: THREE.Vector3): [number, number] | null => {
    let best: [number, number] | null = null, bd = 1e9;
    for (let a = 0; a < 24; a++) {
      const x = Math.max(M.x0 - 0.5, Math.min(M.x1 + 0.5, c.x + Math.cos((a / 24) * Math.PI * 2) * 3)), z = Math.max(M.z0 - 0.5, Math.min(M.z1 + 0.5, c.z + Math.sin((a / 24) * Math.PI * 2) * 3));
      if (standable(x, z) == null) continue;
      const d = Math.hypot(x - c.x, z - c.z); if (d < bd) { bd = d; best = [x, z]; }
    }
    return best;
  };
  const pour = (i: number) => {
    pouring = i; pt = 0;
    const c = clumps[i], p = k.player;
    p.faceTo = Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
    k.sfx('water', { vel: 0.45 });
  };
  const act: Act = {
    id: 'mums', name: '浇菊', anchor: edge.position.clone().add(V(0, 0.9, 0)), spot: before(edge, 0.5), radius: 2.2, state, free: true,
    enter() {
      done.fill(false); pouring = -1; queued = -1;
      k.player.av.setHands('free');
      if (gourd) undo = hold(gourd, k.player.av.joints.handR, [0, 0.03, 0.03], [0, 0, 0]);
      hint();
    },
    exit() { undo?.(); undo = null; k.player.av.reach('R', null); k.player.av.bow = 0; },
    update(dt) {
      const av = k.player.av;
      if (queued >= 0 && !k.player.walking) { const q = queued; queued = -1; if (Math.hypot(k.player.pos.x - clumps[q].x, k.player.pos.z - clumps[q].z) < 3.4) pour(q); }
      if (pouring < 0) { av.bow = Math.max(0, av.bow - dt); return; }
      pt += dt;
      const c = clumps[pouring], e = Math.min(1, pt / 1.6);
      av.bow = 0.28 * Math.sin(Math.PI * e);
      av.reach('R', c.clone().lerp(k.player.pos, 0.55).setY(YARD_Y + 0.55 - 0.15 * Math.sin(Math.PI * e)), { rate: 6 });
      if (gourd) gourd.rotation.z = -1.0 * Math.sin(Math.PI * Math.min(1, e * 1.3));
      if (pt > 0.7 && pt - dt <= 0.7) k.fx?.burst('splash', c.clone().setY(YARD_Y + 0.25), 6);
      if (e >= 1) {
        done[pouring] = true; pouring = -1; av.reach('R', null);
        if (count() === 16) {
          const ju = POEMS.find((v) => v.lines.some((l) => l.includes('菊')));
          const sy = sayingFor('flower');
          k.log({ kind: 'mums', n: 16 });
          set({ kind: 'read', title: '十六丛都浇过了', lines: ju ? ju.lines : undefined, text: ju ? undefined : sy?.text ?? '一分为二，二分为四，四分为八，八分为十六。', source: ju ? `${ju.author}《${ju.title}》　${ju.source}` : sy?.source, choices: [{ id: 'done', label: '放下瓢' }] });
        } else hint();
      }
    },
    input: {
      tap(p) {
        if (pouring >= 0) return true;
        const ray = k.world.ray(p.nx, p.ny).ray;
        if (Math.abs(ray.direction.y) < 1e-4) return false;
        const s = (YARD_Y + 0.3 - ray.origin.y) / ray.direction.y;
        if (s <= 0) return false;
        const hit = ray.origin.clone().addScaledVector(ray.direction, s);
        let bi = -1, bd = 1.0;
        for (let i = 0; i < 16; i++) { if (done[i]) continue; const d = Math.hypot(hit.x - clumps[i].x, hit.z - clumps[i].z); if (d < bd) { bd = d; bi = i; } }
        if (bi < 0) return false;                                              // 没点在菊上：当作点地面走过去
        const pl = k.player, d = Math.hypot(pl.pos.x - clumps[bi].x, pl.pos.z - clumps[bi].z);
        if (d < 3.4) pour(bi);
        else { const e = edgeNear(clumps[bi]); if (e) { queued = bi; pl.goTo(e[0], e[1], { r: 0.15 }); } }
        return true;
      },
    },
    cmd(c) { if (c === 'done') k.exitAct(); },
  };
  return act;
}

// —— 小车 ——
function cart(k: Anlewo): Act | null {
  const a = anchor(k, 'cart');
  if (!a) return null;
  const { state, set } = base(k);
  const pm = poemOf(['xiaoche', 'xiaoche-xing'], '小车');
  // 车身在草棚当中（总图上的位置）；人站在车的南边，面朝车
  const C = SITE.more.cart, rail = V(C.x + 0.1, a.position.y + 0.95, C.z + 0.42);
  return {
    id: 'cart', name: '小车', anchor: V(C.x, a.position.y + 1.6, C.z), spot: { x: C.x + 0.1, z: C.z + 0.95, yaw: Math.PI }, radius: 2.2, state, noZoom: true,
    enter() {
      const av = k.player.av;
      av.setHands('free'); av.reach('R', rail, { rate: 4 }); av.lookAt(V(C.x - 0.6, a.position.y + 0.8, C.z));
      k.nav.setPose(shot(V(C.x, a.position.y + 0.6, C.z), 0.6, 4.2, 0.9, 0.2, 42, { yaw: 20, up: 10, down: 8 }), 1.6);
      set({ kind: 'read', title: '小车', lines: pm?.lines ?? [], text: pm ? undefined : '一辆小车，一个人坐；出门不远，随处可停。', source: pm ? `${pm.author}《${pm.title}》　${pm.source}` : undefined, choices: [{ id: 'done', label: '下车' }] });
      k.log({ kind: 'read', text: '小车' });
    },
    exit() { k.player.av.reach('R', null); k.player.av.lookAt(null); },
    cmd(c) { if (c === 'done') k.exitAct(); },
  };
}

// —— 讨茶 ——
function roadTea(k: Anlewo): Act | null {
  const a = anchor(k, 'teaJar');
  if (!a) return null;
  const { state, set } = base(k);
  let t = -1;
  const head = new THREE.Vector3();
  return {
    id: 'roadTea', name: '讨茶', anchor: a.position.clone().add(V(0, 0.7, 0)), spot: before(a, 0.6), radius: 2.0, state,
    enter() {
      t = 0;
      k.player.av.setHands('free');
      k.nav.setPose(shot(a.position, a.rotation.y + Math.PI + 0.5, 3.6, 0.35, 0.1, 42), 1.4);
      set({ kind: 'read', title: '茶亭', text: '瓮里是凉茶，瓮边几只粗碗。不知是谁家放在这里的，过路的人渴了就喝一碗。', hint: '' });
    },
    exit() { k.player.av.reach('R', null); },
    update(dt) {
      if (t < 0) return;
      t += dt;
      const av = k.player.av;
      av.joints.head.getWorldPosition(head);
      if (t < 1.4) av.reach('R', a.position.clone().add(V(0, 0.05, 0)), { rate: 5 });
      else if (t < 3.2) { av.reach('R', head.clone().add(V(0, -0.08, 0)).addScaledVector(V(Math.sin(k.player.yaw), 0, Math.cos(k.player.yaw)), 0.12), { rate: 4 }); if (t - dt < 1.4) k.sfx('bowl', { vel: 0.4 }); }
      else { av.reach('R', null); t = -1; k.log({ kind: 'roadTea' }); set({ kind: 'read', title: '茶亭', text: '喝了一碗，碗搁回原处。', choices: [{ id: 'done', label: '谢过，走了' }] }); }
    },
    cmd(c) { if (c === 'done') k.exitAct(); },
  };
}

export function create(k: Anlewo): Act[] {
  return [mums(k), cart(k), roadTea(k)].filter((a): a is Act => !!a);
}
