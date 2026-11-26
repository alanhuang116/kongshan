// 观象的总览：表上五十九卦，每一卦找一个「有」的时候（季节 × 天气 × 时辰），走到那一处站定、等象卡出来，截一张；
// 再排成一张网页（按通行本卦序，上经、下经），每一卦一格：卦名、标记上的字、用的哪个时候、「所见」与「说明」（data/gua64.ts）、截图。
// 做事时显的五卦列在最后（「做事时显」），各截一张刚开始做那件事时的样子。
//
// 用法：node tests/play/xiang-sheet.mjs [--phone] [--only=乾,坤] [--out=shots/xiang] [--html]
//   --phone   另截手机（393×714，触屏）的一张
//   --html    不截图，只拿上回的 results.json（与同目录里的 notes.json：{ "卦": { "ok": true | "partial" | false, "note": "…" } }，看过以后写的）重排网页
// 网址默认 http://localhost:3801/world.html（开发的台子）；换端口用 KS_URL=http://localhost:3813/world.html
//
// 找「有」的时候：先照 atmos.ts 的式子算出各个时候的夜、晨、昏、灯，拿表上的 when 去问（快）；挑晴天、白天、在那一段时候正当中的；
// 再把世界真拨到那个时候（setSeason → setWeather → setTime），等几帧，问那件事自己的 on()——人在不在（农夫、老人）这样的要真拨了才知道，
// 不对就换下一个。
import { launch } from './uikit.mjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const phone = args.includes('--phone'), htmlOnly = args.includes('--html');
const only = opt('only', null)?.split(',') ?? null;
const OUT = resolve(opt('out', join(import.meta.dirname, '..', '..', 'shots', 'xiang')));
const URL0 = process.env.KS_URL ?? 'http://localhost:3801/world.html';
mkdirSync(join(OUT, 'desk'), { recursive: true });
if (phone) mkdirSync(join(OUT, 'phone'), { recursive: true });

const SEASON_CN = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }, WEATHER_CN = { clear: '晴', mist: '雾', rain: '雨', snow: '雪' };
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** 开一页台子，等画好；把标记、做事的字、左上角的数藏起来（只看画） */
async function openPage(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr ?? 1, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  const page = await ctx.newPage(), logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|ReadPixels/.test(m.text()))) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 600)}`));
  await page.goto(`${URL0}?s=grove&t=10&season=spring&w=clear&q=mid&hud=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
  await page.addStyleTag({ content: '#marks,#act,#hud{display:none!important}' });
  return { ctx, page, logs };
}

/** 表与文字：从开发服务器上直接取模块（同一份，不另抄） */
async function readTables(page) {
  return page.evaluate(async () => {
    const X = await import('/src/world/acts/xiang.ts'), S = await import('/src/data/gua64.ts'), Y = await import('/src/data/yi.ts');
    const tri = Object.fromEntries(Y.TRIGRAMS.map((t) => [t.id, `${t.name}（${t.image}）`]));
    return {
      defs: X.XIANG_DEFS.map((d) => ({ gua: d.gua, label: d.label, at: d.at, look: d.look })),
      inAct: X.IN_ACT.map((x) => ({ gua: x.gua, act: x.act })),
      gua: Y.GUA.map((g) => ({ n: g.n, name: g.name, upper: tri[g.upper], lower: tri[g.lower], image: g.image })),
      scenes: S.SCENES,
    };
  });
}

/** 每一卦：照 atmos 的式子算出各个时候，问 when，按「晴、白天、在那一段的正当中」排好（前几个） */
async function candidates(page, gua) {
  return page.evaluate((gua) => {
    const SUN = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] };
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const k = window.__ks;
    return import('/src/world/acts/xiang.ts').then((X) => {
      const d = X.XIANG_DEFS.find((x) => x.gua === gua);
      const cond = (h, season, w) => {
        const [sr, ss] = SUN[season], r = w === 'rain' ? 1 : 0;
        const night = h < 12 ? 1 - sm(sr - 1.1, sr + 0.25, h) : sm(ss + 0.15, ss + 1.5, h);
        const dawn = Math.max(0, 1 - Math.abs(h - (sr + 0.15)) / 1.35), dusk = Math.max(0, 1 - Math.abs(h - (ss - 0.25)) / 1.5);
        const lamp = Math.max(night, 0.8 * sm(0.3, 1, dusk) * (h > 12 ? 1 : 0), 0.5 * r);
        return { hour: h, night, dawn, dusk, lamp, season, rain: r, snow: w === 'snow' ? 1 : 0, mist: w === 'mist' ? 1 : 0, k };
      };
      const W_RANK = { clear: 4, mist: 2.2, rain: 2, snow: 1.5 }, out = [];
      for (const s of ['spring', 'summer', 'autumn', 'winter']) for (const w of ['clear', 'mist', 'rain', 'snow']) {
        if (w === 'snow' && s !== 'winter') continue; // 雪只在冬天（换季时别的季节会把雪换成晴）
        const ok = Array.from({ length: 48 }, (_, i) => { try { return !d.when || !!d.when(cond(i / 2, s, w)); } catch { return false; } });
        for (let i = 0; i < 48; i++) {
          if (!ok[i]) continue;
          let l = 0, r = 0;
          while (l < 47 && ok[(i - l - 1 + 48) % 48]) l++;
          while (r < 47 && ok[(i + r + 1) % 48]) r++;
          const h = i / 2, c = cond(h, s, w), daylight = c.night < 0.25;
          out.push({ season: s, weather: w, hour: h, score: 100 * W_RANK[w] + (daylight ? 30 : 0) + 4 * Math.min(l, r, 6) + (daylight && h >= 9 && h <= 15 ? 3 : 0) + (s === 'spring' ? 2 : 0), night: +c.night.toFixed(2), dusk: +c.dusk.toFixed(2), dawn: +c.dawn.toFixed(2) });
        }
      }
      out.sort((a, b) => b.score - a.score);
      // 同一季同一天气只留分最高的一个时辰，再取前六
      const seen = new Set(), pick = [];
      for (const c of out) { const key = `${c.season}/${c.weather}/${Math.round(c.hour)}`; if (seen.has(key)) continue; seen.add(key); pick.push(c); if (pick.length >= 6) break; }
      return pick;
    });
  }, gua);
}

/** 把世界拨到那个时候（换了季要等它换完） */
async function setWorld(page, c, prevSeason) {
  await page.evaluate((c) => { const k = window.__ks; if (k.act) k.exitAct(); k.setSeason(c.season); k.setWeather(c.weather, true); k.setTime(c.hour, true); }, c);
  await page.waitForTimeout(prevSeason !== c.season ? 2200 : 450);
}

/** 走到那一处，站定看，等象卡出来，截图；返回有没有显出来 */
async function shoot(page, gua, file) {
  await page.evaluate((gua) => { const k = window.__ks, a = k.acts['xiang:' + gua]; if (k.act) k.exitAct(); k.player.teleport(a.spot.x, a.spot.z, a.spot.yaw); k.nav.snapBehind(); k.enterAct('xiang:' + gua, true); }, gua);
  let shown = false;
  for (let i = 0; i < 30 && !shown; i++) { await page.waitForTimeout(200); shown = await page.evaluate((gua) => window.__ks.act?.id === 'xiang:' + gua && !!window.__ks.act.state.gua, gua); }
  await page.waitForTimeout(700);
  await page.screenshot({ path: file });
  const cam = await page.evaluate(() => { const c = window.__ks.world.camera; return c.position.toArray().map((v) => +v.toFixed(1)); });
  await page.evaluate(() => window.__ks.exitAct());
  return { shown, cam };
}

const RES = join(OUT, 'results.json');
let results = existsSync(RES) ? JSON.parse(readFileSync(RES, 'utf8')) : { defs: {}, inAct: {} };
let tables = results.tables ?? null;

if (!htmlOnly) {
  const browser = await launch();
  const desk = await openPage(browser, { w: 1280, h: 720 });
  const mob = phone ? await openPage(browser, { w: 393, h: 714, dpr: 2, mobile: true }) : null;
  tables = await readTables(desk.page);
  results.tables = tables;
  // 先给每一卦挑好时候，再按季节分组去拍（少换几回季）
  const plan = [];
  for (const d of tables.defs) {
    if (only && !only.includes(d.gua)) continue;
    plan.push({ d, cands: await candidates(desk.page, d.gua) });
  }
  const order = { spring: 0, summer: 1, autumn: 2, winter: 3 };
  plan.sort((a, b) => (order[a.cands[0]?.season] ?? 9) - (order[b.cands[0]?.season] ?? 9));
  let season = 'spring';
  for (const { d, cands } of plan) {
    const n = tables.gua.find((g) => g.name === d.gua)?.n ?? 0, tag = String(n).padStart(2, '0');
    let used = null, tried = [];
    for (const c of cands) {
      await setWorld(desk.page, c, season);
      if (mob) await setWorld(mob.page, c, season);
      season = c.season;
      const on = await desk.page.evaluate((g) => window.__ks.acts['xiang:' + g].on(), d.gua);
      tried.push(`${SEASON_CN[c.season]}${WEATHER_CN[c.weather]}${hhmm(c.hour)}${on ? '' : '（不对）'}`);
      if (on) { used = c; break; }
    }
    if (!used) { console.log(`✗ ${d.gua}（${d.label}）找不到「有」的时候：${tried.join('、') || '一个也没算出来'}`); results.defs[d.gua] = { n, label: d.label, cond: null, tried }; continue; }
    const [a, b] = await Promise.all([shoot(desk.page, d.gua, join(OUT, 'desk', `${tag}.png`)), mob ? shoot(mob.page, d.gua, join(OUT, 'phone', `${tag}.png`)) : null]);
    const real = await desk.page.evaluate(() => { const A = window.__ks.atmos; return { night: +A.night.toFixed(2), dawn: +A.dawn.toFixed(2), dusk: +A.dusk.toFixed(2), lamp: +A.lamp.toFixed(2) }; });
    results.defs[d.gua] = { n, label: d.label, at: d.at, look: d.look, cond: used, real, tried, shown: a.shown, shownPhone: b?.shown ?? null, cam: a.cam, desk: `desk/${tag}.png`, phone: b ? `phone/${tag}.png` : null };
    console.log(`${a.shown ? '✓' : '✗'} ${tag} ${d.gua}（${d.label}）${SEASON_CN[used.season]}${WEATHER_CN[used.weather]} ${hhmm(used.hour)}${a.shown ? '' : '　象卡没出来'}`);
  }
  // 做事时显的五卦：刚开始做那件事时的样子（象要做到一半才显，这里只看在哪、看见什么）
  const ACT_ID = { 煮茶: ['tea', 'spring', 'clear', 10], 抚琴: ['qin', 'spring', 'clear', 10], 自斟: ['wine', 'spring', 'clear', 21], 读书: ['book', 'spring', 'clear', 10], 与客对坐: ['talk:guest', 'spring', 'clear', 15] };
  if (!only) for (const x of tables.inAct) {
    const n = tables.gua.find((g) => g.name === x.gua)?.n ?? 0, tag = String(n).padStart(2, '0'), [id, s, w, h] = ACT_ID[x.act] ?? [];
    const exists = id && (await desk.page.evaluate((id) => !!window.__ks.acts[id], id));
    if (!exists) { results.inAct[x.gua] = { n, act: x.act, shot: null }; console.log(`· ${x.gua}（${x.act}）没截：找不到那件事（${id ?? '?'}）`); continue; }
    await setWorld(desk.page, { season: s, weather: w, hour: h }, season); season = s;
    await desk.page.evaluate((id) => { const k = window.__ks; if (k.act) k.exitAct(); k.enterAct(id, true); }, id);
    await desk.page.waitForTimeout(2800);
    await desk.page.screenshot({ path: join(OUT, 'desk', `${tag}.png`) });
    await desk.page.evaluate(() => window.__ks.exitAct());
    results.inAct[x.gua] = { n, act: x.act, id, cond: { season: s, weather: w, hour: h }, shot: `desk/${tag}.png` };
    console.log(`· ${tag} ${x.gua}（${x.act}）`);
  }
  const errs = [...new Set([...desk.logs, ...(mob?.logs ?? [])])].filter((l) => !/404|Failed to load resource/.test(l));
  results.errors = errs;
  if (errs.length) console.log('—— 报错 ——\n' + errs.slice(0, 12).join('\n'));
  writeFileSync(RES, JSON.stringify(results, null, 1));
  await browser.close();
}

// —— 网页 ——
if (!tables) { console.log('没有 results.json：先不带 --html 跑一遍'); process.exit(1); }
const notesFile = join(OUT, 'notes.json'), notes = existsSync(notesFile) ? JSON.parse(readFileSync(notesFile, 'utf8')) : {};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HEX = (n) => String.fromCodePoint(0x4dbf + n);
const card = (g) => {
  const r = results.defs[g.name], ia = results.inAct[g.name], sc = tables.scenes[g.name] ?? {}, nt = notes[g.name];
  const cond = r?.cond ? `${SEASON_CN[r.cond.season]} · ${WEATHER_CN[r.cond.weather]} · ${hhmm(r.cond.hour)}` : ia ? `做事时显：${ia.act}` : '（没有找到「有」的时候）';
  const shots = r ? `<div class="shots${r.phone ? ' two' : ''}">${r.desk ? `<a href="${r.desk}"><img loading="lazy" src="${r.desk}" alt="${esc(g.name)} 桌面"></a>` : ''}${r.phone ? `<a href="${r.phone}"><img loading="lazy" class="tall" src="${r.phone}" alt="${esc(g.name)} 手机"></a>` : ''}</div>` : ia?.shot ? `<div class="shots"><a href="${ia.shot}"><img loading="lazy" src="${ia.shot}" alt="${esc(g.name)}"></a></div>` : '';
  const flag = r && r.shown === false ? '<p class="flag">象卡没有显出来</p>' : '';
  const vk = nt ? (nt.ok === true ? 'ok' : nt.ok === 'partial' ? 'part' : 'bad') : '';
  const verdict = nt ? `<p class="verdict ${vk}">${{ ok: '合', part: '勉强', bad: '不合' }[vk]}：${esc(nt.note)}</p>` : '';
  return `<article class="card${vk === 'bad' ? ' is-bad' : vk === 'part' ? ' is-part' : ''}" id="g${g.n}">
  <header><span class="hex">${HEX(g.n)}</span><div><h3>${g.n}. ${esc(g.name)} <small>「${esc(r?.label ?? ia?.act ?? '')}」</small></h3><p class="tri">上${esc(g.upper)} 下${esc(g.lower)} · ${esc(g.image)}</p></div></header>
  <p class="cond">${esc(cond)}${r?.at ? `<span>站 (${r.at.map((v) => +v.toFixed(1)).join(', ')})</span>` : ''}</p>
  ${shots}${flag}
  <p class="view"><b>所见</b>${esc(sc.view)}</p>
  <p class="note"><b>说明</b>${esc(sc.note)}</p>
  ${verdict}
</article>`;
};
const inActSet = new Set(tables.inAct.map((x) => x.gua));
const list = (a, b) => tables.gua.filter((g) => g.n >= a && g.n <= b && !inActSet.has(g.name)).map(card).join('\n');
const bad = Object.values(notes).filter((v) => v && v.ok === false).length, part = Object.values(notes).filter((v) => v && v.ok === 'partial').length;
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>观象总览</title>
<style>
:root { --paper: #f3efe4; --ink: #2b2a28; --soft: #6d675c; --line: #d8d0bf; --red: #9c2f24; --ok: #3f6b4a; --warn: #b8862b; --card: #fbf9f3; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #1d1c1a; --ink: #e9e4d8; --soft: #a59e90; --line: #3a372f; --red: #e07a6c; --ok: #8fbf98; --warn: #d9b264; --card: #262420; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 15px/1.7 'Noto Serif SC', 'Songti SC', serif; }
main { max-width: 1500px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 26px; letter-spacing: 0.2em; margin: 0 0 4px; } h2 { font-size: 19px; letter-spacing: 0.3em; margin: 36px 0 12px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
.lead { color: var(--soft); margin: 0 0 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 4px; padding: 12px 14px; }
.card.is-bad { border-color: var(--red); } .card.is-part { border-color: var(--warn); }
.card header { display: flex; gap: 10px; align-items: center; }
.hex { font-size: 34px; line-height: 1; }
h3 { margin: 0; font-size: 18px; } h3 small { font-weight: normal; color: var(--soft); font-size: 14px; }
.tri { margin: 0; color: var(--soft); font-size: 13px; }
.cond { margin: 8px 0 6px; font-size: 13px; color: var(--soft); display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.shots { display: grid; gap: 6px; } .shots.two { grid-template-columns: 1fr 0.32fr; align-items: start; }
.shots img { width: 100%; display: block; border: 1px solid var(--line); }
.view, .note { margin: 8px 0 0; font-size: 14px; } .note { color: var(--soft); font-size: 13px; }
.view b, .note b { font-weight: normal; color: var(--red); margin-right: 8px; font-size: 12px; letter-spacing: 0.15em; }
.flag { color: var(--red); margin: 6px 0 0; font-size: 13px; }
.verdict { margin: 10px 0 0; padding: 6px 8px; font-size: 13px; border-left: 3px solid var(--ok); } .verdict.bad { border-color: var(--red); } .verdict.part { border-color: var(--warn); }
</style></head>
<body><main>
<h1>观象总览</h1>
<p class="lead">表上五十九卦：每一卦取一个「有」的时候（晴天、白天、在那一段时候的正当中优先），走到那一处站定，等象卡出来时截的画（开发台子，不带界面${results.defs && Object.values(results.defs).some((r) => r.phone) ? '；右边窄的一张是手机 393×714' : ''}）。${Object.keys(notes).length ? `看过的 ${Object.keys(notes).length} 卦里，${bad} 卦与所见、卦象对不上（红框），${part} 卦勉强（黄框）。` : ''}</p>
<h2>上经</h2><section class="grid">${list(1, 30)}</section>
<h2>下经</h2><section class="grid">${list(31, 64)}</section>
<h2>做事时显</h2><section class="grid">${tables.gua.filter((g) => inActSet.has(g.name)).map(card).join('\n')}</section>
${results.errors?.length ? `<h2>页面报错</h2><pre>${esc(results.errors.join('\n'))}</pre>` : ''}
</main></body></html>`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(`网页：${join(OUT, 'index.html')}`);
