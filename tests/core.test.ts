// 大家共用的底子：世界的存档（mem）与行囊（bag）。
import { describe, expect, it } from 'vitest';
import { Mem } from '../src/world/mem';
import { Bag, ITEMS, defineItems, itemText } from '../src/world/bag';

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
});
