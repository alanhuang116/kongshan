// 真的走一遍：题名页 → 入 → 进门的话 → 「初到」几页 → 走几步（「Shift 跑」/「疾」）→ 走近一件事按 E → 毕 → 简册 → 行囊 → 村图换处 → 天时（时辰流转）
//   → 再来一回：题名页上写着上回停在哪，「入」回到那里
//   → 画面下方浮一句话 → 重开看记没记住
// 用法：node tests/play/flow.mjs [desk|phone|land|<uikit 里的尺寸名>]（网址默认 http://localhost:3801/，或 KS_URL=…；截图在 shots/flow/）
import { launch, open, shot, report, overflow, SIZES } from './uikit.mjs';
const size = process.argv[2] ?? 'desk', touch = !!SIZES[size]?.mobile;
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
// 头一回：「初到」几页（画显出来以后才出），一页一页翻完就收起、记下
await page.waitForSelector('[data-testid="guide"]', { timeout: 9000 }).catch(() => {});
ok('头一回：「初到」浮出来', await ev(() => !!document.querySelector('[data-testid="guide"]')));
await shot(page, `flow-${size}-2b-guide`);
await overflow(page, 'guide');
for (let i = 0; i < 6 && (await ev(() => !!document.querySelector('[data-testid="guide"]'))); i++) { await tapSel('[data-testid="guide-next"]'); await wait(450); }
ok('翻完「初到」：收起、记下（以后不再自己出）', await ev(() => !document.querySelector('[data-testid="guide"]') && window.__ui.saved.get().guided === true));
ok('右上写着第几日', await ev(() => document.querySelector('[data-testid="hud-day"]')?.textContent === `第${['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][window.__ks.day] ?? ''}日`), await ev(() => `${document.querySelector('[data-testid="hud-day"]')?.textContent} day=${window.__ks.day}`));
if (touch) {
  // 「疾」：点一下一直跑，亮起来；再点放开
  await page.tap('[data-testid="run-key"]'); await wait(300);
  ok('点「疾」：一直跑、那一枚亮着', await ev(() => window.__ks.runLock === true && window.__ui.ui.get().run === true && document.querySelector('[data-testid="run-key"]').classList.contains('is-on')));
  await page.tap('[data-testid="run-key"]'); await wait(300);
  ok('再点「疾」：放开', await ev(() => window.__ks.runLock === false && window.__ui.ui.get().run === false));
}

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
ok('走过之后提示收起、记下「会走了」', await ev(() => window.__ui.saved.get().walked === true && !document.querySelector('.walk-hint:not(.is-gone):not(.run-hint)')));
ok('松手后摇杆归零', await ev(() => window.__ks.stick.length() < 0.01));
if (!touch) {
  // 会走了之后提示一回「Shift 跑」；按住 Shift 跑一下，提示收起、记下
  await page.waitForSelector('[data-testid="run-hint"]', { timeout: 6000 }).catch(() => {});
  ok('电脑上提示一回「Shift 跑」', await ev(() => !!document.querySelector('[data-testid="run-hint"]')));
  await page.keyboard.down('Shift'); await page.keyboard.down('w'); await wait(900);
  ok('按住 Shift：跑起来了（界面知道）', await ev(() => window.__ui.ui.get().run === true));
  await page.keyboard.up('w'); await page.keyboard.up('Shift'); await wait(2400);
  ok('跑过之后「Shift 跑」收起、记下，不再出', await ev(() => window.__ui.saved.get().runTold === true && window.__ui.ui.get().run === false));
}

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

// —— 简册、行囊、村图 ——
await tapSel('[data-testid="key-menu"]'); await wait(500);
const slips = await ev(() => [...document.querySelectorAll('.menu .slip')].map((s) => s.textContent).join(' '));
ok('简册展开：村图、天时、行囊、观象册、起居注、声音、关于都在（村人簿、星图有页才出）', ['村图', '天时', '行囊', '观象册', '起居注', '声音', '关于'].every((n) => slips.includes(n)), slips);
await tapSel('[data-testid="key-bag"]'); await wait(900);
ok('行囊开了（空的时候也有一句话）', await ev(() => window.__ui.ui.get().sheet === 'bag' && !!document.querySelector('.bag-empty, .bag-group')));
await ev(() => window.__ks.bag.add('peach', 3));
await wait(500);
ok('收进三个桃：行囊页跟着添上一行', await ev(() => /三/.test(document.querySelector('[data-testid="bag-peach"]')?.textContent ?? '') && window.__ui.saved.get().world.bag?.peach === 3), await ev(() => JSON.stringify(window.__ui.saved.get().world.bag ?? null)));
await shot(page, `flow-${size}-4b-bag`);
if (touch) await page.tap('[data-testid="sheet-close"]'); else await page.keyboard.press('Escape');
await wait(500);
await tapSel('[data-testid="key-menu"]'); await wait(500);
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
// 时辰流转着（默认每秒一分钟），点过之后会往前走一点
ok('点「酉」：画里到酉时', await ev(() => Math.abs(window.__ks.atmos.hour - 18) < 0.15 && Math.abs(Number(window.__ui.saved.get().time) - 18) < 0.15), await ev(() => `hour=${window.__ks.atmos.hour.toFixed(3)} 右上=${document.querySelector('.when span')?.textContent}`));
// 时辰流转：停
await tapSel('[data-testid="flow-0"]'); await wait(400);
ok('时辰流转选「停」：世界停了、存档记下', await ev(() => window.__ks.flow === 0 && window.__ui.saved.get().flow === 0));
const h0 = await ev(() => window.__ks.atmos.hour); await wait(1500);
ok('停着：时辰不走', await ev((h0) => Math.abs(window.__ks.atmos.hour - h0) < 1e-6, h0));
await tapSel('[data-testid="flow-3"]'); await wait(1600);
ok('选「疾」：时辰快快地走（一秒约三分钟）', await ev((h0) => window.__ks.flow > 0.04 && window.__ks.atmos.hour - h0 > 0.03, h0), await ev((h0) => `走了 ${((window.__ks.atmos.hour - h0) * 60).toFixed(1)} 分`, h0));
await tapSel('[data-testid="flow-0"]'); await wait(300);
await tapSel('[data-testid="season-autumn"]'); await wait(600);
await tapSel('[data-testid="weather-mist"]'); await wait(600);
ok('秋、雾：世界与存档都换了', await ev(() => window.__ks.season === 'autumn' && window.__ks.atmos.weather === 'mist' && window.__ui.saved.get().season === 'autumn' && window.__ui.saved.get().weather === 'mist'));
await tapSel('[data-testid="time-night"]'); await wait(3600);
ok('夜：界面换成夜的颜色', await ev(() => document.documentElement.dataset.tone === 'night'), await ev(() => `night=${window.__ks.atmos.night.toFixed(2)} tone=${document.documentElement.dataset.tone}`));
await shot(page, `flow-${size}-6-night`);
if (touch) await page.tap('.sheet-back', { position: { x: 20, y: 60 } }); else await page.keyboard.press('Escape');
await wait(600);
ok(touch ? '点画面别处：册页收起' : 'Esc：册页收起', await ev(() => window.__ui.ui.get().sheet === null));

// —— 画面下方浮一句话 ——
await ev(() => window.__ks.note('得麦三捆', 'bag'));
await wait(700);
ok('世界说一句话：画面下方浮起来', await ev(() => [...document.querySelectorAll('.notes .note')].some((n) => n.textContent === '得麦三捆')));
await shot(page, `flow-${size}-6b-note`);
await wait(4600);
ok('过一会儿那句话退下去', await ev(() => !document.querySelector('.notes .note')));

// —— 重开：记住了没有 ——
await wait(500);
await page.goto(page.url().split('?')[0] + '?auto=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true || !!document.querySelector('.fatal'), null, { timeout: 120000 });
await wait(1200);
ok('重开（auto）：直接在桃林，秋夜有雾（记着上回选的）', await ev(() => { const k = window.__ks, h = k.atmos.hour; return k.nav.cur === 'grove' && k.season === 'autumn' && k.atmos.weather === 'mist' && (k.timeMode === 'night' || (typeof k.timeMode === 'number' && (h > 19 || h < 5))) && window.__ui.ui.get().phase === 'roam'; }), await ev(() => `season=${window.__ks.season} w=${window.__ks.atmos.weather} time=${window.__ks.timeMode} visits=${window.__ui.saved.get().visits}`));
ok('重开：时辰流转还是「停」、行囊里还有三个桃', await ev(() => window.__ks.flow === 0 && window.__ks.bag.count('peach') === 3));
ok('重开：不再出走法提示', await ev(() => !document.querySelector('.walk-hint')));
await shot(page, `flow-${size}-7-again`);
// —— 再来一回（走题名页）：题名页上写着上回停在哪；「入」回到那里，「初到」不再出 ——
{
  await ev(() => { const k = window.__ks; k.player.teleport(4.2, 18.6, 0.6, 'ground'); k.nav.snapBehind(); });
  await wait(4600);
  const sp = await ev(() => window.__ui.saved.get().spot);
  await page.goto(page.url().split('?')[0], { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ui?.ui.get().phase === 'title', null, { timeout: 120000 }).catch(() => {});
  await wait(900);
  const recap = await ev(() => document.querySelector('[data-testid="recap"]')?.textContent ?? '');
  ok('再来：题名页上写着上回停在哪', /上回停在/.test(recap), recap);
  await shot(page, `flow-${size}-8-recap`);
  await overflow(page, 'recap');
  await tapSel('[data-testid="enter"]');
  await page.waitForFunction(() => window.__ui.ui.get().phase === 'roam', null, { timeout: 20000 }).catch(() => {});
  await wait(2400);
  const at = await ev(() => [window.__ks.player.pos.x, window.__ks.player.pos.z]);
  ok('「入」：回到上回停下的地方', !!sp && Math.hypot(at[0] - sp.x, at[1] - sp.z) < 1.5, `记的 (${sp?.x}, ${sp?.z}) → 在 (${at.map((v) => v.toFixed(1)).join(', ')})`);
  await wait(4200);
  ok('再来：「初到」不再自己出', await ev(() => !document.querySelector('[data-testid="guide"]')));
}
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
