-- ============================================================================
-- V2 · 匿名期的同步凭证 —— 对应 docs/DB_SPLIT_FINAL.md v2.0 §7 契约 C1
--
-- 为什么单独一张表：
--   C1 规定 local_uid 只作标识（存档外键锚点），**不得同时作凭证**——
--   否则"知道 uuid 就是本人"，任何拿到 uid 的人都能改别人的存档。
--   匿名阶段还没有统一身份 token，所以需要一把与 uid 分离的凭证；
--   库里只存它的 sha256，明文只在客户端与请求头里出现。
--
-- 绑定统一身份之后：provider 变成 'oidc'、status 变成 'bound'，
-- 这张表里的凭证自动降级为"设备凭证"（认得这台机器，不再单独代表身份），
-- 所以不做删除、也不做轮换期清理。
--
-- 本脚本幂等（IF NOT EXISTS），可重复执行；须在 V1 之后、同一个库 yiwen_anlewo 内执行。
-- ============================================================================

CREATE TABLE IF NOT EXISTS anlewo_sync_key (
  -- 一个 local_uid 只有一把凭证；凭证明文由客户端生成（32 字节随机，base64url）
  local_uid  uuid PRIMARY KEY REFERENCES anlewo_identity_link(local_uid) ON DELETE RESTRICT,
  -- sha256(sync_key) 的十六进制小写；长度与字符集都在库里卡住，免得存进明文或半截值
  key_hash   text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);

COMMENT ON TABLE anlewo_sync_key IS
  '匿名期的同步凭证：只存 sha256(key)，不存明文。绑定统一身份后降级为设备凭证（provider=oidc / status=bound 时不再单独代表身份）。';
COMMENT ON COLUMN anlewo_sync_key.key_hash IS
  'sha256(sync_key) 的小写十六进制；服务端比对时用定长比较，不存、不记、不回显明文。';
COMMENT ON COLUMN anlewo_sync_key.rotated_at IS
  '换过凭证的时刻（本期不实现轮换流程，留列以便将来加）。';
