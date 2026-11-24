/**
 * 闲着的时候做什么（行者用；村里人也可以用）：
 *   站着——站定一会儿，隔一阵换一换手的摆法（负手、拢袖、垂手），隔一阵做个小动作（理袖、望天、回头看一眼、捻须，偶尔伸个懒腰）；
 *   散步——从容地走了一阵，多半就负手而行；走着偶尔往旁边看一眼；快走、跑起来手就放开；
 *   下雨下雪在外头——戴上斗笠、披上蓑衣（头顶有屋顶、屋檐就卸下；进出屋檐那一下不来回换：在檐下待了半秒多才卸，出去一会儿才戴）；
 *     站在雨里，隔一阵抬手扶一扶笠沿（shade）。雨具不算小动作：做事时、身子被占着时照样跟着天时与在不在檐下戴、卸。
 * 只在身子没被别的事占着时才动：做事时（busy：锁着、或总装说着在做事）、或身子 engaged（不是站着、俯身、手伸着或拿着东西、
 * 头看着某处、身下垫着东西）时一概不出，手上的摆法也不去碰。被占过之后计时从头算，所以做完事站起来要过一会儿才又有小动作。
 */
import { SKY, WET, shelterAt } from './gear';
import type { Avatar, GestureName, HandsName } from './types';

export interface IdleState {
  /** 此刻的地面速度（米/秒；按世界算） */
  speed: number;
  /** 正在做事（锁着，或总装说着在做事）：什么都不动 */
  busy: boolean;
  /** 夜（0…1）：夜里望天的多些 */
  night: number;
  /** 雨（0…1） */
  rain: number;
  /** 雪（0…1）；不给就取村里那一路报上来的（gear.ts 的 SKY） */
  snow?: number;
  /** 在屋里（草堂、亭里）：不戴雨具 */
  indoor: boolean;
}

/** 站着时小动作的轻重（相对的多少）：理袖、望天、回头、捻须、伸懒腰 */
const PICK: Array<[GestureName, number]> = [['tidy', 0.24], ['sky', 0.2], ['glance', 0.25], ['beard', 0.17], ['stretch', 0.08]];

export class Idle {
  /** 关掉就什么都不做 */
  on = true;
  /** 快到多少（米/秒）算「快走、跑」：手放开、不负手、不遮雨 */
  quick = 2.0;
  private still = 0; private walk = 0;
  private nextG = 6; private nextH = 4; private nextLook = 6;
  /** 这一程走着要不要负手、走多久才负手 */
  private strollBack = true; private strollAt = 9;
  /** 最近一次是我换的手的摆法（换处、跳到别处时放回垂手） */
  private mine: HandsName | null = null;
  private last: GestureName | null = null;
  private stretchAgo = 99;
  /** 刚做完一件事站起来（被占了好一阵）：伸懒腰的多些 */
  private sat = 0; private afterSit = false;
  /** 雨具：此刻要不要戴、想换成另一样已经多久了；下一回直接换好（刚开场、刚换了处）；站在雨里多久扶一回笠沿 */
  private gearWant = false; private gearT = 0; private gearSnap = true; private brimNext = 6;
  private seed: number;

  constructor(private av: Avatar, seed = 20261121) { this.seed = (Math.abs(Math.floor(seed)) % 2147483646) + 1; this.newStroll(); }

  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }
  private newStroll() { this.strollBack = this.rnd() < 0.7; this.strollAt = 8.5 + this.rnd() * 6; }

  /** 换处、被搬到别处之后：从头算起；手若是我换的，放回垂手 */
  reset() {
    this.gearSnap = true;
    this.still = 0; this.walk = 0; this.nextG = 6 + this.rnd() * 4; this.nextH = 4 + this.rnd() * 3; this.nextLook = 5 + this.rnd() * 6;
    if (this.av.gesturing) this.av.gesture?.(null);
    if (this.mine && this.av.hands === this.mine && this.mine !== 'free') this.av.setHands('free', 0);
    this.mine = null; this.newStroll();
  }

  update(dt: number, st: IdleState) {
    const av = this.av;
    this.stretchAgo += dt;
    // 雨具：下雨下雪、头顶没有屋顶（不在屋里亭里、也不在檐下）就戴；在不在雨里变了，过一小会儿才跟着换（进出屋檐不来回）
    const sky = Math.max(st.rain, st.snow ?? SKY.snow), r = av.root.position;
    const wantGear = sky > WET && !st.indoor && !shelterAt(r.x, r.y + 1.35, r.z);
    if (this.gearSnap) { this.gearWant = wantGear; this.gearT = 0; }
    else if (wantGear !== this.gearWant) { this.gearT += dt; if (this.gearT > (wantGear ? 0.35 : 0.6)) { this.gearWant = wantGear; this.gearT = 0; } }
    else this.gearT = 0;
    av.setGear?.(this.gearWant ? 1 : 0, this.gearSnap);
    this.gearSnap = false;
    if (!this.on || st.busy || av.engaged) {
      // 被占着：什么都不做，计时从头算；我换过的手也不再归我管
      if (st.busy || av.engaged) this.sat += dt;
      this.still = 0; this.walk = 0; this.mine = null;
      this.nextG = 4.5 + this.rnd() * 4; this.nextH = 3 + this.rnd() * 4;
      return;
    }
    if (this.sat > 20) this.afterSit = true;
    this.sat = 0;
    const hands = av.hands ?? 'free', moving = st.speed > 0.15, quick = st.speed > this.quick;
    // 雨里：斗笠遮着，不再抬袖遮雨；站着时隔一阵扶一扶笠沿（见下），跑起来、进了檐下就放下
    const wet = this.gearWant;
    if (av.gesturing === 'shade' && (quick || !wet)) av.gesture?.(null);

    if (moving) {
      this.still = 0;
      if (quick) {
        // 快走、跑：手放开（跑的摆臂、提衣都要手）
        if (this.walk > 0) this.newStroll();
        this.walk = 0;
        if (hands === 'back' || hands === 'sleeve') { av.setHands('free', 0.3); this.mine = 'free'; }
        return;
      }
      this.walk += dt;
      // 散步走了一阵：负手而行
      if (this.strollBack && this.walk > this.strollAt && hands === 'free' && !wet) { av.setHands('back', 0.9); this.mine = 'back'; }
      // 走着偶尔往旁边看一眼
      this.nextLook -= dt;
      if (this.nextLook <= 0 && this.walk > 3 && !av.gesturing && !wet) { av.gesture?.('look', this.rnd() < 0.5 ? 1 : -1); this.nextLook = 9 + this.rnd() * 12; }
      return;
    }
    // 站着
    if (this.walk > 0) this.newStroll();
    this.walk = 0; this.still += dt;
    if (this.still < 1.5) return;
    if (wet) {
      // 站在雨里：别的小动作不做，隔一阵抬手扶一扶笠沿
      this.brimNext -= dt;
      if (this.brimNext <= 0 && !av.gesturing && (av.gearK ?? 0) > 0.95) { av.gesture?.('shade', this.rnd() < 0.6 ? -1 : 1); this.brimNext = 9 + this.rnd() * 9; }
      return;
    }
    // 歇着的手：隔一阵换一换（负手、拢袖、垂手）
    this.nextH -= dt;
    if (this.nextH <= 0 && !av.gesturing) {
      const r = this.rnd(), want: HandsName = r < 0.45 ? 'back' : r < 0.8 ? 'sleeve' : 'free';
      if (want !== hands) { av.setHands(want, want === 'back' ? 0.9 : 0.6); this.mine = want; }
      this.nextH = 14 + this.rnd() * 16;
    }
    // 小动作：隔七到十几秒一个，不连着做同一个；伸懒腰一分钟里至多一回（久坐起来先伸一个）
    this.nextG -= dt;
    if (this.nextG <= 0 && !av.gesturing) {
      const g = this.afterSit && this.stretchAgo > 30 ? 'stretch' : this.pick(st);
      this.afterSit = false;
      if (g) { av.gesture?.(g); this.last = g; if (g === 'stretch') this.stretchAgo = 0; }
      this.nextG = 7 + this.rnd() * 9;
    }
  }

  private pick(st: IdleState): GestureName | null {
    let sum = 0;
    const w = PICK.map(([g, v]) => {
      let x = g === this.last ? 0 : v;
      if (g === 'sky') x *= 1 + 1.2 * st.night;
      if (g === 'stretch' && this.stretchAgo < 60) x = 0;
      sum += x; return x;
    });
    let r = this.rnd() * sum;
    for (let i = 0; i < PICK.length; i++) { r -= w[i]; if (r <= 0 && w[i] > 0) return PICK[i][0]; }
    return null;
  }
}
