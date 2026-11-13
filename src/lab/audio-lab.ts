/**
 * 声音试听台（开发用，不进正式构建）：/audio-lab.html
 *   环境——场景的各项（处、时辰、季节、雨雪、风、离什么近）与二十来层各自此刻的量；可以把某一层单独定住来听；
 *   一击——按书房 / 村里 / 天上 / 脚步分组，每种声音、每种变体一个按钮；抚琴另有一排；
 *   离线渲染——把一种声音在 OfflineAudioContext 里算出来，量数值、画频谱。
 * 检查脚本（tests/play/audio.mjs）用 window.__render / __renderShot / __renderBed / __mix / __spectrogram / __png / __seed。
 */
import {
  audio, renderOffline, BED_NAMES, DEFAULT_SCENE, EXTRA_NAMES, GROUND_NAMES, GROUP_NAMES, LOOP_NAMES, NEAR_KEYS, SHOT_GROUPS, SHOT_NAMES, ZERO_NEAR,
  type Bed, type Extra, type Ground, type Group, type Loop, type Near, type NearKey, type OfflineSpec, type PlayOpts, type QinTech, type Scene, type Season, type Shot, type Space,
} from '../audio';
import { birdDensity, mixScene, PLACE_NEAR, resolveScene, roosterTime, schoolHours, workHours } from '../audio/scene';

// ———————————————————————————— 名字 ————————————————————————————
const SHOT_ZH: Record<Shot, string> = {
  qin: '琴', page: '翻书', paper: '纸', brush: '一笔', inkstone: '研墨', pour: '注', kettle: '煮水', fan: '扇炉', cup: '放盏', bowl: '茶碗', stone: '落子', lamp: '点灯', ignite: '点香', ash: '插香',
  broom: '扫', water: '浇菊', gate: '柴门', door: '板门', knock: '叩门', dew: '露水', drip: '水滴', plop: '落水', ripple: '拨水',
  rooster: '鸡鸣', hen: '母鸡', chick: '小鸡', duck: '鸭', goose: '鹅 / 雁', dog: '犬', cat: '猫', ox: '牛', recite: '书声', flute: '牧笛', sparrow: '麻雀', cuckoo: '布谷',
  hammer: '锤', saw: '锯', plane: '刨', hoe: '锄', plough: '犁', bucket: '打水', pound: '捣衣', millThump: '水碓', rattle: '拨浪鼓', swing: '秋千', oar: '橹', net: '撒网', flap: '扑翅', chirp: '啾', tumble: '麻雀滚落', thresh: '打谷', laugh: '孩子笑', cluck: '咯（＝hen）', quack: '嘎（＝duck）',
  thunder: '远雷', gust: '一阵风', foot: '一步', step: '步（旧名）', woodstep: '木步（旧名）', tick: '轻点', open: '开', close: '合',
  bell: '钟', qing: '大磬', chime: '引磬', muyu: '木鱼', drum: '鼓', drumrim: '鼓边', bead: '念珠', beadturn: '掉头', sticks: '摇签', stickfall: '落签', windbell: '风铎',
};
const BED_ZH: Record<Bed, string> = {
  air: '气', pines: '松风', bamboo: '竹风', leaves: '叶声', fieldwind: '野风', brook: '溪', pond: '池', river: '河', waterfall: '瀑',
  birds: '鸟', swallows: '燕', cicadas: '蝉', frogs: '蛙', crickets: '蟋蟀', geese: '雁', rain: '雨', drips: '檐滴', snow: '雪', night: '夜', village: '鸡犬', school: '书声', work: '修桥', mill: '水碓',
};
const GROUP_ZH: Record<Group, string> = { wind: '风', water: '水', birds: '鸟', insects: '虫蛙', weather: '雨雪', village: '村里' };
const LOOP_ZH: Record<Loop, string> = { kettle: '煮水', inkstone: '研墨', saw: '拉锯', plough: '犁地' };
const EXTRA_ZH: Record<Extra, string> = { chant: '诵经（旧）', qin: '远琴', bellfar: '远钟（旧）', eaves: '风铎（旧）' };
const NEAR_ZH: Record<NearKey, string> = { stream: '溪', pond: '池', river: '伊水', waterfall: '瀑布', bamboo: '竹林', pines: '松', grove: '桃林', fields: '田', village: '邻家', school: '村塾', work: '修桥处', mill: '水碓' };
const GROUND_ZH: Record<Ground, string> = { earth: '土路', grass: '草', stone: '石板', plank: '木板', floor: '屋里地', water: '浅水' };
const PLACE_ZH: Array<[string, string]> = [['grove', '桃林'], ['bridge', '石桥'], ['yard', '院中'], ['hall', '草堂'], ['pavilion', '观物亭'], ['fields', '田畴'], ['village', '邻家'], ['ferry', '渡口']];
const SHOT_GROUP_ZH: Record<keyof typeof SHOT_GROUPS, string> = { study: '书房与院里', village: '村里', sky: '天上', steps: '脚步', ui: '界面', legacy: '旧（寺里的，新场景不用）' };
/** 各声音的变体：[variant, 按钮上的字] */
const VARIANTS: Partial<Record<Shot, Array<[string, string]>>> = {
  paper: [['', '拿放'], ['unroll', '展卷'], ['smooth', '抚平']], pour: [['', '注茶'], ['wine', '斟酒'], ['water', '注水']], cup: [['', '木案'], ['stone', '石桌']], bowl: [['', '放下'], ['sip', '啜一口再放下']],
  broom: [['', '土地'], ['stone', '石板']], gate: [['', '开合'], ['open', '只开']], door: [['', '开合'], ['open', '只开']], plop: [['', '落物'], ['frog', '蛙'], ['turtle', '龟']],
  rooster: [['', '近'], ['far', '远']], hen: [['', '咯咯'], ['egg', '下蛋']], dog: [['', '远吠'], ['woof', '近处一声']], ox: [['', '哞'], ['breath', '喷气']],
  cuckoo: [['', '一声'], ['x3', '三声']], goose: [['', '家鹅'], ['hiss', '嘶'], ['wild', '过雁']], recite: [['', '一句'], ['up', '上句'], ['down', '下句'], ['lead', '先生领读']], saw: [['push', '推'], ['pull', '拉']],
  bucket: [['', '全'], ['creak', '辘轳'], ['splash', '落水']], gust: [['leaf', '叶'], ['bamboo', '竹'], ['pine', '松']],
};
/** 离线渲染各渲染多少秒（没列的 1.2 秒） */
const SHOT_SECONDS: Partial<Record<Shot, number>> = {
  bell: 26, qing: 13, chime: 6, drum: 3, windbell: 4, pour: 3.2, kettle: 8.5, rooster: 3.2, hen: 2.6, chick: 2, duck: 2.8, dog: 2.4, ox: 2.8, recite: 4.6, sparrow: 2.8, cuckoo: 1.8, goose: 5, cat: 1.4, flute: 6,
  bowl: 1.6, stone: 0.5, pound: 0.8, millThump: 1.1, rattle: 1.5, swing: 3.4,
  hammer: 1, saw: 0.8, plane: 1.3, hoe: 0.8, plough: 3.2, bucket: 4.8, oar: 2.6, net: 1.4, thunder: 11, gust: 5.6, qin: 6, page: 0.9, paper: 1, inkstone: 1.5, water: 2, gate: 1.6, door: 1.4, knock: 1.6, dew: 0.7,
};
/** 几个现成的场景（试听与检查脚本共用） */
const PRESETS: Array<[string, Partial<Scene>, number?]> = [
  ['春晨 · 桃林', { place: 'grove', hour: 6.3, season: 'spring', mist: 0.3, wind: 0.08, near: { grove: 1, stream: 0.6, village: 0.1 } }],
  ['春午 · 石桥', { place: 'bridge', hour: 11, season: 'spring', near: { stream: 1, grove: 0.3, pines: 0.2 } }],
  ['春 · 村里书声', { place: 'village', hour: 9.5, season: 'spring', near: { village: 1, school: 0.8, stream: 0.3, work: 0.3, waterfall: 0.15 } }],
  ['夏午 · 观物亭', { place: 'pavilion', hour: 14, season: 'summer', indoor: 0.2, near: { pond: 1, bamboo: 0.85, pines: 0.2 } }],
  ['夏夜 · 池边', { place: 'pavilion', hour: 21.5, season: 'summer', near: { pond: 1, bamboo: 0.8 } }],
  ['夏 · 雷雨 · 草堂里', { place: 'hall', hour: 16, season: 'summer', rain: 1, storm: 0.8, wind: 0.3, indoor: 1, near: { pines: 0.4, bamboo: 0.4, stream: 0.15 } }, 1],
  ['雨后 · 院中', { place: 'yard', hour: 17, season: 'summer', near: { pines: 0.6, bamboo: 0.3, stream: 0.25, village: 0.1 } }, 0.8],
  ['秋夜 · 田间', { place: 'fields', hour: 22, season: 'autumn', near: { fields: 1, stream: 0.15 } }],
  ['秋暮 · 渡口', { place: 'ferry', hour: 17.3, season: 'autumn', near: { river: 1, fields: 0.35 } }],
  ['冬日 · 院中', { place: 'yard', hour: 10, season: 'winter', wind: 0.14, near: { pines: 0.6, bamboo: 0.3, stream: 0.25 } }],
  ['雪 · 竹林', { place: 'pavilion', hour: 15, season: 'winter', snow: 1, near: { bamboo: 1, pond: 0.6 } }],
  ['夜 · 草堂里', { place: 'hall', hour: 23, season: 'spring', indoor: 1, near: { pines: 0.4, bamboo: 0.4, stream: 0.15 } }],
];
const BASE_SCENE: Scene = { ...DEFAULT_SCENE, rain: 0, snow: 0, mist: 0, storm: 0, wind: 0.09, indoor: 0, focus: null };
const presetScene = (p: Partial<Scene>): Scene => ({ ...BASE_SCENE, ...p, near: { ...ZERO_NEAR, ...p.near }, bearing: { ...ZERO_NEAR } });

// ———————————————————————————— 量 ————————————————————————————
export interface Stats {
  nan: boolean;
  peak: number;
  rms: number;
  /** 直流：各声道平均值里绝对值大的那个 */
  dc: number;
  seconds: number;
  /** 余音：最后一次高于最大包络 −60 分贝的时刻（秒）；tail30 是 −30 分贝的（带着回声量时看它：这一声本身多长） */
  tail60: number;
  tail30: number;
  /** 频谱重心（Hz，按功率） */
  centroid: number;
  /** 6kHz 以上、100Hz 以下各占多少功率（0…1）：太亮、太闷一眼看得出 */
  hf: number;
  lf: number;
  /** 各倍频程的量（分贝，相对最响的一段）：63 125 250 500 1k 2k 4k 8k 16k */
  bands: number[];
  /** 响度随时间：分成四十段，每段的均方根 */
  env: number[];
  /** 一段一段的声音（字、音节、一下一下）：起止时刻（秒） */
  bursts: Array<[number, number]>;
  /** 每一段中间的音高（Hz；量不出是 0） */
  pitches: number[];
  /** 一下一下的起伏（秒）：包络上两边都落下去 3 分贝以上的峰。齐声念书时字与字之间并不断开，只是凹下去——数字数用它 */
  beats: number[];
  /** 左右两边的均方根 */
  lr: [number, number];
  rmsAt: Record<string, number>;
  peaks: Array<{ t: number; list: Array<{ f: number; db: number }> }>;
  lowest: number;
  loudest: number;
  /** 这一段渲染花了多少毫秒、其间一共建了多少个节点（看省不省：只有 __render 一类给） */
  ms?: number;
  nodes?: number;
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
/** 整段的平均功率谱：最多取一百二十帧 */
function powerSpectrum(x: Float32Array, N = 4096): Float64Array {
  const frames = Math.max(1, Math.min(120, Math.floor(x.length / N))), acc = new Float64Array(N / 2);
  for (let k = 0; k < frames; k++) {
    const mag = spectrum(x, Math.floor((k * (x.length - N)) / Math.max(1, frames - 1)), N);
    for (let i = 0; i < acc.length; i++) acc[i] += mag[i] * mag[i];
  }
  return acc;
}
/** 10 毫秒一格的包络（前后各一格平滑） */
function envelope10(x: Float32Array, sr: number): Float32Array {
  const w = Math.floor(sr * 0.01), n = Math.floor(x.length / w), env = new Float32Array(n), sm = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < w; k++) s += x[i * w + k] * x[i * w + k]; env[i] = Math.sqrt(s / w); }
  for (let i = 0; i < n; i++) sm[i] = (env[Math.max(0, i - 1)] + env[i] + env[Math.min(n - 1, i + 1)]) / 3;
  return sm;
}
/** 一下一下的起伏：从谷底涨起 3 分贝算一个峰开始，从峰顶落下 3 分贝算它成立 */
function findBeats(sm: Float32Array): number[] {
  let top = 0;
  for (let i = 0; i < sm.length; i++) top = Math.max(top, sm[i]);
  const out: number[] = [], drop = 0.708, floor = top * 0.2;
  let cand = -1, candV = 0, low = 0;
  for (let i = 0; i < sm.length; i++) {
    const v = sm[i];
    if (cand >= 0) {
      if (v > candV) { cand = i; candV = v; } else if (v < candV * drop) { out.push(+(cand * 0.01).toFixed(2)); cand = -1; low = v; }
    } else if (v < low) low = v;
    else if (v > floor && v > low / drop) { cand = i; candV = v; }
  }
  if (cand >= 0) out.push(+(cand * 0.01).toFixed(2));
  // 一个字里头音高在走、口型在变，响度也会晃一两下：挨得太近（0.17 秒以内）的并成一下
  const merged: number[] = [];
  for (const b of out) { if (merged.length && b - merged[merged.length - 1] < 0.17) continue; merged.push(b); }
  return merged;
}
/** 一段一段的声音：过了最响处的三成算起、落到一成半以下算止 */
function findBursts(sm: Float32Array): Array<[number, number]> {
  const n = sm.length;
  let top = 0;
  for (let i = 0; i < n; i++) top = Math.max(top, sm[i]);
  const out: Array<[number, number]> = [];
  if (top < 1e-6) return out;
  let start = -1;
  for (let i = 0; i < n; i++) {
    if (start < 0 && sm[i] > top * 0.3) start = i;
    else if (start >= 0 && sm[i] < top * 0.15) { if (i - start >= 3) out.push([+(start * 0.01).toFixed(2), +(i * 0.01).toFixed(2)]); start = -1; }
  }
  if (start >= 0 && n - start >= 3) out.push([+(start * 0.01).toFixed(2), +(n * 0.01).toFixed(2)]);
  return out;
}
/** 一小段的音高（自相关，80–1200Hz）；量不出是 0 */
function pitchAt(x: Float32Array, sr: number, t: number, len = 0.06): number {
  const a = Math.max(0, Math.floor((t - len / 2) * sr)), n = Math.min(Math.floor(len * sr), x.length - a);
  if (n < 256) return 0;
  const lo = Math.floor(sr / 1200), hi = Math.min(n - 1, Math.floor(sr / 80));
  let e0 = 0;
  for (let i = 0; i < n; i++) e0 += x[a + i] * x[a + i];
  if (e0 < 1e-9) return 0;
  let best = 0, bestLag = 0;
  const r = new Float64Array(hi + 2);
  for (let lag = lo; lag <= hi + 1; lag++) { let s = 0; for (let i = 0; i + lag < n; i++) s += x[a + i] * x[a + i + lag]; r[lag] = s / e0; }
  // 取第一个够高的峰（免得落到倍周期上）
  for (let lag = lo + 1; lag <= hi; lag++) if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > best) { if (r[lag] > 0.5 && best > 0 && r[lag] < best * 1.15) continue; best = r[lag]; bestLag = lag; }
  return best > 0.3 && bestLag ? Math.round((sr / bestLag) * 10) / 10 : 0;
}
export function analyze(buf: AudioBuffer, times = [0.06, 0.3, 1, 3, 10, 20]): Stats {
  const sr = buf.sampleRate, n = buf.length, ch = buf.numberOfChannels;
  let peak = 0, sq = 0, nan = false, dc = 0;
  const lr: [number, number] = [0, 0];
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    let sum = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const v = d[i]; if (v !== v) nan = true; const a = Math.abs(v); if (a > peak) peak = a; s2 += v * v; sum += v; }
    sq += s2;
    if (c < 2) lr[c] = +Math.sqrt(s2 / n).toPrecision(3);
    if (Math.abs(sum / n) > Math.abs(dc)) dc = sum / n;
  }
  const x = mono(buf), win = Math.floor(sr * 0.05), e50: number[] = [];
  for (let i = 0; i + win <= n; i += win) { let s = 0; for (let k = 0; k < win; k++) s += x[i + k] * x[i + k]; e50.push(Math.sqrt(s / win)); }
  const emax = Math.max(...e50, 1e-12);
  let tail = 0, tail30 = 0;
  for (let i = 0; i < e50.length; i++) { if (e50[i] > emax * 0.001) tail = (i + 1) * 0.05; if (e50[i] > emax * 0.0316) tail30 = (i + 1) * 0.05; }
  const rmsAt: Record<string, number> = {};
  for (const t of times) { const k = Math.floor(t / 0.05); if (k < e50.length) rmsAt[String(t)] = +e50[k].toPrecision(3); }
  const pt = [0.1, 1, 5].filter((t) => t < buf.duration - 0.2);
  const peaks = pt.map((t) => ({ t, list: peaksAt(x, sr, t) }));
  const at1 = peaksAt(x, sr, e50.indexOf(Math.max(...e50)) * 0.05, 32768, 40);
  const strongest = Math.max(...at1.map((p) => p.db), -200);
  const lowest = at1.find((p) => p.db > strongest - 35)?.f ?? 0, loudest = at1.find((p) => p.db === strongest)?.f ?? 0;
  // 频谱：重心、两头各占多少、各倍频程
  const ps = powerSpectrum(x), hz = sr / 4096;
  let tot = 0, cen = 0, hf = 0, lf = 0;
  const oct = new Array<number>(9).fill(0);
  for (let i = 1; i < ps.length; i++) {
    const f = i * hz, p = ps[i];
    tot += p; cen += p * f;
    if (f > 6000) hf += p;
    if (f < 100) lf += p;
    const b = Math.round(Math.log2(f / 63));
    if (b >= 0 && b < 9) oct[b] += p;
  }
  const otop = Math.max(...oct, 1e-30);
  // 响度随时间：四十段
  const seg = Math.max(1, Math.floor(n / 40)), env: number[] = [];
  for (let i = 0; i + seg <= n; i += seg) { let s = 0; for (let k = 0; k < seg; k++) s += x[i + k] * x[i + k]; env.push(+Math.sqrt(s / seg).toPrecision(3)); }
  const e10 = envelope10(x, sr), bursts = findBursts(e10), pitches = bursts.length <= 40 ? bursts.map(([a, b]) => pitchAt(x, sr, a + (b - a) * 0.5)) : [];
  const beats = buf.duration <= 20 ? findBeats(e10) : [];
  return {
    nan, peak: +peak.toPrecision(4), rms: +Math.sqrt(sq / (n * ch)).toPrecision(4), dc: +dc.toPrecision(2), seconds: buf.duration, tail60: +tail.toFixed(2), tail30: +tail30.toFixed(2),
    centroid: tot > 0 ? Math.round(cen / tot) : 0, hf: tot > 0 ? +(hf / tot).toPrecision(2) : 0, lf: tot > 0 ? +(lf / tot).toPrecision(2) : 0,
    bands: oct.map((p) => Math.round(10 * Math.log10(p / otop + 1e-12))), env, bursts, pitches, beats, lr, rmsAt, peaks, lowest, loudest,
  };
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
  const x = mono(buf), sr = buf.sampleRate, N = buf.duration < 1.6 ? 1024 : buf.duration < 5 ? 2048 : buf.duration < 14 ? 4096 : 8192;
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
  const dur = buf.duration, step = dur > 40 ? 10 : dur > 16 ? 5 : dur > 6 ? 2 : dur > 2.5 ? 1 : dur > 1 ? 0.25 : 0.1;
  for (let t = 0; t <= dur + 1e-6; t += step) {
    const xx = padL + (t / dur) * pw;
    g.fillText(`${+t.toFixed(2)}s`, xx - 8, H - 8);
    g.beginPath(); g.moveTo(xx + 0.5, padT); g.lineTo(xx + 0.5, padT + ph); g.stroke();
  }
  g.fillStyle = '#dcdad4';
  g.fillText(`${title}   峰顶 ${topDb.toFixed(1)} dB   色阶 ${range} dB`, padL, 14);
}

// ———————————————————————————— 离线 ————————————————————————————
type ShotOpts = PlayOpts & { seconds?: number; scene?: Partial<Scene> };
let lastBuf: AudioBuffer | null = null;
// 数一数建了多少个节点（省不省的一个粗指标）
let nodeCount = 0;
for (const k of ['createGain', 'createBiquadFilter', 'createOscillator', 'createBufferSource', 'createStereoPanner', 'createConvolver', 'createDelay', 'createConstantSource', 'createWaveShaper', 'createDynamicsCompressor'] as const) {
  const proto = BaseAudioContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>, orig = proto[k];
  proto[k] = function (this: BaseAudioContext, ...a: unknown[]) { nodeCount++; return orig.apply(this, a); };
}
let lastCost = { ms: 0, nodes: 0 };
async function render(spec: OfflineSpec): Promise<AudioBuffer> {
  const t0 = performance.now(), n0 = nodeCount;
  lastBuf = await renderOffline(spec);
  lastCost = { ms: Math.round(performance.now() - t0), nodes: nodeCount - n0 };
  return lastBuf;
}
function shotSpec(name: Shot, opts: ShotOpts = {}): OfflineSpec {
  const { seconds, scene, ...play } = opts;
  // 单独量一击：场景只供它取参数（屋里屋外、地湿不湿），不带环境声
  return { seconds: seconds ?? (play.dur ? play.dur + 1.2 : SHOT_SECONDS[name] ?? 1.2), shots: [{ name, at: 0.05, opts: play }], scene, auto: false };
}
/** 单独一层：场景给满它要的那一项（离溪最近、正下着雨……），不带别的层 */
function bedSpec(name: Bed, seconds = 10, scene: Partial<Scene> = {}, level = 1): OfflineSpec {
  const near = { ...ZERO_NEAR, stream: 1, pond: 1, river: 1, waterfall: 1, bamboo: 1, pines: 1, grove: 1, fields: 1, village: 1, school: 1, work: 1, mill: 1 };
  const base: Record<Bed, Partial<Scene>> = {
    air: {}, pines: {}, bamboo: {}, leaves: { season: 'summer' }, fieldwind: {}, brook: {}, pond: { season: 'summer' }, river: { hour: 10 }, waterfall: {},
    birds: { hour: 6.2, season: 'spring' }, swallows: { hour: 7, season: 'spring' }, cicadas: { hour: 14, season: 'summer' }, frogs: { hour: 22, season: 'summer' }, crickets: { hour: 22, season: 'autumn' },
    geese: { hour: 17.5, season: 'autumn' }, rain: { rain: 1, wind: 0.2 }, drips: { rain: 0, place: 'yard' }, snow: { snow: 1, season: 'winter' }, night: { hour: 23 },
    village: { hour: 6.2, place: 'village' }, school: { hour: 9.5, place: 'village' }, work: { hour: 9.5, place: 'village' }, mill: { place: 'village' },
  };
  return { seconds, auto: false, beds: { [name]: level }, scene: { ...BASE_SCENE, near, ...base[name], ...scene }, wet: name === 'drips' ? 0.8 : undefined };
}

declare global {
  interface Window {
    __ready: boolean;
    __presets: Array<[string, Scene, number | undefined]>;
    /** 把 Math.random 换成有种子的（同一个种子渲染出来的一模一样）；0 则换回去 */
    __seed(n: number): void;
    __render(spec: OfflineSpec): Promise<Stats>;
    __renderShot(name: Shot, opts?: ShotOpts): Promise<Stats>;
    __renderBed(name: Bed, seconds?: number, scene?: Partial<Scene>, level?: number): Promise<Stats>;
    /** 只算不响：这个场景下各层的量，以及几个排程用的数 */
    __mix(scene: Partial<Scene>, wet?: number): Record<string, number>;
    __spectrogram(title: string, spec?: OfflineSpec): Promise<Stats>;
    __png(): string;
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
const button = (text: string, on: () => void, cls = ''): HTMLButtonElement => { const b = h('button', { textContent: text, className: cls }); b.addEventListener('click', on); return b; };
const ensure = async () => { if (!audio.ready) await audio.unlock(); };

const status = h('span', { textContent: '还没解锁——先点「开声」', style: 'color:#8d8b85' });
const unlock = button('开声', async () => { await audio.unlock(); status.textContent = audio.ready ? '已开' : '浏览器没让开'; }, 'gold');

// —— 场景 ——
let scene: Scene = presetScene(PRESETS[0][1]);
const pushScene = () => audio.setScene(scene);
const scenePanel = h('div');
const clock = (v: number) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`;
function drawScene() {
  const near = scene.near as Near, bearing = scene.bearing as Record<NearKey, number>;
  const set = <K extends keyof Scene>(k: K) => (v: Scene[K]) => { scene[k] = v; pushScene(); };
  scenePanel.replaceChildren(
    h('div', { className: 'cols' }, [
      h('div', {}, [
        select('处 place', PLACE_ZH, scene.place, set('place')),
        slider('时刻 hour', 0, 24, 0.1, scene.hour, set('hour'), clock),
        select<Season>('季节 season', [['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']], scene.season, set('season')),
        slider('雨 rain', 0, 1, 0.01, scene.rain ?? 0, set('rain')),
        slider('雷雨 storm', 0, 1, 0.01, scene.storm ?? 0, set('storm')),
        slider('雪 snow', 0, 1, 0.01, scene.snow ?? 0, set('snow')),
        slider('雾 mist', 0, 1, 0.01, scene.mist ?? 0, set('mist')),
        slider('风 wind', 0, 0.35, 0.005, scene.wind ?? 0.09, set('wind'), (v) => v.toFixed(3)),
        slider('屋里 indoor', 0, 1, 0.01, scene.indoor, set('indoor')),
        select('凝神听 focus', [['', '（不）'], ['cicada', '蝉'], ['rain', '雨'], ['stream', '溪'], ['birds', '鸟'], ['frogs', '蛙'], ['crickets', '蟋蟀'], ['bamboo', '竹'], ['pines', '松'], ['recite', '书声']], scene.focus ?? '', (v) => { scene.focus = v || null; pushScene(); }),
        h('div', { className: 'row' }, [button('near 按这一处取个大概', () => { scene.near = { ...ZERO_NEAR, ...PLACE_NEAR[scene.place] }; drawScene(); pushScene(); })]),
      ]),
      h('div', {}, NEAR_KEYS.map((k) => h('div', { className: 'row tight' }, [
        ...Array.from(slider(`近 ${NEAR_ZH[k]} ${k}`, 0, 1, 0.01, near[k], (v) => { near[k] = v; pushScene(); }).childNodes),
        ...Array.from(slider('偏', -1, 1, 0.05, bearing[k], (v) => { bearing[k] = v; pushScene(); }, (v) => (v === 0 ? '中' : v < 0 ? `左${(-v).toFixed(1)}` : `右${v.toFixed(1)}`)).childNodes).slice(1),
      ]))),
    ]),
  );
}
const presetRow = h('div', { className: 'grid' }, PRESETS.map(([name, p, wet]) => button(name, async () => {
  await ensure();
  scene = presetScene(p);
  audio.engine?.setWet(wet ?? null);
  drawScene(); pushScene();
})));

// —— 各层 ——
const bedRows = new Map<Bed, { mix: HTMLElement; on: HTMLInputElement; lvl: HTMLInputElement }>();
const bedTable = h('div', { className: 'beds' });
for (const b of BED_NAMES) {
  const mix = h('span', { className: 'meter' }, [h('i')]), on = h('input', { type: 'checkbox', title: '把这一层定在右边的量（不管场景）' }), lvl = h('input', { type: 'range', min: '0', max: '1.5', step: '0.01', value: '1' });
  const apply = async () => { await ensure(); audio.engine?.force(b, on.checked ? +lvl.value : null); };
  on.addEventListener('change', apply); lvl.addEventListener('input', () => { if (on.checked) void apply(); });
  bedRows.set(b, { mix, on, lvl });
  bedTable.append(h('div', { className: 'bed' }, [button('听', () => void solo(b)), h('label', { textContent: `${BED_ZH[b]} ${b}` }), mix, on, lvl]));
}
const autoBox = h('input', { type: 'checkbox', checked: true });
autoBox.addEventListener('change', () => audio.setAuto(autoBox.checked));
const soloOff = button('都交还给场景', () => { for (const [b, r] of bedRows) { r.on.checked = false; audio.engine?.force(b, null); } autoBox.checked = true; audio.setAuto(true); audio.engine?.setWet(null); });
/** 单独听一层：把它要的条件给满（离得最近、合适的时辰季节天气），关掉场景自动，只定住这一层 */
async function solo(b: Bed) {
  await ensure();
  const spec = bedSpec(b);
  scene = { ...(spec.scene as Scene), bearing: { ...ZERO_NEAR } };
  drawScene(); pushScene();
  autoBox.checked = false; audio.setAuto(false);
  audio.engine?.setWet(spec.wet ?? null);
  for (const [x, r] of bedRows) { r.on.checked = x === b; if (x === b) r.lvl.value = '1'; audio.engine?.force(x, x === b ? 1 : null); }
}
setInterval(() => {
  const e = audio.engine;
  if (!e || !audio.ready) return;
  const live = new Set(e.activeLayers());
  status.textContent = `已开（采样率 ${e.ctx.sampleRate}）· 在场 ${live.size} 层 · 一击 ${e.voices} 声 · 湿 ${e.scene.wet.toFixed(2)} · 夜 ${e.scene.night.toFixed(2)} 晨 ${e.scene.dawn.toFixed(2)} 昏 ${e.scene.dusk.toFixed(2)}`;
  for (const [b, r] of bedRows) {
    (r.mix.firstChild as HTMLElement).style.width = `${Math.min(100, e.mix[b] * 100)}%`;
    r.mix.classList.toggle('live', live.has(b));
    r.mix.title = `场景给的量 ${e.mix[b].toFixed(2)}`;
  }
}, 250);

// —— 一击 ——
const play: PlayOpts = { vel: 0.7, pitch: 0 };
let wetStep = -1;
// 琴的 pitch 另有讲法（比宫弦高几个半音），试听台上的音高滑块不传给它
const fire = async (s: Shot, extra: PlayOpts = {}) => { await ensure(); audio.play(s, { ...play, ...extra }); };
function shotButtons(list: Shot[]): HTMLDivElement {
  const grid = h('div', { className: 'grid' });
  for (const s of list) {
    if (s === 'qin' || s === 'foot') continue;
    const vs = VARIANTS[s];
    if (!vs) { grid.append(button(`${SHOT_ZH[s]} ${s}`, () => void fire(s))); continue; }
    grid.append(h('span', { className: 'multi' }, [h('em', { textContent: `${SHOT_ZH[s]} ${s}` }), ...vs.map(([v, zh]) => button(zh, () => void fire(s, { variant: v || undefined })))]));
  }
  return grid;
}
// 抚琴
const qinNote = h('span', { style: 'color:#b9a67f; margin-left: 10px' });
const qin = async (o: { tech?: QinTech; string?: number; step?: number; glide?: number } = {}) => {
  await ensure();
  const n = audio.qin({ ...o, pan: play.pan, space: play.space });
  qinNote.textContent = `${n.tech} · ${n.string} 弦${n.step ? ` · 上 ${n.step} 级` : ''}${n.glide ? ` · 走 ${n.glide}` : ''}`;
};
let qinStep = 2;
const qinPanel = h('div', {}, [
  h('div', { className: 'grid' }, [
    button('顺着弹（下一个音）', () => void qin(), 'gold'),
    ...[1, 2, 3, 4, 5, 6, 7].map((s) => button(`散 ${s}`, () => void qin({ tech: 'open', string: s }))),
    qinNote,
  ]),
  h('div', { className: 'grid', style: 'margin-top:6px' }, [
    ...[1, 2, 3, 4, 5, 6, 7].map((s) => button(`按 ${s}`, () => void qin({ tech: 'press', string: s, step: qinStep }))),
    ...[1, 2, 3, 4, 5, 6, 7].map((s) => button(`泛 ${s}`, () => void qin({ tech: 'harmonic', string: s, step: 0 }))),
  ]),
  h('div', { className: 'grid', style: 'margin-top:6px' }, [
    button('按音走上去', () => void qin({ tech: 'press', string: 4, step: qinStep, glide: 1 })), button('按音走下来', () => void qin({ tech: 'press', string: 4, step: qinStep, glide: -1 })),
    button('撮 1', () => void qin({ tech: 'cuo', string: 1 })), button('撮 3', () => void qin({ tech: 'cuo', string: 3 })),
    button('滚', () => void qin({ tech: 'gun' })), button('拂', () => void qin({ tech: 'fu' })), button('一个小句', () => void qin({ tech: 'phrase' })),
  ]),
  slider('按音：往上几级 step', 1, 5, 1, 2, (v) => { qinStep = v; }, (v) => String(v)),
  h('div', { className: 'grid', style: 'margin-top:6px' }, [h('em', { textContent: '只给 pitch（比宫弦高几个半音；世界里的活动这样叫）：', style: 'font-style:normal;color:#a9a7a0' }),
    ...[-5, -3, 0, 2, 4, 7, 9, 12, 14, 16, 19].map((s) => button(String(s), async () => { await ensure(); audio.play('qin', { pitch: s, vel: play.vel }); }))]),
]);
// 一直响着的
const loopRow = h('div', { className: 'grid' }, LOOP_NAMES.map((l) => {
  const b = button(`${LOOP_ZH[l]} ${l}：关`, async () => { await ensure(); const on = !b.classList.contains('gold'); b.classList.toggle('gold', on); b.textContent = `${LOOP_ZH[l]} ${l}：${on ? '开' : '关'}`; audio.setLoop(l, on ? 1 : 0, { pan: play.pan, dist: play.dist }); });
  return b;
}));
// 脚步
let walking: ReturnType<typeof setInterval> | null = null, walkGround: Ground = 'earth';
const walkBtn = button('走起来（每秒 1.7 步）', async () => {
  await ensure();
  if (walking) { clearInterval(walking); walking = null; walkBtn.classList.remove('gold'); return; }
  walkBtn.classList.add('gold');
  walking = setInterval(() => audio.step(walkGround, wetStep >= 0 ? { wet: wetStep } : undefined), 1000 / 1.7);
});
const stepRow = h('div', {}, [
  h('div', { className: 'grid' }, [...GROUND_NAMES.map((g) => button(`${GROUND_ZH[g]} ${g}`, async () => { await ensure(); walkGround = g; audio.step(g, wetStep >= 0 ? { wet: wetStep } : undefined); })), walkBtn]),
  slider('地湿 wet', -0.05, 1, 0.05, -0.05, (v) => { wetStep = v < 0 ? -1 : v; }, (v) => (v < 0 ? '随场景' : v.toFixed(2))),
]);

// —— 离线渲染 ——
const specCanvas = h('canvas', { id: 'spec', width: 1140, height: 470 });
const statsPre = h('pre', { id: 'stats', textContent: '（渲染之后这里是数值）' });
const targetSel = h('select', { id: 'target' });
for (const s of SHOT_NAMES) for (const [v, zh] of VARIANTS[s] ?? [['', '']]) targetSel.append(h('option', { value: `shot:${s}:${v}`, textContent: `一击 · ${SHOT_ZH[s]} ${s}${zh ? ` · ${zh}` : ''}` }));
for (const g of GROUND_NAMES) targetSel.append(h('option', { value: `foot:${g}:`, textContent: `脚步 · ${GROUND_ZH[g]} ${g}` }));
for (const b of BED_NAMES) targetSel.append(h('option', { value: `bed:${b}:`, textContent: `环境 · ${BED_ZH[b]} ${b}（单独一层）` }));
for (const l of LOOP_NAMES) targetSel.append(h('option', { value: `loop:${l}:`, textContent: `一直响着 · ${LOOP_ZH[l]} ${l}` }));
PRESETS.forEach(([name], i) => targetSel.append(h('option', { value: `mix:${i}:`, textContent: `整个场景 · ${name}` })));
targetSel.append(h('option', { value: 'mix:now:', textContent: '整个场景 · 上面此刻的设置' }));
const secInput = h('input', { type: 'number', value: '', placeholder: '秒（空＝默认）', style: 'width:120px; font:inherit; background:#1a1c1e; color:#dcdad4; border:1px solid #303335; border-radius:6px; padding:4px 8px' });
const renderBtn = button('渲染并画频谱', async () => {
  const [kind, name, variant] = targetSel.value.split(':'), seconds = secInput.value ? +secInput.value : undefined;
  renderBtn.disabled = true;
  try {
    let spec: OfflineSpec;
    if (kind === 'shot') spec = shotSpec(name as Shot, { ...play, variant: variant || undefined, seconds, scene });
    else if (kind === 'foot') spec = shotSpec('foot', { ...play, ground: name as Ground, wet: wetStep >= 0 ? wetStep : undefined, seconds: seconds ?? 0.8, scene });
    else if (kind === 'bed') spec = bedSpec(name as Bed, seconds ?? 12);
    else if (kind === 'loop') spec = { seconds: seconds ?? 8, auto: false, loops: { [name]: 1 }, scene };
    else if (name === 'now') spec = { seconds: seconds ?? 30, scene, wet: audio.engine?.scene.wet };
    else { const [, p, wet] = PRESETS[+name]; spec = { seconds: seconds ?? 30, scene: presetScene(p), wet }; }
    const st = await window.__spectrogram(targetSel.selectedOptions[0].textContent ?? '', spec);
    statsPre.textContent = JSON.stringify(st, null, 1);
  } finally { renderBtn.disabled = false; }
}, 'gold');
const playBtn = button('听这一段', async () => {
  if (!lastBuf) return;
  await ensure();
  const ctx = audio.engine!.ctx, s = ctx.createBufferSource();
  s.buffer = lastBuf; s.connect(ctx.destination); s.start();
});

root.append(
  h('h1', { textContent: '安乐窝 · 声音试听台' }),
  h('p', { className: 'note', textContent: '全部现场合成，没有录音。上面是实时试听，最下面是离线渲染（量数值、画频谱）。每一种声音怎么做的、什么时候用，见 docs/AUDIO.md。' }),
  h('div', { className: 'row' }, [unlock, status]),
  slider('总音量', 0, 1, 0.01, 0.8, (v) => audio.setMaster(v)),

  h('h2', { textContent: '环境' }),
  h('p', { className: 'note', textContent: '世界交给 audio.setScene 的就是这些。先点一个现成的场景，再去拖各项看各层怎么跟着变。下面每层的条是「场景此刻给它的量」；点「听」单独听这一层（把它要的条件给满、别的都关掉）；勾上小方块是把这一层定在滑块的量上。听完点「都交还给场景」。' }),
  presetRow,
  scenePanel,
  h('div', { className: 'row' }, [h('label', { textContent: '场景自动' }), autoBox, soloOff]),
  bedTable,
  h('div', { className: 'cols' }, [
    h('div', {}, [h('h3', { textContent: '用户音量（组）' }), ...GROUP_NAMES.map((g) => slider(`${GROUP_ZH[g]} ${g}`, 0, 1.5, 0.01, 1, (v) => audio.setGroup(g, v, 0.6)))]),
    h('div', {}, [h('h3', { textContent: '另开的层' }), ...EXTRA_NAMES.map((l) => slider(`${EXTRA_ZH[l]} ${l}`, 0, 1, 0.01, 0, async (v) => { await ensure(); audio.setLayer(l, v, 0.6); })),
      slider('压低环境 duck', 0, 1, 0.01, 0, (v) => audio.duck(v, 0.8))]),
  ]),

  h('h2', { textContent: '一击' }),
  h('div', { className: 'cols' }, [
    h('div', {}, [
      slider('力度 vel', 0.05, 1, 0.01, 0.7, (v) => { play.vel = v; }),
      slider('音高 pitch（半音）', -12, 12, 0.5, 0, (v) => { play.pitch = v; }, (v) => (v > 0 ? `+${v}` : String(v))),
      slider('时长 dur', 0, 12, 0.05, 0, (v) => { play.dur = v > 0 ? v : undefined; }, (v) => (v > 0 ? v.toFixed(2) : '默认')),
    ]),
    h('div', {}, [
      slider('远近 dist', -0.05, 1, 0.01, -0.05, (v) => { play.dist = v < 0 ? undefined : v; }, (v) => (v < 0 ? '默认' : v.toFixed(2))),
      slider('声像 pan', -1, 1, 0.05, 0, (v) => { play.pan = v || undefined; }),
      select<Space | ''>('空间 space', [['', '随场景'], ['open', '野外'], ['room', '草堂里'], ['near', '贴近'], ['hall', '大殿（旧）']], '', (v) => { play.space = v || undefined; }),
    ]),
  ]),
  h('h3', { textContent: SHOT_GROUP_ZH.study }), shotButtons(SHOT_GROUPS.study),
  h('h3', { textContent: '抚琴 qin' }), qinPanel,
  h('h3', { textContent: '一直响着的（setLoop）' }), loopRow,
  h('h3', { textContent: SHOT_GROUP_ZH.village }), shotButtons(SHOT_GROUPS.village),
  h('h3', { textContent: SHOT_GROUP_ZH.sky }), shotButtons(SHOT_GROUPS.sky),
  h('h3', { textContent: SHOT_GROUP_ZH.steps }), stepRow,
  h('h3', { textContent: SHOT_GROUP_ZH.ui }), shotButtons(SHOT_GROUPS.ui),
  h('h3', { textContent: SHOT_GROUP_ZH.legacy }), shotButtons(SHOT_GROUPS.legacy),

  h('h2', { textContent: '离线渲染与频谱' }),
  h('p', { className: 'note', textContent: '一击用上面的力度 / 音高 / 远近 / 空间；「单独一层」把那一层要的条件给满；「整个场景」按场景混出所有的层。纵轴 40Hz–14kHz（对数），横轴时间。' }),
  h('div', { className: 'row' }, [targetSel, secInput, renderBtn, playBtn]),
  specCanvas,
  statsPre,
);
drawScene();
pushScene();

// ———————————————————————————— 给检查脚本 ————————————————————————————
const realRandom = Math.random;
window.__seed = (n) => {
  if (!n) { Math.random = realRandom; return; }
  let a = n >>> 0;
  // mulberry32
  Math.random = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};
window.__presets = PRESETS.map(([name, p, wet]) => [name, presetScene(p), wet]);
window.__render = async (spec) => ({ ...analyze(await render(spec)), ...lastCost });
window.__renderShot = async (name, opts) => ({ ...analyze(await render(shotSpec(name, opts))), ...lastCost });
window.__renderBed = async (name, seconds, scn, level) => ({ ...analyze(await render(bedSpec(name, seconds, scn, level))), ...lastCost });
window.__mix = (scn, wet = 0) => {
  const s = resolveScene({ ...DEFAULT_SCENE, ...scn }, wet);
  return { ...mixScene(s), _birds: birdDensity(s), _rooster: roosterTime(s), _school: schoolHours(s), _work: workHours(s), _night: s.night, _dawn: s.dawn, _dusk: s.dusk, _wind: s.wind };
};
window.__spectrogram = async (title, spec) => {
  const buf = spec ? await render(spec) : lastBuf;
  if (!buf) throw new Error('还没有渲染过');
  drawSpectrogram(specCanvas, buf, title);
  return analyze(buf);
};
window.__png = () => specCanvas.toDataURL('image/png');
(window as unknown as { __audio: typeof audio }).__audio = audio;
window.__ready = true;
