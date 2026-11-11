/**
 * 往寺里添东西：佛像、法器供具、匾联、灯火、香烟、薄雾、草木。位置都在这里定；各项活动从这里取它们要用的器物。
 */
import * as THREE from 'three';
import type { Kongshan } from './Kongshan';
import type { Season } from './env/atmos';
import { Smoke } from './fx/smoke';
import { Shafts } from './fx/shafts';
import { L } from './layout';
import { box, cyl, lathe, merge, tint } from './core/geo';
import { enhance, variant } from './core/mats';
import { softSprite } from './core/tex';
import * as P from './props';
import { createBuddha, type BuddhaInfo } from './props/buddha';
import { groundY, scatterPines } from './env/terrain';
import { createFlora, type Flora, type TreePoint } from './env/flora';
import { mulberry32, rr } from './core/rng';

export const H = 1.56;   // 殿内地面
/** 院中香炉的大小：按行者的身量（一米五八），炉口到胸口 */
const CENSER_K = 0.86;
export interface SceneParts {
  setSeason(s: Season): void;
  update(dt: number, t: number): void;
  onRipple?(x: number, z: number): void;
  /** 院中香炉：灰面中心（世界坐标）与半径；两座烛台的烛芯 */
  censer: { ash: THREE.Vector3; r: number; flames: THREE.Vector3[] };
  /** 殿内 */
  kneel: THREE.Vector3;
  buddha: (THREE.Group & { userData: BuddhaInfo }) | null;
  muyu: THREE.Group; qing: THREE.Group; lots: THREE.Group;
  bell: THREE.Group; log: THREE.Group; drum: THREE.Group;
  desk: THREE.Group; tea: THREE.Group; holder: THREE.Group; broom: THREE.Group;
  /** 几个蒲团的位置（地面上的一点）：经房案前、茶寮几前、云台亭里静坐的与拨念珠的 */
  seat: { study: THREE.Vector3; tea: THREE.Vector3; sit: THREE.Vector3; beads: THREE.Vector3 };
  /** 做一盏莲灯（放灯时一盏盏生出来） */
  lotusLamp(): THREE.Group;
  /** 银杏叶的贴图（扫叶用；植物接进来以后才有） */
  leafTex?: THREE.Texture | null;
}

const wp = (o: THREE.Object3D, v: THREE.Vector3) => { o.updateMatrixWorld(true); return v.clone().applyMatrix4(o.matrixWorld); };

export async function buildScene(k: Kongshan, prog: (v: number, s: string) => void): Promise<SceneParts> {
  const { mats, q } = k, scene = k.world.scene;
  const hx = L.hall.x, hz = L.hall.z;
  const put = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T => { o.position.set(x, y, z); o.rotation.y = ry; k.adopt(o); scene.add(o); return o; };
  const glowTex = softSprite(64, 21, 0.05);
  /** 一团灯晕（夜里随灯亮起来） */
  const halo = (pos: THREE.Vector3, size: number, color: [number, number, number], base = 0.5) => {
    const sp = new THREE.Sprite(enhance(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color().setRGB(...color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })));
    sp.position.copy(pos); sp.scale.setScalar(size); sp.renderOrder = 7; scene.add(sp);
    k.atmos.addLamp((v) => { sp.material.opacity = base * v; sp.visible = v > 0.02; });
    return sp;
  };

  // —— 殿门的光柱、殿里的浮尘 ——
  k.shafts = new Shafts([-4.75, 0, 4.75].map((x) => ({ x0: hx + x - 1.7, x1: hx + x + 1.7, y0: H + 0.2, y1: H + 3.7, z: hz + 6, floor: H })));
  scene.add(k.shafts.mesh);
  k.ambient.group.children.forEach((c) => { if ((c as THREE.Points).isPoints) c.position.set(hx, 0, hz); });

  // —— 院中：香炉、烛台、石灯 ——
  const censerG = put(P.courtCenser(mats, q), L.censer.x, 0, L.censer.z);
  censerG.scale.setScalar(CENSER_K);
  const ash = wp(censerG, new THREE.Vector3(0, censerG.userData.ashY as number, 0));
  const censerFlames: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const st = put(P.lampStand(mats, q, true), L.censer.x + s * 0.92, 0, L.censer.z + 0.8);
    const f = wp(st, st.userData.flame as THREE.Vector3);
    censerFlames.push(f);
    k.flames.add(f, 0.075, { halo: 0.7 });
  }
  const censerSmoke = k.addSmoke(new Smoke([-0.09, 0.02, 0.1].map((x, i) => new THREE.Vector3(ash.x + x, ash.y + 0.3, ash.z + (i - 1) * 0.05)), { points: 64, rise: 0.34, w1: 0.17, alpha: 0.55 }));
  censerSmoke.warm(7, k.world.camera, new THREE.Color(0.7, 0.72, 0.74));
  // 殿前正中一座石灯（唐代的燃灯塔是殿前居中一座）
  const lantern = put(P.stoneLantern(mats, q), L.lantern.x, 0, L.lantern.z);
  const lampMat = lantern.userData.lamp as THREE.MeshStandardMaterial, lampAt = wp(lantern, lantern.userData.light as THREE.Vector3);
  const lanternLight = new THREE.PointLight(0xffb060, 0, 15, 1.7); lanternLight.position.copy(lampAt); scene.add(lanternLight);
  k.atmos.addLamp((v) => { lampMat.emissiveIntensity = 0.15 + 2.6 * v; lanternLight.intensity = 9 * v; });
  halo(lampAt, 2.2, [1.0, 0.6, 0.25], 0.55);

  // —— 匾与联 ——
  try {
    const gp = put(P.plaque(mats, q, '空山', { size: 0.62 }), L.gate.x, 0.7 + 3.03 + 0.26 + 0.1, L.gate.z + 2.3 + 0.18); gp.rotation.x = 0.1;
    const hp = put(P.plaque(mats, q, '大雄宝殿', { size: 0.62 }), hx, 1.5 + 3.7 + 0.26 + 0.12, hz + 6 + 0.2); hp.rotation.x = 0.12;
    const c1 = P.couplet(mats, q, '溪声便是广长舌', { size: 0.34 }), c2 = P.couplet(mats, q, '山色岂非清净身', { size: 0.34 });
    const cy = 1.5 + 0.95;
    put(c1, hx + 2.5, cy, hz + 6 + 0.33); put(c2, hx - 2.5, cy, hz + 6 + 0.33);
    const g1 = P.couplet(mats, q, '竹径通幽处', { size: 0.3, style: 'wood' }), g2 = P.couplet(mats, q, '禅房花木深', { size: 0.3, style: 'wood' });
    const gy = 0.7 + 0.85;
    put(g1, L.gate.x + 2.1, gy, L.gate.z + 2.3 + 0.28); put(g2, L.gate.x - 2.1, gy, L.gate.z + 2.3 + 0.28);
  } catch (e) { console.warn('匾联', e); }

  // —— 殿内 ——
  prog(0.62, '塑像');
  let buddha: (THREE.Group & { userData: BuddhaInfo }) | null = null;
  try {
    buddha = put(await createBuddha(mats, q), hx, H, hz - 3.5);
    const bi = buddha.userData;
    // 殿内：金身别映出殿外的天
    bi.gold.envMapIntensity = 0.4; bi.hair.envMapIntensity = 0.3; bi.glow.envMapIntensity = 0.4;
    k.atmos.addLamp((v) => { bi.glow.emissiveIntensity = 0.3 + 0.5 * v; });
  } catch (e) { console.warn('佛像', e); }
  const altar = put(P.altarTable(mats, q), hx, H, hz - 0.55);
  const af = (altar.userData.flames as THREE.Vector3[]).map((f) => wp(altar, f));
  for (const f of af) k.flames.add(f, 0.062, { halo: 0.55 });
  // 殿里的烛光（两盏点光，随烛火摇曳）
  for (const f of af) k.addHallLight(new THREE.Vector3(f.x * 1.25, f.y + 0.5, f.z + 0.5), 0xffb878, 5.5, 14);
  // 梁下一盏长明灯：从前上方给佛面一点柔光（只靠供桌上的烛，光是自下而上的，脸会怪）
  k.addHallLight(new THREE.Vector3(hx, H + 5.3, hz - 1.3), 0xffd2a0, 5.0, 11);
  const ac = altar.userData.censer as { pos: THREE.Vector3; ashY: number; ashR: number };
  const aAsh = wp(altar, new THREE.Vector3(ac.pos.x, ac.ashY, ac.pos.z));
  k.addSmoke(new Smoke([-0.012, 0, 0.012].map((x) => new THREE.Vector3(aAsh.x + x, aAsh.y + 0.15, aAsh.z)), { points: 52, rise: 0.22, w1: 0.09, alpha: 0.5, curl: 0.05, wind: 0.05 })).warm(8, k.world.camera, new THREE.Color(0.6, 0.55, 0.5));
  const kneelZ = hz + L.kneeler.dz;
  put(P.kneeler(mats, q), hx, H, kneelZ);
  for (const s of [-1, 1]) put(P.kneeler(mats, q), hx + s * L.kneeler.side, H, kneelZ + L.kneeler.sideDz, s * -0.06);
  const muyu = put(P.muyu(mats, q, true), hx - 3.1, H, hz + 0.2, 0.5);
  const qing = put(P.qing(mats, q, true), hx + 3.1, H, hz + 0.2, -0.5);
  // 签筒放在门内东侧一张小几上
  const standH = 0.82;
  const stand = new THREE.Mesh(merge([box(0.52, 0.04, 0.42, 'x').translate(0, standH - 0.02, 0), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, c]) => box(0.035, standH - 0.04, 0.035, 'y').translate(a * 0.22, (standH - 0.04) / 2, c * 0.17)), box(0.46, 0.03, 0.36, 'x').translate(0, 0.2, 0)]), mats.lacquer);
  stand.castShadow = true; stand.receiveShadow = true;
  put(stand, hx + 4.9, H, hz + 3.6);
  const lots = put(P.lotTube(mats, q), hx + 4.9, H + standH, hz + 3.6);
  try {
    for (const [x, z, tone] of [[-2.5, -1.9, 0], [2.5, -1.9, 0], [-7, -1.9, 1], [7, -1.9, 1]] as const) put(P.banner(mats, q, 3.0, tone), hx + x, H + 5.0 - 0.3, hz + z + 0.36);
  } catch (e) { console.warn('幡', e); }

  // —— 钟楼、鼓楼 ——
  // 钟从梁下再垂一截铁杆挂低些：撞座落在行者胸口的高度（一米一上下），两手正好扶得住撞木
  const hang = k.temple.bellHang, BELL_DROP = 0.34;
  const bell = put(P.bigBell(mats, q), hang.x, hang.y - BELL_DROP, hang.z);
  const rod = new THREE.Mesh(cyl(0.02, 0.02, BELL_DROP + 0.06, 8).translate(0, -(BELL_DROP + 0.06) / 2 + 0.03, 0), mats.lacquer);
  put(rod, hang.x, hang.y, hang.z);
  const bs = bell.userData.strike as THREE.Vector3;
  // 撞木：楼上只有四米半见方，木头做短些（两米三的会伸到栏外去）；绳长正好够到梁底
  const LOG_K = 0.62;
  const log = P.bellLog(mats, q, hang.y - (bell.position.y + bs.y) - 0.107);
  log.scale.z = LOG_K;
  const lh = log.userData.head as THREE.Vector3;
  // 撞木横在钟的南面，撞击端正对撞座
  put(log, bell.position.x, bell.position.y + bs.y - lh.y, bell.position.z + bs.z - lh.z * LOG_K + 0.04);
  // 吊撞木的那根梁：从挂钟的大梁搭到南檐
  const logBeam = new THREE.Mesh(box(0.28, 0.34, 2.36, 'z').translate(0, 0.17, 1.18), mats.wood);
  logBeam.receiveShadow = true;
  put(logBeam, hang.x, hang.y, hang.z);
  const drum = put(P.drum(mats, q), k.temple.drumAt.x, k.temple.drumAt.y, k.temple.drumAt.z, Math.PI / 2);

  // —— 经房：案、蒲团 ——
  const SY = 0.5 + 0.05;
  const desk = put(P.sutraDesk(mats, q), L.study.x - 1.35, SY, L.study.z, Math.PI / 2);
  // 蒲团挨着案沿：人跪坐下来，手正好够得着纸
  const seatStudy = new THREE.Vector3(L.seat.study.x, SY, L.seat.study.z);
  put(P.zafu(mats, q), seatStudy.x, SY, seatStudy.z);
  const df = wp(desk, desk.userData.flame as THREE.Vector3);
  k.flames.add(df, 0.04, { halo: 0.4 });
  const deskLight = new THREE.PointLight(0xffb878, 0, 6, 1.6); deskLight.position.set(df.x + 0.2, df.y + 0.25, df.z); scene.add(deskLight);
  k.atmos.addLamp((v) => { deskLight.intensity = 1.2 + 2.4 * v; });

  // —— 茶寮 ——
  const tea = put(P.teaSet(mats, q), L.tea.x - 0.25, SY, L.tea.z, Math.PI / 2);
  const seatTea = new THREE.Vector3(L.seat.tea.x, SY, L.seat.tea.z);
  put(P.zafu(mats, q), seatTea.x, SY, seatTea.z);

  // —— 云台：蒲团、一只小香炉 ——
  const TY = k.temple.pavilionFloor + 0.05;
  // 两个蒲团并排朝东：北边的静坐（面前一只小香炉），南边的拨念珠
  const seatSit = new THREE.Vector3(L.seat.sit.x, TY, L.seat.sit.z), seatBeads = new THREE.Vector3(L.seat.beads.x, TY, L.seat.beads.z);
  put(P.zafu(mats, q), seatSit.x, TY, seatSit.z); put(P.zafu(mats, q), seatBeads.x, TY, seatBeads.z);
  const holder = put(P.incenseHolder(mats, q), L.terrace.cx + 1.3, TY, L.terrace.cz - 0.62);

  // —— 银杏下：一把扫帚倚在树池边 ——
  const broom = put(P.broom(mats, q), L.ginkgo.x + 2.75, 0, L.ginkgo.z + 1.2, -0.6);

  // —— 檐下的灯笼（山门、殿前各一对） ——
  const lanternGeo = merge([cyl(0.15, 0.15, 0.34, 14, true), cyl(0.13, 0.15, 0.03, 14).translate(0, 0.185, 0), cyl(0.15, 0.12, 0.03, 14).translate(0, -0.185, 0)]);
  const capGeo = merge([tint(cyl(0.085, 0.13, 0.05, 12).translate(0, 0.22, 0), 0.5), tint(cyl(0.11, 0.07, 0.05, 12).translate(0, -0.22, 0), 0.5), tint(cyl(0.004, 0.004, 0.5, 4).translate(0, 0.49, 0), 0.4), tint(lathe([[0.012, 0], [0.03, -0.05], [0.036, -0.2], [0.001, -0.21]], 8).translate(0, -0.245, 0), 0.8)]);
  const lpaper = variant(mats.lampPaper, { color: 0xf2e2c8 });
  k.atmos.addLamp((v) => { lpaper.emissiveIntensity = 0.12 + 1.9 * v; });
  for (const [x, y, z] of [[3.85, 0.7 + 2.98, L.gate.z + 2.3 + 0.36], [-3.85, 0.7 + 2.98, L.gate.z + 2.3 + 0.36], [4.75, 1.5 + 3.76, hz + 6 + 0.38], [-4.75, 1.5 + 3.76, hz + 6 + 0.38]] as const) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(lanternGeo, lpaper), new THREE.Mesh(capGeo, mats.clothRed));
    put(g, x, y, z);
    halo(new THREE.Vector3(x, y, z), 1.5, [1.0, 0.55, 0.22], 0.5);
  }
  const gateLight = new THREE.PointLight(0xffb060, 0, 12, 1.7); gateLight.position.set(0, 0.7 + 3.4, L.gate.z + 3.6); scene.add(gateLight);
  k.atmos.addLamp((v) => { gateLight.intensity = 7 * v; });

  // —— 院里的薄雾、夏夜的萤火 ——
  k.ambient.addMist([
    [-16, 1.6, 30, 9], [14, 1.4, 34, 8], [0, 1.2, 44, 7], [-20, 2, 10, 10], [19, 2.2, 12, 9], [6, 2.5, -18, 11], [-12, 2, -20, 10],
    [0, -3, 62, 12], [-6, -7, 76, 13], [7, -9.5, 84, 12], [38, 0.5, -24, 10], [46, -2, -12, 12], [-30, 3, 30, 14], [32, 1, 30, 13],
  ]);
  k.ambient.addFireflies([new THREE.Vector3(-8, L.pond.y + 0.4, 32), new THREE.Vector3(8, L.pond.y + 0.4, 31), new THREE.Vector3(L.ginkgo.x + 2, 0.6, L.ginkgo.z + 3)], q.tier === 'low' ? 4 : 8);

  // —— 草木 ——
  prog(0.72, '种树');
  let flora: Flora | null = null;
  try {
    const sp = scatterPines(q), r = mulberry32(404);
    const at = (x: number, z: number, s = 1, v = 0, y?: number): TreePoint => ({ x, y: y ?? groundY(x, z), z, s, r: r() * 6.283, v });
    const bamboo: TreePoint[] = [];
    for (let x = -22.5; x <= 22.5; x += 3.3) bamboo.push(at(x + rr(r, -0.6, 0.6), -23.6 + rr(r, -0.5, 0.5), rr(r, 0.85, 1.15), 0, 0));
    for (let z = -21; z <= -9; z += 3.1) bamboo.push(at(-24.3 + rr(r, -0.3, 0.3), z, rr(r, 0.85, 1.1), 0, 0));
    bamboo.push(at(-25.25, L.study.z - 1.4, 0.8, 0, 0), at(-25.3, L.study.z + 1.2, 0.85, 0, 0), at(25.2, L.tea.z + 0.4, 0.8, 0, 0));
    const shrubs: TreePoint[] = [];
    for (let i = 0; i < Math.round(46 * q.density); i++) {
      const side = i % 5;
      const x = side === 0 ? rr(r, -25, 25) : side === 1 ? -25.2 : side === 2 ? 25.2 : rr(r, L.pond.x0 - 1.4, L.pond.x1 + 1.4);
      const z = side === 0 ? 45.1 : side === 1 || side === 2 ? rr(r, -20, 44) : (r() < 0.5 ? L.pond.z0 - 1.0 : L.pond.z1 + 1.0);
      if (Math.abs(x) < 3 && z > 20) continue;
      shrubs.push(at(x, z, rr(r, 0.7, 1.3), 0, 0));
    }
    flora = createFlora(mats, q, {
      pines: sp.near, farPines: sp.far,
      heroPines: [at(44.1, -10.4, 1.05, 0), at(44.6, -21.2, 0.9, 1), at(-10.2, 50.3, 1.0, 2), at(10.6, 49.8, 0.95, 3), at(6.4, 67, 1.0, 4), at(-6.8, 79, 1.1, 5), at(-31, -8, 1.1, 6)],
      ginkgo: [{ x: L.ginkgo.x, y: 0.28, z: L.ginkgo.z, s: 1, r: 0.6 }],
      maples: [at(16.2, 31.6, 1, 0, 0), at(-18.2, 10.6, 0.9, 1, 0), at(17.4, -7.2, 1.0, 2, 0), at(-20.5, 41, 0.95, 3, 0), at(21, 40.4, 1.05, 4, 0)],
      bamboo,
      plums: [at(23.4, -12.6, 1, 0, 0), at(23.9, -19.2, 0.9, 1, 0), at(23.3, 10.8, 0.95, 2, 0), at(-23.6, 22, 1, 3, 0)],
      shrubs,
      lotus: { x: 7.2, y: L.pond.y, z: 31.8, rx: 4.6, rz: 3.9, count: Math.round(26 * q.density) },
    }, k.season);
    k.adopt(flora.group);
    scene.add(flora.group);
  } catch (e) { console.warn('草木', e); }
  /** 落叶 / 落花：秋天银杏与枫，早春梅花 */
  const leaves = (s: Season) => {
    if (!flora) return;
    const pick = (kinds: string[]) => flora!.canopies.filter((c) => kinds.includes(c.kind));
    if (s === 'autumn') { k.ambient.setLeaves(pick(['ginkgo']), flora.leafTex.ginkgo, 0xe9b93a, Math.round(110 * q.density)); k.ambient.setLeafAmount(1); }
    else if (s === 'spring') { k.ambient.setLeaves(pick(['plum']), flora.leafTex.petal, 0xf6dfe2, Math.round(70 * q.density)); k.ambient.setLeafAmount(1); }
    else if (s === 'winter') { k.ambient.setLeaves(pick(['plum']), flora.leafTex.petal, 0xf3eeee, Math.round(26 * q.density)); k.ambient.setLeafAmount(1); }
    else k.ambient.setLeaves([], null, 0xffffff, 0);
  };

  const parts: SceneParts = {
    setSeason(s) { k.ambient.fireflies = s === 'summer' ? 1 : s === 'autumn' ? 0.35 : 0; flora?.setSeason(s); leaves(s); k.world.shadowDirty = true; },
    leafTex: flora?.leafTex.ginkgo ?? null,
    update() { /* 各处的小动静 */ },
    censer: { ash, r: (censerG.userData.ashR as number) * CENSER_K, flames: censerFlames },
    kneel: new THREE.Vector3(hx, H, kneelZ),
    buddha, muyu, qing, lots, bell, log, drum, desk, tea, holder, broom,
    seat: { study: seatStudy, tea: seatTea, sit: seatSit, beads: seatBeads },
    lotusLamp: () => P.lotusLamp(mats, q, true),
  };
  k.ambient.fireflies = k.season === 'summer' ? 1 : k.season === 'autumn' ? 0.35 : 0;
  leaves(k.season);
  return parts;
}
