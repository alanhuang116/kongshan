#!/usr/bin/env node
/**
 * 同游的中转：一个很小的 WebSocket 服务，只做一件事——把同一间屋子里各人的位置、作揖、说的话转给别人。不存任何东西，没有任何密钥。
 *
 *   node server/relay.mjs            （默认只听本机 127.0.0.1:3820；线上由 Caddy 把 wss://…/ws 转进来）
 *
 * 环境变量（都可不给）：
 *   KS_RELAY_PORT=3820  KS_RELAY_HOST=127.0.0.1
 *   KS_RELAY_ROOM=24        一间屋子至多几人
 *   KS_RELAY_MAX=240        总共至多几个连接
 *   KS_RELAY_PER_IP=12      同一个地址至多几个连接
 *   KS_RELAY_ORIGINS=…      另外放行的来源（逗号分开，如 http://10.0.0.10:3817）；两个正式的站与 localhost、127.0.0.1 总是放行
 *   KS_RELAY_LOG=1          多打几行日志（谁连、谁断，不记地址）
 *
 * 地址：GET /health（与 /ws/health）回人数；/ws 是 WebSocket。别的一律 404。
 * 规矩与消息的样子见 core.mjs 与 docs/NET.md。
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { CLOSE, Hub, MAX_BYTES, PROTO } from './core.mjs';

const env = process.env;
const int = (v, d, lo, hi) => { const n = Number.parseInt(v ?? '', 10); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
const PORT = int(env.KS_RELAY_PORT, 3820, 1, 65535);
const HOST = env.KS_RELAY_HOST || '127.0.0.1';
const VERBOSE = env.KS_RELAY_LOG === '1';
const ORIGINS = new Set(['https://alanhuang116.github.io', 'https://kongshan.169-58-39-104.nip.io', ...(env.KS_RELAY_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)]);
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;
const originOk = (o) => typeof o === 'string' && (ORIGINS.has(o) || LOCAL.test(o));

const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(stamp(), ...a);
const hub = new Hub({ roomSize: int(env.KS_RELAY_ROOM, 24, 2, 64), maxConn: int(env.KS_RELAY_MAX, 240, 1, 5000), perIp: int(env.KS_RELAY_PER_IP, 12, 1, 1000), log: VERBOSE ? log : () => {} });
// 连接数的硬上限（还没握手完的也算）：超过这个数，连握手都不做
const HARD = hub.maxConn + 32;
let sockets = 0;

const wss = new WebSocketServer({
  noServer: true, maxPayload: MAX_BYTES, perMessageDeflate: false, clientTracking: false,
  // 浏览器从不主动发 ping；这里把「替对方排着的 pong」压到很少（ws 8.23 起有这个选项）
  maxPendingAutoPongs: 4,
});

/** 经由 Caddy 来的：真实地址在 X-Forwarded-For 的最后一段（只信本机转来的） */
function ipOf(req) {
  const a = req.socket.remoteAddress ?? '';
  const local = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  const xff = req.headers['x-forwarded-for'];
  if (local && typeof xff === 'string' && xff) return xff.split(',').pop().trim().slice(0, 64);
  return a;
}

const server = http.createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (req.method === 'GET' && (path === '/health' || path === '/ws/health')) {
    const s = hub.stats();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, v: PROTO.v, rooms: s.rooms, players: s.players }));
    return;
  }
  res.writeHead(path === '/ws' ? 426 : 404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(path === '/ws' ? 'websocket only' : 'not found');
});
server.headersTimeout = 10000;
server.requestTimeout = 10000;
server.keepAliveTimeout = 5000;
server.on('clientError', (_e, socket) => { try { socket.destroy(); } catch { /* 无妨 */ } });

const refuse = (socket, code, text) => {
  try { socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch { /* 无妨 */ }
  try { socket.destroy(); } catch { /* 无妨 */ }
};

server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => { /* 对方掉线：无妨 */ });
  const path = (req.url ?? '/').split('?')[0];
  if (path !== '/ws' && path !== '/ws/') return refuse(socket, 404, 'Not Found');
  if (!originOk(req.headers.origin)) return refuse(socket, 403, 'Forbidden');
  if (sockets >= HARD) return refuse(socket, 503, 'Service Unavailable');
  const ip = ipOf(req);
  sockets++;
  let counted = true;
  const release = () => { if (counted) { counted = false; sockets--; } };
  socket.once('close', release);
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.on('error', () => { /* 坏帧、太长：ws 自己会断开 */ });
    // 满了、同一个地址连得太多：握手之后马上用自定的码断开（客户端知道该过一阵再来）
    const ok = hub.admit(ip);
    if (ok !== 'ok') { try { ws.close(ok === 'full' ? CLOSE.full : CLOSE.busy, ok); } catch { /* 无妨 */ } return; }
    const c = hub.open({ send: (s) => ws.send(s), close: (code, why) => ws.close(code, why), buffered: () => ws.bufferedAmount }, ip);
    if (VERBOSE) log('open', c.id, hub.stats());
    let alive = true;
    ws.on('pong', () => { alive = true; });
    ws.on('message', (data, isBinary) => {
      try { hub.message(c, data, isBinary); } catch (e) { log('error', e?.stack ?? e); hub.kick(c, CLOSE.bad, 'error'); }
    });
    ws.on('close', () => { hub.close(c); if (VERBOSE) log('close', c.id, hub.stats()); });
    // 心跳：二十秒一 ping，上一回的 pong 没回来就断开（手机切到后台、网断了）
    c.beat = () => { if (!alive) { ws.terminate(); hub.close(c); return; } alive = false; try { ws.ping(); } catch { /* 无妨 */ } };
  });
});

const guard = (name, fn) => () => { try { fn(); } catch (e) { log('error', name, e?.stack ?? e); } };
const tickT = setInterval(guard('tick', () => hub.tick()), 100);
const beatT = setInterval(guard('beat', () => { for (const c of [...hub.clients]) c.beat?.(); }), 20000);
const sweepT = setInterval(guard('sweep', () => hub.sweep()), 3000);
// 十分钟记一行人数（有变化才记）
let lastStats = '';
const statT = setInterval(() => { const s = JSON.stringify(hub.stats()); if (s !== lastStats) { lastStats = s; log('stats', s); } }, 600000);

server.listen(PORT, HOST, () => log(`relay on ${HOST}:${PORT} (v${PROTO.v}, room ${hub.roomSize}, max ${hub.maxConn}, per ip ${hub.perIp})`));

let stopping = false;
function stop(sig) {
  if (stopping) return;
  stopping = true;
  log('stop', sig, JSON.stringify(hub.stats()));
  for (const t of [tickT, beatT, sweepT, statT]) clearInterval(t);
  server.close();
  // 告诉各人「要走了」（1001）：客户端过一会儿自己重连
  for (const c of [...hub.clients]) hub.kick(c, CLOSE.bye, 'restart');
  setTimeout(() => process.exit(0), 600).unref();
}
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
