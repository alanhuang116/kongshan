// 连环画：把一段连续的动作逐帧截下来（以小人为中心裁一小块），拼成一张图，用眼睛看过渡自然不自然。
// 用法：node strip.mjs [名字,名字…]
//   输出到 shots/strip/（或环境变量 KS_OUT 给的目录）。KS_URL 换页面（默认 3801 的正式界面）。
//   名字：walk walkback fast run runback startstop runstart runstop turn runturn slope runslope steps runsteps bridge idle stroll bench
// 跑起来一步不到三分之一秒，截一张图却要几十毫秒，按真实时间截会漏掉腾空的那一瞬。
// 所以截图时把世界的时钟停下来，自己一帧一帧地推（每帧 1/60 秒，推几帧截一张），镜头每张重摆在人的侧面——像跟拍。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, open, dir } from './lib.mjs';

const only = process.argv[2]?.split(',');
const probe = readFileSync(join(import.meta.dirname, 'probe.js'), 'utf8');
const browser = await launch();
const W0 = 1280, H0 = 720;
const { page, ctx, logs } = await open(browser, { s: 'yard', ui: '0', hud: '0' }, { w: W0, h: H0 });
await page.evaluate(probe);
// 台子上那些事的名字（world.html 的标记）别挡着人
await page.addStyleTag({ content: '#marks{display:none !important}' });
const d = process.env.KS_OUT ?? dir('strip');
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const tp = (x, z, yaw, zone = 'ground') => ev(([x, z, yaw, zone]) => { const k = window.__ks; if (k.act) k.exitAct(); k.setRun(false); k.stick.set(0, 0); k.player.teleport(x, z, yaw, zone); k.nav.snapBehind(); }, [x, z, yaw, zone]);
/** 停下世界的时钟（之后用 adv 一帧一帧地推）；放开 */
const hold = () => ev(() => window.__ks.world.stop());
const free = () => ev(() => { const k = window.__ks; k.world.start(); k.nav.setPose(null, 0.01); });
/** 推 n 帧（每帧 dt 秒）；不画 */
const adv = (n, dt = 1 / 60) => ev(([n, dt]) => { const w = window.__ks.world; for (let i = 0; i < n; i++) { w.time += dt; for (const f of w.tick) f(dt, w.time); } }, [n, dt]);
/**
 * 把镜头摆在人的某一侧（off：相对人此刻位置的世界偏移；看他身上 lookY 高处；也可以按人的朝向 rel=true 来摆），画一帧，
 * 返回人身上 cy 高处在画面上的位置
 */
const frame = (off, { lookY = 0.8, fov = 30, cy = 0.8, rel = false } = {}) => ev(([off, lookY, fov, cy, rel]) => {
  const k = window.__ks, p = k.player.pos, w = k.world, cam = w.camera;
  let [ox, oy, oz] = off;
  if (rel) { const s = Math.sin(k.player.yaw), c = Math.cos(k.player.yaw); [ox, oz] = [ox * c + oz * s, -ox * s + oz * c]; }
  cam.position.set(p.x + ox, p.y + oy, p.z + oz); cam.up.set(0, 1, 0); cam.lookAt(p.x, p.y + lookY, p.z);
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld(); w.render();
  const o = { x: 0, y: 0, visible: false, dist: 0 }; k.nav.project(new p.constructor(p.x, p.y + cy, p.z), o); return o;
}, [off, lookY, fov, cy, rel]);

/** 拼图：shots 是一组 base64，ts 是各自的时刻（秒） */
async function sheet(name, shots, ts, w, h, cols) {
  const p2 = await ctx.newPage();
  const rows = Math.ceil(shots.length / cols);
  await p2.setViewportSize({ width: cols * (w + 4) + 4, height: rows * (h + 22) + 4 });
  await p2.setContent(`<body style="margin:0;background:#111;font:11px monospace;color:#bbb"><div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:4px;padding:4px">${shots.map((s, i) => `<div><img src="data:image/png;base64,${s}" width="${w}" height="${h}" style="display:block"><div style="height:18px;line-height:18px;text-align:center">${ts[i].toFixed(3)}s</div></div>`).join('')}</div></body>`);
  await p2.screenshot({ path: join(d, name + '.png') });
  await p2.close();
  console.log(`— ${name}：${shots.length} 帧，${ts.at(-1).toFixed(2)} 秒`);
}
/**
 * 截一条：start() 让人动起来（时钟停着之前），先推 warm 秒进入状态，再每 every 帧截一张，共 n 张。
 * each(i) 在每张之前调用（中途松手、转向……）。off/opt 是镜头（见 frame）。
 */
async function strip(name, { start, warm = 1, n = 12, every = 2, off = [0, 1.0, -8.6], opt = {}, w = 240, h = 330, cols = n, each, clean = false } = {}) {
  // clean：把草木（田里的麦子会挡住脚）先藏起来
  if (clean) await ev(() => { const f = window.__ks.flora; if (f) f.group.visible = false; });
  await start?.();
  await hold();
  await adv(Math.round(warm * 60));
  const shots = [], ts = [];
  for (let i = 0; i < n; i++) {
    if (each) await each(i);
    const c = await frame(off, opt);
    const x = Math.max(0, Math.min(W0 - w, Math.round(c.x - w / 2))), y = Math.max(0, Math.min(H0 - h, Math.round(c.y - h / 2)));
    shots.push((await page.screenshot({ clip: { x, y, width: w, height: h } })).toString('base64'));
    ts.push((i * every) / 60);
    await adv(every);
  }
  await free();
  if (clean) await ev(() => { const f = window.__ks.flora; if (f) f.group.visible = true; });
  await sheet(name, shots, ts, w, h, cols);
}
const want = (n) => !only || only.includes(n);
const go = (x, z, o = {}) => ev(([x, z, o]) => { const k = window.__ks; if (o.run) k.setRun(true); k.player.goTo(x, z, { r: 0.2 }); }, [x, z, o]);
const stopNow = () => ev(() => { const k = window.__ks; k.player.stop(); k.setRun(false); k.stick.set(0, 0); });
/** 摇杆推到头（快走）：镜头朝 yaw 看，往前推 */
const stickFwd = (yaw) => ev((yaw) => { const k = window.__ks; k.nav.yaw = k.nav.yawS = yaw; k.stick.set(0, 1); }, yaw);
// 井田当中那条东西向的田埂路：九十米长、平
const FIELD = { z: 77, x0: -68, x1: 20 };

// 走：侧面（一步约 0.47 秒；每三帧一张）
if (want('walk')) {
  await tp(-10, 14.7, Math.PI / 2); await wait(300);
  await strip('walk', { start: () => go(11, 14.7), warm: 1.6, n: 12, every: 3 });
  await stopNow();
}
// 快走（摇杆推到头）：侧面
if (want('fast')) {
  await tp(-10, 14.7, Math.PI / 2); await wait(300);
  await strip('fast', { start: () => stickFwd(-Math.PI / 2), warm: 1.4, n: 12, every: 2 });
  await stopNow();
}
// 跑：侧面，田埂上（每帧一张：一步约 0.3 秒，看得到两脚同时离地）
const SIDE = { off: [0, 0.9, -9.2], opt: { fov: 24, lookY: 0.78, cy: 0.78 }, w: 250, h: 350, clean: true };
if (want('run')) {
  await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(300);
  await strip('run', { start: () => go(FIELD.x1, FIELD.z, { run: true }), warm: 2.2, n: 20, every: 1, cols: 10, ...SIDE });
  await stopNow();
}
// 跑：背后与斜前（平时看到的样子）
if (want('runback')) {
  await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(300);
  await strip('runback', { start: () => go(FIELD.x1, FIELD.z, { run: true }), warm: 2.2, n: 10, every: 2, off: [-6.5, 1.6, -0.9], opt: { lookY: 0.9, fov: 26 }, clean: true });
  await stopNow();
  await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(300);
  await strip('runfront', { start: () => go(FIELD.x1, FIELD.z, { run: true }), warm: 2.2, n: 10, every: 2, off: [5.5, 1.0, -3.2], opt: { lookY: 0.85, fov: 30 }, clean: true });
  await stopNow();
}
// 跑：近看（左前方，看提衣的那只手、前摆、裤腿）
if (want('runclose')) {
  await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(300);
  await strip('runclose', { start: () => go(FIELD.x1, FIELD.z, { run: true }), warm: 2.2, n: 10, every: 2, off: [1.7, 0.85, 2.4], opt: { lookY: 0.7, fov: 32, cy: 0.7, rel: true }, w: 300, h: 420, clean: true });
  await stopNow();
}
// 走：背后
if (want('walkback')) {
  await tp(0, 35.4, Math.PI); await wait(300);
  await strip('walkback', { start: () => go(0, 24.6), warm: 1.5, n: 10, every: 3, off: [0, 1.6, 6.5], opt: { lookY: 0.9, cy: 0.9 }, w: 220 });
  await stopNow();
}
// 起步、停步（走）
if (want('startstop')) {
  await tp(-6, 14.7, Math.PI / 2); await wait(500);
  await strip('startstop', { start: () => go(-3.4, 14.7), warm: 0, n: 16, every: 6, cols: 8 });
}
// 起跑：站着 → 跑起来（每三帧一张）
if (want('runstart')) {
  await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(600);
  await strip('runstart', { start: () => go(FIELD.x1, FIELD.z, { run: true }), warm: 0, n: 20, every: 3, cols: 10, ...SIDE });
  await stopNow();
}
// 跑着停下：松开 Shift 并停步（急停有一小步的缓冲）
if (want('runstop')) {
  await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(300);
  await strip('runstop', { start: () => go(FIELD.x1, FIELD.z, { run: true }), warm: 2.2, n: 24, every: 4, cols: 12, ...SIDE, each: async (i) => { if (i === 1) await stopNow(); } });
}
// 掉头（走）
if (want('turn')) {
  await tp(-6, 14.7, Math.PI / 2); await wait(300);
  await strip('turn', { start: () => go(6, 14.7), warm: 1.5, n: 12, every: 3, off: [1.2, 3.4, -6.4], each: async (i) => { if (i === 0) await go(-9, 14.7); } });
  await stopNow();
}
// 跑着转弯：从后上方看，身子向内倾
if (want('runturn')) {
  await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(300);
  await strip('runturn', {
    start: () => ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = -Math.PI / 2; k.setRun(true); k.keyMove.set(0, 1); }), warm: 1.5, n: 12, every: 4, off: [-5.5, 1.8, 0], opt: { rel: false, lookY: 0.9 },
    each: async (i) => { if (i === 2) await ev(() => window.__ks.keyMove.set(-0.7, 0.7)); },
  });
  await ev(() => window.__ks.keyMove.set(0, 0)); await stopNow();
}
// 坡、台阶、桥、汀步：镜头跟着人（侧面九米半外）
async function follow(name, from, to, { n = 16, every = 4, run = false } = {}) {
  await tp(from[0], from[1], Math.atan2(to[0] - from[0], to[1] - from[1])); await wait(300);
  const side = Math.atan2(to[0] - from[0], to[1] - from[1]) + Math.PI / 2;
  await strip(name, { start: () => go(to[0], to[1], { run }), warm: run ? 0.35 : 0.7, n, every, cols: 8, off: [Math.sin(side) * 9.5, 0.6, Math.cos(side) * 9.5], opt: { lookY: 0.62, fov: 26, cy: 0.72 }, w: 260, h: 340 });
  await stopNow();
}
if (want('slope')) {
  await follow('slope-down', [0.3, 17.4], [0, 25.2]);
  await follow('slope-up', [0, 25.2], [0.3, 17.4]);
}
if (want('runslope')) {
  await follow('runslope-down', [0.3, 17.4], [0, 25.2], { run: true, every: 2 });
  await follow('runslope-up', [0, 25.2], [0.3, 17.4], { run: true, every: 2 });
}
if (want('steps')) {
  await follow('plinth-up', [0, 6.4], [0, 1.0], { n: 12, every: 7 });
  await follow('pavilion-up', [-0.6, -20.1], [-3.4, -20.4], { n: 10, every: 5 });
}
if (want('runsteps')) {
  await follow('runplinth-up', [0, 7.4], [0, 1.0], { n: 16, every: 3, run: true });
  await follow('runplinth-down', [0, 1.0], [0, 7.4], { n: 16, every: 3, run: true });
}
if (want('bridge')) {
  await follow('runbridge', [0, 24.6], [0, 35.4], { n: 16, every: 3, run: true });
  await follow('runstones', [62, 35.8], [62.6, 25.2], { n: 16, every: 4, run: true });
}
// 站着：闲时的小动作（每半秒一张，看一分钟里出了些什么）
if (want('idle')) {
  // 田埂上（院里柱子多，挡镜头）；把头一个小动作的计时拨近些
  await tp(-30, 77, Math.PI); await wait(300);
  await ev(() => { const i = window.__ks.player.idle; i.nextG = 3; i.nextH = 6; });
  await strip('idle', { warm: 1, n: 40, every: 45, cols: 10, off: [2.6, 1.15, 4.6], opt: { lookY: 0.9, fov: 30, cy: 0.82, rel: true }, w: 230, h: 380, clean: true });
}
// 散步：走久了负手（每秒一张，侧后方跟着）
if (want('stroll')) {
  await tp(-176, 41.5, Math.PI / 2); await wait(300);
  await strip('stroll', { start: () => go(-130, 39.5), warm: 0.5, n: 24, every: 45, cols: 8, off: [-2.6, 1.4, -4.6], opt: { lookY: 0.95, fov: 30, cy: 0.85, rel: true }, w: 230, h: 330 });
  await stopNow();
}
// 坐凳：在书案前坐下、起身（侧面）
if (want('bench')) {
  await tp(3.2, -0.4, Math.PI); await wait(400);
  await ev(() => window.__ks.enterAct('book'));
  await page.waitForFunction(() => window.__ks.act?.id === 'book', null, { timeout: 15000 }).catch(() => {});
  const s = await ev(() => { const k = window.__ks, s = k.acts.book.spot; return { x: s.x, z: s.z }; });
  const off = await ev(([sx, sz]) => { const p = window.__ks.player.pos; return [sx + 3.2 - p.x, 1.0, sz + 0.4 - p.z]; }, [s.x, s.z]);
  await strip('bench-down', { warm: 0, n: 10, every: 11, off, opt: { lookY: 0.6, cy: 0.6 }, w: 300, h: 330 });
  await ev(() => window.__ks.exitAct());
  await strip('bench-up', { warm: 0, n: 8, every: 10, off, opt: { lookY: 0.7, cy: 0.7 }, w: 300, h: 330 });
}
console.log('—— 页面报错 ——');
for (const l of [...new Set(logs)]) console.log(l);
await browser.close();
