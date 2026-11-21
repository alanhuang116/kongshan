/**
 * 摇橹的小船：一叶平底小划子（船身借屋舍那边的 hull），船尾一根橹桩、一支橹。
 * 橹是一根长长的、略带弯的木：橹柄在船上，橹叶斜斜伸到船尾后面的水里；
 * 摇的时候橹绕着橹桩左右摆，橹叶在水里一来一回，同时顺着橹身转一个角（橹绳拽着）——所以橹叶在水里走的是一个「8」字。
 * 船的原点在船底正中，船头朝 +z；橹的原点在橹桩顶上（摆、转都绕这一点）。
 */
import * as THREE from 'three';
import { merge } from '../core/geo';
import { hull } from '../build/waterside';
import { beam, pole, v3 } from '../build/kit';
import { mats } from './kit';

export const BOAT = {
  len: 4.3, beam: 1.15, depth: 0.36,
  /** 船底在水面下多深（吃水）；船板面比船底高多少 */
  draft: 0.13, floor: 0.105,
  /** 橹桩顶（船自己的坐标）；橹柄从桩顶往前伸多长、橹从桩顶往后伸多长 */
  pin: new THREE.Vector3(0.12, 0.5, -1.95), inboard: 1.05, outboard: 2.55,
  /** 人站在船尾哪里（船自己的坐标）：橹的左手边（左舷），侧着身子 */
  stand: new THREE.Vector3(0.42, 0.105, -1.45),
};

/** 船身（不动的部分）：hull 里的外壳、内壳、舷、挡板、舱板、横梁，加一根橹桩 */
export function boatGeo(): THREE.BufferGeometry {
  const B = BOAT, gs = hull(B.len, B.beam, B.depth, 51, [-0.5, 0.05, 0.55]);
  // 橹桩：船尾当中一根短木桩，顶上一个圆头
  gs.push(pole(v3(B.pin.x, 0.25, B.pin.z), v3(B.pin.x, B.pin.y, B.pin.z), 0.028, 0.024, 6));
  return merge(gs);
}

/** 橹（原点在橹桩顶；沿 −z 往后是橹身与橹叶，沿 +z 往前是橹柄）：两截略成一个钝角，橹叶扁宽 */
export function yulohGeo(): THREE.BufferGeometry {
  const B = BOAT, gs: THREE.BufferGeometry[] = [];
  const handle = v3(0, 0.42, B.inboard), knee = v3(0, -0.06, -0.55), blade0 = v3(0, -0.42, -1.7), tipP = v3(0, -0.7, -B.outboard);
  gs.push(pole(handle, v3(0, 0.02, 0.05), 0.022, 0.03, 6));
  gs.push(pole(v3(0, 0.02, 0.05), knee, 0.032, 0.034, 6));
  gs.push(pole(knee, blade0, 0.033, 0.026, 6));
  // 橹叶：扁宽的一块（宽 0.17、厚 0.025），顺着橹身
  gs.push(beam(blade0, tipP, 0.026, 0.17));
  // 橹柄头上横着的一小截把手
  gs.push(pole(handle.clone().add(v3(-0.07, 0, 0)), handle.clone().add(v3(0.07, 0, 0)), 0.018, 0.018, 5));
  return merge(gs);
}

export function makeBoat() {
  const M = mats();
  const group = new THREE.Group();
  group.name = 'play:boat';
  const body = new THREE.Mesh(boatGeo(), M.darkwood);
  const yuloh = new THREE.Mesh(yulohGeo(), M.darkwood);
  yuloh.position.copy(BOAT.pin);
  yuloh.rotation.order = 'YXZ';
  group.add(body, yuloh);
  return { group, yuloh };
}
