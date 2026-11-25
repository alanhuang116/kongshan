# 安乐窝（kongshan）数据库拆分与统一身份接缝设计 —— 红蓝对抗终版 v2.0

> **本文是唯一终版**，取代此前 7 份设计稿（`SAVE_CLOUD_PRD.md` / `SAVE_DB_DESIGN.md` / `SAVE_INTEGRATION.md` / `SAVE_QA_PLAN.md` / `PERSISTENCE_AUDIT.md` / `PERSIST_QA_REPORT.md` / `PERSIST_FINAL_PLAN.md`）和 v1.0 的"跨库物理/逻辑外键 A/B 二选一"。
>
> - 生成方式：软件专家团三模型**红蓝对抗**——蓝方（架构师·建设/防御）、红方（QA·攻击/挑刺）、第三方（工程师·落地可行性），三方**独立产出、互不共享**，主理人（交付总监）交叉裁决去重定级后收敛为 v1.0；**v2.0 依据用户澄清与实读身份接口契约重构接缝章**。
> - 裁决判据优先级：**需求字面满足 ＞ 技术客观边界 ＞ 不改变游戏功能（红线一票否决）＞ 丢数据 ＞ 越权 ＞ 可逆性/成本**。
> - **用户需求锚点（v2.0 定案）**：拆分数据库；**接缝 = 应用层请求统一身份认证获取 token → 获取用户信息拿到用户 id → 业务库用一张关联表把存档与这个 user_id 关联上**；**不要求跨库外键**；先不实际集成。
> - 日期：2026-11-24

---

## 0. 一句话结论（TL;DR）

> **库按"身份库不动、业务独立成库、库内不拆 schema"切；存档延续整包 JSONB 单表（不分 world、不建 GIN）。**
>
> **接缝不再是"跨库外键"，而是三层：① 应用层走标准 OIDC（token → `/userinfo`）拿到统一身份 `users.id(uuid)`；② 业务库 `anlewo_identity_link` 关联表把本地稳定键 `local_uid` 与这个 `identity_uid` 写进同一行，完成"用户对应"；③ 存档表 `anlewo_save.user_id` 指向 `local_uid`，从而经关联表间接关联到统一身份 user_id。全程无跨库 FK、无身份库写入。**
>
> **本期交付性质：DDL 结构预留 + OIDC 对接契约定义；运行时零改动、零数据搬迁、身份对接默认关闭。** 不交付可运行登录闭环、不交付数据搬迁、不交付 token 换取代码。

---

## 1. 事实基线（实读纠正后，非历史文档的原样采信）

### 1.1 业务侧（三方实读纠正）

| # | 历史稿/蓝方表述 | 实读纠正 | 证据 |
|---|---|---|---|
| F1 | `Saved` 17 字段 | **21 字段**（含 `v`）：v/time/weather/season/master/muted/sound/haptics/quality/visits/journal/found/walked/runTold/world/flow/day/spot/guided/flowChosen/**masterChosen**（main cccc786 新增） | `src/app/store.ts:27-67` |
| F2 | world 6 或 7 份 | **实际 8 份**：day / stars / bagSeen / bag / farm / play / beasts / folk；`mem.ts:9` 注释只列 6 个已过时 | `Anlewo.ts:178,304,623`、`bag.ts:150,168`、`farm/index.ts:76,137`、`play/kit.ts:68`、`acts/beasts.ts:139`、`acts/favor.ts:224` |
| F3 | 身份库名 `yiwen_identity` | **代码默认是 `identity`**（application.yml:11、.env.example、docker-compose 均 `POSTGRES_DB: identity`）；`yiwen_` 前缀在生产是否被 override **未证实** | `yiwen-identity/.../application.yml:11` 等 |
| F4 | `journal` 用 `.slice(-3000)` 封顶 | **只在 `addEntry` 写入路径封顶；`load()` 读入不封顶** ⇒ 历史/手改存档可 >3000 条，服务端若上 3000 CHECK 会**误伤合法存档** | `store.ts:114` vs `store.ts:138` |
| F5 | PNG 可由 `chars` 经 `renderPiece` 重建 | **字形可复现**（`drawStrokes` 种子 `s.length*7919` 确定性），但 `today().lunar`（换日变）+ `Math.random()` 纸纤维 + `cell` 尺寸 ⇒ **同一张 PNG 不可逐字节重建**；`last`/`piece` 只在内存，刷新即丢 | `brush.ts:16-24`、`Copy.tsx:47-78,29,91` |
| F6 | 笔迹"只能救当前一篇" | 更严：只能救**尚未写完**的一篇；`load()` 条件 `chars.filter(Boolean).length < total` 使已完成篇刷新后变空 | `Copy.tsx:19-25` |
| F7 | 同游身份无 uid/token（成立） | 补充：`on` 默认 **true**（`o.on !== false`）⇒ 同游默认开、身份对接默认关是**两套独立开关**，不得复用 | `src/world/net/identity.ts:7-8` |
| F8 | 历史稿"将来补物理 FK" | 独立库跨 database 永远不能建 FK；foreign table 也不能作 FK 目标 ⇒ **本期定案走应用层对接，彻底不作跨库 FK 设计**（v2.0 变更） | PostgreSQL 硬限制 |
| F9 | 历史 7 份稿已落地 | **0 落地**：当前 `server/` 只有 `package.json`（kongshan-relay，仅 `ws@8.23.0`）+ `proto.json` + relay/core/check `.mjs`；无 `.sql`、无 pg 依赖、无 POST 路由、无 CORS | `kongshan/server/` 全目录 |

### 1.2 统一身份接口契约（v2.0 新增实读，接缝的直接依据）

| # | 事实 | 证据 |
|---|---|---|
| F10 | `GET /.well-known/openid-configuration` 公布：`token_endpoint=/oauth2/token`、`userinfo_endpoint=/userinfo`、`jwks_uri=/oauth2/jwks`；授权类型含 `authorization_code`/`refresh_token`/`client_credentials`；PKCE 支持 `S256`；scope `openid/profile/email` | `auth/DiscoveryController.java:19-37` |
| F11 | `GET /userinfo` + `Authorization: Bearer <access_token>` → `{"user": {id, name, email, identities}}`；**`user.id` 就是 `users.id(uuid)`**；校验：issuer 必须等于配置值、`sub` 必须能 `UUID.fromString`、`openid` scope、用户 `status=active`、每分钟 600 次限流 | `auth/UserInfoController.java:35-62`、`user/UserView.java:7-10` |
| F12 | JWT 的 **`sub` = `user.getId().toString()`**；`/userinfo` 也按 `UUID.fromString(jwt.getSubject())` 查用户 ⇒ `identity_uid` 既可从 `/userinfo.user.id` 获取，也可从校验后的 `id_token.sub` 解析，**两者同值** | `auth/TokenIssuanceService.java:66,84,164`、`UserInfoController.java:44` |
| F13 | 自建 `POST /login`（email+password）响应**直接带 `user` 对象**（含 id），但属密码直传；标准 OIDC（`authorization_code` + PKCE）走 `/oauth2/authorize` → `/oauth2/token`，随后用 Bearer 调 `/userinfo` | `auth/LoginController.java:37-57`、`TokenIssuanceService.java:97-105` |
| F14 | **已注册 client 仅 `zhiji` / `liuyao` / `identity-admin`**，`audience()` 只覆盖 zhiji/liuyao；**没有 anlewo**。要对接必须新增 client（改 `OAuthClients.java` + `application.yml` 的 `clients` + 部署 secret） | `config/OAuthClients.java:15-37`、`application.yml:21-34` |
| F15 | 已有业务系统对接范例：`liuyao` 的 `/api/auth/profile` 就是 `Bearer token → GET /userinfo → 读 user 字段`，带 15s 超时、失败降级、不改 UI | `liuyao/src/app/api/auth/profile/route.ts:14-18` |

**其它已核实事实**：
- 统一身份 `users(id uuid PK)`、`user_identities(user_id uuid REFERENCES users(id) ON DELETE CASCADE)`、`wechat_unions(user_id uuid REFERENCES users(id))`；**uuid 是接缝的唯一类型锚点**。
- `crypto.randomUUID()` 仅 secure context 可用（`https`/`localhost` 可用，`http://10.0.0.10:3800` 下为 `undefined`），需兜底。
- relay 的 `originOk()` 只管 WS upgrade，不能复用为同步 API 的 CORS。

---

## 2. 红蓝对抗交叉裁决表（v2.0 更新）

裁决原则：三方独立得出、互不共享；主理人按判据优先级去重。表中"最终裁决"即本文采纳结论；**▲ 行为 v2.0 依用户澄清变更**。

| # | 争议命题 | 蓝方 | 红方 | 第三方 | **最终裁决** |
|---|---|---|---|---|---|
| 1▲ | "外键"字面要求怎么满足 | 独立库 + uuid 逻辑对齐 | P0：字面被偷换，须 A/B 二选一 | DDL-only 即可，但须正名 | **用户定案（v2.0）：A/B 跨库之争作废。走应用层 OIDC 对接拿 user_id，业务库关联表记录对应——不跨库、不做物理 FK。见 §5** |
| 2▲ | P4 "NOT VALID 补物理 FK" | 列为可选 | P0：独立库下无对象可指 | F8：永远不可行 | **三方一致 + v2.0 确认：删除该承诺**。跨库 FK 永不可能，引用完整性由应用层 + 关联表保证 |
| 3 | 服务端鉴权契约 | 完全没写 | P0：uid 三合一 + 接续码 = 能力泄露 | 补充 bearer secret | **采纳**：本期 DDL-only 无运行时，但 §7 锁定"未来同步层以 OIDC token 为凭证、uid 仅作标识"为硬契约 |
| 4 | `journal<=3000` CHECK | 加 | P1：NULL 绕过，须加 typeof 守卫 | M4：load 不封顶，CHECK 会误伤合法存档 | **采纳第三方（更保守）**：直接**删除**该 CHECK |
| 5 | ON DELETE 策略 | save=RESTRICT / 其余=CASCADE | P1：删 link 死锁，merged 清理矛盾 | M5：统一软删除 | **三方一致**：全表 `ON DELETE RESTRICT` + link 用 `retired_at` 软删除 |
| 6▲ | identity_uid 唯一索引 | 无条件唯一 | P1：merged 一对多被唯一索引拒绝 | M6：索引加谓词 | **v2.0 调整**：关联表支持 **N 个 `local_uid` → 1 个 `identity_uid`**（一个用户多台设备），`identity_uid` 上建**普通索引（非唯一）**；`subject` 唯一索引仍保留防重复绑定 |
| 7 | 整包 JSONB 无 CAS | 只列 revision 列 | P1：多设备静默丢档，无冲突契约 | M11：revision 须服务端分配 | **采纳**：§7 锁定 CAS 更新规则 + 冲突契约（本期不实现代码） |
| 8 | "失败静默" vs FK 强约束 | 未处理 | P1：link 静默失败后写 save 触发 FK 报错 | 同 | **采纳**：§7 锁定 link+save 同事务，失败整笔不写、本地保留脏标记 |
| 9 | 字段级落位映射 | 只定义表结构 | P1：没映射，"拆分"是空壳 | 补充键位映射 | **采纳**：§3.2 数据落位映射表 |
| 10 | 接续码 | 本期实现 base64url+校验 | P1：伪安全+越界，须含 secret | S1：延后；S2：视为 bearer secret | **采纳**：本期**不实现**；§7 记录将来安全约束 |
| 11 | `schema_v` 列 vs `payload.v` | 两者并存 | — | M8：双源真相，建议删列 | **采纳**：删除 `schema_v` 列，只信 `payload.v` |
| 12 | `piece_key` 全文当 PK | text PK | — | M7：btree 2704 字节上限 | **采纳**：改 `piece_hash`(sha256 hex) 作 PK，原文 `piece_key` 保留但不索引 |
| 13 | 5 表一次性建 | 全建 | P2：偏重，device 无消费者 | M10：快照无清理主体 | **折中**：DDL 全给，分两批执行（首批 link/save/ink，第二批 snapshot/device） |
| 14 | DDL 幂等性 | 无 IF NOT EXISTS | P2 | M9/M13：重跑即失败 | **采纳**：全部 `IF NOT EXISTS`，约束用 `DO $$` 包裹；建库/角色/备份列为独立运维项 |
| 15 | 整包 JSONB 不分 world | 主张保留 | 未反对 | S10：world 实际 8 份且变化 | **三方一致保留**：不分 world、不建 GIN |
| 16 | 裸 uuid vs `anon:` 前缀 | 裸 uuid | P2：值不携带类型信息 | 认同裸 uuid | **保留裸 uuid**：值纯净才能作锚点；类型由 `link.status` 承载 |

**三方共识 Top 3**：① 整包 JSONB 不分 world 是正确取舍（8 份且变化）；② 本次只是 DDL 预留，不能声称"已完成拆分"；③ 跨库物理 FK 不可行（v2.0 后由应用层 OIDC 对接彻底绕开）。

---

## 3. 拆分方案总纲

### 3.1 库边界

| 存储 | 用途 | 现状 | 本次动作 |
|---|---|---|---|
| `identity`（**库名待实机确认**，本文暂记 `yiwen_identity`） | users / user_identities / wechat_unions / oauth2_* | 已存在，Spring Flyway 独占管理 | **零写入、零建表、零读表**。身份对接**只通过 OIDC HTTP 接口**（`/userinfo`），不碰库 |
| `yiwen_anlewo`（**库名待确认**） | 存档、笔迹、身份关联表、同步元数据 | 不存在 | **新建**；独立 Flyway 迁移线 `V1__anlewo_core.sql` |
| Redis | 限流/幂等键（短 TTL） | 身份服务已用 | 同步层启用后才用；**游戏状态绝不入 Redis** |
| `kongshan/server` 同游 relay | WebSocket 中转 | 已上线、无状态、无密钥 | **一行不改**，不接库、不接身份 |

> **v2.0 删除** v1.0 的"方案 A：业务表放身份库 schema=anlewo"备选——用户已定案走应用层对接，不做跨库 FK，无需把业务表塞进身份库。

**边界论证**：
1. **所有权**：身份库由另一 Spring 服务的 Flyway 管；业务侧加一列就制造跨团队发布耦合。独立库 = 独立备份/恢复/迁移节奏。
2. **故障域**：单机玩法是红线；业务库不可用时身份库必须无感，反之亦然。
3. **不集成 = 不落库、不连库**：现在往身份库写任何一行都等于变相集成；身份对接只走 HTTP `/userinfo`，且默认关闭。
4. **库内不拆 schema**：业务库只有 3~5 张表且同属一个域，拆 schema 只增加复杂度，零隔离收益。

### 3.2 数据落位映射表（本次"拆分"的实质内容）

| 本地键 / 数据源 | 内容 | 落位 | 本期动作 |
|---|---|---|---|
| `anlewo:v1`（`Saved` 21 字段） | v/time/weather/season/master/muted/sound/haptics/quality/visits/journal/found/walked/runTold/**world(8 份)**/flow/day/spot/guided/flowChosen/**masterChosen** | `anlewo_save.payload` **整包原样** | 结构预留；**不搬迁、不上传** |
| `anlewo:write:v1` | `{key, chars[]}`——仅"当前尚未写完的一篇" | `anlewo_ink`（`piece_hash` + `chars` 原样） | 结构预留；诚实声明已完成篇与 PNG 无法补录 |
| `anlewo:net:v1` | 雅号 / 衣色 / 同游开关（`on` 默认 true） | **不入库** | 保持 localStorage；同游身份与 uid 暂不打通 |
| （未来）统一身份 `users.id` | 来自 OIDC `/userinfo.user.id` | `anlewo_identity_link.identity_uid` | **本期不写**；对接启用时才填，见 §5 |
| （未来）`anlewo:id:v1` | `{v, uid}` 本地稳定主体键 | `anlewo_identity_link.local_uid` / `anlewo_save.user_id` | **本期不生成**；同步层启用时才建 |
| `src/data/*` 静态字典、每帧瞬态、派生计算、音频缓存 | — | **不落盘、不入 Redis** | 延续 `PERSISTENCE_AUDIT.md` 的 D 类结论 |

> **关键**：`payload` 与原 `Saved` 一一对应，服务端**不解析、不重塑**任何字段；恢复到客户端时**必须再过一遍 `load()` 等价校验**（会丢弃非法 journal 项、dedupe `found`、过滤 world 中 null/函数、按 flowChosen 重写 flow），**禁止 `Object.assign` 直接灌入游戏状态**。

---

## 4. 完整 DDL（方案：独立库 + 应用层对接关联表）

> 全部在业务库执行。`identity` 库零变更。**首批**（本期执行）：link / save / ink；**第二批**（同步层启用后再建）：snapshot / device。
> 全部 `IF NOT EXISTS`；约束用 `DO $$` 包裹以便重跑。时间戳统一 `timestamptz`。

```sql
-- ============================================================
-- 前置（PG13+ 已内置 gen_random_uuid，此扩展仅为兼容）
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 表 1（首批）：身份关联表 —— 用户要的"把 user_id 关联上"的那张表
--   一行 = 一个本地主体(local_uid) ↔ 一个统一身份用户(identity_uid)的对应
--   本期：只有 local_uid（匿名），identity_uid 恒 NULL、status='anonymous'
--   将来：应用层 token→/userinfo 拿到 user.id，upsert 本行填 identity_uid，status='bound'
--   ★ 无跨库 FK：identity_uid 是逻辑外键，引用完整性由应用层保证（见 §5）
-- ============================================================
CREATE TABLE IF NOT EXISTS anlewo_identity_link (
  local_uid     uuid        PRIMARY KEY,              -- 本地稳定主体键；anlewo_save.user_id 存此值
  identity_uid  uuid,                                  -- 统一身份 users.id(uuid)，来自 /userinfo.user.id 或 id_token.sub
  provider      text,                                  -- 'oidc' | 'wechat_web' | 'wechat_mp'
  issuer        text,                                  -- OIDC issuer（建议写死常量，勿用随环境变的 URL 作业务键）
  subject       text,                                  -- JWT sub（通常 = identity_uid 的字符串形式）
  status        text        NOT NULL DEFAULT 'anonymous'
              CHECK (status IN ('anonymous','bound','merged','retired')),
  merged_to     uuid        REFERENCES anlewo_identity_link(local_uid) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  bound_at      timestamptz,
  retired_at    timestamptz,
  CONSTRAINT anlewo_identity_link_state_chk CHECK (
    CASE status
      WHEN 'anonymous' THEN identity_uid IS NULL AND bound_at IS NULL
      WHEN 'bound'     THEN identity_uid IS NOT NULL AND provider IS NOT NULL
                            AND issuer IS NOT NULL AND subject IS NOT NULL
                            AND bound_at IS NOT NULL
      WHEN 'merged'    THEN merged_to IS NOT NULL
      WHEN 'retired'   THEN retired_at IS NOT NULL
    END
  )
);
-- N:1：一个统一身份用户可对应多台设备的 local_uid ⇒ 普通索引，非唯一
CREATE INDEX IF NOT EXISTS anlewo_identity_link_uid_idx
  ON anlewo_identity_link (identity_uid) WHERE identity_uid IS NOT NULL;
-- 防重复绑定：同一 (provider, issuer, subject) 只能对应一个 local_uid
CREATE UNIQUE INDEX IF NOT EXISTS anlewo_identity_link_subject_uq
  ON anlewo_identity_link (provider, issuer, subject)
  WHERE status IN ('bound','merged') AND subject IS NOT NULL;
COMMENT ON COLUMN anlewo_identity_link.identity_uid IS
  '统一身份 users.id(uuid)。由应用层 Get /userinfo 的 user.id 写入；跨 database 无法建物理 FK，引用完整性由应用层在验证 token 后保证。';
COMMENT ON COLUMN anlewo_identity_link.local_uid IS
  '本地稳定主体键：客户端 crypto.randomUUID() 生成，一次生成永不轮换；存档按此键读写，绑定身份后此值不变。';

-- ============================================================
-- 表 2（首批）：存档主表 —— 整包 JSONB 单表 + 服务端 revision CAS
--   user_id = local_uid，经表 1 间接关联到统一身份 identity_uid
--   不建 schema_v 列（只信 payload.v）；不建 journal 长度 CHECK（会误伤 load 不封顶的合法存档）
-- ============================================================
CREATE TABLE IF NOT EXISTS anlewo_save (
  user_id       uuid        PRIMARY KEY
              REFERENCES anlewo_identity_link(local_uid) ON DELETE RESTRICT,
  revision      bigint      NOT NULL DEFAULT 1 CHECK (revision > 0),  -- 服务端单调分配，绝不用 payload.v / updated_at
  payload       jsonb       NOT NULL,
  client_id     uuid,                                                 -- 预留幂等键；本期不启用
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anlewo_save_payload_object_chk CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT anlewo_save_payload_size_chk   CHECK (length(payload::text) <= 262144)  -- 256KB 硬上限
);
CREATE INDEX IF NOT EXISTS anlewo_save_updated_idx ON anlewo_save (updated_at DESC);
COMMENT ON COLUMN anlewo_save.payload IS
  '与 src/app/store.ts 的 Saved（21 字段，含 v）1:1 原样往返；服务端不解析字段（含 world 的 8 份 ns）。恢复时必须过 load() 等价校验。';

-- ============================================================
-- 表 3（首批）：笔迹表 —— 只存客户端能提供的"当前未写完一篇"
-- ============================================================
CREATE TABLE IF NOT EXISTS anlewo_ink (
  user_id      uuid        NOT NULL
             REFERENCES anlewo_identity_link(local_uid) ON DELETE RESTRICT,
  piece_hash   text        NOT NULL CHECK (piece_hash ~ '^[0-9a-f]{64}$'),  -- sha256(piece_key)
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

-- ============================================================
-- 表 4（第二批·同步层启用后建）：有界快照表
-- ============================================================
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

-- ============================================================
-- 表 5（第二批·同步层启用后建）：设备台账
-- ============================================================
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
```

**DDL 相对蓝方的修正**（全部来自红方/第三方 + v2.0）：删 `schema_v`、删 journal CHECK、ON DELETE 全 RESTRICT、`identity_uid` 改普通索引支持 N:1、`subject` 加唯一防重绑、`piece_hash` 替全文 PK、chars 加元素/数量/大小约束、全表 `IF NOT EXISTS`、状态 CHECK 分状态定义必填集 + `merged_to`、列名 `anon_uid/canonical_uid` → `local_uid/identity_uid`（v2.0，贴合"应用层拿 user_id 关联"语义）。

---

## 5. 统一身份对接与关联机制（v2.0 核心 · 定案：应用层对接，不跨库）

### 5.1 为什么放弃跨库外键，改走应用层

- 用户澄清："**可以请求统一身份认证获取 token、获取用户信息完成用户对应，并不要求跨库，但要有张表记录存档把 user_id 关联上。**"
- PG 事实：`REFERENCES` 只能指向同库表（可跨 schema），**不能跨 database/实例**；foreign table 不能作 FK 目标。**跨库物理外键本来就不成立**（F8）。
- 因此 v1.0 的"A（同库 schema 真 FK）/ B（独立库逻辑缝）二选一"是伪选择——用户明确选**第三条**：身份在应用层认（OIDC HTTP），库里只留对应关系。这样身份库零改动、业务库零跨库依赖，同时"存档关联 user_id"由一张真实的表承载。

### 5.2 对接契约（基于实读接口，非假设）

**端点与凭据**（`DiscoveryController` / `OAuthClients` / `application.yml`）：

| 项 | 值 / 来源 |
|---|---|
| discovery | `GET {issuer}/.well-known/openid-configuration` |
| 授权端点 | `GET {issuer}/oauth2/authorize`（`response_type=code`、`code_challenge_method=S256`） |
| token 端点 | `POST {issuer}/oauth2/token`（`client_secret_basic`，grant=`authorization_code`） |
| 用户信息端点 | `GET {issuer}/userinfo`（`Authorization: Bearer <access_token>`，需 `openid` scope） |
| 需要的 client | **新增 `anlewo`**（现仅 zhiji/liuyao/identity-admin）；secret 由部署注入，不入库、不进前端 |
| issuer | `IDENTITY_ISSUER` 环境变量；生产值**待确认**（U3），不可写死 localhost |

**拿 user_id 的两种方式（同值，F12）**：
1. 主路径：`GET /userinfo` → `body.user.id`（uuid）——与用户描述一致，也是 liuyao 已在用的模式（F15）。
2. 备选：校验 JWT 后取 `id_token.sub`（= `users.id.toString()`）——少一次 HTTP，但必须自行验签/JWKS，成本更高；本期不采用。

### 5.3 关联表如何"把 user_id 关联上"（核心）

```
本地匿名期                          统一身份登录后（应用层对接）
─────────────────                  ──────────────────────────────
local_uid = 客户端 uuid            local_uid 不变（老存档不搬家）
identity_uid = NULL                identity_uid = /userinfo.user.id
status = 'anonymous'               status = 'bound'
                                   provider/issuer/subject/bound_at 填全
        │                                        │
        └── anlewo_save.user_id = local_uid ─────┘
            存档 → 关联表(local_uid) → identity_uid(统一身份 user_id)
```

- **一条存档通过 `user_id` 找到 `anlewo_identity_link.local_uid`，该行的 `identity_uid` 就是统一身份 user_id**——这就是"有张表记录存档把 user_id 关联上"的落点。
- **绑定零改业务表、零改存档数据**：只 upsert `anlewo_identity_link` 一行；`anlewo_save` / `anlewo_ink` 一列不动、一行不迁。
- **多设备**：一个 `identity_uid` 可挂多个 `local_uid`（N:1，普通索引）；同步层按 `identity_uid` 归集该用户各设备的存档，取 revision 最新者。
- **无跨库 FK**：`identity_uid` 是逻辑外键。引用完整性由"应用层先验证 token 并成功调用 `/userinfo`，才写入 identity_uid"保证——**写入前 user_id 必真实存在**（F11 的 issuer/sub/status 校验已挡住伪造）。

### 5.4 对接时序（将来启用时；本期不实现代码）

```ts
// ① 前端：标准 OIDC 授权码 + PKCE 拿 code（跳 /oauth2/authorize），code 换 token 由后端完成
// ② 后端：用 token 调 /userinfo 拿真实 user.id —— 参照 liuyao/src/app/api/auth/profile/route.ts
const r = await fetch(new URL('/userinfo', ISSUER), {
  headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
  cache: 'no-store', signal: AbortSignal.timeout(15000),
});
const { user } = await r.json() as { user?: { id: string } };   // user.id = 统一身份 uuid
if (!user?.id) throw new Error('invalid userinfo');

// ③ 写关联表：把 local_uid 与 identity_uid 写进同一行 = "完成用户对应"
//    （SQL 在业务库执行；无跨库 FK，user.id 已在 ② 经身份服务验证）
// INSERT INTO anlewo_identity_link
//   (local_uid, identity_uid, provider, issuer, subject, status, bound_at)
// VALUES ($1, $2, 'oidc', $3, $4, 'bound', now())
// ON CONFLICT (local_uid) DO UPDATE SET
//   identity_uid = EXCLUDED.identity_uid, provider = EXCLUDED.provider,
//   issuer = EXCLUDED.issuer, subject = EXCLUDED.subject,
//   status = 'bound', bound_at = now();

// ④ 绑定前留快照（reason='pre_bind'），出错可原路退回 status='anonymous'
```

**失败与回滚**：`/userinfo` 失败/超时 → 不写关联表、本地匿名状态不变（异常静默）；绑定出错 → 用 `pre_bind` 快照 + `UPDATE ... SET status='anonymous', identity_uid=NULL` 回滚。

### 5.5 本期与将来的边界（尊重"先不集成"）

| 阶段 | 做什么 | 不做什么 |
|---|---|---|
| **本期（v2.0 交付）** | 建关联表 + 存档表 + 笔迹表；定义 §5.2/5.3 对接契约与 §7 硬契约 | 不注册 `anlewo` client、不发 `/userinfo` 请求、不写登录代码、不生成 uid、不改运行时 |
| **将来（独立立项）** | 注册 client → 前端 OIDC → 后端 `/userinfo` → upsert 关联表 → 同步层按 `identity_uid` 归集存档 | 不做跨库 FK、不往身份库写任何行 |

> 若用户希望**本期就让对接可用**，最小增量是：注册 `anlewo` client + 一个 `GET /api/anlewo/identity`（Bearer→`/userinfo`）端点 + `id.ts` 生成 local_uid；这会新增进程、CORS、localStorage key，需同步调整"逐字节一致"验收口径——列为**备选**，非本文推荐形态。

---

## 6. 迁移路径与回滚

| 阶段 | 动作 | 运行时影响 | 回滚 |
|---|---|---|---|
| **P0 前置** | 实机确认库名（代码默认 `identity`，非 `yiwen_identity`）；确认 issuer；建库/角色/grants/备份（**独立运维项，不在事务性迁移里 `CREATE DATABASE`**） | 无 | 删库/撤销角色 |
| **P1 本期** | 执行 §4 首批 3 表 DDL（`V1__anlewo_core.sql`）；**身份对接默认 OFF** | **零**：不改任何前端/relay 代码、不搬迁 localStorage | drop ink→save→link（逆序） |
| **P2 后续立项** | 注册 `anlewo` client；实现 §5.4 对接；`id.ts`（local_uid 生成 + IDB 备份）；flag 默认关；外挂 `saved.sub`；独立同步 API + Caddy + CORS | 关 flag 时逐字节一致 | 删新文件/关 flag |
| **P3 后续立项** | 建 snapshot/device；笔迹同步（**先修 `Copy.tsx:19-25` 的 `load()` 条件**） | 无感 | 关 flag；清表 |
| **P4 未来** | §5.3 绑定流程生效；多设备按 `identity_uid` 归集；§7 授权层切换 | 老设备继续原 local_uid，数据不分裂 | 关联表 `status` 回 `anonymous`；`pre_bind` 快照恢复 |

**顺序硬约束**：建表 link → save → ink（→ snapshot/device）；回滚逆序。`ON DELETE RESTRICT` 下删除用户一律走 `retired_at` 软删除，不物理删 link 行。

**验证门槛**：每阶段结束必须满足"关掉身份对接/同步开关 + 断网，游戏全功能可玩、存档可读写；`JSON.stringify(localStorage)` 与改造前逐字节一致"，否则不得进入下一阶段。

---

## 7. 未来对接/同步层硬契约（本期不实现，但必须先锁定）

红方 P0（命3/命11）指出：本期虽无运行时代码，但"接缝方便将来同步"要求现在写死契约。以下为**设计约束，不是本期交付代码**：

| # | 契约 | 理由 |
|---|---|---|
| C1 | **身份以 OIDC token 为准，local_uid 仅作本地标识/外键锚点**；`identity_uid` 只在验证 token 并成功调 `/userinfo` 后写入；禁止仅凭 local_uid 认领身份 | uid 若同时是凭证 = "知道 uuid 就是本人"；真凭证是 token（F11 已校验 issuer/sub/status） |
| C2 | **接续码不得等同 local_uid**；本期不实现，若将来做须含服务端签发 secret、短期单次，不进 URL/Referer/日志 | base64url+校验位只防手抖不防伪造，是 bearer credential |
| C3 | **`revision` 由服务端单调分配**：`UPDATE ... SET payload=?, revision=revision+1 WHERE user_id=? AND revision=? RETURNING`；0 行=冲突 | 设备时钟漂移不可作版本；整包替换无字段合并，无 CAS 会静默丢档 |
| C4 | **冲突契约二选一并写死**：本地未同步脏数据优先 / 服务端新版本优先；冲突时服务端版本存 `snapshot(reason='sync')`，静默但保底不丢 | "异常静默"与"不丢档"的权衡点，不能留空 |
| C5 | **link 与 save 同事务**：先 upsert link（含 `ON CONFLICT` 后 `SELECT` 确认），再写 save；任一失败整笔不写、本地保留脏标记 | "失败静默"与 FK 强约束不可兼得，只能事务化 |
| C6 | **恢复时 payload 必须过 `load()` 等价校验**，`Object.assign` 直灌禁止 | 直灌会让被篡改 jsonb 进游戏逻辑 |
| C7 | **`crypto.randomUUID` 兜底**：`globalThis.crypto?.randomUUID?.() ?? v4FromGetRandomValues()`（置 `b[6]=(b[6]&0x0f)|0x40`、`b[8]=(b[8]&0x3f)|0x80`），禁止退化到 `Math.random()` | 局域网 http 下 `randomUUID` 为 undefined |
| C8 | **对接/同步 API 独立进程/独立 systemd unit/最小权限 DB role**；不改 `server/relay.mjs` 与其 `package.json`；CORS 白名单显式列 GitHub Pages 与 nip.io 两源 | relay 明写"不存任何东西、没有任何密钥" |
| C9 | **失败仅 `console.debug`、不改 UI、绝不回写覆盖 localStorage**；本地为唯一真相源 | "异常静默"的可测定义 |
| C10 | **local_uid / identity_uid 不进 `Saved` / `payload`**；`v:1` 不变，同步层不增删字段，主分支新增字段（如 `masterChosen`）按增量随整包往返；flag 未开时不注册订阅、不生成 uid、不开 IDB、不写任何新 key | 红线"不改变游戏功能" |
| C11 | ** issuer/subject 建议写稳定常量，不用随环境变化的 URL 作业务键**；`/userinfo` 调用带 15s 超时、失败降级（参照 F15） | 防环境切换导致绑定错乱；防身份服务抖动拖垮 UI |

---

## 8. 红线与不确定项

### 8.1 不可逾越的红线（违反即否决）
1. 不改变游戏功能：21 个 Saved 字段（含 `v`）、world 8 份、`Mem`/`Brush`/`packChar`、同游 relay 全部原样；服务端不解析 payload 内部。
2. 本地优先：localStorage 写入成功 = 用户侧成功；服务端写入永远 best-effort。
3. 异常静默：新增 I/O 全 try/catch，不弹错、不打断流程。
4. 零网络依赖：身份对接/同步默认关闭；关闭时零请求、零等待。
5. 不集成身份：`identity` 库零写入；`identity_uid` 本期恒 NULL；不注册 client、不调 `/userinfo`、不拉 JWKS、不建跨库连接。
6. Redis 只做限流/幂等短 TTL；游戏状态绝不入 Redis。

### 8.2 不确定项（标注待确认，不编造确定结论）

| # | 事项 | 影响 | 当前默认 |
|---|---|---|---|
| U1 | 身份库真实库名：`identity`（代码默认）vs `yiwen_`/`yiwen_identity`（项目记忆） | 连接串与文档命名 | 实机确认前不写死 |
| U2 | 新库名 `yiwen_anlewo` 是否被运维接受 | 建库脚本 | 建议名，待确认 |
| U3 | **生产 `IDENTITY_ISSUER` 值**、`anlewo` client_id/secret、audience、redirect_uri、`/userinfo` 在生产是否开放 | 决定 §5.2 对接能否落地 | 本期不填值、不发请求 |
| U4 | `sub` 是否恒等于 `users.id`（代码层面 F12 成立，生产若换实现需复核） | 决定 identity_uid 取值路径 | 以 `/userinfo.user.id` 为准（不依赖 sub） |
| U5 | 快照保留期与清理任务主体 | 决定 snapshot 是否无界增长 | 建议每用户 10 版 + pre_bind 最后 1 版 |
| U6 | 笔迹历史缺口范围 | 决定补录范围 | 只承认"当前未写完一篇"，不编造补数 |
| U7 | 同游身份与 uid 是否将来打通 | 决定 `anlewo:net:v1` 归属 | 本期不打通 |

---

## 9. 交付边界声明（防止"名不副实"）

**本次交付**：
- 一份数据库拆分设计终版（本文，v2.0）；
- `V1__anlewo_core.sql` 首批 3 表 DDL（link / save / ink），含身份关联表；
- **应用层 OIDC 对接契约**（§5.2/5.3）与关联机制定案；
- 未来对接/同步层的 11 条硬契约（§7）。

**本次不交付**：
- 可运行的登录/同步闭环（无 client 注册、无 POST API、无前端对接代码）；
- 任何数据搬迁（现有 localStorage 数据不迁移、不上传）；
- token 换取、`/userinfo` 调用、`identity_uid` 写入（本期恒 NULL）；
- **任何游戏运行时代码改动**（`store.ts` / `Copy.tsx` / `identity.ts` / `relay.mjs` 一行不动）。

> 一句话总结：当前项目在"纯 localStorage + 无服务端持久化"下自洽且防御性良好；本次把**库边界、身份关联表、应用层对接契约**规划到位，作废物理上不成立且用户不需要的跨库 FK 方案。确认 U1/U3 后按 §6 执行 P1 即可安全完成"数据库拆分"的结构落地；§5 对接与 C1~C11 待正式立项时逐条兑现。

---

**裁决签署**：蓝方（架构师·高见远）｜红方（QA·严过关）｜第三方（工程师·寇豆码）｜主理人交叉裁决（交付总监·齐活林）
**版本**：v2.0（依用户"应用层 token→用户信息→关联表、不跨库"澄清 + 实读身份接口契约重构接缝章）
**状态**：三方结论已收敛一致，无未解决的 P0 分歧；U1/U3 为待确认项，不阻塞 P1 建表。
