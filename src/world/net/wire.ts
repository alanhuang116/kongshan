/**
 * 线上的消息长什么样（与 server/core.mjs 一一对应），以及收到时怎么认：中转已经认过一遍，这边再认一遍
 * （网址上的 ?ws= 可以指到别处去，别处发来的东西也只能落在单子的序号上——认不得的整条不要）。
 *
 * 一个人的样子 State：[ct, x, y, z, yaw, 速度, 处, 事, 姿态, 藏]（见 core.mjs 的 readState）。
 */
import { ACTS, BOUNDS, NAME_A, NAME_B, PHRASES, PLACE_IDS, POSES, ROBES, type Name } from './proto';

export type State = [number, number, number, number, number, number, number, number, number, number];
export type WireIn =
  | { t: 'wel'; id: number; rm: string; cap: number; ps: Array<{ id: number; n: Name; c: number; st: State | null }> }
  | { t: 'in'; id: number; n: Name; c: number }
  | { t: 'out'; id: number }
  | { t: 'st'; ps: Array<[number, State]> }
  | { t: 'bow'; fr: number; to: number; re: 0 | 1 }
  | { t: 'say'; fr: number; to: number; k: number }
  | { t: 'fo'; fr: number; on: 0 | 1 }
  | { t: 'nm'; id: number; n: Name; c: number }
  | { t: 'no'; why: string };

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const id = (v: unknown): v is number => isInt(v, 1, 999999);
export const readName = (n: unknown): Name | null => (Array.isArray(n) && n.length === 2 && isInt(n[0], 0, NAME_A.length - 1) && isInt(n[1], 0, NAME_B.length - 1) ? [n[0], n[1]] : null);
const robe = (c: unknown): c is number => isInt(c, 0, ROBES.length - 1);

export function readState(d: unknown): State | null {
  if (!Array.isArray(d) || d.length !== 10) return null;
  const [ct, x, y, z, yaw, v, pl, a, po, h] = d as unknown[];
  if (!isInt(ct, 0, 2147483647) || !isNum(x, BOUNDS.x[0], BOUNDS.x[1]) || !isNum(y, BOUNDS.y[0], BOUNDS.y[1]) || !isNum(z, BOUNDS.z[0], BOUNDS.z[1])) return null;
  if (!isNum(yaw, -3.1416, 3.1416) || !isNum(v, 0, BOUNDS.speed)) return null;
  if (!isInt(pl, -1, PLACE_IDS.length - 1) || !isInt(a, -1, ACTS.length - 1) || !isInt(po, 0, POSES.length - 1) || (h !== 0 && h !== 1)) return null;
  return [ct, x, y, z, yaw, v, pl, a, po, h];
}

/** 收到的一条：认得就返回规整的一份，认不得 null */
export function readIn(m: unknown): WireIn | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case 'wel': {
      if (!id(o.id) || typeof o.rm !== 'string' || o.rm.length > 12 || !Array.isArray(o.ps) || o.ps.length > 200) return null;
      const ps: Array<{ id: number; n: Name; c: number; st: State | null }> = [];
      for (const p of o.ps) {
        if (!Array.isArray(p) || p.length !== 5 || !id(p[0]) || !robe(p[3])) continue;
        const n = readName([p[1], p[2]]);
        if (!n) continue;
        ps.push({ id: p[0], n, c: p[3], st: p[4] == null ? null : readState(p[4]) });
      }
      return { t: 'wel', id: o.id, rm: o.rm, cap: isInt(o.cap, 1, 999) ? o.cap : 24, ps };
    }
    case 'in': { const n = readName(o.n); return id(o.id) && n && robe(o.c) ? { t: 'in', id: o.id, n, c: o.c } : null; }
    case 'nm': { const n = readName(o.n); return id(o.id) && n && robe(o.c) ? { t: 'nm', id: o.id, n, c: o.c } : null; }
    case 'out': return id(o.id) ? { t: 'out', id: o.id } : null;
    case 'st': {
      if (!Array.isArray(o.ps) || o.ps.length > 200) return null;
      const ps: Array<[number, State]> = [];
      for (const p of o.ps) { if (!Array.isArray(p) || p.length !== 11 || !id(p[0])) continue; const st = readState(p.slice(1)); if (st) ps.push([p[0], st]); }
      return { t: 'st', ps };
    }
    case 'bow': return id(o.fr) && id(o.to) && (o.re === 0 || o.re === 1) ? { t: 'bow', fr: o.fr, to: o.to, re: o.re } : null;
    case 'say': return id(o.fr) && (o.to === 0 || id(o.to)) && isInt(o.k, 0, PHRASES.length - 1) ? { t: 'say', fr: o.fr, to: o.to as number, k: o.k } : null;
    case 'fo': return id(o.fr) && (o.on === 0 || o.on === 1) ? { t: 'fo', fr: o.fr, on: o.on } : null;
    case 'no': return { t: 'no', why: typeof o.why === 'string' ? o.why.slice(0, 16) : '' };
    default: return null;
  }
}
