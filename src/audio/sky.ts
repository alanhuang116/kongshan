/**
 * 天上来的两样：远雷、一阵穿林的风。
 *   雷只做远的——长长的一滚，没有近处那一声炸；远近由 dist 定（越远越低、越慢、越轻），长短由 dur 定。
 *   风是从一边吹到另一边的一口气：风身（低）先到，叶声（高、有颗粒）跟着涨起来再落下去。
 */
import type { Voice } from './engine';
import { grain, hiss, wobble } from './kit';
import type { Shot } from './types';
import { clamp, rand } from './util';

/** 雷的包络：头一浪起得慢，后面几浪一浪低过一浪，中间不落到底——这就是「滚」 */
function rolls(n: number, d: number, peak: number, slow: number): Float32Array<ArrayBuffer> {
  const a = new Float32Array(n), k = 3 + Math.floor(rand(0, 4));
  const at: Array<[number, number, number, number]> = [[0, rand(0.35, 0.7) * slow, rand(1.2, 2), 1]];
  for (let i = 1; i < k; i++) at.push([rand(0.08, 0.7) * d, rand(0.15, 0.4) * slow, rand(0.7, 1.6), rand(0.35, 0.85) * Math.pow(0.8, i)]);
  let top = 1e-6;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * d;
    let s = 0;
    for (const [t0, att, dec, amp] of at) { const u = x - t0; if (u > 0) s += amp * Math.min(1, u / att) * Math.exp(-Math.max(0, u - att) / dec); }
    a[i] = s * Math.min(1, (d - x) / (d * 0.3));
    if (a[i] > top) top = a[i];
  }
  for (let i = 0; i < n; i++) a[i] *= peak / top;
  a[0] = 0; a[n - 1] = 0;
  return a;
}

export const SKY_SHOTS: Pick<Record<Shot, (v: Voice) => number>, 'thunder' | 'gust'> = {
  /**
   * 远雷。dur 是这一滚有多长（默认 6–9 秒），dist 是远近（默认 0.7）：
   * 底是褐噪声过 200Hz 上下的低通（笔记本的小喇叭放不出这么低，所以另有一层 300–500Hz 的「隆隆」），都乘同一条一浪一浪的包络。
   */
  thunder(v) {
    const c = v.ctx, t = v.t, far = v.raw.dist == null ? 0.7 : v.dist, d = clamp(v.dur ?? rand(6, 9), 3, 16), a = (0.5 + 0.7 * v.vel) * (v.raw.dist == null ? 0.45 : 1);
    const n = Math.max(24, Math.round(d * 22)), curve = rolls(n, d, 1, 0.7 + 1.1 * far);
    const env = c.createGain(), hp = c.createBiquadFilter();
    env.gain.value = 0;
    env.gain.setValueCurveAtTime(curve, t, d);
    hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.6;
    env.connect(hp); hp.connect(v.out);
    // 低处的身子
    const low = v.e.noiseSrc('brown', t, d + 0.1, rand(0.8, 1)), lf = c.createBiquadFilter(), lg = c.createGain();
    lf.type = 'lowpass'; lf.frequency.value = 250 - 90 * far; lf.Q.value = 0.7;
    lg.gain.value = 1.2 * a;
    low.connect(lf); lf.connect(lg); lg.connect(env);
    // 隆隆：中低处一层，幅度上不规则地抖
    const mid = v.e.noiseSrc('pink', t, d + 0.1), mf = c.createBiquadFilter(), am = c.createGain(), dp = c.createGain(), lfo = v.e.ctrlSrc('mid', t, rand(0.9, 1.5), d + 0.1);
    mf.type = 'bandpass'; mf.frequency.value = 420 - 120 * far; mf.Q.value = 0.8;
    am.gain.value = 0.25 * a * (1 - 0.45 * far); dp.gain.value = 0.14 * a * (1 - 0.45 * far);
    lfo.connect(dp); dp.connect(am.gain);
    mid.connect(mf); mf.connect(am); am.connect(env);
    // 不太远时，起头有一点撕开的声音（仍然是闷的，不是炸雷）
    if (far < 0.5) hiss(v, { dur: Math.min(1.6, d * 0.3), noise: 'pink', f: 900, f2: 380, q: 0.7, curve: wobble(16, 0.12 * a * (1 - 2 * far), 0.2, 0.2) });
    return d + 0.6;
  },
  /**
   * 一阵风穿过树。dur 默认四秒上下；variant：'leaf'（阔叶，默认）、'bamboo'（竹，叶声干而亮）、'pine'（松，风身高一些、叶声细）。
   */
  gust(v) {
    const c = v.ctx, t = v.t, d = clamp(v.dur ?? rand(3.5, 5), 1.5, 9), a = 0.5 + 0.7 * v.vel, kind = v.raw.variant ?? 'leaf';
    const n = Math.max(12, Math.round(d * 14));
    const p = c.createStereoPanner(), from = Math.random() < 0.5 ? -0.6 : 0.6;
    p.pan.setValueAtTime(from, t);
    p.pan.linearRampToValueAtTime(-from, t + d);
    p.connect(v.out);
    hiss(v, { dur: d, noise: 'pink', f: 420, fMid: kind === 'pine' ? 1150 : 880, f2: 480, q: 0.9, hp: 200, curve: wobble(n, 0.17 * a, 0.4, 0.08), dest: p });
    const g = grain(v, t, d, 0.55, 0.45, kind === 'bamboo' ? 0.6 : 0.35, p);
    hiss(v, { dur: d, f: kind === 'bamboo' ? 4300 : kind === 'pine' ? 3300 : 2500, q: 0.7, hp: 900, curve: wobble(n, (kind === 'bamboo' ? 0.065 : kind === 'pine' ? 0.03 : 0.05) * a, 0.45, 0.1), dest: g });
    return d + 0.3;
  },
};
