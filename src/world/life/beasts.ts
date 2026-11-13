/**
 * 黄狗（卧在邻家门前，人来了小跑过来、坐下、摇尾巴）、池里的鱼（几道游动的墨影，人近了就散）、
 * 池边的老龟（好天爬到岸上晒背，背甲上隐隐是洛书的九宫点子；人近了滑进水里，过一阵在别处浮上来）。
 */
import * as THREE from 'three';
import { M, V, box, cyl, merge, sphere, sweep, type Geo } from '../core/geo';
import { mulberry32 } from '../core/rng';
import { PIG, wash, type RGB } from '../ink/ink';
import { SITE } from '../site';
import type { Ctx } from './person';
import { Parts, child, creatureMat, loftZ, paint, tone, trs } from './rig';
import { CAT, DOG_BED, TURTLE, clearOfTrees, footY } from './spots';

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const sm = (k: number) => { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
const _b = new THREE.Matrix4(), _m = new THREE.Matrix4(), _y = new THREE.Matrix4(), _a = new THREE.Vector3(), _p = new THREE.Vector3();
const ell = (rx: number, ry: number, rz: number, c: RGB, ws = 8, hs = 6) => paint(sphere(1, ws, hs).scale(rx, ry, rz), c);

// ———————————————————————— 黄狗 ————————————————————————
/** 身子的原点在髋（坐下时绕着它把前身抬起来）；肩在髋前 0.48、头颈在髋前 0.58 */
const HIP = 0.42, SHOULDER = { x: 0.075, y: -0.02, z: 0.48 }, NECK = { y: 0.06, z: 0.58 };
export class Dog {
  parts: Parts;
  x = DOG_BED.x; z = DOG_BED.z; yaw = DOG_BED.yaw;
  /** 0 卧着睡；1 朝人小跑过去；2 坐着；3 回窝 */
  state = 0;
  private k: { body: number; head: number; legs: number[]; tail: number };
  private t = 0; private cool = 4; private ph = 0; private v = 0;
  private hipY = 0.13; private pitch = 0; private up = 0; private R = mulberry32(5);
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.2, shade: 1.5 }), 'dog'));
    const coat = tone([0.92, 0.8, 0.58], 1.5), dark = tone([0.84, 0.68, 0.5], 2.1), nose = tone(PIG.jiao, 2.4);
    const body = paint(loftZ([[-0.3, 0.42, 0.085, 0.1], [0.0, 0.41, 0.1, 0.115], [0.22, 0.43, 0.105, 0.13], [0.34, 0.47, 0.07, 0.09]], 9), coat).translate(0, -HIP, 0.24);
    const head = merge([ell(0.075, 0.072, 0.085, coat).translate(0, 0.06, 0.06), paint(cyl(0.03, 0.042, 0.11, 6).applyMatrix4(M.mul(M.t(0, 0.035, 0.16), M.rx(Math.PI / 2))), coat), ell(0.016, 0.014, 0.014, nose).translate(0, 0.04, 0.218),
      ...[-1, 1].map((s) => ell(0.028, 0.05, 0.014, dark).applyMatrix4(M.mul(M.t(s * 0.066, 0.075, 0.03), M.rz(s * 0.5), M.rx(-0.2)))), ...[-1, 1].map((s) => ell(0.009, 0.009, 0.006, nose).translate(s * 0.036, 0.085, 0.13))]);
    const leg = merge([paint(cyl(0.021, 0.03, 0.36, 6).translate(0, -0.18, 0), coat), ell(0.026, 0.016, 0.036, coat).translate(0, -0.375, 0.012)]);
    const tail = paint(sweep([V(0, 0, 0), V(0, 0.1, -0.07), V(0, 0.2, -0.03), V(0, 0.22, 0.05)], [[-0.018, -0.018], [0.018, -0.018], [0.018, 0.018], [-0.018, 0.018]], { scale: (t) => 1.1 - 0.6 * t, up: V(1, 0, 0) }), coat);
    this.k = { body: P.add(body), head: P.add(head), legs: [P.add(leg), P.add(leg), P.add(leg), P.add(leg)], tail: P.add(tail) };
    P.build();
  }
  update(c: Ctx) {
    const P = this.parts, K = this.k, dt = c.dt, R = this.R;
    const d = c.camPos.distanceTo(_p.set(this.x, c.camPos.y, this.z));
    P.mesh.visible = d < 240;
    if (!P.mesh.visible) return;
    const px = c.player.x, pz = c.player.z, pd = Math.hypot(px - this.x, pz - this.z), fromBed = Math.hypot(this.x - DOG_BED.x, this.z - DOG_BED.z), awake = c.night < 0.5 && c.rain < 0.6;
    this.t -= dt; this.cool -= dt;
    let tx = this.x, tz = this.z, go = 0;
    if (this.state === 0) {
      if (awake && this.cool < 0 && pd < 12 && Math.hypot(px - DOG_BED.x, pz - DOG_BED.z) < 15) { this.state = 1; this.t = 14; c.sfx('dog', this.x, this.z, 0.45); }
    } else if (this.state === 1) {
      // 朝人过去，到跟前两步远停下
      tx = px - ((px - this.x) / (pd || 1)) * 2.3; tz = pz - ((pz - this.z) / (pd || 1)) * 2.3; go = pd > 2.6 ? 1.75 : 0;
      if (pd <= 2.7) { this.state = 2; this.t = 16 + R() * 14; }
      if (this.t < 0 || Math.hypot(px - DOG_BED.x, pz - DOG_BED.z) > 20) this.state = 3;
    } else if (this.state === 2) {
      if (pd > 5 && pd < 12 && Math.hypot(px - DOG_BED.x, pz - DOG_BED.z) < 15) { this.state = 1; this.t = 10; }
      else if (this.t < 0 || pd >= 12 || !awake) this.state = 3;
    } else {
      tx = DOG_BED.x; tz = DOG_BED.z; go = 1.5;
      if (fromBed < 0.25) { this.state = 0; this.cool = 30 + R() * 30; }
    }
    // 走
    if (go > 0) {
      const off = wrap(Math.atan2(tx - this.x, tz - this.z) - this.yaw);
      this.yaw += Math.max(-5 * dt, Math.min(5 * dt, off));
      this.v += (go * Math.max(0.15, Math.cos(off)) * Math.min(1, 0.3 + Math.hypot(tx - this.x, tz - this.z)) - this.v) * Math.min(1, dt * 5);
    } else {
      this.v += (0 - this.v) * Math.min(1, dt * 8);
      const face = this.state === 2 ? Math.atan2(px - this.x, pz - this.z) : this.state === 0 ? DOG_BED.yaw : this.yaw;
      this.yaw += Math.max(-3 * dt, Math.min(3 * dt, wrap(face - this.yaw)));
    }
    this.x += Math.sin(this.yaw) * this.v * dt; this.z += Math.cos(this.yaw) * this.v * dt; this.ph += this.v * dt * 9;
    _a.set(this.x, 0, this.z); clearOfTrees(_a); this.x = _a.x; this.z = _a.z;
    // 姿势：卧（髋落地、腿收起）、坐（髋落地、前身抬起）、站
    const lying = this.state === 0 && this.v < 0.1, sitting = this.state === 2 && this.v < 0.1;
    const k = Math.min(1, dt * 4);
    this.hipY += ((lying ? 0.115 : sitting ? 0.17 : HIP) - this.hipY) * k;
    this.pitch += ((sitting ? -0.62 : 0) - this.pitch) * k;
    this.up += ((lying ? 0 : 1) - this.up) * k;
    const gy = footY(this.x, this.z), walk = Math.min(1, this.v / 0.8), st = Math.sin(this.ph), t = c.t;
    trs(_y, this.x, gy, this.z, this.yaw);
    child(_b, _y, 0, this.hipY + 0.012 * walk * Math.abs(st), -0.24, 0, this.pitch, lying ? 0.12 : 0);
    P.place(K.body, _b);
    // 头：睡着时搁在地上；坐着时仰着看人；小跑时一点一点
    const look = sitting ? wrap(Math.atan2(px - this.x, pz - this.z) - this.yaw) * 0.6 : 0;
    P.place(K.head, child(_m, _b, 0, NECK.y - (lying ? 0.06 : 0), NECK.z, look, lying ? 0.45 : -this.pitch * 0.75 - (sitting ? 0.3 : 0) + 0.05 * walk * st, 0));
    for (let i = 0; i < 4; i++) {
      const front = i < 2, sx = i % 2 ? -1 : 1, sw = 0.55 * walk * Math.sin(this.ph + (i === 0 || i === 3 ? 0 : Math.PI));
      if (this.up < 0.5 || (!front && sitting && this.pitch < -0.3)) { P.hide(K.legs[i]); continue; }
      if (front) { _a.set(sx * SHOULDER.x, SHOULDER.y, SHOULDER.z).applyMatrix4(_b); P.place(K.legs[i], trs(_m, _a.x, Math.max(_a.y, gy + 0.39), _a.z, this.yaw, sw, 0)); }
      else P.place(K.legs[i], child(_m, _y, sx * 0.07, this.hipY - 0.03, -0.24, 0, sw, 0));
    }
    // 尾：坐着、站着见了人就摇
    const wag = (sitting || (this.state === 1 && pd < 5)) ? 0.6 * Math.sin(t * 11) : 0.06 * Math.sin(t * 1.3);
    P.place(K.tail, child(_m, _b, 0, 0.05, -0.05, 0, lying ? 1.2 : 0.1, wag));
    P.commit();
  }
}

// ———————————————————————— 池里的鱼 ————————————————————————
interface Fish { u: number; v: number; yaw: number; sp: number; dart: number; deep: number; ph: number; k: number }
export class Fishes {
  parts: Parts;
  private fish: Fish[] = [];
  private R = mulberry32(21);
  constructor() {
    // 没骨：不勾线，只是水底下一抹墨影
    const P = (this.parts = new Parts(creatureMat({ body: 0, line: 0, shade: 1.1 }), 'fish')), ink = tone(PIG.mo, 1.9);
    const g = merge([ell(0.022, 0.012, 0.085, ink, 6, 4), paint(box(0.003, 0.034, 0.05).translate(0, 0, -0.1), ink), paint(box(0.05, 0.003, 0.03).translate(0, 0, 0.01), ink)]);
    for (let i = 0; i < 8; i++) this.fish.push({ u: (this.R() - 0.5) * 1.1, v: (this.R() - 0.5) * 1.1, yaw: this.R() * 6.28, sp: 0.12 + this.R() * 0.12, dart: 0, deep: 0, ph: this.R() * 6, k: P.add(g) });
    P.build();
  }
  /** 惊散（有东西落进水里） */
  scatter(x: number, z: number) {
    const Pd = SITE.pond;
    for (const f of this.fish) { const fx = Pd.x + f.u * Pd.rx, fz = Pd.z + f.v * Pd.rz; if (Math.hypot(fx - x, fz - z) < 4.5) { f.dart = 1.6; f.yaw = Math.atan2(fx - x, fz - z) + (this.R() - 0.5); } }
  }
  update(c: Ctx) {
    const P = this.parts, Pd = SITE.pond, dt = c.dt, R = this.R;
    P.mesh.visible = c.night < 0.7 && c.snow < 0.6 && c.camPos.distanceTo(_p.set(Pd.x, Pd.y, Pd.z)) < 60;
    if (!P.mesh.visible) return;
    const winter = c.season === 'winter' ? 1 : 0, pe = Math.hypot((c.player.x - Pd.x) / Pd.rx, (c.player.z - Pd.z) / Pd.rz);
    for (const f of this.fish) {
      const x = Pd.x + f.u * Pd.rx, z = Pd.z + f.v * Pd.rz, r = Math.hypot(f.u, f.v);
      // 人到了池边：近处的鱼一窜，沉下去
      if (pe < 1.32 && f.dart <= 0 && Math.hypot(c.player.x - x, c.player.z - z) < 3.6) { f.dart = 1.5; f.yaw = Math.atan2(x - c.player.x, z - c.player.z) + (R() - 0.5) * 0.8; }
      if (f.dart > 0) f.dart -= dt;
      f.deep += ((f.dart > 0 ? 1 : 0) - f.deep) * Math.min(1, dt * (f.dart > 0 ? 4 : 0.35));
      // 慢慢地游：朝向一点一点地变，快到岸了就折回池心
      const back = wrap(Math.atan2(-f.u * Pd.rx, -f.v * Pd.rz) - f.yaw);
      f.yaw += (r > 0.62 ? Math.sign(back) * 1.6 : Math.sin(c.t * 0.3 + f.ph * 3) * 0.5) * dt * (f.dart > 0 ? 0.3 : 1);
      const v = f.sp * (1 - 0.5 * winter) + 1.6 * Math.max(0, f.dart - 0.6);
      f.u += (Math.sin(f.yaw) * v * dt) / Pd.rx; f.v += (Math.cos(f.yaw) * v * dt) / Pd.rz;
      if (r > 0.74) { f.u *= 0.74 / r; f.v *= 0.74 / r; }
      f.ph += dt * (3 + v * 20);
      P.place(f.k, trs(_m, x, Pd.y - 0.14 - 0.1 * Math.sin(f.ph * 0.07) ** 2 - 0.42 * f.deep - 0.25 * winter, z, f.yaw + 0.16 * Math.sin(f.ph), 0, 0, 0.9 + 0.5 * ((f.k * 0.37) % 1)));
    }
    P.commit();
  }
}

// ———————————————————————— 老龟 ————————————————————————
/** 背甲的贴图：深的甲色，几道淡墨的甲纹，上面隐隐九组小点——洛书（戴九履一，左三右七，二四为肩，六八为足，五居中）。头朝上 */
function shellTexture(px = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d')!, R = mulberry32(9);
  const shell = tone([0.66, 0.68, 0.56], 2.3), css = (k: RGB, a = 1) => `rgba(${Math.round(k[0] * 255)},${Math.round(k[1] * 255)},${Math.round(k[2] * 255)},${a})`;
  g.fillStyle = css(shell); g.fillRect(0, 0, px, px);
  // 浓淡不匀；边上深一些
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '20,24,18' : '150,150,120'},${0.03 + 0.05 * R()})`; g.beginPath(); g.ellipse(R() * px, R() * px, 6 + R() * 26, 4 + R() * 18, R() * 3, 0, 6.3); g.fill(); }
  const rim = g.createRadialGradient(px / 2, px / 2, px * 0.3, px / 2, px / 2, px * 0.52); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(10,14,10,0.42)'); g.fillStyle = rim; g.fillRect(0, 0, px, px);
  // 甲纹：当中一列椎盾，两边各一列肋盾（淡淡的几道）
  g.strokeStyle = 'rgba(14,18,12,0.3)'; g.lineWidth = px * 0.008; g.lineJoin = 'round';
  const X = (u: number) => px * u, Y = (v: number) => px * v;
  for (const u of [0.38, 0.62]) { g.beginPath(); g.moveTo(X(u), Y(0.12)); for (let k = 1; k <= 4; k++) g.lineTo(X(u + (k % 2 ? 0.035 : -0.035) * (u < 0.5 ? -1 : 1)), Y(0.12 + k * 0.19)); g.stroke(); }
  for (let k = 0; k <= 4; k++) { const v = 0.12 + k * 0.19; g.beginPath(); g.moveTo(X(0.38), Y(v)); g.lineTo(X(0.62), Y(v)); g.stroke(); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(X(0.5 + s * 0.13), Y(v + 0.02)); g.lineTo(X(0.5 + s * 0.46), Y(v + 0.06 * (k - 2))); g.stroke(); } }
  // 洛书：九宫里各几点。单数（阳）亮些，双数（阴）暗些；都只是比甲色淡一点的小点
  const cell = 0.2, dot = px * 0.0125, sp = 0.047;
  const N: Array<[number, number, Array<[number, number]>]> = [
    [0, -1, [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]],          // 九：上（头）
    [0, 1, [[0, 0]]],                                                                              // 一：下（尾）
    [-1, 0, [[0, -1], [0, 0], [0, 1]]],                                                              // 三：左
    [1, 0, [[-0.5, -1.5], [-0.5, -0.5], [-0.5, 0.5], [-0.5, 1.5], [0.5, -1], [0.5, 0], [0.5, 1]]],     // 七：右
    [-1, -1, [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]],                                  // 四：左上
    [1, -1, [[-0.5, 0.5], [0.5, -0.5]]],                                                             // 二：右上
    [-1, 1, [[-0.5, -1.5], [-0.5, -0.5], [-0.5, 0.5], [-0.5, 1.5], [0.5, -1.5], [0.5, -0.5], [0.5, 0.5], [0.5, 1.5]]],   // 八：左下
    [1, 1, [[-0.5, -1], [-0.5, 0], [-0.5, 1], [0.5, -1], [0.5, 0], [0.5, 1]]],                         // 六：右下
    [0, 0, [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]],                                            // 五：中
  ];
  for (const [cx, cy, pts] of N) {
    const odd = pts.length % 2 === 1;
    g.fillStyle = odd ? 'rgba(236,232,206,0.8)' : 'rgba(196,196,170,0.62)';
    for (const [dx, dy] of pts) { g.beginPath(); g.arc(X(0.5 + cx * cell + dx * sp), Y(0.5 + cy * cell * 1.1 + dy * sp), dot, 0, 6.3); g.fill(); }
  }
  // 左下角一小块纯白：头、腿这些只用顶点色的地方指到这里
  g.fillStyle = '#fff'; g.fillRect(0, px * 0.9, px * 0.1, px * 0.1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}
export class Turtle {
  parts: Parts;
  /** 此刻在哪；露在外面没有（潜在水里、冬天、夜里就是 false） */
  pos = new THREE.Vector3(TURTLE.x, 0, TURTLE.z);
  present = false;
  /** 落水了（给鱼知道） */
  onPlop: ((x: number, z: number) => void) | null = null;
  private k: { shell: number; head: number; legs: number[] };
  /** 0 晒背；1 往水里滑；2 潜着；3 浮着；4 游回岸边爬上来 */
  private state = 2; private t = 3; private yaw = TURTLE.yaw; private x = TURTLE.x; private z = TURTLE.z; private y = 0;
  private fx = 0; private fz = 0; private sx = 0; private sz = 0; private R = mulberry32(3); private headOut = 0;
  private bank: { x: number; z: number; y: number }; private wet: { x: number; z: number };
  constructor() {
    const mat = wash({ pig: [1, 1, 1], dens: 1, shade: 1.5, body: 0.15, grain: 3, map: shellTexture(), line: 0.9 });
    const P = (this.parts = new Parts(mat, 'turtle')), skin = tone([0.74, 0.74, 0.6], 1.9), W = 0.135, L = 0.17;
    // 背甲：半个扁球，uv 是自上往下看的平面（头在上）；腹甲：一片平的
    const dome = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(W, 0.082, L).toNonIndexed();
    const uv = dome.attributes.uv as THREE.BufferAttribute, pp = dome.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 - (pp.getX(i) / W) * 0.47, 0.5 + (pp.getZ(i) / L) * 0.47);
    dome.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pp.count * 3).fill(1), 3));
    const plain = (g: Geo) => { const a = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) a.setXY(i, 0.04, 0.04); return g; };
    const shell = merge([dome, plain(paint(cyl(W * 0.96, W * 0.9, 0.022, 14).scale(1, 1, L / W).translate(0, -0.011, 0), tone([0.8, 0.78, 0.62], 1.6)))]);
    const head = plain(merge([paint(cyl(0.017, 0.02, 0.09, 6).applyMatrix4(M.mul(M.t(0, 0, 0.03), M.rx(Math.PI / 2))), skin), ell(0.026, 0.021, 0.035, skin, 7, 5).translate(0, 0.004, 0.085)]));
    const leg = plain(ell(0.034, 0.014, 0.05, skin, 6, 4).translate(0, 0, 0.035));
    this.k = { shell: P.add(shell), head: P.add(head), legs: [P.add(leg), P.add(leg), P.add(leg), P.add(leg)] };
    P.build();
    const Pd = SITE.pond, dx = Pd.x - TURTLE.x, dz = Pd.z - TURTLE.z, l = Math.hypot(dx, dz) || 1;
    this.bank = { x: TURTLE.x, z: TURTLE.z, y: TURTLE.y };
    this.wet = { x: TURTLE.x + (dx / l) * 1.15, z: TURTLE.z + (dz / l) * 1.15 };
    this.x = this.wet.x; this.z = this.wet.z;
  }
  update(c: Ctx) {
    const P = this.parts, K = this.k, dt = c.dt, R = this.R, Pd = SITE.pond, wy = Pd.y;
    const near = c.camPos.distanceTo(_p.set(Pd.x, Pd.y, Pd.z)) < 90;
    // 好天：开春到深秋的白天，不下雨雪
    const fine = c.season !== 'winter' && c.hour > 8 && c.hour < 17.2 && c.rain < 0.25 && c.snow < 0.1 && c.night < 0.3;
    const pd = Math.hypot(c.player.x - this.x, c.player.z - this.z), pBank = Math.hypot(c.player.x - this.bank.x, c.player.z - this.bank.z);
    this.t -= dt;
    if (c.wound) { if (fine && pBank > 4) { this.state = 0; this.x = this.bank.x; this.z = this.bank.z; this.yaw = TURTLE.yaw; this.t = 0; } else if (this.state !== 2) { this.state = 2; this.t = 4; } }
    if (this.state === 0) {
      this.x = this.bank.x; this.z = this.bank.z; this.y = this.bank.y; this.headOut += ((0.8 + 0.2 * Math.sin(c.t * 0.3)) - this.headOut) * Math.min(1, dt * 1.5);
      if (pd < 2.5 || !fine) { this.state = 1; this.t = 1.25; this.fx = this.x; this.fz = this.z; }
    } else if (this.state === 1) {
      // 掉过头，一出溜滑下去
      const k = 1 - Math.max(0, this.t) / 1.25, want = Math.atan2(this.wet.x - this.fx, this.wet.z - this.fz);
      this.yaw += wrap(want - this.yaw) * Math.min(1, dt * 7);
      this.x = lerp(this.fx, this.wet.x, k * k); this.z = lerp(this.fz, this.wet.z, k * k); this.y = lerp(this.bank.y, wy - 0.12, k * k);
      this.headOut += (0.3 - this.headOut) * Math.min(1, dt * 6);
      if (this.t < 0) { this.state = 2; this.t = 9 + R() * 7; c.sfx('plop', this.x, this.z, 0.4); this.onPlop?.(this.x, this.z); }
    } else if (this.state === 2) {
      this.y = wy - 0.5;
      if (this.t < 0 && fine) {
        // 换一处浮上来（离人远的那一头）
        const a = Math.atan2((Pd.z - c.player.z) / Pd.rz, (Pd.x - c.player.x) / Pd.rx) + (R() - 0.5) * 1.6, r = 0.3 + 0.3 * R();
        this.sx = this.x = Pd.x + Math.cos(a) * Pd.rx * r; this.sz = this.z = Pd.z + Math.sin(a) * Pd.rz * r; this.yaw = R() * 6.28;
        this.state = 3; this.t = 22 + R() * 25;
      }
    } else if (this.state === 3) {
      // 浮着：只露背脊和头，慢慢地漂
      this.y += (wy - 0.045 + 0.006 * Math.sin(c.t * 1.1) - this.y) * Math.min(1, dt * 1.2);
      this.yaw += 0.08 * Math.sin(c.t * 0.21) * dt; this.x = this.sx + 0.25 * Math.sin(c.t * 0.07); this.z = this.sz + 0.2 * Math.sin(c.t * 0.05 + 1);
      this.headOut += ((pd < 3 ? 0.15 : 0.9) - this.headOut) * Math.min(1, dt * 2);
      if (!fine || pd < 2.2) { this.state = 2; this.t = 8 + R() * 6; this.onPlop?.(this.x, this.z); }
      else if (this.t < 0 && pBank > 5) { this.state = 4; this.t = 0; this.sx = this.x; this.sz = this.z; }
    } else {
      // 游回去：到了水边爬上岸
      const dx = this.wet.x - this.x, dz = this.wet.z - this.z, d = Math.hypot(dx, dz);
      if (d > 0.08 && this.t <= 0) {
        this.yaw += wrap(Math.atan2(dx, dz) - this.yaw) * Math.min(1, dt * 2);
        this.x += (dx / d) * 0.22 * dt; this.z += (dz / d) * 0.22 * dt; this.y = wy - 0.05;
        if (pBank < 4) { this.state = 3; this.sx = this.x; this.sz = this.z; this.t = 15; }
      } else {
        if (this.t <= 0) { this.t = 2.4; this.fx = this.x; this.fz = this.z; }
        const k = sm(1 - this.t / 2.4);
        this.x = lerp(this.fx, this.bank.x, k); this.z = lerp(this.fz, this.bank.z, k); this.y = lerp(wy - 0.05, this.bank.y, k);
        this.yaw += wrap(lerp(Math.atan2(this.bank.x - this.fx, this.bank.z - this.fz), TURTLE.yaw, k) - this.yaw) * Math.min(1, dt * 3);
        if (this.t < 0.03) { this.state = 0; this.t = 0; }
      }
    }
    this.present = this.state !== 2;
    this.pos.set(this.x, this.y, this.z);
    P.mesh.visible = this.present && near;
    if (!P.mesh.visible) return;
    const crawl = this.state === 1 || (this.state === 4 && this.t > 0) ? 1 : 0, swim = this.state === 3 || this.state === 4 ? 1 : 0;
    trs(_b, this.x, this.y + 0.03, this.z, this.yaw, this.state === 1 ? 0.3 : 0, 0);
    P.place(K.shell, _b);
    P.place(K.head, child(_m, _b, 0, 0.012, 0.1 + 0.05 * this.headOut - 0.05, 0.3 * Math.sin(c.t * 0.4) * this.headOut, -0.35 * this.headOut, 0));
    for (let i = 0; i < 4; i++) {
      const fr = i < 2 ? 1 : -1, s = i % 2 ? -1 : 1, pad = (crawl ? 0.5 : swim ? 0.25 : 0.03) * Math.sin(c.t * (crawl ? 9 : 2.2) + i * 1.7);
      P.place(K.legs[i], child(_m, _b, s * 0.095, -0.004, fr * 0.105, s * (fr > 0 ? 0.75 : 2.3) + pad, 0.12, 0));
    }
    P.commit();
  }
}

// ———————————————————————— 猫 ————————————————————————
/**
 * 草堂的猫：夜里、清早、雨天蜷在屋里的榻上，好天的白天挪到松下的矮凳上晒太阳。
 * 多半睡着（蜷成一团）；隔一阵起来伸个懒腰（前腿前探、塌腰、尾巴竖起），转半圈又卧下。人走近了抬头看一眼。
 */
export class Cat {
  parts: Parts;
  pos = new THREE.Vector3();
  private k: { body: number; head: number; legs: number[]; tail: number };
  private where: 'couch' | 'bench' = 'couch'; private yaw = 0; private t = 12; private st = 0; private R = mulberry32(77); private mew = 0; private up = 0;
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.5, shade: 1.4 }), 'cat'));
    const coat: RGB = [0.93, 0.92, 0.88], ink = tone(PIG.mo, 1.7);
    // 白地、背上一片墨（乌云盖雪）
    const body = paint(loftZ([[-0.17, 0.11, 0.05, 0.06], [-0.05, 0.115, 0.065, 0.075], [0.09, 0.115, 0.06, 0.07], [0.17, 0.125, 0.04, 0.05]], 8), coat).translate(0, -0.115, 0);
    const bc = body.attributes.color as THREE.BufferAttribute, bp = body.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bc.count; i++) if (bp.getY(i) > 0.02 && bp.getZ(i) < 0.1) bc.setXYZ(i, ink[0], ink[1], ink[2]);
    const head = merge([ell(0.052, 0.046, 0.05, coat).translate(0, 0.02, 0.03), ell(0.03, 0.022, 0.03, ink).translate(0, 0.05, 0.015),
      ...[-1, 1].map((s) => paint(cyl(0.001, 0.02, 0.04, 4).applyMatrix4(M.mul(M.t(s * 0.032, 0.065, 0.02), M.rz(-s * 0.25))), ink)), ell(0.008, 0.006, 0.006, tone([0.92, 0.6, 0.56], 1.2)).translate(0, 0.012, 0.079)]);
    const leg = paint(cyl(0.013, 0.016, 0.1, 5).translate(0, -0.05, 0), coat);
    const tail = paint(sweep([V(0, 0, 0), V(0, 0.02, -0.09), V(0, 0.05, -0.17), V(0, 0.1, -0.22)], [[-0.012, -0.012], [0.012, -0.012], [0.012, 0.012], [-0.012, 0.012]], { scale: (t) => 1.1 - 0.4 * t, up: V(1, 0, 0) }), ink);
    this.k = { body: P.add(body), head: P.add(head), legs: [P.add(leg), P.add(leg), P.add(leg), P.add(leg)], tail: P.add(tail) };
    P.build();
  }
  update(c: Ctx) {
    const P = this.parts, K = this.k, dt = c.dt, R = this.R;
    // 该在哪：没人看着的时候才挪地方
    const want = c.night < 0.3 && c.hour > 10 && c.hour < 16.8 && c.rain < 0.3 && c.snow < 0.3 ? 'bench' : 'couch', S = CAT[this.where];
    const d = c.camPos.distanceTo(this.pos.set(S.x, S.y, S.z));
    if (want !== this.where && (c.wound || d > 60 || !c.frustum.containsPoint(this.pos))) { this.where = want; this.st = 0; this.t = 8 + R() * 20; this.yaw = CAT[want].yaw; return; }
    if (this.yaw === 0) this.yaw = S.yaw;
    P.mesh.visible = d < 90;
    if (!P.mesh.visible) return;
    const pd = Math.hypot(c.player.x - S.x, c.player.z - S.z);
    this.t -= dt; this.mew -= dt;
    // 0 蜷着睡；1 起身伸懒腰；2 站着转身；3 卧下
    if (this.st === 0 && this.t < 0) { this.st = 1; this.t = 2.6; }
    else if (this.st === 1 && this.t < 0) { this.st = 2; this.t = 1.6; }
    else if (this.st === 2 && this.t < 0) { this.st = 3; this.t = 1.0; }
    else if (this.st === 3 && this.t < 0) { this.st = 0; this.t = 35 + R() * 50; }
    if (this.st === 2) this.yaw += dt * 1.9;
    if (pd < 1.8 && this.mew < 0) { this.mew = 50 + R() * 40; c.sfx('cat', S.x, S.z, 0.35); }
    this.up += ((this.st === 1 || this.st === 2 ? 1 : 0) - this.up) * Math.min(1, dt * 3.5);
    const up = this.up, stretch = this.st === 1 ? Math.sin(Math.PI * Math.min(1, Math.max(0, (2.6 - this.t - 0.5) / 1.6))) : 0, breathe = 0.004 * Math.sin(c.t * 1.6);
    trs(_y, S.x, S.y, S.z, this.yaw);
    child(_b, _y, 0, 0.06 + 0.075 * up + breathe, 0, 0, 0.34 * stretch, 0.25 * (1 - up));
    P.place(K.body, _b);
    // 头：睡着时埋在身侧；醒着、有人走近时抬起来
    const awake = Math.max(up, pd < 2.2 ? 1 : 0);
    P.place(K.head, child(_m, _b, 0.045 * (1 - awake), 0.01 + 0.035 * awake, 0.16 - 0.05 * (1 - awake), 1.0 * (1 - awake), 0.5 * (1 - awake) - 0.3 * stretch, 0));
    for (let i = 0; i < 4; i++) {
      const front = i < 2, sx = i % 2 ? -1 : 1;
      if (up < 0.4) { P.hide(K.legs[i]); continue; }
      P.place(K.legs[i], child(_m, _b, sx * 0.04, -0.03, front ? 0.11 : -0.11, 0, front ? -0.34 * stretch - 0.7 * stretch : -0.34 * stretch, 0, 0.55 + 0.45 * up));
    }
    // 尾：睡着绕在身边；伸懒腰时竖起来
    P.place(K.tail, child(_m, _b, 0, 0, -0.16, 2.2 * (1 - up), -1.1 * stretch - 0.3 * up, 0));
    P.commit();
  }
}
