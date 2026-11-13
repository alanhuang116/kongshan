/**
 * 平畴与伊水（平远）。
 *
 *   平畴 —— 近处是平的（垫在近地 land.ts 的外缘底下），往外缓缓抬起：画里的平远是从高处望的，
 *           远水、远树、沙渚要「上」到画面上来；人只站在三五米高的河滩上，地不抬，它们全压成地平线上的一条缝。
 *   伊水 —— 水面贴着平畴走（高出两寸），画在勾线之后、按水深自己淡出岸边（veil.ts）。
 *   岸 —— 两岸各一道矮矮的土埂（自然堤）：迎水的一面是湿的深色，断断续续（岸线的那一笔），埂顶是干的沙色。
 *           水线不齐：有湾、有嘴。近处那块地里的岸归 land.ts，这里的埂到它跟前就伏下去。
 *   沙渚 —— 水里一个个略略鼓起的沙洲，四边没进水里；水线上一圈时断时续的湿痕。
 *   田、路 —— 平畴上一条条略深略浅的田（一块一个走向），几条发白的路。
 *
 * 这些全是一种画法（淡淡的平涂加干笔），并成一个网格。
 */
import * as THREE from 'three';
import { RIVER_PTS, rectDist, riverAt } from '../../site';
import { fbm, mulberry32, smooth } from '../../core/rng';
import type { RGB } from '../../ink/ink';

/** 近处的地铺到哪里（land.ts 的外缘）：这以内平畴只是垫在底下 */
export const NEAR = { x0: -258, x1: 268, z0: -138, z1: 328 };
/** 平畴的颜料与浓度（近地的外缘就是照这个色淡出来的，改了要告诉 land.ts） */
export const PLAIN_PIG: RGB = [0.78, 0.83, 0.72], PLAIN_DENS = 0.75;
const CX = 5, CZ = 95, R0 = 400, TILT = 0.016;

/** 平畴的高度：碗底是平的（比近地的外缘略低），往外抬起，趋于一个固定的缓坡 */
export function plainY(x: number, z: number): number {
  const r = Math.hypot(x - CX, z - CZ) - R0;
  return -1.2 + (r <= 0 ? 0 : (TILT * r * r) / (r + 160));
}
/** 那一处水面的高度（碗底处就是 RIVER_Y） */
export const waterY = (x: number, z: number) => plainY(x, z) + 0.2;

/** 伊水的中线，近处加密（岸线才不是一段一段的直线） */
export interface RiverPt { x: number; z: number; w: number; s: number; /** 朝左岸的方向（顺流看） */ nx: number; nz: number }
export const RIVER_FINE: RiverPt[] = (() => {
  const out: RiverPt[] = [];
  for (let i = 0; i < RIVER_PTS.length - 1; i++) {
    const a = RIVER_PTS[i], b = RIVER_PTS[i + 1], near = Math.hypot((a.x + b.x) / 2, (a.z + b.z) / 2 - 300) < 1700;
    const sub = near ? 3 : 1;
    for (let k = 0; k < sub; k++) { const t = k / sub; out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t, s: a.s + (b.s - a.s) * t, nx: 0, nz: 0 }); }
  }
  const e = RIVER_PTS[RIVER_PTS.length - 1];
  out.push({ x: e.x, z: e.z, w: e.w, s: e.s, nx: 0, nz: 0 });
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
    // 顺流看的左手边：流向 (tx, tz) 逆时针转九十度（俯视，+z 朝南）
    out[i].nx = tz / l; out[i].nz = -tx / l;
  }
  return out;
})();

/** 水线比名义上的岸往外（正）或往里（负）多少：湾与嘴 */
function shoreShift(s: number, side: number): number {
  return (fbm(s * 0.0042 + side * 7.3, 1.7, 2, 31) - 0.5) * 44 + (fbm(s * 0.021 + side * 3.9, 4.1, 2, 37) - 0.5) * 9;
}

/** 攒网格的篮子 */
class Bag {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  v(x: number, y: number, z: number, u: number, v: number, c: RGB, ny = 1, nx = 0, nz = 0): number {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(c[0], c[1], c[2]);
    return this.pos.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    // 都是朝上的面：绕向反了的（朝下）翻过来
    const p = this.pos, ix = this.idx;
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      if ((p[b + 2] - p[a + 2]) * (p[c] - p[a]) - (p[b] - p[a]) * (p[c + 2] - p[a + 2]) < 0) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    }
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
/** 顶点色：平畴的颜料再浓几成（负是淡）。乘在材质的颜料上 */
const tone = (d: number, warm = 0): RGB => [Math.pow(PLAIN_PIG[0], d) * (1 + warm * 0.05), Math.pow(PLAIN_PIG[1], d), Math.pow(PLAIN_PIG[2], d) * (1 - warm * 0.07)];
/** 沙色（比平畴淡、偏暖）与湿痕（淡墨） */
const SAND: RGB = [1.22, 1.15, 1.2], WET: RGB = [0.4, 0.42, 0.48];
const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface Bar { x: number; z: number; /** 顺流的半长、横的半宽、鼓起多高 */ a: number; b: number; h: number; /** 顺流的方向 */ tx: number; tz: number }
export interface Field { x: number; z: number; /** 长、宽、朝向（弧度）、分几条 */ l: number; w: number; rot: number; n: number }
export interface PlainOpts {
  /** 画质（0.5…1）：定网的疏密 */ density: number;
  bars: Bar[]; fields: Field[];
  /** 路：折线与宽 */ roads: Array<{ pts: Array<[number, number]>; w: number }>;
}
export interface Plain {
  /** 平畴、岸、沙渚、田、路并成的一个网格的几何 */ geo: THREE.BufferGeometry;
  /** 水面（伊水与泽）的几何：position / uv / aEdge */ water: THREE.BufferGeometry;
  /** 岸上能长东西的地方：水线上（芦苇）、埂顶上（树）。far 是离安乐窝多远 */
  shore: Array<{ x: number; y: number; z: number; side: number; s: number; crest: number; nx: number; nz: number }>;
}

/** 泽里的积水：一片片不规则的浅水（中心、两个半径、转多少） */
export interface Pool { x: number; z: number; rx: number; rz: number; rot: number }

/** 溪：一条细的水（中线的折线、半宽） */
export interface Brook { pts: Array<[number, number]>; w: number }

export function buildPlain(o: PlainOpts, pools: Pool[], brooks: Brook[] = []): Plain {
  const B = new Bag(), q = Math.sqrt(Math.max(0.3, o.density));
  // —— 平畴：绕着碗心一圈圈铺出去 ——
  const rings = [0, 130, 260, 340, R0, 470, 560, 670, 800, 950, 1130, 1350, 1620, 1950, 2350, 2850, 3500, 4400, 5800, 8000, 12000];
  const nA = Math.round(144 * q);
  const base: number[][] = [];
  for (let k = 0; k < rings.length; k++) {
    base.push([]);
    for (let a = 0; a <= nA; a++) {
      const th = (a / nA) * Math.PI * 2, x = CX + Math.sin(th) * rings[k], z = CZ + Math.cos(th) * rings[k];
      // 大块的浓淡不匀；近伊水处发沙、发白；近处那块地的四围不变色（接缝）
      const seam = smooth(60, 260, rectDist(NEAR, x, z));
      const rv = riverAt(x, z), rd = rv.d - rv.w;
      let d = (fbm(x * 0.0021 + 3, z * 0.0021, 3, 7) - 0.5) * 0.9 * seam;
      d -= 0.3 * smooth(140, 20, rd) * seam;
      // 越远越淡（平远：远处只剩一抹）
      d -= 0.35 * smooth(900, 3200, rings[k]);
      base[k].push(B.v(x, plainY(x, z), z, x / 22000 + 0.5, z / 22000 + 0.5, tone(d, 0.5 * seam * (fbm(x * 0.0013, z * 0.0013 + 9, 2, 3) - 0.5))));
    }
  }
  for (let k = 0; k < rings.length - 1; k++) for (let a = 0; a < nA; a++) B.quad(base[k][a], base[k][a + 1], base[k + 1][a + 1], base[k + 1][a]);

  // —— 岸：两道矮埂 ——
  const shore: Plain['shore'] = [];
  const off = [-44, -18, -5, 0, 3.5, 10, 22, 46], hgt = [-0.5, -0.34, -0.1, 0, 0.36, 1, 0.5, -0.4];
  for (const side of [-1, 1]) {
    let prev: number[] | null = null;
    for (let i = 0; i < RIVER_FINE.length; i++) {
      const p = RIVER_FINE[i], sh = shoreShift(p.s, side), wl = p.w + sh;
      const bx = p.x + p.nx * side * wl, bz = p.z + p.nz * side * wl;
      // 近处那块地里的岸不归这里：到它跟前就伏下去
      const out = rectDist(NEAR, bx, bz), up = smooth(-14, 50, out);
      const crest = (0.22 + 1.35 * smooth(0.36, 0.7, fbm(p.s * 0.0036 + side * 3.1, 5.5, 2, 43))) * up;
      // 迎水面那一笔：时有时无
      const strokeK = smooth(0.4, 0.58, fbm(p.s * 0.0075 + side * 11.3, 2.2, 2, 53)) * up;
      const row: number[] = [];
      for (let k = 0; k < off.length; k++) {
        const x = bx + p.nx * side * off[k], z = bz + p.nz * side * off[k], wy = waterY(x, z);
        const y = up < 0.02 ? wy - 0.45 : wy + (hgt[k] > 0 ? hgt[k] * crest : hgt[k] * (0.4 + 0.6 * up));
        let c: RGB;
        if (k <= 1) c = mix3(tone(0), SAND, 0.5);
        else if (k === 2) c = mix3(SAND, WET, 0.35 * strokeK);
        else if (k === 3 || k === 4) c = mix3(SAND, WET, (k === 3 ? 0.95 : 0.8) * strokeK + 0.12);
        else if (k === 5) c = mix3(SAND, tone(0.1), 0.45);
        else c = tone(0);
        row.push(B.v(x, y, z, off[k] / 110, p.s / 30000, c));
      }
      if (prev) for (let k = 0; k < off.length - 1; k++) { if (side > 0) B.quad(prev[k], row[k], row[k + 1], prev[k + 1]); else B.quad(prev[k], prev[k + 1], row[k + 1], row[k]); }
      prev = row;
      if (up > 0.5) shore.push({ x: bx, y: waterY(bx, bz), z: bz, side, s: p.s, crest, nx: p.nx * side, nz: p.nz * side });
    }
  }

  // —— 沙渚 ——
  const R = mulberry32(4201);
  for (const bar of o.bars) {
    const nS = 20, rr = [0, 0.42, 0.78, 1, 1.22], hh = [1, 0.82, 0.34, 0, -0.42];
    const ph = R() * 6.28, lobes = new Float32Array(nS);
    for (let a = 0; a < nS; a++) lobes[a] = 0.8 + 0.22 * Math.sin((a / nS) * 6.28 * 2 + ph) + 0.2 * (R() - 0.5);
    const strokeAt = R() * 6.28;
    let prev: number[] = [];
    for (let k = 0; k < rr.length; k++) {
      const row: number[] = [];
      for (let a = 0; a <= nS; a++) {
        const aa = a % nS, th = (aa / nS) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), rad = rr[k] * lobes[aa];
        // 顺流的一头尖些（水冲出来的形）
        const along = c * bar.a * rad * (c > 0 ? 1.15 : 0.9), across = s * bar.b * rad;
        const x = bar.x + bar.tx * along - bar.tz * across, z = bar.z + bar.tz * along + bar.tx * across;
        const wet = (k === 3 ? 0.85 : k === 2 ? 0.3 : 0) * smooth(-0.2, 0.5, Math.sin(th * 2 + strokeAt) + 0.4 * Math.sin(th * 5 + ph));
        row.push(B.v(x, waterY(x, z) + hh[k] * bar.h, z, (rad * bar.b) / 110, (bar.x + along) / 30000, k === 4 ? mix3(tone(0), SAND, 0.5) : mix3(SAND, WET, wet)));
      }
      if (k > 0) for (let a = 0; a < nS; a++) B.quad(prev[a], row[a], row[a + 1], prev[a + 1]);
      prev = row;
    }
  }

  // —— 田：一块一个走向，条与条深浅相间 ——
  for (const f of o.fields) {
    const c = Math.cos(f.rot), s = Math.sin(f.rot), sw = f.w / f.n;
    for (let i = 0; i < f.n; i++) {
      if (R() < 0.12) continue;                                          // 留几条空的（歇着的地）
      const v0 = -f.w / 2 + i * sw + sw * 0.08, v1 = v0 + sw * 0.84, l0 = -f.l / 2 * (0.82 + 0.18 * R()), l1 = (f.l / 2) * (0.82 + 0.18 * R());
      const cs: Array<[number, number]> = [[l0, v0], [l1, v0], [l1, v1], [l0, v1]];
      const P = cs.map(([u, v]) => [f.x + c * u - s * v, f.z + s * u + c * v] as [number, number]);
      // 进了近处那块地、挨着河的不要
      if (P.some(([x, z]) => rectDist(NEAR, x, z) < 14 || riverAt(x, z).d - riverAt(x, z).w < 34)) continue;
      const col = tone((i % 2 ? 0.34 : -0.12) + (R() - 0.5) * 0.3, R() - 0.5);
      const id = P.map(([x, z], k) => B.v(x, plainY(x, z) + 0.07, z, cs[k][1] / 110, cs[k][0] / 30000, col));
      B.quad(id[0], id[3], id[2], id[1]);
    }
  }
  // —— 路：发白的一条 ——
  for (const rd of o.roads) {
    let prev: [number, number] | null = null;
    for (let i = 0; i < rd.pts.length; i++) {
      const a = rd.pts[Math.max(0, i - 1)], b = rd.pts[Math.min(rd.pts.length - 1, i + 1)], p = rd.pts[i];
      let nx = -(b[1] - a[1]), nz = b[0] - a[0];
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      const col = tone(-0.7, 0.4);
      const l0 = B.v(p[0] - nx * rd.w / 2, plainY(p[0], p[1]) + 0.1, p[1] - nz * rd.w / 2, 0, i * 0.01, col), r0 = B.v(p[0] + nx * rd.w / 2, plainY(p[0], p[1]) + 0.1, p[1] + nz * rd.w / 2, 0.03, i * 0.01, col);
      if (prev) B.quad(prev[0], l0, r0, prev[1]);
      prev = [l0, r0];
    }
  }

  // —— 水面 ——
  const wp: number[] = [], wu: number[] = [], we: number[] = [], wi: number[] = [];
  let prevRow = -1;
  for (let i = 0; i < RIVER_FINE.length; i++) {
    const p = RIVER_FINE[i], row = wp.length / 3;
    const cols: Array<[number, number]> = [[-(p.w + 30), 0], [-(p.w + 18), 1], [-(p.w - 30), 1], [-p.w * 0.4, 1], [0, 1], [p.w * 0.4, 1], [p.w - 30, 1], [p.w + 18, 1], [p.w + 30, 0]];
    for (const [d, e] of cols) { const x = p.x + p.nx * d, z = p.z + p.nz * d; wp.push(x, waterY(x, z), z); wu.push(d, p.s); we.push(e); }
    if (prevRow >= 0) for (let k = 0; k < cols.length - 1; k++) wi.push(prevRow + k, row + k, row + k + 1, prevRow + k, row + k + 1, prevRow + k + 1);
    prevRow = row;
  }
  for (const pl of pools) {
    const nS = 18, c0 = wp.length / 3, cr = Math.cos(pl.rot), sr = Math.sin(pl.rot), ph = pl.x * 0.37 + pl.z * 0.11;
    wp.push(pl.x, waterY(pl.x, pl.z), pl.z); wu.push(0, pl.x); we.push(1);
    for (let k = 0; k < 2; k++) for (let a = 0; a < nS; a++) {
      const th = (a / nS) * Math.PI * 2, rad = (k ? 1 : 0.72) * (0.82 + 0.2 * Math.sin(th * 2 + ph) + 0.14 * Math.sin(th * 5 + ph * 2.3));
      const u = Math.cos(th) * pl.rx * rad, v = Math.sin(th) * pl.rz * rad, x = pl.x + cr * u - sr * v, z = pl.z + sr * u + cr * v;
      wp.push(x, waterY(x, z), z); wu.push(v, pl.x + u); we.push(k ? 0 : 1);
    }
    for (let a = 0; a < nS; a++) { const a1 = (a + 1) % nS; wi.push(c0, c0 + 1 + a1, c0 + 1 + a, c0 + 1 + a, c0 + 1 + a1, c0 + 1 + nS + a1, c0 + 1 + a, c0 + 1 + nS + a1, c0 + 1 + nS + a); }
  }
  for (const bk of brooks) {
    let prev = -1, len = 0;
    for (let i = 0; i < bk.pts.length; i++) {
      const a = bk.pts[Math.max(0, i - 1)], b = bk.pts[Math.min(bk.pts.length - 1, i + 1)], p = bk.pts[i], row = wp.length / 3;
      let nx = -(b[1] - a[1]), nz = b[0] - a[0];
      const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if (i > 0) len += Math.hypot(p[0] - bk.pts[i - 1][0], p[1] - bk.pts[i - 1][1]);
      for (const [d, e] of [[-bk.w - 3, 0], [-bk.w, 1], [0, 1], [bk.w, 1], [bk.w + 3, 0]] as Array<[number, number]>) { const x = p[0] + nx * d, z = p[1] + nz * d; wp.push(x, waterY(x, z), z); wu.push(d, len); we.push(e); }
      if (prev >= 0) for (let k = 0; k < 4; k++) wi.push(prev + k, row + k, row + k + 1, prev + k, row + k + 1, prev + k + 1);
      prev = row;
    }
  }
  const water = new THREE.BufferGeometry();
  water.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  water.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
  water.setAttribute('aEdge', new THREE.Float32BufferAttribute(we, 1));
  water.setIndex(wi);
  water.computeBoundingSphere();
  return { geo: B.build(), water, shore };
}
