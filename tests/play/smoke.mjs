// 冒烟：每一项活动进去看一眼、截一张、出来；看有没有报错。
// 用法：node smoke.mjs [活动id,活动id…]
import { launch, open, dir, shot } from './lib.mjs';

const only = process.argv[2]?.split(',');
const browser = await launch();
const { page, logs } = await open(browser, { s: 'court' });
const d = dir('smoke');
const info = await page.evaluate(() => {
  const k = window.__ks;
  return { acts: Object.keys(k.acts), things: k.things.map((t) => `${t.id}@${t.spot.x.toFixed(2)},${t.spot.z.toFixed(2)}${t.spot.zone ? ':' + t.spot.zone : ''}`), av: k.player.av.constructor?.name, h: k.player.av.height };
});
console.log('活动：', info.acts.join(' '));
console.log('位置：', info.things.join('  '));
console.log('小人高', info.h);
await shot(page, d, '00-court');
for (const id of info.acts) {
  if (only && !only.includes(id)) continue;
  const n0 = logs.length;
  await page.evaluate((id) => window.__ks.enterAct(id, true), id);
  await page.waitForTimeout(3200);
  await shot(page, d, `act-${id}`);
  const st = await page.evaluate(() => { const k = window.__ks; return { act: k.act?.id ?? null, state: k.act?.state, pos: k.player.pos.toArray().map((v) => +v.toFixed(2)), zone: k.player.zone }; });
  console.log(`— ${id}: 进入=${st.act === id} 人在 ${st.pos} ${st.zone} 状态 ${JSON.stringify(st.state)}`);
  await page.evaluate(() => window.__ks.exitAct());
  await page.waitForTimeout(500);
  for (const l of logs.slice(n0)) console.log('   ' + l);
}
console.log('—— 全部报错 ——');
for (const l of [...new Set(logs)]) console.log(l);
await browser.close();
