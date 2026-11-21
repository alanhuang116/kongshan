// 生成星表与星官数据（src/data/stars.ts、src/data/xingguan.ts）。不进构建，只在数据要重做时手动跑一次。
//
// 用法（下载的原始数据放在一个空目录里，当作不可信的数据，只读）：
//   node src/world/env/stars/gen/build-sky.mjs <hip.tsv> <stellarium-chinese-index.json> <navbox.json>
//
//   hip.tsv —— 依巴谷星表（ESA 1997，VizieR I/239/hip_main）的一段：HIP、RAICRS、DEICRS、Vmag、B-V、RAhms、DEdms，亮于 9.5 等即可。取法：
//     https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=I/239/hip_main&-out=HIP,RAICRS,DEICRS,Vmag,B-V,RAhms,DEdms&Vmag=%3C9.5&-out.max=200000
//     （有几颗双星没有天测解，RAICRS 是空的，就用 RAhms、DEdms 那一份）
//   index.json —— Stellarium 天空文化 chinese 的连线与星官名（CC BY-SA）：
//     https://raw.githubusercontent.com/Stellarium/stellarium-skycultures/master/chinese/index.json
//   navbox.json —— 中文维基「中国古代星官」五张导航框（按《步天歌》分三垣二十八宿；CC BY-SA），由 fetch-navbox 抽成 { 组: [星官名…] }。
//
// 产出的两份数据见各自文件头的说明（字段、许可）。docs/SKY.md 里有这一步的来龙去脉。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [hipPath, stelPath, navPath] = process.argv.slice(2);
if (!hipPath || !stelPath || !navPath) { console.error('用法见文件头'); process.exit(1); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

// —— 依巴谷 ——
const rows = readFileSync(hipPath, 'utf8').split(/\r?\n/).filter((l) => /^\s*\d+\t/.test(l)).map((l) => {
  const c = l.split('\t');
  const num = (s) => (s && s.trim() !== '' ? Number(s) : NaN);
  let ra = num(c[1]), de = num(c[2]);
  if (!Number.isFinite(ra) && c[5]?.trim()) { const [h, m, s] = c[5].trim().split(/\s+/).map(Number); ra = (h + m / 60 + s / 3600) * 15; }
  if (!Number.isFinite(de) && c[6]?.trim()) { const t = c[6].trim(), sg = t.startsWith('-') ? -1 : 1, [d, m, s] = t.replace(/^[+-]/, '').split(/\s+/).map(Number); de = sg * (d + m / 60 + s / 3600); }
  return { hip: num(c[0]), ra, de, v: num(c[3]), bv: num(c[4]) };
}).filter((r) => Number.isFinite(r.ra) && Number.isFinite(r.de) && Number.isFinite(r.v));
const byHip = new Map(rows.map((r) => [r.hip, r]));
console.log('依巴谷', rows.length);

// —— Stellarium chinese ——
const stel = JSON.parse(readFileSync(stelPath, 'utf8'));
// 三个没写中文名的
const NATIVE_FIX = { Star: '星宿', Tortoise: '龟', Judging: '平' };
const cons = stel.constellations.map((c) => {
  const en = c.common_name.english;
  let native = c.common_name.native ?? NATIVE_FIX[en];
  // 「王良 (土司空)」那一条英文是 Master of Constructions (In Legs Mansion)，中文名写错了；它没有连线，下面也会被丢掉
  if (en.startsWith('Master of Constructions')) native = '土司空';
  const m = /^(.*?)\s*\((.*)\)$/.exec(native);
  return { en, native, name: m ? m[1] : native, hint: m ? m[2] : '', lines: c.lines };
});

// —— 维基导航框：三垣二十八宿各有哪些星官 ——
const nav = JSON.parse(readFileSync(navPath, 'utf8'));
const REGIONS = ['紫微垣', '太微垣', '天市垣', '角宿', '亢宿', '氐宿', '房宿', '心宿', '尾宿', '箕宿', '斗宿', '牛宿', '女宿', '虚宿', '危宿', '室宿', '壁宿', '奎宿', '娄宿', '胃宿', '昴宿', '毕宿', '觜宿', '参宿', '井宿', '鬼宿', '柳宿', '星宿', '张宿', '翼宿', '轸宿'];
const ALIAS = { 璃瑜: '离瑜', 蒭藁: '刍藁', '𫓧钺': '鈇钺', '𫓧锧': '鈇锧' };
/** 星官名 → 可能所属的区（同名的有两处） */
const cand = new Map();
for (const groups of Object.values(nav)) for (const g of groups) {
  const r = REGIONS.indexOf(g.group);
  if (r < 0) { console.warn('不认得的组', g.group); continue; }
  for (let n of g.names) {
    n = ALIAS[n] ?? n;
    // 二十八宿本身在导航框里只写一个字（角、亢……）
    if (r >= 3 && n === g.group[0]) n = g.group;
    if (!cand.has(n)) cand.set(n, []);
    if (!cand.get(n).includes(r)) cand.get(n).push(r);
  }
}

// —— 方向 ——
const D2R = Math.PI / 180;
const vec = (ra, de) => [Math.cos(de * D2R) * Math.cos(ra * D2R), Math.cos(de * D2R) * Math.sin(ra * D2R), Math.sin(de * D2R)];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const centroid = (hips) => norm(hips.reduce((s, h) => { const r = byHip.get(h); const v = vec(r.ra, r.de); return [s[0] + v[0], s[1] + v[1], s[2] + v[2]]; }, [0, 0, 0]));

// 每个星官的星（去重）与线段
for (const c of cons) {
  const set = [];
  c.segs = [];
  for (const line of c.lines) {
    for (const h of line) if (!set.includes(h)) set.push(h);
    for (let i = 0; i + 1 < line.length; i++) if (line[i] !== line[i + 1]) c.segs.push([line[i], line[i + 1]]);
  }
  c.stars = set.filter((h) => byHip.has(h));
  if (c.stars.length !== set.length) console.warn('星表里缺', c.native, set.filter((h) => !byHip.has(h)));
  c.center = c.stars.length ? centroid(c.stars) : null;
}
// 先定只有一处可去的，再按位置给同名的挑最近的那一区
for (const c of cons) {
  if (!c.stars.length) { c.region = -1; continue; }
  let rs = cand.get(c.name) ?? [];
  const hintR = REGIONS.indexOf(c.hint.replace(/^附/, ''));
  if (rs.length > 1 && hintR >= 0 && rs.includes(hintR)) rs = [hintR];
  if (/^附/.test(c.hint) && !rs.length) {
    // 附在某个星官上的（附北斗、附华盖……）：跟着那个星官
    const host = cons.find((x) => x.name === c.hint.slice(1) || x.native === c.hint.slice(1));
    if (host) rs = cand.get(host.name) ?? [];
  }
  c.cands = rs;
  c.region = rs.length === 1 ? rs[0] : -2;
}
const centerOf = REGIONS.map((_, r) => { const m = cons.filter((c) => c.region === r && c.center); return m.length ? norm(m.reduce((s, c) => [s[0] + c.center[0], s[1] + c.center[1], s[2] + c.center[2]], [0, 0, 0])) : null; });
for (const c of cons) if (c.region === -2) {
  if (!c.cands.length) { c.region = -1; continue; }
  c.region = c.cands.slice().sort((a, b) => dot(centerOf[b], c.center) - dot(centerOf[a], c.center))[0];
  console.log('同名按位置定', c.native, '→', REGIONS[c.region], '（候选', c.cands.map((r) => REGIONS[r]).join('、'), '）');
}
const dropped = cons.filter((c) => c.region < 0).map((c) => c.native);
console.log('不收（不在《步天歌》三垣二十八宿里，或没有连线）', dropped.length, dropped.join(' '));
const keep = cons.filter((c) => c.region >= 0);
console.log('收', keep.length);

// —— 选星：亮于 6.0 等的，加上星官里的 ——
const LIMIT = 6.0;
const want = new Set(rows.filter((r) => r.v <= LIMIT).map((r) => r.hip));
for (const c of keep) for (const h of c.stars) want.add(h);
// 二十八宿的距星（猎户座δ 等，见 docs/SOURCES.md）、北斗七星与今天的北极星
const JU = { 角宿: 65474, 亢宿: 69427, 氐宿: 72622, 房宿: 78265, 心宿: 80112, 尾宿: 82514, 箕宿: 88635, 斗宿: 92041, 牛宿: 100345, 女宿: 102618, 虚宿: 106278, 危宿: 109074, 室宿: 113963, 壁宿: 1067, 奎宿: 3693, 娄宿: 8903, 胃宿: 12719, 昴宿: 17499, 毕宿: 20889, 觜宿: 26207, 参宿: 25930, 井宿: 30343, 鬼宿: 41822, 柳宿: 42313, 星宿: 46390, 张宿: 48356, 翼宿: 53740, 轸宿: 59803 };
const DIPPER = [54061, 53910, 58001, 59774, 62956, 65378, 67301, 11767];
for (const h of [...Object.values(JU), ...DIPPER]) { if (!byHip.has(h)) throw new Error('星表里没有 HIP ' + h); want.add(h); }
const sel = [...want].map((h) => byHip.get(h)).sort((a, b) => a.v - b.v || a.hip - b.hip);
const idx = new Map(sel.map((r, i) => [r.hip, i]));
console.log('选星', sel.length, '其中亮于', LIMIT, '等的', sel.filter((r) => r.v <= LIMIT).length);

// 距星都该在它那一宿的星官里
for (const [xiu, h] of Object.entries(JU)) {
  const c = keep.find((x) => x.native === xiu);
  if (!c) console.warn('没有这一宿的星官', xiu);
  else if (!c.stars.includes(h)) console.warn('距星不在那一宿的星官里', xiu, h, c.stars);
}

// —— 打包星表：每颗 6 字节 ——
const buf = Buffer.alloc(sel.length * 6);
sel.forEach((r, i) => {
  const ra = Math.round((((r.ra % 360) + 360) % 360) / 360 * 65536) % 65536;
  const de = Math.round((r.de + 90) / 180 * 65535);
  const mg = Math.max(0, Math.min(255, Math.round((r.v + 1.5) * 20)));
  const bv = Math.max(0, Math.min(255, Math.round(((Number.isFinite(r.bv) ? r.bv : 0.65) + 0.4) * 100)));
  buf.writeUInt16LE(ra, i * 6); buf.writeUInt16LE(de, i * 6 + 2); buf.writeUInt8(mg, i * 6 + 4); buf.writeUInt8(bv, i * 6 + 5);
});
const b64 = buf.toString('base64');

// —— 星名：Stellarium 的英文星名（「Weaving Girl I」「Horn Added III」）对回中文的星官名 + 数 ——
const NUM = '〇一二三四五六七八九';
const cnNum = (n) => (n < 10 ? NUM[n] : n < 20 ? '十' + (n % 10 ? NUM[n % 10] : '') : NUM[Math.floor(n / 10)] + '十' + (n % 10 ? NUM[n % 10] : ''));
const roman = (s) => { const V = { I: 1, V: 5, X: 10, L: 50, C: 100 }; let n = 0; for (let i = 0; i < s.length; i++) { const a = V[s[i]], b = V[s[i + 1]] ?? 0; n += a < b ? -a : a; } return n; };
const baseEn = (en) => en.replace(/\s*\(.*\)$/, '');
const names = [];   // [星的序号, 星官的序号, 数（增 n 记作 100 + n；0 是只有名字没有数）]
let unnamed = 0;
for (const r of sel) {
  const list = stel.common_names[`HIP ${r.hip}`];
  if (!list?.length) continue;
  const en = list[0].english;
  const m = /^(.*?)( Added)? ([IVXLC]+)$/.exec(en);
  const base = m ? m[1] : en, num = m ? roman(m[3]) + (m[2] ? 100 : 0) : 0;
  let hosts = keep.filter((c) => baseEn(c.en) === base);
  if (hosts.length > 1) { const inl = hosts.filter((c) => c.stars.includes(r.hip)); if (inl.length) hosts = inl; else { const v = vec(r.ra, r.de); hosts.sort((a, b) => dot(b.center, v) - dot(a.center, v)); } }
  if (!hosts.length) { if (unnamed++ < 12) console.log('  对不上', r.hip, r.v, en); continue; }
  names.push([idx.get(r.hip), keep.indexOf(hosts[0]), num]);
}
console.log('有中文星名的', names.length, '对不上的', unnamed);

// —— 写出 ——
const CRLF = (s) => s.replace(/\r?\n/g, '\r\n');
const starsTs = `/**
 * 星表（由 src/world/env/stars/gen/build-sky.mjs 生成，别手改）。
 *
 * 来源：依巴谷星表（The Hipparcos and Tycho Catalogues, ESA 1997；经 CDS VizieR I/239 取得）。
 * 收的是亮于 ${LIMIT.toFixed(1)} 等的星（${sel.filter((r) => r.v <= LIMIT).length} 颗），加上星官连线、二十八宿距星用到的暗一些的星，共 ${sel.length} 颗，按星等由亮到暗排
 * （所以「只画最亮的 n 颗」就是只画前 n 颗）。位置是 ICRS（约等于 J2000 的赤道坐标），历元 1991.25，没有再按自行推。
 *
 * STAR_DATA 是 base64：每颗 6 字节，小端——
 *   赤经 u16（0…65535 → 0°…360°）、赤纬 u16（0…65535 → −90°…+90°）、星等 u8（(V + 1.5) × 20）、色指数 u8（(B−V + 0.4) × 100）。
 * 解开、换算见 src/world/env/stars/catalog.ts。
 */
export const STAR_N = ${sel.length};
export const STAR_LIMIT = ${LIMIT};
export const STAR_DATA = '${b64}';
`;
writeFileSync(join(ROOT, 'src/data/stars.ts'), CRLF(starsTs), 'utf8');
// 依巴谷编号另放一份（只给测试、查对用，不进正式的包）
writeFileSync(join(ROOT, 'src/data/stars-hip.ts'), CRLF(`/** 星表里每颗星的依巴谷编号（按 src/data/stars.ts 的顺序；u32 小端，base64）。由 build-sky.mjs 生成；只给测试、查对用 */
export const STAR_HIP_B64 = '${Buffer.from(Uint32Array.from(sel.map((r) => r.hip)).buffer).toString('base64')}';
`), 'utf8');

const xgLines = keep.map((c) => {
  const s = c.stars.map((h) => idx.get(h));
  const l = c.segs.filter(([a, b]) => idx.has(a) && idx.has(b)).flatMap(([a, b]) => [idx.get(a), idx.get(b)]);
  return `  [${JSON.stringify(c.name)}, ${c.region}, [${s.join(',')}], [${l.join(',')}]],`;
});
const xgTs = `/**
 * 星官：三垣二十八宿（由 src/world/env/stars/gen/build-sky.mjs 生成，别手改）。
 *
 * 连线、星官名、星名取自 Stellarium 天空文化「chinese」（作者：Karrie Berglund / Digitalis Education Solutions，据香港太空馆星图；
 * 孙书伟补了两百多个星官、三千多颗星，据伊世同《中西对照恒星图表 1950.0》；Stellarium 团队整理。许可：CC BY-SA）。
 * 各星官属于三垣二十八宿的哪一区，按中文维基「中国古代星官」导航框（以丹元子《步天歌》为准；CC BY-SA）。
 * 明末据西洋星图补的近南极二十三星官不收（宋人没有）。
 * 本文件是上面两份数据的改编，依 CC BY-SA 4.0 发布（https://creativecommons.org/licenses/by-sa/4.0/）。
 *
 * 星的序号都是 src/data/stars.ts 里的顺序。
 */
/** 三垣与二十八宿（二十八宿自角起，东方苍龙、北方玄武、西方白虎、南方朱雀各七） */
export const REGIONS = ${JSON.stringify(REGIONS)};
/** 二十八宿各宿的距星（星的序号，按 REGIONS[3…30] 的次序） */
export const JU_XING = [${REGIONS.slice(3).map((x) => idx.get(JU[x])).join(', ')}];
/** 北斗七星（天枢、天璇、天玑、天权、玉衡、开阳、摇光）与今天的北极星（勾陈一）的序号 */
export const DIPPER_STARS = [${DIPPER.map((h) => idx.get(h)).join(', ')}];
/** 每个星官：[名, 所属区（REGIONS 的序号）, 星（序号）, 连线（两两一段的序号）] */
export const XINGGUAN: Array<[string, number, number[], number[]]> = [
${xgLines.join('\n')}
];
/** 星名：[星的序号, 星官（XINGGUAN 的序号）, 数]。数 n 即「星官名 + n」（织女一）；100 + n 是「增 n」（角宿增一）；0 是星官名本身（大角、天狼） */
export const STAR_NAMES = '${Buffer.from(Uint16Array.from(names.flat()).buffer).toString('base64')}';
`;
writeFileSync(join(ROOT, 'src/data/xingguan.ts'), CRLF(xgTs), 'utf8');
console.log('写好', (starsTs.length / 1024).toFixed(1), 'KB 与', (xgTs.length / 1024).toFixed(1), 'KB');
