/**
 * 两个小仓库：
 *   saved —— 存在本机（localStorage）：偏好（天时、声音）、功课簿、抄经的进度、今日拈到的那一则。不上传，也没有账号。
 *   ui    —— 只在内存：人此刻在哪一处、走近了哪件事、在做什么、哪一层界面开着。
 */
import { useSyncExternalStore } from 'react';
import type { Layer } from '../audio';
import type { Season, Weather } from '../world/env/atmos';
import type { TimeMode } from '../world/Kongshan';

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

export interface Entry { t: number; kind: string; n?: number; minutes?: number; text?: string }
export interface Saved {
  v: 1;
  time: TimeMode;
  weather: Weather | 'auto';
  season: Season | 'auto';
  master: number;
  muted: boolean;
  layers: Partial<Record<Layer, number>>;
  /** 静坐时的呼吸引导 */
  breath: boolean;
  /** 触感（手机振动） */
  haptics: boolean;
  /** 画质：auto 由机器定 */
  quality: 'auto' | 'low' | 'mid' | 'high';
  /** 来过几次 */
  visits: number;
  journal: Entry[];
  /** 抄经：写到第几个字；每个字的笔画（量化后的点） */
  copy: { at: number; done: number };
  /** 今日拈到的一则：日期 + id */
  verse: { day: string; id: string } | null;
  /** 今日放的灯上写的愿（只在本机） */
  lamps: Array<{ day: string; text: string }>;
  /** 最近一次坐了多久（分钟），下次默认选它 */
  sitMinutes: number;
  /** 已经会走了（走动的提示不再出） */
  walked: boolean;
}
const KEY = 'kongshan:v1';
const DEFAULT: Saved = {
  v: 1, time: 'now', weather: 'auto', season: 'auto', master: 0.8, muted: false, layers: {}, breath: true, haptics: true, quality: 'auto',
  visits: 0, journal: [], copy: { at: 0, done: 0 }, verse: null, lamps: [], sitMinutes: 10, walked: false,
};
function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const o = JSON.parse(raw) as Partial<Saved>; if (o && o.v === 1) return { ...DEFAULT, ...o }; }
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

export type Sheet = null | 'map' | 'sky' | 'sound' | 'journal' | 'about';
export interface Ui {
  phase: 'boot' | 'title' | 'intro' | 'roam';
  progress: number; stage: string;
  /** 人在哪一处（处的 id）；busy 是正在换处（画面暗着） */
  place: string; busy: boolean;
  /** 最近一次走到另一处的时刻（用来浮出处名） */
  arrivedAt: number;
  /** 走近了的那件事（或楼门） */
  near: { id: string; label: string; kind: 'act' | 'door' } | null;
  act: string | null; actState: Record<string, unknown>;
  sheet: Sheet;
  /** 界面全收起（静坐中） */
  quiet: boolean;
  error: string | null;
}
export const ui = createStore<Ui>({ phase: 'boot', progress: 0, stage: '', place: 'foot', busy: false, arrivedAt: 0, near: null, act: null, actState: {}, sheet: null, quiet: false, error: null });
export const setUi = (p: Partial<Ui>) => ui.set((s) => ({ ...s, ...p }));
