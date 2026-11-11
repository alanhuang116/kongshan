/**
 * 阔叶的三种：银杏、枫、梅。长法是一样的——
 *   干上出大枝，大枝上出小枝，小枝上出细枝；每一级都是「一段一段长，每段把方向往某处带一点」；
 *   叶（花）是沿着小枝、细枝一张张贴上去的卡片，所以叶子长在枝上，冬天落尽了枝还在。
 * 不同处只在姿态：银杏的枝先上扬后外展，冠是高大的卵圆；枫的枝横斜、成层；梅是老干虬枝，折角硬，另抽几根直上的新条。
 */
import { FGeo, UP, along, card, clamp01, lerp, pathLength, rand, smoothPath, sstep, tube, v3, type RGB, type Rand, type Tile, type V3 } from './util';

export interface BroadTree {
  bark: FGeo; leaf: FGeo;
  /** 第二种卡片：银杏、枫是冬天的细枝，梅是叶 */
  extra: FGeo;
  height: number; radius: number; center: V3;
}

/** 一根枝的走向：从 start 沿 dir 出发，共长 len，分 steps 段；每段把方向往 toward 带 pull，再抖一下；zig 是左右折的角度 */
export function limb(R: Rand, start: V3, dir: V3, len: number, steps: number, o: { toward?: V3; pull?: number; jitter?: number; zig?: number; pullEnd?: number } = {}): V3[] {
  const pts = [start.clone()], d = dir.clone().normalize();
  let p = start.clone();
  for (let k = 1; k <= steps; k++) {
    if (o.toward) { const q = k / steps, pl = lerp(o.pull ?? 0.2, o.pullEnd ?? o.pull ?? 0.2, q); d.lerp(o.toward, pl).normalize(); }
    if (o.zig) d.applyAxisAngle(UP, (k % 2 ? 1 : -1) * R.r(0.4, 1) * o.zig);
    if (o.jitter) { d.x += R.pm(o.jitter); d.y += R.pm(o.jitter * 0.6); d.z += R.pm(o.jitter); d.normalize(); }
    p = p.clone().addScaledVector(d, len / steps);
    pts.push(p);
  }
  return pts;
}
/** 与 t 垂直的一个随机方向 */
function perp(R: Rand, t: V3, upBias = 0): V3 {
  const a = v3(R.pm(1), R.pm(1) + upBias, R.pm(1));
  a.addScaledVector(t, -a.dot(t));
  if (a.lengthSq() < 1e-6) a.set(t.z, 0, -t.x);
  return a.normalize();
}
/** 把叶卡的次序打乱（按四边形）：这样只画前几成，就是一棵疏一些的树（春天的小叶、将谢的花） */
export function shuffleQuads(g: FGeo, R: Rand) {
  const n = g.idx.length / 6;
  for (let i = n - 1; i > 0; i--) {
    const j = R.i(i + 1);
    for (let k = 0; k < 6; k++) { const t = g.idx[i * 6 + k]; g.idx[i * 6 + k] = g.idx[j * 6 + k]; g.idx[j * 6 + k] = t; }
  }
}

// ———————————————————————————— 银杏 ————————————————————————————
export interface GinkgoTiles { sprays: Tile[]; twigs: Tile[] }
/**
 * 古银杏：高约 15 米，冠幅约 11 米，胸径约 1 米。
 * 冠形先定下来（一个卵圆），在它的表面上撒十几个「梢点」；每根大枝从干上出来，先陡陡地上扬，再朝自己的梢点弯出去——
 * 所以枝是「先上扬后外展」的，冠也一定是饱满的卵圆。
 */
export function buildGinkgo(seed: number, T: GinkgoTiles, density = 1): BroadTree {
  const R = rand(seed);
  const bark = new FGeo(), leaf = new FGeo(), extra = new FGeo();
  const H = 13.9, r0 = 0.56, CY = 8.9, CR = 5.0, CH = 5.4;
  const cc = v3(0, CY, 0);
  const inside = (p: V3) => Math.hypot(p.x / CR, (p.y - CY) / CH, p.z / CR);
  // 干
  const ctrl: V3[] = [];
  const pa = R.r(0, 6.28), pb = R.r(0, 6.28);
  for (let i = 0; i <= 7; i++) { const t = i / 7; ctrl.push(v3(0.36 * Math.sin(t * 3.3 + pa) * t, H * t, 0.32 * Math.sin(t * 2.7 + pb) * t)); }
  const NT = 26, tp = smoothPath(ctrl, NT);
  const rAt = (t: number) => r0 * Math.max(0.05, 0.96 - 0.9 * Math.pow(t, 1.3));
  const knot = R.r(0, 6.28);
  const swayAt = (p: V3) => clamp01(0.12 * Math.pow(clamp01(p.y / H), 2) + 0.6 * Math.pow(clamp01(Math.hypot(p.x, p.z) / CR), 1.4));
  const VM = 0.5;
  tube(bark, tp, tp.map((p, i) => rAt(i / NT) * (1 + 0.8 * Math.exp(-p.y / 0.45))), {
    sides: 16, uSpan: 3, vPerM: VM, sway: (_i, p) => swayAt(p),
    col: (i) => 0.72 + 0.28 * sstep(0, 0.16, i / NT),
    bulge: (i, a) => 1 + 0.22 * Math.exp(-tp[i].y / 0.55) * Math.sin(a * 6 + knot) + 0.04 * Math.sin(a * 4 + i * 0.6 + knot) + 0.03 * Math.sin(a * 9 - i * 0.4),
  });
  const trunkAt = (y: number) => { for (let i = 1; i < tp.length; i++) if (tp[i].y >= y) return tp[i - 1].clone().lerp(tp[i], clamp01((y - tp[i - 1].y) / (tp[i].y - tp[i - 1].y))); return tp[NT].clone(); };
  // 叶：沿一段枝贴卡
  const tint = (): RGB => [R.r(0.9, 1.1), R.r(0.84, 1.04), R.r(0.55, 1.0)];
  const ao = (p: V3) => lerp(0.54, 1.08, sstep(0.3, 1.0, inside(p)));
  const leaves = (pts: V3[], from: number, spacing: number, size: number) => {
    const L = pathLength(pts), n = Math.max(1, Math.round(((1 - from) * L) / spacing * density)), dir = v3();
    for (let i = 0; i < n; i++) {
      const p = along(pts, from + (1 - from) * ((i + R()) / n), dir);
      const up = perp(R, dir, 0.2).addScaledVector(dir, R.r(0.1, 0.7)).normalize();
      const right = v3().crossVectors(up, perp(R, up)).normalize();
      const k = ao(p), tn = tint(), s = size * R.r(0.8, 1.2), sw = swayAt(p);
      const c: RGB = [tn[0] * k, tn[1] * k, tn[2] * k], cb: RGB = [c[0] * 0.78, c[1] * 0.78, c[2] * 0.78];
      card(leaf, p, right, up, s, s, R.pick(T.sprays), cc, 0.3, cb, c, sw, Math.min(1, sw + 0.12), 0.06, CR / CH);
    }
  };
  const bare = (p: V3, dir: V3, size: number) => {
    const up = dir.clone().addScaledVector(UP, 0.3).add(v3(R.pm(0.35), R.pm(0.2), R.pm(0.35))).normalize();
    const right = v3().crossVectors(up, perp(R, up)).normalize(), sw = swayAt(p), k = R.r(0.8, 1.1);
    card(extra, p, right, up, size, size, R.pick(T.twigs), cc, 0.3, [k, k, k], [k, k, k], sw, Math.min(1, sw + 0.1), 0.04);
  };
  // 小枝与细枝
  const secondary = (lp: V3[], lr: (q: number) => number, count: number, q0: number, lenA: number, lenB: number) => {
    let roll = R.r(0, 6.28);
    for (let s = 0; s < count; s++) {
      const q = lerp(q0, 0.98, (s + R.r(0.25, 0.75)) / count), dir = v3(), base = along(lp, q, dir);
      roll += 2.4 + R.pm(0.5);
      const side = v3().crossVectors(dir, UP); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize();
      const upv = v3().crossVectors(side, dir).normalize();
      const out = v3(base.x, 0, base.z); if (out.lengthSq() > 1e-4) out.normalize();
      const d = dir.clone().multiplyScalar(0.5).addScaledVector(side, Math.cos(roll) * 0.9).addScaledVector(upv, Math.sin(roll) * 0.55).addScaledVector(out, 0.3).normalize();
      let len = lerp(lenA, lenB, q) * R.r(0.75, 1.2);
      // 别戳出冠外太多
      const probe = base.clone().addScaledVector(d, len), over = inside(probe);
      if (over > 1.06) len *= Math.max(0.35, 1.06 / over);
      const sp = limb(R, base, d, len, 4, { toward: v3(out.x * 0.5, 0.85, out.z * 0.5).normalize(), pull: 0.12, jitter: 0.08 });
      const rs = Math.max(0.02, lr(q) * 0.5);
      tube(bark, sp, sp.map((_, i) => lerp(rs, 0.014, i / 4)), { sides: 5, uSpan: 1, vPerM: VM, sway: (_i, w) => swayAt(w), col: 0.92 });
      leaves(sp, 0.12, 0.085, 0.64);
      const nt = Math.max(2, Math.round(len / 0.42));
      for (let k = 0; k < nt; k++) {
        const q2 = (k + R.r(0.3, 0.9)) / nt, d2 = v3(), b2 = along(sp, q2, d2);
        const td = d2.clone().multiplyScalar(0.45).add(perp(R, d2, 0.3).multiplyScalar(0.9)).normalize();
        const l2 = R.r(0.6, 1.25) * (1 - 0.3 * q2);
        const e = b2.clone().addScaledVector(td, l2), m = b2.clone().addScaledVector(td, l2 * 0.5).add(v3(0, 0.05, 0));
        tube(bark, [b2, m, e], [Math.max(0.012, rs * 0.4), 0.011, 0.007], { sides: 3, uSpan: 1, vPerM: VM, sway: (_i, w) => swayAt(w), col: 0.9 });
        leaves([b2, m, e], 0.1, 0.085, 0.6);
        bare(e, td, R.r(1.0, 1.5));
      }
      bare(sp[sp.length - 1], v3().subVectors(sp[4], sp[3]).normalize(), R.r(1.1, 1.6));
    }
  };
  // 大枝：朝冠面上的梢点长
  const NL = 18;
  const az0 = R.r(0, 6.28);
  for (let b = 0; b < NL; b++) {
    const f = (b + 0.5) / NL, yy = lerp(-0.68, 0.9, f), rr = Math.sqrt(1 - yy * yy) * (1 - 0.2 * yy), az = az0 + b * 2.399963 + R.pm(0.25);
    const k = R.r(0.82, 1.08);
    const tip = v3(CR * rr * Math.cos(az) * k, CY + CH * yy * k, CR * rr * Math.sin(az) * k);
    const hd = Math.hypot(tip.x, tip.z);
    const y0 = Math.min(H * 0.9, Math.max(3.5 + 0.25 * b, tip.y - R.r(0.45, 0.8) * hd - 0.8));
    const P0 = trunkAt(y0), out = v3(Math.cos(az), 0, Math.sin(az));
    const e0 = lerp(R.r(0.95, 1.15), 1.35, sstep(0.5, 1, f));
    const d = v3(out.x * Math.cos(e0), Math.sin(e0), out.z * Math.cos(e0));
    const steps = 8, pts: V3[] = [P0.clone()];
    let p = P0.clone();
    for (let s = 1; s <= steps; s++) {
      const to = v3().subVectors(tip, p), dist = to.length(); to.normalize();
      d.lerp(to, lerp(0.08, 0.75, Math.pow(s / steps, 1.6))).normalize();
      d.x += R.pm(0.05); d.z += R.pm(0.05); d.normalize();
      p = p.clone().addScaledVector(d, (dist / (steps - s + 1)) * 1.04);
      pts.push(p);
    }
    const lp = smoothPath(pts, 14, 0.4), L = pathLength(lp);
    const rb = Math.min(rAt(y0 / H) * 0.5, 0.21) * lerp(1, 0.7, f);
    const lr = (q: number) => lerp(rb, 0.035, Math.pow(q, 0.8));
    tube(bark, lp, lp.map((_, i) => lr(i / 14)), { sides: 8, uSpan: 1, vPerM: VM, sway: (_i, w) => swayAt(w), col: 0.95 });
    secondary(lp, lr, Math.max(3, Math.round(L / 0.66)), 0.2, 2.9, 1.2);
    leaves(lp.slice(-4), 0, 0.09, 0.64);
  }
  // 干梢
  secondary(tp.slice(-9), (q) => rAt(lerp(0.68, 1, q)), 9, 0.1, 2.2, 0.9);
  leaves(tp.slice(-4), 0.2, 0.09, 0.64);
  shuffleQuads(leaf, R);
  return { bark, leaf, extra, height: H + 0.6, radius: CR + 0.4, center: cc };
}

// ———————————————————————————— 枫 ————————————————————————————
export interface MapleTiles { sprays: Tile[]; twigs: Tile[] }
/** 枫（鸡爪槭一类）：矮干、几根主枝横斜出去，叶成一层一层的平片 */
export function buildMaple(seed: number, T: MapleTiles, density = 1): BroadTree {
  const R = rand(seed);
  const bark = new FGeo(), leaf = new FGeo(), extra = new FGeo();
  const H = R.r(4.6, 5.6), r0 = R.r(0.11, 0.14), CR = R.r(2.6, 3.2);
  const la = R.r(0, 6.28), lean = v3(Math.cos(la), 0, Math.sin(la));
  const th = R.r(1.3, 1.8);
  const tp = smoothPath(limb(R, v3(0, 0, 0), v3(lean.x * 0.12, 1, lean.z * 0.12), th, 4, { toward: v3(lean.x * 0.45, 0.9, lean.z * 0.45).normalize(), pull: 0.25, jitter: 0.07 }), 8);
  const cc = v3(lean.x * 0.5, H * 0.72, lean.z * 0.5);
  const swayAt = (p: V3) => clamp01(0.1 * clamp01(p.y / H) + 0.7 * Math.pow(clamp01(Math.hypot(p.x - cc.x, p.z - cc.z) / CR), 1.3));
  const knot = R.r(0, 6.28);
  tube(bark, tp, tp.map((p, i) => r0 * (1 - 0.3 * (i / 8)) * (1 + 0.6 * Math.exp(-p.y / 0.18))), { sides: 9, uSpan: 1.2, sway: (_i, p) => swayAt(p), col: [1.1, 1.12, 1.08], bulge: (i, a) => 1 + 0.12 * Math.exp(-tp[i].y / 0.25) * Math.sin(a * 5 + knot) + 0.05 * Math.sin(a * 3 + i) });
  const tint = (): RGB => { const w = R(); return [lerp(0.8, 1.14, w), R.r(0.6, 1.0) * lerp(0.9, 1.9, Math.pow(R(), 2.2)), R.r(0.6, 1.0)]; };
  const ao = (p: V3) => lerp(0.5, 1.05, sstep(0.25, 1, Math.hypot((p.x - cc.x) / CR, (p.y - cc.y) / (H * 0.36), (p.z - cc.z) / CR)));
  const flat = (pts: V3[], from: number, spacing: number, size: number) => {
    const L = pathLength(pts), n = Math.max(1, Math.round(((1 - from) * L) / spacing * density)), dir = v3();
    for (let i = 0; i < n; i++) {
      const p = along(pts, from + (1 - from) * ((i + R()) / n), dir);
      // 叶片摊平：卡片几乎水平，顺着枝往外铺，略带一点斜
      const up = v3(dir.x + R.pm(0.5), R.pm(0.42), dir.z + R.pm(0.5)); if (up.lengthSq() < 1e-4) up.set(1, 0, 0); up.normalize();
      const right = v3().crossVectors(up, v3(R.pm(0.55), 1, R.pm(0.55)).normalize()).normalize();
      const k = ao(p), tn = tint(), s = size * R.r(0.8, 1.25), sw = swayAt(p);
      const c: RGB = [tn[0] * k, tn[1] * k, tn[2] * k];
      card(leaf, v3(p.x, p.y + R.pm(0.16), p.z), right, up, s, s, R.pick(T.sprays), v3(cc.x, cc.y - H * 0.5, cc.z), 0.9, c, c, sw, Math.min(1, sw + 0.12), 0.25);
    }
  };
  const bare = (p: V3, dir: V3, size: number) => {
    const up = v3(dir.x, dir.y * 0.4 + 0.1, dir.z).normalize(), right = v3().crossVectors(up, v3(R.pm(0.4), 1, R.pm(0.4)).normalize()).normalize(), sw = swayAt(p), k = R.r(0.7, 1);
    card(extra, p, right, up, size, size, R.pick(T.twigs), cc, 0.3, [k, k, k], [k, k, k], sw, Math.min(1, sw + 0.1), 0.04);
  };
  const top = tp[tp.length - 1];
  const nM = 5;
  let az = la + R.pm(0.4);
  for (let b = 0; b < nM; b++) {
    az += (Math.PI * 2) / nM + R.pm(0.5);
    const out = v3(Math.cos(az), 0, Math.sin(az)), e0 = b === nM - 1 ? R.r(1.25, 1.45) : R.r(0.9, 1.2);
    const L = R.r(2.7, 3.5) * (b === 0 ? 1.1 : 1);
    const mp = smoothPath(limb(R, top, v3(out.x * Math.cos(e0), Math.sin(e0), out.z * Math.cos(e0)), L, 6, { toward: v3(out.x, 0.22, out.z).normalize(), pull: 0.08, pullEnd: 0.28, zig: 0.2, jitter: 0.05 }), 10, 0.3);
    const rb = r0 * 0.56, mr = (q: number) => lerp(rb, 0.02, Math.pow(q, 0.8));
    tube(bark, mp, mp.map((_, i) => mr(i / 10)), { sides: 6, uSpan: 1.2, sway: (_i, w) => swayAt(w), col: [1.1, 1.12, 1.08] });
    const ns = Math.round(L / 0.42);
    for (let s = 0; s < ns; s++) {
      const q = lerp(0.2, 0.97, (s + R.r(0.2, 0.8)) / ns), dir = v3(), base = along(mp, q, dir);
      const d = dir.clone().applyAxisAngle(UP, (s % 2 ? 1 : -1) * R.r(0.5, 1.2)); d.y = R.r(-0.12, 0.3); d.normalize();
      const len = lerp(1.6, 0.7, q) * R.r(0.7, 1.15);
      const sp = limb(R, base, d, len, 4, { zig: 0.24, jitter: 0.05, toward: v3(d.x, -0.06, d.z).normalize(), pull: 0.2 });
      const rs = Math.max(0.012, mr(q) * 0.5);
      tube(bark, sp, sp.map((_, i) => lerp(rs, 0.008, i / 4)), { sides: 4, uSpan: 1.2, sway: (_i, w) => swayAt(w), col: [1.05, 1.06, 1.02] });
      flat(sp, 0.1, 0.11, 0.7);
      for (let k = 0; k < 3; k++) {
        const d2 = v3(), b2 = along(sp, R.r(0.25, 0.95), d2);
        const td = d2.clone().applyAxisAngle(UP, (k % 2 ? 1 : -1) * R.r(0.5, 1.1)); td.y = R.r(-0.1, 0.12); td.normalize();
        const e = b2.clone().addScaledVector(td, R.r(0.4, 0.8));
        tube(bark, [b2, b2.clone().lerp(e, 0.5).add(v3(0, 0.02, 0)), e], [0.01, 0.008, 0.005], { sides: 3, uSpan: 1.2, sway: (_i, w) => swayAt(w), col: 1 });
        flat([b2, e], 0.2, 0.13, 0.64);
        bare(e, td, R.r(0.55, 0.8));
      }
      bare(sp[4], v3().subVectors(sp[4], sp[3]).normalize(), R.r(0.6, 0.9));
    }
    flat(mp.slice(-4), 0, 0.2, 0.7);
  }
  shuffleQuads(leaf, R);
  return { bark, leaf, extra, height: H, radius: CR + 0.3, center: cc };
}

// ———————————————————————————— 梅 ————————————————————————————
export interface PlumTiles { blossoms: Tile[]; leaves: Tile[] }
/** 梅：老干虬枝，折角硬；主枝上再抽几根直上的新条，花就开在枝上 */
export function buildPlum(seed: number, T: PlumTiles, density = 1): BroadTree {
  const R = rand(seed);
  const bark = new FGeo(), leaf = new FGeo(), extra = new FGeo();
  const H = R.r(3.0, 3.8), r0 = R.r(0.12, 0.15);
  const la = R.r(0, 6.28);
  const tp = limb(R, v3(0, 0, 0), v3(Math.cos(la) * 0.45, 1, Math.sin(la) * 0.45), R.r(1.0, 1.4), 4, { zig: 0.7, jitter: 0.2, toward: v3(Math.cos(la) * 0.7, 0.7, Math.sin(la) * 0.7).normalize(), pull: 0.16 });
  const cc = v3(Math.cos(la) * 0.5, H * 0.62, Math.sin(la) * 0.5), CR = H * 0.62;
  const swayAt = (p: V3) => clamp01(0.5 * Math.pow(clamp01(Math.hypot(p.x - cc.x, p.z - cc.z) / CR), 1.3) + 0.25 * clamp01((p.y - 1) / H));
  const dark: RGB = [0.5, 0.48, 0.5];
  const knot = R.r(0, 6.28);
  tube(bark, tp, tp.map((p, i) => r0 * (1 - 0.2 * (i / 4)) * (1 + 0.28 * Math.exp(-p.y / 0.12))), { sides: 8, uSpan: 1.2, sway: () => 0, col: dark, bulge: (i, a) => 1 + 0.16 * Math.sin(a * 3 + i * 1.7 + knot) + 0.1 * Math.sin(a * 5 - i) });
  const flower = (pts: V3[], from: number, spacing: number) => {
    const L = pathLength(pts), n = Math.max(1, Math.round(((1 - from) * L) / spacing * density)), dir = v3();
    for (let i = 0; i < n; i++) {
      const p = along(pts, from + (1 - from) * ((i + R()) / n), dir);
      const up = dir.clone().multiplyScalar(R.r(0.2, 1)).add(perp(R, dir, 0.3).multiplyScalar(R.r(0.4, 0.9))).normalize();
      const right = v3().crossVectors(up, perp(R, up)).normalize(), sw = swayAt(p);
      // 每株以一色为主：白梅里夹几朵粉，红梅里夹几朵淡
      const pink = R() < (seed % 2 ? 0.82 : 0.25), k = R.r(0.9, 1.06), deep = R.r(0.45, 0.8);
      const c: RGB = pink ? [k, k * deep, k * (deep + 0.08)] : [k, k, k * 0.98];
      card(leaf, p, right, up, R.r(0.26, 0.36), R.r(0.26, 0.36), R.pick(T.blossoms), p.clone().addScaledVector(UP, -0.4), 0.5, c, c, sw, Math.min(1, sw + 0.05), 0.2);
      const k2 = R.r(0.8, 1.1), c2: RGB = [k2 * R.r(0.9, 1.1), k2, k2 * R.r(0.8, 1)];
      const up2 = dir.clone().multiplyScalar(R.r(0.2, 0.8)).add(perp(R, dir, 0.2)).normalize(), r2 = v3().crossVectors(up2, perp(R, up2)).normalize();
      card(extra, p, r2, up2, R.r(0.34, 0.46), R.r(0.34, 0.46), R.pick(T.leaves), cc, 0.4, [c2[0] * 0.8, c2[1] * 0.8, c2[2] * 0.8], c2, sw, Math.min(1, sw + 0.1), 0.1);
    }
  };
  const top = tp[tp.length - 1];
  const nM = 3 + R.i(2);
  let az = la + R.pm(0.6);
  for (let b = 0; b < nM; b++) {
    az += (Math.PI * 2) / nM + R.pm(0.6);
    const out = v3(Math.cos(az), 0, Math.sin(az)), e0 = R.r(0.5, 1.0), L = R.r(1.5, 2.3);
    // 虬枝：不抹顺，留着硬折
    const mp = limb(R, top, v3(out.x * Math.cos(e0), Math.sin(e0), out.z * Math.cos(e0)), L, 5, { zig: 0.55, jitter: 0.2, toward: v3(out.x, 0.3, out.z).normalize(), pull: 0.12 });
    const rb = r0 * 0.55, mr = (q: number) => lerp(rb, 0.016, q);
    tube(bark, mp, mp.map((_, i) => mr(i / 5)), { sides: 6, uSpan: 1.2, sway: (_i, w) => swayAt(w), col: dark });
    flower(mp, 0.3, 0.2);
    // 侧枝
    for (let s = 0; s < 3; s++) {
      const q = R.r(0.3, 0.92), dir = v3(), base = along(mp, q, dir);
      const d = dir.clone().applyAxisAngle(UP, (s % 2 ? 1 : -1) * R.r(0.6, 1.3)); d.y = R.r(-0.15, 0.5); d.normalize();
      const sp = limb(R, base, d, R.r(0.6, 1.2), 3, { zig: 0.5, jitter: 0.16 });
      tube(bark, sp, [mr(q) * 0.55, 0.013, 0.009, 0.006], { sides: 4, uSpan: 1.2, sway: (_i, w) => swayAt(w), col: dark });
      flower(sp, 0.05, 0.15);
    }
    // 新条：直直地往上抽
    for (let s = 0; s < 3; s++) {
      const q = R.r(0.25, 0.95), base = along(mp, q);
      const d = v3(R.pm(0.2), 1, R.pm(0.2)).normalize(), l = R.r(0.7, 1.35);
      const sp = [base, base.clone().addScaledVector(d, l * 0.5), base.clone().addScaledVector(d, l)];
      tube(bark, sp, [0.012, 0.009, 0.005], { sides: 3, uSpan: 1.2, sway: (_i, w) => swayAt(w), col: [0.7, 0.62, 0.56] });
      flower(sp, 0.1, 0.13);
    }
  }
  shuffleQuads(leaf, R); shuffleQuads(extra, R);
  return { bark, leaf, extra, height: H, radius: CR, center: cc };
}
