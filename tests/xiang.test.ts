// 观象：六十四卦一卦不重、一卦不缺（表上五十九，五卦在做事时显出）；每一卦卦辞、大象、白话、所见、说明都有，触发条件站得住；
// 两份文档（与本仓库同一层的 观象册_意象整理.md、六十四卦完整文档.md）在的时候，逐字核对：所见、说明、白话照录；卦辞、大象与核对过的原文相同；
// 表上每一卦什么时候有，与文档里写的时辰、季节、天气对得上。
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { SCENES } from '../src/data/gua64';
import { GUA } from '../src/data/yi';
import { IN_ACT, IN_ACTS, XIANG_DEFS, XIANG_GUA, type XiangCond } from '../src/world/acts/xiang';
import { standable } from '../src/world/walk';

const ALL = '乾坤屯蒙需讼师比|小畜|履泰否|同人|大有|谦豫随蛊临观|噬嗑|贲剥复|无妄|大畜|颐|大过|坎离咸恒遁|大壮|晋|明夷|家人|睽蹇解损益夬姤萃升困井革鼎震艮渐|归妹|丰旅巽兑涣节|中孚|小过|既济|未济'
  .split('|').flatMap((s) => (s.length > 1 && !/^(小畜|同人|大有|噬嗑|无妄|大畜|大过|大壮|明夷|家人|归妹|中孚|小过|既济|未济)$/.test(s) ? [...s] : [s]));

describe('观象', () => {
  it('通行本六十四卦的名字齐全', () => { expect(new Set(ALL).size).toBe(64); });
  it('表上的与做事时显出的，加起来六十四，不重', () => {
    expect(new Set(XIANG_GUA).size).toBe(XIANG_GUA.length);
    expect(XIANG_GUA.length + IN_ACTS.length).toBe(64);
    for (const g of IN_ACTS) expect(XIANG_GUA).not.toContain(g);
    const all = new Set([...XIANG_GUA, ...IN_ACTS]);
    for (const n of ALL) expect(all.has(n), n).toBe(true);
  });
  it('每一卦：卦辞、大象、白话（yi.ts）与所见、说明（gua64.ts）都有', () => {
    expect(GUA.length).toBe(64);
    expect(Object.keys(SCENES).length).toBe(64);
    for (const n of ALL) {
      const g = GUA.find((x) => x.name === n), s = SCENES[n];
      expect(g, n).toBeTruthy();
      expect(g!.judgment.length, `${n} 卦辞`).toBeGreaterThan(1);
      expect(g!.image.length, `${n} 大象`).toBeGreaterThan(6);
      expect(g!.gloss.length, `${n} 白话`).toBeGreaterThan(6);
      expect(g!.lines.length).toBe(6);
      expect(s, `${n} 所见`).toBeTruthy();
      expect(s.view.length, `${n} 所见`).toBeGreaterThan(6);
      expect(s.note.length, `${n} 说明`).toBeGreaterThan(6);
      expect(s.view, `${n} 所见`).toMatch(/[。！？]$/);
      expect(s.note, `${n} 说明`).toMatch(/[。！？]$/);
    }
  });
  it('表上每一卦：站得住人，看的那一点不在脚下；名字两三个字', () => {
    expect(XIANG_DEFS.length).toBe(59);
    for (const d of XIANG_DEFS) {
      let ok = standable(d.at[0], d.at[1]) != null;
      for (let r = 0.25; r <= 2.6 && !ok; r += 0.25) for (let a = 0; a < 12 && !ok; a++) ok = standable(d.at[0] + Math.cos((a / 12) * Math.PI * 2) * r, d.at[1] + Math.sin((a / 12) * Math.PI * 2) * r) != null;
      expect(ok, `${d.gua}（${d.label}）${d.at} 站不住`).toBe(true);
      if (d.look) expect(Math.hypot(d.look[0] - d.at[0], d.look[2] - d.at[1]), `${d.gua} 看的那一点`).toBeGreaterThan(1.5);
      expect([...d.label].length, d.gua).toBeGreaterThanOrEqual(1);
      expect([...d.label].length, d.gua).toBeLessThanOrEqual(5);
    }
  });
  it('做事时显的五卦：需要夜里点了灯（文档：夜间，灯火亮时），别的做那件事就显', () => {
    expect(IN_ACT.map((x) => `${x.gua}:${x.act}`).sort()).toEqual(['既济:煮茶', '豫:抚琴', '需:自斟', '兑:与客对坐', '大畜:读书'].sort());
    const need = IN_ACT.find((x) => x.gua === '需')!;
    expect(need.when).toBeTruthy();
    expect(need.when!(cond(22, 'spring', 'clear'))).toBe(true);
    expect(need.when!(cond(12, 'spring', 'clear'))).toBe(false);
    for (const x of IN_ACT) if (x.gua !== '需') expect(x.when, x.gua).toBeUndefined();
  });
});

// —— 天时：照 env/atmos.ts 的算法，由钟点、季节、天气算出夜、晨、昏、灯（测试拿它来问每一卦此刻有没有） ——
type Season = 'spring' | 'summer' | 'autumn' | 'winter';
type Weather = 'clear' | 'mist' | 'rain' | 'snow';
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const WEATHERS: Weather[] = ['clear', 'mist', 'rain', 'snow'];
const SUN: Record<Season, [number, number]> = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] };
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function cond(h: number, season: Season, w: Weather, rain?: number): XiangCond {
  const [sr, ss] = SUN[season];
  const night = h < 12 ? 1 - sm(sr - 1.1, sr + 0.25, h) : sm(ss + 0.15, ss + 1.5, h);
  const dawn = Math.max(0, 1 - Math.abs(h - (sr + 0.15)) / 1.35), dusk = Math.max(0, 1 - Math.abs(h - (ss - 0.25)) / 1.5);
  const r = rain ?? (w === 'rain' ? 1 : 0);
  const lamp = Math.max(night, 0.8 * sm(0.3, 1, dusk) * (h > 12 ? 1 : 0), 0.5 * r);
  return { hour: h, night, dawn, dusk, lamp, season, rain: r, snow: w === 'snow' ? 1 : 0, mist: w === 'mist' ? 1 : 0, k: {} as XiangCond['k'] };
}
describe('天时的算法与 atmos.ts 一致', () => {
  it('日出日落表、夜晨昏灯的式子没有变', () => {
    const src = readFileSync(new URL('../src/world/env/atmos.ts', import.meta.url), 'utf8');
    expect(src).toContain("export const SUN: Record<Season, [number, number, number]> = { spring: [6.0, 18.2, 56], summer: [5.1, 19.1, 74], autumn: [6.3, 17.5, 52], winter: [7.0, 17.0, 34] };");
    expect(src).toContain('const night = h < 12 ? 1 - sm(sr - 1.1, sr + 0.25, h) : sm(ss + 0.15, ss + 1.5, h);');
    expect(src).toContain('const dawn = Math.max(0, 1 - Math.abs(h - (sr + 0.15)) / 1.35), dusk = Math.max(0, 1 - Math.abs(h - (ss - 0.25)) / 1.5);');
    expect(src).toContain('this.lamp = Math.max(night, 0.8 * sm(0.3, 1, dusk) * (h > 12 ? 1 : 0), 0.5 * W.rain);');
  });
});

// —— 两份文档 ——
const D1 = new URL('../../观象册_意象整理.md', import.meta.url), D2 = new URL('../../六十四卦完整文档.md', import.meta.url);
const HAVE = existsSync(D1) && existsSync(D2);
const md = (u: URL) => readFileSync(u, 'utf8').replace(/\r\n/g, '\n');
const para = (sec: string, head: string) => sec.match(new RegExp(`\\*\\*${head}\\*\\*\\n\\n([\\s\\S]*?)(?=\\n\\n|$)`))?.[1].trim() ?? null;
const table = (sec: string) => {
  const out: Record<string, string> = {};
  for (const m of sec.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/gm)) if (!/^-+$/.test(m[1]) && m[1] !== '项目') out[m[1]] = m[2];
  return out;
};
interface Doc1 { n: number; head: string; view: string | null; note: string | null; trig: Record<string, string> }
interface Doc2 { judgment: string | null; image: string | null; gloss: string | null; view: string | null; upper?: string; lower?: string }
function readDocs() {
  const d1: Record<string, Doc1> = {}, d2: Record<string, Doc2> = {}, ap1: Record<string, string> = {};
  const t1 = md(D1), t2 = md(D2);
  for (const sec of t1.split(/^### /m).slice(1)) {
    const h = sec.match(/^(\d+)\. (\S+) · (.+)$/m);
    if (h) d1[h[2]] = { n: +h[1], head: h[3].trim(), view: para(sec, '意象描述'), note: sec.match(/^\*\*说明\*\*：(.+)$/m)?.[1].trim() ?? null, trig: table(sec) };
  }
  for (const m of t1.slice(t1.indexOf('## 附录')).matchAll(/^\| \*\*(\S+)\*\* \| ([^|]+) \|/gm)) ap1[m[1]] = m[2].trim();
  for (const sec of t2.split(/^### /m).slice(1)) {
    const h = sec.match(/^(\S+) · (\S+) · 第(\S+)$/m);
    if (h) d2[h[2]] = { judgment: para(sec, '卦辞'), image: para(sec, '大象'), gloss: para(sec, '白话'), view: para(sec, '意象描述'), upper: sec.match(/\*\*上卦\*\*：(\S)/)?.[1], lower: sec.match(/\*\*下卦\*\*：(\S)/)?.[1] };
  }
  return { d1, d2, ap1 };
}
/** 两份文档之间已知的不同（记在 docs/SOURCES.md）：所见只有「咸」一处一字之差，这里从《观象册 · 意象整理》 */
const VIEW_DIFF: Record<string, [string, string]> = { 咸: ['山是空的才盛得住水', '山是虚的才盛得住水'] };
/** 《观象册 · 意象整理》各节标题里摘的卦辞：两卦摘得不是从头起（记在 docs/SOURCES.md） */
const HEAD_DIFF: Record<string, string> = { 同人: '亨', 大过: '利有攸往亨' };
const TRI_NAME: Record<string, string> = { qian: '乾', dui: '兑', li: '离', zhen: '震', xun: '巽', kan: '坎', gen: '艮', kun: '坤' };

describe.skipIf(!HAVE)('与两份文档逐字核对', () => {
  const { d1, d2, ap1 } = HAVE ? readDocs() : { d1: {} as Record<string, Doc1>, d2: {} as Record<string, Doc2>, ap1: {} as Record<string, string> };
  it('两份文档都是六十四卦，卦序与通行本相同', () => {
    expect(Object.keys(d1).length).toBe(64);
    expect(Object.keys(d2).length).toBe(64);
    for (const g of GUA) expect(d1[g.name]?.n, g.name).toBe(g.n);
  });
  it('所见、说明：照《观象册 · 意象整理》原文，一字不改', () => {
    for (const n of ALL) {
      expect(SCENES[n].view, `${n} 所见`).toBe(d1[n].view);
      expect(SCENES[n].note, `${n} 说明`).toBe(d1[n].note);
    }
  });
  it('《六十四卦 · 完整文档》里的意象与前一份相同（已知的一处除外）', () => {
    for (const n of ALL) {
      const a = d1[n].view!, b = d2[n].view!;
      if (VIEW_DIFF[n]) { expect(a, n).toContain(VIEW_DIFF[n][0]); expect(b, n).toBe(a.replace(VIEW_DIFF[n][0], VIEW_DIFF[n][1])); }
      else expect(b, n).toBe(a);
    }
  });
  it('白话：与《六十四卦 · 完整文档》一字不差', () => {
    for (const g of GUA) expect(g.gloss, g.name).toBe(d2[g.name].gloss);
  });
  it('卦辞、大象：文档里的与核对过的原文（yi.ts、docs/SOURCES.md）相同；标题里摘的卦辞是原文的开头（已知两处除外）', () => {
    for (const g of GUA) {
      expect(d2[g.name].judgment, `${g.name} 卦辞`).toBe(g.judgment);
      expect(d2[g.name].image, `${g.name} 大象`).toBe(g.image);
      const flat = g.judgment.replace(/[，。；？！、：]/g, '');
      if (HEAD_DIFF[g.name]) { expect(d1[g.name].head, g.name).toBe(HEAD_DIFF[g.name]); expect(flat, g.name).toContain(HEAD_DIFF[g.name]); }
      else expect(flat.startsWith(d1[g.name].head), `${g.name}：「${d1[g.name].head}」`).toBe(true);
    }
  });
  it('上卦、下卦与 yi.ts 相同（文档里的卦画画错了，不用它：卦画由上下卦生成）', () => {
    for (const g of GUA) { expect(d2[g.name].upper, `${g.name} 上卦`).toBe(TRI_NAME[g.upper]); expect(d2[g.name].lower, `${g.name} 下卦`).toBe(TRI_NAME[g.lower]); }
  });
  it('附录：做事时显出的五卦与做的事', () => {
    expect(Object.entries(ap1).map(([g, a]) => `${g}:${a}`).sort()).toEqual(IN_ACT.map((x) => `${x.gua}:${x.act}`).sort());
    for (const x of IN_ACT) expect(d1[x.gua].trig['时辰'], x.gua).toMatch(new RegExp(x.act === '抚琴' ? '弹琴' : x.act === '与客对坐' ? '与客对坐' : x.act === '自斟' ? '夜间' : `${x.act}|任意`));
  });

  // —— 触发条件：拿文档里的时辰、季节、天气问每一卦 ——
  const defs = new Map(XIANG_DEFS.map((d) => [d.gua, d]));
  const on = (gua: string, h: number, s: Season, w: Weather, rain?: number) => { const d = defs.get(gua)!; return !d.when || d.when(cond(h, s, w, rain)); };
  /** 文档的季节、天气允许的那几种 */
  const seasonsOf = (t: string): Season[] => (t === '春日' ? ['spring'] : t === '夏日' ? ['summer'] : t === '秋日' ? ['autumn'] : t === '冬日' ? ['winter'] : t === '春夏' ? ['spring', 'summer'] : SEASONS);
  // 「晴（无雨雾雪）」只在晴天；「晴（无雨）」只说不下雨，雾、雪不论
  const weathersOf = (t: string): Weather[] =>
    t === '晴（无雨）' ? ['clear', 'mist', 'snow'] : /晴/.test(t) ? ['clear'] : /^雨大于/.test(t) ? ['rain'] : /^雾大于/.test(t) ? ['mist'] : /^雨小于/.test(t) ? ['clear', 'mist', 'snow'] : /雾雨小于/.test(t) ? ['clear', 'snow'] : WEATHERS;
  /** 这一刻（钟点 h）在文档允许的季节、天气里有没有一种是有的 */
  const any = (gua: string, h: number, ss: Season[], ws: Weather[]) => ss.some((s) => ws.some((w) => on(gua, h, s, w)));
  const dawnOf = (s: Season) => SUN[s][0] + 0.15, duskOf = (s: Season) => SUN[s][1] - 0.25;

  it('季节：文档写哪一季，就只在那一季有', () => {
    for (const d of XIANG_DEFS) {
      const t = d1[d.gua].trig, ok = seasonsOf(t['季节']);
      for (const s of SEASONS) {
        const some = Array.from({ length: 96 }, (_, i) => i / 4).some((h) => WEATHERS.some((w) => on(d.gua, h, s, w)));
        expect(some, `${d.gua}（${t['季节']}）在 ${s}`).toBe(ok.includes(s));
      }
    }
  });
  it('天气：晴的不在雨雾雪里，要雨的只在雨里，要雾的只在雾里', () => {
    for (const d of XIANG_DEFS) {
      const t = d1[d.gua].trig, ss = seasonsOf(t['季节']), ok = weathersOf(t['天气']);
      if (/夜小于/.test(t['天气'])) continue; // 否卦的「天气」一栏写的是夜（时辰里另查）
      for (const w of WEATHERS) {
        const some = ss.some((s) => Array.from({ length: 96 }, (_, i) => i / 4).some((h) => on(d.gua, h, s, w)));
        // 「雾大于四成或欲雨」：雾里有；雨下透了（rain = 1）不算欲雨，要雨刚起（0.08…0.6）
        if (/欲雨/.test(t['天气']) && w === 'rain') { expect(some, d.gua).toBe(false); expect(on(d.gua, 12, ss[0], 'clear', 0.3), `${d.gua} 欲雨`).toBe(true); continue; }
        expect(some, `${d.gua}（${t['天气']}）在 ${w}`).toBe(ok.includes(w));
      }
    }
  });
  it('时辰：文档写的钟点里有，钟点外没有', () => {
    for (const d of XIANG_DEFS) {
      const t = d1[d.gua].trig, h = t['时辰'], ss = seasonsOf(t['季节']), ws = weathersOf(t['天气']);
      const yes = (x: number, why = '') => expect(any(d.gua, x, ss, ws), `${d.gua}（${h}）${x} 点该有${why}`).toBe(true);
      const no = (x: number, why = '') => expect(any(d.gua, x, ss, ws), `${d.gua}（${h}）${x} 点不该有${why}`).toBe(false);
      const range = h.match(/(\d+)(?::(\d+))?\s*-\s*(?:午后\s*)?(\d+)(?::(\d+))?/);
      if (h === '任意' || h === '冬季') { yes(2.5); yes(12); }
      else if (h === '白天') { yes(12); no(1); no(23.5); }
      else if (/^夜间/.test(h)) { yes(22); no(12); }
      else if (/^深夜/.test(h)) { yes(23.5); yes(0.5); no(21.5); no(2.5); }
      else if (/^黄昏或夜间/.test(h)) { yes(22); no(10); expect(ss.some((s) => ws.some((w) => on(d.gua, duskOf(s), s, w))), `${d.gua} 黄昏`).toBe(true); }
      else if (h === '黄昏') { no(12); no(2); expect(ss.some((s) => ws.some((w) => on(d.gua, duskOf(s), s, w))), `${d.gua} 黄昏`).toBe(true); }
      else if (/^黎明/.test(h)) { no(12); no(22); expect(ss.some((s) => ws.some((w) => on(d.gua, dawnOf(s), s, w))), `${d.gua} 黎明`).toBe(true); }
      else if (/^入夜/.test(h)) { no(12); no(3); expect(ss.some((s) => ws.some((w) => on(d.gua, SUN[s][1] + 1.6, s, w))), `${d.gua} 入夜`).toBe(true); }
      else if (/^午后至入夜/.test(h)) { no(10); no(3); expect(ss.some((s) => ws.some((w) => on(d.gua, SUN[s][1] + 0.9, s, w))), `${d.gua} 日落后`).toBe(true); }
      else if (/^晨昏或午前/.test(h)) { yes(11.5); no(15); no(2); expect(ss.some((s) => ws.some((w) => on(d.gua, dawnOf(s), s, w) && on(d.gua, duskOf(s), s, w))), `${d.gua} 晨昏`).toBe(true); }
      else if (/^白天至夜间/.test(h)) { yes(12); yes(SUN.spring[1] + 0.8); no(3); }
      else if (/15点后/.test(h)) { yes(16); no(14); no(2); }
      else if (range) {
        const a = +range[1] + (range[2] ? +range[2] / 60 : 0), b = +range[3] + (range[4] ? +range[4] / 60 : 0);
        yes((a + b) / 2); no(a - 0.5); no(b + 0.5);
      } else throw new Error(`${d.gua} 的时辰「${h}」没认出来`);
    }
  });
  it('文档里的时辰、季节、天气的写法都认得（表上每一卦都查到了）', () => {
    expect(XIANG_DEFS.every((d) => !!d1[d.gua]?.trig['时辰'] && !!d1[d.gua]?.trig['季节'] && !!d1[d.gua]?.trig['天气'])).toBe(true);
  });
});
