/**
 * 山：寺所在的这一片是真的地形（高度场），再远的群山画在天上（sky.ts）。
 *   寺院、云台是削平的台地；北面、西面是往上的山，东面是崖，崖下是云海；南面是来路，一道石阶下到雾里。
 * 云海：两层很大的平面，用噪声当透明度，慢慢流。颜色取雾色，所以和远处融在一起。
 */
import * as THREE from 'three';
import { colorize, grid, rockGeo, V, type Geo } from '../core/geo';
import { FOG_PARS_F, shared, type Mats } from '../core/mats';
import { clamp, fbm, lerp, mulberry32, ridged, rr, smooth } from '../core/rng';
import type { Quality } from '../core/World';
import { L, stairY } from '../layout';

interface Rect { x0: number; x1: number; z0: number; z1: number }
const R0: Rect = { x0: L.wall.x0 - 2.5, x1: L.wall.x1 + 0.4, z0: L.wall.z0 - 2.5, z1: L.stair.z0 };
const R1: Rect = { x0: L.terrace.x0 - 1, x1: L.terrace.x1 + 0.4, z0: L.terrace.z0 - 0.6, z1: L.terrace.z1 + 0.6 };
const dRect = (x: number, z: number, r: Rect) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

function natural(x: number, z: number): number {
  let y = 0;
  y += Math.max(0, -z - 30) * 0.52;
  y += Math.max(0, -x - 34) * 0.34;
  y -= Math.max(0, x - 44.5) * 1.3;
  y -= Math.max(0, z - L.stair.z0) * (L.stair.drop / (L.stair.z1 - L.stair.z0));
  const far = smooth(24, 170, Math.hypot(x, z - 10));
  y += (ridged(x / 115 + 3.1, z / 115 + 1.7, 4, 3) - 0.36) * 50 * (0.2 + 0.8 * far);
  y += (fbm(x / 24, z / 24, 3, 8) - 0.5) * 6 * (0.25 + 0.75 * far);
  // 东南的谷再深一些，云海沉在里面
  y -= smooth(30, 120, x + (z - 30) * 0.5) * 16;
  return y;
}
/** 地面的高度 */
export function groundY(x: number, z: number): number {
  const d = Math.min(dRect(x, z, R0), dRect(x, z, R1));
  let y = lerp(-0.14, natural(x, z), smooth(0, 10, d));
  const ds = Math.hypot(Math.max(Math.abs(x) - L.stair.w / 2 - 0.3, 0), Math.max(L.stair.z0 - z, 0, z - (L.stair.z1 + 6)));
  // （到山脚的平台跟前再压低半米多：地形的网格比台阶粗，不压低的话会有一块草皮从平台与最末几级之间冒出来）
  y = lerp(stairY(z) - 0.12 - 0.6 * smooth(L.stair.z1 - 4.5, L.stair.z1 - 0.8, z), y, smooth(0, 5.5, ds));
  // 莲池：地面在这里让出一个坑（坑沿藏在驳岸与铺地底下）
  if (x > L.pond.x0 - 1.7 && x < L.pond.x1 + 1.7 && z > L.pond.z0 - 1.7 && z < L.pond.z1 + 1.7) y = -2.4;
  return y;
}

const CLOUD_V = /* glsl */ `
varying vec3 vW; varying vec3 vFogPos;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vFogPos = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const CLOUD_F = /* glsl */ `
precision highp float;
varying vec3 vW;
uniform float uTime, uSpeed, uScale, uCover, uAlpha;
uniform vec2 uCenter;
${FOG_PARS_F}
float h2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fb(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.02 + 7.3; a *= 0.5; } return s; }
void main() {
  vec2 p = vW.xz * uScale;
  float t = uTime * uSpeed;
  float a = fb(p + vec2(t, t * 0.35)), b = fb(p * 2.3 - vec2(t * 0.6, -t * 0.2) + 4.0);
  float d = a * 0.72 + b * 0.38;
  float cov = smoothstep(uCover, uCover + 0.3, d);
  // 云顶亮、云谷暗；朝日的一侧染上日色
  vec3 rd = normalize(vW - cameraPosition);
  float sun = pow(max(dot(rd, uSunDir), 0.0), 3.0);
  vec3 lit = mix(uFogColor * 1.1, uFogSun * 1.12, 0.25 + 0.6 * sun);
  vec3 col = mix(uFogColor * 0.74, lit, smoothstep(0.35, 0.95, d));
  // 寺的近旁不要有云（别糊在墙和台基上），远处渐隐
  float r = length(vW.xz - uCenter);
  float edge = smoothstep(48.0, 95.0, r) * (1.0 - smoothstep(1500.0, 2400.0, r));
  col = ksFogAt(col, vW - cameraPosition);
  gl_FragColor = vec4(col, cov * edge * uAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function cloudLayer(y: number, scale: number, speed: number, cover: number, alpha: number): THREE.Mesh {
  const m = new THREE.ShaderMaterial({
    vertexShader: CLOUD_V, fragmentShader: CLOUD_F, transparent: true, depthWrite: false,
    uniforms: {
      uTime: shared.uTime, uSpeed: { value: speed }, uScale: { value: scale }, uCover: { value: cover }, uAlpha: { value: alpha }, uCenter: { value: new THREE.Vector2(0, 10) },
      uFogColor: shared.uFogColor, uFogSun: shared.uFogSun, uFogP: shared.uFogP, uFogDist: shared.uFogDist, uSunDir: shared.uSunDir,
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000, 1, 1).rotateX(-Math.PI / 2), m);
  mesh.position.set(0, y, 0);
  mesh.renderOrder = 5;
  mesh.name = 'cloudsea';
  return mesh;
}

export interface Terrain { group: THREE.Group; clouds: THREE.Mesh[] }
export function createTerrain(mats: Mats, q: Quality): Terrain {
  const group = new THREE.Group();
  group.name = 'terrain';
  const N = q.tier === 'low' ? 96 : q.tier === 'mid' ? 150 : 210, R = 380;
  const map = (t: number) => Math.sign(t) * Math.pow(Math.abs(t), 1.75) * R;
  const pts: THREE.Vector3[][] = [];
  for (let i = 0; i <= N; i++) {
    const row: THREE.Vector3[] = [], x = map((i / N) * 2 - 1);
    for (let j = 0; j <= N; j++) { const z = map((j / N) * 2 - 1) + 10; row.push(V(x, groundY(x, z), z)); }
    pts.push(row);
  }
  const g = grid(pts, (_i, _j, p) => [p.x, p.z], true);
  colorize(g, (x, y, z, _nx, ny, _nz, o) => {
    const n = fbm(x / 9 + 3, z / 9, 3, 21), n2 = fbm(x / 37, z / 37 + 5, 3, 22);
    const rock = 1 - smooth(0.62, 0.86, ny + (n - 0.5) * 0.25);
    const k = 0.72 + 0.5 * n2;
    o[0] = lerp(k, 1.55 * k, rock); o[1] = lerp(k, 1.28 * k, rock); o[2] = lerp(k * 0.92, 2.0 * k, rock);
    // 低处近云海的地方发暗发湿
    const low = smooth(-6, -22, y);
    o[0] *= 1 - 0.3 * low; o[1] *= 1 - 0.25 * low; o[2] *= 1 - 0.2 * low;
  });
  const mesh = new THREE.Mesh(g, mats.ground);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  group.add(mesh);

  const clouds = [cloudLayer(-25, 0.0105, 0.012, 0.3, 0.96), cloudLayer(-19.5, 0.0062, 0.008, 0.46, 0.8)];
  group.add(...clouds);
  return { group, clouds };
}

/** 散在山上的石头（实例化的几种） */
export function scatterRocks(mats: Mats, q: Quality): THREE.Group {
  const grp = new THREE.Group(), r = mulberry32(77);
  const shapes: Geo[] = [rockGeo(1, 1.0, 0.7, 0.8), rockGeo(2, 0.8, 0.9, 0.7), rockGeo(3, 1.2, 0.55, 0.9)];
  const n = Math.round(46 * q.density), per: THREE.Matrix4[][] = [[], [], []];
  for (let i = 0; i < n * 6 && per[0].length + per[1].length + per[2].length < n; i++) {
    const a = r() * Math.PI * 2, d = rr(r, 34, 170);
    const x = Math.cos(a) * d, z = Math.sin(a) * d + 10;
    if (Math.min(dRect(x, z, R0), dRect(x, z, R1)) < 1.5 || (Math.abs(x) < 4 && z > 48)) continue;
    const y = groundY(x, z);
    if (y < -20) continue;
    const s = rr(r, 0.5, 1.7) * (r() < 0.1 ? 2.0 : 1);
    per[i % 3].push(new THREE.Matrix4().compose(V(x, y - 0.42 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(r, -0.2, 0.2), r() * 6.28, rr(r, -0.2, 0.2))), V(s, s * rr(r, 0.7, 1.2), s)));
  }
  shapes.forEach((geo, k) => {
    const im = new THREE.InstancedMesh(geo, mats.rock, per[k].length);
    per[k].forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    grp.add(im);
  });
  return grp;
}

export interface Pt { x: number; y: number; z: number; s: number; r: number; v: number }
/** 山上的松该种在哪：近处的细做，远处的只是剪影 */
export function scatterPines(q: Quality): { near: Pt[]; far: Pt[] } {
  const r = mulberry32(2026), near: Pt[] = [], far: Pt[] = [];
  const nNear = Math.round((q.mobile ? 70 : 120) * q.density), nFar = Math.round(720 * q.density);
  const ok = (x: number, z: number, margin: number) => {
    if (dRect(x, z, R0) < margin || dRect(x, z, R1) < margin + 1) return false;
    if (Math.abs(x) < 5.5 && z > 46 && z < 96) return false;
    return true;
  };
  for (let i = 0; i < nNear * 30 && near.length < nNear; i++) {
    const a = r() * Math.PI * 2, d = 30 + Math.pow(r(), 1.5) * 70;
    const x = Math.cos(a) * d * 1.05, z = Math.sin(a) * d + 10;
    if (!ok(x, z, 4.5)) continue;
    const y = groundY(x, z);
    if (y < -17) continue;
    // 成片：用噪声决定疏密
    if (fbm(x / 26, z / 26, 2, 91) < 0.36 + 0.2 * r()) continue;
    // 石阶两侧、云台东面不要挡住看出去的视线
    if (x > 43 && z > -30 && z < 0 && y > -14) continue;
    near.push({ x, y, z, s: rr(r, 0.7, 1.1), r: r() * 6.28, v: Math.floor(r() * 4) });
  }
  for (let i = 0; i < nFar * 30 && far.length < nFar; i++) {
    const a = r() * Math.PI * 2, d = 78 + Math.pow(r(), 1.2) * 290;
    const x = Math.cos(a) * d, z = Math.sin(a) * d + 10;
    const y = groundY(x, z);
    if (y < -16) continue;
    if (fbm(x / 40, z / 40, 2, 92) < 0.34 + 0.2 * r()) continue;
    far.push({ x, y, z, s: rr(r, 1.0, 1.9), r: r() * 6.28, v: Math.floor(r() * 3) });
  }
  return { near, far };
}
export { clamp };
