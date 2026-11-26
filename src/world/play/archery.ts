/**
 * 射圃的器物（村塾东南、村路南边那一片草地上；侯张在南边二十步外，背后是溪与田）：
 *   侯 —— 一幅白布，上下两道纲系在两根植上；布当中画一圈墨（正）、正中一圆朱（鹄）。中了箭，布一颤一颤地荡开（cloth）。
 *   物 —— 射位：地上画的十字，两个（上射在西、下射在东），射的人站在十字上，左肩对着侯。
 *   楅 —— 射位东边的一只矮木架，八支箭竖插在上面；一轮开始，箭从这里取走。
 *   旌 —— 侯东边一根竹竿挑着一条窄幡，幡朝风去的方向飘：看它知道风从哪来、多大。
 *   弓 —— 角弓，漆成深色，弭（两梢）反曲；弦是一根细线（每帧按两梢与扣弦的手现摆）。箭 —— 竹笴、三片羽、铁镞，八支一张实例化的网。
 * 不动的（植、纲、物、楅、旌竿）并进 play/kit 的那一块不动的小器物里（setStatic），一次绘制。
 */
import * as THREE from 'three';
import { M, V as V3c, cyl, merge, sweep, type Geo } from '../core/geo';
import { dye, pole, v3 } from '../build/kit';
import { PIG, wash } from '../ink/ink';
import { groundAt } from '../walk';
import { HOU } from './games/arrow';
import { Line, inkGeo, mats } from './kit';

/** 射圃：侯心（地上的那一点）、两个射位、楅、旌 */
const TX = 113, TZ = 36.5, MZ = 16.5;
const gy = (x: number, z: number) => groundAt(x, z) ?? 8;
export const RANGE = {
  /** 侯心离地多高 */ hy: 1.25,
  target: { x: TX, z: TZ },
  /** 射位：0 上射（西）、1 下射（东） */
  marks: [{ x: TX - 0.8, z: MZ }, { x: TX + 0.8, z: MZ }],
  rack: { x: TX + 2.3, z: MZ - 0.25 },
  flag: { x: TX + 2.3, z: TZ + 0.2 },
  /** 植（两根竿）离侯心多远 */ postX: HOU.hw + 0.24,
};
export const targetCenter = () => new THREE.Vector3(RANGE.target.x, gy(RANGE.target.x, RANGE.target.z) + RANGE.hy, RANGE.target.z);
/** 射位的地面高 */
export const markY = (i: number) => gy(RANGE.marks[i].x, RANGE.marks[i].z);

// —— 箭 ——
export const ARROW_LEN = 0.82;
/** 一支箭（原点在镞尖，沿 −y 伸到箭尾；要朝哪飞就把 +y 转到哪个方向的反面——见 act 里的摆法）：这里原点在镞尖，箭身朝 −y */
export function arrowGeo(): Geo {
  const shaft = inkGeo(new THREE.CylinderGeometry(0.0042, 0.0042, ARROW_LEN - 0.05, 5).translate(0, -0.05 - (ARROW_LEN - 0.05) / 2, 0), [0.93, 0.89, 0.74]);
  const head = inkGeo(new THREE.ConeGeometry(0.009, 0.06, 4).rotateX(0).translate(0, -0.03, 0), [0.4, 0.4, 0.42]);
  const parts: Geo[] = [shaft, head];
  // 三片羽：箭尾往前十几厘米，墨色、窄长
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const vane = new THREE.PlaneGeometry(0.024, 0.13).translate(0.016, -ARROW_LEN + 0.1, 0).rotateY(a);
    parts.push(inkGeo(vane, [0.36, 0.36, 0.38]));
  }
  // 箭尾的扣（括）
  parts.push(inkGeo(new THREE.CylinderGeometry(0.0055, 0.0055, 0.018, 5).translate(0, -ARROW_LEN + 0.009, 0), [0.5, 0.42, 0.36]));
  return merge(parts);
}

// —— 弓 ——
/** 弓（原点在弣——握手处，弓身在 yz 平面里：+y 上弭，弓背朝 +z；弦在 −z 一侧） */
export const BOW = { half: 0.62, belly: 0.13, tip: [0, 0.63, -0.07] as [number, number, number] };
export function bowGeo(): Geo {
  // 一边的弓臂：自弣往上弯出去，到梢反曲回来
  const arm = (s: number) => [V3c(0, 0, 0.01), V3c(0, 0.18 * s, 0.07), V3c(0, 0.38 * s, 0.1), V3c(0, 0.52 * s, 0.06), V3c(0, 0.6 * s, -0.02), V3c(0, 0.63 * s, -0.07)];
  const sq = (r: number): Array<[number, number]> => [[-r, -r * 0.7], [r, -r * 0.7], [r, r * 0.7], [-r, r * 0.7]];
  const lacquer: [number, number, number] = [0.48, 0.4, 0.38];
  const up = dye(inkGeo(sweep(arm(1), sq(0.014), { up: new THREE.Vector3(1, 0, 0), scale: (t) => 1 - 0.45 * t })), lacquer, 1.8);
  const dn = dye(inkGeo(sweep(arm(-1), sq(0.014), { up: new THREE.Vector3(1, 0, 0), scale: (t) => 1 - 0.45 * t })), lacquer, 1.8);
  // 弣：裹着一段浅色的丝
  const grip = dye(inkGeo(cyl(0.019, 0.019, 0.12, 6)), [0.9, 0.84, 0.7], 1.3);
  // 两梢：骨弭，浅
  const tips = [1, -1].map((s) => dye(inkGeo(new THREE.SphereGeometry(0.012, 5, 4).translate(0, 0.63 * s, -0.07)), [0.94, 0.9, 0.8], 1.2));
  return merge([up, dn, grip, ...tips]);
}
/** 弓与弦：弓身一块网，弦一根细线（两梢 → 扣弦的那一点 → 两梢） */
export class Bow {
  mesh: THREE.Mesh; string: Line;
  private top = new THREE.Vector3(); private bot = new THREE.Vector3(); private pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  constructor() {
    this.mesh = new THREE.Mesh(bowGeo(), mats().obj);
    this.mesh.name = 'games:bow';
    this.string = new Line(3, 0.0035);
    this.string.mesh.name = 'games:bowstring';
  }
  add(scene: THREE.Scene) { scene.add(this.mesh, this.string.mesh); }
  set visible(v: boolean) { this.mesh.visible = v; this.string.mesh.visible = v; }
  /**
   * 摆弓：grip 是握弓的那一点（左手掌心），up 是弓身朝上的方向，back 是弓背朝的方向（朝侯）；nock 给了是弦被拉到的那一点（右手），没给就是直的
   */
  set(grip: THREE.Vector3, up: THREE.Vector3, back: THREE.Vector3, nock: THREE.Vector3 | null, cam: THREE.Vector3) {
    const z = back.clone().normalize(), y = up.clone().addScaledVector(z, -up.dot(z)).normalize(), x = new THREE.Vector3().crossVectors(y, z);
    const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(grip);
    this.mesh.matrixAutoUpdate = false; this.mesh.matrix.copy(m); this.mesh.matrixWorldNeedsUpdate = true;
    this.top.set(...BOW.tip).applyMatrix4(m); this.bot.set(BOW.tip[0], -BOW.tip[1], BOW.tip[2]).applyMatrix4(m);
    const [a, b, c] = this.pts;
    a.copy(this.top); c.copy(this.bot);
    if (nock) b.copy(nock); else b.lerpVectors(this.top, this.bot, 0.5);
    this.string.set(this.pts, cam);
  }
}

// —— 侯：布与上面画的圈 ——
function clothTexture(): THREE.CanvasTexture {
  const px = 256, c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d')!;
  // 布：素白，略有几道织纹
  g.fillStyle = '#f3efe4'; g.fillRect(0, 0, px, px);
  g.globalAlpha = 0.05; g.fillStyle = '#7a7466';
  for (let i = 0; i < px; i += 3) g.fillRect(0, i, px, 1);
  g.globalAlpha = 1;
  const cx = px / 2, k = px / (2 * HOU.hw);
  // 布边一道淡墨（侯的边缘缝着一道深色的布）
  g.strokeStyle = 'rgba(60,58,56,0.55)'; g.lineWidth = px * 0.035; g.strokeRect(px * 0.02, px * 0.02, px * 0.96, px * 0.96);
  // 正：一圈墨，笔头不匀（一笔绕成，起笔处重、收笔处留一道口）
  const ring = (r: number, w: number, a0: number, col: string) => {
    for (let i = 0; i < 64; i++) {
      const t0 = a0 + (i / 64) * Math.PI * 1.94, t1 = t0 + Math.PI * 1.94 / 64 + 0.01;
      g.strokeStyle = col; g.globalAlpha = 0.55 + 0.4 * Math.sin(i * 0.37 + 1.2) ** 2;
      g.lineWidth = w * (0.8 + 0.35 * Math.sin(i * 0.21));
      g.beginPath(); g.arc(cx, cx, r, t0, t1); g.stroke();
    }
    g.globalAlpha = 1;
  };
  ring(HOU.zheng * k, px * 0.05, 0.6, '#3c3a38');
  ring((HOU.zheng - 0.11) * k, px * 0.012, 2.1, '#57524c');
  // 鹄：正中一圆朱，边上晕开一点
  const gr = g.createRadialGradient(cx, cx, HOU.hu * k * 0.55, cx, cx, HOU.hu * k * 1.08);
  gr.addColorStop(0, 'rgba(184,64,44,0.96)'); gr.addColorStop(0.85, 'rgba(176,60,42,0.9)'); gr.addColorStop(1, 'rgba(176,60,42,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cx, HOU.hu * k * 1.08, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}
/** 侯的布：一张分了格的面（中箭时按格颤），朝 −z（射位那边） */
export class Cloth {
  mesh: THREE.Mesh;
  private base: Float32Array; private pos: THREE.BufferAttribute;
  private hits: Array<{ u: number; v: number; t: number; a: number }> = [];
  private sway = 0;
  constructor(center: THREE.Vector3) {
    const W = HOU.hw * 2, H = HOU.hh * 2, g = new THREE.PlaneGeometry(W, H, 14, 14);
    // 面朝 −z：射位在北边（−z）
    g.rotateY(Math.PI);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    this.pos = g.attributes.position as THREE.BufferAttribute;
    this.base = new Float32Array(this.pos.array as Float32Array);
    this.mesh = new THREE.Mesh(g, wash({ pig: [1, 1, 1], dens: 1, body: 0.55, shade: 1.15, grain: 1.6, line: 0.45, map: clothTexture(), side: THREE.DoubleSide, snow: 0 }));
    this.mesh.position.copy(center);
    this.mesh.name = 'games:hou';
  }
  /** 中了一箭：(u, v) 是从射位看的横竖（右、上为正） */
  hit(u: number, v: number, a = 1) { this.hits.push({ u, v, t: 0, a }); if (this.hits.length > 4) this.hits.shift(); }
  update(dt: number, wind: number) {
    this.sway += dt;
    for (const h of this.hits) h.t += dt;
    this.hits = this.hits.filter((h) => h.t < 1.6);
    const P = this.pos.array as Float32Array, B = this.base;
    const idle = this.hits.length === 0;
    for (let i = 0; i < P.length; i += 3) {
      // 面转过半圈：本地 x 是从射位看过去的「右」的反面
      const lx = B[i], ly = B[i + 1], u = -lx, v = ly;
      // 风里轻轻地鼓一鼓（上下两道纲绷着，中间鼓得多）
      const edge = (1 - (ly / HOU.hh) ** 2) * (1 - 0.4 * (lx / HOU.hw) ** 2);
      let dz = 0.025 * wind * edge * (1 + 0.4 * Math.sin(this.sway * 1.7 + lx * 2));
      if (!idle) for (const h of this.hits) {
        const d = Math.hypot(u - h.u, v - h.v), k = Math.exp(-h.t * 3.2) * h.a;
        dz += 0.05 * k * Math.cos(d * 9 - h.t * 22) * Math.exp(-d * 1.6) * edge;
      }
      P[i + 2] = B[i + 2] + dz;
    }
    this.pos.needsUpdate = true;
  }
}

/** 侯两边的植、上下纲、系布的绳，地上的两个物（十字）、楅（八支箭插着时的样子）、旌竿（世界坐标，一块） */
export function rangeGeo(rackFull: boolean): Geo {
  const C = targetCenter(), parts: Geo[] = [];
  const wood: [number, number, number] = [0.75, 0.67, 0.585], hemp: [number, number, number] = [0.88, 0.81, 0.65];
  const top = C.y + HOU.hh + 0.1, X = RANGE.postX;
  for (const s of [-1, 1]) {
    const x = C.x + s * X;
    parts.push(dye(inkGeo(pole(v3(x, gy(x, C.z) - 0.2, C.z), v3(x, top + 0.22, C.z), 0.04, 0.032, 6)), wood, 1.7));
    // 系布的绳：四角各一道
    for (const sy of [-1, 1]) parts.push(dye(inkGeo(pole(v3(x, C.y + sy * (HOU.hh - 0.04), C.z), v3(C.x + s * (HOU.hw - 0.02), C.y + sy * (HOU.hh - 0.04), C.z), 0.006, 0.006, 4)), hemp, 1.5));
  }
  // 上纲、下纲：横着一根细竹
  for (const y of [C.y + HOU.hh + 0.02, C.y - HOU.hh - 0.02]) parts.push(dye(inkGeo(pole(v3(C.x - X, y, C.z + 0.01), v3(C.x + X, y, C.z + 0.01), 0.011, 0.011, 5)), [0.85, 0.81, 0.6], 1.5));
  // 物：射位地上画的十字（两道墨，平贴地面）
  RANGE.marks.forEach((m, i) => {
    const y = markY(i) + 0.012;
    for (const a of [0, Math.PI / 2]) parts.push(dye(inkGeo(new THREE.BoxGeometry(0.62, 0.004, 0.045).rotateY(a + 0.05 * (i ? 1 : -1)).translate(m.x, y, m.z)), PIG.mo, 2.1));
  });
  // 楅：两条短腿撑着一块横木，木上一排小孔；插着的箭竖在上面
  {
    const R = RANGE.rack, y = gy(R.x, R.z);
    parts.push(dye(inkGeo(new THREE.BoxGeometry(0.62, 0.07, 0.1).translate(R.x, y + 0.34, R.z)), [0.6, 0.52, 0.47], 1.9));
    for (const s of [-1, 1]) parts.push(dye(inkGeo(new THREE.BoxGeometry(0.06, 0.34, 0.16).translate(R.x + s * 0.25, y + 0.17, R.z)), [0.6, 0.52, 0.47], 1.9));
    if (rackFull) for (let i = 0; i < 8; i++) {
      // 镞朝下插在横木的孔里，羽朝上
      const a = arrowGeo().applyMatrix4(M.mul(M.t(R.x - 0.26 + i * 0.074, y + 0.25, R.z + (i % 2 ? 0.012 : -0.012)), M.rz(Math.PI + (i - 3.5) * 0.012)));
      parts.push(a);
    }
  }
  // 旌竿
  { const F = RANGE.flag, y = gy(F.x, F.z); parts.push(dye(inkGeo(pole(v3(F.x, y - 0.2, F.z), v3(F.x, y + 3.1, F.z), 0.024, 0.016, 5)), [0.85, 0.81, 0.6], 1.6)); }
  return merge(parts);
}

/** 旌：竿头一条窄幡（一张分了几节的面，每帧照着风摆） */
export class Flag {
  mesh: THREE.Mesh;
  private pos: THREE.BufferAttribute; private n: number; private t = 0;
  constructor() {
    const seg = 8, g = new THREE.PlaneGeometry(0.62, 0.13, seg, 1).translate(0.31, 0, 0);
    const c = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < c.length; i += 3) { c[i] = 0.62; c[i + 1] = 0.66; c[i + 2] = 0.72; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.pos = g.attributes.position as THREE.BufferAttribute; this.n = seg + 1;
    this.mesh = new THREE.Mesh(g, wash({ pig: [1, 1, 1], dens: 1.3, body: 0.3, shade: 1.2, grain: 1.5, line: 0.5, side: THREE.DoubleSide, snow: 0 }));
    const F = RANGE.flag;
    this.mesh.position.set(F.x, gy(F.x, F.z) + 3.0, F.z);
    this.mesh.name = 'games:flag';
  }
  /** wx, wz 风吹去的方向（单位）、s 风速（米/秒） */
  update(dt: number, wx: number, wz: number, s: number) {
    this.t += dt;
    this.mesh.rotation.y = Math.atan2(-wz, wx);
    const P = this.pos.array as Float32Array, droop = Math.max(0, 1 - s / 4);
    for (let i = 0; i < P.length / 3; i++) {
      const j = i % this.n, u = j / (this.n - 1), x0 = u * 0.62;
      const wave = Math.sin(this.t * (4 + s) - u * 7) * 0.05 * u * (0.4 + Math.min(1, s / 3));
      P[i * 3] = x0 * (1 - 0.55 * droop);
      P[i * 3 + 1] = (i < this.n ? 0.065 : -0.065) - x0 * 0.9 * droop;
      P[i * 3 + 2] = wave;
    }
    this.pos.needsUpdate = true;
  }
}

/**
 * 远处也看得见的箭：每支箭画成两条朝着镜头的细带（笴一条、羽一条，一张网一次绘制）。
 * 箭本来只有八毫米粗，二十步外不到一个像素——钉在侯上就看不见了；这里按离镜头多远把带子加宽，至少一个半像素，近处还是真的粗细。
 */
export class ArrowStrips {
  mesh: THREE.Mesh;
  private pos: Float32Array; private col: Float32Array;
  private a = new THREE.Vector3(); private b = new THREE.Vector3(); private s = new THREE.Vector3(); private e = new THREE.Vector3(); private m = new THREE.Vector3();
  constructor(n: number) {
    const g = new THREE.BufferGeometry(), v = n * 12;
    this.pos = new Float32Array(v * 3); this.col = new Float32Array(v * 3).fill(1);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const nor = new Float32Array(v * 3); for (let i = 0; i < v; i++) nor[i * 3 + 1] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(v * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx: number[] = [];
    for (let i = 0; i < n * 3; i++) { const o = i * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, wash({ pig: [1, 1, 1], dens: 1, flat: 1, line: 0, snow: 0, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.name = 'games:arrowstrips';
    // 颜色：笴是浅竹色（近处）、羽是墨、镞是铁
    for (let i = 0; i < n; i++) {
      const paint = (q: number, c: [number, number, number]) => { for (let j = 0; j < 4; j++) this.col.set(c, (i * 12 + q * 4 + j) * 3); };
      paint(0, [0.42, 0.4, 0.37]); paint(1, [0.2, 0.2, 0.22]); paint(2, [0.3, 0.3, 0.32]);
    }
  }
  private quad(o: number, a: THREE.Vector3, b: THREE.Vector3, w: number, cam: THREE.Vector3, px: number) {
    this.m.addVectors(a, b).multiplyScalar(0.5);
    const d = this.m.distanceTo(cam), hw = Math.max(w, d * px * 0.75);
    this.e.subVectors(b, a); this.s.subVectors(cam, this.m).cross(this.e).normalize().multiplyScalar(hw);
    const P = this.pos;
    P[o] = a.x - this.s.x; P[o + 1] = a.y - this.s.y; P[o + 2] = a.z - this.s.z;
    P[o + 3] = a.x + this.s.x; P[o + 4] = a.y + this.s.y; P[o + 5] = a.z + this.s.z;
    P[o + 6] = b.x - this.s.x; P[o + 7] = b.y - this.s.y; P[o + 8] = b.z - this.s.z;
    P[o + 9] = b.x + this.s.x; P[o + 10] = b.y + this.s.y; P[o + 11] = b.z + this.s.z;
  }
  /** 第 i 支：镞尖在 tip、朝 dir 飞（单位向量）；hidden 收起。px 是一个像素在一米远处有多宽（米） */
  set(i: number, tip: THREE.Vector3 | null, dir: THREE.Vector3, cam: THREE.Vector3, px: number) {
    const o = i * 36;
    if (!tip) { this.pos.fill(0, o, o + 36); for (let j = 1; j < 36; j += 3) this.pos[o + j] = -500; return; }
    const tail = this.b.copy(tip).addScaledVector(dir, -ARROW_LEN), head = this.a.copy(tip).addScaledVector(dir, -0.055);
    this.quad(o, tail, head, 0.0042, cam, px);
    const f0 = this.a.copy(tip).addScaledVector(dir, -ARROW_LEN + 0.02), f1 = this.b.copy(tip).addScaledVector(dir, -ARROW_LEN + 0.15);
    this.quad(o + 12, f0, f1, 0.012, cam, px * 2.2);
    const h0 = this.a.copy(tip).addScaledVector(dir, -0.06), h1 = this.b.copy(tip);
    this.quad(o + 24, h0, h1, 0.007, cam, px * 1.3);
  }
  commit() { (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; }
}
