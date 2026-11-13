/**
 * 台子上的样例：一株桃、几块石、一段竹篱。看它就知道一件东西怎么用画法搭出来——
 * 枝干与石是「面」（wash），花与叶是「一笔一笔点上去的」（dabMesh），许多零件并成很少的几次绘制（Builder / FGeo）。
 */
import * as THREE from 'three';
import { PIG, dabMat, dabMesh, wash, type Dab } from '../../world/ink/ink';
import { TILES, atlas } from '../../world/ink/brush';
import { Builder, M, cylUp, rockGeo } from '../../world/core/geo';
import { FGeo, limb, rand, tube, v3 } from '../../world/env/flora/kit';
import type { LabMake } from '../ink-lab';

const sample: LabMake = ({ q }) => {
  const g = new THREE.Group(), R = rand(7);
  // —— 石：淡墨的面 + 皴；竹篱：细竿，全靠勾线 ——
  const mats = {
    stone: wash({ pig: PIG.mo, dens: 0.8, shade: 2.0, cun: 1.1, grain: 1.2 }),
    bamboo: wash({ pig: [0.84, 0.8, 0.55], dens: 1.3, shade: 1.4 }),
  };
  const b = new Builder();
  for (let i = 0; i < 4; i++) { const s = R.r(0.3, 0.8); b.add('stone', rockGeo(i + 3, s * R.r(0.9, 1.5), s * R.r(0.5, 0.9), s).applyMatrix4(M.mul(M.t(1.6 + i * 0.9, -s * 0.12, 1.2 + R.pm(0.6)), M.ry(R() * 6)))); }
  for (let x = -4; x <= -1; x += 0.16) b.add('bamboo', cylUp(0.014, 0.016, 1.05 + 0.12 * Math.sin(x * 7.1), 5).applyMatrix4(M.mul(M.t(x, 0, 1.5), M.rz(0.05 * Math.sin(x * 3.3)))));
  for (const y of [0.35, 0.82]) b.add('bamboo', cylUp(0.02, 0.02, 3.1, 6).applyMatrix4(M.mul(M.t(-4.05, y, 1.52), M.rz(-Math.PI / 2))));
  g.add(b.build(mats, { name: 'props' }));

  // —— 桃：干与枝是沿折线扫出的管（记下枝梢），花一簇一簇点在枝梢上 ——
  const bark = new FGeo(), tips: Array<{ p: THREE.Vector3; k: number }> = [];
  const trunk = limb(R, v3(0, -0.1, 0), v3(0.15, 1, 0.05).normalize(), 1.2, 5, { jitter: 0.12 });
  tube(bark, trunk, trunk.map((_, i) => 0.1 * (1.25 - 0.5 * (i / 5))), { sides: 7, col: [0.62, 0.52, 0.5], vPerM: 1, uSpan: 0.6 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + R.pm(0.5), d = v3(Math.cos(a), 0.55 + R.pm(0.25), Math.sin(a)).normalize();
    const pts = limb(R, trunk[3 + (i % 3)], d, R.r(1.7, 2.5), 6, { jitter: 0.2, zig: 0.22 });
    tube(bark, pts, pts.map((_, k) => 0.055 * (1 - 0.75 * (k / 6)) + 0.012), { sides: 5, col: [0.62, 0.52, 0.5], vPerM: 1, uSpan: 0.3, sway: (k) => 0.15 * (k / 6) });
    for (let j = 0; j < 5; j++) {
      const tp = limb(R, pts[2 + R.i(5)], v3(d.x + R.pm(0.9), 0.35 + R.pm(0.5), d.z + R.pm(0.9)).normalize(), R.r(0.5, 1.1), 3, { jitter: 0.25, zig: 0.3 });
      tube(bark, tp, tp.map((_, k) => 0.028 * (1 - k / 3.6) + 0.006), { sides: 4, col: [0.62, 0.52, 0.5], vPerM: 1, uSpan: 0.2, sway: (k) => 0.2 + 0.25 * (k / 3) });
      for (let k = 1; k <= 3; k++) tips.push({ p: tp[k], k: k / 3 });
    }
    for (let k = 3; k <= 6; k++) tips.push({ p: pts[k], k: k / 6 });
  }
  g.add(new THREE.Mesh(bark.build(), wash({ pig: [0.66, 0.6, 0.6], dens: 2.3, shade: 1.6, streak: [9, 1.6, 0.55], sway: 1, grain: 2 })));
  const A = atlas([TILES.blossom, TILES.blossom, TILES.blossom, TILES.bloom, TILES.blossom, TILES.blossom, TILES.bloom, TILES.dots], 4, Math.round(192 * q.tex), 3);
  const dabs: Dab[] = [];
  for (const tp of tips) for (let n = 0; n < 2; n++) {
    const x = tp.p.x + R.pm(0.22), y = tp.p.y + R.pm(0.2), z = tp.p.z + R.pm(0.22), tone = R.r(0.82, 1.12);
    // nx ny nz：这一笔朝外的方向（定明暗），取「从树心指向它」
    dabs.push({ x, y, z, size: R.r(0.3, 0.5), nx: x, ny: y - 1.7, nz: z, tile: R.i(7), r: tone, g: tone * R.r(0.92, 1.05), b: tone, rot: R() * 6.28, sway: 0.5 + 0.5 * tp.k });
  }
  // 花是粉彩（body）：不透明，夜里、远处也留着颜色
  g.add(dabMesh(dabs, dabMat({ ...A, pig: [0.97, 0.7, 0.74], accent: [0.78, 0.22, 0.3], dens: 0.95, shade: 1.35, body: 0.72, sway: 0.5 })));
  return { obj: g, view: { az: 20, el: 8, d: 11, ty: 1.6 } };
};

export const MODELS: Record<string, LabMake> = { sample };
