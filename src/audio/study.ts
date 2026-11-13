/**
 * 书房与院里的东西：翻书、铺纸、一笔、研墨、注茶斟酒、煮水、放盏、点灯焚香；扫落花、浇菊、柴门板门、叩门；
 * 露水、檐滴、落水、拨水。都是近在手边的小声音——轻，但每一样要认得出是什么。
 *
 *   纸、笔、帚、墨 ＝ 滤过的噪声，包络与颗粒决定它是什么（纸脆、笔润、帚沙、墨细而匀）；
 *   水 ＝ 气泡（往上滑的正弦）加一点水花；注水时盏里的空腔越来越小，共鸣一路升上去；
 *   瓷 ＝ 两三个很高的分音，几十毫秒；木 ＝ 槌头一下激起的低共鸣；门轴 ＝ 粘一下滑一下。
 */
import type { Engine, Voice } from './engine';
import { bubble, burst, creak, glide, grain, hiss, mode, plateau, reson, tap, wobble } from './kit';
import type { Shot } from './types';
import { bubbleField, rand } from './util';

// ———————————————————————————— 煮水 ————————————————————————————
export interface KettleGraph { out: GainNode; srcs: AudioScheduledSourceNode[]; nodes: AudioNode[] }
/**
 * 茶炉上的一壶水，从坐上去到滚开（rise 秒）：
 *   先是壶底极细的一点响（蟹眼）；嘶声渐渐起来、渐渐低下去——「飕飕欲作松风鸣」；
 *   将开时细泡密了（鱼眼），壶身低低地鸣；滚开之后嘶声反而退一些，换成一串串「咕嘟」的大泡。之后一直是滚着的样子。
 * 一击（kettle）与那一层（setLoop('kettle')）共用这张图。
 */
export function kettleGraph(e: Engine, t: number, rise: number): KettleGraph {
  const c = e.ctx, srcs: AudioScheduledSourceNode[] = [], nodes: AudioNode[] = [];
  const G = (v: number) => { const g = c.createGain(); g.gain.value = v; nodes.push(g); return g; };
  const F = (type: BiquadFilterType, f: number, q: number) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; nodes.push(b); return b; };
  const S = <T extends AudioScheduledSourceNode>(s: T) => { srcs.push(s); nodes.push(s); return s; };
  const ramp = (p: AudioParam, pts: Array<[number, number]>) => { p.setValueAtTime(pts[0][1], t); for (const [u, v] of pts) p.linearRampToValueAtTime(v, t + u * rise); };
  const out = G(1);
  // 嘶：越烧越响，中心越来越低；幅度上细细地抖
  const white = S(e.noiseSrc('white', t)), bp = F('bandpass', 4200, 0.9), hp = F('highpass', 1200, 0.6), hissG = G(0), am = G(0.8);
  const lfo = S(e.ctrlSrc('mid', t, 1.4)), dp = G(0.2);
  bp.frequency.setValueAtTime(4200, t);
  bp.frequency.exponentialRampToValueAtTime(2600, t + rise * 0.85);
  bp.frequency.exponentialRampToValueAtTime(2300, t + rise);
  lfo.connect(dp); dp.connect(am.gain);
  white.connect(bp); bp.connect(hp); hp.connect(hissG); hissG.connect(am); am.connect(out);
  ramp(hissG.gain, [[0, 0], [0.25, 0.025], [0.6, 0.07], [0.88, 0.11], [1, 0.075]]);
  // 壶身的低鸣
  const pink = S(e.noiseSrc('pink', t)), rf = F('bandpass', 330, 2.5), rumG = G(0);
  pink.connect(rf); rf.connect(rumG); rumG.connect(out);
  ramp(rumG.gain, [[0, 0], [0.2, 0], [0.7, 0.2], [1, 0.5]]);
  // 细泡（蟹眼、鱼眼）
  const fine = e.cached('bubbles-fine', () => bubbleField(c, { seconds: 4.7, rate: 30, fLo: 1500, fHi: 4500, q: 8, skew: 1.8 }));
  const fs = S(e.loopSrc(fine, t, rand(0.95, 1.05))), fineG = G(0);
  fs.connect(fineG); fineG.connect(out);
  ramp(fineG.gain, [[0, 0], [0.3, 0], [0.7, 0.2], [1, 0.1]]);
  // 滚开的大泡
  const big = e.cached('bubbles-kettle', () => bubbleField(c, { seconds: 5.3, rate: 16, fLo: 240, fHi: 950, q: 5, chirp: 0.25, skew: 1.6 }));
  const bubG = G(0), lp = F('lowpass', 1800, 0.5);
  for (const rate of [0.9, 1.12]) { const s = S(e.loopSrc(big, t, rate)); s.connect(bubG); }
  bubG.connect(lp); lp.connect(out);
  ramp(bubG.gain, [[0, 0], [0.6, 0], [0.85, 0.06], [1, 0.16]]);
  return { out, srcs, nodes };
}

// ———————————————————————————— 注水 ————————————————————————————
/** 一条从盏口注下去的水：水声（颗粒状的带通噪声）、盏里空腔的共鸣（越满越高）、小气泡 */
function pourInto(v: Voice, d: number, a: number, o: { stream: number; streamAmp: number; cav: [number, number]; cavQ: number; cavAmp: number; bub: [number, number]; bubAmp: number }) {
  const t = v.t, am = grain(v, t, d, 0.65, 0.35, 0.5);
  const env = (peak: number) => plateau(24, peak, 0.07, 0.12);
  hiss(v, { dur: d, f: o.stream, q: 0.7, curve: env(o.streamAmp * a), dest: am });
  hiss(v, { dur: d, noise: 'pink', f: o.cav[0], f2: o.cav[1], q: o.cavQ, curve: env(o.cavAmp * a), dest: am });
  for (let i = 0, n = Math.round(d * 9); i < n; i++) {
    const f = rand(o.bub[0], o.bub[1]);
    bubble(v, t + rand(0.05, d - 0.1), f, f * rand(1.3, 1.9), rand(0.02, 0.04), o.bubAmp * a * rand(0.4, 1));
  }
}

type Fn = (v: Voice) => number;
export const STUDY_SHOTS: Pick<Record<Shot, Fn>, 'page' | 'paper' | 'brush' | 'inkstone' | 'pour' | 'kettle' | 'fan' | 'cup' | 'bowl' | 'stone' | 'lamp' | 'ignite' | 'ash' | 'broom' | 'water' | 'gate' | 'door' | 'knock' | 'dew' | 'drip' | 'plop' | 'ripple'> = {
  /** 翻一页线装书：软纸掀起来的一「唰」（先扬后落），两三下极轻的折响，落在另一页上闷闷的一下 */
  page(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.3, 0.42);
    hiss(v, { dur: d, f: 1900, fMid: 3600, f2: 2200, q: 0.8, hp: 700, curve: wobble(12, 0.085 * a, 0.4, 0.2) });
    for (let i = 0; i < 3; i++) burst(v, { t: t + rand(0.03, d * 0.8), dur: 0.004, f: rand(3500, 6500), q: 2, amp: 0.04 * a * rand(0.4, 1), att: 0.0005 });
    burst(v, { t: t + d - 0.03, dur: 0.07, type: 'lowpass', f: 520, f2: 260, q: 0.7, amp: 0.1 * a, att: 0.012, noise: 'pink' });
    return d + 0.2;
  },
  /**
   * 纸。不给 variant：拿起、放下一张纸（一阵沙沙，几下细小的折响）；
   * 'unroll'：把一卷纸展开（dur，默认 1.1 秒）——纸卷滚开的低声，一路细碎的折响；
   * 'smooth'：手掌把纸抚平（dur，默认 0.55 秒）——很软的一「沙——」。
   */
  paper(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, kind = v.raw.variant;
    if (kind === 'unroll') {
      const d = Math.max(0.5, v.dur ?? 1.1), n = Math.max(12, Math.round(d * 20));
      hiss(v, { dur: d, noise: 'pink', f: 700, f2: 1100, q: 0.8, curve: plateau(n, 0.1 * a, 0.15, 0.25, 0.12) });
      hiss(v, { dur: d, f: 2600, f2: 3400, q: 0.8, hp: 1200, curve: plateau(n, 0.045 * a, 0.2, 0.3, 0.2), dest: grain(v, t, d, 0.6, 0.4, 0.3) });
      for (let i = 0, k = Math.round(d * 9); i < k; i++) burst(v, { t: t + rand(0.05, d - 0.05), dur: 0.004, f: rand(4000, 7500), q: 2, amp: 0.06 * a * rand(0.3, 1), att: 0.0004 });
      return d + 0.15;
    }
    if (kind === 'smooth') {
      const d = Math.max(0.3, v.dur ?? 0.55);
      hiss(v, { dur: d, noise: 'pink', f: 1300, fMid: 1900, f2: 1200, q: 0.7, hp: 500, curve: wobble(Math.max(8, Math.round(d * 24)), 0.075 * a, 0.35, 0.1) });
      return d + 0.1;
    }
    burst(v, { dur: 0.32, f: 3000, f2: 1300, q: 0.9, amp: 0.23 * a, att: 0.05 });
    for (let i = 0; i < 5; i++) burst(v, { t: t + rand(0.02, 0.26), dur: 0.005, f: rand(4000, 8000), q: 2, amp: 0.13 * a * rand(0.5, 1), att: 0.0004 });
    return 0.5;
  },
  /** 饱蘸了墨的笔在宣纸上的一笔（dur 定长短）：粉噪声过带通，包络像一口气，略带抖动；底下一点润 */
  brush(v) {
    const d = Math.max(0.12, v.dur ?? 0.5), a = 0.32 * (0.5 + 0.7 * v.vel), n = Math.max(8, Math.round(d * 30));
    hiss(v, { dur: d, noise: 'pink', f: 1900, fMid: 2600, f2: 1500, q: 0.7, hp: 600, curve: wobble(n, a, 0.25, 0.14) });
    hiss(v, { dur: d, noise: 'pink', type: 'lowpass', f: 520, q: 0.7, curve: wobble(n, a * 0.22, 0.3, 0.1) });
    return d + 0.1;
  },
  /**
   * 研墨：墨锭在砚上慢慢转一圈（dur，默认一秒上下）。细而匀的摩擦，一圈里有两处略重（推出去、拉回来）；
   * 石头低低地应着，水是一点润。要一直磨就用 setLoop('inkstone')。
   */
  inkstone(v) {
    const d = Math.max(0.5, v.dur ?? 1.05), a = 0.5 + 0.7 * v.vel, t = v.t, n = Math.max(16, Math.round(d * 24)), ph = rand(0, Math.PI * 2);
    const curve = (peak: number) => {
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) { const u = i / (n - 1); x[i] = peak * Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.15) * (0.72 + 0.28 * Math.cos(Math.PI * 4 * u + ph)) * (1 + rand(-0.06, 0.06)); }
      x[0] = 0; x[n - 1] = 0;
      return x;
    };
    hiss(v, { dur: d, f: 2500, fMid: 2900, f2: 2400, q: 1.3, hp: 900, curve: curve(0.06 * a), dest: grain(v, t, d, 0.7, 0.3, 0.5) });
    hiss(v, { dur: d, noise: 'pink', f: 880, q: 2.5, curve: curve(0.05 * a) });
    hiss(v, { dur: d, noise: 'pink', type: 'lowpass', f: 380, q: 0.7, curve: curve(0.025 * a) });
    return d + 0.1;
  },
  /**
   * 注（dur 定长短）。variant：
   *   'tea'  茶从壶嘴注进小盏：水细、盏小——共鸣从 700Hz 升到 1.9kHz，默认 2.2 秒；
   *   'wine' 酒从杓里倾进盏：水宽、短——共鸣低（340→820Hz），带两三声「咕嘟」，末了一两滴，默认 1.3 秒；
   *   'water' 往碗里注水（420→1150Hz，默认 2.5 秒）。
   * 不给 variant 时看 pitch：0 上下是茶，低两个半音以上（世界那边用 −3、−5）就是酒。
   */
  pour(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, semis = v.raw.pitch ?? 0, kind = v.raw.variant ?? (semis <= -1.5 ? 'wine' : 'tea');
    if (kind === 'wine') {
      // 低三个半音是寻常的一盏；再低就是大一些的盏
      const p = semis <= -1.5 ? v.pitch / 0.841 : v.pitch, d = Math.max(0.5, v.dur ?? 1.3);
      pourInto(v, d, a, { stream: 1900, streamAmp: 0.11, cav: [340 * p, 820 * p], cavQ: 5, cavAmp: 0.8, bub: [500, 1100], bubAmp: 0.03 });
      for (let i = 0, n = 2 + Math.floor(rand(0, 2)); i < n; i++) { const f = rand(240, 420) * p; bubble(v, t + 0.12 + (i * (d - 0.3)) / n + rand(0, 0.08), f, f * 1.7, rand(0.07, 0.1), 0.09 * a); }
      for (let i = 0; i < 2; i++) { const f = rand(900, 1500); bubble(v, t + d + 0.12 + i * rand(0.16, 0.3), f, f * 1.8, 0.03, 0.035 * a); }
      return d + 0.8;
    }
    const p = v.pitch;
    if (kind === 'water') {
      const d = Math.max(0.6, v.dur ?? 2.5);
      pourInto(v, d, a, { stream: 2400, streamAmp: 0.105, cav: [420 * p, 1150 * p], cavQ: 5, cavAmp: 0.75, bub: [500, 1200], bubAmp: 0.03 });
      return d + 0.2;
    }
    const d = Math.max(0.6, v.dur ?? 2.2);
    pourInto(v, d, a, { stream: 3000, streamAmp: 0.07, cav: [700 * p, 1900 * p], cavQ: 6, cavAmp: 0.5, bub: [900, 2000], bubAmp: 0.022 });
    return d + 0.2;
  },
  /** 一壶水从坐上炉子到滚开，压在 dur 秒里（默认 8 秒）听一遍。真用的时候是 setLoop('kettle', 1)：水慢慢开，之后一直滚着 */
  kettle(v) {
    const d = Math.max(3, v.dur ?? 8), a = 0.5 + 0.7 * v.vel, g = kettleGraph(v.e, v.t, d * 0.8);
    const env = v.ctx.createGain();
    env.gain.setValueAtTime(a, v.t);
    env.gain.setValueAtTime(a, v.t + d - 0.6);
    env.gain.linearRampToValueAtTime(0, v.t + d);
    g.out.connect(env); env.connect(v.out);
    for (const s of g.srcs) s.stop(v.t + d + 0.05);
    return d + 0.1;
  },
  /** 放下茶盏。不给 variant 或 'wood'：放回木案——瓷的一「叮」，木的一「笃」；'stone'：放在石桌上——瓷声更清，底下只有很死的一「嗒」 */
  cup(v) {
    const stone = v.raw.variant === 'stone', a = 0.155 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.97, 1.03);
    mode(v, 2850 * p, a, stone ? 0.12 : 0.09, 0.0006);
    mode(v, 4300 * p, a * 0.25, 0.06, 0.0006);
    mode(v, 6150 * p, a * (stone ? 0.42 : 0.35), 0.05, 0.0005);
    if (stone) {
      mode(v, 520, a * 0.25, 0.02, 0.001);
      burst(v, { dur: 0.012, type: 'lowpass', f: 1300, q: 0.7, amp: a * 1.1, att: 0.0008, noise: 'pink' });
    } else {
      mode(v, 165, a * 0.7, 0.07, 0.002);
      burst(v, { dur: 0.02, type: 'lowpass', f: 700, q: 0.7, amp: a * 1.5, att: 0.001, noise: 'pink' });
    }
    return 0.35;
  },
  /**
   * 茶碗。不给 variant：放回木案——比小盏大，瓷声低一些、圆一些，底下木头一「笃」；
   * 'sip'：先轻轻啜一口（唇边很短的一吸），再放下。
   */
  bowl(v) {
    const a = 0.13 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.96, 1.04);
    let t = v.t;
    if (v.raw.variant === 'sip') {
      hiss(v, { dur: 0.26, f: 1500, f2: 3200, q: 1.2, hp: 900, curve: wobble(10, 0.03 * (0.5 + 0.7 * v.vel), 0.55, 0.15) });
      t += rand(0.7, 0.9);
    }
    mode(v, 1650 * p, a, 0.13, 0.0008, v.out, t);
    mode(v, 2720 * p, a * 0.45, 0.08, 0.0007, v.out, t);
    mode(v, 4100 * p, a * 0.22, 0.05, 0.0006, v.out, t);
    mode(v, 150, a * 0.8, 0.08, 0.002, v.out, t);
    burst(v, { t, dur: 0.022, type: 'lowpass', f: 650, q: 0.7, amp: a * 1.5, att: 0.001, noise: 'pink' });
    return t - v.t + 0.4;
  },
  /** 一枚棋子落在石枰上：清而小的一「嗒」，带一点很短的余音（棋子硬，石枰死） */
  stone(v) {
    const a = 0.11 * (0.5 + 0.7 * v.vel) * rand(0.85, 1.1), p = v.pitch * rand(0.95, 1.06);
    mode(v, 3150 * p, a, 0.055, 0.0004);
    mode(v, 5050 * p, a * 0.4, 0.035, 0.0004);
    mode(v, 7300 * p, a * 0.12, 0.02, 0.0003);
    mode(v, 1150 * p, a * 0.5, 0.018, 0.0006);
    burst(v, { dur: 0.01, type: 'lowpass', f: 900, q: 0.7, amp: a * 0.8, att: 0.0006, noise: 'pink' });
    burst(v, { dur: 0.004, f: 4200, q: 1.2, amp: a * 0.35, att: 0.0003 });
    return 0.25;
  },
  /** 扇一下茶炉：蒲扇带起的一口软风，炭火跟着「呼」地亮一下，迸两三点细小的火星（dur 是这一扇多长，默认 0.4 秒上下） */
  fan(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = Math.max(0.25, v.dur ?? rand(0.38, 0.5)), n = Math.max(8, Math.round(d * 30));
    hiss(v, { dur: d, noise: 'pink', f: 420, fMid: 820, f2: 500, q: 0.8, hp: 160, curve: wobble(n, 0.16 * a, 0.4, 0.08) });
    hiss(v, { dur: d, f: 2400, q: 0.6, hp: 1200, curve: wobble(n, 0.012 * a, 0.45, 0.1) });
    burst(v, { t: t + d * 0.35, dur: 0.45, f: 260, q: 0.8, amp: 0.3 * a, att: 0.12, noise: 'pink' });
    for (let i = 0, k = 2 + Math.floor(rand(0, 3)); i < k; i++) burst(v, { t: t + d * rand(0.4, 1.4), dur: 0.004, f: rand(3500, 6500), q: 2, amp: 0.03 * a * rand(0.4, 1), att: 0.0004 });
    return d + 0.6;
  },
  /** 点灯：灯芯着起来的一下，低低的一「呼」 */
  lamp(v) {
    const a = 0.5 + 0.7 * v.vel;
    burst(v, { dur: 0.24, type: 'lowpass', f: 380, q: 0.7, amp: 0.42 * a, att: 0.05, noise: 'pink' });
    burst(v, { dur: 0.12, type: 'highpass', f: 5000, amp: 0.025 * a, att: 0.012 });
    for (let i = 0; i < 2; i++) burst(v, { t: v.t + rand(0.03, 0.18), dur: 0.004, f: rand(5000, 8000), q: 2, amp: 0.05 * a, att: 0.0004 });
    return 0.45;
  },
  /** 香头在火上点着：极轻的一「嗤」，带两三下细小的噼啪 */
  ignite(v) {
    const a = 0.065 * (0.5 + 0.7 * v.vel);
    burst(v, { dur: 0.5, f: 5200, q: 0.8, amp: a * 1.5, att: 0.12 });
    for (let i = 0, n = 3 + Math.floor(rand(0, 3)); i < n; i++) burst(v, { t: v.t + rand(0.05, 0.42), dur: 0.004, f: rand(6000, 9000), q: 2, amp: a * rand(0.8, 1.6), att: 0.0004 });
    return 0.7;
  },
  /** 香插进香灰：闷的一「噗」 */
  ash(v) {
    const a = 0.5 + 0.7 * v.vel;
    burst(v, { dur: 0.12, type: 'lowpass', f: 480, f2: 170, q: 0.7, amp: 0.72 * a, att: 0.012, noise: 'pink' });
    mode(v, 105, 0.08 * a, 0.08, 0.006);
    return 0.3;
  },
  /**
   * 竹帚扫一下（dur）。不给 variant：扫在土地上、扫着落花——枝梢刮土，低而沙，没有多少亮；
   * 'stone'：扫在石板上——高处的「唰」。幅度上都有很密的颗粒（许多细枝在刮）。
   */
  broom(v) {
    const d = Math.max(0.2, v.dur ?? 0.6), a = 0.5 + 0.7 * v.vel, n = Math.max(8, Math.round(d * 24));
    const am = grain(v, v.t, d, 0.6, 0.4, 1);
    if (v.raw.variant === 'stone') {
      hiss(v, { dur: d, f: 3600, fMid: 5200, f2: 3800, q: 0.8, curve: wobble(n, 0.175 * a, 0.3, 0.1), dest: am });
      hiss(v, { dur: d, noise: 'pink', f: 900, q: 1, curve: wobble(n, 0.16 * a, 0.3, 0.1), dest: am });
    } else {
      hiss(v, { dur: d, f: 1700, fMid: 2500, f2: 1600, q: 0.8, curve: wobble(n, 0.12 * a, 0.3, 0.1), dest: am });
      hiss(v, { dur: d, noise: 'pink', f: 620, q: 0.9, curve: wobble(n, 0.17 * a, 0.3, 0.1), dest: am });
      hiss(v, { dur: d, type: 'highpass', f: 4200, curve: wobble(n, 0.012 * a, 0.35, 0.15), dest: am });
    }
    return d + 0.15;
  },
  /** 一瓢水浇在菊圃里：水落在土与叶上「哗」的一片，随即收住；几个泡、几滴，土把水吃进去时极细的「滋」 */
  water(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.55, 0.8);
    hiss(v, { dur: d, f: 2600, fMid: 1900, f2: 1400, q: 0.7, curve: wobble(Math.round(d * 26), 0.16 * a, 0.12, 0.12), dest: grain(v, t, d + 0.1, 0.65, 0.35, 0.6) });
    burst(v, { t: t + 0.03, dur: 0.22, type: 'lowpass', f: 420, f2: 200, q: 0.7, amp: 0.32 * a, att: 0.03, noise: 'pink' });
    for (let i = 0; i < 4; i++) { const f = rand(400, 1100); bubble(v, t + rand(0.08, d), f, f * 1.6, 0.035, 0.035 * a * rand(0.4, 1)); }
    hiss(v, { t: t + d * 0.5, dur: 0.7, type: 'highpass', f: 5200, curve: wobble(12, 0.012 * a, 0.2, 0.3) });
    return d + 0.9;
  },
  /**
   * 柴门：轻、干，轴是一截木头套在藤圈里——「吱呀」一声，比板门高而细，带一点柴枝相蹭的窸窣；
   * 荡回去碰在门桩上轻轻一「嗒」（variant: 'open' 则只开不碰）。
   */
  gate(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.5, 0.75), p = v.pitch * rand(0.92, 1.08);
    creak(v, { dur: d, rate: [rand(36, 46), rand(58, 78)], res: [[760 * p, 10, 1], [1480 * p, 12, 0.7], [2300 * p, 9, 0.3]], amp: 0.2 * a, jitter: 320, scrape: 0.2 });
    hiss(v, { dur: d, f: 2800, q: 0.8, hp: 1500, curve: wobble(12, 0.012 * a, 0.4, 0.25) });
    if (v.raw.variant !== 'open') {
      const ex = tap(v, t + d + rand(0.08, 0.2), 2, 0.5 * a, 0.3);
      reson(v, ex, 310, 6, 1);
      reson(v, ex, 720, 9, 0.6);
      reson(v, ex, 1650, 8, 0.25);
    }
    return d + 0.6;
  },
  /** 板门：门轴低低地一转（两条窄带噪声，幅度上有三十几赫兹的涩），半秒后门扇合上的一下（variant: 'open' 则只开不合） */
  door(v) {
    const a = 0.5 + 0.7 * v.vel, c = v.ctx, t = v.t;
    const am = c.createGain();
    am.gain.value = 0.5;
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.type = 'triangle'; lfo.frequency.setValueAtTime(28, t); lfo.frequency.linearRampToValueAtTime(41, t + 0.34);
    depth.gain.value = 0.5;
    lfo.connect(depth); depth.connect(am.gain); lfo.start(t); lfo.stop(t + 0.45);
    am.connect(v.out);
    hiss(v, { dur: 0.36, noise: 'pink', f: 640, f2: 820, q: 9, curve: wobble(12, 0.5 * a, 0.35, 0.1), dest: am });
    hiss(v, { dur: 0.36, noise: 'pink', f: 1450, f2: 1800, q: 12, curve: wobble(12, 0.22 * a, 0.35, 0.1), dest: am });
    burst(v, { dur: 0.3, type: 'lowpass', f: 260, q: 0.7, amp: 0.09 * a, att: 0.1, noise: 'pink' });
    if (v.raw.variant === 'open') return 0.6;
    const ex = tap(v, t + 0.5, 3, a, 0.3);
    reson(v, ex, 138, 7, 1.5);
    reson(v, ex, 410, 9, 0.6);
    return 1;
  },
  /** 有人叩门：指节敲在门板上，「笃、笃笃」 */
  knock(v) {
    const a = 1.6 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.95, 1.05), d1 = rand(0.38, 0.46), at = [0, d1, d1 + rand(0.17, 0.21)];
    at.forEach((dt, i) => {
      const ex = tap(v, v.t + dt, 1.6, a * [1, 0.85, 0.95][i] * rand(0.9, 1.1), 0.25);
      reson(v, ex, 215 * p, 8, 1.5);
      reson(v, ex, 540 * p, 10, 0.8);
      reson(v, ex, 1180 * p, 9, 0.35);
    });
    return 1.2;
  },
  /**
   * 一滴露水从桃叶上滚下来，落在下面一片叶子上：几乎没有声音。
   * 先是叶面极轻的一「嗒」、水珠一颤（一个很快落定的高音）；隔一下，下面那片叶子低低地应一声。
   */
  dew(v) {
    const a = 0.05 * (0.5 + 0.7 * v.vel), f = rand(2500, 3600) * v.pitch, t = v.t;
    burst(v, { dur: 0.006, f: rand(2200, 3200), q: 1.5, amp: a * 0.9, att: 0.0008 });
    glide(v, f * 1.12, f, 0.02, a, 0.055, 0.001);
    glide(v, f * 2.01, f * 1.9, 0.015, a * 0.25, 0.03, 0.001);
    const t2 = t + rand(0.09, 0.15), f2 = f * rand(0.62, 0.76);
    burst(v, { t: t2, dur: 0.005, f: rand(1600, 2400), q: 1.5, amp: a * 0.4, att: 0.0008 });
    glide(v, f2 * 1.1, f2, 0.025, a * 0.5, 0.07, 0.0012, v.out, t2);
    return 0.4;
  },
  /** 檐水 / 水滴：一个小气泡，有时跟着更小的一个 */
  drip(v) {
    const a = 0.22 * (0.5 + 0.7 * v.vel), f = rand(700, 1300) * v.pitch;
    bubble(v, v.t, f, f * 1.9, 0.035, a);
    burst(v, { dur: 0.004, f: 4000, q: 1.5, amp: a * 0.3, att: 0.0004 });
    if (Math.random() < 0.4) bubble(v, v.t + rand(0.06, 0.09), f * 1.3, f * 2.3, 0.025, a * 0.4);
    return 0.3;
  },
  /**
   * 落水。不给 variant：小东西掉进水里——一个往上滑的气泡，跟着一个小的，外加一点水花；
   * 'frog' / 'turtle'：蛙或龟自己滑进池里——没有砸下去的那一下，是「咕咚」：一个低的大泡，水面合上，然后几粒细碎。
   */
  plop(v) {
    const a = 0.32 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.92, 1.08), t = v.t, kind = v.raw.variant;
    if (kind === 'frog' || kind === 'turtle') {
      const big = kind === 'turtle' ? 0.8 : 1;
      bubble(v, t, 230 * big * p, 520 * big * p, 0.09, a * 0.9);
      bubble(v, t + rand(0.09, 0.13), 420 * p, 900 * p, 0.05, a * 0.4);
      burst(v, { dur: 0.16, f: 1500, f2: 700, q: 0.7, amp: a * 0.3, att: 0.02 });
      for (let i = 0; i < 3; i++) { const f = rand(700, 1500); bubble(v, t + rand(0.2, 0.6), f, f * 1.5, 0.03, a * 0.12); }
      return 0.9;
    }
    bubble(v, t, 380 * p, 900 * p, 0.07, a);
    bubble(v, t + rand(0.07, 0.1), 620 * p, 1500 * p, 0.045, a * 0.5);
    burst(v, { dur: 0.09, f: 2600, q: 0.8, amp: a * 0.55, att: 0.004 });
    return 0.5;
  },
  /** 手拨水：一串小气泡，底下一点水的翻动 */
  ripple(v) {
    const a = 0.13 * (0.5 + 0.7 * v.vel);
    for (let i = 0, n = 6 + Math.floor(rand(0, 4)); i < n; i++) {
      const f = rand(500, 1400);
      bubble(v, v.t + rand(0, 0.5), f, f * rand(1.4, 2), rand(0.03, 0.06), a * rand(0.4, 1));
    }
    burst(v, { dur: 0.55, type: 'lowpass', f: 1200, q: 0.7, amp: a * 1.6, att: 0.16, noise: 'pink' });
    return 0.9;
  },
};
