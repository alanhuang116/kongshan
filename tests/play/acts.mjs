// 小人与器物的互动：每件事都从几步之外「走过去」开始，做一遍，量手够没够到、东西在不在该在的地方，沿途截图。
// 用法：node tests/play/acts.mjs [活动id,活动id…] [--mobile]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, open, dir, shot, Report } from './lib.mjs';

const args = process.argv.slice(2), MOBILE = args.includes('--mobile');
const only = args.find((a) => !a.startsWith('--'))?.split(',');
const probe = readFileSync(join(import.meta.dirname, 'probe.js'), 'utf8');
const browser = await launch();
const { page, logs } = await open(browser, { s: 'censer', ui: '0' }, MOBILE ? { w: 390, h: 844, dpr: 2, mobile: true } : {});
await page.evaluate(probe);
const R = new Report(), d = dir(MOBILE ? 'acts2-m' : 'acts2');
const W = MOBILE ? 390 : 1440, H = MOBILE ? 844 : 810;
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const f2 = (v) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(2)), f3 = (v) => (v == null || Number.isNaN(v) ? '—' : v.toFixed(3));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const state = () => ev(() => ({ ...(window.__ks.act?.state ?? {}), _act: window.__ks.act?.id ?? null }));
const press = async (ms, x = W / 2, y = H / 2) => { await page.mouse.move(x, y); await page.mouse.down(); await wait(ms); await page.mouse.up(); };
const tap = (x = W / 2, y = H / 2) => page.mouse.click(x, y);
const rec = async (ms, fn) => { await ev(() => window.__probe.start()); if (fn) await fn(); if (ms) await wait(ms); return ev(() => window.__probe.stop()); };
/** 两手离各自要够的地方有多远（一段记录里的中位数、最大值）；没有目标的那只手不算 */
const reachErr = (rows, from = 0) => {
  const eL = [], eR = [];
  for (const r of rows.slice(from)) { if (r.tl) eL.push(dist(r.hl, r.tl)); if (r.tr) eR.push(dist(r.hr, r.tr)); }
  return { L: med(eL), R: med(eR), Lmax: eL.length ? Math.max(...eL) : NaN, Rmax: eR.length ? Math.max(...eR) : NaN, nL: eL.length, nR: eR.length };
};
/** 从几步之外走到一件事跟前并开始做：start 是出发点 [x, z, zone?]。量走过去的那一段 */
async function approach(id, start) {
  await ev(([x, z, zone]) => { const k = window.__ks; if (k.act) k.exitAct(); k.player.teleport(x, z, 0, zone ?? 'ground'); k.nav.snapBehind(); }, start);
  await wait(500);
  let at0 = 9;
  const a = await rec(null, async () => {
    await ev((id) => window.__ks.use(id), id);
    await page.waitForFunction((id) => window.__ks.act?.id === id, id, { timeout: 20000 }).catch(() => {});
    at0 = await ev((id) => { const k = window.__ks, a = k.acts[id], p = k.player; return Math.hypot(p.pos.x - a.spot.x, p.pos.z - a.spot.z); }, id);
    await wait(1700);
  });
  const info = await ev((id) => { const k = window.__ks, a = k.acts[id], p = k.player; return { on: k.act?.id === id, dx: Math.hypot(p.pos.x - a.spot.x, p.pos.z - a.spot.z), yaw: p.yaw, want: a.spot.yaw, locked: p.locked }; }, id);
  const wrap = (x) => { x = (x + Math.PI) % (Math.PI * 2); return (x < 0 ? x + Math.PI * 2 : x) - Math.PI; };
  let hop = 0, pathLen = 0;
  for (let i = 1; i < a.rows.length; i++) { const s = Math.hypot(a.rows[i].pos[0] - a.rows[i - 1].pos[0], a.rows[i].pos[2] - a.rows[i - 1].pos[2]); hop = Math.max(hop, s / Math.max(0.008, (a.rows[i].t - a.rows[i - 1].t) / 1000)); pathLen += s; }
  R.ok(`${id}：走到位、站定`, info.on && at0 < 0.04 && hop < 3.6, `开始时离站处 ${f3(at0)} 米，走了 ${f2(pathLen)} 米 ${a.steps.length} 步，最快 ${f2(hop)} 米/秒（没有瞬移）`);
  if (id !== 'bell' && id !== 'sweep') R.ok(`${id}：面朝该朝的方向`, Math.abs(wrap(info.yaw - info.want)) < 0.08, `差 ${f2(Math.abs(wrap(info.yaw - info.want)))} 弧度`);
  return a;
}
async function leave(id) {
  await ev(() => window.__ks.exitAct());
  await wait(1600);
  const s = await ev(() => { const k = window.__ks, p = k.player; return { pose: p.av.pose, locked: p.locked, lift: p.lift, vis: p.av.root.visible, box: window.__probe.box(), y: p.pos.y }; });
  R.ok(`${id}：做完站起来、能走了`, s.pose === 'stand' && !s.locked && s.lift === 0 && s.vis && s.box.hi[1] - s.y > 1.3, `姿势 ${s.pose}，高 ${f2(s.box.hi[1] - s.y)}`);
}
const want = (id) => !only || only.includes(id);

// —— 上香 ——
if (want('incense')) {
  console.log('\n上香');
  await approach('incense', [0.6, 24.8]);
  await wait(1900);
  R.ok('上香：取了香', (await state()).step === 1);
  await shot(page, d, 'incense-1-hold');
  const a = await rec(null, async () => { await tap(); await page.waitForFunction(() => window.__ks.act?.state.step === 2, null, { timeout: 9000 }).catch(() => {}); });
  R.ok('上香：香头凑到烛火上点着了', (await state()).step === 2, `用了 ${f2((a.rows.at(-1).t - a.rows[0].t) / 1000)} 秒`);
  await shot(page, d, 'incense-2-lit');
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(W / 2, H / 2); await page.mouse.down(); await wait(1700);
    if (i === 1) await shot(page, d, 'incense-3-bow');
    await wait(500); await page.mouse.up(); await wait(1500);
  }
  await page.waitForFunction(() => window.__ks.act?.state.step === 3, null, { timeout: 5000 }).catch(() => {});
  R.ok('上香：举香三拜', (await state()).step === 3, (await state()).count ?? '');
  const b = await rec(null, async () => { for (let i = 0; i < 3; i++) { await tap(); await wait(i === 0 ? 800 : 350); if (i === 0) await shot(page, d, 'incense-4-plant'); } await page.waitForFunction(() => window.__ks.act?.state.step === 4, null, { timeout: 12000 }).catch(() => {}); });
  const sticks = await ev(() => {
    const k = window.__ks, C = k.parts.censer, out = [];
    k.world.scene.traverse((o) => { if (o.isMesh && o.geometry?.parameters?.height === 0.33 && o.visible) { const v = new k.player.pos.constructor(); o.getWorldPosition(v); out.push({ r: Math.hypot(v.x - C.ash.x, v.z - C.ash.z), dy: v.y - C.ash.y, inScene: o.parent === k.world.scene }); } });
    return { out, r: C.r };
  });
  const e = reachErr(b.rows);
  R.ok('上香：三支都插进炉里', (await state()).step === 4 && sticks.out.length === 3 && sticks.out.every((s) => s.inScene && s.r < sticks.r && Math.abs(s.dy + 0.045) < 0.02), `离炉心 ${sticks.out.map((s) => f2(s.r)).join(' ')}（灰面半径 ${f2(sticks.r)}）`);
  const near = b.rows.filter((r) => r.tr).map((r) => dist(r.hr, r.tr)).sort((x, y) => x - y);
  R.ok('上香：插香时手到了灰面上方', near.length > 10 && near[0] < 0.025, `右手离目标 最近 ${f3(near[0])}，两成的时间在 ${f3(near[Math.floor(near.length * 0.2)])} 米以内`);
  await wait(1200); await shot(page, d, 'incense-5-done');
  await leave('incense');
}

// —— 礼佛 ——
if (want('bow')) {
  console.log('\n礼佛');
  await approach('bow', [0.4, 3.3]);
  await shot(page, d, 'bow-1-kneel');
  let ok = true, low = 9, minY = 9;
  for (let i = 0; i < 3; i++) {
    const a = await rec(null, async () => { await page.mouse.move(W / 2, H / 2); await page.mouse.down(); await wait(1000); if (i === 0) await shot(page, d, 'bow-2-half'); await wait(1100); if (i === 0) await shot(page, d, 'bow-3-down'); await page.mouse.up(); await wait(1900); });
    low = Math.min(low, ...a.rows.map((r) => r.head[1] - r.pos[1]));
    const s = await state(); ok = ok && typeof s.count === 'string' && s.count.length > 0;
    if (i === 0) minY = (await ev(() => window.__probe.box())).lo[1];
  }
  const s = await state(), fl = await ev(() => window.__walk.HALL_Y);
  R.ok('礼佛：三拜都数到了', ok && s.hint === '三拜毕', `${s.count}`);
  R.ok('礼佛：拜下去头到垫上', low < 0.42, `头最低离垫面 ${f2(low)} 米`);
  R.ok('礼佛：身子不穿进地里', minY > fl - 0.03, `最低 ${f3(minY - fl)}（相对殿内地面）`);
  await leave('bow');
}

// —— 木鱼 ——
if (want('muyu')) {
  console.log('\n木鱼');
  await approach('muyu', [-1.9, 0.5]);
  await shot(page, d, 'muyu-1-ready');
  const a = await rec(null, async () => { for (let i = 0; i < 6; i++) { await tap(); await wait(i === 2 ? 60 : 520); if (i === 2) { await shot(page, d, 'muyu-2-strike'); await wait(460); } } });
  // 槌头离击点最近到多少
  const near = await ev(() => { const k = window.__ks, g = k.parts.muyu, m = g.userData.mallet, V = k.player.pos.constructor; return { held: (() => { let o = m.parent; while (o) { if (o === k.player.av.joints.handR) return true; o = o.parent; } return false; })(), S: (() => { g.updateWorldMatrix(true, false); const v = new V().copy(g.userData.strike).applyMatrix4(g.matrixWorld); return [v.x, v.y, v.z]; })() }; });
  const s = await state(), e = reachErr(a.rows);
  R.ok('木鱼：槌在右手里', near.held);
  R.ok('木鱼：敲一下数一字', s.struck === 6, `敲了 ${s.struck}`);
  R.ok('木鱼：手跟得上槌', e.R < 0.05, `右手离目标 中位 ${f3(e.R)} 最大 ${f3(e.Rmax)} 米`);
  // 槌头在世界里的位置：每帧取一次太密，改成敲的时候连取
  const heads = [];
  for (let i = 0; i < 2; i++) { await tap(); for (let j = 0; j < 9; j++) { heads.push(await ev(() => { const k = window.__ks, m = k.parts.muyu.userData.mallet, v = new k.player.pos.constructor(0, 0.325, 0); m.updateWorldMatrix(true, false); v.applyMatrix4(m.matrixWorld); return [v.x, v.y, v.z]; })); await wait(16); } await wait(380); }
  const hit = Math.min(...heads.map((h) => dist(h, near.S)));
  R.ok('木鱼：槌头落在鱼背上', hit < 0.06, `槌头离击点最近 ${f3(hit)} 米`);
  await leave('muyu');
}

// —— 拈一则 ——
if (want('lots')) {
  console.log('\n拈一则');
  await approach('lots', [3.2, 1.0]);
  await wait(900);
  const a = await rec(900);
  const tube = await ev(() => { const k = window.__ks, g = k.parts.lots, V = k.player.pos.constructor, v = new V(); g.getWorldPosition(v); const c = new V(); k.player.av.joints.chest.getWorldPosition(c); return { dz: Math.hypot(v.x - c.x, v.z - c.z), dy: v.y - c.y }; });
  const e = reachErr(a.rows);
  R.ok('拈一则：签筒捧在胸前', tube.dz > 0.12 && tube.dz < 0.5 && Math.abs(tube.dy) < 0.4, `离胸口 水平 ${f2(tube.dz)} 高差 ${f2(tube.dy)}`);
  R.ok('拈一则：两手扶着筒', e.L < 0.05 && e.R < 0.05, `左 ${f3(e.L)} 右 ${f3(e.R)} 米`);
  await shot(page, d, 'lots-1-hold');
  await page.mouse.move(W / 2, H / 2); await page.mouse.down();
  for (let i = 0; i < 60 && (await state()).phase === 'shake'; i++) { await page.mouse.move(W / 2 + (i % 2 ? 70 : -70), H / 2, { steps: 4 }); await wait(60); if (i === 6) await shot(page, d, 'lots-2-shake'); }
  await page.mouse.up();
  await page.waitForFunction(() => window.__ks.act?.state.phase === 'drawn', null, { timeout: 6000 }).catch(() => {});
  R.ok('拈一则：摇出一支', (await state()).phase === 'drawn');
  await shot(page, d, 'lots-3-drawn');
  await leave('lots');
}

// —— 撞钟 ——
if (want('bell')) {
  console.log('\n撞钟');
  const sp = await ev(() => { const L = window.__ks.acts.bell.spot; return [L.x - 1.14, L.z - 1.31]; });
  await approach('bell', [sp[0], sp[1], 'bell']);
  const a = await rec(900);
  const e0 = reachErr(a.rows);
  R.ok('撞钟：两手扶在撞木上', e0.L < 0.05 && e0.R < 0.05, `左 ${f3(e0.L)} 右 ${f3(e0.R)} 米`);
  await shot(page, d, 'bell-1-rest');
  const b = await rec(null, async () => { await page.mouse.move(W / 2, H / 2); await page.mouse.down(); await wait(1500); await shot(page, d, 'bell-2-pulled'); });
  const e1 = reachErr(b.rows, Math.floor(b.rows.length * 0.6));
  R.ok('撞钟：引开时手没脱开', e1.L < 0.07 && e1.R < 0.07, `左 ${f3(e1.L)} 右 ${f3(e1.R)} 米`);
  const c = await rec(null, async () => { await page.mouse.up(); await wait(450); await shot(page, d, 'bell-3-swing'); await wait(2200); });
  const s = await state(), e2 = reachErr(c.rows);
  R.ok('撞钟：松手撞响', s.count === '第一声', `${s.count} ${s.hint}`);
  R.ok('撞钟：荡回去时手跟着', e2.Lmax < 0.16 && e2.Rmax < 0.16, `最大 左 ${f3(e2.Lmax)} 右 ${f3(e2.Rmax)} 米`);
  await tap(); await wait(2600);
  R.ok('撞钟：轻点一下也响', (await state()).count === '第二声', (await state()).count);
  await leave('bell');
}

// —— 击鼓 ——
if (want('drum')) {
  console.log('\n击鼓');
  const sp = await ev(() => { const L = window.__ks.acts.drum.spot; return [L.x + 0.2, L.z + 0.62]; });
  await approach('drum', [sp[0], sp[1], 'drum']);
  await wait(700);
  await shot(page, d, 'drum-1-ready');
  const pts = await ev(() => {
    const k = window.__ks, dr = k.parts.drum, V = k.player.pos.constructor, c = new V().copy(dr.userData.center); dr.updateWorldMatrix(true, false); c.applyMatrix4(dr.matrixWorld);
    const R = dr.userData.radius, o = { x: 0, y: 0, visible: false, dist: 0 }, out = [];
    for (const [a, b] of [[0, 0], [0, 0.45], [0.5, -0.2], [-0.5, -0.2], [0, -0.6], [0, 1.02]]) { const p = c.clone(); p.y += b * R; p.z += a * R; k.nav.project(p, o); out.push({ x: o.x, y: o.y, w: [p.x, p.y, p.z] }); }
    return out;
  });
  const near = [];
  for (let i = 0; i < pts.length; i++) {
    await page.mouse.move(pts[i].x, pts[i].y); await page.mouse.down();
    let best = 9;
    for (let j = 0; j < 8; j++) {
      const h = await ev(() => { const k = window.__ks, V = k.player.pos.constructor; return k.parts.drum.userData.sticks.map((s) => { const v = new V(0, 0.475, 0); s.updateWorldMatrix(true, false); v.applyMatrix4(s.matrixWorld); return [v.x, v.y, v.z]; }); });
      best = Math.min(best, dist(h[0], pts[i].w), dist(h[1], pts[i].w));
      await wait(14);
    }
    await page.mouse.up(); near.push(best); await wait(420);
  }
  // 再敲一下鼓心，趁槌在鼓面上截一张（截图慢，不和上面的测量混在一起）
  await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down(); await wait(75); await shot(page, d, 'drum-2-strike'); await page.mouse.up(); await wait(420);
  const s = await state();
  R.ok('击鼓：点一下响一声', s.count === '七声', s.count);
  R.ok('击鼓：槌头落在点到的地方', Math.max(...near.slice(0, 5)) < 0.12, `各次最近 ${near.map(f2).join(' ')} 米`);
  const held = await ev(() => { const k = window.__ks, av = k.player.av; return k.parts.drum.userData.sticks.map((s) => { let o = s.parent; while (o) { if (o === av.joints.handL || o === av.joints.handR) return true; o = o.parent; } return false; }); });
  R.ok('击鼓：两支槌各在一只手里', held.every(Boolean));
  await leave('drum');
  const back = await ev(() => window.__ks.parts.drum.userData.sticks.every((s) => s.parent === window.__ks.parts.drum));
  R.ok('击鼓：做完槌放回鼓架', back);
}

// —— 静坐 ——
if (want('sit')) {
  console.log('\n静坐');
  await approach('sit', [34.3, -15.0]);
  await wait(1200);
  const s0 = await ev(() => { const k = window.__ks, p = k.player, V = p.pos.constructor, h = new V(); p.av.joints.hips.getWorldPosition(h); const seat = k.parts.seat.sit; return { pose: p.av.pose, hips: h.y - seat.y, box: window.__probe.box(), floor: seat.y, dx: Math.hypot(h.x - seat.x, h.z - seat.z) }; });
  R.ok('静坐：坐在蒲团上', s0.pose === 'sit' && s0.hips > 0.14 && s0.hips < 0.42 && s0.dx < 0.2, `胯高出地面 ${f2(s0.hips)} 米，离蒲团心 ${f2(s0.dx)} 米`);
  R.ok('静坐：不穿进地里', s0.box.lo[1] > s0.floor - 0.035, `最低 ${f3(s0.box.lo[1] - s0.floor)}`);
  await shot(page, d, 'sit-1-seated');
  await ev(() => window.__ks.act.cmd('start', 0));
  await page.waitForFunction(() => window.__ks.act?.state.phase === 'sitting', null, { timeout: 12000 }).catch(() => {});
  const a = await rec(3000);
  let wob = 0;
  for (let i = 1; i < a.rows.length; i++) wob = Math.max(wob, dist(a.rows[i].head, a.rows[i - 1].head));
  const breath = Math.max(...a.rows.map((r) => r.chest[1])) - Math.min(...a.rows.map((r) => r.chest[1]));
  R.ok('静坐：坐定了，只剩呼吸', (await state()).phase === 'sitting' && wob < 0.004, `头一帧最多动 ${f3(wob)} 米，胸口起伏 ${f3(breath)} 米`);
  await shot(page, d, 'sit-2-sitting');
  await ev(() => window.__ks.act.cmd('stop'));
  await wait(400);
  R.ok('静坐：起身', (await state()).phase === 'done');
  await leave('sit');
}

// —— 念珠 ——
if (want('beads')) {
  console.log('\n念珠');
  await approach('beads', [34.3, -16.0]);
  await wait(2400);
  const vis = await ev(() => window.__ks.player.av.root.visible);
  R.ok('念珠：镜头凑到眼前时不画自己', vis === false);
  for (let i = 0; i < 5; i++) { await tap(); await wait(260); }
  R.ok('念珠：拨一颗数一颗', (await state()).count === '第五颗', (await state()).count);
  await shot(page, d, 'beads-1');
  await leave('beads');
}

// —— 抄经 ——
if (want('copy')) {
  console.log('\n抄经');
  await approach('copy', [-20.9, -1.6]);
  await wait(1700);
  const held = await ev(() => { const k = window.__ks, b = k.parts.desk.userData.brush; let o = b.parent; while (o) { if (o === k.player.av.joints.handR) return true; o = o.parent; } return false; });
  R.ok('抄经：取了笔', held);
  await shot(page, d, 'copy-1-brush');
  const errs = [];
  for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.5, 0.5]]) {
    await ev(([x, y]) => window.__ks.act.cmd('pen', { x, y, down: true }), [x, y]);
    await wait(650);
    errs.push(await ev(([x, y]) => {
      const k = window.__ks, dk = k.parts.desk, V = k.player.pos.constructor, sh = dk.userData.sheet, b = dk.userData.brush, p = dk.userData.paper;
      const want = new V(sh.w * 0.2 + (x - 0.5) * 0.09, 0.002, sh.h * 0.27 + (y - 0.5) * 0.09); p.updateWorldMatrix(true, false); want.applyMatrix4(p.matrixWorld);
      const tip = new V(); b.getWorldPosition(tip);
      return [Math.hypot(tip.x - want.x, tip.z - want.z), tip.y - want.y];
    }, [x, y]));
    if (x === 0.5) await shot(page, d, 'copy-2-write');
  }
  R.ok('抄经：笔尖落在纸上该落的地方', Math.max(...errs.map((e) => e[0])) < 0.035 && Math.max(...errs.map((e) => Math.abs(e[1]))) < 0.03, `水平偏 ${errs.map((e) => f3(e[0])).join(' ')}；高出纸面 ${errs.map((e) => f3(e[1])).join(' ')}`);
  await leave('copy');
  const back = await ev(() => window.__ks.parts.desk.userData.brush.parent === window.__ks.parts.desk);
  R.ok('抄经：做完笔放回笔山', back);
}

// —— 放灯 ——
if (want('lamp')) {
  console.log('\n放灯');
  await approach('lamp', [-8.4, 39.4]);
  await wait(900);
  const a = await rec(700), e0 = reachErr(a.rows);
  const y0 = await ev(() => { const p = window.__ks.player; return { y: p.pos.y, pose: p.av.pose, box: window.__probe.box() }; });
  R.ok('放灯：下到水边跪着', y0.pose === 'kneel' && Math.abs(y0.y + 0.3) < 0.02 && y0.box.lo[1] > -0.3 - 0.035, `脚下 ${f2(y0.y)}，最低 ${f3(y0.box.lo[1])}`);
  R.ok('放灯：两手捧着灯', e0.L < 0.05 && e0.R < 0.05, `左 ${f3(e0.L)} 右 ${f3(e0.R)} 米`);
  await shot(page, d, 'lamp-1-hold');
  const b = await rec(null, async () => { await ev(() => window.__ks.act.cmd('light', '愿平安')); await wait(900); await shot(page, d, 'lamp-2-lower'); await page.waitForFunction(() => window.__ks.act?.state.phase === 'push', null, { timeout: 5000 }).catch(() => {}); });
  const lw = await ev(() => { const k = window.__ks, V = k.player.pos.constructor, a = new V(), b2 = new V(); k.player.av.joints.handL.getWorldPosition(a); k.player.av.joints.handR.getWorldPosition(b2); const mid = a.add(b2).multiplyScalar(0.5); let lamp = null, best = 9; k.world.scene.traverse((o) => { if (o.name === 'lotusLamp') { const d = o.position.distanceTo(mid); if (d < best) { best = d; lamp = o; } } }); return { d: best, y: lamp ? lamp.position.y : 9, water: -0.38 }; });
  R.ok('放灯：灯是两手送到水面的', (await state()).phase === 'push' && lw.d < 0.06 && Math.abs(lw.y - lw.water) < 0.02, `灯离两手之间 ${f3(lw.d)} 米，灯高 ${f3(lw.y)}（水面 ${lw.water}）`);
  await wait(300); await shot(page, d, 'lamp-3-water');
  await tap(); await wait(500); await shot(page, d, 'lamp-4-push');
  await wait(2200);
  R.ok('放灯：一推就漂出去', (await state()).phase === 'afloat');
  await shot(page, d, 'lamp-5-afloat');
  await wait(3000);
  R.ok('放灯：又捧起一盏', (await state()).phase === 'write');
  await leave('lamp');
}

// —— 扫叶 ——
if (want('sweep')) {
  console.log('\n扫叶');
  await approach('sweep', [-6.4, 10.2]);
  await wait(500);
  await shot(page, d, 'sweep-1-take');
  const a = await rec(null, async () => {
    for (const [x, z] of [[-7.5, 11.5], [-9.5, 11.2], [-8.2, 9.4]]) { await ev(([x, z]) => window.__ks.player.goTo(x, z), [x, z]); await wait(1900); if (x === -9.5) await shot(page, d, 'sweep-2-walk'); }
  });
  const e = reachErr(a.rows);
  const br = await ev(() => { const k = window.__ks, b = k.parts.broom, p = k.player; return { d: Math.hypot(b.position.x - p.pos.x, b.position.z - p.pos.z), y: b.position.y - p.pos.y, locked: p.locked }; });
  R.ok('扫叶：拿着扫帚照常能走', !br.locked && Math.hypot(a.rows.at(-1).pos[0] - a.rows[0].pos[0], a.rows.at(-1).pos[2] - a.rows[0].pos[2]) > 0.5);
  R.ok('扫叶：帚在身前着地', br.d > 0.5 && br.d < 1.3 && Math.abs(br.y) < 0.03, `离人 ${f2(br.d)} 米`);
  R.ok('扫叶：两手握着帚竿', e.L < 0.07 && e.R < 0.07, `左 ${f3(e.L)} 右 ${f3(e.R)} 米（最大 ${f3(Math.max(e.Lmax, e.Rmax))}）`);
  await leave('sweep');
}

// —— 吃茶 ——
if (want('tea')) {
  console.log('\n吃茶');
  const tx = await ev(() => { const s = window.__ks.parts.seat.tea; return [s.x - 2.2, s.z + 0.1]; });
  const ap = await approach('tea', tx);
  // 走过去时不能穿过茶几
  const tb = await ev(() => { const s = window.__ks.parts.seat.tea; return { x0: s.x - 0.36 - 0.25 - 0.27, x1: s.x - 0.36 - 0.25 + 0.27, z0: s.z - 0.47, z1: s.z + 0.47 }; });
  R.ok('吃茶：绕过茶几入座', ap.rows.every((r) => !(r.pos[0] > tb.x0 && r.pos[0] < tb.x1 && r.pos[2] > tb.z0 && r.pos[2] < tb.z1)));
  await wait(900);
  await shot(page, d, 'tea-1-wait');
  await tap(); await page.waitForFunction(() => window.__ks.act?.state.step === 1, null, { timeout: 5000 }).catch(() => {});
  const a = await rec(null, async () => { await page.mouse.move(W / 2, H / 2); await page.mouse.down(); await wait(1700); await shot(page, d, 'tea-2-pour'); await page.waitForFunction(() => window.__ks.act?.state.step === 2, null, { timeout: 8000 }).catch(() => {}); await page.mouse.up(); });
  const e = reachErr(a.rows, Math.floor(a.rows.length * 0.3));
  R.ok('吃茶：注满了', (await state()).step === 2);
  R.ok('吃茶：左手提着壶', e.L < 0.06, `左手离提梁 中位 ${f3(e.L)} 最大 ${f3(e.Lmax)} 米`);
  await wait(1700);
  let nearMouth = 9;
  const b = await rec(null, async () => {
    await tap();
    for (let i = 0; i < 30; i++) {
      await wait(180);
      nearMouth = Math.min(nearMouth, await ev(() => { const k = window.__ks, V = k.player.pos.constructor, c = new V(), h = new V(); k.parts.tea.userData.cup.getWorldPosition(c); k.player.av.joints.head.getWorldPosition(h); return c.distanceTo(h); }));
      if (i === 13) await shot(page, d, 'tea-3-sip');
    }
  });
  const e2 = reachErr(b.rows);
  R.ok('吃茶：盏端到了嘴边', nearMouth < 0.24, `盏离头最近 ${f2(nearMouth)} 米`);
  R.ok('吃茶：右手端着盏', e2.R < 0.06, `右手离盏 中位 ${f3(e2.R)} 最大 ${f3(e2.Rmax)} 米`);
  R.ok('吃茶：茶吃了', (await state()).hint === '茶吃了。');
  await shot(page, d, 'tea-4-done');
  await leave('tea');
}

console.log('\n—— 页面报错 ——');
for (const l of [...new Set(logs)]) console.log(l);
const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
