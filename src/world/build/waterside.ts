/**
 * 水边的几样：
 *   小石桥 —— 三条石板并排，南北跨溪，底下两座毛石桥墩，没有栏杆；
 *   汀步   —— 村口溪里的六块踏脚石；
 *   修桥   —— 东头一座正在修的木桥：木桩打好了，桥面铺了一半，岸上码着板、木马、锯与锛；
 *   渡口   —— 一截栈桥，一只渡船（一支橹、一根篙），不远处泊着一只乌篷小渔船；
 *   桔槔   —— 溪边汲水的长杆。
 */
import { M, box, cyl, grid, lathe, prism, rockGeo, shade, tint, type Geo } from '../core/geo';
import { RIVER_Y, SITE, ground, streamAt } from '../site';
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
  if (on('ferry')) ferry(c);
  if (on('sweep')) wellSweep(c);
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
