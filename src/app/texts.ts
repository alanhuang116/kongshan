/**
 * 界面取字的唯一入口。
 *
 * 文字在 src/data（talk.ts、yi.ts、almanac.ts）里，由别人写。那几个文件在，就用它们的；
 * 不在、或哪一项形状不对，就用这里垫着的几句——界面总能跑，文件一到自动换上。
 * （诗在 shaoyong.ts 里：界面自己不取——哪件事要念哪一首，是那件事连同出处一起交过来的。）
 * 垫着的话都是本应用自己的话，不冒充古人的原文；卦名、卦画、十二消息卦与时辰月份的对应是通行的常识。
 */

export interface Words { title: string; subtitle: string; seal: string; entry: string[]; about: string[]; honest: string[] }
export type TrigramId = 'qian' | 'dui' | 'li' | 'zhen' | 'xun' | 'kan' | 'gen' | 'kun';
export interface Trigram { id: TrigramId; name: string; /** 三爻自下而上，1 阳 0 阴 */ lines: [number, number, number]; image: string; nature: string; xiantian: string }
export interface Gua { /** 通行的卦名（对册子、对世界里记下的名字都用它） */ key: string; n: number; name: string; /** 六爻自下而上，1 阳 0 阴 */ lines: number[]; upper: TrigramId; lower: TrigramId; /** 《大象传》全句（没备好时是空的） */ image: string; judgment: string; gloss: string }
export interface YiWord { id: string; text: string; source: string }
export interface Term { name: string; hou?: string[]; work?: string[]; quote?: { text: string; source: string } }
/** 十二消息卦里的一卦：第几个时辰（子 0 … 亥 11）、那个时辰的名字、卦、配的月份、节气上的话 */
export interface Xiaoxi { i: number; branch: string; gua: Gua; month: string; qi: string }

type Mod = Record<string, unknown>;
const first = (m: Record<string, Mod>): Mod => Object.values(m)[0] ?? {};
const TALK = first(import.meta.glob<Mod>('../data/talk.ts', { eager: true }));
const YI = first(import.meta.glob<Mod>('../data/yi.ts', { eager: true }));
const ALMANAC = first(import.meta.glob<Mod>('../data/almanac.ts', { eager: true }));

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const strs = (v: unknown): string[] | null => (Array.isArray(v) && v.length > 0 && v.every(isStr) ? (v as string[]) : null);
const objs = <T>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : []);

// —— 题名页与「关于」 ——
const w = (TALK.WORDS && typeof TALK.WORDS === 'object' ? TALK.WORDS : {}) as Partial<Record<keyof Words, unknown>>;
export const WORDS: Words = {
  title: isStr(w.title) ? w.title : '安乐窝',
  subtitle: isStr(w.subtitle) ? w.subtitle : '心能安处即桃源',
  seal: isStr(w.seal) ? w.seal : '桃源',
  entry: strs(w.entry) ?? ['桃花开了，沿着溪水慢慢走进来。'],
  about: strs(w.about) ?? [
    '北宋的邵雍把自己住的地方叫作「安乐窝」。这里把它想成洛阳城南、伊水北岸的一处田园：一条溪，一片桃林，几间草堂，屋后的池与亭，溪南的田，东头的邻家，远处是伊水与群山。',
    '这里没有要完成的事。慢慢走，四处看；走近了什么，可以停下来做一会儿。',
    '邵雍一生治《易》。在这里，《易》不拿来占问，只是看：井台上是井，炉上的水是既济，一天十二个时辰、一年十二个月，各是一卦。',
  ],
  honest: strs(w.honest) ?? ['这一页的文字还没有备好。眼下看到的是界面里垫着的几句，都是本应用自己的话，不是古人的原文。'],
};

// —— 八卦 ——
const ORDER: TrigramId[] = ['qian', 'dui', 'li', 'zhen', 'xun', 'kan', 'gen', 'kun'];
const TRI_SPARE: Trigram[] = [
  { id: 'qian', name: '乾', lines: [1, 1, 1], image: '天', nature: '健', xiantian: '南' },
  { id: 'dui', name: '兑', lines: [1, 1, 0], image: '泽', nature: '说', xiantian: '东南' },
  { id: 'li', name: '离', lines: [1, 0, 1], image: '火', nature: '丽', xiantian: '东' },
  { id: 'zhen', name: '震', lines: [1, 0, 0], image: '雷', nature: '动', xiantian: '东北' },
  { id: 'xun', name: '巽', lines: [0, 1, 1], image: '风', nature: '入', xiantian: '西南' },
  { id: 'kan', name: '坎', lines: [0, 1, 0], image: '水', nature: '陷', xiantian: '西' },
  { id: 'gen', name: '艮', lines: [0, 0, 1], image: '山', nature: '止', xiantian: '西北' },
  { id: 'kun', name: '坤', lines: [0, 0, 0], image: '地', nature: '顺', xiantian: '北' },
];
const realTri = objs<Partial<Trigram>>(YI.TRIGRAMS);
/** 八卦，按先天之序（乾一兑二离三震四巽五坎六艮七坤八）。卦画用这里的（方图要靠它排） */
export const TRIGRAMS: Trigram[] = TRI_SPARE.map((t) => {
  const r = realTri.find((x) => x.id === t.id);
  return r ? { ...t, name: isStr(r.name) ? r.name : t.name, image: isStr(r.image) ? r.image : t.image, nature: isStr(r.nature) ? r.nature : t.nature, xiantian: isStr(r.xiantian) ? r.xiantian : t.xiantian } : t;
});
export const TRI = Object.fromEntries(TRIGRAMS.map((t) => [t.id, t])) as Record<TrigramId, Trigram>;

// —— 六十四卦 ——
// 下卦为行、上卦为列，都按 乾兑离震巽坎艮坤 之序；每格是卦名与通行本的卦序
const TABLE: Array<Array<[string, number]>> = [
  [['乾', 1], ['夬', 43], ['大有', 14], ['大壮', 34], ['小畜', 9], ['需', 5], ['大畜', 26], ['泰', 11]],
  [['履', 10], ['兑', 58], ['睽', 38], ['归妹', 54], ['中孚', 61], ['节', 60], ['损', 41], ['临', 19]],
  [['同人', 13], ['革', 49], ['离', 30], ['丰', 55], ['家人', 37], ['既济', 63], ['贲', 22], ['明夷', 36]],
  [['无妄', 25], ['随', 17], ['噬嗑', 21], ['震', 51], ['益', 42], ['屯', 3], ['颐', 27], ['复', 24]],
  [['姤', 44], ['大过', 28], ['鼎', 50], ['恒', 32], ['巽', 57], ['井', 48], ['蛊', 18], ['升', 46]],
  [['讼', 6], ['困', 47], ['未济', 64], ['解', 40], ['涣', 59], ['坎', 29], ['蒙', 4], ['师', 7]],
  [['遁', 33], ['咸', 31], ['旅', 56], ['小过', 62], ['渐', 53], ['蹇', 39], ['艮', 52], ['谦', 15]],
  [['否', 12], ['萃', 45], ['晋', 35], ['豫', 16], ['观', 20], ['比', 8], ['剥', 23], ['坤', 2]],
];
/** 卦名里几个常见的异写（繁体、古字）归到通行的写法，好对得上 */
const VARIANT: Record<string, string> = { 遯: '遁', 無: '无', 歸: '归', 濟: '济', 觀: '观', 臨: '临', 復: '复', 剝: '剥', 賁: '贲', 頤: '颐', 師: '师', 訟: '讼', 謙: '谦', 隨: '随', 蠱: '蛊', 離: '离', 恆: '恒', 壯: '壮', 晉: '晋', 損: '损', 漸: '渐', 豐: '丰', 渙: '涣', 節: '节', 過: '过', 兌: '兑', 兊: '兑' };
export const normGua = (s: string) => [...String(s).trim().replace(/卦$/, '')].map((c) => VARIANT[c] ?? c).join('');

const realGua = new Map<string, Partial<Gua>>();
for (const g of objs<Partial<Gua>>(YI.GUA)) if (isStr(g.name)) realGua.set(normGua(g.name), g);
/** 六十四卦都在（按上表的次序）。文字备好了的有《大象传》与白话；没备好的那两项是空的 */
export const GUA: Gua[] = TABLE.flatMap((row, li) => row.map(([name, n], ui): Gua => {
  const lower = ORDER[li], upper = ORDER[ui], lines = [...TRI[lower].lines, ...TRI[upper].lines];
  const r = realGua.get(name);
  if (r && import.meta.env.DEV && Array.isArray(r.lines) && r.lines.join('') !== lines.join('')) console.warn(`yi.ts 里「${name}」的卦画与上下卦对不上`, r.lines, lines);
  return { key: name, n: typeof r?.n === 'number' ? r.n : n, name: isStr(r?.name) ? r.name : name, lines, upper, lower, image: isStr(r?.image) ? r.image : '', judgment: isStr(r?.judgment) ? r.judgment : '', gloss: isStr(r?.gloss) ? r.gloss : '' };
}));
const BY_NAME = new Map<string, Gua>();
for (const g of GUA) { BY_NAME.set(normGua(g.name), g); BY_NAME.set(g.key, g); }
/** 按卦名找卦（认得几种异写）；找不到是 null */
export const guaOf = (name: unknown): Gua | null => (isStr(name) ? BY_NAME.get(normGua(name)) ?? null : null);

// —— 十二消息卦 ——
const ZHI = '子丑寅卯辰巳午未申酉戌亥';
const XX: Array<[string, string]> = [['复', '十一月'], ['临', '十二月'], ['泰', '正月'], ['大壮', '二月'], ['夬', '三月'], ['乾', '四月'], ['姤', '五月'], ['遁', '六月'], ['否', '七月'], ['观', '八月'], ['剥', '九月'], ['坤', '十月']];
const realXx = objs<{ gua?: unknown; month?: unknown; qi?: unknown }>(YI.XIAOXI);
/** 子时复、丑时临……亥时坤；月份自冬月（十一月）复起，到十月坤 */
export const XIAOXI: Xiaoxi[] = XX.map(([name, month], i) => {
  const r = realXx.find((x) => isStr(x.gua) && normGua(x.gua) === name);
  // 文字里的月份写得全（「建子之月（夏历十一月）」）：界面上只取「十一月」
  const m = isStr(r?.month) ? /[正一二三四五六七八九十冬腊]{1,2}月/.exec(r.month)?.[0] : null;
  return { i, branch: ZHI[i], gua: guaOf(name)!, month: m ?? month, qi: isStr(r?.qi) ? r.qi : '' };
});

export const YI_WORDS: YiWord[] = objs<YiWord>(YI.YI_WORDS).filter((x) => isStr(x.id) && isStr(x.text)).map((x) => ({ id: x.id, text: x.text, source: isStr(x.source) ? x.source : '' }));
const noteWord = YI_WORDS.find((x) => /xiaoxi|消息/i.test(x.id));
/**
 * 十二消息卦是什么：第一段是一句话的说明，后面几段（有的话）是这套配法的来历。
 * 文字里给的是一整篇（分段），没有就用这里垫的一句。
 */
export const XIAOXI_NOTE: string[] = isStr(YI.XIAOXI_NOTE)
  ? YI.XIAOXI_NOTE.split(/\n+/).map((x) => x.trim()).filter(Boolean)
  : [noteWord ? `${noteWord.text}${noteWord.source ? `——${noteWord.source}` : ''}` : '十二消息卦：自「复」一阳初生，阳爻一爻一爻地长，到「乾」六爻皆阳；再自「姤」一阴初生，到「坤」六爻皆阴。古人用这十二卦记一日十二时辰、一年十二个月的寒暑往来。'];
/** 先天八卦方位的原话与出处（有才用） */
const xs = YI.XIANTIAN_SOURCE as { text?: unknown; source?: unknown } | undefined;
export const XIANTIAN_SOURCE: { text: string; source: string } | null = xs && isStr(xs.text) ? { text: xs.text, source: isStr(xs.source) ? xs.source : '' } : null;

// —— 节气 ——
export const TERMS: Term[] = objs<Term>(ALMANAC.TERMS).filter((t) => isStr(t.name));
/** 物候三候引的是哪部书 */
export const HOU_SOURCE: string = isStr(ALMANAC.HOU_SOURCE) ? ALMANAC.HOU_SOURCE : '';
