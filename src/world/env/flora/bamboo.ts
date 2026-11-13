/**
 * 竹。一丛十几二十竿，竿细而直（按真实粗细建，靠勾线显出来），上段朝外弯、梢头微垂；节是材质里的一道道环。
 * 叶不建模：从四成高往上，一节一节地点「个」字、「介」字（叶尖都朝下披），竿梢是一小段弯下来的梢叶。
 * 丛的占地由 spread 定（约是总图上那一丛的 r 的两三倍）——丛数是定数（三十二），所以每丛要饱满，丛与丛相接成林。
 */
import { EVER } from './tiles';
import { FGeo, lerp, tube, v3, type RGB, type Rand, type V3 } from './kit';
import type { Sink } from './sink';

const TAU = Math.PI * 2;
const GE = [EVER.idx.zhu0, EVER.idx.zhu1, EVER.idx.zhu2, EVER.idx.zhu3, EVER.idx.zhu4], TIP = [EVER.idx.zhuTip0, EVER.idx.zhuTip1];

export function bamboo(S: Sink, R: Rand, o: { spread: number; culms: number; lite?: boolean }) {
  const culm = new FGeo();
  for (let c = 0; c < o.culms; c++) {
    const a = R.r(0, TAU), q = Math.pow(R(), 0.65) * o.spread, x0 = Math.cos(a) * q, z0 = Math.sin(a) * q;
    const young = c < 3, H = R.r(6.6, 10) * (young ? 0.62 : 1), rb = R.r(0.03, 0.046) * (H / 8);
    // 往外斜（丛边上的斜得多），梢头垂
    const la = a + R.pm(0.9), lean = R.r(0.5, 2.2) * (H / 8) * (0.5 + 0.7 * (q / o.spread)), dx = Math.cos(la), dz = Math.sin(la);
    const N = o.lite ? 5 : 7, pts: V3[] = [], rad: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = Math.pow(i / N, 0.8), off = lean * Math.pow(t, 2.3);
      pts.push(v3(x0 + dx * off, -0.2 + (H + 0.2) * (t - 0.1 * Math.pow(t, 4) * (lean / 2)), z0 + dz * off));
      rad.push(rb * (1 - 0.86 * Math.pow(t, 1.25)) + 0.004);
    }
    const tone = R(), col: RGB = tone < 0.62 ? [R.r(0.72, 0.8), R.r(0.8, 0.87), R.r(0.62, 0.7)] : tone < 0.85 ? [0.88, 0.84, 0.6] : [0.62, 0.7, 0.62];
    const sw = (t: number) => Math.pow(t, 1.8) * 0.9;
    tube(culm, pts, rad, { sides: o.lite ? 4 : 5, uSpan: 1, vPerM: 1 / (0.34 * (H / 8)), v0: R(), sway: (i) => sw(Math.pow(i / N, 0.8)), col });
    const at = (t: number): V3 => { const f = Math.pow(t, 1.25) * N, i0 = Math.min(N - 1, Math.floor(f)); return pts[i0].clone().lerp(pts[i0 + 1], f - i0); };
    // 叶：一节一节地点
    const nb = Math.round((young ? 6 : 11) * (H / 8));
    for (let b = 0; b < nb; b++) {
      const t = lerp(0.36, 0.985, (b + R.r(0.1, 0.9)) / nb), base = at(t), s = Math.min(0.95, sw(t) + 0.08);
      const ba = R.r(0, TAU), len = R.r(0.45, 1.15) * (1 - 0.45 * Math.pow(t, 3)), ex = Math.cos(ba), ez = Math.sin(ba);
      const tn = R() < 0.25 ? R.r(1.05, 1.2) : R.r(0.78, 1.02);
      S.dab('bamboo', base.x + ex * len, base.y + len * R.r(-0.1, 0.3), base.z + ez * len, R.r(0.58, 0.86), R.pick(GE), base.x + ex * len - x0 * 0.5, 0.8, base.z + ez * len - z0 * 0.5, tn, [R.r(0.94, 1.05), 1, R.r(0.88, 1.02)], R.pm(0.7), s);
      if (R() < 0.62) S.dab('bamboo', base.x + ex * len * 0.45, base.y + len * R.r(0, 0.25), base.z + ez * len * 0.45, R.r(0.5, 0.72), R.pick(GE), base.x - x0 * 0.5 + ex, 0.6, base.z - z0 * 0.5 + ez, tn * R.r(0.86, 1), null, R.pm(0.7), s);
    }
    // 梢
    const tip = pts[N];
    for (let k = 0; k < 2; k++) S.dab('bamboo', tip.x + R.pm(0.2), tip.y - 0.1 - 0.3 * k, tip.z + R.pm(0.2), R.r(0.6, 0.85), R.pick(TIP), dx, 0.8, dz, R.r(0.85, 1.1), null, R.pm(0.25), 0.95);
  }
  S.wood('culm', culm);
}
