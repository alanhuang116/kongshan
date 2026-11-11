/**
 * 零碎的几件：
 *   broom —— 竹扫帚；
 *   banner —— 殿里从梁上垂下的幡（整幅一块网格，随风轻摆）；
 *   wishRibbon / wishRibbonGeo —— 祈愿带（可实例化上百条）；
 *   plaque / couplet —— 匾与楹联（字是凸起的金字）。
 */
import * as THREE from 'three';
import { M, V, box, grid, merge, shade, tint } from '../core/geo';
import { enhance, type Mats } from '../core/mats';
import { canvas, canvasTex } from '../core/tex';
import { clamp, mulberry32 } from '../core/rng';
import type { Quality } from '../core/World';
import { slab } from './furniture';
import { Builder, blob, curve3, finish, isLow, type P2, part, pmats, prof, ring, sg, spl, table, tube, turn, withSway } from './kit';

const LIN = (hex: number) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b] as [number, number, number]; };

/** 竹扫帚：竹竿 1.45，下端扎一把细竹枝。原点在竹枝着地处的中心，竿向后（−z）斜上去 */
export function broom(mats: Mats, q: Quality): THREE.Group {
  const b = new Builder(), r = mulberry32(606), tilt = 0.5;
  const d = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt)), P0 = d.clone().multiplyScalar(0.5);
  // 竿：有节
  const pr: P2[] = [[0.001, -0.14]];
  const rad = (y: number) => 0.0125 - 0.0022 * (y / 1.31);
  for (let y = -0.14; y < 1.31; y += 0.21) {
    pr.push([rad(y), y + 0.004], [rad(y), y + 0.19], [rad(y) + 0.0014, y + 0.198], [rad(y) + 0.0014, y + 0.204], [rad(y + 0.21), y + 0.21]);
  }
  pr.push([0.001, 1.325]);
  const q0 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const mPole = new THREE.Matrix4().compose(P0, q0, new THREE.Vector3(1, 1, 1));
  b.add('bamboo', turn(pr, sg(q, 12)).applyMatrix4(mPole));
  // 竹枝：从扎口往下散成一把扇面，梢着地
  const n = isLow(q) ? 40 : 96, tw: THREE.BufferGeometry[] = [];
  const bez = (a: THREE.Vector3, c1: THREE.Vector3, c2: THREE.Vector3, e: THREE.Vector3, k: number) => {
    const o: THREE.Vector3[] = [];
    for (let i = 0; i <= k; i++) { const t = i / k, u = 1 - t; o.push(V(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(c1, 3 * u * u * t).addScaledVector(c2, 3 * u * t * t).addScaledVector(e, t * t * t)); }
    return o;
  };
  for (let i = 0; i < n; i++) {
    // 梢的落点：一个横着的扇面，中间密、两边稀
    const u = (r() + r() + r()) / 1.5 - 1, v = r() * 2 - 1, short = r() < 0.25 ? 0.72 + 0.2 * r() : 1;
    const tip = V(u * 0.3 * (1 - 0.2 * v * v), 0.003 + 0.03 * r() * r(), v * 0.085 + 0.02 + 0.06 * (1 - u * u));
    const st = P0.clone().add(V(u * 0.02, (r() - 0.5) * 0.06, v * 0.016)).addScaledVector(d, 0.03 * r());
    if (short < 1) tip.lerp(st, 1 - short);
    const bend = 0.02 + 0.05 * r();
    const m1 = st.clone().lerp(tip, 0.33).add(V(u * 0.02, bend * 0.6, 0.012 * v)), m2 = st.clone().lerp(tip, 0.7).add(V(u * 0.03 + (r() - 0.5) * 0.02, bend * 0.5, 0.02 * v));
    const r0 = 0.0022 + 0.0022 * r() * r(), k = 0.52 + 0.3 * r();
    tw.push(tint(tube(bez(st, m1, m2, tip, 4), (t) => r0 * (1 - 0.78 * t), 3), k * 1.15, k * 0.92, k * 0.62));
    // 细的侧枝：从中段岔出去
    const forks = i % 3 === 0 ? 2 : 1;
    for (let f = 0; f < forks; f++) {
      const a = m1.clone().lerp(tip, 0.25 + 0.5 * r()), e = a.clone().add(V((r() - 0.5) * 0.11, -0.05 - 0.09 * r(), (r() - 0.5) * 0.07));
      e.y = Math.max(0.003, e.y);
      tw.push(tint(tube([a, a.clone().lerp(e, 0.5).add(V(0, 0.01, 0)), e], (t) => 0.0013 * (1 - 0.6 * t), 3), k, k * 0.8, k * 0.55));
    }
  }
  b.add('bamboo', shade(merge(tw), (_x, y) => 0.75 + 0.4 * clamp(y / 0.4)));
  // 扎口：两道篾箍
  for (const k of [-0.035, -0.005, 0.03, 0.075]) {
    const c = P0.clone().addScaledVector(d, k), w = k < 0.02 ? 1.45 : 1.15;
    b.add('rope', ring(0.027 - Math.max(0, k) * 0.12, 0.0042, 14, 6).scale(w, 1, 1).applyMatrix4(new THREE.Matrix4().compose(c, q0, new THREE.Vector3(1, 1, 1))));
  }
  const g = finish(b, mats, q, 'broom');
  g.userData = { grip: P0.clone().addScaledVector(d, 0.86), top: P0.clone().addScaledVector(d, 1.325), dir: d.clone() };
  return g;
}

// —— 幡 ——
const bannerM = new WeakMap<Mats, THREE.MeshStandardMaterial>();
function swayCloth(mats: Mats, wind: number, cache: WeakMap<Mats, THREE.MeshStandardMaterial>, p: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  let m = cache.get(mats);
  if (!m) {
    m = mats.clothGrey.clone();
    m.setValues({ color: 0xffffff, side: THREE.DoubleSide, ...p });
    m.userData = { enhance: { wind } };
    enhance(m, { wind });
    cache.set(mats, m);
  }
  return m;
}
const TONES: Array<{ main: number; alt: number; band: number }> = [
  { main: 0xb07c33, alt: 0x7a231b, band: 0xd2ae58 },
  { main: 0x7a231b, alt: 0xb07c33, band: 0xd2ae58 },
  { main: 0x2d4b57, alt: 0xb07c33, band: 0xc9b37a },
];
/** 幡：长 len、宽 0.42。原点在上端的悬挂点。tone：0 赭黄、1 暗红、2 青。整幅一块网格，布随风摆（上端不动、下端最大） */
export function banner(mats: Mats, q: Quality, len = 3.2, tone = 0): THREE.Group {
  const c = TONES[tone % 3], W = 0.42, yTop = -0.1, tail = len * 0.3, yBody = -(len - tail), gs: THREE.BufferGeometry[] = [];
  const strip = (x0: number, x1: number, y0: number, y1: number, col: number, zo = 0, nx = 2, pointed = false) => {
    const ny = Math.max(2, Math.round(Math.abs(y1 - y0) / (isLow(q) ? 0.3 : 0.14))), rows: THREE.Vector3[][] = [];
    for (let i = 0; i <= nx; i++) {
      const row: THREE.Vector3[] = [], x = x0 + ((x1 - x0) * i) / nx;
      for (let j = 0; j <= ny; j++) {
        const t = j / ny;
        let y = y0 + (y1 - y0) * t;
        if (pointed && j === ny) y += Math.abs(i / nx - 0.5) * 2 * (x1 - x0) * 0.7;
        row.push(V(x, y, zo + 0.012 * Math.sin(y * 2.6 + x * 3) * clamp(-y / 1.2) + 0.006 * Math.sin(x * 14 + y * 1.3) * clamp(-y / 0.6)));
      }
      rows.push(row);
    }
    const k = LIN(col);
    return tint(grid(rows, (_i, _j, p) => [p.x, p.y]), k[0], k[1], k[2]);
  };
  // 幡身，隔一段一道织金的横带
  gs.push(strip(-W / 2, W / 2, yTop - 0.012, yBody, c.main, 0, 4));
  gs.push(strip(-W / 2, W / 2, yTop - 0.012, yTop - 0.1, c.band, 0.002, 4));
  const nb = Math.max(1, Math.round((-yBody - 0.4) / 0.72));
  for (let i = 1; i <= nb; i++) { const y = yTop - 0.1 + ((yBody - yTop + 0.1) * i) / (nb + 0.0001); gs.push(strip(-W / 2, W / 2, y + 0.022, y - 0.022, c.band, 0.002, 4)); }
  // 幡手：两侧各一条窄带
  for (const s of [-1, 1]) gs.push(strip(s * (W / 2 + 0.025), s * (W / 2 + 0.085), yTop - 0.012, yTop - len * 0.36, c.alt, -0.003, 1, true));
  // 幡足：三条，末端削尖，各坠一粒小坠子
  const fw = (W - 0.04) / 3;
  for (let i = 0; i < 3; i++) {
    const x0 = -W / 2 + i * (fw + 0.02);
    gs.push(strip(x0, x0 + fw, yBody, -len + 0.05, i === 1 ? c.alt : c.main, 0, 2, true));
    const k = LIN(0x8a6a2c);
    gs.push(tint(blob(6, 5, (v) => { v.set(v.x * 0.012, v.y * 0.02 - len + 0.035, v.z * 0.012); v.x += x0 + fw / 2; }), k[0], k[1], k[2]));
  }
  // 木轴与挂绳（不动）
  const wood = LIN(0x4a2018), cord = LIN(0x7a6a4a);
  gs.push(tint(turn(prof([[0.001, -0.3], [0.012, -0.296], [0.016, -0.285], [0.011, -0.272]], [[0.011, -0.272], [0.011, 0.272]], [[0.011, 0.272], [0.016, 0.285], [0.012, 0.296], [0.001, 0.3]]), sg(q, 10)).rotateZ(Math.PI / 2).translate(0, yTop, 0), wood[0], wood[1], wood[2]));
  for (const s of [-1, 1]) gs.push(tint(tube([V(s * 0.25, yTop + 0.008, 0), V(0, 0, 0)], 0.003, 4), cord[0], cord[1], cord[2]));
  const g = withSway(merge(gs), (_x, y) => Math.pow(clamp((-y + yTop - 0.02) / (len + yTop - 0.02)), 1.25));
  const mesh = part(g, swayCloth(mats, 0.25, bannerM), 'bannerMesh');
  const grp = new THREE.Group();
  grp.name = 'banner';
  grp.add(mesh);
  grp.userData = { len, width: W };
  return grp;
}

// —— 祈愿带 ——
const ribbonM = new WeakMap<Mats, THREE.MeshStandardMaterial>();
let ribbonG: THREE.BufferGeometry | null = null;
/** 祈愿带的几何与材质（给 InstancedMesh 用）：一条对折系着的红绸，两头垂下。原点在系结处。36 个三角 */
export function wishRibbonGeo(mats: Mats, q?: Quality): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } {
  void q;
  if (!ribbonG) {
    const w = 0.015, gs: THREE.BufferGeometry[] = [];
    const tailG = (L: number, lean: number, zo: number) => {
      const rows: THREE.Vector3[][] = [[], []];
      for (let j = 0; j <= 5; j++) {
        const t = j / 5, x = lean * t * t * L + (j === 5 ? lean * 0.01 : 0), y = -t * L, z = zo + 0.012 * Math.sin(t * 3.2) * t;
        rows[0].push(V(x - w, y - (j === 5 ? 0.012 : 0), z)); rows[1].push(V(x + w, y, z));
      }
      return grid(rows, (i, j) => [i * 0.035, j * 0.06]);
    };
    gs.push(tailG(0.33, 0.07, 0.004), tailG(0.26, -0.09, -0.004));
    // 套在枝上的一圈
    const lp: THREE.Vector3[][] = [[], []];
    for (let j = 0; j <= 4; j++) { const a = (j / 4) * Math.PI * 2 * 0.86 + 0.44; lp[0].push(V(-w * 0.8, 0.022 - Math.cos(a) * 0.022, Math.sin(a) * 0.02)); lp[1].push(V(w * 0.8, 0.022 - Math.cos(a) * 0.022, Math.sin(a) * 0.02)); }
    gs.push(grid(lp, (i, j) => [i * 0.03, j * 0.03]));
    gs.push(box(0.03, 0.012, 0.014, 'x').translate(0, -0.002, 0));
    ribbonG = withSway(merge(gs), (_x, y) => Math.pow(clamp(-y / 0.33), 1.2));
  }
  return { geometry: ribbonG, material: swayCloth(mats, 0.7, ribbonM, { color: 0x9c231a, roughness: 0.58, map: null, normalMap: null }) };
}
export function wishRibbon(mats: Mats, q: Quality): THREE.Group {
  const { geometry, material } = wishRibbonGeo(mats, q), g = new THREE.Group();
  g.name = 'wishRibbon';
  g.add(part(geometry, material, 'wishRibbonMesh'));
  return g;
}

// —— 匾与联 ——
export interface PlaqueOpts {
  /** 每个字占多大（米）。匾默认 0.62，联默认 0.3 */
  size?: number;
  /** 底色：黑漆 / 石青 / 素木（素木是阴刻填绿，其余是凸起的金字） */
  style?: 'black' | 'blue' | 'wood';
  /** 横匾从右往左读（传统匾额的读法）。默认 true */
  rtl?: boolean;
  font?: string;
}
interface Board { face: THREE.MeshStandardMaterial; W: number; H: number; iw: number; ih: number; fw: number; th: number; frame: string }
function textBoard(chars: string[], cols: number, rowsN: number, cell: number, o: PlaqueOpts, vertical: boolean): Board {
  const style = o.style ?? 'black', mg = cell * 0.2, fw = Math.max(0.035, cell * 0.11), th = Math.max(0.03, cell * 0.075);
  const iw = cols * cell + mg * 2, ih = rowsN * cell + mg * 2, W = iw + fw * 2, H = ih + fw * 2;
  // 字图：先画成黑底白字，再算出颜色、粗糙 / 金属、法线三张
  const K = Math.min(330, Math.floor(1536 / Math.max(iw, ih))), cw = Math.round(iw * K), ch = Math.round(ih * K);
  const [mc, mg2] = canvas(cw, ch);
  mg2.fillStyle = '#000'; mg2.fillRect(0, 0, cw, ch);
  mg2.fillStyle = '#fff'; mg2.textAlign = 'center'; mg2.textBaseline = 'middle';
  mg2.font = `400 ${Math.round(cell * K * 0.86)}px ${o.font ?? '"Ma Shan Zheng", "LXGW WenKai", "Noto Serif SC", serif'}`;
  // 这种字体的字在字框里偏下：量出这一行字墨迹的上下界，整体挪到格子正中
  let asc = 0, desc = 0;
  for (const c of chars) { const m = mg2.measureText(c); asc = Math.max(asc, m.actualBoundingBoxAscent); desc = Math.max(desc, m.actualBoundingBoxDescent); }
  const dy = (asc - desc) / 2;
  chars.forEach((c, i) => {
    const col = vertical ? 0 : (o.rtl ?? true) ? cols - 1 - i : i, row = vertical ? i : 0;
    mg2.fillText(c, (mg + (col + 0.5) * cell) * K, (mg + (row + 0.5) * cell) * K + dy);
  });
  const src = mg2.getImageData(0, 0, cw, ch).data, n = cw * ch;
  void mc;
  const mask = new Float32Array(n), h = new Float32Array(n), tmp = new Float32Array(n);
  for (let i = 0; i < n; i++) { mask[i] = src[i * 4] / 255; h[i] = mask[i]; }
  // 把字的边抹宽一点当高度（字是鼓起来 / 刻下去的，边上是一道斜坡）
  const rad = Math.max(1, Math.round(K * cell * 0.009));
  const blur = (a: Float32Array, d: Float32Array, hor: boolean) => {
    const N = hor ? cw : ch, Mn = hor ? ch : cw;
    for (let m = 0; m < Mn; m++) {
      const at = (i: number) => a[hor ? m * cw + i : i * cw + m];
      let sum = 0;
      for (let i = 0; i <= rad && i < N; i++) sum += at(i);
      for (let i = 0; i < N; i++) {
        d[hor ? m * cw + i : i * cw + m] = sum / (Math.min(N - 1, i + rad) - Math.max(0, i - rad) + 1);
        if (i + rad + 1 < N) sum += at(i + rad + 1);
        if (i - rad >= 0) sum -= at(i - rad);
      }
    }
  };
  for (let pass = 0; pass < 2; pass++) { blur(h, tmp, true); blur(tmp, h, false); }
  const [c1, g1] = canvas(cw, ch), [c2, g2] = canvas(cw, ch), [c3, g3] = canvas(cw, ch);
  const d1 = g1.createImageData(cw, ch), d2 = g2.createImageData(cw, ch), d3 = g3.createImageData(cw, ch);
  const bg = style === 'black' ? [20, 17, 16] : style === 'blue' ? [26, 44, 74] : [112, 86, 60];
  const fg = style === 'wood' ? [52, 96, 74] : [224, 186, 108];
  const sgn = style === 'wood' ? -1 : 1, st = 6.5 * sgn;
  const rnd = mulberry32(chars.length * 131 + cols);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = y * cw + x, m = mask[i], k = i * 4, grain = 0.95 + 0.1 * rnd();
    d1.data[k] = (bg[0] + (fg[0] - bg[0]) * m) * grain; d1.data[k + 1] = (bg[1] + (fg[1] - bg[1]) * m) * grain; d1.data[k + 2] = (bg[2] + (fg[2] - bg[2]) * m) * grain; d1.data[k + 3] = 255;
    const rough = style === 'wood' ? 0.72 - 0.1 * m : 0.34 + 0.04 * m, metal = style === 'wood' ? 0 : m;
    d2.data[k] = 255; d2.data[k + 1] = rough * 255; d2.data[k + 2] = metal * 255; d2.data[k + 3] = 255;
    const xl = Math.max(0, x - 1), xr = Math.min(cw - 1, x + 1), yu = Math.max(0, y - 1), yd = Math.min(ch - 1, y + 1);
    const dx = (h[y * cw + xr] - h[y * cw + xl]) * st, dy = (h[yd * cw + x] - h[yu * cw + x]) * st;
    const il = 1 / Math.hypot(dx, dy, 1);
    d3.data[k] = (-dx * il * 0.5 + 0.5) * 255; d3.data[k + 1] = (dy * il * 0.5 + 0.5) * 255; d3.data[k + 2] = (il * 0.5 + 0.5) * 255; d3.data[k + 3] = 255;
  }
  g1.putImageData(d1, 0, 0); g2.putImageData(d2, 0, 0); g3.putImageData(d3, 0, 0);
  const orm = canvasTex(c2, false);
  const face = enhance(new THREE.MeshStandardMaterial({ map: canvasTex(c1), roughnessMap: orm, metalnessMap: orm, normalMap: canvasTex(c3, false), roughness: 1, metalness: 1, envMapIntensity: 1.3 }));
  return { face, W, H, iw, ih, fw, th, frame: style === 'wood' ? 'walnut' : 'lacquerRed' };
}
function boardGroup(mats: Mats, q: Quality, bd: Board, name: string): THREE.Group {
  const { face, W, H, iw, ih, fw, th, frame } = bd;
  const b = new Builder();
  // 底板（黑漆）、四边的框（朱漆）、框里一道描金的线
  b.add('lacquer', box(W - 0.01, H - 0.01, th * 0.6, 'x').translate(0, H / 2, th * 0.3));
  for (const s of [-1, 1]) {
    b.add(frame, slab(W, fw, th, th * 0.16).translate(0, s > 0 ? H : fw, th / 2));
    b.add(frame, slab(fw, H - fw * 2, th, th * 0.16).translate(s * (W / 2 - fw / 2), H - fw, th / 2));
    b.add('gilt', box(iw, fw * 0.14, 0.004, 'x').translate(0, H / 2 + s * (ih / 2 - fw * 0.07), th * 0.62));
    b.add('gilt', box(fw * 0.14, ih, 0.004, 'y').translate(s * (iw / 2 - fw * 0.07), H / 2, th * 0.62));
  }
  const g = finish(b, mats, q, name);
  const plane = part(new THREE.PlaneGeometry(iw, ih), face, name + 'Face', false);
  plane.position.set(0, H / 2, th * 0.6 + 0.0012);
  g.add(plane);
  g.userData = { face, width: W, height: H, depth: th };
  return g;
}
/** 横匾：一行字（默认从右往左）。原点在底边中点、背面贴墙（z=0），字朝 +z。调用前要保证字体已到（fontsReady） */
export function plaque(mats: Mats, q: Quality, text: string, o: PlaqueOpts = {}): THREE.Group {
  const chars = [...text], cell = o.size ?? 0.62;
  return boardGroup(mats, q, textBoard(chars, chars.length, 1, cell, o, false), 'plaque');
}
/** 楹联：一条竖板，字自上而下。原点在底边中点、背面贴柱（z=0） */
export function couplet(mats: Mats, q: Quality, text: string, o: PlaqueOpts = {}): THREE.Group {
  const chars = [...text], cell = o.size ?? 0.3;
  return boardGroup(mats, q, textBoard(chars, 1, chars.length, cell, o, true), 'couplet');
}
void M; void pmats; void table; void spl; void shade; void ring; void sg;
