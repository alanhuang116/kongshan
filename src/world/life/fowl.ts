/**
 * 禽：白鹭（河滩浅水里，人近了就飞）、麻雀（篱上的一群；老梅上打架的那两只）、燕子（春夏贴着田飞；檐下一窝）、丁家的两只白鹅。
 * 鸡、鸭挪到了 fauna/hens.ts、fauna/ducks.ts（三群鸡与鸡埘、溪上一群鸭与鸭栏、池里一对鸳鸯）。
 * 都照旧画里的样子：一个身子、一截颈、几点颜色。每一种是一个几何（一次绘制），见 rig.ts。
 */
import * as THREE from 'three';
import { M, V, box, cyl, merge, sphere, sweep, type Geo } from '../core/geo';
import { mulberry32 } from '../core/rng';
import type { Season } from '../env/atmos';
import { PIG, U, type RGB } from '../ink/ink';
import { SITE, STREAM, ground } from '../site';
import type { Ctx } from './person';
import { Parts, child, creatureMat, paint, tone, trs } from './rig';
import { COOPS, DUCK_REACH, FENCE_PERCH, GEESE, NEST, PLUM_PERCH, egretSpots, footY, type Spot } from './spots';

const SUN: Record<Season, [number, number]> = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] };
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const sm = (k: number) => { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
const _b = new THREE.Matrix4(), _m = new THREE.Matrix4(), _y = new THREE.Matrix4(), _p = new THREE.Vector3();
/** 一个椭球 */
const ell = (rx: number, ry: number, rz: number, c: RGB, ws = 8, hs = 6) => paint(sphere(1, ws, hs).scale(rx, ry, rz), c);
/** 一个朝 +z 的小尖（喙） */
const beak = (r: number, len: number, c: RGB) => paint(cyl(0.0005, r, len, 5).applyMatrix4(M.rx(Math.PI / 2)), c);
const RED = tone(PIG.zhu, 1.1), OCHRE = tone([0.93, 0.8, 0.5], 1.4), INK = tone(PIG.jiao, 2.2), WHITE: RGB = [0.97, 0.97, 0.95];

// ———————————————————————— 白鹭 ————————————————————————
interface Egret { x: number; z: number; y: number; yaw: number; hx: number; hz: number; hyaw: number; state: number; t: number; a: number; cx: number; cz: number; r: number; stab: number; ph: number; k: number[]; lx: number; lz: number; ly: number; lyaw: number }
export class Egrets {
  parts: Parts;
  private birds: Egret[] = [];
  private R = mulberry32(53);
  /** 各自站的地方（要等地面备好了才定得下来） */
  private home: Spot[] = egretSpots();
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 1, shade: 1.35 }), 'egrets'));
    const neck = paint(sweep([V(0, 0.44, 0.1), V(0, 0.56, 0.16), V(0, 0.67, 0.11), V(0, 0.76, 0.14)], [[-0.018, -0.018], [0.018, -0.018], [0.018, 0.018], [-0.018, 0.018]], { scale: (t) => 1.25 - 0.45 * t, up: V(1, 0, 0) }), WHITE);
    // （先按「脚在原点」捏，再整个往下挪一条腿长：身子的原点在髋）
    const body = merge([ell(0.065, 0.07, 0.15, WHITE, 9, 6).applyMatrix4(M.mul(M.t(0, 0.4, 0), M.rx(-0.45))), neck, ell(0.024, 0.022, 0.034, WHITE).translate(0, 0.775, 0.155), beak(0.01, 0.1, OCHRE).applyMatrix4(M.mul(M.t(0, 0.768, 0.235), M.rx(0.12))), ell(0.012, 0.03, 0.06, WHITE).applyMatrix4(M.mul(M.t(0, 0.33, -0.15), M.rx(0.5)))]).translate(0, -0.36, 0.02);
    const leg = paint(cyl(0.006, 0.006, 0.34, 4).translate(0, -0.17, 0), INK);
    const wing = ell(0.23, 0.01, 0.1, WHITE, 7, 4).translate(0.23, 0, -0.02);
    const wingR = ell(0.23, 0.01, 0.1, WHITE, 7, 4).translate(-0.23, 0, -0.02);
    for (const s of this.home) this.birds.push({ x: s.x, z: s.z, y: 0, yaw: s.yaw, hx: s.x, hz: s.z, hyaw: s.yaw, state: 0, t: this.R() * 8, a: 0, cx: 0, cz: 0, r: 0, stab: 0, ph: this.R() * 6, k: [P.add(body), P.add(leg), P.add(leg), P.add(wing), P.add(wingR)], lx: 0, lz: 0, ly: 0, lyaw: 0 });
    P.build();
  }
  update(c: Ctx) {
    const [sr, ss] = SUN[c.season], P = this.parts, R = this.R, dt = c.dt;
    const out = c.season !== 'winter' && c.hour > sr && c.hour < ss + 0.3 && c.rain < 0.7 && c.snow < 0.3;
    P.mesh.visible = out && c.camPos.distanceTo(_p.set(this.home[0].x, c.camPos.y, this.home[0].z)) < 320;
    if (!P.mesh.visible) { for (const b of this.birds) { b.state = 0; b.x = b.hx; b.z = b.hz; b.yaw = b.hyaw; } return; }
    // 人走近了：一只惊起，别的跟着飞
    let alarm = false;
    for (const b of this.birds) if (b.state === 0 && Math.hypot(c.player.x - b.x, c.player.z - b.z) < 12) alarm = true;
    this.birds.forEach((b, i) => {
      const wy = -1 + 0.02;
      if (b.state === 0) {
        b.y = Math.max(footY(b.x, b.z), wy - 0.22);
        if (alarm) { b.state = 1; b.t = -0.25 * i; b.a = 0; b.lx = b.x; b.lz = b.z; b.ly = b.y; b.lyaw = b.yaw; }
        else { b.t -= dt; if (b.t < 0) { b.t = 9 + R() * 16; b.stab = 0.5; } if (b.stab > 0) b.stab -= dt; }
      } else {
        // 飞：起来朝河心兜一个大圈，再落回原处（人还在那儿就落到上游几十步外）
        b.t += dt;
        if (b.t > 0) {
          const T = 21 + i * 1.5, k = Math.min(1, b.t / T), away = Math.hypot(c.player.x - b.hx, c.player.z - b.hz) < 16;
          const R0 = 26 + i * 4, cx = b.lx + 8, cz = b.lz + R0 + 6, a0 = Math.atan2(b.lz - cz, b.lx - cx), a = a0 - k * Math.PI * 2 * 1.0;
          const tx = away && k > 0.5 ? b.hx - 30 : b.hx, tz = away && k > 0.5 ? b.hz + 4 : b.hz;
          const land = sm((k - 0.8) / 0.2), rise = sm(k / 0.12);
          const px = lerp(cx + Math.cos(a) * R0, tx, land), pz = lerp(cz + Math.sin(a) * R0, tz, land), py = lerp(b.ly, b.ly + (6 + i * 1.6) * rise, 1 - land) + 0.25 * Math.sin(b.t * 0.9);
          const dx = px - b.x, dz = pz - b.z;
          if (dx * dx + dz * dz > 1e-6) b.yaw = Math.atan2(dx, dz);
          b.x = px; b.z = pz; b.y = py;
          if (k >= 1) { b.state = 0; b.t = 4 + R() * 6; b.hx = b.x; b.hz = b.z; b.yaw = b.hyaw; if (!away) { b.hx = this.home[i].x; b.hz = this.home[i].z; } }
        }
      }
      const fly = b.state === 1 && b.t > 0 ? sm(Math.min(1, b.t * 2.2)) * (1 - sm((b.t / (21 + i * 1.5) - 0.94) / 0.06)) : 0;
      b.ph += dt * (fly > 0 ? 15 : 0);
      const stab = b.stab > 0 ? Math.sin((b.stab / 0.5) * Math.PI) : 0;
      // 身子绕着髋转（啄鱼时探下去、飞的时候放平）；腿在髋上另转：站着是直的，飞的时候朝后拖着
      trs(_y, b.x, b.y + 0.34, b.z, b.yaw);
      child(_b, _y, 0, 0, 0, 0, 0.95 * stab + 0.62 * fly, 0);
      P.place(b.k[0], _b);
      for (let n = 0; n < 2; n++) P.place(b.k[1 + n], child(_m, _y, n ? -0.03 : 0.03, 0, 0, 0, 1.4 * fly, 0));
      const flap = Math.sin(b.ph) * 0.8 + 0.15;
      for (let n = 0; n < 2; n++) {
        const s = n ? -1 : 1;
        // 收着：贴在身侧朝后；张开：朝两边平伸，上下扇
        child(_m, _b, s * 0.05, 0.08, 0.04, lerp(s * 1.45, 0, fly), -0.45 * (1 - fly), s * lerp(-0.25, flap, fly), lerp(0.62, 1.15, fly));
        P.place(b.k[3 + n], _m);
      }
    });
    P.commit();
  }
}

// ———————————————————————— 麻雀、燕子 ————————————————————————
function sparrowGeo(): { body: Geo; wing: Geo; wingR: Geo } {
  const brown = tone([0.78, 0.66, 0.54], 1.7), pale: RGB = [0.9, 0.87, 0.8], cap = tone([0.72, 0.58, 0.48], 2.2);
  const b = ell(0.028, 0.03, 0.045, brown, 7, 5).translate(0, 0.035, 0);
  const col = b.attributes.color as THREE.BufferAttribute, pos = b.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) if (pos.getY(i) < 0.03) col.setXYZ(i, pale[0], pale[1], pale[2]);
  return {
    body: merge([b, ell(0.021, 0.02, 0.022, cap).translate(0, 0.062, 0.03), ell(0.014, 0.011, 0.012, pale).translate(0, 0.055, 0.042), beak(0.006, 0.016, INK).translate(0, 0.06, 0.056), paint(box(0.022, 0.004, 0.055).applyMatrix4(M.mul(M.t(0, 0.04, -0.06), M.rx(-0.35))), brown)]),
    wing: ell(0.05, 0.004, 0.026, brown, 5, 3).translate(0.045, 0, 0), wingR: ell(0.05, 0.004, 0.026, brown, 5, 3).translate(-0.045, 0, 0),
  };
}
interface Wee { x: number; y: number; z: number; yaw: number; roll: number; flap: number; k: number[] }
const placeWee = (P: Parts, b: Wee, t: number) => {
  trs(_b, b.x, b.y, b.z, b.yaw, 0, b.roll);
  P.place(b.k[0], _b);
  for (let n = 0; n < 2; n++) {
    const s = n ? -1 : 1;
    if (b.flap > 0.02) P.place(b.k[1 + n], child(_m, _b, s * 0.02, 0.05, 0, 0, 0, s * (0.2 + 1.0 * Math.sin(t * 80 + n * 0.3)) * b.flap));
    else P.hide(b.k[1 + n]);
  }
};
/** 抛物线似的一段飞：从 a 到 b，中间抬高 h */
const arc = (b: Wee, ax: number, ay: number, az: number, bx: number, by: number, bz: number, k: number, h: number) => {
  b.x = lerp(ax, bx, k); b.z = lerp(az, bz, k); b.y = lerp(ay, by, k) + h * Math.sin(Math.PI * k);
  if (Math.hypot(bx - ax, bz - az) > 0.05) b.yaw = Math.atan2(bx - ax, bz - az);
};

/** 篱上的麻雀：沿篱顶跳，偶尔落到篱外的地上啄几下；人近了哄地飞到梅树那边，过一阵再回来 */
export class FenceSparrows {
  parts: Parts;
  private birds: Array<Wee & { u: number; state: number; t: number; fx: number; fy: number; fz: number; gx: number; gz: number }> = [];
  /** 第 i 只此刻在地上的话，它在哪（雪地脚印用）；在篱上、在飞是 null */
  onGround(i: number): { x: number; z: number; y: number } | null { const b = this.birds[i]; return b && b.state === 2 && this.parts.mesh.visible ? b : null; }
  get count() { return this.birds.length; }
  private R = mulberry32(7);
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.3 }), 'sparrows:fence')), g = sparrowGeo();
    for (let i = 0; i < 5; i++) this.birds.push({ x: 0, y: 0, z: 0, yaw: 0, roll: 0, flap: 0, k: [P.add(g.body), P.add(g.wing), P.add(g.wingR)], u: (i + 0.5) / 5, state: 0, t: this.R() * 5, fx: 0, fy: 0, fz: 0, gx: 0, gz: 0 });
    P.build();
  }
  update(c: Ctx) {
    const [sr, ss] = SUN[c.season], P = this.parts, R = this.R, dt = c.dt, F = FENCE_PERCH;
    // 下雪也出来：雪地上找食（院门外的雪上跳来跳去，留下一对对的爪印）
    P.mesh.visible = c.hour > sr - 0.2 && c.hour < ss + 0.2 && c.rain < 0.5 && c.camPos.distanceTo(_p.set((F.x0 + F.x1) / 2, F.y, F.z)) < 120;
    const snowy = U.uSnow.value > 0.3;
    if (!P.mesh.visible) return;
    const scare = Math.hypot(c.player.x - (F.x0 + F.x1) / 2, c.player.z - F.z) < 3.4;
    for (const b of this.birds) {
      const px = lerp(F.x0, F.x1, b.u);
      b.t -= dt;
      if (b.state === 0) {
        // 在篱上：左右看、跳一小步
        b.x = px; b.y = F.y; b.z = F.z; b.flap = 0;
        if (b.t < 0) { b.t = 1.2 + R() * 3; if (R() < 0.5) b.yaw = (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 1.2; else if (R() < (snowy ? 0.15 : 0.6)) b.u = Math.max(0, Math.min(1, b.u + (R() - 0.5) * 0.12)); else { b.state = 1; b.t = 0.7; b.fx = b.x; b.fy = b.y; b.fz = b.z; b.gx = px + (R() - 0.5) * 1.2; b.gz = F.z + 0.7 + R() * 1.1; } }
        if (scare) { b.state = 4; b.t = 1.5 + R() * 0.4; b.fx = b.x; b.fy = b.y; b.fz = b.z; }
      } else if (b.state === 1) {
        // 落到地上
        arc(b, b.fx, b.fy, b.fz, b.gx, footY(b.gx, b.gz), b.gz, 1 - Math.max(0, b.t) / 0.7, 0.15); b.flap = 1;
        if (b.t < 0) { b.state = 2; b.t = snowy ? 9 + R() * 9 : 3 + R() * 5; }
      } else if (b.state === 2) {
        // 地上啄、跳
        b.flap = 0; b.y = footY(b.x, b.z) + 0.02 * Math.abs(Math.sin(c.t * 9 + b.u * 20)) * (Math.sin(c.t * 1.3 + b.u * 9) > 0.3 ? 1 : 0);
        if (Math.sin(c.t * 1.3 + b.u * 9) > 0.3) { b.x += Math.sin(b.yaw) * 0.12 * dt; b.z += Math.cos(b.yaw) * 0.12 * dt; } else if (R() < dt * 0.8) b.yaw += (R() - 0.5) * 2;
        if (b.t < 0 || scare) { b.state = scare ? 4 : 3; b.t = scare ? 1.6 : 0.8; b.fx = b.x; b.fy = b.y; b.fz = b.z; }
      } else if (b.state === 3) {
        arc(b, b.fx, b.fy, b.fz, px, F.y, F.z, 1 - Math.max(0, b.t) / 0.8, 0.5); b.flap = 1;
        if (b.t < 0) { b.state = 0; b.t = 1 + R() * 2; }
      } else if (b.state === 4) {
        // 惊飞：到梅树那边的高处
        arc(b, b.fx, b.fy, b.fz, PLUM_PERCH.x + 1.2 + b.u, PLUM_PERCH.y + 1.4 + b.u * 0.6, PLUM_PERCH.z - 1 + b.u, 1 - Math.max(0, b.t) / 1.6, 0.9); b.flap = 1;
        if (b.t < 0) { b.state = 5; b.t = 7 + R() * 6; }
      } else {
        b.flap = 0;
        if (b.t < 0 && !scare) { b.state = 3; b.t = 0.8; b.fx = b.x; b.fy = b.y; b.fz = b.z; }
      }
      b.roll = 0;
      placeWee(P, b, c.t);
    }
    P.commit();
  }
}

/**
 * 老梅上的两只雀。平时并排落在一枝上；隔一阵忽然争起来，扑着翅膀扭在一处，从枝上双双跌到地上，
 * 愣一愣，又一前一后飞回枝头（邵雍观梅，见二雀争枝坠地）。
 */
export class PlumSparrows {
  parts: Parts;
  /** 那一枝在哪（世界坐标）；此刻在不在 */
  pos = new THREE.Vector3(PLUM_PERCH.x, PLUM_PERCH.y, PLUM_PERCH.z);
  present = false;
  /** 正在往下跌 */
  falling = false;
  private a: Wee; private b: Wee;
  private state = 0; private t = 20; private R = mulberry32(64); private gy = 0;
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.3 }), 'sparrows:plum')), g = sparrowGeo();
    const mk = (): Wee => ({ x: 0, y: 0, z: 0, yaw: 0, roll: 0, flap: 0, k: [P.add(g.body), P.add(g.wing), P.add(g.wingR)] });
    this.a = mk(); this.b = mk();
    P.build();
    this.gy = footY(PLUM_PERCH.x, PLUM_PERCH.z);
  }
  update(c: Ctx) {
    const [sr, ss] = SUN[c.season], P = this.parts, R = this.R, dt = c.dt, Q = PLUM_PERCH, a = this.a, b = this.b;
    this.present = c.hour > sr - 0.1 && c.hour < ss + 0.2 && c.rain < 0.5 && c.snow < 0.8;
    P.mesh.visible = this.present && c.camPos.distanceTo(this.pos) < 110;
    if (!P.mesh.visible) { this.state = 0; this.falling = false; return; }
    this.t -= dt;
    const dP = Math.hypot(c.player.x - Q.x, c.player.z - Q.z);
    // 顺着枝：两只各在一头
    const sit = (w: Wee, s: number, hop: number) => { w.x = Q.x + s * 0.12 * Q.dx; w.y = Q.y + s * 0.12 * Q.dy + hop; w.z = Q.z + s * 0.12 * Q.dz; w.roll = 0; }, along = Math.atan2(Q.dx, Q.dz);
    if (this.state === 0) {
      sit(a, -1, 0); sit(b, 1, 0); a.flap = b.flap = 0;
      if (R() < dt * 0.5) a.yaw = along + Math.PI / 2 + (R() - 0.5) * 2.4; if (R() < dt * 0.5) b.yaw = along + Math.PI / 2 + (R() - 0.5) * 2.4;
      // 有人在院里看着的时候来得勤些
      if (this.t < 0) { if (dP < 16 || R() < 0.35) { this.state = 1; this.t = 1.3; c.sfx('sparrow', Q.x, Q.z, 0.7); } else this.t = 20 + R() * 30; }
    } else if (this.state === 1) {
      // 争：面对面，扑着翅膀一跳一跳地凑近
      const k = 1 - this.t / 1.3, hop = 0.03 * Math.abs(Math.sin(c.t * 16));
      sit(a, -1 + 0.75 * k, hop); sit(b, 1 - 0.75 * k, 0.03 * Math.abs(Math.cos(c.t * 16)));
      a.yaw = along; b.yaw = along + Math.PI; a.flap = b.flap = 0.8;
      if (this.t < 0) { this.state = 2; this.t = 1.25; this.falling = true; c.sfx('sparrow', Q.x, Q.z, 0.95); }
    } else if (this.state === 2) {
      // 跌：扭在一处，打着旋掉下去
      const k = 1 - this.t / 1.25, y = lerp(Q.y, this.gy + 0.03, k * k), w = c.t * 13, r = 0.05 + 0.05 * Math.sin(k * Math.PI);
      a.x = Q.x + Math.cos(w) * r; a.z = Q.z + 0.1 * k + Math.sin(w) * r; a.y = y + 0.03 * Math.sin(w); a.yaw = w + Math.PI / 2; a.roll = Math.sin(w * 0.7) * 1.2;
      b.x = Q.x - Math.cos(w) * r; b.z = Q.z + 0.1 * k - Math.sin(w) * r; b.y = y - 0.03 * Math.sin(w); b.yaw = w - Math.PI / 2; b.roll = Math.cos(w * 0.7) * 1.2;
      a.flap = b.flap = 1;
      if (this.t < 0) { this.state = 3; this.t = 2.2 + R(); this.falling = false; }
    } else if (this.state === 3) {
      // 落了地：各自跳开，愣着
      const k = Math.max(0, Math.min(1, (2.2 - this.t) * 2.5));
      a.x = Q.x - 0.05 - 0.14 * k; a.z = Q.z + 0.1; a.y = this.gy; a.roll = 0; a.flap = 0; a.yaw = -1.9 + 0.5 * Math.sin(c.t * 0.9);
      b.x = Q.x + 0.05 + 0.2 * k; b.z = Q.z + 0.16; b.y = this.gy; b.roll = 0; b.flap = 0; b.yaw = 1.2 + 0.6 * Math.sin(c.t * 1.1);
      if (this.t < 0) { this.state = 4; this.t = 2.1; }
    } else {
      // 一前一后飞回枝上
      const ka = Math.min(1, (2.1 - this.t) / 0.95), kb = Math.max(0, Math.min(1, (2.1 - this.t - 0.9) / 1.0));
      arc(a, Q.x - 0.19, this.gy, Q.z + 0.1, Q.x - 0.12 * Q.dx, Q.y - 0.12 * Q.dy, Q.z - 0.12 * Q.dz, ka, 0.3); a.flap = ka < 1 ? 1 : 0;
      arc(b, Q.x + 0.25, this.gy, Q.z + 0.16, Q.x + 0.12 * Q.dx, Q.y + 0.12 * Q.dy, Q.z + 0.12 * Q.dz, kb, 0.3); b.flap = kb > 0 && kb < 1 ? 1 : 0;
      if (this.t < 0) { this.state = 0; this.t = 45 + R() * 50; }
    }
    placeWee(P, a, c.t); placeWee(P, b, c.t + 0.4);
    P.commit();
  }
}

/** 燕子：春夏的白天，贴着田飞「8」字，忽高忽低；翅膀扇几下、滑一段 */
export class Swallows {
  parts: Parts;
  private birds: Array<{ cx: number; cz: number; A: number; B: number; w: number; ph: number; h: number; x: number; y: number; z: number; k: number[]; gy: number }> = [];
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.5, shade: 1.3, line: 0.6 }), 'swallows')), dark = tone([0.5, 0.54, 0.64], 2.4), R = mulberry32(12);
    const b = ell(0.022, 0.02, 0.065, dark, 6, 5);
    const col = b.attributes.color as THREE.BufferAttribute, pos = b.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < col.count; i++) if (pos.getY(i) < -0.004) col.setXYZ(i, 0.94, 0.93, 0.9);
    // 剪刀似的尾：两根朝后撇开的细叉
    const body = merge([b, ...[-1, 1].map((s) => paint(box(0.008, 0.004, 0.085).applyMatrix4(M.mul(M.t(s * 0.016, 0, -0.095), M.ry(-s * 0.22))), dark))]);
    const wing = (s: number) => {
      const g = new THREE.BufferGeometry(), p = [0, 0, 0.03, s * 0.17, 0, -0.05, 0, 0, -0.025, 0, 0, 0.03, 0, 0, -0.025, s * 0.17, 0, -0.05];
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, s, 0, 0, s, 0, 0, s, 0, 0, -s, 0, 0, -s, 0, 0, -s, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(18).fill(1), 3));
      return paint(g, dark);
    };
    const wl = wing(1), wr = wing(-1);
    const F = SITE.mulberry;
    for (let i = 0; i < 7; i++) {
      const west = i < 4;
      this.birds.push({ cx: west ? -28 + R() * 10 : (F.x0 + F.x1) / 2 - 30 + R() * 20, cz: west ? 86 + R() * 14 : 84 + R() * 16, A: 34 + R() * 16, B: 18 + R() * 12, w: 0.2 + R() * 0.08, ph: R() * 6.28, h: R() * 6.28, x: 0, y: 0, z: 0, k: [P.add(body), P.add(wl), P.add(wr)], gy: NaN });
    }
    P.build();
  }
  update(c: Ctx) {
    const [sr, ss] = SUN[c.season], P = this.parts;
    // 远了不画；稍远隔帧动；地面高隔几帧才重新量一次（燕子贴着平平的田飞）
    const d = Math.min(Math.hypot(c.camPos.x + 23, c.camPos.z - 93), Math.hypot(c.camPos.x - 77, c.camPos.z - 92));
    P.mesh.visible = (c.season === 'spring' || c.season === 'summer') && c.hour > sr + 0.2 && c.hour < ss && c.rain < 0.7 && d < 190;
    if (!P.mesh.visible) return;
    if (d > 70 && c.frame % 2) return;
    // 要下雨了、夏天的傍晚，燕子飞得低（「燕子低飞」）
    const t = c.t, low = c.rain > 0.02 || (c.season === 'summer' && c.hour > 15) ? 0.45 : 1;
    let i = 0;
    for (const b of this.birds) {
      i++;
      const u = t * b.w + b.ph, x = b.cx + b.A * Math.sin(u), z = b.cz + b.B * Math.sin(2 * u), vx = b.A * Math.cos(u), vz = 2 * b.B * Math.cos(2 * u);
      const yaw = Math.atan2(vx, vz), curv = (vx * (-4 * b.B * Math.sin(2 * u)) - vz * (-b.A * Math.sin(u))) / Math.pow(vx * vx + vz * vz, 1.5);
      // 地面高用总图的算法（不去查行走那张一格一格现算的图：燕子满田飞，一飞到没算过的地方就要现算一块）
      if (!(b.gy === b.gy) || (c.frame + i) % 20 === 0) b.gy = ground(x, z);
      const y = b.gy + 0.6 + (0.4 + 2.4 * (0.5 + 0.5 * Math.sin(u * 2.7 + b.h)) ** 2) * low + 0.3 * Math.sin(t * 2.1 + b.h);
      const pitch = Math.max(-0.5, Math.min(0.5, -(y - b.y) / (Math.hypot(x - b.x, z - b.z) || 1)));
      b.x = x; b.y = y; b.z = z;
      trs(_b, x, y, z, yaw, pitch, Math.max(-1, Math.min(1, -curv * 22)));
      P.place(b.k[0], _b);
      // 扇几下，滑一段
      const beat = Math.sin(t * 2.3 + b.h) > 0.1 ? Math.sin(t * 34 + b.h) : 0.35;
      P.place(b.k[1], child(_m, _b, 0.012, 0.004, 0.01, 0, 0, 0.7 * beat));
      P.place(b.k[2], child(_m, _b, -0.012, 0.004, 0.01, 0, 0, -0.7 * beat));
    }
    P.commit();
  }
}

// ———————————————————————— 鹅 ————————————————————————
/** 丁家门前的两只白鹅：摇摇摆摆地踱、低头啄草；人走近了伸长脖子压低了头嘶一声，掉头摇着走开 */
export class Geese {
  parts: Parts;
  private birds: Array<{ x: number; z: number; yaw: number; tx: number; tz: number; t: number; state: number; ph: number; hiss: number; k: number[] }> = [];
  private R = mulberry32(19); private honk = 12;
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.9, shade: 1.4 }), 'geese')), bill = tone([0.95, 0.7, 0.4], 1.5);
    const body = merge([ell(0.125, 0.11, 0.22, WHITE, 9, 6).translate(0, 0.29, 0), ell(0.04, 0.045, 0.09, WHITE).applyMatrix4(M.mul(M.t(0, 0.36, -0.2), M.rx(-0.5))), ...[-1, 1].map((s) => ell(0.035, 0.06, 0.15, [0.9, 0.9, 0.88]).translate(s * 0.1, 0.31, -0.02))]).translate(0, -0.19, 0);
    // 头颈：原点在颈根；一段长颈朝上略前，头、扁嘴、额上一个肉瘤
    const neck = paint(sweep([V(0, 0, 0), V(0, 0.13, 0.05), V(0, 0.26, 0.04), V(0, 0.34, 0.07)], [[-0.03, -0.03], [0.03, -0.03], [0.03, 0.03], [-0.03, 0.03]], { scale: (t) => 1.2 - 0.3 * t, up: V(1, 0, 0) }), WHITE);
    const head = merge([neck, ell(0.042, 0.04, 0.05, WHITE).translate(0, 0.37, 0.085), paint(box(0.034, 0.016, 0.07).translate(0, 0.36, 0.155), bill), ell(0.02, 0.018, 0.02, bill).translate(0, 0.395, 0.115)]);
    const leg = merge([paint(cyl(0.01, 0.011, 0.19, 4).translate(0, -0.095, 0), bill), paint(box(0.07, 0.006, 0.09).translate(0, -0.188, 0.03), bill)]);
    for (let i = 0; i < 2; i++) { const x = GEESE.x + (i ? 1.1 : -0.4), z = GEESE.z + (i ? 0.5 : -0.3); this.birds.push({ x, z, yaw: i * 2 + 0.5, tx: x, tz: z, t: 2 + i * 3, state: 0, ph: i * 2, hiss: 0, k: [P.add(body), P.add(head), P.add(leg), P.add(leg)] }); }
    P.build();
  }
  update(c: Ctx) {
    const [sr, ss] = SUN[c.season], P = this.parts, R = this.R, dt = c.dt;
    P.mesh.visible = c.hour > sr - 0.2 && c.hour < ss + 0.3 && c.snow < 0.7 && c.camPos.distanceTo(_p.set(GEESE.x, c.camPos.y, GEESE.z)) < 230;
    if (!P.mesh.visible) return;
    this.honk -= dt;
    for (const b of this.birds) {
      b.t -= dt;
      const pdx = b.x - c.player.x, pdz = b.z - c.player.z, pd = Math.hypot(pdx, pdz);
      // 0 站着、啄草；1 踱；2 嘶（朝着人）；3 走开
      if (pd < 3.5 && b.state < 2) { b.state = 2; b.t = 1.3; if (this.honk < 0) { this.honk = 4; c.sfx('goose', b.x, b.z, 0.6); } }
      else if (b.state === 2 && b.t < 0) { b.state = 3; b.t = 5; b.tx = b.x + (pdx / (pd || 1)) * 4.5; b.tz = b.z + (pdz / (pd || 1)) * 4.5; }
      else if (b.t < 0) {
        b.state = R() < 0.5 ? 0 : 1; b.t = 3 + R() * 6;
        if (b.state === 1) { const lx = (R() - 0.5) * 6, lz = (R() - 0.3) * 4, cy = Math.cos(GEESE.yaw), sy = Math.sin(GEESE.yaw); b.tx = GEESE.x + lx * cy + lz * sy; b.tz = GEESE.z - lx * sy + lz * cy; }
      }
      let v = 0;
      if (b.state === 2) b.yaw += wrap(Math.atan2(-pdx, -pdz) - b.yaw) * Math.min(1, dt * 5);
      else if (b.state === 1 || b.state === 3) {
        const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
        if (d < 0.2) { b.state = 0; b.t = 2 + R() * 4; }
        else { const off = wrap(Math.atan2(dx, dz) - b.yaw); b.yaw += Math.max(-3 * dt, Math.min(3 * dt, off)); v = (b.state === 3 ? 1.05 : 0.32) * Math.max(0.2, Math.cos(off)); b.x += Math.sin(b.yaw) * v * dt; b.z += Math.cos(b.yaw) * v * dt; b.ph += v * dt * 14; }
      }
      b.hiss += ((b.state === 2 ? 1 : 0) - b.hiss) * Math.min(1, dt * 6);
      const gy = footY(b.x, b.z), st = Math.sin(b.ph), graze = b.state === 0 ? Math.max(0, Math.sin(c.t * 0.5 + b.ph)) ** 2 : 0;
      // 身子的原点在髋（腿根）：走起来左右摇
      trs(_b, b.x, gy + 0.19, b.z, b.yaw, 0.12 * b.hiss, 0.13 * st * Math.min(1, v * 3));
      P.place(b.k[0], _b);
      P.place(b.k[1], child(_m, _b, 0, 0.17, 0.17, 0, 1.25 * b.hiss + 1.45 * graze * (1 - b.hiss) + 0.05 * st, 0));
      for (let i = 0; i < 2; i++) P.place(b.k[2 + i], child(_m, _b, i ? -0.06 : 0.06, 0, 0, 0, 0.5 * (i ? -st : st) * Math.min(1, v * 3), 0));
    }
    P.commit();
  }
}

/**
 * 草堂南檐下那一窝燕（春夏）：两只大燕轮着出去、回来——自窝里一纵而出，在院子上空兜一圈，回到窝边一停，又出去。
 */
export class NestSwallows {
  parts: Parts;
  private birds: Array<{ t: number; T: number; out: boolean; far: THREE.Vector3; side: number; x: number; y: number; z: number; k: number[]; mud: boolean }> = [];
  /** 衔泥的地方：石桥西边的北岸 */
  private mudAt = (() => { const p = STREAM.reduce((a, q) => (Math.abs(q.x - 5) < Math.abs(a.x - 5) ? q : a)); const z = p.z - p.w - 0.25; return new THREE.Vector3(p.x, footY(p.x, z) + 0.04, z); })();
  private R = mulberry32(45);
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.5, shade: 1.3, line: 0.6 }), 'swallows:nest')), dark = tone([0.5, 0.54, 0.64], 2.4);
    const b = ell(0.022, 0.02, 0.065, dark, 6, 5), col = b.attributes.color as THREE.BufferAttribute, pos = b.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < col.count; i++) if (pos.getY(i) < -0.004) col.setXYZ(i, 0.94, 0.93, 0.9);
    const body = merge([b, ...[-1, 1].map((s) => paint(box(0.008, 0.004, 0.085).applyMatrix4(M.mul(M.t(s * 0.016, 0, -0.095), M.ry(-s * 0.22))), dark))]);
    const wing = (s: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.03, s * 0.17, 0, -0.05, 0, 0, -0.025, 0, 0, 0.03, 0, 0, -0.025, s * 0.17, 0, -0.05], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, s, 0, 0, s, 0, 0, s, 0, 0, -s, 0, 0, -s, 0, 0, -s, 0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(18).fill(1), 3));
      return paint(g, dark);
    };
    const wl = wing(1), wr = wing(-1);
    for (let i = 0; i < 2; i++) this.birds.push({ t: i * 5, T: 4, out: false, far: new THREE.Vector3(), side: 1, x: NEST.x, y: NEST.y, z: NEST.z, k: [P.add(body), P.add(wl), P.add(wr)], mud: false });
    P.build();
  }
  update(c: Ctx) {
    const [sr, ss] = SUN[c.season], P = this.parts, R = this.R;
    P.mesh.visible = (c.season === 'spring' || c.season === 'summer') && c.hour > sr && c.hour < ss + 0.2 && c.rain < 0.7 && c.camPos.distanceTo(_p.set(NEST.x, NEST.y, NEST.z)) < 200;
    if (!P.mesh.visible) return;
    this.birds.forEach((b, i) => {
      b.t += c.dt;
      if (b.t > b.T) {
        b.t = 0; b.out = !b.out;
        if (b.out) {
          // 春天多半是去溪边衔泥（落在岸上一啄一啄，再飞回窝里）
          b.mud = c.season === 'spring' && c.rain < 0.3 && R() < 0.45;
          if (b.mud) { b.T = 11 + R() * 3; b.far.copy(this.mudAt); b.far.x += (R() - 0.5) * 1.6; b.side = R() < 0.5 ? 0.4 : -0.4; }
          else { b.T = 9 + R() * 6; const a = -0.9 + R() * 2.2, d = 22 + R() * 26; b.far.set(NEST.x + Math.sin(a) * d, NEST.y + 1 + R() * 5, NEST.z + Math.cos(a) * d); b.side = R() < 0.5 ? 1 : -1; }
        }
        else b.T = 2.5 + R() * 3.5;
      }
      let yaw = Math.PI, pitch = -0.5, roll = 0, flap = 0, x = NEST.x + (i ? 0.1 : -0.08), y = NEST.y - 0.02 + (i ? 0.03 : 0), z = NEST.z + 0.03;
      if (b.out) {
        // 一圈：出去、兜到远处、回来（首尾都在窝边）
        // 衔泥：当中一段停在岸上
        const u0 = b.t / b.T, sit = b.mud && u0 > 0.42 && u0 < 0.58, u = b.mud ? (u0 < 0.42 ? (u0 / 0.42) * 0.5 : u0 > 0.58 ? 0.5 + ((u0 - 0.58) / 0.42) * 0.5 : 0.5) : u0;
        const w = (1 - Math.cos(u * Math.PI * 2)) / 2, s = Math.sin(u * Math.PI * 2), a = Math.atan2(b.far.x - NEST.x, b.far.z - NEST.z);
        x = lerp(NEST.x, b.far.x, w) + b.side * s * 9 * Math.cos(a);
        z = lerp(NEST.z + 0.2, b.far.z, w) - b.side * s * 9 * Math.sin(a);
        y = lerp(NEST.y - 0.1, b.far.y, w) - (b.mud ? 0 : 1.2) * Math.sin(u * Math.PI) * Math.sin(u * Math.PI * 3);
        const dx = x - b.x, dy = y - b.y, dz = z - b.z, h = Math.hypot(dx, dz);
        if (h > 1e-4) { yaw = Math.atan2(dx, dz); pitch = Math.max(-0.7, Math.min(0.7, -dy / h)); }
        roll = b.side * 0.5 * Math.cos(u * Math.PI * 2);
        flap = Math.sin(c.t * 2.3 + i * 2) > 0 || u < 0.08 || u > 0.92 ? Math.sin(c.t * 34 + i) : 0.35;
        if (sit) { y = b.far.y + 0.012 * Math.abs(Math.sin(c.t * 7)); pitch = 0.35 * Math.max(0, Math.sin(c.t * 5 + i)); roll = 0; flap = 0.25 + 0.1 * Math.sin(c.t * 9); }
      }
      b.x = x; b.y = y; b.z = z;
      trs(_b, x, y, z, yaw, pitch, roll);
      P.place(b.k[0], _b);
      if (b.out) { P.place(b.k[1], child(_m, _b, 0.012, 0.004, 0.01, 0, 0, 0.7 * flap)); P.place(b.k[2], child(_m, _b, -0.012, 0.004, 0.01, 0, 0, -0.7 * flap)); }
      else { P.place(b.k[1], child(_m, _b, 0.012, 0.004, 0.01, 1.3, 0, -0.2, 0.7)); P.place(b.k[2], child(_m, _b, -0.012, 0.004, 0.01, -1.3, 0, 0.2, 0.7)); }
    });
    P.commit();
  }
}
