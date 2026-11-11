/**
 * 诵经声（合成）：隔着院子传来的齐诵。
 *
 *   声源：四个略略失谐的锯齿波，都在 G2（98Hz）上——诵经基本是一个音；各自带一点抖与很慢的漂；
 *   声道：分成两拨人，每拨一组并联的三个共振峰带通（F1 F2 F3）加一路低处的胸声；
 *         两拨的共振峰一高一低（人有高矮）、起字差三十毫秒（不会一字不差地齐）；
 *   字：  每个字按《心经》那个字的读音走——字头按声母的类别给一个凹陷（塞音收得紧、鼻音收得浅），
 *         咝音与送气音在凹陷里加一小段噪声；韵母里的元音依次滑过去，鼻韵尾把 F1 压下去；
 *   句：  每字一拍、一击木鱼；句末停一拍，音高往下落，收一口气；每一遍起头一声磬。
 *   远近：汇总后过一道低通（院子里 1.7kHz，进了殿 3.4kHz），多送混响。
 *
 * 字音不求可懂——要的是「有人在念」的起伏。若 public/audio/xinjing.mp3 存在，就改播那份录音。
 */
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { XINJING_PHRASES, XINJING_SYLLABLES, type Syllable, type Vowel } from './xinjing';
import { clamp, lerp, rand } from './util';

/** 男声的共振峰（Hz）：F1 F2 F3 */
const FORMANTS: Record<Vowel, [number, number, number]> = {
  a: [760, 1180, 2500], o: [540, 880, 2500], e: [500, 1150, 2500], E: [520, 1800, 2500],
  i: [290, 2200, 3000], y: [380, 1400, 2600], u: [340, 720, 2400], v: [290, 1900, 2300],
};
interface Bank { f: BiquadFilterNode[]; f2g: GainNode; amp: GainNode; k: number; lag: number }

export class Chant extends Base {
  private banks: Bank[] = [];
  private pitch: ConstantSourceNode | null = null;
  private hissF: BiquadFilterNode | null = null;
  private hissG: GainNode | null = null;
  private far: BiquadFilterNode;
  private sendDry: GainNode;
  private sendHall: GainNode;
  private sendOpen: GainNode;
  private fishIn: GainNode;
  private next: number;
  private i = 0;
  private phrase = 0;
  private inPhrase = 0;
  private rang = false;
  private recorded = false;

  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const c = this.c;
    this.far = this.filter('lowpass', 2000, 0.6);
    this.sendDry = this.gain(0.7); this.sendHall = this.gain(0.4); this.sendOpen = this.gain(0.3);
    this.far.connect(this.sendDry); this.sendDry.connect(bus.dry);
    this.far.connect(this.sendHall); this.sendHall.connect(bus.hall);
    this.far.connect(this.sendOpen); this.sendOpen.connect(bus.open);
    this.fishIn = this.gain(0.3);
    this.fishIn.connect(this.far);
    this.next = t + (e.offline ? 0.3 : 0.8);

    if (e.media && e.mediaEl) {
      // 用户自备的录音
      this.recorded = true;
      e.media.connect(this.far);
      void e.mediaEl.play().catch(() => { /* 等下一次手势 */ });
    } else {
      this.pitch = this.src(c.createConstantSource());
      this.pitch.offset.value = 0;
      this.pitch.start(t);
      const detune = [-9, 4, 12, -3];
      for (let b = 0; b < 2; b++) {
        const mix = this.gain(1);
        for (let k = 0; k < 2; k++) {
          const o = this.src(c.createOscillator());
          o.type = 'sawtooth'; o.frequency.value = 98; o.detune.value = detune[b * 2 + k];
          this.pitch.connect(o.detune);
          const j = this.src(e.ctrlSrc('mid', t, rand(0.5, 0.9))), jd = this.gain(7);
          j.connect(jd); jd.connect(o.detune);
          const d = this.src(e.ctrlSrc('slow', t, rand(0.6, 1.2))), dd = this.gain(9);
          d.connect(dd); dd.connect(o.detune);
          const g = this.gain(0.5);
          o.connect(g); g.connect(mix);
          o.start(t);
        }
        const tilt = this.filter('lowpass', 2600, 0.5);
        mix.connect(tilt);
        const amp = this.gain(0), kf = b ? 1.06 : 0.97;
        const fs: BiquadFilterNode[] = [];
        let f2g = amp;
        ([[500, 7, 1], [1150, 10, -0.55], [2500, 14, 0.28]] as const).forEach(([f, q, g], n) => {
          const bp = this.filter('bandpass', f * kf, q), fg = this.gain(g);
          tilt.connect(bp); bp.connect(fg); fg.connect(amp);
          fs.push(bp);
          if (n === 1) f2g = fg;
        });
        const chest = this.filter('lowpass', 260, 0.6), cg = this.gain(0.3);
        tilt.connect(chest); chest.connect(cg); cg.connect(amp);
        const lvl = this.gain(0.4), p = this.pan(b ? 0.3 : -0.3);
        amp.connect(lvl); lvl.connect(p); p.connect(this.far);
        this.banks.push({ f: fs, f2g, amp, k: kf, lag: b ? 0.03 : 0 });
      }
      const white = this.src(e.noiseSrc('white', t));
      this.hissF = this.filter('bandpass', 4000, 1.2);
      this.hissG = this.gain(0);
      white.connect(this.hissF); this.hissF.connect(this.hissG); this.hissG.connect(this.far);
    }
    this.scene(t);
  }

  scene(t: number) {
    const ind = this.e.scene.indoor;
    this.far.frequency.setTargetAtTime(lerp(1700, 3400, ind), t, 0.5);
    this.sendHall.gain.setTargetAtTime(lerp(0.3, 0.7, ind), t, 0.5);
    this.sendOpen.gain.setTargetAtTime(lerp(0.45, 0, ind), t, 0.5);
  }

  schedule(from: number, to: number) {
    const o = this.e.chant, beat = 60 / clamp(o.bpm, 30, 200);
    const phrases = o.phrases.length ? o.phrases : XINJING_PHRASES;
    while (this.next < to) {
      const t = Math.max(from, this.next);
      if (this.phrase >= phrases.length) { this.phrase = 0; this.inPhrase = 0; }
      // 一遍的开头：先一声磬，隔两拍起腔
      if (this.phrase === 0 && this.inPhrase === 0 && o.bowl && !this.rang && !this.recorded) {
        this.rang = true;
        this.e.voice('bowl', { vel: 0.45 }, t, { dry: this.fishIn }, { dry: 1, hall: 0, open: 0 });
        this.next = t + beat * 2;
        continue;
      }
      this.rang = false;
      const last = this.inPhrase >= phrases[this.phrase] - 1;
      if (!this.recorded) {
        this.sing(t, beat, XINJING_SYLLABLES[this.i % XINJING_SYLLABLES.length], last);
        if (o.fish) this.e.voice('muyu', { vel: 0.3, pitch: 0.8 }, t, { dry: this.fishIn }, { dry: 1, hall: 0, open: 0 });
      }
      this.e.onSyllable?.(this.i, t);
      this.i++; this.inPhrase++;
      this.next = t + beat;
      if (last) { this.next += beat; this.phrase++; this.inPhrase = 0; }
    }
  }

  /** 一个字：T 是元音起来的时刻 */
  private sing(T: number, beat: number, s: Syllable, last: boolean) {
    const lead = s.onset === 'v' ? 0.03 : s.onset === 'n' ? 0.045 : s.onset === 'p' ? 0.05 : s.onset === 'P' ? 0.06 : 0.075;
    const dip = s.onset === 'v' ? 0.7 : s.onset === 'n' ? 0.4 : s.onset === 'h' ? 0.25 : s.onset === 's' ? 0.12 : 0.04;
    const pitch = this.pitch!.offset;
    pitch.setTargetAtTime(rand(-12, 12) + (last ? -30 : 0), T - 0.02, 0.05);
    if (last) pitch.setTargetAtTime(-70, T + beat * 0.8, 0.3);
    const n = s.vowels.length;
    for (const b of this.banks) {
      const t = T + b.lag;
      b.amp.gain.setTargetAtTime(dip, t - lead, 0.012);
      b.amp.gain.setTargetAtTime(1, t, 0.03);
      b.f2g.gain.setTargetAtTime(-0.55, t - lead * 0.6, 0.02);
      s.vowels.forEach((vw, k) => {
        const at = k === 0 ? t - lead * 0.6 : t + beat * (n === 2 ? 0.42 : k === 1 ? 0.28 : 0.6);
        const F = FORMANTS[vw];
        for (let j = 0; j < 3; j++) b.f[j].frequency.setTargetAtTime(F[j] * b.k, at, k === 0 ? 0.018 : 0.045);
      });
      if (s.nasal) {
        const at = t + beat * 0.66;
        b.f[0].frequency.setTargetAtTime(270 * b.k, at, 0.05);
        b.f2g.gain.setTargetAtTime(-0.2, at, 0.05);
        b.amp.gain.setTargetAtTime(0.7, at, 0.06);
      }
      if (last) b.amp.gain.setTargetAtTime(0, t + beat * 0.95, 0.22);
    }
    if (s.hiss > 0 && s.onset !== 'p' && this.hissF && this.hissG) {
      const lvl = s.onset === 's' || s.onset === 'c' ? 0.05 : s.onset === 'z' ? 0.035 : 0.02;
      const start = T - lead + 0.005, len = s.onset === 'c' || s.onset === 's' ? lead : lead * 0.6;
      this.hissF.frequency.setValueAtTime(s.hiss, Math.max(0, start - 0.004));
      this.hissG.gain.setTargetAtTime(lvl, start, 0.008);
      this.hissG.gain.setTargetAtTime(0, start + len - 0.01, 0.01);
    }
  }

  dispose() {
    if (this.recorded && this.e.media) {
      try { this.e.media.disconnect(this.far); } catch { /* 已断 */ }
      this.e.mediaEl?.pause();
    }
    super.dispose();
  }
}
