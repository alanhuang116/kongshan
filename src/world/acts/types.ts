import type * as THREE from 'three';
import type { Pointer } from '../core/World';
import type { Zone } from '../walk';

/** 做一件事时人在哪：位置、朝向（弧度，0 朝 +z，π 朝北） */
export interface Spot { x: number; z: number; yaw: number; zone?: Zone }

/**
 * 一项活动（上香、礼佛、木鱼、念珠、静坐、撞钟、抄经、放灯……）。
 * 人走近了（radius 之内）界面上出现它的名字；点了以后人自己走到 spot、站定转身，然后 enter()：
 * 摆出姿势、给镜头一个机位、接管指针。每一步把状态写进 state 并调用 ks.emitAct()，界面据此显示提示与计数。
 * 做完（界面上的「毕」）exit()：把东西放回去；人站起来、镜头回到身后由总装统一做。
 */
export interface Act {
  id: string;
  /** 两个字的名字（界面与画面上的标记都用它） */
  name: string;
  /** 画面上的标记点（世界坐标） */
  anchor: THREE.Vector3;
  spot: Spot;
  /** 离 spot 多近时可以做（默认 2.7 米） */
  radius?: number;
  /** 给界面看的状态：step（第几步）、hint（一句提示）、count（计数）…… */
  state: Record<string, unknown>;
  enter(): void;
  exit(): void;
  update?(dt: number, t: number): void;
  input?: {
    down?(p: Pointer, e: PointerEvent): void;
    /** 返回 false 表示这次拖动不归活动管（交还给镜头） */
    move?(p: Pointer, e: PointerEvent): boolean | void;
    up?(p: Pointer, e: PointerEvent): void;
    /** 返回 false 表示这一下不归活动管（当作点地面行走） */
    tap?(p: Pointer, e: PointerEvent): boolean | void;
    hover?(p: Pointer, e: PointerEvent): void;
  };
  /** 界面上的按钮发来的指令 */
  cmd?(name: string, arg?: unknown): void;
  /** 做的时候人照常走动（扫叶）：不锁住行走，做完也不把人挪回原处 */
  free?: boolean;
  /** 进行中不许滚轮推近 */
  noZoom?: boolean;
  /** 有东西在动、影子要每帧重算 */
  dynamicShadow?: boolean;
}
