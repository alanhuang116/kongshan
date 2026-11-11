// 正式构建：来过一次之后断网重开。用法：node offline.mjs <网址>
import { chromium } from 'playwright-core';
const url = process.argv[2] ?? 'http://localhost:3899/kongshan/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const log = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => log.push('PAGEERROR ' + String(e.message).slice(0, 300)));
page.on('requestfailed', (r) => log.push('FAILED ' + r.url().replace(new URL(url).origin, '') + ' ' + (r.failure()?.errorText ?? '')));
page.on('response', (r) => { if (r.status() >= 400) log.push(`HTTP ${r.status()} ${r.url().replace(new URL(url).origin, '')}`); });
await page.goto(url);
await page.waitForSelector('[data-testid=enter]', { timeout: 120000 });
console.log('首次打开的报错：', log.length ? '\n' + log.join('\n') : '无');
await page.waitForTimeout(18000);
const keys = await page.evaluate(async () => { const out = []; for (const n of await caches.keys()) { const c = await caches.open(n); for (const r of await c.keys()) out.push(r.url.replace(location.origin, '')); } return out; });
console.log('缓存了', keys.length, '个：', keys.filter((k) => !k.includes('woff')).join(' '), '… 字体', keys.filter((k) => k.includes('woff')).length);
log.length = 0;
await ctx.setOffline(true);
try { await page.reload({ timeout: 30000 }); } catch (e) { log.push('reload: ' + e.message.slice(0, 100)); }
let ok = false;
try { await page.waitForSelector('[data-testid=enter]', { timeout: 60000 }); ok = true; } catch { /* */ }
console.log('断网重开', ok ? '成功' : '失败');
if (ok) { await page.click('[data-testid=enter]'); await page.waitForTimeout(5000); console.log('断网进山后小人在：', await page.evaluate(() => window.__ks.nav.cur), '；小人是', await page.evaluate(() => window.__ks.player.av.constructor.name)); }
console.log(log.slice(0, 20).join('\n'));
await browser.close();
