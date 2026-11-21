/**
 * 后来添的几样「一直响着的」（setLoop(name, level)）：推磨、辘轳、一片蛙、蜂箱边的蜂、纸鸢的线、远处几个人说话、钓线吃劲、船底下的水。
 *
 *   推磨（millstone） 两扇磨盘相磨的隆隆、谷物碾碎的沙沙一直在；一圈一圈（两秒半上下）压紧又放松，磨杠时不时吱一声；
 *   辘轳（windlass）  一圈接一圈地绞：半圈一声吱呀，绳子涩涩地绕上去；
 *   一片蛙（frog）     夏夜池边、田里成片的叫：十八只的一段循环（算一次共用），两路错开着放，一路近一路远——一阵一阵的；
 *   蜂（bee）          蜂箱边一窝蜂的嗡（一段循环），偶尔一只从耳边飞过；
 *   纸鸢（kite）       线的嗡、纸面的扑扑、风，随着一阵阵的风起落；
 *   人声（murmur）     远处两三个人一直在说话，你一句我一句，歇一歇又说（听不出字）；
 *   钓线（line）       鱼在线上跑：丝线划水的「嘶」忽紧忽松，竹竿弯着时不时吱一声；
 *   船底下的水（boatWater） 船头分水的「沙」、船帮边的水泡、一个个小浪拍船帮。
 * 都是外头的声音：过「屋里」那道低通，做事时也跟着压低。远近、左右由 setLoop 的 dist / at / pan 定。
 */
import { chorusOf, hiveOf } from './animals';
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { millPeriod, millTurn, windPeriod, windTurn } from './farm';
import { chatter } from './folk';
import { bubble, burst, creak } from './kit';
import { crunch } from './steps';
import { kiteGraph } from './things';
import { bubbleField, rand } from './util';

/** 推磨：一圈接一圈。每圈的声音首尾渐入渐出、彼此交叠一点，接起来是连着的 */
export class Millstone extends Base {
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.next = t + 0.02;
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      const t = Math.max(from, this.next), d = millPeriod(), v = this.mini(t, d * 1.15 + 0.6, { open: 0.1 });
      millTurn(v, t, d * 1.15, 1.05);
      this.next = t + d;
    }
  }
}
/** 辘轳：一圈接一圈地绞 */
export class Windlass extends Base {
  private next: number;
  private p = rand(0.94, 1.06);
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.next = t + 0.02;
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      const t = Math.max(from, this.next), d = windPeriod(), v = this.mini(t, d + 0.8, { open: 0.12 });
      windTurn(v, t, d, 1, this.p);
      this.next = t + d;
    }
  }
}
/** 一片蛙：同一段循环两路错开着放（一路近、亮一些；一路远、闷一些、慢一点），合起来很久才重复 */
export class FrogChorus extends Base {
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const buf = chorusOf(e);
    const near = this.src(e.loopSrc(buf, t, 1)), ng = this.slow(1);
    near.connect(ng); ng.connect(bus.dry);
    const far = this.src(e.loopSrc(buf, t, 0.93)), lp = this.filter('lowpass', 1600, 0.5), fg = this.slow(0.55), wet = this.slow(0.3);
    far.connect(lp); lp.connect(fg); fg.connect(bus.dry); fg.connect(wet); wet.connect(bus.open);
    this.roam(ng.gain, 0.75, 1.1, [4, 9], [2, 4], t);
  }
  schedule(from: number, to: number) { this.roamTo(from, to); }
}
/** 蜂箱边：一窝蜂的嗡一直在；隔一阵一只从耳边飞过 */
export class Hive extends Base {
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const s = this.src(e.loopSrc(hiveOf(e), t, rand(0.97, 1.03))), lp = this.filter('lowpass', 3600, 0.5), g = this.slow(1);
    s.connect(lp); lp.connect(g); g.connect(bus.dry);
    this.roam(g.gain, 0.7, 1.1, [1.5, 4], [0.6, 1.5], t);
    this.next = t + rand(2, 6);
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    while (this.next < to) {
      const t = Math.max(from, this.next);
      this.say('bee', t, { vel: rand(0.35, 0.6), dist: rand(0, 0.3) });
      this.next = t + rand(4, 11);
    }
  }
}
/** 纸鸢：线的嗡、纸的扑扑、风一直在；一阵风来，线的音往上走、纸拍得急，再落回来 */
export class Kite extends Base {
  private g: ReturnType<typeof kiteGraph>;
  private next: number;
  private f0: number;
  private rate: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.g = kiteGraph(e, t);
    for (const n of this.g.nodes) this.keep(n);
    for (const s of this.g.srcs) this.src(s);
    const out = this.slow(1);
    this.g.out.connect(out); out.connect(bus.dry);
    this.f0 = this.g.hum.frequency.value;
    this.rate = this.g.lfo.frequency.value;
    this.roam(this.g.hg.gain, 0.35, 0.6, [1, 3], [0.4, 1], t);
    this.next = t + rand(1, 4);
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    while (this.next < to) {
      const t = Math.max(from, this.next), k = rand(1.04, 1.2), d = rand(1.5, 4);
      for (const [p, base] of [[this.g.hum.frequency, this.f0], [this.g.hum2.frequency, 980], [this.g.lfo.frequency, this.rate]] as const) {
        p.setTargetAtTime(base * k, t, d * 0.25);
        p.setTargetAtTime(base * rand(0.96, 1.02), t + d, d * 0.3);
      }
      this.g.wg.gain.setTargetAtTime(0.12 * k * k, t, d * 0.25);
      this.g.wg.gain.setTargetAtTime(0.1, t + d, d * 0.3);
      this.next = t + d + rand(1, 5);
    }
  }
}
/**
 * 钓线吃劲（鱼在线上跑）：丝线在水里划过去的一缕「嘶」，忽紧忽松；竹竿弯着，隔一会儿吱一声；线自己绷着的一点细「嗡」。
 * 量由世界按线有多紧给（0 松 … 1 快断了）
 */
export class Line extends Base {
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const white = this.noise('white', t), cut = this.filter('bandpass', 3600, 1.1), cg = this.slow(0.05);
    white.connect(cut); cut.connect(cg); cg.connect(bus.dry);
    this.roam(cg.gain, 0.015, 0.07, [0.12, 0.5], [0.05, 0.15], t);
    this.roam(cut.frequency, 2800, 4600, [0.3, 0.9], [0.1, 0.3], t);
    const hum = this.filter('bandpass', rand(900, 1150), 28), hg = this.slow(0.12);
    white.connect(hum); hum.connect(hg); hg.connect(bus.dry);
    this.roam(hum.frequency, 850, 1250, [0.4, 1.2], [0.2, 0.5], t);
    this.next = t + rand(0.5, 2);
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    while (this.next < to) {
      // 竹竿弯着吃劲：低低地吱一声
      const t = Math.max(from, this.next), v = this.mini(t, 1);
      creak(v, { dur: rand(0.2, 0.4), rate: [rand(26, 34), rand(40, 52)], res: [[rand(700, 900), 10, 1], [rand(1600, 1900), 12, 0.4]], amp: 0.06, jitter: 280, scrape: 0 });
      this.next = t + rand(1.2, 3.5);
    }
  }
}
/**
 * 划船时船底下的水（量由世界按船走多快给）：船头分开水的一缕「沙」、船帮边上汩汩的水泡（与溪共用那一片，放慢了低一些），
 * 隔半秒一秒一个小浪拍在船帮上「啪嗒」
 */
export class BoatWater extends Base {
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const white = this.noise('white', t), bow = this.filter('bandpass', 1800, 0.7), bg = this.slow(0.05);
    white.connect(bow); bow.connect(bg); bg.connect(bus.dry);
    this.roam(bg.gain, 0.03, 0.07, [0.3, 0.9], [0.15, 0.4], t);
    const brown = this.noise('brown', t), body = this.filter('bandpass', 420, 0.8), wg = this.slow(0.2);
    brown.connect(body); body.connect(wg); wg.connect(bus.dry);
    this.roam(wg.gain, 0.12, 0.26, [0.4, 1.2], [0.2, 0.5], t);
    const field = e.cached('bubbles-brook', () => bubbleField(e.ctx, { seconds: 7.3, rate: 42, fLo: 800, fHi: 6500, q: 16, lowBias: 1 }));
    const bs = this.src(e.loopSrc(field, t, 0.62)), lp = this.filter('lowpass', 2600, 0.5), gg = this.slow(0.16);
    bs.connect(lp); lp.connect(gg); gg.connect(bus.dry);
    this.next = t + rand(0.2, 0.8);
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    while (this.next < to) {
      const t = Math.max(from, this.next), v = this.mini(t, 0.6, { pan: rand(-0.5, 0.5) });
      burst(v, { dur: 0.06, f: rand(700, 1100), q: 0.8, amp: rand(0.12, 0.2), att: 0.008, noise: 'pink' });
      bubble(v, t + 0.01, rand(300, 500), rand(700, 1000), 0.05, rand(0.05, 0.09));
      this.next = t + rand(0.45, 1.1);
    }
  }
}
/** 推着雪球滚（堆雪人）：一路慢慢压实的「咯吱咯吱」，雪团在雪上滚的软「沙」（量由世界按推得多快给） */
export class SnowRoll extends Base {
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const pink = this.noise('pink', t), lp = this.filter('bandpass', 900, 0.8), g = this.slow(0.05);
    pink.connect(lp); lp.connect(g); g.connect(bus.dry);
    this.roam(g.gain, 0.03, 0.07, [0.3, 0.8], [0.1, 0.3], t);
    this.next = t + 0.02;
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    while (this.next < to) {
      const t = Math.max(from, this.next), d = rand(0.18, 0.3), v = this.mini(t, d + 0.3);
      crunch(v, t, d, rand(0.55, 0.85));
      this.next = t + d * rand(0.7, 0.95);
    }
  }
}
/** 远处一直有人在说话：说一阵、歇一会儿；整个过一道低通 */
export class Murmur extends Base {
  private lp: BiquadFilterNode;
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.lp = this.filter('lowpass', 1300, 0.5);
    const g = this.slow(1);
    this.lp.connect(g); g.connect(bus.dry);
    const wet = this.slow(0.25);
    g.connect(wet); wet.connect(bus.open);
    this.next = t + rand(0.05, 0.6);
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      // 末一句可能在 d 之前一点才起头、再说三四秒：拆线留足五秒
      const t = Math.max(from, this.next), d = rand(3, 7), v = this.mini(t, d + 5, { dest: this.lp });
      const end = chatter(v, d, 1, v.out);
      this.next = t + end + rand(0.6, 2.5);
    }
  }
}
