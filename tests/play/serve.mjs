// 把一个目录当成「子目录下的静态站」来托管（模拟 GitHub Pages：站在 /kongshan/ 下）。
// 用法：node serve.mjs <dist 目录> [端口=3899] [子路径=/kongshan/]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const [root, port = '3899', sub = '/kongshan/'] = process.argv.slice(2);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.bin': 'application/octet-stream' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === sub.slice(0, -1)) { res.writeHead(301, { Location: sub }); return res.end(); }
  if (!url.pathname.startsWith(sub)) { res.writeHead(404); return res.end('not found (outside ' + sub + ')'); }
  let p = normalize(join(root, decodeURIComponent(url.pathname.slice(sub.length))));
  try {
    if ((await stat(p)).isDirectory()) p = join(p, 'index.html');
    const buf = await readFile(p);
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(Number(port), () => console.log(`http://localhost:${port}${sub}`));
