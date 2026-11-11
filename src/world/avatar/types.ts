/**
 * 小人：寺里那个由你操纵着走动的行者。这里只有接口——怎么建模、怎么动在 figure.ts 等文件里。
 *
 * 分工：位置与朝向由外面（player.ts）设在 root 上；小人自己负责「身体怎么动」：
 *   走路的步态（步幅与速度同步，脚不打滑）、站立时的呼吸、四种姿态（站 / 跪 / 坐 / 蹲）之间的过渡、
 *   俯身（鞠躬、叩拜）、手的几种摆法、把手伸到世界里的某一点（反向运动学）、头看向某处。
 * 各项活动靠这几样拼出所有动作：东西（槌、香、帚、壶……）由活动自己移动，小人的手跟着伸过去。
 */
import type * as THREE from 'three';

export type PoseName = 'stand' | 'kneel' | 'sit' | 'crouch';
/** 手的摆法：free 自然下垂、走路时随步子摆；sleeve 两手拢在身前（古人站立行走的常态）；pray 胸前合十；lap 叠放腹前（坐着时即禅定印） */
export type HandsName = 'free' | 'sleeve' | 'pray' | 'lap';
export type Side = 'L' | 'R';

/** 身下垫着的东西（蒲团、拜垫）。root 在垫子的顶面上；垫子以外的衣摆、脚、按地的手会落到地面去 */
export interface Seat {
  /** 垫子的顶面比地面高多少 */ h: number;
  /** 圆垫的半径（蒲团） */ r?: number;
  /** 方垫的半宽、半深（拜垫） */ hx?: number; hz?: number;
  /** 垫子的中心在小人自己坐标里的位置（默认就在身下） */ cx?: number; cz?: number;
}
export interface ReachOpts {
  /** 手指（或手里的东西）指向哪：世界方向。不给就顺着前臂 */
  dir?: THREE.Vector3;
  /** 手心朝哪：世界方向。不给就由它自己定 */
  palm?: THREE.Vector3;
  /** 过渡的快慢（1/秒），默认 10；越大跟得越紧 */
  rate?: number;
}

export interface Avatar {
  /** 根：原点在两脚之间的地面上，面朝自己的 +z。外面设 position 与 rotation.y */
  root: THREE.Group;
  /** 站直时的身高、眼睛的高度（米） */
  readonly height: number;
  readonly eyeY: number;
  /**
   * 关节与挂点。handL / handR 是掌心的挂点：原点在掌心，+y 指向指尖，+z 是手心朝的方向——
   * 把东西 add 上去它就被「拿着」了。都可以 getWorldPosition 取世界坐标。
   */
  joints: { hips: THREE.Object3D; chest: THREE.Object3D; head: THREE.Object3D; handL: THREE.Object3D; handR: THREE.Object3D };
  /** 姿态（有过渡，dur 秒，默认约 0.9） */
  setPose(p: PoseName, dur?: number): void;
  readonly pose: PoseName;
  /** 手的摆法（有过渡） */
  setHands(h: HandsName, dur?: number): void;
  /**
   * 俯身的目标值 0…1（内部平滑）：站着是鞠躬；跪着是叩拜——上身伏下、额头近地、两手前伸按在地上；坐着是略略低头。
   */
  bow: number;
  /** 把一只手伸到世界里的一点（掌心到那里）；给 null 则放回姿态自己的摆法。够不着时尽量伸过去 */
  reach(side: Side, target: THREE.Vector3 | null, o?: ReachOpts): void;
  /** 头转向世界里的一点（有限度）；null 则看前方 */
  lookAt(p: THREE.Vector3 | null): void;
  /**
   * 每帧调用。speed：地面速度（米/秒，0 即站着）；climb：坡度（升/程，上台阶为正、下为负）；turn：转身的角速度（弧度/秒，用来让身子略倾）。
   */
  update(dt: number, t: number, move: { speed: number; climb?: number; turn?: number }): void;
  /** 每落一步调用一次（给脚步声用） */
  onStep: ((foot: Side) => void) | null;
  /** 脚下真实的地面：fn 收世界坐标 (x, z)，返回那里地面的世界高度（界外为 null）。有了它，上下台阶时脚落在踏面上 */
  setGround?(fn: ((x: number, z: number) => number | null) | null): void;
  /** 身下垫着什么（坐蒲团、跪拜垫时由活动告诉他）；null 即直接在地上 */
  setSeat?(s: Seat | null): void;
  setVisible(v: boolean): void;
  dispose(): void;
}
