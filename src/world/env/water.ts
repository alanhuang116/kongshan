/**
 * 水。水在画里是留白：浅处透出水底，深处一片空明；岸边积一道水痕，水面上只有几笔水纹。
 * 它画在勾完线的画面之上（后画的一层），自己去比深度——知道这一处水有多深，才能在岸边淡进去。
 * 网格的 uv 以米计：u 横过水面，v 顺着水流。
 */
import * as THREE from 'three';
import { FX_LAYER, FX_PARS, INK_PARS, PIG, U, type RGB } from '../ink/ink';

const WATER_V = /* glsl */ `
varying vec3 vW; varying vec2 vUv; varying float vZ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vUv = uv;
  vec4 v = viewMatrix * w;
  vZ = -v.z;
  gl_Position = projectionMatrix * v;
}
`;
const WATER_F = /* glsl */ `
${INK_PARS}
${FX_PARS}
uniform vec3 uInk; uniform vec3 uPig; uniform vec4 uW; uniform vec4 uRing[12];
varying vec3 vW; varying vec2 vUv; varying float vZ;
void main() {
  float d = texture2D(tDepth, gl_FragCoord.xy * uView.xy).x;
  float zn = d * 2.0 - 1.0;
  float scene = 2.0 * uView.z * uView.w / (uView.w + uView.z - zn * (uView.w - uView.z));
  float diff = scene - vZ;
  if (diff < 0.0) discard;
  vec3 V = normalize(cameraPosition - vW);
  // 这一处的水深（约）
  float wd = diff * max(V.y, 0.06);
  float shore = smoothstep(0.0, 0.05, wd), deep = smoothstep(0.0, uW.w, wd);
  float n = in3(vec3(vW.xz * 0.3, uTime * 0.04));
  vec3 c = mix(uPaper, uMist, 0.55) * pow(uPig, vec3(uW.x * (0.45 + 0.75 * deep) * (0.75 + 0.5 * n)));
  float a = shore * mix(0.28, 0.94, deep);
  // 岸边一道水痕
  float edge = smoothstep(0.0, 0.015, wd) * (1.0 - smoothstep(0.02, 0.11, wd));
  c *= 1.0 - 0.2 * edge; a = max(a, edge * 0.55);
  // 水纹：顺着水流拉长的几笔，成片出现
  float fl = vUv.y - uTime * uW.y;
  float l1 = in3(vec3(vUv.x * 4.2, fl * 0.42, 2.0 + uTime * 0.05));
  float l2 = in3(vec3(vUv.x * 8.5 + 4.0, fl * 0.95, 7.0 - uTime * 0.04));
  float pat = smoothstep(0.4, 0.72, in3(vec3(vUv.x * 0.5, fl * 0.1, 11.0)));
  float w1 = fwidth(l1) * 1.5 + 0.012, w2 = fwidth(l2) * 1.5 + 0.012;
  float rip = (smoothstep(w1, 0.0, abs(l1 - 0.5)) * 0.75 + smoothstep(w2, 0.0, abs(l2 - 0.5)) * 0.45) * pat;
  // 一圈圈荡开的涟漪（鱼、落花、雨点）：xy 中心，z 起的时刻，w 大小
  for (int i = 0; i < 12; i++) {
    float age = uTime - uRing[i].z;
    if (uRing[i].w > 0.0 && age > 0.0 && age < 5.0) {
      float r = distance(vW.xz, uRing[i].xy), R = age * 0.42 * uRing[i].w;
      float band = smoothstep(0.035, 0.0, abs(r - R)) + 0.6 * smoothstep(0.03, 0.0, abs(r - R * 0.62));
      rip += band * (1.0 - age / 5.0) * 0.9;
    }
  }
  rip *= uW.z * shore * (1.0 - inkFogK(vW));
  // 白天是几笔淡墨，夜里是碎的月光
  c *= mix(vec3(1.0), uInk + 0.42, clamp(rip, 0.0, 1.0) * (1.0 - uNight));
  c = mix(c, uLight, clamp(rip, 0.0, 1.0) * uNight * 0.55);
  a = max(a, rip * 0.5);
  c = mix(c, uMist, inkFogK(vW));
  gl_FragColor = vec4(c, a);
}
`;

export interface WaterOpts {
  /** 水色（一层的透过色）与浓度 */
  pig?: RGB; dens?: number;
  /** 水流的快慢（米/秒，沿 v） */
  flow?: number;
  /** 水纹的多少 */
  ripple?: number;
  /** 多深就看不见底了（米） */
  deep?: number;
}
export function waterMat(o: WaterOpts = {}): THREE.ShaderMaterial {
  const p = o.pig ?? PIG.qing;
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uPig: { value: new THREE.Color(p[0], p[1], p[2]) },
      uW: { value: new THREE.Vector4(o.dens ?? 0.45, o.flow ?? 0.35, o.ripple ?? 1, o.deep ?? 0.7) },
      uRing: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, -99, 0)) },
    },
    vertexShader: WATER_V, fragmentShader: WATER_F,
    transparent: true, depthTest: false, depthWrite: false,
  });
}
/** 把一张水面网格放进后画的那一层 */
export function waterMesh(geo: THREE.BufferGeometry, mat: THREE.ShaderMaterial): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.layers.set(FX_LAYER);
  m.renderOrder = -10;
  m.name = 'water';
  return m;
}
/** 在水面上起一圈涟漪 */
let ringAt = 0;
export function ripple(mat: THREE.ShaderMaterial, x: number, z: number, size = 1) {
  const r = mat.uniforms.uRing.value as THREE.Vector4[];
  r[ringAt++ % r.length].set(x, z, U.uTime.value, size);
}
