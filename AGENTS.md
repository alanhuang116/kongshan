# 安乐窝 · 接手 agent 必读清单

> 给下一位维护者（海外 / 法国服务器）：只接游戏玩法与 bug。中文为主，命令通用。
> **先读这一页，再动代码。** 不确定的项一律标注并问我，不要猜、不要补。

---

## 0. 三十秒摘要

- 这是一个**纯前端网页游戏**：三维场景、界面、声音、古书文本都在 `src/`；没有账号，没有图片/音频素材，全部程序生成。
- **只改玩法，不改同步/身份接缝**。默认同步关闭，玩家存档只在 `localStorage`。
- 你自己的 `main` 分支只写游戏；我这边会集成统一身份认证与同步。**代码隔离、契约共享、单库三域**。
- 本地起游戏**不需要数据库、不需要 Redis、不需要 Docker**。
- 数据库只在要跑同步后端时才需要；法国服务器是全新环境时，按第 3 节自建库，**不要连我的测试库**。
- **不要提交任何口令、连接串、`.env.local`。**

---

## 1. 工作边界（先记红线）

### 你可以改
- 玩法：`src/world/**`（场景、行走、农事、人物、生灵）、`src/app/**` 的界面与交互、`src/audio/**`、`src/data/**`。
- 玩法测试：`tests/` 里对应模块。
- 玩法文档：`docs/PLAY.md`、`docs/FARM.md` 等。

### 你不要动
- `server/sync/**`、`src/app/sync/**`、`tests/sync-*.test.ts`、`db/**`、`docs/DB_SPLIT_FINAL.md`、`server/sync/README.md`、`AGENTS.md`。
- `src/main.tsx` 里这一行**保留**（同步层入口）：
  ```ts
  if (import.meta.env.VITE_ANLEWO_SYNC === '1') void import('./app/sync').then((m) => m.start());
  ```
  五连击调试面板的挂载行也保留。
- `server/relay.mjs` 与同游中转协议：它只转发、不存东西，别往里塞身份/存档。

### 存档契约（改之前必看）
- 存档本体是 `localStorage['anlewo:v1']`，形状是 `Saved`（`src/app/store.ts`），**`v:1` 与 21 个字段（含 `v`）不能悄悄改**。
- 世界内部另有 8 份存档（`world` 按名字分），`Mem` / `Brush` / `packChar` / `site.ts` 的坐标体系保持原样。
- 新增玩法数据请放进现有 `Saved` 字段的 `world` 子结构；**确实要改顶层字段时，必须升版本 + 写迁移 + 先告诉我**，否则老玩家存档会静默失效。
- 不要新增或改写这些键：`anlewo:id:v1`、`anlewo:sync:v1`、`anlewo:write:v1`。`anlewo:write:v1` 是笔迹的物理边界，另有负责人。
- 网络：默认**零请求**。`VITE_ANLEWO_SYNC` 未开时不能发任何请求、不能弹错误、不能改写本地存档。

### 协作方式
- 你在你的 `main` 分支改；我在我的分支集成身份与同步。跨分支只共享**契约**（这份清单 + `docs/DB_SPLIT_FINAL.md` + `server/sync/README.md`）。
- 合并时若 `src/main.tsx` 冲突，**保留同步入口那两行**，只合入你自己的玩法改动。
- 关键结论不确定就标注，不要凭记忆猜库名、密码、环境性质。

### 合并纪律（main → 带数据库/同步的开发分支）
- 合并 `origin/main` 前先看工作树：有未提交改动先 stash，合并后再恢复，不要带着脏树硬合。
- 合并后逐路径核对 `db/**`、`server/sync/**`、`docs/DB_SPLIT_FINAL.md`、`src/app/sync/**`、`tests/sync-*.test.ts`：`git diff <合并前提交> -- <上面这些路径>` 必须为空。出现冲突时保留同步/数据库一侧并逐行核对，**不许整段接受 main**。
- `db/V1__anlewo_core.sql`、`V2__anlewo_sync_key.sql`、`V3__anlewo_payload_limit.sql` 不得改名、删减、重排；`.env.local`、口令、连接串不得进版本库。
- 合并后跑 `npm run typecheck`、`npm test`，并对本地库做一次结构核对（6 张 `anlewo_*` 表、存档上限 4MB）或请求 `/api/anlewo/health`。

### 分支纪律（2026-11-25 起）
- **本地开发不合并 `main`**：`main` 只作为上游玩法来源，开发分支（`dev_link_portal` 及后续 `dev_*`）不向 `main` 合并、不推送 `main`。
- **正式环境只发 `master`**：开发分支验证通过后合并到 `master`；正式 Jenkins 任务 `kongshan` 只从 `master` 构建，发布前确认 `master` 已包含本次上线提交。
- **正式发布顺序**：提交并推送 `dev_link_portal` → 合并 `dev_link_portal` 到 `master` 并推送 → 用 `master` 触发 Jenkins 全量构建 → 触发后立即切回 `dev_link_portal`。
- 发布从 `master` 最新提交全量构建（静态站 + 同步服务两段），不从开发分支直接发正式。

- **main 新增存档字段**（`Saved` 顶层字段或 `world` 之外的结构变化）：先给方案再动手——是否升版本（`v`）、老档迁移怎么写、`payload` 上限与服务端校验是否要跟着改、`docs/DB_SPLIT_FINAL.md` 怎么更新；方案确认后改代码，不许合完就当没看见。
- **main 新增数据表或表字段**：先给方案（表用途、与现有 6 张表的关系、索引/约束、是否涉及身份锚点），再按 `V1→V2→V3` 的顺序续写幂等脚本 `db/V4__*.sql`（可重复执行、`IF NOT EXISTS`/`DROP … IF EXISTS` 先删后加），把建表/改表语句一并提交。
- 新增的 SQL **必须在本地 `yiwen_anlewo` 库真实执行并验收**（表、字段、约束、索引都在），验收结果写进合并说明；只改代码不建库、或把 DDL 只写在文档里，都算没做完。

### 存档上限这类「放宽」迁移的滚动顺序（V5 起）

- **先迁移，再发代码**。上限放宽（V5 把 payload 1MB → 4MB）必须先在目标库执行，再发布带新上限的服务端与前端。
  - 库里还是旧的 1MB CHECK、服务端/前端先放开 4MB：大档在服务端被旧 CHECK 拦下，前端只留一行 `console.debug`，看起来在同步、其实停着。
  - 库里已是 4MB、前端还是 1MB：只是白白少用额度，不报错；所以“先库、后代码”那一头永远安全。
  - 前端 4MB 而服务端仍是 `MAX_PAYLOAD_BYTES=1MB`：413 `payload_too_large`，同一个静默不同步。
- **正式 K8s**：`kubectl -n yiwen delete job anlewo-sync-migrate --ignore-not-found` → `envsubst '${IMAGE_TAG}' < deploy/k8s/sync-migrate-job.yaml.tmpl | kubectl apply -f -` → `kubectl -n yiwen wait --for=condition=complete job/anlewo-sync-migrate --timeout=180s` → 日志里要有 `✓ V5__anlewo_payload_limit_4mb.sql` 与 `payload 上限约束：在`；然后才 apply `sync.yaml.tmpl` 与 `deployment.yaml.tmpl`。
- **测试机 / 本地**：`cd server/sync && npm run migrate`（就是 `node migrate.mjs`，幂等、可重复跑），确认回读 `payload 上限约束：在`，再重启同步服务并重新构建前端。
- **四处数字必须一起改**：`src/app/sync/state.ts` 的 `SYNC_PUSH_LIMIT`、`server/sync/db.mjs` 的 `MAX_PAYLOAD_BYTES`、`db/V5__anlewo_payload_limit_4mb.sql` 的 CHECK；再加 `BODY_LIMIT`（默认 6MB）与 Ingress 的 `proxy-body-size`（6m）必须**大于**上限，否则 413 先出在反代那一层。
- **回滚方向相反**：先把前端/服务端退回 1MB（客户端不再往上推），确认库里没有超过 1MB 的行，再把约束改回 1048576——否则 `ADD CONSTRAINT` 会直接失败。

---

## 2. 只改玩法：本地启动（不需要数据库）

前置：Node **20.18+**（本机 Node 22 可用；Vite 6）。

```bash
cd /path/to/kongshan
npm install
npm run dev        # http://localhost:3800
npm test           # 文字出处、总图、路径、六十四卦、村人等
npm run build      # tsc --noEmit + vite build → dist/
npm run preview    # 看打包后的样子
```

浏览器调试参数（题名页可跳过）：
```
?auto=1                       跳过题名页
&s=grove|bridge|yard|hall|pavilion|fields|village|ferry
&t=now|dawn|day|dusk|night|10.5
&w=clear|mist|rain|snow
&season=spring|summer|autumn|winter
&q=low|mid|high
&act=<事情 id>  例：xiang:革、dipper、book、farm:thresh
&ui=0  &flow=0  &flow=0.0167
```

开发用台子（不进正式构建）：`/world.html?s=yard`、`/ink.html?m=hall`、`/audio-lab.html`。

静态部署：`npm run build` 后把 `dist/` 放到任意静态服务器（相对路径，子目录也可）。改了图标/manifest 要给 `public/sw.js` 版本号 +1，老访客才会更新缓存。

---

## 3. 法国服务器初始化（只在要跑同步后端时做）

**先判环境**：你是要改玩法（第 2 节够了），还是要连同步后端调试？后者才需要下面这些。

### 3.1 前置与端口

| 组件 | 用途 | 默认端口 |
|---|---|---|
| Node 20.18+ | 同步服务 `server/sync/index.mjs` | 3830（只听 `127.0.0.1`，由 Caddy 反代） |
| PostgreSQL | 业务库 `yiwen_anlewo` | 5432 |
| Redis（可选） | 只做限流/幂等，**不存存档** | 任意；连不上自动降级为内存 |

- 服务器若是 **CentOS 7 / glibc 2.17**，Node 20+ 官方二进制跑不起来，用 Docker `node:22`。若是 Debian/Ubuntu 且 glibc 够新，直接装 Node 即可。**这一条按实机 `ldd --version` 判断，不要照搬我的环境。**
- 我这里的测试机地址、口令**不要写进仓库**，也不要在你的法国服务器上复用。需要连通我的测试环境时单独问我要；**那些地址是测试环境，不是生产**。

### 3.2 建库（在法国服务器上自建，幂等）

需要从我仓库拿 `db/V1__anlewo_core.sql`、`db/V2__anlewo_sync_key.sql`、`db/V3__anlewo_payload_limit.sql`、`db/V4__anlewo_save_comment_21fields.sql`、`db/V5__anlewo_payload_limit_4mb.sql`。

```bash
# 以 postgres 超级用户或有 CREATEDB 权限的角色执行；口令用占位符，真实值从密钥管理器取
sudo -u postgres psql -c "CREATE ROLE anlewo LOGIN PASSWORD '<PLACEHOLDER>';"
sudo -u postgres createdb -O anlewo yiwen_anlewo

# 五个脚本按序执行，都可重复跑
psql "postgresql://anlewo:<PLACEHOLDER>@127.0.0.1:5432/yiwen_anlewo" -v ON_ERROR_STOP=1 -f db/V1__anlewo_core.sql
psql "postgresql://anlewo:<PLACEHOLDER>@127.0.0.1:5432/yiwen_anlewo" -v ON_ERROR_STOP=1 -f db/V2__anlewo_sync_key.sql
psql "postgresql://anlewo:<PLACEHOLDER>@127.0.0.1:5432/yiwen_anlewo" -v ON_ERROR_STOP=1 -f db/V3__anlewo_payload_limit.sql
psql "postgresql://anlewo:<PLACEHOLDER>@127.0.0.1:5432/yiwen_anlewo" -v ON_ERROR_STOP=1 -f db/V4__anlewo_save_comment_21fields.sql
psql "postgresql://anlewo:<PLACEHOLDER>@127.0.0.1:5432/yiwen_anlewo" -v ON_ERROR_STOP=1 -f db/V5__anlewo_payload_limit_4mb.sql
```

`V1` 会 `CREATE EXTENSION IF NOT EXISTS pgcrypto`；如果报权限错，让 DBA 在库上先装扩展或给建扩展权限，`CREATE DATABASE` 不能放进事务块，也不在脚本里。

验收：

```sql
SHOW server_version;
SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name LIKE 'anlewo_%' ORDER BY 1;
```

应看到 6 张表：`anlewo_identity_link`、`anlewo_save`、`anlewo_ink`、`anlewo_sync_key`、`anlewo_save_snapshot`、`anlewo_device`。

三张脚本的关系：**V2 依赖 V1**（外键），**V3/V5 依赖 V1**（改 `anlewo_save` 的约束），**V4 依赖 V1**（只改 `payload` 的注释）。漏跑 V2 会在 `/link` 时报 `db_migration_missing`；漏跑 V5 则存档上限还停在 1MB。

### 3.3 配置（口令只进被忽略的文件）

在 `server/sync/` 下建 `.env.local`（已被 `.gitignore` 的 `.env*` 挡住，不会进版本库）：

```dotenv
DATABASE_URL=postgresql://anlewo:<PLACEHOLDER>@127.0.0.1:5432/yiwen_anlewo
REDIS_URL=                      # 留空＝用进程内内存限流；跑多实例才需要真 Redis
PORT=3830
HOST=127.0.0.1
IDENTITY_ENABLED=0              # 统一身份默认关；开着就必须给 IDENTITY_ISSUER
```

注意：
- `.env.example` 可以进仓库（只有占位符），`.env.local` / `.env.*.local` 不行。
- `VITE_ANLEWO_SYNC` 是**前端构建期**开关，不是后端开关；不开时前端整层不会加载。
- Redis 里只允许有 `anlewo:rl:*` 短 TTL 键；**不要 `FLUSHDB`**（同一实例可能有别人的库）。上线前先看 `INFO server` 版本与 db 占用。

### 3.4 起服务与验收

```bash
cd server/sync
npm install --omit=dev
node index.mjs
# 另一个终端
curl -s http://127.0.0.1:3830/api/anlewo/health
# 期望 {"ok":true,"db":"up","redis":"up"|"memory","identity":"off"}
```

- `redis:"memory"` 是设计内降级，不是故障；但生产多实例下它会让限流额度随实例数放大，**扩容前必须补监控**（见 `server/sync/README.md` 的 K9）。
- 跑冒烟会往库里写删几十行、并占满那一分钟的限流桶：**绝不要对真实站点/生产库跑 `smoke.mjs`**。

---

## 4. 常见坑（别踩）

| 现象 | 原因 | 处理 |
|---|---|---|
| 老玩家存档突然丢了 | 改了 `Saved` 顶层字段但没升版本 | 保持 `v:1` 21 字段；破坏性改动才升版本 + 迁移 |
| 同步服务 `503 db_migration_missing` | 三张 SQL 没跑全 | 按 V1→V2→V3 补跑 |
| `/link` 一直 401 | `authorization` 少了 `Bearer <sync_key>`；uid 只是标识不是凭证 | 看 `server/sync/README.md` 的契约 C1 |
| 前端没任何网络请求 | `VITE_ANLEWO_SYNC` 没开 | 这是预期；开：`VITE_ANLEWO_SYNC=1` |
| 五连击调试面板找不到 | 它只在开发态存在，且触发点是题名页「安乐窝」的**「安」字** | 题名页 2 秒内连点「安」5 次；生产构建没有这个面板 |
| 首页右下角圆点不见了 | 触发点已改到「安」字 | 同上 |
| 法国服务器页面空白 | Node/浏览器版本、字体包、或构建路径 | 先 `npm run build` 看报错；静态资源用相对路径 |
| 同游（relay）连不上 | 独立小中转，可缺席 | 游戏照常单人运行，不要把它改成必需 |

---

## 5. 必读文档

- `README.md` —— 游戏是什么、怎么玩、结构、调试参数、发布。
- `docs/INK.md`、`docs/PLAY.md`、`docs/FARM.md`、`docs/AVATAR.md` —— 画法与玩法的内部约定。
- `docs/SOURCES.md` —— 古人原话的出处；**不要改动已核对的引文**。
- 只在碰接缝时读：`docs/DB_SPLIT_FINAL.md`、`server/sync/README.md`。
- 不确定项见 `docs/DB_SPLIT_FINAL.md` §8.2（生产 issuer、库名、sub 是否等于 user.id 等）；**这些都没定，别写死**。

---

## 6. 定义「做完」

1. `npm test` 全绿，`npm run typecheck` 0 错，`npm run build` 成功；
2. 用 `?auto=1` 走一遍你改的玩法：键盘 + 触屏至少各一次；
3. 老存档能读出来：`localStorage['anlewo:v1'].v === 1`，21 个字段（含 `v`）没少；
4. 没有提交 `.env*`、口令、连接串、`dist/`；没有碰第 1 节列出的禁改文件；
5. 改动只在你自己的分支；合并冲突时保留同步入口那两行；
6. 从 `main` 合并进带数据库/同步的分支后，按第 1 节「合并纪律」逐路径核对，数据库与同步部分零改动；
7. main 带来的新存档字段或新数据表，已先给方案、再给 `db/V4__*.sql` 建表/改表语句，并在本地 `yiwen_anlewo` 库建好验收；
8. 没有把开发分支合并回 `main`；需要上线时只合并到 `master`，并从 `master` 发正式。

**如果以上任何一条做不到，停下来问我，不要自己放宽标准。**
