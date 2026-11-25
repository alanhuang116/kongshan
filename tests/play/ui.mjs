// 界面逐尺寸走一遍：题名页、走动（走法提示、近处的签、「疾」）、简册、每一页册子、做事时的面板 / 纸 / 小器物（假的 state）、
// 下方浮着的话、夜里。每一屏截一张图，并做通盘检查（uikit.mjs 的 fit：出界、截断、安全区、键太小、相叠、字与底的对比）。
// 用法：KS_URL=http://localhost:3820/ node tests/play/ui.mjs [尺寸,尺寸…|all] [--only=名字,名字…] [--out=目录]
//   尺寸：pc laptop pad iphone se landscape（all 是这六种），另有 iphoneApp landApp（装到主屏幕、带安全区）
//   名字：title roam near menu guide guide-4 guide-5 today map sky bag bag-full xiang-sheet sound journal about folk folk-place folk-open stars book read write xiang talk said widgets items long
//         farm-reap farm-thresh farm-sow farm-weed farm-done notes night（夜里另有 stars-look stars-star stars-xiang：观星时收紧的面板，天要留出六成以上）
// 截图在 shots/ui/<尺寸>/；最后打印每种尺寸有几条问题。有问题时退出码是 1。
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { launch, open, fit, fakeAct, cmds, realAct, report, OUT, SIX, SIZES } from './uikit.mjs';

const args = process.argv.slice(2);
const pick = args.find((a) => !a.startsWith('--')) ?? 'all';
const sizes = pick === 'all' ? SIX : pick.split(',').filter((s) => SIZES[s]);
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const root = args.find((a) => a.startsWith('--out='))?.slice(6) ?? join(OUT, '..', 'ui');
const want = (n) => !only || only.includes(n);
const b = await launch();
const total = {};

// 写给检查用的几份假 state：小器物都上、很长的话、很多签、从行囊里挑东西
const WIDGETS = {
  title: '收麦', count: 3, total: 12, steps: ['割', '捆', '挑', '打场', '扬'], step: 1,
  hint: '按住，一镰一镰地割；割满一抱就捆起来',
  meter: { v: 0.62, lo: 0.55, hi: 0.75, label: '力道' }, hold: { id: 'cut', label: '割', v: 0.4 },
  keys: [{ key: '空格', label: '割' }, { key: 'E', label: '捆' }],
  tags: [
    { id: 'a', text: '一畦', sub: '麦熟了', kind: 'hot', rel: [-0.6, 0.1, 0] }, { id: 'b', text: '二畦', rel: [-0.3, 0.12, 0.1] },
    { id: 'c', text: '三畦', kind: 'done', rel: [0, 0.1, 0] }, { id: 'd', text: '四畦', kind: 'dim', sub: '还青着', rel: [0.3, 0.1, 0.05] },
    { id: 'e', text: '五畦', on: true, rel: [0.6, 0.1, 0] }, { id: 'f', text: '场院', rel: [0.05, 0.4, 0] },
  ],
};
const ITEMS = { kind: 'talk', title: '王婶', who: '王婶', text: '先生又来了。家里鸡下了蛋，正想着给先生送两个去。\n先生手里拿的是什么？', items: [{ id: 'egg', n: 2 }, { id: 'tea', n: 1 }, { id: 'sheaf', n: 12 }, { id: 'candy', n: 0 }], choices: [{ id: 'more', label: '再说几句' }, { id: 'bye', label: '别过' }] };
const LONG = {
  kind: 'talk', title: '与渔樵问对', who: '樵者',
  text: '樵者问渔者曰：「鱼可钩取乎？」曰：「然。」曰：「钩非饵可乎？」曰：「否。」曰：「非钩也，饵也。鱼利食而见害，人利鱼而蒙利，其利同也，其害异也。」\n这一段是本应用为测试排的长话，看面板里长话分段、能滚、不溢出：再添一句，再添一句，再添一句，再添一句，再添一句。\n第三段：看看三段以上的话。',
  source: '邵雍《渔樵问对》',
  choices: [{ id: 'q1', label: '问桑麻', main: true }, { id: 'q2', label: '问今年的收成怎么样', sub: '王婶家的麦子' }, { id: 'q3', label: '问渡口的船几时开' }, { id: 'q4', label: '送一碗茶', off: true, sub: '行囊里没有茶' }, { id: 'q5', label: '听他们说' }, { id: 'q6', label: '一起坐一会儿' }, { id: 'bye', label: '别过' }],
};
const XIANG = { kind: 'xiang', title: '井台', gua: '井', found: false, progress: 1, choices: [{ id: 'keep', label: '记下' }] };
// 说话：先生方才说的那句（said）在 who 下面淡淡一行
const SAID = { kind: 'talk', title: '王伯', who: '农夫 · 相熟', said: '这一捆新麦，给你家添一顿面；前日借的那把镰刀也还你，刃口我磨过了。', text: '哎呀，先生太客气了。那镰刀不急的，先生用着顺手就多用几日。', choices: [{ id: 'more', label: '再说几句' }, { id: 'give', label: '送样东西' }, { id: 'bye', label: '别过' }] };
// 农事（照农事那一路的 state 写的；台子用真的农事那几件事，没有就用书案）
const CHAIN = ['翻地', '下种', '浇水', '锄草', '割麦', '捆麦', '挑', '打场', '扬场', '磨面'], BYE = { id: 'done', label: '歇一歇' };
const WEEDS = Array.from({ length: 9 }, (_, i) => ({ id: 'w' + i, text: '草', kind: i < 2 ? 'done' : i === 2 ? 'hot' : undefined, rel: [((i % 5) - 2) * 0.7, 0.05, Math.floor(i / 5) * 0.8 - 0.4] }));
const FARM = {
  'farm-reap': ['farm:reap:west:wheat', { title: '割麦', steps: CHAIN, step: 4, hint: '按住，一镰一镰地割；割满一抱就捆', hold: { id: 'cut', label: '割', v: 0.35 }, progress: 0.35, count: 3, keys: [{ key: '空格', label: '按住割' }], choices: [BYE] }],
  'farm-thresh': ['farm:thresh', { title: '打场', steps: CHAIN, step: 7, hint: '连枷举到顶（朱色那一段）时按下去', hold: { id: 'beat', label: '打' }, meter: { v: 0.82, lo: 0.7, hi: 0.95 }, progress: 0.4, keys: [{ key: '空格', label: '举到顶时按' }], choices: [BYE] }],
  'farm-sow': ['farm:grind', { title: '下种', steps: CHAIN, step: 1, text: '这一季能下：麦（秋种，来年夏收）\n谷（春种秋收）\n豆（夏种秋收）', hint: '挑一样种子', items: [{ id: 'seedWheat', n: 2 }, { id: 'seedMillet', n: 1 }, { id: 'seedBean', n: 0 }, { id: 'seedGreens', n: 3 }], choices: [BYE] }],
  'farm-weed': ['farm:thresh', { title: '锄草', steps: CHAIN, step: 3, hint: '点垄沟里的草，人走过去拔掉', count: 2, total: 9, progress: 0.22, choices: [BYE], tags: WEEDS }],
  'farm-done': ['farm:grind', { title: '打场', steps: CHAIN, step: 8, text: '打完了。秸秆挑到一边，场上剩一堆连糠带粒的六升。\n扬一扬，借风把糠扬走。', lines: ['春耕夏耘秋收', '冬藏四者不失时'], source: '《荀子·王制》', done: true, choices: [{ id: 'winnow', label: '扬场', main: true }, BYE] }],
};
// 观星（夜里）：点着一颗星时只出话；四象那一步五枚签排一行
const STAR = { kind: 'stars', title: '北斗', hint: '天枢，属紫微垣。在北方，高四十度。', text: '北斗七星，所谓璇玑玉衡以齐七政。斗为帝车，运于中央，临制四乡。分阴阳，建四时，均五行，移节度，定诸纪，皆系于斗。', source: '《史记·天官书》', gloss: '北斗七颗星，像一把勺子；勺柄一年里转一圈，古人看它指向哪里定四时。' };
const STAR_XIANG = { kind: 'stars', title: '四象', hint: '二十八宿分作四方，每方七宿', text: '东方苍龙，南方朱雀，西方白虎，北方玄武。', source: '《史记·天官书》（大意）', choices: [{ id: 'x:0', label: '苍龙' }, { id: 'x:1', label: '朱雀' }, { id: 'x:2', label: '白虎' }, { id: 'x:3', label: '玄武' }, { id: 'back', label: '罢' }] };

for (const size of sizes) {
  const s = SIZES[size], d = join(root, size);
  mkdirSync(d, { recursive: true });
  const issues = [];
  const shot = async (name) => page.screenshot({ path: join(d, `${name}.png`) });
  const check = async (name, o) => { issues.push(...(await fit(page, `${size} ${name}`, o)).map((x) => `${name}: ${x}`)); await shot(name); };
  const touch = !!s.mobile;
  const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = (ms) => page.waitForTimeout(ms);
  console.log(`\n==== ${size} ${s.w}×${s.h} ====`);
  // —— 题名页 ——
  let page, ctx, logs;
  if (want('title')) {
    ({ page, ctx, logs } = await open(b, '?flow=0&t=day&season=spring&w=clear', size, { wait: 2600 }));
    await check('title');
    report(`${size} title`, logs.filter((l) => !/没能备好|Failed to load|    at |声音没能打开/.test(l)));
    await ctx.close();
  }
  // 头一回来的样子：还没走过（出走法提示）。「Shift 跑」那一回提示在 flow.mjs 里看，这里当已经告诉过（免得它浮起、退下时把别的挤来挤去）
  ({ page, ctx, logs } = await open(b, '?auto&s=yard&t=day&flow=0&season=spring&w=clear', size, { wait: 2200, storage: { 'anlewo:v1': { v: 1, walked: false, runTold: true, visits: 1, world: { folk: { f: { tea: { s: 'on', d: 0 }, fish: { s: 'half', d: 0 } }, p: { elder: { n: 3, v: 8, d: 0 }, farmer: { n: 6, v: 13, d: 0 }, farmwife: { n: 1, v: 1, d: 0 } } } } } } }));
  const out = (sel) => ev((sel) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).opacity !== '0'; }, sel);
  if (want('roam')) { await wait(1400); await check('roam'); }
  if (want('near')) {
    // 站到读联跟前：签添朱；触屏右下出那方印
    await ev(() => { const k = window.__ks, a = k.acts.couplet ?? Object.values(k.acts)[0]; k.player.teleport(a.spot.x, a.spot.z + 0.6, Math.PI); k.nav.snapBehind(); });
    await wait(1400);
    await check('near');
    if (touch) console.log(`    「疾」${(await out('[data-testid="run-key"]')) ? '在' : '不在'}；印${(await out('[data-testid="act-key"]')) ? '在' : '不在'}`);
  }
  if (want('notes')) {
    // 等走法提示退干净（它退下时，浮着的话会跟着往下挪）
    await wait(2600);
    await ev(() => { const k = window.__ks; k.note('得麦三捆', 'bag'); k.note('王婶记下了你的好', 'folk'); k.note('天快黑了，村里升起了炊烟'); });
    await wait(1000);
    await check('notes');
    await wait(4200);
  }
  if (want('menu')) {
    await tap('[data-testid="key-menu"]'); await wait(700);
    await check('menu');
    await page.keyboard.press('Escape'); await ev(() => window.__ui.setUi({ menu: false })); await wait(300);
  }
  // —— 「初到」：头一页与末一页（「关于」「今日」里可以再叫出来） ——
  if (want('guide') || want('guide-4') || want('guide-5')) {
    await ev(() => window.dispatchEvent(new Event('ks:guide'))); await wait(1100);
    if (want('guide')) await check('guide');
    if (want('guide-4')) { for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await wait(250); } await wait(700); await check('guide-4'); }
    if (want('guide-5')) { for (let i = 0; i < (want('guide-4') ? 1 : 4); i++) { await page.keyboard.press('ArrowRight'); await wait(250); } await wait(700); await check('guide-5'); }
    await page.keyboard.press('Escape'); await wait(500);
    if (await ev(() => !!document.querySelector('[data-testid="guide"]'))) issues.push('guide: Esc 没收起');
  }
  // —— 每一页册子 ——
  for (const sh of ['today', 'map', 'sky', 'bag', 'bag-full', 'xiang-sheet', 'sound', 'journal', 'about', 'folk', 'folk-place', 'folk-open', 'stars']) {
    if (!want(sh)) continue;
    const id = sh === 'bag-full' ? 'bag' : sh === 'xiang-sheet' ? 'xiang' : sh.startsWith('folk') ? 'folk' : sh;
    if (sh === 'bag-full') await ev(() => { const g = window.__ks.bag; for (const [k, n] of [['sheaf', 12], ['wheat', 3], ['seedWheat', 2], ['egg', 2], ['peach', 5], ['tea', 1], ['candy', 3], ['coin', 120], ['firewood', 1]]) g.add(k, n, { quiet: true }); });
    if (sh === 'journal') await ev(() => { const u = window.__ui; for (const e of [{ kind: 'xiang', text: '井' }, { kind: 'farm', text: '割麦' }, { kind: 'poem', text: '一编诗逸收花月，一部书严惊鬼神。' }, { kind: 'farm', text: '打场' }, { kind: 'qin', n: 7 }, { kind: 'favor', text: '给槐树下的老人端一碗热茶' }, { kind: 'farm', text: '扬场' }, { kind: 'talk', text: '王婶' }]) u.saved.set((s) => ({ ...s, journal: [...s.journal, { ...e, t: Date.now() }] })); });
    const has = await ev((id) => { window.__ui.setUi({ sheet: id, menu: false }); return true; }, id);
    await wait(900);
    const open_ = await ev(() => !!document.querySelector('.sheet'));
    if (!open_) { console.log(`    （${sh} 这一页没有）`); await ev(() => window.__ui.setUi({ sheet: null })); continue; }
    void has;
    // 村人簿：按此刻在哪分；点开一个人（家里人、「去找他」都在里头），再点一个家里人翻过去
    if (sh === 'folk-place') { await page.locator('[data-testid="folk-by-place"]').click(); await wait(500); }
    if (sh === 'folk-open') {
      await page.locator('[data-testid="folk-by-home"]').click(); await wait(300);
      const row = page.locator('.folk-row .folk-head').first();
      if (await row.count()) { await row.click(); await wait(700); }
      console.log(`    村人簿：点开了${await ev(() => document.querySelectorAll('.folk-row.is-open').length)}个人；家里人${await page.locator('.folk-kin-key').count()}个；托事${await ev(() => document.querySelectorAll('.folk-tasks li').length)}件`);
      const kin = page.locator('.folk-kin-key').first();
      if (await kin.count()) { const to = await kin.getAttribute('data-testid'); await kin.click(); await wait(800); console.log(`    点家里人（${to}）：翻到 ${await ev(() => document.querySelector('.folk-row.is-open')?.dataset.testid ?? '无')}`); }
    }
    await check(sh);
    // 册页里滚到底再看一眼（底下的字别被横杠挡）
    const scrolled = await ev(() => { const b = document.querySelector('.sheet-body'); if (!b || b.scrollHeight <= b.clientHeight + 2) return false; b.scrollTop = b.scrollHeight; return true; });
    if (scrolled) { await wait(400); await check(`${sh}-end`, { contrast: false }); }
    await ev(() => window.__ui.setUi({ sheet: null })); await wait(300);
  }
  // —— 做事 ——
  if (want('book')) {
    await ev(() => { const k = window.__ks; if (k.act) k.exitAct(); k.enterAct('book', true); });
    await wait(1800);
    await check('book');
  }
  if (want('read')) {
    await ev(() => { const k = window.__ks; if (!k.act || k.act.id !== 'book') k.enterAct('book', true); });
    await wait(600);
    await ev(() => window.__ks.cmd('yi'));
    await wait(1500);
    await check('read');
  }
  if (want('write')) {
    await ev(() => { const k = window.__ks; if (k.act) k.exitAct(); k.enterAct('book', true); });
    await wait(700);
    await ev(() => window.__ks.cmd('write'));
    await wait(1800);
    await check('write');
  }
  for (const [name, st, act] of [['said', SAID], ...Object.entries(FARM).map(([n, [a, st]]) => [n, st, a]), ['xiang', XIANG], ['talk', { kind: 'talk', title: '问桑麻', who: '老农', text: '今年雨水匀，桑叶长得好。蚕眠了三回，再过几日就上山了。', choices: [{ id: 'more', label: '再问' }, { id: 'bye', label: '别过' }] }], ['widgets', WIDGETS], ['items', ITEMS], ['long', LONG]]) {
    if (!want(name)) continue;
    // 台子没有（这一处没有这件事）就用书案
    const host = act ? await ev((id) => (window.__ks.acts[id] ? id : 'book'), act) : undefined;
    await fakeAct(page, st, host);
    await wait(1600);
    await check(name);
    if (name === 'widgets') {
      // 按住大键：发出 down，松开发出 up
      const box = await page.locator('[data-testid="act-hold"]').boundingBox();
      if (box) {
        if (touch) {
          const cdp = await ctx.newCDPSession(page);
          const pt = [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 }];
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt }); await wait(300);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await wait(300); await page.mouse.up();
          await page.keyboard.down(' '); await wait(200); await page.keyboard.up(' ');
        }
        await wait(200);
        const got = (await cmds(page)).map((c) => `${c[0]}:${c[1]}`).join(' ');
        const okHold = touch ? got === 'cut:down cut:up' : got === 'cut:down cut:up cut:down cut:up';
        console.log(`    大键：${got || '没发出指令'}${okHold ? '' : '  ✗'}`);
        if (!okHold) issues.push(`widgets: 大键发出的指令不对（${got}）`);
      }
      // 小签：点一枚
      const tag = page.locator('.tag[data-on="1"] .tag-key').first();
      if (await tag.count()) { await tag.click({ force: true }).catch(() => {}); await wait(150); const got = (await cmds(page)).map((c) => `${c[0]}:${c[1]}`).join(' '); console.log(`    小签：${got || '没发出指令'}`); if (!/^tag:/.test(got)) issues.push('widgets: 点小签没发出 tag'); }
      const shownTags = await ev(() => document.querySelectorAll('.tag[data-on="1"]').length);
      console.log(`    小签出了 ${shownTags} / 6 枚`);
    }
    if (name === 'items') {
      const it = page.locator('[data-testid="item-egg"]');
      if (await it.count()) { await it.click(); await wait(150); const got = (await cmds(page)).map((c) => `${c[0]}:${c[1]}`).join(' '); console.log(`    挑东西：${got}`); if (got !== 'item:egg') issues.push(`items: 挑东西发出的指令不对（${got}）`); }
    }
  }
  await realAct(page);
  await ev(() => { const k = window.__ks; if (k.act) k.exitAct(); });
  await wait(600);
  // —— 夜里 ——
  if (want('night')) {
    await ev(() => { window.__ks.setTime('night', true); });
    await wait(3600);
    await check('night-roam');
    await ev(() => window.__ui.setUi({ sheet: 'sky' })); await wait(900);
    await check('night-sky');
    await ev(() => window.__ui.setUi({ sheet: null })); await wait(300);
    // 夜里在外头抬头、点天：出一张星笺（直接给世界一个方向：此刻二十度以上最亮的那颗星；再找一处天汉，那一张字最多）
    // （前面几屏做过的事把人留在草堂里了：先出门，站到柴门前，屋里点天不出星笺）
    await ev(() => { const k = window.__ks; k.player.teleport(0.2, 13.4, Math.PI, 'ground'); k.nav.snapBehind(); });
    await wait(1200);
    await ev(() => { const n = window.__ks.nav; n.pitch = -0.75; });
    await wait(1400);
    const starCard = await ev(() => {
      const k = window.__ks, sky = k.atmos.sky;
      for (let i = 0; i < 60; i++) { const d = sky.dir(i); if (d.y > 0.34) { const c = k.skyTap(d, 0.004); if (c) return c.title; } }
      return null;
    });
    await wait(900);
    if (!starCard) issues.push('sky-card: 夜里点天没有出星笺');
    else { console.log(`    点星：${starCard}`); await check('sky-card'); }
    const hanCard = await ev(() => {
      const k = window.__ks;
      for (let el = 30; el <= 80; el += 10) for (let az = 0; az < 360; az += 10) {
        const e = (el * Math.PI) / 180, a = (az * Math.PI) / 180, d = new k.world.camera.position.constructor(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
        const c = k.skyTap(d, 0.0005); if (c && c.kind === 'han') return c.hint;
      }
      return null;
    });
    await wait(900);
    if (!hanCard) console.log('    （此刻天汉不在高处，不量天汉那一张）');
    else { console.log(`    点天汉：${hanCard}`); await check('sky-card-han'); }
    const close = page.locator('[data-testid="sky-close"]');
    if (await close.count()) {
      await (s.mobile ? close.tap() : close.click()); await wait(500);
      if (await ev(() => window.__ui.ui.get().sky)) issues.push('sky-card: 点「收」没有收起星笺');
    }
    await ev(() => { const n = window.__ks.nav; n.pitch = 0.4; });
    await wait(600);
    await fakeAct(page, WIDGETS); await wait(1500);
    await check('night-widgets');
    await fakeAct(page, LONG); await wait(1500);
    await check('night-long');
    await realAct(page);
    await ev(() => { const k = window.__ks; if (k.act) k.exitAct(); });
    await wait(800);
    // 观星：真的铺席坐下（等镜头抬起来），再换成「点着一颗星」与「四象」两步。面板收紧：竖屏时天要留出六成以上
    const sky = async (name) => {
      const top = await ev(() => { let t = innerHeight; for (const el of document.querySelectorAll('.act .panel, .act .act-foot')) { const r = el.getBoundingClientRect(); if (r.height > 2 && r.bottom > innerHeight * 0.5) t = Math.min(t, r.top); } return t / innerHeight; });
      const wide = s.w > s.h * 1.15 && s.w >= 600;
      console.log(`    ${name}：面板上沿在屏高的 ${(top * 100).toFixed(0)}%${wide ? '（宽屏：面板在右下）' : ''}`);
      if (!wide && top < 0.6) issues.push(`${name}: 观星面板占得太多（上沿在 ${(top * 100).toFixed(0)}%，天不到六成）`);
    };
    const can = await ev(() => { const k = window.__ks; if (!k.acts.stars) return false; k.enterAct('stars', true); return !!k.act; });
    if (can) {
      await wait(5200);
      await check('stars-look'); await sky('stars-look');
      await fakeAct(page, STAR, 'stars'); await wait(1200);
      await check('stars-star'); await sky('stars-star');
      const more = page.locator('[data-testid="act-more"]');
      if (await more.count()) { await more.click(); await wait(500); await check('stars-star-open'); }
      await fakeAct(page, STAR_XIANG, 'stars'); await wait(1200);
      await check('stars-xiang'); await sky('stars-xiang');
      const oneRow = await ev(() => { const ks = [...document.querySelectorAll('.choices.is-row .panel-acts > *')].map((e) => e.getBoundingClientRect().top); return ks.length ? Math.max(...ks) - Math.min(...ks) < 8 : true; });
      if (!oneRow) issues.push('stars-xiang: 观星的签没排成一行');
      await realAct(page);
      await ev(() => { const k = window.__ks; if (k.act) k.exitAct(); });
    } else console.log('    （这一回没有观星可做）');
  }
  report(`${size}`, logs.filter((l) => !/没能备好|Failed to load|    at |声音没能打开/.test(l)));
  await ctx.close();
  total[size] = issues.length;
}
await b.close();
console.log('\n问题条数：' + Object.entries(total).map(([k, v]) => `${k} ${v}`).join('，'));
process.exit(Object.values(total).some((v) => v > 0) ? 1 : 0);
