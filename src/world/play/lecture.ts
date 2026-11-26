/**
 * 学堂讲卦：邵先生（安乐窝的主人，出门访友去了）按时回到村塾，讲一卦。
 *
 *   聚 —— 塾师敲两下，先生从村路东头走来，进村塾，坐到东头的高桌后面；三个孩子回到自己的席上；
 *          塾师让出高桌，到檐下坐着陪听。六领席，三领是孩子们的，余下三领来听的人抢：先要的得（同游时两边算出来的一样，见 study/seats.ts）。
 *          没抢到的在檐下站着听，也听得见，修为少长一点。
 *   讲 —— 六句：开讲、《说卦》、卦辞、大象、白话、收尾（study/lesson.ts；原文带出处，本应用的话不带）。
 *   问 —— 三题，各四选一；答得快多得几分。分数上「答题」榜，修为跟着长。
 *   散 —— 这一回谁答得好（同屋的人发来的分数、三个孩子），先生起身，从原路走了。
 * 什么时候讲（study/schedule.ts）：同游时按钟上的格（逢整十分，园中白天），一格一讲，谁算都一样，用不着发话；
 * 独游时白天走到村塾前就开讲，讲完歇三分钟。讲哪一卦：同游按格挨着讲；独游从乾讲起，讲过的跳过。
 *
 * 给做事那一路（acts/lecture.ts）用的是 lectureOf(k)：此刻讲到哪、各席谁坐着、自己坐在哪一席、这一回的分数。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { Figure } from '../avatar/figure';
import type { Look } from '../avatar/types';
import { getTogether } from '../net';
import { SITE } from '../site';
import { SCHOOL_Y, TEACHER, TEACHER_IN, atHouse, footY } from '../life/spots';
import { NOTES } from '../../data/lecture';
import { registerBoard, report } from './board';
import { addXiu, noteHeard, readXiu, startXiu } from './xiuwei';
import { lessonOf, nextCourse, scoreOf, type Lesson } from './study/lesson';
import { SOLO_IDLE_MS, SOLO_REST_MS, T, dayHour, durOf, groupLecture, nextGroup, phaseAt, type Phase } from './study/schedule';
import { quizMsg, readQuizMsg, readSeatMsg, resolveSeats, seatMsg, type Wish } from './study/seats';
import { SCHOOL } from './study/school';
import { mulberry32 } from '../core/rng';
import { clockAt } from '../env/months';

// —— 村塾里的几处（build/village.ts 的做法：两排矮桌，学童坐在桌西边的席上朝东；先生的高桌在东头） ——
const SC = SITE.houses.find((h) => h.id === 'school')!;
/** 屋里一点（村塾自己的坐标：lx 朝东、lz 朝前檐）→ 世界 */
const L = (lx: number, lz: number) => { const s = atHouse('school', lx, lz); return { x: s.x, z: s.z }; };
/** 世界 → 村塾自己的坐标（L 的反算） */
const local = (x: number, z: number) => { const c = Math.cos(SC.yaw), s = Math.sin(SC.yaw), dx = x - SC.x, dz = z - SC.z; return { lx: dx * c - dz * s, lz: dx * s + dz * c }; };
/** 席面比屋基高多少（屋里的地面 0.16，席 0.012） */
const MAT_TOP = SCHOOL_Y + 0.012;
/** 朝东（朝着先生） */
const FACE_EAST = SC.yaw + Math.PI / 2;
/**
 * 六领席：前排三领、后排三领，各在自己那张矮桌的西边（village.ts：桌 x = −2.7 + i·1.75 + 排·0.2，席在桌西 0.58）。
 * kid：那一席天天坐着谁（life/spots.ts 的 DESKS：三郎前排西、虎子前排东、石头后排当中）。
 * via：从檐下走到席边要经过的几点（矮桌之间的空当；村塾自己的坐标）——席间不走直线，免得穿过桌子、孩子。
 */
export const SEATS: Array<{ i: number; lx: number; lz: number; kid: string | null; via: Array<[number, number]> }> = [
  { i: 0, lx: -3.08, lz: 0.75, kid: 'kid1', via: [] },
  { i: 1, lx: -1.33, lz: 0.75, kid: null, via: [[-0.9, 3.35], [-0.9, 1.55], [-1.33, 1.42]] },
  { i: 2, lx: 0.42, lz: 0.75, kid: 'kid2', via: [] },
  { i: 3, lx: -3.28, lz: -0.95, kid: null, via: [[-0.9, 3.35], [-0.9, 1.6], [-1.97, 1.6], [-1.97, -0.12], [-3.28, -0.12]] },
  { i: 4, lx: -1.53, lz: -0.95, kid: 'kid3', via: [] },
  { i: 5, lx: 0.22, lz: -0.95, kid: null, via: [[0.6, 3.35], [-0.22, 1.6], [-0.22, -0.12], [0.22, -0.12]] },
];
/** 孩子们的席（谁都抢不去） */
export const KID_SEATS = new Set(SEATS.filter((s) => s.kid).map((s) => s.i));
const KID_NAME: Record<string, string> = { kid1: '三郎', kid2: '虎子', kid3: '石头' };
/** 站着听的地方：前檐外东边一点（离「书声」那一象站的地方三米），面朝屋里 */
export const STAND = { ...L(2.4, 3.75), yaw: SC.yaw + Math.PI };
/** 先生坐处（高桌后的坐墩上，朝西） */
export const MASTER_SEAT = TEACHER;
export const seatPos = (i: number) => { const s = SEATS[i]; const p = L(s.lx, s.lz); return { x: p.x, y: MAT_TOP, z: p.z }; };
export const seatVia = (i: number) => SEATS[i].via.map(([lx, lz]) => L(lx, lz));
/** 村塾前（同游时提醒、独游时开讲，看人离这里多远） */
export const SCHOOL_AT = L(0, 4.0);

// —— 先生：一位须发花白的读书人，素衣、软巾 ——
const MASTER_LOOK: Partial<Look> = {
  body: 0.3, robe: [0.93, 0.91, 0.87], robeDens: 1.1, trim: [0.56, 0.58, 0.6], trimDens: 1.8, sash: [0.5, 0.5, 0.53], sashDens: 2.0,
  hat: 'jin', hatPig: [0.44, 0.44, 0.46], hatDens: 2.2, hair: [0.88, 0.88, 0.87], hairDens: 1.1, beard: 0.95, scale: 1.0, sleeve: 1, shade: 1.4, skin: [0.98, 0.88, 0.79],
};
/** 先生走的路：村路东头 → 秋千旁的窄道 → 前檐东边 → 进屋 → 绕到高桌后 → 坐下（散了原路回去） */
const PATH: Array<{ x: number; z: number }> = (() => {
  const sw = SITE.more.swing;
  return [{ x: 136, z: 6 }, { x: 116, z: 8 }, { x: sw.x + 1.6, z: sw.z - 2.6 }, L(3.2, 3.45), { x: TEACHER_IN.x, z: TEACHER_IN.z }, { x: TEACHER.from![0], z: TEACHER.from![1] }, { x: TEACHER.x, z: TEACHER.z }];
})();
const SEG = PATH.slice(1).map((p, i) => Math.hypot(p.x - PATH[i].x, p.z - PATH[i].z));
const PATH_LEN = SEG.reduce((a, b) => a + b, 0);
/** 走多快（米 / 秒）：聚的那一段里走到、坐下 */
const WALK = Math.max(0.9, PATH_LEN / (T.gather - 3.2));
const WALK_T = PATH_LEN / WALK;
/** 路上第 d 米在哪、朝哪 */
function along(d: number): { x: number; z: number; yaw: number } {
  let r = Math.max(0, Math.min(PATH_LEN, d));
  for (let i = 0; i < SEG.length; i++) {
    if (r <= SEG[i] || i === SEG.length - 1) {
      const a = PATH[i], b = PATH[i + 1], u = SEG[i] > 0 ? Math.min(1, r / SEG[i]) : 1;
      return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    r -= SEG[i];
  }
  const e = PATH[PATH.length - 1];
  return { x: e.x, z: e.z, yaw: TEACHER.yaw };
}

// —— 一讲 ——
export interface Plan {
  /** 同游：格号；独游：开讲那一刻的序号 */
  id: number;
  group: boolean;
  /** 开讲（聚）的那一刻（毫秒） */
  t0: number;
  lesson: Lesson;
  /** 独游时点画面跳过的秒数（同游不许跳） */
  skip: number;
}
export interface SeatView { i: number; x: number; y: number; z: number; kind: 'kid' | 'me' | 'peer' | 'free'; who: string }
export interface Answer { q: number; pick: number; right: boolean; score: number }
export interface LectureState {
  plan: Plan | null;
  /** 此刻在哪一段（没有讲时是 done） */
  phase: Phase;
  /** 讲着（聚、讲、问、散都算） */
  on: boolean;
  /** 同游（同屋另有人）：按钟上的格讲 */
  group: boolean;
  seats: SeatView[];
  mySeat: number | null;
  /** 自己要了却还没坐定的那一席（等一小会儿，看有没有更早要的） */
  pending: number | null;
  answers: Answer[];
  /** 这一回各人的分数（散的时候排）：名字、几分、答对几题、是不是自己 */
  board: Array<{ name: string; score: number; right: number; me?: boolean; kid?: boolean; peer?: number }>;
}

// —— 榜：答题 ——
registerBoard({
  key: 'quiz', name: '答题', order: 1,
  fmt: (v) => `${cnScore(v)}分`,
  folk: [['赵先生', 43], ['郑先生', 41], ['虎子', 26], ['三郎', 22], ['石头', 17]],
  note: '学堂讲卦后先生问三句：答对一题十分，答得快再加至多五分（一回至多四十五分），记最好的一回',
});
const CN = '〇一二三四五六七八九';
const cnScore = (v: number) => (v < 10 ? CN[v] : v < 20 ? '十' + (v % 10 ? CN[v % 10] : '') : CN[Math.floor(v / 10)] + '十' + (v % 10 ? CN[v % 10] : ''));

class Lecture {
  plan: Plan | null = null;
  /** 独游：讲完以后到什么时候才讲下一回 */
  restUntil = 0;
  /** 各人要的席：编号 → 要的那一席（自己的编号同游时是中转上的，独游是 0） */
  wishes = new Map<number, Wish>();
  /** 自己要了一席、正等着看坐不坐得上：几时要的（毫秒） */
  pendAt = 0; pendSeat: number | null = null;
  answers: Answer[] = [];
  /** 同屋的人这一回的分数 */
  room = new Map<number, { score: number; right: number }>();
  /** 在不在听（做事那一路进来了）；听了哪几句、坐着听了几句 */
  attending = false; heard = new Set<number>(); seatedLines = new Set<number>();
  /** 这一讲记过修为了没有（讲完一回只记一次）；分数报过了没有 */
  paid = false; reported = false;
  private fig: Figure | null = null;
  private figPose: 'walk' | 'sit' | 'gone' = 'gone';
  private lastPhase = '';
  private far = 0;
  private subs: Array<() => void> = [];
  private tgBound: unknown = null;
  private hinted = { night: false, next: 0, rest: 0 };
  /** 先生挡路的那一圈（放进村里人的挡路名单：人走不穿他）；不在场时挪到天边 */
  private blocker = { x: 1e6, z: 1e6, r: 0 };
  /** 在村塾前站了多久（秒）；这一帧多长；这一讲人来听过没有 */
  private dwell = 0; private dtNow = 0; private came = false;
  constructor(private k: Anlewo) {}

  /** 此刻的毫秒（同游、独游都用本机的钟；同游时两边差的只是本机钟的误差） */
  now() { return Date.now(); }
  /** 开讲后第几秒（独游可以跳） */
  tOf(p: Plan) { return (this.now() - p.t0) / 1000 + p.skip; }
  phase(): Phase { return this.plan ? phaseAt(this.tOf(this.plan), this.plan.lesson.lines.length) : { kind: 'done', t: 0, t1: Infinity }; }
  get on() { const ph = this.phase(); return !!this.plan && ph.kind !== 'done'; }
  /** 同游：同屋另有人、园中天时随最早来的那一位 */
  group(): boolean { const tg = getTogether(); return !!this.k.shared && !!tg && tg.remotes.size > 0; }
  myId(): number { return getTogether()?.myId ?? 0; }

  /** 换了一讲：各样清零 */
  private start(p: Plan) {
    this.plan = p;
    this.wishes.clear(); this.pendSeat = null; this.answers = []; this.room.clear();
    this.heard.clear(); this.seatedLines.clear(); this.paid = false; this.reported = false; this.lastPhase = ''; this.came = false;
  }
  /** 独游：开一讲（讲下一卦） */
  private soloStart() {
    const m = readXiu(this.k), now = this.now();
    const gua = nextCourse(new Set(m.heard), m.last);
    this.start({ id: Math.floor(now / 1000) % 1000000, group: false, t0: now, lesson: lessonOf(gua, now >>> 0), skip: 0 });
  }

  /** 每帧 */
  tick(dt: number) {
    const k = this.k, now = this.now();
    this.dtNow = dt;
    this.bindNet();
    const group = this.group();
    // —— 这一讲 ——
    if (group && (!this.plan || this.plan.group || this.phase().kind === 'done')) {
      const g = groupLecture(now, this.k.shared!.tz);
      if (g && (!this.plan || this.plan.id !== g.slot % 1000000 || !this.plan.group)) this.start({ id: g.slot % 1000000, group: true, t0: g.t0, lesson: lessonOf(g.gua, g.seed), skip: 0 });
      else if (!g && this.plan?.group && this.phase().kind === 'done') this.plan = null;
    } else if (!group) {
      const ph = this.phase();
      // 讲完了：听了的歇三分钟再讲下一回；没来听的歇十分钟（人只是在村里走动，不必一回一回地敲）
      if (this.plan && ph.kind === 'done') { if (!this.plan.group) this.restUntil = Math.max(this.restUntil, this.plan.t0 + (durOf(this.plan.lesson.lines.length) + this.plan.skip) * 1000 + (this.came ? SOLO_REST_MS : SOLO_IDLE_MS)); this.plan = null; }
      if (!this.plan && this.canSolo(now)) { this.soloStart(); this.bell(); }
      // 独游时人走远了（六十米外八秒）：这一讲就散了
      if (this.plan && !this.plan.group && (ph.kind === 'gather' || ph.kind === 'line')) {
        const d = Math.hypot(k.player.pos.x - SCHOOL_AT.x, k.player.pos.z - SCHOOL_AT.z);
        this.far = d > 60 ? this.far + dt : 0;
        if (this.far > 8 && !this.attending) { this.plan = null; this.restUntil = now + 30000; this.far = 0; }
      }
    }
    const ph = this.phase();
    SCHOOL.on = !!this.plan && ph.kind !== 'done';
    if (this.attending) this.came = true;
    // —— 段落变了：敲一下、记一笔 ——
    const key = this.plan ? `${this.plan.id}:${ph.kind}:${'i' in ph ? ph.i : ''}` : '';
    if (key !== this.lastPhase) {
      const was = this.lastPhase;
      this.lastPhase = key;
      if (this.plan) this.onPhase(ph, was);
    }
    // —— 听着：记下听了哪几句、坐着听的 ——
    if (this.attending && ph.kind === 'line') {
      this.heard.add(ph.i);
      if (this.mySeatNow() != null) this.seatedLines.add(ph.i);
    }
    // —— 自己要的席：等一小会儿（同游时让更早要的那一条有工夫到），没人更早就坐定 ——
    if (this.pendSeat != null && now - this.pendAt > (this.plan?.group ? 700 : 150)) {
      const owner = resolveSeats(this.wishes, KID_SEATS).get(this.pendSeat);
      this.pendSeat = null;
      if (owner !== this.myId()) this.lostSeat = true;
    }
    this.updateMaster(dt, ph);
    // 同游时白天走到村塾前、却不在讲：说一声下一讲在什么时候（隔两分钟才再说）
    if (group && !this.on) this.hintNext(now);
  }
  /** 刚才要的那一席让人先坐了（做事那一路读了就清） */
  lostSeat = false;

  /**
   * 人是不是「到村塾来了」：村路贴着前檐外过（檐外一步多），走过路过不算——在檐前九米内站下来（慢到半步一秒以下）一秒半，
   * 或者走进檐下、屋里待上一秒半，才算。返回离村塾前多远（没到是 Infinity）
   */
  private atSchool(dt: number): number {
    const p = this.k.player, d = Math.hypot(p.pos.x - SCHOOL_AT.x, p.pos.z - SCHOOL_AT.z);
    if (d > 9) { this.dwell = 0; return Infinity; }
    const { lx, lz } = local(p.pos.x, p.pos.z), under = lz < 4.0 && lz > -SC.d / 2 && Math.abs(lx) < SC.w / 2 + 0.5;
    if (under || p.speed < 0.4) this.dwell += dt; else this.dwell = Math.max(0, this.dwell - dt);
    return this.dwell > 1.5 ? d : Infinity;
  }
  private canSolo(now: number): boolean {
    const k = this.k, a = k.atmos;
    if (k.overview || k.veil > 0.5 || k.nav.busy) return false;
    const d = this.atSchool(this.dtNow);
    if (!Number.isFinite(d)) return false;
    // 先生刚讲完、歇着：走到跟前说一声几分钟后再来（一回歇只说一次）
    if (now < this.restUntil) {
      if (this.hinted.rest !== this.restUntil) { this.hinted.rest = this.restUntil; k.note(NOTES.rest.replace('{n}', cnScore(Math.max(1, Math.ceil((this.restUntil - now) / 60000)))), 'study'); }
      return false;
    }
    if (a.night > 0.3 || !dayHour(a.hour)) {
      if (!this.hinted.night) { this.hinted.night = true; k.note(NOTES.night, 'study'); }
      return false;
    }
    if (a.w.rain > 0.85 || a.w.snow > 0.85) return false;
    return true;
  }
  private hintNext(now: number) {
    const k = this.k;
    if (!Number.isFinite(this.atSchool(this.dtNow)) || now < this.hinted.next) return;
    this.hinted.next = now + 120000;
    const n = nextGroupWhen(now, k.shared!.tz);
    if (n) k.note(NOTES.next.replace('{when}', n), 'study');
  }
  private bell() {
    const k = this.k;
    k.sfxAt('wood', { vel: 0.5, x: SCHOOL_AT.x, z: SCHOOL_AT.z });
    window.setTimeout(() => k.sfxAt('wood', { vel: 0.42, x: SCHOOL_AT.x, z: SCHOOL_AT.z }), 520);
    if (Math.hypot(k.player.pos.x - SCHOOL_AT.x, k.player.pos.z - SCHOOL_AT.z) < 120) k.note(NOTES.bell, 'study');
  }
  private onPhase(ph: Phase, was: string) {
    const k = this.k, p = this.plan!;
    // 同游时一讲开头（或进来时正在聚）：敲一下
    if (ph.kind === 'gather' && p.group && !was.startsWith(`${p.id}:`)) this.bell();
    if (ph.kind === 'line' && ph.i === 0) k.sfxAt('wood', { vel: 0.35, x: SCHOOL_AT.x, z: SCHOOL_AT.z });
    else if (ph.kind === 'line') k.sfxAt('page', { vel: 0.18, x: SCHOOL_AT.x, z: SCHOOL_AT.z });
    // 讲完了（到了问那一段）：听了大半的记修为
    if (ph.kind === 'ask' && ph.i === 0) this.pay();
    // 问完了：报分数（同游时也告诉同屋的人）
    if ((ph.kind === 'show' || ph.kind === 'done') && !this.reported) this.finishQuiz();
  }
  private pay() {
    if (this.paid || !this.plan) return;
    this.paid = true;
    const n = this.plan.lesson.lines.length;
    if (this.heard.size < Math.ceil(n * 0.6)) return;
    const seated = this.seatedLines.size >= Math.ceil(n / 2);
    let got = addXiu(this.k, 'lecture', seated ? 6 : 4);
    if (noteHeard(this.k, this.plan.lesson.index) && got) got += addXiu(this.k, 'new', 2);
    if (got) this.k.note(NOTES.heard.replace('{n}', cnScore(got) + '分'), 'xiu');
  }
  private finishQuiz() {
    this.reported = true;
    if (!this.answers.length || !this.plan) return;
    const score = this.answers.reduce((a, b) => a + b.score, 0), right = this.answers.filter((a) => a.right).length;
    // 一题没答对的不上榜（同游时照旧告诉同屋的人：散的时候大家都看得见这一回谁答了）
    if (score > 0) report(this.k, 'quiz', score);
    if (this.plan.group) getTogether()?.sendGame('quiz', 0, quizMsg(this.plan.id, score, right));
  }

  // —— 席 ——
  /** 此刻各席谁坐着 */
  seats(): SeatView[] {
    const own = resolveSeats(this.wishes, KID_SEATS), me = this.myId(), tg = getTogether();
    return SEATS.map((s) => {
      const p = seatPos(s.i);
      if (s.kid) return { i: s.i, ...p, kind: 'kid' as const, who: KID_NAME[s.kid] };
      const o = own.get(s.i);
      if (o == null) return { i: s.i, ...p, kind: 'free' as const, who: '' };
      if (o === me) return { i: s.i, ...p, kind: 'me' as const, who: '你' };
      return { i: s.i, ...p, kind: 'peer' as const, who: tg?.label(o) || '同游的人' };
    });
  }
  /** 自己此刻坐定的那一席（还在等的不算） */
  mySeatNow(): number | null {
    if (this.pendSeat != null) return null;
    const me = this.myId(), w = this.wishes.get(me);
    if (!w) return null;
    return resolveSeats(this.wishes, KID_SEATS).get(w.seat) === me ? w.seat : null;
  }
  /** 要一席（同游时告诉同屋的人）。返回 false：那一席不能要（孩子的、已经有人坐定了） */
  claim(i: number): boolean {
    const p = this.plan;
    if (!p || KID_SEATS.has(i) || i < 0 || i >= SEATS.length) return false;
    const own = resolveSeats(this.wishes, KID_SEATS).get(i), me = this.myId();
    if (own != null && own !== me) return false;
    const t = Math.max(0, Math.round((this.now() - p.t0)));
    this.wishes.set(me, { seat: i, t });
    this.pendSeat = i; this.pendAt = this.now(); this.lostSeat = false;
    if (p.group) getTogether()?.sendGame('seat', 0, seatMsg(p.id, i, t, true));
    return true;
  }
  /** 让出自己的席 */
  release() {
    const p = this.plan, me = this.myId(), w = this.wishes.get(me);
    this.pendSeat = null;
    if (!w) return;
    this.wishes.delete(me);
    if (p?.group) getTogether()?.sendGame('seat', 0, seatMsg(p.id, w.seat, w.t, false));
  }

  // —— 问 ——
  /** 答第 q 题，挑了第 pick 项。返回这一题的结果（答过了、不在问这一题：null） */
  answer(q: number, pick: number): Answer | null {
    const p = this.plan, ph = this.phase();
    if (!p || ph.kind !== 'ask' || ph.i !== q || this.answers.some((a) => a.q === q)) return null;
    const Q = p.lesson.quiz[q], right = pick === Q.answer, left = (ph.t1 - ph.t) / T.ask;
    const a: Answer = { q, pick, right, score: scoreOf(right, left) };
    this.answers.push(a);
    if (right) addXiu(this.k, 'quiz', left > 0.6 ? 3 : 2);
    // 独游：答完停一停就到下一题（同游等这一段走完）
    if (!p.group) window.setTimeout(() => { if (this.plan === p && this.phase().kind === 'ask' && (this.phase() as { i: number }).i === q) { const f = this.phase(); p.skip += Math.max(0, f.t1 - f.t); } }, 1700);
    return a;
  }
  /** 独游：跳过这一句（讲的那一段） */
  skipLine() {
    const p = this.plan, ph = this.phase();
    if (!p || p.group || ph.kind !== 'line' || ph.t1 - ph.t < 0.2) return;
    p.skip += ph.t1 - ph.t;
  }
  /** 独游：不等了，直接开讲（聚的那一段） */
  skipGather() {
    const p = this.plan, ph = this.phase();
    if (!p || p.group || ph.kind !== 'gather') return;
    p.skip += Math.max(0, ph.t1 - ph.t - 1);
  }
  /** 这一回的榜：自己、同屋的人、三个孩子（孩子的分数由种子定，两边一样） */
  board(): LectureState['board'] {
    const p = this.plan;
    if (!p) return [];
    const out: LectureState['board'] = [];
    if (this.answers.length) out.push({ name: this.k.persona.name || '你', score: this.answers.reduce((a, b) => a + b.score, 0), right: this.answers.filter((a) => a.right).length, me: true });
    const tg = getTogether();
    for (const [id, r] of this.room) out.push({ name: tg?.label(id) || '同游的人', score: r.score, right: r.right, peer: id });
    const R = mulberry32(p.id * 31 + 7);
    for (const id of ['kid1', 'kid2', 'kid3']) {
      const right = Math.min(3, Math.floor(R() * 3.2) + (id === 'kid2' ? 1 : 0)), score = right * 10 + (right ? Math.floor(R() * 4) : 0);
      out.push({ name: KID_NAME[id], score, right, kid: true });
    }
    return out.sort((a, b) => b.score - a.score || (a.me ? -1 : b.me ? 1 : 0));
  }
  view(): LectureState {
    const ph = this.phase();
    return { plan: this.plan, phase: ph, on: !!this.plan && ph.kind !== 'done', group: this.group(), seats: this.seats(), mySeat: this.mySeatNow(), pending: this.pendSeat, answers: this.answers, board: this.board() };
  }

  // —— 同游 ——
  private bindNet() {
    const tg = getTogether();
    if (tg === this.tgBound) return;
    for (const f of this.subs) f();
    this.subs = [];
    this.tgBound = tg;
    if (!tg) return;
    this.subs.push(tg.onGame('seat', (fr, d) => {
      const m = readSeatMsg(d), p = this.plan;
      if (!m || !p || !p.group || m.slot !== p.id % 1000000) return;
      if (m.on) this.wishes.set(fr, { seat: m.seat, t: m.t }); else if (this.wishes.get(fr)?.seat === m.seat) this.wishes.delete(fr);
    }));
    this.subs.push(tg.onGame('quiz', (fr, d) => {
      const m = readQuizMsg(d), p = this.plan;
      if (!m || !p || !p.group || m.slot !== p.id % 1000000) return;
      this.room.set(fr, { score: m.score, right: m.right });
    }));
    this.subs.push(tg.onPeer((ev, id) => {
      const p = this.plan;
      if (ev === 'out') { this.wishes.delete(id); return; }
      // 新来的人不知道谁已经坐着：自己坐着的，再报一回（原来那一刻的毫秒数，抢座照旧按它算）
      const me = this.myId(), w = this.wishes.get(me);
      if (p?.group && w && this.mySeatNow() != null) tg.sendGame('seat', id, seatMsg(p.id, w.seat, w.t, true));
    }));
  }

  // —— 先生 ——
  private updateMaster(dt: number, ph: Phase) {
    const k = this.k, p = this.plan;
    const tEnd = p ? durOf(p.lesson.lines.length) : 0, t = p ? this.tOf(p) : 0;
    // 不在场：还没讲、或散了走远了
    const away = !p || t < 0 || t > tEnd + WALK_T + 1;
    if (away) { if (this.fig) { this.fig.setVisible(false); this.figPose = 'gone'; } SCHOOL.at = null; this.blocker.x = this.blocker.z = 1e6; this.blocker.r = 0; return; }
    const f = this.figure();
    if (!f) return;
    const root = f.root;
    root.visible = true;
    let x: number, z: number, yaw: number, speed = 0;
    const leaving = t > tEnd;
    const d = leaving ? PATH_LEN - (t - tEnd) * WALK : t * WALK;
    const sitting = !leaving && d >= PATH_LEN;
    if (sitting) {
      x = TEACHER.x; z = TEACHER.z; yaw = TEACHER.yaw;
      if (this.figPose !== 'sit') {
        this.figPose = 'sit';
        f.setSeat({ h: TEACHER.h, cz: TEACHER.cz }); f.setPose('bench', 0.9); f.setHands('lap', 0.6);
      }
    } else {
      const a = along(d);
      x = a.x; z = a.z; yaw = leaving ? a.yaw + Math.PI : a.yaw; speed = WALK;
      if (this.figPose !== 'walk') { this.figPose = 'walk'; f.setSeat(null); f.setPose('stand', 0.7); f.setHands('sleeve', 0.5); }
    }
    // 屋里的地面高 0.16：进了屋（过了前檐）脚就落在屋里的地面上
    const inside = Math.hypot(x - TEACHER.x, z - TEACHER.z) < 3.4;
    const y = inside ? SCHOOL_Y : footY(x, z);
    root.position.set(x, y, z);
    this.blocker.x = x; this.blocker.z = z; this.blocker.r = 0.3;
    // 转身别一下子：朝着要去的方向慢慢转过去
    const cur = root.rotation.y, off = Math.atan2(Math.sin(yaw - cur), Math.cos(yaw - cur));
    root.rotation.y = cur + off * Math.min(1, dt * 6);
    SCHOOL.at = SCHOOL.at ?? new THREE.Vector3();
    SCHOOL.at.set(x, y + 1.2, z);
    // 讲着：每一句开头抬一抬右手，眼睛在孩子与来听的人之间
    if (sitting && ph.kind === 'line') {
      const u = ph.t - (ph.t1 - T.line), lift = u < 1.8 ? Math.sin((u / 1.8) * Math.PI) : 0;
      f.reach('R', lift > 0.02 ? new THREE.Vector3(x, y + 0.92 + 0.12 * lift, z).addScaledVector(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), 0.32).add(new THREE.Vector3(Math.cos(yaw) * -0.18, 0, Math.sin(yaw) * 0.18)) : null, { rate: 6 });
      const look = ph.i % 2 === 0 ? k.player.pos : seatPos(ph.i % 3 === 0 ? 0 : 4);
      f.lookAt(new THREE.Vector3(look.x, (look.y ?? y) + 0.9, look.z));
    } else if (sitting) { f.reach('R', null); f.lookAt(ph.kind === 'ask' || ph.kind === 'show' ? new THREE.Vector3(k.player.pos.x, k.player.pos.y + 1.2, k.player.pos.z) : null); }
    else { f.reach('R', null); f.lookAt(null); }
    // 远了少动：六十米外隔几帧才摆一回身子
    const cam = k.world.camera.position, far = cam.distanceTo(root.position);
    if (far < 160) f.update(dt, k.world.time, { speed: speed / f.look.scale, climb: 0, turn: 0 });
  }
  private figure(): Figure | null {
    if (this.fig) return this.fig;
    try {
      const f = new Figure({ ...this.k.q, tier: 'low', tex: this.k.q.tex * 0.5 }, MASTER_LOOK);
      f.root.name = 'npc:shaoyong';
      this.k.world.scene.add(f.root);
      // 挡路：放进村里人那一份会动的圆里（行走图每帧照它算）
      this.k.life?.blockers.push(this.blocker);
      this.fig = f;
      return f;
    } catch (e) { console.warn('先生没能备好', e); return null; }
  }
  /** 先生此刻在哪（测试、册页用；不在场是 null） */
  masterAt(): THREE.Vector3 | null { return this.fig?.root.visible ? this.fig.root.position : null; }
  dispose() { for (const f of this.subs) f(); this.subs = []; this.fig?.dispose(); this.fig = null; }
}

/** 同游时下一讲在什么时候（同游按真的钟点走，就说钟上几点几分） */
export function nextGroupWhen(now: number, tz: number): string | null {
  const n = nextGroup(now, tz);
  if (!n) return null;
  const c = clockAt(tz, n.t0), h = Math.floor(c.hour), m = Math.round((c.hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

let cur: Lecture | null = null;
/** 世界建好时调一回（做事那一路 acts/lecture.ts 调） */
export function startLecture(k: Anlewo): Lecture {
  if (cur && (cur as unknown as { k: Anlewo }).k === k) return cur;
  cur?.dispose();
  const lec = new Lecture(k);
  cur = lec;
  startXiu(k);
  let errs = 0;
  k.world.tick.push((dt) => {
    if (errs >= 3) return;
    try { lec.tick(dt); } catch (e) { errs++; console.warn(`学堂出错（第 ${errs} 次）`, e); if (errs >= 3) SCHOOL.on = false; }
  });
  if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__lecture = lec;
  return lec;
}
/** 此刻的学堂（世界还没建好是 null） */
export const lectureOf = (): Lecture | null => cur;
export type { Lecture };
