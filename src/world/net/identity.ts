/**
 * 自己是谁：一个雅号（两张名单里各取一个，如「伊川」+「散人」）、一身衣色；还有「独游 / 同游」的选择。
 * 跟着存档走：存在 `Saved.world.ui.net`，换设备登录也是同一个雅号；
 * 旧版本只写在本机 `anlewo:net:v1` 的那一份，读一次兜底并纳进存档，之后不再写回。
 */
import { prefValue, setPrefValue } from '../../app/store';
import { NAME_A, NAME_B, ROBES, type Name } from './proto';

export interface Identity { n: Name; c: number; on: boolean }
/** 旧版本的本机键：只读兜底 */
const LEGACY_KEY = 'anlewo:net:v1';
/** 存档里这一份偏好的名字（`Saved.world.ui.net`） */
const PREF = 'net';

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
/** 存的这一份是不是一个能用的身份（旧档、手改过、别的版本写的都要过这一关） */
function read(v: unknown): Identity | null {
  const o = v as Partial<Identity> | null;
  if (o && Array.isArray(o.n) && ok(o.n[0], NAME_A.length) && ok(o.n[1], NAME_B.length) && ok(o.c, ROBES.length)) {
    return { n: [o.n[0], o.n[1]], c: o.c as number, on: o.on !== false };
  }
  return null;
}
/** 旧版本只在本机存过的那一份 */
function legacy(): Identity | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LEGACY_KEY);
    return raw ? read(JSON.parse(raw) as Partial<Identity>) : null;
  } catch { return null; }
}
export function loadIdentity(): Identity {
  const stored = read(prefValue(PREF, null));
  if (stored) return stored;
  const old = legacy();
  if (old) { saveIdentity(old); return old; }
  const id = roll();
  saveIdentity(id);
  return id;
}
export function saveIdentity(id: Identity) {
  setPrefValue(PREF, { n: [id.n[0], id.n[1]], c: id.c, on: id.on });
}
