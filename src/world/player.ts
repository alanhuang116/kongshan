/**
 * 行者：你操纵的那个小人在世界里怎么走。
 *   输入是一个相对镜头的方向（键盘 WASD、摇杆）；也可以给一个地点让他自己走过去（点地面、走向某件事）。
 *   每一步都问 walk.ts「能不能到」：碰到篱笆、树石顺着滑，过溪走桥或踏石，不会从桥上掉下去。
 *   几处为了「像人」：掉头时先慢下来、转过身再走（转身有个上限，不是一帧翻面）；
 *     上下台阶时身子按坡走（取前后一步之内地面的平均），不是一级一顿。
 *   位置与朝向写到小人的 root 上；身体怎么动（步态、姿势）是小人自己的事（avatar/）。
 */
import * as THREE from 'three';
import type { Avatar } from './avatar/types';
import { findPath, groundAt, move, standable, type Zone } from './walk';

/** 平时是从容地走——这里是散步的地方；按住 Shift、摇杆推到头才快走几步 */
export const WALK = 1.4, FAST = 3.0;
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

/** 自己走的一条路：pts 是依次要到的点，i 是正往哪一个去 */
interface Goal { pts: Array<[number, number]>; i: number; r: number; then?: () => void; fail?: () => void; t: number; mark: number; d0: number }

export class Player {
  pos = new THREE.Vector3();
  yaw = Math.PI;
  zone: Zone = 'ground';
  /** 相对镜头的输入：x 右、y 前，长度 ≤ 1 */
  input = new THREE.Vector2();
  fast = false;
  /** 正在做事：不听行走的输入 */
  locked = false;
  /** 此刻的地面速度（米/秒） */
  speed = 0;
  /** 身子另外抬高多少（坐在蒲团上、蹲在池岸上时由活动设；有缓动） */
  lift = 0; private liftS = 0;
  /** 站定后该转向哪（弧度）；null 则保持 */
  faceTo: number | null = null;
  onStep: ((foot: 'L' | 'R') => void) | null = null;
  private vel = new THREE.Vector2();
  private goal: Goal | null = null;
  private ground = 0; private climb = 0;
  /** 转身最快多少（弧度/秒） */
  static TURN = 7.5;
  private settle: { x: number; z: number; t: number } | null = null;
  private slide: { x0: number; z0: number; x1: number; z1: number; t: number; dur: number } | null = null;

  constructor(scene: THREE.Scene, public av: Avatar) {
    scene.add(av.root);
    av.onStep = (f) => this.onStep?.(f);
    // 告诉小人脚下真实的地面（台阶是一级一级的）：脚踩在踏面上，不陷、不悬
    // （只报与脚下相差不到两级的高度：台沿外、水面上那些走不到的地方不算数，免得脚去够它）
    av.setGround?.((x, z) => { const g = groundAt(x, z, this.zone); return g == null || Math.abs(g - this.ground) > 0.4 ? null : g; });
  }

  get moving() { return this.speed > 0.08; }
  get walking() { return !!this.goal; }

  /** 直接放到某处（换处、上下楼） */
  teleport(x: number, z: number, yaw: number, zone: Zone = 'ground') {
    this.zone = zone; this.goal = null; this.settle = null; this.slide = null; this.vel.set(0, 0); this.speed = 0; this.faceTo = null; this.lift = this.liftS = 0;
    const y = groundAt(x, z, zone) ?? 0;
    this.pos.set(x, y, z); this.ground = y; this.yaw = yaw;
    this.apply();
  }
  /**
   * 自己走过去（会找路：绕开挡着的东西，该过桥过桥、该上踏跺上踏跺）。
   * 到了（离终点 r 以内）调用 then；没有路、或半路卡住，调用 fail。
   */
  goTo(x: number, z: number, o: { r?: number; then?: () => void; fail?: () => void } = {}) {
    const pts = findPath(this.pos.x, this.pos.z, this.ground, x, z, this.zone) ?? [[x, z]];
    const p0 = pts[0];
    this.goal = { pts, i: 0, r: o.r ?? 0.14, then: o.then, fail: o.fail, t: 0, mark: 0, d0: Math.hypot(p0[0] - this.pos.x, p0[1] - this.pos.z) };
    this.faceTo = null; this.settle = null;
  }
  /** 正走着的那条路（给调试与测试看） */
  get path() { return this.goal ? this.goal.pts.slice(this.goal.i) : null; }
  stop() { this.goal = null; this.vel.set(0, 0); }
  /** 不问挡不挡，迈一小步挪到准确的位置（走到一件事跟前的最后半步；脚是真的在走，不是滑过去） */
  settleAt(x: number, z: number) { this.settle = { x, z, t: 0 }; this.goal = null; this.vel.set(0, 0); }
  /**
   * 身子不迈步地送过去（跪上拜垫、坐上蒲团时身子往前落的那一段；起身时退回来）：dur 秒内缓缓到位。
   * 这一段脚不走，由姿态的过渡把动作带过去。
   */
  slideTo(x: number, z: number, dur = 1) { this.slide = { x0: this.pos.x, z0: this.pos.z, x1: x, z1: z, t: 0, dur }; this.goal = null; this.settle = null; this.vel.set(0, 0); }
  /** 站定了：不在走、不在挪、身子也转好了 */
  get settled() { return !this.goal && !this.settle && !this.slide && this.faceTo == null && this.speed < 0.06; }

  /** 身前身后一步之内的地面：平均高度（身子按它走）与坡度（给小人的步态） */
  private ramp(): { y: number; slope: number } {
    const dx = Math.sin(this.yaw), dz = Math.cos(this.yaw), g0 = this.ground;
    let sum = 0, a = g0, b = g0;
    for (let i = -2; i <= 2; i++) {
      let g = groundAt(this.pos.x + dx * i * 0.085, this.pos.z + dz * i * 0.085, this.zone);
      if (g == null || Math.abs(g - g0) > 0.4) g = g0;
      sum += g;
      if (i === -2) a = g; else if (i === 2) b = g;
    }
    return { y: sum / 5, slope: (b - a) / 0.34 };
  }

  private apply() {
    const r = this.av.root;
    r.position.copy(this.pos); r.position.y += this.liftS; r.rotation.y = this.yaw;
  }

  update(dt: number, t: number, camYaw: number) {
    let wx = 0, wz = 0, mag = 0;
    const manual = !this.locked && this.input.lengthSq() > 0.0009;
    if (manual) {
      // 手一动，自己走的那条路就作罢
      this.goal = null; this.faceTo = null; this.settle = null;
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      wx = rx * this.input.x + fx * this.input.y; wz = rz * this.input.x + fz * this.input.y;
      mag = Math.min(1, Math.hypot(wx, wz)); const l = Math.hypot(wx, wz) || 1; wx /= l; wz /= l;
    } else if (this.goal) {
      const g = this.goal;
      let p = g.pts[g.i], dx = p[0] - this.pos.x, dz = p[1] - this.pos.z, d = Math.hypot(dx, dz);
      g.t += dt;
      // 中途的拐点：走到跟前就奔下一个
      while (g.i < g.pts.length - 1 && d < 0.2) { g.i++; p = g.pts[g.i]; dx = p[0] - this.pos.x; dz = p[1] - this.pos.z; d = Math.hypot(dx, dz); g.mark = g.t; g.d0 = d; }
      const last = g.i === g.pts.length - 1;
      if (last && d < g.r) { this.goal = null; this.vel.set(0, 0); g.then?.(); }
      else {
        // 快到终点时慢下来，正好停在那里；拐点处不停
        wx = dx / Math.max(d, 1e-4); wz = dz / Math.max(d, 1e-4); mag = last ? Math.min(1, 0.22 + d / 0.9) : 1;
        // 走不动了（被挡着）或走了太久：算走不到
        if (g.t - g.mark > 0.8) { if (g.d0 - d < 0.1) { this.goal = null; this.vel.set(0, 0); g.fail?.(); } else { g.mark = g.t; g.d0 = d; } }
        if (g.t > 90) { this.goal = null; g.fail?.(); }
      }
    }
    // 要去的方向与身子朝向差得多（掉头、急拐）：先慢下来，转过身再走
    const off = mag > 0 ? Math.abs(wrap(Math.atan2(wx, wz) - this.yaw)) : 0;
    // 台阶、坡上走得慢些（一步一级，不赶）
    const slow = 1 - 0.4 * Math.min(1, Math.abs(this.climb) / 0.4);
    const top = (this.fast || (manual && mag > 0.94) ? FAST : WALK) * mag * slow * (0.28 + 0.72 * Math.max(0, Math.cos(Math.min(off, Math.PI / 2))) ** 0.6);
    const k = Math.min(1, dt * (mag > 0 ? 8 : 11));
    this.vel.x += (wx * top - this.vel.x) * k; this.vel.y += (wz * top - this.vel.y) * k;
    const sp = this.vel.length();
    let turn = 0;
    if (this.slide) {
      const s = this.slide; s.t = Math.min(1, s.t + dt / s.dur);
      const e = s.t * s.t * (3 - 2 * s.t);
      this.pos.x = s.x0 + (s.x1 - s.x0) * e; this.pos.z = s.z0 + (s.z1 - s.z0) * e;
      this.speed += (0 - this.speed) * Math.min(1, dt * 10);
      if (s.t >= 1) this.slide = null;
    } else if (this.settle) {
      // 最后这一小步：朝准确的位置挪过去，最快每秒 0.8 米；把挪动的速度告诉小人，他的脚就跟着迈
      const s = this.settle; s.t += dt;
      const dx = s.x - this.pos.x, dz = s.z - this.pos.z, d = Math.hypot(dx, dz), stepD = Math.min(d, Math.min(0.8, 0.12 + d * 4) * dt);
      if (d > 1e-4) { this.pos.x += (dx / d) * stepD; this.pos.z += (dz / d) * stepD; }
      const y = groundAt(this.pos.x, this.pos.z, this.zone); if (y != null) this.ground = y;
      this.speed += ((d > 0.02 ? stepD / Math.max(dt, 1e-3) : 0) - this.speed) * Math.min(1, dt * 12);
      if (d < 0.004 || s.t > 1.6) this.settle = null;
    } else if (sp > 0.03) {
      const px = this.pos.x, pz = this.pos.z;
      const n = move({ x: px, y: this.ground, z: pz, zone: this.zone }, px + this.vel.x * dt, pz + this.vel.y * dt);
      const moved = Math.hypot(n.x - px, n.z - pz);
      this.pos.x = n.x; this.pos.z = n.z; this.ground = n.y;
      this.speed += (moved / Math.max(dt, 1e-3) - this.speed) * Math.min(1, dt * 12);
      // 身子转向要去的方向（有输入时看输入，没有就看余速）；转得再急也有个上限
      const want = mag > 0 ? Math.atan2(wx, wz) : Math.atan2(this.vel.x, this.vel.y), d = wrap(want - this.yaw);
      const step = Math.max(-Player.TURN * dt, Math.min(Player.TURN * dt, d * Math.min(1, dt * 10)));
      this.yaw = wrap(this.yaw + step); turn = step / Math.max(dt, 1e-3);
    } else {
      this.speed += (0 - this.speed) * Math.min(1, dt * 10);
      if (this.faceTo != null) { const d = wrap(this.faceTo - this.yaw), step = Math.max(-Player.TURN * dt, Math.min(Player.TURN * dt, d * Math.min(1, dt * 7))); this.yaw = wrap(this.yaw + step); turn = step / Math.max(dt, 1e-3); if (Math.abs(d) < 0.01) this.faceTo = null; }
    }
    // 高度：走着的时候按坡走（台阶是一级一级的，身子却不该一顿一顿）；站定了就落在脚下那一级上
    const rp = this.ramp(), k2 = Math.min(1, this.speed / 0.7);
    this.climb += (rp.slope * k2 - this.climb) * Math.min(1, dt * 8);
    this.pos.y += (this.ground + (rp.y - this.ground) * k2 - this.pos.y) * Math.min(1, dt * 12);
    this.liftS += (this.lift - this.liftS) * Math.min(1, dt * 5);
    this.apply();
    this.av.update(dt, t, { speed: this.speed < 0.05 ? 0 : this.speed, climb: this.climb, turn });
  }

  /** 把画面上点到的地方（一条射线）换成能站的地点；点在墙上、水里则 null */
  pickGround(ray: THREE.Ray): THREE.Vector3 | null {
    let y = this.pos.y;
    const p = new THREE.Vector3();
    for (let i = 0; i < 3; i++) {
      if (Math.abs(ray.direction.y) < 1e-4) return null;
      const s = (y - ray.origin.y) / ray.direction.y;
      if (s <= 0 || s > 80) return null;
      p.copy(ray.origin).addScaledVector(ray.direction, s);
      const g = groundAt(p.x, p.z, this.zone);
      if (g == null) return null;
      if (Math.abs(g - y) < 0.05) break;
      y = g;
    }
    return standable(p.x, p.z, this.zone) == null ? null : p.setY(y);
  }
  setVisible(v: boolean) { this.av.setVisible(v); }
}
