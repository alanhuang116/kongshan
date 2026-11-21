// 生成 src/app/styles/ink.css（node tools/ink.mjs）：宣纸的纤维、墨环、墨块、笔下的一道线、落墨、印边、墨点——都写成 SVG 放进 CSS 变量。
// 形状一律当遮罩（mask）用、颜色由 CSS 给（昼是墨、夜是月白或金），所以一份形状昼夜通用；只有纸纹分昼夜两份。
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'src', 'app', 'styles', 'ink.css');
const enc = (svg) => `url("data:image/svg+xml,${svg.replace(/\s*\n\s*/g, ' ').replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'")}")`;

// 宣纸：一层淡淡的云（纸的厚薄不匀）、一层极细的点、几十根弯弯的纤维（种子固定，每回生成一样）。
// 纤维在块的八个邻位各复一份（<use>），铺开时跨过边的那几根接得上，不显接缝；不用横竖的条纹（看着像格子纸）
const rnd = ((s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(20261121);
const f1 = (v) => v.toFixed(1);
const fibers = Array.from({ length: 52 }, () => {
  const x = rnd() * 320, y = rnd() * 320, a = rnd() * Math.PI * 2, L = 9 + rnd() * 34, bend = (rnd() - 0.5) * 1.6, k = rnd() - 0.5;
  const p = (t, q) => [x + Math.cos(a + bend * t) * L * t + q * Math.sin(a) * 6 * Math.sin(Math.PI * t), y + Math.sin(a + bend * t) * L * t - q * Math.cos(a) * 6 * Math.sin(Math.PI * t)];
  const [x1, y1] = p(0.33, k), [x2, y2] = p(0.66, -k), [x3, y3] = p(1, 0);
  return `<path d='M${f1(x)} ${f1(y)}C${f1(x1)} ${f1(y1)} ${f1(x2)} ${f1(y2)} ${f1(x3)} ${f1(y3)}' stroke-width='${(0.4 + rnd() * 0.45).toFixed(2)}' stroke-opacity='${(0.035 + rnd() * 0.05).toFixed(3)}'/>`;
}).join('');
const NEAR = [[-320, -320], [0, -320], [320, -320], [-320, 0], [320, 0], [-320, 320], [0, 320], [320, 320]];
const paper = (c) => {
  const v = Math.round(c * 255);
  return `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='320' height='320'>
<filter id='a' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='11' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${c} 0 0 0 0 ${c} 0 0 0 0 ${c} 3.4 0 0 0 -1.9'/></filter>
<filter id='b' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.018' numOctaves='3' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${c} 0 0 0 0 ${c} 0 0 0 0 ${c} 1.7 0 0 0 -0.72'/></filter>
<rect width='320' height='320' filter='url(#b)' opacity='0.06'/>
<rect width='320' height='320' filter='url(#a)' opacity='0.09'/>
<g id='f' fill='none' stroke='rgb(${v},${v},${v})' stroke-linecap='round'>${fibers}</g>
${NEAR.map(([dx, dy]) => `<use xlink:href='#f' x='${dx}' y='${dy}'/>`).join('')}
</svg>`;
};

// 圆相：一笔绕成的墨环，起笔重、收笔轻，右上留一道口；边上有毛
const ring = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
<filter id='r' x='-12%' y='-12%' width='124%' height='124%'><feTurbulence type='fractalNoise' baseFrequency='0.11' numOctaves='2' seed='8'/><feDisplacementMap in='SourceGraphic' scale='3'/></filter>
<g fill='none' stroke='#000' stroke-linecap='round' filter='url(#r)'>
<path d='M71 16 A40 40 0 0 0 12 58' stroke-width='5.4'/>
<path d='M12.5 56 A40 40 0 0 0 80 79' stroke-width='4.5'/>
<path d='M79 80 A40 40 0 0 0 90 40' stroke-width='3.3'/>
<path d='M90 42 A40 40 0 0 0 86 31' stroke-width='1.7'/>
</g></svg>`;

// 墨块：一笔横着刷过去的浓墨（主键的底）。起笔圆而实，笔身是匀的，边只略毛；飞白只在往右收笔的那一截
const STROKE = `M11 13 C5 21 4.5 42 10 51 Q62 58 122 56 T191 51.5 Q197.5 33 192.5 12.5 Q130 6.5 72 8 T11 13Z`;
const block = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 64' preserveAspectRatio='none'>
<defs>
<filter id='e' x='-3%' y='-12%' width='106%' height='124%'><feTurbulence type='fractalNoise' baseFrequency='0.07' numOctaves='2' seed='6' result='n'/><feDisplacementMap in='SourceGraphic' in2='n' scale='2.2'/><feGaussianBlur stdDeviation='0.3'/></filter>
<filter id='d' x='-3%' y='-12%' width='106%' height='124%'><feTurbulence type='fractalNoise' baseFrequency='0.022 0.5' numOctaves='2' seed='3' result='s'/><feColorMatrix in='s' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -4.2 0 0 0 3.35' result='g'/><feComposite in='SourceGraphic' in2='g' operator='in' result='c'/><feTurbulence type='fractalNoise' baseFrequency='0.07' numOctaves='2' seed='6' result='n'/><feDisplacementMap in='c' in2='n' scale='2.2'/></filter>
<linearGradient id='g1' x1='0' x2='1'><stop offset='0.64' stop-color='#fff'/><stop offset='0.9' stop-color='#000'/></linearGradient>
<linearGradient id='g2' x1='0' x2='1'><stop offset='0.56' stop-color='#000'/><stop offset='0.76' stop-color='#fff'/></linearGradient>
<mask id='m1'><rect width='200' height='64' fill='url(#g1)'/></mask>
<mask id='m2'><rect width='200' height='64' fill='url(#g2)'/></mask>
</defs>
<path d='${STROKE}' filter='url(#e)' mask='url(#m1)'/>
<path d='${STROKE}' filter='url(#d)' mask='url(#m2)'/>
</svg>`;

// 笔下的一道线：起笔重、往右渐轻（链接、选中的下面）
const line = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 10' preserveAspectRatio='none'><path d='M1 5.6 Q12 2.4 60 3 T199 4.6 Q150 6.4 90 6.9 T1 5.6Z'/></svg>`;

// 落墨：一滴墨落在纸上晕开（按下去的地方）
const bloom = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
<defs><radialGradient id='g'><stop offset='0' stop-opacity='0.95'/><stop offset='0.45' stop-opacity='0.62'/><stop offset='0.8' stop-opacity='0.2'/><stop offset='1' stop-opacity='0'/></radialGradient>
<filter id='f' x='-25%' y='-25%' width='150%' height='150%'><feTurbulence type='fractalNoise' baseFrequency='0.055' numOctaves='3' seed='2'/><feDisplacementMap in='SourceGraphic' scale='16'/></filter></defs>
<circle cx='50' cy='50' r='38' fill='url(#g)' filter='url(#f)'/></svg>`;

// 印边：一方印的边，不是齐的
const seal = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' preserveAspectRatio='none'>
<filter id='s' x='-6%' y='-6%' width='112%' height='112%'><feTurbulence type='fractalNoise' baseFrequency='0.42' numOctaves='2' seed='5'/><feDisplacementMap in='SourceGraphic' scale='1.8'/></filter>
<rect x='1.3' y='1.3' width='37.4' height='37.4' rx='1.6' filter='url(#s)'/></svg>`;

// 墨点：小小一点（画里那件事所在）
const dot = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'>
<filter id='d' x='-20%' y='-20%' width='140%' height='140%'><feTurbulence type='fractalNoise' baseFrequency='0.35' numOctaves='2' seed='9'/><feDisplacementMap in='SourceGraphic' scale='2.2'/></filter>
<circle cx='10' cy='10' r='6.2' filter='url(#d)'/></svg>`;

const css = `/*
 * 水墨的几样「料」——由 tools/ink.mjs 生成，别手改（改那个脚本再跑一遍）：
 *   --tex      宣纸的纤维（昼是淡墨的细点与纤维，夜是淡白的）：铺在纸面、板、签的底上，叠在纸色之上
 *   --m-ring   圆相：一笔绕成的墨环（圆键：入、册、毕、收、疾、摇杆）
 *   --m-ink    墨块：一笔横刷的浓墨，带几道飞白（一屏唯一的主键）
 *   --m-line   笔下的一道线：起笔重、往右渐轻（链接、选中的那一格）
 *   --m-bloom  落墨：按下去的地方晕开的一滴墨
 *   --m-seal   印边：一方印不齐的边
 *   --m-dot    墨点：画里那件事所在的一点
 * 除了 --tex，都是遮罩：形状由它给，颜色由各处的 background-color 给（昼是墨、夜是月白或金），一份形状昼夜通用。
 */
:root {
  --tex: ${enc(paper('0.1'))};
  /* 昼夜都是白纸的地方（写字的那张纸）：纸纹总是淡墨的 */
  --tex-day: ${enc(paper('0.1'))};
  --m-ring: ${enc(ring)};
  --m-ink: ${enc(block)};
  --m-line: ${enc(line)};
  --m-bloom: ${enc(bloom)};
  --m-seal: ${enc(seal)};
  --m-dot: ${enc(dot)};
}
:root[data-tone='night'] { --tex: ${enc(paper('0.93'))}; }

/* 落墨：按下去的那一点晕开一滴墨，很快淡去（界面上每一枚可按的、点在地上走过去，都是这一下） */
.ink-bloom { position: fixed; left: 0; top: 0; width: 78px; height: 78px; margin: -39px 0 0 -39px; pointer-events: none; z-index: 60; background: var(--ink); -webkit-mask: var(--m-bloom) center / contain no-repeat; mask: var(--m-bloom) center / contain no-repeat; opacity: 0; animation: ink-bloom 0.8s var(--out) forwards; }
.ink-bloom.is-light { background: var(--main-ink); }
.ink-bloom.is-small { width: 54px; height: 54px; margin: -27px 0 0 -27px; }
@keyframes ink-bloom { 0% { transform: scale(0.18) rotate(var(--rot, 0deg)); opacity: 0.3; } 60% { opacity: 0.12; } 100% { transform: scale(1) rotate(var(--rot, 0deg)); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ink-bloom { display: none; } }
/* 墨环的呼吸（该按的那一枚：走近了的小签、入、做完了的毕）与它出来的那一下 */
@keyframes ink-breathe { 0%, 100% { transform: rotate(0deg) scale(0.9); opacity: 0.6; } 50% { transform: rotate(18deg) scale(1.06); opacity: 1; } }
@keyframes ink-ring-in { from { transform: scale(0.3) rotate(-60deg); opacity: 0; } }
`;
writeFileSync(OUT, css.replace(/\r?\n/g, '\r\n'));
console.log('wrote', OUT, css.length, 'bytes');
