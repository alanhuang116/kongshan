/**
 * 水上一圈一圈荡开的纹（伊水上用：溪与池有自己的涟漪，伊水的水面是远景那一路画的，没有）：
 * 至多 24 圈，一张实例化的方片（一次绘制），画在勾完线之后那一层，自己比深度。
 * 白天是几笔淡墨，夜里是碎的月光——与 env/water.ts 的涟漪一个样子。
 */
import * as THREE from 'three';
import { FX_LAYER, FX_PARS, INK_PARS, U } from '../ink/ink';

const V_SH = /* glsl */ `
${INK_PARS}
attribute vec4 aRing;   // x, y, z, 大小
attribute vec2 aAge;    // 起的时刻、扩得多快
uniform float uNow;
varying vec2 vP; varying float vZ; varying float vAge; varying float vR; varying vec3 vW;
void main() {
  float age = uNow - aAge.x;
  float R = max(0.01, age * aAge.y * aRing.w);
  vec3 w = aRing.xyz + vec3(position.x * R * 1.25, 0.0, position.y * R * 1.25);
  vW = w;
  vec4 v = viewMatrix * vec4(w, 1.0);
  vZ = -v.z; vP = position.xy * 1.25; vAge = age; vR = R;
  gl_Position = projectionMatrix * v;
}
`;
const F_SH = /* glsl */ `
${INK_PARS}
${FX_PARS}
uniform vec3 uInk;
varying vec2 vP; varying float vZ; varying float vAge; varying float vR; varying vec3 vW;
void main() {
  if (vAge < 0.0 || vAge > 4.0) discard;
  // 线宽按米给，但远了不细到一个像素以下（fwidth：这一处一个像素有多少米）
  float r = length(vP) * vR, w = max(0.04, fwidth(r) * 1.4);
  float band = smoothstep(w, 0.0, abs(r - vR)) + 0.55 * smoothstep(w * 0.9, 0.0, abs(r - vR * 0.66));
  float a = band * (1.0 - vAge / 4.0) * 0.7 * fxSeen(vZ, 0.2) * (1.0 - inkFogK(vW));
  if (a < 0.01) discard;
  vec3 c = mix(uInk + 0.42, uLight, uNight * 0.6);
  gl_FragColor = vec4(c, a * mix(0.75, 0.55, uNight));
}
`;

export class Rings {
  mesh: THREE.Mesh;
  private ring: Float32Array; private age: Float32Array; private i = 0; private mat: THREE.ShaderMaterial; private geo: THREE.InstancedBufferGeometry;
  constructor(private max = 24) {
    const quad = new THREE.PlaneGeometry(2, 2), g = (this.geo = new THREE.InstancedBufferGeometry());
    g.index = quad.index; g.setAttribute('position', quad.attributes.position);
    this.ring = new Float32Array(max * 4); this.age = new Float32Array(max * 2).fill(-99);
    g.setAttribute('aRing', new THREE.InstancedBufferAttribute(this.ring, 4));
    g.setAttribute('aAge', new THREE.InstancedBufferAttribute(this.age, 2));
    g.instanceCount = max;
    // 两面都画：方片的 (x, y) 摆到地上的 (x, z)，绕向就反了，从上往下看是它的背面（只画正面时整个被剔掉，一圈也看不见）
    this.mat = new THREE.ShaderMaterial({ uniforms: { ...U, uNow: { value: 0 } }, vertexShader: V_SH, fragmentShader: F_SH, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.layers.set(FX_LAYER);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -5;
    this.mesh.name = 'play:rings';
    this.mesh.visible = false;
  }
  private last = -99;
  /** 在 (x, y, z) 起一圈；size 是大小（1 寻常），speed 是扩得多快（米/秒） */
  add(x: number, y: number, z: number, size = 1, speed = 0.45) {
    const k = this.i++ % this.max;
    this.ring.set([x, y + 0.01, z, size], k * 4);
    this.age.set([U.uTime.value, speed], k * 2);
    (this.geo.attributes.aRing as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAge as THREE.BufferAttribute).needsUpdate = true;
    this.last = U.uTime.value;
    this.mesh.visible = true;
  }
  update() {
    this.mat.uniforms.uNow.value = U.uTime.value;
    // 四秒没有新的圈：都散了，不画
    if (this.mesh.visible && U.uTime.value - this.last > 4.2) this.mesh.visible = false;
  }
}
