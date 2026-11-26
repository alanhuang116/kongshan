/**
 * 打坐时眼前的天象（acts/sit.ts 每帧推它）。怎么一境一境地深下去，见 study/vision.ts；这里只管把它画出来、收回去。
 *
 *   画：钟点、季节用世界给的 k.setVision（只在自己这边画、不存档、不过日子、时辰流转停着；同游时园中天时照走，收起时一下子回到园中此刻）。
 *       月几分（atmos.moonPhase）、远山半腰的云（U.uCloud）、北斗的连线与星名、入定时的岁差（盖在 SU.uM 上，下一帧天自己再算回来）——
 *       这几样世界的 setVision 不管，由这里记下原样、收起时还回去。
 *   换境：眼前一白（k.veil 起一层雾），换了机位与天象，再淡开。
 *   动一动（点画面、拖、按键、推摇杆）：慢慢出定——起一层雾，天象收回此刻，从头再静。
 *   收起（end）：什么时候都还得回去，出了错也一样（调的人用 try/finally）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { SUN, type Season } from '../env/atmos';
import { U } from '../ink/ink';
import { EQ_TO_GAL, D2R, app3, horizon, mul3, tr3, type M3 } from '../env/stars/astro';
import { SU } from '../env/stars/layers';
import { TIERS, hourShi, hourYe, moonYue, poleAt, precessLong, seasonSui, tierAt, yearsDing } from './study/vision';

/** 入定时把天停在哪个恒星时：十八时，黄极正在北边天上（高五十八度），北天绕着它转 */
const LST_DING = 18 * 15 * D2R;
const ease = (u: number) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

export interface SitEvents {
  /** 进了第 i 境（头一回到这一境：fresh） */
  tier?(i: number): void;
  /** 动了一下，出定了 */
  rise?(): void;
}

export class SitVision {
  /** 静了几秒（只在不动的时候长） */
  depth = 0;
  /** 此刻画的是第几境（−1 是还在调息、或刚出定）；这一境走到几成 */
  tier = -1; u = 0;
  /** 此刻能到的最深一境 */
  cap = 0;
  /** 这一回到过的最深一境、在那一境里静了几秒 */
  deepest = -1; deepSec = 0;
  /** 这一回一共静了几秒（出定了也接着算） */
  still = 0;
  /** 换境、出定时的那一层雾：t 走到哪、到了顶要做什么 */
  private fade: { t: number; mid: () => void; done: boolean } | null = null;
  private stash: { h0: number; season: Season; moon: number; cloud: THREE.Vector4; weather: string } | null = null;
  private lines = false; private labels = false; private dingOn = false;
  private poleStar = -1; private nearStar: { i: number; name: string } | null = null;
  /** 一岁：此刻画的是哪一季（换季时也换一处看：桃、荷、菊、雪中的梅） */
  private suiS: Season | null = null;

  /** cam(i, s)：第 i 境的机位；一岁时 s 是哪一季（各季看园里不同的一处） */
  constructor(private k: Anlewo, private cam: (i: number, s?: Season) => { pos: THREE.Vector3; look: THREE.Vector3; fov: number }, private ev: SitEvents = {}) {}

  /** 坐定了：记下此刻的天，好收回去 */
  begin(cap: number) {
    const k = this.k, a = k.atmos;
    this.cap = cap; this.depth = 0; this.tier = -1; this.u = 0; this.deepest = -1; this.deepSec = 0; this.still = 0; this.fade = null;
    this.stash = { h0: a.hour, season: k.season, moon: a.moonPhase, cloud: U.uCloud.value.clone(), weather: a.weather };
    const S = a.sky.data;
    this.poleStar = S.dipper[7] ?? -1;
    this.nearStar = this.findNear();
  }

  /**
   * 每帧（在世界算完天之后：act.update 排在 atmos.update 后头）。still：这一帧没有人动它。
   */
  step(dt: number, still: boolean) {
    const k = this.k;
    if (!this.stash) return;
    // —— 雾：换境、出定 ——
    if (this.fade) {
      const f = this.fade;
      f.t += dt;
      const up = 1.1, down = 1.5;
      if (f.t < up) k.veil = Math.max(k.veil, 0.82 * ease(f.t / up));
      else {
        if (!f.done) { f.done = true; f.mid(); }
        k.veil = 0.82 * (1 - ease((f.t - up) / down));
        if (f.t >= up + down) { k.veil = 0; this.fade = null; }
      }
    }
    // —— 动了：慢慢出定 ——
    if (!still) {
      if (this.tier >= 0 && !this.fade) {
        this.ev.rise?.();
        this.fade = { t: 0, done: false, mid: () => { this.clear(); this.depth = 0; this.tier = -1; this.k.nav.setPose({ ...this.cam(-1), yaw: 14, up: 8, down: 8 }, 1.2); } };
      } else if (this.tier < 0) this.depth = 0;
      return;
    }
    if (this.fade && !this.fade.done) return;
    this.depth += dt; this.still += dt;
    const at = tierAt(this.depth, this.cap);
    if (at.i !== this.tier && !this.fade) {
      const i = at.i;
      if (i > this.tier) {
        // 进下一境：起一层雾，到了顶换机位、换天象
        const first = this.tier < 0;
        this.fade = { t: first ? 0.4 : 0, done: false, mid: () => { this.enter(i); } };
        if (first) this.k.veil = Math.max(this.k.veil, 0.25);
      }
    }
    if (this.tier >= 0) {
      this.u = at.i === this.tier ? at.u : 1;
      this.apply(this.tier, this.u);
      if (this.tier >= this.deepest) { if (this.tier > this.deepest) { this.deepest = this.tier; this.deepSec = 0; } this.deepSec += dt; }
    }
  }

  /** 进第 i 境：机位、头一帧的天象 */
  private enter(i: number) {
    const k = this.k, sky = k.atmos.sky;
    this.clear(false);
    this.tier = i; this.u = 0;
    // 一岁：头一季先换好（季、天气、看哪一处），之后每换一季起一层雾再换
    if (TIERS[i].id === 'sui' && this.stash) { const s = seasonSui(0, this.stash.season); this.suiS = s; this.suiAt(s); }
    const c = this.cam(i, this.suiS ?? undefined);
    k.nav.setPose({ ...c, yaw: 14, up: 8, down: 8 }, 0.01);
    if (i === 1 || i === 4) {
      // 北斗淡淡地描出来，北极星题一个名
      const d = sky.data.find('北斗');
      if (d) { sky.lines.set(d.i, i === 4 ? 0.6 : 0.5, 1.2); this.lines = true; }
      const s = this.poleStar, S = sky.data.stars.dir;
      if (s >= 0) { sky.labels.show('sit-pole', i === 4 ? '勾陈一' : '北极星', [S[s * 3], S[s * 3 + 1], S[s * 3 + 2]], { big: false }); this.labels = true; }
    }
    k.world.fpsCap = 30;
    this.ev.tier?.(i);
  }

  /** 第 i 境走到 u：拨钟、换季、月相、云、岁差 */
  private apply(i: number, u: number) {
    const k = this.k, st = this.stash!, a = k.atmos, [sr, ss] = SUN[k.season];
    const id = TIERS[i].id;
    if (id === 'shi') {
      k.setVision({ hour: hourShi(st.h0, u) });
      // 远山半腰那一带云慢慢升上去、浓起来
      const e = ease(u);
      U.uCloud.value.set(U.uCloud.value.x, st.cloud.y + 320 * e, st.cloud.z + 480 * e, st.cloud.w);
    } else if (id === 'ye') {
      k.setVision({ hour: hourYe(u, sr, ss), season: st.season });
      this.clearSky();
    } else if (id === 'yue') {
      const m = moonYue(u, sr, ss);
      a.moonPhase = m.phase;
      k.setVision({ hour: m.hour, season: st.season });
      this.clearSky();
    } else if (id === 'sui') {
      // 到了下一季：起一层雾，到了顶换季、换天气、换一处看
      const s = seasonSui(u, st.season);
      if (s !== this.suiS && !this.fade) this.fade = { t: 0, done: false, mid: () => { this.suiS = s; this.suiAt(s); k.nav.setPose({ ...this.cam(3, s), yaw: 14, up: 8, down: 8 }, 0.01); } };
    } else if (id === 'ding') {
      k.setVision({ hour: 22.6, season: st.season });
      this.clearSky();
      a.moonPhase = 0;
      this.precess(yearsDing(u));
    }
  }

  /** 一岁里的一季：画里换到那一季、上午十点；冬天下一场雪（世界的天气只在画里换，收起时 setVision(null) 还回去） */
  private suiAt(s: Season) {
    const k = this.k, a = k.atmos;
    k.setVision({ season: s, hour: 10 });
    const w = s === 'winter' ? 'snow' : 'clear';
    if (a.weather !== w) a.setWeather(w);
  }
  /** 看天的几境：眼前是晴夜（下着雨也一样——这是坐着看见的；收起时天气还回去） */
  private clearSky() { const a = this.k.atmos; if (a.weather !== 'clear') a.setWeather('clear'); }
  /** 入定：J2000 → 世界 = 地平（定在十八时）· 今年的岁差 · 往后 years 年的岁差。盖在星斗、天汉共用的矩阵上 */
  private precess(years: number) {
    const k = this.k, sky = k.atmos.sky, now = sky.now;
    if (!now) return;
    const M: M3 = mul3(horizon(LST_DING), mul3(now.P, precessLong(years)));
    SU.uM.value.set(M[0], M[1], M[2], M[3], M[4], M[5], M[6], M[7], M[8]);
    const gal = (sky as unknown as { u?: { uGal?: { value: THREE.Matrix3 } } }).u?.uGal;
    if (gal) { const G = mul3(EQ_TO_GAL, tr3(M)); gal.value.set(G[0], G[1], G[2], G[3], G[4], G[5], G[6], G[7], G[8]); }
    this.dingOn = true;
    // 北极（世界里固定在正北、高三十四度六的那一点）：这时在星间哪里，题「北极」二字；走到一半以后，近北极的那颗星题它的名字
    const wp = [0, Math.sin(34.6 * D2R), -Math.cos(34.6 * D2R)], v = app3(tr3(M), wp[0], wp[1], wp[2], [0, 0, 0]);
    sky.labels.show('sit-north', '北极', v, { big: false });
    this.labels = true;
    if (this.nearStar && years > 7000) {
      const S = sky.data.stars.dir, s = this.nearStar.i;
      sky.labels.show('sit-near', this.nearStar.name, [S[s * 3], S[s * 3 + 1], S[s * 3 + 2]], { big: false });
    }
  }
  /** 一会以后近北极的那颗亮星（四等以内、离天极最近的；星表里有名字的） */
  private findNear(): { i: number; name: string } | null {
    const sky = this.k.atmos.sky, S = sky.data.stars, p = poleAt(yearsDing(1) + (new Date().getFullYear() - 2000));
    let best = -1, bd = 1;
    for (let i = 0; i < S.n; i++) {
      if (S.mag[i] > 3.2) break;
      const d = Math.acos(Math.min(1, S.dir[i * 3] * p[0] + S.dir[i * 3 + 1] * p[1] + S.dir[i * 3 + 2] * p[2]));
      if (d < bd && sky.data.starName(i)) { bd = d; best = i; }
    }
    return best >= 0 && bd < 12 * D2R ? { i: best, name: sky.data.starName(best)! } : null;
  }
  /** 近北极的那颗星叫什么（入定时题在天上，面板里也说） */
  get nearName(): string | null { return this.nearStar?.name ?? null; }

  /** 收起这一境额外画的（连线、星名、云、月相）；天象本身（钟点、季）留着，换境时下一境接着拨 */
  private clear(all = true) {
    const k = this.k, sky = k.atmos.sky, st = this.stash;
    if (this.lines) { sky.lines.setAll(0, 1.5); this.lines = false; }
    if (this.labels) { sky.labels.hideAll('sit-'); this.labels = false; }
    if (st) { U.uCloud.value.y = st.cloud.y; U.uCloud.value.z = st.cloud.z; U.uCloud.value.w = st.cloud.w; k.atmos.moonPhase = st.moon; }
    this.dingOn = false; this.suiS = null;
    if (all) k.setVision(null);
  }
  /** 收起：天时还回此刻（同游时是园中此刻），月、云、雾、帧率都还回去。几时调都行，调几回都行 */
  end() {
    const k = this.k;
    try { this.clear(true); } finally {
      k.setVision(null);
      if (this.stash) k.atmos.moonPhase = this.stash.moon;
      k.veil = 0; k.world.fpsCap = 0;
      this.fade = null; this.tier = -1; this.stash = null;
    }
  }
  /** 此刻在不在天象里 */
  get deep() { return this.tier >= 0; }
}
