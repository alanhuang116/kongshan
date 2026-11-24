// 触屏摇橹的「左」「右」两枚转向键：竖着、横着的手机上都出来；按住「左」船头往左转、按住「右」往右转，松开舵回正；
// 键不压着提示、「摇」与「靠岸」。
// 用法：node tests/play/steer.mjs [尺寸,尺寸…]（默认 iphone,se,landscape；网址默认 http://localhost:3801/，或 KS_URL=…；截图在 shots/steer/）
import { mkdirSync } from 'node:fs';
import { launch, open, report } from './uikit.mjs';
const sizes = (process.argv[2] ?? 'iphone,se,landscape').split(',');
const out = 'shots/steer';
mkdirSync(out, { recursive: true });
const b = await launch();
let fails = 0, n = 0;
const ok = (name, pass, note = '') => { n++; if (!pass) fails++; console.log(`${pass ? '  ✓' : '  ✗'} ${name}${note ? '　' + note : ''}`); };
const head = () => { const e = window.__ks.player.av.root.matrixWorld.elements; return Math.atan2(e[8], e[10]); };
const deg = (a, b) => { let x = a - b; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return (x * 180) / Math.PI; };
for (const size of sizes) {
  console.log(`\n==== ${size} ====`);
  const { page, ctx, logs } = await open(b, '?auto=1&s=ferry&t=day&flow=0&season=summer&w=clear', size, { wait: 2500, storage: { 'anlewo:v1': { v: 1, walked: true, runTold: true, visits: 2, guided: true } } });
  await page.evaluate(() => window.__ks.enterAct('boat', true));
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); if (await page.evaluate(() => !!document.querySelector('[data-testid="act-steer-L"]'))) break; }
  ok('上了船：「左」「右」两枚出来', await page.evaluate(() => !!document.querySelector('[data-testid="act-steer-L"]') && !!document.querySelector('[data-testid="act-steer-R"]')));
  // 不压着提示、「摇」、「靠岸」
  const hit = await page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const keys = ['[data-testid="act-steer-L"]', '[data-testid="act-steer-R"]'].map(r).filter(Boolean);
    const others = ['[data-testid="act-foot"]', '[data-testid="act-hold-base"]', '[data-testid="act-done"]'].map(r).filter(Boolean);
    const over = (a, c) => a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1;
    return keys.some((k) => others.some((o) => over(k, o)) || k.left < 0 || k.right > innerWidth || k.bottom > innerHeight);
  });
  ok('两枚不压着提示、「摇」、「靠岸」，也不出界', !hit);
  const cdp = await ctx.newCDPSession(page);
  for (const s of ['L', 'R']) {
    const B = await page.locator(`[data-testid="act-steer-${s}"]`).boundingBox();
    const h0 = await page.evaluate(head);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: B.x + B.width / 2, y: B.y + B.height / 2, id: 1 }] });
    await page.waitForTimeout(2600);
    const rud = await page.evaluate(() => window.__ks.act?.state?.rud);
    if (s === 'L') await page.screenshot({ path: `${out}/${size}-left.png` });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1200);
    const turn = deg(await page.evaluate(head), h0), rud1 = await page.evaluate(() => window.__ks.act?.state?.rud);
    const zh = s === 'L' ? '左' : '右', want = s === 'L' ? turn > 10 : turn < -10;
    ok(`按住「${zh}」：船头往${zh}转，舵打满`, want && Math.abs(Math.abs(rud) - 1) < 0.05, `转了 ${turn.toFixed(1)}°（正为左），舵 ${rud}`);
    ok(`松开「${zh}」：舵回正`, Math.abs(rud1 ?? 1) < 0.05, `舵 ${rud1}`);
  }
  report(`steer ${size}`, logs.filter((l) => /error|Error/.test(l) && !/WebSocket|Failed to load|声音没能打开/.test(l)));
  await ctx.close();
}
await b.close();
console.log(`\n${n - fails}/${n} 通过${fails ? '　未过：见上' : ''}`);
process.exit(fails ? 1 : 0);
