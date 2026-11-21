/**
 * 有人在过日子的痕迹（各合各家的身份、各在人真会放的地方；疏疏几样，不堆满）：
 *   甲（农夫一家）—— 屋后一垛柴捆；东山墙靠着一张耙（驾牛耙地的木耙）、一副粪筐扁担。
 *   乙（老人与妇人们）—— 披屋前檐下一架斜织机（织到一半的布卷在卷布轴上），西山墙边一口腌菜缸，盖上压着石头。
 *   丁（塾师与两个木匠）—— 东头一条木工凳（凳上夹着一块板、一只刨、地上一堆刨花），山墙下靠着几根木料，墙上挂一把框锯。
 *   戊（酒家与舂米人）—— 屋后几根木桩上倒扣着晾干的空酒坛；西山墙下码着谷袋，一只量米的斗，一只簸箕。
 *   村塾 —— 前檐下的地上一溜孩子脱下的小鞋。
 *   井边 —— 一条饮牲口、洗菜的石槽；井西搁着一副扁担水桶。
 *   碓房 —— 屋外西头几袋谷。
 *   路上 —— 柴门外石桥头一根拴驴的木桩、一块上马石；田间路口一座齐膝的田头土地，畦角两块界石；村路岔口一块界石。
 *   院里 —— 草堂两扇南窗下各一只花盆（西窗兰、东窗萱草，草木那边点）；门西墙根一双草鞋。
 * 位置都从总图取（各家按自己屋的坐标摆，屋挪了这些跟着走）。
 */
import * as THREE from 'three';
import { M, box, cyl, lathe, prism, rockGeo, shade, tint, type Builder, type Geo } from '../core/geo';
import { SITE, YARD_Y, ground, houseY, streamAt } from '../site';
import { INK, dye, pole, renormal, rnd, sbox, tube, v3, wobble, type Ctx, type Rand, type V3 } from './kit';
import { hallDims } from './hall';
import { bucketGeo } from './yard';
import { WP, basket, ware, WARE_FIRED } from './homes';

type Bin = { push(...gs: Geo[]): void };
const binOf = (b: Builder, mat = 'obj'): Bin => ({ push: (...gs: Geo[]) => { for (const g of gs) b.add(mat, g); } });
const at = (g: Geo, x: number, y: number, z: number, ry = 0) => g.applyMatrix4(M.mul(M.t(x, y, z), M.ry(ry)));
const house = (id: string) => SITE.houses.find((h) => h.id === id)!;

/** 一只谷袋（底在 y=0）：麻布的，口扎着 */
export function sack(seed: number, s = 1): Geo {
  return dye(wobble(lathe([[0.001, 0], [0.19 * s, 0.02], [0.23 * s, 0.22 * s], [0.18 * s, 0.46 * s], [0.07 * s, 0.53 * s], [0.09 * s, 0.6 * s], [0.001, 0.58 * s]], 9), 0.018 * s, 3, seed, 0), INK.hemp, 1.3);
}
/** 一捆柴（横放，沿 x）：草的身、两道绳 */
function faggot(b: Builder, obj: Bin, m: THREE.Matrix4, len: number, r: number, seed: number): void {
  b.add('thatch', tint(wobble(cyl(r, r * 0.92, len, 8, false, 3).rotateZ(Math.PI / 2), r * 0.12, 3, seed, 0), 0.8, 0.76, 0.68).applyMatrix4(m));
  for (const t of [-0.28, 0.28]) { const pts: V3[] = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * 6.2832; pts.push(v3(t * len, Math.cos(a) * (r + 0.008), Math.sin(a) * (r + 0.008))); } obj.push(dye(tube(pts, 0.008, 3), INK.hemp, 1.8).applyMatrix4(m)); }
}

export function buildTraces(c: Ctx, sub?: string[]): void {
  const on = (k: string) => !sub || sub.includes(k);
  const R = rnd(9601);
  if (on('a')) farmer(c, R);
  if (on('b')) weaver(c, R);
  if (on('d')) carpenter(c, R);
  if (on('e')) wine(c, R);
  if (on('school')) school(c, R);
  if (on('well')) well(c, R);
  if (on('mill')) millSacks(c);
  if (on('road')) roadside(c, R);
  if (on('yard')) yard(c, R);
}

/** 某一户的屋基坐标里摆东西：返回这一户的变换、屋基高、挡路的报法 */
function inHouse(c: Ctx, id: string) {
  const h = house(id), y0 = houseY(id), m = M.trs(h.x, y0, h.z, h.yaw);
  const solid = (name: string, lx: number, lz: number, w: number, d: number, top?: number) => { const [x, z] = WP(h, lx, lz); c.solid({ id: name, kind: 'rect', x, z, w, d, yaw: h.yaw, top: top != null ? y0 + top : undefined }); };
  return { h, y0, m, solid };
}

// —— 甲：屋后一垛柴捆；东山墙靠一张耙、一副粪筐扁担 ——
function farmer(c: Ctx, R: Rand): void {
  const { h, m, solid } = inHouse(c, 'a'), b = c.village, obj = binOf(b), z0 = h.d / 2, x0 = h.w / 2;
  b.push(m);
  // 柴捆：屋后靠着北墙码两层
  for (let row = 0; row < 2; row++) for (let i = 0; i < 5 - row; i++) faggot(b, obj, M.mul(M.t(-2.9 + i * 1.12 + row * 0.56 + R.pm(0.05), 0.2 + row * 0.35, -z0 - 0.42 - row * 0.04), M.ry(R.pm(0.06))), 1.08, 0.19, 9610 + row * 7 + i);
  // 耙：一副方框，两根横木上一排木齿，斜靠在东山墙
  {
    const mm = M.mul(M.t(x0 + 0.42, 0, 0.4), M.ry(Math.PI / 2), M.rx(-0.35));
    for (const y of [0.25, 0.85]) b.add('wood', box(1.6, 0.07, 0.07, 'x').translate(0, y, 0).applyMatrix4(mm));
    for (const s of [-1, 1]) b.add('wood', box(0.06, 0.8, 0.06, 'y').translate(s * 0.75, 0.55, 0).applyMatrix4(mm));
    for (let i = 0; i < 9; i++) for (const y of [0.25, 0.85]) b.add('wood', cyl(0.012, 0.008, 0.16, 4).rotateX(Math.PI / 2).translate(-0.68 + i * 0.17, y, 0.1).applyMatrix4(mm));
  }
  // 粪筐（两只）、一根扁担搁在筐上
  for (const s of [-1, 1]) for (const g of basket(0.17, 0.22, 0.3, c.low ? 8 : 11, 1.75)) obj.push(g.translate(x0 + 0.45 + s * 0.38, 0, 1.95));
  b.add('bamboo', pole(v3(x0 + 0.0, 0.34, 1.9), v3(x0 + 1.0, 0.33, 2.0), 0.02, 0.018, 5));
  b.pop();
  solid('甲·柴垛', -0.65, -z0 - 0.45, 5.9, 0.6);
  solid('甲·耙', x0 + 0.45, 0.4, 0.5, 1.7);
  solid('甲·粪筐', x0 + 0.45, 1.95, 1.0, 0.5);
}

// —— 乙：披屋前檐下一架斜织机；西山墙边一口腌菜缸 ——
function weaver(c: Ctx, R: Rand): void {
  const { h, m, solid } = inHouse(c, 'b'), b = c.village, obj = binOf(b), z0 = h.d / 2, x0 = h.w / 2;
  b.push(m);
  // 斜织机（织的人坐在南头，经线斜着往北升上去）：机座两根长木、坐板、斜架、卷布轴、经轴、综、两根踏杆
  {
    const lx = x0 + 1.1, lz = 1.15, mm = M.t(lx, 0, lz);
    for (const s of [-1, 1]) {
      b.add('wood', box(0.06, 0.06, 1.5, 'z').translate(s * 0.32, 0.36, 0).applyMatrix4(mm));
      for (const z of [-0.68, 0.62]) b.add('wood', box(0.05, 0.36, 0.05, 'y').translate(s * 0.32, 0.18, z).applyMatrix4(mm));
      // 斜架：从机座中段斜着升到北头
      b.add('wood', pole(v3(s * 0.3, 0.38, 0.1), v3(s * 0.3, 1.25, -0.55), 0.025, 0.022, 5).applyMatrix4(mm));
    }
    b.add('wood', wobble(box(0.62, 0.035, 0.26, 'x').translate(0, 0.42, 0.62), 0.003, 2, 9620, 40, 0.5).applyMatrix4(mm));
    // 卷布轴（近身，上面卷着织好的布）、经轴（远端高处）
    b.add('wood', cyl(0.025, 0.025, 0.72, 6).rotateZ(Math.PI / 2).translate(0, 0.62, 0.35).applyMatrix4(mm));
    obj.push(dye(cyl(0.055, 0.055, 0.56, 10).rotateZ(Math.PI / 2).translate(0, 0.62, 0.35), [0.95, 0.94, 0.88], 0.95).applyMatrix4(mm));
    b.add('wood', cyl(0.035, 0.035, 0.72, 7).rotateZ(Math.PI / 2).translate(0, 1.22, -0.53).applyMatrix4(mm));
    // 经线：从经轴斜铺到卷布轴（一片极淡的面），当中一道综
    const warp = new THREE.PlaneGeometry(0.52, 1.0, 1, 1).toNonIndexed();
    warp.setAttribute('color', new THREE.BufferAttribute(new Float32Array(warp.attributes.position.count * 3).fill(1), 3));
    obj.push(dye(warp, [0.97, 0.96, 0.92], 0.6).applyMatrix4(M.mul(mm, M.t(0, 0.93, -0.09), M.rx(-Math.PI / 2 + 0.94))));
    b.add('wood', box(0.6, 0.03, 0.03, 'x').translate(0, 0.98, -0.18).applyMatrix4(mm));
    for (const s of [-1, 1]) b.add('wood', pole(v3(s * 0.12, 0.05, 0.35), v3(s * 0.12, 0.12, -0.25), 0.012, 0.012, 4).applyMatrix4(mm));
  }
  // 腌菜缸：一口大缸，木盖上压着一块石头
  obj.push(ware('vat', [0.68, 0.64, 0.6], 1.75, c.low ? 10 : 16, 0.85).translate(-x0 - 0.62, 0, 0.9));
  b.add('wood', cyl(0.3, 0.3, 0.03, 12).translate(-x0 - 0.62, 0.62, 0.9));
  b.add('stone', rockGeo(9625, 0.14, 0.1, 0.12, 1).translate(-x0 - 0.62, 0.62, 0.9));
  b.pop();
  solid('乙·织机', x0 + 1.1, 1.15, 0.8, 1.6);
  solid('乙·腌菜缸', -x0 - 0.62, 0.9, 0.7, 0.7);
  // 织机的坐板（织的人坐在南头，面朝北对着经线）
  { const [x, z] = WP(h, x0 + 1.1, 1.15 + 0.62); c.anchor('loomSeat', x, houseY('b') + 0.44, z, h.yaw + Math.PI); }
  void R;
}

// —— 丁：东头一条木工凳（凳上夹一块板、一只刨，地上刨花），山墙下靠几根木料，墙上一把框锯 ——
function carpenter(c: Ctx, R: Rand): void {
  const { h, m, solid } = inHouse(c, 'd'), b = c.village, obj = binOf(b), x0 = h.w / 2;
  b.push(m);
  const bx = x0 + 1.2, bz = 1.2;
  // 木工凳：一根长木、四条撇腿；凳头一块挡木，板顶着它刨
  b.add('wood', wobble(box(0.24, 0.1, 1.7, 'z').translate(bx, 0.55, bz), 0.004, 2, 9630, 40, 0.5));
  for (const s of [-1, 1]) for (const e of [-1, 1]) b.add('wood', pole(v3(bx + e * 0.2, 0, bz + s * 0.72), v3(bx + e * 0.08, 0.52, bz + s * 0.66), 0.025, 0.022, 5));
  b.add('wood', box(0.2, 0.06, 0.05).translate(bx, 0.63, bz - 0.8));
  b.add('wood', wobble(box(0.2, 0.035, 1.3, 'z').translate(bx, 0.62, bz - 0.12), 0.003, 2, 9631, 40, 0.5));
  // 刨：木刨身、刨刀、横把
  obj.push(dye(box(0.07, 0.06, 0.26).translate(bx + 0.01, 0.67, bz + 0.25), INK.darkwood, 1.7));
  obj.push(dye(box(0.05, 0.05, 0.012).translate(bx + 0.01, 0.72, bz + 0.22), INK.iron, 2.2));
  obj.push(dye(cyl(0.012, 0.012, 0.2, 5).rotateZ(Math.PI / 2).translate(bx + 0.01, 0.69, bz + 0.16), INK.darkwood, 1.7));
  // 刨花：凳下、凳边一堆卷卷的
  for (let i = 0; i < (c.low ? 8 : 16); i++) {
    const a = R.r(0, 6.283), d = R.r(0, 0.5), x = bx + Math.cos(a) * d * 0.6, z = bz + 0.2 + Math.sin(a) * d, r = R.r(0.025, 0.05), pts: V3[] = [];
    for (let k = 0; k <= 6; k++) { const t = (k / 6) * 5.5; pts.push(v3(x + Math.cos(t) * r * (1 - k * 0.07), 0.025 + k * 0.004, z + Math.sin(t) * r * (1 - k * 0.07))); }
    obj.push(dye(tube(pts, 0.008, 3), [0.92, 0.84, 0.7], R.r(0.9, 1.15)));
  }
  // 山墙下靠着的木料（几根圆木、两块板）
  for (let i = 0; i < 4; i++) { const z = -1.3 + i * 0.3 + R.pm(0.04), lean = R.r(0.55, 0.7), L = R.r(2.2, 2.6); b.add('wood', pole(v3(x0 + lean, 0, z), v3(x0 + 0.08, L * 0.95, z + R.pm(0.05)), R.r(0.06, 0.085), 0.05, 7, 2)); }
  for (let i = 0; i < 2; i++) b.add('wood', wobble(box(0.24, 2.3, 0.04, 'y'), 0.004, 2, 9635 + i, 40, 0.4).applyMatrix4(M.mul(M.t(x0 + 0.38, 1.1, 0.2 + i * 0.3), M.rz(0.24))));
  // 框锯：挂在墙上的木橛上（门东）
  {
    const mm = M.t(2.6, 1.5, h.d / 2 + 0.06);
    for (const s of [-1, 1]) b.add('wood', box(0.03, 0.42, 0.025, 'y').translate(s * 0.32, 0, 0).applyMatrix4(mm));
    b.add('wood', box(0.64, 0.025, 0.02, 'x').applyMatrix4(mm));
    obj.push(dye(box(0.66, 0.035, 0.003).translate(0, -0.19, 0), INK.iron, 2.1).applyMatrix4(mm));
    obj.push(dye(tube([v3(-0.3, 0.2, 0), v3(0, 0.215, 0), v3(0.3, 0.2, 0)], 0.004, 3), INK.hemp, 1.6).applyMatrix4(mm));
  }
  b.pop();
  solid('丁·木工凳', bx, bz, 0.5, 1.8, 0.64);
  solid('丁·木料', x0 + 0.38, -0.6, 0.75, 1.6);
  // 木工凳：人站在凳的南头（板顶着北头的挡木往前推刨）——挂点在凳面南头，+z 朝人站的那边
  { const [x, z] = WP(h, bx, bz + 0.6); c.anchor('joinerBench', x, houseY('d') + 0.64, z, h.yaw); }
}

// —— 戊：屋后木桩上倒扣着晾的空酒坛；西山墙下码着谷袋、一只斗、一只簸箕 ——
function wine(c: Ctx, R: Rand): void {
  const { h, m, solid } = inHouse(c, 'e'), b = c.village, obj = binOf(b), z0 = h.d / 2, x0 = h.w / 2;
  b.push(m);
  // 屋后一副矮木架（两块板搭在砖上），空坛口朝下倒扣着控干；一只横倒在架边
  {
    const rz = -z0 - 0.95;
    for (const x of [0.85, 2.0, 3.15]) for (let k = 0; k < 2; k++) b.add('earth', tint(wobble(box(0.24, 0.085, 0.13), 0.004, 8, 9641 + Math.round(x * 10) + k, 0), 0.93, 0.91, 0.9).applyMatrix4(M.mul(M.t(x, 0.045 + k * 0.09, rz), M.ry(k % 2 ? Math.PI / 2 : 0))));
    b.add('wood', wobble(box(2.6, 0.035, 0.34, 'x').translate(2.0, 0.2, rz), 0.004, 2, 9645, 40, 0.5));
    const jar = () => lathe([[0.001, 0], [0.11, 0], [0.2, 0.14], [0.21, 0.3], [0.14, 0.42], [0.1, 0.45], [0.12, 0.5], [0.001, 0.52]], c.low ? 10 : 14);
    for (const x of [1.05, 1.6, 2.2, 2.85]) obj.push(dye(jar(), INK.glaze, 1.6).applyMatrix4(M.mul(M.t(x + R.pm(0.03), 0.735, rz + R.pm(0.03)), M.rx(Math.PI), M.ry(R.r(0, 3)))));
    obj.push(dye(jar(), INK.glaze, 1.6).applyMatrix4(M.mul(M.t(3.75, 0.2, rz + 0.1), M.rz(Math.PI / 2 - 0.08), M.ry(0.4))));
  }
  // 谷袋（舂米人的）、量米的斗、簸箕
  for (const [i, [x, z, y]] of ([[-x0 - 0.45, 0.6, 0], [-x0 - 0.45, 1.15, 0], [-x0 - 0.5, 0.88, 0.42]] as Array<[number, number, number]>).entries()) obj.push(sack(9640 + i, 0.95).applyMatrix4(M.mul(M.t(x, y, z), y > 0 ? M.rz(Math.PI / 2 - 0.1) : M.ry(R.r(0, 3)))).translate(0, y > 0 ? 0.1 : 0, 0));
  obj.push(dye(shade(lathe([[0.001, 0], [0.13, 0], [0.13, 0.2], [0.12, 0.2], [0.12, 0.012], [0.001, 0.012]], 4, Math.PI / 4), (_x, y) => (y > 0.18 ? 1.1 : 1)), INK.wood, 1.6).translate(-x0 - 0.45, 0, -0.05));
  obj.push(dye(lathe([[0.001, 0], [0.3, 0.0], [0.36, 0.1], [0.345, 0.1], [0.29, 0.015], [0.001, 0.015]], 12, Math.PI * 0.35, Math.PI * 1.3), INK.bamboo, 1.5).applyMatrix4(M.mul(M.t(-x0 - 0.3, 0.42, -0.65), M.rz(1.3), M.ry(Math.PI / 2))));
  b.pop();
  solid('戊·晾坛架', 2.3, -z0 - 0.95, 3.4, 0.5, 0.75);
  solid('戊·谷袋', -x0 - 0.45, 0.4, 0.7, 1.6);
}

// —— 村塾：前檐下一溜孩子脱下的小鞋 ——
function school(c: Ctx, R: Rand): void {
  const { h, m } = inHouse(c, 'school'), obj = binOf(c.village), z0 = h.d / 2;
  for (let i = 0; i < 6; i++) {
    const x = -2.9 + i * 0.95 + R.pm(0.15), z = z0 + 0.62 + R.pm(0.05), ry = R.pm(0.5);
    for (const s of [-1, 1]) obj.push(dye(wobble(sbox(0.075, 0.035, 0.17, 0.05).translate(s * 0.05, 0.018, R.pm(0.02)), 0.006, 9, 9650 + i, 50), R() < 0.5 ? [0.5, 0.48, 0.5] : [0.78, 0.72, 0.6], 1.5).applyMatrix4(M.mul(m, M.t(x, 0, z), M.ry(ry))));
  }
}

// —— 井边：一条石槽；一副扁担水桶 ——
function well(c: Ctx, R: Rand): void {
  // （井北沿是打水的人站的地方、东北是放担子的地方——村人那边定的，这两样都让开：石槽在井西南，水桶在井西北）
  const Wl = SITE.well, b = c.village, obj = binOf(b);
  const tx = Wl.x - 2.15, tz = Wl.z + 1.15, ty = ground(tx, tz), ry = 1.25;
  // 石槽：一整块石头凿的长槽，里面有水
  b.add('stone', tint(at(renormal(wobble(sbox(1.3, 0.38, 0.5, 0.3).translate(0, 0.17, 0), 0.015, 2, 9660, 0, 0.5), 40), tx, ty, tz, ry), 1.05));
  b.add('dark', box(1.1, 0.02, 0.32).applyMatrix4(M.mul(M.t(tx, ty + 0.34, tz), M.ry(ry))));
  obj.push(dye(box(1.08, 0.004, 0.3).applyMatrix4(M.mul(M.t(tx, ty + 0.345, tz), M.ry(ry))), [0.66, 0.74, 0.8], 1.5));
  c.solid({ id: '井·石槽', kind: 'rect', x: tx, z: tz, w: 1.35, d: 0.55, yaw: ry, top: ty + 0.36 });
  // 扁担水桶：两只桶，扁担横在上面
  const bx = Wl.x - 2.3, bz = Wl.z - 1.75, by = ground(bx, bz);
  for (const s of [-1, 1]) for (const g of bucketGeo(0.15, 0.18, 0.3, c.low ? 8 : 12)) obj.push(g.translate(bx + s * 0.55, by, bz + s * 0.06));
  b.add('bamboo', pole(v3(bx - 0.75, by + 0.34, bz - 0.06), v3(bx + 0.75, by + 0.35, bz + 0.1), 0.022, 0.02, 5));
  c.solid({ id: '井·水桶', kind: 'rect', x: bx, z: bz, w: 1.5, d: 0.45, yaw: -0.1 });
  void R;
}

// —— 碓房外西头的几袋谷（照 more.ts 水碓的摆法找碓屋的位置） ——
function millSacks(c: Ctx): void {
  const Mi = SITE.more.mill, st = streamAt(Mi.x, Mi.z), tl = Math.hypot(st.tx, st.tz) || 1, tx = st.tx / tl, tz = st.tz / tl, sd = streamAt(Mi.x - tz, Mi.z + tx).d < st.d ? 1 : -1;
  const W = (lx: number, lz: number): [number, number] => [Mi.x + lx * tx - lz * sd * tz, Mi.z + lx * tz + lz * sd * tx];
  const obj = binOf(c.village);
  for (const [i, [lx, lz]] of ([[-4.45, -0.6], [-4.5, -1.1], [-4.55, -0.1]] as Array<[number, number]>).entries()) { const [x, z] = W(lx, lz); obj.push(sack(9670 + i).translate(x, ground(x, z) - 0.02, z)); }
  const [x, z] = W(-4.5, -0.6); c.solid({ id: '碓房·谷袋', kind: 'disc', x, z, r: 0.65 });
}

// —— 路上：拴驴的木桩与上马石、田头土地、界石 ——
function roadside(c: Ctx, R: Rand): void {
  const b = c.home, obj = binOf(b);
  // 柴门外、石桥北头路东：一根拴驴的木桩（顶上一道铁箍、一只环，系着半截磨毛了的绳），旁边一块上马石
  {
    const x = 1.65, z = 25.4, gy = ground(x, z);
    b.add('wood', renormal(wobble(pole(v3(x, gy - 0.3, z), v3(x + 0.02, gy + 1.05, z + 0.01), 0.075, 0.065, 8, 3), 0.008, 2, 9680, 0), 50));
    obj.push(dye(cyl(0.072, 0.072, 0.04, 8).translate(x + 0.02, gy + 0.92, z + 0.01), INK.iron, 2.2));
    const ring: V3[] = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * 6.2832; ring.push(v3(x + 0.02 + Math.cos(a) * 0.05, gy + 0.82 + Math.sin(a) * 0.05, z + 0.085)); }
    obj.push(dye(tube(ring, 0.007, 4), INK.iron, 2.2));
    obj.push(dye(tube([v3(x + 0.02, gy + 0.77, z + 0.09), v3(x + 0.05, gy + 0.55, z + 0.15), v3(x + 0.03, gy + 0.38, z + 0.18)], 0.009, 4), INK.hemp, 1.6));
    // 上马石：一块凿成两级的条石，棱角磨圆了
    const sx = x + 0.75, sz = z - 0.55, sy = ground(sx, sz);
    b.add('stone', tint(at(renormal(wobble(prism([[-0.42, -0.2], [0.38, -0.2], [0.38, 0.2], [0.1, 0.2], [0.06, 0.38], [-0.42, 0.38]], 0.4).translate(0, 0.0, 0), 0.018, 2.5, 9681, 0, 0.6), 36), sx, sy, sz, 0.2), 1.06));
    c.solid({ id: '拴驴桩', kind: 'disc', x, z, r: 0.1 });
    c.solid({ id: '上马石', kind: 'rect', x: sx - 0.02, z: sz, w: 0.86, d: 0.45, yaw: 0.2, top: sy + 0.38 });
  }
  // 田间路口：一座齐膝的田头土地（两块石板夹一块顶，龛里一块小牌，龛前一只香碗），面朝路
  {
    const fb = c.far, fo = binOf(fb), x = 18.7, z = 44.3, gy = ground(x, z), ry = Math.PI / 2 + 0.1;
    fb.push(M.trs(x, gy, z, ry));
    fb.add('stone', renormal(wobble(sbox(0.48, 0.1, 0.4, 0.3).translate(0, 0.03, 0), 0.01, 2, 9690, 0, 0.5), 42));
    for (const s of [-1, 1]) fb.add('stone', renormal(wobble(sbox(0.07, 0.32, 0.3, 0.2).translate(s * 0.17, 0.24, 0), 0.008, 3, 9691 + s, 0), 42));
    fb.add('stone', renormal(wobble(sbox(0.4, 0.3, 0.06, 0.2).translate(0, 0.24, -0.12), 0.008, 3, 9693, 0), 42));
    fb.add('dark', box(0.26, 0.28, 0.02).translate(0, 0.24, -0.085));
    fb.add('stone', tint(renormal(wobble(sbox(0.52, 0.06, 0.44, 0.3).translate(0, 0.43, 0), 0.008, 2, 9694, 0, 0.5), 42), 1.08));
    fo.push(dye(box(0.08, 0.16, 0.015).translate(0, 0.19, -0.07), [0.82, 0.62, 0.5], 1.6));
    fo.push(dye(lathe([[0.001, 0], [0.032, 0], [0.045, 0.035], [0.04, 0.04], [0.03, 0.028], [0.001, 0.025]], 8).translate(0, 0.08, 0.13), WARE_FIRED, 1.4));
    fb.pop();
    c.solid({ id: '田头土地', kind: 'rect', x, z, w: 0.6, d: 0.5, yaw: ry, top: gy + 0.46 });
    c.anchor('fieldShrine', x + Math.sin(ry) * 0.8, gy, z + Math.cos(ry) * 0.8, ry);
    // 畦角两块界石（半埋着的条石）
    for (const [i, [bx2, bz2]] of ([[15.6, 46.4], [26.4, 46.4]] as Array<[number, number]>).entries()) { const g0 = ground(bx2, bz2); fb.add('stone', tint(at(renormal(wobble(sbox(0.16, 0.5, 0.14, 0.2).translate(0, 0.14, 0), 0.012, 3, 9695 + i, 0), 40), bx2, g0, bz2, R.r(0, 1)), 1.06)); c.solid({ id: `界石${i + 1}`, kind: 'disc', x: bx2, z: bz2, r: 0.12 }); }
  }
  // 村路与洗衣埠的小路岔开处：一块界石
  {
    const vb = c.village, x = 51.3, z = 18.6, g0 = ground(x, z);
    vb.add('stone', tint(at(renormal(wobble(sbox(0.22, 0.62, 0.18, 0.2).translate(0, 0.2, 0), 0.015, 3, 9697, 0), 40), x, g0, z, 0.4), 1.05));
    c.solid({ id: '界石·村路', kind: 'disc', x, z, r: 0.15 });
  }
}

// —— 院里：南窗下两只花盆（花草由草木那边点）；门西墙根一双草鞋 ——
function yard(c: Ctx, R: Rand): void {
  const H = SITE.hall, dm = hallDims(), b = c.home, obj = binOf(b), fy = YARD_Y + dm.fl - 0.02, zf = H.z + dm.D / 2 + 0.42;
  for (const [i, p] of SITE.pots.entries()) {
    const g = lathe([[0.001, 0], [0.1, 0], [0.12, 0.02], [0.16, 0.2], [0.175, 0.22], [0.16, 0.225], [0.145, 0.205], [0.11, 0.035], [0.001, 0.03]], c.low ? 10 : 16);
    obj.push(dye(shade(g, (x, _y, z, nx, _ny, nz) => (nx * x + nz * z < 0 ? 0.55 : 1)), i ? WARE_FIRED : [0.72, 0.74, 0.7], 1.4).translate(p.x, fy, p.z));
    obj.push(dye(cyl(0.148, 0.148, 0.004, c.low ? 10 : 16), [0.72, 0.62, 0.52], 1.6).translate(p.x, fy + 0.19, p.z));
  }
  // 院子东北角、灶屋背后一小畦葱韭：一圈竹篾矮边（菜由草木那边点）
  {
    const K = SITE.crafts.kitchenBed, per: Array<[number, number, number, number]> = [[K.x0, K.z0, K.x1, K.z0], [K.x1, K.z0, K.x1, K.z1], [K.x1, K.z1, K.x0, K.z1], [K.x0, K.z1, K.x0, K.z0]];
    for (const [ax, az, ex, ez] of per) b.add('wood', tint(box(Math.hypot(ex - ax, ez - az) + 0.02, 0.12, 0.022).applyMatrix4(M.mul(M.t((ax + ex) / 2, YARD_Y + 0.03, (az + ez) / 2), M.ry(Math.atan2(-(ez - az), ex - ax)))), 1.12, 1.1, 1.06));
    obj.push(dye(box(K.x1 - K.x0 - 0.04, 0.03, K.z1 - K.z0 - 0.04).translate((K.x0 + K.x1) / 2, YARD_Y + 0.01, (K.z0 + K.z1) / 2), [0.84, 0.8, 0.74], 1.2));
    c.solid({ id: '院里·葱韭畦', kind: 'rect', x: (K.x0 + K.x1) / 2, z: (K.z0 + K.z1) / 2, w: K.x1 - K.x0, d: K.z1 - K.z0, top: YARD_Y + 0.12 });
  }
  // 草鞋一双（脱在门西的墙根）
  for (const s of [-1, 1]) b.add('thatch', tint(wobble(sbox(0.1, 0.022, 0.25, 0.1).translate(-1.0 + s * 0.065 + R.pm(0.01), fy + 0.012, zf - 0.22 + s * 0.03), 0.01, 8, 9700 + s, 50), 0.95, 0.93, 0.86));
}
