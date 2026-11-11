/**
 * 植物的公用件：
 *   FGeo —— 攒顶点的篮子（位置、法线、uv、顶点色，外加风用的 sway）；
 *   tube / card —— 枝干是沿折线扫出的管，叶是一张张带透明的卡片；
 *   alphaAtlas —— 叶的贴图：画布现画，逐级缩小时保住「遮住的面积」，远处的树冠才不会越看越稀；
 *   leafMat —— 叶的材质：两面都按「成团的法线」受光、逆光透亮、从树下往上看偏暗。
 */
import * as THREE from 'three';
import { mulberry32, type Rng } from '../../core/rng';
import type { Enhance } from '../../core/mats';

export type V3 = THREE.Vector3;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const UP = new THREE.Vector3(0, 1, 0);
export type RGB = [number, number, number];

export interface Rand { (): number; r(a: number, b: number): number; i(n: number): number; pm(a: number): number; pick<T>(xs: readonly T[]): T }
export function rand(seed: number): Rand {
  const base: Rng = mulberry32(seed);
  const f = (() => base()) as Rand;
  f.r = (a, b) => a + (b - a) * base();
  f.i = (n) => Math.min(n - 1, Math.floor(base() * n));
  f.pm = (a) => (base() * 2 - 1) * a;
  f.pick = (xs) => xs[Math.min(xs.length - 1, Math.floor(base() * xs.length))];
  return f;
}
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** sRGB 十六进制 → 线性 rgb（顶点色要线性的） */
export function lin(hex: number): RGB { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
export const mulRGB = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export class FGeo {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; sw: number[] = []; idx: number[] = [];
  get n() { return this.pos.length / 3; }
  get tris() { return this.idx.length / 3; }
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, vv: number, r: number, g: number, b: number, s: number): number {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, vv); this.col.push(r, g, b); this.sw.push(s);
    return i;
  }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  /** 把另一篮并进来（可带变换） */
  add(o: FGeo, m?: THREE.Matrix4) {
    const base = this.n;
    if (m) {
      const e = m.elements, nm = new THREE.Matrix3().getNormalMatrix(m).elements;
      for (let i = 0; i < o.pos.length; i += 3) {
        const x = o.pos[i], y = o.pos[i + 1], z = o.pos[i + 2];
        this.pos.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        const a = o.nor[i], b = o.nor[i + 1], c = o.nor[i + 2];
        const nx = nm[0] * a + nm[3] * b + nm[6] * c, ny = nm[1] * a + nm[4] * b + nm[7] * c, nz = nm[2] * a + nm[5] * b + nm[8] * c;
        const l = Math.hypot(nx, ny, nz) || 1;
        this.nor.push(nx / l, ny / l, nz / l);
      }
    } else { for (const x of o.pos) this.pos.push(x); for (const x of o.nor) this.nor.push(x); }
    for (const x of o.uv) this.uv.push(x);
    for (const x of o.col) this.col.push(x);
    for (const x of o.sw) this.sw.push(x);
    for (const x of o.idx) this.idx.push(x + base);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sw, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

/** 折线抹顺：过这些点的样条上取 n+1 个点 */
export function smoothPath(ctrl: V3[], n: number, tension = 0.5): V3[] {
  if (ctrl.length < 3) return ctrl.map((p) => p.clone());
  return new THREE.CatmullRomCurve3(ctrl, false, 'centripetal', tension).getPoints(n);
}
export function pathLength(p: V3[]): number { let l = 0; for (let i = 1; i < p.length; i++) l += p[i].distanceTo(p[i - 1]); return l; }
/** 折线上按长度比例 t（0…1）取点与方向 */
export function along(p: V3[], t: number, outDir?: V3): V3 {
  const L = pathLength(p); let d = clamp01(t) * L;
  for (let i = 1; i < p.length; i++) {
    const s = p[i].distanceTo(p[i - 1]);
    if (d <= s || i === p.length - 1) {
      outDir?.subVectors(p[i], p[i - 1]).normalize();
      return p[i - 1].clone().lerp(p[i], s > 1e-6 ? Math.min(1, d / s) : 0);
    }
    d -= s;
  }
  return p[p.length - 1].clone();
}

export interface Ring { p: V3; t: V3; n: V3; b: V3; r: number }
export interface TubeOpts {
  sides: number;
  /** 每个环的摆动权重（0 不动 … 1 梢头） */
  sway?: (i: number, p: V3) => number;
  /** 颜色（线性 rgb 的乘数）；给一个数就是灰度 */
  col?: number | RGB | ((i: number, k: number) => RGB | number);
  /** 贴图：绕一圈 u 跨多少、沿长度每米 v 走多少、v 的起点 */
  uSpan?: number; vPerM?: number; v0?: number;
  /** 半径随角度的起伏（树根的棱、老干的疙瘩） */
  bulge?: (i: number, ang: number) => number;
  /** 末端收尖封口 */
  cap?: boolean;
  startN?: V3;
}
/** 沿折线扫一根管（干、枝、茎）。返回每一环的位置与标架，好往上接枝 */
export function tube(g: FGeo, pts: V3[], rad: number[], o: TubeOpts): Ring[] {
  const n = pts.length, S = o.sides, rings: Ring[] = [];
  const uSpan = o.uSpan ?? 1, vPerM = o.vPerM ?? 1;
  let N: V3 | null = o.startN ? o.startN.clone() : null;
  let len = o.v0 ?? 0;
  const base = g.n;
  for (let i = 0; i < n; i++) {
    const T = new THREE.Vector3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    if (!N) N = (Math.abs(T.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).cross(T).normalize();
    else { N.addScaledVector(T, -N.dot(T)); if (N.lengthSq() < 1e-8) N.set(1, 0, 0).cross(T); N.normalize(); }
    const B = new THREE.Vector3().crossVectors(T, N);
    if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
    rings.push({ p: pts[i], t: T, n: N.clone(), b: B, r: rad[i] });
    const sw = o.sway ? o.sway(i, pts[i]) : 0, p = pts[i];
    for (let k = 0; k <= S; k++) {
      const a = (k / S) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const rr = rad[i] * (o.bulge ? o.bulge(i, a) : 1);
      const nx = N.x * ca + B.x * sa, ny = N.y * ca + B.y * sa, nz = N.z * ca + B.z * sa;
      const c = typeof o.col === 'function' ? o.col(i, k % S) : (o.col ?? 1);
      const cr = typeof c === 'number' ? c : c[0], cg = typeof c === 'number' ? c : c[1], cb = typeof c === 'number' ? c : c[2];
      g.v(p.x + nx * rr, p.y + ny * rr, p.z + nz * rr, nx, ny, nz, (k / S) * uSpan, len * vPerM, cr, cg, cb, sw);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < S; k++) {
    const a = base + i * (S + 1) + k;
    g.quad(a, a + 1, a + S + 2, a + S + 1);
  }
  if (o.cap) {
    const e = rings[n - 1], sw = o.sway ? o.sway(n - 1, e.p) : 0;
    const c = typeof o.col === 'function' ? o.col(n - 1, 0) : (o.col ?? 1), cr = typeof c === 'number' ? c : c[0], cg = typeof c === 'number' ? c : c[1], cb = typeof c === 'number' ? c : c[2];
    const tip = g.v(e.p.x + e.t.x * e.r * 1.2, e.p.y + e.t.y * e.r * 1.2, e.p.z + e.t.z * e.r * 1.2, e.t.x, e.t.y, e.t.z, 0.5 * uSpan, (len + e.r) * vPerM, cr, cg, cb, sw);
    const b0 = base + (n - 1) * (S + 1);
    for (let k = 0; k < S; k++) g.tri(b0 + k, b0 + k + 1, tip);
  }
  return rings;
}

/** 图集里的一格：u0 v0 u1 v1（v 朝上） */
export type Tile = [number, number, number, number];
export const tileOf = (i: number, cols: number, rows: number): Tile => {
  const c = i % cols, r = Math.floor(i / cols);
  return [c / cols, 1 - (r + 1) / rows, (c + 1) / cols, 1 - r / rows];
};

const _n = new THREE.Vector3();
/**
 * 一张叶卡：底边中点 base，沿 up 伸出 h（从 base 往回退 back·h 起），宽 w（沿 right）。
 * 法线不是卡片自己的面法线，而是「成团」的：从 nc（簇心 / 冠心）指向顶点，按 nScale 压扁，再和朝上的方向按 kUp 混合。
 * 顶点色：底边乘 cb、上边乘 ct（底暗上亮，像簇里的遮挡）。
 */
export function card(g: FGeo, base: V3, right: V3, up: V3, w: number, h: number, tile: Tile, nc: V3, kUp: number, cb: RGB, ct: RGB, s0: number, s1: number, back = 0, nScaleY = 1) {
  const hw = w / 2;
  const i0 = g.n;
  for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    const a = k ? hw : -hw, t = j ? h * (1 - back) : -h * back;
    const x = base.x + right.x * a + up.x * t, y = base.y + right.y * a + up.y * t, z = base.z + right.z * a + up.z * t;
    _n.set(x - nc.x, (y - nc.y) * nScaleY, z - nc.z);
    const l = _n.length();
    if (l > 1e-5) _n.multiplyScalar(1 / l); else _n.set(0, 1, 0);
    _n.y += kUp; _n.normalize();
    const c = j ? ct : cb;
    g.v(x, y, z, _n.x, _n.y, _n.z, k ? tile[2] : tile[0], j ? tile[3] : tile[1], c[0], c[1], c[2], j ? s1 : s0);
  }
  g.quad(i0, i0 + 1, i0 + 3, i0 + 2);
}

// —— 叶的贴图 ——
export type Painter = (g: CanvasRenderingContext2D, S: number, R: Rand) => void;

function grabTile(S: number, paint: Painter, seed: number): Uint8Array {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  paint(g, S, rand(seed));
  const d = g.getImageData(0, 0, S, S).data;
  return new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
}
/** 透明处的颜色填成不透明处的平均色（否则线性过滤会在叶缘带出一圈黑边） */
function bleed(d: Uint8Array, S: number) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < S * S; i++) if (d[i * 4 + 3] > 40) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; n++; }
  if (!n) return;
  r /= n; g /= n; b /= n;
  for (let i = 0; i < S * S; i++) if (d[i * 4 + 3] === 0) { d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; }
}
const coverage = (d: Uint8Array, thr: number, k = 1) => { let c = 0; const n = d.length / 4; for (let i = 0; i < n; i++) if (d[i * 4 + 3] * k > thr) c++; return c / n; };
function half(d: Uint8Array, S: number): Uint8Array {
  const h = S >> 1, o = new Uint8Array(h * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < h; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let q = 0; q < 4; q++) {
      const j = ((y * 2 + (q >> 1)) * S + x * 2 + (q & 1)) * 4;
      r += d[j]; g += d[j + 1]; b += d[j + 2]; a += d[j + 3];
    }
    const k = (y * h + x) * 4;
    o[k] = r / 4; o[k + 1] = g / 4; o[k + 2] = b / 4; o[k + 3] = a / 4;
  }
  return o;
}
/**
 * 一组小图拼成图集（cols 列），带一整套逐级缩小的层：
 * 每一格单独缩（格与格不串色），每缩一级把透明度整体放大到「超过阈值的面积」与原图一样——
 * 不这样做的话，针叶这类细东西缩几级就全低于阈值，远处的树会秃。
 */
export function alphaAtlas(S: number, cols: number, painters: Painter[], seed = 1, thr = 0.4): THREE.DataTexture {
  const rows = Math.ceil(painters.length / cols);
  const tiles: Uint8Array[][] = painters.map((p, i) => {
    const d0 = grabTile(S, p, seed + i * 101);
    bleed(d0, S);
    const cov0 = coverage(d0, thr * 255);
    const chain = [d0];
    for (let s = S; s > 1; s >>= 1) {
      const h = half(chain[chain.length - 1], s);
      if (cov0 > 0.002) {
        let lo = 0.25, hi = 6;
        for (let it = 0; it < 9; it++) { const mid = (lo + hi) / 2; if (coverage(h, thr * 255, mid) < cov0) lo = mid; else hi = mid; }
        const k = Math.max(1, (lo + hi) / 2);
        for (let i2 = 3; i2 < h.length; i2 += 4) h[i2] = Math.min(255, h[i2] * k);
      }
      chain.push(h);
    }
    return chain;
  });
  const mips: Array<{ data: Uint8Array; width: number; height: number }> = [];
  let lvl = 0;
  for (let s = S; s >= 1; s >>= 1, lvl++) {
    const W = s * cols, H = s * rows, out = new Uint8Array(W * H * 4);
    tiles.forEach((chain, i) => {
      const c = i % cols, r = Math.floor(i / cols), src = chain[lvl];
      for (let y = 0; y < s; y++) {
        // 画布的第 0 行在上；贴图的 v 朝上，所以倒着放
        const dy = (rows - 1 - r) * s + (s - 1 - y);
        out.set(src.subarray(y * s * 4, (y + 1) * s * 4), (dy * W + c * s) * 4);
      }
    });
    mips.push({ data: out, width: W, height: H });
  }
  // 再往下缩到 1×1
  let last = mips[mips.length - 1];
  while (last.width > 1 || last.height > 1) {
    const W = Math.max(1, last.width >> 1), H = Math.max(1, last.height >> 1), out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let ch = 0; ch < 4; ch++) {
      const x0 = Math.min(last.width - 1, x * 2), x1 = Math.min(last.width - 1, x * 2 + 1), y0 = Math.min(last.height - 1, y * 2), y1 = Math.min(last.height - 1, y * 2 + 1);
      out[(y * W + x) * 4 + ch] = (last.data[(y0 * last.width + x0) * 4 + ch] + last.data[(y0 * last.width + x1) * 4 + ch] + last.data[(y1 * last.width + x0) * 4 + ch] + last.data[(y1 * last.width + x1) * 4 + ch]) / 4;
    }
    last = { data: out, width: W, height: H };
    mips.push(last);
  }
  const t = new THREE.DataTexture(mips[0].data, mips[0].width, mips[0].height, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.mipmaps = mips as unknown as THREE.DataTexture['mipmaps'];
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// 透过来的光也要被影子挡：照着 three 自己取日影的那一句再取一次（three 换了写法就不取，当作没挡）
const SHADOW_TAP = THREE.ShaderChunk.lights_fragment_begin.includes('directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ]')
  ? /* glsl */ `
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      ksSh = receiveShadow ? getShadow( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, directionalLightShadows[ 0 ].shadowIntensity, directionalLightShadows[ 0 ].shadowBias, directionalLightShadows[ 0 ].shadowRadius, vDirectionalShadowCoord[ 0 ] ) : 1.0;
    #endif`
  : '';

export interface LeafOpts { color?: number; rough?: number; wind: number; snow?: boolean; trans?: number; /** 透过来的光染成什么色（乘在叶色上） */ transColor?: number; under?: number; alphaTest?: number; a2c: boolean; side?: THREE.Side; /** 环境反光留几成 */ sheen?: number }
/**
 * 叶的材质（内置的标准材质，上面叠三处小改）：
 *   正反两面都用同一条「成团的法线」（不然卡片背面会黑一片，像纸片）；
 *   逆光透亮：朝着日头看过去时，叶是被照透的（uTrans）；
 *   从树下往上看偏暗（uUnder）：冠的底面本来就在自己的影子里。
 */
export function leafMat(map: THREE.Texture, o: LeafOpts): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    map, color: o.color ?? 0xffffff, roughness: o.rough ?? 0.78, metalness: 0, side: o.side ?? THREE.DoubleSide,
    alphaTest: o.alphaTest ?? 0.4, vertexColors: true, alphaToCoverage: o.a2c, envMapIntensity: 0.55,
  });
  const uTrans = { value: o.trans ?? 0.6 }, uUnder = { value: o.under ?? 0.5 }, uTransC = { value: new THREE.Color(o.transColor ?? 0xfff2b0) }, uSheen = { value: o.sheen ?? 0.12 };
  m.userData.enhance = { wind: o.wind, snow: o.snow ?? true } satisfies Enhance;
  m.userData.uTrans = uTrans; m.userData.uUnder = uUnder; m.userData.uTransC = uTransC;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTrans = uTrans; sh.uniforms.uUnder = uUnder; sh.uniforms.uTransC = uTransC; sh.uniforms.uSheen = uSheen;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTrans; uniform float uUnder; uniform vec3 uTransC; uniform float uSheen;')
      .replace('#include <alphatest_fragment>', /* glsl */ `
#ifdef USE_ALPHATEST
  #ifdef ALPHA_TO_COVERAGE
    // 近处（透明度变化平缓）用多重采样把叶缘抹顺；远处（一个像素里透明度乱跳）退回硬裁——
    // 否则层层叠叠的叶各自只盖住同样的几个采样点，背景永远透得过来，远树会发白
    float ksFw = fwidth(diffuseColor.a);
    float ksSoft = clamp((diffuseColor.a - alphaTest) / max(ksFw, 0.0001) + 0.5, 0.0, 1.0);
    diffuseColor.a = mix(step(alphaTest, diffuseColor.a), ksSoft, clamp(1.0 - ksFw * 3.2, 0.0, 1.0));
    if (diffuseColor.a == 0.0) discard;
  #else
    if (diffuseColor.a < alphaTest) discard;
  #endif
#endif`)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n  normal *= faceDirection;\n#endif')
      .replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
{
  vec3 ksV = normalize(vViewPosition);
  float ksVy = (transpose(mat3(viewMatrix)) * ksV).y;
  float ksU = mix(1.0, uUnder, smoothstep(0.1, -0.8, ksVy));
  reflectedLight.directDiffuse *= ksU;
  reflectedLight.indirectDiffuse *= mix(1.0, ksU, 0.55);
  // 卡片的法线是「成团」的假法线，照出来的高光也是假的：直射高光不要，环境反光只留一点
  reflectedLight.directSpecular *= 0.0;
  reflectedLight.indirectSpecular *= uSheen;
  #if NUM_DIR_LIGHTS > 0
    vec3 ksL = directionalLights[0].direction;
    float ksB = pow(clamp(dot(-ksL, ksV), 0.0, 1.0), 3.0);
    float ksW = clamp(dot(normal, -ksL) * 0.5 + 0.5, 0.0, 1.0);
    float ksSh = 1.0;
    KS_SHADOW
    reflectedLight.directDiffuse += diffuseColor.rgb * uTransC * directionalLights[0].color * (uTrans * RECIPROCAL_PI) * (ksB * 0.9 + ksW * 0.1) * (0.3 + 0.7 * ksSh);
  #endif
}`.replace('KS_SHADOW', SHADOW_TAP));
  };
  m.customProgramCacheKey = () => 'ksleaf';
  return m;
}

/** 给干、枝用的树皮：照着寺里的树皮材质另开一份（好单独接上风） */
export function barkMat(base: THREE.MeshStandardMaterial, wind: number, p: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.setValues(p);
  m.userData = { enhance: { wind, snow: true, wet: true } satisfies Enhance };
  return m;
}

/** 实例化：同一份几何种在很多点上 */
export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[], tints?: THREE.Color[], cast = true, receive = true): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, ms.length);
  ms.forEach((m, i) => im.setMatrixAt(i, m));
  if (tints) tints.forEach((c, i) => im.setColorAt(i, c));
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast; im.receiveShadow = receive;
  im.computeBoundingSphere(); im.computeBoundingBox();
  return im;
}
