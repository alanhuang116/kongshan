/**
 * 台子上看草木：一种一种看（素地上摆几株），或整园一起看（floraAll，落在真的地上，网址里加 &ground=0）。
 *   /ink.html?m=peach&t=9&season=spring         单看一种：peach willow pine plum bamboo mulberry elm wood crops mums lotus
 *   /ink.html?m=reeds&ground=0  /  m=grass&ground=0  /  m=homes&ground=0     芦苇、地上的草、人家门前屋后：整园搭好，镜头摆在渡口 / 溪边 / 村里看
 *   /ink.html?m=floraAll&ground=0&tx=..&tz=..&d=..       整园（&land=0 不要地）
 *   …&to=winter                                  先按 season 搭好，过半秒换到 to（看换季的过渡）
 *   /ink.html?m=tiles&a=tree|bloom|ever|field|petal      看笔触图集的每一格
 * window.__flora 是当前这一份，可以现场 setSeason；window.__floraStat() 数三角与绘制。
 */
import * as THREE from 'three';
import { dabMat, dabMesh, type Dab } from '../../world/ink/ink';
import { atlas } from '../../world/ink/brush';
import type { Season } from '../../world/env/atmos';
import type { Plot, Tree, TreeKind } from '../../world/site';
import { buildFlora, type Plan } from '../../world/env/flora/build';
import { createFlora, type Flora } from '../../world/env/flora';
import { BLOOM, EVER, TREE } from '../../world/env/flora/tiles';
import { FIELD, PETAL } from '../../world/env/flora/tiles2';
import type { LabCtx, LabMake, LabModel } from '../ink-lab';

const qs = new URLSearchParams(location.search);
const tr = (kind: TreeKind, x: number, z: number, s = 1, seed = 1, r = 0.2): Tree => ({ kind, x, z, s, seed: seed * 7919 + 13, r });
const flat = () => 0;
type View = Partial<{ az: number; el: number; d: number; tx: number; ty: number; tz: number }>;

/** 数一数这一份草木此刻画多少三角、几次绘制（只算看得见的） */
function stat(f: Flora) {
  let tris = 0, calls = 0;
  const rows: string[] = [];
  f.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const g = m.geometry as THREE.InstancedBufferGeometry, n = g.isInstancedBufferGeometry ? g.instanceCount * 2 : (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += n; calls++; rows.push(`${m.name} ${Math.round(n)}`);
  });
  return { tris: Math.round(tris), calls, rows };
}
function run(ctx: LabCtx, f: Flora, obj: THREE.Object3D, view: View, ms = 0): LabModel {
  const w = window as unknown as Record<string, unknown>;
  w.__flora = f; w.__floraStat = () => stat(f); w.__floraMs = ms;
  const to = qs.get('to') as Season | null, player = new THREE.Vector3(Number(qs.get('tx') ?? 0), 0, Number(qs.get('tz') ?? 0));
  let done = false;
  return { obj, view, update: (dt, t) => { if (to && !done && t > 0.5) { done = true; f.setSeason(to); } f.update(dt, t, { night: ctx.atmos.night, wind: ctx.atmos.wind, player }); } };
}
const show = (ctx: LabCtx, plan: Plan, view: View): LabModel => { const f = buildFlora({ q: ctx.q, season: ctx.season }, plan); return run(ctx, f, f.group, view); };

/** 整园，落在真的地上（地与水是别人搭的：没有、或一时坏了，就只看草木） */
async function whole(ctx: LabCtx, view: View): Promise<LabModel> {
  const t0 = performance.now(), f = createFlora({ q: ctx.q, season: ctx.season }), ms = performance.now() - t0, g = new THREE.Group();
  g.add(f.group);
  if (qs.get('land') !== '0') try { const m = await import('../../world/env/land'); g.add(m.createLand(ctx.q, ctx.season).group); } catch (e) { console.warn('land', e); }
  const s = stat(f);
  console.info(`flora 建 ${ms.toFixed(0)}ms  三角 ${s.tris}  绘制 ${s.calls}`);
  return run(ctx, f, g, view, ms);
}

/** 图集的每一格：一格一笔，排成一面 */
const tiles: LabMake = ({ q }) => {
  const which = qs.get('a') ?? 'tree', S = which === 'bloom' ? BLOOM : which === 'ever' ? EVER : which === 'field' ? FIELD : which === 'petal' ? PETAL : TREE;
  const pink = which === 'bloom' || which === 'petal';
  const A = atlas(S.tiles, S.cols, Math.round(192 * q.tex), 11), dabs: Dab[] = [];
  const rows = Math.ceil(S.tiles.length / S.cols);
  S.tiles.forEach((_, i) => dabs.push({ x: (i % S.cols) * 1.12, y: (rows - 1 - Math.floor(i / S.cols)) * 1.12 + 0.6, z: 0, size: 1, tile: i, nx: -0.4, ny: 0.6, nz: 0.6, sway: 0 }));
  const m = pink ? dabMat({ ...A, pig: which === 'petal' ? [1, 0.9, 0.56] : [0.985, 0.8, 0.83], accent: which === 'petal' ? [0.78, 0.8, 0.5] : [0.8, 0.25, 0.33], dens: 0.95, shade: 1.3, body: 0.75 }) : dabMat({ ...A, pig: [0.6, 0.72, 0.56], accent: [0.88, 0.62, 0.48], dens: 1.3, shade: 1.6 });
  return { obj: dabMesh(dabs, m), view: { az: 0, el: 0, d: 9.5, tx: ((S.cols - 1) * 1.12) / 2, ty: (rows * 1.12) / 2 + 0.05, tz: 0 } };
};
/** 六样庄稼各一小畦（三列两行），垄向一横一竖 */
const cropPlots = (): Plot[] => (['wheat', 'rape', 'bean', 'veg', 'plough', 'fallow'] as const).map((crop, i) => ({ crop, rows: (i % 2) as 0 | 1, x0: -21 + (i % 3) * 14.5, x1: -21 + (i % 3) * 14.5 + 13, z0: -Math.floor(i / 3) * 12.5 - 10, z1: -Math.floor(i / 3) * 12.5, y: 0 }));

export const MODELS: Record<string, LabMake> = {
  tiles,
  peach: (ctx) => show(ctx, { ground: flat, trees: [tr('peach', -3.2, 0.6, 1.05, 1), tr('peach', 2.6, -0.4, 1.15, 2), tr('peach', 7.8, 1.2, 0.95, 3), tr('peach', -0.5, -6.5, 1.2, 4), tr('peach', 5.5, -7.5, 1.0, 5), tr('peach', -8.5, -4, 1.1, 6)] }, { az: 8, el: 6, d: 13, tx: 1.5, ty: 1.9, tz: -1 }),
  willow: (ctx) => show(ctx, { ground: flat, water: () => [1, 0.4], trees: [tr('willow', -5, 0, 1.2, 1), tr('willow', 7, -3, 1.05, 2)] }, { az: 10, el: 5, d: 26, tx: 1, ty: 4.6, tz: -1 }),
  // 两株松与老梅：照院里的相对位置摆（石桌在西）
  pine: (ctx) => show(ctx, { ground: flat, focus: { x: -6, z: 1.8 }, trees: [tr('pine', 0, 0, 1.12, 1), tr('pine', 0.4, 4.4, 0.92, 2)] }, { az: -70, el: 4, d: 26, tx: -1, ty: 5.2, tz: 2 }),
  plum: (ctx) => show(ctx, { ground: flat, focus: { x: -3, z: -2 }, trees: [tr('plum', 0, 0, 1, 3)] }, { az: -20, el: 6, d: 8.5, tx: -0.4, ty: 1.9, tz: 0 }),
  elm: (ctx) => show(ctx, { ground: flat, trees: [tr('elm', 0, 0, 1.5, 1)] }, { az: 15, el: 4, d: 36, tx: 0, ty: 6.5, tz: 0 }),
  mulberry: (ctx) => show(ctx, { ground: flat, trees: [0, 1, 2, 3].flatMap((i) => [0, 1].map((j) => tr('mulberry', -9 + i * 6.6, -j * 6, 0.9 + 0.07 * ((i * 3 + j) % 4), i * 2 + j + 1))) }, { az: 14, el: 7, d: 19, tx: 1, ty: 1.7, tz: -3 }),
  wood: (ctx) => show(ctx, { ground: flat, scenery: (t) => (t.z < -15 ? (t.z > -30 ? 1 : 2) : 0), trees: [
    ...[0, 1, 2, 3].map((i) => tr('wood', -15 + i * 10, (i % 2) * 3, 0.95 + 0.1 * i, i + 1)),
    ...Array.from({ length: 22 }, (_, i) => tr('wood', -40 + (i * 37) % 80, -20 - ((i * 53) % 34), 0.9 + ((i * 7) % 6) * 0.1, 20 + i)),
  ] }, { az: 5, el: 5, d: 38, tx: 0, ty: 5, tz: 0 }),
  bamboo: (ctx) => show(ctx, { ground: flat, trees: [tr('bamboo', -5, 0, 1.1, 1, 1.1), tr('bamboo', 1.5, -3, 1.25, 2, 1.1), tr('bamboo', 8, 0.5, 0.95, 3, 1.1), tr('bamboo', -1, -9, 1.2, 4, 1.1), tr('bamboo', 6, -8, 1.0, 5, 1.1)] }, { az: 8, el: 4, d: 26, tx: 1.5, ty: 5, tz: -2 }),
  crops: (ctx) => show(ctx, { ground: flat, trees: [], plots: cropPlots() }, { az: 12, el: 14, d: 34, tx: 0, ty: 0.5, tz: -11 }),
  mums: (ctx) => show(ctx, { ground: flat, trees: [], mums: { x0: -2.7, x1: 2.7, z0: -3, z1: 3 }, veg: { x0: 6, x1: 16, z0: -6, z1: 5 } }, { az: 20, el: 14, d: 13, tx: 3, ty: 0.6, tz: 0 }),
  lotus: (ctx) => show(ctx, { ground: flat, trees: [], pond: { x: 0, z: 0, rx: 8, rz: 6, y: 0.02 } }, { az: -60, el: 9, d: 17, tx: 0.5, ty: 0.5, tz: -0.5 }),
  // 芦苇、草：长在哪要查总图，所以搭整园，把镜头摆到渡口 / 桃林的溪边
  reeds: (ctx) => whole(ctx, { az: -20, el: 5, d: 22, tx: 128, ty: 0.6, tz: 226 }),
  grass: (ctx) => whole(ctx, { az: 200, el: 9, d: 12, tx: -100, ty: 6.2, tz: 37 }),
  // 人家门前屋后的零碎（果树、蜀葵、南瓜、葱）：镜头摆在村里
  homes: (ctx) => whole(ctx, { az: 20, el: 14, d: 42, tx: 76, ty: 7, tz: 6 }),
  floraAll: (ctx) => whole(ctx, { az: 250, el: 12, d: 60, tx: 0, ty: 8, tz: 24 }),
};
