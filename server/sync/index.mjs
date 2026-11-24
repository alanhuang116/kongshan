#!/usr/bin/env node
/**
 * 同步服务的进程本身：读配置 → 建池 → 建限流 → 起 HTTP → 优雅退出。
 *
 * 与同游的 relay 完全无关：不同目录、不同 package.json、不同依赖、不同 systemd unit（C8）。
 * 只听本机（默认 127.0.0.1:3830），由 Caddy 把 /api/anlewo/* 反代进来。
 */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { createPool, ping } from './db.mjs';
import { createLimiter } from './redis.mjs';
import { createApp } from './http.mjs';

/**
 * 起服务（也给 smoke.mjs 用，所以导出）。
 * @returns {Promise<{server:import('node:http').Server, pool:import('pg').Pool, limiter:object, config:object, app:object, close:()=>Promise<void>}>}
 */
export async function startServer({ config = loadConfig(), log = console } = {}) {
  const pool = createPool(config);
  const limiter = await createLimiter({ url: config.redisUrl, log });
  const app = createApp({ config, pool, limiter, log });
  const server = createServer(app.handle);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  log.log?.(`[anlewo-sync] 听 http://${config.host}:${config.port}${'/api/anlewo'}（身份对接：${config.identityEnabled ? '开' : '关'}）`);

  try {
    await ping(pool);
    log.log?.('[anlewo-sync] 数据库连通');
  } catch (err) {
    // 库一时不通不让进程死：health 会老老实实显示 down，客户端那边只是"这次没同步上"
    log.warn?.('[anlewo-sync] 数据库暂不可达（health 会显示 db:"down"）：' + (err?.message ?? 'unknown'));
  }

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await new Promise((resolve) => {
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
      // 还挂着的空闲连接直接断，别让退出等满 keep-alive
      try {
        server.closeIdleConnections?.();
      } catch {
        /* 老版本没有 */
      }
      setTimeout(resolve, 3000).unref?.();
    });
    try {
      await pool.end();
    } catch {
      /* 池已经关了 */
    }
    try {
      await limiter.close();
    } catch {
      /* 已经关了 */
    }
  };

  return { server, pool, limiter, config, app, close };
}

async function main() {
  const started = await startServer();
  let stopping = false;
  const stop = (sig) => {
    if (stopping) return;
    stopping = true;
    console.log(`[anlewo-sync] 收到 ${sig}：停止接收新请求，收尾后退出`);
    void started.close().then(
      () => process.exit(0),
      () => process.exit(0),
    );
    // 兜底：5s 还没退就硬退（不会有半截事务——写档都是单个事务）
    setTimeout(() => process.exit(0), 5000).unref?.();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    // 配置错/端口占用：说清楚是什么，然后退出（不带半套配置硬跑）
    console.error('[anlewo-sync] 起不来：' + (err?.message ?? 'unknown'));
    process.exit(1);
  });
}
