/**
 * 天：一个跟着镜头走的大球，里面画——
 *   天色（地平到天顶的渐变）、日晕与日轮、月（按农历的盈亏）、星、流云；
 *   还有最远的几重山：只是天边一层层的剪影，越远越淡，山脚没在雾里（水墨画里「远山无皴」的画法）。
 * 近处的山是真的地形，会挡在这些剪影前面。
 */
import * as THREE from 'three';
import { shared } from '../core/mats';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  // 只取镜头的朝向、不取位置：天永远以镜头为中心
  vec4 p = vec4(mat3(viewMatrix) * position * 50.0, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uSunColor, uMoonColor, uCloudLit, uCloudShade, uRidgeNear, uGround;
uniform vec3 uSunPos, uMoonDir;
uniform vec3 uFogColor, uFogSun, uSunDir;
uniform float uSunDisk, uMoonPhase, uMoonOn, uStars, uCloud, uTime, uRidge, uHaze, uEnv;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
float fbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 fogDir = mix(uFogColor, uFogSun, pow(max(dot(normalize(vec3(d.x, max(d.y, 0.0), d.z)), uSunDir), 0.0), 5.0) * 0.8);

  // 天色
  float t = pow(clamp(h, 0.0, 1.0), 0.42);
  vec3 col = mix(uHorizon, uZenith, t);

  // 星
  if (uStars > 0.01 && h > -0.02) {
    vec3 p = d * 170.0; vec3 ip = floor(p); vec3 fp = fract(p) - 0.5;
    float r = hash3(ip);
    float tw = 0.75 + 0.25 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
    float s = step(0.9965, r) * smoothstep(0.42, 0.0, length(fp)) * tw;
    vec3 p2 = d * 70.0; float r2 = hash3(floor(p2));
    s += step(0.9988, r2) * smoothstep(0.3, 0.0, length(fract(p2) - 0.5)) * 1.8;
    col += vec3(0.86, 0.9, 1.0) * s * uStars * smoothstep(0.0, 0.25, h) * 1.6;
  }

  // 日
  float sd = max(dot(d, uSunPos), 0.0);
  col += uSunColor * (pow(sd, 5.0) * 0.14 + pow(sd, 40.0) * 0.32 + pow(sd, 400.0) * 0.6) * uSunDisk;
  col += uSunColor * smoothstep(0.99925, 0.99965, sd) * 7.0 * uSunDisk;

  // 月：按盈亏照亮半边
  if (uMoonOn > 0.01) {
    vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir)), mu = cross(uMoonDir, mr);
    float R = 0.021;
    vec2 q = vec2(dot(d, mr), dot(d, mu)) / R;
    float rr = dot(q, q);
    float md = max(dot(d, uMoonDir), 0.0);
    col += uMoonColor * (pow(md, 60.0) * 0.10 + pow(md, 900.0) * 0.25) * uMoonOn;
    if (rr < 1.0 && dot(d, uMoonDir) > 0.0) {
      vec3 n = vec3(q, sqrt(1.0 - rr));
      float th = 6.2831853 * uMoonPhase;
      vec3 l = vec3(sin(th), 0.0, -cos(th));
      float lit = smoothstep(-0.02, 0.12, dot(n, l));
      float mare = 0.78 + 0.22 * fbm3(q * 2.2 + 3.0) - 0.16 * smoothstep(0.45, 0.7, fbm3(q * 1.3 + 9.0));
      vec3 mc = uMoonColor * (lit * mare * 2.6 + 0.035);
      col = mix(col, mc, smoothstep(1.0, 0.94, rr) * uMoonOn);
    }
  }

  // 云
  if (h > 0.0 && uCloud > 0.01) {
    vec2 p = d.xz / (h + 0.16);
    float c = fbm(p * 0.55 + vec2(uTime * 0.006, uTime * 0.0025));
    float c2 = fbm(p * 1.7 - vec2(uTime * 0.004, 0.0) + 5.0);
    float cov = smoothstep(1.0 - uCloud * 0.9, 1.25 - uCloud * 0.75, c * 0.75 + c2 * 0.4);
    float lit = smoothstep(0.2, 0.9, c2) * 0.6 + 0.4;
    vec3 cc = mix(uCloudShade, uCloudLit, lit) + uSunColor * pow(sd, 8.0) * 0.25 * uSunDisk;
    col = mix(col, cc, cov * smoothstep(0.0, 0.14, h) * 0.9);
  }

  // 远山：四重，最远的最淡
  if (uRidge > 0.01) {
    float az = atan(d.z, d.x);
    vec2 cs = vec2(cos(az), sin(az));
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float far = 1.0 - fi / 3.0;                       // 1 最远 … 0 最近
      vec2 q = cs * (2.2 + fi * 1.5) + fi * 13.7;
      float n = fbm(q) * 0.7 + (1.0 - abs(noise(q * 2.7 + 4.0) * 2.0 - 1.0)) * 0.22 + noise(q * 9.0) * 0.045;
      float top = mix(0.035, 0.075, far) + (n - 0.42) * mix(0.16, 0.115, far);
      // 寺后（北，-z）山高，寺前（南）开阔
      top += max(0.0, -cs.y) * mix(0.05, 0.035, far) - max(0.0, cs.x) * 0.012;
      float m = smoothstep(top + 0.0016, top - 0.0016, h);
      float into = clamp((top - h) / mix(0.05, 0.085, far), 0.0, 1.0);
      vec3 mc = mix(uRidgeNear, fogDir, mix(0.34, 0.86, far));
      mc = mix(mc, fogDir, pow(into, 0.8) * 0.94);        // 山脚没进雾里
      col = mix(col, mc, m * uRidge);
    }
  }

  // 地平线以下、贴近地平线的地方都是雾
  float f = smoothstep(0.075 * uHaze, -0.015, h);
  col = mix(col, fogDir, f);
  // 烘环境反射时：地平线以下是地面的颜色（朝下的面只该受到地面那点反光）
  col = mix(col, uGround, uEnv * smoothstep(0.02, -0.12, h));

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  mesh: THREE.Mesh;
  u = {
    uZenith: { value: new THREE.Color(0x5f93cf) },
    uHorizon: { value: new THREE.Color(0xdfe9f0) },
    uSunColor: { value: new THREE.Color(0xfff2df) },
    uMoonColor: { value: new THREE.Color(0xdfe6f2) },
    uCloudLit: { value: new THREE.Color(0xffffff) },
    uCloudShade: { value: new THREE.Color(0xb8c2cc) },
    uRidgeNear: { value: new THREE.Color(0x2c3a3e) },
    uGround: { value: new THREE.Color(0x30302c) },
    uEnv: { value: 0 },
    uSunPos: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0.4, 0.6, 0.6).normalize() },
    uSunDisk: { value: 1 },
    uMoonPhase: { value: 0.5 },
    uMoonOn: { value: 0 },
    uStars: { value: 0 },
    uCloud: { value: 0.35 },
    uRidge: { value: 1 },
    uHaze: { value: 1 },
    uTime: shared.uTime,
    uFogColor: shared.uFogColor,
    uFogSun: shared.uFogSun,
    uSunDir: shared.uSunDir,
  };
  constructor() {
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
  }
}
