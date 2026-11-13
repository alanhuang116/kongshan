// 连环画：把一段连续的动作逐帧截下来（以小人为中心裁一小块），拼成一张图，用眼睛看过渡自然不自然。
// 用法：node strip.mjs [名字,名字…]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, open, dir } from './lib.mjs';

const only = process.argv[2]?.split(',');
const probe = readFileSync(join(import.meta.dirname, 'probe.js'), 'utf8');
const browser = await launch();
const { page, ctx, logs } = await open(browser, { s: 'yard', ui: '0' }, { w: 1280, h: 720 });
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
  await tp(-10, 14.7, Math.PI / 2); await wait(300);
  await ev(() => window.__ks.player.goTo(11, 14.7)); await wait(1600);
  await cam([3.4, 1.0, -7.6], 0.8, 30, [3.4, 0]); await wait(120);
  await strip('walk', 10, 40);
  await uncam(); await ev(() => window.__ks.player.stop());
}
// 小跑：侧面
if (want('run')) {
  await tp(-10, 14.7, Math.PI / 2); await wait(300);
  await ev(() => { const k = window.__ks; k.player.fast = true; k.player.goTo(11, 14.7); }); await wait(1300);
  await cam([5.0, 1.0, -8.6], 0.8, 30, [5.0, 0]); await wait(100);
  await strip('run', 10, 0);
  await uncam(); await ev(() => { const k = window.__ks; k.player.fast = false; k.player.stop(); });
}
// 走：背后（平时看到的样子）
if (want('walkback')) {
  await tp(0, 35.4, Math.PI); await wait(300);
  await ev(() => window.__ks.player.goTo(0, 24.6)); await wait(1500);
  await strip('walkback', 10, 40, { w: 220, h: 330, cy: 0.9 });
  await ev(() => window.__ks.player.stop());
}
// 起步、停步
if (want('startstop')) {
  await tp(-6, 14.7, Math.PI / 2); await wait(500);
  await cam([1.3, 1.0, -7.6], 0.8, 30, [1.3, 0]); await wait(150);
  await ev(() => window.__ks.player.goTo(-3.4, 14.7));
  await strip('startstop', 14, 110, { cols: 14 });
  await uncam();
}
// 掉头
if (want('turn')) {
  await tp(-6, 14.7, Math.PI / 2); await wait(300);
  await ev(() => window.__ks.player.goTo(6, 14.7)); await wait(1500);
  await cam([1.2, 3.4, -6.4], 0.8, 32, [0.8, 0]); await wait(100);
  await ev(() => window.__ks.player.goTo(-9, 14.7));
  await strip('turn', 12, 20, { w: 250, h: 330 });
  await uncam(); await ev(() => window.__ks.player.stop());
}
// 下坡、上坡：柴门外到溪边那道缓坡，侧面（镜头跟着人走，每帧重摆）
async function follow(name, from, to, n, gap) {
  await tp(from[0], from[1], Math.atan2(to[0] - from[0], to[1] - from[1])); await wait(300);
  await ev(([x, z]) => window.__ks.player.goTo(x, z, { r: 0.2 }), to); await wait(700);
  const shots = [], ts = [], t0 = Date.now();
  for (let i = 0; i < n; i++) {
    // 从侧面九米半外看，整个人连脚都在框里
    await cam([9.5, 0.6, 0], 0.62, 26); await wait(30);
    const c = await ev(() => { const k = window.__ks, p = k.player.pos, o = { x: 0, y: 0, visible: false, dist: 0 }; k.nav.project(new p.constructor(p.x, p.y + 0.72, p.z), o); return o; });
    const x = Math.max(0, Math.min(1280 - 260, Math.round(c.x - 130))), y = Math.max(0, Math.min(720 - 340, Math.round(c.y - 170)));
    shots.push((await page.screenshot({ clip: { x, y, width: 260, height: 340 } })).toString('base64')); ts.push(Date.now() - t0);
    await wait(gap);
  }
  const p2 = await ctx.newPage();
  await p2.setViewportSize({ width: Math.min(n, 8) * 264 + 4, height: Math.ceil(n / 8) * 362 + 4 });
  await p2.setContent(`<body style="margin:0;background:#111;font:11px monospace;color:#bbb"><div style="display:grid;grid-template-columns:repeat(${Math.min(n, 8)},260px);gap:4px;padding:4px">${shots.map((s, i) => `<div><img src="data:image/png;base64,${s}" width="260" height="340" style="display:block"><div style="height:18px;line-height:18px;text-align:center">${(ts[i] / 1000).toFixed(2)}s</div></div>`).join('')}</div></body>`);
  await p2.screenshot({ path: join(d, name + '.png') });
  await p2.close(); await uncam();
  console.log(`— ${name}：${n} 帧`);
}
if (want('slope')) {
  await follow('slope-down', [0.3, 17.4], [0, 25.2], 16, 60);
  await follow('slope-up', [0, 25.2], [0.3, 17.4], 16, 60);
}
if (want('steps')) {
  await follow('plinth-up', [0, 6.4], [0, 1.0], 12, 120);
  await follow('pavilion-up', [-0.6, -20.1], [-3.4, -20.4], 10, 90);
}
// （寺里的礼佛、静坐没有了；坐凳与盘坐由各件事做，见下）
if (false && want('bow')) {
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
// 坐凳：在书案前坐下、起身（侧面）
if (want('bench')) {
  await tp(3.2, -0.4, Math.PI); await wait(400);
  await ev(() => window.__ks.enterAct('book'));
  await page.waitForFunction(() => window.__ks.act?.id === 'book', null, { timeout: 15000 }).catch(() => {});
  await ev(() => { const k = window.__ks, s = k.acts.book.spot, V = k.player.pos.constructor, y = k.player.pos.y; k.nav.setPose({ pos: new V(s.x + 3.2, y + 1.0, s.z + 0.4), look: new V(s.x, y + 0.6, s.z + 0.3), fov: 30 }, 0.01); });
  await strip('bench-down', 10, 180, { w: 300, h: 330, cy: 0.6 });
  await ev(() => window.__ks.exitAct());
  await ev(() => { const k = window.__ks, s = k.acts.book.spot, V = k.player.pos.constructor, y = k.player.pos.y; k.nav.setPose({ pos: new V(s.x + 3.2, y + 1.0, s.z + 0.4), look: new V(s.x, y + 0.7, s.z + 0.3), fov: 30 }, 0.01); });
  await strip('bench-up', 8, 170, { w: 300, h: 330, cy: 0.7 });
  await uncam();
}
if (false && want('sit')) {
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
