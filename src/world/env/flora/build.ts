/**
 * 把草木搭出来：照一张「单子」（Plan：哪些树、地势、田、菜畦、菊圃、池）一样样长好，并成二十来次绘制。
 * 四季不重建：树上的每一层（花、叶、枯枝……）各有四季的颜料、浓淡与疏密，换季时慢慢过渡过去（layers.ts）；
 * 田里、水边那些四季形状不同的（庄稼、芦苇、菊、荷），每季一套（field.ts），用到时才搭、搭过留着，换季时一套淡出、一套淡入。
 *
 * index.ts 的 createFlora 用总图（site.ts）开单子（plan.ts）；台子（src/lab/ink/flora.ts）用小单子单看一种。
 */
import * as THREE from 'three';
import type { Season } from '../atmos';
import type { Flora, FloraOpts } from './index';
import { dabMat, dabMesh, wash } from '../../ink/ink';
import { atlas } from '../../ink/brush';
import type { Plot, Rect, Tree } from '../../site';
import { rand } from './kit';
import { LAYERS, Sink } from './sink';
import { DEFS, Layer, type AtlasId } from './layers';
import { BLOOM, EVER, TREE } from './tiles';
import { FIELD, PETAL } from './tiles2';
import { peach } from './peach';
import { willow } from './willow';
import { pine, type PineOpts } from './pine';
import { plum } from './plum';
import { backdrop, broad, fruitSpec, huaiSpec, mulberry, woodSpec } from './broad';
import { bamboo } from './bamboo';
import { dampAndWater, groundCover, type Cover, type Reed } from './cover';
import type { ExtraKind, Extras } from './extras';
import { fieldFixed, fieldSet, type FieldPlan, type Pond } from './field';

export interface Plan {
  trees: Tree[];
  ground: (x: number, z: number) => number;
  /** 院里那几株（梅、松）朝哪边探：石桌 */
  focus?: { x: number; z: number };
  /** 屋的占地：松的低枝避开 */
  walls?: Rect[];
  /** 柳朝哪边斜（水在哪边）；不给就随意 */
  water?: (x: number, z: number) => [number, number] | null;
  /** 只作景的远树：0 不是，1 近些的，2 远的 */
  scenery?: (t: Tree) => 0 | 1 | 2;
  /** 铺草的范围（照总图上的路、田、水、屋来铺；台子上的小单子不给）。芦苇、野花的位置也在这时算 */
  cover?: Rect;
  /** 田、菜畦、菊圃、池（荷） */
  plots?: Plot[]; veg?: Rect; mums?: Rect; pond?: Pond;
  /** 这一处能不能种（菜畦一角有路穿过） */
  clear?: (x: number, z: number) => boolean;
  /** 不铺草时单给的芦苇 */
  reeds?: Reed[];
  /** 人家门前屋后的零碎：果树、门边的花、瓜架上的藤、篱上的牵牛、井边的苔、水边的菖蒲（extras.ts） */
  extras?: Extras;
}

/** 两株松：一直一欹 */
const PINES: PineOpts[] = [
  { H: 9.4, r0: 0.3, lean: 0.24, twist: 0.4, flatTop: 0.35, branches: 9, first: 0.45, reach: 4.6 },
  { H: 8.9, r0: 0.3, lean: 0.56, twist: 0.66, flatTop: 0.62, branches: 8, first: 0.42, reach: 5.0 },
];
/** 竹竿上的节：一格一节（节上一道深环，环下一线白粉） */
function nodeMap(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 64);
  g.fillStyle = 'rgb(120,122,112)'; g.fillRect(0, 0, 4, 3);
  g.fillStyle = 'rgb(205,206,196)'; g.fillRect(0, 3, 4, 2); g.fillRect(0, 62, 4, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
/** 一季的一套（田、菜、菊、荷、芦苇）：淡彩一层、粉一层、荷叶的面 */
interface FieldMeshes { wash: THREE.Mesh | null; body: THREE.Mesh | null; pads: THREE.Mesh | null }
const BODY = 0.8;

export function buildFlora(o: FloraOpts, plan: Plan): Flora {
  const q = o.q, group = new THREE.Group();
  group.name = 'flora';
  const S = new Sink(), blooms: Array<{ p: THREE.Vector3; w: number }> = [];
  const lite = q.density < 0.7;
  /** 让树自己的 +x 朝着世界里的 (dx, dz) */
  const yawTo = (dx: number, dz: number) => Math.atan2(-dz, dx);

  // —— 树 ——
  let nPine = 0;
  for (const t of plan.trees) {
    const R = rand(t.seed), y = plan.ground(t.x, t.z), f = plan.focus;
    const toFocus = f ? yawTo(f.x - t.x, f.z - t.z) : R.r(0, 6.283);
    switch (t.kind) {
      case 'peach': {
        S.place(t.x, y, t.z, R.r(0, 6.283), t.s);
        const bloom = R.r(0.78, 1.15), d = R.r(0.84, 1.03);
        const top = peach(S, R, { tint: [1, d, d * R.r(0.98, 1.03)], bloom, lite });
        blooms.push({ p: S.world(top.x, top.y, top.z), w: bloom * t.s });
        break;
      }
      case 'willow': {
        const w = plan.water?.(t.x, t.z);
        S.place(t.x, y, t.z, w ? yawTo(w[0], w[1]) + R.pm(0.3) : R.r(0, 6.283), t.s);
        willow(S, R, { lite });
        break;
      }
      case 'pine': {
        const spec = { ...PINES[nPine++ % PINES.length], lite }, yaw = toFocus + R.pm(0.25);
        // 屋在哪边（换到树自己的坐标里）：低枝别往那边伸
        for (const w of plan.walls ?? []) {
          const nx = Math.max(w.x0, Math.min(w.x1, t.x)) - t.x, nz = Math.max(w.z0, Math.min(w.z1, t.z)) - t.z;
          if (Math.hypot(nx, nz) < 4.5) { const cx = (w.x0 + w.x1) / 2 - t.x, cz = (w.z0 + w.z1) / 2 - t.z, c = Math.cos(yaw), s = Math.sin(yaw); spec.avoid = Math.atan2(cx * s + cz * c, cx * c - cz * s); }
        }
        S.place(t.x, y, t.z, yaw, t.s);
        pine(S, R, spec);
        break;
      }
      case 'plum': S.place(t.x, y, t.z, toFocus + R.pm(0.2), t.s); plum(S, R, { lite }); break;
      case 'elm': S.place(t.x, y, t.z, R.r(0, 6.283), t.s); broad(S, R, huaiSpec(R, lite)); break;
      case 'mulberry': S.place(t.x, y, t.z, R.r(0, 6.283), t.s); mulberry(S, R, { lite }); break;
      case 'bamboo': S.place(t.x, y, t.z, R.r(0, 6.283), t.s); bamboo(S, R, { spread: t.r * 2.4, culms: Math.round(R.r(13, 17) * (0.55 + 0.45 * q.density)), lite }); break;
      case 'wood': {
        const far = plan.scenery?.(t) ?? 0;
        S.place(t.x, y, t.z, R.r(0, 6.283), t.s);
        if (far) backdrop(S, R, { near: far === 1 }); else broad(S, R, woodSpec(R, lite));
        break;
      }
    }
  }

  // —— 人家的果树（枣、柿、石榴用杂树的长法，各换一副冠；杏照桃的长法，大些、花近白）；茶棚边的老柳 ——
  const ex = plan.extras ?? null, fruit: FieldPlan['fruit'] = [];
  for (const t of ex?.trees ?? []) {
    const R = rand(t.seed), y = plan.ground(t.x, t.z), yaw = t.to ? yawTo(t.to[0], t.to[1]) + R.pm(0.3) : R.r(0, 6.283);
    S.place(t.x, y, t.z, yaw, t.s);
    if (t.kind === 'willow') willow(S, R, { lite });
    else if (t.kind === 'apricot') peach(S, R, { tint: [1, 1.13, 1.14], bloom: 0.8, lite });
    else { const tips: THREE.Vector3[] = []; broad(S, R, fruitSpec(t.kind, R, lite), tips); fruit.push({ kind: t.kind as ExtraKind, tips }); }
  }

  // —— 地上的草；潮处的苔、水边的菖蒲；田里不变的架与垄 ——
  const cov: Cover = plan.cover ? groundCover(S, plan.cover, q.density) : { wild: [], lane: [], bund: [], reeds: [] };
  if (ex) dampAndWater(S, ex, q.density);
  const fp: FieldPlan = { plots: plan.plots ?? [], veg: plan.veg ?? null, mums: plan.mums ?? null, pond: plan.pond ?? null, reeds: plan.reeds ?? cov.reeds, wild: cov.wild, lane: cov.lane, bund: cov.bund, extras: ex, fruit, ground: plan.ground, clear: plan.clear ?? (() => true), density: q.density };
  const hasField = fp.plots.length > 0 || !!fp.veg || !!fp.mums || !!fp.pond || fp.reeds.length > 0 || fp.wild.length > 0 || !!ex;
  if (hasField) fieldFixed(S, fp);

  // —— 面：干枝、松皮、竹竿、垄 ——
  const mats = {
    bark: wash({ pig: [1, 1, 1], dens: 2.0, shade: 1.45, streak: [9, 1.6, 0.5], sway: 1, grain: 2, snow: 0.7 }),
    pineBark: wash({ pig: [1, 1, 1], dens: 1.7, shade: 1.5, crack: [0.17, 0.5], streak: [6, 1.2, 0.3], sway: 1, grain: 2, snow: 0.6 }),
    culm: wash({ pig: [1, 1, 1], dens: 1.3, shade: 1.5, map: nodeMap(), sway: 1, grain: 3, snow: 0.3 }),
    soil: wash({ pig: [1, 1, 1], dens: 1.0, shade: 1.7, grain: 0.9, line: 0.25, snow: 1 }),
  };
  for (const k of Object.keys(mats) as Array<keyof typeof mats>) if (S.geo[k].n) { const m = new THREE.Mesh(S.geo[k].build(), mats[k]); m.name = `flora:${k}`; group.add(m); }

  // —— 笔：一层一次绘制 ——
  const px = Math.round(192 * q.tex);
  const AT: Record<AtlasId, ReturnType<typeof atlas>> = { tree: atlas(TREE.tiles, TREE.cols, px, 11), bloom: atlas(BLOOM.tiles, BLOOM.cols, px, 5), ever: atlas(EVER.tiles, EVER.cols, Math.round(224 * q.tex), 23), field: atlas(FIELD.tiles, FIELD.cols, px, 31) };
  const petalA = hasField ? atlas(PETAL.tiles, PETAL.cols, px, 37) : null;
  const layers: Layer[] = [];
  for (const id of LAYERS) {
    let dabs = S.dabs[id];
    if (!dabs.length) continue;
    // 低画质：笔少一些、各大一点
    if (q.density < 1) { const keep = 0.5 + 0.5 * q.density; dabs = dabs.filter((_, i) => ((i * 0.61803398875) % 1) < keep); for (const d of dabs) d.size *= 1 + 0.3 * (1 - keep); }
    const L = new Layer(id, DEFS[id], dabs, AT[DEFS[id].atlas], o.season);
    layers.push(L); group.add(L.mesh);
  }

  // —— 每季一套的：用到才搭 ——
  const sets = new Map<Season, FieldMeshes>();
  const alphaOf = (m: THREE.Mesh | null, a: number) => { if (!m) return; ((m.material as THREE.ShaderMaterial).uniforms.uQ.value as THREE.Vector4).z = a; m.visible = a > 0.01; };
  const show = (s: Season, a: number) => { const f = sets.get(s); if (!f) return; alphaOf(f.wash, a); alphaOf(f.body, a); if (f.pads) f.pads.visible = a > 0.5; };
  const fieldOf = (s: Season): FieldMeshes => {
    let f = sets.get(s);
    if (f || !hasField || !petalA) return f ?? { wash: null, body: null, pads: null };
    const d = fieldSet(s, fp);
    f = {
      wash: d.wash.length ? dabMesh(d.wash, dabMat({ ...AT.field, pig: [1, 1, 1], dens: 1.15, shade: 1.3, snow: 1, sway: 0.3 })) : null,
      body: d.body.length ? dabMesh(d.body, dabMat({ ...petalA, pig: [1, 1, 1], accent: [0.78, 0.8, 0.5], dens: 1, shade: 1.25, body: BODY, snow: 0.2, sway: 0.3 })) : null,
      pads: d.pads.n ? new THREE.Mesh(d.pads.build(), wash({ pig: [1, 1, 1], dens: 1.25, shade: 1.4, grain: 2, line: 0.3, sway: 0.3, snow: 0.6, side: THREE.DoubleSide })) : null,
    };
    for (const k of ['wash', 'body', 'pads'] as const) { const m = f[k]; if (m) { m.name = `flora:${k}:${s}`; m.visible = false; group.add(m); } }
    sets.set(s, f);
    return f;
  };
  fieldOf(o.season); show(o.season, 1);

  let season: Season = o.season, from: Season = o.season, fade = 1;
  return {
    group,
    bloomSpots: blooms.sort((a, b) => b.w - a.w).slice(0, 12).map((b) => b.p),
    extraTrunks: (ex?.trees ?? []).map((t) => ({ x: t.x, z: t.z, r: t.r })),
    setSeason(s) {
      if (s === season) return;
      // 上一回还没换完：把半路上的那一套收起来
      if (fade < 1 && from !== s) show(from, 0);
      from = season; season = s; fade = 0;
      for (const L of layers) L.go(s, false);
      fieldOf(s);
    },
    update(dt, _t, env) {
      if (fade < 1) {
        fade = Math.min(1, fade + dt / 1.4);
        const k = fade * fade * (3 - 2 * fade);
        for (const L of layers) L.blend(k);
        show(from, 1 - k); show(season, k);
      }
      // 夜里的花：月下是淡的，不像白天那样亮
      const dim = 1 - 0.3 * env.night;
      for (const L of layers) if (L.def.body) L.body = L.def.body * dim;
      const f = sets.get(season);
      if (f?.body) ((f.body.material as THREE.ShaderMaterial).uniforms.uP.value as THREE.Vector4).w = BODY * dim;
    },
  };
}
