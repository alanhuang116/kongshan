// 与村里人说话：在某个时辰，把这会儿在外头的人一个个走过去、作揖、问两句、别过。
// 看：走得到、他转过来对着你、话出来了（「再问」换一句）、别过之后各忙各的、没有报错。
// 用法：node tests/play/talk.mjs [时辰…]（默认 10 和 15）
import { launch, open, Report } from './lib.mjs';

const hours = process.argv.slice(2).filter((a) => /^[\d.]+$/.test(a));
const R = new Report(), browser = await launch();
for (const t of hours.length ? hours : ['10', '15']) {
  const { page, ctx, logs } = await open(browser, { s: 'village', t, ui: '0' }, { wait: 1500 });
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  const ids = await page.evaluate(() => Object.keys(window.__ks.acts).filter((id) => id.startsWith('talk:') && window.__ks.things.find((th) => th.id === id)?.on?.() !== false));
  console.log(`— ${t} 点钟，在外头的：${ids.map((i) => i.slice(5)).join(' ') || '（没有）'}`);
  for (const id of ids) {
    const r = await page.evaluate(async (id) => {
      const k = window.__ks, a = k.acts[id], W = window.__walk;
      let sx = a.spot.x, sz = a.spot.z;
      for (let i = 0; i < 24; i++) { const x = a.spot.x + Math.cos(i * 0.9) * 3.5, z = a.spot.z + Math.sin(i * 0.9) * 3.5; if (W.standable(x, z) != null && W.findPath(x, z, W.groundAt(x, z), a.spot.x, a.spot.z)) { sx = x; sz = z; break; } }
      k.player.teleport(sx, sz, 0); k.nav.snapBehind();
      await new Promise((res) => setTimeout(res, 300));
      k.enterAct(id);
      for (let i = 0; i < 80 && k.act?.id !== id; i++) await new Promise((res) => setTimeout(res, 200));
      if (k.act?.id !== id) return { started: false };
      await new Promise((res) => setTimeout(res, 900));
      const t1 = String(k.act.state.text ?? '');
      k.cmd('more'); await new Promise((res) => setTimeout(res, 300));
      const t2 = String(k.act.state.text ?? '');
      k.cmd('bye'); await new Promise((res) => setTimeout(res, 300));
      if (k.act) { k.cmd('bye'); await new Promise((res) => setTimeout(res, 300)); }   // 与客说话后先显出一象，再别过
      await new Promise((res) => setTimeout(res, 1200));
      return { started: true, t1, t2, after: k.act?.id ?? null, locked: k.player.locked };
    }, id);
    R.ok(`${t} 点 ${id}：走得到、说得上话`, r.started && r.t1.length > 2, r.started ? `「${r.t1.slice(0, 24).replace(/\n/g, ' ')}…」` : '没开始');
    if (r.started) R.ok(`${t} 点 ${id}：别过之后能走`, !r.after && !r.locked);
  }
  const errs = logs.filter((l) => !/404|Failed to load resource/.test(l));
  R.ok(`${t} 点：没有报错`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
