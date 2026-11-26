/**
 * 身上戴的小物件：簪、步摇、簪花、珠花、耳珰（头上），玉佩、香囊、禁步、荷包、折扇（腰间）。
 * 都是不变形的小块，与头、手、鞋收在同一个几何里（loft.ts 的 chunk），一个人仍是一次绘制。
 *
 * 三种摆法（figure.ts 每帧摆）：
 *   head  —— 跟着头整块走（簪、簪花、珠花）。坐标就是头那一块的坐标（原点在颈根，与 buildHead 一样先抬 HEAD_UP 再按头的大小缩放），
 *            所以拿头的矩阵一放就对上了。戴上雨天的斗笠时收起来（不然从笠里戳出来）。
 *   dangle —— 挂在头上一点、自己垂着晃的（步摇的珠串、耳珰）：原点在挂点，顺着 −y 垂下去；挂点在头的坐标里（pivot）。
 *   waist —— 系在腰带上垂着的（玉佩、香囊、禁步、荷包）：原点在系的那一点，顺着 −y 垂下去、+z 是朝外的那一面。
 *            每帧量衣身（下摆被腿顶到哪）与两袖，垂着的这一串不让它插进布里、袖里（figure.ts 的 hang）。
 *   tuck  —— 插在腰带里的（折扇）：贴着腰前一侧斜插，大半截在带里，露出扇头。
 * 颜色都写在顶点上（指到贴图的白处），材质与身子同一个。
 */
import * as THREE from 'three';
import type { RGB } from '../ink/ink';
import { HEAD_UP, mix, mul, piece, strip, tones, weld } from './parts';
import type { HatKind, Look, OrnId } from './types';

export type OrnSlot = 'head' | 'dangle' | 'waist' | 'tuck';
export interface OrnPiece {
  slot: OrnSlot;
  geo: THREE.BufferGeometry;
  /** dangle：挂点（头的坐标，已按头的大小算好）；waist：系在腰带的哪一边（1 左、−1 右）与偏前多少（弧度，0 正前） */
  pivot?: THREE.Vector3; side?: 1 | -1; az?: number;
  /** 垂下去多长（米）：摆的长短，也是量布、量袖的那一段 */
  len?: number;
  /** 一串垂着的东西沿着长度取几处量（0 系处 … 1 末梢） */
  probe?: number[];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SILVER: RGB = [0.86, 0.87, 0.9], JADE: RGB = [0.8, 0.9, 0.83], GOLD: RGB = [0.93, 0.79, 0.45], PEARL: RGB = [0.97, 0.96, 0.93];
const CORD_RED: RGB = [0.72, 0.28, 0.24];

/** 髻在头的哪里（头的坐标，抬起与缩放之前）：簪横贯它，花插在它边上。巾、幞头、东坡巾没有露出来的髻：花插在帽边 */
function bunOf(hat: HatKind): { c: THREE.Vector3; r: number; cloth: boolean } {
  switch (hat) {
    case 'bun': return { c: V(0, 0.112, -0.055), r: 0.056, cloth: false };
    case 'gaoji': return { c: V(0, 0.15, -0.026), r: 0.05, cloth: false };
    case 'baoji': return { c: V(0, 0.128, -0.04), r: 0.064, cloth: true };
    case 'huaguan': return { c: V(0, 0.134, -0.028), r: 0.052, cloth: false };
    case 'guan': case 'none': return { c: V(0, 0.136, -0.03), r: 0.045, cloth: false };
    case 'dongpo': return { c: V(0, 0.1, -0.01), r: 0.098, cloth: true };
    case 'futou': return { c: V(0, 0.1, -0.02), r: 0.09, cloth: true };
    default: return { c: V(0, 0.122, -0.022), r: 0.07, cloth: true };
  }
}
/** 头那一块的抬起与缩放（与 buildHead 末尾一样） */
const headSpace = (g: THREE.BufferGeometry, l: Look) => { g.translate(0, HEAD_UP, 0.008); if (l.head !== 1) g.scale(l.head, l.head, l.head); return g; };
const headPt = (p: THREE.Vector3, l: Look) => p.clone().add(V(0, HEAD_UP, 0.008)).multiplyScalar(l.head);

/** 一根簪：细杆、头上一个饰（金是一朵小花，玉是如意头，银是一颗圆珠） */
function zan(l: Look, col: RGB, kind: 'yin' | 'yu' | 'jin', low: boolean): THREE.BufferGeometry {
  const b = bunOf(l.hat), len = 0.17, parts: THREE.BufferGeometry[] = [];
  parts.push(piece(new THREE.CylinderGeometry(0.0026, 0.0018, len, low ? 5 : 6).rotateZ(Math.PI / 2), col));
  const hx = len / 2 + 0.006;
  if (kind === 'jin') {
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; parts.push(piece(new THREE.SphereGeometry(1, 6, 4).scale(0.0055, 0.0085, 0.0035).rotateX(a).translate(hx, Math.cos(a) * 0.007, Math.sin(a) * 0.007), col)); }
    parts.push(piece(new THREE.SphereGeometry(0.0042, 6, 4).translate(hx + 0.001, 0, 0), mul(col, 0.82)));
  } else if (kind === 'yu') {
    parts.push(piece(new THREE.TorusGeometry(0.0075, 0.0028, 5, 10, Math.PI * 1.5).rotateY(Math.PI / 2).translate(hx, 0.003, 0), col));
    parts.push(piece(new THREE.SphereGeometry(0.0046, 6, 4).translate(hx, -0.004, 0), mix(col, [1, 1, 1], 0.3)));
  } else parts.push(piece(new THREE.SphereGeometry(0.0062, 8, 6).translate(hx, 0, 0), col));
  const g = weld(parts);
  // 斜着横贯髻：自右后往左前，簪头在左
  g.rotateY(-0.22).rotateZ(0.14).translate(b.c.x + 0.012, b.c.y + 0.004, b.c.z + 0.006);
  return headSpace(g, l);
}

/** 一朵花（插在髻边或帽边）：五瓣、一个花心、两片叶 */
function flowerGeo(l: Look, low: boolean, scale = 1): THREE.BufferGeometry {
  const T = tones(l), parts: THREE.BufferGeometry[] = [], petal = T.flower, n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    parts.push(piece(new THREE.SphereGeometry(1, low ? 5 : 7, 4).scale(0.012, 0.0035, 0.0075).translate(0.0095, 0, 0).rotateY(a), i % 2 ? petal : mix(petal, [1, 0.97, 0.94], 0.25)));
  }
  // 里一层小瓣，略立起
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.6;
    parts.push(piece(new THREE.SphereGeometry(1, 5, 4).scale(0.008, 0.003, 0.0055).rotateZ(0.5).translate(0.0055, 0.003, 0).rotateY(a), mix(petal, [0.75, 0.3, 0.3], 0.18)));
  }
  parts.push(piece(new THREE.SphereGeometry(0.0042, 6, 4).translate(0, 0.004, 0), [0.97, 0.84, 0.42]));
  for (const s of [-1, 1]) parts.push(piece(new THREE.SphereGeometry(1, 5, 4).scale(0.014, 0.0025, 0.0065).translate(0.017, -0.002, 0).rotateY(s * 2.2 + 0.4), [0.4, 0.55, 0.4]));
  const g = weld(parts);
  if (scale !== 1) g.scale(scale, scale, scale);
  return g;
}
/** 簪花：髻的左边一朵（巾、幞头插在左鬓边） */
function huazan(l: Look, low: boolean): THREE.BufferGeometry {
  const b = bunOf(l.hat), g = flowerGeo(l, low, l.build === 'f' ? 1 : 1.1);
  if (b.cloth) g.rotateZ(1.25).rotateY(0.2).translate(b.r * 0.86, b.c.y - 0.012, b.c.z + 0.02);
  else g.rotateZ(1.1).rotateY(0.5).translate(b.c.x + b.r * 0.82, b.c.y + 0.012, b.c.z + 0.024);
  return headSpace(g, l);
}
/** 珠花：髻前一簇小珠，底下一片金托 */
function zhuhua(l: Look, low: boolean): THREE.BufferGeometry {
  const b = bunOf(l.hat), parts: THREE.BufferGeometry[] = [];
  parts.push(piece(new THREE.SphereGeometry(1, 7, 4).scale(0.02, 0.004, 0.014), GOLD));
  const pts = [[0, 0.006, 0], [0.011, 0.005, 0.004], [-0.011, 0.005, 0.004], [0.006, 0.004, -0.009], [-0.006, 0.004, -0.009], [0, 0.012, 0.002], [0.016, 0.002, -0.004], [-0.016, 0.002, -0.004]];
  for (const [x, y, z] of pts.slice(0, low ? 5 : 8)) parts.push(piece(new THREE.SphereGeometry(0.0042, low ? 5 : 7, low ? 4 : 5).translate(x, y, z), PEARL));
  const g = weld(parts).rotateX(1.05).translate(b.c.x, b.c.y + b.r * 0.35, b.c.z + b.r * 0.92);
  return headSpace(g, l);
}

/** 步摇：簪（不动的那一截，跟着头）＋簪头垂下的一串珠叶（自己晃）。返回两块 */
function buyao(l: Look, low: boolean): OrnPiece[] {
  const b = bunOf(l.hat);
  const pin = zan(l, GOLD, 'jin', low);
  // 簪头在髻的左上前（与 zan 里的摆法一样：簪头在 +x 那一端）
  const head = V(b.c.x + 0.012 + 0.09, b.c.y + 0.004 + 0.012, b.c.z + 0.006 - 0.02);
  const parts: THREE.BufferGeometry[] = [];
  const beads = [0.014, 0.028, 0.042];
  parts.push(piece(new THREE.CylinderGeometry(0.0008, 0.0008, 0.05, 3).translate(0, -0.025, 0), GOLD));
  for (const y of beads) parts.push(piece(new THREE.SphereGeometry(0.0034, low ? 5 : 6, 4).translate(0, -y, 0), y === 0.028 ? JADE : PEARL));
  // 末梢一片金叶
  parts.push(piece(new THREE.SphereGeometry(1, 6, 4).scale(0.0065, 0.011, 0.0018).translate(0, -0.058, 0), GOLD));
  return [{ slot: 'head', geo: pin }, { slot: 'dangle', geo: weld(parts), pivot: headPt(head, l), len: 0.06 }];
}
/** 耳珰：两耳各垂一颗珠（一小段金丝） */
function erdang(l: Look, low: boolean): OrnPiece[] {
  return [1, -1].map((s) => {
    const g = weld([
      piece(new THREE.CylinderGeometry(0.0007, 0.0007, 0.014, 3).translate(0, -0.007, 0), GOLD),
      piece(new THREE.SphereGeometry(0.0046, low ? 5 : 7, low ? 4 : 5).translate(0, -0.018, 0), PEARL),
    ]);
    return { slot: 'dangle' as const, geo: g, pivot: headPt(V(s * 0.095, -0.03, -0.002), l), len: 0.02 };
  });
}

/** 一绺流苏：自 y 往下 len，几根丝攒成一束（末梢散开一点） */
function tassel(y: number, len: number, col: RGB, low: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [piece(new THREE.SphereGeometry(0.0045, 6, 4).translate(0, y, 0), mul(col, 0.85))];
  const n = low ? 4 : 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = 0.0045;
    parts.push(piece(new THREE.CylinderGeometry(0.0011, 0.0006, len, 3).translate(0, -len / 2, 0).rotateZ(Math.sin(a) * 0.12).rotateX(Math.cos(a) * 0.12).translate(Math.sin(a) * r * 0.4, y - 0.003, Math.cos(a) * r * 0.4), i % 2 ? col : mix(col, [1, 1, 1], 0.15)));
  }
  return weld(parts);
}
/** 系绳：自系处往下一段 */
const cord = (len: number, col: RGB) => piece(new THREE.CylinderGeometry(0.0013, 0.0013, len, 4).translate(0, -len / 2, 0), col);
/** 一个结（盘长结的意思：扁扁的一团） */
const knot = (y: number, col: RGB) => piece(new THREE.SphereGeometry(1, 7, 5).scale(0.009, 0.007, 0.004).translate(0, y, 0), col);

/** 玉佩：绦绳、一个结、一枚玉璧、下垂红流苏 */
function pei(low: boolean): OrnPiece {
  const disc = new THREE.TorusGeometry(0.021, 0.0105, low ? 6 : 8, low ? 14 : 22).scale(1, 1, 0.42).translate(0, -0.075, 0);
  const g = weld([cord(0.05, CORD_RED), knot(-0.048, CORD_RED), cord(0.006, CORD_RED).translate(0, -0.05, 0), piece(disc, JADE), tassel(-0.1, 0.07, CORD_RED, low)]);
  return { slot: 'waist', geo: g, side: 1, az: 0.26, len: 0.17, probe: [0.45, 0.75, 0.9, 1] };
}
/** 香囊：绳、一只圆鼓鼓的绣囊（底色一样、中间一团金线绣的花）、流苏 */
function nang(low: boolean, col: RGB = [0.72, 0.3, 0.32]): OrnPiece {
  const bag = new THREE.SphereGeometry(1, low ? 8 : 12, low ? 6 : 9).scale(0.024, 0.028, 0.012).translate(0, -0.062, 0);
  const bp = piece(bag, col), c = bp.attributes.color as THREE.BufferAttribute, p = bp.attributes.position as THREE.BufferAttribute;
  // 绣的花：朝外那一面当中一团金，四周一圈深一点的边
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + 0.062, z = p.getZ(i), r = Math.hypot(x / 0.024, y / 0.028);
    const k = z > 0 && r < 0.45 ? 1 : 0, rim = r > 0.88 ? 0.78 : 1;
    const t = k ? GOLD : mul(col, rim);
    c.setXYZ(i, t[0], t[1], t[2]);
  }
  const g = weld([cord(0.03, CORD_RED), knot(-0.03, mul(col, 0.9)), bp, tassel(-0.09, 0.05, mul(col, 0.95), low)]);
  return { slot: 'waist', geo: g, side: -1, az: 0.34, len: 0.15, probe: [0.5, 0.8, 1] };
}
/** 禁步：女子压裙的一长串——绦、上头一片珩、中间两颗珠、下头一枚璜、一绺长流苏 */
function jinbu(low: boolean): OrnPiece {
  const heng = new THREE.TorusGeometry(0.028, 0.006, 4, low ? 10 : 16, Math.PI).rotateZ(Math.PI).scale(1, 0.7, 0.6).translate(0, -0.07, 0);
  const huang = new THREE.TorusGeometry(0.022, 0.0065, 4, low ? 10 : 16, Math.PI).rotateZ(Math.PI).scale(1, 0.8, 0.6).translate(0, -0.16, 0);
  const g = weld([
    cord(0.06, CORD_RED), knot(-0.055, CORD_RED), piece(heng, JADE),
    piece(new THREE.CylinderGeometry(0.0011, 0.0011, 0.1, 3).translate(0, -0.115, 0), CORD_RED),
    piece(new THREE.SphereGeometry(0.0055, 6, 4).translate(0, -0.1, 0), PEARL), piece(new THREE.SphereGeometry(0.0055, 6, 4).translate(0, -0.125, 0), JADE),
    piece(huang, JADE), tassel(-0.175, 0.1, CORD_RED, low),
  ]);
  return { slot: 'waist', geo: g, side: 1, az: 0.12, len: 0.28, probe: [0.3, 0.55, 0.65, 0.8, 0.9, 1] };
}
/** 荷包：小小的一只，口上抽着绳 */
function hebao(low: boolean): OrnPiece {
  const bag = new THREE.LatheGeometry([[0.0001, -0.05], [0.012, -0.048], [0.019, -0.038], [0.02, -0.026], [0.014, -0.018], [0.008, -0.014], [0.011, -0.01]].map(([x, y]) => new THREE.Vector2(x, y)), low ? 8 : 12);
  bag.scale(1, 1, 0.6); bag.computeVertexNormals();
  const g = weld([cord(0.03, [0.42, 0.38, 0.36]), piece(bag, [0.5, 0.56, 0.6]), piece(new THREE.TorusGeometry(0.009, 0.0016, 4, 10).rotateX(Math.PI / 2).translate(0, -0.012, 0), [0.42, 0.38, 0.36])]);
  return { slot: 'waist', geo: g, side: -1, az: 0.56, len: 0.08, probe: [0.6, 1] };
}
/** 折扇（合着）：扇骨细长、扇头宽，插在腰带右前侧，露出大半截 */
function shan(low: boolean): OrnPiece {
  const pos: number[] = [], idx: number[] = [], n = low ? 4 : 6;
  // 一片上宽下窄的扁条（扇骨合拢的样子），两面都有
  for (let j = 0; j <= n; j++) {
    const t = j / n, y = 0.26 * t, w = 0.008 + 0.012 * t, d = 0.005 + 0.003 * t;
    pos.push(-w, y, -d, w, y, -d, w, y, d, -w, y, d);
  }
  for (let j = 0; j < n; j++) for (let k = 0; k < 4; k++) {
    const a = j * 4 + k, b = j * 4 + ((k + 1) % 4), c = a + 4, d = b + 4;
    idx.push(a, b, d, a, d, c);
  }
  const top = (n + 1) * 4 - 4; idx.push(top, top + 2, top + 1, top, top + 3, top + 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const body = piece(geo, [0.55, 0.43, 0.33]), c = body.attributes.color as THREE.BufferAttribute, p = body.attributes.position as THREE.BufferAttribute;
  // 扇头一截是纸面（素白，一道墨）
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.17) { const t = p.getY(i) > 0.235 ? [0.3, 0.3, 0.32] : [0.93, 0.92, 0.88]; c.setXYZ(i, t[0], t[1], t[2]); }
  const g = weld([body, piece(new THREE.SphereGeometry(0.004, 6, 4), [0.4, 0.32, 0.26])]);
  return { slot: 'tuck', geo: g, side: -1, az: 0.62, len: 0.26 };
}

/** 这一身戴的小物件，各拆成要摆的几块（看 look.orn；没有的、这个人戴不上的跳过） */
export function buildOrnaments(l: Look, low: boolean): OrnPiece[] {
  const out: OrnPiece[] = [];
  const hatOn = l.hat === 'li' && l.hatWorn;
  for (const id of new Set<OrnId>(l.orn ?? [])) {
    const headOk = !hatOn && l.hat !== 'tufts';
    switch (id) {
      case 'zanYin': if (headOk) out.push({ slot: 'head', geo: zan(l, SILVER, 'yin', low) }); break;
      case 'zanYu': if (headOk) out.push({ slot: 'head', geo: zan(l, JADE, 'yu', low) }); break;
      case 'zanJin': if (headOk) out.push({ slot: 'head', geo: zan(l, GOLD, 'jin', low) }); break;
      case 'buyao': if (headOk) out.push(...buyao(l, low)); break;
      case 'huazan': if (headOk) out.push({ slot: 'head', geo: huazan(l, low) }); break;
      case 'zhuhua': if (headOk && !bunOf(l.hat).cloth) out.push({ slot: 'head', geo: zhuhua(l, low) }); break;
      case 'erdang': out.push(...erdang(l, low)); break;
      case 'pei': out.push(pei(low)); break;
      case 'nang': out.push(nang(low)); break;
      case 'jinbu': out.push(jinbu(low)); break;
      case 'hebao': out.push(hebao(low)); break;
      case 'shan': out.push(shan(low)); break;
    }
  }
  return out;
}
/** 带梢那种窄带（给以后要垂的绦用） */
export { strip as ribbon };
