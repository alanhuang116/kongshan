/**
 * 世界里后来添的几样小声音：禽鸟扑翅（flap）、一两声啾（chirp）、两只麻雀打着滚落下来（tumble）、
 * 连枷打谷（thresh）、孩子的一串笑（laugh）；外加两个别名——cluck 就是 hen，quack 就是 duck。
 * 都是轻的、短的，远近照旧由引擎管。
 */
import type { Voice } from './engine';
import { burst, voiced } from './kit';
import type { Shot } from './types';
import { rand } from './util';
import { VILLAGE_SHOTS } from './village';

type Fn = (v: Voice) => number;

/** 扑翅：几下又软又快的「扑」——翅膀扇起来的一小口风（没有音高），一下比一下轻。返回最后一下之后的时刻 */
function flaps(v: Voice, t: number, n: number, amp: number, gap = 0.085): number {
  for (let i = 0; i < n; i++) {
    const a = amp * (1 - 0.5 * (i / Math.max(1, n - 1))) * rand(0.8, 1.1);
    burst(v, { t, dur: rand(0.05, 0.07), type: 'bandpass', f: rand(520, 760), f2: rand(300, 420), q: 0.9, amp: a, att: 0.012, noise: 'pink' });
    burst(v, { t: t + 0.006, dur: 0.04, type: 'bandpass', f: rand(1800, 2600), q: 0.8, amp: a * 0.2, att: 0.008 });
    t += gap * rand(0.85, 1.2);
  }
  return t;
}
/** 小鸟的一声啾：音高一扬一落的一个短音 */
function tweet(v: Voice, t: number, f0: number, f1: number, len: number, amp: number) {
  const c = v.ctx, o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.4);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.85, t + len);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp, t + Math.min(0.008, len * 0.25));
  g.gain.linearRampToValueAtTime(amp * 0.6, t + len * 0.6);
  g.gain.linearRampToValueAtTime(0, t + len);
  o.connect(g); g.connect(v.out);
  o.start(t); o.stop(t + len + 0.03);
}

export const EXTRA_SHOTS: Pick<Record<Shot, Fn>, 'flap' | 'chirp' | 'tumble' | 'thresh' | 'laugh' | 'cluck' | 'quack'> = {
  /** 扑翅：鸡扑腾两下、鸭抖抖翅膀、鸟从枝上飞起——三到五下 */
  flap(v) {
    const a = 0.5 + 0.7 * v.vel;
    return flaps(v, v.t, 3 + Math.floor(rand(0, 3)), 0.65 * a) - v.t + 0.15;
  },
  /** 一两声啾（一只小鸟、一只雏） */
  chirp(v) {
    const a = 0.09 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.92, 1.1);
    let t = v.t;
    for (let i = 0, n = 1 + Math.floor(rand(0, 2.6)); i < n; i++) {
      const len = rand(0.05, 0.08);
      tweet(v, t, 3300 * p, rand(4300, 4900) * p, len, a * (i ? rand(0.6, 0.9) : 1));
      t += len + rand(0.07, 0.13);
    }
    return t - v.t + 0.15;
  },
  /** 两只麻雀吵着吵着打着滚落下来：一阵很急的扑翅，上头是又密又急的啾，末了落在地上轻轻一「噗」 */
  tumble(v) {
    const a = 0.5 + 0.7 * v.vel, end = flaps(v, v.t, 7 + Math.floor(rand(0, 4)), 0.5 * a, 0.055);
    for (let t = v.t + 0.03; t < end - 0.05;) {
      const len = rand(0.04, 0.06);
      tweet(v, t, 3400 * v.pitch * rand(0.95, 1.15), rand(4400, 5200) * v.pitch, len, 0.075 * a * rand(0.6, 1));
      t += len + rand(0.03, 0.07);
    }
    burst(v, { t: end + 0.02, dur: 0.09, type: 'lowpass', f: 420, q: 0.6, amp: 0.45 * a, att: 0.006, noise: 'pink' });
    return end - v.t + 0.3;
  },
  /** 连枷打谷的一下：拍子打在铺开的谷穗上——干而闷的一「啪」，场地低低地一应，谷粒谷壳溅开又落下的一小阵沙 */
  thresh(v) {
    const a = (0.5 + 0.7 * v.vel) * rand(0.9, 1.08), t = v.t, p = v.pitch;
    burst(v, { t, dur: 0.07, type: 'bandpass', f: rand(380, 480) * p, q: 1.1, amp: 2.2 * a, att: 0.002, noise: 'pink' });
    burst(v, { t, dur: 0.12, type: 'lowpass', f: 190 * p, q: 0.7, amp: 1.2 * a, att: 0.004, noise: 'brown' });
    burst(v, { t: t + 0.004, dur: 0.05, type: 'bandpass', f: 2400, q: 0.8, amp: 0.2 * a, att: 0.001 });
    burst(v, { t: t + 0.03, dur: rand(0.22, 0.3), type: 'bandpass', f: rand(3600, 4400), f2: 2600, q: 0.9, amp: 0.09 * a, att: 0.03 });
    return 0.5;
  },
  /** 孩子的一串笑：三到五声短的「哈」，一声比一声低、一声比一声轻，带着气声 */
  laugh(v) {
    const a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.92, 1.12), n = 3 + Math.floor(rand(0, 3));
    let t = v.t, f = rand(560, 640) * p;
    for (let i = 0; i < n; i++) {
      const d = rand(0.075, 0.1);
      voiced(v, {
        t, f0: [[0, f * 0.94], [d * 0.3, f], [d, f * 0.86]], amp: [[0, 0], [0.018, 1], [d * 0.5, 0.7], [d, 0]],
        formants: [[1000, 4, 1], [1750, 6, -0.55], [3300, 8, 0.25]], tilt: 3000, jitter: 18, breath: 0.45, gain: 0.3 * a * (1 - 0.12 * i),
      });
      t += d + rand(0.075, 0.11);
      f *= rand(0.9, 0.96);
    }
    return t - v.t + 0.2;
  },
  /** 别名：世界里有的地方管母鸡的叫声叫 cluck、管鸭叫叫 quack */
  cluck: (v) => VILLAGE_SHOTS.hen(v),
  quack: (v) => VILLAGE_SHOTS.duck(v),
};
