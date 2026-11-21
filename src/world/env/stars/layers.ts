/**
 * 天上的几层（都画在勾完线之后的那一层 FX_LAYER，自己比深度——只落在天上，树、屋、远山挡住的地方不画）：
 *
 *   StarLayer  —— 星点：星表里的星与五星。星等定大小与浓淡，色指数只给极淡的一点冷暖；近地平处淡下去、被远山遮住；
 *                 轻轻地闪（五星不闪）；月旁的星少。一次绘制。
 *   LineLayer  —— 星官的连线（一笔一笔的月白淡描：两头收笔、中间略重、带一点飞白，不碰着星点），外加流星（一道越来越细的白痕）。一次绘制。
 *   LabelLayer —— 星官名：小小的楷字，旁边一点朱砂（像星图上的题注）。点到哪显哪，轻轻地出来。一次绘制。
 *
 * 三层共用一组量 SU（J2000 → 世界的矩阵、星的显隐、像素比、月在哪……），由 sky.ts 每帧写。
 */
import * as THREE from 'three';
import { FX_LAYER, FX_PARS, U } from '../../ink/ink';
import { fontsReady, KAI } from '../../ink/text';
import type { SkyData } from './catalog';

/** 三层共用的量 */
export const SU = {
  /** J2000 赤道 → 世界（星斗的钟，含「候星移」多拨的） */
  uM: { value: new THREE.Matrix3() },
  /** x 星的显隐（夜 × 晴），y 看得见的最暗星等，z 像素比（一个 CSS 像素几个画面像素），w 月光压星的多少 */
  uSt: { value: new THREE.Vector4(0, 5.6, 1, 0) },
  /** 月在世界里的方向 */
  uMoonW: { value: new THREE.Vector3(0, -1, 0) },
  /** 天边画出来的远山（与 sky.ts 的天共用同一个量）：x 显隐，yz 嵩山的方向，w 浓度 */
  uMt: { value: new THREE.Vector4(1, Math.sin(0.82), Math.cos(0.82), 1) },
};

/**
 * 天边那三重远山的山脊有多高（仰角的正切）：天（sky.ts）画山用它，星点用它判断自己是不是落在山后面。
 * 要用的量：uMt。
 */
export const RIDGE_GLSL = /* glsl */ `
float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
// 山脊线：绕着地平一圈取噪声（首尾自然相接），尖的是峰
float ridge(vec2 u, float R, float s) {
  float a = 1.0 - abs(n2(u * R + s) * 2.0 - 1.0);
  float b = 1.0 - abs(n2(u * R * 2.1 + s * 1.7 + 3.0) * 2.0 - 1.0);
  float c = 1.0 - abs(n2(u * R * 4.7 + s * 2.3 + 8.0) * 2.0 - 1.0);
  return a * a * 0.58 + b * b * 0.27 * (0.35 + a) + c * 0.11 * (0.3 + a * b) + n2(u * R * 13.0 + s) * 0.04;
}
// 三重山各自的山脊高（u 是水平方向的单位向量）
vec3 ridges(vec2 u) {
  float song = smoothstep(0.55, 0.98, dot(u, uMt.yz));
  float open = 1.0 - 0.55 * smoothstep(0.9, 1.0, dot(u, vec2(0.0, 1.0)));
  float h1 = (0.02 + (0.05 + 0.2 * song) * (0.3 + 0.7 * ridge(u, 6.0, 1.3))) * open;
  float h2r = (0.012 + (0.035 + 0.1 * song) * (0.3 + 0.7 * ridge(u, 9.0, 5.1))) * open;
  float h3 = 0.006 + 0.03 * (0.35 + 0.65 * ridge(u, 13.0, 9.7));
  return vec3(h1, h2r, h3);
}
`;

const SKY_V_HEAD = /* glsl */ `
uniform mat3 uM; uniform vec4 uSt; uniform vec3 uMoonW; uniform vec4 uMt; uniform float uTime;
// 天球上的一个方向 → 裁剪坐标（贴在无穷远：只跟着镜头转，不跟着走）
vec4 skyClip(vec3 d) { return projectionMatrix * vec4(mat3(viewMatrix) * d, 1.0); }
`;
/** 画面里这一点是不是天（没有东西挡着） */
const SEEN_GLSL = /* glsl */ `${FX_PARS}
bool onSky() { return texture2D(tDepth, gl_FragCoord.xy * uView.xy).x > 0.9999995; }
`;

// ———————————————————————————— 星点 ————————————————————————————
const STAR_V = /* glsl */ `
attribute float aMag; attribute float aBv; attribute float aHi; attribute float aKind;
${SKY_V_HEAD}
${RIDGE_GLSL}
varying vec4 vCol; varying float vCore; varying float vHi; varying float vHalo;
uniform vec3 uLight;
vec3 tint(float bv) {
  vec3 cold = vec3(0.78, 0.87, 1.0), warm = vec3(1.0, 0.87, 0.68), red = vec3(1.0, 0.74, 0.55);
  if (bv < 0.35) return mix(cold, vec3(1.0), smoothstep(-0.3, 0.35, bv));
  if (bv < 1.2) return mix(vec3(1.0), warm, smoothstep(0.35, 1.2, bv));
  return mix(warm, red, smoothstep(1.2, 1.85, bv));
}
void main() {
  vec3 d = normalize(uM * position);
  gl_Position = skyClip(d);
  // 星等 → 浓淡、大小：一等星以上实实在在一点白、带一圈很柔的晕；二三等清楚可辨；暗星是一层细尘。
  // 暗过「看得见的最暗星等」（无月 6 等多，满月也有 5 等）的不画
  float lim = uSt.y + aHi * 0.9 + aKind * 3.0;
  float el = d.y, t = el / max(length(d.xz), 1e-4);
  // 大气：越低越暗——按气团算消光（取乡野晴夜的约 0.12 等/气团，最多算到六个气团）：地平以上十度暗半等，二十度暗两成等，再高几乎不暗。
  // （漫游时镜头只看得到地平以上十到四十度，这一截里也要有足够的星）
  float se = max(el, 0.0), airmass = min(6.0, 1.0 / (se + 0.025 * exp(-11.0 * se)));
  float m = aMag - aHi * 0.6 + 0.12 * (airmass - 1.0);
  float k = clamp((1.6 - m) / 2.6, 0.0, 1.0);
  // 落在天边远山后面的：近的两重（墨重）挡住；最远那一重淡得只剩一个影子，像隔着一层雾，星只暗下去、不全没
  // （不然东南嵩山那一面，十几度以下会空出一大片没有星的天）；贴着地平的那一线被雾吞掉
  vec3 rh = ridges(normalize(d.xz + vec2(1e-6, 0.0))) * step(0.25, uMt.x);
  float top = max(rh.y, rh.z);
  float a = clamp(1.25 - (m - 1.5) * 0.17, 0.34, 1.0) * smoothstep(lim + 0.3, lim - 0.9, m);
  a *= smoothstep(0.008, 0.05, el) * smoothstep(top + 0.002, top + 0.018, t) * mix(0.3, 1.0, smoothstep(rh.x - 0.004, rh.x + 0.012, t));
  // 闪：两个快慢不同的起伏相乘，低处闪得厉害；五星不闪
  float ph = float(gl_VertexID) * 7.123;
  float tw = (sin(uTime * (1.7 + fract(ph) * 3.1) + ph) * 0.5 + 0.5) * (sin(uTime * (4.3 + fract(ph * 1.37) * 5.0) + ph * 1.9) * 0.5 + 0.5);
  a *= 1.0 - (1.0 - aKind) * (0.14 + 0.36 * (1.0 - smoothstep(0.05, 0.5, el))) * tw;
  // 月旁二三十度里的星明显少，再远就不怎么受影响
  a *= 1.0 - uSt.w * smoothstep(0.93, 0.997, dot(d, uMoonW));
  a = min(1.0, a * (1.0 + 0.6 * aHi)) * uSt.x;
  // 一等以上（与五星）外面一圈很柔的晕：墨画里的一「点」，不要十字芒
  float halo = clamp(k * 1.3, 0.0, 1.0) * (0.8 + 0.2 * aKind);
  // 大小按 CSS 像素给（uSt.z 是渲染器的像素比），手机、电脑上看着一样大
  float size = (clamp(7.4 - 1.02 * (m - 0.5), 2.3, 8.4) + 0.9 * aHi + 0.6 * aKind) * uSt.z;
  gl_PointSize = size * (1.0 + 2.6 * halo);
  vCore = 1.0 / (1.0 + 2.6 * halo);
  vHalo = halo;
  vHi = aHi;
  vCol = vec4(uLight * mix(vec3(1.0), tint(aBv), 0.42 + 0.2 * aKind), a);
  if (a < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;
const STAR_F = /* glsl */ `
${SEEN_GLSL}
varying vec4 vCol; varying float vCore; varying float vHi; varying float vHalo;
void main() {
  if (!onSky()) discard;
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  float core = smoothstep(vCore, vCore * 0.62, r);
  // 亮星外面一圈极淡的晕（像宣纸上一点白洇开）
  float halo = exp(-r * r / (vCore * vCore) * 0.85) * 0.5 * vHalo;
  float a = (core + halo) * vCol.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol.rgb, a);
}
`;

export class StarLayer {
  mesh: THREE.Points;
  private hi: Float32Array; private hiAttr: THREE.BufferAttribute;
  private pos: THREE.BufferAttribute; private mag: THREE.BufferAttribute; private bv: THREE.BufferAttribute;
  /** 前 NP 个是五星，其后是星表 */
  static NP = 5;
  constructor(private data: SkyData) {
    const S = data.stars, n = S.n + StarLayer.NP;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), mag = new Float32Array(n), bv = new Float32Array(n), kind = new Float32Array(n);
    pos.set(S.dir, StarLayer.NP * 3); mag.set(S.mag, StarLayer.NP); bv.set(S.bv, StarLayer.NP);
    for (let i = 0; i < StarLayer.NP; i++) { pos[i * 3 + 2] = 1; mag[i] = 9; kind[i] = 1; }
    this.hi = new Float32Array(n);
    this.pos = new THREE.BufferAttribute(pos, 3); this.mag = new THREE.BufferAttribute(mag, 1); this.bv = new THREE.BufferAttribute(bv, 1);
    this.hiAttr = new THREE.BufferAttribute(this.hi, 1);
    g.setAttribute('position', this.pos); g.setAttribute('aMag', this.mag); g.setAttribute('aBv', this.bv);
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1)); g.setAttribute('aHi', this.hiAttr);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    const m = new THREE.ShaderMaterial({
      uniforms: { ...SU, uTime: U.uTime, uLight: U.uLight, tDepth: U.tDepth, uView: U.uView },
      vertexShader: STAR_V, fragmentShader: STAR_F, transparent: true, depthTest: false, depthWrite: false,
    });
    this.mesh = new THREE.Points(g, m);
    this.mesh.layers.set(FX_LAYER); this.mesh.frustumCulled = false; this.mesh.renderOrder = -20; this.mesh.name = '星';
    this.setCount(S.n);
  }
  /** 只画最亮的 n 颗（星表按星等排好了） */
  setCount(n: number) { this.mesh.geometry.setDrawRange(0, StarLayer.NP + Math.min(n, this.data.stars.n)); }
  /** 五星：J2000 方向、星等、色指数 */
  setPlanet(i: number, dir: ArrayLike<number>, mag: number, bv: number) {
    this.pos.setXYZ(i, dir[0], dir[1], dir[2]); this.mag.setX(i, mag); this.bv.setX(i, bv);
    this.pos.needsUpdate = true; this.mag.needsUpdate = true; this.bv.needsUpdate = true;
  }
  /** 点亮几颗星（星表序号 → 0…1）；不在里面的都还原 */
  highlight(map: Map<number, number> | null) {
    this.hi.fill(0);
    if (map) for (const [s, v] of map) this.hi[s + StarLayer.NP] = v;
    this.hiAttr.needsUpdate = true;
  }
  highlightPlanet(i: number, v: number) { this.hi[i] = v; this.hiAttr.needsUpdate = true; }
}

// ———————————————————————————— 连线、引线与流星 ————————————————————————————
const LINE_V = /* glsl */ `
attribute vec3 aA; attribute vec3 aB; attribute vec2 aC; attribute float aId; attribute float aSeed;
${SKY_V_HEAD}
uniform sampler2D tAlpha; uniform float uN; uniform vec4 uLn; uniform vec4 uView;
varying vec2 vUv; varying float vA; varying float vHead; varying float vKind; varying float vSeed; varying float vLen; varying float vEl;
void main() {
  vec4 al = texture2D(tAlpha, vec2((aId + 0.5) / uN, 0.5));
  vA = al.r * uLn.w; vHead = al.g; vKind = al.a;
  vec3 a = normalize(uM * aA), b = normalize(uM * aB);
  vec4 pa = skyClip(a), pb = skyClip(b);
  // 没点着的星官：只在画面当中那一片淡淡地显，往四边淡下去（不满天都是线）
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  if (vKind < 0.25 && al.b < 0.5) vA *= smoothstep(0.62, 0.93, dot(normalize(a + b), fwd));
  if (vA < 0.002 || pa.w < 0.05 || pb.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 res = 0.5 / uView.xy;
  vec2 sa = pa.xy / pa.w * res, sb = pb.xy / pb.w * res;
  vec2 dir = sb - sa; float len = length(dir); dir /= max(len, 1e-4);
  vec2 nrm = vec2(-dir.y, dir.x);
  // 两头空出一点，别碰着星点（流星不空）
  float gap = vKind > 0.75 ? 0.0 : min(uLn.y * uSt.z, len * 0.28);
  vec2 s0 = sa + dir * gap, s1 = sb - dir * gap;
  float wd = uLn.x * uSt.z * (vKind > 0.75 ? 0.6 + 1.6 * al.b : 0.85 + 0.85 * al.b);
  vec2 s = mix(s0, s1, aC.x) + nrm * aC.y * wd * 0.5;
  gl_Position = vec4(s / res, 0.0, 1.0);
  vUv = aC; vSeed = aSeed; vLen = max(len - 2.0 * gap, 1.0) / uSt.z;
  vEl = mix(a.y, b.y, aC.x);
}
`;
const LINE_F = /* glsl */ `
${SEEN_GLSL}
uniform vec3 uLight; uniform float uTime;
varying vec2 vUv; varying float vA; varying float vHead; varying float vKind; varying float vSeed; varying float vLen; varying float vEl;
float hh(float x) { return fract(sin(x * 91.3458 + vSeed * 47.23) * 43758.5453); }
void main() {
  if (!onSky()) discard;
  float across = abs(vUv.y), along = vUv.x;
  float a;
  if (vKind > 0.75) {
    // 流星：头在 vHead，身后一道越来越淡、越来越细的痕
    float tail = clamp(1.0 - (vHead - along) / 0.42, 0.0, 1.0) * step(along, vHead);
    float w = mix(0.15, 1.0, tail);
    a = vA * smoothstep(w, w * 0.2, across) * tail * tail;
  } else if (vKind > 0.25) {
    // 引线：一点一点的虚线，慢慢往前走（指给人看「顺着这里找过去」）
    float d = fract(along * vLen / 9.0 - uTime * 0.6);
    a = vA * smoothstep(0.9, 0.3, across) * smoothstep(0.5, 0.2, abs(d - 0.5)) * smoothstep(0.0, 0.08, along);
  } else {
    // 一笔：两头收、中间略重；顺着笔走的方向一段一段深浅不一（飞白）
    float press = smoothstep(0.0, 0.18, along) * smoothstep(1.0, 0.8, along);
    float w = mix(0.45, 1.0, press);
    float seg = floor(along * vLen / 5.0);
    float dry = 0.62 + 0.38 * mix(hh(seg), hh(seg + 1.0), fract(along * vLen / 5.0));
    a = vA * smoothstep(w, w * 0.3, across) * mix(0.55, 1.0, press) * dry;
  }
  a *= smoothstep(0.0, 0.07, vEl);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uLight, a);
}
`;

/** 流星、引线各有几个槽 */
const METEORS = 4, GUIDES = 2;
export class LineLayer {
  mesh: THREE.Mesh;
  /**
   * 一格一样东西：先是各星官，再是引线、流星。r 显隐、g 流星头走到哪、b 粗细（星官：点着的描粗；流星：粗细）、a 种类（0 星官，128 引线，255 流星）
   */
  private tex: THREE.DataTexture; private px: Uint8Array;
  private cur: Float32Array; private goal: Float32Array; private rate: Float32Array;
  private extra: { a: THREE.BufferAttribute; b: THREE.BufferAttribute; first: number };
  private mt: Array<{ t: number; dur: number; on: boolean; w: number }> = [];
  private nA: number; private dirty = true;
  constructor(data: SkyData) {
    const A = data.asterisms, S = data.stars.dir, segs: Array<[number, number, number]> = [];
    for (const a of A) for (let k = 0; k + 1 < a.segs.length; k += 2) segs.push([a.segs[k], a.segs[k + 1], a.i]);
    this.nA = A.length;
    const W = 512, n = A.length + GUIDES + METEORS;
    if (n > W) throw new Error('星官太多');
    const total = segs.length + GUIDES + METEORS, nv = total * 4;
    const aA = new Float32Array(nv * 3), aB = new Float32Array(nv * 3), aC = new Float32Array(nv * 2), aId = new Float32Array(nv), aSeed = new Float32Array(nv);
    const idx: number[] = [];
    const put = (s: number, A3: ArrayLike<number>, B3: ArrayLike<number>, id: number) => {
      for (let c = 0; c < 4; c++) {
        const v = s * 4 + c;
        aA.set([A3[0], A3[1], A3[2]], v * 3); aB.set([B3[0], B3[1], B3[2]], v * 3);
        aC[v * 2] = c < 2 ? 0 : 1; aC[v * 2 + 1] = c % 2 ? 1 : -1;
        aId[v] = id; aSeed[v] = (s * 0.6180339) % 1;
      }
      idx.push(s * 4, s * 4 + 1, s * 4 + 2, s * 4 + 2, s * 4 + 1, s * 4 + 3);
    };
    segs.forEach(([p, q, id], s) => put(s, [S[p * 3], S[p * 3 + 1], S[p * 3 + 2]], [S[q * 3], S[q * 3 + 1], S[q * 3 + 2]], id));
    for (let k = 0; k < GUIDES + METEORS; k++) put(segs.length + k, [0, 0, 1], [0, 0.01, 1], A.length + k);
    for (let m = 0; m < METEORS; m++) this.mt.push({ t: 0, dur: 1, on: false, w: 1 });
    const g = new THREE.BufferGeometry();
    const atA = new THREE.BufferAttribute(aA, 3), atB = new THREE.BufferAttribute(aB, 3);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    g.setAttribute('aA', atA); g.setAttribute('aB', atB); g.setAttribute('aC', new THREE.BufferAttribute(aC, 2));
    g.setAttribute('aId', new THREE.BufferAttribute(aId, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.extra = { a: atA, b: atB, first: segs.length * 4 };
    this.px = new Uint8Array(W * 4);
    this.tex = new THREE.DataTexture(this.px, W, 1, THREE.RGBAFormat);
    this.tex.colorSpace = THREE.NoColorSpace; this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter; this.tex.needsUpdate = true;
    this.cur = new Float32Array(A.length + GUIDES); this.goal = new Float32Array(A.length + GUIDES); this.rate = new Float32Array(A.length + GUIDES).fill(1.6);
    for (let k = 0; k < GUIDES; k++) this.px[(A.length + k) * 4 + 3] = 128;
    for (let m = 0; m < METEORS; m++) this.px[(A.length + GUIDES + m) * 4 + 3] = 255;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...SU, uTime: U.uTime, uLight: U.uLight, tDepth: U.tDepth, uView: U.uView, tAlpha: { value: this.tex }, uN: { value: W }, uLn: { value: new THREE.Vector4(1.15, 7, 0, 1) } },
      vertexShader: LINE_V, fragmentShader: LINE_F, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.layers.set(FX_LAYER); this.mesh.frustumCulled = false; this.mesh.renderOrder = -19; this.mesh.name = '星官连线'; this.mesh.visible = false;
  }
  /** 一个星官的连线显到几成（0…1）；rate 是每秒走多少；bold 描得粗一些（点着的那一个） */
  set(i: number, alpha: number, rate = 1.6, bold = false) {
    if (i < 0 || i >= this.nA) return;
    this.goal[i] = alpha; this.rate[i] = rate;
    const b = bold ? 255 : 0; if (this.px[i * 4 + 2] !== b) { this.px[i * 4 + 2] = b; this.dirty = true; }
  }
  /** 所有星官一起 */
  setAll(alpha: number, rate = 1.2) { for (let i = 0; i < this.nA; i++) this.set(i, alpha, rate, false); }
  get(i: number) { return this.cur[i] ?? 0; }
  /** 整体再乘一个数（夜、晴） */
  set master(v: number) { (this.mesh.material as THREE.ShaderMaterial).uniforms.uLn.value.w = v; }
  private seg(slot: number, a: ArrayLike<number>, b: ArrayLike<number>) {
    const { a: A, b: B, first } = this.extra;
    for (let c = 0; c < 4; c++) { A.setXYZ(first + slot * 4 + c, a[0], a[1], a[2]); B.setXYZ(first + slot * 4 + c, b[0], b[1], b[2]); }
    A.needsUpdate = true; B.needsUpdate = true;
  }
  /** 引线 k（0、1）：从 a 到 b（J2000 方向）的一道走动的虚线；alpha 0 收起 */
  guide(k: number, a: ArrayLike<number> | null, b: ArrayLike<number> | null, alpha = 0.6) {
    if (k < 0 || k >= GUIDES) return;
    if (a && b) this.seg(k, a, b);
    this.goal[this.nA + k] = a && b ? alpha : 0; this.rate[this.nA + k] = 1.4;
  }
  /** 一颗流星：从 a 划到 b（J2000 方向），dur 秒；w 粗细（0…1） */
  meteor(a: ArrayLike<number>, b: ArrayLike<number>, dur: number, w = 0.5): boolean {
    const k = this.mt.findIndex((m) => !m.on);
    if (k < 0) return false;
    const m = this.mt[k];
    m.on = true; m.t = 0; m.dur = dur; m.w = w;
    this.seg(GUIDES + k, a, b);
    return true;
  }
  get meteors() { return this.mt.some((m) => m.on); }
  update(dt: number) {
    const nF = this.nA + GUIDES;
    let any = false;
    for (let i = 0; i < nF; i++) {
      const c = this.cur[i], g = this.goal[i];
      if (c !== g) { const s = this.rate[i] * dt; this.cur[i] = Math.abs(g - c) <= s ? g : c + Math.sign(g - c) * s; this.px[i * 4] = Math.round(this.cur[i] * 255); this.dirty = true; }
      if (this.cur[i] > 0.002) any = true;
    }
    for (let k = 0; k < METEORS; k++) {
      const m = this.mt[k], o = (nF + k) * 4;
      if (!m.on) { if (this.px[o]) { this.px[o] = 0; this.dirty = true; } continue; }
      m.t += dt;
      const u = m.t / m.dur;
      if (u >= 1.35) { m.on = false; this.px[o] = 0; this.dirty = true; continue; }
      // 头走得先快后慢；头过了终点，尾巴还要淡一会儿
      const head = Math.min(1, 1 - (1 - Math.min(1, u)) ** 1.6), fade = u < 1 ? Math.min(1, u * 5) : Math.max(0, 1 - (u - 1) / 0.35);
      this.px[o] = Math.round(fade * 230); this.px[o + 1] = Math.round(head * 255); this.px[o + 2] = Math.round(m.w * 255);
      this.dirty = true; any = true;
    }
    if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; }
    this.mesh.visible = any;
  }
}

// ———————————————————————————— 星官名 ————————————————————————————
const LABEL_V = /* glsl */ `
attribute vec3 aDir; attribute vec2 aCorner; attribute vec2 aUv; attribute float aSlot;
${SKY_V_HEAD}
uniform float uLabA[16]; uniform vec4 uView;
varying vec2 vUv; varying float vA;
void main() {
  vec3 d = normalize(uM * aDir);
  vec4 p = skyClip(d);
  vA = uLabA[int(aSlot)] * smoothstep(0.0, 0.08, d.y);
  if (vA < 0.003 || p.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 res = 0.5 / uView.xy;
  vec2 s = p.xy / p.w * res + aCorner * uSt.z;
  gl_Position = vec4(s / res, 0.0, 1.0);
  vUv = aUv;
}
`;
const LABEL_F = /* glsl */ `
uniform sampler2D tAtlas; uniform vec3 uLight; uniform vec3 uZhu;
varying vec2 vUv; varying float vA;
void main() {
  vec4 t = texture2D(tAtlas, vUv);
  // 白的是字，红的是那一点朱砂
  float zhu = clamp((t.r - t.g) * 2.0, 0.0, 1.0);
  vec3 c = mix(uLight, uZhu, zhu);
  float a = t.a * vA * mix(0.86, 1.0, zhu);
  if (a < 0.003) discard;
  gl_FragColor = vec4(c, a);
}
`;
/** 一格多大（画布像素；按两倍的 CSS 像素画，屏上按像素比缩放） */
const SLOT_W = 256, SLOT_H = 72, COLS = 4, ROWS = 4, SLOTS = COLS * ROWS, AT = 2;
export interface LabelOpts { sub?: string; /** 字在锚点的哪边：右（默认）或左、上 */ side?: 'right' | 'left' | 'up'; /** 显到几成 */ alpha?: number; /** 大一号（星官名用大的，星名用小的） */ big?: boolean }
export class LabelLayer {
  mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement | null = null; private g: CanvasRenderingContext2D | null = null;
  private tex: THREE.CanvasTexture | THREE.DataTexture;
  private slots: Array<{ key: string; a: number; goal: number; t: number; ready: boolean; gen: number; text: string }> = [];
  private aDir: THREE.BufferAttribute; private aCorner: THREE.BufferAttribute;
  private alpha = new Float32Array(SLOTS);
  constructor() {
    const nv = SLOTS * 4, g = new THREE.BufferGeometry();
    const dir = new Float32Array(nv * 3), corner = new Float32Array(nv * 2), uv = new Float32Array(nv * 2), slot = new Float32Array(nv), idx: number[] = [];
    for (let s = 0; s < SLOTS; s++) {
      const cx = (s % COLS) / COLS, cy = Math.floor(s / COLS) / ROWS;
      for (let c = 0; c < 4; c++) {
        const v = s * 4 + c, x = c % 2, y = c < 2 ? 0 : 1;
        dir[v * 3 + 2] = 1; slot[v] = s;
        // uv：画布的 y 朝下，贴图的 v 朝上（flipY）
        uv[v * 2] = cx + x / COLS; uv[v * 2 + 1] = 1 - (cy + y / ROWS);
      }
      idx.push(s * 4, s * 4 + 2, s * 4 + 1, s * 4 + 1, s * 4 + 2, s * 4 + 3);
      this.slots.push({ key: '', a: 0, goal: 0, t: 0, ready: false, gen: 0, text: '' });
    }
    this.aDir = new THREE.BufferAttribute(dir, 3); this.aCorner = new THREE.BufferAttribute(corner, 2);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    g.setAttribute('aDir', this.aDir); g.setAttribute('aCorner', this.aCorner);
    g.setAttribute('aUv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aSlot', new THREE.BufferAttribute(slot, 1));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas'); this.canvas.width = SLOT_W * COLS; this.canvas.height = SLOT_H * ROWS;
      this.g = this.canvas.getContext('2d');
      const t = new THREE.CanvasTexture(this.canvas);
      t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter;
      this.tex = t;
    } else this.tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...SU, uTime: U.uTime, uLight: U.uLight, uView: U.uView, tAtlas: { value: this.tex }, uLabA: { value: this.alpha }, uZhu: { value: new THREE.Color(0.86, 0.36, 0.27) } },
      vertexShader: LABEL_V, fragmentShader: LABEL_F, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.layers.set(FX_LAYER); this.mesh.frustumCulled = false; this.mesh.renderOrder = -18; this.mesh.name = '星官名'; this.mesh.visible = false;
  }
  /**
   * 在天上 dir（J2000 方向）旁写一个名字。key 相同的复用那一格。字体到了再出来。
   */
  show(key: string, text: string, dir: ArrayLike<number>, o: LabelOpts = {}) {
    let s = this.slots.findIndex((x) => x.key === key);
    // 没有这一格，或这一格换了字（点了另一处）：写上新字，从淡里出来
    const sig = text + '|' + (o.sub ?? '');
    if (s < 0 || this.slots[s].text !== sig) {
      if (s < 0) {
        // 找一格空的；没有就挤掉最淡的那一格
        s = this.slots.findIndex((x) => x.goal === 0 && x.a < 0.01);
        if (s < 0) { let m = 9; this.slots.forEach((x, i) => { if (x.goal + x.a < m) { m = x.goal + x.a; s = i; } }); }
      }
      const sl = this.slots[s];
      sl.key = key; sl.a = 0; sl.ready = false; sl.gen++; sl.text = sig;
      const gen = sl.gen;
      this.place(s, dir, o);
      void fontsReady(text + (o.sub ?? ''), ['LXGW WenKai']).then(() => {
        if (this.slots[s].gen !== gen) return;
        this.paint(s, text, o);
        this.slots[s].ready = true;
      });
    } else this.place(s, dir, o);
    this.slots[s].goal = o.alpha ?? 1;
  }
  hide(key: string) { const s = this.slots.find((x) => x.key === key); if (s) s.goal = 0; }
  hideAll(prefix = '') { for (const s of this.slots) if (s.key.startsWith(prefix)) s.goal = 0; }
  has(key: string) { const s = this.slots.find((x) => x.key === key); return !!s && s.goal > 0; }
  private place(s: number, dir: ArrayLike<number>, o: LabelOpts) {
    // 一格在屏上占 SLOT_W/AT × SLOT_H/AT 个 CSS 像素；字从格的左边起，左边留一点画朱点
    const w = SLOT_W / AT, h = SLOT_H / AT, side = o.side ?? 'right';
    const ox = side === 'left' ? -w - 6 : side === 'up' ? -w * 0.18 : 7, oy = side === 'up' ? 10 : -h * 0.62;
    for (let c = 0; c < 4; c++) {
      const v = s * 4 + c, x = c % 2, y = c < 2 ? 0 : 1;
      this.aDir.setXYZ(v, dir[0], dir[1], dir[2]);
      // 屏上 y 朝上：格子的上沿在 oy + h
      this.aCorner.setXY(v, ox + x * w, oy + (1 - y) * h);
    }
    this.aDir.needsUpdate = true; this.aCorner.needsUpdate = true;
  }
  private paint(s: number, text: string, o: LabelOpts) {
    const g = this.g; if (!g) return;
    const x0 = (s % COLS) * SLOT_W, y0 = Math.floor(s / COLS) * SLOT_H;
    g.clearRect(x0, y0, SLOT_W, SLOT_H);
    g.save();
    g.beginPath(); g.rect(x0, y0, SLOT_W, SLOT_H); g.clip();
    const big = o.big !== false, fs = (big ? 15 : 12.5) * AT, sub = o.sub;
    const left = o.side === 'left';
    g.textBaseline = 'alphabetic';
    g.font = `500 ${fs}px ${KAI}`;
    const tw = Math.min(SLOT_W - 20 * AT, g.measureText(text).width);
    const ty = y0 + (sub ? SLOT_H * 0.5 : SLOT_H * 0.66);
    const tx = left ? x0 + SLOT_W - 12 * AT - tw : x0 + 12 * AT;
    // 字的底下垫一层极淡的夜色，免得压在亮星、银河上读不出
    g.shadowColor = 'rgba(0, 0, 0, 0.55)'; g.shadowBlur = 5 * AT;
    g.fillStyle = '#fff';
    g.fillText(text, tx, ty, SLOT_W - 20 * AT);
    if (sub) { g.font = `400 ${10.5 * AT}px ${KAI}`; g.fillStyle = 'rgba(255,255,255,0.78)'; g.fillText(sub, tx, ty + 14 * AT, SLOT_W - 20 * AT); }
    // 一点朱砂：在名字前头
    g.shadowBlur = 0;
    g.fillStyle = '#f00';
    const dx = left ? tx + tw + 6.5 * AT : tx - 6.5 * AT;
    g.beginPath(); g.arc(dx, ty - fs * 0.34, 2.4 * AT, 0, Math.PI * 2); g.fill();
    g.restore();
    (this.tex as THREE.CanvasTexture).needsUpdate = true;
  }
  update(dt: number) {
    let any = false;
    for (let s = 0; s < SLOTS; s++) {
      const sl = this.slots[s], goal = sl.ready ? sl.goal : 0;
      sl.a += (goal - sl.a) * Math.min(1, dt * (goal > sl.a ? 2.2 : 3.2));
      if (sl.a < 0.002 && goal === 0) sl.a = 0;
      this.alpha[s] = sl.a;
      if (sl.a > 0) any = true;
    }
    this.mesh.visible = any;
  }
}
