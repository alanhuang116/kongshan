/** 历：农历、节气、时辰；按农历日定月相。 */
import { Solar } from 'lunar-javascript';

export interface Today {
  /** 「丙午年 十月初二」 */
  lunar: string;
  /** 「立冬」或「立冬后三日」 */
  term: string;
  /** 眼下在哪个节气里（只有名字：「立冬」）。算不出来是空的 */
  termName: string;
  /** 月相：0 朔 … 0.5 望 … 1 */
  moon: number;
  /** yyyy-mm-dd（当地） */
  key: string;
}
export { cn } from '../util/cn';
import { cn } from '../util/cn';
export const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function today(d = new Date()): Today {
  let lunar = '', term = '', termName = '', moon = 0.5;
  try {
    const s = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate()), l = s.getLunar();
    lunar = `${l.getYearInGanZhi()}年 ${l.getMonthInChinese()}月${l.getDayInChinese()}`;
    moon = Math.min(0.999, Math.max(0, (l.getDay() - 1) / 29.53));
    const jq = l.getJieQi();
    if (jq) { term = jq; termName = jq; }
    else {
      const p = l.getPrevJieQi(true), ps = p.getSolar();
      const days = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(ps.getYear(), ps.getMonth() - 1, ps.getDay())) / 86400000);
      termName = p.getName();
      term = `${termName}后${cn(days)}日`;
    }
  } catch { /* 历算不出来就不显示 */ }
  return { lunar, term, termName, moon, key: keyOf(d) };
}
/** 第几个时辰（子 0 … 亥 11）：子时是夜里十一点到一点 */
export const branchOf = (hour: number) => Math.floor(((((hour % 24) + 24) % 24 + 1) % 24) / 2);
/** 那个时辰的正中是几点（子 0 点、丑 2 点……） */
export const hourOfBranch = (i: number) => (((i % 12) + 12) % 12) * 2;
