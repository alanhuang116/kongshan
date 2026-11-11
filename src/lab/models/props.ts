/** 法器、供具与陈设 */
import * as THREE from 'three';
import type { Make } from '../models';
import * as P from '../../world/props';
import { fontsReady } from '../../world/core/tex';

/** 挂着的东西（钟、撞木、幡、祈愿带）原点在上端：台子上把它们吊到 y 高处来看 */
const hang = (o: THREE.Object3D, y: number) => { const g = new THREE.Group(); o.position.y = y; g.add(o); return g; };

const MODELS: Record<string, Make> = {
  courtCenser: ({ mats, q }) => P.courtCenser(mats, q),
  lampStand: ({ mats, q }) => P.lampStand(mats, q),
  incenseHolder: ({ mats, q }) => P.incenseHolder(mats, q),
  altarTable: ({ mats, q }) => P.altarTable(mats, q),
  kneeler: ({ mats, q }) => P.kneeler(mats, q),
  zafu: ({ mats, q }) => { const g = new THREE.Group(); g.add(P.mat(mats, q)); const z = P.zafu(mats, q); z.position.y = 0.045; g.add(z); return g; },
  muyu: ({ mats, q }) => P.muyu(mats, q),
  qing: ({ mats, q }) => P.qing(mats, q),
  lotTube: ({ mats, q }) => P.lotTube(mats, q),
  bigBell: ({ mats, q }) => {
    const g = new THREE.Group(), bell = P.bigBell(mats, q), log = P.bellLog(mats, q, 1.6);
    bell.position.y = 2.9; g.add(bell);
    // 撞木的头对着撞座，留一拳的空
    const s = bell.userData.strike as THREE.Vector3, h = log.userData.head as THREE.Vector3;
    log.position.set(0, 2.9 + s.y - h.y, s.z - h.z + 0.12); g.add(log);
    return g;
  },
  bellLog: ({ mats, q }) => hang(P.bellLog(mats, q, 1.6), 2.2),
  drum: ({ mats, q }) => P.drum(mats, q),
  stoneLantern: ({ mats, q, atmos }) => { const g = P.stoneLantern(mats, q); atmos.addLamp((k) => { (g.userData.lamp as THREE.MeshStandardMaterial).emissiveIntensity = 2.2 * k; }); return g; },
  lotusLamp: ({ mats, q, atmos }) => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) { const l = P.lotusLamp(mats, q); l.position.set(i * 0.3 - 0.3, 0, i === 1 ? 0.1 : 0); l.rotation.y = i; g.add(l); }
    atmos.addLamp((k) => { (g.children[0].userData.glow as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + 2.2 * k; });
    return g;
  },
  sutraDesk: ({ mats, q }) => P.sutraDesk(mats, q),
  teaSet: ({ mats, q }) => P.teaSet(mats, q),
  broom: ({ mats, q }) => P.broom(mats, q),
  banner: ({ mats, q }) => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const b = P.banner(mats, q, 3.2, i); b.position.set(i * 0.8 - 0.8, 3.6, 0); g.add(b); } return g; },
  wishRibbon: ({ mats, q }) => {
    const g = new THREE.Group(), { geometry, material } = P.wishRibbonGeo(mats, q), n = 40;
    const im = new THREE.InstancedMesh(geometry, material, n), m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) { m.makeRotationY(i * 2.4); m.setPosition((i % 10) * 0.12 - 0.54, 1.2 + Math.floor(i / 10) * 0.16 + Math.sin(i * 1.7) * 0.03, Math.sin(i * 3.1) * 0.05); im.setMatrixAt(i, m); }
    g.add(im);
    return g;
  },
  plaque: async ({ mats, q }) => {
    await fontsReady('大雄宝殿空山');
    const g = new THREE.Group(), a = P.plaque(mats, q, '大雄宝殿'), b = P.plaque(mats, q, '空山', { style: 'blue', size: 0.5 });
    a.position.y = 1.2; b.position.set(0, 0.1, 0); g.add(a, b);
    return g;
  },
  couplet: async ({ mats, q }) => {
    const t1 = '曲径通幽处', t2 = '禅房花木深';
    await fontsReady(t1 + t2);
    const g = new THREE.Group(), a = P.couplet(mats, q, t1), b = P.couplet(mats, q, t2), c = P.couplet(mats, q, t1, { style: 'wood' });
    a.position.x = 0.5; b.position.x = -0.5; c.position.x = 1.3; g.add(a, b, c);
    return g;
  },
  propsAll: async ({ mats, q }) => {
    await fontsReady('大雄宝殿空山曲径通幽处禅房花木深');
    const g = new THREE.Group();
    const put = (o: THREE.Object3D, x: number, z: number, y = 0, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o; };
    const t0 = performance.now();
    // 后排：大件
    put(P.courtCenser(mats, q), -7.0, -3); put(P.lampStand(mats, q), -5.6, -3); put(P.stoneLantern(mats, q), -4.3, -3);
    const bell = put(P.bigBell(mats, q), -2.2, -3, 2.9);
    const log = P.bellLog(mats, q, 1.6), s = bell.userData.strike as THREE.Vector3, h = log.userData.head as THREE.Vector3;
    put(log, -2.2, -3 + s.z - h.z + 0.12, 2.9 + s.y - h.y);
    put(P.drum(mats, q), 0.6, -3);
    for (let i = 0; i < 3; i++) put(P.banner(mats, q, 3.2, i), 2.5 + i * 0.75, -3, 3.5);
    put(P.plaque(mats, q, '大雄宝殿'), 6.2, -3, 1.3); put(P.plaque(mats, q, '空山', { style: 'blue', size: 0.5 }), 6.2, -3, 0.25);
    put(P.couplet(mats, q, '曲径通幽处'), 8.3, -3, 0.05); put(P.couplet(mats, q, '禅房花木深', { style: 'wood' }), 8.95, -3, 0.05);
    // 中排：殿里的
    put(P.altarTable(mats, q), -5.2, 0.2); put(P.muyu(mats, q), -2.4, 0.2); put(P.qing(mats, q), -1.4, 0.2);
    put(P.kneeler(mats, q), -0.3, 0.3); put(P.mat(mats, q), 0.8, 0.3); put(P.zafu(mats, q), 0.8, 0.3, 0.045);
    put(P.sutraDesk(mats, q), 2.6, 0.2); put(P.teaSet(mats, q), 4.5, 0.2); put(P.broom(mats, q), 5.8, 0.4);
    // 前排：小件
    put(P.lotTube(mats, q), -2.4, 1.6); put(P.incenseHolder(mats, q), -2.0, 1.6);
    for (let i = 0; i < 3; i++) put(P.lotusLamp(mats, q), -1.4 + i * 0.32, 1.6, 0, i);
    put(P.lotStick(mats, q), -0.3, 1.6, 0, 0.3); put(P.wishRibbon(mats, q), 0.1, 1.6, 0.4);
    console.info(`propsAll 建 ${(performance.now() - t0).toFixed(0)}ms`);
    g.userData.buildMs = performance.now() - t0;
    return g;
  },
  /** 逐件量：建多久、多少三角、几次绘制（打在控制台的 warn 里，截图脚本会印出来） */
  propsStats: async (c) => {
    await fontsReady('大雄宝殿空山曲径通幽处');
    const { mats, q } = c, out: string[] = [];
    const count = (o: THREE.Object3D) => {
      let tris = 0, draws = 0;
      o.traverse((m) => {
        const me = m as THREE.Mesh;
        if (!me.isMesh) return;
        const g = me.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
        tris += n * ((me as unknown as THREE.InstancedMesh).isInstancedMesh ? (me as unknown as THREE.InstancedMesh).count : 1); draws++;
      });
      return { tris: Math.round(tris), draws };
    };
    const items: Array<[string, () => THREE.Object3D]> = [
      ['courtCenser', () => P.courtCenser(mats, q)], ['lampStand', () => P.lampStand(mats, q)], ['incenseHolder', () => P.incenseHolder(mats, q)],
      ['altarTable', () => P.altarTable(mats, q)], ['kneeler', () => P.kneeler(mats, q)], ['zafu', () => P.zafu(mats, q)], ['mat', () => P.mat(mats, q)],
      ['muyu', () => P.muyu(mats, q)], ['qing', () => P.qing(mats, q)], ['lotTube', () => P.lotTube(mats, q)], ['lotTube(静)', () => P.lotTube(mats, q, false)], ['lotStick', () => P.lotStick(mats, q)],
      ['bigBell', () => P.bigBell(mats, q)], ['bellLog', () => P.bellLog(mats, q)], ['drum', () => P.drum(mats, q)],
      ['stoneLantern', () => P.stoneLantern(mats, q)], ['lotusLamp', () => P.lotusLamp(mats, q)], ['sutraDesk', () => P.sutraDesk(mats, q)], ['teaSet', () => P.teaSet(mats, q)],
      ['broom', () => P.broom(mats, q)], ['banner', () => P.banner(mats, q)], ['wishRibbon', () => P.wishRibbon(mats, q)],
      ['plaque', () => P.plaque(mats, q, '大雄宝殿')], ['couplet', () => P.couplet(mats, q, '曲径通幽处')],
    ];
    // 先各建一遍把材质、小贴图都备好（那是只花一次的），再量第二遍
    const t00 = performance.now();
    for (const [, f] of items) f();
    const first = performance.now() - t00;
    let total = 0;
    const g = new THREE.Group();
    for (const [name, f] of items) {
      const t0 = performance.now(), o = f(), ms = performance.now() - t0, k = count(o);
      total += ms; out.push(`${name} ${k.tris}△ ${k.draws}次 ${ms.toFixed(1)}ms`);
      g.add(o);
    }
    for (let i = 0; i < out.length; i += 6) console.warn('STATS ' + out.slice(i, i + 6).join(' | '));
    console.warn(`STATS 首遍(含材质贴图) ${first.toFixed(0)}ms；第二遍合计 ${total.toFixed(0)}ms`);
    g.visible = true;
    return new THREE.Group();
  },
};
export default MODELS;
