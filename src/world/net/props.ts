/**
 * 同游的人身边带着的东西：他在骑牛、骑驴、斗鸡……这边也得画出那头牛、那只鸡，不然人就悬在半空、对着空地比划。
 * 哪样玩法要带什么，由那样玩法自己登记（registerRemoteProp），net/ 这边不必认得牛和鸡：
 *   make 造一份（粗一档的网就够：远处的人）；每帧摆到那个人的 root 上（位置、朝向随他），再调 update（快慢给步子用）。
 *   他不做这件事了、走了、藏了：拿掉（dispose）。
 */
import type * as THREE from 'three';
import type { Quality } from '../core/World';

export interface RemoteProp {
  /** 东西的根：摆在那个人脚下（与他的 root 同一个位置、朝向）；东西自己的偏移（牛在人身下）由它自己定 */
  root: THREE.Object3D;
  /** 每帧（重摆那个人时）：dt 秒、t 总时、speed 他此刻走得多快（米/秒） */
  update?(dt: number, t: number, speed: number): void;
  dispose(): void;
}
export interface RemotePropKind {
  make(q: Quality): RemoteProp;
}

const KINDS = new Map<string, RemotePropKind>();
/** 登记：act 是事的 id 冒号前那一截（proto 的 acts 里的那个，如 'ox'、'donkey'、'cock'） */
export function registerRemoteProp(act: string, kind: RemotePropKind) { KINDS.set(act, kind); }
export const remotePropKind = (act: string | null | undefined): RemotePropKind | null => (act ? KINDS.get(act) ?? null : null);
