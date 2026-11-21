/**
 * 四条腿的牲口共用的骨架：身、头颈、尾、两耳、四条两节的腿（上节、下节）。
 * 每一种自己捏这几块的形（狗、猫、羊、驴、鹿……），这里只管「怎么摆」：
 *   姿态（站、坐、卧、蜷、翻肚皮……）是一组数，换姿态时各项慢慢过渡过去；
 *   走起来在姿态上叠步态：慢走是四拍（左后、左前、右后、右前）、小跑是对角的两条一起、跑是前两条一起后两条一起（跳着跑）。
 * 腿的角都在身子自己的坐标里：正的往后摆、负的往前伸；下节的角是相对上节的。
 */
import * as THREE from 'three';
import { cyl, merge, type Geo } from '../../core/geo';
import type { RGB } from '../../ink/ink';
import { child, paint, trs, type Parts } from '../rig';
import { ell, lerp } from './kit';

/**
 * 一节腿：自原点（关节）往下 len，粗 r0→r1；关节处各一个小球（接缝不露）；
 * mass 是这一节上端的一团肉（大腿、上臂：[半宽, 半高, 半深, 往下挪多少, 往前挪多少]）；foot 是末端的蹄、爪。
 */
export function limb(len: number, r0: number, r1: number, c: RGB, o: { mass?: [number, number, number, number, number]; massC?: RGB; foot?: [number, number, number, number]; footC?: RGB; seg?: number; joint?: boolean } = {}): Geo {
  const seg = o.seg ?? 7, g: Geo[] = [paint(cyl(r1, r0, len, seg).translate(0, -len / 2, 0), c)];
  if (o.joint !== false) { g.push(ell(r0 * 1.02, r0 * 1.02, r0 * 1.02, c, seg, 5)); g.push(ell(r1 * 1.08, r1 * 1.08, r1 * 1.08, c, seg, 5).translate(0, -len, 0)); }
  if (o.mass) { const [a, b, d, dy, dz] = o.mass; g.push(ell(a, b, d, o.massC ?? c, 9, 7).translate(0, -dy, dz)); }
  if (o.foot) { const [a, b, d, dz] = o.foot; g.push(ell(a, b, d, o.footC ?? c, 7, 5).translate(0, -len + b * 0.3, dz)); }
  return merge(g);
}

export interface QuadDims {
  /** 站着时身子中心离地多高 */ bodyY: number;
  /** 肩、髋在身子里的位置（x 取一侧） */ sh: [number, number, number]; hip: [number, number, number];
  /** 颈根、尾根 */ neck: [number, number]; tail: [number, number];
  /** 前腿上下两节、后腿上下两节的长 */ fu: number; fl: number; hu: number; hl: number;
  /** 耳根（一侧）：有单独会动的耳朵时给 */ ear?: [number, number, number];
}
export interface QuadGeo { body: Geo; head: Geo; tail: Geo; fu: Geo; fl: Geo; hu: Geo; hl: Geo; ear?: Geo; earR?: Geo }
/** 一个姿态：身子的高低俯仰侧滚、头颈、尾、四条腿（[左前上, 左前下, 右前上, 右前下] 与后腿同样）、腿往外撇多少、耳朵（0 竖着 … 1 耷拉/往后贴） */
export interface Pose { y: number; pitch: number; roll: number; ny: number; np: number; nr: number; tp: number; ty: number; f: [number, number, number, number]; h: [number, number, number, number]; out: number; ear: number }
export const pose = (o: Partial<Pose> & { y: number }): Pose => ({ pitch: 0, roll: 0, ny: 0, np: 0, nr: 0, tp: 0, ty: 0, f: [0, 0, 0, 0], h: [0, 0, 0, 0], out: 0, ear: 0, ...o });
const P0 = (): Pose => pose({ y: 0 });
export function copyPose(a: Pose, b: Pose) { a.y = b.y; a.pitch = b.pitch; a.roll = b.roll; a.ny = b.ny; a.np = b.np; a.nr = b.nr; a.tp = b.tp; a.ty = b.ty; a.out = b.out; a.ear = b.ear; for (let i = 0; i < 4; i++) { a.f[i] = b.f[i]; a.h[i] = b.h[i]; } }
/** a 往 b 走 k（0…1） */
export function blendPose(a: Pose, b: Pose, k: number) {
  a.y = lerp(a.y, b.y, k); a.pitch = lerp(a.pitch, b.pitch, k); a.roll = lerp(a.roll, b.roll, k); a.ny = lerp(a.ny, b.ny, k); a.np = lerp(a.np, b.np, k); a.nr = lerp(a.nr, b.nr, k);
  a.tp = lerp(a.tp, b.tp, k); a.ty = lerp(a.ty, b.ty, k); a.out = lerp(a.out, b.out, k); a.ear = lerp(a.ear, b.ear, k);
  for (let i = 0; i < 4; i++) { a.f[i] = lerp(a.f[i], b.f[i], k); a.h[i] = lerp(a.h[i], b.h[i], k); }
}

const _b = new THREE.Matrix4(), _m = new THREE.Matrix4(), _n = new THREE.Matrix4(), _y = new THREE.Matrix4();

/** 一只四足的：位置、朝向、速度、步相，此刻的姿态 */
export class Quad {
  x = 0; z = 0; yaw = 0; v = 0; ph = 0;
  /** 此刻的姿态（摆的时候用）与要去的姿态 */
  cur: Pose = P0(); goal: Pose = P0();
  /** 每秒往目标姿态走多快 */
  rate = 4;
  /** 步态：0 慢走（四拍）、1 小跑（对角）、2 跑（前后两对跳着跑）——按速度自己定，也可以外面定 */
  gait = 0;
  /** 尾巴摇的幅度、快慢；头另外加的转角（看人）；身子另外加的高低（呼吸、颠） */
  wag = 0; wagRate = 10; lookYaw = 0; lookPitch = 0; lift = 0;
  /** 两耳各自另外转一点（抖耳朵） */
  earTw: [number, number] = [0, 0];
  readonly k: { body: number; head: number; tail: number; legs: number[]; ears: number[] };
  constructor(private P: Parts, g: QuadGeo, readonly D: QuadDims, readonly s = 1) {
    this.k = {
      body: P.add(g.body), head: P.add(g.head), tail: P.add(g.tail),
      legs: [P.add(g.fu), P.add(g.fl), P.add(g.fu), P.add(g.fl), P.add(g.hu), P.add(g.hl), P.add(g.hu), P.add(g.hl)],
      ears: g.ear ? [P.add(g.ear), P.add(g.earR ?? g.ear)] : [],
    };
  }
  /** 换成某个姿态（立刻，不过渡） */
  snap(p: Pose) { copyPose(this.cur, p); copyPose(this.goal, p); }
  /** 全收起来 */
  hide() { const K = this.k; this.P.hide(K.body); this.P.hide(K.head); this.P.hide(K.tail); for (const l of K.legs) this.P.hide(l); for (const e of K.ears) this.P.hide(e); }
  get hidden() { return this.P.hidden(this.k.body); }
  /**
   * 摆：gy 脚下地面高；dt 这一步的时长；t 时间；stride 步幅（米，一个步态周期走多远）。
   * 返回身子的世界矩阵（外面要往身上挂东西时用）。
   */
  place(gy: number, dt: number, t: number, stride: number): THREE.Matrix4 {
    const P = this.P, K = this.k, D = this.D, s = this.s, c = this.cur, g = this.goal;
    blendPose(c, g, Math.min(1, dt * this.rate));
    if (this.v > 0.01) this.ph += (this.v * dt) / (stride * s) * Math.PI * 2;
    const walk = Math.min(1, this.v / (0.25 * s)), ph = this.ph, gait = this.gait;
    // 步态：每条腿的相位
    // 腿的次序：左前、右前、左后、右后。慢走：左后→左前→右后→右前
    const off = gait === 0 ? [0.25, 0.75, 0, 0.5] : gait === 1 ? [0, 0.5, 0.5, 0] : [0, 0.08, 0.5, 0.58];
    const amp = gait === 2 ? 0.75 : gait === 1 ? 0.5 : 0.36;
    const bob = gait === 2 ? 0.05 * Math.sin(ph * 2) : 0.012 * Math.abs(Math.sin(ph));
    const pitchG = gait === 2 ? 0.1 * Math.sin(ph) * walk : 0;
    trs(_y, this.x, gy, this.z, this.yaw);
    child(_b, _y, 0, (c.y + this.lift) * s + bob * walk * s, 0, 0, c.pitch + pitchG, c.roll, s);
    P.place(K.body, _b);
    P.place(K.head, child(_m, _b, 0, D.neck[0], D.neck[1], c.ny + this.lookYaw, c.np + this.lookPitch + 0.05 * walk * Math.sin(ph * 2 + 0.5), c.nr));
    if (K.ears.length && D.ear) {
      // 耳朵挂在头上：取头的矩阵再往上接
      for (let i = 0; i < 2; i++) {
        const sx = i ? -1 : 1;
        child(_n, _m, sx * D.ear[0], D.ear[1], D.ear[2], sx * (0.15 + 0.5 * c.ear) + this.earTw[i], -0.9 * c.ear + 0.3 * this.earTw[i], sx * (0.25 + 0.9 * c.ear));
        P.place(K.ears[i], _n);
      }
    }
    P.place(K.tail, child(_m, _b, 0, D.tail[0], D.tail[1], c.ty + this.wag * Math.sin(t * this.wagRate), c.tp, 0));
    for (let i = 0; i < 4; i++) {
      const front = i < 2, sx = i % 2 ? -1 : 1, A = front ? D.sh : D.hip, L1 = front ? D.fu : D.hu;
      const q = (ph / (Math.PI * 2) + off[i]) * Math.PI * 2, sw = Math.sin(q), lifting = Math.max(0, -Math.cos(q));
      const u = (front ? c.f[(i % 2) * 2] : c.h[(i % 2) * 2]) + amp * walk * sw;
      const l = (front ? c.f[(i % 2) * 2 + 1] : c.h[(i % 2) * 2 + 1]) + walk * (front ? 0.9 : 0.7) * lifting * (gait === 2 ? 1.3 : 1);
      child(_m, _b, sx * A[0], A[1], A[2], 0, u, sx * c.out);
      P.place(K.legs[i * 2], _m);
      P.place(K.legs[i * 2 + 1], child(_n, _m, 0, -L1, 0, 0, l, 0));
    }
    return _b;
  }
}
