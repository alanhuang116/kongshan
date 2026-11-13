/**
 * 老梅。铁干虬枝：干粗而短，硬折着往一边探（不抹顺）；一根横枝先平出去、略往下压、梢头再翘起来（「疏影横斜」），
 * 一根往上；老枝上是直角出的短刺（女字交叉），向上抽几根笔直的新条。花不多，贴着新条与短刺开——疏，才是梅。
 * 冬天开花（红梅：雪里才看得见），开春还剩几朵，之后是叶。「前」是 +x：横枝朝那边探。
 */
import { BLOOM, TREE } from './tiles';
import { FGeo, UP, along, clamp01, lerp, limb, tube, v3, type RGB, type Rand, type V3 } from './kit';
import type { Sink } from './sink';

const TAU = Math.PI * 2;
const MEI = [BLOOM.idx.mei0, BLOOM.idx.mei1, BLOOM.idx.mei2], BUDS = [BLOOM.idx.meiBuds, BLOOM.idx.meiBuds2];
const LEAF = [TREE.idx.taoLeaf0, TREE.idx.taoLeaf1];

export function plum(S: Sink, R: Rand, o: { lite?: boolean } = {}) {
  const bark = new FGeo();
  const BK: RGB = [0.5, 0.49, 0.5], TW: RGB = [0.44, 0.43, 0.45], NEW: RGB = [0.56, 0.6, 0.5];
  const r0 = 0.2;
  // —— 干：三折 ——
  const tp = [v3(0, -0.2, 0), v3(-0.16 + R.pm(0.05), 0.5, R.pm(0.12)), v3(0.22 + R.pm(0.06), 0.95, R.pm(0.14)), v3(0.42, 1.5 + R.pm(0.08), R.pm(0.12)), v3(0.3 + R.pm(0.06), 1.95, R.pm(0.1))];
  const top = tp[3];
  const swayAt = (p: V3) => clamp01(0.3 * Math.pow(clamp01(Math.hypot(p.x - top.x, p.z - top.z) / 2.6), 1.3) + 0.2 * clamp01((p.y - 1.4) / 2.4));
  const knot = R.r(0, TAU);
  tube(bark, tp, [r0 * 1.55, r0 * 1.02, r0 * 0.9, r0 * 0.7, r0 * 0.42], {
    sides: o.lite ? 6 : 8, col: BK, vPerM: 1.2, uSpan: 1.1, cap: true,
    bulge: (i, a) => 1 + 0.2 * Math.sin(a * 3 + i * 1.7 + knot) + 0.12 * Math.sin(a * 5 - i * 1.1) + 0.06 * Math.sin(a * 2 + i),
  });
  const spots: Array<{ p: V3; k: number }> = [], tips: V3[] = [];
  const mark = (pts: V3[], from: number, gap: number, k0: number, k1: number) => {
    let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    const n = Math.max(1, Math.round(((1 - from) * L) / gap));
    for (let i = 0; i < n; i++) { const q = from + (1 - from) * ((i + R.r(0.2, 0.8)) / n); spots.push({ p: along(pts, q), k: lerp(k0, k1, q) }); }
  };
  // 新条：笔直地往上抽
  const shoot = (base: V3, len: number) => {
    const d = v3(R.pm(0.22), 1, R.pm(0.22)).normalize(), b = v3(R.pm(0.08), 0, R.pm(0.08));
    const sp = [base, base.clone().addScaledVector(d, len * 0.5).add(b), base.clone().addScaledVector(d, len)];
    tube(bark, sp, [0.013, 0.009, 0.004], { sides: 3, col: NEW, vPerM: 1, uSpan: 0.1, sway: (_i, p) => swayAt(p) });
    mark(sp, 0.1, 0.1, 0.6, 1);
    tips.push(sp[2]);
  };
  // 短刺：与老枝近乎直角
  const spur = (base: V3, dir: V3, len: number) => {
    const d = v3(-dir.z, 0, dir.x).multiplyScalar(R() < 0.5 ? 1 : -1).add(v3(R.pm(0.3), R.r(-0.5, 0.9), R.pm(0.3))).normalize();
    const e = base.clone().addScaledVector(d, len), m = base.clone().lerp(e, 0.55).add(v3(R.pm(0.05), R.pm(0.06), R.pm(0.05)));
    tube(bark, [base, m, e], [0.016, 0.011, 0.005], { sides: 3, col: TW, vPerM: 1, uSpan: 0.12, sway: (_i, p) => swayAt(p) });
    mark([base, m, e], 0.2, 0.1, 0.7, 1);
    tips.push(e);
  };
  // —— 老枝：硬折。头一根是横斜的那一枝 ——
  const olds: Array<{ from: V3; dir: V3; len: number; to: V3; zig: number; r: number }> = [
    { from: tp[3], dir: v3(1, 0.05, R.pm(0.25)), len: R.r(2.5, 3.0), to: v3(0.8, 0.5, 0), zig: 0.8, r: r0 * 0.56 },
    { from: tp[3], dir: v3(0.8, 0.55, R.r(0.5, 0.9)), len: R.r(1.5, 2.0), to: v3(0.5, 0.8, 0.4), zig: 0.7, r: r0 * 0.34 },
    { from: tp[4], dir: v3(-0.5, 1, R.r(0.3, 0.7)), len: R.r(1.7, 2.2), to: v3(-0.3, 0.9, 0.3), zig: 0.5, r: r0 * 0.4 },
    { from: tp[2], dir: v3(-0.7, 0.6, R.r(-0.9, -0.4)), len: R.r(1.3, 1.8), to: v3(-0.5, 0.8, -0.4), zig: 0.6, r: r0 * 0.36 },
    { from: tp[4], dir: v3(0.5, 0.9, R.r(-0.6, -0.2)), len: R.r(1.2, 1.7), to: v3(0.3, 1, -0.2), zig: 0.45, r: r0 * 0.3 },
  ];
  olds.forEach((b, bi) => {
    const N = 5, mp = limb(R, b.from, b.dir.normalize(), b.len, N, { zig: b.zig, jitter: 0.16, toward: b.to.normalize(), pull: bi === 0 ? 0 : 0.1, pullEnd: bi === 0 ? 0.42 : 0.2 });
    // 横枝：中段往下压一压
    if (bi === 0) for (let i = 1; i < N; i++) mp[i].y -= 0.32 * Math.sin((Math.PI * i) / N);
    tube(bark, mp, mp.map((_, i) => lerp(b.r, 0.016, Math.pow(i / N, 0.8))), { sides: o.lite ? 5 : 6, col: BK, vPerM: 1.2, uSpan: 0.4, sway: (_i, p) => swayAt(p) });
    mark(mp, 0.3, 0.15, 0.3, 0.9);
    tips.push(mp[N]);
    const nSp = 5 + R.i(3), nSh = bi === 0 ? 6 + R.i(3) : 3 + R.i(3);
    for (let s = 0; s < nSp; s++) { const dir = v3(), base = along(mp, R.r(0.25, 0.97), dir); spur(base, dir, R.r(0.22, 0.6)); }
    for (let s = 0; s < nSh; s++) shoot(along(mp, lerp(0.22, 0.95, (s + R.r(0.2, 0.8)) / nSh)), R.r(0.7, 1.5) * (bi === 0 ? 1 : 0.85));
  });
  // 断桩
  { const P0 = along(tp, 0.42), d = v3(-0.8, 0.5, R.pm(0.6)).normalize(); tube(bark, [P0, P0.clone().addScaledVector(d, 0.2), P0.clone().addScaledVector(d, 0.38)], [r0 * 0.5, r0 * 0.36, r0 * 0.24], { sides: 6, col: [0.6, 0.58, 0.58], uSpan: 0.5, cap: true }); }
  S.wood('bark', bark);

  // —— 花：疏疏地贴着枝 ——
  const cc = v3(0.6, 1.6, 0);
  for (const sp of spots) {
    if (R() > 0.8) continue;
    const p = sp.p, j = 0.07, x = p.x + R.pm(j), y = p.y + R.pm(j), z = p.z + R.pm(j), u = R();
    const tile = u < 0.14 + 0.2 * sp.k ? R.pick(BUDS) : u < 0.5 ? BLOOM.idx.meiOne : R.pick(MEI);
    const deep = R() < 0.2 ? R.r(1.08, 1.2) : R.r(0.92, 1.05);
    S.dab('plumBloom', x, y, z, tile === BLOOM.idx.meiOne ? R.r(0.13, 0.19) : R.r(0.25, 0.37), tile, x - cc.x, y - (cc.y - 0.8), z - cc.z, 1, [1, deep, deep], R.r(0, TAU), swayAt(p));
  }
  // —— 叶：嫩叶在梢（开春）；夏天沿枝 ——
  for (const p of tips) if (R() < 0.6) S.dab('fruitLeaf', p.x + R.pm(0.05), p.y + 0.06, p.z + R.pm(0.05), R.r(0.15, 0.22), TREE.idx.taoYoung, p.x - cc.x, 1.2, p.z - cc.z, R.r(0.9, 1.05), null, R.pm(0.7), swayAt(p), R.r(0, 0.12));
  for (const sp of spots) {
    const p = sp.p, x = p.x + R.pm(0.12), y = p.y + R.pm(0.1), z = p.z + R.pm(0.12);
    S.dab('fruitLeaf', x, y, z, R.r(0.34, 0.5), R.pick(LEAF), x - cc.x, y - (cc.y - 1), z - cc.z, R.r(0.78, 1.02), [R.r(0.94, 1.04), 1, R.r(0.9, 1.02)], R.pm(0.5), swayAt(p), R.r(0.2, 1));
  }
  void UP;
}
