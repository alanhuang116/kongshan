/**
 * 一击的声音的总表。每个函数把节点接到 v.out，返回这一击大约多久之后可以拆线（秒）。
 *
 *   书房与院里 —— study.ts（纸笔墨、茶酒、门、露水、落水……）、qin.ts（抚琴）
 *   村里       —— village.ts（鸡犬牛鸭鹅猫、锤锯刨锄犁、辘轳橹网、捣衣水碓、拨浪鼓秋千）、recite.ts（书声）、flute.ts（牧笛）
 *   天上       —— sky.ts（远雷、一阵风）
 *   脚步       —— steps.ts
 *   界面       —— 这里（tick / open / close）
 *   旧         —— 这里：空山留下来的寺里的声音（钟、磬、木鱼、鼓、念珠、签、风铎）。新的场景不用它们；
 *                 界面那一层迁完之前还有地方会调到（入山那一声钟），所以留着。
 *
 * 搭声音用的零件在 kit.ts。
 */
import type { Voice } from './engine';
import { EXTRA_SHOTS } from './extra';
import { fluteShot } from './flute';
import { burst, glide, mode, partials, reson, tap } from './kit';
import { qinShot } from './qin';
import { reciteShot } from './recite';
import { SKY_SHOTS } from './sky';
import { STEP_SHOTS } from './steps';
import { STUDY_SHOTS } from './study';
import type { Shot } from './types';
import { pick, rand } from './util';
import { VILLAGE_SHOTS } from './village';

type Fn = (v: Voice) => number;

const UI_SHOTS: Pick<Record<Shot, Fn>, 'tick' | 'open' | 'close'> = {
  /** 界面上最轻的一下：两片竹木相碰 */
  tick(v) {
    const a = 0.1 * (0.5 + 0.7 * v.vel), p = v.pitch * rand(0.97, 1.03);
    mode(v, 1900 * p, a, 0.018, 0.0005);
    mode(v, 720 * p, a * 0.6, 0.022, 0.0008);
    burst(v, { dur: 0.004, type: 'highpass', f: 4000, amp: a * 0.5, att: 0.0004 });
    return 0.12;
  },
  /** 打开一层界面：纸页往上的一声 */
  open(v) {
    burst(v, { dur: 0.2, f: 1300, f2: 2900, q: 0.8, amp: 0.62 * (0.5 + 0.7 * v.vel), att: 0.06, noise: 'pink' });
    return 0.3;
  },
  /** 收起：往下的一声 */
  close(v) {
    burst(v, { dur: 0.16, f: 2600, f2: 1100, q: 0.8, amp: 0.66 * (0.5 + 0.7 * v.vel), att: 0.03, noise: 'pink' });
    return 0.26;
  },
};

/** 风铎的音高：G 宫的五声（G6 A6 B6 D7 E7） */
const WINDBELL = [1567.98, 1760, 1975.53, 2349.32, 2637.02];

/**
 * 旧：寺里的器物。
 *   金属（钟、磬、引磬、风铎）＝ 一组不成整数倍的分音，各自指数衰减，低的长、高的短；相近的两个分音拍出「嗡——嗡——」；
 *   木与竹（木鱼、签、珠）＝ 槌头的一下激起几个高 Q 的共鸣，几十毫秒就没了；
 *   皮（鼓）＝ 下滑的基模加几个不成整数倍的膜模，再加鼓腔里的一团低噪声。
 */
const LEGACY_SHOTS: Pick<Record<Shot, Fn>, 'bell' | 'qing' | 'chime' | 'muyu' | 'drum' | 'drumrim' | 'bead' | 'beadturn' | 'sticks' | 'stickfall' | 'windbell'> = {
  /**
   * 大铜钟。嗡音 98Hz（G2），分音取梵钟一类「2.0、2.8、3.4、4.1、5.4…」的非谐结构（不是西洋钟的小三度）；
   * 前六个分音各是一对，差 0.55–3Hz，拍出起伏；撞木是木头，起音软：低通噪声的一闷 + 一个很低的「咚」。
   */
  bell(v) {
    const f0 = 98 * v.pitch, vel = v.vel;
    partials(v, f0, 0.62 * Math.pow(vel, 1.25), [
      [1.0, 1.0, 24, 0.55, 0.045],
      [2.03, 0.78, 17, 0.9, 0.025],
      [2.78, 0.82, 12, 1.3, 0.014],
      [3.42, 0.4, 8.5, 1.9, 0.01],
      [4.13, 0.45, 6.5, 2.4, 0.008],
      [5.43, 0.27, 4.2, 3.1, 0.006],
      [6.72, 0.13, 2.8, 0, 0.005],
      [8.11, 0.09, 1.9, 0, 0.004],
      [9.63, 0.05, 1.2, 0, 0.004],
      [11.4, 0.03, 0.8, 0, 0.003],
    ], 0.3);
    burst(v, { dur: 0.11, type: 'lowpass', f: 620, f2: 170, q: 0.7, amp: 0.8 * vel, att: 0.004, noise: 'pink' });
    mode(v, 61 * v.pitch, 0.3 * vel, 0.16, 0.005);
    burst(v, { dur: 0.05, f: 2600, q: 1.2, amp: 0.05 * vel * vel, att: 0.002 });
    return 27;
  },
  /** 大磬（钵形铜磬；原先叫 bowl，现在 bowl 是茶碗）。基音 246.9Hz（B3），分音约 1 : 2.71 : 5.12 : 8.07 : 11.6；包布木槌，起音是很轻的一点 */
  qing(v) {
    const f0 = 246.94 * v.pitch, vel = v.vel;
    partials(v, f0, 0.55 * Math.pow(vel, 1.2), [
      [1.0, 1.0, 11, 0.7, 0.006],
      [2.71, 0.55, 7, 1.6, 0.004],
      [5.12, 0.3, 4, 2.7, 0.003],
      [8.07, 0.16, 2.2, 0, 0.002],
      [11.6, 0.08, 1.2, 0, 0.002],
      [15.3, 0.04, 0.7, 0, 0.002],
    ], 0.25, 1);
    burst(v, { dur: 0.02, f: 2200, q: 1.5, amp: 0.14 * vel, att: 0.001 });
    mode(v, 320 * v.pitch, 0.12 * vel, 0.05, 0.002);
    return 12.5;
  },
  /** 引磬（手持小磬，铁签敲）。基音 1174.7Hz（D6），清亮，余音约四秒 */
  chime(v) {
    const f0 = 1174.66 * v.pitch, vel = v.vel;
    partials(v, f0, 0.48 * Math.pow(vel, 1.2), [
      [1.0, 1.0, 4.5, 1.4, 0.0015],
      [2.72, 0.5, 2.6, 3.2, 0.001],
      [5.18, 0.22, 1.3, 0, 0.001],
      [8.2, 0.08, 0.6, 0, 0.001],
    ], 0.2, 1);
    burst(v, { dur: 0.008, type: 'highpass', f: 5200, amp: 0.14 * vel, att: 0.0005 });
    return 5.5;
  },
  /**
   * 木鱼。槌头的一下激起三个共鸣：空腔（约 432Hz，余音 0.11 秒）、木体（1.62 倍、2.74 倍），
   * 再加一个从高处很快滑下来的正弦，就是那声「笃」。力度大则接触时间短、更亮；每次音高与力度略有不同。
   */
  muyu(v) {
    const p = v.pitch * (1 + rand(-0.015, 0.015)), f1 = 432 * p, k = 1 / Math.sqrt(v.pitch), vel = v.vel;
    const a = 3.4 * Math.pow(vel, 1.2) * rand(0.93, 1.07);
    const ex = tap(v, v.t, 2.3 - 1.2 * vel, a, 0.22);
    reson(v, ex, f1, 21 * k, 2.6);
    reson(v, ex, f1 * 1.62, 20 * k, 1.5);
    reson(v, ex, f1 * 2.74, 22 * k, 1.1 * (0.4 + 0.6 * vel));
    const hp = v.ctx.createBiquadFilter(), hg = v.ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 2800; hg.gain.value = 0.05 * vel;
    ex.connect(hp); hp.connect(hg); hg.connect(v.out);
    glide(v, f1 * 1.22, f1, 0.018, 0.16 * a, 0.1 * k, 0.0015);
    return 0.5 * k;
  },
  /** 大鼓。基模 66Hz 从高一点滑下来，膜模 1.59、2.14、2.30、2.92 倍；槌是低通噪声的一「嘭」，鼓腔里一团 210Hz 的余响 */
  drum(v) {
    const f0 = 66 * v.pitch, vel = v.vel, a = 1.1 * Math.pow(vel, 1.2);
    glide(v, f0 * 1.38, f0, 0.07, a, 1.5, 0.004);
    for (const [r, amp, t60] of [[1.59, 0.36, 0.6], [2.14, 0.28, 0.45], [2.3, 0.18, 0.36], [2.92, 0.16, 0.3], [3.6, 0.12, 0.24], [4.2, 0.09, 0.2], [5.1, 0.06, 0.16]] as const) {
      glide(v, f0 * r * 1.12, f0 * r, 0.05, a * amp * (0.5 + 0.5 * vel), t60, 0.003);
    }
    burst(v, { dur: 0.08, type: 'lowpass', f: 950, f2: 160, q: 0.7, amp: 0.85 * vel, att: 0.002 });
    burst(v, { dur: 0.6, f: 210, q: 1.1, amp: 0.5 * vel, att: 0.01, noise: 'pink' });
    burst(v, { dur: 0.012, f: 2400, q: 1, amp: 0.09 * vel * vel, att: 0.001 });
    return 2.4;
  },
  /** 鼓边：槌敲在木头鼓帮上，鼓面跟着轻轻一应 */
  drumrim(v) {
    const vel = v.vel, a = 7 * Math.pow(vel, 1.2), p = v.pitch * rand(0.98, 1.02);
    const ex = tap(v, v.t, 1.2, a, 0.3);
    reson(v, ex, 870 * p, 16, 1.6);
    reson(v, ex, 1730 * p, 18, 1.2);
    reson(v, ex, 2900 * p, 16, 0.6);
    mode(v, 66 * v.pitch, 0.01 * a, 0.5, 0.004);
    return 0.7;
  },
  /** 一颗念珠过指：小木珠相碰，极轻的「嗒」，每次不同 */
  bead(v) {
    const f = rand(2300, 3100) * v.pitch, a = 0.12 * (0.5 + 0.7 * v.vel) * rand(0.85, 1.1);
    mode(v, f, a, 0.035, 0.0006);
    mode(v, f * rand(1.75, 1.92), a * 0.4, 0.02, 0.0005);
    mode(v, f * 0.36, a * 0.55, 0.03, 0.0008);
    burst(v, { dur: 0.008, type: 'highpass', f: 5000, amp: a * 0.5, att: 0.0005 });
    return 0.15;
  },
  /** 到母珠掉头：三颗珠子连着响，带一点穗子的窸窣 */
  beadturn(v) {
    const base = rand(2200, 2700) * v.pitch, k = 0.5 + 0.7 * v.vel;
    [0, 0.055, 0.13].forEach((dt, i) => {
      const f = base * [1, 1.12, 0.9][i], a = 0.1 * k * [1, 0.8, 0.9][i], t = v.t + dt + rand(0, 0.008);
      mode(v, f, a, 0.035, 0.0006, v.out, t);
      mode(v, f * 1.83, a * 0.4, 0.02, 0.0005, v.out, t);
      mode(v, f * 0.36, a * 0.5, 0.03, 0.0008, v.out, t);
    });
    burst(v, { t: v.t + 0.03, dur: 0.2, f: 3200, q: 0.8, amp: 0.012 * k, att: 0.06, noise: 'pink' });
    return 0.4;
  },
  /** 摇签筒一下：十几支竹签在竹筒里哗啦，筒身跟着共鸣 */
  sticks(v) {
    const vel = v.vel, sr = v.ctx.sampleRate, n = Math.round(8 + 14 * vel), span = 0.16 + 0.14 * vel, a = 0.24 * (0.4 + 0.8 * vel);
    // 一二十支签各响一下：直接算进一段波形里（摇得快时省下几百个节点）
    const len = Math.floor(sr * (span + 0.06)), b = v.ctx.createBuffer(1, len, sr), d = b.getChannelData(0), TAU = Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const at = Math.floor(sr * span * Math.pow(Math.random(), 0.8)), f = rand(1300, 3600) * v.pitch, g = a * rand(0.3, 1), t60 = rand(0.012, 0.03);
      const m = Math.min(len - at, Math.floor(sr * t60 * 1.3)), k = 6.91 / (t60 * sr), w1 = (TAU * f) / sr, w2 = w1 * 2.6;
      for (let j = 0; j < m; j++) {
        const e1 = Math.exp(-k * j);
        d[at + j] += g * Math.min(1, j / 12) * (e1 * Math.sin(w1 * j) + 0.35 * e1 * e1 * Math.sin(w2 * j));
      }
    }
    const s = v.ctx.createBufferSource();
    s.buffer = b;
    s.connect(v.out);
    s.start(v.t);
    burst(v, { dur: span + 0.1, f: 520 * v.pitch, q: 2.5, amp: 0.9 * a, att: span * 0.3, noise: 'pink' });
    return span + 0.3;
  },
  /** 一支签掉在木桌上：竹片落木，弹两三下，越来越轻、越来越密 */
  stickfall(v) {
    const a = 0.3 * (0.5 + 0.7 * v.vel);
    [0, 0.13, 0.21, 0.26, 0.29].forEach((dt, i) => {
      const g = a * [1, 0.5, 0.3, 0.18, 0.1][i], r = rand(0.97, 1.03) * v.pitch, t = v.t + dt;
      mode(v, 1750 * r, g, 0.04, 0.0005, v.out, t);
      mode(v, 3900 * r, g * 0.5, 0.025, 0.0005, v.out, t);
      mode(v, 620 * r, g * 0.4, 0.03, 0.0008, v.out, t);
      if (i < 2) mode(v, 185, g * 0.55, 0.07, 0.002, v.out, t);
    });
    return 0.6;
  },
  /** 檐角风铎：小铜铃，音高取 G 宫五声里的一个（给了 pitch / rate 就从 G6 算起） */
  windbell(v) {
    const f0 = v.raw.pitch == null && v.raw.rate == null ? pick(WINDBELL) : WINDBELL[0] * v.pitch, vel = v.vel;
    partials(v, f0, 0.33 * Math.pow(vel, 1.1), [
      [1.0, 1.0, 2.8, 2.3, 0.001],
      [2.42, 0.45, 1.6, 4.1, 0.001],
      [3.93, 0.25, 0.9, 0, 0.001],
      [5.61, 0.12, 0.5, 0, 0.001],
    ], 0.2, 1);
    burst(v, { dur: 0.005, type: 'highpass', f: 6000, amp: 0.09 * vel, att: 0.0004 });
    return 3.6;
  },
};

export const SHOTS: Record<Shot, Fn> = { ...STUDY_SHOTS, ...VILLAGE_SHOTS, ...EXTRA_SHOTS, ...SKY_SHOTS, ...STEP_SHOTS, ...UI_SHOTS, ...LEGACY_SHOTS, qin: qinShot, recite: reciteShot, flute: fluteShot };
