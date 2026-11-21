/**
 * 随季节换的东西——是住在这里的人随季节过日子，不是雪进了屋：
 *   草堂里 —— 条几上一只胆瓶，瓶里随季换一枝：春桃、夏荷、秋菊、冬梅；
 *             西间榻前一只矮火盆架：冬天架上一只火盆，炭是红的；别的季节架上是一盆石菖蒲；
 *             榻上：春秋叠着一床被；夏天铺一领竹席，搁一个竹夫人、一把蒲扇；冬天被摊开，再加一床。
 *   院里   —— 草堂东头一副晒架（两副竹马、两根竿），竿上随季晒东西：春天是屋后新笋切的笋干，夏天摊开的书（晒书），
 *             秋天柿饼、菊花，冬天萝卜干、一棵棵晾着的白菜，架脚一口压着石头的腌菜缸。晒的东西下雨、天黑就收进去（c.dry）。
 *             （洛阳不产茶：北宋的茶是南方来的团饼，不在院里晒，所以春天晒的是笋干。）
 *   村里   —— 冬天（年下）各家门两边挂一对桃符。
 * 坐标都是世界坐标（季节那几摊不随哪一栋屋转）。
 */
import * as THREE from 'three';
import { M, box, cyl, cylUp, lathe, rockGeo, shade, type Builder, type Geo } from '../core/geo';
import { smooth } from '../core/rng';
import type { Season } from '../env/atmos';
import type { RGB } from '../ink/ink';
import { SITE, YARD_Y, houseY } from '../site';
import { INK, SEASONS, VASE, dye, pole, rnd, sbox, tube, v3, wobble, type Ctx, type V3 } from './kit';
import { hallDims } from './hall';
import { trayGeo, ware } from './homes';

type Bin = { push(...gs: Geo[]): void };
const binOf = (b: Builder, mat = 'obj'): Bin => ({ push: (...gs: Geo[]) => { for (const g of gs) b.add(mat, g); } });

export function buildSeasons(c: Ctx, sub?: string[]): void {
  const on = (k: string) => !sub || sub.includes(k);
  if (on('hall')) hallSeasons(c);
  if (on('rack')) dryRack(c);
  if (on('taofu')) taofu(c);
}

// ———————————————————————————— 草堂里 ————————————————————————————
function hallSeasons(c: Ctx): void {
  const H = SITE.hall, I = SITE.inside, dm = hallDims(), fl = dm.fl, zi = dm.D / 2 - dm.wt, R = rnd(9301);
  const ox = H.x, oy = YARD_Y, oz = H.z, seg = (n: number) => (c.low ? Math.max(8, Math.round(n * 0.6)) : n);
  const W = (x: number, y: number, z: number) => v3(ox + x, oy + y, oz + z);

  // —— 条几上的胆瓶（青白瓷，长颈）：瓶常在，枝随季换 ——
  const tx = 0.22 - 0.44, tz = -zi + 0.19, ty = fl + 0.76, vh = 0.27;
  binOf(c.home).push(dye(shade(lathe([[0.001, 0], [0.04, 0], [0.052, 0.018], [0.058, 0.065], [0.048, 0.115], [0.022, 0.165], [0.015, 0.235], [0.02, vh], [0.0135, vh], [0.011, 0.25], [0.001, 0.24]], seg(16)), (_x, y) => 1 - 0.06 * smooth(0.12, 0, y)), [0.86, 0.9, 0.86], 1.1).translate(ox + tx, oy + ty, oz + tz));
  const mouth = W(tx, ty + vh - 0.01, tz);
  /** 一根枝（从瓶口出去）：pts 是相对瓶口的折点；返回各点（世界坐标），好往上点花 */
  const twig = (sb: Builder, pts: Array<[number, number, number]>, r0: number, col: RGB, dens: number): V3[] => {
    const P = pts.map(([x, y, z]) => mouth.clone().add(v3(x, y, z)));
    sb.add('obj', dye(tube(P, (t) => r0 * (1 - 0.65 * t), 5, true), col, dens));
    return P;
  };
  const dab = (s: Season, p: V3, size: number, tile: number, col: RGB, rot = 0) => c.dabs[s].push({ x: p.x, y: p.y, z: p.z, size, tile, nx: 0.2, ny: 0.6, nz: 0.8, r: col[0], g: col[1], b: col[2], rot, sway: 0 });
  const along = (P: V3[], t: number) => { const i = Math.min(P.length - 2, Math.floor(t * (P.length - 1))), f = t * (P.length - 1) - i; return P[i].clone().lerp(P[i + 1], f); };
  // 春：一枝桃，斜出，带两根小枝；花一簇簇贴着枝
  {
    const sb = c.season.spring, BR: RGB = [0.62, 0.52, 0.47];
    const main = twig(sb, [[0, 0, 0], [0.04, 0.16, 0.01], [0.13, 0.3, 0.03], [0.24, 0.4, 0.02], [0.33, 0.45, 0.04]], 0.007, BR, 2);
    const s1 = twig(sb, [[0.08, 0.25, 0.02], [0.03, 0.38, 0.05], [0.0, 0.47, 0.03]], 0.004, BR, 2);
    const s2 = twig(sb, [[0.2, 0.37, 0.02], [0.27, 0.33, 0.08], [0.33, 0.31, 0.1]], 0.0035, BR, 2);
    for (const [P, n] of [[main, 7], [s1, 4], [s2, 3]] as Array<[V3[], number]>) for (let i = 0; i < n; i++) dab('spring', along(P, 0.25 + 0.75 * (i + R.r(0.2, 0.8)) / n).add(v3(R.pm(0.02), R.pm(0.015), 0.012)), R.r(0.07, 0.1), VASE.peach, [0.99, 0.8, 0.85], R.pm(0.6));
  }
  // 夏：荷，一朵开着、一枝苞、一张小叶，梗是青的
  {
    const sb = c.season.summer, G: RGB = [0.66, 0.76, 0.6];
    const f = twig(sb, [[0, 0, 0], [0.02, 0.2, 0.0], [0.05, 0.42, 0.02]], 0.0045, G, 1.3);
    const bud = twig(sb, [[0, 0, 0], [-0.03, 0.18, 0.01], [-0.07, 0.33, 0.0]], 0.004, G, 1.3);
    const lf = twig(sb, [[0, 0, 0], [0.05, 0.1, 0.02], [0.12, 0.17, 0.04]], 0.004, G, 1.3);
    dab('summer', f[f.length - 1].clone().add(v3(0, 0.05, 0.01)), 0.17, VASE.lotus, [1, 0.74, 0.8]);
    dab('summer', bud[bud.length - 1].clone().add(v3(0, 0.04, 0.01)), 0.11, VASE.lotusBud, [1, 0.72, 0.78]);
    // 叶：一张略卷的圆叶（面）
    const L = lf[lf.length - 1], pts: V3[][] = [];
    for (let i = 0; i <= 6; i++) { pts.push([]); for (let j = 0; j <= 4; j++) { const a = (i / 6) * Math.PI * 2, r = (j / 4) * 0.075; pts[i].push(v3(L.x + Math.cos(a) * r, L.y + 0.015 * (j / 4) * (j / 4) + 0.01 * Math.sin(a * 2), L.z + Math.sin(a) * r * 0.8)); } }
    const lg = new THREE.BufferGeometry();
    const pos: number[] = [], nor: number[] = [], uv: number[] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      const q = [pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j], pts[i + 1][j + 1], pts[i][j + 1]];
      for (const p of q) { pos.push(p.x, p.y, p.z); nor.push(0, 1, 0); uv.push(p.x * 4, p.z * 4); }
    }
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); lg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
    sb.add('obj', dye(lg, [0.62, 0.74, 0.58], 1.3));
  }
  // 秋：几茎菊，花黄白相间，叶子几片
  {
    const sb = c.season.autumn, G: RGB = [0.64, 0.72, 0.56];
    const tips: Array<[V3, RGB]> = [];
    for (const [i, [x, y, z]] of ([[0.1, 0.36, 0.03], [-0.08, 0.32, 0.04], [0.02, 0.42, -0.01], [0.15, 0.27, 0.06]] as Array<[number, number, number]>).entries()) {
      const P = twig(sb, [[0, 0, 0], [x * 0.4, y * 0.5, z * 0.3], [x, y, z]], 0.0035, G, 1.3);
      tips.push([P[P.length - 1], i % 2 ? [1, 0.98, 0.92] : [1, 0.88, 0.5]]);
      // 叶：两头尖的一小片（压扁的菱形），斜着出
      for (let k = 0; k < 2; k++) { const p = along(P, 0.4 + 0.3 * k), a = R.r(0, 6.28); sb.add('obj', dye(lathe([[0.001, -0.032], [0.013, -0.008], [0.009, 0.014], [0.001, 0.03]], 4).scale(1, 1, 0.25).applyMatrix4(M.mul(M.t(p.x + Math.cos(a) * 0.025, p.y, p.z + Math.sin(a) * 0.025), M.ry(-a), M.rz(1.0))), G, 1.4)); }
    }
    for (const [p, col] of tips) dab('autumn', p.clone().add(v3(0, 0.02, 0.01)), R.r(0.08, 0.1), R() < 0.6 ? VASE.mum : VASE.mumSide, col, R.pm(0.5));
  }
  // 冬：一枝红梅，干是铁色的、折几折；花疏疏地贴枝
  {
    const sb = c.season.winter, BR: RGB = [0.5, 0.45, 0.42];
    const main = twig(sb, [[0, 0, 0], [-0.03, 0.14, 0.01], [0.06, 0.24, 0.02], [0.02, 0.36, 0.03], [0.12, 0.44, 0.02]], 0.0075, BR, 2.3);
    const s1 = twig(sb, [[0.05, 0.22, 0.02], [0.17, 0.25, 0.05], [0.26, 0.24, 0.06]], 0.004, BR, 2.3);
    const s2 = twig(sb, [[0.02, 0.35, 0.03], [-0.07, 0.41, 0.05], [-0.1, 0.48, 0.04]], 0.0035, BR, 2.3);
    for (const [P, n] of [[main, 6], [s1, 3], [s2, 3]] as Array<[V3[], number]>) for (let i = 0; i < n; i++) dab('winter', along(P, 0.3 + 0.7 * (i + R.r(0.2, 0.8)) / n).add(v3(R.pm(0.015), R.pm(0.012), 0.012)), R.r(0.05, 0.07), VASE.plum, [0.97, 0.56, 0.58], R.pm(0.8));
  }

  // —— 西间榻前的矮火盆架：冬天架上是火盆，别的季节是一盆石菖蒲 ——
  const fx = -1.75, fz = -0.78, fh = 0.22;
  {
    const b = c.home;
    b.add('wood', wobble(box(0.46, 0.035, 0.46, 'x').translate(ox + fx, oy + fl + fh, oz + fz), 0.003, 2, 9310, 40, 0.5));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', box(0.04, fh - 0.02, 0.04).translate(ox + fx + sx * 0.2, oy + fl + (fh - 0.02) / 2, oz + fz + sz * 0.2));
    for (const sz of [-1, 1]) b.add('wood', box(0.42, 0.03, 0.025).translate(ox + fx, oy + fl + 0.06, oz + fz + sz * 0.2));
    c.solid({ id: '草堂·火盆架', kind: 'disc', x: ox + fx, z: oz + fz, r: 0.3, top: oy + fl + fh + 0.02 });
  }
  const top = oy + fl + fh + 0.018;
  for (const s of SEASONS) {
    const sb = c.season[s], obj = binOf(sb);
    if (s === 'winter') {
      // 火盆：一只铜盆，盆里一堆炭，几块是红的；一双火箸斜插着
      obj.push(dye(shade(lathe([[0.001, 0], [0.11, 0], [0.15, 0.02], [0.19, 0.09], [0.205, 0.1], [0.195, 0.105], [0.18, 0.09], [0.14, 0.025], [0.001, 0.022]], seg(16)), (x, _y, z, nx, _ny, nz) => (nx * x + nz * z < 0 ? 0.6 : 1)), [0.66, 0.58, 0.5], 1.9).translate(ox + fx, top, oz + fz));
      for (let i = 0; i < (c.low ? 10 : 16); i++) {
        const a = R.r(0, 6.283), d = Math.sqrt(R()) * 0.13, hot = R() < 0.42;
        sb.add('ember', dye(rockGeo(9320 + i, R.r(0.02, 0.032), R.r(0.016, 0.025), R.r(0.02, 0.032), 0), hot ? [0.98, 0.62, 0.45] : [0.44, 0.41, 0.39], hot ? 0.95 : 1.6).translate(ox + fx + Math.cos(a) * d, top + 0.03 + (0.13 - d) * 0.22, oz + fz + Math.sin(a) * d));
      }
      for (const e of [-1, 1]) obj.push(dye(pole(v3(ox + fx + 0.1, top + 0.05, oz + fz + e * 0.012), v3(ox + fx + 0.26, top + 0.22, oz + fz + 0.06 + e * 0.012), 0.004, 0.003, 4), INK.iron, 2.2));
    } else {
      // 石菖蒲：一只浅盆，盆里几块小石，菖蒲一丛
      obj.push(dye(shade(lathe([[0.001, 0], [0.09, 0], [0.11, 0.01], [0.13, 0.06], [0.122, 0.063], [0.1, 0.02], [0.001, 0.018]], seg(14)), (x, _y, z, nx, _ny, nz) => (nx * x + nz * z < 0 ? 0.6 : 1)), [0.72, 0.76, 0.74], 1.5).translate(ox + fx, top, oz + fz));
      for (let i = 0; i < 4; i++) obj.push(dye(rockGeo(9330 + i, R.r(0.025, 0.04), R.r(0.02, 0.035), R.r(0.025, 0.04), 0), INK.slate, 1.3).translate(ox + fx + R.pm(0.07), top + 0.03, oz + fz + R.pm(0.07)));
      for (let i = 0; i < 9; i++) { const a = R.r(0, 6.283), l = R.r(0.12, 0.2), p0 = v3(ox + fx + R.pm(0.03), top + 0.04, oz + fz + R.pm(0.03)); obj.push(dye(tube([p0, p0.clone().add(v3(Math.cos(a) * l * 0.25, l * 0.6, Math.sin(a) * l * 0.25)), p0.clone().add(v3(Math.cos(a) * l * 0.55, l * 0.95, Math.sin(a) * l * 0.55))], (t) => 0.004 * (1 - 0.7 * t), 3, true), [0.62, 0.76, 0.58], 1.4)); }
    }
  }

  // —— 榻上的被、席：春秋叠着一床被；夏天一领竹席、一个竹夫人、一把蒲扇；冬天被摊开，再叠一床 ——
  const kx = I.couch.x, kw = 1.8, kd = 0.68, kz = -zi + kd / 2 + 0.02, kh = fl + 0.42;
  const folded = (sb: Builder, x: number, y: number, z: number, ry: number, k = 1) => binOf(sb).push(dye(wobble(sbox(0.46, 0.11 * k, 0.36, 0.09), 0.016, 4, 9340 + Math.round(y * 100), 55), INK.indigo, 1.25).applyMatrix4(M.mul(M.t(ox + x, oy + y, oz + z), M.ry(ry))));
  for (const s of ['spring', 'autumn'] as Season[]) folded(c.season[s], kx + kw / 2 - 0.3, kh + 0.06, kz + 0.1, -0.04);
  {
    const sb = c.season.summer, obj = binOf(sb);
    // 竹席：一领细篾席（篾纹顺着榻的长向）
    obj.push(dye(shade(wobble(box(1.66, 0.012, 0.62, 'x').translate(ox + kx, oy + kh + 0.012, oz + kz), 0.002, 3, 9350, 0), (x) => 0.93 + 0.07 * Math.sin(x * 160)), INK.bamboo, 1.15));
    for (let i = 0; i < 2; i++) obj.push(dye(box(1.66, 0.014, 0.012).translate(ox + kx, oy + kh + 0.013, oz + kz + (i ? 0.3 : -0.3)), INK.bamboo, 2));
    // 竹夫人：竹篾编的一个空心长笼，抱着凉快
    const fr: V3[] = [];
    obj.push(dye(shade(lathe([[0.001, -0.42], [0.05, -0.41], [0.085, -0.34], [0.095, 0], [0.085, 0.34], [0.05, 0.41], [0.001, 0.42]], seg(12)), (x, y) => 0.86 + 0.14 * Math.sin(y * 60 + x * 30)), [0.88, 0.85, 0.72], 1.15).rotateZ(Math.PI / 2).translate(ox + kx + 0.12, oy + kh + 0.11, oz + kz - 0.2));
    void fr;
    // 蒲扇
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.bezierCurveTo(0.12, 0.02, 0.17, 0.16, 0.12, 0.27); sh.bezierCurveTo(0.08, 0.33, -0.08, 0.33, -0.12, 0.27); sh.bezierCurveTo(-0.17, 0.16, -0.12, 0.02, 0, 0);
    const fx0 = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2), fan = fx0.index ? fx0.toNonIndexed() : fx0;
    fan.clearGroups();
    fan.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fan.attributes.position.count * 3).fill(1), 3));
    obj.push(dye(fan, INK.hemp, 1.1).applyMatrix4(M.mul(M.t(ox + kx + 0.55, oy + kh + 0.03, oz + kz + 0.12), M.ry(2.0))));
    obj.push(dye(pole(v3(ox + kx + 0.55, oy + kh + 0.034, oz + kz + 0.12), v3(ox + kx + 0.55 + Math.sin(2.0) * 0.15, oy + kh + 0.034, oz + kz + 0.12 + Math.cos(2.0) * 0.15), 0.007, 0.006, 5), INK.bamboo, 1.4));
  }
  {
    const sb = c.season.winter;
    // 摊开的被（软软的，边垂下来一点）、叠着的一床
    const pts: V3[][] = [];
    for (let i = 0; i <= 8; i++) { pts.push([]); for (let j = 0; j <= 5; j++) { const u = i / 8, v = j / 5, x = kx - 0.15 + (u - 0.5) * 1.3, z = kz + (v - 0.5) * 0.78, edge = Math.max(0, Math.abs(v - 0.5) * 2 - 0.78) / 0.22; pts[i].push(v3(ox + x, oy + kh + 0.05 + 0.025 * Math.sin(u * 7 + v * 3) - 0.12 * edge * edge, oz + z)); } }
    const qg = new THREE.BufferGeometry(), pos: number[] = [], uv: number[] = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) for (const [a, bb] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) { const p = pts[a][bb]; pos.push(p.x, p.y, p.z); uv.push(a * 0.16, bb * 0.16); }
    qg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); qg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); qg.computeVertexNormals();
    qg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
    binOf(sb).push(dye(qg, [0.7, 0.72, 0.8], 1.3));
    folded(sb, kx + kw / 2 - 0.3, kh + 0.08, kz + 0.1, 0.02, 1.25);
  }
}

// ———————————————————————————— 院里的晒架 ————————————————————————————
function dryRack(c: Ctx): void {
  const R = rnd(9401), Y = YARD_Y, cx = 6.55, cz = 1.15, len = 2.5, hh = 0.82, b = c.home;
  const seg = (n: number) => (c.low ? Math.max(8, Math.round(n * 0.6)) : n);
  // 两副竹马（交叉的腿）、两根横竿
  for (const x of [cx - len / 2 + 0.15, cx + len / 2 - 0.15]) for (const s of [-1, 1]) b.add('bamboo', pole(v3(x + s * 0.02, Y - 0.02, cz + s * 0.42), v3(x, Y + hh + 0.12, cz - s * 0.08), 0.02, 0.016, 5));
  for (const dz of [-0.2, 0.2]) b.add('bamboo', pole(v3(cx - len / 2 - 0.15, Y + hh + Math.abs(dz) * 0.15, cz + dz), v3(cx + len / 2 + 0.15, Y + hh + 0.01 + Math.abs(dz) * 0.15, cz + dz), 0.018, 0.016, 5, 2));
  c.solid({ id: '晒架', kind: 'rect', x: cx, z: cz, w: len + 0.3, d: 0.95 });
  c.anchor('dryRack', cx, Y + hh, cz + 0.6, 0);
  const ty = Y + hh + 0.035, trays = [cx - 0.8, cx, cx + 0.8];
  const tray = (D: Bin, x: number, tilt: number) => D.push(trayGeo(0.36, seg(14)).applyMatrix4(M.mul(M.t(x, ty, cz), M.rx(tilt))));
  const scatter = (D: Bin, x: number, n: number, mk: (i: number) => Geo) => { for (let i = 0; i < n; i++) { const a = R.r(0, 6.283), d = Math.sqrt(R()) * 0.3; D.push(mk(i).applyMatrix4(M.mul(M.t(x + Math.cos(a) * d, ty + 0.015, cz + Math.sin(a) * d), M.ry(R.r(0, 3.14))))); } };
  const n = (k: number) => Math.round(k * (c.low ? 0.5 : 1));
  // 春：笋干（切成片的笋，浅黄白）
  { const D = binOf(c.dry.spring); for (const [i, x] of trays.entries()) { tray(D, x, 0.03 * (i - 1)); scatter(D, x, n(26), () => dye(box(R.r(0.05, 0.08), 0.008, R.r(0.025, 0.04)), [0.96, 0.92, 0.78], R.r(1.0, 1.3))); } }
  // 夏：晒书——竿上搭一块板，书一册册摊开（书页朝天）；板头压着两卷画
  {
    const D = binOf(c.dry.summer);
    D.push(dye(wobble(box(len + 0.1, 0.03, 0.62, 'x').translate(cx, Y + hh + 0.05, cz), 0.003, 2, 9410, 40, 0.5), INK.wood, 1.5));
    for (let i = 0; i < (c.low ? 5 : 8); i++) {
      const x = cx - len / 2 + 0.25 + (i % 4) * 0.62 + R.pm(0.04), z = cz + (i < 4 ? -0.15 : 0.16) + R.pm(0.03), ry = R.pm(0.25);
      for (const s of [-1, 1]) D.push(dye(box(0.16, 0.012, 0.25).applyMatrix4(M.mul(M.t(x, Y + hh + 0.072, z), M.ry(ry), M.t(s * 0.083, 0.004, 0), M.rz(-s * 0.08))), INK.page, R.r(0.8, 1.0)));
      D.push(dye(box(0.34, 0.004, 0.26).applyMatrix4(M.mul(M.t(x, Y + hh + 0.066, z), M.ry(ry))), R() < 0.5 ? INK.indigo : [0.8, 0.74, 0.62], 1.4));
    }
    for (const s of [-1, 1]) D.push(dye(cyl(0.028, 0.028, 0.5, 8).rotateX(Math.PI / 2).translate(cx + s * (len / 2 + 0.02), Y + hh + 0.095, cz), INK.page, 1.1));
  }
  // 秋：柿饼（压扁的、赭红带霜）、菊花（一朵朵黄的花头）
  {
    const D = binOf(c.dry.autumn);
    tray(D, trays[0], -0.03); tray(D, trays[1], 0); tray(D, trays[2], 0.03);
    for (const x of [trays[0], trays[1]]) scatter(D, x, n(11), () => dye(shade(lathe([[0.001, 0], [0.04, 0], [0.045, 0.012], [0.035, 0.022], [0.001, 0.026]], 8), (_x, y) => (y > 0.018 ? 1.25 : 1)), [0.92, 0.6, 0.42], 1.15));
    scatter(D, trays[2], n(34), () => dye(wobble(lathe([[0.001, 0], [0.018, 0.004], [0.02, 0.012], [0.001, 0.018]], 6), 0.003, 40, 9420, 0), R() < 0.7 ? [1, 0.86, 0.45] : [1, 0.96, 0.88], 1.0));
  }
  // 冬：萝卜干（白条）、竿上搭着几棵晾蔫了的白菜；架脚一口腌菜缸，盖上压着石头（这口缸下雨也在，放在季节里）
  {
    const D = binOf(c.dry.winter);
    for (const x of [trays[0], trays[1]]) { tray(D, x, 0); scatter(D, x, n(24), () => dye(box(R.r(0.08, 0.13), 0.01, 0.014), [0.96, 0.94, 0.88], R.r(0.9, 1.15))); }
    for (let i = 0; i < 4; i++) {
      const x = trays[2] - 0.3 + i * 0.2, side = i % 2 ? 1 : -1, g = wobble(lathe([[0.001, 0], [0.06, 0.04], [0.08, 0.16], [0.07, 0.28], [0.04, 0.34], [0.001, 0.36]], 8), 0.012, 9, 9430 + i, 0);
      D.push(dye(shade(g, (_x, y) => (y > 0.22 ? 0.82 : 1.08)), [0.86, 0.9, 0.76], 1.2).applyMatrix4(M.mul(M.t(x, Y + hh + 0.02, cz + side * 0.2), M.rx(side * 1.9))));
    }
    const sb = binOf(c.season.winter);
    sb.push(ware('vat', [0.68, 0.64, 0.6], 1.7, seg(16), 0.9).translate(cx + len / 2 + 0.55, Y, cz + 0.15));
    sb.push(dye(cylUp(0.31, 0.31, 0.03, seg(14)), INK.wood, 1.6).translate(cx + len / 2 + 0.55, Y + 0.64, cz + 0.15));
    sb.push(dye(rockGeo(9440, 0.16, 0.11, 0.14, 1), INK.slate, 1.2).translate(cx + len / 2 + 0.55, Y + 0.67, cz + 0.15));
  }
}

// ———————————————————————————— 年下的桃符 ————————————————————————————
/** 各家门的位置（与 village.ts / homes.ts 里各户的门对得上）：门心在屋前墙的 x、门宽 */
const DOORS: Record<string, { x: number; w: number }> = { a: { x: 0, w: 1.0 }, b: { x: -0.9, w: 0.95 }, d: { x: 0.8, w: 0.95 }, e: { x: -0.7, w: 0.95 }, f: { x: 0, w: 0.95 }, g: { x: 0, w: 1.0 } };
function taofu(c: Ctx): void {
  const obj = binOf(c.season.winter, 'obj');
  for (const h of SITE.houses) {
    const dr = DOORS[h.id];
    if (!dr) continue;
    const y0 = houseY(h.id), m = M.trs(h.x, y0, h.z, h.yaw), z = h.d / 2 + 0.012;
    for (const s of [-1, 1]) {
      const x = dr.x + s * (dr.w / 2 + 0.2);
      obj.push(dye(wobble(box(0.13, 0.62, 0.014), 0.002, 6, 9500 + Math.round(h.x + s), 0), [0.92, 0.82, 0.76], 1.15).translate(x, 0.12 + 1.12, z).applyMatrix4(m));
      // 板上画的神荼、郁垒：远看是几笔深色
      for (let k = 0; k < 3; k++) obj.push(dye(box(0.05 - 0.01 * k, 0.1 + 0.04 * (k % 2), 0.002), [0.5, 0.42, 0.4], 1.4).translate(x, 0.12 + 1.3 - k * 0.15, z + 0.009).applyMatrix4(m));
    }
  }
}
