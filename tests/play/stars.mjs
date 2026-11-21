// 观星、认北斗在浏览器里做一遍：夜里走到席边、铺席坐下、拖动看天、点一颗星认出它的星官、四象一宿一宿点亮、候星移转过去又回来、起身；
// 认北斗点齐七星、点北极星、说出斗柄所指。另外看几样：白天、雨天没有观星；星点只落在天上；晴夜星官连线平时不显。
// 用法：先起开发服务器，KS_URL=http://localhost:<端口>/world.html node tests/play/stars.mjs [--shots]
import { launch, Report } from './lib.mjs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.KS_URL ?? 'http://localhost:3801/world.html').replace(/\?.*$/, '');
const SHOTS = process.argv.includes('--shots');
const OUT = join(import.meta.dirname, '..', '..', 'shots', 'stars');
if (SHOTS) mkdirSync(OUT, { recursive: true });
const R = new Report();
const browser = await launch();

async function open(q, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: o.w ?? 1280, height: o.h ?? 760 }, deviceScaleFactor: 1, isMobile: !!o.mobile, hasTouch: !!o.mobile });
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push(String(e.message)));
  await page.goto(`${BASE}?${new URLSearchParams({ hud: '0', w: 'clear', ...q })}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  await page.waitForTimeout(600);
  return { page, ctx, logs };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(OUT, name + '.png') }); };
/** 星表里第 i 颗星此刻在画面上的哪里（不在画面里返回 null） */
const screenOf = (page, i) => ev(page, (i) => {
  const k = window.__ks, cam = k.world.camera, v = k.atmos.sky.dir(i).clone().multiplyScalar(1000).add(cam.position).project(cam);
  if (v.z > 1 || Math.abs(v.x) > 0.92 || Math.abs(v.y) > 0.92) return null;
  return { x: (v.x * 0.5 + 0.5) * k.world.size.x, y: (-v.y * 0.5 + 0.5) * k.world.size.y };
}, i);
const actState = (page) => ev(page, () => ({ id: window.__ks.act?.id ?? null, st: window.__ks.act?.state ?? {} }));
const waitFor = async (page, fn, ms = 8000, arg) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(page, fn, arg)) return true; await page.waitForTimeout(150); } return false; };

// —— 观星 ——
{
  const { page, ctx, logs } = await open({ s: 'bridge', t: '22.5', season: 'summer' });
  // 白天没有这件事；夜里有
  const onNight = await ev(page, () => window.__ks.things.find((t) => t.id === 'stars')?.on?.() ?? false);
  R.ok('晴夜：观星这件事在', onNight);
  // 平时星官连线不显
  R.ok('平时：星官连线不显，星点在画', await ev(page, () => { const s = window.__ks.atmos.sky; return !s.lines.mesh.visible && s.stars.mesh.visible; }));
  // 从桥头走过去（不是直接放过去）
  await ev(page, () => window.__ks.enterAct('stars'));
  const started = await waitFor(page, () => window.__ks.act?.id === 'stars', 30000);
  R.ok('走到席边，开始观星', started);
  await page.waitForTimeout(1200);
  await shot(page, '01-lay');
  const ready = await waitFor(page, () => (window.__ks.act?.state?.choices ?? []).some((c) => c.id === 'xiang'), 9000);
  R.ok('铺席、坐下，镜头抬起来，出了「四象 / 候星移」', ready);
  await page.waitForTimeout(3500);
  const pose = await ev(page, () => { const k = window.__ks, d = k.world.camera.getWorldDirection(k.world.camera.position.clone()); return { pitch: Math.asin(d.y) * 57.3, sit: k.player.av.pose, lines: k.atmos.sky.lines.mesh.visible }; });
  R.ok('仰着看天（镜头仰角二十度以上），人仰卧在席上，连线淡淡地显出来', pose.pitch > 20 && pose.sit === 'lie' && pose.lines, JSON.stringify(pose));
  await shot(page, '02-look');
  // 拖动：看四方
  const yaw0 = await ev(page, () => { const d = window.__ks.world.camera.getWorldDirection(window.__ks.world.camera.position.clone()); return Math.atan2(d.x, d.z); });
  await page.mouse.move(640, 380); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(640 + i * 30, 380 + i * 4); await page.mouse.up();
  await page.waitForTimeout(900);
  const yaw1 = await ev(page, () => { const d = window.__ks.world.camera.getWorldDirection(window.__ks.world.camera.position.clone()); return Math.atan2(d.x, d.z); });
  R.ok('拖动画面，天跟着转', Math.abs(yaw1 - yaw0) > 0.15, `${yaw0.toFixed(2)} → ${yaw1.toFixed(2)}`);
  // 点一颗在星官里的亮星
  const target = await ev(page, () => {
    const k = window.__ks, sky = k.atmos.sky, cam = k.world.camera;
    for (let i = 0; i < 300; i++) {
      const as = sky.data.byStar.get(i); if (!as?.length) continue;
      const w = sky.dir(i); if (w.y < 0.3) continue;
      const v = w.clone().multiplyScalar(1000).add(cam.position).project(cam);
      if (v.z < 1 && Math.abs(v.x) < 0.6 && Math.abs(v.y) < 0.6) return { i, name: sky.data.asterisms[as.find((a) => sky.data.asterisms[a].segs.includes(i)) ?? as[0]].name, x: (v.x * 0.5 + 0.5) * k.world.size.x, y: (-v.y * 0.5 + 0.5) * k.world.size.y };
    }
    return null;
  });
  if (target) {
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(1600);
    const s = await actState(page);
    R.ok(`点一颗星（星表第 ${target.i} 颗），认出它的星官`, s.st.title === target.name, `${s.st.title} / ${target.name}；${String(s.st.hint ?? '').slice(0, 30)}`);
    R.ok('那个星官的名字写在天上', await ev(page, (n) => window.__ks.atmos.sky.labels.has('sel'), target.name));
    await shot(page, '03-tap');
    // 点空处：收起
    await page.mouse.click(30, 30); await page.waitForTimeout(500);
  } else R.ok('画面里有可点的亮星', false);
  // 四象：苍龙七宿
  await ev(page, () => window.__ks.cmd('xiang')); await page.waitForTimeout(300);
  await ev(page, () => window.__ks.cmd('x:long'));
  await page.waitForTimeout(2600 * 3);
  const mid = await actState(page);
  R.ok('四象：一宿一宿点亮（计数在走）', mid.st.title === '东方苍龙' && mid.st.count >= 3, `${mid.st.title} ${mid.st.count}/${mid.st.total}：${mid.st.hint}`);
  await shot(page, '04-tour');
  const done = await waitFor(page, () => window.__ks.act?.state?.title === '东方苍龙' && /东宫苍龙/.test(String(window.__ks.act?.state?.text ?? '')), 16000);
  R.ok('七宿点完：出《天官书》的话与七宿在不在天上', done);
  await shot(page, '05-tour-end');
  // 候星移
  await ev(page, () => window.__ks.cmd('back')); await page.waitForTimeout(300);
  const s0 = await ev(page, () => window.__ks.atmos.sky.star(0).toArray());
  await ev(page, () => window.__ks.cmd('shift'));
  await page.waitForTimeout(6000);
  await shot(page, '06-shift');
  const shifted = await waitFor(page, () => window.__ks.act?.state?.title === '候星移' && (window.__ks.act?.state?.choices ?? []).some((c) => c.id === 'unshift'), 12000);
  const s1 = await ev(page, () => ({ d: window.__ks.atmos.sky.star(0).toArray(), sh: window.__ks.atmos.starShift }));
  const moved = Math.acos(Math.min(1, s0[0] * s1.d[0] + s0[1] * s1.d[1] + s0[2] * s1.d[2])) * 57.3;
  R.ok('候星移：六个时辰转过去，北斗绕北极转了一大段', shifted && s1.sh > 5.9 && moved > 25, `多拨 ${s1.sh.toFixed(2)} 个钟头，天枢挪了 ${moved.toFixed(0)}°`);
  await ev(page, () => window.__ks.cmd('unshift'));
  const back = await waitFor(page, () => window.__ks.atmos.starShift < 0.01, 4000);
  R.ok('回到此刻', back);
  // 流星
  const met = await ev(page, () => window.__ks.atmos.sky.meteor());
  await page.waitForTimeout(250);
  R.ok('划一颗流星（连线那一层亮着）', met && await ev(page, () => window.__ks.atmos.sky.lines.meteors));
  // 起身
  await ev(page, () => window.__ks.cmd('done'));
  await page.waitForTimeout(2200);
  const after = await ev(page, () => { const k = window.__ks, m = k.world.scene.children.find((o) => o.type === 'Group' && o.children.length === 2 && o.children[0].type === 'Group'); return { act: k.act?.id ?? null, locked: k.player.locked, shift: k.atmos.starShift, lines: k.atmos.sky.labels.mesh.visible }; });
  R.ok('起身：人能走，天还原，名字收起', !after.act && !after.locked && after.shift === 0 && !after.lines, JSON.stringify(after));
  R.ok('没有报错', logs.length === 0, logs.slice(0, 3).join(' | '));
  await ctx.close();
}

// —— 认北斗 ——
{
  const { page, ctx, logs } = await open({ s: 'bridge', t: '21.5', season: 'spring', act: 'dipper' });
  const ok = await waitFor(page, () => window.__ks.act?.id === 'dipper', 8000);
  R.ok('认北斗：开始', ok);
  await page.waitForTimeout(2500);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const p = await ev(page, (i) => { const k = window.__ks, cam = k.world.camera, v = k.atmos.sky.star(i).clone().multiplyScalar(1000).add(cam.position).project(cam); return v.z < 1 && Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98 ? { x: (v.x * 0.5 + 0.5) * k.world.size.x, y: (-v.y * 0.5 + 0.5) * k.world.size.y } : null; }, i);
    if (p) { await page.mouse.click(p.x, p.y); n++; await page.waitForTimeout(250); }
  }
  const st1 = await actState(page);
  R.ok('点齐七星，勺子描出来、斗口引一道虚线', n === 7 && /北极星/.test(String(st1.st.hint)), `${n} 颗；${st1.st.hint}`);
  await page.waitForTimeout(900);
  await shot(page, '07-dipper');
  const pp = await ev(page, () => { const k = window.__ks, cam = k.world.camera, v = k.atmos.sky.star(7).clone().multiplyScalar(1000).add(cam.position).project(cam); return v.z < 1 && Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98 ? { x: (v.x * 0.5 + 0.5) * k.world.size.x, y: (-v.y * 0.5 + 0.5) * k.world.size.y } : null; });
  if (pp) { await page.mouse.click(pp.x, pp.y); await page.waitForTimeout(500); }
  const st2 = await actState(page);
  R.ok('点北极星，说出斗柄指向（春夜朝东）', /斗柄指东/.test(String(st2.st.text)), String(st2.st.text).split('\n')[0]);
  await shot(page, '08-dipper-done');
  R.ok('认北斗没有报错', logs.length === 0, logs.slice(0, 3).join(' | '));
  await ctx.close();
}

// —— 雨夜、白天：没有观星；星点不画 ——
{
  const { page, ctx } = await open({ s: 'bridge', t: '22', season: 'autumn', w: 'rain' });
  await page.waitForTimeout(1500);
  R.ok('雨夜：没有观星，星点不画', await ev(page, () => !(window.__ks.things.find((t) => t.id === 'stars')?.on?.()) && !window.__ks.atmos.sky.stars.mesh.visible));
  await ctx.close();
  const d = await open({ s: 'bridge', t: '10', season: 'autumn' });
  R.ok('白天：没有观星，星点不画', await ev(d.page, () => !(window.__ks.things.find((t) => t.id === 'stars')?.on?.()) && !window.__ks.atmos.sky.stars.mesh.visible));
  await d.ctx.close();
}

await browser.close();
process.exit(R.done() ? 1 : 0);
