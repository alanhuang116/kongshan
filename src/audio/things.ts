/**
 * 器物与游戏：抛竿、收线、鱼咬钩；纸鸢；踢毽子；投壶（箭入壶、箭落地）；打水漂；踩雪、滚雪球；檐下的风铃；点灯笼（火镰与纸灯笼）。
 * （秋千、橹、柴门、叩门、扫地在 village.ts、study.ts。）
 *
 *   竹竿一甩 ＝ 一口快的「嗖」＋ 线放出去的一缕细嘶 ＋ 落水的一声小「啵」；
 *   纸鸢 ＝ 线绷在风里的一声细「嗡」（风吹细线的涡声：中心随风速游走）＋ 纸面被风拍着的低低的「扑扑」＋ 一阵阵的风；
 *   铜壶 ＝ 几个不成整数倍的分音（半秒到一秒）＋ 箭杆碰壶口、落壶底的两下木声；
 *   水漂 ＝ 一下比一下近、一下比一下轻的「啵」，越去越远；
 *   风铃 ＝ 四五个小铜铃，铃舌东碰一下西碰一下，一阵一阵的；
 *   火镰 ＝ 钢擦过火石的亮而短的「嚓」＋ 迸开的火星（算进一段波形里的十几个细点）。
 * 远近照旧由引擎管（给 at 或 dist）。
 */
import type { Engine, Voice } from './engine';
import { bubble, burst, creak, curveOf, glide, grain, hiss, mode, partials, plateau, reson, sprinkle, tap, wobble } from './kit';
import { crunch } from './steps';
import type { Shot } from './types';
import { clamp, pick, rand } from './util';

/** 风铃的几个音：G 宫五声，比风铎高一个八度上下（D7 E7 G7 A7 B7） */
const CHIME = [2349.32, 2637.02, 3135.96, 3520, 3951.07];
/** 铜壶的几个分音：[倍率, 幅度, t60, 拍频, 起音] */
const POT_MODES = [[1, 1, 1.1, 1.2, 0.0008], [2.32, 0.6, 0.7, 1.9, 0.0006], [3.86, 0.35, 0.45, 0, 0.0005], [5.5, 0.18, 0.3, 0, 0.0005]] as const;

/**
 * 纸鸢在天上（一击与一直响着的那一层共用）：线的「嗡」、纸面的「扑扑」、风。返回出口与几个要慢慢游走的参数。
 * 线的音高随风：风紧了往上走（细线的涡声频率与风速成正比）。
 */
export function kiteGraph(e: Engine, t: number) {
  const c = e.ctx, nodes: AudioNode[] = [], srcs: AudioScheduledSourceNode[] = [];
  const G = (v: number) => { const g = c.createGain(); g.gain.value = v; nodes.push(g); return g; };
  const F = (type: BiquadFilterType, f: number, q: number) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; nodes.push(b); return b; };
  const S = <T extends AudioScheduledSourceNode>(s: T) => { srcs.push(s); nodes.push(s); return s; };
  const out = G(1);
  // 线：白噪声过两条很窄的带（基音与二倍），像一根弦被风吹着
  const white = S(e.noiseSrc('white', t)), hum = F('bandpass', rand(430, 520), 32), hum2 = F('bandpass', 980, 40), hg = G(0.5), hg2 = G(0.18);
  white.connect(hum); hum.connect(hg); hg.connect(out);
  white.connect(hum2); hum2.connect(hg2); hg2.connect(out);
  // 纸面：被风拍着，每秒三四十下的「扑扑」（粉噪声的低处被一个方波一开一合）
  const pink = S(e.noiseSrc('pink', t)), pf = F('bandpass', 260, 1.2), am = G(0.5), lfo = S(c.createOscillator()), ld = G(0.5), pg = G(0.25);
  lfo.type = 'square'; lfo.frequency.value = rand(30, 42);
  lfo.connect(ld); ld.connect(am.gain);
  pink.connect(pf); pf.connect(am); am.connect(pg); pg.connect(out);
  // 风：高处的风比地上的大
  const wf = F('bandpass', 700, 0.6), wg = G(0.12);
  pink.connect(wf); wf.connect(wg); wg.connect(out);
  lfo.start(t);
  return { out, nodes, srcs, hum, hum2, hg, pg, wg, lfo };
}

type Fn = (v: Voice) => number;
export const THING_SHOTS: Pick<Record<Shot, Fn>, 'cast' | 'strike' | 'fishSplash' | 'flop' | 'reel' | 'bite' | 'kite' | 'shuttle' | 'arrowPot' | 'arrowMiss' | 'potRim' | 'potEar' | 'toss' | 'catch' | 'swish' | 'skip' | 'snowCrunch' | 'chime' | 'lantern' | 'starTap' | 'starLight' | 'matUnroll' | 'matRoll' | 'boatBump' | 'flutter' | 'kiteFall' | 'snap' | 'snowPat'> = {
  /**
   * 抛竿：竿梢一甩（一口快的「嗖」，竹竿细，风声高），线放出去的一缕极细的嘶。钩与浮子落水那一声不在这里——
   * 世界在它真落下去的地方另叫（plop）。variant: 'land' 则连落水的一声小「啵」也带上（世界没另叫时用）
   */
  cast(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.94, 1.08);
    hiss(v, { dur: 0.22, f: 1500, fMid: 3800, f2: 2200, q: 1.1, hp: 800, curve: wobble(10, 0.09 * a, 0.55, 0.06) });
    hiss(v, { t: t + 0.12, dur: rand(0.45, 0.6), f: 5200, f2: 3800, q: 1.4, hp: 2500, curve: curveOf(12, [[0, 0], [0.08, 1], [0.4, 0.45], [1, 0]], 0.03 * a) });
    if (v.raw.variant !== 'land') return 0.9;
    const L = t + rand(0.7, 0.95);
    bubble(v, L, 700 * p, 1500 * p, 0.03, 0.14 * a);
    burst(v, { t: L, dur: 0.05, f: 3000, q: 1, amp: 0.06 * a, att: 0.002 });
    bubble(v, L + 0.05, 1100, 2100, 0.02, 0.05 * a);
    return L - t + 0.5;
  },
  /** 提竿：竿子猛地一挑——比抛竿短而急的一「嗖」；线从水里划出来的一缕「嘶」，浮子跳起来带起一小点水 */
  strike(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.94, 1.08);
    hiss(v, { dur: 0.14, f: 1800, fMid: 4200, f2: 2600, q: 1.2, hp: 900, curve: wobble(8, 0.1 * a, 0.5, 0.05) });
    hiss(v, { t: t + 0.02, dur: 0.22, f: 4200, f2: 2800, q: 1.3, hp: 1800, curve: curveOf(10, [[0, 0], [0.1, 1], [1, 0]], 0.05 * a) });
    burst(v, { t: t + 0.03, dur: 0.08, f: 2400, q: 0.8, amp: 0.06 * a, att: 0.003 });
    for (let i = 0; i < 3; i++) { const f = rand(900, 2000) * p; bubble(v, t + rand(0.04, 0.3), f, f * 1.6, 0.02, 0.04 * a * rand(0.5, 1)); }
    return 0.6;
  },
  /** 上了钩的鱼在水面挣：两三下「哗啦」（尾巴拍水，一下一下不匀），水珠落回来 */
  fishSplash(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t;
    let x = 0;
    for (let i = 0, k = 2 + Math.floor(rand(0, 3)); i < k; i++) {
      const at = t + x, g = a * (i ? rand(0.5, 0.9) : 1), d = rand(0.06, 0.12);
      burst(v, { t: at, dur: d, f: rand(1200, 2200), q: 0.6, amp: 0.22 * g, att: 0.003, noise: 'pink' });
      burst(v, { t: at, dur: d * 0.7, f: rand(3200, 4400), q: 0.8, amp: 0.05 * g, att: 0.002 });
      bubble(v, at + 0.005, rand(250, 400), rand(600, 900), 0.05, 0.12 * g);
      for (let j = 0; j < 3; j++) { const f = rand(900, 2400); bubble(v, at + rand(0.05, 0.3), f, f * 1.5, 0.02, 0.04 * g * rand(0.4, 1)); }
      x += rand(0.15, 0.32);
    }
    return x + 0.5;
  },
  /** 鱼离了水在手里、篓里扑腾：湿湿的几下「啪嗒」（身子拍在竹篓、草上），一下比一下轻，带几滴水 */
  flop(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t;
    let x = 0;
    for (let i = 0, k = 3 + Math.floor(rand(0, 4)); i < k; i++) {
      const at = t + x, g = a * Math.pow(0.8, i) * rand(0.8, 1.1);
      burst(v, { t: at, dur: 0.035, f: rand(800, 1400), q: 0.8, amp: 0.36 * g, att: 0.0015, noise: 'pink' });
      burst(v, { t: at, dur: 0.05, f: 300, q: 0.9, amp: 0.26 * g, att: 0.003, noise: 'pink' });
      if (Math.random() < 0.5) { const f = rand(800, 1600); bubble(v, at + rand(0.01, 0.05), f, f * 1.7, 0.02, 0.03 * g); }
      x += rand(0.09, 0.22) * (i > 2 ? 1.4 : 1);
    }
    return x + 0.35;
  },
  /** 收线（dur，默认一秒半上下）：钓车的木轮一圈圈转，棘齿一下下「咔」（一秒十几下，越收越快），线在轮上沙沙地绕，湿线带上来几滴水 */
  reel(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = clamp(v.dur ?? rand(1.4, 1.9), 0.5, 6), sr = v.ctx.sampleRate;
    // 棘齿：直接算进一段波形（几十下，每下是木头的一个小「咔」）
    const b = v.ctx.createBuffer(1, Math.floor(sr * (d + 0.1)), sr), x = b.getChannelData(0), TAU = Math.PI * 2;
    for (let at = rand(0, 0.05); at < d; at += 1 / (10 + 7 * (at / d)) * rand(0.9, 1.1)) {
      const i0 = Math.floor(at * sr), g = 0.07 * a * rand(0.7, 1), f1 = rand(2200, 2600), f2 = f1 * 1.72;
      for (let j = 0, m = Math.floor(sr * 0.012); j < m && i0 + j < x.length; j++) { const u = j / sr; x[i0 + j] += g * Math.min(1, j / 6) * (Math.sin(TAU * f1 * u) * Math.exp(-u / 0.0022) + 0.5 * Math.sin(TAU * f2 * u) * Math.exp(-u / 0.0014) + 0.3 * (Math.random() * 2 - 1) * Math.exp(-u / 0.0008)); }
    }
    const s = v.ctx.createBufferSource();
    s.buffer = b; s.connect(v.out); s.start(t);
    hiss(v, { dur: d, f: 3400, q: 1.2, hp: 1800, curve: plateau(Math.max(10, Math.round(d * 20)), 0.02 * a, 0.15, 0.2, 0.2) });
    for (let i = 0, k = 2 + Math.floor(rand(0, 2)); i < k; i++) { const f = rand(1000, 1700); bubble(v, t + rand(0.2, d), f, f * 1.6, 0.025, 0.035 * a); }
    return d + 0.3;
  },
  /** 鱼咬钩：浮子被轻轻啄了一两下（几乎听不见的「嘟、嘟」），然后一沉——一个小泡，水面一合 */
  bite(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.92, 1.08);
    let x = 0;
    for (let i = 0, k = 1 + Math.floor(rand(0, 2)); i < k; i++) { bubble(v, t + x, 900 * p, 1500 * p, 0.018, 0.03 * a); x += rand(0.16, 0.28); }
    bubble(v, t + x, 520 * p, 1150 * p, 0.045, 0.07 * a);
    burst(v, { t: t + x, dur: 0.12, type: 'lowpass', f: 1100, q: 0.7, amp: 0.04 * a, att: 0.01, noise: 'pink' });
    bubble(v, t + x + 0.06, 1300, 2300, 0.02, 0.025 * a);
    return x + 0.45;
  },
  /** 纸鸢（dur，默认三秒半）：线绷在风里的一声细「嗡」（随风忽高忽低），纸面被风拍着的低低的「扑扑」，一阵风。一直放着用 setLoop('kite') */
  kite(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = clamp(v.dur ?? rand(3.2, 4), 1.2, 12), g = kiteGraph(v.e, t), env = v.ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueCurveAtTime(curveOf(Math.max(16, Math.round(d * 8)), [[0, 0], [0.18, 1], [0.8, 0.9], [1, 0]], 0.5 * a), t, d);
    g.out.connect(env); env.connect(v.out);
    // 一阵风：线的音往上走、纸拍得急，再落回来
    const f0 = g.hum.frequency.value, k = rand(1.08, 1.18), gt = t + d * rand(0.3, 0.5);
    g.hum.frequency.setTargetAtTime(f0 * k, gt, 0.4); g.hum.frequency.setTargetAtTime(f0, gt + d * 0.3, 0.6);
    g.hum2.frequency.setTargetAtTime(980 * k, gt, 0.4); g.hum2.frequency.setTargetAtTime(980, gt + d * 0.3, 0.6);
    g.lfo.frequency.setTargetAtTime(g.lfo.frequency.value * 1.2, gt, 0.3); g.lfo.frequency.setTargetAtTime(g.lfo.frequency.value, gt + d * 0.3, 0.5);
    for (const s of g.srcs) s.stop(t + d + 0.05);
    v.e.after(t + d + 0.5, () => { for (const n of g.nodes) { try { n.disconnect(); } catch { /* 已断 */ } } });
    return d + 0.2;
  },
  /** 踢毽子：鞋帮踢在毽子的底座上，软的一「噗」（布包着几枚铜钱），钱在里头轻轻一碰，鸡毛一抖 */
  shuttle(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, ex = tap(v, t, 2.2, 0.8 * a, 0.35);
    reson(v, ex, rand(380, 480), 4, 1.2);
    reson(v, ex, rand(900, 1100), 5, 0.5);
    mode(v, rand(3200, 3700), 0.014 * a, 0.05, 0.0006);
    mode(v, rand(5200, 5900), 0.009 * a, 0.035, 0.0005);
    hiss(v, { t: t + 0.004, dur: 0.12, f: 2600, q: 0.8, hp: 1200, curve: wobble(8, 0.03 * a, 0.2, 0.2) });
    return 0.35;
  },
  /**
   * 投壶，箭入壶：箭杆擦着壶口落进去——竹木的一「嗒」，铜壶「叮——」地一应（几个不成整数倍的分音）；
   * 壶里盛着小豆（古来投壶都这样，箭才不跃出来），粗头扎进豆里是软软的一「沙」，壶身再轻轻应一声。世界那边也叫它 potIn
   */
  arrowPot(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.96, 1.05), f0 = rand(720, 860) * p;
    const ex = tap(v, t, 0.8, 0.6 * a, 0.4);
    reson(v, ex, 1800 * p, 8, 0.6);
    partials(v, f0, 0.075 * a, POT_MODES, 0.15);
    const t2 = t + rand(0.09, 0.14);
    sprinkle(v, { t: t2, dur: 0.12, n: 18 + Math.floor(rand(0, 10)), f: [700, 2600], t60: [0.004, 0.01], amp: 0.05 * a, noise: 0.6, bright: 0.3, shape: (u) => Math.exp(-4 * u) });
    burst(v, { t: t2, dur: 0.06, f: 420, q: 1, amp: 0.15 * a, att: 0.003, noise: 'pink' });
    mode(v, f0 * 1.003, 0.025 * a, 0.8, 0.002, v.out, t2);
    return 1.6;
  },
  /** 箭碰在壶口沿上（斜倚在口里，或者弹开）：铜口沿被箭杆磕了一下——比入壶那一声亮、短而硬的「当」，箭杆自己一「嗒」 */
  potRim(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.96, 1.05), f0 = rand(720, 860) * p;
    const ex = tap(v, t, 0.5, 0.8 * a, 0.45);
    reson(v, ex, 2100 * p, 9, 0.7);
    reson(v, ex, 1100 * p, 7, 0.4);
    // 磕在口沿上，高处的几个分音比低的响
    partials(v, f0, 0.07 * a, [[1, 0.5, 0.8, 1.2, 0.0006], [2.32, 0.8, 0.55, 1.9, 0.0005], [3.86, 0.6, 0.35, 0, 0.0004], [5.5, 0.4, 0.22, 0, 0.0004], [7.4, 0.2, 0.12, 0, 0.0003]], 0.2);
    return 1.2;
  },
  /** 贯耳：箭从壶颈旁的小耳里穿下去——耳是一截细铜管，箭杆擦过它是又高又细的一声「叮」，接着粗头落在地上轻轻一「嗒」 */
  potEar(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.96, 1.05), f0 = rand(1650, 1900) * p;
    const ex = tap(v, t, 0.5, 0.5 * a, 0.4);
    reson(v, ex, 2600 * p, 9, 0.5);
    partials(v, f0, 0.055 * a, [[1, 1, 0.7, 2.1, 0.0005], [2.6, 0.45, 0.4, 0, 0.0004], [4.3, 0.2, 0.22, 0, 0.0004]], 0.25);
    mode(v, rand(720, 860) * p, 0.02 * a, 0.6, 0.002, v.out, t + 0.01);
    const t2 = t + rand(0.12, 0.18), ex2 = tap(v, t2, 1, 0.35 * a, 0.35);
    reson(v, ex2, 1300 * p, 8, 0.7);
    reson(v, ex2, 620 * p, 6, 0.5);
    burst(v, { t: t2, dur: 0.04, type: 'lowpass', f: 500, q: 0.7, amp: 0.08 * a, att: 0.002, noise: 'pink' });
    return 1.1;
  },
  /** 投出一支箭：手一送，箭杆飞出去那一下轻轻的「嗖」，袖子一抖 */
  toss(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.22, 0.3);
    hiss(v, { dur: d, f: 1400, fMid: 3200, f2: 2000, q: 1.2, hp: 700, curve: wobble(10, 0.06 * a, 0.45, 0.06) });
    hiss(v, { t: t + 0.02, dur: 0.16, noise: 'pink', f: 900, fMid: 1600, f2: 1000, q: 0.8, hp: 400, curve: wobble(8, 0.03 * a, 0.3, 0.2) });
    return d + 0.25;
  },
  /** 接住反跃回来的箭：手掌一把攥住箭杆，干脆的一「啪」，竹木在手里轻轻一应 */
  catch(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.95, 1.05);
    burst(v, { dur: 0.03, f: rand(1300, 1800), q: 0.8, amp: 0.32 * a, att: 0.0012, noise: 'pink' });
    burst(v, { dur: 0.05, f: 380, q: 0.9, amp: 0.35 * a, att: 0.002, noise: 'pink' });
    const ex = tap(v, t + 0.003, 0.8, 0.4 * a, 0.3);
    reson(v, ex, 1250 * p, 8, 0.6);
    reson(v, ex, 2400 * p, 9, 0.3);
    return 0.35;
  },
  /** 秋千荡得高时耳边的一口风：袖子兜着风「呼——」，衣摆一阵抖 */
  swish(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.45, 0.6);
    hiss(v, { dur: d, noise: 'pink', f: 420, fMid: rand(900, 1100), f2: 500, q: 0.8, hp: 180, curve: wobble(12, 0.12 * a, 0.45, 0.06), dest: grain(v, t, d, 0.75, 0.25, 0.25) });
    hiss(v, { t: t + d * 0.25, dur: d * 0.6, f: 2400, q: 0.8, hp: 1200, curve: wobble(10, 0.015 * a, 0.3, 0.25) });
    return d + 0.2;
  },
  /** 投壶，箭落地：竹木的一「嗒」，弹一两下，滚半圈 */
  arrowMiss(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.95, 1.06);
    [[0, 1], [rand(0.11, 0.16), 0.4], [rand(0.2, 0.25), 0.18]].forEach(([dt, k]) => {
      const ex = tap(v, t + dt, 0.9, 0.7 * a * k, 0.35);
      reson(v, ex, 1400 * p, 8, 0.9);
      reson(v, ex, 2600 * p, 9, 0.5);
      reson(v, ex, 650 * p, 6, 0.6);
    });
    burst(v, { dur: 0.05, type: 'lowpass', f: 500, q: 0.7, amp: 0.15 * a, att: 0.002, noise: 'pink' });
    hiss(v, { t: t + 0.27, dur: 0.25, f: 1800, q: 1, hp: 800, curve: wobble(8, 0.02 * a, 0.2, 0.3), dest: grain(v, t + 0.27, 0.25, 0.4, 0.6, 1) });
    return 0.7;
  },
  /** 打水漂：石片一路点过去，每一下是很短的一「啵」，一下比一下近、一下比一下轻、越去越远，末了沉下去 */
  skip(v) {
    const c = v.ctx, a = 0.5 + 0.7 * v.vel, t = v.t, n = 3 + Math.floor(rand(0, 5)), pan = c.createStereoPanner(), lp = c.createBiquadFilter(), side = Math.random() < 0.5 ? -1 : 1;
    let x = 0, gap = rand(0.3, 0.4), k = 1;
    const span = (() => { let s = 0, g = gap; for (let i = 0; i < n; i++) { s += g; g *= 0.75; } return s; })();
    lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(9000, t); lp.frequency.exponentialRampToValueAtTime(3200, t + span + 0.3);
    pan.pan.setValueAtTime(0, t); pan.pan.linearRampToValueAtTime(0.6 * side, t + span + 0.3);
    lp.connect(pan); pan.connect(v.out);
    for (let i = 0; i < n; i++) {
      const at = t + x;
      burst(v, { t: at, dur: 0.03, f: rand(1800, 3200), q: 0.9, amp: 0.16 * a * k, att: 0.0015, dest: lp });
      bubble(v, at + 0.004, rand(700, 1100), rand(1200, 1800), 0.03, 0.11 * a * k, lp);
      x += gap; gap *= rand(0.7, 0.8); k *= rand(0.62, 0.75);
    }
    bubble(v, t + x, 500, 1000, 0.05, 0.07 * a * k, lp);
    return x + 0.45;
  },
  /** 踩雪一下（发干的「咯吱」）。variant: 'roll' 滚雪球（dur，默认一秒多）——一路慢慢压实的「咯吱咯吱」，雪团在雪上滚的一点软「沙」 */
  snowCrunch(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t;
    if (v.raw.variant === 'roll') {
      const d = clamp(v.dur ?? rand(1.2, 1.6), 0.5, 6);
      for (let x = 0; x < d - 0.15;) { const s = rand(0.18, 0.3); crunch(v, t + x, s, a * rand(0.55, 0.8)); x += s * rand(0.7, 0.95); }
      hiss(v, { dur: d, noise: 'pink', f: 900, q: 0.8, hp: 300, curve: plateau(Math.max(10, Math.round(d * 16)), 0.05 * a, 0.2, 0.25, 0.2) });
      return d + 0.3;
    }
    burst(v, { dur: 0.05, f: 240, q: 0.8, amp: 0.2 * a, att: 0.008, noise: 'pink' });
    crunch(v, t + 0.005, rand(0.18, 0.26), a, Math.random() < 0.35 ? 1 : 0);
    return 0.5;
  },
  /** 观星时点一颗星：极轻、极短的一下「叮」（高处，G 宫五声里的一个音，一小半秒就散），像指尖碰了一下薄瓷。不抢夜里的静 */
  starTap(v) {
    const a = 0.5 + 0.7 * v.vel, f = pick([2349.32, 2637.02, 3135.96]) * v.pitch * rand(0.995, 1.005);
    mode(v, f, 0.018 * a, 0.32, 0.0015);
    mode(v, f * 2.76, 0.005 * a, 0.12, 0.0012);
    burst(v, { dur: 0.01, f: 5000, q: 1, amp: 0.008 * a, att: 0.0008 });
    return 0.5;
  },
  /**
   * 四象里一宿一宿点亮：每点亮一宿，一声很软的「当——」（像毡槌碰了一下小磬，一秒多才散）。
   * pitch 在这里是「第几宿」：0、1、2……顺着 G 宫五声往上走（G5 A5 B5 D6 E6 G6 A6），七宿走完正好一句
   */
  starLight(v) {
    const a = 0.5 + 0.7 * v.vel, i = Math.max(0, Math.round(v.raw.pitch ?? 0)), STEP = [0, 2, 4, 7, 9];
    const semis = STEP[i % 5] + 12 * Math.floor(i / 5), f0 = 783.99 * Math.pow(2, semis / 12) * (v.raw.rate ?? 1);
    partials(v, f0, 0.03 * a, [[1, 1, 1.6, 0.9, 0.004], [2.71, 0.35, 0.6, 1.7, 0.003], [5.12, 0.12, 0.25, 0, 0.002]], 0.25);
    return 2;
  },
  /** 铺席：一领草席在草坡上滚开——草编的一路细碎的「哗啦」，卷着的那一轴一圈圈拍在地上（越滚越快、越拍越轻），末了平平地落下一「噗」 */
  matUnroll(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.85, 1.1), n = Math.max(12, Math.round(d * 20));
    hiss(v, { dur: d, noise: 'pink', f: 900, f2: 1400, q: 0.8, hp: 400, curve: plateau(n, 0.06 * a, 0.12, 0.3, 0.15), dest: grain(v, t, d, 0.4, 0.6, 0.8) });
    sprinkle(v, { t, dur: d, n: Math.round(d * 90), f: [1200, 4200], t60: [0.003, 0.008], amp: 0.035 * a, noise: 0.6, spread: 0.4 });
    for (let x = 0.08, gap = 0.26, k = 1; x < d - 0.05; x += gap, gap *= 0.82, k *= 0.85) burst(v, { t: t + x, dur: 0.05, f: rand(350, 480), q: 0.9, amp: 0.16 * a * k, att: 0.004, noise: 'pink' });
    burst(v, { t: t + d, dur: 0.09, f: 300, q: 0.8, amp: 0.2 * a, att: 0.006, noise: 'pink' });
    hiss(v, { t: t + d, dur: 0.25, f: 2600, q: 0.8, hp: 1200, curve: wobble(8, 0.02 * a, 0.2, 0.3) });
    return d + 0.45;
  },
  /** 卷席：草席一圈圈卷起来——草编的窸窣，卷轴一下下压在席上（越卷越沉），末了草绳一勒 */
  matRoll(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.8, 1.0), n = Math.max(12, Math.round(d * 20));
    hiss(v, { dur: d, noise: 'pink', f: 1100, f2: 800, q: 0.8, hp: 400, curve: plateau(n, 0.075 * a, 0.2, 0.2, 0.15), dest: grain(v, t, d, 0.4, 0.6, 0.8) });
    sprinkle(v, { t, dur: d, n: Math.round(d * 70), f: [1200, 4000], t60: [0.003, 0.008], amp: 0.04 * a, noise: 0.6 });
    for (let x = 0.1, gap = 0.16, k = 0.6; x < d - 0.05; x += gap, gap *= 1.15, k = Math.min(1, k * 1.12)) burst(v, { t: t + x, dur: 0.05, f: rand(300, 420), q: 0.9, amp: 0.19 * a * k, att: 0.004, noise: 'pink' });
    creak(v, { t: t + d + 0.1, dur: 0.18, rate: [rand(60, 80), rand(90, 120)], res: [[rand(900, 1200), 6, 1], [2200, 8, 0.3]], amp: 0.03 * a, scrape: 0.6, jitter: 400 });
    return d + 0.5;
  },
  /** 纸鸢起飞、兜住了风：纸面「扑啦啦」一阵急拍（每秒三四十下，越拍越稳），竹骨轻轻一响，带一口风 */
  flutter(v) {
    const c = v.ctx, a = 0.5 + 0.7 * v.vel, t = v.t, d = rand(0.5, 0.75), am = c.createGain(), lfo = c.createOscillator(), dp = c.createGain();
    am.gain.value = 0.5; dp.gain.value = 0.5;
    lfo.type = 'square'; lfo.frequency.setValueAtTime(rand(26, 32), t); lfo.frequency.linearRampToValueAtTime(rand(38, 46), t + d);
    lfo.connect(dp); dp.connect(am.gain); am.connect(v.out);
    lfo.start(t); lfo.stop(t + d + 0.05);
    hiss(v, { dur: d, noise: 'pink', f: 600, fMid: 1300, f2: 900, q: 0.8, hp: 200, curve: curveOf(14, [[0, 0], [0.12, 1], [0.5, 0.6], [1, 0]], 0.2 * a), dest: am });
    hiss(v, { dur: d * 0.8, noise: 'pink', f: 450, f2: 800, q: 0.7, curve: wobble(10, 0.03 * a, 0.4, 0.1) });
    const ex = tap(v, t + d * rand(0.2, 0.5), 0.7, 0.2 * a, 0.3);
    reson(v, ex, rand(1300, 1700), 10, 0.5);
    return d + 0.25;
  },
  /** 纸鸢栽下来：竹骨糊纸的一只轻东西落在草地上——纸面「沙啦」一下、竹骨轻轻一「嗒」、软软一顿，纸角再抖两下 */
  kiteFall(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t;
    hiss(v, { dur: 0.3, f: 2400, fMid: 3200, f2: 1800, q: 0.8, hp: 800, curve: wobble(10, 0.07 * a, 0.2, 0.25), dest: grain(v, t, 0.3, 0.45, 0.55, 0.8) });
    const ex = tap(v, t + 0.02, 0.8, 0.3 * a, 0.35);
    reson(v, ex, rand(1200, 1600), 9, 0.6);
    reson(v, ex, rand(2600, 3100), 10, 0.25);
    burst(v, { t: t + 0.02, dur: 0.07, f: 350, q: 0.8, amp: 0.12 * a, att: 0.005, noise: 'pink' });
    for (let i = 0; i < 2; i++) hiss(v, { t: t + 0.35 + i * rand(0.18, 0.3), dur: 0.12, f: 2800, q: 0.9, hp: 1200, curve: wobble(8, 0.025 * a, 0.3, 0.3) });
    return 1;
  },
  /** 鸢线断了：绷紧的线「嘣」地一下崩断——一个很短、往下掉的弦音（线一松，音高就落），带一点脆响；断头抽回去「嗖」 */
  snap(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, f = rand(380, 520) * v.pitch;
    glide(v, f * 1.4, f * 0.7, 0.06, 0.12 * a, 0.18, 0.0008);
    glide(v, f * 2.8, f * 1.4, 0.05, 0.05 * a, 0.1, 0.0008);
    burst(v, { dur: 0.012, f: 3200, q: 0.8, amp: 0.25 * a, att: 0.0005 });
    hiss(v, { t: t + 0.01, dur: 0.18, f: 4200, f2: 2600, q: 1.2, hp: 1800, curve: wobble(8, 0.03 * a, 0.2, 0.1) });
    return 0.5;
  },
  /** 拍雪：两手把雪团拍实——软软的一两下「噗」（雪被压紧的闷响），带一点细碎的「咯吱」 */
  snowPat(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t;
    let x = 0;
    // 手掌是软的、面大：主要是雪被压紧的那一闷（几百赫兹），「咯吱」只有一点（踩雪的 snowCrunch 正相反）
    for (let i = 0, k = Math.random() < 0.6 ? 2 : 1; i < k; i++) {
      burst(v, { t: t + x, dur: 0.08, f: rand(320, 440), q: 0.8, amp: 0.38 * a * (i ? 0.8 : 1), att: 0.005, noise: 'pink' });
      burst(v, { t: t + x, dur: 0.05, f: rand(800, 1000), q: 0.9, amp: 0.08 * a, att: 0.004, noise: 'pink' });
      crunch(v, t + x + 0.006, rand(0.05, 0.07), 0.25 * a);
      x += rand(0.18, 0.26);
    }
    return x + 0.35;
  },
  /** 船帮碰上栈桥、碰着浅滩：船身是空的，木头「咚」地一声闷响（船腹 120–160Hz、木板 300–400Hz），船底的水晃一晃 */
  boatBump(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, p = v.pitch * rand(0.94, 1.06), ex = tap(v, t, 4.5, 1.4 * a, 0.3);
    reson(v, ex, rand(120, 160) * p, 5, 1.6);
    reson(v, ex, rand(300, 400) * p, 7, 0.8);
    reson(v, ex, rand(850, 1000) * p, 9, 0.25);
    burst(v, { t: t + 0.03, dur: 0.4, type: 'lowpass', f: 700, q: 0.7, amp: 0.12 * a, att: 0.06, noise: 'pink' });
    for (let i = 0; i < 3; i++) { const f = rand(300, 700); bubble(v, t + rand(0.05, 0.35), f, f * 1.6, 0.05, 0.05 * a); }
    return 0.8;
  },
  /** 风铃（dur，默认两三秒）：檐下一串小铜铃，风一过，铃舌东碰一下、西碰一下——先急后缓、一阵一阵的；每个铃一个音（G 宫五声的高处） */
  chime(v) {
    const c = v.ctx, a = 0.5 + 0.7 * v.vel, t = v.t, d = clamp(v.dur ?? rand(1.8, 3), 0.6, 8), p = v.pitch;
    const bells = [...CHIME].sort(() => Math.random() - 0.5).slice(0, 4).map((f, i) => {
      const pan = c.createStereoPanner();
      pan.pan.value = -0.45 + 0.3 * i;
      pan.connect(v.out);
      return { f: f * p * rand(0.99, 1.01), pan };
    });
    const n = Math.max(2, Math.round(d * rand(2.5, 4)));
    for (let i = 0; i < n; i++) {
      // 风一阵来：前头密，后头疏
      const at = t + d * Math.pow(Math.random(), 1.6) * 0.85, b = pick(bells), A = 0.03 * a * rand(0.4, 1), t60 = rand(0.6, 1.1);
      mode(v, b.f, A, t60, 0.0006, b.pan, at);
      mode(v, b.f * 2.43, A * 0.35, t60 * 0.5, 0.0005, b.pan, at);
      mode(v, b.f * 3.91, A * 0.12, t60 * 0.3, 0.0005, b.pan, at);
      mode(v, b.f * 1.004, A * 0.4, t60 * 0.9, 0.0008, b.pan, at);
    }
    return d + 1.2;
  },
  /** 点灯笼：火镰擦火石两三下（「嚓」，亮而短，迸几点火星），火绒着了轻轻一「呼」，点着灯笼里的蜡一点「嗤」，纸灯笼提起来、竹骨与纸一阵轻响 */
  lantern(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t;
    let x = 0;
    for (let i = 0, k = 2 + (Math.random() < 0.5 ? 1 : 0); i < k; i++) {
      burst(v, { t: t + x, dur: 0.035, f: rand(3800, 5200), q: 1.1, amp: 0.16 * a, att: 0.001 });
      mode(v, rand(4200, 6000), 0.012 * a, 0.03, 0.0004, v.out, t + x);
      sprinkle(v, { t: t + x + 0.005, dur: 0.12, n: 4 + Math.floor(rand(0, 5)), f: [5000, 9000], t60: [0.001, 0.003], amp: 0.04 * a, noise: 0.9 });
      x += rand(0.32, 0.5);
    }
    hiss(v, { t: t + x, dur: 0.5, noise: 'pink', f: 500, fMid: 900, f2: 600, q: 0.8, curve: wobble(10, 0.07 * a, 0.4, 0.1) });
    burst(v, { t: t + x + 0.6, dur: 0.3, f: 4800, q: 0.8, amp: 0.04 * a, att: 0.06 });
    hiss(v, { t: t + x + 0.85, dur: 0.4, f: 2800, fMid: 3600, f2: 2400, q: 0.9, hp: 900, curve: wobble(10, 0.04 * a, 0.3, 0.25) });
    sprinkle(v, { t: t + x + 0.9, dur: 0.3, n: 4 + Math.floor(rand(0, 3)), f: [3000, 6500], t60: [0.002, 0.005], amp: 0.03 * a, noise: 0.7 });
    return x + 1.4;
  },
};
