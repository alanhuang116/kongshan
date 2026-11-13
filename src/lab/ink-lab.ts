/**
 * 看模型的台子（只在开发时用）：在正式的画法、天时、远景底下看一个模型。
 *   /ink.html?m=<模型名>&t=<几点，如 9、18.1、22>&season=spring|summer|autumn|winter&w=clear|mist|rain|snow
 *            &az=&el=&d=&tx=&ty=&tz=&fov=&far=0|1&ground=0|1&hud=0|1&q=low|mid|high
 * 模型登记在 src/lab/ink/*.ts 里：每个文件 export const MODELS = { 名字: (ctx) => 物体 }（各人用各人的文件，互不相扰）。
 * 鼠标拖动转、滚轮远近。window.__ready 为真时可以截图；window.__lab 里有 world、atmos、U、painter，可以现场改着看。
 */
import * as THREE from 'three';
import { World, detectQuality, type Quality } from '../world/core/World';
import { U, wash } from '../world/ink/ink';
import { Atmos, type Season, type Weather } from '../world/env/atmos';
import { createFar } from '../world/env/far';

export interface LabCtx { world: World; q: Quality; atmos: Atmos; season: Season }
export type LabModel = THREE.Object3D | { obj: THREE.Object3D; update?(dt: number, t: number): void; /** 默认的机位 */ view?: Partial<{ az: number; el: number; d: number; tx: number; ty: number; tz: number }> };
export type LabMake = (ctx: LabCtx) => LabModel | Promise<LabModel>;

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qs.has(k) ? Number(qs.get(k)) : d);
const REG = import.meta.glob<{ MODELS?: Record<string, LabMake> }>('./ink/*.ts');
const MODELS: Record<string, LabMake> = {};

async function main() {
  for (const [file, load] of Object.entries(REG)) { try { Object.assign(MODELS, (await load()).MODELS ?? {}); } catch (e) { console.warn(`${file} 没能装上`, e); } }
  const q = detectQuality(qs.get('q'));
  const world = new World(document.getElementById('c') as HTMLCanvasElement, q);
  const scene = world.scene, hud = document.getElementById('hud')!;
  const atmos = new Atmos(scene, world.painter);
  const season = (qs.get('season') as Season) ?? 'spring';
  atmos.setSeason(season); atmos.setHour(num('t', 9), true); atmos.setWeather((qs.get('w') as Weather) ?? 'clear', true);
  const far = qs.get('far') !== '0' ? createFar({ density: q.density, tex: q.tex, season }) : null;
  if (far) scene.add(far.group);
  if (qs.get('ground') !== '0') {
    // 一块素地：极淡的土色
    const g = new THREE.PlaneGeometry(600, 600, 1, 1).rotateX(-Math.PI / 2).toNonIndexed();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 600, uv.getY(i) * 600);
    scene.add(new THREE.Mesh(g, wash({ pig: [0.9, 0.9, 0.82], dens: 0.5, flat: 1, grain: 0.3, line: 0, streak: [0.09, 1.1, 0.2] })));
  }
  const name = qs.get('m') ?? '';
  const make = MODELS[name];
  if (!make) { hud.textContent = `没有模型「${name}」\n可用：${Object.keys(MODELS).sort().join('  ')}`; }
  const t0 = performance.now();
  const made = make ? await make({ world, q, atmos, season }) : new THREE.Group();
  const model = made instanceof THREE.Object3D ? { obj: made } : made;
  scene.add(model.obj);
  const buildMs = performance.now() - t0;

  const box = new THREE.Box3().setFromObject(model.obj);
  const size = box.isEmpty() ? new THREE.Vector3(4, 3, 4) : box.getSize(new THREE.Vector3()), ctr = box.isEmpty() ? new THREE.Vector3(0, 1.5, 0) : box.getCenter(new THREE.Vector3());
  const v = (model as { view?: Record<string, number> }).view ?? {};
  const st = { az: num('az', v.az ?? 25), el: num('el', v.el ?? 10), d: num('d', v.d ?? Math.max(size.x, size.y, size.z) * 1.7 + 2), tx: num('tx', v.tx ?? ctr.x), ty: num('ty', v.ty ?? ctr.y), tz: num('tz', v.tz ?? ctr.z) };
  world.camera.fov = num('fov', 38);
  world.camera.updateProjectionMatrix();
  const put = () => {
    const a = (st.az * Math.PI) / 180, e = (st.el * Math.PI) / 180;
    world.camera.position.set(st.tx + st.d * Math.cos(e) * Math.sin(a), st.ty + st.d * Math.sin(e), st.tz + st.d * Math.cos(e) * Math.cos(a));
    world.camera.lookAt(st.tx, st.ty, st.tz);
  };
  world.input = {
    move: (p) => { st.az -= p.dx * 0.3; st.el = Math.max(-10, Math.min(89, st.el + p.dy * 0.3)); },
    wheel: (dy) => { st.d *= Math.exp(dy * 0.001); },
  };
  world.tick.push((dt, t) => {
    atmos.update(dt, t);
    far?.update(dt, t, { camera: world.camera, hour: atmos.hour, night: atmos.night, season, wind: atmos.wind });
    model.update?.(dt, t);
    put();
    if (qs.get('hud') !== '0') hud.textContent = `${name}  ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} m  建 ${buildMs.toFixed(0)}ms\n三角 ${world.stats.tris}  绘制 ${world.stats.calls}  ${world.frameMs.toFixed(1)}ms  az ${st.az.toFixed(0)} el ${st.el.toFixed(0)} d ${st.d.toFixed(1)}`;
  });
  put();
  atmos.update(0, 0);
  await world.compile();
  world.start();
  (window as unknown as Record<string, unknown>).__lab = { world, atmos, U, st, model, painter: world.painter, THREE };
  setTimeout(() => { (window as unknown as Record<string, unknown>).__ready = true; }, 500);
}

main().catch((e) => { document.getElementById('hud')!.textContent = String(e?.stack ?? e); console.error(e); });
