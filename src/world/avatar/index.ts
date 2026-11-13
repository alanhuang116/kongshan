/**
 * 小人的入口。怎么建模、怎么动见 figure.ts（会变形的长衫与袖子）、parts.ts（头、手、鞋、斗笠、蓑衣与那张贴图）、loft.ts（每帧现摆的网）。
 * 约定与用法写在 docs/AVATAR.md。
 */
import type { Quality } from '../core/World';
import { Figure } from './figure';
import type { Look } from './types';

export { Figure } from './figure';
export type { GroundFn } from './figure';
export { SCHOLAR } from './parts';
export type { Avatar, HandsName, HatKind, Look, PoseName, ReachOpts, Seat, Side } from './types';

/**
 * 造一个人。look 不给就是你操纵的那个读书人（月白长衫、软巾）；给几样就只改那几样（村里的人都是这么来的）。
 * 返回的是 Figure（实现了 Avatar，另有 setSeat、setGround、contact、gaitPhase、stats、look）。
 */
export function createAvatar(q: Quality, look?: Partial<Look>): Figure {
  return new Figure(q, look);
}
