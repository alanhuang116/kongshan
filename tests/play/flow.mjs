// 真的走一遍：题名页 → 入 → 进门的话 → 走几步 → 走近一件事按 E → 毕 → 简册 → 村图换处 → 天时 → 重开看记没记住
// 用法：node tests/play/flow.mjs [desk|phone|land]（网址默认 http://localhost:3801/，或 KS_URL=…；截图在 shots/flow/）
import { launch, open, shot, report, overflow } from './uikit.mjs';
const size = process.argv[2] ?? 'desk', touch = size === 'phone' || size === 'land';
const b = await launch();
let fails = 0;
const ok = (name, pass, note = '') => { if (!pass) fails++; console.log(`${pass ? '  ✓' : '  ✗'} ${name}${note ? '　' + note : ''}`); };
const { page, logs, ctx } = await open(b, '?', size, { wait: 3200 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const tapSel = (sel) => (touch ? page.tap(sel) : page.click(sel));

// —— 题名页 ——
ok('题名页：俯瞰开着、雾几乎收尽', await ev(() => window.__ui.ui.get().phase === 'title' && window.__ks.veil < 0.2), `veil=${(await ev(() => window.__ks.veil)).toFixed(2)}`);
ok('题名页：没有走动时的界面', await ev(() => !document.querySelector('.hud')));
await tapSel('[data-testid="enter"]');
await wait(1500);
await shot(page, `flow-${size}-1-intro`);
ok('入：进门的话浮出来', await ev(() => !!document.querySelector('.intro p')), await ev(() => [...document.querySelectorAll('.intro p')].map((p) => p.textContent).join(' / ')));
await page.waitForFunction(() => window.__ui.ui.get().phase === 'roam', null, { timeout: 15000 }).catch(() => {});
await wait(3400);
ok('入了：在桃林、雾收尽、人看得见', await ev(() => { const k = window.__ks; return window.__ui.ui.get().phase === 'roam' && k.nav.cur === 'grove' && k.veil < 0.02 && k.player.av.root.visible !== false; }), await ev(() => `place=${window.__ks.nav.cur} veil=${window.__ks.veil.toFixed(2)} visits=${window.__ui.saved.get().visits}`));
await shot(page, `flow-${size}-2-roam`);
await overflow(page, 'roam');

// —— 走 ——
const p0 = await ev(() => window.__ks.player.pos.toArray());
if (touch) {
  const r = await ev(() => { const b = document.querySelector('.stick').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2, b.width / 2]; });
  // 摇杆往上推到头，推住三秒
  const cdp = await ctx.newCDPSession(page);
  const pt = (x, y) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(r[0], r[1]) });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(r[0], r[1] - r[2] * 0.9 * (i / 6)) }); await wait(30); }
  await wait(3600);
  ok('摇杆推着：世界收到了', await ev(() => window.__ks.stick.length() > 0.5), await ev(() => `stick=(${window.__ks.stick.x.toFixed(2)}, ${window.__ks.stick.y.toFixed(2)})`));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
} else {
  await page.mouse.click(700, 300);          // 让画布得到焦点（顺带点了一下地面）
  await page.keyboard.down('w'); await wait(4200); await page.keyboard.up('w');
}
await wait(2400);
const p1 = await ev(() => window.__ks.player.pos.toArray());
const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
ok('走了几步', moved > 3, `走出 ${moved.toFixed(1)} 米`);
ok('走过之后提示收起、记下「会走了」', await ev(() => window.__ui.saved.get().walked === true && !document.querySelector('.walk-hint:not(.is-gone)')));
ok('松手后摇杆归零', await ev(() => window.__ks.stick.length() < 0.01));

// —— 走近一件事 ——
await ev(() => { const k = window.__ks, a = k.acts['xiang:旅'] ?? Object.values(k.acts).find((x) => !x.on || x.on()); k.player.teleport(a.spot.x + 0.4, a.spot.z + 0.9, Math.PI); k.nav.snapBehind(); window.__near = a.id; });
await wait(1400);
const near = await ev(() => window.__ks.near?.id ?? null);
ok('走近了：世界报来、界面上那枚签添了朱砂', !!near && await ev(() => !!document.querySelector('.mk.is-near, .prompt.is-on')), `near=${near}`);
await shot(page, `flow-${size}-3-near`);
if (touch) await page.tap('[data-testid="act-key"]'); else await page.keyboard.press('e');
await page.waitForFunction(() => !!window.__ks.act, null, { timeout: 12000 }).catch(() => {});
await wait(900);
ok(touch ? '点那方印：事开始了' : '按 E：事开始了', await ev(() => !!window.__ks.act && window.__ui.ui.get().act === window.__ks.act.id), await ev(() => window.__ks.act?.id ?? 'null'));
ok('做事时走动的界面收起', await ev(() => { const c = document.querySelector('.corner'); return getComputedStyle(c).opacity === '0' || getComputedStyle(c).pointerEvents === 'none'; }));
await shot(page, `flow-${size}-4-act`);
if (touch) await page.tap('[data-testid="act-done"]'); else await page.keyboard.press('Escape');
await wait(1200);
ok(touch ? '点「毕」：起身' : 'Esc：起身', await ev(() => !window.__ks.act && window.__ui.ui.get().act === null));

// —— 简册、村图 ——
await tapSel('[data-testid="key-menu"]'); await wait(500);
ok('简册展开：六枚', await ev(() => document.querySelectorAll('.menu .slip').length === 6));
await tapSel('[data-testid="key-map"]'); await wait(900);
ok('村图开了', await ev(() => window.__ui.ui.get().sheet === 'map' && !!document.querySelector('.map')));
await tapSel('[data-testid="go-pavilion"]');
await page.waitForFunction(() => window.__ks.nav.cur === 'pavilion' && !window.__ks.nav.busy, null, { timeout: 12000 }).catch(() => {});
await wait(1400);
ok('点「观物亭」：人到了、册页收起', await ev(() => window.__ks.nav.cur === 'pavilion' && window.__ui.ui.get().sheet === null && window.__ui.ui.get().busy === false), await ev(() => `place=${window.__ks.nav.cur}`));
await shot(page, `flow-${size}-5-pavilion`);

// —— 天时 ——
await tapSel('[data-testid="key-when"]'); await wait(900);
ok('点时辰的卦：天时开了', await ev(() => window.__ui.ui.get().sheet === 'sky'));
await tapSel('[data-testid="dial-9"]'); await wait(1500);            // 酉时 · 观
ok('点「酉」：画里到酉时', await ev(() => Math.abs(window.__ks.atmos.hour - 18) < 0.01 && window.__ui.saved.get().time === 18), await ev(() => `hour=${window.__ks.atmos.hour} 右上=${document.querySelector('.when span')?.textContent}`));
await tapSel('[data-testid="season-autumn"]'); await wait(600);
await tapSel('[data-testid="weather-mist"]'); await wait(600);
ok('秋、雾：世界与存档都换了', await ev(() => window.__ks.season === 'autumn' && window.__ks.atmos.weather === 'mist' && window.__ui.saved.get().season === 'autumn' && window.__ui.saved.get().weather === 'mist'));
await tapSel('[data-testid="time-night"]'); await wait(3600);
ok('夜：界面换成夜的颜色', await ev(() => document.documentElement.dataset.tone === 'night'), await ev(() => `night=${window.__ks.atmos.night.toFixed(2)} tone=${document.documentElement.dataset.tone}`));
await shot(page, `flow-${size}-6-night`);
if (touch) await page.tap('.sheet-back', { position: { x: 20, y: 60 } }); else await page.keyboard.press('Escape');
await wait(600);
ok(touch ? '点画面别处：册页收起' : 'Esc：册页收起', await ev(() => window.__ui.ui.get().sheet === null));

// —— 重开：记住了没有 ——
await wait(500);
await page.goto(page.url().split('?')[0] + '?auto=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true || !!document.querySelector('.fatal'), null, { timeout: 120000 });
await wait(1200);
ok('重开（auto）：直接在桃林，秋夜有雾（记着上回选的）', await ev(() => { const k = window.__ks; return k.nav.cur === 'grove' && k.season === 'autumn' && k.atmos.weather === 'mist' && k.timeMode === 'night' && window.__ui.ui.get().phase === 'roam'; }), await ev(() => `season=${window.__ks.season} w=${window.__ks.atmos.weather} time=${window.__ks.timeMode} visits=${window.__ui.saved.get().visits}`));
ok('重开：不再出走法提示', await ev(() => !document.querySelector('.walk-hint')));
await shot(page, `flow-${size}-7-again`);
report(`flow ${size}`, logs.filter((l) => !/没能备好|Failed to load|    at |声音没能打开/.test(l)));
await ctx.close();

// —— ui=0：什么界面都不出 ——
{
  const { page: p2, logs: l2, ctx: c2 } = await open(b, '?auto=1&s=yard&ui=0', size, { wait: 900 });
  ok('ui=0：没有界面', await p2.evaluate(() => !document.querySelector('.hud, .title, .act, .sheet') && window.__ui.ui.get().phase === 'roam'));
  report('ui=0', l2.filter((l) => !/没能备好|Failed to load|    at |声音没能打开/.test(l)));
  await c2.close();
}
await b.close();
console.log(fails ? `${fails} 项没过` : '都过了');
process.exit(fails ? 1 : 0);
