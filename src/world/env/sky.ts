/**
 * 天与远山。天就是纸：高处罩一层极淡的色，云是留出来的白，近地平处化成雾。
 * 远山（东南望去的嵩山：太室在东、少室偏南）是画在天上的几重淡墨——越远越淡，山脚化在雾里；四围是一带低冈。
 * 日是一点朱，月是留出来的一轮白，夜里有星；北斗七星按真实的赤经赤纬与当地的时刻摆（所以春天黄昏斗柄朝东）。
 */
import * as THREE from 'three';
import { INK_PARS, PIG, U, type RGB } from '../ink/ink';

const SKY_V = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  // 贴在最远处：别的东西画过的地方就不再画天
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}
`;
const SKY_F = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${INK_PARS}
uniform vec3 uSkyPig; uniform vec4 uSky;
uniform vec3 uGlowPig; uniform vec4 uGlow;
uniform vec3 uSunDir; uniform vec4 uSun;
uniform vec3 uMoonDir; uniform vec4 uMoon;
uniform vec3 uMtPig; uniform vec4 uMt;
uniform vec3 uStar[8];
varying vec3 vDir;
float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
float fb2(vec2 p) { return n2(p) * 0.5 + n2(p * 2.03 + 3.1) * 0.25 + n2(p * 4.1 + 7.7) * 0.125 + n2(p * 8.3 + 1.3) * 0.0625; }
// 山脊线：绕着地平一圈取噪声（首尾自然相接），尖的是峰
float ridge(vec2 u, float R, float s) {
  float a = 1.0 - abs(n2(u * R + s) * 2.0 - 1.0);
  float b = 1.0 - abs(n2(u * R * 2.1 + s * 1.7 + 3.0) * 2.0 - 1.0);
  float c = 1.0 - abs(n2(u * R * 4.7 + s * 2.3 + 8.0) * 2.0 - 1.0);
  return a * a * 0.58 + b * b * 0.27 * (0.35 + a) + c * 0.11 * (0.3 + a * b) + n2(u * R * 13.0 + s) * 0.04;
}
// 一重山：h 山脊的高（仰角的正切），t 这一点的高，dens 山头的浓度；山脚淡进雾里
vec3 range(vec3 c, float t, float h, float dens, float foot) {
  float aa = fwidth(t) * 1.2 + 1e-5;
  float cover = smoothstep(h + aa, h - aa, t);
  float k = smoothstep(h - (h + 0.02) * foot, h, t);
  float d = dens * mix(0.0, 1.0, pow(k, 1.4));
  // 山头一道略深的边（一笔淡墨的水痕）
  d += dens * 0.22 * smoothstep(h - 0.004, h - 0.0008, t);
  return mix(c, uMist * pow(uMtPig, vec3(max(d, 0.0))), cover * uMt.x);
}
void main() {
  vec3 d = normalize(vDir);
  vec2 u = normalize(d.xz + vec2(1e-6, 0.0));
  float t = d.y / max(length(d.xz), 1e-4);
  float el = max(d.y, 0.0);
  // 天：高处一层淡色；云是没染到的地方
  float cl = fb2(d.xz / (d.y + 0.35) * 1.35 + vec2(uTime * 0.004, 0.0));
  float wash = uSky.x * pow(smoothstep(0.0, 0.85, el), 0.8) * (1.0 - uSky.y * smoothstep(0.42, 0.68, cl));
  wash += uSky.x * 0.55 * smoothstep(0.02, 0.5, el) * uSky.y * 0.25;
  vec3 c = mix(uMist, uPaper, smoothstep(0.0, 0.22, t)) * pow(uSkyPig, vec3(wash));
  // 霞：朝着日出日落那一边、贴近地平的一抹
  float gl = uGlow.w * pow(max(dot(u, normalize(uGlow.xz + vec2(1e-5))), 0.0), 2.0) * exp(-max(t, 0.0) * 4.5) * smoothstep(-0.02, 0.05, t);
  c *= pow(uGlowPig, vec3(gl));
  // 星
  if (uSky.z > 0.01) {
    vec2 sp = vec2(atan(d.x, d.z) * 34.0, asin(clamp(d.y, -1.0, 1.0)) * 34.0);
    vec2 ci = floor(sp), cf = fract(sp);
    float hs = h2(ci);
    vec2 o = vec2(h2(ci + 3.7), h2(ci + 9.1)) * 0.7 + 0.15;
    float st = step(0.9, hs) * smoothstep(0.075 * (0.5 + hs), 0.0, length(cf - o)) * smoothstep(0.03, 0.22, d.y) * (0.45 + 0.55 * h2(ci + 17.3));
    for (int i = 0; i < 8; i++) st = max(st, smoothstep(2.4e-5, 5.0e-6, 1.0 - dot(d, uStar[i])));
    c = mix(c, uLight, st * uSky.z);
  }
  // 月：留出来的一轮白，四周的夜色淡一圈
  if (uMoon.x > 0.0) {
    vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir)), mu = cross(uMoonDir, mr);
    vec2 q = vec2(dot(d, mr), dot(d, mu)) / uMoon.x;
    float rr = length(q), front = step(0.0, dot(d, uMoonDir));
    float ph = uMoon.y * 6.2831853, kx = cos(ph) * sqrt(max(0.0, 1.0 - q.y * q.y));
    float lit = ph < 3.14159 ? smoothstep(-0.04, 0.04, q.x - kx) : smoothstep(-0.04, 0.04, -kx - q.x);
    float disc = smoothstep(1.0, 0.94, rr) * front;
    c = mix(c, uLight, exp(-rr * rr * 0.22) * 0.22 * uMoon.z * front);
    c = mix(c, uLight * vec3(1.0, 0.99, 0.96), disc * lit * uMoon.z);
  }
  // 日：一点朱
  if (uSun.a > 0.0) {
    float sd = acos(clamp(dot(d, uSunDir), -1.0, 1.0)) / uSun.a;
    c = mix(c, c * mix(vec3(1.0), uSun.rgb, 0.35) + 0.05, exp(-sd * sd * 0.1) * 0.5);
    c = mix(c, uSun.rgb * mix(vec3(1.0), uPaper, 0.25), smoothstep(1.0, 0.86, sd) * 0.92);
  }
  // 远山三重
  if (uMt.x > 0.001) {
    // 天边最远的几重（立体的山在它们前面）：朝嵩山那一面高一些，淡得只剩一个影子
    float song = smoothstep(0.55, 0.98, dot(u, uMt.yz));
    // 正南（乾）天最空：天边那几重往正南压低
    float open = 1.0 - 0.55 * smoothstep(0.9, 1.0, dot(u, vec2(0.0, 1.0)));
    float h1 = (0.02 + (0.05 + 0.2 * song) * (0.3 + 0.7 * ridge(u, 6.0, 1.3))) * open;
    c = range(c, t, h1, 0.13 * uMt.w, 0.95);
    float h2r = (0.012 + (0.035 + 0.1 * song) * (0.3 + 0.7 * ridge(u, 9.0, 5.1))) * open;
    c = range(c, t, h2r, 0.24 * uMt.w, 0.9);
    float h3 = 0.006 + 0.03 * (0.35 + 0.65 * ridge(u, 13.0, 9.7));
    c = range(c, t, h3, 0.42 * uMt.w, 0.85);
  }
  c = mix(uMist, c, smoothstep(-0.012, 0.004, t));
  gl_FragColor = vec4(c, 1.0);
  gAux = vec4(0.5, 0.5, 0.0, 0.0);
}
`;

const col = (c: RGB) => new THREE.Color(c[0], c[1], c[2]);
/** 北斗七星与北极星：赤经（时）、赤纬（度） */
const STARS: Array<[string, number, number]> = [
  ['天枢', 11.062, 61.75], ['天璇', 11.031, 56.38], ['天玑', 11.897, 53.69], ['天权', 12.257, 57.03],
  ['玉衡', 12.9, 55.96], ['开阳', 13.399, 54.93], ['摇光', 13.792, 49.31], ['北极', 2.53, 89.26],
];
/** 洛阳的纬度 */
const LAT = (34.6 * Math.PI) / 180;

export class Sky {
  mesh: THREE.Mesh;
  u = {
    /** 高处罩的颜色 */ uSkyPig: { value: col(PIG.qing) },
    /** x 罩色的浓度，y 云（留白）的多少，z 星的显隐 */ uSky: { value: new THREE.Vector4(0.1, 0.85, 0, 0) },
    /** 霞的颜色 */ uGlowPig: { value: col(PIG.zhe) },
    /** xyz 霞在哪一边（水平方向），w 浓度 */ uGlow: { value: new THREE.Vector4(1, 0, 0, 0) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    /** rgb 日的颜色，a 大小（弧度；0 不画） */ uSun: { value: new THREE.Vector4(0.86, 0.3, 0.22, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    /** x 月的大小（弧度；0 不画），y 盈亏（0 朔、0.5 望），z 亮度 */ uMoon: { value: new THREE.Vector4(0, 0.5, 1, 0) },
    /** 远山的颜色（远山如黛） */ uMtPig: { value: col([0.6, 0.62, 0.655]) },
    /** x 远山的显隐，yz 嵩山在哪个方向（水平单位向量 x、z），w 浓度 */ uMt: { value: new THREE.Vector4(1, Math.sin(0.82), Math.cos(0.82), 1) },
    uStar: { value: STARS.map(() => new THREE.Vector3(0, 1, 0)) },
  };
  constructor() {
    const m = new THREE.ShaderMaterial({ uniforms: { ...U, ...this.u }, vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.mesh.name = 'sky';
  }
  /** 一年里的第几天、几点钟（当地时间，小数）：摆好北斗 */
  setStars(day: number, hour: number) {
    for (let i = 0; i < STARS.length; i++) this.u.uStar.value[i].copy(starDir(STARS[i][1], STARS[i][2], day, hour));
  }
  /** 北斗某一颗此刻在天上哪里（0 天枢 … 6 摇光，7 北极） */
  star(i: number) { return this.u.uStar.value[i]; }
}

/** 赤经赤纬 → 此地此刻的方向（+x 东、+y 上、+z 南） */
export function starDir(raH: number, decDeg: number, day: number, hour: number, out = new THREE.Vector3()): THREE.Vector3 {
  // 正午时，子午线上是太阳的赤经；太阳的赤经从春分（约第 80 天）起一年走一圈
  const lst = ((day - 80) / 365.25) * 24 + (hour - 12);
  const H = ((lst - raH) / 24) * Math.PI * 2, dec = (decDeg * Math.PI) / 180;
  const east = -Math.cos(dec) * Math.sin(H);
  const up = Math.sin(dec) * Math.sin(LAT) + Math.cos(dec) * Math.cos(LAT) * Math.cos(H);
  const north = Math.sin(dec) * Math.cos(LAT) - Math.cos(dec) * Math.sin(LAT) * Math.cos(H);
  return out.set(east, up, -north).normalize();
}
