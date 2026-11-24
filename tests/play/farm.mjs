// 农事整条链，在浏览器里用真的「按住 / 松开」走一遍（不碰界面，直接给世界发指令，与界面上那枚大键发的一样）：
//   春：东畦翻地 → 下种（挑谷种）→ 溪边打一担水 → 浇水 → 过一夜出苗 → 锄草
//   夏：西畦割麦（割几把、捆一捆）→ 挑麦 → 打场 → 扬场（看风）→ 推磨；帮邻家割一截
//   秋：东畦掐谷穗 → 打谷 → 水碓舂米；打枣、摘柿
//   挑担子（carry）：挑起麦捆说去晒场、往哪走、约几步，晒场上空立一笔墨；走近了提示跟着变；走到场上站住就打场；
//                   挑水说去缺水的那一畦；「放下」在脚边、「挑起」再挑；挑进草堂放在门外；过一夜水倒了、麦捆码到场边（打场用它）；挑着走远了水倒了
//   界面（carry-ui，真界面）：上头那一行、「放下」那一枚（电脑上还有 G 键）、村图上的「你」、去处、路
// 每一步查：那件事开得起来、按着有进展、做完了田里的账与行囊里的数目对，人站得起来，没有报错。截图在 shots/farm/。
// 用法：KS_URL=http://localhost:3815/world.html node tests/play/farm.mjs [spring,summer,autumn,carry,carry-ui] [--mobile]
import { launch, open, dir, Report, BASE } from './lib.mjs';
import { join } from 'node:path';

const args = process.argv.slice(2), mobile = args.includes('--mobile');
const only = args.find((a) => !a.startsWith('--'))?.split(',') ?? null;
const R = new Report(), D = dir(mobile ? 'farm-m' : 'farm');
const browser = await launch();
let n = 0;

/** 一页：某季、某处 */
async function page(season, s = 'bridge', t = 'day') {
  const o = await open(browser, { s, t, season, ui: '0', hud: '0', q: 'mid' }, mobile ? { w: 393, h: 714, dpr: 2, mobile: true } : { w: 1280, h: 760 });
  await o.page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  return o;
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
/** 截一张（别处改坏了文件时 vite 会盖一层报错，先揭掉，截的才是画） */
const shot = async (p, name) => { await p.evaluate(() => document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove())); await p.screenshot({ path: join(D, `${String(n++).padStart(2, '0')}_${name}.png`) }); };
/** 进一件事（直接站到它跟前），等它开始 */
async function enter(p, id) {
  await ev(p, (id) => { const k = window.__ks; if (k.act) k.exitAct(); k.enterAct(id, true); }, id);
  for (let i = 0; i < 40; i++) { await p.waitForTimeout(150); if (await ev(p, (id) => window.__ks.act?.id === id, id)) return true; }
  return false;
}
const st = (p) => ev(p, () => { const k = window.__ks; return k.act ? { id: k.act.id, ...JSON.parse(JSON.stringify(k.act.state)) } : null; });
const bag = (p) => ev(p, () => ({ ...window.__ks.bag.items }));
const bed = (p, id) => ev(p, (id) => JSON.parse(JSON.stringify(window.__farm.farm.bed(id))), id);
async function hold(p, cmd, ms) { await ev(p, (c) => window.__ks.cmd(c, 'down'), cmd); await p.waitForTimeout(ms); await ev(p, (c) => window.__ks.cmd(c, 'up'), cmd); }
/** 一直按着 state.hold 给的那一枚（它会换：割 → 捆 → 割……），直到 done 或超时 */
async function holdThrough(p, ms, per = 1600) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await st(p);
    if (!s || s.done || !s.hold) return s;
    await hold(p, s.hold.id, s.hold.id === 'bind' ? 1350 : per);
    await p.waitForTimeout(80);
  }
  return st(p);
}
/** 等表的指针落进朱色那一段再按（打场、舂米）；返回按了几下 */
async function pressInZone(p, id, times, maxMs) {
  const t0 = Date.now(); let k = 0;
  while (k < times && Date.now() - t0 < maxMs) {
    const s = await st(p);
    if (!s || s.done) break;
    const m = s.meter;
    if (m && m.v >= (m.lo ?? 0) + 0.02 && m.v <= (m.hi ?? 1)) { await ev(p, (c) => { window.__ks.cmd(c, 'down'); window.__ks.cmd(c, 'up'); }, id); k++; await p.waitForTimeout(500); }
    else await p.waitForTimeout(40);
  }
  return k;
}
const errsOf = (logs) => logs.filter((l) => !/404|Failed to load resource|toNonIndexed|人物 没能备好|mergeGeometries|没能备好/.test(l));
async function standUp(p, name) {
  await ev(p, () => window.__ks.exitAct());
  await p.waitForTimeout(1300);
  const e = await ev(p, () => ({ act: window.__ks.act?.id ?? null, pose: window.__ks.player.av.pose, locked: window.__ks.player.locked }));
  R.ok(`${name}：做完站起来、能走`, !e.act && e.pose === 'stand' && !e.locked, JSON.stringify(e));
}

// —————————————————— 春 ——————————————————
if (!only || only.includes('spring')) {
  const { page: p, ctx, logs } = await page('spring');
  R.ok('春：农事装上了', await ev(p, () => !!window.__farm && Object.keys(window.__ks.acts).filter((a) => a.startsWith('farm:')).length > 30));
  R.ok('春：东畦是谷茬、西畦麦正长', (await bed(p, 'east')).stage === 'stubble' && (await bed(p, 'west')).stage === 'growing');
  // 翻地：按住举锄（0.8 秒到朱色那一段）、松开落下
  R.ok('翻地：开得起来', await enter(p, 'farm:till:east'));
  await p.waitForTimeout(1500); await shot(p, 'till0');
  for (let i = 0; i < 60; i++) { const s = await st(p); if (!s || s.done) break; await hold(p, 'hoe', 700); await p.waitForTimeout(1300); if (i === 6) await shot(p, 'till1'); }
  let b = await bed(p, 'east');
  R.ok('翻地：四垄翻完是「翻过了」', b.stage === 'tilled', `stage=${b.stage} rows=${b.rows}`);
  await shot(p, 'till2');
  // 下种：挑谷种（头一回行囊里没有种，梁上取去年留的）
  await ev(p, () => window.__ks.cmd('sow'));
  await p.waitForTimeout(400);
  for (let i = 0; i < 30 && (await st(p))?.id !== 'farm:sow:east'; i++) await p.waitForTimeout(200);
  let s = await st(p);
  R.ok('下种：给出这一季能下的种（items）', Array.isArray(s?.items) && s.items.some((i) => i.id === 'seedMillet' && i.n > 0), JSON.stringify(s?.items));
  await ev(p, () => window.__ks.cmd('item', 'seedMillet'));
  await p.waitForTimeout(600); await shot(p, 'sow0');
  s = await holdThrough(p, 90000, 2600);
  b = await bed(p, 'east');
  R.ok('下种：撒完是「下了种」、种的是谷子', b.stage === 'sown' && b.crop === 'millet', `stage=${b.stage} crop=${b.crop}`);
  R.ok('下种：用了一升谷种', (await bag(p)).seedMillet === 1, JSON.stringify(await bag(p)));
  await shot(p, 'sow1');
  // 打水：溪边按住舀，两桶
  R.ok('打水：开得起来', await enter(p, 'farm:dip'));
  await p.waitForTimeout(1400);
  for (let i = 0; i < 8; i++) { const q = await st(p); if (!q || q.done) break; await hold(p, 'dip', 2200); await p.waitForTimeout(900); if (i === 0) await shot(p, 'dip'); }
  R.ok('打水：一担两桶', (await bag(p)).water === 2, JSON.stringify(await bag(p)));
  // 浇水
  R.ok('浇水：开得起来', await enter(p, 'farm:water:east'));
  await p.waitForTimeout(1500);
  const w0 = (await bed(p, 'east')).water;
  for (let i = 0; i < 12; i++) { const q = await st(p); if (!q || q.done) break; await hold(p, 'pour', 2400); if (i === 0) await shot(p, 'water'); }
  b = await bed(p, 'east');
  R.ok('浇水：土墒上来了', b.water > w0 + 0.25, `${w0.toFixed(2)} → ${b.water.toFixed(2)}`);
  R.ok('浇水：桶用掉了', ((await bag(p)).water ?? 0) < 2);
  await standUp(p, '浇水');
  // 过一夜：出苗
  await ev(p, () => window.__ks.newDay());
  await p.waitForTimeout(500);
  b = await bed(p, 'east');
  R.ok('过一夜：谷子出苗', ['sprout', 'growing'].includes(b.stage), b.stage);
  // 锄草：草多了才锄（这里直接让草长起来）
  await ev(p, () => { const F = window.__farm.farm; F.bed('east').weed = 0.7; F.changed('east'); });
  R.ok('锄草：开得起来', await enter(p, 'farm:weed:east'));
  await p.waitForTimeout(1600);
  s = await st(p);
  R.ok('锄草：草上钉了签（tags）', Array.isArray(s?.tags) && s.tags.length >= 3, `${s?.tags?.length}`);
  await shot(p, 'weed0');
  for (const t of s?.tags ?? []) { await ev(p, (id) => window.__ks.cmd('tag', id), t.id); for (let i = 0; i < 40; i++) { await p.waitForTimeout(200); const q = await st(p); if (q?.tags?.find((x) => x.id === t.id)?.kind === 'done' || q?.done) break; } }
  b = await bed(p, 'east');
  R.ok('锄草：拔干净了', b.weed < 0.05, b.weed.toFixed(2));
  await shot(p, 'weed1');
  await standUp(p, '锄草');
  // 采桑
  if (await enter(p, 'farm:mulberry')) { await p.waitForTimeout(1500); await holdThrough(p, 20000, 7000); R.ok('采桑：得桑叶', ((await bag(p)).mulberryLeaf ?? 0) >= 2, JSON.stringify(await bag(p))); await shot(p, 'mulberry'); await standUp(p, '采桑'); }
  // 存档往返
  const saved = await ev(p, () => { window.__farm.farm.save(); return JSON.stringify(window.__ks.mem.get('farm', null)); });
  R.ok('存档：farm 那一份写进了 k.mem', saved && JSON.parse(saved).beds.east.crop === 'millet');
  const errs = errsOf(logs);
  R.ok('春：没有报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// —————————————————— 夏 ——————————————————
if (!only || only.includes('summer')) {
  const { page: p, ctx, logs } = await page('summer');
  R.ok('夏：西畦麦黄了', (await bed(p, 'west')).stage === 'ripe');
  R.ok('割麦：开得起来', await enter(p, 'farm:reap:west:wheat'));
  await p.waitForTimeout(1500); await shot(p, 'reap0');
  let s = await holdThrough(p, 240000, 1800);
  let b = await bed(p, 'west');
  const pr = await ev(p, () => window.__farm.model.perRow(window.__farm.farm.bed('west')));
  R.ok('割麦：四垄割完、捆完，留茬', b.stage === 'stubble', `stage=${b.stage} rows=${b.rows} bound=${b.bound}`);
  R.ok('割麦：麦捆立在地里，数目对', b.sheaves === pr * 4, `${b.sheaves} vs ${pr}×4`);
  await shot(p, 'reap1');
  // 挑
  await ev(p, () => window.__ks.cmd('load'));
  for (let i = 0; i < 40 && (await st(p))?.id !== 'farm:load:west'; i++) await p.waitForTimeout(200);
  await p.waitForTimeout(2200);
  R.ok('挑麦：行囊里麦捆', (await bag(p)).sheaf === pr * 4, JSON.stringify(await bag(p)));
  await standUp(p, '挑麦');
  await p.waitForTimeout(600); await shot(p, 'carry');
  R.ok('挑麦：肩上一副担子', await ev(p, () => window.__farm.farm.loaded));
  // 打场
  R.ok('打场：开得起来', await enter(p, 'farm:thresh'));
  await p.waitForTimeout(2600); await shot(p, 'thresh0');
  R.ok('打场：麦捆都摊在场上', (await ev(p, () => window.__farm.farm.st.floor.spread)) === pr * 4 && !(await bag(p)).sheaf);
  const hits = await pressInZone(p, 'beat', 40, 120000);
  s = await st(p);
  R.ok('打场：举到顶时按，打完了', s?.done === true, `按了${hits}下`);
  const heap = await ev(p, () => window.__farm.farm.st.floor.heap);
  R.ok('打场：场上一堆连糠带粒的', heap === Math.round(pr * 4 * 1.6), `${heap}`);
  await shot(p, 'thresh1');
  // 扬场：按住铲、等风进朱色那一段再松
  await ev(p, () => window.__ks.cmd('winnow'));
  for (let i = 0; i < 40 && (await st(p))?.id !== 'farm:winnow'; i++) await p.waitForTimeout(200);
  await p.waitForTimeout(1500);
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    const q = await st(p);
    if (!q || q.done) break;
    await ev(p, () => window.__ks.cmd('throw', 'down'));
    await p.waitForTimeout(650);
    for (let i = 0; i < 300; i++) { const m = (await st(p))?.meter; if (!m || (m.v >= 0.42 && m.v <= 0.8)) break; await p.waitForTimeout(50); }
    await ev(p, () => window.__ks.cmd('throw', 'up'));
    await p.waitForTimeout(500);
    if (Date.now() - t0 < 3000) await shot(p, 'winnow');
  }
  const wheat = (await bag(p)).wheat ?? 0;
  R.ok('扬场：扬净了、得麦', (await ev(p, () => window.__farm.farm.st.floor.heap)) === 0 && wheat > 0, `麦${wheat}升`);
  // 推磨：推两圈
  await ev(p, () => window.__ks.cmd('grind'));
  for (let i = 0; i < 40 && (await st(p))?.id !== 'farm:grind'; i++) await p.waitForTimeout(200);
  await p.waitForTimeout(1500);
  await ev(p, () => window.__ks.cmd('push', 'down'));
  await p.waitForTimeout(6000); await shot(p, 'grind');
  await p.waitForTimeout(8000);
  await ev(p, () => window.__ks.cmd('push', 'up'));
  const g = await bag(p);
  R.ok('推磨：一圈一升，麦少了、面多了', (g.flour ?? 0) >= 1 && (g.wheat ?? 0) === wheat - (g.flour ?? 0), JSON.stringify(g));
  await standUp(p, '推磨');
  // 帮割
  R.ok('帮割：开得起来', await enter(p, 'farm:help'));
  await p.waitForTimeout(1500);
  s = await holdThrough(p, 60000, 4000);
  R.ok('帮割：割了一截，邻家那一垄割过去了', s?.done === true && (await ev(p, () => window.__farm.farm.st.village[0])) > 0.2, JSON.stringify(await ev(p, () => window.__farm.farm.st.village.slice(0, 2))));
  await shot(p, 'help');
  // 摘桃
  if (await enter(p, 'farm:peach')) { await p.waitForTimeout(1500); await holdThrough(p, 20000, 6000); R.ok('摘桃：得桃', ((await bag(p)).peach ?? 0) >= 1, JSON.stringify(await bag(p))); await shot(p, 'peach'); await standUp(p, '摘桃'); }
  // 井上打水
  if (await enter(p, 'farm:well')) { await p.waitForTimeout(1400); await hold(p, 'crank', 4200); await p.waitForTimeout(1800); R.ok('井上打水：摇上来一桶', ((await bag(p)).water ?? 0) >= 1, JSON.stringify(await bag(p))); await shot(p, 'well'); await standUp(p, '井上打水'); }
  const errs = errsOf(logs);
  R.ok('夏：没有报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// —————————————————— 秋 ——————————————————
if (!only || only.includes('autumn')) {
  const { page: p, ctx, logs } = await page('autumn');
  R.ok('秋：东畦谷子熟了', (await bed(p, 'east')).stage === 'ripe');
  R.ok('掐穗：开得起来', await enter(p, 'farm:reap:east:millet'));
  await p.waitForTimeout(1500);
  await holdThrough(p, 120000, 4000);
  const pr = await ev(p, () => window.__farm.model.perRow(window.__farm.farm.bed('east')));
  let b = await bed(p, 'east');
  R.ok('掐穗：收完、谷穗进行囊', b.stage === 'stubble' && (await bag(p)).milletEar === pr * 4, `${b.stage} ${JSON.stringify(await bag(p))}`);
  await shot(p, 'millet');
  // 打谷 → 谷子
  R.ok('打谷：开得起来', await enter(p, 'farm:thresh'));
  await p.waitForTimeout(2600);
  await pressInZone(p, 'beat', 40, 120000);
  R.ok('打谷：谷穗打成谷子', ((await bag(p)).gu ?? 0) === pr * 4, JSON.stringify(await bag(p)));
  // 舂米
  if (await enter(p, 'farm:pound')) {
    await p.waitForTimeout(1600); await shot(p, 'pound');
    await pressInZone(p, 'stir', 24, 70000);
    await p.waitForTimeout(800);
    R.ok('舂米：碓头抬起时翻，舂成小米', ((await bag(p)).millet ?? 0) >= 1, JSON.stringify(await bag(p)));
    await standUp(p, '舂米');
  } else R.ok('舂米：水碓那里开得起来', false, '屋舍没给碓的挂点？');
  // 打枣、摘柿
  if (await enter(p, 'farm:jujube')) { await p.waitForTimeout(1400); await holdThrough(p, 30000, 900); await holdThrough(p, 20000, 3000); R.ok('打枣：拾到枣', ((await bag(p)).jujube ?? 0) >= 1, JSON.stringify(await bag(p))); await shot(p, 'jujube'); await standUp(p, '打枣'); }
  if (await enter(p, 'farm:persimmon')) { await p.waitForTimeout(1400); await holdThrough(p, 20000, 900); R.ok('摘柿：得柿子', ((await bag(p)).persimmon ?? 0) >= 1, JSON.stringify(await bag(p))); await standUp(p, '摘柿'); }
  // 换季：秋天种下的麦，换到夏天就是黄熟的
  await ev(p, () => { const F = window.__farm.farm, b = F.bed('west'), M = window.__farm.model; for (let r = 0; r < 4; r++) M.till(b, r, 1); for (let r = 0; r < 4; r++) M.sow(b, r, 1, 'wheat', 'autumn'); F.changed('west'); });
  await ev(p, () => window.__ks.setSeason('summer'));
  await p.waitForTimeout(1500);
  b = await bed(p, 'west');
  R.ok('换季：秋天种下的麦，换到夏天黄熟了', b.stage === 'ripe' && b.crop === 'wheat', b.stage);
  await shot(p, 'season');
  const errs = errsOf(logs);
  R.ok('秋：没有报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// —————————————————— 挑担子：去处、认路、到了、放下、挑起、进屋、过夜、走远 ——————————————————
if (!only || only.includes('carry')) {
  const { page: p, ctx, logs } = await page('summer', 'fields');
  const view = () => ev(p, () => { const v = window.__farm.farm.guide.view; return v ? JSON.parse(JSON.stringify(v)) : null; });
  const tp = (x, z, yaw = 0) => ev(p, ([x, z, yaw]) => { const k = window.__ks; if (k.act) k.exitAct(); k.player.teleport(x, z, yaw); k.nav.snapBehind(); }, [x, z, yaw]);
  const piles = () => ev(p, () => JSON.parse(JSON.stringify(window.__farm.farm.st.piles)));
  const actNow = async (ms = 7000) => { const t0 = Date.now(); let id = null; while (!id && Date.now() - t0 < ms) { await p.waitForTimeout(200); id = await ev(p, () => window.__ks.act?.id ?? null); } return id; };
  // 挑起麦捆
  await tp(1.5, 47.2, Math.PI);
  await ev(p, () => window.__ks.bag.add('sheaf', 12, { quiet: true }));
  await p.waitForTimeout(1300);
  let v = await view();
  R.ok('挑麦捆：去处是晒场，说了往哪走、约多少步', v?.dest?.key === 'floor' && /^往/.test(v.parts[0]) && /步$/.test(v.parts[v.parts.length - 1]), v && `${v.title}｜${v.line}`);
  R.ok('挑麦捆：晒场上空立起一笔墨', await ev(p, () => window.__farm.farm.guide.beaconAlpha > 0.5));
  await shot(p, 'carry-field');
  // 走近了
  const left0 = v?.left ?? 0;
  await tp(62, 36.5, Math.PI); await p.waitForTimeout(1300);
  v = await view();
  R.ok('走近了：提示跟着变（剩的路短了）', !!v && v.left < left0 - 25, `${left0.toFixed(0)}米 → ${v?.left?.toFixed(0)}米｜${v?.line}`);
  await shot(p, 'carry-near');
  // 到了：站住就打场
  const sp = await ev(p, () => { const a = window.__ks.acts['farm:thresh']; return { x: a.spot.x, z: a.spot.z }; });
  await tp(sp.x + 1.2, sp.z + 1.3, Math.PI);
  R.ok('走到晒场站住：打场自己开始了', (await actNow()) === 'farm:thresh');
  await p.waitForTimeout(2400);
  R.ok('打场：挑来的麦捆摊在场上，肩上空了', !(await bag(p)).sheaf && (await ev(p, () => window.__farm.farm.st.floor.spread)) === 12, JSON.stringify(await bag(p)));
  await standUp(p, '打场（到了自己开始的）');
  // 挑水：去处是缺水的那一畦；放下、挑起
  await tp(30, 40, 0);
  await ev(p, () => window.__ks.bag.add('water', 2, { quiet: true }));
  await p.waitForTimeout(900);
  v = await view();
  R.ok('挑水：去处是缺水的那一畦', /^bed:/.test(v?.dest?.key ?? ''), v && `${v.title}｜${v.line}`);
  const dropped = await ev(p, () => window.__farm.farm.guide.setDown('drop'));
  await p.waitForTimeout(600);
  let ps = await piles();
  R.ok('放下：担子放在脚边，肩上空了，提示收起', dropped && !(await bag(p)).water && ps.length === 1 && ps[0].item === 'water' && !(await ev(p, () => window.__farm.farm.loaded)) && !(await view()), JSON.stringify(ps));
  await shot(p, 'carry-drop');
  R.ok('挑起：担子上立着签', await ev(p, () => window.__ks.acts['farm:lift'].on()));
  R.ok('挑起：开得起来', await enter(p, 'farm:lift'));
  await p.waitForTimeout(1900);
  R.ok('挑起：两桶水又挑在肩上', (await bag(p)).water === 2 && (await piles()).length === 0, JSON.stringify(await bag(p)));
  await standUp(p, '挑起');
  // 挑进草堂：放在门外
  await tp(0, 0.6, Math.PI); await p.waitForTimeout(1000);
  ps = await piles();
  const outside = ps.length === 1 ? await ev(p, ([x, z]) => window.__walk.placeAt(x, z).indoor, [ps[0].x, ps[0].z]) : 1;
  R.ok('挑着担子进草堂：担子放在了门外', !(await bag(p)).water && ps.length === 1 && outside < 0.5, JSON.stringify(ps));
  // 过一夜
  await tp(30, 40, 0);
  await ev(p, () => window.__ks.bag.add('sheaf', 5, { quiet: true }));
  await p.waitForTimeout(500);
  await ev(p, () => window.__ks.newDay());
  await p.waitForTimeout(600);
  ps = await piles();
  R.ok('过一夜：门外的水倒了，挑着的麦捆邻家帮着码在场边', !(await bag(p)).sheaf && ps.length === 1 && ps[0].item === 'sheaf' && ps[0].n === 5 && (await ev(p, () => window.__farm.farm.guide.floorPile())) === 0, JSON.stringify(ps));
  R.ok('场边码着麦捆：打场的签亮着', await ev(p, () => window.__ks.acts['farm:thresh'].on()));
  // 挑着水走远了
  await ev(p, () => window.__ks.bag.add('water', 2, { quiet: true }));
  await tp(-150, 38, Math.PI / 2);
  await p.waitForTimeout(11000);
  R.ok('挑着水走远了（桃林里）：过一会儿水就倒了', !(await bag(p)).water, JSON.stringify(await bag(p)));
  const errs = errsOf(logs);
  R.ok('挑担子：没有报错', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// —————————————————— 挑担子的界面（真界面）——————————————————
if (!only || only.includes('carry-ui')) {
  const root = BASE.replace(/world\.html.*$/, '');
  const ctx = await browser.newContext(mobile ? { viewport: { width: 393, height: 714 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('anlewo:v1', JSON.stringify({ v: 1, walked: true, runTold: true, visits: 2, world: {} })));
  const p = await ctx.newPage(), logs = [];
  p.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text().slice(0, 300)}`); });
  p.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.message).slice(0, 300)}`));
  await p.goto(root + '?auto=1&s=fields&t=10&flow=0&season=summer&w=clear&q=mid', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await p.waitForTimeout(1500);
  await ev(p, () => { const k = window.__ks; k.player.teleport(1.5, 47.2, Math.PI); k.nav.snapBehind(); k.bag.add('sheaf', 12, { quiet: true }); });
  await p.waitForTimeout(1600);
  const hint = await ev(p, () => document.querySelector('[data-testid="carry-hint"]')?.textContent ?? '');
  R.ok('界面：上头一行说挑到晒场去、往哪走、约几步', /晒场/.test(hint) && /往.+步/.test(hint), hint);
  await shot(p, 'ui-carry');
  // 村图：「你」、去处、路
  await ev(p, () => window.__ui.setUi({ sheet: 'map' }));
  await p.waitForTimeout(1200);
  const map = await ev(p, () => ({ me: !!document.querySelector('[data-testid="map-me"] .map-me-body'), dest: document.querySelector('[data-testid="map-dest"] text')?.textContent ?? '', route: !!document.querySelector('[data-testid="map-route"]'), r: document.querySelector('[data-testid="map-me"] .map-me-body')?.getBoundingClientRect().width ?? 0 }));
  R.ok('村图：「你」是一大滴（屏上十个像素以上）、写着去处「晒场」、有一道路', map.me && map.r >= 10 && map.dest === '晒场' && map.route, JSON.stringify(map));
  await shot(p, 'ui-map');
  await ev(p, () => window.__ui.setUi({ sheet: null }));
  await p.waitForTimeout(600);
  // 「放下」那一枚
  await p.locator('[data-testid="carry-drop"]').click();
  await p.waitForTimeout(900);
  const after = await ev(p, () => ({ sheaf: window.__ks.bag.count('sheaf'), piles: window.__farm.farm.st.piles.length, hint: !!document.querySelector('.carry:not(.is-hidden) [data-testid="carry-hint"]') }));
  R.ok('点「放下」：麦捆放在脚边，那一行收起', after.sheaf === 0 && after.piles === 1 && !after.hint, JSON.stringify(after));
  await shot(p, 'ui-dropped');
  if (!mobile) {
    await ev(p, () => window.__ks.bag.add('water', 2, { quiet: true }));
    await p.waitForTimeout(900);
    await p.keyboard.press('g');
    await p.waitForTimeout(600);
    R.ok('电脑上按 G 也是「放下」', (await ev(p, () => window.__ks.bag.count('water'))) === 0);
  }
  R.ok('挑担子的界面：没有报错', logs.length === 0, logs.slice(0, 2).join(' | '));
  await ctx.close();
}

const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
