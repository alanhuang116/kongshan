// 测试用的公共部分：开浏览器、开一页、等画好、截图、收集报错。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const BASE = process.env.KS_URL ?? 'http://localhost:3801/';
export const OUT = join(import.meta.dirname, '..', '..', 'shots');

export async function launch() {
  return chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
}
/** 开一页并等它画好。q 是网址参数（对象）；返回 page 与收集到的报错 */
export async function open(browser, q = {}, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.w ?? 1440, height: o.h ?? 810 }, deviceScaleFactor: o.dpr ?? 1, isMobile: !!o.mobile, hasTouch: !!o.mobile });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|ReadPixels/.test(m.text()))) logs.push(`[${m.type()}] ${m.text().slice(0, 500)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 900)}`));
  const params = new URLSearchParams({ auto: '1', t: 'day', w: 'clear', season: 'autumn', q: 'mid', ...q });
  await page.goto(BASE + '?' + params.toString(), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(o.wait ?? 600);
  return { page, ctx, logs };
}
export function dir(name) { const d = join(OUT, name); mkdirSync(d, { recursive: true }); return d; }
export const shot = (page, d, name) => page.screenshot({ path: join(d, name + '.png') });
/** 结果表：一行一项，最后给总数 */
export class Report {
  rows = [];
  ok(name, pass, note = '') { this.rows.push({ name, pass: !!pass, note }); console.log(`${pass ? '  ✓' : '  ✗'} ${name}${note ? '　' + note : ''}`); }
  done() { const bad = this.rows.filter((r) => !r.pass); console.log(`\n${this.rows.length - bad.length}/${this.rows.length} 通过${bad.length ? '；未过：' + bad.map((b) => b.name).join('、') : ''}`); return bad.length; }
}
