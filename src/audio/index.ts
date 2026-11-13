/**
 * 安乐窝的声音。全部现场合成，不下载音频。对外只有一个单例 `audio`。
 *
 *   audio.unlock()                       在用户第一次点按里调用，之后才出声
 *   audio.setScene({ place, hour, night, dawn, dusk, season, rain, snow, mist, wind, indoor, near, bearing })
 *                                        世界每帧（或有变化时）交一次；二十来层环境声各自渐变过去
 *   audio.setListener(x, z, fx, fz)      听的人在哪、镜头朝哪（给了 at 的声音据此定左右远近）
 *   audio.play('rooster', { at: [x, z] })一击的声音（鸡犬、锤锯、纸笔墨、茶酒、门、露水……）
 *   audio.step('grass')                  一步
 *   audio.qin()                          抚琴的一下（不给参数就顺着一条现编的旋律弹下一个音）
 *   audio.setLoop('kettle', 1)           一直响着的声音（煮水、研墨、拉锯、犁地），0 即停
 *   audio.duck(0.5, 1.5)                 做事时把环境声压低
 *   audio.setGroup('insects', 0.5)       用户音量：风、水、鸟、虫、雨雪、村里（0…1，默认 1）
 *
 * 做法与校准数值见 docs/AUDIO.md；每种声音可在 /audio-lab.html 上单独听、单独看频谱。
 */
import { Engine, type LoopOpts } from './engine';
import { QinMelody, type QinNote } from './qin';
import { mergeScene } from './scene';
import {
  BED_NAMES, DEFAULT_GROUPS, DEFAULT_LAYERS, DEFAULT_SCENE, EXTRA_NAMES, GROUND_NAMES, GROUP_NAMES, GROUP_OF, LAYER_GROUP, LOOP_NAMES,
  type ChantOpts, type Extra, type Ground, type Group, type Layer, type Loop, type PlayOpts, type Scene, type Shot,
} from './types';
import { clamp } from './util';

export * from './types';
export { Engine, type LoopOpts } from './engine';
export { renderOffline, type OfflineSpec } from './offline';
export { bearingOf, nearOf } from './scene';
export { QinMelody, QIN_OPEN, type QinNote } from './qin';

const TICK = 100;
const LOOKAHEAD = 0.25;
/** 页面在后台时定时器会被压到一秒一次，所以多排一些 */
const LOOKAHEAD_HIDDEN = 3;

type SyllableCb = (i: number, time: number) => void;
const clean = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

class AnlewoAudio {
  private e: Engine | null = null;
  private groups: Record<Group, number> = { ...DEFAULT_GROUPS };
  private user: Record<Layer, number> = { ...DEFAULT_LAYERS };
  private loops: Record<Loop, { level: number; opts: LoopOpts }> = { kettle: { level: 0, opts: {} }, inkstone: { level: 0, opts: {} }, saw: { level: 0, opts: {} }, plough: { level: 0, opts: {} } };
  private sc: Scene = { ...DEFAULT_SCENE };
  private dirty = false;
  private ear = { x: 0, z: 0, fx: 0, fz: -1 };
  private masterVol = 0.8;
  private muted = false;
  private duckAmt = 0;
  private chantOpts: ChantOpts = {};
  private cbs = new Set<SyllableCb>();
  private keep = false;
  private auto = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hooked = false;
  private melody = new QinMelody();
  private foot = 1;

  /** 已经解锁并且在出声 */
  get ready(): boolean { return !!this.e && this.e.ctx.state === 'running'; }
  /** 调试 / 试听台用 */
  get engine(): Engine | null { return this.e; }

  /** 必须在用户手势里调用一次；之后才出声。可重复调用（切回前台、来电之后再调一次也行）。 */
  async unlock(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!this.e) {
      const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      let ctx: AudioContext;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch { try { ctx = new AC(); } catch { return; } }
      // iOS：静音拨片拨下时也照常出声（Safari 16.4 起）
      try { const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession; if (s) s.type = 'playback'; } catch { /* 没有这个接口 */ }
      const e = new Engine(ctx);
      e.setMaster(this.masterVol);
      e.setMuted(this.muted);
      Object.assign(e.chant, clean(this.chantOpts));
      e.onSyllable = (i, time) => this.emit(i, time);
      e.setListener(this.ear.x, this.ear.z, this.ear.fx, this.ear.fz);
      for (const g of GROUP_NAMES) e.setGroup(g, this.groups[g], 0);
      if (!this.auto) e.setAuto(false);
      // 头一回：各层从无到有，两三秒里慢慢起来
      e.setScene(this.sc);
      this.dirty = false;
      for (const l of EXTRA_NAMES) e.setExtra(l, this.user[l], 2.4);
      for (const l of LOOP_NAMES) if (this.loops[l].level > 0) e.setLoop(l, this.loops[l].level, this.loops[l].opts);
      e.duck(this.duckAmt, 0);
      this.e = e;
      this.hook();
      void this.probe();
    }
    const ctx = this.e.ctx as AudioContext;
    try { if (ctx.state !== 'running') await ctx.resume(); } catch { /* 还没到手势里 */ }
    try {
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      s.connect(ctx.destination);
      s.start(0);
    } catch { /* 无妨 */ }
    this.e.resync();
    if (this.timer == null) this.timer = setInterval(() => this.tick(), TICK);
    this.tick();
  }

  /** 总音量 0…1（默认 0.8） */
  setMaster(v: number): void { this.masterVol = clamp(v); this.e?.setMaster(this.masterVol); }
  setMuted(m: boolean): void { this.muted = m; this.e?.setMuted(m); }

  // —— 一击 ——
  /** 一击的声音。opts 见 PlayOpts；各声音各自认哪些选项见 docs/AUDIO.md */
  play(shot: Shot, opts?: PlayOpts): void {
    if (!this.e || this.e.ctx.state !== 'running') return;
    this.e.play(shot, opts);
  }
  /**
   * 一步。surface：earth 土路 / grass 草 / stone 石板 / plank 木板 / floor 屋里的夯土地 / water 浅水；不给就按人在哪一处猜。
   * 也认世界那边的叫法：wood 即 plank；wet 是「脚下是湿的」——真踩在水里（opts.wading）是 water，否则是湿了的土路
   * （没说 wading 时：正下着雨或雨刚停就当是湿地，不然就是水）。地湿不湿平时看场景里的雨，也可以用 opts.wet 指定。
   */
  step(surface?: Ground | 'wood' | 'wet', opts: PlayOpts & { wading?: boolean } = {}): void {
    this.foot = -this.foot;
    const { wading, ...rest } = opts;
    let ground: Ground | undefined = rest.ground, wet = rest.wet;
    if (surface === 'wood') ground = 'plank';
    else if (surface === 'wet') {
      const sc = this.e?.scene;
      if (wading ?? !(sc && Math.max(sc.rain, sc.wet) > 0.4)) ground = 'water'; else { ground = 'earth'; wet ??= 1; }
    } else if (surface && (GROUND_NAMES as string[]).includes(surface)) ground = surface;
    this.play('foot', { vel: 0.32 + Math.random() * 0.2, pan: this.foot * 0.06, ...rest, ground, wet });
  }
  /**
   * 抚琴的一下。不给 note：顺着一条现编的旋律弹下一个音（玩家不必会弹琴）；给了就照它弹
   * （tech：open 散音 / press 按音 / harmonic 泛音 / cuo 撮 / gun 滚 / fu 拂 / phrase 一个小句；string 第几弦……）。
   * 返回弹的是什么——界面要画哪根弦在颤可以用它。
   */
  qin(note?: Partial<QinNote> & Pick<PlayOpts, 'pan' | 'space'>): QinNote {
    const n: QinNote = note?.tech || note?.string ? { tech: note.tech ?? 'open', string: note.string ?? 3, ...clean(note) } : { ...this.melody.next(), ...clean(note ?? {}) };
    this.play('qin', n);
    return n;
  }

  // —— 场景 ——
  /** 场景变化（人在哪、时辰、天气、离什么近）。可以每帧调：只记下来，每 0.1 秒合并应用一次；量化之后没变就什么都不做 */
  setScene(s: Partial<Scene>): void {
    mergeScene(this.sc, s);
    this.dirty = true;
  }
  /** 听的人在哪（一般是行者的位置）、朝哪（一般是镜头在地面上的朝向；长度随意）。给了 at 的声音据此定左右与远近 */
  setListener(x: number, z: number, fx: number, fz: number): void {
    this.ear = { x, z, fx, fz };
    this.e?.setListener(x, z, fx, fz);
  }
  /** 一直响着的声音：kettle 煮水 / inkstone 研墨 / saw 拉锯 / plough 犁地。level 0…1，0 即停。opts：pan、dist 或 at（世界里的位置）、fade */
  setLoop(name: Loop, level: number, opts: LoopOpts = {}): void {
    this.loops[name] = { level: clamp(level), opts };
    this.e?.setLoop(name, level, opts);
  }
  /** 环境声压低多少（0 不压 … 1 全压），fade 秒。做事时那件事自己的声音要听得清；一击的声音不受影响 */
  duck(amount: number, fade?: number): void {
    this.duckAmt = clamp(amount);
    this.e?.duck(this.duckAmt, fade);
  }

  // —— 用户音量 ——
  /** 一组环境声的用户音量 0…1（默认 1＝按场景算出来的原样）：wind 风 / water 水 / birds 鸟 / insects 虫蛙 / weather 雨雪 / village 鸡犬书声 */
  setGroup(group: Group, level: number, fade?: number): void {
    this.groups[group] = clamp(level, 0, 1.5);
    for (const l of Object.keys(LAYER_GROUP) as Layer[]) if (LAYER_GROUP[l] === group) this.user[l] = clamp(level);
    this.e?.setGroup(group, this.groups[group], fade);
  }
  getGroup(group: Group): number { return this.groups[group]; }
  /**
   * 旧的九层的用户音量（界面上的声音面板还在用）：wind / birds / stream / rain / insects 是上面那几组的别名；
   * qin 是远远的几声琴；chant / bellfar / eaves 是旧的寺里的声音，默认关着。
   */
  setLayer(layer: Layer, level: number, fade?: number): void {
    const g = LAYER_GROUP[layer];
    if (g) this.setGroup(g, level, fade); else this.setExtra(layer as Extra, level, fade);
  }
  /** 另开的层：qin 远远的几声琴（现编的）；chant / bellfar / eaves 是旧的寺里的声音。0…1，默认都是 0 */
  setExtra(layer: Extra, level: number, fade?: number): void {
    this.user[layer] = clamp(level);
    this.e?.setExtra(layer, this.user[layer], fade);
  }
  getLayer(layer: Layer): number { return this.user[layer]; }
  /** 旧的层名此刻实际在响多少（组的别名取组里最响的一层）。没解锁时是 0 */
  getEffective(layer: Layer): number {
    const e = this.e, g = LAYER_GROUP[layer];
    if (!e) return 0;
    if (!g) return e.effective(layer as Extra);
    return Math.max(0, ...BED_NAMES.filter((b) => GROUP_OF[b] === g).map((b) => e.effective(b)));
  }
  /** 场景自己带出来的环境声要不要；默认要。关掉后只剩一击、loop 与用户开的旧层 */
  setAuto(on: boolean): void { this.auto = on; this.e?.setAuto(on); }

  // —— 旧：诵经层 ——
  /** 诵经层每「字」的回调；返回取消函数 */
  onSyllable(cb: SyllableCb): () => void {
    this.cbs.add(cb);
    return () => { this.cbs.delete(cb); };
  }
  /** 诵经的速度与句读 */
  setChant(opts: ChantOpts): void {
    Object.assign(this.chantOpts, clean(opts));
    if (this.e) Object.assign(this.e.chant, clean(opts));
  }

  /** 页面到后台也别停（静坐、听雨这类要一直响着的时候） */
  keepAlive(on: boolean): void {
    this.keep = on;
    const ctx = this.e?.ctx as AudioContext | undefined;
    if (on && ctx && ctx.state === 'suspended') void ctx.resume().then(() => { this.e?.resync(); this.tick(); }).catch(() => { /* 等手势 */ });
    if (!on && ctx && typeof document !== 'undefined' && document.hidden) void ctx.suspend().catch(() => { /* 无妨 */ });
  }

  // —— 内部 ——
  private tick() {
    const e = this.e;
    if (!e || e.ctx.state !== 'running') return;
    if (this.dirty) { this.dirty = false; e.setScene(this.sc); }
    e.pump(e.now + (typeof document !== 'undefined' && document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD));
  }
  private emit(i: number, time: number) {
    const e = this.e;
    if (!e || !this.cbs.size) return;
    const lat = (e.ctx as AudioContext).outputLatency || 0;
    setTimeout(() => { for (const cb of this.cbs) cb(i, time); }, Math.max(0, (time - e.now + lat) * 1000));
  }
  private hook() {
    if (this.hooked || typeof document === 'undefined') return;
    this.hooked = true;
    document.addEventListener('visibilitychange', () => {
      const e = this.e;
      if (!e) return;
      const ctx = e.ctx as AudioContext;
      if (document.hidden) {
        if (this.keep) this.tick(); else void ctx.suspend().catch(() => { /* 无妨 */ });
      } else {
        void ctx.resume().then(() => { e.resync(); this.tick(); }).catch(() => { /* 等手势 */ });
      }
    });
    // 来电、切走之后回来，状态可能停在 interrupted：下一次触摸时接上
    const again = () => {
      const ctx = this.e?.ctx as AudioContext | undefined;
      if (ctx && ctx.state !== 'running' && !document.hidden) void ctx.resume().then(() => { this.e?.resync(); }).catch(() => { /* 无妨 */ });
    };
    window.addEventListener('pointerdown', again, { passive: true });
    window.addEventListener('keydown', again, { passive: true });
  }
  /** 旧：用户自己放了有许可的诵经录音（public/audio/xinjing.mp3）就用它 */
  private async probe() {
    // 有没有这个文件，起服务器 / 打包时就知道了（vite.config.ts）；没有就不去问
    if (!__KS_HAS_XINJING__) return;
    try {
      const url = `${import.meta.env.BASE_URL}audio/xinjing.mp3`;
      const r = await fetch(url, { method: 'HEAD' });
      if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('audio/')) return;
      const e = this.e;
      if (!e) return;
      const el = new Audio(url);
      el.loop = true; el.preload = 'auto';
      e.media = (e.ctx as AudioContext).createMediaElementSource(el);
      e.mediaEl = el;
      e.rebuild('chant');
    } catch { /* 没有就用合成的 */ }
  }
}

export const audio = new AnlewoAudio();
