/**
 * 松。画谱里说松「盘、曲、横出」，针「成片成层」：
 *   干一段一段长，每段换一点方向，往一边斜、左右摆两三道弯；皮是一片片的鳞（材质里的块缝）；
 *   枝从干的上半出来，先平伸、再下探，一路带折；每枝梢头托着一片平展的松盖（底平、顶微隆）。
 *   松盖是一把把朝上张开的针（攒针）排成的，底下压几笔浓墨——所以从院里平看是一层层的盖，仰看是针的扇面。
 * 「前」是 +x：干朝那边斜，最低最长的一枝（迎客的那只手）也朝那边探。
 */
import { EVER } from './tiles';
import { FGeo, UP, along, clamp01, lerp, smoothPath, sstep, tube, v3, type RGB, type Rand, type V3 } from './kit';
import type { Sink } from './sink';

const TAU = Math.PI * 2;
const FANS = [EVER.idx.zhen0, EVER.idx.zhen1, EVER.idx.zhen3, EVER.idx.zhen4, EVER.idx.zhen0];
const PADS = [EVER.idx.zhenPad, EVER.idx.zhenPad2];
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface PineOpts {
  /** 干长（米）、根径 */ H: number; r0: number;
  /** 斜（梢头倾角的正切上下）、盘曲的幅度（弧度）、顶上放平几成 */ lean: number; twist: number; flatTop: number;
  /** 大枝数、第一枝在干的几成高、最长的枝 */ branches: number; first: number; reach: number;
  /** 下层的枝别朝这个方位（弧度，树自己的坐标）伸：那边有屋 */ avoid?: number;
  lite?: boolean;
}
export function pine(S: Sink, R: Rand, o: PineOpts) {
  const bark = new FGeo();
  const BK: RGB = [0.6, 0.565, 0.54], BR: RGB = [0.53, 0.5, 0.49];
  // —— 干 ——
  const p1 = R.r(0, TAU), p2 = R.r(0, TAU), bends = R.r(2.4, 3.1);
  const ctrl: V3[] = [v3(0, -0.3, 0)];
  {
    const segs = 9; let p = v3(0, -0.3, 0); const dir = v3(0, 1, 0);
    for (let k = 1; k <= segs; k++) {
      const t = k / segs, sw = o.twist * Math.sin(t * Math.PI * bends + p1), sw2 = o.twist * 0.45 * Math.sin(t * Math.PI * bends * 1.7 + p2);
      const ln = o.lean * (0.25 + 1.5 * t * t);
      dir.lerp(v3(ln + sw2, 1 - o.flatTop * t * t, sw).normalize(), k === 1 ? 0.35 : 0.75).normalize();
      p = p.clone().addScaledVector(dir, (o.H + 0.3) / segs);
      ctrl.push(p);
    }
  }
  const NR = o.lite ? 12 : 20, tp = smoothPath(ctrl, NR);
  const top = tp[NR], Ht = top.y;
  const rAt = (t: number) => o.r0 * (Math.pow(1 - t, 0.85) * 0.9 + 0.1);
  const axisAt = (y: number) => { for (let i = 1; i < tp.length; i++) if (tp[i].y >= y) return tp[i - 1].clone().lerp(tp[i], clamp01((y - tp[i - 1].y) / Math.max(1e-4, tp[i].y - tp[i - 1].y))); return top; };
  const swayAt = (p: V3) => { const a = axisAt(p.y); return clamp01(0.08 * Math.pow(clamp01(p.y / Ht), 2) + 0.42 * Math.pow(clamp01(Math.hypot(p.x - a.x, p.z - a.z) / (o.reach * 1.05)), 1.4)); };
  const knot = R.r(0, TAU);
  tube(bark, tp, tp.map((p, i) => rAt(i / NR) * (1 + 0.6 * Math.exp(-(p.y + 0.3) / (o.r0 * 1.9)))), {
    sides: o.lite ? 7 : 10, uSpan: 1.2, vPerM: 1, col: (i) => { const k = 0.9 + 0.1 * sstep(0, 0.25, i / NR); return [BK[0] * k, BK[1] * k, BK[2] * k]; }, sway: (_i, p) => swayAt(p),
    bulge: (i, a) => 1 + 0.2 * Math.exp(-(tp[i].y + 0.3) / (o.r0 * 1.6)) * Math.sin(a * 5 + knot) + 0.06 * Math.sin(a * 3 + i * 0.9 + knot) + 0.04 * Math.sin(a * 2 - i * 0.5),
  });
  // 枯桩：早年断掉的枝
  for (let k = 0; k < 3; k++) {
    const t = R.r(0.18, 0.44), P0 = along(tp, t), a = R.r(0, TAU), l = R.r(0.4, 1.0), r = rAt(t) * 0.3;
    const d = v3(Math.cos(a), R.r(-0.3, 0.25), Math.sin(a)).normalize();
    tube(bark, [P0, P0.clone().addScaledVector(d, l * 0.5).add(v3(0, R.r(0.02, 0.1), 0)), P0.clone().addScaledVector(d, l)], [r, r * 0.55, 0.014], { sides: 5, uSpan: 0.4, col: [0.8, 0.76, 0.72], cap: true });
  }

  // —— 松盖：一把把攒针排成平展的一片 ——
  const pad = (c: V3, rad: number, az: number) => {
    const rx = rad, rz = rad * R.r(0.72, 0.95), ry = rad * 0.2, ca = Math.cos(az), sa = Math.sin(az);
    const n = Math.max(5, Math.round(12 * rx * rz));
    const sw = swayAt(c), lv = lerp(0.84, 1.05, clamp01((c.y / Ht - o.first) / (1 - o.first)));
    for (let i = 0; i < n; i++) {
      const a = R.r(0, TAU), q = Math.sqrt(R()), lx = Math.cos(a) * q * rx, lz = Math.sin(a) * q * rz;
      const x = c.x + lx * ca - lz * sa, z = c.z + lx * sa + lz * ca, y = c.y + ry * (1 - q * q) + R.pm(0.05);
      const size = R.r(0.5, 0.76) * (1 - 0.15 * q), u = R();
      const tile = u < 0.12 ? R.pick(PADS) : u < 0.3 ? EVER.idx.zhen2 : R.pick(FANS);
      S.dab('pine', x, y + size * 0.3, z, tile === EVER.idx.zhen2 || u < 0.12 ? size * 1.25 : size, tile, (x - c.x) * 0.5, rad, (z - c.z) * 0.5, lv * R.r(0.88, 1.08) * (1 - 0.1 * q), [R.r(0.95, 1.04), 1, R.r(0.92, 1.02)], R.pm(0.2), sw);
    }
    // 底下压几笔浓墨（朝下的一面：背光）
    const nb = Math.max(1, Math.round(n * 0.14));
    for (let i = 0; i < nb; i++) {
      const a = R.r(0, TAU), q = Math.sqrt(R()) * 0.7, lx = Math.cos(a) * q * rx, lz = Math.sin(a) * q * rz;
      S.dab('pine', c.x + lx * ca - lz * sa, c.y - 0.12 + R.pm(0.05), c.z + lx * sa + lz * ca, R.r(0.62, 0.92), EVER.idx.zhenBelly, lx, -rad * 0.15, lz, lv * R.r(0.9, 1.02), null, R.pm(0.12), sw);
    }
  };

  // —— 枝：先平伸，再下探，一路带折 ——
  let az = R.r(0, TAU);
  const zig = 1.3, droop = 0.46;
  for (let b = 0; b < o.branches; b++) {
    const f = o.branches > 1 ? b / (o.branches - 1) : 0.5;
    const t = Math.min(0.965, Math.max(o.first, lerp(o.first, 0.95, f) + R.pm(0.025)));
    az += 2.399963 + R.pm(0.5);
    // 往「前」偏一些；下层的枝避开屋那一边
    let a = az + wrap(-az) * 0.5 * R.r(0.45, 1);
    if (o.avoid !== undefined && f < 0.6) { const d = wrap(a - o.avoid); if (Math.abs(d) < 1.15) a = o.avoid + (d < 0 ? -1 : 1) * R.r(1.15, 1.6); }
    const arm = b === 0 ? 1.25 : 1;
    if (b === 0) a = R.pm(0.45);
    const len = o.reach * arm * lerp(1, 0.66, sstep(0.55, 1, f)) * lerp(0.8, 1, sstep(0, 0.35, f)) * R.r(0.82, 1.08);
    const e0 = R.r(0.14, 0.44), e1 = lerp(-droop, 0.1, f) + R.pm(0.08);
    const P0 = along(tp, t), rT = rAt(t), bc: V3[] = [P0];
    let p = P0;
    for (let k = 1; k <= 6; k++) {
      const q = k / 6, e = lerp(e0, e1, q * q * (3 - 2 * q)), step = len / 6;
      a += (k % 2 ? 1 : -1) * R.r(0.08, 0.32) * zig;
      p = p.clone().add(v3(Math.cos(a) * Math.cos(e) * step, Math.sin(e) * step, Math.sin(a) * Math.cos(e) * step));
      bc.push(p);
    }
    const NB = o.lite ? 6 : 9, bp = smoothPath(bc, NB, 0.2);
    const r0b = Math.min(rT * 0.6, 0.034 + len * 0.022);
    tube(bark, bp, bp.map((_, i) => lerp(r0b, 0.024, Math.pow(i / NB, 0.8))), { sides: o.lite ? 5 : 6, uSpan: 0.5, col: BR, sway: (_i, q) => swayAt(q) });
    const tip = bp[NB];
    const nsub = 1 + R.i(3);
    for (let s = 0; s < nsub; s++) {
      const q = lerp(0.34, 0.86, (s + R.r(0.2, 0.8)) / nsub), dir = v3(), base = along(bp, q, dir);
      const d = dir.clone().applyAxisAngle(UP, (s % 2 ? 1 : -1) * R.r(0.6, 1.15)); d.y = R.r(0.04, 0.3); d.normalize();
      const l2 = Math.max(0.55, len * (1 - q) * R.r(0.55, 0.95) + 0.45), e = base.clone().addScaledVector(d, l2);
      e.y += R.r(-0.05, 0.14) * l2;
      const rs = lerp(r0b, 0.024, Math.pow(q, 0.8)) * 0.62;
      tube(bark, [base, base.clone().addScaledVector(d, l2 * 0.5).add(v3(0, 0.06 * l2, 0)), e], [rs, rs * 0.7, 0.016], { sides: 4, uSpan: 0.3, col: BR, sway: (_i, w) => swayAt(w) });
      pad(v3(e.x, e.y + 0.08, e.z), 1.28 * R.r(0.64, 0.92) * (0.76 + 0.3 * (len / o.reach)), Math.atan2(d.z, d.x));
    }
    const td = v3().subVectors(tip, bp[NB - 1]);
    pad(v3(tip.x, tip.y + 0.08, tip.z), 1.28 * R.r(0.86, 1.15) * (0.8 + 0.3 * (len / o.reach)), Math.atan2(td.z, td.x));
  }
  // —— 冠顶：干梢上一大片，旁边再带两片 ——
  pad(v3(top.x, top.y + 0.1, top.z), 1.5, R.r(0, 3.14));
  for (let k = 0; k < 2; k++) {
    const a = R.r(0, TAU), d = R.r(0.8, 1.2), e = v3(top.x + Math.cos(a) * d, top.y - R.r(0.25, 0.55), top.z + Math.sin(a) * d), from = along(tp, 0.93);
    tube(bark, [from, from.clone().lerp(e, 0.5).add(v3(0, 0.12, 0)), e], [0.035, 0.026, 0.016], { sides: 4, uSpan: 0.3, col: BR, sway: (_i, w) => swayAt(w) });
    pad(v3(e.x, e.y + 0.08, e.z), 1.28 * R.r(0.78, 0.98), a);
  }
  S.wood('pineBark', bark);
}
