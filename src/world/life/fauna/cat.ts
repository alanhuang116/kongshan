/**
 * 草堂的猫：乌云盖雪——一身白，背上、头顶、尾巴一片墨。
 * 好天的白天在松下的矮凳上，夜里、清早、雨天在屋里的榻上（没人看着的时候才挪地方）。
 * 多半蜷成一团睡着，肚子一起一伏；醒了先揣着手卧一会儿，再坐起来舔爪子、拿爪子抹脸，伸个懒腰（前腿往前一探、屁股翘起、尾巴竖着），
 * 转半圈又卧下。人慢慢走近它抬头看、耳朵朝前，有时跳下凳来蹭一蹭腿；人跑过来它一跃下凳，走开几步坐下舔毛，装作没事。
 * 「逗猫」那件事：它跳下来，伏低了盯着逗猫草，草停住的一刹那屁股一扭、扑上去，再拿前爪去拍。
 */
import * as THREE from 'three';
import { M, V, cyl, merge } from '../../core/geo';
import { mulberry32 } from '../../core/rng';
import { PIG, type RGB } from '../../ink/ink';
import type { Ctx } from '../person';
import { Parts, creatureMat, loftZ, paint, tone } from '../rig';
import { CAT, footY } from '../spots';
import { blocked } from '../../walk';
import { bump, camDist, ell, inView, lerp, rod, shadeBy, turnTo, wrap, type Day } from './kit';
import { Quad, limb, pose, type QuadDims } from './quad';

const W: RGB = [0.95, 0.945, 0.92], INKC = tone(PIG.mo, 2.1), PINK = tone([0.94, 0.66, 0.64], 1.0), EYE = tone([0.8, 0.72, 0.4], 1.6);
const D: QuadDims = { bodyY: 0.24, sh: [0.036, -0.01, 0.11], hip: [0.038, 0.0, -0.13], neck: [0.04, 0.165], tail: [0.03, -0.205], fu: 0.115, fl: 0.11, hu: 0.115, hl: 0.13, ear: [0.025, 0.088, 0.062] };
export function catGeo() {
  const body = shadeBy(loftZ([[-0.22, 0.0, 0.025, 0.03], [-0.19, 0.003, 0.046, 0.052], [-0.13, 0.006, 0.058, 0.066], [-0.05, 0.004, 0.052, 0.06], [0.03, 0.0, 0.054, 0.066], [0.1, 0.008, 0.056, 0.068], [0.155, 0.022, 0.044, 0.054], [0.185, 0.032, 0.03, 0.036]], 12, 1.06), (_x, y, z, o) => {
    const c = y > 0.016 && z < 0.12 && z > -0.2 ? INKC : W; o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  const head = merge([
    ell(0.039, 0.046, 0.044, W, 10, 8).translate(0, 0.028, 0.03),
    shadeBy(ell(0.05, 0.045, 0.047, W, 12, 9), (_x, y, z, o) => { const c = y > 0.012 && z < 0.032 ? INKC : W; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; }).translate(0, 0.074, 0.07),
    ell(0.024, 0.017, 0.02, W, 9, 6).translate(0, 0.058, 0.108),
    ell(0.006, 0.005, 0.004, PINK).translate(0, 0.067, 0.128),
    ell(0.009, 0.008, 0.004, EYE).translate(0.021, 0.081, 0.107), ell(0.009, 0.008, 0.004, EYE).translate(-0.021, 0.081, 0.107),
    ell(0.003, 0.007, 0.004, tone(PIG.jiao, 2.6)).translate(0.021, 0.081, 0.110), ell(0.003, 0.007, 0.004, tone(PIG.jiao, 2.6)).translate(-0.021, 0.081, 0.110),
  ]);
  const ear = paint(cyl(0.002, 0.024, 0.05, 4).scale(1, 1, 0.42).translate(0, 0.024, 0), INKC);
  const tail = rod([V(0, 0, 0), V(0, -0.02, -0.08), V(0, -0.01, -0.17), V(0, 0.035, -0.245)], 0.015, 0.009, INKC);
  const fu = limb(D.fu, 0.016, 0.012, W, { mass: [0.022, 0.045, 0.028, 0.025, 0] });
  const fl = limb(D.fl, 0.011, 0.0095, W, { foot: [0.015, 0.01, 0.02, 0.008] });
  const hu = limb(D.hu, 0.018, 0.012, W, { mass: [0.028, 0.06, 0.04, 0.04, 0.01], massC: W });
  const hl = limb(D.hl, 0.0105, 0.009, W, { foot: [0.015, 0.01, 0.02, 0.01] });
  return { body, head, tail, fu, fl, hu, hl, ear };
}
const STAND = pose({ y: 0.24, f: [0.05, -0.05, 0.05, -0.05], h: [-0.35, 0.68, -0.35, 0.68], tp: 0.75 });
const WALKP = pose({ ...STAND, tp: 1.15, np: 0.12 });
const SIT = pose({ y: 0.18, pitch: -0.8, f: [0.8, 0, 0.8, 0], h: [-0.35, 2.85, -0.35, 2.85], tp: 0.62, ty: 1.45, np: 0.45 });
const LOAF = pose({ y: 0.1, f: [-1.45, 2.9, -1.45, 2.9], h: [-1.4, 2.8, -1.4, 2.8], out: 0.2, tp: -0.15, ty: 1.35, np: 0.15 });
const CURL = pose({ y: 0.085, roll: 0.3, ny: 0.7, np: 0.95, nr: 0.35, tp: -0.2, ty: 1.55, f: [-1.1, 1.6, -1.2, 1.5], h: [-1.3, 2.6, -1.25, 2.6], out: 0.25, ear: 0.2 });
const STRETCH = pose({ y: 0.17, pitch: 0.36, f: [-1.25, -0.15, -1.25, -0.15], h: [-0.32, 0.62, -0.32, 0.62], tp: 1.35, np: -0.3 });
const CROUCH = pose({ y: 0.13, pitch: 0.06, f: [-0.62, 1.45, -0.62, 1.45], h: [-1.05, 2.3, -1.05, 2.3], np: -0.08, tp: -0.1, ear: 0.05 });
const GROOM = pose({ ...SIT, f: [-1.15, -1.55, 0.8, 0], np: 0.55, ny: 0.15 });
/** 台子上看用 */
export const CAT_POSES = { D, STAND, WALKP, SIT, LOAF, CURL, STRETCH, CROUCH, GROOM };

const enum S { Rest, Sit, Groom, Stretch, Turn, Down, Away, Back, Rub, Play }
const _v = new THREE.Vector3();

export class Cat {
  parts: Parts;
  q: Quad;
  pos = new THREE.Vector3();
  /** 在哪一处：屋里的榻上 / 松下的矮凳上 */
  where: 'couch' | 'bench' = 'couch';
  /** 在凳（榻）上，还是在地上 */
  private up = true; private jump = -1; private jy0 = 0; private jy1 = 0; private jx0 = 0; private jz0 = 0; private jx1 = 0; private jz1 = 0;
  private st: S = S.Rest; private t = 12; private R = mulberry32(77); private mew = 30; private last = 0;
  private lureP: THREE.Vector3 | null = null; private lureMove = 0; private lureStill = 0; private pounce = -1; private bat = -1;
  private rubT = 0;
  constructor() {
    this.parts = new Parts(creatureMat({ body: 0.5, shade: 1.4 }), 'cat');
    this.q = new Quad(this.parts, catGeo(), D);
    this.parts.build();
    const s = CAT.couch; this.q.x = s.x; this.q.z = s.z; this.q.yaw = s.yaw; this.q.snap(CURL);
  }
  /** 逗猫：给一根草梢的位置（世界坐标，每帧更新）与它此刻动着没有；null 收场（猫回凳上去） */
  lure(p: THREE.Vector3 | null, moving = false) {
    if (!p) { this.lureP = null; if (this.st === S.Play) { this.st = S.Back; this.t = 6; } return; }
    this.lureP = p;
    if (this.st !== S.Play) { this.st = S.Play; this.pounce = -1; this.bat = -1; }
    if (moving) { this.lureMove = Math.min(2, this.lureMove + 0.05); this.lureStill = 0; } else this.lureStill += 0.016;
  }
  /** 刚扑了一下（逗猫那件事数次数用） */
  pounced = 0;
  get onBench() { return this.where === 'bench' && this.up; }
  /** 此刻的座（凳、榻）在哪 */
  get seat() { return CAT[this.where]; }

  update(c: Ctx, day: Day, pv: number) {
    const q = this.q, P = this.parts, R = this.R;
    // 该在哪：没人看着的时候才挪地方
    const want = c.night < 0.3 && c.hour > 10 && c.hour < 16.8 && c.rain < 0.3 && c.snow < 0.3 ? 'bench' : 'couch';
    const S0 = CAT[this.where];
    const dist = camDist(c, q.x, q.z);
    const seen = inView(c, q.x, S0.y + 0.2, q.z, 0.6);
    if (want !== this.where && this.st !== S.Play && (c.wound || dist > 60 || !seen)) {
      this.where = want; const s = CAT[want]; q.x = s.x; q.z = s.z; q.yaw = s.yaw; this.up = true; this.st = S.Rest; this.t = 8 + R() * 20; q.snap(CURL); q.v = 0;
    }
    if (dist > 90) { if (!q.hidden) { q.hide(); P.commit(); } P.mesh.visible = false; return; }
    P.mesh.visible = true;
    const stride = !seen ? 6 : dist < 30 ? 1 : 2;
    this.last += c.dt;
    if (c.frame % stride && !c.wound) return;
    const dt = Math.min(0.25, this.last); this.last = 0;
    this.think(c, dt, pv);
    // 高度：在凳上是凳面，地上是地面；跳是一道弧
    const seat = CAT[this.where];
    let gy = this.up ? seat.y : footY(q.x, q.z);
    if (this.jump >= 0) {
      this.jump += dt / 0.5;
      const k = Math.min(1, this.jump);
      q.x = lerp(this.jx0, this.jx1, k); q.z = lerp(this.jz0, this.jz1, k);
      gy = lerp(this.jy0, this.jy1, k) + 0.28 * bump(k);
      q.cur.pitch = (this.jy1 < this.jy0 ? 0.35 : -0.35) * bump(k);
      if (k >= 1) this.jump = -1;
    }
    if (this.pounce >= 0) { gy += 0.16 * bump(this.pounce); }
    q.lift = this.st === S.Rest ? 0.003 * Math.sin(c.t * 1.5) : 0;
    q.gait = q.v > 1.2 ? 2 : 0;
    q.place(gy, dt, c.t, 0.42);
    this.pos.set(q.x, gy, q.z);
    P.commit();
  }
  /** 跳到 (x, y, z)：上凳、下凳 */
  private leap(x: number, y: number, z: number, toUp: boolean) {
    const q = this.q;
    this.jx0 = q.x; this.jz0 = q.z; this.jy0 = this.up ? CAT[this.where].y : footY(q.x, q.z);
    this.jx1 = x; this.jz1 = z; this.jy1 = y; this.jump = 0; this.up = toUp;
    q.yaw = Math.atan2(x - q.x, z - q.z);
  }
  private walk(tx: number, tz: number, speed: number, dt: number, stop = 0.08): number {
    const q = this.q, dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz);
    if (d < stop) { q.v = Math.max(0, q.v - dt * 4); return d; }
    const goal = Math.atan2(dx, dz);
    q.yaw = turnTo(q.yaw, goal, 5, dt);
    q.v += (speed * Math.max(0.1, Math.cos(wrap(goal - q.yaw))) * Math.min(1, 0.3 + d) - q.v) * Math.min(1, dt * 5);
    const nx = q.x + Math.sin(q.yaw) * q.v * dt, nz = q.z + Math.cos(q.yaw) * q.v * dt;
    if (!blocked(nx, nz, 'ground', 0.1)) { q.x = nx; q.z = nz; } else q.v *= 0.4;
    return d;
  }
  private think(c: Ctx, dt: number, pv: number) {
    const q = this.q, R = this.R, seat = CAT[this.where];
    const px = c.player.x, pz = c.player.z, pd = Math.hypot(px - q.x, pz - q.z), face = Math.atan2(px - q.x, pz - q.z);
    this.t -= dt; this.mew -= dt;
    if (this.jump >= 0) return;
    // 人跑过来：一跃下凳，走开几步
    if (pv > 2.2 && pd < 4 && this.st !== S.Away && this.st !== S.Play && this.where === 'bench') {
      const a = Math.atan2(q.x - px, q.z - pz);
      let tx = q.x + Math.sin(a) * 4.5, tz = q.z + Math.cos(a) * 4.5;
      if (blocked(tx, tz, 'ground', 0.2)) { tx = q.x + Math.sin(a + 1.2) * 3.5; tz = q.z + Math.cos(a + 1.2) * 3.5; }
      if (this.up) this.leap(q.x + Math.sin(a) * 0.8, footY(q.x, q.z), q.z + Math.cos(a) * 0.8, false);
      this.ax = tx; this.az = tz; this.st = S.Away; this.t = 14 + R() * 8;
      return;
    }
    if (pd < 1.8 && this.mew < 0 && this.st !== S.Play) { this.mew = 50 + R() * 40; c.sfx('cat', q.x, q.z, 0.3); }
    switch (this.st) {
      case S.Rest: {
        // 睡：蜷着；有人走近抬头看一眼
        q.goal = CURL;
        q.lookYaw = 0; q.lookPitch = 0;
        if (pd < 2.4) { q.goal = LOAF; q.lookYaw = Math.max(-1.2, Math.min(1.2, wrap(face - q.yaw))); q.cur.ear = 0; }
        if (this.t < 0) { const r = R(); this.t = 2 + R() * 2; this.st = r < 0.45 ? S.Sit : r < 0.75 ? S.Stretch : S.Groom; if (this.st === S.Groom) this.t = 4 + R() * 3; }
        // 人在跟前站了一会儿：有时跳下来蹭一蹭
        if (pd < 1.6 && pv < 0.3) { this.rubT += dt; if (this.rubT > 3 && R() < dt * 0.3 && this.where === 'bench') { this.st = S.Rub; this.t = 7; this.rubT = 0; this.leap(q.x + Math.sin(face) * 0.6, footY(q.x, q.z), q.z + Math.cos(face) * 0.6, false); } }
        else this.rubT = 0;
        break;
      }
      case S.Sit:
        q.goal = SIT; q.lookYaw = pd < 4 ? Math.max(-1, Math.min(1, wrap(face - q.yaw))) * 0.8 : 0.4 * Math.sin(c.t * 0.4);
        if (this.t < 0) { this.st = R() < 0.5 ? S.Groom : S.Turn; this.t = this.st === S.Groom ? 4 + R() * 4 : 1.6; }
        break;
      case S.Groom: {
        // 舔爪子、拿爪子抹脸：前爪抬到嘴边，头一下一下低
        q.goal = GROOM; q.lookYaw = 0;
        const k = Math.sin(c.t * 7);
        q.cur.np = 0.45 + 0.12 * k; q.cur.f[1] = -1.55 + 0.2 * k;
        if (this.t < 2 && this.t > 0) { q.cur.nr = 0.3 * Math.sin(c.t * 3); q.cur.f[0] = -1.4 + 0.15 * Math.sin(c.t * 5); }
        if (this.t < 0) { this.st = S.Turn; this.t = 1.6; }
        break;
      }
      case S.Stretch:
        q.goal = this.t > 0.9 ? STRETCH : STAND; q.rate = 3;
        if (this.t < 0) { q.rate = 4; this.st = S.Turn; this.t = 1.6; }
        break;
      case S.Turn:
        // 站起来转半圈，卧下
        q.goal = STAND; q.yaw += dt * 2.2;
        if (this.t < 0) { this.st = S.Down; this.t = 1; }
        break;
      case S.Down:
        q.goal = R() < 0.5 ? LOAF : CURL;
        if (this.t < 0) { this.st = S.Rest; this.t = 35 + R() * 50; }
        break;
      case S.Away: {
        // 走开几步，坐下舔毛，过一会儿再回凳上
        q.goal = q.v > 0.1 ? WALKP : this.t > 7 ? GROOM : SIT;
        if (q.goal === GROOM) { const k = Math.sin(c.t * 7); q.cur.np = 0.45 + 0.12 * k; }
        this.walk(this.ax, this.az, q.v > 0.5 || this.t > 12 ? 1.4 : 0.5, dt, 0.15);
        if (this.t < 0) { this.st = S.Back; this.t = 10; }
        break;
      }
      case S.Back: case S.Rub: {
        // 回凳上去（蹭腿的先在人脚边绕一圈）
        if (this.st === S.Rub && this.t > 2.5) {
          const a = c.t * 1.4, tx = px + Math.cos(a) * 0.42, tz = pz + Math.sin(a) * 0.42;
          q.goal = WALKP; this.walk(tx, tz, 0.45, dt, 0.05); q.cur.tp = 1.3;
          if (this.mew < 40 && R() < dt * 0.3) { this.mew = 45; c.sfx('purr', q.x, q.z, 0.3); }
          if (pd > 3) this.t = 2;
          break;
        }
        if (this.up) { this.st = S.Rest; this.t = 20 + R() * 30; q.goal = CURL; break; }
        q.goal = WALKP;
        const fx = seat.x + Math.sin(seat.yaw + Math.PI) * 0.0, fz = seat.z;
        const front = { x: seat.x - Math.sin(seat.yaw) * 0.55, z: seat.z - Math.cos(seat.yaw) * 0.55 };
        if (this.where === 'bench') {
          if (this.walk(front.x, front.z, 0.5, dt, 0.12) < 0.15) this.leap(fx, seat.y, fz, true);
        } else { q.x = seat.x; q.z = seat.z; this.up = true; }
        if (this.t < -10) { q.x = seat.x; q.z = seat.z; this.up = true; }
        break;
      }
      case S.Play: {
        const L = this.lureP;
        if (!L) { this.st = S.Back; break; }
        // 先跳下凳
        if (this.up) { const a = Math.atan2(L.x - q.x, L.z - q.z); this.leap(q.x + Math.sin(a) * 0.7, footY(q.x, q.z), q.z + Math.cos(a) * 0.7, false); break; }
        const dx = L.x - q.x, dz = L.z - q.z, d = Math.hypot(dx, dz), aim = Math.atan2(dx, dz);
        q.yaw = turnTo(q.yaw, aim, 4, dt);
        q.lookYaw = Math.max(-0.9, Math.min(0.9, wrap(aim - q.yaw)));
        q.lookPitch = Math.max(-0.6, Math.min(0.5, -(L.y - footY(q.x, q.z) - 0.15) * 1.2));
        this.lureMove = Math.max(0, this.lureMove - dt * 0.8);
        if (this.pounce >= 0) {
          // 扑：一纵，扑到草梢那里
          this.pounce += dt / 0.45;
          q.v = d > 0.12 ? 2.4 : 0; this.walk(L.x, L.z, 2.4, dt, 0.1);
          q.goal = STRETCH;
          if (this.pounce >= 1) { this.pounce = -1; this.bat = 0; this.pounced++; }
        } else if (this.bat >= 0) {
          // 拍：一只前爪抬起来左右拍
          this.bat += dt;
          q.goal = SIT; q.cur.f[0] = -1.3 + 0.5 * Math.sin(this.bat * 14); q.cur.f[1] = -0.6;
          if (this.bat > 1.4) this.bat = -1;
        } else {
          // 伏低盯着；草停住了屁股一扭就扑
          q.goal = d > 1.4 ? WALKP : CROUCH;
          if (d > 1.1) this.walk(L.x - Math.sin(aim) * 0.85, L.z - Math.cos(aim) * 0.85, 0.5, dt, 0.1); else q.v = Math.max(0, q.v - dt * 3);
          const wiggle = this.lureStill > 0.25 && this.lureMove > 0.3;
          if (wiggle) q.cur.roll = 0.12 * Math.sin(c.t * 22);
          if (wiggle && this.lureStill > 0.7 && d < 1.3) { this.pounce = 0; this.lureMove = 0; }
          q.cur.tp = -0.05 + 0.2 * Math.sin(c.t * 5);
        }
        break;
      }
    }
  }
  private ax = 0; private az = 0;
}
void _v;
