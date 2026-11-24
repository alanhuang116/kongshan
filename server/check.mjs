#!/usr/bin/env node
/**
 * 看一眼中转通不通：连上、报一个名字、等「进门」那一条，打印屋子与同屋几人，再说一声走了。
 *   node server/check.mjs                                   （本机 ws://127.0.0.1:3820/ws）
 *   node server/check.mjs wss://kongshan.169-58-39-104.nip.io/ws
 * 来源（Origin）冒充正式的站，所以本机、线上都放行。成功退出码 0，不成功 1。
 */
import { WebSocket } from 'ws';

const url = process.argv[2] ?? 'ws://127.0.0.1:3820/ws';
const origin = process.argv[3] ?? 'https://kongshan.169-58-39-104.nip.io';
const t0 = Date.now();
const ws = new WebSocket(url, { origin, handshakeTimeout: 8000 });
let over = false;
const done = (ok, msg) => {
  if (over) return;
  over = true;
  console.log(`${ok ? 'ok' : 'FAIL'} ${msg}（${Date.now() - t0} 毫秒）`);
  if (ws.readyState === WebSocket.OPEN) { try { ws.close(1000, 'check'); } catch { /* 无妨 */ } }
  setTimeout(() => process.exit(ok ? 0 : 1), 200);
};
const timer = setTimeout(() => done(false, '十秒没等到进门'), 10000);
ws.on('open', () => ws.send(JSON.stringify({ t: 'hi', v: 1, n: [0, 13], c: 6 })));
ws.on('message', (data) => {
  let m;
  try { m = JSON.parse(String(data)); } catch { return; }
  if (m.t === 'wel') { clearTimeout(timer); done(true, `${url} 进了 ${m.rm}，我是 ${m.id} 号，同屋另有 ${m.ps.length} 位`); }
  else if (m.t === 'no') { clearTimeout(timer); done(false, `中转说不行：${m.why}`); }
});
ws.on('unexpected-response', (_req, res) => { clearTimeout(timer); done(false, `HTTP ${res.statusCode}（来源不在放行之列、路径不对，或 Caddy 没转过去）`); });
ws.on('error', (e) => { clearTimeout(timer); done(false, String(e?.message ?? e)); });
ws.on('close', (code) => { if (code >= 4000) { clearTimeout(timer); done(false, `被断开：${code}`); } });
