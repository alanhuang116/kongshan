#!/usr/bin/env node
/**
 * 按文件名顺序执行仓库里全部的 db/V*.sql（幂等），并逐份报告跑没跑成。
 *
 * 为什么要这个脚本：线上/测试机没有 psql 也能补表；而且它只读仓库里那些 SQL 文件，
 * 不内联任何 SQL 文本，也不打印任何连接串。
 *
 * 注意：V1 里有一条 `CREATE EXTENSION IF NOT EXISTS pgcrypto`（需要合适权限）。
 * 已经建过就是 no-op；权限不够会报错但不会中断后面的文件——错误逐条列出来。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';
import { createPool, ping } from './db.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(HERE, '..', '..', 'db');

/** 按版本号（V1、V2、V3…）排序，同版本号再按名字 */
function migrationFiles() {
  return readdirSync(DB_DIR)
    .filter((f) => /^V\d+__.+\.sql$/.test(f))
    .sort((a, b) => {
      const na = Number(a.slice(1).split('__')[0]);
      const nb = Number(b.slice(1).split('__')[0]);
      return na - nb || a.localeCompare(b);
    })
    .map((f) => join(DB_DIR, f));
}

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[migrate] 读配置失败：' + (err?.message ?? 'unknown'));
    process.exit(1);
  }

  let files;
  try {
    files = migrationFiles();
  } catch (err) {
    console.error(`[migrate] 读不到 ${DB_DIR}：${err?.message ?? 'unknown'}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error(`[migrate] ${DB_DIR} 里没有 V*.sql`);
    process.exit(1);
  }

  const pool = createPool(config);
  let failedFiles = 0;
  try {
    await ping(pool);
    for (const file of files) {
      const name = file.split(/[\\/]/).pop();
      let sql;
      try {
        sql = readFileSync(file, 'utf8');
      } catch (err) {
        console.error(`[migrate] ✗ ${name} 读不到：${err?.message ?? 'unknown'}`);
        failedFiles += 1;
        continue;
      }
      try {
        // 每份文件本身都是幂等的（IF NOT EXISTS / DROP THEN ADD），一把执行
        await pool.query(sql);
        console.log(`[migrate] ✓ ${name}`);
      } catch (err) {
        console.error(`[migrate] ✗ ${name}：${err?.message ?? 'unknown'}`);
        failedFiles += 1;
      }
    }

    // 回读关键对象，确认"跑过"与"真的在"一致
    const r = await pool.query(
      `SELECT to_regclass('public.anlewo_sync_key') IS NOT NULL AS sync_key,
              (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'anlewo_save_payload_size_chk') AS payload_chk`,
    );
    const row = r.rows[0] ?? {};
    console.log(`[migrate] anlewo_sync_key：${row.sync_key ? '在' : '缺！'}`);
    console.log(`[migrate] payload 上限约束：${row.payload_chk ?? '缺！'}`);
    if (!row.sync_key) failedFiles += 1;
  } catch (err) {
    console.error('[migrate] 失败：' + (err?.message ?? 'unknown'));
    failedFiles += 1;
  } finally {
    await pool.end().catch(() => {});
  }

  if (failedFiles > 0) {
    console.error(`[migrate] 有 ${failedFiles} 处没跑成，见上。`);
    process.exitCode = 1;
  } else {
    console.log('[migrate] 全部就绪（幂等，可重复执行）。');
  }
}

main().catch((err) => {
  console.error('[migrate] 崩了：' + (err?.message ?? 'unknown'));
  process.exit(1);
});
