/**
 * 牧笛：远远的一小句，每回都不一样。
 *
 * 竹笛的声音 ＝ 一个几乎纯的基音（二倍、三倍音都很弱）＋ 吹口的气声（一层跟着音高走的带通噪声）：
 *   起音——气先到（很短的一「噗」），音高略低一点冲上去才落定；
 *   长音——过了四分之一秒才起揉（每秒五下上下，十几音分），中间微微鼓一下；
 *   连音——音与音之间多半是连着吹的（滑过去），有的重新吐一下；
 *   装饰——偶尔一个倚音（先碰一下上面那个音），或者从下面一个音滑上来。一句里至少有一处。
 * 句子现编：G 宫五声（A4 B4 D5 E5 G5 A5 B5 D6），三到七个音，高高低低走几步，落在宫或徵上，末一个音最长、慢慢弱下去。
 * 远近由引擎管（没给 far / dist / at 时按 0.6 算——牧笛本来就是隔着田听的）。
 */
import type { Voice } from './engine';
import { clamp, pick, rand } from './util';

const NOTES = [440.0, 493.88, 587.33, 659.26, 783.99, 880.0, 987.77, 1174.66];
/** 落脚的音：D5、G5、D6（徵、宫、徵） */
const HOME = [2, 4, 7];
interface Tone { f: number; len: number; grace?: number; slide?: boolean; tongue: boolean }

/** 一击 'flute'：n 可以指定几个音（不给是三到七个）；far（即 dist）远近；pitch 整句移高移低 */
export function fluteShot(v: Voice): number {
  const c = v.ctx, e = v.e, t = v.t, a = 0.12 * (0.5 + 0.7 * v.vel), p = v.pitch;
  // —— 编一句 ——
  const n = clamp(Math.round(v.raw.n ?? 3 + Math.floor(rand(0, 5))), 2, 9), seq: Tone[] = [];
  let idx = pick([2, 3, 4, 4, 5]);
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    if (i > 0) idx = clamp(idx + pick([-2, -1, -1, 1, 1, 2]), 0, NOTES.length - 1);
    if (last) idx = HOME.reduce((x, y) => (Math.abs(y - idx) < Math.abs(x - idx) ? y : x));
    const len = last ? rand(0.9, 1.5) : Math.random() < 0.25 ? rand(0.45, 0.75) : rand(0.16, 0.3), orn = Math.random();
    seq.push({ f: NOTES[idx] * p, len, grace: i > 0 && orn < 0.25 ? NOTES[Math.min(NOTES.length - 1, idx + 1)] * p : undefined, slide: i > 0 && orn > 0.8, tongue: i === 0 || Math.random() < 0.35 });
  }
  if (!seq.some((s) => s.grace || s.slide)) { const s = seq[Math.min(seq.length - 1, 1 + Math.floor(rand(0, seq.length - 1)))]; if (Math.random() < 0.5) s.slide = true; else s.grace = s.f * 1.122; }
  const total = seq.reduce((x, s) => x + s.len, 0) + 0.03;

  // —— 吹 ——
  const osc = c.createOscillator(), amp = c.createGain();
  osc.setPeriodicWave(e.wave('flute', [1, 0.2, 0.07, 0.025]));
  amp.gain.setValueAtTime(0, t);
  // 气声：粉噪声过一条跟着音高走的带通（在二倍音上下），外加高处的一点「嘶」
  const noise = e.noiseSrc('pink', t, total + 0.6), nf = c.createBiquadFilter(), ng = c.createGain(), hf = c.createBiquadFilter(), hg = c.createGain();
  nf.type = 'bandpass'; nf.Q.value = 1.6; nf.frequency.setValueAtTime(seq[0].f * 2, t);
  hf.type = 'highpass'; hf.frequency.value = 2600; hg.gain.value = 0.22;
  ng.gain.setValueAtTime(0, t);
  noise.connect(nf); nf.connect(ng); noise.connect(hf); hf.connect(hg); hg.connect(ng); ng.connect(v.out);
  // 揉
  const lfo = c.createOscillator(), dp = c.createGain();
  lfo.frequency.value = rand(4.6, 5.4);
  dp.gain.setValueAtTime(0, t);
  lfo.connect(dp); dp.connect(osc.detune);
  const F = osc.frequency;
  let at = t + 0.03, cur = seq[0].f;
  F.setValueAtTime(cur * 0.975, t);
  F.exponentialRampToValueAtTime(cur, at + 0.05);
  seq.forEach((s, i) => {
    const lvl = a * (i === seq.length - 1 ? 1 : rand(0.8, 1));
    if (i > 0) {
      // 守住前一个音，到这一刻才换
      F.setValueAtTime(cur, at - 0.005);
      if (s.grace) { F.exponentialRampToValueAtTime(s.grace, at + 0.015); F.setValueAtTime(s.grace, at + 0.055); F.exponentialRampToValueAtTime(s.f, at + 0.08); }
      else if (s.slide) { const from = cur < s.f && cur > s.f * 0.8 ? cur : s.f * 0.89; if (from !== cur) F.exponentialRampToValueAtTime(from, at + 0.012); F.exponentialRampToValueAtTime(s.f, at + 0.14); }
      else F.exponentialRampToValueAtTime(s.f, at + 0.03);
      cur = s.f;
    }
    if (s.tongue) {
      // 吐一下：音先收一收，气先到
      if (i > 0) amp.gain.setTargetAtTime(lvl * 0.2, at - 0.03, 0.01);
      ng.gain.setTargetAtTime(lvl * 2.2, at - 0.02, 0.008);
    }
    amp.gain.setTargetAtTime(lvl, at, 0.03);
    ng.gain.setTargetAtTime(lvl * 0.6, at + 0.03, 0.03);
    nf.frequency.setTargetAtTime(s.f * 2, at, 0.03);
    if (s.len > 0.4) {
      amp.gain.setTargetAtTime(lvl * 1.12, at + s.len * 0.3, s.len * 0.2);
      dp.gain.setTargetAtTime(rand(11, 19), at + 0.25, 0.12);
      dp.gain.setTargetAtTime(0, at + s.len - 0.05, 0.04);
    }
    at += s.len;
  });
  // 末音慢慢弱下去
  amp.gain.setTargetAtTime(0, at - 0.3, 0.13);
  ng.gain.setTargetAtTime(0, at - 0.25, 0.1);
  osc.connect(amp); amp.connect(v.out);
  osc.start(t); lfo.start(t);
  osc.stop(at + 0.7); lfo.stop(at + 0.7);
  return at - t + 0.6;
}
