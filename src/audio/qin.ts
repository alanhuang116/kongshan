/**
 * 古琴。两种用法：
 *   抚琴——玩家每一下出一个音或一个小句：一击 'qin'（见文末 qinShot），散音、按音（带绰注吟猱）、泛音、撮、滚拂；
 *   远琴——'qin' 那一层：隔着屋子传来的、现编的几声（见 Qin）。
 *
 * 每个音都是现算的一段波形（Karplus–Strong 拨弦：一条延迟线里循环的一个周期，每转一圈过一次低通、损耗一点）：
 *   激励——指肉拨弦，不是拨片：一个周期长的噪声先低通，再过「拨在弦长八分之一处」的梳状；
 *   环路——低弦暗、高弦亮；基音的余音三到九秒，高处的分音半秒到两秒就没了，所以起音亮、余音圆；
 *   吟猱——延迟线的长度随时间变：起音从下方滑上来（绰）、拨后慢慢地颤（吟）、滑到邻近的音上去（走音）；
 *   泛音——另算：纯净的二倍 / 三倍 / 四倍音，几乎只有一个分音。
 * 出来以后过「琴身」：190Hz、410Hz 两处宽的共鸣，4.2kHz 以上收掉。
 *
 * 定弦是正调，以 G 为宫：一弦 D2、二弦 E2、三弦 G2、四弦 A2、五弦 B2、六弦 D3、七弦 E3（徵 羽 宫 商 角 徵 羽）。
 * 远琴的曲子是现编的：一句二到五个音，音与音隔 1.2–4 秒，句与句之间空 6–14 秒；
 * 句首多用低的散音，句末多落在宫音上；偶尔一个泛音、一个撮（八度同弹）。
 */
import { Base } from './base';
import type { Engine, LayerBus, Voice } from './engine';
import type { QinTech } from './types';
import { cents, clamp, pick, rand, smooth } from './util';

/** D2 E2 G2 A2 B2 D3 E3 G3 A3 B3 D4 */
const SCALE = [73.42, 82.41, 98.0, 110.0, 123.47, 146.83, 164.81, 196.0, 220.0, 246.94, 293.66];
const GONG = [2, 7];
/** 七根弦的散音（一弦到七弦） */
export const QIN_OPEN: readonly number[] = SCALE.slice(0, 7);
/** 按音往上数用的五声音级：接着 SCALE 再上去五个（E4 G4 A4 B4 D5） */
const LADDER = [...SCALE, 329.63, 392.0, 440.0, 493.88, 587.33];

export interface PluckO {
  f: number; dur: number; vel: number;
  /** 起音从偏离多少音分处滑到本音（负是从下方） */
  slide?: number;
  /** 吟：at 秒起，每秒 rate 次，深 depth 音分，持续 len 秒 */
  vib?: { at: number; rate: number; depth: number; len: number };
  /** 走音：at 秒起，len 秒内滑过 cents 音分 */
  glide?: { at: number; len: number; cents: number };
}
export function renderPluck(sr: number, o: PluckO): Float32Array<ArrayBuffer> {
  const n = Math.floor(sr * o.dur), out = new Float32Array(n);
  const span = Math.max(260, Math.abs(o.slide ?? 0) + 80, Math.abs(o.glide?.cents ?? 0) + 80);
  const size = Math.ceil(sr / (o.f * cents(-span))) + 8, line = new Float32Array(size);
  // 环路低通的系数按 48kHz 定的（a 越小越暗）；换了采样率要折算，让同一频率每秒掉的分贝数不变
  const a48 = clamp(0.36 + 0.1 * Math.log2(o.f / 98) + 0.12 * o.vel, 0.25, 0.8);
  const k = ((1 - a48) / (a48 * a48)) * Math.pow(sr / 48000, 2);
  const a = (-1 + Math.sqrt(1 + 4 * k)) / (2 * k);
  const comp = (1 - a) / a;
  const t60 = clamp(7.5 - 2.2 * Math.log2(o.f / 98), 3, 9);
  const loss = Math.pow(10, -3 / (o.f * t60));
  // 激励
  const N0 = Math.floor(sr / (o.f * cents(o.slide ?? 0)));
  const raw = new Float32Array(N0), ea = 1 - Math.pow(1 - clamp(0.1 + 0.28 * o.vel, 0.08, 0.5), 48000 / sr);
  let lp = 0, lp2 = 0;
  for (let i = 0; i < N0; i++) { lp += ea * (Math.random() * 2 - 1 - lp); lp2 += ea * (lp - lp2); raw[i] = lp2; }
  const pk = Math.max(1, Math.round(N0 / 8));
  let peak = 1e-9;
  for (let i = 0; i < N0; i++) { line[i] = raw[i] - raw[(i - pk + N0) % N0]; peak = Math.max(peak, Math.abs(line[i])); }
  for (let i = 0; i < N0; i++) line[i] *= o.vel / peak;
  // 环路
  let w = N0, y1 = 0;
  const vib = o.vib, gl = o.glide, slide = o.slide ?? 0, TAU = Math.PI * 2;
  // 此刻的弦长（延迟的样本数）：吟猱就是它在变。每 32 个样本算一次，中间直线过渡
  const lenAt = (tt: number) => {
    let c = 0;
    if (slide && tt < 0.24) c += slide * (1 - smooth(0, 0.24, tt));
    if (vib && tt > vib.at) { const u = tt - vib.at; c += vib.depth * Math.sin(TAU * vib.rate * u) * Math.min(1, u / 0.18) * (1 - smooth(vib.len * 0.5, vib.len, u)); }
    if (gl && tt > gl.at) c += gl.cents * smooth(0, gl.len, tt - gl.at);
    return sr / (o.f * (c ? Math.pow(2, c / 1200) : 1)) - comp;
  };
  const BLK = 32, moving = !!(slide || vib || gl);
  let L = lenAt(0), Lnext = L, dL = 0;
  for (let i = 0; i < n; i++) {
    if (moving && i % BLK === 0) { L = Lnext; Lnext = lenAt((i + BLK) / sr); dL = (Lnext - L) / BLK; }
    L += dL;
    let r = w - L;
    while (r < 0) r += size;
    const i0 = Math.floor(r), fr = r - i0, x = line[i0 % size] * (1 - fr) + line[(i0 + 1) % size] * fr;
    y1 += a * (x - y1);
    line[w] = y1 * loss;
    out[i] = y1;
    w = (w + 1) % size;
  }
  // 起音收一下棱，结尾收干净
  const att = Math.floor(sr * 0.004), rel = Math.floor(sr * 0.25);
  for (let i = 0; i < att; i++) out[i] *= i / att;
  for (let i = 0; i < rel; i++) out[n - 1 - i] *= i / rel;
  return out;
}
/** 泛音：纯净，几乎只有一个分音 */
export function renderHarmonic(sr: number, f: number, dur: number, vel: number): Float32Array<ArrayBuffer> {
  const n = Math.floor(sr * dur), out = new Float32Array(n), TAU = Math.PI * 2;
  const P: Array<[number, number, number]> = [[1, 1, 3.6], [2, 0.14, 1.7], [3, 0.05, 0.9]];
  const att = Math.max(1, Math.floor(sr * 0.004));
  for (const [r, amp, t60] of P) {
    // 正弦用递推（y[n] = 2cos(w)·y[n−1] − y[n−2]），衰减用逐样本乘——不必每个样本都算 sin 与 exp
    const w = (TAU * f * r) / sr, k = 2 * Math.cos(w), dec = Math.exp(-6.91 / (t60 * sr));
    let y1 = 0, y2 = -Math.sin(w), env = amp * vel;
    for (let i = 0; i < n; i++) {
      out[i] += y1 * env * (i < att ? i / att : 1);
      const y = k * y1 - y2;
      y2 = y1; y1 = y;
      env *= dec;
    }
  }
  const click = Math.floor(sr * 0.004);
  for (let i = 0; i < click; i++) out[i] += (Math.random() * 2 - 1) * 0.12 * vel * (1 - i / click);
  const rel = Math.floor(sr * 0.2);
  for (let i = 0; i < rel; i++) out[n - 1 - i] *= i / rel;
  return out;
}

export class Qin extends Base {
  private body: AudioNode;
  private next: number;
  private left = 0;
  private idx = 2;
  private first = true;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const b1 = this.filter('peaking', 190, 1.2), b2 = this.filter('peaking', 410, 1.5), lp = this.filter('lowpass', 4200, 0.6);
    b1.gain.value = 5; b2.gain.value = 3.5;
    b1.connect(b2); b2.connect(lp);
    const dry = this.gain(0.85), hall = this.gain(0.32);
    lp.connect(dry); dry.connect(bus.dry);
    lp.connect(hall); hall.connect(bus.hall);
    this.body = b1;
    this.next = t + (e.offline ? 0.4 : rand(1.5, 4));
  }
  private sound(t: number, data: Float32Array<ArrayBuffer>, rate: number, gain: number, pan: number) {
    const c = this.c, b = c.createBuffer(1, data.length, rate);
    b.copyToChannel(data, 0);
    const s = c.createBufferSource(), g = c.createGain(), p = c.createStereoPanner();
    s.buffer = b; g.gain.value = gain; p.pan.value = pan;
    s.connect(g); g.connect(p); p.connect(this.body);
    s.start(t);
    this.later(t + b.duration, () => p.disconnect());
  }
  schedule(from: number, to: number) {
    // 琴音 5kHz 以上没有东西：按一半的采样率算，省一半的工夫
    const sr = this.c.sampleRate / 2;
    while (this.next < to) {
      const t = Math.max(from, this.next);
      if (this.left <= 0) {
        // 新的一句：从低处的散音起
        this.left = 2 + Math.floor(rand(0, 4));
        this.idx = pick([0, 1, 2, 2, 3]);
        this.first = true;
      } else {
        this.idx = clamp(this.idx + pick([-2, -1, -1, 1, 1, 2, 3]), 0, SCALE.length - 1);
        if (this.left === 1 && Math.random() < 0.7) this.idx = Math.abs(this.idx - GONG[0]) <= Math.abs(this.idx - GONG[1]) ? GONG[0] : GONG[1];
      }
      const f = SCALE[this.idx], vel = rand(0.5, 0.82) * (this.first ? 1 : 0.9), pan = rand(-0.15, 0.15);
      const dur = clamp(7 - 1.6 * Math.log2(f / 98), 4, 8);
      const r = Math.random();
      if (r < 0.14 && !this.first) {
        // 泛音：低弦取四倍、高弦取二倍
        this.sound(t, renderHarmonic(sr, f * (f < 150 ? 4 : 2), 4.2, vel), sr, 0.2, pan);
      } else if (r < 0.24) {
        // 撮：八度同弹，上面一声略晚
        this.sound(t, renderPluck(sr, { f, dur, vel }), sr, 0.3, pan);
        this.sound(t + 0.014, renderPluck(sr, { f: f * 2, dur: dur * 0.8, vel: vel * 0.8 }), sr, 0.24, pan);
      } else {
        const o: PluckO = { f, dur, vel };
        const q = Math.random();
        if (q < 0.3) o.slide = pick([-190, -120, -120]); else if (q < 0.38) o.slide = 110;
        if (Math.random() < 0.55) o.vib = { at: rand(0.45, 0.9), rate: rand(3.2, 4.6), depth: rand(14, 28), len: rand(1.6, 2.6) };
        else if (this.left > 1 && Math.random() < 0.3) {
          // 走音：滑到邻近的音上，下一个音就从那里接着走
          const to2 = clamp(this.idx + (Math.random() < 0.6 ? -1 : 1), 0, SCALE.length - 1);
          if (to2 !== this.idx) { o.glide = { at: rand(0.8, 1.3), len: rand(0.4, 0.6), cents: 1200 * Math.log2(SCALE[to2] / f) }; this.idx = to2; }
        }
        this.sound(t, renderPluck(sr, o), sr, 0.32, pan);
      }
      this.left--;
      this.first = false;
      this.next = t + (this.left > 0 ? rand(1.2, 4) : rand(6, 14));
    }
  }
}

// ———————————————————————————— 抚琴 ————————————————————————————
/** 一个音怎么弹（一击 'qin' 的那几项选项） */
export interface QinNote { tech: QinTech; string: number; step?: number; slide?: number; vib?: boolean; glide?: number; vel?: number }

/**
 * 「顺着弹」：玩家不必会弹琴——每一下问它要下一个音。它顺着一条现编的旋律一步一步走：
 * 一句三到六个音，句首多是低处的散音，中间按音居多（带绰、吟，偶尔走到邻音上去），偶尔一个泛音，句末多落在宫音上。
 */
export class QinMelody {
  private idx = 2;
  private left = 0;
  private first = true;
  /** start：头一句从哪个音级起（0 是一弦的散音 D2）；不给就随意 */
  constructor(private start?: number) {}
  next(): QinNote {
    if (this.left <= 0) {
      this.left = 3 + Math.floor(rand(0, 4));
      this.idx = this.start ?? pick([0, 1, 2, 2, 3, 5]);
      this.start = undefined;
      this.first = true;
    } else {
      this.idx = clamp(this.idx + pick([-2, -1, -1, 1, 1, 2, 3]), 0, LADDER.length - 4);
      // 句末落在最近的宫音（G2、G3、G4）上
      if (this.left === 1 && Math.random() < 0.75) this.idx = [2, 7, 12].reduce((a, b) => (Math.abs(b - this.idx) < Math.abs(a - this.idx) ? b : a));
    }
    this.left--;
    const i = this.idx, first = this.first, r = Math.random(), vel = rand(0.55, 0.85) * (first ? 1 : 0.9);
    this.first = false;
    if (i < 7 && (first || r < 0.42)) return { tech: 'open', string: i + 1, vel };
    // 泛音听起来高一个八度：五级之上的音落在低五级的那根弦上
    if (!first && r > 0.88) return { tech: 'harmonic', string: clamp(i >= 5 ? i - 4 : i + 1, 1, 7), vel };
    const string = clamp(i + 1 - pick([1, 2, 2, 3]), 1, 7), step = i - (string - 1);
    if (step < 1) return { tech: 'open', string: clamp(i + 1, 1, 7), vel };
    const q = Math.random();
    // 走音：滑到邻近的音级上，下一个音就从那里接着走
    if (this.left > 0 && q < 0.2) { const g = Math.random() < 0.6 ? -1 : 1; this.idx = clamp(i + g, 0, LADDER.length - 4); return { tech: 'press', string, step, glide: g, vel }; }
    return { tech: 'press', string, step, vib: q < 0.75, slide: q > 0.5 ? pick([-190, -120, -120, 110]) : 0, vel };
  }
}

/** 每个引擎记着七根弦上各自还在响的那个音（同一根弦再弹，前一个音就止住——弦只有一根） */
const RINGING = new WeakMap<Engine, Map<number, GainNode>>();

/**
 * 一击 'qin'：玩家抚琴的一下。两种叫法：
 *
 * 一、只给 pitch（世界里的活动这样叫）：比宫弦（三弦的散音，G2）高几个半音——给了 string 就是比那根弦的散音高几个半音。
 *     不管给的是几，都就近落到五声的音级上（D E G A B），弹一个音：落在七根弦的散音上就是散音，再高就是按音（带一点绰、吟）。
 *     variant: 'harmonic' 则弹成泛音。
 * 二、说清指法（tech）：
 *   'open' 散音（string 第几弦）；'press' 按音（在 string 这根弦上往上数 step 个五声音级；slide 起音从几音分之外滑入、
 *   vib 吟、glide 弹完滑到上/下一两个音级）；'harmonic' 泛音（step 0 是七徽的二倍音，1 是三倍音，2 是四倍音）；
 *   'cuo' 撮（与高八度同弹）；'gun' 滚（从 string 往低弦连拨四到六根）；'fu' 拂（从 string 往高弦）；'phrase' 一个现编的小句（三四个音）。
 * 都认 vel 力度、pan 声像。
 */
export function qinShot(v: Voice): number {
  const c = v.ctx, t = v.t, sr = c.sampleRate / 2;
  let ringing = RINGING.get(v.e);
  if (!ringing) { ringing = new Map(); RINGING.set(v.e, ringing); }
  const ring = ringing;
  // 琴身
  const b1 = c.createBiquadFilter(), b2 = c.createBiquadFilter(), lp = c.createBiquadFilter();
  b1.type = 'peaking'; b1.frequency.value = 190; b1.Q.value = 1.2; b1.gain.value = 5;
  b2.type = 'peaking'; b2.frequency.value = 410; b2.Q.value = 1.5; b2.gain.value = 3.5;
  lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.6;
  b1.connect(b2); b2.connect(lp); lp.connect(v.out);
  const sound = (string: number, data: Float32Array<ArrayBuffer>, gain: number, at: number) => {
    const b = c.createBuffer(1, data.length, sr);
    b.copyToChannel(data, 0);
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; g.gain.value = gain;
    s.connect(g); g.connect(b1);
    s.start(at);
    ring.get(string)?.gain.setTargetAtTime(0, at, 0.035);
    ring.set(string, g);
  };
  const vibrato = () => ({ at: rand(0.4, 0.75), rate: rand(3.3, 4.4), depth: rand(15, 27), len: rand(1.6, 2.4) });
  /** 一个音；返回它响多久 */
  const note = (n: QinNote, at: number, vel: number, short = false): number => {
    const string = clamp(Math.round(n.string), 1, 7), open = SCALE[string - 1];
    if (n.tech === 'harmonic') {
      let m = n.step === 1 ? 3 : n.step === 2 ? 4 : 2;
      if (m === 3 && string === 5) m = 4;   // 五弦的三倍音是升 F，不在调里
      sound(string, renderHarmonic(sr, open * m, 4.2, vel), 0.26, at);
      return 4.2;
    }
    let idx = string - 1, f = open;
    if (n.tech === 'press') { idx = clamp(string - 1 + Math.max(1, Math.round(n.step ?? 2)), 0, LADDER.length - 1); f = LADDER[idx]; }
    const dur = short ? 3 : clamp(7 - 1.6 * Math.log2(f / 98), 4, 8), p: PluckO = { f, dur, vel };
    if (n.tech === 'press') {
      const slide = n.slide ?? (Math.random() < 0.5 ? pick([-190, -120, -120, 110]) : 0);
      if (slide) p.slide = slide;
      const to = n.glide ? clamp(idx + Math.round(n.glide), 0, LADDER.length - 1) : idx;
      if (to !== idx) p.glide = { at: rand(0.55, 0.85), len: rand(0.35, 0.5), cents: 1200 * Math.log2(LADDER[to] / f) };
      else if (n.vib ?? true) p.vib = vibrato();
    }
    sound(string, renderPluck(sr, p), short ? 0.3 : 0.42, at);
    return dur;
  };
  const tech = v.raw.tech ?? 'open', vel = 0.4 + 0.5 * v.vel, given = v.raw.string != null;
  const string = clamp(Math.round(v.raw.string ?? (tech === 'gun' ? 7 : tech === 'fu' ? 1 : 3)), 1, 7);
  if (v.raw.tech == null && v.raw.pitch != null) {
    // 只说了高几个半音：就近落到五声的音级上
    const f = SCALE[string - 1] * Math.pow(2, clamp(v.raw.pitch, -24, 36) / 12);
    let idx = 0;
    for (let i = 1; i < LADDER.length; i++) if (Math.abs(Math.log(LADDER[i] / f)) < Math.abs(Math.log(LADDER[idx] / f))) idx = i;
    if (v.raw.variant === 'harmonic') return note({ tech: 'harmonic', string: clamp(idx >= 5 ? idx - 4 : idx + 1, 1, 7) }, t, vel);
    if (idx < 7) return note({ tech: 'open', string: idx + 1 }, t, vel);
    const s = clamp(idx - pick([1, 2, 2, 3]), 1, 7);
    return note({ tech: 'press', string: s, step: idx - (s - 1), vib: v.raw.vib, slide: v.raw.slide }, t, vel);
  }
  const one: QinNote = { tech, string, step: v.raw.step, slide: v.raw.slide, vib: v.raw.vib, glide: v.raw.glide };
  switch (tech) {
    case 'cuo': {
      // 撮：两根弦同弹成八度。一与六、二与七都是散音；别的弦，上面那个音是按出来的
      const d = note({ tech: 'open', string }, t, vel);
      if (string <= 2) note({ tech: 'open', string: string + 5 }, t + 0.014, vel * 0.85);
      else { const s2 = Math.min(7, string + 2); note({ tech: 'press', string: s2, step: string + 5 - s2, slide: 0, vib: false }, t + 0.014, vel * 0.85); }
      return d;
    }
    case 'gun':
    case 'fu': {
      // 滚：从高弦往低弦连拨；拂：从低弦往高弦。四到六根，越拨越快一点
      const dir = tech === 'gun' ? -1 : 1, n = 4 + Math.floor(rand(0, 3));
      let at = t, gap = rand(0.075, 0.1), k = 0;
      for (; k < n; k++) {
        const s = string + dir * k;
        if (s < 1 || s > 7) break;
        note({ tech: 'open', string: s }, at, vel * (0.5 + (0.3 * (k + 1)) / n), true);
        at += gap; gap *= 0.94;
      }
      return at - t + 3;
    }
    case 'phrase': {
      // 一个小句：三四个音，顺着现编的旋律走（给了 string 就从那根弦附近起）
      const m = new QinMelody(given ? string - 1 : 2);
      let at = t, end = 0;
      for (let k = 0, n = 3 + Math.floor(rand(0, 2)); k < n; k++) {
        const q = m.next();
        end = Math.max(end, at - t + note(q, at, vel * (q.vel ?? 0.8)));
        at += rand(0.55, 1.1);
      }
      return end;
    }
    default: return note(one, t, vel);
  }
}
