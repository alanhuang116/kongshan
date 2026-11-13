// 带界面的检查用的小工具：开浏览器、开一页、等画好、截图、看有没有出界的元素、收集报错。（flow.mjs 用）
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const BASE = process.env.KS_URL ?? 'http://localhost:3801/';
export const OUT = join(import.meta.dirname, '..', '..', 'shots', 'flow');
mkdirSync(OUT, { recursive: true });
export const SIZES = {
  desk: { w: 1440, h: 810 },
  big: { w: 1920, h: 1080 },
  phone: { w: 390, h: 844, mobile: true, dpr: 2 },
  land: { w: 844, h: 390, mobile: true, dpr: 2 },
};

export async function launch() {
  return chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
}
/** 开一页。path 是 BASE 之后的部分（如 '?auto=1&s=yard' 或 'world.html?s=yard'）；size 是 SIZES 里的名字或 {w,h,mobile,dpr} */
export async function open(browser, path, size = 'desk', o = {}) {
  const s = typeof size === 'string' ? SIZES[size] : size;
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr ?? 1, isMobile: !!s.mobile, hasTouch: !!s.mobile, reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference' });
  if (o.storage) await ctx.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, o.storage);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|ReadPixels/.test(m.text()))) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 900)}`));
  await page.goto(BASE + path, { waitUntil: 'load' });
  // 等画好；世界没能建起来（别人的模块正改到一半）就不干等，直接报出来
  if (o.ready !== false) {
    await page.waitForFunction(() => window.__ready === true || !!document.querySelector('.fatal'), null, { timeout: 120000 }).catch(() => logs.push('等 __ready 超时'));
    const fatal = await page.evaluate(() => document.querySelector('.fatal')?.textContent ?? null);
    if (fatal) { logs.push(`世界没能建起来：${fatal.slice(0, 200)}`); page.__fatal = fatal; }
  }
  await page.waitForTimeout(o.wait ?? 800);
  // 别人的模块正改到一半时，开发服务器会在页面上盖一层报错：拿掉它再截图
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  return { page, ctx, logs };
}
export function dir(name) { const d = join(OUT, name); mkdirSync(d, { recursive: true }); return d; }
export async function shot(page, name, sub = '', clip = null) {
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  const d = sub ? dir(sub) : OUT;
  await page.screenshot({ path: join(d, name + '.png'), ...(clip ? { clip } : {}) });
  return join(d, name + '.png');
}
/** 把一块地方放大了截下来细看：[x, y, w, h]（CSS 像素），放大 k 倍 */
export async function zoom(page, name, [x, y, w, h], k = 3) {
  const ctx = page.context(), browser = ctx.browser();
  // 用同一页的画面：先截原图那一块，再用另一页放大
  const buf = await page.screenshot({ clip: { x, y, width: w, height: h } });
  const c2 = await browser.newContext({ viewport: { width: Math.round(w * k), height: Math.round(h * k) } });
  const p2 = await c2.newPage();
  await p2.setContent(`<body style="margin:0;background:#888"><img src="data:image/png;base64,${buf.toString('base64')}" style="width:${Math.round(w * k)}px;height:${Math.round(h * k)}px;image-rendering:auto;display:block"></body>`);
  await p2.screenshot({ path: join(OUT, name + '.png') });
  await c2.close();
}
/** 有没有超出屏幕的界面元素（看不见的不算） */
export async function overflow(page, label, sel = '.hud *, .act *, .sheet *, .title *, .menu *') {
  const bad = await page.evaluate((sel) => {
    const W = innerWidth, H = innerHeight, out = [];
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.opacity === '0' || cs.visibility === 'hidden' || el.closest('.markers')) continue;
      // 在可以滚动的盒子里的不算（滚得到）
      let p = el.parentElement, scroll = false;
      while (p) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) { scroll = true; break; } p = p.parentElement; }
      if (scroll) continue;
      if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) out.push(`${(el.className?.baseVal ?? el.className) || el.tagName} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
    return out.slice(0, 8);
  }, sel);
  if (bad.length) console.log(`  ! ${label} 有出界的元素：${bad.join(' | ')}`);
  return bad;
}
export function report(name, logs) { const u = [...new Set(logs)]; console.log(`— ${name}${u.length ? '\n' + u.slice(0, 10).join('\n') : ''}`); }
