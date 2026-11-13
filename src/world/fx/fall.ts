/**
 * 雨与雪。都是「绕着镜头的一盒」：位置在着色器里走、出了盒子从另一头回来，主线程里只攒一个「落了多远」。
 *
 *   雨 —— 斜斜的细墨线，一笔一笔，疏；近的长而淡，远的短。不是噪点。夜里是银白的线。
 *   雪 —— 慢、疏、软的白点（粉），各自左右荡着飘。
 *
 * 风向会变，所以不拿「速度 × 时间」去算位置，而是每帧把这一小步攒进 uShift。
 * 每一笔各有快慢（三档：0.75、1、1.25 倍），uShift 按盒子边长的四倍回绕，三档都正好对上，不会跳。
 */
import * as THREE from 'three';
import { FX_LAYER, FX_PARS, INK_PARS, U } from '../ink/ink';
import { mulberry32 } from '../core/rng';

const FALL_V = /* glsl */ `
${INK_PARS}
attribute vec4 aOff;
uniform vec4 uBox; uniform vec3 uShift; uniform vec4 uDir; uniform vec4 uView; uniform vec4 uLook;
varying vec2 vUv; varying vec2 vA; varying float vZ;
void main() {
  // 三档快慢
  float sp = 0.75 + 0.25 * floor(aOff.w * 2.999);
  vec3 p = aOff.xyz + uShift * sp;
  #ifdef FALL_SNOW
    // 各自飘：左右荡
    float ph = aOff.w * 43.0;
    p.xz += vec2(sin(uTime * (0.45 + 0.5 * aOff.w) + ph), cos(uTime * (0.38 + 0.4 * aOff.w) + ph * 1.7)) * uLook.y;
  #endif
  // 盒子跟着镜头走，里面的东西钉在世界上（出了一头从另一头回来）
  p.xz = mod(p.xz - cameraPosition.xz + uBox.x, 2.0 * uBox.x) - uBox.x + cameraPosition.xz;
  p.y = mod(p.y - cameraPosition.y + uBox.y * 0.42, uBox.y) - uBox.y * 0.42 + cameraPosition.y;
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam), hd = length(toCam.xz);
  float mPerPx = dist * 2.0 * uView.y / projectionMatrix[1][1];
  float fade = (1.0 - smoothstep(uBox.x * 0.72, uBox.x, hd)) * uDir.w;
  #ifdef FALL_SNOW
    float size = uBox.z * (0.6 + 0.8 * fract(aOff.w * 5.7));
    // 不小于一两个像素（太小的放大、调淡）；太近的大而淡
    float k = max(1.0, uBox.w * mPerPx / size);
    size *= k; fade *= smoothstep(0.5, 2.5, dist) / k;
    vec4 v = viewMatrix * vec4(p, 1.0);
    v.xy += position.xy * size;
    vZ = -v.z;
    gl_Position = projectionMatrix * v;
  #else
    // 一笔：顺着落的方向拉长，侧对着看画人；粗细按像素算（远处不细于一个多像素）
    vec3 fall = uDir.xyz;
    vec3 side = normalize(cross(fall, toCam));
    float len = uBox.z * (0.65 + 0.7 * fract(aOff.w * 7.3));
    float wid = max(uLook.x, uBox.w * mPerPx);
    vec3 w = p + fall * (position.y * len) + side * (position.x * wid);
    vec4 v = viewMatrix * vec4(w, 1.0);
    vZ = -v.z;
    gl_Position = projectionMatrix * v;
    // 近的淡（不然几笔粗线横在眼前）
    fade *= smoothstep(1.0, 8.0, dist) * (0.5 + 0.5 * fract(aOff.w * 3.1));
  #endif
  vUv = position.xy * 2.0;
  vA = vec2(fade * (1.0 - 0.85 * inkFogK(p)), aOff.w);
}
`;
const FALL_F = /* glsl */ `
${INK_PARS}
${FX_PARS}
uniform vec3 uInk;
varying vec2 vUv; varying vec2 vA; varying float vZ;
void main() {
  if (vA.x < 0.004) discard;
  #ifdef FALL_SNOW
    float r = length(vUv);
    // 一点软的粉。夜里是月色的白；白天带一点青灰——雪天地是白的、天也是白的，纯白的点落在上面看不见
    // （整片一个颜色：中间白、外面灰的话，落在白地上只剩一个圈）
    float a = (1.0 - smoothstep(0.3, 1.0, r)) * vA.x * fxSeen(vZ, 0.15);
    if (a < 0.006) discard;
    gl_FragColor = vec4(mix(uLight, uPaper * vec3(0.78, 0.83, 0.92), (0.5 + 0.4 * fract(vA.y * 9.7)) * (1.0 - uNight)), a);
  #else
    // 一笔：两头收，中间实；边是软的
    float y = vUv.y * 0.5 + 0.5;
    float a = (1.0 - abs(vUv.x)) * smoothstep(0.0, 0.3, y) * smoothstep(1.0, 0.55, y) * vA.x * fxSeen(vZ, 0.25);
    if (a < 0.006) discard;
    // 白天是淡墨的线，夜里是银白的
    gl_FragColor = vec4(mix(mix(uPaper, uInk, 0.72), uLight * 0.92, uNight), a);
  #endif
}
`;

export interface FallOpts {
  snow: boolean; count: number;
  /** 盒子的半径、高 */ R: number; H: number;
  /** 雨：一笔多长（米）；雪：一点多大（米） */ size: number;
  /** 最细 / 最小几个像素 */ px: number;
}
export class Fall {
  mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry; private mat: THREE.ShaderMaterial;
  private shift = new THREE.Vector3(); private dir = new THREE.Vector4(0, -1, 0, 0); private vel = new THREE.Vector3();
  private count: number; private snow: boolean; private R: number; private H: number;
  constructor(o: FallOpts) {
    this.count = Math.max(8, Math.round(o.count)); this.snow = o.snow; this.R = o.R; this.H = o.H;
    const quad = new THREE.PlaneGeometry(1, 1), g = (this.geo = new THREE.InstancedBufferGeometry());
    g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    const off = new Float32Array(this.count * 4), r = mulberry32(o.snow ? 77 : 31);
    for (let i = 0; i < this.count; i++) { off[i * 4] = (r() * 2 - 1) * o.R; off[i * 4 + 1] = r() * o.H; off[i * 4 + 2] = (r() * 2 - 1) * o.R; off[i * 4 + 3] = r(); }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      defines: o.snow ? { FALL_SNOW: 1 } : {},
      uniforms: {
        ...U,
        uBox: { value: new THREE.Vector4(o.R, o.H, o.size, o.px) },
        uShift: { value: this.shift }, uDir: { value: this.dir },
        /** x 雨线最细多少米；y 雪左右荡多远 */
        uLook: { value: new THREE.Vector4(0.004, 0.32, 0, 0) },
      },
      vertexShader: FALL_V, fragmentShader: FALL_F,
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.layers.set(FX_LAYER);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = o.snow ? 'snow' : 'rain';
  }
  get tris() { return this.geo.instanceCount * 2; }
  /** amount：下得多大（0…1）；wind、dir：风 */
  update(dt: number, amount: number, wind: number, dir: THREE.Vector2) {
    const g = this.geo;
    if (amount < 0.012) { g.instanceCount = 0; return; }
    // 下得小：笔数少，也淡一些
    g.instanceCount = Math.max(1, Math.round(this.count * Math.min(1, 0.25 + 0.75 * amount)));
    const v = this.vel;
    if (this.snow) v.set(dir.x * wind * 4.5, -0.85, dir.y * wind * 4.5);
    else v.set(dir.x * (0.6 + wind * 12), -9, dir.y * (0.6 + wind * 12));
    const s = this.shift, wx = this.R * 8, wy = this.H * 4;
    s.x = (s.x + v.x * dt) % wx; s.y = (s.y + v.y * dt) % wy; s.z = (s.z + v.z * dt) % wx;
    const l = v.length() || 1;
    this.dir.set(v.x / l, v.y / l, v.z / l, Math.min(1, amount * 1.6) * (this.snow ? 0.92 : 0.5));
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
