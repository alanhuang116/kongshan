/**
 * 四季各一套的东西：田里的庄稼、菜畦、菊圃、池荷、水边的芦苇、几点野花。它们四季形状不同，换颜料不够，
 * 所以每季搭一套（fieldSet），用到时才搭、搭过留着；架子、垄这些不变的只搭一次（fieldFixed）。
 *
 *   麦   春：青苗成行；夏：黄熟，高了；秋：收过的茬间出了新苗；冬：稀稀的苗
 *   油菜 春：菜花（淡黄——桃花之外仅有的一点颜色，要淡）；夏：结荚；秋冬：贴地的菜秧
 *   豆   竹架常在；春：架脚的矮苗；夏：爬满架；秋：枯藤
 *   菜   一畦畦的青菜、白菜、葱韭
 *   新翻的地（正在耕的公田）  春：只有垄；夏：谷子的青苗；秋：谷穗黄了；冬：茬
 *   荒地 春夏是草与蒿，秋冬枯
 *   菊   十六丛。秋天开（黄、白）——秋天的主花；春夏只是叶，冬天是枯茎
 *   荷   夏天满池的叶与花——夏天的主花；秋天残荷、莲蓬；春冬没有
 *   芦苇 春：新笋夹着去年的枯秆；夏：青；秋：抽了花；冬：枯
 * 笔的颜料写在每一笔上（材质的颜料是白的），所以一季只有两次绘制：淡彩一层、粉一层。
 */
import type { Season } from '../atmos';
import type { Plot, Rect } from '../../site';
import { FGeo, clamp01, lerp, rand, tube, v3, type RGB, type Rand, type V3 } from './kit';
import type { RDab, Sink } from './sink';
import { FIELD, PETAL } from './tiles2';
import type { Reed } from './cover';
import type { ExtraKind, Extras } from './extras';

const F = FIELD.idx, P = PETAL.idx;
const TAU = Math.PI * 2;

export interface Pond { x: number; z: number; rx: number; rz: number; y: number }
export interface FieldPlan {
  plots: Plot[]; veg: Rect | null; mums: Rect | null; pond: Pond | null;
  reeds: Reed[]; wild: Array<[number, number, number]>;
  /** 路边（春天的野花）、田埂（秋天的野菊） */
  lane: Array<[number, number, number]>; bund: Array<[number, number, number]>;
  /** 人家门前屋后的零碎（瓜架、门边的花、南瓜、葱、篱上的牵牛） */
  extras: Extras | null;
  /** 果树的枝梢（世界坐标）：挂果、开花 */
  fruit: Array<{ kind: ExtraKind; tips: V3[] }>;
  ground: (x: number, z: number) => number;
  /** 这一处能不能种（菜畦一角有路穿过） */
  clear: (x: number, z: number) => boolean;
  density: number;
}
export interface FieldSet { wash: RDab[]; body: RDab[]; /** 荷叶、梗（面） */ pads: FGeo }

/** 沿垄走：rows 0 垄东西向（一行沿 x），1 南北向。回调 (x, z, 第几行, 行里第几个) */
function eachRow(p: Rect & { rows: 0 | 1 }, gap: number, step: number, inset: number, R: Rand, fn: (x: number, z: number, row: number, i: number) => void) {
  const along = p.rows === 0 ? [p.x0 + inset, p.x1 - inset] : [p.z0 + inset, p.z1 - inset], across = p.rows === 0 ? [p.z0 + inset, p.z1 - inset] : [p.x0 + inset, p.x1 - inset];
  const nr = Math.max(1, Math.round((across[1] - across[0]) / gap)), ns = Math.max(1, Math.round((along[1] - along[0]) / step));
  for (let r = 0; r <= nr; r++) {
    const c = across[0] + ((across[1] - across[0]) * r) / nr, ph = R();
    for (let i = 0; i < ns; i++) {
      const a = along[0] + ((along[1] - along[0]) * (i + ph)) / ns, j = R.pm(0.06);
      if (p.rows === 0) fn(a, c + j, r, i); else fn(c + j, a, r, i);
    }
  }
}
/** 豆架立在哪（搭架与点藤用同一份） */
function beanSpots(p: Plot): Array<[number, number, number]> {
  const R = rand(Math.round(p.x0 * 31 + p.z0 * 17) + 5), out: Array<[number, number, number]> = [];
  eachRow(p, 1.5, 1.5, 1.6, R, (x, z) => out.push([x + R.pm(0.1), z + R.pm(0.1), R.r(1.75, 2.05)]));
  return out;
}
/** 菊：十六丛，四行四列，行列略不齐（数得清） */
function mumSpots(m: Rect): Array<[number, number, number]> {
  const R = rand(1016), out: Array<[number, number, number]> = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out.push([m.x0 + ((i + 0.5) / 4) * (m.x1 - m.x0) + R.pm(0.2), m.z0 + ((j + 0.5) / 4) * (m.z1 - m.z0) + R.pm(0.22), R()]);
  return out;
}

/** 不随季节变的：豆架、垄（瓜架是屋舍那边搭的） */
export function fieldFixed(S: Sink, f: FieldPlan) {
  S.place(0, 0, 0, 0, 1);
  const culm = new FGeo(), soil = new FGeo(), R = rand(77), BAM: RGB = [0.9, 0.86, 0.66];
  const pole = (a: V3, b: V3, r: number, sides = 3) => tube(culm, [a, b], [r, r * 0.8], { sides, col: [BAM[0] * R.r(0.9, 1.05), BAM[1] * R.r(0.9, 1.05), BAM[2]], uSpan: 1, vPerM: 2.6, v0: R() });
  for (const p of f.plots) {
    if (p.crop === 'bean') for (const [x, z, h] of beanSpots(p)) pole(v3(x, p.y - 0.15, z), v3(x + R.pm(0.14), p.y + h, z + R.pm(0.14)), 0.02);
    // 垄：新翻的地一道道起着；菜地是一畦畦高出一点的床
    if (p.crop === 'plough' || p.crop === 'veg') {
      const veg = p.crop === 'veg', gap = veg ? 3.0 : 1.0, half = veg ? 1.15 : 0.1, hgt = veg ? 0.08 : 0.12, inset = veg ? 1.9 : 1.4;
      const len = p.rows === 0 ? p.x1 - p.x0 - inset * 2 : p.z1 - p.z0 - inset * 2, wid = p.rows === 0 ? p.z1 - p.z0 - inset * 2 : p.x1 - p.x0 - inset * 2;
      const n = Math.max(1, Math.round(wid / gap)), seg = 6, col: RGB = veg ? [0.9, 0.85, 0.76] : [0.85, 0.77, 0.68];
      for (let r = 0; r <= n; r++) {
        const c = (p.rows === 0 ? p.z0 : p.x0) + inset + (wid * r) / n, base = soil.n, ph = R.r(0, 6);
        for (let i = 0; i <= seg; i++) {
          const a = (p.rows === 0 ? p.x0 : p.z0) + inset + (len * i) / seg, w = c + 0.12 * Math.sin(i * 1.7 + ph), e = i === 0 || i === seg ? 0.2 : 1, k = R.r(0.9, 1.05);
          // 截面：左脚、左肩、右肩、右脚
          for (const [o, h, ny] of [[-half - 0.22, 0, 0.5], [-half * 0.7, hgt * e, 1], [half * 0.7, hgt * e, 1], [half + 0.22, 0, 0.5]] as Array<[number, number, number]>) {
            const x = p.rows === 0 ? a : w + o, z = p.rows === 0 ? w + o : a, nx = p.rows === 0 ? 0 : Math.sign(o) * 0.8, nz = p.rows === 0 ? Math.sign(o) * 0.8 : 0, l = Math.hypot(nx, ny, nz);
            soil.v(x, p.y + h - 0.01, z, nx / l, ny / l, nz / l, a, o, col[0] * k, col[1] * k, col[2] * k, 0);
          }
        }
        for (let i = 0; i < seg; i++) for (let j = 0; j < 3; j++) { const q = base + i * 4 + j; if (p.rows === 0) soil.quad(q, q + 1, q + 5, q + 4); else soil.quad(q, q + 4, q + 5, q + 1); }
      }
    }
  }
  S.wood('culm', culm); S.wood('soil', soil);
}

/** 一季的一套 */
export function fieldSet(se: Season, f: FieldPlan): FieldSet {
  const wash: RDab[] = [], body: RDab[] = [], pads = new FGeo(), R = rand(4242 + ['spring', 'summer', 'autumn', 'winter'].indexOf(se) * 97);
  const D = f.density, keep = 0.55 + 0.45 * D, big = 1 + 0.25 * (1 - keep);
  /** 落一笔。y 是这一笔脚下的地；up 是笔心离地多高（占笔的几成） */
  const put = (L: RDab[], x: number, y: number, z: number, size: number, tile: number, c: RGB, tone: number, up = 0.46, sway = 0.5, rot = 0) => {
    if (R() > keep) return;
    const s = size * big;
    L.push({ x, y: y + s * up, z, size: s, tile, nx: R.pm(0.3), ny: 1, nz: R.pm(0.3), r: c[0] * tone, g: c[1] * tone, b: c[2] * tone, rot: rot || R.pm(0.07), sway, k: R() });
  };
  const sp = se === 'spring', su = se === 'summer', au = se === 'autumn', wi = se === 'winter';

  // —— 田 ——
  for (const p of f.plots) {
    const y = p.y;
    switch (p.crop) {
      case 'wheat':
        eachRow(p, 1.0, 0.8, 1.3, R, (x, z) => {
          if (sp) put(wash, x, y, z, R.r(0.86, 1.06), F.maiYoung, [0.7, 0.82, 0.56], R.r(0.86, 1.06), 0.46, 0.6);
          else if (su) put(wash, x, y, z, R.r(1.05, 1.28), F.maiRipe, [0.93, 0.86, 0.64], R.r(0.9, 1.06), 0.47, 0.8);
          else if (au) { if (R() < 0.3) put(wash, x, y, z, R.r(0.7, 0.9), F.maiStub, [0.87, 0.79, 0.62], R.r(0.9, 1.05), 0.46, 0.1); else put(wash, x, y, z, R.r(0.6, 0.8), F.maiSprout, [0.7, 0.83, 0.56], R.r(0.88, 1.05), 0.46, 0.3); }
          else if (R() < 0.62) put(wash, x, y, z, R.r(0.5, 0.7), F.maiSprout, [0.66, 0.77, 0.58], R.r(0.86, 1.02), 0.46, 0.2);
        });
        break;
      case 'rape':
        eachRow(p, 1.15, 1.0, 1.4, R, (x, z) => {
          if (sp) {
            const s = R.r(0.98, 1.2);
            put(wash, x, y, z, s, F.caiPlant, [0.72, 0.83, 0.58], R.r(0.86, 1.05), 0.47, 0.6);
            // 菜花：淡黄，一行里有开得满的、有才打苞的
            if (R() < 0.9) { const v = R(); put(body, x + R.pm(0.12), y + s * 0.5, z + R.pm(0.12), R.r(0.72, 0.96), R() < 0.5 ? P.caihua0 : P.caihua1, v < 0.25 ? [1, 0.985, 0.8] : [1, 0.955, 0.66], R.r(0.97, 1.02), 0.3, 0.7); }
          } else if (su) put(wash, x, y, z, R.r(1.0, 1.2), F.caiPod, [0.8, 0.82, 0.58], R.r(0.88, 1.05), 0.47, 0.7);
          else if (R() < (au ? 0.85 : 0.6)) put(wash, x, y, z, R.r(0.42, 0.58) * (au ? 1 : 0.9), F.caiSeed, au ? [0.7, 0.82, 0.58] : [0.66, 0.75, 0.6], R.r(0.86, 1.04), 0.44, 0.15);
        });
        break;
      case 'bean':
        for (const [x, z, h] of beanSpots(p)) {
          if (sp) put(wash, x + R.pm(0.1), y, z + R.pm(0.1), R.r(0.5, 0.66), F.douLow, [0.72, 0.84, 0.58], R.r(0.88, 1.05), 0.36, 0.3);
          else if (su) { put(wash, x, y, z, h * R.r(0.9, 1.02), F.douVine, [0.64, 0.78, 0.55], R.r(0.84, 1.06), 0.49, 0.6); if (R() < 0.5) put(wash, x + R.pm(0.2), y, z + R.pm(0.2), R.r(0.5, 0.7), F.douLow, [0.62, 0.76, 0.55], R.r(0.8, 1), 0.36, 0.3); }
          else if (au) put(wash, x, y, z, h * R.r(0.8, 0.95), F.douDry, [0.84, 0.74, 0.55], R.r(0.86, 1.05), 0.49, 0.5);
          else if (R() < 0.25) put(wash, x, y, z, h * R.r(0.6, 0.85), F.douDry, [0.8, 0.75, 0.66], R.r(0.9, 1.05), 0.49, 0.4);
        }
        break;
      case 'veg': {
        // 一畦三行：畦与畦之间留着沟（与 fieldFixed 里床的位置对着）
        const across = p.rows === 0 ? [p.z0, p.z1] : [p.x0, p.x1], along = p.rows === 0 ? [p.x0, p.x1] : [p.z0, p.z1];
        const wid = across[1] - across[0] - 3.8, beds = Math.max(1, Math.round(wid / 3.0));
        for (let b = 0; b <= beds; b++) {
          const c = across[0] + 1.9 + (wid * b) / beds, kind = b % 3, step = kind === 0 ? 0.74 : 0.6;
          for (const off of [-0.72, 0, 0.72]) for (let a = along[0] + 2 + R() * step; a < along[1] - 2; a += step) {
            const u = c + off + R.pm(0.05);
            if (p.rows === 0) veg(a, u, y + 0.08, kind); else veg(u, a, y + 0.08, kind);
          }
        }
        break;
      }
      case 'plough':
        eachRow(p, 1.0, 0.85, 1.4, R, (x, z) => {
          if (sp) { if (R() < 0.06) put(wash, x, y + 0.1, z, R.r(0.3, 0.45), F.tai, [0.62, 0.54, 0.48], R.r(0.85, 1.05), 0.14, 0); }
          else if (su) put(wash, x, y + 0.12, z, R.r(1.05, 1.35), F.maiYoung, [0.64, 0.78, 0.52], R.r(0.84, 1.05), 0.46, 0.7);
          else if (au) put(wash, x, y + 0.12, z, R.r(1.25, 1.5), F.guRipe, [0.92, 0.84, 0.6], R.r(0.9, 1.06), 0.47, 0.8);
          else if (R() < 0.3) put(wash, x, y + 0.12, z, R.r(0.6, 0.8), F.maiStub, [0.82, 0.76, 0.64], R.r(0.9, 1.05), 0.46, 0.1);
        });
        break;
      case 'fallow': {
        const n = Math.round(((p.x1 - p.x0 - 2.4) * (p.z1 - p.z0 - 2.4)) / 2.4);
        for (let i = 0; i < n; i++) {
          const x = R.r(p.x0 + 1.2, p.x1 - 1.2), z = R.r(p.z0 + 1.2, p.z1 - 1.2), u = R();
          if (sp) put(wash, x, y, z, R.r(0.4, 0.7), u < 0.6 ? (R() < 0.5 ? F.cao0 : F.cao1) : u < 0.8 ? F.caoShort : u < 0.9 ? F.sanye : F.kuo, [0.74, 0.84, 0.6], R.r(0.82, 1.06), u < 0.8 ? 0.46 : 0.36, 0.5);
          else if (su) put(wash, x, y, z, u < 0.45 ? R.r(1.0, 1.45) : R.r(0.5, 0.8), u < 0.45 ? F.hao : R() < 0.5 ? F.cao0 : F.cao1, [0.66, 0.78, 0.56], R.r(0.8, 1.06), 0.47, 0.7);
          else if (au) put(wash, x, y, z, u < 0.5 ? R.r(0.9, 1.3) : R.r(0.45, 0.75), u < 0.5 ? F.haoDry : R() < 0.5 ? F.cao0 : F.cao1, [0.88, 0.8, 0.58], R.r(0.84, 1.06), 0.47, 0.6);
          else if (u < 0.45) put(wash, x, y, z, R.r(0.7, 1.1), F.haoDry, [0.84, 0.79, 0.68], R.r(0.88, 1.05), 0.47, 0.5);
          if ((sp || su) && R() < 0.035) put(body, x, y, z, R.r(0.3, 0.42), R() < 0.5 ? P.yehua0 : P.yehua1, [1, 1, 0.94], 1, 0.6, 0.4, R.r(0, TAU));
        }
        break;
      }
    }
  }
  /** 一棵菜（kind：0 白菜，1 青菜，2 葱韭） */
  function veg(x: number, z: number, y: number, kind: number) {
    if (!f.clear(x, z)) return;
    const grow = sp ? 0.8 : su ? 1.05 : au ? 1.15 : 0.9;
    if (wi && (kind !== 0 || R() < 0.6)) return;
    if (kind === 0) put(wash, x, y, z, R.r(0.46, 0.6) * grow, F.baicai, au || wi ? [0.8, 0.87, 0.66] : [0.72, 0.84, 0.58], R.r(0.86, 1.06), 0.42, 0.1);
    else if (kind === 1) put(wash, x, y, z, R.r(0.4, 0.52) * grow, F.qingcai, [0.64, 0.79, 0.54], R.r(0.84, 1.05), 0.45, 0.2);
    else put(wash, x, y, z, R.r(0.46, 0.62) * grow, F.cong, [0.62, 0.76, 0.58], R.r(0.84, 1.05), 0.46, 0.4);
  }

  // —— 菜畦（院西）：几畦菜，让开当中的瓜架 ——
  const ex = f.extras, tr = ex?.trellis ?? null;
  if (f.veg) {
    const v = f.veg;
    let b = 0;
    for (let x = v.x0 + 0.9; x < v.x1 - 0.4; x += 0.78, b++) {
      if (b % 3 === 2) continue;
      const kind = Math.floor(b / 3) % 3 === 0 ? 2 : Math.floor(b / 3) % 3 === 1 ? 1 : 0;
      for (let z = v.z0 + 0.8; z < v.z1 - 0.6; z += kind === 0 ? 0.72 : 0.58) {
        const px = x + R.pm(0.05), pz = z + R.pm(0.1);
        if (tr && Math.abs(px - tr.x) < tr.w / 2 + 0.4 && Math.abs(pz - tr.z) < tr.d / 2 + 0.4) continue;
        veg(px, pz, f.ground(px, pz), kind);
      }
    }
  }
  // —— 瓜架上的藤：春才爬上来，夏满架、垂着葫芦，秋叶黄了、葫芦老了，冬只剩一两只干的挂着 ——
  if (tr) {
    const x0 = tr.x - tr.w / 2, x1 = tr.x + tr.w / 2, z0 = tr.z - tr.d / 2, z1 = tr.z + tr.d / 2, top = (x: number, z: number) => f.ground(x, z) + tr.h;
    const leaf = (x: number, y: number, z: number, sz: number, c: RGB) => put(wash, x, y, z, sz, F.guaLeaf, c, R.r(0.8, 1.06), 0, 0.5, R.r(0, TAU));
    if (sp) for (let i = 0; i < 9; i++) { const x = R() < 0.5 ? x0 : x1, z = R.r(z0, z1); leaf(x + R.pm(0.15), f.ground(x, z) + R.r(0.3, 1.5), z, R.r(0.34, 0.5), [0.76, 0.86, 0.6]); }
    if (su || au) {
      const c: RGB = su ? [0.64, 0.78, 0.56] : [0.82, 0.82, 0.58], n = su ? 34 : 18;
      for (let i = 0; i < n; i++) { const x = R.r(x0 - 0.3, x1 + 0.3), z = R.r(z0 - 0.3, z1 + 0.3); leaf(x, top(x, z) + R.r(-0.05, 0.25), z, R.r(0.55, 0.85), c); }
      for (let i = 0; i < (su ? 12 : 5); i++) { const x = R() < 0.5 ? x0 - 0.1 : x1 + 0.1, z = R.r(z0, z1); leaf(x, f.ground(x, z) + R.r(0.9, 2.0), z, R.r(0.45, 0.7), c); }
    }
    for (let i = 0, n = su ? 6 : au ? 7 : wi ? 2 : 0; i < n; i++) { const x = R.r(x0 + 0.3, x1 - 0.3), z = R.r(z0 + 0.3, z1 - 0.3); put(body, x, top(x, z) - R.r(0.42, 0.75), z, R.r(0.34, 0.46), P.hulu, su ? [0.86, 0.93, 0.74] : au ? [0.95, 0.9, 0.7] : [0.86, 0.78, 0.6], R.r(0.92, 1.02), 0, 0.3, R.pm(0.12)); }
  }
  // —— 人家门前屋后 ——
  if (ex) {
    // 一小畦葱
    for (const sc of ex.scallion) for (let x = sc.x0 + 0.2; x < sc.x1 - 0.1; x += 0.42) for (let z = sc.z0 + 0.15; z < sc.z1 - 0.1; z += 0.44) veg(x + R.pm(0.04), z + R.pm(0.06), f.ground(x, z), 2);
    // 门边的一丛：蜀葵（夏天一茎的花，粉、白，间一茎深些的）或凤仙（矮，几点红）
    for (const d of ex.door) {
      const y = f.ground(d.x, d.z);
      if (d.tall) {
        if (wi) { for (let i = 0; i < 2; i++) put(wash, d.x + R.pm(0.25), y, d.z + R.pm(0.2), R.r(0.8, 1.2), F.haoDry, [0.8, 0.75, 0.64], R.r(0.9, 1.05), 0.47, 0.5); continue; }
        for (let i = 0, n = sp ? 3 : 4; i < n; i++) {
          const x = d.x + R.pm(0.34), z = d.z + R.pm(0.22), h = sp ? R.r(0.5, 0.7) : su ? R.r(1.6, 2.05) : R.r(1.4, 1.8);
          put(wash, x, y, z, h, F.kui, sp ? [0.72, 0.84, 0.58] : su ? [0.64, 0.78, 0.56] : [0.82, 0.79, 0.58], R.r(0.84, 1.05), 0.48, 0.5);
          if (!su && !(au && i === 0)) continue;
          const u = R(), c: RGB = u < 0.45 ? [1, 0.8, 0.85] : u < 0.8 ? [1, 0.98, 0.95] : [0.97, 0.6, 0.68];
          for (let k = 0, m = su ? 4 + R.i(2) : 2; k < m; k++) put(body, x + R.pm(0.1), y + h * lerp(0.36, 0.92, (k + R()) / m), z + R.pm(0.1), R.r(0.19, 0.27) * (1 - 0.25 * (k / m)), P.kuihua, c, R.r(0.95, 1.03), 0, 0.5, R.r(0, TAU));
        }
      } else if (!wi) {
        for (let i = 0; i < 3; i++) put(wash, d.x + R.pm(0.25), y, d.z + R.pm(0.2), sp ? R.r(0.3, 0.4) : R.r(0.5, 0.64), F.juLeaf, au ? [0.8, 0.8, 0.58] : [0.66, 0.8, 0.56], R.r(0.84, 1.05), 0.47, 0.4);
        if (su) for (let i = 0; i < 7; i++) put(body, d.x + R.pm(0.3), y + R.r(0.3, 0.58), d.z + R.pm(0.24), R.r(0.2, 0.26), P.yehua1, R() < 0.6 ? [1, 0.68, 0.74] : [1, 0.9, 0.92], 1, 0, 0.4, R.r(0, TAU));
      }
    }
    // 南瓜：从墙脚爬开，夏天几朵黄花，秋天地上卧着两三只瓜
    for (const pk of ex.pumpkin) {
      const n = sp ? 4 : su ? 13 : au ? 9 : 3;
      for (let i = 0; i < n; i++) {
        const a = R.r(0, TAU), q = Math.sqrt(R()) * pk.r * (sp ? 0.5 : 1), x = pk.x + Math.cos(a) * q, z = pk.z + Math.sin(a) * q, y = f.ground(x, z);
        if (wi) put(wash, x, y, z, R.r(0.6, 0.9), F.tengDry, [0.78, 0.72, 0.6], R.r(0.9, 1.05), 0.2, 0.2);
        else put(wash, x, y, z, sp ? R.r(0.4, 0.55) : R.r(0.6, 0.9), R() < 0.5 ? F.teng : F.guaLeaf, sp ? [0.74, 0.85, 0.6] : su ? [0.64, 0.78, 0.56] : [0.82, 0.8, 0.56], R.r(0.82, 1.05), 0.3, 0.3, R.r(0, TAU));
      }
      for (let i = 0, m = su ? 3 : au ? 3 : 0; i < m; i++) {
        const a = R.r(0, TAU), q = R.r(0.3, 1) * pk.r, x = pk.x + Math.cos(a) * q, z = pk.z + Math.sin(a) * q, y = f.ground(x, z);
        if (su) put(body, x, y + 0.3, z, R.r(0.2, 0.26), P.yehua1, [1, 0.9, 0.52], 1, 0, 0.3, R.r(0, TAU));
        else put(body, x, y, z, R.r(0.42, 0.56), P.guo, [0.98, 0.74, 0.42], R.r(0.94, 1.02), 0.42, 0, R.pm(0.25));
      }
    }
    // 篱上的牵牛：藤顺着篱走，夏秋的早晨开几朵（淡蓝、淡紫）
    for (const fc of ex.fence) {
      const L = Math.hypot(fc.bx - fc.ax, fc.bz - fc.az), n = Math.round(L / 0.45), nx = -(fc.bz - fc.az) / L, nz = (fc.bx - fc.ax) / L;
      for (let i = 0; i < n; i++) {
        const t = (i + R()) / n, o = R.pm(0.1), x = fc.ax + (fc.bx - fc.ax) * t + nx * o, z = fc.az + (fc.bz - fc.az) * t + nz * o, y = f.ground(x, z);
        if (wi) { if (R() < 0.4) put(wash, x, y + fc.h * R.r(0.5, 0.95), z, R.r(0.5, 0.7), F.tengDry, [0.78, 0.72, 0.6], R.r(0.9, 1.05), 0, 0.3, R.pm(0.4)); continue; }
        if (R() > (sp ? 0.35 : su ? 0.9 : 0.65)) continue;
        const h = sp ? R.r(0.25, 0.6) : R.r(0.5, 1.05), sz = sp ? R.r(0.36, 0.5) : R.r(0.56, 0.84);
        put(wash, x, y + fc.h * h, z, sz, F.teng, sp ? [0.74, 0.86, 0.6] : su ? [0.64, 0.79, 0.56] : [0.8, 0.8, 0.58], R.r(0.82, 1.05), 0, 0.4, R.pm(0.5));
        if ((su && R() < 0.5) || (au && R() < 0.18)) put(body, x + nx * R.pm(0.12), y + fc.h * h + R.pm(0.14), z + nz * R.pm(0.12), R.r(0.16, 0.22), P.qianniu, R() < 0.7 ? [0.8, 0.83, 1] : [0.97, 0.8, 0.93], R.r(0.96, 1.02), 0, 0.4, R.r(0, TAU));
      }
    }
  }
  // —— 果树：柿子秋后一树橙果（入冬还挂着几只），枣子红了，石榴夏天几朵红花、秋天结果 ——
  for (const fr of f.fruit) {
    const at = (j: number) => { const t = fr.tips[R.i(fr.tips.length)]; return [t.x + R.pm(j), t.y + R.pm(j) - 0.1, t.z + R.pm(j)] as const; };
    if (!fr.tips.length) continue;
    if (fr.kind === 'persimmon') for (let i = 0, n = au ? 36 : wi ? 9 : 0; i < n; i++) { const [x, y, z] = at(0.4); put(body, x, y, z, R.r(0.17, 0.23), P.guo, au ? [1, 0.64, 0.32] : [0.96, 0.52, 0.3], R.r(0.94, 1.03), 0, 0.4, R.pm(0.3)); }
    if (fr.kind === 'jujube' && au) for (let i = 0; i < 28; i++) { const [x, y, z] = at(0.4); put(body, x, y, z, R.r(0.09, 0.12), P.guo, [0.92, 0.5, 0.4], R.r(0.9, 1.03), 0, 0.4, R.pm(0.5)); }
    if (fr.kind === 'pomegranate') {
      if (su) for (let i = 0; i < 11; i++) { const [x, y, z] = at(0.22); put(body, x, y, z, R.r(0.15, 0.2), P.liuhua, [1, 0.5, 0.36], R.r(0.95, 1.03), 0, 0.4, R.pm(0.6)); }
      if (au) for (let i = 0; i < 6; i++) { const [x, y, z] = at(0.22); put(body, x, y, z, R.r(0.18, 0.23), P.guo, [0.95, 0.6, 0.44], R.r(0.94, 1.02), 0, 0.3, R.pm(0.4)); }
    }
  }

  // —— 菊圃：十六丛 ——
  if (f.mums) for (const [x, z, u] of mumSpots(f.mums)) {
    const y = f.ground(x, z);
    if (wi) { for (let i = 0; i < 3; i++) put(wash, x + R.pm(0.14), y, z + R.pm(0.14), R.r(0.52, 0.7), F.juDry, [0.76, 0.69, 0.58], R.r(0.86, 1.05), 0.47, 0.5); continue; }
    const h = sp ? 0.46 : su ? 0.68 : 0.8, n = sp ? 3 : 4;
    for (let i = 0; i < n; i++) put(wash, x + R.pm(0.12), y, z + R.pm(0.12), h * R.r(0.86, 1.04), F.juLeaf, sp ? [0.7, 0.82, 0.58] : [0.6, 0.73, 0.56], R.r(0.78, 1.05), 0.47, 0.4);
    if (su) for (let i = 0; i < 2; i++) put(body, x + R.pm(0.2), y + h * R.r(0.8, 0.95), z + R.pm(0.2), R.r(0.16, 0.2), P.juBud, [0.86, 0.9, 0.62], 1, 0, 0.5);
    if (au) {
      // 一丛一色：黄的多，白的次之，间一两丛浅赭
      const c: RGB = u < 0.56 ? [1, 0.9, 0.5] : u < 0.88 ? [1, 0.99, 0.93] : [0.99, 0.86, 0.74];
      for (let i = 0, m = 8 + R.i(4); i < m; i++) {
        const a = R.r(0, TAU), d = Math.sqrt(R()) * 0.3, v = R(), big2 = v < 0.55;
        put(body, x + Math.cos(a) * d, y + h * R.r(0.66, 1.02) - d * 0.3, z + Math.sin(a) * d, big2 ? R.r(0.21, 0.3) : R.r(0.15, 0.21), big2 ? (R() < 0.5 ? P.ju0 : P.ju1) : v < 0.85 ? (R() < 0.5 ? P.juSide : P.ju2) : P.juBud, c, R.r(0.94, 1.03), 0, 0.5, big2 ? R.r(0, TAU) : R.pm(0.5));
      }
    }
  }

  // —— 池荷 ——
  if (f.pond && (su || au)) lotus(f.pond, su, f, R, pads, (x, y, z, s, tile, c, rot) => put(body, x, y, z, s, tile, c, R.r(0.96, 1.03), 0, 0.5, rot));

  // —— 芦苇 ——
  for (const r of f.reeds) {
    if (sp) { put(wash, r.x, r.y, r.z, R.r(0.7, 1.05), F.luShoot, [0.72, 0.85, 0.58], R.r(0.86, 1.05), 0.46, 0.5); if (r.k < 0.35) put(wash, r.x + R.pm(0.3), r.y, r.z + R.pm(0.3), r.s * 0.85, F.luDry, [0.89, 0.83, 0.68], R.r(0.9, 1.05), 0.48, 0.8); }
    else if (su) put(wash, r.x, r.y, r.z, r.s, R() < 0.5 ? F.lu0 : F.lu1, [0.64, 0.79, 0.56], R.r(0.82, 1.06), 0.48, 0.9);
    else if (au) {
      put(wash, r.x, r.y, r.z, r.s, R() < 0.5 ? F.lu0 : F.lu1, [0.85, 0.81, 0.56], R.r(0.84, 1.06), 0.48, 0.9);
      if (r.k < 0.72) put(body, r.x + R.pm(0.25), r.y + r.s * 0.84, r.z + R.pm(0.25), R.r(0.62, 0.9), R() < 0.5 ? P.luhua0 : P.luhua1, [0.97, 0.955, 0.9], R.r(0.95, 1.02), 0.3, 0.95);
    } else {
      if (r.k < 0.8) put(wash, r.x, r.y, r.z, r.s * 0.9, F.luDry, [0.87, 0.81, 0.65], R.r(0.86, 1.05), 0.48, 0.8);
      if (r.k < 0.22) put(body, r.x + R.pm(0.25), r.y + r.s * 0.74, r.z + R.pm(0.25), R.r(0.5, 0.7), R() < 0.5 ? P.luhua0 : P.luhua1, [0.94, 0.92, 0.86], R.r(0.95, 1.02), 0.3, 0.95);
    }
  }

  // —— 野花：几点，淡淡的（四时的主花不是它们） ——
  if (!wi) f.wild.forEach(([x, y, z], i) => {
    if ((su && i % 2) || (au && i % 5 > 1)) return;
    const u = R();
    put(body, x, y, z, R.r(0.28, 0.4), R() < 0.5 ? P.yehua0 : P.yehua1, au ? [1, 0.96, 0.7] : u < 0.5 ? [1, 1, 0.95] : u < 0.8 ? [1, 0.97, 0.76] : [0.93, 0.9, 1], 1, 0.6, 0.4, R.r(0, TAU));
  });
  // 春天路边几点（淡——别抢了桃花）；秋天田埂上的野菊（小而淡——主花是院里的菊）
  if (sp) for (const [x, y, z] of f.lane) { const u = R(); put(body, x, y, z, R.r(0.28, 0.4), R() < 0.5 ? P.yehua0 : P.yehua1, u < 0.5 ? [1, 1, 0.95] : u < 0.8 ? [1, 0.97, 0.8] : [0.93, 0.9, 1], 1, 0.6, 0.4, R.r(0, TAU)); }
  if (au) for (const [x, y, z] of f.bund) put(body, x, y, z, R.r(0.3, 0.44), R() < 0.5 ? P.yehua0 : P.yehua1, [1, 0.95, 0.68], 1, 0.6, 0.4, R.r(0, TAU));
  return { wash, body, pads };
}

/**
 * 荷。叶是真的面（圆的，叶心下凹、叶缘起伏；立叶高出水面、歪着，浮叶贴水），梗细；花是一笔笔点的（粉）。
 * 夏：田田的叶，花高出叶上；秋：叶枯了、卷了、折了腰，剩几只莲蓬。池西（近亭）留着一片水。
 */
function lotus(p: Pond, summer: boolean, f: FieldPlan, R: Rand, g: FGeo, dab: (x: number, y: number, z: number, size: number, tile: number, c: RGB, rot: number) => void) {
  const D = f.density, spots: Array<[number, number]> = [];
  for (let i = 0, guard = 0, n = Math.round(62 * (0.6 + 0.4 * D)); i < n && guard < 4000; guard++) {
    const a = R.r(0, TAU), q = Math.sqrt(R()) * 0.84, x = Math.cos(a) * q, z = Math.sin(a) * q;
    // 偏在池的东、北两面；西南近亭处空着
    if (x * 0.8 - z * 0.45 < -0.22 - 0.3 * R()) continue;
    if (spots.every(([sx, sz]) => Math.hypot((sx - x) * p.rx, (sz - z) * p.rz) > 0.55)) { spots.push([x, z]); i++; }
  }
  const stem = (x: number, z: number, top: V3, r: number, c: RGB, bend = 0) => tube(g, [v3(x, p.y - 0.5, z), v3((x + top.x) / 2 + R.pm(0.05) + bend, lerp(p.y, top.y, 0.55), (z + top.z) / 2 + R.pm(0.05)), top], [r, r * 0.9, r * 0.7], { sides: 3, col: c, uSpan: 0.05, vPerM: 0.05, sway: (i) => i * 0.35 });
  /** 一张叶：c 叶心，rad 半径，tilt 歪多少（弧度），cup 下凹，wave 叶缘起伏，droop 叶缘下垂 */
  const leaf = (c: V3, rad: number, tilt: number, cup: number, wave: number, droop: number, col: (r: number, a: number) => RGB, sway: number) => {
    const N = 12, ax = R.r(0, TAU), ca = Math.cos(ax), sa = Math.sin(ax), ct = Math.cos(tilt), stl = Math.sin(tilt), ph = R.r(0, TAU), lobes = 2 + R.i(3);
    const at = (lx: number, ly: number, lz: number): [number, number, number] => {
      // 绕水平的一根轴（方位 ax）歪 tilt
      const u = lx * ca + lz * sa, w = -lx * sa + lz * ca, u2 = u * ct - ly * stl, y2 = u * stl + ly * ct;
      return [c.x + u2 * ca - w * sa, c.y + y2, c.z + u2 * sa + w * ca];
    };
    const nUp = at(0, 1, 0), nrm: [number, number, number] = [nUp[0] - c.x, nUp[1] - c.y, nUp[2] - c.z];
    const cc = col(0, 0), o = at(0, -cup * rad, 0), i0 = g.v(o[0], o[1], o[2], nrm[0], nrm[1], nrm[2], 0, 0, cc[0], cc[1], cc[2], sway);
    const ring = (rr: number) => { const row: number[] = []; for (let k = 0; k <= N; k++) { const a = (k / N) * TAU, wv = Math.sin(a * lobes + ph); const q = at(Math.cos(a) * rr * rad, -cup * rad * (1 - rr) * (1 - rr) + (rr > 0.9 ? wv * wave * rad - droop * rad * (0.6 + 0.4 * Math.abs(wv)) : wv * wave * rad * 0.3 - droop * rad * 0.2), Math.sin(a) * rr * rad); const cl = col(rr, a); row.push(g.v(q[0], q[1], q[2], nrm[0], nrm[1], nrm[2], Math.cos(a) * rr, Math.sin(a) * rr, cl[0], cl[1], cl[2], Math.min(1, sway + 0.1 * rr))); } return row; };
    const r1 = ring(0.55), r2 = ring(1);
    for (let k = 0; k < N; k++) { g.tri(i0, r1[k + 1], r1[k]); g.quad(r1[k], r1[k + 1], r2[k + 1], r2[k]); }
  };
  const green = (tone: number) => (rr: number): RGB => { const k = tone * lerp(0.86, 1.04, rr); return [0.6 * k, 0.76 * k, 0.6 * k]; };
  spots.forEach(([sx, sz], i) => {
    const x = p.x + sx * p.rx, z = p.z + sz * p.rz, tone = R.r(0.9, 1.1), kind = i % 8;
    if (summer) {
      if (kind < 4) { const h = R.r(0.3, 0.95), top = v3(x + R.pm(0.1), p.y + h, z + R.pm(0.1)); stem(x, z, top, 0.016, [0.62, 0.76, 0.58]); leaf(top, R.r(0.36, 0.6), R.r(0.08, 0.5), R.r(0.14, 0.26), R.r(0.05, 0.12), R.r(-0.04, 0.08), green(tone), clamp01(h * 0.5)); }
      else if (kind < 6) leaf(v3(x, p.y + 0.015, z), R.r(0.28, 0.46), 0, 0.01, 0.012, 0, green(tone * 0.96), 0);
      else {
        // 花：高出叶上。开足的、半开的、苞，各有
        const h = R.r(0.95, 1.45), top = v3(x + R.pm(0.08), p.y + h, z + R.pm(0.08)), u = R();
        stem(x, z, top, 0.012, [0.64, 0.76, 0.58]);
        const deep = R.r(0.9, 1.06);
        dab(top.x, top.y + (u < 0.3 ? 0.14 : 0.08), top.z, u < 0.3 ? R.r(0.36, 0.46) : R.r(0.52, 0.7), u < 0.3 ? P.lianBud : u < 0.62 ? P.lianCup : P.lian0, [1, 0.72 * deep, 0.78 * deep], R.pm(0.14));
      }
    } else {
      if (kind < 4 && R() < 0.8) {
        // 残荷：枯了、卷了，梗折了腰
        const h = R.r(0.25, 0.8), broken = R() < 0.45, top = v3(x + R.pm(0.25), p.y + h * (broken ? 0.55 : 1), z + R.pm(0.25)), dryk = R.r(0.2, 1);
        stem(x, z, top, 0.013, [0.72, 0.68, 0.54], broken ? R.pm(0.2) : 0);
        leaf(top, R.r(0.3, 0.5), broken ? R.r(0.9, 1.5) : R.r(0.25, 0.7), R.r(0.1, 0.2), R.r(0.14, 0.24), R.r(0.2, 0.5), (rr, a) => { const n = 0.5 + 0.5 * Math.sin(a * 2 + i), k = clamp01(dryk * (0.5 + rr * 0.9) * (0.6 + n * 0.8)), t = tone; return [lerp(0.62, 0.8, k) * t, lerp(0.74, 0.69, k) * t, lerp(0.58, 0.5, k) * t]; }, clamp01(h * 0.5));
      } else if (kind >= 6 && R() < 0.6) {
        const h = R.r(0.6, 1.1), top = v3(x + R.pm(0.2), p.y + h, z + R.pm(0.2));
        stem(x, z, top, 0.012, [0.7, 0.66, 0.54], R.pm(0.15));
        dab(top.x, top.y + 0.02, top.z, R.r(0.26, 0.34), P.lianPeng, [0.72, 0.66, 0.5], R.pm(0.5));
      }
    }
  });
}
