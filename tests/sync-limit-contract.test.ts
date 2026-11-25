/**
 * 存档上限的契约守卫：客户端门槛、服务端常量、库里的 CHECK、请求体上限、Ingress 的 body-size
 * 散在五个文件里，改一处漏一处都会变成「大档永远推不上去，而界面只留一行 console.debug」。
 *
 * 期望值全部从这些文件里读，所以放宽一次上限只需改那五处，不用回来改测试。
 *   - 客户端：SYNC_PUSH_LIMIT（src/app/sync/state.ts），也允许比服务端小（宁可少用额度）
 *   - 服务端：MAX_PAYLOAD_BYTES（server/sync/db.mjs），必须等于库里的 CHECK
 *   - 库：db/ 下最高版本里那条 `anlewo_save_payload_size_chk` 的数字
 *   - 请求体：BODY_LIMIT 默认值必须大于存档上限（JSON 转义还会胖一圈）
 *   - Ingress：proxy-body-size 必须不小于 BODY_LIMIT，否则 413 先出在反代
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

function pick(text: string, re: RegExp, what: string): number {
  const m = text.match(re);
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(n)) throw new Error(`找不到 ${what}`);
  return n;
}

/** 上限那条 CHECK 在最高版本的迁移脚本里（V1 的 256KB、V3 的 1MB 都是历史实读，不算数） */
function latestLimitSql(): { file: string; bytes: number } {
  const files = readdirSync(new URL('../db/', import.meta.url))
    .filter((f) => /^V\d+__.*\.sql$/.test(f))
    .sort((a, b) => Number(a.slice(1).split('__')[0]) - Number(b.slice(1).split('__')[0]));
  for (const f of files.reverse()) {
    const sql = read(`db/${f}`);
    if (!/anlewo_save_payload_size_chk/.test(sql) || !/ADD CONSTRAINT\s+anlewo_save_payload_size_chk/.test(sql)) continue;
    return { file: f, bytes: pick(sql, /anlewo_save_payload_size_chk\s+CHECK\s*\(\s*length\(payload::text\)\s*<=\s*(\d+)\s*\)/, `${f} 里的上限数字`) };
  }
  throw new Error('db/ 里找不到带 anlewo_save_payload_size_chk 的 ADD CONSTRAINT');
}

const clientLimit = pick(read('src/app/sync/state.ts'), /SYNC_PUSH_LIMIT\s*=\s*(\d+)/, 'state.ts 的 SYNC_PUSH_LIMIT');
const serverLimit = pick(read('server/sync/db.mjs'), /MAX_PAYLOAD_BYTES\s*=\s*(\d+)/, 'db.mjs 的 MAX_PAYLOAD_BYTES');
const bodyLimit = pick(read('server/sync/config.mjs'), /int\(env\.BODY_LIMIT,\s*(\d+)/, 'config.mjs 的 BODY_LIMIT 默认值');
const ingressMb = pick(read('deploy/k8s/deployment.yaml.tmpl'), /proxy-body-size:\s*(\d+)m/, 'Ingress 的 proxy-body-size');

describe('存档上限：五处必须对得上', () => {
  it('库里的 CHECK 与服务端常量一致', () => {
    const db = latestLimitSql();
    expect(`${db.file} = ${db.bytes}`).toBe(`${db.file} = ${serverLimit}`);
  });

  it('客户端门槛不超过服务端（超过就只是白撞 413）', () => {
    expect(clientLimit).toBeLessThanOrEqual(serverLimit);
  });

  it('请求体上限大于存档上限（JSON 转义会胖一圈）', () => {
    expect(bodyLimit).toBeGreaterThan(serverLimit);
  });

  it('Ingress 的 proxy-body-size 不小于请求体上限（否则 413 出在反代）', () => {
    expect(ingressMb * 1024 * 1024).toBeGreaterThanOrEqual(bodyLimit);
  });
});
