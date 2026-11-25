/**
 * 天时：一天里的时辰、四季、晴雾雨雪。画法里没有「光」，天时变的是纸色、雾色、墨色与雾的浓淡——
 * 这里把它们算出来，写进 ink.ts 那一组共用的量和天（sky.ts），整幅画就跟着变。
 *
 *   昼 —— 纸是素白，天几乎不染，远山是淡墨。
 *   晨昏 —— 纸带一点暖（不是黄），朝着日头那一边有一抹霞，日是一点朱。
 *   夜 —— 纸是深青，墨更重；白衣、花、水、窗纸这些「粉」的东西浮出来，月是留出来的一轮白。
 *   雾、雨 —— 贴地的雾浓起来，远山隐去；雨天纸色发灰、万物润湿。雪 —— 朝上的面留白。
 */
import * as THREE from 'three';
import { PIG, U, type RGB } from '../ink/ink';
import type { Painter } from '../ink/painter';
import { Sky } from './sky';
import { sceneSky } from './stars/astro';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'mist' | 'rain' | 'snow';

interface Pal { paper: RGB; mist: RGB; light: RGB; ink: RGB; skyPig: RGB; skyD: number; mtPig: RGB }
const PAL: Record<'day' | 'dawn' | 'dusk' | 'night', Pal> = {
  day: { paper: [0.945, 0.928, 0.887], mist: [0.955, 0.947, 0.925], light: [1, 0.995, 0.975], ink: [0.1, 0.1, 0.11], skyPig: PIG.qing, skyD: 0.06, mtPig: [0.58, 0.63, 0.7] },
  dawn: { paper: [0.94, 0.918, 0.89], mist: [0.95, 0.936, 0.922], light: [1, 0.985, 0.965], ink: [0.12, 0.112, 0.13], skyPig: [0.78, 0.76, 0.86], skyD: 0.18, mtPig: [0.58, 0.62, 0.71] },
  dusk: { paper: [0.94, 0.905, 0.86], mist: [0.945, 0.916, 0.884], light: [1, 0.97, 0.92], ink: [0.13, 0.105, 0.105], skyPig: [0.74, 0.74, 0.86], skyD: 0.4, mtPig: [0.59, 0.61, 0.69] },
  night: { paper: [0.2, 0.235, 0.3], mist: [0.225, 0.265, 0.335], light: [0.82, 0.86, 0.9], ink: [0.24, 0.26, 0.32], skyPig: [0.62, 0.66, 0.8], skyD: 1.1, mtPig: [0.6, 0.64, 0.74] },
};
/** 日出、日落的时刻；日头最高时的仰角（度） */
export const SUN: Record<Season, [number, number, number]> = { spring: [6.0, 18.2, 56], summer: [5.1, 19.1, 74], autumn: [6.3, 17.5, 52], winter: [7.0, 17.0, 34] };
/** 每季大约在一年的第几天（摆日月星斗用；第几日往后推，见 env/stars/astro.ts 的 skyDay） */
export const DAY: Record<Season, number> = { spring: 95, summer: 185, autumn: 280, winter: 5 };
/**
 * 换一季要几秒。草木（各层的叶与花、田里水边每季一套的）、地色、远树、雨雪雾与地上的积雪、晨昏之界、纸的冷暖、日月的方向
 * 都在这一段里一起从换的那一刻的样子走到新的一季（各处都用这一个数，同一帧起、同一帧完），中间不罩雾、不停顿。
 */
export const SEASON_FADE = 1.4;
/** 季节给纸一点点冷暖 */
const TINT: Record<Season, RGB> = { spring: [1, 1, 1], summer: [0.992, 1, 0.992], autumn: [1, 0.992, 0.978], winter: [0.985, 0.992, 1] };

const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const set3 = (c: THREE.Color, v: RGB) => c.setRGB(v[0], v[1], v[2]);
/** 两个钟点之间走近路的差（23 点到 1 点是 +2，不是 −22） */
const hourGap = (a: number, b: number) => { let d = b - a; if (d > 12) d -= 24; else if (d < -12) d += 24; return d; };

/** 换季那一刻画上的样子（换季的过渡从这里走起） */
interface SeasonFrom { k: number; hour: number; w: { rain: number; snow: number; mist: number }; cover: number; tint: RGB; sr: number; ss: number; sun: THREE.Vector3; moon: THREE.Vector3 }

export class Atmos {
  sky = new Sky();
  hour = 9; season: Season = 'spring'; weather: Weather = 'clear';
  /** 夜（0…1）、昼（0…1）、灯火该亮几成、晨与昏各占几成 */
  night = 0; day = 1; lamp = 0; dawn = 0; dusk = 0;
  /** 此刻的雨、雪、雾（0…1，渐变着的） */
  w = { rain: 0, snow: 0, mist: 0 };
  /** 积雪（0…1，下得久了才厚，停了慢慢化） */
  snowCover = 0;
  sunDir = new THREE.Vector3(0.5, 0.6, 0.5); moonDir = new THREE.Vector3(-0.3, 0.6, 0.5);
  /** 月相：0 朔、0.5 望 */
  moonPhase = 0.42;
  /** 风的大小（0…1 上下），草木与声音都用 */
  wind = 0.12;
  transitioning = false;
  /** 星斗另外往后拨几个钟头（观物亭里「候星移」时用：一夜的星在一会儿里转过去） */
  starShift = 0;
  private hourS = 9; private first = true;
  /**
   * 正在换季：换的那一刻画上的样子与走到了几成（0…1，走满 SEASON_FADE 秒）。这一段里时辰（晨还是晨、昏还是昏）、晨昏之界、
   * 纸的冷暖、雨雪雾、地上的积雪、日月的方向都从那一刻匀匀地走到新的一季；接连换几季，每一回都从画上此刻的样子接着走。
   */
  private sf: SeasonFrom | null = null;
  /** 画上此刻用的晨昏之界与纸的冷暖（换季时是插出来的） */
  private srNow = SUN.spring[0]; private ssNow = SUN.spring[1]; private tintNow: RGB = TINT.spring;
  /** 星斗按哪一季的天排、亮几成：换季时星斗（连月）先淡下去，淡尽了才换成新一季的天再亮起来——满天星不会一下子跳到别处 */
  private skySeason: Season = 'spring'; private starK = 1;

  constructor(scene: THREE.Scene, private painter: Painter) { scene.add(this.sky.group); }

  /** 正在换季（那一小段过渡里） */
  get seasonFading() { return !!this.sf; }
  setHour(h: number, instant = false) { this.hour = ((h % 24) + 24) % 24; if (instant) { this.hourS = this.hour; if (this.sf) this.sf.hour = this.hour; } }
  setSeason(s: Season) {
    if (s === this.season) return;
    this.season = s;
    // 还没画过（开场）：直接就是这一季
    if (this.first) { this.skySeason = s; this.srNow = SUN[s][0]; this.ssNow = SUN[s][1]; this.tintNow = TINT[s]; return; }
    const tn = this.tintNow;
    this.sf = { k: 0, hour: this.hourS, w: { ...this.w }, cover: this.snowCover, tint: [tn[0], tn[1], tn[2]], sr: this.srNow, ss: this.ssNow, sun: this.sunDir.clone(), moon: this.moonDir.clone() };
  }
  setWeather(w: Weather, instant = false) {
    this.weather = w;
    if (instant) {
      this.w.rain = w === 'rain' ? 1 : 0; this.w.snow = w === 'snow' ? 1 : 0; this.w.mist = w === 'mist' ? 1 : 0; this.snowCover = w === 'snow' ? 0.85 : 0;
      if (this.sf) { this.sf.w = { ...this.w }; this.sf.cover = this.snowCover; }
    }
  }

  update(dt: number, t: number) {
    if (this.first) { this.hourS = this.hour; this.first = false; }
    const sf = this.sf;
    if (sf) sf.k = Math.min(1, sf.k + dt / SEASON_FADE);
    const e = sf ? sm(0, 1, sf.k) : 1;
    if (sf) {
      // 换季：时辰从换的那一刻跟着这一段一起走到要去的时刻（「晨」换了季还是晨：钟点与日出一起挪）
      this.hourS = (sf.hour + hourGap(sf.hour, this.hour) * e + 24) % 24;
      this.transitioning = Math.abs(hourGap(this.hourS, this.hour)) > 0.02;
    } else {
      // 时辰慢慢走到要去的时刻（走近路：23 点到 1 点不绕一整天）
      const dh = hourGap(this.hourS, this.hour);
      this.transitioning = Math.abs(dh) > 0.02;
      this.hourS = (this.hourS + dh * Math.min(1, dt * 0.9) + 24) % 24;
    }
    const W = this.w, to = { rain: this.weather === 'rain' ? 1 : 0, snow: this.weather === 'snow' ? 1 : 0, mist: this.weather === 'mist' ? 1 : 0 };
    if (sf) {
      // 换季：雨雪雾在这一段里换成这一季的天；地上的积雪也是——下着雪就是一地雪（至少八成五），不下雪就没有，
      // 不照「停了雪慢慢化」那样化一分多钟（冬天的雪留到了夏天，地是白的、树是绿的）
      W.rain = sf.w.rain + (to.rain - sf.w.rain) * e; W.snow = sf.w.snow + (to.snow - sf.w.snow) * e; W.mist = sf.w.mist + (to.mist - sf.w.mist) * e;
      const cover = this.weather === 'snow' ? Math.max(0.85, sf.cover) : 0;
      this.snowCover = sf.cover + (cover - sf.cover) * e;
    } else {
      const k = Math.min(1, dt * 0.45);
      W.rain += (to.rain - W.rain) * k; W.snow += (to.snow - W.snow) * k; W.mist += (to.mist - W.mist) * k;
      this.snowCover = Math.max(0, Math.min(1, this.snowCover + (W.snow > 0.5 ? dt * 0.03 : -dt * 0.012)));
    }

    // 这一季的日出日落、纸的冷暖（换季时从换的那一刻插过来）
    let sr = SUN[this.season][0], ss = SUN[this.season][1], tint = TINT[this.season];
    if (sf) { sr = sf.sr + (sr - sf.sr) * e; ss = sf.ss + (ss - sf.ss) * e; tint = mix3(sf.tint, tint, e); }
    this.srNow = sr; this.ssNow = ss; this.tintNow = tint;
    const h = this.hourS;
    // 夜、晨、昏各占几成
    const night = h < 12 ? 1 - sm(sr - 1.1, sr + 0.25, h) : sm(ss + 0.15, ss + 1.5, h);
    const dawn = Math.max(0, 1 - Math.abs(h - (sr + 0.15)) / 1.35), dusk = Math.max(0, 1 - Math.abs(h - (ss - 0.25)) / 1.5);
    this.night = night; this.day = 1 - night; this.dawn = dawn; this.dusk = dusk;
    this.lamp = Math.max(night, 0.8 * sm(0.3, 1, dusk) * (h > 12 ? 1 : 0), 0.5 * W.rain);
    let P: Pal = PAL.day;
    const blend = (a: Pal, b: Pal, x: number): Pal => ({ paper: mix3(a.paper, b.paper, x), mist: mix3(a.mist, b.mist, x), light: mix3(a.light, b.light, x), ink: mix3(a.ink, b.ink, x), skyPig: mix3(a.skyPig, b.skyPig, x), skyD: a.skyD + (b.skyD - a.skyD) * x, mtPig: mix3(a.mtPig, b.mtPig, x) });
    P = blend(P, PAL.dawn, sm(0, 1, dawn)); P = blend(P, PAL.dusk, sm(0, 1, dusk)); P = blend(P, PAL.night, night);
    // 季节给纸一点点冷暖（tint，上面按季取的）；雨天发灰，雾天发白，雪天清冷
    const grey = 1 - 0.13 * W.rain * (1 - 0.6 * night) - 0.03 * W.mist, cool: RGB = [1 - 0.02 * W.rain - 0.012 * W.snow, 1 - 0.008 * W.rain, 1 + 0.012 * W.snow];
    const fin = (c: RGB): RGB => [c[0] * tint[0] * grey * cool[0], c[1] * tint[1] * grey * cool[1], Math.min(1, c[2] * tint[2] * grey * cool[2])];
    set3(U.uPaper.value, fin(P.paper)); set3(U.uMist.value, fin(mix3(P.mist, P.paper, 0.35 * W.mist))); set3(U.uLight.value, fin(P.light)); set3(U.uInk.value, P.ink);
    this.painter.fadeColor.copy(U.uMist.value);
    U.uNight.value = night;
    U.uWet.value = W.rain;
    U.uSnow.value = this.snowCover;
    // 雾：晨雾重一些；雾天、雨雪天贴地的雾浓起来，远山隐去
    const thick = 1 + 2.2 * dawn + 7 * W.mist + 4.5 * W.rain + 3 * W.snow + 0.6 * night;
    U.uFog.value.set(0.0016 * thick, 0.012 / (1 + 0.5 * W.mist + 0.3 * dawn), 2, 0.00008 * (1 + 1.8 * W.mist + 1.6 * W.rain + 1.2 * W.snow + 0.4 * dawn));
    U.uFar.value.set(0.965, 60, 300 - 120 * Math.max(W.mist, W.rain), 0.9);
    U.uCloud.value.x = 0.9 * (1 - 0.5 * night);

    // 日月的位置：按天文算（env/stars/astro.ts）——那一天的太阳从东南或东北升起、正午在正南、多高都是真的，
    // 日出日落正落在上面那张表的时刻；月在日之东「盈亏 × 360°」处，跟着白道有高有低。
    // 换季时星斗（连月）先淡下去，淡尽了才把天换成新一季的，再亮起来（星斗、月轮按 skySeason 排）
    if (this.skySeason !== this.season) { this.starK = Math.max(0, this.starK - dt / (SEASON_FADE / 2)); if (this.starK <= 0) this.skySeason = this.season; }
    else if (this.starK < 1) this.starK = Math.min(1, this.starK + dt / (SEASON_FADE / 2));
    const ks = this.skySeason, here = ks === this.season;
    const now = this.sky.clock({ season: ks, base: DAY[ks], sr: here ? sr : SUN[ks][0], ss: here ? ss : SUN[ks][1], hour: h, phase: this.moonPhase, shift: this.starShift });
    // 分阴阳向背的日、月方向总是这一季的（星斗还没换过来时另算一份）；换季时从换的那一刻的方向匀匀转过去，明暗不会一下子跳
    const cur = here ? now : sceneSky({ season: this.season, base: DAY[this.season], sr, ss, kday: this.sky.dayFn ? this.sky.dayFn() : 0, hour: h, phase: this.moonPhase, shift: this.starShift });
    this.sunDir.set(cur.sunW[0], cur.sunW[1], cur.sunW[2]);
    this.moonDir.set(cur.moonW[0], cur.moonW[1], cur.moonW[2]);
    if (sf) { this.sunDir.lerpVectors(sf.sun, this.sunDir, e).normalize(); this.moonDir.lerpVectors(sf.moon, this.moonDir, e).normalize(); }
    // 分阴阳向背的「光」：白天跟日，夜里跟月；压得太低时抬一抬（不然全是背光）
    const key = U.uKey.value.copy(night > 0.5 ? this.moonDir : this.sunDir);
    key.y = Math.max(key.y, 0.34); key.normalize();

    // 天
    const s = this.sky.u, clear = 1 - Math.max(W.mist, W.rain, W.snow);
    set3(s.uSkyPig.value, P.skyPig);
    // 晴夜里云（留白的那几块）淡一些，星空干净
    s.uSky.value.set(P.skyD * (1 + 0.9 * W.rain + 0.4 * W.snow), 0.85 * clear * (1 - 0.5 * night), night * clear, 0);
    const low = sm(0.5, 0.08, this.sunDir.y);
    set3(s.uGlowPig.value, mix3([0.99, 0.74, 0.66], [0.98, 0.62, 0.42], h > 12 ? 1 : 0));
    s.uGlow.value.set(this.sunDir.x, 0, this.sunDir.z, (0.9 * dawn + 1.5 * dusk) * clear);
    s.uSunDir.value.copy(this.sunDir);
    // 日：低的时候是一点朱，高了淡成近乎纸色
    const sc = mix3([1, 0.95, 0.86], [0.9, 0.44, 0.36], low);
    s.uSun.value.set(sc[0], sc[1], sc[2], this.sunDir.y > -0.03 ? 0.021 * clear * (1 - night) * (0.55 + 0.45 * low) : 0);
    // 月：画的是跟着星斗走的那个（候星移时一起转）；亮面朝日，明暗界由日月的角距定；白天也淡淡地看得见（离日远时）
    const md = this.sky.moonDraw, cosE = this.sunDir.dot(this.moonDir), illum = (1 - cosE) / 2;
    const moonUp = sm(0.02, 0.12, md.y), dayMoon = (1 - night) * 0.3 * sm(0.35, 0.75, illum);
    s.uMoonDir.value.copy(md);
    s.uMoon.value.set(md.y > -0.04 ? 0.034 : 0, cosE, (night + dayMoon) * clear * moonUp * this.starK, night);
    set3(s.uMtPig.value, P.mtPig);
    s.uMt.value.x = 1 - 0.75 * W.mist - 0.85 * W.rain - 0.7 * W.snow;
    this.sky.update(dt, { night, clear: clear * this.starK, moonUp: night > 0.3 ? moonUp : 0, illum });
    if (sf && sf.k >= 1) this.sf = null;

    // 风：慢慢变向、时强时弱；雨雪天大些
    const wa = 0.6 + Math.sin(t * 0.021) * 0.5 + Math.sin(t * 0.0073) * 0.4;
    this.wind = (0.09 + 0.06 * Math.sin(t * 0.13) + 0.04 * Math.sin(t * 0.31 + 2)) * (1 + 0.8 * W.rain + 0.4 * W.snow);
    U.uWind.value.set(Math.cos(wa), Math.sin(wa), this.wind, 1);
  }
}
