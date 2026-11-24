/**
 * 鸟、燕、蝉、蛙、蟋蟀、雁。
 *
 *   鸟（birds）     同时在场零到三只（看时辰、季节、天气、离树多近），大多在远处。每只是一种叫法、一个固定的音高与方位、远近，
 *                   而且有它自己的那一句（生成一次，之后每回都唱这一句，只在快慢轻重上略有出入——真的鸟就是这样）；
 *                   叫上二三十秒到一分多钟就飞走，换一只来。远的更轻、高处少、隔着枝叶忽强忽弱。
 *                   怎么合成的见 song.ts：一声是几个很短的音素，音高在音素里走得快，带谐波与气声——不是一个正弦一路唱下去
 *                  （头一版那样做，量下来七成是纯音，听着像口哨、像电子音，在静处瘆人）。
 *                   刚进门的头一分钟更静：头一只鸟隔几秒才叫、在远处，过二十来秒才有第二只（engine.calmUntil）。
 *   燕（swallows）  一只燕子掠过：一串又细又急的呢喃从一边到另一边。
 *   蝉（cicadas）   三处蝉声各自一涨一落（不同步），叫的时候音高一扬一落；远处另有薄薄的一层底。只取远听的那种，不刺耳。
 *                   鼓膜每秒一百来下的开合是算在噪声的波形里的（pulsedNoise），每处只要「声源 → 窄带 → 涨落 → 方位」四个节点。
 *   蛙（frogs）     四只，各有各的嗓子（每秒四十来下的脉冲去激两个共鸣）；一只叫几声，别的有时跟着应，然后一起静下来。
 *   蟋蟀（crickets）三只：「三四下一组、一组一组地来」，周期各不相同所以不同步，秋凉了叫得慢；另有一只金铃子连成一线的轻颤。
 *   雁（geese）     隔很久一行雁过：远远的两三声。
 */
import { chorusOf } from './animals';
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { birdDensity, frogAmount, gooseAmount, swallowAmount } from './scene';
import { playSong, songBuffer, SPECIES, swallowSong, type BirdKind, type El } from './song';
import { clamp, lerp, pick, pulsedNoise, rand } from './util';

// ———————————————————————————— 鸟 ————————————————————————————
/** 一只鸟叫一回的响度（再乘这一种自己的 level、远近） */
const BIRD_GAIN = 0.125;

/** 检查用：有哪几种叫法；某一种叫一回（干声，接到 dest），返回多长 */
export const BIRD_KINDS = Object.keys(SPECIES) as BirdKind[];
export function birdCall(e: Engine, dest: AudioNode, t: number, kind: BirdKind): number {
  const sp = SPECIES[kind], g = e.ctx.createGain();
  g.gain.value = BIRD_GAIN * sp.level;
  g.connect(dest);
  return playSong(e.ctx, g, t, sp.motif(rand(sp.pitch[0], sp.pitch[1])));
}
interface Bird { kind: BirdKind; pitch: number; pan: number; far: number; next: number; until: number; notes: El[]; run: number }

export class Birds extends Base {
  private flock: Bird[] = [];
  private nextSpawn: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    // 刚进门（头一分钟）隔五到十秒才来头一只；平时层建起来也隔一两秒——鸟不会因为人出了门就一齐叫起来
    this.nextSpawn = t + (t < e.calmUntil ? rand(5, 10) : rand(1.2, 3.5));
  }
  private spawn(t: number): Bird {
    const s = this.e.scene, warm = s.season === 'spring' || s.season === 'summer';
    let bag: BirdKind[];
    if (s.season === 'winter') bag = ['sparrow', 'sparrow', 'sparrow', 'tit'];
    else if (s.season === 'autumn') bag = ['sparrow', 'sparrow', 'sparrow', 'tit', 'tit', 'bulbul', 'whiteeye', 'dove'];
    else if (s.dawn > 0.25) bag = ['bulbul', 'bulbul', 'bulbul', 'whiteeye', 'whiteeye', 'tit', 'tit', 'sparrow', 'sparrow', 'oriole', 'trill', 'dove'];
    else if (s.dusk > 0.3) bag = ['sparrow', 'sparrow', 'sparrow', 'bulbul', 'tit', 'dove'];
    else bag = ['sparrow', 'sparrow', 'sparrow', 'bulbul', 'bulbul', 'whiteeye', 'whiteeye', 'tit', 'oriole', 'trill', 'dove'];
    // 布谷要稀：十几只里才有一只，而且同时只有一只
    if (warm && s.dusk < 0.3 && !this.flock.some((b) => b.kind === 'cuckoo')) bag.push('cuckoo');
    const kind = pick(bag), sp = SPECIES[kind], pitch = rand(sp.pitch[0], sp.pitch[1]);
    // 刚进门的头一只总在远处
    const far = Math.max(rand(sp.far[0], sp.far[1]), t < this.e.calmUntil && !this.flock.length ? 0.6 : 0);
    return { kind, pitch, pan: rand(-0.85, 0.85), far, next: t + rand(0.4, 2.5), until: t + rand(20, 80), notes: sp.motif(pitch), run: 0 };
  }
  private call(b: Bird, t: number): number {
    const c = this.c, sp = SPECIES[b.kind];
    const out = c.createGain(), lp = c.createBiquadFilter(), pan = c.createStereoPanner(), dry = c.createGain(), wet = c.createGain();
    out.gain.value = BIRD_GAIN * sp.level * lerp(1, 0.32, b.far);
    lp.type = 'lowpass'; lp.frequency.value = lerp(10000, 4200, Math.pow(b.far, 0.9)); lp.Q.value = 0.5;
    pan.pan.value = b.pan;
    // 回声少：野外的散尾送多了，远处一声鸟叫后面拖着一片「嗡」，反倒像空谷里的哨子
    dry.gain.value = 1 - 0.3 * b.far; wet.gain.value = (0.05 + 0.2 * b.far) * (b.kind === 'dove' || b.kind === 'cuckoo' ? 0.5 : 1);
    out.connect(lp); lp.connect(pan); pan.connect(dry); pan.connect(wet); dry.connect(this.bus.dry); wet.connect(this.bus.open);
    // 自己那一句，每回快慢轻重略有出入；偶尔只唱前半句
    let notes = sp.fresh ? sp.motif(b.pitch) : b.notes;
    if (!sp.fresh) {
      const k = rand(0.96, 1.05), a = rand(0.8, 1.05), cut = notes.length > 3 && Math.random() < 0.15 ? notes.length - 1 - Math.floor(rand(0, 2)) : notes.length;
      notes = notes.slice(0, cut).map((n) => ({ ...n, at: n.at * k, len: n.len * k, amp: n.amp * a }));
    }
    const d = playSong(c, out, t, notes, { fade: 0.4 * b.far });
    this.later(t + d, () => { dry.disconnect(); wet.disconnect(); });
    return d;
  }
  schedule(from: number, to: number) {
    const dens = birdDensity(this.e.scene), calm = this.e.calmUntil;
    let want = dens <= 0.015 ? 0 : Math.max(1, Math.round(dens * 3.4));
    // 头一分钟：二十来秒里只一只，再过一阵才到两只
    if (from < calm) want = Math.min(want, calm - from > 35 ? 1 : 2);
    while (this.nextSpawn < to) {
      const t = Math.max(from, this.nextSpawn);
      if (this.flock.length < want) this.flock.push(this.spawn(t));
      this.nextSpawn = t + rand(2, 6) / Math.max(0.3, dens);
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
    // 刚进门的头一分钟里燕子也晚一点来
    this.next = t + (t < e.calmUntil ? rand(14, 30) : rand(1.5, 5));
  }
  /** 一只燕子掠过：一串又细又急的呢喃，从一边到另一边；有时末尾带一串更密的「唧唧唧」 */
  private pass(t: number): number {
    const c = this.c, far = rand(0.25, 0.85), b = songBuffer(c, swallowSong(rand(0.9, 1.15)), { fade: 0.3 * far }), s = c.createBufferSource();
    const out = c.createGain(), lp = c.createBiquadFilter(), pan = c.createStereoPanner(), dry = c.createGain(), wet = c.createGain();
    out.gain.value = 0.045 * lerp(1, 0.35, far);
    lp.type = 'lowpass'; lp.frequency.value = lerp(9000, 5000, far); lp.Q.value = 0.5;
    dry.gain.value = 1 - 0.3 * far; wet.gain.value = 0.06 + 0.3 * far;
    s.buffer = b; s.connect(out);
    out.connect(lp); lp.connect(pan); pan.connect(dry); pan.connect(wet); dry.connect(this.bus.dry); wet.connect(this.bus.open);
    s.start(t);
    const d = b.duration, p0 = rand(-0.9, 0.9);
    pan.pan.setValueAtTime(p0, t);
    pan.pan.linearRampToValueAtTime(clamp(p0 + (p0 > 0 ? -1 : 1) * rand(0.5, 1.3), -1, 1), t + d);
    this.later(t + d, () => { dry.disconnect(); wet.disconnect(); });
    return d;
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      const t = Math.max(from, this.next), amt = swallowAmount(this.e.scene);
      const d = amt > 0.02 ? this.pass(t) : 0;
      this.next = t + d + rand(5, 15) / (0.35 + amt);
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
  /** 远处成片的蛙（夏夜池边、田里）：一段算好的循环，蛙多、离水近时才接上 */
  private chorus: GainNode | null = null;
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
    this.scene(t);
  }
  scene(t: number) {
    const s = this.e.scene, n = s.near, k = clamp((frogAmount(s) - 0.3) / 0.7) * Math.max(n.pond, 0.7 * n.stream, 0.8 * n.fields, 0.5 * n.river);
    if (!this.chorus && k > 0.03) {
      const src = this.src(this.e.loopSrc(chorusOf(this.e), t, rand(0.92, 0.98))), lp = this.filter('lowpass', 1500, 0.5);
      this.chorus = this.slow(0);
      src.connect(lp); lp.connect(this.chorus); this.chorus.connect(this.out);
    }
    this.chorus?.gain.setTargetAtTime(0.6 * k, t, 2);
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
  /** 观星时虫声「细」下来：三只蟋蟀退一半多，金铃子那一线细的颤反倒显出来 */
  private fine(b: { long: boolean }) { return this.e.scene.focus !== 'stars' ? 1 : b.long ? 1.4 : 0.4; }
  scene(t: number) {
    for (const b of this.bouts) if (b.on) b.g.gain.setTargetAtTime(b.level * this.fine(b), t, 1);
  }
  schedule(from: number, to: number) {
    for (const b of this.bouts) {
      while (b.next < to) {
        const t = Math.max(from, b.next);
        b.on = !b.on;
        b.g.gain.setTargetAtTime(b.on ? b.level * this.fine(b) : 0, t, b.on ? 0.3 : 0.6);
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
    this.next = t + (e.offline && t >= e.calmUntil ? rand(1, 2) : rand(8, 40));
  }
  schedule(from: number, to: number) {
    while (this.next < to) {
      const t = Math.max(from, this.next), amt = gooseAmount(this.e.scene);
      // 一行雁过：三五只一路叫着，从天的一边慢慢移到另一边（geese 自己会移）；世界里刚放过雁阵就不再排
      if (amt > 0.05 && this.e.since('geese') > 60) this.say('geese', t, { vel: rand(0.4, 0.7), dist: rand(0.6, 0.9), rate: rand(0.92, 1.1) });
      this.next = t + rand(50, 160) / (0.3 + 0.7 * amt);
    }
  }
}
