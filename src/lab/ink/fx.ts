/**
 * 台子上看烟雨云雾花瓣（用 &ground=0 关掉台子自带的素地）。
 *
 * 地与水是真的（env/land.ts）；屋与树是替身（方块的屋、一根干几团叶的树），只为了让雾有东西可淹、
 * 烟有屋脊可起、落花有树可落；人也是个替身（白衣的一根柱），站在 tx、tz。
 *
 *   mist / smoke / petals / rain / snow / fxAll —— 同一个场子（createFx 按总图的位置来），各站在看那样东西最合适的地方。
 *   跟在人后面看：&d=6&el=10（镜头离地两米半上下）；高处远望：&d=80&el=30。不给 ty 时镜头自己落到那一处的地面上。
 *   另有：&indoor=1 当作人在屋里；&burst=petal|leaf|splash|dew 每隔几秒在人前落一阵；rain、snow 没给 w 时自己下起来；
 *   &fx=0 不要烟雨（对照着看）；&only=mist,smoke,drift,rain,snow,glow 只留其中几样。
 */
import * as THREE from 'three';
import { PIG, U, dabMat, dabMesh, wash, type Dab, type RGB } from '../../world/ink/ink';
import { TILES, atlas } from '../../world/ink/brush';
import { Builder, M, boxUp, cylUp, prism, sphere } from '../../world/core/geo';
import { mulberry32 } from '../../world/core/rng';
import { SITE, TREES, YARD_Y, ground, houseY, waterAt, type TreeKind } from '../../world/site';
import { createLand } from '../../world/env/land';
import { createFx, type FxFrame } from '../../world/fx';
import type { LabCtx, LabMake, LabModel } from '../ink-lab';

const qs = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qs.has(k) ? Number(qs.get(k)) : d);

/** 树的替身：干多高、冠心多高、冠多大 */
const TREE: Record<TreeKind, [number, number, number]> = { peach: [1.5, 2.5, 1.7], plum: [1.6, 2.6, 1.6], willow: [3.0, 4.2, 2.6], pine: [5, 6.2, 2.4], mulberry: [1.3, 2.3, 1.3], elm: [5, 7.5, 4.4], wood: [3.4, 5, 2.6], bamboo: [4.5, 5.2, 1.3] };

function standIns({ q, season }: LabCtx): { obj: THREE.Group; lamps: THREE.Vector3[] } {
  const g = new THREE.Group(), R = mulberry32(5), lamps: THREE.Vector3[] = [];
  const mats = {
    earth: wash({ pig: PIG.tu, dens: 1.1, shade: 1.45, grain: 0.9, strata: [2.6, 0.5] }),
    thatch: wash({ pig: PIG.mao, dens: 1.25, shade: 1.5, streak: [3, 14, 0.5] }),
    bark: wash({ pig: [0.66, 0.6, 0.6], dens: 2.2, shade: 1.6, streak: [9, 1.6, 0.5] }),
    stone: wash({ pig: PIG.mo, dens: 0.8, shade: 2.0, grain: 1.2 }),
    robe: wash({ pig: [0.95, 0.95, 0.93], dens: 1, body: 1, shade: 1.25 }),
    paper: wash({ pig: [0.98, 0.93, 0.8], dens: 0.7, body: 1, flat: 1, glow: [0.5, 0.36, 0.16] }),
  };
  const b = new Builder();
  // 屋：墙一块、两坡顶一块；南墙上一扇纸窗（夜里亮）
  const house = (x: number, y: number, z: number, w: number, d: number, yaw: number, wall: number, ridge: number) => {
    const m = M.trs(x, y, z, yaw);
    b.push(m);
    b.add('earth', boxUp(w, wall, d));
    b.add('thatch', prism([[-d / 2 - 0.7, wall - 0.25], [d / 2 + 0.7, wall - 0.25], [0, ridge]], w + 1.1).applyMatrix4(M.ry(Math.PI / 2)));
    b.add('paper', boxUp(1.3, 0.9, 0.06).applyMatrix4(M.t(w * 0.22, 1.1, d / 2 + 0.02)));
    b.pop();
    lamps.push(new THREE.Vector3(w * 0.22, 1.55, d / 2 + 0.05).applyMatrix4(m));
  };
  const H = SITE.hall, W = SITE.wing;
  house(H.x, YARD_Y, H.z, H.w, H.d, 0, 3, 5.2);
  house(W.x, YARD_Y, W.z, W.d, W.w, Math.PI / 2, 2.5, 4.2);
  for (const h of SITE.houses) house(h.x, houseY(h.id), h.z, h.w, h.d, h.yaw, 2.6, 4.5);
  // 石桥
  b.add('stone', boxUp(SITE.bridge.w, 0.3, SITE.bridge.len).applyMatrix4(M.t(SITE.bridge.x, ground(SITE.bridge.x, SITE.bridge.z - SITE.bridge.len / 2) - 0.05, SITE.bridge.z)));
  // 人
  const figure = new THREE.Group();
  const fb = new Builder();
  fb.add('robe', cylUp(0.16, 0.3, 1.45, 10)); fb.add('robe', sphere(0.13, 10, 8).translate(0, 1.6, 0));
  figure.add(fb.build(mats));
  figure.name = 'figure';
  g.add(figure);

  // 树：干是一根柱，冠是几团点上去的叶（桃在春天是花）
  const A = atlas([TILES.blob, TILES.round, TILES.blossom, TILES.bloom], 2, Math.round(160 * q.tex), 5);
  const leaves: Dab[] = [], pink: Dab[] = [];
  for (const t of TREES) {
    if (t.x < -215 || t.x > 190 || t.z < -75 || t.z > 250) continue;
    const [th, ch, cr] = TREE[t.kind], y = ground(t.x, t.z), s = t.s;
    b.add('bark', cylUp(t.r * 0.6, t.r, th * s, 6).applyMatrix4(M.t(t.x, y - 0.1, t.z)));
    const flower = t.kind === 'peach' && season === 'spring', bare = season === 'winter' && t.kind !== 'pine' && t.kind !== 'bamboo';
    if (bare) continue;
    const n = t.kind === 'bamboo' ? 3 : t.kind === 'elm' ? 12 : flower ? 16 : 7;
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, e = (R() - 0.3) * 1.2, d = cr * s * (0.35 + 0.6 * R());
      const dx = Math.cos(a) * Math.cos(e) * d, dy = Math.sin(e) * d * 0.7, dz = Math.sin(a) * Math.cos(e) * d, tone = 0.85 + 0.3 * R();
      (flower ? pink : leaves).push({ x: t.x + dx, y: y + ch * s + dy, z: t.z + dz, size: cr * s * (flower ? 0.5 : 0.95), nx: dx, ny: dy + 0.3, nz: dz, tile: flower ? 2 : Math.floor(R() * 2), r: tone, g: tone, b: tone, rot: R() * 6.283, sway: 0.5 });
    }
  }
  g.add(b.build(mats, { name: 'stand-ins' }));
  const leafPig: RGB = season === 'spring' ? PIG.zhi_lv : season === 'summer' ? PIG.lao : season === 'autumn' ? [0.92, 0.78, 0.52] : PIG.lao;
  if (leaves.length) g.add(dabMesh(leaves, dabMat({ ...A, pig: leafPig, dens: season === 'spring' ? 1.1 : 1.5, shade: 1.5, sway: 0.5 })));
  if (pink.length) g.add(dabMesh(pink, dabMat({ ...A, pig: [0.97, 0.7, 0.74], accent: [0.78, 0.22, 0.3], dens: 0.95, shade: 1.35, body: 0.72, sway: 0.5 })));
  return { obj: g, lamps };
}

type View = { az: number; el: number; d: number; tx: number; tz: number };
/** 场子：真的地与水 + 替身 + 全套烟雨花瓣。extra：这个模型自己要添的东西 */
const stage = (def: View, extra?: (fx: ReturnType<typeof createFx>, at: THREE.Vector3, ctx: LabCtx) => void): LabMake => (ctx) => {
  const { q, season, atmos, world } = ctx;
  const g = new THREE.Group();
  const land = createLand(q, season);
  const si = standIns(ctx);
  const fx = createFx({ q, season, ripple: (x, z, size) => land.ripple(x, z, size) });
  fx.setLamps(si.lamps);
  g.add(land.group, si.obj);
  if (qs.get('fx') !== '0') g.add(fx.group);
  // only=mist,smoke…：只留这几样（其余的挪到不画的图层上）
  const only = qs.get('only')?.split(',');
  if (only) for (const c of fx.group.children) if (!only.some((k) => c.name.startsWith(k))) c.layers.set(30);
  const tx = num('tx', def.tx), tz = num('tz', def.tz), gy = ground(tx, tz);
  const at = new THREE.Vector3(tx, gy, tz);
  const figure = si.obj.getObjectByName('figure');
  figure?.position.copy(at);
  extra?.(fx, at, ctx);
  const frame: FxFrame = { camera: world.camera, player: at, hour: 9, night: 0, dawn: 0, dusk: 0, rain: 0, snow: 0, mist: 0, wind: 0.1, windDir: new THREE.Vector2(1, 0), indoor: num('indoor', 0), lamp: 0 };
  const burst = qs.get('burst') as 'petal' | 'leaf' | 'splash' | 'dew' | null, tmp = new THREE.Vector3();
  const faz = (num('az', def.az) * Math.PI) / 180;
  let next = 1.2, first = true;
  const out: LabModel = {
    obj: g,
    update(dt, t) {
      frame.hour = atmos.hour; frame.night = atmos.night; frame.dawn = atmos.dawn; frame.dusk = atmos.dusk; frame.lamp = atmos.lamp;
      frame.rain = atmos.w.rain; frame.snow = atmos.w.snow; frame.mist = atmos.w.mist; frame.wind = atmos.wind;
      frame.windDir.set(U.uWind.value.x, U.uWind.value.y);
      // 头一帧先空跑半分钟：刚起的烟升到顶、落花铺开（&warm=0 不要，看从头起的样子）
      if (first) { first = false; if (qs.get('warm') !== '0') for (let i = 0; i < 300; i++) fx.update(0.1, t, frame); }
      if (burst && t > next) {
        next = t + 3;
        // 人前两步、偏右一步（别叫人挡住）：水花起在那一处的水面（没有水就在地上），花、叶、露珠在齐肩处
        const bx = at.x - 1.6 * Math.sin(faz) + 0.9 * Math.cos(faz), bz = at.z - 1.6 * Math.cos(faz) - 0.9 * Math.sin(faz);
        tmp.set(bx, burst === 'splash' ? (waterAt(bx, bz)?.y ?? ground(bx, bz)) : at.y + 1.5, bz);
        fx.burst(burst, tmp);
      }
      fx.update(dt, t, frame);
    },
    view: { az: def.az, el: def.el, d: def.d, tx, ty: gy + 1.4, tz },
  };
  return out;
};

export const MODELS: Record<string, LabMake> = {
  /** 石桥南头，朝西望溪上的雾 */
  mist: stage({ az: 82, el: 10, d: 6, tx: 2, tz: 37.5 }),
  /** 院门外望草堂、灶屋的炊烟；另添一缕不分时辰的柴烟（邻家甲）与人前的一缕茶烟，好随时看 */
  smoke: stage({ az: -55, el: 8, d: 42, tx: 8, tz: 22 }, (fx, at) => {
    const h = SITE.houses[0];
    fx.smoke(new THREE.Vector3(h.x, houseY(h.id) + 4.5, h.z + 0.6), { size: 0.34, rise: 14, warm: 1 });
    fx.smoke(new THREE.Vector3(at.x + 1.2, at.y + 0.9, at.z - 0.6), {});
  }),
  /** 桃林里的小路上 */
  petals: stage({ az: 20, el: 8, d: 6, tx: -96, tz: 36.6 }),
  rain: stage({ az: 82, el: 10, d: 6, tx: 2, tz: 37.5 }, (_fx, _at, { atmos }) => { if (!qs.has('w')) atmos.setWeather('rain', true); }),
  snow: stage({ az: -25, el: 10, d: 6, tx: 4, tz: 24 }, (_fx, _at, { atmos }) => { if (!qs.has('w')) atmos.setWeather('snow', true); }),
  /** 高处望全园 */
  fxAll: stage({ az: 215, el: 30, d: 80, tx: 0, tz: 34 }),
};
