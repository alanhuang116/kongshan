// 与村里人说话：在几个时辰里，把这会儿在外头的人一个个走过去、作揖、问几句、别过；送一样东西；做成几件托事；
// 再在带界面的整页上看说话的面板在电脑与手机尺寸下放不放得下。
// 看：走得到、他转过来对着你、话出来了（每一问他都接一句，先生说的那句也在）、签有三四枚、别过之后各忙各的能走；
//     送东西：行囊里少了那一样、他记下了；托事：接下、半路、交东西、回礼进了行囊、情分加深、记进了 'folk'；
//     面板不出画、不横着溢出、签不出面板；没有报错。
// 用法：KS_URL=http://localhost:3817/world.html node tests/play/talk.mjs [时辰…]（默认 10、15、20）
//       截图放在 KS_SHOTS 指的目录（不给就是 shots/talk）
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { launch, open, Report, OUT } from './lib.mjs';

const hours = process.argv.slice(2).filter((a) => /^[\d.]+$/.test(a));
const SHOTS = process.env.KS_SHOTS ?? join(OUT, 'talk');
mkdirSync(SHOTS, { recursive: true });
const R = new Report(), browser = await launch();
const errsOf = (logs) => logs.filter((l) => !/404|Failed to load resource|toNonIndexed|GPU stall|ReadPixels/.test(l));

// —— 一、和每个在场的人说话 ——
for (const t of hours.length ? hours : ['10', '15', '20']) {
  const { page, ctx, logs } = await open(browser, { s: 'village', t, ui: '0', flow: '0' }, { wait: 1500 });
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  const ids = await page.evaluate(() => Object.keys(window.__ks.acts).filter((id) => id.startsWith('talk:') && window.__ks.things.find((th) => th.id === id)?.on?.() !== false));
  console.log(`— ${t} 点钟，在外头的：${ids.map((i) => i.slice(5)).join(' ') || '（没有）'}`);
  for (const id of ids) {
    const r = await page.evaluate(async (id) => {
      const k = window.__ks, a = k.acts[id], W = window.__walk, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      // 从他四五步外走过去（那里站得住、找得到路）；实在没有，就站到他跟前三米内（就近说话）
      const q = k.life.npcs[id.slice(5)].pos;
      let sx = q.x + 2, sz = q.z + 2;
      for (let i = 0; i < 32; i++) { const r = i < 16 ? 4.5 : 2.6, x = q.x + Math.cos(i * 0.8) * r, z = q.z + Math.sin(i * 0.8) * r; if (W.standable(x, z) != null && W.findPath(x, z, W.groundAt(x, z), q.x, q.z)) { sx = x; sz = z; break; } }
      k.player.teleport(sx, sz, Math.atan2(q.x - sx, q.z - sz)); k.nav.snapBehind();
      await wait(400);
      k.enterAct(id);
      for (let i = 0; i < 80 && k.act?.id !== id; i++) await wait(200);
      if (k.act?.id !== id) return { started: false };
      await wait(700);
      const st = () => k.act?.state ?? {};
      const first = { text: String(st().text ?? ''), n: (st().choices ?? []).length, who: String(st().who ?? '') };
      // 问几句：每一枚不是告辞的签都点一点（最多五回），看他接不接
      const turns = [];
      for (let i = 0; i < 5; i++) {
        const c = (st().choices ?? []).find((x) => x.id !== 'bye' && x.id !== 'gift' && !x.id.startsWith('fv:'));
        if (!c) break;
        const before = String(st().text ?? '');
        k.cmd(c.id); await wait(120);
        turns.push({ id: c.id, said: String(st().said ?? ''), text: String(st().text ?? ''), changed: String(st().text ?? '') !== before || c.id === 'chat', n: (st().choices ?? []).length });
      }
      const npc = k.life.npcs[id.slice(5)], fy = Math.atan2(k.player.pos.x - npc.pos.x, k.player.pos.z - npc.pos.z);
      k.cmd('bye'); await wait(300);
      if (k.act) { k.cmd('bye'); await wait(300); }   // 与客说话后先显出一象，再别过
      await wait(1100);
      return { started: true, first, turns, after: k.act?.id ?? null, locked: k.player.locked, met: k.mem.get('folk', { p: {} }).p[id.slice(5)]?.n ?? 0, fy };
    }, id);
    R.ok(`${t} 点 ${id}：走得到、开口招呼`, r.started && r.first.text.length > 1 && r.first.n >= 2 && r.first.n <= 5, r.started ? `「${r.first.text.slice(0, 22).replace(/\n/g, ' ')}」 ${r.first.who}` : '没开始');
    if (!r.started) continue;
    const answered = r.turns.length > 0 && r.turns.every((x) => x.text.length > 1 && x.said.length > 0 && x.n >= 1 && x.n <= 5);
    R.ok(`${t} 点 ${id}：问一句接一句`, answered, r.turns.map((x) => `${x.said}→${x.text.slice(0, 10).replace(/\n/g, ' ')}`).join(' | '));
    R.ok(`${t} 点 ${id}：别过之后能走、记下见过`, !r.after && !r.locked && r.met >= 1);
  }
  R.ok(`${t} 点：没有报错`, errsOf(logs).length === 0, errsOf(logs).slice(0, 2).join(' | '));
  await ctx.close();
}

// —— 二、送东西、托事 ——
{
  const { page, ctx, logs } = await open(browser, { s: 'village', t: '9.5', ui: '0', flow: '0' }, { wait: 1500 });
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  const r = await page.evaluate(async () => {
    const k = window.__ks, wait = (ms) => new Promise((res) => setTimeout(res, ms)), out = {};
    const talk = async (who) => { const a = k.acts[`talk:${who}`]; if (!a || a.on?.() === false) return false; k.exitAct(); await wait(200); k.enterAct(`talk:${who}`, true); await wait(400); return k.act?.id === `talk:${who}`; };
    const has = (id) => (k.act?.state.choices ?? []).some((c) => c.id === id);
    // 送东西：给李公一捧枣（他喜欢）
    k.bag.add('jujube', 1, { quiet: true });
    out.elderHere = await talk('elder');
    if (out.elderHere) {
      out.giftChoice = has('gift');
      k.cmd('gift'); await wait(100);
      out.items = (k.act?.state.items ?? []).map((x) => x.id);
      k.cmd('item', 'jujube'); await wait(100);
      out.giftText = String(k.act?.state.text ?? '');
      out.jujubeLeft = k.bag.count('jujube');
      out.gave = k.mem.get('folk', { p: {} }).p.elder?.gift?.jujube ?? 0;
      out.know = k.mem.get('folk', { p: {} }).p.elder?.know ?? [];
      // 托事：热茶
      out.offer = (k.act?.state.choices ?? []).find((c) => c.id.startsWith('fv:tea'))?.id ?? null;
      if (out.offer) {
        k.cmd('fv:tea:ask'); await wait(80);
        out.askText = String(k.act?.state.text ?? '');
        k.cmd('fv:tea:yes'); await wait(80);
        out.teaOn = k.mem.get('folk', { f: {} }).f.tea?.s;
        k.bag.add('tea', 1, { quiet: true }); k.cmd('menu'); await wait(80);
        out.hand = has('fv:tea:hand');
        k.cmd('fv:tea:hand'); await wait(80);
        out.thanks = String(k.act?.state.text ?? '');
        out.teaDone = k.mem.get('folk', { f: {} }).f.tea?.s;
        out.jujube = k.bag.count('jujube');
        out.bond = k.mem.get('folk', { p: {} }).p.elder?.v ?? 0;
      }
      k.cmd('bye'); await wait(300);
    }
    // 托事：替孙嫂念信（当场办成）
    out.tofuHere = await talk('tofu');
    if (out.tofuHere && has('fv:letter:ask')) { k.cmd('fv:letter:ask'); await wait(60); k.cmd('fv:letter:yes'); await wait(60); out.letter = k.mem.get('folk', { f: {} }).f.letter?.s; out.tofu = k.bag.count('tofu'); k.cmd('bye'); await wait(300); }
    // 托事：煮茶那件事做完，行囊里添一碗茶（草堂那边还没给的话）
    const before = k.bag.count('tea');
    if (k.acts.tea) {
      k.exitAct(); await wait(100);
      k.enterAct('tea', true); await wait(300);
      if (k.act?.id === 'tea') { k.act.state.kind = 'xiang'; await wait(600); k.exitAct(); await wait(700); }
      out.teaAdded = k.bag.count('tea') - before;
    }
    out.notes = window.__ui?.ui?.get?.().notes?.length ?? null;
    return out;
  });
  R.ok('送东西：签上有「带了样东西」，挑得出行囊里的那一样', r.elderHere && r.giftChoice && r.items.includes('jujube'), JSON.stringify(r.items ?? []));
  R.ok('送东西：东西送出去了，他记下了、知道了他喜欢', r.jujubeLeft === 0 && r.gave === 1 && r.know?.includes('jujube'), `「${(r.giftText ?? '').slice(0, 20)}」`);
  R.ok('托事（热茶）：他开口求、先生接下', !!r.offer && r.askText?.length > 4 && r.teaOn === 'on', r.offer ?? '没提');
  R.ok('托事（热茶）：带着茶去交，办成了，回礼进了行囊，情分加深', r.hand && r.teaDone === 'done' && r.jujube >= 1 && r.bond >= 6, `「${(r.thanks ?? '').slice(0, 18)}」 情分底子 ${r.bond}`);
  R.ok('托事（念信）：当场办成，回礼进了行囊', !r.tofuHere || (r.letter === 'done' && r.tofu === 1), r.tofuHere ? '' : '孙嫂此刻不在外头（跳过）');
  R.ok('煮茶做完：行囊里有一碗茶', r.teaAdded === undefined || r.teaAdded >= 1, String(r.teaAdded));
  R.ok('送东西、托事：没有报错', errsOf(logs).length === 0, errsOf(logs).slice(0, 2).join(' | '));
  await ctx.close();
}

// —— 三、跨人跨地方的托事：替赵大向老刘讨柴 ——
{
  const { page, ctx, logs } = await open(browser, { s: 'village', t: '15', ui: '0', flow: '0' }, { wait: 1500 });
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  const r = await page.evaluate(async () => {
    const k = window.__ks, wait = (ms) => new Promise((res) => setTimeout(res, ms)), out = {};
    const talk = async (who) => { const a = k.acts[`talk:${who}`]; if (!a || a.on?.() === false) return false; k.exitAct(); await wait(200); k.enterAct(`talk:${who}`, true); await wait(400); return k.act?.id === `talk:${who}`; };
    const pick = (pre) => (k.act?.state.choices ?? []).find((c) => c.id.startsWith(pre))?.id;
    out.c1 = await talk('carpenter1');
    if (!out.c1) return out;
    const ask = pick('fv:wood:ask');
    out.offered = !!ask;
    if (!ask) return out;
    k.cmd(ask); await wait(60); k.cmd('fv:wood:yes'); await wait(60); k.cmd('bye'); await wait(300);
    out.w = await talk('woodcutter');
    if (out.w) { out.fetch = !!pick('fv:wood:fetch'); k.cmd('fv:wood:fetch'); await wait(60); out.wood = k.bag.count('firewood'); k.cmd('bye'); await wait(300); }
    await talk('carpenter1');
    out.hand = !!pick('fv:wood:hand');
    k.cmd('fv:wood:hand'); await wait(60);
    out.done = k.mem.get('folk', { f: {} }).f.wood?.s; out.whistle = k.bag.count('whistle');
    k.cmd('bye'); await wait(300);
    return out;
  });
  if (r.c1 && r.offered) {
    R.ok('托事（讨柴）：到渡口向老刘讨来一捆', !r.w || (r.fetch && r.wood === 1), r.w ? '' : '老刘此刻不在（跳过）');
    R.ok('托事（讨柴）：交给赵大，办成了，得一支竹哨', !r.w || (r.hand && r.done === 'done' && r.whistle === 1));
  } else R.ok('托事（讨柴）：赵大在外头、会托这件事', false, JSON.stringify(r));
  R.ok('讨柴：没有报错', errsOf(logs).length === 0, errsOf(logs).slice(0, 2).join(' | '));
  await ctx.close();
}

// —— 四、面板放不放得下：电脑、手机、矮屏手机（带界面的整页） ——
const PAGE = (process.env.KS_URL ?? 'http://localhost:3801/').replace(/world\.html.*$/, 'index.html');
for (const [name, o] of [['desk', { w: 1280, h: 760 }], ['phone', { w: 393, h: 714, mobile: true }], ['low', { w: 375, h: 548, mobile: true }]]) {
  const ctx = await browser.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1, isMobile: !!o.mobile, hasTouch: !!o.mobile });
  const page = await ctx.newPage(), logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.message).slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text().slice(0, 300)}`); });
  await page.goto(`${PAGE}?auto=1&s=village&t=10&flow=0&q=mid`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(1200);
  // 李公：头一句、问早年（话长、签多），再看送东西那一屏（行囊里放几样）
  const res = [];
  for (const step of ['greet', 'ask', 'gift']) {
    await page.evaluate(async (step) => {
      const k = window.__ks, wait = (ms) => new Promise((r) => setTimeout(r, ms));
      if (step === 'greet') { for (const [i, n] of [['egg', 2], ['tea', 1], ['candy', 3], ['wine', 1], ['flower', 1], ['poem', 1]]) k.bag.add(i, n, { quiet: true }); k.enterAct('talk:elder', true); }
      if (step === 'ask') k.cmd('ask');
      if (step === 'gift') k.cmd('gift');
      await wait(900);
    }, step);
    await page.screenshot({ path: join(SHOTS, `panel-${name}-${step}.png`) });
    res.push(await page.evaluate(() => {
      const p = document.querySelector('[data-testid="act-panel"]'), body = p?.querySelector('.panel-body');
      if (!p) return { ok: false, why: '没有面板' };
      const r = p.getBoundingClientRect(), W = innerWidth, H = innerHeight;
      const inView = r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= H + 1;
      const noX = !body || body.scrollWidth <= body.clientWidth + 1;
      const kids = [...p.querySelectorAll('button')].filter((b) => b.offsetParent);
      const inside = kids.every((b) => { const q = b.getBoundingClientRect(); return q.left >= r.left - 1 && q.right <= r.right + 1; });
      const cut = kids.filter((b) => b.scrollWidth > b.clientWidth + 2).map((b) => b.textContent);
      return { ok: inView && noX && inside && cut.length === 0, why: `面板 ${Math.round(r.width)}×${Math.round(r.height)} 在画里 ${inView} 不横溢 ${noX} 签在板内 ${inside} 截字 ${cut.join('/') || '无'}`, buttons: kids.length };
    }));
  }
  for (const [i, step] of ['招呼', '问早年', '送东西'].entries()) R.ok(`面板（${name} ${o.w}×${o.h}）${step}：放得下`, res[i].ok, res[i].why);
  R.ok(`面板（${name}）：没有报错`, errsOf(logs).length === 0, errsOf(logs).slice(0, 2).join(' | '));
  await ctx.close();
}

const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
