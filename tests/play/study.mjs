// 学的那几样（修为、学堂讲卦、打坐、发光路标、修为册页），在浏览器里一样一样过一遍：
//   一、独游听一讲：走到村塾前就开讲（孩子回席、塾师让座、先生走来）→ 抢一领空席坐下 → 六句一句一句讲 → 三问都答对 → 答题榜、修为长了 → 起身；
//   二、打坐两重修为：知止只到「一时」、深不下去；静能到「一月」；动一下慢慢出定；起身、硬收、出错三条路上天时都还回来（时辰、季、月、月相、天气），
//       不过日子、不存月；打坐榜记下最深的一回；
//   三、取一象、留一盏灯、走开再点开看、收回（独游：只在本机）；
//   四、册页与面板在几种尺寸下放得下（1280×800、393×714、375×548、714×393、360×640，昼夜各看）：出界、截断、键太小、相叠、对比；
//   五、同游：本机起中转（3842），两页同一讲（同一格、同一卦、同样三问）、同时抢同一席两边判得一样、看见对方坐着、一页留的灯另一页看得见点得开；
//   六、开销：先生、路标、石与蒲团各添几次绘制、多少三角；学堂、路标每帧多少毫秒。
// 用法：KS_URL=http://localhost:3832/ node tests/play/study.mjs [--no-pvp] [--no-ui] [--only=solo,sit,mark,ui,pvp,perf]
//   （先起一个不做热更新的开发服务器；KS_RELAY_PORT 换中转的端口，默认 3842）
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { Report } from './lib.mjs';
import { SIZES, fit, launch } from './uikit.mjs';

const APP = (process.env.KS_URL ?? 'http://localhost:3832/').replace(/world\.html.*$/, '').replace(/\?.*$/, '');
const ORIGIN = new URL(APP).origin;
const PORT = Number(process.env.KS_RELAY_PORT ?? 3842), WS = `ws://localhost:${PORT}/ws`;
const ROOT = join(import.meta.dirname, '..', '..');
const SHOTS = join(ROOT, 'shots', 'study');
mkdirSync(SHOTS, { recursive: true });
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only='))?.slice(7).split(',')) ?? null;
const want = (s) => (!only || only.includes(s)) && !args.includes(`--no-${s}`);
const R = new Report();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const real = (logs) => logs.filter((l) => !/WebSocket connection to|ERR_CONNECTION_REFUSED|net::ERR_|Failed to load resource/i.test(l));

/** 开一页（url 是完整的网址；size 是 uikit 的尺寸名或 {w,h,mobile,dpr}）；o.init：页面开头先跑的一段（改钟、改存档） */
async function openAt(browser, url, size = { w: 1280, h: 800 }, o = {}) {
  const s = typeof size === 'string' ? SIZES[size] : size;
  const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr ?? 1, isMobile: !!s.mobile, hasTouch: !!s.mobile, ...(o.tz ? { timezoneId: o.tz } : {}) });
  if (o.init) await ctx.addInitScript(o.init.fn, o.init.arg);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|ReadPixels/.test(m.text()))) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 900)}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true || !!document.querySelector('.fatal'), null, { timeout: 120000 }).catch(() => logs.push('等 __ready 超时'));
  await page.waitForTimeout(o.wait ?? 900);
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  return { page, ctx, logs };
}
const shotTo = (p, name) => p.screenshot({ path: join(SHOTS, `${name}.png`) });
const until = async (p, fn, arg, ms = 15000, step = 200) => { const t0 = Date.now(); for (;;) { const v = await p.evaluate(fn, arg).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } };
/** 学堂此刻的样子 */
const lec = (p) => p.evaluate(() => {
  const L = window.__lecture, v = L.view(), k = window.__ks;
  return {
    on: v.on, ph: v.phase.kind, i: v.phase.i ?? null, t: v.phase.t, id: v.plan?.id ?? null, gua: v.plan?.lesson.gua.name ?? null, group: v.group,
    seats: v.seats.map((s) => [s.kind, s.who]), my: v.mySeat, pend: v.pending, act: k.act?.id ?? null, pose: k.player.av.pose,
    master: !!L.masterAt(), kids: ['kid1', 'kid2', 'kid3'].map((id) => k.life?.npcs[id]?.act ?? null), teacher: k.life?.npcs.teacher?.act ?? null,
    quiz: v.plan ? v.plan.lesson.quiz.map((q) => q.answer) : null, board: v.board, answers: v.answers.map((a) => a.right), text: k.act?.state?.text ?? null, source: k.act?.state?.source ?? null,
  };
});
/** 天时、存档里要紧的几份（打坐前后比） */
const sky = (p) => p.evaluate(() => {
  const k = window.__ks;
  return { hour: +k.atmos.hour.toFixed(3), season: k.season, month: k.month, moon: +k.atmos.moonPhase.toFixed(3), w: k.atmos.weather, day: k.day, vision: !!k.vision, veil: +k.veil.toFixed(2), xx: JSON.stringify(k.mem.get('xiaoxi', {})), memDay: k.mem.get('day', 0), fps: k.world.fpsCap, uM: JSON.stringify(k.atmos.sky.now ? Array.from(k.atmos.sky.now.M).map((x) => +x.toFixed(4)) : null) };
});
const sitv = (p) => p.evaluate(() => { const v = window.__sit, k = window.__ks; return { act: k.act?.id ?? null, tier: v.tier, depth: v.depth, cap: v.cap, deep: v.deepest, pose: k.player.av.pose, state: k.act?.state ?? null }; });

let browser = await launch();
let relay = null;
async function startRelay() {
  relay = spawn(process.execPath, [join(ROOT, 'server', 'relay.mjs')], { cwd: ROOT, env: { ...process.env, KS_RELAY_PORT: String(PORT), KS_RELAY_PER_IP: '64' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  relay.stdout.on('data', (d) => { out += d; });
  relay.stderr.on('data', (d) => { out += d; });
  for (let i = 0; i < 60 && !/relay on/.test(out); i++) await sleep(100);
  if (!/relay on/.test(out)) throw new Error(`中转没起来：${out}`);
}
async function stopRelay() { if (!relay) return; const p = relay; relay = null; const gone = new Promise((r) => p.once('exit', r)); p.kill(); await Promise.race([gone, sleep(3000)]); }
const pages = [];
const cleanup = async () => { for (const x of pages) await x.ctx.close().catch(() => {}); await browser.close().catch(() => {}); await stopRelay(); };
process.on('SIGINT', async () => { await cleanup(); process.exit(1); });

try {
  // ———— 一、独游听一讲 ————
  if (want('solo')) {
    console.log('一、独游听一讲');
    const A = await openAt(browser, `${ORIGIN}/world.html?s=village&t=10&season=spring&w=clear&q=mid&hud=0`);
    pages.push(A);
    const p = A.page;
    const x0 = await p.evaluate(() => window.__ks.mem.get('xiu', {}).pts ?? 0);
    R.ok('白天没走近村塾时不讲', !(await lec(p)).on);
    // 村路贴着前檐外过（檐外一步多）：沿着村路走过去，不开讲
    await p.evaluate(() => { const k = window.__ks; k.player.teleport(84, 13.6, Math.PI / 2); k.nav.snapBehind(); k.player.goTo(116, 8.1); });
    let passed = false;
    for (let n = 0; n < 40; n++) { await sleep(500); if ((await lec(p)).on) { passed = true; break; } if (await p.evaluate(() => !window.__ks.player.walking)) break; }
    R.ok('沿着村路走过村塾，不开讲（走过路过不算）', !passed);
    await p.evaluate(() => { const k = window.__ks; k.player.teleport(101.6, 9.5, Math.PI); k.nav.snapBehind(); });
    const s0 = await until(p, () => window.__lecture.view().on);
    let s = await lec(p);
    R.ok('走到村塾前就开讲（聚）', !!s0 && s.ph === 'gather', `${s.ph} 讲「${s.gua}」`);
    R.ok('独游从乾讲起', s.gua === '乾', s.gua);
    await sleep(2500);
    s = await lec(p);
    R.ok('孩子们回席、塾师让出高桌到檐下', s.kids.every((a) => a === 'school') && s.teacher === 'read', `${s.kids.join(',')} 塾师 ${s.teacher}`);
    R.ok('先生走来了', s.master);
    R.ok('三领席是孩子们的，三领空着', s.seats.filter((x) => x[0] === 'kid').length === 3 && s.seats.filter((x) => x[0] === 'free').length === 3, s.seats.map((x) => x[0][0]).join(''));
    await p.evaluate(() => { const L = window.__lecture; L.plan.skip += 14; window.__ks.enterAct('lecture'); });
    const inAct = await until(p, () => window.__ks.act?.id === 'lecture', null, 12000);
    R.ok('走到檐下、开始听', !!inAct);
    await shotTo(p, 'solo-lecture-gather');
    await p.evaluate(() => window.__ks.cmd('tag', 'seat3'));
    const seated = await until(p, () => window.__lecture.mySeatNow() === 3 && window.__ks.player.av.pose === 'sit', null, 20000);
    s = await lec(p);
    R.ok('抢到第三席（后排西），沿着桌间的空当走过去坐下', !!seated, `席 ${s.my} 姿势 ${s.pose}`);
    // 讲：等到开讲，一句一句跳过（独游可以点画面听下一句）
    await p.evaluate(() => { const L = window.__lecture, ph = L.phase(); if (ph.kind === 'gather') L.plan.skip += ph.t1 - ph.t + 0.05; });
    const seen = [];
    for (let n = 0; n < 14; n++) {
      await sleep(450);
      s = await lec(p);
      if (s.ph !== 'line') break;
      if (s.text && !seen.find((x) => x.i === s.i)) seen.push({ i: s.i, text: s.text, source: s.source });
      if (s.i === 2) await shotTo(p, 'solo-lecture-line');
      await sleep(1400);
      await p.evaluate(() => window.__lecture.skipLine());
      await sleep(250);
    }
    const lines = await p.evaluate(() => window.__lecture.plan.lesson.lines.map((l) => ({ text: l.text, source: l.source ?? null })));
    R.ok('六句都讲到了', seen.length === 6, `${seen.length} 句`);
    // 末一句收尾时先生接着说「问你们三句。」（问的时候面板里就只有题与答案）
    R.ok('面板里的话就是这一讲的字（卦辞注《周易·乾》）', seen.every((x) => lines[x.i] && x.text === lines[x.i].text + (x.i === lines.length - 1 ? '问你们三句。' : '')) && seen.some((x) => x.source === '《周易·乾》' && x.text === '元亨利贞。'), seen.map((x) => (x.text ?? '').slice(0, 8)).join(' / '));
    // 问：三题都答对
    for (let q = 0; q < 3; q++) {
      const ok = await until(p, (q) => { const ph = window.__lecture.phase(); return ph.kind === 'ask' && ph.i === q; }, q, 8000);
      if (!ok) break;
      const ans = await p.evaluate((q) => window.__lecture.plan.lesson.quiz[q].answer, q);
      if (q === 0) await shotTo(p, 'solo-lecture-ask');
      await sleep(300);
      await p.evaluate((a) => window.__ks.cmd(`a${a}`), ans);
      await sleep(400);
    }
    s = await lec(p);
    R.ok('三题都答对了', s.answers.length === 3 && s.answers.every(Boolean), JSON.stringify(s.answers));
    await until(p, () => window.__lecture.phase().kind === 'show', null, 8000);
    s = await lec(p);
    const me = s.board.find((b) => b.me);
    R.ok('散的时候排出这一回的榜（自己、三个孩子）', s.ph === 'show' && !!me && me.right === 3 && s.board.filter((b) => b.kid).length === 3, me ? `我 ${me.score} 分` : '');
    await shotTo(p, 'solo-lecture-show');
    const after = await p.evaluate(() => ({ pts: window.__ks.mem.get('xiu', {}).pts ?? 0, quiz: window.__ks.mem.get('board', {}).best?.quiz ?? null, heard: window.__ks.mem.get('xiu', {}).heard ?? [] }));
    R.ok('答题榜记下了', after.quiz != null && after.quiz >= 30, `答题 ${after.quiz}`);
    R.ok('修为长了（入座听完 6 + 头一回听的卦 2 + 三题各 2–3）', after.pts - x0 >= 14, `${x0} → ${after.pts}`);
    R.ok('记下这一卦听过了', after.heard.includes(0));
    await p.evaluate(() => window.__ks.cmd('done'));
    const out = await until(p, () => !window.__ks.act && window.__ks.player.av.pose === 'stand', null, 20000);
    R.ok('起身沿空当走回檐下、站起来能走', !!out);
    R.ok('没有报错', real(A.logs).length === 0, real(A.logs).slice(0, 2).join(' | '));
    await A.ctx.close(); pages.splice(pages.indexOf(A), 1);
  }

  // ———— 二、打坐 ————
  if (want('sit')) {
    console.log('二、打坐');
    const B = await openAt(browser, `${ORIGIN}/world.html?s=bridge&t=10&season=spring&w=rain&q=mid&hud=0`);
    pages.push(B);
    const p = B.page;
    const before = await sky(p);
    // 知止（修为 0）：只到一时
    await p.evaluate(() => { const k = window.__ks; k.mem.set('xiu', { pts: 0 }); k.player.teleport(16.6, 53.6, 0); k.nav.snapBehind(); k.enterAct('sit'); });
    await until(p, () => window.__ks.act?.id === 'sit' && window.__ks.player.av.pose === 'sit', null, 15000);
    let v = await sitv(p);
    R.ok('走到石边、盘腿坐上蒲团', v.act === 'sit' && v.pose === 'sit', `修为够得着第 ${v.cap} 境`);
    await sleep(800);
    await shotTo(p, 'sit-seated');
    await p.evaluate(() => { window.__sit.depth = 6.1; });
    await until(p, () => window.__sit.tier === 0, null, 6000);
    await sleep(2200);
    const shi = await sky(p);
    R.ok('静下来，进了「一时」：看的是此刻的天（只在画里）', shi.vision && (await sitv(p)).tier === 0);
    await p.evaluate(() => { window.__sit.depth = 140; });
    await sleep(2500);
    v = await sitv(p);
    R.ok('知止深不下去：停在「一时」', v.tier === 0 && v.cap === 0, `第 ${v.tier} 境`);
    // 动一下：慢慢出定
    await p.evaluate(() => window.__ks.act.input.tap());
    await until(p, () => window.__sit.tier === -1 && !window.__ks.vision, null, 6000);
    const risen = await sky(p);
    R.ok('点一下，慢慢出定：天时回到此刻', risen.hour === before.hour && !risen.vision, `${risen.hour}`);
    await p.evaluate(() => window.__ks.cmd('done'));
    await sleep(600);
    const sum = (await sitv(p)).state;
    R.ok('起身前一页：坐了多久、到了哪一境，配一句《皇极经世》', !!sum && /到了「一时」/.test(sum.text) && /人心当如止水则定/.test(sum.text) && /观物外篇/.test(sum.source ?? ''), sum?.text?.slice(0, 30));
    await p.evaluate(() => window.__ks.cmd('bye'));
    await until(p, () => !window.__ks.act, null, 5000);
    let back = await sky(p);
    const same = (a, b) => a.hour === b.hour && a.season === b.season && a.month === b.month && a.moon === b.moon && a.w === b.w && a.day === b.day && a.xx === b.xx && a.memDay === b.memDay && !b.vision && b.veil === 0 && b.fps === 0;
    R.ok('起身：时辰、季、月、月相、天气都还回来，没过日子、没存月', same(before, back), JSON.stringify({ before: [before.hour, before.season, before.month, before.moon, before.w, before.day], back: [back.hour, back.season, back.month, back.moon, back.w, back.day] }));
    const sb = await p.evaluate(() => window.__ks.mem.get('board', {}).best?.sit ?? null);
    R.ok('打坐榜记下最深的一回（一时）', sb != null && Math.floor(sb / 1000) === 1, `${sb}`);
    // 静（修为 100）：能到一月；硬收（世界替你起身）也还得回来
    await p.evaluate(() => { const k = window.__ks; k.mem.set('xiu', { pts: 100 }); k.enterAct('sit'); });
    await until(p, () => window.__ks.act?.id === 'sit' && window.__ks.player.av.pose === 'sit', null, 15000);
    await p.evaluate(() => { window.__sit.depth = 6.1; });
    await until(p, () => window.__sit.tier === 0, null, 6000);
    await p.evaluate(() => { window.__sit.depth = 46.1; });
    await until(p, () => window.__sit.tier === 1, null, 6000);
    await sleep(1500);
    await p.evaluate(() => { window.__sit.depth = 70; });
    await sleep(1800);
    await shotTo(p, 'sit-ye');
    const ye = await sky(p);
    const lines = await p.evaluate(() => { const sk = window.__ks.atmos.sky, d = sk.data.find('北斗'); return d ? sk.lines.get(d.i) : -1; });
    R.ok('「一夜」：夜里、晴（下着雨也一样）、北斗描出来', ye.vision && (ye.hour > 18 || ye.hour < 6) && ye.w === 'clear' && lines > 0.2, `${ye.hour} 点 ${ye.w} 北斗 ${lines.toFixed(2)}`);
    await p.evaluate(() => { window.__sit.depth = 96.1; });
    await until(p, () => window.__sit.tier === 2, null, 6000);
    await sleep(1500);
    await p.evaluate(() => { window.__sit.depth = 128; });
    await sleep(1800);
    await shotTo(p, 'sit-yue');
    const yue = await sky(p);
    v = await sitv(p);
    R.ok('静能到「一月」：月相跟着变', v.tier === 2 && yue.moon !== before.moon && v.cap === 2, `月相 ${yue.moon}`);
    await p.evaluate(() => { window.__sit.depth = 400; });
    await sleep(2000);
    R.ok('静深不过「一月」', (await sitv(p)).tier === 2);
    await p.evaluate(() => window.__ks.exitAct());
    await until(p, () => !window.__ks.act, null, 5000);
    await sleep(500);
    back = await sky(p);
    R.ok('硬收（不经起身那一页）：一样还回来', same(before, back), JSON.stringify([back.hour, back.season, back.month, back.moon, back.w]));
    // 一岁（安）与入定（虑）：换季、下雪、岁差，也都还回来
    await p.evaluate(() => { const k = window.__ks; k.mem.set('xiu', { pts: 400 }); k.enterAct('sit'); });
    await until(p, () => window.__ks.act?.id === 'sit' && window.__ks.player.av.pose === 'sit', null, 15000);
    await p.evaluate(() => { window.__sit.depth = 146.1; });
    await until(p, () => window.__sit.tier === 3, null, 8000);
    await p.evaluate(() => { window.__sit.depth = 146 + 60 * 0.6; });
    await sleep(2500);
    const sui = await sky(p);
    await shotTo(p, 'sit-sui');
    R.ok('「一岁」：画里换到冬天、下雪（只在画里）', sui.season === 'winter' && sui.w === 'snow', `${sui.season} ${sui.w}`);
    await p.evaluate(() => { window.__sit.depth = 206.1; });
    await until(p, () => window.__sit.tier === 4, null, 8000);
    await p.evaluate(() => { window.__sit.depth = 206 + 60 * 0.85; });
    await sleep(2500);
    await shotTo(p, 'sit-ding');
    const ding = await p.evaluate(() => { const k = window.__ks; return { season: k.season, moon: k.atmos.moonPhase, near: window.__sit.nearName }; });
    R.ok('「入定」：一会以后近北极的星算出来了', !!ding.near && ding.moon === 0, `近北极：${ding.near}`);
    // 出错：天象推的那一步出了错——先收天象，再起身
    await p.evaluate(() => { window.__sit.step = () => { throw new Error('打坐测试：故意出的错'); }; });
    await until(p, () => !window.__ks.act, null, 6000);
    // 画里的钟点是慢慢走回此刻的（星斗的矩阵跟着它）：等它走到了再比
    await until(p, () => !window.__ks.atmos.transitioning && !window.__ks.atmos.seasonFading, null, 15000);
    await sleep(3000);
    back = await sky(p);
    const mDiff = (() => { const x = JSON.parse(before.uM ?? 'null'), y = JSON.parse(back.uM ?? 'null'); return x && y ? Math.max(...x.map((v, i) => Math.abs(v - y[i]))) : 9; })();
    R.ok('出了错也还回来（换过季、下过雪、动过岁差）', same(before, back) && mDiff < 3e-3, same(before, back) ? '星斗矩阵差 ' + mDiff.toFixed(5) : JSON.stringify({ before: { ...before, uM: 0 }, back: { ...back, uM: 0 } }));
    const bad = real(B.logs).filter((l) => !/打坐测试/.test(l) && !/打坐出错/.test(l));
    R.ok('没有别的报错', bad.length === 0, bad.slice(0, 2).join(' | '));
    await B.ctx.close(); pages.splice(pages.indexOf(B), 1);
  }

  // ———— 三、取一象、留灯、看灯 ————
  if (want('mark')) {
    console.log('三、取一象、留灯、看灯');
    const C = await openAt(browser, `${APP}?auto=1&s=bridge&t=21&season=spring&w=clear&flow=0&q=mid&ws=0`, { w: 1280, h: 800 });
    pages.push(C);
    const p = C.page;
    await p.evaluate(() => { const k = window.__ks; k.player.teleport(6, 30, 0); k.nav.snapBehind(); });
    await sleep(1200);
    await p.evaluate(() => window.__ui.setUi({ sheet: 'xiang' }));
    await sleep(900);
    await p.click('[data-testid=xiang-take-go]');
    const took = await until(p, () => window.__ks.act?.id === 'mark', null, 5000);
    R.ok('观象册里点「取一象」：在外头站着就能取', !!took);
    await sleep(1200);
    await shotTo(p, 'mark-upper');
    R.ok('仰观：八卦一盘', (await p.locator('[data-testid=act-tri] button').count()) === 8);
    await p.click('[data-testid=tri-kan]');
    await sleep(900);
    await p.click('[data-testid=tri-zhen]');
    await sleep(1500);
    const card = await p.evaluate(() => window.__ks.act?.state);
    R.ok('上水下雷：出「屯」的象卡（卦辞、大象、白话）', card?.gua === '屯' && (await p.locator('[data-testid=gua-card]').count()) === 1, card?.said);
    await shotTo(p, 'mark-card');
    await p.click('[data-testid=choice-leave]');
    await sleep(900);
    const left = await p.evaluate(() => window.__marks.list.map((m) => ({ g: m.g, mine: m.mine, local: m.local, who: m.who })));
    R.ok('留下一盏灯（没连上同游：只在本机）', left.length === 1 && left[0].g === 2 && left[0].mine && left[0].local, JSON.stringify(left));
    await p.evaluate(() => window.__ks.cmd('done'));
    await sleep(600);
    await p.evaluate(() => { const k = window.__ks; k.player.teleport(9.5, 37.5, Math.atan2(6 - 9.5, 30 - 37.5)); k.nav.snapBehind(); });
    await sleep(2200);
    const mk = await p.evaluate(() => window.__ks.markers.find((m) => m.id === 'mark:0'));
    R.ok('走开几步：名签「路标」看得见', !!mk && mk.visible && mk.label === '路标', mk ? `${mk.dist.toFixed(1)} 米` : '');
    // 截图：从侧面远一点看那一盏（夜里一点灯光、地上一方发亮的印；白天只是一方淡墨的印）
    const side = () => p.evaluate(() => { const k = window.__ks, V = k.player.pos.constructor, y = k.player.pos.y; k.nav.setPose({ pos: new V(13.5, y + 2.6, 35.5), look: new V(6, y - 0.4, 30), fov: 34, yaw: 0, up: 0, down: 0 }, 0.01); });
    await side(); await sleep(1500);
    await shotTo(p, 'mark-glow-night');
    await p.evaluate(() => { const k = window.__ks, V = k.player.pos.constructor, y = k.player.pos.y; k.nav.setPose({ pos: new V(36, y + 6, 52), look: new V(6, y, 30), fov: 30, yaw: 0, up: 0, down: 0 }, 0.01); });
    await sleep(1500);
    await shotTo(p, 'mark-glow-night-far');
    await p.evaluate(() => window.__ks.setTime(10, true)); await side(); await sleep(2500);
    await shotTo(p, 'mark-seal-day');
    await p.evaluate(() => { const k = window.__ks; k.setTime(21, true); k.nav.setPose(null, 0.01); k.nav.snapBehind(); });
    await sleep(1500);
    await p.evaluate(() => window.__ks.enterAct('mark:0'));
    await until(p, () => window.__ks.act?.id === 'mark:0', null, 12000);
    await sleep(1500);
    const vw = await p.evaluate(() => window.__ks.act?.state);
    R.ok('点开：谁留的、几月、什么时辰、天气，与那一象', /留的一盏灯/.test(vw?.who ?? '') && /亥时/.test(vw?.text ?? '') && /晴/.test(vw?.text ?? '') && vw?.gua === '屯', `${vw?.who}｜${(vw?.text ?? '').split('\n')[0]}`);
    await shotTo(p, 'mark-view');
    await p.evaluate(() => window.__ks.cmd('unmark'));
    await sleep(1200);
    R.ok('自己留的可以收回', (await p.evaluate(() => window.__marks.list.length)) === 0);
    await p.evaluate(() => window.__ks.cmd('done'));
    // 一人至多三盏：留第四盏时最早那一盏收回
    for (let n = 0; n < 4; n++) await p.evaluate((n) => { const k = window.__ks; k.player.teleport(2 + n * 3, 30, 0); window.__marks.place(n); }, n);
    await sleep(800);
    R.ok('一人至多三盏', (await p.evaluate(() => window.__marks.mine().length)) === 3);
    R.ok('没有报错', real(C.logs).length === 0, real(C.logs).slice(0, 2).join(' | '));
    await C.ctx.close(); pages.splice(pages.indexOf(C), 1);
  }

  // ———— 四、几种尺寸下的册页与面板 ————
  if (want('ui')) {
    console.log('四、册页与面板在几种尺寸下');
    const sizes = [['desk', { w: 1280, h: 800 }], ['iphone', 'iphone'], ['se', 'se'], ['landscape', 'landscape'], ['android', 'android']].filter(([n]) => !process.env.KS_SIZES || process.env.KS_SIZES.split(',').includes(n));
    for (const [name, size] of sizes) {
      for (const t of ['10', '21']) {
        const D = await openAt(browser, `${APP}?auto=1&s=village&t=${t}&season=spring&w=clear&flow=0&q=mid&ws=0`, size, { wait: 700 });
        const p = D.page, tone = t === '10' ? 'day' : 'night';
        // 存档里放一点修为、一回答题、一回打坐，册页上有东西可看
        await p.evaluate(() => { const k = window.__ks; k.mem.set('xiu', { pts: 126, heard: [0, 1, 2], tiers: [0, 1, 2] }); window.__ui.setUi({ sheet: 'xiu' }); });
        await sleep(1200);
        await shotTo(p, `ui-${name}-${tone}-xiu`);
        const issues = [...await fit(p, `${name} ${tone} 修为·头`)];
        for (const [i, sel] of ['[data-testid=xiu-school]', '[data-testid=xiu-sit]', '.xiu-tabs'].entries()) {
          await p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'start' }), sel);
          await sleep(500);
          if (i === 2) { await p.click('[data-testid=xiu-tab-sit]').catch(() => {}); await sleep(300); }
          issues.push(...await fit(p, `${name} ${tone} 修为·${i + 1}`));
          if (t === '21' || name === 'desk') await shotTo(p, `ui-${name}-${tone}-xiu-${i + 1}`);
        }
        R.ok(`修为册页 ${name} ${tone}：不出界、不截断、键够大、不相叠、字看得清`, issues.length === 0, issues.slice(0, 3).join(' | '));
        await p.evaluate(() => window.__ui.setUi({ sheet: null }));
        // 取一象的八卦盘（面板）
        if (t === '21') {
          await p.evaluate(() => { const k = window.__ks; k.player.teleport(6, 30, 0); k.nav.snapBehind(); window.__takeHere(); });
          await sleep(1600);
          const ti = await fit(p, `${name} 取一象·八卦盘`);
          await shotTo(p, `ui-${name}-take`);
          await p.click('[data-testid=tri-kan]'); await sleep(500); await p.click('[data-testid=tri-zhen]'); await sleep(1300);
          ti.push(...await fit(p, `${name} 取一象·象卡`));
          await shotTo(p, `ui-${name}-take-card`);
          R.ok(`取一象 ${name}：放得下`, ti.length === 0, ti.slice(0, 3).join(' | '));
          await p.evaluate(() => window.__ks.exitAct());
          await sleep(500);
        } else {
          // 白天：听讲的几块面板
          await p.evaluate(() => { const k = window.__ks; k.player.teleport(101.6, 9.5, Math.PI); k.nav.snapBehind(); });
          await until(p, () => window.__lecture.view().on, null, 6000);
          await p.evaluate(() => { const L = window.__lecture; L.plan.skip += 16; window.__ks.enterAct('lecture'); });
          await until(p, () => window.__ks.act?.id === 'lecture', null, 12000);
          await sleep(1200);
          const li = await fit(p, `${name} 听讲·聚`);
          await shotTo(p, `ui-${name}-lecture-gather`);
          await p.evaluate(() => { const L = window.__lecture; L.plan.skip += 36 + 7.5 * 3 + 1 - L.tOf(L.plan); });
          await sleep(1200);
          li.push(...await fit(p, `${name} 听讲·讲`));
          await shotTo(p, `ui-${name}-lecture-line`);
          await p.evaluate(() => { const L = window.__lecture; L.plan.skip += 36 + 45 + 1 - L.tOf(L.plan); });
          await sleep(1200);
          li.push(...await fit(p, `${name} 听讲·问`));
          await shotTo(p, `ui-${name}-lecture-ask`);
          await p.evaluate(() => { const L = window.__lecture; L.plan.skip += 36 + 45 + 45 + 1 - L.tOf(L.plan); });
          await sleep(1200);
          li.push(...await fit(p, `${name} 听讲·散`));
          R.ok(`听讲 ${name}：几块面板放得下`, li.length === 0, li.slice(0, 3).join(' | '));
          // 打坐时只剩题名、一句提示、右下的「起身」
          await p.evaluate(() => { const k = window.__ks; k.exitAct(); k.player.teleport(16.6, 53.6, 0); k.enterAct('sit', true); });
          await sleep(1800);
          const si = await fit(p, `${name} 打坐`);
          await shotTo(p, `ui-${name}-sit`);
          R.ok(`打坐 ${name}：放得下`, si.length === 0, si.slice(0, 3).join(' | '));
        }
        const errs = real(D.logs);
        if (errs.length) R.ok(`${name} ${tone} 没有报错`, false, errs.slice(0, 2).join(' | '));
        await D.ctx.close();
      }
    }
  }

  // ———— 五、同游 ————
  if (want('pvp')) {
    console.log('五、同游');
    await startRelay();
    // 两页的钟一起往前拨到「下一格开讲后三秒」，时区放在伦敦（此刻那里是白天）：园中天时随最早来的那一位，同一格就是同一讲
    const tz = 'Europe/London';
    const londonHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()));
    const SLOT = 10 * 60000, now = Date.now(), target = (Math.floor(now / SLOT) + 1) * SLOT + 3000;
    let off = target - now;
    // 伦敦此刻不是白天（夜里跑测试时）：再往前拨到伦敦的上午十点
    if (londonHour < 7 || londonHour >= 16) { const toTen = ((10 - londonHour + 24) % 24) * 3600000; off = (Math.floor((now + toTen) / SLOT) + 1) * SLOT + 3000 - now; }
    const init = { fn: (o) => { const n0 = Date.now.bind(Date); Date.now = () => n0() + o.off; }, arg: { off } };
    const url = `${APP}?auto=1&s=village&t=10&season=spring&w=clear&flow=0&q=mid&ws=${encodeURIComponent(WS)}`;
    const PA = await openAt(browser, url, { w: 1280, h: 800 }, { tz, init, wait: 300 });
    const PB = await openAt(browser, url, 'iphone', { tz, init, wait: 300 });
    pages.push(PA, PB);
    const a = PA.page, b = PB.page;
    const online = (p) => until(p, () => { const t = window.__net; return t?.status === 'online' && t.remotes.size === 1 && t.ext; }, null, 25000);
    R.ok('两页都连上了，各看见另一位', !!(await online(a)) && !!(await online(b)));
    const idA = await a.evaluate(() => window.__net.myId), idB = await b.evaluate(() => window.__net.myId);
    await a.evaluate(() => { const k = window.__ks; k.player.teleport(101.0, 9.0, Math.PI); k.nav.snapBehind(); });
    await b.evaluate(() => { const k = window.__ks; k.player.teleport(103.0, 9.6, Math.PI); k.nav.snapBehind(); });
    const ga = await until(a, () => window.__lecture.view().group && window.__lecture.view().on, null, 12000), gb = await until(b, () => window.__lecture.view().group && window.__lecture.view().on, null, 12000);
    let sa = await lec(a), sb = await lec(b);
    R.ok('同屋有人：按钟上的格讲（两页都是）', !!ga && !!gb && sa.group && sb.group, `${sa.ph} / ${sb.ph}`);
    R.ok('两页同一讲：同一格、同一卦、同样三问、讲到同一处', sa.id === sb.id && sa.gua === sb.gua && JSON.stringify(sa.quiz) === JSON.stringify(sb.quiz) && Math.abs(sa.t - sb.t) < 1.5, `格 ${sa.id} 卦「${sa.gua}」 ${sa.t.toFixed(1)}s / ${sb.t.toFixed(1)}s`);
    await a.evaluate(() => window.__ks.enterAct('lecture'));
    await b.evaluate(() => window.__ks.enterAct('lecture'));
    await until(a, () => window.__ks.act?.id === 'lecture', null, 12000);
    await until(b, () => window.__ks.act?.id === 'lecture', null, 12000);
    // 抢同一席：甲先要、乙晚一百毫秒要（乙那时还没收到甲的）
    await a.evaluate(() => window.__ks.cmd('tag', 'seat1'));
    await sleep(100);
    await b.evaluate(() => window.__ks.cmd('tag', 'seat1'));
    await sleep(2500);
    sa = await lec(a); sb = await lec(b);
    R.ok('抢同一席：两边判得一样（先要的甲得）', sa.seats[1][0] === 'me' && sb.seats[1][0] === 'peer' && sa.my === 1 && sb.my == null, `甲看 ${sa.seats[1].join('')}，乙看 ${sb.seats[1].join('')}`);
    void idA; void idB;
    await b.evaluate(() => window.__ks.cmd('tag', 'seat5'));
    await until(a, () => window.__ks.player.av.pose === 'sit', null, 20000);
    await until(b, () => window.__ks.player.av.pose === 'sit' && window.__lecture.mySeatNow() === 5, null, 20000);
    await sleep(2500);
    const poseInA = await a.evaluate(() => [...window.__net.remotes.values()].map((r) => r.pose)), poseInB = await b.evaluate(() => [...window.__net.remotes.values()].map((r) => r.pose));
    sa = await lec(a); sb = await lec(b);
    R.ok('各自坐下，互相看见对方坐着', poseInA[0] === 'sit' && poseInB[0] === 'sit' && sa.seats[5][0] === 'peer' && sb.seats[1][0] === 'peer', `甲看乙 ${poseInA[0]}，乙看甲 ${poseInB[0]}`);
    await shotTo(a, 'pvp-lecture-a');
    await shotTo(b, 'pvp-lecture-b');
    // 路标：甲在村塾前留一盏，乙那里看得见、点得开
    await a.evaluate(() => window.__ks.exitAct());
    await b.evaluate(() => window.__ks.exitAct());
    await sleep(1500);
    await a.evaluate(() => { const k = window.__ks; k.player.teleport(96, 12, 0); window.__marks.place(10); });
    const seen = await until(b, () => window.__marks.list.find((m) => !m.mine && m.g === 10 && !m.local), null, 10000);
    const nameA = await a.evaluate(() => window.__net.view.me.label);
    R.ok('甲留的灯，乙那里看得见（写着甲的雅号）', !!seen && nameA.startsWith(seen.who), seen ? `${seen.who} 第${seen.g} 卦` : '');
    await b.evaluate(() => { const k = window.__ks; k.player.teleport(96, 15.5, Math.PI); k.nav.snapBehind(); });
    await sleep(1500);
    await b.evaluate(() => window.__ks.enterAct('mark:0'));
    await until(b, () => window.__ks.act?.id === 'mark:0', null, 12000);
    await sleep(1200);
    const vb = await b.evaluate(() => window.__ks.act?.state);
    // GUA 的序号 10：通行本第十一卦「泰」
    R.ok('乙点得开：是甲留的、哪一象', (vb?.who ?? '').includes(seen?.who ?? '?') && vb?.gua === '泰' && !(vb?.choices ?? []).some((c) => c.id === 'unmark'), `${vb?.who} ${vb?.gua}`);
    await shotTo(b, 'pvp-mark-b');
    const errs = [...real(PA.logs), ...real(PB.logs)];
    R.ok('两页都没有报错', errs.length === 0, errs.slice(0, 2).join(' | '));
    await PA.ctx.close(); await PB.ctx.close(); pages.splice(0);
    await stopRelay();
  }

  // ———— 六、开销 ————
  if (want('perf')) {
    console.log('六、开销');
    const E = await openAt(browser, `${ORIGIN}/world.html?s=village&t=21&season=spring&w=clear&q=mid&hud=0`, { w: 1280, h: 800 });
    const p = E.page;
    const stat = () => p.evaluate(async () => { await new Promise((r) => setTimeout(r, 400)); const w = window.__ks.world; return { calls: w.stats.calls, tris: w.stats.tris }; });
    const delta = async (label, set) => { await p.evaluate(set, false); const off = await stat(); await p.evaluate(set, true); const on = await stat(); console.log(`  ${label}：绘制 ${off.calls} → ${on.calls}（+${on.calls - off.calls}），三角 ${off.tris} → ${on.tris}（+${on.tris - off.tris}）`); return { off, on }; };
    // 先生（讲着的时候）
    await p.evaluate(() => { const k = window.__ks; k.setTime(10, true); k.player.teleport(101.6, 9.5, Math.PI); k.nav.snapBehind(); });
    await until(p, () => window.__lecture.view().on, null, 6000);
    await p.evaluate(() => { const L = window.__lecture; L.plan.skip += 40; window.__ks.nav.setPose({ pos: new window.__ks.player.pos.constructor(97, 10.2, 10.5), look: new window.__ks.player.pos.constructor(102, 8.2, 2), fov: 50, yaw: 0, up: 0, down: 0 }, 0.01); });
    await sleep(1500);
    // （先生的身子每帧由学堂摆、显：拿出画外再放回来量）
    const m = await delta('先生（讲着时，在镜头里）', (on) => { const k = window.__ks, f = window.__mf ?? k.world.scene.getObjectByName('npc:shaoyong'); window.__mf = f; if (!f) return; if (on) k.world.scene.add(f); else f.removeFromParent(); });
    // 石与蒲团
    await p.evaluate(() => { const k = window.__ks; k.player.teleport(16.6, 52.5, 0); k.nav.snapBehind(); });
    await sleep(1500);
    const r = await delta('溪边的石与蒲团', (on) => { const g = window.__ks.world.scene.getObjectByName('sit:rock'); if (g) g.visible = on; });
    // 路标：二十四盏
    await p.evaluate(() => { const k = window.__ks; k.setTime(21, true); k.mem.set('marks', { list: Array.from({ length: 3 }, (_, i) => ({ x: 4 + i * 2.2, z: 28, g: i * 7, mo: 3, h: 21, w: 0, t: Date.now(), net: false })) }); k.player.teleport(6, 36, Math.PI); k.nav.snapBehind(); });
    await sleep(1500);
    const mk = await delta('路标（三盏，印一次绘制、灯一次绘制）', (on) => { for (const n of ['marks:seal', 'marks:glow']) { const o = window.__ks.world.scene.getObjectByName(n); if (o) o.visible = on; } });
    const cpu = await p.evaluate(() => {
      const L = window.__lecture, M = window.__marks, n = 2000;
      let t0 = performance.now(); for (let i = 0; i < n; i++) L.tick(0.016); const lt = (performance.now() - t0) / n;
      t0 = performance.now(); for (let i = 0; i < n; i++) M.tick(0.016); const mt = (performance.now() - t0) / n;
      return { lt, mt };
    });
    console.log(`  每帧：学堂 ${(cpu.lt * 1000).toFixed(1)} 微秒，路标 ${(cpu.mt * 1000).toFixed(1)} 微秒（另半秒重排一回最近的几盏）`);
    R.ok('先生只添几次绘制', m.on.calls - m.off.calls <= 12, `+${m.on.calls - m.off.calls}`);
    R.ok('路标两次绘制', mk.on.calls - mk.off.calls <= 2, `+${mk.on.calls - mk.off.calls}`);
    R.ok('石与蒲团两次绘制', r.on.calls - r.off.calls <= 2, `+${r.on.calls - r.off.calls}`);
    R.ok('学堂、路标每帧都在一毫秒的零头', cpu.lt < 0.3 && cpu.mt < 0.5, `${cpu.lt.toFixed(3)} / ${cpu.mt.toFixed(3)} 毫秒`);
    await E.ctx.close();
  }
} catch (e) {
  console.error(e);
  R.ok('跑完了没有出岔子', false, String(e?.message ?? e).slice(0, 200));
} finally {
  await cleanup();
}
const bad = R.done();
process.exit(bad ? 1 : 0);
