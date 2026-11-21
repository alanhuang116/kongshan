/**
 * 添进村里的两户人家，各有各的营生；外加先生的药圃。位置在总图（SITE.houses 的 f、g，SITE.crafts）。
 *
 *   己（f）篾匠 —— 村西头，屋后不远就是竹林。西山墙边斜靠着一捆竹竿；门前一条篾凳、一把篾刀、一只编了一半的箩筐，
 *         两根杈竿搭一根竹竿晾着篾片；编好的匾、筐、背篓、簸箕码在门东，墙上木橛挂着新编的斗笠；门楣上卷着一挂竹帘。
 *   庚（g）陶家 —— 村东头的溪岸上。屋西一间坯棚：陶车、拉好的坯、靠北两层坯架、几块揉好的泥；棚外一堆泥、一个泥池。
 *         屋前两排阴坯的架子；屋东南一座馒头窑（窑门里有火，背后一根烟囱），窑边码着柴捆劈柴、几只刚出窑的罐、一堆碎陶片；
 *         屋西靠路这边码着烧好的缸、盆、罐，过路人好看。
 *   药圃 —— 院西小门外、菜畦北边：三畦药（芍药、紫苏与薄荷、艾与枸杞，草木那边点），竹篾编的矮边；北头一间晒药的小棚，
 *         三层架上搁着匾，梁下吊着几把晒干的药草，一张矮几上一只药碾，棚柱边靠着药锄。
 *
 * 随季节：冬天陶家歇窑（泥冻了不做坯），窑门里没有火、窑顶苫一领草帘，坯架空着——窑火与草帘放在 c.season；
 * 阴坯怕雨，放在 c.dry（下雨、天黑就收进屋）。
 */
import * as THREE from 'three';
import { M, box, boxUp, cyl, cylUp, grid, lathe, lathe4, prism, rockGeo, shade, sweep, tint, type Builder, type Geo } from '../core/geo';
import { smooth } from '../core/rng';
import type { RGB } from '../ink/ink';
import { SITE, ground, houseY } from '../site';
import { INK, SEASONS, dye, facing, flatRock, pole, renormal, rnd, sbox, tube, v3, wobble, type Ctx, type Rand, type V3 } from './kit';
import { post } from './hall';
import { cottage } from './village';
import { lantern } from './more';
import { bucketGeo } from './yard';
import { thatchRoof } from './thatch';

type Bin = { push(...gs: Geo[]): void };
const at = (g: Geo, x: number, y: number, z: number, ry = 0) => g.applyMatrix4(M.mul(M.t(x, y, z), M.ry(ry)));
/** 带朝向的东西自己的坐标 → 世界（lx 朝它的 +x，lz 朝它的 +z） */
export const WP = (o: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] => [o.x + lx * Math.cos(o.yaw) + lz * Math.sin(o.yaw), o.z - lx * Math.sin(o.yaw) + lz * Math.cos(o.yaw)];
const binOf = (b: Builder, mat = 'obj'): Bin => ({ push: (...gs: Geo[]) => { for (const g of gs) b.add(mat, g); } });

// —— 陶器 ——
/** 阴干的坯（灰白带一点土黄）、烧成的素陶（淡赭，别艳）、灰陶 */
export const WARE_GREEN: RGB = [0.9, 0.865, 0.79], WARE_FIRED: RGB = [0.85, 0.75, 0.68], WARE_GREY: RGB = [0.76, 0.75, 0.73];
/** 编好的竹器（旧了的篾色：比竹竿淡，不发黄） */
export const WOVEN: RGB = [0.88, 0.84, 0.71];
/** 几样陶器的轮廓（[半径, 高]：外壁自下而上，口沿，内壁自上而下） */
const WARE: Record<'bowl' | 'jar' | 'basin' | 'vat' | 'bottle' | 'pot', Array<[number, number]>> = {
  bowl: [[0.001, 0], [0.045, 0], [0.05, 0.012], [0.095, 0.07], [0.1, 0.076], [0.092, 0.073], [0.045, 0.017], [0.001, 0.015]],
  jar: [[0.001, 0], [0.07, 0], [0.115, 0.07], [0.125, 0.15], [0.095, 0.225], [0.06, 0.25], [0.066, 0.272], [0.054, 0.272], [0.048, 0.25], [0.001, 0.24]],
  basin: [[0.001, 0], [0.13, 0], [0.14, 0.012], [0.21, 0.13], [0.226, 0.14], [0.21, 0.137], [0.13, 0.026], [0.001, 0.02]],
  vat: [[0.001, 0], [0.22, 0], [0.31, 0.12], [0.37, 0.4], [0.38, 0.6], [0.355, 0.67], [0.376, 0.71], [0.335, 0.71], [0.325, 0.63], [0.335, 0.4], [0.25, 0.14], [0.001, 0.12]],
  bottle: [[0.001, 0], [0.06, 0], [0.09, 0.08], [0.095, 0.16], [0.07, 0.24], [0.035, 0.3], [0.03, 0.36], [0.042, 0.38], [0.025, 0.38], [0.001, 0.37]],
  pot: [[0.001, 0], [0.09, 0], [0.13, 0.08], [0.14, 0.16], [0.12, 0.24], [0.125, 0.26], [0.11, 0.26], [0.105, 0.24], [0.12, 0.16], [0.001, 0.04]],
};
/** 一件陶器（底在 y=0）：外壁淡、里面深；s 放大几倍 */
export function ware(kind: keyof typeof WARE, pig: RGB, dens: number, seg: number, s = 1): Geo {
  const g = lathe(WARE[kind].map(([r, y]) => [r * s, y * s] as [number, number]), seg);
  return dye(shade(g, (x, y, z, nx, _ny, nz) => (nx * x + nz * z < -1e-5 ? 0.55 : 1 - 0.08 * smooth(0.04 * s, 0, y))), pig, dens);
}

// —— 竹器 ——
/** 一只箩筐（底在 y=0）：r0 底、r1 口、h 高；筐身一道道篾纹 */
export function basket(r0: number, r1: number, h: number, seg = 12, dens = 1.25): Geo[] {
  const g = lathe([[0.001, 0], [r0, 0], [r1, h], [r1 - 0.012, h], [r0 - 0.012, 0.025], [0.001, 0.025]], seg);
  const rim: V3[] = [];
  for (let i = 0; i <= seg; i++) rim.push(v3(Math.cos((i / seg) * 6.2832) * (r1 + 0.004), h, Math.sin((i / seg) * 6.2832) * (r1 + 0.004)));
  return [dye(shade(g, (x, y, z) => (Math.hypot(x, z) < r0 + (r1 - r0) * (y / h) - 0.006 && y > 0.02 ? 0.6 : 0.9 + 0.1 * Math.sin(y * 70))), WOVEN, dens), dye(tube(rim, 0.009, 4), WOVEN, dens + 0.4)];
}
/** 一只竹匾（圆、浅，底在 y=0） */
export const trayGeo = (r: number, seg = 14) => dye(shade(lathe([[0.001, 0], [r, 0], [r + 0.04, 0.05], [r + 0.025, 0.05], [r - 0.01, 0.012], [0.001, 0.012]], seg), (x, y, z) => (y > 0.01 && Math.hypot(x, z) < r ? 0.92 : 1)), WOVEN, 1.2);
/** 背篓：上大下小的高筐（底在 y=0） */
const backBasket = (seg = 10) => [dye(shade(lathe([[0.001, 0], [0.13, 0], [0.16, 0.12], [0.24, 0.62], [0.255, 0.66], [0.24, 0.66], [0.225, 0.62], [0.145, 0.13], [0.115, 0.02], [0.001, 0.02]], seg), (_x, y) => 0.9 + 0.1 * Math.sin(y * 60)), WOVEN, 1.3)];
/** 簸箕：前口敞着的一只扁筐（底在 y=0，口朝 +x） */
const dustpan = () => dye(lathe([[0.001, 0], [0.3, 0.0], [0.36, 0.1], [0.345, 0.1], [0.29, 0.015], [0.001, 0.015]], 12, Math.PI * 0.35, Math.PI * 1.3), WOVEN, 1.2);
/** 斗笠（顶在 y=0 往下张开） */
const hatGeo = (seg = 14) => dye(shade(lathe([[0.27, -0.105], [0.262, -0.1], [0.16, -0.04], [0.06, 0.012], [0.02, 0.03], [0.001, 0.034]], seg), (x, _y, z) => 0.9 + 0.1 * Math.sin(Math.atan2(z, x) * 16)), INK.hemp, 1.15);

/** 一捆柴（横放，沿 x）：草的身（两头参差，露着枝梢）、两道绳 */
function bundle(b: Builder, obj: Bin, m: THREE.Matrix4, len: number, r: number, seed: number): void {
  const g = wobble(cyl(r, r * 0.92, len, 8, false, 3).rotateZ(Math.PI / 2), r * 0.18, 3, seed, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); if (Math.abs(x) > len * 0.45) p.setX(i, x + Math.sign(x) * 0.08 * Math.sin(p.getY(i) * 60 + p.getZ(i) * 40 + seed)); }
  b.add('thatch', tint(g, 0.8, 0.76, 0.68).applyMatrix4(m));
  for (const t of [-0.28, 0.28]) { const pts: V3[] = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * 6.2832; pts.push(v3(t * len, Math.cos(a) * (r + 0.008), Math.sin(a) * (r + 0.008))); } obj.push(dye(tube(pts, 0.008, 3), INK.hemp, 1.8).applyMatrix4(m)); }
}

export function buildHomes(c: Ctx, sub?: string[]): void {
  const on = (k: string) => !sub || sub.includes(k);
  if (on('f')) bambooHome(c);
  if (on('g')) potterHome(c);
  if (on('herbs')) herbGarden(c);
}

// ———————————————————————————— 己：篾匠 ————————————————————————————
function bambooHome(c: Ctx): void {
  const h = SITE.houses.find((x) => x.id === 'f')!, b = c.village, obj = binOf(b), R = rnd(7101), y0 = houseY('f'), z0 = h.d / 2, x0 = h.w / 2;
  const seg = (n: number) => (c.low ? Math.max(6, Math.round(n * 0.6)) : n);
  cottage(c, b, h, { id: 'f', wall: 2.2, roof: 'gable', rise: 2.1, over: 0.7, door: { x: 0, w: 0.95, state: 'half' }, windows: [1.85], chimney: [-2.1, -0.5], tone: 1.01, seed: 701 }, obj);
  b.push(M.trs(h.x, y0, h.z, h.yaw));
  lantern(b, obj, M.t(0.8, 2.0, z0 - 0.02));
  // 西山墙边斜靠着一捆竹竿（梢头歇在檐下，不顶着草）
  for (let i = 0; i < (c.low ? 9 : 15); i++) {
    const zc = -1.5 + (3.0 * (i + R.r(0.2, 0.8))) / (c.low ? 9 : 15), top = 1.95 + 0.55 * (1 - Math.abs(zc) / 1.6) + R.r(-0.15, 0.1), foot = R.r(0.95, 1.35);
    const k = R.r(0.88, 1.06);
    b.add('bamboo', tint(pole(v3(-x0 - foot, -0.05, zc + R.pm(0.12)), v3(-x0 - 0.06, top, zc + R.pm(0.05)), R.r(0.024, 0.034), 0.02, 5, 3), k, k, k * 0.95));
  }
  obj.push(dye(tube([v3(-x0 - 0.5, 0.95, -1.55), v3(-x0 - 0.42, 0.98, 0), v3(-x0 - 0.5, 0.95, 1.55)], 0.007, 3), INK.hemp, 1.7));
  // 门前：一条篾凳（低、长），凳上一把篾刀、几根劈开的篾；凳南一只小板凳（篾匠坐在这里，面朝北对着凳）
  const bx = 1.55, bz = z0 + 1.15;
  b.add('wood', wobble(box(1.4, 0.05, 0.28, 'x').translate(bx, 0.36, bz), 0.004, 2, 7102, 40, 0.5));
  for (const s of [-1, 1]) for (const e of [-1, 1]) b.add('wood', pole(v3(bx + s * 0.6, 0, bz + e * 0.16), v3(bx + s * 0.55, 0.34, bz + e * 0.1), 0.022, 0.02, 5));
  for (let i = 0; i < 6; i++) obj.push(dye(box(1.5 + R.r(-0.2, 0.3), 0.004, 0.022).translate(bx + R.pm(0.08), 0.392 + i * 0.005, bz - 0.06 + i * 0.026 + R.pm(0.006)), INK.bamboo, 1.25 + R.r(0, 0.3)));
  // 篾刀：宽背的刀身、一截木柄
  obj.push(dye(prism([[0, 0], [0.26, 0.012], [0.27, 0.07], [0.02, 0.075]], 0.006).rotateX(-Math.PI / 2).translate(bx + 0.18, 0.4, bz + 0.1), INK.iron, 2.2));
  obj.push(dye(cyl(0.016, 0.018, 0.16, 6).rotateZ(Math.PI / 2).translate(bx + 0.1, 0.405, bz + 0.065), INK.wood, 1.7));
  // 小板凳
  const sx = bx - 0.05, sz = bz + 0.72;
  b.add('wood', wobble(box(0.36, 0.035, 0.22, 'x').translate(sx, 0.24, sz), 0.003, 2, 7103, 40, 0.5));
  for (const s of [-1, 1]) b.add('wood', box(0.035, 0.22, 0.2).translate(sx + s * 0.15, 0.11, sz));
  // 编了一半的箩筐：底编好了，竖篾翘着，才起了几道
  {
    const wx = 0.35, wz = z0 + 1.95, n = c.low ? 16 : 24;
    obj.push(dye(lathe([[0.001, 0], [0.24, 0], [0.26, 0.04], [0.248, 0.045], [0.23, 0.012], [0.001, 0.012]], seg(14)).translate(wx, 0, wz), INK.bamboo, 1.45));
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.2832 + R.pm(0.04), r = 0.25; obj.push(dye(pole(v3(wx + Math.cos(a) * r, 0.03, wz + Math.sin(a) * r), v3(wx + Math.cos(a) * (r + 0.07 + R.r(0, 0.03)), 0.38 + R.r(0, 0.12), wz + Math.sin(a) * (r + 0.07 + R.r(0, 0.03))), 0.004, 0.0035, 3), INK.bamboo, 1.3)); }
    for (let k = 0; k < 3; k++) { const y = 0.06 + k * 0.035, rr = 0.255 + k * 0.009, pts: V3[] = []; for (let i = 0; i <= 18; i++) pts.push(v3(wx + Math.cos((i / 18) * 6.2832) * rr, y, wz + Math.sin((i / 18) * 6.2832) * rr)); obj.push(dye(tube(pts, 0.006, 3), INK.bamboo, 1.5)); }
  }
  // 晾篾片：两根杈竿、一根横竿，竿上搭着一绺绺长篾
  {
    const ax = -2.6, bx2 = -0.95, lz = z0 + 2.5, hh = 1.55;
    for (const x of [ax, bx2]) { b.add('wood', pole(v3(x, -0.2, lz), v3(x, hh + 0.04, lz), 0.026, 0.02, 5)); for (const e of [-1, 1]) b.add('wood', pole(v3(x, hh, lz), v3(x + e * 0.07, hh + 0.14, lz), 0.014, 0.011, 4)); }
    b.add('bamboo', pole(v3(ax - 0.25, hh + 0.06, lz), v3(bx2 + 0.25, hh + 0.07, lz), 0.018, 0.015, 5, 2));
    // 一绺一绺的篾：扁扁的一束搭在竿上，两头垂下（一束只勾一圈线，不至于成了一排黑杠）
    for (let i = 0; i < 6; i++) {
      const x = ax + 0.3 + i * 0.25 + R.pm(0.05), l1 = R.r(0.6, 0.95), l2 = R.r(0.5, 0.9), wd = R.r(0.016, 0.026), sw = R.pm(0.04);
      const path = [v3(x + sw, hh + 0.08 - l1, lz - 0.035), v3(x + sw * 0.5, hh + 0.02 - l1 * 0.4, lz - 0.03), v3(x, hh + 0.085, lz - 0.02), v3(x, hh + 0.1, lz), v3(x, hh + 0.085, lz + 0.02), v3(x - sw * 0.5, hh + 0.02 - l2 * 0.4, lz + 0.03), v3(x - sw, hh + 0.08 - l2, lz + 0.035)];
      obj.push(dye(sweep(path, [[-wd, -0.004], [wd, -0.004], [wd, 0.004], [-wd, 0.004]], { up: new THREE.Vector3(0, 0, 1) }), [0.87, 0.86, 0.69], R.r(0.95, 1.15)));
    }
  }
  // 编好的：门东墙根两只箩筐（一只上搁着簸箕），三只匾斜靠着墙；门西一只背篓
  for (const [i, [x, z, y]] of ([[2.85, z0 + 0.42, 0], [2.85, z0 + 0.42, 0.33]] as Array<[number, number, number]>).entries()) for (const g of basket(0.19, 0.25, 0.33, seg(12))) obj.push(g.translate(x + i * 0.02, y, z));
  obj.push(dustpan().applyMatrix4(M.mul(M.t(2.82, 0.67, z0 + 0.4), M.ry(0.4), M.rz(0.12))));
  for (let i = 0; i < 3; i++) obj.push(trayGeo(0.3 + 0.03 * i, seg(14)).applyMatrix4(M.mul(M.t(1.7 + i * 0.2, 0.31 + 0.03 * i, z0 + 0.18 + i * 0.05), M.rx(1.18 - i * 0.05))));
  for (const g of backBasket(seg(10))) obj.push(g.translate(-0.95, 0, z0 + 0.36));
  // 墙上的木橛挂着两顶新编的斗笠（门西）
  for (const [i, x] of [-1.75, -1.2].entries()) {
    b.add('wood', pole(v3(x, 1.62, z0 - 0.02), v3(x, 1.65, z0 + 0.09), 0.012, 0.01, 4));
    obj.push(hatGeo(seg(14)).applyMatrix4(M.mul(M.t(x, 1.53 - i * 0.03, z0 + 0.075), M.rx(Math.PI / 2 - 0.15), M.rz(0.1 * (i ? -1 : 1)))));
  }
  // 门楣上卷着一挂竹帘
  obj.push(dye(cyl(0.05, 0.05, 1.12, 8).rotateZ(Math.PI / 2).translate(0, 0.12 + 1.78 + 0.2, z0 + 0.06), INK.bamboo, 1.35));
  for (const s of [-1, 1]) obj.push(dye(tube([v3(s * 0.42, 2.15, z0 + 0.0), v3(s * 0.42, 2.06, z0 + 0.12), v3(s * 0.42, 2.0, z0 + 0.06)], 0.005, 3), INK.hemp, 1.6));
  b.pop();
  // 东山墙外一架丝瓜（藤、瓜由草木那边点）：六根竹竿、顶上横竖几道
  {
    const L = SITE.crafts.loofah, x0l = L.x - L.w / 2, x1l = L.x + L.w / 2, z0l = L.z - L.d / 2, z1l = L.z + L.d / 2;
    for (const x of [x0l, x1l]) for (const z of [z0l, L.z, z1l]) { const gy = ground(x, z); b.add('bamboo', pole(v3(x, gy - 0.2, z), v3(x + R.pm(0.03), gy + L.h + R.r(0, 0.08), z + R.pm(0.03)), 0.022, 0.018, 5, 2)); }
    const ty = ground(L.x, L.z) + L.h;
    for (const z of [z0l, L.z, z1l]) b.add('bamboo', pole(v3(x0l - 0.15, ty + R.pm(0.02), z), v3(x1l + 0.15, ty + R.pm(0.02), z), 0.014, 0.012, 5));
    for (let i = 0; i < 4; i++) { const x = x0l + (i * L.w) / 3; b.add('bamboo', pole(v3(x, ty + 0.03, z0l - 0.15), v3(x + R.pm(0.03), ty + 0.03, z1l + 0.15), 0.012, 0.01, 4)); }
    c.solid({ id: '己·丝瓜架', kind: 'rect', x: L.x, z: L.z, w: L.w + 0.1, d: L.d + 0.1 });
  }
  b.push(M.trs(h.x, y0, h.z, h.yaw));
  // 地上的篾屑：凳边几片浅色的碎篾
  for (let i = 0; i < (c.low ? 8 : 18); i++) { const a = R.r(0, 6.283), d = R.r(0.25, 1.0); obj.push(dye(box(R.r(0.05, 0.16), 0.004, 0.012).applyMatrix4(M.mul(M.t(bx + Math.cos(a) * d * 1.2, 0.004, bz + 0.3 + Math.sin(a) * d * 0.7), M.ry(R.r(0, 3.14)))), INK.bamboo, R.r(0.9, 1.3))); }
  b.pop();
  // 脚印与挂点
  const put = (id: string, lx: number, lz: number, w: number, d: number, top?: number) => { const [x, z] = WP(h, lx, lz); c.solid({ id: `己·${id}`, kind: 'rect', x, z, w, d, yaw: h.yaw, top: top != null ? y0 + top : undefined }); };
  put('竹竿', -x0 - 0.65, 0, 1.3, 3.3);
  put('篾凳', bx, bz, 1.45, 0.4, 0.4);
  put('小板凳', sx, sz, 0.38, 0.24, 0.26);
  put('箩筐', 0.35, z0 + 1.95, 0.6, 0.6);
  put('晾篾竿', -1.78, z0 + 2.5, 1.9, 0.2);
  put('编好的筐匾', 2.3, z0 + 0.35, 1.5, 0.6);
  put('背篓', -0.95, z0 + 0.36, 0.5, 0.5);
  { const [x, z] = WP(h, sx, sz); c.anchor('bambooSeat', x, y0 + 0.26, z, h.yaw + Math.PI); }
  { const [x, z] = WP(h, bx, bz); c.anchor('bambooWork', x, y0 + 0.4, z, h.yaw); }
  { const [x, z] = WP(h, 0.35, z0 + 1.95); c.anchor('bambooBasket', x, y0 + 0.05, z, h.yaw); }
}

// ———————————————————————————— 庚：陶家 ————————————————————————————
function potterHome(c: Ctx): void {
  const h = SITE.houses.find((x) => x.id === 'g')!, b = c.village, obj = binOf(b), R = rnd(8101), y0 = houseY('g'), z0 = h.d / 2, x0 = h.w / 2;
  const seg = (n: number) => (c.low ? Math.max(6, Math.round(n * 0.6)) : n);
  cottage(c, b, h, { id: 'g', wall: 2.3, roof: 'hip', rise: 2.3, over: 0.75, hip: 1.75, door: { x: 0, w: 1.0, state: 'half' }, windows: [-2.3, 2.3], chimney: [2.7, -0.5], tone: 0.98, seed: 801 }, obj);
  b.push(M.trs(h.x, y0, h.z, h.yaw));
  lantern(b, obj, M.t(-0.85, 2.0, z0 - 0.02));
  // 门边一口水缸（和泥、洗手都用它），缸沿搭一只瓢
  obj.push(ware('vat', [0.68, 0.64, 0.6], 1.7, seg(16)).translate(1.0, 0, z0 + 0.48));
  obj.push(dye(cyl(0.325, 0.325, 0.004, seg(14)), [0.66, 0.74, 0.8], 1.6).translate(1.0, 0.6, z0 + 0.48));
  obj.push(dye(lathe([[0.001, -0.05], [0.06, -0.04], [0.075, 0.0], [0.07, 0.0], [0.055, -0.035], [0.001, -0.045]], 9).rotateZ(-0.4), INK.gourd, 1.3).translate(1.22, 0.74, z0 + 0.3));
  // 屋前两排阴坯的架子（砖垛上搭板）：门前留出走道
  const rows: Array<[number, number, number]> = [[-2.75, -0.75, z0 + 1.9], [0.75, 2.85, z0 + 1.9], [-2.6, -0.75, z0 + 3.3], [0.75, 2.7, z0 + 3.3]];
  for (const [xa, xb, rz] of rows) {
    // 砖垛：三块砖叠着（不齐）
    for (const x of [xa + 0.15, (xa + xb) / 2, xb - 0.15]) for (let k = 0; k < 3; k++) b.add('earth', tint(renormal(wobble(box(0.24, 0.085, 0.13), 0.004, 8, 8102 + Math.round(x * 10 + rz) + k, 0), 40), 0.93, 0.91, 0.9).applyMatrix4(M.mul(M.t(x + R.pm(0.015), 0.045 + k * 0.09, rz), M.ry(k % 2 ? Math.PI / 2 + R.pm(0.1) : R.pm(0.1)))));
    b.add('wood', wobble(box(xb - xa, 0.035, 0.3, 'x').translate((xa + xb) / 2, 0.29, rz), 0.004, 2, 8110 + Math.round(rz * 10), 40, 0.5));
  }
  // 坯：春夏秋摊在架上（怕雨、天黑收进屋）；冬天歇着
  for (const s of SEASONS) {
    if (s === 'winter') continue;
    const RR = rnd(8120), D = binOf(c.dry[s]);
    for (const [xa, xb, rz] of rows) for (let x = xa + 0.16; x < xb - 0.1; x += c.low ? 0.42 : 0.27) {
      const kind = RR() < 0.45 ? 'bowl' : RR() < 0.6 ? 'jar' : 'pot', sc = RR.r(0.85, 1.1);
      D.push(ware(kind, WARE_GREEN, RR.r(0.95, 1.15), seg(9), sc).applyMatrix4(M.mul(M.trs(h.x, y0, h.z, h.yaw), M.t(x + RR.pm(0.03), 0.307, rz + RR.pm(0.05)))));
    }
  }
  b.pop();
  for (const [xa, xb, rz] of rows) { const [x, z] = WP(h, (xa + xb) / 2, rz); c.solid({ id: '庚·坯架', kind: 'rect', x, z, w: xb - xa + 0.1, d: 0.4, yaw: h.yaw, top: y0 + 0.31 }); }
  { const [x, z] = WP(h, 1.0, z0 + 0.48); c.solid({ id: '庚·水缸', kind: 'disc', x, z, r: 0.42 }); }

  // —— 屋后靠村路这边：烧好的缸、盆、罐沿着北墙码着，过路的人好看 ——
  {
    const wz = -z0 - 0.62;
    b.push(M.trs(h.x, y0, h.z, h.yaw));
    for (const [i, x] of [-2.6, -1.8, -1.02].entries()) obj.push(ware('vat', i === 1 ? INK.glaze : WARE_FIRED, i === 1 ? 1.45 : 1.15, seg(16), 1 - 0.06 * i).translate(x, 0, wz + R.pm(0.05)));
    // 一摞盆（倒扣着，一只套一只）、一摞碗
    for (let k = 0; k < 4; k++) obj.push(ware('basin', WARE_FIRED, 1.1, seg(14)).applyMatrix4(M.mul(M.t(-0.1, 0.16 + k * 0.035, wz + 0.05), M.rx(Math.PI))));
    for (let k = 0; k < 6; k++) obj.push(ware('bowl', WARE_GREY, 1.05, seg(10)).translate(0.45, k * 0.03, wz - 0.22));
    for (const [j, [dx, dz]] of ([[0.95, 0.05], [1.4, -0.1], [1.85, 0.05], [2.35, -0.05]] as Array<[number, number]>).entries()) obj.push(ware(j === 1 ? 'bottle' : j === 3 ? 'pot' : 'jar', j === 1 ? INK.glaze : j === 2 ? WARE_FIRED : WARE_GREY, j === 1 ? 1.35 : 1.05, seg(12), 1.15).translate(dx, 0, wz + dz));
    b.pop();
    const [x, z] = WP(h, -0.15, wz); c.solid({ id: '庚·成品缸罐', kind: 'rect', x, z, w: 5.4, d: 0.9, yaw: h.yaw });
  }

  potShed(c, R);
  kiln(c, R);
}

/** 坯棚：一面坡的敞棚，背后（南）一道矮土墙，敞着的一面朝北对着村路。陶车、凳、水盆、拉好的坯、靠后墙两层坯架、几块揉好的泥；棚外（西）一堆泥、一个泥池 */
function potShed(c: Ctx, R: Rand): void {
  const S = SITE.crafts.potShed, b = c.village, obj = binOf(b), y0 = ground(S.x, S.z), w = 3.8, d = 2.6, hF = 2.12, hB = 1.62;
  const seg = (n: number) => (c.low ? Math.max(6, Math.round(n * 0.6)) : n);
  b.push(M.trs(S.x, y0, S.z, S.yaw));
  // 地坪：夯平的一块（坡上那头埋进土里）
  b.add('earth', shade(wobble(sbox(w + 0.5, 0.6, d + 0.5, 0.6).translate(0, -0.27, 0), 0.03, 0.8, 8201, 50, 0.15), (_x, _y, _z, _nx, ny) => (ny > 0.7 ? 1.05 : 0.95)));
  // 柱：前三后二；后面一道矮土墙
  for (const x of [-w / 2 + 0.1, 0, w / 2 - 0.1]) b.add('wood', post(x, d / 2 - 0.1, -0.05, hF, 0.07, 8202 + x));
  for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) b.add('wood', post(x, -d / 2 + 0.1, -0.05, hB, 0.065, 8205 + x));
  b.add('earth', wobble(sbox(w - 0.1, 0.95, 0.28, 0.4).translate(0, 0.42, -d / 2 + 0.16), 0.02, 0.9, 8206, 40, 0.6));
  b.add('wood', pole(v3(-w / 2 - 0.2, hF, d / 2 - 0.1), v3(w / 2 + 0.2, hF + 0.01, d / 2 - 0.1), 0.055, 0.05, 7, 2));
  b.add('wood', pole(v3(-w / 2 - 0.2, hB, -d / 2 + 0.1), v3(w / 2 + 0.2, hB + 0.01, -d / 2 + 0.1), 0.05, 0.045, 7, 2));
  for (const x of [-1.5, -0.5, 0.5, 1.5]) b.add('wood', pole(v3(x, hF + 0.05, d / 2 + 0.2), v3(x, hB + 0.02, -d / 2 - 0.2), 0.03, 0.026, 5));
  const lt = thatchRoof({ lean: true, w: w + 0.9, d: d + 0.75, rise: hF - hB + 0.22, hip: 0, thick: 0.16, sag: 0.06, droop: 0.05, courses: 2, step: 0.04, rag: 0.065, cell: c.low ? 0.22 : 0.14, seed: 8207, roll: 0, tone: 0.95 });
  b.add('thatch', lt.thatch.applyMatrix4(M.mul(M.t(0, hB - 0.08, d / 2 + 0.4), M.ry(Math.PI))));
  // 陶车：一块平石上立轴，轴上一只厚木轮，轮心一团泥，泥上拉起了半只罐
  const wx = -0.65, wz = 0.35;
  b.add('stone', at(flatRock(8210, 0.32, 0.1, 0.3, 1), wx, -0.01, wz));
  b.add('wood', cylUp(0.06, 0.07, 0.22, 7).translate(wx, 0.08, wz));
  b.add('wood', wobble(cyl(0.44, 0.45, 0.075, seg(18)).translate(wx, 0.33, wz), 0.006, 3, 8211, 0));
  obj.push(ware('jar', WARE_GREEN, 0.95, seg(12), 1.15).translate(wx, 0.37, wz));
  obj.push(dye(lathe([[0.001, 0], [0.16, 0], [0.15, 0.03], [0.001, 0.035]], seg(12)), [0.82, 0.76, 0.66], 1.2).translate(wx, 0.367, wz));
  b.add('wood', pole(v3(wx + 0.3, 0.02, wz + 0.42), v3(wx + 0.95, 0.03, wz + 0.25), 0.014, 0.012, 5));
  // 陶工坐的矮凳（轮西），手边一只水盆
  b.add('wood', at(renormal(wobble(cylUp(0.15, 0.16, 0.3, 8, false, 1), 0.006, 3, 8212, 0), 50), wx - 0.62, 0, wz));
  for (const g of bucketGeo(0.15, 0.18, 0.13, seg(10))) obj.push(g.translate(wx + 0.12, 0, wz + 0.62));
  obj.push(dye(cyl(0.16, 0.16, 0.004, seg(10)), [0.7, 0.68, 0.62], 1.4).translate(wx + 0.12, 0.1, wz + 0.62));
  // 拉好的坯：两块砖上搭一块板，板上四只
  b.add('stone', tint(sbox(0.2, 0.2, 0.22, 0.2).translate(0.55, 0.1, 0.55), 1.05, 0.98, 0.94));
  b.add('stone', tint(sbox(0.2, 0.2, 0.22, 0.2).translate(1.45, 0.1, 0.55), 1.05, 0.98, 0.94));
  b.add('wood', wobble(box(1.25, 0.035, 0.3, 'x').translate(1.0, 0.22, 0.55), 0.004, 2, 8213, 40, 0.5));
  for (const [i, x] of [0.55, 0.85, 1.15, 1.42].entries()) obj.push(ware(i % 2 ? 'pot' : 'jar', WARE_GREEN, 0.95, seg(10), 1.05).translate(x, 0.24, 0.55));
  // 靠北两层坯架，摆满了阴着的坯
  const sz = -d / 2 + 0.52;
  for (const x of [-1.65, 0, 1.65]) b.add('wood', boxUp(0.05, 1.12, 0.05, 'y').translate(x, 0, sz));
  for (const y of [0.45, 1.05]) b.add('wood', wobble(box(3.5, 0.035, 0.34, 'x').translate(0, y, sz), 0.004, 2, 8214 + y * 10, 40, 0.5));
  for (const y of [0.47, 1.07]) for (let x = -1.6; x < 1.62; x += c.low ? 0.4 : 0.25) obj.push(ware(R() < 0.5 ? 'bowl' : R() < 0.5 ? 'jar' : 'bottle', WARE_GREEN, R.r(0.9, 1.1), seg(9), R.r(0.85, 1.05)).translate(x + R.pm(0.03), y, sz + R.pm(0.04)));
  // 揉好的泥块，码在东南角
  for (let i = 0; i < 4; i++) b.add('earth', tint(renormal(wobble(sbox(0.3, 0.18, 0.24, 0.15).translate(0, 0.09, 0), 0.025, 6, 8220 + i, 0), 50), 0.9, 0.86, 0.8).translate(1.45 + (i % 2) * 0.32, (i > 1 ? 0.18 : 0), -0.25 + R.pm(0.04)));
  // 棚外西头：一堆泥（插着一把木槌）、一个泥池（木框，池里是稀泥水）
  b.add('earth', tint(renormal(wobble(lathe([[0.95, -0.15], [0.85, 0.15], [0.55, 0.38], [0.2, 0.5], [0.001, 0.52]], 12), 0.06, 1.6, 8230, 0), 46), 0.9, 0.88, 0.84).translate(w / 2 + 1.2, 0, 0.5));
  b.add('wood', pole(v3(w / 2 + 1.0, 0.4, 0.45), v3(w / 2 + 0.75, 1.15, 0.6), 0.02, 0.018, 5));
  b.add('wood', cyl(0.07, 0.07, 0.28, 8).rotateZ(-1.1).translate(w / 2 + 0.73, 1.2, 0.61));
  { const px = w / 2 + 1.25, pz = 1.85; for (const [dx, dz, ww, dd] of [[0, -0.55, 1.5, 0.1], [0, 0.55, 1.5, 0.1], [-0.72, 0, 0.1, 1.2], [0.72, 0, 0.1, 1.2]] as Array<[number, number, number, number]>) b.add('wood', wobble(box(ww, 0.16, dd).translate(px + dx, 0.04, pz + dz), 0.006, 2, 8231, 40, 0.5)); obj.push(dye(box(1.36, 0.01, 1.0).translate(px, 0.06, pz), [0.74, 0.71, 0.66], 1.6)); }
  b.pop();
  // 脚印：柱、后墙与坯架、陶车与凳、板、泥堆、泥池；棚顶（给画法：棚底下不积雪；檐字头的不挡路）
  const W2 = (lx: number, lz: number) => WP(S, lx, lz);
  for (const [lx, lz] of [[-w / 2 + 0.1, d / 2 - 0.1], [0, d / 2 - 0.1], [w / 2 - 0.1, d / 2 - 0.1]] as Array<[number, number]>) { const [x, z] = W2(lx, lz); c.solid({ id: '庚·坯棚·柱', kind: 'disc', x, z, r: 0.09 }); }
  { const [x, z] = W2(0, -d / 2 + 0.35); c.solid({ id: '庚·坯棚·后墙与坯架', kind: 'rect', x, z, w: w + 0.1, d: 0.75, yaw: S.yaw }); }
  { const [x, z] = W2(wx - 0.25, wz); c.solid({ id: '庚·陶车', kind: 'rect', x, z, w: 1.35, d: 0.95, yaw: S.yaw, top: y0 + 0.4 }); }
  { const [x, z] = W2(1.0, 0.55); c.solid({ id: '庚·坯板', kind: 'rect', x, z, w: 1.3, d: 0.36, yaw: S.yaw, top: y0 + 0.5 }); }
  { const [x, z] = W2(1.6, -0.15); c.solid({ id: '庚·泥块', kind: 'rect', x, z, w: 0.75, d: 0.4, yaw: S.yaw }); }
  { const [x, z] = W2(w / 2 + 1.2, 0.5); c.solid({ id: '庚·泥堆', kind: 'disc', x, z, r: 0.95 }); }
  { const [x, z] = W2(w / 2 + 1.25, 1.85); c.solid({ id: '庚·泥池', kind: 'rect', x, z, w: 1.55, d: 1.25, yaw: S.yaw }); }
  c.solid({ id: '庚·坯棚·檐口', kind: 'rect', x: S.x, z: S.z, w: w + 0.9, d: d + 0.75, yaw: S.yaw, top: y0 + hB - 0.08, roof: y0 + hB - 0.1 });
  { const [x, z] = W2(wx - 0.62, wz); c.anchor('potSeat', x, y0 + 0.3, z, S.yaw + Math.PI / 2); }
  { const [x, z] = W2(wx, wz); c.anchor('potWheel', x, y0 + 0.37, z, S.yaw); }
}

/** 馒头窑：土坯垒的圆顶，窑门朝着屋（门里是火），背后一根方烟囱；窑边柴捆、劈柴、刚出窑的罐、一堆碎陶片 */
function kiln(c: Ctx, R: Rand): void {
  const K = SITE.crafts.kiln, b = c.village, obj = binOf(b), y0 = ground(K.x, K.z) - 0.04, m = M.trs(K.x, y0, K.z, K.yaw);
  const seg = (n: number) => (c.low ? Math.max(8, Math.round(n * 0.6)) : n);
  b.push(m);
  // 窑台：一圈夯土
  b.add('earth', shade(wobble(lathe([[2.05, -0.5], [1.98, 0.02], [1.78, 0.14], [0.001, 0.15]], seg(18)), 0.05, 0.9, 8301, 0), (_x, _y, _z, _nx, ny) => (ny > 0.7 ? 1.04 : 0.93)));
  // 窑身：圆顶，越往上越熏得黑；窑门四周也熏黑一块
  const dome = lathe([[1.44, -0.05], [1.43, 0.32], [1.38, 0.72], [1.25, 1.12], [1.03, 1.52], [0.71, 1.85], [0.35, 2.05], [0.001, 2.11]], seg(20));
  wobble(dome, 0.035, 0.9, 8302, 50, 0.8);
  b.add('earth', shade(tint(dome, 0.97, 0.96, 0.95), (x, y, z) => 1 - 0.3 * smooth(1.1, 2.1, y) - 0.28 * smooth(0.95, 0.25, Math.hypot(x, (z - 1.4) * 0.8, (y - 0.5) * 0.7))));
  // 窑门：一道拱，门洞里黑；砖砌的门框；下半截用砖封了几层，上面留着添柴的口
  const arch: Array<[number, number]> = [[-0.32, 0], [0.32, 0], [0.32, 0.48], [0.24, 0.66], [0, 0.76], [-0.24, 0.66], [-0.32, 0.48]];
  b.add('dark', prism(arch, 0.4).translate(0, 0.02, 1.36));
  const brick = (w: number, hh: number, d: number, x: number, y: number, z: number, ry = 0, k = 1) => b.add('earth', tint(renormal(wobble(box(w, hh, d), 0.004, 8, 8310 + Math.round(x * 31 + y * 17), 0), 40), 0.95 * k, 0.92 * k, 0.9 * k).applyMatrix4(M.mul(M.t(x, y, z), M.ry(ry))));
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) brick(0.18, 0.11, 0.2, s * 0.42, 0.06 + k * 0.12, 1.5, 0, R.r(0.92, 1.05));
  for (let k = 0; k < 7; k++) { const a = Math.PI * (k / 6), r = 0.43; brick(0.17, 0.1, 0.2, Math.cos(a) * r, 0.5 + Math.sin(a) * r * 0.62, 1.52, 0, R.r(0.92, 1.05)); }
  for (let row = 0; row < 2; row++) for (let k = 0; k < 3; k++) brick(0.2, 0.09, 0.12, -0.21 + k * 0.21 + (row % 2) * 0.05, 0.05 + row * 0.1, 1.6, R.pm(0.05), R.r(0.9, 1.04));
  // 门里的火：几块红的炭、几块黑的（冬天歇窑：没有火，门前一捆没烧的柴，窑顶苫着草帘）
  for (const s of SEASONS) {
    const sb = c.season[s];
    sb.push(m);
    if (s !== 'winter') {
      for (let i = 0; i < (c.low ? 6 : 10); i++) { const hot = i % 3 !== 0, g = rockGeo(8320 + i, R.r(0.05, 0.09), R.r(0.04, 0.07), R.r(0.05, 0.08), 0); sb.add('ember', dye(g, hot ? [0.98, 0.6, 0.42] : [0.42, 0.38, 0.36], hot ? 1.0 : 1.6).translate(R.pm(0.22), 0.26 + R.r(0, 0.1), 1.58 + R.pm(0.03))); }
    } else {
      sb.add('obj', dye(shade(wobble(lathe([[1.36, 1.0], [1.15, 1.48], [0.81, 1.87], [0.42, 2.1], [0.001, 2.2]], seg(16)), 0.03, 1.4, 8330, 0), (x, _y, z) => 0.9 + 0.1 * Math.sin(Math.atan2(z, x) * 22)), INK.hemp, 1.05));
      for (const ss of [-1, 1]) sb.add('obj', dye(at(rockGeo(8331 + ss, 0.12, 0.08, 0.11, 0), ss * 0.6, 1.72, 0.5), INK.slate, 1.3));
    }
    sb.pop();
  }
  // 烟囱：背后一根方的，上细下粗，顶口黑
  b.add('earth', shade(tint(renormal(wobble(lathe4([[0.31, -0.2], [0.3, 2.3], [0.24, 3.18], [0.27, 3.22], [0.27, 3.3], [0.001, 3.3]]), 0.012, 3, 8340, 0), 40), 0.95, 0.93, 0.92), (_x, y) => 1 - 0.35 * smooth(2.2, 3.3, y)).translate(0, 0, -1.28));
  b.add('dark', box(0.3, 0.02, 0.3).translate(0, 3.31, -1.28));
  // 窑西：柴捆码成一垛、一摞劈柴；窑东：几只刚出窑的罐、一只缸
  for (const [i, [x, y, z, ry]] of ([[-1.85, 0.16, 0.5, 0.1], [-1.86, 0.16, 0.86, -0.05], [-1.9, 0.16, 1.22, 0.08], [-1.87, 0.16, 1.58, -0.04], [-1.87, 0.45, 0.68, 0], [-1.88, 0.45, 1.04, 0.06], [-1.86, 0.45, 1.4, -0.07]] as Array<[number, number, number, number]>).entries()) bundle(b, obj, M.mul(M.t(x, y, z), M.ry(Math.PI / 2 + ry)), 1.25, 0.155, 8350 + i);
  for (let row = 0; row < 4; row++) for (let i = 0; i < 6 - row; i++) {
    const r2 = R.r(0.05, 0.075), k = R.r(0.84, 1.06), g = cyl(r2, r2 * R.r(0.85, 1), R.r(0.55, 0.7), 6).rotateX(Math.PI / 2).rotateY(R.pm(0.05));
    b.add('wood', shade(tint(g, k), (_x, _y, _z, _nx, _ny, nz) => (Math.abs(nz) > 0.7 ? 1.35 : 1)).translate(-1.3 - 0.0 + (i - (5 - row) / 2) * 0.15 + R.pm(0.01), 0.07 + row * 0.12, -0.95 + R.pm(0.02)));
  }
  for (const [i, [x, z]] of ([[1.05, 1.55], [1.4, 1.25], [1.32, 1.72]] as Array<[number, number]>).entries()) obj.push(ware(i === 2 ? 'pot' : 'jar', i === 1 ? WARE_GREY : WARE_FIRED, 1.2, seg(12), 1.25).translate(x, 0.12, z));
  obj.push(ware('vat', WARE_FIRED, 1.3, seg(16), 0.85).translate(1.75, 0.08, 0.7));
  // 一堆碎陶片（窑后东边）
  for (let i = 0; i < (c.low ? 8 : 16); i++) {
    const r = R.r(0.08, 0.2), g = lathe([[r, 0], [r * 1.12, R.r(0.05, 0.12)]], 3, R.r(0, 6.28), R.r(0.6, 1.3));
    obj.push(dye(g, R() < 0.6 ? WARE_FIRED : R() < 0.5 ? WARE_GREY : INK.glaze, R.r(1.1, 1.6)).applyMatrix4(M.mul(M.t(1.25 + R.pm(0.45), 0.05 + R.r(0, 0.1), -1.35 + R.pm(0.4)), M.rx(R.pm(1.2)), M.rz(R.pm(1.2)))));
  }
  b.pop();
  // 脚印：窑身（连烟囱）、柴垛、劈柴、罐
  const W2 = (lx: number, lz: number) => WP(K, lx, lz);
  c.solid({ id: '庚·窑', kind: 'disc', x: K.x, z: K.z, r: 1.6, top: y0 + 2.1 });
  { const [x, z] = W2(0, -1.28); c.solid({ id: '庚·窑·烟囱', kind: 'disc', x, z, r: 0.4 }); }
  { const [x, z] = W2(-1.86, 0.95); c.solid({ id: '庚·窑·柴捆', kind: 'rect', x, z, w: 1.4, d: 1.55, yaw: K.yaw }); }
  { const [x, z] = W2(-1.3, -0.95); c.solid({ id: '庚·窑·劈柴', kind: 'rect', x, z, w: 1.0, d: 0.7, yaw: K.yaw }); }
  { const [x, z] = W2(1.4, 1.3); c.solid({ id: '庚·窑·罐', kind: 'disc', x, z, r: 0.6 }); }
  { const [x, z] = W2(0, 1.7); c.anchor('kilnMouth', x, y0 + 0.15, z, K.yaw); }
  { const [x, z] = W2(0, -1.28); c.anchor('kilnSmoke', x, y0 + 3.35, z, 0); }
}

// ———————————————————————————— 先生的药圃 ————————————————————————————
function herbGarden(c: Ctx): void {
  const G = SITE.crafts.herbs, b = c.home, obj = binOf(b), R = rnd(9101);
  const beds = G.beds, bz0 = G.bz0, bz1 = G.bz1;
  // 每畦：略高出一点的松土（色深些），一圈竹篾编的矮边，四角各一根短桩
  for (const [xa, xb] of beds) {
    const nx = 4, nz = 10, pts: V3[][] = [];
    for (let i = 0; i <= nx; i++) { pts.push([]); for (let j = 0; j <= nz; j++) { const x = xa + ((xb - xa) * i) / nx, z = bz0 + ((bz1 - bz0) * j) / nz, e = Math.min(i, nx - i, j, nz - j) > 0 ? 1 : 0; pts[i].push(v3(x, ground(x, z) + 0.025 + (0.05 + R.pm(0.012)) * e, z)); } }
    b.add('earth', tint(facing(grid(pts, (_i, _j, p) => [p.x, p.z]), () => [0, 1, 0]), 0.9, 0.88, 0.85));
    const per: Array<[number, number, number, number]> = [[xa, bz0, xb, bz0], [xb, bz0, xb, bz1], [xb, bz1, xa, bz1], [xa, bz1, xa, bz0]];
    for (const [ax, az, ex, ez] of per) {
      const len = Math.hypot(ex - ax, ez - az), n = Math.max(2, Math.round(len / 0.6)), path: V3[] = [];
      for (let i = 0; i <= n; i++) { const x = ax + ((ex - ax) * i) / n, z = az + ((ez - az) * i) / n; path.push(v3(x, ground(x, z) - 0.03, z)); }
      b.add('wood', tint(sweep(path, [[-0.012, 0], [0.012, 0], [0.012, 0.13], [-0.012, 0.13]]), 1.12, 1.1, 1.06));
      b.add('wood', pole(v3(ax, ground(ax, az) - 0.05, az), v3(ax + R.pm(0.01), ground(ax, az) + 0.2, az), 0.014, 0.012, 5));
    }
  }
  // 北头的晒药棚：一面坡，朝南敞着；三层架子搁着匾，梁下吊几把药草；一张矮几、一只药碾；棚柱边靠着药锄
  const sx = (G.x0 + G.x1) / 2 - 0.3, sz = G.z0 + 0.85, sw = 2.7, sd = 1.3, gy = ground(sx, sz), hF = 1.95, hB = 1.5;
  b.push(M.t(sx, gy, sz));
  b.add('earth', shade(wobble(sbox(sw + 0.3, 0.4, sd + 0.3, 0.6).translate(0, -0.17, 0), 0.025, 0.8, 9102, 50, 0.15), (_x, _y, _z, _nx, ny) => (ny > 0.7 ? 1.05 : 0.95)));
  for (const x of [-sw / 2 + 0.08, sw / 2 - 0.08]) { b.add('wood', post(x, sd / 2 - 0.08, -0.05, hF, 0.055, 9103 + x, 6)); b.add('wood', post(x, -sd / 2 + 0.08, -0.05, hB, 0.05, 9105 + x, 6)); }
  b.add('wood', pole(v3(-sw / 2 - 0.15, hF, sd / 2 - 0.08), v3(sw / 2 + 0.15, hF + 0.01, sd / 2 - 0.08), 0.045, 0.04, 6, 2));
  b.add('wood', pole(v3(-sw / 2 - 0.15, hB, -sd / 2 + 0.08), v3(sw / 2 + 0.15, hB + 0.01, -sd / 2 + 0.08), 0.04, 0.036, 6, 2));
  const lt = thatchRoof({ lean: true, w: sw + 0.7, d: sd + 0.6, rise: hF - hB + 0.18, hip: 0, thick: 0.13, sag: 0.05, droop: 0.04, courses: 2, step: 0.035, rag: 0.055, cell: c.low ? 0.2 : 0.13, seed: 9106, roll: 0, tone: 0.97 });
  b.add('thatch', lt.thatch.applyMatrix4(M.mul(M.t(0, hB - 0.06, sd / 2 + 0.3), M.ry(Math.PI))));
  // 三层架：两副梯形的竹架，三道横档上各搁一只匾（匾里是晒着的药：深浅不一的绿褐）
  const rx = -0.55, rz = -sd / 2 + 0.38;
  for (const s of [-1, 1]) for (const e of [-1, 1]) b.add('bamboo', pole(v3(rx + s * 0.55, -0.02, rz + e * 0.26), v3(rx + s * 0.52, 1.25, rz + e * 0.2), 0.016, 0.013, 5));
  for (let k = 0; k < 3; k++) {
    const y = 0.32 + k * 0.4;
    for (const e of [-1, 1]) b.add('bamboo', pole(v3(rx - 0.62, y, rz + e * 0.24), v3(rx + 0.62, y, rz + e * 0.24), 0.011, 0.011, 4));
    obj.push(trayGeo(0.4, c.low ? 10 : 14).translate(rx + R.pm(0.03), y + 0.012, rz));
    obj.push(dye(wobble(lathe([[0.36, 0.014], [0.22, 0.04], [0.001, 0.05]], 10), 0.014, 6, 9110 + k, 0), k === 0 ? [0.8, 0.78, 0.62] : k === 1 ? [0.78, 0.82, 0.66] : [0.84, 0.76, 0.64], 1.25).translate(rx, y + 0.012, rz));
  }
  // 梁下吊着的药草：一把一把倒挂着
  for (let i = 0; i < (c.low ? 3 : 5); i++) {
    const x = 0.2 + i * 0.22, top = hF - 0.04, l = R.r(0.32, 0.45);
    obj.push(dye(tube([v3(x, top, sd / 2 - 0.08), v3(x, top - 0.12, sd / 2 - 0.08)], 0.003, 3), INK.hemp, 1.6));
    obj.push(dye(wobble(lathe([[0.012, 0], [0.05, -l * 0.35], [0.07, -l * 0.8], [0.03, -l], [0.001, -l]], 7), 0.012, 9, 9120 + i, 0), R() < 0.5 ? [0.78, 0.8, 0.64] : [0.82, 0.78, 0.62], 1.3).translate(x, top - 0.12, sd / 2 - 0.08));
  }
  // 矮几、药碾（船形的碾槽，一只带轴的碾轮）
  const tx = 0.75, tz = -0.1;
  b.add('wood', wobble(box(0.7, 0.035, 0.4, 'x').translate(tx, 0.42, tz), 0.003, 2, 9130, 40, 0.5));
  for (const s of [-1, 1]) b.add('wood', box(0.035, 0.4, 0.34).translate(tx + s * 0.3, 0.2, tz));
  const trough = lathe([[0.001, 0], [0.07, 0], [0.09, 0.08], [0.08, 0.085], [0.025, 0.035], [0.001, 0.03]], 8).scale(2.9, 1, 1);
  obj.push(dye(trough, INK.iron, 1.9).translate(tx, 0.44, tz));
  obj.push(dye(cyl(0.075, 0.075, 0.025, 12).rotateX(Math.PI / 2), INK.iron, 2.0).translate(tx + 0.05, 0.52, tz));
  obj.push(dye(cyl(0.008, 0.008, 0.32, 5).rotateX(Math.PI / 2), INK.wood, 1.7).translate(tx + 0.05, 0.52, tz));
  // 棚柱边靠着药锄、一只背篓
  b.add('wood', pole(v3(sw / 2 + 0.2, 0, sd / 2 + 0.25), v3(sw / 2 + 0.05, 1.15, sd / 2 - 0.05), 0.014, 0.012, 5));
  obj.push(dye(box(0.08, 0.13, 0.01).translate(0, -0.05, 0.015).applyMatrix4(M.mul(M.t(sw / 2 + 0.2, 0.06, sd / 2 + 0.27), M.rx(1.2))), INK.iron, 2.1));
  for (const g of backBasket(c.low ? 8 : 10)) obj.push(g.translate(-sw / 2 - 0.42, 0, 0.25));
  b.pop();
  // 脚印：三畦药（一整块，人沿着走）、棚（后半截有架子）、矮几、背篓；棚顶
  c.solid({ id: '药圃', kind: 'rect', x: (G.x0 + G.x1) / 2, z: (bz0 + bz1) / 2, w: G.x1 - G.x0 - 0.4, d: bz1 - bz0 + 0.1, top: gy + 0.2 });
  c.solid({ id: '药圃·晒药架', kind: 'rect', x: sx + rx, z: sz + rz, w: 1.3, d: 0.6 });
  for (const x of [-sw / 2 + 0.08, sw / 2 - 0.08]) c.solid({ id: '药圃·棚柱', kind: 'disc', x: sx + x, z: sz + sd / 2 - 0.08, r: 0.07 });
  c.solid({ id: '药圃·矮几', kind: 'rect', x: sx + tx, z: sz + tz, w: 0.72, d: 0.42, top: gy + 0.44 });
  c.solid({ id: '药圃·背篓', kind: 'disc', x: sx - sw / 2 - 0.42, z: sz + 0.25, r: 0.28 });
  c.solid({ id: '药圃·晒药棚·檐口', kind: 'rect', x: sx, z: sz, w: sw + 0.7, d: sd + 0.6, top: gy + hB - 0.06, roof: gy + hB - 0.08 });
  c.anchor('herbMill', sx + tx, gy + 0.44, sz + tz, 0);
}
