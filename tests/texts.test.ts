/**
 * 安乐窝的文字：形状、字数、标签与指纹。
 * 古书原文逐条核对过出处（见 docs/SOURCES.md）；指纹对不上，说明有人动过字——先去查出处，确认无误再更新这里的指纹。
 * （旧的山寺文字 src/data/sutra.ts、verses.ts 还留着给没迁完的界面用，这里不再检查。）
 */
import { describe, expect, it } from 'vitest';
import { PAGES, PAIRS, POEMS, SAYINGS } from '../src/data/shaoyong';
import { DIPPER, HOU_SOURCE, TERMS } from '../src/data/almanac';
import { LINES, WORDS, YUQIAO, YUQIAO_NOTE, YUQIAO_SCENE } from '../src/data/talk';
import { GUA, TRIGRAMS, XIANTIAN_SOURCE, XIAOXI, XIAOXI_NOTE, YI_WORDS, type Trigram } from '../src/data/yi';

const len = (s: string) => Array.from(s).length;
/** 只含汉字（基本区与扩展 A 区） */
const HAN = /^[㐀-鿿]+$/u;
const hanOnly = (s: string) => Array.from(s).filter((ch) => /[㐀-鿿]/u.test(ch)).join('');
/** 任何 ASCII 字符（原文、白话里都不该有） */
const ASCII = /[\x00-\x7f]/;
/** ASCII 标点与字母（出处、关于页里允许阿拉伯数字，别的不许） */
const ASCII_NOT_DIGIT = /[\x00-\x2f\x3a-\x7f]/;
/** FNV-1a 32 位，按码位 */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
const unique = (xs: string[]) => expect(new Set(xs).size).toBe(xs.length);

const WHEN = ['spring', 'summer', 'autumn', 'winter', 'dawn', 'noon', 'dusk', 'night', 'rain', 'snow', 'wine', 'flower', 'moon', 'any'];
const ON = ['cloud', 'cicada', 'insect', 'star', 'water', 'flower', 'any'];
const LINE_WHEN = ['spring', 'summer', 'autumn', 'winter', 'dawn', 'noon', 'dusk', 'night', 'rain', 'snow'];

describe('邵雍的诗（POEMS）', () => {
  it('不少于 20 首，编号不重', () => {
    expect(POEMS.length).toBeGreaterThanOrEqual(20);
    unique(POEMS.map((p) => p.id));
  });
  it('诗行只有汉字；一首之内句子等长，四、五、七言', () => {
    for (const p of POEMS) {
      expect(p.lines.length, p.id).toBeGreaterThanOrEqual(4);
      expect(p.lines.length % 2, p.id).toBe(0);
      const n = len(p.lines[0]);
      expect([4, 5, 7], p.id).toContain(n);
      for (const ln of p.lines) {
        expect(ln, `${p.id} ${ln}`).toMatch(HAN);
        expect(len(ln), `${p.id} ${ln}`).toBe(n);
      }
    }
  });
  it('题、作者、出处都写了；白话是一句整话，没有 ASCII', () => {
    for (const p of POEMS) {
      expect(p.title.length, p.id).toBeGreaterThan(0);
      expect(p.author.length, p.id).toBeGreaterThan(0);
      expect(p.source.length, p.id).toBeGreaterThan(0);
      expect(p.source, p.id).not.toMatch(ASCII);
      expect(p.title, p.id).not.toMatch(ASCII);
      if (p.gloss !== undefined) {
        expect(p.gloss, p.id).toMatch(/[。？]$/);
        expect(p.gloss, p.id).not.toMatch(ASCII);
        expect(len(p.gloss), p.id).toBeLessThanOrEqual(64);
      }
    }
  });
  it('该有的都在', () => {
    const all = POEMS.map((p) => p.lines.join('')).join('\n');
    for (const s of [
      '月到天心处风来水面时一般清意味料得少人知',
      '安乐窝中快活人闲来四物幸相亲',
      '美酒饮教微醉后好花看到半开时',
      '冬至子之半天心无改移一阳初起处万物未生时',
      '梧桐月向怀中照杨柳风来面上吹',
      '天根月窟闲来往三十六宫都是春',
      '居暗观明居静观动',
      '云轻日淡天津暮风急林疏洛水秋',
      '头上花枝照酒卮酒卮中有好花枝',
      '半记不记梦觉后似愁无愁情倦时',
      '小车随意出所到即成欢',
      '我本行年四十五生男方始为人父',
      '一物其来有一身一身还有一乾坤',
      '春时耕种夏时耘耨',
      '一去二三里烟村四五家亭台六七座八九十枝花',
    ]) {
      expect(all, s).toContain(s);
    }
    const title = (t: string) => POEMS.filter((p) => p.title.startsWith(t)).length;
    for (const t of ['清夜吟', '安乐窝中四长吟', '安乐窝中吟', '冬至吟', '首尾吟', '观物吟', '天津感事', '插花吟', '懒起吟', '小车吟', '生男吟', '山村咏怀']) {
      expect(title(t), t).toBeGreaterThanOrEqual(1);
    }
  });
  it('《山村咏怀》不署邵雍——他的诗集里没有这一首', () => {
    const p = POEMS.find((x) => x.id === 'shancun')!;
    expect(p.author).not.toBe('邵雍');
    expect(p.author).toContain('旧题');
    expect(p.source).toContain('不载');
    for (const q of POEMS.filter((x) => x.id !== 'shancun')) {
      expect(q.author, q.id).toBe('邵雍');
      expect(q.source, q.id).toContain('《伊川击壤集》卷');
    }
  });
  it('没混进伪托的占卜诗', () => {
    const all = POEMS.map((p) => p.title + p.lines.join('') + p.source).join('\n');
    for (const s of ['梅花诗', '梅花易数', '荡荡天门万古开']) expect(all).not.toContain(s);
  });
  it('原文指纹（防误改）', () => {
    expect(fnv(POEMS.map((p) => p.id + ':' + p.lines.join('|')).join('\n'))).toBe('6d6455e1');
  });
});

describe('醒来写两句（PAIRS）', () => {
  it('不少于 36 联，编号连续', () => {
    expect(PAIRS.length).toBeGreaterThanOrEqual(36);
    PAIRS.forEach((p, i) => expect(p.id).toBe('c' + String(i + 1).padStart(2, '0')));
  });
  it('上下句等长，五言或七言，只有汉字', () => {
    for (const p of PAIRS) {
      expect(p.a, p.id).toMatch(HAN);
      expect(p.b, p.id).toMatch(HAN);
      expect([5, 7], p.id).toContain(len(p.a));
      expect(len(p.b), p.id).toBe(len(p.a));
    }
    unique(PAIRS.map((p) => p.a + p.b));
  });
  it('出自哪首、哪一卷都写了', () => {
    for (const p of PAIRS) {
      expect(p.from.length, p.id).toBeGreaterThan(0);
      expect(p.source, p.id).toContain('《伊川击壤集》卷');
      expect(p.source, p.id).not.toMatch(ASCII);
    }
  });
  it('时令标签都在约定的集合里，每个标签至少两联', () => {
    for (const p of PAIRS) {
      expect(p.when.length, p.id).toBeGreaterThan(0);
      for (const w of p.when) expect(WHEN, `${p.id} ${w}`).toContain(w);
      unique(p.when);
    }
    for (const w of WHEN) expect(PAIRS.filter((p) => p.when.includes(w)).length, w).toBeGreaterThanOrEqual(2);
  });
  it('与 POEMS 里收了全篇的诗对得上：上句的下一句就是下句', () => {
    let seen = 0;
    for (const p of PAIRS) {
      for (const poem of POEMS) {
        const i = poem.lines.indexOf(p.a);
        if (i < 0) continue;
        seen++;
        expect(poem.lines[i + 1], `${p.id} 在 ${poem.id}`).toBe(p.b);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(20);
  });
  it('原文指纹（防误改）', () => {
    expect(fnv(PAIRS.map((p) => `${p.id}:${p.a}|${p.b}`).join('\n'))).toBe('c518fdb3');
  });
});

describe('观物（SAYINGS）', () => {
  it('不少于 24 条，编号连续', () => {
    expect(SAYINGS.length).toBeGreaterThanOrEqual(24);
    SAYINGS.forEach((s, i) => expect(s.id).toBe('s' + String(i + 1).padStart(2, '0')));
  });
  it('每条不超过 40 字，句末有标点，没有 ASCII', () => {
    for (const s of SAYINGS) {
      expect(len(hanOnly(s.text)), s.id).toBeLessThanOrEqual(40);
      expect(len(hanOnly(s.text)), s.id).toBeGreaterThanOrEqual(6);
      expect(s.text, s.id).toMatch(/[。？！]$/);
      expect(s.text, s.id).not.toMatch(ASCII);
      expect(s.source.length, s.id).toBeGreaterThan(0);
      expect(s.source, s.id).not.toMatch(ASCII);
      expect(s.source, s.id).toMatch(/皇极经世|渔樵问对|伊川击壤集/);
      if (s.gloss !== undefined) {
        expect(s.gloss, s.id).not.toMatch(ASCII);
        expect(s.gloss, s.id).toMatch(/[。？]$/);
      }
    }
    unique(SAYINGS.map((s) => s.text));
  });
  it('观法标签都在约定的集合里，每种至少两条', () => {
    for (const s of SAYINGS) {
      expect(s.on.length, s.id).toBeGreaterThan(0);
      for (const o of s.on) expect(ON, `${s.id} ${o}`).toContain(o);
    }
    for (const o of ON) expect(SAYINGS.filter((s) => s.on.includes(o)).length, o).toBeGreaterThanOrEqual(2);
  });
  it('要紧的几句，字句照原文', () => {
    const all = SAYINGS.map((s) => s.text).join('\n');
    expect(all).toContain('以物观物，性也；以我观物，情也。性公而明，情偏而暗。');
    expect(all).toContain('不以我观物者，以物观物之谓也。');
    expect(all).toContain('学不际天人，不足以谓之学。');
    // 原文是两问，不是「一动一静之间，天地之至妙者也」
    expect(all).toContain('夫一动一静之间者，天地人至妙至妙者欤？');
    expect(all).not.toContain('天地之至妙者也');
  });
  it('原文指纹（防误改）', () => {
    expect(fnv(SAYINGS.map((s) => `${s.id}:${s.text}`).join('\n'))).toBe('42fcb6a9');
  });
});

describe('案头两本书（PAGES）', () => {
  const yi = PAGES.filter((p) => p.book === 'yi');
  const hj = PAGES.filter((p) => p.book === 'huangji');
  it('《周易》不少于 14 页，《皇极经世》不少于 10 页', () => {
    expect(yi.length).toBeGreaterThanOrEqual(14);
    expect(hj.length).toBeGreaterThanOrEqual(10);
    expect(yi.length + hj.length).toBe(PAGES.length);
    unique(PAGES.map((p) => p.id));
    unique(PAGES.map((p) => p.text));
  });
  it('出处写明篇名；字数适中，没有 ASCII', () => {
    for (const p of PAGES) {
      expect(p.text, p.id).not.toMatch(ASCII);
      expect(p.text, p.id).toMatch(/[。？！]$/);
      expect(len(hanOnly(p.text)), p.id).toBeLessThanOrEqual(44);
      expect(p.source, p.id).not.toMatch(ASCII);
      if (p.book === 'yi') expect(p.source, p.id).toMatch(/^《周易·[^》]+》$/);
      else expect(p.source, p.id).toMatch(/^《皇极经世·观物(内|外)篇》/);
      if (p.gloss !== undefined) expect(p.gloss, p.id).not.toMatch(ASCII);
    }
  });
  it('该有的都在；《论语》的话不算在《易》里', () => {
    const all = yi.map((p) => p.text).join('\n');
    for (const s of ['一阴一阳之谓道', '乐天知命，故不忧；安土敦乎仁，故能爱。', '寒往则暑来，暑往则寒来，寒暑相推而岁成焉。', '复，其见天地之心乎', '日中则昃，月盈则食；天地盈虚，与时消息。']) {
      expect(all, s).toContain(s);
    }
    expect(PAGES.map((p) => p.text).join('\n')).not.toContain('天何言哉');
    const h = hj.map((p) => p.text).join('\n');
    for (const s of ['日经天之元，月经天之会，星经天之运，辰经天之世。', '春为生物之府', '冬至之后为呼，夏至之后为吸']) expect(h, s).toContain(s);
  });
  it('原文指纹（防误改）', () => {
    expect(fnv(PAGES.map((p) => `${p.id}:${p.text}`).join('\n'))).toBe('d268522e');
  });
});

describe('二十四节气（TERMS）', () => {
  const NAMES = ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒'];
  it('二十四条，按序', () => {
    expect(TERMS.map((t) => t.name)).toEqual(NAMES);
    unique(TERMS.map((t) => t.id));
    for (const t of TERMS) expect(t.id, t.name).toMatch(/^[a-z]+$/);
  });
  it('每个节气三候，七十二候不重', () => {
    for (const t of TERMS) {
      expect(t.hou.length, t.name).toBe(3);
      for (const h of t.hou) {
        expect(h, `${t.name} ${h}`).toMatch(HAN);
        expect(len(h), `${t.name} ${h}`).toBeLessThanOrEqual(8);
      }
    }
    unique(TERMS.flatMap((t) => t.hou));
    expect(TERMS.flatMap((t) => t.hou).length).toBe(72);
    expect(HOU_SOURCE).toContain('月令七十二候集解');
    expect(TERMS[0].hou).toEqual(['东风解冻', '蛰虫始振', '鱼陟负冰']);
    expect(TERMS[21].hou).toEqual(['蚯蚓结', '麋角解', '水泉动']);
  });
  it('农事两三句，每句不超过 30 字；不写稻作与宋代没有的作物', () => {
    for (const t of TERMS) {
      expect(t.work.length, t.name).toBeGreaterThanOrEqual(2);
      expect(t.work.length, t.name).toBeLessThanOrEqual(3);
      for (const w of t.work) {
        expect(len(w), `${t.name} ${w}`).toBeLessThanOrEqual(30);
        expect(w, `${t.name} ${w}`).not.toMatch(ASCII);
        expect(w, `${t.name} ${w}`).toMatch(/[。]$/);
        expect(w, `${t.name} ${w}`).not.toMatch(/稻|秧|棉|玉米|红薯|番薯|花生|辣椒|土豆|番茄|烟叶/);
        expect(w, `${t.name} ${w}`).not.toMatch(/吉|凶|卦|占/);
      }
    }
  });
  it('每个节气配一条古书原文，注明出处', () => {
    for (const t of TERMS) {
      expect(t.quote, t.name).toBeTruthy();
      expect(t.quote!.text, t.name).not.toMatch(ASCII);
      expect(t.quote!.text, t.name).toMatch(/[。]$/);
      expect(t.quote!.source, t.name).toMatch(/礼记·月令|诗经·豳风·七月|齐民要术|四民月令|氾胜之书/);
      expect(t.quote!.source, t.name).not.toMatch(ASCII);
    }
  });
  it('原文指纹（防误改）', () => {
    expect(fnv(TERMS.map((t) => `${t.name}:${t.hou.join('|')}:${t.quote?.text ?? ''}`).join('\n'))).toBe('57471784');
  });
});

describe('北斗（DIPPER）', () => {
  it('《鹖冠子·环流》原文', () => {
    expect(DIPPER.quote.text).toBe('斗柄东指，天下皆春；斗柄南指，天下皆夏；斗柄西指，天下皆秋；斗柄北指，天下皆冬。');
    expect(DIPPER.quote.source).toBe('《鹖冠子·环流》');
  });
  it('七星依次', () => {
    expect(DIPPER.stars.map((s) => s.name)).toEqual(['天枢', '天璇', '天玑', '天权', '玉衡', '开阳', '摇光']);
    for (const s of DIPPER.stars) {
      expect(s.note.length, s.name).toBeGreaterThan(0);
      expect(s.note, s.name).not.toMatch(ASCII);
    }
  });
  it('怎么找北极星：几句白话', () => {
    expect(DIPPER.howto.length).toBeGreaterThanOrEqual(3);
    const all = DIPPER.howto.join('');
    expect(all).toContain('天璇');
    expect(all).toContain('天枢');
    expect(all).toContain('五倍');
    expect(all).toContain('北极星');
    for (const h of DIPPER.howto) expect(h).not.toMatch(ASCII);
  });
  it('古书里的几句，各有出处', () => {
    expect(DIPPER.more.length).toBeGreaterThanOrEqual(3);
    for (const m of DIPPER.more) {
      expect(m.text).not.toMatch(ASCII);
      expect(m.source.length).toBeGreaterThan(0);
      expect(m.source).not.toMatch(ASCII);
    }
    expect(DIPPER.more.find((m) => m.source === '《论语·为政》')!.text).toBe('为政以德，譬如北辰，居其所而众星共之。');
    expect(fnv([DIPPER.quote.text, ...DIPPER.more.map((m) => m.text)].join('\n'))).toBe('3ef8156b');
  });
});

describe('村里人的话（LINES，自撰）', () => {
  /** 最初的九人：每人 6–10 句 */
  const FIRST = ['farmer', 'picker', 'kid', 'elder', 'teacher', 'carpenter', 'fisher', 'woodcutter', 'neighbor'];
  /** 后来添的五人（浣衣女、牧童、酒家掌柜、货郎、舂米人）：每人 5–8 句 */
  const LATER = ['washer', 'herdboy', 'keeper', 'peddler', 'miller'];
  /** 客：8–10 句 */
  const WHO = [...FIRST, ...LATER, 'guest'];
  /** 「」里引的字，去掉标点 */
  const quoted = (s: string) => [...s.matchAll(/「([^」]*)」/g)].map((m) => hanOnly(m[1]));
  /** 一句话连同主人接的那句 */
  const both = (l: (typeof LINES)[number]) => (l.reply === undefined ? [l.text] : [l.text, l.reply]);

  it('十五种人，句数各在约定之内，各有不限时令的话', () => {
    unique(LINES.map((l) => l.id));
    for (const l of LINES) {
      expect(WHO, l.id).toContain(l.who);
      expect(l.id.startsWith(l.who + '-'), l.id).toBe(true);
    }
    const n = (w: string) => LINES.filter((l) => l.who === w).length;
    for (const w of FIRST) {
      expect(n(w), w).toBeGreaterThanOrEqual(6);
      expect(n(w), w).toBeLessThanOrEqual(10);
    }
    for (const w of LATER) {
      expect(n(w), w).toBeGreaterThanOrEqual(5);
      expect(n(w), w).toBeLessThanOrEqual(8);
    }
    expect(n('guest')).toBeGreaterThanOrEqual(8);
    expect(n('guest')).toBeLessThanOrEqual(10);
    for (const w of WHO) expect(LINES.filter((l) => l.who === w && !l.when).length, `${w} 要有不限时令的话`).toBeGreaterThanOrEqual(2);
  });
  it('每句不超过 30 字，没有 ASCII，句末有标点', () => {
    for (const l of LINES) {
      for (const t of both(l)) {
        expect(len(t), l.id).toBeLessThanOrEqual(30);
        expect(len(t), l.id).toBeGreaterThanOrEqual(4);
        expect(t, l.id).not.toMatch(ASCII);
        expect(t, l.id).toMatch(/[。？！…」]$/);
      }
    }
    unique(LINES.map((l) => l.text));
  });
  it('时令标签在约定的集合里', () => {
    for (const l of LINES) for (const w of l.when ?? []) expect(LINE_WHEN, `${l.id} ${w}`).toContain(w);
  });
  it('不算命，不谈升官发财；除了「客」，谁也不引古书', () => {
    for (const l of LINES) {
      for (const t of both(l)) {
        expect(t, l.id).not.toMatch(/吉|凶|卦|占|命里|算一|升官|发财|做官|功名/);
        expect(t, l.id).not.toMatch(/[《》]/);
      }
      if (l.who !== 'guest') {
        expect(l.text, l.id).not.toMatch(/[「」]/);
        expect(l.reply, l.id).toBeUndefined();
      }
    }
  });
  it('货郎担子里有针线、麦芽糖、拨浪鼓；掌柜拿得出今年的酒；浣衣女知道水从哪里来', () => {
    const all = (w: string) => LINES.filter((l) => l.who === w).map((l) => l.text).join('');
    for (const s of ['针', '线', '麦芽糖', '拨浪鼓']) expect(all('peddler'), s).toContain(s);
    expect(all('keeper')).toContain('今年的新酒');
    expect(all('washer')).toMatch(/这水是.+出来的/);
    expect(all('herdboy')).toContain('笛');
    expect(all('miller')).toContain('碓');
  });
  it('客与主人只谈四时消长；「」里引的都是核对过的原文', () => {
    const guest = LINES.filter((l) => l.who === 'guest');
    for (const l of guest) expect(l.reply, l.id).toBeTruthy();
    // 本项目里核对过的原文：诗（整首连读）、联、观物的话、案头两本书、易里的话、卦辞与大象
    const verified = [
      ...POEMS.map((p) => p.lines.join('')),
      ...PAIRS.map((p) => p.a + p.b),
      ...SAYINGS.map((x) => hanOnly(x.text)),
      ...PAGES.map((x) => hanOnly(x.text)),
      ...YI_WORDS.map((x) => hanOnly(x.text)),
      ...GUA.flatMap((g) => [hanOnly(g.judgment), hanOnly(g.image)]),
    ].join('\n');
    let quotes = 0;
    for (const l of guest) {
      for (const t of both(l)) {
        // 引号成对
        expect((t.match(/「/g) ?? []).length, l.id).toBe((t.match(/」/g) ?? []).length);
        for (const q of quoted(t)) {
          quotes++;
          expect(len(q), l.id).toBeGreaterThanOrEqual(4);
          expect(verified, `${l.id} 引：${q}`).toContain(q);
        }
      }
    }
    expect(quotes).toBeGreaterThanOrEqual(4);
    // 不是句句掉书袋：至少四段对话一个字也不引
    expect(guest.filter((l) => !both(l).join('').includes('「')).length).toBeGreaterThanOrEqual(4);
    const talk = guest.map((l) => both(l).join('')).join('');
    for (const s of ['冬至', '夏至', '月', '斗柄', '阳气']) expect(talk, s).toContain(s);
  });
});

describe('渔樵（YUQIAO）', () => {
  it('几段短问答，都注《渔樵问对》', () => {
    expect(YUQIAO.length).toBeGreaterThanOrEqual(6);
    for (const x of YUQIAO) {
      expect(x.q.length).toBeGreaterThan(0);
      expect(x.a.length).toBeGreaterThan(0);
      expect(len(hanOnly(x.q + x.a)), x.q).toBeLessThanOrEqual(60);
      expect(x.q + x.a, x.q).not.toMatch(ASCII);
      expect(x.source, x.q).toContain('《渔樵问对》');
    }
    unique(YUQIAO.map((x) => x.q));
  });
  it('来历说明如实：旧题邵雍，作者有异说', () => {
    expect(YUQIAO_NOTE).toContain('旧题邵雍');
    expect(YUQIAO_NOTE).toContain('张载');
    expect(YUQIAO_SCENE.open).toContain('渔者垂钓于伊水之上');
    expect(YUQIAO_SCENE.close).toContain('吾闻古有伏羲，今日如睹其面焉');
  });
  it('要紧的字句', () => {
    const by = (q: string) => YUQIAO.find((x) => x.q === q)!.a;
    expect(by('天何依？')).toBe('依乎地。');
    expect(by('地何附？')).toBe('附乎天。');
    expect(by('然则天地何依何附？')).toBe('自相依附。天依形，地附气。其形也有涯，其气也无涯。');
    expect(by('子以何道而得鱼？')).toBe('吾以六物具而得鱼。');
    expect(fnv(YUQIAO.map((x) => x.q + '|' + x.a).join('\n'))).toBe('d758263e');
  });
});

describe('界面上的几句（WORDS）', () => {
  it('题名与题下一句', () => {
    expect(WORDS.title).toBe('安乐窝');
    expect(WORDS.subtitle).toBe('心能安处即桃源');
    expect(len(WORDS.seal)).toBeGreaterThanOrEqual(2);
    expect(len(WORDS.seal)).toBeLessThanOrEqual(4);
    expect(WORDS.entry.length).toBeGreaterThanOrEqual(1);
    for (const e of WORDS.entry) {
      expect(len(e), e).toBeLessThanOrEqual(30);
      expect(e).not.toMatch(ASCII);
    }
  });
  it('关于页 4–6 段，只许出现阿拉伯数字这一种 ASCII', () => {
    expect(WORDS.about.length).toBeGreaterThanOrEqual(4);
    expect(WORDS.about.length).toBeLessThanOrEqual(6);
    for (const p of WORDS.about) {
      expect(p).not.toMatch(ASCII_NOT_DIGIT);
      expect(len(p)).toBeLessThanOrEqual(260);
    }
    const all = WORDS.about.join('\n');
    for (const s of ['邵雍', '尧夫', '1077', '洛阳', '天津桥南', '王拱辰', '富弼', '司马光', '安乐窝', '安乐先生', '皇极经世', '伊川击壤集', '桃花源', '不是', '复原']) {
      expect(all, s).toContain(s);
    }
  });
  it('如实说明：哪些话不是邵雍的', () => {
    const all = WORDS.honest.join('\n');
    for (const p of WORDS.honest) expect(p).not.toMatch(ASCII);
    // 题下一句是今人写的
    expect(WORDS.honest.find((p) => p.includes('心能安处即桃源'))!).toContain('字句不是他的');
    expect(all).toContain('此心安处是吾乡');
    expect(all).toContain('心泰身宁是归处，故乡何独在长安');
    // 「春种秋收」不出于书
    expect(WORDS.honest.find((p) => p.includes('春种秋收，便是大吉'))!).toContain('不出于');
    // 门联是明人的话
    const gate = WORDS.honest.find((p) => p.includes('闭门即是深山，读书随处净土'))!;
    for (const s of ['明代', '陈继儒', '醉古堂剑扫', '小窗幽记', '不是宋人']) expect(gate, s).toContain(s);
    // 山村咏怀
    expect(WORDS.honest.find((p) => p.includes('山村咏怀'))!).toContain('旧题');
    expect(all).toContain('不是古书里的');
  });
});

describe('八卦（TRIGRAMS）', () => {
  it('八个，先天次序', () => {
    expect(TRIGRAMS.map((t) => t.id)).toEqual(['qian', 'dui', 'li', 'zhen', 'xun', 'kan', 'gen', 'kun']);
    expect(TRIGRAMS.map((t) => t.name).join('')).toBe('乾兑离震巽坎艮坤');
    expect(TRIGRAMS.map((t) => t.image).join('')).toBe('天泽火雷风水山地');
    expect(TRIGRAMS.map((t) => t.nature).join('')).toBe('健说丽动入陷止顺');
    expect(TRIGRAMS.map((t) => t.xiantian)).toEqual(['南', '东南', '东', '东北', '西南', '西', '西北', '北']);
  });
  it('三爻自下而上；先天次序就是「阳爻当 0、初爻在低位」数出来的 0…7', () => {
    TRIGRAMS.forEach((t, i) => {
      expect(t.lines.length).toBe(3);
      for (const x of t.lines) expect([0, 1]).toContain(x);
      // 乾一兑二离三震四 巽五坎六艮七坤八：自上爻数起的二进制（阳 0 阴 1）
      const v = (1 - t.lines[2]) + (1 - t.lines[1]) * 2 + (1 - t.lines[0]) * 4;
      expect(v, t.name).toBe(i);
    });
    expect(TRIGRAMS.find((t) => t.id === 'zhen')!.lines).toEqual([1, 0, 0]);
    expect(TRIGRAMS.find((t) => t.id === 'gen')!.lines).toEqual([0, 0, 1]);
    expect(TRIGRAMS.find((t) => t.id === 'kan')!.lines).toEqual([0, 1, 0]);
    expect(TRIGRAMS.find((t) => t.id === 'li')!.lines).toEqual([1, 0, 1]);
  });
  it('先天方位上，相对的两卦阴阳相反', () => {
    const OPP: Record<string, string> = { 南: '北', 东南: '西北', 东: '西', 东北: '西南', 西南: '东北', 西: '东', 西北: '东南', 北: '南' };
    for (const t of TRIGRAMS) {
      const o = TRIGRAMS.find((x) => x.xiantian === OPP[t.xiantian])!;
      expect(o.lines, `${t.name} 对 ${o.name}`).toEqual(t.lines.map((x) => 1 - x));
    }
    expect(XIANTIAN_SOURCE.text).toContain('乾南，坤北，离东，坎西，震东北，兑东南，巽西南，艮西北');
    expect(XIANTIAN_SOURCE.source).toContain('周易本义');
  });
});

describe('六十四卦（GUA）', () => {
  const tri = (id: Trigram['id']) => TRIGRAMS.find((t) => t.id === id)!;
  it('六十四卦，卦序 1…64，卦名不重', () => {
    expect(GUA.length).toBe(64);
    GUA.forEach((g, i) => expect(g.n).toBe(i + 1));
    unique(GUA.map((g) => g.name));
    expect(GUA.map((g) => g.name).join(' ')).toBe(
      '乾 坤 屯 蒙 需 讼 师 比 小畜 履 泰 否 同人 大有 谦 豫 随 蛊 临 观 噬嗑 贲 剥 复 无妄 大畜 颐 大过 坎 离 咸 恒 遁 大壮 晋 明夷 家人 睽 蹇 解 损 益 夬 姤 萃 升 困 井 革 鼎 震 艮 渐 归妹 丰 旅 巽 兑 涣 节 中孚 小过 既济 未济',
    );
  });
  it('六爻自下而上；下卦是初二三爻，上卦是四五上爻；六十四种爻象各不相同', () => {
    for (const g of GUA) {
      expect(g.lines.length, g.name).toBe(6);
      for (const x of g.lines) expect([0, 1], g.name).toContain(x);
      expect(g.lines.slice(0, 3), `${g.name} 下卦`).toEqual(tri(g.lower).lines);
      expect(g.lines.slice(3, 6), `${g.name} 上卦`).toEqual(tri(g.upper).lines);
    }
    unique(GUA.map((g) => g.lines.join('')));
  });
  it('通行本卦序「二二相耦，非覆即变」：每对后一卦是前一卦倒过来，倒过来不变的就阴阳全反', () => {
    for (let k = 0; k < 64; k += 2) {
      const a = GUA[k].lines;
      const b = GUA[k + 1].lines;
      const rev = [...a].reverse();
      if (rev.join('') === a.join('')) expect(b, `${GUA[k].name}—${GUA[k + 1].name}`).toEqual(a.map((x) => 1 - x));
      else expect(b, `${GUA[k].name}—${GUA[k + 1].name}`).toEqual(rev);
    }
  });
  it('八纯卦与八卦同名同象', () => {
    const pure = GUA.filter((g) => g.upper === g.lower);
    expect(pure.length).toBe(8);
    for (const g of pure) expect(g.name, g.name).toBe(tri(g.lower).name);
    expect(pure.map((g) => g.name).join('')).toBe('乾坤坎离震艮巽兑');
  });
  it('几卦的上下卦（与书上对一对）', () => {
    const by = (name: string) => GUA.find((g) => g.name === name)!;
    const ul = (name: string) => tri(by(name).lower).name + '下' + tri(by(name).upper).name + '上';
    expect(ul('屯')).toBe('震下坎上');
    expect(ul('泰')).toBe('乾下坤上');
    expect(ul('否')).toBe('坤下乾上');
    expect(ul('井')).toBe('巽下坎上');
    expect(ul('鼎')).toBe('巽下离上');
    expect(ul('既济')).toBe('离下坎上');
    expect(ul('未济')).toBe('坎下离上');
    expect(ul('复')).toBe('震下坤上');
    expect(ul('姤')).toBe('巽下乾上');
    expect(ul('涣')).toBe('坎下巽上');
  });
  it('大象里都有卦名（乾卦例外：「天行健」以「健」代卦名）', () => {
    for (const g of GUA) {
      expect(g.image, g.name).toMatch(/。$/);
      expect(g.image, g.name).not.toMatch(ASCII);
      if (g.name === '乾') expect(g.image).toBe('天行健，君子以自强不息。');
      else expect(g.image, g.name).toContain(g.name);
      expect(g.image, g.name).toMatch(/君子以|先王以|后以|大人以|上以/);
    }
    const by = (name: string) => GUA.find((g) => g.name === name)!;
    expect(by('井').image).toBe('木上有水，井。君子以劳民劝相。');
    expect(by('坤').image).toBe('地势坤，君子以厚德载物。');
    expect(by('坎').image).toContain('习坎');
    expect(by('革').image).toBe('泽中有火，革。君子以治历明时。');
  });
  it('卦辞是原文；白话不谈吉凶', () => {
    for (const g of GUA) {
      expect(g.judgment.length, g.name).toBeGreaterThan(0);
      expect(g.judgment, g.name).not.toMatch(ASCII);
      expect(g.judgment, g.name).toMatch(/[。]$/);
      expect(g.gloss, g.name).not.toMatch(ASCII);
      expect(g.gloss, g.name).toMatch(/[。]$/);
      expect(len(g.gloss), g.name).toBeLessThanOrEqual(64);
      expect(g.gloss, g.name).not.toMatch(/吉|凶|咎|悔|吝|占|卜/);
    }
    const by = (name: string) => GUA.find((g) => g.name === name)!;
    expect(by('乾').judgment).toBe('元亨利贞。');
    expect(by('履').judgment).toBe('履虎尾，不咥人，亨。');
    expect(by('蒙').judgment).toContain('匪我求童蒙，童蒙求我。');
    expect(by('复').judgment).toContain('反复其道，七日来复。');
  });
  it('原文指纹（防误改）', () => {
    expect(fnv(GUA.map((g) => `${g.n}${g.name}:${g.judgment}:${g.image}`).join('\n'))).toBe('00507ed1');
  });
});

describe('十二消息卦（XIAOXI）', () => {
  const by = (name: string) => GUA.find((g) => g.name === name)!;
  it('复 临 泰 大壮 夬 乾 姤 遁 否 观 剥 坤', () => {
    expect(XIAOXI.map((x) => x.gua)).toEqual(['复', '临', '泰', '大壮', '夬', '乾', '姤', '遁', '否', '观', '剥', '坤']);
  });
  it('阳爻数 1…6，再 5…0；息卦阳从下长，消卦阴从下长', () => {
    const yang = XIAOXI.map((x) => by(x.gua).lines.reduce((a, b) => a + b, 0));
    expect(yang).toEqual([1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 0]);
    XIAOXI.forEach((x, i) => {
      const lines = by(x.gua).lines.join('');
      const k = i < 6 ? i + 1 : i - 5;
      expect(lines, x.gua).toBe(i < 6 ? '1'.repeat(k) + '0'.repeat(6 - k) : '0'.repeat(k) + '1'.repeat(6 - k));
    });
  });
  it('配月、时辰、中气', () => {
    expect(XIAOXI.map((x) => x.hour).join('')).toBe('子丑寅卯辰巳午未申酉戌亥');
    expect(XIAOXI.map((x) => x.qi)).toEqual(['冬至', '大寒', '雨水', '春分', '谷雨', '小满', '夏至', '大暑', '处暑', '秋分', '霜降', '小雪']);
    const M = ['十一月', '十二月', '正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月'];
    XIAOXI.forEach((x, i) => {
      expect(x.month, x.gua).toBe(`建${x.hour}之月（夏历${M[i]}）`);
      // 中气就是节气表里的偶数位（雨水、春分……）
      expect(TERMS.findIndex((t) => t.name === x.qi) % 2, x.qi).toBe(1);
    });
  });
  it('来历说明里说的间隔，按先天图的次序算得出来', () => {
    // 先天六十四卦次序：初爻为最高位的二进制（阳 1 阴 0），复在 32，乾在 63
    const v = (name: string) => by(name).lines.reduce((a, b) => a * 2 + b, 0);
    const xs = ['复', '临', '泰', '大壮', '夬', '乾'].map(v);
    expect(xs).toEqual([32, 48, 56, 60, 62, 63]);
    for (const s of ['孟氏章句', '新唐书', '京房', '辟', '没有查实', '十六卦', '八卦', '加一倍法']) expect(XIAOXI_NOTE, s).toContain(s);
  });
});

describe('易里的话（YI_WORDS）', () => {
  it('编号连续，各有出处', () => {
    YI_WORDS.forEach((w, i) => expect(w.id).toBe('w' + String(i + 1).padStart(2, '0')));
    for (const w of YI_WORDS) {
      expect(w.text, w.id).not.toMatch(ASCII);
      expect(w.source.length, w.id).toBeGreaterThan(0);
      expect(w.source, w.id).not.toMatch(ASCII);
    }
    unique(YI_WORDS.map((w) => w.text));
  });
  it('该有的都在，字句照原文', () => {
    const all = YI_WORDS.map((w) => w.text).join('\n');
    for (const s of [
      '天地定位，山泽通气，雷风相薄，水火不相射，八卦相错',
      '古者包牺氏之王天下也，仰则观象于天，俯则观法于地，观鸟兽之文与地之宜，近取诸身，远取诸物，于是始作八卦',
      '河出图，洛出书，圣人则之',
      '易有太极，是生两仪，两仪生四象，四象生八卦',
      '观天之神道，而四时不忒',
      '复，其见天地之心乎',
      '日中则昃，月盈则食，天地盈虚，与时消息',
      '观乎天文，以察时变；观乎人文，以化成天下',
      '一分为二，二分为四，四分为八，八分为十六，十六分为三十二，三十二分为六十四',
      '先天学，心法也，故图皆自中起，万化万事生乎心也',
      '图虽无文，吾终日言而未尝离乎是，盖天地万物之理尽在其中矣',
      '心为太极，又曰道为太极',
      '一物其来有一身，一身还有一乾坤',
      '冬至子之半，天心无改移',
    ]) {
      expect(all, s).toContain(s);
    }
    for (const w of YI_WORDS.filter((x) => x.source.startsWith('邵雍'))) expect(w.source, w.id).toMatch(/皇极经世·观物外篇|伊川击壤集/);
    expect(fnv(YI_WORDS.map((w) => `${w.id}:${w.text}`).join('\n'))).toBe('3528477e');
  });
});
