/**
 * 草木：桃林、柳、松、梅、竹、桑、槐与杂树，田里的庄稼，菜畦、菊圃、池荷，水边的芦苇，地上疏疏的几笔草。
 * 位置全照总图（site.ts）；画法见 docs/INK.md，各样东西怎么长、四季怎么换见 docs/FLORA.md。
 */
import type * as THREE from 'three';
import type { Quality } from '../../core/World';
import type { Season } from '../atmos';
import { buildFlora } from './build';
import { sitePlan } from './plan';

export interface FloraOpts { q: Quality; season: Season }
export interface Flora {
  group: THREE.Group;
  /** 换季：花开花落、叶色、庄稼 */
  setSeason(s: Season): void;
  /** 每帧。night 0…1；wind 约 0.05…0.3；player 是人的位置 */
  update(dt: number, t: number, o: { night: number; wind: number; player: THREE.Vector3 }): void;
  /** 桃林里花最盛的几处（世界坐标，枝头高度），给落花用 */
  bloomSpots: THREE.Vector3[];
  /** 总图的 TREES 之外、草木自己添的树（人家的果树、茶棚边的老柳）：树干在哪、多粗——走路的要绕开 */
  extraTrunks: Array<{ x: number; z: number; r: number }>;
}
export function createFlora(o: FloraOpts): Flora {
  return buildFlora(o, sitePlan());
}
