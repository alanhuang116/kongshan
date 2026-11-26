/**
 * 线上的消息长什么样（与 server/core.mjs 一一对应），以及收到时怎么认：中转已经认过一遍，这边再认一遍
 * （网址上的 ?ws= 可以指到别处去，别处发来的东西也只能落在单子的序号上——认不得的整条不要）。
 *
 * 一个人的样子 State：[ct, x, y, z, yaw, 速度, 处, 事, 姿态, 藏]（见 core.mjs 的 readState）。
 */
import { ACTS, BOUNDS, CARD_N, GAMES, GAME_N, LOOK_N, NAME_A, NAME_B, PHRASES, PLACE_IDS, POSES, ROBES, WEATHERS, type Name } from './proto';

export type State = [number, number, number, number, number, number, number, number, number, number];
/**
 * 一枚路标（游人在某处留下自己取的一卦）：编号、在哪、哪一卦（GUA 的序号 0…63）、那时是几月、几时、什么天气，留标的人的雅号与衣色，
 * 留了几分钟（收到时）；mine：是自己留的
 */
export interface WireMark { id: number; x: number; z: number; g: number; mo: number; h: number; w: number; n: Name; c: number; age: number; mine?: boolean }
export type WireIn =
  | {
    t: 'wel'; id: number; rm: string; cap: number; ps: Array<{ id: number; n: Name; c: number; st: State | null }>; sky: [number, number, number] | null;
    /** 中转认得新添的几样（样子、名片、玩法、路标）：0 是旧的一版 */ x: number;
    /** 同屋各人的样子与名片 */ px: Array<{ id: number; lk: number[]; cd: number[] }>;
    mk: WireMark[];
    /** 路标留几分钟 */ mt: number;
  }
  | { t: 'in'; id: number; n: Name; c: number; lk: number[] | null; cd: number[] | null }
  | { t: 'lk'; id: number; d: number[] }
  | { t: 'cd'; id: number; d: number[] }
  | { t: 'g'; fr: number; to: number; k: number; d: number[] }
  | { t: 'mk'; m: WireMark }
  | { t: 'mkx'; id: number }
  | { t: 'out'; id: number }
  | { t: 'st'; ps: Array<[number, State]> }
  | { t: 'bow'; fr: number; to: number; re: 0 | 1 }
  | { t: 'say'; fr: number; to: number; k: number }
  | { t: 'fo'; fr: number; on: 0 | 1 }
  | { t: 'nm'; id: number; n: Name; c: number }
  | { t: 'sky'; fr: number; d: [number, number] }
  | { t: 'no'; why: string };

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const id = (v: unknown): v is number => isInt(v, 1, 999999);
export const readName = (n: unknown): Name | null => (Array.isArray(n) && n.length === 2 && isInt(n[0], 0, NAME_A.length - 1) && isInt(n[1], 0, NAME_B.length - 1) ? [n[0], n[1]] : null);
const robe = (c: unknown): c is number => isInt(c, 0, ROBES.length - 1);
/** 样子、名片、玩法里的数（与中转一样的范围） */
export const readLook = (d: unknown): number[] | null => (Array.isArray(d) && d.length <= LOOK_N && d.every((v) => isInt(v, 0, 255)) ? (d as number[]).slice() : null);
export const readCard = (d: unknown): number[] | null => (Array.isArray(d) && d.length <= CARD_N && d.every((v) => isInt(v, 0, 999999)) ? (d as number[]).slice() : null);
export const readGame = (d: unknown): number[] | null => (Array.isArray(d) && d.length <= GAME_N && d.every((v) => isInt(v, -9999999, 9999999)) ? (d as number[]).slice() : null);
/** 一枚路标：[编号, x, z, 卦, 月, 时, 天气, 名一, 名二, 衣色, 留了几分钟] */
export function readMark(m: unknown): WireMark | null {
  if (!Array.isArray(m) || m.length !== 11) return null;
  const [mid, x, z, g, mo, h, w, a, b, c, age] = m as unknown[];
  if (!isInt(mid, 1, 9999999) || !isNum(x, BOUNDS.x[0], BOUNDS.x[1]) || !isNum(z, BOUNDS.z[0], BOUNDS.z[1])) return null;
  if (!isInt(g, 0, 63) || !isInt(mo, 1, 12) || !isInt(h, 0, 23) || !isInt(w, 0, WEATHERS.length - 1) || !robe(c) || !isInt(age, 0, 1e7)) return null;
  const n = readName([a, b]);
  return n ? { id: mid, x, z, g, mo, h, w, n, c, age } : null;
}
/** 园中天时：[时区（分钟）, 天气序号] */
const readSky = (d: unknown): [number, number] | null => (Array.isArray(d) && d.length === 2 && isInt(d[0], -720, 840) && isInt(d[1], 0, WEATHERS.length - 1) ? [d[0], d[1]] : null);

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
      // 园中天时（那间屋子里已经有人报过）：[报的那一位, 时区, 天气]
      const sk = Array.isArray(o.sky) && o.sky.length === 3 && id(o.sky[0]) ? readSky(o.sky.slice(1)) : null;
      // 新添的几样（旧的一版中转没有：x 是 0，别的空着）
      const px: Array<{ id: number; lk: number[]; cd: number[] }> = [];
      if (Array.isArray(o.px) && o.px.length <= 200) for (const p of o.px) {
        if (!Array.isArray(p) || p.length !== 3 || !id(p[0])) continue;
        const lk = readLook(p[1]), cd = readCard(p[2]);
        if (lk && cd) px.push({ id: p[0], lk, cd });
      }
      const mk: WireMark[] = [];
      if (Array.isArray(o.mk) && o.mk.length <= 1000) for (const m of o.mk) { const k = readMark(m); if (k) mk.push(k); }
      return {
        t: 'wel', id: o.id, rm: o.rm, cap: isInt(o.cap, 1, 999) ? o.cap : 24, ps, sky: sk && Array.isArray(o.sky) ? [o.sky[0] as number, sk[0], sk[1]] : null,
        x: isInt(o.x, 1, 99) ? o.x : 0, px, mk, mt: isInt(o.mt, 1, 1e6) ? o.mt : 4320,
      };
    }
    case 'in': {
      const n = readName(o.n);
      return id(o.id) && n && robe(o.c) ? { t: 'in', id: o.id, n, c: o.c, lk: o.lk === undefined ? null : readLook(o.lk), cd: o.cd === undefined ? null : readCard(o.cd) } : null;
    }
    case 'lk': { const d = readLook(o.d); return id(o.id) && d ? { t: 'lk', id: o.id, d } : null; }
    case 'cd': { const d = readCard(o.d); return id(o.id) && d ? { t: 'cd', id: o.id, d } : null; }
    case 'g': { const d = readGame(o.d); return id(o.fr) && (o.to === 0 || id(o.to)) && isInt(o.k, 0, GAMES.length - 1) && d ? { t: 'g', fr: o.fr, to: o.to as number, k: o.k, d } : null; }
    case 'mk': { const k = readMark(o.m); return k ? { t: 'mk', m: o.me === 1 ? { ...k, mine: true } : k } : null; }
    case 'mkx': return isInt(o.id, 1, 9999999) ? { t: 'mkx', id: o.id } : null;
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
    case 'sky': { const d = readSky(o.d); return id(o.fr) && d ? { t: 'sky', fr: o.fr, d } : null; }
    case 'no': return { t: 'no', why: typeof o.why === 'string' ? o.why.slice(0, 16) : '' };
    default: return null;
  }
}
