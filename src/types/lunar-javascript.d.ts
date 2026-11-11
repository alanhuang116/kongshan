declare module 'lunar-javascript' {
  interface SolarT { getYear(): number; getMonth(): number; getDay(): number; toYmd(): string; getLunar(): LunarT }
  interface JieQiT { getName(): string; getSolar(): SolarT }
  interface LunarT {
    getYear(): number; getMonth(): number; getDay(): number;
    getYearInGanZhi(): string; getYearInChinese(): string; getMonthInChinese(): string; getDayInChinese(): string;
    getJieQi(): string;
    getPrevJieQi(wholeDay?: boolean): JieQiT;
    getNextJieQi(wholeDay?: boolean): JieQiT;
  }
  export const Solar: { fromYmd(y: number, m: number, d: number): SolarT; fromDate(d: Date): SolarT };
}
