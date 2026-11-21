// 名册（src/data/folk.ts）的形状：每个人一天二十四个钟头、四季晴雨都有着落；家里人彼此对得上；住处是有的；名字不重
import { describe, expect, it } from 'vitest';
import { FOLK, FOLK_BY_ID, SEASONS, planNow } from '../src/data/folk';
import { SITE } from '../src/world/site';

describe('全村的名册', () => {
  it('每个人每个钟头都有着落（四季、晴雨）', () => {
    for (const f of FOLK) for (const s of SEASONS) for (const wet of [false, true]) for (let h = 0; h < 24; h += 0.05) {
      const p = planNow(f.id, h, s, wet);
      expect(p, `${f.id} ${s} ${wet ? '雨雪' : '晴'} ${h.toFixed(2)} 点`).not.toBeNull();
      expect(p!.doing.length).toBeGreaterThan(1);
    }
  });
  it('日程的每一步都是从小到大、在 0–24 之内', () => {
    for (const f of FOLK) for (const s of f.plan) { expect(s.from).toBeGreaterThanOrEqual(0); expect(s.to).toBeLessThanOrEqual(24); expect(s.to).toBeGreaterThan(s.from); }
  });
  it('id 不重，家里人都在名册里、彼此都认（谁把谁写成家里人，那人也写着他）', () => {
    expect(new Set(FOLK.map((f) => f.id)).size).toBe(FOLK.length);
    for (const f of FOLK) for (const id of f.family ?? []) {
      expect(FOLK_BY_ID[id], `${f.id} 的家里人 ${id}`).toBeDefined();
      if (FOLK_BY_ID[id].home === f.home) expect(FOLK_BY_ID[id].family ?? [], `${id} 也该认 ${f.id}`).toContain(f.id);
    }
  });
  it('住处是总图上有的那几户，或者村外、渔船', () => {
    const houses = new Set(SITE.houses.map((h) => h.id));
    for (const f of FOLK) expect(houses.has(f.home) || f.home === '村外' || f.home === '渔船', `${f.id} 住 ${f.home}`).toBe(true);
  });
  it('原来那些人一个不少', () => {
    for (const id of ['farmer', 'lunch', 'picker', 'kid1', 'kid2', 'kid3', 'swinger', 'teacher', 'elder', 'elder2', 'neighbor', 'washer', 'carpenter1', 'carpenter2', 'miller', 'fisher', 'woodcutter', 'herdboy', 'keeper', 'drinker', 'peddler', 'guest']) expect(FOLK_BY_ID[id], id).toBeDefined();
  });
  it('夜里有人醒着：打更的子夜在村里，说书的晴天傍晚在槐树下', () => {
    expect(planNow('watchman', 0.5, 'winter', false)?.act).toBe('watch');
    expect(planNow('watchman', 21, 'summer', true)?.act).toBe('watch');
    expect(planNow('teller', 19.6, 'summer', false)?.act).toBe('tell');
    expect(planNow('teller', 19.6, 'summer', true)?.act).toBeUndefined();
  });
});
