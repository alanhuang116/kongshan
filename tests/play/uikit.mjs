// 带界面的检查用的小工具：开浏览器、开一页、等画好、截图、看有没有出界的元素、收集报错（flow.mjs、ui.mjs 用）；
// 往做着的事里塞一份假的 state 看小器物（fakeAct）；一屏界面的通盘检查（fit：出界、截断、压在安全区里、键太小、字与底的对比）。
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
  // 界面逐尺寸检查的六种：电脑、笔记本、平板竖着、iPhone 在 Safari 里真正看得见的高度、SE、手机横着
  pc: { w: 1440, h: 900 },
  laptop: { w: 1280, h: 720 },
  pad: { w: 820, h: 1180, mobile: true, dpr: 2 },
  iphone: { w: 393, h: 714, mobile: true, dpr: 2 },
  se: { w: 375, h: 548, mobile: true, dpr: 2 },
  landscape: { w: 714, h: 393, mobile: true, dpr: 2 },
  // 六种之外再看的：最窄的安卓（360 宽，竖着、横着）、平板横着
  android: { w: 360, h: 640, mobile: true, dpr: 3 },
  androidLand: { w: 640, h: 360, mobile: true, dpr: 3 },
  padLand: { w: 1180, h: 820, mobile: true, dpr: 2 },
  // 装到主屏幕、全屏打开时：有刘海与底下那条横杠的安全区（上、右、下、左），拿这几个数盖过 --sat 那几个量
  iphoneApp: { w: 393, h: 852, mobile: true, dpr: 2, safe: [59, 0, 34, 0] },
  landApp: { w: 852, h: 393, mobile: true, dpr: 2, safe: [0, 59, 21, 59] },
};
export const SIX = ['pc', 'laptop', 'pad', 'iphone', 'se', 'landscape'];

export async function launch() {
  return chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
}
/** 开一页。path 是 BASE 之后的部分（如 '?auto=1&s=yard' 或 'world.html?s=yard'）；size 是 SIZES 里的名字或 {w,h,mobile,dpr} */
export async function open(browser, path, size = 'desk', o = {}) {
  const s = typeof size === 'string' ? SIZES[size] : size;
  // o.tz：这一页当自己在哪个时区（如 'Europe/Paris'；同游时天时随园中，测它要两页在不同的时区）
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr ?? 1, isMobile: !!s.mobile, hasTouch: !!s.mobile, reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference', ...(o.tz ? { timezoneId: o.tz } : {}) });
  if (o.storage) await ctx.addInitScript((st) => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, o.storage);
  // 安全区：模拟装到主屏幕后的刘海与横杠（界面上的位置都从 --sat 那几个量算）
  if (s.safe) await ctx.addInitScript((sf) => {
    const set = () => { const r = document.documentElement.style; ['--sat', '--sar', '--sab', '--sal'].forEach((k, i) => r.setProperty(k, `${sf[i]}px`)); };
    if (document.documentElement) set(); document.addEventListener('DOMContentLoaded', set);
  }, s.safe);
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

/**
 * 往一件事里塞一份假的 state（看做事时的小器物用）：先进那件事（默认书案），再把 state 换掉。
 * 界面发回去的指令（hold 的 down/up、点签、点小签、挑东西）不交给那件事，记在 window.__cmds 里，读 cmds(page)。
 */
export async function fakeAct(page, state, act = 'book') {
  await page.evaluate(([state, act]) => {
    const k = window.__ks;
    if (!k.act || k.act.id !== act) { if (k.act) k.exitAct(); k.enterAct(act, true); }
    window.__cmds = window.__cmds ?? [];
    if (!k.__cmdOrig) { k.__cmdOrig = k.cmd; k.cmd = (n, a) => { window.__cmds.push([n, a ?? null]); }; }
    // 小签可以用 rel: [dx, dy, dz] 给（相对这件事的标记点），免得算世界坐标
    const a = k.act.anchor;
    const st = { ...state, tags: Array.isArray(state.tags) ? state.tags.map((t) => (t.rel ? { ...t, x: a.x + t.rel[0], y: a.y + t.rel[1], z: a.z + t.rel[2] } : t)) : state.tags };
    k.act.state = st; k.emitAct();
  }, [state, act]);
}
/** 把指令交还给那件事（fakeAct 之后） */
export async function realAct(page) { await page.evaluate(() => { const k = window.__ks; if (k.__cmdOrig) { k.cmd = k.__cmdOrig; delete k.__cmdOrig; } }); }
export const cmds = (page) => page.evaluate(() => (window.__cmds ?? []).splice(0));

/**
 * 一屏界面的通盘检查。返回一张问题表（每条一句话），也打印出来：
 *   出界：界面元素跑到屏幕外头（在可以滚的盒子里的不算）；
 *   截断：字被裁掉（盒子比字窄、又不让溢出，或用了省略号）；
 *   安全区：字、键落在 --sat/--sab… 量出来的那一圈里（刘海、底下的横杠会挡住）；
 *   键太小：能点的东西小于 minTap（触屏 44，电脑 32；::after 撑大的那一圈也算进去）；
 *   相叠：两枚键互相压着；
 *   对比：字与底的亮度比（截图里取这块地方亮度的 2%、98% 分位来比）——读字的地方要 ≥ 3。
 * o.scope：只看哪些元素（默认整个界面）；o.contrast=false 不量对比。
 */
export async function fit(page, label, o = {}) {
  const size = page.viewportSize();
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const minTap = o.minTap ?? (touch ? 44 : 32);
  const scope = o.scope ?? '.hud, .act, .sheet, .notes, .title, .intro';
  const found = await page.evaluate(([scope, minTap]) => {
    const W = innerWidth, H = innerHeight, out = [];
    const cs0 = getComputedStyle(document.documentElement);
    const px = (v) => parseFloat(v) || 0;
    // 安全区：从 --sat 那几个量读（open 的时候按尺寸盖过）
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;padding:var(--sat) var(--sar) var(--sab) var(--sal);visibility:hidden';
    document.body.appendChild(probe);
    const ps = getComputedStyle(probe), safe = { t: px(ps.paddingTop), r: px(ps.paddingRight), b: px(ps.paddingBottom), l: px(ps.paddingLeft) };
    probe.remove();
    void cs0;
    const roots = [...document.querySelectorAll(scope)];
    const shown = (el) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const c = getComputedStyle(e);
        if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) < 0.05) return false;
      }
      return true;
    };
    const inScroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p; } return null; };
    const name = (el) => { const c = el.className?.baseVal ?? el.className; return `${el.tagName.toLowerCase()}${c ? '.' + String(c).trim().split(/\s+/).join('.') : ''}${el.dataset?.testid ? `[${el.dataset.testid}]` : ''}`; };
    const textOf = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('').slice(0, 16);
    const all = roots.flatMap((r) => [r, ...r.querySelectorAll('*')]);
    const taps = [];
    for (const el of all) {
      if (el.closest('.markers, .tags, svg, .copy-cell, .ks-defs')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || !shown(el)) continue;
      const own = textOf(el), scroller = inScroller(el);
      // 出界
      if (!scroller && (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1)) out.push(`出界 ${name(el)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
      // 截断：自己带字、盒子比字窄、又不让字溢出（data-clamp 是故意收成两行的：先生方才说的那句、观星时可以展开的话）
      const c = getComputedStyle(el);
      if (own && !el.closest('[data-clamp]') && (c.textOverflow === 'ellipsis' || ((c.overflowX === 'hidden' || c.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1) || ((c.overflowY === 'hidden' || c.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 2))) out.push(`截断 ${name(el)}「${own}」`);
      // 安全区：带字的、能点的落在那一圈里（在滚动盒子里的、在滚到的位置上不算）
      const hasText = !!own || el.matches('button, input, [role="button"], summary');
      if (hasText && !scroller && ((safe.b && r.bottom > H - safe.b + 0.5) || (safe.t && r.top < safe.t - 0.5) || (safe.l && r.left < safe.l - 0.5) || (safe.r && r.right > W - safe.r + 0.5))) out.push(`安全区 ${name(el)}「${own}」[${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
      // 能点的
      if (el.matches('button:not(:disabled), input, [role="button"], summary, a[href]') && c.pointerEvents !== 'none') {
        const a = getComputedStyle(el, '::after');
        let t = 0, b = 0, l = 0, rr = 0;
        if (a.content !== 'none' && a.position === 'absolute') { t = Math.max(0, -px(a.top)); b = Math.max(0, -px(a.bottom)); l = Math.max(0, -px(a.left)); rr = Math.max(0, -px(a.right)); }
        const w = r.width + l + rr, h = r.height + t + b;
        // 在滚动盒子里的：只算露在盒子里的那一截（滚出去、被盒子裁掉的不算）
        let vr = r;
        if (scroller) {
          const sr = scroller.getBoundingClientRect();
          const top = Math.max(r.top, sr.top), bottom = Math.min(r.bottom, sr.bottom);
          if (bottom - top < 4) continue;
          vr = { left: r.left, right: r.right, top, bottom };
        }
        // 竹简（手机上十枚排成一行）：窄而高（约 35×100），竖着点不会点错，宽不到 44 也算够
        const slip = el.matches('.slip') && h >= minTap * 2 && w >= 34;
        if (!slip && Math.min(w, h) < minTap - 0.5) out.push(`键太小 ${name(el)}「${own || el.getAttribute('aria-label') || ''}」${Math.round(w)}×${Math.round(h)}`);
        taps.push({ el, r: vr, n: name(el) });
      }
    }
    // 字压着键：画面上浮着的字（走法提示、画面下方的那句话）压在一枚键上——量字自己的框（不量带晕的整个盒子）
    for (const el of document.querySelectorAll('.walk-hint:not(.is-gone), .notes .note')) {
      if (!shown(el)) continue;
      const rg = document.createRange(), rects = [];
      for (const n of el.querySelectorAll('*')) for (const t of n.childNodes) if (t.nodeType === 3 && t.textContent.trim()) { rg.selectNodeContents(t); rects.push(...rg.getClientRects()); }
      for (const t of el.childNodes) if (t.nodeType === 3 && t.textContent.trim()) { rg.selectNodeContents(t); rects.push(...rg.getClientRects()); }
      for (const tp of taps) for (const r of rects) {
        const ix = Math.min(r.right, tp.r.right) - Math.max(r.left, tp.r.left), iy = Math.min(r.bottom, tp.r.bottom) - Math.max(r.top, tp.r.top);
        if (ix > 3 && iy > 3) { out.push(`字压着键 ${name(el)} × ${tp.n}`); break; }
      }
    }
    // 相叠：两枚键压着（一枚在另一枚里头的不算）
    for (let i = 0; i < taps.length; i++) for (let j = i + 1; j < taps.length; j++) {
      const a = taps[i], b = taps[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix > 3 && iy > 3) out.push(`相叠 ${a.n} × ${b.n}`);
    }
    return { out, safe };
  }, [scope, minTap]);
  const issues = [...new Set(found.out)];
  if (o.contrast !== false) issues.push(...(await contrast(page, scope, o.minContrast ?? 3)));
  if (issues.length) console.log(`  ! ${label}（${size.width}×${size.height}）\n    ${issues.slice(0, 24).join('\n    ')}${issues.length > 24 ? `\n    ……还有 ${issues.length - 24} 条` : ''}`);
  else console.log(`  ✓ ${label}（${size.width}×${size.height}）`);
  return issues;
}

/**
 * 字与底的对比：截一张图，在页面里把它画到一张画布上，量每一块带字的地方的亮度——取 2% 与 98% 分位，
 * 算 (亮 + 0.05) / (暗 + 0.05)。字的笔画落在一头、底落在另一头，所以这就是字与底的对比（不管底是磨砂还是画）。
 */
export async function contrast(page, scope, min = 3) {
  // 截图前先把正在走的动画（话浮起、淡去，纸滑进来）停在这一刻，量完再放开：截图与下面量的那一步差着几百毫秒，
  // 不停的话，截到的是半透明的字，量的时候它已经全显了，「正在浮起的不量」就落了空
  await page.evaluate(() => { window.__ksHeld = document.getAnimations().filter((a) => a.playState === 'running'); for (const a of window.__ksHeld) a.pause(); });
  try {
    const png = (await page.screenshot()).toString('base64');
    return await measure(page, png, scope, min);
  } finally {
    await page.evaluate(() => { for (const a of window.__ksHeld ?? []) { try { a.play(); } catch { /* 已经拿掉了 */ } } window.__ksHeld = null; }).catch(() => {});
  }
}
function measure(page, png, scope, min) {
  return page.evaluate(async ([png, scope, min]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const k = img.naturalWidth / innerWidth;
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const out = [];
    // 只量完全显出来的（正在浮起、正在淡去的不量：那一刻的淡是动画，不是样子）
    const shown = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.95) return false; } return true; };
    for (const root of document.querySelectorAll(scope)) for (const el of [root, ...root.querySelectorAll('*')]) {
      // 跟着画面每帧挪的签不量（截图与量位置差着一两帧，量到的是签旁边的画）
      if (el.closest('svg, canvas, .ks-defs, .tags, .markers')) continue;
      const texts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      const own = texts.map((n) => n.textContent.trim()).join('');
      if (!own || !shown(el)) continue;
      // 只量字所在的那几行（取字自己的框，不取整个盒子：短短两个字落在一大块板上时，盒子里几乎全是底）
      // 在滚动盒子里、滚到看不见或落在上下两沿淡出去的那一条里的行不量（那是故意淡的：告诉人那边还有）
      let sc = null;
      for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowY; if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) { sc = p.getBoundingClientRect(); break; } }
      const L = [];
      for (const t of texts) {
        const rg = document.createRange(); rg.selectNodeContents(t);
        for (const r of rg.getClientRects()) {
          if (r.width < 3 || r.height < 3 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
          if (sc && (Math.min(r.bottom, sc.bottom - 24) - Math.max(r.top, sc.top + 14)) < r.height * 0.7) continue;
          const x = Math.max(0, Math.floor(r.left * k)), y = Math.max(0, Math.floor(r.top * k)), w = Math.min(c.width - x, Math.ceil(r.width * k)), h = Math.min(c.height - y, Math.ceil(r.height * k));
          if (w < 2 || h < 2) continue;
          const d = g.getImageData(x, y, w, h).data;
          for (let i = 0; i < d.length; i += 4) L.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
        }
      }
      if (L.length < 20) continue;
      L.sort((a, b) => a - b);
      const lo = L[Math.floor(L.length * 0.02)], hi = L[Math.floor(L.length * 0.98)], ratio = (hi + 0.05) / (lo + 0.05);
      if (ratio < min) out.push(`对比 ${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]}「${own.slice(0, 12)}」${ratio.toFixed(2)}`);
    }
    return out;
  }, [png, scope, min]);
}
