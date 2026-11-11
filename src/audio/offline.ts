/** 离线渲染：同一张图建在 OfflineAudioContext 上，给试听台和检查脚本量数值、画频谱用。 */
import { Engine } from './engine';
import type { ChantOpts, Layer, PlayOpts, Scene, Shot } from './types';

export interface OfflineSpec {
  seconds: number;
  sampleRate?: number;
  shots?: Array<{ name: Shot; at?: number; opts?: PlayOpts }>;
  layers?: Partial<Record<Layer, number>>;
  scene?: Partial<Scene>;
  chant?: ChantOpts;
  master?: number;
}

export async function renderOffline(spec: OfflineSpec): Promise<AudioBuffer> {
  const sr = spec.sampleRate ?? 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * spec.seconds), sr);
  const e = new Engine(ctx, { offline: true });
  if (spec.master != null) e.setMaster(spec.master);
  if (spec.chant) Object.assign(e.chant, spec.chant);
  if (spec.scene) e.setScene(spec.scene, 0);
  for (const [l, v] of Object.entries(spec.layers ?? {})) e.setLayer(l as Layer, v as number, 0);
  e.pump(spec.seconds);
  for (const s of spec.shots ?? []) e.play(s.name, s.opts ?? {}, s.at ?? 0.02);
  return ctx.startRendering();
}
