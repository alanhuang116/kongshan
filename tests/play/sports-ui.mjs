// 四样比试在正式界面里的样子：电脑 1280×800、iPhone 393×714、SE 375×548、横着的手机 714×393、最窄的安卓 360×640。
// 每一样走到几个要紧的时候（开头的话与签、瞄着引弓、出招、骑着走……）截一张，用 uikit 的 fit 查出界、截断、安全区、键太小、相叠、字与底的对比。
// 截图在 shots/games/ui_<样>_<时候>_<尺寸>.png。
// 用法：KS_URL=http://localhost:3831/ node tests/play/sports-ui.mjs [archery,cuju,cock,donkey] [desk,iphone,se,landscape,android]
import { join } from 'node:path';
import { Report } from './lib.mjs';
import { fit, launch, open } from './uikit.mjs';

const args = process.argv.slice(2);
const only = args[0] && !args[0].startsWith('--') ? args[0].split(',') : null;
const sizes = (args[1] ?? 'desk,iphone,se,landscape,android').split(',');
const SZ = { desk: { w: 1280, h: 800 }, iphone: 'iphone', se: 'se', landscape: 'landscape', android: 'android' };
const OUT = join(import.meta.dirname, '..', '..', 'shots', 'games');
const R = new Report();
const browser = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 每一样：在哪、什么时候；几个时候（各自怎么走到：在页面里跑的一段） */
const PLAN = [
  {
    id: 'archery', s: 'village', t: '10', from: [113.5, 12],
    steps: [
      ['intro', async (k, G, wait) => { await wait(2600); }],
      ['aim', async (k, G, wait) => { k.cmd('go'); for (let i = 0; i < 80 && G.archery.phase !== 'ready'; i++) await wait(100); await wait(800); k.cmd('draw', 'down'); await wait(1300); }],
      ['hit', async (k, G, wait) => { k.cmd('draw', 'up'); for (let i = 0; i < 60 && G.archery.phase !== 'look'; i++) await wait(100); await wait(500); }],
    ],
  },
  {
    id: 'cuju', s: 'bridge', t: '10', from: [8, 46],
    steps: [
      ['intro', async (k, G, wait) => { await wait(2600); }],
      ['play', async (k, G, wait) => {
        k.cmd('go');
        // 踢两三脚，停在鞠飞向自己、针正走着的时候
        // 一直替自己踢着（这一趟不落地），停在鞠正飞向自己、针刚走起来的时候截图
        let done = -1;
        window.__uiKick = setInterval(() => { const g = G.cuju; if (g.phase === 'play' && g.to === g.me && g.seq !== done && g.t >= g.hitT - 0.03) { done = g.seq; k.cmd('kick', 'down'); } }, 8);
        for (let i = 0; i < 600; i++) { const g = G.cuju; if (g.phase === 'play' && g.to === g.me && g.rally >= 4 && g.t > g.hitT - 0.85 && g.t < g.hitT - 0.6) break; await wait(10); }
      }],
    ],
  },
  {
    id: 'cock', s: 'village', t: '10', from: [39, 36],
    steps: [
      ['intro', async (k, G, wait) => { await wait(3600); }],
      ['choose', async (k, G, wait) => { k.cmd('go'); for (let i = 0; i < 120 && G.cock.phase !== 'choose'; i++) await wait(100); await wait(300); }],
      ['clash', async (k, G, wait) => { k.cmd('m1'); await wait(900); }],
    ],
  },
  {
    id: 'donkey', s: 'village', t: '10',
    steps: [
      ['ride', async (k, G, wait) => { for (let i = 0; i < 200 && G['ride:donkey']?.phase !== 'ride'; i++) await wait(100); k.cmd('goto', [100, 34]); await wait(3500); }],
    ],
  },
  {
    // 夜里牛在棚里：牵出来骑，吹笛（面板收紧，一行签）
    id: 'ox', s: 'village', t: '21',
    steps: [
      ['ride', async (k, G, wait) => { for (let i = 0; i < 300 && G['ride:ox']?.phase !== 'ride'; i++) await wait(100); k.cmd('goto', [43.8, 12.5]); await wait(3000); k.cmd('flute'); await wait(1200); }],
    ],
  },
];

for (const P of PLAN) {
  if (only && !only.includes(P.id)) continue;
  for (const size of sizes) {
    const { page, ctx, logs } = await open(browser, `?auto=1&s=${P.s}&t=${P.t}&w=clear&season=spring&flow=0&q=mid`, SZ[size], { wait: 600 });
    if (page.__fatal) { R.ok(`${P.id}@${size}：页面起来了`, false, page.__fatal); await ctx.close(); continue; }
    const ok = await page.evaluate(async ([id, f0]) => {
      const k = window.__ks, a = k.acts[id];
      if (!a) return false;
      for (let i = 0; i < 60 && !(a.on?.() ?? true); i++) await new Promise((r) => setTimeout(r, 250));
      const s = a.spot;
      k.player.teleport(f0?.[0] ?? s.x, f0?.[1] ?? s.z, 0); k.nav.snapBehind();
      k.enterAct(id, true);
      return true;
    }, [P.id, P.from ?? null]);
    if (!ok) { R.ok(`${P.id}@${size}：有这一样`, false); await ctx.close(); continue; }
    for (const [name, fn] of P.steps) {
      await page.evaluate(async (src) => { const k = window.__ks, G = window.__games, wait = (ms) => new Promise((r) => setTimeout(r, ms)); await eval(`(${src})`)(k, G, wait); }, fn.toString());
      await sleep(350);
      const file = join(OUT, `ui_${P.id}_${name}_${size}.png`);
      await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
      await page.screenshot({ path: file });
      const issues = await fit(page, `${P.id}·${name}`, { scope: '.act' });
      R.ok(`${P.id}·${name}@${size}：界面放得下（不出界、不截断、键够大、不相叠、字读得清）`, issues.length === 0, issues.slice(0, 3).join(' | '));
    }
    const errs = logs.filter((l) => /games|play\/|acts\/(archery|cuju|cock|ride)|比试/.test(l) && !/WebSocket|GPU stall/.test(l));
    R.ok(`${P.id}@${size}：没有报错`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
}

const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
