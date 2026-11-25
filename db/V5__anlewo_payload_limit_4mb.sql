-- ============================================================================
-- V5 · 存档整包上限 1MB → 4MB —— 与前端 src/app/sync/state.ts 的 SYNC_PUSH_LIMIT、
--      服务端 db.mjs 的 MAX_PAYLOAD_BYTES 三处必须一致（任何一处小了，都会变成
--      "大一点的档永远推不上去，而界面只留一行 console.debug"）。
--
-- 为什么再放宽：journal 在 src/app/store.ts 里封顶 3000 条（slice(-3000)），
-- 单条 text 是随事记下的一句话；3000 条 × 100 个汉字 ≈ 1.03MB，正好压在原来
-- 1MB 的线上，玩得久又爱记事的人会撞上（压测 3000 条 × 160 字 = 1.43MB）。
-- payload 是整包 JSONB、服务端不解析，放宽只动约束，不动表结构。
--
-- 为什么停在 4MB：存档本体在 localStorage（同源配额约 5MB），再往上放宽本地先
-- 存不下、放宽也没意义；4MB 的 JSON 若全是汉字约 1.4M 字，按 UTF-16 存储约 2.8MB。
--
-- 注意：jsonb 的 length(payload::text) 是**字符数**，不是字节数；服务端另按 UTF-8
-- 字节数把关（更严），所以两边不会互相打架。
-- 请求体上限（server/sync/config.mjs 的 BODY_LIMIT）与 Ingress 的
-- proxy-body-size 必须同时大于本值，否则 413 会先出在反代/服务端那一层。
--
-- 幂等：先 DROP IF EXISTS 再 ADD，可重复执行。须在 V1 之后执行。
-- 回滚：把本文件的 4194304 改回 1048576 再执行一次（库里若已有超过 1MB 的行，
--       ADD CONSTRAINT 会失败——先清理或保留现状）。
-- ============================================================================

ALTER TABLE anlewo_save DROP CONSTRAINT IF EXISTS anlewo_save_payload_size_chk;

ALTER TABLE anlewo_save
  ADD CONSTRAINT anlewo_save_payload_size_chk CHECK (length(payload::text) <= 4194304);

COMMENT ON CONSTRAINT anlewo_save_payload_size_chk ON anlewo_save IS
  '整包上限 4MB（V5 起；V1 是 256KB、V3 是 1MB）。与前端 SYNC_PUSH_LIMIT、服务端 MAX_PAYLOAD_BYTES 必须一致。';
