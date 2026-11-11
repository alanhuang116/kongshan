/** 整座寺与山（不含植物、器物）：看总体布局与光 */
import * as THREE from 'three';
import type { Make } from '../models';
import { createTemple } from '../../world/arch/temple';
import { createTerrain, groundY, scatterRocks } from '../../world/env/terrain';
import { L } from '../../world/layout';

const MODELS: Record<string, Make> = {
  temple: ({ mats, q }) => {
    const g = new THREE.Group();
    const t = createTemple(mats, q);
    t.group.traverse((o) => { if (o.userData.ground) o.position.y = groundY(L.pagoda.x, L.pagoda.z) - 0.5; });
    g.add(t.group, createTerrain(mats, q).group, scatterRocks(mats, q));
    return g;
  },
};
export default MODELS;
