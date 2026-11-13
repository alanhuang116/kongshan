/**
 * 旧：空山留下来的两层——远钟与檐角的风铎。安乐窝的场景不会自己打开它们（默认音量是 0）；
 * 界面上的声音面板迁完之前，用户还能从那里把它们开起来，所以留着。
 * （原先在这里的风、鸟、泉、雨、虫已经拆开重写：winds.ts、fauna.ts、waters.ts、weather.ts。）
 */
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { pick, rand } from './util';

// ———————————————————————————— 远钟 ————————————————————————————
/** 远钟：隔四十到九十秒远远一声——同一口钟，力度小，高处被山路吃掉（低通 620Hz），几乎只剩回声 */
export class BellFar extends Base {
  private lp: BiquadFilterNode;
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.lp = this.filter('lowpass', 620, 0.5);
    const d = this.gain(0.22), w = this.gain(0.5);
    this.lp.connect(d); d.connect(bus.dry);
    this.lp.connect(w); w.connect(bus.open);
    this.next = t + (e.offline ? 1 : rand(6, 20));
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      const t = Math.max(from, this.next);
      this.e.voice('bell', { vel: 0.4, pan: rand(-0.4, 0.4) }, t, { dry: this.lp }, { dry: 1, hall: 0, open: 0 });
      this.next = t + rand(40, 90);
    }
  }
}

// ———————————————————————————— 风铎 ————————————————————————————
/** 檐角的风铎：三只，音高与方位固定（G6 在西、B6 在东、D7 偏东）；一阵风来响一两声，没风时很久才有一声 */
export class Eaves extends Base {
  private out: GainNode;
  private next: number;
  private bells = [{ pitch: 1, pan: -0.65 }, { pitch: 1.2599, pan: 0.65 }, { pitch: 1, pan: -0.65 }, { pitch: 1.2599, pan: 0.65 }, { pitch: 1.4983, pan: 0.25 }];
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.out = this.gain(1);
    const d = this.gain(0.28), w = this.gain(0.2);
    this.out.connect(d); d.connect(bus.dry);
    this.out.connect(w); w.connect(bus.open);
    this.next = t + (e.offline ? 1.5 : rand(8, 30));
  }
  private ting(t: number, vel: number) {
    const b = pick(this.bells);
    this.e.voice('windbell', { vel, pan: b.pan, rate: b.pitch }, t, { dry: this.out }, { dry: 1, hall: 0, open: 0 });
  }
  gust(t: number, strength: number, dur: number) {
    if (Math.random() > 0.3 + 0.6 * strength) return;
    let at = t + dur * rand(0.15, 0.4);
    for (let i = 0, n = 1 + Math.floor(rand(0, 1 + 2.4 * strength)); i < n; i++) {
      this.ting(at, rand(0.25, 0.4 + 0.5 * strength));
      at += rand(0.25, 1.1);
    }
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      const t = Math.max(from, this.next);
      this.ting(t, rand(0.2, 0.45));
      this.next = t + rand(22, 60);
    }
  }
}
