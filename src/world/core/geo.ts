/**
 * 几何工具：这座寺的每一根柱、每一朵斗栱、每一垄瓦都是程序搭出来的。
 * 约定：所有几何都不带索引，且恰好有 position / normal / uv / color 四个属性，这样任何两块都能并成一块。
 * uv 以「米」为单位（一个单位 = 一米），木纹的走向沿 v；color 是顶点色，用来做暗角、旧、脏（乘在材质色上）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng';

export type Geo = THREE.BufferGeometry;
export type Axis = 'x' | 'y' | 'z';
const jit = mulberry32(20261110);
const KEEP = ['position', 'normal', 'uv', 'color'];

/** 统一成四个属性、不带索引 */
export function norm(g: Geo): Geo {
  const o = g.index ? g.toNonIndexed() : g;
  if (o !== g) g.dispose();
  if (!o.attributes.normal) o.computeVertexNormals();
  const n = o.attributes.position.count;
  if (!o.attributes.uv) o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!o.attributes.color) o.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  for (const k of Object.keys(o.attributes)) if (!KEEP.includes(k)) o.deleteAttribute(k);
  o.morphAttributes = {};
  o.clearGroups();
  return o;
}

/** 按面的朝向投影出以米为单位的 uv，纹理的 v 尽量沿 grain 轴 */
export function uvBox(g: Geo, grain: Axis = 'y', scale = 1, jitter = true): Geo {
  const p = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const ou = jitter ? jit() * 7.31 : 0, ov = jitter ? jit() * 5.17 : 0;
  const gi = grain === 'x' ? 0 : grain === 'y' ? 1 : 2;
  const c = [0, 0, 0];
  for (let i = 0; i < p.count; i += 3) {
    const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
    const ux = p.getX(i + 1) - ax, uy = p.getY(i + 1) - ay, uz = p.getZ(i + 1) - az;
    const vx = p.getX(i + 2) - ax, vy = p.getY(i + 2) - ay, vz = p.getZ(i + 2) - az;
    const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
    const na = nx >= ny && nx >= nz ? 0 : ny >= nz ? 1 : 2;
    let ua = na === 0 ? 2 : 0, va = na === 1 ? 2 : 1;
    if (ua === gi) { const t = ua; ua = va; va = t; }
    for (let k = 0; k < 3; k++) {
      c[0] = p.getX(i + k); c[1] = p.getY(i + k); c[2] = p.getZ(i + k);
      uv.setXY(i + k, c[ua] * scale + ou, c[va] * scale + ov);
    }
  }
  return g;
}

const longest = (w: number, h: number, d: number): Axis => (w >= h && w >= d ? 'x' : h >= d ? 'y' : 'z');

/** 方料。grain 不给时取最长的一边（木纹顺着长向） */
export function box(w: number, h: number, d: number, grain?: Axis): Geo {
  return uvBox(norm(new THREE.BoxGeometry(w, h, d)), grain ?? longest(w, h, d));
}
/** 底面落在 y=0 的方料 */
export const boxUp = (w: number, h: number, d: number, grain?: Axis) => box(w, h, d, grain).translate(0, h / 2, 0);

/** 圆料（柱、鼓），立着，中心在原点。seg 是一圈的段数 */
export function cyl(rTop: number, rBot: number, h: number, seg = 16, open = false, hseg = 1): Geo {
  const g = norm(new THREE.CylinderGeometry(rTop, rBot, h, seg, hseg, open));
  const uv = g.attributes.uv as THREE.BufferAttribute, nr = g.attributes.normal as THREE.BufferAttribute;
  const circ = Math.PI * (rTop + rBot), ou = jit() * 3.7, ov = jit() * 2.9;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(nr.getY(i)) > 0.9) uv.setXY(i, (uv.getX(i) - 0.5) * 2 * rBot + ou, (uv.getY(i) - 0.5) * 2 * rBot + ov);
    else uv.setXY(i, uv.getX(i) * circ + ou, uv.getY(i) * h + ov);
  }
  return g;
}
export const cylUp = (rTop: number, rBot: number, h: number, seg = 16, open = false, hseg = 1) => cyl(rTop, rBot, h, seg, open, hseg).translate(0, h / 2, 0);

export function sphere(r: number, ws = 16, hs = 12): Geo {
  const g = norm(new THREE.SphereGeometry(r, ws, hs));
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r, uv.getY(i) * Math.PI * r);
  return g;
}

/** 车削：轮廓 [半径, 高] 自下而上，绕 y 轴转一圈。seg=4 时是方的（斗、须弥座），再用 scale 拉成长方 */
export function lathe(profile: Array<[number, number]>, seg = 24, phi0 = 0, arc = Math.PI * 2): Geo {
  const g = norm(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg, phi0, arc));
  const uv = g.attributes.uv as THREE.BufferAttribute;
  let len = 0, rmax = 0;
  for (let i = 1; i < profile.length; i++) len += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]);
  for (const [r] of profile) rmax = Math.max(rmax, r);
  const ou = jit() * 3.1, ov = jit() * 2.3;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * rmax * (arc / (Math.PI * 2)) + ou, uv.getY(i) * len + ov);
  if (seg <= 8) {
    // 段数少时是棱柱：要平的面，不要被抹圆
    g.deleteAttribute('normal'); g.computeVertexNormals();
  }
  return g;
}
/** 方的车削件：轮廓 [半宽, 高]，截面是正方形（边与 x、z 轴平行） */
export function lathe4(profile: Array<[number, number]>): Geo {
  const k = Math.SQRT2;
  return lathe(profile.map(([r, y]) => [r * k, y] as [number, number]), 4, Math.PI / 4);
}

/** 把二维轮廓（x, y）沿 z 拉出厚度 depth，居中 */
export function prism(pts: Array<[number, number]>, depth: number, grain: Axis = 'y'): Geo {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = norm(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 }));
  g.translate(0, 0, -depth / 2);
  return uvBox(g, grain);
}
/** 由 THREE.Shape 拉出厚度（可带孔、带曲线） */
export function extrude(shape: THREE.Shape, depth: number, grain: Axis = 'y', curveSegments = 10, bevel = 0): Geo {
  const g = norm(new THREE.ExtrudeGeometry(shape, bevel > 0
    ? { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments }
    : { depth, bevelEnabled: false, curveSegments }));
  g.translate(0, 0, bevel > 0 ? -(depth - bevel * 2) / 2 : -depth / 2);
  return uvBox(g, grain);
}

/**
 * 沿一条折线扫出截面（脊、枋、栏杆、檐口都靠它）。截面 [x, y]：x 朝路径的右手侧（水平），y 朝上。
 * 截面按逆时针给（从路径前方回头看），闭合；沿路径方向法线是连续的，截面的棱是硬的。
 */
export function sweep(path: THREE.Vector3[], profile: Array<[number, number]>, o: { caps?: boolean; up?: THREE.Vector3; scale?: (t: number) => number; open?: boolean } = {}): Geo {
  const up = o.up ?? new THREE.Vector3(0, 1, 0);
  const n = path.length, m = profile.length;
  const T: THREE.Vector3[] = [], S: THREE.Vector3[] = [], U: THREE.Vector3[] = [], L: number[] = [0];
  for (let i = 0; i < n; i++) {
    const t = new THREE.Vector3().subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize();
    const s = new THREE.Vector3().crossVectors(up, t);
    if (s.lengthSq() < 1e-8) s.set(1, 0, 0);
    s.normalize();
    T.push(t); S.push(s); U.push(new THREE.Vector3().crossVectors(t, s).normalize());
    if (i > 0) L.push(L[i - 1] + path[i].distanceTo(path[i - 1]));
  }
  const cx = profile.reduce((a, p) => a + p[0], 0) / m, cy = profile.reduce((a, p) => a + p[1], 0) / m;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const P = (i: number, j: number, out: THREE.Vector3) => {
    const sc = o.scale ? o.scale(L[i] / (L[n - 1] || 1)) : 1;
    const [x, y] = profile[j % m];
    return out.copy(path[i]).addScaledVector(S[i], x * sc).addScaledVector(U[i], y * sc);
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const na = new THREE.Vector3(), nb = new THREE.Vector3(), e = new THREE.Vector3();
  let per = 0;
  const edges = o.open ? m - 1 : m;
  for (let j = 0; j < edges; j++) {
    const [x0, y0] = profile[j], [x1, y1] = profile[(j + 1) % m];
    const el = Math.hypot(x1 - x0, y1 - y0);
    // 这条边的外法线（截面内）
    let ex = y1 - y0, ey = -(x1 - x0);
    if (ex * ((x0 + x1) / 2 - cx) + ey * ((y0 + y1) / 2 - cy) < 0) { ex = -ex; ey = -ey; }
    const el2 = Math.hypot(ex, ey) || 1; ex /= el2; ey /= el2;
    for (let i = 0; i < n - 1; i++) {
      P(i, j, a); P(i, j + 1, b); P(i + 1, j + 1, c); P(i + 1, j, d);
      na.copy(S[i]).multiplyScalar(ex).addScaledVector(U[i], ey).normalize();
      nb.copy(S[i + 1]).multiplyScalar(ex).addScaledVector(U[i + 1], ey).normalize();
      // 朝外的一面为正面
      e.subVectors(b, a).cross(d.clone().sub(a));
      const flip = e.dot(na) < 0;
      const quad: Array<[THREE.Vector3, THREE.Vector3, number, number]> = flip
        ? [[a, na, per, L[i]], [d, nb, per, L[i + 1]], [c, nb, per + el, L[i + 1]], [a, na, per, L[i]], [c, nb, per + el, L[i + 1]], [b, na, per + el, L[i]]]
        : [[a, na, per, L[i]], [b, na, per + el, L[i]], [c, nb, per + el, L[i + 1]], [a, na, per, L[i]], [c, nb, per + el, L[i + 1]], [d, nb, per, L[i + 1]]];
      for (const [p, nn, u, v] of quad) { pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); uv.push(u, v); }
    }
    per += el;
  }
  if (o.caps !== false && !o.open) {
    for (const end of [0, n - 1]) {
      const nn = end === 0 ? T[0].clone().negate() : T[n - 1].clone();
      for (let j = 1; j < m - 1; j++) {
        P(end, 0, a); P(end, j, b); P(end, j + 1, c);
        e.subVectors(b, a).cross(d.subVectors(c, a));
        const tri = e.dot(nn) < 0 ? [a, c, b] : [a, b, c];
        for (const p of tri) { pos.push(p.x, p.y, p.z); nor.push(nn.x, nn.y, nn.z); uv.push(p.x + p.z, p.y); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return norm(g);
}

/** 由网格点阵建面：pts[i][j]，i 沿 u，j 沿 v；法线平滑。uvFn 给每个点的 uv */
export function grid(pts: THREE.Vector3[][], uvFn?: (i: number, j: number, p: THREE.Vector3) => [number, number], flip = false): Geo {
  const nu = pts.length, nv = pts[0].length;
  const pos = new Float32Array(nu * nv * 3), uv = new Float32Array(nu * nv * 2), idx: number[] = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const p = pts[i][j], k = i * nv + j;
    pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
    const t = uvFn ? uvFn(i, j, p) : [i, j];
    uv[k * 2] = t[0]; uv[k * 2 + 1] = t[1];
  }
  for (let i = 0; i < nu - 1; i++) for (let j = 0; j < nv - 1; j++) {
    const a = i * nv + j, b = (i + 1) * nv + j, c = (i + 1) * nv + j + 1, d = i * nv + j + 1;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return norm(g);
}

// —— 顶点色 ——
/** 整块乘一个颜色 */
export function tint(g: Geo, r: number, gg = r, b = r): Geo {
  const c = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * r, c.getY(i) * gg, c.getZ(i) * b);
  return g;
}
export function tintHex(g: Geo, hex: number): Geo {
  const c = new THREE.Color(hex); // 已转成线性
  return tint(g, c.r, c.g, c.b);
}
/** 按位置 / 法线给每个顶点一个明暗系数（做檐下的暗、柱脚的脏、朝下的面更暗） */
export function shade(g: Geo, fn: (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number): Geo {
  const c = g.attributes.color as THREE.BufferAttribute, p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++) {
    const k = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return g;
}
/** 按位置 / 法线给每个顶点一个颜色（乘上去）。fn 把颜色写进 out（线性 rgb） */
export function colorize(g: Geo, fn: (x: number, y: number, z: number, nx: number, ny: number, nz: number, out: [number, number, number]) => void): Geo {
  const c = g.attributes.color as THREE.BufferAttribute, p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  const o: [number, number, number] = [1, 1, 1];
  for (let i = 0; i < c.count; i++) {
    o[0] = o[1] = o[2] = 1;
    fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), o);
    c.setXYZ(i, c.getX(i) * o[0], c.getY(i) * o[1], c.getZ(i) * o[2]);
  }
  return g;
}
/** 一块石头：二十面体细分后用噪声挤一挤。sx/sy/sz 是三个方向的半径 */
export function rockGeo(seed: number, sx: number, sy: number, sz: number, detail = 2): Geo {
  const g0 = new THREE.IcosahedronGeometry(1, detail);
  const p = g0.attributes.position as THREE.BufferAttribute;
  const h = (x: number, y: number, z: number) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed * 4.1) * 43758.5453; return v - Math.floor(v); };
  const n3 = (x: number, y: number, z: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const L = (a: number, b: number, t: number) => a + (b - a) * t;
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v), L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let k = 0.72 + 0.42 * n3(x * 1.3 + 5, y * 1.3, z * 1.3) + 0.2 * n3(x * 3.1, y * 3.1 + 9, z * 3.1) + 0.08 * n3(x * 7, y * 7, z * 7 + 3);
    // 削几个平面，像劈开的石头
    const cut = Math.max(0, x * 0.6 + y * 0.7 + z * 0.3 - 0.62) + Math.max(0, -x * 0.5 + y * 0.4 - z * 0.7 - 0.66);
    k -= cut * 0.9;
    p.setXYZ(i, x * k * sx, (y * k * 0.9 + 0.25) * sy, z * k * sz);
  }
  g0.computeVertexNormals();
  const g = uvBox(norm(g0), 'y');
  // 细分后各面独立的法线会一面一面的，重算成平滑
  return shade(g, (_x, y) => 0.7 + 0.3 * Math.min(1, Math.max(0, y / (sy * 0.8))));
}
/** 朝下的面压暗一些（廉价的环境遮蔽） */
export const under = (g: Geo, k = 0.62) => shade(g, (_x, _y, _z, _nx, ny) => (ny < -0.5 ? k : ny < 0.3 ? 0.5 + k / 2 : 1));

export function merge(gs: Geo[]): Geo {
  if (gs.length === 1) return gs[0];
  const m = mergeGeometries(gs, false);
  if (!m) throw new Error('merge: 几何属性不一致');
  for (const g of gs) g.dispose();
  return m;
}

export const M = {
  t: (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z),
  ry: (a: number) => new THREE.Matrix4().makeRotationY(a),
  rx: (a: number) => new THREE.Matrix4().makeRotationX(a),
  rz: (a: number) => new THREE.Matrix4().makeRotationZ(a),
  s: (x: number, y = x, z = x) => new THREE.Matrix4().makeScale(x, y, z),
  /** 依次相乘：mul(A, B, C) = A·B·C（先做 C） */
  mul: (...ms: THREE.Matrix4[]) => ms.reduce((a, b) => a.clone().multiply(b)),
  trs: (x: number, y: number, z: number, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s)),
  /** 把一根沿 +y、长 1 的料摆成从 a 到 b */
  span: (a: THREE.Vector3, b: THREE.Vector3, thick = 1) => {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(thick, len, thick));
  },
};

/**
 * 攒料的人：同一种材质的零件最后并成一块网格（一栋殿只有十来次绘制）；重复很多次的零件（斗栱、椽、瓦当）走实例化。
 */
export class Builder {
  private parts = new Map<string, Geo[]>();
  private insts = new Map<string, { geo: Geo; mat: string; ms: THREE.Matrix4[] }>();
  private stack: THREE.Matrix4[] = [];
  private cur = new THREE.Matrix4();
  /** 之后加进来的零件都先经过这个变换（可嵌套） */
  push(m: THREE.Matrix4): this { this.stack.push(this.cur.clone()); this.cur.multiply(m); return this; }
  pop(): this { this.cur = this.stack.pop() ?? new THREE.Matrix4(); return this; }
  add(mat: string, g: Geo): this {
    g.applyMatrix4(this.cur);
    let a = this.parts.get(mat);
    if (!a) this.parts.set(mat, (a = []));
    a.push(g);
    return this;
  }
  /** 实例化的零件：同一个 key 共用一份几何 */
  inst(key: string, mat: string, geo: () => Geo, m: THREE.Matrix4): this {
    let e = this.insts.get(key);
    if (!e) this.insts.set(key, (e = { geo: geo(), mat, ms: [] }));
    e.ms.push(this.cur.clone().multiply(m));
    return this;
  }
  /** 并成网格。noCast 里的材质不投影；noReceive 不受影 */
  build(mats: Record<string, THREE.Material>, o: { name?: string; noCast?: string[]; noReceive?: string[] } = {}): THREE.Group {
    const grp = new THREE.Group();
    grp.name = o.name ?? '';
    const flags = (mesh: THREE.Mesh, mat: string) => {
      mesh.castShadow = !(o.noCast ?? []).includes(mat);
      mesh.receiveShadow = !(o.noReceive ?? []).includes(mat);
    };
    for (const [mat, gs] of this.parts) {
      const m = mats[mat];
      if (!m) throw new Error(`Builder: 没有材质 ${mat}`);
      const mesh = new THREE.Mesh(merge(gs), m);
      mesh.name = `${grp.name}:${mat}`;
      flags(mesh, mat);
      grp.add(mesh);
    }
    for (const [key, e] of this.insts) {
      const m = mats[e.mat];
      if (!m) throw new Error(`Builder: 没有材质 ${e.mat}`);
      const im = new THREE.InstancedMesh(e.geo, m, e.ms.length);
      e.ms.forEach((x, i) => im.setMatrixAt(i, x));
      im.instanceMatrix.needsUpdate = true;
      im.name = `${grp.name}:${key}`;
      im.computeBoundingSphere();
      flags(im, e.mat);
      grp.add(im);
    }
    this.parts.clear(); this.insts.clear();
    return grp;
  }
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
