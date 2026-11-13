/**
 * 界面与安乐窝之间的接线：启动、题名页背后的俯瞰、「入」、行走（摇杆）、去某处、做某事、改天时、声音，
 * 把做过的事记进起居注，把观到的象收进观象册；每秒看一眼画里是昼是夜，界面的颜色跟着换。
 */
import { Anlewo, type TimeMode } from '../world/Anlewo';
import type { Season, Weather } from '../world/env/atmos';
import * as walk from '../world/walk';
import { today } from './calendar';
import * as snd from './sound';
import { addEntry, addFound, patch, saved, setUi, ui, type Sheet } from './store';
import { WORDS, guaOf } from './texts';

let ks: Anlewo | null = null;
export const getKs = () => ks;

// —— 这一回从什么天时开始：网址参数（自动截图、调试用）盖过记下的偏好，但不改记下的 ——
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'], WEATHERS: Weather[] = ['clear', 'mist', 'rain', 'snow'], MODES: TimeMode[] = ['now', 'dawn', 'day', 'dusk', 'night'];
/** 日出、日落的时刻（与 world/env/atmos.ts 的一致；世界还没建好时界面先要知道是昼是夜） */
export const SUN: Record<Season, [number, number]> = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] };
function parseTime(v: string | null): TimeMode | number | null {
  if (!v) return null;
  if ((MODES as string[]).includes(v)) return v as TimeMode;
  return /^\d+(\.\d+)?$/.test(v) ? Number(v) % 24 : null;
}
function hourOf(time: TimeMode | number, season: Season): number {
  if (typeof time === 'number') return time;
  if (time === 'now') { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
  return time === 'dawn' ? SUN[season][0] + 0.3 : time === 'day' ? 9.2 : time === 'dusk' ? SUN[season][1] - 0.25 : 21.5;
}
const START = (() => {
  const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search), s = saved.get();
  const season = SEASONS.find((x) => x === q.get('season')) ?? s.season, weather = WEATHERS.find((x) => x === q.get('w')) ?? s.weather;
  const time = parseTime(q.get('t')) ?? s.time, hour = hourOf(time, season);
  return { q, season, weather, time, hour, auto: q.has('auto') || q.get('ui') === '0' };
})();

// —— 昼与夜：界面用哪一套颜色 ——
const THEME = { day: '#f1ede2', night: '#262d3a' };
function applyTone(tone: 'day' | 'night', night: number) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (root.dataset.tone !== tone) { root.dataset.tone = tone; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME[tone]); }
  root.style.setProperty('--night', night.toFixed(3));
}
// 世界还没建好（题名页刚出来）时先按钟点估一个，免得夜里来先闪一下白
{
  const [sr, ss] = SUN[START.season], night = START.hour < sr - 0.4 || START.hour > ss + 0.8;
  applyTone(night ? 'night' : 'day', night ? 1 : 0);
  setUi({ tone: night ? 'night' : 'day', hour: START.hour });
}
/** 每秒看一眼画里的天：过了一半才换成夜的颜色，往回要多退一点才换回来（黄昏时别来回闪） */
function sense() {
  if (!ks) return;
  const n = ks.atmos.night, cur = ui.get().tone;
  const tone = cur === 'night' ? (n < 0.42 ? 'day' : 'night') : n > 0.5 ? 'night' : 'day';
  applyTone(tone, n);
  const hour = ks.atmos.hour;
  if (tone !== cur || Math.abs(hour - ui.get().hour) > 1e-3) setUi({ tone, hour });
}

/** 每隔一小会儿把此刻的「现场」交给声音 */
function soundTick() {
  if (!ks) return;
  const a = ks.atmos, pl = ks.nav.place, p = ks.player.pos;
  const legacy = { place: pl.id, hour: a.hour, weather: a.weather, season: ks.season, indoor: pl.indoor, water: pl.water, height: pl.height };
  snd.setScene(typeof ks.soundscape === 'function' ? (ks.soundscape() as unknown as Record<string, unknown>) : legacy, legacy);
  // 耳朵在行者身上，朝向取镜头此刻看出去的方向（镜头矩阵的 −z 轴落在地面上的那一份）
  const m = ks.world.camera.matrixWorld.elements;
  snd.setListener(p.x, p.z, -m[8], -m[10]);
}
export function buzz(ms: number | number[] = 8) {
  if (!saved.get().haptics) return;
  try { navigator.vibrate?.(ms); } catch { /* 没有振动 */ }
}
/** 观到一象：收进册子（存在本机），也告诉世界（它据此知道这一象是不是头一回见） */
function sight(name: string) {
  const key = guaOf(name)?.key ?? name;
  ks?.found.add(key); ks?.found.add(name);
  addFound(key);
}

// 题名页上、进门的雾里、册页与简册开着时，键盘不归画里的人：他不跟着走，回车也不会「做」了身边那件事。
// （世界的按键是挂在 window 上听的；这里赶在它前头——捕获的那一程——拦下。界面自己要听的键也挂在捕获这一程，
//   同一程里后挂的照样收得到。Esc 照常放行；松键不拦，按住的键照常松开。）
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  const s = ui.get();
  if ((s.phase !== 'roam' || s.sheet || s.menu) && e.key !== 'Escape') e.stopPropagation();
}, true);

/** 世界那边怎么叫这几页 → 界面上的哪一页 */
const SHEET_OF: Record<string, Exclude<Sheet, null>> = { album: 'xiang', xiang: 'xiang', map: 'map', time: 'sky', sky: 'sky', sound: 'sound', journal: 'journal', about: 'about' };

/** 雾（0…1）缓缓到 v */
let veilRun = 0, veiling = false;
function veilTo(v: number, ms: number): Promise<void> {
  const k = ks;
  if (!k) return Promise.resolve();
  const id = ++veilRun, v0 = k.veil, t0 = performance.now();
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) ms *= 0.3;
  veiling = true;
  return new Promise((resolve) => {
    const step = () => {
      if (id !== veilRun) { resolve(); return; }
      const u = Math.min(1, (performance.now() - t0) / Math.max(1, ms));
      k.veil = v0 + (v - v0) * u * u * (3 - 2 * u);
      if (u < 1) requestAnimationFrame(step); else { veiling = false; resolve(); }
    };
    step();
  });
}

export async function boot(canvas: HTMLCanvasElement) {
  const q = START.q, s = saved.get(), t = today();
  void snd.loadSound().then((ok) => setUi({ sound: ok }));
  try {
    ks = await Anlewo.create(canvas, {
      quality: q.get('q') ?? (s.quality === 'auto' ? null : s.quality), season: START.season, weather: START.weather, hour: START.hour, moonPhase: t.moon,
      // 人总是从桃林最西头走进来
      start: q.get('s') ?? 'grove',
      events: {
        progress: (k, label) => setUi({ progress: k, stage: label }),
        place: (id) => setUi({ place: id, arrivedAt: Date.now() }),
        near: (th) => setUi({ near: th }),
        act: (id, state) => {
          // 事做着的时候雾归那件事管（小睡时它自己把画淡成雾）：这边正在收的雾就一步收完，不再碰
          if (id && veiling) { veilRun++; veiling = false; if (ks) ks.veil = 0; }
          setUi({ act: id, actState: { ...state } });
        },
        log: (e) => { addEntry(e); if (e.kind === 'xiang' && e.text) sight(e.text); },
        step: (surface) => { const k = ks; snd.step(surface, k ? { wading: walk.waterDepth(k.player.pos.x, k.player.pos.z) > 0.02, fast: k.player.fast } : {}); },
        sfx: (shot, opts) => snd.play(shot, opts),
        buzz: (ms) => buzz(ms),
        duck: (amount, fade) => snd.duck(amount, fade),
        loop: (name, level) => snd.loop(name, level),
        // 世界请界面翻开一页（先天图那幅卷轴上的「观象册」）
        open: (sheet) => { const s = SHEET_OF[sheet]; if (s) openSheet(s); },
        // 榻上一觉、亭中小睡，世界自己拨了时辰：存档跟着记下这一刻
        clock: (hour) => { patch({ time: Math.round(hour * 100) / 100 }); sense(); },
      },
    });
  } catch (e) {
    console.error(e);
    setUi({ error: String((e as Error)?.message ?? e) });
    return;
  }
  const k = ks;
  for (const n of s.found) k.found.add(n);
  // 今天的节气：农夫说话时用
  k.term = t.termName || null;
  k.setTime(START.time, true);
  const w = window as unknown as Record<string, unknown>;
  w.__ks = k; w.__walk = walk; w.__ui = { ui, saved, setUi, patch, sound: snd };   // 给调试与自动测试用
  sense();
  setInterval(sense, 1000);
  setInterval(soundTick, 250);
  if (START.auto) {
    // 跳过题名页：人已经站在那一处
    k.veil = 0;
    k.start();
    await enter(true);
    const act = q.get('act');
    if (act) k.enterAct(act, true);
  } else {
    // 题名页：背后是从桃林上空望出去的整片山水，从纸里慢慢显出来
    k.setOverview(true);
    k.veil = 1;
    k.start();
    setUi({ phase: 'title', place: k.nav.cur });
    void veilTo(0.05, 2800);
  }
  setTimeout(() => { w.__ready = true; }, START.auto ? 900 : 400);
}

/** 「入」：画淡成一片雾，人已站在桃林的入口，再从雾里显出来 */
let entering = false;
export async function enter(skip = false) {
  const k = ks;
  if (!k || entering) return;
  entering = true;
  const s = saved.get();
  snd.unlock({ master: s.master, muted: s.muted, levels: s.sound });
  patch({ visits: s.visits + 1 });
  if (skip) { k.veil = 0; setUi({ phase: 'roam', place: k.nav.cur, arrivedAt: Date.now() }); return; }
  setUi({ phase: 'intro' });
  await veilTo(1, 900);
  await k.begin();
  // 雾里停一停：进门的另外几句话在这时一句一句浮出来（头一回来停得久些；点一下、按个键就不等了）
  if (WORDS.entry.length > 1) await linger((s.visits < 1 ? 2300 : 1300) + WORDS.entry.length * 450);
  setUi({ phase: 'roam', place: k.nav.cur, arrivedAt: Date.now() });
  void veilTo(0, 2600);
}
/** 等一会儿；其间点一下、按个键就不等了 */
function linger(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(t); window.removeEventListener('pointerdown', done, true); window.removeEventListener('keydown', done, true); resolve(); };
    const t = setTimeout(done, ms);
    window.addEventListener('pointerdown', done, true); window.addEventListener('keydown', done, true);
  });
}

export function go(id: string) {
  if (!ks || ks.nav.busy) return;
  setUi({ sheet: null, menu: false, busy: true });
  snd.play('tick', { vel: 0.5 });
  void ks.go(id).then(() => setUi({ busy: false }));
}
/** 做某件事：id 省略时做走近了的那件。人会自己走到位 */
export function doAct(id?: string) { if (!ks) return; snd.play('tick', { vel: 0.5 }); ks.use(id); }
/** 取景偏移：把画面里的人往右（x）、往上（y）让出几成画幅（有面板时别挡着他） */
export function frame(x: number, y: number) { ks?.nav.frame.set(x, y); }
/** 摇杆：x 右、y 前，长度 ≤ 1 */
export function setStick(x: number, y: number) { ks?.stick.set(x, y); }
/** 「毕」。世界里没有正在做的事（只是界面上留着面板）时，把面板收掉 */
export function leaveAct() { if (ks?.act) ks.exitAct(); else setUi({ act: null, actState: {} }); }
export function actCmd(name: string, arg?: unknown) { ks?.cmd(name, arg); }

export function setTime(mode: TimeMode | number) { patch({ time: mode }); ks?.setTime(mode); sense(); }
export function setWeather(w: Weather) { patch({ weather: w }); ks?.setWeather(w); }
export function setSeason(s: Season) { patch({ season: s }); ks?.setSeason(s); sense(); }
export function setMaster(v: number) { patch({ master: v }); snd.setMaster(v); }
export function setMuted(m: boolean) { patch({ muted: m }); snd.setMuted(m); }
/** 一样环境声的音量（风、水、禽、虫、雨雪、村、远琴） */
export function setLevel(id: string, v: number) { patch({ sound: { ...saved.get().sound, [id]: v } }); snd.setLevel(id, v); }
export function openSheet(s: Sheet) {
  snd.play(s ? 'open' : 'close', { vel: 0.5 });
  setUi({ sheet: s, menu: false });
}
export function toggleMenu(on?: boolean) {
  const next = on ?? !ui.get().menu;
  if (next === ui.get().menu) return;
  snd.play('tick', { vel: 0.4 });
  setUi({ menu: next });
}
