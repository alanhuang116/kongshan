import type { Kongshan } from '../Kongshan';
import type { Act } from './types';
import { createBeads } from './beads';
import { createSit } from './sit';
import { createBow, createLots, createMuyu } from './hall';
import { createIncense, createSweep } from './court';
import { createBell, createDrum } from './towers';
import { createCopy, createLamp, createTea } from './quiet';

/** 寺里能做的事。哪一项的器物没备好（建模出了错），就只少那一项，别的照常。 */
export function createActs(k: Kongshan): Record<string, Act> {
  const makers: Array<[string, () => Act]> = [
    ['incense', () => createIncense(k)], ['bow', () => createBow(k)], ['muyu', () => createMuyu(k)], ['lots', () => createLots(k)],
    ['bell', () => createBell(k)], ['drum', () => createDrum(k)], ['sit', () => createSit(k)], ['beads', () => createBeads(k)],
    ['copy', () => createCopy(k)], ['lamp', () => createLamp(k)], ['sweep', () => createSweep(k, k.parts.leafTex ?? null)], ['tea', () => createTea(k)],
  ];
  // 顺序也是「两件事一样近时先提哪件」的顺序
  const out: Record<string, Act> = {};
  for (const [id, make] of makers) {
    try { out[id] = make(); } catch (e) { console.warn(`活动 ${id} 没能备好`, e); }
  }
  return out;
}
