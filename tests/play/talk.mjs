// 与村里人说话：在几个时辰里，把这会儿在外头的人一个个走过去、作揖、问几句、别过；送一样东西；做成几件托事；
// 再在带界面的整页上看说话的面板在电脑与手机尺寸下放不放得下。
// 看：走得到、他转过来对着你、话出来了（每一问他都接一句，先生说的那句也在）、签有三四枚、别过之后各忙各的能走；
//     送东西：行囊里少了那一样、他记下了；托事：接下、半路、交东西、回礼进了行囊、情分加深、记进了 'folk'；
//     面板不出画、不横着溢出、签不出面板；没有报错。
// 用法：KS_URL=http://localhost:3817/world.html node tests/play/talk.mjs [时辰…]（默认 10、15、20）
//       截图放在 KS_SHOTS 指的目录（不给就是 shots/talk）
//       KS_SEX=f：当作女客跑一遍（你是外乡来的客人，村里人改口叫「娘子」「姐姐」……）；不给就是男客
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { launch, open, Report, OUT } from './lib.mjs';

const hours = process.argv.slice(2).filter((a) => /^[\d.]+$/.test(a));
const SHOTS = process.env.KS_SHOTS ?? join(OUT, 'talk');
mkdirSync(SHOTS, { recursive: true });
const R = new Report(), browser = await launch();
const errsOf = (logs) => logs.filter((l) => !/404|Failed to load resource|toNonIndexed|GPU stall|ReadPixels/.test(l));
/** 你是男客还是女客：页面好了以后直接定在世界上（不经选人那一页） */
const SEX = process.env.KS_SEX === 'f' ? 'f' : 'm';
const asGuest = (page) => page.evaluate((sex) => { const k = window.__ks; if (k) k.persona = { ...k.persona, sex }; }, SEX);
console.log(`— 当作${SEX === 'f' ? '女' : '男'}客`);

// —— 一、和每个在场的人说话 ——
for (const t of hours.length ? hours : ['10', '15', '20']) {
  const { page, ctx, logs } = await open(browser, { s: 'village', t, ui: '0', flow: '0' }, { wait: 1500 });
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  await asGuest(page);
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

// —— 二、送东西、托事（东西真的过手：等他接住了再看） ——
{
  const { page, ctx, logs } = await open(browser, { s: 'village', t: '9.5', ui: '0', flow: '0' }, { wait: 1500 });
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  await asGuest(page);
  const r = await page.evaluate(async () => {
    const k = window.__ks, wait = (ms) => new Promise((res) => setTimeout(res, ms)), out = {};
    const talk = async (who) => { const a = k.acts[`talk:${who}`]; if (!a || a.on?.() === false) return false; k.exitAct(); await wait(200); k.enterAct(`talk:${who}`, true); await wait(400); return k.act?.id === `talk:${who}`; };
    const has = (id) => (k.act?.state.choices ?? []).some((c) => c.id === id);
    /** 东西递完、接完（最多等 12 秒） */
    const settle = async () => { for (let i = 0; i < 120 && k.act?.ex?.busy; i++) await wait(100); await wait(150); };
    // 送东西：给李公一捧枣（他喜欢）
    k.bag.add('jujube', 1, { quiet: true });
    k.bag.add('water', 1, { quiet: true });
    out.elderHere = await talk('elder');
    if (out.elderHere) {
      out.giftChoice = has('gift');
      k.cmd('gift'); await wait(100);
      out.items = (k.act?.state.items ?? []).map((x) => x.id);
      out.water = (k.act?.state.items ?? []).some((x) => x.id === 'water' || x.id === 'coin');
      const t0 = String(k.act?.state.text ?? '');
      k.cmd('item', 'jujube'); await wait(120);
      // 还没递到：行囊里还在，话不变，签先收着
      out.during = { left: k.bag.count('jujube'), same: String(k.act?.state.text ?? '') === t0, choices: (k.act?.state.choices ?? []).length, holder: k.act?.ex?.holder ?? null };
      await settle();
      out.giftText = String(k.act?.state.text ?? '');
      out.jujubeLeft = k.bag.count('jujube');
      out.gave = k.mem.get('folk', { p: {} }).p.elder?.gift?.jujube ?? 0;
      out.know = k.mem.get('folk', { p: {} }).p.elder?.know ?? [];
      // 他放下的东西留在身边（放在腿上的，说完了挪到凳边）
      out.inLap = !!k.world.scene.getObjectByName('gift:jujube');
      // 托事：热茶
      out.offer = (k.act?.state.choices ?? []).find((c) => c.id.startsWith('fv:tea'))?.id ?? null;
      if (out.offer) {
        k.cmd('fv:tea:ask'); await wait(80);
        out.askText = String(k.act?.state.text ?? '');
        k.cmd('fv:tea:yes'); await wait(80);
        out.teaOn = k.mem.get('folk', { f: {} }).f.tea?.s;
        k.bag.add('tea', 1, { quiet: true }); k.cmd('menu'); await wait(80);
        out.hand = has('fv:tea:hand');
        k.cmd('fv:tea:hand'); await wait(100);
        out.teaBefore = k.mem.get('folk', { f: {} }).f.tea?.s;       // 还在递：还没算交到
        await settle();
        out.thanks = String(k.act?.state.text ?? '');
        out.teaDone = k.mem.get('folk', { f: {} }).f.tea?.s;
        out.jujube = k.bag.count('jujube');
        out.bond = k.mem.get('folk', { p: {} }).p.elder?.v ?? 0;
      }
      k.cmd('bye'); await wait(300);
      const kept = k.world.scene.getObjectByName('gift:jujube'), q = k.life.npcs.elder.pos;
      if (kept) { const w = kept.getWorldPosition(kept.position.clone()); out.kept = +Math.hypot(w.x - q.x, w.z - q.z).toFixed(2); }
    }
    // 托事：替孙嫂念信（当场办成；回礼的豆腐递过来）
    out.tofuHere = await talk('tofu');
    if (out.tofuHere && has('fv:letter:ask')) { k.cmd('fv:letter:ask'); await wait(60); k.cmd('fv:letter:yes'); await wait(60); out.letter = k.mem.get('folk', { f: {} }).f.letter?.s; await settle(); out.tofu = k.bag.count('tofu'); k.cmd('bye'); await wait(300); }
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
  R.ok('送东西：签上有「带了样东西」，挑得出行囊里的那一样；水、铜钱不在里头', r.elderHere && r.giftChoice && r.items.includes('jujube') && !r.water, JSON.stringify(r.items ?? []));
  R.ok('送东西：递着的那一会儿，东西还在先生手上、话不变、签收着', r.during?.left === 1 && r.during?.same && r.during?.choices === 0 && r.during?.holder === 'me', JSON.stringify(r.during ?? {}));
  R.ok('送东西：他接住了才交出——行囊里少了、他记下了、知道他喜欢，东西留在他身边', r.jujubeLeft === 0 && r.gave === 1 && r.know?.includes('jujube') && r.inLap && r.kept != null && r.kept < 1.6, `「${(r.giftText ?? '').slice(0, 20)}」 东西离他 ${r.kept}`);
  R.ok('托事（热茶）：他开口求、先生接下', !!r.offer && r.askText?.length > 4 && r.teaOn === 'on', r.offer ?? '没提');
  R.ok('托事（热茶）：茶递到他手里才算办成，回礼递过来进了行囊，情分加深', r.hand && r.teaBefore === 'on' && r.teaDone === 'done' && r.jujube >= 1 && r.bond >= 6, `「${(r.thanks ?? '').slice(0, 18)}」 情分底子 ${r.bond}`);
  R.ok('托事（念信）：当场办成，回礼进了行囊', !r.tofuHere || (r.letter === 'done' && r.tofu === 1), r.tofuHere ? '' : '孙嫂此刻不在外头（跳过）');
  R.ok('煮茶做完：行囊里有一碗茶', r.teaAdded === undefined || r.teaAdded >= 1, String(r.teaAdded));
  R.ok('送东西、托事：没有报错', errsOf(logs).length === 0, errsOf(logs).slice(0, 2).join(' | '));
  await ctx.close();
}

// —— 三、跨人跨地方的托事：替赵大向老刘讨柴 ——
{
  const { page, ctx, logs } = await open(browser, { s: 'village', t: '15', ui: '0', flow: '0' }, { wait: 1500 });
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  await asGuest(page);
  const r = await page.evaluate(async () => {
    const k = window.__ks, wait = (ms) => new Promise((res) => setTimeout(res, ms)), out = {};
    const talk = async (who) => { const a = k.acts[`talk:${who}`]; if (!a || a.on?.() === false) return false; k.exitAct(); await wait(200); k.enterAct(`talk:${who}`, true); await wait(400); return k.act?.id === `talk:${who}`; };
    const settle = async () => { for (let i = 0; i < 120 && k.act?.ex?.busy; i++) await wait(100); await wait(150); };
    const pick = (pre) => (k.act?.state.choices ?? []).find((c) => c.id.startsWith(pre))?.id;
    out.c1 = await talk('carpenter1');
    if (!out.c1) return out;
    const ask = pick('fv:wood:ask');
    out.offered = !!ask;
    if (!ask) return out;
    k.cmd(ask); await wait(60); k.cmd('fv:wood:yes'); await wait(60); k.cmd('bye'); await wait(300);
    out.w = await talk('woodcutter');
    if (out.w) { out.fetch = !!pick('fv:wood:fetch'); k.cmd('fv:wood:fetch'); await wait(60); await settle(); out.wood = k.bag.count('firewood'); k.cmd('bye'); await wait(300); }
    await talk('carpenter1');
    out.hand = !!pick('fv:wood:hand');
    k.cmd('fv:wood:hand'); await wait(60);
    await settle();
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

// —— 三之二、东西过手与话对得上：站着的、坐着的、不肯收的、回赠的，一帧一帧量 ——
// 看：先生取出来时东西在先生手里（离他的手 15 厘米内）；他那句话出来的那一刻，东西已经到了他手上（离他的手 15 厘米内）；
//     话出来之前东西一直在先生那边、行囊没少；不肯收的东西回到先生袖里、行囊里还在；回赠的东西递到先生手上那一刻才浮「得……」。
{
  const { page, ctx, logs } = await open(browser, { s: 'village', t: '10', ui: '0', flow: '0' }, { wait: 1500 });
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  await asGuest(page);
  const cases = [['neighbor', 'egg', '站着的（扫地的李二嫂，一手拿帚）'], ['basketman', 'egg', '坐着的（凳上破篾的陈篾匠）'], ['lunch', 'wine', '不肯收的（孩子不收酒）']];
  for (const [who, item, label] of cases) {
    const r = await page.evaluate(async ([who, item]) => {
      const k = window.__ks, W = window.__walk, wait = (ms) => new Promise((res) => setTimeout(res, ms));
      const npc = k.life.npcs[who];
      if (!npc?.present || !k.acts[`talk:${who}`]) return { here: false };
      // 从五步外走过去（与点他的名字一样）
      const q = npc.pos;
      let sx = q.x + 4, sz = q.z + 4;
      for (let i = 0; i < 40; i++) { const a = i * 0.7, x = q.x + Math.cos(a) * 4.5, z = q.z + Math.sin(a) * 4.5; if (W.standable(x, z) != null && W.findPath(x, z, W.groundAt(x, z), q.x, q.z)) { sx = x; sz = z; break; } }
      k.exitAct(); await wait(200);
      k.player.teleport(sx, sz, Math.atan2(q.x - sx, q.z - sz)); k.nav.snapBehind();
      k.bag.add(item, 4, { quiet: true });
      await wait(400);
      k.enterAct(`talk:${who}`);
      for (let i = 0; i < 80 && k.act?.id !== `talk:${who}`; i++) await wait(100);
      if (k.act?.id !== `talk:${who}`) return { here: true, started: false };
      await wait(1200);
      const V = k.player.pos.constructor, jw = (o) => { o.updateWorldMatrix(true, false); return new V().setFromMatrixPosition(o.matrixWorld); };
      k.cmd('gift'); await wait(150);
      const before = k.bag.count(item), t0 = String(k.act.state.text ?? '');     // 挑东西那一屏的话（他问「是什么？」）
      k.cmd('item', item);
      const rows = [];
      let ended = false;
      const tick = () => {
        const ex = k.act?.ex, pr = ex?.prop?.obj;
        const pp = pr ? jw(pr).add(new V(0, ex.prop.h, 0)) : null;
        const me = [jw(k.player.av.joints.handL), jw(k.player.av.joints.handR)], him = [jw(npc.avatar.joints.handL), jw(npc.avatar.joints.handR)];
        const dm = pp ? Math.min(...me.map((h) => h.distanceTo(pp))) : null, dh = pp ? Math.min(...him.map((h) => h.distanceTo(pp))) : null;
        rows.push({ holder: ex?.holder ?? null, dm, dh, text: String(k.act?.state.text ?? ''), bag: k.bag.count(item) });
        if (!ended) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      for (let i = 0; i < 140 && (k.act?.ex?.busy ?? false); i++) await wait(100);
      ended = true; await wait(50);
      const said = rows.findIndex((x) => x.text !== t0);
      const first = rows.find((x) => x.holder === 'me' && x.dm != null && x.dm < 1);
      const at = said >= 0 ? rows[said] : null;
      const pre = said > 0 ? rows.slice(0, said) : rows;
      return {
        here: true, started: true, n: rows.length, before, after: k.bag.count(item),
        firstDm: first ? +first.dm.toFixed(3) : null,
        saidHolder: at?.holder ?? null, saidDh: at?.dh != null ? +at.dh.toFixed(3) : null,
        preAllMine: pre.every((x) => x.holder !== 'him'), preBag: pre.every((x) => x.bag === before),
        text: at?.text.slice(0, 18) ?? '',
      };
    }, [who, item]);
    await page.screenshot({ path: join(SHOTS, `handover-${who}.png`) });
    if (!r.here || !r.started) { R.ok(`过手（${label}）：他在外头、说得上话`, false, JSON.stringify(r)); continue; }
    if (item === 'wine') {
      R.ok(`过手（${label}）：递过去，他推辞——东西一直在先生这边，回到袖里，行囊里还在`, r.preAllMine && r.saidHolder !== 'him' && r.after === r.before && r.firstDm != null && r.firstDm < 0.15, `「${r.text}」 先生手离东西 ${r.firstDm}`);
      continue;
    }
    R.ok(`过手（${label}）：取出来时东西在先生手里`, r.firstDm != null && r.firstDm < 0.15, `离先生的手 ${r.firstDm} 米`);
    R.ok(`过手（${label}）：话出来的那一刻东西到了他手上；之前一直在先生那边、行囊没少`, r.saidHolder === 'him' && r.saidDh != null && r.saidDh < 0.15 && r.preAllMine && r.preBag, `离他的手 ${r.saidDh} 米 · 「${r.text}」`);
    R.ok(`过手（${label}）：交出了一回送的那么多`, r.before - r.after === 4, `${r.before}→${r.after}`);
  }
  // 回赠：熟了的李公收了茶，回一捧枣——递到先生手上那一刻才浮「得枣一捧」
  const rb = await page.evaluate(async () => {
    const k = window.__ks, wait = (ms) => new Promise((res) => setTimeout(res, ms));
    if (!k.life.npcs.elder?.present) return { here: false };
    const { folkOf } = await import('/src/world/acts/favor.ts');
    const F = folkOf(k); F.meet('elder'); F.addV('elder', 6);
    k.exitAct(); await wait(200);
    k.bag.add('tea', 1, { quiet: true });
    const notes = [];
    const on0 = k.bag.onNote; k.bag.onNote = (t) => { notes.push({ t, holder: k.act?.ex?.holder ?? null, item: k.act?.ex?.prop?.item ?? null }); on0?.(t); };
    k.enterAct('talk:elder', true); await wait(1500);
    for (let i = 0; i < 100 && (k.act?.ex?.busy ?? false); i++) await wait(100);     // 见面塞的那一样先递完
    const r0 = Math.random; Math.random = () => 0.1;
    k.cmd('gift'); await wait(120); k.cmd('item', 'tea');
    for (let i = 0; i < 160 && (k.act?.ex?.busy ?? false); i++) await wait(100);
    Math.random = r0; k.bag.onNote = on0;
    const got = notes.find((n) => n.t.startsWith('得枣'));
    return { here: true, jujube: k.bag.count('jujube'), got, text: String(k.act?.state.text ?? '') };
  });
  R.ok('回赠：他递过来，先生接到手的那一刻才浮「得枣一捧」，他递的时候接一句', !rb.here || (rb.jujube >= 1 && rb.got?.holder === 'me' && rb.got?.item === 'jujube' && rb.text.split('\n').length >= 2), JSON.stringify(rb.got ?? {}) + ` 「${String(rb.text ?? '').replace(/\n/g, '／').slice(0, 30)}」`);
  R.ok('过手：没有报错', errsOf(logs).length === 0, errsOf(logs).slice(0, 2).join(' | '));
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
  await asGuest(page);
  await page.waitForTimeout(1200);
  // 李公：头一句、问早年（话长、签多），再看送东西那一屏（行囊里放几样），送出去以后那一屏（先生说的那句与他接的话）
  // 递东西的半途、他接住的那一刻也各截一张（handover-<尺寸>-*.png）
  const res = [];
  for (const step of ['greet', 'ask', 'gift', 'given']) {
    await page.evaluate(async (step) => {
      const k = window.__ks, wait = (ms) => new Promise((r) => setTimeout(r, ms));
      if (step === 'greet') { for (const [i, n] of [['egg', 6], ['tea', 1], ['candy', 3], ['wine', 1], ['flower', 1], ['poem', 1]]) k.bag.add(i, n, { quiet: true }); k.enterAct('talk:elder', true); }
      if (step === 'ask') k.cmd('ask');
      if (step === 'gift') k.cmd('gift');
      if (step === 'given') {
        k.cmd('item', 'egg');
        for (let i = 0; i < 18 && k.act?.ex?.holder !== 'him'; i++) await wait(100);
        for (let i = 0; i < 120 && k.act?.ex?.busy; i++) await wait(100);
      }
      await wait(900);
    }, step);
    if (step === 'gift') {
      // 递东西的半途（先生捧着递过去）、他接住的那一刻
      await page.evaluate(() => window.__ks.cmd('item', 'egg'));
      await page.waitForFunction(() => { const ex = window.__ks.act?.ex; return !ex || ex.holder === 'me'; }, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1000);
      await page.screenshot({ path: join(SHOTS, `handover-${name}-1-offer.png`) });
      await page.waitForFunction(() => window.__ks.act?.ex?.holder === 'him' || !window.__ks.act?.ex?.busy, null, { timeout: 8000 }).catch(() => {});
      await page.screenshot({ path: join(SHOTS, `handover-${name}-2-taken.png`) });
      await page.waitForFunction(() => !window.__ks.act?.ex?.busy, null, { timeout: 12000 }).catch(() => {});
      await page.screenshot({ path: join(SHOTS, `handover-${name}-3-after.png`) });
      // 再挑一回（下一步「送出去以后」看面板）：李公收过了，签上没有「带了样东西」，就用托事以外的路——直接把送东西那一屏再摆出来
      await page.evaluate(() => { const k = window.__ks; k.exitAct(); });
      await page.waitForTimeout(400);
      await page.evaluate(async () => { const k = window.__ks, wait = (ms) => new Promise((r) => setTimeout(r, ms)); k.enterAct('talk:elder', true); await wait(1200); for (let i = 0; i < 100 && k.act?.ex?.busy; i++) await wait(100); k.cmd('gift'); await wait(600); });
    }
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
  for (const [i, step] of ['招呼', '问早年', '送东西', '送出去以后'].entries()) R.ok(`面板（${name} ${o.w}×${o.h}）${step}：放得下`, res[i].ok, res[i].why);
  R.ok(`面板（${name}）：没有报错`, errsOf(logs).length === 0, errsOf(logs).slice(0, 2).join(' | '));
  await ctx.close();
}

const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
