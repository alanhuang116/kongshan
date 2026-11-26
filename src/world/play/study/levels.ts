/**
 * 修为的几重（只有数与字）：名字取《礼记·大学》那一句——原文在 data/verses.ts 的 v73（逐字核对过），这里一个字也不另写：
 *   「知止而后有定，定而后能静，静而后能安，安而后能虑，虑而后能得。」
 *   知止 → 定 → 静 → 安 → 虑 → 得，六重；每重注它出在哪半句。
 */
import { VERSES } from '../../../data/verses';

const DAXUE = VERSES.find((v) => v.from.includes('大学') && v.lines[0]?.startsWith('知止')) ?? null;
/** 《大学》那五句（原文）与出处 */
export const DAXUE_LINES: string[] = DAXUE ? [...DAXUE.lines] : [];
export const DAXUE_FROM = DAXUE?.from ?? '《礼记·大学》';
/** 本应用给那一句的白话（verses.ts 里的 gloss） */
export const DAXUE_GLOSS = DAXUE?.gloss ?? '';
/** 每重从多少分起 */
export const LEVEL_AT = [0, 30, 90, 200, 380, 640];
export interface Level { i: number; name: string; at: number; /** 这一重出在哪半句（原文） */ cite: string }
export const LEVELS: Level[] = LEVEL_AT.map((at, i) => {
  const l = DAXUE_LINES;
  // 知止取第一句的头两字；其后各取第 i 句（从 1 数）末尾那一字：定、静、安、虑、得
  const name = i === 0 ? (l[0]?.slice(0, 2) ?? '知止') : (l[i - 1]?.slice(-1) ?? '');
  return { i, name, at, cite: l[Math.max(0, i - 1)] ?? '' };
});
/** pts 分在第几重、离下一重还差多少、这一重走到几成 */
export function levelOf(pts: number): { level: Level; next: Level | null; toNext: number; frac: number } {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (pts >= LEVELS[k].at) i = k;
  const level = LEVELS[i], next = LEVELS[i + 1] ?? null;
  return { level, next, toNext: next ? next.at - pts : 0, frac: next ? (pts - level.at) / (next.at - level.at) : 1 };
}
