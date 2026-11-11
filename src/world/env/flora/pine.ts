/**
 * 松。画谱里说松「盘、曲、横出」，针叶「成片成层」：
 *   干 —— 不是直的：一段一段长，每段换一点方向，往一边斜出去，再左右摆两三道弯；根脚张开；老树带几根枯桩；
 *   枝 —— 从干的上半出来，先平伸、再下探，一路带折（不是顺滑的弧）；每枝再分几小枝；
 *   针 —— 聚在枝梢，成一片片扁平的「云片」：底平、顶微隆。每片由几十小枝组成，
 *         一小枝 = 两张交叉的立卡（侧看：分叉的小枝上六七个瓶刷似的新梢）+ 一张平卡（俯看的一团新梢）。
 * 所以远看是几层墨绿的云，近看有针，从树下往上看得见枝骨。
 */
import { FGeo, UP, along, card, clamp01, lerp, rand, smoothPath, sstep, tube, v3, type RGB, type Rand, type Tile, type V3 } from './util';

export interface PineStyle {
  /** 干长（沿干量）、根部半径 */
  H: number; r0: number;
  /** 斜：越往上越往一边倒（约等于梢头倾角的正切）；顶上放平的程度 */
  lean: number; flatTop: number;
  /** 盘曲：左右摆的角度（弧度）与摆几道 */
  twist: number; bends: number;
  /** 大枝数、第一枝在干的几成高、最长的枝（米） */
  branches: number; first: number; reach: number;
  /** 枝偏向倾斜一侧的程度 0…1；下层枝下探的角度（弧度）；枝上折的幅度 */
  bias: number; droop: number; zig: number;
  /** 冠顶平不平：0 尖（上层枝短）… 1 平（上层枝也长） */
  flat: number;
  /** 每枝的小枝数 [最少, 最多] */
  subs: [number, number];
  /** 云片半径的基数、隆起的高（相对半径） */
  pad: number; dome: number;
  /** 一小枝针的卡片大小（米）、每平方米云片几小枝 */
  tuft: number; tufts: number;
  /** 云片下露出的细枝数；干上的枯桩数 */
  twigs: number; snags: number;
  /** 干的边数与环数、枝的边数与段数、小枝的边数 */
  sides: number; rings: number; bsides: number; bseg: number; ssides: number;
}
export interface TreeGeo { bark: FGeo; leaf: FGeo; height: number; radius: number; center: V3 }
export interface PineTiles { sprig: Tile; cluster: Tile; padSide: Tile; padTop: Tile }

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const COMMON = { twigs: 0, snags: 0, sides: 8, rings: 14, bsides: 5, bseg: 6, ssides: 3, dome: 0.2, tuft: 0.8, tufts: 3.6, zig: 1.1 };

/** 山上的松：四种形态 */
export const PINE_STYLES: PineStyle[] = [
  // 高松：干较直，层层云片
  { ...COMMON, H: 11.5, r0: 0.3, lean: 0.07, flatTop: 0.1, twist: 0.16, bends: 2.4, branches: 10, first: 0.38, reach: 3.9, bias: 0.15, droop: 0.42, flat: 0.6, subs: [1, 2], pad: 1.3 },
  // 斜松：往一侧探出去
  { ...COMMON, H: 9.2, r0: 0.27, lean: 0.3, flatTop: 0.3, twist: 0.3, bends: 2.2, branches: 8, first: 0.4, reach: 3.8, bias: 0.6, droop: 0.36, flat: 0.85, subs: [1, 2], pad: 1.3 },
  // 平顶松：伞一样
  { ...COMMON, H: 9.6, r0: 0.28, lean: 0.12, flatTop: 0.2, twist: 0.24, bends: 2.8, branches: 8, first: 0.56, reach: 4.4, bias: 0.25, droop: 0.22, flat: 1, subs: [1, 2], pad: 1.4, dome: 0.17 },
  // 小松
  { ...COMMON, H: 5.8, r0: 0.16, lean: 0.16, flatTop: 0.2, twist: 0.26, bends: 2.3, branches: 6, first: 0.36, reach: 2.4, bias: 0.3, droop: 0.34, flat: 0.6, subs: [1, 1], pad: 1.0, sides: 7, rings: 10, bsides: 4, bseg: 5, tuft: 0.7, tufts: 4.2 },
];
/** 古松：崖边探出去的那种。seed 换一个就是另一棵 */
export function heroStyle(R: Rand): PineStyle {
  return {
    H: R.r(8.8, 10), r0: R.r(0.33, 0.38), lean: R.r(0.45, 0.62), flatTop: R.r(0.5, 0.75), twist: R.r(0.58, 0.78), bends: R.r(2.5, 3.2),
    branches: 9, first: 0.42, reach: R.r(4.8, 5.6), bias: 0.6, droop: 0.5, zig: 1.4, flat: 0.92,
    subs: [1, 3], pad: 1.28, dome: 0.15, tuft: 0.56, tufts: 9, twigs: 5, snags: 3, sides: 12, rings: 30, bsides: 7, bseg: 10, ssides: 4,
  };
}

export function buildPine(seed: number, st: PineStyle, T: PineTiles, density = 1): TreeGeo {
  const R = rand(seed);
  const bark = new FGeo(), leaf = new FGeo();

  // —— 干：一段一段长，每段换一点方向 ——
  const la = R.r(0, Math.PI * 2), A = v3(Math.cos(la), 0, Math.sin(la)), B = v3(-A.z, 0, A.x);
  const p1 = R.r(0, 6.28), p2 = R.r(0, 6.28);
  const ctrl: V3[] = [v3(0, 0, 0)];
  {
    const segs = 9; let p = v3(0, 0, 0); const dir = v3(0, 1, 0);
    for (let k = 1; k <= segs; k++) {
      const t = k / segs, sw = st.twist * Math.sin(t * Math.PI * st.bends + p1), sw2 = st.twist * 0.45 * Math.sin(t * Math.PI * st.bends * 1.7 + p2);
      const ln = st.lean * (0.25 + 1.5 * t * t);
      const tgt = v3(A.x * (ln + sw2) + B.x * sw, 1 - st.flatTop * t * t, A.z * (ln + sw2) + B.z * sw).normalize();
      dir.lerp(tgt, k === 1 ? 0.35 : 0.75).normalize();
      p = p.clone().addScaledVector(dir, st.H / segs);
      ctrl.push(p);
    }
  }
  const tp = smoothPath(ctrl, st.rings);
  const top = tp[tp.length - 1], Ht = top.y;
  const rAt = (t: number) => st.r0 * (Math.pow(1 - t, 0.85) * 0.9 + 0.1);
  const tr = tp.map((p, i) => rAt(i / st.rings) * (1 + 0.6 * Math.exp(-p.y / (st.r0 * 1.9))));
  const axisAt = (y: number) => {
    for (let i = 1; i < tp.length; i++) if (tp[i].y >= y) { const k = clamp01((y - tp[i - 1].y) / Math.max(1e-4, tp[i].y - tp[i - 1].y)); return tp[i - 1].clone().lerp(tp[i], k); }
    return top;
  };
  const swayAt = (p: V3) => {
    const a = axisAt(p.y), d = Math.hypot(p.x - a.x, p.z - a.z);
    return clamp01(0.1 * Math.pow(clamp01(p.y / Ht), 2) + 0.78 * Math.pow(clamp01(d / (st.reach * 1.05)), 1.4));
  };
  const knot = R.r(0, 6.28);
  tube(bark, tp, tr, {
    sides: st.sides, uSpan: Math.max(1, Math.round((Math.PI * 2 * st.r0) / 1.2)) * 1.2, vPerM: 1,
    sway: (_i, p) => swayAt(p),
    col: (i) => 0.7 + 0.3 * sstep(0, 0.3, i / st.rings),
    bulge: (i, ang) => 1 + 0.22 * Math.exp(-tp[i].y / (st.r0 * 1.6)) * Math.sin(ang * 5 + knot) + 0.06 * Math.sin(ang * 3 + i * 0.9 + knot) + 0.04 * Math.sin(ang * 2 - i * 0.5),
  });
  // 枯桩：早年断掉的枝，光秃秃的一截
  for (let k = 0; k < st.snags; k++) {
    const t = R.r(0.16, 0.44), P0 = along(tp, t), a = R.r(0, 6.28), l = R.r(0.45, 1.1), r = rAt(t) * 0.3;
    const d = v3(Math.cos(a), R.r(-0.35, 0.2), Math.sin(a)).normalize();
    const e = P0.clone().addScaledVector(d, l), m = P0.clone().addScaledVector(d, l * 0.5).add(v3(0, R.r(0.02, 0.1), 0));
    tube(bark, [P0, m, e], [r, r * 0.55, 0.012], { sides: 5, uSpan: 1.2, col: [1.25, 1.22, 1.18], cap: true });
  }

  // —— 云片 ——
  const tint = (): RGB => { const k = R.r(0.84, 1.06); return [k * R.r(0.92, 1.06), k, k * R.r(0.86, 1.0)]; };
  const pad = (c: V3, rad: number, az: number, anchor: V3 | null) => {
    const rx = rad, rz = rad * R.r(0.72, 0.95), ry = rad * st.dome;
    const ca = Math.cos(az), sa = Math.sin(az);
    const n = Math.max(4, Math.round(st.tufts * rx * rz * Math.PI * density));
    const nc = v3(c.x, c.y - rad * 0.8, c.z);
    const sw = swayAt(c), lv = lerp(0.74, 1, clamp01((c.y / Ht - st.first) / (1 - st.first)));
    const spots: V3[] = [];
    for (let i = 0; i < n; i++) {
      const a = R.r(0, 6.2832), q = Math.sqrt(R());
      const lx = Math.cos(a) * q * rx, lz = Math.sin(a) * q * rz;
      const x = c.x + lx * ca - lz * sa, z = c.z + lx * sa + lz * ca;
      const y = c.y + ry * (1 - q * q) + R.pm(0.04) - 0.06 * q * rad;
      const size = st.tuft * R.r(0.82, 1.18) * (1 - 0.18 * q);
      const tn = tint(), k = lv * (1 - 0.12 * q);
      const cb: RGB = [tn[0] * 0.3 * k, tn[1] * 0.32 * k, tn[2] * 0.3 * k], ct: RGB = [tn[0] * 1.14 * k, tn[1] * 1.14 * k, tn[2] * 1.1 * k], cs: RGB = [tn[0] * 0.96 * k, tn[1] * 0.98 * k, tn[2] * 0.94 * k];
      const up = v3(((x - c.x) / rad) * 0.55 + R.pm(0.14), 1, ((z - c.z) / rad) * 0.55 + R.pm(0.14)).normalize();
      const base = v3(x, y - size * 0.3, z);
      const ra = R.r(0, Math.PI);
      for (let f = 0; f < 2; f++) {
        const aa = ra + f * Math.PI * 0.5 + R.pm(0.2);
        const right = v3(Math.cos(aa), 0, Math.sin(aa));
        right.addScaledVector(up, -right.dot(up)).normalize();
        card(leaf, base, right, up, size, size, T.sprig, nc, 0.6, cb, ct, sw, Math.min(1, sw + 0.06));
      }
      const r1 = v3(Math.cos(ra), R.pm(0.12), Math.sin(ra)).normalize(), u1 = v3(-Math.sin(ra), R.pm(0.12), Math.cos(ra)).normalize();
      card(leaf, v3(x, y + size * 0.2, z), r1, u1, size * 1.05, size * 1.05, T.cluster, nc, 0.85, cs, cs, sw, sw, 0.5);
      if (spots.length < st.twigs) spots.push(base);
    }
    if (anchor) for (const s of spots) {
      const mid = anchor.clone().lerp(s, 0.55); mid.y -= 0.05;
      tube(bark, [anchor, mid, s], [0.02, 0.014, 0.008], { sides: 3, uSpan: 1.2, sway: () => sw, col: 0.8 });
    }
  };

  // —— 枝 ——
  const biasAz = Math.atan2(A.z, A.x);
  let az = R.r(0, 6.28), maxR = 1;
  for (let b = 0; b < st.branches; b++) {
    const f = st.branches > 1 ? b / (st.branches - 1) : 0.5;
    const t = Math.min(0.965, Math.max(st.first, lerp(st.first, 0.95, f) + R.pm(0.025)));
    az += 2.399963 + R.pm(0.5);
    const a2 = az + wrap(biasAz - az) * st.bias * R.r(0.45, 1);
    // 最下一枝往往最长：伸出去的那只「迎客」的手
    const arm = b === 0 && st.snags > 0 ? 1.22 : 1;
    const len = st.reach * arm * lerp(1, lerp(0.42, 0.9, st.flat), sstep(0.55, 1, f)) * lerp(0.76, 1, sstep(0, 0.35, f)) * R.r(0.82, 1.08);
    const e0 = R.r(0.14, 0.44), e1 = lerp(-st.droop, 0.1, f) + R.pm(0.08);
    const P0 = along(tp, t), rT = rAt(t);
    const bc: V3[] = [P0];
    let a = arm > 1 ? biasAz + R.pm(0.5) : a2, p = P0;
    const ns = 6;
    for (let k = 1; k <= ns; k++) {
      const q = k / ns, e = lerp(e0, e1, q * q * (3 - 2 * q)), step = len / ns;
      a += (k % 2 ? 1 : -1) * R.r(0.08, 0.32) * st.zig;
      p = p.clone().add(v3(Math.cos(a) * Math.cos(e) * step, Math.sin(e) * step, Math.sin(a) * Math.cos(e) * step));
      bc.push(p);
    }
    const bp = smoothPath(bc, st.bseg, 0.25);
    const r0b = Math.min(rT * 0.6, 0.032 + len * 0.022);
    const br = bp.map((_, i) => lerp(r0b, 0.024, Math.pow(i / st.bseg, 0.8)));
    tube(bark, bp, br, { sides: st.bsides, uSpan: 1.2, sway: (_i, q) => swayAt(q), col: 0.9 });
    const tip = bp[bp.length - 1];
    maxR = Math.max(maxR, Math.hypot(tip.x, tip.z) + st.pad);
    const nsub = st.subs[0] + R.i(st.subs[1] - st.subs[0] + 1);
    for (let s = 0; s < nsub; s++) {
      const q = lerp(0.34, 0.86, (s + R.r(0.2, 0.8)) / nsub);
      const dir = v3(), base = along(bp, q, dir);
      const d = dir.clone().applyAxisAngle(UP, (s % 2 ? 1 : -1) * R.r(0.6, 1.15)); d.y = R.r(0.04, 0.3); d.normalize();
      const l2 = Math.max(0.55, len * (1 - q) * R.r(0.55, 0.95) + 0.45);
      const e = base.clone().addScaledVector(d, l2); e.y += R.r(-0.05, 0.14) * l2;
      const sp = [base, base.clone().addScaledVector(d, l2 * 0.5).add(v3(0, 0.06 * l2, 0)), e];
      const rs = lerp(r0b, 0.024, Math.pow(q, 0.8)) * 0.62;
      tube(bark, sp, [rs, rs * 0.7, 0.016], { sides: st.ssides, uSpan: 1.2, sway: (_i, w) => swayAt(w), col: 0.86 });
      pad(v3(e.x, e.y + 0.1, e.z), st.pad * R.r(0.64, 0.92) * (0.76 + 0.3 * (len / st.reach)), Math.atan2(d.z, d.x), e);
    }
    const td = v3().subVectors(tip, bp[bp.length - 2]);
    pad(v3(tip.x, tip.y + 0.1, tip.z), st.pad * R.r(0.86, 1.15) * (0.8 + 0.3 * (len / st.reach)), Math.atan2(td.z, td.x), tip);
  }
  // —— 冠顶：干梢上一大片，旁边再带两片 ——
  pad(v3(top.x, top.y + 0.12, top.z), st.pad * 1.2, R.r(0, 3.14), top);
  for (let k = 0; k < 2; k++) {
    const a = R.r(0, 6.28), d = st.pad * R.r(0.6, 0.9);
    const e = v3(top.x + Math.cos(a) * d, top.y - R.r(0.2, 0.5), top.z + Math.sin(a) * d);
    const from = along(tp, 0.93);
    tube(bark, [from, from.clone().lerp(e, 0.5).add(v3(0, 0.12, 0)), e], [0.035, 0.026, 0.016], { sides: st.ssides, uSpan: 1.2, sway: (_i, w) => swayAt(w), col: 0.86 });
    pad(v3(e.x, e.y + 0.1, e.z), st.pad * R.r(0.78, 0.98), a, e);
  }
  return { bark, leaf, height: Ht + 0.7, radius: maxR, center: v3(top.x * 0.65, Ht * 0.74, top.z * 0.65) };
}

/** 远松：干一根、云片七八张大卡，只求轮廓与层次（约 70 三角） */
export function buildFarPine(seed: number, T: PineTiles): TreeGeo {
  const R = rand(seed);
  const bark = new FGeo(), leaf = new FGeo();
  const H = R.r(9, 11.5), la = R.r(0, 6.28), lean = R.r(0.04, 0.2) * H;
  const tp = [0, 0.35, 0.7, 1].map((t) => v3(Math.cos(la) * lean * t * t + R.pm(0.12) * t, H * t, Math.sin(la) * lean * t * t + R.pm(0.12) * t));
  tube(bark, tp, [0.28, 0.21, 0.13, 0.05], { sides: 4, uSpan: 1.2, col: 0.75 });
  const n = 7;
  let az = R.r(0, 6.28);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), t = lerp(0.42, 1, f);
    const c = along(tp, t);
    az += 2.4 + R.pm(0.4);
    const off = i === n - 1 ? 0 : R.r(0.6, 1.9) * (1 - 0.35 * f), rad = lerp(2.0, 1.35, f) * R.r(0.85, 1.12);
    c.x += Math.cos(az) * off; c.z += Math.sin(az) * off; c.y -= off * 0.12;
    const k = R.r(0.86, 1.04) * lerp(0.76, 1, f), tn: RGB = [k * 0.96, k, k * 0.93], dk: RGB = [tn[0] * 0.4, tn[1] * 0.42, tn[2] * 0.4];
    const nc = v3(c.x, c.y - rad, c.z), ra = R.r(0, Math.PI), sw = 0.3 + 0.4 * f;
    card(leaf, c, v3(Math.cos(ra), 0, Math.sin(ra)), v3(-Math.sin(ra), 0, Math.cos(ra)), rad * 2.3, rad * 2.3, T.padTop, nc, 0.9, tn, tn, sw, sw, 0.5);
    for (let q = 0; q < 2; q++) {
      const aa = ra + q * Math.PI * 0.5 + 0.3;
      card(leaf, v3(c.x, c.y - rad * 0.3, c.z), v3(Math.cos(aa), 0, Math.sin(aa)), UP, rad * 2.3, rad * 1.0, T.padSide, nc, 0.6, dk, tn, sw, sw + 0.1);
    }
  }
  return { bark, leaf, height: H, radius: 3.4, center: v3(0, H * 0.7, 0) };
}
