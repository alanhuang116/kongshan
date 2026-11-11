/** 建筑 */
import * as THREE from 'three';
import { Builder } from '../../world/core/geo';
import { buildRoof } from '../../world/arch/roof';
import { buildHall, dougongSet, type HallSpec } from '../../world/arch/frame';

export const MAIN_HALL: HallSpec = {
  xs: [-11, -7, -2.5, 2.5, 7, 11], zs: [-6, -2, 2, 6], colH: 5, colR: 0.3, base: 1.5, baseOut: 3.0,
  steps: [{ side: 'f', at: 0, w: 5.4 }, { side: 'l', at: 4, w: 2.4 }, { side: 'r', at: 4, w: 2.4 }],
  dougong: 2, dk: 1.25, out: 3.7,
  bays: (side, i, n) => (side === 'f' ? (i === 0 || i === n - 1 ? 'window' : 'door') : 'wall'),
  roof: { rise: 6.1, Rg: 7.0, sg: 1, lift: 0.95, flying: true },
  interior: true,
};

import type { Make } from '../models';

const M0 = (mats: unknown) => mats as Record<string, THREE.Material>;
const MODELS: Record<string, Make> = {
  hall: ({ mats }) => { const b = new Builder(); buildHall(b, MAIN_HALL); return b.build(M0(mats), { name: 'hall' }); },
  dougong: ({ mats }) => { const b = new Builder(); b.add('wood', dougongSet(1)); b.add('wood', dougongSet(1, true).translate(3, 0, 0)); return b.build(M0(mats), { name: 'dg' }); },
  roof: ({ mats }) => {
    const b = new Builder();
    buildRoof(b, { W: 14, D: 9.5, y0: 7, rise: 5.4, Rg: 7.2, sg: 1, lift: 0.9, purlin: 2.2, flying: true });
    return b.build(mats as unknown as Record<string, THREE.Material>, { name: 'roof' });
  },
  xieshan: ({ mats }) => {
    const b = new Builder();
    buildRoof(b, { W: 9, D: 6.5, y0: 5, rise: 4.2, Rg: 5.4, sg: 0.5, lift: 0.7, purlin: 1.8, flying: true });
    return b.build(mats as unknown as Record<string, THREE.Material>, { name: 'roof' });
  },
  gable: ({ mats }) => {
    const b = new Builder();
    buildRoof(b, { W: 6, D: 3.6, y0: 3.4, rise: 2.2, Rg: 6, sg: 0, purlin: 1.0, ends: 'plain' });
    return b.build(mats as unknown as Record<string, THREE.Material>, { name: 'roof' });
  },
  pyramid: ({ mats }) => {
    const b = new Builder();
    buildRoof(b, { W: 4.2, D: 4.2, y0: 6, rise: 3.4, Rg: 0, sg: 1, lift: 0.7, purlin: 1.3, finial: 1.5, a: 0.4 });
    return b.build(mats as unknown as Record<string, THREE.Material>, { name: 'roof' });
  },
};
export default MODELS;
