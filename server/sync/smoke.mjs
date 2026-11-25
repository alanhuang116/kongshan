#!/usr/bin/env node
/**
 * 真实集成冒烟：起服务（临时端口，真打测试库）→ 一步步走完契约 → 清掉自己造的每一样东西。
 *
 *   node smoke.mjs            读 server/sync/.env.local 里的 DATABASE_URL（不硬编码连接串）
 *   node smoke.mjs --keep     跑完不清理（排错时看库里留下了什么）
 *
 * 跑之前先看 V2 迁移有没有执行：没有 anlewo_sync_key 这张表会给出明白的报错。
 * 输出里不会出现任何口令。
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { loadConfig } from './config.mjs';
import { sha256Hex } from './auth.mjs';
import { startServer } from './index.mjs';

let failed = 0;
let passed = 0;

const ok = (msg) => {
  passed += 1;
  console.log(`  \u2713 ${msg}`);
};
const no = (msg) => {
  failed += 1;
  console.log(`  \u2717 ${msg}`);
};
const check = (cond, msg, extra) => {
  if (cond) {
    ok(msg);
  } else {
    no(extra ? `${msg} —— ${extra}` : msg);
  }
  return Boolean(cond);
};
const section = (t) => console.log(`\n${t}`);

/**
 * 逐层按键名排序后的字符串：jsonb 不保留对象的键序（Postgres 内部按长度+字典序重排），
 * 所以"整包原样往返"只能按语义比，不能按 JSON.stringify 的字节序比。
 * （前端那边不受影响：它只比自己的 localStorage 文本，从不拿服务端文本跟自己比。）
 */
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
const canon = (v) => JSON.stringify(sortDeep(v));

/**
 * 合成来源地址：`clientIp()` 只在 loopback 时信 `X-Forwarded-For`，冒烟里的请求都从
 * 127.0.0.1 出发，所以给它一个假 IP 就能把"同一个来源"变成"各自一个来源"。
 *
 * 为什么非要有：限流那节会起 7 个实例，**连上真 Redis 时它们的桶是共享的**
 * （内存降级时每个进程各一份 Map，所以以前从没暴露）；不隔离的话 ②③④⑤ 会整片红，
 * 而那不是代码缺陷，是脚手架的前提错了。
 * 把 pid 混进 IP 里：同一分钟内连跑两轮也不会串到上一轮的桶。
 */
const mkIp = (idx) => `10.${(process.pid >> 8) & 255}.${process.pid & 255}.${idx}`;

/**
 * 在**同一个分钟桶**内完成一次测量；如果这一段跑着跑着跨过了 :00，就换一个独占来源地址重测一次
 * ——固定窗口按分钟分键，跨页会换桶，于是"第 N 次必须 429"会变成"全是 401/200"。
 * **那是测量脆性，不是行为**，一次几百毫秒，撞界概率低但迟早发生；它会在别人部署时红一次，
 * 然后所有人开始怀疑代码，比没有测试更糟。
 *
 * 约定：`fn(ip)` 只发请求、**不做 check**（否则重测会把断言也跑第二遍，项数就开始漂移）。
 * 调用方在拿到的那一份结果上 check 一次，并把 `crossed` 挂进文案。
 */
async function measureInWindow(ipA, ipB, fn) {
  const bkt = Math.floor(Date.now() / 60000);
  const first = await fn(ipA);
  if (Math.floor(Date.now() / 60000) === bkt) return { ...first, crossed: false };
  retestCount += 1;
  return { ...(await fn(ipB)), crossed: true }; // 换一个独占地址，那一轮必然落在同一个桶里
}

/**
 * 观测点：跨窗口重测次数 / headroom 等待次数。
 * 这两个数字是"边界被消掉"的唯一凭据——只看代码里有没有这几行，证明不了它起过作用；
 * 而只看"全绿"，又分不清"根本没跨"和"跨了但被重测救回来"。
 */
let retestCount = 0;
let headroomWaits = 0;

/**
 * 在开跑前**主动对齐到窗口开头**：离本分钟结束不足 ms 就等到下一个窗口，最多等 ms。
 *
 * 为什么需要它（而不是只靠 measureInWindow）：重测是"跨了再补救"——先浪费一轮请求，再赌第二次不跨。
 * 第 10 节那几段序列断言（`①②③④` 各几十到几百毫秒，⑤ 要 1–2 秒）只要贴着 :00 起跑就会换桶，
 * 于是"第 N 次必须 429"变成"全是 401/200"。headroom 让它们**根本不贴边起跑**，重测只当保险。
 */
async function ensureWindowHeadroom(ms = 12000) {
  const left = 60000 - (Date.now() % 60000);
  if (left >= ms) return;
  const wait = left + 50;
  console.log(`  · 离分钟边界只剩 ${left}ms，等到下一个窗口再测（+${wait}ms）`);
  headroomWaits += 1;
  await new Promise((r) => setTimeout(r, wait));
}

function loadEnvOrDie() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(`[smoke] 读配置失败：${err?.message ?? 'unknown'}`);
    console.error('[smoke] 照 server/sync/.env.example 写一份 server/sync/.env.local 再跑。');
    process.exit(1);
  }
  return config;
}

async function main() {
  const keep = process.argv.includes('--keep');
  const baseConfig = loadEnvOrDie();
  const keepFlag = keep;

  // 所有起过的实例都登记下来，收尾时一次查"有没有人在运行中静默降级成内存"。
  const allServers = [];
  const boot = async (cfg) => {
    const s = await startServer(cfg);
    allServers.push(s);
    return s;
  };

  // 期望的 redis 模式：SMOKE_REDIS_MODE 显式指定 > 按"是否配了 REDIS_URL"推断。
  // 存在理由：`redis==='up' || redis==='memory'` 会让"以为在验 Redis、其实降级成内存"静默通过。
  const expectRedis = (process.env.SMOKE_REDIS_MODE || (baseConfig.redisUrl ? 'up' : 'memory')).toLowerCase();
  if (expectRedis !== 'up' && expectRedis !== 'memory') {
    console.error(`[smoke] SMOKE_REDIS_MODE 只能是 up 或 memory（拿到 "${process.env.SMOKE_REDIS_MODE}"）。`);
    process.exit(1);
  }
  console.log(
    `[smoke] 期望 redis 模式：${expectRedis}` +
      (process.env.SMOKE_REDIS_MODE ? '（SMOKE_REDIS_MODE 显式指定）' : '（按是否配 REDIS_URL 推断）'),
  );

  // `SMOKE_REDIS_MODE=memory` 必须真的走内存后端：否则 .env.local 里的 REDIS_URL 一旦可达，
  // 同一条命令会随环境给出 99 / 98 / 红 三种答案，而三种都"看起来正常"。
  // 只清显式声明为 memory 的情形；按推断得到 memory 时 redisUrl 本来就是空的，不进这个分支。
  // **必须让 7 个实例同源**：`config` 只给主实例，其余 6 个实例各自从基准配置派生（`{ ...base, … }`）。
  // 只清主实例会得到"主实例内存、其余 6 个连 Redis"的混合态——它照样打 `redis:"memory"`、
  // 照样 99/0 全绿，但它不是内存模式。那正是本轮反复在打的那种"看着正常"。
  // `loadConfig()` 返回的是 **frozen** 对象（就地赋值会抛 TypeError），所以派生一份可改的运行时基准。
  const runtimeBase =
    expectRedis === 'memory' && baseConfig.redisUrl ? { ...baseConfig, redisUrl: '' } : baseConfig;
  if (runtimeBase !== baseConfig) {
    console.log('[smoke] 已按 SMOKE_REDIS_MODE=memory 清空 redisUrl（强制内存后端，7 个实例同源）');
  }

  // 冒烟用一个临时端口，不跟本机已经跑着的那个抢 3830
  const config = { ...runtimeBase, port: 0, host: '127.0.0.1' };
  const started = await boot({ config });
  const port = started.server.address().port;
  const base = `http://127.0.0.1:${port}/api/anlewo`;
  console.log(`[smoke] 服务起在 ${base}`);

  const pool = started.pool;

  // ---- 前置：V2 迁移在不在 ----
  section('前置检查');
  const tables = await pool
    .query(`SELECT to_regclass('public.anlewo_identity_link') AS l, to_regclass('public.anlewo_save') AS s,
                   to_regclass('public.anlewo_ink') AS i, to_regclass('public.anlewo_save_snapshot') AS n,
                   to_regclass('public.anlewo_device') AS d, to_regclass('public.anlewo_sync_key') AS k`)
    .then((r) => r.rows[0])
    .catch((err) => {
      console.error(`[smoke] 连不上库：${err?.message ?? 'unknown'}`);
      return null;
    });
  if (!tables) {
    await started.close();
    process.exit(1);
  }
  const missing = ['l', 's', 'i', 'n', 'd', 'k'].filter((k) => !tables[k]);
  if (missing.length > 0) {
    no(`缺表：${missing.map((k) => ({ l: 'anlewo_identity_link', s: 'anlewo_save', i: 'anlewo_ink', n: 'anlewo_save_snapshot', d: 'anlewo_device', k: 'anlewo_sync_key' })[k]).join(', ')}`);
    console.error('[smoke] 判断：迁移没执行完。先跑 db/V1__anlewo_core.sql，再跑 db/V2__anlewo_sync_key.sql（npm run migrate 也能补 V2）。');
    await started.close();
    process.exit(1);
  }
  ok('六张表都在（V1 + V2 已执行）' + (tables.k ? '，V3 的 1MB 上限见下方断言' : ''));

  const uid = randomUUID();
  const key = randomBytes(32).toString('base64url');
  const wrongKey = randomBytes(32).toString('base64url');
  const deviceId = randomUUID();
  const payload1 = { v: 1, day: 3, visits: 12, world: { farm: { plots: [1, 2, 3] }, bag: { mai: 2 } }, journal: [{ t: 1763950000000, kind: 'test' }], note: '冒烟·甲' };
  const payload2 = { ...payload1, day: 4, note: '冒烟·乙' };
  const payload3 = { ...payload1, day: 9, note: '冒烟·丙（不该写进服务端）' };
  const pieceKey = `smoke-${uid}`;
  const chars = ['一', '', '二', ''];

  // 覆盖前留底那一节用第二把身份，快照行数才好数
  const uid2 = randomUUID();
  const key2 = randomBytes(32).toString('base64url');
  const payloadA = { v: 1, day: 1, note: '冒烟·先写的这一版' };
  const payloadB = { v: 1, day: 2, note: '冒烟·后写覆盖它' };

  /** 之后要按 uid 清掉的每一条身份（含限流那节临时注册出来的） */
  const cleanupUids = [uid, uid2];

  /** 任意 base 上的一次请求（限流那节要打另外起的实例） */
  const req = async (baseUrl, path, { method = 'GET', body, uid: u, cred, ip, ct, headers = {} } = {}) => {
    const h = { ...headers };
    if (ip) h['x-forwarded-for'] = ip;
    if (u) h['x-anlewo-uid'] = u;
    if (cred) h.authorization = `Bearer ${cred}`;
    // ct 可以覆盖：退还用例要故意发一个非 JSON 的 Content-Type 去撞 415
    if (ct) h['content-type'] = ct;
    else if (body !== undefined) h['content-type'] = 'application/json';
    const r = await fetch(baseUrl + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: r.status, json, text, headers: r.headers };
  };
  /**
   * 一个"绑死了 base 和来源 IP"的调用器。
   * 用闭包而不是"每次记得传 ip"：漏传一处就悄悄回落到 127.0.0.1，
   * 那种红只在真 Redis 下随机出现——比确定性红难查得多，所以从结构上让它不可能忘。
   */
  const mkCaller = (baseUrl, ip) => (path, opts = {}) => req(baseUrl, path, { ip, ...opts });
  // 主实例也用自己的来源地址：免得和同一分钟内别的轮次/别的实例共桶
  const api = mkCaller(base, mkIp(1));

  try {
    // ---- 1. health ----
    section('1. GET /health');
    {
      const r = await api('/health');
      check(r.status === 200, `200（实际 ${r.status}）`);
      check(r.json?.ok === true, 'ok:true');
      check(r.json?.db === 'up', `db:"up"（实际 ${JSON.stringify(r.json?.db)}）`);
      check(
        r.json?.redis === expectRedis,
        `redis:"${r.json?.redis}"（期望 "${expectRedis}"；` +
          `REDIS_URL ${baseConfig.redisUrl ? '已配置' : '未配置'}。要按降级验就显式 SMOKE_REDIS_MODE=memory）`,
        JSON.stringify(r.json),
      );
      check(r.json?.identity === 'off', `identity:"off"（实际 ${JSON.stringify(r.json?.identity)}）`);
      check(r.json?.schema?.tables === 'ok', `schema.tables:"ok"（实际 ${JSON.stringify(r.json?.schema?.tables)}）`);
      check(r.json?.schema?.payloadLimit === 'ok', `schema.payloadLimit:"ok"（实际 ${JSON.stringify(r.json?.schema?.payloadLimit)}）`);
      check(!JSON.stringify(r.json).includes('postgres'), 'health 里没有任何连接串');
    }

    // ---- 2. 注册 + 错凭证 ----
    section('2. POST /link：首次注册 / 错 key / 正确 key');
    {
      const r = await api('/link', { method: 'POST', uid, cred: key, body: { deviceId, kind: 'web', label: 'smoke' } });
      check(r.status === 200, `首次注册 200（实际 ${r.status} ${r.text.slice(0, 120)}）`);
      check(r.json?.uid === uid, 'uid 回的是同一个');
      check(r.json?.status === 'anonymous', `status:"anonymous"（实际 ${JSON.stringify(r.json?.status)}）`);
      check(r.json?.boundIdentity === null, 'boundIdentity:null');
    }
    {
      const r = await api('/link', { method: 'POST', uid, cred: wrongKey, body: {} });
      check(r.status === 401 && r.json?.error === 'bad_credential', `换一把 key 再注册 → 401 bad_credential（实际 ${r.status} ${r.text.slice(0, 80)}）`);
    }
    {
      const r = await api('/link', { method: 'POST', uid, cred: key, body: {} });
      check(r.status === 200 && r.json?.uid === uid, `原 key 再来一次 → 200（实际 ${r.status}）`);
    }
    {
      // P2：业务表里只放标识，凭据散列不进 anlewo_identity_link
      const row = await pool.query('SELECT provider, subject, status FROM anlewo_identity_link WHERE local_uid = $1', [uid]);
      const link = row.rows[0] ?? {};
      check(link.provider === 'anon' && link.status === 'anonymous', `provider='anon' / status='anonymous'（实际 ${link.provider}/${link.status}）`);
      check(link.subject === uid, `subject 写的是 uid，不是凭据散列（实际 ${String(link.subject).slice(0, 12)}…）`);
    }
    {
      // P2：老身份再来报到也要刷新设备台账（原来是创建的同一刻才写，之后永不更新）
      await pool.query(`UPDATE anlewo_device SET last_seen_at = now() - interval '1 hour' WHERE device_id = $1`, [deviceId]);
      const r = await api('/link', { method: 'POST', uid, cred: key, body: { deviceId, kind: 'web', label: 'smoke-again' } });
      const row = await pool.query(
        `SELECT last_seen_at > now() - interval '1 minute' AS fresh FROM anlewo_device WHERE device_id = $1`,
        [deviceId],
      );
      check(r.status === 200 && row.rows[0]?.fresh === true, '再次报到会刷新 device.last_seen_at（P2）');
    }

    // ---- 3. 空库时的 GET /save ----
    section('3. GET /save（还没有存档）');
    {
      const r = await api('/save', { uid, cred: key });
      check(r.status === 204, `204（实际 ${r.status}）`);
      check(r.text === '', '无响应体');
    }

    // ---- 4. 首次写入 ----
    section('4. PUT /save baseRevision=0');
    let rev1 = 0;
    {
      const r = await api('/save', { method: 'PUT', uid, cred: key, body: { payload: payload1, baseRevision: 0, clientId: deviceId } });
      check(r.status === 200, `200（实际 ${r.status} ${r.text.slice(0, 120)}）`);
      check(r.json?.revision === 1, `revision=1（实际 ${JSON.stringify(r.json?.revision)}）`);
      rev1 = r.json?.revision ?? 0;
    }
    {
      const r = await api('/save', { uid, cred: key });
      check(r.status === 200, `GET 200（实际 ${r.status}）`);
      check(r.json?.revision === rev1, `revision 还是 ${rev1}`);
      check(canon(r.json?.payload) === canon(payload1), 'payload 逐字段一致（整包原样往返，键序不论）', r.text.slice(0, 200));
      check(typeof r.json?.updatedAt === 'string' && !Number.isNaN(Date.parse(r.json.updatedAt)), `updatedAt 是时间串（${r.json?.updatedAt}）`);
    }

    // ---- 5. 第二次写入（带 snapshotBefore：覆盖前留底，裁决 P0-1）----
    section('5. PUT /save baseRevision=1 带 snapshotBefore（覆盖前留底）');
    {
      const r = await api('/save', {
        method: 'PUT',
        uid,
        cred: key,
        body: { payload: payload2, baseRevision: 1, snapshotBefore: true },
      });
      check(r.status === 200 && r.json?.revision === 2, `revision=2（实际 ${r.status} ${JSON.stringify(r.json?.revision)}）`);
    }
    {
      const snap = await pool.query(
        `SELECT revision, payload FROM anlewo_save_snapshot WHERE user_id = $1 AND reason = 'sync' ORDER BY snapshot_id`,
        [uid],
      );
      check(snap.rows.length === 1, `被覆盖的那一版进了快照，恰好 1 行（实际 ${snap.rows.length}）`);
      check(
        snap.rows.length === 1 && Number(snap.rows[0].revision) === 1 && canon(snap.rows[0].payload) === canon(payload1),
        '快照存的是被覆盖前那一版（revision=1 的 payload1）',
      );
    }

    // ---- 6. 旧版本再写 → 409，且不新增快照（这一路没有写入，没信息量）----
    section('6. PUT /save 用旧 baseRevision=1（故意冲突）');
    {
      const r = await api('/save', { method: 'PUT', uid, cred: key, body: { payload: payload3, baseRevision: 1 } });
      check(r.status === 409, `409（实际 ${r.status}）`);
      check(r.json?.error === 'conflict', `error:"conflict"（实际 ${JSON.stringify(r.json?.error)}）`);
      check(r.json?.revision === 2, `带回服务端 revision=2（实际 ${JSON.stringify(r.json?.revision)}）`);
      check(canon(r.json?.payload) === canon(payload2), '带回服务端那一份 payload（客户端据此也只记日志、不覆盖本地）');
    }
    {
      const snap = await pool.query(
        `SELECT revision, payload FROM anlewo_save_snapshot WHERE user_id = $1 AND reason = 'sync' ORDER BY snapshot_id`,
        [uid],
      );
      check(snap.rows.length === 1, `409 没有新增快照，仍是那 1 行（实际 ${snap.rows.length}）`);
      check(
        snap.rows.length === 1 && Number(snap.rows[0].revision) === 1,
        '快照仍是 revision=1（不是拿冲突那一版又存了一遍）',
      );
    }
    {
      const cur = await api('/save', { uid, cred: key });
      check(canon(cur.json?.payload) === canon(payload2), '服务端版本没被旧版本覆盖');
    }
    {
      // 常规推送（不带 snapshotBefore）不该写快照
      const before = await pool.query(`SELECT count(*)::int AS n FROM anlewo_save_snapshot WHERE user_id = $1`, [uid]);
      const r = await api('/save', { method: 'PUT', uid, cred: key, body: { payload: { ...payload2, day: 5 }, baseRevision: 2 } });
      const after = await pool.query(`SELECT count(*)::int AS n FROM anlewo_save_snapshot WHERE user_id = $1`, [uid]);
      check(r.status === 200 && r.json?.revision === 3, `常规推送仍是 200 revision=3（实际 ${r.status} ${JSON.stringify(r.json?.revision)}）`);
      check(after.rows[0].n === before.rows[0].n, `常规推送不写快照（${before.rows[0].n} → ${after.rows[0].n}）`);
    }

    // ---- 7. 笔迹 ----
    section('7. POST /ink + GET /ink');
    let pieceHash = '';
    {
      const r = await api('/ink', { method: 'POST', uid, cred: key, body: { pieceKey, chars } });
      check(r.status === 200, `200（实际 ${r.status} ${r.text.slice(0, 120)}）`);
      pieceHash = r.json?.pieceHash ?? '';
      check(/^[0-9a-f]{64}$/.test(pieceHash), 'pieceHash 是 sha256 十六进制');
      check(typeof r.json?.updatedAt === 'string', 'updatedAt 有回');
    }
    {
      const r = await api('/ink', { method: 'POST', uid, cred: key, body: { pieceKey, chars: ['三', '四', '五', '六'], charTotal: 4 } });
      check(r.status === 200, `同一篇再写一次 200（upsert，实际 ${r.status}）`);
      check(r.json?.pieceHash === pieceHash, 'pieceHash 不变（key 相同）');
    }
    {
      const r = await api('/ink?limit=20', { uid, cred: key });
      check(r.status === 200, `列表 200（实际 ${r.status}）`);
      const items = Array.isArray(r.json?.items) ? r.json.items : [];
      check(items.length === 1, `一篇（实际 ${items.length}）`);
      check(items[0]?.pieceHash === pieceHash, '列表里有刚写的那篇');
      check(items[0]?.charTotal === 4, `charTotal=4（实际 ${JSON.stringify(items[0]?.charTotal)}）`);
      check(items[0] && !('chars' in items[0]), '列表不返回 chars（避免大包）');
    }

    // ---- 8. 覆盖前留底（P0-1 的回归）：snapshotBefore 必须和 CAS 在同一个事务里 ----
    section('8. PUT /save 带 snapshotBefore（覆盖别人的版本，覆盖前留底）');
    {
      const reg = await api('/link', { method: 'POST', uid: uid2, cred: key2, body: {} });
      check(reg.status === 200, `第二把身份注册（实际 ${reg.status}）`);
      const first = await api('/save', { method: 'PUT', uid: uid2, cred: key2, body: { payload: payloadA, baseRevision: 0 } });
      check(first.status === 200 && first.json?.revision === 1, `首发 revision=1（实际 ${first.status} ${JSON.stringify(first.json?.revision)}）`);
    }
    {
      const r = await api('/save', {
        method: 'PUT',
        uid: uid2,
        cred: key2,
        body: { payload: payloadB, baseRevision: 1, snapshotBefore: true },
      });
      check(r.status === 200 && r.json?.revision === 2, `覆盖成功 revision=2（实际 ${r.status} ${JSON.stringify(r.json?.revision)}）`);
      // 响应体形状不能变：客户端只认 revision 是 number
      check(Object.keys(r.json ?? {}).join(',') === 'revision', `响应体仍是 {revision}（实际 ${r.text.slice(0, 60)}）`);
    }
    {
      const snap = await pool.query(
        `SELECT revision, payload FROM anlewo_save_snapshot WHERE user_id = $1 AND reason = 'sync' ORDER BY snapshot_id`,
        [uid2],
      );
      check(snap.rows.length === 1, `被覆盖的那一版进了快照，恰好 1 行（实际 ${snap.rows.length}）`);
      check(
        snap.rows.length === 1 && Number(snap.rows[0].revision) === 1 && canon(snap.rows[0].payload) === canon(payloadA),
        '快照存的是被覆盖前的服务端版本（revision=1 的内容）',
      );
    }
    {
      const cur = await api('/save', { uid: uid2, cred: key2 });
      check(canon(cur.json?.payload) === canon(payloadB) && cur.json?.revision === 2, '新版本已生效（revision=2）');
    }
    {
      // V3：300KB 的存档要真的能进去。V1 的 256KB 上限会让这类档永远推不上去，
      // 而前端只在 console.debug 里留一行——所以这条必须由服务端实测兜住。
      const big = { v: 1, note: '冒烟·大档', pad: 'x'.repeat(300 * 1024) };
      const r = await api('/save', { method: 'PUT', uid: uid2, cred: key2, body: { payload: big, baseRevision: 2 } });
      check(r.status === 200 && r.json?.revision === 3, `300KB 存档写入 200（V3 上限生效，实际 ${r.status} ${r.text.slice(0, 80)}）`);
      const back = await api('/save', { uid: uid2, cred: key2 });
      check(back.json?.revision === 3, `取回 revision=3（实际 ${JSON.stringify(back.json?.revision)}）`);
      check(typeof back.json?.payload?.pad === 'string' && back.json.payload.pad.length === 300 * 1024, '大档内容完整往返');
    }

    // ---- 9. 身份对接关闭时的行为 ----
    section('9. 身份对接关闭（IDENTITY_ENABLED=0）');
    {
      const r = await api('/identity/bind', { method: 'POST', uid, cred: key, body: { accessToken: 'a.b.c' } });
      check(r.status === 501 && r.json?.error === 'identity_disabled', `501 identity_disabled（实际 ${r.status} ${r.text.slice(0, 80)}）`);
    }
    {
      const r = await api('/save', { uid, cred: 'not-the-key-at-all-xxxxxx' });
      check(r.status === 401 && r.json?.error === 'bad_credential', `错凭证读档 → 401（实际 ${r.status}）`);
    }
    {
      const r = await api('/save', { cred: key });
      check(r.status === 400 && r.json?.error === 'bad_uid', `不给 uid → 400 bad_uid（实际 ${r.status} ${r.text.slice(0, 80)}）`);
    }
    {
      // 8KB 的 uid 头：必须在建立限流桶之前就被挡掉（P0-3 的内存放大面）
      // size() 只有内存后端才有：先拿函数引用，**快照留到正对照之后取**（正对照自己会建一个键）
      const sizeFn = typeof started.limiter.size === 'function' ? started.limiter.size.bind(started.limiter) : null;
      // 来源地址只有这一处定义：请求和键名都从这里取。写死两遍的话，以后谁改了 api 的默认地址，
      // 键就会算错、peek 恒为 0、断言永远绿——那种"看起来硬、其实空转"正是本轮反复栽的坑。
      const badIp = mkIp(1); // 与 `api = mkCaller(base, mkIp(1))` 保持同源
      // 与服务端 `sha256Hex(`${rawUid.toLowerCase()}|${clientIp}`)` 逐字对齐（http.mjs:475）
      const uidKeyAt = (u, b) => `anlewo:rl:u:${b}:${sha256Hex(`${u.toLowerCase()}|${badIp}`).slice(0, 16)}`;

      // ---- 正对照：先证明"这套键公式就是 http.mjs 用的那套" ----
      // 没有这一步，下面的 `leaked === 0` 有可能是"键写错了"而不是"没建桶"：两者都恒为 0，从绿里分不出来。
      // 故意用**大写** uid：uuid 本身大小写等价，服务端会 toLowerCase 再入键——
      // 如果键名漏了那一步，这个对照就会失败，正好把"大小写不一致"这种隐形空转也一起拦住。
      const probeUid = randomUUID().toUpperCase();
      const pBkt0 = Math.floor(Date.now() / 60000);
      await api('/save', { uid: probeUid, cred: key }); // 401（没身份行），但 uid 桶一定被建
      const pBkt1 = Math.floor(Date.now() / 60000);
      const probeSeen = Math.max(
        await started.limiter.peek(uidKeyAt(probeUid, pBkt0)),
        await started.limiter.peek(uidKeyAt(probeUid, pBkt1)),
      );
      check(probeSeen >= 1, `正对照：键公式与 http.mjs 一致（大写 uid 的桶计数 = ${probeSeen}，应 ≥1）`);

      // 键数快照必须取在这里：上面那次正对照自己会建一个 uid 桶键
      const size = sizeFn ? sizeFn() : null;

      // ---- 负断言：坏头不许建桶 ----
      const badUid = 'a'.repeat(8192);
      // 取"请求前/后两个分钟桶"的最大值：这条请求正好跨过 :00 时，坏 uid 会落在新桶里，
      // 只查请求前算出的那个键就会读到 0 —— 那同样是一种"闸门没了也绿"的空转形态。
      const bktBefore = Math.floor(Date.now() / 60000);
      const r = await api('/save', { uid: badUid, cred: key });
      const bktAfter = Math.floor(Date.now() / 60000);
      check(r.status === 400 && r.json?.error === 'bad_uid', `8KB 的 uid 头 → 400 bad_uid（实际 ${r.status}）`);
      const leaked = Math.max(
        await started.limiter.peek(uidKeyAt(badUid, bktBefore)),
        await started.limiter.peek(uidKeyAt(badUid, bktAfter)),
      );
      check(leaked === 0, `坏头没有建出 uid 桶（两种后端都成立，实际 peek=${leaked}）`);
      if (size !== null) {
        check(started.limiter.size() === size, `坏头没有建出限流键（键数 ${size} → ${started.limiter.size()}）`);
      } else {
        console.log('  · 限流后端是 Redis：跳过 size() 键数断言（上面那条 peek 断言已覆盖同一不变量）');
      }
    }
    {
      // 非 uuid 的 uid 头同样是坏头（不必等到鉴权）
      const r = await api('/save', { uid: 'not-a-uuid', cred: key });
      check(r.status === 400 && r.json?.error === 'bad_uid', `非 uuid 的 uid 头 → 400 bad_uid（实际 ${r.status}）`);
    }

    // ---- 9b. 凭证行丢失后的受控重建（P1-1）----
    section('9b. anlewo_sync_key 行丢了：10 分钟内拒绝，够老且无存档才重建');
    {
      const uid3 = randomUUID();
      const key3 = randomBytes(32).toString('base64url');
      cleanupUids.push(uid3);
      const reg = await api('/link', { method: 'POST', uid: uid3, cred: key3, body: {} });
      check(reg.status === 200, `先注册一把（实际 ${reg.status}）`);

      await pool.query('DELETE FROM anlewo_sync_key WHERE local_uid = $1', [uid3]);
      const tooNew = await api('/link', { method: 'POST', uid: uid3, cred: key3, body: {} });
      check(tooNew.status === 401 && tooNew.json?.error === 'bad_credential', `凭证行刚丢（身份还很新）→ 401 拒绝重建（实际 ${tooNew.status}）`);

      await pool.query(`UPDATE anlewo_identity_link SET created_at = now() - interval '11 minutes' WHERE local_uid = $1`, [uid3]);
      const rebuilt = await api('/link', { method: 'POST', uid: uid3, cred: key3, body: {} });
      check(rebuilt.status === 200 && rebuilt.json?.uid === uid3, `身份够老且无存档 → 重建成功 200（实际 ${rebuilt.status} ${rebuilt.text.slice(0, 80)}）`);
      const rows = await pool.query('SELECT count(*)::int AS n FROM anlewo_sync_key WHERE local_uid = $1', [uid3]);
      check(rows.rows[0].n === 1, `库里重新有且只有 1 把凭证（实际 ${rows.rows[0].n}）`);
    }
    {
      // 有存档就不许重建（否则等于"捡到 uid 就能插一把新钥匙接管档案"）
      const uid4 = randomUUID();
      const key4 = randomBytes(32).toString('base64url');
      cleanupUids.push(uid4);
      await api('/link', { method: 'POST', uid: uid4, cred: key4, body: {} });
      await api('/save', { method: 'PUT', uid: uid4, cred: key4, body: { payload: payload1, baseRevision: 0 } });
      await pool.query('DELETE FROM anlewo_sync_key WHERE local_uid = $1', [uid4]);
      await pool.query(`UPDATE anlewo_identity_link SET created_at = now() - interval '11 minutes' WHERE local_uid = $1`, [uid4]);
      const r = await api('/link', { method: 'POST', uid: uid4, cred: key4, body: {} });
      check(r.status === 401 && r.json?.error === 'bad_credential', `已有存档 → 仍然拒绝重建 401（实际 ${r.status}）`);
    }

    // ---- 10. 限流：每个实例一个合成来源地址（真 Redis 下限流桶是全局共享的，见 mkIp） ----
    section('10. 限流：uid 一维 / ip 一维 / 换 uid 也挡');
    // 开跑前先离开分钟边界：第 10 节整段约 9 秒（①②③④ 各几十到几百毫秒，⑤ 的 26 连击 1–2 秒），
    // 留 12 秒余量才能保证整段落在同一个桶里；5 秒不够，跨在段中间反而会让"零重测"这条判据变脆。
    await ensureWindowHeadroom(12000);
    {
      // ① uid 一维：同一 uid 连打，第 ratePerMin+1 次才 429
      const tightUid = await boot({
        config: { ...runtimeBase, port: 0, host: '127.0.0.1', ratePerMin: 2, rateIpPerMin: 1000, linkPerMin: 1000 },
      });
      const b1 = `http://127.0.0.1:${tightUid.server.address().port}/api/anlewo`;
      try {
        const probeUid = randomUUID();
        const r = await measureInWindow(mkIp(11), mkIp(111), async (ip) => {
          const at = mkCaller(b1, ip);
          const codes = [];
          for (let i = 0; i < 4; i += 1) codes.push((await at('/save', { uid: probeUid, cred: key })).status);
          return { codes };
        });
        check(
          r.codes.join(',') === '401,401,429,429',
          `同一 uid：前 2 次算、第 3 次起 429（实际 ${r.codes.join(',')}）${r.crossed ? '（已跨分钟重测）' : ''}`,
        );
      } finally {
        await tightUid.close();
      }
    }
    {
      // ② ip 一维 + 轮换 uid：换 uid 也换不掉桶（这是 P0-3 的回归点）
      const tightIp = await boot({
        config: { ...runtimeBase, port: 0, host: '127.0.0.1', ratePerMin: 1000, rateIpPerMin: 5, linkPerMin: 1000 },
      });
      const b2 = `http://127.0.0.1:${tightIp.server.address().port}/api/anlewo`;
      try {
        const r = await measureInWindow(mkIp(12), mkIp(121), async (ip) => {
          const at = mkCaller(b2, ip);
          const codes = [];
          for (let i = 0; i < 7; i += 1) codes.push((await at('/save', { uid: randomUUID(), cred: key })).status);
          return { codes };
        });
        const tail = r.crossed ? '（已跨分钟重测）' : '';
        check(r.codes.slice(0, 5).every((c) => c === 401), `前 5 次都放行（实际 ${r.codes.slice(0, 5).join(',')}）${tail}`);
        check(r.codes.slice(5).every((c) => c === 429), `第 6 次起 429：换个 uid 也不给新桶（实际 ${r.codes.slice(5).join(',')}）${tail}`);
      } finally {
        await tightIp.close();
      }
    }
    {
      // ③ 建行桶：只数**真的建出来的行**（裁决）。旧实现数的是请求数，而 `/link` 是每次开页面
      //    都打的第一步，于是 25 个零写入的 401 就能把整个出口饿死一分钟。这里钉四条：
      //    (a) 坏凭证不吃预算 (b) 之后仍能建满 (c) 被拒的零写入 (d) 桶满时"还是我"照样放行
      const tightLink = await boot({
        config: { ...runtimeBase, port: 0, host: '127.0.0.1', ratePerMin: 1000, rateIpPerMin: 1000, linkPerMin: 2 },
      });
      const b3 = `http://127.0.0.1:${tightLink.server.address().port}/api/anlewo`;
      try {
        // 这一段整体依赖建行桶（分钟键）：跨页就换一个独占地址重测，check 只做一次
        const meas = async (ip) => {
          const at = mkCaller(b3, ip);
          const bad = [];
          for (let i = 0; i < 10; i += 1) {
            bad.push((await at('/link', { method: 'POST', uid, cred: wrongKey, body: {} })).status);
          }
          const codes = [];
          const fresh = [];
          for (let i = 0; i < 3; i += 1) {
            const u = randomUUID();
            fresh.push(u);
            const r2 = await at('/link', { method: 'POST', uid: u, cred: key, body: {} });
            codes.push(r2.status);
            if (r2.status === 200) cleanupUids.push(u); // 建出来行的才要清（两次尝试的都清）
          }
          return { bad, codes, fresh, ip };
        };
        const m3 = await measureInWindow(mkIp(13), mkIp(131), meas);
        const tail3 = m3.crossed ? '（已跨分钟重测）' : '';
        check(m3.bad.every((c) => c === 401), `坏凭证 10 次全 401、且不吃建行预算（实际 ${[...new Set(m3.bad)].join(',')}）${tail3}`);
        check(m3.codes.join(',') === '200,200,429', `坏凭证之后仍能建满预算、第 3 个 429（实际 ${m3.codes.join(',')}）${tail3}`);

        // 守卫在 registerLink 之前 → 被拒的那次一行都没写（否则库里会留一条孤儿身份）
        const orphan = await pool.query(
          'SELECT count(*)::int AS n FROM anlewo_identity_link WHERE local_uid = $1',
          [m3.fresh[2]],
        );
        check(orphan.rows[0].n === 0, `被拒的注册没在库里留孤儿身份（实际 ${orphan.rows[0].n} 行）`);

        // 桶已满(2/2)，但"还是我"不占预算 → 必须仍然 200（用刚测过的那只地址，桶确实是满的）
        const again = await req(b3, '/link', { method: 'POST', uid: m3.fresh[0], cred: key, ip: m3.ip, body: {} });
        check(again.status === 200, `桶满时"还是我"的报到不受影响（实际 ${again.status}）`);

        // (e) **退还的确定性钉子**：坏 Content-Type → `readJson` 抛 415，位置正好在"预留之后、建行之前"。
        //     退还若写成空操作，计数会停在 1；只挂在 registerLink 旁边的写法也会在这里漏（这正是
        //     主理人把结算改成 try/finally 的原因：25 次 text/plain 就能烧光一分钟预算、一行都没建）。
        //     单线程、每次必走退还分支，无竞态。
        const runRefund = async (ip) => {
          const bkt = Math.floor(Date.now() / 60000);
          const at2 = mkCaller(b3, ip);
          const k = `anlewo:rl:linkc:${bkt}:${sha256Hex(ip).slice(0, 16)}`;
          const u = randomUUID();
          cleanupUids.push(u);
          const before = await tightLink.limiter.peek(k);
          const r = await at2('/link', { method: 'POST', uid: u, cred: key, body: {}, ct: 'text/plain' });
          const after = await tightLink.limiter.peek(k);
          return { before, status: r.status, after, u, crossed: Math.floor(Date.now() / 60000) !== bkt };
        };
        let rf = await runRefund(mkIp(42));
        if (rf.crossed) {
          retestCount += 1;
          rf = await runRefund(mkIp(44));
        }
        check(rf.before === 0, `前置：退还用例的桶是空的（实际 ${rf.before}）`);
        check(rf.status === 415, `坏 content-type → 415（实际 ${rf.status}）`);
        check(rf.after === 0, `预留被退还 → 计数回到 0（实际 ${rf.after}；1 说明退还成了空操作）`);
        const noRow = await pool.query(
          'SELECT count(*)::int AS n FROM anlewo_identity_link WHERE local_uid = $1',
          [rf.u],
        );
        check(noRow.rows[0].n === 0, `且一行都没建（实际 ${noRow.rows[0].n} 行）`);

        // (f) 次要：同一个新 uid 两个并发 → 不能建出两行。**这条不能当退还的唯一钉子**：
        //     若第二个请求的 findLink 落在第一个 commit 之后，它直接看到 existing、一次都不预留，
        //     退还代码根本没执行，计数照样是 1（会空过）。所以退还由 (e) 钉，(f) 只管"不出两行"。
        const soloUid = randomUUID();
        cleanupUids.push(soloUid);
        const at3 = mkCaller(b3, mkIp(43));
        const pair = await Promise.all([
          at3('/link', { method: 'POST', uid: soloUid, cred: key, body: {} }),
          at3('/link', { method: 'POST', uid: soloUid, cred: key, body: {} }),
        ]);
        check(pair.every((r) => r.status === 200), `同 uid 两个并发都 200（实际 ${pair.map((r) => r.status).join(',')}）`);
        const soloRows = await pool.query(
          'SELECT count(*)::int AS n FROM anlewo_identity_link WHERE local_uid = $1',
          [soloUid],
        );
        check(soloRows.rows[0].n === 1, `同 uid 并发只建出 1 行（实际 ${soloRows.rows[0].n}）`);

        // (g) 退还一个"早就不存在"的键（慢请求跨过窗口后才归还）：不能造出无过期的 `-1` 键。
        //     Redis 的 `DECR` 对不存在的键会造出"值 -1、TTL -1"，所以实现里 `v <= 0` 就 `DEL`；
        //     这条在两种后端上都成立（内存版直接返回 0、不建键），并且**能红**：
        //     少了那道 DEL，peek 会读到 -1。
        const ghostKey = `anlewo:rl:linkc:${Math.floor(Date.now() / 60000)}:${sha256Hex('ghost-key').slice(0, 16)}`;
        await tightLink.limiter.decr(ghostKey);
        const ghostLeft = await tightLink.limiter.peek(ghostKey);
        check(ghostLeft === 0, `decr 不存在的键：不建键、不留 -1（实际 ${ghostLeft}）`);

        // (h) 并发不能绕过上限。**放在 ③ 最后、独占一个合成 IP**：
        //     它会把这只 IP 的桶打死，跑在中间会把后面的断言连坐成 429。
        //     `INCR` 是原子的，所以"恰好 2 行"是确定性结果；跑出 3 或 40 说明预留没生效，别调断言。
        //     混入 10 个**已注册** uid：他们走 existing 分支、一次都不碰桶，顺带验了并发下既有用户不受影响。
        const reg10 = [];
        for (let i = 0; i < 10; i += 1) {
          const u = randomUUID();
          const r = await api('/link', { method: 'POST', uid: u, cred: key, body: {} });
          if (r.status === 200) {
            reg10.push(u);
            cleanupUids.push(u);
          }
        }
        check(reg10.length === 10, `并发用例先把 10 个 uid 注册好（实际 ${reg10.length}）`);

        const burst = async (ip) => {
          const bkt = Math.floor(Date.now() / 60000);
          const freshUids = Array.from({ length: 40 }, () => randomUUID());
          const rs = await Promise.all(
            [...reg10, ...freshUids].map((u) =>
              req(b3, '/link', { method: 'POST', uid: u, cred: key, ip, body: {} }),
            ),
          );
          cleanupUids.push(...freshUids); // 建出来的要清；没建出来的删也无害
          const tail = rs.slice(reg10.length); // 40 个新 uid 的结果
          return {
            freshUids,
            built: tail.filter((r) => r.status === 200).length,
            rejected: tail.filter((r) => r.status === 429).length,
            existingBad: rs.slice(0, reg10.length).filter((r) => r.status !== 200).length,
            used: await tightLink.limiter.peek(`anlewo:rl:linkc:${bkt}:${sha256Hex(ip).slice(0, 16)}`),
            crossed: Math.floor(Date.now() / 60000) !== bkt,
          };
        };
        let br = await burst(mkIp(41));
        // 只有"跨分钟"才重测（那是测量脆性）。`built !== 2` 是**结果错**，绝不能重测：
        // 否则哪天原子预留退化成 peek 语义，第一次建出 40 行会触发重测，而这一分钟的桶已经被打满，
        // 第二次只会建出 2 行 —— 这条断言就对自己唯一要抓的 bug 做了一次自动重试，然后放它过去。
        if (br.crossed) {
          retestCount += 1;
          br = await burst(mkIp(45));
        }
        check(br.built === 2, `50 并发里 40 个新 uid 只建出 2 行（实际 ${br.built}）`);
        check(br.rejected === 38, `其余 38 个新 uid 全 429（实际 ${br.rejected}）`);
        check(br.existingBad === 0, `并发的 10 个已注册报到全 200（实际异常 ${br.existingBad}）`);
        const burstRows = await pool.query(
          'SELECT count(*)::int AS n FROM anlewo_identity_link WHERE local_uid = ANY($1::uuid[])',
          [br.freshUids],
        );
        check(burstRows.rows[0].n === 2, `库里恰好 2 行（实际 ${burstRows.rows[0].n}）`);
        // 确定性值：只有那 40 个新 uid 各 INCR 一次 → 40；2 个建行保留、38 个 429 **不退还**（裁决：累积惩罚）。
        // 钉确切值而不是区间：将来谁在 429 分支手滑加一个 decr，这条立刻红。
        check(br.used === 40, `429 不退还 → 计数恰好 40（实际 ${br.used}）`);
      } finally {
        await tightLink.close();
      }
    }

    {
      // ④ /health 也占 IP 桶（探活/压测不该把 max:5 的连接池吃干），且库不可用时仍回 200
      const tightHealth = await boot({
        config: { ...runtimeBase, port: 0, host: '127.0.0.1', ratePerMin: 1000, rateIpPerMin: 3, linkPerMin: 1000 },
      });
      const b4 = `http://127.0.0.1:${tightHealth.server.address().port}/api/anlewo`;
      try {
        const r = await measureInWindow(mkIp(14), mkIp(141), async (ip) => {
          const at = mkCaller(b4, ip);
          const codes = [];
          for (let i = 0; i < 5; i += 1) codes.push((await at('/health')).status);
          return { codes };
        });
        check(
          r.codes.join(',') === '200,200,200,429,429',
          `/health 也受 IP 桶约束（实际 ${r.codes.join(',')}）${r.crossed ? '（已跨分钟重测）' : ''}`,
        );
      } finally {
        await tightHealth.close();
      }
    }
    {
      // ⑤ 建行桶的默认限额：必须在**自己独占的来源地址**上测——桶是全局的，
      //    和 ①~④⑥ 共用一个 IP 会提前 429（本机内存模式下每个进程各一份 Map，
      //    所以这条以前"碰巧"是绿的；连上真 Redis 就会红）。这里起一个只覆盖端口/地址的实例，
      //    其余全用默认值，于是 `linkPerMin` 就是真实默认（25）。
      // 注意这里每次都是**新 uid**，所以每一次都是真建行、每次都占预算——这正是要限的东西。
      const defaultLink = await boot({ config: { ...runtimeBase, port: 0, host: '127.0.0.1' } });
      const b5 = `http://127.0.0.1:${defaultLink.server.address().port}/api/anlewo`;
      const limit = defaultLink.config.linkPerMin;
      /**
       * 固定窗口是按分钟桶分的，26 次请求虽然只要几百毫秒，但正好跨过 :00 就会换桶、
       * 于是"第 26 个 429"变成"全 200"（实测撞到过一次）。这不是代码缺陷，是测量方式脆。
       * 所以记下跨越与否，跨了就对**另一个来源地址**重测一次——那一轮必然落在同一个桶里。
       */
      const runOnce = async (ip) => {
        const at = mkCaller(b5, ip);
        const bucket0 = Math.floor(Date.now() / 60000);
        const codes = [];
        const made = [];
        for (let i = 0; i <= limit; i += 1) {
          const u = randomUUID();
          const r = await at('/link', { method: 'POST', uid: u, cred: key, body: {} });
          codes.push(r.status);
          if (r.status === 200) made.push(u); // 建出来行的才要清
        }
        return { codes, made, crossed: Math.floor(Date.now() / 60000) !== bucket0 };
      };
      try {
        let res = await runOnce(mkIp(6));
        cleanupUids.push(...res.made);
        const retried = res.crossed;
        if (retried) {
          // 跨了桶就换一个来源地址重测：这一轮必然落在同一个桶里
          retestCount += 1;
          console.log('  · ⑤ 首轮跨了分钟桶（26 次里正好越过 :00），换来源地址重测一次');
          res = await runOnce(mkIp(61));
          cleanupUids.push(...res.made);
        }
        const codes = res.codes;
        check(limit === 25, `默认 LINK_PER_MIN=25（实际 ${limit}）`);
        check(codes.slice(0, limit).every((c) => c === 200), `前 ${limit} 个真建行放行`);
        check(codes[limit] === 429, `第 ${limit + 1} 个建行起 429（实际 ${codes.slice(-2).join(',')}${retried ? '，已跨分钟重测' : ''}）`);
      } finally {
        await defaultLink.close();
      }
    }

    {
      // ⑥ 库不可用时：health 仍是 200（进程活着），但 ok:false / db:"down"；3 秒内第二次走缓存
      const badDb = await boot({
        config: { ...runtimeBase, port: 0, host: '127.0.0.1', databaseUrl: 'postgres://x:x@127.0.0.1:1/none' },
      });
      const b6 = `http://127.0.0.1:${badDb.server.address().port}/api/anlewo`;
      const at = mkCaller(b6, mkIp(7));
      /**
       * 用"是否真的又打了一次库"来证明 3 秒缓存，**不比毫秒数**。
       * 连接被拒只要 4ms，两次都很快，"ms2 <= ms1" 比的其实是噪声——实测出现过 4ms → 6ms 的假红，
       * 而且它本来也证明不了缓存：缓存失效时两次各探一次库，耗时同样接近。
       * 包一层 `pool.query` 计数是确定性的，而且更强（缓存缺失时计数会 +1）。
       */
      let pings = 0;
      const realQuery = badDb.pool.query.bind(badDb.pool);
      badDb.pool.query = (...args) => {
        pings += 1;
        return realQuery(...args);
      };
      try {
        const first = await at('/health');
        const after1 = pings;
        const second = await at('/health');
        check(
          first.status === 200 && first.json?.ok === false && first.json?.db === 'down',
          `库不可用：200 + ok:false + db:"down"（实际 ${first.status} ${first.text.slice(0, 60)}）`,
        );
        check(
          first.json?.schema?.tables === 'down' && first.json?.schema?.payloadLimit === 'down',
          `库不可用：schema 两项都报 down（实际 ${JSON.stringify(first.json?.schema)}）`,
        );
        check(after1 >= 1, `第一次 /health 真的探了一次库（探库次数 ${after1}）`);
        check(pings === after1, `3 秒内第二次走缓存、不再打库（探库次数 ${after1} → ${pings}）`);
      } finally {
        await badDb.close();
      }
    }

    // ---- 降级闩锁：Redis 模式下唯一能抓"运行中掉线、静默改走内存"的检查 ----
    // 内存模式下它恒真（memory 后端 degraded 永远 false），这不是缺陷：要对冲的是
    // `/health` 的 `redis:"up"` 在运行期降级之后依然报 up。
    {
      const down = allServers.filter((s) => s?.limiter?.degraded?.() === true).length;
      check(down === 0, `没有实例在运行中降级成内存（降级 ${down} 个 / 共 ${allServers.length} 个）`);
    }

    // ---- 11. 清理 ----
    section('11. 清理（逆序删，ON DELETE RESTRICT 决定了顺序）');
    if (keepFlag) {
      console.log(`  · --keep：保留测试数据 uid=${cleanupUids.join(',')}`);
    } else {
      const cleanup = [
        ['anlewo_save_snapshot', 'DELETE FROM anlewo_save_snapshot WHERE user_id = $1'],
        ['anlewo_ink', 'DELETE FROM anlewo_ink WHERE user_id = $1'],
        ['anlewo_device', 'DELETE FROM anlewo_device WHERE user_id = $1'],
        ['anlewo_sync_key', 'DELETE FROM anlewo_sync_key WHERE local_uid = $1'],
        ['anlewo_save', 'DELETE FROM anlewo_save WHERE user_id = $1'],
        ['anlewo_identity_link', 'DELETE FROM anlewo_identity_link WHERE local_uid = $1'],
      ];
      let removed = 0;
      for (const one of cleanupUids) {
        for (const [name, sql] of cleanup) {
          try {
            const r = await pool.query(sql, [one]);
            removed += r.rowCount ?? 0;
          } catch (err) {
            no(`清理 ${name} 失败：${err?.message ?? 'unknown'}`);
          }
        }
      }
      ok(`按逆序删完 ${cleanupUids.length} 条身份，共 ${removed} 行`);
      let left = 0;
      for (const one of cleanupUids) {
        const r = await pool.query(
          `SELECT (SELECT count(*) FROM anlewo_identity_link WHERE local_uid = $1)
                + (SELECT count(*) FROM anlewo_save WHERE user_id = $1)
                + (SELECT count(*) FROM anlewo_ink WHERE user_id = $1)
                + (SELECT count(*) FROM anlewo_save_snapshot WHERE user_id = $1)
                + (SELECT count(*) FROM anlewo_device WHERE user_id = $1)
                + (SELECT count(*) FROM anlewo_sync_key WHERE local_uid = $1) AS n`,
          [one],
        );
        left += Number(r.rows[0].n);
      }
      check(left === 0, `测试造的行一行不剩（剩 ${left}）`);
    }
  } catch (err) {
    no(`冒烟中途出错：${err?.message ?? 'unknown'}`);
  } finally {
    await started.close();
  }

  console.log(`\n[smoke] 通过 ${passed} 项，失败 ${failed} 项`);
  console.log(`[smoke] 本次跨窗口重测 ${retestCount} 次 / headroom 等待 ${headroomWaits} 次`);
  if (failed > 0) {
    console.error('[smoke] 有失败项——别急着部署，先看上面哪一步红了。');
    process.exit(1);
  }
  console.log('[smoke] 全绿。');
}

main().catch((err) => {
  console.error('[smoke] 崩了：' + (err?.message ?? 'unknown'));
  process.exit(1);
});
