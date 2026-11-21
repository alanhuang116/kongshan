/**
 * 扫院（秋天扫落叶，冬天下过雪扫出一条路）：从草堂门边拿起竹帚，人一直可以走动——走到哪扫到哪，站着也可以按住「扫」。
 *   秋：院里落了一地叶子（槐、柳、梅……一片一片点上去的），帚梢扫过，叶子往前一扑，扫到石桌边的老梅底下成一堆。
 *   冬：地上积着雪，从堂前到柴门扫出一条路，扫过的地方露出土来。
 *   扫完了，竹帚放回门边。第二天叶子又落一地、雪又积起来。
 * 竹帚是屋舍那边做的（k.build.parts.broom：握处为原点，+y 沿竿，userData.tip 是帚梢在竿上的位置）。
 * 记（mem 'play' 的 sweep）：扫过几回。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { dabMat, dabMesh, type Dab } from '../ink/ink';
import { atlas, ink, leaf, type Tile } from '../ink/brush';
import { SITE, YARD_Y } from '../site';
import { groundAt } from '../walk';
import type { Act } from './types';
import { lift } from './util';
import { V, clamp, onFrame, playGet, playSet, sfx, stateOf } from '../play/kit';
import { wash } from '../ink/ink';

const N_LEAF = 56;
export function create(k: Anlewo): Act | null {
  const broom = k.build?.parts.broom;
  if (!broom) return null;
  const { state, set, put, flush } = stateOf(k);
  const Y = SITE.yard, tipL = Math.abs(Number(broom.userData.tip ?? -1.28));
  // 落叶堆在老梅底下
  const PILE = V(SITE.plum.x - 1.4, YARD_Y, SITE.plum.z - 0.8);
  // —— 落叶：一笔一笔点上去的（一张网，一次绘制） ——
  // 一片落叶：一笔尖叶，叶柄一点点缀色
  const LEAF: Tile = (g, r) => { leaf(g, 0.5, 0.52, -0.6 + r() * 1.2, 0.62, 0.3, ink(0.6 + 0.3 * r(), 0.35), (r() - 0.5) * 0.5); };
  const A = atlas([LEAF, LEAF], 2, Math.round(96 * k.q.tex), 77);
  const leafMat = dabMat({ ...A, pig: [0.9, 0.72, 0.45], accent: [0.84, 0.42, 0.26], dens: 1.25, shade: 1.3, body: 0.6, sway: 0 });
  const rnd = (() => { let s = 4242; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  const leaves: Array<{ x: number; z: number; vx: number; vz: number; piled: boolean }> = [];
  const free = (x: number, z: number) => { const M = SITE.mums; if (x > M.x0 - 0.3 && x < M.x1 + 0.3 && z > M.z0 - 0.3 && z < M.z1 + 0.3) return false; if (Math.hypot(x - SITE.table.x, z - SITE.table.z) < 1.3) return false; return Math.abs(x) > 0.2 || z > 3.5; };
  const scatter = () => {
    leaves.length = 0;
    // 落在菊圃以东、堂前到篱笆那一大片（梅、松、槐的叶子被风吹过来的）
    for (let i = 0; i < 400 && leaves.length < N_LEAF; i++) { const x = -3.2 + rnd() * (Y.x1 - 1 + 3.2), z = 3.8 + rnd() * (Y.z1 - 4.6); if (free(x, z)) leaves.push({ x, z, vx: 0, vz: 0, piled: false }); }
  };
  scatter();
  const dabs: Dab[] = leaves.map((l, i) => ({ x: l.x, y: YARD_Y + 0.02, z: l.z, size: 0.24 + 0.08 * ((i * 0.37) % 1), nx: 0, ny: 1, nz: 0, tile: i % 2, r: 0.9 + 0.2 * ((i * 0.61) % 1), g: 0.9 + 0.15 * ((i * 0.29) % 1), b: 0.9, rot: i * 1.3, sway: 0 }));
  const leafMesh = dabMesh(dabs, leafMat);
  leafMesh.name = 'play:leaves';
  leafMesh.frustumCulled = false;
  // —— 扫出来的路：一条土色的窄带，盖在雪上（一段一段地显出来） ——
  const PATH0 = V(0.2, YARD_Y, SITE.hall.z + SITE.hall.d / 2 + 0.6), PATH1 = V(0.1, YARD_Y, SITE.gate.z - 0.5), SEG = 28;
  const segDone = new Array<boolean>(SEG).fill(false);
  const pathGeo = (() => {
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
    for (let i = 0; i < SEG; i++) {
      const a = i / SEG, b = (i + 1) / SEG, z0 = PATH0.z + (PATH1.z - PATH0.z) * a, z1 = PATH0.z + (PATH1.z - PATH0.z) * b, x0 = PATH0.x + (PATH1.x - PATH0.x) * a, x1 = PATH0.x + (PATH1.x - PATH0.x) * b;
      const w0 = 0.42 + 0.06 * Math.sin(i * 1.7), w1 = 0.42 + 0.06 * Math.sin((i + 1) * 1.7), y = YARD_Y + 0.012;
      const q = [[x0 - w0, z0], [x0 + w0, z0], [x1 + w1, z1], [x0 - w0, z0], [x1 + w1, z1], [x1 - w1, z1]];
      for (const [x, z] of q) { pos.push(x, y, z); nor.push(0, 1, 0); uv.push(x, z); col.push(1, 1, 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  })();
  const pathMat = wash({ pig: [0.9, 0.85, 0.74], dens: 0.9, shade: 1, flat: 1, grain: 1.5, line: 0, snow: 0 });
  const pathMesh = new THREE.Mesh(pathGeo, pathMat);
  pathMesh.name = 'play:sweptPath';
  pathGeo.setDrawRange(0, 0);
  k.world.scene.add(leafMesh, pathMesh);

  // 今天扫过没有（第二天叶子又落一地、雪又积起来）
  const saved = playGet<{ n?: number; day?: number; kind?: string }>(k, 'sweep', {});
  let sweptToday = saved.day === k.day ? saved.kind ?? '' : '';
  const mode = (): 'leaf' | 'snow' | null => (k.atmos.snowCover > 0.3 ? 'snow' : k.season === 'autumn' ? 'leaf' : null);
  const applyDay = () => {
    const m = mode();
    leafMesh.visible = m === 'leaf' && sweptToday !== 'leaf' ? true : m === 'leaf' && sweptToday === 'leaf';
    if (m === 'leaf' && sweptToday === 'leaf') { for (const l of leaves) { l.piled = true; const a = Math.random() * 6.28, d = Math.random() * 0.45; l.x = PILE.x + Math.cos(a) * d; l.z = PILE.z + Math.sin(a) * d; } writeLeaves(); }
    pathMesh.visible = m === 'snow' && sweptToday === 'snow';
    pathGeo.setDrawRange(0, sweptToday === 'snow' ? SEG * 6 : 0);
  };
  k.onDay.push(() => { sweptToday = ''; scatter(); writeLeaves(); segDone.fill(false); applyDay(); });

  const aPos = leafMesh.geometry.attributes.aPos as THREE.BufferAttribute | undefined;
  function writeLeaves() {
    if (!aPos) return;
    for (let i = 0; i < leaves.length; i++) { const l = leaves[i]; aPos.setXYZ(i, l.x, (groundAt(l.x, l.z) ?? YARD_Y) + 0.02 + (l.piled ? 0.03 * ((i * 0.7) % 1) : 0), l.z); }
    aPos.needsUpdate = true;
  }
  writeLeaves();
  applyDay();

  // —— 扫的时候 ——
  let phase: 'sweep' | 'done' | 'off' = 'off', t = 0, ph = 0, holding = false, putBack: (() => void) | null = null, lastSwish = 0, idleT = 0;
  const head = V(), grip = V(), dir = V(), side = V(), tmp = V(), prevHead = V(), walkV = V(), prevPos = V();
  const count = () => (mode() === 'leaf' ? leaves.filter((l) => l.piled).length : segDone.filter(Boolean).length);
  const total = () => (mode() === 'leaf' ? leaves.length : SEG);
  const show = (hint?: string) => set({ title: mode() === 'snow' ? '扫雪' : '扫叶', hint: hint ?? (mode() === 'snow' ? '从堂前往柴门扫出一条路' : '把叶子都扫到老梅底下'), progress: count() / total(), hold: { id: 'sweep', label: '扫' }, keys: [{ key: 'W A S D', label: '走' }, { key: '空格', label: '原地扫' }], tags: mode() === 'leaf' ? [{ id: 'pile', text: '扫到这里', x: PILE.x, y: PILE.y + 0.5, z: PILE.z, kind: 'hot' }] : [], choices: [{ id: 'done', label: '放下竹帚' }] });

  const act: Act & { on(): boolean } = {
    id: 'broom', name: '扫院', anchor: broom.getWorldPosition(V()).add(V(0, 0.2, 0.3)), spot: { x: broom.getWorldPosition(V()).x + 0.2, z: SITE.hall.z + SITE.hall.d / 2 + 0.95, yaw: Math.PI }, radius: 2.4, state, free: true,
    on: () => { const m = mode(); return !!m && sweptToday !== m; },
    enter() {
      phase = 'sweep'; t = 0; ph = 0; holding = false; idleT = 0; prevPos.copy(k.player.pos);
      applyDay();
      if (mode() === 'snow') { pathMesh.visible = true; pathGeo.setDrawRange(0, 0); segDone.fill(false); }
      putBack = lift(k.world.scene, broom);
      k.player.av.setHands('free');
      show();
    },
    exit() {
      putBack?.(); putBack = null; broom.visible = true;
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.bow = 0;
      phase = 'off';
    },
    update(dt) {
      t += dt; flush();
      if (phase !== 'sweep') return;
      const p = k.player;
      // 帚：走着的时候一下一下地扫，站着按住「扫」也扫
      const going = p.speed > 0.25 || holding;
      if (going) ph += dt * (holding && p.speed < 0.25 ? 5.5 : 3 + p.speed * 1.6);
      idleT = going ? 0 : idleT + dt;
      const sw = Math.sin(ph);
      dir.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)); side.set(-dir.z, 0, dir.x);
      prevHead.copy(head);
      head.copy(p.pos).addScaledVector(dir, 0.72 + 0.12 * Math.cos(ph)).addScaledVector(side, 0.42 * sw);
      head.y = (groundAt(head.x, head.z) ?? p.pos.y) + 0.03;
      grip.copy(p.pos).addScaledVector(side, -0.18).addScaledVector(dir, 0.18); grip.y = p.pos.y + 0.95;
      // 扫一下，「唰」一声
      if (going && Math.floor(ph / Math.PI) !== lastSwish) { lastSwish = Math.floor(ph / Math.PI); sfx(k, 'broom', { vel: 0.35, variant: mode() === 'snow' ? 'stone' : undefined, dur: 0.45 }); }
      const vel = tmp.subVectors(head, prevHead).setY(0).divideScalar(Math.max(dt, 1e-3));
    walkV.subVectors(p.pos, prevPos).setY(0).divideScalar(Math.max(dt, 1e-3)); prevPos.copy(p.pos);
      if (mode() === 'leaf') sweepLeaves(vel, dt);
      else sweepSnow();
      if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) put({ progress: count() / total() });
      if (count() >= Math.ceil(total() * (mode() === 'leaf' ? 0.7 : 1))) finish();
    },
    cmd(c, arg) {
      if (c === 'sweep') holding = arg === 'down';
      else if (c === 'done') k.exitAct();
    },
  };
  function sweepLeaves(vel: THREE.Vector3, dt: number) {
    let moved = false;
    const sp = Math.hypot(vel.x, vel.z), wx = walkV.x, wz = walkV.z;
    for (const l of leaves) {
      if (l.piled) continue;
      const d = Math.hypot(l.x - head.x, l.z - head.z);
      const tp = tmp.set(PILE.x - l.x, 0, PILE.z - l.z), dl = tp.length() || 1;
      if (d < 0.6 && sp > 0.3) {
        // 帚梢扫过：叶子往扫的方向扑一下，偏一点往堆那边去；人往前走，帚前头的叶子就被一路推着走
        l.vx += vel.x * 0.35 + (tp.x / dl) * 3.4; l.vz += vel.z * 0.35 + (tp.z / dl) * 3.4;
        l.x += wx * dt * 0.95; l.z += wz * dt * 0.95; moved = true;
      } else if (dl < 2.6 && !l.vx && !l.vz && sp > 0.3 && d < 2.6) {
        // 堆边上的几片，顺手一带就进去了
        l.vx = (tp.x / dl) * 1.8; l.vz = (tp.z / dl) * 1.8;
      }
      if (l.vx || l.vz) {
        l.x += l.vx * dt; l.z += l.vz * dt;
        l.vx *= Math.exp(-dt * 1.6); l.vz *= Math.exp(-dt * 1.6);
        if (Math.abs(l.vx) + Math.abs(l.vz) < 0.02) { l.vx = l.vz = 0; }
        if (Math.hypot(l.x - PILE.x, l.z - PILE.z) < 0.7) { l.piled = true; l.vx = l.vz = 0; }
        // 别飞出篱笆
        l.x = clamp(l.x, Y.x0 + 0.3, Y.x1 - 0.3); l.z = clamp(l.z, Y.z0 + 0.3, Y.z1 - 0.3);
        moved = true;
      }
    }
    if (moved) writeLeaves();
  }
  function sweepSnow() {
    const L = Math.hypot(PATH1.x - PATH0.x, PATH1.z - PATH0.z);
    const u = ((head.z - PATH0.z) * (PATH1.z - PATH0.z) + (head.x - PATH0.x) * (PATH1.x - PATH0.x)) / (L * L);
    const off = Math.abs(head.x - (PATH0.x + (PATH1.x - PATH0.x) * u));
    if (u < 0 || u > 1 || off > 0.6) return;
    const i = Math.min(SEG - 1, Math.floor(u * SEG));
    if (!segDone[i]) {
      segDone[i] = true;
      // 显出来的是从头连着的那一段（中间漏扫的等补上了再显）
      let n = 0; while (n < SEG && segDone[n]) n++;
      let shown = n;
      for (let j = n; j < SEG; j++) if (segDone[j]) shown = j + 1;
      pathGeo.setDrawRange(0, shown * 6);
    }
  }
  function finish() {
    phase = 'done';
    const m = mode() ?? 'leaf';
    sweptToday = m;
    const r = playGet<{ n?: number }>(k, 'sweep', {});
    playSet(k, 'sweep', { ...r, n: (r.n ?? 0) + 1, day: k.day, kind: m });
    k.log({ kind: 'play', text: m === 'snow' ? '扫雪，从堂前到柴门扫出一条路' : '扫院，落叶扫成一堆' });
    set({ title: m === 'snow' ? '扫雪' : '扫叶', text: m === 'snow' ? '从堂前到柴门，扫出一条土路来。' : '叶子扫成一堆，堆在老梅底下。', choices: [{ id: 'done', label: '放下竹帚' }], done: true });
  }

  // —— 每帧：竹帚跟着手；不做的时候落叶照常在那里 ——
  onFrame(k, 'broom', () => {
    const m = mode();
    if (act !== k.act) {
      leafMesh.visible = m === 'leaf';
      pathMesh.visible = m === 'snow' && sweptToday === 'snow';
      return;
    }
    if (phase === 'off') return;
    const av = k.player.av;
    broom.visible = k.world.camera.position.distanceTo(k.player.pos) > 1.6;
    // 竹帚：握处在右手，帚梢在地上来回扫
    const d = tmp.subVectors(grip, head).normalize();
    broom.position.copy(head).addScaledVector(d, tipL);
    broom.quaternion.setFromUnitVectors(V(0, 1, 0), d);
    av.reach('R', broom.position, { dir: d, rate: 20 });
    av.reach('L', tmp.copy(broom.position).addScaledVector(d, 0.38), { dir: d, rate: 20 });
    av.bow = 0.16;
  });
  return act;
}
