# 合并说明：`origin/main` → `dev_link_portal`（2026-11-25）

## 1. 合并范围

| 项 | 值 |
| --- | --- |
| 合并提交 | `07d0f4c` `Merge remote-tracking branch 'origin/main' into dev_link_portal` |
| 合入的 main 提交 | `cccc786`「安乐窝：按第七轮反馈改了七处（过溪寻路、加载墨环、声音、摸狗与草堂镜头、换季、手机上的「疾」与同游）」 |
| merge-base | `a1fee2f` |
| 改动量 | 38 个文件，+855 / −197；新增 `src/world/travel.ts` |
| 本分支收尾提交 | `66bdf1a`（同步 `fetch` 绑定修复）、`7a5baf8`（V4 + 21 字段口径 + 合并纪律）、`03bbe0b`（全量笛卡尔积用例放宽到 15 秒） |

## 2. 存档口径变化（main 带来的唯一持久化改动）

全部在 `src/app/store.ts`，不改 `v`（仍为 `1`）：

- `Saved` 顶层新增 `masterChosen: boolean`，20 → **21 字段（含 `v`）**；
- `DEFAULT.master` 由 `0.8` 改为 `0.45`（初来的人先轻一些）；
- `load()`：`masterChosen !== true` 时 `master` 回落当前默认 `0.45`，不再沿用老档里存的 `0.8`；`masterChosen` 只认严格 `true`；
- 写档行为：`setMaster` 连带写 `masterChosen: true`；`setSeason` 把 `ks.atmos.weather` 一并写入（离冬雪停、天转晴会被记下）。

服务端不解析 `payload`（整包 JSONB），新增一个 boolean 不需要新列/新约束，V3 的 1MB 上限不受影响。

## 3. 同步与数据库侧：零改动

按「合并纪律」逐路径核对，`git diff 104c6a5 HEAD -- db/ server/sync/ docs/DB_SPLIT_FINAL.md src/app/sync/ tests/sync-*.test.ts` 只有本分支自己的收尾改动（V4 脚本与文档口径），无 main 侧改动：

- `db/V1__anlewo_core.sql`、`V2__anlewo_sync_key.sql`、`V3__anlewo_payload_limit.sql` 未改名、未删减；
- `src/app/sync/**` 只有 `66bdf1a` 的 `fetch` 绑定修复（`Illegal invocation`），与 main 无关；
- `.env.local`、口令、连接串未进版本库。

## 4. 校验结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck`（`tsc --noEmit`） | 通过（退出码 0） |
| `npm test`（`vitest run`，14 个文件） | 250 passed / 11 skipped，退出码 0（含下面新增的 5 个用例） |
| 新增 `tests/store-load.test.ts` | 5 用例全过：老档归 `0.45`、`masterChosen` 保留音量、非严格 true 视同未标、21 字段整包往返全等、空档全默认 |

## 5. V4 本地执行与验收

- 目标库：`127.0.0.1:5432/yiwen_anlewo`（角色 `anlewo`，连接串取自 `server/sync/.env.local`，不落文档）；
- 执行：只跑 `db/V4__anlewo_save_comment_21fields.sql`，**连跑两次均成功**（`COMMENT` 幂等），未重跑 V1–V3；
- 回读 `anlewo_save.payload` 列注释：

  ```
  与 src/app/store.ts 的 Saved（21 字段，含 v）1:1 原样往返；服务端不解析字段（含 world 的 8 份 ns）。恢复时必须过 load() 等价校验。
  ```

- 结构核对（确认「只改注释」）：
  - 6 张表齐全：`anlewo_device, anlewo_identity_link, anlewo_ink, anlewo_save, anlewo_save_snapshot, anlewo_sync_key`；
  - `anlewo_save` 列不变：`user_id:uuid, revision:bigint, payload:jsonb, client_id:uuid, created_at:timestamptz, updated_at:timestamptz`；
  - 存档上限约束仍在：`CHECK ((length((payload)::text) <= 1048576))`；
  - 表注释未变（仍为 `null`）；现有 4 行存档未受影响。

## 6. 法国库（169.58.39.104）：本次不执行

只读探测结论：那边既没有 `yiwen_anlewo` 库，也没有跑同步后端——

- `https://kongshan.169-58-39-104.nip.io/api/anlewo/health` → 404（站点本身 200），Caddy 无 `api/anlewo` 的 handle；
- `/opt/yiwen` 下只有 `kongshan`（静态站）与 `kongshan-relay`（同游中转），无 `*sync*` 目录；
- 本机无 5432 监听（只 80/443），`docker ps` 只有 `yiwen-liuyao`，`psql` 仅为客户端。

将来把 `server/sync` 部署到法国时，建库按 `V1 → V2 → V3 → V4`，`npm run migrate` 会按版本号自动跑到 V4。

## 7. 测试机 152.136.108.28：同步后端没跑，库在（已补跑 V4）

2026-11-25 现场核对（`root@152.136.108.28:2222`，全部只读，除 V4 的 `COMMENT` 外未改任何东西）：

- **同步后端没有部署**：`/opt/yiwen` 为空、全盘无 `api/anlewo` 配置、无 `3830` 监听（只有 `*:8080` Jenkins 与 `*:5432`）；容器只有一个 `yiwen-lt-postgres`（`yiwen-loadtest-postgres:20261030`）。
- **库在**：该 PG 容器里有 `yiwen_anlewo`，6 张 `anlewo_*` 表齐全，`payload` 列注释还是旧口径（20 字段），`anlewo_save` / `anlewo_ink` 均 **0 行**（负载测试副本，无业务数据）。
- **已补跑 V4**：经 `docker exec -i … psql -f -` 把 `db/V4__anlewo_save_comment_21fields.sql` 打进去，连跑两次均成功（幂等）；回读列注释已是 21 字段口径；表数仍 6、上限约束仍 1MB、两张表行数仍为 0（只动了 `COMMENT`，数据未触碰）。

