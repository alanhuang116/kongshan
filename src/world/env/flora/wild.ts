/**
 * 添的草木（接 cover.ts、field.ts）：人家门前屋后、溪边、路边、林下的那些小东西，四季各有样子。
 *
 *   药圃（先生的三畦）  芍药（春末几朵白、粉的大花）、紫苏与薄荷（夏天最旺，紫苏带紫）、艾与枸杞（秋天枸杞一串红果）；冬天剪了只剩茬
 *   草堂南窗下两盆    西窗一盆兰（四季青，春天几点淡花）、东窗一盆萱草（夏天开橙黄的花）
 *   溪边             蓼（夏秋一穗穗粉红，秋深了偏红）、浮萍（夏秋贴着水的几片）
 *   路边、篱脚        狗尾草（夏青、秋黄）、蒲公英（春天黄花、春末白绒球）、田埂上春天几点荠菜的小白花
 *   竹林边           春天冒出来的笋
 *   篾匠家的丝瓜架    春天才爬上来几片叶，夏天满架、开黄花、垂着长瓜，秋天叶黄瓜老，冬天剩枯藤与一两条干瓜
 *   野萱草           草堂南篱外、几家的山墙下各几丛，夏天开花
 *   新添的树         香椿（冬天光枝上挂着干裂的蒴果）、皂角（秋冬一树长荚）、梧桐（秋天的果）
 *   阴湿处的苔与蕨    草堂与各家的北墙根、竹林下、池北岸——随地上的草一起换季（放在「草」那一层里）
 *   雨后的蘑菇       树根下，下过雨才冒出来（不在季节的那一套里：build.ts 另成一份，跟着雨显隐）
 *
 * 这些只在整园（照总图开的单子）里长；台子上的小单子不长。位置用固定的种子先挑好（四季同一批地方），每季再定画什么。
 */
import type { Season } from '../atmos';
import { PATHS, PLOTS, ROCKS, SITE, STREAM, TREES, YARD_Y, ground, houseY, pathDist, plotAt, streamAt } from '../../site';
import { FIELD, PETAL } from './tiles2';
import { fw, pb } from './tiles3';
import { rand, type RGB, type Rand } from './kit';
import type { RDab, Sink } from './sink';
import type { FieldPlan } from './field';

const F = FIELD.idx, P = PETAL.idx;
const TAU = Math.PI * 2;
type Pt3 = [number, number, number];

/** 草堂台基上两只花盆的土面高（与 build/traces.ts 的盆对得上：台面 + 0.19） */
const POT_Y = YARD_Y + SITE.hall.floor - 0.02 + 0.19;
/** 离这些东西太近的不长（桥、汀步、洗衣埠、水碓、修着的桥、鸭栏） */
const AVOID: Array<[number, number, number]> = [[SITE.bridge.x, SITE.bridge.z, 6], [SITE.stones.x, SITE.stones.z, 5], [SITE.more.wash.x, SITE.more.wash.z, 4], [SITE.more.mill.x, SITE.more.mill.z, 5.5], [SITE.plank.x, SITE.plank.z, 7], [SITE.more.duckPen.x, SITE.more.duckPen.z, 3]];
const avoided = (x: number, z: number) => AVOID.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r);
const inYard = (x: number, z: number) => x > SITE.yard.x0 - 0.3 && x < SITE.yard.x1 + 0.3 && z > SITE.yard.z0 - 0.3 && z < SITE.yard.z1 + 0.3;
/** 屋里（邻家、村塾） */
function inHouse(x: number, z: number, pad = 0.4): boolean {
  for (const h of SITE.houses) {
    const c = Math.cos(h.yaw), s = Math.sin(h.yaw), lx = (x - h.x) * c - (z - h.z) * s, lz = (x - h.x) * s + (z - h.z) * c;
    if (Math.abs(lx) < h.w / 2 + pad && Math.abs(lz) < h.d / 2 + pad) return true;
  }
  return false;
}
/** 带朝向的屋自己的坐标 → 世界 */
const out = (h: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] => [h.x + lx * Math.cos(h.yaw) + lz * Math.sin(h.yaw), h.z - lx * Math.sin(h.yaw) + lz * Math.cos(h.yaw)];

// ———————————————————————————— 挑地方（四季同一批） ————————————————————————————
interface Spots {
  herbs: Array<{ x: number; z: number; bed: number; k: number }>;
  liao: Pt3[]; duck: Pt3[]; daylily: Pt3[]; foxtail: Pt3[]; dandelion: Pt3[]; shoots: Array<Pt3 & { 3?: number }>; shepherd: Pt3[];
  loofah: Pt3[]; cattail: Pt3[];
}
let SPOTS: Spots | null = null;
function spots(): Spots {
  if (SPOTS) return SPOTS;
  const R = rand(31337), S: Spots = { herbs: [], liao: [], duck: [], daylily: [], foxtail: [], dandelion: [], shoots: [], shepherd: [], loofah: [], cattail: [] };
  // 药圃：每畦两列，一列八九棵
  const G = SITE.crafts.herbs;
  G.beds.forEach(([xa, xb], bed) => { for (const u of [0.28, 0.72]) for (let z = G.bz0 + 0.35; z < G.bz1 - 0.2; z += 0.55) S.herbs.push({ x: xa + (xb - xa) * u + R.pm(0.08), z: z + R.pm(0.08), bed, k: R() }); });
  // 溪边的蓼、水上的浮萍
  for (let i = 2; i < STREAM.length - 2; i += 2) {
    const p = STREAM[i];
    if (p.x < -70 || p.x > 125) continue;
    const a = STREAM[i - 1], b = STREAM[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
    for (const s of [-1, 1]) {
      // 蓼：一处一两丛，挨着水
      if (R() < 0.5) for (let k = 0, m = 1 + R.i(2); k < m; k++) {
        const d = p.w + R.r(0.2, 1.2), x = p.x + nx * s * d + R.pm(1.0), z = p.z + nz * s * d + R.pm(1.0), g = ground(x, z), st = streamAt(x, z);
        if (!avoided(x, z) && pathDist(x, z) > 0.7 && g > st.y - 0.04) S.liao.push([x, Math.max(g, st.y), z]);
      }
      // 浮萍：贴着岸的一小片（两三笔）
      if (R() < 0.3) {
        const d = p.w - R.r(0.25, 0.9), x0 = p.x + nx * s * d + R.pm(0.6), z0 = p.z + nz * s * d + R.pm(0.6);
        for (let k = 0, m = 2 + R.i(2); k < m; k++) { const x = x0 + R.pm(0.5), z = z0 + R.pm(0.5), st = streamAt(x, z); if (!avoided(x, z) && ground(x, z) < st.y - 0.05) S.duck.push([x, st.y + 0.012, z]); }
      }
    }
  }
  // 池的东南边几片浮萍（荷在东、北两面，西边近亭留着一片水）
  { const Pd = SITE.pond; for (let i = 0; i < 9; i++) { const a = R.r(0.25, 1.2), q = R.r(0.78, 0.94); S.duck.push([Pd.x + Math.cos(a) * Pd.rx * q, Pd.y + 0.012, Pd.z + Math.sin(a) * Pd.rz * q]); } }
  // 野萱草：草堂南篱外西段（东段有牵牛）、几家山墙根
  { const Y = SITE.yard; for (let x = Y.x0 + 1.2; x < SITE.gate.x - 2.4; x += R.r(1.4, 2.3)) S.daylily.push([x, ground(x, Y.z1 + 0.45), Y.z1 + R.r(0.35, 0.6)]); }
  for (const h of SITE.houses) {
    if (h.id === 'school') continue;
    for (const s of [-1, 1]) { if (R() < 0.45) continue; const [x, z] = out(h, s * (h.w / 2 + R.r(0.45, 0.8)), R.r(-1.2, 1.2)); if (pathDist(x, z) > 0.6 && !inHouse(x, z, 0.3)) S.daylily.push([x, ground(x, z), z]); }
  }
  // 路边：狗尾草、蒲公英；田埂：荠菜
  for (const Pp of PATHS) for (let i = 0; i < Pp.pts.length - 1; i++) {
    const [ax, az] = Pp.pts[i], [bx, bz] = Pp.pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 3.2));
    for (let k = 0; k < n; k++) for (const s of [-1, 1]) {
      const u = R(), t = (k + R()) / n, d = Pp.w / 2 + R.r(0.3, 1.1), x = ax + (bx - ax) * t - ((bz - az) / L) * s * d, z = az + (bz - az) * t + ((bx - ax) / L) * s * d;
      if (u > 0.5 || plotAt(x, z) || inYard(x, z) || inHouse(x, z) || pathDist(x, z) < 0.25 || avoided(x, z)) continue;
      const st = streamAt(x, z), g = ground(x, z);
      if (st.d < st.w + 0.6 && g < st.y + 0.05) continue;
      (u < 0.32 ? S.foxtail : S.dandelion).push([x, g, z]);
    }
  }
  for (const p of PLOTS) {
    const per = 2 * (p.x1 - p.x0 + p.z1 - p.z0), n = Math.round(per / 6);
    for (let k = 0; k < n; k++) {
      let d = R() * per; const o = R.r(0.3, 0.8), w = p.x1 - p.x0, h = p.z1 - p.z0;
      let x: number, z: number;
      if (d < w) { x = p.x0 + d; z = p.z0 - o; } else if ((d -= w) < h) { x = p.x1 + o; z = p.z0 + d; } else if ((d -= h) < w) { x = p.x1 - d; z = p.z1 + o; } else { x = p.x0 - o; z = p.z0 + d - w; }
      if (plotAt(x, z) || pathDist(x, z) < 0.3) continue;
      S.shepherd.push([x, ground(x, z), z]);
    }
  }
  // 竹林边的笋：每丛外沿冒两三只（只在人走得到的那几排）
  for (const t of TREES) {
    if (t.kind !== 'bamboo' || t.z < -46) continue;
    for (let i = 0, m = 1 + R.i(3); i < m; i++) { const a = R.r(0, TAU), q = t.r * t.s * R.r(1.1, 1.75), x = t.x + Math.cos(a) * q, z = t.z + Math.sin(a) * q; if (pathDist(x, z) > 0.5) S.shoots.push([x, ground(x, z), z]); }
  }
  // 丝瓜架顶上的格点
  { const L = SITE.crafts.loofah, ty = ground(L.x, L.z) + L.h; for (let i = 0; i < 26; i++) S.loofah.push([L.x + R.pm(L.w / 2 + 0.15), ty, L.z + R.pm(L.d / 2 + 0.15)]); }
  // 香蒲：池北岸芦苇边的浅水里一溜；几处溪湾（挨着芦苇）
  { const Pd = SITE.pond; for (let i = 0; i < 9; i++) { const a = R.r(-1.95, -1.05), q = R.r(0.93, 1.03), x = Pd.x + Math.cos(a) * Pd.rx * q, z = Pd.z + Math.sin(a) * Pd.rz * q; if (pathDist(x, z) > 0.8) S.cattail.push([x, Math.max(ground(x, z), Pd.y - 0.08), z]); } }
  for (const bx of [-62, 30, 96]) {
    let bi = 0; for (let i = 0; i < STREAM.length; i++) if (Math.abs(STREAM[i].x - bx) < Math.abs(STREAM[bi].x - bx)) bi = i;
    const p = STREAM[bi], a = STREAM[Math.max(0, bi - 1)], b = STREAM[Math.min(STREAM.length - 1, bi + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l, side = R() < 0.5 ? -1 : 1;
    for (let i = 0; i < 3; i++) { const t = R.pm(4), d = p.w + R.r(-0.4, 0.6), x = p.x + ((b.x - a.x) / l) * t + nx * side * d, z = p.z + ((b.z - a.z) / l) * t + nz * side * d; if (!avoided(x, z) && pathDist(x, z) > 0.8) S.cattail.push([x, Math.max(ground(x, z), p.y - 0.08), z]); }
  }
  return (SPOTS = S);
}

// ———————————————————————————— 不随季节变形的：苔、蕨（放在「草」那一层，跟着换色） ————————————————————————————
export function wildFixed(S: Sink, density: number): void {
  S.place(0, 0, 0, 0, 1);
  const R = rand(2718), n = (k: number) => Math.round(k * (0.5 + 0.5 * density));
  const moss = (x: number, z: number) => { const y = ground(x, z), size = R.r(0.3, 0.48); S.dab('grass', x, y + size * 0.14, z, size, R() < 0.5 ? F.tai : F.tai2, 0, 1, 0, R.r(0.58, 0.78), [0.9, 1, 0.95], R.pm(0.2), 0.05); };
  const fern = (x: number, z: number, big = 1) => { const y = ground(x, z), size = R.r(0.5, 0.78) * big; S.dab('grass', x, y + size * 0.42, z, size, F.jue, R.pm(0.3), 1, R.pm(0.3), R.r(0.78, 0.98), [0.95, 1, 0.95], R.pm(0.1), 0.4); };
  // 草堂北墙根：背阴，一溜苔，几丛蕨
  { const H = SITE.hall, z = H.z - H.d / 2 - 0.75; for (let i = 0; i < n(16); i++) { const x = H.x + R.pm(H.w / 2 + 0.3), zz = z - R.r(0, 0.5); if (R() < 0.65) moss(x, zz); else fern(x, zz, 0.85); } }
  // 各家北墙根（屋后）
  for (const h of SITE.houses) for (let i = 0; i < n(7); i++) { const [x, z] = out(h, R.pm(h.w / 2), -h.d / 2 - R.r(0.5, 1.0)); if (pathDist(x, z) < 0.4) continue; if (R() < 0.6) moss(x, z); else fern(x, z, 0.8); }
  // 竹林下：疏疏几丛蕨
  for (const t of TREES) { if (t.kind !== 'bamboo' || t.z < -46 || R() < 0.45) continue; const a = R.r(0, TAU), q = t.r * t.s * R.r(0.5, 1.2); fern(t.x + Math.cos(a) * q, t.z + Math.sin(a) * q, R.r(0.9, 1.2)); }
  // 池北岸：蕨、苔
  { const Pd = SITE.pond; for (let i = 0; i < n(14); i++) { const a = R.r(-2.6, -0.8), q = R.r(1.12, 1.35), x = Pd.x + Math.cos(a) * Pd.rx * q, z = Pd.z + Math.sin(a) * Pd.rz * q; if (pathDist(x, z) < 0.4) continue; if (R() < 0.5) fern(x, z); else moss(x, z); } }
  // 溪边石头的背阴面：苔
  for (const r of ROCKS) { if (R() < 0.6) continue; const a = R.r(-2.4, -0.8), d = r.r * R.r(0.8, 1.1); moss(r.x + Math.cos(a) * d, r.z + Math.sin(a) * d); }
}

// ———————————————————————————— 每季一套 ————————————————————————————
export interface WildSet { wash: RDab[]; body: RDab[] }
export function wildSet(se: Season, f: FieldPlan): WildSet {
  const wash: RDab[] = [], body: RDab[] = [], R = rand(9090 + ['spring', 'summer', 'autumn', 'winter'].indexOf(se) * 53);
  const sp = se === 'spring', su = se === 'summer', au = se === 'autumn', wi = se === 'winter';
  const keep = 0.55 + 0.45 * f.density, big = 1 + 0.25 * (1 - keep);
  /** 落一笔（同 field.ts 的 put）：y 是脚下的地，up 是笔心离地几成 */
  const put = (L: RDab[], x: number, y: number, z: number, size: number, tile: number, c: RGB, tone: number, up = 0.46, sway = 0.5, rot = 0, must = false) => {
    if (!must && R() > keep) return;
    const s = size * big;
    L.push({ x, y: y + s * up, z, size: s, tile, nx: R.pm(0.3), ny: 1, nz: R.pm(0.3), r: c[0] * tone, g: c[1] * tone, b: c[2] * tone, rot: rot || R.pm(0.07), sway, k: R() });
  };
  const S = spots();
  const G0: RGB = [0.7, 0.82, 0.58], G1: RGB = [0.62, 0.76, 0.56], DRY: RGB = [0.84, 0.78, 0.62], WHITE: RGB = [1, 0.99, 0.95];

  // —— 药圃 ——
  for (const h of S.herbs) {
    const y = f.ground(h.x, h.z) + 0.06;
    if (h.bed === 0) {
      // 芍药：春天叶正长、末梢开几朵大花（白、淡粉）；夏叶浓；秋叶黄；冬天剪了
      if (wi) { if (h.k < 0.3) put(wash, h.x, y, h.z, R.r(0.3, 0.4), F.haoDry, DRY, 1, 0.45, 0.2); continue; }
      for (let i = 0; i < 2; i++) put(wash, h.x + R.pm(0.08), y, h.z + R.pm(0.08), sp ? R.r(0.5, 0.62) : su ? R.r(0.6, 0.72) : R.r(0.5, 0.62), F.juLeaf, sp ? G0 : su ? G1 : [0.86, 0.78, 0.58], R.r(0.86, 1.04), 0.47, 0.35);
      if (sp && h.k < 0.36) put(body, h.x + R.pm(0.06), y + R.r(0.42, 0.55), h.z + R.pm(0.06), R.r(0.22, 0.28), pb('shaoyao'), h.k < 0.18 ? WHITE : [1, 0.88, 0.91], R.r(0.96, 1.02), 0, 0.4, R.r(0, TAU));
    } else if (h.bed === 1) {
      // 紫苏（带紫）与薄荷（青）隔着种
      const purple = h.k < 0.5;
      if (wi) continue;
      put(wash, h.x, y, h.z, sp ? R.r(0.3, 0.38) : su ? R.r(0.55, 0.68) : R.r(0.5, 0.6), fw('zisu'), au ? [0.84, 0.74, 0.66] : purple ? [0.8, 0.7, 0.76] : [0.66, 0.8, 0.6], R.r(0.86, 1.04), 0.46, 0.35);
    } else {
      // 艾（灰绿）；畦的两头是枸杞，秋天一串串红果
      const goji = h.z < SITE.crafts.herbs.bz0 + 1.0 || h.z > SITE.crafts.herbs.bz1 - 0.9;
      if (goji) {
        put(wash, h.x, y, h.z, R.r(0.75, 0.95), fw('gouqi'), wi ? [0.78, 0.72, 0.64] : au ? [0.78, 0.8, 0.6] : G1, R.r(0.86, 1.04), 0.46, 0.4, 0, true);
        if (au) for (let i = 0; i < 6; i++) put(body, h.x + R.pm(0.3), y + R.r(0.25, 0.6), h.z + R.pm(0.3), R.r(0.07, 0.1), P.guo, [0.96, 0.46, 0.4], R.r(0.95, 1.02), 0, 0.4, R.pm(0.5));
      } else if (wi) { if (h.k < 0.4) put(wash, h.x, y, h.z, R.r(0.4, 0.55), F.haoDry, DRY, 1, 0.46, 0.3); }
      else put(wash, h.x, y, h.z, sp ? R.r(0.38, 0.5) : R.r(0.62, 0.8), F.hao, au ? [0.82, 0.8, 0.64] : [0.76, 0.82, 0.7], R.r(0.86, 1.04), 0.47, 0.4);
    }
  }

  // —— 院子东北角的葱韭畦：四季都有一点（冬天韭菜枯了，葱还青着几棵） ——
  {
    const K = SITE.crafts.kitchenBed;
    for (let x = K.x0 + 0.25; x < K.x1 - 0.15; x += 0.4) for (let z = K.z0 + 0.25; z < K.z1 - 0.15; z += 0.36) {
      const leek = x < (K.x0 + K.x1) / 2;
      if (wi && (leek || R() < 0.5)) continue;
      // 西半畦是韭（矮、密、色嫩），东半畦是葱（高些）
      put(wash, x + R.pm(0.05), YARD_Y + 0.03, z + R.pm(0.05), (leek ? 0.34 : 0.46) * (sp ? 0.85 : 1) * R.r(0.85, 1.1), F.cong, leek ? [0.68, 0.81, 0.58] : [0.62, 0.76, 0.6], R.r(0.86, 1.04), 0.46, 0.35);
    }
  }

  // —— 草堂南窗下的两盆 ——
  for (const p of SITE.pots) {
    if (p.kind === 'orchid') {
      put(wash, p.x, POT_Y, p.z, 0.46, fw('lan'), wi ? [0.6, 0.72, 0.6] : [0.62, 0.77, 0.6], 1, 0.47, 0.3, 0, true);
      if (sp) for (let i = 0; i < 3; i++) put(body, p.x + R.pm(0.08), POT_Y + R.r(0.12, 0.2), p.z + R.pm(0.05), R.r(0.07, 0.09), P.yehua1, [0.96, 0.98, 0.84], 1, 0, 0.3, R.r(0, TAU), true);
    } else {
      if (wi) { put(wash, p.x, POT_Y, p.z, 0.3, F.haoDry, DRY, 1, 0.46, 0.2, 0, true); continue; }
      put(wash, p.x, POT_Y, p.z, sp ? 0.36 : 0.5, fw('xuanLeaf'), au ? [0.86, 0.8, 0.58] : sp ? G0 : G1, 1, 0.46, 0.35, 0, true);
      if (su) put(body, p.x + 0.04, POT_Y + 0.3, p.z, 0.36, pb('xuanhua'), [1, 0.78, 0.44], 1, 0.3, 0.4, 0, true);
    }
  }

  // —— 溪边的蓼、水上的浮萍 ——
  for (const [x, y, z] of S.liao) {
    if (wi) { if (R() < 0.35) put(wash, x, y, z, R.r(0.5, 0.7), F.haoDry, [0.8, 0.72, 0.62], 1, 0.46, 0.4); continue; }
    if (sp) { put(wash, x, y, z, R.r(0.32, 0.45), F.kuo, G0, R.r(0.88, 1.04), 0.36, 0.3); continue; }
    put(body, x, y, z, R.r(0.55, 0.78), pb('liao'), au ? [0.96, 0.6, 0.62] : [1, 0.76, 0.8], R.r(0.95, 1.02), 0.45, 0.6);
  }
  if (su || au) for (const [x, y, z] of S.duck) put(wash, x, y, z, R.r(0.38, 0.6), fw('fuping'), au ? [0.78, 0.8, 0.6] : [0.64, 0.8, 0.56], R.r(0.88, 1.04), 0.06, 0.1);
  // 香蒲：春天只有新叶；夏秋抽出蒲棒；冬天枯了、折了几根
  for (const [x, y, z] of S.cattail) {
    if (sp) put(wash, x, y, z, R.r(0.6, 0.85), F.changpu, G0, R.r(0.88, 1.04), 0.46, 0.5);
    else if (wi) { if (R() < 0.55) put(wash, x, y, z, R.r(0.9, 1.2), fw('xiangpu'), [0.82, 0.76, 0.64], R.r(0.9, 1.04), 0.47, 0.5); }
    else put(wash, x, y, z, R.r(1.1, 1.45), fw('xiangpu'), au ? [0.86, 0.78, 0.58] : [0.66, 0.78, 0.56], R.r(0.88, 1.04), 0.47, 0.6);
  }

  // —— 野萱草 ——
  for (const [x, y, z] of S.daylily) {
    if (wi) { if (R() < 0.4) put(wash, x, y, z, R.r(0.4, 0.55), F.haoDry, DRY, 1, 0.46, 0.3); continue; }
    put(wash, x, y, z, sp ? R.r(0.38, 0.5) : R.r(0.62, 0.8), fw('xuanLeaf'), au ? [0.86, 0.8, 0.58] : sp ? G0 : G1, R.r(0.86, 1.04), 0.46, 0.4);
    if (su && R() < 0.7) put(body, x + R.pm(0.1), y + R.r(0.45, 0.6), z + R.pm(0.1), R.r(0.4, 0.5), pb('xuanhua'), [1, 0.78, 0.44], R.r(0.96, 1.02), 0.3, 0.45);
  }

  // —— 路边：狗尾草（夏青秋黄，冬天剩几根枯的）；蒲公英（春天黄花，暮春白绒球）；田埂上的荠菜 ——
  for (const [x, y, z] of S.foxtail) {
    if (sp) continue;
    if (wi) { if (R() < 0.3) put(wash, x, y, z, R.r(0.4, 0.55), fw('gouwei'), [0.84, 0.8, 0.68], 1, 0.46, 0.5); continue; }
    put(wash, x, y, z, R.r(0.48, 0.66), fw('gouwei'), au ? [0.9, 0.84, 0.6] : [0.7, 0.8, 0.56], R.r(0.86, 1.04), 0.46, 0.7);
  }
  if (sp) for (const [x, y, z] of S.dandelion) {
    if (R() < 0.55) put(body, x, y, z, R.r(0.24, 0.32), P.yehua0, [1, 0.9, 0.45], 1, 0.4, 0.3, R.r(0, TAU));
    else put(body, x, y, z, R.r(0.36, 0.46), pb('pugong'), WHITE, R.r(0.96, 1.02), 0.46, 0.5);
  }
  if (sp) for (const [x, y, z] of S.shepherd) if (R() < 0.6) put(body, x, y, z, R.r(0.22, 0.3), P.yehua1, [1, 1, 0.94], 1, 0.4, 0.3, R.r(0, TAU));

  // —— 竹林边的笋（只在春天） ——
  if (sp) for (const [x, y, z] of S.shoots) put(wash, x, y, z, R.r(0.38, 0.7), fw('sun'), [0.86, 0.8, 0.68], R.r(0.9, 1.04), 0.47, 0.05);

  // —— 篾匠家的丝瓜 ——
  {
    const L = SITE.crafts.loofah;
    if (sp) for (let i = 0; i < 7; i++) { const x = L.x + (R() < 0.5 ? -1 : 1) * L.w / 2, z = L.z + R.pm(L.d / 2), gy = f.ground(x, z); put(wash, x, gy + R.r(0.3, 1.2), z, R.r(0.3, 0.42), F.guaLeaf, [0.76, 0.86, 0.6], 1, 0, 0.5, R.r(0, TAU), true); }
    if (su || au) {
      for (const [x, y, z] of S.loofah) put(wash, x, y + R.r(-0.05, 0.22), z, R.r(0.5, 0.75), F.guaLeaf, su ? G1 : [0.84, 0.82, 0.58], R.r(0.82, 1.04), 0, 0.5, R.r(0, TAU), true);
      for (let i = 0; i < (su ? 9 : 5); i++) { const x = L.x + (R() < 0.5 ? -1 : 1) * (L.w / 2 + 0.05), z = L.z + R.pm(L.d / 2), gy = f.ground(x, z); put(wash, x, gy + R.r(0.8, 1.7), z, R.r(0.4, 0.6), F.teng, su ? G1 : [0.84, 0.82, 0.58], 1, 0, 0.4, R.pm(0.4) + Math.PI / 2, true); }
      const ty = f.ground(L.x, L.z) + L.h;
      for (let i = 0; i < (su ? 5 : 3); i++) put(body, L.x + R.pm(L.w / 2 - 0.15), ty - R.r(0.35, 0.6), L.z + R.pm(L.d / 2 - 0.15), R.r(0.42, 0.56), pb('sigua'), su ? [0.8, 0.9, 0.7] : [0.88, 0.82, 0.62], R.r(0.95, 1.02), 0, 0.3, R.pm(0.1), true);
      if (su) for (let i = 0; i < 7; i++) put(body, L.x + R.pm(L.w / 2), ty + R.r(0.0, 0.18), L.z + R.pm(L.d / 2), R.r(0.14, 0.18), P.yehua1, [1, 0.9, 0.46], 1, 0, 0.4, R.r(0, TAU), true);
    }
    if (wi) {
      for (let i = 0; i < 6; i++) { const x = L.x + R.pm(L.w / 2), z = L.z + R.pm(L.d / 2), ty = f.ground(L.x, L.z) + L.h; put(wash, x, ty + R.r(-0.1, 0.1), z, R.r(0.5, 0.7), F.tengDry, [0.78, 0.72, 0.6], 1, 0, 0.3, R.pm(0.4), true); }
      put(body, L.x + 0.3, f.ground(L.x, L.z) + L.h - 0.45, L.z - 0.4, 0.45, pb('sigua'), [0.82, 0.74, 0.6], 1, 0, 0.3, 0.1, true);
    }
  }

  // —— 新添的树：香椿冬天挂着干裂的蒴果；皂角秋冬一树长荚；梧桐秋天几簇果 ——
  for (const fr of f.fruit) {
    if (!fr.tips.length) continue;
    const at = (j: number) => { const t = fr.tips[R.i(fr.tips.length)]; return [t.x + R.pm(j), t.y + R.pm(j) - 0.12, t.z + R.pm(j)] as const; };
    const kind = fr.kind as string;
    if (kind === 'toona' && (wi || au)) for (let i = 0; i < (wi ? 14 : 8); i++) { const [x, y, z] = at(0.35); put(body, x, y, z, R.r(0.2, 0.28), pb('chunguo'), wi ? [0.78, 0.66, 0.56] : [0.82, 0.76, 0.6], R.r(0.94, 1.03), 0, 0.4, R.pm(0.5), true); }
    if (kind === 'gleditsia' && (au || wi)) for (let i = 0; i < (au ? 18 : 10); i++) { const [x, y, z] = at(0.5); put(body, x, y - 0.15, z, R.r(0.45, 0.6), pb('zaojia'), au ? [0.7, 0.62, 0.5] : [0.56, 0.47, 0.42], R.r(0.94, 1.03), 0, 0.5, R.pm(0.15), true); }
    if (kind === 'firmiana' && au) for (let i = 0; i < 10; i++) { const [x, y, z] = at(0.4); put(body, x, y, z, R.r(0.22, 0.3), pb('chunguo'), [0.88, 0.8, 0.6], R.r(0.94, 1.03), 0, 0.4, R.pm(0.5), true); }
  }
  void houseY;
  return { wash, body };
}

/** 雨后的蘑菇：树根下几处，一处两三朵（四季同一批地方；冬天不出） */
export function mushrooms(density: number, extra: Array<{ x: number; z: number; r: number }>): RDab[] {
  const R = rand(4444), outA: RDab[] = [];
  const trunks: Array<{ x: number; z: number; r: number }> = [...TREES.filter((t) => (t.kind === 'wood' || t.kind === 'willow' || t.kind === 'elm' || t.kind === 'mulberry' || t.kind === 'peach') && t.z > -36 && t.z < 150).map((t) => ({ x: t.x, z: t.z, r: t.r * t.s })), ...extra];
  for (const t of trunks) {
    if (R() > 0.42 * (0.5 + 0.5 * density)) continue;
    const a = R.r(0, TAU), d = t.r + R.r(0.25, 0.8), x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
    if (pathDist(x, z) < 0.4 || plotAt(x, z) || inHouse(x, z)) continue;
    const st = streamAt(x, z), y = ground(x, z);
    if (st.d < st.w + 0.5 && y < st.y + 0.05) continue;
    // 伞盖多是淡褐的，间几处白的
    const s = R.r(0.24, 0.36), white = R() < 0.3;
    outA.push({ x, y: y + s * 0.42, z, size: s, tile: pb('mogu'), nx: 0, ny: 1, nz: 0, r: white ? 0.97 : 0.86, g: white ? 0.95 : 0.73, b: white ? 0.9 : 0.6, rot: R.pm(0.08), sway: 0, k: R() });
  }
  return outA;
}
