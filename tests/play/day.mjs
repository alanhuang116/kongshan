// 村里人的一整天：把一天（四季、晴雨）按「画里一个钟头一分钟」快进着走一遍，人人当作有人看着（换事一律走过去），看：
//   脚本有没有出错；有没有人走着走着进了屋舍、器物里（坐着贴着凳、桌的不算）、进了深水里；
//   有没有人卡住（在走路却半天挪不动）；两个人有没有长时间叠在一起（穿模）；名册里有、代码里却没有的事；截几张图。
// 用法：KS_URL=http://localhost:3816/world.html node tests/play/day.mjs [--season=spring,summer,autumn,winter] [--wet=0,1] [--from=4] [--hours=24] [--no-shots]
// 截图在 shots/day/（台子 ink.html?m=lifeAll：真的地、真的屋舍，只是没有行者与界面）
import { launch, Report, dir } from './lib.mjs';
import { join } from 'node:path';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const origin = new URL(process.env.KS_URL ?? 'http://localhost:3801/').origin;
const seasons = arg('season', 'spring,summer,autumn,winter').split(','), wets = arg('wet', '0,1').split(',').map(Number);
const from = +arg('from', 4), hours = +arg('hours', 24), RATE = 1 / 60, shots = !process.argv.includes('--no-shots');
const out = dir('day');

/** 截图：几点、对着哪里（台子的机位：tx ty tz 看的地方，d 远近，az el 方位、俯角） */
const VIEWS = {
  // az 是机位在看的那一点的哪一边：0 在南（屋门朝南的人家从门前看），180 在北
  spring: [[9.3, 'village', { tx: 97, ty: 8, tz: 6, d: 32, az: 20, el: 24 }], [10.5, 'fields', { tx: -27, ty: 4, tz: 92, d: 34, az: 30, el: 20 }], [14.6, 'aunt', { tx: 51.6, ty: 8.6, tz: 10.6, d: 11, az: 12, el: 16 }], [15.0, 'teashed', { tx: 32.5, ty: 8.2, tz: 24.5, d: 13, az: 30, el: 18 }], [19.4, 'story', { tx: 91.4, ty: 7.8, tz: 18.6, d: 12, az: 12, el: 18 }]],
  summer: [[9.0, 'reap', { tx: -6, ty: 4.6, tz: 63, d: 16, az: 20, el: 22 }], [12.2, 'lunch', { tx: -12.5, ty: 4.6, tz: 62, d: 10, az: 60, el: 18 }], [20.4, 'story', { tx: 91.4, ty: 7.8, tz: 18.6, d: 12, az: 12, el: 18 }]],
  autumn: [[9.6, 'potter', { tx: 135.8, ty: 6.6, tz: 22.3, d: 9, az: 170, el: 20 }], [10.0, 'yard', { tx: 61, ty: 8.5, tz: 5, d: 18, az: 10, el: 26 }]],
  winter: [[10.5, 'afront', { tx: 51, ty: 8.6, tz: 10, d: 14, az: 8, el: 18 }], [12.5, 'village', { tx: 97, ty: 8, tz: 6, d: 34, az: 20, el: 24 }]],
  wet: [[10.0, 'eaves', { tx: 50.5, ty: 8.6, tz: 9.2, d: 10, az: 5, el: 14 }], [10.3, 'loom', { tx: 119.3, ty: 8.4, tz: -8.0, d: 9, az: 340, el: 16 }], [16.0, 'basket', { tx: 36.4, ty: 9, tz: -4.3, d: 8, az: 5, el: 14 }]],
};

const R = new Report(), browser = await launch();
for (const season of seasons) for (const wet of wets) {
  const w = wet ? (season === 'winter' ? 'snow' : 'rain') : 'clear';
  const tag = `${season}${wet ? '·' + (season === 'winter' ? '雪' : '雨') : ''}`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /没有脚本|名册里没有|出错/.test(m.text()))) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${String(e.stack ?? e.message).slice(0, 500)}`));
  await page.goto(`${origin}/ink.html?m=lifeAll&far=0&t=${from}&season=${season}&w=${w}&hud=0`, { waitUntil: 'load' });
  const ok = await page.waitForFunction(() => window.__ready === true && window.__life, null, { timeout: 90000 }).then(() => true, () => false);
  if (!ok) { R.ok(`${tag}：人物装上了`, false, logs.slice(0, 2).join(' | ') || '台子没等到 window.__life'); await ctx.close(); continue; }
  // 在页面里准备好：一步一步地推、每步查一遍
  await page.evaluate(async ({ from, wet, season }) => {
    const L = window.__life, T = window.__lab.THREE, PM = await import('/src/world/life/person.ts'), walk = await import('/src/world/walk.ts');
    L.manual = true; L.watch(true);
    // 本来就要进去的不算：村塾（前檐敞着，孩子与先生进去坐）、渡口的渔船（渔父上船）、碓房（舂米人从东头贴着北墙进去）、
    // 坐处（陶车边的凳、篾匠的凳、石凳、酒家与茶亭的凳、木工凳：坐下前最后半步本就挨着它）
    const solids = (window.__build?.group.userData.solids ?? []).filter((s) => !s.walk && !/檐口|桥面|台$/.test(s.id) && !/^村塾$|渔船|^碓房$|陶车|篾凳|小板凳|石凳|桌凳|板凳|木工凳|木马|^井台$/.test(s.id));
    const site = await import('/src/world/site.ts'), PK = site.SITE.plank;
    const inside = (s, x, z) => {
      const dx = x - s.x, dz = z - s.z;
      if (s.kind === 'disc') return s.r - Math.hypot(dx, dz);
      const c = Math.cos(s.yaw ?? 0), n = Math.sin(s.yaw ?? 0), lx = dx * c - dz * n, lz = dx * n + dz * c;
      return Math.min(s.w / 2 - Math.abs(lx), s.d / 2 - Math.abs(lz));
    };
    const night = (h) => { const k = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a))); return h < 12 ? 1 - k(4.8, 6.2, h) : k(18.3, 19.8, h); };
    const S = (window.__day = { hour: from, t: 100, steps: 0, ms: 0, slow: 0, errors: [], walls: {}, wet: {}, stuck: {}, overlap: {}, acts: {}, track: new Map(), pair: new Map(), rain: wet && season !== 'winter' ? 0.9 : 0, snow: wet && season === 'winter' ? 0.9 : 0 });
    const cam = window.__lab.world.camera;
    S.step = (n) => {
      const all = PM.Person.all;
      for (let i = 0; i < n; i++) {
        S.hour = (S.hour + 0.1 * (1 / 60)) % 24; S.t += 0.1; S.steps++;
        const a = performance.now();
        try { L.life.update(0.1, S.t, { hour: S.hour, night: night(S.hour), rain: S.rain, snow: S.snow, player: L.player, camera: cam }); }
        catch (e) { if (S.errors.length < 10) S.errors.push(`${S.hour.toFixed(2)}点 ${String(e)} ${String(e.stack).split('\n').slice(1, 4).join(' / ')}`); }
        const d = performance.now() - a; S.ms += d; if (d > 4) S.slow++;
        if (S.steps % 3) continue;
        for (const p of all) {
          if (!p.here) { S.track.delete(p); continue; }
          if (p.act) S.acts[`${p.id}:${p.act}`] = (S.acts[`${p.id}:${p.act}`] ?? 0) + 1;
          const x = p.pos.x, z = p.pos.z;
          // 赶路时进了屋舍器物里（坐着、蹲着的不算；到了地方最后进屋、绕到凳前那几步也不算：那是有意走进去的）
          if (p.walking && p.trip && !p.seated) for (const s of solids) {
            const dd = inside(s, x, z);
            if (dd > 0.18) { const k = `${p.id} ∈ ${s.id}`, r = (S.walls[k] ??= { n: 0, h: S.hour, deep: 0, at: '' }); r.n++; if (dd > r.deep) { r.deep = +dd.toFixed(2); r.at = `${x.toFixed(1)},${z.toFixed(1)} ${p.act}`; } }
          }
          // 深水里（渔父在船上、牧童骑在牛背上不算）
          // （修着的木桥上铺了板的那一半不算：木匠在上面干活）
          if (!p.seated && p.lift < 0.05 && walk.groundAt(x, z) == null && Math.hypot(x - PK.x, z - PK.z) > 5) { const r = (S.wet[p.id] ??= { n: 0, h: S.hour, at: '' }); r.n++; r.at = `${x.toFixed(1)},${z.toFixed(1)} ${p.act}`; }
          // 卡住：在走路，四十秒里挪不出半米
          let tr = S.track.get(p);
          if (!tr || !p.walking) { tr = { x, z, t: S.t }; S.track.set(p, tr); }
          else if (Math.hypot(x - tr.x, z - tr.z) > 0.5) { tr.x = x; tr.z = z; tr.t = S.t; }
          else if (S.t - tr.t > 40 && !p.talkTo) { const r = (S.stuck[p.id] ??= { n: 0, h: S.hour, at: '' }); r.n++; r.at = `${x.toFixed(1)},${z.toFixed(1)} ${p.act}`; tr.t = S.t; }
        }
        // 两个人叠在一起（都站着的、相距不到 0.3 米，超过二十秒）
        for (let i2 = 0; i2 < all.length; i2++) for (let j = i2 + 1; j < all.length; j++) {
          const p = all[i2], q = all[j];
          if (!p.here || !q.here) continue;
          const key = p.id + '|' + q.id, close = Math.hypot(p.pos.x - q.pos.x, p.pos.z - q.pos.z) < 0.3 && !(p.seated && q.seated);
          if (!close) { S.pair.delete(key); continue; }
          const t0 = S.pair.get(key) ?? S.t; S.pair.set(key, t0);
          if (S.t - t0 > 20) { const r = (S.overlap[key] ??= { n: 0, h: S.hour, at: '' }); r.n++; r.at = `${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)} ${p.act}/${q.act}`; S.pair.set(key, S.t); }
        }
      }
      return S.hour;
    };
  }, { from, wet, season });

  // 一步 0.1 秒、画里一个钟头一分钟：一个钟头是 600 步。各张图在第几步截
  const total = Math.round(hours * 600);
  const views = (shots ? (wet ? VIEWS.wet : VIEWS[season] ?? []) : []).map(([vh, name, v]) => ({ at: Math.round(((vh - from + 24) % 24) * 600), vh, name, v })).filter((x) => x.at < total).sort((a, b) => a.at - b.at);
  const t0 = Date.now();
  let done = 0;
  const stepTo = async (n) => { while (done < n) { const k = Math.min(2400, n - done); await page.evaluate((k) => window.__day.step(k), k); done += k; } };
  for (const { at, vh, name, v } of views) {
    await stepTo(at);
    await page.evaluate(({ vh, v }) => { const L = window.__lab; Object.assign(L.st, v); L.atmos.setHour(vh, true); }, { vh, v });
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(out, `${season}${wet ? '-wet' : ''}-${name}.png`) });
  }
  await stepTo(total);
  const S = await page.evaluate(() => { const S = window.__day; return { steps: S.steps, ms: S.ms, slow: S.slow, errors: S.errors, walls: S.walls, wet: S.wet, stuck: S.stuck, overlap: S.overlap, acts: S.acts, shots: window.__life.shots }; });
  console.log(`\n— ${tag}（${S.steps} 步，${((Date.now() - t0) / 1000).toFixed(0)} 秒；每步平均 ${(S.ms / S.steps).toFixed(2)} 毫秒，超过 4 毫秒的 ${S.slow} 步）`);
  const list = (o) => Object.entries(o).map(([k, r]) => `${k}（${r.n} 次，${r.h.toFixed(1)} 点起${r.deep ? '，最深 ' + r.deep : ''}，${r.at}）`);
  R.ok(`${tag}：脚本没有出错`, S.errors.length === 0, S.errors.slice(0, 3).join(' | '));
  const walls = list(S.walls);
  R.ok(`${tag}：走路没有穿进屋舍器物`, walls.length === 0, walls.slice(0, 4).join('；'));
  const wetL = list(S.wet);
  R.ok(`${tag}：没有人走进深水`, wetL.length === 0, wetL.slice(0, 4).join('；'));
  const stuck = list(S.stuck);
  R.ok(`${tag}：没有人卡住`, stuck.length === 0, stuck.slice(0, 4).join('；'));
  const ov = list(S.overlap);
  R.ok(`${tag}：没有两个人长时间叠在一起`, ov.length === 0, ov.slice(0, 4).join('；'));
  const errs = logs.filter((l) => !/404|Failed to load resource|GPU stall/.test(l));
  R.ok(`${tag}：页面没有报错`, errs.length === 0, errs.slice(0, 2).join(' | '));
  // 这一天里各人都做了哪些事（按做的时间多少排）
  const byId = {};
  for (const [k, n] of Object.entries(S.acts)) { const [id, act] = k.split(':'); (byId[id] ??= []).push([act, n]); }
  console.log('  做过的事：' + Object.entries(byId).map(([id, a]) => `${id}(${a.sort((x, y) => y[1] - x[1]).map(([x]) => x).join('/')})`).join(' '));
  console.log('  出过的声：' + Object.entries(S.shots).map(([k, n]) => `${k}×${n}`).join(' '));
  await ctx.close();
}
const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
