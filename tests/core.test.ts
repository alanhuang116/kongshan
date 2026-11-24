// 大家共用的底子：世界的存档（mem）与行囊（bag）。
import { describe, expect, it } from 'vitest';
import { Mem } from '../src/world/mem';
import { Bag, ITEMS, defineItems, giftN, giftOf, itemText, needLine, useOf } from '../src/world/bag';
import '../src/world/farm';                 // 农事那一路登记的东西（谷子）也要有用处
import '../src/world/acts/favor';           // 说话那一路登记的东西（竹哨、麦馍……）

describe('世界的存档', () => {
  it('没有的那一份用给的默认；存了告诉界面', () => {
    const saved: Array<[string, unknown]> = [];
    const m = new Mem(null);
    m.onSave = (ns, v) => saved.push([ns, v]);
    expect(m.get('farm', { plots: [] })).toEqual({ plots: [] });
    m.set('farm', { plots: [1] });
    expect(m.get('farm', null)).toEqual({ plots: [1] });
    m.patch('farm', { day: 3 });
    expect(m.get('farm', null)).toEqual({ plots: [1], day: 3 });
    expect(saved.map((s) => s[0])).toEqual(['farm', 'farm']);
  });
  it('从上回存下的那些份接着来', () => {
    const m = new Mem({ day: 4, bag: { egg: 2 } });
    expect(m.get('day', 0)).toBe(4);
    expect(m.has('bag')).toBe(true);
    expect(m.has('folk')).toBe(false);
  });
});

describe('行囊', () => {
  it('收进、拿出、不够就不拿', () => {
    const m = new Mem(null), notes: string[] = [];
    const b = new Bag(m);
    b.onNote = (t) => notes.push(t);
    expect(b.add('sheaf', 3)).toBe(3);
    expect(b.count('sheaf')).toBe(3);
    expect(notes[0]).toBe('得麦三捆');
    expect(b.take('sheaf', 5)).toBe(false);
    expect(b.count('sheaf')).toBe(3);
    expect(b.take('sheaf', 3)).toBe(true);
    expect(b.has('sheaf')).toBe(false);
    expect(b.list()).toEqual([]);
  });
  it('带得有上限（水最多两桶）', () => {
    const b = new Bag(new Mem(null));
    expect(b.add('water', 5, { quiet: true })).toBe(2);
    expect(b.add('water', 1, { quiet: true })).toBe(0);
  });
  it('存进存档，下回原样取出；坏数目不认', () => {
    const m = new Mem(null), b = new Bag(m);
    b.add('egg', 2, { quiet: true }); b.add('fish', 1, { quiet: true });
    const again = new Bag(new Mem({ bag: { ...(m.get('bag', {}) as object), bad: -1, nan: Number.NaN, str: 'x' } }));
    expect(again.count('egg')).toBe(2);
    expect(again.count('fish')).toBe(1);
    expect(again.count('bad')).toBe(0);
    expect(Object.keys(again.items).sort()).toEqual(['egg', 'fish']);
  });
  it('登记的东西都有名字与量词；后登记的可以补全', () => {
    for (const d of Object.values(ITEMS)) { expect(d.name.length, d.id).toBeGreaterThan(0); expect(d.unit.length, d.id).toBeGreaterThan(0); }
    defineItems([{ id: 'testThing', name: '小物', unit: '件' }]);
    expect(itemText('testThing', 12)).toBe('小物十二件');
    delete ITEMS.testThing;
  });
  it('头一回得到一样东西：「得……」之后再说一句它做什么用；以后不再说；记在存档里', () => {
    const m = new Mem(null), notes: string[] = [];
    const b = new Bag(m);
    b.onNote = (t) => notes.push(t);
    b.add('flour', 1);
    expect(notes).toEqual(['得面一升', `面：${useOf('flour')}`]);
    b.add('flour', 2);
    expect(notes.slice(2)).toEqual(['得面两升']);
    expect(m.get<string[]>('bagSeen', [])).toContain('flour');
    const again = new Bag(m), n2: string[] = [];
    again.onNote = (t) => n2.push(t);
    again.add('flour', 1);
    expect(n2).toEqual(['得面一升']);
  });
  it('不浮字的收法：quiet 只说用处；later 什么也不说，等真到手了 announce 再说', () => {
    const b = new Bag(new Mem(null)), notes: string[] = [];
    b.onNote = (t) => notes.push(t);
    b.add('sheaf', 3, { quiet: true });
    expect(notes).toEqual([`麦：${useOf('sheaf')}`]);
    b.add('jujube', 1, { quiet: true, later: true });
    expect(notes.length).toBe(1);
    expect(b.count('jujube')).toBe(1);
    b.announce('jujube', 1);
    expect(notes.slice(1)).toEqual(['得枣一捧', `枣：${useOf('jujube')}`]);
  });
  it('老存档：行囊里已经有的东西当见过，不再一样样地说', () => {
    const b = new Bag(new Mem({ bag: { egg: 2 } })), notes: string[] = [];
    b.onNote = (t) => notes.push(t);
    b.add('egg', 1);
    expect(notes).toEqual(['得鸡蛋一个']);
    expect(b.known('egg')).toBe(true);
  });
  it('每样登记过的东西都有用处：一句话、名字已换好、句末有句号、四十字以内', () => {
    for (const id of Object.keys(ITEMS)) {
      const u = useOf(id);
      expect(u.length, id).toBeGreaterThan(4);
      expect(u, id).not.toMatch(/[{}\x00-\x7f]/);
      expect(u, id).toMatch(/。$/);
      expect(Array.from(u).length, `${id}：${u}`).toBeLessThanOrEqual(40);
    }
  });
  it('送人一回送多少：鸡蛋四个、麦粒一升；水、铜钱、没打的麦捆谷穗不送人', () => {
    expect(giftN('egg', 6)).toBe(4);
    expect(giftN('egg', 2)).toBe(2);
    expect(giftN('wheat', 9)).toBe(1);
    expect(giftN('egg', 0)).toBe(0);
    for (const id of ['water', 'coin', 'sheaf', 'milletEar', 'gu']) { expect(giftOf(id), id).toBeNull(); expect(giftN(id, 5), id).toBe(0); }
    expect(itemText('egg', 2)).toBe('鸡蛋两个');
  });
  it('做事之前的一句：要用什么、行囊里有没有', () => {
    const b = new Bag(new Mem(null));
    expect(needLine(b, [{ id: 'water' }], '溪边、井上打')).toBe('要用水；行囊里没有——溪边、井上打。');
    b.add('seedWheat', 2, { quiet: true });
    expect(needLine(b, [{ id: 'seedWheat', n: 1 }])).toBe('要用麦种一升；行囊里有麦种两升。');
    b.add('wheat', 3, { quiet: true });
    expect(needLine(b, [{ id: 'seedMillet', n: 1 }, { id: 'gu', n: 1 }], '', { any: true })).toBe('要用谷种或谷子一升；行囊里没有。');
    expect(needLine(b, [{ id: 'seedWheat', n: 1 }, { id: 'wheat', n: 1 }], '', { any: true })).toBe('要用麦种或麦粒一升；行囊里有麦种两升、麦粒三升。');
    expect(needLine(b, [{ id: 'seedWheat', n: 5 }])).toBe('要用麦种五升；行囊里只有麦种两升。');
  });
});
