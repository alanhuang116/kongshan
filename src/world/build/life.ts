/**
 * 过日子的零碎——看得出这里住着人：
 *   邻家各户门边一盏纸灯笼（白天素着，夜里随灯火亮）；甲家竹竿上晾着衣裳、墙上靠一架梯、门边一把扫帚；
 *   乙家檐下挂着一竿葫芦、蒜辫、柿饼，门前一架纺车，门边一双草鞋；丁家门前一架蚕匾、墙根一排腌菜坛、地上一辆孩子的小木车；
 *   草堂门边靠着一把油纸伞、一根藜杖，檐下一只燕窝；石桌上一盘没下完的棋；松下一条矮凳；晾竿旁一匾晒着的草药。
 * （檐下挂的不用玉米、辣椒——那是后来才传进来的东西。）
 */
import * as THREE from 'three';
import { M, box, cyl, grid, lathe, rockGeo, tint, type Builder, type Geo } from '../core/geo';
import { SITE, YARD_Y, houseY } from '../site';
import { INK, blankUV, decal, dye, facing, pole, rnd, sbox, tube, v3, wobble, type Ctx, type V3 } from './kit';
import { hallDims } from './hall';
import { bench, goStones, lantern } from './more';

type Bin = { push(...gs: Geo[]): void };
type RGB3 = [number, number, number];

/** 晾着的一件衣裳：竹竿从两只袖子里穿过去，身子垂着。挂点在原点（竿在 y=0，沿 x） */
function robe(obj: Bin, m: THREE.Matrix4, pig: RGB3, dn: number, seed: number, len = 0.95): void {
  obj.push(dye(wobble(sbox(1.25, 0.2, 0.035, 0.2).translate(0, -0.1, 0), 0.012, 3, seed, 50), pig, dn).applyMatrix4(m));
  const pts: V3[][] = [];
  for (let i = 0; i <= 4; i++) { pts.push([]); for (let j = 0; j <= 5; j++) { const u = (i / 4 - 0.5) * 0.56 * (1 + 0.12 * (j / 5)), v = j / 5; pts[i].push(v3(u, -0.16 - v * len, 0.02 * Math.sin(u * 9 + seed + v * 3) * v)); } }
  obj.push(dye(facing(grid(pts, (i, j) => [i * 0.14, j * 0.2]), () => [0, 0, 1]), pig, dn * 1.04).applyMatrix4(m));
}

export function buildLife(c: Ctx): void {
  const R = rnd(4500);
  const hs = (id: string) => SITE.houses.find((h) => h.id === id)!;
  const bin = (b: Builder): Bin => ({ push: (...gs: Geo[]) => { for (const g of gs) b.add('obj', g); } });
  const WP = (h: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] => [h.x + lx * Math.cos(h.yaw) + lz * Math.sin(h.yaw), h.z - lx * Math.sin(h.yaw) + lz * Math.cos(h.yaw)];
  const jarG = (r: number, h: number, seg = 12) => lathe([[0.001, 0], [r * 0.55, 0], [r, h * 0.35], [r * 0.95, h * 0.7], [r * 0.6, h * 0.92], [r * 0.66, h], [0.001, h]], seg);

  // ———————————— 甲 ————————————
  {
    const h = hs('a'), b = c.village, obj = bin(b), z0 = h.d / 2;
    b.push(M.trs(h.x, houseY('a'), h.z, h.yaw));
    lantern(b, obj, M.t(0.78, 2.0, z0 - 0.02));
    // 晾衣：两根带杈的竿子架一根竹竿
    const ax = -3.9, az = z0 + 2.3, bx = -1.3, bz = z0 + 2.6, hh = 1.72, ry = Math.atan2(-(bz - az), bx - ax);
    for (const [x, z] of [[ax, az], [bx, bz]]) { b.add('wood', pole(v3(x, -0.2, z), v3(x, hh + 0.04, z), 0.03, 0.022, 6)); for (const e of [-1, 1]) b.add('wood', pole(v3(x, hh, z), v3(x + e * 0.08, hh + 0.16, z), 0.016, 0.012, 5)); }
    b.add('bamboo', pole(v3(ax - 0.3, hh + 0.07, az - 0.03), v3(bx + 0.3, hh + 0.08, bz + 0.03), 0.02, 0.016, 6, 3));
    robe(obj, M.mul(M.t(ax + 0.75, hh + 0.05, az + 0.09), M.ry(ry)), INK.indigo, 1.5, 3);
    robe(obj, M.mul(M.t(ax + 1.95, hh + 0.055, az + 0.22), M.ry(ry)), [0.94, 0.92, 0.86], 0.8, 5, 0.7);
    // 梯子：靠在东窗边的墙上
    for (const s of [-1, 1]) b.add('wood', pole(v3(3.7 + s * 0.2, 0, z0 + 0.85), v3(3.7 + s * 0.17, 2.45, z0 + 0.06), 0.025, 0.022, 5));
    for (let i = 1; i <= 7; i++) { const t = i / 8; b.add('wood', pole(v3(3.5 + 0.004 * i, 2.45 * t, z0 + 0.85 - 0.79 * t), v3(3.9 - 0.004 * i, 2.45 * t, z0 + 0.85 - 0.79 * t), 0.014, 0.014, 4)); }
    // 扫帚：靠在门边
    obj.push(dye(pole(v3(-0.82, 0.3, z0 + 0.4), v3(-0.86, 1.5, z0 + 0.05), 0.012, 0.011, 5), INK.bamboo, 1.4));
    for (let i = 0; i < 9; i++) obj.push(dye(pole(v3(-0.82, 0.32, z0 + 0.4), v3(-0.82 + (i - 4) * 0.04, 0.02, z0 + 0.5 + 0.02 * Math.sin(i)), 0.006, 0.003, 3), INK.bamboo, 1.7));
    b.pop();
    { const [x, z] = WP(h, (ax + bx) / 2, (az + bz) / 2); c.solid({ id: '甲·晾衣竿', kind: 'rect', x, z, w: 3.2, d: 0.2, yaw: h.yaw + ry }); }
    { const [x, z] = WP(h, 3.7, z0 + 0.5); c.solid({ id: '甲·梯子', kind: 'rect', x, z, w: 0.5, d: 0.9, yaw: h.yaw }); }
  }

  // ———————————— 乙 ————————————
  {
    const h = hs('b'), b = c.village, obj = bin(b), z0 = h.d / 2;
    b.push(M.trs(h.x, houseY('b'), h.z, h.yaw));
    lantern(b, obj, M.t(-0.2, 2.0, z0 - 0.02));
    // 檐下一根竹竿，挂着葫芦、蒜辫、柿饼串
    const py = 1.96, pz = z0 + 0.42;
    b.add('bamboo', pole(v3(0.4, py, pz), v3(3.3, py + 0.02, pz), 0.016, 0.014, 5, 2));
    for (const x of [0.5, 3.2]) obj.push(dye(pole(v3(x, py, pz), v3(x, py + 0.3, pz - 0.2), 0.004, 0.004, 3), INK.hemp, 1.6));
    for (const [i, x] of [0.75, 1.02, 2.5, 2.78].entries()) {
      const s = 0.85 + 0.25 * R();
      obj.push(dye(lathe([[0.001, -0.3], [0.05, -0.29], [0.075, -0.24], [0.06, -0.185], [0.03, -0.16], [0.045, -0.12], [0.035, -0.085], [0.012, -0.065], [0.008, -0.03], [0.001, -0.028]], 9).scale(s, s, s), INK.gourd, 1.2 + 0.2 * (i % 2)).translate(x, py - 0.02, pz));
    }
    for (const x of [1.35, 1.55]) for (let k = 0; k < 6; k++) obj.push(dye(rockGeo(460 + k, 0.03, 0.03, 0.03, 0), INK.white, 0.9).translate(x + (k % 2 ? 0.02 : -0.02), py - 0.08 - k * 0.055, pz));
    for (const x of [1.9, 2.08, 2.26]) for (let k = 0; k < 6; k++) obj.push(dye(cyl(0.03, 0.03, 0.022, 7), [0.9, 0.62, 0.42], 1.2).translate(x, py - 0.07 - k * 0.05, pz));
    // 纺车：一只大轮、一个矮架、一根锭子
    {
      const m = M.mul(M.t(1.25, 0, z0 + 1.25), M.ry(0.5)), wr = 0.36;
      for (const s of [-1, 1]) b.add('wood', box(0.05, 0.05, 1.0, 'z').translate(s * 0.16, 0.06, 0.1).applyMatrix4(m));
      for (const z of [-0.3, 0.5]) b.add('wood', box(0.42, 0.04, 0.05, 'x').translate(0, 0.06, z).applyMatrix4(m));
      for (const s of [-1, 1]) b.add('wood', pole(v3(s * 0.14, 0.06, -0.12), v3(s * 0.12, 0.55, -0.12), 0.022, 0.02, 5).applyMatrix4(m));
      const rim: V3[] = [];
      for (let i = 0; i <= 14; i++) rim.push(v3(0, 0.5 + Math.cos((i / 14) * 6.2832) * wr, -0.12 + Math.sin((i / 14) * 6.2832) * wr));
      b.add('wood', tube(rim, 0.012, 4).applyMatrix4(m));
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; b.add('wood', pole(v3(0, 0.5 - Math.cos(a) * wr, -0.12 - Math.sin(a) * wr), v3(0, 0.5 + Math.cos(a) * wr, -0.12 + Math.sin(a) * wr), 0.009, 0.009, 4).applyMatrix4(m)); }
      b.add('wood', pole(v3(-0.1, 0.06, 0.52), v3(-0.1, 0.34, 0.52), 0.02, 0.018, 5).applyMatrix4(m));
      obj.push(dye(pole(v3(-0.2, 0.32, 0.52), v3(0.1, 0.32, 0.52), 0.006, 0.004, 4), INK.iron, 2).applyMatrix4(m));
      obj.push(dye(lathe([[0.001, 0], [0.03, 0.02], [0.04, 0.08], [0.001, 0.15]], 7).rotateZ(Math.PI / 2), INK.white, 0.9).translate(0.04, 0.32, 0.52).applyMatrix4(m));
    }
    // 门边一双草鞋
    for (const s of [-1, 1]) b.add('thatch', tint(wobble(sbox(0.1, 0.02, 0.25, 0.1).translate(-1.65 + s * 0.07, 0.14, z0 + 0.36 + s * 0.03), 0.01, 8, 470 + s, 50), 0.95, 0.93, 0.86));
    b.pop();
    { const [x, z] = WP(h, 1.25, z0 + 1.25); c.solid({ id: '乙·纺车', kind: 'disc', x, z, r: 0.6 }); }
  }

  // ———————————— 丁 ————————————
  {
    const h = hs('d'), b = c.village, obj = bin(b), z0 = h.d / 2;
    b.push(M.trs(h.x, houseY('d'), h.z, h.yaw));
    lantern(b, obj, M.t(1.58, 2.0, z0 - 0.02));
    // 蚕匾架：四根立柱、五层横档，层层搁着圆匾（匾里是桑叶）
    {
      const cx = 3.0, cz = z0 + 1.5;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('bamboo', pole(v3(cx + sx * 0.5, -0.05, cz + sz * 0.42), v3(cx + sx * 0.48, 1.85, cz + sz * 0.4), 0.022, 0.018, 5));
      for (let k = 0; k < 5; k++) {
        const y = 0.3 + k * 0.33;
        for (const sz of [-1, 1]) b.add('bamboo', pole(v3(cx - 0.56, y, cz + sz * 0.41), v3(cx + 0.56, y, cz + sz * 0.41), 0.012, 0.012, 4));
        obj.push(dye(lathe([[0.001, 0], [0.44, 0], [0.47, 0.04], [0.455, 0.04], [0.43, 0.012], [0.001, 0.012]], 12), INK.bamboo, 1.5).translate(cx + R.pm(0.03), y + 0.014, cz));
        obj.push(dye(cyl(0.41, 0.41, 0.006, 12), k % 2 ? [0.84, 0.88, 0.72] : [0.8, 0.86, 0.68], 1.3).translate(cx, y + 0.03, cz));
      }
    }
    // 墙根一排腌菜坛（大小不一，都盖着）
    for (const [i, x] of [-3.0, -2.55, -2.14, -1.72].entries()) {
      const r = 0.17 + 0.04 * ((i * 3) % 2), hh = 0.36 + 0.08 * (i % 2);
      obj.push(dye(jarG(r, hh), i % 2 ? INK.glaze : [0.7, 0.66, 0.62], 1.7).translate(x, 0.12, z0 + 0.34));
      obj.push(dye(lathe([[r * 0.7, hh], [r * 0.5, hh + 0.04], [0.03, hh + 0.05], [0.03, hh + 0.08], [0.001, hh + 0.085]], 9), INK.clay, 1.5).translate(x, 0.12, z0 + 0.34));
    }
    // 孩子的小木车：一只带四个轮的小木匣，拖着一根绳
    {
      const m = M.mul(M.t(0.1, 0.12, z0 + 2.2), M.ry(0.7));
      b.add('wood', box(0.3, 0.1, 0.18, 'x').translate(0, 0.09, 0).applyMatrix4(m));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', cyl(0.045, 0.045, 0.025, 8).rotateX(Math.PI / 2).translate(sx * 0.1, 0.045, sz * 0.105).applyMatrix4(m));
      obj.push(dye(tube([v3(0.15, 0.09, 0), v3(0.35, 0.03, 0.05), v3(0.6, 0.01, -0.04)], 0.004, 3), INK.hemp, 1.5).applyMatrix4(m));
    }
    b.pop();
    { const [x, z] = WP(h, 3.0, z0 + 1.5); c.solid({ id: '丁·蚕匾架', kind: 'rect', x, z, w: 1.15, d: 0.95, yaw: h.yaw }); }
    { const [x, z] = WP(h, -2.36, z0 + 0.34); c.solid({ id: '丁·腌菜坛', kind: 'rect', x, z, w: 1.7, d: 0.45, yaw: h.yaw }); }
  }

  // ———————————— 村塾：墙边一把扫帚 ————————————
  {
    const h = hs('school'), b = c.village, obj = bin(b), x0 = h.w / 2, z0 = h.d / 2;
    b.push(M.trs(h.x, houseY('school'), h.z, h.yaw));
    obj.push(dye(pole(v3(-x0 + 0.5, 0.42, z0 + 0.42), v3(-x0 + 0.55, 1.6, z0 + 0.06), 0.012, 0.011, 5), INK.bamboo, 1.4));
    for (let i = 0; i < 9; i++) obj.push(dye(pole(v3(-x0 + 0.5, 0.44, z0 + 0.42), v3(-x0 + 0.5 + (i - 4) * 0.04, 0.16, z0 + 0.52), 0.006, 0.003, 3), INK.bamboo, 1.7));
    b.pop();
  }

  // ———————————— 草堂这边 ————————————
  {
    const H = SITE.hall, dm = hallDims(), b = c.home, obj = bin(b), Y = YARD_Y, zw = H.z + dm.D / 2, fy = Y + dm.fl - 0.02;
    // 油纸伞（收着，伞尖朝下靠在墙上）、藜杖
    {
      const foot = v3(H.x + 1.18, fy + 0.01, zw + 0.3), top = v3(H.x + 1.12, fy + 0.98, zw + 0.04), d = top.clone().sub(foot).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d), mm = new THREE.Matrix4().compose(foot, q, new THREE.Vector3(1, 1, 1));
      obj.push(dye(lathe([[0.001, 0], [0.012, 0.01], [0.03, 0.2], [0.048, 0.56], [0.04, 0.66], [0.016, 0.7], [0.001, 0.7]], 10), [0.9, 0.78, 0.5], 1.45).applyMatrix4(mm));
      obj.push(dye(cyl(0.011, 0.012, 0.3, 6).translate(0, 0.84, 0), INK.bamboo, 1.5).applyMatrix4(mm));
      obj.push(dye(tube([v3(H.x + 1.42, fy, zw + 0.34), v3(H.x + 1.45, fy + 0.5, zw + 0.2), v3(H.x + 1.4, fy + 1.0, zw + 0.1), v3(H.x + 1.43, fy + 1.3, zw + 0.03), v3(H.x + 1.47, fy + 1.36, zw + 0.02)], (t) => 0.016 - 0.004 * t + (t > 0.93 ? 0.008 : 0), 5, true), INK.wood, 1.8));
    }
    // 檐下的燕窝：门东边墙头上一团泥
    c.front.push(M.t(H.x, Y, H.z));
    c.front.add('earth', tint(rockGeo(480, 0.12, 0.085, 0.09, 1), 0.72, 0.7, 0.68).translate(2.35, dm.top - 0.3, dm.D / 2 + 0.05));
    c.front.pop();
    // 石桌上一盘没下完的棋：木棋盘、两只棋罐、十几粒子
    {
      const T = SITE.table, ty = Y + 0.72, ry = 0.5, m = M.mul(M.t(T.x, ty, T.z), M.ry(ry));
      b.add('label', blankUV(dye(box(0.46, 0.03, 0.46), INK.wood, 1.25), c.blank).translate(0, 0.015, 0).applyMatrix4(m));
      b.add('label', dye(decal(0.44, 0.44, c.rect('go')), INK.wood, 1.0).translate(0, 0.0312, 0).applyMatrix4(m));
      goStones(obj, M.mul(m, M.t(0, 0.0325, 0)), 0.44, 15, 482);
      for (const [s, pg] of [[-1, INK.ink], [1, INK.white]] as Array<[number, RGB3]>) {
        obj.push(dye(lathe([[0.001, 0], [0.035, 0], [0.06, 0.03], [0.055, 0.065], [0.04, 0.07], [0.001, 0.06]], 10), INK.darkwood, 1.8).applyMatrix4(M.mul(m, M.t(s * 0.33, 0, s * 0.18))));
        obj.push(dye(cyl(0.036, 0.036, 0.008, 8), pg, s < 0 ? 3 : 0.5).applyMatrix4(M.mul(m, M.t(s * 0.33, 0.066, s * 0.18))));
      }
      const a = c.anchor('go', T.x, ty + 0.032, T.z, ry);
      a.userData = { size: 0.44 };
    }
    // 松下一条矮凳（两株松之间，朝着石桌）
    {
      const p0 = SITE.pines[0], p1 = SITE.pines[1], bx = (p0.x + p1.x) / 2 + 0.05, bz = (p0.z + p1.z) / 2;
      for (const g of bench(1.5, 0.4, 0.26, 483)) b.add('wood', g.applyMatrix4(M.mul(M.t(bx, Y, bz), M.ry(Math.PI / 2 + 0.06))));
      c.solid({ id: '松下矮凳', kind: 'rect', x: bx, z: bz, w: 0.3, d: 1.5, top: Y + 0.4 });
      c.anchor('pineBench', bx, Y + 0.4, bz, -Math.PI / 2);
    }
    // 晾竿旁一匾晒着的草药：三根竹竿撑的矮架上一只大圆匾
    {
      const hx = -6.9, hz = 6.05, hy = Y + 0.62;
      for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.4; b.add('bamboo', pole(v3(hx + Math.cos(a) * 0.36, Y - 0.03, hz + Math.sin(a) * 0.36), v3(hx - Math.cos(a) * 0.1, hy + 0.02, hz - Math.sin(a) * 0.1), 0.016, 0.013, 5)); }
      obj.push(dye(lathe([[0.001, 0], [0.4, 0], [0.44, 0.05], [0.425, 0.05], [0.39, 0.012], [0.001, 0.012]], 14), INK.bamboo, 1.5).translate(hx, hy, hz));
      obj.push(dye(wobble(lathe([[0.36, 0.014], [0.2, 0.05], [0.001, 0.06]], 10), 0.015, 5, 484, 0), [0.8, 0.84, 0.68], 1.25).translate(hx, hy, hz));
      c.solid({ id: '晒药的匾', kind: 'disc', x: hx, z: hz, r: 0.48 });
      c.anchor('herbs', hx, hy + 0.05, hz, 0);
    }
  }
}
