/**
 * 鸟、燕、蝉、蛙、蟋蟀、雁。
 *
 *   鸟（birds）     同时在场零到五只（看时辰、季节、天气、离树多近）。每只是一种叫法、一个固定的音高与方位、远近，
 *                   而且有它自己的那一句（生成一次，之后每回都唱这一句，只在快慢轻重上略有出入——真的鸟就是这样）；
 *                   叫上二三十秒到一分多钟就飞走，换一只来。远的更轻、高处少、回声多。
 *                   黄鹂是圆润的几个哨音带滑；树莺是长长一声然后一个急转；麻雀短而带毛；山雀一高一低地来回；
 *                   斑鸠「咕咕——咕」；布谷只在春夏、很远、很少，一叫是连着几声。
 *   燕（swallows）  一只燕子掠过：一串又细又急的呢喃从一边到另一边。
 *   蝉（cicadas）   三处蝉声各自一涨一落（不同步），叫的时候音高一扬一落；远处另有薄薄的一层底。只取远听的那种，不刺耳。
 *                   鼓膜每秒一百来下的开合是算在噪声的波形里的（pulsedNoise），每处只要「声源 → 窄带 → 涨落 → 方位」四个节点。
 *   蛙（frogs）     四只，各有各的嗓子（每秒四十来下的脉冲去激两个共鸣）；一只叫几声，别的有时跟着应，然后一起静下来。
 *   蟋蟀（crickets）三只：「三四下一组、一组一组地来」，周期各不相同所以不同步，秋凉了叫得慢；另有一只金铃子连成一线的轻颤。
 *   雁（geese）     隔很久一行雁过：远远的两三声。
 */
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { birdDensity, frogAmount, gooseAmount, swallowAmount } from './scene';
import { clamp, lerp, pick, pulsedNoise, rand } from './util';

// ———————————————————————————— 鸟 ————————————————————————————
/** 一个音：[起, 长, 起频, 止频, 幅度, 中途的频率?] */
type Note = [number, number, number, number, number, number?];
interface SingO { type?: OscillatorType; fm?: { rate: number; depth: number }; /** 音高上细细的抖（音分）：纯正弦太「电子」 */ breath?: number; /** 起落都软（斑鸠、布谷） */ soft?: boolean }

/** 一次鸣叫：一个振荡器，音高按每个音的折线走，幅度一段段开合；长音是慢慢涨起来的 */
function sing(e: Engine, dest: AudioNode, t: number, notes: Note[], o: SingO = {}): number {
  const c = e.ctx, osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type ?? 'sine';
  g.gain.setValueAtTime(0, t);
  let end = t;
  for (const [at, len, f0, f1, amp, mid] of notes) {
    const a = t + at, att = len > 0.35 ? len * 0.55 : Math.min(o.soft ? 0.03 : 0.012, len * 0.3), rel = Math.min(o.soft ? 0.07 : 0.03, len * 0.4);
    osc.frequency.setValueAtTime(f0, a);
    if (mid) { osc.frequency.exponentialRampToValueAtTime(mid, a + len * 0.4); osc.frequency.exponentialRampToValueAtTime(f1, a + len); }
    else if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, a + len);
    g.gain.setValueAtTime(0, a);
    g.gain.linearRampToValueAtTime(amp, a + att);
    g.gain.linearRampToValueAtTime(amp * 0.85, a + len - rel);
    g.gain.linearRampToValueAtTime(0, a + len);
    end = Math.max(end, a + len);
  }
  if (o.fm) {
    const m = c.createOscillator(), md = c.createGain();
    m.frequency.value = o.fm.rate; md.gain.value = o.fm.depth;
    m.connect(md); md.connect(osc.frequency);
    m.start(t); m.stop(end + 0.05);
  }
  if (o.breath) {
    const j = e.ctrlSrc('fast', t, rand(0.3, 0.6), end - t + 0.1), jd = c.createGain();
    jd.gain.value = o.breath;
    j.connect(jd); jd.connect(osc.detune);
  }
  osc.connect(g); g.connect(dest);
  osc.start(t); osc.stop(end + 0.05);
  return end - t;
}

type BirdKind = 'oriole' | 'warbler' | 'sparrow' | 'tit' | 'dove' | 'cuckoo' | 'trill' | 'phrase';
interface Species {
  /** 叫完一次歇多久（秒） */
  rest: [number, number];
  sing: SingO;
  level: number;
  far: [number, number];
  pitch: [number, number];
  /** 每回都重新编（麻雀）；否则每只鸟只编一次，之后都唱自己那一句 */
  fresh?: boolean;
  motif(p: number): Note[];
}
const SPECIES: Record<BirdKind, Species> = {
  // 黄鹂：三到五个圆润的哨音，高高低低，各自带滑
  oriole: { rest: [6, 13], sing: { type: 'triangle', breath: 8 }, level: 1.2, far: [0.2, 0.8], pitch: [0.92, 1.1], motif: (p) => {
    const out: Note[] = [];
    let at = 0, f = rand(1500, 1900) * p;
    for (let i = 0, n = 3 + Math.floor(rand(0, 3)); i < n; i++) {
      const len = rand(0.12, 0.24), f1 = clamp(f * pick([1.25, 1.33, 0.8, 0.75, 1.5, 0.67]), 1200 * p, 2800 * p);
      out.push([at, len, f, f1, rand(0.7, 1), Math.random() < 0.4 ? f * rand(0.85, 1.2) : undefined]);
      at += len + rand(0.03, 0.09);
      f = clamp(f1 * pick([1, 1, 1.12, 0.9]), 1200 * p, 2800 * p);
    }
    return out;
  } },
  // 树莺：长长一声慢慢涨起来，然后一个急转的小花
  warbler: { rest: [7, 15], sing: { breath: 6 }, level: 1, far: [0.15, 0.8], pitch: [0.9, 1.12], motif: (p) => {
    const f = rand(1900, 2300) * p, len = rand(0.5, 0.8), out: Note[] = [[0, len, f * 0.97, f * 1.03, 1]];
    let at = len + 0.04;
    for (let k = 0; k < 3; k++) { const f2 = f * pick([1.5, 1.33, 1.68, 1.26]), l = rand(0.06, 0.1); out.push([at, l, f2 * pick([1.15, 0.85]), f2, 0.9]); at += l + 0.02; }
    return out;
  } },
  // 麻雀：一到三声短促的啾，先扬后抑，带一点毛
  sparrow: { rest: [2, 6], sing: { fm: { rate: 220, depth: 380 } }, level: 0.9, far: [0, 0.6], pitch: [0.9, 1.15], fresh: true, motif: (p) => {
    const out: Note[] = [];
    let at = 0;
    for (let i = 0, n = 1 + Math.floor(rand(0, 3)); i < n; i++) { const len = rand(0.05, 0.08); out.push([at, len, 3600 * p, 3300 * p, rand(0.6, 1), 4700 * p]); at += len + rand(0.09, 0.16); }
    return out;
  } },
  // 山雀：一高一低地来回——「吱呗、吱呗」
  tit: { rest: [4, 9], sing: { breath: 5 }, level: 0.9, far: [0.1, 0.8], pitch: [0.88, 1.15], motif: (p) => {
    const out: Note[] = [], hi = rand(4100, 4600) * p, lo = hi * rand(0.76, 0.82), per = rand(0.3, 0.36);
    for (let i = 0, n = 3 + Math.floor(rand(0, 2)); i < n; i++) { out.push([i * per, 0.11, hi, hi * 0.98, 1]); out.push([i * per + 0.14, 0.13, lo, lo * 0.985, 0.85]); }
    return out;
  } },
  // 斑鸠：「咕咕——咕」，低而圆
  dove: { rest: [7, 16], sing: { type: 'triangle', soft: true }, level: 1.5, far: [0.4, 0.95], pitch: [0.94, 1.08], motif: (p) => [[0, 0.2, 470 * p, 480 * p, 0.8], [0.3, 0.42, 500 * p, 478 * p, 1, 522 * p], [0.84, 0.22, 452 * p, 430 * p, 0.7]] },
  // 布谷：两个音，下行小三度；很远
  cuckoo: { rest: [14, 34], sing: { type: 'triangle', soft: true }, level: 1.5, far: [0.6, 1], pitch: [0.96, 1.05], motif: (p) => [[0, 0.17, 642 * p, 630 * p, 1], [0.31, 0.27, 512 * p, 498 * p, 0.9]] },
  // 一串颤音：每秒十七到二十二个下滑的小音，中间响两头轻
  trill: { rest: [6, 12], sing: {}, level: 0.8, far: [0.2, 0.9], pitch: [0.85, 1.1], motif: (p) => {
    const n = 9 + Math.floor(rand(0, 8)), per = 1 / rand(17, 22), out: Note[] = [];
    for (let i = 0; i < n; i++) out.push([i * per, per * 0.66, 5000 * p, 4300 * p, 0.25 + 0.75 * Math.pow(Math.sin((Math.PI * (i + 0.5)) / n), 0.6)]);
    return out;
  } },
  // 清晨的一句（白头鹎一类）：四到七个音，高高低低，各自带滑
  phrase: { rest: [5, 11], sing: { breath: 6 }, level: 1, far: [0, 0.8], pitch: [0.85, 1.2], motif: (p) => {
    const out: Note[] = [];
    let at = 0;
    for (let i = 0, n = 4 + Math.floor(rand(0, 4)); i < n; i++) { const len = rand(0.07, 0.14), f = rand(2300, 4400) * p; out.push([at, len, f, f * rand(0.78, 1.28), rand(0.5, 1)]); at += len + rand(0.03, 0.08); }
    return out;
  } },
};
interface Bird { kind: BirdKind; pitch: number; pan: number; far: number; next: number; until: number; notes: Note[]; run: number }

export class Birds extends Base {
  private flock: Bird[] = [];
  private nextSpawn: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.nextSpawn = t + rand(0.1, 0.8);
  }
  private spawn(t: number): Bird {
    const s = this.e.scene, warm = s.season === 'spring' || s.season === 'summer';
    let bag: BirdKind[];
    if (s.season === 'winter') bag = ['sparrow', 'sparrow', 'sparrow', 'tit'];
    else if (s.season === 'autumn') bag = ['sparrow', 'sparrow', 'sparrow', 'tit', 'tit', 'dove', 'phrase'];
    else if (s.dawn > 0.25) bag = ['oriole', 'oriole', 'warbler', 'warbler', 'phrase', 'phrase', 'phrase', 'sparrow', 'sparrow', 'tit', 'tit', 'dove', 'trill'];
    else if (s.dusk > 0.3) bag = ['sparrow', 'sparrow', 'sparrow', 'dove', 'phrase', 'oriole'];
    else bag = ['sparrow', 'sparrow', 'sparrow', 'phrase', 'phrase', 'tit', 'dove', 'dove', 'warbler', 'oriole'];
    // 布谷要稀：十几只里才有一只，而且同时只有一只
    if (warm && s.dusk < 0.3 && !this.flock.some((b) => b.kind === 'cuckoo')) bag.push('cuckoo');
    const kind = pick(bag), sp = SPECIES[kind], pitch = rand(sp.pitch[0], sp.pitch[1]);
    return { kind, pitch, pan: rand(-0.9, 0.9), far: rand(sp.far[0], sp.far[1]), next: t + rand(0, 1.5), until: t + rand(20, 80), notes: sp.motif(pitch), run: 0 };
  }
  private call(b: Bird, t: number): number {
    const c = this.c, sp = SPECIES[b.kind];
    const out = c.createGain(), lp = c.createBiquadFilter(), pan = c.createStereoPanner(), dry = c.createGain(), wet = c.createGain();
    out.gain.value = 0.085 * sp.level * lerp(1, 0.3, b.far);
    lp.type = 'lowpass'; lp.frequency.value = lerp(9500, 4300, b.far); lp.Q.value = 0.5;
    pan.pan.value = b.pan;
    dry.gain.value = 1 - 0.4 * b.far; wet.gain.value = 0.15 + 0.7 * b.far;
    out.connect(lp); lp.connect(pan); pan.connect(dry); pan.connect(wet); dry.connect(this.bus.dry); wet.connect(this.bus.open);
    // 自己那一句，每回快慢轻重略有出入；偶尔只唱前半句
    let notes = sp.fresh ? sp.motif(b.pitch) : b.notes;
    if (!sp.fresh) {
      const k = rand(0.96, 1.05), a = rand(0.8, 1.05), cut = notes.length > 3 && Math.random() < 0.15 ? notes.length - 1 - Math.floor(rand(0, 2)) : notes.length;
      notes = notes.slice(0, cut).map(([at, len, f0, f1, amp, mid]) => [at * k, len * k, f0, f1, amp * a, mid] as Note);
    }
    const d = sing(this.e, out, t, notes, sp.sing);
    this.later(t + d, () => { dry.disconnect(); wet.disconnect(); });
    return d;
  }
  schedule(from: number, to: number) {
    const dens = birdDensity(this.e.scene);
    const want = dens <= 0.015 ? 0 : Math.max(1, Math.round(dens * 3.6));
    while (this.nextSpawn < to) {
      const t = Math.max(from, this.nextSpawn);
      if (this.flock.length < want) this.flock.push(this.spawn(t));
      this.nextSpawn = t + rand(1, 4.5) / Math.max(0.3, dens);
    }
    for (const b of this.flock) {
      const sp = SPECIES[b.kind];
      while (b.next < to && b.next < b.until) {
        const t = Math.max(from, b.next), d = dens > 0.015 ? this.call(b, t) : 0;
        let rest = rand(sp.rest[0], sp.rest[1]) / (0.5 + 0.45 * Math.min(1, dens));
        // 布谷一叫是连着几声，然后歇很久
        if (b.kind === 'cuckoo') { if (b.run <= 0) b.run = 2 + Math.floor(rand(0, 4)); b.run--; if (b.run > 0) rest = rand(0.75, 0.85); }
        b.next = t + d + rest;
      }
    }
    this.flock = this.flock.filter((b) => b.next < b.until);
  }
}

// ———————————————————————————— 燕 ————————————————————————————
export class Swallows extends Base {
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.next = t + rand(0.5, 3);
  }
  /** 一只燕子掠过：一串又细又急的呢喃，从一边到另一边；有时末尾带一串更密的「唧唧唧」 */
  private pass(t: number): number {
    const c = this.c, far = rand(0.15, 0.8), p = rand(0.9, 1.15), notes: Note[] = [];
    let at = 0;
    for (let i = 0, n = 6 + Math.floor(rand(0, 9)); i < n; i++) {
      const len = rand(0.03, 0.06), f = rand(3200, 5600) * p;
      notes.push([at, len, f, f * rand(0.75, 1.3), rand(0.4, 1)]);
      at += len + rand(0.02, 0.07) + (Math.random() < 0.15 ? rand(0.08, 0.2) : 0);
    }
    if (Math.random() < 0.35) {
      const per = 1 / rand(55, 70);
      for (let i = 0, n = 8 + Math.floor(rand(0, 7)); i < n; i++) notes.push([at + i * per, per * 0.6, 4600 * p, 4300 * p, 0.6]);
    }
    const out = c.createGain(), lp = c.createBiquadFilter(), pan = c.createStereoPanner(), dry = c.createGain(), wet = c.createGain();
    out.gain.value = 0.05 * lerp(1, 0.35, far);
    lp.type = 'lowpass'; lp.frequency.value = lerp(8500, 5000, far); lp.Q.value = 0.5;
    dry.gain.value = 1 - 0.4 * far; wet.gain.value = 0.1 + 0.5 * far;
    out.connect(lp); lp.connect(pan); pan.connect(dry); pan.connect(wet); dry.connect(this.bus.dry); wet.connect(this.bus.open);
    const d = sing(this.e, out, t, notes, { breath: 10 }), p0 = rand(-0.9, 0.9);
    pan.pan.setValueAtTime(p0, t);
    pan.pan.linearRampToValueAtTime(clamp(p0 + (p0 > 0 ? -1 : 1) * rand(0.5, 1.3), -1, 1), t + d);
    this.later(t + d, () => { dry.disconnect(); wet.disconnect(); });
    return d;
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      const t = Math.max(from, this.next), amt = swallowAmount(this.e.scene);
      const d = amt > 0.02 ? this.pass(t) : 0;
      this.next = t + d + rand(4, 13) / (0.35 + amt);
    }
  }
}

// ———————————————————————————— 蝉 ————————————————————————————
export class Cicadas extends Base {
  private voices: Array<{ bp: BiquadFilterNode; sw: GainNode; next: number; on: boolean; lvl: number }> = [];
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    // 最高处的「嘶」不要：整层过一道 7.2kHz 的低通
    const out = this.filter('lowpass', 7200, 0.5);
    out.connect(bus.dry);
    ([[4300, 5, 118, -0.55, 1], [5100, 6, 141, 0.5, 0.8], [3700, 4.5, 96, 0.1, 0.6]] as const).forEach(([fc, q, rate, pan, lvl], i) => {
      // 一处蝉声：被每秒一百来下的鼓膜一开一合地调着的噪声（开合是算在波形里的），再过一条窄带
      const s = this.src(e.loopSrc(e.cached('cicada-' + rate, () => pulsedNoise(e.ctx, 3.1, rate)), t));
      const bp = this.filter('bandpass', fc * rand(0.96, 1.04), q), sw = this.slow(0), p = this.pan(pan);
      s.connect(bp); bp.connect(sw); sw.connect(p); p.connect(out);
      this.voices.push({ bp, sw, next: t + (i === 0 ? 0 : rand(1, 6)), on: false, lvl });
      // 远处薄薄的一层底（三处都歇下来时也不至于全静）
      if (i === 0) { const hz = this.filter('bandpass', 4600, 1.5), hg = this.slow(0.1); s.connect(hz); hz.connect(hg); hg.connect(out); this.roam(hg.gain, 0.04, 0.16, [4, 9], [2, 4], t); }
    });
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    for (const v of this.voices) {
      while (v.next < to) {
        const t = Math.max(from, v.next);
        v.on = !v.on;
        if (v.on) {
          // 起：慢慢涨上来，叫上一阵；叫的时候音高一扬一落（「知——了——」）
          const len = rand(6, 15), rise = rand(0.7, 1.6);
          v.sw.gain.setTargetAtTime(v.lvl * rand(0.55, 1), t, rise);
          for (let x = rise * 2; x < len - 1; x += rand(1.3, 2.6)) {
            v.bp.detune.setTargetAtTime(rand(60, 150), t + x, 0.25);
            v.bp.detune.setTargetAtTime(rand(-110, -40), t + x + rand(0.5, 0.9), 0.35);
          }
          v.next = t + len;
        } else {
          // 落：一两秒退下去，歇一阵
          v.sw.gain.setTargetAtTime(v.lvl * rand(0, 0.1), t, rand(0.8, 1.6));
          v.bp.detune.setTargetAtTime(0, t, 1);
          v.next = t + rand(3, 10);
        }
      }
    }
  }
}

// ———————————————————————————— 蛙 ————————————————————————————
interface Frog { rate: number; f1: number; f2: number; pan: number; far: number; next: number }
export class Frogs extends Base {
  private frogs: Frog[] = [];
  private out: GainNode;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.out = this.slow(1);
    this.out.connect(bus.dry);
    const wet = this.slow(0.2);
    this.out.connect(wet); wet.connect(bus.open);
    for (let i = 0; i < 4; i++) {
      const f1 = rand(650, 980);
      this.frogs.push({ rate: rand(34, 52), f1, f2: f1 * rand(2.2, 2.9), pan: rand(-0.8, 0.8), far: i === 0 ? rand(0.1, 0.3) : rand(0.25, 0.9), next: t + (i === 0 ? rand(0.3, 1.5) : rand(1, 9)) });
    }
  }
  /** 一声「呱」：每秒四十来下的脉冲（一个很慢的锯齿波）去激喉囊的两个共鸣 */
  private croak(f: Frog, t: number, len: number, amp: number) {
    const c = this.c, osc = c.createOscillator(), hp = c.createBiquadFilter(), b1 = c.createBiquadFilter(), b2 = c.createBiquadFilter(), g2 = c.createGain(), g = c.createGain(), lp = c.createBiquadFilter(), p = c.createStereoPanner();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f.rate * 0.94, t);
    osc.frequency.linearRampToValueAtTime(f.rate * 1.06, t + len);
    // 脉冲本身的低处（四十赫兹的整数倍）要切干净，不然底下有一层「突突突」
    hp.type = 'highpass'; hp.frequency.value = 480; hp.Q.value = 0.7;
    const hp2 = c.createBiquadFilter();
    hp2.type = 'highpass'; hp2.frequency.value = 420; hp2.Q.value = 0.7;
    b1.type = 'bandpass'; b1.frequency.value = f.f1; b1.Q.value = 5;
    b2.type = 'bandpass'; b2.frequency.value = f.f2; b2.Q.value = 7;
    g2.gain.value = 0.45;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.025);
    g.gain.linearRampToValueAtTime(amp * 0.9, t + len - 0.06);
    g.gain.linearRampToValueAtTime(0, t + len);
    lp.type = 'lowpass'; lp.frequency.value = lerp(6000, 1800, f.far); lp.Q.value = 0.5;
    p.pan.value = f.pan;
    osc.connect(hp); hp.connect(b1); hp.connect(b2); b1.connect(g); b2.connect(g2); g2.connect(g); g.connect(hp2); hp2.connect(lp); lp.connect(p); p.connect(this.out);
    osc.start(t); osc.stop(t + len + 0.05);
    this.later(t + len, () => p.disconnect());
  }
  schedule(from: number, to: number) {
    const dens = 0.35 + 0.65 * clamp(frogAmount(this.e.scene));
    // 一只叫起来会把别的带起来，所以要反复看，直到这一段里再没有该叫的
    for (let again = true, guard = 0; again && guard < 200; guard++) {
      again = false;
      for (const f of this.frogs) {
        while (f.next < to) {
          let t = Math.max(from, f.next);
          const amp = 0.5 * lerp(1, 0.3, f.far);
          for (let i = 0, n = 2 + Math.floor(rand(0, 4)); i < n; i++) { const len = rand(0.16, 0.3); this.croak(f, t, len, amp * rand(0.7, 1)); t += len + rand(0.12, 0.28); }
          f.next = t + rand(7, 22) / dens;
          for (const o of this.frogs) if (o !== f && o.next > t + 2 && Math.random() < 0.18) { o.next = t + rand(0.3, 2.2); again = true; }
        }
      }
    }
  }
}

// ———————————————————————————— 蟋蟀 ————————————————————————————
export class Crickets extends Base {
  private bouts: Array<{ g: GainNode; level: number; next: number; on: boolean; long: boolean }> = [];
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const slow = e.scene.season === 'autumn' ? 1.35 : 1;
    const voice = (fc: number, period: number, pulses: number, width: number, level: number, pan: number, long: boolean) => {
      // 一只虫一个周期的鸣叫直接算成一小段波形，循环着放（接缝落在两声之间的静处）：不用振荡器，也不用调幅的节点
      const s = this.src(e.loopSrc(this.chirp(fc * rand(0.98, 1.02), period, pulses, width), t)), bout = this.slow(level), p = this.pan(pan);
      s.connect(bout); bout.connect(p); p.connect(bus.dry);
      this.bouts.push({ g: bout, level, next: t + rand(4, 14), on: true, long });
    };
    // 三只蟋蟀：各自一个 4.3–5.1kHz 的音，「三四下一组、一组一组地来」
    for (const [fc, period, pan, pulses] of [[4350, 0.62, -0.6, 4], [4720, 0.71, 0.5, 3], [5050, 0.55, 0.1, 3]] as const) voice(fc, period * slow * rand(0.94, 1.06), pulses, 0, 0.09, pan, false);
    // 一只金铃子：低一些，连成一线的颤（每秒四十几下），很轻
    voice(3150, 1 / rand(42, 50), 1, 0.55, 0.03, 0.35, true);
  }
  /** 一个鸣叫周期：pulses 个小包（每个 16 毫秒，或占周期的 width 成），包里是 fc 的正弦，其余是静的 */
  private chirp(fc: number, period: number, pulses: number, width: number): AudioBuffer {
    const sr = this.c.sampleRate, n = Math.floor(sr * period), b = this.c.createBuffer(1, n, sr), d = b.getChannelData(0);
    const w = width ? Math.floor(n * width) : Math.floor(sr * 0.016), gap = Math.floor(sr * 0.031), k2 = (Math.PI * 2 * fc) / sr;
    for (let k = 0; k < pulses; k++) for (let i = 0; i < w && k * gap + i < n; i++) d[k * gap + i] = Math.sin(k2 * i) * Math.pow(Math.sin((Math.PI * i) / w), 2) * (0.7 + 0.3 * (k / pulses));
    return b;
  }
  schedule(from: number, to: number) {
    for (const b of this.bouts) {
      while (b.next < to) {
        const t = Math.max(from, b.next);
        b.on = !b.on;
        b.g.gain.setTargetAtTime(b.on ? b.level : 0, t, b.on ? 0.3 : 0.6);
        b.next = t + (b.on ? (b.long ? rand(5, 16) : rand(8, 25)) : b.long ? rand(6, 20) : rand(3, 10));
      }
    }
  }
}

// ———————————————————————————— 雁 ————————————————————————————
export class Geese extends Base {
  private next: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.next = t + (e.offline ? rand(1, 2) : rand(8, 40));
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      const t = Math.max(from, this.next), amt = gooseAmount(this.e.scene);
      if (amt > 0.05) {
        // 一行雁过：远远的一两阵叫声，从一边慢慢移到另一边
        const p0 = rand(-0.8, 0.8), dir = p0 > 0 ? -1 : 1, dist = rand(0.6, 0.9);
        let at = t;
        for (let i = 0, n = 1 + Math.floor(rand(0, 2.5)); i < n; i++) {
          this.say('goose', at, { variant: 'wild', vel: rand(0.4, 0.7), dist: clamp(dist + rand(-0.05, 0.05)), pan: clamp(p0 + dir * i * rand(0.15, 0.3), -0.9, 0.9), rate: rand(0.92, 1.1) });
          at += rand(2.5, 5);
        }
      }
      this.next = t + rand(50, 160) / (0.3 + 0.7 * amt);
    }
  }
}
