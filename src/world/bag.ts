/**
 * 行囊：身上带着的东西（割下的麦、打下的粮、摘的桃、讨来的鸡蛋、要送人的茶……）。
 *
 *   k.bag.add('sheaf', 3)            // 收进三捆麦（会在画面下方浮一句「得麦三捆」；{ quiet: true } 不浮）
 *   k.bag.take('wheat', 2)           // 拿出两升麦；不够就不拿，返回 false
 *   k.bag.has('egg') / count('egg')
 *   k.bag.list()                     // [{ def, n }]：界面的行囊页用
 *   useOf('flour')                   // 这样东西做什么用（「做面食；送人也好……」）
 *   needLine(k.bag, [{ id: 'seedWheat', n: 1 }])   // 做一件事之前说一句要用什么、行囊里有没有
 *
 * 东西是什么、叫什么、论什么（量词）登记在 ITEMS 里。下面先登记了大家共用的一批；
 * 各模块要添新的，在自己的文件里 defineItems([...])（id 用英文小写驼峰，别和已有的重名）。
 * 每样东西的「用处」写在 src/data/itemUses.ts（按 id 对上；没写的按归类垫一句），送人时一回送多少也在那里。
 * 头一回得到一样东西，浮的那句后面再跟一句它的用处（记在存档的 'bagSeen' 里，只说一回）。
 * 存档：数目放在 k.mem 的 'bag' 那一份里，换一样就存一次。
 */
import { cn } from '../util/cn';
import type { Mem } from './mem';
import { GIFTS, ITEM_USES, KIND_USES, named, type GiftDef } from '../data/itemUses';

export interface ItemDef {
  id: string;
  /** 叫什么（两三个字） */
  name: string;
  /** 论什么：捆、升、个、尾、把、壶、碗…… */
  unit: string;
  /** 一句话（行囊页上用；自撰，不冒充古书） */
  note?: string;
  /** 用处：做什么用、在哪儿用（不给就取 data/itemUses.ts 里那一句） */
  use?: string;
  /** 归哪一类（行囊页分栏用）：crop 收成 · seed 种子 · food 吃食 · gift 礼物 · tool 家什 · thing 杂物 */
  kind?: 'crop' | 'seed' | 'food' | 'gift' | 'tool' | 'thing';
  /** 一次最多带多少（不给就是 99） */
  max?: number;
}
export const ITEMS: Record<string, ItemDef> = {};
export function defineItems(list: ItemDef[]) { for (const d of list) ITEMS[d.id] = { ...ITEMS[d.id], ...d }; }

// —— 大家共用的一批（农事、村人、玩耍各路都认这些 id）——
defineItems([
  { id: 'sheaf', name: '麦', unit: '捆', kind: 'crop', note: '割下来捆好的麦，带着穗。' },
  { id: 'wheat', name: '麦粒', unit: '升', kind: 'crop', note: '打过、扬过的麦粒。' },
  { id: 'flour', name: '面', unit: '升', kind: 'food', note: '石磨磨出来的面。' },
  { id: 'milletEar', name: '谷穗', unit: '把', kind: 'crop', note: '掐下来的谷穗，沉甸甸的。' },
  { id: 'millet', name: '小米', unit: '升', kind: 'crop', note: '谷子打下、舂过，就是小米。' },
  { id: 'bean', name: '豆', unit: '升', kind: 'crop' },
  { id: 'greens', name: '青菜', unit: '把', kind: 'food' },
  { id: 'peach', name: '桃', unit: '个', kind: 'food' },
  { id: 'persimmon', name: '柿子', unit: '个', kind: 'food' },
  { id: 'jujube', name: '枣', unit: '捧', kind: 'food' },
  { id: 'mulberryLeaf', name: '桑叶', unit: '把', kind: 'thing' },
  { id: 'seedWheat', name: '麦种', unit: '升', kind: 'seed' },
  { id: 'seedMillet', name: '谷种', unit: '升', kind: 'seed' },
  { id: 'seedBean', name: '豆种', unit: '升', kind: 'seed' },
  { id: 'seedGreens', name: '菜籽', unit: '包', kind: 'seed' },
  { id: 'water', name: '水', unit: '桶', kind: 'thing', max: 2 },
  { id: 'firewood', name: '柴', unit: '捆', kind: 'thing' },
  { id: 'tea', name: '茶', unit: '碗', kind: 'gift', note: '草堂里煮的茶。' },
  { id: 'wine', name: '酒', unit: '壶', kind: 'gift' },
  { id: 'egg', name: '鸡蛋', unit: '个', kind: 'food' },
  { id: 'fish', name: '鱼', unit: '尾', kind: 'food' },
  { id: 'candy', name: '饴糖', unit: '块', kind: 'gift', note: '货郎担子上的麦芽糖。' },
  { id: 'thread', name: '针线', unit: '包', kind: 'gift' },
  { id: 'herb', name: '草药', unit: '把', kind: 'thing' },
  { id: 'flower', name: '花', unit: '枝', kind: 'gift' },
  { id: 'poem', name: '诗笺', unit: '张', kind: 'gift', note: '自己写的两句诗。' },
  { id: 'coin', name: '铜钱', unit: '文', kind: 'thing', max: 9999 },
]);

/** 量词前的数：两个、三捆、十二文 */
export const qtyCn = (n: number) => (n === 2 ? '两' : cn(n));
/** 「麦三捆」「鸡蛋两个」「铜钱十二文」 */
export function itemText(id: string, n: number): string {
  const d = ITEMS[id];
  return d ? `${d.name}${qtyCn(n)}${d.unit}` : `${id}×${n}`;
}
/** 这样东西做什么用、在哪儿用（一句话；名字已换好） */
export function useOf(id: string): string {
  const d = ITEMS[id];
  const t = d?.use ?? ITEM_USES[id] ?? KIND_USES[d?.kind ?? 'thing'] ?? '';
  return named(t);
}
/** 送人时一回送多少、递过去是什么样子；不送人的（水、铜钱、麦捆……）是 null */
export const giftOf = (id: string): GiftDef | null => GIFTS[id] ?? null;
/** 行囊里有 have 个，送人时这一回送几个（不送人的、没有的是 0） */
export const giftN = (id: string, have: number) => { const g = GIFTS[id]; return g && have > 0 ? Math.min(have, g.n) : 0; };

/**
 * 做一件事之前的一句：要用什么、行囊里有没有。给别的事的第一屏用（下种、浇水、推磨、送人……）：
 *   needLine(bag, [{ id: 'seedWheat', n: 1 }])                   → 「要用麦种一升；行囊里有麦种两升。」
 *   needLine(bag, [{ id: 'water' }], '溪边、井上打')             → 「要用水；行囊里没有——溪边、井上打。」
 * 几样里挑一样就行的（下种：麦种、麦粒都行），给 any：          → 「要用麦种或麦粒一升；行囊里有麦粒三升。」
 */
export function needLine(bag: Bag, list: Array<{ id: string; n?: number }>, where = '', o: { any?: boolean } = {}): string {
  const ok = list.filter((x) => ITEMS[x.id]);
  if (!ok.length) return '';
  const amt = (x: { id: string; n?: number }) => (x.n ? `${qtyCn(x.n)}${ITEMS[x.id].unit}` : '');
  const want = o.any ? `${ok.map((x) => ITEMS[x.id].name).join('或')}${amt(ok[0])}` : ok.map((x) => `${ITEMS[x.id].name}${amt(x)}`).join('、');
  const have = ok.filter((x) => bag.count(x.id) > 0).map((x) => itemText(x.id, bag.count(x.id)));
  const enough = o.any ? ok.some((x) => bag.has(x.id, x.n ?? 1)) : ok.every((x) => bag.has(x.id, x.n ?? 1));
  if (enough) return `要用${want}；行囊里有${have.join('、')}。`;
  return `要用${want}；行囊里${have.length ? `只有${have.join('、')}` : '没有'}${where ? `——${where}` : ''}。`;
}

export class Bag {
  private n: Record<string, number> = {};
  /** 得到过的东西（头一回得到时说一句用处，以后不说） */
  private seen = new Set<string>();
  /** 换了一样：给界面（行囊页、角上的小数字） */
  onChange: ((items: Record<string, number>) => void) | null = null;
  /** 浮一句话（「得麦三捆」）：总装接到界面的 note */
  onNote: ((text: string) => void) | null = null;
  constructor(private mem: Mem) {
    const raw = mem.get<Record<string, unknown>>('bag', {});
    for (const [id, v] of Object.entries(raw)) if (typeof v === 'number' && v > 0 && Number.isFinite(v)) this.n[id] = Math.floor(v);
    const seen = mem.get<unknown>('bagSeen', null);
    if (Array.isArray(seen)) for (const id of seen) if (typeof id === 'string') this.seen.add(id);
    // 老存档：行囊里已经有的就当见过（不再一样样地说）
    for (const id of Object.keys(this.n)) this.seen.add(id);
  }
  count(id: string) { return this.n[id] ?? 0; }
  has(id: string, n = 1) { return this.count(id) >= n; }
  /** 头一回得到过没有 */
  known(id: string) { return this.seen.has(id); }
  /**
   * 收进来；满了收不下的就不收。返回实际收了几个。
   * quiet：不浮「得……」（做事的那边自己说）；头一回得到时那一句用处照样说。
   * later：连用处也先不说——东西还没真到手（村里人正递过来），到手时调 announce。
   */
  add(id: string, n = 1, o: { quiet?: boolean; later?: boolean } = {}): number {
    if (!(n > 0)) return 0;
    const max = ITEMS[id]?.max ?? 99, got = Math.min(Math.floor(n), max - this.count(id));
    if (got <= 0) { if (!o.quiet) this.onNote?.(`${ITEMS[id]?.name ?? id}带不下了`); return 0; }
    this.n[id] = this.count(id) + got;
    this.save();
    if (!o.quiet) this.announce(id, got);
    else if (!o.later) this.first(id);
    return got;
  }
  /** 东西到手了：浮「得……」；头一回得到的，再说一句它做什么用 */
  announce(id: string, n: number) {
    if (!(n > 0)) return;
    this.onNote?.(`得${itemText(id, n)}`);
    this.first(id);
  }
  /** 头一回得到：说一句用处 */
  private first(id: string) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.mem.set('bagSeen', [...this.seen]);
    const u = useOf(id), d = ITEMS[id];
    if (u && d) this.onNote?.(`${d.name}：${u}`);
  }
  /** 拿出去；不够就一个也不拿，返回 false */
  take(id: string, n = 1, o: { quiet?: boolean; verb?: string } = {}): boolean {
    if (!(n > 0) || this.count(id) < n) return false;
    this.n[id] = this.count(id) - Math.floor(n);
    if (this.n[id] <= 0) delete this.n[id];
    this.save();
    if (o.verb && !o.quiet) this.onNote?.(`${o.verb}${itemText(id, n)}`);
    return true;
  }
  list(): Array<{ def: ItemDef; n: number }> {
    return Object.entries(this.n).filter(([, v]) => v > 0).map(([id, v]) => ({ def: ITEMS[id] ?? { id, name: id, unit: '' }, n: v }));
  }
  /** 全部数目（给界面、调试） */
  get items(): Readonly<Record<string, number>> { return this.n; }
  private save() { this.mem.set('bag', { ...this.n }); this.onChange?.({ ...this.n }); }
}
