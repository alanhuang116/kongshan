/**
 * 经文与短句的形状、字数与指纹。
 * 这些文字逐字核对过原文（见 docs/SOURCES.md）；指纹对不上，说明有人动过字——先去查出处，确认无误再更新这里的指纹。
 */
import { describe, expect, it } from 'vitest';
import { HEART, HEART_BY, HEART_INDEX, HEART_PUNCT, HEART_TEXT, HEART_TITLE } from '../src/data/sutra';
import { QUOTES, VERSES, type Verse } from '../src/data/verses';

const len = (s: string) => Array.from(s).length;
/** 只含汉字（基本区与扩展 A 区） */
const HAN = /^[㐀-鿿]+$/u;
/** FNV-1a 32 位，按码位 */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

describe('心经（玄奘译，流通本）', () => {
  it('题与译者', () => {
    expect(HEART_TITLE).toBe('般若波罗蜜多心经');
    expect(HEART_BY).toBe('唐三藏法师玄奘译');
  });
  it('正文恰好 260 字', () => {
    expect(len(HEART_TEXT)).toBe(260);
    expect(HEART.flat().join('')).toBe(HEART_TEXT);
  });
  it('分 8–10 段，各段字数', () => {
    expect(HEART.length).toBeGreaterThanOrEqual(8);
    expect(HEART.length).toBeLessThanOrEqual(10);
    expect(HEART.map((p) => len(p.join('')))).toEqual([25, 27, 20, 34, 28, 39, 22, 34, 13, 18]);
  });
  it('小句里没有标点、空格', () => {
    for (const phrase of HEART.flat()) expect(phrase, phrase).toMatch(HAN);
  });
  it('标点与正文同形状，只用 ，。；：、', () => {
    expect(HEART_PUNCT.length).toBe(HEART.length);
    HEART.forEach((para, i) => expect(HEART_PUNCT[i].length, `第 ${i + 1} 段`).toBe(para.length));
    for (const p of HEART_PUNCT.flat()) expect('，。；：、').toContain(p);
    for (const p of HEART_PUNCT.flat()) expect(len(p)).toBe(1);
  });
  it('每个字的定位', () => {
    expect(HEART_INDEX.length).toBe(260);
    expect(HEART_INDEX.map((x) => x.ch).join('')).toBe(HEART_TEXT);
    HEART_INDEX.forEach((x) => expect(HEART[x.para][x.phrase]).toContain(x.ch));
    expect(HEART_INDEX[0]).toEqual({ ch: '观', para: 0, phrase: 0 });
    expect(HEART_INDEX[259]).toEqual({ ch: '诃', para: 9, phrase: 3 });
  });
  it('首尾与要紧的句子', () => {
    expect(HEART_TEXT.startsWith('观自在菩萨行深般若波罗蜜多时照见五蕴皆空度一切苦厄')).toBe(true);
    expect(HEART_TEXT.endsWith('揭谛揭谛波罗揭谛波罗僧揭谛菩提萨婆诃')).toBe(true);
    for (const s of ['色不异空空不异色色即是空空即是色', '不生不灭不垢不净不增不减', '心无挂碍无挂碍故无有恐怖远离颠倒梦想究竟涅槃', '得阿耨多罗三藐三菩提', '是大神咒是大明咒是无上咒是无等等咒']) {
      expect(HEART_TEXT).toContain(s);
    }
    // 流通本「远离颠倒梦想」前没有「一切」
    expect(HEART_TEXT).not.toContain('远离一切颠倒梦想');
  });
  it('全文指纹（防误改）', () => {
    expect(fnv(HEART_TEXT)).toBe('6a2b9087');
  });
});

describe('拈一则（VERSES）', () => {
  const KINDS: Verse['kind'][] = ['chan', 'sutra', 'poem', 'dao', 'ru', 'qing'];
  it('不少于 64 则，编号不重、连续', () => {
    expect(VERSES.length).toBeGreaterThanOrEqual(64);
    const ids = VERSES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id, i) => expect(id).toBe('v' + String(i + 1).padStart(2, '0')));
  });
  it('各类的条数', () => {
    const n = (k: Verse['kind']) => VERSES.filter((v) => v.kind === k).length;
    for (const v of VERSES) expect(KINDS).toContain(v.kind);
    expect(n('chan')).toBeGreaterThanOrEqual(20);
    expect(n('sutra')).toBeGreaterThanOrEqual(12);
    expect(n('poem')).toBeGreaterThanOrEqual(20);
    expect(n('dao')).toBeGreaterThanOrEqual(8);
    expect(n('ru')).toBeGreaterThanOrEqual(6);
    expect(n('qing')).toBeGreaterThanOrEqual(6);
  });
  it('行内只有汉字，每行不超过 12 字', () => {
    for (const v of VERSES) {
      expect(v.lines.length, v.id).toBeGreaterThanOrEqual(1);
      for (const ln of v.lines) {
        expect(ln, `${v.id} ${ln}`).toMatch(HAN);
        expect(len(ln), `${v.id} ${ln}`).toBeLessThanOrEqual(12);
      }
    }
  });
  it('出处、朝代都写了；经文之外都有作者', () => {
    for (const v of VERSES) {
      expect(v.from.length, v.id).toBeGreaterThan(0);
      expect(v.era.length, v.id).toBeGreaterThan(0);
      // 佛经句不署作者；《大学》作者旧说不一，也不署
      if (v.kind !== 'sutra' && v.id !== 'v73') expect(v.by.length, v.id).toBeGreaterThan(0);
    }
  });
  it('白话不超过 36 字，留的那句不超过 22 字、句末不加标点、彼此不重复', () => {
    for (const v of VERSES) {
      expect(len(v.gloss), `${v.id} ${v.gloss}`).toBeLessThanOrEqual(36);
      expect(len(v.gloss), v.id).toBeGreaterThan(0);
      expect(v.gloss, v.id).toMatch(/[。？]$/);
      expect(len(v.ask), `${v.id} ${v.ask}`).toBeLessThanOrEqual(22);
      expect(len(v.ask), v.id).toBeGreaterThan(0);
      expect(v.ask, v.id).not.toMatch(/[。？！?!，、]$/);
    }
    const asks = VERSES.map((v) => v.ask);
    expect(new Set(asks).size).toBe(asks.length);
  });
  it('该有的都在', () => {
    const all = VERSES.map((v) => v.lines.join('')).join('\n');
    for (const s of [
      '菩提本无树明镜亦非台本来无一物何处惹尘埃',
      '身是菩提树心如明镜台时时勤拂拭勿使惹尘埃',
      '春有百花秋有月夏有凉风冬有雪若无闲事挂心头便是人间好时节',
      '师曰吃茶去',
      '见山是山见水是水',
      '低头便见水中天',
      '应无所住而生其心',
      '一切有为法如梦幻泡影如露亦如电应作如是观',
      '色不异空空不异色',
      '诸恶莫作诸善奉行自净其意是诸佛教',
      '直心是道场',
      '空山不见人但闻人语响',
      '行到水穷处坐看云起时',
      '人闲桂花落夜静春山空',
      '木末芙蓉花山中发红萼',
      '独坐幽篁里弹琴复长啸',
      '空山新雨后天气晚来秋',
      '清晨入古寺初日照高林',
      '只在此山中云深不知处',
      '吾心似秋月碧潭清皎洁',
      '千山鸟飞绝万径人踪灭',
      '溪声便是广长舌山色岂非清净身',
      '空山无人水流花开',
      '山寺桃花始盛开',
      '空山松子落',
      '致虚极守静笃',
      '上善若水',
      '大音希声',
      '虚室生白吉祥止止',
      '至人之用心若镜',
      '知止而后有定',
      '逝者如斯夫',
      '风过而竹不留声',
    ]) {
      expect(all, s).toContain(s);
    }
  });
  it('没混进流行的伪托', () => {
    const all = VERSES.map((v) => v.lines.join('') + v.from + v.by).join('\n');
    for (const s of ['一花一世界', '五百次回眸', '不忘初心', '佛曰', '仓央嘉措']) expect(all).not.toContain(s);
  });
  it('原文指纹（防误改）', () => {
    expect(fnv(VERSES.map((v) => v.id + ':' + v.lines.join('|')).join('\n'))).toBe('0db12b18');
  });
});

describe('界面上用的几条（QUOTES）', () => {
  it('约定的十二个键都在', () => {
    for (const k of ['motto', 'noMerit', 'bell', 'fish', 'bell108', 'tea', 'sweep', 'incense', 'sit', 'copy', 'lamp', 'beads'] as const) {
      expect(QUOTES[k], k).toBeTruthy();
      expect(QUOTES[k].from.length, k).toBeGreaterThan(0);
    }
  });
  it('题词', () => {
    expect(QUOTES.motto.lines).toEqual(['空山无人', '水流花开']);
    expect(QUOTES.motto.by).toBe('苏轼');
    expect(QUOTES.motto.from).toContain('十八大阿罗汉颂');
  });
  it('要紧的字句', () => {
    expect(QUOTES.noMerit.text).toContain('并无功德');
    expect(QUOTES.noMerit.text).toContain('如影随形，虽有非实');
    expect(QUOTES.bell.lines.join('')).toBe('闻钟声烦恼轻智慧长菩提生离地狱出火坑愿成佛度众生');
    expect(QUOTES.fish.text).toContain('鱼昼夜常醒');
    expect(QUOTES.bell108.text).toContain('凡三通，各三十六下，总一百八下');
    expect(QUOTES.tea.text.match(/吃茶去/g)?.length).toBe(5);
    expect(QUOTES.sit.text).toBe('外离相为禅，内不乱为定。');
    expect(QUOTES.lamp.text).toContain('譬如一灯燃百千灯，冥者皆明，明终不尽');
    expect(QUOTES.beads.text).toContain('木槵子一百八');
    expect(QUOTES.copy.text).toBe('用笔在心，心正则笔正。');
    expect(QUOTES.sweepFolk.from).toContain('出处不详');
  });
});
