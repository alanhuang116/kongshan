// 带界面的截图：走动时的界面（处名、标记、主按钮、提示、摇杆），各项活动的面板与小人是否互相挡着。
// 用法：node ui.mjs [--mobile] [名字,名字…]
import { launch, open, dir, shot } from './lib.mjs';

const args = process.argv.slice(2), MOBILE = args.includes('--mobile');
const only = args.find((a) => !a.startsWith('--'))?.split(',');
const browser = await launch();
const { page, logs } = await open(browser, { s: 'censer' }, MOBILE ? { w: 390, h: 844, dpr: 2, mobile: true } : { w: 1440, h: 810 });
const d = dir(MOBILE ? 'ui-m' : 'ui');
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const want = (n) => !only || only.includes(n);
const enter = async (id, ms = 3200) => { await ev((id) => { const k = window.__ks; if (k.act) k.exitAct(); k.enterAct(id, true); }, id); await wait(ms); };
const overflow = async (label) => {
  // 有没有超出屏幕的界面元素、被裁掉的字
  const bad = await ev(() => {
    const W = innerWidth, H = innerHeight, out = [];
    for (const el of document.querySelectorAll('.hud *, .act *, .sheet *')) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.opacity === '0' || cs.visibility === 'hidden' || el.closest('.markers')) continue;
      if (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1) out.push(`${el.className || el.tagName} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    }
    return out.slice(0, 6);
  });
  if (bad.length) console.log(`  ! ${label} 有出界的元素：${bad.join(' | ')}`);
};

if (want('roam')) {
  await wait(1500);
  await shot(page, d, '01-roam-near'); await overflow('roam');
  const near = await ev(() => document.querySelector('[data-testid="use"]')?.textContent ?? null);
  console.log('走近香炉时的主按钮：', near);
  // 走开一点：没有主按钮，只有标记
  await ev(() => { const k = window.__ks; k.player.teleport(6, 30, Math.PI); k.nav.snapBehind(); });
  await wait(900);
  await shot(page, d, '02-roam-far');
  console.log('走开后的主按钮：', await ev(() => document.querySelector('[data-testid="use"]')?.textContent ?? null), '；看得见的标记：', await ev(() => window.__ks.markers.filter((m) => m.visible).map((m) => m.label).join(' ')));
  // 殿里
  await ev(() => { const k = window.__ks; k.player.teleport(0.8, 2.6, Math.PI); k.nav.snapBehind(); });
  await wait(900);
  await shot(page, d, '03-roam-hall');
  console.log('殿里：', await ev(() => document.querySelector('[data-testid="use"]')?.textContent ?? null), '；标记：', await ev(() => window.__ks.markers.filter((m) => m.visible).map((m) => m.label + (m.near ? '*' : '')).join(' ')));
  // 钟楼下
  await ev(() => { const k = window.__ks; k.player.teleport(12.6, 19.4, Math.PI / 2); k.nav.snapBehind(); });
  await wait(900);
  await shot(page, d, '04-roam-tower');
  console.log('钟楼下：', await ev(() => document.querySelector('[data-testid="use"]')?.textContent ?? null));
}
if (want('door')) {
  // 上楼、下楼
  await ev(() => { const k = window.__ks; k.player.teleport(12.9, 19.0, Math.PI / 2); k.nav.snapBehind(); });
  await wait(700);
  if (MOBILE) await page.tap('[data-testid="use"]'); else await page.keyboard.press('e');
  await wait(2200);
  await shot(page, d, '05-tower-top');
  console.log('上楼后：处', await ev(() => window.__ks.nav.cur), '人在', await ev(() => window.__ks.player.zone), '主按钮', await ev(() => document.querySelector('[data-testid="use"]')?.textContent ?? null));
  await ev(() => window.__ks.use('bell-down')); await wait(2200);
  console.log('下楼后：', await ev(() => window.__ks.player.zone), await ev(() => window.__ks.player.pos.toArray().map((v) => +v.toFixed(2)).join(',')));
}
for (const [id, name, ms] of [['incense', '10-incense', 3600], ['bow', '11-bow', 3600], ['muyu', '12-muyu', 3200], ['bell', '14-bell', 3000], ['drum', '15-drum', 3000], ['sit', '16-sit-choose', 3600], ['copy', '18-copy', 4200], ['lamp', '19-lamp-write', 3400], ['tea', '21-tea', 3400], ['sweep', '22-sweep', 2200]]) {
  if (!want(id)) continue;
  await enter(id, ms);
  if (id === 'muyu') { for (let i = 0; i < 7; i++) { await page.mouse.click(MOBILE ? 195 : 500, MOBILE ? 420 : 400); await wait(380); } }
  await shot(page, d, name); await overflow(id);
  if (id === 'sit') { await page.click('[data-testid="sit-start"]'); await wait(9500); await shot(page, d, '17-sit-sitting'); await page.mouse.click(300, 300); await wait(700); await shot(page, d, '17b-sit-peek'); }
  if (id === 'lamp') { await page.click('[data-testid="lamp-light"]'); await wait(2600); await shot(page, d, '20-lamp-push'); await overflow('lamp-push'); }
}
if (want('lots')) {
  await enter('lots', 3000);
  await shot(page, d, '13-lots');
  await page.mouse.move(MOBILE ? 195 : 720, 400); await page.mouse.down();
  for (let i = 0; i < 70 && (await ev(() => window.__ks.act?.state.phase)) === 'shake'; i++) { await page.mouse.move((MOBILE ? 195 : 720) + (i % 2 ? 60 : -60), 400, { steps: 3 }); await wait(50); }
  await page.mouse.up(); await wait(2600);
  await shot(page, d, '13b-lots-verse'); await overflow('verse');
}
if (want('map')) {
  await ev(() => { const k = window.__ks; if (k.act) k.exitAct(); k.player.teleport(-6, 18, 2.2); k.nav.snapBehind(); });
  await wait(600);
  await page.click('[data-testid="key-map"]'); await wait(900);
  await shot(page, d, '30-map'); await overflow('map');
  await page.click('[data-testid="map-terrace"]'); await wait(2200);
  await shot(page, d, '31-after-map');
  console.log('点寺图「云台」后：处', await ev(() => window.__ks.nav.cur));
}
console.log('—— 页面报错 ——');
for (const l of [...new Set(logs)]) console.log(l);
await browser.close();
