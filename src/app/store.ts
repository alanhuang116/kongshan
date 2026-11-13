/**
 * 两个小仓库：
 *   saved —— 存在本机（localStorage）：天时与声音的偏好、起居注、观象册里已经观过的象。不上传，也没有账号。
 *   ui    —— 只在内存：人此刻在哪一处、走近了哪件事、在做什么、哪一页册子开着、画里是昼是夜。
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
}
const KEY = 'anlewo:v1';
// 寻常的一次来访：春天的上午，晴，从桃林走进来。之后改过的天时都记着
const DEFAULT: Saved = {
  v: 1, time: 'day', weather: 'clear', season: 'spring', master: 0.8, muted: false, sound: {}, haptics: true, quality: 'auto',
  visits: 0, journal: [], found: [], walked: false,
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const unit = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);
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
        master: unit(o.master, DEFAULT.master), muted: o.muted === true,
        sound: Object.fromEntries(Object.entries(o.sound && typeof o.sound === 'object' ? o.sound : {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [k, unit(v, 1)])),
        haptics: o.haptics !== false,
        quality: oneOf(o.quality, ['auto', 'low', 'mid', 'high'] as const, 'auto'),
        visits: typeof o.visits === 'number' && o.visits > 0 ? Math.floor(o.visits) : 0,
        journal: Array.isArray(o.journal) ? o.journal.filter((e) => e && typeof e === 'object' && typeof e.kind === 'string' && typeof e.t === 'number') : [],
        found: Array.isArray(o.found) ? [...new Set(o.found.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [],
        walked: o.walked === true,
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

export type Sheet = null | 'map' | 'sky' | 'xiang' | 'sound' | 'journal' | 'about';
export interface Ui {
  phase: 'boot' | 'title' | 'intro' | 'roam';
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
  error: string | null;
}
export const ui = createStore<Ui>({ phase: 'boot', progress: 0, stage: '', place: 'grove', busy: false, arrivedAt: 0, near: null, act: null, actState: {}, sheet: null, menu: false, hour: 9.2, tone: 'day', sound: false, error: null });
export const setUi = (p: Partial<Ui>) => ui.set((s) => ({ ...s, ...p }));
