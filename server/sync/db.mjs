/**
 * 数据库：一个 pg.Pool + 业务函数。
 *
 * 表结构以 db/V1__anlewo_core.sql 与 db/V2__anlewo_sync_key.sql 的真实列名为准（不按文档摘要）。
 * 所有写档都在事务里（C5）：任一步失败整笔不写，本地那边照旧留着它自己的脏数据。
 *
 * 不打印连接串、不打印 SQL 参数——报错只往外抛 message，由上层映射成统一错误体。
 */
import pg from 'pg';

const { Pool } = pg;

/**
 * 单个存档 payload 的硬上限。三处必须一致：
 *   前端 src/app/sync/index.ts 的 MAX_PUSH_BYTES、这里、db/V3__anlewo_payload_limit.sql 的 CHECK。
 * 任何一处小了，都会变成"大一点的档永远推不上去，而界面只在 console.debug 里留一行"。
 */
export const MAX_PAYLOAD_BYTES = 1048576;
/** 单篇笔迹的硬上限，与 anlewo_ink_chars_size_chk 一致 */
export const MAX_INK_BYTES = 1048576;

/**
 * 建连接池：最多 5 条（同步是低并发长尾，不必大池），5s 语句超时挡住打挂库的查询。
 * @param {{databaseUrl:string}} cfg
 */
export function createPool(cfg) {
  const pool = new Pool({
    connectionString: cfg.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 8000,
    statement_timeout: 5000,
    query_timeout: 5000,
    application_name: 'anlewo-sync',
  });
  // 空闲连接被掐断这类错误会在这里出现：只记一行，不让它把进程掀了
  pool.on('error', (err) => {
    console.warn('[anlewo-sync] 连接池错误：' + (err?.message ?? 'unknown'));
  });
  return pool;
}

/** 库通不通；不通就抛，让调用方记 down */
export async function ping(pool) {
  const r = await pool.query('SELECT 1 AS ok');
  return r.rows[0]?.ok === 1;
}

/** health 要认的六张表（V1 建 5 张，V2 建 anlewo_sync_key） */
export const SCHEMA_TABLES = [
  'anlewo_identity_link',
  'anlewo_save',
  'anlewo_ink',
  'anlewo_save_snapshot',
  'anlewo_device',
  'anlewo_sync_key',
];

/**
 * 库通不通 + 迁移有没有跑全（health 与 migrate.mjs 的回读共用一个口径）。
 * 一条查询搞定两件事：库不通会直接抛（调用方记 down），库通但迁移没跑全就报缺哪张表 / 1MB 上限在不在。
 * 只读目录与约束，不读任何业务数据、不带参数。
 */
export async function schemaStatus(pool) {
  const r = await pool.query(
    `SELECT array_remove(ARRAY[
              to_regclass('public.anlewo_identity_link')::text,
              to_regclass('public.anlewo_save')::text,
              to_regclass('public.anlewo_ink')::text,
              to_regclass('public.anlewo_save_snapshot')::text,
              to_regclass('public.anlewo_device')::text,
              to_regclass('public.anlewo_sync_key')::text
            ], NULL) AS present,
            EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anlewo_save_payload_size_chk') AS payload_limit`,
  );
  const row = r.rows[0] ?? {};
  const present = new Set((row.present ?? []).map((x) => String(x).split('.').pop()));
  const missing = SCHEMA_TABLES.filter((t) => !present.has(t));
  const payloadLimit = row.payload_limit === true;
  return { ok: missing.length === 0 && payloadLimit, missing, payloadLimit };
}

/**
 * 事务助手：fn 拿到 client，正常返回则 COMMIT，抛错则 ROLLBACK。
 * @template T
 * @param {import('pg').Pool} pool
 * @param {(c: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  let failed = null;
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    failed = err;
    try {
      await client.query('ROLLBACK');
    } catch {
      // 回滚也失败：连接已坏，下面 release(err) 会把它丢掉而不是还回池里
    }
    throw err;
  } finally {
    client.release(failed ?? undefined);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** uuid 参数统一小写；不是 uuid 就 null（pg 对非 uuid 参数会抛 22P02，这里先挡一道） */
const asUuid = (v) => (typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null);

/** 一行身份关联（没这行就是 null） */
export async function findLink(pool, uid) {
  const u = asUuid(uid);
  if (!u) return null;
  const r = await pool.query(
    `SELECT local_uid, identity_uid, provider, subject, issuer, status, bound_at
       FROM anlewo_identity_link WHERE local_uid = $1`,
    [u],
  );
  return r.rows[0] ?? null;
}

/** 按统一身份 user_id 找已绑定的那一行（N:1，取最近绑定的） */
export async function findLinkByIdentity(pool, identityUid) {
  const u = asUuid(identityUid);
  if (!u) return null;
  const r = await pool.query(
    `SELECT local_uid, identity_uid, provider, subject, issuer, status, bound_at
       FROM anlewo_identity_link
      WHERE identity_uid = $1 AND status = 'bound'
      ORDER BY bound_at DESC NULLS LAST
      LIMIT 1`,
    [u],
  );
  return r.rows[0] ?? null;
}

/** 库里存的 sha256(sync_key)；没这行返回 null */
export async function findKeyHash(pool, uid) {
  const u = asUuid(uid);
  if (!u) return null;
  const r = await pool.query('SELECT key_hash FROM anlewo_sync_key WHERE local_uid = $1', [u]);
  return r.rows[0]?.key_hash ?? null;
}

/**
 * 匿名注册：link + sync_key（+ 可选 device）同一个事务。
 *
 * 已存在时先比对凭证；凭证行丢了（迁移/半截写入造成的）走**受控重建**（裁决 P1-1）：
 * 只有这条身份"够老（>10 分钟）"且"还没有任何存档"时才允许补一把新 key_hash——
 * 免得谁捡到一个 uid 就把一把新钥匙插进去接管别人的档。
 *
 * @returns {Promise<{created:boolean, rebuilt?:boolean, link:{local_uid:string,identity_uid:string|null,status:string}, keyHash:string|null}>}
 */
export async function registerLink(pool, { uid, subject, keyHash, device }) {
  const u = asUuid(uid);
  const run = async (client) => {
    // FOR UPDATE 锁住这一行：并发注册时第二个会等第一个提交，再走"已存在"分支
    const cur = await client.query(
      `SELECT local_uid, identity_uid, status FROM anlewo_identity_link WHERE local_uid = $1 FOR UPDATE`,
      [u],
    );
    const key = await client.query('SELECT key_hash FROM anlewo_sync_key WHERE local_uid = $1', [u]);

    if (cur.rows.length > 0) {
      const existing = key.rows[0]?.key_hash ?? null;
      if (existing) return { created: false, rebuilt: false, link: cur.rows[0], keyHash: existing };

      // 凭证行丢了：只在这条身份够老、且还没有存档时才重建（受控自救，不是"随便谁都能插钥匙"）
      const ins = await client.query(
        `INSERT INTO anlewo_sync_key (local_uid, key_hash)
         SELECT l.local_uid, $2
           FROM anlewo_identity_link l
          WHERE l.local_uid = $1
            AND l.created_at < now() - interval '10 minutes'
            AND NOT EXISTS (SELECT 1 FROM anlewo_save s WHERE s.user_id = l.local_uid)
         ON CONFLICT (local_uid) DO NOTHING
         RETURNING local_uid`,
        [u, keyHash],
      );
      const rebuilt = ins.rows.length > 0;
      return { created: false, rebuilt, link: cur.rows[0], keyHash: rebuilt ? keyHash : null };
    }

    const ins = await client.query(
      `INSERT INTO anlewo_identity_link (local_uid, provider, subject, status)
       VALUES ($1, 'anon', $2, 'anonymous')
       RETURNING local_uid, identity_uid, status`,
      [u, subject],
    );
    await client.query('INSERT INTO anlewo_sync_key (local_uid, key_hash) VALUES ($1, $2)', [u, keyHash]);
    if (device) await touchDeviceClient(client, { deviceId: device.deviceId, uid: u, kind: device.kind, label: device.label });
    return { created: true, rebuilt: false, link: ins.rows[0], keyHash };
  };

  try {
    return await withTransaction(pool, run);
  } catch (err) {
    // 同 uid 并发注册撞主键：重读一次，交给调用方比对凭证
    if (err?.code === '23505') {
      const link = await findLink(pool, u);
      if (link) return { created: false, rebuilt: false, link, keyHash: await findKeyHash(pool, u) };
    }
    throw err;
  }
}

/** 设备台账：同一 device_id 只更新 last_seen（且不许改到别人的行上） */
async function touchDeviceClient(client, { deviceId, uid, kind, label }) {
  const d = asUuid(deviceId);
  if (!d) return;
  await client.query(
    `INSERT INTO anlewo_device (device_id, user_id, kind, label)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (device_id) DO UPDATE
        SET last_seen_at = now(),
            kind = CASE WHEN anlewo_device.user_id = EXCLUDED.user_id THEN EXCLUDED.kind ELSE anlewo_device.kind END,
            label = CASE WHEN anlewo_device.user_id = EXCLUDED.user_id THEN EXCLUDED.label ELSE anlewo_device.label END
      WHERE anlewo_device.user_id = EXCLUDED.user_id`,
    [d, uid, kind, label],
  );
}

/** 对外暴露的设备登记（单独用时自己开会话） */
export async function touchDevice(pool, { deviceId, uid, kind, label }) {
  const u = asUuid(uid);
  if (!u) return;
  await touchDeviceClient(pool, { deviceId, uid: u, kind, label });
}

/** 读存档：没记录返回 null（端点回 204） */
export async function readSave(pool, uid) {
  const u = asUuid(uid);
  if (!u) return null;
  const r = await pool.query('SELECT revision, payload, updated_at FROM anlewo_save WHERE user_id = $1', [u]);
  const row = r.rows[0];
  if (!row) return null;
  return { revision: Number(row.revision), payload: row.payload, updatedAt: row.updated_at.toISOString() };
}

/**
 * 首次写入（baseRevision=0）：revision 由服务端给 1。
 * 已经存在则一行也不动，返回 null 让上层走 CAS 更新（C3：绝不用 0 覆盖别人的版本）。
 */
export async function insertSaveInitial(pool, { uid, payloadJson, clientId }) {
  const u = asUuid(uid);
  const c = asUuid(clientId);
  const r = await pool.query(
    `INSERT INTO anlewo_save (user_id, revision, payload, client_id)
     VALUES ($1, 1, $2::jsonb, $3)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING revision`,
    [u, payloadJson, c],
  );
  return r.rows.length ? Number(r.rows[0].revision) : null;
}

/** 比对并替换：0 行＝版本不匹配＝冲突（C3） */
export async function updateSaveCas(pool, { uid, payloadJson, baseRevision, clientId }) {
  const u = asUuid(uid);
  const c = asUuid(clientId);
  const r = await pool.query(
    `UPDATE anlewo_save
        SET payload = $1::jsonb, revision = revision + 1, updated_at = now(), client_id = $4
      WHERE user_id = $2 AND revision = $3
      RETURNING revision`,
    [payloadJson, u, baseRevision, c],
  );
  return r.rows.length ? Number(r.rows[0].revision) : null;
}

/**
 * 覆盖式写入（裁决 P0-1）：**同一个事务里**先把被替换的那一版存进快照，再做与
 * `updateSaveCas` 完全相同的 CAS 更新。
 *
 * 为什么必须同事务：若先 UPDATE 成功、再补插快照，两步之间进程一崩，被覆盖的那一版
 * 就永久没了。放一个事务里，要么"留底+更新"都成，要么都不成。
 *
 * 返回语义与 `updateSaveCas` 一致：成功给新 revision，0 行（版本不匹配）给 null，由 http 层回 409。
 * 版本不匹配时**不留快照**（P2-1）：先 `SELECT … FOR UPDATE` 锁住那一行核对 revision，
 * 对不上就直接返回——否则会存下一份"其实没被覆盖"的版本。
 */
export async function replaceSave(pool, { uid, payloadJson, baseRevision, clientId }) {
  const u = asUuid(uid);
  const c = asUuid(clientId);
  return withTransaction(pool, async (client) => {
    const cur = await client.query('SELECT revision FROM anlewo_save WHERE user_id = $1 FOR UPDATE', [u]);
    if (cur.rows.length === 0 || Number(cur.rows[0].revision) !== baseRevision) return null;
    await client.query(
      `INSERT INTO anlewo_save_snapshot (user_id, revision, payload, reason)
       SELECT user_id, revision, payload, 'sync'
         FROM anlewo_save
        WHERE user_id = $1
       ON CONFLICT (user_id, revision, reason) DO NOTHING`,
      [u],
    );
    const r = await client.query(
      `UPDATE anlewo_save
          SET payload = $1::jsonb, revision = revision + 1, updated_at = now(), client_id = $4
        WHERE user_id = $2 AND revision = $3
        RETURNING revision`,
      [payloadJson, u, baseRevision, c],
    );
    return r.rows.length ? Number(r.rows[0].revision) : null;
  });
}

/**
 * 笔迹：同一 (user_id, piece_hash) 就覆盖，别的留着
 */
export async function upsertInk(pool, { uid, pieceHash, pieceKey, charsJson, charTotal }) {
  const u = asUuid(uid);
  const r = await pool.query(
    `INSERT INTO anlewo_ink (user_id, piece_hash, piece_key, chars, char_total, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::int, now())
     ON CONFLICT (user_id, piece_hash) DO UPDATE
        SET chars = EXCLUDED.chars,
            char_total = EXCLUDED.char_total,
            piece_key = EXCLUDED.piece_key,
            updated_at = now()
     RETURNING updated_at`,
    [u, pieceHash, pieceKey, charsJson, charTotal],
  );
  return r.rows[0].updated_at.toISOString();
}

/** 最近若干篇（不取 chars：那是大包，列表不需要） */
export async function listInk(pool, uid, limit) {
  const u = asUuid(uid);
  const r = await pool.query(
    `SELECT piece_hash, piece_key, char_total, updated_at
       FROM anlewo_ink
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2`,
    [u, limit],
  );
  return r.rows.map((row) => ({
    pieceHash: row.piece_hash,
    pieceKey: row.piece_key,
    charTotal: Number(row.char_total),
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * 绑定统一身份：先留 pre_bind 快照（有存档才留），再改 link 那一行。
 * 业务表一个字段都不动（§5.3）。
 * @returns {Promise<{ok:boolean, reason?:string}>} 唯一冲突（23505）由上层映射成 409
 */
export async function bindLink(pool, { uid, identityUid, issuer, subject }) {
  const u = asUuid(uid);
  const iu = asUuid(identityUid);
  if (!u || !iu) return { ok: false, reason: 'bad_uuid' };
  return withTransaction(pool, async (client) => {
    const cur = await client.query('SELECT local_uid FROM anlewo_identity_link WHERE local_uid = $1 FOR UPDATE', [u]);
    if (cur.rows.length === 0) return { ok: false, reason: 'not_found' };
    await client.query(
      `INSERT INTO anlewo_save_snapshot (user_id, revision, payload, reason)
       SELECT user_id, revision, payload, 'pre_bind'
         FROM anlewo_save
        WHERE user_id = $1
       ON CONFLICT (user_id, revision, reason) DO NOTHING`,
      [u],
    );
    const upd = await client.query(
      `UPDATE anlewo_identity_link
          SET identity_uid = $2, provider = 'oidc', issuer = $3, subject = $4, status = 'bound', bound_at = now()
        WHERE local_uid = $1
        RETURNING local_uid`,
      [u, iu, issuer, subject],
    );
    return { ok: upd.rows.length === 1 };
  });
}
