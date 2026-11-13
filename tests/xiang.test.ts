// 观象：六十四卦一卦不重、一卦不缺（表上六十三，「既济」在煮茶里）；文字那边备好了的话，卦名要对得上。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// xiang.ts 要浏览器里的东西（import.meta.glob 等）才装得起来，这里只读它的表
const src = readFileSync(new URL('../src/world/acts/xiang.ts', import.meta.url), 'utf8');
const names = [...src.matchAll(/\{ gua: '([^']+)', label: '([^']+)'/g)].map((m) => m[1]);
const ALL = '乾坤屯蒙需讼师比|小畜|履泰否|同人|大有|谦豫随蛊临观|噬嗑|贲剥复|无妄|大畜|颐|大过|坎离咸恒遁|大壮|晋|明夷|家人|睽蹇解损益夬姤萃升困井革鼎震艮渐|归妹|丰旅巽兑涣节|中孚|小过|既济|未济'
  .split('|').flatMap((s) => (s.length > 1 && !/^(小畜|同人|大有|噬嗑|无妄|大畜|大过|大壮|明夷|家人|归妹|中孚|小过|既济|未济)$/.test(s) ? [...s] : [s]));

const inActs = JSON.parse((src.match(/IN_ACTS = (\[[^\]]*\])/)?.[1] ?? '[]').replace(/'/g, '"')) as string[];
describe('观象', () => {
  it('通行本六十四卦的名字齐全', () => { expect(new Set(ALL).size).toBe(64); });
  it('表上的与做事时显出的，加起来六十四，不重', () => { expect(new Set(names).size).toBe(names.length); expect(names.length + inActs.length).toBe(64); for (const g of inActs) expect(names).not.toContain(g); });
  it('名字都是卦名', () => {
    const all = new Set([...names, ...inActs]);
    for (const n of ALL) expect(all.has(n), n).toBe(true);
    expect(all.size).toBe(64);
  });
  it('文字备好了的话，卦名与《大象传》都找得到', async () => {
    let GUA: Array<{ name: string; image: string; lines: number[] }> | null = null;
    try { GUA = ((await import('../src/data/yi')) as { GUA: Array<{ name: string; image: string; lines: number[] }> }).GUA; } catch { /* 还没写好 */ }
    if (!GUA) return;
    expect(GUA.length).toBe(64);
    for (const n of ALL) { const g = GUA.find((x) => x.name === n); expect(g, n).toBeTruthy(); expect(g!.image.length).toBeGreaterThan(6); expect(g!.lines.length).toBe(6); }
  });
});
