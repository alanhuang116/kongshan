/**
 * 池里的鱼（几道游动的墨影，人近了就散）、池边的老龟（好天爬到岸上晒背，背甲上隐隐是洛书的九宫点子；人近了滑进水里，过一阵在别处浮上来）。
 * （黄狗、猫在 fauna/dog.ts、fauna/cat.ts。）
 */
import * as THREE from 'three';
import { M, V, box, cyl, merge, sphere, sweep, type Geo } from '../core/geo';
import { mulberry32 } from '../core/rng';
import { PIG, wash, type RGB } from '../ink/ink';
import { SITE } from '../site';
import type { Ctx } from './person';
import { Parts, child, creatureMat, loftZ, paint, tone, trs } from './rig';
import { TURTLE, footY } from './spots';

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const sm = (k: number) => { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
const _b = new THREE.Matrix4(), _m = new THREE.Matrix4(), _y = new THREE.Matrix4(), _a = new THREE.Vector3(), _p = new THREE.Vector3();
const ell = (rx: number, ry: number, rz: number, c: RGB, ws = 8, hs = 6) => paint(sphere(1, ws, hs).scale(rx, ry, rz), c);

// ———————————————————————— 池里的鱼 ————————————————————————
interface Fish { u: number; v: number; yaw: number; sp: number; dart: number; deep: number; ph: number; k: number }
export class Fishes {
  parts: Parts;
  private fish: Fish[] = [];
  private R = mulberry32(21);
  /** 撒下去的饭粒：在哪（池里的相对坐标）、还剩几秒 */
  private food: { u: number; v: number; t: number } | null = null;
  /** 跃出水面的那一条（夏天偶尔一跃）：第几条、跳到哪一步了 */
  private leap = { i: -1, k: 0, next: 30 };
  /** 水面荡一圈、溅几点水（总装那边接上；没接就不做） */
  ripple: ((x: number, z: number, s: number) => void) | null = null;
  splash: ((x: number, y: number, z: number, n?: number) => void) | null = null;
  constructor() {
    // 没骨：不勾线，只是水底下一抹墨影；有两条是红的（金鲫）
    const P = (this.parts = new Parts(creatureMat({ body: 0, line: 0, shade: 1.1 }), 'fish')), ink = tone(PIG.mo, 1.9), red = tone([0.95, 0.6, 0.42], 1.6);
    const g = (c: typeof ink) => merge([ell(0.022, 0.012, 0.085, c, 6, 4), paint(box(0.003, 0.034, 0.05).translate(0, 0, -0.1), c), paint(box(0.05, 0.003, 0.03).translate(0, 0, 0.01), c)]);
    const gi = g(ink), gr = g(red);
    for (let i = 0; i < 10; i++) this.fish.push({ u: (this.R() - 0.5) * 1.1, v: (this.R() - 0.5) * 1.1, yaw: this.R() * 6.28, sp: 0.12 + this.R() * 0.12, dart: 0, deep: 0, ph: this.R() * 6, k: P.add(i === 3 || i === 7 ? gr : gi) });
    P.build();
  }
  /** 撒一点饭粒：近处的鱼都聚过来，嘴凑到水面上一张一合 */
  feed(x: number, z: number) { const Pd = SITE.pond; this.food = { u: (x - Pd.x) / Pd.rx, v: (z - Pd.z) / Pd.rz, t: 14 }; }
  /** 此刻聚在饭粒那里的有几条 */
  get feeding() { const f = this.food; if (!f) return 0; let n = 0; for (const o of this.fish) if (Math.hypot(o.u - f.u, o.v - f.v) < 0.16) n++; return n; }
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
      const fd = this.food, eating = fd && Math.hypot(f.u - fd.u, f.v - fd.v) < 0.6;
      // 人到了池边：近处的鱼一窜，沉下去（有人撒食的时候不怕）
      if (!fd && pe < 1.32 && f.dart <= 0 && Math.hypot(c.player.x - x, c.player.z - z) < 3.6) { f.dart = 1.5; f.yaw = Math.atan2(x - c.player.x, z - c.player.z) + (R() - 0.5) * 0.8; }
      if (f.dart > 0) f.dart -= dt;
      f.deep += ((f.dart > 0 ? 1 : 0) - f.deep) * Math.min(1, dt * (f.dart > 0 ? 4 : 0.35));
      // 慢慢地游：朝向一点一点地变，快到岸了就折回池心
      const back = wrap(Math.atan2(-f.u * Pd.rx, -f.v * Pd.rz) - f.yaw);
      let v = f.sp * (1 - 0.5 * winter) + 1.6 * Math.max(0, f.dart - 0.6);
      if (fd && eating) {
        // 抢食：朝饭粒游过去，到了就在那里打转、往上凑
        const to = wrap(Math.atan2((fd.u - f.u) * Pd.rx, (fd.v - f.v) * Pd.rz) - f.yaw), dd = Math.hypot((fd.u - f.u) * Pd.rx, (fd.v - f.v) * Pd.rz);
        f.yaw += Math.sign(to) * Math.min(Math.abs(to), dt * 4) + (dd < 0.5 ? Math.sin(c.t * 2 + f.ph) * dt * 2 : 0);
        v = dd > 0.4 ? 0.5 : 0.12;
        f.deep += (-0.3 - f.deep) * Math.min(1, dt * 2);
        if (dd < 0.45 && R() < dt * 0.9) { this.ripple?.(x, z, 0.35); if (R() < 0.3) c.sfx('ripple', x, z, 0.12); }
      } else f.yaw += (r > 0.62 ? Math.sign(back) * 1.6 : Math.sin(c.t * 0.3 + f.ph * 3) * 0.5) * dt * (f.dart > 0 ? 0.3 : 1);
      f.u += (Math.sin(f.yaw) * v * dt) / Pd.rx; f.v += (Math.cos(f.yaw) * v * dt) / Pd.rz;
      if (r > 0.74) { f.u *= 0.74 / r; f.v *= 0.74 / r; }
      f.ph += dt * (3 + v * 20);
      // 跃：一条鱼弓着身子跳出水面，落回去
      const li = this.fish.indexOf(f);
      if (li === this.leap.i) {
        const k = this.leap.k, y = Pd.y - 0.1 + 0.55 * Math.sin(Math.PI * k);
        P.place(f.k, trs(_m, x, y, z, f.yaw, -1.6 * (k - 0.5), 0, 1.15));
        continue;
      }
      P.place(f.k, trs(_m, x, Pd.y - 0.14 - 0.1 * Math.sin(f.ph * 0.07) ** 2 - 0.42 * f.deep - 0.25 * winter + (eating ? 0.1 : 0), z, f.yaw + 0.16 * Math.sin(f.ph), 0, 0, 0.9 + 0.5 * ((f.k * 0.37) % 1)));
    }
    if (this.food) { this.food.t -= dt; if (this.food.t < 0) this.food = null; }
    // 夏天偶尔一跃（鱼跃）
    const L = this.leap;
    if (L.i < 0) { L.next -= dt; if (L.next < 0 && c.season === 'summer' && c.night < 0.4 && !this.food) { L.i = Math.floor(R() * this.fish.length); L.k = 0; const f = this.fish[L.i]; this.splash?.(Pd.x + f.u * Pd.rx, Pd.y, Pd.z + f.v * Pd.rz, 5); } }
    else {
      L.k += dt / 0.75;
      if (L.k >= 1) { const f = this.fish[L.i], x = Pd.x + f.u * Pd.rx, z = Pd.z + f.v * Pd.rz; this.ripple?.(x, z, 0.8); this.splash?.(x, Pd.y, z, 8); c.sfx('fishJump', x, z, 0.5); L.i = -1; L.next = 35 + R() * 60; }
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
