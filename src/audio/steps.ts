/**
 * 脚步。布鞋，慢慢走（每秒一步半上下）：没有鞋跟的「嗒」，只有脚跟一闷、脚掌一闷，
 * 外加脚下那样东西自己的声音——土路的一点沙、草的窸窣、石板的一拍、木板的空、屋里夯土地的干、水的一溅。
 * 每一步都不一样（音高、轻重、两下之间隔多久都在小范围里随机）。地湿了（雨里、雨后）脚下多一点「咕唧」。
 */
import type { Voice } from './engine';
import { bubble, burst, creak, reson, tap } from './kit';
import type { Ground, Shot } from './types';
import { clamp, rand } from './util';

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
  const a = (0.5 + 0.7 * v.vel) * rand(0.8, 1.1), t = v.t, t2 = t + rand(0.065, 0.1);
  const wet = clamp(v.raw.wet ?? Math.max(v.e.scene.rain, v.e.scene.wet));
  switch (ground) {
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
