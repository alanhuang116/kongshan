/**
 * 别人的位置怎么画得顺：每个人报来的一份份样子带着他自己那边的钟（毫秒），这里按那个钟插值——
 *   画的是「他那边的 lag + delay 毫秒以前」：lag 是近几秒里「到这边的时刻 − 他那边的钟」的最小值（两边的钟差加上最快的那一程路），
 *   delay 留出中转攒一拍（100 毫秒）、他那边隔一拍才发（125 毫秒）与路上的抖动。于是手里总有前后两份可以插，不抖、不顿。
 *   lag 变了（路变快、变慢）不是一下子跳过去，而是每秒最多挪 40 毫秒，画面不会突然快进。
 * 两份之间离得太远（换处、被搬过去）：不插，到了时候一步过去。最后一份之后来不及了：顺着最后的速度往前推一小段（至多 0.15 秒），再停住。
 */

export interface Sample {
  /** 他那边的钟（毫秒） */ t: number;
  x: number; y: number; z: number; yaw: number;
  /** 处、事、姿态（序号）、藏 */ pl: number; a: number; po: number; h: number;
  /** 与上一份离得太远（换处、被搬过去）：不插值，到时一步过去 */ jump: boolean;
}
export interface View { x: number; y: number; z: number; yaw: number; pl: number; a: number; po: number; h: number; /** 是插出来的（false：停在最后一份上） */ live: boolean }

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
/** 两份之间离得多远就算跳过去了（米） */
export const JUMP = 6;
/** 往前推至多多久（毫秒） */
export const LEAD = 150;

export class Track {
  buf: Sample[] = [];
  /** 此刻用的 lag（毫秒），与它该去的值 */
  lag = NaN; goal = NaN;
  /** 近几秒的「到这边的时刻、到这边 − 他那边的钟」 */
  private seen: Array<[number, number]> = [];
  private lastNow = NaN;

  /**
   * 收到一份（now 是这边的钟，毫秒）。live 为 false 的是「旧账」（进门时中转给的、各人最后报过的那一份：
   * 可能是好一会儿以前的）——收进来当起点，但不拿它量 lag。
   */
  push(s: Omit<Sample, 'jump'>, now: number, live = true) {
    const last = this.buf[this.buf.length - 1];
    if (last && s.t < last.t) return;
    const rec: Sample = { ...s, jump: !!last && Math.hypot(s.x - last.x, s.z - last.z, s.y - last.y) > JUMP };
    if (last && s.t === last.t) this.buf[this.buf.length - 1] = rec; else this.buf.push(rec);
    if (this.buf.length > 64) this.buf.shift();
    if (!live) return;
    const d = now - s.t;
    this.seen.push([now, d]);
    while (this.seen.length > 1 && now - this.seen[0][0] > 6000) this.seen.shift();
    let m = Infinity;
    for (const [, v] of this.seen) if (v < m) m = v;
    this.goal = m;
    if (Number.isNaN(this.lag)) this.lag = m;
  }

  /** 清空（重连之后他那边的钟可能从头算） */
  reset() { this.buf.length = 0; this.seen.length = 0; this.lag = this.goal = NaN; this.lastNow = NaN; }
  get empty() { return this.buf.length === 0; }
  /** 最新的一份 */
  get last(): Sample | null { return this.buf[this.buf.length - 1] ?? null; }

  /** 此刻该画成什么样（now 这边的钟，毫秒；delay 留的余量，毫秒） */
  at(now: number, delay: number, out: View): View | null {
    const b = this.buf;
    if (!b.length) return null;
    // 还没有一份是刚报来的（只有进门时的旧账）：就停在最后那一份上
    if (Number.isNaN(this.lag)) { copy(b[b.length - 1], out); out.live = false; return out; }
    // lag 缓缓地挪到该去的值（每秒至多 40 毫秒）；差得太多（头几份、路一下子变了）就直接过去
    if (!Number.isNaN(this.lastNow) && Number.isFinite(this.goal)) {
      const step = Math.max(0, now - this.lastNow) * 0.04, gap = this.goal - this.lag;
      this.lag += Math.abs(gap) > 500 ? gap : Math.max(-step, Math.min(step, gap));
    }
    this.lastNow = now;
    const rt = now - this.lag - delay;
    // 用过的旧份丢掉（留一份在 rt 之前）
    while (b.length > 2 && b[1].t <= rt) b.shift();
    const a = b[0];
    out.live = false;
    if (b.length === 1 || rt <= a.t) { copy(a, out); return out; }
    const c = b[1];
    if (rt < c.t) {
      if (c.jump) { copy(a, out); return out; }
      const u = (rt - a.t) / Math.max(1, c.t - a.t);
      out.x = a.x + (c.x - a.x) * u; out.y = a.y + (c.y - a.y) * u; out.z = a.z + (c.z - a.z) * u;
      out.yaw = wrap(a.yaw + wrap(c.yaw - a.yaw) * u);
      out.pl = a.pl; out.a = a.a; out.po = a.po; out.h = a.h; out.live = true;
      return out;
    }
    // rt 已经过了最后一份：停在最后一份上。走得还快（路上抖了一下）：顺着最后的速度往前推一点，推到 LEAD 毫秒，再用两倍的时间退回来
    // （他真停下了，最后两份本来就挨得近，不推）
    copy(c, out);
    const late = rt - c.t, gap = c.t - a.t;
    if (!c.jump && late > 0 && gap > 0 && gap < 400 && (Math.hypot(c.x - a.x, c.z - a.z) / gap) * 1000 > 0.6) {
      const e = late < LEAD ? late : Math.max(0, LEAD - (late - LEAD) / 2), k = e / gap;
      out.x += (c.x - a.x) * k; out.z += (c.z - a.z) * k; out.y += (c.y - a.y) * k;
      out.live = e > 0;
    }
    return out;
  }
}

function copy(s: Sample, o: View) { o.x = s.x; o.y = s.y; o.z = s.z; o.yaw = s.yaw; o.pl = s.pl; o.a = s.a; o.po = s.po; o.h = s.h; }
