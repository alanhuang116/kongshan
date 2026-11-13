/**
 * 风。风自己没有声音，听到的都是它碰到的东西：
 *   气（air）      到处都有的一点低低的风身——免得四下里是「数字的」死寂；冬天树都秃了，主要就听它，外加枯枝茅檐上细细的啸；
 *   松（pines）    松涛：针叶把风切成一片「呼——」，中心在几百到一千多赫兹；风紧了，音高跟着扬上去；
 *   竹（bamboo）   竹叶又干又硬，是高处一片有颗粒的沙沙；一阵风来整片涨起来，竹竿相碰「笃」的一两声，空的；
 *   叶（leaves）   桃、桑、柳这些阔叶：比竹软、比竹低，一阵一阵地翻；
 *   野（fieldwind）田上没有遮拦：一浪一浪的风从一边推到另一边，麦与草跟着「唰——」地伏过去。
 * 都是一两路噪声过带通，中心与响度各自游走（Base.roam：不规则，不重复，不另占节点）；
 * 引擎每隔一阵发一次「一阵风」（gust），各层各自起伏。持续的风声不送回声（听不出来，白占处理器）。
 */
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { creak, reson, tap } from './kit';
import { grainBuffer, rand } from './util';

// ———————————————————————————— 气 ————————————————————————————
export class Air extends Base {
  private swell: GainNode;
  private whistle: GainNode;
  private nextWhistle: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.swell = this.slow(1);
    this.swell.connect(bus.dry);
    const pink = this.noise('pink', t);
    // 低处的风身
    const lf = this.filter('lowpass', 380, 0.5), lh = this.filter('highpass', 80, 0.6), low = this.slow(0.5);
    pink.connect(lf); lf.connect(lh); lh.connect(low); low.connect(this.swell);
    this.roam(low.gain, 0.35, 0.65, [4, 9], [2, 4], t);
    // 中间一层，慢慢游走
    const mf = this.filter('bandpass', 620, 0.7), mg = this.slow(0.2);
    pink.connect(mf); mf.connect(mg); mg.connect(this.swell);
    this.roam(mf.frequency, 380, 900, [3, 8], [1.5, 3], t);
    this.roam(mg.gain, 0.08, 0.3, [3, 8], [1.5, 3], t);
    // 冬天：风过枯枝、茅檐，细细的一线啸
    const wf = this.filter('bandpass', 1100, 9);
    this.whistle = this.slow(0);
    pink.connect(wf); wf.connect(this.whistle); this.whistle.connect(this.swell);
    this.roam(wf.frequency, 800, 1500, [2.5, 6], [0.8, 2], t);
    this.nextWhistle = t;
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    const s = this.e.scene;
    while (this.nextWhistle < to) {
      const t = Math.max(from, this.nextWhistle);
      this.whistle.gain.setTargetAtTime(s.season === 'winter' ? rand(0, 0.2) * (0.3 + s.wind) : 0, t, rand(0.8, 2));
      this.nextWhistle = t + rand(2.5, 6);
    }
  }
  gust(t: number, strength: number, dur: number) {
    this.swell.gain.setTargetAtTime(1 + strength * 0.9, t, dur * 0.2);
    this.swell.gain.setTargetAtTime(1, t + dur * 0.45, dur * 0.28);
  }
}

// ———————————————————————————— 松 ————————————————————————————
export class Pines extends Base {
  private bands: BiquadFilterNode[] = [];
  private swell: GainNode;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.swell = this.slow(0.7);
    this.swell.connect(bus.dry);
    for (const side of [-0.45, 0.45]) {
      // 粉噪声低处本来就重，先切掉 300Hz 以下，松涛才显出来
      const s = this.noise('pink', t), hp = this.filter('highpass', 300, 0.6), f = this.filter('bandpass', rand(520, 900), 0.9), g = this.slow(0.75), p = this.pan(side);
      s.connect(hp); hp.connect(f); f.connect(g); g.connect(p); p.connect(this.swell);
      this.roam(f.frequency, 450, 1100, [3, 7], [1.2, 2.6], t);
      this.roam(g.gain, 0.35, 1.1, [3, 7], [1.2, 2.6], t);
      this.bands.push(f);
      // 针叶极细的一层（只取一边的噪声就够）
      if (side < 0) { const hf = this.filter('bandpass', 3400, 0.5), hg = this.slow(0.1); s.connect(hf); hf.connect(hg); hg.connect(this.swell); this.roam(hg.gain, 0.05, 0.15, [4, 9], [2, 4], t); }
    }
  }
  schedule(from: number, to: number) { this.roamTo(from, to); }
  gust(t: number, strength: number, dur: number) {
    this.swell.gain.setTargetAtTime(0.7 + strength * 1.1, t, dur * 0.2);
    this.swell.gain.setTargetAtTime(0.7, t + dur * 0.45, dur * 0.28);
    // 风紧了，松涛的音高跟着扬上去（最多小半个八度），再落回来
    for (const f of this.bands) {
      f.detune.setTargetAtTime(500 * strength, t, dur * 0.2);
      f.detune.setTargetAtTime(0, t + dur * 0.45, dur * 0.3);
    }
  }
}

// ———————————————————————————— 竹 ————————————————————————————
export class Bamboo extends Base {
  private swell: GainNode;
  private out: GainNode;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.out = this.slow(1);
    this.out.connect(bus.dry);
    // 没有风来时只是轻轻的；一阵风来涨上去
    this.swell = this.slow(0.45);
    this.swell.connect(this.out);
    // 颗粒是算在波形里的（许多叶子各自在碰）：一段有颗粒的噪声，左右各从不同的地方放起
    const grainy = e.cached('grain-bamboo', () => grainBuffer(e.ctx, 6.3, 38, 1.4));
    for (const side of [-0.5, 0.5]) {
      const s = this.src(e.loopSrc(grainy, t)), hp = this.filter('highpass', 1300, 0.6), f = this.filter('bandpass', rand(2800, 3600), 0.8), g = this.slow(0.7), p = this.pan(side);
      s.connect(hp); hp.connect(f); f.connect(g); g.connect(p); p.connect(this.swell);
      this.roam(f.frequency, 2600, 3800, [3, 7], [1.2, 2.6], t);
      this.roam(g.gain, 0.3, 1.1, [2.5, 6], [1.2, 2.5], t);
    }
    // 整片竹林低处的一点身子
    const pink = this.noise('pink', t), bf = this.filter('bandpass', 950, 0.7), bg = this.slow(0.12);
    pink.connect(bf); bf.connect(bg); bg.connect(this.swell);
  }
  schedule(from: number, to: number) { this.roamTo(from, to); }
  /** 竹竿相碰：空的一「笃」（竿是一截管子，共鸣不成整数倍） */
  private knock(t: number, vel: number) {
    const v = this.mini(t, 0.5, { pan: rand(-0.7, 0.7), dest: this.out, open: 0.12 }), f = rand(380, 620);
    const ex = tap(v, t, 1.6, 0.55 * vel, 0.2);
    reson(v, ex, f, 18, 1);
    reson(v, ex, f * 2.3, 16, 0.5);
    reson(v, ex, f * 4.1, 12, 0.22);
    reson(v, ex, rand(190, 260), 6, 0.5);
  }
  gust(t: number, strength: number, dur: number) {
    this.swell.gain.setTargetAtTime(0.45 + 1.3 * strength, t, dur * 0.18);
    this.swell.gain.setTargetAtTime(0.45, t + dur * 0.45, dur * 0.3);
    if (Math.random() < 0.25 + 0.6 * strength) {
      let at = t + dur * rand(0.15, 0.45);
      for (let i = 0, n = 1 + Math.floor(rand(0, 1 + 2 * strength)); i < n; i++) { this.knock(at, rand(0.25, 0.5 + 0.5 * strength)); at += rand(0.3, 1.4); }
    }
    // 风大时竹竿弯过去，偶尔吱一声
    if (strength > 0.55 && Math.random() < 0.3) {
      const at = t + dur * rand(0.2, 0.4), v = this.mini(at, 0.9, { pan: rand(-0.6, 0.6), dest: this.out });
      creak(v, { dur: rand(0.3, 0.55), rate: [rand(30, 40), rand(44, 60)], res: [[rand(520, 700), 12, 1], [rand(1300, 1700), 14, 0.5]], amp: 0.08, scrape: 0.1 });
    }
  }
}

// ———————————————————————————— 叶 ————————————————————————————
export class Leaves extends Base {
  private swell: GainNode;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.swell = this.slow(0.55);
    this.swell.connect(bus.dry);
    for (const side of [-0.5, 0.5]) {
      const s = this.noise('pink', t), hp = this.filter('highpass', 700, 0.6), f = this.filter('bandpass', rand(2000, 2800), 0.6), g = this.slow(0.4), p = this.pan(side);
      s.connect(hp); hp.connect(f); f.connect(g); g.connect(p); p.connect(this.swell);
      this.roam(f.frequency, 1800, 3200, [3, 7], [1.2, 2.6], t);
      // 叶子一阵一阵地翻：响度每秒变三四回
      this.roam(g.gain, 0.12, 0.7, [0.15, 0.5], [0.06, 0.16], t);
    }
  }
  schedule(from: number, to: number) { this.roamTo(from, to); }
  gust(t: number, strength: number, dur: number) {
    this.swell.gain.setTargetAtTime(0.55 + strength, t, dur * 0.2);
    this.swell.gain.setTargetAtTime(0.55, t + dur * 0.45, dur * 0.3);
  }
}

// ———————————————————————————— 野 ————————————————————————————
export class FieldWind extends Base {
  private sides: GainNode[] = [];
  private low: GainNode;
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const out = this.slow(1);
    out.connect(bus.dry);
    // 麦与草的「唰」：左右各一路，风浪推过去时一边先响、一边后响
    const srcs = [-0.7, 0.7].map((side) => {
      const s = this.noise('pink', t), f = this.filter('bandpass', 1900, 0.5), hp = this.filter('highpass', 500, 0.6), g = this.slow(0.25), p = this.pan(side);
      s.connect(f); f.connect(hp); hp.connect(g); g.connect(p); p.connect(out);
      this.sides.push(g);
      return s;
    });
    // 旷野里低处的风
    const lf = this.filter('lowpass', 240, 0.5), lh = this.filter('highpass', 70, 0.6);
    this.low = this.slow(0.3);
    srcs[0].connect(lf); lf.connect(lh); lh.connect(this.low); this.low.connect(out);
    this.next = t + rand(0.5, 3);
  }
  schedule(from: number, to: number) {
    const w = this.e.scene.wind;
    while (this.next < to) {
      const t = Math.max(from, this.next), first = Math.random() < 0.5 ? 0 : 1, lag = rand(1, 2.4), len = rand(4, 7), peak = rand(0.5, 1) * (0.5 + 0.8 * w);
      [first, 1 - first].forEach((side, k) => {
        const g = this.sides[side].gain, at = t + k * lag;
        g.setTargetAtTime(0.25 + peak, at, len * 0.22);
        g.setTargetAtTime(0.25, at + len * 0.45, len * 0.3);
      });
      this.next = t + rand(7, 16) / (0.6 + w);
    }
  }
  gust(t: number, strength: number, dur: number) {
    this.low.gain.setTargetAtTime(0.3 + 0.5 * strength, t, dur * 0.2);
    this.low.gain.setTargetAtTime(0.3, t + dur * 0.45, dur * 0.3);
  }
}
