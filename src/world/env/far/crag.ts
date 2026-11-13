/**
 * 石峰。画里的石柱不是一根根等粗的圆管（那像管风琴），是一块块石头叠起来的：
 *
 *   叠 —— 一根柱由下往上叠着几块石（三到七块），一块比一块细（收分），每块高矮、粗细、歪斜都不同，
 *         块与块之间错开一点。上一块细，下一块的顶就露出一圈窄台（台上立松、生杂树）；上一块粗，就是探出来的一截，
 *         底下是一道墨重的影（悬岩）。
 *   棱 —— 每块石的四围是一个个平的面（石是方的），宽窄不等、各有进出；面与面之间是缝，缝有深有浅。
 *         每块各起各的棱，所以竖的线到了块缝就断开、错开——不成一条条齐的竖纹。另有一两道深的裂隙从上贯到下。
 *   顶 —— 圆顶、平顶（略斜）、叠成两三级的、裂成两三块的、尖的，各样都有。
 *   脚 —— 外撇，淡进雾里。
 *
 * 每块石是一个独立的筒：底（悬出去时看得见）、四围、顶。筒的一圈每个面六个顶点（面两个、两道缝壁各两个，法线各归各的面）。
 * 墨色：缝里、悬岩下的墨与台上顶上的一点石绿写在顶点色里；每块石从自己的顶往下由浓到淡的积墨记在 aInk 上（stone.ts）。
 * uv：u 的整数部分是「第几块的第几个面」（着色器按它给每个面错开横的层缝），v 是高度。
 */
import * as THREE from 'three';
import { PIG } from '../../ink/ink';
import { mulberry32, smooth, type Rng } from '../../core/rng';

export type CrownStyle = 'dome' | 'flat' | 'stepped' | 'split' | 'sharp';
export interface Shaft {
  x: number; z: number;
  /** 柱顶的高度（世界坐标 y）与柱脚以上半腰的半径 */ h: number; r: number;
  seed: number;
  /** 柱脚埋到多低 */ y0?: number;
  /** 每升高一米歪出去多少（x、z） */ lean?: [number, number];
  /** 柱脚外撇几成 */ flare?: number;
  /** 收分：顶比脚细几成（不给随机 0.3…0.5） */ taper?: number;
  /** 截面压扁（长轴比短轴）与长轴的方向（弧度，0 是东西向） */ squash?: number; turn?: number;
  /** 棱的进出与缝的深浅（0 光面 … 1 棱棱分明） */ ribs?: number;
  /** 一块石一圈分几个面（不给按粗细定） */ count?: number;
  /** 叠几块（不给按高矮粗细定） */ blocks?: number;
  /** 顶的样子（不给按 crown 与随机定）；crown：0 平 … 1 圆 … 1.5 以上尖 */ crownStyle?: CrownStyle; crown?: number;
  /** 平顶往哪边低（弧度）、每米低多少 */ tilt?: [number, number];
  /** 探出来的悬岩多不多（0…1，默认 0.25） */ overhang?: number;
  /** 整根的墨色再加几层（后面的、衬底的可以淡些：给负数） */ tone?: number;
  /** 是一堆土石（圆墩）而不是柱 */ mound?: boolean;
  /** 圆墩一圈分几格；圆墩分几排 */ seg?: number; rows?: number;
  /** 顶上、台上草木的绿意（0 没有 … 1） */ green?: number;
  /** 一道宽而深的竖槽（瀑布从这里下来）：[朝哪边（弧度）, 切进去几成] */ notch?: [number, number];
  /** 柱脚淡去几层墨（没在雾里；走得近的峰少淡些） */ fade?: number;
  /** 下半截带几成暖色（淡赭） */ warm?: number;
}
/** 能立树的地方：柱顶、台、柱脚 */
export interface Anchor { x: number; y: number; z: number; /** 朝外的方向 */ nx: number; nz: number; kind: 'top' | 'ledge' | 'foot'; /** 这根柱多粗多高（定树的大小） */ r: number; h: number }

const TAU = Math.PI * 2;
const hash = (a: number, b: number) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
/** 一个层面：朝 a 方向每米低下去 k，过 (x0, z0) */
interface Dip { a: number; k: number; x0: number; z0: number }
const NODIP: Dip = { a: 0, k: 0, x0: 0, z0: 0 };
const dipY = (d: Dip, x: number, z: number) => -d.k * ((x - d.x0) * Math.cos(d.a) + (z - d.z0) * Math.sin(d.a));

/** 一块石（一个筒） */
interface Blk {
  /** 底面的中心，往上每米歪出去多少 */ cx: number; cz: number; lx: number; lz: number;
  yb: number; yt: number; rb: number; rt: number; bulge: number;
  /** 柱脚那一块（往下凹着撇开） */ foot: boolean;
  sq: number; turn: number;
  nR: number; A: Float32Array; rho: Float32Array; hw: Float32Array; gd: Float32Array; tone: Float32Array;
  rows: number;
  top: 'flat' | 'dome' | 'sharp'; topH: number;
  /** 底、顶的层面（与下一块、上一块共用一个斜面：缝是斜的） */ dB: Dip; dT: Dip;
  /** 顶露不露：上一块整个盖住它时不画顶，块缝也就不起一道横线、不积墨 */ cap: boolean;
  bottom: boolean;
  /** 第几块（uv 用）、在整根里排第几（0 最下）与一共几块 */ id: number; rank: number;
  /** 瀑布的槽在第几道缝（没有是 -1） */ notch: number;
  /** 这一块整体再加几层墨 */ shade: number;
  /** 面在每一排上进出几成（面不是平板） */ wob: number;
}
interface Pillar { top: number; fade: number; green: number; warm: number; tone: number; ribs: number; seed: number }

export class Crag {
  private pos: number[] = []; private nor: number[] = []; private uv: number[] = []; private col: number[] = []; private ink: number[] = []; private idx: number[] = [];
  private nid = 0;
  anchors: Anchor[] = [];
  /** 刚搭的那根柱的柱面：朝 th 方向、高 y 处在平面上哪里（往外再让出 pad 米；有竖槽的就是槽底）。瀑布贴着它挂 */
  lastAt: (th: number, y: number, pad?: number) => [number, number] = () => [0, 0];
  /** 刚搭的那根柱：最上一块石的顶（瀑布的崖口）有多高、柱脚的中心在哪 */
  lastTop = 0; lastBase: [number, number] = [0, 0];
  /** dens：配这座峰的材质的浓度（顶点色按它折算） */
  constructor(private dens: number) {}
  get tris() { return this.idx.length / 3; }

  /** 几层墨 → 顶点色；再罩一点石绿、一点暖 */
  private tint(L: number, green: number, warm = 0): [number, number, number] {
    const e = Math.max(-0.8, L / this.dens), mo = PIG.mo;
    let r = Math.pow(mo[0], e), g = Math.pow(mo[1], e), b = Math.pow(mo[2], e);
    if (green > 0) { r *= Math.pow(0.5, green); g *= Math.pow(0.82, green); b *= Math.pow(0.56, green); }
    if (warm > 0) { g *= Math.pow(0.9, warm); b *= Math.pow(0.72, warm); }
    return [r, g, b];
  }

  // —— 一块石的几何量 ——
  private static sect(b: Blk, th: number) { const c = Math.cos(th - b.turn), s = Math.sin(th - b.turn); return 1 / Math.sqrt((c * c) / (b.sq * b.sq) + s * s * b.sq * b.sq); }
  /** 第 t（0 底 … 1 顶）高处的半径（不算棱的进出） */
  private static rad(b: Blk, t: number) { return (b.foot ? b.rt + (b.rb - b.rt) * Math.pow(1 - t, 2.4) : b.rb + (b.rt - b.rb) * t) * (1 + b.bulge * Math.sin(Math.PI * t)); }
  private static at(b: Blk, th: number, rr: number, y: number): [number, number] {
    const k = Crag.sect(b, th) * rr, dy = y - b.yb;
    return [b.cx + b.lx * dy + Math.cos(th) * k, b.cz + b.lz * dy + Math.sin(th) * k];
  }
  /** 第 i 道缝两边的面、缝底的半径 */
  private static faceR(b: Blk, i: number, t: number) { return Crag.rad(b, t) * (1 + b.rho[i]) * (1 + b.wob * (hash(b.id * 7.13 + i * 1.31, Math.round(t * 12)) - 0.5)); }
  /** 平面上一点在不在这块石的某个高度之内（粗看，不算棱）：返回到边的距离（里面为正） */
  private static inside(b: Blk, x: number, z: number, t: number) {
    const y = b.yb + (b.yt - b.yb) * t, dx = x - (b.cx + b.lx * (y - b.yb)), dz = z - (b.cz + b.lz * (y - b.yb));
    const th = Math.atan2(dz, dx);
    return Crag.rad(b, t) * Crag.sect(b, th) * 0.97 - Math.hypot(dx, dz);
  }

  /** 把一块石写进篮子 */
  private emit(b: Blk, P: Pillar) {
    const W = b.nR * 6, base = this.pos.length / 3;
    type Ring = { kind: 0 | 1 | 2; t: number; k: number; dy: number };            // 0 底、1 四围、2 顶
    const rings: Ring[] = [];
    if (b.bottom) rings.push({ kind: 0, t: 0, k: 0, dy: -Math.min(2.5, 0.05 * b.rb) }, { kind: 0, t: 0, k: 1, dy: 0 });
    for (let i = 0; i < b.rows; i++) rings.push({ kind: 1, t: i / (b.rows - 1), k: 1, dy: 0 });
    const T: Array<[number, number]> = b.top === 'flat' ? (b.rank < 1 && b.topH > 0.5 ? [[1, 0], [0.9, 0.6], [0, 1]] : [[1, 0], [0, 1]]) : b.top === 'dome' ? [[1, 0], [0.84, 0.48], [0.52, 0.85], [0, 1]] : [[1, 0], [0.78, 0.35], [0.46, 0.72], [0, 1]];
    if (b.cap) for (const [k, f] of T) rings.push({ kind: 2, t: 1, k, dy: f * b.topH });
    const n = rings.length, Pp = new Float32Array(n * W * 3);
    const yTop = b.yt, cTop = Crag.at(b, 0, 0, yTop), cBot = Crag.at(b, 0, 0, b.yb);
    for (let a = 0; a < n; a++) {
      const R0 = rings[a], y0 = b.yb + (b.yt - b.yb) * R0.t;
      for (let i = 0; i < b.nR; i++) {
        const i1 = (i + 1) % b.nR, ip = (i + b.nR - 1) % b.nR;
        const rf = Crag.faceR(b, i, R0.t), rf1 = Crag.faceR(b, i1, R0.t), rg = Math.min(rf, rf1) * (1 - b.gd[i]);
        const pts = [Crag.at(b, b.A[i] + b.hw[ip], rf, y0), Crag.at(b, b.A[i + 1] - b.hw[i], rf, y0), Crag.at(b, b.A[i + 1], rg, y0), Crag.at(b, b.A[i + 1] + b.hw[i], rf1, y0)];
        const six = [pts[0], pts[1], pts[1], pts[2], pts[2], pts[3]];
        for (let v = 0; v < 6; v++) {
          let x = six[v][0], z = six[v][1], y = y0;
          if (R0.kind === 2) {
            x = cTop[0] + (x - cTop[0]) * R0.k; z = cTop[1] + (z - cTop[1]) * R0.k; y = yTop + R0.dy;
            // 尖顶的尖歪向一边（像一截没削齐的石笋）
            if (b.top === 'sharp') { const f = (1 - R0.k) * b.rt * 0.45; x += Math.cos(b.turn) * f; z += Math.sin(b.turn) * f; }
          }
          else if (R0.kind === 0) { x = cBot[0] + (x - cBot[0]) * R0.k; z = cBot[1] + (z - cBot[1]) * R0.k; y = b.yb + R0.dy; }
          y += R0.kind === 1 ? (1 - R0.t) * dipY(b.dB, x, z) + R0.t * dipY(b.dT, x, z) : dipY(R0.kind === 2 ? b.dT : b.dB, x, z);
          const o = (a * W + i * 6 + v) * 3;
          Pp[o] = x; Pp[o + 1] = y; Pp[o + 2] = z;
        }
      }
    }
    // 朝向、墨色
    const hgt = Math.max(1, b.yt - b.yb), reach = 0.4 * hgt + 8, rankK = b.cap ? 0.35 + 0.35 * b.rank : 0;
    for (let a = 0; a < n; a++) {
      const R0 = rings[a];
      let lo = a, hi = a;
      while (lo > 0 && rings[lo - 1].kind === R0.kind) lo--;
      while (hi < n - 1 && rings[hi + 1].kind === R0.kind) hi++;
      const au = Math.min(hi, a + 1), ad = Math.max(lo, a - 1);
      for (let i = 0; i < b.nR; i++) for (let v = 0; v < 6; v++) {
        const c = i * 6 + v, o = (a * W + c) * 3, x = Pp[o], y = Pp[o + 1], z = Pp[o + 2];
        const ctr = R0.kind === 0 ? cBot : cTop, ox = x - ctr[0], oz = z - ctr[1], ol = Math.hypot(ox, oz) || 1;
        let nx: number, ny: number, nz: number;
        if (R0.kind === 1) {
          const m = (a * W + i * 6 + (v ^ 1)) * 3, sg = v & 1 ? -1 : 1;
          const ux = (Pp[m] - x) * sg, uy = (Pp[m + 1] - y) * sg, uz = (Pp[m + 2] - z) * sg;
          const up = (au * W + c) * 3, dn = (ad * W + c) * 3, vx = Pp[up] - Pp[dn], vy = Pp[up + 1] - Pp[dn + 1], vz = Pp[up + 2] - Pp[dn + 2];
          nx = vy * uz - vz * uy; ny = vz * ux - vx * uz; nz = vx * uy - vy * ux;
          if (Math.hypot(nx, ny, nz) < 1e-6) { nx = ox; ny = 0; nz = oz; }
          // 朝外（离中心）
          const cx = b.cx + b.lx * (y - b.yb), cz = b.cz + b.lz * (y - b.yb), mx = (x + Pp[m]) / 2 - cx, mz = (z + Pp[m + 2]) / 2 - cz;
          if (nx * mx + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        } else if (R0.kind === 2) {
          const sl = b.top === 'flat' ? 0.18 * R0.k : b.top === 'dome' ? 0.75 * R0.k : 1.2 * R0.k;
          nx = (ox / ol) * sl; ny = 1; nz = (oz / ol) * sl;
        } else { nx = (ox / ol) * 0.3 * R0.k; ny = -1; nz = (oz / ol) * 0.3 * R0.k; }
        const ln = Math.hypot(nx, ny, nz) || 1;
        nx /= ln; ny /= ln; nz /= ln;
        this.pos.push(x, y, z); this.nor.push(nx, ny, nz);
        const face = v < 2;
        this.uv.push(b.id * 37 + i + (face ? 0.04 + 0.9 * v : 0.97), y);
        // 积墨：每块石从自己的顶往下淡；整根的顶再重一些；悬岩底下一道
        let ik: number;
        if (R0.kind === 1) {
          ik = Math.max(rankK * Math.pow(Math.max(0, 1 - (yTop - y) / reach), 1.5), 0.75 * Math.pow(Math.max(0, 1 - (P.top - y) / Math.max(30, P.top * 0.32)), 1.5));
        } else ik = R0.kind === 2 ? 0.34 : 0.55;
        this.ink.push(Math.max(0, Math.min(1, ik + 0.12 * (hash(b.id * 3.1 + a, i * 1.7 + (face ? 0 : 5)) - 0.5))));
        // 顶点色（几层墨）：块与面各有深浅；缝壁深些、缝底最深；悬岩底下深；柱脚淡（没在雾里）；朝上的一点石绿
        let L = P.tone + b.shade + b.tone[i] * P.ribs;
        if (R0.kind !== 0 && !face) L += (v === 3 || v === 4 ? 0.9 + 8 * b.gd[i] : 0.35 + 3 * b.gd[i]) * (R0.kind === 2 ? 0.25 : 1) * smooth(0.0, 8, y + 4);
        if (R0.kind === 0) L += 0.45;
        L -= P.fade * smooth(Math.min(P.top * 0.4, 70), 0, y);
        const t = this.tint(Math.min(2.6, L), P.green * smooth(0.45, 0.85, ny), P.warm * smooth(0.75, 0.15, y / Math.max(1, P.top)) * (0.6 + 0.8 * hash(i * 3.3 + b.id, P.seed)));
        this.col.push(t[0], t[1], t[2]);
      }
    }
    for (let a = 0; a < n - 1; a++) {
      if (rings[a].kind !== rings[a + 1].kind) continue;                             // 底、四围、顶之间位置相同、朝向不同：不连
      for (let i = 0; i < b.nR; i++) for (let f = 0; f < 3; f++) {
        const i0 = base + a * W + i * 6 + f * 2, i1 = i0 + 1, j0 = i0 + W, j1 = j0 + 1;
        this.idx.push(i0, j0, j1, i0, j1, i1);
      }
    }
  }

  /** 起一块石的棱：面的宽窄、进出、缝的深浅（每块各起各的，竖线到块缝就断开） */
  private ribsOf(R: Rng, nR: number, a0: number, ribs: number, clefts: number[], notch?: [number, number]) {
    const A = new Float32Array(nR + 1), rho = new Float32Array(nR), hw = new Float32Array(nR), gd = new Float32Array(nR), tone = new Float32Array(nR);
    let sum = 0;
    const wt: number[] = [];
    for (let i = 0; i < nR; i++) { wt.push(0.45 + 1.1 * R()); sum += wt[i]; }
    A[0] = a0;
    for (let i = 0; i < nR; i++) A[i + 1] = A[i] + (wt[i] / sum) * TAU;
    for (let i = 0; i < nR; i++) {
      const pitch = A[i + 1] - A[i];
      rho[i] = ribs * (R() < 0.25 ? 0.15 : 0.09) * (R() - 0.5) * 2;
      hw[i] = Math.min(pitch, A[(i + 2) % (nR + 1)] - A[i + 1] || pitch) * (0.05 + 0.07 * R());
      // 缝：多半是浅的，有的几乎没有，少数深
      const k = R();
      gd[i] = ribs * (k < 0.3 ? 0.008 : k < 0.85 ? 0.03 + 0.04 * R() : 0.09 + 0.06 * R());
      tone[i] = (R() - 0.5) * 0.55;
    }
    // 贯穿的深裂隙：离它最近的那道缝加深
    const near = (th: number) => { let best = 0, bd = 9; for (let i = 0; i < nR; i++) { const d = Math.abs(((((A[i + 1] - th) % TAU) + TAU + Math.PI) % TAU) - Math.PI); if (d < bd) { bd = d; best = i; } } return best; };
    for (const th of clefts) { const i = near(th); gd[i] = Math.max(gd[i], ribs * (0.14 + 0.08 * R())); hw[i] = Math.max(hw[i], (A[i + 1] - A[i]) * 0.1); }
    let nb = -1;
    if (notch) {
      nb = near(notch[0]);
      const lo = A[nb] + 0.02, hi = nb + 2 <= nR ? A[nb + 2] - 0.02 : A[nb + 1] + 0.3;
      let want = notch[0];
      while (want < lo) want += TAU;
      while (want > hi + TAU) want -= TAU;
      A[nb + 1] = Math.max(lo, Math.min(hi, want));
      if (nb + 1 === nR) A[0] = A[nR] - TAU;
      gd[nb] = notch[1]; hw[nb] = Math.max(hw[nb], 0.1);
    }
    return { A, rho, hw, gd, tone, notch: nb };
  }

  shaft(s: Shaft): this {
    if (s.mound) return this.mound(s);
    const R: Rng = mulberry32(s.seed * 7919 + 17);
    const y0 = s.y0 ?? -22, H = s.h, r = s.r, ribs = s.ribs ?? 0.85;
    const taper = s.taper ?? 0.38 + 0.2 * R(), flare = s.flare ?? 0.24 + 0.12 * R();
    const sq = Math.sqrt(s.squash ?? 1), turn = s.turn ?? R() * Math.PI, lean = s.lean ?? [0, 0];
    const P: Pillar = { top: H, fade: s.fade ?? 0.5, green: s.green ?? 0.8, warm: s.warm ?? 0.5, tone: s.tone ?? 0, ribs, seed: s.seed };
    // 顶的样子
    const cr = s.crown ?? -1;
    let style: CrownStyle = s.crownStyle ?? (cr >= 1.4 ? 'sharp' : cr >= 0.75 ? 'dome' : 'flat');
    if (!s.crownStyle && cr < 0.75) { const k = R(); style = r < 14 ? (k < 0.45 ? 'sharp' : k < 0.8 ? 'dome' : 'flat') : r > 34 ? (k < 0.12 ? 'flat' : k < 0.48 ? 'stepped' : k < 0.8 ? 'split' : 'dome') : k < 0.3 ? 'flat' : k < 0.56 ? 'stepped' : k < 0.8 ? 'split' : 'dome'; }
    // 尖顶只给细的（粗柱子顶个尖像一顶斗笠）
    if (style === 'sharp' && r > 22) style = 'dome';
    if (style === 'dome' && r > 26 && !s.crownStyle) style = R() < 0.5 ? 'stepped' : 'split';
    // 顶上另叠的石占多高（叠成几级、裂成几块的）
    const crownExtra = style === 'stepped' ? Math.min(H * 0.3, r * (0.55 + 0.4 * R())) : style === 'split' ? Math.min(H * 0.34, r * (0.7 + 0.5 * R())) : 0;
    const rTopNom = r * (1 - taper);
    const domeH = style === 'dome' ? rTopNom * (0.32 + 0.22 * R()) : style === 'sharp' ? rTopNom * (0.6 + 0.35 * R()) : rTopNom * (0.05 + 0.04 * R());
    const Hb = Math.max(y0 + 10, H - crownExtra - domeH);
    // 块：几块、各多高
    const nB = Math.max(2, Math.min(r < 12 ? 3 : 5, Math.round(s.blocks ?? (Hb / (r * (1.0 + 0.8 * R()))))));
    const wts: number[] = [];
    for (let k = 0; k < nB; k++) wts.push((0.6 + 0.8 * R()) * (k === 0 ? 1.5 : 1));
    const ws = wts.reduce((p, q) => p + q, 0);
    const bounds = [0];
    for (let k = 0; k < nB; k++) bounds.push(bounds[k] + (wts[k] / ws) * Hb);
    const nR = Math.max(5, Math.round(s.count ?? Math.min(26, 5 + r * 0.09)));
    const clefts: number[] = [];
    for (let k = 0, n = r < 14 ? 0 : 1 + Math.floor(R() * 2.4); k < n; k++) clefts.push(R() * TAU);
    if (s.notch) clefts.push(s.notch[0]);
    const blks: Blk[] = [];
    let ox = 0, oz = 0, a0 = R() * TAU, prevRt = r * (1 + flare), prevDip: Dip = NODIP;
    const side = R() * TAU;                                                         // 这根柱「齐」的那一面
    const ovP = s.overhang ?? 0.14;
    for (let k = 0; k < nB; k++) {
      const yb = k === 0 ? y0 : bounds[k] - 0.8, yt = bounds[k + 1];
      const fm = (bounds[k] + bounds[k + 1]) / 2 / Math.max(1, Hb), target = r * (1 - taper * Math.pow(fm, 1.1));
      let rk = target * (0.94 + 0.12 * R());
      if (k > 0) {
        // 块缝：四成只是一道缝，四成多退进去露出一圈台，一成多探出来（悬岩，多在半腰）
        const j = R();
        if (j < 0.4) rk = Math.min(rk, prevRt * (0.995 - 0.03 * R()));
        else if (j < 1 - ovP * (fm < 0.85 ? 1 : 0.3)) rk = Math.max(target * 0.78, prevRt * (0.76 + 0.14 * R()));
        else rk = prevRt * (r > 30 ? 1.03 + 0.03 * R() : 1.05 + 0.06 * R());
      }
      const last = k === nB - 1;
      const rb = k === 0 ? r * (1 + flare) : rk * (1.0 + 0.025 * R()), rt = (k === 0 ? target * (0.96 + 0.06 * R()) : rk * (0.965 - 0.045 * R())) * (last && style === 'sharp' ? 0.45 : 1);
      // 块与块错开一点（随高度慢慢歪）
      if (k > 0) { const shrink = Math.max(0, prevRt - rk), ph = side + (R() - 0.5) * 1.4; ox += Math.cos(ph) * shrink * 0.8 + (R() - 0.5) * 0.07 * rk; oz += Math.sin(ph) * shrink * 0.8 + (R() - 0.5) * 0.07 * rk; }
      a0 += (R() - 0.5) * (TAU / nR) * 0.9;
      const rb2 = this.ribsOf(R, nR, a0, ribs, clefts, s.notch);
      // 这一块顶上的层面：斜着的（大崖斜得少）；最上一块平顶的就是顶的斜
      const jx = s.x + lean[0] * Math.max(0, yt) + ox, jz = s.z + lean[1] * Math.max(0, yt) + oz, tl = s.tilt ?? [R() * TAU, 0.05 + 0.1 * R()];
      const dT: Dip = last ? (style === 'flat' ? { a: tl[0], k: tl[1], x0: jx, z0: jz } : style === 'dome' ? { a: R() * TAU, k: 0.03 * R(), x0: jx, z0: jz } : NODIP) : { a: R() * TAU, k: (0.035 + 0.08 * R()) * (r > 90 ? 0.35 : 1), x0: jx, z0: jz };
      blks.push({
        cx: s.x + lean[0] * Math.max(0, yb) + ox, cz: s.z + lean[1] * Math.max(0, yb) + oz, lx: lean[0], lz: lean[1],
        yb, yt, rb, rt, bulge: k === 0 ? 0 : (R() < 0.6 ? 1 : -1) * (0.015 + 0.05 * R()), foot: k === 0, sq: sq * (0.93 + 0.14 * R()), turn: turn + (R() - 0.5) * 0.3, nR, ...rb2,
        rows: Math.max(3, Math.min(6, Math.round((yt - Math.max(0, yb)) / 11))) + (k === 0 ? 1 : 0), wob: ribs * (r > 90 ? 0.03 : 0.055),
        top: last ? (style === 'flat' ? 'flat' : style === 'sharp' ? 'sharp' : 'dome') : 'flat', topH: last ? (style === 'stepped' || style === 'split' ? rt * (0.1 + 0.08 * R()) : domeH) : Math.min(5, rt * 0.08),
        dB: prevDip, dT,
        cap: true, bottom: false, id: this.nid++, rank: nB > 1 ? k / (nB - 1) : 1, shade: (R() - 0.5) * 0.35,
      });
      prevRt = rt; prevDip = dT;
    }
    // 顶上另叠的石：叠成几级的、裂成几块的
    const top = blks[blks.length - 1], topC = Crag.at(top, 0, 0, top.yt);
    const extra: Blk[] = [];
    const stone = (cx: number, cz: number, yb: number, h: number, rr: number, kind: 'flat' | 'dome' | 'sharp', dome: number) => {
      const n = Math.max(5, Math.round(nR * 0.7));
      const rb2 = this.ribsOf(R, n, R() * TAU, ribs, []);
      extra.push({ cx, cz, lx: lean[0], lz: lean[1], yb, yt: yb + h, rb: rr, rt: rr * (0.86 - 0.1 * R()), bulge: 0.03 + 0.05 * R(), foot: false, sq: 1 + 0.25 * R(), turn: R() * Math.PI, nR: n, ...rb2, rows: Math.max(3, Math.min(5, Math.round(h / 10))), top: kind, topH: dome, dB: NODIP, dT: NODIP, cap: true, bottom: true, id: this.nid++, rank: 1, shade: (R() - 0.5) * 0.3, wob: ribs * 0.07 });
    };
    if (style === 'stepped') {
      // 叠成两三级：一级比一级细，各自偏一点，最上一级多半是圆的
      let rr = top.rt * (0.62 + 0.14 * R()), yb = top.yt + top.topH * 0.5 - 1, cx = topC[0] + (R() - 0.5) * top.rt * 0.36, cz = topC[1] + (R() - 0.5) * top.rt * 0.36;
      const steps = R() < 0.45 ? 1 : 2;
      for (let k = 0; k < steps; k++) {
        const h = (crownExtra / steps) * (k === 0 ? 1.15 : 0.85), lastStep = k === steps - 1;
        stone(cx, cz, yb, h, rr, lastStep && R() < 0.7 ? 'dome' : 'flat', lastStep ? rr * (0.25 + 0.25 * R()) : Math.min(2, rr * 0.05));
        yb += h - 0.8; rr *= 0.55 + 0.15 * R(); cx += (R() - 0.5) * rr * 0.5; cz += (R() - 0.5) * rr * 0.5;
      }
    } else if (style === 'split') {
      // 顶裂成两三个尖：高矮不一，都偏在一边些，中间是一道豁口
      const n = 2 + (R() < 0.35 ? 1 : 0), a1 = R() * TAU;
      for (let k = 0; k < n; k++) {
        const a = a1 + (k / n) * TAU + (R() - 0.5) * 0.5, d = top.rt * (0.36 + 0.16 * R()), rr = top.rt * (0.42 + 0.16 * R());
        const h = crownExtra * (k === 0 ? 1 : 0.45 + 0.4 * R()), kind = R() < 0.65 ? 'dome' : 'flat';
        stone(topC[0] + Math.cos(a) * d, topC[1] + Math.sin(a) * d, top.yt + top.topH * 0.4 - 1, h, rr, kind, kind === 'dome' ? rr * (0.3 + 0.35 * R()) : Math.min(2, rr * 0.06));
      }
    }
    // 下一块比这一块粗（在某些方向上探出来）：要有底
    const all = [...blks, ...extra];
    for (let k = 1; k < blks.length; k++) {
      const lo = blks[k - 1], hi = blks[k];
      let cover = true;
      for (let j = 0; j < 12; j++) {
        const th = (j / 12) * TAU, [px, pz] = Crag.at(hi, th, Crag.rad(hi, 0) * 1.08, hi.yb);
        if (Crag.inside(lo, px, pz, 1) < 0) hi.bottom = true;
        // 下一块顶的边上一点，在不在上一块里（差不到一米半就算盖住了）
        const [qx, qz] = Crag.at(lo, th, Crag.rad(lo, 1), lo.yt);
        if (Crag.inside(hi, qx, qz, 0) < -1.5) cover = false;
      }
      lo.cap = !cover;
    }
    for (const b of all) this.emit(b, P);
    // —— 能立树的地方：每块露出来的台、顶上的石 ——
    for (let k = 0; k < blks.length; k++) {
      const lo = blks[k], hi = k + 1 < blks.length ? blks[k + 1] : null;
      for (let j = 0; j < 10; j++) {
        const th = R() * TAU, edge = Crag.rad(lo, 1) * Crag.sect(lo, th);
        const c = Crag.at(lo, 0, 0, lo.yt);
        if (hi) {
          // 台：下一块的顶露出来的那一圈
          const [ex, ez] = [c[0] + Math.cos(th) * edge * 0.9, c[1] + Math.sin(th) * edge * 0.9];
          const room = -Crag.inside(hi, ex, ez, 0);
          if (room > Math.max(1.6, 0.05 * r)) this.anchors.push({ x: ex, y: lo.yt + 0.5 + dipY(lo.dT, ex, ez), z: ez, nx: Math.cos(th), nz: Math.sin(th), kind: 'ledge', r, h: H });
        }
      }
    }
    const tops = extra.length ? extra : [top];
    for (const b of tops) {
      const c = Crag.at(b, 0, 0, b.yt), n = Math.max(2, Math.round(b.rt * 0.16));
      for (let k = 0; k < n; k++) {
        const a = R() * TAU, d = Math.sqrt(R()) * 0.7, rr = Crag.rad(b, 1) * Crag.sect(b, a) * d;
        const x = c[0] + Math.cos(a) * rr, z = c[1] + Math.sin(a) * rr;
        const y = b.yt + b.topH * (b.top === 'flat' ? 1 : Math.max(0, 1 - d * d)) + dipY(b.dT, x, z);
        this.anchors.push({ x, y, z, nx: Math.cos(a), nz: Math.sin(a), kind: 'top', r, h: H });
      }
    }
    if (style === 'split' || style === 'stepped') {
      // 底下那块的平顶上（石与石之间）也站得住树
      for (let k = 0; k < 2; k++) { const a = R() * TAU, rr = Crag.rad(top, 1) * Crag.sect(top, a) * 0.8, x = topC[0] + Math.cos(a) * rr, z = topC[1] + Math.sin(a) * rr; if (extra.every((e) => Crag.inside(e, x, z, 0) < 0)) this.anchors.push({ x, y: top.yt + 0.5, z, nx: Math.cos(a), nz: Math.sin(a), kind: 'ledge', r, h: H }); }
    }
    // 瀑布贴着哪里挂
    const notchT = s.notch;
    this.lastTop = top.yt; this.lastBase = [s.x, s.z];
    this.lastAt = (th, y, pad = 0) => {
      let b = blks[0];
      for (const q of blks) if (y >= q.yb && y <= q.yt + 0.01) b = q;
      if (y > blks[blks.length - 1].yt) b = blks[blks.length - 1];
      const t = Math.max(0, Math.min(1, (y - b.yb) / Math.max(1, b.yt - b.yb)));
      if (notchT && b.notch >= 0) {
        const i = b.notch, i1 = (i + 1) % b.nR, rg = Math.min(Crag.faceR(b, i, t), Crag.faceR(b, i1, t)) * (1 - b.gd[i]), a = b.A[i + 1];
        return Crag.at(b, a, rg + pad / Math.max(0.3, Crag.sect(b, a)), y);
      }
      return Crag.at(b, th, Crag.rad(b, t) + pad / Math.max(0.3, Crag.sect(b, th)), y);
    };
    return this;
  }

  /** 一堆土石（柱脚的坡、峰前的小冈）：圆墩，面是顺的 */
  private mound(s: Shaft): this {
    const R: Rng = mulberry32(s.seed * 7919 + 17);
    const y0 = s.y0 ?? -22, h = s.h, r = s.r, seg = Math.max(8, Math.round(s.seg ?? Math.min(30, 10 + r * 0.09))), rows = Math.max(5, Math.round(s.rows ?? Math.min(10, 5 + h / 10)));
    const flare = s.flare ?? 0.22, sq = Math.sqrt(s.squash ?? 1), turn = s.turn ?? 0, green = (s.green ?? 0.8) * 0.7, tone = s.tone ?? 0;
    const f1 = R() * TAU, f2 = R() * TAU, W = seg + 1, base = this.pos.length / 3;
    const ys: number[] = [y0];
    for (let a = 1; a <= rows; a++) ys.push(h * (1 - Math.pow(1 - (a - 1) / (rows - 1), 1.25)));
    const rad = (th: number, y: number) => {
      const v = Math.max(0, Math.min(1, y / h)), c = Math.cos(th - turn), sn = Math.sin(th - turn);
      return (r * Math.pow(Math.max(0, Math.cos(v * Math.PI * 0.5)), 0.72) * (1 + 0.5 * flare * (1 - v)) * (1 + 0.07 * Math.sin(3 * th + f1) + 0.05 * Math.sin(5 * th + f2))) / Math.sqrt((c * c) / (sq * sq) + sn * sn * sq * sq);
    };
    const P = new Float32Array(ys.length * W * 3);
    for (let a = 0; a < ys.length; a++) for (let b = 0; b <= seg; b++) { const th = ((b % seg) / seg) * TAU, rr = rad(th, ys[a]), i = (a * W + b) * 3; P[i] = s.x + Math.cos(th) * rr; P[i + 1] = ys[a]; P[i + 2] = s.z + Math.sin(th) * rr; }
    for (let a = 0; a < ys.length; a++) for (let b = 0; b <= seg; b++) {
      const bb = b % seg, i = (a * W + b) * 3, l = (a * W + ((bb + seg - 1) % seg)) * 3, rg = (a * W + ((bb + 1) % seg)) * 3, up = (Math.min(ys.length - 1, a + 1) * W + bb) * 3, dn = (Math.max(0, a - 1) * W + bb) * 3;
      const ux = P[rg] - P[l], uy = P[rg + 1] - P[l + 1], uz = P[rg + 2] - P[l + 2], vx = P[up] - P[dn], vy = P[up + 1] - P[dn + 1], vz = P[up + 2] - P[dn + 2];
      let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux, ln = Math.hypot(nx, ny, nz);
      if (ln < 1e-6 || a === ys.length - 1) { nx = 0; ny = 1; nz = 0; ln = 1; }
      nx /= ln; ny /= ln; nz /= ln;
      const y = P[i + 1];
      this.pos.push(P[i], y, P[i + 2]); this.nor.push(nx, ny, nz); this.uv.push(0.5, y);
      this.ink.push(Math.max(0, 0.5 * Math.pow(Math.max(0, 1 - (h - y) / Math.max(10, h * 0.7)), 1.5) + 0.1 * (hash(a + s.seed, bb) - 0.5)));
      const t = this.tint(tone - 0.45 * smooth(Math.min(h * 0.5, 50), 0, y), green * smooth(0.5, 0.86, ny));
      this.col.push(t[0], t[1], t[2]);
    }
    for (let a = 0; a < ys.length - 1; a++) for (let b = 0; b < seg; b++) { const i0 = base + a * W + b, i1 = i0 + 1, j0 = i0 + W, j1 = j0 + 1; this.idx.push(i0, j0, j1, i0, j1, i1); }
    for (let k = 0, n = Math.round(4 + r * 0.06); k < n; k++) { const th = R() * TAU, v = 0.2 + 0.6 * R(), rr = rad(th, v * h); this.anchors.push({ x: s.x + Math.cos(th) * rr, y: v * h, z: s.z + Math.sin(th) * rr, nx: Math.cos(th), nz: Math.sin(th), kind: 'foot', r, h }); }
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aInk', new THREE.Float32BufferAttribute(this.ink, 1));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

export interface PeakOpts {
  seed: number;
  /** 旁边再攒几根矮些的柱、几根细的石笋 */ sides?: number; spires?: number;
  /** 柱脚的土石堆 */ talus?: boolean;
  /** 主柱的样子（其余的照着变） */ main?: Partial<Shaft>;
  /** 矮柱离主柱多远（半径的几倍）、主要往哪个方向攒（弧度；不给就四面都有） */ spread?: number; toward?: number;
}
/**
 * 一座峰：一根主柱，四围攒着几根——一根粗的「肩」，几根细的，再有一两根更细的石笋；
 * 粗细悬殊，矮的朝外略歪；脚下一堆土石。
 */
export function peak(c: Crag, x: number, z: number, h: number, r: number, o: PeakOpts): void {
  const R = mulberry32(o.seed * 104729 + 7), n = (o.sides ?? 3) + 1, sp = o.spread ?? 1;
  const m = o.main ?? {};
  const rm = r * (0.38 + 0.1 * R());
  c.shaft({ x, z, h, r: rm, seed: o.seed, squash: 1.15 + 0.45 * R(), turn: R() * Math.PI, lean: [(R() - 0.5) * 0.04, (R() - 0.5) * 0.04], ...m });
  const a0 = R() * TAU;
  for (let i = 0; i < n; i++) {
    const a = o.toward !== undefined ? o.toward + (i - (n - 1) / 2) * (2.2 / Math.max(1, n - 1)) + (R() - 0.5) * 0.5 : a0 + (i / n) * TAU + (R() - 0.5) * 0.9;
    // 头一根是粗的肩，其余细
    const rr = r * (i === 0 ? 0.28 + 0.1 * R() : i === 1 ? 0.18 + 0.1 * R() : 0.09 + 0.14 * R()), hh = h * (i === 0 ? 0.6 + 0.22 * R() : 0.32 + 0.45 * R());
    const d = (rm + rr) * (0.7 + 0.35 * R()) * sp, lk = (rr < r * 0.2 ? 0.03 : 0.01) + 0.025 * R();
    c.shaft({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, h: hh, r: rr, seed: o.seed * 31 + i, squash: 1 + 0.55 * R(), turn: R() * Math.PI, lean: [Math.cos(a) * lk, Math.sin(a) * lk], ribs: m.ribs, green: m.green, tone: m.tone, fade: m.fade, warm: m.warm });
  }
  for (let i = 0; i < (o.spires ?? 1); i++) {
    const a = R() * TAU, d = (rm + r * 0.3) * (0.9 + 0.4 * R()) * sp, lk = 0.02 + 0.04 * R();
    c.shaft({ x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, h: h * (0.28 + 0.34 * R()), r: r * (0.07 + 0.07 * R()), seed: o.seed * 53 + i, crownStyle: R() < 0.55 ? 'sharp' : 'dome', ribs: 0.7, flare: 0.45, lean: [Math.cos(a) * lk, Math.sin(a) * lk], green: m.green, tone: m.tone, fade: m.fade, warm: m.warm });
  }
  if (o.talus !== false) {
    c.shaft({ x: x + (R() - 0.5) * r * 0.3, z: z + (R() - 0.5) * r * 0.3, h: h * (0.14 + 0.07 * R()), r: r * (1.25 + 0.3 * R()), seed: o.seed * 71, mound: true, squash: 1.2 + 0.4 * R(), turn: R() * Math.PI, green: m.green ?? 0.8, tone: m.tone });
  }
}
