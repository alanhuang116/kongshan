/**
 * 屋舍与器物：安乐窝里人手造的一切——草堂与屋里的陈设、东厢、竹篱柴门与门联、院里的石桌石凳与圭表、小石桥与汀步、
 * 观物亭、邻家几户与村塾、井、槐下的石凳、修着的木桥、渡口的船、田里的草人与窝棚、溪边的桔槔。
 * 全是程序搭的，用画法（ink.ts）的材质；位置、尺寸都取自总图（site.ts）。清单、挂点、数目见 docs/PROPS.md。
 */
import type * as THREE from 'three';
import type { Quality } from '../core/World';
import { assemble } from './make';

export interface BuildOpts { q: Quality }
export interface Buildings {
  group: THREE.Group;
  /** 草堂的屋顶、南墙（连门窗）：人进了屋要隐去，好看见屋里——所以各自是独立的一组 */
  hallRoof: THREE.Object3D; hallFront: THREE.Object3D;
  /** 交互用的挂点：位置、朝向都在世界坐标里（Object3D，+z 是「面朝」的方向） */
  anchors: Record<string, THREE.Object3D>;
  /** 能被拿起来、摆弄的东西（各自是独立的 Object3D，原点在好拿的地方） */
  parts: Record<string, THREE.Object3D>;
  /** 灯火亮几成（0…1）：窗纸透出的暖光、屋里的一盏灯 */
  setLamp(k: number): void;
  update(dt: number, t: number): void;
}
export function createBuildings(o: BuildOpts): Promise<Buildings> { return assemble(o); }
