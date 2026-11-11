/**
 * 寺里寺外的草木：松、古松、银杏、枫、竹、梅、草丛、荷。
 * 主代理给出「哪里种什么」（FloraLayout，y 是地面高度），这里把它们长出来；换季只改颜色与显隐，不重建。
 * 各种植物的长法在 flora/ 下：pine.ts、ginkgo.ts、maple.ts、bamboo.ts、plum.ts、shrub.ts、lotus.ts。
 */
import * as THREE from 'three';
import type { Mats } from '../core/mats';
import type { Quality } from '../core/World';
import type { Season } from './atmos';
import { alphaAtlas, barkMat, instanced, leafMat, rand, tileOf, type FGeo } from './flora/util';
import { bambooCulmTex, bambooSpray, fernFrond, ginkgoBark, ginkgoSpray, grassTuft, lotusLeafTex, lotusPetal, lotusPodTex, mapleSpray, pineCluster, pinePadSide, pinePadTop, pineSprig, plumLeaves, plumSpray, singleLeaves, strapTuft, twigSpray } from './flora/paint';
import { buildBamboo, buildLotus, buildShrub } from './flora/small';
import { buildGinkgo, buildMaple, buildPlum, type BroadTree } from './flora/broad';
import { PINE_STYLES, buildFarPine, buildPine, heroStyle, type PineTiles } from './flora/pine';

export interface TreePoint { x: number; y: number; z: number; /** 大小倍率，默认 1 */ s?: number; /** 绕 y 转（弧度） */ r?: number; /** 形态编号 */ v?: number }
export interface FloraLayout {
  pines?: TreePoint[];
  farPines?: TreePoint[];
  heroPines?: TreePoint[];
  ginkgo?: TreePoint[];
  maples?: TreePoint[];
  bamboo?: TreePoint[];
  plums?: TreePoint[];
  shrubs?: TreePoint[];
  lotus?: { x: number; y: number; z: number; rx: number; rz: number; count: number };
}
export interface Flora {
  group: THREE.Group;
  /** 换季：只改颜色、显隐、花叶的有无，不重建几何 */
  setSeason(s: Season): void;
  /** 会落叶 / 落花的树冠（世界坐标），给天气系统撒粒子用 */
  canopies: Array<{ kind: 'ginkgo' | 'maple' | 'plum' | 'pine' | 'bamboo'; center: THREE.Vector3; radius: number }>;
  /** 一片叶子 / 花瓣的贴图（给落叶粒子用） */
  leafTex: Record<'ginkgo' | 'maple' | 'petal' | 'needle', THREE.Texture>;
  /** 各部分的三角数与建造耗时（毫秒），调试用 */
  stats: Record<string, number>;
}

const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
const matOf = (t: TreePoint, i: number) => new THREE.Matrix4().compose(_p.set(t.x, t.y, t.z), _q.setFromAxisAngle(Y, t.r ?? i * 2.399), _s.setScalar(t.s ?? 1));

export function createFlora(mats: Mats, q: Quality, layout: FloraLayout, season: Season): Flora {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = 'flora';
  const a2c = q.msaa > 0 || !q.post;
  // 一格叶图的边长：松针细，用两倍的；其余 256 足够（卡片不过六七十厘米宽）
  const S = q.tex >= 1 ? 256 : 128;
  const den = q.density;
  const R = rand(4242);
  const stats: Record<string, number> = {};
  let tLap = t0;
  /** 记下这一段用了多少毫秒 */
  const lap = (name: string) => { const n = performance.now(); stats[`ms:${name}`] = Math.round(n - tLap); tLap = n; };
  const canopies: Flora['canopies'] = [];
  const seasonFns: Array<(s: Season) => void> = [];
  const mesh = (g: FGeo, m: THREE.Material, name: string) => { const o = new THREE.Mesh(g.build(), m); o.name = name; o.castShadow = o.receiveShadow = true; return o; };

  // —— 松 ——
  const hasPine = (layout.pines?.length ?? 0) + (layout.farPines?.length ?? 0) + (layout.heroPines?.length ?? 0) > 0;
  if (hasPine) {
    // 近处的松针用大一倍的图（古松要凑近看）；远松的整片云片另用一张小的
    const atlas = alphaAtlas(S * 2, 2, [pineSprig, pineCluster], 11);
    const T: PineTiles = { sprig: tileOf(0, 2, 1), cluster: tileOf(1, 2, 1), padSide: tileOf(0, 2, 1), padTop: tileOf(1, 2, 1) };
    const leafOpts = { wind: 0.3, trans: 0.16, transColor: 0xe6ff9a, under: 0.45, a2c, rough: 1, sheen: 0.1 };
    const leaf = leafMat(atlas, leafOpts);
    const farLeaf = layout.farPines?.length ? leafMat(alphaAtlas(S, 2, [pinePadSide, pinePadTop], 12), leafOpts) : leaf;
    const bark = barkMat(mats.bark, 0.3);
    seasonFns.push((s) => { for (const m of [leaf, farLeaf]) m.color.setHex(s === 'spring' ? 0xf2ffe0 : s === 'winter' ? 0xe6ede4 : s === 'autumn' ? 0xf4f6e6 : 0xffffff); });
    const byV = new Map<number, TreePoint[]>();
    (layout.pines ?? []).forEach((t, i) => { const v = ((t.v ?? i) % PINE_STYLES.length + PINE_STYLES.length) % PINE_STYLES.length; (byV.get(v) ?? byV.set(v, []).get(v)!).push(t); });
    for (const [v, pts] of byV) {
      const tg = buildPine(1000 + v * 77, PINE_STYLES[v], T, den);
      stats[`pine${v}`] = tg.bark.tris + tg.leaf.tris;
      const ms = pts.map(matOf), tints = pts.map(() => { const k = R.r(0.86, 1.06); return new THREE.Color(k * R.r(0.94, 1.04), k, k * R.r(0.9, 1.0)); });
      const a = instanced(tg.bark.build(), bark, ms), b = instanced(tg.leaf.build(), leaf, ms, tints);
      a.name = `pine${v}:bark`; b.name = `pine${v}:leaf`;
      group.add(a, b);
    }
    if (layout.farPines?.length) {
      const byF = [0, 1, 2].map(() => [] as TreePoint[]);
      layout.farPines.forEach((t, i) => byF[((t.v ?? i) % 3 + 3) % 3].push(t));
      byF.forEach((pts, v) => {
        if (!pts.length) return;
        const tg = buildFarPine(2000 + v * 31, T);
        stats[`farPine${v}`] = tg.bark.tris + tg.leaf.tris;
        const ms = pts.map(matOf), tints = pts.map(() => { const k = R.r(0.8, 1.05); return new THREE.Color(k * 0.97, k, k * 0.95); });
        const a = instanced(tg.bark.build(), bark, ms, undefined, false), b = instanced(tg.leaf.build(), farLeaf, ms, tints, false);
        a.name = `farPine${v}:bark`; b.name = `farPine${v}:leaf`;
        group.add(a, b);
      });
    }
    (layout.heroPines ?? []).forEach((t, i) => {
      const seed = 7000 + (t.v ?? i) * 131;
      const tg = buildPine(seed, heroStyle(rand(seed + 1)), T, Math.max(0.6, den));
      stats[`heroPine${i}`] = tg.bark.tris + tg.leaf.tris;
      const g = new THREE.Group();
      g.add(mesh(tg.bark, bark, `heroPine${i}:bark`), mesh(tg.leaf, leaf, `heroPine${i}:leaf`));
      g.position.set(t.x, t.y, t.z); g.rotation.y = t.r ?? 0; g.scale.setScalar(t.s ?? 1);
      group.add(g);
      canopies.push({ kind: 'pine', center: tg.center.clone().multiplyScalar(t.s ?? 1).applyAxisAngle(Y, t.r ?? 0).add(new THREE.Vector3(t.x, t.y, t.z)), radius: tg.radius * (t.s ?? 1) * 0.7 });
    });
  }

  lap('pine');
  /** 只画前几成的叶卡（卡的次序是打乱过的） */
  const part = (g: THREE.BufferGeometry, frac: number) => g.setDrawRange(0, Math.floor(((g.index?.count ?? 0) / 6) * frac) * 6);
  const T4 = [0, 1, 2, 3].map((i) => tileOf(i, 2, 2));
  const place = (t: TreePoint, i: number, tg: BroadTree, mb: THREE.Material, ml: THREE.Material, mx: THREE.Material, name: string) => {
    const g = new THREE.Group(), s = t.s ?? 1, r = t.r ?? i * 2.399;
    const a = mesh(tg.bark, mb, `${name}:bark`), b = mesh(tg.leaf, ml, `${name}:leaf`), c = mesh(tg.extra, mx, `${name}:extra`);
    g.add(a, b, c); g.position.set(t.x, t.y, t.z); g.rotation.y = r; g.scale.setScalar(s);
    group.add(g);
    return { leaf: b, extra: c, center: tg.center.clone().multiplyScalar(s).applyAxisAngle(Y, r).add(new THREE.Vector3(t.x, t.y, t.z)), radius: tg.radius * s };
  };

  // —— 银杏 ——
  if (layout.ginkgo?.length) {
    const atlas = alphaAtlas(S, 2, [ginkgoSpray, ginkgoSpray, twigSpray, twigSpray], 21);
    const leaf = leafMat(atlas, { wind: 0.5, trans: 0.6, transColor: 0xffe070, under: 0.62, a2c, rough: 1 });
    const twig = leafMat(atlas, { wind: 0.5, trans: 0, under: 0.95, a2c, rough: 1, color: 0xffffff, alphaTest: 0.3 });
    const gb = ginkgoBark();
    const bark = new THREE.MeshStandardMaterial({ map: gb.map, normalMap: gb.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), vertexColors: true, roughness: 0.96 });
    bark.userData.enhance = { wind: 0.5, snow: true, wet: true };
    const trees = layout.ginkgo.map((t, i) => {
      const tg = buildGinkgo(3000 + (t.v ?? i) * 57, { sprays: [T4[0], T4[1]], twigs: [T4[2], T4[3]] }, den);
      stats[`ginkgo${i}`] = tg.bark.tris + tg.leaf.tris + tg.extra.tris;
      const o = place(t, i, tg, bark, leaf, twig, `ginkgo${i}`);
      canopies.push({ kind: 'ginkgo', center: o.center, radius: o.radius });
      return o;
    });
    seasonFns.push((s) => {
      leaf.color.setHex(s === 'spring' ? 0xa9c552 : s === 'summer' ? 0x56852e : 0xedbe22);
      (leaf.userData.uTransC.value as THREE.Color).setHex(s === 'autumn' ? 0xffd45a : 0xe6ff7a);
      for (const t of trees) { t.leaf.visible = s !== 'winter'; t.extra.visible = s === 'winter' || s === 'spring'; part(t.leaf.geometry, s === 'spring' ? 0.6 : 1); }
    });
  }

  lap('ginkgo');
  // —— 枫 ——
  if (layout.maples?.length) {
    const atlas = alphaAtlas(S, 2, [mapleSpray, mapleSpray, twigSpray, twigSpray], 31);
    const leaf = leafMat(atlas, { wind: 0.45, trans: 0.5, transColor: 0xff9a50, under: 0.7, a2c, rough: 1 });
    const twig = leafMat(atlas, { wind: 0.45, trans: 0, under: 0.95, a2c, rough: 1, color: 0xb4aaa2 });
    const bark = barkMat(mats.bark, 0.45, { normalScale: new THREE.Vector2(0.45, 0.45), color: 0xb4b0a6 });
    const variants = [0, 1, 2].map((v) => buildMaple(4000 + v * 91, { sprays: [T4[0], T4[1]], twigs: [T4[2], T4[3]] }, den));
    const inst: Array<{ leaf: THREE.InstancedMesh; extra: THREE.InstancedMesh }> = [];
    variants.forEach((tg, v) => {
      const pts = layout.maples!.filter((t, i) => (((t.v ?? i) % 3) + 3) % 3 === v);
      if (!pts.length) return;
      stats[`maple${v}`] = tg.bark.tris + tg.leaf.tris + tg.extra.tris;
      const ms = pts.map(matOf), tints = pts.map(() => { const k = R.r(0.88, 1.06); return new THREE.Color(k, k * R.r(0.85, 1.05), k * R.r(0.85, 1)); });
      const a = instanced(tg.bark.build(), bark, ms), b = instanced(tg.leaf.build(), leaf, ms, tints), c = instanced(tg.extra.build(), twig, ms);
      a.name = `maple${v}:bark`; b.name = `maple${v}:leaf`; c.name = `maple${v}:extra`;
      group.add(a, b, c); inst.push({ leaf: b, extra: c });
      pts.forEach((t, i) => canopies.push({ kind: 'maple', center: tg.center.clone().multiplyScalar(t.s ?? 1).applyAxisAngle(Y, t.r ?? i * 2.399).add(new THREE.Vector3(t.x, t.y, t.z)), radius: tg.radius * (t.s ?? 1) }));
    });
    seasonFns.push((s) => {
      leaf.color.setHex(s === 'spring' ? 0xb7c95e : s === 'summer' ? 0x5a8636 : 0xa83a22);
      (leaf.userData.uTransC.value as THREE.Color).setHex(s === 'autumn' ? 0xff8a4a : 0xe6ff7a);
      for (const t of inst) { t.leaf.visible = s !== 'winter'; t.extra.visible = s === 'winter'; part(t.leaf.geometry, s === 'spring' ? 0.7 : 1); }
    });
  }

  lap('maple');
  // —— 梅 ——
  if (layout.plums?.length) {
    const atlas = alphaAtlas(S, 2, [plumSpray, plumSpray, plumLeaves, plumLeaves], 41);
    // 花不积雪（雪里要看得见梅）
    const flower = leafMat(atlas, { wind: 0.3, trans: 0.5, transColor: 0xffffff, under: 0.85, a2c, rough: 1, alphaTest: 0.35, snow: false });
    const leaf = leafMat(atlas, { wind: 0.3, trans: 0.5, transColor: 0xe6ff7a, under: 0.7, a2c, rough: 1 });
    const bark = barkMat(mats.bark, 0.3);
    const variants = [0, 1].map((v) => buildPlum(5000 + v * 73, { blossoms: [T4[0], T4[1]], leaves: [T4[2], T4[3]] }, den));
    const inst: Array<{ leaf: THREE.InstancedMesh; extra: THREE.InstancedMesh }> = [];
    variants.forEach((tg, v) => {
      const pts = layout.plums!.filter((t, i) => (((t.v ?? i) % 2) + 2) % 2 === v);
      if (!pts.length) return;
      stats[`plum${v}`] = tg.bark.tris + tg.leaf.tris + tg.extra.tris;
      const ms = pts.map(matOf);
      const a = instanced(tg.bark.build(), bark, ms), b = instanced(tg.leaf.build(), flower, ms), c = instanced(tg.extra.build(), leaf, ms);
      a.name = `plum${v}:bark`; b.name = `plum${v}:flower`; c.name = `plum${v}:leaf`;
      group.add(a, b, c); inst.push({ leaf: b, extra: c });
      pts.forEach((t, i) => canopies.push({ kind: 'plum', center: tg.center.clone().multiplyScalar(t.s ?? 1).applyAxisAngle(Y, t.r ?? i * 2.399).add(new THREE.Vector3(t.x, t.y, t.z)), radius: tg.radius * (t.s ?? 1) }));
    });
    seasonFns.push((s) => {
      // 冬：花满枝；春：花将尽、叶初生；夏：叶；秋：叶半黄半落
      flower.color.setHex(s === 'spring' ? 0xffe6ec : 0xffffff);
      leaf.color.setHex(s === 'spring' ? 0xd2e6a0 : s === 'autumn' ? 0xe6cf78 : 0xffffff);
      for (const t of inst) {
        t.leaf.visible = s === 'winter' || s === 'spring'; part(t.leaf.geometry, s === 'spring' ? 0.4 : 1);
        t.extra.visible = s !== 'winter'; part(t.extra.geometry, s === 'spring' ? 0.5 : s === 'autumn' ? 0.55 : 1);
      }
    });
  }

  lap('plum');
  // —— 竹 ——
  if (layout.bamboo?.length) {
    const atlas = alphaAtlas(S, 2, [bambooSpray, bambooSpray], 51);
    const leaf = leafMat(atlas, { wind: 0.9, trans: 0.55, transColor: 0xe6ff7a, under: 0.7, a2c, rough: 1 });
    const culm = new THREE.MeshStandardMaterial({ map: bambooCulmTex(rand(52)), vertexColors: true, roughness: 0.42 });
    culm.userData.enhance = { wind: 0.9, snow: true, wet: true };
    [0, 1, 2].forEach((v) => {
      const pts = layout.bamboo!.filter((t, i) => (((t.v ?? i) % 3) + 3) % 3 === v);
      if (!pts.length) return;
      const cg = buildBamboo(6000 + v * 37, [tileOf(0, 2, 1), tileOf(1, 2, 1)], den);
      stats[`bamboo${v}`] = cg.culm.tris + cg.leaf.tris;
      const ms = pts.map(matOf), tints = pts.map(() => { const k = R.r(0.88, 1.06); return new THREE.Color(k * R.r(0.92, 1.05), k, k * R.r(0.88, 1)); });
      const a = instanced(cg.culm.build(), culm, ms), b = instanced(cg.leaf.build(), leaf, ms, tints);
      a.name = `bamboo${v}:culm`; b.name = `bamboo${v}:leaf`;
      group.add(a, b);
      pts.forEach((t, i) => canopies.push({ kind: 'bamboo', center: cg.center.clone().multiplyScalar(t.s ?? 1).applyAxisAngle(Y, t.r ?? i * 2.399).add(new THREE.Vector3(t.x, t.y, t.z)), radius: cg.radius * (t.s ?? 1) }));
    });
    seasonFns.push((s) => leaf.color.setHex(s === 'spring' ? 0xf0ffd6 : s === 'winter' ? 0xe6e8c2 : s === 'autumn' ? 0xf6f4d2 : 0xffffff));
  }

  lap('bamboo');
  // —— 草丛、蕨、麦冬 ——
  if (layout.shrubs?.length) {
    const atlas = alphaAtlas(S, 2, [grassTuft, fernFrond, strapTuft, grassTuft], 61);
    const mat = leafMat(atlas, { wind: 0.22, trans: 0.4, transColor: 0xe6ff7a, under: 1, a2c, rough: 1 });
    const tl = [tileOf(0, 2, 2), tileOf(1, 2, 2), tileOf(2, 2, 2)];
    [0, 1, 2].forEach((v) => {
      const pts = layout.shrubs!.filter((t, i) => (((t.v ?? i) % 3) + 3) % 3 === v);
      if (!pts.length) return;
      const g = buildShrub(v, tl, 6500 + v);
      stats[`shrub${v}`] = g.tris;
      const tints = pts.map(() => { const k = R.r(0.8, 1.1); return new THREE.Color(k * R.r(0.9, 1.1), k, k * R.r(0.8, 1)); });
      const im = instanced(g.build(), mat, pts.map(matOf), tints, false);
      im.name = `shrub${v}`;
      group.add(im);
    });
    seasonFns.push((s) => mat.color.setHex(s === 'spring' ? 0xf0ffd0 : s === 'summer' ? 0xffffff : s === 'autumn' ? 0xe9d9a2 : 0xcdbb8e));
  }

  lap('shrub');
  // —— 荷 ——
  if (layout.lotus && layout.lotus.count > 0) {
    const L = layout.lotus;
    const petalAtlas = alphaAtlas(S, 1, [lotusPetal], 71, 0.5);
    const lg = buildLotus(7100, L.rx, L.rz, Math.max(4, Math.round(L.count * Math.max(0.6, den))), [0, 0, 1, 1]);
    const leafM = leafMat(lotusLeafTex(S), { wind: 0.14, trans: 0.5, transColor: 0xdcff8a, under: 0.8, a2c: false, alphaTest: 0, rough: 0.6, sheen: 0.5 });
    const stalkM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
    const podM = new THREE.MeshStandardMaterial({ map: lotusPodTex(64, rand(72)), vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
    for (const m of [stalkM, podM]) m.userData.enhance = { wind: 0.14, snow: true };
    const petalM = leafMat(petalAtlas, { wind: 0.14, trans: 0.4, transColor: 0xffe2ea, under: 0.95, a2c, rough: 0.9, alphaTest: 0.5, snow: false });
    const lotus = new THREE.Group();
    lotus.name = 'lotus'; lotus.position.set(L.x, L.y, L.z);
    const sets: Record<Season, THREE.Object3D[]> = { spring: [], summer: [], autumn: [], winter: [] };
    let tris = 0;
    for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) {
      for (const [g, m, n] of [[lg.leaf[s], leafM, 'leaf'], [lg.stalk[s], stalkM, 'stalk']] as const) {
        if (!g.tris) continue;
        tris += g.tris;
        const o = mesh(g, m, `lotus:${s}:${n}`); lotus.add(o); sets[s].push(o);
      }
    }
    if (lg.petal.tris) { const o = mesh(lg.petal, petalM, 'lotus:petal'); lotus.add(o); sets.summer.push(o); tris += lg.petal.tris; }
    for (const s of ['autumn', 'winter'] as const) if (lg.podTop[s].tris) { const o = mesh(lg.podTop[s], podM, `lotus:${s}:pod`); lotus.add(o); sets[s].push(o); tris += lg.podTop[s].tris; }
    stats.lotus = tris;
    group.add(lotus);
    seasonFns.push((s) => { for (const k of ['spring', 'summer', 'autumn', 'winter'] as const) for (const o of sets[k]) o.visible = k === s; });
  }

  lap('lotus');
  const leafTex = singleLeaves(rand(99));
  const setSeason = (s: Season) => { for (const f of seasonFns) f(s); };
  setSeason(season);
  stats.ms = Math.round(performance.now() - t0);
  return { group, setSeason, canopies, leafTex, stats };
}
