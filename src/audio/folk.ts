/**
 * 人：打更的梆子与更锣、说书的醒木、远处几个人说话的嗡嗡、几个孩子笑闹、村人招呼时一声「嗯」。
 *
 *   梆子 ＝ 一段掏空的硬木，竹棍敲在口上：空腔一个清楚的音（700–820Hz）加木头两个高一些的分音、敲击的一点「嗒」；敲几下看是第几更；
 *   更锣 ＝ 小铜锣：几个不成整数倍的分音，头上音高略往上一挑（小锣的样子），两三秒才散；
 *   醒木 ＝ 硬木拍在案上：接触极短所以亮，案板低低一「咚」；
 *   说话 ＝ 几个「嗓子」你一句我一句：每个字一起一落，句子从高往低走，元音的共振峰一个字一换——整个过一道低通（隔得远，字头的高处都没了），
 *          只听得出有人在说话、有起有落，听不出字。不要假装说出什么来；
 *   「嗯」 ＝ 闭着嘴的一声哼：声带的一个音只从鼻子出来——低处一个很强的共鸣，高处很弱。
 * 远近照旧由引擎管（给 at 或 dist）。梆子、更锣没说远近时按远处传来的算。
 */
import type { Voice } from './engine';
import { giggle } from './extra';
import { burst, glide, hiss, reson, tap, voiced, wobble } from './kit';
import type { Shot } from './types';
import { clamp, pick, rand } from './util';

/** 此刻是第几更：一更戌时（19–21 点）、二更亥时、三更子时、四更丑时、五更寅时（3–5 点）；不在夜里给 2 */
export const watchOf = (h: number) => (h >= 19 && h < 21 ? 1 : h >= 21 && h < 23 ? 2 : h >= 23 || h < 1 ? 3 : h < 3 ? 4 : h < 5 ? 5 : 2);

/** 大人说话时几个元音的共振峰（F1 F2 F3）：男、女 */
const ADULT: Record<'m' | 'f', Array<[number, number, number]>> = {
  m: [[760, 1180, 2500], [540, 880, 2500], [500, 1150, 2500], [300, 2200, 2900], [340, 720, 2400], [520, 1800, 2500]],
  f: [[950, 1500, 2900], [650, 1050, 2900], [600, 1450, 2950], [360, 2700, 3300], [420, 880, 2800], [620, 2200, 3000]],
};
type Line = Array<[number, number]>;
/**
 * 一个人说一段话（t 起，相对 v.t 的秒数 x0）：syl 个字，每秒五六个，三五个字一顿；音高从高往低走（一句话的「下倾」），
 * 每个字带一点声调似的扬或落；元音的共振峰一个字一换。返回这一段话收住的时刻（相对 v.t）。
 */
function utter(v: Voice, x0: number, o: { f0: number; sex: 'm' | 'f'; syl: number; gain: number; dest: AudioNode }): number {
  const f0: Line = [], amp: Line = [], F1: Line = [], F2: Line = [], F3: Line = [];
  let x = 0;
  for (let i = 0; i < o.syl; i++) {
    const d = rand(0.12, 0.24), decl = 1.14 - 0.3 * (i / Math.max(1, o.syl - 1)), f = o.f0 * decl * rand(0.95, 1.05), tone = pick([1.12, 0.9, 1, 1.06, 0.86]);
    const [a1, a2, a3] = pick(ADULT[o.sex]), A = rand(0.65, 1) * (i === o.syl - 1 ? 0.75 : 1);
    f0.push([x, f], [x + d * 0.8, f * tone], [x + d, f * tone * 0.98]);
    amp.push([x, 0.05], [x + 0.025, A], [x + d * 0.65, A * 0.75], [x + d, 0.06]);
    F1.push([x, a1 * 0.8], [x + d * 0.3, a1], [x + d, a1 * 0.9]); F2.push([x, a2 * 0.9], [x + d * 0.3, a2], [x + d, a2]); F3.push([x, a3], [x + d, a3]);
    x += d + (i % 4 === 3 && i < o.syl - 1 ? rand(0.12, 0.3) : rand(0.01, 0.05));
  }
  amp.push([x, 0]);
  voiced(v, { t: v.t + x0, f0, amp, formants: [[F1, 5, 1], [F2, 7, -0.6], [F3, 9, 0.25]], tilt: 2200, jitter: 24, breath: 0.12, direct: 0.04, gain: o.gain, dest: o.dest });
  return x0 + x;
}
/**
 * 远处几个人说话（d 秒）：两三个人你一句我一句，偶尔两人的话叠在一起，偶尔有人笑一声。层里（setLoop('murmur')）与一击共用。
 * 返回这一阵说到几时（相对 v.t）。
 */
export function chatter(v: Voice, d: number, a: number, dest: AudioNode, voices = 2 + Math.floor(rand(0, 2))): number {
  const c = v.ctx, people = Array.from({ length: voices }, (_, i) => {
    const sex: 'm' | 'f' = i === 0 ? 'm' : Math.random() < 0.5 ? 'f' : 'm', pan = c.createStereoPanner();
    pan.pan.value = rand(-0.5, 0.5);
    pan.connect(dest);
    return { sex, f0: sex === 'm' ? rand(100, 135) : rand(190, 235), pan };
  });
  let x = rand(0, 0.3), who = 0, end = 0;
  while (x < d - 0.4) {
    const p = people[who], len = utter(v, x, { f0: p.f0, sex: p.sex, syl: 5 + Math.floor(rand(0, 8)), gain: 0.22 * a * rand(0.75, 1), dest: p.pan }) - x;
    end = Math.max(end, x + len);
    if (Math.random() < 0.18 && voices > 1) giggle(v, v.t + x + len * rand(0.4, 0.9), people[(who + 1) % voices].sex === 'f' ? 0.75 : 0.5, 0.35 * a, people[(who + 1) % voices].pan);
    // 下一个人接话：多半等这一句说完、隔一小会儿，偶尔抢着说（叠上一点）
    x += len * (Math.random() < 0.2 ? rand(0.7, 0.9) : 1) + rand(0.15, 0.7);
    who = Math.random() < 0.75 ? (who + 1) % voices : who;
  }
  return end;
}

type Fn = (v: Voice) => number;
export const FOLK_SHOTS: Pick<Record<Shot, Fn>, 'clapper' | 'gong' | 'wood' | 'murmur' | 'kidsLaugh' | 'greet' | 'whip'> = {
  /**
   * 放羊的甩一鞭：鞭梢抡过去的一口「呼」，末了「啪」地一响——鞭梢甩得比声音还快，那一响极短极脆（不到一毫秒的一下），
   * 河滩上远远地传开，北山脚回过来一点。不是打羊，是吆喝
   */
  whip(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.18, 0.26), c = t + d;
    hiss(v, { dur: d, noise: 'pink', f: 500, fMid: 1200, f2: 1900, q: 0.9, hp: 250, curve: wobble(8, 0.05 * a, 0.8, 0.05) });
    // 那一响的力气大都在两三千赫兹（耳边听着「啪」，不是「吱」）；极高处只留一点
    burst(v, { t: c, dur: 0.008, f: 2600, q: 0.6, amp: 0.7 * a, att: 0.0003 });
    burst(v, { t: c, dur: 0.004, type: 'highpass', f: 5000, q: 0.7, amp: 0.15 * a, att: 0.0002 });
    burst(v, { t: c + 0.001, dur: 0.03, f: 900, q: 0.9, amp: 0.15 * a, att: 0.001, noise: 'pink' });
    return d + 0.5;
  },
  /** 打更的梆子：远处传来「梆——梆、梆」，头一下后歇得长些；敲几下看此刻是第几更（n 可另给，1–6）。没说远近就按远处的算 */
  clapper(v) {
    const a = 0.5 + 0.7 * v.vel, n = clamp(Math.round(v.raw.n ?? watchOf(v.e.scene.hour)), 1, 6), p = v.pitch * rand(0.96, 1.04), f = rand(700, 820) * p;
    let t = v.t;
    for (let i = 0; i < n; i++) {
      const ex = tap(v, t, 0.9, 1.3 * a * (i === n - 1 ? 1 : 0.9) * rand(0.9, 1.05), 0.25);
      reson(v, ex, f, 26, 1.4);
      reson(v, ex, f * 2.27, 22, 0.5);
      reson(v, ex, f * 3.9, 18, 0.22);
      reson(v, ex, 2600, 5, 0.25);
      t += i === 0 && n > 1 ? rand(0.75, 0.9) : rand(0.5, 0.6);
    }
    return t - v.t + 0.5;
  },
  /** 更锣：「镗——」小铜锣，几个不成整数倍的分音，头上音高略往上一挑，两三秒才散；n 敲几下（默认一下）。没说远近就按远处的算 */
  gong(v) {
    const a = 0.5 + 0.7 * v.vel, n = clamp(Math.round(v.raw.n ?? 1), 1, 6), p = v.pitch * rand(0.97, 1.03), f0 = rand(330, 380) * p;
    let t = v.t;
    for (let i = 0; i < n; i++) {
      const k = 0.06 * a * rand(0.9, 1.05);
      ([[1, 1, 2.6], [1.48, 0.6, 2], [1.98, 0.5, 1.6], [2.64, 0.35, 1.1], [3.32, 0.22, 0.8], [4.1, 0.12, 0.5]] as const).forEach(([r, amp, t60], j) => {
        const f = f0 * r * (1 + 0.004 * j);
        glide(v, f * 0.982, f, 0.25, k * amp, t60, 0.003, v.out, t);
      });
      burst(v, { t, dur: 0.03, type: 'lowpass', f: 900, q: 0.7, amp: 0.25 * a, att: 0.001, noise: 'pink' });
      t += rand(1.1, 1.5);
    }
    return t - v.t + 2.6;
  },
  /** 说书的醒木一拍：硬木拍在案上，短而脆的一「啪」（接触极短，所以亮），案板低低地一「咚」 */
  wood(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.96, 1.04), ex = tap(v, t, 0.5, 2.4 * a, 0.35);
    reson(v, ex, rand(1500, 1800) * p, 9, 0.9);
    reson(v, ex, rand(2900, 3400) * p, 10, 0.45);
    reson(v, ex, rand(160, 200), 5, 1.6);
    reson(v, ex, rand(480, 560), 7, 0.8);
    burst(v, { dur: 0.012, f: 4000, q: 0.8, amp: 0.3 * a, att: 0.0005 });
    return 0.5;
  },
  /** 远处几个人说话（dur，默认四秒上下）：嗡嗡的，听得出你一句我一句、有起有落，听不出字。一直有人说着用 setLoop('murmur') */
  murmur(v) {
    const a = 0.5 + 0.7 * v.vel, d = clamp(v.dur ?? rand(3.5, 5), 1.5, 12), lp = v.ctx.createBiquadFilter();
    // 隔着一段：高处被吃掉（走近了引擎还会按远近再去一层高）
    lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.5;
    lp.connect(v.out);
    return chatter(v, d, a, lp) + 0.4;
  },
  /** 几个孩子笑闹：两三串笑一先一后（音高各不相同），中间常有一声尖尖的「呀」（laugh 是一个孩子的一串笑） */
  kidsLaugh(v) {
    const a = 0.5 + 0.7 * v.vel, c = v.ctx;
    let end = v.t;
    for (let i = 0, n = 2 + (Math.random() < 0.5 ? 1 : 0); i < n; i++) {
      const pan = c.createStereoPanner();
      pan.pan.value = rand(-0.4, 0.4);
      pan.connect(v.out);
      end = Math.max(end, giggle(v, v.t + (i ? rand(0.18, 0.7) : 0), v.pitch * rand(0.9, 1.2), a * rand(0.7, 1), pan));
    }
    if (Math.random() < 0.6) {
      const t = v.t + rand(0.3, 0.9), f = rand(680, 760) * v.pitch, d = rand(0.18, 0.24);
      voiced(v, { t, f0: [[0, f], [d * 0.4, f * 1.45], [d, f * 1.2]], amp: [[0, 0], [0.02, 1], [d * 0.7, 0.7], [d, 0]], formants: [[1050, 4, 1], [1900, 6, -0.5], [3400, 8, 0.25]], tilt: 3500, jitter: 20, breath: 0.35, gain: 0.22 * a });
      end = Math.max(end, t + d);
    }
    return end - v.t + 0.25;
  },
  /**
   * 村人应一声「嗯」：闭着嘴的一声哼（鼻音）——平平地起，末了往下一落（应承的口气），有时是两声「嗯嗯」。不是说话，只是一声哼。
   * variant: 'man' / 'woman'（不给就随便哪一个）
   */
  greet(v) {
    const woman = v.raw.variant === 'woman' || (v.raw.variant !== 'man' && Math.random() < 0.4), f = (woman ? rand(195, 235) : rand(105, 135)) * v.pitch, a = 0.5 + 0.7 * v.vel;
    const two = Math.random() < 0.3, d = rand(0.28, 0.42);
    voiced(v, {
      f0: two ? [[0, f * 1.02], [0.12, f * 1.06], [0.16, f * 0.98], [0.2, f * 1.04], [0.2 + d * 0.6, f * 1.02], [0.2 + d, f * 0.86]] : [[0, f * 0.98], [d * 0.25, f * 1.04], [d * 0.6, f], [d, f * 0.84]],
      amp: two ? [[0, 0], [0.03, 0.8], [0.12, 0.7], [0.15, 0.25], [0.19, 0.9], [0.19 + d * 0.7, 0.7], [0.2 + d, 0]] : [[0, 0], [0.04, 1], [d * 0.65, 0.8], [d, 0]],
      formants: [[woman ? 300 : 250, 3, 1], [woman ? 1250 : 1050, 6, 0.12], [woman ? 2600 : 2300, 8, 0.06]], tilt: woman ? 850 : 600, jitter: 10, breath: 0.03, direct: 0.08, gain: 0.19 * a,
    });
    return d + (two ? 0.2 : 0) + 0.25;
  },
};
