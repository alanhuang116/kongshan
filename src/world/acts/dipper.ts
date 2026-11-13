/**
 * 认北斗（「遇童子便教认北斗」）。
 * 夜里、天清的时候，在溪桥南头朝北站定：先把勺子的七颗星一颗颗点出来（各显其名），
 * 再由斗口两星——天璇到天枢——连线向前延长五倍，找到北极星；末了看一看此刻斗柄指着哪一方。
 * 星是按真实的赤经赤纬与这里的时刻摆的（env/sky.ts），所以春天黄昏斗柄朝东，夏天朝南，一年转一圈。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { FX_LAYER, U } from '../ink/ink';
import { SITE } from '../site';
import { groundAt } from '../walk';
import type { Act } from './types';

const NAMES = ['天枢', '天璇', '天玑', '天权', '玉衡', '开阳', '摇光', '北极'];
const DATA = import.meta.glob<Record<string, unknown>>('../../data/almanac.ts', { eager: true });
const DIPPER = Object.values(DATA).map((m) => m.DIPPER as { quote?: { text: string; source: string } } | undefined).find(Boolean);
const QUOTE = DIPPER?.quote ?? { text: '斗柄东指，天下皆春；斗柄南指，天下皆夏；斗柄西指，天下皆秋；斗柄北指，天下皆冬。', source: '《鹖冠子·环流》' };
const R = 1500;

/** 天上的一个字牌（画在勾完线之后的那一层，永远朝着看的人） */
function label(text: string): THREE.Mesh {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '500 46px "LXGW WenKai", "Noto Serif SC", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(R * 0.085, R * 0.032), new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uLight: U.uLight, uA: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D map; uniform vec3 uLight; uniform float uA; varying vec2 vUv; void main() { gl_FragColor = vec4(uLight, texture2D(map, vUv).a * uA); }',
  }));
  m.layers.set(FX_LAYER); m.frustumCulled = false;
  return m;
}
/** 一段淡淡的连线（细长的一条） */
function seg(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { uLight: U.uLight, uA: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uLight; uniform float uA; varying vec2 vUv; void main() { gl_FragColor = vec4(uLight, uA * smoothstep(0.5, 0.2, abs(vUv.y - 0.5)) * 0.8); }',
  }));
  m.layers.set(FX_LAYER); m.frustumCulled = false;
  return m;
}

export function create(k: Anlewo): Act {
  const sx = SITE.bridge.x + 1.3, sz = SITE.bridge.z + SITE.bridge.len / 2 + 1.4, gy = groundAt(sx, sz) ?? 6;
  const sky = k.atmos.sky, group = new THREE.Group();
  group.visible = false;
  k.world.scene.add(group);
  const tags = NAMES.map((n) => { const m = label(n); group.add(m); return m; });
  const lines = Array.from({ length: 8 }, () => { const m = seg(); group.add(m); return m; });
  const found = new Array<boolean>(8).fill(false);
  let step = 0, t = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3(), hand = new THREE.Vector3();
  const alpha = (m: THREE.Mesh, v: number, dt: number) => { const u = (m.material as THREE.ShaderMaterial).uniforms.uA; u.value += (v - u.value) * Math.min(1, dt * 4); };
  /** 把一段线摆在两颗星之间（from、to 是方向；ext 是从 to 再往前延长几倍） */
  const put = (m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, ext = 0) => {
    a.copy(from).multiplyScalar(R); b.copy(to).multiplyScalar(R);
    if (ext) b.addScaledVector(mid.subVectors(b, a), ext);
    mid.addVectors(a, b).multiplyScalar(0.5);
    const len = a.distanceTo(b), cam = k.world.camera.position;
    m.position.copy(mid).add(cam);
    // 细条：长边顺着两星的连线，面朝镜头
    const x = b.clone().sub(a).normalize(), z = mid.clone().normalize().negate();
    z.addScaledVector(x, -z.dot(x)).normalize();                      // 面朝镜头的方向要与线垂直，不然线会摆歪
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    m.scale.set(len, R * 0.004, 1);
  };
  /** 此刻斗柄指着哪一方（面朝北看：往右是东，往上是南） */
  const handle = () => { const h = sky.star(6).clone().sub(sky.star(4)); return Math.abs(h.x) > Math.abs(h.y) ? (h.x > 0 ? '东' : '西') : h.y > 0 ? '南' : '北'; };
  const emit = () => {
    const n = found.slice(0, 7).filter(Boolean).length;
    act.state = step === 0 ? { kind: 'dipper', title: '认北斗', hint: `先找勺子：七颗亮星，一颗一颗点出来（${n} / 7）`, count: n }
      : step === 1 ? { kind: 'dipper', title: '认北斗', hint: '斗口两星——天璇到天枢——连起来，往前延长五倍，那里是北极星。点一点它' }
        : { kind: 'dipper', title: '认北斗', text: `此刻斗柄指${handle()}。\n${QUOTE.text}`, source: QUOTE.source, choices: [{ id: 'done', label: '毕' }], done: true };
    k.emitAct();
  };
  const act: Act & { on(): boolean } = {
    id: 'dipper', name: '认北斗',
    anchor: new THREE.Vector3(sx, gy + 2.0, sz - 0.6), spot: { x: sx, z: sz, yaw: Math.PI }, radius: 3,
    state: {},
    on: () => { const w = k.atmos; return w.night > 0.6 && w.w.rain + w.w.snow + w.w.mist < 0.4; },
    enter() {
      found.fill(false); step = 0; t = 0; group.visible = true;
      for (const m of [...tags, ...lines]) (m.material as THREE.ShaderMaterial).uniforms.uA.value = 0;
      const av = k.player.av;
      av.setHands('free');
      // 机位：退到他身后低处，仰着看北天——人在画面底下指着，勺子与北极星在上半幅
      const c = new THREE.Vector3(); for (let i = 0; i < 7; i++) c.add(sky.star(i)); c.normalize().add(sky.star(7)).normalize();
      c.y = Math.max(0.3, c.y * 0.8); c.normalize();
      const pos = new THREE.Vector3(sx + 1.3, gy + 0.85, sz + 5.6);
      k.nav.setPose({ pos, look: pos.clone().addScaledVector(c, 40), fov: 70, yaw: 30, up: 20, down: 10 });
      k.life?.npcs.kid1?.attend(new THREE.Vector3(sx, gy + 8, sz - 20));
      emit();
    },
    exit() { group.visible = false; k.player.av.reach('R', null); k.life?.npcs.kid1?.attend(null); },
    update(dt) {
      t += dt;
      const cam = k.world.camera;
      for (let i = 0; i < 8; i++) {
        const d = sky.star(i), tag = tags[i];
        // 名字写在星的右下方
        tag.position.copy(d).multiplyScalar(R).add(cam.position).addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), R * 0.05).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), -R * 0.022);
        tag.quaternion.copy(cam.quaternion);
        alpha(tag, found[i] ? 0.92 : 0, dt);
      }
      // 勺子的连线：相邻两颗都找到了才连上
      for (let i = 0; i < 6; i++) { put(lines[i], sky.star(i), sky.star(i + 1)); alpha(lines[i], found[i] && found[i + 1] ? 0.5 : 0, dt); }
      put(lines[6], sky.star(1), sky.star(0), 5.2); alpha(lines[6], step >= 1 ? 0.3 + 0.12 * Math.sin(t * 2) : 0, dt);
      alpha(lines[7], 0, dt);
      // 手指着最近点出来的那颗星
      const last = step >= 2 ? 7 : found.lastIndexOf(true);
      if (last >= 0) { k.player.av.joints.chest.getWorldPosition(hand); k.player.av.reach('R', hand.addScaledVector(sky.star(last), 0.52).add(new THREE.Vector3(-0.16, 0.12, 0))); k.player.av.lookAt(hand.clone().addScaledVector(sky.star(last), 30)); }
    },
    input: {
      tap(p) {
        const dir = k.world.ray(p.nx, p.ny).ray.direction;
        let best = -1, bd = 0.058;
        for (let i = 0; i < 8; i++) { const ang = Math.acos(Math.min(1, dir.dot(sky.star(i)))); if (ang < bd) { bd = ang; best = i; } }
        if (best < 0) return true;
        if (step === 0 && best < 7 && !found[best]) {
          found[best] = true; k.sfx('dew', { vel: 0.5 }); k.buzz(6);
          if (found.slice(0, 7).every(Boolean)) step = 1;
          emit();
        } else if (step === 1 && best === 7) {
          found[7] = true; step = 2; k.sfx('dew', { vel: 0.7 }); k.buzz(12);
          k.log({ kind: 'dipper', text: `斗柄指${handle()}` });
          emit();
        }
        return true;
      },
    },
    cmd(name) { if (name === 'done') k.exitAct(); },
  };
  return act;
}
