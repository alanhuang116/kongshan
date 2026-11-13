/**
 * 远景里「罩在画上」的三样（都画在勾完线之后，自己去比深度）：
 *
 *   水 —— 伊水与泽里的积水。水是留白：比纸略亮略冷，夜里是一带月色；岸边按水深自己淡出去
 *         （所以它与近处的地、沙渚、河岸相接处是虚的），近处有几笔顺流的水纹，远水无波。
 *   瀑 —— 飞瀑与崖上的细泉：白练自上而下，往下散成几股，丝丝地走。
 *   云烟 —— 山腰的横云、峰脚的烟、瀑下的水气、崖顶聚着的云、村里的炊烟：一片片朝着看画人的软白，
 *         边是虚的，慢慢地走；碰到山石处自然淡掉。
 */
import * as THREE from 'three';
import { FX_LAYER, FX_PARS, INK_PARS, PIG, U, type RGB } from '../../ink/ink';

// —— 水 ——
const WATER_V = /* glsl */ `
attribute float aEdge;
varying vec3 vW; varying vec2 vUv; varying float vZ; varying float vE;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vUv = uv; vE = aEdge;
  vec4 v = viewMatrix * w;
  vZ = -v.z;
  gl_Position = projectionMatrix * v;
}
`;
const WATER_F = /* glsl */ `
${INK_PARS}
${FX_PARS}
uniform vec3 uInk; uniform vec3 uPig; uniform vec4 uW; uniform vec4 uGlowDir; uniform vec3 uGlowCol;
varying vec3 vW; varying vec2 vUv; varying float vZ; varying float vE;
void main() {
  float d = texture2D(tDepth, gl_FragCoord.xy * uView.xy).x;
  float zn = d * 2.0 - 1.0;
  float scene = 2.0 * uView.z * uView.w / (uView.w + uView.z - zn * (uView.w - uView.z));
  float diff = scene - vZ;
  if (diff < 0.0 || vE < 0.004) discard;
  vec3 ray = cameraPosition - vW;
  float dist = length(ray);
  vec3 V = ray / dist;
  // 这一处的水深（约）。斜着看时视线在水里走得长，按浅的算会忽明忽暗，所以给个下限
  float wd = diff * max(V.y, 0.08);
  float shore = smoothstep(0.0, 0.05, wd), deep = smoothstep(0.0, uW.w, wd);
  // 水色：留白
  vec3 c = mix(uPaper, uLight, uW.y) * pow(uPig, vec3(uW.x * (0.45 + 0.55 * deep)));
  float a = shore * mix(0.45, 0.97, deep) * smoothstep(0.0, 0.5, vE);
  // 岸边一道水痕
  float edge = smoothstep(0.0, 0.02, wd) * (1.0 - smoothstep(0.03, 0.2, wd));
  c *= 1.0 - 0.14 * edge;
  // 朝着日出日落那一边的水面带一点霞色（半江瑟瑟半江红）
  float gl = uGlowDir.w * pow(max(dot(normalize(-ray.xz), normalize(uGlowDir.xz + vec2(1e-5))), 0.0), 3.0) * smoothstep(40.0, 500.0, dist);
  c *= pow(uGlowCol, vec3(gl));
  // 水纹：近处几笔顺流的长线（远水无波）
  float nearK = (1.0 - smoothstep(50.0, 380.0, dist)) * uW.z;
  if (nearK > 0.003) {
    float fl = vUv.y - uTime * 0.5;
    float l1 = in3(vec3(vUv.x * 0.33, fl * 0.04, 2.0 + uTime * 0.03));
    float l2 = in3(vec3(vUv.x * 0.8 + 4.0, fl * 0.09, 7.0 - uTime * 0.02));
    float pat = smoothstep(0.3, 0.62, in3(vec3(vUv.x * 0.05, fl * 0.012, 11.0)));
    float w1 = fwidth(l1) * 1.5 + 0.008, w2 = fwidth(l2) * 1.5 + 0.008;
    float rip = (smoothstep(w1, 0.0, abs(l1 - 0.5)) * 0.7 + smoothstep(w2, 0.0, abs(l2 - 0.5)) * 0.4) * pat * nearK * shore;
    c *= mix(vec3(1.0), uInk + 0.48, clamp(rip, 0.0, 1.0) * 0.75 * (1.0 - uNight));
    c = mix(c, uLight, clamp(rip, 0.0, 1.0) * uNight * 0.4);
  }
  c = mix(c, uMist, inkFogK(vW));
  gl_FragColor = vec4(c, a);
}
`;
export interface FarWaterOpts { pig?: RGB; dens?: number; /** 比纸亮几成（0 纸色 … 1 粉白；夜里是月色） */ light?: number; /** 水纹的多少 */ ripple?: number; /** 多深就看不见底（米） */ deep?: number }
export function farWaterMat(o: FarWaterOpts = {}): THREE.ShaderMaterial {
  const p = o.pig ?? PIG.qing;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uPig: { value: new THREE.Color(p[0], p[1], p[2]) },
      uW: { value: new THREE.Vector4(o.dens ?? 0.12, o.light ?? 0.5, o.ripple ?? 1, o.deep ?? 0.2) },
      /** xyz 霞在哪一边（水平方向），w 多少；颜色 */
      uGlowDir: { value: new THREE.Vector4(1, 0, 0, 0) }, uGlowCol: { value: new THREE.Color(0.98, 0.8, 0.72) },
    },
    vertexShader: WATER_V, fragmentShader: WATER_F,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
}

// —— 瀑 ——
const FALL_V = /* glsl */ `
attribute vec4 aF;
varying vec3 vW; varying vec4 vF; varying float vZ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vF = aF;
  vec4 v = viewMatrix * w;
  vZ = -v.z;
  gl_Position = projectionMatrix * v;
}
`;
const FALL_F = /* glsl */ `
${INK_PARS}
${FX_PARS}
varying vec3 vW; varying vec4 vF; varying float vZ;
void main() {
  // vF：x 横过瀑面（-1…1），y 自顶往下走了几成，z 这一处瀑布多宽（米），w 自顶往下的里程（米）
  float dist = distance(vW, cameraPosition);
  float seen = fxSeen(vZ - 0.004 * dist - 1.5, 2.0 + 0.004 * dist);
  if (seen < 0.01) discard;
  // 丝：竖着拉长的疏密，往下走；越往下越散
  float sp = uTime * 16.0;
  float u = vF.x * vF.z * 0.5;
  float n1 = in3(vec3(u * 0.55, (vF.w - sp) * 0.035, vF.z));
  float n2 = in3(vec3(u * 1.7 + 3.0, (vF.w - sp * 1.3) * 0.09, 5.0));
  float st = n1 * 0.6 + n2 * 0.4;
  float spread = mix(0.25, 0.62, smoothstep(0.05, 0.9, vF.y));
  float veil = smoothstep(spread - 0.2, spread + 0.12, st + 0.35 * (1.0 - abs(vF.x)));
  float edge = 1.0 - smoothstep(0.5, 1.0, abs(vF.x) + (n2 - 0.5) * 0.5);
  // 顶上从崖口涌出来的一小段是实的；底下化进水气里
  float a = edge * mix(1.0, veil, smoothstep(0.0, 0.12, vF.y)) * (1.0 - smoothstep(0.86, 1.0, vF.y)) * smoothstep(0.0, 0.015, vF.y);
  // 细到不足一个像素的泉：淡一些，但别断
  a *= 0.94 * seen;
  if (a < 0.01) discard;
  vec3 c = mix(uLight, uMist, 0.25 + 0.35 * (1.0 - veil) + 0.3 * uNight);
  float fk = inkFogK(vW);
  c = mix(c, uMist, fk * 0.7);
  // 夜里只是一线微白
  gl_FragColor = vec4(c, a * (1.0 - fk * 0.55) * (1.0 - 0.45 * uNight));
}
`;
/** 攒瀑布：每条是顺着崖面往下的一条带（由上到下的点、各处的宽） */
export class FallGeo {
  private pos: number[] = []; private arg: number[] = []; private idx: number[] = [];
  /** pts 自上而下；wide 给每一处的宽（米）；side 是带子横着的方向（水平单位向量 x、z） */
  ribbon(pts: THREE.Vector3[], wide: (t: number) => number, side: [number, number]) {
    const n = pts.length, base = this.pos.length / 3;
    let len = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
      const t = i / (n - 1), w = wide(t);
      for (let k = 0; k < 3; k++) { const s = k - 1; this.pos.push(pts[i].x + side[0] * s * w * 0.5, pts[i].y, pts[i].z + side[1] * s * w * 0.5); this.arg.push(s, t, w, len); }
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < 2; k++) { const a = base + i * 3 + k, b = a + 3; this.idx.push(a, b, b + 1, a, b + 1, a + 1); }
  }
  get count() { return this.idx.length / 3; }
  build(): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aF', new THREE.Float32BufferAttribute(this.arg, 4));
    g.setIndex(this.idx);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: FALL_V, fragmentShader: FALL_F, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    m.layers.set(FX_LAYER); m.renderOrder = -6; m.name = '瀑';
    return m;
  }
}

// —— 云烟 ——
const PUFF_V = /* glsl */ `
uniform float uTime;
attribute vec4 aPos; attribute vec4 aArg;
varying vec3 vW; varying vec2 vQ; varying vec4 vA; varying float vZ;
void main() {
  // aPos：xyz 中心，w 宽；aArg：x 高，y 墨色（0 白 … 1 淡墨的云），z 各片不同的一个数，w 多少（0…1）
  vec3 c = aPos.xyz;
  // 慢慢地走（各片快慢不同），走出一段又回来
  c.x += sin(uTime * 0.013 + aArg.z * 6.28) * aPos.w * 0.07;
  vec3 toCam = cameraPosition - c;
  vec2 f = normalize(toCam.xz + vec2(1e-5));
  // 立着、横着朝向看画的人
  vec3 w = c + vec3(-f.y, 0.0, f.x) * (position.x * aPos.w) + vec3(0.0, position.y * aArg.x, 0.0);
  vW = w; vQ = position.xy * 2.0; vA = aArg;
  vec4 v = viewMatrix * vec4(w, 1.0);
  vZ = -v.z;
  gl_Position = projectionMatrix * v;
}
`;
const PUFF_F = /* glsl */ `
${INK_PARS}
${FX_PARS}
uniform vec4 uPuff;
varying vec3 vW; varying vec2 vQ; varying vec4 vA; varying float vZ;
void main() {
  float r = length(vQ);
  if (r >= 1.0 || vA.w < 0.004) discard;
  float dist = distance(vW, cameraPosition);
  // 团块：钉在世界里的疏密，慢慢地变
  vec3 q = vW * (2.6 / max(vA.x, 1.0));
  float n = in3(vec3(q.x + uTime * 0.02, q.y * 1.6 + vA.z * 9.0, q.z - uTime * 0.013)) * 0.62 + in3(vec3(q.x * 2.7 + 5.0, q.y * 3.4 - uTime * 0.03, q.z * 2.7)) * 0.38;
  float body = (1.0 - smoothstep(0.25, 1.0, r)) * smoothstep(0.22, 0.6, n + 0.55 * (1.0 - r));
  float a = body * vA.w * uPuff.x * fxSeen(vZ, max(4.0, vA.x * 0.35)) * smoothstep(uPuff.y, uPuff.z, dist);
  if (a < 0.006) discard;
  // 白的是烟；带墨的是聚着的云（底下深一些）
  vec3 c = uMist * pow(vec3(0.6, 0.61, 0.635), vec3(vA.y * (0.75 - 0.5 * vQ.y) * (0.6 + 0.8 * n)));
  gl_FragColor = vec4(c, a);
}
`;
export interface Puff { x: number; y: number; z: number; /** 宽、高（米） */ w: number; h: number; /** 墨色：0 白烟 … 1 淡墨的云 */ tone?: number; /** 多少（0…1） */ amount?: number }
/** 把许多片云烟并成一次绘制。near：从多远到多远渐渐显出来（太近的不罩） */
export function puffs(list: Puff[], o: { near?: [number, number] } = {}): THREE.Mesh {
  const quad = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute('position', quad.attributes.position);
  const n = list.length, P = new Float32Array(n * 4), A = new Float32Array(n * 4);
  list.forEach((p, i) => { P.set([p.x, p.y, p.z, p.w], i * 4); const hv = Math.sin(i * 12.9898 + p.x * 0.013) * 43758.5453; A.set([p.h, p.tone ?? 0, hv - Math.floor(hv), p.amount ?? 1], i * 4); });
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(P, 4));
  g.setAttribute('aArg', new THREE.InstancedBufferAttribute(A, 4));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, /** x 整体的多少，y…z 从多远到多远显出来 */ uPuff: { value: new THREE.Vector4(1, o.near?.[0] ?? 120, o.near?.[1] ?? 320, 0) } },
    vertexShader: PUFF_V, fragmentShader: PUFF_F, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.layers.set(FX_LAYER); m.frustumCulled = false; m.renderOrder = 4; m.name = '云烟';
  return m;
}
