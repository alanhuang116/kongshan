// 一次把浏览器里的检查都跑一遍，最后列一张表（总装、发布前用）。一个接一个跑，别的重活别同时开。
//
//   node tests/play/all.mjs                 全部（约一个钟头）
//   node tests/play/all.mjs core talk       只跑名字里含这些字的
//   node tests/play/all.mjs --skip=ui,audio 跳过这几样
//   KS_HOST=http://localhost:3801           开发服务器（不带热更新，见 README）；默认就是它
//
// 世界的台子（world.html）与正式界面（/）各用各的网址；声音用 audio-lab.html。
// 新加的检查脚本（tests/play/*.mjs）不在下表里就不会跑——加一行即可；文件还没有的那一行自动略过。
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const HOST = (process.env.KS_HOST ?? 'http://localhost:3801').replace(/\/$/, '');
const W = `${HOST}/world.html`, APP = `${HOST}/`, LAB = `${HOST}/audio-lab.html`;
/** [名字, 脚本, 参数, 环境] */
const PLAN = [
  ['core', 'core.mjs', [], { KS_URL: W }],
  ['motion', 'motion.mjs', [], { KS_URL: W }],
  ['acts', 'acts.mjs', [], { KS_URL: W }],
  ['acts-phone', 'acts.mjs', ['--mobile'], { KS_URL: W }],
  ['talk', 'talk.mjs', [], { KS_URL: W }],
  ['stars', 'stars.mjs', [], { KS_URL: W }],
  ['farm', 'farm.mjs', [], { KS_URL: W }],
  ['beasts', 'beasts.mjs', [], { KS_URL: W }],
  ['games', 'games.mjs', [], { KS_URL: W }],
  ['day', 'day.mjs', ['--no-shots'], { KS_URL: W }],
  ['flow-desk', 'flow.mjs', ['desk'], { KS_URL: APP }],
  ['flow-phone', 'flow.mjs', ['phone'], { KS_URL: APP }],
  ['together', 'together.mjs', [], { KS_URL: APP }],
  ['steer', 'steer.mjs', [], { KS_URL: APP }],
  ['ui', 'ui.mjs', ['all'], { KS_URL: APP }],
  ['dress', 'dress.mjs', [], { KS_URL: APP }],
  ['study', 'study.mjs', [], { KS_URL: APP }],
  ['sports', 'sports.mjs', [], { KS_URL: W }],
  ['sports-pvp', 'sports-pvp.mjs', [], { KS_URL: W }],
  ['sports-ui', 'sports-ui.mjs', [], { KS_URL: APP }],
  ['audio', 'audio.mjs', [], { KS_AUDIO_URL: LAB }],
];

const args = process.argv.slice(2);
const skip = (args.find((a) => a.startsWith('--skip='))?.slice(7) ?? '').split(',').filter(Boolean);
const words = args.filter((a) => !a.startsWith('--'));
const jobs = PLAN.filter(([name, file]) => existsSync(join(import.meta.dirname, file)) && !skip.some((s) => name.includes(s)) && (!words.length || words.some((w) => name.includes(w))));

const rows = [];
for (const [name, file, extra, env] of jobs) {
  const t0 = Date.now();
  process.stdout.write(`\n—— ${name}（${file} ${extra.join(' ')}）——\n`);
  const tail = [];
  const code = await new Promise((done) => {
    const p = spawn(process.execPath, [join(import.meta.dirname, file), ...extra], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const take = (b) => { const s = b.toString(); process.stdout.write(s); for (const line of s.split(/\r?\n/)) if (line.trim()) { tail.push(line); if (tail.length > 40) tail.shift(); } };
    p.stdout.on('data', take); p.stderr.on('data', take);
    p.on('close', (c) => done(c ?? 1));
  });
  // 各脚本最后都打一行「N/M 通过」（没过的跟在后面）
  const line = [...tail].reverse().find((l) => /\d+\/\d+ 通过/.test(l)) ?? '';
  const m = line.match(/(\d+)\/(\d+) 通过/);
  rows.push({ name, ok: m ? Number(m[1]) : null, all: m ? Number(m[2]) : null, code, min: (Date.now() - t0) / 60000, bad: line.split('未过：')[1] ?? '' });
}

console.log('\n\n==== 汇总 ====');
for (const r of rows) {
  const pass = r.all != null ? r.ok === r.all && r.code === 0 : r.code === 0;
  console.log(`${pass ? '✓' : '✗'} ${r.name.padEnd(11)} ${r.all != null ? `${r.ok}/${r.all}` : `退出码 ${r.code}`}`.padEnd(28) + `${r.min.toFixed(1)} 分钟${r.bad ? '　未过：' + r.bad.slice(0, 160) : ''}`);
}
const failed = rows.filter((r) => (r.all != null ? r.ok !== r.all : false) || r.code !== 0);
console.log(failed.length ? `\n${failed.length} 样没全过` : '\n全部通过');
process.exitCode = failed.length ? 1 : 0;
