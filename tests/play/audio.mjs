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
  ['gate', {}, 1.6, { peak: [0.03, 0.3] }], ['door', {}, 1.4, { peak: [0.05, 0.3] }], ['knock', {}, 1.6, { peak: [0.05, 0.35], bursts: [3, 3] }],
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
  ['hoe', {}, 0.8, { peak: [0.05, 0.35] }], ['plough', {}, 3.2, { peak: [0.04, 0.3] }], ['bucket', {}, 4.8, { peak: [0.04, 0.3] }], ['bucket·splash', { variant: 'splash' }, 1.6, { peak: [0.04, 0.3] }],
  ['pound', {}, 0.8, { peak: [0.06, 0.4], bursts: [1, 1] }], ['millThump', {}, 1.1, { peak: [0.08, 0.45] }], ['rattle', {}, 1.6, { peak: [0.04, 0.3] }], ['swing', {}, 3.4, { peak: [0.01, 0.15] }],
  ['oar', {}, 2.6, { peak: [0.03, 0.25] }], ['net', {}, 1.4, { peak: [0.04, 0.3] }],
  ['flap', {}, 0.9, { peak: [0.01, 0.15] }], ['chirp', {}, 0.8, { peak: [0.01, 0.12] }], ['tumble', {}, 1.4, { peak: [0.01, 0.15] }], ['thresh', {}, 0.8, { peak: [0.03, 0.3] }], ['laugh', {}, 1.4, { peak: [0.02, 0.2] }],
  ['cluck', {}, 2.6, { peak: [0.04, 0.3] }], ['quack', {}, 2.8, { peak: [0.04, 0.3] }],
  // 天上
  ['thunder', {}, 11, { peak: [0.03, 0.3] }], ['thunder·近些', { dist: 0.3, dur: 6 }, 8, { peak: [0.05, 0.4] }], ['thunder·极远', { dist: 0.95, dur: 10 }, 12, { peak: [0.003, 0.1] }],
  ['gust', {}, 5.6, { peak: [0.03, 0.25] }], ['gust·bamboo', { variant: 'bamboo' }, 5.6, { peak: [0.03, 0.25] }], ['gust·pine', { variant: 'pine' }, 5.6, { peak: [0.03, 0.25] }],
  // 界面
  ['tick', {}, 0.5, { peak: [0.02, 0.15] }], ['open', {}, 0.6, { peak: [0.02, 0.15] }], ['close', {}, 0.6, { peak: [0.02, 0.15] }],
];
if (want('shots')) {
  head('一击（默认力度 0.7，室外，总音量 0.8）', COLS);
  let k = 1;
  for (const [name, opts, seconds, exp] of SHOTS) {
    k++;
    if (!match(name)) continue;
    const shot = name.split(/[·（]/)[0];
    await seed(k * 7919);
    const st = await call('__render', shotSpec(shot, opts, seconds));
    // 数段数、量音高用贴近的干声（回声会把字与字之间填上）
    let dry = null;
    if (exp.bursts || exp.pitch || exp.beats) { await seed(k * 7919); dry = await call('__render', shotSpec(shot, { ...opts, ...exp.near, space: 'near' }, seconds)); }
    const notes = [];
    if (dry && exp.bursts) notes.push(`干声 ${dry.bursts.length} 段 [${dry.bursts.map(([a, b]) => `${a}–${b}`).join(' ')}]`);
    if (dry && exp.beats) notes.push(`一个孩子的干声 ${dry.beats.length} 下 [${dry.beats.join(' ')}]`);
    if (dry && dry.pitches.some((p) => p > 0) && dry.bursts.length <= 12) notes.push(`音高 ${dry.pitches.join(' ')}`);
    row(name, st, notes.join('  '));
    const bad = [];
    if (st.nan) bad.push('有 NaN');
    if (st.peak < exp.peak[0] || st.peak > exp.peak[1]) bad.push(`峰值 ${st.peak} 不在 ${exp.peak[0]}–${exp.peak[1]}`);
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
  // 鸡鸣：第三段最高、末一段从高处落下来
  if (match('rooster')) {
    await seed(99);
    const sr = 48000, spec = shotSpec('rooster', { space: 'near', pitch: 0, dist: 0 }, 3.2);
    const st = await call('__render', spec);
    R.ok('鸡鸣四段里末一段最长', st.bursts.length === 4 && st.bursts[3][1] - st.bursts[3][0] > st.bursts[0][1] - st.bursts[0][0], `四段长 ${st.bursts.map(([a, b]) => (b - a).toFixed(2)).join(' ')} 秒 (${sr}Hz)`);
  }
}

// ———————————————————————————— 三、脚步 ————————————————————————————
if (want('steps')) {
  head('脚步（力度 0.4：走路时的样子）', COLS);
  for (const g of ['earth', 'grass', 'stone', 'plank', 'floor', 'water']) {
    for (const wet of g === 'water' || g === 'plank' || g === 'floor' ? [0] : [0, 1]) {
      const name = `foot·${g}${wet ? '·湿' : ''}`;
      if (!match(name)) continue;
      await seed(31 + g.length);
      const spec = shotSpec('foot', { ground: g, wet, vel: 0.4 }, 0.8), st = await call('__render', spec);
      await seed(31 + g.length);
      const dry = await call('__render', shotSpec('foot', { ground: g, wet, vel: 0.4, space: 'near' }, 0.8));
      // 表里的「这一声本身」取干声的（带着回声量不出一步有多长）
      row(name, { ...st, tail30: dry.tail30 }, `这一步本身 ${dry.tail30} 秒`);
      const bad = [];
      if (st.nan) bad.push('有 NaN');
      if (st.peak < 0.01 || st.peak > 0.15) bad.push(`峰值 ${st.peak} 不在 0.01–0.15`);
      if (st.hf > 0.25) bad.push(`6kHz 以上占 ${st.hf}：脚步不该「嗒」`);
      if (dry.tail30 > 0.4) bad.push(`这一步本身 ${dry.tail30} 秒，太长（每秒一步半）`);
      if (st.lf > 0.5) bad.push(`一半以上的力气在 100Hz 以下（${st.lf}），小喇叭上听不见`);
      if (st.centroid > 2600) bad.push(`重心 ${st.centroid}Hz，太亮`);
      R.ok(name, !bad.length, bad.join('；'));
      await png('foot-' + g + (wet ? '-wet' : ''), name, spec);
    }
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
  ['birds', 30, [0.002, 0.02]], ['swallows', 30, [0.0005, 0.01]], ['cicadas', 30, [0.004, 0.02]], ['frogs', 30, [0.002, 0.02]], ['crickets', 30, [0.002, 0.012]], ['geese', 16, [0.0004, 0.01]],
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
    frogs: { hour: 22, season: 'summer' }, crickets: { hour: 22, season: 'autumn' }, geese: { hour: 17.5, season: 'autumn' }, rain: { rain: 1, wind: 0.2 }, drips: { place: 'yard' }, snow: { snow: 1, season: 'winter' },
    night: { hour: 23 }, village: { hour: 6.2, place: 'village' }, school: { hour: 9.5, place: 'village' }, work: { hour: 9.5, place: 'village' },
  };
  return { place: 'grove', hour: 9, season: 'spring', rain: 0, snow: 0, mist: 0, storm: 0, wind: 0.09, indoor: 0, near, ...base[name] };
}

// ———————————————————————————— 五、一直响着的 ————————————————————————————
if (want('loops')) {
  head('一直响着的（setLoop）', COLS);
  for (const [name, seconds, range] of [['kettle', 10, [0.004, 0.05]], ['inkstone', 6, [0.004, 0.04]], ['saw', 6, [0.006, 0.06]], ['plough', 8, [0.01, 0.08]]]) {
    if (!match(name)) continue;
    await seed(name.length * 17);
    const spec = { seconds, auto: false, loops: { [name]: 1 }, scene: { indoor: name === 'kettle' || name === 'inkstone' ? 1 : 0 } }, st = await call('__render', spec);
    row(name, st, `直流 ${st.dc}`);
    const bad = [];
    if (st.nan) bad.push('有 NaN');
    if (st.rms < range[0] || st.rms > range[1]) bad.push(`均方根 ${st.rms} 不在 ${range[0]}–${range[1]}`);
    if (st.peak > 0.5) bad.push(`峰值 ${st.peak}`);
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
    // 这是个安静的地方：底要低（雨天、雷雨可以高一些）
    const top = scene.rain > 0.5 ? 0.06 : 0.035, low = scene.indoor > 0.5 && scene.hour > 20 ? 0.0015 : 0.003;   // 夜里在屋里本来就近乎无声
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
    // loop 开了又关
    au.setLoop('kettle', 1); au.setLoop('saw', 1, { at: [30, 0] });
    await wait(500);
    res.loopsOn = e.activeLayers().filter((l) => l === 'kettle' || l === 'saw').length;
    au.setLoop('kettle', 0); au.setLoop('saw', 0);
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
  R.ok('loop 开得起来', r.loopsOn === 2);
  R.ok('场景关掉后各层都拆了', r.afterOff === '', `剩 ${r.afterOff || '无'}`);
  R.ok('再打开各层回来', r.backOn > 2, `${r.backOn} 层`);
  R.ok(`把 ${r.shots} 种一击轮着点了一遍，没有报错`, logs.length === 0, logs.slice(0, 6).join('\n'));
}

if (logs.length) console.log('\n页面上的报错：\n' + logs.slice(0, 20).join('\n'));
if (MD) { const file = join(dir('audio'), 'measure.md'); writeFileSync(file, MD.join('\n') + '\n'); console.log('\n表已写到 ' + file); }
const bad = R.done();
await browser.close();
process.exit(bad || logs.some((l) => l.startsWith('[pageerror]')) ? 1 : 0);
