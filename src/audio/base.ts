/**
 * 环境层的共同底子：记下自己建的节点，拆的时候一起停、一起断。
 *
 * 省节点是这里的头一条规矩（每多一个节点，声音线程每秒就多算四万八千个样本）：
 *   参数要慢慢游走，就用 roam——排程时顺手排几个渐变，不为它另建「调制源 + 增益」；
 *   回声那一路（bus.open）谁真要谁才去碰——持续的风声水声加不加回声听不出来；
 *   一下一下的小声音用 say / mini，响完自己拆。
 */
import type { Engine, LayerBus, LayerImpl, Mix, Voice } from './engine';
import type { PlayOpts, Shot } from './types';
import { distMix, dripBuffer, rand } from './util';

type Span = readonly [number, number];
interface Roamer { p: AudioParam; lo: number; hi: number; every: Span; tau: Span; next: number }

export abstract class Base implements LayerImpl {
  protected c: BaseAudioContext;
  private srcs: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private roamers: Roamer[] = [];
  constructor(protected e: Engine, protected bus: LayerBus) { this.c = e.ctx; }

  protected keep<T extends AudioNode>(n: T): T { this.nodes.push(n); return n; }
  /** 常驻的声源（建的人自己 start） */
  protected src<T extends AudioScheduledSourceNode>(n: T): T { this.srcs.push(n); this.nodes.push(n); return n; }
  protected gain(v: number): GainNode { const g = this.keep(this.c.createGain()); g.gain.value = v; return g; }
  /**
   * 一路慢慢变的增益（游走、一阵风、跟着场景走）：按「每 128 个样本一个值」算——省掉逐样本算包络的工夫。
   * 只用在噪声一类的声音、或变得很慢（零点几秒以上）的地方；要几毫秒里起落的包络（嗓子、一击）仍用 gain()。
   */
  protected slow(v: number): GainNode {
    const g = this.gain(v);
    try { g.gain.automationRate = 'k-rate'; } catch { /* 老浏览器不认，照旧 */ }
    return g;
  }
  protected filter(type: BiquadFilterType, f: number, q = 1): BiquadFilterNode {
    const b = this.keep(this.c.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  }
  protected pan(p: number): StereoPannerNode { const n = this.keep(this.c.createStereoPanner()); n.pan.value = p; return n; }
  /** 一路常驻的噪声（原速放，从随机位置起——同一段噪声错开了放，左右就不相关） */
  protected noise(kind: 'white' | 'pink' | 'brown', t: number): AudioBufferSourceNode { return this.src(this.e.noiseSrc(kind, t)); }
  /**
   * 让一个参数自己游走：每隔 every 秒换一个去处（lo…hi 之间随机取），按 tau 秒的时间常数走过去。
   * 不规则、不重复，而且不用额外的节点。子类的 schedule 里要叫一声 this.roamTo(from, to)。
   */
  protected roam(p: AudioParam, lo: number, hi: number, every: Span, tau: Span, t: number) {
    this.roamers.push({ p, lo, hi, every, tau, next: t + rand(0, every[0]) });
  }
  protected roamTo(from: number, to: number) {
    for (const r of this.roamers) {
      while (r.next < to) {
        const t = Math.max(from, r.next);
        r.p.setTargetAtTime(rand(r.lo, r.hi), t, rand(r.tau[0], r.tau[1]));
        r.next = t + rand(r.every[0], r.every[1]);
      }
    }
  }
  /** 到了 at 之后做一件收尾的事（把响完的那一小串节点断开） */
  protected later(at: number, fn: () => void) { this.e.after(at + 0.3, fn); }
  /**
   * 层里排一声现成的一击（檐滴、鸡叫、锤声……）：接到这一层自己的出口上，跟着这一层的音量、方位、室内的闷走。
   * 同时在响的太多时这一声会被省掉。dry 不给就是这一层的干声出口；回声的多少按远近定（mix.open 为 0 就不碰回声那一路）。
   */
  protected say(shot: Shot, t: number, opts: PlayOpts = {}, dry: AudioNode = this.bus.dry, mix: Mix = distMix(opts.dist ?? 0)): number {
    return this.e.voice(shot, opts, t, { dry, open: mix.open > 0 ? this.bus.open : undefined }, mix, true);
  }
  /**
   * 层里自己搭的一小声（用 kit.ts 的零件）：给一个出口，接到 dest（默认这一层的干声出口），tail 秒后断开。
   * open：另送多少到回声那一路。
   */
  protected mini(t: number, tail: number, o: { vel?: number; pan?: number; gain?: number; dest?: AudioNode; open?: number } = {}): Voice {
    const c = this.c, out = c.createGain(), made: AudioNode[] = [];
    out.gain.value = o.gain ?? 1;
    let head: AudioNode = out;
    if (o.pan) { const p = c.createStereoPanner(); p.pan.value = o.pan; out.connect(p); head = p; }
    head.connect(o.dest ?? this.bus.dry);
    made.push(head);
    if (o.open) { const w = c.createGain(); w.gain.value = o.open; head.connect(w); w.connect(this.bus.open); made.push(w); }
    this.later(t + tail, () => { for (const n of made) { try { n.disconnect(); } catch { /* 已断 */ } } });
    return { e: this.e, ctx: c, t, out, vel: o.vel ?? 0.7, pitch: 1, dur: undefined, dist: 0, raw: {} };
  }

  /**
   * 一滴水（层里用的省事版本）：放一小段算好的波形，三个节点，零点几秒后拆。
   * amp 幅度；rate 变速也就是变音高（1 是 1kHz 起的泡，0.7 低、1.5 高）；四成的机会后面跟一颗更小更高的。
   */
  protected plink(t: number, amp: number, pan: number, rate: number, dest: AudioNode = this.bus.dry) {
    const c = this.c, buf = this.e.cached('drip', () => dripBuffer(c)), p = c.createStereoPanner();
    p.pan.value = pan;
    p.connect(dest);
    const one = (at: number, a: number, r: number) => {
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = buf; s.playbackRate.value = r; g.gain.value = a;
      s.connect(g); g.connect(p);
      s.start(at);
    };
    one(t, amp, rate);
    if (Math.random() < 0.4) one(t + rand(0.06, 0.09), amp * 0.4, rate * 1.3);
    this.later(t + 0.35, () => p.disconnect());
  }

  abstract schedule(from: number, to: number): void;
  dispose() {
    for (const s of this.srcs) { try { s.stop(); } catch { /* 没起或已停 */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* 已断 */ } }
    this.srcs = []; this.nodes = []; this.roamers = [];
  }
}
