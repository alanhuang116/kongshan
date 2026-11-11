/**
 * 一击的声音。每一种都按那件器物怎么发声来搭：
 *   金属（钟、磬、引磬、风铎）＝ 一组不成整数倍的分音，各自指数衰减，低的长、高的短；相近的两个分音拍出「嗡——嗡——」；
 *   木与竹（木鱼、签、珠、步）＝ 槌头的一下（半个正弦加一点噪声）激起几个高 Q 的共鸣，几十毫秒就没了；
 *   皮（鼓）＝ 下滑的基模加几个不成整数倍的膜模，再加鼓腔里的一团低噪声；
 *   水 ＝ 气泡：一个往上滑的正弦，很短；
 *   纸、帚、灰、火 ＝ 滤过的噪声，包络决定它是什么。
 * 每个函数把节点接到 v.out，返回这一击大约多久之后可以拆线（秒）。
 */
import type { Voice } from './engine';
import type { Shot } from './types';
import { pick, rand, strike } from './util';

type Dest = AudioNode;

/** 一个分音：正弦，att 秒起音，按 t60 衰减 */
function mode(v: Voice, f: number, amp: number, t60: number, att = 0.002, dest: Dest = v.out, t = v.t) {
  if (amp <= 0 || f > v.ctx.sampleRate * 0.45) return;
  const o = v.ctx.createOscillator(), g = v.ctx.createGain();
  o.frequency.value = f;
  strike(g.gain, t, amp, att, t60);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + att + t60 * 1.2);
}
/** 一个会滑的分音：f0 → f1（glide 秒内） */
function glide(v: Voice, f0: number, f1: number, glideT: number, amp: number, t60: number, att = 0.003, dest: Dest = v.out, t = v.t) {
  const o = v.ctx.createOscillator(), g = v.ctx.createGain();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + glideT);
  strike(g.gain, t, amp, att, t60);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + att + t60 * 1.2);
}
interface BurstO { t?: number; dur: number; type?: BiquadFilterType; f: number; f2?: number; q?: number; amp: number; att?: number; noise?: 'white' | 'pink' | 'brown'; dest?: Dest }
/** 一段滤过的噪声：att 秒起，之后指数衰减，到 dur 时约 −40 分贝 */
function burst(v: Voice, o: BurstO) {
  const c = v.ctx, t = o.t ?? v.t, att = o.att ?? 0.002;
  const s = v.e.noiseSrc(o.noise ?? 'white', t, o.dur + 0.06);
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.f, t);
  f.Q.value = o.q ?? 1;
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.amp, t + att);
  g.gain.setTargetAtTime(0, t + att, Math.max(0.0008, (o.dur - att) / 4.6));
  s.connect(f); f.connect(g); g.connect(o.dest ?? v.out);
}
/** 气泡：往上滑的正弦 */
function bubble(v: Voice, t: number, f0: number, f1: number, dur: number, amp: number, dest: Dest = v.out) {
  const o = v.ctx.createOscillator(), g = v.ctx.createGain();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(amp, t + 0.003);
  g.gain.setTargetAtTime(0, t + 0.003, dur / 4);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur * 2.2);
}
/** 槌头的一下：半个正弦（接触的那一瞬，ms 毫秒）加一点很快收掉的噪声 */
function tap(v: Voice, t: number, ms: number, amp: number, noiseMix = 0.25): AudioBufferSourceNode {
  const sr = v.ctx.sampleRate, n = Math.max(8, Math.floor(sr * ms * 0.001)), m = n * 3;
  const b = v.ctx.createBuffer(1, m, sr), d = b.getChannelData(0);
  for (let i = 0; i < m; i++) {
    const pulse = i < n ? Math.sin((Math.PI * i) / n) : 0;
    d[i] = amp * (pulse * (1 - noiseMix) + (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.8)) * noiseMix);
  }
  const s = v.ctx.createBufferSource();
  s.buffer = b;
  s.start(t);
  return s;
}
/** 一个共鸣：高 Q 的带通，余音约 2.2·Q / f 秒 */
function reson(v: Voice, src: AudioNode, f: number, q: number, gain: number, dest: Dest = v.out) {
  const b = v.ctx.createBiquadFilter(), g = v.ctx.createGain();
  b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q;
  g.gain.value = gain;
  src.connect(b); b.connect(g); g.connect(dest);
}
/** 左右各一路（一对相近的分音分在两边，拍音会在两耳之间慢慢转） */
function halves(v: Voice, width: number): [AudioNode, AudioNode] {
  const l = v.ctx.createStereoPanner(), r = v.ctx.createStereoPanner();
  l.pan.value = -width; r.pan.value = width;
  l.connect(v.out); r.connect(v.out);
  return [l, r];
}
/** 金属器的一组分音：[倍率, 幅度, t60, 拍频, 起音]；力度小则高分音少 */
function partials(v: Voice, f0: number, a: number, P: ReadonlyArray<readonly [number, number, number, number, number]>, width: number, keep = 2) {
  const [L, R] = halves(v, width);
  P.forEach(([r, amp, t60, beat, att], i) => {
    const bright = i <= keep ? 1 : Math.pow(0.3 + 0.7 * v.vel, (i - keep) * 0.55);
    const A = a * amp * bright;
    if (beat > 0) {
      mode(v, f0 * r, A * 0.6, t60, att, L);
      mode(v, f0 * r + beat, A * 0.4, t60 * 0.92, att * 1.1, R);
    } else mode(v, f0 * r, A, t60, att);
  });
}
/** 带一点抖动的起伏包络（一笔、一帚） */
function wobble(n: number, peak: number, attFrac: number, wob: number): Float32Array<ArrayBuffer> {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const env = x < attFrac ? Math.sin((x / attFrac) * Math.PI * 0.5) : Math.pow(Math.cos(((x - attFrac) / (1 - attFrac)) * Math.PI * 0.5), 1.3);
    a[i] = peak * env * (1 + (Math.random() * 2 - 1) * wob);
  }
  a[0] = 0; a[n - 1] = 0;
  return a;
}
/** 一段持续的噪声，包络给曲线 */
function hiss(v: Voice, o: { t?: number; dur: number; noise?: 'white' | 'pink'; type?: BiquadFilterType; f: number; f2?: number; fMid?: number; q?: number; curve: Float32Array<ArrayBuffer>; dest?: Dest; hp?: number }): GainNode {
  const c = v.ctx, t = o.t ?? v.t;
  const s = v.e.noiseSrc(o.noise ?? 'white', t, o.dur + 0.05);
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass'; f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f, t);
  if (o.fMid) { f.frequency.exponentialRampToValueAtTime(o.fMid, t + o.dur * 0.45); f.frequency.exponentialRampToValueAtTime(o.f2 ?? o.f, t + o.dur); }
  else if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = c.createGain();
  g.gain.value = 0;
  g.gain.setValueCurveAtTime(o.curve, t, o.dur);
  s.connect(f);
  let last: AudioNode = f;
  if (o.hp) { const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = o.hp; f.connect(h); last = h; }
  last.connect(g); g.connect(o.dest ?? v.out);
  return g;
}

/** 风铎的音高：G 宫的五声（G6 A6 B6 D7 E7） */
const WINDBELL = [1567.98, 1760, 1975.53, 2349.32, 2637.02];

export const SHOTS: Record<Shot, (v: Voice) => number> = {
  /**
   * 大铜钟。嗡音 98Hz（G2），分音取梵钟一类「2.0、2.8、3.4、4.1、5.4…」的非谐结构（不是西洋钟的小三度）；
   * 前六个分音各是一对，差 0.55–3Hz，拍出起伏；撞木是木头，起音软：低通噪声的一闷 + 一个很低的「咚」。
   */
  bell(v) {
    const f0 = 98 * v.pitch, vel = v.vel;
    partials(v, f0, 0.62 * Math.pow(vel, 1.25), [
      [1.0, 1.0, 24, 0.55, 0.045],
      [2.03, 0.78, 17, 0.9, 0.025],
      [2.78, 0.82, 12, 1.3, 0.014],
      [3.42, 0.4, 8.5, 1.9, 0.01],
      [4.13, 0.45, 6.5, 2.4, 0.008],
      [5.43, 0.27, 4.2, 3.1, 0.006],
      [6.72, 0.13, 2.8, 0, 0.005],
      [8.11, 0.09, 1.9, 0, 0.004],
      [9.63, 0.05, 1.2, 0, 0.004],
      [11.4, 0.03, 0.8, 0, 0.003],
    ], 0.3);
    burst(v, { dur: 0.11, type: 'lowpass', f: 620, f2: 170, q: 0.7, amp: 0.8 * vel, att: 0.004, noise: 'pink' });
    mode(v, 61 * v.pitch, 0.3 * vel, 0.16, 0.005);
    burst(v, { dur: 0.05, f: 2600, q: 1.2, amp: 0.05 * vel * vel, att: 0.002 });
    return 27;
  },
  /** 大磬（钵形铜磬）。基音 246.9Hz（B3），分音约 1 : 2.71 : 5.12 : 8.07 : 11.6；包布木槌，起音是很轻的一点 */
  bowl(v) {
    const f0 = 246.94 * v.pitch, vel = v.vel;
    partials(v, f0, 0.55 * Math.pow(vel, 1.2), [
      [1.0, 1.0, 11, 0.7, 0.006],
      [2.71, 0.55, 7, 1.6, 0.004],
      [5.12, 0.3, 4, 2.7, 0.003],
      [8.07, 0.16, 2.2, 0, 0.002],
      [11.6, 0.08, 1.2, 0, 0.002],
      [15.3, 0.04, 0.7, 0, 0.002],
    ], 0.25, 1);
    burst(v, { dur: 0.02, f: 2200, q: 1.5, amp: 0.14 * vel, att: 0.001 });
    mode(v, 320 * v.pitch, 0.12 * vel, 0.05, 0.002);
    return 12.5;
  },
  /** 引磬（手持小磬，铁签敲）。基音 1174.7Hz（D6），清亮，余音约四秒 */
  chime(v) {
    const f0 = 1174.66 * v.pitch, vel = v.vel;
    partials(v, f0, 0.48 * Math.pow(vel, 1.2), [
      [1.0, 1.0, 4.5, 1.4, 0.0015],
      [2.72, 0.5, 2.6, 3.2, 0.001],
      [5.18, 0.22, 1.3, 0, 0.001],
      [8.2, 0.08, 0.6, 0, 0.001],
    ], 0.2, 1);
    burst(v, { dur: 0.008, type: 'highpass', f: 5200, amp: 0.14 * vel, att: 0.0005 });
    return 5.5;
  },
  /**
   * 木鱼。槌头的一下激起三个共鸣：空腔（约 432Hz，余音 0.11 秒）、木体（1.62 倍、2.74 倍），
   * 再加一个从高处很快滑下来的正弦，就是那声「笃」。力度大则接触时间短、更亮；每次音高与力度略有不同。
   */
  muyu(v) {
    const p = v.pitch * (1 + rand(-0.015, 0.015)), f1 = 432 * p, k = 1 / Math.sqrt(v.pitch), vel = v.vel;
    const a = 3.4 * Math.pow(vel, 1.2) * rand(0.93, 1.07);
    const ex = tap(v, v.t, 2.3 - 1.2 * vel, a, 0.22);
    reson(v, ex, f1, 21 * k, 2.6);
    reson(v, ex, f1 * 1.62, 20 * k, 1.5);
    reson(v, ex, f1 * 2.74, 22 * k, 1.1 * (0.4 + 0.6 * vel));
    const hp = v.ctx.createBiquadFilter(), hg = v.ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 2800; hg.gain.value = 0.05 * vel;
    ex.connect(hp); hp.connect(hg); hg.connect(v.out);
    glide(v, f1 * 1.22, f1, 0.018, 0.16 * a, 0.1 * k, 0.0015);
    return 0.5 * k;
  },
  /** 大鼓。基模 66Hz 从高一点滑下来，膜模 1.59、2.14、2.30、2.92 倍；槌是低通噪声的一「嘭」，鼓腔里一团 210Hz 的余响 */
  drum(v) {
    const f0 = 66 * v.pitch, vel = v.vel, a = 1.1 * Math.pow(vel, 1.2);
    glide(v, f0 * 1.38, f0, 0.07, a, 1.5, 0.004);
    for (const [r, amp, t60] of [[1.59, 0.36, 0.6], [2.14, 0.28, 0.45], [2.3, 0.18, 0.36], [2.92, 0.16, 0.3], [3.6, 0.12, 0.24], [4.2, 0.09, 0.2], [5.1, 0.06, 0.16]] as const) {
      glide(v, f0 * r * 1.12, f0 * r, 0.05, a * amp * (0.5 + 0.5 * vel), t60, 0.003);
    }
    burst(v, { dur: 0.08, type: 'lowpass', f: 950, f2: 160, q: 0.7, amp: 0.85 * vel, att: 0.002 });
    burst(v, { dur: 0.6, f: 210, q: 1.1, amp: 0.5 * vel, att: 0.01, noise: 'pink' });
    burst(v, { dur: 0.012, f: 2400, q: 1, amp: 0.09 * vel * vel, att: 0.001 });
    return 2.4;
  },
  /** 鼓边：槌敲在木头鼓帮上，鼓面跟着轻轻一应 */
  drumrim(v) {
    const vel = v.vel, a = 7 * Math.pow(vel, 1.2), p = v.pitch * rand(0.98, 1.02);
    const ex = tap(v, v.t, 1.2, a, 0.3);
    reson(v, ex, 870 * p, 16, 1.6);
    reson(v, ex, 1730 * p, 18, 1.2);
    reson(v, ex, 2900 * p, 16, 0.6);
    mode(v, 66 * v.pitch, 0.01 * a, 0.5, 0.004);
    return 0.7;
  },
  /** 一颗念珠过指：小木珠相碰，极轻的「嗒」，每次不同 */
  bead(v) {
    const f = rand(2300, 3100) * v.pitch, a = 0.12 * (0.5 + 0.7 * v.vel) * rand(0.85, 1.1);
    mode(v, f, a, 0.035, 0.0006);
    mode(v, f * rand(1.75, 1.92), a * 0.4, 0.02, 0.0005);
    mode(v, f * 0.36, a * 0.55, 0.03, 0.0008);
    burst(v, { dur: 0.008, type: 'highpass', f: 5000, amp: a * 0.5, att: 0.0005 });
    return 0.15;
  },
  /** 到母珠掉头：三颗珠子连着响，带一点穗子的窸窣 */
  beadturn(v) {
    const base = rand(2200, 2700) * v.pitch, k = 0.5 + 0.7 * v.vel;
    [0, 0.055, 0.13].forEach((dt, i) => {
      const f = base * [1, 1.12, 0.9][i], a = 0.1 * k * [1, 0.8, 0.9][i], t = v.t + dt + rand(0, 0.008);
      mode(v, f, a, 0.035, 0.0006, v.out, t);
      mode(v, f * 1.83, a * 0.4, 0.02, 0.0005, v.out, t);
      mode(v, f * 0.36, a * 0.5, 0.03, 0.0008, v.out, t);
    });
    burst(v, { t: v.t + 0.03, dur: 0.2, f: 3200, q: 0.8, amp: 0.012 * k, att: 0.06, noise: 'pink' });
    return 0.4;
  },
  /** 香头在烛火上点着：极轻的一「嗤」，带两三下细小的噼啪 */
  ignite(v) {
    const a = 0.065 * (0.5 + 0.7 * v.vel);
    burst(v, { dur: 0.5, type: 'highpass', f: 4500, amp: a, att: 0.12 });
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
  /** 摇签筒一下：十几支竹签在竹筒里哗啦，筒身跟着共鸣 */
  sticks(v) {
    const vel = v.vel, sr = v.ctx.sampleRate, n = Math.round(8 + 14 * vel), span = 0.16 + 0.14 * vel, a = 0.24 * (0.4 + 0.8 * vel);
    // 一二十支签各响一下：直接算进一段波形里（摇得快时省下几百个节点）
    const len = Math.floor(sr * (span + 0.06)), b = v.ctx.createBuffer(1, len, sr), d = b.getChannelData(0), TAU = Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const at = Math.floor(sr * span * Math.pow(Math.random(), 0.8)), f = rand(1300, 3600) * v.pitch, g = a * rand(0.3, 1), t60 = rand(0.012, 0.03);
      const m = Math.min(len - at, Math.floor(sr * t60 * 1.3)), k = 6.91 / (t60 * sr), w1 = (TAU * f) / sr, w2 = w1 * 2.6;
      for (let j = 0; j < m; j++) {
        const e1 = Math.exp(-k * j);
        d[at + j] += g * Math.min(1, j / 12) * (e1 * Math.sin(w1 * j) + 0.35 * e1 * e1 * Math.sin(w2 * j));
      }
    }
    const s = v.ctx.createBufferSource();
    s.buffer = b;
    s.connect(v.out);
    s.start(v.t);
    burst(v, { dur: span + 0.1, f: 520 * v.pitch, q: 2.5, amp: 0.9 * a, att: span * 0.3, noise: 'pink' });
    return span + 0.3;
  },
  /** 一支签掉在木桌上：竹片落木，弹两三下，越来越轻、越来越密 */
  stickfall(v) {
    const a = 0.3 * (0.5 + 0.7 * v.vel);
    [0, 0.13, 0.21, 0.26, 0.29].forEach((dt, i) => {
      const g = a * [1, 0.5, 0.3, 0.18, 0.1][i], r = rand(0.97, 1.03) * v.pitch, t = v.t + dt;
      mode(v, 1750 * r, g, 0.04, 0.0005, v.out, t);
      mode(v, 3900 * r, g * 0.5, 0.025, 0.0005, v.out, t);
      mode(v, 620 * r, g * 0.4, 0.03, 0.0008, v.out, t);
      if (i < 2) mode(v, 185, g * 0.55, 0.07, 0.002, v.out, t);
    });
    return 0.6;
  },
  /** 毛笔在宣纸上的一笔：粉噪声过带通，包络像一口气，略带抖动 */
  brush(v) {
    const d = Math.max(0.12, v.dur ?? 0.5), a = 0.32 * (0.5 + 0.7 * v.vel);
    hiss(v, { dur: d, noise: 'pink', f: 1900, fMid: 2600, f2: 1500, q: 0.7, hp: 600, curve: wobble(Math.max(8, Math.round(d * 30)), a, 0.25, 0.14) });
    return d + 0.1;
  },
  /** 翻纸 / 铺纸：一阵沙沙，带几下细小的折响 */
  paper(v) {
    const a = 0.5 + 0.7 * v.vel;
    burst(v, { dur: 0.32, f: 3000, f2: 1300, q: 0.9, amp: 0.23 * a, att: 0.05 });
    for (let i = 0; i < 5; i++) burst(v, { t: v.t + rand(0.02, 0.26), dur: 0.005, f: rand(4000, 8000), q: 2, amp: 0.13 * a * rand(0.5, 1), att: 0.0004 });
    return 0.5;
  },
  /** 竹扫帚扫过石板一下：高处的「唰」是许多细枝在刮，幅度上有很密的颗粒 */
  broom(v) {
    const d = Math.max(0.2, v.dur ?? 0.6), a = 0.5 + 0.7 * v.vel, c = v.ctx;
    const am = c.createGain();
    am.gain.value = 0.6;
    const lfo = v.e.ctrlSrc('fast', v.t, 1, d + 0.1), depth = c.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth); depth.connect(am.gain);
    am.connect(v.out);
    hiss(v, { dur: d, f: 3600, fMid: 5200, f2: 3800, q: 0.8, curve: wobble(Math.max(8, Math.round(d * 24)), 0.175 * a, 0.3, 0.1), dest: am });
    hiss(v, { dur: d, noise: 'pink', f: 900, q: 1, curve: wobble(Math.max(8, Math.round(d * 24)), 0.16 * a, 0.3, 0.1), dest: am });
    return d + 0.15;
  },
  /** 小东西落水：一个往上滑的气泡声，跟着一个小的，外加一点水花 */
  plop(v) {
    const a = 0.32 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.92, 1.08);
    bubble(v, v.t, 380 * p, 900 * p, 0.07, a);
    bubble(v, v.t + rand(0.07, 0.1), 620 * p, 1500 * p, 0.045, a * 0.5);
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
  /** 点灯：灯芯着起来的一下，低低的一「呼」 */
  lamp(v) {
    const a = 0.5 + 0.7 * v.vel;
    burst(v, { dur: 0.24, type: 'lowpass', f: 380, q: 0.7, amp: 0.42 * a, att: 0.05, noise: 'pink' });
    burst(v, { dur: 0.12, type: 'highpass', f: 5000, amp: 0.025 * a, att: 0.012 });
    for (let i = 0; i < 2; i++) burst(v, { t: v.t + rand(0.03, 0.18), dur: 0.004, f: rand(5000, 8000), q: 2, amp: 0.05 * a, att: 0.0004 });
    return 0.45;
  },
  /** 石板上的一步（布鞋）：脚跟一闷、脚掌一闷，带一点沙 */
  step(v) {
    const a = (0.5 + 0.7 * v.vel) * rand(0.8, 1.1);
    burst(v, { dur: 0.07, type: 'lowpass', f: rand(240, 380), q: 0.7, amp: 0.64 * a, att: 0.004, noise: 'pink' });
    const t2 = v.t + rand(0.07, 0.1);
    burst(v, { t: t2, dur: 0.06, type: 'lowpass', f: rand(420, 560), q: 0.7, amp: 0.34 * a, att: 0.004, noise: 'pink' });
    burst(v, { t: t2, dur: 0.09, f: rand(2200, 3800), q: 1.2, amp: 0.016 * a, att: 0.02 });
    return 0.35;
  },
  /** 木地板上的一步：板子自己有一个低的共鸣 */
  woodstep(v) {
    const a = 1.2 * (0.5 + 0.7 * v.vel) * rand(0.8, 1.1);
    const ex = tap(v, v.t, 3.5, a, 0.3);
    reson(v, ex, rand(105, 140), 7, 1.6);
    reson(v, ex, rand(290, 350), 9, 0.8);
    burst(v, { dur: 0.05, type: 'lowpass', f: 600, q: 0.7, amp: 0.18 * a, att: 0.003, noise: 'pink' });
    return 0.4;
  },
  /** 木门轻响：门轴低低地一转，然后门扇合上的一下 */
  door(v) {
    const a = 0.5 + 0.7 * v.vel, c = v.ctx, t = v.t;
    // 门轴：两条窄带噪声，幅度上有三十几赫兹的涩（粘一下滑一下）
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
    // 合上
    const ex = tap(v, t + 0.5, 3, a, 0.3);
    reson(v, ex, 138, 7, 1.5);
    reson(v, ex, 410, 9, 0.6);
    return 1;
  },
  /** 界面上最轻的一下：木签相碰 */
  tick(v) {
    const a = 0.1 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.97, 1.03);
    mode(v, 1900 * p, a, 0.018, 0.0005);
    mode(v, 720 * p, a * 0.6, 0.022, 0.0008);
    burst(v, { dur: 0.004, type: 'highpass', f: 4000, amp: a * 0.5, att: 0.0004 });
    return 0.12;
  },
  /** 打开一层界面：纸页往上的一声 */
  open(v) {
    burst(v, { dur: 0.2, f: 1300, f2: 2900, q: 0.8, amp: 0.62 * (0.5 + 0.7 * v.vel), att: 0.06, noise: 'pink' });
    return 0.3;
  },
  /** 收起：往下的一声 */
  close(v) {
    burst(v, { dur: 0.16, f: 2600, f2: 1100, q: 0.8, amp: 0.66 * (0.5 + 0.7 * v.vel), att: 0.03, noise: 'pink' });
    return 0.26;
  },
  /** 檐角风铎：小铜铃，音高取 G 宫五声里的一个（给了 pitch 就是 G6 的倍率） */
  windbell(v) {
    const f0 = v.raw.pitch == null ? pick(WINDBELL) : WINDBELL[0] * v.pitch, vel = v.vel;
    partials(v, f0, 0.33 * Math.pow(vel, 1.1), [
      [1.0, 1.0, 2.8, 2.3, 0.001],
      [2.42, 0.45, 1.6, 4.1, 0.001],
      [3.93, 0.25, 0.9, 0, 0.001],
      [5.61, 0.12, 0.5, 0, 0.001],
    ], 0.2, 1);
    burst(v, { dur: 0.005, type: 'highpass', f: 6000, amp: 0.09 * vel, att: 0.0004 });
    return 3.6;
  },
  /** 檐水 / 水滴：一个小气泡，有时跟着更小的一个 */
  drip(v) {
    const a = 0.22 * (0.5 + 0.7 * v.vel), f = rand(700, 1300) * v.pitch;
    bubble(v, v.t, f, f * 1.9, 0.035, a);
    burst(v, { dur: 0.004, f: 4000, q: 1.5, amp: a * 0.3, att: 0.0004 });
    if (Math.random() < 0.4) bubble(v, v.t + rand(0.06, 0.09), f * 1.3, f * 2.3, 0.025, a * 0.4);
    return 0.3;
  },
  /** 注水入盏：水声之外，盏里的空腔越来越小，共鸣的音高一路升上去 */
  pour(v) {
    const d = Math.max(0.6, v.dur ?? 2.5), a = 0.5 + 0.7 * v.vel, c = v.ctx, t = v.t;
    const am = c.createGain();
    am.gain.value = 0.65;
    const lfo = v.e.ctrlSrc('fast', t, 0.5, d + 0.1), depth = c.createGain();
    depth.gain.value = 0.35;
    lfo.connect(depth); depth.connect(am.gain);
    am.connect(v.out);
    const env = (peak: number) => { const n = 24, x = new Float32Array(n); for (let i = 0; i < n; i++) { const u = i / (n - 1); x[i] = peak * Math.min(1, u / 0.07) * Math.min(1, (1 - u) / 0.12); } x[0] = 0; x[n - 1] = 0; return x; };
    hiss(v, { dur: d, f: 2400, q: 0.7, curve: env(0.105 * a), dest: am });
    hiss(v, { dur: d, noise: 'pink', f: 420, f2: 1150, q: 5, curve: env(0.75 * a), dest: am });
    for (let i = 0, n = Math.round(d * 9); i < n; i++) {
      const f = rand(500, 1200);
      bubble(v, t + rand(0.05, d - 0.1), f, f * rand(1.3, 1.9), rand(0.02, 0.04), 0.03 * a * rand(0.4, 1));
    }
    return d + 0.2;
  },
  /** 茶盏放回木案：瓷的一「叮」，木的一「笃」 */
  cup(v) {
    const a = 0.155 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.97, 1.03);
    mode(v, 2850 * p, a, 0.09, 0.0006);
    mode(v, 4300 * p, a * 0.25, 0.06, 0.0006);
    mode(v, 6150 * p, a * 0.35, 0.05, 0.0005);
    mode(v, 165, a * 0.7, 0.07, 0.002);
    burst(v, { dur: 0.02, type: 'lowpass', f: 700, q: 0.7, amp: a * 1.5, att: 0.001, noise: 'pink' });
    return 0.35;
  },
};

// 给层里复用
export { mode, burst, bubble, glide };
