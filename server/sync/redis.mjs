/**
 * 限流与幂等用的计数：Redis 优先，连不上就降级成内存实现。
 *
 * 边界（写进 README，也写在这里免得以后被当成"缓存"用）：
 *   Redis 里**只有**限流/幂等的计数键，没有存档、没有身份、没有凭证。
 *   降级行为三条：
 *     ① Redis 挂了不影响存档——最多是限流改成每个进程各算各的、重启后清零；
 *     ② 降级是**单向**的：任一命令失败就 `degraded = true`，此后 `peek` / `incrWithTtl` / `decr`
 *        全部走内存实现，不再回切 Redis（**同源优先于精度**：三个方法必须落在同一份计数上，
 *        否则预留与退还分家，建行预算会漏算）；
 *     ③ 降级那一刻内存是空 Map，Redis 里既有的计数**不会搬过来**，桶相当于清零一次（有界）。
 *   所以这里任何失败都不许让请求失败，也不许让进程起不来。
 */
import { createClient } from 'redis';

/** 内存实现：够用就行，单进程内的固定窗口计数 */
function createMemoryLimiter() {
  const m = new Map();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of m) if (v.exp <= now) m.delete(k);
  }, 60000);
  if (typeof sweep?.unref === 'function') sweep.unref();
  return {
    kind: 'memory',
    /** 当前活着的键数：给冒烟断言"坏头不建桶"用（不该为它长出一个键） */
    size() {
      return m.size;
    },
    /** 只读当前计数，**不建键、不推进窗口**；没有就是 0 */
    async peek(key) {
      const cur = m.get(key);
      if (!cur || cur.exp <= Date.now()) return 0;
      return cur.n;
    },
    /**
     * 退还一格（预留了但没真的建行）。键不存在或已过期就返回 0：**不建键**——
     * 为一个早就过窗的预留凭空造出一个键，等于把泄漏从"少算一次"换成"多一个键"。
     */
    async decr(key) {
      const cur = m.get(key);
      if (!cur || cur.exp <= Date.now()) return 0;
      cur.n -= 1;
      if (cur.n <= 0) {
        m.delete(key); // 归零即删：不留"计数为 0"的键，免得看起来像有活着的预留
        return 0;
      }
      return cur.n;
    },
    async incrWithTtl(key, ttlMs) {
      const now = Date.now();
      const cur = m.get(key);
      if (!cur || cur.exp <= now) {
        m.set(key, { n: 1, exp: now + ttlMs });
        return 1;
      }
      cur.n += 1;
      return cur.n;
    },
    async close() {
      clearInterval(sweep);
      m.clear();
    },
    /** 只读：是否已降级。内存实现本身就是降级后的形态，永远 false */
    degraded() {
      return false;
    },
  };
}

/**
 * @param {{url?:string, log?:Console}} opts
 * @returns {Promise<{kind:'redis'|'memory', peek:(key:string)=>Promise<number>, decr:(key:string)=>Promise<number>, incrWithTtl:(key:string,ttlMs:number)=>Promise<number>, degraded:()=>boolean, close:()=>Promise<void>}>}
 */
export async function createLimiter({ url, log = console } = {}) {
  const memory = createMemoryLimiter();
  if (!url) {
    log.warn?.('[anlewo-sync] 未配置 REDIS_URL：限流走内存实现（单进程内有效）');
    return memory;
  }

  let client = null;
  try {
    client = createClient({ url, socket: { connectTimeout: 3000, reconnectStrategy: false } });
    client.on('error', (err) => {
      log.warn?.('[anlewo-sync] Redis 错误：' + (err?.message ?? 'unknown'));
    });
    await client.connect();
    await client.ping();
  } catch (err) {
    log.warn?.('[anlewo-sync] Redis 连不上（' + (err?.message ?? 'unknown') + '）：限流降级为内存实现，服务照常');
    try {
      await client?.disconnect?.();
    } catch {
      /* 已经断了 */
    }
    return memory;
  }

  let degraded = false;
  return {
    kind: 'redis',
    /**
     * 只读：单向闩锁。**只由命令失败置位**，连接错误事件（上面的 client.on('error')）不置位——
     * 所以它证明的是"命令失败过"，不是"连接事件发生过"。`reconnectStrategy:false` 下断线后下一个
     * 命令必失败 → 能抓住；"最后一条命令之后才断"那个窗口抓不到，只能靠调用方把断言紧跟最后一条
     * Redis 操作，把窗口压到最小。
     */
    degraded() {
      return degraded;
    },
    /**
     * 只读当前计数，不建键、不推进窗口；没有或已过期都算 0。
     * 降级后跟 incrWithTtl 走同一套内存实现，**两边数字必须同源**，
     * 否则"peek 到的"和"incr 出来的"会分家（建行预算就会漏算）。
     */
    async peek(key) {
      if (degraded) return memory.peek(key);
      try {
        const v = await client.get(key);
        return v === null ? 0 : Number(v) || 0;
      } catch (err) {
        degraded = true;
        log.warn?.('[anlewo-sync] Redis 读取失败（' + (err?.message ?? 'unknown') + '）：改用内存限流');
        return memory.peek(key);
      }
    },
    /**
     * 退还一格。两件事封在这里、不交给调用方（调用方会忘）：
     *
     * ① `DEL` 必须在内部：`DECR` 对**不存在的键**会把它建出来，值 `-1` 且 **`TTL = -1`（永不过期）**
     *    （Redis 3.0 实测）。退还路径正好会撞上——"预留"与"退还"之间跨过了 60 秒窗口
     *    （`registerLink` 被 DB 卡住、进程停顿），`DECR` 就在下一个窗口对着已过期的键操作，
     *    于是每分钟漏一个永不过期的垃圾键（一天 1440 个，一个月就清不掉了）。
     * ② 判据是 `v <= 0` 而不是 `v === 0`：`DECR` 可能一次干到 -1，若留着它，下一次 `INCR`
     *    会把 -1 抬成 0，等于凭空多放一个名额。
     *
     * `DEL` 与 `DECR` 之间不原子：极端并发下可能把刚落下的 `INCR` 一起删掉，导致少算一格、
     * 多放一个建行。这个方向是对的（宁可略宽松，不要误杀真实用户），所以不加 WATCH/事务。
     * 这里返回 0 而不是 `v`：调用方拿到负数没有任何意义。
     */
    async decr(key) {
      if (degraded) return memory.decr(key);
      try {
        const v = await client.decr(key);
        if (v <= 0) {
          await client.del(key);
          return 0;
        }
        return v;
      } catch (err) {
        degraded = true;
        log.warn?.('[anlewo-sync] Redis 退还失败（' + (err?.message ?? 'unknown') + '）：改用内存限流');
        return memory.decr(key);
      }
    },
    async incrWithTtl(key, ttlMs) {
      if (degraded) return memory.incrWithTtl(key, ttlMs);
      try {
        const n = await client.incr(key);
        // 第一次才设过期：固定窗口，避免每来一个请求就把窗口往后推
        if (n === 1) await client.pExpire(key, ttlMs);
        return n;
      } catch (err) {
        degraded = true;
        log.warn?.('[anlewo-sync] Redis 命令失败（' + (err?.message ?? 'unknown') + '）：改用内存限流');
        return memory.incrWithTtl(key, ttlMs);
      }
    },
    async close() {
      try {
        await client.quit();
      } catch {
        try {
          await client.disconnect?.();
        } catch {
          /* 已经断了 */
        }
      }
      await memory.close();
    },
  };
}
