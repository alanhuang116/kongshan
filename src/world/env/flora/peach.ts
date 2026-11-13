/**
 * 桃。桃树不高：矮干斜出，两三根主枝撑开——一根探得低而远，一根往上；枝是折着走的，不是顺滑的弧。
 * 主枝上抽出一根根长条（花枝），花就一簇一簇贴着这些条开，所以看得出「一枝一枝」，枝干从花里露出来（墨的枝、粉的花）；
 * 有的枝花密，有的疏。梢上几片带赭红的嫩叶。夏天换成披针形的叶；秋天叶疏了、黄了；冬天只剩墨枝。
 */
import { BLOOM, TREE } from './tiles';
import { FGeo, UP, along, clamp01, lerp, limb, perp, tube, v3, type RGB, type Rand, type V3 } from './kit';
import type { Sink } from './sink';

const TAU = Math.PI * 2;
const SPRAYS = [BLOOM.idx.tao0, BLOOM.idx.tao1, BLOOM.idx.tao2, BLOOM.idx.tao3];
const MASS = [BLOOM.idx.taoMass, BLOOM.idx.taoMass2];
const PAIR = [BLOOM.idx.taoPair, BLOOM.idx.taoPair2];
const LEAF = [TREE.idx.taoLeaf0, TREE.idx.taoLeaf1];

export interface PeachOpts {
  /** 花色：乘在胭脂上（每株深浅不同） */ tint: RGB;
  /** 花开几成满（0.7 疏 … 1.2 极盛） */ bloom: number;
  /** 干枝的边数减不减（远处的、低画质） */ lite?: boolean;
}
/** 一株桃（落在 Sink 当前的位置上）。返回花最盛处（树自己的坐标） */
export function peach(S: Sink, R: Rand, o: PeachOpts): V3 {
  const bark = new FGeo();
  const BK: RGB = [R.r(0.54, 0.6), R.r(0.5, 0.54), R.r(0.49, 0.53)], TW: RGB = [BK[0] * 0.86, BK[1] * 0.85, BK[2] * 0.86];
  const la = R.r(0, TAU), lean = R.r(0.15, 0.5), h0 = R.r(0.5, 0.95), r0 = R.r(0.105, 0.14);
  // —— 干：矮，斜出，带一道折 ——
  const trunk = limb(R, v3(0, -0.15, 0), v3(Math.cos(la) * lean, 1, Math.sin(la) * lean).normalize(), h0 + 0.15, 4, { jitter: 0.1, zig: 0.32 });
  const top = trunk[4], CR = 2.8, H = 3.8;
  const cc = v3(top.x * 1.3, 2.2, top.z * 1.3);
  const swayAt = (p: V3) => clamp01(0.45 * Math.pow(clamp01(Math.hypot(p.x - top.x, p.z - top.z) / CR), 1.3) + 0.3 * clamp01((p.y - 1) / H));
  const knot = R.r(0, TAU);
  tube(bark, trunk, trunk.map((p, i) => r0 * (1 - 0.3 * (i / 4)) * (1 + 0.55 * Math.exp(-(p.y + 0.15) / 0.16))), {
    sides: o.lite ? 5 : 7, col: BK, vPerM: 1, uSpan: 0.7, sway: (_i, p) => swayAt(p) * 0.3,
    bulge: (i, a) => 1 + 0.14 * Math.sin(a * 3 + i * 1.9 + knot) + 0.07 * Math.sin(a * 5 - i * 1.3),
  });
  // 花、叶落在哪：沿枝的一串点。k 是离梢多近（0 根 … 1 梢），w 是这一枝花开得密不密
  const spots: Array<{ p: V3; k: number; w: number }> = [];
  const mark = (pts: V3[], from: number, gap: number, k0: number, k1: number, w: number) => {
    let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    const n = Math.max(1, Math.round(((1 - from) * L) / gap));
    for (let i = 0; i < n; i++) { const q = from + (1 - from) * ((i + R.r(0.2, 0.8)) / n); spots.push({ p: along(pts, q), k: lerp(k0, k1, q), w }); }
  };
  const tips: V3[] = [];
  // —— 主枝：两三根。头一根探得低而远，末一根往上 ——
  const nS = R() < 0.25 ? 2 : R() < 0.8 ? 3 : 4;
  let az = la + R.pm(0.4), best = v3(0, 0, 0);
  for (let b = 0; b < nS; b++) {
    az += b === 0 ? 0 : TAU / nS + R.pm(0.5);
    const low = b === 0, e0 = low ? R.r(0.3, 0.55) : b === nS - 1 ? R.r(0.95, 1.2) : R.r(0.6, 0.95);
    const L = (low ? R.r(2.7, 3.4) : R.r(2.0, 2.9)), out = v3(Math.cos(az), 0, Math.sin(az));
    const sp = limb(R, trunk[b % 2 ? 3 : 4], v3(out.x * Math.cos(e0), Math.sin(e0), out.z * Math.cos(e0)), L, 6, { zig: 0.34, jitter: 0.13, toward: v3(out.x * 0.5, 0.86, out.z * 0.5).normalize(), pull: 0.02, pullEnd: low ? 0.2 : 0.3 });
    const rb = r0 * R.r(0.5, 0.62), rad = (q: number) => lerp(rb, 0.017, Math.pow(q, 0.75));
    tube(bark, sp, sp.map((_, i) => rad(i / 6)), { sides: o.lite ? 4 : 5, col: BK, vPerM: 1, uSpan: 0.35, sway: (_i, p) => swayAt(p) });
    const wB = R.r(0.55, 1.2);
    mark(sp, 0.45, 0.14, 0.4, 1, wB);
    tips.push(sp[6]);
    if (sp[6].y > best.y) best = sp[6];
    // 花枝：从主枝的上侧抽出来的长条，略带折
    const nSec = 4 + R.i(3);
    for (let s = 0; s < nSec; s++) {
      const q = lerp(0.24, 0.92, (s + R.r(0.2, 0.8)) / nSec), dir = v3(), base = along(sp, q, dir);
      const d = dir.clone().multiplyScalar(0.45).addScaledVector(perp(R, dir, 0.9), 0.9).normalize();
      if (d.y < 0.05) d.y = 0.05 + R.r(0, 0.3);
      d.normalize();
      const l2 = R.r(0.8, 1.7) * (1 - 0.3 * q);
      const tp = limb(R, base, d, l2, 4, { zig: 0.3, jitter: 0.14, toward: UP, pull: 0.16 });
      const r1 = Math.max(0.012, rad(q) * 0.55);
      tube(bark, tp, [r1, r1 * 0.78, r1 * 0.58, r1 * 0.42, 0.006], { sides: 4, col: TW, vPerM: 1, uSpan: 0.2, sway: (_i, p) => swayAt(p) });
      const wS = wB * R.r(0.6, 1.25);
      mark(tp, 0.08, 0.1, 0.5, 1, wS);
      tips.push(tp[4]);
      // 短梢
      const nT = o.lite ? 1 : 1 + R.i(2);
      for (let t = 0; t < nT; t++) {
        const d2 = v3(), b2 = along(tp, R.r(0.25, 0.85), d2);
        const td = d2.multiplyScalar(0.55).addScaledVector(perp(R, d2, 0.6), 0.75).normalize(), l3 = R.r(0.3, 0.7);
        const e = b2.clone().addScaledVector(td, l3), m = b2.clone().lerp(e, 0.5).add(v3(R.pm(0.04), 0.03, R.pm(0.04)));
        tube(bark, [b2, m, e], [0.009, 0.007, 0.004], { sides: 3, col: TW, vPerM: 1, uSpan: 0.1, sway: (_i, p) => swayAt(p) });
        mark([b2, m, e], 0.15, 0.095, 0.75, 1, wS);
        tips.push(e);
      }
    }
  }
  S.wood('bark', bark);

  // —— 花：一簇一簇贴着枝 ——
  const T = o.tint;
  for (const sp of spots) {
    if (R() > 0.95 * o.bloom * sp.w) continue;
    const p = sp.p, j = 0.13, x = p.x + R.pm(j), y = p.y + R.pm(j), z = p.z + R.pm(j);
    const nx = x - cc.x, ny = y - (cc.y - 0.9), nz = z - cc.z, sw = swayAt(p), u = R();
    // 梢上多苞与成对的，枝身上是成簇的
    const tile = u < 0.08 + 0.14 * sp.k ? BLOOM.idx.taoBuds : u < 0.3 ? R.pick(PAIR) : u < 0.36 ? BLOOM.idx.taoOne : R.pick(SPRAYS);
    // 一笔一个深浅：多数是淡粉，间或一笔近白、一笔深些
    const v = R(), deep = v < 0.16 ? R.r(1.1, 1.18) : v < 0.8 ? R.r(0.96, 1.06) : R.r(0.86, 0.94);
    S.dab('peachBloom', x, y, z, (tile === BLOOM.idx.taoOne ? R.r(0.18, 0.26) : R.r(0.32, 0.5)) * (0.9 + 0.2 * sp.k), tile, nx, ny, nz, 1, [T[0], T[1] * deep, T[2] * deep], R.r(0, TAU), sw);
    // 先染的一团淡粉：垫在花后面（靠冠心一侧）
    if (R() < 0.08 * o.bloom * sp.w) {
      const l = Math.hypot(nx, ny, nz) || 1, q = 0.14;
      S.dab('peachBloom', x - (nx / l) * q, y - (ny / l) * q, z - (nz / l) * q, R.r(0.42, 0.66), R.pick(MASS), nx, ny, nz, 1, [T[0], T[1] * 1.04, T[2] * 1.04], R.r(0, TAU), sw);
    }
  }
  // —— 叶：嫩叶在梢（排在前面，春天只画这些）；夏天的叶沿枝都有 ——
  for (const p of tips) {
    if (R() < 0.5) continue;
    const sw = swayAt(p);
    S.dab('fruitLeaf', p.x + R.pm(0.06), p.y + 0.07 + R.pm(0.05), p.z + R.pm(0.06), R.r(0.16, 0.25), TREE.idx.taoYoung, p.x - cc.x, 1.2, p.z - cc.z, R.r(0.9, 1.05), null, R.pm(0.7), sw, R.r(0, 0.12));
  }
  for (const sp of spots) {
    if (R() < 0.35) continue;
    const p = sp.p, x = p.x + R.pm(0.2), y = p.y + R.pm(0.18), z = p.z + R.pm(0.2), tone = R.r(0.8, 1.06);
    S.dab('fruitLeaf', x, y, z, R.r(0.42, 0.64), R.pick(LEAF), x - cc.x, y - (cc.y - 1.2), z - cc.z, tone, [R.r(0.94, 1.04), 1, R.r(0.9, 1.02)], R.pm(0.5), swayAt(p), R.r(0.2, 1));
  }
  return best;
}
