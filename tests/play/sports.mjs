// 四样比试，一个人玩（陪的是村里人）：射箭、蹴鞠、斗鸡、骑驴（白天）与骑牛（夜里牛在棚里）。
// 每一样：从几步外走过去 → 玩完一轮（用界面会发的那些指令：按下 / 松开、点签、点地面）→ 成绩报上了榜（board 的 best 与 log）→
// 退出以后人站起来、能走、身子回到场景里、镜头回到身后 → 这一路没有报错。骑的另看：牲口换出来、人坐在背上、下来以后它自己走回去换回村里那一头。
// 用法：KS_URL=http://localhost:3831/world.html node tests/play/sports.mjs [archery,cuju,cock,donkey,ox] [--shots]
import { launch, open, dir, Report } from './lib.mjs';
import { join } from 'node:path';

const args = process.argv.slice(2), shots = args.includes('--shots');
const only = args.find((a) => !a.startsWith('--'))?.split(',') ?? null;
const R = new Report(), d = dir('games');
const browser = await launch();
const mine = (l) => /games|play\/|acts\/(archery|cuju|cock|ride)|比试|骑|鞠|射/.test(l) && !/GPU stall|ReadPixels|WebSocket/.test(l);

/** 在页面里跑的一段：k 世界、G 各样比试挂出来的状态（window.__games）、wait、until */
const RUN = async (page, src, arg) => page.evaluate(async ([src, arg]) => {
  const k = window.__ks, G = window.__games, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { try { if (fn()) return true; } catch { /* 还没好 */ } await wait(40); } return false; };
  const fn = eval(`(${src})`);
  try { return await fn({ k, G, wait, until, arg }); } catch (e) { return { error: String(e?.stack ?? e) }; }
}, [src.toString(), arg ?? null]);

const GAMES = [
  {
    id: 'archery', q: { s: 'village', t: '10' }, from: [113.5, 11],
    play: async ({ k, G, until, wait }) => {
      await until(() => G.archery?.phase === 'intro', 8000);
      const intro = k.act.state.text;
      k.cmd('go');
      // 每轮到自己：照着风补一点（先瞄正中，看上一支偏在哪往回挪），按住引满了松手
      let shots = 0, adj = [0, 0];
      while (true) {
        const ok = await until(() => G.archery.phase === 'ready' || G.archery.phase === 'end', 30000);
        if (!ok || G.archery.phase === 'end') break;
        await wait(250);
        k.cmd('aim', [adj[0] - G.archery.aim[0], adj[1] - G.archery.aim[1]]);
        k.cmd('draw', 'down');
        await until(() => G.archery.draw >= 0.99, 3000);
        await until(() => Math.hypot(G.archery.sway[0], G.archery.sway[1]) < 0.03, 1500);
        const n0 = G.archery.rings[G.archery.me].length;
        k.cmd('draw', 'up'); shots++;
        await until(() => G.archery.rings[G.archery.me].length > n0, 6000);
      }
      const g = G.archery;
      return { intro, shots, g: JSON.parse(JSON.stringify(g)), text: k.act?.state?.text, board: k.mem.get('board', {}) };
    },
    check: (r) => {
      const me = r.g?.me ?? 0, s = r.g?.score?.[me];
      return [
        ['开头说清楚怎么算（鹄、正、侯）', /鹄/.test(r.intro ?? '') && /正/.test(r.intro ?? ''), r.intro],
        ['四矢射完、对面也射完', r.shots === 4 && r.g?.rings?.[0]?.length === 4 && r.g?.rings?.[1]?.length === 4, `我 ${r.g?.rings?.[me]} 对面 ${r.g?.rings?.[1 - me]}`],
        ['陪射的是村里人', !!r.g?.partner, r.g?.partner],
        ['结果里说了几筹、谁饮', /筹/.test(r.text ?? '') && /饮|相揖/.test(r.text ?? ''), r.text],
        ['上了榜（best 是这一轮的筹）', r.board?.best?.archery === s && r.board?.log?.some?.((x) => x[0] === 'archery'), `best=${r.board?.best?.archery} 筹=${s}`],
      ];
    },
  },
  {
    id: 'cuju', q: { s: 'bridge', t: '10' }, from: [8, 46],
    play: async ({ k, G, until, wait }) => {
      await until(() => G.cuju?.phase === 'intro', 8000);
      k.cmd('go');
      // 鞠飞到自己跟前、落到脚背那么高的那一刻按「踢」；踢够十脚以后不踢了，看它落地
      let done = -1, kicked = 0, stop = false;
      const tm = setInterval(() => {
        const g = G.cuju;
        if (stop || g.phase !== 'play' || g.to !== g.me || g.seq === done) return;
        if (g.t >= g.hitT - 0.03) { done = g.seq; kicked++; k.cmd('kick', 'down'); }
      }, 8);
      await until(() => G.cuju.rally >= 12 || G.cuju.phase === 'dropped', 60000);
      stop = true;
      await until(() => G.cuju.phase === 'dropped', 20000);
      clearInterval(tm);
      await wait(300);
      return { kicked, g: JSON.parse(JSON.stringify(G.cuju)), text: k.act?.state?.text, board: k.mem.get('board', {}) };
    },
    check: (r) => [
      ['连踢了十脚以上（两人一共）', (r.g?.rally ?? 0) >= 10, `${r.g?.rally} 脚，自己踢了 ${r.kicked}`],
      ['陪踢的是村里人', !!r.g?.partner, r.g?.partner],
      ['鞠落了地，说了这一趟几脚', r.g?.phase === 'dropped' && /连踢/.test(r.text ?? ''), r.text],
      ['上了榜（最多几脚）', r.board?.best?.cuju === r.g?.best && r.g?.best >= 10, `best=${r.board?.best?.cuju}`],
    ],
  },
  {
    id: 'cock', q: { s: 'village', t: '10' }, from: [39, 36],
    play: async ({ k, G, until, wait }) => {
      await until(() => G.cock?.phase === 'hold', 8000);
      const intro = k.act.state.text;
      let fights = 0, won = false, saw = null, completed = 0;
      while (fights < 4 && !won) {
        k.cmd(fights ? 'again' : 'go'); fights++;
        let r = 0;
        while (true) {
          const ok = await until(() => G.cock.phase === 'choose' || G.cock.phase === 'end', 20000);
          if (!ok || G.cock.phase === 'end') break;
          const st = k.act.state, ch = (st.choices ?? []).filter((c) => /^m\d$/.test(c.id) && !c.off);
          if (!saw) saw = { choices: (st.choices ?? []).map((c) => `${c.label}${c.sub ? '·' + c.sub : ''}`), tags: (st.tags ?? []).map((t) => `${t.text}|${t.sub}`) };
          // 照对面上一招克它（扑压啄、啄啄闪、闪让扑）
          const want = ['m1', 'm2', 'm0'][(r + fights) % 3], pick = ch.find((c) => c.id === want) ?? ch[0];
          k.cmd(pick.id); r++;
          await until(() => G.cock.phase !== 'choose', 4000);
          await wait(100);
        }
        await until(() => G.cock.phase === 'end', 8000);
        if (G.cock.phase === 'end') completed++;
        won = G.cock.result === (G.cock.me === 0 ? 1 : -1);
        await wait(300);
      }
      return { intro, fights, completed, won, saw, g: JSON.parse(JSON.stringify(G.cock)), text: k.act?.state?.text, mem: k.mem.get('games', {}), board: k.mem.get('board', {}) };
    },
    check: (r) => [
      ['开头说清楚了（扑压啄、啄啄闪、闪让扑，不见血）', /扑压得住啄/.test(r.intro ?? '') && /不见血/.test(r.intro ?? ''), r.intro],
      ['出招的签：啄、扑、闪，各说费力几', (r.saw?.choices ?? []).join(' ').match(/啄·费力一/) && /扑·费力二/.test((r.saw?.choices ?? []).join(' ')) && /闪·缓一口气/.test((r.saw?.choices ?? []).join(' ')), (r.saw?.choices ?? []).join(' ')],
      ['鸡头上的签写着气与力', (r.saw?.tags ?? []).some((t) => /气.*力/.test(t)), (r.saw?.tags ?? []).join(' ')],
      ['斗完了（有输赢或和）', r.g?.phase === 'end' && r.g?.result != null, `第 ${r.fights} 场，result=${r.g?.result}`],
      ['胜场记进存档、上了榜', !r.won || (r.board?.best?.cock === r.mem?.cock?.wins && r.mem?.cock?.wins >= 1), `wins=${r.mem?.cock?.wins} best=${r.board?.best?.cock} 胜了=${r.won}`],
      ['斗过的场数记下了', (r.mem?.cock?.n ?? 0) === r.completed && r.completed >= 1, `n=${r.mem?.cock?.n} 斗完 ${r.completed} 场（共下场 ${r.fights} 回）`],
    ],
  },
  {
    id: 'donkey', q: { s: 'village', t: '10' }, long: true,
    play: async ({ k, G, until, wait }) => {
      const D = () => G['ride:donkey'];
      await until(() => D()?.phase === 'ride', 20000);
      const seated = { pose: k.player.av.pose, y: k.player.av.root.position.y - k.player.pos.y, out: D().out };
      // 骑着绕一圈：一处一处点过去（快走）
      k.setRun(true);
      const RING = [['mill', 104.4, 37.5], ['wash', 47.6, 47.5], ['shrine', 41.6, 21.8], ['shed', 45.8, 4.4], ['well', 66.4, 18.8], ['elm', 88.0, 11.6], ['school', 99.2, 8.8], ['mill', 104.4, 37.5]];
      const passed = [];
      for (const [id, x, z] of RING) {
        k.cmd('goto', [x, z]);
        const t0 = performance.now();
        let last = [D().x, D().z], stuck = 0;
        while (performance.now() - t0 < 90000) {
          await wait(400);
          const g = D();
          if (Math.hypot(g.x - x, g.z - z) < 3.5 || g.finished != null) break;
          if (Math.hypot(g.x - last[0], g.z - last[1]) < 0.05) { stuck++; if (stuck > 6) { k.cmd('goto', [x, z]); stuck = 0; } } else stuck = 0;
          last = [g.x, g.z];
        }
        passed.push(`${id}:${Math.hypot(D().x - x, D().z - z).toFixed(1)}`);
        if (D().finished != null) break;
      }
      await until(() => D().finished != null, 8000);
      k.setRun(false);
      const g = JSON.parse(JSON.stringify(D()));
      return { seated, passed, g, board: k.mem.get('board', {}), hint: k.act?.state?.hint };
    },
    check: (r) => [
      ['驴换出来了，人横坐在背上（离地六七十厘米）', r.seated?.pose === 'bench' && r.seated?.out && r.seated?.y > 0.45 && r.seated?.y < 0.95, JSON.stringify(r.seated)],
      ['绕了一圈回来，记了用时', r.g?.finished > 30, `${r.g?.finished} 秒；${(r.passed ?? []).join(' ')}`],
      ['上了榜（用时少的在前）', r.board?.best?.ride === r.g?.finished, `best=${r.board?.best?.ride}`],
    ],
  },
  {
    id: 'ox', q: { s: 'village', t: '21' },
    play: async ({ k, G, until, wait }) => {
      const O = () => G['ride:ox'];
      await until(() => O()?.phase === 'ride', 30000);
      const seated = { pose: k.player.av.pose, y: k.player.av.root.position.y - k.player.pos.y, out: O().out };
      // 牵出棚以后往南走一段，吹笛
      const p0 = [O().x, O().z];
      k.cmd('goto', [43.8, 12.5]);
      await wait(7000);
      k.cmd('flute');
      await wait(1500);
      const flute = !!k.world.scene.getObjectByName('games:flute')?.visible;
      const moved = Math.hypot(O().x - p0[0], O().z - p0[1]);
      return { seated, moved, flute, g: JSON.parse(JSON.stringify(O())) };
    },
    after: async ({ k, G, until }) => {
      // 下来了：牛在原地吃草；人走远了，它自己回去，换回村里那一头
      const O = () => G['ride:ox'];
      const graze = O().mode;
      k.player.teleport(46, 60, 0); k.nav.snapBehind();
      const back = await until(() => !O().out, 30000);
      const fauna = k.life.fauna, vis = fauna.ox.parts.mesh.visible;
      return { graze, back, vis };
    },
    check: (r) => [
      ['牛（夜里卧在棚里）站起来、出了棚，人坐上去', r.seated?.pose === 'bench' && r.seated?.out && r.seated?.y > 0.6 && r.seated?.y < 1.1, JSON.stringify(r.seated)],
      ['骑着走了一段', r.moved > 3, `${r.moved?.toFixed(1)} 米`],
      ['吹笛：笛子横在嘴边', r.flute],
    ],
    checkAfter: (a) => [
      ['下来以后牛在原地吃草', a.graze === 'graze', a.graze],
      ['人走远了，牛自己回去换回村里那一头', a.back && a.vis, `回去了=${a.back} 村里那一头看得见=${a.vis}`],
    ],
  },
];

for (const G of GAMES) {
  if (only && !only.includes(G.id)) continue;
  const { page, ctx, logs } = await open(browser, { ...G.q, ui: '0' }, { w: 1280, h: 800 });
  await page.evaluate(() => document.querySelector('vite-error-overlay')?.remove());
  // 走过去：从几步外（骑的从它旁边几步外）
  const ok = await page.evaluate(async ([id, f0]) => {
    const k = window.__ks, a = k.acts[id];
    if (!a) return 'no act';
    for (let i = 0; i < 60 && !(a.on?.() ?? true); i++) await new Promise((r) => setTimeout(r, 250));
    if (!(a.on?.() ?? true)) return 'not on';
    const s = a.spot, W = window.__walk;
    let sx = f0?.[0] ?? s.x, sz = f0?.[1] ?? s.z;
    if (!f0) for (let i = 0; i < 24; i++) { const x = s.x + Math.cos(i * 0.9) * 3, z = s.z + Math.sin(i * 0.9) * 3; if (W.standable(x, z) != null) { sx = x; sz = z; break; } }
    k.player.teleport(sx, sz, 0); k.nav.snapBehind();
    k.enterAct(id);
    return 'ok';
  }, [G.id, G.from ?? null]);
  R.ok(`${G.id}：此刻有、备好了`, ok === 'ok', ok);
  if (ok !== 'ok') { await ctx.close(); continue; }
  let started = false;
  for (let i = 0; i < 120 && !started; i++) { await page.waitForTimeout(250); started = await page.evaluate((id) => window.__ks.act?.id === id, G.id); }
  R.ok(`${G.id}：走得到、开始`, started);
  if (!started) { await ctx.close(); continue; }
  if (shots) await page.screenshot({ path: join(d, `solo_${G.id}_0.png`) });
  const res = await RUN(page, G.play);
  if (res.error) R.ok(`${G.id}：玩的时候出错`, false, res.error.slice(0, 400));
  for (const [name, pass, note] of G.check(res)) R.ok(`${G.id}：${name}`, pass, note ?? '');
  if (shots) await page.screenshot({ path: join(d, `solo_${G.id}_1.png`) });
  await page.evaluate(() => { const k = window.__ks; if (k.act) k.cmd('done'); if (k.act) k.exitAct(); });
  await page.waitForTimeout(2600);
  const end = await page.evaluate(() => { const k = window.__ks, r = k.player.av.root; return { act: k.act?.id ?? null, pose: k.player.av.pose, locked: k.player.locked, parent: r.parent === k.world.scene, pose2: k.nav.inPose, rootY: r.position.y - k.player.pos.y }; });
  R.ok(`${G.id}：退出后站起来、能走`, !end.act && end.pose === 'stand' && !end.locked, `act=${end.act} 姿势=${end.pose} 锁着=${end.locked}`);
  R.ok(`${G.id}：身子落回地上、镜头回到身后`, end.parent && !end.pose2 && Math.abs(end.rootY) < 0.06, `挂在场景上=${end.parent} 机位=${end.pose2} 离地=${end.rootY.toFixed(2)}`);
  const moved = await page.evaluate(async () => {
    const k = window.__ks; let best = 0;
    for (const [x, y] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const p0 = k.player.pos.clone(); k.keyMove.set(x, y); await new Promise((r) => setTimeout(r, 800)); k.keyMove.set(0, 0); best = Math.max(best, k.player.pos.distanceTo(p0)); if (best > 0.4) break; }
    return best;
  });
  R.ok(`${G.id}：退出后往前走得动`, moved > 0.4, `${moved.toFixed(2)} 米`);
  if (G.after) {
    const a = await RUN(page, G.after);
    if (a.error) R.ok(`${G.id}：之后出错`, false, a.error.slice(0, 300));
    for (const [name, pass, note] of G.checkAfter(a)) R.ok(`${G.id}：${name}`, pass, note ?? '');
  }
  const errs = logs.filter(mine);
  R.ok(`${G.id}：这一路没有报错`, errs.length === 0, errs.slice(0, 3).join(' | '));
  await ctx.close();
}

const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
