/**
 * 打坐时眼前的天象（只有数）：静了多久到哪一境，每一境里画上该是几点、哪一季、月几分，入定时星斗转过多少年。
 *
 *   一时 —— 一个时辰（两个钟头）在四十秒里过去：日影移过，远山半腰的云慢慢升起来。
 *   一夜 —— 从天黑到天亮：北斗绕着北极转过大半圈。
 *   一月 —— 从上弦到残月：黄昏时半个月在南天，胖到半夜的满月，再瘦成黎明东南天上的一弯。
 *   一岁 —— 四时轮过一遍：春花、夏荷、秋菊、冬雪。
 *   入定 —— 一会（《皇极经世》三十年一世、十二世一运、三十运一会：一万零八百年）：北极离开勾陈一，星移斗转。
 * 境的次第跟着修为：知止到一时，定到一夜，静到一月，安到一岁，虑与得到入定。
 *
 * 入定的岁差：星表是 J2000 的，画里的天按今年算（env/stars/astro.ts 的 precession，IAU 1976，只管几百年）。
 * 一万年那样长，这里另算——天极绕着黄极转，一年 50.29″（总岁差），黄赤交角取 23.44° 不变；
 * 这样算出来的天极路线与真的差一两度，看「哪颗星近北极」够了。星的自行没有数据，不算（北斗的样子不变）。
 */
import { D2R, m3, type M3 } from '../../env/stars/astro';
import type { Season } from '../../env/atmos';

export interface Tier {
  id: 'shi' | 'ye' | 'yue' | 'sui' | 'ding';
  name: string;
  /** 静到第几秒进这一境、这一境走多久（秒） */
  from: number; dur: number;
  /** 修为到第几重（xiuwei.ts 的 LEVELS 序号）才到得了 */
  need: number;
  /** 一句话：这一境看什么（本应用的话） */
  note: string;
}
/** 坐下先调息几秒，才有天象 */
export const SETTLE = 6;
export const TIERS: Tier[] = [
  { id: 'shi', name: '一时', from: SETTLE, dur: 40, need: 0, note: '一个时辰过去：日影移过，云起山腰' },
  { id: 'ye', name: '一夜', from: SETTLE + 40, dur: 50, need: 1, note: '天黑到天亮：北斗绕着北极转' },
  { id: 'yue', name: '一月', from: SETTLE + 90, dur: 50, need: 2, note: '上弦到残月：月一夜一夜地圆，又一夜一夜地缺' },
  { id: 'sui', name: '一岁', from: SETTLE + 140, dur: 60, need: 3, note: '四时轮过一遍：春花、夏荷、秋菊、冬雪' },
  { id: 'ding', name: '入定', from: SETTLE + 200, dur: 60, need: 4, note: '一会，一万零八百年：北极离开勾陈一，星移斗转' },
];
/** 修为第 level 重够得着的最深一境（0…4） */
export const tierCap = (level: number) => Math.max(0, Math.min(TIERS.length - 1, Math.floor(level)));

/**
 * 静了 depth 秒，到了哪一境（修为够得着的最深是 cap）：i 是第几境（还在调息是 −1），u 是这一境走到几成（0…1），
 * held：已经是够得着的最深一境、又走到了头（停在那里）
 */
export function tierAt(depth: number, cap: number): { i: number; u: number; held: boolean } {
  if (depth < SETTLE) return { i: -1, u: 0, held: false };
  let i = 0;
  for (let k = 0; k <= Math.min(cap, TIERS.length - 1); k++) if (depth >= TIERS[k].from) i = k;
  const T = TIERS[i], u = Math.max(0, Math.min(1, (depth - T.from) / T.dur));
  return { i, u, held: i === cap && u >= 1 };
}

/** 打坐榜上的数：到了第几境（1…5）× 1000 + 在那一境里坐了几秒（至多 999） */
export const sitScore = (i: number, sec: number) => (i < 0 ? 0 : (i + 1) * 1000 + Math.max(0, Math.min(999, Math.round(sec))));
const CN = '〇一二三四五六七八九十';
/** 几秒说成「半分」「一分」「一分半」「两分」……（不到半分不说） */
export function minutes(sec: number): string {
  const h = Math.floor(sec / 30);
  if (h < 1) return '';
  const m = Math.floor(h / 2), half = h % 2 === 1;
  if (!m) return '半分';
  const n = m === 2 ? '两' : m <= 10 ? CN[m] : m < 20 ? '十' + CN[m - 10] : String(m);
  return `${n}分${half ? '半' : ''}`;
}
/** 打坐榜上怎么写：「一岁」「入定 · 两分半」 */
export function fmtSit(v: number): string {
  const i = Math.floor(v / 1000) - 1, sec = v % 1000;
  const t = TIERS[Math.max(0, Math.min(TIERS.length - 1, i))];
  const m = minutes(sec);
  return m ? `${t.name} · ${m}` : t.name;
}

const ease = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const wrap24 = (h: number) => ((h % 24) + 24) % 24;
/** 一时：从坐下时的 h0 起，两个钟头 */
export const hourShi = (h0: number, u: number) => wrap24(h0 + 2 * ease(u));
/** 一夜：天黑透（日落后半个多钟头）到天亮前（日出前小半个钟头）；sr、ss 是这一季的日出日落 */
export const hourYe = (u: number, sr: number, ss: number) => wrap24(ss + 0.6 + (sr + 24 - 0.4 - (ss + 0.6)) * ease(u));
/**
 * 一月：月相从上弦前一点（0.22）到残月（0.94）；钟点挑月在天上最高、天又还黑着的时候（月在正南大约是 12 + 24×月相 点，
 * 夹在黄昏与黎明之间）——于是黄昏时半个月在南天，望月在半夜，残月在黎明的东南天。
 * （新月那几夜月贴着日落的西天，石边那株柳正在西边，看不见，所以不从新月起）
 */
export function moonYue(u: number, sr: number, ss: number): { phase: number; hour: number } {
  const phase = 0.22 + 0.72 * Math.max(0, Math.min(1, u));
  const h = Math.max(ss + 1.0, Math.min(sr + 24 - 0.6, 12 + 24 * phase));
  return { phase, hour: wrap24(h) };
}
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
/** 一岁：从坐下那一季的下一季起，轮过四季，回到那一季（u 走到哪一季） */
export function seasonSui(u: number, from: Season): Season {
  const k = SEASONS.indexOf(from), q = Math.min(3, Math.floor(Math.max(0, u) * 4));
  return SEASONS[(k + 1 + q) % 4];
}
/** 入定：星斗往后推多少年（一会，一万零八百年；走得匀，头尾缓一点） */
export const YEARS_HUI = 30 * 12 * 30;
export const yearsDing = (u: number) => YEARS_HUI * ease(u);

/** 总岁差（角秒 / 年）与黄赤交角 */
export const PREC = 50.29, EPS = 23.4393 * D2R;
/**
 * 往后 years 年：J2000 的赤道坐标 → 那时的赤道坐标（绕黄极转 PREC·years）。一个按行存的 3×3。
 * 那时的北天极在 J2000 里的方向，就是这一个的转置乘 (0, 0, 1)。
 */
export function precessLong(years: number): M3 {
  const th = ((PREC * years) / 3600) * D2R, kx = 0, ky = -Math.sin(EPS), kz = Math.cos(EPS);
  const c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return m3([
    c + kx * kx * C, kx * ky * C - kz * s, kx * kz * C + ky * s,
    ky * kx * C + kz * s, c + ky * ky * C, ky * kz * C - kx * s,
    kz * kx * C - ky * s, kz * ky * C + kx * s, c + kz * kz * C,
  ]);
}
/** 往后 years 年的北天极（J2000 单位向量） */
export function poleAt(years: number): [number, number, number] {
  const R = precessLong(years);
  // 转置乘 (0,0,1)：取第三行
  return [R[6], R[7], R[8]];
}
