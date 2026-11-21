/**
 * 脚步。布鞋，慢慢走（每秒一步半上下）：没有鞋跟的「嗒」，只有脚跟一闷、脚掌一闷，
 * 外加脚下那样东西自己的声音——土路的一点沙、草的窸窣、石板的一拍、木板的空、屋里夯土地的干、水的一溅、积雪的「咯吱」。
 * 每一步都不一样（音高、轻重、两下之间隔多久都在小范围里随机）。地湿了（雨里、雨后）脚下多一点「咕唧」。
 * 跑（raw.run，四五米一秒、一秒近三步）：前脚掌先着地，脚跟脚掌几乎同时落下，一步更重、更短；蹬地时脚掌往后一搓；
 * 长衫的下摆跟着一甩，隔几步有一阵窸窣。
 */
import type { Voice } from './engine';
import { bubble, burst, creak, grain, hiss, reson, sprinkle, tap, wobble } from './kit';
import type { Ground, Shot } from './types';
import { clamp, lerp, rand } from './util';

/**
 * 雪被压实（d 秒）：许多细小的冰晶一齐断开——密的、发干的「咯吱」，先急后缓；底下一点「嚓」的身子（有颗粒）；
 * 冷天干雪还带一声短短的「吱」（squeak 0…1）。踩雪的脚步、滚雪球都用它。
 */
export function crunch(v: Voice, t: number, d: number, a: number, squeak = 0) {
  sprinkle(v, { t, dur: d, n: Math.round(d * 380), f: [600, 3200], t60: [0.002, 0.005], amp: 0.13 * a, noise: 0.8, bright: 0.24, shape: (u) => Math.min(1, u * 14) * Math.pow(1 - u, 1.3) });
  hiss(v, { t, dur: d, f: rand(1100, 1500), q: 0.9, hp: 400, curve: wobble(10, 0.1 * a, 0.12, 0.3), dest: grain(v, t, d, 0.3, 0.7, 1.1) });
  // 雪被压下去的那一点「噗」（雪层塌下去，几百赫兹）
  burst(v, { t: t + 0.01, dur: d * 0.6, f: rand(420, 560), q: 0.9, amp: 0.12 * a, att: 0.01, noise: 'pink' });
  if (squeak > 0) creak(v, { t: t + d * 0.1, dur: d * 0.55, rate: [rand(150, 190), rand(110, 140)], res: [[rand(1200, 1500), 6, 1], [rand(2500, 2900), 8, 0.35]], amp: 0.035 * a * squeak, jitter: 300, scrape: 0.1, att: 0.2 });
}

/** 没说踩在什么上时，按人在哪一处猜：屋里是夯土地，别处多半是土路 */
const groundAt = (place: string): Ground => (place === 'hall' ? 'floor' : 'earth');

/** 地湿：鞋底挤出来的一点水声 */
function squish(v: Voice, t: number, a: number, wet: number) {
  burst(v, { t, dur: 0.07, f: rand(600, 1000), q: 1.2, amp: 0.11 * a * wet, att: 0.015, noise: 'pink' });
  burst(v, { t: t + 0.02, dur: 0.06, f: rand(2200, 3000), q: 0.9, amp: 0.035 * a * wet, att: 0.01 });
  if (Math.random() < 0.35 * wet) { const f = rand(500, 900); bubble(v, t + rand(0.03, 0.07), f, f * 1.6, 0.03, 0.03 * a * wet); }
}

/**
 * 脚落地的一闷：粉噪声过带通（不用低通——低通过的粉噪声力气全在一百赫兹以下，笔记本的小喇叭放不出来，等于没有脚步声）。
 */
function thump(v: Voice, t: number, f: number, amp: number, dur = 0.07) {
  burst(v, { t, dur, f, q: 0.9, amp, att: 0.005, noise: 'pink' });
}

function foot(v: Voice, ground: Ground): number {
  // 快慢是连着变的（世界给 speed 米/秒：走 1.4、快走 3.0、跑 4.6；只说 run 没给 speed 当 4.5）：
  // k 从两米一秒起往上涨，到四米六是 1——越快越重、脚跟脚掌隔得越近（走路六七十到一百毫秒，跑起来二三十毫秒）
  const sp = v.raw.speed ?? (v.raw.run ? 4.5 : 1.4), k = clamp((sp - 2) / 2.6), heavy = 1 + 0.38 * k + 0.06 * clamp(sp - 4.6, 0, 1.5);
  const a = (0.5 + 0.7 * v.vel) * rand(0.8, 1.1) * heavy, t = v.t, t2 = t + lerp(rand(0.065, 0.1), rand(0.018, 0.035), k);
  const wet = clamp(v.raw.wet ?? Math.max(v.e.scene.rain, v.e.scene.wet));
  if (k > 0.15) {
    // 蹬地时脚掌往后一搓（土、石、草上是一点沙；水里、雪里另算）
    if (ground !== 'water' && ground !== 'snow' && ground !== 'plank') burst(v, { t: t2 + rand(0.03, 0.06), dur: 0.06, f: rand(1400, 2600), q: 0.9, amp: 0.03 * a * k * (1 - 0.6 * wet), att: 0.012 });
    // 长衫的下摆一甩：跑起来三成多的步子带一阵很轻的窸窣（快走时少些）
    if (Math.random() < 0.38 * k) hiss(v, { t: t + rand(0.04, 0.12), dur: rand(0.12, 0.2), noise: 'pink', f: rand(900, 1400), fMid: rand(1600, 2400), f2: 1100, q: 0.8, hp: 500, curve: wobble(8, 0.028 * a, 0.4, 0.2) });
  }
  switch (ground) {
    case 'snow':
      // 积雪：脚落下去把雪压实——一下发干的「咯吱」；脚掌那一闷被雪吃掉了大半。冬天的干雪偶尔「吱」一声
      thump(v, t, rand(190, 260), 0.45 * a, 0.05);
      crunch(v, t + 0.008, lerp(rand(0.16, 0.22), rand(0.12, 0.16), k), a * (1 + 0.15 * k), v.e.scene.season === 'winter' && Math.random() < 0.3 ? 1 : 0);
      return 0.45;
    case 'earth':
      // 踩实了的土路：脚跟、脚掌两下闷的，脚掌落下时轻轻一「扑」，带一点土粒的沙
      thump(v, t, rand(200, 280), 1.5 * a);
      thump(v, t2, rand(340, 460), 0.8 * a, 0.06);
      burst(v, { t: t2, dur: 0.04, f: rand(700, 1000), q: 1.2, amp: 0.07 * a, att: 0.005, noise: 'pink' });
      burst(v, { t: t2, dur: 0.09, f: rand(1500, 2800), q: 0.9, amp: 0.02 * a * (1 - 0.6 * wet), att: 0.02 });
      break;
    case 'grass':
      // 草：落脚更软，草叶被拨开又合上的一阵窸窣
      thump(v, t, rand(180, 250), 1.05 * a);
      thump(v, t2, rand(300, 400), 0.45 * a, 0.06);
      burst(v, { t: t + 0.01, dur: 0.17, f: rand(3000, 3800), f2: rand(1900, 2400), q: 0.7, amp: 0.04 * a, att: 0.05 });
      burst(v, { t: t2 + 0.03, dur: 0.12, f: rand(2400, 3200), q: 0.8, amp: 0.022 * a, att: 0.04 });
      break;
    case 'stone':
      // 石板：比土硬一点，脚掌有清楚些的一「拍」
      thump(v, t, rand(240, 340), 1.5 * a);
      thump(v, t2, rand(420, 560), 0.85 * a, 0.06);
      burst(v, { t: t2, dur: 0.035, f: rand(800, 1200), q: 1.4, amp: 0.11 * a, att: 0.004, noise: 'pink' });
      burst(v, { t: t2, dur: 0.09, f: rand(2200, 3800), q: 1.2, amp: 0.014 * a * (1 - 0.6 * wet), att: 0.02 });
      break;
    case 'plank': {
      // 木板：板子自己有一个低的共鸣；隔几步轻轻吱一声
      const ex = tap(v, t, 3.5, 1.2 * a, 0.3);
      reson(v, ex, rand(105, 140), 7, 1.6);
      reson(v, ex, rand(290, 350), 9, 0.8);
      burst(v, { t, dur: 0.05, type: 'lowpass', f: 600, q: 0.7, amp: 0.2 * a, att: 0.003, noise: 'pink' });
      if (Math.random() < 0.14) creak(v, { t: t + 0.03, dur: rand(0.1, 0.16), rate: [rand(38, 50), rand(55, 70)], res: [[rand(480, 620), 10, 1], [rand(1100, 1400), 12, 0.5]], amp: 0.02 * a, scrape: 0.15 });
      break;
    }
    case 'floor':
      // 屋里的夯土地：干、短、闷，几乎没有沙
      thump(v, t, rand(210, 290), 1.25 * a, 0.06);
      thump(v, t2, rand(380, 480), 0.6 * a, 0.05);
      burst(v, { t: t2, dur: 0.06, f: rand(1000, 1500), q: 1, amp: 0.012 * a, att: 0.015 });
      break;
    case 'water': {
      // 浅水：一溅，带一两个泡
      thump(v, t, rand(230, 300), 0.7 * a, 0.06);
      burst(v, { t: t + 0.005, dur: 0.13, f: rand(1800, 3200), q: 0.7, amp: 0.1 * a, att: 0.009 });
      burst(v, { t: t + 0.01, dur: 0.06, f: 4200, q: 0.7, amp: 0.025 * a, att: 0.006 });
      for (let i = 0, n = 1 + Math.floor(rand(0, 2.4)); i < n; i++) { const f = rand(480, 1100); bubble(v, t + rand(0.03, 0.13), f, f * rand(1.4, 1.8), rand(0.03, 0.045), 0.06 * a * rand(0.5, 1)); }
      return 0.4;
    }
  }
  if (wet > 0.15) squish(v, t2 - 0.02, a, wet);
  return 0.35;
}

export const STEP_SHOTS: Pick<Record<Shot, (v: Voice) => number>, 'foot' | 'step' | 'woodstep'> = {
  /** 一步：ground 说踩在什么上（earth grass stone plank floor water），wet 说地有多湿（不给就看场景里的雨） */
  foot: (v) => foot(v, v.raw.ground ?? groundAt(v.e.scene.place)),
  /** 旧的叫法：没说踩在什么上的一步——屋里按夯土地，别处按土路 */
  step: (v) => foot(v, v.raw.ground ?? groundAt(v.e.scene.place)),
  /** 旧的叫法：木板上的一步 */
  woodstep: (v) => foot(v, 'plank'),
};
