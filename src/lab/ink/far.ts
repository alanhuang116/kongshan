/**
 * 台子上看远景（网址里加 &far=0&ground=0，关掉台子自带的那一份远景与素地）：
 *   /ink.html?m=farView&far=0&ground=0&t=9&az=…   远景 + 真的地、草木（别人搭的，没有就不要）+ 几间屋的替身——从人站的地方看
 *   /ink.html?m=farOnly&far=0&ground=0…            只有远景
 *   &land=0 / &flora=0 / &huts=0 关掉其中一样；&to=autumn 过半秒换季（看换季）
 * 台子的机位：镜头在目标 (tx,ty,tz) 的 az 方位、d 远处回头看目标——az=180 朝南看，az=270 朝东看。
 * window.__far 是当前这一份远景。
 */
import * as THREE from 'three';
import { U, wash } from '../../world/ink/ink';
import { boxUp, merge, prism, tint } from '../../world/core/geo';
import type { Season } from '../../world/env/atmos';
import { createFar } from '../../world/env/far';
import { SITE, YARD_Y, ground, houseY } from '../../world/site';
import type { LabCtx, LabMake, LabModel } from '../ink-lab';

const qs = new URLSearchParams(location.search);

/** 几间屋的替身：土墙、茅顶（只为看远景被屋挡成什么样） */
function huts(): THREE.Group {
  const g = new THREE.Group();
  const walls: THREE.BufferGeometry[] = [], roofs: THREE.BufferGeometry[] = [];
  const hut = (x: number, z: number, y: number, w: number, d: number, yaw: number, wall = 2.7) => {
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    walls.push(boxUp(w, wall, d).applyMatrix4(m));
    // 茅顶：两坡，出檐
    const rw = d / 2 + 0.9, rh = d * 0.42;
    roofs.push(prism([[-rw, 0], [rw, 0], [0, rh]], w + 1.6).rotateY(Math.PI / 2).translate(0, wall - 0.1, 0).applyMatrix4(m));
  };
  hut(SITE.hall.x, SITE.hall.z, YARD_Y, SITE.hall.w, SITE.hall.d, 0);
  hut(SITE.wing.x, SITE.wing.z, YARD_Y, SITE.wing.d, SITE.wing.w, Math.PI / 2, 2.4);
  for (const h of SITE.houses) hut(h.x, h.z, houseY(h.id), h.w, h.d, h.yaw, 2.5);
  g.add(new THREE.Mesh(merge(walls), wash({ pig: [0.91, 0.84, 0.7], dens: 1.1, shade: 1.45, grain: 0.9, strata: [2.6, 0.5] })));
  g.add(new THREE.Mesh(tint(merge(roofs), 1), wash({ pig: [0.9, 0.82, 0.62], dens: 1.5, shade: 1.5, streak: [9, 1.4, 0.5], grain: 1 })));
  return g;
}

async function make(ctx: LabCtx, near: boolean): Promise<LabModel> {
  const g = new THREE.Group(), t0 = performance.now();
  const far = createFar({ density: ctx.q.density, tex: ctx.q.tex, season: ctx.season });
  const ms = performance.now() - t0;
  g.add(far.group);
  (window as unknown as Record<string, unknown>).__far = far;
  // 数一数远景自己有多少（整个远景，不管朝哪看）
  let tris = 0, calls = 0;
  const each: string[] = [];
  far.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    calls++;
    const geo = m.geometry as THREE.BufferGeometry & { instanceCount?: number };
    const n = (geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3) * (geo.instanceCount !== undefined && Number.isFinite(geo.instanceCount) ? geo.instanceCount : 1);
    tris += n;
    each.push(`${m.name} ${Math.round(n)}`);
  });
  console.warn(`[far] 建 ${ms.toFixed(0)}ms  三角 ${Math.round(tris)}  网格 ${calls}`);
  if (qs.get('list')) console.warn('[far] ' + each.join(' · '));
  let flora: { update(dt: number, t: number, o: { night: number; wind: number; player: THREE.Vector3 }): void; setSeason(s: Season): void } | null = null;
  let land: { setSeason(s: Season): void } | null = null;
  if (near) {
    if (qs.get('land') !== '0') try { const m = await import('../../world/env/land'); const l = m.createLand(ctx.q, ctx.season); land = l; g.add(l.group); } catch (e) { console.warn('land', e); }
    if (qs.get('flora') !== '0') try { const m = await import('../../world/env/flora'); const f = m.createFlora({ q: ctx.q, season: ctx.season }); flora = f; g.add(f.group); } catch (e) { console.warn('flora', e); }
    if (qs.get('huts') !== '0') g.add(huts());
  }
  const to = qs.get('to') as Season | null, player = new THREE.Vector3();
  let done = false, season = ctx.season;
  return {
    obj: g,
    view: { az: 180, el: 2, d: 12, tx: 0, ty: 10.5, tz: 10 },
    update(dt, t) {
      if (to && !done && t > 0.5) { done = true; season = to; far.setSeason(to); flora?.setSeason(to); land?.setSeason(to); ctx.atmos.setSeason(to); }
      const cam = ctx.world.camera;
      // 与正式的世界一样：镜头高了，「远处褪成墨色」的起点往远处推
      const camH = Math.max(0, cam.position.y - ground(cam.position.x, cam.position.z) - 4.5);
      U.uFar.value.y = 70 + camH * 2.2; U.uFar.value.z = 420 + camH * 5 - 120 * Math.max(ctx.atmos.w.mist, ctx.atmos.w.rain);
      far.update(dt, t, { camera: cam, hour: ctx.atmos.hour, night: ctx.atmos.night, season, wind: ctx.atmos.wind });
      player.set(cam.position.x, 0, cam.position.z);
      flora?.update(dt, t, { night: ctx.atmos.night, wind: ctx.atmos.wind, player });
    },
  };
}

export const MODELS: Record<string, LabMake> = {
  farView: (ctx) => make(ctx, true),
  farOnly: (ctx) => make(ctx, false),
};

/**
 * 不经台子、自己起一份（参数与台子一样）。台子把 src/lab/ink 下所有人的文件一并装进来，别人的模块一时坏了它就起不来；
 * 截图脚本可以直接调这个：页面里只要有 canvas#c 与 #hud，import 这个文件、调 runFarLab() 即可。
 */
export async function runFarLab(): Promise<void> {
  const num = (k: string, d: number) => (qs.has(k) ? Number(qs.get(k)) : d);
  const { World, detectQuality } = await import('../../world/core/World');
  const { Atmos } = await import('../../world/env/atmos');
  const q = detectQuality(qs.get('q'));
  const world = new World(document.getElementById('c') as HTMLCanvasElement, q), hud = document.getElementById('hud');
  const atmos = new Atmos(world.scene, world.painter);
  const season = (qs.get('season') as Season) ?? 'spring';
  atmos.setSeason(season); atmos.setHour(num('t', 9), true); atmos.setWeather((qs.get('w') as 'clear' | 'mist' | 'rain' | 'snow') ?? 'clear', true);
  const model = (await make({ world, q, atmos, season }, qs.get('m') !== 'farOnly')) as { obj: THREE.Object3D; update(dt: number, t: number): void };
  world.scene.add(model.obj);
  const st = { az: num('az', 180), el: num('el', 2), d: num('d', 12), tx: num('tx', 0), ty: num('ty', 10.5), tz: num('tz', 10) };
  world.camera.fov = num('fov', 38);
  world.camera.updateProjectionMatrix();
  const put = () => {
    const a = (st.az * Math.PI) / 180, e = (st.el * Math.PI) / 180;
    world.camera.position.set(st.tx + st.d * Math.cos(e) * Math.sin(a), st.ty + st.d * Math.sin(e), st.tz + st.d * Math.cos(e) * Math.cos(a));
    world.camera.lookAt(st.tx, st.ty, st.tz);
  };
  world.input = { move: (p) => { st.az -= p.dx * 0.3; st.el = Math.max(-30, Math.min(89, st.el + p.dy * 0.3)); }, wheel: (dy) => { st.d *= Math.exp(dy * 0.001); } };
  world.tick.push((dt, t) => {
    atmos.update(dt, t); model.update(dt, t); put();
    if (hud && qs.get('hud') !== '0') hud.textContent = `far  三角 ${world.stats.tris}  绘制 ${world.stats.calls}  ${world.frameMs.toFixed(1)}ms  az ${st.az.toFixed(0)} el ${st.el.toFixed(0)}`;
  });
  put();
  atmos.update(0, 0);
  await world.compile();
  world.start();
  const W = window as unknown as Record<string, unknown>;
  W.__lab = { world, atmos, U, st, model, painter: world.painter, THREE };
  setTimeout(() => { W.__ready = true; }, 500);
}
