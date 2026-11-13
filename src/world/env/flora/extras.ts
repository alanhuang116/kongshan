/**
 * 有人住着的痕迹：邻家门前屋后各一株果树（枣、柿、杏、石榴）、门边的一丛蜀葵或凤仙、墙脚爬开的南瓜藤、一小畦葱；
 * 菜畦的瓜架上的藤与葫芦、草堂竹篱上的一段牵牛、井台与捣衣石边的苔与蕨、捣衣处与水碓旁水边的菖蒲；茶棚边一株老柳。
 * 这些位置是草木这边照总图（屋、路、水、各样零碎）现找的，总图上没有逐一登记——所以树干在哪要交出去（Flora.extraTrunks），走路的好绕开。
 * 规矩：树干离屋墙至少两米半、不占路、不落在田里水里、不压着别的树与村里的零碎。
 */
import * as SITE_ALL from '../../site';
import { SITE, TREES, pathDist, plotAt, streamAt, type Rect } from '../../site';

export type ExtraKind = 'jujube' | 'persimmon' | 'apricot' | 'pomegranate' | 'willow';
export interface ExtraTree { kind: ExtraKind; x: number; z: number; s: number; seed: number; r: number; /** 朝哪边探（世界方向） */ to?: [number, number] }
export interface Extras {
  trees: ExtraTree[];
  /** 门边的一丛花：蜀葵（高）或凤仙（矮） */ door: Array<{ x: number; z: number; tall: boolean }>;
  /** 南瓜藤：从墙脚爬开的一片 */ pumpkin: Array<{ x: number; z: number; r: number }>;
  /** 一小畦葱 */ scallion: Array<Rect & { rows: 0 | 1 }>;
  /** 篱上的牵牛：沿这一段篱 */ fence: Array<{ ax: number; az: number; bx: number; bz: number; h: number }>;
  /** 瓜架（架子是屋舍那边搭的；这里只点藤与葫芦） */ trellis: { x: number; z: number; w: number; d: number; h: number } | null;
  /** 潮处（井台、捣衣石）：苔、蕨长在这一圈里 */ damp: Array<{ x: number; z: number; r0: number; r1: number }>;
  /** 水边（捣衣处、水碓）：菖蒲、水草长在这一段溪岸 */ waterside: Array<{ x: number; z: number; len: number }>;
}
type Pt = { x: number; z: number };
type House = (typeof SITE.houses)[number];

/** 总图上后来添的零碎（茶棚、捣衣石、水碓、晒场……）。按名字取，没有就是空 */
const MORE = (SITE as unknown as { more?: Record<string, unknown> }).more ?? {};
const pt = (k: string): Pt | null => { const v = MORE[k] as Pt | undefined; return v && typeof v.x === 'number' && typeof v.z === 'number' ? v : null; };
const ROCKS = (SITE_ALL as unknown as { ROCKS?: Array<{ x: number; z: number; r: number }> }).ROCKS ?? [];

/** 屋自己的坐标（x 沿面阔，z 朝前）→ 世界 */
const out = (h: House, lx: number, lz: number): [number, number] => { const c = Math.cos(h.yaw), s = Math.sin(h.yaw); return [h.x + lx * c + lz * s, h.z - lx * s + lz * c]; };
/** 离这户的墙多远 */
const wallDist = (h: House, x: number, z: number) => { const c = Math.cos(h.yaw), s = Math.sin(h.yaw), lx = (x - h.x) * c - (z - h.z) * s, lz = (x - h.x) * s + (z - h.z) * c; return Math.hypot(Math.max(Math.abs(lx) - h.w / 2, 0), Math.max(Math.abs(lz) - h.d / 2, 0)); };

export function siteExtras(): Extras {
  // 别压着的东西：[x, z, 让开多远]
  const keep: Array<[number, number, number]> = [[SITE.well.x, SITE.well.z, 2.2], [SITE.elm.x, SITE.elm.z, 4.5], [SITE.stones.x, SITE.stones.z, 3]];
  for (const [k, r] of [['teaShed', 2.4], ['wash', 2], ['mill', 4], ['oxShed', 3.6], ['swing', 2.6], ['chess', 2], ['duckPen', 2.6], ['shrine', 1.8], ['cart', 2.2], ['trellis', 2.6], ['netRack', 2.6]] as Array<[string, number]>) { const p = pt(k); if (p) keep.push([p.x, p.z, r]); }
  { const d = MORE.dryYard as (Pt & { r: number }) | undefined; if (d) keep.push([d.x, d.z, d.r + 1.6]); }
  { const b = (MORE.wineShop as { bench?: Pt } | undefined)?.bench; if (b) keep.push([b.x, b.z, 1.8]); }
  for (const p of (MORE.haystacks as Pt[] | undefined) ?? []) keep.push([p.x, p.z, 2.8]);
  for (const r of ROCKS) keep.push([r.x, r.z, r.r + 0.9]);
  const trees: ExtraTree[] = [];
  /** 这一处能不能立一棵树 */
  const free = (x: number, z: number, gap: number, own?: House): boolean => {
    if (pathDist(x, z) < 1.6 || plotAt(x, z)) return false;
    const st = streamAt(x, z);
    if (st.d - st.w < 2.2) return false;
    for (const h of SITE.houses) if (wallDist(h, x, z) < (h === own ? 2.5 : 3)) return false;
    for (const t of TREES) if (Math.hypot(t.x - x, t.z - z) < gap) return false;
    for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < gap + 1) return false;
    for (const [kx, kz, kr] of keep) if (Math.hypot(kx - x, kz - z) < kr) return false;
    return true;
  };
  const ex: Extras = { trees, door: [], pumpkin: [], scallion: [], fence: [], trellis: null, damp: [], waterside: [] };

  // —— 各家一株果树：屋侧、屋后、门前斜对着的地方，挨个试 ——
  const kinds: Record<string, ExtraKind> = { a: 'jujube', b: 'persimmon', school: 'apricot', d: 'pomegranate', e: 'persimmon' };
  const size: Record<ExtraKind, [number, number]> = { jujube: [1, 0.18], persimmon: [1.05, 0.22], apricot: [1.45, 0.2], pomegranate: [1, 0.14], willow: [1.35, 0.4] };
  SITE.houses.forEach((h, i) => {
    const kind = kinds[h.id] ?? (['jujube', 'persimmon', 'pomegranate'] as ExtraKind[])[i % 3], sg = i % 2 ? 1 : -1, w = h.w / 2, d = h.d / 2;
    const gap = kind === 'pomegranate' ? 3.2 : 4.6, off = kind === 'pomegranate' ? 2.7 : 3.2;
    let side = 0;
    for (const [lx, lz] of [[sg * (w + off), 0.8], [-sg * (w + off), 0.8], [sg * (w + off + 0.3), -d - 0.4], [-sg * (w + off + 0.3), -d - 0.4], [sg * (w + 1.4), d + off + 0.3], [-sg * (w + 1.4), d + off + 0.3], [sg * 1.5, -d - off - 0.2]] as Array<[number, number]>) {
      const [x, z] = out(h, lx, lz);
      if (!free(x, z, gap, h)) continue;
      trees.push({ kind, x, z, s: size[kind][0], seed: 9100 + i * 37, r: size[kind][1], to: [x - h.x, z - h.z] });
      side = Math.sign(lx);
      break;
    }
    // 门边一丛花（村塾前面敞着，不种）：门在前墙正中，花让开门口
    if (h.id !== 'school') { const [x, z] = out(h, (side || sg) * -1.45, d + 0.5); if (pathDist(x, z) > 0.45) ex.door.push({ x, z, tall: h.id !== 'b' }); }
    // 果树的另一侧：甲家一小畦葱，乙家一片南瓜
    const other = -(side || sg);
    if (h.id === 'a') { const [x, z] = out(h, other * (w + 1.7), 0.2); if (pathDist(x, z) > 1.2 && !plotAt(x, z)) ex.scallion.push({ x0: x - 0.8, x1: x + 0.8, z0: z - 1.3, z1: z + 1.3, rows: 1 }); }
    if (h.id === 'b') { const [x, z] = out(h, other * (w + 1.5), -0.2); if (pathDist(x, z) > 1.6 && !plotAt(x, z)) ex.pumpkin.push({ x, z, r: 1.5 }); }
  });

  // —— 茶棚边一株老柳，朝棚上探 ——
  const tea = pt('teaShed');
  if (tea && !TREES.some((t) => t.kind === 'willow' && Math.hypot(t.x - tea.x, t.z - tea.z) < 12)) {
    for (const [dx, dz] of [[2.9, 2.5], [-2.9, 2.5], [3.3, -1.7], [-3.3, -1.7], [0.4, 3.4]] as Array<[number, number]>) {
      const x = tea.x + dx, z = tea.z + dz;
      if (pathDist(x, z) < 1.6 || plotAt(x, z) || streamAt(x, z).d - streamAt(x, z).w < 2 || TREES.some((t) => Math.hypot(t.x - x, t.z - z) < 4.5) || trees.some((t) => Math.hypot(t.x - x, t.z - z) < 6)) continue;
      trees.push({ kind: 'willow', x, z, s: size.willow[0], seed: 9731, r: size.willow[1], to: [-dx, -dz] });
      break;
    }
  }

  // —— 瓜架、篱上的牵牛 ——
  const tr = pt('trellis');
  if (tr) ex.trellis = { x: tr.x, z: tr.z, w: 3.2, d: 2.4, h: 2.15 };
  { const Y = SITE.yard, G = SITE.gate; ex.fence.push({ ax: G.x + G.w / 2 + 2.2, az: Y.z1, bx: Math.min(Y.x1 - 3.2, G.x + G.w / 2 + 9), bz: Y.z1, h: 1.05 }); }

  // —— 潮处与水边 ——
  ex.damp.push({ x: SITE.well.x, z: SITE.well.z, r0: 0.95, r1: 1.9 });
  const wash = pt('wash'), mill = pt('mill');
  if (wash) { ex.damp.push({ x: wash.x, z: wash.z, r0: 0.7, r1: 1.9 }); ex.waterside.push({ x: wash.x, z: wash.z, len: 7 }); }
  if (mill) ex.waterside.push({ x: mill.x, z: mill.z, len: 8 });
  return ex;
}
