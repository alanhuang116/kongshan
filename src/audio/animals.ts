/**
 * 禽兽虫鱼（后来添的这一批）：蛙、黄鹂、喜鹊、寒鸦、雁阵、鹿、羊、驴、蜂、一群鸟惊飞、鱼跃、猫的呼噜、鸡啄食、松鼠、青蛙跳水；
 * cackle 是母鸡下了蛋之后那一串「咯咯咯——哒」（就是 hen 的 egg）。原有的鸡鸭鹅犬牛猫、布谷在 village.ts。
 *
 * 叫声大多是「嗓子」（kit.ts 的 voiced）：一个锯齿波按折线走音高、按折线开合，过几个共振峰——
 *   喜鹊是一连串极毛、噪声很多的短「喳」；寒鸦是哑的「哇——」；羊是从闭着的嘴里张开的「咩——」、一颤一颤；
 *   驴是吸气时高而尖的「咿」与呼气时低而响的「啊」一来一回；鹿是远远一声短而亮的「呦」。
 * 一声里有许多小东西的（一片蛙、一窝蜂、一群翅膀）直接算进一段波形里放：一个节点，不必每只建一串节点。
 * 远近照旧由引擎管（给 at 或 dist）。
 */
import type { Engine, Voice } from './engine';
import { EXTRA_SHOTS } from './extra';
import { bubble, burst, curveOf, hiss, reson, sprinkle, tap, voiced, wobble } from './kit';
import { orioleSong, playSong } from './song';
import type { Shot } from './types';
import { clamp, lerp, rand } from './util';
import { cluck, VILLAGE_SHOTS } from './village';

const TAU = Math.PI * 2;
/** 世界里的黄鹂上一回叫是什么时候（每个引擎一份） */
const ORIOLE = new WeakMap<Engine, number>();

// ———————————————————————————— 蛙 ————————————————————————————
interface CroakO { rate: number; f1: number; f2: number; amp: number; /** 上面那个共鸣占几成（远的蛙高处被吃掉，给小一些） */ hi?: number; q1?: number; q2?: number }
/**
 * 一声「呱」算进波形：每秒 rate 下的脉冲（声带一开一合），每一下去激喉囊的两个共鸣（f1 与它的两倍半上下），
 * 共鸣的余音由 Q 定（τ = Q / (π f)）。起 25 毫秒、收 60 毫秒；一声里脉冲略变快（「呱」的尾巴往上翘一点）。
 * 写进 L、R 两路（gl、gr 是左右的份量），下标绕回开头——循环放的一片蛙接缝处不断。
 */
function croakInto(L: Float32Array, R: Float32Array | null, gl: number, gr: number, sr: number, at: number, len: number, o: CroakO) {
  const n = L.length, tau1 = (o.q1 ?? 5) / (Math.PI * o.f1), tau2 = (o.q2 ?? 7) / (Math.PI * o.f2);
  const ring = Math.ceil(sr * Math.max(tau1, tau2) * 5), w1 = (TAU * o.f1) / sr, w2 = (TAU * o.f2) / sr, k1 = Math.exp(-1 / (tau1 * sr)), k2 = Math.exp(-1 / (tau2 * sr));
  const hi = 0.45 * (o.hi ?? 1);
  for (let x = 0; x < len;) {
    const u = x / len, env = Math.min(1, x / 0.025) * Math.min(1, (len - x) / 0.06), i0 = at + Math.floor(x * sr), g = o.amp * env * rand(0.85, 1.15);
    let e1 = g, e2 = g * hi;
    for (let j = 0; j < ring; j++) {
      const s = e1 * Math.sin(w1 * j) + e2 * Math.sin(w2 * j), k = (i0 + j) % n;
      L[k] += s * gl;
      if (R) R[k] += s * gr;
      e1 *= k1; e2 *= k2;
    }
    x += 1 / (o.rate * (0.94 + 0.12 * u) * rand(0.97, 1.03));
  }
}
/**
 * 一片蛙（夏夜池边、田里的那种成片的叫）：十八只，各有各的嗓子、远近、方位；整片的兴头一阵一阵地起落
 *（几只叫起来别的就跟上，过一会儿又一起歇一歇）。算成一段循环的双声道波形，接缝处兴头与叫声都是连着的。
 */
export function frogChorus(ctx: BaseAudioContext, seconds = 12): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), b = ctx.createBuffer(2, n, sr), L = b.getChannelData(0), R = b.getChannelData(1);
  const waves = 2 + Math.floor(rand(0, 2)), ph = rand(0, 1), mood = (u: number) => 0.5 + 0.5 * Math.sin(TAU * (u * waves + ph));
  for (let f = 0; f < 18; f++) {
    const far = Math.pow(Math.random(), 0.7), pan = rand(-0.9, 0.9), gl = Math.sqrt(0.5 * (1 - pan)) * 1.2, gr = Math.sqrt(0.5 * (1 + pan)) * 1.2;
    const f1 = rand(600, 1000), o: CroakO = { rate: rand(32, 54), f1, f2: f1 * rand(2.2, 2.9), amp: 0.22 * lerp(1, 0.22, far), hi: 1 - 0.8 * far };
    const t0 = rand(0, seconds);
    for (let t = t0, guard = 0; t < t0 + seconds && guard < 80; guard++) {
      const m = mood((t % seconds) / seconds);
      let x = t;
      if (Math.random() < 0.2 + 0.8 * m) for (let i = 0, k = 2 + Math.floor(rand(0, 4)); i < k; i++) { const len = rand(0.15, 0.28); croakInto(L, R, gl, gr, sr, Math.floor((x % seconds) * sr), len, o); x += len + rand(0.1, 0.25); }
      t = x + rand(1.5, 6) / (0.35 + m);
    }
  }
  return b;
}
function croakShot(v: Voice, t: number, o: CroakO, k: number, pan = 0): number {
  const sr = v.ctx.sampleRate;
  const lens: number[] = [];
  let x = 0;
  for (let i = 0; i < k; i++) { const len = rand(0.16, 0.3); lens.push(len); x += len + rand(0.12, 0.28); }
  const b = v.ctx.createBuffer(1, Math.floor(sr * (x + 0.1)), sr), d = b.getChannelData(0);
  x = 0;
  for (const len of lens) { croakInto(d, null, 1, 1, sr, Math.floor(x * sr), len, o); x += len + rand(0.12, 0.28); }
  const s = v.ctx.createBufferSource();
  s.buffer = b;
  if (pan) { const p = v.ctx.createStereoPanner(); p.pan.value = pan; s.connect(p); p.connect(v.out); } else s.connect(v.out);
  s.start(t);
  return x;
}

// ———————————————————————————— 蜂 ————————————————————————————
/** 翅膀的嗡：谐波很多（每秒两百多下的拍打不是正弦） */
const BEE_H = [1, 0.62, 0.45, 0.33, 0.24, 0.17, 0.12, 0.08, 0.05, 0.03];
/**
 * 一窝蜂（蜂箱边）：十只工蜂，各自的翅膀快慢（205–255 下/秒）一直细细地走、近了远了响度起落、在左右之间来去。
 * 一个周期的波形先算成一张表，按相位查表（比逐样本算十个正弦省得多）；首尾交叠一段，循环接缝听不出来。
 */
export function hiveBuzz(ctx: BaseAudioContext, seconds = 7): AudioBuffer {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), fade = Math.floor(sr * 0.4), m = n + fade, T = 2048, table = new Float32Array(T + 1);
  let top = 0;
  for (let i = 0; i <= T; i++) { let s = 0; for (let h = 0; h < BEE_H.length; h++) s += BEE_H[h] * Math.sin((TAU * (h + 1) * i) / T + h * 1.7); table[i] = s; top = Math.max(top, Math.abs(s)); }
  for (let i = 0; i <= T; i++) table[i] /= top;
  const L = new Float32Array(m), R = new Float32Array(m);
  // 一条平滑的随机曲线（每 every 秒一个点，点与点之间余弦过渡）
  const wander = (every: number, lo: number, hi: number) => {
    const k = Math.max(2, Math.ceil((m / sr) / every) + 1), p = Array.from({ length: k }, () => rand(lo, hi));
    return (i: number) => { const x = i / (sr * every), j = Math.floor(x), f = x - j, w = (1 - Math.cos(f * Math.PI)) * 0.5; return p[j] * (1 - w) + p[Math.min(k - 1, j + 1)] * w; };
  };
  // 曲线每 64 个样本取一次（一毫秒多），块里的响度线性过渡——省掉逐样本算余弦
  const B = 64;
  for (let b = 0; b < 10; b++) {
    const f0 = rand(205, 255), cents = wander(rand(0.2, 0.4), -40, 40), amp = wander(rand(0.4, 0.9), -0.6, 1), pan = wander(rand(0.8, 1.6), -0.9, 0.9);
    let ph = rand(0, T), a0 = Math.max(0, amp(0));
    for (let i0 = 0; i0 < m; i0 += B) {
      const a1 = Math.max(0, amp(Math.min(m - 1, i0 + B))), inc = (f0 * Math.pow(2, cents(i0) / 1200) * T) / sr, p = pan(i0), gl = (1 - 0.6 * p) * 0.16, gr = (1 + 0.6 * p) * 0.16;
      const end = Math.min(m, i0 + B);
      if (a0 <= 0 && a1 <= 0) { ph = (ph + inc * (end - i0)) % T; a0 = a1; continue; }
      for (let i = i0; i < end; i++) {
        ph += inc;
        if (ph >= T) ph -= T;
        const k = ph | 0, a = (a0 + ((a1 - a0) * (i - i0)) / B) * 0.3, s = (table[k] + (table[k + 1] - table[k]) * (ph - k)) * a;
        L[i] += s * gl; R[i] += s * gr;
      }
      a0 = a1;
    }
  }
  const out = ctx.createBuffer(2, n, sr);
  for (const [src, ch] of [[L, 0], [R, 1]] as const) {
    const d = out.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = src[i];
    // 尾巴叠回开头
    for (let i = 0; i < fade; i++) { const w = i / fade; d[i] = src[i] * Math.sin(w * Math.PI * 0.5) + src[n + i] * Math.cos(w * Math.PI * 0.5); }
  }
  return out;
}

// ———————————————————————————— 翅膀 ————————————————————————————
/**
 * 一群鸟惊飞：十来只（麻雀、斑鸠）几乎同时起飞，每只扑棱五到十下（小鸟扇得快，每秒十几下），越飞越远、越扇越轻——
 * 合起来是一阵「扑棱棱」。每一下是一小口滤过的噪声，算进一段双声道波形里。
 */
function flockBuffer(ctx: BaseAudioContext, birds: number): { buf: AudioBuffer; dur: number } {
  const sr = ctx.sampleRate, dur = 1.7, n = Math.floor(sr * dur), b = ctx.createBuffer(2, n, sr), L = b.getChannelData(0), R = b.getChannelData(1);
  for (let k = 0; k < birds; k++) {
    const big = Math.random() < 0.25, rate = big ? rand(7, 9) : rand(11, 16), pan = rand(-0.85, 0.85), gl = Math.sqrt(0.5 * (1 - pan)) * 1.3, gr = Math.sqrt(0.5 * (1 + pan)) * 1.3;
    const lpA = big ? 0.12 : 0.22, flaps = Math.round(rand(5, 10) * (big ? 0.7 : 1)), w = big ? 0.05 : 0.03;
    let t = Math.pow(Math.random(), 1.6) * 0.45;
    for (let i = 0; i < flaps; i++) {
      const g = (big ? 0.5 : 0.32) * Math.pow(0.84, i) * rand(0.7, 1.1), i0 = Math.floor(t * sr), len = Math.floor(sr * w);
      let lp = 0, lp2 = 0;
      for (let j = 0; j < len && i0 + j < n; j++) {
        const e = Math.pow(Math.sin((Math.PI * j) / len), 2), x = Math.random() * 2 - 1;
        lp += lpA * (x - lp); lp2 += 0.04 * (lp - lp2);
        const s = (lp - lp2) * e * g * 2.2;
        L[i0 + j] += s * gl; R[i0 + j] += s * gr;
      }
      t += (1 / rate) * rand(0.9, 1.12);
    }
  }
  return { buf: b, dur };
}

// ———————————————————————————— 寒鸦 ————————————————————————————
type Line = Array<[number, number]>;
/** 一声「哇——」：起得快，尾巴往下一哑 */
function caw(f0: Line, amp: Line, t: number, d: number, f: number, A: number) {
  f0.push([t, f * 0.9], [t + 0.035, f * 1.05], [t + d * 0.6, f], [t + d, f * 0.78]);
  amp.push([t, 0], [t + 0.02, A], [t + d * 0.7, A * 0.8], [t + d, 0]);
}
const CROW_F = [[1050, 3.5, 1], [1500, 5, -0.6], [2600, 6, 0.3]] as const;
function crowCalls(v: Voice, t: number, f: number, gain: number, bouts: number, span: number, dest: AudioNode) {
  const f0: Line = [], amp: Line = [];
  let x = 0;
  const starts = Array.from({ length: bouts }, () => rand(0, span)).sort((p, q) => p - q);
  for (const s of starts) {
    x = Math.max(x + 0.15, s);
    for (let i = 0, k = 1 + Math.floor(rand(0, 3)); i < k; i++) { const d = rand(0.18, 0.3); caw(f0, amp, x, d, f * rand(0.97, 1.03), rand(0.7, 1)); x += d + rand(0.18, 0.35); }
  }
  if (!f0.length) return 0;
  voiced(v, { t, f0, amp, formants: CROW_F, tilt: 4000, jitter: 30, breath: 0.35, rough: { rate: rand(60, 80), depth: 0.5 }, gain, dest });
  return x;
}

// ———————————————————————————— 雁 ————————————————————————————
/** 一只雁的一声（「嘎——昂」：前半低，嗓子一翻到高处），推进折线里 */
function honkInto(f0: Line, amp: Line, t: number, p: number, A: number): number {
  const d = rand(0.26, 0.4), br = d * rand(0.3, 0.42);
  f0.push([t, 330 * p], [t + br, 400 * p], [t + br + 0.012, 560 * p], [t + d * 0.7, 590 * p], [t + d, 500 * p]);
  amp.push([t, 0], [t + 0.03, 0.7 * A], [t + br, 0.6 * A], [t + br + 0.03, A], [t + d * 0.75, 0.8 * A], [t + d, 0]);
  return d;
}

type Fn = (v: Voice) => number;
export const ANIMAL_SHOTS: Pick<Record<Shot, Fn>, 'frog' | 'oriole' | 'magpie' | 'crow' | 'geese' | 'deer' | 'goat' | 'donkey' | 'bee' | 'wings' | 'fishJump' | 'purr' | 'peck' | 'squirrel' | 'frogPlop' | 'cackle' | 'sheep' | 'lamb' | 'crane' | 'munch' | 'dogWhine'> = {
  /** 一只蛙叫几声（「呱、呱呱」），远处另一只有时应它一串。夜里成片的那种用 setLoop('frog') */
  frog(v) {
    const p = v.pitch * rand(0.9, 1.12), a = 0.5 + 0.7 * v.vel, f1 = rand(650, 980) * p;
    const end = croakShot(v, v.t, { rate: rand(34, 52), f1, f2: f1 * rand(2.2, 2.9), amp: 0.17 * a }, 2 + Math.floor(rand(0, 3)));
    let tail = end;
    if (Math.random() < 0.4) {
      const g1 = rand(560, 900) * p, at = end * rand(0.3, 0.8);
      tail = Math.max(tail, at + croakShot(v, v.t + at, { rate: rand(32, 50), f1: g1, f2: g1 * rand(2.2, 2.9), amp: 0.07 * a, hi: 0.4 }, 2 + Math.floor(rand(0, 3)), rand(-0.6, 0.6)));
    }
    return tail + 0.3;
  },
  /**
   * 黄鹂：几个圆润的音，每个一百毫秒上下、里头一扬一落，其中一个打一下颤；音与音之间断开，不滑过去（做法见 song.ts）。
   * 头一版是一个振荡器从一个音滑到下一个、音与音之间不落到底——量下来九成八是纯音，像有人在吹口哨。
   * 世界里那一对黄鹂在石桥两头的柳树间，五到十几秒叫一回：隔得近（十二秒内）的那几回，三成半的时候不叫——鸟不是每回都应
   */
  oriole(v) {
    const last = ORIOLE.get(v.e) ?? -Infinity;
    if (v.raw.at && v.t - last < 12 && Math.random() < 0.35) return 0;
    ORIOLE.set(v.e, v.t);
    const c = v.ctx, a = 0.075 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.94, 1.07), g = c.createGain(), lp = c.createBiquadFilter();
    g.gain.value = a;
    lp.type = 'lowpass'; lp.frequency.value = 7000; lp.Q.value = 0.5;
    g.connect(lp); lp.connect(v.out);
    return playSong(c, g, v.t, orioleSong(p, 4 + Math.floor(rand(0, 3)))) + 0.35;
  },
  /** 喜鹊「喳喳喳」：一连串粗哑的短音（一秒七八下），每一下是很毛的一口气——嗓子里的音被抖得很碎，噪声多；一两阵 */
  magpie(v) {
    const a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.92, 1.08), f0: Line = [], amp: Line = [];
    let t = 0;
    for (let b = 0, bouts = Math.random() < 0.4 ? 2 : 1; b < bouts; b++) {
      const n = 4 + Math.floor(rand(0, 4)), gap = rand(0.11, 0.14), f = rand(780, 980) * p;
      for (let i = 0; i < n; i++) {
        const d = rand(0.055, 0.075), ff = f * (1 - 0.015 * i) * rand(0.97, 1.03), A = (i === 0 ? 0.8 : 1) * (1 - (0.25 * i) / n) * rand(0.85, 1);
        f0.push([t, ff * 1.06], [t + d * 0.3, ff], [t + d, ff * 0.9]);
        amp.push([t, 0], [t + 0.006, A], [t + d * 0.6, A * 0.7], [t + d, 0]);
        t += d + gap * rand(0.8, 1.15) - d * 0.3;
      }
      t += rand(0.35, 0.6);
    }
    // （沙哑收了一些：气声、嗓子里的毛都少一点，一串也短一点——太哑像乌鸦，一进门听着瘆人）
    voiced(v, { f0, amp, formants: [[1650, 3, 1], [2800, 4, -0.6], [4100, 5, 0.4]], tilt: 6000, jitter: 38, breath: 0.6, rough: { rate: rand(95, 125), depth: 0.5 }, gain: 0.15 * a });
    return t + 0.1;
  },
  /**
   * 寒鸦「哇——」：哑的两三声。variant: 'flock' 是黄昏一群归林——四五六只这里那里地叫，有远有近、有左有右，
   * 夹着几下扑翅（「枯藤老树昏鸦」的那种）。
   */
  crow(v) {
    const a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.92, 1.08);
    if (v.raw.variant === 'flock') {
      const c = v.ctx, span = rand(4, 6.5);
      let end = 0;
      for (let k = 0, n = 3 + Math.floor(rand(0, 3)); k < n; k++) {
        const far = rand(0, 0.7), pan = c.createStereoPanner(), lp = c.createBiquadFilter();
        pan.pan.value = rand(-0.85, 0.85);
        lp.type = 'lowpass'; lp.frequency.value = lerp(6000, 1800, far); lp.Q.value = 0.5;
        lp.connect(pan); pan.connect(v.out);
        end = Math.max(end, crowCalls(v, v.t, rand(520, 680) * p, 0.34 * a * lerp(1, 0.35, far), 1 + Math.floor(rand(0, 2.5)), span, lp));
      }
      if (Math.random() < 0.6) EXTRA_SHOTS.flap({ ...v, t: v.t + rand(0.3, span), vel: v.vel * 0.5 });
      return Math.max(end, span) + 0.4;
    }
    const f0: Line = [], amp: Line = [];
    let t = 0;
    for (let i = 0, k = 2 + Math.floor(rand(0, 3)); i < k; i++) { const d = rand(0.2, 0.3); caw(f0, amp, t, d, rand(560, 640) * p, i ? rand(0.75, 0.95) : 1); t += d + rand(0.22, 0.4); }
    voiced(v, { f0, amp, formants: CROW_F, tilt: 4000, jitter: 30, breath: 0.35, rough: { rate: rand(60, 80), depth: 0.5 }, gain: 0.38 * a });
    return t + 0.2;
  },
  /** 雁阵：三五只大雁一路叫着过（你一声我一声，一只高一些），从天的一边慢慢移到另一边。高而远：没说远近就按很远算 */
  geese(v) {
    const c = v.ctx, a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.95, 1.05), span = rand(5, 8), pan = c.createStereoPanner(), from = (Math.random() < 0.5 ? -1 : 1) * rand(0.4, 0.8);
    pan.pan.setValueAtTime(from, v.t);
    pan.pan.linearRampToValueAtTime(-from * rand(0.5, 1), v.t + span + 1);
    pan.connect(v.out);
    let end = 0;
    for (let k = 0, n = 3 + Math.floor(rand(0, 3)); k < n; k++) {
      const bp = p * (k % 2 ? 1.13 : 1) * rand(0.97, 1.03), f0: Line = [], amp: Line = [];
      let t = rand(0, 1.2);
      for (let i = 0, m = 2 + Math.floor(rand(0, 3)); i < m && t < span; i++) { t += honkInto(f0, amp, t, bp, rand(0.6, 1)) + rand(0.6, 2.2); }
      if (!f0.length) continue;
      voiced(v, { f0, amp, formants: [[1000, 4, 1], [1900, 5, -0.6], [2800, 6, 0.3]], tilt: 3000, jitter: 22, rough: { rate: 46, depth: 0.3 }, gain: 0.3 * a * rand(0.7, 1), dest: pan });
      end = Math.max(end, f0[f0.length - 1][0]);
    }
    return end + 0.5;
  },
  /** 呦呦鹿鸣：远山里一两声，短而亮，带一点鼻音——音高一扬就落下来。没说远近就按远处的算 */
  deer(v) {
    const a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.9, 1.1);
    let t = v.t;
    for (let i = 0, k = Math.random() < 0.7 ? 2 : 1; i < k; i++) {
      const d = rand(0.24, 0.34), f = rand(820, 980) * p * (i ? rand(0.96, 1.02) : 1);
      voiced(v, { t, f0: [[0, f * 0.9], [d * 0.25, f * 1.3], [d * 0.55, f * 1.18], [d, f * 0.72]], amp: [[0, 0], [0.03, 1], [d * 0.6, 0.75], [d, 0]], formants: [[1250, 4, 1], [2650, 6, -0.5], [3900, 7, 0.25]], tilt: 4200, jitter: 16, breath: 0.3, direct: 0.08, gain: 0.3 * a * (i ? 0.85 : 1) });
      t += d + rand(0.5, 0.85);
    }
    return t - v.t + 0.2;
  },
  /** 羊咩：「咩——」从闭着的嘴里张开（m 到 e），一颤一颤（每秒八九下，音高与响度一起抖），末了往下落。variant: 'kid' 小羊，高而短 */
  goat(v) {
    const kid = v.raw.variant === 'kid' || (v.raw.variant == null && Math.random() < 0.3), a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.93, 1.07);
    let t = v.t;
    for (let i = 0, k = Math.random() < 0.3 ? 2 : 1; i < k; i++) {
      const f = (kid ? rand(520, 600) : rand(330, 420)) * p, d = kid ? rand(0.45, 0.65) : rand(0.6, 0.9), vr = rand(7, 9.5);
      voiced(v, {
        t, f0: [[0, f * 0.9], [0.08, f], [d * 0.7, f * 0.97], [d, f * 0.82]], amp: [[0, 0], [0.05, 0.55], [0.14, 1], [d * 0.75, 0.85], [d, 0]],
        formants: [[[[0, 320], [0.1, 720], [d, 640]], 4, 1], [[[0, 1300], [0.1, 1800], [d, 1650]], 6, -0.6], [2700, 8, 0.25]],
        tilt: 4000, jitter: 14, breath: 0.3, vib: { rate: vr, depth: 55 }, rough: { rate: vr, depth: 0.72 }, gain: 0.17 * a * (i ? 0.8 : 1),
      });
      t += d + rand(0.35, 0.6);
    }
    return t - v.t + 0.2;
  },
  /**
   * 驴叫：先是鼻子里两下低低的「嗯、嗯」，接着「咿——啊、咿——啊」：吸气时一声高而尖、发毛的「咿」，呼气时一声低而响、带着粗的「啊」，
   * 一来一回三五趟，一趟比一趟没劲，末了一口长长的、哑下去的「啊——」。有点可笑，但是驴。
   */
  donkey(v) {
    const a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.92, 1.08), f0: Line = [], amp: Line = [], F1: Line = [], F2: Line = [];
    const seg = (t0: number, t1: number, f1: number, f2: number) => { F1.push([t0, f1], [t1, f1]); F2.push([t0, f2], [t1, f2]); };
    let t = 0;
    for (let i = 0; i < 2; i++) {
      const d = rand(0.1, 0.14);
      f0.push([t, 150 * p], [t + d, 118 * p]); amp.push([t, 0], [t + 0.02, 0.32], [t + d, 0]); seg(t, t + d, 480, 1100);
      t += d + rand(0.12, 0.2);
    }
    const cycles = 3 + Math.floor(rand(0, 3));
    for (let i = 0; i < cycles; i++) {
      const k = 1 - 0.13 * i, dh = rand(0.3, 0.42), last = i === cycles - 1, da = last ? rand(0.6, 0.8) : rand(0.4, 0.55);
      // 咿：吸气，高而尖
      f0.push([t, 600 * p], [t + 0.06, 860 * p * k], [t + dh * 0.7, 820 * p * k], [t + dh, 650 * p]);
      amp.push([t, 0], [t + 0.04, 0.55 * k], [t + dh * 0.8, 0.5 * k], [t + dh, 0.15 * k]);
      seg(t, t + dh, 420, 2200);
      hiss(v, { t: v.t + t, dur: dh, f: 2600, q: 1.2, hp: 1200, curve: wobble(10, 0.05 * a * k, 0.3, 0.2) });
      t += dh + 0.03;
      // 啊：呼气，低而响
      f0.push([t, 300 * p], [t + 0.05, 245 * p], [t + da * 0.6, 205 * p], [t + da, (last ? 130 : 150) * p]);
      amp.push([t, 0.6 * k], [t + 0.05, k], [t + da * 0.7, 0.85 * k], [t + da, 0]);
      seg(t, t + da, 850, 1250);
      t += da + (last ? 0 : 0.02);
    }
    hiss(v, { t: v.t + t - 0.4, dur: 0.6, noise: 'pink', f: 900, f2: 600, q: 0.8, curve: wobble(10, 0.06 * a, 0.3, 0.2) });
    voiced(v, { f0, amp, formants: [[F1, 4, 1], [F2, 6, -0.6], [2700, 7, 0.3]], tilt: 3500, jitter: 28, breath: 0.25, rough: { rate: 55, depth: 0.4 }, direct: 0.03, gain: 0.36 * a });
    return t + 0.5;
  },
  /** 一只蜂从身边飞过（dur，默认两秒上下）：翅膀每秒两百多下的嗡，飞近了略高、远了略低，忽左忽右。蜂箱边那一窝用 setLoop('bee') */
  bee(v) {
    const c = v.ctx, t = v.t, a = 0.07 * (0.5 + 0.7 * v.vel), d = clamp(v.dur ?? rand(1.6, 2.6), 0.8, 6), f = rand(215, 250) * v.pitch;
    const osc = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), pan = c.createStereoPanner(), side = Math.random() < 0.5 ? -1 : 1;
    osc.setPeriodicWave(v.e.wave('bee', BEE_H));
    osc.frequency.setValueAtTime(f * 1.025, t);
    osc.frequency.linearRampToValueAtTime(f * 1.03, t + d * 0.42);
    osc.frequency.linearRampToValueAtTime(f * 0.97, t + d);
    const w = v.e.ctrlSrc('mid', t, rand(0.8, 1.4), d + 0.1), wd = c.createGain();
    wd.gain.value = 30;
    w.connect(wd); wd.connect(osc.detune);
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(curveOf(24, [[0, 0], [0.42, 1], [0.55, 0.8], [1, 0]], a), t, d);
    pan.pan.setValueAtTime(0.7 * side, t);
    pan.pan.linearRampToValueAtTime(-0.6 * side, t + d);
    lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.5;
    osc.connect(lp); lp.connect(g); g.connect(pan); pan.connect(v.out);
    osc.start(t); osc.stop(t + d + 0.05);
    return d + 0.2;
  },
  /** 一群鸟惊飞：十来只几乎同时起飞，扑棱棱一阵，越飞越远；常有一两声惊叫 */
  wings(v) {
    const a = 0.5 + 0.7 * v.vel, { buf, dur } = flockBuffer(v.ctx, 9 + Math.floor(rand(0, 9))), s = v.ctx.createBufferSource(), g = v.ctx.createGain();
    g.gain.value = 0.32 * a;
    s.buffer = buf; s.connect(g); g.connect(v.out); s.start(v.t);
    if (Math.random() < 0.6) EXTRA_SHOTS.chirp({ ...v, t: v.t + rand(0.02, 0.2), vel: v.vel * 0.8 });
    return dur + 0.2;
  },
  /** 鱼跃：水面破开的一小声「哧」；落回去身子平拍在水面「啪」，一个低的泡「咚」，水珠落回来，水面荡一圈 */
  fishJump(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.9, 1.1), L = t + rand(0.35, 0.6);
    burst(v, { dur: 0.06, f: 3200, q: 0.8, amp: 0.08 * a, att: 0.004 });
    bubble(v, t, 900, 1700, 0.025, 0.04 * a);
    burst(v, { t: L, dur: 0.05, f: rand(1200, 1800), q: 0.7, amp: 0.4 * a, att: 0.0015, noise: 'pink' });
    burst(v, { t: L, dur: 0.03, f: 3800, q: 0.8, amp: 0.09 * a, att: 0.001 });
    bubble(v, L + 0.005, 240 * p, 560 * p, 0.08, 0.22 * a);
    bubble(v, L + rand(0.06, 0.1), 420 * p, 950 * p, 0.04, 0.08 * a);
    for (let i = 0, k = 3 + Math.floor(rand(0, 3)); i < k; i++) { const f = rand(900, 2200); bubble(v, L + rand(0.08, 0.45), f, f * 1.5, 0.02, 0.045 * a * rand(0.4, 1)); }
    burst(v, { t: L + 0.05, dur: 0.6, type: 'lowpass', f: 800, q: 0.7, amp: 0.07 * a, att: 0.15, noise: 'pink' });
    return L - t + 0.9;
  },
  /** 猫打呼噜（dur，默认三秒上下）：喉咙里每秒二十五下上下的颤，吸气、呼气都有（呼气响一些、低一点），两口气之间轻轻一断。很近才听得见 */
  purr(v) {
    const c = v.ctx, a = 0.5 + 0.7 * v.vel, d = clamp(v.dur ?? rand(2.6, 3.4), 1, 12), t = v.t;
    const osc = c.createOscillator(), hp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
    osc.type = 'sawtooth';
    hp.type = 'highpass'; hp.frequency.value = 120; hp.Q.value = 0.6;
    lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.7;
    osc.frequency.setValueAtTime(26, t);
    g.gain.setValueAtTime(0, t);
    let x = 0, inhale = Math.random() < 0.5;
    while (x < d - 0.4) {
      const bd = inhale ? rand(1.0, 1.3) : rand(1.2, 1.6), pk = (inhale ? 0.6 : 1) * 0.09 * a;
      g.gain.setTargetAtTime(pk, t + x, 0.08);
      g.gain.setTargetAtTime(pk * 0.12, t + x + bd - 0.14, 0.045);
      osc.frequency.setTargetAtTime(inhale ? rand(27, 29) : rand(23, 25.5), t + x, 0.1);
      x += bd; inhale = !inhale;
    }
    g.gain.setTargetAtTime(0, t + x, 0.06);
    const n = v.e.noiseSrc('pink', t, x + 0.5), nb = c.createBiquadFilter(), ng = c.createGain();
    nb.type = 'bandpass'; nb.frequency.value = 480; nb.Q.value = 0.8; ng.gain.value = 0.35;
    n.connect(nb); nb.connect(ng); ng.connect(g);
    osc.connect(hp); hp.connect(lp); lp.connect(g); g.connect(v.out);
    osc.start(t); osc.stop(t + x + 0.5);
    return x + 0.5;
  },
  /** 鸡啄食：喙点在地上「笃笃笃」——又轻又快，疏密不匀，偶尔连着两下；有时末了低低地「咕」一声 */
  peck(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t;
    let x = 0;
    for (let i = 0, n = 3 + Math.floor(rand(0, 5)); i < n; i++) {
      const at = t + x, A = 0.6 * a * rand(0.6, 1), ex = tap(v, at, 0.4, A, 0.5);
      reson(v, ex, rand(1500, 2100), 7, 0.9);
      reson(v, ex, rand(700, 900), 5, 0.6);
      burst(v, { t: at, dur: 0.02, type: 'lowpass', f: 500, q: 0.7, amp: 0.1 * a, att: 0.001, noise: 'pink' });
      x += Math.random() < 0.25 ? rand(0.035, 0.05) : rand(0.12, 0.3);
    }
    if (Math.random() < 0.35) cluck(v, t + x + 0.1, rand(0.85, 0.95) * v.pitch, 0.25 * a);
    return x + 0.5;
  },
  /** 松鼠：前头常有几下短促的「嘁、嘁」（像咂嘴），接着一串又急又尖的「吱吱吱」（一秒十几下，每下往下一滑）；有时爪子在树皮上一阵窸窣 */
  squirrel(v) {
    const c = v.ctx, k = 0.5 + 0.7 * v.vel, a = 0.075 * k, p = v.pitch * rand(0.92, 1.1), t = v.t;
    let x = 0;
    for (let i = 0, m = Math.random() < 0.6 ? 2 + Math.floor(rand(0, 3)) : 0; i < m; i++) { burst(v, { t: t + x, dur: 0.018, f: rand(2200, 3000), q: 2, amp: 0.2 * k, att: 0.001 }); x += rand(0.09, 0.14); }
    const osc = c.createOscillator(), g = c.createGain(), n = 7 + Math.floor(rand(0, 9)), per = 1 / rand(11, 15);
    osc.type = 'triangle';
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < n; i++) {
      const at = t + x + i * per, len = per * rand(0.35, 0.5), f = rand(5200, 6200) * p, A = a * Math.sin((Math.PI * (i + 0.7)) / (n + 0.4));
      osc.frequency.setValueAtTime(f, at);
      osc.frequency.exponentialRampToValueAtTime(f * 0.68, at + len);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(A, at + 0.004);
      g.gain.linearRampToValueAtTime(0, at + len);
    }
    osc.connect(g); g.connect(v.out);
    osc.start(t); osc.stop(t + x + n * per + 0.05);
    x += n * per;
    if (Math.random() < 0.4) sprinkle(v, { t: t + x + 0.1, dur: 0.35, n: 10, f: [1800, 5000], t60: [0.002, 0.005], amp: 0.05 * k, noise: 0.9 });
    return x + 0.55;
  },
  /** 青蛙一蹬，扑通下水：先是身子拍在水面的一小下「啪」，紧跟一个低的泡「咚」，几粒水珠落回来，水面一圈（plop 的 frog 是蛙自己滑下去，没有这一拍） */
  frogPlop(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.9, 1.1);
    burst(v, { dur: 0.025, f: rand(1600, 2600), q: 0.9, amp: 0.3 * a, att: 0.0015 });
    burst(v, { dur: 0.06, type: 'lowpass', f: 900, q: 0.7, amp: 0.3 * a, att: 0.002, noise: 'pink' });
    bubble(v, t + 0.008, 260 * p, 620 * p, 0.08, 0.3 * a);
    bubble(v, t + rand(0.07, 0.11), 480 * p, 1100 * p, 0.04, 0.11 * a);
    for (let i = 0; i < 3; i++) { const f = rand(900, 1800); bubble(v, t + rand(0.12, 0.4), f, f * 1.5, 0.025, 0.05 * a * rand(0.4, 1)); }
    burst(v, { t: t + 0.05, dur: 0.4, type: 'lowpass', f: 900, q: 0.7, amp: 0.08 * a, att: 0.1, noise: 'pink' });
    return 0.75;
  },
  /** 母鸡下了蛋之后那一串「咯咯咯咯——哒！」（就是 hen 的 egg；世界那边传不了 variant，所以另给一个名字） */
  cackle: (v) => VILLAGE_SHOTS.hen({ ...v, raw: { ...v.raw, variant: 'egg' } }),
  /**
   * 绵羊「咩——」：比山羊低（母羊 225–285Hz，山羊 330–420Hz），0.7–1.0 秒；一声里一抖一抖的（每秒六七下，音高与响度一齐颤，比山羊抖得浅些）——
   * 羊叫就靠这一抖；从闭着的嘴里张开成「咩」的 e（第二共振峰一千六七，比山羊略暗），带一点鼻音。一群里此起彼伏：四分之一的时候另一边还有一只应一声。
   * （先前是 175–245Hz、慢而匀的颤、口张成「啊」：在羊群边上听着像有人在呻吟，试玩的人说瘆人）
   */
  sheep(v) {
    const a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.93, 1.07);
    const bleat = (t: number, f: number, d: number, g: number, dest: AudioNode = v.out) => {
      const vr = rand(6.2, 7.4);
      voiced(v, {
        t, f0: [[0, f * 0.92], [0.08, f], [d * 0.55, f * 1.02], [d, f * 0.86]], amp: [[0, 0], [0.05, 0.55], [0.14, 1], [d * 0.7, 0.8], [d, 0]],
        formants: [[[[0, 320], [0.11, 600], [d, 560]], 4, 1], [[[0, 1250], [0.11, 1680], [d, 1600]], 6, -0.6], [2600, 8, 0.22]],
        tilt: 2900, jitter: 14, breath: 0.22, vib: { rate: vr, depth: 46 }, rough: { rate: vr, depth: 0.55 }, gain: 0.16 * a * g, dest,
      });
    };
    const d = rand(0.7, 1.0);
    bleat(v.t, rand(225, 285) * p, d, 1);
    let end = d;
    if (Math.random() < 0.25) {
      const pan = v.ctx.createStereoPanner(), lp = v.ctx.createBiquadFilter(), at = d * rand(0.5, 1.1), d2 = rand(0.6, 0.9);
      pan.pan.value = rand(-0.7, 0.7);
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.5;
      lp.connect(pan); pan.connect(v.out);
      bleat(v.t + at, rand(225, 300) * p, d2, 0.45, lp);
      end = Math.max(end, at + d2);
    }
    return end + 0.3;
  },
  /** 羊羔：细而高的一声「咩」（450–600Hz），短，起头往上一挑、末了往下一落，颤得快；四成的时候紧跟着再叫一声 */
  lamb(v) {
    const a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.94, 1.06);
    let t = v.t;
    for (let i = 0, k = Math.random() < 0.4 ? 2 : 1; i < k; i++) {
      const f = rand(450, 600) * p * (i ? rand(0.97, 1.05) : 1), d = rand(0.28, 0.42), vr = rand(7.5, 9.5);
      voiced(v, {
        t, f0: [[0, f * 0.95], [0.06, f * 1.08], [d * 0.6, f], [d, f * 0.85]], amp: [[0, 0], [0.04, 0.6], [0.09, 1], [d * 0.7, 0.75], [d, 0]],
        formants: [[[[0, 380], [0.08, 820], [d, 760]], 4, 1], [[[0, 1500], [0.08, 1950], [d, 1850]], 6, -0.55], [3000, 8, 0.25]],
        tilt: 3600, jitter: 16, breath: 0.32, vib: { rate: vr, depth: 40 }, rough: { rate: vr, depth: 0.4 }, gain: 0.15 * a * (i ? 0.8 : 1),
      });
      t += d + rand(0.2, 0.35);
    }
    return t - v.t + 0.2;
  },
  /**
   * 鹤唳：伊水上一对鹤，远远的两声，高亢清亮——鹤的气管长而盘曲，叫声像吹一管号：一个很亮的音（雄的 900–1000Hz，
   * 雌的高一些、紧跟着应），谐波很多，带一点号音的「嘟」。水面开阔、远山回过来：另有一道晚 0.3 秒、闷一些的回声。没说远近按远景算
   */
  crane(v) {
    const c = v.ctx, a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.97, 1.03);
    const echo = c.createGain(), dl = c.createDelay(1), fb = c.createGain(), lp = c.createBiquadFilter(), wet = c.createGain();
    echo.gain.value = 1; dl.delayTime.value = rand(0.28, 0.36); fb.gain.value = 0.12; wet.gain.value = 0.3;
    lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.5;
    echo.connect(v.out); echo.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(v.out);
    // 水面上散回来的那一片（比别的声音多送一些到野外的混响里，闷一点；远了也轻，只是比直达的那一路落得慢——越远越「湿」）
    const far = c.createBiquadFilter(), fs = c.createGain();
    far.type = 'lowpass'; far.frequency.value = 2500; far.Q.value = 0.5; fs.gain.value = 0.18 * (1 - 0.6 * v.e.scene.indoor) * (1 - 0.6 * v.dist);
    echo.connect(far); far.connect(fs); fs.connect(v.e.openIn);
    const call = (t: number, f: number, d: number, g: number) => voiced(v, {
      t, f0: [[0, f * 0.86], [0.05, f], [d * 0.7, f * 1.02], [d, f * 0.88]], amp: [[0, 0], [0.03, 0.8], [0.08, 1], [d * 0.75, 0.85], [d, 0]],
      formants: [[1150, 3, 1], [2300, 4, -0.4], [3400, 5, 0.25]], tilt: 5000, jitter: 12, breath: 0.12, rough: { rate: rand(60, 80), depth: 0.18 }, direct: 0.05, gain: 0.22 * a * g, dest: echo,
    });
    const male = rand(900, 1000) * p, female = male * rand(1.12, 1.2);
    const d1 = rand(0.38, 0.5), t2 = d1 * rand(0.55, 0.85), d2 = rand(0.32, 0.42);
    call(v.t, male, d1, 1);
    call(v.t + t2, female, d2, 0.85);
    // 送进混响的那一路不在引擎替这一声记着的节点里：响完自己断开
    v.e.after(v.t + t2 + d2 + 1.6, () => { try { fs.disconnect(); } catch { /* 已断 */ } });
    return t2 + d2 + 1.6;
  },
  /** 牛嚼草：一下一下（一秒一下多），草秆被槽牙铡断的脆响、下巴一合的闷声；添草时头一口先把草一扯「嘶啦」。近处、轻 */
  munch(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t;
    let x = 0;
    if (Math.random() < 0.5) { hiss(v, { dur: 0.2, noise: 'pink', f: 1400, f2: 900, q: 0.8, hp: 400, curve: wobble(8, 0.05 * a, 0.3, 0.25) }); x += 0.3; }
    for (let i = 0, n = 3 + Math.floor(rand(0, 3)); i < n; i++) {
      const at = t + x, g = a * rand(0.75, 1.05);
      burst(v, { t: at, dur: 0.07, f: rand(180, 260), q: 1, amp: 0.3 * g, att: 0.006, noise: 'pink' });
      sprinkle(v, { t: at + 0.01, dur: rand(0.08, 0.12), n: 10 + Math.floor(rand(0, 8)), f: [900, 3200], t60: [0.004, 0.01], amp: 0.06 * g, noise: 0.6, bright: 0.35 });
      x += rand(0.62, 0.8);
    }
    return x + 0.3;
  },
  /** 狗撒娇的哼唧（摸狗时）：闭着嘴、从鼻子里出来的两三声「嗯~嗯~」——音高往上一滑又落下来，细而软，带一点抽鼻子的气声。近、轻、短 */
  dogWhine(v) {
    const a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.9, 1.1), f0: Line = [], amp: Line = [];
    let x = 0;
    for (let i = 0, k = 2 + (Math.random() < 0.5 ? 1 : 0); i < k; i++) {
      const d = rand(0.22, 0.38), f = rand(650, 900) * p, up = rand(1.25, 1.45);
      f0.push([x, f], [x + d * 0.45, f * up], [x + d, f * rand(0.85, 0.95)]);
      amp.push([x, 0], [x + 0.03, i ? 0.8 : 1], [x + d * 0.6, 0.7], [x + d, 0]);
      x += d + rand(0.08, 0.18);
    }
    voiced(v, { f0, amp, formants: [[1150, 4, 1], [2300, 6, -0.3], [3300, 7, 0.12]], type: 'triangle', tilt: 2600, jitter: 18, breath: 0.15, gain: 0.2 * a });
    hiss(v, { t: v.t + x, dur: 0.12, noise: 'pink', f: 1400, q: 1.4, hp: 700, curve: wobble(8, 0.02 * a, 0.2, 0.3) });
    return x + 0.35;
  },
};

/** 层里要用的：一片蛙、一窝蜂（算一次，之后共用） */
export const chorusOf = (e: Engine) => e.cached('frog-chorus', () => frogChorus(e.ctx));
export const hiveOf = (e: Engine) => e.cached('bee-hive', () => hiveBuzz(e.ctx));
