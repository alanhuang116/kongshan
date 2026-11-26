/**
 * 水边的几样：
 *   小石桥 —— 三条石板并排，南北跨溪，底下两座毛石桥墩，没有栏杆；
 *   汀步   —— 村口溪里的六块踏脚石；
 *   修桥   —— 东头一座正在修的木桥：木桩打好了，桥面铺了一半，岸上码着板、木马、锯与锛；
 *   渡口   —— 一截栈桥，一只渡船（一支橹、一根篙），不远处泊着一只乌篷小渔船；
 *   桔槔   —— 溪边汲水的长杆。
 */
import * as THREE from 'three';
import { M, box, cyl, grid, lathe, prism, rockGeo, shade, tint, type Builder, type Geo } from '../core/geo';
import { BANK_STONES, RIVER_Y, RILLS, SITE, ground, streamAt } from '../site';
import { terrainY } from '../walk';

/** 画出来的地面多高（贴着地铺的东西用它：地网是一米多一格，总图上的地势在格与格之间会低一点） */
const landY = (x: number, z: number) => Math.max(ground(x, z), terrainY(x, z));
import { INK, beam, dye, facing, flatRock, pole, renormal, rnd, sbox, tube, v3, wobble, type Ctx, type V3 } from './kit';
import { bucketGeo } from './yard';

const at = (g: Geo, x: number, y: number, z: number, ry = 0) => g.applyMatrix4(M.mul(M.t(x, y, z), M.ry(ry)));

/**
 * 一只平底木船的船身（原点在船底正中，船头朝 +z，底在 y=0）：外壳、内壳、船舷的一圈、两头的挡板、舱底板、几道横梁。
 * 都是木（wood 材质）。
 */
export function hull(len: number, beam_: number, depth: number, seed: number, thwarts: number[] = [-0.45, 0, 0.45]): Geo[] {
  const n = 12, gs: Geo[] = [], th = 0.045;
  const hb = (s: number) => (beam_ / 2) * (1 - 0.5 * Math.pow(Math.abs(s), 2.4));
  const keel = (s: number) => depth * (s > 0 ? 0.62 : 0.5) * Math.pow(Math.abs(s), 2.6);
  const sheer = (s: number) => depth + 0.2 * depth * Math.pow(Math.abs(s), 2) * (s > 0 ? 1.5 : 1);
  const sec = (s: number, inset: number): V3[] => {
    const b = hb(s) - inset, k = keel(s) + inset * 1.2, g = sheer(s), z = (s * len) / 2;
    return [v3(-b, g, z), v3(-b * 0.9, k + (g - k) * 0.42, z), v3(-b * 0.66, k, z), v3(b * 0.66, k, z), v3(b * 0.9, k + (g - k) * 0.42, z), v3(b, g, z)];
  };
  const st: number[] = [];
  for (let i = 0; i <= n; i++) st.push(-1 + (2 * i) / n);
  const outer = st.map((s) => sec(s, 0)), inner = st.map((s) => sec(s, th));
  gs.push(facing(grid(outer, (i, j) => [j * 0.3, (st[i] * len) / 2]), (x, y) => [x, y < depth * 0.3 ? -1 : 0, 0]));
  gs.push(tint(facing(grid(inner, (i, j) => [j * 0.3 + 2, (st[i] * len) / 2]), (x, y) => [-x, y < depth * 0.3 ? 1 : 0.2, 0]), 0.8));
  // 船舷上沿
  for (const e of [0, 5]) gs.push(facing(grid(st.map((_s, i) => [outer[i][e], inner[i][e].clone().setY(outer[i][e].y)]), (i, j) => [j * 0.05, (st[i] * len) / 2]), () => [0, 1, 0]));
  // 两头的挡板（平头）
  for (const s of [-1, 1]) {
    const o = sec(s, 0), p: Array<[number, number]> = o.map((q) => [q.x, q.y]);
    gs.push(prism(p, 0.05).translate(0, 0, (s * len) / 2 - s * 0.02));
  }
  // 舱底板、横梁
  gs.push(tint(box(beam_ * 0.62, 0.03, len * 0.78, 'z').translate(0, 0.075, 0), 0.86));
  for (const t of thwarts) { const s = t * 2 * 0.5, b2 = hb(s) - 0.02; gs.push(wobble(box(b2 * 2, 0.04, 0.2, 'x').translate(0, depth * 0.7, (s * len) / 2), 0.004, 3, seed + t * 10)); }
  return gs;
}

export function buildWaterside(c: Ctx, sub?: string[]): void {
  const on = (k: string) => !sub || sub.includes(k);
  if (on('bridge')) stoneBridge(c);
  if (on('stones')) steppingStones(c);
  if (on('plank')) plankBridge(c);
  if (on('board')) boardBridge(c);
  if (on('ferry')) ferry(c);
  if (on('sweep')) wellSweep(c);
  if (on('ditch')) ditch(c);
  if (on('bank')) bankStones(c);
}

// ———————————— 小水：渠、泉、门前沟（地不挖，水贴着地面铺，两边砌一溜小石） ————————————
/**
 * 沿折线 pts 铺一道小水：水是留白（比纸略冷），两边淡一点；水里几笔顺流的淡墨纹；两边一溜半埋的小石头。
 * w 水宽（米）；skip(x, z) 为真的那一段不铺（涵洞底下）；lift 水面比地高多少。全进 b 这一摊的 obj、stone（不另添绘制）。
 */
export function rill(b: Builder, pts: Array<[number, number]>, w: number, seed: number, o: { skip?: (x: number, z: number) => boolean; lift?: number; stones?: boolean } = {}): void {
  const R = rnd(seed), lift = o.lift ?? 0.035, step = 0.32;
  // 按长度重新取点
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.max(2, Math.ceil(L / step));
  const at = (s: number): [number, number] => { let i = 0; while (i < cum.length - 2 && cum[i + 1] < s) i++; const t = (s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]); return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; };
  const S: Array<{ x: number; z: number; nx: number; nz: number; skip: boolean }> = [];
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n, [x, z] = at(s), [ax, az] = at(Math.max(0, s - 0.2)), [bx, bz] = at(Math.min(L, s + 0.2)), l = Math.hypot(bx - ax, bz - az) || 1;
    S.push({ x, z, nx: -(bz - az) / l, nz: (bx - ax) / l, skip: !!o.skip?.(x, z) });
  }
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  const WATER: RGB3 = [0.9, 0.94, 0.975], EDGE: RGB3 = [0.8, 0.86, 0.9], LINE: RGB3 = [0.66, 0.72, 0.78];
  const vtx = (x: number, z: number, c: RGB3, u: number, v: number) => { pos.push(x, landY(x, z) + lift, z); nor.push(0, 1, 0); uv.push(u, v); col.push(c[0], c[1], c[2]); };
  const quad = (a: [number, number, RGB3], bq: [number, number, RGB3], cq: [number, number, RGB3], d: [number, number, RGB3], v0: number) => { for (const [p, u] of [[a, 0], [bq, 1], [cq, 1], [a, 0], [cq, 1], [d, 0]] as Array<[[number, number, RGB3], number]>) vtx(p[0], p[1], p[2], u, v0); };
  for (let i = 0; i < n; i++) {
    const p = S[i], q = S[i + 1];
    if (p.skip || q.skip) continue;
    const hw = w / 2, wob = (k: number) => 1 + 0.12 * Math.sin(k * 1.7 + seed);
    const pl: [number, number, RGB3] = [p.x + p.nx * hw * wob(i), p.z + p.nz * hw * wob(i), EDGE], pc: [number, number, RGB3] = [p.x, p.z, WATER], pr: [number, number, RGB3] = [p.x - p.nx * hw * wob(i + 9), p.z - p.nz * hw * wob(i + 9), EDGE];
    const ql: [number, number, RGB3] = [q.x + q.nx * hw * wob(i + 1), q.z + q.nz * hw * wob(i + 1), EDGE], qc: [number, number, RGB3] = [q.x, q.z, WATER], qr: [number, number, RGB3] = [q.x - q.nx * hw * wob(i + 10), q.z - q.nz * hw * wob(i + 10), EDGE];
    quad(pl, pc, qc, ql, i * step); quad(pc, pr, qr, qc, i * step);
    // 顺流的淡墨纹：一段有、一段没有
    if ((i + seed) % 3 !== 0) { const off = (i % 2 ? 0.22 : -0.18) * w, lw = 0.018; quad([p.x + p.nx * (off + lw), p.z + p.nz * (off + lw), LINE], [p.x + p.nx * (off - lw), p.z + p.nz * (off - lw), LINE], [q.x + q.nx * (off - lw), q.z + q.nz * (off - lw), LINE], [q.x + q.nx * (off + lw), q.z + q.nz * (off + lw), LINE], i * step); for (let k = pos.length - 18; k < pos.length; k += 3) pos[k + 1] += 0.004; }
  }
  if (pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    b.add('obj', g);
  }
  // 两边砌的小石头（半埋）
  if (o.stones === false) return;
  for (let i = 0; i <= n; i += 1) {
    const p = S[i];
    if (p.skip) continue;
    for (const sd of [-1, 1]) {
      if (R() < 0.12) continue;
      const off = w / 2 + 0.07 + R.r(0, 0.05), x = p.x + p.nx * off * sd, z = p.z + p.nz * off * sd, rx = R.r(0.1, 0.16);
      b.add('stone', at3(flatRock(seed * 7 + i * 2 + (sd > 0 ? 1 : 0), rx, R.r(0.06, 0.11), R.r(0.08, 0.12), 1), x, landY(x, z) - 0.025, z, R.r(0, 6.28)));
    }
  }
}
type RGB3 = [number, number, number];
const at3 = (g: Geo, x: number, y: number, z: number, ry = 0) => g.applyMatrix4(M.mul(M.t(x, y, z), M.ry(ry)));

/**
 * 渠与涵洞（观象「师」）：石桥南头往东，从溪里引出一道石砌的小渠，钻进溪南小路底下的涵洞，路南头冒出来，顺着田边往南流进田头。
 * 涵洞两口各是两块立石、一块横石，当中一个黑洞；路面不动（水在路底下流着，看不见）。
 */
function ditch(c: Ctx): void {
  const D = RILLS.ditch, C = RILLS.culvert, b = c.far;
  rill(b, D, 0.62, 41, { skip: (x, z) => Math.abs(x - C.x) < 1 && z > C.z0 + 0.12 && z < C.z1 - 0.12 });
  for (const [z, face] of [[C.z0, Math.PI], [C.z1, 0]] as Array<[number, number]>) {
    const gy = landY(C.x, z), R = rnd(4200 + Math.round(z));
    b.push(M.trs(C.x, gy, z, face));
    // 立石、横石都半埋在路边的土里，只露出一掌高；当中一道黑的洞口，水从这里钻进路底下
    for (const s of [-1, 1]) b.add('stone', renormal(wobble(sbox(0.24, 0.3, 0.3, 0.2).translate(s * 0.42, -0.04, 0.02), 0.012, 4, 4210 + s + z, 0), 40));
    b.add('stone', renormal(wobble(sbox(1.18, 0.11, 0.4, 0.25).translate(0, 0.13, 0.05), 0.012, 3, 4214 + z, 0), 40));
    b.add('dark', box(0.6, 0.15, 0.04).translate(0, 0.0, -0.11));
    for (let i = 0; i < 3; i++) b.add('stone', at3(flatRock(4220 + i + Math.round(z), R.r(0.12, 0.18), 0.09, R.r(0.1, 0.14), 1), R.pm(0.7), -0.03, 0.3 + R.r(0, 0.2), R.r(0, 6)));
    b.pop();
    c.solid({ id: '渠·涵洞口', kind: 'rect', x: C.x, z: z + (face ? -0.05 : 0.05), w: 1.25, d: 0.32, yaw: face });
  }
  c.anchor('culvert', C.x, landY(C.x, C.z1), C.z1, 0);
}

/** 门前塘北岸叠的一溜石（观象「咸」）：大的在外、小的在里，半埋在岸上；大的挡路 */
function bankStones(c: Ctx): void {
  const b = c.home, R = rnd(2520);
  BANK_STONES.forEach(([x, z, r], i) => {
    const h = r * R.r(0.55, 0.85), g = rockGeo(2530 + i, r * R.r(0.95, 1.35), h, r);
    b.add('stone', g.applyMatrix4(M.mul(M.t(x, landY(x, z) - h * 0.2, z), M.ry(R.r(0, 6.28)))));
    if (r > 0.45) c.solid({ id: '池岸叠石', kind: 'disc', x, z, r: r * 0.82 });
  });
}

// ———————————— 小石桥 ————————————
function stoneBridge(c: Ctx): void {
  const B = SITE.bridge, b = c.home, R = rnd(8101), st = streamAt(B.x, B.z), bank = st.y + 0.55, top = bank + 0.25, th = 0.2;
  const lw = (B.w - 0.05) / 3;
  // 三条石板：每条三块，接缝压在桥墩上（错开一点）
  for (let i = 0; i < 3; i++) {
    const x = B.x + (i - 1) * (lw + 0.025), j1 = -1.2 + R.pm(0.14), j2 = 1.2 + R.pm(0.14), ends = [-B.len / 2 - R.r(0, 0.12), j1, j2, B.len / 2 + R.r(0, 0.12)];
    for (let k = 0; k < 3; k++) {
      const l = ends[k + 1] - ends[k] - 0.025, t2 = th + R.r(-0.02, 0.05), g = sbox(lw - R.r(0, 0.03), t2, l, 0.4).translate(0, -t2 / 2, 0);
      b.add('stone', tint(at(wobble(g, 0.024, 1.5, 810 + i * 3 + k, 40, 0.45), x + R.pm(0.015), top + R.pm(0.012), B.z + (ends[k] + ends[k + 1]) / 2, R.pm(0.012)), R.r(1.05, 1.16)));
    }
  }
  // 两座桥墩：溪里各垒两块大石，上面横一条石梁
  for (const s of [-1, 1]) {
    const z = B.z + s * 1.2;
    for (const e of [-1, 1]) { const x = B.x + e * 0.52, bed = ground(x, z); b.add('stone', at(flatRock(820 + s * 2 + e, 0.5, top - th - 0.16 - bed + 0.08, 0.44), x, bed - 0.08, z, R() * 6)); }
    b.add('stone', at(renormal(wobble(sbox(B.w + 0.08, 0.17, 0.66, 0.4).translate(0, -0.085, 0), 0.03, 1.4, 830 + s, 0, 0.5), 42), B.x, top - th - 0.02, z));
  }
  // 两岸：石板头底下各垫一条石，桥头各一块踏步石
  for (const s of [-1, 1]) {
    const z = B.z + s * (B.len / 2 - 0.25);
    b.add('stone', at(renormal(wobble(sbox(B.w + 0.3, 0.3, 0.6, 0.5).translate(0, -0.15, 0), 0.02, 1.2, 840 + s, 0, 0.5), 42), B.x, top - th, z));
    const zs = B.z + s * (B.len / 2 + 0.34), gs = ground(B.x, zs);
    b.add('stone', at(flatRock(845 + s, 0.62, top - 0.12 - gs + 0.03, 0.3), B.x + 0.04 * s, gs - 0.03, zs, 0.05 * s));
    c.solid({ id: `石桥·桥头踏步石${s < 0 ? '北' : '南'}`, kind: 'rect', x: B.x, z: zs, w: 1.2, d: 0.56, top: top - 0.12, walk: true });
    // 桥头两侧各一块护石
    for (const e of [-1, 1]) { const x = B.x + e * (B.w / 2 + 0.42), zz = B.z + s * (B.len / 2 - 0.5), g0 = ground(x, zz); b.add('stone', at(rockGeo(850 + s * 2 + e, 0.34, 0.3, 0.3, 2), x, g0 - 0.05, zz, R() * 6)); }
  }
  c.solid({ id: '石桥·桥面', kind: 'rect', x: B.x, z: B.z, w: B.w, d: B.len, top, walk: true });
  c.anchor('bridge', B.x, top, B.z, 0);
}

// ———————————— 汀步 ————————————
function steppingStones(c: Ctx): void {
  const S = SITE.stones, b = c.village, R = rnd(8203), st = streamAt(S.x, S.z), top = st.y + 0.12;
  // 沿着「踏石」那条小路过溪：南岸直着来，过了溪心略向东北偏
  const px = (z: number) => S.x + (z < S.z ? (S.z - z) / 6.1 : 0);
  // 找水面的两沿
  let zs = S.z, zn = S.z;
  while (zs < S.z + 6 && ground(px(zs), zs) < st.y - 0.02) zs += 0.05;
  while (zn > S.z - 6 && ground(px(zn), zn) < st.y - 0.02) zn -= 0.05;
  const n = 6, gap = (zs - zn) / n;
  for (let i = 0; i < n; i++) {
    const z = zn + gap * (i + 0.5) + R.pm(0.04), x = px(z) + (i % 2 ? 0.07 : -0.07) + R.pm(0.03), rx = R.r(0.5, 0.6), rz = R.r(0.44, 0.52), t = top + R.pm(0.012), hh = 0.42;
    // 大半没在水里的卵石：水面上只露一个平顶
    b.add('stone', tint(at(flatRock(8210 + i, rx, hh, rz, 2, 0.62), x, t - hh, z, R() * 6.28), 1.08));
    c.solid({ id: `汀步${i + 1}`, kind: 'disc', x, z, r: Math.min(rx, rz) * 0.6, top: t, walk: true });
  }
  c.anchor('stones', px(S.z), top, S.z, 0);
}

// ———————————— 板桥（桃林的路在这里过溪） ————————————
/**
 * 三排木桩、两根纵梁、一层横铺的桥板，下游那一边一道扶手；两头各一块踏步石。桥身（自己的 z 轴）沿溪的法向，横跨溪。
 * 铺得齐整（与东头那座修着的木桥一个做法，只是修好了）；桥面能走（屋舍报上去 walk）。
 */
function boardBridge(c: Ctx): void {
  const P = SITE.board, b = c.village, R = rnd(8411), st = streamAt(P.x, P.z), bank = st.y + 0.55, top = bank + 0.28, half = P.len / 2, yaw = P.yaw;
  const W = (lx: number, lz: number): [number, number] => [P.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), P.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const gl = (lx: number, lz: number) => { const [x, z] = W(lx, lz); return ground(x, z); };
  b.push(M.mul(M.t(P.x, 0, P.z), M.ry(yaw)));
  const capY = top - 0.045 - 0.14 - 0.075;
  // 三排木桩（每排两根，略向里收），桩顶一根横梁
  for (const t of [-2.1, 0, 2.1]) {
    for (const e of [-1, 1]) { const bed = gl(e * 0.62, t); b.add('wood', renormal(wobble(pole(v3(e * 0.66, bed - 0.35, t), v3(e * 0.56, capY + 0.02 + R.r(0, 0.06), t + R.pm(0.03)), 0.085, 0.07, 8, 4), 0.01, 1.5, 93 + t + e, 0), 60)); const [x, z] = W(e * 0.61, t); c.solid({ id: '板桥·木桩', kind: 'disc', x, z, r: 0.09 }); }
    b.add('wood', pole(v3(-0.95, capY, t), v3(0.95, capY + 0.01, t), 0.072, 0.068, 7, 2));
  }
  // 两岸的枕木、两根通长的纵梁
  for (const s of [-1, 1]) b.add('wood', pole(v3(-0.95, capY + 0.02, s * (half - 0.12)), v3(0.95, capY + 0.02, s * (half - 0.12)), 0.078, 0.072, 7, 2));
  const sy = capY + 0.075 + 0.07;
  for (const e of [-0.46, 0.46]) b.add('wood', pole(v3(e, sy, -half - 0.1), v3(e, sy, half + 0.1), 0.07, 0.064, 7, 4));
  // 桥板：横铺，一块挨一块，宽窄、新旧略有不同
  for (let z = -half + 0.11; z < half - 0.05; z += 0.235) {
    const k = R.r(0.88, 1.05);
    b.add('wood', tint(at(wobble(box(1.5 + R.pm(0.05), 0.045, 0.215, 'x'), 0.004, 2, 940 + z * 9, 40, 0.5), R.pm(0.025), top - 0.0225, z, R.pm(0.015)), k, k * 0.99, k * 0.96));
  }
  // 扶手：下游那一边（溪往哪边流，就在哪边）四根立柱、一根横木
  {
    // 桥自己的 x 轴在世界里朝 (cos yaw, −sin yaw)：溪的流向落在哪一边，那一边就是下游
    const side = (st.tx * Math.cos(yaw) - st.tz * Math.sin(yaw)) >= 0 ? 1 : -1, ex = side * 0.7;
    for (const t of [-half + 0.25, -1.05, 1.05, half - 0.25]) b.add('wood', pole(v3(ex, top - 0.02, t), v3(ex + side * 0.02, top + 0.78, t), 0.04, 0.036, 6, 2));
    b.add('wood', renormal(wobble(pole(v3(ex, top + 0.74, -half + 0.2), v3(ex, top + 0.76, half - 0.2), 0.036, 0.033, 6, 5), 0.008, 2, 951, 0), 50));
    const [x, z] = W(ex, 0);
    c.solid({ id: '板桥·扶手', kind: 'rect', x, z, w: 0.1, d: P.len - 0.3, yaw });
  }
  b.pop();
  // 两头各一块踏步石（从岸上一步迈上桥面）
  for (const s of [-1, 1]) {
    const [x, z] = W(0, s * (half + 0.34)), g = ground(x, z);
    b.add('stone', at(flatRock(955 + s, 0.62, top - 0.12 - g + 0.03, 0.3), x, g - 0.03, z, yaw));
    c.solid({ id: `板桥·桥头踏步石${s < 0 ? '一' : '二'}`, kind: 'rect', x, z, w: 1.2, d: 0.56, yaw, top: top - 0.12, walk: true });
  }
  c.solid({ id: '板桥·桥面', kind: 'rect', x: P.x, z: P.z, w: 1.5, d: P.len, yaw, top, walk: true });
  c.anchor('boardBridge', P.x, top, P.z, yaw);
}

// ———————————— 修着的木桥 ————————————
function plankBridge(c: Ctx): void {
  const P = SITE.plank, b = c.village, R = rnd(8307), st = streamAt(P.x, P.z), bank = st.y + 0.55, top = bank + 0.3, half = P.len / 2;
  // 桥要横跨溪：总图给的 yaw 有两种读法（+z 转到 (sin, cos) 或 (−sin, cos)），取与溪流更垂直的那一种
  const nx = -st.tz, nz = st.tx, a1: [number, number] = [Math.sin(P.yaw), Math.cos(P.yaw)], a2: [number, number] = [-Math.sin(P.yaw), Math.cos(P.yaw)];
  const u = Math.abs(a1[0] * nx + a1[1] * nz) >= Math.abs(a2[0] * nx + a2[1] * nz) ? a1 : a2, yaw = Math.atan2(u[0], u[1]);
  const W = (lx: number, lz: number): [number, number] => [P.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), P.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const gl = (lx: number, lz: number) => { const [x, z] = W(lx, lz); return ground(x, z); };
  b.push(M.mul(M.t(P.x, 0, P.z), M.ry(yaw)));
  const obj = { push: (...gs: Geo[]) => { for (const g of gs) b.add('obj', g); } };
  // 三排木桩（每排两根，略向里收），桩顶一根横梁
  const capY = top - 0.045 - 0.14 - 0.075;
  for (const t of [-2.05, 0, 2.05]) {
    for (const e of [-1, 1]) { const bed = gl(e * 0.66, t); b.add('wood', renormal(wobble(pole(v3(e * 0.7, bed - 0.35, t), v3(e * 0.6, capY + 0.02 + R.r(0, 0.1), t + R.pm(0.03)), 0.09, 0.075, 8, 4), 0.01, 1.5, 83 + t + e, 0), 60)); const [x, z] = W(e * 0.65, t); c.solid({ id: '修桥·木桩', kind: 'disc', x, z, r: 0.1 }); }
    b.add('wood', pole(v3(-1.0, capY, t), v3(1.0, capY + 0.01, t), 0.075, 0.07, 7, 2));
  }
  // 两岸的枕木
  for (const s of [-1, 1]) b.add('wood', pole(v3(-1.05, capY + 0.02, s * (half - 0.12)), v3(1.05, capY + 0.02, s * (half - 0.12)), 0.08, 0.075, 7, 2));
  // 纵梁：西边一根通长架好了，东边那根只架了南边一半（北半根还躺在岸上）
  const sy = capY + 0.075 + 0.07;
  b.add('wood', pole(v3(-0.5, sy, -half - 0.1), v3(-0.5, sy, half + 0.12), 0.072, 0.066, 7, 4));
  b.add('wood', pole(v3(0.5, sy, -0.3), v3(0.5, sy, half + 0.1), 0.07, 0.066, 7, 3));
  { const g0 = gl(1.9, -half - 1.2); b.add('wood', pole(v3(1.5, g0 + 0.08, -half - 2.6), v3(2.3, g0 + 0.09, -half + 0.6), 0.07, 0.064, 7, 3)); }
  // 桥面板：从南岸铺过来，铺了一半多；最后几块还没钉牢，歪着
  let last = half;
  for (let z = half - 0.11; z > -0.25; z -= 0.235) {
    const loose = z < 0.5, k = R.r(0.86, 1.06);
    b.add('wood', tint(at(wobble(box(1.62 + R.pm(0.05), 0.045, 0.215, 'x'), 0.004, 2, 840 + z * 9, 40, 0.5), R.pm(0.03), top - 0.0225 + (loose ? 0.012 : 0), z, loose ? R.pm(0.09) : R.pm(0.012)), k, k * 0.99, k * 0.96));
    last = z;
  }
  { const [x, z] = W(0, (half + last) / 2); c.solid({ id: '修桥·铺好的一半桥面', kind: 'rect', x, z, w: 1.62, d: half - last + 0.2, yaw, top, walk: false }); }
  // 南岸：一摞板、木马上架着一块正在锯的板、框锯、锛、木槌、一盘绳
  const g1 = gl(1.95, half + 1.5);
  for (let i = 0; i < 7; i++) b.add('wood', tint(at(box(1.66, 0.045, 0.22, 'x'), 1.95 + R.pm(0.05), g1 + 0.07 + i * 0.047, half + 1.5 + R.pm(0.03), 1.45 + R.pm(0.06)), R.r(0.9, 1.08)));
  for (const s of [-1, 1]) b.add('wood', pole(v3(1.95 - 0.1, g1 + 0.03, half + 1.5 + s * 0.55), v3(1.95 + 0.14, g1 + 0.03, half + 1.5 + s * 0.55), 0.045, 0.045, 6));
  { const [x, z] = W(1.95, half + 1.5); c.solid({ id: '修桥·板垛', kind: 'rect', x, z, w: 0.4, d: 1.7, yaw }); }
  // 锛：搁在板垛上（一根弯柄、一片横刃）
  obj.push(dye(pole(v3(1.8, g1 + 0.43, half + 1.2), v3(2.12, g1 + 0.47, half + 1.75), 0.016, 0.014, 5), INK.wood, 1.6));
  obj.push(dye(at(box(0.1, 0.02, 0.17).applyMatrix4(M.rx(0.5)), 1.8, g1 + 0.47, half + 1.17, 0.5), INK.iron, 2.2));
  // 木马：两副叉腿、一根横梁；上面一块锯了一半的板
  const hx = -1.9, hz = half + 1.9, g2 = gl(hx, hz), hh = 0.62;
  for (const s of [-1, 1]) {
    const z = hz + s * 0.62;
    for (const e of [-1, 1]) b.add('wood', pole(v3(hx + e * 0.36, g2 - 0.02, z + s * 0.1), v3(hx - e * 0.06, g2 + hh + 0.06, z), 0.03, 0.026, 6));
  }
  b.add('wood', pole(v3(hx, g2 + hh - 0.01, hz - 0.85), v3(hx, g2 + hh, hz + 0.85), 0.05, 0.047, 7, 2));
  b.add('wood', at(box(0.24, 0.045, 1.9, 'z'), hx + 0.03, g2 + hh + 0.075, hz + 0.25, 0.05));
  { const [x, z] = W(hx, hz); c.solid({ id: '修桥·木马', kind: 'rect', x, z, w: 0.8, d: 1.9, yaw }); }
  // 框锯：一个工字木框、一根锯条、一道绞绳，斜靠在木马上
  {
    const m = M.mul(M.t(hx - 0.5, g2 + 0.02, hz - 0.2), M.ry(0.3), M.rz(-0.34));
    const fr: Geo[] = [pole(v3(0, 0, -0.33), v3(0, 0.66, -0.33), 0.017, 0.017, 5), pole(v3(0, 0, 0.33), v3(0, 0.66, 0.33), 0.017, 0.017, 5), pole(v3(0, 0.33, -0.33), v3(0, 0.33, 0.33), 0.016, 0.016, 5)];
    for (const g of fr) b.add('wood', g.applyMatrix4(m));
    obj.push(dye(box(0.003, 0.036, 0.66).translate(0, 0.03, 0), INK.iron, 2).applyMatrix4(m));
    obj.push(dye(pole(v3(0, 0.63, -0.33), v3(0, 0.63, 0.33), 0.005, 0.005, 4), INK.hemp, 1.6).applyMatrix4(m));
  }
  // 木槌、一盘绳
  b.add('wood', at(cyl(0.05, 0.05, 0.16, 7).rotateZ(Math.PI / 2), hx + 0.75, g2 + 0.05, hz - 0.5, 0.4));
  b.add('wood', pole(v3(hx + 0.75, g2 + 0.05, hz - 0.5), v3(hx + 0.95, g2 + 0.07, hz - 0.2), 0.014, 0.014, 5));
  for (let i = 0; i < 4; i++) { const pts: V3[] = [], r = 0.2 - i * 0.012; for (let k = 0; k <= 12; k++) pts.push(v3(0.9 + Math.cos((k / 12) * 6.2832) * r, g1 + 0.02 + i * 0.022, half + 0.55 + Math.sin((k / 12) * 6.2832) * r)); obj.push(dye(tube(pts, 0.012, 4), INK.hemp, 1.5)); }
  b.pop();
  { const [x, z] = W(-1.1, half + 1.9); c.anchor('plank', x, gl(-1.1, half + 1.9), z, yaw); }
}

// ———————————— 渡口 ————————————
function ferry(c: Ctx): void {
  const F = SITE.ferry, b = c.far, R = rnd(8401), obj = { push: (...gs: Geo[]) => { for (const g of gs) b.add('obj', g); } };
  // 岸朝哪边下水：取地势下降的方向
  const gx = ground(F.x + 2, F.z) - ground(F.x - 2, F.z), gz = ground(F.x, F.z + 2) - ground(F.x, F.z - 2), gl = Math.hypot(gx, gz) || 1;
  const yaw = Math.atan2(-gx / gl, -gz / gl);
  const W = (lx: number, lz: number): [number, number] => [F.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), F.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const G = (lx: number, lz: number) => { const [x, z] = W(lx, lz); return ground(x, z); };
  b.push(M.mul(M.t(F.x, 0, F.z), M.ry(yaw)));
  // 栈桥：伸到水够深的地方（约半尺深）为止
  let L = 4;
  while (L < 11 && G(0, L) > RIVER_Y - 0.3) L += 0.25;
  const dy = RIVER_Y + 0.4, jw = 1.15;
  for (let z = -0.6; z <= L + 0.01; z += 1.55) for (const e of [-1, 1]) {
    const gy = G(e * 0.5, z);
    b.add('wood', renormal(wobble(pole(v3(e * 0.52, gy - 0.5, z), v3(e * 0.5, dy + R.r(0.02, 0.3), z + R.pm(0.03)), 0.07, 0.06, 7, 3), 0.008, 1.5, 84 + z + e, 0), 60));
    if (e < 0) b.add('wood', pole(v3(-0.66, dy - 0.11, z), v3(0.66, dy - 0.11, z), 0.055, 0.05, 6));
  }
  for (const e of [-1, 1]) b.add('wood', pole(v3(e * 0.36, dy - 0.045 - 0.05, -0.8), v3(e * 0.36, dy - 0.045 - 0.05, L + 0.15), 0.05, 0.046, 6, 3));
  for (let z = -0.75; z < L + 0.1; z += 0.2) { const k = R.r(0.86, 1.07); b.add('wood', tint(at(wobble(box(jw + R.pm(0.07), 0.04, 0.185, 'x'), 0.004, 2, 850 + z * 7, 40, 0.5), R.pm(0.025), dy - 0.02, z, R.pm(0.02)), k, k, k * 0.97)); }
  { const [x, z] = W(0, (L - 0.75) / 2); c.solid({ id: '渡口·栈桥', kind: 'rect', x, z, w: jw, d: L + 0.95, yaw, top: dy, walk: true }); }
  { const [x, z] = W(0, L - 0.7); c.anchor('boat', x, dy, z, yaw + Math.PI); }
  // 渡船：泊在栈桥头外面，船头的缆系在桥头的桩上
  {
    const len = 6.4, bz = L + 0.45 + len / 2, by = RIVER_Y - 0.17, m = M.mul(M.t(0.25, by, bz), M.ry(Math.PI + 0.12));
    for (const g of hull(len, 1.78, 0.5, 31)) b.add('wood', g.applyMatrix4(m));
    // 橹：架在船尾，橹叶斜斜入水
    const stern = v3(0.3, 0.62, len / 2 - 0.25);
    b.add('wood', pole(v3(0.3, 0.5, len / 2 - 0.3), v3(0.3, 0.74, len / 2 - 0.3), 0.022, 0.02, 5).applyMatrix4(m));
    b.add('wood', pole(v3(0.12, 1.05, len / 2 - 1.75), stern.clone().add(v3(0.03, 0.06, 0.12)), 0.026, 0.03, 6).applyMatrix4(m));
    b.add('wood', beam(stern.clone().add(v3(0.03, 0.06, 0.1)), v3(0.62, -0.32, len / 2 + 1.9), 0.13, 0.024).applyMatrix4(m));
    obj.push(dye(pole(v3(0.12, 1.05, len / 2 - 1.75), v3(0.1, 0.36, len / 2 - 1.9), 0.007, 0.007, 4), INK.hemp, 1.5).applyMatrix4(m));
    // 篙：横搁在梁上，一头伸出船头
    b.add('bamboo', pole(v3(-0.45, 0.4, -len / 2 - 0.9), v3(-0.38, 0.39, len / 2 - 1.4), 0.024, 0.017, 6, 3).applyMatrix4(m));
    // 缆
    obj.push(dye(tube([v3(0.5, dy + 0.12, L), v3(0.42, dy - 0.2, L + 0.3), v3(0.3, by + 0.6, L + 0.62)], 0.012, 4), INK.hemp, 1.5));
    const [x, z] = W(0.25, bz);
    c.solid({ id: '渡口·渡船', kind: 'rect', x, z, w: 1.8, d: len, yaw: yaw + 0.12, top: by + 0.1 });
    c.anchor('ferryBoat', x, by + 0.11, z, yaw + 0.12);
  }
  // 乌篷小渔船：泊在东边不远，船头系在一根插在泥里的竹篙上
  {
    const len = 5.1, lx = 7.2, lz = L + 0.4, by = RIVER_Y - 0.14, m = M.mul(M.t(lx, by, lz), M.ry(-0.95));
    for (const g of hull(len, 1.3, 0.42, 37, [-0.6, 0.58])) b.add('wood', g.applyMatrix4(m));
    // 篷：竹篾编的、刷过桐油的黑篷，罩着中间一段
    const nA = 8, r = 0.69, pts: V3[][] = [];
    for (let i = 0; i <= 5; i++) { pts.push([]); const z = -0.95 + (1.9 * i) / 5; for (let k = 0; k <= nA; k++) { const a = Math.PI * (k / nA); pts[i].push(v3(Math.cos(a) * r * (1 - 0.05 * Math.sin((i / 5) * Math.PI)), 0.4 + Math.sin(a) * 0.62 * (1 + 0.06 * Math.sin((i / 5) * Math.PI)), z)); } }
    obj.push(dye(shade(facing(grid(pts, (i, k) => [k * 0.2, i * 0.4]), (x, y) => [x, y - 0.3, 0]), (x, _y, z) => 0.92 + 0.08 * Math.sin(z * 11) + 0.05 * Math.sin(x * 23)), INK.ink, 2.3).applyMatrix4(m));
    for (const z of [-0.95, 0.95]) { const hoop: V3[] = []; for (let k = 0; k <= nA; k++) { const a = Math.PI * (k / nA); hoop.push(v3(Math.cos(a) * (r + 0.01), 0.4 + Math.sin(a) * 0.63, z)); } b.add('bamboo', tube(hoop, 0.015, 5).applyMatrix4(m)); }
    // 船头一只鱼篓、一支桨
    obj.push(dye(lathe([[0.001, 0], [0.11, 0], [0.15, 0.12], [0.13, 0.24], [0.07, 0.3], [0.08, 0.33], [0.06, 0.33], [0.05, 0.3], [0.001, 0.28]], 10), INK.bamboo, 1.7).translate(0.1, 0.31, 1.75).applyMatrix4(m));
    b.add('wood', pole(v3(-0.3, 0.33, -2.2), v3(-0.36, 0.34, -0.9), 0.02, 0.02, 5).applyMatrix4(m));
    b.add('wood', box(0.13, 0.02, 0.6, 'z').translate(-0.36, 0.34, -0.62).applyMatrix4(m));
    // 系船的竹篙
    const [px, pz] = [lx + 2.2, lz + 1.75], gy = G(px, pz);
    b.add('bamboo', pole(v3(px, gy - 0.6, pz), v3(px + 0.12, RIVER_Y + 1.75, pz - 0.08), 0.026, 0.02, 6, 3));
    obj.push(dye(tube([v3(px + 0.07, RIVER_Y + 0.5, pz - 0.04), v3(px - 0.3, RIVER_Y + 0.22, pz - 0.2), v3(lx + Math.sin(-0.95) * (len / 2 - 0.1), by + 0.5, lz + Math.cos(-0.95) * (len / 2 - 0.1))], 0.009, 4), INK.hemp, 1.5));
    const [x, z] = W(lx, lz);
    c.solid({ id: '渡口·渔船', kind: 'rect', x, z, w: 1.3, d: len, yaw: yaw - 0.95 });
    c.anchor('fishBoat', x, by + 0.1, z, yaw - 0.95);
  }
  b.pop();
  c.anchor('ferry', F.x, ground(F.x, F.z), F.z, yaw + Math.PI);
}

// ———————————— 桔槔 ————————————
function wellSweep(c: Ctx): void {
  const b = c.home, R = rnd(8501), obj = { push: (...gs: Geo[]) => { for (const g of gs) b.add('obj', g); } };
  // 立在溪南岸（田间小路北头）：先找那一处的水边
  const x0 = 22.4;
  let z0 = 34;
  while (z0 < 40 && ground(x0, z0) < streamAt(x0, z0).y + 0.5) z0 += 0.1;
  z0 += 0.9;
  const gy = ground(x0, z0), H = 2.75;
  // 一根带杈的立柱
  b.add('wood', renormal(wobble(pole(v3(x0, gy - 0.4, z0), v3(x0 + 0.04, gy + H, z0), 0.095, 0.07, 8, 5), 0.012, 1.3, 85, 0), 60));
  for (const e of [-1, 1]) b.add('wood', pole(v3(x0 + 0.04, gy + H - 0.08, z0), v3(x0 + 0.04 + e * 0.17, gy + H + 0.36, z0), 0.05, 0.035, 6));
  // 长杆：粗头朝岸（坠着一块石），细头伸到水上，挂一根细竿与水桶
  const tilt = 0.56, piv = v3(x0 + 0.04, gy + H + 0.08, z0), dir = v3(0, Math.sin(tilt), -Math.cos(tilt));
  const butt = piv.clone().addScaledVector(dir, -1.9), tip = piv.clone().addScaledVector(dir, 3.6);
  b.add('wood', pole(butt, tip, 0.06, 0.03, 7, 6));
  b.add('stone', rockGeo(86, 0.2, 0.18, 0.17, 1).translate(butt.x, butt.y - 0.3, butt.z + 0.05));
  for (const e of [-1, 1]) obj.push(dye(pole(v3(butt.x + e * 0.1, butt.y - 0.25, butt.z + 0.05), v3(butt.x, butt.y + 0.03, butt.z + 0.08), 0.008, 0.008, 4), INK.hemp, 1.5));
  const hang = 3.0, end = v3(tip.x + 0.03, tip.y - hang, tip.z + 0.05);
  b.add('bamboo', pole(tip.clone().add(v3(0, -0.02, 0)), end, 0.014, 0.012, 5, 2));
  for (const g of bucketGeo(0.12, 0.145, 0.26, 10)) obj.push(g.translate(end.x, end.y - 0.3, end.z));
  obj.push(dye(tube([v3(end.x - 0.14, end.y - 0.06, end.z), v3(end.x, end.y, end.z), v3(end.x + 0.14, end.y - 0.06, end.z)], 0.006, 4), INK.hemp, 1.5));
  // 岸边一块站脚的石
  const sz = z0 - 1.25, sg = ground(x0 - 0.2, sz);
  b.add('stone', at(flatRock(87, 0.42, 0.14, 0.34), x0 - 0.2, sg - 0.02, sz, R() * 3));
  c.solid({ id: '桔槔·立柱', kind: 'disc', x: x0, z: z0, r: 0.14 });
  c.anchor('sweep', x0 - 0.2, sg + 0.12, sz, 0);
}
