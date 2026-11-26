// 学的那几样（play/study/）：修为几重的算法、抢座怎么判、讲卦的钟点两边算得一样、一讲的字与三问、路标并盏、打坐的几境与岁差。
import { describe, expect, it } from 'vitest';
import { DAXUE_FROM, DAXUE_LINES, LEVELS, LEVEL_AT, levelOf } from '../src/world/play/study/levels';
import { resolveSeats, seatMsg, readSeatMsg, quizMsg, readQuizMsg, type Wish } from '../src/world/play/study/seats';
import { DUR, LINES_N, SLOT_MS, T, dayHour, durOf, groupGua, groupLecture, nextGroup, phaseAt, slotOf } from '../src/world/play/study/schedule';
import { SHUO_PIECES, glossHead, lessonOf, linesOf, moralOf, nextCourse, pairOf, quizOf, scoreOf } from '../src/world/play/study/lesson';
import { cluster, nearest } from '../src/world/play/study/cluster';
import { SETTLE, TIERS, YEARS_HUI, fmtSit, hourShi, hourYe, minutes, moonYue, poleAt, precessLong, seasonSui, sitScore, tierAt, tierCap, yearsDing } from '../src/world/play/study/vision';
import { GUA, YI_WORDS } from '../src/data/yi';
import { ASK, CLOSE, HINTS, NOTES, OPEN, QUIZ_IN, REPLY } from '../src/data/lecture';
import { VERSES } from '../src/data/verses';

describe('修为的几重', () => {
  it('名字是《大学》那一句里的字：知止、定、静、安、虑、得', () => {
    expect(LEVELS.map((l) => l.name)).toEqual(['知止', '定', '静', '安', '虑', '得']);
    expect(DAXUE_FROM).toBe('《礼记·大学》');
    // 原文就是 verses.ts 里核对过的那一条，一字不差
    const v = VERSES.find((x) => x.id === 'v73')!;
    expect(DAXUE_LINES).toEqual(v.lines);
    expect(DAXUE_LINES.join('，')).toBe('知止而后有定，定而后能静，静而后能安，安而后能虑，虑而后能得');
    for (const l of LEVELS) { expect(DAXUE_LINES).toContain(l.cite); expect(l.cite.includes(l.name)).toBe(true); }
  });
  it('分数落在哪一重、离下一重差几分', () => {
    expect(levelOf(0).level.name).toBe('知止');
    expect(levelOf(29).level.name).toBe('知止');
    expect(levelOf(30).level.name).toBe('定');
    expect(levelOf(89).toNext).toBe(1);
    expect(levelOf(640).level.name).toBe('得');
    expect(levelOf(640).next).toBe(null);
    expect(levelOf(9999).frac).toBe(1);
    for (let i = 1; i < LEVEL_AT.length; i++) expect(LEVEL_AT[i]).toBeGreaterThan(LEVEL_AT[i - 1]);
    const m = levelOf(60);
    expect(m.frac).toBeCloseTo((60 - 30) / (90 - 30), 6);
  });
});

describe('抢座', () => {
  const kids = new Set([0, 2, 4]);
  it('先要的得；一样早，编号小的得；孩子的席谁也抢不去', () => {
    const w = new Map<number, Wish>([[7, { seat: 1, t: 1200 }], [3, { seat: 1, t: 900 }], [5, { seat: 3, t: 400 }], [9, { seat: 3, t: 400 }], [11, { seat: 0, t: 1 }]]);
    const own = resolveSeats(w, kids);
    expect(own.get(1)).toBe(3);
    expect(own.get(3)).toBe(5);
    expect(own.has(0)).toBe(false);
    expect(own.has(5)).toBe(false);
  });
  it('消息到的先后不一样，算出来的一样', () => {
    const items: Array<[number, Wish]> = [[21, { seat: 5, t: 3000 }], [8, { seat: 5, t: 2999 }], [13, { seat: 1, t: 50 }], [2, { seat: 3, t: 700 }], [30, { seat: 3, t: 700 }]];
    const ref = [...resolveSeats(new Map(items), kids)].sort();
    for (let n = 0; n < 30; n++) {
      const sh = [...items].sort(() => Math.random() - 0.5);
      expect([...resolveSeats(new Map(sh), kids)].sort()).toEqual(ref);
    }
    expect(ref).toEqual([[1, 13], [3, 2], [5, 8]]);
  });
  it('一个人只认他最后要的那一席；让了就空出来', () => {
    const w = new Map<number, Wish>([[4, { seat: 1, t: 100 }], [6, { seat: 1, t: 200 }]]);
    expect(resolveSeats(w, kids).get(1)).toBe(4);
    w.set(4, { seat: 3, t: 900 });
    const own = resolveSeats(w, kids);
    expect(own.get(1)).toBe(6);
    expect(own.get(3)).toBe(4);
    w.delete(4);
    expect(resolveSeats(w, kids).has(3)).toBe(false);
  });
  it('线上的几个数读得回来，坏的不要', () => {
    const d = seatMsg(1234567, 3, 4500.4, true);
    expect(readSeatMsg(d)).toEqual({ slot: 234567, seat: 3, t: 4500, on: true });
    expect(readSeatMsg([1, 2])).toBe(null);
    expect(readSeatMsg([1, -1, 3, 1])).toBe(null);
    expect(readQuizMsg(quizMsg(42, 41, 3))).toEqual({ slot: 42, score: 41, right: 3 });
    expect(readQuizMsg([42, 120, 3])).toBe(null);
  });
});

describe('讲卦的钟点', () => {
  it('一讲的几段首尾相接', () => {
    expect(DUR).toBe(T.gather + LINES_N * T.line + 3 * T.ask + T.show);
    expect(phaseAt(0).kind).toBe('gather');
    expect(phaseAt(T.gather - 0.01).kind).toBe('gather');
    const l0 = phaseAt(T.gather);
    expect(l0.kind === 'line' && l0.i === 0).toBe(true);
    const l5 = phaseAt(T.gather + LINES_N * T.line - 0.01);
    expect(l5.kind === 'line' && l5.i === LINES_N - 1).toBe(true);
    const a2 = phaseAt(T.gather + LINES_N * T.line + 2 * T.ask + 1);
    expect(a2.kind === 'ask' && a2.i === 2).toBe(true);
    expect(phaseAt(DUR - 0.01).kind).toBe('show');
    expect(phaseAt(DUR).kind).toBe('done');
    expect(durOf(4)).toBe(DUR - 2 * T.line);
  });
  it('同游：两边各拿自己的钟算，同一刻就是同一讲（格、卦、三问都一样）', () => {
    const tz = 480, base = Date.UTC(2026, 10, 25, 2, 0, 0); // 东八区上午十点整
    const a = groupLecture(base + 12345, tz), b = groupLecture(base + 12345 + 40, tz);
    expect(a).not.toBe(null);
    expect(b).toEqual(a);
    expect(a!.t0).toBe(slotOf(base).t0);
    const la = lessonOf(a!.gua, a!.seed), lb = lessonOf(b!.gua, b!.seed);
    expect(lb.quiz).toEqual(la.quiz);
    expect(lb.lines).toEqual(la.lines);
    // 下一格是下一卦
    const n = groupLecture(base + SLOT_MS + 1000, tz)!;
    expect(n.gua).toBe(groupGua(a!.slot + 1));
    // 讲完了（过了一讲的长度）这一格就没有了
    expect(groupLecture(base + DUR * 1000 + 10, tz)).toBe(null);
  });
  it('园中夜里不讲；下一讲在天亮以后', () => {
    const tz = 480, night = Date.UTC(2026, 10, 25, 14, 0, 0); // 东八区晚上十点
    expect(groupLecture(night, tz)).toBe(null);
    const nx = nextGroup(night, tz)!;
    expect(nx).not.toBe(null);
    const h = new Date(nx.t0 + tz * 60000).getUTCHours();
    expect(dayHour(h)).toBe(true);
    expect(h).toBe(7);
    expect(dayHour(6.9)).toBe(false);
    expect(dayHour(17.4)).toBe(true);
    expect(dayHour(17.5)).toBe(false);
  });
  it('独游从乾讲起，讲过的跳过', () => {
    expect(nextCourse(new Set())).toBe(0);
    expect(nextCourse(new Set([0, 1, 2]))).toBe(3);
    expect(nextCourse(new Set(Array.from({ length: 64 }, (_, i) => i)), 63)).toBe(0);
    expect(nextCourse(new Set(Array.from({ length: 64 }, (_, i) => i)), 9)).toBe(10);
  });
});

describe('一讲的字', () => {
  it('卦辞、大象、白话照录 yi.ts；《说卦》那几个字是原句里连着的', () => {
    const w14 = YI_WORDS.find((w) => w.id === 'w14')!.text;
    expect(Object.keys(SHUO_PIECES).length).toBe(8);
    for (const s of Object.values(SHUO_PIECES)) expect(w14.includes(s)).toBe(true);
    for (const g of GUA) {
      const ls = linesOf(g);
      expect(ls.length).toBe(LINES_N);
      expect(ls.find((l) => l.kind === 'judg')!.text).toBe(g.judgment);
      expect(ls.find((l) => l.kind === 'judg')!.source).toBe(`《周易·${g.name}》`);
      expect(ls.find((l) => l.kind === 'image')!.text).toBe(g.image);
      expect(ls.find((l) => l.kind === 'gloss')!.text).toBe(g.gloss);
      // 先生自己的话不带出处；原文都带
      for (const l of ls) expect(!!l.source).toBe(l.kind === 'shuo' || l.kind === 'judg' || l.kind === 'image');
    }
  });
  it('本应用写的话里不说吉凶、不占不卜', () => {
    const ours = [...OPEN, ...CLOSE, QUIZ_IN, ...Object.values(ASK), ...Object.values(REPLY), ...Object.values(HINTS), ...Object.values(NOTES)].join('\n');
    for (const w of ['吉', '凶', '祸', '福', '运势', '占', '卜', '算命', '预言']) expect(ours.includes(w), w).toBe(false);
  });
  it('三问：每题四项各不相同，对的那一项是这一卦的', () => {
    for (const g of GUA) {
      const q = quizOf(g, g.n * 977);
      expect(q.length).toBe(3);
      for (const x of q) {
        expect(x.options.length).toBe(4);
        expect(new Set(x.options).size).toBe(4);
        expect(x.answer).toBeGreaterThanOrEqual(0);
        expect(x.answer).toBeLessThan(4);
        expect(x.ask.includes(g.name)).toBe(true);
      }
      expect(q[0].options[q[0].answer]).toBe(pairOf(g));
      expect(q[1].options[q[1].answer]).toBe(moralOf(g));
      expect(q[2].options[q[2].answer]).toBe(glossHead(g));
    }
  });
  it('大象的下半句、白话的头一截取得出来，六十四卦各不相同', () => {
    const morals = GUA.map(moralOf), heads = GUA.map(glossHead);
    for (const [i, m] of morals.entries()) { expect(/^(君子|先王|大人|后|上)以/.test(m), GUA[i].name).toBe(true); expect(GUA[i].image.includes(m)).toBe(true); }
    expect(new Set(morals).size).toBeGreaterThan(60);
    expect(new Set(heads).size).toBe(64);
    for (const [i, h] of heads.entries()) { expect(GUA[i].gloss.startsWith(h)).toBe(true); expect([...h].length).toBeLessThanOrEqual(16); }
  });
  it('同一个种子出同样的三问，换个种子不一样', () => {
    expect(quizOf(GUA[2], 99)).toEqual(quizOf(GUA[2], 99));
    const a = JSON.stringify(quizOf(GUA[2], 99)), diff = [100, 101, 102, 103].some((s) => JSON.stringify(quizOf(GUA[2], s)) !== a);
    expect(diff).toBe(true);
  });
  it('答得快多得几分：对 10 分起，至多 15；错 0 分', () => {
    expect(scoreOf(true, 1)).toBe(15);
    expect(scoreOf(true, 0)).toBe(10);
    expect(scoreOf(true, 0.5)).toBe(13);
    expect(scoreOf(false, 1)).toBe(0);
  });
});

describe('路标并盏', () => {
  it('一米二之内并成一盏，远了各是各的；次序给定结果就定', () => {
    const pts = [{ x: 0, z: 0, k: 'a' }, { x: 0.5, z: 0.4, k: 'b' }, { x: 5, z: 5, k: 'c' }, { x: 0.9, z: -0.2, k: 'd' }, { x: 5.6, z: 5.2, k: 'e' }, { x: 30, z: 0, k: 'f' }];
    const cs = cluster(pts);
    expect(cs.length).toBe(3);
    expect(cs[0].items.map((p) => p.k)).toEqual(['a', 'b', 'd']);
    expect(cs[1].items.map((p) => p.k)).toEqual(['c', 'e']);
    expect(cs[0].x).toBeCloseTo((0 + 0.5 + 0.9) / 3, 6);
    expect(cluster(pts)).toEqual(cs);
  });
  it('最近的几盏，近的在前，太远的不要', () => {
    const cs = cluster([{ x: 10, z: 0 }, { x: 2, z: 0 }, { x: 50, z: 0 }, { x: 5, z: 0 }]);
    const n = nearest(cs, 0, 0, 2, 20);
    expect(n.map((c) => c.x)).toEqual([2, 5]);
    expect(nearest(cs, 0, 0, 9, 20).length).toBe(3);
  });
});

describe('打坐的几境', () => {
  it('静得越久越深，修为够得着哪一境就到哪一境为止', () => {
    expect(tierAt(0, 4).i).toBe(-1);
    expect(tierAt(SETTLE + 0.1, 4).i).toBe(0);
    expect(tierAt(TIERS[1].from + 1, 4).i).toBe(1);
    expect(tierAt(TIERS[4].from + 1, 4).i).toBe(4);
    // 修为只够一时：静多久都停在一时，走到头就停着
    const held = tierAt(TIERS[3].from, 0);
    expect(held.i).toBe(0); expect(held.u).toBe(1); expect(held.held).toBe(true);
    expect(tierCap(0)).toBe(0); expect(tierCap(4)).toBe(4); expect(tierCap(5)).toBe(4);
    for (let i = 1; i < TIERS.length; i++) expect(TIERS[i].from).toBe(TIERS[i - 1].from + TIERS[i - 1].dur);
    expect(TIERS.map((t) => t.name)).toEqual(['一时', '一夜', '一月', '一岁', '入定']);
  });
  it('打坐榜：境深的在前，同一境坐得久的在前；写法', () => {
    expect(sitScore(4, 10)).toBeGreaterThan(sitScore(3, 999));
    expect(sitScore(2, 60)).toBeGreaterThan(sitScore(2, 30));
    expect(sitScore(-1, 50)).toBe(0);
    expect(fmtSit(sitScore(4, 150))).toBe('入定 · 两分半');
    expect(fmtSit(sitScore(0, 10))).toBe('一时');
    expect(minutes(29)).toBe('');
    expect(minutes(30)).toBe('半分');
    expect(minutes(90)).toBe('一分半');
    expect(minutes(600)).toBe('十分');
  });
  it('一时两个钟头、一夜从天黑到天亮、一月的月一夜比一夜圆又缺、一岁轮过四季', () => {
    expect(hourShi(9, 0)).toBeCloseTo(9, 6);
    expect(hourShi(23, 1)).toBeCloseTo(1, 6);
    const [sr, ss] = [6.0, 18.2];
    expect(hourYe(0, sr, ss)).toBeCloseTo(ss + 0.6, 6);
    expect(hourYe(1, sr, ss)).toBeCloseTo(sr - 0.4, 6);
    let lastPhase = -1;
    for (let u = 0; u <= 1.0001; u += 0.05) {
      const m = moonYue(u, sr, ss);
      expect(m.phase).toBeGreaterThan(lastPhase); lastPhase = m.phase;
      // 钟点总在黄昏以后、黎明以前
      const h = m.hour < 12 ? m.hour + 24 : m.hour;
      expect(h).toBeGreaterThanOrEqual(ss + 1 - 1e-9);
      expect(h).toBeLessThanOrEqual(sr + 24 - 0.6 + 1e-9);
    }
    expect(moonYue(0.5, sr, ss).phase).toBeCloseTo(0.58, 6);
    expect([0.1, 0.3, 0.6, 0.9].map((u) => seasonSui(u, 'spring'))).toEqual(['summer', 'autumn', 'winter', 'spring']);
    expect(yearsDing(1)).toBe(YEARS_HUI);
    expect(YEARS_HUI).toBe(10800);
  });
  it('入定的岁差：转的是一个正交阵，天极绕黄极走，半周后到织女那一带', () => {
    const R = precessLong(5000);
    // 行与行正交、各长 1
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const d = R[i * 3] * R[j * 3] + R[i * 3 + 1] * R[j * 3 + 1] + R[i * 3 + 2] * R[j * 3 + 2];
      expect(d).toBeCloseTo(i === j ? 1 : 0, 9);
    }
    const p0 = poleAt(0);
    expect(p0[2]).toBeCloseTo(1, 9);
    // 天极先往赤经零时那边走
    expect(poleAt(100)[0]).toBeGreaterThan(0);
    // 一万两千九百年（半周）：赤经十八时上下、赤纬四十三度上下（织女一在十八时三十七分、三十八度四十七分）
    const p = poleAt(25772 / 2), ra = ((Math.atan2(p[1], p[0]) * 12) / Math.PI + 24) % 24, dec = (Math.asin(p[2]) * 180) / Math.PI;
    expect(ra).toBeCloseTo(18, 1);
    expect(dec).toBeGreaterThan(42); expect(dec).toBeLessThan(44);
  });
});
