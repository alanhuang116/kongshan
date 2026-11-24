-- ============================================================================
-- V3 · 存档整包上限 256KB → 1MB —— 与前端 index.ts 的 MAX_PUSH_BYTES、
--      服务端 db.mjs 的 MAX_PAYLOAD_BYTES 三处必须一致（任何一处不同都会让
--      "大一点的存档永远推不上去"，而且只在 console.debug 里留一行）。
--
-- 为什么放宽：Saved 是 20 字段整包，其中 journal 最多留 3000 条、world 按名字收
-- 世界的 8 份存档；一个玩得久的档超过 256KB 是正常的。原来的 262144 会让这类用户
-- 静默失去备份（413 payload_too_large → 前端只记日志）。
--
-- 注意：jsonb 的 length(payload::text) 是**字符数**，不是字节数；服务端另按 UTF-8
-- 字节数把关（更严），所以两边不会互相打架。
--
-- 幂等：先 DROP IF EXISTS 再 ADD，可重复执行。须在 V1 之后执行。
-- 回滚：把本文件的两处 1048576 改回 262144 再执行一次即可（但要注意库里可能已有
--       超过 256KB 的行，届时 ADD CONSTRAINT 会失败——先清理或保留现状）。
-- ============================================================================

ALTER TABLE anlewo_save DROP CONSTRAINT IF EXISTS anlewo_save_payload_size_chk;

ALTER TABLE anlewo_save
  ADD CONSTRAINT anlewo_save_payload_size_chk CHECK (length(payload::text) <= 1048576);

COMMENT ON CONSTRAINT anlewo_save_payload_size_chk ON anlewo_save IS
  '整包上限 1MB（V3 起；V1 是 256KB）。与前端 MAX_PUSH_BYTES、服务端 MAX_PAYLOAD_BYTES 必须一致。';
