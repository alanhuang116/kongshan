/**
 * 看模型的台子（只在开发时用）：/lab.html?m=模型名&h=时刻&w=天气&az=方位&el=仰角&d=距离&ty=看的高度&q=画质&hud=0
 * 模型在 models.ts 里登记。鼠标拖动转、滚轮远近。window.__ready 为真时可以截图。
 */
import * as THREE from 'three';
import '../app/styles/fonts.css';
import { World, detectQuality } from '../world/core/World';
import { createTextures, fontsReady, setTexScale } from '../world/core/tex';
import { adopt, createMats } from '../world/core/mats';
import { Atmos, type Season, type Weather } from '../world/env/atmos';
import { MODELS, type LabCtx } from './models';

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qs.has(k) ? Number(qs.get(k)) : d);

async function main() {
  const q = detectQuality(qs.get('q'));
  setTexScale(q.tex);
  const world = new World(document.getElementById('c') as HTMLCanvasElement, q);
  await fontsReady('空山大雄宝殿');
  const T = createTextures();
  const mats = createMats(T);
  const atmos = new Atmos(world.scene, q.shadow);
  atmos.setSeason((qs.get('s') as Season) ?? 'autumn');
  atmos.setHour(num('h', 9), true);
  atmos.setWeather((qs.get('w') as Weather) ?? 'clear', true);
  const ctx: LabCtx = { world, mats, T, atmos, q };

  const name = qs.get('m') ?? 'roof';
  const make = MODELS[name];
  const hud = document.getElementById('hud')!;
  if (!make) { hud.textContent = `没有模型 ${name}\n可用：${Object.keys(MODELS).join(' ')}`; return; }
  const t0 = performance.now();
  const obj = await make(ctx);
  adopt(obj);
  world.scene.add(obj);
  const buildMs = performance.now() - t0;
  if (qs.get('ground') !== '0') {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), mats.paving);
    const uv = g.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 400, uv.getY(i) * 400);
    g.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(uv.count * 3).fill(1), 3));
    g.receiveShadow = true; g.position.y = num('gy', 0);
    world.scene.add(g);
  }

  // 轨道镜头
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const st = { az: num('az', 30), el: num('el', 14), d: num('d', Math.max(size.x, size.y, size.z) * 1.5), tx: num('tx', ctr.x), ty: num('ty', ctr.y), tz: num('tz', ctr.z) };
  world.camera.fov = num('fov', 38);
  world.camera.updateProjectionMatrix();
  const place = () => {
    const a = (st.az * Math.PI) / 180, e = (st.el * Math.PI) / 180;
    world.camera.position.set(st.tx + st.d * Math.cos(e) * Math.sin(a), st.ty + st.d * Math.sin(e), st.tz + st.d * Math.cos(e) * Math.cos(a));
    world.camera.lookAt(st.tx, st.ty, st.tz);
  };
  world.input = {
    move: (p) => { st.az -= p.dx * 0.3; st.el = Math.max(-85, Math.min(89, st.el + p.dy * 0.3)); },
    wheel: (dy) => { st.d *= Math.exp(dy * 0.001); },
  };
  let tris = 0, calls = 0;
  world.tick.push((dt) => {
    atmos.update(dt);
    if (atmos.shadowDirty) { world.shadowDirty = true; atmos.shadowDirty = false; }
    atmos.bakeEnv(world.renderer);
    world.scene.environmentIntensity = atmos.envI;
    world.exposure = atmos.exposure; world.bloom = atmos.bloom;
    place();
    tris = world.stats.tris; calls = world.stats.calls;
    if (qs.get('hud') !== '0') hud.textContent = `${name}  ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} m  建 ${buildMs.toFixed(0)}ms\n三角 ${tris}  绘制 ${calls}  ${world.frameMs.toFixed(1)}ms  az ${st.az.toFixed(0)} el ${st.el.toFixed(0)} d ${st.d.toFixed(1)}`;
  });
  world.start();
  (window as unknown as Record<string, unknown>).__lab = { world, atmos, st, obj };
  setTimeout(() => { (window as unknown as Record<string, unknown>).__ready = true; }, 600);
}
main().catch((e) => { document.getElementById('hud')!.textContent = String(e?.stack ?? e); console.error(e); });
