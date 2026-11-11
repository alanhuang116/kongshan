/**
 * 古琴（生成式）。
 *
 * 每个音都是现算的一段波形（Karplus–Strong 拨弦：一条延迟线里循环的一个周期，每转一圈过一次低通、损耗一点）：
 *   激励——指肉拨弦，不是拨片：一个周期长的噪声先低通，再过「拨在弦长八分之一处」的梳状；
 *   环路——低弦暗、高弦亮；基音的余音三到九秒，高处的分音半秒到两秒就没了，所以起音亮、余音圆；
 *   吟猱——延迟线的长度随时间变：起音从下方滑上来（绰）、拨后慢慢地颤（吟）、滑到邻近的音上去（走音）；
 *   泛音——另算：纯净的二倍 / 四倍音，几乎只有一个分音。
 * 出来以后过「琴身」：190Hz、410Hz 两处宽的共鸣，4.2kHz 以上收掉。
 *
 * 曲子是现编的：G 宫五声（D E G A B），一句二到五个音，音与音隔 1.2–4 秒，句与句之间空 6–14 秒；
 * 句首多用低的散音，句末多落在宫音上；偶尔一个泛音、一个撮（八度同弹）。
 */
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { cents, clamp, pick, rand, smooth } from './util';

/** D2 E2 G2 A2 B2 D3 E3 G3 A3 B3 D4 */
const SCALE = [73.42, 82.41, 98.0, 110.0, 123.47, 146.83, 164.81, 196.0, 220.0, 246.94, 293.66];
const GONG = [2, 7];

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
