/**
 * 台子上的屋舍与器物（/ink.html?m=<名字>&ground=0）：
 *   hall 草堂 · hallInside 草堂（屋顶、南墙隐去，从南边俯看屋里）· gate 柴门与门联 · fence 竹篱与院里的东西 · bridge 小石桥 ·
 *   pavilion 观物亭 · house 邻家一户 · school 村塾 · well 井与槐下 · props 田间、渡口、修桥处的零碎 · buildAll 全部（各在总图上的位置）。
 * 都摆在总图上的真位置，脚下是真的地（env/land.ts）；不要地加 &land=0。别的参数：
 *   &lamp=0…1 灯火（不给就跟天时走）  &hide=roof,front 隐去草堂的屋顶 / 南墙  &dump=1 把挂点、可拿的东西、脚印打到控制台（warn）
 */
import * as THREE from 'three';
import '../../app/styles/fonts.css';
import { assemble, type Buildings, type Piece } from '../../world/build/make';
import { createLand } from '../../world/env/land';
import { SITE, YARD_Y, ground, houseY, streamAt } from '../../world/site';
import type { LabCtx, LabMake, LabModel } from '../ink-lab';

const qs = new URLSearchParams(location.search);
type View = Partial<{ az: number; el: number; d: number; tx: number; ty: number; tz: number }>;

async function show(ctx: LabCtx, pieces: Piece[] | undefined, view: View, o: { hide?: string[]; sub?: string[] } = {}): Promise<LabModel> {
  const g = new THREE.Group();
  if (qs.get('land') !== '0') g.add(createLand(ctx.q, ctx.season).group);
  const t0 = performance.now();
  const B: Buildings = await assemble({ q: ctx.q }, pieces, o.sub);
  const ms = performance.now() - t0;
  g.add(B.group);
  const hide = (qs.get('hide') ?? '').split(',').concat(o.hide ?? []);
  if (hide.includes('roof')) B.hallRoof.visible = false;
  if (hide.includes('front')) B.hallFront.visible = false;
  const st = B.group.userData.stats as { tris: number; calls: number };
  console.warn(`屋舍：建 ${ms.toFixed(0)}ms · 三角 ${st.tris} · 绘制 ${st.calls} · 挂点 ${Object.keys(B.anchors).length} · 可拿 ${Object.keys(B.parts).length}`);
  if (qs.get('dump') === '1') {
    const f = (n: number) => Math.round(n * 100) / 100;
    const A: Record<string, unknown> = {}, P: Record<string, unknown> = {};
    for (const [k, a] of Object.entries(B.anchors)) A[k] = [f(a.position.x), f(a.position.y), f(a.position.z), f(a.rotation.y)];
    const w = new THREE.Vector3();
    for (const [k, p] of Object.entries(B.parts)) { p.getWorldPosition(w); P[k] = [f(w.x), f(w.y), f(w.z)]; }
    console.warn('ANCHORS ' + JSON.stringify(A));
    console.warn('PARTS ' + JSON.stringify(P));
    console.warn('SOLIDS ' + JSON.stringify((B.group.userData.solids as Array<Record<string, unknown>>).map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === 'number' ? f(v) : v])))));
  }
  (window as unknown as Record<string, unknown>).__build = B;
  const lampQ = qs.get('lamp');
  return {
    obj: g, view,
    update(dt, t) { B.setLamp(lampQ !== null ? Number(lampQ) : ctx.atmos.lamp); B.update(dt, t); },
  };
}

const H = SITE.hall, G = SITE.gate, Bq = SITE.bridge, P = SITE.pavilion;
const house = (id: string) => SITE.houses.find((h) => h.id === id)!;
export const MODELS: Record<string, LabMake> = {
  hall: (c) => show(c, ['hall', 'yard'], { az: 18, el: 7, d: 19, tx: H.x, ty: YARD_Y + 2.2, tz: H.z + 1 }),
  hallInside: (c) => show(c, ['hall'], { az: 0, el: 40, d: 12.5, tx: H.x, ty: YARD_Y + 0.9, tz: H.z - 0.3 }, { hide: ['roof', 'front'] }),
  gate: (c) => show(c, ['hall', 'yard'], { az: 8, el: 5, d: 7.5, tx: G.x, ty: YARD_Y + 1.35, tz: G.z }),
  fence: (c) => show(c, ['hall', 'yard'], { az: 35, el: 24, d: 36, tx: 2, ty: YARD_Y + 1, tz: 6 }),
  bridge: (c) => show(c, ['waterside'], { az: 55, el: 12, d: 13, tx: Bq.x, ty: streamAt(Bq.x, Bq.z).y + 0.8, tz: Bq.z }),
  pavilion: (c) => show(c, ['pavilion'], { az: 120, el: 8, d: 12, tx: P.x, ty: ground(P.x, P.z) + 1.7, tz: P.z }),
  house: (c) => { const h = house(qs.get('id') ?? 'a'); return show(c, ['village'], { az: 20, el: 10, d: 22, tx: h.x, ty: houseY(h.id) + 2, tz: h.z }); },
  school: (c) => { const h = house('school'); return show(c, ['village'], { az: 8, el: 6, d: 17, tx: h.x, ty: houseY(h.id) + 1.6, tz: h.z + 1 }); },
  well: (c) => show(c, ['village'], { az: 30, el: 12, d: 9, tx: SITE.well.x, ty: ground(SITE.well.x, SITE.well.z) + 1, tz: SITE.well.z }),
  props: (c) => show(c, ['fields', 'waterside'], { az: 40, el: 12, d: 16, tx: SITE.plank.x, ty: streamAt(SITE.plank.x, SITE.plank.z).y + 1, tz: SITE.plank.z }),
  more: (c) => show(c, ['more', 'village', 'waterside'], { az: 20, el: 14, d: 14, tx: SITE.more.teaShed.x, ty: ground(SITE.more.teaShed.x, SITE.more.teaShed.z) + 1.2, tz: SITE.more.teaShed.z }),
  buildAll: (c) => show(c, undefined, { az: 20, el: 26, d: 70, tx: 4, ty: YARD_Y, tz: 8 }),
};
