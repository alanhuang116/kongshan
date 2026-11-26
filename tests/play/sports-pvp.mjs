// 四样比试，两个人玩（同游）：自己起一个中转（server/relay.mjs，默认 3841），开两页台子（world.html?ws=…&share=0）。
//   斗鸡：甲先到西边蹲处，乙到东边；甲「邀」乙，乙「应邀」；两边各自出招，都出了才亮——一整场斗完，两边的气、力、输赢一模一样。
//   射箭：甲上射、乙下射，轮着各射四矢；两边看见的每一箭中在哪、几筹一模一样。
//   蹴鞠：两人对踢一趟，两边数的脚数一样；鞠飞到对面跟前、对面还没踢出来时在他脚下颠着等。
//   走了：斗到一半关掉乙那一页，甲这边收场、二郎接过鸡斗完。
// 用法：KS_URL=http://localhost:3831/world.html node tests/play/sports-pvp.mjs [cock,archery,cuju,leave] [--shots]（KS_RELAY_PORT 换端口）
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { launch, open, dir, Report } from './lib.mjs';

const PORT = Number(process.env.KS_RELAY_PORT ?? 3841), WS = `ws://localhost:${PORT}/ws`;
const ROOT = join(import.meta.dirname, '..', '..');
const args = process.argv.slice(2), shots = args.includes('--shots');
const only = args.find((a) => !a.startsWith('--'))?.split(',') ?? null;
const want = (id) => !only || only.includes(id);
const R = new Report(), d = dir('games');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mine = (l) => /games|play\/|acts\/(archery|cuju|cock|ride)|比试|同游：玩法/.test(l) && !/GPU stall|ReadPixels|WebSocket connection|ERR_CONNECTION/.test(l);

let relay = null;
async function startRelay() {
  relay = spawn(process.execPath, [join(ROOT, 'server', 'relay.mjs')], { cwd: ROOT, env: { ...process.env, KS_RELAY_PORT: String(PORT), KS_RELAY_PER_IP: '64' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  relay.stdout.on('data', (x) => { out += x; });
  relay.stderr.on('data', (x) => { out += x; });
  for (let i = 0; i < 60 && !/relay on/.test(out); i++) await sleep(100);
  if (!/relay on/.test(out)) throw new Error(`中转没起来：${out}`);
}
async function stopRelay() { if (!relay) return; const p = relay; relay = null; const gone = new Promise((r) => p.once('exit', r)); p.kill(); await Promise.race([gone, sleep(3000)]); }

const browser = await launch();
await startRelay();
const cleanup = async () => { await browser.close().catch(() => {}); await stopRelay(); };
process.on('SIGINT', async () => { await cleanup(); process.exit(1); });

/** 两页：甲、乙。都连上、互相看见 */
async function pair(s = 'village', t = '10') {
  const A = await open(browser, { s, t, ui: '0', ws: WS, share: '0' }, { w: 1280, h: 800 });
  const B = await open(browser, { s, t, ui: '0', ws: WS, share: '0' }, { w: 1280, h: 800 });
  const on = (p) => p.waitForFunction(() => window.__net?.status === 'online' && window.__net.remotes.size === 1 && window.__net.canPlay, null, { timeout: 25000 }).then(() => true, () => false);
  const ok = (await on(A.page)) && (await on(B.page));
  return { A, B, ok };
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
const G = (p, key) => p.evaluate((key) => JSON.parse(JSON.stringify(window.__games[key] ?? null)), key);
const idOf = (p) => p.evaluate(() => window.__net.myId);
const enter = async (p, id, x, z) => { await ev(p, ([id, x, z]) => { const k = window.__ks; k.player.teleport(x, z, 0); k.nav.snapBehind(); k.enterAct(id, true); }, [id, x, z]); };
/** 甲邀乙、乙应：两边都开始了 */
async function invite(A, B, key) {
  const idB = await idOf(B.page);
  await ev(A.page, (id) => window.__ks.cmd(`inv:${id}`), idB);
  const got = await B.page.waitForFunction(() => (window.__ks.act?.state?.choices ?? []).some((c) => c.id === 'accept'), null, { timeout: 8000 }).then(() => true, () => false);
  const label = await ev(B.page, () => (window.__ks.act?.state?.choices ?? []).find((c) => c.id === 'accept')?.label ?? '');
  await ev(B.page, () => window.__ks.cmd('accept'));
  const started = await Promise.all([A.page, B.page].map((p) => p.waitForFunction((key) => !!window.__games[key]?.match, key, { timeout: 8000 }).then(() => true, () => false)));
  return { got, label, started: started.every(Boolean) };
}

try {
  // ———— 斗鸡 ————
  if (want('cock')) {
    console.log('斗鸡');
    const { A, B, ok } = await pair();
    R.ok('斗鸡：两页连上、互相看见', ok);
    await enter(A.page, 'cock', 37.9, 32.2);
    await sleep(2500);
    await enter(B.page, 'cock', 41.1, 32.2);
    await sleep(1500);
    const sides0 = [await G(A.page, 'cock'), await G(B.page, 'cock')].map((g) => g?.me);
    const inv = await invite(A, B, 'cock');
    R.ok('斗鸡：乙那边出了「应某某之邀」，应了两边都开始', inv.got && inv.started && /应.*之邀/.test(inv.label), inv.label);
    const sides = [await G(A.page, 'cock'), await G(B.page, 'cock')].map((g) => g?.match?.side);
    R.ok('斗鸡：甲先手（西、赤羽）、乙后手（东、芦花）', sides[0] === 0 && sides[1] === 1, `进场时 ${sides0} 开始后 ${sides}`);
    let rounds = 0, hidden = true;
    for (let i = 0; i < 12; i++) {
      const okA = await A.page.waitForFunction(() => ['choose', 'end'].includes(window.__games.cock.phase), null, { timeout: 25000 }).then(() => true, () => false);
      await B.page.waitForFunction(() => ['choose', 'waitFoe', 'end'].includes(window.__games.cock.phase), null, { timeout: 25000 }).catch(() => {});
      if (!okA || (await G(A.page, 'cock')).phase === 'end') break;
      // 甲先出：乙那边这时还看不见甲出了什么（界面上只有「出一招」）
      await ev(A.page, (r) => window.__ks.cmd(['m1', 'm0', 'm2'][r % 3]), i);
      await sleep(400);
      const bs = await ev(B.page, () => ({ st: window.__ks.act?.state, g: window.__games.cock }));
      if (JSON.stringify(bs.st ?? {}).match(/甲|扑！|啄！/) || bs.g.phase === 'clash') hidden = false;
      if (shots && i === 0) await A.page.screenshot({ path: join(d, 'pvp_cock_A_choose.png') });
      await ev(B.page, (r) => { const ch = (window.__ks.act?.state?.choices ?? []).filter((c) => /^m\d$/.test(c.id) && !c.off); window.__ks.cmd((ch.find((c) => c.id === ['m0', 'm2', 'm1'][r % 3]) ?? ch[0])?.id ?? 'm2'); }, i);
      rounds++;
      if (shots && i === 0) { await sleep(900); await A.page.screenshot({ path: join(d, 'pvp_cock_A_clash.png') }); await B.page.screenshot({ path: join(d, 'pvp_cock_B_clash.png') }); }
      await sleep(400);
    }
    await Promise.all([A.page, B.page].map((p) => p.waitForFunction(() => window.__games.cock.phase === 'end', null, { timeout: 30000 }).catch(() => {})));
    const ga = await G(A.page, 'cock'), gb = await G(B.page, 'cock');
    R.ok('斗鸡：先出的那一招，对面亮之前看不见', hidden);
    R.ok('斗鸡：一整场斗完', ga.phase === 'end' && gb.phase === 'end', `${rounds} 回合 ${ga.phase}/${gb.phase}`);
    R.ok('斗鸡：两边的气、力、输赢一模一样', JSON.stringify(ga.birds) === JSON.stringify(gb.birds) && ga.result === gb.result && ga.round === gb.round, `甲 ${JSON.stringify(ga.birds)} ${ga.result} · 乙 ${JSON.stringify(gb.birds)} ${gb.result}`);
    const boards = [await ev(A.page, () => window.__ks.mem.get('board', {}).best?.cock ?? 0), await ev(B.page, () => window.__ks.mem.get('board', {}).best?.cock ?? 0)];
    R.ok('斗鸡：胜的那一边上了榜', ga.result === 0 || (ga.result === 1 ? boards[0] >= 1 : boards[1] >= 1), `榜 ${boards}`);
    if (shots) { await A.page.screenshot({ path: join(d, 'pvp_cock_A_end.png') }); await B.page.screenshot({ path: join(d, 'pvp_cock_B_end.png') }); }
    const errs = [...A.logs, ...B.logs].filter(mine);
    R.ok('斗鸡：这一路没有报错', errs.length === 0, errs.slice(0, 3).join(' | '));
    await A.ctx.close(); await B.ctx.close();
  }

  // ———— 射箭 ————
  if (want('archery')) {
    console.log('射箭');
    const { A, B, ok } = await pair();
    R.ok('射箭：两页连上', ok);
    await enter(A.page, 'archery', 112.2, 16.5);
    await sleep(2500);
    await enter(B.page, 'archery', 113.8, 16.5);
    await sleep(1500);
    const inv = await invite(A, B, 'archery');
    R.ok('射箭：邀、应，两边都开始', inv.got && inv.started, inv.label);
    // 轮着射：轮到哪一页，那一页瞄、引、发
    let n = 0;
    for (let i = 0; i < 40 && n < 8; i++) {
      for (const P of [A.page, B.page]) {
        const g = await G(P, 'archery');
        if (g?.phase !== 'ready') continue;
        await sleep(200);
        await ev(P, () => { const g = window.__games.archery; window.__ks.cmd('aim', [-g.aim[0] + (Math.random() - 0.5) * 0.3, -g.aim[1] + (Math.random() - 0.5) * 0.3]); window.__ks.cmd('draw', 'down'); });
        await sleep(1300);
        await ev(P, () => window.__ks.cmd('draw', 'up'));
        n++;
        if (shots && n === 3) { await sleep(500); await A.page.screenshot({ path: join(d, 'pvp_archery_A.png') }); await B.page.screenshot({ path: join(d, 'pvp_archery_B.png') }); }
      }
      await sleep(500);
    }
    await Promise.all([A.page, B.page].map((p) => p.waitForFunction(() => window.__games.archery.phase === 'end', null, { timeout: 30000 }).catch(() => {})));
    const ga = await G(A.page, 'archery'), gb = await G(B.page, 'archery');
    R.ok('射箭：各射了四矢', ga.rings[0].length === 4 && ga.rings[1].length === 4 && gb.rings[0].length === 4 && gb.rings[1].length === 4, `甲看 ${JSON.stringify(ga.rings)} 乙看 ${JSON.stringify(gb.rings)}`);
    R.ok('射箭：两边看见的每一箭、几筹一模一样', JSON.stringify(ga.rings) === JSON.stringify(gb.rings) && JSON.stringify(ga.score) === JSON.stringify(gb.score), `${ga.score} / ${gb.score}`);
    const bA = await ev(A.page, () => window.__ks.mem.get('board', {}).best?.archery), bB = await ev(B.page, () => window.__ks.mem.get('board', {}).best?.archery);
    R.ok('射箭：两人各自的一轮上了自己的榜', bA === ga.score[0] && bB === gb.score[1], `甲 ${bA} 乙 ${bB}`);
    const errs = [...A.logs, ...B.logs].filter(mine);
    R.ok('射箭：这一路没有报错', errs.length === 0, errs.slice(0, 3).join(' | '));
    await A.ctx.close(); await B.ctx.close();
  }

  // ———— 蹴鞠 ————
  if (want('cuju')) {
    console.log('蹴鞠');
    const { A, B, ok } = await pair('bridge');
    R.ok('蹴鞠：两页连上', ok);
    await enter(A.page, 'cuju', 9.6, 51);
    await sleep(2500);
    await enter(B.page, 'cuju', 14.4, 51);
    await sleep(1500);
    const inv = await invite(A, B, 'cuju');
    R.ok('蹴鞠：邀、应，两边都开始', inv.got && inv.started, inv.label);
    // 两页各自：鞠飞到自己跟前落到脚背那么高时踢；踢满八脚以后乙不踢了
    for (const [P, limit] of [[A.page, 99], [B.page, 8]]) {
      await ev(P, (limit) => {
        let done = -1, mineN = 0;
        window.__autoKick = setInterval(() => { const g = window.__games.cuju; if (g.phase !== 'play' || g.to !== g.me || g.seq === done || g.held) return; if (g.rally >= limit) return; if (g.t >= g.hitT - 0.03) { done = g.seq; mineN++; window.__ks.cmd('kick', 'down'); } }, 8);
      }, limit);
    }
    // 等着的那一下只有一两百毫秒（本机的中转快）：在页面里每一帧看一眼，记下有没有等过
    await ev(A.page, () => { window.__sawHeld = false; const f = () => { if (window.__games.cuju?.held) window.__sawHeld = true; if (window.__games.cuju?.phase !== 'dropped') requestAnimationFrame(f); }; requestAnimationFrame(f); });
    for (let i = 0; i < 80; i++) { await sleep(250); const g = await G(A.page, 'cuju'); if (g.phase === 'dropped') break; }
    const held = await ev(A.page, () => window.__sawHeld);
    await Promise.all([A.page, B.page].map((p) => p.waitForFunction(() => window.__games.cuju.phase === 'dropped', null, { timeout: 20000 }).catch(() => {})));
    const ga = await G(A.page, 'cuju'), gb = await G(B.page, 'cuju');
    R.ok('蹴鞠：鞠落了地，两边数的脚数一样', ga.phase === 'dropped' && gb.phase === 'dropped' && ga.rally === gb.rally && ga.rally >= 6, `甲 ${ga.rally} 乙 ${gb.rally}`);
    R.ok('蹴鞠：鞠飞到对面跟前、对面还没踢出来时在他脚下颠着等', held);
    if (shots) { await A.page.screenshot({ path: join(d, 'pvp_cuju_A.png') }); }
    const errs = [...A.logs, ...B.logs].filter(mine);
    R.ok('蹴鞠：这一路没有报错', errs.length === 0, errs.slice(0, 3).join(' | '));
    await A.ctx.close(); await B.ctx.close();
  }

  // ———— 同游的人身边带的东西：骑着驴的身下有一头驴、抱着鸡的怀里有一只鸡 ————
  if (want('props')) {
    console.log('身边的东西');
    const { A, B, ok } = await pair();
    R.ok('身边的东西：两页连上', ok);
    // 甲去骑驴，乙站在驴旁边几步外看着
    const spot = await ev(A.page, async () => { const k = window.__ks, a = k.acts.donkey; for (let i = 0; i < 40 && !a.on(); i++) await new Promise((r) => setTimeout(r, 250)); return { x: a.spot.x, z: a.spot.z }; });
    await ev(B.page, ([x, z]) => { const k = window.__ks; k.player.teleport(x - 3, z - 3, 0); k.nav.snapBehind(); }, [spot.x, spot.z]);
    await enter(A.page, 'donkey', spot.x, spot.z);
    await A.page.waitForFunction(() => window.__games['ride:donkey']?.phase === 'ride', null, { timeout: 20000 }).catch(() => {});
    await ev(A.page, () => window.__ks.cmd('goto', [100, 35]));
    await sleep(3500);
    const seen = await ev(B.page, () => {
      const k = window.__ks, net = window.__net, r = [...net.remotes.values()][0];
      let mesh = null;
      k.world.scene.traverse((o) => { if (o.name === 'net:donkey') mesh = o; });
      if (!r || !mesh) return { r: !!r, mesh: !!mesh };
      // 驴的网是按世界坐标画的：看它画出来的那几块离他的身子多远
      // （收着的那几块挪到了地下五百米：只算摆着的顶点）
      const P = mesh.geometry.attributes.position.array, c = r.pos.clone().set(0, 0, 0);
      let n = 0;
      for (let i = 0; i < P.length; i += 3) { if (P[i + 1] < -100) continue; c.x += P[i]; c.y += P[i + 1]; c.z += P[i + 2]; n++; }
      c.multiplyScalar(1 / Math.max(1, n)).applyMatrix4(mesh.matrixWorld);
      return { r: true, mesh: true, visible: mesh.visible && mesh.parent?.visible !== false, pose: r.pose, dist: Math.hypot(c.x - r.pos.x, c.z - r.pos.z), dy: r.pos.y - k.player.pos.y };
    });
    R.ok('身边的东西：乙那边，骑驴的甲身下画着一头驴（他横坐着，驴就在他身旁）', seen.mesh && seen.visible && seen.pose === 'bench' && seen.dist < 1.6, JSON.stringify(seen));
    const taken = await ev(B.page, () => ({ village: window.__ks.life.fauna.donkey.parts.mesh.visible, on: window.__ks.acts.donkey.on() }));
    R.ok('身边的东西：乙那边村里那头驴也算被甲借走了（不画两头，乙这时骑不了）', taken.village === false && taken.on === false, JSON.stringify(taken));
    if (shots) await B.page.screenshot({ path: join(d, 'pvp_ride_B_sees_A.png') });
    await ev(A.page, () => window.__ks.cmd('done'));
    await sleep(2500);
    // 甲去斗鸡场抱起赤羽（还没下场），乙走到旁边看
    await enter(A.page, 'cock', 37.9, 32.2);
    await ev(B.page, () => { const k = window.__ks; k.player.teleport(39.5, 36.5, Math.PI); k.nav.snapBehind(); });
    await A.page.waitForFunction(() => window.__games.cock?.phase === 'hold', null, { timeout: 10000 }).catch(() => {});
    // 甲站到场边一步外（蹲处不抱）
    await ev(A.page, () => window.__ks.player.settleAt(37.6, 33.4));
    await sleep(3500);
    const hold = await ev(B.page, () => { let m = null; window.__ks.world.scene.traverse((o) => { if (o.name === 'net:cock') m = o; }); return { mesh: !!m, visible: !!m && m.visible && m.parent?.visible !== false }; });
    R.ok('身边的东西：乙那边，抱着鸡的甲怀里有一只鸡', hold.mesh && hold.visible, JSON.stringify(hold));
    if (shots) await B.page.screenshot({ path: join(d, 'pvp_cock_B_sees_A_hold.png') });
    const errs = [...A.logs, ...B.logs].filter(mine);
    R.ok('身边的东西：没有报错', errs.length === 0, errs.slice(0, 3).join(' | '));
    await A.ctx.close(); await B.ctx.close();
  }

  // ———— 斗到一半对面走了 ————
  if (want('leave')) {
    console.log('走了');
    const { A, B, ok } = await pair();
    R.ok('走了：两页连上', ok);
    await enter(A.page, 'cock', 37.9, 32.2);
    await sleep(2500);
    await enter(B.page, 'cock', 41.1, 32.2);
    await sleep(1500);
    const inv = await invite(A, B, 'cock');
    R.ok('走了：开始了', inv.started);
    await A.page.waitForFunction(() => window.__games.cock.phase === 'choose', null, { timeout: 15000 }).catch(() => {});
    await B.ctx.close();
    const ended = await A.page.waitForFunction(() => !window.__games.cock.match && !!window.__games.cock.partner, null, { timeout: 15000 }).then(() => true, () => false);
    R.ok('走了：甲这边收场，村里的后生过来接着斗', ended, JSON.stringify(await G(A.page, 'cock')));
    for (let i = 0; i < 12; i++) {
      const g = await G(A.page, 'cock');
      if (g.phase === 'end') break;
      if (g.phase === 'choose') await ev(A.page, () => { const ch = (window.__ks.act?.state?.choices ?? []).filter((c) => /^m\d$/.test(c.id) && !c.off); window.__ks.cmd(ch[0].id); });
      await sleep(3000);
    }
    const g = await G(A.page, 'cock');
    R.ok('走了：这一场照样斗完', g.phase === 'end', g.phase);
    const errs = A.logs.filter(mine);
    R.ok('走了：没有报错', errs.length === 0, errs.slice(0, 3).join(' | '));
    await A.ctx.close();
  }
} catch (e) {
  R.ok('跑的时候出错', false, String(e?.stack ?? e).slice(0, 500));
}

const bad = R.done();
await cleanup();
process.exit(bad ? 1 : 0);
