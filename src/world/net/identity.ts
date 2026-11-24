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
