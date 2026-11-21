/**
 * 天与远山。天就是纸：高处罩一层极淡的色，云是留出来的白，近地平处化成雾。
 * 远山（东南望去的嵩山：太室在东、少室偏南）是画在天上的几重淡墨——越远越淡，山脚化在雾里；四围是一带低冈。
 * 日是一点朱，月是留出来的一轮白（亮的一边朝着日头），夜里是真的星空：
 *
 *   星 —— 依巴谷星表里亮于 6 等的五千多颗，按洛阳的纬度、画里的日子与时辰（恒星时）摆好（env/stars/）。
 *   天汉 —— 按银道坐标现画的一条淡淡的白晕，有明有暗，中间有暗隙（env/stars/milkyway.ts）。
 *   五星 —— 岁星、荧惑、镇星、太白、辰星，按轨道根数算今年这一天在哪。
 *   星官 —— 三垣二十八宿的连线与名字，平时不显，观星时才一笔一笔描出来（env/stars/layers.ts）。
 *
 * 日、月也按天文算（env/stars/astro.ts）：日出日落对着 atmos.ts 那张表，日走那一天真实的路；月在日之东「盈亏 × 360°」处。
 *
 * 给别处用的（都在 k.atmos.sky 上）：
 *   star(i)        北斗七星（0 天枢 … 6 摇光）与北极星（7，勾陈一）此刻在世界里的方向（+x 东、+y 上、+z 南；单位向量）
 *   dir(i)         星表里第 i 颗星此刻的方向；data（星表、星官、星名，见 env/stars/catalog.ts）
 *   pick(方向)     点在天上的这一下点着了什么（星、星官的连线、五星）
 *   lines / labels 星官的连线与名字（显、隐、流星）
 *   chart()        此刻天的样子（恒星时、纬度、五星……），册子里的星图用
 */
import * as THREE from 'three';
import { INK_PARS, PIG, U, type RGB } from '../ink/ink';
import { altAz, app3, D2R, EQ_TO_GAL, eqVec, LAT, mul3, planets, PLANETS, sceneSky, tr3, type M3 } from './stars/astro';
import { SHOWERS } from '../../data/starlore';
import { loadSky, nearest, segDist, type SkyData } from './stars/catalog';
import { LabelLayer, LineLayer, RIDGE_GLSL, StarLayer, SU } from './stars/layers';
import { emptyMilkyWay, MW_B, paintMilkyWay } from './stars/milkyway';

const SKY_V = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  // 贴在最远处：别的东西画过的地方就不再画天
  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}
`;
const SKY_F = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${INK_PARS}
uniform vec3 uSkyPig; uniform vec4 uSky;
uniform vec3 uGlowPig; uniform vec4 uGlow;
uniform vec3 uSunDir; uniform vec4 uSun;
uniform vec3 uMoonDir; uniform vec4 uMoon;
uniform vec3 uMtPig; uniform vec4 uMt;
uniform sampler2D tMW; uniform mat3 uGal; uniform vec4 uMW;
varying vec3 vDir;
${RIDGE_GLSL}
float fb2(vec2 p) { return n2(p) * 0.5 + n2(p * 2.03 + 3.1) * 0.25 + n2(p * 4.1 + 7.7) * 0.125 + n2(p * 8.3 + 1.3) * 0.0625; }
// 一重山：h 山脊的高（仰角的正切），t 这一点的高，dens 山头的浓度；山脚淡进雾里
vec3 range(vec3 c, float t, float h, float dens, float foot) {
  float aa = fwidth(t) * 1.2 + 1e-5;
  float cover = smoothstep(h + aa, h - aa, t);
  float k = smoothstep(h - (h + 0.02) * foot, h, t);
  float d = dens * mix(0.0, 1.0, pow(k, 1.4));
  // 山头一道略深的边（一笔淡墨的水痕）
  d += dens * 0.22 * smoothstep(h - 0.004, h - 0.0008, t);
  return mix(c, uMist * pow(uMtPig, vec3(max(d, 0.0))), cover * uMt.x);
}
void main() {
  vec3 d = normalize(vDir);
  vec2 u = normalize(d.xz + vec2(1e-6, 0.0));
  float t = d.y / max(length(d.xz), 1e-4);
  float el = max(d.y, 0.0);
  // 天：高处一层淡色；云是没染到的地方
  float cl = fb2(d.xz / (d.y + 0.35) * 1.35 + vec2(uTime * 0.004, 0.0));
  float wash = uSky.x * pow(smoothstep(0.0, 0.85, el), 0.8) * (1.0 - uSky.y * smoothstep(0.42, 0.68, cl));
  wash += uSky.x * 0.55 * smoothstep(0.02, 0.5, el) * uSky.y * 0.25;
  vec3 c = mix(uMist, uPaper, smoothstep(0.0, 0.22, t)) * pow(uSkyPig, vec3(wash));
  // 霞：朝着日出日落那一边、贴近地平的一抹
  float gl = uGlow.w * pow(max(dot(u, normalize(uGlow.xz + vec2(1e-5))), 0.0), 2.0) * exp(-max(t, 0.0) * 4.5) * smoothstep(-0.02, 0.05, t);
  c *= pow(uGlowPig, vec3(gl));
  // 晴夜：天往高处一层层沉下去——天顶最深，近地平仍是雾里透出来的一点亮；星与天汉才托得出来
  c *= 1.0 - 0.42 * uSky.z * smoothstep(0.02, 0.6, el);
  // 天汉：一条淡白的光带，有明有暗；暗隙处比夜色还略深一点。月只淡它身旁三十来度（uMW.w 是月光几成）
  if (uMW.x > 0.001 || uMW.z > 0.001) {
    float mwK = uMW.x * (1.0 - 0.75 * uMW.w * smoothstep(0.8, 0.985, dot(d, uMoonDir)));
    vec3 g = uGal * d;
    float bd = asin(clamp(g.z, -1.0, 1.0)) * 57.29578;
    if (abs(bd) < ${MW_B.toFixed(1)}) {
      vec4 mw = texture2D(tMW, vec2(fract(atan(g.y, g.x) / 6.2831853 + 1.0), bd / ${(2 * MW_B).toFixed(1)} + 0.5));
      float edge = 1.0 - smoothstep(0.8, 1.0, abs(bd) / ${MW_B.toFixed(1)});
      // 贴着地平（五度以下）才淡下去：漫游时镜头只看得到天的下半截，这一截里也要看得见银河
      float low = smoothstep(0.0, 0.14, t);
      // 细细的颗粒：远看是一片白晕，近看是数不清的微星
      float gr = n2(vec2(atan(g.y, g.x), bd * 0.01745) * 420.0) * 0.6 + n2(vec2(atan(g.y, g.x), bd * 0.01745) * 1300.0) * 0.4;
      // 颜色是不偏蓝紫的素白（淡墨留出来的那种白）
      vec3 mwc = vec3(dot(uLight, vec3(0.3, 0.52, 0.18))) * vec3(1.0, 0.985, 0.95);
      c = mix(c, mwc, pow(mw.r, 1.12) * edge * low * mwK * (0.74 + 0.52 * gr));
      c *= 1.0 - mw.g * edge * low * uMW.y;
    }
    // 微尘：数不清、看不清一颗颗的暗星（六等以下那一层），银道附近密；极淡，只是让天有「满」的意思
    if (uMW.z > 0.001) {
      // 在单位球上按三维格子撒点（不按经纬撒——那样高纬处点会拉成斜的短划）：每格里一个随机点，球面落在它旁边的才看得见，所以点是圆的
      float lat = bd * 0.01745329;
      vec3 p = normalize(g) * 420.0, ci = floor(p);
      // （银道上密得多：天汉看上去是一片数不清的细星，不只是一团白气）
      float dens = 0.05 + 0.34 * exp(-abs(lat) * 7.0);
      if (ih(ci + 51.7) < dens) {
        vec3 q = ci + 0.2 + 0.6 * ih3(ci + 3.1);
        float rr = length(p - q), aa = fwidth(rr) * 1.3 + 1e-4;
        float s = smoothstep(0.17 + aa, 0.17 - aa, rr) * (0.3 + 0.7 * ih(ci + 17.3));
        c = mix(c, uLight, s * uMW.z * smoothstep(0.02, 0.2, t));
      }
    }
  }
  // 月：留出来的一轮白，亮的一边朝着日头；暗的那一边隐约看得见（灰光）；四周的夜色淡一圈
  if (uMoon.x > 0.0 && uMoon.z > 0.001) {
    vec3 sd = uSunDir - dot(uSunDir, uMoonDir) * uMoonDir;
    vec3 sx = length(sd) > 1e-4 ? normalize(sd) : normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
    vec3 sy = cross(uMoonDir, sx);
    vec2 q = vec2(dot(d, sx), dot(d, sy)) / uMoon.x;
    float rr = length(q), front = step(0.0, dot(d, uMoonDir));
    // 亮面：x（朝日的那一边）大过明暗界（一个半椭圆，cos 日月角距）
    float lit = smoothstep(-0.05, 0.05, q.x - uMoon.y * sqrt(max(0.0, 1.0 - q.y * q.y)));
    float disc = smoothstep(1.0, 0.94, rr) * front;
    c = mix(c, uLight, exp(-rr * rr * 0.22) * 0.22 * uMoon.z * uMoon.w * front);
    c = mix(c, uLight * vec3(1.0, 0.99, 0.96), disc * (lit + (1.0 - lit) * 0.07 * uMoon.w) * uMoon.z);
  }
  // 日：一点朱
  if (uSun.a > 0.0) {
    float sd = acos(clamp(dot(d, uSunDir), -1.0, 1.0)) / uSun.a;
    c = mix(c, c * mix(vec3(1.0), uSun.rgb, 0.35) + 0.05, exp(-sd * sd * 0.1) * 0.5);
    c = mix(c, uSun.rgb * mix(vec3(1.0), uPaper, 0.25), smoothstep(1.0, 0.86, sd) * 0.92);
  }
  // 远山三重
  if (uMt.x > 0.001) {
    vec3 hs = ridges(u);
    c = range(c, t, hs.x, 0.13 * uMt.w, 0.95);
    c = range(c, t, hs.y, 0.24 * uMt.w, 0.9);
    c = range(c, t, hs.z, 0.42 * uMt.w, 0.85);
  }
  c = mix(uMist, c, smoothstep(-0.012, 0.004, t));
  gl_FragColor = vec4(c, 1.0);
  gAux = vec4(0.5, 0.5, 0.0, 0.0);
}
`;

const col = (c: RGB) => new THREE.Color(c[0], c[1], c[2]);
const setM = (m: THREE.Matrix3, a: M3) => m.set(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]);
/** 各档画多少颗星（星表按星等排好，取前 n 颗）、天汉画多大 */
const TIER = { low: { limit: 5.0, mw: [512, 112] }, mid: { limit: 5.6, mw: [768, 160] }, high: { limit: 6.0, mw: [1024, 224] } } as const;
type Tier = keyof typeof TIER;

/** 点着的东西 */
export type Picked =
  | { kind: 'star'; star: number; asterism: number | null; dist: number }
  | { kind: 'line'; asterism: number; dist: number }
  | { kind: 'planet'; planet: number; dist: number };

export class Sky {
  mesh: THREE.Mesh;
  /** 天与星的几层（atmos 把它放进场景） */
  group = new THREE.Group();
  data: SkyData;
  stars: StarLayer; lines: LineLayer; labels: LabelLayer;
  u = {
    /** 高处罩的颜色 */ uSkyPig: { value: col(PIG.qing) },
    /** x 罩色的浓度，y 云（留白）的多少，z 星的显隐 */ uSky: { value: new THREE.Vector4(0.1, 0.85, 0, 0) },
    /** 霞的颜色 */ uGlowPig: { value: col(PIG.zhe) },
    /** xyz 霞在哪一边（水平方向），w 浓度 */ uGlow: { value: new THREE.Vector4(1, 0, 0, 0) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    /** rgb 日的颜色，a 大小（弧度；0 不画） */ uSun: { value: new THREE.Vector4(0.86, 0.3, 0.22, 0) },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    /** x 月的大小（弧度；0 不画），y 日月角距的余弦（定明暗界），z 亮度，w 夜里几成（灰光、月晕只在夜里） */ uMoon: { value: new THREE.Vector4(0, -1, 1, 1) },
    /** 远山的颜色（远山如黛） */ uMtPig: { value: col([0.6, 0.62, 0.655]) },
    /** x 远山的显隐，yz 嵩山在哪个方向（水平单位向量 x、z），w 浓度（星点也用它判断落没落在山后） */ uMt: SU.uMt,
    /** 天汉：图、世界 → 银道、x 浓淡 y 暗隙 */
    tMW: { value: emptyMilkyWay() as THREE.Texture }, uGal: { value: new THREE.Matrix3() }, uMW: { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  /** 此刻的天（atmos 每帧算一次） */
  now: ReturnType<typeof sceneSky> | null = null;
  /** 第几日（总装的 k.day）怎么取：观星那件事建好时接上；没接就当第 0 日 */
  dayFn: (() => number) | null = null;
  tier: Tier = 'mid';
  /** 五星此刻：J2000 方向、星等、离日的角距 */
  planets: ReturnType<typeof planets> = [];
  private planetT = -1;
  private mwAsked = false;
  private dip = Array.from({ length: 8 }, () => new THREE.Vector3(0, 1, 0));
  private moonS = new THREE.Vector3();
  private Mt = new Float64Array(9);
  constructor() {
    this.data = loadSky();
    const m = new THREE.ShaderMaterial({ uniforms: { ...U, ...this.u }, vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1000;
    this.mesh.name = 'sky';
    this.stars = new StarLayer(this.data); this.lines = new LineLayer(this.data); this.labels = new LabelLayer();
    this.group.add(this.mesh, this.stars.mesh, this.lines.mesh, this.labels.mesh);
    this.group.name = '天';
    // 像素比：画的时候问渲染器（画质会自己升降）
    this.stars.mesh.onBeforeRender = (r) => { SU.uSt.value.z = r.getPixelRatio(); };
    this.setQuality('mid', false);
  }
  /** 画质档：画多少颗星、天汉画多大（总装建好观星那件事时按 k.q 设） */
  setQuality(tier: string, paint = true) {
    const t: Tier = tier === 'low' || tier === 'high' ? tier : 'mid';
    this.tier = t;
    const S = this.data.stars, lim = TIER[t].limit;
    let n = 0; while (n < S.n && S.mag[n] <= lim) n++;
    // 星官里的星不论多暗都在表的后面，各档都把它们收进来（连线要接得上）：这里只截亮于 limit 的那一段
    this.stars.setCount(t === 'high' ? S.n : n);
    if (paint) this.paintMW();
  }
  private paintMW() {
    if (this.mwAsked) return;
    this.mwAsked = true;
    const [w, h] = TIER[this.tier].mw;
    paintMilkyWay(w, h, (tex) => { this.u.tMW.value.dispose(); this.u.tMW.value = tex; });
  }

  /**
   * 拨天：季节（与那一季的日子）、画里的钟点（表上的日出日落）、月相、星斗多拨的钟头。atmos 每帧调一次。
   * 算好太阳、月亮在世界里的方向（now.sunW / now.moonW，不含多拨），星斗的矩阵。
   */
  clock(o: { season: string; base: number; sr: number; ss: number; hour: number; phase: number; shift: number }) {
    const kday = this.dayFn ? this.dayFn() : 0;
    const now = sceneSky({ season: o.season, base: o.base, sr: o.sr, ss: o.ss, kday, hour: o.hour, phase: o.phase, shift: o.shift });
    this.now = now;
    setM(SU.uM.value, now.M);
    tr3(now.M, this.Mt);
    // 天汉：世界 → 银道 = 银道←J2000 · J2000←世界
    setM(this.u.uGal.value, mul3(EQ_TO_GAL, this.Mt));
    // 北斗与北极星（给认北斗、观物用）
    const S = this.data.stars.dir;
    this.data.dipper.forEach((s, i) => { const v = app3(now.M, S[s * 3], S[s * 3 + 1], S[s * 3 + 2]); this.dip[i].set(v[0], v[1], v[2]); });
    // 月：画的时候跟着星斗转（候星移时一起走）；照亮万物用的是不多拨的那个（atmos.moonDir）
    if (o.shift) {
      const back = mul3(now.M, tr3(now.M0)), mv = app3(back, now.moonW[0], now.moonW[1], now.moonW[2]);
      this.moonS.set(mv[0], mv[1], mv[2]);
    } else this.moonS.set(now.moonW[0], now.moonW[1], now.moonW[2]);
    // 五星：慢，隔一会儿算一次
    if (this.planetT < 0 || Math.abs(now.d - this.planetT) > 0.02) {
      this.planetT = now.d;
      this.planets = planets(now.d);
      this.planets.forEach((p, i) => this.stars.setPlanet(i, app3(now.P, ...p.dir), p.mag, PLANETS[i].bv));
    }
    return now;
  }
  /** 画月时用的方向（含多拨） */
  get moonDraw() { return this.moonS; }

  /**
   * 每帧：星、天汉、连线、名字的显隐。night 夜几成，clear 晴几成，moonUp 月在地平上几成，illum 月面亮几成（0 朔 … 1 望）。
   */
  update(dt: number, o: { night: number; clear: number; moonUp: number; illum: number }) {
    if (!this.mwAsked && o.night > 0.05) this.paintMW();
    const moonK = o.moonUp * o.illum * o.clear;
    const vis = o.night * o.clear;
    // 月光洗星要克制：无月之夜看得到 6 等多，月大时也还有五等半上下；只在月旁二三十度里明显少（画上要看得见星河，比真的夜宽厚一些）。
    // （画多少颗由画质档定：setQuality 截的是星表的前几颗；这里定的是那些星里哪些看得见）
    const lim = 6.2 - 0.6 * moonK;
    SU.uSt.value.set(vis, lim, SU.uSt.value.z, 0.5 * moonK);
    SU.uMoonW.value.copy(this.moonS);
    this.stars.mesh.visible = vis > 0.004;
    // 天汉：晴夜里总是一道看得清的光带（无月时最亮）；月大时整条略淡、月旁那一段淡得多（月旁的在着色器里按月的方向减）
    this.u.uMW.value.set(vis * (0.6 - 0.18 * moonK), vis * 0.17 * (1 - 0.35 * moonK), vis * (0.66 - 0.16 * moonK), moonK);
    this.lines.master = Math.min(1, vis * 1.15);
    // 流星：晴夜里偶尔一颗；流星雨那几夜多一些（观星时 meteorRate 也调高）
    if (vis > 0.6 && this.now) {
      const sh = this.shower();
      if (Math.random() < this.meteorRate * (1 + (sh ? sh.k * sh.rate / 8 : 0)) * (1 - 0.6 * moonK) * dt) this.meteor(sh);
    }
    this.lines.update(dt);
    this.labels.update(dt);
    if (vis < 0.01) { this.lines.mesh.visible = false; this.labels.mesh.visible = false; }
  }
  /** 平时一夜里流星的多少：每秒几颗（观星时调高） */
  meteorRate = 1 / 140;
  /** 划出一颗流星时（给声音：观星那件事接上，出一缕极轻的嘶声） */
  onMeteor: (() => void) | null = null;
  /** 今夜有没有流星雨：k 盛衰（0…1），rate 一个时辰几颗，dir 辐射点（J2000），near 辐射点附近的星官名 */
  shower(): { k: number; rate: number; dir: [number, number, number]; near: string } | null {
    const doy = this.now?.doy ?? 0;
    if (this.showerAt.doy === doy) return this.showerAt.v;
    this.showerAt = { doy, v: this.findShower(doy) };
    return this.showerAt.v;
  }
  private showerAt: { doy: number; v: ReturnType<Sky['findShower']> } = { doy: -1, v: null };
  private findShower(doy: number): { k: number; rate: number; dir: [number, number, number]; near: string } | null {
    for (const s of SHOWERS) {
      let dd = doy - s.peak; if (dd > 182) dd -= 365; if (dd < -182) dd += 365;
      if (dd < -s.before || dd > s.after) continue;
      const k = Math.exp(-0.5 * (dd / (dd < 0 ? s.before / 2 : s.after / 2)) ** 2);
      const dir = eqVec(s.ra * D2R, s.dec * D2R);
      let near = '', best = -2;
      for (const a of this.data.asterisms) { const c = a.center[0] * dir[0] + a.center[1] * dir[1] + a.center[2] * dir[2]; if (c > best && a.stars.length > 1) { best = c; near = a.name; } }
      return { k, rate: s.rate, dir, near };
    }
    return null;
  }
  /** 划一颗流星。有流星雨时多半从辐射点那边射出来 */
  meteor(sh = this.shower()): boolean {
    const rnd = Math.random, w = new THREE.Vector3(), e = new THREE.Vector3();
    const rad = sh && rnd() < 0.8 ? this.toWorld(sh.dir) : null;
    for (let tries = 0; tries < 12; tries++) {
      // 起点：地平线上二十度以上的一处
      const az = rnd() * Math.PI * 2, el = (22 + rnd() * 55) * D2R;
      w.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
      let dir: THREE.Vector3;
      if (rad && rad.y > -0.1) {
        // 背着辐射点走
        if (w.angleTo(rad) < 0.15) continue;
        dir = w.clone().sub(rad.clone().multiplyScalar(w.dot(rad))).normalize();
      } else dir = new THREE.Vector3(rnd() - 0.5, -0.35 - rnd() * 0.5, rnd() - 0.5).sub(w.clone().multiplyScalar(0)).normalize();
      dir.sub(w.clone().multiplyScalar(dir.dot(w))).normalize();
      const len = (7 + rnd() * 16) * D2R;
      e.copy(w).multiplyScalar(Math.cos(len)).addScaledVector(dir, Math.sin(len)).normalize();
      if (e.y < 0.12) continue;
      const ok = this.lines.meteor(this.toEq(w), this.toEq(e), 0.45 + rnd() * 0.7, 0.25 + rnd() * 0.6);
      if (ok) this.onMeteor?.();
      return ok;
    }
    return false;
  }

  /** 北斗某一颗此刻在天上哪里（0 天枢 … 6 摇光，7 北极星）：世界方向 */
  star(i: number) { return this.dip[Math.max(0, Math.min(7, i))]; }
  /** 星表里第 i 颗星此刻在世界里的方向 */
  dir(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const S = this.data.stars.dir, M = this.now?.M;
    if (!M) return out.set(0, 1, 0);
    const v = app3(M, S[i * 3], S[i * 3 + 1], S[i * 3 + 2]);
    return out.set(v[0], v[1], v[2]);
  }
  /** J2000 方向 → 此刻的世界方向 */
  toWorld(v: ArrayLike<number>, out = new THREE.Vector3()): THREE.Vector3 {
    const M = this.now?.M; if (!M) return out.set(0, 1, 0);
    const w = app3(M, v[0], v[1], v[2]); return out.set(w[0], w[1], w[2]);
  }
  /** 世界方向 → J2000 方向 */
  toEq(w: THREE.Vector3): [number, number, number] {
    const v = app3(this.Mt, w.x, w.y, w.z); return [v[0], v[1], v[2]];
  }
  /** 五星 i 此刻的 J2000 方向（已加岁差前的；画、点都用这个） */
  planetEq(i: number): [number, number, number] { const p = this.planets[i]; if (!p || !this.now) return [0, 0, 1]; const v = app3(this.now.P, ...p.dir); return [v[0], v[1], v[2]]; }

  /**
   * 点在天上：方向 w（世界）、容差 tol（弧度，约等于手指的大小）。先看五星，再看星（越亮越好点），再看连线（只在连线显着时）。
   * 落在地平以下、月旁看不见的不算。
   */
  pick(w: THREE.Vector3, tol: number, o: { lines?: boolean } = {}): Picked | null {
    if (w.y < 0.02) return null;
    const v = this.toEq(w);
    // 五星
    for (let i = 0; i < this.planets.length; i++) {
      const p = this.planetEq(i), ang = Math.acos(Math.min(1, p[0] * v[0] + p[1] * v[1] + p[2] * v[2]));
      const sunUp = this.now ? altAz(this.now.sunW).alt : -90, vis = this.planets[i].mag < SU.uSt.value.y + 3 && sunUp < -4;
      if (vis && ang < tol * 1.1 && this.toWorld(p).y > 0.03) return { kind: 'planet', planet: i, dist: ang };
    }
    const S = this.data.stars;
    const s = nearest(S, v, tol, Math.max(4.2, SU.uSt.value.y - 0.4));
    if (s >= 0 && this.dir(s).y > 0.03) {
      const as = this.data.byStar.get(s) ?? [];
      // 一颗星在几个星官里时，取连线里有它的那个
      const a = as.find((i) => this.data.asterisms[i].segs.includes(s)) ?? as[0] ?? null;
      return { kind: 'star', star: s, asterism: a, dist: Math.acos(Math.min(1, S.dir[s * 3] * v[0] + S.dir[s * 3 + 1] * v[1] + S.dir[s * 3 + 2] * v[2])) };
    }
    if (o.lines) {
      let best = -1, bd = tol * 0.7;
      for (const a of this.data.asterisms) {
        if (a.radius + bd < Math.acos(Math.min(1, a.center[0] * v[0] + a.center[1] * v[1] + a.center[2] * v[2]))) continue;
        for (let k = 0; k + 1 < a.segs.length; k += 2) {
          const p = a.segs[k] * 3, q = a.segs[k + 1] * 3;
          const dd = segDist(v, [S.dir[p], S.dir[p + 1], S.dir[p + 2]], [S.dir[q], S.dir[q + 1], S.dir[q + 2]]);
          if (dd < bd) { bd = dd; best = a.i; }
        }
      }
      if (best >= 0) return { kind: 'line', asterism: best, dist: bd };
    }
    return null;
  }

  /** 此刻天的样子：给册子里的星图（StarSheet）。lst 当地恒星时（弧度，含多拨），lat 纬度（弧度），P 岁差（J2000 → 当日） */
  chart() {
    const n = this.now;
    return { lst: n?.lst ?? 0, lat: LAT * D2R, P: n?.P ?? null, doy: n?.doy ?? 0, sunW: n?.sunW ?? [0, -1, 0], moonW: n?.moonW ?? [0, -1, 0], planets: this.planets.map((p, i) => ({ ...PLANETS[i], dir: this.planetEq(i), mag: p.mag })) };
  }
}
