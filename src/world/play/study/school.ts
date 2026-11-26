/**
 * 村塾里此刻有没有讲：学堂讲卦那一路（play/lecture.ts）每帧写，村里人那一路（life/people.ts）读。
 *   on —— 邵先生回来讲卦的那一阵（聚、讲、问、散）：孩子们回到自己天天坐的那一席，静静地听，不念书；塾师让出高桌，到檐下坐着陪听。
 *   at —— 先生坐在哪里（孩子们抬头看他）。
 * 放在这么一个小文件里，两边谁也不必把对方整个牵进来。
 */
import type * as THREE from 'three';

export const SCHOOL: { on: boolean; at: THREE.Vector3 | null } = { on: false, at: null };
