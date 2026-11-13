import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Spot } from './types';

/** 临界阻尼附近的弹簧：x 追 goal。k 越大越快，z 是阻尼比（<1 会过冲一点） */
export class Spring {
  v = 0;
  constructor(public x = 0, public k = 30, public z = 0.9) {}
  step(goal: number, dt: number): number {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.k * this.k * (goal - this.x) - 2 * this.z * this.k * this.v;
      this.v += a * h; this.x += this.v * h;
    }
    return this.x;
  }
  set(x: number) { this.x = x; this.v = 0; }
}
export const ease = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
export const UP = new THREE.Vector3(0, 1, 0);

/** 由「站在哪、看向哪」得到镜头的前、右、上三个方向 */
export function basis(pos: THREE.Vector3, look: THREE.Vector3) {
  const f = new THREE.Vector3().subVectors(look, pos).normalize();
  const r = new THREE.Vector3().crossVectors(f, UP).normalize();
  const u = new THREE.Vector3().crossVectors(r, f).normalize();
  return { f, r, u };
}
/** 射线与水平面 y = h 的交点；朝上或平行时返回 null */
export function hitPlaneY(ray: THREE.Ray, h: number, out = new THREE.Vector3()): THREE.Vector3 | null {
  if (Math.abs(ray.direction.y) < 1e-5) return null;
  const t = (h - ray.origin.y) / ray.direction.y;
  if (t <= 0) return null;
  return out.copy(ray.origin).addScaledVector(ray.direction, t);
}
/** 射线与任意平面（过 p、法线 n）的交点 */
export function hitPlane(ray: THREE.Ray, p: THREE.Vector3, n: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 | null {
  const d = ray.direction.dot(n);
  if (Math.abs(d) < 1e-6) return null;
  const t = new THREE.Vector3().subVectors(p, ray.origin).dot(n) / d;
  if (t <= 0) return null;
  return out.copy(ray.origin).addScaledVector(ray.direction, t);
}

// —— 行者 ——
/** 朝向为 yaw 的人：前、右两个方向（他自己的右手边） */
export const fwdOf = (yaw: number, out = new THREE.Vector3()) => out.set(Math.sin(yaw), 0, Math.cos(yaw));
export const rightOf = (yaw: number, out = new THREE.Vector3()) => out.set(-Math.cos(yaw), 0, Math.sin(yaw));
/** 一件东西里的一点在世界的哪里 */
export const wpos = (o: THREE.Object3D, v = new THREE.Vector3()) => { o.updateWorldMatrix(true, false); return v.applyMatrix4(o.matrixWorld); };
/** 关节在世界的哪里 */
export const jpos = (o: THREE.Object3D, out = new THREE.Vector3()) => { o.updateWorldMatrix(true, false); return out.setFromMatrixPosition(o.matrixWorld); };

/**
 * 把一件东西交到手里：挂到掌心的挂点上（挂点的 +y 指向指尖、+z 是手心朝向）。返回「放回原处」。
 * pos / rot 是它在掌心里的摆法。
 */
export function hold(obj: THREE.Object3D, hand: THREE.Object3D, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]): () => void {
  const home = { parent: obj.parent, p: obj.position.clone(), q: obj.quaternion.clone(), s: obj.scale.clone() };
  // 挂点可能带着整体缩放：让东西保持原来在世界里的大小
  const ws = obj.getWorldScale(new THREE.Vector3()), hs = hand.getWorldScale(new THREE.Vector3());
  hand.add(obj);
  obj.position.set(...pos); obj.rotation.set(...rot); obj.scale.set(ws.x / hs.x, ws.y / hs.y, ws.z / hs.z);
  return () => { if (home.parent) home.parent.add(obj); else obj.removeFromParent(); obj.position.copy(home.p); obj.quaternion.copy(home.q); obj.scale.copy(home.s); };
}
/** 把一件东西临时拿到世界里自己摆（保持它此刻的位置与大小）。返回「放回原处」 */
export function lift(scene: THREE.Scene, obj: THREE.Object3D): () => void {
  const home = { parent: obj.parent, p: obj.position.clone(), q: obj.quaternion.clone(), s: obj.scale.clone() };
  scene.attach(obj);
  return () => { if (home.parent) home.parent.add(obj); obj.position.copy(home.p); obj.quaternion.copy(home.q); obj.scale.copy(home.s); };
}
/** 蒲团：顶面高、半径。坐上去时身子抬到顶面（小人的「坐」以臀下的面为地面），衣摆、脚落到垫子外的地上 */
export const SEAT = 0.14;
export const ZAFU = { h: SEAT, r: 0.31 };
/** 殿里的拜垫：顶面高（中间微陷，按 0.15 算）、半宽、半深 */
export const KNEELER = { h: 0.15, hx: 0.39, hz: 0.26 };
/**
 * 垫子不踩：人先走到垫子后面站定（脚尖离垫沿一点点），再往前跪 / 坐上去。
 * 给垫子中心与面朝的方向，算出站的地方；back 是站处离垫心多远。
 */
export const behind = (c: { x: number; z: number }, yaw: number, back: number): Spot => ({ x: c.x - Math.sin(yaw) * back, z: c.z - Math.cos(yaw) * back, yaw });
/** 蒲团后面站多远；拜垫后面站多远、跪下后 root（膝下的面）在垫心之后多少 */
export const ZAFU_BACK = 0.44, KNEEL_BACK = 0.42, KNEEL_ROOT = 0.36;
/** 人的常用几个量 */
export const who = (k: Anlewo) => k.player.av;
