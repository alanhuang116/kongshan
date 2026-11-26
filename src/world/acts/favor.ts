/**
 * 人情：村里人记着你——说过几回话、上回是哪一日、送过他什么、帮他办过什么；熟到几分（初识、相熟、相得、知交）；
 * 托你的事办到了哪一步。都存在 k.mem 的 'folk' 那一份里（界面存到本机）。
 *
 *   const F = folkOf(k);
 *   F.level('farmer')              // 0 未识 1 初识 2 相熟 3 相得 4 知交
 *   F.meet('farmer')               // 说了一回话（一天里头一回说话，情分添一分）
 *   F.plan('farmer', 'egg', 4)     // 送这个会怎样（先不动行囊：递东西的动作要先知道他收不收、交几个）
 *   F.give('farmer', 'egg', 4)     // 送他四个鸡蛋（合心意的添两分，平常的一分；一天只算一回）
 *   F.drainGot()                   // 他这一阵给你的东西（回赠、见面塞的、讨来的、回礼）：已经在行囊里了，说话那一路拿去一样样递过来、到手再浮字
 *   F.you('farmer')                // 他此刻怎么叫你（看情分、看你是男客女客：callOf）
 *   F.favorChoices('farmer', …)    // 此刻跟他说得上的托事（交东西、讨东西、带话、回话、打听人）
 *   folkView(k)                    // 村人簿：全村的人，各人此刻在哪做什么、今天的日程、情分、喜好、托事
 *
 * 你是外乡来的客人（k.persona.sex：男客 'm'、女客 'f'）：草堂的主人邵先生出门访友去了，把草堂、园子和借你种的两畦地托给你照看。
 * 村里人怎么叫你看情分、看男女（callOf）；话里的 {你}、{他|她} 在 fill 里换。
 * 名册（谁、叫什么、住哪、家里有谁、每天做什么）在 src/data/folk.ts（村人那一路写）；那份不在时用 src/data/talk2.ts 的 META 垫着。
 * 托事的话与条件在 src/data/favors.ts。说话在 talk.ts。
 * 本文件的 create(k) 交出托事里要用的一件小事：「守网」（渔父托你看着岸上晒的网）。
 *
 * 给村人那一路的接口：每个村人的 root.userData.bond 是他和你的情分（0…4）；相得以上、你走到他十几米内时 userData.wave 为真
 * （该远远招一招手，一天一回）。Npc 上若有 wave(行者的位置) 方法，那一刻也会调它。
 */
import * as THREE from 'three';
import type { Anlewo, NpcLike } from '../Anlewo';
import type { Season } from '../env/atmos';
import { ITEMS, defineItems } from '../bag';
import { PLACES, SITE, placeId } from '../site';
import { groundAt, standable } from '../walk';
import { FAVORS, FAVOR_ITEMS, type FavorDef } from '../../data/favors';
import { BOOKS as TALK, META, type Meta } from '../../data/talk2';
import { backN } from '../../data/itemUses';
import type { Act } from './types';

defineItems(FAVOR_ITEMS);

// ———————————————————————— 名册 ————————————————————————
/** 名册里的一个人（src/data/folk.ts 的 FOLK）；call 是他怎么称呼你（「后生|闺女」：对男客、女客两样叫法） */
export interface FolkDef { id: string; name: string; call?: string; role?: string; age?: number; sex?: string; home?: string; family?: string[]; temper?: string; likes?: string[]; plan?: PlanStep[] }
/** 一天里的一段：from 点到 to 点，在哪、做什么；seasons 只在这几季；weather 只在晴天（fair）或雨雪天（wet）；act 是那件事在村人脚本里的名字 */
export interface PlanStep { from: number; to: number; where: string; doing: string; seasons?: string[]; weather?: 'fair' | 'wet'; act?: string }
const SRC = import.meta.glob<Record<string, unknown>>('../../data/folk.ts', { eager: true });
const MOD: Record<string, unknown> = Object.values(SRC)[0] ?? {};
const FOLK: FolkDef[] = Array.isArray(MOD.FOLK) ? (MOD.FOLK as FolkDef[]).filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string') : [];
type PlanNow = (id: string, hour: number, season: Season, wet: boolean) => unknown;
const PLAN_NOW = typeof MOD.planNow === 'function' ? (MOD.planNow as PlanNow) : null;
/** 生灵那一路给的接口（走散的母鸡）；没有就是 null */
const FAUNA_SRC = import.meta.glob<Record<string, unknown>>('../life/fauna/api.ts', { eager: true });
interface HensLike { stray(x?: number, z?: number): { x: number; z: number }; readonly lost: { readonly state: string; readonly pos: THREE.Vector3; readonly home: { x: number; z: number } } }
const hens = (): HensLike | null => { const F = Object.values(FAUNA_SRC)[0]?.FAUNA as { hens?: HensLike | null } | undefined; return F?.hens ?? null; };

/** 各家：屋的 id → 叫什么 */
const HOUSES: Record<string, string> = { a: '甲家（王家）', b: '乙家（李家）', d: '丁家（赵家）', e: '戊家（孙家酒家）', f: '己家（陈篾匠家）', g: '庚家（陶家）' };
/**
 * 各家门口：与 life/spots.ts 的 door() 同一个算法（build/village.ts：甲正中，乙偏西，丁偏东，戊偏西，己庚正中；门在正面外 0.45 米）。
 * 不直接引那个文件：那边正在改，这里只要一个大概的门口。
 */
const DOOR_X: Record<string, number> = { a: 0, b: -0.9, d: 0.8, e: -0.7 };
function doorOf(id: string): { x: number; z: number } | null {
  const h = SITE.houses.find((x) => x.id === id);
  if (!h) return null;
  const lx = DOOR_X[id] ?? 0, lz = h.d / 2 + 0.45, c = Math.cos(h.yaw), s = Math.sin(h.yaw);
  return { x: h.x + lx * c + lz * s, z: h.z - lx * s + lz * c };
}
/** 渡口岸上的晒网架（总图上的位置；渔父补网时站在它东南边） */
const RACK = SITE.more.netRack as { x: number; z: number };

/** 一个村人：名册与本应用垫着的那份合在一起 */
export interface Person {
  id: string; name: string;
  /** 他怎么称呼你：名册的 call 原样（「后生|闺女」男客、女客两样；行脚僧「施主|女施主」）。此刻真叫的是哪一样，用 callOf */ you: string;
  /** 身份（名册里那一句）、短的（「农夫」，标题、面板上用） */ role: string; tag: string;
  age: number | null; sex: string | null;
  /** 住哪：屋的 id（a b d e）或「村外」「渔船」；homeText 是说给人听的（「甲家（王家）」「南山里」） */ home: string; homeText: string;
  /** 家里人（别人的 id） */ family: string[];
  temper: string;
  /** 喜欢的（ITEMS 的 id 或几个字）、不肯收的、会回赠的（ITEMS 的 id） */ likes: string[]; no: string[]; gives: string[];
  plan: PlanStep[];
  /** 他家门口在哪（村里四家）；住在村外的是 null */ door: { x: number; z: number } | null;
  /** 他的话从 src/data/talk.ts 的 LINES 里哪一种取（farmer kid elder……）；没有是 null */ kind: string | null;
}
/** 名册里没写怎么叫你时：叫一声「客人」（男客女客都一样） */
const YOU = '客人';
const str = (v: unknown, fb = ''): string => (typeof v === 'string' && v.trim() ? v.trim() : fb);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []);
const steps = (v: unknown): PlanStep[] => (Array.isArray(v) ? v.filter((s): s is PlanStep => !!s && typeof s === 'object' && Number.isFinite((s as PlanStep).from) && Number.isFinite((s as PlanStep).to) && typeof (s as PlanStep).doing === 'string') : []);
let cache: Map<string, Person> | null = null;
/** 全村的人（名册里有的；名册不在时用垫着的那份） */
export function people(): Person[] { return [...roster().values()]; }
export function person(id: string): Person | null { return roster().get(id) ?? null; }
function roster(): Map<string, Person> {
  if (cache) return cache;
  cache = new Map();
  const ids = FOLK.length ? FOLK.map((f) => f.id) : Object.keys(META).filter((id) => META[id].name);
  for (const id of ids) {
    const f = FOLK.find((x) => x.id === id), m: Meta = META[id] ?? {};
    const name = str(f?.name, m.name ?? id), role = str(f?.role, m.role ?? ''), plan = f?.plan ? steps(f.plan) : m.plan ?? [];
    const home = str(f?.home, m.home ?? '');
    // 住在村外的：名册里「在家」那几段写着他家在哪（南山里、渡口的船上……）
    const away = plan.find((s) => !s.act && s.where && !/家里$/.test(s.where))?.where ?? '';
    cache.set(id, {
      id, name, you: str(f?.call, m.you ?? YOU), role, tag: m.tag ?? (role.split(/[（，(、]/)[0] || name),
      age: typeof f?.age === 'number' ? f.age : m.age ?? null, sex: str(f?.sex, m.sex ?? '') || null,
      home, homeText: HOUSES[home] ?? (away || home || '村外'),
      family: f?.family ? strs(f.family) : m.family ?? [], temper: str(f?.temper, m.temper ?? ''),
      likes: f?.likes ? strs(f.likes) : m.likes ?? [], no: m.no ?? [], gives: m.gives ?? [],
      plan, door: HOUSES[home] ? doorOf(home) : null, kind: m.kind ?? null,
    });
  }
  return cache;
}
/** 名册是村人那一路写的那份（不是垫着的） */
export const rosterIsReal = () => FOLK.length > 0;

// ———————————————————————— 时辰 ————————————————————————
const BR = '子丑寅卯辰巳午未申酉戌亥';
/** 几点 → 时辰的字（「辰」） */
export const branch = (h: number) => BR[Math.floor(((((h % 24) + 24) % 24 + 1) % 24) / 2)];
/** 几点 → 家常的说法（清早、上午、晌午、后晌、傍晚、夜里） */
export function hourWord(h: number): string {
  h = ((h % 24) + 24) % 24;
  return h < 4.5 ? '后半夜' : h < 7 ? '清早' : h < 11 ? '上午' : h < 13 ? '晌午' : h < 17 ? '后晌' : h < 19.5 ? '傍晚' : '夜里';
}
/** 这一段合不合此刻的时令与晴雨 */
const fits = (s: PlanStep, season: Season, wet: boolean) => (!s.seasons?.length || s.seasons.includes(season)) && (!s.weather || (s.weather === 'wet') === wet);
/** 今天（这一季、此刻的晴雨）他的日程，按钟点排 */
export function today(p: Person, season: Season, wet: boolean): PlanStep[] { return p.plan.filter((s) => fits(s, season, wet)).sort((a, b) => a.from - b.from); }
/** 此刻（几点）他照日程该在哪、做什么（在家那几段也算） */
export function stepAt(p: Person, hour: number, season: Season, wet: boolean): PlanStep | null {
  if (PLAN_NOW) {
    try {
      const r = PLAN_NOW(p.id, hour, season, wet) as Partial<PlanStep> | null;
      if (r && typeof r === 'object' && typeof r.doing === 'string') return { from: r.from ?? hour, to: r.to ?? hour, where: r.where ?? '', doing: r.doing, act: r.act };
    } catch { /* 名册那边算不出来就自己算 */ }
  }
  return today(p, season, wet).find((s) => hour >= s.from && hour < s.to) ?? null;
}
/** 此刻之后，他下一回出门（有事做的那一段）是几点、去哪 */
export function nextStep(p: Person, hour: number, season: Season, wet: boolean): PlanStep | null {
  return today(p, season, wet).find((s) => s.from > hour && !!s.act) ?? null;
}
export const wetNow = (k: Anlewo) => k.atmos.w.rain > 0.5 || k.atmos.w.snow > 0.5;

// ———————————————————————— 记着的事 ————————————————————————
/** k.mem 'folk' 这一份的样子 */
export interface FolkMem {
  /** 各人记着你的事：村人 id → */
  p: Record<string, PMem>;
  /** 托事办到哪一步：托事 id → */
  f: Record<string, FMem>;
  /** 草堂书案上最近写成的那两句（念给说书的听、贴门时用） */
  poem?: { lines: string[]; source: string };
}
export interface PMem {
  /** 说过几回话 */ n: number;
  /** 头一回、上一回说话是第几日（k.day）；上一回是画里几点 */ d0: number; d: number; h: number;
  /** 情分的底子（只在这里用；界面上只说「相熟」这样的几个字） */ v: number;
  /** 上回因为说话、因为送东西添情分是第几日（一天各只算一回） */ vd: number; gd: number;
  /** 送过他什么（物品 id → 几回）；他回赠过你什么 */ gift: Record<string, number>; got: Record<string, number>;
  /** 你已经知道他喜欢的（物品 id） */ know: string[];
  /** 帮他办成的事（托事 id） */ help: string[];
  /** 上回远远招手、上回见面就塞东西给你，是第几日 */ wd: number; rd: number;
}
export interface FMem {
  /** on 接下了 · half 办了一半（东西讨到了、事做过了、话带到了，还没回去说） · done 办成了 · no 推辞过（过一日他还会再提） */
  s: 'on' | 'half' | 'done' | 'no';
  /** 那一步是第几日 */ d: number;
}
export const BONDS = ['未识', '初识', '相熟', '相得', '知交'] as const;
/** 情分的底子到多少算哪一档：说一天话一分，送对了东西两分，办成一件托事三分 */
const STEPS = [3, 7, 12];
const num = (v: unknown, fb = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
const rec = (v: unknown): Record<string, number> => Object.fromEntries(Object.entries(v && typeof v === 'object' ? (v as Record<string, unknown>) : {}).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n > 0)) as Record<string, number>;
function cleanP(v: unknown): PMem {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { n: Math.max(0, Math.floor(num(o.n))), d0: num(o.d0, -1), d: num(o.d, -1), h: num(o.h, 0), v: Math.max(0, num(o.v)), vd: num(o.vd, -1), gd: num(o.gd, -1), gift: rec(o.gift), got: rec(o.got), know: strs(o.know), help: strs(o.help), wd: num(o.wd, -1), rd: num(o.rd, -1) };
}
function cleanMem(raw: unknown): FolkMem {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p: Record<string, PMem> = {}, f: Record<string, FMem> = {};
  for (const [id, v] of Object.entries(o.p && typeof o.p === 'object' ? (o.p as Record<string, unknown>) : {})) p[id] = cleanP(v);
  for (const [id, v] of Object.entries(o.f && typeof o.f === 'object' ? (o.f as Record<string, unknown>) : {})) {
    const s = (v as FMem)?.s;
    if (s === 'on' || s === 'half' || s === 'done' || s === 'no') f[id] = { s, d: num((v as FMem).d, 0) };
  }
  const pm = o.poem as FolkMem['poem'];
  const poem = pm && Array.isArray(pm.lines) && pm.lines.every((l) => typeof l === 'string') ? { lines: pm.lines.slice(0, 4), source: str(pm.source) } : undefined;
  return { p, f, ...(poem ? { poem } : {}) };
}

// ———————————————————————— 托事那边交回来的一步 ————————————————————————
/** 你说的一句、他答的一句；还要不要接着问「答应不答应」 */
export interface Turn { said: string; text: string; lines?: string[]; source?: string; yesno?: { yes: string; no: string; fid: string }; glad?: boolean }
export interface FavorChoice { id: string; label: string; sub?: string; main?: boolean }
export interface GiveResult {
  /** like 合他心意 · ok 平常收下 · no 推辞了（东西没拿走） · favor 正是他托你找的 */
  kind: 'like' | 'ok' | 'no' | 'favor';
  /** 回赠的东西 */ back: { item: string; n: number } | null;
  /** 托事那边的一步（kind 为 favor 时） */ turn: Turn | null;
  /** 头一回知道他喜欢这个 */ learned: boolean;
}

/** 「郎君|娘子」这样一对：男客取前一半，女客取后一半；没有「|」就是男女一样（不知道男女就当男客） */
export function bySex(s: string, sex?: string): string {
  const i = s.indexOf('|');
  return i < 0 ? s : sex === 'f' ? s.slice(i + 1) : s.slice(0, i);
}
/**
 * 他此刻怎么叫你：情分到了哪一档（lv 0…4，未识也按初识叫）——talk2.ts 里他的 calls（初识、相熟、相得、知交各一样），
 * 没给就用名册的 call；再看你是男客还是女客（sex：'m' | 'f'，即 k.persona.sex）。
 */
export function callOf(id: string, lv: number, sex?: string): string {
  const raw = TALK[id]?.calls?.[Math.max(0, lv - 1)] ?? person(id)?.you ?? YOU;
  return bySex(raw, sex);
}
/**
 * 一句话里的「{某人的 id}」换成那人的名字（王大、老刘……）；「{你}」换成他此刻怎么叫你（you，callOf 取好的）；
 * 「{他|她}」「{后生|小娘子}」这样用「|」隔开的一对，按你是男客（sex 'm'）还是女客（'f'）取一半。
 * 旧写法「{先生}」也认，当作「{你}」。
 */
export function fill(text: string, you = YOU, sex = 'm'): string {
  return text
    .replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, m: string, f: string) => (sex === 'f' ? f : m))
    .replace(/\{([a-zA-Z0-9_]+|你|先生)\}/g, (_, id: string) => (/^\w+$/.test(id) ? person(id)?.name ?? '' : bySex(you, sex)));
}

const BOOKS = new WeakMap<Anlewo, FolkBook>();
/** 这一个世界里的人情账（各处共用一份） */
export function folkOf(k: Anlewo): FolkBook {
  let b = BOOKS.get(k);
  if (!b) { b = new FolkBook(k); BOOKS.set(k, b); }
  return b;
}

export class FolkBook {
  private m: FolkMem;
  /** 正在做的那件事（托事里「去做一件事」的，看它做了多久；草堂里煮茶、写诗，看做成了没有） */
  private cur: { act: Act; t0: number; night: boolean; tea: number; poem: number; brewed: boolean; wrote: boolean } | null = null;
  /** 托事要的东西带上了没有（带上那一刻提一句） */
  private had = new Map<string, boolean>();
  /** 村里人这一阵给你的东西：已经进了行囊（先不浮字），等说话那一路真递到你手里再说「得……」 */
  private recv: Array<{ item: string; n: number; t: number }> = [];
  private t = 0; private acc = 0;
  constructor(private k: Anlewo) {
    this.m = cleanMem(k.mem.get<unknown>('folk', null));
    for (const d of FAVORS) if (this.m.f[d.id]?.s === 'on' && d.goal.kind === 'bring') this.had.set(d.id, this.hasAny(d.goal.items));
  }
  private save() { this.k.mem.set('folk', this.m); }
  get day() { return this.k.day; }
  /** 他记着你的那一份（没有就是一份空的，还没存） */
  pm(id: string): PMem { return this.m.p[id] ?? cleanP(null); }
  private own(id: string): PMem { return (this.m.p[id] ??= cleanP(null)); }
  level(id: string): number {
    const p = this.m.p[id];
    if (!p || p.n <= 0) return 0;
    return 1 + STEPS.filter((s) => p.v >= s).length;
  }
  bondName(id: string): string { return BONDS[this.level(id)]; }
  /** 你是男客还是女客（选人那一页定的；没定就当男客） */
  get sex(): 'm' | 'f' { return this.k.persona?.sex === 'f' ? 'f' : 'm'; }
  /** 他此刻怎么叫你（看情分、看男女） */
  you(id: string): string { return callOf(id, this.level(id), this.sex); }
  /** 他（id）说的一句、你对他说的签：{你} 换成他怎么叫你，{他|她} 按男女，{某人} 换成名字 */
  private say(t: string, id: string): string { return fill(t, this.you(id), this.sex); }
  /** 最近在书案上写成的两句 */
  get poem() { return this.m.poem ?? null; }
  /** 添几分情分；够了一档就轻轻提一句 */
  addV(id: string, n: number) {
    if (!(n > 0)) return;
    const before = this.level(id), p = this.own(id);
    p.v += n;
    const after = this.level(id);
    if (after > before && before >= 1) {
      const name = person(id)?.name ?? id;
      this.k.note(after === 2 ? `与${name}相熟了` : after === 3 ? `与${name}相得` : `与${name}成了知交`, 'folk');
    }
  }
  /** 走过去作揖、说起话来了：记一回（一天里头一回说话添一分）。first 头一回说话；again 今天说过了；gap 隔了几天 */
  meet(id: string): { first: boolean; again: boolean; gap: number } {
    const p = this.own(id), first = p.n === 0, gap = p.d < 0 ? 0 : this.day - p.d, again = p.d === this.day;
    p.n++; if (p.d0 < 0) p.d0 = this.day;
    p.d = this.day; p.h = this.k.atmos.hour;
    if (p.vd !== this.day) { p.vd = this.day; this.addV(id, 1); }
    this.save();
    return { first, again, gap };
  }
  /** 知道了他喜欢这样东西 */
  learn(id: string, item: string): boolean { const p = this.own(id); if (p.know.includes(item)) return false; p.know.push(item); this.save(); return true; }

  /**
   * 送这样东西会怎样（先不动行囊、不记账）：递东西的动作要先知道他收不收、到底交几个。
   * kind 与 give 的一样；n 是真要交出去几个（正是托他找的，就交托事要的那么多：两尾鱼就是两尾）
   */
  plan(id: string, item: string, n = 1): { kind: GiveResult['kind']; n: number } {
    for (const d of FAVORS) if (this.handable(d, id) && this.wants(d, item)) return { kind: 'favor', n: this.needN(d) };
    const P = person(id);
    if (P?.no.includes(item) || !this.k.bag.has(item)) return { kind: 'no', n };
    return { kind: P?.likes.includes(item) ? 'like' : 'ok', n: Math.max(1, Math.min(n, this.k.bag.count(item))) };
  }
  /**
   * 送他东西（n 个，不够就有多少送多少）：从行囊里拿出去（推辞的不拿），记下来，添情分；熟了的多半回赠一样。
   * 是他托你找的那样东西，就当托事办成（kind 为 favor）。回赠的已经进了行囊，先不浮字（见 drainGot）。
   */
  give(id: string, item: string, n = 1): GiveResult {
    const k = this.k, P = person(id);
    for (const d of FAVORS) {
      if (this.handable(d, id) && this.wants(d, item)) { const turn = this.hand(d, item); if (turn) return { kind: 'favor', back: null, turn, learned: false }; }
    }
    if (P?.no.includes(item) || !k.bag.has(item)) return { kind: 'no', back: null, turn: null, learned: false };
    k.bag.take(item, Math.max(1, Math.min(Math.floor(n) || 1, k.bag.count(item))), { verb: '送出' });
    const p = this.own(id), like = !!P?.likes.includes(item);
    p.gift[item] = (p.gift[item] ?? 0) + 1;
    if (p.gd !== this.day) { p.gd = this.day; this.addV(id, like ? 2 : 1); }
    const learned = like ? this.learn(id, item) : false;
    // 回赠：相熟以后，合心意的多半回一样，平常的偶尔；一天只回一回
    let back: GiveResult['back'] = null;
    const lv = this.level(id), gives = (P?.gives ?? []).filter((g) => ITEMS[g] && g !== item);
    if (lv >= 2 && gives.length && p.rd !== this.day && Math.random() < (like ? 0.75 : 0.3)) {
      const g = gives[Math.floor(Math.random() * gives.length)], got = this.receive(g, backN(g));
      if (got > 0) { back = { item: g, n: got }; p.got[g] = (p.got[g] ?? 0) + 1; p.rd = this.day; }
    }
    this.save();
    return { kind: like ? 'like' : 'ok', back, turn: null, learned };
  }
  /** 相得以上的人，见面就塞一样东西给你（一天至多一回）：给了返回那样东西的 id（已在行囊里，先不浮字） */
  treat(id: string): string | null {
    const P = person(id), p = this.own(id);
    if (this.level(id) < 3 || p.rd === this.day || Math.random() > 0.45) return null;
    const gives = (P?.gives ?? []).filter((g) => ITEMS[g]);
    if (!gives.length) return null;
    const g = gives[Math.floor(Math.random() * gives.length)];
    if (this.receive(g, backN(g)) <= 0) return null;
    p.rd = this.day; p.got[g] = (p.got[g] ?? 0) + 1; this.save();
    return g;
  }
  /** 村里人给你的东西收进行囊：先不浮「得……」，记下来等说话那一路递到手里（返回收了几个） */
  private receive(item: string, n: number): number {
    const got = this.k.bag.add(item, n, { quiet: true, later: true });
    if (got > 0) this.recv.push({ item, n: got, t: this.t });
    return got;
  }
  /** 交出这一阵村里人给你的东西（说话那一路拿去一样样递过来；递到手时它调 bag.announce） */
  drainGot(): Array<{ item: string; n: number }> {
    const out = this.recv.map(({ item, n }) => ({ item, n }));
    this.recv.length = 0;
    return out;
  }
  /** 托事里「交东西」那一枚签（fv:某事:hand）要交的是哪一样、几个；此刻交不了是 null */
  handInfo(cmd: string, id: string): { item: string; n: number } | null {
    const [, fid, what] = cmd.split(':'), d = this.def(fid);
    if (!d || what !== 'hand' || !this.handable(d, id)) return null;
    const item = this.needItem(d);
    return item ? { item, n: this.needN(d) } : null;
  }

  // —— 托事 ——
  fm(fid: string): FMem | null { return this.m.f[fid] ?? null; }
  def(fid: string): FavorDef | null { return FAVORS.find((d) => d.id === fid) ?? null; }
  /** 此刻还在办的 */
  active(): FavorDef[] { return FAVORS.filter((d) => { const s = this.m.f[d.id]?.s; return s === 'on' || s === 'half'; }); }
  private hasAny(items: string[]) { return items.some((i) => this.k.bag.has(i)); }
  /** 这件事要交几个 */
  private needN(d: FavorDef) { const g = d.goal; return g.kind === 'fetch' ? g.n : g.kind === 'bring' ? g.n ?? 1 : 1; }
  /** 这样东西是不是这件事要的、行囊里够不够 */
  private wants(d: FavorDef, item: string): boolean {
    const g = d.goal, list = g.kind === 'bring' ? g.items : g.kind === 'fetch' ? [g.item] : [];
    return list.includes(item) && this.k.bag.count(item) >= this.needN(d);
  }
  /** 这件事要交出去的那样东西（行囊里有的那一样） */
  private needItem(d: FavorDef): string | null {
    const g = d.goal, list = g.kind === 'bring' ? g.items : g.kind === 'fetch' ? [g.item] : [];
    return list.find((i) => this.wants(d, i)) ?? null;
  }
  /** 这件事用得上的人、事、东西都在不在 */
  private ready(d: FavorDef): boolean {
    const k = this.k, n = d.needs, ids = Object.keys(k.acts);
    if (!k.life?.npcs[d.from]) return false;
    if (n?.npcs?.some((id) => !k.life?.npcs[id])) return false;
    if (n?.acts?.some((a) => !ids.some((id) => id === a || id.startsWith(a)))) return false;
    if (n?.items?.some((i) => !ITEMS[i])) return false;
    if (d.goal.kind === 'act') { const acts = d.goal.acts; if (!ids.some((id) => acts.some((a) => id === a || id.startsWith(a)))) return false; }
    if (d.goal.kind === 'hen' && !hens()) return false;
    for (const g of d.gift ?? []) if (!ITEMS[g.item]) return false;
    return true;
  }
  /** 他此刻会不会托你这件事（情分、时辰、时令、晴雨、他在做什么都合得上） */
  private canOffer(d: FavorDef, npc: NpcLike & { act?: string | null }): boolean {
    const st = this.m.f[d.id];
    if (st && (st.s !== 'no' || st.d >= this.day)) return false;
    if (this.level(d.from) < (d.bond ?? 1)) return false;
    if (this.active().length >= 4) return false;
    const w = d.when, a = this.k.atmos;
    if (w?.seasons?.length && !w.seasons.includes(this.k.season)) return false;
    if (w?.from != null && a.hour < w.from) return false;
    if (w?.to != null && a.hour >= w.to) return false;
    if (w?.fair && wetNow(this.k)) return false;
    if (w?.acts?.length) {
      const act = typeof npc.act === 'string' ? npc.act : (() => { const P = person(d.from); return P ? stepAt(P, a.hour, this.k.season, wetNow(this.k))?.act : undefined; })();
      if (!act || !w.acts.includes(act)) return false;
    }
    return this.ready(d);
  }
  /** 他此刻有没有想托你的事 */
  offer(id: string): FavorDef | null {
    const npc = this.k.life?.npcs[id];
    if (!npc) return null;
    return FAVORS.find((d) => d.from === id && this.canOffer(d, npc as NpcLike & { act?: string | null })) ?? null;
  }
  /** 能不能把东西交给他了（托事的人是他、东西在行囊里） */
  private handable(d: FavorDef, id: string): boolean {
    const s = this.m.f[d.id]?.s;
    if (d.from !== id || (s !== 'on' && s !== 'half')) return false;
    return (d.goal.kind === 'bring' || d.goal.kind === 'fetch') && !!this.needItem(d);
  }
  /**
   * 跟他说话时，托事这边有哪几枚签：交东西、半路上的一步（向他讨、给他带话）、回来说一声、打听人（鸡）在哪。
   * asked：这一回说话里已经问过的（不再出）
   */
  favorChoices(id: string, asked: Set<string>): FavorChoice[] {
    const out: FavorChoice[] = [];
    for (const d of FAVORS) {
      const s = this.m.f[d.id]?.s, g = d.goal;
      if (s !== 'on' && s !== 'half') continue;
      if (this.handable(d, id)) { out.push({ id: `fv:${d.id}:hand`, label: this.say(d.hand ?? '东西带来了', id), main: true }); continue; }
      if (g.kind === 'fetch' && g.at === id && s === 'on' && !this.k.bag.has(g.item, g.n)) out.push({ id: `fv:${d.id}:fetch`, label: this.say(g.ask, id), main: true });
      else if (g.kind === 'tell' && g.to === id && s === 'on') out.push({ id: `fv:${d.id}:tell`, label: this.say(g.ask, id), main: true });
      else if ((g.kind === 'act' || g.kind === 'tell' || g.kind === 'hen') && d.from === id && s === 'half') out.push({ id: `fv:${d.id}:report`, label: this.say(g.report, id), main: true });
      else if (s === 'on' && !asked.has(`fv:${d.id}:where`)) {
        // 要找的那个人（那只鸡）：跟别人打听在哪
        if ((g.kind === 'fetch' && g.at !== id && !this.k.bag.has(g.item, g.n)) || (g.kind === 'tell' && g.to !== id)) out.push({ id: `fv:${d.id}:where`, label: `可见着${person(g.kind === 'fetch' ? g.at : g.to)?.name ?? '他'}？` });
        else if (g.kind === 'hen' && hens()?.lost.state === 'wander') out.push({ id: `fv:${d.id}:where`, label: d.from === id ? '鸡平常爱往哪儿钻？' : '可见着一只芦花鸡？' });
      }
    }
    return out;
  }
  /** 点了托事的一枚签：照着做，交回你说的与他答的（话里的 {你} 是他——id——怎么叫你） */
  run(cmd: string, id: string): Turn | null {
    const [, fid, what] = cmd.split(':');
    const d = this.def(fid);
    if (!d) return null;
    const g = d.goal, k = this.k, s = this.m.f[fid]?.s;
    // 签可能是旧的（连点了两下、事已经变了）：这一步此刻不该在这个人这里做，就当没点
    const fresh = !s || s === 'no';
    const ok = what === 'ask' || what === 'yes' || what === 'no' ? d.from === id && fresh
      : what === 'hand' ? this.handable(d, id)
        : what === 'fetch' ? g.kind === 'fetch' && g.at === id && s === 'on'
          : what === 'tell' ? g.kind === 'tell' && g.to === id && s === 'on'
            : what === 'report' ? d.from === id && s === 'half'
              : what === 'where' ? s === 'on' : false;
    if (!ok) return null;
    const say = (t: string) => this.say(t, id);
    if (what === 'ask') return { said: this.level(id) >= 3 ? '什么事？' : '可要帮手？', text: say(d.ask), yesno: { yes: say(d.yes ?? '好，我去'), no: say(d.no ?? '改日吧'), fid } };
    if (what === 'yes') {
      if (g.kind === 'now') {
        this.m.f[fid] = { s: 'done', d: this.day };
        this.finish(d);
        return { said: say(d.yes ?? '好'), text: `${say(d.ok)}\n${say(g.text)}\n${say(d.thanks)}`, glad: true };
      }
      if (g.kind === 'hen') {
        const H = hens();
        if (!H) return { said: say(d.yes ?? '好，我去'), text: say('……咦，它自己回来了。不劳{你}了。') };
        try { if (H.lost.state !== 'wander') H.stray(); } catch (e) { console.warn('鸡没走散成', e); }
      }
      this.m.f[fid] = { s: 'on', d: this.day };
      if (g.kind === 'bring') this.had.set(fid, this.hasAny(g.items));
      this.save();
      k.note(fill(d.note.on), 'favor');
      return { said: say(d.yes ?? '好，我去'), text: say(d.ok) };
    }
    if (what === 'no') {
      this.m.f[fid] = { s: 'no', d: this.day }; this.save();
      return { said: say(d.no ?? '改日吧'), text: say(d.nope) };
    }
    if (what === 'hand') return this.hand(d);
    if (what === 'fetch' && g.kind === 'fetch') {
      if (this.receive(g.item, g.n) <= 0) return { said: say(g.ask), text: say('{你}手上满了，腾出空再来拿。') };
      this.m.f[fid] = { s: 'half', d: this.day }; this.addV(id, 1); this.save();
      if (d.note.half) k.note(fill(d.note.half), 'favor');
      return { said: say(g.ask), text: say(g.reply) };
    }
    if (what === 'tell' && g.kind === 'tell') {
      this.m.f[fid] = { s: 'half', d: this.day }; this.addV(id, 1); this.save();
      if (d.note.half) k.note(fill(d.note.half), 'favor');
      return { said: say(g.ask), text: say(g.reply) };
    }
    if (what === 'report' && (g.kind === 'act' || g.kind === 'tell' || g.kind === 'hen')) {
      this.m.f[fid] = { s: 'done', d: this.day };
      this.finish(d);
      return { said: say(g.report), text: say(d.thanks), glad: true };
    }
    if (what === 'where') {
      if (g.kind === 'hen') {
        const H = hens();
        return { said: d.from === id ? '鸡平常爱往哪儿钻？' : '可见着一只芦花鸡？', text: H && H.lost.state === 'wander' ? henText(H.lost.pos.x, H.lost.pos.z, d.from === id, this.you(id)) : '没瞧见。兴许已经回去了。' };
      }
      const target = g.kind === 'fetch' ? g.at : g.kind === 'tell' ? g.to : null;
      if (!target) return null;
      return { said: `可见着${person(target)?.name ?? '他'}？`, text: whereText(k, target, id) };
    }
    return null;
  }
  /** 把东西交给托事的人（给了是哪一样就交哪一样，不然交行囊里有的那一样） */
  private hand(d: FavorDef, which?: string): Turn | null {
    const item = which && this.wants(d, which) ? which : this.needItem(d);
    if (!item) return null;
    if (!this.k.bag.take(item, this.needN(d), { verb: '交出' })) return null;
    this.m.f[d.id] = { s: 'done', d: this.day };
    this.finish(d);
    // 诗笺：把那两句念出来
    const p = item === 'poem' ? this.m.poem : null;
    return { said: this.say(d.hand ?? '东西带来了', d.from), text: this.say(d.thanks, d.from), lines: p?.lines, source: p?.source, glad: true };
  }
  /** 办成了：记下、添情分、回礼、提一句、记进起居注 */
  private finish(d: FavorDef) {
    const p = this.own(d.from);
    if (!p.help.includes(d.id)) p.help.push(d.id);
    this.addV(d.from, 3);
    for (const g of d.gift ?? []) if (ITEMS[g.item]) { this.receive(g.item, g.n); p.got[g.item] = (p.got[g.item] ?? 0) + g.n; }
    this.save();
    this.k.note(fill(d.note.done), 'favor');
    this.k.log({ kind: 'favor', text: fill(d.name) });
  }

  // —— 每隔一小会儿看一眼：去做的事做完了没有、要的东西带上了没有、走散的鸡送回去了没有；茶煮好、诗写成了，行囊里添一样 ——
  tick(dt: number) {
    this.t += dt; this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const k = this.k, a = k.act;
    // 村里人给的东西没人拿去递（不在说话里给的）：过一会儿照常浮「得……」
    if (this.recv.length && this.t - this.recv[0].t > 1.2) { for (const r of this.drainGot()) k.bag.announce(r.item, r.n); }
    if (a !== this.cur?.act) {
      if (this.cur) this.left(this.cur);
      this.cur = a ? { act: a, t0: this.t, night: k.atmos.night > 0.5, tea: k.bag.count('tea'), poem: k.bag.count('poem'), brewed: false, wrote: false } : null;
    }
    if (this.cur && a) {
      const st = a.state as Record<string, unknown>;
      if (a.id === 'tea' && st.kind === 'xiang') this.cur.brewed = true;
      if (a.id === 'book' && st.title === '诗稿' && !this.cur.wrote) {
        this.cur.wrote = true;
        const lines = Array.isArray(st.lines) ? (st.lines as unknown[]).filter((x): x is string => typeof x === 'string') : [];
        if (lines.length) { this.m.poem = { lines: lines.slice(0, 4), source: str(st.source) }; this.save(); }
      }
    }
    for (const d of FAVORS) {
      const s = this.m.f[d.id]?.s;
      if (s !== 'on') continue;
      if (d.goal.kind === 'bring') {
        const has = this.hasAny(d.goal.items);
        if (has && !this.had.get(d.id) && d.note.got) k.note(fill(d.note.got), 'favor');
        this.had.set(d.id, has);
      } else if (d.goal.kind === 'hen' && hens()?.lost.state === 'back') {
        this.m.f[d.id] = { s: 'half', d: this.day }; this.save();
        if (d.note.half) k.note(fill(d.note.half), 'favor');
      }
    }
    this.wave();
  }
  /** 刚做完（离开）一件事 */
  private left(c: NonNullable<FolkBook['cur']>) {
    const k = this.k, id = c.act.id, dur = this.t - c.t0, st = c.act.state as Record<string, unknown>;
    // 草堂里煮了茶、写了诗：盛一碗、带一张（那边已经给过了就不再给）
    if (id === 'tea' && c.brewed && k.bag.count('tea') <= c.tea) k.bag.add('tea', 1);
    if (id === 'book' && c.wrote && k.bag.count('poem') <= c.poem) k.bag.add('poem', 1);
    for (const d of FAVORS) {
      const g = d.goal;
      if (g.kind !== 'act' || this.m.f[d.id]?.s !== 'on') continue;
      if (!g.acts.some((p) => id === p || id.startsWith(p))) continue;
      if (g.night && !c.night) continue;
      if (dur < (g.secs ?? 6) && st.done !== true) continue;
      this.m.f[d.id] = { s: 'half', d: this.day }; this.save();
      if (d.note.half) k.note(fill(d.note.half), 'favor');
    }
  }
  /** 相得以上的：远远看见你，招一招手（一天一回）；情分写在他身上，给村人那一路用 */
  private wave() {
    const k = this.k, npcs = k.life?.npcs;
    if (!npcs) return;
    const me = k.player.pos;
    for (const P of people()) {
      const n = npcs[P.id] as (NpcLike & { wave?(p: THREE.Vector3): void }) | undefined;
      if (!n?.root) continue;
      const lv = this.level(P.id);
      n.root.userData.bond = lv;
      const d = Math.hypot(n.pos.x - me.x, n.pos.z - me.z);
      const want = lv >= 3 && n.present && !k.act && d > 6 && d < 18;
      n.root.userData.wave = want && this.own(P.id).wd !== this.day;
      if (!n.root.userData.wave) continue;
      this.own(P.id).wd = this.day; this.save();
      try { n.wave?.(me); } catch { /* 那边没备好 */ }
      k.sfxAt('greet', { vel: 0.35, x: n.pos.x, z: n.pos.z });
      k.note(`${P.name}远远地招了招手`, 'folk');
    }
  }
}

// ———————————————————————— 打听：人在哪、鸡在哪 ————————————————————————
/** 村人那一路给的 doing 里，说「人在路上」的几种（这时不必再说他在哪一处） */
const MOVING = /^(正往|收了工|站在路上)/;
/** 「某某这会儿在哪」：照他此刻在不在外头、日程，说成一句家常话（ask 是被问的那个人，话里按他怎么叫你称呼你） */
export function whereText(k: Anlewo, id: string, ask?: string): string {
  const P = person(id), npc = k.life?.npcs[id] as (NpcLike & { doing?: string }) | undefined;
  const you = ask ? folkOf(k).you(ask) : YOU;
  if (!P) return `没留意，${you}到村里问问。`;
  const h = k.atmos.hour, wet = wetNow(k), s = stepAt(P, h, k.season, wet);
  const kin = ask ? !!person(ask)?.family.includes(id) : false;
  if (npc?.present) {
    const doing = str(npc.doing, s?.act ? s.doing : '');
    // 「正往某处去」「收了工，正往家里去」「站在路上和谁说话」：这一句就说了他在哪
    if (MOVING.test(doing)) { const d = doing.startsWith('正往') ? doing.split('，')[0] : doing; return kin ? `${d}呢。${you}去路上迎一迎。` : `方才还瞧见${P.name}${d}。`; }
    const where = (s?.act ? s.where : '') || placeName(npc.pos.x, npc.pos.z);
    return kin ? `在${where}呢${doing ? `，${doing}` : ''}。${you}去那边找。` : `方才还瞧见${P.name}在${where}${doing ? `，${doing}` : ''}。`;
  }
  const nx = nextStep(P, h, k.season, wet);
  if (nx) return `${P.name}这会儿不在外头。${hourWord(nx.from)}会在${nx.where}，${you}那时候去。`;
  return wet ? `这天气，${P.name}怕是在家里歇着。` : `${P.name}今日怕是不出来了，${you}改日再寻。`;
}
/** 走散的鸡在哪一带（you：说话的人怎么叫你） */
function henText(x: number, z: number, mine: boolean, you = YOU): string {
  const near = nearWhat(x, z);
  return mine ? `它最爱往${near}那一带钻，${you}去那边瞧瞧。` : `方才好像瞧见一只芦花鸡，在${near}那边刨食呢。`;
}
/** 一点附近是什么（说给人听的：石桥头、竹林边、桑园……） */
function nearWhat(x: number, z: number): string {
  const S = SITE, d = (p: { x: number; z: number }) => Math.hypot(p.x - x, p.z - z);
  const cands: Array<[number, string]> = [
    [d(S.bridge), '石桥头'], [Math.hypot(x, z + 38) - 6, '竹林边'], [d({ x: (S.mulberry.x0 + S.mulberry.x1) / 2, z: (S.mulberry.z0 + S.mulberry.z1) / 2 }) - 10, '桑园里'],
    [d(S.elm), '槐树底下'], [d(S.well), '井台边'], [d(S.more.teaShed), '茶亭'], [d(S.more.mill), '水碓'], [d(S.more.dryYard), '晒场'],
  ];
  cands.sort((a, b) => a[0] - b[0]);
  return cands[0][0] < 30 ? cands[0][1] : placeName(x, z);
}
/** 世界里一点在哪一处（村图上的名字） */
export function placeName(x: number, z: number): string {
  const id = placeId(x, z);
  return PLACES.find((p) => p.id === id)?.name ?? '外头';
}

// ———————————————————————— 村人簿 ————————————————————————
export interface FolkCard {
  /** you：他此刻怎么叫你（看情分，按你是男客女客取好的） */
  id: string; name: string; you: string; role: string; tag: string; age: number | null; home: string; homeText: string; temper: string;
  family: Array<{ id: string; name: string; tag: string }>;
  /** 此刻：在不在外头、在哪、做什么；按地方分组时归哪一处（「田畴」「在家」「村外」） */
  here: boolean; where: string; doing: string; place: string;
  /** 今天的日程（只列出门做事的那几段；当前那一段 on） */
  plan: Array<{ from: number; to: number; when: string; where: string; doing: string; on: boolean }>;
  bond: number; bondName: string;
  /** 说过几回话；上回是哪天（今日、昨日、三日前） */ met: number; last: string;
  /** 喜欢什么：相得以上都知道；不熟时只列送对了才知道的；一样也不知道是 null */
  likes: string[] | null;
  /** 送过他的、他回赠过的（「鸡蛋两回」） */ gave: string[]; got: string[];
  favors: Array<{ id: string; name: string; state: string; note: string }>;
  /** 能不能说话（有身子、此刻在外头） */ talk: boolean;
}
const CN = '〇一二三四五六七八九';
const times = (n: number) => (n === 1 ? '一回' : n === 2 ? '两回' : n < 10 ? `${CN[n]}回` : '好几回');
const dayWord = (gap: number) => (gap <= 0 ? '今日' : gap === 1 ? '昨日' : gap === 2 ? '前日' : gap < 10 ? `${CN[gap]}日前` : '好些日子前');
const itemName = (x: string) => ITEMS[x]?.name ?? x;
export function folkView(k: Anlewo): FolkCard[] {
  const F = folkOf(k), h = k.atmos.hour, wet = wetNow(k), npcs = k.life?.npcs ?? {};
  return people().map((P) => {
    const npc = npcs[P.id] as (NpcLike & { doing?: string }) | undefined, s = stepAt(P, h, k.season, wet), lv = F.level(P.id), pm = F.pm(P.id);
    const here = !!npc?.present;
    const place = here && npc ? placeName(npc.pos.x, npc.pos.z) : HOUSES[P.home] ? '在家' : '村外';
    // 不在外头的：名册里「在家」那一段说着他在家做什么（睡下了、吃午饭、点着灯……）
    const home = !here && s && !s.act ? s : null;
    const doing = here ? str(npc?.doing, s?.act ? s.doing : '') : home?.doing ?? '';
    const where = here ? (MOVING.test(doing) ? '' : (s?.act ? s.where : '') || place) : HOUSES[P.home] ? P.homeText : (home?.where || P.homeText);
    const know = lv >= 3 ? P.likes : P.likes.filter((x) => pm.know.includes(x));
    const favors = FAVORS.flatMap((d) => {
      const st = F.fm(d.id)?.s, g = d.goal, mine = d.from === P.id;
      const via = (g.kind === 'fetch' && g.at === P.id) || (g.kind === 'tell' && g.to === P.id);
      if (!st || st === 'no' || (!mine && !(via && st === 'on'))) return [];
      const state = !mine ? '要找他' : st === 'done' ? '办成了' : st === 'half' ? '快办成了' : '在办';
      const note = st === 'done' ? '' : st === 'half' ? fill(d.note.half ?? '') : fill(d.note.on);
      return [{ id: d.id, name: mine ? fill(d.name) : `${person(d.from)?.name ?? ''}托的：${fill(d.name)}`, state, note }];
    });
    return {
      id: P.id, name: P.name, you: F.you(P.id), role: P.role, tag: P.tag, age: P.age, home: P.home, homeText: P.homeText, temper: lv >= 2 ? P.temper : '',
      family: P.family.map((f) => person(f)).filter((x): x is Person => !!x).map((x) => ({ id: x.id, name: x.name, tag: x.tag })),
      here, where, doing, place,
      plan: today(P, k.season, wet).filter((st) => !!st.act).map((st) => ({ from: st.from, to: st.to, when: span(st.from, st.to), where: st.where, doing: st.doing, on: h >= st.from && h < st.to })),
      bond: lv, bondName: BONDS[lv], met: pm.n, last: pm.n ? dayWord(k.day - pm.d) : '',
      likes: know.length ? know.map(itemName) : null,
      gave: Object.entries(pm.gift).map(([i, n]) => `${itemName(i)}${times(n)}`), got: Object.entries(pm.got).map(([i, n]) => `${itemName(i)}${times(n)}`),
      favors, talk: here && !!k.acts[`talk:${P.id}`],
    };
  });
}
/** 「辰—午」：一段钟点用时辰说（同一个时辰里的是「辰时」） */
function span(a: number, b: number): string {
  const x = branch(a), y = branch(Math.max(a, b - 0.01));
  return x === y ? `${x}时` : `${x}—${y}`;
}

/**
 * 去找他：在外头的，离得近就走过去，远了画淡成一片雾、人就站在他跟前；不在外头的，到他家门口去。
 * 返回去得成去不成。
 */
export async function seek(k: Anlewo, id: string): Promise<boolean> {
  const P = person(id), npc = k.life?.npcs[id];
  if (!P || k.nav.busy) return false;
  const target = npc?.present ? { x: npc.pos.x, z: npc.pos.z } : P.door;
  if (!target) return false;
  // 他跟前、站得住的一点（朝着你这边）
  const p = k.player.pos, a0 = Math.atan2(p.x - target.x, p.z - target.z), r = npc?.present ? 2.4 : 1.6;
  let spot: [number, number] | null = null;
  for (let i = 0; i < 18 && !spot; i++) {
    const a = a0 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.36, x = target.x + Math.sin(a) * r, z = target.z + Math.cos(a) * r;
    if (standable(x, z) != null) spot = [x, z];
  }
  if (!spot) return false;
  if (k.act) k.exitAct();
  const [sx, sz] = spot, yaw = Math.atan2(target.x - sx, target.z - sz);
  const jump = () => k.nav.travel(() => { k.player.teleport(sx, sz, yaw); k.nav.snapBehind(); });
  // 近的走过去（走不通就也淡过去）；远的画淡成一片雾，人就到了
  if (Math.hypot(p.x - sx, p.z - sz) < 40) { k.player.goTo(sx, sz, { r: 0.3, fail: () => { void jump(); } }); return true; }
  await jump();
  return true;
}

// ———————————————————————— 托事里要做的一件小事：守网 ————————————————————————
/** 渔父托你看着岸上晒的网：站在网架边，看一会儿水、看一会儿鹭鸶。托了才有 */
function guardNet(k: Anlewo): Act | null {
  const F = folkOf(k);
  // 站在网架西北边两米来远、面朝网架（东南边是渔父补网的地方，再过去是水）
  let x = 0, z = 0, ok = false;
  for (let i = 0; i < 12 && !ok; i++) {
    const a = Math.PI + 0.5 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.35;
    x = RACK.x + Math.sin(a) * 2.2; z = RACK.z + Math.cos(a) * 2.2;
    ok = standable(x, z) != null;
  }
  if (!ok) return null;
  const gy = groundAt(RACK.x, RACK.z) ?? groundAt(x, z) ?? 0;
  let t = 0, done = false;
  const state: Record<string, unknown> = {};
  const set = (p: Record<string, unknown>) => { for (const key of Object.keys(state)) delete state[key]; Object.assign(state, p); k.emitAct(); };
  const act: Act & { on(): boolean } = {
    id: 'favor:net', name: '守网',
    anchor: new THREE.Vector3(RACK.x, gy + 2.1, RACK.z), spot: { x, z, yaw: Math.atan2(RACK.x - x, RACK.z - z) }, radius: 3, state,
    on: () => F.fm('net')?.s === 'on',
    enter() {
      t = 0; done = false;
      const av = k.player.av;
      av.setHands('sleeve'); av.lookAt(new THREE.Vector3(RACK.x, gy + 1.1, RACK.z));
      // 机位：从网架的另一侧斜着看过来，人、网、水都在画里
      const c = new THREE.Vector3((x + RACK.x) / 2, gy, (z + RACK.z) / 2), dir = Math.atan2(x - RACK.x, z - RACK.z) + 1.1;
      k.nav.setPose({ pos: new THREE.Vector3(c.x + Math.sin(dir) * 5.2, c.y + 2.2, c.z + Math.cos(dir) * 5.2), look: c.clone().setY(c.y + 0.9), fov: 40, yaw: 24, up: 10, down: 8 }, 1.6);
      set({ kind: 'favor', title: '守网', hint: '守着网。看看水，看看鹭鸶', progress: 0, quiet: true });
    },
    exit() { k.player.av.lookAt(null); },
    update(dt) {
      if (done) return;
      t += dt;
      const p = Math.min(1, t / 26);
      if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) { state.progress = p; k.emitAct(); }
      if (p >= 1) {
        done = true;
        set({ kind: 'favor', title: '守网', text: '网好好地晾着，一根线也没少。船上的人朝这边扬了扬手。', choices: [{ id: 'done', label: '起身' }], done: true });
      }
    },
    cmd(c) { if (c === 'done') k.exitAct(); },
  };
  return act;
}

export function create(k: Anlewo): Act[] {
  const F = folkOf(k);
  k.world.tick.push((dt) => { try { F.tick(dt); } catch (e) { console.warn('人情账出错', e); } });
  const net = guardNet(k);
  return net ? [net] : [];
}
