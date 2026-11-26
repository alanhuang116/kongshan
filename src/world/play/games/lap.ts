/**
 * 绕村一圈（只有数，没有画）：村里几处地方连成一圈，从牲口歇着的那一处出发，挨个经过别的几处，回到出发的那一处，记用了几秒。
 *   往哪个方向绕都行：出发以后先经过哪一个邻处，就照那个方向一路走下去；跳过了的不算，回头补上再接着走。
 *   离出发处远过它的一圈才起表；回到出发处、别的几处都经过了，表停。
 */

export interface Mark { id: string; name: string; x: number; z: number; r: number }
export type LapEvent = { kind: 'go' } | { kind: 'pass'; mark: Mark; n: number } | { kind: 'done'; secs: number };

export class Lap {
  /** 出发以后过了几秒（起表前是 0） */
  t = 0;
  started = false; done = false;
  /** 往哪个方向：1 顺着单子、−1 倒着，0 还没定 */
  dir: -1 | 0 | 1 = 0;
  /** 经过了几处（不算出发的那一处） */
  n = 0;
  private at: number;
  constructor(public ring: Mark[], public start: number) { this.at = start; }
  get total() { return this.ring.length - 1; }
  private idx(i: number) { const L = this.ring.length; return ((i % L) + L) % L; }
  /** 下一处（方向没定时是两边的邻处） */
  next(): Mark[] {
    if (this.done) return [];
    if (this.n >= this.total) return [this.ring[this.start]];
    if (!this.dir) return [this.ring[this.idx(this.start + 1)], this.ring[this.idx(this.start - 1)]];
    return [this.ring[this.idx(this.at + this.dir)]];
  }
  /** 每帧：人（牲口）在 (x, z)。返回这一帧出了什么事 */
  update(x: number, z: number, dt: number): LapEvent | null {
    if (this.done) return null;
    const S = this.ring[this.start];
    if (!this.started) {
      if (Math.hypot(x - S.x, z - S.z) > S.r + 1.5) { this.started = true; this.t = 0; return { kind: 'go' }; }
      return null;
    }
    this.t += dt;
    if (this.n >= this.total) {
      if (Math.hypot(x - S.x, z - S.z) <= S.r) { this.done = true; return { kind: 'done', secs: Math.round(this.t) }; }
      return null;
    }
    const cand = this.dir ? [this.dir] : [1, -1];
    for (const d of cand) {
      const i = this.idx(this.at + d), m = this.ring[i];
      if (Math.hypot(x - m.x, z - m.z) <= m.r) {
        this.dir = d as -1 | 1; this.at = i; this.n++;
        return { kind: 'pass', mark: m, n: this.n };
      }
    }
    return null;
  }
}
