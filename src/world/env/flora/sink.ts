/**
 * 攒草木的篮子。整片园子的草木最后只有二十来次绘制：
 *   干枝并成几块面（geo），叶、花、草各归各的「层」（dabs：一层是一种颜料、一次绘制）。
 * 每一棵树在自己的坐标里长（原点在根，y 朝上，按寻常大小），由 place() 定它落在哪、朝哪、多大。
 *
 * 每一笔带一个「次序」k（0…1）：一层里的笔按 k 排好，换季时只画前几成——
 * 春天的嫩叶、将尽的秋叶就是「同一棵树，疏一些」，不必另建一套。
 */
import * as THREE from 'three';
import type { Dab } from '../../ink/ink';
import { FGeo, type RGB } from './kit';

/** 树上的层（四季常在，换季只换颜料、疏密） */
export const LAYERS = ['peachBloom', 'plumBloom', 'fruitLeaf', 'willow', 'broadA', 'broadB', 'broadC', 'twig', 'whip', 'pine', 'bamboo', 'grass'] as const;
export type LayerId = (typeof LAYERS)[number];
/** 面：寻常的干枝、松的鳞皮、竹竿（带节；豆架瓜架也是竹）、田里的垄 */
export const GEOS = ['bark', 'pineBark', 'culm', 'soil'] as const;
export type GeoId = (typeof GEOS)[number];
export interface RDab extends Dab { /** 次序：小的先画 */ k: number }

export class Sink {
  geo = Object.fromEntries(GEOS.map((k) => [k, new FGeo()])) as Record<GeoId, FGeo>;
  dabs = Object.fromEntries(LAYERS.map((k) => [k, [] as RDab[]])) as Record<LayerId, RDab[]>;
  private ox = 0; private oy = 0; private oz = 0; private c = 1; private s = 0; private sc = 1;
  private m = new THREE.Matrix4();
  private seed = 1;

  /** 接下来这一棵落在哪（世界坐标）、绕 y 转多少、多大 */
  place(x: number, y: number, z: number, yaw = 0, scale = 1) {
    this.ox = x; this.oy = y; this.oz = z; this.c = Math.cos(yaw); this.s = Math.sin(yaw); this.sc = scale;
    this.m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(scale, scale, scale));
  }
  /** 这棵树的大小 */
  get scale() { return this.sc; }
  /** 树自己的坐标 → 世界坐标 */
  world(x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.ox + (x * this.c + z * this.s) * this.sc, this.oy + y * this.sc, this.oz + (-x * this.s + z * this.c) * this.sc);
  }
  /**
   * 落一笔（树自己的坐标）。n 是「朝外」的方向（定阴阳）；tone 乘在颜料上（小于 1 更深）；tint 再分色；
   * k 是次序（不给就随手排一个）。size 随树的大小一起放。
   */
  dab(L: LayerId, x: number, y: number, z: number, size: number, tile: number, nx = 0, ny = 1, nz = 0, tone = 1, tint: RGB | null = null, rot = 0, sway = 0.5, k = -1) {
    const c = this.c, s = this.s, sc = this.sc;
    if (k < 0) { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0; k = (this.seed >>> 8) / 16777216; }
    this.dabs[L].push({
      x: this.ox + (x * c + z * s) * sc, y: this.oy + y * sc, z: this.oz + (-x * s + z * c) * sc, size: size * sc,
      nx: nx * c + nz * s, ny, nz: -nx * s + nz * c, tile,
      r: tone * (tint ? tint[0] : 1), g: tone * (tint ? tint[1] : 1), b: tone * (tint ? tint[2] : 1), rot, sway, k,
    });
  }
  /** 把这一棵的干枝并进去 */
  wood(id: GeoId, local: FGeo) { if (local.n) this.geo[id].add(local, this.m); }
}
