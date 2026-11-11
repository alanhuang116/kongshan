/**
 * 竹、草、荷。
 *   竹 —— 一丛九到十六竿，竿细而直，上段朝外弯、梢头微垂；节是贴图上的（一格一节）；枝从节上出，叶成簇、往下披；
 *   草 —— 草丛、蕨、麦冬三种，各十几个三角；
 *   荷 —— 四季各备一套：春是浮叶与尖尖的卷叶，夏是田田的立叶与花，秋是半枯卷边的叶与莲蓬，冬只剩枯梗折茎。换季只换显隐。
 */
import { FGeo, UP, card, clamp01, lerp, lin, mixRGB, mulRGB, rand, tube, v3, type RGB, type Rand, type Tile, type V3 } from './util';

// ———————————————————————————— 竹 ————————————————————————————
export interface ClumpGeo { culm: FGeo; leaf: FGeo; height: number; radius: number; center: V3 }
export function buildBamboo(seed: number, tiles: Tile[], density = 1): ClumpGeo {
  const R = rand(seed);
  const culm = new FGeo(), leaf = new FGeo();
  const n = 9 + R.i(8);
  let maxH = 0, maxR = 1;
  const cc = v3(0, 5.2, 0);
  for (let c = 0; c < n; c++) {
    const a = R.r(0, 6.283), q = Math.sqrt(R()) * 0.8;
    const x0 = Math.cos(a) * q, z0 = Math.sin(a) * q;
    const H = R.r(6, 9) * (c < 2 ? 0.62 : 1), rb = R.r(0.03, 0.046) * (H / 8);
    const la = a + R.pm(0.9), lean = R.r(0.5, 2.3) * (H / 8), dx = Math.cos(la), dz = Math.sin(la);
    const N = 12, pts: V3[] = [], rad: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, off = lean * Math.pow(t, 2.3);
      pts.push(v3(x0 + dx * off, H * (t - 0.1 * Math.pow(t, 4) * (lean / 2)), z0 + dz * off));
      rad.push(rb * (1 - 0.86 * Math.pow(t, 1.25)) + 0.003);
    }
    maxH = Math.max(maxH, H); maxR = Math.max(maxR, Math.hypot(pts[N].x, pts[N].z) + 0.8);
    const tone = R(), col: RGB = tone < 0.6 ? [R.r(0.9, 1.05), R.r(0.95, 1.05), R.r(0.85, 1)] : tone < 0.85 ? [1.2, 1.08, 0.66] : [0.72, 0.8, 0.74];
    const sw = (t: number) => Math.pow(t, 1.8);
    tube(culm, pts, rad, { sides: 6, uSpan: 1, vPerM: 1 / (0.3 * (H / 7.5)), sway: (i) => sw(i / N), col });
    // 枝与叶：从四成高往上，每隔一两节出一枝
    const leafSpray = (p: V3, dir: V3, size: number, s: number) => {
      const up = dir.clone().normalize();
      const right = v3().crossVectors(up, UP); if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize();
      const k = R.r(0.8, 1.1), tn: RGB = [k * R.r(0.9, 1.08), k, k * R.r(0.8, 1)], cb = mulRGB(tn, 0.7);
      card(leaf, p, right, up, size, size, R.pick(tiles), cc, 0.6, cb, tn, s, Math.min(1, s + 0.14), 0.04, 0.6);
      const r2 = right.clone().applyAxisAngle(up, 1.25);
      card(leaf, p, r2, up, size * 0.92, size * 0.92, R.pick(tiles), cc, 0.6, cb, tn, s, Math.min(1, s + 0.14), 0.04, 0.6);
    };
    const nb = Math.round(13 * density * (H / 8));
    for (let b = 0; b < nb; b++) {
      const t = lerp(0.36, 0.985, (b + R.r(0.1, 0.9)) / nb), i0 = Math.min(N - 1, Math.floor(t * N)), f = t * N - i0;
      const base = pts[i0].clone().lerp(pts[i0 + 1], f), s = sw(t);
      const ba = R.r(0, 6.283), el = R.r(0.25, 0.8), len = R.r(0.55, 1.25) * (1 - 0.45 * Math.pow(t, 3));
      const d = v3(Math.cos(ba) * Math.cos(el), Math.sin(el), Math.sin(ba) * Math.cos(el));
      const mid = base.clone().addScaledVector(d, len * 0.55), end = mid.clone().add(v3(d.x * len * 0.45, -len * R.r(0.02, 0.16), d.z * len * 0.45));
      tube(culm, [base, mid, end], [0.006, 0.0045, 0.003], { sides: 3, uSpan: 1, vPerM: 0.01, sway: () => s, col: [0.9, 0.95, 0.7] });
      const outDown = v3(d.x, R.r(-0.75, -0.25), d.z).normalize();
      leafSpray(end, outDown, R.r(0.5, 0.72), s);
      leafSpray(mid, v3(d.x + R.pm(0.5), R.r(-0.6, -0.1), d.z + R.pm(0.5)).normalize(), R.r(0.46, 0.64), s);
    }
    const tip = pts[N], td = v3().subVectors(pts[N], pts[N - 1]).normalize();
    for (let k = 0; k < 2; k++) leafSpray(tip, v3(td.x + R.pm(0.5), td.y - R.r(0.4, 1.1), td.z + R.pm(0.5)).normalize(), R.r(0.5, 0.66), 1);
  }
  cc.y = maxH * 0.68;
  return { culm, leaf, height: maxH, radius: maxR, center: cc.clone() };
}

// ———————————————————————————— 草丛、蕨、麦冬 ————————————————————————————
/** v：0 草丛、1 蕨、2 麦冬。tiles 依次是这三种的图 */
export function buildShrub(v: number, tiles: Tile[], seed: number): FGeo {
  const R = rand(seed), g = new FGeo();
  const nc = v3(0, -0.25, 0);
  if (v === 1) {
    // 蕨：六七片羽叶，从心里出来，先扬后垂
    const n = 6 + R.i(2);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + R.pm(0.3), L = R.r(0.55, 0.8), w = R.r(0.2, 0.26);
      const dx = Math.cos(a), dz = Math.sin(a), rx = -dz, rz = dx, T = tiles[1];
      const tone = R.r(0.8, 1.1), i0 = g.n;
      for (let j = 0; j <= 3; j++) {
        const t = j / 3, r = L * (t * 0.95), y = L * (0.75 * t - 0.62 * t * t) + 0.02, c = tone * (0.6 + 0.4 * t);
        for (const sd of [-1, 1]) g.v(dx * r + rx * sd * w / 2, y, dz * r + rz * sd * w / 2, dx * 0.3 * t, 1, dz * 0.3 * t, sd < 0 ? T[0] : T[2], lerp(T[1], T[3], t), c, c, c, t * 0.8);
      }
      for (let j = 0; j < 3; j++) g.quad(i0 + j * 2, i0 + j * 2 + 1, i0 + j * 2 + 3, i0 + j * 2 + 2);
    }
    return g;
  }
  const T = tiles[v === 2 ? 2 : 0], n = v === 2 ? 5 : 4, w = v === 2 ? R.r(0.62, 0.8) : R.r(0.46, 0.6), h = v === 2 ? R.r(0.34, 0.44) : R.r(0.4, 0.55);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI + R.pm(0.2), right = v3(Math.cos(a), 0, Math.sin(a));
    const up = v3(R.pm(0.22), 1, R.pm(0.22)).normalize(), tone = R.r(0.82, 1.08);
    card(g, v3(R.pm(0.06), 0, R.pm(0.06)), right, up, w, h, T, nc, 1.4, [tone * 0.55, tone * 0.55, tone * 0.55], [tone, tone, tone], 0, 0.8);
  }
  return g;
}

// ———————————————————————————— 荷 ————————————————————————————
export interface LotusGeo {
  /** 各季的叶（用荷叶贴图）、梗与蓬（纯顶点色）、莲蓬顶面 */
  leaf: Record<'spring' | 'summer' | 'autumn' | 'winter', FGeo>;
  stalk: Record<'spring' | 'summer' | 'autumn' | 'winter', FGeo>;
  /** 夏：花瓣（卡片） */
  petal: FGeo;
  /** 秋冬：莲蓬的顶面（用莲蓬贴图） */
  podTop: Record<'autumn' | 'winter', FGeo>;
}
const G_TOP = lin(0x5f8f4c), G_DARK = lin(0x3f6a3a), G_YOUNG = lin(0x9ab85a), Y_DRY = lin(0x9c9450), B_DRY = lin(0x6e5638), B_DARK = lin(0x3e3226), STEM = lin(0x6f8f4a), STEM_DRY = lin(0x4a4034);

/** 一张荷叶：圆的、盾状，梗在叶心。cup 叶心下凹多少，wave 叶缘起伏，droop 叶缘下垂，fold 往一个方向对折的程度（枯叶） */
function lotusLeaf(g: FGeo, c: V3, rad: number, tiltAx: V3, tilt: number, o: { cup: number; wave: number; droop: number; fold?: number; col: (ang: number, r: number) => RGB; sway: number; R: Rand }) {
  const S = 20, rings = [0.42, 0.82, 1.0], R = o.R, ph = R.r(0, 6.28), lobes = 2 + R.i(3);
  const q = v3();
  const quat = { ax: tiltAx.clone().normalize(), ang: tilt };
  const place = (lx: number, ly: number, lz: number): V3 => q.set(lx, ly, lz).applyAxisAngle(quat.ax, quat.ang).add(c).clone();
  const cc = o.col(0, 0);
  const center = place(0, -o.cup * rad, 0);
  const nUp = v3(0, 1, 0).applyAxisAngle(quat.ax, quat.ang);
  const i0 = g.v(center.x, center.y, center.z, nUp.x, nUp.y, nUp.z, 0.5, 0.5, cc[0], cc[1], cc[2], o.sway);
  const idx: number[][] = [];
  rings.forEach((rr, ri) => {
    const row: number[] = [];
    for (let k = 0; k <= S; k++) {
      const a = (k / S) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const wv = Math.sin(a * lobes + ph) * 0.72 + Math.sin(a * (lobes * 2 + 1) + ph * 2) * 0.28;
      const fold = o.fold ? 1 - o.fold * Math.abs(sa) * rr : 1;
      const y = -o.cup * rad * (1 - rr) * (1 - rr) + (ri === 2 ? wv * o.wave * rad - o.droop * rad * (0.6 + 0.4 * Math.abs(wv)) : ri === 1 ? wv * o.wave * rad * 0.35 - o.droop * rad * 0.2 : 0) - (o.fold ? o.fold * rr * rr * rad * 0.5 * Math.abs(sa) : 0);
      const p = place(ca * rr * rad, y, sa * rr * rad * fold);
      // 法线：近似取「朝上 + 向外倾一点（叶缘翘起处）」
      const nl = q.set(-ca * o.cup * 0.8 * (1 - rr) + ca * o.droop * rr, 1, -sa * o.cup * 0.8 * (1 - rr) + sa * o.droop * rr).normalize().applyAxisAngle(quat.ax, quat.ang);
      const col = o.col(a, rr);
      row.push(g.v(p.x, p.y, p.z, nl.x, nl.y, nl.z, 0.5 + ca * rr * 0.5, 0.5 + sa * rr * 0.5, col[0], col[1], col[2], Math.min(1, o.sway + 0.06 * rr)));
    }
    idx.push(row);
  });
  for (let k = 0; k < S; k++) g.tri(i0, idx[0][k + 1], idx[0][k]);
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < S; k++) g.quad(idx[r][k], idx[r][k + 1], idx[r + 1][k + 1], idx[r + 1][k]);
}
/** 纺锤（卷着的新叶、花蕾、枯叶卷）：沿 dir，长 len，最粗 r */
function spindle(g: FGeo, base: V3, dir: V3, len: number, r: number, c0: RGB, c1: RGB, sway: number, fat = 0.45) {
  const N = 5, pts: V3[] = [], rad: number[] = [];
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push(base.clone().addScaledVector(dir, len * t)); rad.push(Math.max(0.002, r * Math.sin(Math.PI * Math.pow(t, fat + 0.3)) * (1 - 0.3 * t))); }
  tube(g, pts, rad, { sides: 6, uSpan: 0.01, vPerM: 0.01, sway: () => sway, col: (i) => mixRGB(c0, c1, i / N) });
}

export function buildLotus(seed: number, rx: number, rz: number, count: number, petalTile: Tile): LotusGeo {
  const R = rand(seed);
  const mk = () => ({ spring: new FGeo(), summer: new FGeo(), autumn: new FGeo(), winter: new FGeo() });
  const leaf = mk(), stalk = mk(), petal = new FGeo(), podTop = { autumn: new FGeo(), winter: new FGeo() };
  // 撒点：尽量不挤在一起
  const pts: Array<[number, number]> = [];
  const total = Math.round(count * 1.45);
  for (let i = 0, guard = 0; i < total && guard < total * 30; guard++) {
    const a = R.r(0, 6.283), q = Math.sqrt(R());
    const x = Math.cos(a) * q * rx, z = Math.sin(a) * q * rz;
    if (pts.every(([px, pz]) => Math.hypot(px - x, pz - z) > 0.34)) { pts.push([x, z]); i++; }
  }
  const stem = (g: FGeo, path: V3[], r: number, c: RGB, sw: (p: V3) => number) => tube(g, path, path.map((_, i) => r * (1 - 0.3 * (i / (path.length - 1)))), { sides: 4, uSpan: 0.01, vPerM: 0.01, sway: (_i, p) => sw(p), col: c });
  const swY = (p: V3) => clamp01(p.y / 1.3);
  const greenCol = (dark: number) => (_a: number, r: number): RGB => mulRGB(mixRGB(G_DARK, G_TOP, r), dark);
  pts.forEach(([x, z], i) => {
    const kind = i < count ? (i % 20 < 13 ? 'stand' : 'float') : i < count * 1.17 ? 'flower' : i < count * 1.28 ? 'bud' : 'extra';
    const tAx = v3(R.pm(1), 0, R.pm(1)), tone = R.r(0.82, 1.1);
    if (kind === 'stand') {
      const h = R.r(0.35, 1.05), rad = R.r(0.28, 0.5), top = v3(x + R.pm(0.08), h, z + R.pm(0.08));
      // 夏
      stem(stalk.summer, [v3(x, -0.3, z), v3((x + top.x) / 2 + R.pm(0.05), h * 0.5, (z + top.z) / 2 + R.pm(0.05)), top], 0.017, mulRGB(STEM, tone), swY);
      lotusLeaf(leaf.summer, top, rad, tAx, R.r(0.05, 0.38), { cup: R.r(0.12, 0.26), wave: R.r(0.05, 0.12), droop: R.r(-0.04, 0.06), col: greenCol(tone), sway: swY(top), R });
      // 秋：半枯，卷边，有的折了腰
      const broken = R() < 0.35, h2 = h * (broken ? 0.62 : 0.95), top2 = v3(top.x + (broken ? R.pm(0.25) : 0), h2, top.z + (broken ? R.pm(0.25) : 0));
      const dry = R.r(0.25, 1), sd = R.r(0, 6.28);
      const autCol = (a: number, r: number): RGB => {
        const n = 0.5 + 0.5 * Math.sin(a * 2 + sd) * Math.sin(a * 3.3 + sd * 2), k = clamp01(dry * (0.5 + r * 0.9) * (0.6 + n * 0.8));
        return mulRGB(mixRGB(mixRGB(G_DARK, G_TOP, r), k > 0.75 ? B_DRY : Y_DRY, clamp01(k * 1.2)), tone);
      };
      if (broken) stem(stalk.autumn, [v3(x, -0.3, z), v3(x + R.pm(0.04), h * 0.55, z + R.pm(0.04)), v3(x + R.pm(0.06), h * 0.9, z + R.pm(0.06)), top2], 0.013, mulRGB(mixRGB(STEM, STEM_DRY, dry), tone), swY);
      else stem(stalk.autumn, [v3(x, -0.3, z), v3((x + top2.x) / 2, h2 * 0.5, (z + top2.z) / 2), top2], 0.013, mulRGB(mixRGB(STEM, STEM_DRY, dry * 0.7), tone), swY);
      lotusLeaf(leaf.autumn, top2, rad * R.r(0.85, 1), tAx, broken ? R.r(0.9, 1.5) : R.r(0.15, 0.6), { cup: R.r(0.1, 0.2), wave: R.r(0.14, 0.24), droop: R.r(0.18, 0.5), fold: R.r(0.15, 0.6) * dry, col: autCol, sway: swY(top2), R });
      // 冬：枯梗，折茎；有的梗头还挂着一卷枯叶
      if (R() < 0.8) {
        const k1 = v3(x + R.pm(0.05), h * R.r(0.5, 0.95), z + R.pm(0.05)), ba = R.r(0, 6.28), bl = R.r(0.2, 0.6);
        const end = v3(k1.x + Math.cos(ba) * bl, Math.max(-0.05, k1.y - R.r(0.15, 0.9) * bl * 1.6), k1.z + Math.sin(ba) * bl);
        stem(stalk.winter, [v3(x, -0.3, z), v3(x + R.pm(0.02), k1.y * 0.5, z + R.pm(0.02)), k1], 0.011, mulRGB(STEM_DRY, tone), swY);
        stem(stalk.winter, [k1, k1.clone().lerp(end, 0.5).add(v3(0, 0.02, 0)), end], 0.009, mulRGB(STEM_DRY, tone * 0.9), swY);
        if (R() < 0.55) spindle(stalk.winter, end, v3(Math.cos(ba) * 0.3, -1, Math.sin(ba) * 0.3).normalize(), R.r(0.14, 0.26), R.r(0.035, 0.06), mulRGB(B_DRY, tone), mulRGB(B_DARK, tone), swY(end));
      }
    } else if (kind === 'float') {
      const rad = R.r(0.22, 0.4), c = v3(x, 0.012, z);
      lotusLeaf(leaf.summer, c, rad, tAx, 0, { cup: 0.01, wave: 0.012, droop: 0, col: greenCol(tone * 0.95), sway: 0, R });
      lotusLeaf(leaf.autumn, c, rad * 0.95, tAx, 0, { cup: 0.01, wave: 0.02, droop: 0, col: (_a, r) => mulRGB(mixRGB(mixRGB(G_DARK, G_TOP, r), Y_DRY, R.r(0.3, 0.8) * r), tone), sway: 0, R });
      // 春：小浮叶；另有尖尖的卷叶出水
      lotusLeaf(leaf.spring, c, rad * R.r(0.4, 0.62), tAx, 0, { cup: 0.01, wave: 0.01, droop: 0, col: (_a, r) => mulRGB(mixRGB(G_TOP, G_YOUNG, r), tone), sway: 0, R });
      if (R() < 0.6) spindle(stalk.spring, v3(x + R.pm(0.3), -0.02, z + R.pm(0.3)), v3(R.pm(0.14), 1, R.pm(0.14)).normalize(), R.r(0.14, 0.34), R.r(0.012, 0.02), G_TOP, G_YOUNG, 0.2, 0.9);
    } else if (kind === 'flower') {
      const h = R.r(0.95, 1.4), top = v3(x + R.pm(0.06), h, z + R.pm(0.06));
      stem(stalk.summer, [v3(x, -0.3, z), v3(x + R.pm(0.03), h * 0.5, z + R.pm(0.03)), top], 0.011, mulRGB(STEM, tone), swY);
      const white = R() < 0.4, open = R.r(0.75, 1.1), fc = v3(top.x, top.y - 0.02, top.z);
      const whorls: Array<[number, number, number]> = [[7, 1.12 * open, 0.2], [7, 0.72 * open, 0.185], [5, 0.34 * open, 0.16]];
      whorls.forEach(([n, ang, len], w) => {
        for (let k = 0; k < n; k++) {
          const a = (k / n) * 6.283 + w * 0.45 + R.pm(0.1), an = ang + R.pm(0.08);
          const d = v3(Math.cos(a) * Math.sin(an), Math.cos(an), Math.sin(a) * Math.sin(an));
          const right = v3(-Math.sin(a), 0, Math.cos(a));
          const c: RGB = white ? [0.8, 0.79, 0.76] : [0.8, R.r(0.66, 0.76), R.r(0.7, 0.78)];
          // 两节：瓣尖再往里收一点，成兜
          const mid = top.clone().addScaledVector(d, len * 0.55), d2 = d.clone().lerp(UP, 0.38).normalize();
          const [u0, v0, u1, v1] = petalTile, vm = lerp(v0, v1, 0.55), wd = len * 0.62, sw = swY(top);
          const nrm = (p: V3) => p.clone().sub(fc).normalize().lerp(UP, 0.3).normalize();
          const P = [top.clone().addScaledVector(right, -wd * 0.3), top.clone().addScaledVector(right, wd * 0.3), mid.clone().addScaledVector(right, -wd * 0.5), mid.clone().addScaledVector(right, wd * 0.5),
            mid.clone().addScaledVector(d2, len * 0.45).addScaledVector(right, -wd * 0.3), mid.clone().addScaledVector(d2, len * 0.45).addScaledVector(right, wd * 0.3)];
          const UVs: Array<[number, number]> = [[lerp(u0, u1, 0.2), v0], [lerp(u0, u1, 0.8), v0], [u0, vm], [u1, vm], [lerp(u0, u1, 0.2), v1], [lerp(u0, u1, 0.8), v1]];
          const i0 = petal.n;
          P.forEach((p, j) => { const nn = nrm(p); petal.v(p.x, p.y, p.z, nn.x, nn.y, nn.z, UVs[j][0], UVs[j][1], c[0], c[1], c[2], sw); });
          petal.quad(i0, i0 + 1, i0 + 3, i0 + 2); petal.quad(i0 + 2, i0 + 3, i0 + 5, i0 + 4);
        }
      });
      // 花心：小莲蓬与一圈蕊
      const yel = lin(0xe8c24a), grn = lin(0xb8c060);
      tube(stalk.summer, [top.clone().add(v3(0, -0.01, 0)), top.clone().add(v3(0, 0.045, 0))], [0.02, 0.036], { sides: 8, uSpan: 0.01, vPerM: 0.01, sway: () => swY(top), col: grn, cap: true });
      tube(stalk.summer, [top.clone().add(v3(0, -0.005, 0)), top.clone().add(v3(0, 0.03, 0))], [0.05, 0.062], { sides: 10, uSpan: 0.01, vPerM: 0.01, sway: () => swY(top), col: yel });
    } else if (kind === 'bud') {
      const h = R.r(0.6, 1.2), top = v3(x + R.pm(0.05), h, z + R.pm(0.05));
      stem(stalk.summer, [v3(x, -0.3, z), v3(x + R.pm(0.03), h * 0.5, z + R.pm(0.03)), top], 0.01, mulRGB(STEM, tone), swY);
      spindle(stalk.summer, top.clone().add(v3(0, -0.01, 0)), v3(R.pm(0.1), 1, R.pm(0.1)).normalize(), R.r(0.1, 0.15), R.r(0.03, 0.042), lin(0xcfe0b0), lin(0xe89ab0), swY(top), 0.55);
    } else {
      // 莲蓬：秋天青褐、冬天焦黑，歪着头
      const h = R.r(0.55, 1.15), top = v3(x + R.pm(0.08), h, z + R.pm(0.08));
      for (const s of ['autumn', 'winter'] as const) {
        const dry = s === 'winter', c = dry ? mulRGB(B_DARK, tone) : mulRGB(mixRGB(STEM, B_DRY, 0.45), tone);
        const tip = dry ? v3(top.x + R.pm(0.14), h * R.r(0.7, 0.95), top.z + R.pm(0.14)) : top;
        stem(stalk[s], [v3(x, -0.3, z), v3(x + R.pm(0.03), h * 0.5, z + R.pm(0.03)), tip], 0.011, dry ? mulRGB(STEM_DRY, tone) : mulRGB(mixRGB(STEM, STEM_DRY, 0.5), tone), swY);
        const ax = v3(R.pm(0.5), 1, R.pm(0.5)).normalize(), pr = R.r(0.05, 0.07), e = tip.clone().addScaledVector(ax, 0.075);
        tube(stalk[s], [tip, tip.clone().addScaledVector(ax, 0.03), e], [0.012, pr * 0.7, pr], { sides: 9, uSpan: 0.01, vPerM: 0.01, sway: () => swY(tip), col: c });
        // 顶面
        const g = podTop[s], rt = v3().crossVectors(ax, v3(1, 0, 0.3)).normalize(), fw = v3().crossVectors(rt, ax).normalize(), k = dry ? 0.5 : 1;
        const i0 = g.v(e.x + ax.x * 0.004, e.y + ax.y * 0.004, e.z + ax.z * 0.004, ax.x, ax.y, ax.z, 0.5, 0.5, k * tone, k * tone, k * tone, swY(tip));
        for (let j = 0; j <= 9; j++) {
          const a = (j / 9) * 6.2832, p = e.clone().addScaledVector(rt, Math.cos(a) * pr).addScaledVector(fw, Math.sin(a) * pr);
          g.v(p.x, p.y, p.z, ax.x, ax.y, ax.z, 0.5 + Math.cos(a) * 0.48, 0.5 + Math.sin(a) * 0.48, k * tone, k * tone, k * tone, swY(tip));
        }
        for (let j = 0; j < 9; j++) g.tri(i0, i0 + 2 + j, i0 + 1 + j);
      }
    }
  });
  return { leaf, stalk, petal, podTop };
}
