/**
 * 飘着的东西：落叶 / 落花、雨、雪、殿里光柱中的浮尘、院里流动的薄雾、夏夜的萤火、天上的飞鸟。
 * 都很省：雨雪是「绕着镜头的一盒粒子」，在着色器里下落并循环；落叶在主线程里一片片地算（只有一百来片）。
 */
import * as THREE from 'three';
import { enhance, shared } from '../core/mats';
import { mulberry32, rr } from '../core/rng';
import { softSprite } from '../core/tex';
import { groundY } from '../env/terrain';

// —— 雨与雪 ——
const FALL_V = /* glsl */ `
attribute vec3 aOff; attribute float aSpd;
uniform float uTime, uH, uR, uLen, uWid, uSway;
uniform vec4 uWind; uniform vec4 uRoomA[4]; uniform vec4 uRoomB[4];
varying vec2 vUv; varying float vA;
void main() {
  vec3 p = aOff;
  p.y = mod(aOff.y - uTime * aSpd, uH);
  p.xz += uWind.xy * (uH - p.y) * uSway + vec2(sin(uTime * 0.7 + aOff.x * 3.0), cos(uTime * 0.6 + aOff.z * 3.0)) * uSway * 2.2;
  p.xz = mod(p.xz - cameraPosition.xz + uR, 2.0 * uR) - uR + cameraPosition.xz;
  p.y += cameraPosition.y - uH * 0.4;
  // 屋里不下
  float inRoom = 0.0;
  for (int i = 0; i < 4; i++) { vec2 d = abs(p.xz - uRoomA[i].xy) - uRoomA[i].zw - 2.6; if (max(d.x, d.y) < 0.0 && p.y < uRoomB[i].y + 6.0) inRoom = 1.0; }
  vec3 fall = normalize(vec3(uWind.x * uSway * 8.0, -1.0, uWind.y * uSway * 8.0));
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = normalize(cross(fall, toCam));
  vec3 up2 = uLen > uWid * 1.5 ? fall : normalize(cross(toCam, side));
  vec3 wp = p + up2 * position.y * uLen + side * position.x * uWid;
  vUv = uv;
  float dist = length(cameraPosition - p);
  vA = (1.0 - inRoom) * smoothstep(0.4, 1.6, dist) * (1.0 - smoothstep(uR * 0.7, uR, dist));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FALL_F = /* glsl */ `
precision highp float;
uniform vec3 uColor; uniform float uAmount, uRound;
varying vec2 vUv; varying float vA;
void main() {
  vec2 c = vUv - 0.5;
  float a = mix((1.0 - abs(c.x) * 2.0) * (1.0 - abs(c.y) * 2.0), smoothstep(0.5, 0.1, length(c)), uRound);
  gl_FragColor = vec4(uColor, a * vA * uAmount);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function fallSystem(count: number, o: { H: number; R: number; len: number; wid: number; sway: number; spd: [number, number]; round: number }): THREE.Mesh {
  const g = new THREE.InstancedBufferGeometry();
  const q = new THREE.PlaneGeometry(1, 1);
  g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
  const off = new Float32Array(count * 3), spd = new Float32Array(count), r = mulberry32(o.len * 1000 + count);
  for (let i = 0; i < count; i++) { off[i * 3] = rr(r, -o.R, o.R); off[i * 3 + 1] = r() * o.H; off[i * 3 + 2] = rr(r, -o.R, o.R); spd[i] = rr(r, o.spd[0], o.spd[1]); }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3)); g.setAttribute('aSpd', new THREE.InstancedBufferAttribute(spd, 1));
  g.instanceCount = count;
  const m = new THREE.ShaderMaterial({
    vertexShader: FALL_V, fragmentShader: FALL_F, transparent: true, depthWrite: false,
    uniforms: { uTime: shared.uTime, uWind: shared.uWind, uRoomA: shared.uRoomA, uRoomB: shared.uRoomB, uH: { value: o.H }, uR: { value: o.R }, uLen: { value: o.len }, uWid: { value: o.wid }, uSway: { value: o.sway }, uColor: { value: new THREE.Color(1, 1, 1) }, uAmount: { value: 0 }, uRound: { value: o.round } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false; mesh.renderOrder = 12; mesh.visible = false;
  return mesh;
}

// —— 落叶 ——
interface Leaf { p: THREE.Vector3; v: THREE.Vector3; e: THREE.Euler; w: THREE.Vector3; rest: number; ph: number; src: number; s: number }
export interface Canopy { center: THREE.Vector3; radius: number; kind: string }

export class Ambient {
  group = new THREE.Group();
  rain: THREE.Mesh; snow: THREE.Mesh;
  private leaves: THREE.InstancedMesh | null = null; private leaf: Leaf[] = []; private canopies: Canopy[] = []; private leafOn = 0;
  private dust: THREE.Points; private mist: THREE.Sprite[] = []; private mistBase: Array<{ p: THREE.Vector3; s: number; a: number; ph: number }> = [];
  private flies: THREE.Sprite[] = []; private flyBase: Array<{ c: THREE.Vector3; ph: number }> = [];
  private birds: THREE.InstancedMesh; private bird: Array<{ p: THREE.Vector3; v: THREE.Vector3; life: number; s: number }> = []; private nextFlock = 20;
  private tmpM = new THREE.Matrix4(); private tmpQ = new THREE.Quaternion(); private tmpS = new THREE.Vector3();
  /** 萤火、鸟出不出来 */
  fireflies = 0; birdsOn = 1;
  /** 落叶落到水面时调用（荡一圈涟漪） */
  onSplash: ((x: number, z: number) => void) | null = null;

  constructor(density: number, private pondY: number, private inPond: (x: number, z: number) => boolean) {
    this.group.name = 'ambient';
    this.rain = fallSystem(Math.round(2600 * density), { H: 16, R: 15, len: 0.42, wid: 0.012, sway: 0.006, spd: [9, 13], round: 0 });
    this.snow = fallSystem(Math.round(2200 * density), { H: 14, R: 16, len: 0.045, wid: 0.045, sway: 0.03, spd: [0.7, 1.4], round: 1 });
    this.group.add(this.rain, this.snow);

    // 浮尘
    const n = Math.round(260 * density), pos = new Float32Array(n * 3), r = mulberry32(9);
    for (let i = 0; i < n; i++) { pos[i * 3] = rr(r, -9, 9); pos[i * 3 + 1] = rr(r, 1.7, 6.2); pos[i * 3 + 2] = rr(r, -5, 3.6); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.022, map: softSprite(32, 4, 0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2b0, opacity: 0, sizeAttenuation: true }));
    this.dust.frustumCulled = false; this.dust.renderOrder = 11;
    this.group.add(this.dust);

    // 飞鸟：两片翅膀，着色器里扇动
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.12, -0.5, 0, -0.06, 0, 0, -0.1, 0, 0, 0.12, 0, 0, -0.1, 0.5, 0, -0.06], 3));
    const bm = new THREE.MeshBasicMaterial({ color: 0x15171a, side: THREE.DoubleSide });
    bm.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sin(uTime * 9.0 + instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7) * abs(position.x) * 0.7;');
    };
    this.birds = new THREE.InstancedMesh(bg, enhance(bm), 24);
    this.birds.count = 0; this.birds.frustumCulled = false;
    this.group.add(this.birds);
  }

  /** 院里流动的薄雾：给几个位置 */
  addMist(points: Array<[number, number, number, number]>) {
    const tex = [softSprite(128, 11, 0.8), softSprite(128, 12, 0.7)];
    points.forEach(([x, y, z, s], i) => {
      const sp = new THREE.Sprite(enhance(new THREE.SpriteMaterial({ map: tex[i % 2], transparent: true, depthWrite: false, opacity: 0.1 })));
      sp.scale.set(s * 1.8, s, 1); sp.position.set(x, y, z); sp.renderOrder = 6;
      this.mist.push(sp); this.mistBase.push({ p: new THREE.Vector3(x, y, z), s, a: 0.5 + 0.5 * Math.random(), ph: Math.random() * 100 });
      this.group.add(sp);
    });
  }
  addFireflies(centers: THREE.Vector3[], each = 8) {
    const tex = softSprite(32, 5, 0);
    for (const c of centers) for (let i = 0; i < each; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color().setRGB(2.2, 2.6, 0.7), opacity: 0 }));
      sp.scale.setScalar(0.09); sp.renderOrder = 11;
      this.flies.push(sp); this.flyBase.push({ c: c.clone(), ph: Math.random() * 100 });
      this.group.add(sp);
    }
  }

  /** 落叶：给树冠的位置、叶子的贴图与颜色。count 片 */
  setLeaves(canopies: Canopy[], tex: THREE.Texture | null, color: number, count: number) {
    if (this.leaves) { this.group.remove(this.leaves); this.leaves.geometry.dispose(); (this.leaves.material as THREE.Material).dispose(); this.leaves = null; }
    this.canopies = canopies; this.leaf = [];
    if (!canopies.length || count <= 0) return;
    const g = new THREE.PlaneGeometry(0.075, 0.075);
    const m = enhance(new THREE.MeshLambertMaterial({ map: tex, color, alphaTest: tex ? 0.4 : 0, side: THREE.DoubleSide, transparent: false }));
    this.leaves = new THREE.InstancedMesh(g, m, count);
    this.leaves.frustumCulled = false; this.leaves.castShadow = false;
    const r = mulberry32(31);
    for (let i = 0; i < count; i++) {
      const lf: Leaf = { p: new THREE.Vector3(), v: new THREE.Vector3(), e: new THREE.Euler(), w: new THREE.Vector3(), rest: 0, ph: r() * 100, src: i % canopies.length, s: rr(r, 0.8, 1.5) };
      this.spawn(lf, true);
      this.leaf.push(lf);
    }
    this.group.add(this.leaves);
  }
  setLeafAmount(k: number) { this.leafOn = k; }
  private spawn(l: Leaf, anywhere: boolean) {
    const c = this.canopies[l.src], a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * c.radius;
    l.p.set(c.center.x + Math.cos(a) * d, c.center.y + (Math.random() - 0.3) * c.radius * 0.5, c.center.z + Math.sin(a) * d);
    if (anywhere) l.p.y = Math.max(0.05, l.p.y * Math.random());
    l.v.set(0, -0.4 - Math.random() * 0.4, 0);
    l.e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    l.w.set(rr(Math.random, -2.5, 2.5), rr(Math.random, -2, 2), rr(Math.random, -2.5, 2.5));
    l.rest = 0;
  }

  /** 钟声一响，惊起一群鸟 */
  startle(from: THREE.Vector3, n = 10) {
    for (let i = 0; i < n && this.bird.length < 24; i++) {
      const a = Math.random() * 6.283;
      this.bird.push({ p: from.clone().add(new THREE.Vector3(rr(Math.random, -3, 3), rr(Math.random, 0, 2), rr(Math.random, -3, 3))), v: new THREE.Vector3(Math.cos(a) * rr(Math.random, 3, 6), rr(Math.random, 2.5, 4.5), Math.sin(a) * rr(Math.random, 3, 6)), life: rr(Math.random, 7, 11), s: rr(Math.random, 0.5, 0.75) });
    }
  }

  update(dt: number, t: number, cam: THREE.Camera, env: { rain: number; snow: number; night: number; sun: number; indoor: number; fog: THREE.Color }) {
    // 雨雪
    const ru = (this.rain.material as THREE.ShaderMaterial).uniforms, su = (this.snow.material as THREE.ShaderMaterial).uniforms;
    this.rain.visible = env.rain > 0.02; this.snow.visible = env.snow > 0.02;
    ru.uAmount.value = env.rain * 0.34; su.uAmount.value = env.snow * 0.85;
    ru.uColor.value.copy(env.fog).multiplyScalar(1.35).addScalar(0.06); su.uColor.value.copy(env.fog).multiplyScalar(0.6).addScalar(0.42 * (1 - 0.7 * env.night));
    // 浮尘：有日光斜进殿里的时候才看得见
    (this.dust.material as THREE.PointsMaterial).opacity = 0.5 * env.sun * (1 - env.rain) * (0.25 + 0.75 * env.indoor);
    this.dust.visible = (this.dust.material as THREE.PointsMaterial).opacity > 0.01;
    if (this.dust.visible) this.dust.rotation.y = Math.sin(t * 0.02) * 0.05;
    // 雾
    const wind = shared.uWind.value;
    for (let i = 0; i < this.mist.length; i++) {
      const b = this.mistBase[i], sp = this.mist[i];
      const drift = ((t * 0.25 * (0.5 + b.a) + b.ph) % 24) - 12;
      sp.position.set(b.p.x + wind.x * drift, b.p.y + Math.sin(t * 0.1 + b.ph) * 0.3, b.p.z + wind.y * drift);
      const d = sp.position.distanceTo(cam.position);
      const edge = 1 - Math.abs(drift) / 12;
      sp.material.opacity = 0.16 * b.a * edge * Math.min(1, Math.max(0, (d - b.s * 0.5) / (b.s * 0.8))) * (1 + 1.5 * (env.rain + env.snow)) * (1 - 0.8 * env.indoor);
      sp.material.color.copy(env.fog).multiplyScalar(1.15);
    }
    // 萤火
    const fl = this.fireflies * env.night * (1 - env.rain) * (1 - env.snow);
    for (let i = 0; i < this.flies.length; i++) {
      const b = this.flyBase[i], sp = this.flies[i];
      sp.visible = fl > 0.02;
      if (!sp.visible) continue;
      const a = t * 0.23 + b.ph;
      sp.position.set(b.c.x + Math.sin(a * 1.3) * 2.6 + Math.sin(a * 3.1) * 0.6, b.c.y + 0.5 + Math.sin(a * 1.7 + 2) * 0.45, b.c.z + Math.cos(a * 1.1) * 2.6 + Math.cos(a * 2.7) * 0.6);
      sp.material.opacity = fl * Math.pow(Math.max(0, Math.sin(t * 1.3 + b.ph * 7)), 3);
    }
    // 落叶
    if (this.leaves) {
      const im = this.leaves, n = Math.round(this.leaf.length * this.leafOn);
      im.count = n;
      for (let i = 0; i < n; i++) {
        const l = this.leaf[i];
        if (l.rest > 0) {
          l.rest -= dt;
          if (l.rest <= 0) this.spawn(l, false);
        } else {
          const sw = Math.sin(t * 1.9 + l.ph), sw2 = Math.cos(t * 1.3 + l.ph * 1.7);
          l.v.x += (sw * 0.9 + wind.x * wind.z * 9 - l.v.x) * dt * 1.5;
          l.v.z += (sw2 * 0.9 + wind.y * wind.z * 9 - l.v.z) * dt * 1.5;
          l.v.y += (-0.75 - 0.3 * Math.abs(sw) - l.v.y) * dt * 2;
          l.p.addScaledVector(l.v, dt);
          l.e.x += l.w.x * dt; l.e.y += l.w.y * dt; l.e.z += l.w.z * dt;
          const water = this.inPond(l.p.x, l.p.z);
          const gy = water ? this.pondY + 0.004 : Math.max(groundY(l.p.x, l.p.z), Math.abs(l.p.x) < 26 && l.p.z > -26 && l.p.z < 51 ? 0 : -99) + 0.012;
          if (l.p.y <= gy) {
            l.p.y = gy; l.e.set(-Math.PI / 2 + rr(Math.random, -0.12, 0.12), 0, l.e.z); l.rest = rr(Math.random, 5, 14);
            if (water) this.onSplash?.(l.p.x, l.p.z);
          }
        }
        this.tmpQ.setFromEuler(l.e); this.tmpS.setScalar(l.s);
        im.setMatrixAt(i, this.tmpM.compose(l.p, this.tmpQ, this.tmpS));
      }
      im.instanceMatrix.needsUpdate = true;
    }
    // 鸟：偶尔一队从远处的天上过
    this.nextFlock -= dt;
    if (this.nextFlock <= 0 && this.birdsOn > 0.5 && env.night < 0.5 && env.rain < 0.3) {
      this.nextFlock = rr(Math.random, 45, 110);
      const a = Math.random() * 6.283, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), s = new THREE.Vector3(-d.z, 0, d.x);
      const o = new THREE.Vector3(cam.position.x, 0, cam.position.z).addScaledVector(d, -150).addScaledVector(s, rr(Math.random, -60, 60));
      const n = 5 + Math.floor(Math.random() * 5), y = rr(Math.random, 42, 70);
      for (let i = 0; i < n && this.bird.length < 24; i++) {
        const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
        this.bird.push({ p: o.clone().addScaledVector(s, k * 2.4).addScaledVector(d, -Math.abs(k) * 2.2).setY(y + Math.abs(k) * 0.3), v: d.clone().multiplyScalar(9), life: 36, s: 1.6 });
      }
    }
    let nb = 0;
    for (let i = this.bird.length - 1; i >= 0; i--) {
      const b = this.bird[i];
      b.life -= dt;
      if (b.life <= 0) { this.bird.splice(i, 1); continue; }
      b.p.addScaledVector(b.v, dt);
    }
    for (const b of this.bird) {
      this.tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.v.clone().setY(b.v.y * 0.3).normalize());
      this.tmpS.setScalar(b.s * Math.min(1, b.life));
      this.birds.setMatrixAt(nb++, this.tmpM.compose(b.p, this.tmpQ, this.tmpS));
    }
    this.birds.count = nb;
    if (nb) this.birds.instanceMatrix.needsUpdate = true;
  }
}
