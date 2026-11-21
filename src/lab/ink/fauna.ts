/**
 * 台子上看生灵（fauna/）：
 *   beast  who=dog|cat|sheep|goat|lamb|donkey|deer|fawn  一排姿态（站、坐、卧……），yaw=度
 *          gait=1 改看一排步态（一个周期里的八个相位）：v=速度（米/秒）
 *   flock  天上的鸟（雁阵、寒鸦、鹤……）的笔触图集，一格一格摆出来看
 * 整村里的样子（在真的地上、真的屋前）用 life.ts 的 animals、lifeAll，或 /world.html。
 */
import * as THREE from 'three';
import type { LabMake } from '../ink-lab';
import { Parts, creatureMat } from '../../world/life/rig';
import { Quad, type Pose, type QuadDims, type QuadGeo } from '../../world/life/fauna/quad';
import { DOG, dogGeo } from '../../world/life/fauna/dog';
import { CAT_POSES, catGeo } from '../../world/life/fauna/cat';
import { SHEEP } from '../../world/life/fauna/sheep';
import { DONKEY, donkeyGeo } from '../../world/life/fauna/donkey';

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qs.has(k) && qs.get(k) !== '' ? Number(qs.get(k)) : d);

type Kit = { geo: () => QuadGeo; D: QuadDims; poses: Record<string, Pose>; body: number; s?: number; stride: number };
const KITS: Record<string, () => Kit> = {
  dog: () => ({ geo: dogGeo, D: DOG.D, poses: { STAND: DOG.STAND, SNIFF: DOG.SNIFF, SIT: DOG.SIT, BOW: DOG.BOW, LIE: DOG.LIE, CURL: DOG.CURL, BELLY: DOG.BELLY }, body: 0.22, stride: 0.7 }),
  cat: () => ({ geo: catGeo, D: CAT_POSES.D, poses: { STAND: CAT_POSES.STAND, SIT: CAT_POSES.SIT, GROOM: CAT_POSES.GROOM, STRETCH: CAT_POSES.STRETCH, CROUCH: CAT_POSES.CROUCH, LOAF: CAT_POSES.LOAF, CURL: CAT_POSES.CURL }, body: 0.5, stride: 0.42 }),
};
KITS.sheep = () => ({ geo: () => SHEEP.sheepGeo(true, 2), D: SHEEP.DS, poses: { STAND: SHEEP.STAND_S, GRAZE: SHEEP.GRAZE_S, LIE: SHEEP.LIE_S }, body: 0.6, stride: 0.95 });
KITS.lamb = () => ({ geo: () => SHEEP.sheepGeo(false, 1), D: SHEEP.DS, poses: { STAND: SHEEP.STAND_S, GRAZE: SHEEP.GRAZE_S, LIE: SHEEP.LIE_S }, body: 0.6, s: 0.55, stride: 0.55 });
KITS.goat = () => ({ geo: SHEEP.goatGeo, D: SHEEP.DG, poses: { STAND: SHEEP.STAND_G, GRAZE: SHEEP.GRAZE_G, LIE: SHEEP.LIE_G }, body: 0.6, stride: 0.95 });
KITS.donkey = () => ({ geo: donkeyGeo, D: DONKEY.D, poses: { STAND: DONKEY.STAND, DOZE: DONKEY.DOZE, GRAZE: DONKEY.GRAZE, BRAY: DONKEY.BRAY }, body: 0.15, stride: 1.3 });
/** 外面的模块可以往这里添（羊、驴、鹿……各自登记） */
export function addKit(name: string, k: () => Kit) { KITS[name] = k; }

const beast: LabMake = () => {
  const who = qs.get('who') ?? 'dog', mk = KITS[who] ?? KITS.dog, K = mk();
  const P = new Parts(creatureMat({ body: K.body, shade: 1.45 }), 'lab:' + who), g = K.geo(), yaw = (num('yaw', 90) * Math.PI) / 180;
  const quads: Quad[] = [], names = Object.keys(K.poses), gait = qs.get('gait') === '1', n = gait ? 8 : names.length, gap = num('gap', K.D.bodyY * 2.6);
  for (let i = 0; i < n; i++) quads.push(new Quad(P, g, K.D, K.s ?? 1));
  P.build();
  quads.forEach((q, i) => {
    q.x = (i - (n - 1) / 2) * gap; q.z = 0; q.yaw = yaw;
    if (gait) {
      q.snap(K.poses.STAND); q.v = num('v', 0.8); q.gait = q.v > 2 ? 2 : q.v > 0.9 ? 1 : 0;
      q.ph = (i / n) * Math.PI * 2;
      q.place(0, 0, 0, K.stride);
    } else { q.snap(K.poses[names[i]]); q.place(0, 0, 0, K.stride); }
  });
  P.commit();
  console.warn(`STATS ${who}：每只三角 ${Math.round(P.triangles / n)}`);
  const obj = new THREE.Group(); obj.add(P.mesh);
  return { obj, view: { az: num('az', 18), el: num('el', 8), d: num('d', gap * n * 0.95), tx: 0, ty: K.D.bodyY * 0.8, tz: 0 } };
};

export const MODELS: Record<string, LabMake> = { beast };
