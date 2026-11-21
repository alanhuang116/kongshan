/**
 * 农事：割麦、捆麦、连枷打场、扬场、推磨、撒种、锄地翻土、摘果、倒粮、辘轳绞绳。
 * （浇水是 study.ts 的 water，打水的桶是 village.ts 的 bucket。）
 *
 * 都按那件事怎么发声来搭：
 *   镰刀 ＝ 刃过麦秆的一口快「唰」＋ 一把麦秆一根根断开的十几下脆响（算进一段波形里）＋ 麦秆倒进手里的窸窣；
 *   草绳 ＝ 许多根草茎互相挤、蹭——有颗粒的「嘁——嚓」；
 *   连枷 ＝ 拍子在头顶抡一圈的风 ＋ 几根竹片编的拍子落在谷穗上前后差几毫秒的「啪」＋ 场地的闷应 ＋ 溅开的谷粒；
 *   扬场 ＝ 木锨铲粮的沙、一扬的风、粮食落回场上先密后疏的「沙沙」、糠被风带走的一片轻「沙——」；
 *   石磨 ＝ 两扇磨盘相磨的低低的隆隆（磨盘不正，推到一处压得紧，一圈里一涨一落）＋ 谷物碾碎的沙沙 ＋ 磨杠偶尔吱一声；
 *   辘轳 ＝ 木轴在轴架里一转半圈吱呀一声 ＋ 井绳绕上去的涩涩的摩擦 ＋ 摇把一顿。
 * 远近照旧由引擎管（给 at 或 dist）。
 */
import type { Voice } from './engine';
import { burst, creak, curveOf, grain as granular, hiss, mode, plateau, reson, sprinkle, tap, wobble } from './kit';
import type { Shot } from './types';
import { clamp, rand } from './util';

/**
 * 推磨的一圈（d 秒）：一击与一直响着的那一层共用。
 * 磨盘不是正圆，推到某处压得紧些——隆隆跟着一涨一落；谷物一把把进磨眼，沙沙忽密忽疏；磨杠在磨盘的孔里有时吱一声。
 * 首尾各留一成多渐入渐出，一圈接一圈时两圈之间是交叠着过去的。
 */
export function millTurn(v: Voice, t: number, d: number, a: number, creakOdds = 0.6) {
  const c = v.ctx, n = Math.max(16, Math.round(d * 18)), ph = rand(0.15, 0.6);
  // 压得紧的那一处：一圈里一个鼓包
  const swell = (lo: number, hi: number) => curveOf(n, [[0, 0], [0.12, lo], [ph, hi], [Math.min(0.88, ph + 0.3), lo], [0.88, lo], [1, 0]]);
  // 石头与石头：褐噪声的低处（小喇叭放不出最低的，所以 300–400Hz 另有一层石头身子的闷）
  const low = v.e.noiseSrc('brown', t, d + 0.1), lf = c.createBiquadFilter(), lh = c.createBiquadFilter(), lg = c.createGain();
  lf.type = 'lowpass'; lf.frequency.value = rand(260, 320); lf.Q.value = 0.7;
  lh.type = 'highpass'; lh.frequency.value = 90; lh.Q.value = 0.6;
  lg.gain.value = 0; lg.gain.setValueCurveAtTime(swell(0.12 * a, 0.2 * a), t, d);
  low.connect(lf); lf.connect(lh); lh.connect(lg); lg.connect(v.out);
  hiss(v, { t, dur: d, noise: 'pink', f: rand(340, 420), q: 1.6, curve: swell(0.11 * a, 0.18 * a) });
  // 磨缝里谷物被碾碎：细的沙沙。上下两扇磨盘都錾着一道道齿，齿与齿一道道错过去，沙沙里一下一下地「咯」（每秒十来下，推得快就密）
  const teeth = c.createGain(), tl = c.createOscillator(), td = c.createGain();
  teeth.gain.value = 0.5; td.gain.value = 0.5;
  tl.type = 'triangle'; tl.frequency.setValueAtTime(rand(9, 12), t); tl.frequency.linearRampToValueAtTime(rand(9, 12), t + d);
  tl.connect(td); td.connect(teeth.gain); teeth.connect(v.out);
  tl.start(t); tl.stop(t + d + 0.05);
  hiss(v, { t, dur: d, f: rand(850, 1300), q: 1, hp: 500, curve: swell(0.07 * a, 0.1 * a), dest: teeth });
  hiss(v, { t, dur: d, f: rand(2600, 3200), q: 1.2, hp: 1500, curve: swell(0.012 * a, 0.02 * a), dest: teeth });
  // 磨杠（木头）在磨盘的孔里：低低地吱一声
  if (Math.random() < creakOdds) {
    const up = Math.random() < 0.5;
    creak(v, { t: t + d * rand(0.15, 0.6), dur: rand(0.35, 0.6), rate: up ? [rand(18, 24), rand(28, 36)] : [rand(28, 34), rand(17, 22)], res: [[rand(260, 320), 8, 1], [rand(620, 720), 10, 0.45]], amp: 0.06 * a, jitter: 240, scrape: 0.3 });
  }
}

/** 辘轳转一圈（d 秒）：两声吱呀（轴在轴架里，一扬一落），井绳绕上去的涩涩的摩擦，摇把到顶一顿 */
export function windTurn(v: Voice, t: number, d: number, a: number, p: number) {
  const half = d * 0.5;
  for (let i = 0; i < 2; i++) {
    const up = i === 0, s = t + i * half + rand(0, 0.04), cd = half * rand(0.6, 0.78);
    creak(v, { t: s, dur: cd, rate: up ? [rand(34, 40), rand(52, 62)] : [rand(50, 58), rand(32, 38)], res: [[520 * p, 9, 1], [1150 * p, 12, 0.55], [1900 * p, 10, 0.22]], amp: 0.2 * a * rand(0.85, 1.1), scrape: 0 });
  }
  // 绳子一圈圈压在轴上：粗麻绳的涩，有颗粒
  hiss(v, { t, dur: d, noise: 'pink', f: rand(800, 1000), q: 1.1, hp: 300, curve: plateau(Math.max(10, Math.round(d * 20)), 0.05 * a, 0.2, 0.2, 0.15), dest: granular(v, t, d, 0.4, 0.6, 0.55) });
  // 摇把转到顶，手上一顿：木头轻轻一「笃」
  const ex = tap(v, t + d * rand(0.85, 0.95), 2.4, 0.35 * a, 0.3);
  reson(v, ex, 380 * p, 7, 0.8);
  reson(v, ex, 900 * p, 9, 0.35);
}

/**
 * 世界自己一圈一圈地叫 millstone（推磨的人每推完一圈叫一声）时，跟上它的快慢：上一圈离这一圈多久，这一圈就响多久再多一成
 *（前后交叠着接过去，不在两圈之间空出一截）。隔得太久（九秒以上）或头一回，就按默认的一圈。
 */
const LAST_TURN = new WeakMap<object, number>();

type Fn = (v: Voice) => number;
export const FARM_SHOTS: Pick<Record<Shot, Fn>, 'sickle' | 'sheaf' | 'flail' | 'winnow' | 'millstone' | 'sow' | 'dig' | 'pluck' | 'grain' | 'windlass' | 'chop' | 'split' | 'loom' | 'pull' | 'pole' | 'rustle' | 'fruitFall' | 'scoop' | 'stir'> = {
  /**
   * 劈柴：斧子劈进立在木墩上的一段木头——斧刃吃进去的一闷（木头身子 180–250Hz、700–1100Hz 两处共鸣），
   * 木纹「咔嚓」一声裂开（二三十毫秒一阵撕开的脆响），劈开的两半落在地上一先一后两下「笃」
   */
  chop(v) {
    const a = (0.5 + 0.7 * v.vel) * rand(0.9, 1.08), t = v.t, p = v.pitch * rand(0.94, 1.06);
    const ex = tap(v, t, 1.8, 1.6 * a, 0.35);
    reson(v, ex, rand(180, 250) * p, 6, 1.3);
    reson(v, ex, rand(700, 1100) * p, 9, 0.8);
    reson(v, ex, rand(1800, 2400) * p, 10, 0.3);
    sprinkle(v, { t: t + 0.004, dur: rand(0.03, 0.05), n: 14 + Math.floor(rand(0, 10)), f: [1400, 4200], t60: [0.004, 0.012], amp: 0.16 * a, noise: 0.5, shape: (u) => Math.exp(-2.5 * u) });
    burst(v, { t, dur: 0.05, f: 2600, q: 0.8, amp: 0.12 * a, att: 0.0008 });
    if (Math.random() < 0.75) {
      for (let i = 0; i < 2; i++) {
        const at = t + rand(0.12, 0.2) + i * rand(0.05, 0.12), e2 = tap(v, at, 2.6, 0.5 * a * rand(0.6, 1), 0.3);
        reson(v, e2, rand(260, 360) * p, 6, 1);
        reson(v, e2, rand(900, 1200) * p, 8, 0.4);
      }
    }
    return 0.7;
  },
  /** 拔一棵（草、豆秧）：一把攥住往上一提——根须从土里扯出来的一下闷闷的「嘶啦」，带出来的土块碎了几粒落回去，叶子一阵窸窣 */
  pull(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.18, 0.26);
    hiss(v, { dur: d, noise: 'pink', f: 700, fMid: 1100, f2: 800, q: 0.8, hp: 250, curve: wobble(10, 0.12 * a, 0.35, 0.2), dest: granular(v, t, d, 0.35, 0.65, 0.8) });
    sprinkle(v, { t: t + d * 0.3, dur: d * 0.8, n: 14 + Math.floor(rand(0, 10)), f: [600, 2600], t60: [0.004, 0.01], amp: 0.05 * a, noise: 0.7, bright: 0.3 });
    hiss(v, { t: t + 0.03, dur: 0.3, f: 3000, q: 0.9, hp: 1500, curve: wobble(10, 0.035 * a, 0.3, 0.25), dest: granular(v, t, 0.35, 0.45, 0.55, 0.8) });
    for (let i = 0, k = 2 + Math.floor(rand(0, 3)); i < k; i++) burst(v, { t: t + d + rand(0.03, 0.25), dur: 0.04, type: 'lowpass', f: rand(350, 550), q: 0.7, amp: 0.15 * a * rand(0.5, 1), att: 0.004, noise: 'pink' });
    return d + 0.45;
  },
  /**
   * 摇树（打枣、摇柿子）：一竿子打在树上，满树的叶子哗地一抖——枝子来回弹两三下（每秒三下上下），叶声一阵比一阵小；
   * 几根细枝相碰、折断的小脆响。（风吹的那种是 gust，这是一下子被摇动的）
   */
  rustle(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(1.0, 1.3), n = Math.max(16, Math.round(d * 24)), sw = rand(2.6, 3.4);
    const env = new Float32Array(n);
    for (let i = 0; i < n; i++) { const u = (i / (n - 1)) * d; env[i] = 0.12 * a * Math.min(1, u / 0.03) * Math.exp(-u / (d * 0.35)) * (0.55 + 0.45 * Math.abs(Math.cos(Math.PI * sw * u))); }
    env[0] = 0; env[n - 1] = 0;
    hiss(v, { dur: d, f: 2600, fMid: 3300, f2: 2400, q: 0.8, hp: 1000, curve: env, dest: granular(v, t, d, 0.4, 0.6, 1) });
    hiss(v, { dur: d * 0.7, noise: 'pink', f: 900, q: 0.8, hp: 300, curve: wobble(12, 0.05 * a, 0.08, 0.2) });
    sprinkle(v, { t: t + 0.01, dur: d * 0.6, n: 8 + Math.floor(rand(0, 8)), f: [1500, 4000], t60: [0.005, 0.014], amp: 0.06 * a, noise: 0.5, spread: 0.6, shape: (u) => Math.exp(-3 * u) });
    return d + 0.3;
  },
  /** 果子落了一地：枣子、柿子一颗颗掉在地上——一阵软软的「噗、噗噗」（先密后疏），有的弹一下、滚一点 */
  fruitFall(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, n = 5 + Math.floor(rand(0, 6)), p = v.pitch;
    for (let i = 0; i < n; i++) {
      const at = t + 0.12 + Math.pow(Math.random(), 1.4) * 0.7, g = a * rand(0.4, 1), f = rand(260, 420) * p;
      burst(v, { t: at, dur: 0.05, f, q: 1, amp: 0.25 * g, att: 0.003, noise: 'pink' });
      burst(v, { t: at, dur: 0.03, f: rand(1200, 1800), q: 0.9, amp: 0.03 * g, att: 0.002 });
      if (Math.random() < 0.35) burst(v, { t: at + rand(0.08, 0.14), dur: 0.04, f: f * 1.1, q: 1, amp: 0.08 * g, att: 0.003, noise: 'pink' });
    }
    return 1.2;
  },
  /** 木锨铲进粮堆：锨口插进谷子里一下有颗粒的「沙」，木锨擦着场地「嚓」，满满一锨端起来时几粒滑下去 */
  scoop(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.2, 0.28);
    hiss(v, { dur: d, f: rand(2000, 2600), f2: 1600, q: 0.8, hp: 700, curve: wobble(8, 0.08 * a, 0.25, 0.2), dest: granular(v, t, d, 0.45, 0.55, 0.9) });
    burst(v, { dur: 0.09, f: 520, q: 0.9, amp: 0.22 * a, att: 0.008, noise: 'pink' });
    sprinkle(v, { t: t + d * 0.6, dur: 0.35, n: 18 + Math.floor(rand(0, 12)), f: [1800, 5000], t60: [0.003, 0.007], amp: 0.04 * a, noise: 0.6, shape: (u) => Math.exp(-3 * u) });
    return d + 0.45;
  },
  /** 碓臼里拨一拨谷子（碓头抬起的空当，手伸进臼里一翻）：谷粒在石臼里沙沙地一翻，臼是空的，闷闷地应一点 */
  stir(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.35, 0.5);
    hiss(v, { dur: d, f: rand(2200, 2800), fMid: 3200, f2: 2000, q: 0.8, hp: 900, curve: wobble(10, 0.06 * a, 0.35, 0.2), dest: granular(v, t, d, 0.4, 0.6, 1) });
    hiss(v, { dur: d, noise: 'pink', f: rand(380, 460), q: 3, curve: wobble(10, 0.06 * a, 0.35, 0.15) });
    sprinkle(v, { t: t + 0.05, dur: d * 0.8, n: 20 + Math.floor(rand(0, 12)), f: [1500, 4500], t60: [0.003, 0.007], amp: 0.03 * a, noise: 0.6 });
    return d + 0.3;
  },
  /** 挑麦上肩：扁担一压上肩，竹扁担弯下去「吱扭」一声，两头的麦捆一晃——草秆的一阵窸窣，肩上一顿 */
  pole(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.94, 1.06);
    burst(v, { dur: 0.06, f: 320, q: 0.9, amp: 0.25 * a, att: 0.006, noise: 'pink' });
    creak(v, { t: t + 0.05, dur: rand(0.3, 0.42), rate: [rand(26, 32), rand(40, 50)], res: [[rand(620, 760) * p, 10, 1], [rand(1400, 1700) * p, 12, 0.45]], amp: 0.11 * a, jitter: 260, scrape: 0.15 });
    hiss(v, { t: t + 0.08, dur: 0.5, f: 2300, q: 0.8, hp: 900, curve: wobble(12, 0.045 * a, 0.25, 0.25), dest: granular(v, t + 0.08, 0.5, 0.4, 0.6, 0.8) });
    creak(v, { t: t + rand(0.55, 0.7), dur: 0.22, rate: [rand(40, 48), rand(30, 36)], res: [[rand(620, 760) * p, 10, 1]], amp: 0.06 * a, jitter: 260, scrape: 0.1 });
    return 1.1;
  },
  /** 破篾：篾刀顺着竹子往前一推，竹丝一路撕开的一阵「嘶啦」（脆、有颗粒），竹子是空的，中间几下清楚的「嗒」 */
  split(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.18, 0.3), p = v.pitch * rand(0.94, 1.08);
    sprinkle(v, { t, dur: d, n: 40 + Math.floor(rand(0, 30)), f: [1500 * p, 5200 * p], t60: [0.003, 0.009], amp: 0.07 * a, noise: 0.55, shape: (u) => Math.min(1, u * 6) * (1 - 0.6 * u) });
    hiss(v, { dur: d, f: 2800 * p, f2: 3600 * p, q: 1, hp: 1200, curve: wobble(10, 0.04 * a, 0.25, 0.3), dest: granular(v, t, d, 0.35, 0.65, 0.9) });
    for (let i = 0, k = 2 + Math.floor(rand(0, 3)); i < k; i++) { const ex = tap(v, t + rand(0.01, d), 0.7, 0.3 * a * rand(0.5, 1), 0.3); reson(v, ex, rand(1100, 1700) * p, 14, 0.8); }
    return d + 0.3;
  },
  /** 织机：投梭——梭子在经线里滑过去的一口「嗖」，被另一只手接住轻轻一「嗒」；接着打纬——筘扳过来「哐」的一下（木架子低低地一应），有时弹一下又一磕 */
  loom(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.95, 1.05), d = rand(0.12, 0.16);
    hiss(v, { dur: d, noise: 'pink', f: 1200, fMid: 1900, f2: 1400, q: 0.9, hp: 500, curve: wobble(8, 0.05 * a, 0.3, 0.1) });
    const c1 = tap(v, t + d, 0.9, 0.3 * a, 0.3);
    reson(v, c1, 1500 * p, 9, 0.6);
    const b = t + d + rand(0.18, 0.28);
    for (const [dt, k] of Math.random() < 0.4 ? [[0, 1], [rand(0.05, 0.08), 0.35]] : [[0, 1]]) {
      const ex = tap(v, b + dt, 2.4, 1.1 * a * k, 0.3);
      reson(v, ex, rand(160, 210) * p, 6, 1.2);
      reson(v, ex, rand(420, 520) * p, 8, 0.7);
      reson(v, ex, rand(1300, 1700) * p, 10, 0.35);
    }
    return b - t + 0.5;
  },
  /** 镰刀割一把麦：刃过麦秆的一口快「唰」，一把麦秆一根根断开的脆响，麦秆倒进手里的窸窣，镰把在手里一顿 */
  sickle(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.12, 0.16), p = v.pitch * rand(0.94, 1.06);
    // 刃快，「唰」短而急；一把麦秆一齐断，脆响挤在那几十毫秒里，比刃声还显
    hiss(v, { dur: d, f: 1800 * p, fMid: 2800 * p, f2: 2000 * p, q: 0.9, hp: 700, curve: wobble(10, 0.1 * a, 0.3, 0.12) });
    sprinkle(v, { t: t + d * 0.15, dur: d * 1.1, n: 16 + Math.floor(rand(0, 11)), f: [1200 * p, 3600 * p], t60: [0.005, 0.014], amp: 0.2 * a, noise: 0.4, skew: 1.5 });
    hiss(v, { t: t + d * 0.6, dur: rand(0.3, 0.4), noise: 'pink', f: 1500, f2: 900, q: 0.8, hp: 500, curve: wobble(10, 0.05 * a, 0.25, 0.25) });
    burst(v, { t: t + d * 0.8, dur: 0.05, f: rand(260, 340), q: 0.9, amp: 0.3 * a, att: 0.004, noise: 'pink' });
    return d + 0.55;
  },
  /** 捆麦：草绳绕过去、两手一拧——两三下干的、有颗粒的「嘁——嚓」（许多根草茎互相挤、蹭）；末了把结掖进去，拍一下麦捆 */
  sheaf(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t;
    let x = 0;
    for (let i = 0, k = 2 + (Math.random() < 0.5 ? 1 : 0); i < k; i++) {
      const d = rand(0.22, 0.34), s = t + x, am = granular(v, s, d, 0.4, 0.6, rand(0.6, 0.9));
      hiss(v, { t: s, dur: d, f: rand(1800, 2500), fMid: rand(2600, 3300), f2: 1700, q: 1, hp: 800, curve: wobble(10, 0.1 * a, 0.45, 0.2), dest: am });
      hiss(v, { t: s, dur: d, noise: 'pink', f: rand(520, 700), q: 1.4, curve: wobble(10, 0.07 * a, 0.5, 0.15), dest: am });
      sprinkle(v, { t: s + d * 0.3, dur: d * 0.6, n: 4 + Math.floor(rand(0, 5)), f: [1200, 3400], t60: [0.008, 0.02], amp: 0.06 * a, noise: 0.6 });
      x += d + rand(0.06, 0.14);
    }
    burst(v, { t: t + x + 0.05, dur: 0.08, f: 520, q: 0.8, amp: 0.3 * a, att: 0.006, noise: 'pink' });
    burst(v, { t: t + x + 0.05, dur: 0.12, f: 2400, q: 0.8, amp: 0.04 * a, att: 0.01 });
    return x + 0.4;
  },
  /**
   * 连枷打场的一下：拍子先在头顶抡一圈（一口短的风），落下来打在铺开的谷穗上——拍子是几根竹片编的，前后差几毫秒，
   * 「啪」里带一点碎；压实的场地低低地一应；谷粒谷壳溅开又落下。（thresh 只是落下去的那一「啪」，这里是整个一下。）
   */
  flail(v) {
    const a = (0.5 + 0.7 * v.vel) * rand(0.9, 1.08), t = v.t, p = v.pitch * rand(0.96, 1.04), sw = rand(0.16, 0.22), h = t + sw;
    hiss(v, { dur: sw + 0.02, noise: 'pink', f: 380, fMid: 900, f2: 1300, q: 0.9, hp: 200, curve: wobble(8, 0.09 * a, 0.75, 0.05) });
    for (let i = 0; i < 3; i++) burst(v, { t: h + i * rand(0.004, 0.009), dur: 0.06, f: rand(420, 560) * p, q: 1, amp: (i ? 0.45 : 0.95) * a, att: 0.0015, noise: 'pink' });
    burst(v, { t: h, dur: 0.12, f: 200 * p, q: 0.8, amp: 0.5 * a, att: 0.004, noise: 'pink' });
    burst(v, { t: h + 0.002, dur: 0.05, f: 2600, q: 0.8, amp: 0.14 * a, att: 0.001 });
    sprinkle(v, { t: h + 0.015, dur: rand(0.3, 0.45), n: 14 + Math.floor(rand(0, 10)), f: [2200, 6000], t60: [0.004, 0.01], amp: 0.05 * a, noise: 0.7, shape: (u) => Math.exp(-3 * u) });
    return sw + 0.6;
  },
  /** 扬场：木锨铲进粮堆（沙）、一扬（一口风）；粮食落回场上，一阵密密的「沙沙」先密后疏；糠被风带走，轻轻的一片「沙——」往一边飘 */
  winnow(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d0 = rand(0.16, 0.22);
    hiss(v, { dur: d0, f: rand(2200, 2800), q: 0.8, hp: 900, curve: wobble(8, 0.08 * a, 0.3, 0.2), dest: granular(v, t, d0, 0.5, 0.5, 0.9) });
    burst(v, { dur: 0.1, f: 500, q: 0.9, amp: 0.25 * a, att: 0.01, noise: 'pink' });
    const up = t + d0 + rand(0.12, 0.2);
    hiss(v, { t: up, dur: 0.24, noise: 'pink', f: 500, fMid: 1100, f2: 700, q: 0.9, curve: wobble(8, 0.07 * a, 0.5, 0.08) });
    const fall = up + rand(0.35, 0.5), fd = rand(0.9, 1.2);
    sprinkle(v, { t: fall, dur: fd, n: 130 + Math.floor(rand(0, 60)), f: [1800, 5500], t60: [0.003, 0.008], amp: 0.06 * a, noise: 0.6, spread: 0.5, shape: (u) => Math.min(1, u * 8) * Math.exp(-2.2 * u) });
    hiss(v, { t: fall, dur: fd, f: 3000, q: 0.6, hp: 1500, curve: wobble(12, 0.03 * a, 0.12, 0.25) });
    const pan = v.ctx.createStereoPanner(), side = Math.random() < 0.5 ? -1 : 1;
    pan.pan.setValueAtTime(0, fall);
    pan.pan.linearRampToValueAtTime(0.7 * side, fall + fd + 0.8);
    pan.connect(v.out);
    hiss(v, { t: fall + 0.1, dur: fd + 0.7, noise: 'pink', f: 1400, f2: 2200, q: 0.5, hp: 600, curve: plateau(16, 0.04 * a, 0.25, 0.5, 0.15), dest: pan });
    return fall - t + fd + 1.0;
  },
  /**
   * 推磨一圈（dur，默认两秒半上下）：低低的隆隆一涨一落，谷物碾碎的沙沙，磨杠吱一声。要一直推就用 setLoop('millstone')；
   * 世界每推完一圈叫一声也行——没给 dur 时跟着它两声之间隔多久走（见 LAST_TURN）
   */
  millstone(v) {
    const a = 0.5 + 0.7 * v.vel, last = LAST_TURN.get(v.e), gap = last == null ? Infinity : v.t - last;
    LAST_TURN.set(v.e, v.t);
    const d = clamp(v.dur ?? (gap > 1.2 && gap < 9 ? gap * 1.12 : rand(2.4, 2.9)), 1, 10);
    millTurn(v, v.t, d, a, 0.85);
    return d + 0.3;
  },
  /** 撒种：手一扬（袖底一口很轻的风），种子落在松土上——细碎、发闷的点点，先密后疏 */
  sow(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.55, 0.8);
    hiss(v, { dur: 0.2, noise: 'pink', f: 700, fMid: 1300, f2: 900, q: 0.8, curve: wobble(8, 0.035 * a, 0.5, 0.1) });
    sprinkle(v, { t: t + 0.12, dur: d, n: 50 + Math.floor(rand(0, 40)), f: [900, 3000], t60: [0.002, 0.006], amp: 0.075 * a, noise: 0.8, bright: 0.3, spread: 0.6, shape: (u) => Math.min(1, u * 10) * Math.exp(-2.5 * u) });
    return d + 0.35;
  },
  /** 锄地翻土：锄头吃进土里一闷，往回一带把土翻过来——一段有颗粒的「嚓——」，土块翻落几下「扑」，几粒土滚开（hoe 只是锄下去那一下） */
  dig(v) {
    const a = (0.5 + 0.7 * v.vel) * rand(0.88, 1.1), t = v.t;
    mode(v, rand(95, 125), 0.35 * a, 0.1, 0.006);
    burst(v, { dur: 0.11, f: rand(260, 330), f2: 170, q: 0.8, amp: 1.0 * a, att: 0.005, noise: 'pink' });
    const s = t + rand(0.14, 0.2), sd = rand(0.22, 0.3);
    hiss(v, { t: s, dur: sd, noise: 'pink', f: 900, f2: 450, q: 0.8, curve: wobble(10, 0.24 * a, 0.3, 0.15), dest: granular(v, s, sd, 0.45, 0.55, 0.7) });
    hiss(v, { t: s, dur: sd, f: 2200, q: 0.9, hp: 1000, curve: wobble(10, 0.035 * a, 0.3, 0.2) });
    for (let i = 0, k = 2 + Math.floor(rand(0, 3)); i < k; i++) burst(v, { t: s + sd * rand(0.5, 1.3), dur: 0.05, type: 'lowpass', f: rand(300, 500), q: 0.7, amp: 0.3 * a * rand(0.5, 1), att: 0.005, noise: 'pink' });
    sprinkle(v, { t: s + sd * 0.6, dur: 0.3, n: 6 + Math.floor(rand(0, 6)), f: [1500, 4000], t60: [0.003, 0.007], amp: 0.035 * a, noise: 0.8 });
    return s - t + sd + 0.45;
  },
  /** 摘果：一拧（枝叶被扯动的一阵窸窣），一折（果柄断开的一声脆响），枝子弹回去叶子哗啦一下又静下来，果子落进手心软软一下 */
  pluck(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, tw = rand(0.18, 0.26), s = t + tw * 0.85;
    hiss(v, { dur: tw, f: 3200, fMid: 4200, f2: 3000, q: 0.9, hp: 1500, curve: wobble(10, 0.06 * a, 0.4, 0.25), dest: granular(v, t, tw, 0.5, 0.5, 0.7) });
    const ex = tap(v, s, 0.6, 0.5 * a, 0.5);
    reson(v, ex, rand(1700, 2400), 9, 0.9);
    reson(v, ex, rand(3600, 4600), 10, 0.4);
    hiss(v, { t: s + 0.02, dur: rand(0.35, 0.5), f: 2800, f2: 2200, q: 0.8, hp: 1200, curve: wobble(12, 0.07 * a, 0.12, 0.3), dest: granular(v, s, 0.55, 0.45, 0.55, 0.9) });
    burst(v, { t: s + 0.04, dur: 0.05, type: 'lowpass', f: 700, q: 0.7, amp: 0.25 * a, att: 0.004, noise: 'pink' });
    return tw + 0.75;
  },
  /**
   * 把粮食倒进斗里（dur，默认一秒多）：粮食一粒粒落下去的密密的点，一股粮流的「沙——」，木斗的空腔跟着响、越满越高。
   * variant: 'sack' 倒进布袋——闷，没有那个腔。
   */
  grain(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = clamp(v.dur ?? rand(1.1, 1.5), 0.4, 4), sack = v.raw.variant === 'sack', n = Math.max(10, Math.round(d * 20));
    sprinkle(v, { t, dur: d, n: Math.round(d * 260), f: sack ? [700, 2400] : [1600, 5200], t60: [0.002, 0.006], amp: 0.05 * a, noise: 0.7, bright: sack ? 0.25 : 0.7, shape: (u) => Math.min(1, u * 12) * Math.min(1, (1 - u) * 6) });
    hiss(v, { dur: d, f: sack ? 1300 : 2600, q: 0.7, hp: sack ? 300 : 900, curve: plateau(n, 0.08 * a, 0.08, 0.15, 0.1), dest: granular(v, t, d, 0.5, 0.5, 0.8) });
    if (sack) hiss(v, { dur: d, noise: 'pink', f: 480, q: 0.9, curve: plateau(n, 0.07 * a, 0.1, 0.2, 0.08) });
    else hiss(v, { dur: d, noise: 'pink', f: rand(420, 520), f2: rand(760, 900), q: 6, curve: plateau(n, 0.12 * a, 0.1, 0.15, 0.08) });
    return d + 0.3;
  },
  /** 辘轳绞绳（dur，默认转一圈半上下）：一转半圈吱呀一声，井绳绕上去涩涩的，摇把一顿。要一直绞就用 setLoop('windlass') */
  windlass(v) {
    const a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.94, 1.06), per = rand(1.15, 1.4), turns = Math.max(1, Math.round(clamp(v.dur ?? per * 1.5, 0.6, 12) / per));
    for (let i = 0; i < turns; i++) windTurn(v, v.t + i * per, per, a, p);
    return turns * per + 0.4;
  },
};

/** 一直响着的那两样要的：推磨一圈多长、辘轳一圈多长（层里排程时用） */
export const millPeriod = () => rand(2.3, 2.9);
export const windPeriod = () => rand(1.15, 1.4);
