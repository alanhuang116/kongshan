// 器物游戏：每一样从几步外走过去 → 从头玩到尾（用界面会发的那些指令：按下 / 松开、点画面、点签）→ 看记分记对了没有 →
// 退出以后人站得起来、能走，身子回到原处（不挂在秋千、船上），镜头回到身后；有没有报错（只看这一路的）。
// 还看两样不用点的：柴门（人走近自己开、走远了掩上）、风铃（风一起自己响）。
// 用法：KS_URL=http://localhost:3818/world.html node tests/play/games.mjs [swing,pitchpot,…] [--shots]
import { launch, open, dir, Report } from './lib.mjs';
import { join } from 'node:path';

const args = process.argv.slice(2), shots = args.includes('--shots');
const only = args.find((a) => !a.startsWith('--'))?.split(',') ?? null;
const R = new Report(), d = dir('games');
const browser = await launch();
const mine = (l) => /play\/|acts\/(swing|gate|pitchpot|fishing|boat|kite|skip|lantern|snowman|broom|chime)|器物游戏/.test(l) && !/GPU stall|ReadPixels/.test(l);

/**
 * 一样游戏：处、时、季、天，怎么玩（在页面里跑的一段，返回一份结果），怎么验
 * play 段里能用：k（世界）、wait(ms)、until(fn, ms)、act()（此刻的 state）、W（行走图）
 */
const GAMES = [
  {
    id: 'swing', q: { s: 'village', t: '10' },
    play: async ({ k, wait, until }) => {
      await until(() => k.act?.state?.meter, 6000);
      // 每到「刚过头」那一段就蹬一下
      const tm = setInterval(() => { const m = k.act?.state?.meter; if (m && m.v > 0.02 && m.v < 0.12) k.cmd('kick', 'down'); }, 40);
      k.cmd('kick', 'down');
      await wait(14000);
      clearInterval(tm);
      const deg = Math.round(Math.abs(k.build.parts.swingSeat.rotation.x) * 57.3), during = k.player.av.root.parent?.name;
      k.cmd('done');
      await until(() => k.act?.state?.done, 30000);
      return { during, deg, text: k.act?.state?.text, mem: k.mem.get('play', {}).swing };
    },
    check: (r) => [['荡起来了（人挂在秋千上）', r.during === 'play:carry:swing'], ['刹住、记了最高的角度', r.mem?.best >= 30 && r.mem?.n >= 1, `best=${r.mem?.best}`], ['结果说了几度', /度/.test(r.text ?? '')]],
  },
  {
    id: 'pitchpot', q: { s: 'yard', t: '10' },
    play: async ({ k, wait, until }) => {
      let hold = false, n = 0;
      const tm = setInterval(() => {
        const s = k.act?.state; if (!s) return;
        if (s.hold && !hold) { if (Math.abs(s.aim) > 0.002) { k.cmd('aim', -s.aim * 0.8); return; } hold = true; k.cmd('throw', 'down'); return; }
        if (hold && s.meter && s.meter.lo != null) { const mid = (s.meter.lo + s.meter.hi) / 2; if (Math.abs(s.meter.v - mid) < 0.02) { k.cmd('throw', 'up'); hold = false; n++; } }
      }, 16);
      await until(() => k.act?.state?.done, 70000);
      clearInterval(tm);
      return { n, text: k.act?.state?.text, mem: k.mem.get('play', {}).pot };
    },
    check: (r) => [['十二支投完', r.n >= 12, `n=${r.n}`], ['按《投壶新格》计筭', r.mem?.best > 30 && r.mem?.n === 1, `best=${r.mem?.best}`], ['结果里有筭或全壶', /筭|全壶/.test(r.text ?? '')]],
  },
  {
    id: 'fishing', q: { s: 'bridge', t: 'dawn' },
    play: async ({ k, until }) => {
      await until(() => k.act?.state?.hold?.id === 'cast', 6000);
      k.cmd('cast', 'down'); await new Promise((r) => setTimeout(r, 600)); k.cmd('cast', 'up');
      const tm = setInterval(() => {
        const s = k.act?.state; if (!s) return;
        if (s.meter?.label === '沉' && s.meter.v > 0.6 && s.meter.v < 0.95) k.cmd('cast', 'down');
        if (s.hold?.id === 'lift' && s.meter) { if (s.meter.v < 0.5) k.cmd('lift', 'down'); else if (s.meter.v > 0.68) k.cmd('lift', 'up'); }
        if (s.choices?.some((c) => c.id === 'recast')) k.cmd('recast');
        if (s.hold?.id === 'cast' && !s.meter?.label?.includes('沉') && s.hint && /再抛|鱼篓|游回/.test(s.hint)) { k.cmd('cast', 'down'); setTimeout(() => k.cmd('cast', 'up'), 600); }
      }, 30);
      await until(() => k.act?.state?.choices?.some((c) => c.id === 'creel'), 90000);
      clearInterval(tm);
      const before = k.bag.count('fish');
      k.cmd('creel');
      return { got: k.bag.count('fish') - before, mem: k.mem.get('play', {}).fish };
    },
    check: (r) => [['钓上一尾，收进行囊', r.got === 1], ['记了钓上几尾、几寸', r.mem?.got >= 1 && r.mem?.best >= 2, JSON.stringify(r.mem ?? {})]],
  },
  {
    id: 'boat', q: { s: 'ferry', t: '10' }, long: true,
    play: async ({ k, until }) => {
      await until(() => k.act?.state?.meter, 6000);
      const boat = k.world.scene.getObjectByName('play:boat');
      // 摇：推到头松、拉到头按；转向：朝着签（竹篙 / 栈桥）
      const tm = setInterval(() => {
        const s = k.act?.state; if (!s?.meter) return;
        if (s.meter.lo > 0.5 && s.meter.v > 0.97) k.cmd('row', 'up'); else if (s.meter.lo < 0.5 && s.meter.v < 0.03) k.cmd('row', 'down');
        const t = s.tags?.[0]; if (!t) return;
        let dd = Math.atan2(t.x - boat.position.x, t.z - boat.position.z) - boat.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        window.dispatchEvent(new KeyboardEvent(dd > 0.06 ? 'keydown' : 'keyup', { key: 'ArrowLeft' }));
        window.dispatchEvent(new KeyboardEvent(dd < -0.06 ? 'keydown' : 'keyup', { key: 'ArrowRight' }));
      }, 40);
      k.cmd('row', 'down');
      let viewed = false;
      await until(() => { if (k.act?.state?.lines) viewed = true; return k.act?.state?.done; }, 240000);
      clearInterval(tm);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
      return { viewed, text: k.act?.state?.text, mem: k.mem.get('play', {}).boat };
    },
    check: (r) => [['绕到竹篙那里停了一停（南望伊阙）', r.viewed], ['摇回来泊好、记了一趟几秒', r.mem?.n === 1 && r.mem?.best > 20, `best=${r.mem?.best}`]],
  },
  {
    id: 'kite', q: { s: 'ferry', t: '10', season: 'spring' },
    play: async ({ k, wait, until }) => {
      await until(() => k.act?.state?.hold?.id === 'let', 6000);
      const { U } = await import('/src/world/ink/ink.ts');
      const w = U.uWind.value, p = k.player.pos;
      k.setRun(true); k.player.goTo(p.x - w.x * 30, p.z - w.y * 30);
      await until(() => (k.act?.state?.meter?.v ?? 0) >= 0.66, 6000);
      k.cmd('let', 'down');
      await wait(200); k.setRun(false); k.player.stop();
      const tm = setInterval(() => { const m = k.act?.state?.meter; if (!m || m.label !== '劲') return; if (m.v > 0.62) k.cmd('let', 'down'); else if (m.v < 0.48) k.cmd('let', 'up'); }, 50);
      await wait(20000);
      clearInterval(tm); k.cmd('let', 'up');
      const flew = /米高/.test(k.act?.state?.hint ?? '') || !!k.act?.state?.text;
      if (k.act?.state?.choices?.some((c) => c.id === 'reel')) k.cmd('reel');
      await until(() => k.act?.state?.done || k.act?.state?.choices?.some((c) => c.id === 'again'), 40000);
      return { flew, text: k.act?.state?.text, mem: k.mem.get('play', {}).kite };
    },
    check: (r) => [['迎风跑起来放上去了', r.flew], ['记了最高几米', r.mem?.n >= 1 && r.mem?.best >= 5, `best=${r.mem?.best}`]],
  },
  {
    id: 'skip', q: { s: 'ferry', t: '10' }, from: [132.5, 227.2],
    play: async ({ k, until }) => {
      await until(() => k.act?.state?.choices?.some((c) => c.id === 'pick'), 6000);
      k.cmd('pick');
      let ch = false;
      const tm = setInterval(() => {
        const m = k.act?.state?.meter; if (!m) return;
        if (m.label === '角' && m.v > 0.2 && m.v < 0.3) k.cmd('go', 'down');
        else if (m.label === '劲' && !ch) { ch = true; k.cmd('go', 'down'); }
        else if (m.label === '劲' && ch && m.v > 0.82 && m.v < 0.92) { k.cmd('go', 'up'); ch = false; }
      }, 16);
      await until(() => k.act?.state?.choices?.some((c) => c.id === 'again'), 30000);
      clearInterval(tm);
      return { count: k.act?.state?.count, text: k.act?.state?.text, mem: k.mem.get('play', {}).skip };
    },
    check: (r) => [['甩出去漂了几下', (r.count ?? 0) >= 2, `${r.count} 下`], ['记了最多几下', r.mem?.best === r.count && r.mem?.n === 1]],
  },
  {
    id: 'lantern', q: { s: 'yard', t: '20.5' },
    play: async ({ k, until }) => {
      await until(() => k.act?.state?.tags?.length === 3, 6000);
      for (const id of ['hallE', 'hallW', 'gate']) { k.cmd('tag', id); await until(() => k.act?.state?.tags?.find((t) => t.id === id)?.kind === 'done', 30000); }
      await until(() => k.act?.state?.done, 5000);
      return { text: k.act?.state?.text, mem: k.mem.get('play', {}).lantern };
    },
    check: (r) => [['三盏都点亮了', r.mem?.lit?.every(Boolean) && r.mem?.n === 1, JSON.stringify(r.mem?.lit)], ['记进了那一晚', /三盏/.test(r.text ?? '')]],
  },
  {
    id: 'snowman', q: { s: 'yard', t: '10', season: 'winter', w: 'snow' },
    play: async ({ k, wait, until }) => {
      await until(() => k.act?.state?.steps, 6000);
      const go = async (x, z, ms) => { k.player.goTo(x, z); await wait(ms); };
      await go(-1.5, 6.5, 5500); await go(1.8, 8.5, 4000); await go(-1.2, 12.5, 5000);
      k.cmd('stand');
      await go(1.5, 10.5, 4000); await go(-0.3, 12.0, 3600);
      k.cmd('stack'); await wait(300); k.cmd('head'); await wait(200);
      k.cmd('twigs'); k.cmd('eyes'); k.cmd('hat'); await wait(200);
      k.cmd('finish');
      return { done: !!k.act?.state?.done, mem: k.mem.get('play', {}).snowman };
    },
    check: (r) => [['滚了底座、身子，捏了头', r.done && r.mem?.man?.r?.every((x) => x > 0.15)], ['插了树枝、点了炭、戴了斗笠，存进院里', r.mem?.man?.hat && r.mem?.man?.twigs && r.mem?.man?.eyes && r.mem?.n === 1]],
  },
  {
    id: 'broom', q: { s: 'yard', t: '10', season: 'autumn' },
    play: async ({ k, until }) => {
      await until(() => k.act?.state?.hold, 6000);
      // 一行一行地扫：从西往东扫到堆边、从东往西扫到堆边，再往老梅底下那一堆带
      const P = [7.8, 12.6], route = [];
      for (const z of [4.6, 7.2, 9.8, 14.2, 15.3, 6.0, 11.4]) route.push([-3.2, z], [P[0] - 1.2, z], [P[0] - 0.5, P[1] - 0.2], [13.6, z], [P[0] + 1.2, z], [P[0] + 0.5, P[1] + 0.2]);
      let i = 0;
      const tm = setInterval(() => { if (!k.player.walking && k.act) { const p = route[i++ % route.length]; k.player.goTo(p[0], p[1]); } }, 200);
      await until(() => k.act?.state?.done, 220000);
      clearInterval(tm);
      return { text: k.act?.state?.text, prog: k.act?.state?.progress, mem: k.mem.get('play', {}).sweep };
    },
    check: (r) => [['落叶扫成一堆', /一堆/.test(r.text ?? ''), r.text ?? `扫了${Math.round((r.prog ?? 0) * 100)}%`], ['记了今天扫过', r.mem?.n === 1 && r.mem?.kind === 'leaf']],
  },
  {
    id: 'chime', q: { s: 'pavilion', t: '10' },
    play: async ({ k, wait, until }) => {
      const rung = [], o = k.events.sfx;
      k.events.sfx = (n, op) => { if (n === 'eaveBell') rung.push(n); o?.(n, op); };
      await wait(1500);
      k.act?.input?.tap?.(); await wait(1300); k.act?.input?.tap?.(); await wait(1300);
      await until(() => k.act?.state?.lines, 5000);
      return { rung: rung.length, lines: k.act?.state?.lines };
    },
    check: (r) => [['拨一下就响', r.rung >= 2, `${r.rung} 声`], ['拨过三下，念一联', (r.lines ?? []).length === 2]],
  },
];

for (const G of GAMES) {
  if (only && !only.includes(G.id)) continue;
  const { page, ctx, logs } = await open(browser, { ...G.q, ui: '0' });
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  const ok = await page.evaluate((id) => !!window.__ks.acts[id] && (window.__ks.things.find((t) => t.id === id)?.on?.() ?? true), G.id);
  R.ok(`${G.id}：此刻有、备好了`, ok);
  if (!ok) { await ctx.close(); continue; }
  // 从几步外走过去
  const from = await page.evaluate(([id, f0]) => {
    const k = window.__ks, a = k.acts[id], W = window.__walk;
    let sx = a.spot.x, sz = a.spot.z;
    if (f0) { sx = f0[0]; sz = f0[1]; } else for (let i = 0; i < 24; i++) { const x = a.spot.x + Math.cos(i * 0.9) * (3 + (i % 3)), z = a.spot.z + Math.sin(i * 0.9) * (3 + (i % 3)); if (W.standable(x, z) != null && W.findPath(x, z, W.groundAt(x, z), a.spot.x, a.spot.z)) { sx = x; sz = z; break; } }
    k.player.teleport(sx, sz, 0); k.nav.snapBehind();
    k.enterAct(id);
    return [+sx.toFixed(1), +sz.toFixed(1)];
  }, [G.id, G.from ?? null]);
  let started = false;
  for (let i = 0; i < 80 && !started; i++) { await page.waitForTimeout(250); started = await page.evaluate((id) => window.__ks.act?.id === id, G.id); }
  R.ok(`${G.id}：走得到、开始`, started, `自 (${from})`);
  if (!started) { await ctx.close(); continue; }
  if (shots) await page.screenshot({ path: join(d, `${G.id}_0.png`) });
  const res = await page.evaluate(async (src) => {
    const k = window.__ks, W = window.__walk, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { try { if (fn()) return true; } catch { /* 还没好 */ } await wait(50); } return false; };
    const fn = eval(`(${src})`);
    try { return await fn({ k, W, wait, until }); } catch (e) { return { error: String(e?.stack ?? e) }; }
  }, G.play.toString());
  if (res.error) R.ok(`${G.id}：玩的时候出错`, false, res.error.slice(0, 300));
  for (const [name, pass, note] of G.check(res)) R.ok(`${G.id}：${name}`, pass, note ?? '');
  if (shots) await page.screenshot({ path: join(d, `${G.id}_1.png`) });
  // 退出：人站起来能走、身子回到场景里、镜头回到身后
  await page.evaluate(() => { const k = window.__ks; if (k.act) k.cmd('done'); if (k.act) k.exitAct(); });
  await page.waitForTimeout(2200);
  const end = await page.evaluate(() => { const k = window.__ks, r = k.player.av.root; return { act: k.act?.id ?? null, pose: k.player.av.pose, locked: k.player.locked, parent: r.parent === k.world.scene, rx: Math.abs(r.rotation.x), pose2: k.nav.inPose, x: k.player.pos.x, z: k.player.pos.z }; });
  R.ok(`${G.id}：退出后站起来、能走`, !end.act && end.pose === 'stand' && !end.locked, `act=${end.act} 姿势=${end.pose} 锁着=${end.locked}`);
  R.ok(`${G.id}：身子回到原处、镜头回到身后`, end.parent && end.rx < 1e-6 && !end.pose2, `挂在场景上=${end.parent} 前倾=${end.rx.toFixed(3)} 机位=${end.pose2}`);
  // 退出以后真能走：前后左右各走一下（栈桥上朝水的那一边走不动），取走得最远的
  const moved = await page.evaluate(async () => {
    const k = window.__ks; let best = 0;
    for (const [x, y] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const p0 = k.player.pos.clone(); k.keyMove.set(x, y); await new Promise((r) => setTimeout(r, 700)); k.keyMove.set(0, 0); best = Math.max(best, k.player.pos.distanceTo(p0)); if (best > 0.4) break; }
    return best;
  });
  R.ok(`${G.id}：退出后往前走得动`, moved > 0.4, `${moved.toFixed(2)} 米`);
  const errs = logs.filter(mine);
  R.ok(`${G.id}：这一路没有报错`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// —— 柴门：人走近自己开，走远了掩上 ——
if (!only || only.includes('gate')) {
  const { page, ctx, logs } = await open(browser, { s: 'yard', t: '10', ui: '0' });
  const r = await page.evaluate(async () => {
    const k = window.__ks, L = k.build.parts.gateL, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    k.player.teleport(0.3, 25, Math.PI); k.nav.snapBehind(); await wait(3500);
    const far = L.rotation.y;
    k.player.teleport(0.3, 17.4, Math.PI); await wait(1600);
    const near = L.rotation.y;
    k.player.teleport(0.3, 25, Math.PI); await wait(3800);
    return { far, near, back: L.rotation.y, open: L.userData.open };
  });
  R.ok('柴门：人不在门口时掩着', Math.abs(r.far) < 0.05, r.far.toFixed(2));
  R.ok('柴门：人走近了自己开', Math.abs(r.near - r.open) < 0.25, r.near.toFixed(2));
  R.ok('柴门：走远了轻轻掩上', Math.abs(r.back) < 0.05, r.back.toFixed(2));
  const errs = logs.filter(mine);
  R.ok('柴门：没有报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
