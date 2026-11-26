/**
 * 月建：一年十二个月按地支排（子 0 … 亥 11），以「节」交月——大雪起子月（夏历十一月）、小寒起丑月、立春起寅月（正月）……
 * 十二消息卦按月配的就是这个：复是子月之卦、临是丑月、泰是寅月……
 * 四时：寅卯辰为春，巳午未为夏，申酉戌为秋，亥子丑为冬。
 */
import { Solar } from 'lunar-javascript';
import type { Season } from './atmos';

const ZHI = '子丑寅卯辰巳午未申酉戌亥';

/** 那一月在哪一季 */
export function seasonOfMonth(m: number): Season {
  const i = ((m % 12) + 12) % 12;
  return i >= 2 && i <= 4 ? 'spring' : i >= 5 && i <= 7 ? 'summer' : i >= 8 && i <= 10 ? 'autumn' : 'winter';
}
/** 一季当中的那个月（只拨了季、没拨月时用它）：卯、午、酉、子 */
export const MID_MONTH: Record<Season, number> = { spring: 3, summer: 6, autumn: 9, winter: 0 };

/**
 * 某一天在哪个月建。y m d 是那一地的年月日（m 从 1 起）。
 * 历算不出来（不该有）时按阳历月份估：阳历一月多在丑月，以此类推，差在交节的那几天。
 */
export function monthOfYmd(y: number, m: number, d: number): number {
  // 同游时一秒问一回：同一天就不再排一遍历
  const key = y * 10000 + m * 100 + d;
  if (key === cache.key) return cache.m;
  let out = (m + (d >= 6 ? 0 : -1) + 12) % 12;
  try {
    const i = ZHI.indexOf(Solar.fromYmd(y, m, d).getLunar().getMonthZhi());
    if (i >= 0) out = i;
  } catch { /* 用上面估的 */ }
  cache.key = key; cache.m = out;
  return out;
}
const cache = { key: 0, m: 0 };

/** 某个时区（分钟，东八区 480）此刻的钟点（0…24）与那一地的年月日 */
export function clockAt(tz: number, now = Date.now()): { hour: number; y: number; m: number; d: number } {
  const t = new Date(now + tz * 60000);
  return { hour: t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600, y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** 本机的时区（分钟） */
export const localTz = () => -new Date().getTimezoneOffset();
