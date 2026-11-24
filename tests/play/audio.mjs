// 声音的检查：写这些声音的人听不到声音，所以每一种都在无头 Chrome 里用 OfflineAudioContext 算出来，量过才算数。
//
//   node tests/play/audio.mjs                 全部
//   node tests/play/audio.mjs rules           只看混音的规矩（春天没有蝉、雨里鸟不叫……；纯计算，不出声）
//   node tests/play/audio.mjs shots           每一种一击（时长、峰值、均方根、频谱重心、响度随时间、几段）
//   node tests/play/audio.mjs steps           六种地面的脚步
//   node tests/play/audio.mjs beds            每一层单独渲染（均方根、直流、有没有越来越响）
//   node tests/play/audio.mjs loops           一直响着的四样
//   node tests/play/audio.mjs mix             十二个现成的场景整个混出来；雨来鸟收的渐变；最坏的组合削不削波
//   node tests/play/audio.mjs live            实时跑一遍（解锁、换场景、把每种声音都点一遍、层拆不拆）
//   node tests/play/audio.mjs rooster recite  只量名字里含这些字的
//   node tests/play/audio.mjs shots 人声 组 墙 人声关着时书声换成翻书戒尺、组的音量也管世界里的声音、屋里听外头隔着墙
//   node tests/play/audio.mjs beds birds      鸟没有拖长的纯音与慢慢滑的音、刚进门头一只鸟过了五秒才叫
//   加 --png：把频谱图存到 shots/audio/（用眼睛看：鸡鸣是不是四段、书声的字是不是一个个的）
//   加 --md：把量出来的表另存一份 shots/audio/measure.md（贴进 docs/AUDIO.md 用）
//
// 先起不带热更新的开发服务器（PowerShell）：$env:KS_NOHMR="1"; npx vite --port 3816 --strictPort --host
// 换地址：环境变量 KS_AUDIO_URL。
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dir, launch, Report } from './lib.mjs';

const URL = process.env.KS_AUDIO_URL ?? 'http://localhost:3816/audio-lab.html';
const args = process.argv.slice(2), PNG = args.includes('--png'), words = args.filter((a) => !a.startsWith('--'));
const SECTIONS = ['rules', 'shots', 'steps', 'beds', 'loops', 'mix', 'live'];
const picked = words.filter((w) => SECTIONS.includes(w)), names = words.filter((w) => !SECTIONS.includes(w));
const want = (s) => (picked.length ? picked.includes(s) : true);
const match = (n) => !names.length || names.some((w) => n.includes(w));

const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/favicon|Failed to load resource/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) logs.push(`[http ${r.status()}] ${r.url()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 900)}`));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const out = PNG ? dir('audio') : null;
const R = new Report();

// —— 小工具 ——
const BARS = ' ▁▂▃▄▅▆▇█';
/** 响度随时间的一行小图：每格是那一段的均方根，相对最响处 −48…0 分贝 */
const spark = (env) => { const top = Math.max(...env, 1e-9); return env.map((v) => BARS[Math.max(0, Math.min(8, Math.round(((20 * Math.log10(v / top + 1e-9) + 48) / 48) * 8)))]).join(''); };
const pad = (s, n) => { s = String(s); let w = 0; for (const c of s) w += c.charCodeAt(0) > 255 ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };
const f3 = (x) => (x == null ? '—' : x >= 0.1 ? x.toFixed(3) : x.toFixed(4));
/** 给文档用的表（--md）：一节一张 */
const MD = args.includes('--md') ? [] : null;
let section = '';
const head = (title, cols) => { console.log(`\n== ${title} ==`); console.log(cols); section = title; MD?.push(`\n**${title}**\n\n| 名 | 这一声本身（秒） | 峰值 | 均方根 | 频谱重心（Hz） | 6kHz 以上占 | 100Hz 以下占 | 响度随时间 |\n| --- | --- | --- | --- | --- | --- | --- | --- |`); };
const row = (name, st, extra = '') => { MD?.push(`| ${name} | ${st.tail30.toFixed(2)} | ${f3(st.peak)} | ${f3(st.rms)} | ${st.centroid} | ${(st.hf * 100).toFixed(0)}% | ${(st.lf * 100).toFixed(0)}% | \`${spark(st.env)}\` |`); line(name, st, extra); };
const line = (name, st, extra = '') => console.log(`${pad(name, 26)}${pad(st.tail60.toFixed(2), 7)}${pad(f3(st.peak), 8)}${pad(f3(st.rms), 8)}${pad(st.centroid, 7)}${pad(st.hf.toFixed(3), 6)}${pad(st.lf.toFixed(3), 6)}${pad(st.bursts.length, 4)}${spark(st.env)} ${extra}`);
const COLS = `${pad('名', 26)}${pad('余音s', 7)}${pad('峰值', 8)}${pad('均方根', 8)}${pad('重心Hz', 7)}${pad('>6k', 6)}${pad('<100', 6)}${pad('段', 4)}响度随时间（40 格，每格 6 分贝）`;
const call = (fn, ...a) => page.evaluate(([f, x]) => window[f](...x), [fn, a]);
const seed = (n) => page.evaluate((k) => window.__seed(k), n);
async function png(file, title, spec) {
  if (!out) return;
  await page.evaluate(([t, s]) => window.__spectrogram(t, s), [title, spec]);
  const data = await page.evaluate(() => window.__png());
  writeFileSync(join(out, file + '.png'), Buffer.from(data.split(',')[1], 'base64'));
}
/** 一击单独渲染的规格（与试听台里的一样：场景只供取参数，不带环境声） */
const shotSpec = (name, opts = {}, seconds) => ({ seconds, auto: false, shots: [{ name, at: 0.05, opts }], scene: { indoor: 0 } });
/**
 * 鸟叫里的纯音（在页面里离线渲染、做短时傅里叶）：一帧（1024 点）里 300Hz–9kHz 的力气九成以上挤在最强那一格左右，就算纯音；
 * 接连的纯音帧、音高每一跳不过 0.12 个八度，连成一条。返回：纯音占的力气、拖到 0.25 秒以上的几条、0.15 秒以上又滑过三个半音以上的几条、头一声在第几秒
 */
const tonal = (spec) => page.evaluate(async (spec) => {
  const { renderOffline } = await import('/src/audio/offline.ts');
  const buf = await renderOffline(spec), sr = buf.sampleRate, n = buf.length, x = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i]; }
  const N = 1024, hop = 256, b0 = Math.floor((300 * N) / sr), b1 = Math.ceil((9000 * N) / sr), re = new Float64Array(N), im = new Float64Array(N), fr = [];
  const fft = () => {
    for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let a = re[i]; re[i] = re[j]; re[j] = a; a = im[i]; im[i] = im[j]; im[j] = a; } }
    for (let len = 2; len <= N; len <<= 1) { const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1; for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = i + k, q = p + h, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr; re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  };
  for (let a = 0; a + N <= n; a += hop) {
    for (let i = 0; i < N; i++) { re[i] = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))); im[i] = 0; }
    fft();
    let pb = 0, km = b0, pm = 0;
    for (let k = b0; k <= b1; k++) { const p = re[k] * re[k] + im[k] * im[k]; pb += p; if (p > pm) { pm = p; km = k; } }
    let pk = 0; for (let k = km - 3; k <= km + 3; k++) pk += re[k] * re[k] + im[k] * im[k];
    fr.push({ t: a / sr, pb, f: (km * sr) / N, ton: pb > 0 ? pk / pb : 0 });
  }
  let top = 1e-30; for (const f of fr) top = Math.max(top, f.pb);
  const fl = top * 3e-5, tracks = [];
  let cur = null, bandE = 1e-30, pureE = 0, first = null;
  for (const f of fr) {
    if (f.pb > fl) { bandE += f.pb; if (first == null && f.pb > top * 1e-3) first = f.t; }
    const tonal = f.pb > fl && f.ton > 0.9;
    if (tonal) pureE += f.pb;
    if (tonal && cur && Math.abs(Math.log2(f.f / cur.last)) < 0.12) { cur.n++; cur.last = f.f; cur.lo = Math.min(cur.lo, f.f); cur.hi = Math.max(cur.hi, f.f); }
    else { if (cur) tracks.push(cur); cur = tonal ? { n: 1, last: f.f, lo: f.f, hi: f.f } : null; }
  }
  if (cur) tracks.push(cur);
  const T = tracks.map((k) => ({ dur: (k.n * hop) / sr, st: 12 * Math.log2(k.hi / k.lo) }));
  return { pure: +(pureE / bandE).toFixed(2), long: T.filter((k) => k.dur >= 0.25).length, glides: T.filter((k) => k.dur >= 0.15 && k.st >= 3).length, first: first == null ? null : +first.toFixed(2), longest: +Math.max(0, ...T.map((k) => k.dur)).toFixed(3) };
}, spec);

// ———————————————————————————— 一、混音的规矩 ————————————————————————————
if (want('rules')) {
  console.log('\n== 混音的规矩（只算不响）==');
  const mix = (scene, wet) => call('__mix', scene, wet);
  const all = { stream: 1, pond: 1, river: 1, waterfall: 1, bamboo: 1, pines: 1, grove: 1, fields: 1, village: 1, school: 1, work: 1, mill: 1 };
  const day = (season, hour, more = {}) => mix({ place: 'grove', season, hour, near: all, ...more });
  let m = await day('spring', 14);
  R.ok('春天没有蝉', m.cicadas === 0, `cicadas=${m.cicadas}`);
  m = await day('summer', 14);
  R.ok('夏天午后有蝉', m.cicadas > 0.8, `cicadas=${m.cicadas.toFixed(2)}`);
  R.ok('蝉在白天，蛙不在', m.frogs === 0, `frogs=${m.frogs}`);
  m = await day('summer', 14, { rain: 1 });
  R.ok('雨里蝉停、鸟不叫', m.cicadas === 0 && m.birds === 0, `cicadas=${m.cicadas} birds=${m.birds}`);
  m = await day('summer', 22);
  R.ok('夏夜有蛙、有蟋蟀，没有蝉、没有鸟', m.frogs > 0.7 && m.crickets > 0.6 && m.cicadas === 0 && m.birds === 0, `frogs=${m.frogs.toFixed(2)} crickets=${m.crickets.toFixed(2)} cicadas=${m.cicadas} birds=${m.birds}`);
  m = await day('winter', 22);
  R.ok('冬夜没有蛙、没有蟋蟀', m.frogs === 0 && m.crickets === 0, `frogs=${m.frogs} crickets=${m.crickets}`);
  m = await day('autumn', 22);
  R.ok('秋夜蟋蟀最盛，蛙几乎没有', m.crickets > 0.9 && m.frogs < 0.15, `crickets=${m.crickets.toFixed(2)} frogs=${m.frogs.toFixed(2)}`);
  m = await day('spring', 22);
  R.ok('春夜蛙只有一点', m.frogs > 0.2 && m.frogs < 0.5, `frogs=${m.frogs.toFixed(2)}`);
  // 鸟：一天里怎么走
  const hours = [3, 5, 5.6, 6.15, 7, 8, 10, 12, 15, 17.9, 19.5, 22];
  const dens = [];
  for (const h of hours) dens.push((await day('spring', h))._birds);
  console.log('   春天一天里鸟的疏密：' + hours.map((h, i) => `${h}时 ${dens[i].toFixed(2)}`).join('  '));
  const peak = hours[dens.indexOf(Math.max(...dens))];
  R.ok('鸟在日出后一刻最密（春天日出 6:00）', peak === 6.15, `最密在 ${peak} 时`);
  R.ok('鸟往午间稀下去', dens[4] > dens[5] && dens[5] > dens[6] && dens[6] > dens[7], `7时 ${dens[4].toFixed(2)} → 12时 ${dens[7].toFixed(2)}`);
  R.ok('夜里没有鸟', dens[0] === 0 && dens[11] === 0);
  R.ok('天没亮透就有头几声', dens[1] > 0.02 && dens[1] < 0.5, `5时 ${dens[1].toFixed(2)}`);
  m = await day('spring', 6.15);
  const m2 = await day('spring', 13);
  R.ok('鸡鸣属于清晨', m._rooster > 0.9 && m2._rooster === 0, `6:09 ${m._rooster.toFixed(2)}，13 时 ${m2._rooster}`);
  m = await mix({ place: 'grove', season: 'spring', hour: 6.15, near: { grove: 1, stream: 0.5 } });
  R.ok('清晨在桃林里（离村远）村里那一层也在：鸡鸣远远听得见', m.village > 0.9, `village=${m.village.toFixed(2)}`);
  m = await day('spring', 9.5);
  R.ok('上午有书声、有锤锯', m.school > 0.9 && m.work > 0.9, `school=${m.school.toFixed(2)} work=${m.work.toFixed(2)}`);
  m = await day('spring', 12.5);
  R.ok('中午都歇了', m.school === 0 && m.work === 0, `school=${m.school} work=${m.work}`);
  m = await day('spring', 15);
  R.ok('下午孩子们在外头玩：没有书声，匠人照旧干活', m.school === 0 && m.work > 0.9, `school=${m.school} work=${m.work.toFixed(2)}`);
  m = await day('spring', 21);
  R.ok('夜里没有书声、没有锤锯', m.school === 0 && m.work === 0);
  m = await day('spring', 9.5, { rain: 1 });
  R.ok('雨里匠人收工，孩子照念', m.work === 0 && m.school > 0.5, `work=${m.work} school=${m.school.toFixed(2)}`);
  m = await day('spring', 9.5, { near: {} });
  R.ok('离得远：溪、池、河、瀑、竹、松、书声、锤锯、水碓都是 0', ['brook', 'pond', 'river', 'waterfall', 'bamboo', 'pines', 'leaves', 'fieldwind', 'school', 'work', 'mill'].every((k) => m[k] === 0));
  m = await mix({ place: 'yard', season: 'summer', hour: 15, near: all }, 0.8);
  R.ok('雨停了檐还在滴', m.drips > 0.5 && m.rain === 0, `drips=${m.drips.toFixed(2)}`);
  m = await mix({ place: 'yard', season: 'summer', hour: 15, near: all }, 0);
  R.ok('干了就不滴', m.drips === 0);
  m = await day('autumn', 17.3);
  const m3 = await day('summer', 17.3);
  R.ok('雁只在秋冬', m.geese > 0.5 && m3.geese === 0, `秋 ${m.geese.toFixed(2)} 夏 ${m3.geese}`);
  m = await day('winter', 12);
  R.ok('冬天：鸟只剩一点，风是主要的', m._birds < 0.1 && m.air > 0.8, `birds 疏密 ${m._birds.toFixed(2)} air=${m.air.toFixed(2)}`);
  m = await day('spring', 9, { wind: 0.03 });
  const m4 = await day('spring', 9, { wind: 0.3 });
  R.ok('风大了竹、松、叶都响些', m4.bamboo > m.bamboo * 1.8 && m4.pines > m.pines * 1.6, `竹 ${m.bamboo.toFixed(2)}→${m4.bamboo.toFixed(2)} 松 ${m.pines.toFixed(2)}→${m4.pines.toFixed(2)}`);
  // 凝神听（观物亭里「听蝉鸣」「听雨」）
  m = await day('summer', 14);
  let mf = await day('summer', 14, { focus: 'cicada' });
  const about = (x, y) => Math.abs(x / y - 1) < 0.02;
  R.ok('凝神听蝉：蝉提上来 +7.6 分贝，别的环境声退 7.5 分贝', about(mf.cicadas / m.cicadas, 2.4) && about(mf.brook / m.brook, 0.42) && about(mf.bamboo / m.bamboo, 0.42) && about(mf.air / m.air, 0.42), `蝉 ${m.cicadas.toFixed(2)}→${mf.cicadas.toFixed(2)}，溪 ${m.brook.toFixed(2)}→${mf.brook.toFixed(2)}`);
  m = await day('spring', 14); mf = await day('spring', 14, { focus: 'cicada' });
  R.ok('春天没有蝉可听：focus 不动别的层', mf.brook === m.brook && mf.cicadas === 0);
  m = await day('summer', 14, { rain: 1 }); mf = await day('summer', 14, { rain: 1, focus: 'rain' });
  R.ok('凝神听雨：雨提上来，檐滴跟着提一点，别的退下去', about(mf.rain / m.rain, 2.4) && about(mf.drips / m.drips, 1.4) && about(mf.brook / m.brook, 0.42), `雨 ${m.rain.toFixed(2)}→${mf.rain.toFixed(2)}，滴 ${m.drips.toFixed(2)}→${mf.drips.toFixed(2)}`);
  mf = await day('summer', 14, { focus: 'nothing-like-this' });
  m = await day('summer', 14);
  R.ok('不认得的 focus 当作没有', mf.cicadas === m.cicadas && mf.brook === m.brook);
  // 观星：不提哪一层，整个夜静下来——风更轻、蛙退得最多、蟋蟀退一半，夜的底稍显；村里那一层照旧（远处的犬吠、更梆由它排）
  m = await day('summer', 22); mf = await day('summer', 22, { focus: 'stars' });
  R.ok('观星：风更轻、蛙与蟋蟀退下去、夜的底稍显，村里那一层还在', mf.air < m.air * 0.7 && mf.bamboo < m.bamboo * 0.6 && mf.frogs < m.frogs * 0.4 && mf.crickets < m.crickets * 0.6 && mf.night > m.night * 1.1 && mf.village === m.village,
    `气 ${m.air.toFixed(2)}→${mf.air.toFixed(2)}，蛙 ${m.frogs.toFixed(2)}→${mf.frogs.toFixed(2)}，蟋蟀 ${m.crickets.toFixed(2)}→${mf.crickets.toFixed(2)}，夜 ${m.night.toFixed(2)}→${mf.night.toFixed(2)}`);
  // 野（鹊、鸦、鹿、松鼠）：一直「在」，各样什么时候叫在层里算；大雨里收着
  m = await day('autumn', 17.3); mf = await day('autumn', 17.3, { rain: 1 });
  R.ok('野的那一层（鹊、鸦、鹿、松鼠）平时在，大雨里收着', m.wild > 0.9 && mf.wild < 0.35, `晴 ${m.wild.toFixed(2)}，大雨 ${mf.wild.toFixed(2)}`);
  // 旧的叫法（界面没迁完时）：只给 hour / weather / season / indoor / water / height
  m = await mix({ hour: 21, weather: 'rain', season: 'summer', indoor: 1, water: 0.3, height: 0 });
  R.ok('旧的场景写法也认（weather: rain → 雨；没给 near 就按处取）', m.rain === 1 && m.brook > 0, `rain=${m.rain} brook=${m.brook.toFixed(2)}`);
}

// ———————————————————————————— 二、一击 ————————————————————————————
/** [名, 选项, 秒, 期望：峰值范围、几段（贴近、干声量）、别的] */
const SHOTS = [
  // 书房与院里
  ['page', {}, 0.9, { peak: [0.02, 0.2] }], ['paper', {}, 1, { peak: [0.02, 0.2] }], ['paper·unroll', { variant: 'unroll' }, 1.6, { peak: [0.02, 0.2] }], ['paper·smooth', { variant: 'smooth' }, 1, { peak: [0.01, 0.15] }],
  ['brush', { dur: 0.5 }, 1, { peak: [0.02, 0.15] }], ['brush·长', { dur: 1.2 }, 1.6, { peak: [0.02, 0.15] }], ['inkstone', {}, 1.5, { peak: [0.015, 0.15] }],
  ['pour（茶）', {}, 2.8, { peak: [0.02, 0.2] }], ['pour（酒：pitch −3）', { pitch: -3 }, 2.4, { peak: [0.03, 0.25] }], ['pour·water', { variant: 'water' }, 3.2, { peak: [0.03, 0.25] }], ['fan', {}, 1.4, { peak: [0.02, 0.2] }],
  ['kettle', { dur: 8 }, 8.6, { peak: [0.02, 0.25] }], ['cup', {}, 0.6, { peak: [0.04, 0.25] }], ['cup·stone', { variant: 'stone' }, 0.6, { peak: [0.04, 0.25] }],
  ['bowl', {}, 0.8, { peak: [0.04, 0.3] }], ['bowl·sip', { variant: 'sip' }, 1.8, { peak: [0.04, 0.3] }], ['stone', {}, 0.5, { peak: [0.03, 0.25], bursts: [1, 1] }],
  ['lamp', {}, 0.8, { peak: [0.02, 0.15] }], ['ignite', {}, 1, { peak: [0.02, 0.15] }], ['ash', {}, 0.6, { peak: [0.02, 0.2] }],
  ['broom', { dur: 0.6 }, 1, { peak: [0.03, 0.25] }], ['broom·stone', { dur: 0.6, variant: 'stone' }, 1, { peak: [0.03, 0.25] }], ['water', {}, 2, { peak: [0.04, 0.3] }],
  ['gate', {}, 1.6, { peak: [0.03, 0.3] }], ['door', {}, 1.4, { peak: [0.05, 0.3] }], ['knock（门环）', {}, 1.6, { peak: [0.05, 0.35], bursts: [2, 3], tail: [0.5, 1.6] }],
  ['dew', {}, 0.7, { peak: [0.008, 0.06], bursts: [2, 2] }], ['drip', {}, 0.6, { peak: [0.03, 0.2] }], ['plop', {}, 0.9, { peak: [0.05, 0.3] }], ['plop·frog', { variant: 'frog' }, 1.2, { peak: [0.04, 0.3] }], ['ripple', {}, 1.2, { peak: [0.04, 0.25] }],
  // 抚琴
  ['qin·散三弦', { tech: 'open', string: 3 }, 6, { peak: [0.06, 0.4], pitch: 98 }], ['qin（pitch 0）', { pitch: 0 }, 6, { peak: [0.06, 0.4], pitch: 98 }], ['qin（pitch 7）', { pitch: 7 }, 6, { peak: [0.06, 0.4], pitch: 146.8 }],
  ['qin（pitch 6：不在调里，就近落到徵）', { pitch: 6 }, 6, { peak: [0.06, 0.4], pitch: 146.8 }], ['qin（pitch 16）', { pitch: 16 }, 6, { peak: [0.06, 0.4], pitch: 246.9 }], ['qin·按（四弦上二级，带吟）', { tech: 'press', string: 4, step: 2, slide: -120, vib: true }, 6, { peak: [0.06, 0.4] }],
  ['qin·泛音七弦', { tech: 'harmonic', string: 7 }, 5, { peak: [0.04, 0.35], pitch: 329.6 }], ['qin·撮', { tech: 'cuo', string: 1 }, 6, { peak: [0.06, 0.45] }],
  ['qin·滚', { tech: 'gun' }, 4, { peak: [0.06, 0.45] }], ['qin·拂', { tech: 'fu' }, 4, { peak: [0.06, 0.45] }], ['qin·走音', { tech: 'press', string: 4, step: 2, glide: 1 }, 6, { peak: [0.06, 0.4] }], ['qin·小句', { tech: 'phrase' }, 8, { peak: [0.06, 0.45] }],
  // 村里
  ['rooster（跟前）', { dist: 0 }, 3.2, { peak: [0.1, 0.4], bursts: [4, 4] }], ['rooster（没说远近：邻家的）', {}, 4, { peak: [0.02, 0.15] }], ['rooster·far', { variant: 'far' }, 4, { peak: [0.01, 0.1] }],
  ['hen', {}, 2.6, { peak: [0.04, 0.3], bursts: [2, 5] }], ['hen·egg', { variant: 'egg' }, 5, { peak: [0.05, 0.35] }], ['chick', {}, 2, { peak: [0.02, 0.12], bursts: [3, 6] }],
  ['duck', {}, 2.8, { peak: [0.04, 0.3], bursts: [3, 6] }], ['goose（家鹅）', {}, 2.4, { peak: [0.04, 0.35], bursts: [1, 2] }], ['goose·hiss', { variant: 'hiss' }, 1.4, { peak: [0.02, 0.2] }],
  ['cat', {}, 1.4, { peak: [0.02, 0.15], bursts: [1, 1] }], ['dog（远）', {}, 2.6, { peak: [0.01, 0.12], bursts: [2, 3], near: { dist: 0, variant: 'bark' } }], ['dog（跟前：没说哪一样就是呜汪）', { dist: 0 }, 1.4, { peak: [0.04, 0.3], bursts: [1, 2] }], ['dog·woof', { variant: 'woof' }, 1.4, { peak: [0.04, 0.25], bursts: [1, 2] }],
  ['ox', {}, 2.8, { peak: [0.05, 0.3], bursts: [1, 1] }], ['ox·breath', { variant: 'breath' }, 1.2, { peak: [0.03, 0.2] }],
  ['recite（四字）', { n: 4 }, 4, { peak: [0.04, 0.3], beats: [3, 5], near: { voices: 1 } }], ['recite（五字）', { n: 5 }, 4.4, { peak: [0.04, 0.3], beats: [4, 6], near: { voices: 1 } }], ['recite（七字）', { n: 7 }, 5.4, { peak: [0.04, 0.3], beats: [6, 8], near: { voices: 1 } }],
  ['recite·lead', { variant: 'lead', n: 4 }, 8.5, { peak: [0.04, 0.3] }],
  ['sparrow', {}, 2.8, { peak: [0.02, 0.15] }], ['cuckoo（远）', {}, 1.8, { peak: [0.008, 0.08], bursts: [2, 2], near: { dist: 0 } }], ['cuckoo·x3', { variant: 'x3' }, 4.6, { peak: [0.008, 0.08] }], ['goose·wild（远）', { variant: 'wild' }, 5, { peak: [0.006, 0.08] }],
  ['flute（远）', {}, 6.5, { peak: [0.01, 0.12] }], ['flute·近', { far: 0.1, n: 5 }, 6, { peak: [0.04, 0.3] }],
  ['hammer', {}, 1, { peak: [0.08, 0.4], bursts: [1, 1] }], ['saw·push', { variant: 'push' }, 0.8, { peak: [0.03, 0.25] }], ['saw·pull', { variant: 'pull' }, 0.8, { peak: [0.02, 0.2] }], ['plane', {}, 1.3, { peak: [0.03, 0.25] }],
  ['hoe', {}, 0.8, { peak: [0.05, 0.35] }], ['plough', {}, 3.2, { peak: [0.04, 0.3] }], ['bucket·well', { variant: 'well' }, 4.8, { peak: [0.04, 0.3] }], ['bucket·splash', { variant: 'splash' }, 1.6, { peak: [0.04, 0.3] }],
  ['pound', {}, 0.8, { peak: [0.06, 0.4], bursts: [1, 1] }], ['millThump', {}, 1.1, { peak: [0.08, 0.45] }], ['rattle', {}, 1.6, { peak: [0.04, 0.3] }], ['swing', {}, 3.4, { peak: [0.01, 0.15] }],
  ['oar', {}, 2.6, { peak: [0.03, 0.25] }], ['net', {}, 1.4, { peak: [0.04, 0.3] }],
  ['flap', {}, 0.9, { peak: [0.01, 0.15] }], ['chirp', {}, 0.8, { peak: [0.01, 0.12] }], ['tumble', {}, 1.4, { peak: [0.01, 0.15] }], ['thresh', {}, 0.8, { peak: [0.03, 0.3] }], ['laugh', {}, 1.4, { peak: [0.02, 0.2] }],
  ['cluck', {}, 2.6, { peak: [0.04, 0.3] }], ['quack', {}, 2.8, { peak: [0.04, 0.3] }],
  // 后来添的：每一个都要出得来、不出 NaN、不爆音、时长合理（tail：这一声本身 −30 分贝处的秒数范围）、半中间不咔哒、窗口里收得住
  // 桶：入水、提起
  ['bucket', {}, 2.8, { peak: [0.04, 0.3], tail: [1.2, 2.8] }], ['bucket·dip', { variant: 'dip' }, 1.3, { peak: [0.04, 0.3], tail: [0.4, 1.3] }], ['bucket·lift', { variant: 'lift' }, 2, { peak: [0.02, 0.2], tail: [0.6, 2] }],
  ['knock·knuckle', { variant: 'knuckle' }, 1.6, { peak: [0.05, 0.35], bursts: [3, 3] }],
  // 农事
  ['sickle', {}, 1, { peak: [0.02, 0.15], tail: [0.3, 1] }], ['sheaf', {}, 2.3, { peak: [0.02, 0.15], tail: [0.6, 2.3] }], ['flail', {}, 1.1, { peak: [0.06, 0.35], tail: [0.3, 1.1] }],
  ['winnow', {}, 3.8, { peak: [0.015, 0.12], tail: [1.5, 3.8] }], ['millstone', {}, 3.4, { peak: [0.04, 0.25], tail: [2, 3.4] }], ['sow', {}, 1.3, { peak: [0.015, 0.15], tail: [0.4, 1.3] }],
  ['dig', {}, 1.2, { peak: [0.05, 0.3], tail: [0.4, 1.2] }], ['pluck', {}, 1.3, { peak: [0.015, 0.12], tail: [0.4, 1.3] }], ['grain', {}, 2, { peak: [0.02, 0.15], tail: [0.8, 2] }],
  ['grain·sack', { variant: 'sack' }, 2.2, { peak: [0.015, 0.15], tail: [0.8, 2.2] }], ['chop', {}, 1, { peak: [0.05, 0.35], tail: [0.1, 1] }], ['split', {}, 0.9, { peak: [0.02, 0.2], tail: [0.15, 0.9] }],
  ['loom', {}, 1.2, { peak: [0.04, 0.3], tail: [0.3, 1.2] }], ['pull', {}, 1, { peak: [0.02, 0.2], tail: [0.2, 1] }], ['pole', {}, 1.4, { peak: [0.02, 0.2], tail: [0.4, 1.4] }],
  ['rustle', {}, 1.8, { peak: [0.02, 0.2], tail: [0.5, 1.8] }], ['fruitFall', {}, 1.4, { peak: [0.02, 0.25], tail: [0.4, 1.4] }], ['scoop', {}, 1, { peak: [0.02, 0.2], tail: [0.15, 1] }], ['stir', {}, 1, { peak: [0.015, 0.2], tail: [0.2, 1] }], ['windlass', { dur: 2.6 }, 3.6, { peak: [0.01, 0.12], tail: [1.5, 3.6] }],
  // 禽兽虫鱼
  ['frog', {}, 3, { peak: [0.04, 0.3], tail: [0.5, 3] }], ['oriole', {}, 2.4, { peak: [0.03, 0.2], tail: [0.5, 2.4] }], ['magpie', {}, 3.4, { peak: [0.04, 0.25], tail: [0.4, 3.4] }],
  ['crow', {}, 3.2, { peak: [0.03, 0.2], tail: [0.6, 3.2] }], ['crow·flock', { variant: 'flock' }, 8, { peak: [0.015, 0.15], tail: [3, 8] }], ['geese（远）', {}, 9.5, { peak: [0.005, 0.08], tail: [3, 9.5] }],
  ['deer（远）', {}, 2.4, { peak: [0.008, 0.1], tail: [0.4, 2.4] }], ['goat', {}, 3, { peak: [0.04, 0.25], tail: [0.5, 3] }], ['goat·kid', { variant: 'kid' }, 2.8, { peak: [0.03, 0.25], tail: [0.4, 2.8] }],
  ['donkey', {}, 6, { peak: [0.04, 0.3], tail: [2.5, 6] }], ['bee', {}, 3, { peak: [0.02, 0.15], tail: [1, 3] }], ['wings', {}, 2, { peak: [0.04, 0.3], tail: [0.6, 2] }],
  ['fishJump', {}, 1.8, { peak: [0.05, 0.3], tail: [0.5, 1.8] }], ['purr', {}, 4.6, { peak: [0.03, 0.2], tail: [1.5, 4.6] }], ['peck', {}, 2, { peak: [0.01, 0.12], tail: [0.2, 2] }],
  ['squirrel', {}, 2.4, { peak: [0.015, 0.12], tail: [0.4, 2.4] }], ['frogPlop', {}, 1, { peak: [0.04, 0.3], tail: [0.3, 1] }], ['cackle', {}, 5, { peak: [0.05, 0.35] }],
  ['sheep', {}, 3, { peak: [0.03, 0.25], tail: [0.6, 3] }], ['lamb', {}, 1.6, { peak: [0.02, 0.2], tail: [0.2, 1.6] }], ['crane（远景）', {}, 3.2, { peak: [0.006, 0.1], tail: [0.5, 3.2] }], ['crane·近些', { dist: 0.5 }, 3.2, { peak: [0.02, 0.2], tail: [0.5, 3.2] }],
  ['munch', {}, 3.8, { peak: [0.02, 0.2], tail: [1, 3.8] }], ['dogWhine', {}, 1.8, { peak: [0.02, 0.2], tail: [0.4, 1.8] }],
  // 器物与游戏
  ['cast', {}, 1.4, { peak: [0.015, 0.2], tail: [0.3, 1.4] }], ['cast·land', { variant: 'land' }, 1.8, { peak: [0.03, 0.2], tail: [0.8, 1.8] }], ['strike', {}, 1, { peak: [0.02, 0.2], tail: [0.2, 1] }],
  ['fishSplash', {}, 1.8, { peak: [0.04, 0.3], tail: [0.4, 1.8] }], ['flop', {}, 1.6, { peak: [0.03, 0.25], tail: [0.3, 1.6] }], ['reel', {}, 2.4, { peak: [0.02, 0.15], tail: [1, 2.4] }], ['bite', {}, 1.2, { peak: [0.015, 0.12], tail: [0.3, 1.2] }],
  ['kite', {}, 4.4, { peak: [0.01, 0.1], tail: [2, 4.4] }], ['shuttle', {}, 0.6, { peak: [0.03, 0.2], tail: [0.1, 0.6] }], ['arrowPot', {}, 1.8, { peak: [0.02, 0.15], tail: [0.4, 1.8] }],
  ['arrowMiss', {}, 1, { peak: [0.01, 0.12], tail: [0.2, 1] }], ['potRim', {}, 1.4, { peak: [0.02, 0.2], tail: [0.2, 1.4] }], ['potEar', {}, 1.3, { peak: [0.02, 0.2], tail: [0.2, 1.3] }],
  ['toss', {}, 0.7, { peak: [0.01, 0.12], tail: [0.1, 0.7] }], ['catch', {}, 0.5, { peak: [0.02, 0.2], tail: [0.05, 0.5] }], ['swish', {}, 1, { peak: [0.01, 0.15], tail: [0.3, 1] }], ['skip', {}, 2.4, { peak: [0.015, 0.12], tail: [0.6, 2.4] }], ['snowCrunch', {}, 0.8, { peak: [0.015, 0.12], tail: [0.15, 0.8] }],
  ['snowCrunch·roll', { variant: 'roll' }, 2.2, { peak: [0.015, 0.12], tail: [1, 2.2] }], ['chime', {}, 4.4, { peak: [0.008, 0.08], tail: [0.8, 4.4] }], ['lantern', {}, 3.4, { peak: [0.02, 0.15], tail: [1.2, 3.4] }],
  ['starTap', {}, 0.6, { peak: [0.004, 0.04], tail: [0.1, 0.6] }], ['starLight·第一宿', { pitch: 0 }, 2.4, { peak: [0.01, 0.08], tail: [0.5, 2.4], pitch: 784 }], ['starLight·第三宿', { pitch: 2 }, 2.4, { peak: [0.01, 0.08], pitch: 987.8 }],
  ['matUnroll', {}, 1.8, { peak: [0.02, 0.15], tail: [0.6, 1.8] }], ['matRoll', {}, 1.8, { peak: [0.015, 0.15], tail: [0.6, 1.8] }], ['boatBump', {}, 1, { peak: [0.05, 0.35], tail: [0.2, 1] }],
  ['flutter', {}, 1.2, { peak: [0.02, 0.2], tail: [0.3, 1.2] }], ['kiteFall', {}, 1.2, { peak: [0.015, 0.2], tail: [0.2, 1.2] }], ['snap', {}, 0.7, { peak: [0.02, 0.25], tail: [0.05, 0.7] }], ['snowPat', {}, 0.9, { peak: [0.02, 0.25], tail: [0.1, 0.9] }],
  // 人
  ['clapper（远：没说远近）', {}, 4.6, { peak: [0.005, 0.06], tail: [0.4, 4.6] }], ['clapper·三更', { n: 3, dist: 0 }, 4.6, { peak: [0.03, 0.25], bursts: [3, 3] }], ['gong（远）', {}, 3.4, { peak: [0.005, 0.06], tail: [0.8, 3.4] }],
  ['gong·近', { dist: 0 }, 3.4, { peak: [0.03, 0.2], tail: [0.8, 3.4] }], ['wood', {}, 0.6, { peak: [0.05, 0.35], tail: [0.1, 0.6] }], ['murmur（远）', {}, 8.5, { peak: [0.008, 0.08], tail: [2, 8.5] }],
  ['kidsLaugh', {}, 2.2, { peak: [0.03, 0.2], tail: [0.6, 2.2] }], ['greet', {}, 1.4, { peak: [0.02, 0.15], tail: [0.3, 1.4] }], ['whip', {}, 1, { peak: [0.05, 0.4], tail: [0.15, 1] }],
  ['drum（书鼓）', {}, 0.9, { peak: [0.03, 0.3], tail: [0.1, 0.9] }], ['drum·temple', { variant: 'temple' }, 3, { peak: [0.05, 0.45] }],
  // 天上
  ['thunder', {}, 11, { peak: [0.03, 0.3] }], ['thunder·近些', { dist: 0.3, dur: 6 }, 8, { peak: [0.05, 0.4] }], ['thunder·极远', { dist: 0.95, dur: 10 }, 12, { peak: [0.003, 0.1] }],
  ['gust', {}, 5.6, { peak: [0.03, 0.25] }], ['gust·bamboo', { variant: 'bamboo' }, 5.6, { peak: [0.03, 0.25] }], ['gust·pine', { variant: 'pine' }, 5.6, { peak: [0.03, 0.25] }],
  ['meteor（几乎无声）', {}, 1.8, { peak: [0.001, 0.015], tail: [0.5, 1.8] }],
  // 界面
  ['tick', {}, 0.5, { peak: [0.02, 0.15] }], ['open', {}, 0.6, { peak: [0.02, 0.15] }], ['close', {}, 0.6, { peak: [0.02, 0.15] }],
];
/** 后来添的这一批（与改过的桶、叩门环）：另查半中间不咔哒、窗口里收得住 */
const NEWER = new Set(['bucket', 'knock', 'swing', 'laugh', 'sickle', 'sheaf', 'flail', 'winnow', 'millstone', 'sow', 'dig', 'pluck', 'grain', 'windlass', 'frog', 'oriole', 'magpie', 'crow', 'geese', 'deer', 'goat', 'donkey', 'bee', 'wings', 'fishJump', 'purr', 'peck', 'squirrel', 'frogPlop', 'cackle', 'sheep', 'lamb', 'crane', 'munch', 'dogWhine', 'cast', 'strike', 'fishSplash', 'flop', 'reel', 'bite', 'kite', 'shuttle', 'arrowPot', 'arrowMiss', 'potRim', 'potEar', 'toss', 'catch', 'swish', 'skip', 'snowCrunch', 'chime', 'lantern', 'starTap', 'starLight', 'matUnroll', 'matRoll', 'boatBump', 'clapper', 'gong', 'wood', 'murmur', 'kidsLaugh', 'greet', 'meteor', 'chop', 'split', 'loom', 'whip', 'drum', 'pull', 'pole', 'rustle', 'fruitFall', 'scoop', 'stir', 'flutter', 'kiteFall', 'snap', 'snowPat']);
if (want('shots')) {
  head('一击（默认力度 0.7，室外，总音量 0.8）', COLS);
  let k = 1;
  for (const [name, opts, seconds, exp] of SHOTS) {
    k++;
    if (!match(name)) continue;
    const shot = name.split(/[·（]/)[0], newer = NEWER.has(shot);
    await seed(k * 7919);
    const st = await call('__render', shotSpec(shot, opts, seconds));
    // 数段数、量音高用贴近的干声（回声会把字与字之间填上）；后来添的都另渲染一遍干声，看半中间有没有突然断掉（咔哒）
    let dry = null;
    if (exp.bursts || exp.pitch || exp.beats || newer) { await seed(k * 7919); dry = await call('__render', shotSpec(shot, { ...opts, ...exp.near, space: 'near' }, seconds)); }
    const notes = [];
    if (dry && exp.bursts) notes.push(`干声 ${dry.bursts.length} 段 [${dry.bursts.map(([a, b]) => `${a}–${b}`).join(' ')}]`);
    if (dry && exp.beats) notes.push(`一个孩子的干声 ${dry.beats.length} 下 [${dry.beats.join(' ')}]`);
    if (dry && dry.pitches.some((p) => p > 0) && dry.bursts.length <= 12) notes.push(`音高 ${dry.pitches.join(' ')}`);
    if (newer) notes.push(`节点 ${st.nodes}`);
    row(name, st, notes.join('  '));
    const bad = [];
    if (st.nan) bad.push('有 NaN');
    if (st.peak < exp.peak[0] || st.peak > exp.peak[1]) bad.push(`峰值 ${st.peak} 不在 ${exp.peak[0]}–${exp.peak[1]}`);
    if (exp.tail && (st.tail30 < exp.tail[0] || st.tail30 > exp.tail[1])) bad.push(`这一声本身 ${st.tail30} 秒，不在 ${exp.tail[0]}–${exp.tail[1]}`);
    if (newer && dry.cuts > 0) bad.push(`干声里有 ${dry.cuts} 处突然断掉（咔哒）`);
    if (newer && st.endDb > -24) bad.push(`到窗口末尾还没收住（末一格比最响处只低 ${-st.endDb} 分贝）`);
    // 很短的一声，这一小段里的平均值不会正好是零（一个低的闷响只有一两个周期）：按峰值的百分之五放宽
    if (Math.abs(st.dc) > Math.max(0.003, 0.05 * st.peak)) bad.push(`直流 ${st.dc}`);
    if (st.hf > 0.6) bad.push(`6kHz 以上占 ${st.hf}，太亮`);
    if (exp.bursts && (dry.bursts.length < exp.bursts[0] || dry.bursts.length > exp.bursts[1])) bad.push(`段数 ${dry.bursts.length} 不在 ${exp.bursts[0]}–${exp.bursts[1]}`);
    if (exp.beats && (dry.beats.length < exp.beats[0] || dry.beats.length > exp.beats[1])) bad.push(`起伏 ${dry.beats.length} 下，不在 ${exp.beats[0]}–${exp.beats[1]}`);
    if (exp.pitch && !dry.pitches.some((p) => Math.abs(p - exp.pitch) < exp.pitch * 0.03)) bad.push(`音高 ${dry.pitches.join(',')} 不是 ${exp.pitch}`);
    R.ok(name, !bad.length, bad.join('；'));
    await png('shot-' + name.replace(/[·（）\s]/g, '_'), name, shotSpec(shot, exp.bursts || exp.beats ? { ...opts, ...exp.near, space: 'near' } : opts, seconds));
  }
  // 书声：音高是不是落在那三四个音上（商 A3 220、角 B3 247、徵 D4 294、羽 E4 330，各乘这班孩子的 1–1.1）
  if (match('recite')) {
    await seed(4242);
    const st = await call('__render', shotSpec('recite', { n: 5, pitch: 0, space: 'near' }, 4.4));
    const ps = st.pitches.filter((p) => p > 0), deg = [220, 246.94, 293.66, 329.63, 392];
    const off = ps.map((p) => Math.min(...deg.map((d) => Math.abs(1200 * Math.log2(p / d / 1.05)))));
    R.ok('书声的音高落在五声的那几个音上（±1.5 个半音：孩子们本来就不齐）', ps.length >= 3 && off.every((c) => c < 150), `量到 ${ps.join(' ')}Hz，离最近的音 ${off.map((c) => Math.round(c)).join(' ')} 音分`);
    const lens = st.bursts.map(([a, b]) => b - a);
    R.ok('书声末一个字拖得最长', lens.length >= 3 && lens[lens.length - 1] >= Math.max(...lens.slice(0, -1)), `各段 ${lens.map((x) => x.toFixed(2)).join(' ')} 秒`);
  }
  // 和同类声的差别：后来添的每一样与它最像的那一样比——各倍频程（相对各自最响的一段）平均差 4 分贝以上，
  // 或频谱重心差三成以上，或长短差四成以上，或颗粒感（10 毫秒一格的响度平均跳多少）差 1.5 分贝以上：不是同一个声音换了个名字
  if (match('差别')) {
    const PAIRS = [
      ['sickle', {}, 'broom', {}], ['flail', {}, 'thresh', {}], ['dig', {}, 'hoe', {}], ['winnow', {}, 'broom', {}], ['grain', {}, 'pour', { variant: 'water' }], ['sow', {}, 'winnow', {}],
      ['magpie', {}, 'duck', {}], ['crow', {}, 'magpie', {}], ['crow', {}, 'goose', {}], ['goat', {}, 'cat', {}], ['donkey', {}, 'ox', {}], ['deer', { dist: 0 }, 'cuckoo', { dist: 0 }], ['oriole', {}, 'chirp', {}],
      ['geese', { dist: 0.3 }, 'goose', { variant: 'wild', dist: 0.3 }], ['wings', {}, 'flap', {}], ['frogPlop', {}, 'plop', { variant: 'frog' }], ['fishJump', {}, 'plop', {}], ['frog', {}, 'duck', {}],
      ['millstone', {}, 'plough', {}], ['windlass', { dur: 2.6 }, 'bucket', { variant: 'creak' }], ['snowCrunch', {}, 'broom', {}], ['clapper', { dist: 0 }, 'knock', { variant: 'knuckle' }],
      ['gong', { dist: 0 }, 'bowl', {}], ['knock', {}, 'knock', { variant: 'knuckle' }], ['chime', {}, 'windbell', {}], ['wood', {}, 'hammer', {}], ['murmur', { dist: 0 }, 'recite', {}], ['greet', {}, 'ox', {}],
      ['bite', {}, 'drip', {}], ['skip', {}, 'plop', {}], ['shuttle', {}, 'knock', { variant: 'knuckle' }], ['arrowPot', {}, 'cup', {}], ['potRim', {}, 'arrowPot', {}], ['potEar', {}, 'potRim', {}], ['toss', {}, 'cast', {}], ['sheep', {}, 'goat', {}], ['lamb', {}, 'goat', { variant: 'kid' }], ['crane', { dist: 0.5 }, 'geese', { dist: 0.5 }], ['munch', {}, 'peck', {}], ['dogWhine', {}, 'dog', { variant: 'woof' }], ['dogWhine', {}, 'cat', {}], ['rustle', {}, 'gust', {}], ['fruitFall', {}, 'peck', {}], ['scoop', {}, 'winnow', {}], ['stir', {}, 'grain', {}], ['flutter', {}, 'flap', {}], ['kiteFall', {}, 'arrowMiss', {}], ['snap', {}, 'whip', {}], ['snowPat', {}, 'snowCrunch', {}], ['pull', {}, 'dig', {}], ['pole', {}, 'swing', {}], ['starTap', {}, 'tick', {}], ['starLight', {}, 'chime', {}], ['matUnroll', {}, 'paper', { variant: 'unroll' }], ['boatBump', {}, 'door', {}], ['chop', {}, 'hammer', {}], ['split', {}, 'sickle', {}], ['loom', {}, 'knock', { variant: 'knuckle' }], ['whip', {}, 'wood', {}], ['drum', {}, 'knock', { variant: 'knuckle' }], ['strike', {}, 'cast', {}], ['fishSplash', {}, 'fishJump', {}], ['flop', {}, 'pound', {}], ['catch', {}, 'shuttle', {}], ['swish', {}, 'gust', {}], ['purr', {}, 'ox', { variant: 'breath' }],
    ];
    const sec = (n, o) => (o.variant === 'flock' ? 8 : ({ geese: 9.5, murmur: 8.5, donkey: 6, windlass: 3.6 })[n] ?? 3);
    let k2 = 900;
    for (const [a, oa, b, ob] of PAIRS) {
      k2++;
      await seed(k2); const A = await call('__render', shotSpec(a, { ...oa, space: 'near' }, sec(a, oa)));
      await seed(k2); const B = await call('__render', shotSpec(b, { ...ob, space: 'near' }, sec(b, ob)));
      const band = A.bands.reduce((s, x, i) => s + Math.abs(Math.max(-50, x) - Math.max(-50, B.bands[i])), 0) / A.bands.length;
      const cen = Math.abs(Math.log2(Math.max(1, A.centroid) / Math.max(1, B.centroid))), len = Math.abs(Math.log2(Math.max(0.05, A.tail30) / Math.max(0.05, B.tail30))), grit = Math.abs(A.grit - B.grit);
      R.ok(`差别：${a}${oa.variant ? '·' + oa.variant : ''} 与 ${b}${ob.variant ? '·' + ob.variant : ''}`, band >= 4 || cen >= 0.38 || len >= 0.5 || grit >= 1.5, `倍频程平均差 ${band.toFixed(1)} 分贝，重心 ${A.centroid}/${B.centroid}Hz，长短 ${A.tail30}/${B.tail30} 秒，颗粒 ${A.grit}/${B.grit} 分贝`);
    }
  }
  // 鸡鸣：第三段最高、末一段从高处落下来
  if (match('rooster')) {
    await seed(99);
    const sr = 48000, spec = shotSpec('rooster', { space: 'near', pitch: 0, dist: 0 }, 3.2);
    const st = await call('__render', spec);
    R.ok('鸡鸣四段里末一段最长', st.bursts.length === 4 && st.bursts[3][1] - st.bursts[3][0] > st.bursts[0][1] - st.bursts[0][0], `四段长 ${st.bursts.map(([a, b]) => (b - a).toFixed(2)).join(' ')} 秒 (${sr}Hz)`);
  }
  // 人声：界面上默认关着（试玩的人说书声瘆人）。关着时村塾那里不出人声，只有翻书、戒尺；开着时还是孩子们在念（重心在一千赫兹以下）
  const KID = [97, 2.8], lessonShots = Array.from({ length: 12 }, (_, i) => ({ name: 'recite', at: 0.5 + i * 2.5132, opts: { vel: 0.7, at: KID } }));
  const door = { place: 'village', hour: 9.2, season: 'spring', indoor: 0, near: { village: 0.95, school: 0.99 } };
  if (match('人声')) {
    await seed(611); const on = await call('__render', { seconds: 30, auto: false, scene: door, listener: [99, 7.6, 0, -1], shots: lessonShots, voiceLevel: 1 });
    await seed(611); const off = await call('__render', { seconds: 30, auto: false, scene: door, listener: [99, 7.6, 0, -1], shots: lessonShots, voiceLevel: 0 });
    R.ok('人声开着：村塾门口听得见孩子们念书', on.rms > 0.004 && on.centroid < 1000, `均方根 ${on.rms}，重心 ${on.centroid}Hz`);
    R.ok('人声关着：不出人声，只有偶尔的翻书、戒尺（轻得多、没有嗓子的低处）', off.rms < on.rms * 0.2 && off.peak > 0.002 && off.centroid > 1500, `均方根 ${off.rms}（开着时 ${on.rms}），峰值 ${off.peak}，重心 ${off.centroid}Hz`);
    // 草堂里（离村塾九十多米）：原先书声和屋里的整个环境声一样响，现在听不见
    await seed(612); const hall = await call('__render', { seconds: 20, auto: false, scene: { place: 'hall', hour: 9.2, season: 'spring', indoor: 1 }, listener: [0, 1.2, 0, -1], shots: lessonShots.slice(0, 8), voiceLevel: 1 });
    R.ok('草堂里听不见九十多米外的村塾（书声传 55 米）', hall.peak < 1e-4, `峰值 ${hall.peak}`);
  }
  // 组的音量也管世界里出的声音：「村」关了，二十米外那只鸡不叫了；自己手上的活计（没给位置的割麦）照样有声
  if (match('组')) {
    const yard = { place: 'village', hour: 9, season: 'spring', indoor: 0 }, crow = [{ name: 'rooster', at: 0.1, opts: { vel: 0.7, at: [20, 0] } }];
    await seed(613); const a = await call('__render', { seconds: 3.5, auto: false, scene: yard, listener: [0, 0, 0, -1], shots: crow });
    await seed(613); const b = await call('__render', { seconds: 3.5, auto: false, scene: yard, listener: [0, 0, 0, -1], shots: crow, groups: { village: 0 } });
    await seed(614); const c = await call('__render', { seconds: 1.2, auto: false, scene: yard, shots: [{ name: 'sickle', at: 0.05, opts: { vel: 0.6 } }], groups: { village: 0 } });
    await seed(615); const d = await call('__render', { seconds: 3.5, auto: false, scene: yard, listener: [0, 0, 0, -1], shots: [{ name: 'rooster', at: 0.1, opts: { vel: 0.7, at: [2, 0] } }], groups: { village: 0 } });
    R.ok('「村」关了：世界里二十米外的鸡鸣不出', a.peak > 0.02 && b.peak < 1e-4, `开着 ${a.peak} → 关了 ${b.peak}`);
    R.ok('「村」关了：自己手上的活计、摸到跟前（两米）的那只照常有声', c.peak > 0.01 && d.peak > 0.02, `割麦 ${c.peak}，跟前的鸡 ${d.peak}`);
  }
  // 屋里听外头：一击给了位置、在屋外，与外头的环境声一样隔着墙（闷一些、轻一些）
  if (match('墙')) {
    const crow = [{ name: 'rooster', at: 0.1, opts: { vel: 0.7, at: [25, 0] } }];
    await seed(616); const out = await call('__render', { seconds: 3.5, auto: false, scene: { place: 'yard', hour: 9, season: 'spring', indoor: 0 }, listener: [0, 0, 0, -1], shots: crow });
    await seed(616); const ind = await call('__render', { seconds: 3.5, auto: false, scene: { place: 'hall', hour: 9, season: 'spring', indoor: 1 }, listener: [0, 0, 0, -1], shots: crow });
    R.ok('屋里听墙外的鸡鸣：闷一些、轻一些', ind.rms < out.rms * 0.75 && ind.centroid < out.centroid * 0.95, `屋外 均方根 ${out.rms} 重心 ${out.centroid}Hz → 屋里 ${ind.rms} ${ind.centroid}Hz`);
  }
}

// ———————————————————————————— 三、脚步 ————————————————————————————
if (want('steps')) {
  head('脚步（走：力度 0.4；跑：力度 0.57、4.5 米/秒）', COLS);
  for (const g of ['earth', 'grass', 'stone', 'plank', 'floor', 'water', 'snow']) {
    for (const [wet, run] of g === 'water' || g === 'plank' || g === 'floor' || g === 'snow' ? [[0, false], [0, true]] : [[0, false], [1, false], [0, true]]) {
      const name = `foot·${g}${wet ? '·湿' : ''}${run ? '·跑' : ''}`;
      if (!match(name)) continue;
      const o = run ? { ground: g, vel: 0.57, run: true, speed: 4.5 } : { ground: g, wet, vel: 0.4 };
      await seed(31 + g.length);
      const spec = shotSpec('foot', o, 0.8), st = await call('__render', spec);
      await seed(31 + g.length);
      const dry = await call('__render', shotSpec('foot', { ...o, space: 'near' }, 0.8));
      // 表里的「这一声本身」取干声的（带着回声量不出一步有多长）
      row(name, { ...st, tail30: dry.tail30 }, `这一步本身 ${dry.tail30} 秒`);
      const bad = [];
      if (st.nan) bad.push('有 NaN');
      if (st.peak < 0.01 || st.peak > (run ? 0.2 : 0.15)) bad.push(`峰值 ${st.peak} 不在 0.01–${run ? 0.2 : 0.15}`);
      if (st.hf > 0.25) bad.push(`6kHz 以上占 ${st.hf}：脚步不该「嗒」`);
      // 跑起来一秒近三步：一步本身要更短
      if (dry.tail30 > (run ? 0.3 : 0.4)) bad.push(`这一步本身 ${dry.tail30} 秒，太长（${run ? '一秒近三步' : '每秒一步半'}）`);
      if (st.lf > 0.5) bad.push(`一半以上的力气在 100Hz 以下（${st.lf}），小喇叭上听不见`);
      // 雪是「咯吱」，本来就比土路亮
      if (st.centroid > (g === 'snow' ? 3800 : 2600)) bad.push(`重心 ${st.centroid}Hz，太亮`);
      if (dry.cuts > 0) bad.push(`干声里有 ${dry.cuts} 处突然断掉`);
      R.ok(name, !bad.length, bad.join('；'));
      await png('foot-' + g + (wet ? '-wet' : '') + (run ? '-run' : ''), name, spec);
    }
  }
  // 跑：比走重（同一种地面，各量六步取平均），而且仍然短；快走（3.0 米一秒，世界那边也算 run）在两者之间。
  // 力度照界面那一层按速度给的：走 1.4 → 0.38，快走 3.0 → 0.5，跑 4.6 → 0.62（各含随机的一半）
  if (match('跑')) {
    for (const g of ['earth', 'grass', 'stone', 'snow']) {
      let w = 0, f = 0, r = 0;
      for (let i = 0; i < 6; i++) {
        await seed(400 + i); w += (await call('__render', shotSpec('foot', { ground: g, vel: 0.38, speed: 1.4, space: 'near' }, 0.6))).rms;
        await seed(400 + i); f += (await call('__render', shotSpec('foot', { ground: g, vel: 0.5, run: true, speed: 3, space: 'near' }, 0.6))).rms;
        await seed(400 + i); r += (await call('__render', shotSpec('foot', { ground: g, vel: 0.62, run: true, speed: 4.6, space: 'near' }, 0.6))).rms;
      }
      R.ok(`走 < 快走 < 跑：${g}`, w < f && f < r && r > w * 1.5, `均方根 走 ${f3(w / 6)}，快走 ${f3(f / 6)}，跑 ${f3(r / 6)}（跑比走 ${(20 * Math.log10(r / w)).toFixed(1)} 分贝）`);
    }
  }
  // 雪地：和草地、土路听得出不一样（「咯吱」在中高处）
  if (match('snow')) {
    await seed(51); const s = await call('__render', shotSpec('foot', { ground: 'snow', vel: 0.4, space: 'near' }, 0.6));
    await seed(51); const gr = await call('__render', shotSpec('foot', { ground: 'grass', vel: 0.4, space: 'near' }, 0.6));
    await seed(51); const ea = await call('__render', shotSpec('foot', { ground: 'earth', vel: 0.4, space: 'near' }, 0.6));
    R.ok('雪地的脚步：比土路、草地亮（「咯吱」）', s.centroid > ea.centroid * 2 && s.centroid > gr.centroid * 1.2, `重心 雪 ${s.centroid}Hz，草 ${gr.centroid}Hz，土 ${ea.centroid}Hz`);
  }
  // 每一步都不一样
  await seed(5);
  const a = await call('__render', shotSpec('foot', { ground: 'earth', vel: 0.4 }, 0.8)), b = await call('__render', shotSpec('foot', { ground: 'earth', vel: 0.4 }, 0.8));
  R.ok('同一种地面，连着两步不一样', a.peak !== b.peak && a.centroid !== b.centroid, `峰值 ${a.peak} / ${b.peak}，重心 ${a.centroid} / ${b.centroid}`);
}

// ———————————————————————————— 四、环境的各层 ————————————————————————————
/** [层, 秒, 均方根的范围（单独一层、场景给满、输出端）] */
const BEDS = [
  ['air', 20, [0.002, 0.012]], ['pines', 20, [0.005, 0.03]], ['bamboo', 20, [0.004, 0.03]], ['leaves', 20, [0.003, 0.02]], ['fieldwind', 20, [0.004, 0.025]],
  ['brook', 16, [0.008, 0.03]], ['pond', 30, [0.0006, 0.008]], ['river', 20, [0.006, 0.025]], ['waterfall', 20, [0.006, 0.025]],
  // 鸟、燕改成很短的音素（song.ts）、更疏更远之后，同样的黎明三十秒均方根落了五分贝上下（原先 0.0039 / 0.0009）：下限跟着放低
  ['birds', 30, [0.001, 0.02]], ['swallows', 30, [0.0003, 0.01]], ['cicadas', 30, [0.004, 0.02]], ['frogs', 30, [0.002, 0.02]], ['crickets', 30, [0.002, 0.012]], ['geese', 16, [0.0004, 0.01]], ['wild', 30, [0.0004, 0.02]],
  ['rain', 16, [0.012, 0.045]], ['drips', 16, [0.001, 0.012]], ['snow', 16, [0.001, 0.008]], ['night', 16, [0.001, 0.008]],
  ['village', 30, [0.001, 0.03]], ['school', 30, [0.006, 0.03]], ['work', 30, [0.0015, 0.04]], ['mill', 20, [0.005, 0.03]],
];
if (want('beds')) {
  head('环境的各层（单独一层，场景给满它要的那一项）', COLS);
  let k = 100;
  for (const [name, seconds, range] of BEDS) {
    k++;
    if (!match(name)) continue;
    await seed(k * 104729);
    const st = await call('__renderBed', name, seconds);
    const half = Math.floor(st.env.length / 2), r1 = Math.hypot(...st.env.slice(0, half)) / Math.sqrt(half), r2 = Math.hypot(...st.env.slice(half)) / Math.sqrt(st.env.length - half);
    row(name, st, `直流 ${st.dc}  左右 ${st.lr.join('/')}  前后半 ${f3(r1)}/${f3(r2)}  节点 ${st.nodes}`);
    const bad = [];
    if (st.nan) bad.push('有 NaN');
    if (st.rms < range[0] || st.rms > range[1]) bad.push(`均方根 ${st.rms} 不在 ${range[0]}–${range[1]}`);
    if (Math.abs(st.dc) > 0.0015) bad.push(`直流 ${st.dc}`);
    if (st.peak > 0.5) bad.push(`峰值 ${st.peak}`);
    if (st.hf > 0.5) bad.push(`6kHz 以上占 ${st.hf}，太亮`);
    if (st.lf > 0.5) bad.push(`100Hz 以下占 ${st.lf}，太闷`);
    // 持续的层不该越来越响（疏的层——鸟、村里——前后半本来就不一样，不看）
    if (['air', 'pines', 'bamboo', 'leaves', 'fieldwind', 'brook', 'river', 'waterfall', 'rain', 'snow', 'night', 'crickets', 'mill'].includes(name) && (r2 > r1 * 3 || r1 > r2 * 3)) bad.push(`前后半差太多 ${f3(r1)} / ${f3(r2)}`);
    R.ok(name, !bad.length, bad.join('；'));
    await png('bed-' + name, name, { seconds, auto: false, beds: { [name]: 1 }, scene: bedScene(name), wet: name === 'drips' ? 0.8 : undefined });
  }
  // 溪：近则明
  if (match('brook')) {
    await seed(7);
    const far = await call('__renderBed', 'brook', 10, { near: { stream: 0.3 } }), near = await call('__renderBed', 'brook', 10, { near: { stream: 1 } });
    R.ok('溪：走近了更亮', near.centroid > far.centroid * 1.5, `远处重心 ${far.centroid}Hz，跟前 ${near.centroid}Hz`);
  }
  if (match('rain')) {
    await seed(8);
    const outd = await call('__renderBed', 'rain', 10, { indoor: 0, place: 'grove' }), ind = await call('__renderBed', 'rain', 10, { indoor: 1, place: 'hall' });
    R.ok('雨：在屋里是闷的', ind.centroid < outd.centroid * 0.6 && ind.rms < outd.rms, `屋外重心 ${outd.centroid}Hz 均方根 ${outd.rms}，屋里 ${ind.centroid}Hz ${ind.rms}`);
  }
  if (match('birds')) {
    // 鸟：一声是几个很短的音素（song.ts），不是一个振荡器一路唱下去——试玩的人说开场的鸟叫瘆人：原先七成是纯音、一分钟里五六处拖长的哨音
    await seed(141);
    const all = { stream: 1, pond: 1, river: 1, waterfall: 1, bamboo: 1, pines: 1, grove: 1, fields: 1, village: 1, school: 1, work: 1, mill: 1 };
    const t = await tonal({ seconds: 60, auto: false, beds: { birds: 1 }, scene: { place: 'grove', hour: 6.2, season: 'spring', indoor: 0, near: all } });
    R.ok('鸟：没有拖长的纯音、没有慢慢滑过去的音，纯音不到一半', t.long === 0 && t.glides <= 1 && t.pure < 0.5, `纯音占 ${t.pure}，0.25 秒以上的 ${t.long} 条，滑过去的 ${t.glides} 条，最长一条 ${t.longest} 秒`);
    // 刚进门的头一分钟：头一只鸟隔几秒才叫（桃林入口，春天上午，只听鸟那一组）
    await seed(142);
    const o = await tonal({ seconds: 25, scene: { place: 'grove', hour: 9.2, season: 'spring', indoor: 0, wind: 0.126, near: { grove: 0.956, stream: 0.02 } }, groups: { wind: 0, water: 0, insects: 0, weather: 0, village: 0 }, opening: true });
    R.ok('刚进门：头一只鸟过了五秒才叫', o.first == null || o.first > 5, `头一声在第 ${o.first} 秒`);
  }
  if (match('cicadas')) {
    // 蝉要有起有落：四十段里最响与最轻差得出来
    await seed(9);
    const st = await call('__renderBed', 'cicadas', 60), lo = Math.min(...st.env), hi = Math.max(...st.env);
    R.ok('蝉：一涨一落', hi > lo * 1.6, `一分钟里各段均方根 ${f3(lo)}–${f3(hi)}`);
    R.ok('蝉：不刺（6kHz 以上不到三成）', st.hf < 0.3, `6kHz 以上占 ${st.hf}，重心 ${st.centroid}Hz`);
  }
}
/** 与试听台里 bedSpec 同样的条件（画频谱图时用） */
function bedScene(name) {
  const near = { stream: 1, pond: 1, river: 1, waterfall: 1, bamboo: 1, pines: 1, grove: 1, fields: 1, village: 1, school: 1, work: 1, mill: 1 };
  const base = {
    leaves: { season: 'summer' }, pond: { season: 'summer' }, river: { hour: 10 }, birds: { hour: 6.2, season: 'spring' }, swallows: { hour: 7, season: 'spring' }, cicadas: { hour: 14, season: 'summer' },
    frogs: { hour: 22, season: 'summer' }, crickets: { hour: 22, season: 'autumn' }, geese: { hour: 17.5, season: 'autumn' }, wild: { hour: 17.3, season: 'autumn' }, rain: { rain: 1, wind: 0.2 }, drips: { place: 'yard' }, snow: { snow: 1, season: 'winter' },
    night: { hour: 23 }, village: { hour: 6.2, place: 'village' }, school: { hour: 9.5, place: 'village' }, work: { hour: 9.5, place: 'village' },
  };
  return { place: 'grove', hour: 9, season: 'spring', rain: 0, snow: 0, mist: 0, storm: 0, wind: 0.09, indoor: 0, near, ...base[name] };
}

// ———————————————————————————— 五、一直响着的 ————————————————————————————
if (want('loops')) {
  head('一直响着的（setLoop）', COLS);
  const LOOPS = [
    ['kettle', 10, [0.004, 0.05]], ['inkstone', 6, [0.004, 0.04]], ['saw', 6, [0.006, 0.06]], ['plough', 8, [0.01, 0.08]],
    // 后来添的六样
    ['millstone', 10, [0.004, 0.04]], ['windlass', 8, [0.002, 0.03]], ['frog', 14, [0.002, 0.03]], ['bee', 10, [0.001, 0.02]], ['kite', 10, [0.001, 0.02]], ['murmur', 14, [0.0008, 0.02]], ['line', 8, [0.0008, 0.02]], ['boatWater', 8, [0.002, 0.03]], ['snowRoll', 8, [0.002, 0.03]],
  ];
  for (const [name, seconds, range] of LOOPS) {
    if (!match(name)) continue;
    await seed(name.length * 17);
    const spec = { seconds, auto: false, loops: { [name]: 1 }, scene: { indoor: name === 'kettle' || name === 'inkstone' ? 1 : 0, hour: name === 'frog' ? 22 : 10, season: 'summer' } }, st = await call('__render', spec);
    const half = Math.floor(st.env.length / 2), r1 = Math.hypot(...st.env.slice(2, half)) / Math.sqrt(half - 2), r2 = Math.hypot(...st.env.slice(half)) / Math.sqrt(st.env.length - half);
    row(name, st, `直流 ${st.dc}  前后半 ${f3(r1)}/${f3(r2)}  节点 ${st.nodes}`);
    const bad = [];
    if (st.nan) bad.push('有 NaN');
    if (st.rms < range[0] || st.rms > range[1]) bad.push(`均方根 ${st.rms} 不在 ${range[0]}–${range[1]}`);
    if (st.peak > 0.5) bad.push(`峰值 ${st.peak}`);
    if (Math.abs(st.dc) > 0.0015) bad.push(`直流 ${st.dc}`);
    // 一直响着的不该越来越响或越来越轻（煮水是慢慢开的，除外）
    if (name !== 'kettle' && (r2 > r1 * 2.5 || r1 > r2 * 2.5)) bad.push(`前后半差太多 ${f3(r1)} / ${f3(r2)}`);
    if (name !== 'kettle' && st.cuts > 0) bad.push(`有 ${st.cuts} 处突然断掉`);
    R.ok(name, !bad.length, bad.join('；'));
    await png('loop-' + name, name, spec);
  }
  if (match('kettle')) {
    await seed(3);
    const st = await call('__render', { seconds: 10, auto: false, loops: { kettle: 1 }, scene: { indoor: 1 } });
    const a = Math.hypot(...st.env.slice(0, 8)), b = Math.hypot(...st.env.slice(24, 32));
    R.ok('煮水：是慢慢开的（后面比开头响得多）', b > a * 3, `头两秒 ${f3(a / Math.sqrt(8))}，六到八秒 ${f3(b / Math.sqrt(8))}`);
  }
}

// ———————————————————————————— 六、整个场景 ————————————————————————————
if (want('mix')) {
  head('整个场景（按场景混出所有的层，40 秒）', COLS);
  const presets = await page.evaluate(() => window.__presets);
  let k = 500;
  for (const [name, scene, wet] of presets) {
    k++;
    if (!match(name)) continue;
    await seed(k * 15485863);
    const spec = { seconds: 40, scene, wet }, st = await call('__render', spec);
    row(name, st, `直流 ${st.dc}  算 ${st.ms} 毫秒  建 ${st.nodes} 个节点`);
    const bad = [];
    if (st.nan) bad.push('有 NaN');
    // 这是个安静的地方：底要低（雨天、雷雨可以高一些）；夜里在屋里、观星时本来就近乎无声
    const top = scene.rain > 0.5 ? 0.06 : 0.035, low = (scene.indoor > 0.5 && scene.hour > 20) || scene.focus === 'stars' ? 0.0012 : 0.003;
    if (st.rms < low || st.rms > top) bad.push(`均方根 ${st.rms} 不在 ${low}–${top}`);
    if (st.peak > 0.45) bad.push(`峰值 ${st.peak}`);
    if (Math.abs(st.dc) > 0.0015) bad.push(`直流 ${st.dc}`);
    R.ok(name, !bad.length, bad.join('；'));
    await png('mix-' + String(k - 500).padStart(2, '0'), name, spec);
  }
  // 雨来鸟收：春晨桃林，第 12 秒起下雨。量 2–6kHz 里鸟的峰与雨的沙
  if (match('雨来')) {
    await seed(77);
    const base = presets[0][1];
    const st = await call('__render', { seconds: 40, scene: base, steps: [{ at: 12, scene: { rain: 1, wind: 0.25 } }] });
    console.log(pad('春晨 · 第 12 秒起雨', 26) + spark(st.env) + `  均方根 ${st.rms}`);
    const before = Math.hypot(...st.env.slice(2, 11)) / 3, after = Math.hypot(...st.env.slice(28, 38)) / Math.sqrt(10);
    R.ok('雨来了：整体慢慢响起来，没有突跳', after > before && st.peak < 0.45, `雨前 ${f3(before)}，雨后 ${f3(after)}，峰值 ${st.peak}`);
    const m0 = await call('__mix', base, 0), m1 = await call('__mix', { ...base, rain: 1 }, 0);
    R.ok('雨来了：鸟那一层归零', m0.birds > 0.5 && m1.birds === 0, `birds ${m0.birds.toFixed(2)} → ${m1.birds}`);
    await png('mix-rain-comes', '春晨 · 第 12 秒起雨', { seconds: 40, scene: base, steps: [{ at: 12, scene: { rain: 1, wind: 0.25 } }] });
  }
  // 凝神听雨：观物亭里下着雨，第 4 秒起听，第 12 秒放开——三秒上下提上来、三秒上下还原，不突跳
  //（用雨来量，因为雨是匀的；蝉自己就一涨一落，量不出是谁提的。蝉那一头的数在「混音的规矩」里验过）
  if (match('听雨')) {
    await seed(81);
    const scene = { ...presets[3][1], rain: 1, wind: 0.2 }, spec = { seconds: 20, scene, steps: [{ at: 4, scene: { focus: 'rain' } }, { at: 12, scene: { focus: null } }] };
    const st = await call('__render', spec);
    const seg = (a, b) => Math.hypot(...st.env.slice(a * 2, b * 2)) / Math.sqrt((b - a) * 2);
    const before = seg(1, 4), early = seg(4, 5), mid = seg(8, 12), after = seg(17, 20);
    console.log(pad('雨中观物亭 · 4–12 秒听雨', 26) + spark(st.env) + `  前 ${f3(before)} 刚听 ${f3(early)} 听着 ${f3(mid)} 放开后 ${f3(after)}`);
    R.ok('凝神听雨：提上来了（约 +7 分贝），是渐变的，放开后还原', mid > before * 1.8 && mid < before * 2.8 && early < mid * 0.9 && after < before * 1.25, `前 ${f3(before)} → 听着 ${f3(mid)}（${(20 * Math.log10(mid / before)).toFixed(1)} 分贝）→ 放开后 ${f3(after)}`);
    await png('mix-focus-rain', '雨中观物亭 · 4–12 秒听雨', spec);
  }
  // 观星：同一个夏夜的溪桥上，凝神看星时整个静下来（不是哪一层没了，是都退了一些）
  if (match('观星')) {
    const p = presets.find(([n]) => n.includes('观星'));
    await seed(83); const a = await call('__render', { seconds: 30, scene: { ...p[1], focus: null } });
    await seed(83); const b = await call('__render', { seconds: 30, scene: p[1] });
    R.ok('观星：夜更静（整体退 3 分贝以上），不是一片死寂', b.rms < a.rms * 0.72 && b.rms > a.rms * 0.2, `均方根 ${a.rms} → ${b.rms}（${(20 * Math.log10(b.rms / a.rms)).toFixed(1)} 分贝）`);
  }
  // 雪后：地上白着时外头也闷一点（积雪吃声音）
  if (match('雪后')) {
    const p = presets.find(([n]) => n.includes('雪后'));
    await seed(84); const a = await call('__render', { seconds: 20, scene: { ...p[1], cover: 0 } });
    await seed(84); const b = await call('__render', { seconds: 20, scene: p[1] });
    R.ok('雪后：积雪把高处吃掉一些，四下里散回来的也少（整体轻一些）', b.hf < a.hf * 0.9 && b.rms < a.rms * 0.95, `6kHz 以上 ${a.hf} → ${b.hf}，重心 ${a.centroid} → ${b.centroid}Hz，均方根 ${a.rms} → ${b.rms}`);
  }
  // 做事时压低
  if (match('压低')) {
    await seed(78);
    const scene = presets[3][1];
    const a = await call('__render', { seconds: 12, scene }), b = await call('__render', { seconds: 12, scene, duck: 0.6 });
    R.ok('压低六成：环境声降到四成上下', b.rms < a.rms * 0.55 && b.rms > a.rms * 0.25, `${a.rms} → ${b.rms}`);
  }
  // 最坏的组合：雷雨夜、离什么都近、各组开到最大，同时鸡鸣、锤、雷、琴、书声一起来
  if (match('最坏')) {
    await seed(79);
    const near = { stream: 1, pond: 1, river: 1, waterfall: 1, bamboo: 1, pines: 1, grove: 1, fields: 1, village: 1, school: 1, work: 1, mill: 1 };
    const st = await call('__render', {
      seconds: 12, master: 1, scene: { place: 'village', hour: 9.5, season: 'summer', rain: 1, storm: 1, wind: 0.34, indoor: 0, near },
      groups: { wind: 1.5, water: 1.5, birds: 1.5, insects: 1.5, weather: 1.5, village: 1.5 }, layers: { qin: 1, chant: 1, bellfar: 1, eaves: 1 }, loops: { kettle: 1, saw: 1, plough: 1, inkstone: 1 },
      shots: [{ name: 'rooster', at: 3, opts: { vel: 1, dist: 0 } }, { name: 'hammer', at: 3.2, opts: { vel: 1 } }, { name: 'thunder', at: 2.5, opts: { vel: 1, dist: 0.2 } }, { name: 'qin', at: 3.1, opts: { vel: 1, tech: 'cuo', string: 1 } }, { name: 'recite', at: 3, opts: { vel: 1 } }, { name: 'bell', at: 3, opts: { vel: 1 } }, { name: 'drum', at: 3.3, opts: { vel: 1 } }, { name: 'millThump', at: 3.1, opts: { vel: 1 } }, { name: 'flute', at: 2.8, opts: { vel: 1, far: 0 } }],
    });
    console.log(pad('最坏的组合', 26) + spark(st.env) + `  峰值 ${st.peak} 均方根 ${st.rms}`);
    R.ok('最坏的组合不削波（软限幅保证不过 0.93）', st.peak <= 0.93 && !st.nan, `峰值 ${st.peak}`);
  }
}

// ———————————————————————————— 七、实时跑一遍 ————————————————————————————
if (want('live')) {
  console.log('\n== 实时（真的 AudioContext）==');
  logs.length = 0;
  const r = await page.evaluate(async () => {
    const au = window.__audio, wait = (ms) => new Promise((f) => setTimeout(f, ms)), res = {};
    await au.unlock();
    res.ready = au.ready;
    const e = au.engine;
    // 场景一个个换过去；每换一个，把一批声音点一遍
    const shots = Object.keys(await import('/src/audio/shots.ts').then((m) => m.SHOTS));
    res.shots = shots.length;
    let i = 0;
    res.layers = {};
    for (const [name, scene, wet] of window.__presets) {
      e.setWet(wet ?? null);
      au.setScene(scene);
      au.setListener(0, 0, 0, -1);
      for (let k = 0; k < 8; k++, i++) au.play(shots[i % shots.length], { vel: 0.4, at: [10, -5] });
      au.step('wet'); au.step('wood'); au.step('grass'); au.qin();
      await wait(700);
      res.layers[name] = e.activeLayers().join(' ');
    }
    res.voicesBusy = e.voices;
    // 每帧交场景：一秒六十回，看排程花多少工夫
    const t0 = performance.now();
    for (let k = 0; k < 600; k++) au.setScene({ near: { stream: (k % 100) / 100, grove: 1 - (k % 50) / 50 }, hour: 6 + k * 0.001 });
    res.setScene600 = +(performance.now() - t0).toFixed(1);
    let worst = 0, sum = 0;
    for (let k = 0; k < 100; k++) { const a = performance.now(); e.setScene({ near: { stream: (k % 10) / 10 } }); e.pump(e.now + 0.25 + k * 0.1); const d = performance.now() - a; sum += d; worst = Math.max(worst, d); }
    res.pumpAvg = +(sum / 100).toFixed(2); res.pumpWorst = +worst.toFixed(1);
    // loop 开了又关（连同后来添的六样）；不认得的名字什么都不做
    const LOOPS = ['kettle', 'saw', 'millstone', 'windlass', 'frog', 'bee', 'kite', 'murmur', 'line', 'boatWater', 'snowRoll'];
    for (const l of LOOPS) au.setLoop(l, 1, l === 'saw' ? { at: [30, 0] } : l === 'bee' ? { at: [2, 1] } : {});
    au.setLoop('no-such-loop', 1); au.setLoop('frog', NaN);
    au.setLoop('frog', 1);
    await wait(1500);
    res.loopsOn = e.activeLayers().filter((l) => LOOPS.includes(l)).length;
    res.loopsWant = LOOPS.length;
    res.badLoop = e.activeLayers().includes('no-such-loop');
    for (const l of LOOPS) au.setLoop(l, 0);
    // 不认得的一击、带坏数的一击：不出声，也不报错
    au.play('no-such-sound', { vel: 0.5 }); au.play('magpie', { vel: NaN, at: [NaN, 3] }); au.play('crow', { variant: 'flock', at: [40, 40] });
    // 跑、踩雪
    for (let k = 0; k < 6; k++) { au.step(k % 2 ? 'snow' : 'earth', { run: true, speed: 4.6, vel: 0.6 }); await wait(120); }
    // 全都静下来：场景关掉，等各层拆掉
    au.setAuto(false);
    await wait(18000);
    res.afterOff = e.activeLayers().join(' ');
    au.setAuto(true);
    await wait(600);
    res.backOn = e.activeLayers().length;
    au.duck(0.7, 0.2); au.setGroup('birds', 0); au.setLayer('wind', 0.5); au.setLayer('qin', 0.5); au.setMuted(true);
    await wait(400);
    au.setMuted(false); au.setLayer('qin', 0); au.duck(0);
    res.state = e.ctx.state;
    return res;
  });
  // 这里换场景换得快（0.7 秒一个），前面场景里正在淡出、还没拆掉的层也列在里头——看的是「换得再急也不出错、最后都拆得掉」
  console.log('   一个接一个换场景，各自换过去 0.7 秒时还活着的层（含前面场景里正在淡出的）：');
  for (const [k, v] of Object.entries(r.layers)) console.log(`     ${pad(k, 22)}${v}`);
  R.ok('解锁', r.ready);
  R.ok('每帧交场景不费事', r.setScene600 < 30, `600 次 setScene 共 ${r.setScene600} 毫秒`);
  R.ok('排程不卡', r.pumpAvg < 4, `连排一百次（每次场景都变），平均 ${r.pumpAvg} 毫秒，最长 ${r.pumpWorst} 毫秒`);
  R.ok('loop 开得起来（连同后来添的推磨、辘轳、蛙、蜂、纸鸢、人声）', r.loopsOn === r.loopsWant && !r.badLoop, `${r.loopsOn}/${r.loopsWant}${r.badLoop ? '，不认得的名字也建了一层' : ''}`);
  R.ok('场景关掉后各层都拆了', r.afterOff === '', `剩 ${r.afterOff || '无'}`);
  R.ok('再打开各层回来', r.backOn > 2, `${r.backOn} 层`);
  R.ok(`把 ${r.shots} 种一击轮着点了一遍（外加不认得的名字、带坏数的、跑与踩雪），没有报错`, logs.length === 0, logs.slice(0, 6).join('\n'));
  // 界面那一层（src/app/sound.ts）：认世界的叫法与别名；不认得的名字只记一回警告、不报错
  logs.length = 0;
  const s = await page.evaluate(async () => {
    const snd = await import('/src/app/sound.ts'), au = window.__audio;
    await snd.loadSound();
    snd.unlock({ master: 0.8, muted: false, levels: {} });
    await new Promise((f) => setTimeout(f, 300));
    const v0 = au.engine.voices;
    snd.play('cackle', { vel: 0.5, x: 3, z: 2 }); snd.play('crows', { vel: 0.5 }); snd.play('henEgg', { vel: 0.4 }); snd.play('snowball', { vel: 0.4 });
    const v1 = au.engine.voices;
    for (let k = 0; k < 3; k++) { snd.play('no-such-thing', { vel: 0.5 }); snd.loop('no-such-loop', 1); }
    snd.loop('millstone', 0.6, { x: 5, z: 5 }); snd.loop('bees', 0.5);
    snd.step('earth', { run: true, speed: 4.4 }); snd.step('snow', { run: false }); snd.step('wet', { wading: true, run: true, speed: 5 });
    await new Promise((f) => setTimeout(f, 400));
    const layers = au.engine.activeLayers();
    snd.loop('millstone', 0); snd.loop('bees', 0);
    return { played: v1 - v0, unknown: [...snd.unknown], layers };
  });
  const warns = logs.filter((l) => l.includes('不认得'));
  R.ok('界面那一层：别名（cackle、crows、henEgg、snowball）都出得来', s.played >= 4, `多了 ${s.played} 声`);
  R.ok('界面那一层：持续声认别名、给了位置也行（millstone、bees）', s.layers.includes('millstone') && s.layers.includes('bee'), s.layers.join(' '));
  R.ok('界面那一层：不认得的名字略过，各只记一回警告', s.unknown.includes('no-such-thing') && s.unknown.includes('loop:no-such-loop') && warns.length === 2 && logs.length === warns.length, `警告 ${warns.length} 条：${warns.join(' / ')}；别的 ${logs.length - warns.length} 条`);
  // 这两条警告是故意引出来的：查过了就不再列进末尾的「页面上的报错」
  for (let i = logs.length - 1; i >= 0; i--) if (logs[i].includes('no-such-')) logs.splice(i, 1);
}

if (logs.length) console.log('\n页面上的报错：\n' + logs.slice(0, 20).join('\n'));
if (MD) { const file = join(dir('audio'), 'measure.md'); writeFileSync(file, MD.join('\n') + '\n'); console.log('\n表已写到 ' + file); }
const bad = R.done();
await browser.close();
process.exit(bad || logs.some((l) => l.startsWith('[pageerror]')) ? 1 : 0);
