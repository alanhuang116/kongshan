// 外乡客：选人（郎君、娘子，三身衣着，雅号）、衣饰（试穿、还回、买、穿上、存下）、佩不插进布里、同游里看得见穿着。
// 用法：node tests/play/dress.mjs（开发服务器在 KS_URL，默认 http://localhost:3801/；同游那一节自己起中转在 3843）
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { BASE, Report, dir, launch, open, shot } from './lib.mjs';

const R = new Report(), d = dir('dress');
const browser = await launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// —— 一、选人 ——
console.log('一、选人');
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push(String(e.stack ?? e).slice(0, 400)));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await page.goto(`${BASE}?pick=1&season=spring&t=10&w=clear&q=mid`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  await page.click('[data-testid=enter]');
  await page.waitForSelector('[data-testid=pick]', { timeout: 8000 });
  await page.waitForTimeout(2200);
  const two = await ev(() => window.__ks.showcaseScreen().filter(Boolean).length);
  R.ok('头一回「入」先到选人：画里两位并立（郎君、娘子）', two === 2 && (await ev(() => window.__ui.ui.get().phase)) === 'select', `画面上 ${two} 位`);
  await page.click('[data-testid=pick-f]');
  await page.waitForTimeout(1300);
  await page.click('[data-testid="pick-wear-f-qingbu"]');
  await page.waitForTimeout(1600);
  const look = await ev(() => { const f = window.__ks.show?.figs[1]; return f ? { build: f.look.build, hat: f.look.hat, robe: f.look.robe } : null; });
  R.ok('点娘子、点「青布衫裙」：那一位换上（女子身形、包髻）', look?.build === 'f' && look?.hat === 'baoji', JSON.stringify(look));
  const n0 = await page.textContent('[data-testid=pick-name]');
  await page.click('[data-testid=pick-reroll]');
  const n1 = await page.textContent('[data-testid=pick-name]');
  const fits = await ev(() => window.__net?.nameFits('f') ?? true);
  R.ok('雅号换一个，而且合女子（不叫钓叟、樵子）', n0 !== n1 && fits, `${n0} → ${n1}`);
  await shot(page, d, 'pick');
  await page.click('[data-testid=pick-enter]');
  await page.waitForFunction(() => window.__ui.ui.get().phase === 'roam', null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const st = await ev(() => { const k = window.__ks; return { sex: k.persona.sex, name: k.persona.name, wear: k.wear, build: k.player.av.look.build, chosen: k.chosen, shows: !!k.show }; });
  R.ok('「入」：进园的是那位娘子（身形、衣着、雅号都记下），选人那一幕收了', st.sex === 'f' && st.build === 'f' && st.wear.yi === 'f-qingbu' && st.chosen && !st.shows && st.name === n1, JSON.stringify(st));
  // 再来一回：不再问
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(900);
  await page.click('[data-testid=enter]');
  await page.waitForFunction(() => window.__ui.ui.get().phase === 'roam', null, { timeout: 15000 });
  const again = await ev(() => ({ build: window.__ks.player.av.look.build, yi: window.__ks.wear.yi }));
  R.ok('再来：「入」直接进园，还是那一身', again.build === 'f' && again.yi === 'f-qingbu', JSON.stringify(again));
  R.ok('选人这一节没有报错', logs.length === 0, logs.slice(0, 2).join(' | '));
  await ctx.close();
}

// —— 二、衣饰 ——
console.log('\n二、衣饰');
{
  const { page, logs, ctx } = await open(browser, { s: 'yard', t: '10' });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  await page.click('[data-testid=key-menu]'); await page.waitForTimeout(300);
  await page.click('[data-testid=key-wardrobe]'); await page.waitForTimeout(1400);
  const mir = await ev(() => window.__ks.mirroring);
  R.ok('打开衣饰：人转过身来、镜头到他正面（照镜子）', mir);
  await page.click('[data-testid="wd-item-m-lanshan"]'); await page.waitForTimeout(700);
  const tried = await ev(() => ({ collar: window.__ks.player.av.look.collar, saved: window.__ks.wear.yi }));
  R.ok('点一样没买的：先试穿在身上（不存）', tried.collar === 'round' && tried.saved === 'm-zhiduo', JSON.stringify(tried));
  await page.click('[data-testid=wd-cat-pei]'); await page.waitForTimeout(500);
  await page.click('[data-testid="wd-item-pei"]'); await page.waitForTimeout(800);
  const orn = await ev(() => window.__ks.player.av.look.orn);
  R.ok('点玉佩：腰间多了一枚（荷包还在）', orn.includes('pei') && orn.includes('hebao'), orn.join('、'));
  await shot(page, d, 'wardrobe-try');
  // 买（开发服务器上是不收钱的试用）
  await page.click('[data-testid=wd-buy]'); await page.waitForTimeout(300);
  await page.click('[data-testid=wd-pay]'); await page.waitForTimeout(1200);
  const owned = await ev(() => window.__ks.mem.get('wardrobe', {}).owned ?? []);
  R.ok('买玉佩（试用付款）：收进衣箱', owned.includes('pei'), owned.join('、'));
  await page.click('[data-testid=wd-wear]'); await page.waitForTimeout(600);
  const msg = await page.textContent('[data-testid=wd-msg]').catch(() => '');
  const still = await ev(() => window.__ks.wear.yi);
  R.ok('襕衫还没买：「穿上」不让穿，说还差哪样', /还差/.test(msg ?? '') && still === 'm-zhiduo', msg ?? '');
  await page.click('[data-testid=wd-revert]'); await page.waitForTimeout(400);
  await page.click('[data-testid=wd-cat-pei]'); await page.waitForTimeout(300);
  await page.click('[data-testid="wd-item-pei"]'); await page.waitForTimeout(500);
  await page.click('[data-testid=wd-wear]'); await page.waitForTimeout(600);
  const worn = await ev(() => ({ pei: window.__ks.wear.pei, mem: window.__ks.mem.get('player', {}).wear?.pei ?? [] }));
  R.ok('只换上买了的玉佩：穿上了，存进存档', worn.pei.includes('pei') && worn.mem.includes('pei'), JSON.stringify(worn));
  await page.click('[data-testid=sheet-close]'); await page.waitForTimeout(1100);
  const after = await ev(() => ({ mirror: window.__ks.mirroring, locked: window.__ks.player.locked, orn: window.__ks.player.av.look.orn }));
  R.ok('收起：镜头回到身后、人能走；身上是穿上的那一身', !after.mirror && !after.locked && after.orn.includes('pei'), JSON.stringify(after));
  R.ok('衣饰这一节没有报错', logs.length === 0, logs.slice(0, 2).join(' | '));
  await ctx.close();
}

// —— 三、佩不插进布里 ——
console.log('\n三、佩、囊、禁步不插进布里');
{
  const { page, logs, ctx } = await open(browser, { s: 'yard', ui: '0' });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  // 量：腰间那几样每个点在不在衣身里头（同 clip.js：射线数穿过衣身几次，奇数在里）。站着走着：水平往外打；
  // 坐着跪着（衣摆铺在腿上、地上，下沿敞着）：往上打——在腿上那片布底下的点，往上一打就穿出布去
  await ev(() => {
    window.__ornProbe = () => {
      const av = window.__ks.player.av, L = av.loft, P = L.pos, S = av.segs, body = L.patches[0], w = S + 1, tris = [];
      for (let j = 2; j < body.rings - 2; j++) for (let i = 0; i < S; i++) { const a = body.off + j * w + i; tris.push(a, a + 1, a + w + 1, a, a + w + 1, a + w); }
      const hits = (ox, oy, oz, dx, dy, dz) => {
        const out = [];
        for (let k = 0; k < tris.length; k += 3) {
          const ia = tris[k] * 3, ib = tris[k + 1] * 3, ic = tris[k + 2] * 3, ax = P[ia], ay = P[ia + 1], az = P[ia + 2];
          const e1x = P[ib] - ax, e1y = P[ib + 1] - ay, e1z = P[ib + 2] - az, e2x = P[ic] - ax, e2y = P[ic + 1] - ay, e2z = P[ic + 2] - az;
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-14) continue;
          const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az, u = (tx * px + ty * py + tz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (dx * qx + dy * qy + dz * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (t > 1e-6) out.push(t);
        }
        return out;
      };
      const hp = av.joints.hips.position, seated = av.pose !== 'stand';
      let n = 0, worst = 0, pts = 0;
      for (const o of av.orns) {
        if (o.p.slot !== 'waist') continue;
        const c = L.chunks[o.ch];
        for (let i = 0; i < c.n; i += 2) {
          const off = (c.off + i) * 3, x = P[off], y = P[off + 1], z = P[off + 2];
          let dx = x - hp.x, dz = z - hp.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
          const hs = seated && y < hp.y + 0.02 ? hits(x, y, z, 0, 1, 0) : hits(x, y, z, dx, 0, dz); pts++;
          if (hs.length % 2 === 1) { const dep = Math.min(...hs); if (dep > 0.004) { n++; worst = Math.max(worst, dep); } }
        }
      }
      return { n, worst, pts };
    };
  });
  // 初来的人穿的是带着来的那一身（荷包在腰间）
  R.ok('初来的人：腰间有荷包（带着来的那一身）', (await ev(() => window.__ks.wear.pei)).includes('hebao'));
  const advance = (n) => ev((n) => { const w = window.__ks.world; for (let i = 0; i < n; i++) { w.time += 1 / 60; for (const f of w.tick) f(1 / 60, w.time); } }, n);
  const run = async (name, wear, start, warm = 1.5, frames = 120) => {
    await ev(([w]) => { const k = window.__ks; if (k.act) k.exitAct(); k.setRun(false); k.player.teleport(-60, 101, Math.PI / 2); k.nav.snapBehind(); k.setWear(w); }, [wear]);
    await page.waitForTimeout(300);
    await start();
    await ev(() => window.__ks.world.stop());
    await advance(Math.round(warm * 60));
    let bad = 0, worst = 0, pts = 0;
    for (let i = 0; i < frames; i++) { await advance(1); const r = await ev(() => window.__ornProbe()); if (r.n > 0) bad++; worst = Math.max(worst, r.worst); pts = r.pts; }
    await ev(() => { const k = window.__ks; k.world.start(); k.player.stop(); k.setRun(false); k.player.av.setPose('stand', 0.01); });
    R.ok(`${name}：腰间的不插进布里`, bad <= 2 && worst < 0.015, `${frames} 帧里 ${bad} 帧有点在布里（最深 ${(worst * 1000).toFixed(1)} 毫米；量 ${pts} 个点）`);
  };
  const M = { sex: 'm', yi: 'm-zhiduo', guan: 'm-jin', zan: [], pei: ['pei', 'nang'] };
  const F = { sex: 'f', yi: 'f-beizi', guan: 'f-gaoji', zan: ['buyao', 'erdang'], pei: ['jinbu', 'hebao'] };
  await run('郎君走（玉佩、香囊）', M, () => ev(() => window.__ks.player.goTo(20, 101, { r: 0.2 })));
  await run('郎君跑', M, () => ev(() => { const k = window.__ks; k.setRun(true); k.player.goTo(20, 101, { r: 0.2 }); }), 2);
  await run('娘子走（禁步、荷包）', F, () => ev(() => window.__ks.player.goTo(20, 101, { r: 0.2 })));
  await run('娘子跑', F, () => ev(() => { const k = window.__ks; k.setRun(true); k.player.goTo(20, 101, { r: 0.2 }); }), 2);
  await run('娘子跪坐', F, () => ev(() => window.__ks.player.av.setPose('kneel', 0.6)), 1.4, 40);
  await run('郎君盘坐', M, () => ev(() => window.__ks.player.av.setPose('sit', 0.6)), 1.4, 40);
  R.ok('这一节没有报错', logs.length === 0, logs.slice(0, 2).join(' | '));
  await ctx.close();
}

// —— 四、同游里看得见穿着 ——
console.log('\n四、同游里看得见穿着');
{
  const PORT = 3843, ROOT = join(import.meta.dirname, '..', '..');
  const relay = spawn(process.execPath, [join(ROOT, 'server', 'relay.mjs')], { cwd: ROOT, env: { ...process.env, KS_RELAY_PORT: String(PORT), KS_RELAY_PER_IP: '64' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  relay.stdout.on('data', (b) => { out += b; });
  relay.stderr.on('data', (b) => { out += b; });
  for (let i = 0; i < 50 && !/relay on/.test(out); i++) await sleep(100);
  try {
    const q = { s: 'yard', ui: '0', ws: `ws://localhost:${PORT}/ws`, share: '0' };
    const A = await open(browser, q), B = await open(browser, q);
    await A.page.waitForFunction(() => window.__net?.view.status === 'online' && window.__net.ext, null, { timeout: 15000 });
    await B.page.waitForFunction(() => window.__net?.view.status === 'online' && window.__net.remotes.size > 0, null, { timeout: 15000 });
    await A.page.evaluate(() => { window.__ks.setWear({ sex: 'f', yi: 'f-jiang', guan: 'f-huaguan', zan: ['buyao'], pei: ['jinbu'] }); window.__ks.player.teleport(1, 12, 0); });
    await B.page.evaluate(() => { window.__ks.player.teleport(1, 15, Math.PI); window.__ks.nav.snapBehind(); });
    await B.page.waitForFunction(() => { const r = [...window.__net.remotes.values()][0]; return r?.fig?.look?.build === 'f'; }, null, { timeout: 12000 }).catch(() => {});
    const seen = await B.page.evaluate(() => { const r = [...window.__net.remotes.values()][0]; return r?.fig ? { build: r.fig.look.build, hat: r.fig.look.hat, orn: r.fig.look.orn, lk: r.lk } : { lk: r?.lk ?? null }; });
    R.ok('甲换成娘子、绛红褙子、花冠、步摇、禁步：乙那边看见的就是这一身', seen.build === 'f' && seen.hat === 'huaguan' && (seen.orn ?? []).includes('jinbu'), JSON.stringify(seen));
    const ext = await B.page.evaluate(() => window.__net.view.ext);
    R.ok('中转认得新添的几样（样子、名片、玩法、路标）', ext);
    await shot(B.page, d, 'together-remote-dress');
    R.ok('同游这一节没有报错', A.logs.length + B.logs.length === 0, [...A.logs, ...B.logs].slice(0, 2).join(' | '));
    await A.ctx.close(); await B.ctx.close();
  } finally { relay.kill(); }
}

await browser.close();
process.exit(R.done() ? 1 : 0);
