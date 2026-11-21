/**
 * 把行者的身子挂到一个会动的架子上（秋千板、船）。
 *
 * 行者的位置照旧由 player.ts 每帧写在 root 上（写的是「静止时」的那个位置）；这里在 root 外面套一层架子，
 * 架子的变换是「此刻 × 静止时的逆」——秋千荡起来、船走起来，人就跟着一起走，脚下、手里、袖子的惯性都由小人自己按真实的世界位置去算。
 * 架子在做这件事时才套上，做完摘掉（摘的时候架子先回到单位变换，人落回原处）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';

export class Carrier {
  group = new THREE.Group();
  private home: THREE.Object3D | null = null;
  constructor(private k: Anlewo, name: string) {
    this.group.name = `play:carry:${name}`;
    this.group.matrixAutoUpdate = false;
    k.world.scene.add(this.group);
  }
  get on() { return this.k.player.av.root.parent === this.group; }
  /** 套上（此刻架子是单位变换：看不出变化） */
  attach() {
    const r = this.k.player.av.root;
    if (r.parent === this.group) return;
    this.home = r.parent;
    this.group.matrix.identity(); this.group.matrixWorldNeedsUpdate = true;
    this.group.add(r);
  }
  /** 此刻的架子相对于静止时的变换 */
  set(m: THREE.Matrix4) { this.group.matrix.copy(m); this.group.matrixWorldNeedsUpdate = true; }
  /** 摘掉：人落回静止时的那个位置 */
  detach() {
    const r = this.k.player.av.root;
    if (r.parent === this.group) (this.home ?? this.k.world.scene).add(r);
    this.home = null;
    this.group.matrix.identity(); this.group.matrixWorldNeedsUpdate = true;
  }
}
