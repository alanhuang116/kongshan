// 大家共用的底子在浏览器里对不对：时辰流转与过夜、跑、屋顶遮罩（屋里不积雪、雨雪不进屋）。
// 用法：KS_URL=http://localhost:3801/world.html node tests/play/core.mjs
import { launch, open, Report } from './lib.mjs';

const R = new Report();
const browser = await launch();

// —— 时辰流转：一秒半个钟头，从 23 点走过子夜 ——
{
  const { page, logs } = await open(browser, { s: 'yard', t: '23.2', flow: '0.5' }, { wait: 300 });
  const a = await page.evaluate(() => { const k = window.__ks; window.__days = []; k.onDay.push((d) => window.__days.push(d)); return { h: k.atmos.hour, day: k.day }; });
  await page.waitForTimeout(2600);
  const b = await page.evaluate(() => { const k = window.__ks; return { h: k.atmos.hour, day: k.day, days: window.__days, saved: k.mem.get('day', -1) }; });
  R.ok('时辰往前走', b.h > 0.05 && b.h < 2.5, `${a.h.toFixed(2)} → ${b.h.toFixed(2)}`);
  R.ok('过了子夜是新的一天', b.day === a.day + 1 && b.days.length === 1 && b.saved === b.day, `第${a.day}日 → 第${b.day}日`);
  // 拨到天亮（榻上一觉）：从夜里往前拨到清早，也算过了一夜
  const c = await page.evaluate(() => { const k = window.__ks; k.setFlow(0); k.passTo(23); const d0 = k.day; k.passTo(6.5); return { d0, d1: k.day, h: k.atmos.hour }; });
  R.ok('夜里睡到天亮算一夜', c.d1 === c.d0 + 1 && Math.abs(c.h - 6.5) < 1e-6);
  R.ok('没有报错', logs.length === 0, logs.slice(0, 3).join(' | '));
  await page.context().close();
}

// —— 跑：锁住跑以后，往前走的速度到跑的那一档 ——
{
  const { page } = await open(browser, { s: 'fields' }, { wait: 300 });
  const walk = await page.evaluate(async () => {
    const k = window.__ks, sp = [];
    k.keyMove.set(0, 1);
    await new Promise((r) => setTimeout(r, 1600));
    sp.push(k.player.speed);
    k.setRun(true);
    await new Promise((r) => setTimeout(r, 1800));
    sp.push(k.player.speed, k.player.run);
    k.setRun(false); k.keyMove.set(0, 0);
    await new Promise((r) => setTimeout(r, 900));
    sp.push(k.player.speed);
    return sp;
  });
  R.ok('平时是走', walk[0] > 0.8 && walk[0] < 1.8, walk[0].toFixed(2));
  R.ok('锁住跑就跑起来', walk[2] === true && walk[1] > 3.2, walk[1].toFixed(2));
  R.ok('松手停下', walk[3] < 0.3, walk[3].toFixed(2));
  await page.context().close();
}

// —— 屋顶遮罩：草堂、亭都登记了；屋里的点遮着、院里的点露天 ——
{
  const { page } = await open(browser, { s: 'hall', season: 'winter', w: 'snow' }, { wait: 600 });
  const r = await page.evaluate(() => {
    const k = window.__ks, U = k.world.scene.children; void U;
    // 着色器里的那几个盒子从材质的共用量里取（随便找一个画法材质）
    let A = null, B = null;
    k.world.scene.traverse((o) => { const u = o.material?.uniforms; if (!A && u?.uRoofA) { A = u.uRoofA.value; B = u.uRoofB.value; } });
    const boxes = A ? A.filter((a) => a.z > 0).length : 0;
    const inside = (x, y, z) => {
      for (let i = 0; i < A.length; i++) {
        const a = A[i], b = B[i]; if (a.z <= 0) continue;
        const dx = x - a.x, dz = z - a.y, lx = dx * b.x + dz * b.y, lz = -dx * b.y + dz * b.x;
        if (Math.abs(lx) < a.z && Math.abs(lz) < a.w && y > b.z && y < b.w) return true;
      }
      return false;
    };
    return { boxes, desk: inside(3.2, 9.1, 0.9), floor: inside(0, 8.35, 1), yard: inside(1.2, 8.05, 12), roofTop: inside(0, 12.6, 0), pav: inside(-3.8, 8.9, -21), cut: (() => { let v = -1; k.world.scene.traverse((o) => { const u = o.material?.uniforms; if (v < 0 && u?.uRoofCut) v = u.uRoofCut.value; }); return v; })() };
  });
  R.ok('登记了屋顶', r.boxes >= 6, `${r.boxes} 处`);
  R.ok('书案、地面在屋顶底下', r.desk && r.floor);
  R.ok('院里、屋脊上是露天', !r.yard && !r.roofTop);
  R.ok('亭里遮着', r.pav);
  R.ok('进了草堂屋顶剖开', r.cut === 1);
  await page.context().close();
}

process.exitCode = R.done();
await browser.close();
