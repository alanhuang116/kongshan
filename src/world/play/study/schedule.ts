/**
 * 学堂讲卦的钟点（只有数）。
 *
 *   一讲的几段：聚（先生走来、孩子们回席、来人抢座）→ 讲（六句，一句一停）→ 问（三题，一题一段）→ 散（看这一回谁答得好）。
 *   同游（屋里另有人、园中天时随最早来的那一位）：钟上每逢整十分（:00、:10、:20……）开讲一回，只在园中白天（辰时到申时）——
 *     谁都拿自己这边的钟算「此刻在哪一格」，同一格就是同一讲（讲哪一卦、问哪三题也由这一格定），用不着谁发话。
 *   独游：白天走到村塾前、站下来，就开讲；讲完歇三分钟（没来听的歇十分钟），再来才讲下一回（时辰停着也一样）。
 */
import { clockAt } from '../../env/months';

/** 各段多长（秒）：聚、一句、一题、散 */
export const T = { gather: 36, line: 7.5, ask: 15, show: 18 } as const;
/** 一讲讲几句（lesson.ts 的 linesOf 给六句） */
export const LINES_N = 6;
/** 一讲连问答一共多久（秒） */
export const DUR = T.gather + LINES_N * T.line + 3 * T.ask + T.show;
/** 同游时隔多久一讲（毫秒） */
export const SLOT_MIN = 10;
export const SLOT_MS = SLOT_MIN * 60000;
/** 独游时讲完歇多久才讲下一回（毫秒） */
export const SOLO_REST_MS = 3 * 60000;
/** 独游时讲了一回人却没来听（只是从村塾前走过、站了站）：歇十分钟 */
export const SOLO_IDLE_MS = 10 * 60000;
/** 园中白天才讲：辰时（七点）起，申时末（十七点半）止 */
export const dayHour = (h: number) => h >= 7 && h < 17.5;

export type Phase =
  | { kind: 'gather'; t: number; t1: number }
  | { kind: 'line'; i: number; t: number; t1: number }
  | { kind: 'ask'; i: number; t: number; t1: number }
  | { kind: 'show'; t: number; t1: number }
  | { kind: 'done'; t: number; t1: number };
/** 开讲后第 t 秒在哪一段（t1 是这一段在第几秒结束）；n 是这一讲有几句 */
export function phaseAt(t: number, n = LINES_N): Phase {
  const g = T.gather, l = g + n * T.line, q = l + 3 * T.ask, s = q + T.show;
  if (t < g) return { kind: 'gather', t, t1: g };
  if (t < l) { const i = Math.floor((t - g) / T.line); return { kind: 'line', i, t, t1: g + (i + 1) * T.line }; }
  if (t < q) { const i = Math.floor((t - l) / T.ask); return { kind: 'ask', i, t, t1: l + (i + 1) * T.ask }; }
  if (t < s) return { kind: 'show', t, t1: s };
  return { kind: 'done', t, t1: Infinity };
}
/** 一讲一共多久（n 句） */
export const durOf = (n = LINES_N) => T.gather + n * T.line + 3 * T.ask + T.show;

/** 此刻在哪一格（同游）：格号与这一格开讲的那一刻（毫秒） */
export function slotOf(now: number): { slot: number; t0: number } {
  const slot = Math.floor(now / SLOT_MS);
  return { slot, t0: slot * SLOT_MS };
}
/** 同游时这一格讲哪一卦（通行本卦序 0…63）：一格一卦，挨着往下讲 */
export const groupGua = (slot: number) => ((slot % 64) + 64) % 64;
/**
 * 同游：此刻有没有一讲（tz 是园中天时那一位的时区，分钟）。有就给格号、开讲的那一刻、讲哪一卦、种子；
 * 这一格的讲已经散了、或开讲那一刻园中不是白天：null
 */
export function groupLecture(now: number, tz: number, n = LINES_N): { slot: number; t0: number; gua: number; seed: number } | null {
  const { slot, t0 } = slotOf(now);
  if ((now - t0) / 1000 >= durOf(n)) return null;
  if (!dayHour(clockAt(tz, t0).hour)) return null;
  return { slot, t0, gua: groupGua(slot), seed: slot };
}
/** 同游：下一讲在什么时候（此刻正讲着的不算；一天之内找不到——比如园中正是长夜——给 null） */
export function nextGroup(now: number, tz: number): { slot: number; t0: number; gua: number } | null {
  const { slot } = slotOf(now);
  for (let s = slot + 1; s < slot + 1 + (24 * 60) / SLOT_MIN; s++) {
    const t0 = s * SLOT_MS;
    if (dayHour(clockAt(tz, t0).hour)) return { slot: s, t0, gua: groupGua(s) };
  }
  return null;
}
