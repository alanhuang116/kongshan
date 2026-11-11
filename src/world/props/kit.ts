/**
 * 器物的工具与材质（法器、供具、陈设共用）。
 *   几何：顺滑的车削轮廓（spl）、按弧长铺 uv 的车削（turn）、圆管（tube）、软垫（pillow）、环（ring）、随风的权重（withSway）；
 *   材质：core/mats 里没有的质感——瓷、竹、铁、草编、牛皮、红泥、麻绳、蜡、墨、水、果、花叶——各建一次、全寺共用。
 * 约定同 core/geo：不带索引、position / normal / uv / color 四个属性，uv 以米为单位。
 */
import * as THREE from 'three';
import { Builder, type Geo, merge as mergeGeos, norm, uvBox } from '../core/geo';
import { bake, canvas, canvasTex, type TexSet } from '../core/tex';
import { enhance, variant, type Enhance, type Mats } from '../core/mats';
import { clamp, fbm, mulberry32, smooth } from '../core/rng';
import type { Quality } from '../core/World';

export type P2 = [number, number];
export const isLow = (q: Quality) => q.tier === 'low';
/** 一圈的段数：低档减半 */
export const sg = (q: Quality, n: number) => (q.tier === 'low' ? Math.max(8, Math.round(n / 2)) : n);
const jit = mulberry32(9051);

/** 把几个控制点连成一条顺滑的轮廓（等弧长取 n+1 个点） */
export function spl(pts: P2[], n = 16): P2[] {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
  return c.getSpacedPoints(n).map((p) => [p.x, p.y] as P2);
}
/** 把几段轮廓首尾接起来。相邻两段的端点重合时保留两个点 —— 车削时那里就是一道硬棱 */
export const prof = (...parts: P2[][]): P2[] => parts.flat();
/** 轮廓上的一道凸棱（弦纹）：在 [r, y] 处、沿轮廓方向鼓出 h、宽 w（r 增大的方向为外） */
export const rib = (r: number, y: number, w: number, h: number): P2[] => [[r, y - w / 2], [r + h * 0.7, y - w * 0.28], [r + h, y], [r + h * 0.7, y + w * 0.28], [r, y + w / 2]];

/**
 * 车削：轮廓 [半径, 高] 绕 y 轴转一圈。与 core 的 lathe 不同处：uv 的 v 按真实弧长铺（纹理不拉伸）。
 * 轮廓自下而上时面朝外；自上而下时面朝里（器物的内壁就这样做）。
 */
export function turn(profile: P2[], seg = 32, o: { phi0?: number; arc?: number; tile?: number; vs?: number[] } = {}): Geo {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-5), y));
  const arc = o.arc ?? Math.PI * 2;
  // 默认从背后（−z）起转：贴图的接缝留在背面
  const g = new THREE.LatheGeometry(pts, seg, o.phi0 ?? Math.PI, arc);
  const n = pts.length, L = [0];
  let rmax = 0;
  for (let i = 1; i < n; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  for (const p of pts) rmax = Math.max(rmax, p.x);
  // tile：这种材质一张贴图铺多少米。给了就把一圈凑成整数张，接缝处花纹接得上
  let circ = arc * rmax;
  if (o.tile && arc > 6.28) circ = Math.max(1, Math.round(circ / o.tile)) * o.tile;
  const uv = g.attributes.uv as THREE.BufferAttribute, ou = o.tile ? 0 : jit() * 3.1, ov = o.vs ? 0 : jit() * 2.3;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ + ou, (o.vs ? o.vs[i % n] : L[i % n]) + ov);
  const out = norm(g);
  if (seg <= 8) { out.deleteAttribute('normal'); out.computeVertexNormals(); }
  return out;
}

/** 朝上的圆面（香灰、水面、案上的毡）：半径 r，中心比边缘高 dome；uv 平铺（米） */
export function disc(r: number, y: number, seg = 24, dome = 0, rings = 3): Geo {
  const p: P2[] = [];
  for (let i = 0; i <= rings; i++) { const t = i / rings; p.push([r * (1 - t) || 1e-5, y + dome * (1 - (1 - t) * (1 - t))]); }
  const g = turn(p, seg);
  const ps = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getX(i), ps.getZ(i));
  return g;
}

/** 圆环（垫圈、提环、箍）。R 环半径，r 管半径；平放（轴为 y） */
export function ring(R: number, r: number, seg = 32, tubeSeg = 10, arc = Math.PI * 2): Geo {
  const g = new THREE.TorusGeometry(R, r, tubeSeg, seg, arc);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * arc * R, uv.getY(i) * 2 * Math.PI * r);
  return norm(g).rotateX(Math.PI / 2);
}

/**
 * 圆管：沿一条折线走，截面是圆（茎、绳、提梁、细枝）。radius 可以随 t（0…1）变；到 0 就收成尖。
 * 法线是圆滑的；uv：u 绕一圈（米）、v 沿长度（米）。
 */
export function tube(path: THREE.Vector3[], radius: number | ((t: number) => number), sides = 6, caps = false): Geo {
  const n = path.length, rf = typeof radius === 'number' ? () => radius : radius;
  const T: THREE.Vector3[] = [], L = [0];
  for (let i = 0; i < n; i++) {
    T.push(new THREE.Vector3().subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize());
    if (i > 0) L.push(L[i - 1] + path[i].distanceTo(path[i - 1]));
  }
  const tot = L[n - 1] || 1;
  let N = new THREE.Vector3(0, 1, 0);
  if (Math.abs(T[0].dot(N)) > 0.9) N = new THREE.Vector3(1, 0, 0);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const B = new THREE.Vector3(), d = new THREE.Vector3();
  let rav = 0;
  for (let i = 0; i < n; i++) rav += rf(L[i] / tot) / n;
  for (let i = 0; i < n; i++) {
    N.addScaledVector(T[i], -N.dot(T[i])).normalize();
    B.crossVectors(T[i], N);
    const r = rf(L[i] / tot);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      d.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
      pos.push(path[i].x + d.x * r, path[i].y + d.y * r, path[i].z + d.z * r);
      nor.push(d.x, d.y, d.z);
      uv.push((k / sides) * 2 * Math.PI * rav, L[i]);
    }
  }
  const w = sides + 1;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * w + k, b = (i + 1) * w + k, c = (i + 1) * w + k + 1, e = i * w + k + 1;
    idx.push(a, c, b, a, e, c);
  }
  if (caps) {
    for (const end of [0, n - 1]) {
      const base = pos.length / 3, nn = end === 0 ? T[0].clone().negate() : T[n - 1];
      pos.push(path[end].x, path[end].y, path[end].z); nor.push(nn.x, nn.y, nn.z); uv.push(0, L[end]);
      for (let k = 0; k <= sides; k++) {
        const s = (end * w + k) * 3;
        pos.push(pos[s], pos[s + 1], pos[s + 2]); nor.push(nn.x, nn.y, nn.z); uv.push(0.01, L[end]);
      }
      for (let k = 0; k < sides; k++) { if (end === 0) idx.push(base, base + 1 + k, base + 2 + k); else idx.push(base, base + 2 + k, base + 1 + k); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return norm(g);
}
/** 一条顺滑的空间曲线上取 n+1 个点（给 tube 用） */
export function curve3(pts: Array<[number, number, number]>, n = 12): THREE.Vector3[] {
  return new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal').getSpacedPoints(n);
}

/**
 * 软垫：超椭球（方里带圆、圆里带方）。w × h × d 是外包尺寸，中心在原点。
 * e1 管俯视的方圆（1 圆 … 0.2 很方），e2 管侧面的鼓（1 圆 … 0.3 扁平带圆边）；dip 是顶面中间陷下去多少。
 */
export function pillow(w: number, h: number, d: number, e1 = 0.4, e2 = 0.55, dip = 0, ws = 28, hs = 14): Geo {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const sp = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const a = w / 2, b = d / 2, c = h / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const lat = Math.asin(clamp(y, -1, 1)), lon = Math.atan2(z, x);
    const cl = sp(Math.cos(lat), e2);
    let px = a * cl * sp(Math.cos(lon), e1), pz = b * cl * sp(Math.sin(lon), e1), py = c * sp(Math.sin(lat), e2);
    if (Math.abs(y) > 0.9999) { px = 0; pz = 0; }
    if (dip && py > 0) py -= dip * Math.exp(-((px * px) / (a * a) + (pz * pz) / (b * b)) * 3.2) * (py / c);
    p.setXYZ(i, px, py, pz);
    uv.setXY(i, uv.getX(i) * (w + d) * 2, uv.getY(i) * (h + Math.min(w, d)));
  }
  g.computeVertexNormals();
  // 经线接缝两侧的法线对齐
  const nr = g.attributes.normal as THREE.BufferAttribute, row = ws + 1;
  for (let r = 0; r <= hs; r++) {
    const i0 = r * row, i1 = r * row + ws;
    const x = nr.getX(i0) + nr.getX(i1), y = nr.getY(i0) + nr.getY(i1), z = nr.getZ(i0) + nr.getZ(i1), l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(i0, x / l, y / l, z / l); nr.setXYZ(i1, x / l, y / l, z / l);
  }
  return uvBox(norm(g), 'x');
}

/** 一团：球经 fn 捏一捏（果子、花苞、兽面的鼓包）。fn 拿到单位球上的点，写回变形后的位置；法线是圆滑的 */
export function blob(ws: number, hs: number, fn: (p: THREE.Vector3) => void, uvScale = 0.1): Geo {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); uv.setXY(i, uv.getX(i) * uvScale * 6, uv.getY(i) * uvScale * 3); }
  g.computeVertexNormals();
  const nr = g.attributes.normal as THREE.BufferAttribute, row = ws + 1;
  for (let r = 0; r <= hs; r++) {
    const i0 = r * row, i1 = r * row + ws;
    const x = nr.getX(i0) + nr.getX(i1), y = nr.getY(i0) + nr.getY(i1), z = nr.getZ(i0) + nr.getZ(i1), l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(i0, x / l, y / l, z / l); nr.setXYZ(i1, x / l, y / l, z / l);
  }
  return norm(g);
}

/** 给几何加上随风摆的权重（core/mats 的风要它）。fn 返回 0…1 */
export function withSway(g: Geo, fn: (x: number, y: number, z: number) => number): Geo {
  const p = g.attributes.position as THREE.BufferAttribute, s = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) s[i] = fn(p.getX(i), p.getY(i), p.getZ(i));
  g.setAttribute('sway', new THREE.BufferAttribute(s, 1));
  return g;
}

/** 把 uv 设成 0…1 的平面投影（要整张贴图铺满一块面时用）：ax、ay 是取哪两个轴，范围取包围盒 */
export function uvFit(g: Geo, ax: 'x' | 'y' | 'z', ay: 'x' | 'y' | 'z', flipU = false, flipV = false): Geo {
  g.computeBoundingBox();
  const bb = g.boundingBox!, p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const get = (i: number, a: 'x' | 'y' | 'z') => (a === 'x' ? p.getX(i) : a === 'y' ? p.getY(i) : p.getZ(i));
  for (let i = 0; i < p.count; i++) {
    let u = (get(i, ax) - bb.min[ax]) / (bb.max[ax] - bb.min[ax] || 1), v = (get(i, ay) - bb.min[ay]) / (bb.max[ay] - bb.min[ay] || 1);
    if (flipU) u = 1 - u;
    if (flipV) v = 1 - v;
    uv.setXY(i, u, v);
  }
  return g;
}

// —— 材质 ——
const P = (u: number, v: number, fu: number, fv: number, oct: number, seed: number) => fbm(u * fu, v * fv, oct, seed, fu, fv);
function texMat(set: TexSet, meters: number, p: THREE.MeshStandardMaterialParameters, orm = false, nScale = 1, e: Enhance = {}): THREE.MeshStandardMaterial {
  const f = (t: THREE.Texture) => { const c = t.clone(); c.repeat.set(1 / meters, 1 / meters); c.needsUpdate = true; return c; };
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.8, metalness: 0, map: f(set.map), normalMap: f(set.normalMap), normalScale: new THREE.Vector2(nScale, nScale),
    ...(orm ? { roughnessMap: f(set.orm), metalnessMap: f(set.orm), roughness: 1, metalness: 1 } : {}), ...p,
  });
  return enhance(m, e);
}

/** 竹：旧了的黄竹，细纤维顺着 v。一张铺 0.25 米 */
const bambooTex = () => bake(128, (u, v, o) => {
  const f1 = P(u, v, 70, 3, 2, 201), f2 = P(u, v, 24, 2, 3, 202), m = P(u, v, 4, 4, 3, 203), sp = smooth(0.74, 0.9, P(u, v, 22, 14, 2, 204));
  const t = 0.9 + 0.08 * (f1 - 0.5) * 2 + 0.07 * (f2 - 0.5) * 2 + 0.07 * (m - 0.5) * 2;
  o[0] = 0.73 * t; o[1] = 0.61 * t; o[2] = 0.36 * t;
  o[0] -= 0.22 * sp; o[1] -= 0.22 * sp; o[2] -= 0.14 * sp;
  o[3] = 0.5 + 0.16 * (f1 - 0.5) + 0.1 * (f2 - 0.5);
  o[4] = 0.4 + 0.18 * m + 0.1 * sp;
}, 0.9);
/** 生铁（壶）：黑里透褐，有砂眼与一点锈 */
const ironTex = () => bake(128, (u, v, o) => {
  const m = P(u, v, 5, 5, 4, 211), pit = P(u, v, 60, 60, 2, 212), rust = smooth(0.6, 0.82, P(u, v, 7, 7, 4, 213));
  const t = 0.115 + 0.03 * (m - 0.5) * 2 + 0.03 * (pit - 0.5);
  o[0] = t * 1.02; o[1] = t; o[2] = t * 1.02;
  o[0] += 0.13 * rust; o[1] += 0.05 * rust; o[2] += 0.01 * rust;
  o[3] = 0.5 + 0.35 * (pit - 0.5) + 0.1 * (m - 0.5);
  o[4] = 0.56 + 0.2 * pit + 0.16 * rust;
  o[5] = 0.8 - 0.55 * rust;
}, 2.2);
/** 草编（蒲团）：一圈圈的草辫，每圈两股斜纹相对。v 一张两圈，u 一张八股 */
const strawTex = () => bake(256, (u, v, o) => {
  const cv = v * 2, row = Math.floor(cv), fv = cv - row;
  const half = fv < 0.5 ? fv : 1 - fv;
  const st = 0.5 + 0.5 * Math.sin((u * 8 + half * 1.7 * (row % 2 ? 1 : 1) + row * 0.37) * Math.PI * 2);
  const round = Math.sin(fv * Math.PI), n = P(u, v, 40, 40, 2, 221), m = P(u, v, 5, 5, 3, 222);
  const k = (0.7 + 0.3 * st) * (0.72 + 0.28 * round) * (0.88 + 0.24 * (n - 0.5)) * (0.92 + 0.16 * (m - 0.5) * 2);
  o[0] = 0.78 * k; o[1] = 0.66 * k; o[2] = 0.41 * k;
  o[3] = 0.15 + 0.5 * round + 0.3 * st * round + 0.05 * n;
  o[4] = 0.86;
}, 2.4);
/** 牛皮（鼓面）：米黄，有深浅与毛孔 */
const hideTex = () => bake(128, (u, v, o) => {
  const m = P(u, v, 3, 3, 4, 231), b = P(u, v, 9, 9, 3, 232), sp = P(u, v, 90, 90, 2, 233);
  const t = 0.93 + 0.1 * (m - 0.5) * 2 + 0.05 * (b - 0.5) * 2 - 0.03 * sp;
  o[0] = 0.83 * t; o[1] = 0.75 * t; o[2] = 0.6 * t;
  o[3] = 0.5 + 0.2 * (sp - 0.5) + 0.1 * (b - 0.5);
  o[4] = 0.62 + 0.14 * b;
}, 0.8);
/** 红泥（风炉）：赤陶，粗 */
const clayTex = () => bake(64, (u, v, o) => {
  const m = P(u, v, 4, 4, 4, 241), sp = P(u, v, 50, 50, 2, 242), ring = P(u, v, 2, 40, 2, 243);
  const t = 0.9 + 0.12 * (m - 0.5) * 2 + 0.1 * (sp - 0.5) + 0.05 * (ring - 0.5);
  o[0] = 0.62 * t; o[1] = 0.30 * t; o[2] = 0.2 * t;
  o[3] = 0.5 + 0.3 * (sp - 0.5) + 0.15 * (ring - 0.5);
  o[4] = 0.92;
}, 1.6);
/** 麻绳：斜着拧的几股 */
const ropeTex = () => bake(64, (u, v, o) => {
  const s = 0.5 + 0.5 * Math.sin((u * 3 + v * 6) * Math.PI * 2), f = P(u, v, 60, 60, 2, 251);
  const k = (0.62 + 0.38 * s) * (0.86 + 0.28 * (f - 0.5));
  o[0] = 0.66 * k; o[1] = 0.56 * k; o[2] = 0.39 * k;
  o[3] = 0.2 + 0.7 * s + 0.1 * f;
  o[4] = 0.95;
}, 3);

/** 暗金的铜（殿里擦亮的磬、烛台）：有捶打的小坑，边角发乌，不生绿锈 */
const brassTex = () => bake(128, (u, v, o) => {
  const m = P(u, v, 4, 4, 4, 261), d = P(u, v, 30, 30, 2, 262), tar = smooth(0.52, 0.82, P(u, v, 7, 7, 3, 263));
  const t = (0.92 + 0.16 * (m - 0.5) * 2) * (1 - 0.3 * tar);
  o[0] = 0.66 * t; o[1] = 0.47 * t; o[2] = 0.21 * t;
  o[3] = 0.5 + 0.3 * (d - 0.5);
  o[4] = 0.3 + 0.22 * tar + 0.06 * d;
  o[5] = 1;
}, 1.1);
/** 织金：金地上一格格的菱纹 */
function brocadeMat(): THREE.MeshStandardMaterial {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#8f6f2e'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#d8b965'; g.lineWidth = 2.2;
  for (const [x0, y0, x1, y1] of [[0, 32, 32, 0], [32, 0, 64, 32], [64, 32, 32, 64], [32, 64, 0, 32]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  g.fillStyle = '#ead18a';
  for (const [x, y] of [[32, 32], [0, 0], [64, 0], [0, 64], [64, 64]]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#b89448'; g.lineWidth = 1.2; g.strokeRect(22, 22, 20, 20);
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 0.045, 1 / 0.045);
  return enhance(new THREE.MeshStandardMaterial({ map: t, vertexColors: true, metalness: 0.55, roughness: 0.48 }));
}

export interface PMats {
  /** 白瓷、青瓷、黑釉（带一层釉光） */
  porcelain: THREE.MeshStandardMaterial; celadon: THREE.MeshStandardMaterial; blackGlaze: THREE.MeshStandardMaterial;
  bamboo: THREE.MeshStandardMaterial; iron: THREE.MeshStandardMaterial; straw: THREE.MeshStandardMaterial; hide: THREE.MeshStandardMaterial;
  clay: THREE.MeshStandardMaterial; rope: THREE.MeshStandardMaterial;
  /** 白烛、红烛、烛芯 */
  wax: THREE.MeshStandardMaterial; waxRed: THREE.MeshStandardMaterial; wick: THREE.MeshStandardMaterial;
  /** 墨（砚池里的、墨锭）、盏里的水 */
  ink: THREE.MeshStandardMaterial; water: THREE.MeshStandardMaterial;
  /** 果子、花叶：颜色全靠顶点色 */
  fruit: THREE.MeshStandardMaterial; plant: THREE.MeshStandardMaterial;
  /** 毛毡、旧木（撞木、鼓架）、深色素木（经案） */
  felt: THREE.MeshStandardMaterial; oldWood: THREE.MeshStandardMaterial; walnut: THREE.MeshStandardMaterial;
  /** 残香的杆、香头的灰 */
  joss: THREE.MeshStandardMaterial;
  /** 织金的边 */
  brocade: THREE.MeshStandardMaterial;
  /** 铁件（吊环、箍） */
  ironPlain: THREE.MeshStandardMaterial;
  /** 暗金的铜（殿里的磬、烛台、小炉：擦得亮，不生绿锈） */
  brass: THREE.MeshStandardMaterial;
  /** 素的、颜色全靠顶点色：槌、笔这类小件用它，一件只一块网格 */
  tool: THREE.MeshStandardMaterial;
}
const cache = new WeakMap<Mats, PMats>();
/** 器物用的额外材质：用到哪种才建哪种（各自的小贴图也是那时才烘），同一套 mats 只建一次 */
export function pmats(mats: Mats, q?: Quality): PMats {
  const hit = cache.get(mats);
  if (hit) return hit;
  const low = q?.tier === 'low';
  const glaze = (color: number, rough = 0.2) => {
    const m = low
      ? new THREE.MeshStandardMaterial({ color, roughness: rough, vertexColors: true })
      : new THREE.MeshPhysicalMaterial({ color, roughness: rough + 0.12, clearcoat: 1, clearcoatRoughness: 0.07, vertexColors: true });
    return enhance(m) as THREE.MeshStandardMaterial;
  };
  const plain = (p: THREE.MeshStandardMaterialParameters) => enhance(new THREE.MeshStandardMaterial({ vertexColors: true, ...p }));
  const make: { [K in keyof PMats]: () => PMats[K] } = {
    porcelain: () => glaze(0xd6d4cc), celadon: () => glaze(0x9db8a8, 0.24), blackGlaze: () => glaze(0x17120f, 0.16),
    bamboo: () => texMat(bambooTex(), 0.25, { color: 0xffffff }, true, 0.8),
    iron: () => texMat(ironTex(), 0.3, { color: 0xffffff }, true, 1),
    straw: () => texMat(strawTex(), 0.05, { color: 0xffffff }, false, 1.4),
    hide: () => texMat(hideTex(), 0.9, { color: 0xffffff }, true, 0.6),
    clay: () => texMat(clayTex(), 0.2, { color: 0xffffff }, false, 1),
    rope: () => texMat(ropeTex(), 0.07, { color: 0xffffff }, false, 1.2),
    wax: () => plain({ color: 0xd3ccb8, roughness: 0.42 }),
    waxRed: () => plain({ color: 0x8e1d16, roughness: 0.4 }),
    wick: () => plain({ color: 0x15110e, roughness: 1 }),
    ink: () => plain({ color: 0x08080a, roughness: 0.08 }),
    water: () => plain({ color: 0xaebdbd, roughness: 0.03, transparent: true, opacity: 0.32, depthWrite: false }),
    fruit: () => plain({ color: 0xffffff, roughness: 0.52 }),
    plant: () => plain({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }),
    felt: () => variant(mats.clothGrey, { color: 0x2c333d }),
    oldWood: () => variant(mats.woodPale, { color: 0x6d5540, roughness: 0.82 }),
    walnut: () => variant(mats.woodPale, { color: 0x4b3424, roughness: 0.55 }),
    joss: () => plain({ color: 0xffffff, roughness: 0.95 }),
    brocade: brocadeMat,
    ironPlain: () => plain({ color: 0x24252a, roughness: 0.6, metalness: 0.85 }),
    brass: () => texMat(brassTex(), 0.5, { color: 0xffffff, envMapIntensity: 1.1 }, true, 0.7),
    tool: () => plain({ color: 0xffffff, roughness: 0.62 }),
  };
  const made: Partial<PMats> = {};
  const pm = new Proxy(made as PMats, {
    get(t, k: string) {
      if (!(k in make)) return undefined;
      const key = k as keyof PMats;
      return (t[key] ??= make[key]() as never);
    },
    has: (_t, k) => (k as string) in make,
  });
  cache.set(mats, pm);
  return pm;
}

/** Builder 要的「名字 → 材质」表：core 的 + 器物的 */
export function table(mats: Mats, q?: Quality): Record<string, THREE.Material> {
  const pm = pmats(mats, q) as unknown as Record<string, THREE.Material>, base = mats as unknown as Record<string, THREE.Material>;
  return new Proxy(base, { get: (t, k: string) => t[k] ?? pm[k] });
}
/** 一件器物的收尾：并网格、起名字 */
export function finish(b: Builder, mats: Mats, q: Quality, name: string, noCast: string[] = []): THREE.Group {
  return b.build(table(mats, q), { name, noCast: ['water', ...noCast] });
}
/** 把几块几何各染一个颜色（sRGB 十六进制）并成一块 —— 给 tool 材质用 */
export function dyed(parts: Array<[Geo, number]>): Geo {
  const c = new THREE.Color();
  return mergeGeos(parts.map(([g, hex]) => {
    c.setHex(hex);
    const col = g.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
    return g;
  }));
}
/** 单独成一件的零件（要动的） */
export function part(g: Geo, m: THREE.Material, name: string, cast = true): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.name = name; mesh.castShadow = cast; mesh.receiveShadow = true;
  return mesh;
}
export { Builder };
