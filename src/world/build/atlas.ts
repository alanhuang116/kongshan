/**
 * 字与图的图集：门联、亭额、书签、书页、诗稿、挂轴上的先天图、亭里石盘上的八卦、圭上的刻度——都现写现画在一张画布上，
 * 当「颜料图」乘在物件的颜色上（白处露本色，墨处是墨）。带字带图的面共用一种材质（一次绘制）。
 *
 * 卦的画法（都按邵雍的先天之学）：
 *   一卦的爻自下而上记作 0/1（1 是阳爻，一画不断）；v = Σ 爻ᵢ·2^(5−i)，i=0 是初爻（最下一画）。
 *   先天八卦（伏羲八卦方位）：乾南、坤北、离东、坎西、兑东南、震东北、巽西南、艮西北；每卦的初爻朝着圆心。
 *   六十四卦方圆图：圆图上南下北（乾在上、坤在下），自复至乾在左（自下而上 v=32…63），自姤至坤在右（自上而下 v=31…0），初爻朝圆心；
 *     方图乾在西北（右下角）、坤在东南（左上角）：同一横排的内卦（下三爻）相同、同一竖列的外卦（上三爻）相同，卦都正着画。
 */
import * as THREE from 'three';
import { mulberry32, type Rng } from '../core/rng';
import { BRUSH, KAI, fontsReady, inkTexture, paintText } from '../ink/text';

export const COUPLET_R = '闭门即是深山', COUPLET_L = '读书随处净土';
/** 邵雍的两首小诗，散在案上 */
const POEMS = [['月到天心处', '风来水面时', '一般清意味', '料得少人知'], ['一去二三里', '烟村四五家', '亭台六七座', '八九十枝花']];
/** 《皇极经世·观物内篇》开头几句（书页上的字） */
const GUANWU = '物之大者无若天地然而亦有所尽也天之大阴阳尽之矣地之大刚柔尽之矣阴阳尽而四时成焉刚柔尽而四维成焉夫四时四维者天地至大之谓也';
const ALL_TEXT = COUPLET_R + COUPLET_L + '观物周易皇极经世蒙以养正夏至冬至二分伏羲八卦方位安乐窝酒' + POEMS.flat().join('') + GUANWU;

/** 八卦：名字、自下而上的三爻、先天方位（自正北起顺时针的度数：北 0、东 90、南 180、西 270） */
export const BAGUA: Array<{ name: string; bits: [number, number, number]; deg: number }> = [
  { name: '乾', bits: [1, 1, 1], deg: 180 }, { name: '兑', bits: [1, 1, 0], deg: 135 }, { name: '离', bits: [1, 0, 1], deg: 90 }, { name: '震', bits: [1, 0, 0], deg: 45 },
  { name: '巽', bits: [0, 1, 1], deg: 225 }, { name: '坎', bits: [0, 1, 0], deg: 270 }, { name: '艮', bits: [0, 0, 1], deg: 315 }, { name: '坤', bits: [0, 0, 0], deg: 0 },
];
/** 圆图上自正上方（南）起顺时针第 j 位（0…63）是哪一卦 */
export const circleV = (j: number) => (j < 32 ? 31 - j : j);
/** 方图上第 row 行（自上而下）、第 col 列（自左而右）是哪一卦 */
export const squareV = (row: number, col: number) => row * 8 + col;
/** 洛阳的纬度、黄赤交角（度）：算圭上各节气正午的影长 */
const LAT = 34.62, OBL = 23.5;
/** 表高 h 时，太阳黄经 lam（度，春分为 0）那天正午的影长 */
export function noonShadow(h: number, lam: number): number {
  const dec = Math.asin(Math.sin((OBL * Math.PI) / 180) * Math.sin((lam * Math.PI) / 180));
  return h / Math.tan(Math.PI / 2 - (LAT * Math.PI) / 180 + dec);
}

export interface Atlas { map: THREE.CanvasTexture; rect(name: string): [number, number, number, number]; blank: [number, number] }

/** 一画：阳爻一笔不断，阴爻中间断开。在当前坐标系里画一条横着的笔道，中心在 (0, y) */
function yao(g: CanvasRenderingContext2D, R: Rng, y: number, len: number, th: number, yang: number, ink: string) {
  g.fillStyle = ink;
  const seg = (x0: number, x1: number) => {
    // 笔道：两头略圆、粗细略有出入
    const t = th * (0.86 + 0.28 * R()), dy = (R() - 0.5) * th * 0.25;
    g.beginPath();
    g.moveTo(x0, y - t / 2 + dy); g.lineTo(x1, y - t / 2 * (0.85 + 0.3 * R()) + dy);
    g.quadraticCurveTo(x1 + t * 0.4, y + dy, x1, y + t / 2 + dy); g.lineTo(x0, y + t / 2 * (0.85 + 0.3 * R()) + dy);
    g.quadraticCurveTo(x0 - t * 0.4, y + dy, x0, y - t / 2 + dy);
    g.fill();
  };
  if (yang) seg(-len / 2, len / 2); else { const gap = len * 0.2; seg(-len / 2, -gap / 2); seg(gap / 2, len / 2); }
}
/** 一卦：初爻在 y=0，往上（−y）一画一画叠上去。bits 自下而上 */
function gua(g: CanvasRenderingContext2D, R: Rng, bits: number[], len: number, pitch: number, th: number, ink: string) {
  bits.forEach((b, i) => yao(g, R, -i * pitch, len, th, b, ink));
}

/** 先天八卦一圈：圆心 (cx, cy)，初爻所在的半径 r0。north 是「北」在画面上朝哪（自画面正上方起顺时针的度数） */
function baguaRing(g: CanvasRenderingContext2D, R: Rng, cx: number, cy: number, r0: number, len: number, pitch: number, th: number, ink: string, north = 0) {
  for (const t of BAGUA) {
    const a = ((t.deg + north) * Math.PI) / 180;
    g.save();
    g.translate(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); g.rotate(a);
    gua(g, R, t.bits, len, pitch, th, ink);
    g.restore();
  }
}

/** 六十四卦方圆图（先天图）：画在 (x, y) 起、边长 s 的方框里 */
function xiantian(g: CanvasRenderingContext2D, R: Rng, x: number, y: number, s: number) {
  const cx = x + s / 2, cy = y + s / 2, ink = 'rgb(36,35,38)';
  const rIn = s * 0.392, pitch = s * 0.0098, th = s * 0.0052, len = ((2 * Math.PI * rIn) / 64) * 0.66;
  for (let j = 0; j < 64; j++) {
    const v = circleV(j), a = ((j + 0.5) / 64) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.sin(a) * rIn, cy - Math.cos(a) * rIn); g.rotate(a);
    gua(g, R, [5, 4, 3, 2, 1, 0].map((k) => (v >> k) & 1), len, pitch, th, ink);
    g.restore();
  }
  const side = rIn * Math.SQRT2 * 0.9, cell = side / 8, sl = cell * 0.56, sp = cell * 0.118, st = cell * 0.064;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const v = squareV(r, c);
    g.save();
    g.translate(cx - side / 2 + (c + 0.5) * cell, cy - side / 2 + (r + 0.5) * cell + sp * 2.5);
    gua(g, R, [5, 4, 3, 2, 1, 0].map((k) => (v >> k) & 1), sl, sp, st, ink);
    g.restore();
  }
  // 右下角一方小小的朱印
  g.fillStyle = 'rgb(214,96,78)';
  g.fillRect(x + s * 0.9, y + s * 0.93, s * 0.036, s * 0.036);
}

/** 一幅素淡的水墨小景（榻上的挂轴）：几重远山、一带留白的水、近处坡石与两株树 */
function landscape(g: CanvasRenderingContext2D, R: Rng, x: number, y: number, w: number, h: number) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const hump = (base: number, hi: number, tone: number, n: number) => {
    g.fillStyle = `rgba(${tone},${tone},${tone + 6},1)`;
    g.beginPath(); g.moveTo(x, y + base);
    for (let i = 0; i <= n; i++) { const t = i / n; g.lineTo(x + t * w, y + base - hi * (0.25 + 0.75 * Math.pow(Math.sin(Math.PI * (t * (0.8 + 0.4 * R()) + 0.1 * R())), 2)) * (0.6 + 0.4 * R())); }
    g.lineTo(x + w, y + base); g.closePath(); g.fill();
    // 山脚淡进留白里
    const gr = g.createLinearGradient(0, y + base - hi * 0.5, 0, y + base + 2);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(x, y + base - hi * 0.5, w, hi * 0.5 + 3);
  };
  hump(h * 0.36, h * 0.2, 214, 7); hump(h * 0.47, h * 0.17, 188, 9); hump(h * 0.6, h * 0.13, 150, 11);
  // 近坡
  g.fillStyle = 'rgb(120,120,124)';
  g.beginPath(); g.moveTo(x, y + h * 0.9); g.quadraticCurveTo(x + w * 0.3, y + h * 0.8, x + w * 0.62, y + h * 0.88); g.lineTo(x + w * 0.7, y + h); g.lineTo(x, y + h); g.closePath(); g.fill();
  // 两株树：一竖干、几团叶
  for (const [tx, th, tw] of [[0.24, 0.17, 0.09], [0.36, 0.13, 0.07]] as Array<[number, number, number]>) {
    g.strokeStyle = 'rgb(46,45,48)'; g.lineWidth = Math.max(1, w * 0.012);
    g.beginPath(); g.moveTo(x + tx * w, y + h * 0.86); g.lineTo(x + (tx + 0.02) * w, y + h * (0.86 - th)); g.stroke();
    g.fillStyle = 'rgb(70,70,74)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(x + (tx + 0.02 + (R() - 0.5) * tw * 2) * w, y + h * (0.86 - th * (0.7 + 0.5 * R())), w * tw * (0.5 + 0.4 * R()), w * tw * 0.36, 0, 0, 6.3); g.fill(); }
  }
  // 茅亭一角
  g.strokeStyle = 'rgb(46,45,48)'; g.lineWidth = Math.max(1, w * 0.01);
  g.beginPath(); g.moveTo(x + w * 0.5, y + h * 0.83); g.lineTo(x + w * 0.58, y + h * 0.795); g.lineTo(x + w * 0.66, y + h * 0.83); g.moveTo(x + w * 0.53, y + h * 0.83); g.lineTo(x + w * 0.53, y + h * 0.87); g.moveTo(x + w * 0.63, y + h * 0.83); g.lineTo(x + w * 0.63, y + h * 0.875); g.stroke();
  g.fillStyle = 'rgb(214,96,78)'; g.fillRect(x + w * 0.84, y + h * 0.9, w * 0.07, w * 0.07);
  g.restore();
}

/** 圭面：一条长石尺。画布的右端是表脚（南），往左是北；细刻度之外，二十四节气正午的影长各刻一道，二至二分标了字 */
function ruler(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, len: number, post: number) {
  const ink = 'rgb(96,96,100)', X = (L: number) => x + w * (1 - L / len);
  g.fillStyle = ink;
  // 两道水槽（校平用）
  g.fillRect(x + w * 0.012, y + h * 0.1, w * 0.976, Math.max(1, h * 0.03)); g.fillRect(x + w * 0.012, y + h * 0.87, w * 0.976, Math.max(1, h * 0.03));
  // 细刻度：每 2 厘米一小画、每 10 厘米一长画
  for (let i = 1; i * 0.02 < len - 0.02; i++) {
    const L = i * 0.02, long = i % 5 === 0;
    g.fillRect(X(L), y + h * 0.13, Math.max(1, w * 0.0012), h * (long ? 0.2 : 0.1));
  }
  // 节气：自夏至（影最短）到冬至（影最长）十三道
  for (let k = -6; k <= 6; k++) {
    const L = noonShadow(post, k * 15), main = k === 6 || k === -6 || k === 0;
    if (L > len - 0.03) continue;
    g.fillRect(X(L) - (main ? 1 : 0), y + h * (main ? 0.13 : 0.5), Math.max(1.5, w * (main ? 0.0036 : 0.002)), h * (main ? 0.74 : 0.37));
  }
  const lab = (L: number, s: string) => paintText(g, [s], X(L) - h * 0.44, y + h * 0.3, h * 0.36, h * 0.6, { vertical: true, font: KAI, color: ink, bg: null, hand: 0.15, pad: 0.02, gap: 0.06 });
  lab(noonShadow(post, 90), '夏至'); lab(noonShadow(post, 0), '二分'); lab(noonShadow(post, -90), '冬至');
}

/**
 * 画图集。tex 是画质的倍率（低档 0.5）。要先等字体到齐。
 * 各格（rect(名字) 取 uv）：coupletR / coupletL 门联、guanwu 亭额、school 村塾的匾、yi《周易》书签、book 摊开的《皇极经世》、
 * xiantian 先天图、compass 亭里石盘上的八卦、ruler 圭面、poem0 / poem1 诗稿、scene 水墨小景。
 */
export async function makeAtlas(tex: number, gnomon: { h: number; len: number }): Promise<Atlas> {
  await fontsReady(ALL_TEXT);
  const S = Math.max(0.5, tex), W = Math.round(2048 * S), H = Math.round(1024 * S);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const R = mulberry32(6401);
  const cells: Record<string, [number, number, number, number]> = {};
  /** 登记一格（按 2048×1024 的坐标给），返回它在画布上的像素框 */
  const cell = (name: string, x: number, y: number, w: number, h: number): [number, number, number, number] => {
    // uv 往里收一个像素，免得缩小时沾到邻格
    cells[name] = [(x * S + 1) / W, 1 - ((y + h) * S - 1) / H, ((x + w) * S - 1) / W, 1 - (y * S + 1) / H];
    return [x * S, y * S, w * S, h * S];
  };
  const INKC = '#1d1c1e';

  // 门联：两条窄板，竖写
  { const [x, y, w, h] = cell('coupletR', 96, 0, 128, 768); paintText(g, [COUPLET_R], x, y, w, h, { vertical: true, color: INKC, hand: 0.55, dry: 0.5, seed: 3, pad: 0.34, gap: 0.14, bold: 0.035 }); }
  { const [x, y, w, h] = cell('coupletL', 224, 0, 128, 768); paintText(g, [COUPLET_L], x, y, w, h, { vertical: true, color: INKC, hand: 0.55, dry: 0.5, seed: 5, pad: 0.34, gap: 0.14, bold: 0.035 }); }
  // 先天图
  { const [x, y, w] = cell('xiantian', 352, 0, 768, 768); xiantian(g, R, x, y, w); }
  // 亭里的石盘：外内两圈细线，八卦居中间一环；画布上方是北
  {
    const [x, y, w] = cell('compass', 1120, 0, 512, 512), cx = x + w / 2, cy = y + w / 2, ink = 'rgb(92,92,97)';
    g.strokeStyle = ink;
    for (const [r, lw] of [[0.478, 0.006], [0.2, 0.004], [0.455, 0.0028]] as Array<[number, number]>) { g.lineWidth = Math.max(1, w * lw); g.beginPath(); g.arc(cx, cy, w * r, 0, Math.PI * 2); g.stroke(); }
    baguaRing(g, R, cx, cy, w * 0.262, w * 0.16, w * 0.052, w * 0.026, ink, 0);
    // 风雨磨过：零星几处露底
    g.fillStyle = '#fff';
    for (let i = 0; i < 260; i++) { g.globalAlpha = 0.35 + 0.5 * R(); const a = R() * 6.28, d = Math.sqrt(R()) * w * 0.48; g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + R() * w * 0.008, 1 + R() * w * 0.004); }
    g.globalAlpha = 1;
  }
  // 摊开的《皇极经世》：右页是《观物内篇》开头几句，左页一幅先天八卦小图（乾在上）
  {
    const [x, y, w, h] = cell('book', 1120, 512, 512, 384), ink = 'rgb(52,50,52)';
    g.strokeStyle = 'rgba(60,58,60,0.55)'; g.lineWidth = Math.max(1, S * 1.2);
    for (const px of [x + w * 0.04, x + w * 0.54]) g.strokeRect(px, y + h * 0.07, w * 0.42, h * 0.86);
    paintText(g, [GUANWU.slice(0, 10), GUANWU.slice(10, 20), GUANWU.slice(20, 30), GUANWU.slice(30, 40), GUANWU.slice(40, 50), GUANWU.slice(50, 60)], x + w * 0.545, y + h * 0.08, w * 0.41, h * 0.84, { vertical: true, font: KAI, color: ink, bg: null, hand: 0.25, pad: 0.25, gap: 0.08 });
    paintText(g, ['伏羲八卦方位'], x + w * 0.385, y + h * 0.1, w * 0.07, h * 0.56, { vertical: true, font: KAI, color: ink, bg: null, hand: 0.25, pad: 0.1, gap: 0.08 });
    const dc = x + w * 0.215, dy = y + h * 0.5, dr = w * 0.15;
    g.strokeStyle = ink; g.lineWidth = Math.max(1, S * 1.4);
    g.beginPath(); g.arc(dc, dy, dr * 0.42, 0, Math.PI * 2); g.stroke();
    baguaRing(g, R, dc, dy, dr * 0.56, dr * 0.36, dr * 0.13, dr * 0.066, ink, 180);
    // 书口（两页当中）一道
    g.fillStyle = 'rgba(60,58,60,0.35)'; g.fillRect(x + w * 0.497, y, w * 0.006, h);
  }
  // 亭额、村塾的匾（从右往左读）
  { const [x, y, w, h] = cell('guanwu', 1632, 0, 320, 160); paintText(g, ['观物'], x, y, w, h, { rtl: true, color: INKC, hand: 0.5, dry: 0.45, seed: 9, pad: 0.42, gap: 0.2, bold: 0.03 }); }
  { const [x, y, w, h] = cell('school', 1632, 160, 384, 112); paintText(g, ['蒙以养正'], x, y, w, h, { rtl: true, color: INKC, hand: 0.5, dry: 0.5, seed: 11, pad: 0.4, gap: 0.16, bold: 0.03 }); }
  // 诗稿两张：行草，自右而左
  POEMS.forEach((p, i) => { const [x, y, w, h] = cell(`poem${i}`, 1632 + i * 160, 272, 160, 224); paintText(g, p, x, y, w, h, { vertical: true, color: '#2a292b', hand: 0.9, dry: 0.25, seed: 21 + i, pad: 0.5, gap: 0.06 }); });
  // 水墨小景
  { const [x, y, w, h] = cell('scene', 1792, 496, 192, 448); landscape(g, R, x, y, w, h); }
  // 《周易》的书签
  { const [x, y, w, h] = cell('yi', 96, 768, 56, 128); g.strokeStyle = 'rgba(40,38,40,0.7)'; g.lineWidth = Math.max(1, S * 1.5); g.strokeRect(x + 2 * S, y + 2 * S, w - 4 * S, h - 4 * S); paintText(g, ['周易'], x, y, w, h, { vertical: true, font: KAI, color: INKC, bg: null, hand: 0.3, pad: 0.3, gap: 0.12 }); }
  // 圭面
  { const [x, y, w, h] = cell('ruler', 160, 776, 768, 64); ruler(g, x, y, w, h, gnomon.len, gnomon.h); }
  // 素纸上的乌丝栏（空白的稿纸）
  {
    const [x, y, w, h] = cell('sheet', 1632, 496, 160, 224);
    g.strokeStyle = 'rgba(120,96,90,0.5)'; g.lineWidth = Math.max(1, S);
    for (let i = 0; i <= 6; i++) { const px = x + w * (0.08 + (0.84 * i) / 6); g.beginPath(); g.moveTo(px, y + h * 0.07); g.lineTo(px, y + h * 0.93); g.stroke(); }
    g.strokeRect(x + w * 0.08, y + h * 0.07, w * 0.84, h * 0.86);
  }
  // 酒旗上的一个「酒」字
  { const [x, y, w, h] = cell('jiu', 952, 776, 160, 240); paintText(g, ['酒'], x, y, w, h, { color: INKC, hand: 0.4, dry: 0.4, seed: 17, pad: 0.16, bold: 0.03 }); }
  // 棋盘：纵横十九道，九个星位
  {
    const [x, y, w] = cell('go', 168, 852, 164, 164), m = w * 0.06, st = (w - 2 * m) / 18;
    g.strokeStyle = 'rgba(40,38,40,0.85)'; g.lineWidth = Math.max(1, S * 0.9);
    for (let i = 0; i < 19; i++) { g.beginPath(); g.moveTo(x + m + i * st, y + m); g.lineTo(x + m + i * st, y + w - m); g.moveTo(x + m, y + m + i * st); g.lineTo(x + w - m, y + m + i * st); g.stroke(); }
    g.fillStyle = 'rgb(40,38,40)';
    for (const i of [3, 9, 15]) for (const j of [3, 9, 15]) { g.beginPath(); g.arc(x + m + i * st, y + m + j * st, Math.max(1.2, S * 1.6), 0, 6.3); g.fill(); }
  }
  const map = inkTexture(c);
  return { map, rect: (n) => { const r = cells[n]; if (!r) throw new Error(`图集里没有「${n}」`); return r; }, blank: [(48 * S) / W, 1 - (48 * S) / H] };
}
