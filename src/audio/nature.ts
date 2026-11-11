/**
 * 山里的声音：风、鸟、泉、雨、虫，远钟与檐角的风铎。
 * 持续的声（风、泉、雨的底、虫）是常驻的噪声 / 振荡器，靠慢慢游走的参数活起来；
 * 一下一下的声（鸟、檐滴、钟、铎）在 schedule(from, to) 里按随机的间隔排出来。
 */
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { cicadaAmount, cricketAmount } from './scene';
import { CTRL_SR, clamp, lerp, pick, rand } from './util';

// ———————————————————————————— 风 ————————————————————————————
/**
 * 山风与松涛：两路粉噪声。松涛在 330–880Hz（左右各一路，中心与响度各自慢慢游走，不是规则的摆）；
 * 低处一层风的身子；高处才有一点 1.4–2.6kHz 的啸。一阵风来，整体涨上去再落回。
 */
export class Wind extends Base {
  private pine: Array<{ f: BiquadFilterNode; g: GainNode; next: number }> = [];
  private low: GainNode;
  private wh: { f: BiquadFilterNode; g: GainNode; next: number };
  private swellG: GainNode;
  private nextLow: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.swellG = this.gain(1);
    this.swellG.connect(bus.dry);
    const wet = this.gain(0.1);
    this.swellG.connect(wet); wet.connect(bus.open);
    const a = this.src(e.noiseSrc('pink', t, undefined, 0.97)), b = this.src(e.noiseSrc('pink', t, undefined, 1.04));
    [a, b].forEach((s, i) => {
      // 粉噪声低处本来就重，先切掉 240Hz 以下，松涛才显出来
      const hp = this.filter('highpass', 240, 0.6), f = this.filter('bandpass', rand(420, 640), 0.9), g = this.gain(0.75), p = this.pan(i ? 0.45 : -0.45);
      s.connect(hp); hp.connect(f); f.connect(g); g.connect(p); p.connect(this.swellG);
      this.pine.push({ f, g, next: t + rand(0, 2) });
    });
    const lf = this.filter('lowpass', 230, 0.5), lh = this.filter('highpass', 90, 0.6);
    this.low = this.gain(0.1);
    a.connect(lf); lf.connect(lh); lh.connect(this.low); this.low.connect(this.swellG);
    const wf = this.filter('bandpass', 1900, 4), wg = this.gain(0);
    b.connect(wf); wf.connect(wg); wg.connect(this.swellG);
    this.wh = { f: wf, g: wg, next: t };
    this.nextLow = t;
  }
  schedule(from: number, to: number) {
    const h = this.e.scene.height;
    for (const p of this.pine) {
      while (p.next < to) {
        const t = Math.max(from, p.next), tau = rand(1.2, 2.6);
        p.f.frequency.setTargetAtTime(rand(330, 880), t, tau);
        p.g.gain.setTargetAtTime(rand(0.35, 1.1), t, tau);
        p.next = t + rand(3, 7);
      }
    }
    while (this.nextLow < to) {
      const t = Math.max(from, this.nextLow);
      this.low.gain.setTargetAtTime(rand(0.06, 0.16), t, rand(2, 4));
      this.nextLow = t + rand(4, 9);
    }
    while (this.wh.next < to) {
      const t = Math.max(from, this.wh.next), tau = rand(0.8, 2);
      this.wh.f.frequency.setTargetAtTime(rand(1400, 2600), t, tau);
      this.wh.g.gain.setTargetAtTime(0.015 + h * rand(0.05, 0.5), t, tau);
      this.wh.next = t + rand(2.5, 6);
    }
  }
  gust(t: number, strength: number, dur: number) {
    this.swellG.gain.setTargetAtTime(1 + strength * 1.1, t, dur * 0.2);
    this.swellG.gain.setTargetAtTime(1, t + dur * 0.45, dur * 0.28);
  }
}

// ———————————————————————————— 鸟 ————————————————————————————
type BirdKind = 'chirp' | 'trill' | 'cuckoo' | 'dove' | 'whistle' | 'phrase' | 'tit';
interface Bird { kind: BirdKind; pitch: number; pan: number; far: number; next: number; until: number }
/** 一个音：[起, 长, 起频, 止频, 幅度, 中途的频率?] */
type Note = [number, number, number, number, number, number?];

/** 一次鸣叫：一个振荡器，音高按每个音的折线走，幅度一段段开合 */
function sing(c: BaseAudioContext, dest: AudioNode, t: number, notes: Note[], type: OscillatorType = 'sine'): number {
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = type;
  g.gain.setValueAtTime(0, t);
  let end = t;
  for (const [at, len, f0, f1, amp, mid] of notes) {
    const a = t + at, att = Math.min(0.012, len * 0.3), rel = Math.min(0.03, len * 0.4);
    osc.frequency.setValueAtTime(f0, a);
    if (mid) { osc.frequency.exponentialRampToValueAtTime(mid, a + len * 0.4); osc.frequency.exponentialRampToValueAtTime(f1, a + len); }
    else if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, a + len);
    g.gain.setValueAtTime(0, a);
    g.gain.linearRampToValueAtTime(amp, a + att);
    g.gain.setValueAtTime(amp, a + len - rel);
    g.gain.linearRampToValueAtTime(0, a + len);
    end = Math.max(end, a + len);
  }
  osc.connect(g); g.connect(dest);
  osc.start(t); osc.stop(end + 0.05);
  return end - t;
}
const CALLS: Record<BirdKind, { rest: number; type?: OscillatorType; notes(p: number): Note[] }> = {
  // 短促的啾：一到三声，每声先扬后抑
  chirp: { rest: 2.6, notes: (p) => {
    const n = 1 + Math.floor(rand(0, 3)), out: Note[] = [];
    let at = 0;
    for (let i = 0; i < n; i++) { const len = rand(0.05, 0.08); out.push([at, len, 3600 * p, 3300 * p, rand(0.6, 1), 4700 * p]); at += len + rand(0.09, 0.16); }
    return out;
  } },
  // 一串颤音：每秒十七到二十二个下滑的小音，中间响两头轻
  trill: { rest: 5, notes: (p) => {
    const n = 9 + Math.floor(rand(0, 8)), per = 1 / rand(17, 22), out: Note[] = [];
    for (let i = 0; i < n; i++) out.push([i * per, per * 0.66, 5000 * p, 4300 * p, 0.25 + 0.75 * Math.pow(Math.sin((Math.PI * (i + 0.5)) / n), 0.6)]);
    return out;
  } },
  // 「布谷」：两个音，下行小三度（只在春夏）
  cuckoo: { rest: 1.25, type: 'triangle', notes: (p) => [[0, 0.2, 604 * p, 598 * p, 1], [0.33, 0.3, 490 * p, 482 * p, 0.9]] },
  // 斑鸠：「咕咕——咕」，低而圆
  dove: { rest: 6.5, type: 'triangle', notes: (p) => [[0, 0.2, 470 * p, 480 * p, 0.8], [0.3, 0.42, 500 * p, 478 * p, 1, 522 * p], [0.84, 0.22, 452 * p, 430 * p, 0.7]] },
  // 一声往下滑的长哨，起头有个小上挑
  whistle: { rest: 4.2, notes: (p) => { const len = rand(0.45, 0.75); return [[0, 0.07, 3000 * p, 3500 * p, 0.7], [0.07, len, 3500 * p, 2500 * p, 1]]; } },
  // 清晨的一句：五到九个音，高高低低，各自带滑
  phrase: { rest: 5, notes: (p) => {
    const n = 5 + Math.floor(rand(0, 5)), out: Note[] = [];
    let at = 0;
    for (let i = 0; i < n; i++) { const len = rand(0.07, 0.14), f = rand(2300, 4800) * p; out.push([at, len, f, f * rand(0.78, 1.28), rand(0.5, 1)]); at += len + rand(0.03, 0.08); }
    return out;
  } },
  // 一高一低地来回：「吱呗、吱呗」
  tit: { rest: 4, notes: (p) => {
    const n = 3 + Math.floor(rand(0, 2)), out: Note[] = [];
    for (let i = 0; i < n; i++) { out.push([i * 0.33, 0.11, 4400 * p, 4300 * p, 1]); out.push([i * 0.33 + 0.14, 0.13, 3500 * p, 3450 * p, 0.85]); }
    return out;
  } },
};

/**
 * 鸟：同时在场的有零到六只（随时辰、天气、季节），每只是一种叫法、一个固定的音高与方位、远近，
 * 叫上二十到八十秒就飞走，换一只来。远的更轻、高频少、回声多。
 */
export class Birds extends Base {
  private flock: Bird[] = [];
  private nextSpawn: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.nextSpawn = t + rand(0.1, 0.8);
  }
  private spawn(t: number): Bird {
    const s = this.e.scene, warm = s.season === 'spring' || s.season === 'summer';
    const dawn = s.hour < 9, dusk = s.hour > 16;
    const bag: BirdKind[] = dawn
      ? ['phrase', 'phrase', 'phrase', 'chirp', 'chirp', 'chirp', 'trill', 'trill', 'tit', 'tit', 'whistle', 'whistle', 'dove']
      : dusk ? ['chirp', 'chirp', 'chirp', 'whistle', 'whistle', 'dove', 'phrase']
        : ['chirp', 'chirp', 'chirp', 'tit', 'dove', 'dove', 'whistle', 'trill', 'phrase'];
    if (warm) bag.push('cuckoo', 'cuckoo');
    const kind = pick(bag), low = kind === 'cuckoo' || kind === 'dove';
    return { kind, pitch: low ? rand(0.94, 1.08) : rand(0.85, 1.2), pan: rand(-0.9, 0.9), far: low ? rand(0.5, 1) : Math.pow(Math.random(), 0.8), next: t + rand(0, 1.5), until: t + rand(20, 80) };
  }
  private call(b: Bird, t: number): number {
    const c = this.c, spec = CALLS[b.kind];
    const out = c.createGain(), lp = c.createBiquadFilter(), pan = c.createStereoPanner(), dry = c.createGain(), wet = c.createGain();
    out.gain.value = 0.085 * lerp(1, 0.3, b.far) * (spec.type === 'triangle' ? 1.5 : 1);
    lp.type = 'lowpass'; lp.frequency.value = lerp(9500, 4300, b.far); lp.Q.value = 0.5;
    pan.pan.value = b.pan;
    dry.gain.value = 1 - 0.4 * b.far; wet.gain.value = 0.15 + 0.7 * b.far;
    out.connect(lp); lp.connect(pan); pan.connect(dry); pan.connect(wet); dry.connect(this.bus.dry); wet.connect(this.bus.open);
    const d = sing(c, out, t, spec.notes(b.pitch), spec.type);
    this.later(t + d, () => { dry.disconnect(); wet.disconnect(); });
    return d;
  }
  schedule(from: number, to: number) {
    const dens = this.e.birds;
    const want = dens <= 0.01 ? 0 : Math.max(1, Math.round(dens * 6));
    while (this.nextSpawn < to) {
      const t = Math.max(from, this.nextSpawn);
      if (this.flock.length < want) this.flock.push(this.spawn(t));
      this.nextSpawn = t + rand(1, 4.5) / Math.max(0.3, dens);
    }
    for (const b of this.flock) {
      while (b.next < to && b.next < b.until) {
        const t = Math.max(from, b.next);
        const d = this.call(b, t);
        // 布谷一叫就是连着几声；别的叫一次歇一阵
        const again = b.kind === 'cuckoo' && Math.random() < 0.7 ? CALLS.cuckoo.rest : CALLS[b.kind].rest * rand(0.7, 1.6) / (0.55 + 0.6 * Math.min(1, dens)) + (b.kind === 'cuckoo' ? 5 : 0);
        b.next = t + d + again;
      }
    }
    this.flock = this.flock.filter((b) => b.next < b.until);
  }
}

// ———————————————————————————— 泉 ————————————————————————————
/**
 * 山泉：白噪声过五条窄带（460–2600Hz），每条的中心不规则地摆、响度各自一隐一现——水过石头的「汩汩」；
 * 底下一层褐噪声是水的身子，偶尔冒一个小水泡。
 */
export class Stream extends Base {
  private out: GainNode;
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.out = this.gain(1);
    this.out.connect(bus.dry);
    const wet = this.gain(0.08);
    this.out.connect(wet); wet.connect(bus.open);
    const white = this.src(e.noiseSrc('white', t));
    [460, 780, 1180, 1750, 2600].forEach((fc, i) => {
      const f = this.filter('bandpass', fc, 6);
      const m = this.src(e.ctrlSrc('mid', t, rand(0.7, 1.4))), md = this.gain(fc * 0.22);
      m.connect(md); md.connect(f.frequency);
      const g = this.gain(0.75), a = this.src(e.ctrlSrc('mid', t, rand(0.35, 0.8))), ad = this.gain(0.75);
      a.connect(ad); ad.connect(g.gain);
      const p = this.pan((i % 2 ? 1 : -1) * lerp(0.15, 0.55, i / 4));
      white.connect(f); f.connect(g); g.connect(p); p.connect(this.out);
    });
    const brown = this.src(e.noiseSrc('brown', t)), lf = this.filter('lowpass', 700, 0.5), lh = this.filter('highpass', 190, 0.6), lg = this.gain(0.22);
    brown.connect(lf); lf.connect(lh); lh.connect(lg); lg.connect(this.out);
    const hf = this.filter('highpass', 4200, 0.5), hg = this.gain(0.03);
    white.connect(hf); hf.connect(hg); hg.connect(this.out);
    this.next = t + rand(0.2, 1);
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      const t = Math.max(from, this.next);
      this.e.voice('drip', { vel: rand(0.15, 0.45), pan: rand(-0.6, 0.6), pitch: rand(0.8, 1.5) }, t, { dry: this.out }, { dry: 0.5, hall: 0, open: 0 });
      this.next = t + rand(0.4, 2.2);
    }
  }
}

// ———————————————————————————— 雨 ————————————————————————————
/**
 * 雨：高处一层雨幕的沙沙（密度慢慢起伏）；瓦上一层低的（在殿里更明显）；
 * 打在瓦与叶上的点点是预先算好的一段，左右错开循环；檐滴另排，慢而清楚。
 */
export class Rain extends Base {
  private roof: GainNode;
  private dripBus: GainNode;
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const c = this.c;
    const out = this.gain(1);
    out.connect(bus.dry);
    const wet = this.gain(0.07);
    out.connect(wet); wet.connect(bus.open);
    const white = this.src(e.noiseSrc('white', t)), hp = this.filter('highpass', 2400, 0.5), pk = this.filter('peaking', 5200, 0.8), g = this.gain(0.075);
    pk.gain.value = 5;
    white.connect(hp); hp.connect(pk); pk.connect(g); g.connect(out);
    const a = this.src(e.ctrlSrc('slow', t, 1.3)), ad = this.gain(0.022);
    a.connect(ad); ad.connect(g.gain);
    const pink = this.src(e.noiseSrc('pink', t)), lp = this.filter('lowpass', 520, 0.6), rh = this.filter('highpass', 150, 0.6);
    this.roof = this.gain(0.1);
    pink.connect(lp); lp.connect(rh); rh.connect(this.roof); this.roof.connect(out);
    const pat = this.patter();
    // 两路的快慢略有不同，合起来的花样要很久才重复一次
    for (const [off, pan, rate] of [[0, -0.5, 0.93], [2.3, 0.5, 1.07]] as const) {
      const s = this.src(c.createBufferSource());
      s.buffer = pat; s.loop = true; s.playbackRate.value = rate; s.start(t, off);
      const pg = this.gain(0.5), p = this.pan(pan);
      s.connect(pg); pg.connect(p); p.connect(out);
    }
    this.dripBus = this.gain(0.4);
    this.dripBus.connect(out);
    this.next = t + rand(0.2, 1);
    this.scene(t);
  }
  /** 五秒多的雨点：每秒四十来滴，轻的多重的少，每滴明暗不同 */
  private patter(): AudioBuffer {
    const sr = this.c.sampleRate, len = Math.floor(sr * 5.3), b = this.c.createBuffer(1, len, sr), d = b.getChannelData(0);
    for (let k = 0, n = Math.round(5.3 * 42); k < n; k++) {
      const at = Math.floor(Math.random() * (len - 800)), dur = Math.floor(sr * rand(0.002, 0.007)), amp = Math.pow(Math.random(), 2.2) * 0.5 + 0.03, a = rand(0.25, 0.9);
      let lp = 0;
      for (let i = 0; i < dur; i++) { const x = Math.random() * 2 - 1; lp += a * (x - lp); d[at + i] += (x - lp * 0.6) * amp * Math.exp(-i / (dur * 0.3)); }
    }
    return b;
  }
  scene(t: number) {
    this.roof.gain.setTargetAtTime(0.09 + 0.4 * this.e.scene.indoor, t, 0.6);
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      const t = Math.max(from, this.next);
      this.e.voice('drip', { vel: rand(0.3, 0.8), pan: rand(-0.8, 0.8), pitch: rand(0.7, 1.2) }, t, { dry: this.dripBus }, { dry: 1, hall: 0, open: 0 });
      this.next = t + rand(0.5, 2.2);
    }
  }
}

// ———————————————————————————— 虫 ————————————————————————————
/**
 * 夜虫：三只蟋蟀，各自一个 4.3–5.1kHz 的音，叫法是「三四下一组、一组一组地来」——
 * 用一段循环的幅度图样去开合，周期各不相同所以不同步；每只叫一阵歇一阵。
 * 夏天的白天换成极远的蝉：6kHz 附近的窄带噪声，带五十几赫兹的颤，慢慢涨落。
 */
export class Insects extends Base {
  private crickets: GainNode;
  private cicada: GainNode;
  private bouts: Array<{ g: GainNode; next: number; on: boolean }> = [];
  private nextSwell: number;
  private cicadaSwell: GainNode;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const c = this.c;
    this.crickets = this.gain(0);
    this.crickets.connect(bus.dry);
    const wet = this.gain(0.15);
    this.crickets.connect(wet); wet.connect(bus.open);
    for (const [fc, period, pan, pulses] of [[4350, 0.62, -0.6, 4], [4720, 0.71, 0.5, 3], [5050, 0.55, 0.1, 3]] as const) {
      const osc = this.src(c.createOscillator());
      osc.frequency.value = fc * rand(0.98, 1.02);
      const amp = this.gain(0);
      const pat = this.src(c.createBufferSource());
      pat.buffer = this.chirp(period * rand(0.94, 1.06), pulses);
      pat.loop = true;
      pat.connect(amp.gain);
      const bout = this.gain(1), p = this.pan(pan), lvl = this.gain(0.09);
      osc.connect(amp); amp.connect(bout); bout.connect(lvl); lvl.connect(p); p.connect(this.crickets);
      osc.start(t); pat.start(t, rand(0, period * 0.9));
      this.bouts.push({ g: bout, next: t + rand(4, 14), on: true });
    }
    this.cicada = this.gain(0);
    this.cicada.connect(bus.dry);
    const white = this.src(e.noiseSrc('white', t)), bp = this.filter('bandpass', 6200, 7), am = this.gain(0.55);
    const lfo = this.src(c.createOscillator()), depth = this.gain(0.45);
    lfo.frequency.value = 56; lfo.start(t);
    lfo.connect(depth); depth.connect(am.gain);
    this.cicadaSwell = this.gain(0.5);
    white.connect(bp); bp.connect(am); am.connect(this.cicadaSwell); this.cicadaSwell.connect(this.cicada);
    this.nextSwell = t;
    this.balance(t, true);
  }
  /** 一个鸣叫周期的幅度图样：pulses 个 16ms 的小包，间隔 31ms，其余是静的 */
  private chirp(period: number, pulses: number): AudioBuffer {
    const n = Math.floor(CTRL_SR * period), b = this.c.createBuffer(1, n, CTRL_SR), d = b.getChannelData(0);
    const w = Math.floor(CTRL_SR * 0.016), gap = Math.floor(CTRL_SR * 0.031);
    for (let k = 0; k < pulses; k++) for (let i = 0; i < w; i++) d[k * gap + i] = Math.pow(Math.sin((Math.PI * i) / w), 2) * (0.7 + 0.3 * (k / pulses));
    return b;
  }
  scene(t: number) { this.balance(t, false); }
  /** 蟋蟀与蝉各占多少（层的总量已经在外面乘过了） */
  private balance(t: number, now: boolean) {
    const s = this.e.scene, cr = cricketAmount(s), ci = cicadaAmount(s) * 0.5, m = Math.max(cr, ci, 1e-4);
    const a = clamp(cr / m), b = clamp(ci / m) * 0.25;
    if (now) { this.crickets.gain.setValueAtTime(a, t); this.cicada.gain.setValueAtTime(b, t); }
    else { this.crickets.gain.setTargetAtTime(a, t, 1.5); this.cicada.gain.setTargetAtTime(b, t, 1.5); }
  }
  schedule(from: number, to: number) {
    for (const b of this.bouts) {
      while (b.next < to) {
        const t = Math.max(from, b.next);
        b.on = !b.on;
        b.g.gain.setTargetAtTime(b.on ? 1 : 0, t, b.on ? 0.3 : 0.6);
        b.next = t + (b.on ? rand(8, 25) : rand(3, 10));
      }
    }
    while (this.nextSwell < to) {
      const t = Math.max(from, this.nextSwell);
      this.cicadaSwell.gain.setTargetAtTime(rand(0.2, 1), t, rand(1.5, 4));
      this.nextSwell = t + rand(4, 10);
    }
  }
}

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
    this.e.voice('windbell', { vel, pan: b.pan, pitch: b.pitch }, t, { dry: this.out }, { dry: 1, hall: 0, open: 0 });
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
