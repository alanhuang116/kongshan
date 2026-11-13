/**
 * 声音的底座：一张图，实时（AudioContext）与离线（OfflineAudioContext）共用。
 *
 *   一击的声音 ─ [远近：衰减 + 低通] ─ [声像] ─ 干 ──────────────┐
 *                                          ├ 送「草堂」混响（0.3 秒）─┤
 *                                          └ 送「野外」混响（很薄的散尾）─┤
 *   环境的底（风水鸟虫雨雪、村里的动静）─ [方位] ─ 室内低通 ────────┤→ 汇总 → 总音量 → 压限 → 软限幅 → 输出
 *   贴身的层（远琴；煮水、研墨——这两样不被 duck 压低）──────────────┘
 *
 * 每一层都是懒建的：场景算出来它该响了才建，响度到 0 之后过一会儿就拆掉。场景（setScene）只管算每层该有多少，
 * 各层按自己的快慢渐变过去（鸟收得慢，溪声跟着脚步走得快）。排程只有一个入口 pump(until)：
 * 实时由定时器每 0.1 秒往前排 0.25 秒；离线渲染时每半秒停一下、往前排半秒（offline.ts）。
 */
import { BEARING_OF, FADE, mergeScene, mixScene, resolveScene, sceneSig, TRIM } from './scene';
import {
  BED_NAMES, DEFAULT_GROUPS, DEFAULT_SCENE, GROUP_OF, LOOP_NAMES, RANGE, RANGE_DEFAULT,
  type Bed, type ChantOpts, type Extra, type Group, type Loop, type PlayOpts, type Scene, type SceneState, type Shot, type SlotId,
} from './types';
import { brownBuffer, clamp, ctrlBuffer, distCut, distGain, hallIR, openIR, pinkBuffer, rand, roomIR, softClipCurve, whiteBuffer } from './util';
import { SHOTS } from './shots';
import { createLayer } from './layers';
import { XINJING_PHRASES } from './xinjing';

export interface Route { dry: AudioNode; hall?: AudioNode; open?: AudioNode; room?: AudioNode }
export interface Mix { dry: number; hall: number; open: number; room?: number }
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
  /** 远近 0…1（衰减与低通已经在外面做了；声音自己可以据此省掉听不见的细节） */
  dist: number;
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
/**
 * 一层的出口。干声那一路一定有；回声那两路、偏左偏右的声像，谁真用到才建——
 * 持续的风声水声用不着回声，世界没说方位时也用不着声像，省下的节点声音线程就不必每秒白算四万八千回。
 */
class Bus implements LayerBus {
  readonly dry: GainNode;
  private o: GainNode | null = null;
  private h: GainNode | null = null;
  private p: StereoPannerNode | null = null;
  private level = 0;
  constructor(private c: BaseAudioContext, private dest: AudioNode, private openDest: AudioNode, private hallDest: () => AudioNode) {
    this.dry = c.createGain();
    this.dry.gain.value = 0;
    try { this.dry.gain.automationRate = 'k-rate'; } catch { /* 老浏览器不认，照旧 */ }
    // 一律当成双声道：单声道的层日后插进声像节点时，量才不会跳三分贝
    this.dry.channelCount = 2; this.dry.channelCountMode = 'explicit';
    this.dry.connect(dest);
  }
  private side(dest: AudioNode): GainNode {
    const g = this.c.createGain();
    g.gain.value = this.level;
    try { g.gain.automationRate = 'k-rate'; } catch { /* 老浏览器不认，照旧 */ }
    g.connect(dest);
    return g;
  }
  get open(): GainNode { return (this.o ??= this.side(this.openDest)); }
  get hall(): GainNode { return (this.h ??= this.side(this.hallDest())); }
  /** 这一层的量：instant 立刻到位，否则按 fade 秒渐变过去 */
  set(eff: number, t: number, fade: number, instant: boolean) {
    this.level = eff;
    for (const g of [this.dry, this.o, this.h]) if (g) { if (instant) g.gain.setValueAtTime(eff, t); else g.gain.setTargetAtTime(eff, t, fade / 3); }
  }
  /** 干声偏到哪一边（回声是四面来的，不偏）。头一次不在正中时才插进一个声像节点 */
  setPan(pan: number, t: number, tau: number) {
    if (this.p) { this.p.pan.setTargetAtTime(pan, t, tau); return; }
    if (Math.abs(pan) < 0.01) return;
    this.p = this.c.createStereoPanner();
    this.p.pan.value = pan;
    this.dry.disconnect();
    this.dry.connect(this.p); this.p.connect(this.dest);
  }
  dispose() { for (const n of [this.dry, this.o, this.h, this.p]) { try { n?.disconnect(); } catch { /* 已断 */ } } }
}
interface Slot { bus: Bus; impl: LayerImpl; eff: number; cursor: number; zeroAt: number }
export interface LoopOpts { pan?: number; dist?: number; at?: readonly [number, number]; fade?: number }

/** 环境声整体的量 */
const AMB = 1.6;
/** 贴身的层不过「室内低通」；其中玩家手上那件事自己的声音也不被 duck 压低 */
const INNER = new Set<SlotId>(['chant', 'qin', 'kettle', 'inkstone']);
const OWN = new Set<SlotId>(['kettle', 'inkstone']);
/** 同时在响的一击最多多少：层里自己排的（檐滴、鸡叫）先让，玩家与世界触发的后让 */
const SOFT_CAP = 22, HARD_CAP = 40;
/** 整层的方位最多偏到几成（溪在左边，就偏左，不全到左边去） */
const PAN_WIDTH = 0.6;
/** 场景给一层的量低于它就不建这一层 */
const FAINT = 0.035;
/**
 * 本来就是远远听的几样：[没说远近时按多远算, 知道位置时最近也隔着多远]。
 * 犬吠、邻家的鸡鸣没说远近就是远处的，知道位置就照位置（跟前那条狗是轻轻一声「呜汪」）；
 * 布谷、牧笛、天上过的雁总隔着一段，走到跟前也不贴着耳朵。
 */
function farRule(shot: Shot, variant: string | undefined): readonly [number, number] | undefined {
  if (variant === 'far') return [0.8, 0.8];
  switch (shot) {
    case 'dog': return variant === 'woof' ? undefined : [0.7, 0];
    case 'rooster': return [0.6, 0];
    case 'goose': return variant === 'wild' ? [0.8, 0.6] : undefined;
    case 'cuckoo': return [0.75, 0.5];
    case 'flute': return [0.6, 0.35];
    default: return undefined;
  }
}
/**
 * 世界把远近折进力度里传过来时（Anlewo.sfxAt：力度 ÷ (1 + (米数 ÷ 9)²)，位置不往下传），按这几个数倒推回大概的距离：
 * 力度到 NEAR_VEL 以下，就不再是「更轻的一下」，而是「更远」。FOLD_VEL 是假定的原力度（世界里各样声音在 0.3–0.9 之间，取中）。
 * 这样鸡鸣、牧笛、捣衣、书声才传得出它们该传的那么远（RANGE），不是一律三十米外就没了。
 */
const NEAR_VEL = 0.25, FOLD_VEL = 0.6, FOLD_REF = 9, FOLD_D0 = FOLD_REF * Math.sqrt(FOLD_VEL / NEAR_VEL - 1);
/** 一击至少要有这么响（相对它在身边时），村里那几层才算「世界自己放过了」而让路——远得听不见的不算 */
const HEARD = 0.3;
const isBed = (id: SlotId): id is Bed => id in GROUP_OF;
const isLoop = (id: SlotId): id is Loop => (LOOP_NAMES as string[]).includes(id);

export class Engine {
  readonly ctx: BaseAudioContext;
  readonly offline: boolean;
  /** 交进来的场景（原样）与补齐算好的 */
  raw: Scene = { ...DEFAULT_SCENE };
  scene: SceneState;
  /** 场景算出来每一层该有多少（0…1） */
  mix: Record<Bed, number>;
  /** 用户音量：几组、四个旧的层 */
  group: Record<Group, number> = { ...DEFAULT_GROUPS };
  user: Record<Extra, number> = { chant: 0, qin: 0, bellfar: 0, eaves: 0 };
  loops: Record<Loop, number> = { kettle: 0, inkstone: 0, saw: 0, plough: 0 };
  /** 旧：诵经层的设置 */
  chant: Required<ChantOpts> = { bpm: 72, phrases: XINJING_PHRASES, fish: true, bowl: true };
  onSyllable: ((i: number, time: number) => void) | null = null;
  /** 旧：用户自备的诵经录音（有就用它） */
  media: MediaElementAudioSourceNode | null = null;
  mediaEl: HTMLAudioElement | null = null;
  /** 听的人在哪、朝哪（世界坐标；fx、fz 是朝向在地面上的方向） */
  listener = { x: 0, z: 0, fx: 0, fz: -1 };

  readonly sum: GainNode;
  readonly master: GainNode;
  readonly shotBus: GainNode;
  readonly openIn: GainNode;
  readonly roomIn: GainNode;
  readonly amb: GainNode;
  readonly ambOpen: GainNode;
  readonly ambRoom: GainNode;
  /** 压限器与它后面的一级增益（抵掉压限器自带的补偿）。公开只为校准时量。 */
  readonly comp: DynamicsCompressorNode;
  readonly post: GainNode;
  private outLP: BiquadFilterNode;
  private outGain: GainNode;
  private inner: GainNode;
  private own: GainNode;
  private hall: GainNode | null = null;
  private ambHallNode: GainNode | null = null;
  private slots = new Map<SlotId, Slot>();
  private buffers = new Map<string, AudioBuffer>();
  private waves = new Map<string, PeriodicWave>();
  private forced = new Map<Bed, number>();
  private loopGain: Record<Loop, number> = { kettle: 1, inkstone: 1, saw: 1, plough: 1 };
  private loopPan: Record<Loop, number> = { kettle: 0, inkstone: 0, saw: 0, plough: 0 };
  private live: number[] = [];
  private heard = new Map<Shot, number>();
  private tasks: Array<[number, () => void]> = [];
  private masterVol = 0.8;
  private muted = false;
  private ducked = 0;
  private nextGust = -1;
  private sceneSig = '';
  private auto = true;
  private wet = 0;
  private wetAt = 0;
  private wetApplied = 0;
  private wetHeld = false;

  constructor(ctx: BaseAudioContext, opts: { offline?: boolean } = {}) {
    this.ctx = ctx;
    this.offline = !!opts.offline;
    const c = ctx;
    // 省工夫的要紧一处：这张图里的滤波器，截止频率都是慢慢走的（游走的风、跟着远近变的明暗、嗓子的共振峰），
    // 没有哪个要逐样本地变。可浏览器默认按「逐样本」算——参数上一有渐变或接了调制，每个样本都重算一遍滤波系数
    //（要算 sin、cos），二十来个这样的滤波器就吃掉一成多的处理器。改成每 128 个样本（不到三毫秒）算一次，听不出差别。
    const make = c.createBiquadFilter.bind(c);
    c.createBiquadFilter = () => {
      const b = make();
      try { for (const p of [b.frequency, b.detune, b.Q, b.gain]) p.automationRate = 'k-rate'; } catch { /* 老浏览器不认，照旧 */ }
      return b;
    };
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

    this.openIn = c.createGain();
    this.roomIn = c.createGain();
    const open = c.createConvolver(); open.normalize = false; open.buffer = openIR(c);
    const room = c.createConvolver(); room.normalize = false; room.buffer = roomIR(c);
    const openRet = c.createGain(); openRet.gain.value = 0.6;
    const roomRet = c.createGain(); roomRet.gain.value = 0.9;
    this.openIn.connect(open); open.connect(openRet); openRet.connect(this.sum);
    this.roomIn.connect(room); room.connect(roomRet); roomRet.connect(this.sum);

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
    // 玩家手上那件事自己的声音（煮水、研墨）：与环境声一样的量，但不跟着 duck 压低
    this.own = c.createGain();
    this.own.gain.value = AMB;
    this.own.connect(ambHP);
    this.ambOpen = c.createGain(); this.ambOpen.connect(this.openIn);
    this.ambRoom = c.createGain(); this.ambRoom.connect(this.roomIn);
    // 先有一份算好的场景（各层要读）；指纹留空，头一次 setScene 一定会把各层建起来
    this.scene = resolveScene(this.raw, 0);
    this.mix = mixScene(this.scene);
    this.applyBuses(0);
  }

  get now() { return this.ctx.currentTime; }

  /** 旧：「殿」的混响（2.6 秒）。只有旧的声音（诵经、明说 space: 'hall' 的一击）用得到，用到才建 */
  get hallIn(): GainNode {
    if (!this.hall) {
      const c = this.ctx, conv = c.createConvolver(), ret = c.createGain();
      this.hall = c.createGain();
      conv.normalize = false; conv.buffer = hallIR(c);
      ret.gain.value = 0.9;
      this.hall.connect(conv); conv.connect(ret); ret.connect(this.sum);
    }
    return this.hall;
  }
  private get ambHall(): GainNode {
    if (!this.ambHallNode) {
      this.ambHallNode = this.ctx.createGain();
      this.ambHallNode.gain.value = (1 - this.ducked) * AMB;
      this.ambHallNode.connect(this.hallIn);
    }
    return this.ambHallNode;
  }

  // —— 共用的 buffer ——
  noise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    return this.cached(kind, () => (kind === 'white' ? whiteBuffer(this.ctx, 5.9) : kind === 'pink' ? pinkBuffer(this.ctx, 7) : brownBuffer(this.ctx, 5)));
  }
  /** 不规则的 LFO：slow 约 0.6 点/秒（一段 6 秒的曲线放慢四倍），mid 约 7 点/秒，fast 约 90 点/秒 */
  ctrl(kind: 'slow' | 'mid' | 'fast'): AudioBuffer {
    return this.cached('ctrl-' + kind, () => (kind === 'slow' ? ctrlBuffer(this.ctx, 6, 2.4) : kind === 'mid' ? ctrlBuffer(this.ctx, 9, 7) : ctrlBuffer(this.ctx, 2.5, 90)));
  }
  /** 算一次、之后共用的一段波形（一片水泡、一片雨点……） */
  cached(key: string, make: () => AudioBuffer): AudioBuffer {
    let b = this.buffers.get(key);
    if (!b) { b = make(); this.buffers.set(key, b); }
    return b;
  }
  /** 自定的波形（给各次谐波的幅度，从基音起）：算一次，之后共用 */
  wave(key: string, harmonics: number[]): PeriodicWave {
    let w = this.waves.get(key);
    if (!w) {
      const imag = new Float32Array([0, ...harmonics]);
      w = this.ctx.createPeriodicWave(new Float32Array(imag.length), imag);
      this.waves.set(key, w);
    }
    return w;
  }
  /** 一路循环的噪声源（从随机位置起） */
  noiseSrc(kind: 'white' | 'pink' | 'brown', t: number, dur?: number, rate = 1): AudioBufferSourceNode {
    return this.loopSrc(this.noise(kind), t, rate, dur);
  }
  /** 一路循环的控制信号（−1…1），rate 是播放倍率 */
  ctrlSrc(kind: 'slow' | 'mid' | 'fast', t: number, rate = 1, dur?: number): AudioBufferSourceNode {
    return this.loopSrc(this.ctrl(kind), t, rate * (kind === 'slow' ? 0.25 : 1), dur);
  }
  /** 把一段波形循环着放（从随机位置起） */
  loopSrc(buffer: AudioBuffer, t: number, rate = 1, dur?: number): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(t, rand(0, Math.max(0, buffer.duration - 0.05)));
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
  /** 环境声压低多少（做事时那件事自己的声音要听得清） */
  duck(amount: number, fade = 0.8) {
    this.ducked = clamp(amount);
    this.applyBuses(fade);
  }

  // —— 听的人 ——
  setListener(x: number, z: number, fx: number, fz: number) {
    const l = Math.hypot(fx, fz);
    this.listener.x = x; this.listener.z = z;
    if (l > 1e-6) { this.listener.fx = fx / l; this.listener.fz = fz / l; }
  }
  /** 世界里的一点在听的人的哪一边、有多远（range 米处算作 1） */
  locate(x: number, z: number, range: number): { pan: number; dist: number } {
    const L = this.listener, dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    // 面朝 (fx, fz) 时，右手边是 (−fz, fx)
    const side = d < 0.01 ? 0 : (dx * -L.fz + dz * L.fx) / d;
    return { pan: side * Math.min(1, d / 2.5) * 0.85, dist: clamp(d / range) };
  }

  // —— 一击 ——
  play(shot: Shot, opts: PlayOpts = {}, at?: number): number {
    const t = (at ?? this.now) + (opts.delay ?? 0) + (this.offline ? 0 : 0.006);
    let o = opts.far != null && opts.dist == null ? { ...opts, dist: opts.far } : opts;
    // 远近：明说了的照它的；给了位置的按位置算；都没有，就看力度——比 NEAR_VEL 还小的是「远处的」
    const given = o.dist != null, range = RANGE[shot] ?? RANGE_DEFAULT;
    if (opts.at) {
      const loc = this.locate(opts.at[0], opts.at[1], range);
      if (loc.dist >= 1) return 0;
      o = { ...o, pan: opts.pan ?? loc.pan, dist: o.dist ?? loc.dist };
    } else if (!given) {
      const vel = o.vel ?? 0.7;
      if (vel < NEAR_VEL) {
        const m = FOLD_REF * Math.sqrt(FOLD_VEL / Math.max(vel, 1e-5) - 1), dist = (m - FOLD_D0) / (Math.max(range, 24) - FOLD_D0);
        if (dist >= 1) return 0;
        o = { ...o, vel: NEAR_VEL, dist: clamp(dist) };
      } else if (o.pan != null) o = { ...o, dist: 0 };   // 给了左右的：位置是世界算过的，这一声就在近处
    }
    if (!given) {
      const rule = farRule(shot, o.variant);
      if (rule) o = { ...o, dist: o.dist == null ? rule[0] : Math.max(o.dist, rule[1]) };
    }
    const ind = this.scene.indoor, d = clamp(o.dist ?? 0);
    if (Math.min(1, (o.vel ?? 0.7) / NEAR_VEL) * distGain(d) >= HEARD) this.heard.set(shot, t);
    let mix: Mix;
    if (o.space === 'near') mix = { dry: 1, hall: 0, room: 0.05 * ind, open: 0.025 * (1 - ind) };
    else if (o.space === 'room') mix = { dry: 0.9, hall: 0, room: 0.3, open: 0 };
    else if (o.space === 'hall') mix = { dry: 0.88, hall: 0.4, open: 0 };
    else if (o.space === 'open') mix = { dry: 0.92, hall: 0, open: 0.2 + 0.2 * d };
    else mix = { dry: 0.92, hall: 0, room: 0.3 * ind * (1 - d), open: (0.15 + 0.2 * d) * (1 - ind * (1 - d)) };
    return this.voice(shot, o, t, { dry: this.shotBus, hall: mix.hall > 0 ? this.hallIn : undefined, open: this.openIn, room: this.roomIn }, mix);
  }
  /**
   * 一击的声音接到任意去处（层里的檐滴、鸡叫、锤声、旧的远钟与风铎都走这里）。
   * soft：层里自己排的——同时在响的太多时先不出这一声。
   */
  voice(shot: Shot, opts: PlayOpts, t: number, route: Route, mix: Mix, soft = false): number {
    const c = this.ctx, now = c.currentTime;
    if (this.live.length > 8) this.live = this.live.filter((x) => x > now);
    if (this.live.length >= (soft ? SOFT_CAP : HARD_CAP)) return 0;
    const out = c.createGain();
    const made: AudioNode[] = [out];
    let head: AudioNode = out;
    const dist = clamp(opts.dist ?? 0), vel = clamp(opts.vel ?? 0.7, 0.02, 1);
    // 力度在 0.25 以上只管「轻重与明暗」（最轻也有一半的量）；再往下就整个淡出去。
    //（外头来的一击到不了这里：play 已经把 0.25 以下的力度换成了远近。这是给层里自己排的声音留的）
    out.gain.value = Math.min(1, vel / NEAR_VEL);
    if (dist > 0.01) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = distCut(dist); lp.Q.value = 0.5;
      out.gain.value *= distGain(dist);
      out.connect(lp); head = lp; made.push(lp);
    }
    const pan = opts.pan ?? 0;
    if (pan !== 0) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      head.connect(p); head = p; made.push(p);
    }
    const send = (dest: AudioNode | undefined, g: number | undefined) => {
      if (!dest || !g || g <= 0) return;
      const n = c.createGain();
      n.gain.value = g;
      head.connect(n); n.connect(dest); made.push(n);
    };
    send(route.dry, mix.dry); send(route.hall, mix.hall); send(route.open, mix.open); send(route.room, mix.room);
    const v: Voice = { e: this, ctx: c, t, out, vel, pitch: (opts.rate ?? 1) * Math.pow(2, clamp(opts.pitch ?? 0, -36, 36) / 12), dur: opts.dur, dist, raw: opts };
    const tail = SHOTS[shot](v);
    this.live.push(t + tail);
    // 响完就拆线（里头的声源自己到时会停，断开之后浏览器就能把这一串节点收走）
    this.after(t + tail + 0.4, () => { for (const n of made) { try { n.disconnect(); } catch { /* 已断 */ } } });
    return tail;
  }
  /**
   * 到了 at 之后做一件收尾的事（把响完的节点断开）。实时用定时器；离线渲染没有定时器可用，记下来，排程走到那里再做——
   * 这样离线渲染时图里有多少节点、花多少工夫，就与实时差不多。
   */
  after(at: number, fn: () => void) {
    if (this.offline) this.tasks.push([at, fn]);
    else setTimeout(fn, Math.max(0, at - this.now) * 1000);
  }
  /**
   * 外头（世界、界面）上一次自己放这几种声音（而且听得见：远得几乎没有的不算）是多少秒以前；没放过是无穷大。
   * 村里、书声、修桥那几层据此让路：世界自己在叫，层里就不再排同一种声音。
   */
  since(...shots: Shot[]): number {
    let last = -Infinity;
    for (const s of shots) last = Math.max(last, this.heard.get(s) ?? -Infinity);
    return this.now - last;
  }
  /** 外头上一次放这种声音（而且听得见）的时刻；没放过是负无穷 */
  heardAt(shot: Shot): number { return this.heard.get(shot) ?? -Infinity; }
  /** 此刻同时在响的一击有多少（调试、试听台用） */
  get voices(): number { const now = this.now; return this.live.filter((x) => x > now).length; }

  // —— 层 ——
  /** 用户音量：一组（风、水、鸟、虫、雨雪、村里） */
  setGroup(g: Group, v: number, fade?: number) {
    this.group[g] = clamp(v, 0, 1.5);
    for (const b of BED_NAMES) if (GROUP_OF[b] === g) this.applyLayer(b, fade ?? 1.2);
  }
  /** 旧的四层（诵经、远琴、远钟、风铎）的用户音量 */
  setExtra(l: Extra, v: number, fade = 1.2) {
    this.user[l] = clamp(v);
    this.applyLayer(l, fade);
  }
  /** 一直响着的声音（煮水、研墨、拉锯、犁地）：level 为 0 即停 */
  setLoop(l: Loop, level: number, o: LoopOpts = {}) {
    this.loops[l] = clamp(level);
    let pan = o.pan, dist = o.dist;
    if (o.at) { const loc = this.locate(o.at[0], o.at[1], l === 'saw' ? 90 : l === 'plough' ? 80 : 30); pan ??= loc.pan; dist ??= loc.dist; }
    if (dist != null) this.loopGain[l] = distGain(dist);
    if (pan != null) this.loopPan[l] = clamp(pan, -1, 1);
    this.applyLayer(l, o.fade ?? FADE[l]);
    this.slots.get(l)?.bus.setPan(this.loopPan[l], this.now, 0.1);
  }
  /** 试听台、检查脚本用：不管场景，把某一层直接定在 level（null 则交还给场景） */
  force(b: Bed, level: number | null, fade = 0.6) {
    if (level == null) this.forced.delete(b); else this.forced.set(b, clamp(level, 0, 2));
    this.applyLayer(b, fade);
  }
  /** 这一层此刻该有的响度（已乘过校准） */
  effective(id: SlotId): number {
    if (isBed(id)) {
      const f = this.forced.get(id);
      if (f != null) return f * TRIM[id];
      // 场景给的量不到百分之三四（比给满时低近三十分贝，听不见）就当作没有：这一层不必建着白算
      const m = this.auto ? this.mix[id] * this.group[GROUP_OF[id]] : 0;
      return m < FAINT ? 0 : m * TRIM[id];
    }
    if (isLoop(id)) return this.loops[id] * this.loopGain[id] * TRIM[id];
    return this.user[id] * TRIM[id];
  }
  /** 场景自己带出来的声音要不要（关掉后只剩用户开的旧层、loop 与一击） */
  setAuto(on: boolean) {
    this.auto = on;
    for (const b of BED_NAMES) this.applyLayer(b, 1.2);
  }
  private applyLayer(id: SlotId, fade: number) {
    const eff = this.effective(id), t = this.now;
    let s = this.slots.get(id);
    const fresh = !s;
    if (!s) {
      if (eff <= 0.0005) return;
      const bus = new Bus(this.ctx, OWN.has(id) ? this.own : INNER.has(id) ? this.inner : this.outLP, this.ambOpen, () => (id === 'chant' ? this.ambHall : this.ambRoom));
      // 有方位的层（溪在左、书声在右）、摆在某处的 loop：干声偏过去
      const key = isBed(id) ? BEARING_OF[id] : undefined;
      bus.setPan(key ? this.scene.bearing[key] * PAN_WIDTH : isLoop(id) ? this.loopPan[id] : 0, t, 0);
      s = { bus, impl: createLayer(id, this, bus, t), eff: 0, cursor: t, zeroAt: Infinity };
      this.slots.set(id, s);
    }
    if (!fresh && Math.abs(eff - s.eff) < 0.004 * Math.max(eff, s.eff, 0.1) && !(eff <= 0.0005 && s.eff > 0)) return;
    s.eff = eff;
    s.bus.set(eff, t, fade, fade <= 0 || (this.offline && t <= 0));
    s.zeroAt = eff <= 0.0005 ? t + fade * 1.5 + 1 : Infinity;
  }
  /** 往前排到 until（实时：now + 前瞻；离线：全长，或到下一次场景变化） */
  pump(until: number) {
    const now = this.now;
    if (this.tasks.length && this.tasks.some((x) => x[0] <= now)) {
      const due = this.tasks.filter((x) => x[0] <= now);
      this.tasks = this.tasks.filter((x) => x[0] > now);
      for (const [, fn] of due) fn();
    }
    this.stepWet(now);
    // 一阵阵的风：风越大来得越勤、越猛；竹、松、叶、野风各自跟着起伏
    if (this.nextGust < 0) this.nextGust = now + rand(4, 12);
    if (this.nextGust < now) this.nextGust = now;
    while (this.nextGust < until) {
      const w = this.scene.wind, strength = clamp(rand(0.3, 0.9) * (0.45 + 0.9 * w)), dur = rand(5, 9);
      for (const s of this.slots.values()) s.impl.gust?.(this.nextGust, strength, dur);
      this.nextGust += rand(14, 38) / (0.55 + 1.3 * w);
    }
    for (const [l, s] of this.slots) {
      if (now > s.zeroAt) {
        s.impl.dispose();
        s.bus.dispose();
        this.slots.delete(l);
        continue;
      }
      if (s.cursor < now) s.cursor = now;
      if (until > s.cursor) { s.impl.schedule(s.cursor, until); s.cursor = until; }
    }
  }
  /** 雨后还湿着几成：下着雨就涨，停了慢慢干（檐滴、叶上的水、脚下的泥跟着它） */
  private stepWet(now: number) {
    const dt = now - this.wetAt;
    this.wetAt = now;
    if (dt <= 0 || this.wetHeld) return;
    const r = this.scene.rain;
    this.wet = clamp(this.wet + (r > 0.25 ? (dt * r) / 22 : -dt / 110));
    if (Math.abs(this.wet - this.wetApplied) > 0.02 || (this.wet === 0) !== (this.wetApplied === 0)) this.refresh(undefined);
  }
  /** 检查脚本、试听台用：把「湿」直接定在某个值（null 则交还给时间） */
  setWet(v: number | null) {
    this.wetHeld = v != null;
    if (v != null) this.wet = clamp(v);
    this.refresh(0);
  }
  /** 拆掉重建某一层（旧：诵经从合成换成录音时） */
  rebuild(l: SlotId) {
    const s = this.slots.get(l);
    if (!s) return;
    s.impl.dispose();
    s.impl = createLayer(l, this, s.bus, this.now);
    s.cursor = this.now;
  }
  /** 回到前台时把排程的游标拉回现在（别把睡着时错过的一股脑儿补出来） */
  resync() {
    const now = this.now;
    this.wetAt = now;
    for (const s of this.slots.values()) if (s.cursor < now) s.cursor = now;
  }
  activeLayers(): SlotId[] { return [...this.slots.keys()]; }

  // —— 场景 ——
  /** fade 为 0 是立刻到位；不给则各层按自己的快慢渐变 */
  setScene(p: Partial<Scene>, fade?: number) {
    mergeScene(this.raw, p);
    const st = resolveScene(this.raw, this.wet), sig = sceneSig(st);
    // 每帧都可能被叫：量化之后没变就不动
    if (sig === this.sceneSig) return;
    this.sceneSig = sig;
    // 凝神听什么变了：所有的层都在三秒里换过去
    const refocus = st.focus !== this.scene.focus;
    this.scene = st;
    this.applyScene(fade ?? (refocus ? 3 : undefined));
  }
  /** 场景没变、但「湿」变了或被强行定住时重算一遍 */
  private refresh(fade: number | undefined) {
    this.wetApplied = this.wet;
    this.scene = resolveScene(this.raw, this.wet);
    this.sceneSig = sceneSig(this.scene);
    this.applyScene(fade);
  }
  private applyScene(fade: number | undefined) {
    this.mix = mixScene(this.scene);
    this.applyBuses(fade ?? 2);
    for (const b of BED_NAMES) this.applyLayer(b, fade ?? FADE[b]);
    const t = this.now;
    for (const [id, s] of this.slots) {
      s.impl.scene?.(t);
      const key = isBed(id) ? BEARING_OF[id] : undefined;
      if (key) s.bus.setPan(this.scene.bearing[key] * PAN_WIDTH, t, 0.4);
    }
  }
  private applyBuses(fade: number) {
    const s = this.scene, t = this.now, k = 1 - this.ducked;
    // 屋里：外头的声音变闷、变轻（草堂是土墙茅顶、开着门窗，不像大殿隔得那么死）；雪天整个天地也闷一些
    const fc = Math.min(18000 * Math.pow(2200 / 18000, Math.pow(s.indoor, 0.8)), 18000 - 11500 * s.snow);
    const og = (1 - 0.5 * s.indoor) * (1 - 0.15 * s.snow);
    const set = (p: AudioParam, v: number) => { if (fade <= 0 || (this.offline && t <= 0)) p.setValueAtTime(v, t); else p.setTargetAtTime(v, t, fade / 3); };
    set(this.outLP.frequency, fc);
    set(this.outGain.gain, og);
    set(this.amb.gain, k * AMB);
    set(this.ambOpen.gain, k * AMB * (1 - 0.6 * s.indoor));
    set(this.ambRoom.gain, k * AMB);
    if (this.ambHallNode) set(this.ambHallNode.gain, k * AMB);
  }

  dispose() {
    for (const s of this.slots.values()) s.impl.dispose();
    this.slots.clear();
    try { this.sum.disconnect(); this.master.disconnect(); } catch { /* 已断 */ }
  }
}
