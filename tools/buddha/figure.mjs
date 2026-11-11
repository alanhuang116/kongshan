// 坐像的距离场。单位米；原点在莲台面的正中（坐处），y 向上，面朝 +z；像的左手在 +x。
// 从坐处到肉髻顶约 3.2 米。分三块出网格：身（含袈裟、手）、头面（细格）、发（螺发，另一种材质）。
//
// 形制取唐风：面相丰圆、眉弯如新月、目长而垂视、唇闭而嘴角微扬、长耳、颈有三道、肉髻低平、螺发；
// 肩圆而略溜、胸厚腰收，袈裟覆双肩、胸前敞成 U 形，内着僧祇支自左肩斜向右胁；衣纹是疏朗的细棱；结跏趺坐，禅定印。
import { bump, ell, fbm3, rbox, rcone, smax, smin, sph, sstep } from './sdf.mjs';

/** 头向前微俯（度）、头的大小倍率 */
const TILT = (7 * Math.PI) / 180, CT = Math.cos(TILT), ST = Math.sin(TILT), HS = 1.12;
/** 俯的轴心（颈根）、头心（两眼之间稍后） */
const PIV = [0, 2.2, -0.02], OH = [0, 2.628, 0.02];

export const BOUNDS = {
  body: { min: [-1.45, -0.06, -0.9], max: [1.45, 2.36, 1.22] },
  head: { min: [-0.46, 1.96, -0.52], max: [0.46, 3.1, 0.6] },
  hair: { min: [-0.44, 2.46, -0.54], max: [0.44, 3.26, 0.52] },
  hands: { min: [-0.56, 0.58, 0.5], max: [0.56, 0.96, 0.96] },
};

// —— 像坐标 → 头的局部坐标（未放大的） ——
let HX = 0, HY = 0, HZ = 0;
function toHead(x, y, z) {
  const qy = y - PIV[1], qz = z - PIV[2];
  HX = x / HS;
  HY = (qy * CT + qz * ST + (PIV[1] - OH[1])) / HS;
  HZ = (-qy * ST + qz * CT + (PIV[2] - OH[2])) / HS;
}
/** 头与身的分界：一个朝上张开的锥面。> 0 归头 */
export const headSide = (x, y, z) => y - (2.1 - 0.3 * z) - Math.max(0, Math.hypot(x, z + 0.02) - 0.345) * 1.25;

/** 一道细棱：t 为整数处最高 */
const prof = (t) => { const c = 0.5 + 0.5 * Math.cos(6.2831853 * t); return c * c * c; };

// ———————————————————————— 身 ————————————————————————
/** 衣下的身形：躯干、颈、臂、腿 */
function forms(x, y, z) {
  const ax = Math.abs(x);
  let d = ell(x, y, z, 0, 0.44, -0.12, 0.62, 0.46, 0.5);                           // 胯
  d = smin(d, ell(x, y, z, 0, 1.0, -0.07, 0.455, 0.5, 0.375), 0.2);                // 腰腹（收）
  d = smin(d, ell(x, y, z, 0, 1.5, -0.05, 0.555, 0.46, 0.4), 0.2);                 // 胸廓
  d = smin(d, ell(ax, y, z, 0.2, 1.57, 0.2, 0.26, 0.2, 0.16), 0.13);               // 胸的丰满
  d = smin(d, ell(x, y, z, 0, 1.77, -0.12, 0.56, 0.24, 0.32), 0.16);               // 肩背
  d = smin(d, rcone(ax, y, z, 0.12, 1.98, -0.1, 0.5, 1.84, -0.09, 0.12, 0.13), 0.14); // 颈到肩的坡
  d = smin(d, sph(ax, y, z, 0.565, 1.74, -0.07, 0.215), 0.13);                     // 肩头
  d = smin(d, rcone(x, y, z, 0, 1.84, -0.05, 0, 2.24, -0.005, 0.25, 0.2), 0.1);    // 颈
  // 臂：上臂垂而略外张，前臂收向腹前
  d = smin(d, rcone(ax, y, z, 0.585, 1.72, -0.07, 0.83, 0.92, 0.0, 0.2, 0.165), 0.1);
  d = smin(d, rcone(ax, y, z, 0.83, 0.92, 0.0, 0.36, 0.76, 0.64, 0.165, 0.115), 0.07);
  // 腿：结跏趺坐。股自胯外展到膝，胫折回身前相叠（右上左下）
  d = smin(d, rcone(ax, y, z, 0.3, 0.38, -0.02, 0.98, 0.33, 0.42, 0.36, 0.3), 0.14);
  d = smin(d, sph(ax, y, z, 1.0, 0.33, 0.45, 0.31), 0.08);                         // 膝
  d = smin(d, rcone(x, y, z, 0.98, 0.3, 0.5, -0.38, 0.4, 0.74, 0.25, 0.17), 0.09); // 左胫（在下）
  d = smin(d, rcone(x, y, z, -0.98, 0.34, 0.5, 0.38, 0.5, 0.7, 0.25, 0.17), 0.09); // 右胫（在上）
  d = smin(d, ell(x, y, z, 0, 0.3, 0.2, 0.74, 0.3, 0.5), 0.14);                    // 两股之间绷着的衣
  return d;
}

/** 外衣（袈裟）盖到哪：> 0 是盖着的，数值约等于离衣缘的距离 */
function cover(x, y, z) {
  // 颈：衣领以上露着（后领略高）
  const rho = Math.hypot(x, z + 0.04);
  const neck = Math.max(1.96 - 0.14 * z - y, rho - 0.3);
  // 胸前敞开的 U
  const yc = 1.7, r0 = 0.3;
  let u = y >= yc ? Math.abs(x) - (r0 + 0.2 * (y - yc)) : Math.hypot(x, y - yc) - r0;
  u = Math.max(u, -0.03 - z);
  return Math.min(neck, u);
}
/** 僧祇支：U 里面，自左肩（+x）斜向右胁。> 0 是盖着的 */
const inner = (x, y) => (x - 0.32) * 0.475 - (y - 1.87) * 0.88;

/** 粗的一档格子分不清细处：衣纹收浅（FOLD）、眉眼唇颈的线放宽（LINE）、衣缘的台阶放缓（HEM） */
let FOLD = 1, LINE = 1, HEM = 1;
export const setDetail = (fold, line, hem) => { FOLD = fold; LINE = line; HEM = hem; };
/** 衣纹：加在衣厚上的细棱（米） */
function folds(x, y, z) {
  const ax = Math.abs(x);
  const w0 = fbm3(x * 1.3 + 3, y * 1.3, z * 1.3 + 7, 2, 5) - 0.5;
  let f = 0;
  // 胸腹：自左肩（+x）斜向右胁、一重重垂下的弧
  if (z > 0.02 && y > 0.7 && y < 1.62 && ax < 0.8) {
    const r = Math.hypot(x - 0.42, (y - 2.0) * 0.9);
    const w = sstep(0.62, 0.74, r) * (1 - sstep(1.2, 1.34, r)) * sstep(0.04, 0.2, z) * (1 - sstep(0.4, 0.62, ax)) * (1 - sstep(1.36, 1.5, y));
    if (w > 0) f += 0.0075 * prof(r / 0.158 + 0.3 * w0) * w;
  }
  // 腿上：自膝至膝、在胫前垂成的弧
  if (y < 0.72 && z > 0.1) {
    const r = Math.hypot(x * 0.92, y - 1.08);
    const w = sstep(0.42, 0.54, r) * (1 - sstep(1.0, 1.14, r)) * (1 - sstep(0.52, 0.68, y)) * sstep(0.15, 0.35, z) * (1 - 0.85 * sstep(0.8, 1.05, ax));
    if (w > 0) f += 0.0085 * prof(r / 0.152 + 0.4 * w0) * w;
  }
  return f * FOLD;
}

/**
 * 一只手，按左手写（腕在 +x，指尖朝 −x，掌心向上）；右手是它的镜像。
 * y0 是掌的高度，rise 是拇指尖抬多高（两手一高一低，拇指尖要在同一处相触）。
 */
function hand(x, y, z, y0, rise) {
  let d = rbox(x, y, z, 0.185, y0, 0.705, 0.15, 0.038, 0.126, 0.036);                         // 掌
  d = smax(d, -ell(x, y, z, 0.17, y0 + 0.054, 0.7, 0.11, 0.03, 0.09), 0.03);                  // 掌心微凹
  d = smin(d, ell(x, y, z, 0.25, y0 + 0.012, 0.795, 0.09, 0.042, 0.052), 0.03);               // 拇指根的肉
  const len = [0.2, 0.255, 0.28, 0.25];                                                       // 小指 → 食指（食指在外侧，挨着拇指）
  for (let i = 0; i < 4; i++) {
    const zi = 0.612 + i * 0.062, l = len[i], x0 = 0.05, x1 = x0 - l * 0.55, x2 = x0 - l;
    d = smin(d, rcone(x, y, z, x0, y0 - 0.002, zi, x1, y0 - 0.006, zi + 0.004, 0.04, 0.036), 0.018);
    d = smin(d, rcone(x, y, z, x1, y0 - 0.006, zi + 0.004, x2, y0 + 0.012, zi + 0.008, 0.036, 0.027), 0.008);  // 指尖微翘
  }
  d = smin(d, rcone(x, y, z, 0.31, y0 + 0.006, 0.7, 0.39, y0 + 0.04, 0.635, 0.085, 0.08), 0.045);            // 腕，收进袖里
  // 拇指：自掌的外缘抬起，弯向中间（三节，成一道圆缓的弧）
  const m1y = y0 + rise * 0.55, m2y = y0 + rise * 0.92;
  d = smin(d, rcone(x, y, z, 0.25, y0 + 0.02, 0.805, 0.17, m1y, 0.835, 0.05, 0.043), 0.03);
  d = smin(d, rcone(x, y, z, 0.17, m1y, 0.835, 0.09, m2y, 0.832, 0.043, 0.037), 0.012);
  d = smin(d, rcone(x, y, z, 0.09, m2y, 0.832, 0.02, y0 + rise, 0.82, 0.037, 0.03), 0.012);
  return d;
}
/** 双手：禅定印——右手叠在左手上，掌心向上，两拇指尖相触 */
export function handsField(x, y, z) {
  if (y < 0.45 || y > 1.05 || z < 0.35 || Math.abs(x) > 0.65) return 0.3;
  return smin(hand(x, y, z, 0.675, 0.172), hand(-x, y, z, 0.752, 0.098), 0.006);
}

/** 衣的厚（含衣缘的一道边）。同时记下这一点属于哪个区：0 肉身、1 袈裟、2 僧祇支 */
let ZONE = 0;
function robe(x, y, z) {
  const c = cover(x, y, z);
  const m = sstep(-0.02 * HEM, 0.06 * HEM, c);
  let t = 0.024 * m + 0.015 * sstep(-0.005 * HEM, 0.06 * HEM, c) * (1 - sstep(0.08 * HEM, 0.16 * HEM, c));
  ZONE = m > 0.5 ? 1 : 0;
  if (m < 1 && z > -0.03 && y < 1.98) {
    const ci = inner(x, y), mi = sstep(-0.02 * HEM, 0.055 * HEM, ci) * (1 - m);
    t += 0.01 * mi + 0.01 * sstep(-0.005 * HEM, 0.055 * HEM, ci) * (1 - m) * (1 - sstep(0.065 * HEM, 0.13 * HEM, ci));
    if (mi > 0.5) ZONE = 2;
  }
  if (m > 0) t += folds(x, y, z) * m;
  return t;
}

/** 颈上的三道（两道浅沟分出三段） */
function neckLines(x, y, z) {
  if (y < 1.96 || y > 2.26 || z < -0.02 || Math.abs(x) > 0.26) return 0;
  const w = sstep(-0.02, 0.1, z) * (1 - sstep(0.16, 0.25, Math.abs(x)));
  const yy = y + 0.024 * (1 - (x * x) / 0.045);
  return 0.0036 * w * (bump(yy - 2.075, 0.0095 * LINE) + bump(yy - 2.145, 0.0095 * LINE));
}

/** 身（不切底）。底面另由 FLOOR 切平，藏在莲台里 */
export const FLOOR = -0.03;
export function bodyField(x, y, z) {
  return forms(x, y, z) - robe(x, y, z) + neckLines(x, y, z);
}
/** 这一点属于哪个区 */
export function zoneAt(x, y, z) { robe(x, y, z); return ZONE; }

// ———————————————————————— 头 ————————————————————————
/** 头的大形：颅、面、颊、颌、颏 */
function headBase(x, y, z) {
  const ax = Math.abs(x);
  let d = ell(x, y, z, 0, 0.1, -0.055, 0.288, 0.3, 0.325);                         // 颅（额不前凸）
  d = smin(d, ell(x, y, z, 0, -0.095, 0.045, 0.256, 0.28, 0.262), 0.09);           // 面
  d = smin(d, ell(ax, y, z, 0.135, -0.105, 0.15, 0.12, 0.13, 0.122), 0.075);       // 颊
  d = smin(d, ell(x, y, z, 0, -0.225, 0.04, 0.215, 0.135, 0.212), 0.08);           // 颌
  d = smin(d, ell(x, y, z, 0, -0.29, 0.222, 0.09, 0.07, 0.078), 0.065);            // 颏
  d = smin(d, ell(x, y, z, 0, -0.325, 0.1, 0.135, 0.05, 0.13), 0.06);              // 颐下
  return d;
}
/** 大形在 (x, y) 处朝前的那个面的 z（给五官定位用） */
function frontZ(x, y) {
  let a = 0.05, b = 0.6;
  for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (headBase(x, y, m) < 0) a = m; else b = m; }
  return a;
}
// 五官的位置（都以大形的表面为准）
const A = {
  eye: frontZ(0.125, -0.02), eyeLo: frontZ(0.125, -0.062),
  nose0: frontZ(0, 0.06), nose1: frontZ(0, -0.118), ala: frontZ(0.034, -0.132),
  lipU: frontZ(0, -0.188), lipL: frontZ(0, -0.222), corner: frontZ(0.062, -0.202), chinGroove: frontZ(0, -0.255), phil: frontZ(0, -0.162),
  urna: frontZ(0, 0.092),
};
/** 头面（局部坐标）：大形 + 五官 + 耳 */
function faceLocal(x, y, z) {
  const ax = Math.abs(x);
  let d = headBase(x, y, z);
  if (z > 0.02) {
    const fr = sstep(0.06, 0.16, z);
    // 眼这一块整体斜一点：外眦略高
    const dx = ax - 0.127, ye = y - 0.07 * dx, q = dx / 0.08;
    // 眼窝：眉弓之下浅浅收进去
    d = smax(d, -ell(ax, ye, z, 0.125, -0.012, A.eye + 0.056, 0.112, 0.06, 0.07), 0.035);
    // 上睑：一片平缓的弧面，自眉下垂到睑缘；下睑只是一小条
    d = smin(d, ell(ax, ye, z, 0.125, -0.016, A.eye - 0.045, 0.094, 0.05, 0.04), 0.03);
    // 睑缘：垂视的那一线（中间低、两端高），其上再一道浅浅的重睑
    const em = (1 - sstep(0.076, 0.096, Math.abs(dx))) * fr;
    const ys = -0.045 + 0.009 * q * q;
    d += 0.0064 * bump(ye - ys, 0.0088 * LINE) * em;
    d += 0.0016 * bump(ye - (-0.006 - 0.01 * q * q), 0.0085 * LINE) * (1 - sstep(0.055, 0.085, Math.abs(dx))) * fr;
    // 眉：新月一弯——高而长的一道细棱，内端接鼻梁
    const yb = 0.084 - 1.75 * (ax - 0.14) * (ax - 0.14);
    d -= 0.0062 * bump(y - yb, 0.0112 * LINE) * sstep(0.025, 0.06, ax) * (1 - sstep(0.21, 0.26, ax)) * fr;
    // 鼻：梁直而窄，准头圆而不大，两翼小
    d = smin(d, rcone(x, y, z, 0, 0.04, A.nose0 - 0.005, 0, -0.108, A.nose1 + 0.02, 0.015, 0.029), 0.034);
    d = smin(d, sph(x, y, z, 0, -0.122, A.nose1 + 0.025, 0.034), 0.018);
    d = smin(d, ell(ax, y, z, 0.034, -0.134, A.ala + 0.004, 0.023, 0.02, 0.03), 0.014);
    d = smax(d, -ell(ax, y, z, 0.02, -0.157, A.ala + 0.022, 0.012, 0.007, 0.014), 0.007);    // 鼻底（只从下面看得见）
    // 唇：小而厚，闭着，两角微扬
    const ym = y - 0.005 * (ax / 0.06) * (ax / 0.06);
    const upL = smin(ell(x, ym, z, 0, -0.187, A.lipU - 0.013, 0.056, 0.02, 0.03), ell(ax, ym, z, 0.022, -0.182, A.lipU - 0.011, 0.03, 0.018, 0.027), 0.012);
    const loL = ell(x, ym, z, 0, -0.225, A.lipL - 0.013, 0.05, 0.025, 0.03);
    d = smin(d, smin(upL, loL, 0.008), 0.016);
    d += 0.0042 * bump(ym + 0.2045, 0.0078 * LINE) * (1 - sstep(0.052, 0.074, ax)) * fr;             // 唇缝
    d = smax(d, -ell(x, y, z, 0, -0.162, A.phil + 0.02, 0.01, 0.018, 0.022), 0.012);         // 人中
    d = smax(d, -ell(x, y, z, 0, -0.256, A.chinGroove + 0.02, 0.048, 0.014, 0.028), 0.02);   // 唇下
    d = smax(d, -ell(ax, ym, z, 0.067, -0.204, A.corner + 0.01, 0.012, 0.011, 0.016), 0.014); // 嘴角
    // 白毫
    d = smin(d, sph(x, y, z, 0, 0.092, A.urna - 0.009, 0.018), 0.006);
  }
  // 耳：长，耳轮一圈，垂珠过颌
  if (ax > 0.2) {
    let e = ell(ax, y, z, 0.292, -0.04, -0.05, 0.034, 0.128, 0.078);
    e = smin(e, ell(ax, y, z, 0.287, -0.235, -0.027, 0.03, 0.12, 0.054), 0.05);
    e = smax(e, -ell(ax, y, z, 0.334, -0.035, -0.045, 0.02, 0.09, 0.048), 0.02);             // 耳甲
    e = smax(e, -ell(ax, y, z, 0.324, -0.25, -0.025, 0.022, 0.05, 0.011), 0.01);             // 垂珠上的长孔（浅）
    d = smin(d, e, 0.024);
  }
  return d;
}
/** 发际：一个向后下倾的面，面以上是发。> 0 在发里 */
const hairMask = (x, y, z) => y - (0.205 - 0.56 * (0.255 - z)) + 0.012 * sstep(0.2, 0.3, Math.abs(x));
/** 没有螺发的发面：颅外一层 + 低平的肉髻 */
const capD = (x, y, z) => ell(x, y, z, 0, 0.1, -0.055, 0.302, 0.312, 0.339);
const ushD = (x, y, z) => ell(x, y, z, 0, 0.372, -0.075, 0.172, 0.112, 0.172);
const hairSmooth = (x, y, z) => smin(capD(x, y, z), ushD(x, y, z), 0.035);

// 螺发：一颗颗小圆包，从发际起一圈圈排上去
const CURL_R = 0.0262, GRID = 0.062;
const curls = [], cgrid = new Map();
(function placeCurls() {
  const spacing = 0.047;
  const add = (p) => {
    const e = 0.002;
    const nx = hairSmooth(p[0] + e, p[1], p[2]) - hairSmooth(p[0] - e, p[1], p[2]), ny = hairSmooth(p[0], p[1] + e, p[2]) - hairSmooth(p[0], p[1] - e, p[2]), nz = hairSmooth(p[0], p[1], p[2] + e) - hairSmooth(p[0], p[1], p[2] - e);
    const l = Math.hypot(nx, ny, nz) || 1;
    const c = [p[0] - (nx / l) * 0.008, p[1] - (ny / l) * 0.008, p[2] - (nz / l) * 0.008];    // 半埋
    if (faceLocal(p[0], p[1], p[2]) < 0.006) return;                                            // 耳尖处让开
    for (const o of curls) if (Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < spacing * 0.74) return;
    curls.push(c);
  };
  const march = (o, d) => {
    let a = 0.02, b = 0.7;
    for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (hairSmooth(o[0] + d[0] * m, o[1] + d[1] * m, o[2] + d[2] * m) < 0) a = m; else b = m; }
    return [o[0] + d[0] * a, o[1] + d[1] * a, o[2] + d[2] * a];
  };
  const rings = (o, Ax, th0, th1, R, ok) => {
    // 以 Ax 为极轴的一圈圈；从 th0 排到 th1
    const U = [1, 0, 0], Vv = [0, Ax[2], -Ax[1]];
    const dth = spacing / R, dir = th1 >= th0 ? 1 : -1;
    let k = 0;
    for (let th = th0; dir > 0 ? th <= th1 : th >= th1; th += dir * dth, k++) {
      const n = Math.max(1, Math.round((2 * Math.PI * R * Math.sin(th)) / spacing));
      for (let i = 0; i < n; i++) {
        const ph = ((i + (k % 2) * 0.5) / n) * 2 * Math.PI + Math.PI / 2;
        const s = Math.sin(th), c = Math.cos(th);
        const d = [Ax[0] * c + (U[0] * Math.cos(ph) + Vv[0] * Math.sin(ph)) * s, Ax[1] * c + (U[1] * Math.cos(ph) + Vv[1] * Math.sin(ph)) * s, Ax[2] * c + (U[2] * Math.cos(ph) + Vv[2] * Math.sin(ph)) * s];
        const p = march(o, d);
        if (ok(p)) add(p);
      }
    }
  };
  const ushDom = (p) => ushD(p[0], p[1], p[2]) < capD(p[0], p[1], p[2]) + 0.012;
  const n = Math.hypot(1, 0.56);
  rings([0, 0.1, -0.055], [0, 1 / n, -0.56 / n], 1.72, 0.1, 0.318, (p) => !ushDom(p) && hairMask(p[0], p[1], p[2]) > 0.004);
  rings([0, 0.31, -0.075], [0, 1, 0], 1.6, 0.0, 0.17, (p) => ushDom(p));
  // 两套圈之间、别处漏下的空，再补一遍（均匀撒点，只在够空的地方落）
  {
    const N = 2600, ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const yy = 1 - (i / (N - 1)) * 1.55, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), th = i * ga;
      const p = march([0, 0.1, -0.055], [Math.cos(th) * rr, yy, Math.sin(th) * rr]);
      if (hairMask(p[0], p[1], p[2]) < 0.004) continue;
      let near = false;
      for (const o of curls) if (Math.hypot(o[0] - p[0], o[1] - p[1], o[2] - p[2]) < spacing * 0.93) { near = true; break; }
      if (!near) add(p);
    }
  }
  for (let i = 0; i < curls.length; i++) {
    const c = curls[i], key = `${Math.floor(c[0] / GRID)},${Math.floor(c[1] / GRID)},${Math.floor(c[2] / GRID)}`;
    let a = cgrid.get(key);
    if (!a) cgrid.set(key, (a = []));
    a.push(i);
  }
})();
export const curlCount = () => curls.length;
function curlDist(x, y, z) {
  const gx = Math.floor(x / GRID), gy = Math.floor(y / GRID), gz = Math.floor(z / GRID);
  let best = 1;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const a = cgrid.get(`${gx + i},${gy + j},${gz + k}`);
    if (!a) continue;
    for (const q of a) {
      const c = curls[q], d = Math.hypot(x - c[0], y - c[1], z - c[2]) - CURL_R;
      if (d < best) best = d;
    }
  }
  return best;
}
function hairLocal(x, y, z) {
  const base = Math.max(hairSmooth(x, y, z), -hairMask(x, y, z));
  if (base > 0.05) return base;
  return smin(base, curlDist(x, y, z), 0.007);
}

export function headField(x, y, z) {
  toHead(x, y, z);
  return faceLocal(HX, HY, HZ) * HS;
}
/** 头面的网格里，确实被发盖住的那部分不要（> 0 的地方切掉）。耳尖露在发外，要留 */
export function headUnderHair(x, y, z) {
  toHead(x, y, z);
  return Math.min(hairMask(HX, HY, HZ) - 0.03, -hairSmooth(HX, HY, HZ) - 0.003) * HS;
}
export function hairField(x, y, z) {
  toHead(x, y, z);
  return hairLocal(HX, HY, HZ) * HS;
}

// ———————————————————————— 合 ————————————————————————
/** 肉身与衣（不含发） */
export function skinField(x, y, z) {
  if (y < 1.98) return bodyField(x, y, z);
  if (y > 2.56) return headField(x, y, z);
  return smin(bodyField(x, y, z), headField(x, y, z), 0.05);
}
export function fullField(x, y, z) {
  const s = skinField(x, y, z);
  if (y > 2.4) return Math.min(s, hairField(x, y, z));
  return y < 1.1 ? Math.min(s, handsField(x, y, z)) : s;
}
