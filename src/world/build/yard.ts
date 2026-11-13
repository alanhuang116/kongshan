/**
 * 院子：竹篱一圈、柴门（门上无匾，两根门柱上挂一联）、西边的小门；东厢灶屋；石桌与四只石凳；圭表；
 * 屋檐下靠墙的扫帚、锄头，墙上挂的斗笠与蓑衣；菊圃的一圈矮边，圃边一只木桶、一把葫芦瓢；晾竿。
 * 院里不铺砖石。
 */
import * as THREE from 'three';
import { M, box, boxUp, cyl, cylUp, grid, lathe, prism, rockGeo, shade, tint, type Builder, type Geo } from '../core/geo';
import { smooth } from '../core/rng';
import { SITE, YARD_Y } from '../site';
import { INK, blankUV, decal, dye, facing, flatRock, panel, pole, renormal, rnd, sbox, tube, v3, wobble, type Ctx, type Rand, type Solid, type V3 } from './kit';
import { doorLeaf, earthWall, hallDims, lattice, post, raw } from './hall';
import { thatchRoof } from './thatch';

const at = (g: Geo, x: number, y: number, z: number, ry = 0) => g.applyMatrix4(M.mul(M.t(x, y, z), M.ry(ry)));

/**
 * 一段竹篱，从 a 到 e（平面上的两点）：隔一丈来远一根桩，两道横竿，细竹竿一根根插着——高矮不齐、有歪有缺。
 * gy 给地面的高度。篱不高（一米出头），疏疏的。
 */
export function fence(b: Builder, R: Rand, a: [number, number], e: [number, number], gy: (x: number, z: number) => number, solid?: (s: Solid) => void, o: { h?: number; id?: string } = {}): void {
  const dx = e[0] - a[0], dz = e[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.3) return;
  const ux = dx / len, uz = dz / len, nx = -uz, nz = ux, H = o.h ?? 1.08;
  const P = (t: number, y: number, off = 0): V3 => { const x = a[0] + ux * t + nx * off, z = a[1] + uz * t + nz * off; return v3(x, gy(x, z) + y, z); };
  const np = Math.max(1, Math.round(len / 1.9));
  // 桩
  const rail: number[][] = [];
  for (let i = 0; i <= np; i++) {
    const t = (len * i) / np, top = H + R.r(0.06, 0.18), lean = R.pm(0.03);
    b.add('bamboo', tint(pole(P(t, -0.08), P(t + lean * top, top, R.pm(0.02)), 0.03, 0.026, 6, 2), 0.93));
    rail.push([0.3 + R.pm(0.035), H * 0.8 + R.pm(0.035)]);
  }
  // 横竿：一段搭一段，中间略垂
  for (let i = 0; i < np; i++) for (const k of [0, 1]) {
    const t0 = (len * i) / np - 0.08, t1 = (len * (i + 1)) / np + 0.08, y0 = rail[i][k], y1 = rail[i + 1][k];
    b.add('bamboo', tube([P(t0, y0, 0.034), P((t0 + t1) / 2, (y0 + y1) / 2 - 0.015, 0.036), P(t1, y1, 0.034)], 0.014, 5, true));
  }
  // 细竹竿
  for (let t = R.r(0.05, 0.14); t < len - 0.04; t += R.r(0.1, 0.19)) {
    if (R() < 0.07) { t += R.r(0.1, 0.3); continue; }
    const wild = R() < 0.09, h = wild && R() < 0.5 ? R.r(0.45, 0.75) : H + R.r(-0.14, 0.14), lean = wild ? R.pm(0.22) : R.pm(0.05), k = R.r(0.86, 1.06);
    b.add('bamboo', tint(pole(P(t - lean * 0.2, -0.04, -0.004), P(t + lean * h, h, -0.004 + R.pm(0.012)), 0.0125, 0.0095, 5), k, k, k * 0.96));
  }
  // 偶尔一根斜撑
  for (let i = 0; i < np; i++) if (R() < 0.3) { const t0 = (len * i) / np + 0.1, t1 = (len * (i + 1)) / np - 0.1, up = R() < 0.5; b.add('bamboo', pole(P(up ? t0 : t1, 0.02, 0.05), P(up ? t1 : t0, H * 0.92, 0.05), 0.012, 0.01, 5)); }
  solid?.({ id: o.id ?? '竹篱', kind: 'rect', x: (a[0] + e[0]) / 2, z: (a[1] + e[1]) / 2, w: len, d: 0.14, yaw: Math.atan2(-dz, dx) });
}

/** 一扇柴扉（原点在门轴脚下；s=-1 门轴在西、朝 +x 伸出去）：几根粗枝做框，细枝条编在里面，上头参差 */
export function wicker(w: number, h: number, s: number, seed: number): Geo[] {
  const R = rnd(seed), gs: Geo[] = [], X = (x: number) => -s * x;
  gs.push(pole(v3(0, -0.02, 0), v3(X(0.01), h + 0.16, 0), 0.03, 0.026, 6, 2));
  gs.push(pole(v3(X(w), 0.03, 0), v3(X(w - 0.01), h + 0.05, 0), 0.022, 0.02, 6, 2));
  for (const y of [0.14, 0.52, 0.9]) gs.push(pole(v3(X(-0.02), y * h + R.pm(0.02), 0.022), v3(X(w + 0.03), y * h + R.pm(0.03), 0.022), 0.019, 0.016, 5));
  gs.push(pole(v3(X(0.03), 0.16 * h, -0.02), v3(X(w - 0.03), 0.88 * h, -0.02), 0.016, 0.014, 5));
  for (let x = 0.07; x < w - 0.04; x += R.r(0.055, 0.1)) {
    const top = h + R.r(-0.06, 0.2), k = R.r(0.8, 1.05), bend = R.pm(0.03);
    gs.push(tint(tube([v3(X(x), 0.04 + R.r(0, 0.05), 0), v3(X(x + bend), top * 0.5, R.pm(0.008)), v3(X(x + bend * 0.3 + R.pm(0.02)), top, 0)], (t) => 0.011 - 0.005 * t, 4, true), k, k * 0.98, k * 0.95));
  }
  return gs;
}

/** 一只木桶（底在 y=0）：桶板、两道箍。返回几何（obj 材质，已染色） */
export function bucketGeo(r0: number, r1: number, h: number, seg = 12): Geo[] {
  const g: Geo[] = [];
  const body = lathe([[0.001, 0.012], [r0, 0], [r1, h], [r1 - 0.014, h], [r0 - 0.012, 0.03], [0.001, 0.03]], seg);
  shade(body, (x, y, z) => (Math.hypot(x, z) < r0 - 0.005 && y > 0.02 ? 0.6 : 0.9 + 0.1 * Math.sin(Math.atan2(z, x) * seg * 0.5)));
  g.push(dye(body, INK.wood, 1.5));
  for (const t of [0.2, 0.78]) { const r = r0 + (r1 - r0) * t + 0.003, pts: V3[] = []; for (let i = 0; i <= seg; i++) pts.push(v3(Math.cos((i / seg) * 6.2832) * r, h * t, Math.sin((i / seg) * 6.2832) * r)); g.push(dye(tube(pts, 0.006, 4), INK.bamboo, 2.2)); }
  return g;
}

export function buildYard(c: Ctx): void {
  const b = c.home, Y = YARD_Y, R = rnd(5207);
  // 小物件、带字的面直接进当前的摊（带着当时的摆位）
  const obj = { push: (...gs: Geo[]) => { for (const g of gs) b.add('obj', g); } }, lab = { push: (...gs: Geo[]) => { for (const g of gs) b.add('label', g); } };
  const gy = () => Y;
  const seg = (n: number) => (c.low ? Math.max(8, Math.round(n * 0.6)) : n);

  // ———————————— 竹篱一圈 ————————————
  {
    const y = SITE.yard, G = SITE.gate, S = SITE.sideGate, gp = G.w / 2 + 0.2, sp = S.w / 2 + 0.12, s = (q: Solid) => c.solid(q);
    fence(b, R, [y.x0, y.z1], [G.x - gp, y.z1], gy, s, { id: '竹篱·南西' });
    fence(b, R, [G.x + gp, y.z1], [y.x1, y.z1], gy, s, { id: '竹篱·南东' });
    fence(b, R, [y.x1, y.z1], [y.x1, y.z0], gy, s, { id: '竹篱·东' });
    fence(b, R, [y.x1, y.z0], [y.x0, y.z0], gy, s, { id: '竹篱·北' });
    fence(b, R, [y.x0, y.z0], [y.x0, S.z - sp], gy, s, { id: '竹篱·西北' });
    fence(b, R, [y.x0, S.z + sp], [y.x0, y.z1], gy, s, { id: '竹篱·西南' });
    // 西边的小门：两根矮桩、一扇柴扉（朝里开着）
    for (const k of [-1, 1]) { b.add('wood', post(S.x, S.z + k * (S.w / 2 + 0.04), Y - 0.1, Y + 1.5 + 0.06 * k, 0.055, 610 + k, 7)); c.solid({ id: '西小门·桩', kind: 'disc', x: S.x, z: S.z + k * (S.w / 2 + 0.04), r: 0.07 }); }
    const leaf = wicker(S.w - 0.08, 1.12, -1, 77).map((g) => g.applyMatrix4(M.mul(M.t(S.x, Y + 0.02, S.z - S.w / 2), M.ry(-Math.PI / 2 + 1.25))));
    for (const g of leaf) b.add('wood', g);
    c.solid({ id: '西小门·门扇（开着）', kind: 'rect', x: S.x + 0.56, z: S.z - S.w / 2 + 0.2, w: 1.2, d: 0.08, yaw: -Math.PI / 2 + 1.25 });
    c.anchor('sideGate', S.x, Y, S.z, -Math.PI / 2);
  }

  // ———————————— 柴门与门联 ————————————
  {
    const G = SITE.gate, hw = G.w / 2, px = hw + 0.1, gh = 2.62;
    for (const s of [-1, 1]) {
      b.add('wood', renormal(wobble(pole(v3(G.x + s * px, Y - 0.15, G.z), v3(G.x + s * (px - 0.02), Y + gh + (s > 0 ? 0.05 : 0), G.z + 0.02 * s), 0.105, 0.09, 8, 5), 0.012, 1.2, 620 + s, 0), 60));
      b.add('stone', at(flatRock(625 + s, 0.2, 0.09, 0.19, 1), G.x + s * (px + 0.02), Y - 0.01, G.z));
      c.solid({ id: `柴门·门柱${s < 0 ? '西' : '东'}`, kind: 'disc', x: G.x + s * px, z: G.z, r: 0.12 });
    }
    // 门楣一根横木，柱头各挑一根短枋，上面架檩，盖一个小草顶
    b.add('wood', pole(v3(G.x - px - 0.36, Y + 2.2, G.z - 0.01), v3(G.x + px + 0.4, Y + 2.23, G.z + 0.01), 0.07, 0.062, 7, 3));
    for (const s of [-1, 1]) b.add('wood', pole(v3(G.x + s * px, Y + gh - 0.04, G.z - 0.5), v3(G.x + s * px, Y + gh - 0.03, G.z + 0.5), 0.055, 0.05, 6));
    for (const z of [-0.42, 0.42]) b.add('wood', pole(v3(G.x - px - 0.34, Y + gh + 0.03, G.z + z), v3(G.x + px + 0.34, Y + gh + 0.04, G.z + z), 0.048, 0.044, 6));
    for (const s of [-1, 1]) for (const k of [-1, 1]) b.add('wood', pole(v3(G.x + s * px, Y + gh + 0.02, G.z + k * 0.44), v3(G.x + s * px, Y + gh + 0.44, G.z), 0.035, 0.03, 5));
    b.add('wood', pole(v3(G.x - px - 0.32, Y + gh + 0.44, G.z), v3(G.x + px + 0.32, Y + gh + 0.44, G.z), 0.04, 0.038, 6));
    const th = thatchRoof({ w: G.w + 1.0, d: 1.36, rise: 0.5, hip: 0, thick: 0.15, sag: 0.12, lift: 0.05, ridgeSag: 0.06, droop: 0.07, courses: 2, step: 0.035, rag: 0.05, cell: 0.09, seed: 31, roll: 0.085, cross: 0, tone: 0.97 });
    b.add('thatch', th.thatch.translate(G.x, Y + gh + 0.16, G.z));
    if (th.bamboo) b.add('bamboo', th.bamboo.translate(G.x, Y + gh + 0.16, G.z));
    // 两扇柴扉（可开合；原点在门轴脚下）：朝院里开着
    const lw = hw - 0.03, L = c.part('gateL', 'wood', wicker(lw, 1.38, -1, 631), v3(G.x - hw, Y + 0.03, G.z - 0.03), new THREE.Euler(0, 1.83, 0));
    L.userData = { open: 1.83, closed: 0, width: lw };
    const Rr = c.part('gateR', 'wood', wicker(lw, 1.38, 1, 632), v3(G.x + hw, Y + 0.03, G.z - 0.03), new THREE.Euler(0, -1.72, 0));
    Rr.userData = { open: -1.72, closed: 0, width: lw };
    c.solid({ id: '柴门·西扇（开着）', kind: 'rect', x: G.x - hw - 0.12, z: G.z - 0.5, w: 0.95, d: 0.08, yaw: 1.83 });
    c.solid({ id: '柴门·东扇（开着）', kind: 'rect', x: G.x + hw + 0.07, z: G.z - 0.5, w: 0.95, d: 0.08, yaw: -1.72 });
    // 门联：两条素木窄板挂在门柱朝外的一面。右（东）「闭门即是深山」，左（西）「读书随处净土」
    const bw = 0.2, bh = 1.26, by = Y + 1.36;
    for (const [s, name] of [[1, 'coupletR'], [-1, 'coupletL']] as Array<[number, string]>) {
      const m = M.mul(M.t(G.x + s * (px - 0.005), by, G.z + 0.118), M.rz(s * 0.012), M.rx(-0.012));
      lab.push(blankUV(dye(wobble(box(bw, bh, 0.022), 0.0012, 3, 640 + s), [0.9, 0.87, 0.79], 1.25), c.blank).applyMatrix4(m));
      lab.push(dye(panel(bw - 0.012, bh - 0.02, c.rect(name)), [0.9, 0.87, 0.79], 1.0).translate(0, 0, 0.0148).applyMatrix4(m));
      obj.push(dye(tube([v3(-0.06, bh / 2, 0), v3(0, bh / 2 + 0.07, -0.02), v3(0.06, bh / 2, 0)], 0.004, 4), INK.hemp, 1.5).applyMatrix4(m));
    }
    c.anchor('couplet', G.x, Y + 1.4, G.z + 0.12, 0);
    c.anchor('gate', G.x, Y, G.z, 0);
  }

  // ———————————— 东厢（灶屋）：两面坡的小草屋，门朝西，关着 ————————————
  {
    const Wg = SITE.wing, w = Wg.w, d = Wg.d, wt = 0.34, wh = 2.2, fl = 0.1, ox = Wg.x, oz = Wg.z;
    b.push(M.t(ox, Y, oz));
    const x0 = w / 2, z0 = d / 2, sky = wh - 0.6, peak = wh + 1.36;
    // 台、墙（南北两山带尖）
    b.add('earth', shade(wobble(sbox(w + 0.5, fl, d + 0.5, 0.6).translate(0, fl / 2, 0), 0.03, 0.7, 81, 50, 0.2), (_x, _y, _z, _nx, ny) => (ny > 0.7 ? 1.05 : 0.95)));
    const dz0 = -0.95, dw = 0.86, dh = 1.72, wz = 1.05, ww = 0.74;
    // 西墙：门洞、小窗
    b.add('earth', earthWall(-x0, -x0 + wt, fl - 0.04, wh, -z0, dz0 - dw / 2, 82, sky, fl));
    b.add('earth', earthWall(-x0, -x0 + wt, fl + dh + 0.1, wh, dz0 - dw / 2, dz0 + dw / 2, 83, sky, fl));
    b.add('earth', earthWall(-x0, -x0 + wt, fl - 0.04, wh, dz0 + dw / 2, wz - ww / 2, 84, sky, fl));
    b.add('earth', earthWall(-x0, -x0 + wt, fl - 0.04, fl + 1.12, wz - ww / 2, wz + ww / 2, 85, sky, fl));
    b.add('earth', earthWall(-x0, -x0 + wt, fl + 1.68, wh, wz - ww / 2, wz + ww / 2, 86, sky, fl));
    b.add('earth', earthWall(-x0, -x0 + wt, fl - 0.04, wh, wz + ww / 2, z0, 87, sky, fl));
    b.add('earth', earthWall(x0 - wt, x0, fl - 0.04, wh, -z0, z0, 88, sky, fl));
    for (const s of [-1, 1]) {
      const g = prism([[-x0 + wt, fl - 0.04], [x0 - wt, fl - 0.04], [x0 - wt, wh], [0, peak], [-x0 + wt, wh]], wt).translate(0, 0, s * (z0 - wt / 2));
      b.add('earth', shade(wobble(g, 0.014, 0.8, 89 + s, 40, 0.5), (_x, y) => 1 - 0.1 * smooth(fl + 0.6, fl, y) - 0.12 * smooth(wh - 0.2, peak, y)));
    }
    // 门（关着的单扇板门）、门框；窗
    const dl = doorLeaf(dw - 0.03, dh - 0.02, -1, 920).map((g) => g.applyMatrix4(M.mul(M.t(-x0 + 0.07, fl + 0.02, dz0 - dw / 2 + 0.015), M.ry(-Math.PI / 2))));
    for (const g of dl) b.add('wood', g);
    for (const k of [-1, 1]) b.add('wood', boxUp(0.16, dh + 0.04, 0.08, 'y').translate(-x0 + 0.06, fl, dz0 + k * (dw / 2 + 0.03)));
    b.add('wood', wobble(box(0.18, 0.12, dw + 0.3, 'z').translate(-x0 + 0.06, fl + dh + 0.07, dz0), 0.004, 3, 921));
    b.add('wood', boxUp(0.12, 0.07, dw, 'z').translate(-x0 + 0.03, fl, dz0));
    const [wd, pp] = lattice(ww, 0.56, wt, 922, 5), wm = M.mul(M.t(-x0 + wt / 2, fl + 1.4, wz), M.ry(-Math.PI / 2));
    for (const g of wd) b.add('wood', g.applyMatrix4(wm));
    for (const g of pp) b.add('paper', g.applyMatrix4(wm));
    // 草顶：屋脊南北向（南头的山面出得少——那里紧挨着一株松）
    const vN = 0.3, vS = 0.1, over = 0.62;
    const th = thatchRoof({ w: d + vN + vS, d: w + over * 2, rise: 1.62, hip: 0, thick: 0.24, sag: 0.2, lift: 0.08, ridgeSag: 0.07, droop: 0.08, courses: 2, step: 0.05, rag: 0.07, cell: c.low ? 0.2 : 0.13, seed: 41, roll: 0.15, tone: 0.96, patches: [{ x: 0.8, z: 1.4, w: 1.1, l: 0.9 }] });
    const rm = M.mul(M.t(0, wh - 0.24, (vS - vN) / 2), M.ry(Math.PI / 2));
    b.add('thatch', th.thatch.applyMatrix4(rm));
    if (th.bamboo) b.add('bamboo', th.bamboo.applyMatrix4(rm));
    for (const s of [-1, 1]) for (let z = -z0 + 0.25; z < z0; z += 0.52) b.add('wood', pole(v3(s * (x0 - 0.5), wh + 0.06, z), v3(s * (x0 + over - 0.18), wh - 0.5, z), 0.032, 0.028, 5));
    // 烟囱：东坡北头一截泥抹的烟筒，顶上扣半只破瓮
    const cx = 0.75, cz = -z0 + 1.0, cy = wh - 0.24 + th.top(cz - (vS - vN) / 2, cx) - 0.1;
    const chim = lathe([[0.21, 0], [0.19, 0.5], [0.17, 0.95], [0.19, 1.0], [0.13, 1.0], [0.13, 0.3]], 7);
    obj.push(dye(at(shade(chim, (_x, y) => 1 - 0.35 * smooth(0.55, 1, y)), cx, cy, cz, 0.3), [0.86, 0.8, 0.72], 1.3));
    obj.push(dye(at(lathe([[0.22, 0.98], [0.2, 1.06], [0.12, 1.14], [0.1, 1.13], [0.17, 1.05], [0.19, 0.98]], 9, 0.4, Math.PI * 1.5), cx, cy, cz), INK.glaze, 1.9));
    b.pop();
    c.anchor('chimney', ox + cx, Y + cy + 1.12, oz + cz, 0);
    c.solid({ id: '东厢', kind: 'rect', x: ox, z: oz, w: w + 0.3, d: d + 0.3 });

    // —— 厢房周围：檐下一垛劈柴、劈柴的墩子与斧；门边一口水缸；屋角一盘石磨 ——
    const wx = ox - x0 - 0.3;
    for (let row = 0; row < 6; row++) for (let i = 0; i < 9 - (row > 3 ? row - 3 : 0); i++) {
      const r = R.r(0.04, 0.062), z = oz + 0.55 + i * 0.118 + (row % 2) * 0.05 + R.pm(0.012), y = Y + 0.06 + row * 0.1 + R.pm(0.008), k = R.r(0.82, 1.08);
      const g = cyl(r, r * R.r(0.85, 1), R.r(0.46, 0.56), 6).rotateZ(Math.PI / 2 + R.pm(0.04)).rotateY(R.pm(0.05));
      // 劈开的柴：端头色浅
      b.add('wood', shade(tint(g, k), (_x, _y, _z, nx2) => (Math.abs(nx2) > 0.7 ? 1.35 : 1)).translate(wx + R.pm(0.02), y, z));
    }
    c.solid({ id: '东厢·柴垛', kind: 'rect', x: wx, z: oz + 1.02, w: 0.6, d: 1.15 });
    const bx = ox - x0 - 1.25, bz = oz + 2.0;
    b.add('wood', at(renormal(wobble(cylUp(0.2, 0.23, 0.36, 9, false, 2), 0.012, 3, 51, 0), 50), bx, Y, bz));
    // 斧：斜砍在墩子上
    obj.push(dye(pole(v3(bx + 0.02, Y + 0.4, bz), v3(bx + 0.34, Y + 0.72, bz + 0.16), 0.016, 0.014, 5), INK.wood, 1.6));
    obj.push(dye(at(prism([[0, 0.05], [0.13, 0.075], [0.13, -0.075], [0, -0.035]], 0.022).rotateX(Math.PI / 2).rotateZ(-2.2), bx + 0.045, Y + 0.415, bz + 0.012, -0.45), INK.iron, 2.2));
    c.solid({ id: '东厢·劈柴墩', kind: 'disc', x: bx, z: bz, r: 0.26 });
    // 水缸：敞口大缸，半块木盖
    const vx = ox - x0 - 0.52, vz = oz - 2.0;
    const vat = lathe([[0.001, 0], [0.22, 0], [0.3, 0.1], [0.4, 0.38], [0.41, 0.62], [0.385, 0.7], [0.4, 0.74], [0.36, 0.74], [0.345, 0.66], [0.36, 0.4], [0.27, 0.14], [0.001, 0.12]], seg(20));
    shade(vat, (x, y, z) => (Math.hypot(x, z) < 0.345 && y > 0.1 ? 0.5 : 1 - 0.1 * smooth(0.3, 0.7, y)));
    obj.push(dye(at(vat, vx, Y, vz), [0.7, 0.66, 0.62], 1.7));
    obj.push(dye(at(cyl(0.34, 0.34, 0.004, seg(20)), vx, Y + 0.6, vz), [0.66, 0.74, 0.8], 1.6));
    const lid = prism([[-0.42, 0], [0.42, 0], [0.36, 0.26], [0.2, 0.4], [-0.2, 0.4], [-0.36, 0.26]], 0.025).rotateX(-Math.PI / 2);
    b.add('wood', at(lid, vx, Y + 0.755, vz + 0.02, 0.2));
    c.solid({ id: '东厢·水缸', kind: 'disc', x: vx, z: vz, r: 0.44 });
    // 石磨：一块底石，上下两扇磨盘，一根木柄
    const mx = ox - x0 - 1.2, mz = oz - 3.55;
    b.add('stone', at(flatRock(52, 0.46, 0.34, 0.42), mx, Y, mz));
    b.add('stone', at(renormal(wobble(cylUp(0.33, 0.34, 0.13, 12), 0.008, 3, 53, 0), 50), mx, Y + 0.33, mz));
    b.add('stone', at(renormal(wobble(cylUp(0.3, 0.31, 0.14, 12), 0.008, 3, 54, 0), 50), mx, Y + 0.47, mz, 0.4));
    b.add('wood', pole(v3(mx + 0.2, Y + 0.56, mz + 0.1), v3(mx + 0.62, Y + 0.6, mz + 0.3), 0.022, 0.02, 5));
    b.add('wood', cylUp(0.02, 0.02, 0.1, 5).translate(mx + 0.2, Y + 0.56, mz + 0.1));
    c.solid({ id: '石磨', kind: 'disc', x: mx, z: mz, r: 0.5 });
  }

  // ———————————— 石桌与四只石凳 ————————————
  {
    const T = SITE.table, th = 0.72;
    b.add('stone', at(rockGeo(61, 0.3, 0.52, 0.28, 2), T.x, Y + 0.02, T.z));
    b.add('stone', at(tint(renormal(wobble(cylUp(0.54, 0.5, 0.115, 14, false, 1), 0.022, 1.6, 62, 0, 0.3), 46), 1.12), T.x, Y + th - 0.115, T.z));
    c.solid({ id: '石桌', kind: 'disc', x: T.x, z: T.z, r: 0.55, top: Y + th });
    c.anchor('table', T.x, Y + th, T.z, -Math.PI / 4);
    // 四只：东北、西北、东南、西南各一
    for (const [i, [sx, sz]] of ([[1, -1], [-1, -1], [1, 1], [-1, 1]] as Array<[number, number]>).entries()) {
      const x = T.x + sx * 0.69 + R.pm(0.03), z = T.z + sz * 0.69 + R.pm(0.03), h = 0.42 + R.pm(0.012);
      b.add('stone', at(flatRock(63 + i, 0.2 + R.pm(0.015), h, 0.19 + R.pm(0.015)), x, Y, z, R() * 6));
      c.solid({ id: `石凳${i + 1}`, kind: 'disc', x, z, r: 0.21, top: Y + h });
      if (sx < 0 && sz > 0) c.anchor('stool', x, Y + h, z, Math.atan2(T.x - x, T.z - z));
    }
  }

  // ———————————— 圭表 ————————————
  {
    const Gm = SITE.gnomon, gw = 0.16, gt = 0.075, top = Y + gt;
    // 圭：一条长石，自表脚朝正北平卧；面上的刻度是图集里的一格（画的右端是表脚）
    lab.push(blankUV(dye(wobble(sbox(gw, gt, Gm.len + 0.1, 0.5).translate(0, gt / 2, -Gm.len / 2 + 0.03), 0.004, 1.5, 71, 40, 0.2), INK.slate, 0.95), c.blank).translate(Gm.x, Y, Gm.z));
    lab.push(dye(decal(Gm.len, gw - 0.012, c.rect('ruler')), INK.slate, 0.8).rotateY(-Math.PI / 2).translate(Gm.x, top + 0.003, Gm.z - Gm.len / 2));
    // 表座、表：一根细长的方石柱，顶上削尖
    b.add('stone', at(renormal(wobble(sbox(0.34, 0.13, 0.3, 0.2).translate(0, 0.065, 0), 0.008, 2, 72, 0), 40), Gm.x, Y, Gm.z + 0.2));
    const sh = lathe([[0.03, 0], [0.027, Gm.h - 0.05], [0.004, Gm.h]], 4, Math.PI / 4);
    obj.push(dye(sh, INK.slate, 1.5).translate(Gm.x, top, Gm.z + 0.022));
    obj.push(dye(box(0.1, 0.03, 0.1).translate(Gm.x, top + 0.015, Gm.z + 0.03), INK.slate, 1.3));
    const a = c.anchor('gnomon', Gm.x, top, Gm.z, -Math.PI / 2);
    a.userData = { h: Gm.h, len: Gm.len, width: gw, top };
    c.solid({ id: '圭表·表', kind: 'disc', x: Gm.x, z: Gm.z + 0.1, r: 0.2 });
    c.solid({ id: '圭表·圭（平卧的石尺，高 0.075）', kind: 'rect', x: Gm.x, z: Gm.z - Gm.len / 2, w: gw, d: Gm.len, top });
  }

  // ———————————— 菊圃的边：卵石一圈，朝路的两边再插一溜弯成小拱的竹篾 ————————————
  {
    const m = SITE.mums, per: Array<[number, number, number, number]> = [[m.x0, m.z0, m.x1, m.z0], [m.x1, m.z0, m.x1, m.z1], [m.x1, m.z1, m.x0, m.z1], [m.x0, m.z1, m.x0, m.z0]];
    per.forEach(([xa, za, xb, zb], side) => {
      const len = Math.hypot(xb - xa, zb - za);
      for (let t = R.r(0, 0.2); t < len; t += R.r(0.26, 0.5)) {
        if (R() < 0.1) continue;
        const x = xa + ((xb - xa) * t) / len + R.pm(0.05), z = za + ((zb - za) * t) / len + R.pm(0.05);
        b.add('stone', at(flatRock(700 + side * 40 + Math.round(t * 7), R.r(0.09, 0.17), R.r(0.06, 0.12), R.r(0.07, 0.12), 1), x, Y - 0.005, z, R() * 6.28));
      }
      if (side === 1 || side === 2) {
        const ux = (xb - xa) / len, uz = (zb - za) / len;
        for (let t = 0.1; t < len - 0.2; t += 0.19) {
          const hh = 0.2 + R.pm(0.03), w2 = 0.15, pts: V3[] = [];
          for (let i = 0; i <= 6; i++) { const u = i / 6, s = -w2 + 2 * w2 * u; pts.push(v3(xa + ux * (t + s) + R.pm(0.004), Y - 0.02 + (hh + 0.02) * Math.sin(Math.PI * u), za + uz * (t + s) + (side === 1 ? 0.07 : 0.07) * (side === 1 ? 1 : 1) * 0)); }
          const off = side === 1 ? [0.09, 0] : [0, 0.09];
          b.add('bamboo', tube(pts, 0.006, 4).translate(off[0], 0, off[1]));
        }
      }
    });
    // 圃边：一只木桶（可提），桶沿搭一把葫芦瓢（可拿）
    const px = m.x1 + 0.45, pz = m.z0 + 2.9, bh = 0.29;
    const pg = bucketGeo(0.135, 0.16, bh, seg(12)).map((g) => g.translate(0, -0.47, 0));
    pg.push(dye(cyl(0.142, 0.142, 0.004, seg(12)).translate(0, -0.47 + 0.2, 0), [0.66, 0.74, 0.8], 1.5));
    // 提梁：两只耳、一道弯梁
    pg.push(dye(tube([v3(-0.158, -0.2, 0), v3(-0.15, -0.08, 0), v3(-0.08, -0.012, 0), v3(0, 0, 0), v3(0.08, -0.012, 0), v3(0.15, -0.08, 0), v3(0.158, -0.2, 0)], 0.009, 5), INK.bamboo, 1.6));
    const pail = c.part('pail', 'obj', pg, v3(px, Y + 0.47, pz), new THREE.Euler(0, 0.5, 0));
    pail.userData = { bottom: -0.47, rim: -0.18, r: 0.16 };
    const gd: Geo[] = [];
    // 葫芦瓢：半个葫芦，细的一头是柄。原点在柄上
    const bowl = lathe([[0.001, -0.062], [0.045, -0.05], [0.074, -0.012], [0.078, 0.02], [0.074, 0.02], [0.07, -0.01], [0.042, -0.044], [0.001, -0.056]], seg(12)).rotateZ(-Math.PI / 2 - 0.25);
    gd.push(dye(bowl.translate(0.19, -0.03, 0), INK.gourd, 1.3));
    gd.push(dye(tube([v3(0.125, -0.012, 0), v3(0.06, 0.004, 0), v3(0, 0, 0), v3(-0.05, 0.008, 0)], (t) => 0.02 - 0.008 * t, 6, true), INK.gourd, 1.4));
    const gourd = c.part('gourd', 'obj', gd, v3(px + 0.08, Y + bh + 0.045, pz + 0.12), new THREE.Euler(0.2, -0.6 + Math.PI, 0.5));
    gourd.userData = { bowl: v3(0.19, -0.03, 0) };
    c.anchor('mumsEdge', px, Y, pz, Math.PI / 2);
    c.solid({ id: '菊圃边的木桶', kind: 'disc', x: px, z: pz, r: 0.2 });
  }

  // ———————————— 屋檐下：扫帚、锄头、斗笠、蓑衣 ————————————
  {
    const H = SITE.hall, dm = hallDims(), zw = H.z + dm.D / 2, fy = Y + dm.fl - 0.02;
    // 扫帚（可拿；原点在握处，+y 沿竿朝上）：靠在门东边的墙上
    {
      const g: Geo[] = [dye(pole(v3(0, -0.78, 0), v3(0, 0.62, 0), 0.013, 0.011, 6, 2), INK.bamboo, 1.35)];
      const RR = rnd(88);
      for (let i = 0; i < (c.low ? 26 : 46); i++) {
        const u = (RR() + RR() + RR()) / 1.5 - 1, v = RR.pm(1), tip = v3(u * 0.24, -1.28 + 0.06 * u * u + RR.r(0, 0.06), v * 0.045), k = RR.r(0.7, 1);
        g.push(dye(tube([v3(u * 0.015, -0.74, v * 0.01), v3(u * 0.11, -1.0, v * 0.035 + RR.pm(0.01)), tip], (t) => 0.004 - 0.0025 * t, 3), INK.bamboo, 1.5 + (1 - k)));
      }
      for (const y of [-0.76, -0.82]) { const pts: V3[] = []; for (let i = 0; i <= 8; i++) pts.push(v3(Math.cos((i / 8) * 6.2832) * 0.026, y, Math.sin((i / 8) * 6.2832) * 0.018)); g.push(dye(tube(pts, 0.004, 4), INK.hemp, 1.8)); }
      const bx = H.x + 1.72, lean = 0.2, foot = v3(bx, fy + 0.02, zw + 0.36);
      // 握处在帚头梢上方 1.28 处；竿朝墙斜过去
      const broom = c.part('broom', 'obj', g, v3(foot.x, foot.y + 1.28 * Math.cos(lean), foot.z - 1.28 * Math.sin(lean)), new THREE.Euler(-lean, 0.15, 0.04));
      broom.userData = { tip: -1.28, top: 0.62 };
      c.anchor('broom', broom.position.x, broom.position.y, broom.position.z, 0);
    }
    // 锄头：靠在西窗边
    {
      const hx = H.x - 1.5, foot = v3(hx, fy, zw + 0.42), top = v3(hx - 0.1, fy + 1.42, zw + 0.03);
      b.add('wood', pole(foot, top, 0.019, 0.016, 6));
      obj.push(dye(at(box(0.13, 0.2, 0.012).translate(0, -0.08, 0.02).applyMatrix4(M.rx(1.25)), foot.x, foot.y + 0.06, foot.z + 0.02, 0.1), INK.iron, 2.1));
    }
    // 斗笠（可拿；原点在帽顶里面，戴的时候正好落在头顶）：挂在门西边墙上的木橛上
    {
      const hat = lathe([[0.27, -0.105], [0.262, -0.1], [0.16, -0.04], [0.06, 0.012], [0.02, 0.03], [0.001, 0.034]], seg(18));
      const g: Geo[] = [dye(shade(hat, (x, _y, z) => 0.9 + 0.1 * Math.sin(Math.atan2(z, x) * 16)), INK.hemp, 1.15)];
      const rim: V3[] = [];
      for (let i = 0; i <= 18; i++) rim.push(v3(Math.cos((i / 18) * 6.2832) * 0.268, -0.103, Math.sin((i / 18) * 6.2832) * 0.268));
      g.push(dye(tube(rim, 0.005, 4), INK.bamboo, 1.7));
      const px = H.x - 1.28, py = Y + dm.fl + 1.62;
      b.add('wood', pole(v3(px, py + 0.02, zw - 0.02), v3(px, py + 0.05, zw + 0.1), 0.012, 0.01, 5));
      const h = c.part('hat', 'obj', g, v3(px, py - 0.09, zw + 0.075), new THREE.Euler(Math.PI / 2 - 0.18, 0, 0.08));
      h.userData = { r: 0.27 };
      // 蓑衣：两层草披，挂在旁边
      const cape = (r0: number, r1: number, y0: number, y1: number) => { const g2 = lathe([[r1, y0], [(r0 + r1) / 2 + 0.02, (y0 + y1) / 2], [r0, y1]], 9, -Math.PI * 0.5 + 0.2, Math.PI - 0.4); return g2; };
      const cx = H.x - 2.06, cy = Y + dm.fl + 1.56;
      b.add('wood', pole(v3(cx, cy + 0.03, zw - 0.02), v3(cx, cy + 0.06, zw + 0.09), 0.012, 0.01, 5));
      b.add('thatch', tint(cape(0.1, 0.3, -0.42, 0), 0.9, 0.88, 0.82).scale(1, 1, 0.42).translate(cx, cy, zw + 0.03));
      b.add('thatch', tint(cape(0.2, 0.34, -0.92, -0.3), 0.86, 0.84, 0.78).scale(1, 1, 0.4).translate(cx, cy, zw + 0.02));
    }
  }

  // ———————————— 晾竿：两副三脚竹架，一根横竿，晾着两件布 ————————————
  {
    const ax = -8.6, az = 4.75, bx = -5.7, bz = 5.05, hh = 1.42;
    for (const [x, z, s] of [[ax, az, 1], [bx, bz, 2]] as Array<[number, number, number]>) {
      const RR = rnd(900 + s);
      for (let i = 0; i < 3; i++) { const a2 = i * 2.094 + s, r = 0.42; b.add('bamboo', pole(v3(x + Math.cos(a2) * r, Y - 0.03, z + Math.sin(a2) * r), v3(x - Math.cos(a2) * 0.07 + RR.pm(0.02), Y + hh + 0.2, z - Math.sin(a2) * 0.07), 0.02, 0.016, 5)); }
      c.solid({ id: '晾竿·竹架', kind: 'disc', x, z, r: 0.45 });
    }
    b.add('bamboo', pole(v3(ax - 0.35, Y + hh + 0.03, az - 0.04), v3(bx + 0.4, Y + hh, bz + 0.04), 0.021, 0.017, 6, 3));
    // 晾着的布：搭在竿上，两片垂下来，略有褶
    const cloth = (x: number, z: number, w: number, l: number, pig: [number, number, number], dn: number, seed: number) => {
      const nx = 6, pts: V3[][] = [], ry = Math.atan2(-(bz - az), bx - ax);
      for (let i = 0; i <= nx; i++) { pts.push([]); for (let j = 0; j <= 8; j++) { const u = (i / nx - 0.5) * w, t = j / 8, side = t < 0.5 ? -1 : 1, down = Math.abs(t - 0.5) * 2; pts[i].push(v3(u, -down * l * (side < 0 ? 0.8 : 1) + 0.022 * (1 - down), side * (0.022 + 0.012 * down) + 0.014 * Math.sin(u * 9 + seed + down * 3) * down)); } }
      obj.push(dye(facing(grid(pts, (i, j) => [i * 0.1, j * 0.1]), () => [0, 0, 1]), pig, dn).applyMatrix4(M.mul(M.t(x, Y + hh + 0.02, z), M.ry(ry))));
    };
    cloth(ax + 0.75, az + 0.08, 0.86, 0.78, INK.indigo, 1.5, 1);
    cloth(ax + 1.9, az + 0.2, 0.7, 0.6, [0.95, 0.93, 0.87], 0.8, 2);
    c.solid({ id: '晾竿', kind: 'rect', x: (ax + bx) / 2, z: (az + bz) / 2, w: 3.4, d: 0.2, yaw: Math.atan2(-(bz - az), bx - ax) });
  }

}
