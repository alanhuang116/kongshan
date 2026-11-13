/**
 * 牛与犁。一头黄牛（韩滉《五牛图》里那样赭黄的），颈上架轭，两根套绳拖着一张曲辕犁。
 * 牛、轭、套绳、犁是一个几何（一次绘制）：身、头颈、四条腿、尾各是一块，每帧搬一遍。
 *
 * 牛在前头走，犁像拖车一样跟着（犁头总朝着牛尾），所以地头掉头时犁是斜着被拽过去的；
 * 扶犁的人站在犁梢后面，手该扶在哪由 handle() 给出。不套犁的时候（歇晌、别的季节）犁、轭、绳都收起来。
 */
import * as THREE from 'three';
import { M, V, box, cyl, cylUp, merge, sphere, sweep, type Geo } from '../core/geo';
import { PIG, type RGB } from '../ink/ink';
import { Parts, child, creatureMat, loftZ, paint, span, tone, trs } from './rig';
import { footY } from './spots';

/** 黄牛的赭黄；水牛的青灰（墨色） */
const COAT: Record<'ox' | 'buffalo', RGB> = { ox: tone([0.86, 0.75, 0.62], 1.5), buffalo: tone([0.62, 0.64, 0.68], 2.0) };
const DARK: RGB = tone(PIG.jiao, 1.9), HORN: RGB = tone(PIG.mo, 1.6);
const WOOD: RGB = tone([0.78, 0.66, 0.54], 1.7), IRON: RGB = tone(PIG.mo, 2.7), ROPE: RGB = tone([0.85, 0.78, 0.62], 1.6);
/** 牛身上几处的位置（牛自己的坐标：原点在身子正中的地面，头朝 +z） */
const NECK = { y: 1.03, z: 0.86 }, LEG_F = { x: 0.2, y: 0.92, z: 0.52 }, LEG_H = { x: 0.2, y: 0.95, z: -0.62 }, TAIL = { y: 1.2, z: -0.9 }, YOKE = { x: 0.3, y: 1.0, z: 0.74 };
/** 犁上几处的位置（犁自己的坐标：原点在犁铧尖落地处，朝前是 +z）：前头挂套绳的横木两端、犁梢（扶手）的顶 */
const BAR = { x: 0.3, y: 0.4, z: 1.02 }, GRIP = { x: 0, y: 0.96, z: -0.86 };
/** 牛尾到犁铧多远、人站在犁梢后多远 */
const TOW = 2.05, STAND = 0.5;

function oxBody(HIDE: RGB): Geo {
  const body = paint(loftZ([[-0.86, 0.99, 0.2, 0.25], [-0.62, 0.98, 0.31, 0.31], [-0.1, 0.92, 0.36, 0.35], [0.42, 0.93, 0.33, 0.38], [0.7, 1.0, 0.27, 0.36], [0.92, 1.02, 0.2, 0.27]], 12, 1.12), HIDE);
  // 肚腹下面淡一些（留白），脊上深一点
  const c = body.attributes.color as THREE.BufferAttribute, p = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++) { const k = p.getY(i) < 0.78 ? 1.12 : p.getY(i) > 1.18 ? 0.86 : 1; c.setXYZ(i, Math.min(1, c.getX(i) * k), Math.min(1, c.getY(i) * k), Math.min(1, c.getZ(i) * k)); }
  return body;
}
function oxHead(HIDE: RGB, buffalo: boolean): Geo {
  // 原点在颈根；颈朝前略朝下伸出去，头在尽头
  const neck = paint(loftZ([[0.0, 0, 0.19, 0.26], [0.26, -0.03, 0.15, 0.2], [0.42, -0.04, 0.135, 0.165], [0.6, -0.1, 0.095, 0.115], [0.72, -0.13, 0.085, 0.09]], 10), HIDE);
  const c = neck.attributes.color as THREE.BufferAttribute, p = neck.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++) if (p.getZ(i) > 0.64) c.setXYZ(i, DARK[0] * 1.6, DARK[1] * 1.6, DARK[2] * 1.6);
  const parts: Geo[] = [neck];
  for (const s of [-1, 1]) {
    // 角：黄牛的短，自头顶朝外、朝上、再朝前弯；水牛的是一对朝后掠的大弯月
    const horn = buffalo ? [V(s * 0.1, 0.07, 0.34), V(s * 0.3, 0.1, 0.27), V(s * 0.43, 0.2, 0.13), V(s * 0.4, 0.33, -0.02)] : [V(s * 0.09, 0.08, 0.36), V(s * 0.2, 0.14, 0.36), V(s * 0.27, 0.24, 0.4), V(s * 0.26, 0.33, 0.46)];
    parts.push(paint(sweep(horn, [[-0.022, -0.022], [0.022, -0.022], [0.022, 0.022], [-0.022, 0.022]], { scale: (t) => (buffalo ? 1.7 : 1.15) - (buffalo ? 1.35 : 0.85) * t }), HORN));
    parts.push(paint(sphere(1, 6, 4).scale(0.085, 0.03, 0.05).applyMatrix4(M.mul(M.t(s * 0.19, 0.03, 0.31), M.rz(s * 0.5))), HIDE));
    parts.push(paint(sphere(0.016, 5, 4).translate(s * 0.118, 0.005, 0.47), DARK));
  }
  return merge(parts);
}
function oxLeg(hind: boolean, HIDE: RGB): Geo {
  // 原点在腿根（肩 / 髋），往下长；后腿在飞节处有个折
  const parts: Geo[] = [];
  if (hind) {
    parts.push(paint(cyl(0.062, 0.1, 0.5, 7).applyMatrix4(M.mul(M.rx(-0.2), M.t(0, -0.25, 0))), HIDE));
    parts.push(paint(cyl(0.044, 0.058, 0.46, 6).applyMatrix4(M.mul(M.t(0, -0.47, -0.1), M.rx(0.2), M.t(0, -0.2, 0))), HIDE));
    parts.push(paint(cyl(0.055, 0.06, 0.07, 6).translate(0, -0.9, -0.02), DARK));
  } else {
    parts.push(paint(cyl(0.05, 0.09, 0.52, 7).translate(0, -0.26, 0), HIDE));
    parts.push(paint(cyl(0.04, 0.05, 0.34, 6).translate(0, -0.68, 0), HIDE));
    parts.push(paint(cyl(0.055, 0.06, 0.07, 6).translate(0, -0.875, 0.01), DARK));
  }
  return merge(parts);
}
const oxTail = (HIDE: RGB): Geo => merge([paint(cyl(0.012, 0.022, 0.62, 5).translate(0, -0.31, 0), HIDE), paint(sphere(1, 6, 5).scale(0.035, 0.1, 0.035).translate(0, -0.68, 0), DARK)]);
/** 轭：架在颈上的一根弯木（牛的坐标） */
const yokeGeo = (): Geo => merge([-1, 1].map((s) => paint(cyl(0.03, 0.034, 1, 5).applyMatrix4(M.span(V(0, 1.36, YOKE.z + 0.04), V(s * YOKE.x, YOKE.y - 0.04, YOKE.z))), WOOD)));
/** 曲辕犁（犁的坐标）：辕弯着自前头的横木伸到犁身，下面是犁底与铧，后面一根犁梢是扶手 */
function ploughGeo(): Geo {
  const sq = (r: number): Array<[number, number]> => [[-r, -r], [r, -r], [r, r], [-r, r]];
  const parts: Geo[] = [
    paint(sweep([V(0, BAR.y, BAR.z), V(0, 0.52, 0.66), V(0, 0.64, 0.24), V(0, 0.56, -0.14), V(0, 0.2, -0.36)], sq(0.032), { up: V(1, 0, 0) }), WOOD),          // 辕
    paint(box(BAR.x * 2 + 0.06, 0.045, 0.05, 'x').translate(0, BAR.y, BAR.z), WOOD),                                                                              // 横木（犁盘）
    paint(sweep([V(0, 0.05, 0.3), V(0, 0.05, -0.2), V(0, 0.1, -0.5)], sq(0.04), { up: V(1, 0, 0) }), WOOD),                                                       // 犁底
    paint(cyl(0.028, 0.03, 1, 5).applyMatrix4(M.span(V(0, 0.08, 0.02), V(0, 0.62, 0.2))), WOOD),                                                                  // 犁箭
    paint(sweep([V(0, 0.08, -0.46), V(0, 0.5, -0.66), V(0, 0.86, -0.8), V(GRIP.x, GRIP.y, GRIP.z), V(0, 0.99, -0.98)], sq(0.026), { up: V(1, 0, 0) }), WOOD),     // 犁梢
  ];
  // 铧：一个朝前下方的铁尖；壁：铧上面翻土的那一片
  const share = new THREE.ConeGeometry(0.11, 0.34, 4, 1).rotateX(Math.PI / 2 + 0.25).scale(1, 0.45, 1).translate(0, 0.03, 0.36).toNonIndexed();
  share.setAttribute('color', new THREE.BufferAttribute(new Float32Array(share.attributes.position.count * 3).fill(1), 3));
  parts.push(paint(share, IRON));
  parts.push(paint(box(0.02, 0.22, 0.3).applyMatrix4(M.mul(M.t(0.05, 0.19, 0.16), M.ry(-0.35), M.rz(-0.25))), IRON));
  return merge(parts);
}

const _b = new THREE.Matrix4(), _m = new THREE.Matrix4(), _pl = new THREE.Matrix4(), _a = new THREE.Vector3(), _c = new THREE.Vector3();
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };

export class OxTeam {
  parts: Parts;
  /** 牛在哪、朝哪 */
  x = 0; z = 0; yaw = 0;
  /** 犁铧在哪、犁朝哪 */
  px = 0; pz = 0; pyaw = 0;
  /** 套着犁没有；在不在（冬天进了圈）；卧着几成；低头吃草几成 */
  hitched = false; present = true; lie = 0; graze = 0;
  /** 挡路的两个圆（前半身、后半身） */
  blockers = [{ x: 1e6, z: 1e6, r: 0 }, { x: 1e6, z: 1e6, r: 0 }];
  private k: { body: number; head: number; legs: number[]; tail: number; yoke: number; plough: number; ropes: number[] };
  private phase = 0; private speed = 0; private lieS = 0; private grazeS = 0; private hitchS = 0;
  /** 个头（水牛大一圈） */
  readonly size: number;

  /** kind：ox 是拉犁的黄牛（带轭、套绳、犁）；buffalo 是牧童骑的水牛（青灰，一对大弯角，不带犁） */
  constructor(kind: 'ox' | 'buffalo' = 'ox') {
    const P = (this.parts = new Parts(creatureMat({ body: 0.1, shade: 1.6 }), kind)), coat = COAT[kind], team = kind === 'ox';
    this.size = team ? 1 : 1.07;
    const lf = oxLeg(false, coat), lh = oxLeg(true, coat), rope = paint(cylUp(0.011, 0.011, 1, 4), ROPE);
    this.k = { body: P.add(oxBody(coat)), head: P.add(oxHead(coat, !team)), legs: [P.add(lf), P.add(lf), P.add(lh), P.add(lh)], tail: P.add(oxTail(coat)), yoke: team ? P.add(yokeGeo()) : -1, plough: team ? P.add(ploughGeo()) : -1, ropes: team ? [P.add(rope), P.add(rope)] : [] };
    P.build();
  }
  /** 牛背上骑着人的那一点（背脊正中，世界坐标） */
  back(out: THREE.Vector3): THREE.Vector3 { return out.set(this.x - Math.sin(this.yaw) * 0.05, footY(this.x, this.z) + (1.27 - 0.6 * this.lieS) * this.size, this.z - Math.cos(this.yaw) * 0.05); }

  /** 放到某处（歇着的地方） */
  put(x: number, z: number, yaw: number) { this.x = x; this.z = z; this.yaw = yaw; this.speed = 0; this.trail(true); }
  /** 朝一点走一步（转身有个限度，所以掉头是兜一个小圈）；返回还差多远 */
  toward(tx: number, tz: number, speed: number, dt: number): number {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const off = wrap(Math.atan2(dx, dz) - this.yaw), rate = 0.62;
    this.yaw = wrap(this.yaw + Math.max(-rate * dt, Math.min(rate * dt, off)));
    const v = speed * (0.45 + 0.55 * Math.max(0, Math.cos(off)));
    this.x += Math.sin(this.yaw) * v * dt; this.z += Math.cos(this.yaw) * v * dt;
    this.speed = v; this.phase += (v * dt) / 1.5;
    this.trail(false);
    return d;
  }
  halt() { this.speed = 0; }
  /** 犁跟着牛：犁头总朝着牛尾，离着 TOW 那么远 */
  private trail(reset: boolean) {
    const hx = this.x - Math.sin(this.yaw) * 0.95, hz = this.z - Math.cos(this.yaw) * 0.95;
    if (reset) { this.pyaw = this.yaw; this.px = hx - Math.sin(this.yaw) * TOW; this.pz = hz - Math.cos(this.yaw) * TOW; return; }
    const dx = hx - this.px, dz = hz - this.pz, d = Math.hypot(dx, dz) || 1;
    this.pyaw = Math.atan2(dx, dz);
    this.px = hx - (dx / d) * TOW; this.pz = hz - (dz / d) * TOW;
  }
  /** 扶犁的手该在哪（世界坐标） */
  handle(out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(this.pyaw), s = Math.sin(this.pyaw);
    return out.set(this.px + GRIP.x * c + GRIP.z * s, footY(this.px, this.pz) + GRIP.y, this.pz - GRIP.x * s + GRIP.z * c);
  }
  /** 扶犁的人站在哪（犁梢后面偏左一点） */
  stand(out: { x: number; z: number; yaw: number }) {
    const c = Math.cos(this.pyaw), s = Math.sin(this.pyaw), lz = GRIP.z - STAND, lx = 0.13;
    out.x = this.px + lx * c + lz * s; out.z = this.pz - lx * s + lz * c; out.yaw = this.pyaw;
  }

  update(dt: number, t: number) {
    const P = this.parts, K = this.k;
    P.mesh.visible = this.present;
    const b = this.blockers;
    if (!this.present) { b[0].x = b[0].z = b[1].x = b[1].z = 1e6; b[0].r = b[1].r = 0; return; }
    this.lieS += (this.lie - this.lieS) * Math.min(1, dt * 1.2);
    this.grazeS += (this.graze - this.grazeS) * Math.min(1, dt * 1.0);
    this.hitchS += ((this.hitched ? 1 : 0) - this.hitchS) * Math.min(1, dt * 4);
    const lie = this.lieS, walk = Math.min(1, this.speed / 0.3), ph = this.phase * Math.PI * 2, c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const gy = footY(this.x, this.z), drop = 0.6 * lie, bob = 0.012 * walk * Math.sin(ph * 2);
    // 身：走着略起伏；卧下时落到地上，略朝一侧歪
    trs(_b, this.x, gy - drop + bob, this.z, this.yaw, 0, 0.1 * lie, this.size);
    P.place(K.body, _b);
    // 头颈：拉犁时低着；吃草时探到地上；卧着时平抬，慢慢地嚼
    const pull = this.hitchS * 0.2 * walk, nod = 0.05 * walk * Math.sin(ph * 2 + 0.6) + 0.02 * Math.sin(t * 0.7);
    const chew = lie * 0.03 * Math.sin(t * 3.1), down = 0.92 * this.grazeS * (1 - lie) * (0.85 + 0.15 * Math.sin(t * 0.9));
    P.place(K.head, child(_m, _b, 0, NECK.y, NECK.z, 0.12 * Math.sin(t * 0.23) * (1 - walk), 0.1 + pull + nod + down + chew - 0.12 * lie, 0));
    // 腿：对角的两条一起迈；卧下时收到身子底下
    const sw = 0.3 * walk;
    for (let i = 0; i < 4; i++) {
      const front = i < 2, sx = i % 2 ? -1 : 1, L = front ? LEG_F : LEG_H, a = sw * Math.sin(ph + (i === 0 || i === 3 ? 0 : Math.PI));
      if (lie > 0.6) P.hide(K.legs[i]);
      else P.place(K.legs[i], child(_m, _b, sx * L.x, L.y, L.z, 0, -a + (front ? 1 : -1) * 0.9 * lie, 0, 1 - 0.3 * lie));
    }
    P.place(K.tail, child(_m, _b, 0, TAIL.y, TAIL.z, 0, 0.12, 0.28 * Math.sin(t * 1.7) * Math.max(0, Math.sin(t * 0.31)) + 0.06 * Math.sin(ph)));
    // 轭、套绳、犁
    if (K.plough < 0) { /* 水牛：没有犁 */ } else if (this.hitchS > 0.5) {
      P.place(K.yoke, _b);
      const py = footY(this.px, this.pz);
      trs(_pl, this.px, py, this.pz, this.pyaw, 0.012 * Math.sin(ph * 2), 0.03 * Math.sin(ph));
      P.place(K.plough, _pl);
      for (let i = 0; i < 2; i++) {
        const sx = i ? -1 : 1;
        _a.set(sx * YOKE.x, YOKE.y, YOKE.z).applyMatrix4(_b); _c.set(sx * BAR.x, BAR.y, BAR.z).applyMatrix4(_pl);
        P.place(K.ropes[i], span(_m, _a.x, _a.y, _a.z, _c.x, _c.y, _c.z));
      }
    } else { P.hide(K.yoke); P.hide(K.plough); P.hide(K.ropes[0]); P.hide(K.ropes[1]); }
    P.commit();
    b[0].x = this.x + s * 0.5; b[0].z = this.z + c * 0.5; b[1].x = this.x - s * 0.5; b[1].z = this.z - c * 0.5; b[0].r = b[1].r = 0.5;
  }
}
