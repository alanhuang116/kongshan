/**
 * 雨具（斗笠、蓑衣）什么时候戴：下雨下雪、人在外头——头顶上没有屋顶、屋檐——就戴上；进了屋、走到檐下就卸下。
 * 戴、卸的样子在 figure.ts（Figure.gear / setGear）：斗笠从背后翻上头、蓑衣自肩上披下来，约一秒，手空着时右手扶着笠沿。
 *
 *   shelterAt(x, y, z)  这一点在不在屋顶底下：用的是画法登记的那十六处屋顶（ink.ts 的 setRoofs，草堂连檐口、亭、各家……），
 *                       与「雨不打湿、雪不积」是同一份——画里哪里不淋雨，人在那里就不戴。
 *   SKY / setSky        此刻的雨、雪（0…1）：村里那一路每帧报一次（life/index.ts），行者的 Idle 取雪用（Idle 自己只拿到雨）。
 */
import { U } from '../ink/ink';

/** 此刻的雨、雪（0…1，渐变着的）。没人报过就当晴 */
export const SKY = { rain: 0, snow: 0 };
export function setSky(rain: number, snow: number) { SKY.rain = rain || 0; SKY.snow = snow || 0; }

/**
 * (x, y, z) 在不在屋顶底下（世界坐标；y 给头顶那么高）。与画法里的 inkShelter 一样的盒子：
 * 转回屋子自己的方向，平面上在盒子里（边上让出几厘米）、高度在盒底与盒顶之间
 */
export function shelterAt(x: number, y: number, z: number): boolean {
  const all = U.uRoofAll.value;
  if (x < all.x || z < all.y || x > all.z || z > all.w) return false;
  const A = U.uRoofA.value, B = U.uRoofB.value;
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    if (a.z <= 0) continue;
    const b = B[i], dx = x - a.x, dz = z - a.y;
    const lx = dx * b.x + dz * b.y, lz = -dx * b.y + dz * b.x;
    if (Math.abs(lx) < a.z - 0.05 && Math.abs(lz) < a.w - 0.05 && y > b.z - 0.3 && y < b.w + 0.05) return true;
  }
  return false;
}
/**
 * (x, z) 离哪一处屋顶的边不到 pad 米（平面上，不管多高）：村里人雨天在檐下干活，站处多半在檐口外一点点
 * （画里檐下也可能淋到雨，README 里记着），干着活的人按这个算在檐下，不披蓑衣
 */
export function nearRoof(x: number, z: number, pad: number): boolean {
  const all = U.uRoofAll.value;
  if (x < all.x - pad || z < all.y - pad || x > all.z + pad || z > all.w + pad) return false;
  const A = U.uRoofA.value, B = U.uRoofB.value;
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    if (a.z <= 0) continue;
    const b = B[i], dx = x - a.x, dz = z - a.y;
    const lx = dx * b.x + dz * b.y, lz = -dx * b.y + dz * b.x;
    if (Math.abs(lx) < a.z + pad && Math.abs(lz) < a.w + pad) return true;
  }
  return false;
}
/** 下到几成算「在下」（戴雨具）：雨、雪大于这个 */
export const WET = 0.42;
