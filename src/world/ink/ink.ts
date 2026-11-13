/**
 * 画法。这里的东西不是「照着光算出来」的，是「画出来」的：
 *
 *   纸 —— 画面的底色。天就是纸；远处的东西褪进纸里（留白）。昼夜、晴雨变的是纸色与雾色，万物跟着变。
 *   颜料 —— 每样东西有一种颜料（pig：薄薄一层透在纸上时的颜色）和浓度（dens：叠了几层）。
 *           画面色 = 纸 × 颜料^浓度。浓度越大越深、越饱和，就是墨分五色、色有浓淡。
 *           背光的一面浓一些（shade），明暗交界带着水渍一样不齐的边。
 *   粉 —— 白衣、花、雪、灯这些要「亮过纸」的东西是不透明的粉彩（body）：底子换成 uLight，夜里也看得见。
 *   线 —— 每个材质在第二张图上写下自己的朝向、「这里勾不勾线」（line）与「要不要积墨」（crest：山头浓、往下淡），由 painter.ts 统一去画。
 *   笔触 —— 沿 uv 的干笔（streak：茅草、树皮、木纹）、顺着坡往下的皴（cun：石、土坡）。
 *
 * 配色全部按屏幕上看到的样子给（不做物理光照的色彩管理），所以这里把 three 的色彩管理关掉。
 * 所有材质共用一组量（U）：改一处，全画都变。
 */
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;

export type RGB = [number, number, number];
const col = (c: RGB) => new THREE.Color(c[0], c[1], c[2]);

/** 颜料：薄薄一层透在白纸上的颜色（0…1）。名字照国画颜料叫 */
export const PIG = {
  /** 墨（略偏冷） */ mo: [0.6, 0.61, 0.635] as RGB,
  /** 焦墨：更黑、偏暖 */ jiao: [0.5, 0.49, 0.48] as RGB,
  /** 赭石 */ zhe: [0.87, 0.73, 0.59] as RGB,
  /** 土黄（土墙、泥地） */ tu: [0.91, 0.84, 0.7] as RGB,
  /** 花青 */ qing: [0.66, 0.75, 0.84] as RGB,
  /** 藤黄 */ huang: [0.97, 0.89, 0.56] as RGB,
  /** 胭脂 */ zhi: [0.94, 0.66, 0.7] as RGB,
  /** 朱砂 */ zhu: [0.9, 0.38, 0.3] as RGB,
  /** 石青 */ shiqing: [0.5, 0.67, 0.82] as RGB,
  /** 石绿 */ shilv: [0.6, 0.8, 0.7] as RGB,
  /** 草绿（花青调藤黄） */ cao: [0.7, 0.81, 0.58] as RGB,
  /** 汁绿（新叶） */ zhi_lv: [0.82, 0.88, 0.6] as RGB,
  /** 老绿（松、夏木） */ lao: [0.56, 0.68, 0.58] as RGB,
  /** 茅草、枯草 */ mao: [0.9, 0.82, 0.62] as RGB,
} as const;

/** 全画共用的量 */
export const U = {
  uTime: { value: 0 },
  /** xy 风向（单位向量），z 强度，w 阵风的快慢 */
  uWind: { value: new THREE.Vector4(0.8, 0.6, 0.12, 1) },
  /** 纸 */
  uPaper: { value: col([0.955, 0.953, 0.946]) },
  /** 粉彩的底（白衣、花、雪）：白天比纸亮一点，夜里是月色 */
  uLight: { value: col([1, 1, 0.995]) },
  /** 远处褪成的颜色（比纸略带一点花青） */
  uMist: { value: col([0.925, 0.928, 0.928]) },
  /** 勾线的墨色 */
  uInk: { value: col([0.1, 0.105, 0.12]) },
  /** 光来的方向（世界坐标）：只用来分阴阳向背 */
  uKey: { value: new THREE.Vector3(-0.5, 0.7, 0.5).normalize() },
  /** 雾：x 贴地的雾每米淡去多少，y 随高度变薄的快慢，z 雾面的高度，w 高处那层薄薄的空气每米淡去多少（远山淡，靠它） */
  uFog: { value: new THREE.Vector4(0.0016, 0.012, 2, 0.00008) },
  /** 拦腰的云（只落在远山上，云断山腰）：x 多少，y…z 云带的高度（米），w 多远以外才有 */
  uCloud: { value: new THREE.Vector4(0.9, 240, 720, 2200) },
  /** 远：x 最多淡去几成；y…z 从多远到多远褪成墨色（近处淡彩，远景黑白）；w 褪几成 */
  uFar: { value: new THREE.Vector4(0.965, 70, 420, 0.72) },
  uSnow: { value: 0 },
  uWet: { value: 0 },
  /** 夜（0…1）：给灯火、星月用 */
  uNight: { value: 0 },
  /** 这一帧主画面的深度图与尺寸（烟、雾、光晕这些后画的东西靠它知道自己被什么挡着） */
  tDepth: { value: null as THREE.Texture | null },
  /** xy 画面像素数的倒数，z 近平面，w 远平面 */
  uView: { value: new THREE.Vector4(1, 1, 0.3, 16000) },
};

/** 所有着色器里都有的一段：共用的量、噪声、雾 */
export const INK_PARS = /* glsl */ `
uniform vec3 uPaper; uniform vec3 uLight; uniform vec3 uMist; uniform vec3 uKey; uniform vec4 uFog; uniform vec4 uFar; uniform vec4 uCloud;
uniform float uSnow; uniform float uWet; uniform float uTime; uniform float uNight;
float ih(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float in3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ih(i), ih(i + vec3(1.0, 0.0, 0.0)), f.x), mix(ih(i + vec3(0.0, 1.0, 0.0)), ih(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(ih(i + vec3(0.0, 0.0, 1.0)), ih(i + vec3(1.0, 0.0, 1.0)), f.x), mix(ih(i + vec3(0.0, 1.0, 1.0)), ih(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
vec3 ih3(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
/** 石的块面：x 是到最近一道块缝的远近，y 是这一块自己的一个随机数 */
vec2 inkCell(vec3 x) {
  vec3 b = floor(x - 0.5), f = x - b;
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) for (int k = 0; k < 2; k++) {
    vec3 g = vec3(float(i), float(j), float(k));
    float d = length(g + ih3(b + g) * 0.8 + 0.1 - f);
    if (d < d1) { d2 = d1; d1 = d; id = ih(b + g); } else if (d < d2) d2 = d;
  }
  return vec2(d2 - d1, id);
}
/** 这一点被雾淡去几成。雾贴着地：越低越浓、越远越浓，所以远山是山脚没在雾里、山头露在外面；雾一团一团的，慢慢地走 */
float inkFogK(vec3 w) {
  float d = distance(w, cameraPosition);
  float band = in3(vec3(w.x * 0.0019 + uTime * 0.003, w.y * 0.009, w.z * 0.0019 - uTime * 0.0012));
  float h = exp(-max(w.y - uFog.z, 0.0) * uFog.y * (0.5 + 1.0 * band));
  float k = 1.0 - exp(-d * (uFog.x * h + uFog.w));
  // 拦腰的云：远山的半腰上，几条慢慢走的留白
  if (uCloud.x > 0.0 && d > uCloud.w) {
    // 云是横着的长带：横向几公里才变一变，竖向一两百米一层
    float cn = in3(vec3(w.x * 0.00016 + uTime * 0.0012, w.y * 0.0052, w.z * 0.00016)) * 0.7 + in3(vec3(w.x * 0.0006, w.y * 0.011 + 5.0, w.z * 0.0006 + uTime * 0.0016)) * 0.3;
    float belt = smoothstep(uCloud.y, uCloud.y + 140.0, w.y) * (1.0 - smoothstep(uCloud.z - 220.0, uCloud.z, w.y));
    k = max(k, uCloud.x * belt * smoothstep(0.42, 0.62, cn) * smoothstep(uCloud.w, uCloud.w * 1.8, d));
  }
  return min(uFar.x, k);
}
/** 远处褪成墨色。keep 是「留着颜色」的程度（花这样的粉彩留着） */
vec3 inkFar(vec3 c, vec3 w, float keep) {
  float m = smoothstep(uFar.y, uFar.z, distance(w, cameraPosition)) * uFar.w * (1.0 - keep);
  return mix(c, vec3(dot(c, vec3(0.3, 0.52, 0.18))) * vec3(0.965, 0.99, 1.02), m);
}
`;

const WIND_V = /* glsl */ `
uniform vec4 uWind;
vec3 inkSway(vec3 w, float k) {
  float ph = dot(w.xz, vec2(0.11, 0.17)), t = uTime * uWind.w;
  float g = sin(t * 0.55 + ph) * 0.55 + sin(t * 1.43 + ph * 2.3 + w.y * 0.21) * 0.3 + sin(t * 3.7 + ph * 6.1 + w.y * 1.3) * 0.12;
  float a = uWind.z * k;
  w.xz += uWind.xy * a * (0.55 + g);
  w.y -= abs(g) * a * 0.22;
  return w;
}
`;

const WASH_V = /* glsl */ `
uniform float uTime;
${WIND_V}
#ifdef INK_SWAY
attribute float sway;
#endif
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec2 vUv;
void main() {
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
  #endif
  vec4 w = m * vec4(position, 1.0);
  #ifdef INK_SWAY
    w.xyz = inkSway(w.xyz, sway * INK_SWAY);
  #endif
  vW = w.xyz;
  vN = normalize(mat3(m) * normal);
  vC = vec3(1.0);
  #ifdef USE_COLOR
    vC *= color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vC *= instanceColor;
  #endif
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const WASH_F = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${INK_PARS}
uniform vec3 uPig; uniform vec4 uP; uniform vec4 uQ; uniform vec4 uS; uniform vec4 uT; uniform vec4 uR; uniform vec3 uGlow;
#ifdef INK_MAP
uniform sampler2D map;
#endif
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  // 水渍：一粗一细两层不匀
  float n0 = in3(vW * uQ.y), n1 = in3(vW * uQ.y * 0.21 + 7.3);
  // 阴阳向背：受光与背光两分，交界处跟着水渍走，不是一条齐线
  float lit = smoothstep(-0.2, 0.24, dot(N, uKey) + (n0 - 0.5) * 0.5);
  lit = mix(lit, 1.0, uP.z);
  float dens = uP.x * mix(uP.y, 1.0, lit) * (0.8 + 0.42 * n1) * (1.0 + 0.3 * uWet);
  float extra = 0.0;
  vec3 P = uPig * vC;
  #ifdef INK_MAP
    vec4 tx = texture2D(map, vUv);
    P *= tx.rgb;
    #ifdef INK_CUT
      if (tx.a < 0.5) discard;
    #endif
  #endif
  // 干笔：沿 uv 拉长的笔丝（茅草、树皮、木纹）
  if (uS.z > 0.0) {
    float st = in3(vec3(vUv.x * uS.x, vUv.y * uS.y, 1.7)) * 0.65 + in3(vec3(vUv.x * uS.x * 2.3, vUv.y * uS.y * 2.3, 5.1)) * 0.35;
    dens *= 1.0 + uS.z * (smoothstep(0.38, 0.72, st) * 1.6 - 0.55);
  }
  // 皴：顺着坡往下的长线（石、土坡、山）。uT.z 是笔触的大小（近石 1，远山几十）
  if (uS.w > 0.0) {
    float sc = 1.0 / max(uT.z, 1e-3);
    vec2 t = normalize(N.zx * vec2(1.0, -1.0) + vec2(1e-4));
    vec3 q = vW * sc;
    float a1 = dot(q.xz, t), a2 = dot(q.xz, N.xz);
    // 披麻皴：一排顺坡而下的长线，走着走着左右摆一摆，时断时续；背光处密
    float ph = a1 * 1.7 + (in3(vec3(a1 * 0.45, q.y * 0.3, a2 * 0.4)) - 0.5) * 2.4 + n1 * 1.3;
    float w1 = fwidth(ph) * 0.8 + 0.035, id = floor(ph);
    float ln = (1.0 - smoothstep(w1 * 0.35, w1, abs(fract(ph) - 0.5))) * smoothstep(0.34, 0.58, in3(vec3(id * 3.7, q.y * 0.8 + id * 1.3, 2.0)) + 0.3 * (1.0 - lit));
    float ph2 = a1 * 4.9 + (in3(vec3(a1 * 1.1 + 4.0, q.y * 0.7, a2)) - 0.5) * 2.0;
    float w2 = fwidth(ph2) * 0.8 + 0.05, id2 = floor(ph2);
    ln += 0.55 * (1.0 - smoothstep(w2 * 0.35, w2, abs(fract(ph2) - 0.5))) * smoothstep(0.45, 0.66, in3(vec3(id2 * 5.1, q.y * 1.7 + id2, 7.0)) + 0.3 * (1.0 - lit));
    extra += uS.w * min(ln, 1.3) * uP.x * uP.y * (0.95 - 0.55 * lit) * smoothstep(0.99, 0.75, N.y);
  }
  // 勾勒：山石分成一块一块（竖长的），块与块之间一道墨线，每块深浅不同
  if (uR.y > 0.0) {
    vec2 ce = inkCell(vW / uR.x * vec3(1.0, 0.42, 1.0) + n1 * 0.7);
    float cwid = fwidth(ce.x) * 1.2 + 0.035;
    extra += uR.y * (1.0 - smoothstep(cwid * 0.3, cwid, ce.x)) * 1.2 * uP.x * uP.y * smoothstep(0.995, 0.8, N.y);
    dens *= 1.0 + uR.y * (ce.y - 0.5) * 0.7;
  }
  // 版筑：土墙一版一版夯上去，每版深浅不同，版缝是一道略深的横线
  if (uT.y > 0.0) {
    float ly = vW.y * uT.x + (in3(vec3(vW.xz * 0.4, 3.0)) - 0.5) * 0.35;
    float bandT = in3(vec3(floor(ly) * 7.13, 1.0, 2.0));
    float seam = smoothstep(0.4, 0.5, abs(fract(ly) - 0.5));
    dens *= 1.0 + uT.y * ((bandT - 0.5) * 0.6 + seam * 0.5 * (0.4 + n0));
  }
  vec3 base = mix(uPaper, uLight, uP.w);
  vec3 c = base * pow(clamp(P, vec3(0.002), vec3(1.0)), vec3(max(dens, 0.0))) * pow(uPig, vec3(extra));
  // 雪：朝上的面留白
  if (uSnow > 0.001 && uQ.w > 0.0) {
    float s = smoothstep(0.62 - uSnow * 0.3, 0.9 - uSnow * 0.25, N.y + (n0 - 0.5) * 0.35) * min(1.0, uSnow * 1.5) * uQ.w;
    c = mix(c, uLight * vec3(0.975, 0.98, 0.99), s);
  }
  c = inkFar(c, vW, uP.w);
  c += uGlow * uNight;
  c = mix(c, uMist, inkFogK(vW));
  gl_FragColor = vec4(c, 1.0);
  gAux = vec4(normalize(mat3(viewMatrix) * N).xy * 0.5 + 0.5, uT.w, uQ.x);
}
`;

export interface WashOpts {
  /** 颜料（一层的透过色）。默认淡墨 */
  pig?: RGB;
  /** 浓度：叠几层。0.2 是极淡的一抹，1 中等，3 以上很深 */
  dens?: number;
  /** 背光面是受光面的几倍浓（1 即不分明暗） */
  shade?: number;
  /** 0 分明暗，1 平涂 */
  flat?: number;
  /** 0 透在纸上的淡彩，1 不透明的粉彩 */
  body?: number;
  /** 勾线的轻重（0 不勾，1 实线） */
  line?: number;
  /** 水渍的粗细：每米几个起伏 */
  grain?: number;
  /** 干笔：[沿 u 每米几丝, 沿 v 每米几丝, 深浅] */
  streak?: [number, number, number];
  /** 皴的深浅（石、土坡、山） */
  cun?: number;
  /** 皴的笔触大小（米）：近处的石 1，远山要几十上百 */
  cunSize?: number;
  /** 版筑的土墙：[每米几版, 深浅] */
  strata?: [number, number];
  /** 积墨（山）：每一重山从山脊往下由浓到淡。0 不要，1 全要 */
  crest?: number;
  /** 勾勒（崖壁、大石）：[一块多大（米）, 深浅]——石面分成竖长的块，块缝是墨线 */
  crack?: [number, number];
  /** 随风摆的幅度（几何上要有 sway 属性） */
  sway?: number;
  /** 贴图（rgb 当颜料乘上去）；cut 为真时按 alpha 镂空 */
  map?: THREE.Texture | null; cut?: boolean;
  /** 积雪（0 不积，1 朝上的面全白） */
  snow?: number;
  /** 夜里自己亮多少（窗纸、灯笼） */
  glow?: RGB;
  side?: THREE.Side;
  vertexColors?: boolean;
}

/** 一种画法（淡彩 / 粉彩的面）。同样参数的材质会共用一个着色器 */
export function wash(o: WashOpts = {}): THREE.ShaderMaterial {
  const defines: Record<string, string | number> = {};
  if (o.sway) defines.INK_SWAY = o.sway.toFixed(3);
  if (o.map) { defines.INK_MAP = 1; if (o.cut) defines.INK_CUT = 1; }
  const s = o.streak ?? [0, 0, 0];
  const m = new THREE.ShaderMaterial({
    defines,
    uniforms: {
      ...U,
      uPig: { value: col(o.pig ?? PIG.mo) },
      uP: { value: new THREE.Vector4(o.dens ?? 1, o.shade ?? 1.9, o.flat ?? 0, o.body ?? 0) },
      uQ: { value: new THREE.Vector4(o.line ?? 1, o.grain ?? 1.4, 0, o.snow ?? 1) },
      uS: { value: new THREE.Vector4(s[0], s[1], s[2], o.cun ?? 0) },
      uT: { value: new THREE.Vector4(o.strata?.[0] ?? 0, o.strata?.[1] ?? 0, o.cunSize ?? 1, o.crest ?? 0) },
      uR: { value: new THREE.Vector4(o.crack?.[0] ?? 1, o.crack?.[1] ?? 0, 0, 0) },
      uGlow: { value: col(o.glow ?? [0, 0, 0]) },
      map: { value: o.map ?? null },
    },
    vertexShader: WASH_V,
    fragmentShader: WASH_F,
    vertexColors: o.vertexColors ?? true,
    side: o.side ?? THREE.FrontSide,
  });
  m.userData.ink = o;
  return m;
}
/** 由一种画法派生出改了几样参数的另一种 */
export function rewash(base: THREE.ShaderMaterial, o: WashOpts): THREE.ShaderMaterial {
  return wash({ ...(base.userData.ink as WashOpts), ...o });
}

// —— 点叶、点花：一片叶、一簇花是一笔（一张朝着看画人的小纸片），整棵树是成百上千笔 ——
const DAB_V = /* glsl */ `
uniform float uTime;
${WIND_V}
uniform vec4 uAtlas;
attribute vec4 aPos; attribute vec4 aDir; attribute vec4 aCol;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec2 vUv;
void main() {
  vec3 c = (modelMatrix * vec4(aPos.xyz, 1.0)).xyz;
  // aDir.w：整数部分是图集里的第几格，小数部分是随风摆的多少
  float tile = floor(aDir.w), sw = fract(aDir.w) * 2.0;
  c = inkSway(c, sw * uAtlas.z);
  vec4 v = viewMatrix * vec4(c, 1.0);
  float r = aCol.w, s = sin(r), k = cos(r);
  vec2 q = position.xy * aPos.w * uAtlas.w;
  v.xy += vec2(q.x * k - q.y * s, q.x * s + q.y * k);
  gl_Position = projectionMatrix * v;
  // 图集的第 0 格在左上角（画布的 y 朝下）
  vec2 cell = vec2(mod(tile, uAtlas.x), floor(tile / uAtlas.x));
  vUv = vec2((cell.x + uv.x) / uAtlas.x, 1.0 - (cell.y + 1.0 - uv.y) / uAtlas.y);
  vN = normalize(mat3(modelMatrix) * aDir.xyz);
  vC = aCol.rgb; vW = c;
}
`;
const DAB_F = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${INK_PARS}
uniform sampler2D map; uniform vec3 uPig; uniform vec4 uP; uniform vec4 uQ; uniform vec3 uAccent; uniform vec2 uTex;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec2 vUv;
void main() {
  // 图集：r 这一处着色多浓，g 点缀色（花蕊、叶背）的多少，a 形状
  vec4 t = texture2D(map, vUv);
  // 笔的边要利落：按它在屏幕上的粗细把透明度收紧；缩得很小时把门槛放低，远处的树才不会越看越稀
  vec2 tp = vUv * uTex;
  float lod = max(0.0, 0.5 * log2(max(dot(dFdx(tp), dFdx(tp)), dot(dFdy(tp), dFdy(tp))) + 1e-8));
  float thr = mix(0.5, 0.2, clamp(lod / 3.5, 0.0, 1.0));
  #ifdef INK_A2C
    float a = clamp((t.a - thr) / max(fwidth(t.a), 0.03) + 0.5, 0.0, 1.0) * uQ.z;
    if (a < 0.06) discard;
  #else
    float a = uQ.z;
    if (t.a * uQ.z < thr) discard;
  #endif
  float n1 = in3(vW * 0.9 + 3.1);
  float lit = smoothstep(-0.35, 0.45, dot(normalize(vN), uKey) + (n1 - 0.5) * 0.6);
  lit = mix(lit, 1.0, uP.z);
  float dens = uP.x * mix(uP.y, 1.0, lit) * (0.55 + 0.9 * t.r) * (1.0 + 0.3 * uWet);
  vec3 P = mix(uPig * vC, uAccent, t.g);
  vec3 base = mix(uPaper, uLight, uP.w);
  vec3 c = base * pow(max(P, vec3(0.002)), vec3(dens));
  if (uSnow > 0.001 && uQ.w > 0.0) c = mix(c, uLight * vec3(0.975, 0.98, 0.99), smoothstep(0.3, 0.9, vN.y + n1 * 0.5) * min(1.0, uSnow * 1.3) * uQ.w * 0.7);
  c = inkFar(c, vW, uP.w);
  c = mix(c, uMist, inkFogK(vW));
  gl_FragColor = vec4(c, a);
  gAux = vec4(0.5, 0.5, 0.0, uQ.x);
}
`;
export interface DabOpts {
  /** 笔触图集（brush.ts 画的）与它的格数 */
  map: THREE.Texture; cols: number; rows: number;
  pig?: RGB; dens?: number; shade?: number; flat?: number; body?: number;
  /** 点缀色（图集的 g 通道处用它）：花蕊、嫩叶 */
  accent?: RGB;
  line?: number; snow?: number;
  /** 随风摆的幅度 */
  sway?: number;
  /** 整体放大几倍 */
  size?: number;
  /** 整体的不透明（花落尽、叶落尽时调到 0） */
  alpha?: number;
}
/** 多重采样时用「按透明度盖几个采样点」，笔的边是软的；否则是硬边 */
let A2C = false;
export const setA2C = (on: boolean) => { A2C = on; };
export function dabMat(o: DabOpts): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    defines: A2C ? { INK_A2C: 1 } : {},
    uniforms: {
      ...U,
      map: { value: o.map },
      uTex: { value: new THREE.Vector2((o.map.image as { width?: number } | undefined)?.width ?? 512, (o.map.image as { height?: number } | undefined)?.height ?? 512) },
      uAtlas: { value: new THREE.Vector4(o.cols, o.rows, o.sway ?? 0.6, o.size ?? 1) },
      uPig: { value: col(o.pig ?? PIG.cao) },
      uAccent: { value: col(o.accent ?? o.pig ?? PIG.cao) },
      uP: { value: new THREE.Vector4(o.dens ?? 1, o.shade ?? 1.7, o.flat ?? 0, o.body ?? 0) },
      uQ: { value: new THREE.Vector4(o.line ?? 0, 0, o.alpha ?? 1, o.snow ?? 1) },
    },
    vertexShader: DAB_V,
    fragmentShader: DAB_F,
    side: THREE.DoubleSide,
  });
  m.alphaToCoverage = A2C;
  return m;
}

/** 一笔：位置、大小、朝外的方向（定明暗）、图集里第几格、颜色（乘在颜料上）、转多少、随风摆多少（0…1） */
export interface Dab { x: number; y: number; z: number; size: number; nx?: number; ny?: number; nz?: number; tile?: number; r?: number; g?: number; b?: number; rot?: number; sway?: number }
const QUAD = new THREE.PlaneGeometry(1, 1);
/** 把许多笔并成一次绘制 */
export function dabMesh(dabs: Dab[], mat: THREE.ShaderMaterial): THREE.Mesh {
  const g = new THREE.InstancedBufferGeometry();
  g.index = QUAD.index;
  g.setAttribute('position', QUAD.attributes.position);
  g.setAttribute('uv', QUAD.attributes.uv);
  const n = dabs.length, P = new Float32Array(n * 4), D = new Float32Array(n * 4), C = new Float32Array(n * 4);
  const lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
  dabs.forEach((d, i) => {
    P.set([d.x, d.y, d.z, d.size], i * 4);
    const l = Math.hypot(d.nx ?? 0, d.ny ?? 1, d.nz ?? 0) || 1;
    D.set([(d.nx ?? 0) / l, (d.ny ?? 1) / l, (d.nz ?? 0) / l, Math.floor(d.tile ?? 0) + Math.min(0.49, Math.max(0, (d.sway ?? 0.5) * 0.5))], i * 4);
    C.set([d.r ?? 1, d.g ?? 1, d.b ?? 1, d.rot ?? 0], i * 4);
    lo.min(new THREE.Vector3(d.x - d.size, d.y - d.size, d.z - d.size)); hi.max(new THREE.Vector3(d.x + d.size, d.y + d.size, d.z + d.size));
  });
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(P, 4));
  g.setAttribute('aDir', new THREE.InstancedBufferAttribute(D, 4));
  g.setAttribute('aCol', new THREE.InstancedBufferAttribute(C, 4));
  g.instanceCount = n;
  g.boundingBox = new THREE.Box3(lo, hi);
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  const mesh = new THREE.Mesh(g, mat);
  mesh.userData.dabs = n;
  return mesh;
}

// —— 后画的东西（雾、烟、光晕、飞絮）：画在勾完线的画面之上，自己去比深度 ——
export const FX_PARS = /* glsl */ `
uniform sampler2D tDepth; uniform vec4 uView;
/** 这一点前面有没有东西挡着：1 没有，0 全挡住；soft 是贴近处渐隐的距离（米） */
float fxSeen(float viewZ, float soft) {
  float d = texture2D(tDepth, gl_FragCoord.xy * uView.xy).x;
  float z = d * 2.0 - 1.0;
  float scene = 2.0 * uView.z * uView.w / (uView.w + uView.z - z * (uView.w - uView.z));
  return clamp((scene - viewZ) / max(soft, 1e-3), 0.0, 1.0);
}
`;
/** 后画的那一层在三维里的图层号 */
export const FX_LAYER = 2;
