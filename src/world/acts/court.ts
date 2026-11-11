/**
 * 院里的两件事：
 *   上香 —— 行者走到炉前，取香三支；点一下，他侧身就着烛火把香点着；举香齐眉，按住，朝大殿三拜；
 *           再点三下，一支一支插进炉里（通行的做法是先中、再右、再左）。
 *   扫叶 —— 他拿起扫帚。这时照常走动，走到哪扫到哪：帚在身前左右摆，把叶子往前、往两边带开。扫净了，风一来还会落。
 */
import * as THREE from 'three';
import type { Kongshan } from '../Kongshan';
import { enhance } from '../core/mats';
import { Smoke } from '../fx/smoke';
import { mulberry32, rr } from '../core/rng';
import { L } from '../layout';
import { groundAt } from '../walk';
import type { Act } from './types';
import { UP, ease, fwdOf, jpos, rightOf, wpos } from './util';

// —— 上香 ——
export function createIncense(k: Kongshan): Act {
  const C = k.parts.censer, ash = C.ash, flame = C.flames[1] ?? C.flames[0];
  const spot = { x: ash.x, z: ash.z + 0.92, yaw: Math.PI };
  const f = fwdOf(spot.yaw), r = rightOf(spot.yaw);
  const LEN = 0.33, GRIP = 0.07;
  const geo = new THREE.CylinderGeometry(0.0021, 0.0024, LEN, 6).translate(0, LEN / 2, 0);
  const col = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < geo.attributes.position.count; i++) { const red = geo.attributes.position.getY(i) < LEN * 0.3; col.set(red ? [0.5, 0.1, 0.07] : [0.42, 0.33, 0.2], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const sticks = [0, 1, 2].map(() => { const m = new THREE.Mesh(geo, mat); m.visible = false; m.castShadow = true; k.world.scene.add(m); return m; });
  const tips = sticks.map(() => new THREE.Vector3());
  const embers = tips.map((t) => k.flames.add(t, 0.012, { ember: true, halo: 0.1, on: false }));
  const smoke = k.addSmoke(new Smoke(tips, { points: 52, rise: 0.3, w1: 0.12, alpha: 0.55 }));
  smoke.strength = 0;
  // 香头的火星与烟一直跟着香走（插进炉里以后也还在烧）
  const wq = new THREE.Quaternion(), wp = new THREE.Vector3(), wu = new THREE.Vector3();
  k.world.tick.push(() => {
    sticks.forEach((s, i) => {
      if (!s.visible) return;
      s.updateWorldMatrix(true, false);
      s.matrixWorld.decompose(wp, wq, wu);
      tips[i].copy(wp).addScaledVector(wu.set(0, 1, 0).applyQuaternion(wq), LEN);
      k.flames.move(embers[i], tips[i]);
    });
  });

  const pose = { pos: new THREE.Vector3(spot.x + 2.3, 1.72, spot.z + 2.5), look: new THREE.Vector3(ash.x - 0.1, 1.2, ash.z - 0.6), fov: 46, yaw: 22, up: 12, down: 8 };
  const wide = { pos: new THREE.Vector3(spot.x + 2.9, 1.9, spot.z + 3.9), look: new THREE.Vector3(ash.x - 0.2, 1.7, ash.z - 2.5), fov: 48, yaw: 22, up: 12, down: 8 };
  const state: Record<string, unknown> = {};
  let step = 0, lighting = false, lit = 0, held = false, b = 0, counted = false, bows = 0, planted = 0, done = false, active = false, tEnd = 0;
  let plant: { i: number; t: number } | null = null, lean = 0, queued = 0;
  const inHand = [true, true, true];
  // 插在灰面靠人这一侧（人的手臂够不到炉心）：先中、再右、再左
  const spots = [[0, 0.385], [0.11, 0.365], [-0.11, 0.365]].map(([dx, dz]) => new THREE.Vector3(ash.x + dx, ash.y, ash.z + dz));
  const tilts = spots.map(() => new THREE.Euler(rr(Math.random, -0.07, 0.07), 0, rr(Math.random, -0.07, 0.07)));
  const HINT = ['取香三支', '点一下，就着烛火把香点着', '举香齐眉。按住，朝殿上三拜', '点三下，把香一支一支插进炉里', '香已上了'];
  const sync = () => {
    state.step = step; state.hint = HINT[step];
    state.count = step === 2 && bows ? `${['', '一', '二', '三'][Math.min(3, bows)]}拜` : '';
    k.emitAct();
  };
  const go = (s: number) => { step = s; if (s === 4) k.nav.setPose(wide, 3); sync(); };
  const tapStep = () => {
    if (!active) return;
    if (step === 1 && !lighting && lit < 1) { lighting = true; return; }
    if (step === 3 && planted + queued < 3) { if (plant) queued++; else plant = { i: planted, t: 0 }; }
  };
  const key = (e: KeyboardEvent) => { if (e.key === ' ') { e.preventDefault(); if (step === 2) held = e.type === 'keydown'; else if (e.type === 'keydown' && !e.repeat) tapStep(); } };
  const tgt = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  return {
    id: 'incense', name: '上香', anchor: new THREE.Vector3(ash.x, ash.y + 0.45, ash.z), spot, state, noZoom: true, dynamicShadow: true,
    enter() {
      active = true; lighting = false; lit = 0; bows = 0; planted = 0; b = 0; held = false; done = false; plant = null; tEnd = 0; queued = 0; lean = 0;
      const av = k.player.av, h = av.joints.handR;
      av.setHands('sleeve', 0.5);
      // 三支香握在右手里：并成一小束，握在离香脚 7 厘米处
      const hs = h.getWorldScale(new THREE.Vector3());
      sticks.forEach((s, i) => { inHand[i] = true; h.add(s); s.visible = true; s.scale.set(1 / hs.x, 1 / hs.y, 1 / hs.z); s.position.set((i - 1) * 0.008, -GRIP, 0.012); s.rotation.set(0, 0, (1 - i) * 0.035); });
      embers.forEach((e) => k.flames.set(e, false)); smoke.strength = 0;
      k.nav.setPose(pose, 1.9);
      window.addEventListener('keydown', key); window.addEventListener('keyup', key);
      go(0);
      window.setTimeout(() => { if (step === 0 && active) go(1); }, 1700);
    },
    exit() {
      active = false;
      window.removeEventListener('keydown', key); window.removeEventListener('keyup', key);
      // 还在手里的香收起来；插好的留在炉里接着烧
      sticks.forEach((s, i) => { if (inHand[i]) { s.removeFromParent(); k.world.scene.add(s); s.visible = false; k.flames.set(embers[i], false); } });
      if (planted === 0) smoke.strength = 0;
      if (done) k.log({ kind: 'incense' });
    },
    input: { down: () => { if (step === 2) held = true; }, up: () => { held = false; }, move: () => true, tap: () => { tapStep(); return true; } },
    update(dt) {
      if (!active) return;
      const av = k.player.av, head = jpos(av.joints.head, tmp);
      if (step === 2) {
        b += Math.max(-dt * 0.75, Math.min(dt * 0.65, (held ? 1 : 0) - b));
        if (b > 0.97 && !counted) { counted = true; bows++; k.buzz(12); sync(); if (bows >= 3) window.setTimeout(() => { if (step === 2 && active) { held = false; go(3); } }, 1600); }
        if (b < 0.2) counted = false;
      } else b += (0 - b) * Math.min(1, dt * 3);
      av.bow = step === 4 ? 0.42 * ease(Math.max(0, Math.min(1, tEnd / 0.9)) * (1 - ease((tEnd - 1.6) / 0.9))) : ease(b) * 0.92 + lean;
      if (step === 4) tEnd += dt;
      // 插香时身子往前探
      lean += ((plant ? 0.52 : 0) - lean) * Math.min(1, dt * 5);
      // 右手（连着香）该在哪
      if (step === 1 && lighting) {
        // 侧身就火：香头凑到烛焰上
        dir.subVectors(flame, jpos(av.joints.chest, tmp2).addScaledVector(r, 0.16)).normalize();
        tgt.copy(flame).addScaledVector(dir, -(LEN - GRIP) + 0.01);
        av.reach('R', tgt, { dir, rate: 5 }); av.lookAt(flame);
        if (tips[1].distanceTo(flame) < 0.06 && lit < 1) {
          lit += dt / 0.9;
          if (lit >= 1) { lit = 1; lighting = false; embers.forEach((e) => k.flames.set(e, true)); smoke.strength = 1; k.sfx('ignite', { vel: 0.6, space: 'near' }); k.buzz(16); av.lookAt(null); window.setTimeout(() => { if (step === 1 && active) go(2); }, 1100); }
        }
      } else if (plant) {
        // 插香：手带着这一支到炉里那一点上方，落下去
        plant.t += dt;
        const P = spots[plant.i];
        tgt.copy(P).addScaledVector(UP, GRIP + 0.02 + 0.12 * (1 - ease(Math.min(1, (plant.t - 0.25) / 0.75))));
        av.reach('R', tgt, { dir: UP, rate: 9 });
        // 手真的到了那一点上方（或者等得够久了）才松手——香不会从手里「跳」到炉里
        if (plant.t > 1.0 && (jpos(av.joints.handR, tmp2).distanceTo(tgt) < 0.025 || plant.t > 2.2)) {
          const s = sticks[plant.i];
          inHand[plant.i] = false;
          k.world.scene.attach(s); s.scale.set(1, 1, 1);
          s.position.copy(P).setY(P.y - 0.045); s.rotation.copy(tilts[plant.i]);
          planted++; plant = null;
          if (queued > 0 && planted < 3) { queued--; plant = { i: planted, t: 0 }; }
          k.sfx('ash', { vel: 0.6, space: 'near' }); k.buzz(8);
          if (planted >= 3) { done = true; av.reach('R', null); av.reach('L', null); av.setHands('pray', 0.7); window.setTimeout(() => { if (active) go(4); }, 800); }
        }
      } else if (step <= 3 && !done) {
        // 举香：拜的时候举到眉前，平时端在胸前
        const up = step === 2 ? 1 : 0;
        tgt.copy(head).addScaledVector(f, 0.27 + 0.05 * b).addScaledVector(UP, -0.1 - 0.32 * (1 - up));
        dir.copy(UP).addScaledVector(f, 0.25 + 0.55 * b).normalize();
        av.reach('R', tgt, { dir, rate: 7 });
        av.reach('L', tmp2.copy(tgt).addScaledVector(r, -0.035).addScaledVector(UP, -0.03), { dir, rate: 7 });
      }
    },
  };
}

// —— 扫叶 ——
export function createSweep(k: Kongshan, leafTex: THREE.Texture | null): Act {
  const cx = L.ginkgo.x + 3.0, cz = L.ginkgo.z + 3.3;
  const N = Math.round(520 * k.q.density), r = mulberry32(88);
  const g = new THREE.PlaneGeometry(0.085, 0.085).rotateX(-Math.PI / 2);
  const mat = enhance(new THREE.MeshLambertMaterial({ map: leafTex, color: 0xffffff, alphaTest: leafTex ? 0.4 : 0, side: THREE.DoubleSide }), { wet: true });
  const im = new THREE.InstancedMesh(g, mat, N);
  im.receiveShadow = true; im.frustumCulled = false;
  const px = new Float32Array(N), pz = new Float32Array(N), vx = new Float32Array(N), vz = new Float32Array(N), ry = new Float32Array(N), sc = new Float32Array(N);
  const inBed = (x: number, z: number) => Math.hypot(x - L.ginkgo.x, z - L.ginkgo.z) < 2.62;
  const scatter = (i: number, near: boolean) => {
    for (let n = 0; n < 20; n++) {
      const a = r() * 6.283, d = near ? rr(r, 0.3, 2.6) : 2.7 + Math.pow(r(), 1.6) * 6.2;
      const x = near ? cx + Math.cos(a) * d : L.ginkgo.x + Math.cos(a) * d, z = near ? cz + Math.sin(a) * d : L.ginkgo.z + Math.sin(a) * d;
      if (inBed(x, z) || groundAt(x, z) !== 0) continue;
      px[i] = x; pz[i] = z; break;
    }
    vx[i] = vz[i] = 0; ry[i] = r() * 6.283; sc[i] = rr(r, 0.75, 1.35);
  };
  for (let i = 0; i < N; i++) scatter(i, false);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) im.setColorAt(i, col.setHSL(0.12 + r() * 0.03, 0.75, 0.5 + r() * 0.14));
  const write = (i: number, hop = 0) => { q.setFromAxisAngle(UP, ry[i]); s.setScalar(sc[i]); im.setMatrixAt(i, m.compose(p.set(px[i], 0.012 + hop + (i % 7) * 0.0006, pz[i]), q, s)); };
  for (let i = 0; i < N; i++) write(i);
  k.world.scene.add(im);
  /** 四季：银杏叶只在秋天满地；冬天剩些枯叶，春夏很少 */
  const amount = () => ({ spring: 0.12, summer: 0.06, autumn: 1, winter: 0.4 }[k.season]);
  const tint = () => mat.color.set({ spring: 0xc8d08a, summer: 0xb7c27a, autumn: 0xe9b93a, winter: 0xb08a58 }[k.season]);
  const apply = () => { im.count = Math.round(N * amount()); tint(); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; };
  apply();

  const broom = k.parts.broom, home = { p: broom.position.clone(), q: broom.quaternion.clone() };
  const bd = (broom.userData.dir as THREE.Vector3 | undefined)?.clone() ?? new THREE.Vector3(0, Math.cos(0.5), -Math.sin(0.5));
  const state: Record<string, unknown> = {};
  let active = false, clean = false, logged = false, drop = 0, phase = 0, lastSide = 0, swung = 0;
  const head = new THREE.Vector3(), prev = new THREE.Vector3(), tmp = new THREE.Vector3(), fw = new THREE.Vector3(), rt = new THREE.Vector3(), e3 = new THREE.Euler();
  const sync = () => { state.hint = clean ? '地净了。风一来，还会落的' : '走到哪，扫到哪'; k.emitAct(); };
  const act: Act & { setSeason(): void } = {
    id: 'sweep', name: '扫叶', anchor: new THREE.Vector3(broom.position.x, 1.0, broom.position.z), spot: { x: broom.position.x + 0.55, z: broom.position.z + 0.5, yaw: -2.2 }, state, noZoom: false, dynamicShadow: true, free: true,
    setSeason: apply,
    enter() {
      active = true; clean = false; logged = false; phase = 0; swung = 0;
      // 拿了扫帚照常走动；镜头抬高一点，好看清地上的叶子
      k.player.locked = false;
      k.nav.pitch = 0.62; k.nav.dist = 4.6;
      head.copy(k.player.pos); prev.copy(head);
      sync();
    },
    exit() { active = false; broom.position.copy(home.p); broom.quaternion.copy(home.q); k.nav.pitch = 0.3; k.nav.dist = 5.2; },
    update(dt, t) {
      const n = im.count;
      if (!active && n === 0) return;
      let moving = false, bvx = 0, bvz = 0, sweeping = false;
      if (active) {
        const pl = k.player, av = pl.av;
        fwdOf(pl.yaw, fw); rightOf(pl.yaw, rt);
        // 帚在身前左右摆：走得越快摆得越勤
        const sp = pl.speed;
        phase += dt * (sp > 0.2 ? 0.75 + sp * 0.45 : 0);
        const side = Math.sin(phase * Math.PI * 2);
        prev.copy(head);
        head.copy(pl.pos).addScaledVector(fw, 0.84).addScaledVector(rt, side * 0.36 * Math.min(1, sp / 1.2 + 0.15));
        head.y = groundAt(head.x, head.z, pl.zone) ?? pl.pos.y;
        if (Math.abs(head.y - pl.pos.y) > 0.4) head.y = pl.pos.y;
        bvx = (head.x - prev.x) / Math.max(dt, 1e-3); bvz = (head.z - prev.z) / Math.max(dt, 1e-3);
        sweeping = sp > 0.2;
        // 扫帚：帚梢着地，竿子斜向握着它的两只手（道具本身的竿朝自己的 −z 斜）
        const yaw = Math.atan2(pl.pos.x - rt.x * 0.14 - head.x, pl.pos.z - rt.z * 0.14 - head.z);
        broom.position.copy(head);
        broom.quaternion.setFromEuler(e3.set(0, yaw + Math.PI, 0, 'YXZ'));
        av.reach('R', wpos(broom, tmp.copy(bd).multiplyScalar(1.16)), { dir: bd.clone().applyQuaternion(broom.quaternion), rate: 24 });
        av.reach('L', wpos(broom, tmp.copy(bd).multiplyScalar(1.5)), { dir: bd.clone().applyQuaternion(broom.quaternion), rate: 24 });
        const sd = Math.sign(side);
        if (sweeping && sd !== lastSide) { lastSide = sd; swung++; k.sfx('broom', { dur: 0.42, vel: Math.min(1, 0.4 + sp * 0.15), space: 'open' }); }
        if (sweeping) {
          const R = 0.42;
          for (let i = 0; i < n; i++) {
            const dx = px[i] - head.x, dz = pz[i] - head.z, d2 = dx * dx + dz * dz;
            if (d2 > R * R) continue;
            const d = Math.sqrt(d2) + 1e-4, w = 1 - d / R;
            // 被帚带着走，也被往外推开一点
            vx[i] += (bvx * 0.9 + fw.x * 0.8 - vx[i]) * w * 0.9 + (dx / d) * w * 1.1;
            vz[i] += (bvz * 0.9 + fw.z * 0.8 - vz[i]) * w * 0.9 + (dz / d) * w * 1.1;
          }
        }
      }
      const fr = Math.exp(-dt * 5.5);
      let inside = 0;
      for (let i = 0; i < n; i++) {
        const sp2 = vx[i] * vx[i] + vz[i] * vz[i];
        if (sp2 > 1e-4) {
          moving = true;
          const x = px[i] + vx[i] * dt, z = pz[i] + vz[i] * dt;
          // 叶子只在院子的平地上滑：碰到台基、树池、墙就停
          if (!inBed(x, z) && groundAt(x, z) === 0) { px[i] = x; pz[i] = z; } else { vx[i] *= -0.2; vz[i] *= -0.2; }
          vx[i] *= fr; vz[i] *= fr; ry[i] += Math.sqrt(sp2) * dt * 3;
          write(i, Math.min(0.05, Math.sqrt(sp2) * 0.012));
        }
        if (Math.hypot(px[i] - cx, pz[i] - cz) < 1.7) inside++;
      }
      if (moving) im.instanceMatrix.needsUpdate = true;
      if (active && !clean && n > 20 && swung > 6 && inside <= Math.max(2, n * 0.012)) { clean = true; if (!logged) { logged = true; k.log({ kind: 'sweep' }); } sync(); }
      // 扫净以后，隔一阵又飘下一片
      if (active && clean) { drop += dt; if (drop > 2.6) { drop = 0; const i = Math.floor(Math.random() * n); scatter(i, true); write(i); im.instanceMatrix.needsUpdate = true; } }
      void t;
    },
  };
  return act;
}
