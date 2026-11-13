/**
 * 离线渲染：同一张图建在 OfflineAudioContext 上，给试听台和检查脚本（tests/play/audio.mjs）量数值、画频谱用。
 * 写这些声音的人听不到声音——每一种都是先算出来、量过、看过频谱才定的。
 *
 * 渲染是照着实时的样子走的：每半秒停一下，把响完的节点拆掉、把到点的场景变化与一击做了、再往前排半秒。
 * 所以这里量出来的节点数与耗时，和真在浏览器里响着的时候差不多。
 */
import { Engine } from './engine';
import type { Bed, ChantOpts, Extra, Group, Loop, PlayOpts, Scene, Shot } from './types';

export interface OfflineSpec {
  seconds: number;
  sampleRate?: number;
  /** 一击的声音：at 是第几秒（默认 0.02） */
  shots?: Array<{ name: Shot; at?: number; opts?: PlayOpts }>;
  /** 场景：各层按它混出来。auto 为 false 时场景只供各层取参数（离溪多近、什么季节），不自己带出声音 */
  scene?: Partial<Scene>;
  auto?: boolean;
  /** 不管场景，把这些层直接定在给的量（单独量一层时用：auto: false，beds: { brook: 1 }） */
  beds?: Partial<Record<Bed, number>>;
  groups?: Partial<Record<Group, number>>;
  loops?: Partial<Record<Loop, number>>;
  /** 旧的四层（诵经、远琴、远钟、风铎）的用户音量 */
  layers?: Partial<Record<Extra, number>>;
  /** 雨后还湿着几成；不给就随时间自己涨落 */
  wet?: number;
  /** 中途的变化：到第 at 秒改场景 / 压低环境声 / 改「湿」。看各层的渐变、看雨来鸟收用 */
  steps?: Array<{ at: number; scene?: Partial<Scene>; duck?: number; wet?: number | null }>;
  /** 听的人：x、z、朝向 fx、fz */
  listener?: [number, number, number, number];
  chant?: ChantOpts;
  master?: number;
  duck?: number;
}

/** 每隔多久停一下（秒） */
const CHUNK = 0.5;

export async function renderOffline(spec: OfflineSpec): Promise<AudioBuffer> {
  const sr = spec.sampleRate ?? 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * spec.seconds), sr);
  const e = new Engine(ctx, { offline: true });
  if (spec.master != null) e.setMaster(spec.master);
  if (spec.chant) Object.assign(e.chant, spec.chant);
  if (spec.listener) e.setListener(...spec.listener);
  if (spec.auto === false) e.setAuto(false);
  for (const [g, v] of Object.entries(spec.groups ?? {})) e.setGroup(g as Group, v as number, 0);
  e.setScene(spec.scene ?? {}, 0);
  if (spec.wet != null) e.setWet(spec.wet);
  for (const [b, v] of Object.entries(spec.beds ?? {})) e.force(b as Bed, v as number, 0);
  for (const [l, v] of Object.entries(spec.layers ?? {})) e.setExtra(l as Extra, v as number, 0);
  for (const [l, v] of Object.entries(spec.loops ?? {})) e.setLoop(l as Loop, v as number, { fade: 0 });
  if (spec.duck != null) e.duck(spec.duck, 0);

  const steps = [...(spec.steps ?? [])].filter((s) => s.at > 0 && s.at < spec.seconds).sort((a, b) => a.at - b.at);
  const shots = [...(spec.shots ?? [])].sort((a, b) => (a.at ?? 0.02) - (b.at ?? 0.02));
  // 停的时刻：每半秒一次，外加每个场景变化的时刻（按渲染的一格 128 个样本对齐，同一格只停一次）
  const frames = new Set<number>();
  for (let T = CHUNK; T < spec.seconds - 0.01; T += CHUNK) frames.add(Math.ceil((T * sr) / 128));
  for (const s of steps) frames.add(Math.ceil((s.at * sr) / 128));
  const stops = [...frames].sort((a, b) => a - b).map((f) => (f * 128) / sr);
  let si = 0, hi = 0;
  /** 走到了 T：把到点的场景变化做了，往前排到 next，把这一段里的一击放出去 */
  const advance = (T: number, next: number) => {
    for (; si < steps.length && steps[si].at <= T + 1e-4; si++) {
      const st = steps[si];
      if (st.wet !== undefined) e.setWet(st.wet);
      if (st.scene) e.setScene(st.scene);
      if (st.duck != null) e.duck(st.duck);
    }
    e.pump(next);
    for (; hi < shots.length && (shots[hi].at ?? 0.02) < next; hi++) e.play(shots[hi].name, shots[hi].opts ?? {}, shots[hi].at ?? 0.02);
  };
  advance(0, stops[0] ?? spec.seconds);
  stops.forEach((T, i) => {
    void ctx.suspend(T).then(() => {
      advance(T, stops[i + 1] ?? spec.seconds);
      return ctx.resume();
    });
  });
  return ctx.startRendering();
}
