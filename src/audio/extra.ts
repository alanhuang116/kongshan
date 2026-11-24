/**
 * 世界里后来添的几样小声音：禽鸟扑翅（flap）、一两声啾（chirp）、两只麻雀打着滚落下来（tumble）、
 * 连枷打谷（thresh）、孩子的一串笑（laugh）；外加两个别名——cluck 就是 hen，quack 就是 duck。
 * 都是轻的、短的，远近照旧由引擎管。
 */
import type { Voice } from './engine';
import { burst, voiced } from './kit';
import { chip, playSong, type El } from './song';
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
/**
 * 一个孩子的一串笑（t 起）：三到五声短的「哈」，一声比一声低、一声比一声轻，带着气声。返回最后一声收住的时刻。
 * 整串只用一个嗓子（音高、开合都写成折线），几个孩子一起笑时节点不至于太多。
 */
export function giggle(v: Voice, t: number, p: number, a: number, dest: AudioNode = v.out): number {
  const n = 3 + Math.floor(rand(0, 3)), f0: Array<[number, number]> = [], amp: Array<[number, number]> = [];
  let x = 0, f = rand(560, 640) * p;
  for (let i = 0; i < n; i++) {
    const d = rand(0.075, 0.1), A = 1 - 0.12 * i;
    f0.push([x, f * 0.94], [x + d * 0.3, f], [x + d, f * 0.86]);
    amp.push([x, 0], [x + 0.018, A], [x + d * 0.5, 0.7 * A], [x + d, 0]);
    x += d + rand(0.075, 0.11);
    f *= rand(0.9, 0.96);
  }
  voiced(v, { t, f0, amp, formants: [[1000, 4, 1], [1750, 6, -0.55], [3300, 8, 0.25]], tilt: 3000, jitter: 18, breath: 0.45, gain: 0.3 * a, dest });
  return t + x;
}
/** 几声小鸟的「叽」（song.ts 的 chip：短、先扬后抑、带谐波与一点毛——不是一个纯的正弦）放进 v.out，幅度 amp */
function chips(v: Voice, els: El[], amp: number): number {
  const g = v.ctx.createGain();
  g.gain.value = amp;
  g.connect(v.out);
  return playSong(v.ctx, g, v.t, els);
}

export const EXTRA_SHOTS: Pick<Record<Shot, Fn>, 'flap' | 'chirp' | 'tumble' | 'thresh' | 'laugh' | 'cluck' | 'quack'> = {
  /** 扑翅：鸡扑腾两下、鸭抖抖翅膀、鸟从枝上飞起——三到五下 */
  flap(v) {
    const a = 0.5 + 0.7 * v.vel;
    return flaps(v, v.t, 3 + Math.floor(rand(0, 3)), 0.65 * a) - v.t + 0.15;
  },
  /** 一两声啾（一只小鸟、一只雏） */
  chirp(v) {
    const p = v.pitch * rand(0.92, 1.1), els: El[] = [];
    let t = 0;
    for (let i = 0, n = 1 + Math.floor(rand(0, 2.6)); i < n; i++) { const e = chip(t, p * rand(0.97, 1.04), i ? rand(0.6, 0.9) : 1); els.push(e); t += e.len + rand(0.07, 0.13); }
    chips(v, els, 0.085 * (0.5 + 0.7 * v.vel));
    return t + 0.15;
  },
  /** 两只麻雀吵着吵着打着滚落下来：一阵很急的扑翅，上头是又密又急的啾，末了落在地上轻轻一「噗」 */
  tumble(v) {
    const a = 0.5 + 0.7 * v.vel, end = flaps(v, v.t, 7 + Math.floor(rand(0, 4)), 0.5 * a, 0.055), els: El[] = [];
    for (let t = 0.03; t < end - v.t - 0.05;) { const e = chip(t, v.pitch * rand(0.95, 1.15), rand(0.6, 1)); els.push(e); t += e.len + rand(0.03, 0.07); }
    chips(v, els, 0.07 * a);
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
    return giggle(v, v.t, v.pitch * rand(0.92, 1.12), 0.5 + 0.7 * v.vel) - v.t + 0.2;
  },
  /** 别名：世界里有的地方管母鸡的叫声叫 cluck、管鸭叫叫 quack */
  cluck: (v) => VILLAGE_SHOTS.hen(v),
  quack: (v) => VILLAGE_SHOTS.duck(v),
};
