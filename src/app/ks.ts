/**
 * 界面与那座寺之间的接线：启动、入山、行走（摇杆）、去某处、做某事、改天时、声音、把做过的事记进功课簿。
 */
import { audio, type Layer, type Shot } from '../audio';
import { Kongshan, type TimeMode } from '../world/Kongshan';
import type { Season, Weather } from '../world/env/atmos';
import * as walk from '../world/walk';
import { today } from './calendar';
import { addEntry, patch, saved, setUi, type Sheet } from './store';

let ks: Kongshan | null = null;
export const getKs = () => ks;
const qs = () => new URLSearchParams(location.search);

/** 「随缘」的天气：同一天总是同一种，晴多、雾次之、雨雪偶尔 */
export function autoWeather(dayKey: string, season: Season): Weather {
  let h = 2166136261;
  for (let i = 0; i < dayKey.length; i++) h = Math.imul(h ^ dayKey.charCodeAt(i), 16777619);
  const r = ((h >>> 0) % 1000) / 1000;
  if (season === 'winter') return r < 0.56 ? 'clear' : r < 0.78 ? 'mist' : r < 0.94 ? 'snow' : 'rain';
  return r < 0.62 ? 'clear' : r < 0.84 ? 'mist' : 'rain';
}
export function currentSeason(): Season { const s = saved.get().season; return s === 'auto' ? today().season : s; }
export function currentWeather(): Weather {
  const s = saved.get(), t = today();
  if (s.weather !== 'auto') return s.weather;
  // 头两回来，先给一个晴天，让人看清这座山；之后一天一个样
  return s.visits < 2 ? 'clear' : autoWeather(t.key, currentSeason());
}

function sceneAudio() {
  if (!ks) return;
  const pl = ks.nav.place;
  audio.setScene({ hour: ks.atmos.hour, weather: ks.atmos.weather, season: ks.season, indoor: pl.indoor, water: pl.water, height: pl.height });
}
export function buzz(ms: number | number[] = 8) {
  if (!saved.get().haptics) return;
  try { navigator.vibrate?.(ms); } catch { /* 没有振动 */ }
}

export async function boot(canvas: HTMLCanvasElement) {
  const q = qs(), s = saved.get(), t = today();
  const season = (q.get('season') as Season | null) ?? currentSeason();
  const weather = (q.get('w') as Weather | null) ?? currentWeather();
  const tq = q.get('t');
  const mode: TimeMode = tq && ['now', 'dawn', 'day', 'dusk', 'night'].includes(tq) ? (tq as TimeMode) : s.time;
  const now = new Date();
  try {
    ks = await Kongshan.create(canvas, {
      quality: q.get('q') ?? (s.quality === 'auto' ? null : s.quality), season, weather, hour: now.getHours() + now.getMinutes() / 60, moonPhase: t.moon,
      // 头一回来，从山脚自己走上去；以后直接到山门前的石阶上
      start: q.get('s') ?? (s.visits >= 1 ? 'gate' : 'foot'),
      events: {
        progress: (k, label) => setUi({ progress: k, stage: label }),
        place: (id) => { setUi({ place: id, arrivedAt: Date.now() }); sceneAudio(); },
        near: (th) => setUi({ near: th }),
        act: (id, state) => setUi({ act: id, actState: { ...state } }),
        log: (e) => addEntry(e),
        step: (wood) => audio.play(wood ? 'woodstep' : 'step', { vel: 0.32 + Math.random() * 0.2 }),
        sfx: (shot, opts) => audio.play(shot as Shot, opts),
        buzz: (ms) => buzz(ms),
        duck: (amount, fade) => audio.duck(amount, fade),
      },
    });
  } catch (e) {
    console.error(e);
    setUi({ error: String((e as Error)?.message ?? e) });
    return;
  }
  ks.setTime(mode, true);
  if (tq && !Number.isNaN(Number(tq))) { ks.timeMode = 'day'; ks.atmos.setHour(Number(tq), true); }
  ks.veil = 0.62;
  // 开场是无人的空山（题字正压在画面当中）；点了「入山」，行者才出现
  ks.player.setVisible(false);
  ks.start();
  setUi({ phase: 'title', place: ks.nav.cur });
  setInterval(sceneAudio, 15000);
  const w = window as unknown as Record<string, unknown>;
  w.__ks = ks; w.__walk = walk;   // 给调试与自动测试用
  if (q.has('auto')) { await enter(true); if (q.get('act')) ks.enterAct(q.get('act')!, true); }
  setTimeout(() => { w.__ready = true; }, 400);
}

/** 入山 */
export async function enter(skipWalk = false) {
  if (!ks) return;
  const s = saved.get();
  void audio.unlock().then(() => {
    audio.setMaster(s.master); audio.setMuted(s.muted);
    for (const [l, v] of Object.entries(s.layers)) audio.setLayer(l as Layer, v as number, 3);
    sceneAudio();
  });
  patch({ visits: s.visits + 1 });
  ks.player.setVisible(true);
  setUi({ phase: 'intro' });
  const k = ks, v0 = k.veil, t0 = performance.now(), dur = skipWalk ? 300 : 2600;
  const fade = () => { const u = Math.min(1, (performance.now() - t0) / dur); k.veil = v0 * (1 - u * u * (3 - 2 * u)); if (u < 1) requestAnimationFrame(fade); };
  fade();
  // 远远一声钟。人就站在路上，往后怎么走由你
  if (!skipWalk) { audio.play('bell', { vel: 0.35, space: 'open', delay: 1.2 }); await new Promise((r) => setTimeout(r, 1500)); }
  setUi({ phase: 'roam', place: k.nav.cur, arrivedAt: Date.now() });
}

export function go(id: string) { if (!ks || ks.nav.busy) return; setUi({ sheet: null, busy: true }); audio.play('tick', { vel: 0.5 }); void ks.go(id).then(() => setUi({ busy: false })); }
/** 做某件事（或上下楼）：id 省略时做走近了的那件。人会自己走到位 */
export function doAct(id?: string) { if (!ks) return; audio.play('tick', { vel: 0.5 }); ks.use(id); }
/** 取景偏移：把画面里的人往右（x）、往上（y）让出几成画幅（有面板时别挡着他） */
export function frame(x: number, y: number) { ks?.nav.frame.set(x, y); }
/** 摇杆：x 右、y 前，长度 ≤ 1 */
export function setStick(x: number, y: number) { ks?.stick.set(x, y); }
export function leaveAct() { ks?.exitAct(); setUi({ quiet: false }); }
export function actCmd(name: string, arg?: unknown) { ks?.act?.cmd?.(name, arg); }

export function setTime(mode: TimeMode) { patch({ time: mode }); ks?.setTime(mode); setTimeout(sceneAudio, 300); }
export function setWeather(w: Weather | 'auto') { patch({ weather: w }); ks?.setWeather(currentWeather()); setTimeout(sceneAudio, 300); }
export function setSeason(s: Season | 'auto') { patch({ season: s }); ks?.setSeason(currentSeason()); ks?.setWeather(currentWeather()); setTimeout(sceneAudio, 300); }
export function setMaster(v: number) { patch({ master: v }); audio.setMaster(v); }
export function setMuted(m: boolean) { patch({ muted: m }); audio.setMuted(m); }
export function setLayer(l: Layer, v: number) { patch({ layers: { ...saved.get().layers, [l]: v } }); audio.setLayer(l, v, 1.2); }
export function openSheet(s: Sheet) {
  audio.play(s ? 'open' : 'close', { vel: 0.5 });
  setUi({ sheet: s });
}
