/**
 * 书声：村塾里一班孩子齐声念书，隔着一段路听。
 *
 * 要像、要可爱、不要瘆人，靠的是这几样：
 *   调子——孩子念书是「唱读」：每字一拍，在三四个音上高高低低（徵、角为主，上到羽，句末落到角或商），
 *          一句的末一个字拖长；上句悬着（落在徵、羽），下句落下来（落在角、商）。用的是 G 宫五声，明亮，不用小调；
 *   不齐——三到五个孩子各有各的脾性：有人总抢半拍，有人总慢一点；各自偏高偏低二三十音分，音高上一直不规则地晃；收尾也不是一刀切；
 *   字——  按真的课文的读音走（《千字文》《论语》《诗经》、程颢与孟浩然的诗）：字头按声母给一个凹陷，
 *          咝音里加一小段噪声，韵母里的元音依次滑过去，鼻韵尾把口腔收小；每个字还带着它的声调——
 *          阳平往上挑、上声一沉、去声往下落（唱读里声调是收着的，只有说话时的六七成）。听不清字，听得出「在念书」；
 *   嗓子——每个孩子是一个锯齿波，起字时音高从下面一点滑上来（说话都这样），分两拨各过一组孩子的共振峰（比大人高两三成）。
 * 字音不求可懂。远近不在这里管（村塾那一层自己有一道低通；一击则由引擎按 dist 处理）。
 */
import type { Engine, Voice } from './engine';
import { parseSyllable, type Syllable, type Vowel } from './xinjing';
import { cents, clamp, pick, rand } from './util';

/** 课文（拼音带声调 1–4；一行一句）。都是邵雍那时候村塾里念得到的 */
const TEXTS: string[][] = [
  // 《千字文》
  ['tian1 di4 xuan2 huang2', 'yu3 zhou4 hong2 huang1', 'ri4 yue4 ying2 ze4', 'chen2 xiu4 lie4 zhang1', 'han2 lai2 shu3 wang3', 'qiu1 shou1 dong1 cang2', 'run4 yu2 cheng2 sui4', 'lv4 lv3 tiao2 yang2'],
  // 《论语·学而》
  ['zi3 yue1 xue2 er2 shi2 xi2 zhi1', 'bu2 yi4 yue4 hu1', 'you3 peng2 zi4 yuan3 fang1 lai2', 'bu2 yi4 le4 hu1', 'ren2 bu4 zhi1 er2 bu2 yun4', 'bu2 yi4 jun1 zi3 hu1'],
  // 《诗经·关雎》
  ['guan1 guan1 ju1 jiu1', 'zai4 he2 zhi1 zhou1', 'yao3 tiao3 shu1 nv3', 'jun1 zi3 hao3 qiu2'],
  // 孟浩然《春晓》
  ['chun1 mian2 bu4 jue2 xiao3', 'chu4 chu4 wen2 ti2 niao3', 'ye4 lai2 feng1 yu3 sheng1', 'hua1 luo4 zhi1 duo1 shao3'],
  // 程颢《春日偶成》（邵雍的邻居）
  ['yun2 dan4 feng1 qing1 jin4 wu3 tian1', 'bang4 hua1 sui2 liu3 guo4 qian2 chuan1', 'shi2 ren2 bu4 shi2 yu2 xin1 le4', 'jiang1 wei4 tou1 xian2 xue2 shao4 nian2'],
];
/** 一个字：读音，加声调（1 阴平、2 阳平、3 上声、4 去声） */
export type Word = Syllable & { tone: number };
export const LESSONS: Word[][][] = TEXTS.map((t) => t.map((p) => p.split(' ').map((w) => ({ ...parseSyllable(w.replace(/\d$/, '')), tone: Number(/\d$/.exec(w)?.[0] ?? 1) }))));

/** 孩子的共振峰（Hz）：F1 F2 F3 */
const KID_F: Record<Vowel, [number, number, number]> = {
  a: [1000, 1500, 3100], o: [650, 1050, 3000], e: [620, 1500, 3050], E: [640, 2300, 3200],
  i: [370, 2800, 3500], y: [460, 1750, 3150], u: [430, 900, 2900], v: [370, 2300, 2800],
};
/** 先生（大人）的 */
const MAN_F: Record<Vowel, [number, number, number]> = {
  a: [760, 1180, 2500], o: [540, 880, 2500], e: [500, 1150, 2500], E: [520, 1800, 2500],
  i: [290, 2200, 3000], y: [380, 1400, 2600], u: [340, 720, 2400], v: [290, 1900, 2300],
};
/** 调子用的几个音：商 A3、角 B3、徵 D4、羽 E4、高处的宫 G4 */
const DEG: Record<string, number> = { R: 220, M: 246.94, S: 293.66, L: 329.63, H: 392 };
/** 各种字数的句子怎么走：up 是上句（悬着），down 是下句（落下来） */
const TUNES: Record<number, { up: string[]; down: string[] }> = {
  4: { up: ['SSMS', 'SMSL', 'MSSL'], down: ['SSMM', 'LSMR', 'SMSM', 'SLSM'] },
  5: { up: ['SSMSS', 'SMSSL', 'MMSLS'], down: ['SSMSM', 'LSSMR', 'SLSMM'] },
  6: { up: ['SSMSSL', 'SMSMSS'], down: ['SSMSMM', 'LLSSMR'] },
  7: { up: ['SSMMSLS', 'SMSSMSL'], down: ['SSMMLSM', 'LSSMSMR'] },
};
function tune(n: number, close: 'up' | 'down'): string {
  const t = TUNES[n];
  if (t) return pick(t[close]);
  let s = '';
  for (let i = 0; i < n - 1; i++) s += Math.random() < 0.6 ? 'S' : Math.random() < 0.6 ? 'M' : 'L';
  return s + (close === 'up' ? pick(['S', 'L']) : pick(['M', 'R']));
}

/** 一个孩子的脾性 */
export interface Kid { /** 总是早（负）或晚多少秒 */ lag: number; /** 偏高偏低多少音分 */ detune: number; level: number; /** 归哪一拨共振峰 */ bank: number; /** 收尾早晚 */ rel: number }
export function makeCrew(n: number): Kid[] {
  const out: Kid[] = [];
  for (let i = 0, m = clamp(Math.round(n), 1, 6); i < m; i++) {
    // 头一个总抢一点，第三个总慢半拍，其余的差不多齐
    out.push({ lag: i === 0 ? -0.01 : i === 2 ? rand(0.03, 0.045) : rand(0, 0.028), detune: i === 1 ? rand(25, 50) : rand(-35, 30), level: rand(0.7, 1), bank: i % 2, rel: rand(-0.05, 0.06) });
  }
  return out;
}
/** 从课文里取一句 n 个字的（没有正好的就取最接近的） */
export function pickPhrase(n?: number): Word[] {
  const all = LESSONS.flat();
  if (n == null) return pick(all);
  const want = clamp(Math.round(n), 4, 7), fit = all.filter((p) => p.length === want);
  return pick(fit.length ? fit : all);
}

export interface ReciteO {
  /** 这一句的字；不给就从课文里取一句 n 个字的 */
  syl?: Word[];
  n?: number;
  /** 几个孩子（3–5，默认 4）；或者直接给一班人（同一班人念下去才像同一个学堂） */
  voices?: number;
  crew?: Kid[];
  /** 上句还是下句 */
  close?: 'up' | 'down';
  /** 每个字多长（秒，默认 0.3–0.35） */
  beat?: number;
  pitch?: number;
  vel?: number;
  /** 先生领读：一个大人的声音，低一个八度，慢一点 */
  lead?: boolean;
}
/** 念一句。返回这一句多长（秒）与出口（用完可以断开） */
export function recitePhrase(e: Engine, dest: AudioNode, t: number, o: ReciteO = {}): { dur: number; out: GainNode } {
  const c = e.ctx, syl = o.syl ?? pickPhrase(o.n), n = syl.length, lead = !!o.lead;
  const beat = (o.beat ?? rand(0.3, 0.35)) * (lead ? 1.12 : 1), FT = lead ? MAN_F : KID_F;
  const crew: Kid[] = lead ? [{ lag: 0, detune: rand(-10, 10), level: 1.5, bank: 0, rel: 0 }] : o.crew ?? makeCrew(o.voices ?? 4);
  const close = o.close ?? (Math.random() < 0.5 ? 'up' : 'down'), tones = tune(n, close), pitch = (o.pitch ?? 1) * (lead ? 0.5 : 1);
  // 每个字起在哪：一字一拍；七言在第四字后、六言在第三字后略顿；末一个字拖长
  const on: number[] = [];
  let x = 0.07;
  for (let i = 0; i < n; i++) { on.push(x); x += beat * (n === 7 && i === 3 ? 1.35 : n === 6 && i === 2 ? 1.2 : 1); }
  const lastLen = beat * rand(2.0, 2.5), end = on[n - 1] + lastLen;
  const lenOf = (i: number) => (i === n - 1 ? lastLen : on[i + 1] - on[i]);
  const out = c.createGain();
  out.gain.value = 0.17 * (0.5 + 0.7 * clamp(o.vel ?? 0.7));
  out.connect(dest);

  // 两拨共振峰（人有高矮）；第二拨的口型晚二十毫秒
  const banks = [0, 1].map((b) => {
    const kf = lead ? 1 : b ? 1.07 : 0.96, lag = b ? 0.022 : 0;
    const input = c.createBiquadFilter(), amp = c.createGain();
    input.type = 'lowpass'; input.frequency.value = lead ? 2000 : 2400; input.Q.value = 0.5;
    amp.gain.value = 1;
    const fs: BiquadFilterNode[] = [];
    let f2g = amp;
    ([[620, 6, 1], [1500, 9, -0.6], [3050, 12, 0.3]] as const).forEach(([f, q, g], k) => {
      const bp = c.createBiquadFilter(), fg = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = f * kf; bp.Q.value = q; fg.gain.value = g;
      input.connect(bp); bp.connect(fg); fg.connect(amp);
      fs.push(bp);
      if (k === 1) f2g = fg;
    });
    // 一点直通的声音，免得太「瓮」
    const dg = c.createGain();
    dg.gain.value = 0.06;
    input.connect(dg); dg.connect(amp);
    amp.connect(out);
    syl.forEach((s, i) => {
      const T = t + on[i] + lag, len = Math.min(lenOf(i), beat * 1.3), nv = s.vowels.length;
      f2g.gain.setTargetAtTime(-0.6, T - 0.03, 0.02);
      s.vowels.forEach((vw, k) => {
        const at = k === 0 ? T - 0.03 : T + len * (nv === 2 ? 0.42 : k === 1 ? 0.28 : 0.6), F = FT[vw];
        for (let j = 0; j < 3; j++) fs[j].frequency.setTargetAtTime(F[j] * kf, at, k === 0 ? 0.018 : 0.045);
      });
      if (s.nasal) {
        const at = T + len * 0.66;
        fs[0].frequency.setTargetAtTime((lead ? 270 : 330) * kf, at, 0.05);
        f2g.gain.setTargetAtTime(-0.2, at, 0.05);
      }
    });
    return input;
  });

  // 每个孩子一个声源
  for (const kid of crew) {
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sawtooth';
    g.gain.setValueAtTime(0, t);
    const f0 = DEG[tones[0]] * pitch * cents(kid.detune);
    osc.frequency.setValueAtTime(f0 * 0.96, t);
    syl.forEach((s, i) => {
      const ton = t + on[i] + kid.lag + rand(-0.008, 0.008), f = DEG[tones[i]] * pitch * cents(kid.detune + rand(-18, 18));
      const lead2 = s.onset === 'v' ? 0.03 : s.onset === 'n' ? 0.045 : s.onset === 'p' ? 0.05 : s.onset === 'P' ? 0.06 : 0.075;
      const dip = s.onset === 'v' ? 0.55 : s.onset === 'n' ? 0.3 : s.onset === 'h' ? 0.18 : s.onset === 's' ? 0.08 : 0.03;
      const lvl = kid.level * (i === 0 || i === n - 1 ? 1 : rand(0.82, 1));
      // 起字：音高从下面一点滑上来
      osc.frequency.setTargetAtTime(f * 0.972, ton - 0.02, 0.012);
      osc.frequency.setTargetAtTime(f, ton + 0.01, 0.03);
      // 声调：在这个音上小小地扬、沉、落（唱读里是收着的；各人收的多少不一样）。
      // 嗓子不是机器：每个目标上再加十来音分的随机偏差，字里另排一两个小目标——音高一直不规则地晃着
      //（几个人合起来才不会拍出规则的「嗡嗡」），而且不必为每个孩子另建调制的节点
      const L = Math.min(lenOf(i), beat * 1.3), k = rand(0.55, 0.85), dt = osc.detune, w = () => rand(-14, 14);
      let rest = 0;
      if (s.tone === 2) { rest = 70 * k; dt.setTargetAtTime(-90 * k, ton - 0.03, 0.02); dt.setTargetAtTime(rest + w(), ton + 0.25 * L, 0.3 * L); }
      else if (s.tone === 3) { rest = -40 * k; dt.setTargetAtTime(-60 * k, ton - 0.03, 0.02); dt.setTargetAtTime(-190 * k + w(), ton + 0.15 * L, 0.2 * L); dt.setTargetAtTime(rest + w(), ton + 0.6 * L, 0.2 * L); }
      else if (s.tone === 4) { rest = -190 * k; dt.setTargetAtTime(100 * k, ton - 0.03, 0.02); dt.setTargetAtTime(rest + w(), ton + 0.2 * L, 0.3 * L); }
      else { dt.setTargetAtTime(w(), ton - 0.03, 0.03); dt.setTargetAtTime(w(), ton + 0.4 * L, 0.06); }
      dt.setTargetAtTime(rest + w(), ton + 0.8 * L, 0.06);
      // 拖长的末一个字：一直晃着
      if (i === n - 1) for (let x = L; x < lastLen; x += rand(0.14, 0.24)) dt.setTargetAtTime(rest + w(), ton + x, 0.07);
      if (i > 0) g.gain.setTargetAtTime(dip * lvl, ton - lead2 - 0.02, 0.012);
      g.gain.setTargetAtTime(lvl, ton, 0.025);
      g.gain.setTargetAtTime(lvl * 0.62, ton + 0.08, 0.09);
      if (i === n - 1) {
        // 拖腔：下句往下落，上句微微上扬；各人收得有早有晚
        if (close === 'down') osc.frequency.setTargetAtTime(f * cents(-170 + rand(-40, 40)), ton + lastLen * 0.35, lastLen * 0.22);
        else osc.frequency.setTargetAtTime(f * cents(50 + rand(-20, 20)), ton + lastLen * 0.5, lastLen * 0.2);
        g.gain.setTargetAtTime(0, ton + lastLen * 0.78 + kid.rel, 0.09);
      }
    });
    osc.connect(g); g.connect(banks[kid.bank % 2]);
    osc.start(t); osc.stop(t + end + 0.6);
  }

  // 咝音、送气音：字头那一小段噪声
  if (syl.some((s) => s.hiss > 0 && s.onset !== 'p')) {
    const noise = e.noiseSrc('white', t, end + 0.2), hf = c.createBiquadFilter(), hg = c.createGain();
    hf.type = 'bandpass'; hf.frequency.value = 4000; hf.Q.value = 1.2;
    hg.gain.setValueAtTime(0, t);
    syl.forEach((s, i) => {
      if (!(s.hiss > 0) || s.onset === 'p') return;
      const lead2 = s.onset === 'P' ? 0.06 : 0.075, T = t + on[i] + 0.012, start = T - lead2 + 0.005;
      const lvl = (s.onset === 's' || s.onset === 'c' ? 0.05 : s.onset === 'z' ? 0.035 : 0.02) * crew.length * 0.5;
      hf.frequency.setValueAtTime(s.hiss * (lead ? 1 : 1.1), Math.max(t, start - 0.004));
      hg.gain.setTargetAtTime(lvl, start, 0.008);
      hg.gain.setTargetAtTime(0, start + (s.onset === 'c' || s.onset === 's' ? lead2 : lead2 * 0.6) - 0.01, 0.01);
    });
    noise.connect(hf); hf.connect(hg); hg.connect(out);
  }
  return { dur: end + 0.4, out };
}

/**
 * 一堂课：接连地叫 recite（世界里领头的孩子每念一句叫一回，约两秒半一回）就是同一班孩子、同一个调门，
 * 顺着一篇课文一句一句往下念——单数句悬着、双数句落下来，一篇念完歇一歇，再念一遍或换一篇。
 * 上一句还没念完就等它念完；要等一秒半以上的那一回就不出声（世界下一回再叫）。隔了九秒没人叫，这堂课就散了，下回另起。
 */
interface Lesson { crew: Kid[]; pitch: number; beat: number; text: number; line: number; reps: number; until: number; last: number }
const CLASS = new WeakMap<Engine, Lesson>();
function lessonLine(v: Voice): number {
  let s = CLASS.get(v.e);
  if (!s || v.t - s.last > 9 || v.t < s.last - 1) {
    s = { crew: makeCrew(Math.random() < 0.5 ? 4 : 5), pitch: rand(1.02, 1.12), beat: rand(0.3, 0.34), text: Math.floor(rand(0, LESSONS.length)), line: 0, reps: 0, until: -Infinity, last: v.t };
    CLASS.set(v.e, s);
  }
  s.last = v.t;
  const start = Math.max(v.t, s.until);
  if (start - v.t > 1.5) return 0;
  const text = LESSONS[s.text], last = s.line >= text.length - 1;
  const r = recitePhrase(v.e, v.out, start, { syl: text[s.line], crew: s.crew, pitch: v.pitch * s.pitch, beat: s.beat * rand(0.97, 1.03), vel: v.vel, close: last || s.line % 2 ? 'down' : 'up' });
  // 末一个字的拖腔收住之后换一口气，下一句才起
  s.until = start + r.dur - 0.15;
  s.line++;
  if (last) {
    // 一篇念完：歇一歇（先生在讲、在翻书），再念一遍，或换一篇
    s.line = 0;
    s.until += rand(2.5, 5);
    if (++s.reps >= 2 || Math.random() < 0.4) { s.reps = 0; s.text = (s.text + 1 + Math.floor(rand(0, LESSONS.length - 1))) % LESSONS.length; }
  }
  return start - v.t + r.dur;
}

/**
 * 一击：念一句。什么都不另说（世界里就是这样叫的）——接着这堂课往下念一句，见上。
 * 说了 n（几个字，4–7）、voices（几个孩子，3–5）或 variant（'up' 上句 / 'down' 下句 / 'lead' 先生领一句、孩子跟一句）——单独的一句，每回另起。
 */
export function reciteShot(v: Voice): number {
  if (v.raw.n == null && v.raw.voices == null && v.raw.variant == null) return lessonLine(v);
  const o: ReciteO = { n: v.raw.n, voices: v.raw.voices, pitch: v.pitch * rand(1, 1.1), vel: v.vel };
  if (v.raw.variant === 'lead') {
    const syl = pickPhrase(v.raw.n), beat = rand(0.31, 0.35);
    const a = recitePhrase(v.e, v.out, v.t, { ...o, syl, beat, lead: true, close: 'up' });
    const b = recitePhrase(v.e, v.out, v.t + a.dur + 0.25, { ...o, syl, beat, close: 'up' });
    return a.dur + 0.25 + b.dur;
  }
  return recitePhrase(v.e, v.out, v.t, { ...o, close: v.raw.variant === 'up' ? 'up' : v.raw.variant === 'down' ? 'down' : undefined }).dur;
}
