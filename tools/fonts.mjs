// 生成 src/app/styles/fonts.css：思源宋体（300、400）、霞鹜文楷、马善政毛笔楷书的 @font-face。
// 原样照抄字体包里按 unicode-range 分好的片（浏览器只下用到的那几片），只留 woff2，font-display 改为 block（字体到之前先留空，免得先闪一下系统字）。
// 字体包升级后重跑：npm run fonts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const sources = ['@fontsource/noto-serif-sc/300.css', '@fontsource/noto-serif-sc/400.css', 'lxgw-wenkai-webfont/lxgwwenkai-regular.css', '@fontsource/ma-shan-zheng/400.css'];
let out = '/* 由 tools/fonts.mjs 生成，勿手改。 */\n', faces = 0;
for (const s of sources) {
  const dir = s.slice(0, s.lastIndexOf('/') + 1);
  let css = readFileSync(root + 'node_modules/' + s, 'utf8');
  css = css.replace(/font-display:\s*swap/g, 'font-display: block');
  css = css.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, '');
  css = css.replace(/url\((['"]?)\.\/([^'")]+)\1\)/g, (_, q, p) => `url(${q}../../../node_modules/${dir}${p}${q})`);
  faces += (css.match(/@font-face/g) ?? []).length;
  out += `\n/* —— ${s} —— */\n${css}\n`;
}
writeFileSync(root + 'src/app/styles/fonts.css', out);
console.log(`src/app/styles/fonts.css：${faces} 个 @font-face，${(out.length / 1024).toFixed(0)} KB`);
