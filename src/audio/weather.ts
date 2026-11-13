/**
 * 雨、雨后的滴水、雪、夜的静。
 *
 *   雨（rain）  四样叠起来，各占多少看人在哪：
 *                 雨幕——空中与地上的沙沙（高处一片，密度慢慢起伏）；
 *                 茅顶——软而闷的一层（茅草吸声，没有瓦上那种脆响），在屋里、檐下最明显；
 *                 叶上——脆的点点（预先算好的一片雨点，两路快慢不同地循环）；树多的地方多；
 *                 水上——细碎的「叮」（每一点是一个很小的水泡）；离溪、池、河近才有。
 *               给了 storm（雷雨）时，隔一阵自己排一声远雷。
 *   滴（drips） 檐头、叶尖滴下来的水：几处各有各的节奏（不是乱洒）；雨停之后越滴越慢，一两分钟后干了。
 *   雪（snow）  落雪几乎没有声音：极轻的一层「簌簌」；隔很久，枝上的雪滑下来「噗」的一声。（天地变闷是引擎那一头做的。）
 *   夜（night） 夜的底：很低的一点「空」（三四百赫兹上也有一点，小喇叭才听得见），免得夜里是数字的死寂。远处的犬吠归村里那一层管。
 */
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { burst } from './kit';
import { eaveAt } from './scene';
import { bubbleField, lerp, patterField, rand } from './util';

// ———————————————————————————— 雨 ————————————————————————————
export class Rain extends Base {
  private thatch: GainNode;
  private leaf: GainNode;
  private pond: GainNode;
  private nextThunder: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const c = e.ctx, out = this.slow(1);
    out.connect(bus.dry);
    // 雨幕
    const white = this.noise('white', t), hp = this.filter('highpass', 1400, 0.5), pk = this.filter('peaking', 3800, 0.8), lp = this.filter('lowpass', 6500, 0.5), veil = this.slow(0.06);
    pk.gain.value = 3;
    white.connect(hp); hp.connect(pk); pk.connect(lp); lp.connect(veil); veil.connect(out);
    this.roam(veil.gain, 0.042, 0.078, [3, 7], [1.5, 3], t);
    // 茅顶：一层低而软的底，加一片闷的雨点
    this.thatch = this.slow(0.1);
    this.thatch.connect(out);
    const pink = this.noise('pink', t), tf = this.filter('bandpass', 480, 0.6), tl = this.filter('lowpass', 1500, 0.5), tg = this.slow(0.55);
    pink.connect(tf); tf.connect(tl); tl.connect(tg); tg.connect(this.thatch);
    const dull = e.cached('patter-thatch', () => patterField(c, { seconds: 6.1, rate: 80, len: [0.004, 0.011], bright: [0.04, 0.2] }));
    this.src(e.loopSrc(dull, t)).connect(this.thatch);
    // 叶上（也是地上、石上）：脆的点点。两路快慢不同，合起来的花样很久才重复
    this.leaf = this.slow(0.3);
    this.leaf.connect(out);
    const crisp = e.cached('patter-leaf', () => patterField(c, { seconds: 5.3, rate: 42, len: [0.002, 0.007], bright: [0.2, 0.62] }));
    for (const [rate, side] of [[0.93, -0.5], [1.07, 0.5]] as const) {
      const s = this.src(e.loopSrc(crisp, t, rate)), g = this.slow(0.5), p = this.pan(side);
      s.connect(g); g.connect(p); p.connect(this.leaf);
      this.roam(g.gain, 0.38, 0.62, [3, 7], [1.5, 3], t);
    }
    // 水上：每一点是一个很小的水泡，前面带砸下去的那一下
    this.pond = this.slow(0);
    this.pond.connect(out);
    const plinks = e.cached('bubbles-rain', () => bubbleField(c, { seconds: 6.7, rate: 55, fLo: 1600, fHi: 6000, q: 9, tick: 0.4, skew: 2 }));
    for (const rate of [0.95, 1.09]) this.src(e.loopSrc(plinks, t, rate)).connect(this.pond);
    this.nextThunder = t + (e.offline ? rand(1, 2.5) : rand(8, 30));
    this.scene(t);
  }
  scene(t: number) {
    const s = this.e.scene, n = s.near;
    this.thatch.gain.setTargetAtTime(lerp(0.06, 0.55, Math.max(s.indoor, 0.6 * eaveAt(s))), t, 0.6);
    this.leaf.gain.setTargetAtTime(0.22 + 0.5 * Math.max(n.grove, n.bamboo, 0.5 * n.pines), t, 0.6);
    this.pond.gain.setTargetAtTime(0.28 * Math.max(0.8 * n.stream, n.pond, n.river), t, 0.6);
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    while (this.nextThunder < to) {
      const t = Math.max(from, this.nextThunder), storm = this.e.scene.storm;
      // 雷只在雷雨里：远远的一滚，接在这一层上（跟着雨的音量、室内的闷走）
      if (storm > 0.05) this.say('thunder', t, { vel: rand(0.4, 0.8) * (0.6 + 0.4 * storm), dist: rand(0.5, 0.92), dur: rand(5, 10), pan: rand(-0.6, 0.6) }, this.bus.dry, { dry: 1, hall: 0, open: 0.3 });
      this.nextThunder = t + rand(35, 90) / (0.3 + 0.7 * storm);
    }
  }
}

// ———————————————————————————— 滴 ————————————————————————————
export class Drips extends Base {
  private spots: Array<{ pan: number; pitch: number; period: number; next: number }> = [];
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    // 四处滴水的地方：各自的快慢、音高（落在土上低、落在水洼里高）、方位
    for (let i = 0; i < 4; i++) this.spots.push({ pan: rand(-0.8, 0.8), pitch: rand(0.7, 1.4), period: rand(0.7, 2.4), next: t + rand(0.1, 1.5) });
  }
  schedule(from: number, to: number) {
    const s = this.e.scene, lvl = Math.max(s.rain, s.wet);
    for (const sp of this.spots) {
      while (sp.next < to) {
        const t = Math.max(from, sp.next);
        this.plink(t, rand(0.14, 0.2), sp.pan + rand(-0.05, 0.05), sp.pitch * rand(0.72, 1.3));
        // 越干滴得越慢
        sp.next = t + (sp.period * rand(0.85, 1.2)) / (0.25 + 0.75 * lvl);
      }
    }
  }
}

// ———————————————————————————— 雪 ————————————————————————————
export class Snow extends Base {
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    // 落雪的「簌簌」
    const pink = this.noise('pink', t), lp = this.filter('lowpass', 2200, 0.5), hp = this.filter('highpass', 300, 0.6), g = this.slow(0.08);
    pink.connect(lp); lp.connect(hp); hp.connect(g); g.connect(bus.dry);
    this.roam(g.gain, 0.05, 0.11, [4, 9], [2, 4], t);
    // 极细的一点沙（雪粒落在枯叶上）
    const bf = this.filter('bandpass', 5200, 0.7), bg = this.slow(0.03);
    pink.connect(bf); bf.connect(bg); bg.connect(bus.dry);
    this.roam(bg.gain, 0.008, 0.05, [0.2, 0.6], [0.08, 0.2], t);
    this.next = t + (e.offline ? rand(2, 4) : rand(15, 60));
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    while (this.next < to) {
      // 枝上、竹上的雪滑下来：闷的一「噗」，跟着一阵细碎
      const t = Math.max(from, this.next), v = this.mini(t, 1.2, { pan: rand(-0.7, 0.7) });
      burst(v, { dur: 0.25, type: 'lowpass', f: 420, f2: 160, q: 0.7, amp: 0.25, att: 0.03, noise: 'pink' });
      burst(v, { t: t + 0.05, dur: 0.5, f: 3200, q: 0.8, amp: 0.02, att: 0.08 });
      this.next = t + rand(40, 110);
    }
  }
}

// ———————————————————————————— 夜 ————————————————————————————
export class Night extends Base {
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const brown = this.noise('brown', t), lf = this.filter('lowpass', 190, 0.5), lh = this.filter('highpass', 70, 0.6), g = this.slow(0.2);
    brown.connect(lf); lf.connect(lh); lh.connect(g); g.connect(bus.dry);
    this.roam(g.gain, 0.14, 0.26, [6, 12], [3, 6], t);
    const pink = this.noise('pink', t), mf = this.filter('bandpass', 420, 0.5), mg = this.slow(0.3);
    pink.connect(mf); mf.connect(mg); mg.connect(bus.dry);
  }
  schedule(from: number, to: number) { this.roamTo(from, to); }
}
