-- ============================================================================
-- 安乐窝（kongshan）业务库核心表 —— 对应 docs/DB_SPLIT_FINAL.md v2.0
-- 目标库：yiwen_anlewo（独立 database，与身份库 yiwen_identity 同实例）
-- 身份锚点：yiwen_identity.users.user_id (uuid) —— V6__users_id_to_user_id 后真实列名 【待实机确认】
-- 业务接缝参考：yiwen_business.accounts.auth_user_id (uuid) 【待实机确认】
--
-- 三条身份轨（异地协作场景）：
--   轨 0 · 匿名期：provider='anon', status='anonymous', subject=local_uid 本身，
--          identity_uid 恒 NULL；凭证另存 anlewo_sync_key（只存 sha256，见 V2）。
--          本期同步层实际在用的就是这一条。
--   轨 A · 开发模式彩蛋：provider='dev',  subject=规范化用户名, uid = 确定性 dev_uid
--   轨 B · 统一身份认证：provider='oidc', subject=JWT sub, identity_uid=users.user_id
-- 各轨都落到同一张 identity_link 表，存档只认 local_uid，与身份实现解耦。
-- ============================================================================
-- 注意：CREATE DATABASE 不能在事务块内执行，也不在此脚本内；建库为独立运维步骤。
-- 本脚本在 yiwen_anlewo 库内执行，全部幂等，可重复运行。
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 表 1：身份关联表 —— 双轨映射的落点（用户要的"把 user_id 关联上"的表）
--   一行 = 一个本地主体(local_uid) ↔ 一个身份来源(provider + subject + identity_uid)
--   provider='dev'  → 开发模式彩蛋轨；subject=用户名；identity_uid 恒 NULL
--   provider='oidc' → 统一身份轨；subject=JWT sub；identity_uid=users.user_id
--   ★ 无跨库 FK：identity_uid 是逻辑外键（跨 database 无法建物理 FK），
--     引用完整性由应用层在验证 token 并拿到 user_id 后写入来保证。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anlewo_identity_link (
  local_uid     uuid        PRIMARY KEY,
  identity_uid  uuid,
  provider      text        NOT NULL,
  subject       text        NOT NULL,
  issuer        text,
  status        text        NOT NULL DEFAULT 'anonymous'
              CHECK (status IN ('anonymous','bound','merged','retired')),
  merged_to     uuid        REFERENCES anlewo_identity_link(local_uid) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  bound_at      timestamptz,
  retired_at    timestamptz,
  CONSTRAINT anlewo_identity_link_state_chk CHECK (
    CASE status
      WHEN 'anonymous' THEN identity_uid IS NULL AND bound_at IS NULL
      WHEN 'bound'     THEN identity_uid IS NOT NULL AND issuer IS NOT NULL AND bound_at IS NOT NULL
      WHEN 'merged'    THEN merged_to IS NOT NULL
      WHEN 'retired'   THEN retired_at IS NOT NULL
    END
  )
);

COMMENT ON COLUMN anlewo_identity_link.local_uid IS
  '本地稳定主体键；anlewo_save.user_id 存此值。存档只认它，与身份实现解耦。';
COMMENT ON COLUMN anlewo_identity_link.identity_uid IS
  '统一身份 yiwen_identity.users.user_id (uuid)。逻辑外键，无跨库物理 FK；由应用层验证 token 后写入。';
COMMENT ON COLUMN anlewo_identity_link.provider IS
  '身份来源：anon=匿名期（本期同步层在用，subject=local_uid）、dev=开发模式彩蛋轨（用户名）、oidc=统一身份认证轨、wechat_web/wechat_mp=微信。';

-- N:1 的**目标**：一个统一身份用户可对应多台设备/多轨的 local_uid —— 普通索引，非唯一
CREATE INDEX IF NOT EXISTS anlewo_identity_link_uid_idx
  ON anlewo_identity_link (identity_uid) WHERE identity_uid IS NOT NULL;
-- 防重复绑定：同一 (provider, issuer, subject) 只能对应一个 local_uid
-- dev 轨 issuer 用常量 'anlewo-dev'，oidc 轨用真实 issuer，互不冲突
-- ★ 本期是**1:1**：这条唯一索引把"一个身份只能绑一个 local_uid"钉死了，与上面 N:1 的
--   目标相冲突。要做"一个身份多台设备"时，必须先放宽这条索引（例如去掉它、改为
--   (provider, issuer, subject, local_uid) 唯一，或让新设备合并到已有 local_uid 而不是新建一行）。
CREATE UNIQUE INDEX IF NOT EXISTS anlewo_identity_link_subject_uq
  ON anlewo_identity_link (provider, issuer, subject)
  WHERE status IN ('bound','merged') AND subject IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 表 2：存档主表 —— 整包 JSONB 单表 + 服务端 revision CAS
--   user_id = local_uid；不建 schema_v；不建 journal 长度 CHECK（load 读入不封顶）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anlewo_save (
  user_id       uuid        PRIMARY KEY
              REFERENCES anlewo_identity_link(local_uid) ON DELETE RESTRICT,
  revision      bigint      NOT NULL DEFAULT 1 CHECK (revision > 0),
  payload       jsonb       NOT NULL,
  client_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anlewo_save_payload_object_chk CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT anlewo_save_payload_size_chk   CHECK (length(payload::text) <= 262144)
);
CREATE INDEX IF NOT EXISTS anlewo_save_updated_idx ON anlewo_save (updated_at DESC);
COMMENT ON COLUMN anlewo_save.payload IS
  '与 src/app/store.ts 的 Saved（20 字段）1:1 原样往返；服务端不解析 world 的 8 份 ns。恢复时必须过 load() 等价校验。';

-- ----------------------------------------------------------------------------
-- 表 3：笔迹表 —— 只存客户端能提供的"当前未写完一篇"
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anlewo_ink (
  user_id      uuid        NOT NULL
             REFERENCES anlewo_identity_link(local_uid) ON DELETE RESTRICT,
  piece_hash   text        NOT NULL CHECK (piece_hash ~ '^[0-9a-f]{64}$'),
  piece_key    text        NOT NULL CHECK (octet_length(piece_key) <= 2048),
  chars        jsonb       NOT NULL,
  char_total   integer     NOT NULL DEFAULT 0 CHECK (char_total >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, piece_hash),
  CONSTRAINT anlewo_ink_chars_array_chk CHECK (jsonb_typeof(chars) = 'array'),
  CONSTRAINT anlewo_ink_chars_size_chk   CHECK (length(chars::text) <= 1048576),
  CONSTRAINT anlewo_ink_char_total_chk   CHECK (
    CASE WHEN jsonb_typeof(chars) = 'array'
         THEN char_total = jsonb_array_length(chars)
         ELSE true END
  )
);
CREATE INDEX IF NOT EXISTS anlewo_ink_user_updated_idx ON anlewo_ink (user_id, updated_at DESC);

-- ----------------------------------------------------------------------------
-- 表 4：有界快照表（reason='pre_bind' 支持 dev 轨 → oidc 轨绑定回滚）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anlewo_save_snapshot (
  snapshot_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid        NOT NULL
             REFERENCES anlewo_identity_link(local_uid) ON DELETE RESTRICT,
  revision     bigint      NOT NULL CHECK (revision > 0),
  payload      jsonb       NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  reason       text        NOT NULL DEFAULT 'sync'
             CHECK (reason IN ('sync','pre_bind','migration','manual')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, revision, reason)
);
CREATE INDEX IF NOT EXISTS anlewo_save_snapshot_user_time_idx
  ON anlewo_save_snapshot (user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 表 5：设备台账
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anlewo_device (
  device_id     uuid PRIMARY KEY,
  user_id       uuid        NOT NULL
              REFERENCES anlewo_identity_link(local_uid) ON DELETE RESTRICT,
  kind          text        NOT NULL DEFAULT 'web'
              CHECK (kind IN ('web','ios','android','unknown')),
  label         text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS anlewo_device_user_idx ON anlewo_device (user_id);
