/**
 * 同游的「单子」：名字的两张名单、衣色、几句话、处、事、姿态——与中转（server/core.mjs）读的是同一个文件 server/proto.json。
 * 线上只传序号，不传一个字：谁也写不进自己的话，用不着管。单子只往后添，不改前面的次序（新旧两版的人还能认得彼此）。
 */
import P from '../../../server/proto.json';

export const PROTO_V: number = P.v;
export const NAME_A: readonly string[] = P.names.a;
export const NAME_B: readonly string[] = P.names.b;
export const ROBES: readonly string[] = P.robes;
export interface Phrase { id: string; text: string; when?: string }
export const PHRASES: readonly Phrase[] = P.phrases as Phrase[];
export const PLACE_IDS: readonly string[] = P.places;
export const POSES: readonly string[] = P.poses;
export const ACTS: ReadonlyArray<readonly [string, string]> = P.acts as Array<[string, string]>;
export const BOUNDS = P.bounds as { x: [number, number]; y: [number, number]; z: [number, number]; speed: number };
/** 作揖、说话给多近的人（米；中转也按这个量） */
export const NEAR: number = P.near;
/** 天气的单子（园中天时里报的是序号） */
export const WEATHERS: readonly string[] = (P as { weathers?: string[] }).weathers ?? ['clear', 'mist', 'rain', 'snow'];
/**
 * 玩法的几条线（斗鸡、蹴鞠、射箭、抢座、答题、骑、投壶、打水漂、打坐、杂）：一条消息是其中一个序号加至多十六个整数，
 * 里头怎么排由各样玩法自己定（中转只认形状）。只往后添
 */
export const GAMES: readonly string[] = (P as { games?: string[] }).games ?? [];
export type GameKind = 'cock' | 'cuju' | 'archery' | 'seat' | 'quiz' | 'ride' | 'pitchpot' | 'skip' | 'sit' | 'misc';
/** 样子、名片、玩法一条至多几个数（与中转一样） */
export const LOOK_N = 16, CARD_N = 16, GAME_N = 16;

export type Name = [number, number];
export const nameOf = (n: Name | null | undefined): string => (n ? (NAME_A[n[0]] ?? '') + (NAME_B[n[1]] ?? '') : '');
export const robeName = (c: number): string => ROBES[c] ?? '';
const ACT_INDEX = new Map(ACTS.map(([id], i) => [id, i]));
/** 一件事的 id（如 farm:till:west）→ 单子上的序号（看冒号前那一截）；不在单子上是 −1 */
export const actIndex = (id: string | null | undefined): number => (id ? ACT_INDEX.get(id.split(':')[0]) ?? -1 : -1);
export const actLabel = (i: number): string => (i >= 0 ? ACTS[i]?.[1] ?? '' : '');
export const placeIndex = (id: string | null | undefined): number => (id ? PLACE_IDS.indexOf(id) : -1);
export const poseIndex = (p: string | null | undefined): number => Math.max(0, p ? POSES.indexOf(p) : 0);
export const phraseText = (k: number): string => PHRASES[k]?.text ?? '';
export const phraseIndex = (id: string): number => PHRASES.findIndex((p) => p.id === id);
