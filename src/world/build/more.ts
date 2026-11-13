/**
 * 村里村外的人情物事（位置都在总图的 SITE.more）：
 *   茶亭（路边一间小草亭，瓮里是给过路人自取的茶）、洗衣埠、水碓（轮子转、碓头起落）、晒场、牛棚、
 *   酒家门口的酒旗与桌凳、秋千、槐下的棋、鸭栏、柴门外草棚下先生出门坐的小车、菜畦角上的瓜棚、四个草垛、渡口的晒网架。
 * 都是小东西：手做的、放在人真会放的地方。
 */
import * as THREE from 'three';
import { M, box, boxUp, cyl, grid, lathe, shade, tint, type Builder, type Geo } from '../core/geo';
import { wash } from '../ink/ink';
import { RIVER_Y, SITE, ground, houseY, pathDist, streamAt } from '../site';
import { INK, decal, dye, facing, flatRock, pole, renormal, rnd, sbox, tube, v3, wobble, type Ctx, type V3 } from './kit';
import { earthWall, post } from './hall';
import { bucketGeo } from './yard';
import { thatchRoof } from './thatch';
import { buildLife } from './life';

type Bin = { push(...gs: Geo[]): void };
const at = (g: Geo, x: number, y: number, z: number, ry = 0) => g.applyMatrix4(M.mul(M.t(x, y, z), M.ry(ry)));
const ring = (r: number, y: number, n = 12): V3[] => { const o: V3[] = []; for (let i = 0; i <= n; i++) o.push(v3(Math.cos((i / n) * 6.2832) * r, y, Math.sin((i / n) * 6.2832) * r)); return o; };

/** 草垛：圆圆的一垛，上面一个尖顶，当中一根杆露着头。底在 y=0。返回 [草, 草, 杆] */
export function haystack(r: number, h: number, seed: number): [Geo, Geo, Geo] {
  const body = lathe([[r * 1.04, -0.1], [r, h * 0.25], [r * 0.9, h * 0.5]], 14);
  const cap = lathe([[r * 1.1, h * 0.44], [r * 0.86, h * 0.6], [r * 0.45, h * 0.82], [r * 0.12, h * 0.98], [0.001, h]], 14);
  return [tint(wobble(body, r * 0.05, 1.3, seed, 0), 0.98, 0.97, 0.93), tint(wobble(cap, r * 0.05, 1.3, seed + 1, 0), 0.92, 0.92, 0.9), pole(v3(0, h * 0.9, 0), v3(0.03, h + 0.34, 0.02), 0.03, 0.022, 5)];
}
/** 一条板凳：一块板、两副撇腿。沿 x，底在 y=0 */
export function bench(len: number, h: number, w: number, seed: number): Geo[] {
  const gs: Geo[] = [wobble(box(len, 0.04, w, 'x').translate(0, h - 0.02, 0), 0.004, 2, seed, 40, 0.5)];
  for (const s of [-1, 1]) for (const e of [-1, 1]) gs.push(pole(v3(s * (len / 2 - 0.12) + s * 0.05, 0, e * (w / 2 + 0.03)), v3(s * (len / 2 - 0.16), h - 0.03, e * (w / 2 - 0.06)), 0.022, 0.02, 5));
  for (const s of [-1, 1]) gs.push(box(0.03, 0.03, w + 0.02, 'z').translate(s * (len / 2 - 0.14), h * 0.42, 0));
  return gs;
}
/** 碌碡：一只带棱的石磙（沿 x 横着），套一副木框。底在 y=0。返回 [石, 木…] */
export function roller(seed: number): [Geo, Geo[]] {
  const st = renormal(wobble(cyl(0.27, 0.25, 0.74, 12).rotateZ(Math.PI / 2), 0.012, 4, seed, 0), 50).translate(0, 0.27, 0);
  const wd: Geo[] = [];
  for (const s of [-1, 1]) wd.push(pole(v3(-0.46, 0.28, s * 0.36), v3(0.46, 0.28, s * 0.36), 0.022, 0.022, 4));
  for (const s of [-1, 1]) wd.push(pole(v3(s * 0.46, 0.28, -0.4), v3(s * 0.46, 0.28, 0.4), 0.022, 0.022, 4));
  wd.push(pole(v3(0, 0.28, 0.36), v3(0.1, 0.05, 1.3), 0.02, 0.018, 4));
  return [st, wd];
}
/** 一盏纸灯笼（挂在门边）：纸罩、上下两个木盖、一根挑竿。原点在挑竿根上（墙面），灯朝 +z 挑出去 */
export function lantern(b: Builder, obj: Bin, m: THREE.Matrix4): void {
  b.add('wood', pole(v3(0, 0, 0), v3(0, 0.08, 0.5), 0.012, 0.01, 5).applyMatrix4(m));
  obj.push(dye(pole(v3(0, 0.08, 0.49), v3(0, -0.14, 0.49), 0.003, 0.003, 3), INK.hemp, 1.5).applyMatrix4(m));
  b.add('paper', lathe([[0.045, -0.42], [0.095, -0.37], [0.11, -0.28], [0.095, -0.19], [0.045, -0.14]], 10).translate(0, 0, 0.49).applyMatrix4(m));
  for (const y of [-0.42, -0.14]) obj.push(dye(cyl(0.05, 0.05, 0.016, 8).translate(0, y, 0.49), INK.darkwood, 2).applyMatrix4(m));
}

export function buildMore(c: Ctx, sub?: string[]): void {
  const on = (k: string) => !sub || sub.includes(k);
  const X = SITE.more, R = rnd(3300);
  const bin = (b: Builder): Bin => ({ push: (...gs: Geo[]) => { for (const g of gs) b.add('obj', g); } });
  const hs = (id: string) => SITE.houses.find((h) => h.id === id)!;
  const WP = (h: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] => [h.x + lx * Math.cos(h.yaw) + lz * Math.sin(h.yaw), h.z - lx * Math.sin(h.yaw) + lz * Math.cos(h.yaw)];
  const seg = (n: number) => (c.low ? Math.max(8, Math.round(n * 0.6)) : n);

  // ———————————— 茶亭：路边四根柱一个小草顶，一条板凳；一只带盖的大茶瓮搁在木架上，几只碗、一把瓢 ————————————
  if (on('teaShed')) {
    const T = X.teaShed, b = c.home, obj = bin(b), w = 2.6, d = 2.2, y0 = ground(T.x, T.z - d / 2 - 0.2);
    b.push(M.trs(T.x, y0, T.z, T.yaw));
    // 垫平的一小块地（南边用几块石头挡着）
    b.add('earth', shade(wobble(sbox(w + 0.5, 0.6, d + 0.5, 0.6).translate(0, -0.3, 0), 0.03, 0.8, 331, 50, 0.15), (_x, _y, _z, _nx, ny) => (ny > 0.7 ? 1.06 : 0.95)));
    for (let i = 0; i < 5; i++) b.add('stone', at(flatRock(332 + i, R.r(0.22, 0.32), 0.3, R.r(0.16, 0.22), 1), -w / 2 + 0.2 + i * 0.62 + R.pm(0.1), -0.34, d / 2 + 0.3, R.pm(0.3)));
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.add('wood', post(sx * (w / 2 - 0.1), sz * (d / 2 - 0.1), -0.05, 2.06, 0.075, 340 + sx + sz * 2));
    for (const sz of [-1, 1]) b.add('wood', pole(v3(-w / 2 - 0.1, 2.06, sz * (d / 2 - 0.1)), v3(w / 2 + 0.1, 2.07, sz * (d / 2 - 0.1)), 0.06, 0.055, 7, 2));
    for (const sx of [-1, 1]) b.add('wood', pole(v3(sx * (w / 2 - 0.1), 2.14, -d / 2 - 0.1), v3(sx * (w / 2 - 0.1), 2.14, d / 2 + 0.1), 0.055, 0.05, 7));
    const th = thatchRoof({ w: w + 1.2, d: d + 1.2, rise: 1.25, hip: 1.25, thick: 0.2, sag: 0.25, lift: 0.08, ridgeSag: 0.05, round: 0.6, droop: 0.13, courses: 2, step: 0.045, rag: 0.07, cell: c.low ? 0.2 : 0.13, seed: 341, roll: 0.11, cross: 0 });
    b.add('thatch', th.thatch.translate(0, 1.98, 0));
    if (th.bamboo) b.add('bamboo', th.bamboo.translate(0, 1.98, 0));
    // 板凳（靠南）、茶瓮（靠东）
    for (const g of bench(1.7, 0.44, 0.26, 342)) b.add('wood', g.translate(-0.25, 0, d / 2 - 0.42));
    const jx = w / 2 - 0.55, jz = -0.25, sh = 0.52;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', boxUp(0.05, sh - 0.04, 0.05, 'y').translate(jx + sx * 0.24, 0, jz + sz * 0.24));
    b.add('wood', wobble(box(0.66, 0.04, 0.66, 'x').translate(jx, sh - 0.02, jz), 0.004, 2, 343));
    const jar = lathe([[0.001, 0], [0.14, 0], [0.24, 0.14], [0.26, 0.3], [0.2, 0.42], [0.15, 0.46], [0.17, 0.48], [0.001, 0.48]], seg(16));
    obj.push(dye(jar, INK.glaze, 1.6).translate(jx - 0.06, sh, jz - 0.05));
    obj.push(dye(lathe([[0.19, 0.48], [0.18, 0.5], [0.05, 0.53], [0.05, 0.56], [0.001, 0.57]], seg(12)), INK.wood, 1.6).translate(jx - 0.06, sh, jz - 0.05));
    for (const [dx, dz] of [[0.24, 0.2], [0.14, 0.26], [0.26, 0.08]]) obj.push(dye(lathe([[0.001, 0], [0.025, 0], [0.055, 0.04], [0.05, 0.04], [0.022, 0.01], [0.001, 0.01]], 10), INK.white, 1.15).translate(jx + dx, sh, jz + dz));
    obj.push(dye(tube([v3(0, 0, 0), v3(0.1, 0.02, 0), v3(0.2, 0.0, 0)], (t) => 0.014 + 0.03 * Math.max(0, t - 0.6), 6, true), INK.gourd, 1.3).applyMatrix4(M.mul(M.t(jx - 0.28, sh + 0.02, jz + 0.22), M.ry(0.8))));
    b.pop();
    const [jwx, jwz] = WP(T, jx - 0.06, jz - 0.05);
    c.anchor('teaJar', jwx, y0 + sh + 0.5, jwz, T.yaw + Math.PI);
    c.solid({ id: '茶亭·台', kind: 'rect', x: T.x, z: T.z, w: w + 0.5, d: d + 0.5, yaw: T.yaw, top: y0, walk: true });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [x, z] = WP(T, sx * (w / 2 - 0.1), sz * (d / 2 - 0.1)); c.solid({ id: '茶亭·柱', kind: 'disc', x, z, r: 0.1 }); }
    { const [x, z] = WP(T, -0.25, d / 2 - 0.42); c.solid({ id: '茶亭·板凳', kind: 'rect', x, z, w: 1.7, d: 0.3, yaw: T.yaw, top: y0 + 0.44 }); c.anchor('teaBench', x, y0 + 0.44, z, T.yaw + Math.PI); }
    c.solid({ id: '茶亭·茶瓮架', kind: 'rect', x: jwx, z: jwz, w: 0.7, d: 0.7, yaw: T.yaw });
  }

  // ———————————— 洗衣埠：北岸三块石板一级级下到水里；一只木盆、一根捣衣杵 ————————————
  if (on('wash')) {
    const Wp = X.wash, b = c.village, obj = bin(b), st = streamAt(Wp.x, Wp.z), wy = st.y;
    // 往溪里找水边
    let ze = Wp.z;
    while (ze < Wp.z + 5 && ground(Wp.x, ze) > wy - 0.02) ze += 0.05;
    const steps: Array<[number, number, number]> = [[ze - 1.5, wy + 0.4, 0.2], [ze - 0.7, wy + 0.2, -0.12], [ze + 0.12, wy + 0.05, 0.1]];
    steps.forEach(([z, top, dx], i) => {
      b.add('stone', tint(at(renormal(wobble(sbox(1.15 + 0.2 * (i % 2), 0.5, 0.82, 0.4).translate(0, -0.25, 0), 0.03, 1.4, 350 + i, 0, 0.4), 42), Wp.x + dx, top, z, R.pm(0.08)), 1.1));
      c.solid({ id: `洗衣埠·石板${i + 1}`, kind: 'rect', x: Wp.x + dx, z, w: 1.2, d: 0.82, top, walk: true });
    });
    const [tz, ty] = [steps[1][0], steps[1][1]];
    for (const g of bucketGeo(0.26, 0.31, 0.2, seg(12))) obj.push(g.translate(Wp.x + 0.55, ty - 0.21 + 0.21, tz - 0.1));
    obj.push(dye(wobble(sbox(0.34, 0.1, 0.3, 0.1).translate(0, 0, 0), 0.03, 6, 355, 50), INK.indigo, 1.1).translate(Wp.x + 0.55, ty + 0.16, tz - 0.1));
    // 捣衣杵：一头粗的木棒，横在石板上
    b.add('wood', pole(v3(Wp.x - 0.45, ty + 0.035, tz + 0.1), v3(Wp.x - 0.05, ty + 0.045, tz - 0.12), 0.018, 0.04, 6));
    obj.push(dye(wobble(sbox(0.3, 0.05, 0.2, 0.1), 0.012, 6, 356, 50), INK.white, 1.1).translate(Wp.x - 0.1, steps[2][1] + 0.03, steps[2][0] - 0.05));
    c.anchor('wash', Wp.x, steps[2][1], steps[2][0] - 0.1, Math.PI);
  }

  // ———————————— 水碓：溪里一架水轮带着一根长轴，轴上的拨板压下碓尾，碓头抬起又落下，舂着石臼里的谷 ————————————
  if (on('mill')) {
    const Mi = X.mill, b = c.village, st = streamAt(Mi.x, Mi.z), wy = st.y, gb = ground(Mi.x, Mi.z);
    // 轴向取溪流的方向（+x 顺流）；+z 朝溪心
    const tl = Math.hypot(st.tx, st.tz) || 1, tx = st.tx / tl, tz = st.tz / tl, toward = streamAt(Mi.x - tz, Mi.z + tx).d < st.d ? 1 : -1;
    const yaw = Math.atan2(-tz, tx), grp = new THREE.Group();
    grp.name = 'mill'; grp.position.set(Mi.x, 0, Mi.z); grp.rotation.y = yaw;
    c.root.add(grp);
    const W = (lx: number, lz: number): [number, number] => [Mi.x + lx * tx - lz * toward * tz * 1, Mi.z + lx * tz + lz * toward * tx];
    const G = (lx: number, lz: number) => { const [x, z] = W(lx, lz); return ground(x, z); };
    const sd = toward, obj = bin(b);
    b.push(M.mul(M.t(Mi.x, 0, Mi.z), M.ry(yaw)));
    let zE = 0;
    while (zE < 4 && G(0, zE) > wy - 0.02) zE += 0.05;
    const ys = wy + 0.84, wr = 1.06, zw = zE + 1.0, zc = -0.6;
    // 碓屋：四根柱，北、西两面土墙，朝溪的一面敞着
    const hx0 = -3.95, hx1 = 0.45, hz0 = -2.15, hz1 = 0.85, hh = 2.05;
    for (const [x, z] of [[hx0, hz0], [hx1, hz0], [hx1, hz1], [hx0, hz1]]) b.add('wood', post(x, z * sd, G(x, z) - 0.1, gb + hh, 0.085, 360 + x + z));
    b.add('earth', earthWall(hx0, hx1, gb - 0.2, gb + hh - 0.1, Math.min(hz0 * sd, (hz0 + 0.3) * sd), Math.max(hz0 * sd, (hz0 + 0.3) * sd), 361, gb + hh - 0.7, gb));
    b.add('earth', earthWall(hx0, hx0 + 0.3, gb - 0.2, gb + hh - 0.1, Math.min((hz0 + 0.3) * sd, hz1 * sd), Math.max((hz0 + 0.3) * sd, hz1 * sd), 362, gb + hh - 0.7, gb));
    const th = thatchRoof({ w: hx1 - hx0 + 1.3, d: hz1 - hz0 + 1.3, rise: 1.5, hip: 1.45, thick: 0.22, sag: 0.25, lift: 0.1, ridgeSag: 0.08, round: 0.6, droop: 0.14, courses: 2, step: 0.05, rag: 0.075, cell: c.low ? 0.24 : 0.15, seed: 363, roll: 0.14 });
    b.add('thatch', th.thatch.translate((hx0 + hx1) / 2, gb + hh - 0.02, ((hz0 + hz1) / 2) * sd));
    if (th.bamboo) b.add('bamboo', th.bamboo.translate((hx0 + hx1) / 2, gb + hh - 0.02, ((hz0 + hz1) / 2) * sd));
    // 石臼、轴承的桩
    const mx = -3.0;
    b.add('stone', renormal(wobble(lathe([[0.3, -0.2], [0.36, 0.26], [0.27, 0.3], [0.2, 0.2], [0.12, 0.1], [0.001, 0.08]], 10), 0.012, 3, 364, 0), 50).translate(mx, gb, zc * sd));
    obj.push(dye(cyl(0.2, 0.2, 0.01, 10).translate(mx, gb + 0.19, zc * sd), [0.95, 0.9, 0.72], 1.1));
    for (const z of [zw + 0.5, -1.25]) for (const e of [-1, 1]) b.add('wood', pole(v3(e * 0.2, G(0, z) - 0.4, z * sd), v3(e * 0.06, ys + 0.16, z * sd), 0.06, 0.05, 6));
    for (const e of [-1, 1]) b.add('wood', post(-1.0, (zc + e * 0.25) * sd, gb - 0.2, ys + 0.3, 0.06, 365 + e, 6));
    // 一袋谷、一只簸箕
    obj.push(dye(wobble(lathe([[0.001, 0], [0.2, 0.02], [0.24, 0.25], [0.16, 0.5], [0.07, 0.56], [0.1, 0.62], [0.001, 0.6]], 9), 0.02, 3, 366, 0), INK.hemp, 1.3).translate(-3.5, gb, -1.5 * sd));
    obj.push(dye(lathe([[0.001, 0], [0.3, 0], [0.34, 0.07], [0.325, 0.07], [0.29, 0.015], [0.001, 0.015]], 12), INK.bamboo, 1.5).translate(-2.2, gb + 0.01, -1.55 * sd));
    b.pop();
    // 水轮连着长轴（可转；原点在轴心上，绕自己的 z 轴转）
    {
      const g: Geo[] = [pole(v3(0, 0, -(zw - zc) - 0.75), v3(0, 0, 0.62), 0.09, 0.085, 8, 3)];
      for (const z of [-0.2, 0.2]) { g.push(tube(ring(wr - 0.06, 0, 16).map((p) => v3(p.x, p.z, z)), 0.04, 5)); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; g.push(pole(v3(-Math.cos(a) * (wr - 0.06), -Math.sin(a) * (wr - 0.06), z), v3(Math.cos(a) * (wr - 0.06), Math.sin(a) * (wr - 0.06), z), 0.026, 0.026, 4)); } }
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.push(tint(box(0.3, 0.03, 0.5, 'z').applyMatrix4(M.mul(M.rz(a), M.t(wr - 0.02, 0, 0))), 0.9)); }
      // 拨板：两片，对着装
      for (const s of [-1, 1]) g.push(box(0.36, 0.08, 0.12, 'x').translate(s * 0.22, 0, -(zw - zc)));
      const wheel = c.part('millWheel', 'wood', g.map((q) => (sd < 0 ? q.rotateY(Math.PI) : q)), v3(0, ys, zw * sd), undefined, grp);
      wheel.userData = { speed: 0.75, axis: 'z' };
      // 碓：一根长木，支在两根矮桩上；碓头朝上游，装一截杵。原点在支点，绕自己的 z 轴转（负角度是抬头）
      const hg: Geo[] = [], py = 0.12, slope = Math.atan2(gb + 0.82 - (ys + py), 2.0);
      const bm = M.rz(-slope);
      hg.push(wobble(box(2.85, 0.15, 0.13, 'x').translate(-0.62, 0, 0), 0.006, 2, 367, 40).applyMatrix4(bm));
      hg.push(cyl(0.035, 0.035, 0.56, 6).rotateX(Math.PI / 2));
      hg.push(cyl(0.075, 0.085, 0.62, 8).translate(-2.0, -0.36, 0).applyMatrix4(bm));
      hg.push(tint(cyl(0.09, 0.09, 0.07, 8).translate(-2.0, -0.66, 0).applyMatrix4(bm), 0.6));
      const ham = c.part('millHammer', 'wood', hg, v3(-1.0, ys + py, zc * sd), undefined, grp);
      ham.userData = { thump: false, lift: 0 };
      let was = 0;
      c.tick.push((_dt, t) => {
        const a = t * (wheel.userData.speed as number);
        wheel.rotation.z = a;
        // 半圈一个来回：前一大半慢慢压下碓尾（碓头抬起），一松手，碓头落下，歇一歇
        const ph = ((a + 0.3) % Math.PI) / Math.PI;
        const k = ph < 0.56 ? (1 - Math.cos((ph / 0.56) * Math.PI)) / 2 : ph < 0.66 ? 1 - Math.pow((ph - 0.56) / 0.1, 2) : 0;
        ham.rotation.z = -0.25 * k;
        ham.userData.lift = k;
        ham.userData.thump = was > 0.001 && k <= 0.001;
        was = k;
      });
    }
    // 站在碓屋敞着的一边、石臼下游一步远的地方，面朝石臼（上游）
    const [ax, az] = W(mx + 1.0, 0.25);
    c.anchor('mill', ax, G(mx + 1.0, 0.25), az, Math.atan2(tx, tz));
    { const [x, z] = W((hx0 + hx1) / 2, (hz0 + hz1) / 2); c.solid({ id: '碓房', kind: 'rect', x, z, w: hx1 - hx0, d: hz1 - hz0, yaw }); }
    { const [x, z] = W(0, zw); c.solid({ id: '水碓·水轮', kind: 'rect', x, z, w: 2.3, d: 0.8, yaw }); }
  }

  // ———————————— 晒场：碌碡、两领晒着谷的席、木耙、簸箕、一条板凳 ————————————
  if (on('dryYard')) {
    const D = X.dryYard, b = c.village, obj = bin(b), y = ground(D.x, D.z);
    const [st, wd] = roller(371);
    b.add('stone', at(st, D.x + 2.4, y, D.z - 1.6, 0.6));
    for (const g of wd) b.add('wood', at(g, D.x + 2.4, y, D.z - 1.6, 0.6));
    for (const [i, [dx, dz, ry]] of ([[-1.6, 0.3, 0.12], [1.3, 1.9, -0.2]] as Array<[number, number, number]>).entries()) {
      b.add('thatch', tint(at(box(2.7, 0.016, 1.7, 'z'), D.x + dx, y + 0.012, D.z + dz, ry), 1.0, 0.99, 0.94));
      obj.push(dye(at(wobble(sbox(2.4, 0.02, 1.4, 0.35), 0.03, 1.2, 372 + i, 0, 0.15), D.x + dx, y + 0.03, D.z + dz, ry), [0.95, 0.88, 0.62], 1.15));
    }
    // 木耙：一根长柄、一排齿，搭在席边
    b.add('wood', pole(v3(D.x - 0.2, y + 0.05, D.z - 0.9), v3(D.x + 1.5, y + 0.07, D.z - 1.9), 0.018, 0.016, 5));
    b.add('wood', at(box(0.56, 0.035, 0.035, 'x'), D.x - 0.2, y + 0.05, D.z - 0.9, 1.05));
    // 簸箕：前口敞着的一只扁筐
    obj.push(dye(shade(lathe([[0.001, 0], [0.3, 0.0], [0.36, 0.1], [0.345, 0.1], [0.29, 0.015], [0.001, 0.015]], 12, 0, Math.PI * 1.3), () => 1), INK.bamboo, 1.5).applyMatrix4(M.mul(M.t(D.x - 3.4, y + 0.01, D.z + 1.9), M.ry(0.7))));
    for (const g of bench(1.6, 0.42, 0.24, 374)) b.add('wood', at(g, D.x + 0.4, y, D.z - 4.3, 0.1));
    c.anchor('dryYard', D.x, y, D.z, 0);
    c.anchor('dryBench', D.x + 0.4, y + 0.42, D.z - 4.3, 0.1);
    c.solid({ id: '晒场·碌碡', kind: 'disc', x: D.x + 2.4, z: D.z - 1.6, r: 0.6 });
    c.solid({ id: '晒场·板凳', kind: 'rect', x: D.x + 0.4, z: D.z - 4.3, w: 1.6, d: 0.3, yaw: 0.1, top: y + 0.42 });
    c.solid({ id: '晒场·晒席（平铺，别踩）', kind: 'rect', x: D.x - 1.6, z: D.z + 0.3, w: 2.7, d: 1.7, yaw: 0.12, top: y + 0.03 });
    c.solid({ id: '晒场·晒席（平铺，别踩）', kind: 'rect', x: D.x + 1.3, z: D.z + 1.9, w: 2.7, d: 1.7, yaw: -0.2, top: y + 0.03 });
  }

  // ———————————— 牛棚：三根柱、一面坡的草顶，后面一道矮土墙；一条食槽、一堆草 ————————————
  if (on('oxShed')) {
    const O = X.oxShed, b = c.village, y = ground(O.x, O.z);
    b.push(M.trs(O.x, y, O.z, O.yaw));
    for (const x of [-1.6, 0, 1.6]) b.add('wood', post(x, 1.15, -0.1, 2.0, 0.075, 380 + x));
    b.add('wood', pole(v3(-1.85, 2.0, 1.15), v3(1.85, 2.01, 1.15), 0.06, 0.055, 7, 2));
    b.add('earth', earthWall(-1.8, 1.8, -0.2, 1.3, -1.35, -1.05, 381, 0.9, 0));
    const lt = thatchRoof({ lean: true, w: 4.2, d: 3.1, rise: 0.85, hip: 0, thick: 0.18, sag: 0.08, droop: 0.06, courses: 2, step: 0.045, rag: 0.075, cell: 0.15, seed: 382, roll: 0, tone: 0.95 });
    b.add('thatch', lt.thatch.applyMatrix4(M.mul(M.t(0, 1.4, 1.5), M.ry(Math.PI))));
    for (const x of [-1.5, -0.5, 0.5, 1.5]) b.add('wood', pole(v3(x, 2.05, 1.3), v3(x, 1.36, -1.3), 0.035, 0.03, 5));
    // 食槽、草堆、拴牛的桩
    b.add('wood', wobble(box(1.7, 0.26, 0.4, 'x').translate(-0.5, 0.42, -0.72), 0.008, 2, 383));
    b.add('dark', box(1.5, 0.02, 0.26).translate(-0.5, 0.555, -0.72));
    for (const s of [-1, 1]) b.add('wood', boxUp(0.1, 0.3, 0.36).translate(-0.5 + s * 0.65, 0, -0.72));
    b.add('thatch', tint(wobble(lathe([[0.7, -0.05], [0.55, 0.25], [0.3, 0.48], [0.001, 0.56]], 9), 0.06, 2, 384, 0), 1.03, 1.02, 0.96).translate(1.2, 0, -0.5));
    b.add('wood', post(0.9, 0.4, -0.2, 0.75, 0.05, 385, 6));
    b.pop();
    c.solid({ id: '牛棚', kind: 'rect', x: O.x, z: O.z, w: 3.9, d: 2.9, yaw: O.yaw });
    c.anchor('oxShed', ...((): [number, number, number, number] => { const [x, z] = WP(O, 0.3, 2.1); return [x, y, z, O.yaw]; })());
  }

  // ———————————— 酒家（村里第五户）：一竿酒旗、门口一张桌两条凳、门边封着的酒坛 ————————————
  if (on('wineShop')) {
    const h = hs(X.wineShop.house), y = houseY(h.id), b = c.village, obj = bin(b), Bq = X.wineShop.bench, ty = ground(Bq.x, Bq.z), T = 0.72;
    // 桌、凳（顺着屋的朝向摆）
    b.push(M.trs(Bq.x, ty, Bq.z, h.yaw));
    b.add('wood', wobble(box(1.0, 0.04, 0.64, 'x').translate(0, T - 0.02, 0), 0.005, 2, 391, 40, 0.5));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', boxUp(0.055, T - 0.04, 0.055, 'y').translate(sx * 0.41, 0, sz * 0.24));
    for (const sx of [-1, 1]) b.add('wood', box(0.03, 0.035, 0.46, 'z').translate(sx * 0.41, 0.2, 0));
    for (const sz of [-1, 1]) for (const g of bench(1.0, 0.42, 0.22, 392 + sz)) b.add('wood', g.translate(0, 0, sz * 0.62));
    // 一把酒注、两只碗
    obj.push(dye(lathe([[0.001, 0], [0.04, 0], [0.06, 0.05], [0.055, 0.1], [0.025, 0.14], [0.03, 0.17], [0.001, 0.17]], 10), INK.white, 1.25).translate(0.1, T, 0.05));
    obj.push(dye(tube([v3(0.15, T + 0.07, 0.05), v3(0.2, T + 0.11, 0.05), v3(0.215, T + 0.15, 0.05)], 0.008, 4), INK.white, 1.25));
    for (const [dx, dz] of [[-0.2, 0.12], [-0.12, -0.14]]) obj.push(dye(lathe([[0.001, 0], [0.025, 0], [0.055, 0.035], [0.05, 0.035], [0.022, 0.01], [0.001, 0.01]], 10), INK.white, 1.15).translate(dx, T, dz));
    b.pop();
    c.anchor('wineTable', Bq.x, ty + T, Bq.z, h.yaw);
    c.solid({ id: '酒家·桌凳', kind: 'rect', x: Bq.x, z: Bq.z, w: 1.1, d: 1.6, yaw: h.yaw, top: ty + T });
    // 门边三只封着口的酒坛（两只在下、一只在上）
    b.push(M.trs(h.x, y, h.z, h.yaw));
    const jar = () => { const g = lathe([[0.001, 0], [0.11, 0], [0.2, 0.14], [0.21, 0.3], [0.14, 0.42], [0.1, 0.45], [0.12, 0.5], [0.001, 0.52]], seg(14)); return dye(shade(g, (_x, yy) => (yy > 0.43 ? 1.5 : 1)), INK.glaze, 1.7); };
    for (const [dx, dy, dz] of [[-2.0, 0.12, h.d / 2 + 0.36], [-2.46, 0.12, h.d / 2 + 0.4], [-2.22, 0.56, h.d / 2 + 0.38]]) obj.push(jar().translate(dx, dy, dz));
    for (const [dx, dy, dz] of [[-2.0, 0.12, h.d / 2 + 0.36], [-2.46, 0.12, h.d / 2 + 0.4], [-2.22, 0.56, h.d / 2 + 0.38]]) obj.push(dye(cyl(0.125, 0.13, 0.05, 10), [0.9, 0.62, 0.56], 1.2).translate(dx, dy + 0.5, dz));
    lantern(b, obj, M.mul(M.t(0.15, 2.0, h.d / 2 - 0.02)));
    b.pop();
    { const [x, z] = WP(h, -2.2, h.d / 2 + 0.4); c.solid({ id: '酒家·酒坛', kind: 'disc', x, z, r: 0.5 }); }
    // 酒旗：路边一根高竹竿，挑一面素布，上写一个「酒」字，随风轻摆
    const [px, pz] = WP(h, 3.3, h.d / 2 + 4.6), py = ground(px, pz), ph = 4.0;
    b.add('bamboo', pole(v3(px, py - 0.5, pz), v3(px + 0.05, py + ph, pz), 0.035, 0.022, 6, 4));
    b.add('bamboo', pole(v3(px - 0.05, py + ph - 0.25, pz), v3(px + 0.62, py + ph - 0.18, pz), 0.014, 0.012, 5));
    {
      const fw = 0.46, fh = 1.15, nx = 4, ny = 9, r = c.rect('jiu'), bl = c.blank;
      const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], sw: number[] = [], idx: number[] = [];
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const u = i / nx, v = j / ny;
        pos.push((u - 0.5) * fw, -v * fh, 0.012 * Math.sin(u * 5 + v * 3) * v); nor.push(0, 0, 1);
        // 字只占旗的上面一大半；下面留素
        const tv = v / 0.62;
        if (tv <= 1) uv.push(r[0] + u * (r[2] - r[0]), r[3] + tv * (r[1] - r[3])); else uv.push(bl[0], bl[1]);
        col.push(0.93, 0.92, 0.86); sw.push(v * v * 0.9 + v * 0.1);
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('sway', new THREE.Float32BufferAttribute(sw, 1)); g.setIndex(idx);
      const mat = wash({ pig: [1, 1, 1], dens: 1, shade: 1.2, grain: 2, map: c.mats.label.uniforms.map.value as THREE.Texture, side: THREE.DoubleSide, sway: 1.3, body: 0.5 });
      const flag = new THREE.Mesh(g, mat);
      flag.name = 'part:wineFlag';
      flag.position.set(px + 0.3, py + ph - 0.24, pz); flag.rotation.y = h.yaw;
      c.root.add(flag); c.parts.wineFlag = flag;
    }
    c.solid({ id: '酒家·酒旗竿', kind: 'disc', x: px, z: pz, r: 0.08 });
    c.anchor('wineFlag', px, py + ph - 0.8, pz, h.yaw);
  }

  // ———————————— 秋千：村塾前两根柱一道梁，两根绳吊一块板 ————————————
  if (on('swing')) {
    const S = X.swing, b = c.village, y = ground(S.x, S.z), H = 2.75, ry = 0.3, m = M.trs(S.x, y, S.z, ry);
    b.push(m);
    for (const s of [-1, 1]) {
      b.add('wood', renormal(wobble(pole(v3(s * 0.95, -0.4, 0), v3(s * 0.9, H + 0.12, 0), 0.085, 0.07, 8, 4), 0.008, 1.4, 400 + s, 0), 60));
      for (const e of [-1, 1]) b.add('wood', pole(v3(s * 0.95, -0.1, e * 0.85), v3(s * 0.92, H * 0.62, e * 0.04), 0.04, 0.035, 6));
    }
    b.add('wood', pole(v3(-1.18, H, 0), v3(1.2, H + 0.02, 0), 0.065, 0.06, 8, 2));
    b.pop();
    const sg: Geo[] = [], L = 2.2;
    for (const s of [-1, 1]) sg.push(tint(pole(v3(s * 0.26, -0.06, 0), v3(s * 0.28, -L, 0), 0.011, 0.011, 4), 1.25));
    sg.push(wobble(box(0.68, 0.035, 0.2, 'x').translate(0, -L - 0.01, 0), 0.004, 2, 402, 40, 0.5));
    const p = v3(0, H, 0).applyMatrix4(m), seat = c.part('swingSeat', 'wood', sg, p, new THREE.Euler(0, ry, 0, 'YXZ'));
    seat.userData = { len: L, axis: 'x' };
    c.anchor('swing', p.x, y + H - L, p.z, ry);
    for (const s of [-1, 1]) { const q = v3(s * 0.95, 0, 0).applyMatrix4(m); c.solid({ id: '秋千·柱', kind: 'rect', x: q.x, z: q.z, w: 0.2, d: 1.8, yaw: ry }); }
  }

  // ———————————— 槐下的棋：一方矮石桌（面上刻着纵横十九道），两罐子、几粒子，两只石墩 ————————————
  if (on('chess')) {
    const Cq = X.chess, b = c.village, obj = bin(b), y = ground(Cq.x, Cq.z), th = 0.4, ry = 0.25;
    b.add('stone', tint(at(flatRock(410, 0.42, th, 0.4, 2, 0.84), Cq.x, y - 0.02, Cq.z, ry), 1.1));
    b.add('label', dye(decal(0.46, 0.46, c.rect('go')), INK.slate, 0.55).applyMatrix4(M.mul(M.t(Cq.x, y + th + 0.02, Cq.z), M.ry(ry))));
    goStones(obj, M.mul(M.t(Cq.x, y + th + 0.022, Cq.z), M.ry(ry)), 0.46, 16, 411);
    for (const [s, pg] of [[-1, INK.ink], [1, INK.white]] as Array<[number, [number, number, number]]>) {
      obj.push(dye(lathe([[0.001, 0], [0.035, 0], [0.06, 0.03], [0.055, 0.065], [0.04, 0.07], [0.001, 0.06]], 10), INK.wood, 1.6).applyMatrix4(M.mul(M.t(Cq.x, y + th, Cq.z), M.ry(ry), M.t(s * 0.31, 0, s * 0.2))));
      obj.push(dye(cyl(0.036, 0.036, 0.008, 8), pg, s < 0 ? 3 : 0.5).applyMatrix4(M.mul(M.t(Cq.x, y + th + 0.066, Cq.z), M.ry(ry), M.t(s * 0.31, 0, s * 0.2))));
    }
    for (const s of [-1, 1]) {
      const x = Cq.x + s * 0.78 * Math.sin(ry), z = Cq.z + s * 0.78 * Math.cos(ry), g0 = ground(x, z);
      b.add('stone', at(flatRock(412 + s, 0.19, 0.32, 0.18), x, g0 - 0.02, z, R() * 6));
      c.solid({ id: '棋·石墩', kind: 'disc', x, z, r: 0.2, top: g0 + 0.3 });
      if (s > 0) c.anchor('chessSeat', x, g0 + 0.3, z, ry + Math.PI);
    }
    c.solid({ id: '棋·石桌', kind: 'disc', x: Cq.x, z: Cq.z, r: 0.42, top: y + th });
    c.anchor('chess', Cq.x, y + th, Cq.z, ry);
  }

  // ———————————— 鸭栏：溪边一圈矮矮的荆条栏，一头探进水里；栏里一只草盖的小窝 ————————————
  if (on('duckPen')) {
    const Dk = X.duckPen, b = c.village, n = 14, rx = 1.5, rz = 1.2;
    const P = (i: number): [number, number] => { const a = (i / n) * Math.PI * 2; return [Dk.x + Math.cos(a) * rx * (1 + 0.06 * Math.sin(a * 3)), Dk.z + 0.6 + Math.sin(a) * rz]; };
    for (let i = 0; i < n; i++) {
      const [x0, z0] = P(i), [x1, z1] = P(i + 1), g0 = ground(x0, z0), g1 = ground(x1, z1);
      b.add('wood', post(x0, z0, g0 - 0.25, g0 + 0.62 + R.pm(0.05), 0.028, 420 + i, 5));
      // 朝水的一边留一个口
      if (i === 3) continue;
      const len = Math.hypot(x1 - x0, z1 - z0), g = sbox(len, 0.42, 0.035, 0.3, 'x');
      wobble(g, 0.015, 2.4, 421 + i, 0, 1);
      b.add('thatch', tint(g, 0.8, 0.77, 0.72).applyMatrix4(M.mul(M.t((x0 + x1) / 2, (g0 + g1) / 2 + 0.28, (z0 + z1) / 2), M.ry(Math.atan2(-(z1 - z0), x1 - x0)), M.rz(Math.atan2(g1 - g0, len)))));
    }
    const nx = Dk.x - 0.5, nz = Dk.z - 0.25, ng = ground(nx, nz);
    b.add('wood', wobble(box(0.9, 0.34, 0.6, 'x').translate(nx, ng + 0.17, nz), 0.006, 2, 425));
    b.add('dark', box(0.3, 0.24, 0.02).translate(nx + 0.1, ng + 0.13, nz + 0.305));
    const lt = thatchRoof({ lean: true, w: 1.2, d: 0.9, rise: 0.2, hip: 0, thick: 0.09, sag: 0, droop: 0.03, courses: 1, rag: 0.05, cell: 0.14, seed: 426, roll: 0 });
    b.add('thatch', lt.thatch.translate(nx, ng + 0.42, nz - 0.4));
    c.solid({ id: '鸭栏', kind: 'disc', x: Dk.x, z: Dk.z + 0.6, r: 1.55 });
    c.anchor('duckPen', Dk.x, ground(Dk.x, Dk.z - 0.9), Dk.z - 0.9, Math.PI);
  }

  // ———————————— 小车：先生出门坐的那辆（两轮、一个座、一顶矮篷，两根辕搭在地上），停在柴门外的草棚下 ————————————
  if (on('cart')) {
    const Cr = X.cart, b = c.home, pw = 3.0, pd = 2.5, top = ground(Cr.x, Cr.z - pd / 2 + 0.1);
    b.push(M.t(Cr.x, top, Cr.z));
    // 垫平的一小块台地（坡下一边用石头挡着）
    b.add('earth', shade(wobble(sbox(pw, 1.0, pd, 0.6).translate(0, -0.5, 0), 0.03, 0.8, 431, 50, 0.1), (_x, _y, _z, _nx, ny) => (ny > 0.7 ? 1.06 : 0.95)));
    for (let i = 0; i < 6; i++) b.add('stone', at(flatRock(432 + i, R.r(0.22, 0.32), 0.45, R.r(0.16, 0.22), 1), -pw / 2 + 0.25 + i * 0.52 + R.pm(0.08), -0.5, pd / 2 + 0.06, R.pm(0.3)));
    // 草棚：四根细柱，一面坡，朝东（朝路）敞着，西边低
    for (const [x, z, hh] of [[1.25, -1.05, 2.0], [1.25, 1.05, 2.0], [-1.25, -1.05, 1.45], [-1.25, 1.05, 1.45]]) b.add('wood', post(x, z, -0.1, hh, 0.055, 440 + x + z, 6));
    for (const z of [-1.05, 1.05]) b.add('wood', pole(v3(1.45, 2.03, z), v3(-1.45, 1.44, z), 0.04, 0.036, 6));
    const lt = thatchRoof({ lean: true, w: 2.8, d: 3.2, rise: 0.72, hip: 0, thick: 0.15, sag: 0.06, droop: 0.05, courses: 2, step: 0.04, rag: 0.065, cell: 0.13, seed: 441, roll: 0, tone: 0.96 });
    b.add('thatch', lt.thatch.applyMatrix4(M.mul(M.t(1.6, 1.46, 0), M.ry(-Math.PI / 2))));
    // 车：轴南北向，辕朝东伸出去、梢搭在地上
    const wr = 0.44, tilt = 0.2, cm = M.mul(M.t(-0.25, wr, 0), M.rz(-tilt));
    for (const s of [-1, 1]) {
      const rim = ring(wr - 0.03, 0, 16).map((p) => v3(p.x, p.z, s * 0.48));
      b.add('wood', tube(rim, 0.03, 5).applyMatrix4(M.t(-0.25, wr, 0)));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI; b.add('wood', pole(v3(-Math.cos(a) * (wr - 0.04), -Math.sin(a) * (wr - 0.04), s * 0.48), v3(Math.cos(a) * (wr - 0.04), Math.sin(a) * (wr - 0.04), s * 0.48), 0.014, 0.014, 4).applyMatrix4(M.t(-0.25, wr, 0))); }
      b.add('wood', cyl(0.05, 0.05, 0.12, 7).rotateX(Math.PI / 2).translate(-0.25, wr, s * 0.48));
      // 辕：从座后一直伸到前面，梢着地
      b.add('wood', pole(v3(-0.55, 0.06, s * 0.33), v3(1.95, 0.05, s * 0.3), 0.028, 0.022, 6, 2).applyMatrix4(cm));
      // 篷柱
      for (const x of [-0.42, 0.26]) b.add('bamboo', pole(v3(x, 0.1, s * 0.33), v3(x, 1.2, s * 0.31), 0.013, 0.011, 5).applyMatrix4(cm));
    }
    b.add('wood', pole(v3(-0.25, wr, -0.56), v3(-0.25, wr, 0.56), 0.03, 0.03, 6));
    b.add('wood', pole(v3(1.9, 0.05, -0.36), v3(1.9, 0.05, 0.36), 0.02, 0.02, 5).applyMatrix4(cm));
    // 座：一块板、三面矮围；一只蒲垫
    b.add('wood', wobble(box(0.72, 0.035, 0.66, 'x').translate(-0.08, 0.1, 0), 0.004, 2, 442).applyMatrix4(cm));
    for (const s of [-1, 1]) b.add('wood', box(0.72, 0.26, 0.022, 'x').translate(-0.08, 0.24, s * 0.33).applyMatrix4(cm));
    b.add('wood', box(0.022, 0.4, 0.66, 'z').translate(-0.44, 0.31, 0).applyMatrix4(cm));
    b.add('thatch', tint(lathe([[0.001, 0], [0.2, 0], [0.23, 0.03], [0.2, 0.06], [0.001, 0.065]], 10), 0.97, 0.96, 0.9).translate(-0.1, 0.12, 0).applyMatrix4(cm));
    // 篷：一领略拱的席
    { const pts: V3[][] = []; for (let i = 0; i <= 4; i++) { pts.push([]); for (let k = 0; k <= 6; k++) { const u = k / 6 - 0.5; pts[i].push(v3(-0.52 + (0.9 * i) / 4, 1.2 + 0.1 * Math.cos(u * Math.PI), u * 0.8)); } } b.add('thatch', tint(facing(grid(pts, (i, k) => [i * 0.25, k * 0.14]), () => [0, 1, 0]), 0.93, 0.92, 0.87).applyMatrix4(cm)); b.add('thatch', tint(facing(grid(pts.map((r2) => r2.map((p) => p.clone().setY(p.y - 0.012))), (i, k) => [i * 0.25, k * 0.14]), () => [0, -1, 0]), 0.7).applyMatrix4(cm)); }
    b.pop();
    c.solid({ id: '小车·草棚的台', kind: 'rect', x: Cr.x, z: Cr.z, w: pw, d: pd, top, walk: true });
    c.solid({ id: '小车', kind: 'rect', x: Cr.x + 0.4, z: Cr.z, w: 2.6, d: 1.15 });
    for (const [x, z] of [[1.25, -1.05], [1.25, 1.05], [-1.25, -1.05], [-1.25, 1.05]]) c.solid({ id: '小车·棚柱', kind: 'disc', x: Cr.x + x, z: Cr.z + z, r: 0.07 });
    c.anchor('cart', Cr.x + 1.75, top, Cr.z, Math.PI / 2);
  }

  // ———————————— 瓜棚：菜畦角上一架竹棚（瓜藤另有人种） ————————————
  if (on('trellis')) {
    const T = X.trellis, b = c.home, w = 2.9, d = 2.3, H = 1.95;
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) { const x = T.x + sx * (w / 2 - 0.1), z = T.z + sz * (d / 2 - 0.1), g0 = ground(x, z); b.add('bamboo', pole(v3(x, g0 - 0.2, z), v3(x + R.pm(0.04), g0 + H + R.r(0, 0.12), z + R.pm(0.04)), 0.03, 0.024, 6, 3)); c.solid({ id: '瓜棚·柱', kind: 'disc', x, z, r: 0.05 }); }
    const gy = ground(T.x, T.z) + H;
    for (let i = 0; i < 4; i++) { const z = T.z - d / 2 + 0.05 + (i * (d - 0.1)) / 3; b.add('bamboo', pole(v3(T.x - w / 2 - 0.25, gy + R.pm(0.02), z), v3(T.x + w / 2 + 0.25, gy + R.pm(0.02), z + R.pm(0.04)), 0.02, 0.016, 5, 2)); }
    for (let i = 0; i < 7; i++) { const x = T.x - w / 2 + 0.05 + (i * (w - 0.1)) / 6; b.add('bamboo', pole(v3(x, gy + 0.035, T.z - d / 2 - 0.22), v3(x + R.pm(0.04), gy + 0.035 + R.pm(0.015), T.z + d / 2 + 0.22), 0.015, 0.012, 5)); }
    for (const s of [-1, 1]) b.add('bamboo', pole(v3(T.x + s * (w / 2 - 0.1), ground(T.x, T.z) + 0.3, T.z - d / 2 + 0.1), v3(T.x + s * (w / 2 - 0.1), gy - 0.1, T.z + d / 2 - 0.1), 0.014, 0.012, 5));
    c.anchor('trellis', T.x, ground(T.x, T.z), T.z, 0);
  }

  // ———————————— 草垛四个 ————————————
  if (on('haystacks')) X.haystacks.forEach((p, i) => {
    const b = p.z > 40 || p.x < 20 ? c.far : c.village, y = ground(p.x, p.z), r = 1.25 + 0.15 * (i % 2), [g0, g1, g2] = haystack(r, 2.3 + 0.2 * ((i * 7) % 3), 450 + i);
    b.add('thatch', g0.translate(p.x, y, p.z)); b.add('thatch', g1.translate(p.x, y, p.z)); b.add('wood', g2.translate(p.x, y, p.z));
    c.solid({ id: `草垛${i + 1}`, kind: 'disc', x: p.x, z: p.z, r: r + 0.1 });
  });

  // ———————————— 渡口的晒网架：三根竿、两道横竿，一张渔网搭着晾；脚下几只鱼篓、一串浮子 ————————————
  if (on('netRack')) {
    const N = X.netRack, b = c.far, obj = bin(b), ry = 0.5, m = M.trs(N.x, 0, N.z, ry), H = 2.3;
    const gl = (lx: number) => ground(N.x + lx * Math.cos(ry), N.z - lx * Math.sin(ry));
    b.push(m);
    for (const x of [-2.2, 0, 2.2]) b.add('bamboo', pole(v3(x, gl(x) - 0.4, 0), v3(x + R.pm(0.05), gl(x) + H + R.r(0, 0.15), R.pm(0.05)), 0.035, 0.026, 6, 3));
    const y0 = gl(0) + H;
    b.add('bamboo', pole(v3(-2.5, y0 - 0.05, 0.03), v3(2.5, y0 - 0.02, 0.03), 0.02, 0.016, 5, 3));
    // 网：一根根垂下来的线，再横着几道——中间垂得低
    const sagY = (x: number, k: number) => y0 - 0.06 - k * 1.5 * (0.75 + 0.25 * Math.cos((x / 2.4) * Math.PI));
    for (let x = -2.3; x <= 2.3; x += 0.2) { const pts: V3[] = []; for (let k = 0; k <= 4; k++) pts.push(v3(x + 0.03 * Math.sin(k * 2 + x * 5), sagY(x, k / 4), 0.03 + 0.1 * (k / 4) * Math.sin(x * 2.3))); obj.push(dye(tube(pts, 0.0045, 3), INK.hemp, 1.9)); }
    for (let k = 1; k <= 4; k++) { const pts: V3[] = []; for (let x = -2.3; x <= 2.31; x += 0.46) pts.push(v3(x, sagY(x, k / 4) + 0.01, 0.03 + 0.1 * (k / 4) * Math.sin(x * 2.3))); obj.push(dye(tube(pts, 0.0045, 3), INK.hemp, 1.9)); }
    // 鱼篓（笱）、浮子
    for (const [i, [x, z, r2]] of ([[-1.2, 0.9, 0.3], [-0.6, 1.15, 1.2], [1.5, 0.8, -0.5]] as Array<[number, number, number]>).entries()) obj.push(dye(shade(lathe([[0.001, 0], [0.13, 0.02], [0.17, 0.2], [0.12, 0.42], [0.06, 0.5], [0.08, 0.55], [0.06, 0.55], [0.045, 0.5], [0.001, 0.46]], 9), (_x, yy) => 0.92 + 0.08 * Math.sin(yy * 70)), INK.bamboo, 1.7).applyMatrix4(M.mul(M.t(x, gl(x) + (i === 1 ? 0.16 : 0), z), M.ry(r2), i === 1 ? M.rz(1.45) : M.rz(0))));
    for (let i = 0; i < 6; i++) obj.push(dye(cyl(0.05, 0.05, 0.1, 6).rotateZ(Math.PI / 2), INK.wood, 1.2).translate(0.2 + i * 0.22, gl(0.5) + 0.05, 1.0 + 0.1 * Math.sin(i * 1.7)));
    b.pop();
    c.solid({ id: '晒网架', kind: 'rect', x: N.x, z: N.z, w: 5, d: 0.3, yaw: ry });
    c.anchor('netRack', N.x + Math.sin(ry) * 1.4, ground(N.x, N.z), N.z + Math.cos(ry) * 1.4, ry);
    void RIVER_Y;
  }

  // ———————————— 土地庙：路边齐膝高的一座小石龛（总图给的点压在路心上，这里往路边让开） ————————————
  if (on('shrine')) {
    const S = X.shrine, b = c.village, obj = bin(b);
    // 顺着「离路远」的方向挪到路沿外
    let sx = S.x, sz = S.z;
    { const e = 0.3, gx = pathDist(sx + e, sz) - pathDist(sx - e, sz), gz = pathDist(sx, sz + e) - pathDist(sx, sz - e), gl = Math.hypot(gx, gz) || 1; let n = 0; while (pathDist(sx, sz) < 0.7 && n++ < 40) { sx += (gx / gl) * 0.1 || 0; sz += (gz / gl) * 0.1 || -0.1; } }
    const gy = ground(sx, sz), e = 0.3, fx = pathDist(sx - e, sz) - pathDist(sx + e, sz), fz = pathDist(sx, sz - e) - pathDist(sx, sz + e), ry = Math.atan2(fx, fz);
    b.push(M.trs(sx, gy, sz, ry));
    b.add('stone', renormal(wobble(sbox(0.62, 0.12, 0.52, 0.3).translate(0, 0.04, 0), 0.01, 2, 801, 0, 0.5), 42));
    for (const s of [-1, 1]) b.add('stone', renormal(wobble(sbox(0.09, 0.4, 0.4, 0.2).translate(s * 0.22, 0.3, 0), 0.008, 3, 802 + s, 0), 42));
    b.add('stone', renormal(wobble(sbox(0.5, 0.4, 0.08, 0.2).translate(0, 0.3, -0.17), 0.008, 3, 804, 0), 42));
    b.add('dark', box(0.34, 0.38, 0.02).translate(0, 0.3, -0.12));
    for (const s of [-1, 1]) b.add('stone', tint(renormal(wobble(sbox(0.42, 0.05, 0.62, 0.3), 0.008, 2, 805 + s, 0, 0.5), 42).applyMatrix4(M.mul(M.t(s * 0.17, 0.6, 0), M.rz(-s * 0.5))), 1.08));
    obj.push(dye(box(0.1, 0.22, 0.02).translate(0, 0.23, -0.08), [0.82, 0.62, 0.5], 1.6));
    obj.push(dye(lathe([[0.001, 0], [0.04, 0], [0.055, 0.04], [0.05, 0.05], [0.04, 0.035], [0.001, 0.03]], 8).translate(0, 0.1, 0.16), INK.clay, 1.6));
    b.add('stone', flatRock(807, 0.26, 0.06, 0.16, 1).translate(0, -0.01, 0.42));
    b.pop();
    c.solid({ id: '土地庙', kind: 'rect', x: sx, z: sz, w: 0.8, d: 0.75, yaw: ry, top: gy + 0.75 });
    c.anchor('shrine', sx + Math.sin(ry) * 0.9, gy, sz + Math.cos(ry) * 0.9, ry);
  }
  if (on('life')) buildLife(c);
}

/** 棋盘上摆几粒子（黑白相间，落在交叉点上）。m 把棋盘摆到位，size 是盘面的边长 */
export function goStones(obj: Bin, m: THREE.Matrix4, size: number, n: number, seed: number): void {
  const R = rnd(seed), st = (size * 0.88) / 18, used = new Set<number>();
  for (let i = 0; i < n; i++) {
    let gx = 0, gz = 0;
    do { gx = 2 + R.i(9) + (i % 2 ? 3 : 0); gz = 3 + R.i(11); } while (used.has(gx * 32 + gz));
    used.add(gx * 32 + gz);
    obj.push(dye(lathe([[0.001, 0], [0.008, 0], [0.011, 0.003], [0.006, 0.006], [0.001, 0.0065]], 6), i % 2 ? INK.white : INK.ink, i % 2 ? 0.5 : 3).applyMatrix4(M.mul(m, M.t((gx - 9) * st, 0, (gz - 9) * st))));
  }
}
