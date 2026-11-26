/**
 * 自己是谁：一个雅号（两张名单里各取一个，如「伊川」+「散人」）、一身衣色；还有「独游 / 同游」的选择。
 * 只存在本机（localStorage，读写都包在 try 里——隐身窗口、存不下时照样能玩，只是下回换一个名字）。
 */
import { NAME_A, NAME_B, ROBES, type Name } from './proto';

export interface Identity { n: Name; c: number; on: boolean }
const KEY = 'anlewo:net:v1';

const pick = (n: number, avoid = -1) => { if (n <= 1) return 0; let i = Math.floor(Math.random() * n); if (i === avoid) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n; return i; };
/** 新起一个（换一个时尽量不与原来的重样） */
export function roll(prev?: Identity | null): Identity {
  return { n: [pick(NAME_A.length, prev?.n[0]), pick(NAME_B.length, prev?.n[1])], c: pick(ROBES.length, prev?.c), on: prev?.on ?? true };
}
/** 雅号的后半截哪些只合男子（野老、樵子、钓叟、书生、老圃、渔父、处士、游子）：女子从别的里挑（散人、闲人、客、居士、山人、过客、道人、布衣） */
const MALE_ONLY = new Set(['野老', '樵子', '钓叟', '书生', '老圃', '渔父', '处士', '游子']);
export const nameFits = (b: number, sex: 'm' | 'f') => sex === 'm' || !MALE_ONLY.has(NAME_B[b] ?? '');
/** 按男女起一个（女子不叫钓叟、樵子）；换一个时尽量不与原来的重样 */
export function rollFor(sex: 'm' | 'f', prev?: Identity | null): Identity {
  const okB = NAME_B.map((_, i) => i).filter((i) => nameFits(i, sex));
  let b = okB[Math.floor(Math.random() * okB.length)];
  if (okB.length > 1 && prev && b === prev.n[1]) b = okB[(okB.indexOf(b) + 1 + Math.floor(Math.random() * (okB.length - 1))) % okB.length];
  return { n: [pick(NAME_A.length, prev?.n[0]), b], c: prev?.c ?? pick(ROBES.length), on: prev?.on ?? true };
}
const ok = (v: unknown, n: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
export function loadIdentity(): Identity {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Identity>;
      if (o && Array.isArray(o.n) && ok(o.n[0], NAME_A.length) && ok(o.n[1], NAME_B.length) && ok(o.c, ROBES.length)) return { n: [o.n[0], o.n[1]], c: o.c as number, on: o.on !== false };
    }
  } catch { /* 读不到就新起一个 */ }
  const id = roll();
  saveIdentity(id);
  return id;
}
export function saveIdentity(id: Identity) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(id)); } catch { /* 存不下就算了 */ }
}
