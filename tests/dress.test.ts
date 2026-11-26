// 外乡客的穿着：衣饰单子、穿着怎么理、怎么编成同游里的几个数、怎么换算成一身打扮；衣饰铺买与衣箱
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ATTIRE, ATTIRE_BY_ID, CAT_MAX } from '../src/data/attire';
import { DEFAULT_WEAR, STARTERS, cleanWear, fits, lookOfWear, sameWear, wearFromWire, wearToWire, type Wear } from '../src/world/avatar/dress';
import { readLook } from '../src/world/net/wire';
import { Mem } from '../src/world/mem';
import { buy, grant, ownedSet, owns, payAdapter, setPayAdapter } from '../src/app/shop';
import type { Anlewo } from '../src/world/Anlewo';

describe('衣饰单子', () => {
  it('各样不重样；衣、冠有样子，簪、佩有戴的小物件；价钱是整数元', () => {
    expect(new Set(ATTIRE.map((a) => a.id)).size).toBe(ATTIRE.length);
    for (const a of ATTIRE) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.note.length).toBeGreaterThan(4);
      expect(['m', 'f', 'u']).toContain(a.sex);
      expect(Number.isInteger(a.price) && a.price >= 0).toBe(true);
      if (a.cat === 'yi' || a.cat === 'guan') expect(a.look).toBeTruthy();
      else expect(a.orn).toBeTruthy();
      expect(a.swatch.length).toBe(3);
    }
    // 同游里报的是序号加一（一个 0…255 的数）：单子不能长过 254 样
    expect(ATTIRE.length).toBeLessThan(255);
  });
  it('带着来的那几身都不要钱、男女合身；选人那一页每边三身', () => {
    for (const sex of ['m', 'f'] as const) {
      expect(STARTERS[sex].length).toBe(3);
      for (const w of [DEFAULT_WEAR[sex], ...STARTERS[sex]]) {
        expect(w.sex).toBe(sex);
        for (const id of [w.yi, w.guan, ...w.zan, ...w.pei]) {
          const a = ATTIRE_BY_ID.get(id);
          expect(a, id).toBeTruthy();
          expect(a!.price, id).toBe(0);
          expect(fits(a, sex), id).toBe(true);
        }
      }
    }
  });
  it('铺子里男女各有能买的衣、冠、簪、佩', () => {
    for (const sex of ['m', 'f'] as const) for (const cat of ['yi', 'guan', 'zan', 'pei'] as const) {
      expect(ATTIRE.some((a) => a.cat === cat && fits(a, sex) && a.price > 0), `${sex} ${cat}`).toBe(true);
    }
  });
});

describe('穿着', () => {
  it('理一理：男女不合的、认不得的拿掉，件数有顶，衣与冠空着就补带着来的', () => {
    const w = cleanWear({ sex: 'm', yi: 'f-beizi', guan: 'nope', zan: ['zan-yin', 'buyao', 'zan-yu', 'huazan', 'zan-yin'], pei: ['jinbu', 'pei', 'nang', 'shan'] });
    expect(w.yi).toBe(DEFAULT_WEAR.m.yi);
    expect(w.guan).toBe(DEFAULT_WEAR.m.guan);
    expect(w.zan).toEqual(['zan-yin', 'zan-yu', 'huazan']);
    expect(w.zan.length).toBeLessThanOrEqual(CAT_MAX.zan);
    expect(w.pei).toEqual(['pei', 'nang']);
    expect(cleanWear(null).sex).toBe('m');
    // 没买的（给了 owned）拿掉，带着来的照留
    const o = cleanWear({ sex: 'f', yi: 'f-daxiu', guan: 'f-huaguan', zan: ['zan-yin', 'buyao'], pei: [] }, () => false);
    expect(o).toEqual({ sex: 'f', yi: DEFAULT_WEAR.f.yi, guan: DEFAULT_WEAR.f.guan, zan: ['zan-yin'], pei: [] });
  });
  it('同游里编成几个小整数、再认回来是同一身；中转认得这几个数', () => {
    const all: Wear[] = [...STARTERS.m, ...STARTERS.f, { sex: 'f', yi: 'f-jiang', guan: 'f-huaguan', zan: ['buyao', 'erdang', 'zhuhua'], pei: ['jinbu', 'nang'] }, { sex: 'm', yi: 'm-hechang', guan: 'm-dongpo', zan: ['huazan'], pei: ['pei', 'shan'] }];
    for (const w of all) {
      const d = wearToWire(w);
      expect(readLook(d)).toEqual(d);
      const back = wearFromWire(d);
      expect(back && sameWear(back, w)).toBe(true);
    }
    expect(wearFromWire([2, 0, 1, 1])).toBeNull();
    expect(wearFromWire([1, 5, 1, 1])).toBeNull();
    expect(wearFromWire(null)).toBeNull();
    // 认不得的序号（新的一版单子更长）：那一样空着，别的照认
    const w = wearFromWire([1, 1, 250, 0, 0, 0, 0, 0, 0]);
    expect(w?.sex).toBe('f');
    expect(w?.yi).toBe(DEFAULT_WEAR.f.yi);
  });
  it('换算成一身打扮：女子是女子的身形，簪、佩变成戴的小物件；衣与冠的样子都在', () => {
    const l = lookOfWear({ sex: 'f', yi: 'f-tianshui', guan: 'f-gaoji', zan: ['buyao'], pei: ['jinbu'] });
    expect(l.build).toBe('f');
    expect(l.collar).toBe('duijin');
    expect(l.coat).toBeTruthy();
    expect(l.hat).toBe('gaoji');
    expect(l.orn).toEqual(['buyao', 'jinbu']);
    expect(l.beard).toBe(0);
    const m = lookOfWear(DEFAULT_WEAR.m);
    expect(m.build).toBe('m');
    expect(m.hat).toBe('jin');
    expect(m.orn).toEqual(['hebao']);
  });
});

describe('衣饰铺', () => {
  const world = () => ({ mem: new Mem() }) as unknown as Anlewo;
  const item = ATTIRE_BY_ID.get('m-lanshan')!;
  afterEach(() => { setPayAdapter(null); vi.unstubAllEnvs(); });
  it('带着来的一概算有；买过的收进衣箱（记在世界的存档里）', () => {
    const k = world();
    expect(owns(k, 'm-zhiduo')).toBe(true);
    expect(owns(k, 'm-lanshan')).toBe(false);
    grant(k, 'm-lanshan', 'r1');
    expect(owns(k, 'm-lanshan')).toBe(true);
    expect([...ownedSet(k)]).toEqual(['m-lanshan']);
    grant(k, 'nope');
    expect(ownedSet(k).has('nope')).toBe(false);
  });
  it('接上了付款：付成了收进衣箱，没付成不收', async () => {
    const k = world();
    setPayAdapter({ label: '测', buy: async () => ({ ok: false, why: '取消了' }) });
    expect(await buy(k, item)).toEqual({ ok: false, why: '取消了' });
    expect(owns(k, item.id)).toBe(false);
    setPayAdapter({ label: '测', buy: async () => ({ ok: true, receipt: 'x' }) });
    expect((await buy(k, item)).ok).toBe(true);
    expect(owns(k, item.id)).toBe(true);
  });
  it('没接付款、也不是开发与试用：「买」说没开通（不假装收了钱）', async () => {
    vi.stubEnv('DEV', false);
    const k = world();
    if (payAdapter()) return;            // 网址里带了 ?shop=test 的环境里跑：跳过
    expect(await buy(k, item)).toEqual({ ok: false, why: 'closed' });
    expect(owns(k, item.id)).toBe(false);
  });
});
