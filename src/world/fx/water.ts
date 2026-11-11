/**
 * 池水：静的、深色的水面。
 *   映出天色（按反射方向取地平到天顶的渐变）与日 / 月的碎光；画质够时再做一遍真实的倒影（把镜头翻到水面下再画一次场景）；
 *   水面有极缓的波；点一下、灯落下、雨滴都会荡开一圈圈涟漪（最多同时十二圈，着色器里直接算）。
 */
import * as THREE from 'three';
import { FOG_PARS_F, shared } from '../core/mats';
import type { Sky } from '../env/sky';

const MAXR = 12;
const VERT = /* glsl */ `
varying vec3 vW; varying vec3 vFogPos; varying vec4 vRefl;
uniform mat4 uTexMatrix;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vRefl = uTexMatrix * w;
  vec4 mv = viewMatrix * w; vFogPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
precision highp float;
varying vec3 vW; varying vec4 vRefl;
uniform sampler2D tRefl;
uniform float uUseRefl, uTime, uRain, uCalm;
uniform vec3 uZenith, uHorizon, uSunColor, uDeep;
uniform vec4 uRip[${MAXR}];
${FOG_PARS_F}
float h2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float hgt(vec2 p) {
  float t = uTime;
  return n2(p * 0.9 + vec2(t * 0.11, t * 0.07)) * 0.55 + n2(p * 2.3 - vec2(t * 0.15, -t * 0.09)) * 0.28 + n2(p * 6.1 + vec2(t * 0.3, t * 0.21)) * 0.1 * (1.0 + uRain * 3.0);
}
void main() {
  vec2 p = vW.xz;
  float e = 0.06;
  float h0 = hgt(p), hx = hgt(p + vec2(e, 0.0)), hz = hgt(p + vec2(0.0, e));
  vec2 g = vec2(hx - h0, hz - h0) / e * (0.035 + 0.05 * uRain) * uCalm;
  // 涟漪
  for (int i = 0; i < ${MAXR}; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (r.w > 0.0 && age > 0.0 && age < 7.0) {
      vec2 d = p - r.xy; float dist = length(d) + 1e-4;
      float rad = age * 0.75;
      float env = exp(-pow((dist - rad) / (0.22 + age * 0.05), 2.0)) * r.w * exp(-age * 0.55) / (1.0 + rad * 0.7);
      g += (d / dist) * env * cos((dist - rad) * 26.0) * 0.5;
    }
  }
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vW);
  float nv = max(dot(n, V), 0.0);
  float fres = 0.03 + 0.97 * pow(1.0 - nv, 4.2);
  vec3 R = reflect(-V, n);
  R.y = abs(R.y);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.42));
  vec3 refl = sky;
  if (uUseRefl > 0.5) {
    vec2 uv = vRefl.xy / vRefl.w + n.xz * 0.045;
    refl = texture2D(tRefl, clamp(uv, 0.002, 0.998)).rgb;
  }
  float sd = max(dot(R, uSunDir), 0.0);
  refl += uSunColor * (pow(sd, 900.0) * 5.0 + pow(sd, 90.0) * 0.12);
  // 水体：深处墨绿；天暗时也暗
  float lum = dot(uHorizon, vec3(0.3, 0.5, 0.2));
  vec3 body = uDeep * (0.25 + 1.3 * lum);
  vec3 col = mix(body, refl, clamp(fres * 0.92 + 0.1, 0.0, 1.0));
  col = ksFog(col, vFogPos);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Pond {
  mesh: THREE.Mesh;
  y: number;
  private u: Record<string, THREE.IUniform>;
  private rip: THREE.Vector4[] = []; private ri = 0;
  private rt: THREE.WebGLRenderTarget | null = null;
  private rcam = new THREE.PerspectiveCamera();
  private seen = false;
  private tex = new THREE.Matrix4();
  bounds: { x0: number; x1: number; z0: number; z1: number };

  constructor(x0: number, x1: number, z0: number, z1: number, y: number, sky: Sky, reflect: boolean) {
    this.y = y; this.bounds = { x0, x1, z0, z1 };
    for (let i = 0; i < MAXR; i++) this.rip.push(new THREE.Vector4(0, 0, -100, 0));
    if (reflect) this.rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, depthBuffer: true, samples: 4 });
    this.u = {
      tRefl: { value: this.rt?.texture ?? null }, uUseRefl: { value: reflect ? 1 : 0 }, uTexMatrix: { value: this.tex },
      uTime: shared.uTime, uRain: shared.uWet, uCalm: { value: 1 },
      uZenith: sky.u.uZenith, uHorizon: sky.u.uHorizon, uSunColor: sky.u.uSunColor, uDeep: { value: new THREE.Color(0x0d2019) },
      uRip: { value: this.rip },
      uFogColor: shared.uFogColor, uFogSun: shared.uFogSun, uFogP: shared.uFogP, uFogDist: shared.uFogDist, uSunDir: shared.uSunDir,
    };
    const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.u });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), m);
    this.mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.mesh.name = 'pond';
    this.mesh.layers.set(1);
    this.mesh.onBeforeRender = () => { this.seen = true; };
  }

  /** 在 (x, z) 荡开一圈涟漪 */
  ripple(x: number, z: number, strength = 1) {
    this.rip[this.ri].set(x, z, shared.uTime.value, strength);
    this.ri = (this.ri + 1) % MAXR;
  }
  inside(x: number, z: number) { const b = this.bounds; return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1; }

  /** 倒影：把镜头按水面翻下去，先画一遍（只在上一帧水面进了画面时才画） */
  pre(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    if (!this.rt || !this.seen) return;
    this.seen = false;
    const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.min(1024, Math.max(256, Math.round(sz.x / 2))), h = Math.min(1024, Math.max(256, Math.round(sz.y / 2)));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);
    const cp = camera.getWorldPosition(new THREE.Vector3());
    if (cp.y <= this.y + 0.02) return;
    const dir = camera.getWorldDirection(new THREE.Vector3());
    const c = this.rcam;
    c.position.set(cp.x, 2 * this.y - cp.y, cp.z);
    c.up.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())); c.up.y *= -1;
    const tgt = cp.clone().add(dir); tgt.y = 2 * this.y - tgt.y;
    c.lookAt(tgt);
    c.near = camera.near; c.far = camera.far;
    c.updateMatrixWorld();
    c.projectionMatrix.copy(camera.projectionMatrix);
    c.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    this.tex.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(c.projectionMatrix).multiply(c.matrixWorldInverse);
    // 斜近裁面：水面以下的东西不要画进倒影
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.y).applyMatrix4(c.matrixWorldInverse);
    const cl = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant), pm = c.projectionMatrix, q = new THREE.Vector4();
    q.x = (Math.sign(cl.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cl.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1; q.w = (1 + pm.elements[10]) / pm.elements[14];
    cl.multiplyScalar(2 / cl.dot(q));
    pm.elements[2] = cl.x; pm.elements[6] = cl.y; pm.elements[10] = cl.z + 1 - 0.003; pm.elements[14] = cl.w;
    c.layers.set(0);
    const prevRT = renderer.getRenderTarget(), prevXr = renderer.xr.enabled, prevAuto = renderer.shadowMap.autoUpdate, prevNeed = renderer.shadowMap.needsUpdate;
    renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, c);
    renderer.setRenderTarget(prevRT);
    renderer.xr.enabled = prevXr; renderer.shadowMap.autoUpdate = prevAuto; renderer.shadowMap.needsUpdate = prevNeed;
  }
  dispose() { this.rt?.dispose(); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
