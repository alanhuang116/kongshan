/**
 * 小人的入口。怎么建模、怎么动见 figure.ts（会变形的长衫与袖子）、parts.ts（头、手、鞋、斗笠与贴图）、loft.ts（每帧现摆的网）。
 * 约定与用法写在 docs/AVATAR.md。
 */
import type { Mats } from '../core/mats';
import type { Quality } from '../core/World';
import { Figure } from './figure';

export { Figure } from './figure';
export type { GroundFn } from './figure';
export type { Avatar, HandsName, PoseName, ReachOpts, Seat, Side } from './types';

/** 造一个行者。返回的是 Figure（实现了 Avatar，另有 setSeat、setGround、contact、gaitPhase、stats） */
export function createAvatar(mats: Mats, q: Quality): Figure {
  return new Figure(mats, q);
}
