/**
 * 念珠：一百零八颗，一颗一颗拨过去。
 *   行者在亭里南边那个蒲团上坐下；镜头凑到他眼前（这时不画他自己）。
 *   画面里是垂下来的一挂珠——手在画面之上，看不见；珠串从上面垂下、在下面兜成一个弯，背后是云台外的远山。
 *   轻点（或向下拨、按空格）拨过一颗：整串走一格，带一点惯性地晃。每二十七颗有一颗隔珠（不计数），
 *   一百零八颗拨完，母珠（带流苏的那颗大的）回到最低处——按规矩不越过母珠，掉过头往回拨。
 */
import * as THREE from 'three';
import type { Kongshan } from '../Kongshan';
import { enhance, variant } from '../core/mats';
import type { Act } from './types';
import { SEAT, Spring, ZAFU, ZAFU_BACK, basis, behind } from './util';
import { cn } from '../../util/cn';

const N = 108, GAP = 27;
/** 一圈的格数：108 颗 + 3 颗隔珠 + 母珠 */
const S = N + 3 + 1;
const D = 0.0098;                 // 相邻两格的距离
const WTOP = 0.014, W = 0.043, HGT = 0.2;   // 上口半宽、下面半宽、直段高
const LV = 2 * HGT + Math.PI * W;           // 画面里这一段的长度
const kind = (j: number): 'guru' | 'gap' | 'bead' => (j === 0 ? 'guru' : j % (GAP + 1) === 0 ? 'gap' : 'bead');

export function createBeads(k: Kongshan): Act {
  const seat = k.parts.seat.beads;
  // 坐下以后眼睛的位置（蒲团面上七十来厘米），朝东略往下看
  const pos = new THREE.Vector3(seat.x + 0.1, seat.y + SEAT + 0.74, seat.z), look = new THREE.Vector3(pos.x + 10, pos.y - 1.1, pos.z + 0.4);
  const { f, r, u } = basis(pos, look);
  const hinge = pos.clone().addScaledVector(f, 0.4).addScaledVector(u, 0.168);

  const group = new THREE.Group();
  group.visible = false;
  const wood = variant(k.mats.woodPale, { color: 0x5b2a1d, roughness: 0.34, envMapIntensity: 1.3 });
  const jade = enhance(new THREE.MeshStandardMaterial({ color: 0x86b7a2, roughness: 0.22, metalness: 0, envMapIntensity: 1.4 }));
  const silk = enhance(new THREE.MeshStandardMaterial({ color: 0x7a2318, roughness: 0.85 }));
  const sph = new THREE.SphereGeometry(0.00468, 18, 12);
  const beads = new THREE.InstancedMesh(sph, wood, 72), gaps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0054, 18, 12), jade, 4);
  beads.frustumCulled = false; gaps.frustumCulled = false;
  // 母珠：三通珠 + 佛塔 + 流苏
  const guru = new THREE.Group();
  guru.add(new THREE.Mesh(new THREE.SphereGeometry(0.0071, 22, 14), wood));
  const tail = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.LatheGeometry([[0.0001, 0], [0.0042, -0.001], [0.0046, -0.006], [0.0026, -0.013], [0.0012, -0.016]].map(([x, y]) => new THREE.Vector2(x, y)), 14), wood);
  tower.position.y = -0.0066;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 10, 8), silk); knot.position.y = -0.026;
  const tassel = new THREE.Mesh(new THREE.LatheGeometry([[0.0016, 0], [0.0034, -0.008], [0.0042, -0.03], [0.0058, -0.07], [0.0001, -0.072]].map(([x, y]) => new THREE.Vector2(x, y)), 14), silk);
  tassel.position.y = -0.028;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0005, 0.0005, 0.012, 5), silk); cord.position.y = -0.021;
  tail.add(tower, cord, knot, tassel);
  guru.add(tail);
  group.add(beads, gaps, guru);
  k.world.scene.add(group);

  /** 画面里这一段上的一点（相对悬挂点，x 朝右，y 朝上） */
  const path = (s: number, out: THREE.Vector2) => {
    if (s < HGT) { const t = s / HGT; return out.set(-(WTOP + (W - WTOP) * Math.pow(t, 1.5)), -s); }
    if (s < HGT + Math.PI * W) { const a = (s - HGT) / W; return out.set(-W * Math.cos(a), -HGT - W * Math.sin(a)); }
    const t = 1 - (s - HGT - Math.PI * W) / HGT;
    return out.set(WTOP + (W - WTOP) * Math.pow(Math.max(0, t), 1.5), -t * HGT);
  };

  let count = 0, rounds = 0, dir = 1, total = 0;
  /** 整串走了多少格（连续值）；母珠起初在最低处 */
  const shift = new Spring(0, 36, 0.78);
  let goal = 0;
  const swing = new Spring(0, 5.2, 0.16), tug = new Spring(0, 30, 0.6), tasselSw = new Spring(0, 7, 0.2);
  let dragAcc = 0, active = false, hidden = false;
  const base0 = (LV / 2) / D;      // 第 0 格（母珠）在最低处时对应的偏移
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p2 = new THREE.Vector2(), p3 = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);

  const state: Record<string, unknown> = {};
  const sync = () => {
    state.count = count === 0 && rounds === 0 ? '' : `${rounds > 0 ? `${cn(rounds)}圈　` : ''}${count > 0 ? `第${cn(count)}颗` : ''}`;
    state.hint = total === 0 ? '轻点，或向下拨' : count === 0 ? '一百零八颗满了。到母珠处掉头，不越过去' : '';
    k.emitAct();
  };
  const pull = () => {
    if (!active) return;
    // 这一拨之后到最低处的是哪一格；是隔珠就多走一格（隔珠不计数）
    const landing = (((-(Math.round(goal) + dir)) % S) + S) % S;
    goal += dir * (kind(landing) === 'gap' ? 2 : 1);
    count++; total++;
    swing.v += (Math.random() - 0.5) * 0.5 + 0.22 * dir;
    tug.v -= 0.5;
    if (count >= N) {
      // 满一圈：母珠回到最低处，掉头
      count = 0; rounds++;
      goal = Math.round(goal / S) * S;
      dir = -dir;
      k.sfx('beadturn', { vel: 0.7, space: 'near' }); k.buzz([10, 60, 14]);
    } else { k.sfx('bead', { vel: 0.5 + Math.random() * 0.25, space: 'near' }); k.buzz(6); }
    sync();
  };

  const onKey = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); pull(); } };
  const onWheel = (e: WheelEvent) => { if (e.deltaY > 0) { dragAcc += e.deltaY; if (dragAcc > 60) { dragAcc = 0; pull(); } } };

  const act: Act = {
    id: 'beads', name: '念珠', anchor: new THREE.Vector3(seat.x, seat.y + 0.7, seat.z), spot: behind(seat, Math.PI / 2, ZAFU_BACK), radius: 2.2, state, noZoom: true,
    enter() {
      active = true; group.visible = true; hidden = false;
      const av = k.player.av;
      av.setSeat?.(ZAFU);
      av.setPose('sit', 1.4); av.setHands('lap', 1.0);
      k.player.slideTo(seat.x, seat.z, 1.3); k.player.lift = SEAT;
      k.nav.setPose({ pos, look, fov: 40, yaw: 10, up: 6, down: 6 }, 2.2);
      window.addEventListener('keydown', onKey);
      k.world.canvas.addEventListener('wheel', onWheel, { passive: true });
      sync();
    },
    exit() {
      active = false; group.visible = false;
      window.removeEventListener('keydown', onKey);
      k.world.canvas.removeEventListener('wheel', onWheel);
      if (total > 0) k.log({ kind: 'beads', n: total });
      total = 0;
    },
    input: {
      tap: () => { pull(); return true; },
      move: (p) => { if (p.dy > 0) { dragAcc += p.dy; if (dragAcc > 30) { dragAcc = 0; pull(); } } return true; },
      up: () => { dragAcc = 0; },
    },
    update(dt, t) {
      if (!group.visible) return;
      // 镜头凑到眼前时，人自己就不画了（不然看见的是自己的后脑勺）
      if (!hidden && k.world.camera.position.distanceTo(pos) < 0.62) { hidden = true; k.player.setVisible(false); }
      const sh = shift.step(goal, dt);
      const wind = Math.sin(t * 0.6) * 0.012 + Math.sin(t * 1.37 + 1) * 0.006;
      const th = swing.step(wind, dt), tg = tug.step(0, dt);
      let nb = 0, ng = 0, guruSeen = false;
      for (let j = 0; j < S; j++) {
        // 这一格此刻在环上的位置（格），折回 [0, S)
        let c = (j + sh + base0) % S; if (c < 0) c += S;
        const s = c * D;
        if (s > LV + D) continue;
        path(Math.min(s, LV), p2);
        // 整挂随悬挂点摆：越往下摆幅越大，并带一点滞后的波
        const depth = -p2.y / (HGT + W);
        const ang = th * (0.5 + 0.7 * depth) + Math.sin(t * 6.5 - depth * 5) * swing.v * 0.012;
        const x = p2.x * Math.cos(ang) - p2.y * Math.sin(ang), y = p2.x * Math.sin(ang) + p2.y * Math.cos(ang) + tg * 0.006;
        p3.copy(hinge).addScaledVector(r, x).addScaledVector(u, y);
        const kd = kind(j);
        if (kd === 'guru') {
          guru.position.copy(p3); guruSeen = true;
          // 流苏总是垂向地面，跟着晃
          const ts = tasselSw.step(-th * 1.4 - shift.v * 0.02, dt);
          guru.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), u);
          tail.rotation.set(0, 0, ts);
        } else if (kd === 'gap') { if (ng < 4) gaps.setMatrixAt(ng++, m.compose(p3, q.identity(), sc)); }
        else if (nb < 72) {
          // 每颗珠子转一个固定的角度，木纹各不相同
          q.setFromAxisAngle(f, j * 2.39996).multiply(new THREE.Quaternion().setFromAxisAngle(r, j * 1.1 + sh * 0.9));
          beads.setMatrixAt(nb++, m.compose(p3, q, sc));
        }
      }
      beads.count = nb; gaps.count = ng; guru.visible = guruSeen;
      beads.instanceMatrix.needsUpdate = true; gaps.instanceMatrix.needsUpdate = true;
    },
  };
  return act;
}
