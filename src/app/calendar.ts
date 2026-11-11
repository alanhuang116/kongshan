/** 历：农历、节气、时辰；按月份定四时的景；按农历日定月相。 */
import { Solar } from 'lunar-javascript';
import type { Season } from '../world/env/atmos';

const ZHI = '子丑寅卯辰巳午未申酉戌亥';
export interface Today {
  /** 「丙午年 十月初二」 */
  lunar: string;
  /** 「立冬」或「立冬后三日」 */
  term: string;
  /** 月相：0 朔 … 0.5 望 … 1 */
  moon: number;
  season: Season;
  /** yyyy-mm-dd（当地） */
  key: string;
}
export function seasonOf(d: Date): Season {
  const m = d.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}
export { cn } from '../util/cn';
import { cn } from '../util/cn';
export const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function today(d = new Date()): Today {
  let lunar = '', term = '', moon = 0.5;
  try {
    const s = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()), l = s.getLunar();
    lunar = `${l.getYearInGanZhi()}年 ${l.getMonthInChinese()}月${l.getDayInChinese()}`;
    moon = Math.min(0.999, Math.max(0, (l.getDay() - 1) / 29.53));
    const jq = l.getJieQi();
    if (jq) term = jq;
    else {
      const p = l.getPrevJieQi(true), ps = p.getSolar();
      const days = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(ps.getYear(), ps.getMonth() - 1, ps.getDay())) / 86400000);
      term = `${p.getName()}后${cn(days)}日`;
    }
  } catch { /* 历算不出来就不显示 */ }
  return { lunar, term, moon, season: seasonOf(d), key: keyOf(d) };
}
/** 时辰：「申时」 */
export function shichen(hour: number): string {
  return ZHI[Math.floor(((hour + 1) % 24) / 2)] + '时';
}
/** 一天里的哪一段：晨、昼、暮、夜（给界面的措辞用） */
export function partOfDay(hour: number): '晨' | '昼' | '暮' | '夜' {
  return hour >= 5 && hour < 9 ? '晨' : hour >= 9 && hour < 16.5 ? '昼' : hour >= 16.5 && hour < 19.5 ? '暮' : '夜';
}
