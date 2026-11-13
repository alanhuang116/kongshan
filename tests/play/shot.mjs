// 用法：node shot.mjs <输出目录> [--w=1600 --h=900 --wait=1200 --dpr=1 --mobile] 名字=网址 名字=网址 ...
// 每个网址等 window.__ready 再截图；打印页面里 #hud 的字、控制台的错误与警告。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const outDir = args.shift();
const opt = { w: 1600, h: 900, wait: 1200, dpr: 1, mobile: false, gpu: true };
const jobs = [];
for (const a of args) {
  if (a.startsWith('--')) { const s = a.slice(2), i = s.indexOf('='), k = i < 0 ? s : s.slice(0, i), v = i < 0 ? undefined : s.slice(i + 1); opt[k] = v === undefined ? true : isNaN(Number(v)) ? v : Number(v); }
  else { const i = a.indexOf('='); jobs.push([a.slice(0, i), a.slice(i + 1)]); }
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
});
const ctx = await browser.newContext({ viewport: { width: opt.w, height: opt.h }, deviceScaleFactor: opt.dpr, isMobile: !!opt.mobile, hasTouch: !!opt.mobile });
for (const [name, url] of jobs) {
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 2000)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 900)}`));
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 }).catch(() => logs.push('等 __ready 超时'));
  await page.waitForTimeout(opt.wait);
  if (opt.eval) await page.evaluate(String(opt.eval)).catch((e) => logs.push('eval: ' + e.message));
  await page.screenshot({ path: join(outDir, name + '.png') });
  const hud = await page.evaluate(() => {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    void ext;
    const k = window.__ks, st = k ? `三角 ${k.world.stats.tris} 绘制 ${k.world.stats.calls} 帧 ${k.world.frameMs.toFixed(1)}ms 档 ${k.q.tier} dpr ${k.world.renderer.getPixelRatio().toFixed(2)}` : '';
    return (document.getElementById('hud')?.textContent ?? '') + st;
  });
  console.log(`— ${name} (${Date.now() - t0}ms)\n${hud}`);
  for (const l of [...new Set(logs)].slice(0, 12)) console.log(l);
  await page.close();
}
await browser.close();
