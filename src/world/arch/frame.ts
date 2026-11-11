/**
 * 殿身：台基、踏跺、柱与柱础、阑额、斗栱、粉壁、直棂窗、板门、室内的梁与平闇。
 * 一栋房子由「柱网」（xs × zs）定下来：外圈是檐柱，四面每一间填什么（墙 / 窗 / 门 / 空）由 bays 决定，上面盖 roof.ts 的顶。
 * 取唐风：朱柱白壁、直棂窗、板门带门钉、斗栱硕大疏朗、补间用人字栱。
 *
 * 每一面都在自己的局部坐标里搭：x 沿这一面从左到右（站在外面看），z 朝外，然后转到位。
 */
import * as THREE from 'three';
import { Builder, type Geo, M, V, box, boxUp, cyl, cylUp, extrude, lathe, lathe4, merge, prism, shade, sphere, tint, under } from '../core/geo';
import { buildRoof, type Roof, type RoofSpec } from './roof';

export type Side = 'f' | 'b' | 'l' | 'r';
export type Bay = 'wall' | 'window' | 'door' | 'open' | 'half' | 'moon';
export interface HallSpec {
  /** 柱列：x 自西向东，z 自北（后）向南（前）。单位米，自己定原点 */
  xs: number[]; zs: number[];
  colH: number; colR: number;
  /** 台基高、比檐柱外扩多少 */
  base: number; baseOut: number;
  /** 踏跺：哪一面、沿该面的位置（世界坐标 x 或 z）、宽 */
  steps?: Array<{ side: Side; at: number; w: number }>;
  /** 斗栱：0 无（只有一道枋）、1 一斗三升、2 五铺作 */
  dougong: 0 | 1 | 2;
  /** 斗栱的大小倍率 */
  dk?: number;
  bays: (side: Side, i: number, n: number) => Bay;
  /** 出檐：檐柱中线到檐口 */
  out: number;
  roof: Omit<RoofSpec, 'W' | 'D' | 'y0' | 'purlin'>;
  /** 室内：地面、内柱、梁、平闇 */
  interior?: boolean;
  /** 没有内柱（小屋、楼） */
  noInnerCols?: boolean;
  /** 门开几成（0 关，1 全开） */
  doorOpen?: number;
  /** 室内地面用什么 */
  floor?: string;
  detail?: number;
}
export interface Hall { roof: Roof; floorY: number; eaveY: number; colTop: number; x0: number; x1: number; z0: number; z1: number }

/** 栱：两端卷杀（下角削去）。沿 x，长 L，宽 w，高 h，底在 y=0 */
function gong(L: number, w: number, h: number): Geo {
  const c = Math.min(L * 0.2, h * 0.9);
  return under(prism([[-L / 2, h], [L / 2, h], [L / 2, h * 0.5], [L / 2 - c * 0.5, h * 0.16], [L / 2 - c, 0], [-L / 2 + c, 0], [-L / 2 + c * 0.5, h * 0.16], [-L / 2, h * 0.5]], w, 'x'), 0.7);
}
/** 斗：上方下收（斗欹） */
function dou(w: number, h: number): Geo {
  return under(lathe4([[w * 0.36, 0], [w * 0.5, h * 0.42], [w * 0.5, h]]), 0.72);
}
/** 耍头：一头出尖 */
function nose(L0: number, L1: number, w: number, h: number): Geo {
  return under(prism([[-L0, h], [L1 - h * 0.5, h], [L1, h * 0.55], [L1 - h * 0.35, 0], [-L0, 0]], w, 'x').rotateY(-Math.PI / 2), 0.7);
}

/** 一朵柱头铺作（五铺作双杪）：原点在柱顶中心，z 朝外。k 是大小 */
export function dougongSet(k: number, corner = false): Geo {
  const w = 0.17 * k, h = 0.25 * k, sw = 0.3 * k, sh = 0.17 * k, j1 = 0.47 * k, j2 = 0.92 * k;
  const y1 = 0.2 * k, y2 = y1 + h + sh - 0.03 * k, y3 = y2 + h + sh - 0.03 * k;
  const g: Geo[] = [];
  const dirs = corner ? [0, Math.PI / 2] : [0];
  g.push(dou(0.54 * k, 0.3 * k));
  for (const r of dirs) {
    const R = (x: Geo) => (r ? x.rotateY(r) : x);
    // 第一跳：泥道栱 + 华栱
    g.push(R(gong(1.25 * k, w, h).translate(0, y1, 0)));
    g.push(R(gong(2 * j1 + 0.24 * k, w, h).rotateY(Math.PI / 2).translate(0, y1, 0)));
    for (const x of [-0.52, 0.52]) g.push(R(dou(sw, sh).translate(x * k, y1 + h, 0)));
    for (const z of [-j1, j1]) g.push(R(dou(sw, sh).translate(0, y1 + h, z)));
    // 第二跳：慢栱 + 华栱 + 瓜子栱
    g.push(R(gong(1.9 * k, w, h).translate(0, y2, 0)));
    g.push(R(gong(2 * j2 + 0.24 * k, w, h).rotateY(Math.PI / 2).translate(0, y2, 0)));
    for (const z of [-j1, j1]) g.push(R(gong(1.15 * k, w, h).translate(0, y2, z)));
    for (const x of [-0.84, 0.84]) g.push(R(dou(sw, sh).translate(x * k, y2 + h, 0)));
    for (const z of [-j1, j1]) for (const x of [-0.48, 0.48]) g.push(R(dou(sw, sh).translate(x * k, y2 + h, z)));
    for (const z of [-j2, j2]) g.push(R(dou(sw, sh).translate(0, y2 + h, z)));
    // 第三层：令栱 + 耍头
    g.push(R(gong(1.15 * k, w, h).translate(0, y3, j2)));
    g.push(R(nose(0.6 * k, j2 + 0.42 * k, w, h).translate(0, y3, 0)));
    for (const x of [-0.48, 0, 0.48]) g.push(R(dou(sw, sh).translate(x * k, y3 + h, j2)));
  }
  g.push(dou(sw, sh).translate(0, y1 + h, 0));
  if (corner) {
    // 角华栱：沿 45° 出两跳
    const d = Math.SQRT2;
    g.push(gong(2 * j1 * d + 0.3 * k, w, h).rotateY(Math.PI / 4).translate(0, y1, 0));
    g.push(gong(2 * j2 * d + 0.3 * k, w, h).rotateY(Math.PI / 4).translate(0, y2, 0));
    g.push(nose(0.6 * k, (j2 + 0.5 * k) * d, w, h).rotateY(-Math.PI / 4).translate(0, y3, 0));
    g.push(dou(sw, sh).translate(j1, y1 + h, j1), dou(sw, sh).translate(j2, y2 + h, j2));
  }
  return shade(merge(g), (_x, y) => 0.8 + 0.2 * Math.min(1, y / (1.4 * k)));
}
/** 一斗三升：栌斗 + 一道栱 + 三个小斗 */
export function dougongSimple(k: number): Geo {
  const w = 0.16 * k, h = 0.22 * k;
  return merge([dou(0.46 * k, 0.26 * k), gong(1.1 * k, w, h).translate(0, 0.17 * k, 0), ...[-0.44, 0, 0.44].map((x) => dou(0.26 * k, 0.15 * k).translate(x * k, 0.17 * k + h, 0)),
    nose(0.3 * k, 0.5 * k, w, h).translate(0, 0.17 * k, 0)]);
}
/** 人字栱：两根斜撑成「人」字，顶上一斗 */
export function renzi(span: number, rise: number, k: number): Geo {
  const t = 0.13 * k, g: Geo[] = [];
  for (const s of [-1, 1]) g.push(box(t, 1, t * 0.9, 'y').applyMatrix4(M.span(V(s * span * 0.5, 0, 0), V(s * 0.05 * k, rise, 0), 1)));
  g.push(dou(0.28 * k, 0.16 * k).translate(0, rise - 0.02, 0));
  return merge(g);
}

/** 柱础：覆盆 */
const plinth = (r: number) => lathe([[r * 2.0, 0], [r * 2.0, 0.05], [r * 1.92, 0.075], [r * 1.72, 0.105], [r * 1.42, 0.13], [r * 1.2, 0.145], [r * 1.12, 0.15], [r * 1.12, 0.17]], 24);

/** 台基：下枋、束腰、压阑石三层，顶面另铺条石 */
export function platform(b: Builder, x0: number, x1: number, z0: number, z1: number, h: number, top = 'flag') {
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const a = h * 0.2, c = Math.min(0.22, h * 0.24), m = h - a - c;
  b.add('stone', boxUp(w + 0.1, a, d + 0.1).translate(cx, 0, cz));
  b.add('stone', shade(boxUp(w - 0.12, m, d - 0.12).translate(cx, a, cz), (_x, y) => 0.78 + 0.1 * ((y - a) / m)));
  b.add('stone', boxUp(w + 0.16, c, d + 0.16).translate(cx, a + m, cz));
  b.add(top, box(w + 0.02, 0.04, d + 0.02, 'x').translate(cx, h + 0.012, cz));
}
/** 踏跺：n 级，两侧垂带石。原点在最上一级的外沿中点，朝 +z 往下走 */
export function stairs(b: Builder, w: number, h: number, run = 0.34): number {
  const n = Math.max(1, Math.round(h / 0.16)), rise = h / n;
  for (let i = 0; i < n; i++) {
    b.add('flag', box(w, rise, run * (i + 1), 'x').translate(0, -(i + 0.5) * rise, (run * (i + 1)) / 2));
  }
  const L = run * n;
  for (const s of [-1, 1]) {
    b.add('stone', prism([[0, 0.04], [L + 0.1, -h + 0.04], [L + 0.1, -h], [0, -h]], 0.34).rotateY(-Math.PI / 2).translate(s * (w / 2 + 0.17), 0, 0));
  }
  return L;
}

const ROT: Record<Side, number> = { f: 0, b: Math.PI, r: Math.PI / 2, l: -Math.PI / 2 };

export function buildHall(b: Builder, sp: HallSpec): Hall {
  const { xs, zs, colH, colR } = sp;
  const k = sp.dk ?? 1, det = sp.detail ?? 1;
  const x0 = xs[0], x1 = xs[xs.length - 1], z0 = zs[0], z1 = zs[zs.length - 1];
  const fy = sp.base;
  const top = fy + colH;
  const dgH = sp.dougong === 2 ? 1.69 * k : sp.dougong === 1 ? 0.62 * k : 0.3;
  const jut = sp.dougong === 2 ? 0.92 * k : sp.dougong === 1 ? 0.0 : 0;
  const W = (x1 - x0) / 2 + sp.out, D = (z1 - z0) / 2 + sp.out, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  // —— 台基与踏跺 ——
  if (fy > 0.02) {
    const o = sp.baseOut;
    platform(b, x0 - o, x1 + o, z0 - o, z1 + o, fy, sp.floor ?? 'flag');
    for (const st of sp.steps ?? []) {
      const m = st.side === 'f' ? M.t(st.at, fy, z1 + o) : st.side === 'b' ? M.mul(M.t(st.at, fy, z0 - o), M.ry(Math.PI)) : st.side === 'r' ? M.mul(M.t(x1 + o, fy, st.at), M.ry(Math.PI / 2)) : M.mul(M.t(x0 - o, fy, st.at), M.ry(-Math.PI / 2));
      b.push(m); stairs(b, st.w, fy); b.pop();
    }
  }

  // —— 柱 ——
  const colGeo = () => shade(cylUp(colR * 0.9, colR, colH, 18, false, 6), (_x, y) => 0.8 + 0.2 * Math.min(1, y / 0.9) - 0.12 * Math.max(0, (y - colH + 0.7) / 0.7));
  const isEdge = (i: number, j: number) => i === 0 || j === 0 || i === xs.length - 1 || j === zs.length - 1;
  for (let i = 0; i < xs.length; i++) for (let j = 0; j < zs.length; j++) {
    if (!isEdge(i, j) && (sp.noInnerCols || !sp.interior)) continue;
    // 明间正对佛坛的内柱移走（减柱），留出礼佛的空
    b.inst(`col${colH}_${colR}`, 'wood', colGeo, M.t(xs[i], fy, zs[j]));
    b.inst(`plinth${colR}`, 'stone', () => plinth(colR), M.t(xs[i], fy, zs[j]));
  }

  // —— 四面 ——
  const sides: Array<{ side: Side; us: number[]; O: THREE.Vector3 }> = [
    { side: 'f', us: xs.map((x) => x - cx), O: V(cx, fy, z1) },
    { side: 'b', us: xs.map((x) => cx - x).reverse(), O: V(cx, fy, z0) },
    { side: 'r', us: zs.map((z) => cz - z).reverse(), O: V(x1, fy, cz) },
    { side: 'l', us: zs.map((z) => z - cz), O: V(x0, fy, cz) },
  ];
  const lin = 0.42 * Math.max(0.7, k), linW = 0.26 * Math.max(0.7, k);
  for (const S of sides) {
    b.push(M.mul(M.t(S.O.x, S.O.y, S.O.z), M.ry(ROT[S.side])));
    const us = S.us, n = us.length - 1, uA = us[0], uB = us[n], len = uB - uA;
    // 阑额
    b.add('wood', under(box(len + colR * 2.2, lin, linW, 'x').translate((uA + uB) / 2, colH - lin / 2, 0), 0.7));
    if (sp.dougong === 2) {
      const y1 = 0.2 * k, hh = 0.25 * k, y2 = y1 + hh + 0.14 * k, y3 = y2 + hh + 0.14 * k, ext = 1.15 * k;
      // 栱眼壁（白）、两道柱头枋、罗汉枋、撩檐枋
      b.add('plaster', box(len, dgH - 0.05, 0.08, 'x').translate((uA + uB) / 2, colH + (dgH - 0.05) / 2, -0.03));
      for (const y of [y2, y3]) b.add('wood', under(box(len + ext * 2, hh, 0.17 * k, 'x').translate((uA + uB) / 2, colH + y + hh / 2, 0), 0.7));
      b.add('wood', under(box(len + ext * 2 + 0.6 * k, hh, 0.17 * k, 'x').translate((uA + uB) / 2, colH + y3 + hh / 2, 0.47 * k), 0.7));
      b.add('wood', under(box(len + jut * 2 + 1.0 * k, 0.3 * k, 0.2 * k, 'x').translate((uA + uB) / 2, colH + dgH - 0.15 * k, jut), 0.7));
      for (let i = 1; i < n; i++) b.inst(`dg${k}`, 'wood', () => dougongSet(k), M.t(us[i], colH, 0));
      // 补间：人字栱
      for (let i = 0; i < n; i++) {
        const span = us[i + 1] - us[i];
        if (span > 2.2 * k) b.inst(`rz${k}_${span.toFixed(2)}`, 'wood', () => renzi(Math.min(span * 0.42, 1.7 * k), y2 - 0.02, k), M.t((us[i] + us[i + 1]) / 2, colH, 0.02));
      }
    } else if (sp.dougong === 1) {
      b.add('plaster', box(len, dgH, 0.08, 'x').translate((uA + uB) / 2, colH + dgH / 2, -0.03));
      b.add('wood', under(box(len + 1.2 * k, 0.24 * k, 0.18 * k, 'x').translate((uA + uB) / 2, colH + dgH - 0.02, 0), 0.7));
      for (let i = 0; i <= n; i++) b.inst(`dgs${k}`, 'wood', () => dougongSimple(k), M.t(us[i], colH, 0));
    } else {
      b.add('wood', under(box(len + 0.9, 0.26, 0.2, 'x').translate((uA + uB) / 2, colH + 0.15, 0), 0.7));
    }
    // 每一间
    for (let i = 0; i < n; i++) {
      const kind = sp.bays(S.side, i, n);
      const a = us[i] + colR * 0.86, c = us[i + 1] - colR * 0.86, w = c - a, m = (a + c) / 2, hTop = colH - lin;
      if (kind === 'open') continue;
      // 地栿
      b.add('wood', box(w, 0.16, 0.2, 'x').translate(m, 0.08, 0));
      if (kind === 'wall' || kind === 'half') {
        const hw = kind === 'half' ? 1.05 : hTop;
        b.add('plaster', shade(box(w, hw - 0.16, 0.2, 'x').translate(m, 0.16 + (hw - 0.16) / 2, -0.03), (_x, y) => 0.86 + 0.14 * Math.min(1, y / 1.2)));
        if (kind === 'wall') b.add('wood', box(w, 0.14, 0.24, 'x').translate(m, hTop * 0.44, -0.03));
        else b.add('wood', box(w, 0.12, 0.26, 'x').translate(m, hw + 0.06, -0.03));
      } else if (kind === 'moon') {
        // 月洞窗：粉壁上开一个圆，石的窗套，几根横竖的棂
        const r = Math.min(w, hTop) * 0.31, cy = hTop * 0.52;
        const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0.16), new THREE.Vector2(w / 2, 0.16), new THREE.Vector2(w / 2, hTop), new THREE.Vector2(-w / 2, hTop)]);
        sh.holes.push(new THREE.Path().absarc(0, cy, r, 0, Math.PI * 2, true));
        b.add('plaster', extrude(sh, 0.2, 'y', 40).translate(m, 0, -0.03));
        b.add('woodDark', lathe([[r - 0.02, -0.14], [r + 0.08, -0.14], [r + 0.08, 0.14], [r - 0.02, 0.14]], 44).rotateX(Math.PI / 2).translate(m, cy, -0.03));
        for (const q of [-0.36, 0.36]) {
          const hh = 2 * Math.sqrt(1 - q * q) * r;
          b.add('woodDark', box(0.035, hh, 0.035, 'y').translate(m + q * r, cy, -0.03));
          b.add('woodDark', box(hh, 0.035, 0.035, 'x').translate(m, cy + q * r, -0.03));
        }
      } else if (kind === 'window') {
        const wy0 = hTop * 0.36, wy1 = hTop * 0.86, wx = Math.min(0.42, w * 0.12);
        b.add('plaster', shade(box(w, wy0 - 0.16, 0.2, 'x').translate(m, 0.16 + (wy0 - 0.16) / 2, -0.03), (_x, y) => 0.86 + 0.14 * Math.min(1, y / 1.2)));
        b.add('plaster', box(w, hTop - wy1, 0.2, 'x').translate(m, (hTop + wy1) / 2, -0.03));
        for (const s of [-1, 1]) b.add('plaster', box(wx, wy1 - wy0, 0.2, 'y').translate(m + s * (w / 2 - wx / 2), (wy0 + wy1) / 2, -0.03));
        // 窗框与直棂（菱形断面的竖条）
        const fw = w - wx * 2;
        for (const y of [wy0, wy1]) b.add('wood', box(fw + 0.16, 0.12, 0.26, 'x').translate(m, y, -0.03));
        for (const s of [-1, 1]) b.add('wood', box(0.12, wy1 - wy0, 0.26, 'y').translate(m + s * (fw / 2 + 0.02), (wy0 + wy1) / 2, -0.03));
        const nb = Math.max(3, Math.round(fw / (det > 0.5 ? 0.115 : 0.19)));
        for (let q = 1; q < nb; q++) b.inst(`bar${(wy1 - wy0).toFixed(2)}`, 'woodDark', () => box(0.052, wy1 - wy0, 0.052, 'y').rotateY(Math.PI / 4), M.t(m - fw / 2 + (fw * q) / nb, (wy0 + wy1) / 2, -0.03));
        // 窗里是暗的
        b.add('dark', box(fw, wy1 - wy0, 0.02).translate(m, (wy0 + wy1) / 2, -0.14));
      } else if (kind === 'door') {
        const dh = Math.min(hTop - 0.55, colH * 0.74), jw = 0.2, dw = w - jw * 2, open = (sp.doorOpen ?? 1) * 1.72;
        // 门限、立颊、门额，上面是走马板（白）
        b.add('wood', box(w, 0.2, 0.26, 'x').translate(m, 0.1, 0));
        for (const s of [-1, 1]) b.add('wood', box(jw, dh, 0.24, 'y').translate(m + s * (w / 2 - jw / 2), dh / 2, 0));
        b.add('wood', box(w, 0.26, 0.28, 'x').translate(m, dh + 0.13, 0));
        b.add('plaster', box(w, hTop - dh - 0.26, 0.14, 'x').translate(m, (hTop + dh + 0.26) / 2, -0.03));
        // 门簪
        for (const q of [-0.3, -0.1, 0.1, 0.3]) b.add('wood', cyl(0.07, 0.07, 0.16, 6).rotateX(Math.PI / 2).translate(m + q * w, dh + 0.13, 0.2));
        // 两扇板门：往里开
        for (const s of [-1, 1]) {
          b.push(M.mul(M.t(m + s * (dw / 2), 0.2, -0.06), M.ry(s * open)));
          const lw = dw / 2 - 0.01, lh = dh - 0.2;
          b.add('woodDark', shade(box(lw, lh, 0.075, 'y').translate((-s * lw) / 2, lh / 2, 0), () => 1.25));
          for (const q of [0.12, 0.5, 0.88]) b.add('woodDark', box(lw, 0.1, 0.1, 'x').translate((-s * lw) / 2, lh * q, -0.02));
          for (let r = 0; r < 5; r++) for (let q = 0; q < 4; q++) {
            b.inst('stud', 'gilt', () => sphere(0.035, 8, 6).scale(1, 1, 0.6), M.t(-s * lw * (0.14 + 0.24 * q), lh * (0.12 + 0.19 * r), 0.045));
          }
          b.add('gilt', lathe([[0.075, 0], [0.085, 0.01], [0.05, 0.03], [0.0, 0.04]], 10).rotateX(Math.PI / 2).translate(-s * lw * 0.9, lh * 0.5, 0.04));
          b.pop();
        }
      }
    }
    b.pop();
  }
  // 转角铺作
  if (sp.dougong === 2) {
    const cs: Array<[number, number, number]> = [[x1, z1, 0], [x1, z0, Math.PI / 2], [x0, z0, Math.PI], [x0, z1, -Math.PI / 2]];
    for (const [x, z, r] of cs) b.inst(`dgc${k}`, 'wood', () => dougongSet(k, true), M.mul(M.t(x, top, z), M.ry(r)));
  }

  // —— 顶 ——
  b.push(M.t(cx, 0, cz));
  // 檐口的高度由撩檐枋定：屋面在撩檐枋上方约 0.3（椽 + 望板）
  const pd = Math.max(0.5, sp.out - jut), ra = sp.roof.a ?? 0.5, sP = pd / D;
  const y0 = top + dgH + 0.3 - sp.roof.rise * (ra * sP + (1 - ra) * sP * sP);
  const roof = buildRoof(b, { ...sp.roof, W, D, y0, purlin: pd, detail: det });
  b.pop();

  // 悬山：两头山墙补到屋面（柱顶以上的三角）
  if ((sp.roof.sg ?? 1) <= 0) {
    for (const xe of [x0, x1]) {
      const pts: Array<[number, number]> = [[z0 - cz, top - 0.02], [z1 - cz, top - 0.02]];
      for (let i = 0; i <= 12; i++) { const z = z1 - cz - ((z1 - z0) * i) / 12; pts.push([z, roof.heightAt(xe - cx, z) - 0.2]); }
      b.add('plaster', prism(pts, 0.2, 'y').rotateY(-Math.PI / 2).translate(xe, 0, cz));
      b.add('wood', box(0.24, roof.top - 0.5 - top, 0.24, 'y').translate(xe, (roof.top - 0.5 + top) / 2, cz));
    }
  }

  // —— 室内 ——
  if (sp.interior) {
    const cy = top + dgH * 0.55;
    // 梁：沿进深的大梁，架在前后檐柱（及内柱）上
    for (let i = 1; i < xs.length - 1; i++) b.add('woodDark', box(0.34, 0.48, z1 - z0 + 0.4, 'z').translate(xs[i], top + 0.1, cz));
    for (let j = 1; j < zs.length - 1; j++) b.add('woodDark', box(x1 - x0 + 0.4, 0.4, 0.3, 'x').translate(cx, top + 0.1, zs[j]));
    // 平闇：小方格的顶棚
    b.add('woodDark', tint(box(x1 - x0 - 0.2, 0.05, z1 - z0 - 0.2, 'x').translate(cx, cy + 0.06, cz), 0.45));
    const gs = det > 0.5 ? 0.62 : 1.1;
    for (let x = x0 + gs; x < x1; x += gs) b.inst('pa_z', 'woodDark', () => box(0.06, 0.08, z1 - z0 - 0.2, 'z'), M.t(x, cy, cz));
    for (let z = z0 + gs; z < z1; z += gs) b.inst('pa_x', 'woodDark', () => box(x1 - x0 - 0.2, 0.08, 0.06, 'x'), M.t(cx, cy, z));
    // 四壁内侧上部补到顶棚
    b.add('dark', box(x1 - x0 + 0.3, 0.02, z1 - z0 + 0.3).translate(cx, cy + 0.4, cz));
  }
  return { roof, floorY: fy, eaveY: top + dgH, colTop: top, x0, x1, z0, z1 };
}
