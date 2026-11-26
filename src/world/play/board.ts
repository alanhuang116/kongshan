/**
 * 榜：各样玩法的成绩与修为排在一处。榜上三种人：
 *   自己——成绩存在世界的存档里（mem 'board'：各样最好的一回、最近几回）；
 *   村里人——各样玩法登记时给几位村里人一个成绩（一个人玩时榜上也有人，可以去追）；
 *   同游同屋的人——他们的名片（net 的 cd：至多十六个整数）里有他们各样最好的成绩。
 *
 * 哪样玩法上榜，由那样玩法自己登记（registerBoard）：叫什么、成绩怎么说、大的好还是小的好、村里人各几分。
 * 成绩一律是整数（几中、几分、几步、几秒）——名片上只能放整数。
 *
 * 名片上的位置（CARD_SLOT）同游的两边要一样：只往后添，不改前面的。card[0] 是这一套的版本。
 */
import type { Anlewo } from '../Anlewo';
import { getTogether } from '../net';

export type BoardKey = 'xiu' | 'quiz' | 'archery' | 'pitchpot' | 'skip' | 'cuju' | 'cock' | 'ride' | 'sit';
/** 名片上的位置（0 是版本） */
export const CARD_SLOT: Record<BoardKey, number> = { xiu: 1, quiz: 2, archery: 3, pitchpot: 4, skip: 5, cuju: 6, cock: 7, ride: 8, sit: 9 };
export const CARD_V = 1;
const CARD_LEN = 10;
/** 成绩的顶（名片上至多 999999） */
const MAX = 999999;

export interface BoardDef {
  key: BoardKey;
  /** 榜名（射箭、投壶……；修为榜就叫「修为」） */
  name: string;
  /** 成绩怎么说（「七中」「三十一步」「一刻又四分」） */
  fmt(v: number): string;
  /** 小的好（用时这一类）；默认大的好 */
  low?: boolean;
  /** 村里人的成绩：[称呼（榜上就写这个，如「王二郎」）, 成绩] */
  folk?: Array<[string, number]>;
  /** 在册页里排第几（小的在前；修为排最前） */
  order?: number;
  /** 一句说明：怎么算的、在哪里玩 */
  note?: string;
}
const DEFS = new Map<BoardKey, BoardDef>();
const subs = new Set<() => void>();
/** 登记一样上榜的玩法（各玩法的模块载入时调；同一个 key 再登记就换掉） */
export function registerBoard(d: BoardDef) { DEFS.set(d.key, d); for (const f of subs) f(); }
/** 已登记的各榜（按 order） */
export const boards = (): BoardDef[] => [...DEFS.values()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
export const boardOf = (key: BoardKey): BoardDef | null => DEFS.get(key) ?? null;
/** 榜有变（自己报了成绩、登记了新的一样）：界面据此重画。返回取消的函数 */
export function onBoard(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; }

interface Mem {
  best: Partial<Record<BoardKey, number>>;
  /** 最近几回：[哪一样, 成绩, 第几日] */
  log: Array<[BoardKey, number, number]>;
}
const NS = 'board';
const read = (k: Anlewo): Mem => {
  const m = k.mem.get<Partial<Mem>>(NS, {});
  return { best: m.best && typeof m.best === 'object' ? { ...m.best } : {}, log: Array.isArray(m.log) ? m.log.slice(-40) : [] };
};
const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const better = (key: BoardKey, a: number, b: number | null | undefined) => (b == null ? true : DEFS.get(key)?.low ? a < b : a > b);

/** 自己这一样最好的一回（没玩过是 null） */
export function best(k: Anlewo, key: BoardKey): number | null {
  const v = read(k).best[key];
  return valid(v) ? v : null;
}

/**
 * 报一回成绩（整数；会被夹到 0…999999）：比最好的好就记下。名片跟着变（同游同屋的人那边榜上就变了）。
 * 返回：是不是新的最好、原来最好的是多少、此刻在榜上第几（连村里人与同屋的人；1 是第一）
 */
export function report(k: Anlewo, key: BoardKey, value: number): { best: boolean; prev: number | null; rank: number } {
  const v = Math.max(0, Math.min(MAX, Math.round(valid(value) ? value : 0)));
  const m = read(k), prev = valid(m.best[key]) ? (m.best[key] as number) : null;
  const isBest = better(key, v, prev);
  if (isBest) m.best[key] = v;
  m.log.push([key, v, k.day]);
  if (m.log.length > 40) m.log.splice(0, m.log.length - 40);
  k.mem.set(NS, m);
  pushCard(k);
  for (const f of subs) f();
  const rs = rows(k, key);
  return { best: isBest, prev, rank: Math.max(1, rs.findIndex((r) => r.me) + 1) };
}

/** 修为这类不是「一回一回」的，而是攒着的：直接设成此刻的数（由修为那边调） */
export function setStanding(k: Anlewo, key: BoardKey, value: number) {
  const v = Math.max(0, Math.min(MAX, Math.round(valid(value) ? value : 0)));
  const m = read(k);
  if (m.best[key] === v) return;
  m.best[key] = v;
  k.mem.set(NS, m);
  pushCard(k);
  for (const f of subs) f();
}

/** 自己最近几回（新的在后） */
export function recent(k: Anlewo, key?: BoardKey): Array<{ key: BoardKey; v: number; day: number }> {
  return read(k).log.filter(([kk]) => !key || kk === key).map(([kk, v, day]) => ({ key: kk, v, day }));
}

/** 名片：[版本, 修为, 答题, 射箭, 投壶, 打水漂, 蹴鞠, 斗鸡, 骑, 打坐]（没玩过的是 0） */
export function cardOf(k: Anlewo): number[] {
  const m = read(k), out = new Array<number>(CARD_LEN).fill(0);
  out[0] = CARD_V;
  for (const [key, slot] of Object.entries(CARD_SLOT) as Array<[BoardKey, number]>) {
    const v = m.best[key];
    if (valid(v)) out[slot] = Math.max(0, Math.min(MAX, Math.round(v)));
  }
  return out;
}
/** 把名片报给同游（没连上时记着，连上了一并报） */
export function pushCard(k: Anlewo) { getTogether()?.setCard(cardOf(k)); }

export interface BoardRow {
  /** 榜上写的名字（自己是自己的雅号；村里人是称呼；同屋的人是雅号） */
  name: string;
  v: number; text: string;
  me?: boolean; folk?: boolean;
  /** 同屋的人：他在中转上的编号、衣色 */
  peer?: number; c?: number;
}
/**
 * 一张榜（自己、村里人、同屋的人，按成绩排好；同分的自己排在前头）。自己没玩过的不在上头。
 * myName 是自己在榜上叫什么（不给就用 persona 的雅号，再没有就叫「我」）
 */
export function rows(k: Anlewo, key: BoardKey, myName?: string): BoardRow[] {
  const def = DEFS.get(key), fmt = def?.fmt ?? ((v: number) => String(v));
  const out: BoardRow[] = [];
  const mine = best(k, key);
  if (mine != null) out.push({ name: myName ?? (k.persona.name || '我'), v: mine, text: fmt(mine), me: true });
  for (const [name, v] of def?.folk ?? []) out.push({ name, v, text: fmt(v), folk: true });
  const tg = getTogether(), slot = CARD_SLOT[key];
  if (tg) for (const r of tg.cards()) {
    if (r.me || r.cd[0] !== CARD_V) continue;
    const v = r.cd[slot];
    if (!valid(v) || v <= 0) continue;
    out.push({ name: r.label, v, text: fmt(v), peer: r.id, c: r.c });
  }
  const low = !!def?.low;
  out.sort((a, b) => (a.v === b.v ? (a.me ? -1 : b.me ? 1 : 0) : low ? a.v - b.v : b.v - a.v));
  return out;
}

/** 世界建好时调一回：把存档里的名片报给同游（之后每报一回成绩再报） */
export function startBoard(k: Anlewo) { pushCard(k); }
