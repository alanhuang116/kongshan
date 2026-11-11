/**
 * 大殿正中的佛：唐风释迦牟尼坐像（结跏趺坐、禅定印）+ 仰覆莲台 + 八角须弥座 + 舟形背光。
 *
 * 坐像是用距离场塑的，离线烘成网格（tools/buddha/bake.mjs → public/models/buddha.bin / buddha-low.bin），这里只管取回来拼上；
 * 莲台、须弥座、背光是现搭的（莲瓣实例化，背光的纹样画在画布上）。
 * 原点在须弥座底面正中，面朝 +z。总高约 5.6 米。
 */
import * as THREE from 'three';
import type { Mats } from '../core/mats';
import { variant } from '../core/mats';
import type { Quality } from '../core/World';
import { buildLotus, buildMandorla, buildPedestal, LOTUS_H, PEDESTAL_H } from './buddha/throne';

export interface BuddhaInfo {
  /** 像的眼睛高度（看着它时镜头对准这里） */
  eyeY: number;
  /** 总高 */
  height: number;
  /** 背光的发光材质：emissiveIntensity 0…1，随烛光调 */
  glow: THREE.MeshStandardMaterial;
  /** 金身与发的材质（殿内要压低环境反射时可调 envMapIntensity） */
  gold: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
}

/** 坐处（莲台面）离座底的高度 */
export const SEAT_Y = PEDESTAL_H + LOTUS_H;
/** 坐像里眼睛、肉髻顶离坐处的高度 */
const EYE = 2.53, TOP = 3.19;

interface Part { name: string; geo: THREE.BufferGeometry }

/** 读 bake.mjs 写的二进制（格式见那边的注释：分片、存差） */
export function parseBuddha(buf: ArrayBuffer): Part[] {
  const dv = new DataView(buf), U = new Uint8Array(buf);
  if (dv.getUint32(0, true) !== 0x4442534b || dv.getUint32(4, true) !== 2) throw new Error('buddha.bin: 格式不对');
  const n = dv.getUint32(8, true), parts: Part[] = [];
  let o = 12;
  for (let p = 0; p < n; p++) {
    let name = '';
    for (let i = 0; i < 8; i++) { const c = U[o + i]; if (c) name += String.fromCharCode(c); }
    const nv = dv.getUint32(o + 8, true), ni = dv.getUint32(o + 12, true), Q = (1 << dv.getUint32(o + 16, true)) - 1;
    const min = [0, 1, 2].map((k) => dv.getFloat32(o + 20 + k * 4, true)), max = [0, 1, 2].map((k) => dv.getFloat32(o + 32 + k * 4, true));
    o += 44;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    for (let k = 0; k < 3; k++) {
      const lo = o + k * 2 * nv, hi = lo + nv, pn = o + (6 + k) * nv, pc = o + (9 + k) * nv, sc = (max[k] - min[k]) / Q;
      let q = 0, nn = 0, cc = 0;
      for (let v = 0; v < nv; v++) {
        const z = U[lo + v] | (U[hi + v] << 8);
        q += (z >>> 1) ^ -(z & 1);
        pos[v * 3 + k] = min[k] + q * sc;
        nn = (nn + U[pn + v]) & 255; nor[v * 3 + k] = (nn > 127 ? nn - 256 : nn) / 127;
        cc = (cc + U[pc + v]) & 255; col[v * 3 + k] = cc / 255;
      }
    }
    o += nv * 12 + ((4 - ((nv * 12) % 4)) % 4);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let prev = 0;
    for (let t = 0; t < ni; t++) {
      const z = (U[o + t] | (U[o + ni + t] << 8) | (U[o + 2 * ni + t] << 16) | (U[o + 3 * ni + t] << 24)) >>> 0;
      prev += (z >>> 1) ^ -(z & 1);
      idx[t] = prev;
    }
    o += ni * 4;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    parts.push({ name, geo: g });
  }
  return parts;
}

/** 金身与发的材质 */
export function figureMats(mats: Mats) {
  // 不用贴图：颜色、旧、凹处的暗都烘在顶点色里（塑出来的形没有 uv）
  const gold = variant(mats.gold, { map: null, normalMap: null, roughnessMap: null, metalnessMap: null, color: 0xe3ab52, metalness: 0.92, roughness: 0.4, envMapIntensity: 1 });
  // 发：绀青（深青黑），不是金属
  const hair = new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.46, metalness: 0.3, vertexColors: true });
  return { gold, hair };
}

/** 取不到模型时的退路：一个车削出来的坐像剪影（端坐的大形还在） */
function fallbackFigure(gold: THREE.Material): THREE.Mesh {
  const pts: Array<[number, number]> = [[1.3, 0], [1.34, 0.12], [1.22, 0.4], [0.9, 0.62], [0.66, 0.9], [0.62, 1.3], [0.74, 1.62], [0.8, 1.85], [0.52, 2.0], [0.24, 2.1], [0.21, 2.26], [0.3, 2.42], [0.33, 2.62], [0.3, 2.84], [0.2, 2.98], [0.16, 3.06], [0.08, 3.12], [0.001, 3.13]];
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 40);
  g.scale(1, 1, 0.74);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return new THREE.Mesh(g, gold);
}

/** 只有坐像（原点在坐处）。返回的组里：body、head、hair 三块 */
export async function createFigure(mats: Mats, q: Quality, fm = figureMats(mats)): Promise<THREE.Group> {
  const grp = new THREE.Group();
  grp.name = 'buddha-figure';
  const low = q.tier === 'low' || q.mobile;
  try {
    // 文件是 gzip 过的；没有 DecompressionStream 的旧浏览器取那份没压的粗档
    const canUnzip = typeof DecompressionStream !== 'undefined';
    const file = !canUnzip ? 'buddha-low-raw' : low ? 'buddha-low' : 'buddha';
    const base = (import.meta.env?.BASE_URL ?? '/') as string;
    const res = await fetch(`${base}models/${file}.bin`);
    if (!res.ok) throw new Error(`${file}.bin ${res.status}`);
    let buf = await res.arrayBuffer();
    const sig = new Uint8Array(buf, 0, 2);
    if (sig[0] === 0x1f && sig[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    for (const p of parseBuddha(buf)) {
      const m = new THREE.Mesh(p.geo, p.name === 'hair' ? fm.hair : fm.gold);
      m.name = `buddha:${p.name}`;
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m);
    }
  } catch (e) {
    console.warn('佛像模型没取到，用简形代替', e);
    const m = fallbackFigure(fm.gold);
    m.name = 'buddha:fallback'; m.castShadow = true;
    grp.add(m);
  }
  return grp;
}

/** 佛像 + 莲台 + 须弥座 + 背光。原点在座底中心，面朝 +z。 */
export async function createBuddha(mats: Mats, q: Quality): Promise<THREE.Group & { userData: BuddhaInfo }> {
  const grp = new THREE.Group();
  grp.name = 'buddha';
  const fm = figureMats(mats);
  grp.add(buildPedestal(mats, q));
  const lotus = buildLotus(mats, q, fm.gold);
  lotus.position.y = PEDESTAL_H;
  grp.add(lotus);
  const md = buildMandorla(mats, q, fm.gold);
  grp.add(md.group);
  const fig = await createFigure(mats, q, fm);
  // 像的重心略靠前（腿在前），往后收一点，正坐在莲台中央
  fig.position.set(0, SEAT_Y, -0.12);
  grp.add(fig);
  const info: BuddhaInfo = { eyeY: SEAT_Y + EYE, height: Math.max(md.top, SEAT_Y + TOP), glow: md.glow, gold: fm.gold, hair: fm.hair };
  grp.userData = info;
  return grp as THREE.Group & { userData: BuddhaInfo };
}
