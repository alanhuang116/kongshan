// 农事的账：头一回的样子、各季的上限、过夜长、做活推着长、换季跟着走、收与捆、晒场、存档往返。
import { describe, expect, it } from 'vitest';
import { CHAIN, CROPS, QUOTES, SEASONS, type Season } from '../src/data/farm';
import {
  BEDS, PILES_MAX, VILLAGE_ROWS, addPile, advance, beat, beatsFor, bind, bindable, capOf, changeSeason, chainStep, freshState, loadSheaves, loadState, newDay,
  perRow, reap, rowDir, save, sow, sowable, spread, stageIndex, takeLeft, takePile, till, villageCut, villageNext, water, weed, winnow, work,
} from '../src/world/farm/model';
import { aheadOf, along, compass, nextTurn, passes, routeLen, stepsText, type P2 } from '../src/world/farm/way';

describe('农时', () => {
  it('冬麦秋种、粟春夏种、豆夏种、菜冬天不种', () => {
    expect(sowable('grain', 'autumn')).toEqual(['wheat']);
    expect(sowable('grain', 'spring')).toEqual(['millet']);
    expect(sowable('grain', 'summer').sort()).toEqual(['bean', 'millet']);
    expect(sowable('grain', 'winter')).toEqual([]);
    expect(sowable('veg', 'winter')).toEqual([]);
    expect(sowable('veg', 'spring')).toEqual(['greens']);
  });
  it('秋天种下的麦：秋冬只到出苗，春天长高，夏天才黄熟；过了夏天就不在季里了', () => {
    expect(capOf('wheat', 'autumn', 'autumn')).toBe('sprout');
    expect(capOf('wheat', 'autumn', 'winter')).toBe('sprout');
    expect(capOf('wheat', 'autumn', 'spring')).toBe('growing');
    expect(capOf('wheat', 'autumn', 'summer')).toBe('ripe');
    expect(capOf('millet', 'spring', 'autumn')).toBe('ripe');
    expect(capOf('millet', 'spring', 'winter')).toBeNull();
    expect(capOf('bean', 'summer', 'autumn')).toBe('ripe');
  });
  it('每样庄稼都有一条农事链，链里有翻地、下种', () => {
    for (const c of Object.keys(CROPS) as Array<keyof typeof CROPS>) { expect(CHAIN[c][0]).toBe('翻地'); expect(CHAIN[c][1]).toBe('下种'); }
  });
});

describe('头一回来的样子', () => {
  it('四季各有可做的', () => {
    const s = freshState('spring'), su = freshState('summer'), au = freshState('autumn'), wi = freshState('winter');
    expect(s.beds.west.stage).toBe('growing');
    expect(s.beds.east.stage).toBe('stubble');
    expect(su.beds.west.stage).toBe('ripe');
    expect(su.beds.west.crop).toBe('wheat');
    expect(au.beds.east.stage).toBe('ripe');
    expect(au.beds.east.crop).toBe('millet');
    expect(au.beds.west.stage).toBe('stubble');
    expect(wi.beds.west.stage).toBe('sprout');
    for (const st of [s, su, au, wi]) { expect(Object.keys(st.beds).sort()).toEqual(BEDS.map((b) => b.id).sort()); expect(st.village.length).toBe(VILLAGE_ROWS); }
  });
});

describe('长', () => {
  it('秋天下了麦种，浇过水，过一两夜出苗；秋天里不会再往上长', () => {
    const st = freshState('autumn'), b = st.beds.west;
    for (let r = 0; r < 4; r++) till(b, r, 1);
    expect(b.stage).toBe('tilled');
    for (let r = 0; r < 4; r++) sow(b, r, 1, 'wheat', 'autumn');
    expect(b.stage).toBe('sown');
    expect(b.sownIn).toBe('autumn');
    water(b, 0.6);
    newDay(st, 1); newDay(st, 2);
    expect(b.stage).toBe('sprout');
    for (let d = 3; d < 12; d++) newDay(st, d);
    expect(b.stage).toBe('sprout');
  });
  it('时辰停着：做几件农活也能把种子推出苗来', () => {
    const st = freshState('spring'), b = st.beds.east;
    for (let r = 0; r < 4; r++) till(b, r, 1);
    for (let r = 0; r < 4; r++) sow(b, r, 1, 'millet', 'spring');
    water(b, 0.6);
    for (let i = 0; i < 2; i++) work(st);
    expect(b.stage).toBe('sown');
    for (let i = 0; i < 4; i++) work(st);
    expect(stageIndex(b.stage)).toBeGreaterThanOrEqual(stageIndex('sprout'));
    expect(st.work).toBe(6);
  });
  it('干着、荒着长得慢', () => {
    const a = freshState('spring'), b = freshState('spring');
    for (const st of [a, b]) { const bd = st.beds.east; for (let r = 0; r < 4; r++) till(bd, r, 1); for (let r = 0; r < 4; r++) sow(bd, r, 1, 'millet', 'spring'); }
    water(a.beds.east, 0.7);
    b.beds.east.water = 0; b.beds.east.weed = 0.9;
    advance(a, 0.5); advance(b, 0.5);
    expect(a.beds.east.grow + stageIndex(a.beds.east.stage)).toBeGreaterThan(b.beds.east.grow + stageIndex(b.beds.east.stage));
    expect(a.beds.east.care).toBeGreaterThan(b.beds.east.care);
  });
  it('下雨地就湿了；一天天地干下去、草长起来', () => {
    const st = freshState('summer'), b = st.beds.vegE;
    b.water = 0.2; advance(st, 0.5, { rain: 1 });
    expect(b.water).toBeGreaterThan(0.9);
    const w0 = b.water, g0 = b.weed;
    advance(st, 1);
    expect(b.water).toBeLessThan(w0);
    expect(b.weed).toBeGreaterThan(g0);
    weed(b, 1); expect(b.weed).toBe(0);
  });
});

describe('换季', () => {
  it('秋天种下的麦，换到夏天就是黄熟的', () => {
    const st = freshState('autumn'), b = st.beds.west;
    for (let r = 0; r < 4; r++) till(b, r, 1);
    for (let r = 0; r < 4; r++) sow(b, r, 1, 'wheat', 'autumn');
    changeSeason(st, 'summer');
    expect(st.season).toBe('summer');
    expect(b.stage).toBe('ripe');
    expect(b.crop).toBe('wheat');
  });
  it('一季一季往后过：秋→冬是出苗（雪下），→春长高', () => {
    const st = freshState('autumn'), b = st.beds.west;
    for (let r = 0; r < 4; r++) { till(b, r, 1); } for (let r = 0; r < 4; r++) sow(b, r, 1, 'wheat', 'autumn');
    changeSeason(st, 'winter'); expect(b.stage).toBe('sprout');
    changeSeason(st, 'spring'); expect(b.stage).toBe('growing');
  });
  it('没人管的地长草：茬子、翻过没种的，过一季就荒了', () => {
    const st = freshState('spring');
    expect(st.beds.east.stage).toBe('stubble');
    changeSeason(st, 'summer');
    expect(st.beds.east.stage).toBe('wild');
    expect(st.beds.east.weed).toBeGreaterThan(0.7);
    const t = freshState('spring'), b = t.beds.vegW;
    for (let r = 0; r < 2; r++) till(b, r, 1);
    changeSeason(t, 'summer');
    expect(b.stage).toBe('wild');
  });
  it('熟了没收，过了季：邻家帮着收了，放在地头', () => {
    const st = freshState('summer'), b = st.beds.west;
    expect(b.stage).toBe('ripe');
    changeSeason(st, 'autumn');
    expect(b.stage).toBe('stubble');
    expect(b.left?.item).toBe('sheaf');
    expect(b.left!.n).toBeGreaterThan(0);
    const l = takeLeft(b); expect(l?.n).toBeGreaterThan(0); expect(b.left).toBeNull();
  });
  it('种晚了、没熟就过季：枯了', () => {
    const st = freshState('autumn'), b = st.beds.vegW;
    for (let r = 0; r < 2; r++) till(b, r, 1);
    for (let r = 0; r < 2; r++) sow(b, r, 1, 'greens', 'autumn');
    changeSeason(st, 'winter');
    expect(b.stage).toBe('wild');
    expect(b.crop).toBeNull();
  });
  it('往回换季也当作往后过了几季（夏→春是过了秋冬）', () => {
    const st = freshState('summer');
    changeSeason(st, 'spring');
    expect(st.season).toBe('spring');
    expect(st.beds.west.stage).not.toBe('ripe');
  });
  it('邻家那片麦换了季就重新算', () => {
    const st = freshState('summer');
    villageCut(st, 0, 0.5);
    changeSeason(st, 'autumn');
    expect(st.village.every((v) => v === 0)).toBe(true);
  });
});

describe('收、捆、挑', () => {
  it('割麦：割下的铺在地上，够一捆就捆；四垄都割完、捆完就留茬', () => {
    const st = freshState('summer'), b = st.beds.west, pr = perRow(b);
    expect(pr).toBeGreaterThanOrEqual(2);
    expect(reap(b, 0, 0.5)).toBe(0);
    expect(b.op).toBe('reap');
    let n = 0;
    while (bindable(b, 0)) { expect(bind(b, 0)).toBe(true); n++; }
    reap(b, 0, 1);
    while (bindable(b, 0)) { bind(b, 0); n++; }
    expect(n).toBe(pr);
    expect(b.stage).toBe('ripe');
    for (let r = 1; r < 4; r++) { reap(b, r, 1); while (bindable(b, r)) bind(b, r); }
    expect(b.stage).toBe('stubble');
    expect(b.sheaves).toBe(pr * 4);
    expect(loadSheaves(b, 12)).toBe(Math.min(12, pr * 4));
  });
  it('掐谷穗：一边掐一边进篮子，一垄的数目对', () => {
    const st = freshState('autumn'), b = st.beds.east, pr = perRow(b);
    let got = 0;
    for (let k = 1; k <= 10; k++) got += reap(b, 0, k / 10);
    expect(got).toBe(pr);
    for (let r = 1; r < 4; r++) got += reap(b, r, 1);
    expect(got).toBe(pr * 4);
    expect(b.stage).toBe('stubble');
  });
  it('垄的走向：偶数垄自西往东，奇数垄自东往西', () => {
    expect(rowDir(0)).toBe(1); expect(rowDir(1)).toBe(-1); expect(rowDir(2)).toBe(1);
  });
  it('农事链走到哪一步', () => {
    const st = freshState('summer'), b = st.beds.west;
    expect(chainStep(b)).toBe(4);
    reap(b, 0, 0.6);
    expect(chainStep(b)).toBe(5);
  });
});

describe('晒场', () => {
  it('摊开 → 打 → 一堆连糠带粒的 → 扬：风合适才得麦', () => {
    const st = freshState('summer');
    spread(st, 'wheat', 10);
    const need = beatsFor(10);
    let r = { done: false, grain: 0 };
    for (let i = 0; i < need && !r.done; i++) r = beat(st, 1 / need + 1e-9);
    expect(r.done).toBe(true);
    expect(st.floor.heap).toBe(16);
    expect(winnow(st, 'weak')).toBe(0);
    expect(st.floor.heap).toBe(16);
    expect(winnow(st, 'good')).toBe(1);
    expect(winnow(st, 'strong')).toBe(0);
    expect(st.floor.heap).toBe(14);
  });
  it('谷穗直接打成谷子', () => {
    const st = freshState('autumn');
    spread(st, 'millet', 6);
    let r = { done: false, grain: 0 };
    for (let i = 0; i < 40 && !r.done; i++) r = beat(st, 0.1);
    expect(r.grain).toBe(6);
    expect(st.floor.heap).toBe(0);
  });
});

describe('邻家那片麦', () => {
  it('一垄一垄地割，割完了往下一垄', () => {
    const st = freshState('summer');
    expect(villageNext(st)).toBe(0);
    villageCut(st, 0, 0.4); expect(villageNext(st)).toBe(0);
    expect(villageCut(st, 0, 1)).toBe(true);
    expect(villageNext(st)).toBe(1);
  });
});

describe('存档', () => {
  it('往返一遍还是那样', () => {
    const st = freshState('summer');
    reap(st.beds.west, 0, 0.7); bind(st.beds.west, 0); spread(st, 'wheat', 4); villageCut(st, 2, 0.3); st.gift = true; work(st);
    const back = loadState(JSON.parse(JSON.stringify(save(st))), 'summer');
    expect(back).toEqual(save(st));
  });
  it('坏的存档换成头一回的样子；缺的补上', () => {
    expect(loadState(null, 'spring')).toEqual(freshState('spring'));
    expect(loadState({ v: 2 }, 'winter')).toEqual(freshState('winter'));
    const st = loadState({ v: 1, season: 'spring', beds: { west: { stage: 'ripe' } } }, 'spring');
    expect(st.beds.west.stage).toBe('wild');
    expect(st.beds.east).toBeTruthy();
  });
  it('存的是夏天、此刻是秋天：读出来就往后过到秋天', () => {
    const st = freshState('summer');
    const back = loadState(save(st), 'autumn');
    expect(back.season).toBe('autumn');
    expect(back.beds.west.stage).toBe('stubble');
  });
  it('每一季的头一回都能存、能读', () => {
    for (const s of SEASONS as Season[]) expect(loadState(save(freshState(s)), s)).toEqual(freshState(s));
  });
});

describe('放在地上的担子', () => {
  it('放下、并进去、拿走；放满了并到最近那一副同样的里', () => {
    const st = freshState('summer');
    expect(st.piles).toEqual([]);
    addPile(st, { item: 'sheaf', n: 8, x: 10, z: 10, yaw: 0 });
    addPile(st, { item: 'sheaf', n: 4, x: 10.6, z: 10.4, yaw: 1 });
    expect(st.piles.length).toBe(1);
    expect(st.piles[0].n).toBe(12);
    addPile(st, { item: 'water', n: 2, x: 10.2, z: 10, yaw: 0 });
    expect(st.piles.length).toBe(2);
    expect(takePile(st, 0, 5)).toBe(5);
    expect(st.piles[0].n).toBe(7);
    expect(takePile(st, 0, 99)).toBe(7);
    expect(st.piles.map((p) => p.item)).toEqual(['water']);
    for (let i = 0; i < PILES_MAX + 2; i++) addPile(st, { item: 'milletEar', n: 1, x: i * 10, z: 50, yaw: 0 });
    expect(st.piles.length).toBe(PILES_MAX);
    expect(st.piles.filter((p) => p.item === 'milletEar').reduce((a, p) => a + p.n, 0)).toBe(PILES_MAX + 2);
  });
  it('存档往返；坏的那几副不要', () => {
    const st = freshState('autumn');
    addPile(st, { item: 'milletEar', n: 6, x: 3, z: 4, yaw: 0.5 });
    expect(loadState(JSON.parse(JSON.stringify(save(st))), 'autumn').piles).toEqual(st.piles);
    const bad = { ...save(st), piles: [{ item: 'rock', n: 2, x: 0, z: 0 }, { item: 'water', n: 0, x: 0, z: 0 }, { item: 'sheaf', n: 3, x: 'a', z: 0 }, { item: 'sheaf', n: 3, x: 1, z: 2 }] };
    expect(loadState(bad, 'autumn').piles).toEqual([{ item: 'sheaf', n: 3, x: 1, z: 2, yaw: 0 }]);
  });
});

describe('认路（担子往哪儿挑）', () => {
  it('方向：北、东北、东……（+x 东、+z 南）', () => {
    expect(compass(0, -1)).toBe('北');
    expect(compass(1, -1)).toBe('东北');
    expect(compass(1, 0)).toBe('东');
    expect(compass(1, 1)).toBe('东南');
    expect(compass(0, 1)).toBe('南');
    expect(compass(-1, 1)).toBe('西南');
    expect(compass(-1, 0)).toBe('西');
    expect(compass(-1, -1)).toBe('西北');
  });
  it('步数：近的「几步」，远的按五步、十步取整', () => {
    expect(stepsText(5)).toBe('几步');
    expect(stepsText(14)).toBe('约二十步');
    expect(stepsText(63)).toBe('约九十步');
    expect(stepsText(84)).toBe('约一百二十步');
  });
  const R: P2[] = [[0, 0], [0, 10], [20, 10]];
  it('人在路上哪儿、还剩多远；顺着路往前', () => {
    expect(routeLen(R)).toBe(30);
    const a = along(R, 1, 4);
    expect(a.i).toBe(0);
    expect(a.off).toBeCloseTo(1);
    expect(a.left).toBeCloseTo(26);
    expect(aheadOf(R, a, 8)).toEqual([2, 10]);
    const b = along(R, 12, 11);
    expect(b.i).toBe(1);
    expect(b.left).toBeCloseTo(8);
  });
  it('朝哪一点走：下一个拐点；拐点就在脚边就朝再下一个；离路远了先回到路上', () => {
    expect(nextTurn(R, along(R, 0, 3), 0, 3)).toEqual([0, 10]);
    // 再下一个拐点远在十四米外：取顺着路十四米那一点（方向一样，往东）
    expect(nextTurn(R, along(R, 0.2, 9), 0.2, 9)).toEqual([13, 10]);
    expect(nextTurn(R, along(R, 0.2, 9), 0.2, 9, { far: 30 })).toEqual([20, 10]);
    expect(nextTurn(R, along(R, 11, 2), 11, 2)).toEqual([11, 10]);
  });
  it('路上要过的几处：只说还在前头的', () => {
    const marks = [{ x: 0, z: 6, r: 1, say: '过石桥' }, { x: 15, z: 10.5, r: 1, say: '过柴门' }, { x: 50, z: 50, r: 1, say: '远处' }];
    expect(passes(R, along(R, 0, 1), marks)).toEqual(['过石桥', '过柴门']);
    expect(passes(R, along(R, 0, 8), marks)).toEqual(['过柴门']);
  });
});

describe('农事的引文（QUOTES）', () => {
  const fnv = (s: string) => { let h = 0x811c9dc5; for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
  it('只有汉字与中文标点，没有 ASCII；都标了出处', () => {
    for (const q of Object.values(QUOTES)) {
      expect(/[\x00-\x7f]/.test(q.text), q.id).toBe(false);
      expect(q.source.length, q.id).toBeGreaterThan(3);
    }
  });
  it('指纹（动了原文先查 docs/SOURCES.md「十、农事」，核实了再改这里）', () => {
    expect(fnv(Object.values(QUOTES).map((q) => `${q.id}:${q.text}`).join('|'))).toBe('6dd2df53');
  });
});
