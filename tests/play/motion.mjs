// 小人的动态：按键方向、步态（步幅、步频、脚下滑不滑、身子起伏）、起停、转身、上下台阶、撞墙、姿势、镜头。
// 用法：node tests/play/motion.mjs [--shots]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, open, dir, shot, Report } from './lib.mjs';

const SHOTS = process.argv.includes('--shots');
const probe = readFileSync(join(import.meta.dirname, 'probe.js'), 'utf8');
const browser = await launch();
const { page, logs } = await open(browser, { s: 'censer', ui: '0' });
await page.evaluate(probe);
const R = new Report(), d = dir('motion');
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const tp = (x, z, yaw, zone = 'ground') => ev(([x, z, yaw, zone]) => { const k = window.__ks; if (k.act) k.exitAct(); k.player.teleport(x, z, yaw, zone); k.nav.snapBehind(); }, [x, z, yaw, zone]);
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
  await tp(0, 24.2, Math.PI); await wait(250);
  const a = await pos();
  await page.keyboard.down(key); await wait(1100); await page.keyboard.up(key); await wait(500);
  const b = await pos(), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  R.ok(`按 ${key.toUpperCase()} 往${name}走`, l > 1.0 && (dx / l) * want[0] + (dz / l) * want[1] > 0.93, `走了 ${f2(l)} 米，方向 (${f2(dx / l)}, ${f2(dz / l)})`);
}
{
  await tp(-15, 39.9, Math.PI / 2); await wait(250);
  const a = await pos();
  await ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = -Math.PI / 2; });
  await page.keyboard.down('Shift'); await page.keyboard.down('w'); await wait(2000);
  const sp = (await pos()).speed;
  await page.keyboard.up('w'); await page.keyboard.up('Shift'); await wait(400);
  const b = await pos();
  R.ok('按住 Shift 是快走', sp > 2.5, `速度 ${f2(sp)} 米/秒，两秒走了 ${f2(Math.hypot(b.x - a.x, b.z - a.z))} 米`);
}

// —— 二、步态 ——
async function gait(name, fast) {
  await tp(-16, 39.9, Math.PI / 2); await wait(300);
  await ev((fast) => { const k = window.__ks; k.player.fast = fast; k.player.goTo(16, 39.9); }, fast);
  await wait(1500);                                   // 等走匀了再量
  const { rows, steps } = await rec(4200);
  await ev(() => { const k = window.__ks; k.player.fast = false; k.player.stop(); });
  const T = (rows.at(-1).t - rows[0].t) / 1000, dist = Math.hypot(rows.at(-1).pos[0] - rows[0].pos[0], rows.at(-1).pos[2] - rows[0].pos[2]), v = dist / T;
  const cad = steps.length > 1 ? (steps.length - 1) / ((steps.at(-1).t - steps[0].t) / 1000) : 0;
  const stepLen = cad ? v / cad : 0;
  console.log(`  ${name}：速度 ${f2(v)} 米/秒，步频 ${f2(cad)} 步/秒，步幅 ${f2(stepLen)} 米（身高的 ${f2(stepLen / consts.h)}），左右交替 ${steps.map((s) => s.f).join('')}`);
  R.ok(`${name}：速度稳`, sd(rows.map((r) => r.speed)) < 0.08 * v, `抖动 ${f3(sd(rows.map((r) => r.speed)))}`);
  R.ok(`${name}：步幅合身量`, stepLen / consts.h > (fast ? 0.42 : 0.36) && stepLen / consts.h < (fast ? 0.78 : 0.52), `步幅/身高 ${f2(stepLen / consts.h)}`);
  R.ok(`${name}：步频合常情`, cad > (fast ? 2.3 : 1.55) && cad < (fast ? 3.4 : 2.3), `${f2(cad)} 步/秒`);
  R.ok(`${name}：左右脚交替`, steps.length > 4 && steps.every((s, i) => i === 0 || s.f !== steps[i - 1].f));
  if (rows[0].fl) {
    // 脚：离地高度以这一段里的最低处为地面；着地（高出不到 1.2 厘米）时在地上滑了多快
    const res = {};
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
      res[key] = { slide: n ? slide / n : 0, worst, duty: rows[0][ck] == null ? planted / (rows.length - 1) : rows.filter((r) => r[ck]).length / rows.length, lift: liftMax };
    }
    const both = rows[0].cl == null ? 0 : rows.filter((r) => r.cl && r.cr).length / rows.length, none = rows[0].cl == null ? 0 : rows.filter((r) => !r.cl && !r.cr).length / rows.length;
    console.log(`  ${name}：着地时脚的滑动 左 ${f3(res.fl.slide)} 右 ${f3(res.fr.slide)} 米/秒（最快 ${f2(Math.max(res.fl.worst, res.fr.worst))}），着地占比 左 ${f2(res.fl.duty)} 右 ${f2(res.fr.duty)}，双脚同时着地 ${f2(both)}、同时离地 ${f2(none)}，抬脚最高 ${f2(Math.max(res.fl.lift, res.fr.lift))} 米`);
    R.ok(`${name}：脚踩住不滑`, Math.max(res.fl.slide, res.fr.slide) < 0.06 * v + 0.02, `着地时平均滑 ${f3(Math.max(res.fl.slide, res.fr.slide))} 米/秒（走速的 ${f2(Math.max(res.fl.slide, res.fr.slide) / v * 100)}%）`);
    R.ok(fast ? `${name}：是跑（有两脚都离地的一瞬）` : `${name}：是走（总有一只脚在地上，换脚时两脚都在）`, fast ? none > 0.02 && res.fl.duty < 0.5 : both > 0.05 && none === 0 && res.fl.duty > 0.5 && res.fl.duty < 0.75 && Math.abs(res.fl.duty - res.fr.duty) < 0.06, `着地占比 左 ${f2(res.fl.duty)} 右 ${f2(res.fr.duty)}，双支撑 ${f2(both)}，腾空 ${f2(none)}`);
    R.ok(`${name}：脚抬得起来`, Math.max(res.fl.lift, res.fr.lift) > 0.03 && Math.max(res.fl.lift, res.fr.lift) < 0.3);
  }
  // 身子的起伏：胯的高度一步一起落；头别晃得太厉害
  const hy = rows.map((r) => r.hips[1] - r.pos[1]), hd = rows.map((r) => r.head[1] - r.pos[1]);
  const bob = Math.max(...hy) - Math.min(...hy), hbob = Math.max(...hd) - Math.min(...hd);
  // 左右晃：头偏离行进直线多少（这一段沿 x 走，看 z）
  const sway = Math.max(...rows.map((r) => r.head[2] - r.pos[2])) - Math.min(...rows.map((r) => r.head[2] - r.pos[2]));
  console.log(`  ${name}：胯起伏 ${f3(bob)} 米，头起伏 ${f3(hbob)} 米，头左右晃 ${f3(sway)} 米`);
  R.ok(`${name}：身子有起伏而不颠`, bob > 0.008 && bob < (fast ? 0.12 : 0.075), `胯 ${f3(bob)} 米`);
  R.ok(`${name}：头稳`, hbob < (fast ? 0.11 : 0.07) && sway < 0.09, `上下 ${f3(hbob)} 左右 ${f3(sway)}`);
  // 摆臂：两手一前一后
  const zl = rows.map((r) => r.hl[0] - r.pos[0]), zr = rows.map((r) => r.hr[0] - r.pos[0]);
  const swing = (Math.max(...zl) - Math.min(...zl) + Math.max(...zr) - Math.min(...zr)) / 2;
  const corr = mean(zl.map((v, i) => (v - mean(zl)) * (zr[i] - mean(zr)))) / (sd(zl) * sd(zr) || 1);
  console.log(`  ${name}：手的前后摆幅 ${f3(swing)} 米，左右手相关 ${f2(corr)}`);
  R.ok(`${name}：两臂一前一后地摆`, swing > 0.04 && swing < 0.75 && corr < -0.5, `摆幅 ${f3(swing)}，相关 ${f2(corr)}`);
  return { v, cad, stepLen };
}
console.log('\n二、步态');
await gait('走', false);
await gait('快走', true);

// —— 三、起步与停步 ——
console.log('\n三、起停');
{
  await tp(-16, 39.9, Math.PI / 2); await wait(400);
  const a = await rec(2600, () => ev(() => window.__ks.player.goTo(16, 39.9)));
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

// —— 四、转身 ——
console.log('\n四、转身');
{
  await tp(0, 39.9, Math.PI / 2); await wait(300);
  await ev(() => window.__ks.player.goTo(12, 39.9)); await wait(1400);
  const a = await rec(1600, () => ev(() => window.__ks.player.goTo(-12, 39.9)));
  const wrap = (x) => { x = (x + Math.PI) % (Math.PI * 2); return (x < 0 ? x + Math.PI * 2 : x) - Math.PI; };
  const y0 = a.rows[0].yaw, turned = a.rows.map((r) => Math.abs(wrap(r.yaw - y0)));
  const tTurn = (a.rows[turned.findIndex((v) => v > Math.PI * 0.94)]?.t - a.rows[0].t) / 1000;
  let rate = 0;
  for (let i = 1; i < a.rows.length; i++) rate = Math.max(rate, Math.abs(wrap(a.rows[i].yaw - a.rows[i - 1].yaw)) / Math.max(1e-3, (a.rows[i].t - a.rows[i - 1].t) / 1000));
  R.ok('掉头：转过去，不是瞬间翻面', tTurn > 0.25 && tTurn < 1.3 && rate < 14, `${f2(tTurn)} 秒转过身，最快 ${f2(rate)} 弧度/秒`);
  await ev(() => window.__ks.player.stop());
}

// —— 五、上下台阶 ——
console.log('\n五、台阶');
async function stairs(name, from, to, zone = 'ground') {
  await tp(from[0], from[1], Math.atan2(to[0] - from[0], to[1] - from[1]), zone); await wait(400);
  const a = await rec(null, async () => {
    await ev(([x, z]) => window.__ks.player.goTo(x, z, { r: 0.2 }), to);
    await page.waitForFunction(() => !window.__ks.player.walking, null, { timeout: 30000 }).catch(() => {});
    await wait(500);
  });
  const rows = a.rows, e = rows.at(-1);
  const arrived = Math.hypot(e.pos[0] - to[0], e.pos[2] - to[1]) < 0.5;
  let jump = 0, sink = 0, hover = 0;
  for (let i = 1; i < rows.length; i++) jump = Math.max(jump, Math.abs(rows[i].pos[1] - rows[i - 1].pos[1]));
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
  console.log(`  ${name}：高差 ${f2(dy)} 米，${f2((e.t - rows[0].t) / 1000)} 秒，身子一帧最多升降 ${f3(jump)} 米，脚最深陷 ${f3(-sink)} 米，步数 ${a.steps.length}`);
  R.ok(`${name}：走得到`, arrived, `停在 (${f2(e.pos[0])}, ${f2(e.pos[2])})`);
  R.ok(`${name}：身子升降连贯`, jump < 0.03, `一帧最多 ${f3(jump)} 米`);
  if (rows[0].fl) R.ok(`${name}：脚不陷进台阶`, -sink < 0.09, `最深 ${f3(-sink)} 米`);
  return a;
}
await stairs('上殿前踏跺', [0, 12.6], [0, 6.4]);
await stairs('下殿前踏跺', [0, 6.4], [0, 12.6]);
await stairs('上山道石阶', [0, 86], [0, 70]);
await stairs('过石桥', [0, 39.6], [0, 24.6]);
await stairs('下石埠', [-8.7, 39.2], [-8.7, 36.66]);

// —— 六、撞墙 ——
console.log('\n六、撞墙');
{
  // 面朝南墙站着往前走：应当停住，不原地踏步
  await tp(12, 44.6, 0); await wait(300);
  await ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = Math.PI; });
  await page.keyboard.down('w'); await wait(1900);
  const a = await rec(1800);
  await page.keyboard.up('w');
  const moved = Math.hypot(a.rows.at(-1).pos[0] - a.rows[0].pos[0], a.rows.at(-1).pos[2] - a.rows[0].pos[2]);
  R.ok('顶着墙：停住', moved < 0.05 && a.rows.at(-1).pos[2] < 45.6, `又挪了 ${f3(moved)} 米，z=${f2(a.rows.at(-1).pos[2])}`);
  R.ok('顶着墙：不原地踏步', a.steps.length === 0 && mean(a.rows.map((r) => r.speed)) < 0.08, `${a.steps.length} 步，速度 ${f3(mean(a.rows.map((r) => r.speed)))}`);
  // 斜着蹭墙：顺着滑，速度慢下来
  await tp(12, 45.2, 0); await wait(300);
  await ev(() => { const k = window.__ks; k.nav.yaw = k.nav.yawS = Math.PI - 0.6; });
  await page.keyboard.down('w'); await wait(500);
  const b = await rec(1500);
  await page.keyboard.up('w');
  const along = b.rows.at(-1).pos[0] - b.rows[0].pos[0], vS = mean(b.rows.map((r) => r.speed));
  R.ok('斜着蹭墙：顺着墙滑过去', Math.abs(along) > 0.6 && Math.abs(b.rows.at(-1).pos[2] - b.rows[0].pos[2]) < 0.1, `沿墙走了 ${f2(along)} 米，速度 ${f2(vS)}`);
  await wait(300);
}

// —— 七、姿势 ——
console.log('\n七、姿势');
for (const [pose, name] of [['kneel', '跪'], ['sit', '坐'], ['crouch', '蹲'], ['stand', '站']]) {
  await tp(8, 42.5, Math.PI); await wait(200);
  await ev((p) => { const k = window.__ks; k.player.locked = true; k.player.av.setPose(p, 1.0); }, pose);
  const a = await rec(1900);
  const box = await ev(() => window.__probe.box());
  const hips = a.rows.at(-1).hips[1], head = a.rows.at(-1).head[1];
  let jerk = 0;
  for (let i = 1; i < a.rows.length; i++) jerk = Math.max(jerk, Math.abs(a.rows[i].head[1] - a.rows[i - 1].head[1]));
  console.log(`  ${name}：胯高 ${f2(hips)}，头高 ${f2(head)}，最低处 ${f3(box.lo[1])}，占地 ${f2(box.hi[0] - box.lo[0])}×${f2(box.hi[2] - box.lo[2])}，头一帧最多动 ${f3(jerk)}`);
  R.ok(`${name}：不陷进地里`, box.lo[1] > -0.03, `最低 ${f3(box.lo[1])}`);
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
  const spots = [[0, 44, 'ground'], [0, 2.5, 'ground'], [-9, 3, 'ground'], [9.5, -4.5, 'ground'], [-22.6, -1, 'ground'], [22.6, 3, 'ground'], [0, 47.5, 'ground'], [35.5, -15.5, 'ground'], [24.4, 20, 'ground'], [-24.5, 30, 'ground'], [0, 70, 'ground'], [-8.7, 36.7, 'ground']];
  for (const [x, z, zone] of spots) {
    for (const yaw of [0, 1.57, 3.14, -1.57]) {
      await ev(([x, z, yaw, zone]) => { const k = window.__ks; k.player.teleport(x, z, 0, zone); k.nav.snapBehind(); k.nav.yaw = yaw; }, [x, z, yaw, zone]);
      await wait(420);
      const r = await ev(() => {
        const k = window.__ks, c = k.world.camera.position, B = window.__walk._debug.B;
        const inside = B.some((b) => b.tall && c.x > b.x0 && c.x < b.x1 && c.z > b.z0 && c.z < b.z1);
        const g = window.__walk.groundAt(c.x, c.z);
        return { inside, under: g != null && c.y < g + 0.2, d: Math.hypot(c.x - k.player.pos.x, c.z - k.player.pos.z) };
      });
      n++; if (r.inside) bad++; if (r.under) low++;
    }
  }
  R.ok('镜头不钻进墙里', bad === 0, `${n} 个机位里 ${bad} 个在墙里`);
  R.ok('镜头不钻到地下', low === 0, `${low} 个低于地面`);
}

console.log('\n—— 页面报错 ——');
for (const l of [...new Set(logs)]) console.log(l);
const bad = R.done();
await browser.close();
process.exit(bad ? 1 : 0);
