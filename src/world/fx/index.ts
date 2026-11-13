/**
 * 烟雨云雾花瓣：安乐窝里一切「罩在画上」的东西。意境多半靠它们——
 *
 *   烟 —— 清晨溪上、池上、田上、河滩上伏着的雾（mist.ts）。晨最重，昏与夜薄薄一层，雾天弥漫，日中只剩水上几缕。
 *   炊烟 —— 晨、午、昏三顿饭的时候，东厢灶屋与邻家各起一缕，被风带斜，到高处平铺开（smoke.ts）。茶炉的水汽也是它。
 *   落花 —— 春天桃林里落英缤纷，起风时一阵一阵；落在溪里的顺水漂走，落在路上的躺一会儿。秋天换成落叶（drift.ts）。
 *   雨、雪 —— 斜斜的细墨线；疏疏的白点（fall.ts）。雨点在溪上、池上点出一圈圈涟漪。屋里不下。
 *   灯晕 —— 夜里亮着的窗外一圈极淡的暖色（glow.ts；窗在哪由屋舍那边用 setLamps 给）。
 *
 * 全都画在勾完线的画面之上（第 FX_LAYER 层），自己去比深度；合起来至多七次绘制、一万个三角以内（高画质）。
 * 每帧不新建东西（各样的数组都是开场时开好的）。
 */
import * as THREE from 'three';
import type { Quality } from '../core/World';
import type { Season } from '../env/atmos';
import { mulberry32, smooth } from '../core/rng';
import { PLOTS, RIVER_PTS, RIVER_Y, SITE, STREAM, TREES, YARD_Y, ground, houseY } from '../site';
import { Mist, MistGeo } from './mist';
import { Plumes } from './smoke';
import { DEW, Drift, LEAF, PETAL, SPLASH } from './drift';
import { Fall } from './fall';
import { Glow } from './glow';

export interface FxOpts { q: Quality; season: Season; /** 在水面上起一圈涟漪（雨点、落花用） */ ripple?(x: number, z: number, size: number): void }
export interface FxFrame { camera: THREE.PerspectiveCamera; player: THREE.Vector3; hour: number; night: number; dawn: number; dusk: number; rain: number; snow: number; mist: number; wind: number; windDir: THREE.Vector2; /** 人在屋里几成（屋里不下雨） */ indoor: number; lamp: number }
export interface Wisp { on: boolean; /** 多少（0…1） */ amount: number; pos: THREE.Vector3; dispose(): void }
export interface Fx {
  group: THREE.Group;
  setSeason(s: Season): void;
  update(dt: number, t: number, f: FxFrame): void;
  /** 起一缕烟 / 水汽（茶炉、灶）。warm：0 冷白的水汽 … 1 柴烟 */
  smoke(pos: THREE.Vector3, o?: { size?: number; rise?: number; amount?: number; warm?: number }): Wisp;
  /** 在某处落一阵（花瓣、叶、水花、露珠） */
  burst(kind: 'petal' | 'leaf' | 'splash' | 'dew', pos: THREE.Vector3, n?: number): void;
  /** 桃花最盛处（由草木那边给），落花从这些地方起 */
  setBloomSpots(p: THREE.Vector3[]): void;
  /** 夜里亮着的窗、灯在哪（由屋舍那边给）：各罩一圈淡淡的暖晕。size 是晕的直径（米） */
  setLamps(p: THREE.Vector3[], size?: number): void;
  /** 烟从哪里出来（屋舍那边给了真的烟囱、屋脊口，就换成它们；id 与 SITE.houses 的 id 相同，灶屋是 wing） */
  setChimneys(p: Array<{ id: string; pos: THREE.Vector3 }>): void;
}

/** 日出、日落的时刻（与 env/atmos.ts 里那张表一致；那边没有导出来，这里照抄一份） */
const SUN: Record<Season, [number, number]> = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] };
/**
 * 烟从哪里起：邻家屋脊约比屋基高 4.5 米、灶屋的屋脊约比院子高 4.2 米——起处都取得略低一点，
 * 烟是从茅草顶里漫出来的（屋顶以下的一截被屋顶挡住，不会悬在半空）。
 */
const ROOF = 4.3, WING_ROOF = 4.0;
/** 各家起灶的早晚（-1 最早 … 1 最晚）：天刚亮只有一两家冒烟，过一阵才家家都有 */
const EARLY: Record<string, number> = { wing: -0.6, a: -1, b: 0.25, school: 0.9, d: 0.55, e: -0.2 };

/** 一顿饭的工夫：a 点起、b 点歇，前后各有 r 小时的渐变 */
const span = (h: number, a: number, b: number, r: number) => smooth(a - r, a, h) * (1 - smooth(b, b + r, h));
/** 这一家此刻灶里烧着几成：晨（日出后三刻到两个时辰）、午（短）、昏 */
function cooking(h: number, season: Season, early: number): number {
  const sr = SUN[season][0], ss = SUN[season][1];
  return Math.max(span(h, sr + 0.3 + early * 0.5, sr + 2 + early * 0.4, 0.25), 0.6 * span(h, 11.3 + early * 0.3, 12.2 + early * 0.3, 0.2), span(h, ss - 1.3 + early * 0.4, ss + 0.7 + early * 0.3, 0.3));
}

/** 把全园的雾铺成一个网格：溪上一带、池上一圈、田上一片、河滩一片、伊水上一带 */
function mistGeo(low: boolean): THREE.BufferGeometry {
  const g = new MistGeo();
  // 溪：顺着中线，两岸各漫出去十来米（淹住岸边桃树的脚）
  const sp: Array<{ x: number; z: number; y: number; half: number }> = [];
  for (let i = 0; i < STREAM.length; i += 2) { const p = STREAM[Math.min(i, STREAM.length - 1)]; sp.push({ x: p.x, z: p.z, y: p.y, half: p.w + 10 }); }
  g.ribbon(sp, { thick: 2.1, region: 0, long: 30, wide: 9 });
  const P = SITE.pond;
  g.disc(P.x, P.z, P.rx, P.rz, P.y, 6, { thick: 1.5, region: 0, long: 13, wide: 6 });
  // 田：贴着地薄薄一层
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const p of PLOTS) { x0 = Math.min(x0, p.x0); x1 = Math.max(x1, p.x1); z0 = Math.min(z0, p.z0); z1 = Math.max(z1, p.z1); }
  const gy = (x: number, z: number) => Math.max(ground(x, z), RIVER_Y);
  g.sheet(x0 - 14, x1 + 14, z0 - 2, z1 + 12, 9, gy, { thick: 1.1, region: 1, long: 34, wide: 19 });
  if (!low) {
    // 河滩：田南到水边，厚一些、团块大一些
    g.sheet(x0 - 70, x1 + 90, z1 - 4, z1 + 150, 16, gy, { thick: 1.7, region: 2, long: 70, wide: 40 });
    // 伊水：近处的一段，连两岸
    const rp: Array<{ x: number; z: number; y: number; half: number }> = [];
    for (const p of RIVER_PTS) if (Math.hypot(p.x, p.z - 300) < 1500) rp.push({ x: p.x, z: p.z, y: RIVER_Y, half: p.w + 36 });
    if (rp.length > 3) g.ribbon(rp, { thick: 3.2, region: 2, long: 190, wide: 64 });
  }
  return g.build();
}

export function createFx(o: FxOpts): Fx {
  const q = o.q, low = q.tier === 'low', R = mulberry32(977);
  let season = o.season;
  const group = new THREE.Group();
  group.name = 'fx';

  // —— 烟（雾） ——
  const mist = new Mist(mistGeo(low), { low });

  // —— 炊烟 ——
  const plumes = new Plumes(24);
  const G = SITE.wing;
  const chimneys: Array<{ id: string; pos: THREE.Vector3 }> = [{ id: 'wing', pos: new THREE.Vector3(G.x + 0.2, YARD_Y + WING_ROOF, G.z - G.d * 0.28) }];
  SITE.houses.forEach((h, i) => {
    // 烟从屋脊的一头出来（茅屋没有烟囱，烟是从山墙顶上漫出来的）
    const lx = h.w * 0.3 * (i % 2 ? -1 : 1), c = Math.cos(h.yaw), s = Math.sin(h.yaw);
    chimneys.push({ id: h.id, pos: new THREE.Vector3(h.x + lx * c, houseY(h.id) + ROOF, h.z - lx * s) });
  });
  let stoves: Array<{ early: number; rise: number; wisp: ReturnType<Plumes['add']> }> | null = null;

  // —— 落花、落叶 ——
  const drift = new Drift(560 * q.density, { ground, stream: STREAM, pond: SITE.pond, ripple: o.ripple });
  let blooms: Float32Array | null = null, amount = 0;
  /** 这一季从哪里落什么 */
  const sources = () => {
    const out: number[] = [];
    if (season === 'spring') {
      if (blooms) { drift.setSources(PETAL, blooms); amount = 1; return; }
      for (const t of TREES) if (t.kind === 'peach') out.push(t.x, ground(t.x, t.z) + 2.5 * t.s, t.z, 1.7 * t.s);
      amount = 1;
      drift.setSources(PETAL, new Float32Array(out));
    } else if (season === 'autumn') {
      for (const t of TREES) {
        if (t.kind === 'wood') out.push(t.x, ground(t.x, t.z) + 5 * t.s, t.z, 2.6 * t.s);
        else if (t.kind === 'elm') out.push(t.x, ground(t.x, t.z) + 7.5 * t.s, t.z, 4.4 * t.s);
        else if (t.kind === 'willow') out.push(t.x, ground(t.x, t.z) + 4.2 * t.s, t.z, 2.6 * t.s);
      }
      amount = 0.8;
      drift.setSources(LEAF, new Float32Array(out));
    } else { amount = 0; drift.setSources(PETAL, new Float32Array(0)); }
  };
  sources();

  // —— 雨、雪、灯晕 ——
  const rain = new Fall({ snow: false, count: 1300 * q.density, R: 17, H: 15, size: 0.9, px: 1.4 });
  const snow = new Fall({ snow: true, count: 1100 * q.density, R: 15, H: 13, size: 0.085, px: 3.2 });
  const glow = new Glow(48);

  group.add(drift.rest, mist.mesh, plumes.mesh, glow.mesh, drift.fly, rain.mesh, snow.mesh);

  // 雨点落在水上：人附近的溪面、池面上隔一会儿起一圈
  let ripAcc = 0, nearT = 0, nearI = 0;
  const rainRing = (f: FxFrame) => {
    if (!o.ripple) return;
    const P = SITE.pond, px = f.player.x, pz = f.player.z;
    if (Math.hypot(px - P.x, pz - P.z) < 42 && R() < 0.45) {
      const a = R() * 6.283, d = Math.sqrt(R()) * 0.86;
      o.ripple(P.x + Math.cos(a) * d * P.rx, P.z + Math.sin(a) * d * P.rz, 0.3 + 0.3 * R());
      return;
    }
    const i = Math.max(1, Math.min(STREAM.length - 2, nearI + Math.round((R() * 2 - 1) * 7))), p = STREAM[i], a = STREAM[i - 1], b = STREAM[i + 1];
    const nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz) || 1, off = (R() * 2 - 1) * (p.w - 0.35);
    const x = p.x + (nx / l) * off, z = p.z + (nz / l) * off;
    if (Math.hypot(x - px, z - pz) < 45) o.ripple(x, z, 0.3 + 0.3 * R());
  };

  return {
    group,
    setSeason(s) { if (s !== season) { season = s; sources(); } },
    update(dt, _t, f) {
      // 雾：晨最重，昏、夜薄薄一层，雾天弥漫，日中只剩水上几缕
      const wet = 1.3 * f.mist + 0.5 * f.rain + 0.25 * f.snow;
      // 上午还有一点残雾，过了晌午散尽
      const sr = SUN[season][0], linger = f.hour > sr ? 1 - smooth(sr + 1.5, sr + 4.5, f.hour) : 0;
      mist.amount.set(
        0.1 + 0.9 * f.dawn + 0.16 * linger + 0.45 * f.dusk + 0.4 * f.night + wet,
        0.02 + 0.62 * f.dawn + 0.06 * linger + 0.3 * f.dusk + 0.26 * f.night + wet * 0.9,
        0.14 + 0.75 * f.dawn + 0.1 * linger + 0.4 * f.dusk + 0.36 * f.night + wet * 0.9,
        0,
      );
      mist.update(dt, f.wind);

      // 炊烟：按时辰起灶。头一帧就在饭点上的，烟已经升到顶了
      if (!stoves) {
        stoves = chimneys.map((c, i) => {
          const early = EARLY[c.id] ?? 0, on = cooking(f.hour, season, early), rise = 12.5 + 4 * ((i * 0.618) % 1);
          const wisp = plumes.add(c.pos, { size: 0.34, rise, amount: on, warm: 1 }, low ? 1 : 2, on > 0.02);
          wisp.on = on > 0.02;
          return { early, rise, wisp };
        });
      }
      for (let i = 0; i < stoves.length; i++) {
        // 雨天烟压得低、淡
        const s = stoves[i], on = cooking(f.hour, season, s.early) * (1 - 0.35 * f.rain) * (s.early > 0.8 ? 0.7 : 1);
        s.wisp.amount = on; s.wisp.on = on > 0.02;
      }
      plumes.update(dt);

      // 落花：起风时一阵一阵；下雨打落得多些
      const gust = Math.max(0, Math.min(1, (f.wind - 0.105) / 0.07));
      drift.update(dt, f, amount * (1 + 0.4 * f.rain) * (1 - 0.6 * f.snow), gust);

      const open = 1 - f.indoor;
      rain.update(dt, f.rain * open, f.wind, f.windDir);
      snow.update(dt, f.snow * open, f.wind, f.windDir);
      glow.update(f.lamp);

      if (f.rain > 0.05) {
        nearT -= dt;
        if (nearT <= 0) {
          nearT = 1;
          let bd = 1e18;
          for (let i = 0; i < STREAM.length; i++) { const dx = STREAM[i].x - f.player.x, dz = STREAM[i].z - f.player.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; nearI = i; } }
        }
        // 水面上同时只留得住几圈（见 env/water.ts），所以一秒至多起一圈多
        ripAcc += dt * 1.15 * f.rain;
        if (ripAcc >= 1) { ripAcc = 0; rainRing(f); }
      }
    },
    smoke(pos, so = {}) {
      const rise = so.rise ?? 0.7;
      return plumes.add(pos.clone(), { size: so.size ?? 0.07, rise, amount: so.amount ?? 1, warm: so.warm ?? 0 }, rise > 4 && !low ? 2 : 1);
    },
    burst(kind, pos, n) {
      if (kind === 'petal') drift.burst(PETAL, pos, n ?? 14);
      else if (kind === 'leaf') drift.burst(LEAF, pos, n ?? 10);
      else if (kind === 'splash') drift.burst(SPLASH, pos, n ?? 10);
      else drift.burst(DEW, pos, n ?? 5);
    },
    setBloomSpots(p) {
      // 太多就隔几个取一个
      const step = Math.max(1, Math.ceil(p.length / 1500)), out: number[] = [];
      for (let i = 0; i < p.length; i += step) out.push(p[i].x, p[i].y, p[i].z, 1.5);
      blooms = out.length ? new Float32Array(out) : null;
      if (season === 'spring') sources();
    },
    setLamps(p, size = 2.4) { glow.set(p, size); },
    setChimneys(p) {
      for (const c of p) { const e = chimneys.find((x) => x.id === c.id); if (e) e.pos.copy(c.pos); else chimneys.push({ id: c.id, pos: c.pos.clone() }); }
      if (stoves) { for (const s of stoves) s.wisp.dispose(); stoves = null; }
    },
  };
}
