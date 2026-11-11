// 连环画：把一段连续的动作逐帧截下来（以小人为中心裁一小块），拼成一张图，用眼睛看过渡自然不自然。
// 用法：node strip.mjs [名字,名字…]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, open, dir } from './lib.mjs';

const only = process.argv[2]?.split(',');
const probe = readFileSync(join(import.meta.dirname, 'probe.js'), 'utf8');
const browser = await launch();
const { page, ctx, logs } = await open(browser, { s: 'censer', ui: '0' }, { w: 1280, h: 720 });
await page.evaluate(probe);
const d = dir('strip');
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const tp = (x, z, yaw, zone = 'ground') => ev(([x, z, yaw, zone]) => { const k = window.__ks; if (k.act) k.exitAct(); k.player.teleport(x, z, yaw, zone); k.nav.snapBehind(); }, [x, z, yaw, zone]);
/** 机位：相对小人此刻的位置（世界轴上的偏移），看向他身上某个高度 */
const cam = (off, lookY = 0.85, fov = 34, lookOff = [0, 0]) => ev(([off, lookY, fov, lookOff]) => { const k = window.__ks, p = k.player.pos, V = p.constructor; k.nav.setPose({ pos: new V(p.x + off[0], p.y + off[1], p.z + off[2]), look: new V(p.x + lookOff[0], p.y + lookY, p.z + lookOff[1]), fov }, 0.01); }, [off, lookY, fov, lookOff]);
const uncam = () => ev(() => window.__ks.nav.setPose(null, 0.01));
/** 截 n 帧，每帧以小人为中心裁 w×h；间隔 gap 毫秒（实际还要加上截图本身的耗时） */
async function strip(name, n, gap, { w = 250, h = 330, cy = 0.8, cols = n } = {}) {
  const shots = [], ts = [];
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const c = await ev((cy) => { const k = window.__ks, p = k.player.pos, o = { x: 0, y: 0, visible: false, dist: 0 }; k.nav.project(new p.constructor(p.x, p.y + cy, p.z), o); return o; }, cy);
    const x = Math.max(0, Math.min(1280 - w, Math.round(c.x - w / 2))), y = Math.max(0, Math.min(720 - h, Math.round(c.y - h / 2)));
    shots.push((await page.screenshot({ clip: { x, y, width: w, height: h } })).toString('base64'));
    ts.push(Date.now() - t0);
    if (gap > 0) await wait(gap);
  }
  const p2 = await ctx.newPage();
  const rows = Math.ceil(n / cols);
  await p2.setViewportSize({ width: cols * (w + 4) + 4, height: rows * (h + 22) + 4 });
  await p2.setContent(`<body style="margin:0;background:#111;font:11px monospace;color:#bbb"><div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:4px;padding:4px">${shots.map((s, i) => `<div><img src="data:image/png;base64,${s}" width="${w}" height="${h}" style="display:block"><div style="height:18px;line-height:18px;text-align:center">${(ts[i] / 1000).toFixed(2)}s</div></div>`).join('')}</div></body>`);
  await p2.screenshot({ path: join(d, name + '.png') });
  await p2.close();
  console.log(`— ${name}：${n} 帧，${(ts.at(-1) / 1000).toFixed(2)} 秒`);
}
const want = (n) => !only || only.includes(n);

// 走：侧面
if (want('walk')) {
  await tp(-12, 39.9, Math.PI / 2); await wait(300);
  await ev(() => window.__ks.player.goTo(14, 39.9)); await wait(1600);
  await cam([3.4, 1.0, 7.6], 0.8, 30, [3.4, 0]); await wait(120);
  await strip('walk', 10, 40);
  await uncam(); await ev(() => window.__ks.player.stop());
}
// 小跑：侧面
if (want('run')) {
  await tp(-14, 39.9, Math.PI / 2); await wait(300);
  await ev(() => { const k = window.__ks; k.player.fast = true; k.player.goTo(14, 39.9); }); await wait(1500);
  await cam([5.0, 1.0, 8.6], 0.8, 30, [5.0, 0]); await wait(100);
  await strip('run', 10, 0);
  await uncam(); await ev(() => { const k = window.__ks; k.player.fast = false; k.player.stop(); });
}
// 走：背后（平时看到的样子）
if (want('walkback')) {
  await tp(8, 44, Math.PI); await wait(300);
  await ev(() => window.__ks.player.goTo(8, 20)); await wait(1500);
  await strip('walkback', 10, 40, { w: 220, h: 330, cy: 0.9 });
  await ev(() => window.__ks.player.stop());
}
// 起步、停步
if (want('startstop')) {
  await tp(-6, 39.9, Math.PI / 2); await wait(500);
  await cam([1.3, 1.0, 7.6], 0.8, 30, [1.3, 0]); await wait(150);
  await ev(() => window.__ks.player.goTo(-3.4, 39.9));
  await strip('startstop', 14, 110, { cols: 14 });
  await uncam();
}
// 掉头
if (want('turn')) {
  await tp(-6, 39.9, Math.PI / 2); await wait(300);
  await ev(() => window.__ks.player.goTo(6, 39.9)); await wait(1500);
  await cam([1.2, 3.4, 6.4], 0.8, 32, [0.8, 0]); await wait(100);
  await ev(() => window.__ks.player.goTo(-10, 39.9));
  await strip('turn', 12, 20, { w: 250, h: 330 });
  await uncam(); await ev(() => window.__ks.player.stop());
}
// 上殿前踏跺：侧面
if (want('stairs')) {
  await tp(0, 12.9, Math.PI); await wait(300);
  await cam([7.4, 3.6, -2.6], 0.9, 34, [0, -2.9]); await wait(150);
  await ev(() => window.__ks.player.goTo(0, 7.0));
  await wait(900);
  await strip('stairs-up', 12, 330, { w: 250, h: 330, cy: 0.8 });
  await uncam();
  await tp(0, 7.4, 0); await wait(300);
  await cam([7.4, 2.0, 2.6], -0.6, 34, [0, 2.9]); await wait(150);
  await ev(() => window.__ks.player.goTo(0, 13.0));
  await wait(900);
  await strip('stairs-down', 12, 330, { w: 250, h: 330, cy: 0.8 });
  await uncam();
}
// 山道石阶：背后（平时看到的样子）
if (want('path')) {
  await tp(0, 84, Math.PI); await wait(400);
  await ev(() => window.__ks.player.goTo(0, 70)); await wait(1800);
  await strip('path-up', 10, 120, { w: 240, h: 340, cy: 0.9 });
  await ev(() => window.__ks.player.stop());
}
// 礼佛：走上拜垫、跪下、叩拜、起身（侧面）
if (want('bow')) {
  await tp(0.3, 1.6, Math.PI); await wait(400);
  await ev(() => window.__ks.use('bow'));
  await wait(300);
  await ev(() => { const k = window.__ks, a = k.acts.bow.spot, V = k.player.pos.constructor, y = k.player.pos.y; k.nav.setPose({ pos: new V(a.x + 6.2, y + 1.2, a.z - 0.5), look: new V(a.x, y + 0.5, a.z - 0.25), fov: 30 }, 0.01); });
  await strip('bow-kneel', 12, 200, { w: 300, h: 300, cy: 0.55 });
  await ev(() => { const k = window.__ks, a = k.acts.bow.spot, V = k.player.pos.constructor, y = k.player.pos.y; k.nav.setPose({ pos: new V(a.x + 6.2, y + 1.2, a.z - 0.5), look: new V(a.x, y + 0.5, a.z - 0.25), fov: 30 }, 0.01); });
  await page.mouse.move(640, 360); await page.mouse.down();
  await strip('bow-down', 10, 150, { w: 300, h: 300, cy: 0.45 });
  await page.mouse.up();
  await strip('bow-up', 8, 180, { w: 300, h: 300, cy: 0.45 });
  await ev(() => window.__ks.exitAct());
  await ev(() => { const k = window.__ks, a = k.acts.bow.spot, V = k.player.pos.constructor, y = k.player.pos.y; k.nav.setPose({ pos: new V(a.x + 6.2, y + 1.2, a.z - 0.5), look: new V(a.x, y + 0.6, a.z - 0.25), fov: 30 }, 0.01); });
  await strip('bow-stand', 8, 170, { w: 300, h: 330, cy: 0.7 });
  await uncam();
}
// 静坐：走到蒲团、坐下
if (want('sit')) {
  await tp(34.3, -15.2, Math.PI / 2); await wait(400);
  await ev(() => window.__ks.use('sit'));
  await wait(200);
  await ev(() => { const k = window.__ks, a = k.acts.sit.spot, V = k.player.pos.constructor, y = k.player.pos.y; k.nav.setPose({ pos: new V(a.x + 0.6, y + 1.2, a.z + 6.4), look: new V(a.x, y + 0.45, a.z), fov: 30 }, 0.01); });
  await strip('sit-down', 14, 190, { w: 300, h: 300, cy: 0.55 });
  await ev(() => window.__ks.exitAct());
  await ev(() => { const k = window.__ks, a = k.acts.sit.spot, V = k.player.pos.constructor, y = k.player.pos.y; k.nav.setPose({ pos: new V(a.x + 0.6, y + 1.2, a.z + 6.4), look: new V(a.x, y + 0.6, a.z), fov: 30 }, 0.01); });
  await strip('sit-up', 8, 170, { w: 300, h: 330, cy: 0.7 });
  await uncam();
}
console.log('—— 页面报错 ——');
for (const l of [...new Set(logs)]) console.log(l);
await browser.close();
