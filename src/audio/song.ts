/**
 * 鸟叫怎么合成（鸟那一层、燕、世界里的黄鹂、啾、麻雀吵嘴、布谷共用）。
 *
 * 头一版每只鸟是一个正弦（或三角波）振荡器，按折线一路唱下去：量下来鸟声里七成的力气是纯音，树莺一拖零点七秒，
 * 黄鹂在音与音之间滑过去，「一句」是高高低低乱取的几个音——真的小鸟不这样叫，听着像口哨、像电子的「嘀」，
 * 在桃林那样静的地方尤其瘆人。这一版照小鸟真的发声来：
 *   一声是几个很短的「音素」（二三十到一百多毫秒），音素之间有空隙，不连着滑；
 *   每个音素里音高走得很快——往下一扫、往上一挑、先扬后抑，有的带一点快颤（「婉转」靠它，不靠慢慢地滑）；
 *   鸣管发出来的不是纯音：带二、三次谐波，一点气声；斑鸠、布谷的「咕」是闷的、带气的，嗓子里还有一点抖；
 *   远处的鸟隔着枝叶传过来，忽强忽弱（加一点很快的起伏），高处被吃掉。
 * 整声算进一段波形里放：一个声源节点，不再是振荡器加调制加包络一串。
 */
import { rand } from './util';

const TAU = Math.PI * 2;

/** 一个音素 */
export interface El {
  /** 从这一声开头算起第几秒、多长 */
  at: number; len: number;
  /** 起、止的频率（Hz）；给了 mid 就是先到 mid（在 midAt 处，默认 0.4）再到 f1 */
  f0: number; f1: number; mid?: number; midAt?: number;
  amp: number;
  /** 二、三次谐波（相对基音的幅度） */
  h2?: number; h3?: number;
  /** 音高上的快颤：[每秒几下, 上下几成] */
  fm?: readonly [number, number];
  /** 响度上的快颤（嗓子里的抖）：[每秒几下, 深几成] */
  am?: readonly [number, number];
  /** 气声：一路跟着音高走的窄带噪声，按均方根算是基音的几成（0.1 只是一点「沙」，0.4 是斑鸠那样闷而带气） */
  breath?: number;
  /** 起音（秒，默认 4 毫秒）；收音从这个音素的几成处开始（默认 0.6） */
  att?: number; fall?: number;
}

/** 把几个音素算成一段单声道的波形。fade：远处的忽强忽弱有多深（0…0.5） */
export function songBuffer(ctx: BaseAudioContext, els: readonly El[], o: { fade?: number } = {}): AudioBuffer {
  const sr = ctx.sampleRate;
  let end = 0;
  for (const e of els) end = Math.max(end, e.at + e.len);
  const n = Math.max(16, Math.ceil((end + 0.02) * sr)), buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
  for (const e of els) {
    const i0 = Math.floor(e.at * sr), m = Math.max(8, Math.floor(e.len * sr));
    const att = Math.max(0.0015, Math.min(e.att ?? 0.004, e.len * 0.35)), fall = e.fall ?? 0.6;
    const h2 = e.h2 ?? 0, h3 = e.h3 ?? 0, br = e.breath ?? 0, mid = e.mid, ma = e.midAt ?? 0.4;
    const norm = e.amp / (1 + h2 + h3), fm = e.fm, am = e.am;
    const pf = rand(0, TAU), pa = rand(0, TAU), p2 = rand(0, TAU), p3 = rand(0, TAU);
    let ph = rand(0, TAU), lo = 0, bp = 0;
    for (let j = 0; j < m && i0 + j < n; j++) {
      const u = j / m, t = j / sr;
      let f = mid ? (u < ma ? e.f0 * Math.pow(mid / e.f0, u / ma) : mid * Math.pow(e.f1 / mid, (u - ma) / (1 - ma))) : e.f0 * Math.pow(e.f1 / e.f0, u);
      if (fm) f *= 1 + fm[1] * Math.sin(TAU * fm[0] * t + pf);
      ph += (TAU * f) / sr;
      const r = t < att ? Math.sin((Math.PI / 2) * (t / att)) : 1, q = u > fall ? Math.cos((Math.PI / 2) * ((u - fall) / (1 - fall))) : 1;
      let env = r * r * q * q * (1 - 0.15 * u);
      if (am) env *= 1 - am[1] * (0.5 + 0.5 * Math.sin(TAU * am[0] * t + pa));
      let s = Math.sin(ph) + h2 * Math.sin(2 * ph + p2) + h3 * Math.sin(3 * ph + p3);
      if (br > 0) {
        // 跟着音高走的一路窄带噪声（状态变量滤波器，Q 约 2）：气从鸣管里擦过去的那一点「沙」。
        // 窄带噪声本身的均方根约是 √(2.09·f / sr)（白噪声 ±1 过这道带通），除掉它，br 就是「噪声的均方根是基音的几成」
        const fc = Math.min(0.16 * sr, f), g = 2 * Math.sin((Math.PI * fc) / sr);
        lo += g * bp;
        bp += g * (Math.random() * 2 - 1 - lo - 0.5 * bp);
        s += (br * 0.707 * bp) / Math.sqrt((2.09 * fc) / sr);
      }
      d[i0 + j] += norm * env * s;
    }
  }
  const fd = o.fade ?? 0;
  if (fd > 0.005) {
    // 隔着枝叶：两三个快慢不一的起伏叠在一起（每秒五到十几下），远的深一些
    const r1 = rand(4.5, 8), r2 = rand(10, 17), q1 = rand(0, TAU), q2 = rand(0, TAU);
    for (let i = 0; i < n; i++) { const t = i / sr; d[i] *= 1 - fd * (0.5 + 0.28 * Math.sin(TAU * r1 * t + q1) + 0.22 * Math.sin(TAU * r2 * t + q2)); }
  }
  return buf;
}

/** 放一段算好的鸟叫：接到 dest，t 起。返回这一声多长（秒） */
export function playSong(ctx: BaseAudioContext, dest: AudioNode, t: number, els: readonly El[], o: { fade?: number } = {}): number {
  const b = songBuffer(ctx, els, o), s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(dest);
  s.start(t);
  return b.duration;
}

// ———————————————————————————— 几种叫法 ————————————————————————————
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
/** 一个音素里音高怎么走：往下扫、往上挑、先扬后抑 */
function shaped(at: number, len: number, f0: number, how: 'down' | 'up' | 'arch', amp: number, k: number, more: Partial<El> = {}): El {
  if (how === 'down') return { at, len, f0, f1: f0 * (1 - k), amp, ...more };
  if (how === 'up') return { at, len, f0, f1: f0 * (1 + k), amp, ...more };
  return { at, len, f0, mid: f0 * (1 + k), midAt: rand(0.3, 0.45), f1: f0 * (1 - 0.45 * k), amp, ...more };
}

/** 麻雀的一声「叽」：短，先扬后抑，带毛（谐波多、音高上一点很快的抖） */
export function chip(at: number, p: number, amp: number): El {
  return { at, len: rand(0.045, 0.075), f0: rand(2900, 3200) * p, mid: rand(4100, 4700) * p, midAt: rand(0.25, 0.38), f1: rand(2800, 3300) * p, amp, h2: 0.38, h3: 0.14, fm: [rand(160, 240), 0.03], breath: 0.18, att: 0.003, fall: 0.5 };
}
/** 麻雀：一到三声「叽、叽喳」 */
function sparrowSong(p: number): El[] {
  const out: El[] = [];
  let at = 0;
  for (let i = 0, n = 1 + Math.floor(rand(0, 3)); i < n; i++) { const e = chip(at, p * rand(0.96, 1.05), rand(0.65, 1)); out.push(e); at += e.len + rand(0.07, 0.14); }
  return out;
}
/** 白头鹎一类：一句三到五个音，音音之间有空，每个音里一扫一挑，有的打一点颤——活泼，不是乱取的「嘀」 */
function bulbulSong(p: number): El[] {
  const out: El[] = [], base = rand(1800, 2400) * p;
  let at = 0;
  for (let i = 0, n = 3 + Math.floor(rand(0, 3)); i < n; i++) {
    const len = rand(0.07, 0.14), how = pick(['down', 'up', 'arch', 'arch'] as const);
    out.push(shaped(at, len, base * pick([0.9, 1, 1.12, 1.25]) * rand(0.97, 1.03), how, rand(0.65, 1), rand(0.14, 0.26), { h2: 0.4, h3: 0.14, breath: 0.1, fm: Math.random() < 0.4 ? [rand(28, 45), rand(0.018, 0.03)] : undefined }));
    at += len + rand(0.035, 0.075);
  }
  return out;
}
/** 山雀：「吱嘿、吱嘿」——高的一下往下一扫，低的一下略一挑，两三回 */
function titSong(p: number): El[] {
  const out: El[] = [], hi = rand(4900, 5400) * p, lo = hi * rand(0.6, 0.66), per = rand(0.27, 0.34);
  for (let i = 0, n = 2 + Math.floor(rand(0, 3)); i < n; i++) {
    out.push({ at: i * per, len: rand(0.055, 0.07), f0: hi, f1: hi * 0.82, amp: 0.9, h2: 0.3, h3: 0.1, breath: 0.08 });
    out.push({ at: i * per + 0.13, len: rand(0.07, 0.085), f0: lo, mid: lo * 1.07, midAt: 0.5, f1: lo * 0.95, amp: 0.8, h2: 0.32, h3: 0.1, breath: 0.08 });
  }
  return out;
}
/** 绣眼一类：一串细碎的「啾啾」——高而轻，一个个很短，疏密不匀，中间响两头轻 */
function whiteEyeSong(p: number): El[] {
  const out: El[] = [], c = rand(4300, 5200) * p, n = 7 + Math.floor(rand(0, 7));
  let at = 0;
  for (let i = 0; i < n; i++) {
    const len = rand(0.025, 0.05), r = Math.random(), how = r < 0.6 ? 'down' : r < 0.85 ? 'arch' : 'up';
    out.push(shaped(at, len, c * rand(0.86, 1.18), how, (0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / n)) * rand(0.6, 1), rand(0.12, 0.25), { h2: 0.22, breath: 0.08, att: 0.003 }));
    at += len + rand(0.025, 0.07);
  }
  return out;
}
/** 黄鹂：几个圆润的音，每个短（一百毫秒上下）、里头一扬一落，其中一个打一下颤；音与音之间断开，不滑过去 */
export function orioleSong(p: number, n = 3 + Math.floor(rand(0, 2))): El[] {
  const out: El[] = [];
  let at = 0, f = rand(1500, 1900) * p;
  const warble = Math.floor(rand(0, n));
  for (let i = 0; i < n; i++) {
    const len = rand(0.08, 0.13), r = Math.random(), how = r < 0.5 ? 'arch' : r < 0.8 ? 'down' : 'up';
    out.push(shaped(at, len, f, how, rand(0.7, 1), rand(0.08, 0.16), { h2: 0.3, h3: 0.12, breath: 0.1, att: 0.006, fm: i === warble ? [rand(22, 30), 0.03] : undefined }));
    at += len + rand(0.03, 0.06);
    f = Math.min(2500 * p, Math.max(1300 * p, f * pick([1.19, 1.26, 0.84, 0.8, 1.12, 0.89])));
  }
  return out;
}
/**
 * 斑鸠：「咕咕——咕」，低，闷，带一点气（不是吹出来的纯音）。嗓子里的抖只留一点：抖得深了、气多了，远远隔着回声像夜里的鸮，
 * 试玩的人觉得瘆人
 */
function doveSong(p: number): El[] {
  const m = { h2: 0.32, h3: 0.16, breath: 0.24, am: [rand(24, 32), 0.12] as const, att: 0.03, fall: 0.55 };
  return [
    { at: 0, len: 0.18, f0: 468 * p, f1: 480 * p, amp: 0.8, ...m },
    { at: 0.28, len: 0.3, f0: 498 * p, mid: 520 * p, midAt: 0.35, f1: 476 * p, amp: 1, ...m },
    { at: 0.72, len: 0.2, f0: 452 * p, f1: 430 * p, amp: 0.7, ...m },
  ];
}
/** 布谷：两个音，下行小三度；软起，带一点气（真的布谷也是圆的，所以只在远处、很少） */
export function cuckooSong(p: number): El[] {
  const m = { h2: 0.22, h3: 0.1, breath: 0.36, am: [rand(18, 26), 0.12] as const, att: 0.025, fall: 0.5 };
  return [{ at: 0, len: 0.16, f0: 642 * p, f1: 630 * p, amp: 1, ...m }, { at: 0.3, len: 0.2, f0: 512 * p, f1: 498 * p, amp: 0.9, ...m }];
}
/** 一串颤音：每秒十三到十八个往下扫的小音，中间响两头轻 */
function trillSong(p: number): El[] {
  const out: El[] = [], n = 10 + Math.floor(rand(0, 7)), per = 1 / rand(13, 18);
  for (let i = 0; i < n; i++) out.push({ at: i * per, len: per * 0.55, f0: 4800 * p, f1: 3700 * p, amp: 0.3 + 0.7 * Math.pow(Math.sin((Math.PI * (i + 0.5)) / n), 0.6), h2: 0.25, h3: 0.05, breath: 0.08, att: 0.003, fall: 0.45 });
  return out;
}
/** 燕子掠过：一串又细又急的呢喃（短音、快扫），三成半的时候末尾带一串更密的「唧唧唧」 */
export function swallowSong(p: number): El[] {
  const out: El[] = [];
  let at = 0;
  for (let i = 0, n = 6 + Math.floor(rand(0, 9)); i < n; i++) {
    const len = rand(0.03, 0.06);
    out.push(shaped(at, len, rand(3200, 5400) * p, pick(['down', 'arch', 'up'] as const), rand(0.4, 1), rand(0.12, 0.3), { h2: 0.2, breath: 0.1, att: 0.003 }));
    at += len + rand(0.02, 0.07) + (Math.random() < 0.15 ? rand(0.08, 0.2) : 0);
  }
  if (Math.random() < 0.35) { const per = 1 / rand(40, 55); for (let i = 0, n = 8 + Math.floor(rand(0, 7)); i < n; i++) out.push({ at: at + i * per, len: per * 0.55, f0: 4700 * p, f1: 4200 * p, amp: 0.55, h2: 0.2, att: 0.002, fall: 0.4 }); }
  return out;
}

export type BirdKind = 'sparrow' | 'bulbul' | 'tit' | 'whiteeye' | 'oriole' | 'dove' | 'cuckoo' | 'trill';
export interface Species {
  /** 叫完一次歇多久（秒） */
  rest: readonly [number, number];
  /** 响度（相对的） */
  level: number;
  /** 多远：0 跟前 … 1 快听不见；大多是远的 */
  far: readonly [number, number];
  pitch: readonly [number, number];
  /** 每回都重新编（麻雀）；否则每只鸟只编一次，之后都唱自己那一句 */
  fresh?: boolean;
  motif(p: number): El[];
}
export const SPECIES: Record<BirdKind, Species> = {
  sparrow: { rest: [3, 8], level: 0.8, far: [0.25, 0.75], pitch: [0.92, 1.1], fresh: true, motif: sparrowSong },
  bulbul: { rest: [7, 15], level: 1, far: [0.35, 0.85], pitch: [0.9, 1.12], motif: bulbulSong },
  tit: { rest: [6, 12], level: 0.85, far: [0.35, 0.85], pitch: [0.92, 1.08], motif: titSong },
  whiteeye: { rest: [6, 13], level: 0.75, far: [0.35, 0.9], pitch: [0.92, 1.1], motif: whiteEyeSong },
  oriole: { rest: [9, 18], level: 1, far: [0.45, 0.92], pitch: [0.92, 1.08], motif: (p) => orioleSong(p) },
  dove: { rest: [16, 32], level: 0.85, far: [0.6, 0.95], pitch: [0.95, 1.06], motif: doveSong },
  cuckoo: { rest: [14, 34], level: 1.1, far: [0.75, 1], pitch: [0.96, 1.04], motif: cuckooSong },
  trill: { rest: [8, 16], level: 0.75, far: [0.4, 0.9], pitch: [0.9, 1.1], motif: trillSong },
};
