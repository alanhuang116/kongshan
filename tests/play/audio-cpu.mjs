// 声音实时响着的时候吃多少处理器：真的 AudioContext，一个场景一个场景地放，量渲染进程这段时间用了多少处理器时间。
//
//   node tests/play/audio-cpu.mjs [每个场景量几秒，默认 12]
//
// 量的是整个渲染进程（声音线程 + 页面主线程；页面是试听台，本身几乎不干活），先量一段「什么都不响」作底，各场景减去它。
// 结果是「占一个核的百分之几」。机器上同时在跑别的重活时数值会偏高，看个大概。
import { launch } from './lib.mjs';

const URL = process.env.KS_AUDIO_URL ?? 'http://localhost:3816/audio-lab.html';
const SECONDS = Number(process.argv[2] ?? 12);
const browser = await launch();
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.log('[页面报错]', String(e.stack ?? e.message).slice(0, 600)));
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const cdp = await browser.newBrowserCDPSession();
/** 各渲染进程累计用掉的处理器时间（秒）之和 */
const cpu = async () => { const { processInfo } = await cdp.send('SystemInfo.getProcessInfo'); return processInfo.filter((p) => p.type === 'renderer').reduce((a, p) => a + p.cpuTime, 0); };
const wait = (ms) => new Promise((f) => setTimeout(f, ms));
const measure = async () => { const a = await cpu(), t0 = Date.now(); await wait(SECONDS * 1000); return ((await cpu()) - a) / ((Date.now() - t0) / 1000); };

await page.evaluate(async () => { await window.__audio.unlock(); window.__audio.setAuto(false); });
await wait(3000);
const idle = await measure();
console.log(`什么都不响（只有总线）　　　${(idle * 100).toFixed(1)}%`);
const presets = await page.evaluate(() => window.__presets.map((p) => p[0]));
await page.evaluate(() => window.__audio.setAuto(true));
const rows = [];
for (let i = 0; i < presets.length; i++) {
  const info = await page.evaluate(async (k) => {
    const [, scene, wet] = window.__presets[k], au = window.__audio;
    au.engine.setWet(wet ?? null);
    au.setScene(scene);
    return 0;
  }, i);
  void info;
  // 等上一个场景的层退完、拆掉
  await wait(17000);
  const load = await measure();
  const state = await page.evaluate(() => ({ layers: window.__audio.engine.activeLayers(), voices: window.__audio.engine.voices }));
  rows.push([presets[i], load, state]);
  console.log(`${presets[i].padEnd(14, '　')}${(load * 100).toFixed(1).padStart(5)}%（净 ${((load - idle) * 100).toFixed(1)}%）　${state.layers.length} 层：${state.layers.join(' ')}`);
}
// 走着、做着事：每秒 1.7 步，隔两秒弹一个琴音，煮着水
await page.evaluate(() => {
  const au = window.__audio;
  au.setScene(window.__presets[0][1]);
  au.setLoop('kettle', 1);
  window.__busy = [setInterval(() => au.step('earth'), 590), setInterval(() => au.qin(), 2000), setInterval(() => au.play('rooster', { at: [60, 0] }), 9000)];
});
await wait(17000);
const busy = await measure();
console.log(`春晨桃林 + 走路 + 抚琴 + 煮水 + 鸡鸣　${(busy * 100).toFixed(1)}%（净 ${((busy - idle) * 100).toFixed(1)}%）`);
await browser.close();
