/**
 * 把一座寺拼起来：大殿、山门、院墙与月洞门、钟楼鼓楼、东西厢（经房、茶寮）、石桥莲池、云台的亭、山道石阶、远处的塔。
 * 每栋房子各自并成一组网格（按材质合并），位置见 layout.ts。
 */
import * as THREE from 'three';
import { Builder, M, V, box, boxUp, cyl, extrude, lathe, lathe4, prism, rockGeo, shade, sweep, tint, under } from '../core/geo';
import type { Mats } from '../core/mats';
import { mulberry32, rr } from '../core/rng';
import type { Quality } from '../core/World';
import { L, stairY } from '../layout';
import { buildHall, type Hall, type HallSpec } from './frame';
import { buildRoof } from './roof';

type MatMap = Record<string, THREE.Material>;
const mm = (m: Mats) => m as unknown as MatMap;

export const MAIN_HALL: HallSpec = {
  xs: [-11, -7, -2.5, 2.5, 7, 11], zs: [-6, -2, 2, 6], colH: 5, colR: 0.3, base: 1.5, baseOut: 3.0,
  steps: [{ side: 'f', at: 0, w: 5.6 }, { side: 'l', at: 3.5, w: 2.4 }, { side: 'r', at: 3.5, w: 2.4 }],
  dougong: 2, dk: 1.25, out: 3.7,
  bays: (side, i, n) => (side === 'f' ? (i === 0 || i === n - 1 ? 'window' : 'door') : 'wall'),
  roof: { rise: 6.1, Rg: 7.0, sg: 1, lift: 0.95, flying: true },
  interior: true,
};
const GATE: HallSpec = {
  xs: [-5.6, -2.1, 2.1, 5.6], zs: [-2.3, 2.3], colH: 4.1, colR: 0.25, base: 0.7, baseOut: 1.3,
  steps: [{ side: 'f', at: 0, w: 4.6 }, { side: 'b', at: 0, w: 4.6 }],
  dougong: 1, dk: 0.95, out: 2.1,
  bays: (side, i) => (side === 'f' ? (i === 1 ? 'door' : 'window') : side === 'b' ? (i === 1 ? 'open' : 'window') : 'wall'),
  roof: { rise: 3.3, Rg: 4.9, sg: 0.5, lift: 0.6, flying: true },
};
const SIDE: HallSpec = {
  xs: [-5.4, -1.8, 1.8, 5.4], zs: [-2.5, 2.5], colH: 3.5, colR: 0.22, base: 0.5, baseOut: 0.9,
  steps: [{ side: 'f', at: 0, w: 3.0 }],
  dougong: 1, dk: 0.8, out: 1.45,
  bays: (side, i) => (side === 'f' ? (i === 1 ? 'door' : 'window') : side === 'b' ? (i === 1 ? 'moon' : 'wall') : 'wall'),
  roof: { rise: 2.3, Rg: 6.85, sg: 0, ends: 'plain', ridgeScale: 0.8 },
  interior: true, noInnerCols: true, floor: 'woodPale',
};
const PAVILION: HallSpec = {
  xs: [-1.9, 1.9], zs: [-1.9, 1.9], colH: 3.0, colR: 0.17, base: 0.4, baseOut: 0.75,
  steps: [{ side: 'l', at: 0, w: 1.7 }],
  dougong: 1, dk: 0.7, out: 1.45,
  bays: () => 'open',
  roof: { rise: 2.5, Rg: 0, sg: 1, lift: 0.5, finial: 1.1, a: 0.42, ridgeScale: 0.7 },
};
const TOWER_TOP: HallSpec = {
  xs: [-2.25, 2.25], zs: [-2.25, 2.25], colH: 3.4, colR: 0.2, base: 0, baseOut: 0,
  dougong: 1, dk: 0.8, out: 1.75,
  bays: () => 'half',
  roof: { rise: 2.7, Rg: 1.6, sg: 0.5, lift: 0.55, ridgeScale: 0.75 },
};

export interface Temple {
  group: THREE.Group;
  hall: Hall;
  /** 钟、鼓挂在哪（梁底的世界坐标） */
  bellHang: THREE.Vector3; drumAt: THREE.Vector3;
  /** 楼上的地面高度 */
  towerFloor: number;
  pavilionFloor: number;
}

/** 栏杆：一串望柱，柱间两道横杆 */
function railing(b: Builder, pts: THREE.Vector3[], h = 0.95, mat = 'stone') {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    b.add(mat, boxUp(0.17, h, 0.17, 'y').translate(p.x, p.y, p.z));
    b.add(mat, lathe([[0.06, 0], [0.075, 0.02], [0.082, 0.06], [0.07, 0.105], [0.04, 0.14], [0.012, 0.16], [0, 0.165]], 12).translate(p.x, p.y + h, p.z));
    if (i < pts.length - 1) {
      const q = pts[i + 1];
      for (const [yy, t] of [[h * 0.86, 0.085], [h * 0.42, 0.065]] as const) {
        b.add(mat, sweep([V(p.x, p.y + yy, p.z), V(q.x, q.y + yy, q.z)], [[-t / 2, -t / 2], [t / 2, -t / 2], [t / 2, t / 2], [-t / 2, t / 2]], { caps: false }));
      }
      // 栏板
      b.add(mat, tint(sweep([V(p.x, p.y + h * 0.42, p.z), V(q.x, q.y + h * 0.42, q.z)], [[-0.03, -h * 0.3], [0.03, -h * 0.3], [0.03, 0], [-0.03, 0]], { caps: false }), 0.9));
    }
  }
}

/** 一段院墙：石脚、粉壁、瓦帽。可在中间开一个月洞门 */
function wallRun(b: Builder, x0: number, z0: number, x1: number, z1: number, h: number, moon?: { at: number; r: number }) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
  b.push(M.mul(M.t((x0 + x1) / 2, 0, (z0 + z1) / 2), M.ry(Math.atan2(-dz, dx))));
  const seg = (a: number, c: number) => {
    const w = c - a, m = (a + c) / 2;
    if (w < 0.05) return;
    b.add('stone', boxUp(w, 0.5, 0.62, 'x').translate(m, 0, 0));
    b.add('plaster', shade(boxUp(w, h - 0.5, 0.46, 'x').translate(m, 0.5, 0), (_x, y) => 0.84 + 0.16 * Math.min(1, (y - 0.5) / 1.4)));
  };
  if (moon) {
    const w = moon.r * 2 + 1.5, cy = moon.r + 0.16;
    seg(-len / 2, moon.at - w / 2); seg(moon.at + w / 2, len / 2);
    const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]);
    sh.holes.push(new THREE.Path().absarc(0, cy, moon.r, 0, Math.PI * 2, true));
    b.add('plaster', extrude(sh, 0.46, 'y', 48).translate(moon.at, 0, 0));
    b.add('ridge', lathe([[moon.r - 0.02, -0.3], [moon.r + 0.11, -0.3], [moon.r + 0.11, 0.3], [moon.r - 0.02, 0.3]], 56).rotateX(Math.PI / 2).translate(moon.at, cy, 0));
    b.add('flag', box(moon.r * 1.5, 0.16, 0.9, 'x').translate(moon.at, 0.08, 0));
  } else seg(-len / 2, len / 2);
  buildRoof(b, { W: len / 2 + 0.05, D: 0.56, y0: h + 0.02, rise: 0.3, Rg: len / 2 + 0.05, sg: 0, tile: 0.23, purlin: 0.3, noRafters: true, bare: true, ends: 'plain', ridgeScale: 0.45, detail: 0.3, rows: 2 });
  b.pop();
}

/** 密檐塔（取小雁塔的样子：方形、十三层叠涩檐、轮廓有卷杀） */
function pagoda(b: Builder) {
  const n = 13, base = 5.2;
  let y = 0;
  b.add('stone', lathe4([[base + 1.3, 0], [base + 1.3, 1.1], [base + 0.5, 1.1], [base + 0.5, 1.6]]));
  y = 1.6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = base * (1 - 0.3 * t - 0.26 * t * t), hh = i === 0 ? 7.2 : 2.5 - 1.1 * t, e = 0.62 - 0.22 * t;
    const p: Array<[number, number]> = [[r, y], [r, y + hh]];
    // 叠涩：一层层挑出去，再收回来
    for (let k = 1; k <= 4; k++) p.push([r + (e * k) / 4, y + hh + 0.09 * (k - 1)], [r + (e * k) / 4, y + hh + 0.09 * k]);
    for (let k = 1; k <= 3; k++) p.push([r + e - (e * k) / 3.4, y + hh + 0.36 + 0.07 * (k - 1)], [r + e - (e * k) / 3.4, y + hh + 0.36 + 0.07 * k]);
    b.add('pagoda', shade(lathe4(p), (_x, yy) => 0.86 + 0.14 * Math.sin(yy * 3.1) * 0.3));
    // 每层正中一个券窗（暗）
    if (hh > 1.3) for (let s = 0; s < 4; s++) b.add('dark', box(i === 0 ? 1.5 : 0.5, i === 0 ? 2.6 : hh * 0.42, 0.1).translate(0, y + (i === 0 ? 1.3 : hh * 0.45), r + 0.01).rotateY((s * Math.PI) / 2));
    y += hh + 0.57;
  }
  b.add('ridge', lathe([[1.5, 0], [1.3, 0.5], [0.5, 0.9], [0.62, 1.5], [0.36, 2.0], [0.5, 2.5], [0.28, 3.0], [0.38, 3.5], [0.16, 4.1], [0, 5.0]], 12).translate(0, y, 0));
}

export function createTemple(mats: Mats, q: Quality): Temple {
  const M0 = { ...mm(mats), pagoda: mats.pagoda, mural: mats.mural } as MatMap;
  const group = new THREE.Group();
  group.name = 'temple';
  const det = q.tier === 'low' ? 0.35 : q.tier === 'mid' ? 0.7 : 1;
  const put = (b: Builder, name: string, x: number, z: number, ry = 0, y = 0) => {
    const g = b.build(M0, { name, noCast: ['dark'] });
    g.position.set(x, y, z); g.rotation.y = ry;
    group.add(g);
    return g;
  };

  // —— 大殿 ——
  let b = new Builder();
  const hall = buildHall(b, { ...MAIN_HALL, detail: det });
  // 殿内：地面铺方砖，佛坛
  b.add('paving', box(21.6, 0.06, 11.6, 'x').translate(0, MAIN_HALL.base + 0.03, 0));
  {
    const y0 = MAIN_HALL.base + 0.18, hh = MAIN_HALL.colH - 0.6, cyy = y0 + hh / 2;
    b.add('mural', box(21.5, hh, 0.04, 'x').translate(0, cyy, -6 + 0.1));
    for (const s of [-1, 1]) b.add('mural', box(0.04, hh, 11.6, 'z').translate(s * (11 - 0.1), cyy, 0));
    for (const s of [-1, 1]) b.add('mural', box(3.2, hh, 0.04, 'x').translate(s * 9, cyy, 6 - 0.1));
  }
  put(b, 'hall', L.hall.x, L.hall.z);

  // —— 山门 ——
  b = new Builder();
  buildHall(b, { ...GATE, detail: det });
  put(b, 'gate', L.gate.x, L.gate.z);

  // —— 院墙 ——
  b = new Builder();
  const W = L.wall, gw = 6.95;
  wallRun(b, W.x0, W.z1, -gw, W.z1, W.h); wallRun(b, gw, W.z1, W.x1, W.z1, W.h);
  wallRun(b, W.x0, W.z0, W.x0, W.z1, W.h);
  wallRun(b, W.x1, W.z1, W.x1, W.z0, W.h, { at: -(L.moonGate.z - (W.z0 + W.z1) / 2), r: L.moonGate.r });
  wallRun(b, W.x1, W.z0, W.x0, W.z0, W.h);
  put(b, 'walls', 0, 0);

  // —— 钟楼、鼓楼 ——
  const tw = L.tower, floorY = tw.h + 0.24;
  for (const [name, at, sx] of [['bell', L.bell, 1], ['drum', L.drum, -1]] as const) {
    b = new Builder();
    b.add('stone', lathe4([[tw.r + 0.46, 0], [tw.r + 0.44, 0.7], [tw.r + 0.36, 0.7]]));
    b.add('plaster', shade(lathe4([[tw.r + 0.34, 0.7], [tw.r + 0.04, tw.h]]), (_x, y) => 0.86 + 0.14 * Math.min(1, y / 2)));
    b.add('stone', box(tw.r * 2 + 0.5, 0.24, tw.r * 2 + 0.5, 'x').translate(0, tw.h + 0.12, 0));
    // 朝中轴的一面开门
    b.push(M.ry(sx > 0 ? -Math.PI / 2 : Math.PI / 2));
    b.add('stone', box(1.9, 0.3, 0.5, 'x').translate(0, 2.55, tw.r + 0.2));
    for (const s of [-1, 1]) b.add('stone', box(0.28, 2.4, 0.5, 'y').translate(s * 0.82, 1.2, tw.r + 0.22));
    b.add('woodDark', box(1.4, 2.4, 0.1, 'y').translate(0, 1.2, tw.r + 0.2));
    b.add('flag', box(2.4, 0.16, 1.0, 'x').translate(0, 0.08, tw.r + 0.9));
    b.pop();
    b.push(M.t(0, floorY, 0));
    buildHall(b, { ...TOWER_TOP, detail: det, bays: (side) => ((sx > 0 ? side === 'l' : side === 'r') ? 'open' : 'half') });
    // 挂钟 / 架鼓的大梁
    b.add('wood', under(box(5.2, 0.42, 0.34, 'x').translate(0, TOWER_TOP.colH - 0.05, 0)));
    b.add('woodPale', box(4.3, 0.06, 4.3, 'x').translate(0, 0.03, 0));
    b.pop();
    put(b, name, at.x, at.z);
  }

  // —— 东西厢：经房、茶寮 ——
  b = new Builder(); buildHall(b, { ...SIDE, detail: det }); put(b, 'study', L.study.x, L.study.z, Math.PI / 2);
  b = new Builder(); buildHall(b, { ...SIDE, detail: det, bays: (side, i) => (side === 'f' ? (i === 1 ? 'open' : 'half') : side === 'b' ? (i === 1 ? 'moon' : 'wall') : 'wall') }); put(b, 'tea', L.tea.x, L.tea.z, -Math.PI / 2);

  // —— 云台的亭 ——
  b = new Builder(); buildHall(b, { ...PAVILION, detail: det }); put(b, 'pavilion', L.terrace.cx, L.terrace.cz);

  // —— 塔 ——
  b = new Builder(); pagoda(b);
  const pg = put(b, 'pagoda', L.pagoda.x, L.pagoda.z);
  pg.userData.ground = true;   // 高度由调用者按地形摆

  // —— 院子：铺地、甬道、池、桥、树池、云台、山道 ——
  b = new Builder();
  const P = L.pond, pm = 0.42;
  const slab = (x0: number, x1: number, z0: number, z1: number, mat = 'paving', y = 0) => b.add(mat, box(x1 - x0, 0.12, z1 - z0, 'x').translate((x0 + x1) / 2, y - 0.06, (z0 + z1) / 2));
  slab(W.x0, W.x1, W.z0, P.z0 - pm);
  slab(W.x0, W.x1, P.z1 + pm, W.z1 + 0.2);
  slab(W.x0, P.x0 - pm, P.z0 - pm, P.z1 + pm); slab(P.x1 + pm, W.x1, P.z0 - pm, P.z1 + pm);
  // 甬道（条石）
  slab(-1.8, 1.8, L.hall.z + 9.2 + 2.6, P.z0 - pm, 'flag', 0.014);
  slab(-1.8, 1.8, P.z1 + pm, W.z1 - 4.3, 'flag', 0.014);
  // 山门外的平台
  slab(-8.5, 8.5, W.z1 + 0.2, L.stair.z0, 'flag', 0);
  // 池：驳岸一圈、池壁、池底
  const cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2, pw = P.x1 - P.x0, pd = P.z1 - P.z0;
  // 南岸的驳岸在石埠处断开一个口子（口子里是一块与铺地齐平的条石）
  const wa = L.wharf.x - L.wharf.w / 2, wb = L.wharf.x + L.wharf.w / 2;
  const curbs: Array<[number, number, number, number]> = [
    [cx, P.z0 - pm / 2, pw + pm * 2, pm],
    [(P.x0 - pm + wa) / 2, P.z1 + pm / 2, wa - (P.x0 - pm), pm], [(wb + P.x1 + pm) / 2, P.z1 + pm / 2, P.x1 + pm - wb, pm],
    [P.x0 - pm / 2, cz, pm, pd], [P.x1 + pm / 2, cz, pm, pd],
  ];
  for (const [x, z, w, d] of curbs) b.add('stone', box(w, 1.7, d, w > d ? 'x' : 'z').translate(x, -0.85 + 0.13, z));
  b.add('stone', box(L.wharf.w, 1.7, pm, 'x').translate(L.wharf.x, -0.85, P.z1 + pm / 2));
  b.add('ground', tint(box(pw, 0.1, pd, 'x').translate(cx, -1.5, cz), 0.35));
  // 南岸的石埠：从铺地下一级，再到水边的一块平台（人在这里跪下，手够得着水，放灯）
  {
    const wh = L.wharf;
    b.add('stone', box(wh.w, 1.4, 0.36, 'x').translate(wh.x, wh.step - 0.7, P.z1 - 0.18));
    b.add('stone', box(wh.w, 1.2, wh.d, 'x').translate(wh.x, wh.y - 0.6, P.z1 - 0.36 - wh.d / 2));
  }
  // 池边散几块石
  const rs = mulberry32(5);
  for (let i = 0; i < 16; i++) {
    const side = i % 4, t = rs();
    const x = side < 2 ? P.x0 + 1 + t * (pw - 2) : side === 2 ? P.x0 + 0.5 : P.x1 - 0.5;
    const z = side === 0 ? P.z0 + 0.4 : side === 1 ? P.z1 - 0.4 : P.z0 + 1 + t * (pd - 2);
    if (Math.abs(x) < 3) continue;
    // 石埠那一段不放石头（照样取掉两个随机数，别的石头才不会跟着变样）
    if (side === 1 && Math.abs(x - L.wharf.x) < 1.7) { rs(); rs(); continue; }
    const s = rr(rs, 0.35, 0.85);
    b.add('rock', rockGeo(i + 20, s * 1.2, s, s).rotateY(rs() * 6).translate(x, P.y - 0.3, z));
  }
  // 石桥：单孔拱桥
  {
    const z0 = P.z0 - 0.5, z1 = P.z1 + 0.5, span = z1 - z0, rise = L.bridge.rise, hw = L.bridge.w / 2;
    const arc = (t: number) => rise * (1 - Math.pow(2 * t - 1, 2));
    const path: THREE.Vector3[] = [], sideA: THREE.Vector3[] = [], sideB: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; path.push(V(0, arc(t), z0 + span * t)); }
    b.add('flag', sweep(path, [[-hw, -0.3], [hw, -0.3], [hw, 0], [-hw, 0]]));
    const sh = new THREE.Shape();
    sh.moveTo(z0, -1.6); sh.lineTo(z0, 0);
    for (let i = 1; i <= 24; i++) { const t = i / 24; sh.lineTo(z0 + span * t, arc(t) - 0.05); }
    sh.lineTo(z1, -1.6); sh.closePath();
    sh.holes.push(new THREE.Path().absellipse((z0 + z1) / 2, P.y - 0.2, span * 0.36, rise + 0.32, 0, Math.PI * 2, true));
    b.add('stone', extrude(sh, L.bridge.w - 0.1, 'y', 30).rotateY(-Math.PI / 2));
    for (let i = 0; i <= 8; i++) { const t = i / 8; sideA.push(V(-hw + 0.1, arc(t), z0 + span * t)); sideB.push(V(hw - 0.1, arc(t), z0 + span * t)); }
    railing(b, sideA, 0.9); railing(b, sideB, 0.9);
  }
  // 银杏的树池
  b.add('stone', lathe([[2.5, 0], [2.5, 0.34], [2.2, 0.34], [2.2, 0]], 28).translate(L.ginkgo.x, 0, L.ginkgo.z));
  b.add('ground', tint(cyl(2.2, 2.2, 0.28, 28).translate(L.ginkgo.x, 0.14, L.ginkgo.z), 0.8));
  // 云台：条石地面、临崖的石栏、从月洞门过来的路
  const T = L.terrace;
  slab(T.x0, T.x1, T.z0, T.z1, 'flag', 0);
  slab(L.wall.x1 - 0.4, T.x0, L.moonGate.z - 1.4, L.moonGate.z + 1.4, 'flag', 0);
  const rail: THREE.Vector3[] = [];
  for (let z = T.z0 + 0.2; z <= T.z1 - 0.15; z += (T.z1 - T.z0 - 0.4) / 8) rail.push(V(T.x1 - 0.2, 0, z));
  railing(b, rail, 0.82);
  const railN: THREE.Vector3[] = [], railS: THREE.Vector3[] = [];
  for (let x = T.x0 + 2.4; x <= T.x1 - 0.15; x += (T.x1 - T.x0 - 2.6) / 8) { railN.push(V(x, 0, T.z0 + 0.2)); railS.push(V(x, 0, T.z1 - 0.2)); }
  railing(b, railN, 0.82); railing(b, railS, 0.82);
  // 山道：一级一级的石阶，两侧垂带
  {
    const S = L.stair, n = Math.round(S.drop / 0.16), run = (S.z1 - S.z0) / n;
    for (let i = 0; i < n; i++) b.inst('step', 'flag', () => box(S.w, 0.5, run + 0.02, 'x'), M.t(0, -(i + 1) * (S.drop / n) - 0.25 + 0.0, S.z0 + (i + 0.5) * run));
    for (const s of [-1, 1]) {
      const path: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) { const z = S.z0 + ((S.z1 - S.z0) * i) / 12; path.push(V(s * (S.w / 2 + 0.2), stairY(z) + 0.1, z)); }
      b.add('stone', sweep(path, [[-0.2, -0.6], [0.2, -0.6], [0.2, 0], [-0.2, 0]]));
    }
    // 山脚的平台
    b.add('flag', box(8, 0.5, 6, 'x').translate(0, -S.drop - 0.25, S.z1 + 3));
  }
  put(b, 'court', 0, 0);

  return {
    group, hall,
    bellHang: V(L.bell.x, floorY + TOWER_TOP.colH - 0.26, L.bell.z),
    drumAt: V(L.drum.x, floorY + 0.06, L.drum.z),
    towerFloor: floorY + 0.06, pavilionFloor: PAVILION.base,
  };
}
