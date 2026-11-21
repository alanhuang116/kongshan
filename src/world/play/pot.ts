/**
 * 投壶的器物：一只带两耳的铜壶、十二支矢（一张实例化的网，一次绘制）。
 *
 * 尺寸照司马光《投壶新格》：「壶口径三寸，耳径一寸，高一尺……壶去席二箭半，箭十有二枚，长二尺有四寸」——
 * 宋尺按 0.312 米算：口径 9.4 厘米、耳径 3.1 厘米、高 31 厘米、矢长 75 厘米、壶离投的人 1.87 米。
 * 矢「以柘若棘，毋去其皮」（《礼记·投壶》），一头粗一头细，粗的一头（本）先入壶才算数。
 */
import * as THREE from 'three';
import { lathe, merge } from '../core/geo';
import { dye, pole, tube, v3 } from '../build/kit';
import { inkGeo, mats } from './kit';

export const CHI = 0.312;
export const POT = {
  /** 壶高、口的半径、口沿的高、耳的半径、耳心离壶中轴多远、耳心的高 */
  h: CHI, r: (0.3 * CHI) / 2, mouthY: CHI, ear: (0.1 * CHI) / 2, earX: 0.074, earY: CHI * 0.74,
  /** 腹最宽处的半径与高 */ belly: 0.085, bellyY: 0.09,
  /** 壶里能插多深（实以小豆，插不到底） */ depth: 0.2,
};
export const ARROW = { len: 2.4 * CHI, n: 12, r0: 0.0062, r1: 0.0034 };
/** 壶离投的人多远（二箭半） */
export const THROW_DIST = 2.5 * ARROW.len;

/** 铜壶（原点在壶底正中）：圈足、扁圆的腹、长颈、侈口；颈上两只贯耳（小圆管，沿 x 两侧） */
export function potGeo(): THREE.BufferGeometry {
  const P = POT, bronze: [number, number, number] = [0.66, 0.62, 0.54];
  const body = lathe([
    [0.001, 0], [0.05, 0], [0.052, 0.012], [0.046, 0.016], [0.062, 0.03], [0.08, 0.06], [P.belly, P.bellyY], [0.082, 0.13], [0.066, 0.165],
    [0.04, 0.19], [0.032, 0.22], [0.03, 0.26], [0.034, 0.29], [0.042, 0.305], [P.r, P.mouthY], [P.r - 0.004, P.mouthY + 0.002], [P.r - 0.008, P.mouthY - 0.006], [0.028, 0.28], [0.022, 0.24], [0.001, 0.22],
  ], 18);
  const gs = [dye(body, bronze, 2.0)];
  // 两只贯耳：竖着的小圆管，贴在颈的两侧
  for (const s of [-1, 1]) {
    const ear = lathe([[P.ear + 0.004, -0.028], [P.ear + 0.006, -0.02], [P.ear + 0.006, 0.02], [P.ear + 0.004, 0.028], [P.ear - 0.002, 0.028], [P.ear - 0.002, -0.028], [P.ear + 0.004, -0.028]], 10);
    gs.push(dye(ear.translate(s * P.earX, P.earY, 0), bronze, 2.3));
    // 耳与颈相连的一小截
    gs.push(dye(pole(v3(s * 0.03, P.earY, 0), v3(s * (P.earX - P.ear), P.earY, 0), 0.007, 0.006, 5), bronze, 2.3));
  }
  // 腹上一道弦纹
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI * 2; ring.push(v3(Math.cos(a) * (P.belly + 0.001), P.bellyY + 0.012, Math.sin(a) * (P.belly + 0.001))); }
  gs.push(dye(tube(ring, 0.0022, 4), bronze, 2.8));
  return merge(gs);
}

/** 一支矢（原点在粗的一头，沿 +y 伸到细的一头）：柘木带皮，粗头一圈深色 */
export function arrowGeo(): THREE.BufferGeometry {
  const g = inkGeo(new THREE.CylinderGeometry(ARROW.r1, ARROW.r0, ARROW.len, 5, 3, false).translate(0, ARROW.len / 2, 0));
  // 顶点色：越近粗头越深（手握、入壶磨的），细头淡
  const p = g.attributes.position as THREE.BufferAttribute, c = g.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / ARROW.len, k = y < 0.06 ? 0.72 : 0.9 + 0.1 * y; c.setXYZ(i, k * 0.98, k * 0.94, k * 0.86); }
  // uv 以米计，木纹沿长向
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.03, p.getY(i));
  return g;
}

/** 壶的网格（obj 材质）与十二支矢（实例化，木） */
export function makePot(): { pot: THREE.Mesh; arrows: THREE.InstancedMesh } {
  const pot = new THREE.Mesh(potGeo(), mats().obj);
  pot.name = 'play:pot';
  const arrows = new THREE.InstancedMesh(arrowGeo(), mats().wood, ARROW.n);
  arrows.name = 'play:arrows';
  arrows.frustumCulled = false;
  return { pot, arrows };
}
