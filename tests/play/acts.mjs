// 每一件事：从几步外走过去 → 站定开始 → 按它的流程点一点、选一选 → 截图 → 毕。
// 看：走不走得到、会不会卡住、有没有报错、做完人站不站得起来、观象有没有记进册子。
// 用法：node tests/play/acts.mjs [事的 id，逗号分开] [--mobile]
// 网址默认 http://localhost:3801/ ；看开发台子用 KS_URL=http://localhost:3801/world.html
import { launch, open, dir, Report } from './lib.mjs';
import { join } from 'node:path';

const args = process.argv.slice(2), mobile = args.includes('--mobile');
const only = args.find((a) => !a.startsWith('--'))?.split(',') ?? null;
const PLAN = [
  // [id, 处, 时, 步骤, 另给的网址参数?]：步骤是 'tap' | 'wait:毫秒' | 'cmd:指令' | 'cmd:指令:参数' | 'shot' | 'tapmum:第几丛'
  ['couplet', 'yard', 'day', ['wait:2500', 'shot', 'cmd:done']],
  ['book', 'hall', 'day', ['wait:2600', 'shot', 'cmd:yi', 'wait:1500', 'shot', 'cmd:more', 'wait:600', 'cmd:close', 'wait:500', 'shot', 'cmd:menu', 'cmd:write', 'wait:1500', 'shot', 'cmd:written', 'wait:500', 'shot', 'cmd:done']],
  ['qin', 'hall', 'day', ['wait:2600', 'shot', 'tap', 'wait:400', 'tap', 'wait:400', 'tap', 'wait:400', 'tap', 'wait:400', 'tap', 'wait:400', 'tap', 'wait:400', 'tap', 'wait:600', 'shot', 'cmd:done', 'wait:400', 'shot', 'cmd:done']],
  // 煮茶：扇到滚 → 提壶注茶（约五秒，放回炉上）→ 候茶（两三秒后才能品）→ 品（端起、送到嘴边、放回，约五秒半）→ 出象
  ['tea', 'hall', 'day', ['wait:2400', 'shot', 'tap', 'tap', 'tap', 'tap', 'tap', 'tap', 'tap', 'tap', 'tap', 'wait:800', 'shot', 'tap', 'wait:2800', 'shot', 'wait:5400', 'shot', 'cmd:sip', 'wait:2700', 'shot', 'wait:3400', 'shot', 'cmd:done']],
  ['wine', 'hall', 'night', ['wait:2400', 'tap', 'wait:4700', 'shot', 'tap', 'wait:4700', 'shot', 'tap', 'wait:4700', 'shot', 'cmd:done']],
  ['couch', 'hall', 'night', ['wait:9500', 'shot', 'cmd:done']],
  ['scroll', 'hall', 'day', ['wait:2300', 'shot', 'cmd:done']],
  ['guan', 'pavilion', 'day', ['wait:2600', 'shot', 'cmd:cloud', 'wait:9000', 'shot', 'tap', 'wait:600', 'shot', 'cmd:done']],
  ['guan', 'pavilion', 'night', ['wait:2600', 'cmd:star', 'wait:8000', 'shot', 'tap', 'wait:600', 'shot', 'cmd:done']],
  ['nap', 'pavilion', '14', ['wait:9500', 'shot', 'cmd:written', 'wait:500', 'shot', 'cmd:done']],
  ['bagua', 'pavilion', 'day', ['wait:2600', 'shot', 'cmd:turn', 'wait:2400', 'shot', 'tap', 'wait:2400', 'tap', 'wait:2400', 'shot', 'tap', 'tap', 'tap', 'tap', 'tap', 'tap', 'wait:2000', 'shot', 'cmd:done']],
  ['mums', 'yard', 'day', ['wait:1500', 'tapmum:15', 'wait:2200', 'shot', 'tapmum:12', 'wait:6000', 'shot', 'cmd:done']],
  ['dipper', 'bridge', 'night', ['wait:2600', 'shot', 'cmd:done']],
  ['cart', 'yard', 'day', ['wait:2600', 'shot', 'cmd:done']],
  ['roadTea', 'bridge', 'day', ['wait:4200', 'shot', 'cmd:done']],
  ['xiang:革', 'yard', 'day', ['wait:4000', 'shot', 'cmd:keep']],
  ['xiang:井', 'village', 'day', ['wait:4000', 'shot', 'cmd:keep']],
  // 扫院（秋天落叶时才有）：拿起竹帚，站着按住「扫」扫几下（两手握竿、帚头贴地划弧），放下竹帚
  ['broom', 'yard', '10', ['wait:1500', 'shot', 'cmd:sweep:down', 'wait:2400', 'shot', 'cmd:sweep:up', 'wait:300', 'cmd:done'], { season: 'autumn' }],
];
const R = new Report(), d = dir(mobile ? 'acts-m' : 'acts');
const browser = await launch();
for (const [id, s, t, steps, extra] of PLAN) {
  if (only && !only.includes(id)) continue;
  const { page, ctx, logs } = await open(browser, { s, t: String(t), ui: '0', ...(extra ?? {}) }, mobile ? { w: 390, h: 844, dpr: 2, mobile: true } : {});
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  const exists = await page.evaluate((id) => !!window.__ks.acts[id], id);
  if (!exists) { R.ok(`${id}@${t}：备好了`, false, '没有这件事（挂点缺？）'); await ctx.close(); continue; }
  // 从三五米外一处能走到的地方走过去
  const from = await page.evaluate((id) => {
    const k = window.__ks, a = k.acts[id], W = window.__walk;
    let sx = a.spot.x, sz = a.spot.z;
    for (let i = 0; i < 24; i++) { const x = a.spot.x + Math.cos(i * 0.9) * (3 + (i % 3)), z = a.spot.z + Math.sin(i * 0.9) * (3 + (i % 3)); if (W.standable(x, z) != null && W.findPath(x, z, W.groundAt(x, z), a.spot.x, a.spot.z)) { sx = x; sz = z; break; } }
    k.player.teleport(sx, sz, 0); k.nav.snapBehind();
    k.enterAct(id);
    return [+sx.toFixed(1), +sz.toFixed(1)];
  }, id);
  let started = false;
  for (let i = 0; i < 60 && !started; i++) { await page.waitForTimeout(250); started = await page.evaluate((id) => window.__ks.act?.id === id, id); }
  R.ok(`${id}@${t}：走得到、开始做`, started, `自 (${from})`);
  if (!started) { await ctx.close(); continue; }
  const before = await page.evaluate(() => window.__ks.found.size);
  let n = 0;
  for (const st of steps) {
    const vw = mobile ? 390 : 1440, vh = mobile ? 844 : 810;
    if (st === 'tap') { await page.mouse.click(vw / 2 + (Math.random() - 0.5) * vw * 0.15, vh * 0.42 + (Math.random() - 0.5) * vh * 0.1); await page.waitForTimeout(120); }
    else if (st.startsWith('wait:')) await page.waitForTimeout(Number(st.slice(5)));
    else if (st.startsWith('cmd:')) { const [c, arg] = st.slice(4).split(':'); await page.evaluate(([c, arg]) => window.__ks.cmd(c, arg), [c, arg]); await page.waitForTimeout(150); }
    else if (st.startsWith('tapmum:')) {
      const xy = await page.evaluate((i) => { const k = window.__ks, M = { x0: -9.2, x1: -3.8, z0: 6.8, z1: 12.8 }; const c = new k.world.camera.position.constructor(M.x0 + (M.x1 - M.x0) * (Math.floor(i / 4) + 0.5) / 4, 8.3, M.z0 + (M.z1 - M.z0) * ((i % 4) + 0.5) / 4); const v = c.project(k.world.camera); return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; }, Number(st.slice(7)));
      await page.mouse.click(xy.x, xy.y);
    } else if (st === 'shot') await page.screenshot({ path: join(d, `${id.replace(':', '-')}_${t}_${n++}.png`) });
  }
  await page.waitForTimeout(1300);
  const end = await page.evaluate(() => ({ act: window.__ks.act?.id ?? null, pose: window.__ks.player.av.pose, locked: window.__ks.player.locked, found: window.__ks.found.size }));
  R.ok(`${id}@${t}：做完了站起来、能走`, !end.act && end.pose === 'stand' && !end.locked, `act=${end.act} 姿势=${end.pose} 锁着=${end.locked}`);
  if (id.startsWith('xiang:') || ['qin', 'tea', 'wine', 'book'].includes(id)) R.ok(`${id}@${t}：观象记进册子`, end.found > before, `${before} → ${end.found}`);
  const errs = logs.filter((l) => !/404|Failed to load resource/.test(l));
  R.ok(`${id}@${t}：没有报错`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
