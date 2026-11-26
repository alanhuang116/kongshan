/**
 * 两个小仓库：
 *   saved —— 存在本机（localStorage）：天时与声音的偏好、起居注、观象册里已经观过的象，还有世界自己的存档
 *            （田里种了什么、行囊里有什么、村里人跟你熟到几分……世界按名字一份一份交来，这里原样收着）。不上传，也没有账号。
 *   ui    —— 只在内存：人此刻在哪一处、走近了哪件事、在做什么、哪一页册子开着、画里是昼是夜、下面浮着的几句话。
 */
import { useSyncExternalStore } from 'react';
import type { Season, Weather } from '../world/env/atmos';
import type { TimeMode } from '../world/Anlewo';

export function createStore<T>(initial: T) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(fn: (s: T) => T) { const n = fn(state); if (n === state) return; state = n; subs.forEach((f) => f()); },
    sub(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  };
}
export type Store<T> = ReturnType<typeof createStore<T>>;
export function useStore<T, S>(store: Store<T>, pick: (s: T) => S): S {
  return useSyncExternalStore(store.sub, () => pick(store.get()));
}

/** 起居注里的一笔：什么时候、做了什么（kind 是事的种类，text 是随它记下的字） */
export interface Entry { t: number; kind: string; n?: number; minutes?: number; text?: string }
export interface Saved {
  v: 1;
  /** 时辰：随此刻 / 晨昼昏夜 / 定在几点（天时册上点的那个时辰的正中） */
  time: TimeMode | number;
  weather: Weather;
  season: Season;
  master: number;
  muted: boolean;
  /** 各组环境声的音量（1 是「按场景算出来的原样」）；没调过的不记 */
  sound: Record<string, number>;
  /** 触感（手机振动） */
  haptics: boolean;
  /** 画质：auto 由机器定 */
  quality: 'auto' | 'low' | 'mid' | 'high';
  /** 来过几次 */
  visits: number;
  journal: Entry[];
  /** 观象册：已经观过的象（卦名） */
  found: string[];
  /** 已经会走了（走动的提示不再出） */
  walked: boolean;
  /** 已经告诉过「按住 Shift 跑」（电脑上只提示一回） */
  runTold: boolean;
  /**
   * 世界的存档：世界按名字（ns）一份一份交来（events.mem），这里原样收着，下回开门时整个交还给它（KsOpts.mem）。
   * 现有的名字见 world/mem.ts：bag 行囊 · farm 田里 · folk 村人 · stars 观过的星 · play 玩过的 · day 第几日
   */
  world: Record<string, unknown>;
  /** 时辰流转得多快：每过一秒画里过多少个钟头（0 停；1/60 是画里一个钟头 = 这里一分钟） */
  flow: number;
  /** 第几日（头一回来是第 0 日；界面上写作「第一日」） */
  day: number;
  /** 上回停在哪：下回「入」时从这里接着走（题名页上也可以选从桃林走进来）；t 是记下的时刻 */
  spot: Spot | null;
  /** 头一回进来时那几页「初到」已经看过（或说了不看） */
  guided: boolean;
  /** 时辰流转的快慢是自己在天时页上挑过的（没挑过的跟着默认走，默认改了也跟着改） */
  flowChosen: boolean;
  /** 总音量是自己在声音页上调过的（没调过的跟着默认走：初来的人先轻一些，各人自己往上调） */
  masterChosen: boolean;
}
/** 一处落脚的地方：位置、朝向、在哪一层（地上、亭上……）、是哪一处 */
export interface Spot { x: number; z: number; yaw: number; zone: string; place: string; t: number }
const KEY = 'anlewo:v1';
/** 时辰流转的四档：停、缓、常、疾（天时页上选） */
export const FLOWS: Array<[number, string, string]> = [
  [0, '停', '时辰停着，不走'],
  [1 / 120, '缓', '画里一个钟头，这里两分钟'],
  [1 / 60, '常', '画里一个钟头，这里一分钟'],
  [1 / 20, '疾', '画里一个钟头，这里二十秒'],
];
// 寻常的一次来访：春天的上午，晴，从桃林走进来；时辰慢慢地走（缓：画里一个钟头是这里两分钟——试玩的人说「跑着跑着就黑天了」）。之后改过的天时都记着
const DEFAULT: Saved = {
  v: 1, time: 'day', weather: 'clear', season: 'spring', master: 0.45, muted: false, sound: {}, haptics: true, quality: 'auto',
  visits: 0, journal: [], found: [], walked: false, runTold: false, world: {}, flow: 1 / 120, day: 0, spot: null, guided: false, flowChosen: false, masterChosen: false,
};
/** 落脚处：一样一样认过（数在合理的范围里，名字是短字串） */
function spotOf(v: unknown): Spot | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>, num = (x: unknown, lim: number) => (typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < lim ? x : null);
  const x = num(o.x, 2000), z = num(o.z, 2000), yaw = num(o.yaw, 100), t = num(o.t, 1e14);
  const zone = typeof o.zone === 'string' && o.zone.length < 24 ? o.zone : 'ground', place = typeof o.place === 'string' && o.place.length < 24 ? o.place : '';
  return x == null || z == null || yaw == null ? null : { x, z, yaw, zone, place, t: t ?? 0 };
}
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const unit = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
/** 世界的存档：只认「名字 → 能 JSON 的东西」的一张表（数组、空的、不是对象的都不要） */
function worldOf(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k && x !== undefined && x !== null && typeof x !== 'function') out[k] = x;
  return out;
}
function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Saved>;
      // 存着的东西一样一样认过再用（别的版本存的、手改坏了的，那一项就用默认的）
      if (o && o.v === 1) return {
        v: 1,
        time: typeof o.time === 'number' && Number.isFinite(o.time) ? ((o.time % 24) + 24) % 24 : oneOf(o.time, ['now', 'dawn', 'day', 'dusk', 'night'] as const, DEFAULT.time as TimeMode),
        weather: oneOf(o.weather, ['clear', 'mist', 'rain', 'snow'] as const, DEFAULT.weather),
        season: oneOf(o.season, ['spring', 'summer', 'autumn', 'winter'] as const, DEFAULT.season),
        // 总音量：自己没调过的（以前存的多半是旧的默认 0.8）跟着现在的默认走
        master: o.masterChosen === true ? unit(o.master, DEFAULT.master) : DEFAULT.master, muted: o.muted === true,
        sound: Object.fromEntries(Object.entries(o.sound && typeof o.sound === 'object' ? o.sound : {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k, unit(v, 1)])),
        haptics: o.haptics !== false,
        quality: oneOf(o.quality, ['auto', 'low', 'mid', 'high'] as const, 'auto'),
        visits: typeof o.visits === 'number' && o.visits > 0 ? Math.floor(o.visits) : 0,
        journal: Array.isArray(o.journal) ? o.journal.filter((e) => e && typeof e === 'object' && typeof e.kind === 'string' && typeof e.t === 'number') : [],
        found: Array.isArray(o.found) ? [...new Set(o.found.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [],
        walked: o.walked === true,
        runTold: o.runTold === true,
        world: worldOf(o.world),
        // 流转的快慢：0（停）到每秒一个钟头；自己没挑过的（以前存的多半是旧的默认）跟着现在的默认走
        flow: o.flowChosen === true && typeof o.flow === 'number' && Number.isFinite(o.flow) && o.flow >= 0 ? Math.min(1, o.flow) : DEFAULT.flow,
        day: typeof o.day === 'number' && Number.isFinite(o.day) && o.day > 0 ? Math.floor(o.day) : 0,
        spot: spotOf(o.spot),
        guided: o.guided === true,
        flowChosen: o.flowChosen === true,
        masterChosen: o.masterChosen === true,
      };
    }
  } catch { /* 读不到就用默认 */ }
  return { ...DEFAULT };
}
export const saved = createStore<Saved>(typeof localStorage === 'undefined' ? { ...DEFAULT } : load());
let pending = 0;
saved.sub(() => {
  if (pending) return;
  pending = window.setTimeout(() => { pending = 0; try { localStorage.setItem(KEY, JSON.stringify(saved.get())); } catch { /* 存不下就算了 */ } }, 300);
});
export const patch = (p: Partial<Saved>) => saved.set((s) => ({ ...s, ...p }));
export function addEntry(e: Omit<Entry, 't'>) {
  saved.set((s) => ({ ...s, journal: [...s.journal, { ...e, t: Date.now() }].slice(-3000) }));
}
/** 观到一象：记进册子（已经有的不重记）。返回是不是新的 */
export function addFound(name: string): boolean {
  if (!name || saved.get().found.includes(name)) return false;
  saved.set((s) => ({ ...s, found: [...s.found, name] }));
  return true;
}

/** 世界的存档里有一份变了：收进 saved.world（下回开门时交还给世界） */
export function saveWorld(ns: string, v: unknown) {
  if (!ns) return;
  saved.set((s) => {
    const world = { ...s.world };
    if (v === undefined || v === null) delete world[ns]; else world[ns] = v;
    return { ...s, world };
  });
}

export type Sheet = null | 'today' | 'map' | 'sky' | 'xiang' | 'sound' | 'journal' | 'about' | 'bag' | 'folk' | 'stars' | 'xiu' | 'wardrobe';
/** 画面下方浮着的一句话（「得麦三捆」「王婶记下了你的好」）；kind 是世界给的种类（bag 收得、folk 人情……），样式据此略有不同 */
export interface Note { id: number; text: string; kind?: string }
/** 星笺：夜里点了天上一处，它是什么（题、方位、原话与出处、白话；月是两句诗） */
export interface SkyNote { kind: 'star' | 'planet' | 'moon' | 'han' | 'small'; title: string; hint: string; text?: string; source?: string; gloss?: string; lines?: string[] }
export interface Ui {
  /** select 是头一回来时「入」之后的选人那一页（男女、穿着、雅号） */
  phase: 'boot' | 'title' | 'select' | 'intro' | 'roam';
  /** 画到哪一步了（0…1）与那一步的名字（铺纸、远山、种桃……） */
  progress: number; stage: string;
  /** 人在哪一处（处的 id）；busy 是正在换处（画面淡在雾里） */
  place: string; busy: boolean;
  /** 最近一次走到另一处的时刻（用来浮出处名） */
  arrivedAt: number;
  /** 走近了的那件事 */
  near: { id: string; label: string; kind: 'act' | 'door' } | null;
  act: string | null; actState: Record<string, unknown>;
  sheet: Sheet;
  /** 右上那一排简册（村图、天时、观象册……）展开着没有 */
  menu: boolean;
  /** 画里此刻几点（每秒从世界里取一次），界面该用哪一套颜色：昼是纸上的墨，夜是深墨上的月白 */
  hour: number; tone: 'day' | 'night';
  /** 声音那一层备好了没有（声音册据此列出能调的几样） */
  sound: boolean;
  /** 画面下方浮着的几句话（新的在下；最多三句，各自过一会儿退下去） */
  notes: Note[];
  /** 行囊里有什么（id → 数目；世界每换一样报一次） */
  bag: Record<string, number>;
  /** 人在跑（手机上「疾」那一枚跟着亮） */
  run: boolean;
  /** 第几日（头一回来是第 0 日） */
  day: number;
  /** 此刻的月建（子 0 … 亥 11），十二消息卦按月时显它 */
  month: number;
  /** 右上与天时那一圈的十二消息卦：按月（默认）还是按时辰 */
  xx: 'month' | 'hour';
  /** 夜里点了天上一处：那张星笺（null 是收着） */
  sky: SkyNote | null;
  error: string | null;
}
export const ui = createStore<Ui>({
  phase: 'boot', progress: 0, stage: '', place: 'grove', busy: false, arrivedAt: 0, near: null, act: null, actState: {}, sheet: null, menu: false,
  hour: 9.2, tone: 'day', sound: false, notes: [], bag: {}, run: false, day: 0, month: 3, xx: 'month', sky: null, error: null,
});
export const setUi = (p: Partial<Ui>) => ui.set((s) => ({ ...s, ...p }));

/** 一句话浮多久（毫秒；样式里的动画按这个长短排） */
export const NOTE_MS = 4200;
let noteSeq = 0;
const noteTimers = new Map<number, number>();
/**
 * 画面下方浮一句话。一模一样的话还浮着时不叠两句：旧的那句收掉，新的从下面重新浮起来；最多同时三句（最旧的先退）。
 */
export function addNote(text: string, kind?: string) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return;
  const drop = (id: number) => { clearTimeout(noteTimers.get(id)); noteTimers.delete(id); setUi({ notes: ui.get().notes.filter((n) => n.id !== id) }); };
  const n: Note = { id: ++noteSeq, text: t, kind };
  const list = [...ui.get().notes.filter((x) => {
    if (x.text !== t || x.kind !== kind) return true;
    clearTimeout(noteTimers.get(x.id)); noteTimers.delete(x.id);
    return false;
  }), n];
  while (list.length > 3) { const old = list.shift()!; clearTimeout(noteTimers.get(old.id)); noteTimers.delete(old.id); }
  setUi({ notes: list });
  noteTimers.set(n.id, window.setTimeout(() => drop(n.id), NOTE_MS));
}
