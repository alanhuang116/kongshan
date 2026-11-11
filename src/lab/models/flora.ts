/** 植物：/lab.html?m=pine|heropine|…&s=spring|summer|autumn|winter */
import * as THREE from 'three';
import type { Make } from '../models';
import { createFlora, type FloraLayout } from '../../world/env/flora';
import type { Season } from '../../world/env/atmos';
import { shared } from '../../world/core/mats';

// 调试用：在控制台里改风（__shared.uWind.value.z 是风力）
(window as unknown as Record<string, unknown>).__shared = shared;

const qs = new URLSearchParams(location.search);
const season = (qs.get('s') as Season) ?? 'autumn';
const seedV = Number(qs.get('v') ?? 0);
const show = (layout: FloraLayout): Make => ({ mats, q, atmos }) => {
  // 台子的头一两帧 dt 可能是负的，天时会因此随机带上一点雪雾（见 docs/FLORA.md「给主代理」）；这里把天气权重按所选的天气重新落定，截图才稳
  for (const ms of [250, 500, 800]) setTimeout(() => atmos.setWeather(atmos.weather, true), ms);
  const f = createFlora(mats, qs.get('a2c') === '0' ? { ...q, msaa: 0, post: true } : q, layout, season);
  console.warn('flora stats ' + JSON.stringify(f.stats));
  (window as unknown as Record<string, unknown>).__flora = f;
  return f.group;
};

const MODELS: Record<string, Make> = {
  pine: show({ pines: [0, 1, 2, 3].map((v) => ({ x: (v - 1.5) * 9, y: 0, z: 0, v, r: 0.6 * v })), farPines: [{ x: 22, y: 0, z: 0, v: 0 }, { x: 28, y: 0, z: 2, v: 1 }, { x: 34, y: 0, z: -1, v: 2 }] }),
  heropine: show({ heroPines: [{ x: 0, y: 0, z: 0, v: seedV, r: 0 }] }),
  ginkgo: show({ ginkgo: [{ x: 0, y: 0, z: 0, v: seedV, r: 0 }] }),
  maple: show({ maples: [0, 1, 2].map((v) => ({ x: (v - 1) * 7, y: 0, z: 0, v, r: v * 1.3 })) }),
  plum: show({ plums: [0, 1].map((v) => ({ x: (v - 0.5) * 5, y: 0, z: 0, v, r: v * 1.3 })) }),
  bamboo: show({ bamboo: [0, 1, 2].map((v) => ({ x: (v - 1) * 5.5, y: 0, z: v === 1 ? -2 : 0, v, r: v * 2.1 })) }),
  shrub: show({ shrubs: Array.from({ length: 12 }, (_, i) => ({ x: (i % 6 - 2.5) * 1.1, y: 0, z: Math.floor(i / 6) * 1.2 - 0.6, v: i, r: i * 1.7, s: 0.9 + (i % 3) * 0.15 })) }),
  lotus: (c) => {
    const g = new THREE.Group();
    g.add(show({ lotus: { x: 0, y: 0, z: 0, rx: 5, rz: 3.2, count: 46 } })(c) as THREE.Object3D);
    const water = new THREE.Mesh(new THREE.CircleGeometry(9, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0c1512, roughness: 0.08, metalness: 0 }));
    water.receiveShadow = true;
    g.add(water);
    return g;
  },
  grove: show({
    pines: Array.from({ length: 14 }, (_, i) => ({ x: -26 + (i % 7) * 8.5 + (i * 37 % 5), y: 0, z: -22 - Math.floor(i / 7) * 9 - (i * 13 % 4), v: i, r: i * 1.9, s: 0.85 + (i * 7 % 5) * 0.08 })),
    farPines: Array.from({ length: 40 }, (_, i) => ({ x: -70 + (i % 10) * 15 + (i * 29 % 7), y: 0, z: -60 - Math.floor(i / 10) * 14 - (i * 17 % 6), v: i, r: i * 2.3, s: 0.9 + (i * 11 % 5) * 0.08 })),
    heroPines: [{ x: 13, y: 0, z: 2, v: 2, r: 2.4 }],
    ginkgo: [{ x: -9, y: 0, z: -2, v: 0 }],
    maples: [{ x: 3, y: 0, z: 6, v: 0, r: 0.4 }, { x: -18, y: 0, z: 7, v: 1, r: 2 }],
    bamboo: [{ x: 21, y: 0, z: -9, v: 0 }, { x: 24, y: 0, z: -6, v: 1 }, { x: 19, y: 0, z: -13, v: 2 }, { x: 25, y: 0, z: -11, v: 0, r: 1.2 }],
    plums: [{ x: 7, y: 0, z: 10, v: 0 }, { x: -3, y: 0, z: 11, v: 1 }],
    shrubs: Array.from({ length: 40 }, (_, i) => ({ x: -20 + (i * 53 % 41), y: 0, z: -4 + (i * 31 % 17), v: i, r: i * 1.3 })),
  }),
};
// 接近实际用量的一整套（量建造耗时用）：松 260、远松 300、古松 3、银杏 1、枫 6、竹 30 丛、梅 4、草 200、荷 60
const rnd = (i: number, k: number) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
MODELS.full = show({
  pines: Array.from({ length: 260 }, (_, i) => ({ x: -90 + rnd(i, 1) * 180, y: 0, z: -30 - rnd(i, 2) * 90, v: i, r: rnd(i, 3) * 6.28, s: 0.8 + rnd(i, 4) * 0.45 })),
  farPines: Array.from({ length: 300 }, (_, i) => ({ x: -200 + rnd(i, 5) * 400, y: 0, z: -130 - rnd(i, 6) * 160, v: i, r: rnd(i, 7) * 6.28, s: 0.85 + rnd(i, 8) * 0.5 })),
  heroPines: [{ x: 14, y: 0, z: 2, v: 0, r: 2.4 }, { x: -16, y: 0, z: 6, v: 1, r: 0.6 }, { x: 30, y: 0, z: -8, v: 2, r: 4 }],
  ginkgo: [{ x: -8, y: 0, z: -3, v: 0 }],
  maples: Array.from({ length: 6 }, (_, i) => ({ x: -24 + i * 9 + rnd(i, 9) * 3, y: 0, z: 8 + rnd(i, 10) * 5, v: i, r: i * 1.7 })),
  bamboo: Array.from({ length: 30 }, (_, i) => ({ x: 20 + rnd(i, 11) * 16, y: 0, z: -22 + rnd(i, 12) * 16, v: i, r: rnd(i, 13) * 6.28, s: 0.85 + rnd(i, 14) * 0.3 })),
  plums: Array.from({ length: 4 }, (_, i) => ({ x: -4 + i * 5, y: 0, z: 13 + rnd(i, 15) * 2, v: i, r: i * 2.1 })),
  shrubs: Array.from({ length: 200 }, (_, i) => ({ x: -30 + rnd(i, 16) * 60, y: 0, z: -6 + rnd(i, 17) * 24, v: i, r: rnd(i, 18) * 6.28, s: 0.8 + rnd(i, 19) * 0.5 })),
  lotus: { x: 0, y: 0.02, z: 22, rx: 6, rz: 3.5, count: 60 },
});
export default MODELS;
