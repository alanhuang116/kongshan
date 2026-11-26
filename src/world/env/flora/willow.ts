/**
 * 垂柳。老干粗而斜（朝水那边探），两三根大枝先往上、再拱出去；小枝拱过了头就往下坠，
 * 万条垂丝从拱处一路挂下来，离地一人来高。丝不建模：是一串上下相接的笔（越往下摆得越大）。
 * 春天是一层鹅黄带绿的烟，夏天浓了，秋天黄而疏，冬天只剩光的垂条：一处挂一缕细条（寒柳），
 * 比干枝淡、偏灰，长短不齐，有的地方空着、有的地方挂两缕；一缕是同一处竖着叠的两三笔（tiles.ts 的 LIU_BARE）。
 * 「前」是 +x：干朝那边斜。
 * 卧柳（lean，弧度）：干从水线上斜出去、越往上越平，冠探到水面上，垂丝几乎拖到水面（门前塘东南岸那一株，观象「大过」）。
 * 随机数一个不多取：斜、弯、拖长都是照旧取完数以后再改的，别的树一笔不变。
 */
import { LIU_BARE, LIU_OV, TREE } from './tiles';
import { FGeo, along, clamp01, lerp, limb, perp, tube, v3, type RGB, type Rand, type V3 } from './kit';
import type { Sink } from './sink';

const TAU = Math.PI * 2;
const LIU = [TREE.idx.liu0, TREE.idx.liu1, TREE.idx.liu0];
const ZAX = v3(0, 0, 1);

export function willow(S: Sink, R: Rand, o: { lite?: boolean; lean?: number } = {}) {
  const bark = new FGeo();
  const BK: RGB = [R.r(0.6, 0.66), R.r(0.57, 0.61), R.r(0.52, 0.56)], TW: RGB = [BK[0] * 0.84, BK[1] * 0.85, BK[2] * 0.84];
  const lean = o.lean ?? 0, r0 = lean ? 0.36 : 0.3, H = 8.6;
  // —— 干：斜出，粗，皮上是深沟 ——
  const d0 = v3(R.r(0.16, 0.34), 1, R.pm(0.12)).normalize();
  // 卧柳：先扳到 lean，再一路往 +x 压（弯着探出去）
  if (lean) d0.applyAxisAngle(ZAX, -(lean - Math.atan2(d0.x, d0.y)));
  const trunk = limb(R, v3(0, -0.25, 0), d0, R.r(3.0, 3.7) * (lean ? 1.3 : 1), 6, lean ? { jitter: 0.07, zig: 0.2, toward: v3(1, 0.42, 0).normalize(), pull: 0.05, pullEnd: 0.16 } : { jitter: 0.07, zig: 0.2 });
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
    // 卧柳的大枝也朝水那边偏一些（冠罩在水面上）
    const bd = v3(out.x * Math.cos(e0) + lean * 0.7, Math.sin(e0), out.z * Math.cos(e0)).normalize(), bt = v3(out.x + lean * 0.9, 0.1, out.z).normalize();
    const lp = limb(R, trunk[b === nL - 1 ? 5 : 6], bd, L, 8, { zig: 0.2, jitter: 0.08, toward: bt, pull: 0.02, pullEnd: 0.24 });
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
  let nOld = 0;
  for (const p of hang) {
    const a1 = R.r(1.4, 3.2), a2 = R.r(1.6, 4.2), drop0 = Math.min(p.y - a1, a2);
    if (drop0 < 1) continue;
    const sz = R.r(1.15, 1.6), n0 = Math.max(1, Math.ceil(drop0 / (sz * 0.86))), c = R.r(0, 0.55), s0 = swayAt(p);
    const ox = R.pm(0.12), oz = R.pm(0.12), tone = R.r(0.86, 1.06);
    // 卧柳的垂丝长：探在水面上的那些几乎拖到水里。多出来的几笔不取随机数（照旧的那几笔取数一个不差，后面的 nOld 也不变）
    const n = lean ? Math.max(n0, Math.ceil(Math.min(p.y - a1 * 0.22, a2 * 1.45) / (sz * 0.86))) : n0;
    for (let i = 0; i < n; i++) {
      const more = i >= n0, f = (i + 1) / n, x = p.x + ox * i + (more ? 0 : R.pm(0.05)), z = p.z + oz * i + (more ? 0 : R.pm(0.05)), y = p.y - sz * (0.46 + 0.86 * i);
      const tile = i === n - 1 ? (more || i === n0 - 1 ? TREE.idx.liuTip : R.pick(LIU)) : more || i === n0 - 1 ? LIU[i % 3] : R.pick(LIU);
      S.dab('willow', x, y, z, sz, tile, x - top.x * 0.6, 2.5, z - top.z * 0.6, tone * lerp(0.94, 1.08, f), more ? [1, 1, 0.98] : [R.r(0.96, 1.03), 1, R.r(0.92, 1.04)], more ? 0 : R.pm(0.05), lerp(s0, 0.95, f), lerp(c, 1, i / n));
      // （冬天的垂条在下面另画；这里照旧取那几个数，春夏秋的柳一笔不变）
      if (!more && R() < 0.7) { for (let j = 0; j < 5; j++) R(); nOld++; }
    }
  }
  // 旧画法的冬条每一笔都从 S 取过一个次序（没给 k）；新画的各缕自带次序。照旧数把 S 的次序往前拨这么多下，后面别的树、草的笔次序一个不变
  const sq = S as unknown as { seed: number };
  for (let j = 0; j < nOld; j++) sq.seed = (Math.imul(sq.seed, 1664525) + 1013904223) | 0;

  // —— 冬天光的垂条（寒柳）：一处一缕，有的空着、有的挂两缕；淡墨偏灰（比干枝淡），浓淡各缕不一 ——
  const grey: RGB = [lerp(TW[0], 0.76, 0.72), lerp(TW[1], 0.76, 0.72), lerp(TW[2], 0.75, 0.72)];
  /**
   * 中、低画质时 build.ts 按序号抽掉一些笔（序号 i 的 i×0.618 取小数，不小于留下的几成就抽；最少留七成五）：
   * 一缕中间少一截就成了两段断棍。会被抽的序号先垫一个空笔（大小为 0，画不出东西），真的笔都落在留下的序号上
   */
  const pad = (x: number, y: number, z: number, k: number) => { if ((S.dabs.whip.length * 0.61803398875) % 1 >= 0.75) S.dab('whip', x, y, z, 0, 0, 0, 1, 0, 1, null, 0, 0, k); };
  // 成缕：沿枝一段密、一段疏（一个两三米一起伏的数），不是匀匀的一道帘子
  const ph = R.r(0, TAU), fq = R.r(0.9, 1.4);
  for (const p of hang) {
    const dense = 0.5 + 0.5 * Math.sin((p.x * 1.3 + p.z * 1.7 + p.y * 0.8) * fq + ph), c = R();
    if (c < (o.lite ? 0.25 : 0.04) + 0.36 * (1 - dense)) continue;
    const m = !o.lite && R() < dense * 0.6 ? 2 : 1, s0 = swayAt(p);
    for (let q = 0; q < m; q++) {
      const drop = Math.min(p.y - R.r(1.2, 3.0), R.r(1.5, 4.4)) * (q ? R.r(0.5, 0.8) : 1);
      if (drop < 0.8) continue;
      // 多长用几格：一缕的长短在格里画定了，这里只把整缕放大缩小到合这一处的长短
      const K = drop < 1.7 ? 1 : drop < 2.9 ? 2 : 3, tiles = R.pick(LIU_BARE.filter((f) => f.length === K));
      const sz = drop / (1 + (K - 1) * (1 - LIU_OV)), x = p.x + (q ? R.pm(0.2) : 0), z = p.z + (q ? R.pm(0.2) : 0);
      // 一缕的笔次序一样：秋天叶疏时露出的是整缕，换季时也是一缕一缕地出没
      const tone = R.r(0.88, 1.1), k = R();
      for (let i = 0; i < K; i++) {
        // 格顶略高过挂处：条从枝上起，不悬在枝下
        const y = p.y + sz * (0.06 - 0.5 - i * (1 - LIU_OV));
        pad(x, y, z, k);
        // 越往下摆得越大；一格是整块摆的，按它偏上的一处算（头一格不至于离了枝）。光条不兜风，比带叶的摆得小些
        S.dab('whip', x, y, z, sz, tiles[i], 0, 1, 0, tone, grey, 0, lerp(s0, 0.85, (i + 0.3) / K), k);
      }
    }
  }
}
