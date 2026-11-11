// 从头走一遍真实的流程：开场 → 入山 → 用键盘沿石阶走上山门 → 走近香炉按 E 上香 → 毕 → 寺图换处。
// 用法：node tests/play/flow.mjs [网址] [--mobile]
import { launch, dir, shot, Report } from './lib.mjs';

const args = process.argv.slice(2), MOBILE = args.includes('--mobile');
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:3801/';
const browser = await launch();
const ctx = await browser.newContext(MOBILE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 810 } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|ReadPixels/.test(m.text()))) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 600)}`));
const R = new Report(), d = dir(MOBILE ? 'flow2-m' : 'flow2');
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const t0 = Date.now();
await page.goto(base + '?t=day&w=clear&season=autumn&q=mid', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
console.log(`打开到能点「入山」：${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
await wait(800);
await shot(page, d, '01-title');
const start = await ev(() => ({ place: window.__ks.nav.cur, z: window.__ks.player.pos.z, y: window.__ks.player.pos.y }));
R.ok('头一回来：人在山脚', start.place === 'foot', `处 ${start.place}，z=${start.z.toFixed(1)}，y=${start.y.toFixed(1)}`);
await page.click('[data-testid="enter"]');
await wait(4600);
await shot(page, d, '02-entered');
R.ok('入山后是走动的界面，有走法提示', await ev(() => !!document.querySelector('.hud') && !!document.querySelector('.walk-hint')));
if (MOBILE) {
  // 摇杆往上推到头：小跑上山
  const b = await page.locator('[data-testid="stick"]').boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  await page.touchscreen.tap(cx, cy);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - b.height * 0.6, id: 1 }] });
  await wait(6000);
  await shot(page, d, '03-climbing');
  await wait(8500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
} else {
  await page.keyboard.down('w'); await wait(5000);
  await shot(page, d, '03-climbing');
  await page.keyboard.down('Shift'); await wait(9500);
  await page.keyboard.up('Shift'); await page.keyboard.up('w');
}
await wait(700);
const up = await ev(() => ({ place: window.__ks.nav.cur, z: window.__ks.player.pos.z, y: window.__ks.player.pos.y, hint: !!document.querySelector('.walk-hint:not(.is-gone)') }));
R.ok(MOBILE ? '推摇杆走上石阶' : '按 W（后来加 Shift）走上石阶', up.z < start.z - 20 && up.y > start.y + 6, `到 z=${up.z.toFixed(1)}，升高 ${(up.y - start.y).toFixed(1)} 米，处 ${up.place}`);
R.ok('走出几步后提示收起', !up.hint);
await shot(page, d, '04-up');
// 到香炉前：点地面走过去（中间要过山门、过桥）
await ev(() => { const k = window.__ks; k.player.goTo(0.4, 23.5); });
await page.waitForFunction(() => !window.__ks.player.walking, null, { timeout: 60000 }).catch(() => {});
await wait(600);
const at = await ev(() => ({ place: window.__ks.nav.cur, x: window.__ks.player.pos.x, z: window.__ks.player.pos.z, near: window.__ks.near?.id ?? null }));
R.ok('自己找路走到香炉前（过山门、过桥）', Math.hypot(at.x - 0.4, at.z - 23.5) < 0.4 && at.near === 'incense', `处 ${at.place}，走近的事 ${at.near}`);
await shot(page, d, '05-censer');
if (MOBILE) await page.tap('[data-testid="use"]'); else await page.keyboard.press('e');
await page.waitForFunction(() => window.__ks.act?.id === 'incense', null, { timeout: 15000 }).catch(() => {});
await wait(2500);
R.ok(MOBILE ? '点主按钮开始上香' : '按 E 开始上香', await ev(() => window.__ks.act?.id === 'incense'));
await shot(page, d, '06-incense');
await page.click('[data-testid="act-done"]');
await wait(1600);
R.ok('点「毕」回到走动', await ev(() => !window.__ks.act && !window.__ks.player.locked));
await page.click('[data-testid="key-map"]'); await wait(700);
await page.click('[data-testid="map-hall"]'); await wait(2400);
R.ok('寺图：点「大殿」就到', await ev(() => window.__ks.nav.cur === 'hall'));
await shot(page, d, '07-hall');
const saved = await ev(() => JSON.parse(localStorage.getItem('kongshan:v1') ?? '{}'));
R.ok('记下了来过、会走了', saved.visits === 1 && saved.walked === true, `visits=${saved.visits} walked=${saved.walked}`);
console.log('—— 页面报错 ——');
for (const l of [...new Set(logs)]) console.log(l);
const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
