/** 小工具：随机、换算、噪声与控制信号的 buffer、混响的脉冲响应、包络。 */

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const cents = (c: number) => Math.pow(2, c / 1200);

// —— 噪声 ——
/** 首尾交叠一段，循环播放时接缝听不出来 */
function loopable(src: Float32Array, n: number, fade: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = src[i];
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    out[i] = src[i] * Math.sin(w * Math.PI * 0.5) + src[n + i] * Math.cos(w * Math.PI * 0.5);
  }
  return out;
}
export function whiteBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
/** 粉噪声（Paul Kellet 的滤波法），每倍频程能量相等：风、雨、纸的底子 */
export function pinkBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), fade = Math.floor(sr * 0.25);
  const raw = new Float32Array(n + fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  const b = ctx.createBuffer(1, n, sr);
  b.copyToChannel(loopable(raw, n, fade), 0);
  return b;
}
/** 褐噪声（积分过的白噪声）：水的底、远处的隆隆 */
export function brownBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), fade = Math.floor(sr * 0.25);
  const raw = new Float32Array(n + fade);
  let last = 0;
  for (let i = 0; i < raw.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; raw[i] = last * 3.5; }
  const b = ctx.createBuffer(1, n, sr);
  b.copyToChannel(loopable(raw, n, fade), 0);
  return b;
}

/**
 * 控制信号：一段平滑的随机曲线（−1…1），循环播放后接到 AudioParam 上，当「不规则的 LFO」用。
 * rate 是每秒多少个随机点，点与点之间用余弦过渡；首尾相接。采样率取 22050（各浏览器都收）。
 */
export const CTRL_SR = 22050;
export function ctrlBuffer(ctx: BaseAudioContext, seconds: number, rate: number): AudioBuffer {
  const n = Math.floor(CTRL_SR * seconds), pts = Math.max(2, Math.round(seconds * rate));
  const p = new Float32Array(pts + 1);
  for (let i = 0; i < pts; i++) p[i] = Math.random() * 2 - 1;
  p[pts] = p[0];
  const b = ctx.createBuffer(1, n, CTRL_SR), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * pts, k = Math.floor(x), f = x - k, w = (1 - Math.cos(f * Math.PI)) * 0.5;
    d[i] = p[k] * (1 - w) + p[k + 1] * w;
  }
  return b;
}

// —— 混响的脉冲响应 ——
function unitEnergy(buf: AudioBuffer, gain = 1) {
  let e = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) e += d[i] * d[i]; }
  const k = gain / Math.sqrt(e / buf.numberOfChannels || 1);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
}
/** 殿：约 2.6 秒，偏暗（越往后高频越少），12ms 预延迟，开头 30ms 渐密 */
export function hallIR(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * 2.9), pre = Math.floor(sr * 0.012);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // 衰减逐样本乘；低通的截止每 64 个样本换一次（不必每个样本算指数）
    const dec = Math.exp(-6.91 / (2.6 * sr)), build = Math.floor(sr * 0.03);
    let lp = 0, env = 1, a = 0;
    for (let i = pre, k = 0; i < len; i++, k++) {
      if ((k & 63) === 0) a = 1 - Math.exp((-2 * Math.PI * (1100 + 5200 * Math.exp(-k / sr / 0.45))) / sr);
      lp += a * (Math.random() * 2 - 1 - lp);
      d[i] = lp * env * (k < build ? 0.25 + (0.75 * k) / build : 1);
      env *= dec;
    }
    // 几道早期反射（木柱、墙）
    for (const [ms, g] of [[19, 0.5], [31, -0.42], [47, 0.36], [68, -0.28], [93, 0.2]] as const) {
      const at = Math.floor(sr * (ms + (ch ? 3.5 : 0)) * 0.001);
      for (let k = 0; k < 24; k++) d[at + k] += g * 0.05 * (1 - k / 24) * (k % 2 ? -1 : 1);
    }
  }
  unitEnergy(buf);
  return buf;
}
/** 山谷：约 1.2 秒，很稀——几道隔得开的回声加一层薄薄的尾 */
export function openIR(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.5);
  const buf = ctx.createBuffer(2, len, sr);
  const echoes: Array<[number, number, number]> = [[86, 0.55, 0], [142, 0.42, 1], [228, 0.34, 0], [331, 0.25, 1], [470, 0.17, 0], [655, 0.11, 1], [880, 0.06, 0]];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // 回声：每道是一小粒低通过的噪声（山壁不是镜子）
    for (const [ms, g, side] of echoes) {
      const at = Math.floor(sr * ms * 0.001), n = Math.floor(sr * (0.004 + ms * 0.00002));
      let lp = 0;
      const a = 1 - Math.exp((-2 * Math.PI * (4200 - ms * 3)) / sr);
      for (let k = 0; k < n; k++) {
        lp += a * (Math.random() * 2 - 1 - lp);
        d[at + k] += lp * g * (side === ch ? 1 : 0.45) * Math.sin((Math.PI * k) / n);
      }
    }
    // 薄尾：稀疏的小脉冲，指数衰减
    const start = Math.floor(sr * 0.05), dec = Math.exp(-6.91 / (1.2 * sr)), p = 900 / sr;
    let lp = 0, env = 0.05 * Math.exp((-6.91 * 0.05) / 1.2);
    for (let i = start; i < len; i++) {
      const x = Math.random() < p ? (Math.random() < 0.5 ? -1 : 1) : 0;
      lp += 0.32 * (x * 6 - lp);
      d[i] += lp * env;
      env *= dec;
    }
  }
  unitEnergy(buf);
  return buf;
}

/** 末级的软限幅：0.62 以下原样，之上渐渐压平，最高到约 0.89——任何组合都不会削波 */
export function softClipCurve(n = 4097): Float32Array<ArrayBuffer> {
  const k = 0.62, c = 0.93, a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
    a[i] = Math.sign(x) * (ax <= k ? ax : k + (c - k) * Math.tanh((ax - k) / (c - k)));
  }
  return a;
}

// —— 包络 ——
/** 一击：从 0 在 att 秒内升到 peak，再按 t60（降 60 分贝所需的秒数）指数衰减 */
export function strike(p: AudioParam, t: number, peak: number, att: number, t60: number) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + att);
  p.setTargetAtTime(0, t + att, t60 / 6.91);
}
/** 一口气：0 → peak（att）→ 保持 → 0（rel） */
export function swell(p: AudioParam, t: number, peak: number, att: number, dur: number, rel: number) {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + att);
  p.setValueAtTime(peak, Math.max(t + att, t + dur - rel));
  p.linearRampToValueAtTime(0, t + dur);
}
