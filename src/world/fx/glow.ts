/**
 * 灯晕：夜里亮着的窗、灯外面一圈极淡的暖色，像窗纸透出来的光染在夜色里。
 * 只在夜里有——白天纸是亮的，画上不许有比纸更亮的东西。不闪。
 * 每一处是一张朝着看画人的圆片，中间浓、往外淡到没有；所有的灯并成一次绘制。
 */
import * as THREE from 'three';
import { FX_LAYER, FX_PARS, INK_PARS, U } from '../ink/ink';

const GLOW_V = /* glsl */ `
${INK_PARS}
attribute vec4 aLamp;
varying vec2 vUv; varying float vZ; varying float vK;
void main() {
  vec4 v = viewMatrix * vec4(aLamp.xyz, 1.0);
  v.xy += position.xy * aLamp.w;
  // 窗在墙上：比深度时往前让半个晕那么远，不叫墙把晕切掉一半
  vZ = -v.z - aLamp.w * 0.45;
  gl_Position = projectionMatrix * v;
  vUv = position.xy * 2.0;
  vK = 1.0 - inkFogK(aLamp.xyz);
}
`;
const GLOW_F = /* glsl */ `
${INK_PARS}
${FX_PARS}
uniform vec4 uGlow;
varying vec2 vUv; varying float vZ; varying float vK;
void main() {
  float r2 = dot(vUv, vUv);
  float a = exp(-r2 * 3.4) * (1.0 - smoothstep(0.6, 1.0, r2)) * uGlow.a * smoothstep(0.1, 0.75, uNight) * vK * fxSeen(vZ, 0.5);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uGlow.rgb, a);
}
`;

export class Glow {
  mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry; private mat: THREE.ShaderMaterial;
  private arr: Float32Array; private glow = new THREE.Vector4(0.98, 0.83, 0.6, 0);
  constructor(private max = 48) {
    const quad = new THREE.PlaneGeometry(1, 1), g = (this.geo = new THREE.InstancedBufferGeometry());
    g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    this.arr = new Float32Array(max * 4);
    g.setAttribute('aLamp', new THREE.InstancedBufferAttribute(this.arr, 4));
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uGlow: { value: this.glow } },
      vertexShader: GLOW_V, fragmentShader: GLOW_F,
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.layers.set(FX_LAYER);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'glow';
  }
  /** 灯在哪；size 是晕的直径（米） */
  set(p: THREE.Vector3[], size: number) {
    const n = Math.min(this.max, p.length);
    for (let i = 0; i < n; i++) this.arr.set([p[i].x, p[i].y, p[i].z, size], i * 4);
    this.count = n;
    this.geo.attributes.aLamp.needsUpdate = true;
  }
  private count = 0;
  /** lamp：灯火此刻亮几成 */
  update(lamp: number) {
    this.glow.w = 0.3 * lamp;
    this.geo.instanceCount = lamp > 0.02 ? this.count : 0;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
