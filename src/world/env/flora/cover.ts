/**
 * 地上的几笔：草、苔点。不是草坪——「疏疏几笔」：一丛一丛地出，有的地方一片都没有；
 * 溪岸、路边、田埂、篱脚、树根石根多些；路上、田里、水里、院里（篱脚除外）、屋里没有。
 * 另算出两样给四季各一套的东西（field.ts）用：哪里可以开几点野花，芦苇长在哪（伊水滩头、池边、溪湾）。
 * 这里直接查总图（路、田、水、屋）。
 */
import * as SITE_ALL from '../../site';
import { PATHS, PLOTS, RIVER_Y, SITE, STREAM, TREES, ground, pathDist, plotAt, riverAt, streamAt, type Rect } from '../../site';
import { fbm } from '../../core/rng';
import { FIELD } from './tiles2';
import { rand, type RGB, type Rand } from './kit';
import type { Sink } from './sink';
import type { Extras } from './extras';

const I = FIELD.idx;
const TUFT = [I.cao0, I.cao1, I.cao0, I.cao1, I.caoShort];
/** 石（总图上后来添的；没有也无妨） */
const ROCKS = (SITE_ALL as unknown as { ROCKS?: Array<{ x: number; z: number; r: number }> }).ROCKS ?? [];

export interface Reed { x: number; y: number; z: number; /** 多高 */ s: number; k: number }
export interface Cover {
  /** 草丛里可以开几点野花的地方 */ wild: Array<[number, number, number]>;
  /** 村路、田间路边（春天几点淡的野花） */ lane: Array<[number, number, number]>;
  /** 田埂上（秋天的野菊） */ bund: Array<[number, number, number]>;
  reeds: Reed[];
}

const inRect = (r: Rect, x: number, z: number, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
/** 屋里（邻家、村塾；草堂与东厢在院里） */
function inHouse(x: number, z: number): boolean {
  for (const h of SITE.houses) {
    const c = Math.cos(h.yaw), s = Math.sin(h.yaw), lx = (x - h.x) * c - (z - h.z) * s, lz = (x - h.x) * s + (z - h.z) * c;
    if (Math.abs(lx) < h.w / 2 + 0.4 && Math.abs(lz) < h.d / 2 + 0.4) return true;
  }
  return false;
}
/** 这一处是干的地（不在溪、池、河里） */
function dry(x: number, z: number, y: number): boolean {
  const st = streamAt(x, z), P = SITE.pond;
  if (st.d < st.w + 6 && y < st.y + 0.1) return false;
  if (Math.hypot((x - P.x) / P.rx, (z - P.z) / P.rz) < 1.15 && y < P.y + 0.1) return false;
  return y > RIVER_Y + 0.12;
}
/** 村里不长草的地方：井台、晒场、棚下、草垛……（总图上后来添的；按名字取，没有就是空） */
const BARE: Array<[number, number, number]> = (() => {
  const M = (SITE as unknown as { more?: Record<string, unknown> }).more ?? {}, out: Array<[number, number, number]> = [[SITE.well.x, SITE.well.z, 0.95]];
  for (const [k, r] of [['teaShed', 1.7], ['oxShed', 2.4], ['duckPen', 1.8], ['mill', 2.4], ['wash', 0.9], ['shrine', 0.8], ['swing', 1.2], ['chess', 1.3], ['cart', 1.4], ['netRack', 1.4]] as Array<[string, number]>) { const v = M[k] as { x: number; z: number } | undefined; if (v && typeof v.x === 'number') out.push([v.x, v.z, r]); }
  const d = M.dryYard as { x: number; z: number; r: number } | undefined; if (d) out.push([d.x, d.z, d.r + 0.2]);
  for (const h of (M.haystacks as Array<{ x: number; z: number }> | undefined) ?? []) out.push([h.x, h.z, 1.7]);
  return out;
})();
const bare = (x: number, z: number) => { for (const [bx, bz, br] of BARE) if (Math.hypot(x - bx, z - bz) < br) return true; return false; };
/** 这一处可以长草 */
const open = (x: number, z: number) => !plotAt(x, z) && !inRect(SITE.yard, x, z, 0.15) && !inRect(SITE.veg, x, z, 0.2) && pathDist(x, z) > 0.3 && !inHouse(x, z) && !bare(x, z);

export function groundCover(S: Sink, area: Rect, density: number, seed = 20261113): Cover {
  S.place(0, 0, 0, 0, 1);
  const R = rand(seed), wild: Cover['wild'] = [], lane: Cover['lane'] = [], bund: Cover['bund'] = [];
  const tint = (): RGB => [R.r(0.94, 1.05), 1, R.r(0.9, 1.04)];
  /** 一丛草 */
  const tuft = (x: number, z: number, big: number, anywhere = false): boolean => {
    if (!anywhere && !open(x, z)) return false;
    const y = ground(x, z);
    if (!dry(x, z, y)) return false;
    const size = R.r(0.34, 0.6) * big;
    S.dab('grass', x, y + size * 0.46, z, size, R.pick(TUFT), R.pm(0.3), 1, R.pm(0.3), R.r(0.82, 1.08), tint(), R.pm(0.12), 0.55);
    return true;
  };
  /** 苔点、贴地的小草 */
  const moss = (x: number, z: number, anywhere = false) => {
    if (!anywhere && !open(x, z)) return;
    const y = ground(x, z);
    if (!dry(x, z, y)) return;
    const u = R(), size = R.r(0.3, 0.5);
    if (u < 0.62) S.dab('grass', x, y + size * 0.14, z, size, R() < 0.5 ? I.tai : I.tai2, 0, 1, 0, R.r(0.6, 0.8), [0.9, 1, 0.96], R.pm(0.2), 0.05);
    else S.dab('grass', x, y + size * (u < 0.82 ? 0.3 : 0.44), z, size * 1.1, u < 0.82 ? I.sanye : I.kuo, 0, 1, 0, R.r(0.8, 1.0), tint(), R.pm(0.15), 0.2);
  };
  /** 一小片：几丛草，夹一两笔苔 */
  const patch = (x: number, z: number, n: number, rad: number, big: number) => {
    let any = false;
    for (let i = 0; i < n; i++) { const a = R.r(0, 6.283), d = Math.sqrt(R()) * rad; any = tuft(x + Math.cos(a) * d, z + Math.sin(a) * d, big) || any; }
    if (any && R() < 0.55) for (let i = 0; i < 1 + R.i(2); i++) moss(x + R.pm(rad), z + R.pm(rad));
    return any;
  };

  // —— 漫地：一格里出不出一小片，看一张疏密不匀的底、离路离溪的远近 ——
  const cell = 5.2;
  for (let gx = area.x0; gx < area.x1; gx += cell) for (let gz = area.z0; gz < area.z1; gz += cell) {
    const x = gx + R() * cell, z = gz + R() * cell;
    if (!open(x, z)) continue;
    const n = fbm(x * 0.035 + 3, z * 0.035 + 9, 3, 5), pd = pathDist(x, z), st = streamAt(x, z);
    let w = 0.16 + 0.75 * Math.max(0, Math.min(1, (n - 0.4) / 0.22));
    if (st.d - st.w < 7) w += 0.35;
    if (pd > 28) w *= 0.5;
    if (z < -30 || z > 150) w *= 0.7;
    if (R() > w * density) continue;
    if (patch(x, z, 2 + R.i(4), R.r(0.7, 1.5), 1) && pd > 1.5 && R() < 0.1) wild.push([x + R.pm(0.5), ground(x, z), z + R.pm(0.5)]);
  }
  // —— 溪岸：水边草长，贴水一线是苔 ——
  for (let i = 1; i < STREAM.length - 1; i++) {
    const p = STREAM[i], a = STREAM[i - 1], b = STREAM[i + 1];
    if (p.x < area.x0 - 6 || p.x > area.x1 + 6 || p.z < area.z0 - 6 || p.z > area.z1 + 6) continue;
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l;
    for (const s of [-1, 1]) {
      if (R() < 0.85 * density) { const d = p.w + R.r(0.7, 3.4), x = p.x + nx * s * d + R.pm(1.6), z = p.z + nz * s * d + R.pm(1.6); patch(x, z, 2 + R.i(3), 0.9, R.r(1.05, 1.4)); }
      if (R() < 0.6 * density) moss(p.x + nx * s * (p.w + R.r(0.2, 0.9)) + R.pm(1.5), p.z + nz * s * (p.w + R.r(0.2, 0.9)) + R.pm(1.5));
    }
  }
  // —— 路边：人不踩的那一线 ——
  for (const P of PATHS) for (let i = 0; i < P.pts.length - 1; i++) {
    const [ax, az] = P.pts[i], [bx, bz] = P.pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 2.6);
    for (let k = 0; k < n; k++) for (const s of [-1, 1]) {
      if (R() > 0.5 * density) continue;
      const t = (k + R()) / n, d = P.w / 2 + R.r(0.4, 1.0);
      const x = ax + (bx - ax) * t - ((bz - az) / L) * s * d, z = az + (bz - az) * t + ((bx - ax) / L) * s * d;
      if (R() < 0.7) { if (tuft(x, z, R.r(0.7, 1.0)) && P.id !== '桃林' && P.id !== '池边' && R() < 0.3) lane.push([x + R.pm(0.25), ground(x, z), z + R.pm(0.25)]); } else moss(x, z);
    }
  }
  // —— 田埂：畦的四边 ——
  for (const p of PLOTS) {
    const per = 2 * (p.x1 - p.x0 + p.z1 - p.z0), n = Math.round(per / 2.3);
    for (let k = 0; k < n; k++) {
      if (R() > 0.45 * density) continue;
      let d = R() * per, x: number, z: number;
      const o = R.r(0.25, 0.9), w = p.x1 - p.x0, h = p.z1 - p.z0;
      if (d < w) { x = p.x0 + d; z = p.z0 - o; } else if ((d -= w) < h) { x = p.x1 + o; z = p.z0 + d; } else if ((d -= h) < w) { x = p.x1 - d; z = p.z1 + o; } else { x = p.x0 - o; z = p.z0 + d - w; }
      if (R() < 0.75) { if (tuft(x, z, R.r(0.7, 1.05)) && R() < 0.42) bund.push([x + R.pm(0.2), ground(x, z), z + R.pm(0.2)]); } else moss(x, z);
    }
  }
  // —— 篱脚：院里只有沿篱的这一线（门口空着） ——
  {
    const Y = SITE.yard, G = SITE.gate, SG = SITE.sideGate, per = 2 * (Y.x1 - Y.x0 + Y.z1 - Y.z0), n = Math.round(per / 1.1);
    for (let k = 0; k < n; k++) {
      if (R() > 0.5 * density) continue;
      let d = R() * per, x: number, z: number;
      const o = R() < 0.6 ? R.r(0.2, 0.55) : -R.r(0.18, 0.4), w = Y.x1 - Y.x0, h = Y.z1 - Y.z0;
      if (d < w) { x = Y.x0 + d; z = Y.z0 - o; } else if ((d -= w) < h) { x = Y.x1 + o; z = Y.z0 + d; } else if ((d -= h) < w) { x = Y.x1 - d; z = Y.z1 + o; } else { x = Y.x0 - o; z = Y.z0 + d - w; }
      if (Math.hypot(x - G.x, z - G.z) < G.w / 2 + 0.9 || Math.hypot(x - SG.x, z - SG.z) < SG.w / 2 + 0.8 || pathDist(x, z) < 0.3) continue;
      if (R() < 0.6) tuft(x, z, R.r(0.6, 0.9), true); else moss(x, z, true);
    }
  }
  // —— 树根、石根 ——
  for (const t of TREES) {
    if (t.kind === 'bamboo' || t.kind === 'pine' || t.kind === 'plum' || (t.kind === 'wood' && t.z < -62)) continue;
    if (t.x < area.x0 || t.x > area.x1 || t.z < area.z0 || t.z > area.z1) continue;
    for (let i = 0, n = R.i(3); i < n; i++) { const a = R.r(0, 6.283), d = t.r + R.r(0.25, 1.0); if (R() < 0.65) tuft(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d, R.r(0.7, 1.0)); else moss(t.x + Math.cos(a) * d, t.z + Math.sin(a) * d); }
  }
  for (const r of ROCKS) for (let i = 0, n = 1 + R.i(2); i < n; i++) { const a = R.r(0, 6.283), d = r.r * R.r(0.9, 1.3) + 0.1; if (R() < 0.5) tuft(r.x + Math.cos(a) * d, r.z + Math.sin(a) * d, R.r(0.7, 1.1)); else moss(r.x + Math.cos(a) * d, r.z + Math.sin(a) * d); }

  return { wild, lane, bund, reeds: reedSpots(R, density) };
}

/** 芦苇长在哪：伊水近岸（水边一线最密，有的站在浅水里）、池的东北岸、几处溪湾 */
function reedSpots(R: Rand, density: number): Reed[] {
  const out: Reed[] = [], F = SITE.ferry, P = SITE.pond;
  const put = (x: number, z: number, y: number, s: number) => { if (pathDist(x, z) > 0.9) out.push({ x, y, z, s, k: R() }); };
  // 伊水：先找这一处水边在哪（从岸上往河里走，走到地面落到水面以下）
  for (let x = -40; x < 260; x += 1.5) {
    if (fbm(x * 0.045 + 1.7, 3.3, 2, 8) < 0.4) continue;
    let z = 150;
    while (z < 460 && riverAt(x, z).d - riverAt(x, z).w > 30) z += 8;
    let lo = z - 8, hi = z + 40;
    if (ground(x, hi) > RIVER_Y) continue;
    for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (ground(x, m) > RIVER_Y) lo = m; else hi = m; }
    const n = Math.round(R.r(1.5, 3.5) * density);
    for (let i = 0; i < n; i++) {
      const px = x + R.pm(0.9), pz = lo + (-2.4 + 9.5 * R() * R());
      if (Math.hypot(px - F.x, pz - F.z) < 5.5) continue;
      const g = ground(px, pz);
      if (g < RIVER_Y - 0.45) continue;
      put(px, pz, Math.max(g, RIVER_Y - 0.12), R.r(1.7, 2.6));
    }
  }
  // 池：东北岸一带，东南角一小丛（亭在西岸，留着看水）
  for (let i = 0, n = Math.round(46 * density); i < n; i++) {
    const a = i < n * 0.78 ? R.r(-2.0, -0.35) : R.r(0.5, 0.95), pe = R.r(0.93, 1.1), x = P.x + Math.cos(a) * P.rx * pe, z = P.z + Math.sin(a) * P.rz * pe;
    put(x, z, Math.max(ground(x, z), P.y - 0.1), R.r(1.4, 2.1));
  }
  // 溪湾：几处拐弯的地方，贴着水
  for (const bx of [-158, -128, -62, 30, 96, 150]) {
    let bi = 0; for (let i = 0; i < STREAM.length; i++) if (Math.abs(STREAM[i].x - bx) < Math.abs(STREAM[bi].x - bx)) bi = i;
    const p = STREAM[bi], a = STREAM[Math.max(0, bi - 1)], b = STREAM[Math.min(STREAM.length - 1, bi + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l, side = R() < 0.5 ? -1 : 1;
    for (let i = 0, n = Math.round(R.r(6, 10) * density); i < n; i++) {
      const t = R.pm(3.2), d = p.w + R.r(-0.5, 1.3), x = p.x + ((b.x - a.x) / l) * t + nx * side * d, z = p.z + ((b.z - a.z) / l) * t + nz * side * d;
      if (Math.hypot(x - SITE.bridge.x, z - SITE.bridge.z) < 6 || Math.hypot(x - SITE.stones.x, z - SITE.stones.z) < 5 || Math.hypot(x - SITE.plank.x, z - SITE.plank.z) < 7) continue;
      put(x, z, Math.max(ground(x, z), p.y - 0.1), R.r(1.3, 1.9));
    }
  }
  return out;
}

/** 潮处的苔与蕨（井台、捣衣石边），水边的菖蒲与水草（捣衣处、水碓旁的那一段溪岸）。随地上的草一起换季 */
export function dampAndWater(S: Sink, ex: Extras, density: number) {
  S.place(0, 0, 0, 0, 1);
  const R = rand(4711);
  for (const d of ex.damp) for (let i = 0, n = Math.round(6 + 8 * density); i < n; i++) {
    const a = R.r(0, 6.283), q = R.r(d.r0, d.r1), x = d.x + Math.cos(a) * q, z = d.z + Math.sin(a) * q;
    if (pathDist(x, z) < 0.15) continue;
    const y = ground(x, z);
    if (!dry(x, z, y)) continue;
    if (R() < 0.72) { const size = R.r(0.3, 0.5); S.dab('grass', x, y + size * 0.14, z, size, R() < 0.5 ? I.tai : I.tai2, 0, 1, 0, R.r(0.58, 0.78), [0.9, 1, 0.96], R.pm(0.2), 0.05); }
    else { const size = R.r(0.5, 0.78); S.dab('grass', x, y + size * 0.43, z, size, I.jue, 0, 1, 0, R.r(0.78, 0.98), [0.95, 1, 0.95], R.pm(0.1), 0.4); }
  }
  for (const w of ex.waterside) {
    let bi = 0;
    for (let i = 0; i < STREAM.length; i++) if (Math.hypot(STREAM[i].x - w.x, STREAM[i].z - w.z) < Math.hypot(STREAM[bi].x - w.x, STREAM[bi].z - w.z)) bi = i;
    const p = STREAM[bi], a = STREAM[Math.max(0, bi - 1)], b = STREAM[Math.min(STREAM.length - 1, bi + 1)], l = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / l, tz = (b.z - a.z) / l;
    for (let t = -w.len; t <= w.len; t += 0.8) for (const s of [-1, 1]) {
      if (R() > 0.6 * (0.6 + 0.4 * density)) continue;
      const floating = R() < 0.28, d = floating ? p.w - R.r(0.35, 1.0) : p.w + R.r(-0.3, 0.45);
      const x = p.x + tx * (t + R.pm(0.4)) - tz * s * d, z = p.z + tz * (t + R.pm(0.4)) + tx * s * d;
      if (Math.hypot(x - w.x, z - w.z) < 1.5 || pathDist(x, z) < 0.5) continue;
      const st = streamAt(x, z);
      if (floating) { const size = R.r(0.42, 0.68); S.dab('grass', x, st.y + size * 0.07, z, size, I.shuicao, 0, 1, 0, R.r(0.8, 1.02), [0.95, 1, 0.96], R.pm(0.08), 0.1); }
      else { const size = R.r(0.6, 0.98), y = Math.max(ground(x, z), st.y - 0.06); S.dab('grass', x, y + size * 0.46, z, size, I.changpu, R.pm(0.3), 1, R.pm(0.3), R.r(0.8, 1.05), [0.95, 1, 0.95], R.pm(0.1), 0.6); }
    }
  }
}
