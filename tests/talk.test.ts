/**
 * 村里人说的话与托事（说话那一路）：数据对得上、文字守规矩、人情账算得对。
 *   名册（folk.ts）里每个人都有话说，而且够多（分时令、时辰、情分）；名册日程里的每一件事，问他在忙什么都答得上；
 *   话里说到的人都在名册里，说到「家里人」的真是他家里人；
 *   托事引用的人、物、事都对得上，没有重复的 id；他会托你的那个钟点，他真的在做那件事；
 *   文字里没有不该有的字样（不算命、不谈功名、不冒充古书、没有 ASCII）；
 *   人情账：说话、送礼、托事的情分怎么涨，托事从接下到办成怎么走，回礼进不进行囊，旧签点两下不重给；
 *   你是外乡来的客人：村里人对男客、女客各有叫法，话里不再把你叫「先生」（「先生」只剩邵先生、塾师那几种说法）。
 * （名册本身的形状——每个钟头有着落、家里人互认——在 tests/folk.test.ts，村人那一路管。）
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FOLK } from '../src/data/folk';
import { BOOKS, META, type L } from '../src/data/talk2';
import { FAVORS, FAVOR_ITEMS } from '../src/data/favors';
import { LINES } from '../src/data/talk';
import { ITEMS, Bag, useOf } from '../src/world/bag';
import { Mem } from '../src/world/mem';
import { GIFTS, ITEM_USES } from '../src/data/itemUses';
import { BONDS, callOf, folkOf, folkView, people, person, fill } from '../src/world/acts/favor';
import { FAUNA } from '../src/world/life/fauna/api';

const text = (l: L) => (typeof l === 'string' ? l : l[0]);
const opt = (l: L) => (typeof l === 'string' ? {} : l[1]);
/** 一句话说出口有多长：{某人} 算两个字，{你} 按他最长的那样叫法算（不给就按四个字：叫法至多四个字），{男|女} 取长的那一半 */
const len = (s: string, you = '这位郎君') => Array.from(s.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, a: string, b: string) => (a.length >= b.length ? a : b)).replace(/\{[a-zA-Z0-9_]+\}/g, '某某').replace(/\{你\}|\{先生\}/g, () => you).replace(/\{物\}/g, '某物')).length;
/** 他叫你的几样里最长的那一样（量话的长短用） */
const longest = (id: string) => [1, 2, 3, 4].flatMap((lv) => [callOf(id, lv, 'm'), callOf(id, lv, 'f')]).reduce((a, b) => (b.length > a.length ? b : a), '');
const refs = (s: string) => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]);
const IDS = new Set(FOLK.map((f) => f.id));
/** 名册里某人的名字（名字会改，测试里不写死） */
const nameOf = (id: string) => FOLK.find((f) => f.id === id)!.name;
/** 一个人自己的话（不算 LINES） */
function linesOf(id: string): Array<{ where: string; l: L }> {
  const B = BOOKS[id], out: Array<{ where: string; l: L }> = [];
  const put = (where: string, ls?: L[]) => { for (const l of ls ?? []) out.push({ where, l }); };
  put('greet', B.greet); put('again', B.again); put('long', B.long); put('home', B.home); put('idle', B.idle);
  put('like', B.like); put('ok', B.ok); put('no', B.no); put('back', B.back); put('treat', B.treat); put('bye', B.bye);
  for (const [a, ls] of Object.entries(B.busy)) put(`busy.${a}`, ls);
  for (const [i, ls] of Object.entries(B.got ?? {})) put(`got.${i}`, ls);
  for (const q of B.ask ?? []) put(`ask:${q.q}`, q.a);
  return out;
}
/** 所有要显示给人看的字（自撰的） */
function allTexts(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const id of Object.keys(BOOKS)) {
    const B = BOOKS[id];
    for (const { where, l } of linesOf(id)) {
      out.push([`${id}.${where}`, text(l)]);
      const b = opt(l).back; if (b) { out.push([`${id}.${where}.你答`, b[0]]); out.push([`${id}.${where}.回`, b[1]]); }
    }
    for (const q of B.ask ?? []) { out.push([`${id}.ask.q`, q.q]); if (q.more) out.push([`${id}.ask.more`, q.more]); }
    for (const v of [B.homeQ, B.favorHint, B.giftAsk, B.after, ...Object.values(B.busyQ ?? {}), ...(B.calls ?? []).flatMap((c) => c.split('|'))]) if (v) out.push([`${id}.签`, v]);
  }
  for (const d of FAVORS) {
    for (const [k, v] of Object.entries({ name: d.name, ask: d.ask, yes: d.yes, no: d.no, ok: d.ok, nope: d.nope, hand: d.hand, thanks: d.thanks, ...d.note })) if (v) out.push([`favor.${d.id}.${k}`, v]);
    const g = d.goal as Record<string, unknown>;
    for (const k of ['ask', 'reply', 'report', 'text']) if (typeof g[k] === 'string') out.push([`favor.${d.id}.goal.${k}`, g[k] as string]);
  }
  for (const it of FAVOR_ITEMS) out.push([`item.${it.id}`, `${it.name}${it.unit}${it.note}`]);
  return out;
}
/** 你那一句「春种秋收，便是大吉」是唯一许说「吉」的地方 */
const SAYING = '春种秋收，便是大吉。';
const BANNED = /吉|凶|卦|占卜|算命|命里|算一|升官|发财|做官|功名|风水|八字/;
/** 已有的事（acts/ 里的 id 或前缀）：观星那一路会有 stars 开头的 */
const ACTS = ['tea', 'book', 'dipper', 'stars', 'favor:net'];

describe('名册里每个人都有话说', () => {
  it('名册里的每个人都有一份话；话里没有名册之外的人', () => {
    for (const f of FOLK) expect(BOOKS[f.id], `${f.id}（${f.name}）没有话`).toBeTruthy();
    for (const id of Object.keys(BOOKS)) expect(IDS.has(id), `BOOKS 里的 ${id} 不在名册里`).toBe(true);
    for (const id of Object.keys(META)) expect(IDS.has(id), `META 里的 ${id} 不在名册里`).toBe(true);
  });
  it('每人自己的话至少十句；招呼、告辞、家常都有；有分时令时辰、分情分的', () => {
    const bad: string[] = [];
    for (const f of FOLK) {
      const B = BOOKS[f.id], ls = linesOf(f.id);
      if (ls.length < 10) bad.push(`${f.name} 只有 ${ls.length} 句`);
      if (B.greet.length < 2) bad.push(`${f.name} 的招呼不到两句`);
      if (B.bye.length < 1) bad.push(`${f.name} 没有告辞的话`);
      if (B.home.length < 2) bad.push(`${f.name} 的家常不到两句`);
      if (!B.greet.some((l) => !opt(l).when && !opt(l).bond && !opt(l).act)) bad.push(`${f.name} 没有随时都能说的招呼`);
      if (!(ls.some(({ l }) => !!opt(l).when || !!opt(l).act) || Object.keys(B.busy).length > 2)) bad.push(`${f.name} 没有分时辰、分时令的话`);
      // 常来常往的人：熟了以后要有不一样的话（只路过一回的行脚僧、酒客、牧童不算）
      const bonded = ls.some(({ l }) => (opt(l).bond ?? 0) >= 2) || !!B.calls;
      if (!bonded && !['monk', 'drinker', 'herdboy'].includes(f.id)) bad.push(`${f.name} 没有熟了才说的话`);
    }
    expect(bad).toEqual([]);
  });
  it('名册日程里的每一件事，问他在忙什么都答得上', () => {
    const bad: string[] = [];
    for (const f of FOLK) for (const a of new Set(f.plan.map((s) => s.act).filter((x): x is string => !!x))) if (!BOOKS[f.id].busy[a]?.length) bad.push(`${f.name}「${a}」`);
    expect(bad).toEqual([]);
  });
  it('原先的家常话（LINES）照旧用：认得的那几种都接到了人', () => {
    const kinds = new Set(LINES.map((l) => l.who));
    for (const [id, m] of Object.entries(META)) if (m.kind) expect(kinds.has(m.kind as never), `${id} 的 kind ${m.kind}`).toBe(true);
    for (const k of kinds) expect(Object.values(META).some((m) => m.kind === k), `LINES 里 ${k} 那一种没人说`).toBe(true);
  });
});

describe('说到的人对得上', () => {
  it('话里的 {某人} 都在名册里；fam 说的都是他家里人；about 说的都在', () => {
    const bad: string[] = [];
    for (const id of Object.keys(BOOKS)) {
      const fam = FOLK.find((f) => f.id === id)?.family ?? [];
      for (const { where, l } of linesOf(id)) {
        const o = opt(l);
        for (const t of [text(l), ...(o.back ?? [])]) for (const r of refs(t)) if (!IDS.has(r)) bad.push(`${id}.${where}：{${r}} 不在名册里`);
        for (const f of o.fam ?? []) if (!fam.includes(f)) bad.push(`${id}.${where}：${f} 不是他家里人`);
        for (const a of o.about ?? []) if (!IDS.has(a)) bad.push(`${id}.${where}：${a} 不在名册里`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('「我爹某某」「我哥某某」这样说的，那人真是他家里人（标了 fam）', () => {
    const bad: string[] = [];
    for (const id of Object.keys(BOOKS)) {
      const fam = FOLK.find((f) => f.id === id)?.family ?? [];
      for (const { where, l } of linesOf(id)) {
        const t = text(l);
        for (const r of refs(t)) if (new RegExp(`(我爹|我娘|我哥|我姐|我侄儿|我兄弟|我家|妹妹|哥哥|老大|老二|我那兄弟|我家那口子|我家掌柜的)\\{${r}\\}`).test(t) && !fam.includes(r)) bad.push(`${id}.${where}：「${t}」`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('文字守规矩', () => {
  it('没有 ASCII（除了 {某人}、{你}、{男|女}）；不配书名号、不加引号引古书；句末有标点', () => {
    for (const [where, t] of allTexts()) {
      const bare = t.replace(/\{[a-zA-Z0-9_]+\}|\{先生\}|\{你\}|\{物\}|\{[^{}|]*\|[^{}|]*\}/g, '');
      expect(bare, where).not.toMatch(/[\x00-\x7f]/);
      expect(t, where).not.toMatch(/[《》「」『』]/);
    }
    for (const id of Object.keys(BOOKS)) for (const { where, l } of linesOf(id)) expect(text(l), `${id}.${where}`).toMatch(/[。？！…—]$/);
  });
  it('不算命、不断吉凶、不谈功名；只有你那一句「春种秋收，便是大吉」', () => {
    let saying = 0;
    for (const [where, t] of allTexts()) {
      if (t === SAYING) { saying++; continue; }
      expect(t, where).not.toMatch(BANNED);
    }
    expect(saying, '你答年景的那一句').toBeGreaterThanOrEqual(1);
  });
  it('话短：一句至多四十字（{你} 按他最长的叫法算），签上的字（你说的）至多二十二字', () => {
    for (const id of Object.keys(BOOKS)) {
      const you = longest(id);
      for (const { where, l } of linesOf(id)) {
        expect(len(text(l), you), `${id}.${where}：${text(l)}`).toBeLessThanOrEqual(40);
        const b = opt(l).back;
        if (b) { expect(len(b[0], you), `${id}.${where} 你答`).toBeLessThanOrEqual(22); expect(len(b[1], you), `${id}.${where} 回`).toBeLessThanOrEqual(40); }
      }
      for (const q of BOOKS[id].ask ?? []) expect(len(q.q), `${id} 问`).toBeLessThanOrEqual(14);
      for (const v of Object.values(BOOKS[id].busyQ ?? {})) expect(len(v)).toBeLessThanOrEqual(12);
    }
  });
  it('一个人的话不重样', () => {
    for (const id of Object.keys(BOOKS)) {
      const ts = linesOf(id).filter(({ where }) => !where.startsWith('busy.')).map(({ l }) => text(l));
      expect(new Set(ts).size, id).toBe(ts.length);
    }
  });
});

describe('托事', () => {
  it('八到十二件，id 不重；托事的人、要找的人都在名册里', () => {
    expect(FAVORS.length).toBeGreaterThanOrEqual(8);
    expect(FAVORS.length).toBeLessThanOrEqual(12);
    expect(new Set(FAVORS.map((d) => d.id)).size).toBe(FAVORS.length);
    for (const d of FAVORS) {
      expect(IDS.has(d.from), `${d.id} 托事的 ${d.from}`).toBe(true);
      const g = d.goal;
      if (g.kind === 'fetch') expect(IDS.has(g.at), `${d.id} 去找的 ${g.at}`).toBe(true);
      if (g.kind === 'tell') expect(IDS.has(g.to), `${d.id} 带话给的 ${g.to}`).toBe(true);
      for (const n of d.needs?.npcs ?? []) expect(IDS.has(n), `${d.id} 要的 ${n}`).toBe(true);
      for (const t of allTexts().filter(([w]) => w.startsWith(`favor.${d.id}.`))) for (const r of refs(t[1])) expect(IDS.has(r), `${t[0]}：{${r}}`).toBe(true);
    }
  });
  it('要的东西、回礼都是登记过的物品；要做的事是有的事', () => {
    const items = new Set([...Object.keys(ITEMS), ...FAVOR_ITEMS.map((x) => x.id)]);
    for (const it of FAVOR_ITEMS) expect(ITEMS[it.id]?.name, `${it.id} 被别处登记成了别的东西`).toBe(it.name);
    for (const d of FAVORS) {
      const g = d.goal;
      if (g.kind === 'bring') for (const i of g.items) expect(items.has(i), `${d.id} 要的 ${i}`).toBe(true);
      if (g.kind === 'fetch') expect(items.has(g.item), `${d.id} 讨的 ${g.item}`).toBe(true);
      if (g.kind === 'act') for (const a of g.acts) expect(ACTS.some((x) => a === x || a.startsWith(x)), `${d.id} 要做的 ${a}`).toBe(true);
      for (const r of d.gift ?? []) expect(items.has(r.item), `${d.id} 回礼 ${r.item}`).toBe(true);
      for (const a of d.needs?.acts ?? []) expect(ACTS.includes(a), `${d.id} 要的事 ${a}`).toBe(true);
      if (g.kind === 'bring' || g.kind === 'fetch') expect(d.hand, `${d.id} 交东西的签`).toBeTruthy();
    }
    for (const m of Object.values(META)) for (const g of m.gives ?? []) expect(items.has(g), `回赠的 ${g}`).toBe(true);
  });
  it('他会托你的那个钟点，照名册他真的在做那件事', () => {
    for (const d of FAVORS) {
      const f = FOLK.find((x) => x.id === d.from)!, w = d.when ?? {};
      const steps = f.plan.filter((s) => !!s.act && (!w.acts?.length || w.acts.includes(s.act!)) && (!w.seasons?.length || !s.seasons || s.seasons.some((x) => w.seasons!.includes(x))) && (!w.fair || s.weather !== 'wet'));
      expect(steps.some((s) => s.to > (w.from ?? 0) && s.from < (w.to ?? 24)), `${d.id}：${f.name} 在约定的钟点里不在做 ${w.acts?.join('/') ?? '事'}`).toBe(true);
    }
  });
  it('情分的几档有名字', () => { expect(BONDS).toEqual(['未识', '初识', '相熟', '相得', '知交']); });
});

// —— 人情账：拿一个假的世界来试 ——
function fakeWorld(o: { hour?: number; season?: string; npcs?: string[]; acts?: string[]; sex?: 'm' | 'f' } = {}) {
  const mem = new Mem(null), notes: string[] = [], logs: string[] = [];
  const npcs: Record<string, unknown> = {};
  for (const id of o.npcs ?? FOLK.map((f) => f.id)) npcs[id] = { id, name: id, pos: { x: 1e4, y: 0, z: 1e4 }, present: true, attend() { /* 无 */ }, root: { userData: {} } };
  const k = {
    mem, bag: new Bag(mem), day: 0, season: o.season ?? 'spring', term: null, act: null, persona: { sex: o.sex ?? 'm', name: '' },
    atmos: { hour: o.hour ?? 10, night: 0, w: { rain: 0, snow: 0, mist: 0 } },
    life: { npcs }, acts: Object.fromEntries((o.acts ?? ['tea', 'book', 'dipper', 'favor:net']).map((a) => [a, { id: a, state: {} }])),
    player: { pos: { x: 0, y: 0, z: 0 } },
    note: (t: string) => notes.push(t), log: (e: { text?: string }) => logs.push(e.text ?? ''), sfxAt: () => undefined,
  };
  return { k, notes, logs, F: folkOf(k as never) };
}

describe('人情账', () => {
  it('名册接上了：人的名字、住处、家里人取自 folk.ts', () => {
    expect(people().length).toBe(FOLK.length);
    expect(person('farmer')?.name).toBe(nameOf('farmer'));
    expect(person('farmer')?.homeText).toContain('甲家');
    expect(person('woodcutter')?.homeText).not.toMatch(/^(村外)?$/);
    expect(person('monk')?.you).toBe(FOLK.find((f) => f.id === 'monk')!.call);
    expect(fill('{farmer}和{kid1}')).toBe(`${nameOf('farmer')}和${nameOf('kid1')}`);
  });
  it('一天头一回说话添一分；送对了东西添两分；情分到了一档轻轻提一句；不肯收的不拿走', () => {
    const { k, F, notes } = fakeWorld();
    expect(F.level('farmer')).toBe(0);
    F.meet('farmer'); F.meet('farmer');
    expect(F.level('farmer')).toBe(1);
    expect(F.pm('farmer').v).toBe(1);
    k.bag.add('wine', 1, { quiet: true });
    const r = F.give('farmer', 'wine');
    expect(r.kind).toBe('like');
    expect(r.learned).toBe(true);
    expect(k.bag.count('wine')).toBe(0);
    expect(F.level('farmer')).toBe(2);
    expect(notes.some((n) => n.includes('相熟'))).toBe(true);
    k.bag.add('egg', 1, { quiet: true });
    expect(F.give('farmer', 'egg').kind).toBe('ok');
    expect(F.pm('farmer').v).toBe(3);                       // 同一天再送：收下，不再添情分
    k.bag.add('flower', 1, { quiet: true });
    expect(F.give('farmer', 'flower').kind).toBe('no');
    expect(k.bag.count('flower')).toBe(1);
    const saved = k.mem.get<{ p: Record<string, { n: number; gift: Record<string, number> }> }>('folk', { p: {} });
    expect(saved.p.farmer.n).toBe(2);
    expect(saved.p.farmer.gift.wine).toBe(1);
  });
  it('托事：槐树下的老人想喝口热茶——接下、带着茶去交、回礼、情分加深', () => {
    const { k, F, notes, logs } = fakeWorld({ hour: 9 });
    (k.life.npcs.elder as { act?: string }).act = 'sit';
    F.meet('elder');
    expect(F.offer('elder')?.id).toBe('tea');
    expect(F.run('fv:tea:ask', 'elder')?.yesno?.fid).toBe('tea');
    F.run('fv:tea:yes', 'elder');
    expect(F.fm('tea')?.s).toBe('on');
    expect(notes.at(-1)).toContain(nameOf('elder'));
    expect(F.favorChoices('elder', new Set()).some((c) => c.id === 'fv:tea:hand')).toBe(false);
    k.bag.add('tea', 1, { quiet: true });
    expect(F.favorChoices('elder', new Set()).some((c) => c.id === 'fv:tea:hand')).toBe(true);
    expect(F.run('fv:tea:hand', 'elder')?.text).toContain('茶');
    expect(F.fm('tea')?.s).toBe('done');
    expect(k.bag.count('tea')).toBe(0);
    expect(k.bag.count('jujube')).toBe(1);
    expect(F.pm('elder').help).toContain('tea');
    expect(F.level('elder')).toBe(2);
    expect(logs).toContain(fill(FAVORS.find((d) => d.id === 'tea')!.name));
    expect(F.offer('elder')).toBeNull();
    expect(F.run('fv:tea:hand', 'elder')).toBeNull();      // 旧签再点：不重给
  });
  it('托事：替修桥的木匠向樵夫讨柴——向别人打听、去讨、交给托事的人', () => {
    const { k, F } = fakeWorld({ hour: 15 });
    (k.life.npcs.carpenter1 as { act?: string }).act = 'work';
    F.meet('carpenter1');
    expect(F.offer('carpenter1')?.id).toBe('wood');
    F.run('fv:wood:yes', 'carpenter1');
    expect(F.favorChoices('elder', new Set()).some((c) => c.id === 'fv:wood:where')).toBe(true);
    expect(F.favorChoices('woodcutter', new Set()).find((c) => c.id === 'fv:wood:fetch')).toBeTruthy();
    F.run('fv:wood:fetch', 'woodcutter');
    expect(k.bag.count('firewood')).toBe(1);
    expect(F.fm('wood')?.s).toBe('half');
    expect(F.give('carpenter1', 'firewood').kind).toBe('favor'); // 从「送东西」里挑那捆柴也算
    expect(F.fm('wood')?.s).toBe('done');
    expect(k.bag.count('whistle')).toBe(1);
  });
  it('托事：叫王家的小儿子回家——带了话，回去说一声才算办成', () => {
    const { k, F } = fakeWorld({ hour: 15 });
    F.meet('farmwife');
    expect(F.offer('farmwife')?.id).toBe('home');
    F.run('fv:home:yes', 'farmwife');
    expect(F.favorChoices('kid1', new Set()).some((c) => c.id === 'fv:home:tell')).toBe(true);
    F.run('fv:home:tell', 'kid1');
    expect(F.fm('home')?.s).toBe('half');
    expect(F.favorChoices('farmwife', new Set()).some((c) => c.id === 'fv:home:report')).toBe(true);
    F.run('fv:home:report', 'farmwife');
    expect(F.fm('home')?.s).toBe('done');
    expect(k.bag.count('greens')).toBe(1);
  });
  it('推辞了的事，第二天他还会再提；情分不够的人不托大事', () => {
    const { k, F } = fakeWorld({ hour: 10 });
    F.meet('keeper');
    expect(F.offer('keeper')).toBeNull();                   // 要两尾鱼得先相熟
    F.addV('keeper', 5);
    expect(F.offer('keeper')?.id).toBe('fish');
    F.run('fv:fish:no', 'keeper');
    expect(F.offer('keeper')).toBeNull();
    k.day = 1;
    expect(F.offer('keeper')?.id).toBe('fish');
  });
  it('当场就办的事（念信）：一下子就办成，回礼到手', () => {
    const { k, F } = fakeWorld({ hour: 9 });
    F.meet('tofu');
    expect(F.offer('tofu')?.id).toBe('letter');
    expect(F.run('fv:letter:yes', 'tofu')?.text).toContain('信上写着');
    expect(F.fm('letter')?.s).toBe('done');
    expect(k.bag.count('tofu')).toBe(1);
  });
  it('托事：找回邻家走散的母鸡——生灵那一路让鸡走散，抱回去了，回来说一声', () => {
    const lost = { state: 'none', pos: { x: 0, y: 0, z: -38 }, home: { x: 74, z: -4 } };
    FAUNA.hens = { stray: () => { lost.state = 'wander'; return { x: 0, z: -38 }; }, lost, onHome: null, scatter() { /* 无 */ } } as never;
    try {
      const { k, F } = fakeWorld({ hour: 9 });
      F.meet('neighbor');
      expect(F.offer('neighbor')?.id).toBe('hen');
      F.run('fv:hen:yes', 'neighbor');
      expect(lost.state).toBe('wander');
      expect(F.favorChoices('elder', new Set()).find((c) => c.id === 'fv:hen:where')?.label).toContain('芦花鸡');
      expect(F.run('fv:hen:where', 'elder')?.text).toContain('竹林');
      lost.state = 'back';
      F.tick(1);
      expect(F.fm('hen')?.s).toBe('half');
      F.run('fv:hen:report', 'neighbor');
      expect(F.fm('hen')?.s).toBe('done');
      expect(k.bag.count('egg')).toBe(2);
      expect(F.run('fv:hen:report', 'neighbor')).toBeNull();
      expect(k.bag.count('egg')).toBe(2);
    } finally { FAUNA.hens = null; }
  });
  it('存档读回来认得；坏了的存档不碍事', () => {
    const { k, F } = fakeWorld();
    F.meet('elder'); F.addV('elder', 8);
    const raw = JSON.parse(JSON.stringify(k.mem.get('folk', null)));
    const mem = new Mem({ folk: raw });
    expect(folkOf({ ...k, mem, bag: new Bag(mem) } as never).level('elder')).toBe(3);
    const F3 = folkOf({ ...k, mem: new Mem({ folk: { p: { elder: 'x', farmer: { n: 'a', v: null } }, f: { tea: { s: 'weird' } } } }) } as never);
    expect(F3.level('elder')).toBe(0);
    expect(F3.fm('tea')).toBeNull();
  });
});

// —— 送东西：送什么、一回送多少、用处里说的谁要什么，与名册对得上 ——
describe('送东西与用处', () => {
  const liked = (id: string, item: string) => !!FOLK.find((f) => f.id === id)?.likes.includes(item);
  it('送得出去的都是登记过的东西；名册里有人喜欢的、有人不肯收的、有专门的话的，都送得出去', () => {
    for (const id of Object.keys(GIFTS)) expect(ITEMS[id]?.name, `GIFTS 里的 ${id}`).toBeTruthy();
    for (const f of FOLK) for (const l of f.likes) if (ITEMS[l] && l !== 'coin') expect(GIFTS[l], `${f.name}喜欢的 ${l} 送不出去`).toBeTruthy();
    for (const [id, m] of Object.entries(META)) for (const n of m.no ?? []) expect(GIFTS[n], `${id} 不收的 ${n} 本来就送不出去`).toBeTruthy();
    for (const [id, B] of Object.entries(BOOKS)) for (const it of Object.keys(B.got ?? {})) expect(GIFTS[it], `${id} 收到 ${it} 的话用不上`).toBeTruthy();
    for (const id of ['water', 'coin', 'sheaf', 'milletEar', 'gu']) expect(GIFTS[id], `${id} 不该送人`).toBeUndefined();
  });
  it('一回送多少是正经的数（一到四），先生递的那句短、有标点、没有 ASCII', () => {
    for (const [id, g] of Object.entries(GIFTS)) {
      expect(g.n, id).toBeGreaterThanOrEqual(1); expect(g.n, id).toBeLessThanOrEqual(4);
      if (g.say) { expect(len(g.say), id).toBeLessThanOrEqual(22); expect(g.say, id).toMatch(/[。！]$/); expect(g.say, id).not.toMatch(/[\x00-\x7f]/); }
    }
  });
  it('用处里说到的人都在名册里，说他要这个的，他真的喜欢（或有收到它的话、或不肯收）', () => {
    const bad: string[] = [];
    for (const [item, t] of Object.entries(ITEM_USES)) {
      for (const r of refs(t)) {
        if (!IDS.has(r)) { bad.push(`${item}：{${r}} 不在名册里`); continue; }
        if (!liked(r, item) && !BOOKS[r]?.got?.[item] && !META[r]?.no?.includes(item)) bad.push(`${item}：用处里说 ${nameOf(r)}，名册里他不喜欢 ${item}`);
      }
      expect(useOf(item), item).not.toMatch(/[{}]/);
    }
    expect(bad).toEqual([]);
  });
  it('送他东西（几个）：一回交出那么多；先知道他收不收、要交几个；他回赠的先进行囊、到手才浮字', () => {
    const { k, F } = fakeWorld();
    const bagNotes: string[] = [];
    k.bag.onNote = (t) => bagNotes.push(t);
    F.meet('farmwife');
    k.bag.add('egg', 6, { quiet: true });
    expect(F.plan('farmwife', 'egg', 4)).toEqual({ kind: 'like', n: 4 });
    expect(F.give('farmwife', 'egg', 4).kind).toBe('like');
    expect(k.bag.count('egg')).toBe(2);
    F.drainGot();                                                    // 她也许回赠了一把青菜
    k.bag.add('flower', 1, { quiet: true });
    expect(F.plan('farmer', 'flower', 1).kind).toBe('no');
    expect(F.plan('monk', 'egg', 2).kind).toBe('no');
    // 熟了回赠：东西已经在行囊里，先不浮「得……」，说话那一路递到手时再说
    F.addV('elder', 6); F.meet('elder');
    k.bag.add('tea', 1, { quiet: true });
    const r0 = Math.random; Math.random = () => 0.1;
    try { const r = F.give('elder', 'tea', 1); expect(r.back?.item).toBe('jujube'); } finally { Math.random = r0; }
    expect(k.bag.count('jujube')).toBe(1);
    expect(bagNotes.some((n) => n.startsWith('得枣'))).toBe(false);
    expect(F.drainGot()).toEqual([{ item: 'jujube', n: 1 }]);
    expect(F.drainGot()).toEqual([]);
  });
  it('托事交东西那一枚签：交的是哪样、几个；办成了的回礼等递到手', () => {
    const { k, F } = fakeWorld({ hour: 9 });
    (k.life.npcs.elder as { act?: string }).act = 'sit';
    F.meet('elder');
    F.run('fv:tea:yes', 'elder');
    expect(F.handInfo('fv:tea:hand', 'elder')).toBeNull();          // 还没有茶
    k.bag.add('tea', 1, { quiet: true });
    expect(F.handInfo('fv:tea:hand', 'elder')).toEqual({ item: 'tea', n: 1 });
    expect(F.handInfo('fv:tea:hand', 'farmer')).toBeNull();
    F.run('fv:tea:hand', 'elder');
    expect(F.drainGot()).toEqual([{ item: 'jujube', n: 1 }]);
    // 两尾鱼的托事：从「送东西」里挑鱼，要交两尾
    F.addV('keeper', 5); F.meet('keeper');
    F.run('fv:fish:yes', 'keeper');
    k.bag.add('fish', 3, { quiet: true });
    expect(F.plan('keeper', 'fish', 1)).toEqual({ kind: 'favor', n: 2 });
  });
});

// —— 你是外乡来的客人（男客或女客）：草堂的主人邵先生出门访友，托你照看草堂、园子和借你种的两畦地 ——
describe('你是外乡来的客人', () => {
  /** 话里还许说「先生」的几种：邵先生（草堂的主人）、赵先生（塾师）、郑先生（客）、孩子们说塾师的「我们先生」、说书先生、念书念成了先生 */
  const SIR = /邵先生|赵先生|郑先生|我们先生|说书先生|教书先生|成了先生/g;
  const stray = (t: string) => t.replace(SIR, '').includes('先生');
  /** 村里人说的、你说的（签上的字）、名册上给人看的 */
  function everything(): Array<[string, string]> {
    const out = allTexts();
    for (const l of LINES) { out.push([`LINES.${l.id}`, l.text]); if (l.reply) out.push([`LINES.${l.id}.你接`, l.reply]); }
    for (const f of FOLK) {
      out.push([`folk.${f.id}.call`, f.call], [`folk.${f.id}.role`, f.role], [`folk.${f.id}.temper`, f.temper]);
      for (const x of f.likes) out.push([`folk.${f.id}.likes`, x]);
      for (const s of f.plan) out.push([`folk.${f.id}.plan`, s.doing]);
    }
    return out;
  }
  it('话里不再把你叫「先生」：只剩邵先生、塾师、客的名字、孩子们说的「我们先生」；也没有旧写法 {先生}', () => {
    expect(everything().filter(([, t]) => stray(t)).map(([w, t]) => `${w}：${t}`)).toEqual([]);
  });
  it('说话、托事两处代码里垫着的话也一样', () => {
    for (const f of ['../src/world/acts/talk.ts', '../src/world/acts/favor.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      const strs = [...src.matchAll(/'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2]);
      expect(strs.filter(stray), f).toEqual([]);
    }
  });
  it('叫法写得规矩：一样，或「男客|女客」一对；熟到各档至多四样', () => {
    const ok = /^[一-龥]{1,4}(\|[一-龥]{1,4})?$/;
    for (const f of FOLK) {
      expect(f.call, `${f.id} 的 call`).toMatch(ok);
      for (const c of BOOKS[f.id].calls ?? []) expect(c, `${f.id} 的 calls`).toMatch(ok);
      expect((BOOKS[f.id].calls ?? []).length, f.id).toBeLessThanOrEqual(4);
    }
  });
  it('每个人对男客、女客各有叫法，四档情分都叫得出；几乎人人男女叫法不同，全村叫法各样', () => {
    const differ: string[] = [], all = new Set<string>();
    for (const f of FOLK) {
      for (const lv of [0, 1, 2, 3, 4]) for (const sex of ['m', 'f'] as const) {
        const c = callOf(f.id, lv, sex);
        expect(c, `${f.id} ${lv} ${sex}`).toMatch(/^[一-龥]{1,4}$/);
        expect(stray(c), `${f.id} 叫你「${c}」`).toBe(false);
        all.add(c);
      }
      if ([1, 2, 3, 4].some((lv) => callOf(f.id, lv, 'm') !== callOf(f.id, lv, 'f'))) differ.push(f.id);
    }
    expect(differ.length, '男女叫法不同的人').toBeGreaterThanOrEqual(FOLK.length - 2);
    expect(all.size, '全村有几样叫法').toBeGreaterThanOrEqual(15);
    expect([callOf('monk', 1, 'm'), callOf('monk', 1, 'f')]).toEqual(['施主', '女施主']);
    // 熟了改口：李公知交时叫男客「老弟」
    expect(callOf('elder', 4, 'm')).not.toBe(callOf('elder', 1, 'm'));
    // 不知道是男是女（没选过人）就当男客
    expect(callOf('farmer', 1)).toBe(callOf('farmer', 1, 'm'));
  });
  it('话里的 {你}、{他|她} 按男女换干净：每个人的每句话，男客女客、初识知交，都不剩括号与竖线', () => {
    expect(fill('{你}好，{他|她}来了。', '娘子', 'f')).toBe('娘子好，她来了。');
    expect(fill('{你}好，{他|她}来了。', '郎君', 'm')).toBe('郎君好，他来了。');
    expect(fill('{你}慢走，{farmer}在地里。', '后生|闺女', 'f')).toBe(`闺女慢走，${nameOf('farmer')}在地里。`);
    expect(fill('{先生}慢走。', '后生', 'm')).toBe('后生慢走。');                  // 旧写法也认
    for (const sex of ['m', 'f'] as const) for (const id of Object.keys(BOOKS)) for (const lv of [1, 4]) {
      const you = callOf(id, lv, sex), P = person(id)!;
      const kind = P.kind ? LINES.filter((l) => l.who === P.kind).flatMap((l) => [l.text, l.reply ?? '']) : [];
      for (const t of [...linesOf(id).flatMap(({ l }) => [text(l), ...(opt(l).back ?? [])]), ...kind]) {
        expect(fill(t, you, sex).replace(/\{物\}/g, ''), `${id} ${sex}：${t}`).not.toMatch(/[{}|]/);
      }
    }
    for (const d of FAVORS) for (const t of [d.ask, d.ok, d.nope, d.thanks]) for (const sex of ['m', 'f'] as const) expect(fill(t, callOf(d.from, 2, sex), sex), d.id).not.toMatch(/[{}|]/);
  });
  it('托事、打听人在哪：他按你是男是女叫你', () => {
    for (const sex of ['m', 'f'] as const) {
      const { k, F } = fakeWorld({ hour: 9, sex });
      (k.life.npcs.elder as { act?: string }).act = 'sit';
      F.meet('elder');
      const ask = F.run('fv:tea:ask', 'elder')!;
      expect(ask.text, sex).toContain(callOf('elder', 1, sex));
      expect(stray(ask.text) || /[{}|]/.test(ask.text), ask.text).toBe(false);
      expect(F.you('elder')).toBe(callOf('elder', 1, sex));
    }
    // 打听人在哪：问到他家里人，他说「X 去那边找」
    for (const sex of ['m', 'f'] as const) {
      const { F } = fakeWorld({ hour: 15, sex });
      F.meet('farmwife');
      F.run('fv:home:yes', 'farmwife');
      F.meet('farmer');
      const t = F.run('fv:home:where', 'farmer')!;
      expect(t.text, sex).toContain(callOf('farmer', 1, sex));
      expect(stray(t.text), t.text).toBe(false);
    }
  });
  it('村人簿上「他叫你什么」是此刻的叫法（按男女取好）', () => {
    for (const sex of ['m', 'f'] as const) {
      const { k, F } = fakeWorld({ sex });
      F.meet('elder');
      const card = folkView(k as never).find((c) => c.id === 'elder')!;
      expect(card.you).toBe(callOf('elder', 1, sex));
      expect(card.you).not.toMatch(/\|/);
    }
  });
});
