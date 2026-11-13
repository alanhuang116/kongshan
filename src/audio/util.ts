/** 小工具：随机、换算、噪声与控制信号的 buffer、混响的脉冲响应、包络。 */

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const cents = (c: number) => Math.pow(2, c / 1200);

// —— 远近 ——
/** 远近 0…1 → 衰减（到 1 时还剩百分之七）、低通的截止（16kHz → 900Hz） */
export const distGain = (d: number) => 1 - 0.93 * Math.pow(clamp(d), 0.8);
export const distCut = (d: number) => 16000 * Math.pow(900 / 16000, Math.pow(clamp(d), 1.2));
/**
 * 层里自己排的一击：按远近给干声与回声的比例（越远回声越多）。
 * 回声不能加得太多：「野外」那段脉冲响应的力气都在两千赫兹以下，持续的、有音高的声音（笛、鸡鸣）送多了，回声反倒比干声还响。
 */
export const distMix = (d: number, open = 0.14) => ({ dry: 1, hall: 0, open: open + 0.2 * clamp(d) });

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
 * 有颗粒的噪声：白噪声乘上一条每秒 rate 个点的随机包络——许多片叶子、许多根细枝各自在碰，不是匀匀的一片「沙」。
 * sparse 越大，包络越多地待在低处（颗粒越稀、越分明）。循环着放，接缝处包络是连着的。
 */
export function grainBuffer(ctx: BaseAudioContext, seconds: number, rate: number, sparse = 1.5): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), pts = Math.max(2, Math.round(seconds * rate));
  const p = new Float32Array(pts + 1);
  for (let i = 0; i < pts; i++) p[i] = Math.pow(Math.random(), sparse);
  p[pts] = p[0];
  const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * pts, k = Math.floor(x), f = x - k, w = (1 - Math.cos(f * Math.PI)) * 0.5;
    d[i] = (Math.random() * 2 - 1) * (p[k] * (1 - w) + p[k + 1] * w);
  }
  return b;
}

/**
 * 一开一合的噪声：白噪声乘上每秒 rate 下的正弦开合（蝉的鼓膜）。长度取成开合的整数个周期，循环着放没有接缝。
 */
export function pulsedNoise(ctx: BaseAudioContext, seconds: number, rate: number): AudioBuffer {
  const sr = ctx.sampleRate, cycles = Math.max(1, Math.round(seconds * rate)), n = Math.round((cycles / rate) * sr), w = (Math.PI * 2 * cycles) / n;
  const b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(w * i));
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
/**
 * 野外：田园里没有墙，声音几乎是干的——只有一层很薄、很散的尾（林子、坡地把声音散回来，约 1.1 秒），
 * 外加北边山脚两三道很轻、很闷的回声（隔得远：0.2 秒之后才到）。
 * （空山那一版是「山谷」：七道清楚的回声。放在平野上不对——柴门一响后面跟着一串「啪啪啪」。）
 */
export function openIR(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * 1.4);
  const buf = ctx.createBuffer(2, len, sr);
  const echoes: Array<[number, number, number]> = [[212, 0.2, 0], [388, 0.15, 1], [655, 0.085, 0]];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    // 回声：每道是一小粒低通过的噪声（山坡不是镜子），越远越闷
    for (const [ms, g, side] of echoes) {
      const at = Math.floor(sr * (ms + (ch ? 7 : 0)) * 0.001), n = Math.floor(sr * (0.012 + ms * 0.00002));
      let lp = 0;
      const a = 1 - Math.exp((-2 * Math.PI * (2600 - ms * 1.6)) / sr);
      for (let k = 0; k < n; k++) {
        lp += a * (Math.random() * 2 - 1 - lp);
        d[at + k] += lp * g * (side === ch ? 1 : 0.5) * Math.sin((Math.PI * k) / n);
      }
    }
    // 散的尾：稀疏的小脉冲过低通，四十几毫秒之后慢慢起来，再按 1.1 秒衰减
    const start = Math.floor(sr * 0.045), dec = Math.exp(-6.91 / (1.1 * sr)), p = 1400 / sr, build = Math.floor(sr * 0.09);
    let lp = 0, env = 0.05;
    for (let i = start, k = 0; i < len; i++, k++) {
      const x = Math.random() < p ? (Math.random() < 0.5 ? -1 : 1) : 0;
      lp += 0.28 * (x * 6 - lp);
      d[i] += lp * env * Math.min(1, k / build);
      env *= dec;
    }
  }
  unitEnergy(buf);
  return buf;
}

/** 草堂：小屋，土墙茅顶都吸声——约 0.3 秒，偏暗，几道很近的早期反射（墙、梁、书架） */
export function roomIR(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * 0.42), pre = Math.floor(sr * 0.004);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch), dec = Math.exp(-6.91 / (0.3 * sr)), a = 1 - Math.exp((-2 * Math.PI * 2600) / sr), build = Math.floor(sr * 0.012);
    let lp = 0, env = 0.6;
    for (let i = pre, k = 0; i < len; i++, k++) {
      lp += a * (Math.random() * 2 - 1 - lp);
      d[i] = lp * env * (k < build ? 0.3 + (0.7 * k) / build : 1);
      env *= dec;
    }
    for (const [ms, g] of [[5.5, 0.6], [9, -0.5], [13.5, 0.4], [19, -0.3], [27, 0.22]] as const) {
      const at = Math.floor(sr * (ms + (ch ? 1.3 : 0)) * 0.001);
      for (let k = 0; k < 16; k++) d[at + k] += g * 0.08 * (1 - k / 16) * (k % 2 ? -1 : 1);
    }
  }
  unitEnergy(buf);
  return buf;
}

// —— 预先算好、循环着放的「一片」 ——
export interface BubbleO {
  seconds: number;
  /** 每秒多少个 */
  rate: number;
  fLo: number;
  fHi: number;
  /** 每个泡响多少周（品质因数，默认 18） */
  q?: number;
  /** 音高往上滑几成（默认 0.12） */
  chirp?: number;
  /** 幅度分布的指数：越大，小的越多、大的越少（默认 2.2） */
  skew?: number;
  /** 大于 1 则低的泡多（默认 1.3） */
  lowBias?: number;
  /** 每个泡前面带多少噪声（雨点砸在水面的那一下） */
  tick?: number;
}
/**
 * 一片水泡：水声里一颗一颗的「汩」就是它——每个泡是一个很快衰减、略往上滑的正弦（小泡高、大泡低而响）。
 * 直接算进一段波形，循环着放（尾巴绕回开头，接缝处没有断口）；比每个泡一个振荡器省得多。
 */
export function bubbleField(ctx: BaseAudioContext, o: BubbleO): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * o.seconds), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), TAU = Math.PI * 2;
  const count = Math.round(o.seconds * o.rate);
  for (let k = 0; k < count; k++) {
    const at = Math.floor(Math.random() * n);
    const f = o.fLo * Math.pow(o.fHi / o.fLo, Math.pow(Math.random(), o.lowBias ?? 1.3));
    const tau = ((o.q ?? 18) * rand(0.6, 1.5)) / (Math.PI * f);
    const m = Math.min(n, Math.floor(sr * tau * 6.5)), att = Math.max(4, Math.floor(sr * 0.0006));
    const amp = Math.pow(Math.random(), o.skew ?? 2.2) * Math.sqrt(o.fLo / f) + 0.01;
    const w0 = (TAU * f) / sr, chirp = (o.chirp ?? 0.12) * rand(0.3, 1.6), dec = Math.exp(-1 / (tau * sr));
    let ph = 0, e = amp;
    for (let j = 0; j < m; j++) {
      ph += w0 * (1 + (chirp * j) / m);
      d[(at + j) % n] += Math.sin(ph) * e * (j < att ? j / att : 1);
      e *= dec;
    }
    if (o.tick) {
      const tn = Math.floor(sr * 0.0015);
      for (let j = 0; j < tn; j++) d[(at + j) % n] += (Math.random() * 2 - 1) * amp * o.tick * (1 - j / tn);
    }
  }
  return b;
}
/**
 * 一滴水的波形：一个往上滑的小气泡（35 毫秒里升到 1.9 倍，很快收掉），头上带砸下去的一点「嗒」。
 * 层里的滴水（檐滴、溪里的水珠、鱼唼水面）一秒好几滴：直接放这一小段（变速就是变音高），不必每滴搭十来个节点。
 */
export function dripBuffer(ctx: BaseAudioContext, f = 1000): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * 0.16), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0), TAU = Math.PI * 2;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / sr;
    ph += (TAU * f * Math.pow(1.9, Math.min(1, u / 0.035))) / sr;
    d[i] = Math.sin(ph) * Math.min(1, u / 0.003) * Math.exp(-Math.max(0, u - 0.003) / 0.00875) + (u < 0.004 ? (Math.random() * 2 - 1) * 0.3 * (1 - u / 0.004) : 0);
  }
  return b;
}
export interface PatterO {
  seconds: number;
  rate: number;
  /** 每一点多长（秒）：最短、最长 */
  len: readonly [number, number];
  /** 每一点的明暗（一阶低通的系数，0…1，越大越亮）：最暗、最亮 */
  bright: readonly [number, number];
  /** 幅度分布的指数（默认 2.2） */
  skew?: number;
}
/** 一片雨点：每一点是很短的一粒滤过的噪声，轻的多重的少、明暗各不相同。循环着放 */
export function patterField(ctx: BaseAudioContext, o: PatterO): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * o.seconds), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
  for (let k = 0, count = Math.round(o.seconds * o.rate); k < count; k++) {
    const at = Math.floor(Math.random() * n), dur = Math.floor(sr * rand(o.len[0], o.len[1]));
    const amp = Math.pow(Math.random(), o.skew ?? 2.2) * 0.5 + 0.03, a = rand(o.bright[0], o.bright[1]), att = Math.max(2, Math.floor(dur * 0.08));
    let lp = 0;
    for (let i = 0; i < dur; i++) {
      const x = Math.random() * 2 - 1;
      lp += a * (x - lp);
      // 亮的点留一些高处（原样的噪声减去低通过的），暗的点只要低通过的
      d[(at + i) % n] += (a > 0.5 ? x - lp * 0.6 : lp * 1.6) * amp * Math.exp(-i / (dur * 0.3)) * (i < att ? i / att : 1);
    }
  }
  return b;
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
export type Pts = ReadonlyArray<readonly [number, number]>;
/** 折线：[秒, 值] 一串，从 t 起。expo 为真时点与点之间按指数过渡（音高用；值都得是正的） */
export function line(p: AudioParam, t: number, pts: Pts, expo = false) {
  p.setValueAtTime(pts[0][1], t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) {
    if (expo) p.exponentialRampToValueAtTime(Math.max(1e-4, pts[i][1]), t + pts[i][0]);
    else p.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
  }
}
/** 折线的最后一个时刻 */
export const lastT = (pts: Pts) => pts[pts.length - 1][0];
