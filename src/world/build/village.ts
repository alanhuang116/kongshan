/**
 * 村里：邻家四户（寻常的土墙草屋，各有各的样：三间的、带披屋的、带牲口栏的、朝北开门的），村塾一座（前檐敞着，看得见里面的矮桌与席），
 * 一口井（井字石栏、辘轳、水桶），大槐树下的石凳，路边一座齐膝高的土地庙；各家门前屋后的草垛、鸡埘、独轮车、晒匾、碌碡、矮土墙。
 * 这些屋都不进去：门或关着，或半掩着、里面是黑的。
 */
import * as THREE from 'three';
import { M, box, boxUp, cyl, cylUp, lathe, prism, shade, tint, type Builder, type Geo } from '../core/geo';
import { smooth } from '../core/rng';
import { SITE, ground, houseY } from '../site';
import { INK, blankUV, dye, flatRock, panel, pole, renormal, rnd, sbox, tube, v3, wobble, type Ctx, type Rand, type V3 } from './kit';
import { doorLeaf, earthWall, lattice, post } from './hall';
import { bookStack } from './inside';
import { bucketGeo, fence, wicker } from './yard';
import { thatchRoof } from './thatch';

const at = (g: Geo, x: number, y: number, z: number, ry = 0) => g.applyMatrix4(M.mul(M.t(x, y, z), M.ry(ry)));
/** 收小物件的篮子（往里 push 就是加进当前的摊） */
type Bin = { push(...gs: Geo[]): void };

/** 一道沿 x 的土墙，上面开洞（门、窗）。holes：洞的左右（x）与上下（y） */
function holeWall(xa: number, xb: number, y0: number, y1: number, z0: number, z1: number, holes: Array<{ a: number; b: number; y0: number; y1: number }>, seed: number, sky: number, foot: number, tone = 1): Geo[] {
  const out: Geo[] = [], hs = [...holes].sort((p, q) => p.a - q.a);
  let x = xa;
  hs.forEach((h, i) => {
    if (h.a > x + 0.02) out.push(earthWall(x, h.a, y0, y1, z0, z1, seed + i * 3, sky, foot, tone));
    if (h.y0 > y0 + 0.02) out.push(earthWall(h.a, h.b, y0, h.y0, z0, z1, seed + i * 3 + 1, sky, foot, tone));
    if (h.y1 < y1 - 0.02) out.push(earthWall(h.a, h.b, h.y1, y1, z0, z1, seed + i * 3 + 2, sky, foot, tone));
    x = h.b;
  });
  if (xb > x + 0.02) out.push(earthWall(x, xb, y0, y1, z0, z1, seed + 50, sky, foot, tone));
  return out;
}

/** 屋顶上的泥烟筒（底在 y=0）：一截略收的泥筒，顶上扣半只破瓮。返回 [筒, 瓮]（obj 材质，已染色）与筒高 */
function chimneyGeo(h: number, seed: number): [Geo, Geo] {
  const body = lathe([[0.2, -0.3], [0.18, h * 0.5], [0.16, h - 0.05], [0.18, h], [0.12, h], [0.12, h * 0.4]], 7);
  shade(body, (_x, y) => 1 - 0.4 * smooth(h * 0.5, h, y));
  const cap = lathe([[0.21, h - 0.02], [0.19, h + 0.07], [0.11, h + 0.15], [0.09, h + 0.14], [0.16, h + 0.06], [0.18, h - 0.02]], 9, seed, Math.PI * 1.5);
  return [dye(body, [0.86, 0.8, 0.72], 1.3), dye(cap, INK.glaze, 1.9)];
}

/** 一道矮土墙（院墙）：夯土的，墙头压一溜草。a → e */
function lowWall(b: Builder, a: [number, number], e: [number, number], h: number, seed: number): void {
  const dx = e[0] - a[0], dz = e[1] - a[1], len = Math.hypot(dx, dz), ry = Math.atan2(-dz, dx);
  const g = sbox(len, h + 0.2, 0.3, 0.5).translate(0, (h - 0.2) / 2, 0);
  wobble(g, 0.03, 0.9, seed, 40, 0.8);
  b.add('earth', shade(g, (_x, y) => 0.97 - 0.1 * smooth(0.5, 0, y)).applyMatrix4(M.mul(M.t((a[0] + e[0]) / 2, 0, (a[1] + e[1]) / 2), M.ry(ry))));
  const pts: V3[] = [], n = Math.max(2, Math.round(len / 0.7));
  for (let i = 0; i <= n; i++) pts.push(v3(-len / 2 - 0.04 + ((len + 0.08) * i) / n, h + 0.03 + 0.03 * Math.sin(i * 2.1 + seed), 0.02 * Math.sin(i * 1.3 + seed)));
  const cap = tube(pts, 0.2, 7, true, true);
  const p = cap.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, h + 0.03 + (p.getY(i) - h - 0.03) * 0.55);
  b.add('thatch', tint(cap, 0.93, 0.93, 0.92).applyMatrix4(M.mul(M.t((a[0] + e[0]) / 2, 0, (a[1] + e[1]) / 2), M.ry(ry))));
}

interface Cottage {
  id: string; wall: number; roof: 'hip' | 'gable'; rise: number; over: number; hip?: number;
  door: { x: number; w: number; state: 'closed' | 'half' }; windows: number[];
  chimney: [number, number]; tone: number; seed: number;
  /** 披屋：在哪一头（-1 西 / 1 东）、多宽、多深 */
  lean?: { side: number; w: number; d: number };
}

/** 一户寻常人家。坐标：屋正中为原点，+z 是门朝的方向，y=0 是屋基 */
function cottage(c: Ctx, b: Builder, h: { id: string; x: number; z: number; w: number; d: number; yaw: number }, o: Cottage, obj: Bin): void {
  const y0 = houseY(h.id), w = h.w, d = h.d, x0 = w / 2, z0 = d / 2, wt = 0.34, fl = 0.12, wh = o.wall, sky = wh - 0.6, tn = o.tone, sd = o.seed;
  b.push(M.trs(h.x, y0, h.z, h.yaw));
  // 台
  b.add('earth', shade(wobble(sbox(w + 0.6, fl + 0.3, d + 0.6, 0.7).translate(0, (fl - 0.3) / 2, 0), 0.035, 0.7, sd, 50, 0.2), (_x, _y, _z, _nx, ny) => tn * (ny > 0.7 ? 1.05 : 0.95)));
  // 前墙：门、窗
  const dh = 1.78, holes = [{ a: o.door.x - o.door.w / 2, b: o.door.x + o.door.w / 2, y0: fl - 0.05, y1: fl + dh + 0.1 }, ...o.windows.map((x) => ({ a: x - 0.45, b: x + 0.45, y0: fl + 1.05, y1: fl + 1.66 }))];
  for (const g of holeWall(-x0, x0, fl - 0.05, wh, z0 - wt, z0, holes, sd + 1, sky, fl, tn)) b.add('earth', g);
  b.add('earth', earthWall(-x0, x0, fl - 0.05, wh, -z0, -z0 + wt, sd + 2, sky, fl, tn));
  if (o.roof === 'hip') for (const s of [-1, 1]) b.add('earth', earthWall(s > 0 ? x0 - wt : -x0, s > 0 ? x0 : -x0 + wt, fl - 0.05, wh, -z0 + wt, z0 - wt, sd + 3 + s, sky, fl, tn));
  else {
    // 两山带尖
    const peak = wh + o.rise * ((z0) / (z0 + o.over)) - 0.02;
    for (const s of [-1, 1]) {
      const g = prism([[-z0 + wt, fl - 0.05], [z0 - wt, fl - 0.05], [z0 - wt, wh], [0, peak], [-z0 + wt, wh]], wt).rotateY(Math.PI / 2).translate(s * (x0 - wt / 2), 0, 0);
      b.add('earth', shade(wobble(g, 0.014, 0.8, sd + 5 + s, 40, 0.5), (_x, y) => tn * (1 - 0.1 * smooth(fl + 0.6, fl, y) - 0.12 * smooth(wh - 0.2, peak, y))));
    }
  }
  // 门框、门扇（关着，或半掩着——门里是黑的）；门槛
  const dz = z0 - 0.09, dx = o.door.x, dw = o.door.w;
  for (const k of [-1, 1]) b.add('wood', boxUp(0.08, dh + 0.04, 0.18, 'y').translate(dx + k * (dw / 2 + 0.03), fl, dz));
  b.add('wood', wobble(box(dw + 0.34, 0.12, 0.2, 'x').translate(dx, fl + dh + 0.07, dz), 0.004, 3, sd + 7));
  b.add('wood', boxUp(dw, 0.07, 0.12, 'x').translate(dx, fl, z0 - 0.06));
  b.add('dark', box(dw, dh, 0.03).translate(dx, fl + dh / 2 + 0.02, z0 - wt + 0.02));
  const leaf = doorLeaf(dw - 0.03, dh - 0.03, -1, sd + 8).map((g) => g.applyMatrix4(M.mul(M.t(dx - dw / 2 + 0.015, fl + 0.03, dz - 0.03), M.ry(o.door.state === 'half' ? 0.95 : 0))));
  for (const g of leaf) b.add('wood', g);
  // 窗
  for (const x of o.windows) {
    const [wd, pp] = lattice(0.9, 0.6, wt, sd + 9 + x, 6), m = M.t(x, fl + 1.355, z0 - wt / 2);
    for (const g of wd) b.add('wood', g.applyMatrix4(m));
    for (const g of pp) b.add('paper', g.applyMatrix4(m));
  }
  // 前檐两根露明的柱
  for (const s of [-1, 1]) b.add('wood', post(s * (x0 - 0.15), z0 - 0.02, fl - 0.04, wh, 0.1, sd + 10 + s));
  // 草顶
  const ov = o.over, eb = wh - ov * 0.6, thick = 0.26;
  const th = thatchRoof({ w: w + ov * 2 * (o.roof === 'hip' ? 1 : 0.5), d: d + ov * 2, rise: o.rise, hip: o.roof === 'hip' ? (o.hip ?? 1.7) : 0, thick, sag: 0.24, lift: 0.14, ridgeSag: 0.1, round: 0.7, droop: 0.15, courses: 2, step: 0.055, rag: 0.08, cell: c.low ? 0.26 : 0.17, seed: sd, roll: 0.17, tone: 0.97, patches: [{ x: -w * 0.18, z: d * 0.3, w: 1.2, l: 1.0 }] });
  b.add('thatch', th.thatch.translate(0, eb + thick, 0));
  if (th.bamboo) b.add('bamboo', th.bamboo.translate(0, eb + thick, 0));
  for (const s of [-1, 1]) for (let x = -x0 + 0.2; x < x0; x += 0.56) b.add('wood', pole(v3(x, wh + 0.1, s * (z0 - 0.4)), v3(x, eb + 0.06, s * (z0 + ov - 0.2)), 0.032, 0.028, 5));
  // 烟筒
  const [cx, cz] = o.chimney, cy = eb + thick + th.top(cx, cz) - 0.05, [cb, cc] = chimneyGeo(0.85, sd);
  obj.push(cb.translate(cx, cy, cz), cc.translate(cx, cy, cz));
  // 披屋：靠着一头山墙的矮棚，一面坡
  if (o.lean) {
    const L = o.lean, s = L.side, lx0 = s * x0, lx1 = s * (x0 + L.w), lz0 = z0 - 0.2 - L.d, lz1 = z0 - 0.2, lh = 1.55, hi = 2.25;
    b.add('earth', earthWall(Math.min(lx1, lx1 - s * 0.28), Math.max(lx1, lx1 - s * 0.28), fl - 0.05, lh, lz0, lz1, sd + 20, lh - 0.4, fl, tn * 0.98));
    b.add('earth', earthWall(Math.min(lx0, lx1), Math.max(lx0, lx1), fl - 0.05, lh + 0.1, lz0, lz0 + 0.28, sd + 21, lh - 0.4, fl, tn * 0.98));
    // 前面敞着：两根柱，里面堆着柴草（黑）
    b.add('wood', post(lx1 - s * 0.14, lz1 - 0.1, 0, lh + 0.05, 0.075, sd + 22));
    b.add('dark', box(L.w - 0.3, lh - 0.1, 0.04).translate((lx0 + lx1) / 2, lh / 2, lz0 + 0.34));
    const lt = thatchRoof({ lean: true, w: L.d + 0.5, d: L.w + 0.4, rise: hi - lh + 0.25, hip: 0, thick: 0.2, sag: 0.1, droop: 0.06, courses: 2, step: 0.045, rag: 0.07, cell: 0.17, seed: sd + 3, roll: 0, tone: 0.94 });
    b.add('thatch', lt.thatch.applyMatrix4(M.mul(M.t(lx0 - s * 0.02, lh + 0.12, (lz0 + lz1) / 2), M.ry((s * Math.PI) / 2))));
    b.add('wood', pole(v3(lx1 - s * 0.14, lh + 0.02, lz0), v3(lx1 - s * 0.14, lh + 0.04, lz1 + 0.15), 0.06, 0.055, 6));
  }
  b.pop();
  c.solid({ id: `邻家·${h.id}`, kind: 'rect', x: h.x, z: h.z, w: w + 0.5 + (o.lean ? o.lean.w * 2 : 0), d: d + 0.5, yaw: h.yaw });
  const m = M.trs(h.x, y0, h.z, h.yaw), p = v3(cx, cy + 1.0, cz).applyMatrix4(m), dp = v3(dx, fl, z0 + 0.9).applyMatrix4(m);
  c.anchor(`chimney${h.id.toUpperCase()}`, p.x, p.y, p.z, h.yaw);
  c.anchor(`door${h.id.toUpperCase()}`, dp.x, dp.y, dp.z, h.yaw);
}

/** 独轮车：当中一只大木轮，两边是架货的木架，后面两根把、两条腿。车头朝 +z，轮底在 y=0 */
function wheelbarrow(seed: number): Geo[] {
  const gs: Geo[] = [], R = rnd(seed), wr = 0.42;
  // 轮：一圈辋（八段）、辐、毂
  const rim: V3[] = [];
  for (let i = 0; i <= 16; i++) rim.push(v3(0, wr + Math.cos((i / 16) * 6.2832) * (wr - 0.035), Math.sin((i / 16) * 6.2832) * (wr - 0.035)));
  gs.push(tube(rim, 0.035, 5));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; gs.push(pole(v3(0, wr - Math.cos(a) * (wr - 0.05), -Math.sin(a) * (wr - 0.05)), v3(0, wr + Math.cos(a) * (wr - 0.05), Math.sin(a) * (wr - 0.05)), 0.017, 0.017, 4)); }
  gs.push(cyl(0.06, 0.06, 0.2, 7).rotateZ(Math.PI / 2).translate(0, wr, 0));
  // 两根通长的车辕（后头是把手），几道横枨；轮上罩一个木架
  for (const s of [-1, 1]) {
    gs.push(pole(v3(s * 0.2, wr + 0.03, 0.62), v3(s * 0.36, wr + 0.2 + R.pm(0.01), -1.35), 0.03, 0.024, 6, 2));
    gs.push(pole(v3(s * 0.33, wr + 0.14, -0.78), v3(s * 0.36, 0, -0.86), 0.026, 0.024, 5));
    gs.push(pole(v3(s * 0.2, wr + 0.05, 0.5), v3(s * 0.2, wr * 2 + 0.07, 0.3), 0.02, 0.02, 5));
    gs.push(pole(v3(s * 0.26, wr + 0.1, -0.42), v3(s * 0.2, wr * 2 + 0.07, -0.3), 0.02, 0.02, 5));
    gs.push(pole(v3(s * 0.2, wr * 2 + 0.07, 0.36), v3(s * 0.2, wr * 2 + 0.07, -0.36), 0.02, 0.02, 5));
    // 两侧的货架
    gs.push(box(0.26, 0.022, 0.86, 'z').translate(s * 0.4, wr + 0.1, -0.02));
    gs.push(pole(v3(s * 0.53, wr + 0.1, 0.4), v3(s * 0.53, wr + 0.1, -0.44), 0.016, 0.016, 4));
  }
  for (const z of [0.56, -0.5, -0.82]) gs.push(pole(v3(-0.3, wr + 0.05 + (z < 0 ? 0.08 : 0), z), v3(0.3, wr + 0.05 + (z < 0 ? 0.08 : 0), z), 0.02, 0.02, 5));
  return gs;
}

/** 一副晒匾：两副竹马、两根横竿，上面搁两只圆匾（里面晒着东西）。沿 x 摆，底在 y=0 */
function dryingTrays(b: Builder, obj: Bin, m: THREE.Matrix4, R: Rand): void {
  for (const x of [-1.0, 1.0]) for (const s of [-1, 1]) b.add('bamboo', pole(v3(x + s * 0.02, -0.02, s * 0.5), v3(x, 0.98, -s * 0.06), 0.02, 0.016, 5).applyMatrix4(m));
  for (const z of [-0.2, 0.22]) b.add('bamboo', pole(v3(-1.3, 0.8 + Math.abs(z) * 0.3, z), v3(1.3, 0.82 + Math.abs(z) * 0.3, z), 0.018, 0.016, 5).applyMatrix4(m));
  [-0.55, 0.58].forEach((x, i) => {
    const tray = lathe([[0.001, 0], [0.46, 0], [0.5, 0.055], [0.485, 0.055], [0.45, 0.014], [0.001, 0.014]], 14);
    obj.push(dye(tray, INK.bamboo, 1.5).applyMatrix4(M.mul(m, M.t(x, 0.9, 0.01), M.rx(0.06 * (i ? -1 : 1)))));
    obj.push(dye(cyl(0.43, 0.43, 0.006, 14), i ? [0.86, 0.72, 0.64] : [0.94, 0.87, 0.62], 1.2 + 0.2 * R()).applyMatrix4(M.mul(m, M.t(x, 0.92, 0.01), M.rx(0.06 * (i ? -1 : 1)))));
  });
}

export function buildVillage(c: Ctx, sub?: string[]): void {
  const on = (k: string) => !sub || sub.includes(k);
  const b = c.village, R = rnd(6100);
  // 小物件、带字的面直接进当前的摊（带着当时的摆位）
  const obj = { push: (...gs: Geo[]) => { for (const g of gs) b.add('obj', g); } }, lab = { push: (...gs: Geo[]) => { for (const g of gs) b.add('label', g); } };
  const hs = (id: string) => SITE.houses.find((h) => h.id === id)!;
  /** 某一户的屋基坐标 → 世界 */
  const WP = (h: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] => [h.x + lx * Math.cos(h.yaw) + lz * Math.sin(h.yaw), h.z - lx * Math.sin(h.yaw) + lz * Math.cos(h.yaw)];

  // ———————————— 甲：三间，四面坡；门前一道矮土墙、一垛草、鸡埘、晒匾、碌碡 ————————————
  if (on('a')) {
    const h = hs('a'), y = houseY('a'), m = M.trs(h.x, y, h.z, h.yaw);
    cottage(c, b, h, { id: 'a', wall: 2.36, roof: 'hip', rise: 2.5, over: 0.8, hip: 1.9, door: { x: 0, w: 1.0, state: 'half' }, windows: [-2.5, 2.5], chimney: [2.9, -0.5], tone: 1, seed: 101 }, obj);
    b.push(m);
    const zf = h.d / 2 + 3.4;
    lowWall(b, [-h.w / 2 - 2.2, zf], [-1.2, zf], 0.86, 111);
    lowWall(b, [1.5, zf + 0.05], [h.w / 2 + 2.2, zf], 0.84, 112);
    lowWall(b, [-h.w / 2 - 2.2, zf], [-h.w / 2 - 2.25, 0.4], 0.8, 113);
    // 鸡埘：矮矮一只木笼，前面一排栅，上面盖草
    {
      const cx = -h.w / 2 - 0.9, cz = h.d / 2 + 0.6;
      b.add('wood', wobble(box(1.1, 0.5, 0.62, 'x').translate(cx, 0.4, cz), 0.006, 2, 115));
      b.add('dark', box(0.9, 0.34, 0.02).translate(cx, 0.4, cz + 0.315));
      for (let i = 0; i < 9; i++) b.add('wood', cyl(0.012, 0.012, 0.36, 4).translate(cx - 0.42 + i * 0.105, 0.4, cz + 0.33));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', cylUp(0.03, 0.03, 0.16, 5).translate(cx + sx * 0.48, 0, cz + sz * 0.25));
      const lt = thatchRoof({ lean: true, w: 1.4, d: 0.95, rise: 0.22, hip: 0, thick: 0.1, sag: 0, droop: 0.03, courses: 1, rag: 0.05, cell: 0.14, seed: 116, roll: 0 });
      b.add('thatch', lt.thatch.translate(cx, 0.76, cz - 0.4));
    }
    dryingTrays(b, obj, M.mul(M.t(2.3, 0, h.d / 2 + 1.9), M.ry(0.2)), R);
    b.pop();
    for (const [lx, lz, r, id] of [[-h.w / 2 - 0.9, h.d / 2 + 0.6, 0.7, '鸡埘'], [2.3, h.d / 2 + 1.9, 1.35, '晒匾']] as Array<[number, number, number, string]>) { const [x, z] = WP(h, lx, lz); c.solid({ id: `甲·${id}`, kind: 'disc', x, z, r }); }
    for (const [ax, az, bx, bz] of [[-h.w / 2 - 2.2, zf, -1.2, zf], [1.5, zf, h.w / 2 + 2.2, zf], [-h.w / 2 - 2.2, zf, -h.w / 2 - 2.2, 0.4]]) { const [x0, z0] = WP(h, ax, az), [x1, z1] = WP(h, bx, bz); c.solid({ id: '甲·矮土墙', kind: 'rect', x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: Math.hypot(x1 - x0, z1 - z0), d: 0.36, yaw: Math.atan2(-(z1 - z0), x1 - x0) }); }
  }

  // ———————————— 乙：两面坡，东头一间披屋；门前一辆独轮车、一副扁担箩筐 ————————————
  if (on('b')) {
    const h = hs('b'), y = houseY('b'), m = M.trs(h.x, y, h.z, h.yaw);
    cottage(c, b, h, { id: 'b', wall: 2.3, roof: 'gable', rise: 2.3, over: 0.75, door: { x: -0.9, w: 0.95, state: 'closed' }, windows: [1.7], chimney: [-2.6, -0.6], tone: 0.97, seed: 201, lean: { side: 1, w: 2.3, d: 3.4 } }, obj);
    b.push(m);
    for (const g of wheelbarrow(211)) b.add('wood', g.applyMatrix4(M.mul(M.t(-3.2, 0, h.d / 2 + 2.2), M.ry(-0.5))));
    // 扁担与两只箩筐
    for (const s of [-1, 1]) {
      const bx = 1.5 + s * 0.75, bz = h.d / 2 + 1.5 + s * 0.12;
      const bk = lathe([[0.001, 0], [0.2, 0], [0.26, 0.22], [0.27, 0.4], [0.25, 0.4], [0.24, 0.22], [0.19, 0.03], [0.001, 0.03]], 12);
      obj.push(dye(shade(bk, (x, yy, z) => (Math.hypot(x, z) < 0.24 && yy > 0.02 ? 0.6 : 0.9 + 0.1 * Math.sin(yy * 60))), INK.bamboo, 1.6).translate(bx, 0, bz));
      obj.push(dye(tube([v3(bx - 0.25, 0.4, bz), v3(bx, 0.78, bz), v3(bx + 0.25, 0.4, bz)], 0.008, 4), INK.hemp, 1.5));
    }
    b.add('bamboo', pole(v3(0.55, 0.74, h.d / 2 + 1.36), v3(2.5, 0.8, h.d / 2 + 1.66), 0.022, 0.02, 6, 2));
    // 靠墙的农具：耙、锄
    b.add('wood', pole(v3(2.6, fl0, h.d / 2 + 0.5), v3(2.55, 1.6, h.d / 2 + 0.06), 0.018, 0.016, 5));
    b.add('wood', box(0.5, 0.03, 0.03, 'x').translate(2.6, 0.04, h.d / 2 + 0.52));
    for (let i = 0; i < 6; i++) b.add('wood', cyl(0.008, 0.006, 0.1, 4).translate(2.38 + i * 0.088, 0.0, h.d / 2 + 0.52));
    b.pop();
    for (const [lx, lz, r, id] of [[-3.2, h.d / 2 + 2.0, 1.0, '独轮车'], [1.5, h.d / 2 + 1.5, 1.1, '扁担箩筐']] as Array<[number, number, number, string]>) { const [x, z] = WP(h, lx, lz); c.solid({ id: `乙·${id}`, kind: 'disc', x, z, r }); }
  }

  // ———————————— 丁：四面坡；西边一圈荆条编的牲口栏、一个草棚，一条食槽；屋后一垛草 ————————————
  if (on('d')) {
    const h = hs('d'), y = houseY('d'), m = M.trs(h.x, y, h.z, h.yaw);
    cottage(c, b, h, { id: 'd', wall: 2.3, roof: 'hip', rise: 2.35, over: 0.78, hip: 1.7, door: { x: 0.8, w: 0.95, state: 'closed' }, windows: [-1.9], chimney: [2.5, -0.4], tone: 1.02, seed: 301 }, obj);
    b.push(m);
    // 栏：一根根桩，桩间横着编荆条
    const px0 = -h.w / 2 - 3.2, px1 = -h.w / 2 - 0.5, pz0 = -0.6, pz1 = h.d / 2 + 1.6;
    const seg = (ax: number, az: number, bx: number, bz: number, s: number) => {
      const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(-(bz - az), bx - ax), n = Math.max(1, Math.round(len / 0.85));
      for (let i = 0; i <= n; i++) b.add('wood', post(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, -0.1, 1.05 + R.pm(0.08), 0.035, 310 + s * 10 + i, 6));
      const g = sbox(len, 0.78, 0.045, 0.4, 'x').translate(0, 0.5, 0);
      wobble(g, 0.018, 2.2, 320 + s, 0, 1);
      b.add('thatch', tint(g, 0.8, 0.77, 0.72).applyMatrix4(M.mul(M.t((ax + bx) / 2, 0, (az + bz) / 2), M.ry(ry))));
    };
    seg(px0, pz0, px1, pz0, 1); seg(px0, pz0, px0, pz1, 2); seg(px0, pz1, px1 - 1.1, pz1, 3);
    // 栏里的草棚（一面坡，靠着屋的山墙那一边低）
    for (const [x, z] of [[px0 + 0.3, pz0 + 0.3], [px0 + 0.3, pz0 + 2.0], [px1 - 0.2, pz0 + 0.3], [px1 - 0.2, pz0 + 2.0]]) b.add('wood', post(x, z, 0, x < px0 + 1 ? 1.5 : 1.95, 0.05, 330 + x, 6));
    const lt = thatchRoof({ lean: true, w: 2.3, d: px1 - px0 + 0.3, rise: 0.55, hip: 0, thick: 0.16, sag: 0.05, droop: 0.05, courses: 2, step: 0.04, rag: 0.07, cell: 0.16, seed: 331, roll: 0, tone: 0.93 });
    b.add('thatch', lt.thatch.applyMatrix4(M.mul(M.t(px1 + 0.05, 1.55, pz0 + 1.15), M.ry(-Math.PI / 2))));
    // 食槽：一段剖开挖空的木头
    b.add('wood', wobble(box(1.3, 0.24, 0.34, 'x').translate(px0 + 1.5, 0.2, pz1 - 0.5), 0.008, 2, 332));
    b.add('dark', box(1.1, 0.02, 0.2).translate(px0 + 1.5, 0.325, pz1 - 0.5));
    for (const s of [-1, 1]) b.add('wood', boxUp(0.12, 0.1, 0.36).translate(px0 + 1.5 + s * 0.5, 0, pz1 - 0.5));
    b.pop();
    { const [x, z] = WP(h, (px0 + px1) / 2, (pz0 + pz1) / 2); c.solid({ id: '丁·牲口栏', kind: 'rect', x, z, w: px1 - px0 + 0.2, d: pz1 - pz0 + 0.2, yaw: h.yaw }); }
  }

  // ———————————— 戊：朝北开门的两间小屋；一圈竹篱、柴扉半开；院里晒匾、水缸 ————————————
  if (on('e')) {
    const h = hs('e'), y = houseY('e'), m = M.trs(h.x, y, h.z, h.yaw);
    cottage(c, b, h, { id: 'e', wall: 2.25, roof: 'gable', rise: 2.15, over: 0.72, door: { x: -0.7, w: 0.95, state: 'half' }, windows: [1.6], chimney: [2.2, -0.5], tone: 0.99, seed: 401 }, obj);
    b.push(m);
    const vat = lathe([[0.001, 0], [0.2, 0], [0.34, 0.3], [0.35, 0.56], [0.32, 0.62], [0.34, 0.66], [0.3, 0.66], [0.3, 0.3], [0.001, 0.1]], 14);
    obj.push(dye(shade(vat, (x, yy, z) => (Math.hypot(x, z) < 0.3 && yy > 0.08 ? 0.5 : 1)), [0.7, 0.66, 0.62], 1.7).translate(2.6, 0, h.d / 2 + 0.6));
    b.pop();
    { const [x, z] = WP(h, 2.6, h.d / 2 + 0.6); c.solid({ id: '戊·水缸', kind: 'disc', x, z, r: 0.4 }); }
  }

  // ———————————— 村塾：长长一座草屋，前檐（南）敞着，只立几根柱；里面两排矮桌、席，东头是先生的桌 ————————————
  if (on('school')) {
    const h = hs('school'), y = houseY('school'), m = M.trs(h.x, y, h.z, h.yaw), w = h.w, d = h.d, x0 = w / 2, z0 = d / 2, wt = 0.36, fl = 0.16, wh = 2.62, sky = wh - 0.6;
    b.push(m);
    b.add('earth', shade(wobble(sbox(w + 0.7, fl + 0.3, d + 0.9, 0.7).translate(0, (fl - 0.3) / 2, 0.1), 0.035, 0.7, 501, 50, 0.2), (_x, _y, _z, _nx, ny) => (ny > 0.7 ? 1.05 : 0.95)));
    // 北墙、东西两山；屋里的面深一些
    const dim = (g: Geo, test: (nx: number, nz: number) => boolean) => shade(g, (_x, _y, _z, nx, _ny, nz) => (test(nx, nz) ? 0.8 : 1));
    b.add('earth', dim(earthWall(-x0, x0, fl - 0.05, wh, -z0, -z0 + wt, 502, sky, fl), (_nx, nz) => nz > 0.5));
    for (const s of [-1, 1]) b.add('earth', dim(earthWall(s > 0 ? x0 - wt : -x0, s > 0 ? x0 : -x0 + wt, fl - 0.05, wh, -z0 + wt, z0, 503 + s, sky, fl), (nx) => nx * s < -0.5));
    // 前檐：两头各一小段墙垛，当中四根柱，柱间一道矮矮的地栿
    for (const s of [-1, 1]) b.add('earth', earthWall(s > 0 ? x0 - 0.95 : -x0 + wt, s > 0 ? x0 - wt : -x0 + 0.95, fl - 0.05, wh, z0 - wt, z0, 505 + s, sky, fl));
    const px = [-x0 + 0.95, -1.38, 1.38, x0 - 0.95];
    for (const [i, x] of px.entries()) { b.add('wood', post(x, z0 - 0.16, fl - 0.03, wh + 0.02, 0.105, 510 + i)); b.add('stone', at(flatRock(515 + i, 0.2, fl + 0.03, 0.19, 1), x, -0.01, z0 - 0.13)); }
    b.add('wood', pole(v3(-x0 + 0.5, wh - 0.08, z0 - 0.16), v3(x0 - 0.5, wh - 0.06, z0 - 0.16), 0.09, 0.085, 8, 5));
    b.add('wood', boxUp(w - 1.9, 0.1, 0.14, 'x').translate(0, fl - 0.01, z0 - 0.16));
    // 地面
    b.add('earth', tint(box(w - 2 * wt, 0.02, d - wt).translate(0, fl, wt / 2), 0.86, 0.87, 0.9));
    // 草顶
    const ov = 0.9, eb = wh - ov * 0.56, thick = 0.28;
    const th = thatchRoof({ w: w + ov * 2, d: d + ov * 2, rise: 2.7, hip: 2.0, thick, sag: 0.26, lift: 0.16, ridgeSag: 0.12, round: 0.75, droop: 0.16, courses: 3, step: 0.055, rag: 0.08, cell: c.low ? 0.26 : 0.16, seed: 521, roll: 0.19, patches: [{ x: 2.6, z: 2.2, w: 1.5, l: 1.1 }] });
    b.add('thatch', th.thatch.translate(0, eb + thick, 0));
    if (th.bamboo) b.add('bamboo', th.bamboo.translate(0, eb + thick, 0));
    for (let x = -x0 + 0.2; x < x0; x += 0.6) b.add('wood', pole(v3(x, wh + 0.12, z0 - 0.5), v3(x, eb + 0.06, z0 + ov - 0.2), 0.032, 0.028, 5));
    for (const x of [-1.38, 1.38]) b.add('wood', pole(v3(x, wh + 0.02, -z0 + 0.1), v3(x, wh + 0.02, z0 + 0.2), 0.1, 0.095, 8, 3));
    // 北墙正中一块素木匾「蒙以养正」
    {
      const mm = M.mul(M.t(0, fl + 1.42, -z0 + wt + 0.03), M.rx(0.05));
      lab.push(blankUV(dye(wobble(box(1.2, 0.36, 0.024), 0.0012, 3, 531), [0.86, 0.82, 0.74], 1.35), c.blank).applyMatrix4(mm));
      lab.push(dye(panel(1.18, 0.34, c.rect('school')), [0.86, 0.82, 0.74], 1.1).translate(0, 0, 0.016).applyMatrix4(mm));
    }
    // 两排矮桌，一桌一席（学童朝东坐）；桌上一册书、一方小砚
    for (const [ri, z] of [-0.95, 0.75].entries()) for (let i = 0; i < 3; i++) {
      const x = -2.7 + i * 1.75 + ri * 0.2, T = fl + 0.3;
      b.add('wood', at(wobble(box(0.4, 0.03, 0.9, 'z'), 0.004, 2, 540 + ri * 5 + i), x, T - 0.015, z));
      for (const s of [-1, 1]) b.add('wood', at(box(0.34, 0.26, 0.03, 'y'), x, fl + 0.14, z + s * 0.36));
      b.add('thatch', tint(matQuad(0.62, 0.8), 0.99, 0.98, 0.93).translate(x - 0.58, fl + 0.012, z));
      obj.push(dye(at(box(0.17, 0.014, 0.25), x + 0.02, T + 0.008, z - 0.1 + R.pm(0.05), Math.PI / 2 + R.pm(0.2)), INK.page, 0.9));
      obj.push(dye(at(box(0.07, 0.018, 0.1), x + 0.05, T + 0.01, z + 0.3), INK.slate, 1.8));
    }
    // 先生的桌：高一些、大一些，东头靠墙；一把戒尺、几册书、笔筒；后面一只坐墩
    {
      const tx = x0 - 1.5, T = fl + 0.72;
      b.add('wood', at(wobble(box(0.62, 0.04, 1.3, 'z'), 0.004, 2, 551), tx, T - 0.02, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', at(boxUp(0.055, 0.69, 0.055, 'y'), tx + sx * 0.25, fl, sz * 0.57));
      for (const sz of [-1, 1]) b.add('wood', at(box(0.5, 0.03, 0.03, 'x'), tx, fl + 0.2, sz * 0.57));
      bookStack(obj, R, tx + 0.08, T, -0.4, 4, Math.PI / 2);
      obj.push(dye(at(box(0.03, 0.012, 0.32), tx - 0.1, T + 0.007, 0.15, 0.2), INK.darkwood, 2));
      obj.push(dye(at(lathe([[0.001, 0], [0.04, 0], [0.042, 0.11], [0.036, 0.11], [0.036, 0.01], [0.001, 0.01]], 10), tx + 0.12, T, 0.45), INK.bamboo, 1.5));
      b.add('wood', at(renormal(wobble(cylUp(0.19, 0.2, 0.42, 10, false, 2), 0.008, 3, 552, 0), 50), tx + 0.62, fl, 0));
    }
    // 西墙边一只书架
    {
      const sx = -x0 + wt + 0.2;
      for (const s of [-1, 1]) b.add('wood', box(0.3, 1.3, 0.03, 'y').translate(sx, fl + 0.65, -0.9 + s * 0.5));
      for (const yy of [0.1, 0.55, 0.98, 1.3]) b.add('wood', box(0.3, 0.025, 1.0, 'z').translate(sx, fl + yy, -0.9));
      for (const yy of [0.115, 0.565, 0.995]) for (const zz of [-1.2, -0.9, -0.6]) if (R() < 0.8) bookStack(obj, R, sx, fl + yy, zz, 2 + R.i(5), Math.PI / 2);
    }
    b.pop();
    c.solid({ id: '村塾', kind: 'rect', x: h.x, z: h.z, w: w + 0.6, d: d + 0.6, yaw: h.yaw });
    { const [x, z] = WP(h, 0, z0 + 1.8); c.anchor('schoolFront', x, y, z, h.yaw); }
    { const p = v3(0, fl + 1.42, -z0 + wt + 0.05).applyMatrix4(m); c.anchor('schoolBoard', p.x, p.y, p.z, h.yaw); }
  }

  // ———————————— 井：井字石栏、辘轳、一只水桶 ————————————
  if (on('well')) {
    const Wl = SITE.well, gy = ground(Wl.x, Wl.z), top = gy + 0.14;
    // 井台：略高出地面的一圈，铺几块平石
    b.add('earth', lathe([[1.85, -0.2], [1.75, 0.02], [1.5, 0.13], [0.001, 0.14]], 14).translate(Wl.x, gy, Wl.z));
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3, r = 1.05 + 0.25 * R(); b.add('stone', at(flatRock(600 + i, R.r(0.3, 0.42), 0.07, R.r(0.24, 0.32), 1), Wl.x + Math.cos(a) * r, top - 0.045, Wl.z + Math.sin(a) * r, a + R.pm(0.5))); }
    // 井圈（里面是黑的）、井字栏
    b.add('stone', renormal(wobble(lathe([[0.56, -0.3], [0.58, 0.3], [0.44, 0.3], [0.44, -0.3]], 10), 0.012, 2, 610, 0), 46).translate(Wl.x, top, Wl.z));
    b.add('dark', cyl(0.44, 0.44, 0.02, 10).translate(Wl.x, top - 0.25, Wl.z));
    for (const [i, [dx, dz, ry]] of ([[0, 0.43, 0], [0, -0.43, 0], [0.43, 0, Math.PI / 2], [-0.43, 0, Math.PI / 2]] as Array<[number, number, number]>).entries()) {
      b.add('stone', tint(renormal(wobble(sbox(1.42, 0.2, 0.17, 0.4).translate(0, 0, 0), 0.01, 2, 611 + i, 0, 0.5), 42).applyMatrix4(M.mul(M.t(Wl.x + dx, top + 0.4 + (i > 1 ? 0.06 : 0), Wl.z + dz), M.ry(ry))), 1.1));
    }
    // 辘轳：井两边各一副叉架，横一根轴，轴上一段绞筒、一只曲柄；井绳垂进井里
    const ay = top + 1.32;
    for (const s of [-1, 1]) for (const e of [-1, 1]) b.add('wood', pole(v3(Wl.x + s * 0.98, gy - 0.1, Wl.z + e * 0.4), v3(Wl.x + s * 0.92, ay + 0.2, Wl.z - e * 0.07), 0.045, 0.036, 6));
    b.add('wood', pole(v3(Wl.x - 1.12, ay, Wl.z), v3(Wl.x + 1.2, ay, Wl.z), 0.045, 0.045, 7, 2));
    b.add('wood', cyl(0.13, 0.13, 0.5, 10).rotateZ(Math.PI / 2).translate(Wl.x, ay, Wl.z));
    obj.push(dye(cyl(0.142, 0.142, 0.3, 10).rotateZ(Math.PI / 2).translate(Wl.x + 0.02, ay, Wl.z), INK.hemp, 1.6));
    b.add('wood', pole(v3(Wl.x + 1.18, ay, Wl.z), v3(Wl.x + 1.2, ay - 0.3, Wl.z + 0.1), 0.026, 0.024, 5));
    b.add('wood', pole(v3(Wl.x + 1.19, ay - 0.3, Wl.z + 0.1), v3(Wl.x + 1.48, ay - 0.31, Wl.z + 0.1), 0.024, 0.022, 5));
    obj.push(dye(pole(v3(Wl.x + 0.05, ay - 0.14, Wl.z + 0.02), v3(Wl.x + 0.03, top - 0.2, Wl.z), 0.01, 0.01, 4), INK.hemp, 1.5));
    // 水桶（可提；原点在提梁顶上）：搁在井台上
    {
      const bh = 0.3, g = bucketGeo(0.14, 0.17, bh, c.low ? 8 : 12).map((q) => q.translate(0, -0.5, 0));
      g.push(dye(tube([v3(-0.168, -0.22, 0), v3(-0.16, -0.09, 0), v3(-0.08, -0.012, 0), v3(0, 0, 0), v3(0.08, -0.012, 0), v3(0.16, -0.09, 0), v3(0.168, -0.22, 0)], 0.009, 5), INK.hemp, 1.6));
      const bk = c.part('bucket', 'obj', g, v3(Wl.x - 0.3, top + 0.03 + 0.5, Wl.z + 1.05), new THREE.Euler(0, 0.7, 0));
      bk.userData = { bottom: -0.5, rim: -0.2, r: 0.17 };
    }
    c.solid({ id: '井', kind: 'disc', x: Wl.x, z: Wl.z, r: 0.75, top: top + 0.5 });
    for (const s of [-1, 1]) c.solid({ id: '井·辘轳架', kind: 'rect', x: Wl.x + s * 0.96, z: Wl.z, w: 0.14, d: 0.9 });
    c.solid({ id: '井台', kind: 'disc', x: Wl.x, z: Wl.z, r: 1.6, top, walk: true });
    c.anchor('well', Wl.x, top + 0.5, Wl.z + 0.6, 0);
  }

  // ———————————— 槐树下：一条石凳、几块坐石 ————————————
  if (on('elm')) {
    const E = SITE.elm, bx = E.x + 0.25, bz = E.z - 2.2, gy = ground(bx, bz), sh = 0.44;
    b.add('stone', tint(at(renormal(wobble(sbox(1.8, 0.13, 0.44, 0.45).translate(0, sh - 0.065, 0), 0.015, 1.4, 701, 0, 0.5), 42), bx, gy, bz, 0.04), 1.1));
    for (const s of [-1, 1]) b.add('stone', at(flatRock(702 + s, 0.2, sh - 0.12, 0.2, 1), bx + s * 0.62, gy - 0.02, bz, R() * 3));
    c.solid({ id: '槐下石凳', kind: 'rect', x: bx, z: bz, w: 1.8, d: 0.44, yaw: 0.04, top: gy + sh });
    c.anchor('elmBench', bx, gy + sh, bz, 0);
    for (const [i, [dx, dz]] of ([[2.3, -1.5], [-2.2, -1.6], [-2.5, 0.9]] as Array<[number, number]>).entries()) {
      const x = E.x + dx, z = E.z + dz, g0 = ground(x, z), hh = 0.38 + 0.05 * R();
      b.add('stone', at(flatRock(705 + i, 0.3, hh, 0.26), x, g0 - 0.02, z, R() * 6));
      c.solid({ id: `槐下坐石${i + 1}`, kind: 'disc', x, z, r: 0.3, top: g0 + hh });
    }
  }

}

const fl0 = 0;
/** 一领小席（朝上的一张薄片，草丝顺着 z） */
function matQuad(w: number, d: number): Geo {
  const g = box(w, 0.012, d, 'z');
  return g;
}
