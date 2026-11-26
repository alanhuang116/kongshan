// 同游：两个人在园子里遇见。先在本机起中转（server/relay.mjs，3820），开两页正式的界面（?ws=ws://localhost:3820/ws）：
//   互相看得见、名字对；甲用真实的按键走，乙那边看见甲的身子跟着走、走得匀（不抖、不顿）、停在甲停下的地方；
//   作揖（对方闲着会还礼）、说话两边都成；同行；换名字；独游再同游；甲关了页面乙那边他就不在了；
//   中转停了两页照样能走（不报错），中转回来两页自己连回来、又互相看见；
//   最后放十个机器人进来围着甲走，量同游每帧花多少（net 的每帧、画一帧的 CPU、多了多少三角与绘制）；
//   面板、名签在 393×714、375×548、714×393 与电脑上的样子（截图、出界、截断、键太小、相叠、对比）；
//   园中天时：两页在不同的时区（上海、巴黎），后来的随最早来的那一位（时辰、季、月、天气）；天时页也能拨（拨了是自己的天时，「回到此刻」再随园中）；
//   人数连自己、断线先记暂离、回来认得；同行着自己点了事不被吞掉；那一位走了换下一位；独游还回自己拨的。
// 用法：KS_URL=http://localhost:3817/ node tests/play/together.mjs [--no-perf] [--no-ui]
//   （先起一个不做热更新的开发服务器；KS_RELAY_PORT 换中转的端口；KS_TG_SIZES=android,androidLand 换第八段量的屏幕，uikit 的尺寸名）
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { Report } from './lib.mjs';
import { BASE, dir, fit, launch, open } from './uikit.mjs';

const PORT = Number(process.env.KS_RELAY_PORT ?? 3820);
const WS = `ws://localhost:${PORT}/ws`;
const ORIGIN = new URL(BASE).origin;
const ROOT = join(import.meta.dirname, '..', '..');
const SHOTS = dir('together');
const args = new Set(process.argv.slice(2));
const R = new Report();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// —— 中转 ——
let relay = null;
async function startRelay() {
  relay = spawn(process.execPath, [join(ROOT, 'server', 'relay.mjs')], { cwd: ROOT, env: { ...process.env, KS_RELAY_PORT: String(PORT), KS_RELAY_PER_IP: '64' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  relay.stdout.on('data', (d) => { out += d; });
  relay.stderr.on('data', (d) => { out += d; process.stdout.write(`[relay] ${d}`); });
  for (let i = 0; i < 50 && !/relay on/.test(out); i++) await sleep(100);
  if (!/relay on/.test(out)) throw new Error(`中转没起来：${out}`);
}
async function stopRelay() {
  if (!relay) return;
  const p = relay; relay = null;
  const gone = new Promise((r) => p.once('exit', r));
  p.kill();
  await Promise.race([gone, sleep(3000)]);
}

// —— 页面 ——
// share=0：老的几段定在网址上的时辰与季（同游时天时默认随园中，第十段专测它）
const path = (s = 'yard', extra = '&share=0') => `?auto=1&s=${s}&t=10&w=clear&season=spring&flow=0&q=mid&ws=${encodeURIComponent(WS)}${extra}`;
/** 连不上中转时浏览器自己报的那一句不算错 */
const real = (logs) => logs.filter((l) => !/WebSocket connection to|ERR_CONNECTION_REFUSED|net::ERR_/i.test(l));
const page = (size = 'desk', s = 'yard') => open(browser, path(s), size, { wait: 300 });
const online = (p, others = null, ms = 20000) => p.waitForFunction((n) => { const t = window.__net; return t?.status === 'online' && (n == null || t.remotes.size === n); }, others, { timeout: ms }).then(() => true, () => false);
const info = (p) => p.evaluate(() => {
  const t = window.__net, k = window.__ks;
  return {
    status: t.status, id: t.client?.id ?? 0, me: t.view.me, n: t.me.n, pos: [k.player.pos.x, k.player.pos.y, k.player.pos.z],
    remotes: [...t.remotes.values()].map((r) => ({ id: r.id, n: r.n, shown: r.shown, seen: r.seen, pos: [r.pos.x, r.pos.y, r.pos.z], dist: r.dist, speed: r.speed, pose: r.pose, bow: r.bowing01, hidden: r.hidden })),
  };
});
const placeAt = (p, x, z, yaw) => p.evaluate(([x, z, yaw]) => { const k = window.__ks; k.player.teleport(x, z, yaw); k.nav.snapBehind(); }, [x, z, yaw]);
const notes = (p) => p.evaluate(() => window.__ui.ui.get().notes.map((n) => n.text));
/** 等页面上浮出这一句（notes 只留最近三句、四秒多就退：每 100 毫秒看一眼） */
const waitNote = (p, re, ms = 6000) => p.waitForFunction((src) => window.__ui.ui.get().notes.some((n) => new RegExp(src).test(n.text)), re.source, { timeout: ms, polling: 100 }).then(() => true, () => false);
const shotTo = (p, name) => p.screenshot({ path: join(SHOTS, `${name}.png`) });

let browser = await launch();
await startRelay();
const pages = [];
const cleanup = async () => { for (const x of pages) await x.ctx.close().catch(() => {}); await browser.close().catch(() => {}); await stopRelay(); };
process.on('SIGINT', async () => { await cleanup(); process.exit(1); });

try {
  let A2 = null, B = null;
  if (!args.has('--perf-only')) {
  // ———— 一、两个人进来，互相看见 ————
  console.log('一、进园');
  const A = await page('desk');
  B = await page('iphone');
  pages.push(A, B);
  const okA = await online(A.page, 1), okB = await online(B.page, 1);
  R.ok('两页都连上了，各看见另一位', okA && okB);
  // 甲站在院中偏南、面朝北；乙站在甲前面四米偏西、面朝甲
  await placeAt(A.page, 1.2, 13.6, Math.PI);
  await placeAt(B.page, -0.4, 9.8, 0.35);
  await A.page.waitForTimeout(1800);
  let a = await info(A.page), b = await info(B.page);
  const bInA = a.remotes.find((r) => r.id === b.id), aInB = b.remotes.find((r) => r.id === a.id);
  R.ok('名字对得上', !!bInA && !!aInB && bInA.n.join() === b.n.join() && aInB.n.join() === a.n.join(), `甲「${a.me.label}」乙「${b.me.label}」`);
  const d0 = aInB ? Math.hypot(aInB.pos[0] - a.pos[0], aInB.pos[2] - a.pos[2]) : 99;
  R.ok('乙那边甲站在甲真站的地方', d0 < 0.15, `差 ${d0.toFixed(3)} 米`);
  R.ok('看得见身子', !!aInB?.shown && !!bInA?.shown);
  const tagText = await B.page.evaluate((id) => document.querySelector(`[data-testid=tg-tag-${id}] .tg-tag-name`)?.textContent ?? '', a.id);
  R.ok('名签写着他的雅号', tagText === a.me.label || tagText.startsWith(a.me.label.replace(/（.*$/, '')), tagText);
  const inScene = await B.page.evaluate((id) => !!window.__ks.world.scene.getObjectByName(`net:${id}`), a.id);
  R.ok('身子放进了画里', inScene);
  await shotTo(A.page, 'meet-desk');
  await shotTo(B.page, 'meet-phone');

  // ———— 二、甲用按键走，乙看见他走：匀、不顿、停在原地 ————
  console.log('二、走');
  const sample = B.page.evaluate(async ([id, ms]) => {
    const t = window.__net, out = [];
    const t0 = performance.now();
    // 记的是插值那一刻的钟（net.clock），不是这里自己取的：两个回调在一帧里谁先谁后不一定
    let last = -1;
    await new Promise((res) => { const f = () => { const r = t.remotes.get(id); if (r && t.clock !== last) { last = t.clock; out.push([t.clock, r.pos.x, r.pos.z, r.speed]); } if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return out;
  }, [a.id, 4200]);
  await A.page.waitForTimeout(150);
  await A.page.keyboard.down('w');
  await A.page.waitForTimeout(2600);
  await A.page.keyboard.up('w');
  const trail = await sample;
  await A.page.waitForTimeout(900);
  a = await info(A.page); b = await info(B.page);
  const aB = b.remotes.find((r) => r.id === a.id);
  const end = aB ? Math.hypot(aB.pos[0] - a.pos[0], aB.pos[2] - a.pos[2]) : 99;
  // 走着的那一段：每帧的速度（米/秒）。匀：离差小；不顿：没有一帧原地不动；不往回
  const v = [];
  let stalls = 0, back = 0, moved = 0;
  for (let i = 1; i < trail.length; i++) {
    const [t0, x0, z0] = trail[i - 1], [t1, x1, z1] = trail[i], d = Math.hypot(x1 - x0, z1 - z0), dt = (t1 - t0) / 1000;
    moved += d;
    if (dt <= 0) continue;
    v.push([t1, d / dt, x1 - x0, z1 - z0]);
  }
  const peak = Math.max(...v.map((x) => x[1]));
  const walking = v.filter((x) => x[1] > peak * 0.7);
  const mid = walking.slice(Math.floor(walking.length * 0.15), Math.ceil(walking.length * 0.85));
  const mean = mid.reduce((s, x) => s + x[1], 0) / Math.max(1, mid.length);
  const sd = Math.sqrt(mid.reduce((s, x) => s + (x[1] - mean) ** 2, 0) / Math.max(1, mid.length));
  if (mid.length) {
    const t0 = mid[0][0], t1 = mid[mid.length - 1][0], dir0 = [mid.reduce((s, x) => s + x[2], 0), mid.reduce((s, x) => s + x[3], 0)];
    for (const x of v) if (x[0] >= t0 && x[0] <= t1) { if (x[1] < 0.05) stalls++; if (x[2] * dir0[0] + x[3] * dir0[1] < -1e-4) back++; }
  }
  R.ok('乙那边甲走了一段', moved > 2.5, `${moved.toFixed(2)} 米`);
  R.ok('走得匀（每帧速度的离差小）', mid.length > 40 && sd / mean < 0.2, `均 ${mean.toFixed(2)} 米/秒，离差 ${(sd / mean * 100).toFixed(1)}%，${mid.length} 帧`);
  R.ok('不顿、不往回', stalls === 0 && back === 0, `原地 ${stalls} 帧，往回 ${back} 帧`);
  R.ok('停在甲停下的地方', end < 0.12, `差 ${end.toFixed(3)} 米`);
  R.ok('走的时候身子是走的步态', trail.some((x) => x[3] > 0.9), `最快 ${Math.max(...trail.map((x) => x[3])).toFixed(2)} 米/秒`);

  // ———— 三、作揖与还礼、说话，两边都成 ————
  console.log('三、作揖、说话');
  await placeAt(A.page, 1.2, 13.6, Math.PI);
  await placeAt(B.page, -0.4, 9.8, 0.35);
  await A.page.waitForTimeout(1500);
  await A.page.click('[data-testid=tg-key]');
  await A.page.waitForSelector('[data-testid=tg-panel]');
  await A.page.waitForSelector(`[data-testid=tg-bow-${b.id}]`, { timeout: 5000 });
  const bowWatch = B.page.evaluate(async (id) => {
    const t = window.__net; let m = 0; const t0 = performance.now();
    await new Promise((res) => { const f = () => { const r = t.remotes.get(id); if (r) m = Math.max(m, r.bowing01); if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return m;
  }, a.id);
  const backWatch = A.page.evaluate(async (id) => {
    const t = window.__net; let m = 0; const t0 = performance.now();
    await new Promise((res) => { const f = () => { const r = t.remotes.get(id); if (r) m = Math.max(m, r.bowing01); if (performance.now() - t0 < 3200) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return m;
  }, b.id);
  const noteB = waitNote(B.page, new RegExp(`${a.me.label.replace(/[（）]/g, '.')}向你作揖`));
  const noteA = waitNote(A.page, new RegExp(`${b.me.label.replace(/[（）]/g, '.')}还了一礼`));
  await A.page.click(`[data-testid=tg-bow-${b.id}]`);
  const selfBow = await A.page.evaluate(() => window.__ks.player.av.bow);
  await A.page.waitForTimeout(500);
  await shotTo(A.page, 'bow-desk');
  await shotTo(B.page, 'bow-phone');
  R.ok('甲作揖：自己躬身', selfBow > 0.5, selfBow.toFixed(2));
  R.ok('乙那边看见甲躬身', (await bowWatch) > 0.5);
  R.ok('乙收到「向你作揖」', await noteB);
  R.ok('乙闲着，还了一礼：甲那边看见他躬身、收到「还了一礼」', (await backWatch) > 0.5 && (await noteA));
  await A.page.waitForTimeout(1500);
  const saidB = waitNote(B.page, /：幸会$/);
  await A.page.click(`[data-testid=tg-say-${b.id}-meet]`);
  await A.page.waitForTimeout(600);
  const lineInB = await B.page.evaluate((id) => { const el = document.querySelector(`[data-testid=tg-tag-${id}] .tg-line`); return el && !el.hidden ? el.textContent : ''; }, a.id);
  const selfLine = await A.page.evaluate(() => document.querySelector('[data-testid=tg-self-line] .tg-line')?.textContent ?? '');
  await shotTo(A.page, 'say-desk');
  await shotTo(B.page, 'say-phone');
  R.ok('甲说「幸会」：乙收到一句', await saidB);
  R.ok('乙那边甲头上浮着「幸会」，甲自己头上也有', lineInB === '幸会' && selfLine === '幸会', `乙：${lineInB}　甲：${selfLine}`);
  // 乙回一句（手机上：点开同游，点甲那一行里的「后会有期」）
  await B.page.waitForTimeout(1400);
  await B.page.click('[data-testid=tg-key]');
  await B.page.waitForSelector(`[data-testid=tg-say-${a.id}-bye]`, { timeout: 5000 });
  await B.page.waitForTimeout(700);
  await shotTo(B.page, 'panel-phone-393');
  const saidA = waitNote(A.page, /：后会有期$/);
  await B.page.click(`[data-testid=tg-say-${a.id}-bye]`);
  R.ok('乙回「后会有期」：甲收到一句', await saidA);
  // 手机上：说完一句，那张纸自己收起（好看见自己头上浮着的那句话，不被纸挡着）
  await B.page.waitForTimeout(300);
  R.ok('手机上说完一句，同游那张纸自己收起', await B.page.evaluate(() => !document.querySelector('[data-testid=tg-panel]')));
  if (await B.page.$('[data-testid=tg-close]')) await B.page.click('[data-testid=tg-close]');

  // ———— 四、同行 ————
  console.log('四、同行');
  await B.page.waitForTimeout(1300);
  await placeAt(A.page, 4, 14.5, Math.PI);
  await placeAt(B.page, -3.5, 10.5, 0.6);
  await A.page.waitForTimeout(1600);
  const toldA = waitNote(A.page, /与你同行/, 9000);
  await B.page.click('[data-testid=tg-key]');
  await B.page.click(`[data-testid=tg-follow-${a.id}]`);
  // 手机上点了同行，纸也自己收起
  R.ok('手机上点了同行，那张纸自己收起', await B.page.evaluate(() => !document.querySelector('[data-testid=tg-panel]')));
  if (await B.page.$('[data-testid=tg-close]')) await B.page.click('[data-testid=tg-close]');
  const caught = await B.page.waitForFunction((id) => { const r = window.__net.remotes.get(id); return r && r.dist < 2.8; }, a.id, { timeout: 12000 }).then(() => true, () => false);
  R.ok('乙点「同行」：走到甲跟前', caught);
  R.ok('甲收到「与你同行」', await toldA);
  // 甲往前走几步，乙跟上
  await A.page.keyboard.down('w'); await A.page.waitForTimeout(1800); await A.page.keyboard.up('w');
  const kept = await B.page.waitForFunction((id) => { const r = window.__net.remotes.get(id); return r && r.dist < 3 && window.__ks.player.speed < 0.3; }, a.id, { timeout: 12000 }).then(() => true, () => false);
  R.ok('甲走开，乙跟着走过去', kept);
  // 乙自己一动手（按键），就不跟了
  await B.page.evaluate(() => { window.__ks.keyMove.set(0.6, 0); });
  await B.page.waitForTimeout(400);
  await B.page.evaluate(() => { window.__ks.keyMove.set(0, 0); });
  const stopped = await B.page.evaluate(() => window.__net.following == null);
  R.ok('乙自己一动手就不跟了', stopped);

  // ———— 五、换名字；独游再同游 ————
  console.log('五、换名字、独游');
  await A.page.click('[data-testid=tg-reroll]').catch(async () => { await A.page.click('[data-testid=tg-key]'); await A.page.click('[data-testid=tg-reroll]'); });
  const newN = await A.page.evaluate(() => window.__net.me.n.join());
  const renamed = await B.page.waitForFunction(([id, n]) => window.__net.remotes.get(id)?.n.join() === n, [a.id, newN], { timeout: 5000 }).then(() => true, () => false);
  R.ok('甲换一个名字：乙那边跟着换', renamed);
  await A.page.click('[data-testid=tg-off]');
  const goneB = await B.page.waitForFunction((id) => !window.__net.remotes.has(id), a.id, { timeout: 6000 }).then(() => true, () => false);
  const aOff = await A.page.evaluate(() => ({ s: window.__net.status, n: window.__net.remotes.size, key: document.querySelector('[data-testid=tg-key]')?.textContent ?? '' }));
  R.ok('甲点「独游」：乙那边甲不在了，甲那边也看不见乙', goneB && aOff.n === 0 && aOff.s === 'off' && aOff.key.startsWith('独游'), JSON.stringify(aOff));
  await A.page.click('[data-testid=tg-on]');
  const back2 = (await online(A.page, 1)) && (await online(B.page, 1));
  R.ok('再点「同游」：又互相看见', back2);
  const idA2 = await A.page.evaluate(() => window.__net.client.id);
  await A.page.click('[data-testid=tg-close]');

  // ———— 六、甲关了页面 ————
  console.log('六、离开');
  await A.ctx.close(); pages.splice(pages.indexOf(A), 1);
  const left = await B.page.waitForFunction((id) => !window.__net.remotes.has(id) && !window.__ks.world.scene.getObjectByName(`net:${id}`), idA2, { timeout: 6000 }).then(() => true, () => false);
  R.ok('甲关了页面：乙那边他的身子拿掉了', left);

  // ———— 七、中转停了、又回来 ————
  console.log('七、中转停了');
  A2 = await page('desk');
  pages.push(A2);
  R.ok('甲重新进来', (await online(A2.page, 1)) && (await online(B.page, 1)));
  await stopRelay();
  const retry = await Promise.all([A2.page, B.page].map((p) => p.waitForFunction(() => window.__net.status === 'retry', null, { timeout: 8000 }).then(() => true, () => false)));
  R.ok('中转停了：两页都知道（安静地等着再连）', retry.every(Boolean));
  const p0 = await A2.page.evaluate(() => ({ x: window.__ks.player.pos.x, z: window.__ks.player.pos.z, t: window.__ks.world.time, n: window.__net.remotes.size }));
  await A2.page.keyboard.down('w'); await A2.page.waitForTimeout(1200); await A2.page.keyboard.up('w');
  const p1 = await A2.page.evaluate(() => ({ x: window.__ks.player.pos.x, z: window.__ks.player.pos.z, t: window.__ks.world.time }));
  R.ok('中转停了照样能走、画照样在动', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 0.8 && p1.t > p0.t + 0.8 && p0.n === 0, `走了 ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2)} 米`);
  await startRelay();
  const reA = await online(A2.page, 1, 30000), reB = await online(B.page, 1, 30000);
  R.ok('中转回来：两页自己连回来，又互相看见', reA && reB);
  const errs = [...real(A2.logs), ...real(B.logs)];
  R.ok('没有报错（连不上时浏览器自己报的那一句不算）', errs.length === 0, errs.slice(0, 3).join(' | '));

  // ———— 八、界面：几种屏幕 ————
  if (!args.has('--no-ui')) {
    console.log('八、界面');
    const issues = [];
    for (const size of (process.env.KS_TG_SIZES ?? 'pc,laptop,pad,iphone,se,landscape').split(',')) {
      const C = await page(size);
      await online(C.page, 2);
      await placeAt(C.page, 0.6, 12.2, Math.PI);
      await placeAt(A2.page, -0.2, 10.4, 0.2);
      await placeAt(B.page, 1.6, 10.1, -0.3);
      await C.page.waitForTimeout(1500);
      // 那一枚：自己的字看得清、键够大；与右上那一条、摇杆这些不相叠（别人的字的对比不归这里管）
      issues.push(...(await fit(C.page, `${size} 同游的那一枚`, { scope: '.tg-key' })).map((x) => `${size}: ${x}`));
      issues.push(...(await fit(C.page, `${size} 那一枚与四角的键`, { scope: '.hud, .tg-key', contrast: false })).filter((x) => /tg-/.test(x)).map((x) => `${size}: ${x}`));
      await C.page.click('[data-testid=tg-key]');
      await C.page.waitForSelector('[data-testid=tg-panel]');
      await C.page.waitForTimeout(700);
      issues.push(...(await fit(C.page, `${size} 同游的纸`, { scope: '.tg-panel, .tg-key' })).map((x) => `${size}: ${x}`));
      await C.page.screenshot({ path: join(SHOTS, `panel-${size}.png`) });
      // 夜里：曜石黑上的月白字
      await C.page.evaluate(() => { window.__ks.setTime(21.5, true); });
      await C.page.waitForTimeout(2600);
      issues.push(...(await fit(C.page, `${size} 夜里的纸`, { scope: '.tg-panel, .tg-key' })).map((x) => `${size}: ${x}`));
      if (size === 'iphone' || size === 'se' || size === 'pc') await C.page.screenshot({ path: join(SHOTS, `panel-${size}-night.png`) });
      R.ok(`${size}：页面上没有报错`, real(C.logs).length === 0, real(C.logs).slice(0, 2).join(' | '));
      await C.ctx.close();
      await B.page.waitForTimeout(400);
    }
    R.ok('面板与那一枚：不出界、不截断、键够大、不相叠、字看得清', issues.length === 0, issues.slice(0, 6).join(' | '));
  }

  // ———— 十、园中天时：同游的人看同一个时辰、节气、天气——随最早来的那一位；人数连自己、暂离；同行时自己点了事不被吞掉 ————
  if (!args.has('--no-sky')) {
    console.log('十、园中天时');
    for (const x of [A2, B]) if (x) { await x.ctx.close(); pages.splice(pages.indexOf(x), 1); }
    A2 = null; B = null;
    await sleep(1000);
    // 甲在上海（东八区），先进来；乙在巴黎（冬天东一区，差七个钟头）。两页都不带 share=0：天时随园中
    const C = await open(browser, path('yard', ''), 'desk', { wait: 300, tz: 'Asia/Shanghai' });
    pages.push(C);
    R.ok('甲先进园', await online(C.page, 0));
    await C.page.waitForTimeout(1500);
    const D = await open(browser, path('yard', ''), 'iphone', { wait: 300, tz: 'Europe/Paris' });
    pages.push(D);
    R.ok('乙后进园，两边互相看见', (await online(D.page, 1)) && (await online(C.page, 1)));
    const sky = (p) => p.evaluate(() => {
      const k = window.__ks, v = window.__net.view, d = new Date();
      return { hour: k.atmos.hour, season: k.season, month: k.month, weather: k.atmos.weather, shared: !!k.shared, self: v.sky?.self ?? null, host: v.sky?.host ?? '', total: v.total, me: v.me.label, local: d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 };
    });
    const dh = (a, b) => Math.abs(((a - b + 36) % 24) - 12);
    const settle = (p) => p.waitForFunction(() => !!window.__ks.shared && !window.__ks.atmos.transitioning, null, { timeout: 20000 }).catch(() => {});
    await settle(D.page);
    await D.page.waitForTimeout(1500);
    const c1 = await sky(C.page), d1 = await sky(D.page);
    R.ok('甲最早来：天时随自己这里的此刻', c1.shared && c1.self === true && dh(c1.hour, c1.local) < 0.1, `甲 ${c1.hour.toFixed(2)}（本地 ${c1.local.toFixed(2)}）`);
    R.ok('乙那边随甲：时辰差不到一刻，季、月一样（乙本地差着七个钟头）', d1.shared && d1.self === false && dh(d1.hour, c1.hour) < 0.25 && d1.season === c1.season && d1.month === c1.month && dh(d1.local, c1.local) > 5,
      `甲 ${c1.hour.toFixed(2)} 乙 ${d1.hour.toFixed(2)}（乙本地 ${d1.local.toFixed(2)}）季 ${c1.season}/${d1.season} 月 ${c1.month}/${d1.month}`);
    const cCount = await C.page.textContent('[data-testid=tg-count]').catch(() => '');
    R.ok('人数连自己：两边都是二位', c1.total === 2 && d1.total === 2 && cCount === '二位', `${c1.total} ${d1.total} 「${cCount}」`);
    // 甲（最早来）的天时页：写着随你、天气能拨；拨了雨，乙那边也下起来
    await C.page.click('[data-testid=key-when]');
    await C.page.waitForSelector('[data-testid=sky-lock]', { timeout: 4000 }).catch(() => {});
    const cLock = await C.page.textContent('[data-testid=sky-lock]').catch(() => '');
    await C.page.click('[data-testid=weather-rain]').catch(() => {});
    const rained = await D.page.waitForFunction(() => window.__ks.atmos.weather === 'rain', null, { timeout: 8000 }).then(() => true, () => false);
    R.ok('甲的天时页写着随你、天气能拨；拨了雨，乙那边也下起雨来', /此刻是你/.test(cLock ?? '') && rained, cLock ?? '');
    await C.page.click('[data-testid=sheet-close]').catch(() => {});
    // 乙的天时页：写着随甲、那里快七个钟头；也能拨——拨了「夜」就是乙自己的天时（甲那边照旧），点「回到此刻」再随甲
    await D.page.click('[data-testid=key-when]');
    await D.page.waitForSelector('[data-testid=sky-lock]', { timeout: 4000 }).catch(() => {});
    const dLock = await D.page.evaluate(() => ({ text: document.querySelector('[data-testid=sky-lock]')?.textContent ?? '', open: [...document.querySelectorAll('[data-testid^=season-], [data-testid^=time-], [data-testid^=dial-]')].every((b) => !b.disabled), back: !!document.querySelector('[data-testid=sky-back-now]') }));
    await shotTo(D.page, 'sky-lock-phone');
    R.ok('乙的天时页写着随甲、那里快七个钟头；拨的几样都能拨，此刻随着园中（不出「回到此刻」）', dLock.open && !dLock.back && dLock.text.includes(c1.me.replace(/（.*$/, '')) && /快七个钟头/.test(dLock.text), dLock.text);
    const cBefore = await sky(C.page);
    await D.page.click('[data-testid=time-night]');
    await D.page.waitForTimeout(700);
    const dOwn = await D.page.evaluate(() => ({ shared: !!window.__ks.shared, own: window.__net.skyOwn, back: !!document.querySelector('[data-testid=sky-back-now]'), mode: window.__ks.timeMode }));
    const cAfter = await sky(C.page);
    R.ok('乙拨了「夜」：画里是乙自己的天时（不随园中了），出「回到此刻」；甲那边照旧', !dOwn.shared && dOwn.own && dOwn.back && dOwn.mode === 'night' && cAfter.shared && dh(cAfter.hour, cBefore.hour) < 0.3, JSON.stringify(dOwn));
    await D.page.click('[data-testid=sky-back-now]');
    await settle(D.page);
    await D.page.waitForTimeout(800);
    const dBack = await sky(D.page), cNow = await sky(C.page);
    R.ok('乙点「回到此刻」：又随甲（时辰、雨）', dBack.shared && dh(dBack.hour, cNow.hour) < 0.3 && dBack.weather === 'rain', `甲 ${cNow.hour.toFixed(2)} 乙 ${dBack.hour.toFixed(2)} ${dBack.weather}`);
    await D.page.click('[data-testid=sheet-close]').catch(() => {});
    await D.page.waitForTimeout(400);

    // 同行着、站在他身边，自己点了一件事：走过去做起来，不跟了（先前离他两三步以内时刚起步就被同行叫停，点什么都没反应）
    await placeAt(C.page, 8.6, 13.4, 0);
    await placeAt(D.page, 9.4, 14.6, Math.PI);
    await D.page.waitForTimeout(1500);
    const cId = await C.page.evaluate(() => window.__net.client.id);
    await D.page.evaluate((id) => window.__net.follow(id), cId);
    await D.page.waitForTimeout(1600);
    const before = await D.page.evaluate(() => window.__net.following);
    await D.page.evaluate(() => window.__ks.enterAct('xiang:恒'));
    const did = await D.page.waitForFunction(() => window.__ks.act?.id === 'xiang:恒', null, { timeout: 9000 }).then(() => true, () => false);
    const after = await D.page.evaluate(() => window.__net.following);
    R.ok('同行着、站在他身边，自己点了一件事：走过去做起来，不跟了', before === cId && did && after == null, `跟着 ${before}，做起来 ${did}，之后 ${after}`);
    await D.page.evaluate(() => window.__ks.exitAct());

    // 乙断了线（手机收起、切到别处）：甲那边记作暂离，人数不少；乙自己连回来：「回来了」，天时仍随甲
    const backNote = waitNote(C.page, /回来了/, 20000);
    await D.page.evaluate(() => window.__net.client.ws?.close());
    const awayOk = await C.page.waitForFunction(() => window.__net.view.away.length === 1 || window.__ui.ui.get().notes.some((n) => /回来了/.test(n.text)), null, { timeout: 8000, polling: 50 }).then(() => true, () => false);
    const cAway = await C.page.evaluate(() => ({ total: window.__net.view.total, away: window.__net.view.away.length, count: document.querySelector('[data-testid=tg-count]')?.textContent ?? '' }));
    R.ok('乙断了线：甲那边记作暂离，人数还是二位', awayOk && cAway.total === 2, JSON.stringify(cAway));
    const reD = await online(D.page, 1, 20000);
    R.ok('乙自己连回来：甲那边说「回来了」，不再暂离', reD && (await backNote) && (await C.page.evaluate(() => window.__net.view.away.length === 0)));
    await settle(D.page);
    await D.page.waitForTimeout(2500);
    const d2 = await sky(D.page), c2 = await sky(C.page);
    R.ok('乙回来排在后头：天时仍随甲（时辰、雨）', d2.self === false && dh(d2.hour, c2.hour) < 0.25 && d2.weather === 'rain', `甲 ${c2.hour.toFixed(2)} 乙 ${d2.hour.toFixed(2)} ${d2.weather}`);

    // 甲走了：乙排第一，天时随乙自己这里（巴黎）的此刻，天气还回乙自己的（晴）
    await C.ctx.close(); pages.splice(pages.indexOf(C), 1);
    await D.page.waitForFunction(() => window.__net.view.sky?.self === true, null, { timeout: 8000 }).catch(() => {});
    await D.page.waitForTimeout(600);
    await settle(D.page);
    await D.page.waitForTimeout(1500);
    const d3 = await sky(D.page);
    R.ok('甲走了：乙排第一，天时随乙自己这里的此刻，天气还回自己的', d3.self === true && dh(d3.hour, d3.local) < 0.25 && d3.weather === 'clear', `乙 ${d3.hour.toFixed(2)}（本地 ${d3.local.toFixed(2)}）${d3.weather}`);
    // 乙改成独游：天时还回自己的那一套——乙在园中拨过「夜」、又点了「回到此刻」：自己的那一套也回到了此刻（乙那里此刻的钟点）
    await D.page.click('[data-testid=tg-key]');
    await D.page.click('[data-testid=tg-off]');
    await D.page.waitForFunction(() => !window.__ks.shared, null, { timeout: 5000 }).catch(() => {});
    await D.page.waitForTimeout(300);
    await D.page.waitForFunction(() => !window.__ks.atmos.transitioning, null, { timeout: 20000 }).catch(() => {});
    const d4 = await sky(D.page);
    R.ok('乙改成独游：天时还回自己的——点过「回到此刻」，就是乙那里的此刻', !d4.shared && dh(d4.hour, d4.local) < 0.3, `${d4.hour.toFixed(2)}（本地 ${d4.local.toFixed(2)}）${d4.season}`);
    const skyErrs = real(D.logs);
    R.ok('园中天时这一段没有报错', skyErrs.length === 0, skyErrs.slice(0, 3).join(' | '));
    await D.ctx.close(); pages.splice(pages.indexOf(D), 1);
  }
  }

  // ———— 九、十个人围着走：量开销 ————
  if (!args.has('--no-perf')) {
    console.log('九、十个人');
    if (B) { await B.ctx.close(); pages.splice(pages.indexOf(B), 1); }
    if (!A2) { A2 = await page('desk'); pages.push(A2); await online(A2.page, 0); }
    await placeAt(A2.page, 22, 80, Math.PI * 0.85);
    await A2.page.waitForTimeout(2500);
    const measure = (ms) => A2.page.evaluate(async (ms) => {
      const k = window.__ks, t = window.__net, w = k.world, orig = w.render;
      const rs = [], per = [], ticks = [];
      w.render = function () { const s = performance.now(); orig.call(this); rs.push(performance.now() - s); };
      // 每帧所有 tick 加起来（世界的逻辑）
      const tk = w.tick.slice(); w.tick.length = 0;
      w.tick.push((dt, tt) => { const s = performance.now(); for (const f of tk) f(dt, tt); ticks.push(performance.now() - s); });
      const p0 = { ...t.perf };
      let lm = t.perf.ms, lf = t.perf.frames;
      const t0 = performance.now();
      await new Promise((res) => { const f = () => { if (t.perf.frames !== lf) { per.push((t.perf.ms - lm) / (t.perf.frames - lf)); lm = t.perf.ms; lf = t.perf.frames; } if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      w.render = orig; w.tick.length = 0; w.tick.push(...tk);
      const p1 = t.perf, n = Math.max(1, p1.frames - p0.frames);
      const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
      const avg = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
      return { frames: n, net: (p1.ms - p0.ms) / n, net50: q(per, 0.5), net90: q(per, 0.9), figs: (p1.figs - p0.figs) / n, tick: avg(ticks), tick90: q(ticks, 0.9), render: avg(rs), render90: q(rs, 0.9), tris: w.stats.tris, calls: w.stats.calls, shown: [...t.remotes.values()].filter((r) => r.shown).length, inView: [...t.remotes.values()].filter((r) => r.inView).length, fps: n / (ms / 1000) };
    }, ms);
    const base = await measure(6000);
    const me = await info(A2.page);
    const bots = [];
    for (let i = 0; i < 10; i++) {
      const ws = new WebSocket(WS, { origin: ORIGIN });
      const bt = { ws, t0: Date.now(), timer: 0 };
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'hi', v: 1, n: [(i * 3) % 32, (i * 5) % 16], c: i % 8 }));
        bt.timer = setInterval(() => {
          const tt = (Date.now() - bt.t0) / 1000, r = 2.5 + i * 0.8, w = 1.3 / r, ang = tt * w + i * 0.63;
          const x = me.pos[0] + Math.cos(ang) * r, z = me.pos[2] - 4 + Math.sin(ang) * r, yaw = Math.atan2(-Math.sin(ang), Math.cos(ang));
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: 's', d: [Date.now() - bt.t0, +x.toFixed(2), +me.pos[1].toFixed(2), +z.toFixed(2), +yaw.toFixed(3), 1.3, 5, -1, 0, 0] }));
        }, 125);
      });
      ws.on('error', () => {});
      bots.push(bt);
    }
    await A2.page.waitForFunction(() => [...window.__net.remotes.values()].filter((r) => r.shown).length >= 10, null, { timeout: 15000 }).catch(() => {});
    await A2.page.waitForTimeout(2500);
    await A2.page.screenshot({ path: join(SHOTS, 'crowd-desk.png') });
    const ten = await measure(6000);
    for (const bt of bots) { clearInterval(bt.timer); bt.ws.close(); }
    const fmt = (m) => `net ${m.net.toFixed(3)}（中位 ${m.net50.toFixed(3)}、九成 ${m.net90.toFixed(3)}）· 逻辑 ${m.tick.toFixed(2)} · 绘制 CPU ${m.render.toFixed(2)}（九成 ${m.render90.toFixed(2)}）毫秒 · ${m.tris} 三角 ${m.calls} 次绘制 · 画出 ${m.shown} 人（画面里 ${m.inView}）· ${m.fps.toFixed(0)} 帧/秒 · 每帧重摆 ${m.figs.toFixed(1)} 个身子`;
    console.log(`  没人：${fmt(base)}`);
    console.log(`  十人：${fmt(ten)}`);
    R.ok('十个人都画出来了', ten.shown >= 10, `${ten.shown}`);
    R.ok('十个人时同游每帧不到 1.5 毫秒（含十个身子的重摆）', ten.net < 1.5, `${ten.net.toFixed(3)} 毫秒`);
    R.ok('多出来的绘制次数不超过二十', ten.calls - base.calls <= 20, `${base.calls} → ${ten.calls}`);
    const gone = await A2.page.waitForFunction(() => window.__net.remotes.size === 0, null, { timeout: 8000 }).then(() => true, () => false);
    R.ok('机器人都走了：一个不剩', gone);
  }
} catch (e) {
  console.error(e);
  R.ok('跑完没有出意外', false, String(e?.message ?? e).slice(0, 300));
} finally {
  await cleanup();
}
console.log(`截图在 ${SHOTS}`);
process.exit(R.done() ? 1 : 0);
