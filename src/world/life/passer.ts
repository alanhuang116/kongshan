/**
 * 观象时才出来的两个人（不在村里人的名册上，只在那一处、那一会儿）：
 *   过路人 —— 「旅」：戴着斗笠、背着一个蓝布包袱，自桃林的路往东走，不停留；走到路尽头就不见了。
 *   说理的人 —— 「讼」：槐下石凳前一只小板凳上坐着，侧过身对着李公，一手比划着说他的理（李公转过头来听）。
 * 身子是村里人那一副（avatar/Figure，粗的那一档），一人一份；用完收走，几何丢掉。
 * 每帧只动这一两个人：位置、步子、手。走路的那一个挂在 k.world.tick 上，自己走完自己收。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { Figure } from '../avatar/figure';
import type { Look } from '../avatar/types';
import { merge, norm } from '../core/geo';
import { wash } from '../ink/ink';
import { PATHS } from '../site';
import { LOOKS } from './looks';
import { footY } from './spots';

/** 过路人：青灰的短褐，斗笠戴着，腿上缠着行缠 */
const WALKER: Partial<Look> = { ...LOOKS.peddler, robe: [0.66, 0.7, 0.74], robeDens: 1.75, leg: [0.82, 0.8, 0.74], legDens: 1.3, beard: 0.4, scale: 1.0 };
/** 说理的：村里一个中年人，灰褐的短褐 */
const TALKER: Partial<Look> = { ...LOOKS.drinker, robe: [0.8, 0.74, 0.64], robeDens: 1.6, beard: 0.5 };

const lowQ = (k: Anlewo) => ({ ...k.q, tier: 'low' as const, tex: k.q.tex * 0.5 });
const drop = (o: THREE.Object3D) => { o.removeFromParent(); o.traverse((x) => (x as THREE.Mesh).geometry?.dispose()); };
/** 一块几何摆到 (x, y, z)、转 (rx, ry, rz) */
const put = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => norm(g).applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z));

/** 一个土黄布的包袱：鼓鼓的一大团，系口的两个角翘着，一道布带斜挎在胸前（原点在背心，朝 −z 鼓出去；远远地也看得出背着东西）。并成一块 */
function bundle(): THREE.Mesh {
  const cloth = wash({ pig: [0.92, 0.82, 0.62], dens: 1.25, shade: 1.6, grain: 2.4, line: 0.9 });
  return new THREE.Mesh(merge([
    put(new THREE.SphereGeometry(1, 10, 8).scale(0.26, 0.21, 0.17), 0, -0.05, -0.2),
    put(new THREE.SphereGeometry(1, 6, 5).scale(0.05, 0.045, 0.04), 0.02, 0.09, -0.08),
    put(new THREE.ConeGeometry(0.03, 0.09, 5), -0.06, 0.12, -0.07, 0, 0, 0.9), put(new THREE.ConeGeometry(0.03, 0.09, 5), 0.06, 0.12, -0.07, 0, 0, -0.9),
    put(new THREE.TorusGeometry(0.17, 0.012, 4, 14).scale(1, 1.25, 0.95), 0, 0, -0.02, 0, 0, 0.7),
  ]), cloth);
}

/** 一只矮板凳（原点在脚下，凳面高 h）。并成一块 */
function stool(h: number): THREE.Mesh {
  const wood = wash({ pig: [0.75, 0.67, 0.585], dens: 1.6, shade: 1.5, grain: 1.6, streak: [24, 1.3, 0.34] });
  const parts = [put(new THREE.BoxGeometry(0.42, 0.04, 0.2), 0, h - 0.02, 0)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(put(new THREE.CylinderGeometry(0.018, 0.02, h - 0.04, 5), sx * 0.16, (h - 0.04) / 2, sz * 0.07, sz * 0.12, 0, -sx * 0.1));
  return new THREE.Mesh(merge(parts), wood);
}

// —— 过路人 ——
let walking: { fig: Figure; pts: Array<[number, number]>; s: number; L: number; done: boolean } | null = null;
/** 有没有一个过路人正在路上 */
export const travellerOn = () => !!walking && !walking.done;
/**
 * 叫一个过路人从桃林的路上 (x, z) 这一带往前 ahead 米处起步，往东走到路尽头。已经有一个在走就不另叫。
 * 返回他此刻在哪（看的人好把镜头对着路）。
 */
export function startTraveller(k: Anlewo, x: number, z: number, ahead = 14): THREE.Vector3 | null {
  const path = PATHS.find((p) => p.id === '桃林');
  if (!path) return null;
  if (walking && !walking.done) return walking.fig.root.position;
  const pts = path.pts;
  // 路上离 (x, z) 最近的那一点的里程
  let best = 0, bd = 1e9, acc = 0;
  const cum: number[] = [0];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez), t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (l * l || 1)));
    const d = Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z);
    if (d < bd) { bd = d; best = acc + l * t; }
    acc += l; cum.push(acc);
  }
  const fig = new Figure(lowQ(k), WALKER);
  fig.root.name = 'npc:traveller';
  fig.setGround((gx, gz) => footY(gx, gz));
  fig.setHands('free');
  fig.joints.chest.add(bundle());
  k.world.scene.add(fig.root);
  const w: NonNullable<typeof walking> = { fig, pts, s: Math.min(acc - 2, best + ahead), L: acc, done: false };
  walking = w;
  const at = (s: number, out: THREE.Vector3) => {
    let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++;
    const a = pts[i], b = pts[i + 1], t = (s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]);
    // 走在路的南半边（与迎面来的人错开）
    const ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez) || 1;
    return out.set(a[0] + ex * t - (ez / l) * 0.25, 0, a[1] + ez * t + (ex / l) * 0.25);
  };
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  const tick = (dt: number, t: number) => {
    if (w.done) return;
    const v = 1.05;
    w.s += v * Math.min(dt, 0.1);
    if (w.s >= w.L - 0.5) {
      // 到了路尽头：不见了
      w.done = true; drop(fig.root);
      const i = k.world.tick.indexOf(tick); if (i >= 0) k.world.tick.splice(i, 1);
      if (walking === w) walking = null;
      return;
    }
    at(w.s, p); at(w.s + 1.2, q);
    fig.root.position.set(p.x, footY(p.x, p.z), p.z);
    fig.root.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
    fig.update(Math.min(dt, 0.1), t, { speed: v });
  };
  tick(0, 0);
  k.world.tick.push(tick);
  return fig.root.position;
}

// —— 说理的人 ——
/**
 * 在 (x, z) 放一只小板凳，坐一个人，面朝 face 那一点（说话的对象）；每帧 talk() 一下：头看着对方，右手一下一下地比划，身子往前探。
 * 返回 { head: 他的头在哪, talk(dt, t), dispose() }。
 */
export function seatTalker(k: Anlewo, x: number, z: number, face: THREE.Vector3) {
  const h = 0.34, gy = footY(x, z), yaw = Math.atan2(face.x - x, face.z - z);
  const fig = new Figure(lowQ(k), TALKER);
  fig.root.name = 'npc:talker';
  // 坐凳：脚落在凳前一点，凳面在脚后
  const fx = x + Math.sin(yaw) * 0.22, fz = z + Math.cos(yaw) * 0.22;
  fig.root.position.set(fx, footY(fx, fz), fz); fig.root.rotation.y = yaw;
  fig.setGround((gx, gz) => footY(gx, gz));
  fig.setSeat({ h: h + (gy - footY(fx, fz)), cz: -0.22, hx: 0.2, hz: 0.1 });
  fig.setPose('bench', 0.01); fig.setHands('free');
  const st = stool(h); st.position.set(x, gy, z); st.rotation.y = yaw;
  k.world.scene.add(fig.root, st);
  const head = new THREE.Vector3(), hand = new THREE.Vector3(), fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  let ph = 0;
  // 先画一帧，坐好
  for (let i = 0; i < 40; i++) fig.update(0.05, i * 0.05, { speed: 0 });
  return {
    get head() { return fig.joints.head.getWorldPosition(head); },
    talk(dt: number, t: number) {
      ph += dt;
      // 说一阵、停一停：一句里手比划两三下（掌心朝上，往对方那边送），说完手收回膝上，点一点头
      const say = Math.max(0, Math.sin(ph * 0.55)), beat = Math.sin(ph * 4.2) * 0.5 + 0.5;
      fig.lookAt(face);
      fig.bow = 0.12 + 0.12 * say;
      if (say > 0.15) {
        hand.copy(fig.root.position).addScaledVector(fwd, 0.36 + 0.12 * beat).addScaledVector(side, -0.16).setY(fig.root.position.y + 0.92 + 0.1 * beat);
        fig.reach('R', hand, { dir: fwd, palm: new THREE.Vector3(0, 1, 0), rate: 6 });
      } else fig.reach('R', null);
      fig.update(Math.min(dt, 0.1), t, { speed: 0 });
    },
    dispose() { drop(fig.root); drop(st); },
  };
}
