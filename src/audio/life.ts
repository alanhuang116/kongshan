/**
 * 村里的动静，与几样「一直响着」的声音。
 *
 *   村（village） 鸡犬牛鸭——没有常驻的声音，只是到时候排一声：
 *                   清晨雄鸡一阵一阵地叫（近处一只，远处常有一只应它；离村远也听得见，只是远），白天偶尔一声；
 *                   母鸡、小鸡、鸭、麻雀、井上的辘轳要离村近了才听得见；犬白天隔一两分钟远远吠两声，夜里隔很久才有一回；
 *                   牛只在田边低低地哞一声（人得真到了田头），驴只在村里叫。远近都按 near.village（牛看 near.fields）算。
 *                   远处的、看不见是谁的那几样嗓子（牛哞、驴叫、羊咩）隔着回声听，像有人在呻吟——试玩的人说瘆人：
 *                   羊不再在这一层里叫（羊群自己在牧处叫，见 life/fauna/sheep.ts），牛、驴只在近处，刚进门的头一分半钟都不出。
 *   塾（school）  书声：一班孩子一句一句地念一篇课文（上句悬着、下句落下来），念完歇一歇，再念一遍或换一篇。
 *                 人声关着时（界面上默认如此）不念出声，只有翻书与先生的戒尺（见 recite.ts 的 lessonCue）。
 *   工（work）    修桥：锤几下、锯一阵、刨几下，中间歇手。
 *   这三层是「没人管的时候自己来」的：世界若自己放了同一种声音（audio.play('recite' / 'hammer' / 'rooster' …），
 *   层里就让开一阵（书声 10 秒、锤锯 30 秒、鸡鸣 45 秒、别的禽畜 30 秒），免得两头各念各的。远得听不见的不算。
 *   碓（mill）    水碓的水轮：一叶接一叶的泼水声，轮轴慢慢地吱呀。
 *   水（kettle）  茶炉上的一壶水：慢慢开，之后一直滚着（setLoop('kettle', 1)）。
 *   研墨、拉锯、犁地（inkstone / saw / plough）：把那一下一下接起来（setLoop）。
 */
import { Base } from './base';
import type { Engine, LayerBus } from './engine';
import { burst, creak, grain, hiss, wobble } from './kit';
import { LESSONS, makeCrew, recitePhrase, type Kid } from './recite';
import { roosterTime } from './scene';
import { kettleGraph } from './study';
import type { Loop, PlayOpts } from './types';
import { bubbleField, clamp, lerp, pick, rand } from './util';

// ———————————————————————————— 村 ————————————————————————————
type Animal = 'rooster' | 'hen' | 'chick' | 'duck' | 'dog' | 'ox' | 'sparrow' | 'bucket' | 'goat' | 'donkey' | 'peck' | 'clapper';
/** 世界自己刚放过（而且听得见）这种声音多久之内，层里就不排同一种（更梆隔得久：更夫走一圈要一阵子） */
const YIELD: Partial<Record<Animal, number>> = { rooster: 45, clapper: 240 };
export class Village extends Base {
  private next: Record<Animal, number>;
  /** 外头那一声鸡鸣（世界里看得见的那只、玩家醒来时听见的那一声）已经应过的时刻 */
  private answered: number;
  /** 观星时：远处的犬吠与更梆轮着来，下一回轮到哪一样 */
  private quiet: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.answered = e.heardAt('rooster');
    const calm = t < e.calmUntil, o = e.offline && !calm;
    this.next = {
      // 刚进门的头一分钟静一些：远处的鸡过一阵才叫
      rooster: t + (o ? rand(0.3, 1) : calm ? rand(15, 35) : rand(2, 12)), hen: t + (o ? rand(1, 3) : rand(3, 15)), chick: t + (o ? rand(2, 4) : rand(6, 25)), duck: t + (o ? rand(3, 6) : rand(10, 40)),
      dog: t + (o ? rand(4, 7) : rand(20, 90)), ox: t + (o ? rand(5, 8) : rand(30, 120)), sparrow: t + (o ? rand(6, 9) : rand(15, 60)), bucket: t + (o ? rand(7, 10) : rand(30, 100)),
      goat: t + (o ? rand(2, 6) : rand(20, 80)), donkey: t + (o ? rand(8, 14) : rand(60, 200)), peck: t + (o ? rand(1, 4) : rand(8, 30)), clapper: t + (o ? rand(3, 6) : rand(40, 160)),
    };
    this.quiet = t + (o ? rand(2, 5) : rand(15, 40));
  }
  /** 轮到某一样了：到时候做 fn，它返回下一回隔多久 */
  private due(k: Animal, from: number, to: number, fn: (t: number) => number) {
    while (this.next[k] < to) {
      const t = Math.max(from, this.next[k]);
      // 世界自己刚放过这种声音（那只看得见的鸡、那条看得见的狗在叫），这里就让一让，过一阵再说
      if (this.e.since(k) < (YIELD[k] ?? 30)) { this.next[k] = t + rand(10, 20); continue; }
      this.next[k] = t + fn(t);
    }
  }
  schedule(from: number, to: number) {
    const s = this.e.scene, v = s.near.village, day = s.day, warm = s.season === 'spring' || s.season === 'summer';
    // 刚进门的头一分半钟：远处的大牲口（牛、驴）都不出声
    const settling = from < this.e.calmUntil + 30;
    // 离村越近越清楚：跟前是 0.1，离村很远的地方（桃林、自家院里）是 0.8 上下——远，但清晨的鸡鸣还听得真
    const far = (jitter = 0.06) => clamp(0.82 - 0.72 * v + rand(-jitter, jitter), 0.06, 0.9);
    const pan = () => rand(-0.7, 0.7);
    // 外头刚有一声鸡鸣：远处另一只有时应它（层里自己的鸡这时是让着的，应声还得有）
    const crow = this.e.heardAt('rooster');
    if (crow > this.answered) {
      this.answered = crow;
      if (crow > from - 1.5 && s.rain < 0.5 && Math.random() < 0.55) this.say('rooster', Math.max(from, crow + rand(2.8, 5)), { vel: rand(0.45, 0.7), dist: rand(0.74, 0.92), pan: pan(), rate: pick([0.91, 1.09]) * rand(0.97, 1.03) });
    }
    this.due('rooster', from, to, (t) => {
      const rt = roosterTime(s);
      if (rt > 0.05 || (day > 0.8 && s.rain < 0.3 && Math.random() < 0.5)) {
        const dist = far(), p = rand(0.94, 1.07);
        this.say('rooster', t, { vel: rand(0.55, 0.85), dist, pan: pan(), rate: p });
        // 远处另一只应它
        if (Math.random() < (rt > 0.05 ? 0.6 : 0.25)) this.say('rooster', t + rand(2.6, 5), { vel: rand(0.45, 0.7), dist: Math.min(0.95, dist + rand(0.2, 0.4)), pan: pan(), rate: p * pick([0.91, 1.09]) });
      }
      return rt > 0.05 ? rand(14, 40) / (0.4 + 0.6 * rt) : rand(140, 420);
    });
    this.due('hen', from, to, (t) => {
      if (v > 0.15 && day > 0.5) this.say('hen', t, { vel: rand(0.3, 0.6), dist: clamp(0.78 - 0.68 * v + rand(0, 0.15)), pan: pan(), variant: Math.random() < 0.1 ? 'egg' : undefined });
      return rand(8, 26) / (0.5 + v);
    });
    this.due('chick', from, to, (t) => {
      if (warm && v > 0.35 && day > 0.5 && s.rain < 0.4) this.say('chick', t, { vel: rand(0.3, 0.6), dist: clamp(0.7 - 0.6 * v + rand(0, 0.15)), pan: pan() });
      return rand(12, 40);
    });
    this.due('duck', from, to, (t) => {
      if (v > 0.2 && day > 0.5 && s.season !== 'winter') this.say('duck', t, { vel: rand(0.3, 0.55), dist: clamp(0.8 - 0.6 * v + rand(0, 0.15)), pan: pan() });
      return rand(25, 70);
    });
    // 观星：夜静下来，只偶尔远处一声犬吠、一阵更梆（两样轮着来，半分钟到一分多钟一回）
    const stars = s.focus === 'stars' && s.night > 0.5;
    while (stars && this.quiet < to) {
      const t = Math.max(from, this.quiet);
      if (Math.random() < 0.55) { if (this.e.since('dog') > 20) this.say('dog', t, { vel: rand(0.4, 0.6), dist: rand(0.82, 0.95), pan: pan(), variant: 'bark' }); }
      else if (this.e.since('clapper') > 60) this.say('clapper', t, { vel: rand(0.5, 0.7), dist: rand(0.8, 0.93), pan: pan() });
      this.quiet = t + rand(32, 75);
    }
    if (!stars && this.quiet < from) this.quiet = from + rand(10, 25);
    this.due('dog', from, to, (t) => {
      // 白天隔一两分钟远远两声；夜里隔很久才有一回，更远
      const night = s.night > 0.6;
      if (s.rain < 0.6 && !stars) this.say('dog', t, { vel: rand(0.4, 0.7), dist: night ? rand(0.75, 0.93) : clamp(far(0.12) + 0.1, 0.4, 0.93), pan: pan() });
      return night ? rand(150, 400) : rand(70, 200);
    });
    this.due('clapper', from, to, (t) => {
      // 夜里更夫打更：远远的一阵梆子（敲几下看是第几更），隔几分钟才过来一回
      if (s.night > 0.75 && s.rain < 0.5 && !stars) this.say('clapper', t, { vel: rand(0.45, 0.7), dist: clamp(rand(0.72, 0.92) - 0.2 * v, 0.5, 0.93), pan: pan() });
      return rand(180, 420);
    });
    // （羊不在这一层里叫了：羊群在牧处自己叫，人走到跟前才听见）
    this.due('donkey', from, to, (t) => {
      // 驴：难得叫一回，人在村里才听得见（远远隔着回声的一声驴叫，像人哭）
      if (v > 0.45 && day > 0.6 && s.rain < 0.3 && !settling) this.say('donkey', t, { vel: rand(0.4, 0.6), dist: clamp(far(0.08) + 0.08, 0.3, 0.7), pan: pan() });
      return rand(200, 480);
    });
    this.due('peck', from, to, (t) => {
      // 母鸡在院里啄食：要走到邻家跟前才听得见
      if (v > 0.6 && day > 0.6 && s.rain < 0.3) this.say('peck', t, { vel: rand(0.3, 0.5), dist: clamp(1.15 - v + rand(0, 0.1), 0.05, 0.6), pan: pan() });
      return rand(12, 35);
    });
    this.due('ox', from, to, (t) => {
      // 牛：人到了田头才听得见，不远（远处隔着回声的一声长哞像人在呻吟）；多半只是喷一口气
      const near = s.near.fields;
      if (near > 0.6 && day > 0.6 && !settling) this.say('ox', t, { vel: rand(0.35, 0.55), dist: clamp(0.72 - 0.4 * near + rand(-0.05, 0.05), 0.25, 0.6), pan: pan(), variant: Math.random() < 0.45 ? 'breath' : undefined });
      return rand(180, 420);
    });
    this.due('sparrow', from, to, (t) => {
      if (v > 0.3 && day > 0.6 && s.rain < 0.3) this.say('sparrow', t, { vel: rand(0.35, 0.6), dist: clamp(0.6 - 0.5 * v + rand(0, 0.2)), pan: pan() });
      return rand(30, 90);
    });
    this.due('bucket', from, to, (t) => {
      // 早晚有人到井上打水
      if (v > 0.3 && day > 0.5 && Math.max(s.dawn, s.dusk) > 0.2 && s.rain < 0.3) this.say('bucket', t, { vel: rand(0.35, 0.55), dist: clamp(0.75 - 0.55 * v + rand(0, 0.1)), pan: pan(), variant: 'well' });
      return rand(60, 150);
    });
  }
}

// ———————————————————————————— 塾 ————————————————————————————
export class School extends Base {
  private far: BiquadFilterNode;
  private crew: Kid[] = makeCrew(Math.random() < 0.5 ? 4 : 5);
  private pitch = rand(1.02, 1.12);
  private beat = rand(0.3, 0.34);
  private lesson = Math.floor(rand(0, LESSONS.length));
  private line = 0;
  private reps = 0;
  private next: number;
  /** 人声关着时：下一回翻书、下一回戒尺 */
  private page: number;
  private ruler: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    // 隔着村塾的墙、隔着一段路：高处被吃掉；回声少（送多了像空屋子里有人在念）
    this.far = this.filter('lowpass', 2000, 0.5);
    const dry = this.slow(0.8), wet = this.slow(0.14);
    this.far.connect(dry); dry.connect(bus.dry);
    this.far.connect(wet); wet.connect(bus.open);
    this.next = t + (e.offline ? 0.2 : rand(0.5, 2.5));
    this.page = t + (e.offline ? 0.5 : rand(2, 8));
    this.ruler = t + (e.offline ? 2 : rand(10, 30));
    this.scene(t);
  }
  scene(t: number) {
    // 远远的只听得见起伏与节奏；走到门口字头才清楚一点
    this.far.frequency.setTargetAtTime(lerp(850, 2300, Math.pow(this.e.scene.near.school, 1.2)), t, 0.6);
  }
  schedule(from: number, to: number) {
    // 人声关着：不念出声，只有一堂课的几样小动静（隔十来二十秒翻一页书，隔半分钟到一分多钟先生的戒尺嗒一两下）
    if (this.e.voiceLevel <= 0.001) {
      const dist = clamp(0.75 - 0.6 * this.e.scene.near.school, 0.1, 0.8), quiet = this.e.since('recite') < 10;
      while (this.page < to) { const t = Math.max(from, this.page); if (!quiet) this.say('page', t, { vel: rand(0.4, 0.6), dist, pan: rand(-0.3, 0.3) }, this.far); this.page = t + rand(9, 20); }
      while (this.ruler < to) { const t = Math.max(from, this.ruler); if (!quiet) this.say('wood', t, { vel: rand(0.45, 0.65), dist, variant: 'ruler' }, this.far); this.ruler = t + rand(35, 80); }
      if (this.next < to) this.next = to;
      return;
    }
    while (this.next < to) {
      const t = Math.max(from, this.next), text = LESSONS[this.lesson], last = this.line >= text.length - 1;
      // 世界自己在放书声（村塾里的孩子跟着动画念），这里就不再念
      if (this.e.since('recite') < 10) { this.next = t + 2; continue; }
      // 单数句悬着，双数句落下来；一篇的末一句一定落下来
      const r = recitePhrase(this.e, this.far, t, { syl: text[this.line], crew: this.crew, pitch: this.pitch, beat: this.beat * rand(0.97, 1.03), close: last || this.line % 2 ? 'down' : 'up' });
      r.out.gain.value *= this.e.voiceLevel;
      this.later(t + r.dur, () => r.out.disconnect());
      this.next = t + r.dur + rand(0.05, 0.3);
      this.line++;
      if (last) {
        // 一篇念完：歇一歇（先生在讲、在翻书），再念一遍，或换一篇
        this.line = 0;
        this.next += rand(2.5, 6);
        if (++this.reps >= 2 || Math.random() < 0.4) { this.reps = 0; this.lesson = (this.lesson + 1 + Math.floor(rand(0, LESSONS.length - 1))) % LESSONS.length; }
      }
    }
  }
}

// ———————————————————————————— 工 ————————————————————————————
export class Work extends Base {
  private far: BiquadFilterNode;
  private open: GainNode;
  private next: number;
  private side = rand(-0.2, 0.2);
  private todo: Array<{ at: number; shot: 'hammer' | 'saw' | 'plane'; opts: PlayOpts }> = [];
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.far = this.filter('lowpass', 6000, 0.5);
    this.far.connect(bus.dry);
    this.open = this.slow(1);
    this.open.connect(bus.open);
    this.next = t + (e.offline ? 0.3 : rand(1, 5));
    this.scene(t);
  }
  scene(t: number) {
    this.far.frequency.setTargetAtTime(lerp(1600, 9000, Math.pow(this.e.scene.near.work, 1.3)), t, 0.6);
  }
  /** 排一阵活：把这一阵里每一下的时刻、力度先想好（声音到点才建，不一口气建几十个） */
  private plan(t: number): number {
    const what = pick(['hammer', 'hammer', 'saw', 'saw', 'plane'] as const);
    if (what === 'hammer') {
      // 一阵锤：三到八下，末了两下常常赶得紧一些
      const n = 3 + Math.floor(rand(0, 6)), gap = rand(0.62, 0.8);
      for (let i = 0; i < n; i++) { this.todo.push({ at: t, shot: 'hammer', opts: { vel: rand(0.5, 0.85), pan: this.side + rand(-0.05, 0.05) } }); t += gap * (i >= n - 2 ? rand(0.55, 0.8) : rand(0.92, 1.1)); }
    } else if (what === 'saw') {
      // 一阵锯：一推一拉，十几二十下
      for (let i = 0, n = 10 + Math.floor(rand(0, 15)); i < n; i++) { const push = i % 2 === 0, d = push ? rand(0.38, 0.46) : rand(0.32, 0.4); this.todo.push({ at: t, shot: 'saw', opts: { vel: rand(0.5, 0.75), variant: push ? 'push' : 'pull', dur: d, pan: this.side } }); t += d + rand(0.04, 0.1); }
    } else {
      for (let i = 0, n = 3 + Math.floor(rand(0, 5)); i < n; i++) { const d = rand(0.55, 0.85); this.todo.push({ at: t, shot: 'plane', opts: { vel: rand(0.45, 0.7), dur: d, pan: this.side } }); t += d + rand(0.5, 0.8); }
    }
    return t;
  }
  schedule(from: number, to: number) {
    const mix = { dry: 1, hall: 0, open: 0.25 }, route = { dry: this.far, open: this.open };
    for (;;) {
      if (!this.todo.length) {
        if (this.next >= to) break;
        // 歇够了：再排一阵，排完歇手
        this.next = this.plan(Math.max(from, this.next)) + rand(4, 14);
      }
      if (this.todo[0].at >= to) break;
      const x = this.todo.shift()!;
      // 世界自己在放锤锯声（匠人的动画跟着的），这里就不再排
      // （匠人刨完了要走到桥上去钉，中间十来秒没有声音——让得久一些，免得他走着路这里却敲起来）
      if (this.e.since('hammer', 'saw', 'plane') < 30) { this.todo.length = 0; this.next = Math.max(this.next, x.at + 3); continue; }
      this.e.voice(x.shot, x.opts, Math.max(from, x.at), route, mix, true);
    }
  }
}

// ———————————————————————————— 碓 ————————————————————————————
/**
 * 水碓的水轮：槽里的水一叶接一叶泼在轮叶上（哗——、哗——，约一秒一叶），轮轴慢慢地吱呀；底下是水落下去的一片。
 * 碓头砸下去的那一声不在这里（世界跟着它的动画去叫 millThump）。走近了水声才亮。
 */
export class Mill extends Base {
  private tone: BiquadFilterNode;
  private period = rand(0.95, 1.25);
  private nextPaddle: number;
  private nextCreak: number;
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    this.tone = this.filter('lowpass', 6000, 0.5);
    const out = this.slow(1);
    this.tone.connect(out); out.connect(bus.dry);
    // 槽里的水：持续的一片
    const white = this.noise('white', t), f1 = this.filter('bandpass', 1500, 0.7), g1 = this.slow(0.07);
    white.connect(f1); f1.connect(g1); g1.connect(this.tone);
    this.roam(g1.gain, 0.05, 0.09, [0.2, 0.6], [0.08, 0.2], t);
    // 水落下去的低处
    const brown = this.noise('brown', t), lf = this.filter('lowpass', 420, 0.5), lh = this.filter('highpass', 110, 0.6), lg = this.slow(0.1);
    brown.connect(lf); lf.connect(lh); lh.connect(lg); lg.connect(this.tone);
    // 水泡（与溪共用那一片）
    const field = e.cached('bubbles-brook', () => bubbleField(e.ctx, { seconds: 7.3, rate: 42, fLo: 800, fHi: 6500, q: 16, lowBias: 1 }));
    const bs = this.src(e.loopSrc(field, t, 0.88)), bg = this.slow(0.12);
    bs.connect(bg); bg.connect(this.tone);
    this.nextPaddle = t + rand(0.2, 0.8);
    this.nextCreak = t + rand(0.5, 2);
    this.scene(t);
  }
  scene(t: number) {
    this.tone.frequency.setTargetAtTime(lerp(1200, 7000, Math.pow(this.e.scene.near.mill, 1.3)), t, 0.6);
  }
  schedule(from: number, to: number) {
    this.roamTo(from, to);
    while (this.nextPaddle < to) {
      // 一叶水泼下来：一口有颗粒的「哗」，底下一闷
      const t = Math.max(from, this.nextPaddle), v = this.mini(t, 1.2, { pan: rand(-0.25, 0.25), dest: this.tone }), d = rand(0.5, 0.7);
      hiss(v, { dur: d, f: rand(1400, 2000), fMid: 2400, f2: 1100, q: 0.7, curve: wobble(14, rand(0.22, 0.34), 0.3, 0.12), dest: grain(v, t, d + 0.1, 0.6, 0.4, 0.5) });
      burst(v, { t: t + 0.08, dur: 0.3, f: 320, q: 0.8, amp: rand(0.35, 0.55), att: 0.08, noise: 'pink' });
      this.nextPaddle = t + this.period * rand(0.94, 1.07);
    }
    while (this.nextCreak < to) {
      // 轮轴吱呀：隔三四秒一声，低而慢，一扬或一落
      const t = Math.max(from, this.nextCreak), v = this.mini(t, 1.8, { pan: rand(-0.2, 0.2), dest: this.tone }), up = Math.random() < 0.6;
      creak(v, { dur: rand(0.6, 1), rate: up ? [rand(16, 22), rand(24, 32)] : [rand(24, 30), rand(15, 20)], res: [[rand(240, 300), 8, 1], [rand(560, 680), 10, 0.5], [1300, 9, 0.15]], amp: rand(0.18, 0.28), jitter: 240, scrape: 0.3 });
      this.nextCreak = t + rand(2.6, 4.2);
    }
  }
}

// ———————————————————————————— 一直响着的 ————————————————————————————
/** 茶炉上的一壶水：坐上去二十几秒后滚开，之后一直滚着；关掉（setLoop('kettle', 0)）再开是重新烧 */
export class Kettle extends Base {
  constructor(e: Engine, bus: LayerBus, t: number) {
    super(e, bus);
    const g = kettleGraph(e, t, e.offline ? 6 : 24);
    for (const n of g.nodes) this.keep(n);
    for (const s of g.srcs) this.src(s);
    g.out.connect(bus.dry);
    const room = this.slow(0.15);
    g.out.connect(room); room.connect(bus.hall);
  }
  schedule() { /* 一直响着，没有要排的 */ }
}
/** 把一下一下接起来：研墨是一圈接一圈，拉锯是一推一拉，犁地是一段接一段 */
export class Repeat extends Base {
  private next: number;
  private push = true;
  constructor(e: Engine, bus: LayerBus, t: number, private kind: Extract<Loop, 'inkstone' | 'saw' | 'plough'>) {
    super(e, bus);
    this.next = t + 0.02;
  }
  schedule(from: number, to: number) {
    const route = { dry: this.bus.dry, open: this.bus.open, room: this.bus.hall };
    while (this.next < to) {
      const t = Math.max(from, this.next);
      if (this.kind === 'inkstone') {
        const d = rand(0.95, 1.2);
        this.e.voice('inkstone', { vel: rand(0.55, 0.7), dur: d }, t, route, { dry: 1, hall: 0, open: 0, room: 0.12 });
        this.next = t + d * 0.94;
      } else if (this.kind === 'saw') {
        const d = this.push ? rand(0.38, 0.46) : rand(0.32, 0.4);
        this.e.voice('saw', { vel: rand(0.55, 0.75), variant: this.push ? 'push' : 'pull', dur: d }, t, route, { dry: 1, hall: 0, open: 0.15 });
        this.push = !this.push;
        this.next = t + d + rand(0.04, 0.1);
      } else {
        const d = rand(2.6, 3.4);
        this.e.voice('plough', { vel: rand(0.5, 0.7), dur: d }, t, route, { dry: 1, hall: 0, open: 0.12 });
        this.next = t + d * 0.84;
      }
    }
  }
}
