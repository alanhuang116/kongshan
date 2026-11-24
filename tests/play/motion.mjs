// 小人的动态：按键方向与三档快慢（键盘走、摇杆推到头快走、Shift 跑）、步态（步幅、步频、脚下滑不滑、身子起伏、腾空、落脚在哪）、
// 起停（走与跑）、转身（掉头、跑着拐弯向内倾）、上下坡与台阶（台基、桥、亭、汀步；走着与跑着）、撞篱笆、姿势、镜头、闲时的小动作、
// 仰卧（躺在席上头胯脚贴着席面不穿、看天、躺下起身三回不漂移、起身后能走）；走、快走、跑的时候腿不从衣裳里穿出来、手不插进衣身。
// 用法：node tests/play/motion.mjs [--shots]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, open, dir, shot, Report } from './lib.mjs';

const SHOTS = process.argv.includes('--shots');
const probe = readFileSync(join(import.meta.dirname, 'probe.js'), 'utf8');
const clipJs = readFileSync(join(import.meta.dirname, 'clip.js'), 'utf8');
const browser = await launch();
const { page, logs } = await open(browser, { s: 'yard', ui: '0' });
await page.evaluate(probe);
await page.evaluate(clipJs);
const R = new Report(), d = dir('motion');
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
// 量步态时先把闲时的小动作关掉（走着回头看一眼会让「头稳」量不准）；第九节再单独量它
await ev(() => { window.__ks.player.idle.on = false; });
const tp = (x, z, yaw, zone = 'ground') => ev(([x, z, yaw, zone]) => { const k = window.__ks; if (k.act) k.exitAct(); k.setRun(false); k.stick.set(0, 0); k.player.teleport(x, z, yaw, zone); k.nav.snapBehind(); }, [x, z, yaw, zone]);
// 井田当中那条东西向的田埂路：九十米长、平（跑的几项在这里量）
const FIELD = { z: 77, x0: -68, x1: 20 };
const pos = () => ev(() => { const p = window.__ks.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, speed: p.speed }; });
const rec = async (ms, fn) => { await ev(() => window.__probe.start()); if (fn) await fn(); if (ms) await wait(ms); return ev(() => window.__probe.stop()); };
const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const f2 = (v) => (v == null ? '—' : v.toFixed(2)), f3 = (v) => (v == null ? '—' : v.toFixed(3));

const consts = await ev(() => ({ h: window.__ks.player.av.height, feet: !!window.__ks.player.av.feet, cls: window.__ks.player.av.constructor.name }));
console.log(`小人：${consts.cls}，身高 ${consts.h}，有脚 ${consts.feet}`);

// —— 一、按键方向（相对镜头） ——
console.log('\n一、按键方向');
for (const [key, name, want] of [['w', '前', [0, -1]], ['s', '后', [0, 1]], ['a', '左', [-1, 0]], ['d', '右', [1, 0]]]) {
  await tp(1.2, 13.2, Math.PI); await wait(250);
  const a = await pos();
  await page.keyboard.down(key); await wait(1100); await page.keyboard.up(key); await wait(500);
  const b = await pos(), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  R.ok(`按 ${key.toUpperCase()} 往${name}走`, l > 1.0 && (dx / l) * want[0] + (dz / l) * want[1] > 0.93, `走了 ${f2(l)} 米，方向 (${f2(dx / l)}, ${f2(dz / l)})`);
}
// 三档快慢：键盘平时是从容地走；按住 Shift 跑；点一下 Shift 锁住跑、再点放开；摇杆推到头是快走（一路小跑）
const forward = async (ms, keys = ['w']) => {
  await tp(-9, 14.7, Math.PI / 2); await wait(250);
  await ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = -Math.PI / 2; });
  for (const kk of keys) await page.keyboard.down(kk);
  await wait(ms);
  const sp = (await pos()).speed;
  for (const kk of [...keys].reverse()) await page.keyboard.up(kk);
  await wait(400);
  return sp;
};
{
  const sp = await forward(1600);
  R.ok('键盘走：从容地走', sp > 1.15 && sp < 1.6, `速度 ${f2(sp)} 米/秒`);
}
{
  // 挑着担子（农事设 player.pace = 0.72）：三档都打折，散步约每秒一米
  await ev(() => { window.__ks.player.pace = 0.72; });
  const sp = await forward(1600);
  await ev(() => { window.__ks.player.pace = 1; });
  R.ok('挑担子（pace 0.72）：散步慢到每秒一米上下', sp > 0.9 && sp < 1.1, `速度 ${f2(sp)} 米/秒`);
}
{
  const sp = await forward(2000, ['Shift', 'w']);
  R.ok('按住 Shift 是跑', sp > 3.9, `速度 ${f2(sp)} 米/秒`);
}
{
  // 点一下 Shift（不到四分之一秒、不和别的键一起）：锁住跑；再点一下放开
  await tp(-9, 14.7, Math.PI / 2); await wait(250);
  await ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = -Math.PI / 2; });
  await page.keyboard.down('Shift'); await wait(80); await page.keyboard.up('Shift'); await wait(100);
  const locked = await ev(() => window.__ks.player.run);
  await page.keyboard.down('w'); await wait(2000);
  const sp = (await pos()).speed;
  await page.keyboard.down('Shift'); await wait(80); await page.keyboard.up('Shift'); await wait(1500);
  const sp2 = (await pos()).speed;
  await page.keyboard.up('w'); await wait(400);
  R.ok('点一下 Shift 锁住跑，再点放开', locked && sp > 3.9 && sp2 < 1.6, `锁住 ${locked}，跑 ${f2(sp)}，放开后 ${f2(sp2)} 米/秒`);
}
{
  await tp(-9, 14.7, Math.PI / 2); await wait(250);
  await ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = -Math.PI / 2; k.stick.set(0, 1); });
  await wait(1800);
  const sp = (await pos()).speed;
  await ev(() => window.__ks.stick.set(0, 0)); await wait(400);
  R.ok('摇杆推到头是快走', sp > 2.6 && sp < 3.3, `速度 ${f2(sp)} 米/秒`);
}

// —— 二、步态 ——
// mode：walk 点地面自己走过去（从容地走）；fast 摇杆推到头（快走，一路小跑）；run Shift 跑（在田埂上跑）
async function gait(name, mode) {
  const fast = mode !== 'walk', run = mode === 'run';
  if (run) {
    await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(300);
    await ev((x1) => { const k = window.__ks; k.setRun(true); k.player.goTo(x1, 77); }, FIELD.x1);
    await wait(2200);                                 // 起跑要一秒多，等跑匀了再量
  } else if (fast) {
    await tp(-10, 14.7, Math.PI / 2); await wait(300);
    await ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = -Math.PI / 2; k.stick.set(0, 1); });
    await wait(1500);
  } else {
    await tp(-10, 14.7, Math.PI / 2); await wait(300);
    await ev(() => window.__ks.player.goTo(11, 14.7));
    await wait(1500);                                 // 等走匀了再量
  }
  const { rows, steps } = await rec(run ? 3200 : 4200);
  await ev(() => { const k = window.__ks; k.setRun(false); k.stick.set(0, 0); k.player.stop(); });
  await wait(run ? 1200 : 300);
  const T = (rows.at(-1).t - rows[0].t) / 1000, dist = Math.hypot(rows.at(-1).pos[0] - rows[0].pos[0], rows.at(-1).pos[2] - rows[0].pos[2]), v = dist / T;
  const cad = steps.length > 1 ? (steps.length - 1) / ((steps.at(-1).t - steps[0].t) / 1000) : 0;
  const stepLen = cad ? v / cad : 0;
  console.log(`  ${name}：速度 ${f2(v)} 米/秒，步频 ${f2(cad)} 步/秒，步幅 ${f2(stepLen)} 米（身高的 ${f2(stepLen / consts.h)}），左右交替 ${steps.map((s) => s.f).join('')}`);
  R.ok(`${name}：速度稳`, sd(rows.map((r) => r.speed)) < 0.08 * v, `抖动 ${f3(sd(rows.map((r) => r.speed)))}`);
  if (run) R.ok(`${name}：是真的快（四米以上每秒）`, v > 4.0, `${f2(v)} 米/秒`);
  R.ok(`${name}：步幅合身量`, stepLen / consts.h > (run ? 0.62 : fast ? 0.42 : 0.36) && stepLen / consts.h < (run ? 1.0 : fast ? 0.78 : 0.52), `步幅/身高 ${f2(stepLen / consts.h)}`);
  R.ok(`${name}：步频合常情`, cad > (run ? 2.8 : fast ? 2.3 : 1.55) && cad < (run ? 3.8 : fast ? 3.4 : 2.3), `${f2(cad)} 步/秒`);
  R.ok(`${name}：左右脚交替`, steps.length > 4 && steps.every((s, i) => i === 0 || s.f !== steps[i - 1].f));
  if (rows[0].fl) {
    // 脚：离地高度以这一段里的最低处为地面；着地（高出不到 1.2 厘米）时在地上滑了多快
    const res = {};
    // 着地占比、单双支撑按整步量：从头一回左脚落地到最后一回左脚落地（窗口两头的半步会让左右看着不一样）
    const tL = steps.filter((s) => s.f === 'L').map((s) => s.t), whole0 = tL.length >= 3 ? rows.filter((r) => r.t >= tL[0] && r.t < tL.at(-1)) : rows;
    const whole = whole0.length > 30 ? whole0 : rows;
    for (const key of ['fl', 'fr']) {
      const ys = rows.map((r) => r[key][1]), y0 = Math.min(...ys);
      let slide = 0, n = 0, worst = 0, planted = 0, liftMax = 0;
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1][key], b = rows[i][key], dt = (rows[i].t - rows[i - 1].t) / 1000;
        liftMax = Math.max(liftMax, b[1] - y0);
        // 撑着地的这一程里，脚上总有一处是踩死不动的：先是整只脚，脚跟抬起后是前掌。取两处里动得少的那一处
        const ck2 = key === 'fl' ? 'cl' : 'cr', bk = key === 'fl' ? 'bl' : 'br';
        const on = rows[i][ck2] == null ? a[1] - y0 < 0.012 && b[1] - y0 < 0.012 : rows[i - 1][ck2] && rows[i][ck2] && (i < 2 || rows[i - 2][ck2]) && (i + 1 >= rows.length || rows[i + 1][ck2]);
        if (on && dt > 0) { const sb = rows[i][bk] ? Math.hypot(rows[i][bk][0] - rows[i - 1][bk][0], rows[i][bk][2] - rows[i - 1][bk][2]) / dt : 1e9; const s = Math.min(Math.hypot(b[0] - a[0], b[2] - a[2]) / dt, sb); slide += s; n++; worst = Math.max(worst, s); planted++; }
      }
      const ck = key === 'fl' ? 'cl' : 'cr';
      res[key] = { slide: n ? slide / n : 0, worst, duty: rows[0][ck] == null ? planted / (rows.length - 1) : whole.filter((r) => r[ck]).length / whole.length, lift: liftMax };
    }
    const both = rows[0].cl == null ? 0 : whole.filter((r) => r.cl && r.cr).length / whole.length, none = rows[0].cl == null ? 0 : whole.filter((r) => !r.cl && !r.cr).length / whole.length;
    console.log(`  ${name}：着地时脚的滑动 左 ${f3(res.fl.slide)} 右 ${f3(res.fr.slide)} 米/秒（最快 ${f2(Math.max(res.fl.worst, res.fr.worst))}），着地占比 左 ${f2(res.fl.duty)} 右 ${f2(res.fr.duty)}，双脚同时着地 ${f2(both)}、同时离地 ${f2(none)}，抬脚最高 ${f2(Math.max(res.fl.lift, res.fr.lift))} 米`);
    R.ok(`${name}：脚踩住不滑`, Math.max(res.fl.slide, res.fr.slide) < 0.06 * v + 0.02, `着地时平均滑 ${f3(Math.max(res.fl.slide, res.fr.slide))} 米/秒（走速的 ${f2(Math.max(res.fl.slide, res.fr.slide) / v * 100)}%）`);
    R.ok(fast ? `${name}：是跑（有两脚都离地的一瞬）` : `${name}：是走（总有一只脚在地上，换脚时两脚都在）`, fast ? none > (run ? 0.15 : 0.02) && res.fl.duty < (run ? 0.42 : 0.5) && both < 0.02 : both > 0.05 && none === 0 && res.fl.duty > 0.5 && res.fl.duty < 0.75 && Math.abs(res.fl.duty - res.fr.duty) < 0.06, `着地占比 左 ${f2(res.fl.duty)} 右 ${f2(res.fr.duty)}，双支撑 ${f2(both)}，腾空 ${f2(none)}`);
    // （跑：蹬地后脚跟踢向身后，脚跟抬得高些）
    R.ok(`${name}：脚抬得起来`, Math.max(res.fl.lift, res.fr.lift) > 0.03 && Math.max(res.fl.lift, res.fr.lift) < (run ? 0.45 : 0.3), `最高 ${f2(Math.max(res.fl.lift, res.fr.lift))} 米`);
    if (run) {
      // 落脚在哪：每次着地那一刻，脚在胯前多远（沿着走的方向）——跑的人脚落在身子下方附近，不是远远伸出去够地
      const land = [];
      for (let i = 1; i < rows.length; i++) for (const [ck, key] of [['cl', 'fl'], ['cr', 'fr']]) {
        if (rows[i][ck] && !rows[i - 1][ck]) land.push(rows[i][key][0] - rows[i].hips[0]);
      }
      const lm = mean(land);
      console.log(`  ${name}：着地时脚在胯前 ${land.map(f2).join(' ')} 米`);
      R.ok(`${name}：落脚在身子下方附近（不远伸）`, land.length >= 4 && lm > 0.05 && lm < 0.42, `平均 ${f2(lm)} 米`);
    }
  }
  // 身子的起伏：胯的高度一步一起落；头别晃得太厉害
  const hy = rows.map((r) => r.hips[1] - r.pos[1]), hd = rows.map((r) => r.head[1] - r.pos[1]);
  const bob = Math.max(...hy) - Math.min(...hy), hbob = Math.max(...hd) - Math.min(...hd);
  // 左右晃：头偏离行进直线多少（这一段沿 x 走，看 z）
  const sway = Math.max(...rows.map((r) => r.head[2] - r.pos[2])) - Math.min(...rows.map((r) => r.head[2] - r.pos[2]));
  console.log(`  ${name}：胯起伏 ${f3(bob)} 米，头起伏 ${f3(hbob)} 米，头左右晃 ${f3(sway)} 米`);
  R.ok(`${name}：身子有起伏而不颠`, bob > 0.008 && bob < (fast ? 0.12 : 0.075), `胯 ${f3(bob)} 米`);
  R.ok(`${name}：头稳`, hbob < (fast ? 0.11 : 0.07) && sway < 0.09, `上下 ${f3(hbob)} 左右 ${f3(sway)}`);
  // 摆臂：两手一前一后（跑：两臂都屈肘大摆）
  const zl = rows.map((r) => r.hl[0] - r.pos[0]), zr = rows.map((r) => r.hr[0] - r.pos[0]);
  const swL = Math.max(...zl) - Math.min(...zl), swR = Math.max(...zr) - Math.min(...zr), swing = (swL + swR) / 2;
  const corr = mean(zl.map((v, i) => (v - mean(zl)) * (zr[i] - mean(zr)))) / (sd(zl) * sd(zr) || 1);
  console.log(`  ${name}：手的前后摆幅 左 ${f3(swL)} 右 ${f3(swR)} 米，左右手相关 ${f2(corr)}`);
  if (run) R.ok(`${name}：两臂都屈肘、一前一后地大摆`, swL > 0.22 && swR > 0.22 && swL < 0.75 && swR < 0.75 && corr < -0.5, `摆幅 左 ${f3(swL)} 右 ${f3(swR)}，相关 ${f2(corr)}`);
  else R.ok(`${name}：两臂一前一后地摆`, swing > 0.04 && swing < 0.75 && corr < -0.5, `摆幅 ${f3(swing)}，相关 ${f2(corr)}`);
  return { v, cad, stepLen };
}
console.log('\n二、步态');
await gait('走', 'walk');
await gait('快走', 'fast');
const RUNG = await gait('跑', 'run');

// —— 二之二、衣裳裹不裹得住：腿不穿出来、手不插进去 ——
// 把世界的时钟停下来一帧一帧地推，每帧量一次（clip.js）：袜筒、鞋和衣身有没有交点；手在不在衣身里头
console.log('\n二之二、衣裳');
{
  const advance = (n) => ev((n) => { const w = window.__ks.world; for (let i = 0; i < n; i++) { w.time += 1 / 60; for (const f of w.tick) f(1 / 60, w.time); } }, n);
  const clipRun = async (name, start, warm) => {
    await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(300);
    await start();
    await ev(() => window.__ks.world.stop());
    await advance(Math.round(warm * 60));
    const rows = [];
    for (let i = 0; i < 150; i++) { await advance(1); rows.push(await ev(() => window.__clipProbe())); }
    await ev(() => { const k = window.__ks; k.world.start(); k.player.stop(); k.setRun(false); k.stick.set(0, 0); });
    const leg = rows.filter((r) => r.leg.n > 0).length, hand = rows.filter((r) => r.hand.L + r.hand.R > 0).length;
    const zl = rows.map((r) => r.hl[2]), zr = rows.map((r) => r.hr[2]), swL = Math.max(...zl) - Math.min(...zl), swR = Math.max(...zr) - Math.min(...zr);
    const first = rows.find((r) => r.leg.n);
    R.ok(`${name}：腿不从衣裳里穿出来`, leg === 0, `150 帧里 ${leg} 帧有袜筒或鞋穿过布${first ? '（' + first.leg.ys.join('、') + '）' : ''}`);
    R.ok(`${name}：手不插进衣身`, hand <= 4, `150 帧里 ${hand} 帧`);
    R.ok(`${name}：两只手都在摆`, swL > 0.1 && swR > 0.1 && Math.abs(swL - swR) < 0.15 * Math.max(swL, swR), `前后摆幅 左 ${f3(swL)} 右 ${f3(swR)} 米`);
  };
  await clipRun('走', () => ev((x1) => window.__ks.player.goTo(x1, 77, { r: 0.2 }), FIELD.x1), 1.6);
  await clipRun('快走（摇杆推到头）', () => ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = -Math.PI / 2; k.stick.set(0, 1); }), 1.6);
  await clipRun('跑（Shift）', () => ev((x1) => { const k = window.__ks; k.setRun(true); k.player.goTo(x1, 77, { r: 0.2 }); }, FIELD.x1), 2.2);
}

// —— 三、起步与停步 ——
console.log('\n三、起停');
{
  await tp(-10, 14.7, Math.PI / 2); await wait(400);
  const a = await rec(2600, () => ev(() => window.__ks.player.goTo(11, 14.7)));
  const vmax = Math.max(...a.rows.map((r) => r.speed)), t90 = (a.rows.find((r) => r.speed > 0.9 * vmax).t - a.rows[0].t) / 1000;
  R.ok('起步：半秒上下走匀', t90 > 0.12 && t90 < 0.8, `到九成速度用了 ${f2(t90)} 秒`);
  const b = await rec(2200, () => ev(() => window.__ks.player.stop()));
  const stopT = (b.rows.find((r) => r.speed < 0.05)?.t - b.rows[0].t) / 1000, slideAfter = Math.hypot(b.rows.at(-1).pos[0] - b.rows[0].pos[0], b.rows.at(-1).pos[2] - b.rows[0].pos[2]);
  R.ok('停步：不拖不滑', stopT < 0.7 && slideAfter < 0.45, `${f2(stopT)} 秒停住，又滑出 ${f2(slideAfter)} 米`);
  if (b.rows[0].fl) {
    const e = b.rows.at(-1), gap = Math.abs(e.fl[0] - e.fr[0]), lateral = Math.abs(e.fl[2] - e.fr[2]);
    const still = b.rows.slice(-30), drift = Math.hypot(still.at(-1).fl[0] - still[0].fl[0], still.at(-1).fl[2] - still[0].fl[2]);
    R.ok('停稳后两脚并拢', gap < 0.14 && lateral > 0.08 && lateral < 0.26, `前后差 ${f3(gap)} 米，左右距 ${f3(lateral)} 米`);
    R.ok('站定后脚不再动', drift < 0.004, `半秒里挪了 ${f3(drift)} 米`);
  }
  if (SHOTS) await shot(page, d, 'idle');
}
{
  // 起跑：站着 → 跑起来要一秒上下（不是一下子换速），头几步由小到大
  await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(500);
  const a = await rec(2600, () => ev((x1) => { const k = window.__ks; k.setRun(true); k.player.goTo(x1, 77); }, FIELD.x1));
  const rows = a.rows, vmax = Math.max(...rows.map((r) => r.speed)), t90 = (rows.find((r) => r.speed > 0.9 * vmax).t - rows[0].t) / 1000;
  // 加速度：按 0.1 秒一段量（一帧一帧的会抖）
  let accMax = 0;
  for (let i = 0, j = 0; i < rows.length; i++) { while (j < rows.length && rows[j].t - rows[i].t < 100) j++; if (j < rows.length) accMax = Math.max(accMax, (rows[j].speed - rows[i].speed) / ((rows[j].t - rows[i].t) / 1000)); }
  const sl = a.steps.slice(0, 6).map((s, i, A) => (i ? Math.hypot(s.x - A[i - 1].x, s.z - A[i - 1].z) : 0)).slice(1);
  console.log(`  起跑：${f2(t90)} 秒到九成速度（${f2(vmax)} 米/秒），加速最快 ${f2(accMax)} 米/秒²，头几步 ${sl.map(f2).join(' ')} 米`);
  R.ok('起跑：一秒上下跑起来，不是一下子换速', t90 > 0.6 && t90 < 1.8 && accMax < 7.5, `${f2(t90)} 秒，最快 ${f2(accMax)} 米/秒²`);
  R.ok('起跑：头几步由小到大', sl.length >= 4 && sl[0] < sl.at(-1) * 0.8, sl.map(f2).join(' '));
  // 跑着停下：一两步收住（急停有一小步缓冲），停稳两脚并拢、不再动
  const b = await rec(2400, () => ev(() => { const k = window.__ks; k.setRun(false); k.player.stop(); }));
  const r2 = b.rows, stopT = (r2.find((r) => r.speed < 0.05)?.t - r2[0].t) / 1000, dist = Math.hypot(r2.at(-1).pos[0] - r2[0].pos[0], r2.at(-1).pos[2] - r2[0].pos[2]);
  const after = b.steps.filter((s) => s.t > r2[0].t).length;
  console.log(`  跑着停：${f2(stopT)} 秒停住，又走出 ${f2(dist)} 米，${after} 步`);
  R.ok('跑着停：一两步收住（不是一下子钉住，也不拖）', stopT > 0.35 && stopT < 1.4 && dist > 0.4 && dist < 2.8 && after >= 1, `${f2(stopT)} 秒，${f2(dist)} 米，${after} 步`);
  if (r2[0].fl) {
    const e = r2.at(-1), gap = Math.abs(e.fl[0] - e.fr[0]), lateral = Math.abs(e.fl[2] - e.fr[2]);
    const still = r2.slice(-30), drift = Math.hypot(still.at(-1).fl[0] - still[0].fl[0], still.at(-1).fl[2] - still[0].fl[2]);
    R.ok('跑着停：停稳后两脚并拢、不再动', gap < 0.16 && lateral > 0.07 && lateral < 0.26 && drift < 0.004, `前后差 ${f3(gap)}，左右距 ${f3(lateral)}，半秒挪 ${f3(drift)} 米`);
  }
}

// —— 四、转身 ——
console.log('\n四、转身');
{
  await tp(-4, 14.7, Math.PI / 2); await wait(300);
  await ev(() => window.__ks.player.goTo(8, 14.7)); await wait(1400);
  const a = await rec(1600, () => ev(() => window.__ks.player.goTo(-9, 14.7)));
  const wrap = (x) => { x = (x + Math.PI) % (Math.PI * 2); return (x < 0 ? x + Math.PI * 2 : x) - Math.PI; };
  const y0 = a.rows[0].yaw, turned = a.rows.map((r) => Math.abs(wrap(r.yaw - y0)));
  const tTurn = (a.rows[turned.findIndex((v) => v > Math.PI * 0.94)]?.t - a.rows[0].t) / 1000;
  let rate = 0;
  for (let i = 1; i < a.rows.length; i++) rate = Math.max(rate, Math.abs(wrap(a.rows[i].yaw - a.rows[i - 1].yaw)) / Math.max(1e-3, (a.rows[i].t - a.rows[i - 1].t) / 1000));
  R.ok('掉头：转过去，不是瞬间翻面', tTurn > 0.25 && tTurn < 1.3 && rate < 14, `${f2(tTurn)} 秒转过身，最快 ${f2(rate)} 弧度/秒`);
  await ev(() => window.__ks.player.stop());
}
{
  // 跑着拐弯（按住 W 跑，再加 A 往左拐）：身子向内（左）倾、走一道弧，不横着跑、不一下子翻过去
  await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(300);
  await ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = -Math.PI / 2; k.setRun(true); });
  await page.keyboard.down('w'); await wait(1800);
  const a = await rec(1500, () => page.keyboard.down('a'));
  await page.keyboard.up('a'); await page.keyboard.up('w'); await ev(() => window.__ks.setRun(false)); await wait(1300);
  const wrap = (x) => { x = (x + Math.PI) % (Math.PI * 2); return (x < 0 ? x + Math.PI * 2 : x) - Math.PI; };
  let inward = 0, outward = 0, rate = 0, side = 0, n = 0;
  for (let i = 1; i < a.rows.length; i++) {
    const r = a.rows[i], q = a.rows[i - 1], dt = Math.max(1e-3, (r.t - q.t) / 1000), w = wrap(r.yaw - q.yaw) / dt;
    rate = Math.max(rate, Math.abs(w));
    // 身子歪向哪：头相对胯往左（他自己的左）偏多少，换成角度
    const lx = Math.cos(r.yaw), lz = -Math.sin(r.yaw), lat = (r.head[0] - r.hips[0]) * lx + (r.head[2] - r.hips[2]) * lz, ang = Math.atan2(lat, r.head[1] - r.hips[1]);
    if (w > 0.4) { inward = Math.max(inward, ang); outward = Math.min(outward, ang); }
    // 速度方向与身子朝向差多少（横着跑）
    if (i > 1) { const vx = r.pos[0] - q.pos[0], vz = r.pos[2] - q.pos[2]; if (Math.hypot(vx, vz) > 0.02) { side = Math.max(side, Math.abs(wrap(Math.atan2(vx, vz) - r.yaw))); n++; } }
  }
  const deg = (v) => ((v * 180) / Math.PI).toFixed(1);
  console.log(`  跑着拐弯：向内倾最多 ${deg(inward)}°，向外 ${deg(-outward)}°，转身最快 ${f2(rate)} 弧度/秒，身子与去向最多差 ${deg(side)}°`);
  R.ok('跑着拐弯：身子向内倾（明显而不过分）', inward > 0.05 && inward < 0.3 && outward > -0.035, `内 ${deg(inward)}°，外 ${deg(-outward)}°`);
  R.ok('跑着拐弯：顺着弧跑，不横着跑、不瞬间翻面', rate < 6 && side < 0.6 && n > 20, `转速最快 ${f2(rate)}，偏差最多 ${deg(side)}°`);
}

// —— 五、上下台阶 ——
console.log('\n五、坡与台阶');
async function stairs(name, from, to, { zone = 'ground', run = false } = {}) {
  await tp(from[0], from[1], Math.atan2(to[0] - from[0], to[1] - from[1]), zone); await wait(400);
  const a = await rec(null, async () => {
    await ev(([x, z, run]) => { const k = window.__ks; if (run) k.setRun(true); k.player.goTo(x, z, { r: 0.2 }); }, [...to, run]);
    await page.waitForFunction(() => !window.__ks.player.walking, null, { timeout: 30000 }).catch(() => {});
    await wait(run ? 1200 : 500);
  });
  await ev(() => window.__ks.setRun(false));
  const rows = a.rows, e = rows.at(-1);
  const arrived = Math.hypot(e.pos[0] - to[0], e.pos[2] - to[1]) < 0.5;
  let jump = 0, sink = 0, hover = 0;
  // 一帧最多升降多少（跑着的按 1/60 秒折算：帧卡了一下不算跳）
  for (let i = 1; i < rows.length; i++) jump = Math.max(jump, Math.abs(rows[i].pos[1] - rows[i - 1].pos[1]) / (run ? Math.max(1, ((rows[i].t - rows[i - 1].t) / 1000) * 60) : 1));
  // 脚与台阶：着地的脚不该陷进台阶，也不该悬着
  // 脚下的地面：脚的原点在脚跟附近，正踩在台阶棱上时前后八厘米内取最低的那一级（脚跟贴着上一级的立面不算陷进去）
  const dl = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1, ux = ((to[0] - from[0]) / dl) * 0.08, uz = ((to[1] - from[1]) / dl) * 0.08;
  const g = await ev(([pts, ux, uz, zone]) => pts.map(([x, z]) => { const a = [window.__walk.groundAt(x, z, zone), window.__walk.groundAt(x + ux, z + uz, zone), window.__walk.groundAt(x - ux, z - uz, zone)].filter((v) => v != null); return a.length ? Math.min(...a) : null; }), [rows.flatMap((r) => (r.fl ? [[r.fl[0], r.fl[2]], [r.fr[0], r.fr[2]]] : [])), ux, uz, zone]);
  if (rows[0].fl) {
    const base = await ev(() => { const av = window.__ks.player.av, p = window.__ks.player; return [av.feet.L, av.feet.R].map((f) => { const v = new p.pos.constructor(); f.getWorldPosition(v); return v.y - p.pos.y; }); });
    rows.forEach((r, i) => { for (const [j, key] of [[0, 'fl'], [1, 'fr']]) { const gy = g[i * 2 + j]; if (gy == null) continue; const dy = r[key][1] - base[j] - gy; sink = Math.min(sink, dy); } });
    void hover;
  }
  const dy = e.pos[1] - rows[0].pos[1];
  // 跑上台阶：踩在台阶上的那几步（与上一步高差过 6 厘米）比平地跑的步子小
  const st = a.steps.map((s, i, A) => (i && Math.abs(s.y - A[i - 1].y) > 0.06 ? Math.hypot(s.x - A[i - 1].x, s.z - A[i - 1].z) : null)).filter((v) => v != null);
  console.log(`  ${name}：高差 ${f2(dy)} 米，${f2((e.t - rows[0].t) / 1000)} 秒，身子一帧最多升降 ${f3(jump)} 米，脚最深陷 ${f3(-sink)} 米，步数 ${a.steps.length}${st.length ? `，台阶上的步子 ${st.map(f2).join(' ')} 米` : ''}`);
  R.ok(`${name}：走得到`, arrived, `停在 (${f2(e.pos[0])}, ${f2(e.pos[2])})`);
  R.ok(`${name}：身子升降连贯`, jump < (run ? 0.035 : 0.03), `一帧最多 ${f3(jump)} 米`);
  if (rows[0].fl) R.ok(`${name}：脚不陷进台阶`, -sink < 0.09, `最深 ${f3(-sink)} 米`);
  if (run && st.length >= 2 && RUNG?.stepLen) R.ok(`${name}：台阶上步子自动收小`, mean(st) < 0.8 * RUNG.stepLen, `台阶上平均 ${f2(mean(st))} 米，平地跑 ${f2(RUNG.stepLen)} 米`);
  return a;
}
await stairs('上草堂（踏步石、台基、门槛）', [0, 6.2], [0, 1.0]);
await stairs('下草堂', [0, 1.0], [0, 6.2]);
await stairs('出柴门下坡到溪边', [0.3, 17.2], [0, 25.2]);
await stairs('过石桥', [0, 25.2], [0, 35.2]);
await stairs('上坡回柴门', [0, 25.2], [0.3, 17.2]);
await stairs('上观物亭', [-0.9, -20.1], [-3.6, -20.4]);
await stairs('过汀步', [62, 35.8], [62.6, 25.2]);
// 跑着过：台阶、坡、桥、汀步（步子自动收小、慢下来，脚照样落在踏面上）
await stairs('跑上草堂', [0, 7.4], [0, 1.0], { run: true });
await stairs('跑下草堂', [0, 1.0], [0, 7.4], { run: true });
await stairs('跑下坡到溪边', [0.3, 17.2], [0, 25.2], { run: true });
await stairs('跑过石桥', [0, 24.6], [0, 35.4], { run: true });
await stairs('跑上坡回柴门', [0, 25.2], [0.3, 17.2], { run: true });
await stairs('跑上观物亭', [-0.9, -20.1], [-3.6, -20.4], { run: true });
await stairs('跑过汀步', [62, 35.8], [62.6, 25.2], { run: true });

// —— 六、撞墙 ——
console.log('\n六、撞篱笆');
{
  // 面朝屋后的竹篱站着往前走：应当停住，不原地踏步
  await tp(6.5, -4.6, Math.PI); await wait(300);
  await ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = 0; });
  await page.keyboard.down('w'); await wait(1900);
  const a = await rec(1800);
  await page.keyboard.up('w');
  const moved = Math.hypot(a.rows.at(-1).pos[0] - a.rows[0].pos[0], a.rows.at(-1).pos[2] - a.rows[0].pos[2]);
  R.ok('顶着篱笆：停住', moved < 0.05 && a.rows.at(-1).pos[2] > -5.45, `又挪了 ${f3(moved)} 米，z=${f2(a.rows.at(-1).pos[2])}`);
  R.ok('顶着篱笆：不原地踏步', a.steps.length === 0 && mean(a.rows.map((r) => r.speed)) < 0.08, `${a.steps.length} 步，速度 ${f3(mean(a.rows.map((r) => r.speed)))}`);
  // 斜着蹭篱笆：顺着滑，速度慢下来
  await tp(6.5, -4.95, Math.PI); await wait(300);
  await ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = 0.6; });
  await page.keyboard.down('w'); await wait(500);
  const b = await rec(1500);
  await page.keyboard.up('w');
  const along = b.rows.at(-1).pos[0] - b.rows[0].pos[0], vS = mean(b.rows.map((r) => r.speed));
  R.ok('斜着蹭篱笆：顺着滑过去', Math.abs(along) > 0.6 && Math.abs(b.rows.at(-1).pos[2] - b.rows[0].pos[2]) < 0.1, `沿墙走了 ${f2(along)} 米，速度 ${f2(vS)}`);
  await wait(300);
}

// —— 七、姿势 ——
console.log('\n七、姿势');
for (const [pose, name] of [['kneel', '跪'], ['sit', '盘坐'], ['bench', '坐凳'], ['crouch', '蹲'], ['stand', '站']]) {
  await tp(1.2, 12.6, Math.PI); await wait(200);
  await ev((p) => { const k = window.__ks; k.player.locked = true; k.player.av.setPose(p, 1.0); }, pose);
  const a = await rec(1900);
  const box = await ev(() => window.__probe.box());
  const hips = a.rows.at(-1).hips[1], head = a.rows.at(-1).head[1];
  let jerk = 0;
  for (let i = 1; i < a.rows.length; i++) jerk = Math.max(jerk, Math.abs(a.rows[i].head[1] - a.rows[i - 1].head[1]));
  console.log(`  ${name}：胯高 ${f2(hips)}，头高 ${f2(head)}，最低处 ${f3(box.lo[1])}，占地 ${f2(box.hi[0] - box.lo[0])}×${f2(box.hi[2] - box.lo[2])}，头一帧最多动 ${f3(jerk)}`);
  const gy = await ev(() => window.__ks.player.pos.y);
  R.ok(`${name}：不陷进地里`, box.lo[1] - gy > -0.03, `最低处比地面 ${f3(box.lo[1] - gy)}`);
  R.ok(`${name}：过渡连贯`, jerk < 0.05, `头一帧最多 ${f3(jerk)} 米`);
  if (SHOTS) {
    await ev(() => { const k = window.__ks, p = k.player.pos; k.nav.setPose({ pos: new p.constructor(p.x + 1.9, p.y + 1.0, p.z - 1.5), look: new p.constructor(p.x, p.y + 0.7, p.z), fov: 40 }, 0.01); });
    await wait(200); await shot(page, d, `pose-${pose}`);
    await ev(() => window.__ks.nav.setPose(null, 0.01));
  }
  await ev(() => { const k = window.__ks; k.player.av.setPose('stand', 0.6); k.player.locked = false; });
  await wait(700);
}

// —— 八、镜头 ——
console.log('\n八、镜头');
{
  let bad = 0, n = 0, low = 0;
  const spots = [[0, 0.6, 'ground'], [-3, -0.8, 'ground'], [3.2, -0.6, 'ground'], [1.2, 12, 'ground'], [-8, 4, 'ground'], [6.5, -4.4, 'ground'], [-3.8, -20.6, 'ground'], [80, 15, 'ground'], [0, 30, 'ground'], [99, 7.5, 'ground'], [-150, 38, 'ground'], [50, 10.8, 'ground']];
  for (const [x, z, zone] of spots) {
    for (const yaw of [0, 1.57, 3.14, -1.57]) {
      await ev(([x, z, yaw, zone]) => { const k = window.__ks; k.player.teleport(x, z, 0, zone); k.nav.snapBehind(); k.nav.yaw = yaw; }, [x, z, yaw, zone]);
      await wait(420);
      const r = await ev(() => {
        const k = window.__ks, c = k.world.camera.position, { B, OB } = window.__walk._debug;
        // 进了草堂屋顶南墙都隐去了，镜头在屋外看进来不算钻墙
        if (k.nav.open) return { inside: false, under: false, d: 0 };
        const inside = B.some((b) => b.tall && c.x > b.x0 && c.x < b.x1 && c.z > b.z0 && c.z < b.z1) || OB.some((o) => { if (!o.tall) return false; const dx = c.x - o.x, dz = c.z - o.z; return Math.abs(dx * o.c - dz * o.s) < o.hw && Math.abs(dx * o.s + dz * o.c) < o.hd; });
        const g = window.__walk.groundAt(c.x, c.z);
        return { inside, under: g != null && c.y < g + 0.2, d: Math.hypot(c.x - k.player.pos.x, c.z - k.player.pos.z) };
      });
      n++; if (r.inside) bad++; if (r.under) low++;
    }
  }
  R.ok('镜头不钻进墙里', bad === 0, `${n} 个机位里 ${bad} 个在墙里`);
  R.ok('镜头不钻到地下', low === 0, `${low} 个低于地面`);
}
{
  // 跑起来镜头稍退、视野略宽；停下来慢慢回去
  await tp(FIELD.x0, FIELD.z, Math.PI / 2); await wait(600);
  const camD = () => ev(() => { const k = window.__ks, c = k.world.camera.position, p = k.player.pos; return { d: Math.hypot(c.x - p.x, c.z - p.z), fov: k.world.camera.fov }; });
  const c0 = await camD();
  await ev((x1) => { const k = window.__ks; k.setRun(true); k.player.goTo(x1, 77); }, FIELD.x1); await wait(3200);
  const c1 = await camD();
  await ev(() => { const k = window.__ks; k.setRun(false); k.player.stop(); }); await wait(900);
  const c2 = await camD(); await wait(3000);
  const c3 = await camD();
  console.log(`  镜头：站着 ${f2(c0.d)} 米 ${f2(c0.fov)}°，跑着 ${f2(c1.d)} 米 ${f2(c1.fov)}°，停下一秒 ${f2(c2.d)} 米，四秒 ${f2(c3.d)} 米 ${f2(c3.fov)}°`);
  R.ok('镜头：跑起来稍退、视野略宽，停下慢慢回来', c1.d > c0.d * 1.06 && c1.fov > c0.fov + 1 && c2.d > c3.d && Math.abs(c3.d - c0.d) < 0.5, `${f2(c0.d)} → ${f2(c1.d)} → ${f2(c2.d)} → ${f2(c3.d)}`);
}

// —— 九、闲时的小动作 ——
console.log('\n九、闲时');
{
  await ev(() => { window.__ks.player.idle.on = true; });
  const av = (fn) => ev(fn);
  await tp(1.2, 12.6, Math.PI); await wait(400);
  // 站着：过一会儿就有小动作（把计时拨到眼前，不必真等十几秒）
  await ev(() => { const i = window.__ks.player.idle; i.still = 3; i.nextG = 0; });
  await wait(500);
  const g = await av(() => window.__ks.player.av.gesturing);
  const a = await rec(2600);
  let jerk = 0;
  for (let i = 1; i < a.rows.length; i++) jerk = Math.max(jerk, Math.hypot(a.rows[i].head[0] - a.rows[i - 1].head[0], a.rows[i].head[1] - a.rows[i - 1].head[1], a.rows[i].head[2] - a.rows[i - 1].head[2]));
  R.ok('站久了：有闲时的小动作，从容不跳', !!g && jerk < 0.025, `在做 ${g}，头一帧最多动 ${f3(jerk)} 米`);
  // 一走起来就收住（走着往旁边看一眼的除外）
  await ev(() => window.__ks.player.goTo(1.2, 8.6)); await wait(1000);
  const g2 = await av(() => window.__ks.player.av.gesturing);
  R.ok('一走起来站着的小动作就收住', !g2 || g2 === 'look', `${g2}`);
  await ev(() => window.__ks.player.stop()); await wait(300);
  // 散步走了一阵：负手而行；跑起来手就放开
  await tp(-176, 41.5, Math.PI / 2); await wait(300);
  await ev(() => { const k = window.__ks, i = k.player.idle; i.strollBack = true; i.strollAt = 1.0; k.player.goTo(-140, 38); });
  await wait(2800);
  const h1 = await av(() => window.__ks.player.av.hands);
  await ev(() => window.__ks.setRun(true)); await wait(1600);
  const h2 = await av(() => window.__ks.player.av.hands);
  R.ok('散步走了一阵负手而行，跑起来手就放开', h1 === 'back' && h2 === 'free', `走着 ${h1}，跑起来 ${h2}`);
  await ev(() => { const k = window.__ks; k.setRun(false); k.player.stop(); }); await wait(1300);
  // 做事时一概不出：坐到书案前读书，把计时拨到眼前，也不该有小动作、手也不被换
  await tp(3.2, -0.4, Math.PI); await wait(300);
  await ev(() => window.__ks.enterAct('book'));
  await page.waitForFunction(() => window.__ks.act?.id === 'book', null, { timeout: 15000 }).catch(() => {});
  await wait(1600);
  const before = await av(() => window.__ks.player.av.hands);
  await ev(() => { const i = window.__ks.player.idle; i.still = 30; i.nextG = 0; i.nextH = 0; });
  await wait(1500);
  const r = await av(() => ({ g: window.__ks.player.av.gesturing, h: window.__ks.player.av.hands, act: window.__ks.act?.id }));
  R.ok('做事时：闲时的小动作一概不出', r.act === 'book' && !r.g && r.h === before, `在做 ${r.act}，小动作 ${r.g}，手 ${before} → ${r.h}`);
  await ev(() => window.__ks.exitAct()); await wait(1500);
  // 下雨天在外面：戴上斗笠、披上蓑衣（一秒多戴好，不再抬袖遮雨）；走进草堂就卸下
  await tp(0, 5.2, Math.PI); await wait(200);
  await ev(() => window.__ks.setWeather('rain', true)); await wait(1900);
  const s1 = await av(() => ({ g: window.__ks.player.av.gearK ?? 0, gest: window.__ks.player.av.gesturing }));
  await ev(() => window.__ks.player.goTo(0, 0.6, { r: 0.2 })); await wait(4500);
  const s2 = await av(() => ({ g: window.__ks.player.av.gearK ?? 0, gest: window.__ks.player.av.gesturing }));
  await ev(() => window.__ks.setWeather('clear', true)); await wait(300);
  R.ok('下雨在外面戴笠披蓑，进屋就卸下', s1.g > 0.95 && s1.gest !== 'shade' && s2.g < 0.05, `院里 ${s1.g.toFixed(2)}（${s1.gest}），屋里 ${s2.g.toFixed(2)}`);
  await ev(() => { window.__ks.player.idle.on = false; });
}

// —— 十、仰卧（观星）——
console.log('\n十、仰卧');
{
  // 院里一块平地，假装铺了一领席：席面比地面高 2 厘米（setSeat 告诉身子、lift 把 root 抬到席面上）。站着直接躺：先坐下再躺
  const MAT = 0.02;
  await tp(-6, 12.6, 0); await wait(400);
  await ev(() => { window.__ks.player.idle.on = true; });
  const start = await pos();
  const down = () => ev(([MAT]) => { const p = window.__ks.player, av = p.av; p.locked = true; av.setSeat({ h: MAT, hx: 0.46, hz: 0.92, cz: 0.08 }); p.lift = MAT; av.setPose('lie', 2.4); }, [MAT]);
  const up = () => ev(() => { const p = window.__ks.player, av = p.av; av.setPose('stand', 1.4); p.lift = 0; });
  const lieShape = () => ev(([MAT]) => {
    const k = window.__ks, p = k.player, av = p.av, V3 = p.pos.constructor, v = new V3(), y0 = p.pos.y + MAT, r = (o) => { o.getWorldPosition(v); return [v.x - p.pos.x, v.y - y0, v.z - p.pos.z]; };
    const box = window.__probe.box();
    return { head: r(av.joints.head), hips: r(av.joints.hips), fl: r(av.feet.L), fr: r(av.feet.R), lo: box.lo[1] - y0, len: box.hi[2] - box.lo[2], pose: av.pose, gest: av.gesturing };
  }, [MAT]);
  const drift = [];
  let shape = null, jerk = 0, okUp = true;
  for (let n = 0; n < 3; n++) {
    const a = await rec(3300, down);
    for (let i = 1; i < a.rows.length; i++) jerk = Math.max(jerk, Math.hypot(a.rows[i].head[0] - a.rows[i - 1].head[0], a.rows[i].head[1] - a.rows[i - 1].head[1], a.rows[i].head[2] - a.rows[i - 1].head[2]));
    if (n === 0) shape = await lieShape();
    const b = await rec(2400, up);
    for (let i = 1; i < b.rows.length; i++) jerk = Math.max(jerk, Math.hypot(b.rows[i].head[0] - b.rows[i - 1].head[0], b.rows[i].head[1] - b.rows[i - 1].head[1], b.rows[i].head[2] - b.rows[i - 1].head[2]));
    // 站好了：姿态是 stand、能迈步；两脚回到身子底下并拢（前后差不过几厘米）
    const st = await ev(() => { const k = window.__ks, p = k.player, av = p.av, V3 = p.pos.constructor, v = new V3(); const z = (o) => { o.getWorldPosition(v); return v.z - p.pos.z; }; return { pose: av.pose, ready: av.ready, fz: [z(av.feet.L), z(av.feet.R)] }; });
    okUp = okUp && st.pose === 'stand' && st.ready && Math.abs(st.fz[0] - st.fz[1]) < 0.06 && Math.max(Math.abs(st.fz[0]), Math.abs(st.fz[1])) < 0.08;
    const q = await pos(); drift.push(Math.hypot(q.x - start.x, q.z - start.z));
  }
  const f3v = (a) => a.map(f2).join(', ');
  console.log(`  躺平：头 (${f3v(shape.head)})，胯 (${f3v(shape.hips)})，脚 (${f3v(shape.fl)}) (${f3v(shape.fr)})，最低处比席面 ${f3(shape.lo)} 米，身长 ${f2(shape.len)} 米，小动作 ${shape.gest}`);
  R.ok('仰卧：头、胯、脚都贴着席面，人是躺平的', shape.pose === 'lie' && shape.head[1] > 0.06 && shape.head[1] < 0.26 && shape.hips[1] > 0.08 && shape.hips[1] < 0.2 && Math.max(shape.fl[1], shape.fr[1]) < 0.12 && Math.min(shape.fl[1], shape.fr[1]) > -0.01 && shape.head[2] < -0.4 && shape.fl[2] > 0.6 && shape.len > 1.3, `头高 ${f2(shape.head[1])}，胯高 ${f2(shape.hips[1])}，身长 ${f2(shape.len)}`);
  R.ok('仰卧：不穿席、不穿地', shape.lo > -0.012, `最低处比席面 ${f3(shape.lo)} 米`);
  R.ok('仰卧：躺下、坐起连贯（头一帧动得不多），躺着不出闲时的小动作', jerk < 0.06 && !shape.gest, `头一帧最多 ${f3(jerk)} 米`);
  R.ok('仰卧：来回躺下起身三次，人不漂移、站好了', okUp && Math.max(...drift) < 0.02, `离起点 ${drift.map(f3).join(' ')} 米`);
  // 躺着看天：往脚那边的天上看，脸朝上又略朝脚那边；往左看，脸转向左
  await down(); await wait(3200);
  const face = (dx, dz) => ev(([dx, dz]) => {
    const k = window.__ks, p = k.player, av = p.av, V3 = p.pos.constructor;
    av.lookAt(new V3(p.pos.x + dx, p.pos.y + 12, p.pos.z + dz));
    return new Promise((res) => setTimeout(() => { const q = av.joints.head.quaternion.clone(); av.joints.head.getWorldQuaternion(q); const f = new V3(0, 0, 1).applyQuaternion(q); res([f.x, f.y, f.z]); }, 1200));
  }, [dx, dz]);
  const fS = await face(0, 10), fL = await face(9, -1);
  await ev(() => window.__ks.player.av.lookAt(null));
  console.log(`  躺着看天：看南边（脚那边）脸朝 (${f3v(fS)})，看左边 (${f3v(fL)})`);
  R.ok('仰卧：头的 lookAt 照样朝天上转', fS[1] > 0.5 && fS[2] > 0.15 && fL[1] > 0.4 && fL[0] > 0.2, `南 (${f3v(fS)})，左 (${f3v(fL)})`);
  await up(); await wait(2200);
  // 起身后能走
  await ev(() => { const k = window.__ks, p = k.player; p.av.setSeat(null); p.locked = false; k.nav.yaw = k.nav.yawS = Math.PI; });
  const a0 = await pos();
  await page.keyboard.down('w'); await wait(1300); await page.keyboard.up('w'); await wait(400);
  const a1 = await pos();
  R.ok('仰卧：起身后能走', Math.hypot(a1.x - a0.x, a1.z - a0.z) > 0.8, `走了 ${f2(Math.hypot(a1.x - a0.x, a1.z - a0.z))} 米`);
  await ev(() => { window.__ks.player.idle.on = false; });
}

console.log('\n—— 页面报错 ——');
for (const l of [...new Set(logs)]) console.log(l);
const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
