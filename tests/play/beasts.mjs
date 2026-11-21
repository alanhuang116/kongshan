// 生灵：每一件与动物有关的事都能从几步外走过去、做完、站起来能走；一整天快进（四季各一天）不出错；几样习性对不对。
// 用法：KS_URL=http://localhost:3814/world.html node tests/play/beasts.mjs [事的 id，逗号分开 | day | habits]
// 截图在 shots/beasts/
import { launch, dir, Report } from './lib.mjs';
import { join } from 'node:path';

const BASE = process.env.KS_URL ?? 'http://localhost:3801/world.html';
const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--'))?.split(',') ?? null;
const R = new Report(), d = dir('beasts');
const browser = await launch();
const want = (id) => !only || only.includes(id);

async function open(q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /出错|没能|没备好|没接上/.test(m.text()))) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 600)}`));
  const p = new URLSearchParams({ hud: '0', t: 'day', w: 'clear', season: 'spring', q: 'mid', ...q });
  await page.goto(`${BASE}?${p}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  const ok = await page.evaluate(() => !!window.__ks?.life?.fauna);
  return { page, ctx, logs, ok };
}
const errsOf = (logs) => logs.filter((l) => !/404|Failed to load resource|toNonIndexed/.test(l));
/** 从几步外走过去开始这件事；返回开始了没有 */
async function start(page, id) {
  await page.evaluate((id) => {
    const k = window.__ks, a = k.acts[id], W = window.__walk;
    a.on?.();
    let sx = a.spot.x, sz = a.spot.z;
    // 挑一处路近的（隔着篱笆的不算）
    let best = 1e9;
    for (let i = 0; i < 24; i++) {
      const x = a.spot.x + Math.cos(i * 0.9) * (3 + (i % 3)), z = a.spot.z + Math.sin(i * 0.9) * (3 + (i % 3));
      if (W.standable(x, z) == null) continue;
      const path = W.findPath(x, z, W.groundAt(x, z), a.spot.x, a.spot.z);
      if (!path) continue;
      let L = 0, px = x, pz = z; for (const [qx, qz] of path) { L += Math.hypot(qx - px, qz - pz); px = qx; pz = qz; }
      if (L < best) { best = L; sx = x; sz = z; }
      if (L < 7) break;
    }
    k.player.teleport(sx, sz, 0); k.nav.snapBehind();
    k.enterAct(id);
  }, id);
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(250); if (await page.evaluate((id) => window.__ks.act?.id === id, id)) return true; }
  return false;
}
const cmd = (page, c, arg) => page.evaluate(([c, arg]) => window.__ks.cmd(c, arg), [c, arg]);
const st = (page) => page.evaluate(() => { const s = window.__ks.act?.state ?? {}; return { id: window.__ks.act?.id ?? null, done: !!s.done, text: String(s.text ?? ''), hint: String(s.hint ?? ''), count: s.count ?? null }; });
async function finish(page, id, tag) {
  await cmd(page, 'done');
  await page.waitForTimeout(1400);
  const end = await page.evaluate(() => ({ act: window.__ks.act?.id ?? null, pose: window.__ks.player.av.pose, locked: window.__ks.player.locked }));
  R.ok(`${tag}：做完了站起来、能走`, !end.act && end.pose === 'stand' && !end.locked, `act=${end.act} 姿势=${end.pose} 锁着=${end.locked}`);
}

const PLAN = {
  async hens(page) {
    await cmd(page, 'bran'); await page.waitForTimeout(300);
    await cmd(page, 'throw', 'down'); await page.waitForTimeout(5200); await cmd(page, 'throw', 'up');
    await page.waitForTimeout(1500);
    const s = await st(page), near = await page.evaluate(() => { const H = window.__ks.life.fauna.hens; return H.homeBirds().filter((b) => b.st === 13).length; });
    await page.screenshot({ path: join(d, 'hens.png') });
    R.ok('喂鸡：撒了四把', s.done, `count=${s.count} 正在抢食的鸡 ${near} 只`);
  },
  async eggs(page) {
    const before = await page.evaluate(() => window.__ks.bag.count('egg'));
    for (let i = 0; i < 4; i++) { await cmd(page, 'tag', 'e0'); await page.waitForTimeout(1800); }
    await page.screenshot({ path: join(d, 'eggs.png') });
    const after = await page.evaluate(() => ({ n: window.__ks.bag.count('egg'), left: window.__ks.life.fauna.hens.eggs }));
    R.ok('捡蛋：蛋进了行囊', after.n > before && after.left === 0, `${before} → ${after.n}，窝里还剩 ${after.left}`);
  },
  async fishFeed(page) {
    for (let i = 0; i < 3; i++) { await cmd(page, 'toss'); await page.waitForTimeout(1300); }
    await page.waitForTimeout(2500);
    const n = await page.evaluate(() => window.__ks.life.fauna.fish.feeding);
    await page.screenshot({ path: join(d, 'fishFeed.png') });
    R.ok('喂鱼：鱼聚过来', n >= 2, `聚着 ${n} 条`);
  },
  async dog(page) {
    await page.waitForTimeout(2500);
    await cmd(page, 'pat', 'down'); await page.waitForTimeout(7500);
    await page.screenshot({ path: join(d, 'dog-lean.png') });
    await page.waitForTimeout(5500);
    const s = await st(page);
    await page.screenshot({ path: join(d, 'dog-belly.png') });
    await cmd(page, 'pat', 'up');
    R.ok('摸狗：摸到它翻肚皮', s.done, s.text.slice(0, 30));
  },
  async cat(page) {
    for (let i = 0; i < 4; i++) { await cmd(page, 'wave', 'down'); await page.waitForTimeout(1800); await cmd(page, 'wave', 'up'); await page.waitForTimeout(2600); if ((await st(page)).done) break; }
    await page.screenshot({ path: join(d, 'cat.png') });
    const s = await st(page);
    R.ok('逗猫：扑了三回', s.done, `count=${s.count}`);
  },
  async ducks(page) {
    // 绕到鸭子西边，一步一步往东（栏口）赶
    for (let i = 0; i < 40; i++) {
      const r = await page.evaluate(() => {
        const k = window.__ks, D = k.life.fauna.ducks, c = D.center(new k.world.camera.position.constructor());
        if (D.inPen >= D.total) return { n: D.inPen, T: D.total };
        const gx = D.pen.gate.x, gz = D.pen.gate.z - 0.4, dx = c.x - gx, dz = c.z - gz, l = Math.hypot(dx, dz) || 1;
        k.player.goTo(c.x + (dx / l) * 2.6, c.z + (dz / l) * 2.6, { r: 0.3 });
        return { n: D.inPen, T: D.total };
      });
      if (r.n >= r.T) break;
      await page.waitForTimeout(900);
    }
    await page.screenshot({ path: join(d, 'ducks.png') });
    const r = await page.evaluate(() => ({ n: window.__ks.life.fauna.ducks.inPen, T: window.__ks.life.fauna.ducks.total }));
    R.ok('赶鸭：都赶进了栏', r.n === r.T, `${r.n}/${r.T}`);
  },
  async ants(page) {
    await page.waitForTimeout(4000); await page.screenshot({ path: join(d, 'ants.png') });
    await page.mouse.click(640, 380); await page.waitForTimeout(800);
    const s = await st(page);
    R.ok('观蚁：看完了', s.text.length > 0, s.text.slice(0, 20));
  },
  async oxHay(page) {
    await cmd(page, 'grab'); await page.waitForTimeout(1800);
    await cmd(page, 'put'); await page.waitForTimeout(3800);
    const s = await st(page), eat = await page.evaluate(() => window.__ks.life.fauna.ox.eat);
    await page.screenshot({ path: join(d, 'oxHay.png') });
    R.ok('添草：牛吃起来', s.done && eat > 0, `eat=${eat}`);
  },
  async henCatch(page) {
    await page.waitForTimeout(1600);
    const held = await page.evaluate(() => window.__ks.life.fauna.hens.lost.state);
    await page.screenshot({ path: join(d, 'henCatch-carry.png') });
    await page.evaluate(() => { const k = window.__ks, h = k.life.fauna.hens.lost.home; k.player.teleport(h.x + 1.5, h.z + 1.5, 0); k.nav.snapBehind(); });
    await page.waitForTimeout(800);
    await cmd(page, 'put'); await page.waitForTimeout(1600);
    const back = await page.evaluate(() => window.__ks.life.fauna.hens.lost.state);
    R.ok('抱鸡：抱起来、送回去', held === 'held' && back === 'back', `抱着时 ${held}，放下后 ${back}`);
  },
};
const WHERE = {
  hens: { s: 'yard', t: '9' }, eggs: { s: 'yard', t: '10.6' }, fishFeed: { s: 'pavilion', t: '10' }, dog: { s: 'village', t: '10' }, cat: { s: 'yard', t: '11' },
  ducks: { s: 'village', t: '17.9' }, ants: { s: 'yard', t: '14', season: 'summer' }, oxHay: { s: 'village', t: '10', season: 'winter' }, henCatch: { s: 'village', t: '10' },
};

for (const id of Object.keys(PLAN)) {
  if (!want(id)) continue;
  const { page, ctx, logs, ok } = await open(WHERE[id]);
  if (!ok) { R.ok(`${id}：生灵备好了`, false, errsOf(logs).slice(0, 2).join(' | ')); await ctx.close(); continue; }
  if (id === 'henCatch') await page.evaluate(() => { const k = window.__ks, p = k.player.pos; k.life.fauna.hens.stray(p.x + 3, p.z + 2); });
  if (id === 'ducks') await page.waitForTimeout(2500);
  const exists = await page.evaluate((id) => !!window.__ks.acts[id] && (window.__ks.acts[id].on?.() ?? true), id);
  if (!exists) { R.ok(`${id}：此刻有这件事`, false, '没有（或 on() 为假）'); await ctx.close(); continue; }
  const started = await start(page, id);
  R.ok(`${id}：走得到、开始做`, started);
  if (started) { try { await PLAN[id](page); } catch (e) { R.ok(`${id}：流程`, false, String(e.message).slice(0, 120)); } await finish(page, id, id); }
  const errs = errsOf(logs);
  R.ok(`${id}：没有报错`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// —— 一整天快进：四季各一天，时辰一刻一刻地拨过去，看生灵出不出错、花多少毫秒 ——
if (want('day')) {
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    const { page, ctx, logs, ok } = await open({ s: 'village', t: '0', season });
    if (!ok) { R.ok(`一整天（${season}）：生灵备好了`, false); await ctx.close(); continue; }
    const r = await page.evaluate(async () => {
      const k = window.__ks, F = k.life.fauna, out = { maxMs: 0, sum: 0, n: 0, seen: {} };
      const spots = [[20, 30], [54, 14], [8, 0], [130, 10], [60, 28], [7, -15]];
      for (let h = 0; h < 24; h += 0.25) {
        k.setTime(h, true);
        const [x, z] = spots[Math.floor(h * 4) % spots.length]; k.player.teleport(x, z, 0); k.nav.snapBehind();
        await new Promise((res) => setTimeout(res, 120));
        out.maxMs = Math.max(out.maxMs, F.ms); out.sum += F.ms; out.n++;
        if (F.sheep.present) out.seen.sheep = (out.seen.sheep ?? 0) + 1;
        if (F.donkey.present) out.seen.donkey = (out.seen.donkey ?? 0) + 1;
        if (F.ducks.inPen === F.ducks.total) out.seen.duckPen = (out.seen.duckPen ?? 0) + 1;
      }
      return out;
    });
    const errs = errsOf(logs);
    R.ok(`一整天（${season}）：没有报错`, errs.length === 0, errs.slice(0, 2).join(' | '));
    R.ok(`一整天（${season}）：羊、驴白天在外，鸭子夜里进栏`, (r.seen.sheep ?? 0) > 10 && (r.seen.donkey ?? 0) > 10 && (r.seen.duckPen ?? 0) > 10, JSON.stringify(r.seen));
    R.ok(`一整天（${season}）：生灵每帧不超过约一毫秒（平均）`, r.sum / r.n < 1.2, `平均 ${(r.sum / r.n).toFixed(2)}ms，最多 ${r.maxMs.toFixed(2)}ms`);
    await ctx.close();
  }
}

// —— 几样习性 ——
if (want('habits')) {
  const { page, ctx, logs, ok } = await open({ s: 'village', t: '10' });
  if (ok) {
    // 跑过鸡群：惊散（甲家门前）
    const r = await page.evaluate(async () => {
      const k = window.__ks, H = k.life.fauna.hens, A = { x: 53.6, z: 14.4 };
      k.player.teleport(A.x - 8, A.z + 1, Math.PI / 2); k.nav.snapBehind();
      await new Promise((res) => setTimeout(res, 800));
      k.setRun(true); k.player.goTo(A.x + 6, A.z + 1, { r: 0.3 });
      let fled = 0;
      for (let i = 0; i < 30; i++) { await new Promise((res) => setTimeout(res, 100)); fled = Math.max(fled, H['flocks'][1].birds.filter((b) => b.st === 8).length); }
      k.setRun(false);
      return { fled };
    });
    R.ok('跑过鸡群，鸡扑腾着惊散', r.fled >= 2, `惊起 ${r.fled} 只`);
    // 狗认得人：走近了迎过来
    const g = await page.evaluate(async () => {
      const k = window.__ks, D = k.life.fauna.dog, b = { x: D.pos.x, z: D.pos.z };
      k.player.teleport(b.x + 7, b.z + 5, 0); k.nav.snapBehind();
      for (let i = 0; i < 40; i++) { await new Promise((res) => setTimeout(res, 150)); if (D.state === 1 || D.state === 2 || D.state === 3) return D.state; }
      return D.state;
    });
    R.ok('狗认得行者：起身迎过来', g === 1 || g === 2 || g === 3, `状态 ${g}`);
    const errs = errsOf(logs);
    R.ok('习性：没有报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  } else R.ok('习性：生灵备好了', false);
  await ctx.close();
}

const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
