/**
 * 存档体积直方图（维护用，只读）。
 *
 * 用来回答“上限该不该动”这类问题：现在多少条存档、体积怎么分布、离上限还有多远、
 * 快照攒了多少行。只查聚合，不读任何 payload 内容、不打印 uid。
 *
 *   cd server/sync && npm run stats
 */
import { loadConfig, loadDotEnv } from './config.mjs';
import { createPool, MAX_PAYLOAD_BYTES } from './db.mjs';

const BUCKETS = [
  ['< 8 KB', 8192],
  ['< 64 KB', 65536],
  ['< 256 KB', 262144],
  ['< 1 MB', 1048576],
  ['< 4 MB', 4194304],
];

function fmt(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

async function main() {
  const cfg = loadConfig(loadDotEnv(), { dotenv: false });
  const pool = createPool(cfg);
  try {
    const totals = await pool.query(
      `SELECT count(*) AS n,
              coalesce(sum(length(payload::text)), 0) AS chars,
              coalesce(max(length(payload::text)), 0) AS max_chars
         FROM anlewo_save`,
    );
    const t = totals.rows[0];
    const n = Number(t.n);
    console.log(`[stats] 存档 ${n} 条，合计 ${fmt(Number(t.chars))}（UTF-8 估算），最大一份 ${fmt(Number(t.max_chars))}`);
    console.log(`[stats] 服务端上限 ${fmt(MAX_PAYLOAD_BYTES)}`);

    let prev = 0;
    let covered = 0;
    for (const [label, bytes] of BUCKETS) {
      const r = await pool.query(
        `SELECT count(*) AS n FROM anlewo_save
          WHERE length(payload::text) > $1 AND length(payload::text) <= $2`,
        [prev, bytes],
      );
      const k = Number(r.rows[0].n);
      covered += k;
      console.log(`[stats]   ${label.padEnd(9)} ${String(k).padStart(5)}`);
      prev = bytes;
    }
    const over = await pool.query('SELECT count(*) AS n FROM anlewo_save WHERE length(payload::text) > $1', [prev]);
    console.log(`[stats]   ≥ ${fmt(prev).padEnd(7)} ${String(Number(over.rows[0].n)).padStart(5)}`);
    covered += Number(over.rows[0].n);
    if (covered !== n) console.log(`[stats]   其余（含 0 字节以内边界） ${n - covered}`);

    const snap = await pool.query(
      `SELECT reason, count(*) AS n, coalesce(max(length(payload::text)), 0) AS max_chars
         FROM anlewo_save_snapshot GROUP BY reason ORDER BY reason`,
    );
    if (snap.rows.length === 0) console.log('[stats] 快照 0 行');
    for (const row of snap.rows) {
      console.log(`[stats] 快照 ${row.reason}: ${Number(row.n)} 行，最大一份 ${fmt(Number(row.max_chars))}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[stats] 失败：', err?.message ?? err);
  process.exitCode = 1;
});
