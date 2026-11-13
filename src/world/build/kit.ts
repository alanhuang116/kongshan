/**
 * 屋舍与器物的家什：
 *   画法 —— 土、茅、木、竹、石、纸几种材质各建一次，全村共用（mats）；小物件用一种「颜料全写在顶点色里」的材质（obj），
 *           带字、带图的面用同一张图集（label）；
 *   几何 —— 从 a 到 b 的一根料（pole / beam）、沿折线的圆管（tube）、手做的不齐（wobble + renormal）、削平了顶的石头（flatRock）；
 *   攒料 —— Ctx：几处各一个 Builder（同材质并块），外加挂点、可拿的东西、挡路的脚印。
 * 约定同 core/geo：几何不带索引、position / normal / uv / color 四个属性，uv 以米计。
 */
import * as THREE from 'three';
import { Builder, cyl, norm, rockGeo, uvBox, type Axis, type Geo } from '../core/geo';
import { mulberry32 } from '../core/rng';
import type { Quality } from '../core/World';
import { PIG, wash, type RGB } from '../ink/ink';

export type V3 = THREE.Vector3;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);

// —— 随机 ——
export interface Rand { (): number; r(a: number, b: number): number; pm(a: number): number; i(n: number): number; pick<T>(xs: readonly T[]): T }
export function rnd(seed: number): Rand {
  const base = mulberry32(seed);
  const f = (() => base()) as Rand;
  f.r = (a, b) => a + (b - a) * base();
  f.pm = (a) => (base() * 2 - 1) * a;
  f.i = (n) => Math.min(n - 1, Math.floor(base() * n));
  f.pick = (xs) => xs[Math.min(xs.length - 1, Math.floor(base() * xs.length))];
  return f;
}
/** 三维的值噪声 0…1（给「手做的不齐」用） */
export function n3(x: number, y: number, z: number, seed = 0): number {
  const h = (a: number, b: number, c: number) => { const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + seed * 4.1) * 43758.5453; return v - Math.floor(v); };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v), L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
}

// —— 画法 ——
export interface Mats {
  /** 版筑的土墙（不粉） */ earth: THREE.ShaderMaterial;
  /** 草堂屋里的墙面、地面：略深；夜里点了灯会泛一层暖色 */ inner: THREE.ShaderMaterial;
  /** 茅草（屋顶、草垛、草帘） */ thatch: THREE.ShaderMaterial;
  /** 不上漆的木 */ wood: THREE.ShaderMaterial;
  /** 竹 */ bamboo: THREE.ShaderMaterial;
  /** 石（带皴） */ stone: THREE.ShaderMaterial;
  /** 窗纸：夜里透出暖光 */ paper: THREE.ShaderMaterial;
  /** 屋里的黑（不进去的屋，门缝里、窗洞里） */ dark: THREE.ShaderMaterial;
  /** 小物件：颜料全在顶点色里（陶、布、绳、书、草编……） */ obj: THREE.ShaderMaterial;
  /** 带字带图的面：同 obj，另乘一张图集 */ label: THREE.ShaderMaterial;
}
/** 夜里窗纸、屋里各亮成什么颜色（灯全亮时） */
export const GLOW_PAPER: RGB = [0.6, 0.4, 0.15], GLOW_ROOM: RGB = [0.3, 0.2, 0.085];

export function makeMats(atlasMap: THREE.Texture): Mats {
  return {
    earth: wash({ pig: [0.89, 0.845, 0.765], dens: 1.05, shade: 1.42, grain: 0.7, strata: [2.6, 0.85] }),
    inner: wash({ pig: [0.885, 0.845, 0.775], dens: 1.22, shade: 1.2, grain: 0.6, strata: [2.6, 0.4], glow: [0, 0, 0], line: 0.85 }),
    thatch: wash({ pig: [0.88, 0.845, 0.74], dens: 1.0, shade: 1.5, grain: 0.5, streak: [21, 0.95, 0.34], line: 0.9 }),
    wood: wash({ pig: [0.745, 0.685, 0.615], dens: 1.6, shade: 1.5, grain: 1.6, streak: [24, 1.3, 0.34] }),
    // （细竹竿两边的线会并在一起：线放轻些，篱才不至于成了一排黑杠）
    bamboo: wash({ pig: [0.86, 0.83, 0.64], dens: 1.15, shade: 1.42, grain: 2, line: 0.62 }),
    stone: wash({ pig: PIG.mo, dens: 0.6, shade: 1.9, cun: 0.8, grain: 1.2 }),
    // 窗纸只带三分「粉」：白天是一张淡淡的纸，夜里不点灯就暗着，点了灯才透出暖色（全粉的话夜里会白得发青）
    paper: wash({ pig: [0.965, 0.945, 0.885], dens: 1, body: 0.3, shade: 1.12, grain: 1.2, line: 0.35, glow: [0, 0, 0], snow: 0 }),
    dark: wash({ pig: PIG.jiao, dens: 2.7, flat: 1, grain: 0.6, line: 0.6, snow: 0 }),
    obj: wash({ pig: [1, 1, 1], dens: 1, shade: 1.5, grain: 2.2, side: THREE.DoubleSide }),
    label: wash({ pig: [1, 1, 1], dens: 1, shade: 1.3, grain: 2.2, map: atlasMap, side: THREE.DoubleSide }),
  };
}

// —— 顶点色 ——
/** 给一块几何染上颜料（浓度 dens）：obj / label 材质的东西靠它定色 */
export function dye(g: Geo, pig: RGB, dens = 1): Geo {
  const c = g.attributes.color as THREE.BufferAttribute, r = Math.pow(pig[0], dens), gg = Math.pow(pig[1], dens), b = Math.pow(pig[2], dens);
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * r, c.getY(i) * gg, c.getZ(i) * b);
  return g;
}
/** 常用的几种颜料（给 dye 用） */
export const INK = {
  /** 旧木（板、几案）*/ wood: [0.75, 0.67, 0.585] as RGB,
  /** 深色的木（琴、砚匣）*/ darkwood: [0.6, 0.52, 0.47] as RGB,
  /** 素陶 */ clay: [0.86, 0.7, 0.58] as RGB,
  /** 釉陶（酒瓮、水缸）：深褐 */ glaze: [0.62, 0.52, 0.46] as RGB,
  /** 白瓷、白纸 */ white: [0.97, 0.96, 0.93] as RGB,
  /** 旧纸、书页 */ page: [0.95, 0.92, 0.84] as RGB,
  /** 蓝布（书衣） */ indigo: [0.6, 0.68, 0.78] as RGB,
  /** 麻、绳、草编 */ hemp: [0.88, 0.81, 0.65] as RGB,
  /** 铁 */ iron: [0.52, 0.52, 0.55] as RGB,
  /** 墨 */ ink: [0.42, 0.42, 0.44] as RGB,
  /** 青石 */ slate: [0.66, 0.67, 0.69] as RGB,
  /** 竹 */ bamboo: [0.85, 0.81, 0.6] as RGB,
  /** 葫芦 */ gourd: [0.9, 0.8, 0.58] as RGB,
};
/** 把 uv 全钉在图集的留白处（label 材质上不带字的面） */
export function blankUV(g: Geo, at: [number, number]): Geo {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, at[0], at[1]);
  return g;
}

// —— 几何 ——
/** 一根圆料，从 a 到 b（a 端半径 r0，b 端 r1） */
export function pole(a: V3, b: V3, r0: number, r1 = r0, sides = 6, hseg = 1): Geo {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length() || 1e-4;
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.multiplyScalar(1 / len));
  return cyl(r1, r0, len, sides, false, hseg).applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, ONE));
}
/** 一根方料，从 a 到 b：wide 是横里的宽，tall 是竖里的高（料横着时）；木纹顺着长向 */
export function beam(a: V3, b: V3, wide: number, tall: number): Geo {
  const Y = new THREE.Vector3().subVectors(b, a), len = Y.length() || 1e-4;
  Y.multiplyScalar(1 / len);
  const X = new THREE.Vector3().crossVectors(Y, UP);
  if (X.lengthSq() < 1e-6) X.set(1, 0, 0);
  X.normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(a.clone().add(b).multiplyScalar(0.5));
  return uvBox(norm(new THREE.BoxGeometry(wide, len, tall)), 'y').applyMatrix4(m);
}
/** 分了格的方料（好做不齐、好压暗角）。seg 是每格大约多大 */
export function sbox(w: number, h: number, d: number, seg = 0.5, grain?: Axis): Geo {
  const n = (x: number) => Math.max(1, Math.round(x / seg));
  return uvBox(norm(new THREE.BoxGeometry(w, h, d, n(w), n(h), n(d))), grain ?? (w >= h && w >= d ? 'x' : h >= d ? 'y' : 'z'));
}
export const sboxUp = (w: number, h: number, d: number, seg = 0.5, grain?: Axis) => sbox(w, h, d, seg, grain).translate(0, h / 2, 0);

/**
 * 圆管：沿一条折线走（绳、提梁、弯的枝、屋脊的草把）。radius 可以随 t（0…1）变。
 * 法线是圆滑的；uv：u 绕一圈（米）、v 沿长度（米）。swap 为真时 u、v 对调（茅草的丝要绕着管走时用）。
 */
export function tube(path: V3[], radius: number | ((t: number) => number), sides = 6, caps = false, swap = false): Geo {
  const n = path.length, rf = typeof radius === 'number' ? () => radius : radius;
  const T: V3[] = [], L = [0];
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
      const uu = (k / sides) * 2 * Math.PI * rav, vv = L[i];
      if (swap) uv.push(vv, uu); else uv.push(uu, vv);
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
/** 过几个点的顺滑曲线上取 n+1 个点 */
export function curve(pts: V3[], n = 10): V3[] {
  if (pts.length < 3) { const o: V3[] = []; for (let i = 0; i <= n; i++) o.push(pts[0].clone().lerp(pts[pts.length - 1], i / n)); return o; }
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal').getSpacedPoints(n);
}

/**
 * 重算法线：同一处的几个面，朝向差得不多的抹圆，差得多的留硬棱（crease 度以上算硬棱）。
 * 手做的东西（歪一点的方料、削过的石头）变形之后都过一遍，勾线才落在该落的棱上。
 */
export function renormal(g: Geo, crease = 38): Geo {
  const p = g.attributes.position as THREE.BufferAttribute, nr = g.attributes.normal as THREE.BufferAttribute, nf = p.count / 3;
  const fn = new Float32Array(nf * 3), cosC = Math.cos((crease * Math.PI) / 180);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < nf; f++) {
    a.fromBufferAttribute(p, f * 3); b.fromBufferAttribute(p, f * 3 + 1); c.fromBufferAttribute(p, f * 3 + 2);
    b.sub(a); c.sub(a); b.cross(c);   // 长度 = 面积的两倍：大面说话算数
    fn[f * 3] = b.x; fn[f * 3 + 1] = b.y; fn[f * 3 + 2] = b.z;
  }
  const at = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 2000)},${Math.round(p.getY(i) * 2000)},${Math.round(p.getZ(i) * 2000)}`;
    let l = at.get(k); if (!l) at.set(k, (l = []));
    l.push(Math.floor(i / 3));
  }
  for (let i = 0; i < p.count; i++) {
    const f = Math.floor(i / 3), fx = fn[f * 3], fy = fn[f * 3 + 1], fz = fn[f * 3 + 2], fl = Math.hypot(fx, fy, fz) || 1;
    const k = `${Math.round(p.getX(i) * 2000)},${Math.round(p.getY(i) * 2000)},${Math.round(p.getZ(i) * 2000)}`;
    let x = 0, y = 0, z = 0;
    for (const o of at.get(k)!) {
      const ox = fn[o * 3], oy = fn[o * 3 + 1], oz = fn[o * 3 + 2], ol = Math.hypot(ox, oy, oz) || 1;
      if ((ox * fx + oy * fy + oz * fz) / (ol * fl) >= cosC) { x += ox; y += oy; z += oz; }
    }
    const l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(i, x / l, y / l, z / l);
  }
  return g;
}
/** 手做的不齐：顶点顺着一片慢慢起伏的噪声挪一挪（amp 米，freq 每米几个起伏）。之后按 crease 重算法线（给 0 就不重算） */
export function wobble(g: Geo, amp: number, freq = 1, seed = 1, crease = 38, ay = 1): Geo {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + (n3(x * freq, y * freq, z * freq, seed) - 0.5) * 2 * amp, y + (n3(x * freq + 31, y * freq, z * freq, seed + 3) - 0.5) * 2 * amp * ay, z + (n3(x * freq, y * freq + 17, z * freq, seed + 7) - 0.5) * 2 * amp);
  }
  return crease > 0 ? renormal(g, crease) : g;
}
/**
 * 一块顶上削平的石头（踏脚石、石凳、柱础）：rx、rz 是最宽处的半径（在 y=0），h 是平顶的高。
 * flat 是平顶占最宽处的几成：0.8 是鼓墩似的直上直下，0.6 是四面往外斜的大卵石。
 */
export function flatRock(seed: number, rx: number, h: number, rz: number, detail = 2, flat = 0.8): Geo {
  const off = Math.sqrt(1 - flat * flat), g = rockGeo(seed, rx, (h * 1.05) / off, rz, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  // 一块大半埋在土里的卵石：最宽处在地面上下，往上到 h 处一刀削平（平顶约有八成宽）
  g.computeBoundingBox();
  const top = g.boundingBox!.max.y, lift = h / off - top;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + lift;
    p.setY(i, y > h ? h + (y - h) * 0.06 : y);
  }
  return renormal(g, 34);
}
/** 把面翻个面（法线取反、三角形换向） */
export function flip(g: Geo): Geo {
  for (const k of ['position', 'normal', 'uv', 'color']) {
    const a = g.attributes[k] as THREE.BufferAttribute, n = a.itemSize, arr = a.array as Float32Array;
    for (let i = 0; i < a.count; i += 3) for (let c = 0; c < n; c++) { const t = arr[(i + 1) * n + c]; arr[(i + 1) * n + c] = arr[(i + 2) * n + c]; arr[(i + 2) * n + c] = t; }
  }
  const nr = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < nr.count; i++) nr.setXYZ(i, -nr.getX(i), -nr.getY(i), -nr.getZ(i));
  return g;
}
/** 让一张面朝着该朝的方向：want 给出某一点上「外」的方向；多数三角形背着它就整张翻过来 */
export function facing(g: Geo, want: (x: number, y: number, z: number) => [number, number, number]): Geo {
  const p = g.attributes.position as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let s = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3;
    b.sub(a); c.sub(a); b.cross(c);
    const w = want(cx, cy, cz);
    s += b.x * w[0] + b.y * w[1] + b.z * w[2];
  }
  return s < 0 ? flip(g) : g;
}
/** 一张平放的面（朝上），uv 落在图集的一格里：w 沿 x，d 沿 z；图的上边朝 −z */
export function decal(w: number, d: number, r: [number, number, number, number], nx = 1, nz = 1): Geo {
  const g = norm(new THREE.PlaneGeometry(w, d, nx, nz).rotateX(-Math.PI / 2));
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, r[0] + (p.getX(i) / w + 0.5) * (r[2] - r[0]), r[3] + (p.getZ(i) / d + 0.5) * (r[1] - r[3]));
  return g;
}
/** 一张立着的面（朝 +z），uv 落在图集的一格里：w 沿 x，h 沿 y，中心在原点 */
export function panel(w: number, h: number, r: [number, number, number, number]): Geo {
  const g = norm(new THREE.PlaneGeometry(w, h));
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, r[0] + (p.getX(i) / w + 0.5) * (r[2] - r[0]), r[1] + (p.getY(i) / h + 0.5) * (r[3] - r[1]));
  return g;
}

// —— 脚印（给「哪里能走」的图用） ——
export interface Solid {
  /** 是什么 */ id: string;
  /** rect：中心 x,z、宽 w（沿自己的 x）、深 d、转角 yaw；disc：中心与半径 r */
  kind: 'rect' | 'disc';
  x: number; z: number; w?: number; d?: number; yaw?: number; r?: number;
  /** 顶面的高度（世界坐标）。walk 为真时是能踩上去的面（桥面、亭台、踏脚石），否则只是「多高」 */
  top?: number; walk?: boolean;
}

/** 攒料的一摊：几处各并各的（视锥外的那一处整块不画） */
export interface Ctx {
  q: Quality; low: boolean; mats: Mats;
  /** 图集里各格的 uv（[u0, v0, u1, v1]，v0 是下边）与留白处 */
  rect: (name: string) => [number, number, number, number]; blank: [number, number];
  /** 院里（草堂、东厢、篱、桥、亭）、村里、田间与渡口 */
  home: Builder; village: Builder; far: Builder;
  /** 草堂的屋顶、南墙：各自一组 */
  roof: Builder; front: Builder;
  anchors: Record<string, THREE.Object3D>; parts: Record<string, THREE.Object3D>;
  solids: Solid[];
  /** 可拿的东西挂在哪（默认是总的那一组） */
  root: THREE.Group; frontRoot: THREE.Group;
  /** 立一个挂点：世界坐标、朝向（yaw：+z 转到哪边） */
  anchor(name: string, x: number, y: number, z: number, yaw?: number): THREE.Object3D;
  /** 一件可拿的东西：几何并成一块网格，原点就是几何的原点；摆在 pos、转 rot */
  part(name: string, mat: keyof Mats, geos: Geo[], pos: V3, rot?: THREE.Euler, parent?: THREE.Object3D): THREE.Mesh;
  solid(s: Solid): void;
  /** 每帧要动的东西（水碓、秋千……）往这里登记 */
  tick: Array<(dt: number, t: number) => void>;
}

/** 朝向：把 +z 转到 (dx, dz) 这个方向要转多少 */
export const yawTo = (dx: number, dz: number) => Math.atan2(dx, dz);
