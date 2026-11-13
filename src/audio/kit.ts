/**
 * 搭声音用的几样零件（一击的声音与环境层共用）：
 *   mode / glide / partials —— 分音：正弦，各自指数衰减（金属、木、瓷）；
 *   burst / hiss            —— 滤过的噪声，包络决定它是什么（纸、帚、土、水花）；
 *   bubble                  —— 气泡：一个往上滑的正弦（水）；
 *   tap + reson             —— 槌头的一下去激几个高 Q 的共鸣（木、竹、板）；
 *   creak                   —— 粘一下滑一下：很慢的锯齿波去激木头的共鸣（门轴、辘轳、橹、犁）；
 *   voiced                  —— 嗓子：声源（锯齿波）过几个共振峰（鸡、犬、牛、鸭、雁，孩子念书）。
 * 每个零件把节点接到 v.out（或给定的 dest），声源到时自己停。
 */
import type { Voice } from './engine';
import { lastT, line, rand, strike, type Pts } from './util';

export type Dest = AudioNode;

/** 一个分音：正弦，att 秒起音，按 t60 衰减 */
export function mode(v: Voice, f: number, amp: number, t60: number, att = 0.002, dest: Dest = v.out, t = v.t) {
  if (amp <= 0 || f > v.ctx.sampleRate * 0.45) return;
  const o = v.ctx.createOscillator(), g = v.ctx.createGain();
  o.frequency.value = f;
  strike(g.gain, t, amp, att, t60);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + att + t60 * 1.2);
}
/** 一个会滑的分音：f0 → f1（glide 秒内） */
export function glide(v: Voice, f0: number, f1: number, glideT: number, amp: number, t60: number, att = 0.003, dest: Dest = v.out, t = v.t) {
  const o = v.ctx.createOscillator(), g = v.ctx.createGain();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + glideT);
  strike(g.gain, t, amp, att, t60);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + att + t60 * 1.2);
}
export interface BurstO { t?: number; dur: number; type?: BiquadFilterType; f: number; f2?: number; q?: number; amp: number; att?: number; noise?: 'white' | 'pink' | 'brown'; dest?: Dest }
/** 一段滤过的噪声：att 秒起，之后指数衰减，到 dur 时约 −40 分贝 */
export function burst(v: Voice, o: BurstO) {
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
export function bubble(v: Voice, t: number, f0: number, f1: number, dur: number, amp: number, dest: Dest = v.out) {
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
export function tap(v: Voice, t: number, ms: number, amp: number, noiseMix = 0.25): AudioBufferSourceNode {
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
export function reson(v: Voice, src: AudioNode, f: number, q: number, gain: number, dest: Dest = v.out) {
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
export function partials(v: Voice, f0: number, a: number, P: ReadonlyArray<readonly [number, number, number, number, number]>, width: number, keep = 2) {
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
export function wobble(n: number, peak: number, attFrac: number, wob: number): Float32Array<ArrayBuffer> {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const env = x < attFrac ? Math.sin((x / attFrac) * Math.PI * 0.5) : Math.pow(Math.cos(((x - attFrac) / (1 - attFrac)) * Math.PI * 0.5), 1.3);
    a[i] = peak * env * (1 + (Math.random() * 2 - 1) * wob);
  }
  a[0] = 0; a[n - 1] = 0;
  return a;
}
/** 平顶的包络：起 att 成、收 rel 成，中间略有起伏 */
export function plateau(n: number, peak: number, att: number, rel: number, wob = 0): Float32Array<ArrayBuffer> {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    a[i] = peak * Math.min(1, u / att) * Math.min(1, (1 - u) / rel) * (1 + (Math.random() * 2 - 1) * wob);
  }
  a[0] = 0; a[n - 1] = 0;
  return a;
}
export interface HissO { t?: number; dur: number; noise?: 'white' | 'pink' | 'brown'; type?: BiquadFilterType; f: number; f2?: number; fMid?: number; q?: number; curve: Float32Array<ArrayBuffer>; dest?: Dest; hp?: number }
/** 一段持续的噪声，包络给曲线 */
export function hiss(v: Voice, o: HissO): GainNode {
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
/** 颗粒：一路增益，被每秒几十上百点的随机曲线调着（许多细枝、许多齿、许多土粒）。返回它，别的声音接进来 */
export function grain(v: Voice, t: number, dur: number, base: number, depth: number, rate = 1, dest: Dest = v.out): GainNode {
  const c = v.ctx, am = c.createGain(), d = c.createGain();
  am.gain.value = base; d.gain.value = depth;
  const lfo = v.e.ctrlSrc('fast', t, rate, dur + 0.1);
  lfo.connect(d); d.connect(am.gain);
  am.connect(dest);
  return am;
}

export interface CreakO {
  t?: number;
  dur: number;
  /** 粘滑的快慢（Hz）：起、止。越快听着越尖 */
  rate: readonly [number, number];
  /** 木头的共鸣：[Hz, Q, 增益] */
  res: ReadonlyArray<readonly [number, number, number]>;
  amp: number;
  /** 快慢上的不匀（音分，默认 260） */
  jitter?: number;
  /** 掺多少刮擦的噪声（默认 0.25） */
  scrape?: number;
  /** 包络的起音占几成（默认 0.3） */
  att?: number;
  dest?: Dest;
}
/**
 * 吱呀：木头与木头粘一下滑一下，一秒几十下——一个很慢、快慢不匀的锯齿波，每一下去激木头的几个共鸣。
 * 快慢从 rate[0] 走到 rate[1]：门越推越快就往上扬，力气松下来就往下落。
 */
export function creak(v: Voice, o: CreakO) {
  const c = v.ctx, t = o.t ?? v.t, d = o.dur;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(o.rate[0], t);
  osc.frequency.exponentialRampToValueAtTime(o.rate[1], t + d);
  const j = v.e.ctrlSrc('fast', t, rand(0.25, 0.5), d + 0.1), jd = c.createGain();
  jd.gain.value = o.jitter ?? 260;
  j.connect(jd); jd.connect(osc.detune);
  const hp = c.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 180; hp.Q.value = 0.6;
  const env = c.createGain();
  env.gain.value = 0;
  env.gain.setValueCurveAtTime(wobble(Math.max(8, Math.round(d * 28)), o.amp, o.att ?? 0.3, 0.18), t, d);
  osc.connect(hp); hp.connect(env);
  const sc = o.scrape ?? 0.25;
  if (sc > 0) {
    const n = v.e.noiseSrc('pink', t, d + 0.05), ng = c.createGain();
    ng.gain.value = sc * 2.2;
    n.connect(ng); ng.connect(env);
  }
  for (const [f, q, g] of o.res) reson(v, env, f, q, g, o.dest ?? v.out);
  osc.start(t); osc.stop(t + d + 0.05);
}

/** 共振峰：[Hz 或一条折线, Q, 增益（并联的共振峰习惯上正负相间，免得两峰之间掏出一个坑）] */
export type Formant = readonly [number | Pts, number, number];
export interface VoicedO {
  t?: number;
  /** 音高的折线 [秒, Hz] */
  f0: Pts;
  /** 响度的折线 [秒, 0…1] */
  amp: Pts;
  formants: ReadonlyArray<Formant>;
  /** 声源：锯齿（亮）、三角（闷）…… */
  type?: OscillatorType;
  /** 声源先过的低通（嗓子越松越低；默认 3000） */
  tilt?: number;
  /** 音高上的抖（音分） */
  jitter?: number;
  /** 气声：掺多少噪声（过同一组共振峰、同一个包络） */
  breath?: number;
  /** 不过共振峰、直通的一点 */
  direct?: number;
  /** 嗓子发毛：幅度上每秒 rate 下、深 depth，只在 [from, to] 这一段 */
  rough?: { rate: number; depth: number; from?: number; to?: number };
  gain: number;
  dest?: Dest;
}
/** 嗓子：一个振荡器按折线走音高、按折线开合，过并联的几个共振峰。返回出口与结束的时刻 */
export function voiced(v: Voice, o: VoicedO): { out: GainNode; osc: OscillatorNode; end: number } {
  const c = v.ctx, t = o.t ?? v.t, len = Math.max(lastT(o.f0), lastT(o.amp)), end = t + len;
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sawtooth';
  line(osc.frequency, t, o.f0, true);
  if (o.jitter) {
    const j = v.e.ctrlSrc('fast', t, rand(0.4, 0.8), len + 0.1), jd = c.createGain();
    jd.gain.value = o.jitter;
    j.connect(jd); jd.connect(osc.detune);
  }
  const tilt = c.createBiquadFilter();
  tilt.type = 'lowpass'; tilt.frequency.value = o.tilt ?? 3000; tilt.Q.value = 0.5;
  const src = c.createGain();
  src.gain.value = 0;
  line(src.gain, t, o.amp);
  osc.connect(tilt); tilt.connect(src);
  if (o.breath) {
    const n = v.e.noiseSrc('pink', t, len + 0.1), ng = c.createGain();
    ng.gain.value = o.breath * 3;
    n.connect(ng); ng.connect(src);
  }
  let head: AudioNode = src;
  if (o.rough) {
    const am = c.createGain(), lfo = c.createOscillator(), dp = c.createGain(), from = o.rough.from ?? 0, to = o.rough.to ?? len;
    am.gain.value = 1;
    lfo.type = 'triangle'; lfo.frequency.value = o.rough.rate;
    dp.gain.setValueAtTime(0, t);
    dp.gain.setValueAtTime(0, t + from);
    dp.gain.linearRampToValueAtTime(o.rough.depth, t + from + 0.03);
    dp.gain.setValueAtTime(o.rough.depth, t + Math.max(from + 0.03, to - 0.03));
    dp.gain.linearRampToValueAtTime(0, t + to);
    lfo.connect(dp); dp.connect(am.gain);
    lfo.start(t); lfo.stop(end + 0.05);
    src.connect(am); head = am;
  }
  const out = c.createGain();
  out.gain.value = o.gain;
  for (const [f, q, g] of o.formants) {
    const bp = c.createBiquadFilter(), fg = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = q;
    if (typeof f === 'number') bp.frequency.value = f; else line(bp.frequency, t, f, true);
    fg.gain.value = g;
    head.connect(bp); bp.connect(fg); fg.connect(out);
  }
  if (o.direct) { const dg = c.createGain(); dg.gain.value = o.direct; head.connect(dg); dg.connect(out); }
  out.connect(o.dest ?? v.out);
  osc.start(t); osc.stop(end + 0.05);
  return { out, osc, end };
}
