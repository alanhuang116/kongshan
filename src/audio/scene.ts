/**
 * 场景 → 每一层该有多少。纯函数，便宜：世界每帧交一次场景也无妨。
 *
 *   resolveScene  把交进来的场景补齐（没给夜 / 晨 / 昏就按时刻与季节算，没给 near 就按「处」取一份大概的）；
 *   mixScene      按「离什么近、什么时辰、什么季节、什么天」算出二十来层各自的量（0…1）；
 *   其余是各层排程时要问的：鸟有多密、蝉有几成、村塾这会儿念不念书……
 *
 * 规矩（这是个安静的地方，底要低，细节要疏）：
 *   春天没有蝉；蛙只在暖的夜里；蟋蟀属于夏夜与秋；雁只在秋冬；
 *   鸟在黎明最密（日出后一刻到顶），往午间稀下去，傍晚归巢又起一点，夜里与雨里都不叫；
 *   鸡鸣属于清晨（在桃林里也远远听得见）；书声、修桥的锤锯只在白天；雨里匠人歇工、孩子照念。
 */
import { BED_NAMES, ZERO_NEAR, NEAR_KEYS, type Bed, type Near, type NearKey, type Scene, type SceneState, type Season, type SlotId } from './types';
import { clamp, lerp, smooth } from './util';

const bump = (x: number, a: number, b: number, c: number, d: number) => smooth(a, b, x) * (1 - smooth(c, d, x));
const pw = (x: number, p: number) => Math.pow(clamp(x), p);

/** 各层在场景给满（1）时的校准：离线渲染量过，见 docs/AUDIO.md 的表 */
export const TRIM: Record<SlotId, number> = {
  air: 0.052, pines: 0.22, bamboo: 0.15, leaves: 0.3, fieldwind: 0.14, brook: 0.155, pond: 0.3, river: 0.11, waterfall: 0.09,
  birds: 0.45, swallows: 0.6, cicadas: 0.14, frogs: 0.75, crickets: 0.5, geese: 0.5, rain: 0.62, drips: 0.3, snow: 0.33, night: 0.045,
  village: 0.5, school: 0.6, work: 0.4, mill: 0.3,
  kettle: 0.58, inkstone: 0.72, saw: 0.72, plough: 0.47,
  chant: 1, qin: 1, bellfar: 0.4, eaves: 1.6,
};
/** 各层渐变的快慢（秒，约三分之一是时间常数）：跟着脚步走的快，跟着天时走的慢 */
export const FADE: Record<SlotId, number> = {
  air: 4, pines: 2.4, bamboo: 2.4, leaves: 2.4, fieldwind: 3, brook: 1.5, pond: 2.5, river: 3, waterfall: 4,
  birds: 6, swallows: 6, cicadas: 9, frogs: 9, crickets: 9, geese: 8, rain: 3, drips: 4, snow: 6, night: 10,
  village: 4, school: 2.5, work: 2.5, mill: 2.5,
  kettle: 0.5, inkstone: 0.15, saw: 0.3, plough: 0.6,
  chant: 1.2, qin: 1.2, bellfar: 1.2, eaves: 1.2,
};
/** 有方位的层：它的声像跟着 bearing 里的哪一项 */
export const BEARING_OF: Partial<Record<Bed, NearKey>> = {
  brook: 'stream', pond: 'pond', river: 'river', waterfall: 'waterfall', bamboo: 'bamboo', pines: 'pines', leaves: 'grove', fieldwind: 'fields',
  village: 'village', school: 'school', work: 'work', mill: 'mill',
};

/** 日出、日落的时刻（与 world/env/atmos.ts 的 SUN 一致） */
const SUN: Record<Season, [number, number]> = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] };
/** 没给 near 时，按人在哪一处取一份大概的 */
export const PLACE_NEAR: Record<string, Partial<Near>> = {
  grove: { grove: 1, stream: 0.55 },
  bridge: { stream: 1, grove: 0.3, pines: 0.15 },
  yard: { stream: 0.25, pines: 0.6, bamboo: 0.3, grove: 0.15, village: 0.1 },
  hall: { stream: 0.15, pines: 0.4, bamboo: 0.4 },
  pavilion: { pond: 1, bamboo: 0.85, pines: 0.15, waterfall: 0.12 },
  fields: { fields: 1, stream: 0.15, village: 0.15, grove: 0.2 },
  village: { village: 1, school: 0.6, stream: 0.3, grove: 0.25, work: 0.25, waterfall: 0.15, mill: 0.15 },
  ferry: { river: 1, fields: 0.35 },
};
/** 这一处有没有屋檐（檐滴、茅顶上的雨、檐下的燕） */
const EAVE: Record<string, number> = { hall: 1, yard: 0.8, pavilion: 0.7, village: 0.6, bridge: 0.15, grove: 0.05, fields: 0, ferry: 0.1 };
export const eaveAt = (s: SceneState) => EAVE[s.place] ?? 0.2;

// ———————————————————————————— 世界那边用得上的两个小算式 ————————————————————————————
/** 距离 → near：d 是到那样东西最近一点的米数（在它里面就给 0 或负数），R 米之外听不到 */
export const nearOf = (d: number, R: number) => clamp(1 - Math.max(0, d) / R);
/** 那样东西在人的哪一边：(dx, dz) 从人指向它，(fx, fz) 是镜头朝向在地面上的方向。−1 正左 … 1 正右；贴得很近时归中 */
export function bearingOf(dx: number, dz: number, fx: number, fz: number): number {
  const d = Math.hypot(dx, dz), f = Math.hypot(fx, fz);
  if (d < 1e-3 || f < 1e-6) return 0;
  return clamp((dx * -fz + dz * fx) / (d * f), -1, 1) * Math.min(1, d / 4);
}

// ———————————————————————————— 补齐 ————————————————————————————
/** 把新给的几项并进去（near、bearing 是一项一项并的；undefined 的不动） */
export function mergeScene(raw: Scene, p: Partial<Scene>) {
  for (const k of Object.keys(p) as Array<keyof Scene>) {
    const v = p[k];
    if (v === undefined) continue;
    if (k === 'near') raw.near = { ...raw.near, ...(v as Partial<Near>) };
    else if (k === 'bearing') raw.bearing = { ...raw.bearing, ...(v as Partial<Record<NearKey, number>>) };
    else (raw as unknown as Record<string, unknown>)[k] = v;
  }
}
export function resolveScene(r: Scene, wet: number): SceneState {
  const h = ((r.hour % 24) + 24) % 24, [sr, ss] = SUN[r.season] ?? SUN.spring;
  const night = clamp(r.night ?? (h < 12 ? 1 - smooth(sr - 1.1, sr + 0.25, h) : smooth(ss + 0.15, ss + 1.5, h)));
  const dawn = clamp(r.dawn ?? Math.max(0, 1 - Math.abs(h - (sr + 0.15)) / 1.35));
  const dusk = clamp(r.dusk ?? Math.max(0, 1 - Math.abs(h - (ss - 0.25)) / 1.5));
  const near: Near = { ...ZERO_NEAR }, bearing = { ...ZERO_NEAR } as Record<NearKey, number>;
  if (r.near) { for (const k of NEAR_KEYS) near[k] = clamp(r.near[k] ?? 0); }
  else {
    const base = PLACE_NEAR[r.place] ?? {};
    for (const k of NEAR_KEYS) near[k] = clamp(base[k] ?? 0);
    if (r.water != null) near.stream = Math.max(near.stream, clamp(r.water));
  }
  if (r.bearing) for (const k of NEAR_KEYS) bearing[k] = clamp(r.bearing[k] ?? 0, -1, 1);
  return {
    place: r.place, hour: h, night, dawn, dusk, day: 1 - night, season: r.season,
    rain: clamp(r.rain ?? (r.weather === 'rain' ? 1 : 0)),
    snow: clamp(r.snow ?? (r.weather === 'snow' ? 1 : 0)),
    mist: clamp(r.mist ?? (r.weather === 'mist' ? 1 : 0)),
    storm: clamp(r.storm ?? 0),
    // 没给风：晴天取平日的 0.09，雨雪天大一些（与 Atmos 的算法同）
    wind: clamp(((r.wind ?? 0.09 * (1 + 0.8 * (r.rain ?? (r.weather === 'rain' ? 1 : 0)) + 0.4 * (r.snow ?? (r.weather === 'snow' ? 1 : 0)))) / 0.25) * (1 + 0.3 * clamp(r.height ?? 0))),
    indoor: clamp(r.indoor ?? 0), near, bearing, focus: r.focus && FOCUS[r.focus] ? r.focus : null, wet: clamp(wet),
  };
}
/** 量化之后的指纹：每帧都交场景时，没变就什么都不做 */
export function sceneSig(s: SceneState): string {
  const q = (x: number, n: number) => Math.round(x * n);
  const a: Array<string | number> = [s.place, q(s.hour, 12), q(s.night, 40), q(s.dawn, 40), q(s.dusk, 40), s.season, q(s.rain, 40), q(s.snow, 40), q(s.mist, 20), q(s.storm, 10), q(s.wind, 30), q(s.indoor, 40), q(s.wet, 40), s.focus ?? ''];
  for (const k of NEAR_KEYS) a.push(q(s.near[k], 50), q(s.bearing[k], 16));
  return a.join();
}

// ———————————————————————————— 各层要问的 ————————————————————————————
const treesAt = (s: SceneState) => Math.max(s.near.grove, s.near.bamboo, s.near.pines * 0.8);

/**
 * 鸟的疏密 0…1.2：黎明的合唱在日出后一刻到顶（天还没亮透就有头几声），往午间稀下去；傍晚归巢稍起；夜里没有。
 * 雨里不叫（小雨还剩几声），雪天几乎没有，雾天少些；春天最多，冬天只剩一两只；树多的地方多。
 */
export function birdDensity(s: SceneState): number {
  const h = s.hour, light = 1 - s.night;
  const dayLevel = h < 12 ? lerp(0.5, 0.2, smooth(7.5, 12, h)) : lerp(0.2, 0.28, smooth(15, 17.5, h));
  let d = Math.max(Math.pow(s.dawn, 0.8), dayLevel * smooth(0.3, 0.9, light), 0.5 * Math.pow(s.dusk, 1.2) * smooth(0.1, 0.5, light));
  d *= Math.pow(1 - s.rain, 1.5) * (1 - 0.8 * s.snow) * (1 - 0.3 * s.mist);
  d *= s.season === 'spring' ? 1.15 : s.season === 'summer' ? 0.6 : s.season === 'autumn' ? 0.4 : 0.2;
  d *= 0.5 + 0.5 * Math.max(treesAt(s), 0.6 * s.near.village, 0.4 * s.near.fields);
  return d;
}
/** 燕 0…1：春夏的白天，早晚最勤；雨里不飞；在檐下、村里、田上、水上 */
export function swallowAmount(s: SceneState): number {
  const k = s.season === 'spring' ? 1 : s.season === 'summer' ? 0.8 : 0;
  if (!k) return 0;
  const where = Math.max(s.near.village, 0.8 * eaveAt(s), 0.7 * s.near.fields, 0.5 * s.near.river, 0.5 * s.near.pond);
  return k * smooth(0.25, 0.8, 1 - s.night) * Math.pow(1 - s.rain, 2) * (0.35 + 0.65 * Math.max(s.dawn, s.dusk, 0.4)) * where;
}
/** 蝉 0…1：夏天的白天（上午渐起，午后最盛，傍晚收），初秋还剩一点；雨一来就停 */
export function cicadaAmount(s: SceneState): number {
  const k = s.season === 'summer' ? 1 : s.season === 'autumn' ? 0.22 : 0;
  if (!k) return 0;
  return k * bump(s.hour, 7.5, 10.5, 17.2, 19.2) * (1 - s.night) * Math.pow(1 - s.rain, 2) * (1 - s.snow);
}
/** 蛙 0…1：暖的夜里（夏夜最盛，春末有一些，入秋就稀了，冬天没有）；黄昏先起；雨后更欢 */
export function frogAmount(s: SceneState): number {
  const k = s.season === 'summer' ? 1 : s.season === 'spring' ? 0.4 : s.season === 'autumn' ? 0.12 : 0;
  if (!k) return 0;
  const eve = Math.max(s.night, s.hour > 12 ? 0.6 * s.dusk : 0);
  return k * eve * (1 - s.snow) * (0.75 + 0.25 * Math.max(s.wet, s.rain));
}
/** 蟋蟀 0…1：夏夜与秋夜（秋天白天草里也有一点）；雨夜少，冬天没有 */
export function cricketAmount(s: SceneState): number {
  const k = s.season === 'autumn' ? 1 : s.season === 'summer' ? 0.8 : s.season === 'spring' ? 0.25 : 0;
  if (!k) return 0;
  return k * Math.max(s.night, s.season === 'autumn' ? 0.14 : 0) * (1 - 0.6 * s.rain) * (1 - s.snow);
}
/** 雁 0…1：秋天（入冬还有零星的），晨昏与夜里过；雨天不过 */
export function gooseAmount(s: SceneState): number {
  const k = s.season === 'autumn' ? 1 : s.season === 'winter' ? 0.3 : 0;
  return k * (0.35 + 0.65 * Math.max(s.dawn, s.dusk, 0.7 * s.night)) * (1 - s.rain);
}
/** 村塾这会儿念不念书 0…1：只有上午（辰时到巳时末，与世界里孩子们的作息一致；下午他们在外头玩） */
export function schoolHours(s: SceneState): number {
  return bump(s.hour, 6.95, 7.2, 10.85, 11) * (1 - s.night);
}
/** 匠人这会儿干不干活 0…1：白天，中午歇（与世界里木匠的作息一致：7:30–11:40、13:00–17:25）；下雨下雪就收工 */
export function workHours(s: SceneState): number {
  return Math.max(bump(s.hour, 7.4, 7.6, 11.55, 11.7), bump(s.hour, 12.98, 13.15, 17.25, 17.4)) * (1 - s.night) * (1 - smooth(0.15, 0.4, s.rain)) * (1 - smooth(0.2, 0.5, s.snow));
}
/** 鸡鸣的时候 0…1：清晨（天将亮到日出后一个时辰） */
export const roosterTime = (s: SceneState) => smooth(0.12, 0.45, s.dawn);

// ———————————————————————————— 混 ————————————————————————————
/** 凝神听某一样时：哪几层提上来（头一个是主，其余是陪着的） */
export const FOCUS: Record<string, Bed[]> = {
  cicada: ['cicadas'], cicadas: ['cicadas'], rain: ['rain', 'drips'], stream: ['brook'], brook: ['brook'], birds: ['birds', 'swallows'], frogs: ['frogs'], crickets: ['crickets'],
  bamboo: ['bamboo'], pines: ['pines'], river: ['river'], waterfall: ['waterfall'], recite: ['school'], school: ['school'], snow: ['snow'],
};
/** 主的那一层提多少、陪着的提多少、别的退到多少（+7.6 分贝 / +3 分贝 / −7.5 分贝） */
const FOCUS_UP = 2.4, FOCUS_SIDE = 1.4, FOCUS_DOWN = 0.42;

export function mixScene(s: SceneState): Record<Bed, number> {
  const n = s.near, w = s.wind, winter = s.season === 'winter', trees = treesAt(s);
  const birds = birdDensity(s);
  const g: Record<Bed, number> = {
    // 风：到处都有一点「气」，冬天主要就听它；竹、松、叶、田各自要离得近，风越大越响
    air: (0.45 + 0.55 * w) * (winter ? 1.3 : 1) * (1 - 0.3 * s.snow),
    pines: pw(n.pines, 1.2) * (0.3 + 0.7 * w),
    bamboo: pw(n.bamboo, 1.2) * (0.25 + 0.75 * w),
    leaves: pw(n.grove, 1.2) * (0.2 + 0.8 * w) * (winter ? 0.2 : s.season === 'autumn' ? 0.9 : s.season === 'spring' ? 0.75 : 1),
    fieldwind: pw(n.fields, 1.1) * (0.25 + 0.75 * w) * (winter ? 0.6 : 1),
    // 水：冬天水小，雨后水大
    brook: pw(n.stream, 1.5) * (winter ? 0.8 : 1) * (1 + 0.2 * s.wet),
    pond: pw(n.pond, 1.3) * (winter ? 0.35 : 1),
    river: pw(n.river, 1.3),
    waterfall: pw(n.waterfall, 1.2) * (s.season === 'summer' ? 1.1 : winter ? 0.6 : 0.9) * (1 + 0.15 * s.wet),
    // 鸟虫：有没有、有多少看时辰季节天气；在不在跟前看离树、离水多近
    birds: birds > 0.015 ? 0.55 + 0.45 * Math.min(1, birds) : 0,
    swallows: swallowAmount(s),
    cicadas: cicadaAmount(s) * (0.55 + 0.45 * Math.max(trees, 0.7 * n.village, 0.6 * n.pond)),
    frogs: frogAmount(s) * (0.25 + 0.75 * Math.max(n.pond, 0.7 * n.stream, 0.8 * n.fields, 0.5 * n.river)),
    crickets: cricketAmount(s) * (0.6 + 0.4 * Math.max(n.fields, n.grove, 0.6 * n.bamboo, 0.6 * n.village)),
    geese: gooseAmount(s),
    // 天：雨、雨后的滴水（要有檐或有树）、雪、夜的静
    rain: s.rain,
    drips: Math.max(0.75 * s.rain, s.wet) * (0.3 + 0.7 * Math.max(eaveAt(s), 0.6 * trees)),
    snow: s.snow,
    night: s.night * (1 - 0.5 * s.rain),
    // 村里：鸡犬一直「在」（清晨的鸡鸣在桃林里也听得见，夜里隔很久一声远犬），各自的远近在层里按 near.village 算
    village: (1 - 0.4 * s.rain) * (1 - 0.3 * s.snow),
    school: pw(n.school, 1.3) * schoolHours(s) * (1 - 0.25 * s.rain),
    work: pw(n.work, 1.2) * workHours(s),
    // 水碓日夜不停（水一直在流）；冬天水小，转得慢些
    mill: pw(n.mill, 1.3) * (winter ? 0.7 : 1),
  };
  // 凝神听：那一层此刻真的在响，才把它提上来、把别的退下去
  const up = s.focus ? FOCUS[s.focus] : undefined;
  if (up && g[up[0]] > 0.02) for (const b of BED_NAMES) g[b] *= b === up[0] ? FOCUS_UP : up.includes(b) ? FOCUS_SIDE : FOCUS_DOWN;
  return g;
}
