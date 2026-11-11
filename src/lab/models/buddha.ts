/** 佛像 */
import * as THREE from 'three';
import type { Make } from '../models';
import { createBuddha, createFigure, figureMats, SEAT_Y } from '../../world/props/buddha';
import { buildLotus, buildMandorla, buildPedestal, petal } from '../../world/props/buddha/throne';

const MODELS: Record<string, Make> = {
  /** 整套：座、莲台、像、背光 */
  buddha: ({ mats, q }) => createBuddha(mats, q),
  /** 只有坐像（原点在坐处） */
  buddhaFig: ({ mats, q }) => createFigure(mats, q),
  /** 只有头（看脸） */
  buddhaFace: async ({ mats, q }) => {
    const f = await createFigure(mats, q);
    f.children.filter((c) => c.name === 'buddha:body').forEach((c) => { c.visible = false; });
    return f;
  },
  /** 不要发（看头形） */
  buddhaBald: async ({ mats, q }) => {
    const f = await createFigure(mats, q);
    f.children.filter((c) => c.name === 'buddha:hair').forEach((c) => { c.visible = false; });
    return f;
  },
  /** 取不到模型时的退路 */
  buddhaFallback: async ({ mats, q }) => {
    const f = window.fetch;
    window.fetch = () => Promise.reject(new Error('（试退路）'));
    try { return await createBuddha(mats, q); } finally { window.fetch = f; }
  },
  lotus: ({ mats, q }) => buildLotus(mats, q, figureMats(mats).gold),
  pedestal: ({ mats, q }) => buildPedestal(mats, q),
  mandorla: ({ mats, q }) => buildMandorla(mats, q, figureMats(mats).gold).group,
  petal: ({ mats }) => new THREE.Mesh(petal(0.6, 0.5, 0.1, 0.1), mats.gold),
  /** 殿里的样子：昏暗，几支烛，深色的后壁与地（配 h=21 看） */
  buddhaHall: async ({ mats, q }) => {
    const g = new THREE.Group();
    const bd = await createBuddha(mats, q);
    g.add(bd);
    bd.userData.gold.envMapIntensity = 0.35; bd.userData.hair.envMapIntensity = 0.3; bd.userData.glow.envMapIntensity = 0.35;
    bd.userData.glow.emissiveIntensity = 1;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 0.3), new THREE.MeshStandardMaterial({ color: 0x241a15, roughness: 0.9 }));
    wall.position.set(0, 4.5, -3.2); wall.receiveShadow = true;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(24, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.7 }));
    floor.position.set(0, -0.1, 3); floor.receiveShadow = true;
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(24, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 1 }));
    ceil.position.set(0, 6.3, 3);
    g.add(wall, floor, ceil);
    // 烛：供桌上两支、两侧长明灯各一
    const candle = (x: number, y: number, z: number, i: number, d = 14) => {
      const l = new THREE.PointLight(0xffb169, i, d, 1.6);
      l.position.set(x, y, z);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
      s.position.copy(l.position);
      g.add(l, s);
    };
    candle(-1.6, 1.35, 3.4, 9); candle(1.6, 1.35, 3.4, 9);
    candle(-3.8, 2.4, 1.6, 7); candle(3.8, 2.4, 1.6, 7);
    // 梁下的长明灯：自前上方来的一点柔光（脸不能只靠自下而上的烛光）
    const lamp = new THREE.PointLight(0xffc98a, 16, 16, 1.5);
    lamp.position.set(0, 5.6, 4.2);
    g.add(lamp);
    // 门口进来的天光（很弱，自前上方）
    const door = new THREE.DirectionalLight(0x9fb4d0, 0.35);
    door.position.set(0.5, 3, 12);
    g.add(door);
    g.userData.seat = SEAT_Y;
    return g;
  },
};
export default MODELS;
