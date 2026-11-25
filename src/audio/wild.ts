/**
 * 野（wild）：村外、林间、远山里的几样——喜鹊、寒鸦、鹿、松鼠。没有常驻的声音，到时候排一声（与「村」那一层一样）。
 *
 *   喜鹊：白天，离村、离树近的地方；早上最勤，一天里也就那么几回「喳喳喳」；刚进门的头一分半钟不叫（那一串沙哑的「喳」
 *         是一进门最先听见的一声鸟叫，试玩的人觉得瘆人）；
 *   寒鸦：只在秋冬——黄昏一群群归林（「寒鸦数点」），早上出林时也有一阵，白天偶尔一两只远远地「哇」；春夏不叫
 *         （乌鸦叫不吉利，试玩的人一进门听见一声就觉得瘆人），刚进门的头一分半钟也不叫；
 *   鹿：远山里，晨昏与夜里，秋天最多（那是它们叫得勤的时节），远而短的一两声「呦」；
 *   松鼠：白天，在松树、在林子里，吱吱一阵（冬天少些）。
 * 世界若自己放了同一种声音（看得见的那只喜鹊在叫），这里就让开一阵。观星时远处的鹿也还有，别的就歇了。
 */
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { clamp, rand } from './util';

type Kind = 'magpie' | 'crow' | 'deer' | 'squirrel';
export class Wild extends Base {
  private next: Record<Kind, number>;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    // 离线渲染时各样都早一点来（量得到）；照刚进门的头一分钟算时（e.calmUntil）就按实时的来
    const o = e.offline && t >= e.calmUntil;
    this.next = { magpie: t + (o ? rand(0.5, 3) : rand(10, 60)), crow: t + (o ? rand(1, 4) : rand(15, 70)), deer: t + (o ? rand(2, 5) : rand(30, 120)), squirrel: t + (o ? rand(1, 4) : rand(20, 90)) };
  }
  private due(k: Kind, from: number, to: number, fn: (t: number) => number) {
    while (this.next[k] < to) {
      const t = Math.max(from, this.next[k]);
      if (this.e.since(k) < 30) { this.next[k] = t + rand(10, 20); continue; }
      this.next[k] = t + fn(t);
    }
  }
  schedule(from: number, to: number) {
    const s = this.e.scene, n = s.near, day = s.day, cold = s.season === 'autumn' || s.season === 'winter', stars = s.focus === 'stars';
    const trees = Math.max(n.grove, n.pines, n.bamboo * 0.7), pan = () => rand(-0.8, 0.8);
    this.due('magpie', from, to, (t) => {
      // 喜鹊：白天在村边、树上；早上多叫几回
      const where = Math.max(n.village, 0.7 * trees, 0.4);
      if (day > 0.7 && s.rain < 0.3 && !stars && t >= this.e.calmUntil + 30) this.say('magpie', t, { vel: rand(0.4, 0.6), dist: clamp(0.95 - 0.6 * where + rand(-0.05, 0.1), 0.25, 0.93), pan: pan() });
      return rand(70, 200) / (0.6 + Math.max(s.dawn, 0.3));
    });
    this.due('crow', from, to, (t) => {
      // 寒鸦：秋冬的黄昏一群群归林，早上出林；别的时候偶尔一两只
      const settling = t < this.e.calmUntil + 30;
      const flock = cold && Math.max(s.dusk, 0.7 * s.dawn) > 0.3 && s.rain < 0.4 && !stars && !settling;
      if (flock) this.say('crow', t, { vel: rand(0.45, 0.7), dist: rand(0.55, 0.85), pan: pan(), variant: 'flock' });
      else if (cold && day > 0.6 && s.rain < 0.3 && !stars && !settling && Math.random() < 0.5) this.say('crow', t, { vel: rand(0.35, 0.55), dist: rand(0.65, 0.92), pan: pan() });
      return flock ? rand(35, 80) : rand(120, 300);
    });
    this.due('deer', from, to, (t) => {
      // 鹿：远山里，晨昏与夜里；秋天叫得勤
      const when = Math.max(s.dawn, s.dusk, 0.7 * s.night), k = s.season === 'autumn' ? 1 : s.season === 'winter' ? 0.25 : 0.4;
      if (when > 0.3 && s.rain < 0.4 && Math.random() < k) this.say('deer', t, { vel: rand(0.35, 0.6), dist: rand(0.78, 0.95), pan: pan() });
      return rand(90, 260);
    });
    this.due('squirrel', from, to, (t) => {
      // 松鼠：白天，松、林子里；冬天少
      if (day > 0.7 && trees > 0.3 && s.rain < 0.2 && !stars && Math.random() < (s.season === 'winter' ? 0.3 : 0.8)) this.say('squirrel', t, { vel: rand(0.35, 0.6), dist: clamp(1 - trees + rand(0, 0.25), 0.1, 0.85), pan: pan() });
      return rand(60, 180);
    });
  }
}
