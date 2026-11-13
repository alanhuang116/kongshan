/**
 * 茅草顶。草堂的脸面是屋顶：厚、软、手铺的——
 *   一层压一层地铺上去（每一层的草根齐成一道略歪的棱，勾线就落在这道棱上）；
 *   檐口是厚厚一刀草根，参差不齐地垂着；四角略塌；屋脊中间微陷、两头略翘，上面压一条草把，草把上骑着交叉的竹竿；
 *   老草发灰，补过的地方草色新。
 * 两种形：四面出水的（hip > 0，两头的坡陡一些，转角是软的圆角；hip = 檐口半长时就是攒尖的亭顶），
 *         两面出水的（hip = 0，两头是山墙，草顶齐着切下去）。披屋是「一面坡」（lean）。
 * 出来的几何：原点在屋的正中，檐口上皮在 y≈0，屋脊沿 x。uv 的 u 沿檐口走、v 顺坡（茅草的丝顺着 v）。
 */
import * as THREE from 'three';
import { grid, merge, shade, tint, colorize, type Geo } from '../core/geo';
import { fbm, mulberry32, smooth, vnoise } from '../core/rng';
import { facing, pole, tube, v3, type V3 } from './kit';

export interface ThatchOpts {
  /** 檐口外沿的长（沿屋脊）、宽 */
  w: number; d: number;
  /** 屋脊比檐口高多少 */
  rise: number;
  /** 两头的坡在平面上占多长；0 是两面坡（山墙） */
  hip: number;
  /** 檐口草的厚度 */
  thick?: number;
  /** 坡的凹：0 直，0.3 檐口明显缓下来 */
  sag?: number;
  /** 屋脊两头翘起多少、中间陷下多少 */
  lift?: number; ridgeSag?: number;
  /** 转角的圆（米）、四角比檐中低多少 */
  round?: number; droop?: number;
  /** 铺几层、每层草根的棱多高 */
  courses?: number; step?: number;
  /** 檐口参差的幅度 */
  rag?: number;
  /** 沿檐口每隔多远一列 */
  cell?: number;
  seed?: number;
  /** 脊上的草把多粗（0 不要）；骑在脊上的交叉竹竿几对 */
  roll?: number; cross?: number;
  /** 一面坡（披屋）：只有 +z 这一面，高的一边（z=0）靠着墙；d 是这一面坡在平面上的进深 */
  lean?: boolean;
  /** 整体的深浅（乘在顶点色上） */
  tone?: number;
  /** 补过的几块：在朝 ±z 的大坡面上，中心 (x, z)、宽 w（沿脊）、顺坡的平面长 l */
  patches?: Array<{ x: number; z: number; w: number; l: number }>;
}
export interface Thatch {
  /** 茅草（顶面、檐口、底面、脊上的草把并在一起） */ thatch: Geo;
  /** 压脊的竹竿（没有就是 null） */ bamboo: Geo | null;
  /** 顶面在平面上 (x, z) 处大约多高 */ top(x: number, z: number): number;
  /** 屋脊的半长、屋脊正中的高 */ ridgeHalf: number; ridgeY: number;
}

interface Col { x: number; z: number; nx: number; nz: number; tx: number; tz: number; s: number; y0: number; hr: number; out: number; drop: number; len: number }

export function thatchRoof(o: ThatchOpts): Thatch {
  const a = o.w / 2, b = o.lean ? o.d : o.d / 2, seed = o.seed ?? 1, R = mulberry32(seed * 977 + 5);
  const thick = o.thick ?? 0.3, sag = o.sag ?? 0.2, lift = o.lift ?? 0.1, rsag = o.ridgeSag ?? 0.08, droop = o.droop ?? 0.1;
  const C = Math.max(1, o.courses ?? 3), step = o.step ?? 0.06, rag = o.rag ?? 0.07, cell = o.cell ?? 0.15, tone = o.tone ?? 1;
  const gable = o.hip <= 0 || !!o.lean, Lh = gable ? a : Math.max(0, a - o.hip), rc = gable ? 0 : Math.min(o.round ?? 0.5, a * 0.6, b * 0.6);
  const cx = (x: number) => Math.max(-Lh, Math.min(Lh, x));
  const hr = (x: number) => o.rise + (Lh > 0.01 ? lift * Math.pow(Math.abs(x) / Lh, 2.2) - rsag * (1 - Math.pow(x / Lh, 2)) + 0.05 * (vnoise(x * 0.9 + seed * 3.1, 0.5, seed) - 0.5) : 0);
  const prof = (t: number) => (1 - sag) * t + sag * t * t;
  const h1 = (k: number, m: number) => { const v = Math.sin(k * 127.1 + m * 311.7 + seed * 74.7) * 43758.5453; return v - Math.floor(v); };

  // —— 一列一列：檐口上的一点，和它在屋脊上的对点 ——
  const mk = (x: number, z: number, nx: number, nz: number, s: number, corner: number, k: number): Col => {
    const tx = gable ? x : cx(x), tz = 0;
    const y0 = -droop * corner + 0.045 * (vnoise(s * 0.3 + seed, 3.3, seed + 1) - 0.5) * 2;
    const hh = hr(tx);
    return { x, z, nx, nz, tx, tz, s, y0, hr: hh, out: rag * 0.7 * (h1(k, 1) - 0.5) + rag * 0.5 * (vnoise(s * 1.3, 7.7, seed + 2) - 0.5), drop: rag * (0.15 + 1.1 * h1(k, 2) * h1(k, 3)) + rag * 0.6 * vnoise(s * 0.8, 1.1, seed + 4), len: Math.hypot(tx - x, tz - z, hh - y0) };
  };
  const sets: Array<{ cols: Col[]; closed: boolean; sg: number }> = [];
  if (gable) {
    const n = Math.max(4, Math.round((2 * a) / cell));
    for (const sg of o.lean ? [1] : [1, -1]) {
      const cols: Col[] = [];
      for (let i = 0; i <= n; i++) { const x = -a + (2 * a * i) / n; cols.push(mk(x, sg * b, 0, sg, (i / n) * 2 * a, smooth(1.2, 0, Math.min(x + a, a - x)) * 0.5, i + (sg > 0 ? 0 : 1000))); }
      sets.push({ cols, closed: false, sg });
    }
  } else {
    const cols: Col[] = [];
    let s = 0, k = 0;
    /** 一段直檐。c0、c1：这一段的起点、终点是不是转角（转角处檐口往下塌一点） */
    const straight = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, c0: boolean, c1: boolean) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / cell));
      for (let i = 0; i < n; i++) { const t = i / n, d = Math.min(c0 ? t * len : 1e9, c1 ? (1 - t) * len : 1e9); cols.push(mk(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, nx, nz, s + t * len, smooth(1.5, 0, d), k++)); }
      s += len;
    };
    const arc = (ax: number, az: number, a0: number) => {
      const len = (Math.PI / 2) * rc, n = Math.max(3, Math.round(len / (cell * 0.8)));
      for (let i = 0; i < n; i++) { const t = i / n, an = a0 + (t * Math.PI) / 2; cols.push(mk(ax + Math.cos(an) * rc, az + Math.sin(an) * rc, Math.cos(an), Math.sin(an), s + t * len, 1, k++)); }
      s += len;
    };
    // 自北面正中起，经东、南、西，回到北面正中（接缝留在屋后）
    straight(0, -b, a - rc, -b, 0, -1, false, true); arc(a - rc, -b + rc, -Math.PI / 2);
    straight(a, -b + rc, a, b - rc, 1, 0, true, true); arc(a - rc, b - rc, 0);
    straight(a - rc, b, -a + rc, b, 0, 1, true, true); arc(-a + rc, b - rc, Math.PI / 2);
    straight(-a, b - rc, -a, -b + rc, -1, 0, true, true); arc(-a + rc, -b + rc, Math.PI);
    straight(-a + rc, -b, 0, -b, 0, -1, true, false);
    cols.push({ ...cols[0], s });
    sets.push({ cols, closed: true, sg: 0 });
  }

  const out: Geo[] = [], fresh: Geo[] = [];
  const bump = (x: number, z: number) => 0.05 * (fbm(x * 0.55 + seed * 1.7, z * 0.55 + 9.1, 2, seed + 9) - 0.5) * 2;
  /** 顶面上的一点：第 c 列、坡上 t 处、再往外鼓 off */
  const P = (c: Col, t: number, off: number): V3 => {
    const e = 1 - t, x = c.x + (c.tx - c.x) * t + c.nx * c.out * e * e, z = c.z + (c.tz - c.z) * t + c.nz * c.out * e * e;
    return v3(x, c.y0 + (c.hr - c.y0) * prof(t) + off + bump(x, z) * Math.min(1, t * 3 + 0.25), z);
  };
  const UU = [0, 0.3, 0.65, 1];
  for (const { cols, closed, sg } of sets) {
    const K = cols.length;
    // 每层草根在坡上的位置：每列都歪一点
    const tb: number[][] = [];
    for (let c = 0; c <= C; c++) tb.push(cols.map((col, k) => (c === 0 ? 0 : c === C ? 1 : c / C + ((vnoise(col.s * 0.5 + c * 11.3, c * 3.7, seed + 6) - 0.5) * 0.3 + (h1(k, 10 + c) - 0.5) * 0.07) / C)));
    const ov = (col: Col) => 0.03 / col.len;
    // 每层草根的棱有高有低（有的地方几乎看不出），线才不是一圈匀匀的箍
    const stepK = cols.map((col) => 0.3 + 1.0 * smooth(0.3, 0.7, vnoise(col.s * 0.33 + 5.1, 2.9, seed + 12)));
    const stepOf = (c: number, k = 0) => (c === 0 ? step * 0.7 : step * stepK[k] * (0.8 + 0.4 * h1(c, 77)));
    const t0Of = (c: number, k: number) => (c === 0 ? 0 : tb[c][k] - ov(cols[k]));
    /** 第 k 列、坡上 t 处那一层草鼓出多少 */
    const offAt = (k: number, t: number) => {
      let c = 0;
      while (c < C - 1 && t >= tb[c + 1][k]) c++;
      const a0 = t0Of(c, k), a1 = tb[c + 1][k];
      return stepOf(c, k) * Math.pow(1 - Math.max(0, Math.min(1, (t - a0) / Math.max(1e-4, a1 - a0))), 1.3);
    };
    const uvOf = (i: number, _j: number, p: V3): [number, number] => [cols[i].s, Math.hypot(p.x - cols[i].x, p.z - cols[i].z, p.y - cols[i].y0)];
    const up = (): [number, number, number] => [0, 1, 0];
    const outward = (x: number, _y: number, z: number): [number, number, number] => (closed ? [x, 0, z] : [0, 0, sg]);
    // 顶面：一层一张
    const firstRow: V3[][] = [], lastRow: V3[][] = [];
    for (let c = 0; c < C; c++) {
      const pts = cols.map((col, k) => UU.map((u) => { const a0 = t0Of(c, k), a1 = tb[c + 1][k]; return P(col, a0 + (a1 - a0) * u, stepOf(c, k) * Math.pow(1 - u, 1.3)); }));
      firstRow.push(pts.map((r) => r[0])); lastRow.push(pts.map((r) => r[UU.length - 1]));
      out.push(facing(grid(pts, uvOf), up));
    }
    // 草根的棱（上一层的草根压在下一层上）：一条窄窄的立面，略暗
    for (let c = 1; c < C; c++) {
      const pts = cols.map((_col, k) => [lastRow[c - 1][k], firstRow[c][k]]);
      out.push(tint(facing(grid(pts, uvOf), (x, y, z) => { const w = outward(x, y, z); return [w[0] * 0.3, -0.2, w[2]]; }), 0.86));
    }
    // 檐口：一刀草根，下沿参差
    // （中间鼓一点、下沿往里收：是一把一把垂着的草，不是一块板）
    const foot = cols.map((col) => v3(col.x - col.nx * (0.17 - col.out * 0.5), col.y0 - thick - col.drop, col.z - col.nz * (0.17 - col.out * 0.5)));
    const belly = cols.map((col, k) => { const p = firstRow[0][k]; return v3(p.x + col.nx * 0.012, p.y - thick * (0.42 + 0.2 * h1(k, 5)), p.z + col.nz * 0.012); });
    out.push(shade(facing(grid(cols.map((_c, k) => [foot[k], belly[k], firstRow[0][k]]), (i, j) => [cols[i].s, j * thick * 0.5]), outward), (_x, y) => 0.74 + 0.16 * smooth(-thick, 0, y)));
    // 底面：从檐口下沿一直到脊下，深色
    const under = cols.map((col, k) => [foot[k], P(col, 0.5, -thick * 0.95), P(col, 1, -thick * 0.85)]);
    out.push(tint(facing(grid(under, (i, j) => [cols[i].s, j * 1.6]), () => [0, -1, 0]), 0.5));
    // 两面坡：山面那一刀（草顶齐着切下去的断面）
    if (!closed) {
      for (const k of [0, K - 1]) {
        const col = cols[k], edge: V3[] = [];
        for (let c = 0; c < C; c++) for (const u of UU) { const a0 = t0Of(c, k), a1 = tb[c + 1][k]; edge.push(P(col, a0 + (a1 - a0) * u, stepOf(c, k) * Math.pow(1 - u, 1.3))); }
        const sx = Math.sign(col.x) || 1;
        const low = edge.map((p, i) => (i === 0 ? foot[k].clone() : v3(p.x - sx * 0.03, p.y - thick * (0.95 - 0.1 * (i / edge.length)), p.z)));
        out.push(tint(facing(grid([edge, low], (i, j) => [j * 0.5, i * thick]), () => [sx, 0, 0]), 0.78));
      }
    }
    // 补过的几块：新草，略高出一层，下沿也是一道草根
    for (const pa of o.patches ?? []) {
      if (closed ? false : Math.sign(pa.z) !== sg) continue;
      const ks: number[] = [];
      cols.forEach((col, k) => { if (Math.abs(col.x - pa.x) <= pa.w / 2 && Math.sign(col.z) === Math.sign(pa.z) && Math.abs(Math.abs(col.z) - b) < 0.01 && (closed ? k < K - 1 : true)) ks.push(k); });
      if (ks.length < 3) continue;
      const ta = Math.max(0.03, 1 - (Math.abs(pa.z) + pa.l / 2) / b), tz = Math.min(0.94, 1 - (Math.abs(pa.z) - pa.l / 2) / b), nr = 4;
      const pts = ks.map((k, i) => {
        const side = Math.min(i, ks.length - 1 - i) === 0 ? 0.006 : 0.04, lo = ta + (h1(k, 40) - 0.5) * 0.05;
        const col: V3[] = [P(cols[k], lo + 0.004, offAt(k, lo + 0.004) - 0.01)];
        for (let j = 0; j <= nr; j++) { const t = lo + ((tz - lo) * j) / nr; col.push(P(cols[k], t, offAt(k, t) + side * (1 - 0.85 * (j / nr)) + 0.012)); }
        return col;
      });
      fresh.push(tint(facing(grid(pts, (i, j, p) => [cols[ks[i]].s + 0.37, Math.hypot(p.x - cols[ks[i]].x, p.z - cols[ks[i]].z, p.y)]), up), tone * 1.03, tone * 1.02, tone * 0.985));
    }
  }

  // —— 着色：老草发灰，深浅不匀；背阴的一面更旧 ——
  const g = merge(out);
  colorize(g, (x, y, z, _nx, _ny, _nz, c) => {
    const n = fbm(x * 0.42 + seed * 2.3, z * 0.42 + y * 0.35, 3, seed + 20), m = fbm(x * 1.9 + 3, z * 1.9 + y, 2, seed + 21);
    const old = smooth(0.52, 0.78, n), k = tone * (0.93 + 0.1 * (m - 0.5) * 2 - 0.13 * old - (z < 0 ? 0.03 : 0));
    c[0] = k; c[1] = k * (1 + 0.012 * old); c[2] = k * (1 + 0.07 * old);
  });

  // —— 脊：一条压扁的草把，草丝横跨屋脊；上面骑着交叉的竹竿，两边各压一根长竹 ——
  const extra: Geo[] = [...fresh], bam: Geo[] = [];
  const rollR = o.roll ?? 0.2, half = gable ? a - 0.02 : Lh + (Lh > 0.01 ? 0.22 : 0);
  if (rollR > 0 && Lh > 0.01 && !o.lean) {
    const n = Math.max(6, Math.round((2 * half) / 0.35)), path: V3[] = [];
    for (let i = 0; i <= n; i++) { const x = -half + (2 * half * i) / n; path.push(v3(x, hr(cx(x)) + rollR * 0.18 + 0.03 * (vnoise(x * 1.7, 5, seed + 30) - 0.5), 0.03 * (vnoise(x * 1.1, 8, seed + 31) - 0.5))); }
    const roll = tube(path, (t) => rollR * (1 + 0.16 * Math.pow(Math.abs(t * 2 - 1), 3) + 0.1 * (vnoise(t * 9, 2, seed + 32) - 0.5)), 10, true, true);
    // 压扁：竖里收一些、横里放一些
    const p = roll.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const yc = hr(cx(p.getX(i))) + rollR * 0.18; p.setY(i, yc + (p.getY(i) - yc) * 0.78); p.setZ(i, p.getZ(i) * 1.5); }
    extra.push(tint(roll, tone * 0.86, tone * 0.87, tone * 0.9));
    const nx = o.cross ?? Math.max(2, Math.round((2 * Lh) / 1.25));
    if (nx > 0) {
      const topY = (x: number) => hr(cx(x)) + rollR * 0.18 + rollR * 0.78;
      const slope = (x: number, z: number) => hr(cx(x)) * prof(Math.max(0, 1 - Math.abs(z) / b)) + step;
      for (let i = 0; i < nx; i++) {
        const x = -Lh + (2 * Lh * (i + 0.5)) / nx + (R() - 0.5) * 0.2;
        for (const sg of [1, -1]) {
          const zz = sg * (0.7 + 0.25 * R()), A = v3(x + sg * 0.045 + (R() - 0.5) * 0.1, slope(x, zz) + 0.04, zz), T = v3(x + sg * 0.045, topY(x) + 0.03, sg * 0.02);
          const B = T.clone().add(T.clone().sub(A).multiplyScalar(0.2 + 0.22 * R()));
          bam.push(pole(A, B, 0.026, 0.021, 5));
        }
      }
      for (const sg of [1, -1]) {
        const zz = sg * 0.5, pts: V3[] = [];
        const ext = gable ? -0.25 : 0.1;
        for (let i = 0; i <= 6; i++) { const x = -Lh - ext + ((2 * Lh + 2 * ext) * i) / 6; pts.push(v3(x, slope(x, zz) + 0.085, zz + 0.03 * (R() - 0.5))); }
        bam.push(tube(pts, 0.024, 5, true));
      }
    }
  }
  const all = extra.length ? merge([g, ...extra]) : g;
  const top = (x: number, z: number) => {
    const t = Math.max(0, Math.min(1, o.lean ? 1 - z / b : 1 - Math.abs(z) / b, gable ? 1 : 1 - (Math.abs(x) - Lh) / Math.max(1e-3, o.hip)));
    return hr(cx(x)) * prof(t);
  };
  return { thatch: all, bamboo: bam.length ? merge(bam) : null, top, ridgeHalf: Lh, ridgeY: o.rise };
}
