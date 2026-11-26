/**
 * 蹴鞠的器物：一只鞠（门前明堂东边的草地上，不踢时搁在草里）。
 *   宋鞠是十二片熟皮缝的，里头一个吹足了气的胞（「香皮十二片，密砌缝成」）：这里是一只赭黄的皮球，几道深色的缝线。
 *   地上：鞠的影子（一点淡墨，鞠越高越淡）、要落到自己跟前时脚下一圈墨晕（越近越小——那一刻就是该踢的时候）。
 */
import * as THREE from 'three';
import { R } from './games/ball';
import { PIG, wash } from '../ink/ink';

/** 鞠的网格：赭黄的皮，几道缝线（顶点色，近处看得出几片） */
export function ballMesh(): THREE.Mesh {
  const g = new THREE.SphereGeometry(R, 18, 12).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute, n = p.count, c = new Float32Array(n * 3);
  const hide: [number, number, number] = [0.86, 0.68, 0.46];
  for (let i = 0; i < n; i++) {
    const x = p.getX(i) / R, y = p.getY(i) / R, z = p.getZ(i) / R;
    // 缝线：三道大圆加一道斜的（十二片的意思到了就好）
    const seam = Math.min(Math.abs(x), Math.abs(y), Math.abs(z), Math.abs(0.7 * x + 0.7 * y) * 1.4);
    const k = seam < 0.07 ? 0.55 : 0.94 + 0.06 * Math.sin(x * 9 + z * 7);
    c[i * 3] = hide[0] * k; c[i * 3 + 1] = hide[1] * k; c[i * 3 + 2] = hide[2] * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, wash({ pig: [1, 1, 1], dens: 1, body: 0.25, shade: 1.45, grain: 2.2, line: 0.75 }));
  m.name = 'games:ball';
  return m;
}
export const SHADOW = PIG.mo;
