/**
 * 阔叶的杂树：村口的大槐、村里村外的几种杂树、桑园里的桑、北坡上只作景的远树。
 * 长法是一样的——先定冠形（一个椭球），在冠面上取若干「梢点」；老树的干顶先分成几股粗枝，梢枝从粗枝上出来，
 * 先照自己的角度走，再朝梢点弯过去，所以冠是饱满的、枝是穿插的。
 * 叶不是匀匀地糊满：一团一团托在枝梢上（扁的，像一朵云），每团先染一笔淡的大点作底，再点叶，上明下暗；团与团之间透着纸与枝。
 * 各树不同处在点叶的笔：槐用胡椒点夹成对的小叶，高的杂树用介字点，圆冠的用胡椒点、混点，矮而横的用混点。
 */
import { TREE } from './tiles';
import { FGeo, UP, along, clamp01, lerp, limb, perp, smoothPath, tube, v3, type RGB, type Rand, type V3 } from './kit';
import type { LayerId, Sink } from './sink';

const TAU = Math.PI * 2;
const I = TREE.idx;
const JIE = [I.jie0, I.jie1, I.jie2, I.jie3], PEPPER = [I.pepper0, I.pepper1], HUN = [I.hun0, I.hun1, I.hun2], HUAI = [I.huai0, I.huai1, I.huai2];
const SANG = [I.sang0, I.sang1], FAR = [I.far0, I.far1, I.far2], WASH = [I.far0, I.far2], LUJIAO = [I.lujiao0, I.lujiao1], HANLIN = [I.hanlin0, I.hanlin1];
type Broad = 'broadA' | 'broadB' | 'broadC';
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface BroadSpec {
  /** 树高、分枝点高、根径 */ H: number; fork: number; r0: number;
  /** 冠：心有多高、横半径、竖半径 */ cy: number; rx: number; ry: number;
  /** 干斜多少（正切） */ lean: number;
  /** 干顶先分几股粗枝（0：枝直接从干上出）；梢枝数；每枝的小枝数 [少, 多]；小枝上再出细枝否；枝折的幅度 */
  prim: number; limbs: number; subs: [number, number]; fine: boolean; zig: number;
  /** 叶：哪一层、用哪些笔、一笔多大、笔最多转多少、枝梢一团叶几笔 */ layer: Broad; leaf: number[]; dab: [number, number]; rot: number; per: number;
  /** 冬天梢上的笔 */ twig: number[];
  bark: RGB;
  lite?: boolean;
}
/** 一株阔叶树（落在 Sink 当前的位置上）。tips 给了就把各枝梢的位置（世界坐标）记进去——挂果、开花用 */
export function broad(S: Sink, R: Rand, sp: BroadSpec, tips?: V3[]) {
  const bark = new FGeo(), BK = sp.bark, TW: RGB = [BK[0] * 0.86, BK[1] * 0.86, BK[2] * 0.87];
  const la = R.r(0, TAU), pa = R.r(0, TAU), pb = R.r(0, TAU), NT = sp.lite ? 5 : 7, wob = sp.r0 * 0.45;
  // —— 干 ——
  const ctrl: V3[] = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; ctrl.push(v3(Math.cos(la) * sp.lean * sp.fork * t * t + wob * Math.sin(t * 3.3 + pa) * t, -0.3 + (sp.fork + 0.3) * t, Math.sin(la) * sp.lean * sp.fork * t * t + wob * Math.sin(t * 2.7 + pb) * t)); }
  const tp = smoothPath(ctrl, NT), top = tp[NT];
  const cc = v3(top.x * 1.3, sp.cy, top.z * 1.3);
  const inside = (p: V3) => Math.hypot((p.x - cc.x) / sp.rx, (p.y - cc.y) / sp.ry, (p.z - cc.z) / sp.rx);
  const swayAt = (p: V3) => clamp01(0.04 * Math.pow(clamp01(p.y / sp.H), 2) + 0.3 * Math.pow(clamp01(Math.hypot(p.x - cc.x, p.z - cc.z) / sp.rx), 1.3) + 0.1 * clamp01((p.y - sp.fork) / (sp.H - sp.fork)));
  const rAt = (t: number) => sp.r0 * (1 - 0.3 * t);
  const knot = R.r(0, TAU);
  tube(bark, tp, tp.map((p, i) => rAt(i / NT) * (1 + 0.7 * Math.exp(-(p.y + 0.3) / (sp.r0 * 1.5)))), {
    sides: sp.lite ? 6 : 9, col: BK, vPerM: 0.8, uSpan: Math.max(0.8, sp.r0 * 5), sway: (_i, p) => swayAt(p),
    bulge: (i, a) => 1 + 0.2 * Math.exp(-(tp[i].y + 0.3) / (sp.r0 * 1.8)) * Math.sin(a * 5 + knot) + 0.06 * Math.sin(a * 3 + i * 1.1 + knot) + 0.04 * Math.sin(a * 7 - i * 0.7),
  });
  // —— 一团叶：先染一笔淡的大点作底（次序排在后面：春天叶稀时不画），再点叶——上明下暗 ——
  const clump = (c: V3, r: number, w: number) => {
    const sw = swayAt(c);
    if (w > 0.7) S.dab(sp.layer, c.x + R.pm(r * 0.15), c.y + r * 0.05, c.z + R.pm(r * 0.15), r * R.r(1.5, 1.9), R.pick(WASH), c.x - cc.x, r * 2.5, c.z - cc.z, R.r(0.98, 1.08), null, R.pm(0.4), sw, R.r(0.64, 1));
    const n = Math.max(2, Math.round(sp.per * w));
    for (let i = 0; i < n; i++) {
      const a = R.r(0, TAU), q = Math.pow(R(), 0.5) * r, u = R.r(-0.5, 1);
      const x = c.x + Math.cos(a) * q, z = c.z + Math.sin(a) * q, y = c.y + u * 0.5 * Math.sqrt(Math.max(0.04, r * r - q * q * 0.8));
      const up = clamp01(0.5 + u * 0.5), tone = lerp(0.7, 1.06, up) * R.r(0.92, 1.06);
      S.dab(sp.layer, x, y, z, R.r(sp.dab[0], sp.dab[1]) * (0.85 + 0.3 * up), R.pick(sp.leaf), (x - c.x) + (x - cc.x) * 0.3, (y - c.y) + r * 0.8, (z - c.z) + (z - cc.z) * 0.3, tone, [R.r(0.95, 1.04), 1, R.r(0.9, 1.03)], R.pm(sp.rot), sw, R.r(0, 0.98));
    }
  };
  const twig = (p: V3, size: number) => { if (R() < 0.8) S.dab('twig', p.x, p.y + size * 0.3, p.z, size, R.pick(sp.twig), 0, 1, 0, R.r(0.92, 1.06), TW, R.pm(0.5), swayAt(p)); };
  // —— 粗枝：干顶先分成几股（老树） ——
  const az0 = R.r(0, TAU), sz = (sp.rx + sp.ry) / 6;
  const prims: Array<{ pts: V3[]; az: number; r: (q: number) => number }> = [];
  for (let b = 0; b < sp.prim; b++) {
    const az = az0 + (b / sp.prim) * TAU + R.pm(0.35), e0 = R.r(0.6, 1.0), out = v3(Math.cos(az), 0, Math.sin(az));
    const L = (sp.cy - sp.fork) * R.r(0.7, 0.95) + sp.rx * 0.22;
    const pts = limb(R, along(tp, R.r(0.88, 1)), v3(out.x * Math.cos(e0), Math.sin(e0), out.z * Math.cos(e0)), L, 5, { zig: sp.zig * 1.2, jitter: 0.08, toward: v3(out.x * 0.45, 0.9, out.z * 0.45).normalize(), pull: 0.1 });
    const r0p = rAt(1) * R.r(0.62, 0.76), rr = (q: number) => lerp(r0p, r0p * 0.5, q);
    tube(bark, pts, pts.map((_, i) => rr(i / 5)), { sides: sp.lite ? 5 : 7, col: BK, vPerM: 0.8, uSpan: 0.9, sway: (_i, w) => swayAt(w) });
    prims.push({ pts, az, r: rr });
  }
  // —— 梢枝：朝冠面上的梢点长 ——
  for (let b = 0; b < sp.limbs; b++) {
    const f = (b + 0.5) / sp.limbs, yy = lerp(-0.5, 0.92, f), rr = Math.sqrt(1 - yy * yy), az = az0 + b * 2.399963 + R.pm(0.3), k = R.r(0.8, 1.05);
    const tip = v3(cc.x + sp.rx * rr * Math.cos(az) * k, cc.y + sp.ry * yy * k, cc.z + sp.rx * rr * Math.sin(az) * k);
    const out = v3(Math.cos(az), 0, Math.sin(az)), e0 = lerp(R.r(0.5, 0.8), 1.35, f);
    const d = v3(out.x * Math.cos(e0), Math.sin(e0), out.z * Math.cos(e0));
    let P0: V3, rb: number;
    if (prims.length) {
      // 从方位最近的那一股粗枝上出：低的梢点出得早，高的接着枝头长
      let pr = prims[0];
      for (const c of prims) if (Math.abs(wrap(az - c.az)) < Math.abs(wrap(az - pr.az))) pr = c;
      const q = clamp01(b < prims.length ? 1 : lerp(0.35, 0.95, f) + R.pm(0.08)), dir = v3();
      P0 = along(pr.pts, q, dir); rb = pr.r(q) * 0.82;
      d.lerp(dir, 0.5).normalize();
    } else { P0 = along(tp, lerp(0.72, 1, f)); rb = Math.min(rAt(1) * 0.62, 0.2) * lerp(1, 0.72, f); }
    const steps = 6, pts: V3[] = [P0.clone()];
    let p = P0.clone();
    for (let s = 1; s <= steps; s++) {
      const to = v3().subVectors(tip, p), dist = to.length(); to.normalize();
      d.lerp(to, lerp(0.1, 0.75, Math.pow(s / steps, 1.5))).normalize();
      d.applyAxisAngle(UP, (s % 2 ? 1 : -1) * R.r(0.3, 1) * sp.zig);
      d.x += R.pm(0.06); d.z += R.pm(0.06); d.normalize();
      p = p.clone().addScaledVector(d, (dist / (steps - s + 1)) * 1.04);
      pts.push(p);
    }
    const lr = (q: number) => lerp(rb, 0.03, Math.pow(q, 0.8));
    tube(bark, pts, pts.map((_, i) => lr(i / steps)), { sides: sp.lite ? 4 : 5, col: BK, vPerM: 0.8, uSpan: 0.6, sway: (_i, w) => swayAt(w) });
    clump(pts[steps], sz * 1.15, 1);
    tips?.push(S.world(pts[steps].x, pts[steps].y, pts[steps].z));
    twig(pts[steps], sz * 0.9);
    // 小枝
    const ns = sp.subs[0] + R.i(sp.subs[1] - sp.subs[0] + 1);
    for (let s = 0; s < ns; s++) {
      const q = lerp(0.3, 0.95, (s + R.r(0.25, 0.75)) / ns), dir = v3(), base = along(pts, q, dir);
      const dd = dir.clone().multiplyScalar(0.45).addScaledVector(perp(R, dir, 0.35), 0.9).addScaledVector(out, 0.3).normalize();
      let len = lerp(sp.rx * 0.6, sp.rx * 0.32, q) * R.r(0.75, 1.2);
      const over = inside(base.clone().addScaledVector(dd, len));
      if (over > 1.08) len *= Math.max(0.4, 1.08 / over);
      const sb = limb(R, base, dd, len, 3, { toward: v3(out.x * 0.5, 0.85, out.z * 0.5).normalize(), pull: 0.14, jitter: 0.1, zig: sp.zig });
      const rs = Math.max(0.02, lr(q) * 0.52);
      tube(bark, sb, [rs, rs * 0.7, rs * 0.45, 0.012], { sides: sp.lite ? 3 : 4, col: TW, vPerM: 0.8, uSpan: 0.3, sway: (_i, w) => swayAt(w) });
      clump(sb[3], sz, 1);
      tips?.push(S.world(sb[3].x, sb[3].y, sb[3].z), S.world(sb[2].x, sb[2].y, sb[2].z));
      twig(sb[3], sz * 0.8);
      if (!sp.fine) continue;
      for (let t = 0; t < 2; t++) {
        const d2 = v3(), b2 = along(sb, R.r(0.3, 0.9), d2);
        const td = d2.multiplyScalar(0.5).addScaledVector(perp(R, d2, 0.4), 0.85).normalize(), l3 = len * R.r(0.35, 0.6);
        const e = b2.clone().addScaledVector(td, l3), m = b2.clone().lerp(e, 0.5).add(v3(R.pm(0.08), 0.06, R.pm(0.08)));
        tube(bark, [b2, m, e], [rs * 0.5, rs * 0.36, 0.01], { sides: 3, col: TW, vPerM: 0.8, uSpan: 0.2, sway: (_i, w) => swayAt(w) });
        clump(e, sz * 0.8, 0.6);
        twig(e, sz * 0.7);
      }
    }
  }
  S.wood('bark', bark);
}

/** 村口的大槐：干粗而矮，干顶分三股粗枝，四面撑开，冠广而平；叶是胡椒点夹成对的小叶，一层层叠上去 */
export const huaiSpec = (_R: Rand, lite: boolean): BroadSpec => ({
  H: 9.4, fork: 2.1, r0: 0.37, cy: 6.0, rx: 5.8, ry: 2.9, lean: 0.07, prim: 4, limbs: 12, subs: [2, 3], fine: !lite, zig: 0.34,
  layer: 'broadA', leaf: [...PEPPER, ...PEPPER, ...PEPPER, ...HUAI, I.hun0], dab: [0.8, 1.25], rot: 0.6, per: lite ? 8 : 11, twig: [I.xiezhao, I.xiezhao, ...LUJIAO], bark: [0.6, 0.57, 0.53], lite,
});
/** 村里村外的杂树三种：高的（椿、杨一类）、圆冠的（榆、朴）、矮而横的（柿、枣）。色分三层，秋天各黄各的 */
export function woodSpec(R: Rand, lite: boolean): BroadSpec {
  const form = R.i(3), layer = (['broadA', 'broadB', 'broadC'] as Broad[])[R.i(3)], bark: RGB = [R.r(0.58, 0.66), R.r(0.56, 0.62), R.r(0.53, 0.58)];
  const per = lite ? 7 : 10;
  if (form === 0) { const H = R.r(9, 10.6); return { H, fork: R.r(3, 3.8), r0: 0.22, cy: H - 3.1, rx: R.r(2.2, 2.7), ry: 3.1, lean: 0.05, prim: 0, limbs: 5, subs: [2, 3], fine: false, zig: 0.2, layer, leaf: JIE, dab: [0.7, 1.1], rot: 0.35, per, twig: LUJIAO, bark, lite }; }
  if (form === 1) { const H = R.r(7.4, 8.6); return { H, fork: R.r(2, 2.5), r0: 0.24, cy: H - 2.9, rx: R.r(3, 3.4), ry: 2.7, lean: 0.1, prim: 3, limbs: 6, subs: [1, 3], fine: false, zig: 0.28, layer, leaf: [...PEPPER, ...PEPPER, ...HUN], dab: [0.74, 1.14], rot: 3.14, per, twig: LUJIAO, bark, lite }; }
  return { H: R.r(5.8, 6.6), fork: R.r(1.4, 1.8), r0: 0.23, cy: 4.2, rx: R.r(3.4, 3.9), ry: 2.0, lean: 0.22, prim: 3, limbs: 6, subs: [1, 3], fine: false, zig: 0.42, layer, leaf: HUN, dab: [0.7, 1.08], rot: 0.4, per, twig: [I.xiezhao, ...LUJIAO], bark, lite };
}

/**
 * 人家门前屋后的果树（各家一株，位置由 extras.ts 定）：
 *   枣 —— 干黑而糙，枝一节一折，叶细碎而疏；柿 —— 冠圆，叶阔，秋后叶落尽、一树橙果；石榴 —— 丛生的小树，叶细，夏天几朵红花。
 */
export const fruitSpec = (kind: 'jujube' | 'persimmon' | 'pomegranate', R: Rand, lite: boolean): BroadSpec => {
  const per = lite ? 6 : 8;
  if (kind === 'jujube') return { H: 6.6, fork: R.r(1.9, 2.3), r0: 0.16, cy: 4.5, rx: 2.3, ry: 2.2, lean: 0.14, prim: 0, limbs: 6, subs: [1, 3], fine: false, zig: 0.55, layer: 'broadB', leaf: [...PEPPER, ...JIE], dab: [0.5, 0.78], rot: 0.5, per: per - 2, twig: [I.xiezhao, ...LUJIAO], bark: [0.5, 0.48, 0.47], lite };
  if (kind === 'persimmon') return { H: 6.4, fork: R.r(1.6, 1.9), r0: 0.2, cy: 4.3, rx: 3.0, ry: 2.2, lean: 0.1, prim: 3, limbs: 6, subs: [1, 3], fine: false, zig: 0.36, layer: 'broadB', leaf: HUN, dab: [0.66, 1.0], rot: 0.4, per, twig: [I.xiezhao, ...LUJIAO], bark: [0.52, 0.5, 0.49], lite };
  return { H: 3.4, fork: R.r(0.45, 0.7), r0: 0.09, cy: 2.2, rx: 1.6, ry: 1.3, lean: 0.2, prim: 3, limbs: 6, subs: [1, 2], fine: false, zig: 0.4, layer: 'broadC', leaf: JIE, dab: [0.36, 0.56], rot: 0.5, per: per - 2, twig: LUJIAO, bark: [0.62, 0.58, 0.54], lite };
};

/** 桑：矮干，顶上一个攥紧的「拳」（年年采叶、剪条），从拳上直直地抽出七八根条，条上是大叶 */
export function mulberry(S: Sink, R: Rand, o: { lite?: boolean } = {}) {
  const bark = new FGeo(), BK: RGB = [R.r(0.64, 0.7), R.r(0.61, 0.66), R.r(0.56, 0.61)], TW: RGB = [0.6, 0.59, 0.52];
  const h = R.r(0.9, 1.35), r0 = 0.085, la = R.r(0, TAU);
  const tp = limb(R, v3(0, -0.15, 0), v3(Math.cos(la) * 0.12, 1, Math.sin(la) * 0.12).normalize(), h + 0.15, 3, { jitter: 0.08, zig: 0.2 });
  // 拳：干顶粗出一截
  tube(bark, tp, [r0 * 1.5, r0, r0 * 0.95, r0 * 1.45], { sides: o.lite ? 5 : 7, col: BK, vPerM: 1.2, uSpan: 0.5, cap: true, bulge: (i, a) => 1 + (i === 3 ? 0.2 : 0.08) * Math.sin(a * 4 + i * 2) });
  const top = tp[3], cc = v3(top.x, h + 1, top.z);
  const swayAt = (p: V3) => clamp01(0.5 * clamp01((p.y - h) / 2));
  const n = 6 + R.i(4);
  for (let b = 0; b < n; b++) {
    const az = (b / n) * TAU + R.pm(0.4), e0 = R.r(0.7, 1.35), L = R.r(1.2, 2.0), out = v3(Math.cos(az), 0, Math.sin(az));
    const d = v3(out.x * Math.cos(e0), Math.sin(e0), out.z * Math.cos(e0));
    const sp = [top.clone().addScaledVector(out, r0 * 0.6), top.clone().addScaledVector(d, L * 0.5).add(v3(R.pm(0.06), 0.05, R.pm(0.06))), top.clone().addScaledVector(d, L)];
    tube(bark, sp, [0.022, 0.015, 0.006], { sides: 3, col: TW, vPerM: 1, uSpan: 0.12, sway: (_i, p) => swayAt(p) });
    const nl = Math.round(L / 0.2);
    for (let i = 0; i < nl; i++) {
      const p = along(sp, (i + R.r(0.4, 1)) / nl), x = p.x + R.pm(0.16), y = p.y + R.pm(0.1) - 0.08, z = p.z + R.pm(0.16);
      S.dab('broadC', x, y, z, R.r(0.5, 0.78), R.pick(SANG), x - cc.x, y - cc.y + 1.4, z - cc.z, R.r(0.76, 1.08), [R.r(0.95, 1.04), 1, R.r(0.9, 1.02)], R.pm(0.7), swayAt(p));
    }
  }
  S.wood('bark', bark);
}

/**
 * 北坡上只作景的远树：一根干、两三笔枝，叶是几团大点（浓淡相破），冬天换成一两笔寒林的枯枝。
 * near：靠近人走得到的地方的那几排，多几笔。
 */
export function backdrop(S: Sink, R: Rand, o: { near: boolean }) {
  const bark = new FGeo(), g = R.r(0.66, 0.76), BK: RGB = [g, g * 0.985, g * 0.97];
  const layer = (['broadA', 'broadB', 'broadC'] as LayerId[])[R.i(3)];
  const H = R.r(7.5, 10.5), la = R.r(0, TAU), lean = R.r(0.03, 0.16) * H, r0 = R.r(0.19, 0.26);
  const tp = [0, 0.25, 0.48, 0.7].map((t) => v3(Math.cos(la) * lean * t * t + R.pm(0.1) * t, -0.4 + (H + 0.4) * t, Math.sin(la) * lean * t * t + R.pm(0.1) * t));
  tube(bark, tp, [r0 * 1.3, r0 * 0.9, r0 * 0.66, r0 * 0.4], { sides: o.near ? 5 : 4, col: BK, vPerM: 0.6, uSpan: 0.8 });
  const top = tp[3], cc = v3(top.x, H * 0.66, top.z), rx = H * R.r(0.3, 0.38), ry = H * R.r(0.28, 0.34);
  const nL = o.near ? 3 : 2, a0 = R.r(0, TAU);
  for (let b = 0; b < nL; b++) {
    const a = a0 + (b / nL) * TAU + R.pm(0.4), e = R.r(0.5, 1.0), l = rx * R.r(0.8, 1.1), from = tp[2].clone().lerp(top, R());
    const end = from.clone().add(v3(Math.cos(a) * Math.cos(e) * l, Math.sin(e) * l, Math.sin(a) * Math.cos(e) * l));
    tube(bark, [from, from.clone().lerp(end, 0.5).add(v3(R.pm(0.2), 0.15, R.pm(0.2))), end], [r0 * 0.36, r0 * 0.24, 0.03], { sides: 3, col: BK, vPerM: 0.6, uSpan: 0.3 });
  }
  S.wood('bark', bark);
  // 叶：先几团大点铺出冠形，再压几笔小的
  const put = (n: number, s0: number, s1: number, tiles: number[], spread: number, rot: number) => {
    for (let i = 0; i < n; i++) {
      const a = R.r(0, TAU), u = R.r(-0.6, 1), q = Math.pow(R(), 0.5) * spread, h = Math.sqrt(Math.max(0, 1 - u * u));
      const x = cc.x + Math.cos(a) * h * q * rx, y = cc.y + u * q * ry, z = cc.z + Math.sin(a) * h * q * rx;
      S.dab(layer, x, y, z, R.r(s0, s1), R.pick(tiles), x - cc.x, y - cc.y + ry * 0.7, z - cc.z, lerp(0.8, 1.1, clamp01(0.5 + u * 0.5)) * R.r(0.9, 1.08), [R.r(0.95, 1.04), 1, R.r(0.92, 1.03)], R.pm(rot), 0.25 + 0.2 * clamp01(u));
    }
  };
  if (o.near) put(6, H * 0.2, H * 0.28, FAR, 0.8, 0.4); else put(7, H * 0.28, H * 0.4, FAR, 0.85, 0.4);
  put(o.near ? 24 : 6, H * (o.near ? 0.1 : 0.13), H * (o.near ? 0.16 : 0.2), R() < 0.5 ? [...JIE, ...PEPPER] : [...HUN, ...PEPPER], 1.05, 0.5);
  // 冬：寒林的枯枝
  const nT = o.near ? 3 : 2;
  for (let i = 0; i < nT; i++) S.dab('twig', cc.x + R.pm(rx * 0.4), cc.y + R.pm(ry * 0.25) - ry * 0.1, cc.z + R.pm(rx * 0.4), H * R.r(0.5, 0.64), R.pick(HANLIN), 0, 1, 0, R.r(1.0, 1.15), [BK[0] * 1.08, BK[1] * 1.08, BK[2] * 1.1], R.pm(0.2), 0.3);
}
