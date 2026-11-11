/**
 * 灯：
 *   stoneLantern —— 石灯（唐式燃灯塔的形制：覆莲座、八角柱、仰莲托、八角灯室四面开窗、八角攒尖顶、相轮宝珠），高约 2.3。
 *                   灯室里衬的纸是单独的发光材质（全寺的石灯共用一个，主代理按夜色调亮）。
 *   lotusLamp    —— 放河灯用的纸莲灯：整盏只有一块网格、一个材质（可以直接拿去做实例化），花瓣从里往外透光。
 */
import * as THREE from 'three';
import { M, V, box, colorize, grid, merge, shade, tint } from '../core/geo';
import { enhance, variant, type Mats } from '../core/mats';
import { canvas, canvasTex } from '../core/tex';
import { clamp } from '../core/rng';
import type { Quality } from '../core/World';
import { Builder, blob, isLow, type P2, part, prof, sg, spl, table, turn } from './kit';

const lampM = new WeakMap<Mats, THREE.MeshStandardMaterial>();
/** 石灯灯室里的纸（发光）：全寺共用 */
export function lanternPaper(mats: Mats): THREE.MeshStandardMaterial {
  let m = lampM.get(mats);
  if (!m) { m = variant(mats.lampPaper, { emissiveIntensity: 0 }); lampM.set(mats, m); }
  return m;
}

/** 莲瓣：一片鼓起的瓣，尖朝 +y，贴着 z=0 的面往 +z 鼓。w 宽、l 长、t 鼓多高 */
function stonePetal(w: number, l: number, t: number, q: Quality) {
  return blob(q.tier === 'low' ? 5 : 7, q.tier === 'low' ? 4 : 5, (v) => {
    const y = v.y * 0.5 + 0.5;
    const ww = Math.sin(Math.PI * Math.pow(y, 0.72)) * (1 - 0.25 * y);
    v.set(v.x * w * 0.5 * (0.35 + 0.65 * ww), y * l, Math.max(0, v.z) * t * (0.5 + 0.5 * ww) + Math.abs(v.x) * -0.0);
  });
}

export function stoneLantern(mats: Mats, q: Quality): THREE.Group {
  const b = new Builder(), o8 = { phi0: Math.PI / 8 }, lamp = lanternPaper(mats);
  const oct = (p: P2[]) => turn(p, 8, o8);
  // 地栿
  b.add('stone', oct([[0.5, 0], [0.5, 0.08], [0.48, 0.1], [0.001, 0.1]]));
  // 覆莲座：一个鼓出来的墩，外面一圈朝下的莲瓣
  b.add('stone', turn(spl([[0.44, 0.1], [0.45, 0.14], [0.42, 0.2], [0.33, 0.29], [0.22, 0.345], [0.19, 0.37]], 12), sg(q, 28)));
  const np = isLow(q) ? 8 : 10;
  for (let i = 0; i < np; i++) {
    b.add('stone', stonePetal(0.21, 0.25, 0.07, q).applyMatrix4(M.mul(M.ry((i / np) * Math.PI * 2), M.t(0, 0.372, 0.232), M.rx(Math.PI - 0.94), M.ry(Math.PI))));
    b.add('stone', tint(stonePetal(0.14, 0.17, 0.05, q).applyMatrix4(M.mul(M.ry(((i + 0.5) / np) * Math.PI * 2), M.t(0, 0.3, 0.345), M.rx(Math.PI - 0.67), M.ry(Math.PI))), 0.92));
  }
  // 八角短柱，腰上一道箍
  b.add('stone', oct([[0.2, 0.37], [0.2, 0.4], [0.158, 0.42], [0.15, 0.68], [0.172, 0.7], [0.172, 0.75], [0.15, 0.77], [0.156, 1.02], [0.19, 1.05]]));
  // 仰莲托
  b.add('stone', turn(spl([[0.19, 1.05], [0.21, 1.075], [0.3, 1.14], [0.38, 1.22], [0.4, 1.27]], 10), sg(q, 28)));
  for (let i = 0; i < np; i++) {
    b.add('stone', stonePetal(0.19, 0.24, 0.05, q).applyMatrix4(M.mul(M.ry((i / np) * Math.PI * 2), M.t(0, 1.075, 0.2), M.rx(0.86))));
    b.add('stone', tint(stonePetal(0.12, 0.16, 0.035, q).applyMatrix4(M.mul(M.ry(((i + 0.5) / np) * Math.PI * 2), M.t(0, 1.14, 0.29), M.rx(0.7))), 0.92));
  }
  // 灯室的底板
  b.add('stone', oct([[0.4, 1.265], [0.44, 1.275], [0.44, 1.315], [0.42, 1.33], [0.001, 1.33]]));
  // 灯室：八根角柱，斜面四面是石板，正面四面开窗（下有矮槛、上有横楣）；里面衬纸
  const R = 0.33, y0 = 1.33, y1 = 1.75, ap = R * Math.cos(Math.PI / 8), fw = 2 * R * Math.sin(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    b.add('stone', box(0.058, y1 - y0, 0.058, 'y').applyMatrix4(M.mul(M.ry(a), M.t(0, (y0 + y1) / 2, R - 0.012))));
    const fa = (i * Math.PI) / 4;
    if (i % 2 === 1) {
      b.add('stone', shade(box(fw - 0.03, y1 - y0, 0.032, 'y').applyMatrix4(M.mul(M.ry(fa), M.t(0, (y0 + y1) / 2, ap - 0.02))), () => 0.94));
      // 石板上浅浅一道直棂的意思
      for (const x of [-0.05, 0, 0.05]) b.add('stone', shade(box(0.016, (y1 - y0) * 0.62, 0.012, 'y').applyMatrix4(M.mul(M.ry(fa), M.t(x, (y0 + y1) / 2, ap - 0.002))), () => 0.82));
    } else {
      b.add('stone', box(fw - 0.03, 0.05, 0.036, 'x').applyMatrix4(M.mul(M.ry(fa), M.t(0, y0 + 0.025, ap - 0.02))));
      b.add('stone', box(fw - 0.03, 0.045, 0.036, 'x').applyMatrix4(M.mul(M.ry(fa), M.t(0, y1 - 0.0225, ap - 0.02))));
    }
  }
  b.add('lamp', turn([[R - 0.06, y0 + 0.02], [R - 0.06, y1 - 0.02]], 8, o8));
  b.add('stone', tint(turn([[R - 0.07, y1 - 0.02], [0.001, y1 - 0.02]], 8, o8), 0.3));
  // 楣与八角攒尖顶：檐略厚、微微上翘，八条脊
  b.add('stone', oct([[R + 0.02, y1], [R + 0.04, y1 + 0.02], [R + 0.04, y1 + 0.05]]));
  const ry0 = y1 + 0.05;
  b.add('stone', shade(oct(prof(
    [[0.2, ry0 - 0.005], [0.6, ry0 + 0.03], [0.615, ry0 + 0.045], [0.612, ry0 + 0.075]],
    spl([[0.612, ry0 + 0.075], [0.48, ry0 + 0.1], [0.32, ry0 + 0.16], [0.18, ry0 + 0.25], [0.11, ry0 + 0.32]], 8),
  )), (_x, _y, _z, _nx, ny) => (ny < -0.2 ? 0.6 : 1)));
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4, pts: THREE.Vector3[] = [];
    for (const [r, y] of spl([[0.628, ry0 + 0.09], [0.49, ry0 + 0.112], [0.325, ry0 + 0.172], [0.185, ry0 + 0.262], [0.12, ry0 + 0.325]], 6)) pts.push(V(Math.sin(a) * r, y, Math.cos(a) * r));
    b.add('stone', tubeRidge(pts));
  }
  // 相轮与宝珠
  const fy = ry0 + 0.32;
  b.add('stone', turn(prof(
    spl([[0.12, fy], [0.13, fy + 0.02], [0.075, fy + 0.04], [0.06, fy + 0.055]], 6),
    [[0.06, fy + 0.055], [0.095, fy + 0.066], [0.095, fy + 0.078], [0.058, fy + 0.088]], [[0.058, fy + 0.088], [0.085, fy + 0.098], [0.085, fy + 0.11], [0.05, fy + 0.12]], [[0.05, fy + 0.12], [0.072, fy + 0.13], [0.072, fy + 0.141], [0.04, fy + 0.15]],
    spl([[0.04, fy + 0.15], [0.07, fy + 0.18], [0.066, fy + 0.215], [0.03, fy + 0.25], [0.001, fy + 0.275]], 10),
  ), sg(q, 20)));
  const g = b.build(new Proxy(table(mats, q), { get: (t, k: string) => (k === 'lamp' ? lamp : t[k]) }), { name: 'stoneLantern', noCast: ['lamp'] });
  g.userData = { lamp, light: new THREE.Vector3(0, (y0 + y1) / 2, 0), height: fy + 0.275 };
  return g;
}
/** 攒尖顶上的一条垂脊：一道半圆的棱 */
function tubeRidge(pts: THREE.Vector3[]) {
  const n = pts.length, rows: THREE.Vector3[][] = [];
  for (let k = 0; k <= 4; k++) {
    const a = (k / 4) * Math.PI, row: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], t = new THREE.Vector3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      const side = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(side, t).normalize();
      const r = 0.022 * (1 - 0.3 * (i / (n - 1)));
      row.push(p.clone().addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r * 1.2 - 0.004));
    }
    rows.push(row);
  }
  return grid(rows, (i, j) => [i * 0.02, j * 0.08]);
}

// —— 莲灯 ——
const lotusM = new WeakMap<Mats, THREE.MeshStandardMaterial>();
let lotusG: THREE.BufferGeometry | null = null;
function lotusMat(mats: Mats): THREE.MeshStandardMaterial {
  // 花瓣的发光强弱顺着瓣走：根上（挨着烛）最亮，瓣尖暗；底托不发光
  const [c, g] = canvas(4, 64);
  const gr = g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.06, '#000'); gr.addColorStop(0.2, '#fff'); gr.addColorStop(0.5, '#b0b0b0'); gr.addColorStop(1, '#4a4a4a');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  const em = canvasTex(c);
  em.wrapS = em.wrapT = THREE.ClampToEdgeWrapping; em.generateMipmaps = false; em.minFilter = THREE.LinearFilter;
  const map = mats.paper.map ? mats.paper.map.clone() : null;
  if (map) { map.repeat.set(1.6, 1.6); map.needsUpdate = true; }
  return enhance(new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.92, side: THREE.DoubleSide, emissive: 0xffa55c, emissiveMap: em, emissiveIntensity: 0 }));
}
function lotusGeo(): THREE.BufferGeometry {
  if (lotusG) return lotusG;
  const L = (hex: number) => { const k = new THREE.Color(hex); return [k.r, k.g, k.b]; };
  const white = L(0xf4ece6), pink = L(0xe7a8b8), deep = L(0xcf6c8e), green = L(0x3f6a3a), wax = L(0xe2d9c2);
  const petal = (len: number, wid: number, open: number, ang: number, nu: number, nv: number, base: number, curl = 0) => {
    const rows: THREE.Vector3[][] = [];
    for (let i = 0; i <= nv; i++) {
      const row: THREE.Vector3[] = [], t = i / nv;
      for (let j = 0; j <= nu; j++) {
        const u = j / nu - 0.5, w = wid * Math.pow(Math.sin(Math.PI * (0.15 + 0.85 * t)), 0.55);
        const a = open * (0.3 + 0.7 * Math.pow(t, 0.8)) - curl * t * t * t;
        row.push(V(u * w, 0.008 + len * t * Math.cos(a) * (1 - 0.1 * t), base + len * t * Math.sin(a) - 0.5 * w * (4 * u * u) * 0.42));
      }
      rows.push(row);
    }
    const g = grid(rows, (i, j) => [j / nu, 0.1 + 0.9 * (i / nv)]);
    return colorize(g, (_x, y, _z, _nx, _ny, _nz, o) => {
      const t = clamp(y / (len * 0.9)), a = t < 0.6 ? white : pink, c = t < 0.6 ? pink : deep, k = t < 0.6 ? t / 0.6 : (t - 0.6) / 0.4;
      o[0] = a[0] + (c[0] - a[0]) * k; o[1] = a[1] + (c[1] - a[1]) * k; o[2] = a[2] + (c[2] - a[2]) * k;
    }).rotateY(ang);
  };
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) parts.push(petal(0.1, 0.092, 0.86, (i / 8) * Math.PI * 2, 2, 4, 0.032, -0.3));
  for (let i = 0; i < 8; i++) parts.push(petal(0.095, 0.08, 0.6, ((i + 0.5) / 8) * Math.PI * 2, 2, 4, 0.024, 0.1));
  for (let i = 0; i < 5; i++) parts.push(petal(0.082, 0.066, 0.26, ((i + 0.25) / 5) * Math.PI * 2, 2, 3, 0.016, 0.3));
  // 底托（纸萼）：一只浅碟，不发光（uv 的 v 取 0）
  const dish = turn([[0.001, 0.004], [0.045, 0], [0.066, 0.005], [0.074, 0.014]], 12);
  const duv = dish.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < duv.count; i++) duv.setXY(i, 0.5, 0);
  parts.push(tint(dish, green[0], green[1], green[2]));
  // 小烛
  const cd = turn([[0.011, 0.006], [0.011, 0.04], [0.001, 0.041]], 6);
  const cuv = cd.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < cuv.count; i++) cuv.setXY(i, 0.5, 0.22);
  parts.push(tint(cd, wax[0], wax[1], wax[2]));
  lotusG = merge(parts);
  return lotusG;
}
/** 莲灯：径约 0.24。own=true 时这一盏用自己的材质（单独点亮 / 熄灭）；否则全寺的莲灯共用一个 */
export function lotusLamp(mats: Mats, q: Quality, own = false): THREE.Group {
  void q;
  let m = lotusM.get(mats);
  if (!m) { m = lotusMat(mats); lotusM.set(mats, m); }
  let glow = m;
  if (own) { glow = m.clone(); glow.userData = {}; enhance(glow); }
  const mesh = part(lotusGeo(), glow, 'lotusLampMesh', false);
  const g = new THREE.Group();
  g.name = 'lotusLamp';
  g.add(mesh);
  g.userData = { glow, flame: new THREE.Vector3(0, 0.05, 0), geo: mesh.geometry, tris: mesh.geometry.attributes.position.count / 3 };
  return g;
}
void box;
