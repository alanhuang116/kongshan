/**
 * 照总图（site.ts）开草木的单子：哪些树、地势、哪边是水、哪里是屋、哪些树只作景，田、菜畦、菊圃、池，人家门前屋后的零碎。
 * 总图怎么改，这里跟着变——不另记一套位置。
 */
import { PLOTS, RIVER_Y, SITE, TREES, ground, pathDist, riverAt, streamAt, type Rect } from '../../site';
import type { Plan } from './build';
import { siteExtras } from './extras';

export function sitePlan(): Plan {
  const H = SITE.hall, W = SITE.wing, P = SITE.pond, B = SITE.bounds;
  const walls: Rect[] = [
    { x0: H.x - H.w / 2, x1: H.x + H.w / 2, z0: H.z - H.d / 2, z1: H.z + H.d / 2 },
    { x0: W.x - W.w / 2, x1: W.x + W.w / 2, z0: W.z - W.d / 2, z1: W.z + W.d / 2 },
  ];
  return {
    trees: TREES, ground, focus: SITE.table, walls,
    // 水在哪边：池近就朝池，河滩上朝河，否则朝溪
    water: (x, z) => {
      if (Math.hypot(x - P.x, z - P.z) < Math.max(P.rx, P.rz) + 14) return [P.x - x, P.z - z];
      const river = ground(x, z) < RIVER_Y + 3, d = (px: number, pz: number) => (river ? riverAt(px, pz).d : streamAt(px, pz).d);
      const gx = d(x + 1, z) - d(x - 1, z), gz = d(x, z + 1) - d(x, z - 1);
      return Math.hypot(gx, gz) > 1e-4 ? [-gx, -gz] : null;
    },
    // 北坡上的林只是景：近人走得到的地方的那几排多画几笔
    scenery: (t) => (t.kind === 'wood' && t.z < -36 ? (t.z > -62 ? 1 : 2) : 0),
    // 草铺到人走得到的范围外一点
    cover: { x0: B.x0 - 8, x1: B.x1 + 10, z0: B.z0 - 8, z1: B.z1 + 4 },
    plots: PLOTS, veg: SITE.veg, mums: SITE.mums, pond: P,
    clear: (x, z) => pathDist(x, z) > 0.45,
    extras: siteExtras(),
  };
}
