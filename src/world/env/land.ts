/**
 * 地与水：人脚下的这一方。
 *
 * 地是一张淡淡染过的纸：路与院子是不染的土色，草地是一层极淡的汁绿（疏密不匀），田按庄稼与时令上色，
 * 水边潮、色深；树下、屋脚、石根各压一圈淡墨（东西才「落」在地上——这里没有影子）；春天桃树底下是落红。
 * 颜料全写在顶点色里（材质的颜料是纯白），换季时只重算颜色。
 *
 * 近处一张细网（溪床、田埂要分明），外面套一张粗网接到远景的平畴上；两张网各自在接缝处往下沉一点，互相盖住。
 * 溪、池是画在勾完线之后的水（env/water.ts），自己按水深淡出岸边。石头沿溪散着（位置在 site.ts 的 ROCKS）。
 */
import * as THREE from 'three';
import type { Quality } from '../core/World';
import { PIG, wash, type RGB } from '../ink/ink';
import { Builder, M, V, grid, rockGeo } from '../core/geo';
import { fbm, smooth } from '../core/rng';
import { PLOTS, ROCKS, SITE, STREAM, TREES, YARD_Y, ground, pathDist, plotAt, rectDist, streamAt, type Crop } from '../site';
import type { Season } from './atmos';
import { ripple, waterMat, waterMesh } from './water';

export interface Land {
  group: THREE.Group;
  setSeason(s: Season): void;
  /** 在水面上起一圈涟漪（溪或池，看落在哪里） */
  ripple(x: number, z: number, size?: number): void;
  /** 画出来的地面在这一点有多高（与网格一模一样：行走用它，脚才正好踩在地上） */
  height(x: number, z: number): number;
}

/** 近处细网的范围；外面粗网的范围 */
const IN = { x0: -202, x1: 168, z0: -62, z1: 152 }, OUT = { x0: -258, x1: 268, z0: -138, z1: 328 };

const pw = (p: RGB, d: number): RGB => [Math.pow(p[0], d), Math.pow(p[1], d), Math.pow(p[2], d)];
/** 每个季节：草色与浓淡、土色、各样庄稼地的底色（颜料, 浓度） */
const TONE: Record<Season, { grass: RGB; grassD: number; earth: RGB; crop: Record<Crop, [RGB, number]> }> = {
  spring: { grass: [0.82, 0.875, 0.71], grassD: 0.85, earth: [0.93, 0.89, 0.8], crop: { wheat: [[0.76, 0.86, 0.64], 0.9], rape: [[0.9, 0.9, 0.62], 0.7], plough: [[0.8, 0.7, 0.6], 1.3], veg: [[0.78, 0.85, 0.66], 0.8], bean: [[0.8, 0.86, 0.68], 0.7], fallow: [[0.86, 0.87, 0.72], 0.6] } },
  summer: { grass: [0.75, 0.84, 0.65], grassD: 1.0, earth: [0.92, 0.88, 0.79], crop: { wheat: [[0.94, 0.86, 0.6], 0.9], rape: [[0.8, 0.85, 0.66], 0.7], plough: [[0.78, 0.84, 0.64], 0.8], veg: [[0.74, 0.84, 0.62], 0.9], bean: [[0.74, 0.84, 0.62], 0.9], fallow: [[0.8, 0.85, 0.66], 0.8] } },
  autumn: { grass: [0.89, 0.85, 0.66], grassD: 0.9, earth: [0.93, 0.88, 0.78], crop: { wheat: [[0.86, 0.78, 0.66], 0.9], rape: [[0.84, 0.76, 0.64], 0.9], plough: [[0.95, 0.86, 0.6], 0.9], veg: [[0.78, 0.85, 0.66], 0.8], bean: [[0.9, 0.82, 0.62], 0.8], fallow: [[0.9, 0.84, 0.68], 0.7] } },
  winter: { grass: [0.91, 0.89, 0.8], grassD: 0.6, earth: [0.93, 0.9, 0.83], crop: { wheat: [[0.84, 0.87, 0.72], 0.6], rape: [[0.86, 0.87, 0.76], 0.5], plough: [[0.84, 0.76, 0.68], 0.9], veg: [[0.86, 0.86, 0.76], 0.5], bean: [[0.88, 0.84, 0.74], 0.6], fallow: [[0.9, 0.87, 0.78], 0.5] } },
};

/** 一张网：格点上的高度与几样「这里是什么」的量（上色用），以及按 grid() 展开顺序排的格点号 */
interface Sheet { geo: THREE.BufferGeometry; n: number; order: Uint32Array; hs: Float32Array; x0: number; z0: number; dx: number; dz: number; nx: number; nz: number; grass: Float32Array; bare: Float32Array; plot: Int8Array; wet: Float32Array; bed: Float32Array; foot: Float32Array; petal: Float32Array; soil: Float32Array; noise: Float32Array; far: Float32Array }

export function createLand(q: Quality, season: Season): Land {
  const group = new THREE.Group();
  group.name = 'land';
  // 树、屋、石各在哪：给「压一圈淡墨」用（按 6 米一格分桶）
  const cell = 6, bucket = new Map<number, Array<[number, number, number, number]>>();
  const put = (x: number, z: number, r: number, k: number) => { const key = Math.floor(x / cell) * 4096 + Math.floor(z / cell); let a = bucket.get(key); if (!a) bucket.set(key, (a = [])); a.push([x, z, r, k]); };
  for (const t of TREES) if (t.kind !== 'bamboo') put(t.x, t.z, (t.kind === 'elm' ? 5 : t.kind === 'peach' ? 2.6 : 3.2) * t.s, t.kind === 'peach' ? 2 : 1); else put(t.x, t.z, 2.6, 1);
  for (const r of ROCKS) put(r.x, r.z, r.r * 2.2, 1);
  const boxes: Array<{ x0: number; x1: number; z0: number; z1: number }> = [];
  const H = SITE.hall, G = SITE.wing;
  boxes.push({ x0: H.x - H.w / 2, x1: H.x + H.w / 2, z0: H.z - H.d / 2, z1: H.z + H.d / 2 }, { x0: G.x - G.w / 2, x1: G.x + G.w / 2, z0: G.z - G.d / 2, z1: G.z + G.d / 2 });
  for (const h of SITE.houses) boxes.push({ x0: h.x - h.w / 2, x1: h.x + h.w / 2, z0: h.z - h.d / 2, z1: h.z + h.d / 2 });

  const sheet = (x0: number, x1: number, z0: number, z1: number, step: number, inner: boolean): Sheet => {
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step), n = (nx + 1) * (nz + 1);
    const pts: THREE.Vector3[][] = [], hs = new Float32Array(n);
    const S: Omit<Sheet, 'geo' | 'order'> = { n, hs, x0, z0, dx: (x1 - x0) / nx, dz: (z1 - z0) / nz, nx, nz, grass: new Float32Array(n), bare: new Float32Array(n), plot: new Int8Array(n).fill(-1), wet: new Float32Array(n), bed: new Float32Array(n), foot: new Float32Array(n), petal: new Float32Array(n), soil: new Float32Array(n), noise: new Float32Array(n), far: new Float32Array(n) };
    for (let i = 0; i <= nx; i++) {
      pts.push([]);
      for (let j = 0; j <= nz; j++) {
        const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz, k = i * (nz + 1) + j;
        let y = ground(x, z);
        const edgeIn = Math.min(x - IN.x0, IN.x1 - x, z - IN.z0, IN.z1 - z);
        if (inner) y -= 0.55 * smooth(7, 0, edgeIn);                                   // 细网的边往下沉，钻到粗网底下
        else {
          y -= 0.45 * smooth(-6, 2, edgeIn);                                         // 粗网在细网底下低一点（藏在下面），出了细网六米就回到真的地势
          const eo = Math.min(x - OUT.x0, OUT.x1 - x, z - OUT.z0, OUT.z1 - z);
          y = y * smooth(0, 34, eo) - 1.05 * smooth(34, 0, eo);                        // 外缘落到平畴的高度
          S.far[k] = smooth(40, 0, eo);
        }
        pts[i].push(V(x, y, z)); hs[k] = y;
        // —— 这里是什么 ——
        const st = streamAt(x, z), n1 = fbm(x * 0.06, z * 0.06, 3, 9), n2 = fbm(x * 0.25 + 9, z * 0.25, 2, 4), n3 = fbm(x * 0.017 + 4, z * 0.017, 2, 21);
        const pd = pathDist(x, z), yard = rectDist(SITE.yard, x, z), pl = plotAt(x, z);
        const bare = Math.max(smooth(0.5, -0.15, pd), smooth(0.8, -0.4, yard) * (z > -5.2 ? 1 : 0.4));
        const dw = st.d - st.w, P = SITE.pond, pe = Math.hypot((x - P.x) / P.rx, (z - P.z) / P.rz);
        const wetS = smooth(2.6, 0.2, dw) * smooth(st.y + 0.9, st.y + 0.1, y), wetP = smooth(1.35, 1.0, pe) * smooth(P.y + 0.8, P.y + 0.05, y);
        S.wet[k] = Math.max(wetS, wetP);
        S.bed[k] = Math.max(smooth(st.y + 0.05, st.y - 0.7, y) * (dw < 2 ? 1 : 0), pe < 1.1 ? smooth(P.y + 0.05, P.y - 0.9, y) : 0, smooth(-0.6, -1.6, y));
        S.bare[k] = bare;
        S.grass[k] = (0.25 + (0.75 * smooth(0.34, 0.62, n1) + 0.25 * n2) * (0.35 + 0.65 * smooth(0.25, 0.7, n3)) + 0.35 * smooth(6, 1.5, dw)) * (1 - bare) * (pl ? 0 : 1);
        S.noise[k] = n2;
        if (pl) { S.plot[k] = PLOTS.indexOf(pl); S.soil[k] = smooth(0, 1.1, -rectDist(pl, x, z)); }
        const M0 = SITE.mums; if (x > M0.x0 && x < M0.x1 && z > M0.z0 && z < M0.z1) { S.soil[k] = 1; S.plot[k] = -2; }
        const V0 = SITE.veg; if (x > V0.x0 && x < V0.x1 && z > V0.z0 && z < V0.z1) { S.soil[k] = 0.8; S.plot[k] = -2; }
        // 树下、石根、屋脚
        let foot = 0, petal = 0;
        const bx = Math.floor(x / cell), bz = Math.floor(z / cell);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const [tx, tz, tr, tk] of bucket.get((bx + a) * 4096 + bz + b) ?? []) {
          const d = Math.hypot(x - tx, z - tz);
          if (d < tr) { foot = Math.max(foot, smooth(tr, tr * 0.25, d) * 0.8); if (tk === 2) petal = Math.max(petal, smooth(tr * 1.5, tr * 0.3, d)); }
          else if (tk === 2 && d < tr * 1.5) petal = Math.max(petal, smooth(tr * 1.5, tr * 0.3, d));
        }
        for (const bxs of boxes) { const d = rectDist(bxs, x, z); if (d < 1.8) foot = Math.max(foot, smooth(1.8, 0, d) * 0.7); }
        S.foot[k] = foot; S.petal[k] = petal;
      }
    }
    const geo = grid(pts, (_i, _j, p) => [p.x, p.z], true);
    // grid() 把每格按 a,c,b,a,d,c 展开（flip）：照同样的次序记下格点号
    const order = new Uint32Array(nx * nz * 6);
    let o = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a = i * (nz + 1) + j, b = (i + 1) * (nz + 1) + j, c = (i + 1) * (nz + 1) + j + 1, d = i * (nz + 1) + j + 1; order.set([a, c, b, a, d, c], o); o += 6; }
    return { geo, order, ...S };
  };
  const step = q.tier === 'high' ? 1.25 : q.tier === 'mid' ? 1.6 : 2.1;
  const sheets = [sheet(IN.x0, IN.x1, IN.z0, IN.z1, step, true), sheet(OUT.x0, OUT.x1, OUT.z0, OUT.z1, q.tier === 'low' ? 6 : 4, false)];
  const mat = wash({ pig: [1, 1, 1], dens: 1, shade: 1.22, grain: 0.3, cun: 0.7, line: 0.42, streak: [0.4, 1.5, 0.09] });
  for (const s of sheets) { const m = new THREE.Mesh(s.geo, mat); m.name = 'ground'; group.add(m); }

  const paint = (se: Season) => {
    const T = TONE[se], bedC = pw(PIG.mo, 0.75);
    for (const s of sheets) {
      const col = new Float32Array(s.n * 3);
      for (let k = 0; k < s.n; k++) {
        const nz = s.noise[k];
        // 土：路与院子淡，别处略深一点；草：一层极淡的绿
        let c = pw(T.earth, 0.28 + 0.3 * s.bare[k] * (0.6 + 0.6 * nz) + 0.22 * nz);
        const g = pw(T.grass, s.grass[k] * T.grassD * 0.95);
        c = [c[0] * g[0], c[1] * g[1], c[2] * g[2]];
        const pi = s.plot[k];
        if (pi >= 0) { const [cp, cd] = T.crop[PLOTS[pi].crop]; const f = pw(cp, cd * s.soil[k] * (0.75 + 0.5 * nz)); c = [c[0] * f[0], c[1] * f[1], c[2] * f[2]]; }
        else if (pi === -2) { const f = pw([0.82, 0.74, 0.64], 0.9 * s.soil[k]); c = [c[0] * f[0], c[1] * f[1], c[2] * f[2]]; }
        // 水边潮；水底深
        const w = pw(PIG.mo, s.wet[k] * 0.75 + s.foot[k] * 0.24 + 0.08 * nz);
        c = [c[0] * w[0], c[1] * w[1], c[2] * w[2]];
        if (s.bed[k] > 0) c = [c[0] + (c[0] * bedC[0] - c[0]) * s.bed[k], c[1] + (c[1] * bedC[1] - c[1]) * s.bed[k], c[2] + (c[2] * bedC[2] - c[2]) * s.bed[k]];
        // 春天桃树底下的落红
        if (se === 'spring' && s.petal[k] > 0) { const f = pw([0.99, 0.9, 0.91], s.petal[k] * (0.4 + 0.8 * nz)); c = [c[0] * f[0], c[1] * f[1], c[2] * f[2]]; }
        // 外缘淡到平畴的颜色
        if (s.far[k] > 0) { const f = s.far[k], p = pw([0.78, 0.83, 0.72], 0.75); c = [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f, c[2] + (p[2] - c[2]) * f]; }
        col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      }
      const attr = s.geo.attributes.color as THREE.BufferAttribute, a = attr.array as Float32Array;
      for (let i = 0; i < s.order.length; i++) { const k = s.order[i] * 3; a[i * 3] = col[k]; a[i * 3 + 1] = col[k + 1]; a[i * 3 + 2] = col[k + 2]; }
      attr.needsUpdate = true;
    }
  };
  paint(season);

  // —— 石 ——
  const stone = wash({ pig: [0.66, 0.67, 0.68], dens: 0.5, shade: 2.3, cun: 1.0, grain: 1.1, crack: [0.9, 0.45] });
  const rb = new Builder();
  for (const r of ROCKS) {
    const h = r.r * (0.55 + 0.4 * ((r.seed * 0.618) % 1)), y = ground(r.x, r.z);
    rb.add('stone', rockGeo(r.seed, r.r * (0.9 + 0.5 * ((r.seed * 0.37) % 1)), h, r.r).applyMatrix4(M.mul(M.t(r.x, y - h * 0.22, r.z), M.ry(r.seed * 1.7))));
  }
  const rocks = rb.build({ stone }, { name: 'rocks' });
  group.add(rocks);

  // —— 水：溪是一条顺着中线铺的带子（两边比水面宽，由水深自己淡出岸来），池是一张椭圆 ——
  const sp: THREE.Vector3[][] = [];
  for (const p of STREAM) {
    const i = STREAM.indexOf(p), a = STREAM[Math.max(0, i - 1)], b = STREAM[Math.min(STREAM.length - 1, i + 1)], nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz) || 1, w = p.w + 3.2;
    sp.push([-1, -0.5, 0, 0.5, 1].map((t) => V(p.x + (nx / l) * w * t, p.y, p.z + (nz / l) * w * t)));
  }
  const streamM = waterMat({ dens: 0.5, flow: 0.42, ripple: 1, deep: 0.65 });
  const sg = grid(sp, (i, j) => [(j / 4 - 0.5) * 2 * (STREAM[i].w + 3.2), STREAM[i].s], true);
  group.add(waterMesh(sg, streamM));
  const P = SITE.pond, pondM = waterMat({ dens: 0.6, flow: 0.02, ripple: 0.45, deep: 0.8 });
  const pg = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2).scale(P.rx * 1.25, 1, P.rz * 1.25).translate(P.x, P.y, P.z);
  const puv = pg.attributes.uv as THREE.BufferAttribute, pp = pg.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < puv.count; i++) puv.setXY(i, pp.getX(i), pp.getZ(i));
  group.add(waterMesh(pg, pondM));

  /** 一张网在 (x, z) 处的高度：照着三角形的分法（每格沿 a–c 对角线分成两片）线性地取 */
  const on = (s: Sheet, x: number, z: number): number | null => {
    const gx = (x - s.x0) / s.dx, gz = (z - s.z0) / s.dz;
    if (gx < 0 || gz < 0 || gx > s.nx || gz > s.nz) return null;
    const i = Math.min(s.nx - 1, Math.floor(gx)), j = Math.min(s.nz - 1, Math.floor(gz)), fx = gx - i, fz = gz - j, w = s.nz + 1;
    const a = s.hs[i * w + j], b = s.hs[(i + 1) * w + j], c = s.hs[(i + 1) * w + j + 1], d = s.hs[i * w + j + 1];
    return fx >= fz ? a + (b - a) * fx + (c - b) * fz : a + (d - a) * fz + (c - d) * fx;
  };
  return {
    group,
    height(x, z) { const a = on(sheets[0], x, z), b = on(sheets[1], x, z); return a == null ? b ?? ground(x, z) : b == null ? a : Math.max(a, b); },
    setSeason: paint,
    ripple(x, z, size = 1) {
      const inPond = Math.hypot((x - P.x) / P.rx, (z - P.z) / P.rz) < 1.15;
      ripple(inPond ? pondM : streamM, x, z, size);
    },
  };
}
/** 院子的高度（给别处用） */
export { YARD_Y };
