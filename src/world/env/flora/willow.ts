/**
 * 垂柳。老干粗而斜（朝水那边探），两三根大枝先往上、再拱出去；小枝拱过了头就往下坠，
 * 万条垂丝从拱处一路挂下来，离地一人来高。丝不建模：是一串上下相接的笔（越往下摆得越大）。
 * 春天是一层鹅黄带绿的烟，夏天浓了，秋天黄而疏，冬天只剩光的垂条。
 * 「前」是 +x：干朝那边斜。
 */
import { TREE } from './tiles';
import { FGeo, along, clamp01, lerp, limb, perp, tube, v3, type RGB, type Rand, type V3 } from './kit';
import type { Sink } from './sink';

const TAU = Math.PI * 2;
const LIU = [TREE.idx.liu0, TREE.idx.liu1, TREE.idx.liu0], BARE = [TREE.idx.liuBare0, TREE.idx.liuBare1];

export function willow(S: Sink, R: Rand, o: { lite?: boolean } = {}) {
  const bark = new FGeo();
  const BK: RGB = [R.r(0.6, 0.66), R.r(0.57, 0.61), R.r(0.52, 0.56)], TW: RGB = [BK[0] * 0.84, BK[1] * 0.85, BK[2] * 0.84];
  const r0 = 0.3, H = 8.6;
  // —— 干：斜出，粗，皮上是深沟 ——
  const trunk = limb(R, v3(0, -0.25, 0), v3(R.r(0.16, 0.34), 1, R.pm(0.12)).normalize(), R.r(3.0, 3.7), 6, { jitter: 0.07, zig: 0.2 });
  const top = trunk[6];
  const swayAt = (p: V3) => clamp01(0.3 * Math.pow(clamp01(Math.hypot(p.x - top.x, p.z - top.z) / 5), 1.2) + 0.25 * clamp01((p.y - 2.5) / H));
  const knot = R.r(0, TAU);
  tube(bark, trunk, trunk.map((p, i) => r0 * (1 - 0.34 * (i / 6)) * (1 + 0.5 * Math.exp(-(p.y + 0.25) / 0.3))), {
    sides: o.lite ? 6 : 9, col: BK, vPerM: 0.8, uSpan: 1.6, sway: (_i, p) => swayAt(p) * 0.2,
    bulge: (i, a) => 1 + 0.1 * Math.sin(a * 4 + i * 1.3 + knot) + 0.07 * Math.sin(a * 7 - i * 0.9) + 0.05 * Math.sin(a * 2 + i * 2.1),
  });
  // 垂丝挂在哪
  const hang: V3[] = [];
  const mark = (pts: V3[], from: number, gap: number) => {
    let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    const n = Math.max(1, Math.round(((1 - from) * L) / gap));
    for (let i = 0; i < n; i++) hang.push(along(pts, from + (1 - from) * ((i + R.r(0.2, 0.8)) / n)));
  };
  // —— 大枝：先上后拱 ——
  const nL = 3 + (R() < 0.35 ? 1 : 0);
  let az = R.pm(0.5);
  for (let b = 0; b < nL; b++) {
    az += b === 0 ? 0 : TAU / nL + R.pm(0.5);
    const out = v3(Math.cos(az), 0, Math.sin(az)), e0 = R.r(1.05, 1.4), L = R.r(4.2, 6.0) * (b === 0 ? 1.1 : 1);
    const lp = limb(R, trunk[b === nL - 1 ? 5 : 6], v3(out.x * Math.cos(e0), Math.sin(e0), out.z * Math.cos(e0)), L, 8, { zig: 0.2, jitter: 0.08, toward: v3(out.x, 0.1, out.z).normalize(), pull: 0.02, pullEnd: 0.24 });
    const rb = r0 * R.r(0.4, 0.5), rad = (q: number) => lerp(rb, 0.035, Math.pow(q, 0.8));
    tube(bark, lp, lp.map((_, i) => rad(i / 8)), { sides: o.lite ? 5 : 6, col: BK, vPerM: 0.8, uSpan: 0.7, sway: (_i, p) => swayAt(p) });
    mark(lp, 0.72, 0.6);
    // 小枝：拱出去，梢头往下坠
    const nS = 3 + R.i(2);
    for (let s = 0; s < nS; s++) {
      const q = lerp(0.4, 0.96, (s + R.r(0.2, 0.8)) / nS), dir = v3(), base = along(lp, q, dir);
      const d = dir.clone().multiplyScalar(0.4).addScaledVector(perp(R, dir, 0.3), 0.8).addScaledVector(out, 0.3).normalize();
      d.y = Math.max(d.y, 0.1);
      const flat = v3(d.x, 0, d.z).normalize();
      const sp = limb(R, base, d.normalize(), R.r(1.6, 2.7), 5, { zig: 0.22, jitter: 0.1, toward: v3(flat.x, -0.35, flat.z).normalize(), pull: 0.05, pullEnd: 0.32 });
      const r1 = Math.max(0.02, rad(q) * 0.55);
      tube(bark, sp, sp.map((_, i) => lerp(r1, 0.01, i / 5)), { sides: 4, col: TW, vPerM: 0.8, uSpan: 0.3, sway: (_i, p) => swayAt(p) });
      mark(sp, 0.35, 0.5);
    }
  }
  S.wood('bark', bark);

  // —— 垂丝：一串上下相接的笔 ——
  for (const p of hang) {
    const drop = Math.min(p.y - R.r(1.4, 3.2), R.r(1.6, 4.2));
    if (drop < 1) continue;
    const sz = R.r(1.15, 1.6), n = Math.max(1, Math.ceil(drop / (sz * 0.86))), c = R.r(0, 0.55), s0 = swayAt(p);
    const ox = R.pm(0.12), oz = R.pm(0.12), tone = R.r(0.86, 1.06);
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / n, x = p.x + ox * i + R.pm(0.05), z = p.z + oz * i + R.pm(0.05), y = p.y - sz * (0.46 + 0.86 * i);
      S.dab('willow', x, y, z, sz, i === n - 1 ? TREE.idx.liuTip : R.pick(LIU), x - top.x * 0.6, 2.5, z - top.z * 0.6, tone * lerp(0.94, 1.08, f), [R.r(0.96, 1.03), 1, R.r(0.92, 1.04)], R.pm(0.05), lerp(s0, 0.95, f), lerp(c, 1, i / n));
      // 冬天光的垂条
      if (R() < 0.7) S.dab('whip', x + R.pm(0.1), y, z + R.pm(0.1), sz, R.pick(BARE), 0, 1, 0, R.r(0.95, 1.1), TW, R.pm(0.05), lerp(s0, 0.95, f));
    }
  }
}
