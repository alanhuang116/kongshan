/**
 * 一讲的内容（只有数与字，不碰画）：讲哪一卦，先生说哪几句，讲完问哪三句。
 * 同游的两边拿同一个种子（这一讲的钟点格）算，一字不差；独游拿开讲那一刻做种子。
 *
 * 古书的字都从 data/yi.ts 原样取（卦辞、大象、《说卦》w14 里的「某，某也」），带出处；
 * 白话是 yi.ts 里本应用的那一句；连缀的话、问法是 data/lecture.ts 里本应用写的。这里不添一个字。
 */
import { GUA, TRIGRAMS, YI_WORDS, type Gua, type Trigram } from '../../../data/yi';
import { ASK, CLOSE, OPEN } from '../../../data/lecture';
import { mulberry32 } from '../../core/rng';

export interface Line {
  /** say 先生自己的话 · shuo《说卦》· judg 卦辞 · image 大象 · gloss 白话 */
  kind: 'say' | 'shuo' | 'judg' | 'image' | 'gloss';
  /** 面板头上那一行小字（谁说的之后）：卦辞、象曰、白话……；先生自己的话是空的 */
  lead: string;
  text: string;
  /** 古书原文的出处（本应用的话没有） */
  source?: string;
}
export interface Question {
  kind: 'tri' | 'moral' | 'gloss';
  ask: string;
  options: string[];
  /** 对的是第几项 */
  answer: number;
}
export interface Lesson { gua: Gua; index: number; lines: Line[]; quiz: Question[] }

const tri = (id: string): Trigram => TRIGRAMS.find((t) => t.id === id)!;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, key: string) => v[key] ?? '');

/** 《说卦》「乾，健也；坤，顺也；……」那一句，拆成一卦一段（每段都是原句里连着的字） */
const SHUO = YI_WORDS.find((w) => w.id === 'w14') ?? null;
export const SHUO_PIECES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  if (!SHUO) return out;
  for (const seg of SHUO.text.replace(/。$/, '').split('；')) {
    const t = TRIGRAMS.find((x) => seg.startsWith(x.name + '，'));
    if (t) out[t.id] = seg;
  }
  return out;
})();

/** 大象的下半句：君子（先王、后、上、大人）以……（乾、坤没有卦名夹在中间，也一样取） */
export function moralOf(g: Gua): string {
  const m = /(君子|先王|大人|后|上)以.*$/.exec(g.image);
  return (m ? m[0] : g.image).replace(/。$/, '');
}
/** 白话的头一截：到第一个分号；太长就到第一个逗号 */
export function glossHead(g: Gua): string {
  const a = g.gloss.split('；')[0];
  return [...a].length <= 16 ? a : a.split('，')[0];
}
/** 上下两卦：「上坎下震」 */
export const pairOf = (g: Gua) => `上${tri(g.upper).name}下${tri(g.lower).name}`;

/** 先生说的那几句：开讲、《说卦》、卦辞、大象、白话、收尾 */
export function linesOf(g: Gua): Line[] {
  const U = tri(g.upper), L = tri(g.lower), n = g.n - 1;
  const pair = U.id === L.id ? `上下都是${U.name}` : `${U.name}在上，${L.name}在下`;
  const out: Line[] = [{ kind: 'say', lead: '', text: fill(OPEN[n % OPEN.length], { name: g.name, pair }) }];
  const pu = SHUO_PIECES[U.id], pl = SHUO_PIECES[L.id];
  if (pu && pl) out.push({ kind: 'shuo', lead: '说卦', text: U.id === L.id ? `「${pu}」` : `「${pu}」　「${pl}」`, source: '《周易·说卦》' });
  out.push({ kind: 'judg', lead: '卦辞', text: g.judgment, source: `《周易·${g.name}》` });
  out.push({ kind: 'image', lead: '象曰', text: g.image, source: '《周易·象传》' });
  out.push({ kind: 'gloss', lead: '白话', text: g.gloss });
  out.push({ kind: 'say', lead: '', text: CLOSE[(n * 7 + 3) % CLOSE.length] });
  return out;
}

/** 从 pool 里按 r 挑 n 个与 avoid 都不同、彼此也不同（按 key）的 */
function pickOthers<T>(r: () => number, pool: T[], n: number, key: (x: T) => string, avoid: Set<string>): T[] {
  const out: T[] = [], seen = new Set(avoid), idx = pool.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  for (const i of idx) {
    if (out.length >= n) break;
    const k = key(pool[i]);
    if (seen.has(k)) continue;
    seen.add(k); out.push(pool[i]);
  }
  return out;
}
function shuffle(r: () => number, a: string[], right: string): Question['options'] & { answer: number } {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return Object.assign(b, { answer: b.indexOf(right) });
}

/** 讲完问的三句：哪两卦叠成、大象的下半句、白话里的景。每句四选一，三个陪衬取别的卦 */
export function quizOf(g: Gua, seed: number): Question[] {
  const r = mulberry32((seed >>> 0) ^ 0x9e3779b9), others = GUA.filter((x) => x.n !== g.n), name = { name: g.name };
  // 一、两卦：对调的那一个最容易混，先放进来
  const right1 = pairOf(g), alt: string[] = [];
  if (g.upper !== g.lower) alt.push(`上${tri(g.lower).name}下${tri(g.upper).name}`);
  const pairs = TRIGRAMS.flatMap((a) => TRIGRAMS.map((b) => `上${a.name}下${b.name}`));
  alt.push(...pickOthers(r, pairs, 3 - alt.length, (x) => x, new Set([right1, ...alt])));
  const o1 = shuffle(r, [right1, ...alt], right1);
  // 二、大象的下半句
  const right2 = moralOf(g), o2 = shuffle(r, [right2, ...pickOthers(r, others, 3, moralOf, new Set([right2])).map(moralOf)], right2);
  // 三、白话里的景
  const right3 = glossHead(g), o3 = shuffle(r, [right3, ...pickOthers(r, others, 3, glossHead, new Set([right3])).map(glossHead)], right3);
  return [
    { kind: 'tri', ask: fill(ASK.tri, name), options: [...o1], answer: o1.answer },
    { kind: 'moral', ask: fill(ASK.moral, name), options: [...o2], answer: o2.answer },
    { kind: 'gloss', ask: fill(ASK.gloss, name), options: [...o3], answer: o3.answer },
  ];
}

/** 一讲：讲第 index 卦（通行本卦序，0 是乾），种子 seed */
export function lessonOf(index: number, seed: number): Lesson {
  const i = ((Math.floor(index) % 64) + 64) % 64, g = GUA[i];
  return { gua: g, index: i, lines: linesOf(g), quiz: quizOf(g, seed) };
}

/** 一题得几分：答对 10 分，答得快再加至多 5 分（left：这一题还剩几成时间） */
export const scoreOf = (right: boolean, left: number) => (right ? 10 + Math.round(5 * Math.max(0, Math.min(1, left))) : 0);
/** 独游时先生讲到哪一卦：从乾讲起，讲过的跳过；都讲过了，从上回讲的下一卦接着 */
export function nextCourse(heard: ReadonlySet<number>, last = -1): number {
  for (let i = 0; i < 64; i++) if (!heard.has(i)) return i;
  return (last + 1 + 64) % 64;
}
