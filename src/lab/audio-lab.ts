/**
 * 声音试听台（开发用，不进正式构建）：http://localhost:3800/audio-lab.html
 *   上半页：实时试听——每种一击的按钮、每个环境层的滑块、场景的几个控件；
 *   下半页：离线渲染——把一种声音在 OfflineAudioContext 里算出来，量峰值 / 均方根 / 余音，画频谱图。
 * 检查脚本用 window.__renderShot / __renderLayer / __renderMix / __spectrogram。
 */
import { audio, renderOffline, DEFAULT_LAYERS, LAYER_NAMES, SHOT_NAMES, type Layer, type OfflineSpec, type PlayOpts, type Scene, type Season, type Shot, type Space, type Weather } from '../audio';
import { XINJING_PHRASES, XINJING_SYLLABLES } from '../audio/xinjing';

const SHOT_ZH: Record<Shot, string> = {
  bell: '钟', bowl: '大磬', chime: '引磬', muyu: '木鱼', drum: '鼓', drumrim: '鼓边', bead: '念珠', beadturn: '掉头',
  ignite: '点香', ash: '插香', sticks: '摇签', stickfall: '落签', brush: '一笔', paper: '纸', broom: '扫帚', plop: '落水',
  ripple: '拨水', lamp: '点灯', step: '石步', woodstep: '木步', door: '门', tick: '轻点', open: '开', close: '合',
  windbell: '风铎', drip: '水滴', pour: '注水', cup: '放盏',
};
const LAYER_ZH: Record<Layer, string> = { wind: '风', birds: '鸟', stream: '泉', rain: '雨', insects: '虫', chant: '诵', qin: '琴', bellfar: '远钟', eaves: '风铎' };
const SHOT_SECONDS: Partial<Record<Shot, number>> = { bell: 26, bowl: 13, chime: 6, drum: 3, pour: 3.2, door: 1.4, windbell: 4 };

// ———————————————————————————— 量 ————————————————————————————
export interface Stats {
  nan: boolean;
  peak: number;
  rms: number;
  /** 这段有多长（秒） */
  seconds: number;
  /** 余音：最后一次高于最大包络 −60 分贝的时刻（秒，自 0 起） */
  tail60: number;
  /** 若干时刻的 50ms 均方根 */
  rmsAt: Record<string, number>;
  /** 若干时刻的频谱峰（按频率排） */
  peaks: Array<{ t: number; list: Array<{ f: number; db: number }> }>;
  /** 最响处起的一长窗里、比最强峰低不超过 35 分贝的最低一个峰（Hz） */
  lowest: number;
  /** 同一窗里最强的一个峰（Hz） */
  loudest: number;
}

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const p = i + k, q = p + half;
        const vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
/** 一帧的幅度谱（汉宁窗，幅度按正弦的峰值归一） */
function spectrum(x: Float32Array, at: number, N: number): Float64Array {
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const s = at + i < x.length && at + i >= 0 ? x[at + i] : 0;
    re[i] = s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  }
  fft(re, im);
  const mag = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) mag[i] = (Math.hypot(re[i], im[i]) * 4) / N;
  return mag;
}
function mono(buf: AudioBuffer): Float32Array {
  const n = buf.length, out = new Float32Array(n), ch = buf.numberOfChannels;
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / ch; }
  return out;
}
function peaksAt(x: Float32Array, sr: number, t: number, N = 32768, max = 12): Array<{ f: number; db: number }> {
  const mag = spectrum(x, Math.floor(t * sr), N);
  let top = 0;
  for (let i = 2; i < mag.length; i++) top = Math.max(top, mag[i]);
  const list: Array<{ f: number; db: number; m: number }> = [];
  for (let i = 3; i < mag.length - 2; i++) {
    const m = mag[i];
    if (m < top * 0.003 || m < mag[i - 1] || m < mag[i + 1] || m < mag[i - 2] || m < mag[i + 2]) continue;
    const a = mag[i - 1], b = mag[i + 1], d = (0.5 * (a - b)) / (a - 2 * m + b || 1);
    list.push({ f: Math.round(((i + d) * sr) / N * 10) / 10, db: Math.round(20 * Math.log10(m) * 10) / 10, m });
  }
  return list.sort((p, q) => q.m - p.m).slice(0, max).sort((p, q) => p.f - q.f).map(({ f, db }) => ({ f, db }));
}
export function analyze(buf: AudioBuffer, times = [0.06, 0.3, 1, 3, 10, 20]): Stats {
  const sr = buf.sampleRate, n = buf.length;
  let peak = 0, sq = 0, nan = false;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) { const v = d[i]; if (v !== v) nan = true; const a = Math.abs(v); if (a > peak) peak = a; sq += v * v; }
  }
  const x = mono(buf), win = Math.floor(sr * 0.05), env: number[] = [];
  for (let i = 0; i + win <= n; i += win) { let s = 0; for (let k = 0; k < win; k++) s += x[i + k] * x[i + k]; env.push(Math.sqrt(s / win)); }
  const emax = Math.max(...env, 1e-12);
  let tail = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > emax * 0.001) tail = (i + 1) * 0.05;
  const rmsAt: Record<string, number> = {};
  for (const t of times) { const k = Math.floor(t / 0.05); if (k < env.length) rmsAt[String(t)] = +env[k].toPrecision(3); }
  const pt = [0.1, 1, 5].filter((t) => t < buf.duration - 0.2);
  const peaks = pt.map((t) => ({ t, list: peaksAt(x, sr, t) }));
  // 最低的分音：从包络最响的那一格起取一长窗（短的声音窗里多是零，无妨）
  const at1 = peaksAt(x, sr, env.indexOf(Math.max(...env)) * 0.05, 32768, 40);
  const strongest = Math.max(...at1.map((p) => p.db), -200);
  const lowest = at1.find((p) => p.db > strongest - 35)?.f ?? 0;
  const loudest = at1.find((p) => p.db === strongest)?.f ?? 0;
  return { nan, peak: +peak.toPrecision(4), rms: +Math.sqrt(sq / (n * buf.numberOfChannels)).toPrecision(4), seconds: buf.duration, tail60: +tail.toFixed(2), rmsAt, peaks, lowest, loudest };
}

// ———————————————————————————— 画 ————————————————————————————
const F_LO = 40, F_HI = 14000;
function heat(v: number): [number, number, number] {
  // 黑 → 靛 → 紫红 → 橙 → 淡黄
  const stops: Array<[number, number, number, number]> = [[0, 0, 0, 0], [0.25, 28, 16, 90], [0.5, 150, 30, 110], [0.75, 240, 110, 40], [1, 255, 245, 190]];
  const x = Math.min(1, Math.max(0, v));
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i], t = (x - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  return [255, 245, 190];
}
export function drawSpectrogram(canvas: HTMLCanvasElement, buf: AudioBuffer, title: string) {
  const W = 1140, H = 470, padL = 54, padB = 26, padT = 22;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  // 短的声音用短窗（时间上看得清），长的用长窗（频率上看得清）
  const x = mono(buf), sr = buf.sampleRate, N = buf.duration < 1.6 ? 1024 : buf.duration < 5 ? 4096 : 8192;
  const pw = W - padL - 8, ph = H - padT - padB;
  const img = g.createImageData(pw, ph);
  const cols: Float64Array[] = [];
  let top = 1e-9;
  for (let px = 0; px < pw; px++) {
    const at = Math.floor((px / pw) * x.length) - N / 2;
    const mag = spectrum(x, at, N);
    cols.push(mag);
    for (let i = 4; i < mag.length; i++) if (mag[i] > top) top = mag[i];
  }
  const topDb = 20 * Math.log10(top), range = 72;
  for (let px = 0; px < pw; px++) {
    const mag = cols[px];
    for (let py = 0; py < ph; py++) {
      const f = F_LO * Math.pow(F_HI / F_LO, 1 - py / (ph - 1));
      const bin = (f * N) / sr, i0 = Math.floor(bin), fr = bin - i0;
      // 高处一个像素跨许多格：取这一段里的最大值，免得细线漏掉
      const f2 = F_LO * Math.pow(F_HI / F_LO, 1 - (py - 1) / (ph - 1)), i1 = Math.min(mag.length - 1, Math.max(i0 + 1, Math.floor((f2 * N) / sr)));
      let m = (mag[i0] ?? 0) * (1 - fr) + (mag[i0 + 1] ?? 0) * fr;
      for (let i = i0 + 1; i <= i1; i++) if (mag[i] > m) m = mag[i];
      const db = 20 * Math.log10(m + 1e-12);
      const [r, gg, b] = heat((db - (topDb - range)) / range);
      const o = (py * pw + px) * 4;
      img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, padL, padT);
  g.font = '11px ui-monospace, Consolas, monospace';
  g.fillStyle = '#9a9890'; g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 1;
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const y = padT + (1 - Math.log(f / F_LO) / Math.log(F_HI / F_LO)) * (ph - 1);
    g.fillText(f >= 1000 ? `${f / 1000}k` : String(f), 8, y + 4);
    g.beginPath(); g.moveTo(padL, y + 0.5); g.lineTo(W - 8, y + 0.5); g.stroke();
  }
  const dur = buf.duration, step = dur > 16 ? 5 : dur > 6 ? 2 : dur > 2.5 ? 1 : dur > 1 ? 0.25 : 0.1;
  for (let t = 0; t <= dur + 1e-6; t += step) {
    const xx = padL + (t / dur) * pw;
    g.fillText(`${+t.toFixed(2)}s`, xx - 8, H - 8);
    g.beginPath(); g.moveTo(xx + 0.5, padT); g.lineTo(xx + 0.5, padT + ph); g.stroke();
  }
  g.fillStyle = '#dcdad4';
  g.fillText(`${title}   峰顶 ${topDb.toFixed(1)} dB   色阶 ${range} dB`, padL, 14);
}

// ———————————————————————————— 离线 ————————————————————————————
let lastBuf: AudioBuffer | null = null;
async function renderShot(name: Shot, opts: PlayOpts & { seconds?: number; scene?: Partial<Scene> } = {}): Promise<AudioBuffer> {
  const { seconds, scene, ...play } = opts;
  lastBuf = await renderOffline({ seconds: seconds ?? SHOT_SECONDS[name] ?? 1.2, shots: [{ name, at: 0.05, opts: play }], scene });
  return lastBuf;
}
async function renderLayer(name: Layer, seconds = 10, scene: Partial<Scene> = {}, level = 1): Promise<AudioBuffer> {
  lastBuf = await renderOffline({ seconds, layers: { [name]: level }, scene });
  return lastBuf;
}

declare global {
  interface Window {
    __ready: boolean;
    __syllables: number;
    __phraseSum: number;
    __renderShot(name: Shot, opts?: PlayOpts & { seconds?: number; scene?: Partial<Scene> }): Promise<Stats>;
    __renderLayer(name: Layer, seconds?: number, scene?: Partial<Scene>, level?: number): Promise<Stats>;
    __renderMix(spec: OfflineSpec): Promise<Stats>;
    __spectrogram(kind: 'shot' | 'layer' | 'mix', name: string, opts?: Record<string, unknown>): Promise<Stats>;
  }
}

// ———————————————————————————— 页面 ————————————————————————————
const root = document.getElementById('lab')!;
type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style'>> & { style?: string };
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Props<K> = {}, kids: Array<Node | string> = []): HTMLElementTagNameMap[K] => {
  const { style, ...rest } = props;
  const el = Object.assign(document.createElement(tag), rest) as HTMLElementTagNameMap[K];
  if (style) el.setAttribute('style', style);
  for (const k of kids) el.append(k);
  return el;
};
function slider(label: string, min: number, max: number, step: number, value: number, on: (v: number) => void, fmt = (v: number) => v.toFixed(2)): HTMLDivElement {
  const out = h('output', { textContent: fmt(value) });
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  input.addEventListener('input', () => { out.textContent = fmt(+input.value); on(+input.value); });
  return h('div', { className: 'row' }, [h('label', { textContent: label }), input, out]);
}
function select<T extends string>(label: string, options: Array<[T, string]>, value: T, on: (v: T) => void): HTMLDivElement {
  const s = h('select');
  for (const [v, zh] of options) s.append(h('option', { value: v, textContent: zh, selected: v === value }));
  s.addEventListener('change', () => on(s.value as T));
  return h('div', { className: 'row' }, [h('label', { textContent: label }), s]);
}

const status = h('span', { textContent: '还没解锁——先点「开声」', style: 'color:#8d8b85' });
const unlock = h('button', { className: 'gold', textContent: '开声' });
unlock.addEventListener('click', async () => {
  await audio.unlock();
  status.textContent = audio.ready ? `已开（采样率 ${audio.engine?.ctx.sampleRate}）` : '浏览器没让开';
});
setInterval(() => { if (audio.ready) status.textContent = `已开（采样率 ${audio.engine?.ctx.sampleRate}）· 在场的层：${audio.engine?.activeLayers().map((l) => LAYER_ZH[l]).join(' ') || '无'}`; }, 1000);

const play: PlayOpts = { vel: 0.7, pitch: 1 };
let playDur = 0.6;
const shotGrid = h('div', { className: 'grid' });
for (const s of SHOT_NAMES) {
  const b = h('button', { textContent: `${SHOT_ZH[s]} ${s}` });
  b.addEventListener('click', async () => { if (!audio.ready) await audio.unlock(); audio.play(s, { ...play, dur: s === 'brush' || s === 'broom' || s === 'pour' ? playDur * (s === 'pour' ? 4 : 1) : undefined }); });
  shotGrid.append(b);
}

const layerRows = h('div');
const layerInputs = new Map<Layer, HTMLInputElement>();
for (const l of LAYER_NAMES) {
  const row = slider(`${LAYER_ZH[l]} ${l}`, 0, 1, 0.01, DEFAULT_LAYERS[l], (v) => audio.setLayer(l, v, 0.6));
  layerInputs.set(l, row.querySelector('input')!);
  layerRows.append(row);
}
const setAll = (fn: (l: Layer) => number) => { for (const l of LAYER_NAMES) { const v = fn(l), i = layerInputs.get(l)!; i.value = String(v); i.dispatchEvent(new Event('input')); } };
const allOff = h('button', { textContent: '全关' }), allDefault = h('button', { textContent: '按默认' });
allOff.addEventListener('click', () => setAll(() => 0));
allDefault.addEventListener('click', () => setAll((l) => DEFAULT_LAYERS[l]));

const scene: Scene = { hour: 9, weather: 'clear', season: 'autumn', indoor: 0, water: 0, height: 0 };
const pushScene = () => audio.setScene(scene);
const sceneRows = h('div', {}, [
  slider('时刻', 0, 24, 0.25, scene.hour, (v) => { scene.hour = v; pushScene(); }, (v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`),
  select<Weather>('天气', [['clear', '晴'], ['mist', '雾'], ['rain', '雨'], ['snow', '雪']], scene.weather, (v) => { scene.weather = v; pushScene(); }),
  select<Season>('季节', [['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']], scene.season, (v) => { scene.season = v; pushScene(); }),
  slider('室内', 0, 1, 0.01, 0, (v) => { scene.indoor = v; pushScene(); }),
  slider('近水', 0, 1, 0.01, 0, (v) => { scene.water = v; pushScene(); }),
  slider('高处', 0, 1, 0.01, 0, (v) => { scene.height = v; pushScene(); }),
]);

const syl = h('span', { textContent: '', style: 'color:#b9a67f; margin-left: 12px' });
audio.onSyllable((i) => { syl.textContent = `第 ${(i % 260) + 1} 字`; });

const specCanvas = h('canvas', { id: 'spec', width: 1140, height: 470 });
const statsPre = h('pre', { id: 'stats', textContent: '（渲染之后这里是数值）' });
const targetSel = h('select', { id: 'target' });
for (const s of SHOT_NAMES) targetSel.append(h('option', { value: `shot:${s}`, textContent: `一击 · ${SHOT_ZH[s]} ${s}` }));
for (const l of LAYER_NAMES) targetSel.append(h('option', { value: `layer:${l}`, textContent: `环境 · ${LAYER_ZH[l]} ${l}` }));
const secInput = h('input', { type: 'number', value: '', placeholder: '秒（空＝默认）', style: 'width:120px; font:inherit; background:#1a1c1e; color:#dcdad4; border:1px solid #303335; border-radius:6px; padding:4px 8px' });
const renderBtn = h('button', { className: 'gold', textContent: '渲染并画频谱' }), playBtn = h('button', { textContent: '听这一段' });
renderBtn.addEventListener('click', async () => {
  const [kind, name] = targetSel.value.split(':');
  const seconds = secInput.value ? +secInput.value : undefined;
  renderBtn.disabled = true;
  try {
    const st = await window.__spectrogram(kind as 'shot' | 'layer', name, kind === 'shot' ? { ...play, seconds, scene } : { seconds, scene });
    statsPre.textContent = JSON.stringify(st, null, 1);
  } finally { renderBtn.disabled = false; }
});
playBtn.addEventListener('click', async () => {
  if (!lastBuf) return;
  if (!audio.ready) await audio.unlock();
  const ctx = audio.engine!.ctx, s = ctx.createBufferSource();
  s.buffer = lastBuf; s.connect(ctx.destination); s.start();
});

root.append(
  h('h1', { textContent: '空山 · 声音试听台' }),
  h('p', { className: 'note', textContent: '全部现场合成。上面是实时试听，下面是离线渲染（量数值、画频谱）。做法见 docs/AUDIO.md。' }),
  h('div', { className: 'row' }, [unlock, status]),
  slider('总音量', 0, 1, 0.01, 0.8, (v) => audio.setMaster(v)),
  h('h2', { textContent: '一击' }),
  h('div', { className: 'cols' }, [
    h('div', {}, [
      slider('力度 vel', 0.05, 1, 0.01, 0.7, (v) => { play.vel = v; }),
      slider('音高 pitch', 0.5, 2, 0.01, 1, (v) => { play.pitch = v; }),
    ]),
    h('div', {}, [
      slider('时长 dur', 0.15, 1.5, 0.01, 0.6, (v) => { playDur = v; }),
      select<Space | ''>('空间', [['', '随场景'], ['open', '室外'], ['hall', '殿内'], ['near', '贴近']], '', (v) => { play.space = v || undefined; }),
    ]),
  ]),
  shotGrid,
  h('h2', { textContent: '环境层' }),
  h('div', { className: 'cols' }, [
    h('div', {}, [layerRows, h('div', { className: 'row' }, [allDefault, allOff])]),
    h('div', {}, [
      sceneRows,
      slider('诵经 每分钟字数', 40, 140, 1, 72, (v) => audio.setChant({ bpm: v }), (v) => String(v)),
      h('div', { className: 'row' }, [h('label', { textContent: '跟字' }), syl]),
    ]),
  ]),
  h('h2', { textContent: '离线渲染与频谱' }),
  h('p', { className: 'note', textContent: '用上面「一击」的力度 / 音高 / 空间与「场景」的设置。纵轴 40Hz–14kHz（对数），横轴时间。' }),
  h('div', { className: 'row' }, [targetSel, secInput, renderBtn, playBtn]),
  specCanvas,
  statsPre,
);
pushScene();
for (const l of LAYER_NAMES) audio.setLayer(l, DEFAULT_LAYERS[l]);

// ———————————————————————————— 给检查脚本 ————————————————————————————
window.__syllables = XINJING_SYLLABLES.length;
window.__phraseSum = XINJING_PHRASES.reduce((a, b) => a + b, 0);
window.__renderShot = async (name, opts) => analyze(await renderShot(name, opts));
window.__renderLayer = async (name, seconds, scn, level) => analyze(await renderLayer(name, seconds, scn, level));
window.__renderMix = async (spec) => { lastBuf = await renderOffline(spec); return analyze(lastBuf); };
window.__spectrogram = async (kind, name, opts = {}) => {
  const o = opts as { seconds?: number; scene?: Partial<Scene>; level?: number } & PlayOpts & Partial<OfflineSpec>;
  let buf: AudioBuffer, title: string;
  if (kind === 'shot') { buf = await renderShot(name as Shot, o); title = `${SHOT_ZH[name as Shot]} ${name}  vel=${o.vel ?? 0.7}`; }
  else if (kind === 'layer') { buf = await renderLayer(name as Layer, o.seconds ?? 10, o.scene ?? {}, o.level ?? 1); title = `${LAYER_ZH[name as Layer]} ${name}  ${o.seconds ?? 10}s`; }
  else { buf = lastBuf = await renderOffline(o as OfflineSpec); title = name; }
  drawSpectrogram(specCanvas, buf, title);
  return analyze(buf);
};
(window as unknown as { __audio: typeof audio }).__audio = audio;
window.__ready = true;
