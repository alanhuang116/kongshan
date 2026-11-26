/**
 * 抢座（只有数）：村塾里六领席，三领是三个孩子的（他们天天坐的那几张矮桌），余下三领谁先要谁得。
 *
 * 同游时要一席就发一条「抢座」给同屋的人：[这一讲的格号, 第几席, 开讲后第几毫秒要的, 1 要 / 0 让]。
 * 各人手里都记着每个人最后要的那一席；同一席有几个人要，先要的得，一样早的编号小的得——
 * 谁收到的先后不一样都不要紧：消息到齐了，各人算出来的都一样。
 */

/** 一个人此刻要的那一席：第几席、开讲后第几毫秒要的 */
export interface Wish { seat: number; t: number }

/** 各席归谁：席号 → 那人的编号（reserved 里的席不算，孩子坐着） */
export function resolveSeats(wishes: ReadonlyMap<number, Wish>, reserved: ReadonlySet<number>): Map<number, number> {
  const best = new Map<number, { id: number; t: number }>();
  for (const [id, w] of wishes) {
    if (reserved.has(w.seat) || w.seat < 0) continue;
    const b = best.get(w.seat);
    if (!b || w.t < b.t || (w.t === b.t && id < b.id)) best.set(w.seat, { id, t: w.t });
  }
  return new Map([...best].map(([s, b]) => [s, b.id]));
}

/** 「抢座」那一条里的几个数 */
export const seatMsg = (slot: number, seat: number, t: number, on: boolean): number[] => [slot % 1000000, seat, Math.max(0, Math.min(9999999, Math.round(t))), on ? 1 : 0];
export function readSeatMsg(d: number[]): { slot: number; seat: number; t: number; on: boolean } | null {
  if (d.length < 4 || !d.every(Number.isInteger) || d[1] < 0 || d[1] > 15 || d[2] < 0) return null;
  return { slot: d[0], seat: d[1], t: d[2], on: d[3] === 1 };
}
/** 「答题」那一条：[格号, 得分, 答对几题] */
export const quizMsg = (slot: number, score: number, right: number): number[] => [slot % 1000000, Math.max(0, Math.min(99, Math.round(score))), Math.max(0, Math.min(3, right))];
export function readQuizMsg(d: number[]): { slot: number; score: number; right: number } | null {
  if (d.length < 3 || !d.every(Number.isInteger) || d[1] < 0 || d[1] > 99 || d[2] < 0 || d[2] > 3) return null;
  return { slot: d[0], score: d[1], right: d[2] };
}
