/**
 * HTTP 层：路由、CORS、JSON 体积、统一错误体、限流。全部端点挂在 /api/anlewo 下。
 *
 * 硬纪律：
 *   · 错误体永远只有 {error:"<code>"}——不回显 SQL、不回显堆栈、不回显参数。
 *   · 任何失败对客户端都只是"这次没成"；本地那边是唯一真相源，服务端不反过来覆盖它（C9）。
 *   · uid 只是标识，凭凭证才认人（C1）。
 */
import { originAllowed } from './config.mjs';
import { fetchUserInfo, isUuid, keyMatches, parseAuthorization, sha256Hex } from './auth.mjs';
import {
  MAX_INK_BYTES,
  MAX_PAYLOAD_BYTES,
  bindLink,
  findKeyHash,
  findLink,
  findLinkByIdentity,
  insertSaveInitial,
  listInk,
  ping,
  readSave,
  registerLink,
  replaceSave,
  touchDevice,
  updateSaveCas,
  upsertInk,
} from './db.mjs';

const API = '/api/anlewo';
const JSON_TYPE = 'application/json; charset=utf-8';

/** 带 http 状态的小错误：一路抛到 dispatch 的 catch，映射成统一错误体 */
class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

/**
 * 建应用。
 * @param {{config:object, pool:import('pg').Pool, limiter:{kind:string,incrWithTtl:Function}, fetchImpl?:Function, log?:Console}} deps
 */
export function createApp({ config, pool, limiter, fetchImpl = globalThis.fetch, log = console }) {
  // ---------------------------------------------------------------- 小工具

  function corsHeaders(res, origin) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type,x-anlewo-uid,authorization');
    res.setHeader('access-control-max-age', '600');
  }

  function send(res, status, body) {
    const text = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, {
      'content-type': JSON_TYPE,
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(text, 'utf8'),
      'x-content-type-options': 'nosniff',
    });
    res.end(text);
  }

  function sendEmpty(res, status) {
    res.writeHead(status, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end();
  }

  /** 客户端地址：经 Caddy 来的取 X-Forwarded-For 最后一段（只信本机转来的，与 relay 同一口径） */
  function clientIp(req) {
    const remote = req.socket?.remoteAddress ?? '';
    const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
    if (loopback) {
      const xff = String(req.headers['x-forwarded-for'] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (xff.length > 0) return xff[xff.length - 1];
    }
    return remote || 'unknown';
  }

  /**
   * 读 JSON 体，带体积上限。超了立刻断流（不等对方把剩下的灌完）。
   * @param {import('node:http').IncomingMessage} req
   * @param {number} limit
   * @param {boolean} allowEmpty
   */
  async function readJson(req, limit, allowEmpty = false) {
    const ct = String(req.headers['content-type'] ?? '');
    if (!/^application\/json\b/i.test(ct)) throw new HttpError(415, 'bad_content_type');
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) {
        // 不做 req.destroy()：先让上层把 413 回出去（客户端能看到明确原因），再断流
        throw new HttpError(413, 'too_large');
      }
      chunks.push(chunk);
    }
    if (size === 0) {
      if (allowEmpty) return {};
      throw new HttpError(400, 'empty_body');
    }
    let parsed;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'bad_json');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'bad_json');
    return parsed;
  }

  /** 请求头里的 uid：必须是 uuid（它只作标识，不作凭证） */
  function requireUid(req) {
    const raw = req.headers['x-anlewo-uid'];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v !== 'string' || !isUuid(v)) throw new HttpError(400, 'bad_uid');
    return v.toLowerCase();
  }

  /**
   * 认清是谁：
   *   sync_key → 与 anlewo_sync_key.key_hash 定长比对；
   *   OIDC token → 开关关着直接 501（不发任何外网请求），开着才去 /userinfo 换 user.id，
   *   换到的 identity_uid 必须正好指向请求头报的那个 local_uid（uid 不是凭证，C1）。
   */
  async function authenticate(req, uid) {
    const cred = parseAuthorization(req.headers.authorization);
    if (!cred) throw new HttpError(401, 'bad_credential');

    if (cred.kind === 'sync_key') {
      const hash = await findKeyHash(pool, uid);
      if (!hash || !keyMatches(cred.value, hash)) throw new HttpError(401, 'bad_credential');
      const link = await findLink(pool, uid);
      if (!link) throw new HttpError(401, 'bad_credential');
      return { uid, status: link.status, identityUid: link.identity_uid ?? null };
    }

    if (!config.identityEnabled) throw new HttpError(501, 'identity_disabled');
    const info = await fetchUserInfo({ issuer: config.identityIssuer, accessToken: cred.value, fetchImpl });
    if (!info.ok) throw new HttpError(502, 'identity_unavailable');
    const link = await findLinkByIdentity(pool, info.userId);
    if (!link || link.local_uid !== uid) throw new HttpError(401, 'bad_credential');
    return { uid, status: link.status, identityUid: link.identity_uid ?? null };
  }

  // ---------------------------------------------------------------- 端点

  /**
   * GET /health —— 只报状态，不报任何配置值。
   * ping 结果缓存 3 秒：health 也会占 IP 桶，但探活/压测时不该把 max:5 的连接池一口吃干；
   * 库不可用时照样回 200，只是 `ok:false`（"进程活着"与"库可用"是两件事）。
   */
  let healthAt = 0;
  let healthDbUp = false;
  async function handleHealth(req, res) {
    const now = Date.now();
    if (now - healthAt >= 3000) {
      try {
        await ping(pool);
        healthDbUp = true;
      } catch {
        healthDbUp = false;
      }
      healthAt = now;
    }
    send(res, 200, {
      ok: healthDbUp,
      db: healthDbUp ? 'up' : 'down',
      redis: limiter.kind === 'redis' ? 'up' : 'memory',
      identity: config.identityEnabled ? 'on' : 'off',
    });
  }

  /**
   * POST /link —— 匿名注册（或确认"还是我"）。
   * 行不存在：同一事务里建 link + sync_key（+ 可选 device）。
   * 已存在：凭证必须对得上，否则 401（防别人拿一个 uid 接管，C1）；
   * 凭证行丢了且这条身份够老、还没有存档时，db 层会受控重建一把（P1-1）。
   */
  async function handleLink(req, res) {
    const uid = requireUid(req);
    const cred = parseAuthorization(req.headers.authorization);
    if (!cred) throw new HttpError(401, 'bad_credential');
    // 这个端点的职责就是"用新凭证占住一个 uid"，所以只收 sync_key
    if (cred.kind !== 'sync_key') throw new HttpError(400, 'link_requires_sync_key');

    /**
     * 建行桶（裁决）：`/link` 是**每次开页面都打的第一步**，所以"请求数"不等于"建行数"。
     * 拿请求数当预算，会把同一出口所有既有用户的每次开页面都算进去——25 个陌生人打出的
     * 401（一行都没写）就能让整个办公室一分钟内注册不上，那是可用性故障，不是限流。
     * 这里只数**真的建了行**的那些；`created === false`（"还是我"）一次都不占。
     *
     * 为什么是"预留-退还"而不是"先 peek 再写"：`peek` 是**先看后写、不是原子预留**。
     * 同一个出口并发 50 个（50 个不同新 uid）时，50 个 peek 会同时读到 0、全部放行，
     * 于是"上限 2"变成"建出 50 行"。`INCR` 是原子的，把它当预留才挡得住并发。
     *
     * 三条不能丢的性质：
     *   ① 已注册用户（`existing` 非空）**一次都不碰桶**——桶满的那一分钟里既有用户照样开页面；
     *   ② 429 必须在 `registerLink` **之前**返回，否则库里会留下一条谁也不知道凭证的孤儿身份；
     *   ③ 被 429 的那次**不退还**（它确实已经 incr 过）：同一个出口反复撞门应当累积惩罚，
     *      "撞一次退一次"等于不限。
     * 退还只发生在两种情形：预留了但最终没建行（并发下别人先建了）、预留了但写库抛错。
     * 退还**必须复用同一个 `linkKey`**（上面算好的那个）：在退还处重算 `Date.now()` 会在跨分钟时
     * 退到下一个窗口去，既漏算又可能把计数减成负数。
     */
    const linkKey = `anlewo:rl:linkc:${Math.floor(Date.now() / 60000)}:${sha256Hex(clientIp(req)).slice(0, 16)}`;
    const existing = await findLink(pool, uid);

    let reserved = false;
    if (!existing) {
      const n = await limiter.incrWithTtl(linkKey, 60000); // INCR 原子，这就是预留
      if (n > config.linkPerMin) return send(res, 429, { error: 'rate_limited' }); // 零写入，不退还
      reserved = true;
    }

    let kept = false;
    try {
      const body = await readJson(req, config.bodyLimit, true); // 415/400/413 都在这里抛 → finally 退还
      const keyHash = sha256Hex(cred.value);
      const device = normalizeDevice(body);

      // subject 就写 uid：**凭据的散列不该进业务表**（业务表里只放标识，凭证只进 anlewo_sync_key）
      const out = await registerLink(pool, { uid, subject: uid, keyHash, device });
      if (out.created) kept = true; // 只有真的建出行才保留这一格
      if (!out.created && (!out.keyHash || !keyMatches(cred.value, out.keyHash))) {
        throw new HttpError(401, 'bad_credential'); // finally 退还
      }
      // 老身份再来报到的路上也要刷新设备台账（原来是创建的同一刻才写，之后永不更新）
      if (!out.created && device) {
        await touchDevice(pool, { deviceId: device.deviceId, uid, kind: device.kind, label: device.label });
      }
      send(res, 200, {
        uid: out.link.local_uid,
        status: out.link.status,
        boundIdentity: out.link.identity_uid ?? null,
      });
    } finally {
      /**
       * 结算：**只有"建出一行"保留这一格**；撞上限的那次在上面提前 return（根本没进 try），
       * 也保留。其余一律退还。
       *
       * 为什么退还写在 finally 而不是贴在 `registerLink` 旁边：坏 Content-Type（415）、
       * 坏 JSON（400）、体过大（413）三条都发生在"预留之后、建行之前"。只贴在 `registerLink`
       * 旁边的话，同一出口 25 次 `Content-Type: text/plain` 就能把一分钟建行预算烧光、**一行都没建**
       * ——和"25 个 401 饿死整个办公室"是同一个形状，换个入口而已。
       *
       * `existing === true` 时 `reserved` 恒为 false，这里什么都不做：已注册用户永远不碰桶。
       */
      if (reserved && !kept) await limiter.decr(linkKey);
    }
  }

  /** GET /save —— 没记录就 204（客户端据此知道自己这边是首发） */
  async function handleSaveGet(req, res, ctx) {
    const row = await readSave(pool, ctx.uid);
    if (!row) return sendEmpty(res, 204);
    send(res, 200, row);
  }

  /**
   * PUT /save —— 整包 CAS 写入。
   * baseRevision=0 是首次；否则必须正好等于服务端当前版本。
   * 不匹配：服务端当前版本进快照（reason='sync'），回 409 + 服务端那一份，
   * 客户端只 console.debug、**不覆盖本地**（C4：本地优先）。
   */
  async function handleSavePut(req, res, ctx) {
    const body = await readJson(req, config.bodyLimit);
    const payload = body.payload;
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new HttpError(400, 'bad_payload');

    let payloadJson;
    try {
      payloadJson = JSON.stringify(payload);
    } catch {
      throw new HttpError(400, 'bad_payload');
    }
    if (Buffer.byteLength(payloadJson, 'utf8') > MAX_PAYLOAD_BYTES) throw new HttpError(413, 'payload_too_large');

    const base = body.baseRevision;
    if (!Number.isInteger(base) || base < 0) throw new HttpError(400, 'bad_base_revision');
    const clientId = isUuid(body.clientId) ? body.clientId.toLowerCase() : null;
    // 裁决 P0-1：覆盖一个"不是自己这一支写出来的"版本时，客户端在 body 里置 snapshotBefore:true，
    // 服务端在**同一个事务**里先留底再覆盖（db.replaceSave）。常规 5 秒推送不带，免得每次改动都堆一行。
    const replace = body.snapshotBefore === true;

    let revision = null;
    if (base === 0) revision = await insertSaveInitial(pool, { uid: ctx.uid, payloadJson, clientId });
    // 首次插入撞上"已经有了"，或本来就 base>0：都走 CAS 更新
    if (revision === null) {
      revision = replace
        ? await replaceSave(pool, { uid: ctx.uid, payloadJson, baseRevision: base, clientId })
        : await updateSaveCas(pool, { uid: ctx.uid, payloadJson, baseRevision: base, clientId });
    }

    if (revision === null) {
      // 这一路没有发生写入，所以不留快照（没信息量）；真正被覆盖的版本由 replaceSave 在那一个事务里留底
      const cur = await readSave(pool, ctx.uid);
      return send(res, 409, {
        error: 'conflict',
        revision: cur?.revision ?? 0,
        payload: cur?.payload ?? null,
        updatedAt: cur?.updatedAt ?? null,
      });
    }
    send(res, 200, { revision });
  }

  /**
   * POST /ink —— 一篇没写完的笔迹，按 (user_id, sha256(pieceKey)) upsert。
   * char_total 必须等于 chars 的长度（库里就有这条 CHECK，早点挡住给个明白的错）。
   */
  async function handleInkPost(req, res, ctx) {
    const body = await readJson(req, config.bodyLimit);
    const pieceKey = typeof body.pieceKey === 'string' ? body.pieceKey : '';
    if (!pieceKey || Buffer.byteLength(pieceKey, 'utf8') > 2048) throw new HttpError(400, 'bad_piece_key');

    const chars = body.chars;
    if (!Array.isArray(chars) || chars.length > 4096) throw new HttpError(400, 'bad_chars');
    for (const c of chars) if (typeof c !== 'string') throw new HttpError(400, 'bad_chars');

    const charTotal = chars.length;
    if (body.charTotal !== undefined && body.charTotal !== charTotal) throw new HttpError(400, 'bad_char_total');

    let charsJson;
    try {
      charsJson = JSON.stringify(chars);
    } catch {
      throw new HttpError(400, 'bad_chars');
    }
    if (Buffer.byteLength(charsJson, 'utf8') > MAX_INK_BYTES) throw new HttpError(413, 'ink_too_large');

    const pieceHash = sha256Hex(pieceKey);
    const updatedAt = await upsertInk(pool, { uid: ctx.uid, pieceHash, pieceKey, charsJson, charTotal });
    send(res, 200, { pieceHash, updatedAt });
  }

  /** GET /ink?limit=20 —— 只要索引信息，不回 chars（大包留在库里） */
  async function handleInkGet(req, res, ctx, url) {
    const raw = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);
    const limit = Number.isFinite(raw) ? Math.max(1, Math.min(100, raw)) : 20;
    const rows = await listInk(pool, ctx.uid, limit);
    send(res, 200, { items: rows });
  }

  /**
   * POST /identity/bind —— 把统一身份的 user_id 关联到这条 local_uid 上。
   * 关着的时候连一行外网请求都不发（501 在最前面）。
   * /userinfo 失败或 user.id 不是 uuid：写库一律不动，保持匿名态（C11）。
   */
  async function handleBind(req, res) {
    const uid = requireUid(req);
    if (!config.identityEnabled) throw new HttpError(501, 'identity_disabled');

    // 先证明"这台机器确实是这个 uid 的主人"（设备凭证），再谈绑身份
    const cred = parseAuthorization(req.headers.authorization);
    if (!cred || cred.kind !== 'sync_key') throw new HttpError(401, 'bad_credential');
    const hash = await findKeyHash(pool, uid);
    if (!hash || !keyMatches(cred.value, hash)) throw new HttpError(401, 'bad_credential');

    const body = await readJson(req, config.bodyLimit);
    const token = typeof body.accessToken === 'string' ? body.accessToken.trim() : '';
    if (!token || token.length > 4096) throw new HttpError(400, 'bad_access_token');

    const info = await fetchUserInfo({ issuer: config.identityIssuer, accessToken: token, fetchImpl });
    if (!info.ok) throw new HttpError(502, 'identity_unavailable');

    const out = await bindLink(pool, { uid, identityUid: info.userId, issuer: config.identityIssuer, subject: info.userId });
    if (!out.ok) throw new HttpError(404, out.reason === 'not_found' ? 'not_found' : 'bad_uid');

    send(res, 200, { uid, status: 'bound', boundIdentity: info.userId });
  }

  // ---------------------------------------------------------------- 路由表

  const routes = [
    { method: 'GET', path: `${API}/health`, auth: false, run: (req, res) => handleHealth(req, res) },
    { method: 'POST', path: `${API}/link`, auth: false, run: (req, res) => handleLink(req, res) },
    { method: 'GET', path: `${API}/save`, auth: true, run: (req, res, ctx) => handleSaveGet(req, res, ctx) },
    { method: 'PUT', path: `${API}/save`, auth: true, run: (req, res, ctx) => handleSavePut(req, res, ctx) },
    { method: 'POST', path: `${API}/ink`, auth: true, run: (req, res, ctx) => handleInkPost(req, res, ctx) },
    { method: 'GET', path: `${API}/ink`, auth: true, run: (req, res, ctx, url) => handleInkGet(req, res, ctx, url) },
    { method: 'POST', path: `${API}/identity/bind`, auth: false, run: (req, res) => handleBind(req, res) },
  ];

  /** 把任意错误映射成统一错误体（不回显内部细节） */
  function fail(res, err) {
    if (err instanceof HttpError) return send(res, err.status, { error: err.code });
    const code = err?.code;
    // CHECK 约束：只有"体积类"的才是 413，别的（char_total 不符、payload 不是对象…）是 400
    if (code === '23514') {
      const name = String(err?.constraint ?? '');
      return /size/i.test(name) ? send(res, 413, { error: 'payload_too_large' }) : send(res, 400, { error: 'bad_value' });
    }
    // 唯一冲突：绑定时撞 subject_uq 才是"这个身份已经绑过别的 local_uid"，其余是重复写入
    if (code === '23505') {
      const name = String(err?.constraint ?? '');
      return /subject_uq/i.test(name) ? send(res, 409, { error: 'identity_already_bound' }) : send(res, 409, { error: 'duplicate' });
    }
    if (code === '23503') return send(res, 401, { error: 'bad_credential' }); // FK：这个 uid 其实不存在
    if (code === '22P02') return send(res, 400, { error: 'bad_uid' }); // 非法 uuid 文本
    // 表不存在＝迁移没跑完：这是运维问题，不是请求的问题，给一个能照着查的错
    if (code === '42P01') return send(res, 503, { error: 'db_migration_missing' });
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'ECONNRESET' || err?.message === 'Connection terminated unexpectedly') {
      return send(res, 503, { error: 'db_unavailable' });
    }
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return send(res, 504, { error: 'upstream_timeout' });
    log.error?.('[anlewo-sync] 未预期错误：' + (err?.message ?? 'unknown'));
    return send(res, 500, { error: 'internal' });
  }

  /** 每个端点都走的统一外框：CORS → 路由 → 限流 → 鉴权 → 处理 */
  async function handle(req, res) {
    const origin = req.headers.origin;
    const allowed = originAllowed(origin, config.cors);
    if (allowed) corsHeaders(res, origin);

    try {
      // 预检：不认的来源直接 403（浏览器本来也拿不到结果，省得以为通了）
      if (req.method === 'OPTIONS') {
        if (origin && !allowed) return send(res, 403, { error: 'origin_denied' });
        return sendEmpty(res, 204);
      }
      if (origin && !allowed) return send(res, 403, { error: 'origin_denied' });

      let url;
      try {
        url = new URL(req.url ?? '/', 'http://localhost');
      } catch {
        return send(res, 400, { error: 'bad_request' });
      }
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (!path.startsWith(`${API}/`) && path !== API) return send(res, 404, { error: 'not_found' });

      // 请求头里的 uid 先过闸：**在建立任何限流桶之前**。
      // 太长（8KB 假头）或根本不是 uuid 的，一律 400——坏头不建桶，连哈希都不算。
      // 没带这个头不在这里判（/health 与探活本来就没有），交给各端点的 requireUid。
      const uidHeader = req.headers['x-anlewo-uid'];
      const rawUid = typeof uidHeader === 'string' ? uidHeader : '';
      if (uidHeader !== undefined && (Buffer.byteLength(rawUid, 'utf8') > 64 || !isUuid(rawUid))) {
        return send(res, 400, { error: 'bad_uid' });
      }

      const route = routes.find((r) => r.path === path && r.method === req.method);
      if (!route) {
        const samePath = routes.some((r) => r.path === path);
        return send(res, samePath ? 405 : 404, { error: samePath ? 'method_not_allowed' : 'not_found' });
      }

      // 限流（固定一分钟窗口；Redis 优先、内存兜底），两维分开算：
      //   ① 来源地址：兜底那一维，所有路径共用（含 /health）。**键里绝不放原始文本**：
      //      都先做 sha256 取前 16 位，键长恒为 16 字节——否则一个 8KB 的假 uid 头就能把内存撑爆。
      //      （这是上一次评审的 P0：把客户端可控的字符串直接拼进 key＝轮换 uid 就换桶。）
      //   ② uid：公平那一维，只在它真的是 uuid 时才算；/health 不占。
      //   ③ `/link` 另有一档"建行"限额，但它**不在这里**：只能数"真的建出来的行"，
      //      见 handleLink 的**原子预留-退还**（`INCR` 当预留、没建行就 `DECR` 还回去，
      //      不是"先 peek 再写"——那会被并发绕过）。放在这里数请求数会把每次开页面都算成一次建行。
      {
        const bucket = Math.floor(Date.now() / 60000);
        const ipHash = sha256Hex(clientIp(req)).slice(0, 16);
        const nIp = await limiter.incrWithTtl(`anlewo:rl:ip:${bucket}:${ipHash}`, 60000);
        if (nIp > config.rateIpPerMin) return send(res, 429, { error: 'rate_limited' });

        if (path !== `${API}/health` && rawUid) {
          // 走到这里 rawUid 一定是合法 uuid（上面的闸挡住了别的形状）。
          // 键里带上来源地址（P2-1）：否则"知道某人 uid 就能拿它刷满、让本人被 429"。
          const uidHash = sha256Hex(`${rawUid.toLowerCase()}|${clientIp(req)}`).slice(0, 16);
          const nUid = await limiter.incrWithTtl(`anlewo:rl:u:${bucket}:${uidHash}`, 60000);
          if (nUid > config.ratePerMin) return send(res, 429, { error: 'rate_limited' });
        }
      }

      const ctx = route.auth ? await authenticate(req, requireUid(req)) : null;
      await route.run(req, res, ctx, url);
    } catch (err) {
      if (res.headersSent) {
        log.error?.('[anlewo-sync] 响应已发出后才出错：' + (err?.message ?? 'unknown'));
        try {
          res.end();
        } catch {
          /* 断就断了 */
        }
        return;
      }
      fail(res, err);
      // 体积超限的那一路没有把请求体读完：回完 413 就把这条连接断掉，别让对方继续灌
      if (err instanceof HttpError && err.code === 'too_large') {
        try {
          req.destroy();
        } catch {
          /* 已经断了 */
        }
      }
    }
  }

  return { handle, routes };
}

/** 设备三件套：deviceId 必须是 uuid（否则当没给），kind 只收库里允许的四种，label 截到 120 字节以内 */
function normalizeDevice(body) {
  const o = body && typeof body === 'object' ? body : {};
  if (!isUuid(o.deviceId)) return null;
  const kinds = ['web', 'ios', 'android', 'unknown'];
  const kind = kinds.includes(o.kind) ? o.kind : 'web';
  let label = typeof o.label === 'string' ? o.label.trim() : null;
  if (label) label = label.slice(0, 120);
  return { deviceId: o.deviceId.toLowerCase(), kind, label };
}
