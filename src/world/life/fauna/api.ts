/**
 * 给别的几路用的接口：放羊的老汉赶羊、石磨与驮东西用的毛驴、托事里走散的鸡、做事时要的鸡群鸭群狗猫鱼。
 * 用法（村人、农事、说话那几路）：
 *
 *   import { FAUNA } from '../life/fauna/api';          // 在 life/ 里是 './fauna/api'
 *   FAUNA.sheep?.follow(老汉);                          // 羊群跟着一个会走的东西（有 pos 的）；follow(null) 放开
 *   FAUNA.sheep?.lead(x, z);                            // 赶到某处（边走边吃）
 *   FAUNA.donkey?.circle(cx, cz, 1.6);                  // 拉磨：绕着磨盘转
 *   FAUNA.hens?.stray();                                // 托事：乙家的一只母鸡走散了（行者去抱回来，见 acts/beasts.ts 的「抱鸡」「放鸡」）
 *
 * FAUNA 在 createLife 时填上（人物那一块没装上、或台子上没有生灵时是 null）。都写在 docs/LIFE.md 的「给别处用的接口」一节。
 */
import type * as THREE from 'three';

/** 会走的东西：人（life/person.ts 的 Person）、行者都行 */
export interface Mover { pos: THREE.Vector3; yaw?: number }

/** 羊群（一只头羊、几只绵羊，春天带几只羊羔） */
export interface SheepApi {
  /** 此刻在不在外面（夜里、大雨大雪天在圈里） */
  readonly present: boolean;
  /** 羊群的中心、头羊在哪 */
  readonly center: THREE.Vector3; readonly leader: THREE.Vector3;
  readonly count: number;
  /** 赶到 (x, z)：羊群朝那里去，边走边低头吃草；到了就在那一带散开吃 */
  lead(x: number, z: number): void;
  /** 跟着一个会走的东西（放羊的人）：走着时跟在他身后五六步一大群，他站下了羊就在他周围散开吃草；给 null 放开（就地吃草） */
  follow(who: Mover | null): void;
  /** 在 (x, z) 周围 r 米内散着吃草 */
  graze(x: number, z: number, r?: number): void;
  /** 回圈：走到圈门（home）不见了 / 出圈：从圈门出来。不叫它，它按时辰自己出入 */
  pen(): void; out(): void;
  /** 圈门在哪（羊回圈时走到这里不见；出圈也从这里出来） */
  home: { x: number; z: number };
  /** 交给别人管（true）：不再按时辰自己出入、自己找草地；false 交回 */
  manual: boolean;
}

/** 毛驴：拴着、拉磨、驮东西 */
export interface DonkeyApi {
  readonly present: boolean;
  readonly pos: THREE.Vector3;
  /** 拴在一处（桩子随它摆过去），绳长 rope 米；它在绳够得着的地方吃草、站着打盹、偶尔叫一声 */
  tether(x: number, z: number, rope?: number): void;
  /** 拉磨：蒙上眼，绕着 (cx, cz) 半径 r 转（每圈约 r × 2π ÷ 0.7 秒）；给 null 停下 */
  circle(cx: number, cz: number, r?: number): void;
  stop(): void;
  /** 被人牵着走（跟在他身后一步多）；给 null 原地站下 */
  follow(who: Mover | null): void;
  /** 驮着什么：'sack' 两只粮袋、'wood' 两捆柴、null 空着 */
  load(kind: 'sack' | 'wood' | null): void;
  /** 交给别人管：true 时不再按时辰自己回家、出来 */
  manual: boolean;
  /** 叫一声 */
  bray(): void;
}

/** 托事里走散的那只鸡（乙家的一只母鸡） */
export interface StrayHen {
  /** 'none' 没走散；'wander' 在外头转悠；'held' 被行者抱着；'back' 刚送回去 */
  readonly state: 'none' | 'wander' | 'held' | 'back';
  /** 她此刻在哪（走散时） */
  readonly pos: THREE.Vector3;
  /** 送回哪里（乙家门前鸡群那一处） */
  readonly home: { x: number; z: number };
}
export interface HensApi {
  /** 让乙家的一只母鸡走散：自己溜达到 (x, z) 一带（不给就挑一处：石桥头的柳下、竹林边、桑园……），返回她去了哪 */
  stray(x?: number, z?: number): { x: number; z: number };
  readonly lost: StrayHen;
  /** 送回去了（放到乙家鸡群里那一刻）调一次 */
  onHome: (() => void) | null;
  /** 撒一把食：附近的鸡围过来抢（n 粒；喂鸡那件事用） */
  scatter(x: number, z: number, n?: number): void;
}

export interface FaunaApi {
  sheep: SheepApi | null;
  donkey: DonkeyApi | null;
  hens: HensApi | null;
}

/** 填在这里，谁要谁取（没有就是 null） */
export const FAUNA: FaunaApi = { sheep: null, donkey: null, hens: null };
