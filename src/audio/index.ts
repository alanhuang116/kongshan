/**
 * 空山的声音。全部现场合成，不下载音频。对外只有一个单例 `audio`。
 *
 *   audio.unlock()            在用户第一次点按里调用，之后才出声
 *   audio.play('muyu')        一击的声音（钟、磬、木鱼、鼓、念珠、签、笔、帚、水……）
 *   audio.setLayer('wind', .6) 环境层的用户音量（风、鸟、泉、雨、虫、诵经、琴、远钟、风铎）
 *   audio.setScene({ hour, weather, season, indoor, water, height })
 *
 * 做法与校准数值见 docs/AUDIO.md；每种声音可在 /audio-lab.html 上单独听、单独看频谱。
 */
import { Engine } from './engine';
import { DEFAULT_LAYERS, DEFAULT_SCENE, LAYER_NAMES, type ChantOpts, type Layer, type PlayOpts, type Scene, type Shot } from './types';
import { clamp } from './util';

export * from './types';
export { Engine } from './engine';
export { renderOffline, type OfflineSpec } from './offline';

const TICK = 100;
const LOOKAHEAD = 0.25;
/** 页面在后台时定时器会被压到一秒一次，所以多排一些 */
const LOOKAHEAD_HIDDEN = 3;

type SyllableCb = (i: number, time: number) => void;
const clean = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

class KongshanAudio {
  private e: Engine | null = null;
  private user: Record<Layer, number> = { ...DEFAULT_LAYERS };
  private sc: Scene = { ...DEFAULT_SCENE };
  private masterVol = 0.8;
  private muted = false;
  private duckAmt = 0;
  private chantOpts: ChantOpts = {};
  private cbs = new Set<SyllableCb>();
  private keep = false;
  private auto = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private hooked = false;

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
      e.setScene(this.sc, 0);
      if (!this.auto) e.setAuto(false);
      for (const l of LAYER_NAMES) e.setLayer(l, this.user[l], 2.4);
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

  /** 一击的声音 */
  play(shot: Shot, opts?: PlayOpts): void {
    if (!this.e || this.e.ctx.state !== 'running') return;
    this.e.play(shot, opts);
  }

  /** 环境声每一层的用户音量 0…1（0 即关）；fade 秒 */
  setLayer(layer: Layer, level: number, fade?: number): void {
    this.user[layer] = clamp(level);
    this.e?.setLayer(layer, this.user[layer], fade);
  }
  getLayer(layer: Layer): number { return this.user[layer]; }
  /** 这一层此刻实际在响多少（用户音量与场景合起来；夜里的鸟是 0、雨天的雨即使用户没开也有）。没解锁时是 0。 */
  getEffective(layer: Layer): number { return this.e ? this.e.effective(layer) : 0; }
  /** 天气 / 场景自己带出来的声音（雨天的雨、夜里的虫、水边的水声）要不要；默认要。关掉后各层只听用户音量。 */
  setAuto(on: boolean): void { this.auto = on; this.e?.setAuto(on); }

  /** 场景变化（时刻、天气、位置）。可以每秒调一两次。 */
  setScene(s: Partial<Scene>): void {
    Object.assign(this.sc, clean(s));
    this.e?.setScene(clean(s));
  }

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

  /** 静坐计时进行中：页面到后台也别停 */
  keepAlive(on: boolean): void {
    this.keep = on;
    const ctx = this.e?.ctx as AudioContext | undefined;
    if (on && ctx && ctx.state === 'suspended') void ctx.resume().then(() => { this.e?.resync(); this.tick(); }).catch(() => { /* 等手势 */ });
    if (!on && ctx && typeof document !== 'undefined' && document.hidden) void ctx.suspend().catch(() => { /* 无妨 */ });
  }

  /** 环境声压低多少（0 不压 … 1 全压），fade 秒 */
  duck(amount: number, fade?: number): void {
    this.duckAmt = clamp(amount);
    this.e?.duck(this.duckAmt, fade);
  }

  // —— 内部 ——
  private tick() {
    const e = this.e;
    if (!e || e.ctx.state !== 'running') return;
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
  /** 用户自己放了有许可的诵经录音（public/audio/xinjing.mp3）就用它 */
  private async probe() {
    // 有没有这个文件，起服务器 / 打包时就知道了（vite.config.ts）；没有就不去问，免得每次进山都白白 404 一回
    if (!__KS_HAS_XINJING__) return;
    try {
      const url = `${import.meta.env.BASE_URL}audio/xinjing.mp3`;
      const r = await fetch(url, { method: 'HEAD' });
      if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('audio/')) return;
      const e = this.e;
      if (!e) return;
      const el = new Audio(url);
      el.loop = true; el.preload = 'auto';
      e.mediaEl = el;
      e.media = (e.ctx as AudioContext).createMediaElementSource(el);
      e.rebuild('chant');
    } catch { /* 没有就用合成的 */ }
  }
}

export const audio = new KongshanAudio();
