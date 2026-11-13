/**
 * 水。
 *   溪（brook）    清浅的溪水过石头：几条窄带的「汩汩」（中心不规则地摆、各自一隐一现）是水的身子；
 *                  一颗一颗的水泡是它的细节——离得远只听得见一片低低的潺潺，走近了泡声与高处的亮才出来（近则明）；
 *   池（pond）     屋后小池几乎是静的：岸边极轻的一点水声，隔很久鱼唼一下、蛙或龟滑下水；
 *   河（river）    伊水宽而缓：低而宽的一片，岸边一下一下慢慢地拍，白天远远有橹声「咿呀」；
 *   瀑（waterfall）远处的瀑布：低而稳的一片轰，随风慢慢地一呼一吸。
 * 水泡是预先算好的一片（util.ts 的 bubbleField），两路不同快慢地循环，合起来的花样很久才重复。
 * 各条带的中心与响度用 Base.roam 游走（一秒变四五回的「汩汩」也是它排的），不另建调制用的节点。
 */
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { burst } from './kit';
import { bubbleField, lerp, rand, smooth } from './util';

// ———————————————————————————— 溪 ————————————————————————————
export class Brook extends Base {
  private out: GainNode;
  private tone: BiquadFilterNode;
  private detail: GainNode;
  private sparkle: GainNode;
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    // 远近的明暗：所有的水声都过这一道低通
    this.tone = this.filter('lowpass', 9000, 0.5);
    this.out = this.slow(1);
    this.tone.connect(this.out); this.out.connect(bus.dry);
    // 汩汩：白噪声过四条窄带，中心一秒摆四五回，响度各自一隐一现；单数的偏左、双数的偏右
    const white = this.noise('white', t), sides = [this.pan(-0.4), this.pan(0.4)];
    for (const p of sides) p.connect(this.tone);
    [520, 880, 1420, 2300].forEach((fc, i) => {
      const f = this.filter('bandpass', fc, 5), g = this.slow(0.6);
      white.connect(f); f.connect(g); g.connect(sides[i % 2]);
      this.roam(f.frequency, fc * 0.8, fc * 1.2, [0.12, 0.35], [0.04, 0.09], t);
      this.roam(g.gain, 0.05, 1.15, [0.25, 0.7], [0.08, 0.2], t);
    });
    // 水的身子
    const brown = this.noise('brown', t), lf = this.filter('lowpass', 650, 0.5), lh = this.filter('highpass', 180, 0.6), lg = this.slow(0.2);
    brown.connect(lf); lf.connect(lh); lh.connect(lg); lg.connect(this.tone);
    // 一颗颗的泡（近了才听得清）：同一片泡两路放，快慢不同，合起来的花样很久才重复
    this.detail = this.slow(0);
    this.detail.connect(this.tone);
    const field = e.cached('bubbles-brook', () => bubbleField(e.ctx, { seconds: 7.3, rate: 42, fLo: 800, fHi: 6500, q: 16, lowBias: 1 }));
    for (const rate of [0.93, 1.08]) {
      const s = this.src(e.loopSrc(field, t, rate)), g = this.slow(0.5);
      s.connect(g); g.connect(this.detail);
      this.roam(g.gain, 0.3, 0.7, [3, 7], [1.5, 3], t);
    }
    // 最高处的一点亮
    const hf = this.filter('highpass', 5200, 0.5);
    this.sparkle = this.slow(0);
    white.connect(hf); hf.connect(this.sparkle); this.sparkle.connect(this.tone);
    this.next = t + rand(0.3, 1.5);
    this.scene(t);
  }
  scene(t: number) {
    const n = this.e.scene.near.stream, k = smooth(0.25, 1, n);
    this.tone.frequency.setTargetAtTime(lerp(650, 12000, n * n), t, 0.5);
    this.detail.gain.setTargetAtTime(0.9 * k * k, t, 0.5);
    this.sparkle.gain.setTargetAtTime(0.04 * n * n * n, t, 0.5);
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    while (this.next < to) {
      const t = Math.max(from, this.next), n = this.e.scene.near.stream;
      // 就在水边时，偶尔一颗特别清楚的水珠
      if (n > 0.55) this.plink(t, rand(0.04, 0.065), rand(-0.6, 0.6), rand(0.6, 1.9), this.out);
      this.next = t + rand(0.6, 3) / (0.4 + n);
    }
  }
}

// ———————————————————————————— 池 ————————————————————————————
export class Pond extends Base {
  private nextKiss: number;
  private nextPlop: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    // 岸边极轻的一点水声：一路粉噪声过两条窄带，各自慢慢一起一伏
    const pink = this.noise('pink', t);
    for (const [fc, q, base] of [[650, 1.1, 0.1], [1100, 1.4, 0.05]] as const) {
      const f = this.filter('bandpass', fc, q), g = this.slow(base);
      pink.connect(f); f.connect(g); g.connect(bus.dry);
      this.roam(g.gain, base * 0.1, base * 1.9, [2.5, 6], [1.2, 2.5], t);
    }
    this.nextKiss = t + rand(2, 8);
    this.nextPlop = t + (e.offline ? rand(2, 5) : rand(12, 40));
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    const s = this.e.scene;
    while (this.nextKiss < to) {
      // 鱼唼水面、水滴：很轻的一个泡
      const t = Math.max(from, this.nextKiss);
      this.plink(t, rand(0.03, 0.05), rand(-0.7, 0.7), rand(0.45, 1.4));
      this.nextKiss = t + rand(5, 16);
    }
    while (this.nextPlop < to) {
      // 隔很久：暖的时候是蛙或龟滑下水，别的时候是鱼翻一下
      const t = Math.max(from, this.nextPlop), warm = s.season === 'summer' || s.season === 'spring', pan = rand(-0.7, 0.7);
      this.say('plop', t, { vel: rand(0.25, 0.5), pan, variant: warm ? (Math.random() < 0.6 ? 'frog' : 'turtle') : undefined, rate: rand(0.85, 1.15) }, this.bus.dry, { dry: 1, hall: 0, open: 0.15 });
      this.say('ripple', t + 0.18, { vel: rand(0.25, 0.35), pan }, this.bus.dry, { dry: 0.6, hall: 0, open: 0.06 });
      this.nextPlop = t + rand(35, 90);
    }
  }
}

// ———————————————————————————— 河 ————————————————————————————
export class River extends Base {
  private out: GainNode;
  private nextLap: number;
  private nextOar: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.out = this.slow(1);
    this.out.connect(bus.dry);
    // 水的身子：宽、低、慢（居中；左右的宽是岸边那一下一下的拍给的）
    const brown = this.noise('brown', t), lf = this.filter('lowpass', 480, 0.5), lh = this.filter('highpass', 95, 0.6), g = this.slow(0.62);
    brown.connect(lf); lf.connect(lh); lh.connect(g); g.connect(this.out);
    this.roam(g.gain, 0.42, 0.82, [4, 9], [2, 4], t);
    // 远处滩上水流的沙沙
    const pink = this.noise('pink', t), mf = this.filter('bandpass', 900, 0.5), mg = this.slow(0.08);
    pink.connect(mf); mf.connect(mg); mg.connect(this.out);
    this.roam(mg.gain, 0.04, 0.12, [3, 7], [1.5, 3], t);
    this.nextLap = t + rand(0.5, 2);
    this.nextOar = t + (e.offline ? rand(2, 4) : rand(12, 35));
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    const s = this.e.scene;
    while (this.nextLap < to) {
      // 岸边的一拍：起得慢，落得慢，末了一点细碎
      const t = Math.max(from, this.nextLap), v = this.mini(t, 1.6, { pan: rand(-0.7, 0.7), dest: this.out });
      burst(v, { dur: rand(0.5, 0.9), f: rand(450, 900), q: 1, amp: rand(0.1, 0.22), att: rand(0.18, 0.3), noise: 'pink' });
      burst(v, { t: t + 0.2, dur: 0.35, type: 'highpass', f: 3200, amp: 0.012, att: 0.08 });
      this.nextLap = t + rand(2.2, 4.8);
    }
    while (this.nextOar < to) {
      // 远远的橹声：白天，不下大雨
      const t = Math.max(from, this.nextOar);
      if (s.day > 0.6 && s.rain < 0.5 && s.snow < 0.5) { const dist = rand(0.5, 0.85); this.say('oar', t, { vel: rand(0.4, 0.7), dist, pan: rand(-0.8, 0.8) }); }
      this.nextOar = t + rand(25, 70);
    }
  }
}

// ———————————————————————————— 瀑 ————————————————————————————
export class Waterfall extends Base {
  private tone: BiquadFilterNode;
  private hissG: GainNode;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.tone = this.filter('lowpass', 900, 0.5);
    // 一呼一吸：整片的响度很慢地起伏（风把声音送过来、又带走）
    const breath = this.slow(0.78);
    this.tone.connect(breath); breath.connect(bus.dry);
    this.roam(breath.gain, 0.56, 1, [7, 14], [3, 6], t);
    // 轰：低处的身子（笔记本的小喇叭放不出最低的那层，所以 300–700Hz 也要有东西）
    const brown = this.noise('brown', t), lf = this.filter('lowpass', 420, 0.6), lh = this.filter('highpass', 70, 0.6), lg = this.slow(0.8);
    brown.connect(lf); lf.connect(lh); lh.connect(lg); lg.connect(this.tone);
    const pink = this.noise('pink', t), mf = this.filter('bandpass', 520, 0.5), mg = this.slow(0.18);
    pink.connect(mf); mf.connect(mg); mg.connect(this.tone);
    this.roam(mg.gain, 0.1, 0.26, [5, 11], [2.5, 5], t);
    // 近一些才有的水雾的「沙」
    const hf = this.filter('bandpass', 1500, 0.6);
    this.hissG = this.slow(0);
    pink.connect(hf); hf.connect(this.hissG); this.hissG.connect(this.tone);
    this.scene(t);
  }
  scene(t: number) {
    const n = this.e.scene.near.waterfall;
    this.tone.frequency.setTargetAtTime(lerp(500, 2600, Math.pow(n, 1.5)), t, 0.8);
    this.hissG.gain.setTargetAtTime(0.05 * n * n, t, 0.8);
  }
  schedule(from: number, to: number) { this.roamTo(from, to); }
}
