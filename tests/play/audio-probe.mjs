// 声音的小探针：在试听台那一页里跑一段代码，把结果打出来。调某一种声音时用，比跑整套检查快。
//
//   node tests/play/audio-probe.mjs <脚本.js> [--png 名字]
//
// 脚本是一个异步函数的函数体，在页面里执行，可以用 window.__render(spec)、__renderShot(名, 选项)、__renderBed(层, 秒, 场景)、
// __mix(场景)、__seed(n)、__spectrogram(标题, spec)；return 的东西会按 JSON 打出来。例：
//
//   const a = await __renderShot('flute', { far: 0.6 });
//   return { peak: a.peak, rms: a.rms, env: a.env };
//
// 加 --png 名字：把最后一次渲染的频谱图存成 shots/audio/名字.png。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dir, launch } from './lib.mjs';

const URL = process.env.KS_AUDIO_URL ?? 'http://localhost:3816/audio-lab.html';
const file = process.argv[2], pi = process.argv.indexOf('--png');
if (!file) { console.log('用法：node tests/play/audio-probe.mjs <脚本.js> [--png 名字]'); process.exit(1); }
const browser = await launch();
const page = await (await browser.newContext()).newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) console.log('[页面报错]', m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[页面报错]', String(e.stack ?? e.message).slice(0, 900)));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const body = readFileSync(file, 'utf8');
const out = await page.evaluate(`(async () => { const { __render, __renderShot, __renderBed, __mix, __seed, __spectrogram } = window; ${body}\n})()`);
console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
if (pi > 0) {
  const name = process.argv[pi + 1] ?? 'probe';
  await page.evaluate((t) => window.__spectrogram(t), name);
  const data = await page.evaluate(() => window.__png());
  writeFileSync(join(dir('audio'), name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
  console.log('频谱图：shots/audio/' + name + '.png');
}
await browser.close();
