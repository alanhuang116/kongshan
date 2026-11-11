/**
 * 声音的底座：一张图，实时（AudioContext）与离线（OfflineAudioContext）共用。
 *
 *   一击的声音 ─ 干 ─────────────────────────────┐
 *              ├ 送「殿」混响（约 2.6 秒，暗）──────┤
 *              └ 送「山谷」混响（约 1.2 秒，稀）────┤
 *   环境层（室外：风鸟泉雨虫远钟风铎）─ 室内低通 ─┤→ 汇总 → 总音量 → 压限 → 软限幅 → 输出
 *   环境层（近处：诵经、琴）───────────────────────┘
 *
 * 每个环境层是懒建的：实际响度到 0 之后过一会儿就拆掉。排程只有一个入口 pump(until)：
 * 实时由定时器每 0.1 秒往前排 0.25 秒；离线渲染时一次排完全长。
 */
import { birdDensity, sceneBase, sceneMod } from './scene';
import { DEFAULT_SCENE, LAYER_NAMES, type ChantOpts, type Layer, type PlayOpts, type Scene, type Shot } from './types';
import { brownBuffer, clamp, ctrlBuffer, hallIR, openIR, pinkBuffer, rand, softClipCurve, whiteBuffer } from './util';
import { SHOTS } from './shots';
import { createLayer } from './layers';
import { XINJING_PHRASES } from './xinjing';

export interface Route { dry: AudioNode; hall?: AudioNode; open?: AudioNode }
export interface Mix { dry: number; hall: number; open: number }
export interface Voice {
  e: Engine;
  ctx: BaseAudioContext;
  /** 起始时刻 */
  t: number;
  /** 这一击的声音都接到这里 */
  out: GainNode;
  vel: number;
  pitch: number;
  dur: number | undefined;
  raw: PlayOpts;
}
export interface LayerBus { dry: GainNode; open: GainNode; hall: GainNode }
export interface LayerImpl {
  /** 把 [from, to) 里该发生的事排好 */
  schedule(from: number, to: number): void;
  /** 场景变了 */
  scene?(t: number): void;
  /** 一阵风：t 起，持续 dur 秒，强度 0…1 */
  gust?(t: number, strength: number, dur: number): void;
  dispose(): void;
}
interface Slot { bus: LayerBus; impl: LayerImpl; eff: number; cursor: number; zeroAt: number }

/** 各层在用户音量为 1 时的校准（离线渲染量过） */
const TRIM: Record<Layer, number> = { wind: 0.85, birds: 1, stream: 0.6, rain: 1, insects: 1, chant: 1, qin: 1, bellfar: 0.4, eaves: 1.6 };
/** 环境声整体的量：默认设置下约 −29 分贝（均方根），比一击的声音低一大截，但手机上也听得见 */
const AMB = 1.6;
/** 近处的层不过「室内低通」 */
const INNER: Layer[] = ['chant', 'qin'];

export class Engine {
  readonly ctx: BaseAudioContext;
  readonly offline: boolean;
  scene: Scene = { ...DEFAULT_SCENE };
  user: Record<Layer, number> = { wind: 0, birds: 0, stream: 0, rain: 0, insects: 0, chant: 0, qin: 0, bellfar: 0, eaves: 0 };
  chant: Required<ChantOpts> = { bpm: 72, phrases: XINJING_PHRASES, fish: true, bowl: true };
  /** 诵经每「字」的回调（实时由外面按时刻转发） */
  onSyllable: ((i: number, time: number) => void) | null = null;
  /** 用户自备的诵经录音（有就用它） */
  media: MediaElementAudioSourceNode | null = null;
  mediaEl: HTMLAudioElement | null = null;

  readonly sum: GainNode;
  readonly master: GainNode;
  readonly shotBus: GainNode;
  readonly hallIn: GainNode;
  readonly openIn: GainNode;
  readonly amb: GainNode;
  readonly ambOpen: GainNode;
  readonly ambHall: GainNode;
  /** 压限器与它后面的一级增益（抵掉压限器自带的补偿）。公开只为校准时量。 */
  readonly comp: DynamicsCompressorNode;
  readonly post: GainNode;
  private outLP: BiquadFilterNode;
  private outGain: GainNode;
  private inner: GainNode;
  private slots = new Map<Layer, Slot>();
  private buffers = new Map<string, AudioBuffer>();
  private masterVol = 0.8;
  private muted = false;
  private ducked = 0;
  private nextGust = -1;
  private sceneSig = '';
  private auto = true;

  constructor(ctx: BaseAudioContext, opts: { offline?: boolean } = {}) {
    this.ctx = ctx;
    this.offline = !!opts.offline;
    const c = ctx;
    this.sum = c.createGain();
    this.master = c.createGain();
    this.master.gain.value = this.masterVol;
    const comp = (this.comp = c.createDynamicsCompressor());
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.3;
    // 压限器自带一段补偿增益（这组参数下实测 ×1.446），这里抵掉，小信号正好原样通过
    const post = (this.post = c.createGain());
    post.gain.value = 0.69;
    const clip = c.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = 'none';
    this.sum.connect(this.master); this.master.connect(comp); comp.connect(post); post.connect(clip); clip.connect(c.destination);

    this.hallIn = c.createGain();
    this.openIn = c.createGain();
    const hall = c.createConvolver(); hall.normalize = false; hall.buffer = hallIR(c);
    const open = c.createConvolver(); open.normalize = false; open.buffer = openIR(c);
    const hallRet = c.createGain(); hallRet.gain.value = 0.9;
    const openRet = c.createGain(); openRet.gain.value = 0.8;
    this.hallIn.connect(hall); hall.connect(hallRet); hallRet.connect(this.sum);
    this.openIn.connect(open); open.connect(openRet); openRet.connect(this.sum);

    this.shotBus = c.createGain();
    this.shotBus.connect(this.sum);

    // 环境声 55Hz 以下不要：耳机里是闷的隆隆，手机上放不出来，白占余量
    this.amb = c.createGain();
    const ambHP = c.createBiquadFilter();
    ambHP.type = 'highpass'; ambHP.frequency.value = 55; ambHP.Q.value = 0.7;
    this.amb.connect(ambHP); ambHP.connect(this.sum);
    this.outLP = c.createBiquadFilter();
    this.outLP.type = 'lowpass'; this.outLP.frequency.value = 18000; this.outLP.Q.value = 0.5;
    this.outGain = c.createGain();
    this.outLP.connect(this.outGain); this.outGain.connect(this.amb);
    this.inner = c.createGain();
    this.inner.connect(this.amb);
    this.ambOpen = c.createGain(); this.ambOpen.connect(this.openIn);
    this.ambHall = c.createGain(); this.ambHall.connect(this.hallIn);
    this.applyScene(0);
  }

  get now() { return this.ctx.currentTime; }

  // —— 共用的 buffer ——
  noise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    let b = this.buffers.get(kind);
    if (!b) {
      b = kind === 'white' ? whiteBuffer(this.ctx, 3) : kind === 'pink' ? pinkBuffer(this.ctx, 7) : brownBuffer(this.ctx, 5);
      this.buffers.set(kind, b);
    }
    return b;
  }
  /** 不规则的 LFO：slow 约 0.6 点/秒（一段 6 秒的曲线放慢四倍），mid 约 7 点/秒，fast 约 90 点/秒 */
  ctrl(kind: 'slow' | 'mid' | 'fast'): AudioBuffer {
    let b = this.buffers.get('ctrl-' + kind);
    if (!b) {
      b = kind === 'slow' ? ctrlBuffer(this.ctx, 6, 2.4) : kind === 'mid' ? ctrlBuffer(this.ctx, 9, 7) : ctrlBuffer(this.ctx, 2.5, 90);
      this.buffers.set('ctrl-' + kind, b);
    }
    return b;
  }
  /** 一路循环的噪声源（从随机位置起） */
  noiseSrc(kind: 'white' | 'pink' | 'brown', t: number, dur?: number, rate = 1): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise(kind);
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, rand(0, s.buffer.duration - 0.05));
    if (dur != null) s.stop(t + dur);
    return s;
  }
  /** 一路循环的控制信号（−1…1），rate 是播放倍率 */
  ctrlSrc(kind: 'slow' | 'mid' | 'fast', t: number, rate = 1, dur?: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = this.ctrl(kind);
    s.loop = true;
    s.playbackRate.value = rate * (kind === 'slow' ? 0.25 : 1);
    s.start(t, rand(0, s.buffer.duration - 0.05));
    if (dur != null) s.stop(t + dur);
    return s;
  }

  // —— 总量 ——
  setMaster(v: number) { this.masterVol = clamp(v); this.applyMaster(); }
  setMuted(m: boolean) { this.muted = m; this.applyMaster(); }
  private applyMaster() {
    const v = this.muted ? 0 : this.masterVol;
    if (this.offline) this.master.gain.value = v; else this.master.gain.setTargetAtTime(v, this.now, 0.04);
  }
  duck(amount: number, fade = 0.8) {
    this.ducked = clamp(amount);
    this.applyBuses(fade);
  }

  // —— 一击 ——
  play(shot: Shot, opts: PlayOpts = {}, at?: number): number {
    const t = (at ?? this.now) + (opts.delay ?? 0) + (this.offline ? 0 : 0.006);
    const ind = this.scene.indoor;
    let mix: Mix;
    if (opts.space === 'near') mix = { dry: 1, hall: 0.05 * ind, open: 0.025 * (1 - ind) };
    else if (opts.space === 'hall') mix = { dry: 0.88, hall: 0.4, open: 0 };
    else if (opts.space === 'open') mix = { dry: 0.92, hall: 0, open: 0.22 };
    else mix = { dry: 0.92, hall: 0.34 * ind, open: 0.16 * (1 - ind) };
    return this.voice(shot, opts, t, { dry: this.shotBus, hall: this.hallIn, open: this.openIn }, mix);
  }
  /** 一击的声音接到任意去处（环境层里的远钟、风铎、檐滴、诵经的木鱼都走这里） */
  voice(shot: Shot, opts: PlayOpts, t: number, route: Route, mix: Mix): number {
    const c = this.ctx;
    const out = c.createGain();
    const made: AudioNode[] = [out];
    let head: AudioNode = out;
    const pan = opts.pan ?? 0;
    if (pan !== 0) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      out.connect(p); head = p; made.push(p);
    }
    const send = (dest: AudioNode | undefined, g: number) => {
      if (!dest || g <= 0) return;
      const n = c.createGain();
      n.gain.value = g;
      head.connect(n); n.connect(dest); made.push(n);
    };
    send(route.dry, mix.dry); send(route.hall, mix.hall); send(route.open, mix.open);
    const v: Voice = { e: this, ctx: c, t, out, vel: clamp(opts.vel ?? 0.7, 0.02, 1), pitch: opts.pitch ?? 1, dur: opts.dur, raw: opts };
    const tail = SHOTS[shot](v);
    if (!this.offline) {
      setTimeout(() => { for (const n of made) { try { n.disconnect(); } catch { /* 已断 */ } } }, (t - c.currentTime + tail + 0.4) * 1000);
    }
    return tail;
  }

  // —— 环境层 ——
  setLayer(l: Layer, v: number, fade = 1.2) {
    this.user[l] = clamp(v);
    this.applyLayer(l, fade);
  }
  /** 这一层此刻实际的响度（0…） */
  effective(l: Layer): number {
    return Math.max(this.auto ? sceneBase(l, this.scene) : 0, this.user[l]) * sceneMod(l, this.scene) * TRIM[l];
  }
  /** 天气 / 场景自己带出来的声音（下雨的雨声、夜里的虫、水边的水声）要不要 */
  setAuto(on: boolean) {
    this.auto = on;
    for (const l of LAYER_NAMES) this.applyLayer(l, 1.2);
  }
  private applyLayer(l: Layer, fade: number) {
    const eff = this.effective(l), t = this.now;
    let s = this.slots.get(l);
    const fresh = !s;
    if (!s) {
      if (eff <= 0.0005) return;
      const c = this.ctx;
      const bus: LayerBus = { dry: c.createGain(), open: c.createGain(), hall: c.createGain() };
      for (const g of [bus.dry, bus.open, bus.hall]) g.gain.value = 0;
      bus.dry.connect(INNER.includes(l) ? this.inner : this.outLP);
      bus.open.connect(this.ambOpen);
      bus.hall.connect(this.ambHall);
      s = { bus, impl: createLayer(l, this, bus, t), eff: 0, cursor: t, zeroAt: Infinity };
      this.slots.set(l, s);
    }
    if (!fresh && Math.abs(eff - s.eff) < 0.003 && !(eff <= 0.0005 && s.eff > 0)) return;
    s.eff = eff;
    for (const g of [s.bus.dry, s.bus.open, s.bus.hall]) {
      if (this.offline || fade <= 0) g.gain.setValueAtTime(eff, t); else g.gain.setTargetAtTime(eff, t, fade / 3);
    }
    s.zeroAt = eff <= 0.0005 ? t + fade * 1.5 + 1 : Infinity;
  }
  /** 往前排到 until（实时：now + 前瞻；离线：全长） */
  pump(until: number) {
    const now = this.now;
    // 一阵阵的风：风层跟着起伏，风铎跟着响
    if (this.nextGust < 0) this.nextGust = now + rand(4, 12);
    if (this.nextGust < now) this.nextGust = now;
    while (this.nextGust < until) {
      const strength = rand(0.35, 1), dur = rand(5, 9);
      for (const s of this.slots.values()) s.impl.gust?.(this.nextGust, strength, dur);
      this.nextGust += rand(14, 38) / (0.7 + 0.8 * this.scene.height);
    }
    for (const [l, s] of this.slots) {
      if (now > s.zeroAt) {
        s.impl.dispose();
        for (const g of [s.bus.dry, s.bus.open, s.bus.hall]) { try { g.disconnect(); } catch { /* 已断 */ } }
        this.slots.delete(l);
        continue;
      }
      if (s.cursor < now) s.cursor = now;
      if (until > s.cursor) { s.impl.schedule(s.cursor, until); s.cursor = until; }
    }
  }
  /** 拆掉重建某一层（诵经从合成换成录音时） */
  rebuild(l: Layer) {
    const s = this.slots.get(l);
    if (!s) return;
    s.impl.dispose();
    s.impl = createLayer(l, this, s.bus, this.now);
    s.cursor = this.now;
  }
  /** 回到前台时把排程的游标拉回现在（别把睡着时错过的一股脑儿补出来） */
  resync() {
    const now = this.now;
    for (const s of this.slots.values()) if (s.cursor < now) s.cursor = now;
  }
  activeLayers(): Layer[] { return [...this.slots.keys()]; }

  // —— 场景 ——
  setScene(p: Partial<Scene>, fade = 2) {
    Object.assign(this.scene, p);
    const s = this.scene;
    s.indoor = clamp(s.indoor); s.water = clamp(s.water); s.height = clamp(s.height);
    // 每秒会被叫一两次：没变（时刻差不到三分钟、位置差不到百分之一）就不动
    const sig = [Math.round(s.hour * 20), s.weather, s.season, Math.round(s.indoor * 100), Math.round(s.water * 100), Math.round(s.height * 100)].join();
    if (sig === this.sceneSig) return;
    this.sceneSig = sig;
    this.applyScene(fade);
  }
  private applyScene(fade: number) {
    this.applyBuses(fade);
    for (const l of LAYER_NAMES) this.applyLayer(l, fade);
    const t = this.now;
    for (const s of this.slots.values()) s.impl.scene?.(t);
  }
  private applyBuses(fade: number) {
    const s = this.scene, t = this.now, k = 1 - this.ducked;
    // 室内：室外的声音变闷、变轻；雪天整座山也闷一些
    let fc = 18000 * Math.pow(1100 / 18000, Math.pow(s.indoor, 0.8));
    if (s.weather === 'snow') fc = Math.min(fc, 6500);
    const og = (1 - 0.55 * s.indoor) * (s.weather === 'snow' ? 0.85 : 1);
    const set = (p: AudioParam, v: number) => { if (this.offline || fade <= 0) p.setValueAtTime(v, t); else p.setTargetAtTime(v, t, fade / 3); };
    set(this.outLP.frequency, fc);
    set(this.outGain.gain, og);
    set(this.amb.gain, k * AMB);
    set(this.ambOpen.gain, k * AMB * (1 - 0.6 * s.indoor));
    set(this.ambHall.gain, k * AMB);
  }
  /** 鸟的疏密（鸟层排程用） */
  get birds() { return birdDensity(this.scene); }

  dispose() {
    for (const s of this.slots.values()) s.impl.dispose();
    this.slots.clear();
    try { this.sum.disconnect(); this.master.disconnect(); } catch { /* 已断 */ }
  }
}
