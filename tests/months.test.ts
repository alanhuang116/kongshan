// 月建（十二消息卦按月）与同游的园中天时：以节交月、四时、某个时区的此刻、「那里比你这里快几个钟头」
import { describe, expect, it } from 'vitest';
import { MID_MONTH, clockAt, monthOfYmd, seasonOfMonth } from '../src/world/env/months';
import { tzDiff } from '../src/app/calendar';

describe('月建', () => {
  it('以节交月：立冬后是亥月、大雪起子月、小寒起丑月、立春起寅月、白露后是酉月', () => {
    expect(monthOfYmd(2026, 11, 25)).toBe(11);
    expect(monthOfYmd(2026, 12, 8)).toBe(0);
    expect(monthOfYmd(2026, 2, 3)).toBe(1);
    expect(monthOfYmd(2026, 2, 5)).toBe(2);
    expect(monthOfYmd(2026, 9, 15)).toBe(9);
  });
  it('四时：寅卯辰春、巳午未夏、申酉戌秋、亥子丑冬；一季当中的那个月落在那一季', () => {
    const want = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
    for (let m = 0; m < 12; m++) expect(seasonOfMonth(m)).toBe(want[m]);
    for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) expect(seasonOfMonth(MID_MONTH[s])).toBe(s);
  });
});

describe('园中天时', () => {
  it('某个时区的此刻：钟点与那一地的年月日', () => {
    const t = Date.UTC(2026, 10, 25, 20, 30);
    // 上海已是 26 日早上四点半；巴黎还是 25 日晚上九点半；纽约下午三点半
    expect(clockAt(480, t)).toEqual({ hour: 4.5, y: 2026, m: 11, d: 26 });
    expect(clockAt(60, t)).toEqual({ hour: 21.5, y: 2026, m: 11, d: 25 });
    expect(clockAt(-300, t).hour).toBeCloseTo(15.5);
  });
  it('那里比你这里快（慢）几个钟头', () => {
    expect(tzDiff(480, 60)).toBe('那里比你这里快七个钟头');
    expect(tzDiff(60, 480)).toBe('那里比你这里慢七个钟头');
    expect(tzDiff(330, 480)).toBe('那里比你这里慢两个半钟头');
    expect(tzDiff(510, 480)).toBe('那里比你这里快半个钟头');
    expect(tzDiff(480, 480)).toBe('');
  });
});
