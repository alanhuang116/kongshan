/**
 * 同游的一个人在这边画成什么样：与村里人同一副身子（avatar/Figure），读书人的长衫换一种衣色（looks.ts）。
 *   位置：按他那边的钟插值（interp.ts），离得远了换处一步过去；步态只看此刻真走的快慢（按画出来的位移量，所以脚不打滑）。
 *   姿态：他坐、跪、蹲、仰卧，这边也坐、跪、蹲、仰卧；他在荡秋千、摇橹、正换处（藏）——这边不画他。
 *   作揖：两手拢在身前，躬身一下再起来。
 *   远了就省：每帧分两半——prepare（插值、量远近，人人都做，很便宜）与 refresh（重摆身子，贵）。
 *     离镜头八米内每帧摆，二十五米内隔帧，六十米内三帧一回，再远四到六帧；站着不动的更疏；不在画面里的不摆；一百六十米外不画。
 *     一帧里摆几个还有个顶（Together.budget：电脑五个、手机三个），急的、近的先摆，没轮上的下一帧先轮。
 */
import * as THREE from 'three';
import { Figure } from '../avatar/figure';
import type { PoseName } from '../avatar/types';
import type { Quality } from '../core/World';
import { Track, type View } from './interp';
import { lookFor } from './looks';
import { POSES, type Name } from './proto';
import type { State } from './wire';

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
/** 画到多远（米） */
export const DRAW = 160;
/** 留多少余量（毫秒）：中转攒一拍 100、他那边一拍 125、再加路上的抖动 */
export const DELAY = 280;
const _s = new THREE.Sphere(), _c = new THREE.Vector3();

export interface Line { k: number; until: number }

export class Remote {
  track = new Track();
  fig: Figure | null = null;
  /** 此刻画在哪、朝哪（世界坐标，脚下） */
  pos = new THREE.Vector3(); yaw = 0;
  speed = 0; private climb = 0; private turn = 0;
  pose: PoseName = 'stand';
  /** 处、事（proto 的序号）；藏着（不画） */
  place = -1; act = -1; hidden = true;
  /** 有没有收到过他的样子 */
  seen = false;
  /** 此刻画出来了（在画面里的不一定：只说没藏、不太远） */
  shown = false;
  /** 离镜头、离自己多远（米）；在不在画面里 */
  camDist = 1e9; dist = 1e9; inView = false;
  /** 头上浮着的一句话（phrases 的序号，到什么时候） */
  line: Line | null = null;
  /** 作揖：还剩几秒；正躬着（收尾时把手放回去）；换姿态的过渡还剩几秒 */
  private bowT = 0; private bowing = false; private poseT = 0;
  /** 此刻躬身的目标值（测试看他躬没躬下去） */
  get bowing01() { return this.fig?.bow ?? 0; }
  private view: View = { x: 0, y: 0, z: 0, yaw: 0, pl: -1, a: -1, po: 0, h: 1, live: false };
  private acc = 0; private frame = 0; private last = new THREE.Vector3(); private lastYaw = 0; private placed = false;

  constructor(private scene: THREE.Scene, private q: Quality, public id: number, public n: Name, public c: number, private idx: number) {}

  /** 换了名字、衣色：换一身（身子重做） */
  rename(n: Name, c: number) {
    if (n[0] === this.n[0] && n[1] === this.n[1] && c === this.c) return;
    this.n = n; this.c = c;
    if (this.fig) { this.disposeFig(); this.placed = false; }
  }

  /** 收到他的一份样子（live 为 false：进门时给的旧账，见 Track.push） */
  push(st: State, now: number, live = true) {
    this.track.push({ t: st[0], x: st[1], y: st[2], z: st[3], yaw: st[4], pl: st[6], a: st[7], po: st[8], h: st[9] }, now, live);
    this.seen = true;
  }

  /** 作揖 */
  bow() { this.bowT = 2.4; }

  private makeFig() {
    // 与村里人一样用粗一档的网（画面里的人多了也不重），贴图留得比村里人清楚些（会走到跟前来）
    const f = new Figure({ ...this.q, tier: 'low', tex: this.q.tex * 0.75 }, lookFor(this.n, this.c));
    f.root.name = `net:${this.id}`;
    f.root.visible = false;
    this.scene.add(f.root);
    this.fig = f;
  }
  private disposeFig() {
    const f = this.fig;
    if (!f) return;
    f.root.removeFromParent();
    try { f.dispose(); } catch { /* 无妨 */ }
    this.fig = null;
  }

  /** 这一帧要不要重摆身子（prepare 说的）；要的话急不急（越小越急：一步跳过去了、作揖时最急，其次是离镜头近的） */
  want = false; urge = 0;
  /** 这一帧本该摆、因为一帧的份额用完了没摆成：下一帧先摆它 */
  private owed = false;
  private snapNext = false; private movedNext = 0;

  /**
   * 每帧（便宜的那一半，人人都做）：按他那边的钟插出此刻在哪；量离自己、离镜头多远，在不在画面里；定下这一帧要不要重摆身子。
   * now 这边的钟（毫秒）；me 自己脚下；cam 镜头。
   */
  prepare(dt: number, now: number, me: THREE.Vector3, cam: THREE.Camera, frustum: THREE.Frustum, frame: number) {
    this.want = false;
    if (this.bowT > 0) this.bowT = Math.max(0, this.bowT - dt);
    const v = this.track.at(now, DELAY, this.view);
    if (!v) { this.hide(); return; }
    this.place = v.pl; this.act = v.a;
    const hidden = v.h === 1;
    this.hidden = hidden;
    this.dist = Math.hypot(v.x - me.x, v.z - me.z);
    this.camDist = _c.set(v.x, v.y + 1, v.z).distanceTo(cam.position);
    this.pos.set(v.x, v.y, v.z); this.yaw = v.yaw;
    if (hidden || this.camDist > DRAW) { this.hide(); return; }
    // 一步跳过去了（换处、被搬过去、刚出现）：不走过去，直接站在那里
    const moved = Math.hypot(v.x - this.last.x, v.z - this.last.z);
    const snap = !this.placed || moved > 3;
    this.inView = frustum.intersectsSphere(_s.set(_c.set(v.x, v.y + 0.9, v.z), 1.6));
    // 远了就省：镜头八米内每帧重摆身子，二十五米内隔帧，六十米内三帧一回，再远四到六帧；
    // 站着不动的（只在喘气）近处也隔帧、远些六帧一回。作揖、刚换了姿态的那一会儿每帧动。
    // 不动的那几帧整个人（连同位置）都不动——与村里人一样：位置每帧挪、身子隔帧摆，着地的脚就会跟着滑
    this.acc += dt;
    const still = this.speed < 0.05 && moved < 0.002 && this.bowT <= 0 && this.poseT <= 0;
    const d = this.camDist;
    const stride = this.bowT > 0 || this.poseT > 0 ? 1 : still ? (d < 25 ? 2 : 6) : d < 8 ? 1 : d < 25 ? 2 : d < 60 ? 3 : d < 120 ? 4 : 6;
    if (this.poseT > 0) this.poseT -= dt;
    this.want = snap || (this.inView && (this.owed || (frame + this.idx) % stride === 0));
    this.urge = snap || this.bowT > 0 ? -1 : this.owed ? d * 0.5 : d;
    this.snapNext = snap; this.movedNext = moved;
  }

  /** 这一帧没轮上（份额用完了）：记着，下一帧先摆 */
  defer() { if (this.want) this.owed = true; }

  /**
   * 贵的那一半：重摆身子（位置、朝向、步态、姿态、作揖）。由 Together 按每帧的份额挑着调，近的、急的先。
   */
  refresh(t: number) {
    if (!this.want) return false;
    this.want = false; this.owed = false;
    if (!this.fig) this.makeFig();
    const f = this.fig!, v = this.view, snap = this.snapNext, moved = this.movedNext;
    f.root.position.copy(this.pos); f.root.rotation.set(0, this.yaw, 0);
    if (!this.shown) { f.root.visible = true; this.shown = true; }
    const step = Math.min(this.acc, 0.25); this.acc = 0;
    // 快慢：按画出来的位移量（插值出来的那条路），抹一抹
    if (snap) { this.speed = 0; this.climb = 0; this.turn = 0; }
    else {
      const sp = moved / Math.max(step, 1e-3);
      this.speed += (sp - this.speed) * Math.min(1, step * 10);
      const dy = v.y - this.last.y;
      this.climb += ((moved > 0.004 ? Math.max(-0.5, Math.min(0.5, dy / moved)) : 0) - this.climb) * Math.min(1, step * 6);
      this.turn += (wrap(this.yaw - this.lastYaw) / Math.max(step, 1e-3) - this.turn) * Math.min(1, step * 8);
    }
    this.last.copy(this.pos); this.lastYaw = this.yaw; this.placed = true;
    // 姿态
    const pose = (POSES[v.po] ?? 'stand') as PoseName;
    if (pose !== this.pose) { this.pose = pose; f.setPose(pose, snap ? 0 : 0.9); this.poseT = snap ? 0 : 1.2; }
    else if (snap && f.pose !== pose) f.setPose(pose, 0);
    // 作揖：两手拢在身前，躬身一下（起落由身子自己的弹簧缓着）
    if (this.bowT > 0) { if (f.hands !== 'sleeve') f.setHands('sleeve', 0.35); f.bow = this.bowT > 1.15 && this.pose !== 'lie' ? 0.85 : 0; this.bowing = true; }
    else if (this.bowing) { this.bowing = false; f.bow = 0; f.setHands('free', 0.6); }
    const speed = this.speed < 0.06 || this.pose !== 'stand' ? 0 : Math.min(this.speed, 6);
    f.update(step, t, { speed, climb: this.climb, turn: Math.abs(this.turn) < 8 ? this.turn : 0 });
    this.frame++;
    return true;
  }

  private hide() {
    if (this.shown && this.fig) this.fig.root.visible = false;
    this.shown = false; this.placed = false; this.inView = false;
  }

  /** 走了：从画里拿掉 */
  dispose() { this.hide(); this.disposeFig(); }
}
