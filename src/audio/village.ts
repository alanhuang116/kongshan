/**
 * 村里的声音：鸡、鸭、鹅、犬、猫、牛、雁、布谷、麻雀；锤、锯、刨、锄、犁、辘轳、橹、网；捣衣、水碓、拨浪鼓、秋千。
 *
 * 禽畜的叫声都是「嗓子」（kit.ts 的 voiced）：一个锯齿波按折线走音高、按折线开合，过并联的几个共振峰——
 *   鸡鸣是四段（喔 · 喔 · 喔—— · 喔——），第三段最高，末一段从高处落下来，落到一半嗓子破了（音高突然掉一截、发毛）；
 *   母鸡是一下一下短的「咯」；鸭是带鼻音、发毛的「嘎」，头一声最长最响；犬吠短而猛，牛哞从鼻音慢慢张开再收。
 * 器具按它怎么发声来搭：木槌敲在木料上是槌头的一下激起板子的几个不成整数倍的共鸣；锯是齿一个个过木头——噪声被齿的快慢调着；
 * 刨是一口长气；锄是土里的一闷；犁、辘轳、橹都有木头粘一下滑一下的吱呀。
 * 远近不在这里管：给 dist（或 at）之后由引擎统一衰减、去高、加回声。
 */
import type { Voice } from './engine';
import { bubble, burst, creak, grain, hiss, mode, plateau, reson, tap, voiced, wobble } from './kit';
import type { Shot } from './types';
import { clamp, lerp, rand } from './util';

// ———————————————————————————— 禽畜 ————————————————————————————
/** 母鸡的一声「咯」；long 是下蛋之后那一声拖长的「哒——」 */
function cluck(v: Voice, t: number, p: number, amp: number, long = false) {
  const d = long ? rand(0.3, 0.42) : rand(0.07, 0.1);
  voiced(v, {
    t,
    f0: long ? [[0, 420 * p], [d * 0.35, 780 * p], [d, 520 * p]] : [[0, 330 * p], [d * 0.4, 470 * p], [d, 360 * p]],
    amp: long ? [[0, 0], [0.025, 1], [d * 0.6, 0.9], [d, 0]] : [[0, 0], [0.012, 1], [d * 0.5, 0.6], [d, 0]],
    formants: [[1050, 4, 1], [2100, 6, -0.6], [3200, 7, 0.3]], tilt: 3200, jitter: 25, breath: 0.1, gain: 0.5 * amp,
  });
}
/** 犬的一声：soft 是近处那种不当真的「呜汪」 */
function bark(v: Voice, t: number, p: number, amp: number, soft: boolean) {
  if (soft) {
    const d = rand(0.2, 0.26);
    voiced(v, { t, f0: [[0, 150 * p], [d * 0.3, 225 * p], [d, 125 * p]], amp: [[0, 0], [0.035, 1], [d * 0.5, 0.7], [d, 0]], formants: [[430, 3, 1], [980, 4, -0.5], [1900, 5, 0.15]], tilt: 1300, breath: 0.5, jitter: 30, gain: 0.6 * amp });
  } else {
    const d = rand(0.11, 0.16);
    voiced(v, { t, f0: [[0, 400 * p], [d * 0.25, 560 * p], [d, 290 * p]], amp: [[0, 0], [0.008, 1], [d * 0.45, 0.6], [d, 0]], formants: [[720, 3, 1], [1350, 4, -0.7], [2400, 5, 0.4]], tilt: 3000, breath: 0.35, jitter: 35, gain: 0.55 * amp });
  }
}
/** 雁（鹅）的一声：前半低，嗓子一翻到高处（「嘎——昂」）；stretch 拉长（家鹅叫得长） */
function honk(v: Voice, t: number, p: number, amp: number, stretch = 1): number {
  const d = rand(0.26, 0.4) * stretch, br = d * rand(0.3, 0.42);
  voiced(v, {
    t, f0: [[0, 330 * p], [br, 400 * p], [br + 0.012, 560 * p], [d * 0.7, 590 * p], [d, 500 * p]],
    amp: [[0, 0], [0.03, 0.7], [br, 0.6], [br + 0.03, 1], [d * 0.75, 0.8], [d, 0]],
    formants: [[1000, 4, 1], [1900, 5, -0.6], [2800, 6, 0.3]], tilt: 3000, jitter: 22, rough: { rate: 46, depth: 0.3 }, gain: 0.4 * amp,
  });
  return d;
}
/** 一只小鸟的一串音：一个振荡器，音高一段段走、幅度一段段开合；fm 给它一点「毛」（麻雀的啾不是纯音） */
function chirps(v: Voice, notes: Array<[number, number, number, number, number, number]>, pan: number, fm?: { rate: number; depth: number }) {
  const c = v.ctx, osc = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner();
  g.gain.setValueAtTime(0, v.t);
  let end = v.t;
  for (const [at, len, f0, fMid, f1, amp] of notes) {
    const a = v.t + at;
    osc.frequency.setValueAtTime(f0, a);
    osc.frequency.exponentialRampToValueAtTime(fMid, a + len * 0.35);
    osc.frequency.exponentialRampToValueAtTime(f1, a + len);
    g.gain.setValueAtTime(0, a);
    g.gain.linearRampToValueAtTime(amp, a + Math.min(0.008, len * 0.25));
    g.gain.linearRampToValueAtTime(amp * 0.7, a + len * 0.6);
    g.gain.linearRampToValueAtTime(0, a + len);
    end = Math.max(end, a + len);
  }
  if (fm) {
    const m = c.createOscillator(), md = c.createGain();
    m.frequency.value = fm.rate; md.gain.value = fm.depth;
    m.connect(md); md.connect(osc.frequency);
    m.start(v.t); m.stop(end + 0.05);
  }
  p.pan.value = pan;
  osc.connect(g); g.connect(p); p.connect(v.out);
  osc.start(v.t); osc.stop(end + 0.05);
  return end - v.t;
}

// ———————————————————————————— 器具 ————————————————————————————
/** 拉锯时轮流的推与拉（没指定 variant 时自己轮） */
let sawPush = false;

type Fn = (v: Voice) => number;
export const VILLAGE_SHOTS: Pick<Record<Shot, Fn>, 'rooster' | 'hen' | 'chick' | 'duck' | 'goose' | 'dog' | 'cat' | 'ox' | 'sparrow' | 'cuckoo' | 'hammer' | 'saw' | 'plane' | 'hoe' | 'plough' | 'bucket' | 'pound' | 'millThump' | 'rattle' | 'swing' | 'oar' | 'net'> = {
  /**
   * 鸡鸣。四段：喔（短，往上）· 喔（短）· 喔——（最高，中间一颤）· 喔——（从高处慢慢落下来，落到六成嗓子破了：
   * 音高突然掉一截，声音发毛，拖着尾巴收掉）。每次的快慢、音高略有不同。远处的那只：dist 给 0.6–0.9（或 variant: 'far'）。
   */
  rooster(v) {
    const p = v.pitch * rand(0.97, 1.03), a = 0.5 + 0.7 * v.vel, k = rand(0.92, 1.1), h = rand(0.95, 1.05);
    const e1 = 0.17 * k, s2 = 0.23 * k, e2 = 0.43 * k, s3 = 0.49 * k, e3 = 1.12 * k, s4 = 1.19 * k, br = 1.78 * k, e4 = 2.22 * k;
    voiced(v, {
      f0: [[0, 430 * p], [e1, 560 * p], [s2, 520 * p], [s2 + 0.08 * k, 650 * p], [e2, 620 * p], [s3, 640 * p], [s3 + 0.12 * k, 830 * p], [s3 + 0.3 * k, 850 * p],
        [s3 + 0.4 * k, 770 * p], [s3 + 0.5 * k, 860 * p], [e3, 840 * p], [s4, 890 * p], [s4 + 0.25 * k, 870 * p], [br, 650 * p], [br + 0.012, 470 * p], [e4, 350 * p]],
      amp: [[0, 0], [0.02, 0.8], [e1 - 0.03, 0.7], [e1 + 0.02, 0.1], [s2, 0.1], [s2 + 0.025, 0.9], [e2 - 0.03, 0.8], [e2 + 0.02, 0.12], [s3, 0.12], [s3 + 0.04, 1], [e3 - 0.04, 1],
        [e3 + 0.025, 0.15], [s4, 0.15], [s4 + 0.04, 1], [br - 0.03, 0.8], [br, 0.45], [br + 0.05, 0.6], [e4 - 0.15, 0.3], [e4, 0]],
      formants: [[1150 * h, 4, 1], [2350 * h, 6, -0.7], [3600 * h, 8, 0.35]], tilt: 4200, jitter: 16, direct: 0.12,
      rough: { rate: 64, depth: 0.5, from: br, to: e4 }, gain: 0.5 * a,
    });
    return e4 + 0.3;
  },
  /** 母鸡：两到五声「咯」，疏密不匀。variant: 'egg' 是下了蛋之后那一串——「咯咯咯咯——哒！」 */
  hen(v) {
    const p = v.pitch * rand(0.92, 1.08), a = 0.5 + 0.7 * v.vel;
    let t = v.t;
    if (v.raw.variant === 'egg') {
      for (let r = 0, reps = Math.random() < 0.5 ? 2 : 1; r < reps; r++) {
        for (let i = 0, n = 4 + Math.floor(rand(0, 3)); i < n; i++) { cluck(v, t, p * (1 + 0.02 * i), a * (0.6 + 0.08 * i)); t += rand(0.15, 0.2); }
        cluck(v, t, p * 1.1, a * 1.1, true);
        t += rand(0.6, 0.8);
      }
      return t - v.t + 0.2;
    }
    for (let i = 0, n = 2 + Math.floor(rand(0, 4)); i < n; i++) { cluck(v, t, p * rand(0.96, 1.05), a * rand(0.6, 1)); t += rand(0.2, 0.5) * (i % 2 ? 0.7 : 1); }
    return t - v.t + 0.3;
  },
  /** 小鸡：三到六声往下滑的「叽」，细而软 */
  chick(v) {
    const a = 0.1 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.92, 1.1), c = v.ctx;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'triangle';
    g.gain.setValueAtTime(0, v.t);
    let t = v.t;
    for (let i = 0, n = 3 + Math.floor(rand(0, 4)); i < n; i++) {
      const f = rand(3900, 4600) * p, len = rand(0.08, 0.12), amp = a * rand(0.6, 1);
      osc.frequency.setValueAtTime(f * 0.88, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.015);
      osc.frequency.exponentialRampToValueAtTime(f * rand(0.64, 0.72), t + len);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.012);
      g.gain.linearRampToValueAtTime(amp * 0.6, t + len * 0.7);
      g.gain.linearRampToValueAtTime(0, t + len);
      t += len + rand(0.07, 0.2);
    }
    osc.connect(g); g.connect(v.out);
    osc.start(v.t); osc.stop(t + 0.05);
    return t - v.t + 0.2;
  },
  /** 鸭：三到六声「嘎」。头一声最长最响，后面一声比一声轻、一声比一声低——有点好笑，但是轻的 */
  duck(v) {
    const p = v.pitch * rand(0.94, 1.06), a = 0.5 + 0.7 * v.vel, n = 3 + Math.floor(rand(0, 4));
    let t = v.t;
    for (let i = 0; i < n; i++) {
      const d = i === 0 ? rand(0.22, 0.3) : rand(0.13, 0.19), f = (250 - 6 * i) * p;
      voiced(v, {
        t, f0: [[0, f * 1.08], [d * 0.3, f], [d, f * 0.92]], amp: [[0, 0], [0.015, 1], [d - 0.04, 0.85], [d, 0]],
        formants: [[980, 5, 1], [1750, 6, -0.6], [2900, 7, 0.5]], tilt: 3600, jitter: 20, rough: { rate: rand(58, 72), depth: 0.45 },
        gain: 0.45 * a * (i === 0 ? 1 : lerp(0.8, 0.4, i / n)),
      });
      t += d + (i === 0 ? rand(0.1, 0.16) : rand(0.06, 0.11));
    }
    return t - v.t + 0.2;
  },
  /** 犬。不给 variant：两三声吠（没给 dist 时按远处的算）；'woof'：近处一声轻的「呜汪」，不当真 */
  dog(v) {
    // 没说哪一样时看远近：就在跟前的（那条看得见的狗冲人叫）是轻轻一声「呜汪」，远处的才是两三声吠；'bark' 是不管远近都吠
    const p = v.pitch * rand(0.9, 1.1), a = 0.5 + 0.7 * v.vel, soft = v.raw.variant === 'woof' || (v.raw.variant == null && v.dist < 0.12);
    const n = soft ? (Math.random() < 0.3 ? 2 : 1) : 2 + (Math.random() < 0.35 ? 1 : 0);
    let t = v.t;
    for (let i = 0; i < n; i++) {
      bark(v, t, p * rand(0.97, 1.03), a * (i ? rand(0.75, 0.95) : 1), soft);
      t += soft ? rand(0.3, 0.4) : i === 1 ? rand(0.5, 0.8) : rand(0.26, 0.36);
    }
    return t - v.t + 0.3;
  },
  /** 牛。不给 variant：一声低低的「哞——」（从鼻音慢慢张开，音高先扬后落）；'breath'：喷一口气 */
  ox(v) {
    const a = 0.5 + 0.7 * v.vel, p = v.pitch * rand(0.93, 1.07);
    if (v.raw.variant === 'breath') {
      const d = rand(0.45, 0.6), n = 28, curve = new Float32Array(n);
      // 鼻翼抖几下再顺出去
      for (let i = 0; i < n; i++) { const u = i / (n - 1), x = u * d; curve[i] = Math.min(1, u / 0.1) * Math.pow(1 - u, 1.4) * (x < 0.22 ? 0.75 + 0.25 * Math.sin(Math.PI * 2 * 24 * x) : 1); }
      curve[0] = 0; curve[n - 1] = 0;
      const k = (g: number) => curve.map((x) => x * g) as Float32Array<ArrayBuffer>;
      hiss(v, { dur: d, noise: 'pink', f: 620, f2: 330, q: 0.6, hp: 140, curve: k(0.8 * a) });
      hiss(v, { dur: d, noise: 'pink', f: 420, q: 2, curve: k(0.35 * a) });
      return d + 0.2;
    }
    const d = rand(1.3, 1.9);
    voiced(v, {
      f0: [[0, 104 * p], [d * 0.22, 132 * p], [d * 0.5, 150 * p], [d * 0.8, 126 * p], [d, 98 * p]],
      amp: [[0, 0], [0.22, 0.45], [d * 0.4, 1], [d * 0.7, 0.9], [d, 0]],
      formants: [[[[0, 290], [d * 0.35, 470], [d * 0.75, 430], [d, 320]], 3.5, 1], [[[0, 780], [d * 0.4, 1020], [d, 760]], 5, -0.6], [2300, 6, 0.18]],
      tilt: 1700, jitter: 14, breath: 0.12, direct: 0.2, gain: 0.5 * a,
    });
    return d + 0.3;
  },
  /** 两只麻雀吵一阵：你一声我一声，越吵越急，末了各补一声 */
  sparrow(v) {
    const a = 0.1 * (0.5 + 0.7 * v.vel), birds = [{ p: rand(0.95, 1.05) * v.pitch, notes: [] as Array<[number, number, number, number, number, number]> }, { p: rand(1.08, 1.18) * v.pitch, notes: [] as Array<[number, number, number, number, number, number]> }];
    const add = (who: number, at: number, amp: number) => { const b = birds[who], len = rand(0.045, 0.075); b.notes.push([at, len, 3300 * b.p, rand(4400, 5000) * b.p, rand(2800, 3200) * b.p, amp]); return len; };
    let t = 0, who = 0, gap = rand(0.1, 0.14);
    for (let i = 0, n = 8 + Math.floor(rand(0, 7)); i < n; i++) { t += add(who, t, a * rand(0.6, 1)) + gap * rand(0.6, 1.2); if (Math.random() < 0.75) who = 1 - who; gap *= 0.96; }
    t += rand(0.15, 0.3); t += add(0, t, a * 0.8) + rand(0.2, 0.4); t += add(1, t, a * 0.6);
    birds.forEach((b, i) => { if (b.notes.length) chirps(v, b.notes, i ? 0.25 : -0.25, { rate: rand(190, 260), depth: 420 }); });
    return t + 0.2;
  },
  /** 布谷：两个音，下行小三度，圆而空。variant: 'x3' 连叫三声。没给 dist 时按远处的算 */
  cuckoo(v) {
    const a = 0.22 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.97, 1.04), c = v.ctx, n = v.raw.variant === 'x3' ? 3 : 1;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1600; lp.Q.value = 0.5;
    lp.connect(v.out);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'triangle';
    g.gain.setValueAtTime(0, v.t);
    let t = v.t;
    for (let k = 0; k < n; k++) {
      for (const [at, len, f0, f1, amp] of [[0, 0.17, 642, 630, 1], [0.31, 0.27, 512, 498, 0.9]] as const) {
        osc.frequency.setValueAtTime(f0 * p, t + at);
        osc.frequency.linearRampToValueAtTime(f1 * p, t + at + len);
        g.gain.setValueAtTime(0, t + at);
        g.gain.linearRampToValueAtTime(a * amp, t + at + 0.03);
        g.gain.setValueAtTime(a * amp, t + at + len - 0.07);
        g.gain.linearRampToValueAtTime(0, t + at + len);
      }
      t += rand(1.2, 1.32);
    }
    osc.connect(g); g.connect(lp);
    osc.start(v.t); osc.stop(t + 0.1);
    return t - v.t + 0.3;
  },
  /**
   * 鹅 / 雁。不给 variant：家鹅一两声「嘎——」（比雁低、长）；'hiss'：伸着脖子「嘶——」地吓人；
   * 'wild'：天上过雁——两到五声，像是两只一先一后，一只高一些（没给远近时按远处的算；雁那一层用的就是它）。
   */
  goose(v) {
    const p = v.pitch * rand(0.94, 1.06), a = 0.5 + 0.7 * v.vel, kind = v.raw.variant;
    let t = v.t;
    if (kind === 'hiss') {
      const d = rand(0.6, 0.9), n = Math.round(d * 24);
      hiss(v, { dur: d, f: 3400, fMid: 4300, f2: 3000, q: 1.1, hp: 1500, curve: wobble(n, 0.06 * a, 0.3, 0.12) });
      hiss(v, { dur: d, noise: 'pink', f: 1100, q: 1.5, curve: wobble(n, 0.035 * a, 0.3, 0.12) });
      return d + 0.2;
    }
    if (kind === 'wild') for (let i = 0, n = 2 + Math.floor(rand(0, 4)); i < n; i++) t += honk(v, t, p * (i % 2 ? 1.13 : 1) * rand(0.98, 1.02), a * rand(0.6, 1)) + rand(0.2, 0.75);
    else for (let i = 0, n = Math.random() < 0.5 ? 2 : 1; i < n; i++) t += honk(v, t, p * 0.82 * rand(0.98, 1.02), a * (i ? 0.8 : 1), 1.35) + rand(0.25, 0.5);
    return t - v.t + 0.3;
  },
  /** 猫：一声软软的「喵——」（嘴从闭到开再收：咪—啊—呜），音高先扬后落 */
  cat(v) {
    const p = v.pitch * rand(0.9, 1.12), a = 0.5 + 0.7 * v.vel, d = rand(0.5, 0.8);
    voiced(v, {
      f0: [[0, 520 * p], [d * 0.25, 720 * p], [d * 0.55, 690 * p], [d, 470 * p]],
      amp: [[0, 0], [0.06, 0.5], [d * 0.35, 1], [d * 0.65, 0.8], [d, 0]],
      formants: [[[[0, 380], [d * 0.2, 420], [d * 0.5, 950], [d, 520]], 4, 1], [[[0, 2500], [d * 0.25, 2700], [d * 0.55, 1650], [d, 1000]], 6, -0.55], [3600, 8, 0.2]],
      tilt: 2600, jitter: 12, breath: 0.15, direct: 0.1, gain: 0.16 * a,
    });
    return d + 0.25;
  },

  /**
   * 木槌敲在木料上（修桥：敲榫、敲板）。槌头的一下（力度大则接触短、更亮）激起：
   * 一声低的「咚」（料身）、板子自己的几个共鸣（不成整数倍：1、2.76、5.4——这就是板子的「嗡」）、槌头的一点「笃」。每一下的音高略有不同。
   */
  hammer(v) {
    const vel = v.vel, a = 2.6 * Math.pow(vel, 1.15) * rand(0.9, 1.1), p = v.pitch * rand(0.97, 1.03), f1 = rand(430, 520) * p;
    const ex = tap(v, v.t, 2.4 - 1.1 * vel, a, 0.22);
    reson(v, ex, rand(190, 240) * p, 6, 1.4);
    reson(v, ex, f1, 28, 1.3);
    reson(v, ex, f1 * 2.76, 30, 0.6 * (0.5 + 0.5 * vel));
    reson(v, ex, f1 * 5.4, 25, 0.25 * vel);
    reson(v, ex, 900 * p, 6, 0.5);
    const hp = v.ctx.createBiquadFilter(), hg = v.ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 2500; hg.gain.value = 0.035 * vel;
    ex.connect(hp); hp.connect(hg); hg.connect(v.out);
    return 0.6;
  },
  /**
   * 拉一下锯（dur）。variant: 'push'（推：重、亮）/ 'pull'（拉：轻、暗）；不给就一推一拉轮着来。
   * 齿一个个过木头：噪声的幅度被一个锯齿波调着，快慢随这一下的速度先快后慢；板子在 500Hz 上下跟着响。
   */
  saw(v) {
    const push = v.raw.variant ? v.raw.variant === 'push' : (sawPush = !sawPush);
    const c = v.ctx, t = v.t, d = Math.max(0.2, v.dur ?? (push ? 0.42 : 0.36)), a = (0.5 + 0.7 * v.vel) * (push ? 1 : 0.7), n = Math.max(10, Math.round(d * 30));
    // 齿：每秒一百多个，随速度变
    const teeth = c.createGain(), lfo = c.createOscillator(), dp = c.createGain(), r = rand(0.9, 1.1);
    teeth.gain.value = 0.55; dp.gain.value = 0.45;
    lfo.type = 'sawtooth';
    lfo.frequency.setValueAtTime(95 * r, t);
    lfo.frequency.linearRampToValueAtTime(170 * r, t + d * 0.45);
    lfo.frequency.linearRampToValueAtTime(110 * r, t + d);
    lfo.connect(dp); dp.connect(teeth.gain);
    lfo.start(t); lfo.stop(t + d + 0.05);
    const body = c.createGain();
    body.gain.value = 1;
    teeth.connect(body); body.connect(v.out);
    hiss(v, { dur: d, f: push ? 2600 : 1900, q: 1.2, curve: wobble(n, 0.12 * a, 0.4, 0.08), dest: teeth });
    hiss(v, { dur: d, noise: 'pink', f: 720, q: 1.5, curve: wobble(n, 0.1 * a, 0.4, 0.08), dest: teeth });
    reson(v, teeth, rand(480, 560), 6, 0.5);
    return d + 0.12;
  },
  /** 刨一下（dur，默认 0.7 秒）：一口长而匀的「唰——」，刨花卷起来时往上扬一点，末了刨子离了木头轻轻一「嗒」 */
  plane(v) {
    const t = v.t, d = Math.max(0.3, v.dur ?? 0.7), a = 0.5 + 0.7 * v.vel, n = Math.max(10, Math.round(d * 26));
    const am = grain(v, t, d, 0.8, 0.2, 0.3);
    hiss(v, { dur: d, f: 3000, f2: 3800, q: 1, curve: plateau(n, 0.085 * a, 0.25, 0.12, 0.06), dest: am });
    hiss(v, { dur: d, noise: 'pink', f: 1100, q: 2, curve: plateau(n, 0.11 * a, 0.25, 0.12, 0.06), dest: am });
    hiss(v, { dur: d, noise: 'pink', f: 300, q: 4, curve: plateau(n, 0.12 * a, 0.3, 0.15, 0.05) });
    const ex = tap(v, t + d, 1.5, 0.35 * a, 0.3);
    reson(v, ex, 1200, 5, 0.6);
    reson(v, ex, 380, 6, 0.8);
    return d + 0.25;
  },
  /** 一锄下去：土里的一闷，土块碎开的一点沙，几粒土滚下来 */
  hoe(v) {
    const a = (0.5 + 0.7 * v.vel) * rand(0.85, 1.1), t = v.t;
    mode(v, rand(100, 130), 0.4 * a, 0.11, 0.006);
    burst(v, { dur: 0.12, f: 300, f2: 170, q: 0.8, amp: 1.1 * a, att: 0.006, noise: 'pink' });
    burst(v, { t: t + 0.01, dur: 0.1, f: rand(1400, 2400), q: 0.8, amp: 0.05 * a, att: 0.012 });
    for (let i = 0, n = 3 + Math.floor(rand(0, 3)); i < n; i++) burst(v, { t: t + rand(0.04, 0.2), dur: rand(0.004, 0.007), f: rand(1800, 4200), q: 1.5, amp: 0.02 * a * rand(0.4, 1), att: 0.0008 });
    return 0.4;
  },
  /** 犁地（dur，默认 2.6 秒）：土被翻开的一路闷响（有颗粒），犁辕与轭吱呀两三声，牛蹄一下一下踩在松土里 */
  plough(v) {
    const t = v.t, d = Math.max(1, v.dur ?? 2.6), a = 0.5 + 0.7 * v.vel, n = Math.max(16, Math.round(d * 14));
    const am = grain(v, t, d, 0.55, 0.45, 0.25);
    hiss(v, { dur: d, noise: 'brown', type: 'lowpass', f: 520, q: 0.6, curve: plateau(n, 0.5 * a, 0.16, 0.2, 0.12), dest: am });
    hiss(v, { dur: d, f: 1800, q: 0.7, curve: plateau(n, 0.03 * a, 0.2, 0.25, 0.15), dest: am });
    for (let i = 0, k = Math.max(1, Math.round(d / 1.1)); i < k; i++) {
      creak(v, { t: t + (i + rand(0.2, 0.7)) * (d / k) * 0.85, dur: rand(0.25, 0.45), rate: [rand(28, 36), rand(38, 50)], res: [[rand(340, 420), 10, 1], [rand(850, 980), 12, 0.5]], amp: 0.1 * a, scrape: 0.3 });
    }
    for (let x = rand(0.1, 0.4); x < d - 0.2; x += rand(0.62, 0.8)) burst(v, { t: t + x, dur: 0.09, type: 'lowpass', f: rand(150, 210), q: 0.7, amp: 0.2 * a, att: 0.008, noise: 'pink' });
    return d + 0.2;
  },
  /**
   * 井上打水。不给 variant：辘轳吱呀吱呀转三四下，然后桶落到井底的一声水响（三秒多）；
   * 'creak' 只要辘轳；'splash' 只要桶落水（井筒里闷闷的一「嗵」，带一点回声）。
   */
  bucket(v) {
    const a = 0.5 + 0.7 * v.vel, c = v.ctx, kind = v.raw.variant;
    let t = v.t;
    if (kind !== 'splash') {
      for (let i = 0, n = kind === 'creak' ? 2 + Math.floor(rand(0, 2)) : 3 + Math.floor(rand(0, 2)); i < n; i++) {
        const d = rand(0.35, 0.5), up = i % 2 === 0;
        creak(v, { t, dur: d, rate: up ? [rand(36, 42), rand(55, 64)] : [rand(52, 60), rand(34, 40)], res: [[520, 9, 1], [1150, 12, 0.6], [1900, 10, 0.25]], amp: 0.2 * a * rand(0.8, 1.1), scrape: 0.2 });
        t += d + rand(0.18, 0.3);
      }
      if (kind === 'creak') return t - v.t + 0.2;
      t += 0.15;
    }
    // 井筒：水声在里面来回撞——两个低的共鸣，外加一道很近的回声
    const well = c.createGain(), dl = c.createDelay(0.2), fb = c.createGain(), lp = c.createBiquadFilter();
    well.gain.value = 1; dl.delayTime.value = 0.055; fb.gain.value = 0.35;
    lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.5;
    well.connect(v.out); well.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(v.out);
    bubble(v, t, 180, 420, 0.1, 0.25 * a, well);
    burst(v, { t, dur: 0.35, type: 'lowpass', f: 1400, f2: 500, q: 0.7, amp: 0.3 * a, att: 0.02, dest: well });
    burst(v, { t, dur: 0.3, f: 210, q: 14, amp: 0.5 * a, att: 0.01, noise: 'pink', dest: well });
    burst(v, { t, dur: 0.25, f: 430, q: 12, amp: 0.3 * a, att: 0.01, noise: 'pink', dest: well });
    for (let i = 0; i < 3; i++) { const f = rand(350, 800); bubble(v, t + rand(0.12, 0.5), f, f * 1.6, 0.04, 0.05 * a, well); }
    return t - v.t + 1.2;
  },
  /** 摇一下橹：木头在橹桩上「咿——呀」两声（一扬一落），接着橹叶拨开水的一口气，几个泡 */
  oar(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t, d1 = rand(0.35, 0.45), d2 = rand(0.45, 0.55), p = v.pitch * rand(0.94, 1.06);
    creak(v, { t, dur: d1, rate: [45, 70], res: [[620 * p, 10, 1], [1400 * p, 12, 0.5]], amp: 0.24 * a, scrape: 0.2 });
    creak(v, { t: t + d1 + 0.15, dur: d2, rate: [60, 35], res: [[520 * p, 10, 1], [1200 * p, 12, 0.5]], amp: 0.2 * a, scrape: 0.2 });
    const tw = t + d1 + d2 + 0.2;
    burst(v, { t: tw, dur: 0.7, f: 700, q: 0.8, amp: 0.12 * a, att: 0.25, noise: 'pink' });
    for (let i = 0, n = 3 + Math.floor(rand(0, 3)); i < n; i++) { const f = rand(400, 900); bubble(v, tw + rand(0.1, 0.6), f, f * 1.5, 0.04, 0.03 * a); }
    return d1 + d2 + 1.2;
  },
  /** 撒网：网落在水面上湿湿的一「唰」（许多网坠同时入水），底下一拍，随后一片细碎的水珠，网沉下去的一点沙 */
  net(v) {
    const a = 0.5 + 0.7 * v.vel, t = v.t;
    burst(v, { dur: 0.28, f: 2800, q: 0.5, amp: 0.3 * a, att: 0.012 });
    burst(v, { dur: 0.06, type: 'lowpass', f: 420, q: 0.7, amp: 0.3 * a, att: 0.006, noise: 'pink' });
    for (let i = 0, n = 14 + Math.floor(rand(0, 10)); i < n; i++) { const f = rand(1200, 3500); bubble(v, t + 0.04 + Math.pow(Math.random(), 1.5) * 0.6, f, f * 1.4, rand(0.015, 0.025), a * rand(0.02, 0.05)); }
    hiss(v, { t: t + 0.1, dur: 0.5, f: 2600, q: 0.8, curve: wobble(12, 0.03 * a, 0.3, 0.2) });
    return 1;
  },
  /** 捣衣的一杵：木杵打在青石上的湿衣裳——闷而湿的一「啪」，底下石头很死的一应，溅起一点水。一下一下由世界去叫 */
  pound(v) {
    const a = (0.5 + 0.7 * v.vel) * rand(0.88, 1.1), t = v.t;
    // 湿布：中间一拍，起得快收得快，不脆
    burst(v, { dur: 0.07, f: rand(900, 1300), q: 0.7, amp: 0.5 * a, att: 0.003, noise: 'pink' });
    burst(v, { dur: 0.05, f: rand(2200, 3000), q: 0.8, amp: 0.07 * a, att: 0.003 });
    // 杵与石：一闷
    burst(v, { dur: 0.09, f: rand(200, 260), q: 0.9, amp: 1.5 * a, att: 0.004, noise: 'pink' });
    const ex = tap(v, t, 2.6, 0.9 * a, 0.2);
    reson(v, ex, rand(330, 390), 7, 0.9);
    reson(v, ex, rand(120, 150), 5, 1.2);
    for (let i = 0, n = 2 + Math.floor(rand(0, 2)); i < n; i++) { const f = rand(900, 2200); bubble(v, t + rand(0.02, 0.12), f, f * 1.4, 0.02, 0.025 * a); }
    return 0.45;
  },
  /** 水碓落一下：粗木头的碓头砸进石臼里的谷子——沉的一「咚」，木头空空的一应，谷壳被砸开又落回去的一阵干沙 */
  millThump(v) {
    const a = (0.5 + 0.7 * v.vel) * rand(0.9, 1.08), t = v.t;
    // 最低的那一下（小喇叭放不出来）之外，两三百赫兹上也要有东西
    mode(v, rand(78, 92), 0.3 * a, 0.2, 0.008);
    burst(v, { dur: 0.14, f: rand(190, 250), q: 0.8, amp: 2.4 * a, att: 0.006, noise: 'pink' });
    const ex = tap(v, t, 3.2, 1.3 * a, 0.2);
    reson(v, ex, rand(170, 200), 6, 1.2);
    reson(v, ex, rand(400, 460), 8, 1.1);
    burst(v, { t: t + 0.005, dur: 0.09, f: rand(1300, 2200), q: 0.7, amp: 0.1 * a, att: 0.006 });
    hiss(v, { t: t + 0.06, dur: 0.32, f: 3200, f2: 2300, q: 0.8, hp: 1400, curve: wobble(10, 0.02 * a, 0.25, 0.3), dest: grain(v, t + 0.06, 0.32, 0.5, 0.5, 0.8) });
    return 0.7;
  },
  /**
   * 货郎的拨浪鼓：柄一搓，两颗小槌一左一右打在两面鼓皮上——「卜楞、卜楞」，每一搓两下，搓四到六回（dur，默认 0.6–1 秒）。
   * 两面鼓皮音高差一点；每一下是鼓皮很短的一声（略往下滑）加小槌的一点「嗒」。十来下直接算进一段波形里。
   */
  rattle(v) {
    const a = 0.2 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.94, 1.06), d = clamp(v.dur ?? rand(0.6, 1), 0.3, 2.5), sr = v.ctx.sampleRate, TAU = Math.PI * 2;
    const len = Math.floor(sr * (d + 0.25)), b = v.ctx.createBuffer(1, len, sr), x = b.getChannelData(0), heads = [rand(400, 450) * p, rand(470, 530) * p];
    const hit = (at: number, f: number, g: number) => {
      const i0 = Math.floor(at * sr), m = Math.min(len - i0, Math.floor(sr * 0.14)), tick = rand(2300, 2900);
      let ph = 0, ph2 = 0;
      for (let j = 0; j < m; j++) {
        const u = j / sr, fj = f * (1 + 0.12 * Math.exp(-u / 0.012));
        ph += (TAU * fj) / sr; ph2 += (TAU * fj * 1.59) / sr;
        x[i0 + j] += g * Math.min(1, j / (sr * 0.0015)) * (Math.sin(ph) * Math.exp(-u / 0.02) + 0.35 * Math.sin(ph2) * Math.exp(-u / 0.012) + 0.18 * Math.sin(TAU * tick * u) * Math.exp(-u / 0.003) + 0.25 * (Math.random() * 2 - 1) * Math.exp(-u / 0.004));
      }
    };
    for (let at = 0, period = rand(0.15, 0.18); at < d; at += period * rand(0.92, 1.1)) {
      hit(at, heads[0], a * rand(0.7, 1));
      hit(at + rand(0.04, 0.055), heads[1], a * rand(0.65, 0.9));
    }
    const s = v.ctx.createBufferSource();
    s.buffer = b;
    s.connect(v.out);
    s.start(v.t);
    return d + 0.3;
  },
  /** 秋千荡一个来回（dur，默认两秒半）：绳子与横枝吃住劲时「吱——」的一声，荡回来又是一声，低而慢 */
  swing(v) {
    const a = 0.5 + 0.7 * v.vel, d = clamp(v.dur ?? rand(2.4, 2.9), 1.4, 5), p = v.pitch * rand(0.92, 1.08), t = v.t;
    creak(v, { t, dur: d * 0.3, rate: [rand(14, 18), rand(24, 30)], res: [[310 * p, 8, 1], [720 * p, 10, 0.6], [1350 * p, 9, 0.2]], amp: 0.22 * a, jitter: 220, scrape: 0.35 });
    creak(v, { t: t + d * 0.5, dur: d * 0.26, rate: [rand(22, 28), rand(13, 17)], res: [[280 * p, 8, 1], [650 * p, 10, 0.55], [1250 * p, 9, 0.18]], amp: 0.17 * a, jitter: 220, scrape: 0.35 });
    return d + 0.2;
  },
};
