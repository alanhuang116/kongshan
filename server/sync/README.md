# 安乐窝的同步（sync）

存档与笔迹的服务端，用户自己那台机器上的一份 localStorage 才是真相源，这里只是**备份**。
明确的能力边界（别按"什么都能恢复"验收）：
- **存档**：能恢复。本机没有 `anlewo:v1` 时按服务端那份写回本地并重载一次（见下"首轮对账"）。
- **笔迹**：只备份、**不可恢复**。`GET /ink` 只回索引不回 `chars`，也没有单篇读取端点——换设备时拿不回笔迹。要恢复得再加一个取单篇的端点（Known Issue）。
端点全部挂在 `/api/anlewo` 下，和同游的中转（`server/relay.mjs`）**没有任何关系**：不同目录、不同 `package.json`、不同依赖、不同 systemd unit。

| 文件 | 管什么 |
| --- | --- |
| `index.mjs` | 进程本身：读配置、建池、起 HTTP、优雅退出（SIGTERM/SIGINT） |
| `http.mjs` | 路由、CORS、JSON 体积、统一错误体、限流、鉴权 |
| `auth.mjs` | 凭证解析与比对；`/userinfo` 换 `user.id`（15s 超时） |
| `db.mjs` | `pg.Pool` 与所有 SQL（列名以 `db/V1__*.sql`、`db/V2__*.sql`、`db/V3__*.sql` 为准） |
| `redis.mjs` | 限流计数：Redis 优先，连不上自动降级为内存实现 |
| `config.mjs` | 环境变量（没有任何硬编码口令） |
| `migrate.mjs` | 按文件名顺序跑 `db/V*.sql` 全量（幂等） |
| `smoke.mjs` | 真打测试库的集成冒烟（含 409 冲突与快照校验、逆序清理） |
| `.env.example` | 配置模板（只有占位符） |
| `.env.local` | **真实配置**，被 `.gitignore` 的 `.env*` 挡住，绝不进版本库 |
| `Caddyfile.snippet` | `/api/anlewo/*` 反代到 `127.0.0.1:3830` |
| `yiwen-anlewo-sync.service` | systemd 单元（`EnvironmentFile=` 指 .env.local） |

## 本机跑

```bash
cd server/sync
npm install                 # pg + redis
npm run migrate             # 按顺序跑 db/V*.sql 全量（幂等）
npm start                   # 听 127.0.0.1:3830；配置取自 .env.local
curl -s localhost:3830/api/anlewo/health   # {"ok":true,"db":"up","redis":"memory","identity":"off"}
```

前端那边（仓库根）：

```bash
# .env.local（不进版本库）
VITE_ANLEWO_SYNC=1
VITE_ANLEWO_SYNC_API=http://127.0.0.1:3830/api/anlewo
npm run dev
```

**关掉同步**：把 `VITE_ANLEWO_SYNC` 删掉或改成别的值。这时候 `src/main.tsx` 里那一行动态 import 不会执行 ——
不注册订阅、不生成 uid、不打开 IndexedDB、不写任何新 localStorage 键、**不发任何请求**，逐字节回到原来的行为。
（`src/app/sync/` 这个目录只在开关打开时才会被加载，所以那段代码存在本身不产生任何副作用。）

## 首轮对账（客户端最关键的一段）

判据在 `src/app/sync/reconcile.ts`（纯函数，单测见 `tests/sync-reconcile.test.ts`），开页面时按下面四种动作之一走：

| 情形 | 动作 | 为什么 |
| --- | --- | --- |
| 拉不到服务端 | `noop` | 本地是唯一真相源，等下一次变动再推 |
| 本机没有、服务端有 | `adopt` | 把服务端那份**原样**写回 localStorage，**本会话不再推送**并重载一次页面 |
| 本地有、服务端没有 | `push-first` | 首发，`baseRevision=0` |
| 两边都有，且锚（`anlewo:sync:v1` 的 `{revision,hash}`）与本地都对得上 | `noop` | **不空写**——否则每开一次页面就 +1 revision，白造冲突窗口 |
| 两边都有，本地自上次同步没动、服务端前进了 | `adopt` | 是另一台设备写的，采纳服务端（不拿旧档盖新档） |
| 两边都有，本地确实改过 | `push` | 本地优先；覆盖前服务端 `snapshotBefore` 留底 |

`adopt` 为什么必须重载：内存里的 `saved` 是启动时按"本地空档"建的，只写 localStorage 不重载的话，
用户点「入」时 `ks.ts` 的 `visits` 自增会让 `store.ts` 的 300ms 回写把刚恢复的那份盖掉，5 秒后还会把空档推上服务端。
重载守卫在 sessionStorage（`anlewo:sync:reloaded:<uid>`，按 uid 区分），同一 tab 只跳一次。

## 环境变量

| 键 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `DATABASE_URL` | **是** | — | 业务库 `yiwen_anlewo`。缺了进程启动即退出（不带半套配置硬跑） |
| `REDIS_URL` | 否 | 空 | 只有限流/幂等的计数键。空或连不上 → 内存实现，服务照常 |
| `PORT` | 否 | `3830` | |
| `HOST` | 否 | `127.0.0.1` | 只听本机，由 Caddy 反代 |
| `ANLEWO_CORS` | 否 | 两个正式站 | 逗号分隔，**与默认值求并集**；`localhost` / `127.0.0.1` / `::1` 的任意端口总是放行 |
| `IDENTITY_ENABLED` | 否 | `0` | `1` 才允许 `/userinfo` 那条路 |
| `IDENTITY_ISSUER` | 否 | 空 | 开了身份对接才必填；不写死 localhost |
| `BODY_LIMIT` | 否 | `6291456` | 请求体上限（字节，6MB；存档本身 ≤4MB，JSON 转义还会胖一圈） |
| `RATE_PER_MIN` | 否 | `120` | 每 uid 每分钟（桶键里是 uuid 的 sha256 前缀，不是原文） |
| `IP_RATE_PER_MIN` | 否 | `max(RATE_PER_MIN×4, 240)` | 每 IP 每分钟（所有路径共用，含 `/health`） |
| `LINK_PER_MIN` | 否 | `25` | 每 IP 每分的 `/link` **建行**预算（只数真正新建的身份，已注册用户的报到不占；客户端遇 429 会退避重试） |

`.env.local` 会被自动读（已存在的真实环境变量优先），`ANLEWO_SYNC_NO_DOTENV=1` 可关掉。

## 端点契约

统一：`content-type: application/json; charset=utf-8`；错误体只有 `{error:"<code>"}`（不回显 SQL、堆栈、参数）。

请求头：

- `x-anlewo-uid: <uuid>` —— **标识**，不是凭证（C1）
- `authorization: Bearer <credential>` —— 含两个 `.` 视为 OIDC access token；否则视为本地 `sync_key`

| 端点 | 说明 |
| --- | --- |
| `GET /health` | `{ok, db:"up"|"down", schema:{tables, payloadLimit}, redis:"up"|"memory", identity:"on"|"off"}`，不含任何配置值。`schema.tables` 是 `ok` 或 `missing:<表名逗号列表>`，`schema.payloadLimit` 是 `ok`/`missing`（V5 的 4MB 约束），`schema.payloadLimitBytes` 是**真上限**（库里的 CHECK 与服务端 `MAX_PAYLOAD_BYTES` 取小；库不通时为 `null`）——客户端拿它当自己的门槛，所以滚动发布中间态不会撞 413；库不通时三项都是 `down`/`null`。**`ok` 仍只看库通不通**：迁移没跑全时服务照样 200+`ok:true`，验收要看 `schema` |
| `POST /link` | 匿名注册／确认还是我。行不存在 → 同一事务建 `identity_link(provider='anon', subject=uid)` + `sync_key(sha256(key))`，可选写 `device`；已存在 → 比对 `sha256(credential)`，不匹配 `401 bad_credential`。**唯一的例外**：link 行在、`sync_key` 行丢了（运维清理／从旧备份恢复），且该行 `created_at` 早于 10 分钟、又还没有任何存档 → 允许用请求里的新 key 受控重建（否则永久 401、静默不同步）。回 `{uid, status, boundIdentity}` |
| `GET /save` | `200 {revision, payload, updatedAt}`；没有记录 → `204` |
| `PUT /save` | `{payload, baseRevision, clientId?, snapshotBefore?}`。`baseRevision=0` 首发（`INSERT … ON CONFLICT DO NOTHING`），其余走 `UPDATE … WHERE revision=$base RETURNING`。0 行 → `409 conflict` + 服务端当前那一份。**`snapshotBefore:true` 时，覆盖前在同一个事务里先把被替换的那一版存进 `save_snapshot(reason='sync')`**——只在首轮对账（本地确有大改、要盖掉别的设备那一版）和冲突重推时用，常规 5 秒推送不写快照 |
| `POST /ink` | `{pieceKey, chars, charTotal?}` → `piece_hash = sha256(pieceKey)`，按 `(user_id, piece_hash)` upsert |
| `GET /ink?limit=20` | 最近若干篇的索引 `{pieceHash, pieceKey, charTotal, updatedAt}`，**不含 chars** |
| `POST /identity/bind` | `{accessToken}`。开关关着 → `501 identity_disabled` 且**不发任何外网请求**；开着 → `/userinfo` 取 `user.id`，先写 `pre_bind` 快照，再改 link 那一行为 `provider='oidc'/status='bound'` |

其它：`404 not_found`、`405 method_not_allowed`、`415 bad_content_type`、`413 too_large`、
`429 rate_limited`、`503 db_unavailable`、`504 upstream_timeout`、`500 internal`。
`OPTIONS` 预检 → `204` + `Access-Control-Allow-Headers: content-type,x-anlewo-uid,authorization`、`Max-Age: 600`。

> **探活只看 `ok` 字段，不要只看状态码**：库不通时 `/health` 照样回 **200**（这样 L7/LB 能拿到结构化的 JSON 判断哪一层坏了），
> 但响应是 `{"ok":false,"db":"down",...}`。把它当成"200 就健康"会让故障静默通过。

### 上传体积

- 存档：`JSON.stringify(payload)` ≤ 4194304（与 `db/V5__anlewo_payload_limit_4mb.sql` 的 CHECK 一致；journal 在客户端封顶 3000 条，3000 条 × 100 字约 1MB、× 160 字约 1.43MB，所以 1MB 那个旧上限会把玩得久的档挡在门外）
- 笔迹：`JSON.stringify(chars)` ≤ 1048576，`chars` 最多 4096 项，`charTotal` 必须等于 `chars.length`
- `pieceKey` ≤ 2048 字节
- 客户端推之前先量一遍：超 4MB 就这一回不推（`console.debug` 一行），本地照旧——不会因为超限而反复撞 413

## Redis 的边界（别把它当缓存用）

Redis 里**只有**限流计数键，60s 过期，三个桶（前两个数"请求"，第三个数"建行"，口径不同不能混）：

- `anlewo:rl:ip:<分钟桶>:<sha256(ip)[0:16]>` —— 所有路径（含 `/health`），上限 `IP_RATE_PER_MIN`
- `anlewo:rl:u:<分钟桶>:<sha256(uid|ip)[0:16]>` —— 除 `/health` 外的路径，上限 `RATE_PER_MIN`
  （键里带 ip 是为了防定向 DoS：只用 uid 的话，知道某人 uid 就能从任意地址刷满、让本人被 429）
- `anlewo:rl:linkc:<分钟桶>:<sha256(ip)[0:16]>` —— `/link` 的**建行**预算。计入规则要读准：
  **只有两种情况计格** ——（a）真的建出一行；（b）已经打满之后还继续撞（故意的累积惩罚）。
  已注册用户的报到一次都不占；预留之后**任何其他退出**（坏 `Content-Type` / 坏 JSON / 体过大 /
  建行前被别人抢先）都**退还**。所以它平时等于本窗口的建行成功数，只有在打满之后才会高出实际行数。
  上限 `LINK_PER_MIN`（默认 25）

为什么 `/link` 不能按"请求数"限：它**每次开页面都打**，而绝大多数是"还是我"的报到（零写入）。
拿请求数当预算，同一个共享出口（学校 / 公司 / CGNAT）里 25 个陌生人打出的 401 就能让整个办公室
一分钟内注册不上——那是可用性故障，不是限流。

所以判据分三步：① 这个 uid 在库里**没有**身份行才进桶（已注册用户永远不占）；② 用 `INCR` 当**原子预留**，
返回 `> 上限` 直接 429（此时一行都没写，不会留下"凭证谁也不知道"的孤儿身份）；③ 预留之后无论成功、失败、
抛错、还是被识别为"别人抢先建了"，都走 `try/finally` 结算——**只有"建出一行"和"撞到上限"保留这一格**，
其余全部 `decr` 退还。用 `INCR` 而不是 `peek` 是因为"先看后写"能被并发绕过：50 个并发新 uid 会全部读到 0、
全部放行。代价是每次 `/link` 多一次主键点查，换来"已注册用户永远不受这只桶影响"。

**为什么"其他退出"必须退还**：坏 `Content-Type` 的路径（415）发生在"预留之后、建行之前"。
若不退还，同一出口只要 25 次 `Content-Type: text/plain` 的 `/link` 就能把本分钟的建行预算烧光、
一行都没建——那和这轮要消灭的故障是同一个形状，只是换了个入口。

键里**不放原始 uid/ip 文本**（否则 8KB 的假 uid 头就能把内存撑爆）。

- 可以有：限流、幂等计数
- 不可以有：存档、笔迹、身份、凭证、session

### 降级到底是什么语义（三条，别当 bug 报）

1. **进程级**，不是全局开关。每个进程各自判定，所以一台机器上跑两个进程就是两套计数。
2. **单向**。任一 Redis 命令失败即置 `degraded = true`，之后本进程不再回切 Redis。
   这是刻意的：`peek` 和 `incrWithTtl` 必须**同源**，否则"读到的"和"加上去的"会分家，
   `/link` 的建行预算就会漏算（那是安全性质，不是精度问题）。要恢复只能重启进程。
3. **降级那一刻桶不是"延续"，是"清零"**。内存里是一张新 Map，Redis 里的既有计数不会搬过来；
   反过来 Redis 恢复也不会把内存计数写回去。所以降级瞬间限流会短暂变松，
   这就是"限流是 best-effort"的实际含义——它防的是一台机器被无脑刷，不是精确配额。

**降级有两种，`/health` 只说得清第一种**（这是 K9，别当成"探活绿就没问题"）：

| 形态 | `limiter.kind` | `/health` 的 `redis` | 日志 |
| --- | --- | --- | --- |
| 启动时连不上（`createLimiter` 里 `ping` 失败） | `'memory'` | `"memory"` | 一行 `warn` |
| 运行中掉线（任一命令失败 → 闩锁） | **仍是 `'redis'`** | **仍是 `"up"`** | 一行 `warn`（`读取失败`/`退还失败`） |

两种都不影响 `ok`（`ok === (db === 'up')`），所以**现有任何探活/监控都抓不到**。
第二种尤其危险：指标看着正常，其实已经在内存里跑（见上面第 2 条，单向、不回切）。
`limiter.degraded()` 是本轮为此加上的**只读探针**（memory 恒 `false`，redis 返回闩锁），
目前只有冒烟的聚合断言在用；要真正可观测，必须**成对**做两件事：`redis.mjs` 的探针 + `/health` 输出。
**只加断言不加 `/health`，运维侧仍然是瞎的。**

接 `/health` 时**不要**写成 `redis: degraded ? 'down' : 'up'`：那把"降级但可用"报成不可用，
探活（Caddy / systemd / 云监控）可能因此摘流量，而**降级是设计内的**。推荐三态：

```
redis: "down" | "degraded" | "up" | "memory"     // ok 仍只看 db，不受影响
```

即：启动期失败 → `"memory"`／运行期闩锁 → `"degraded"`／正常 → `"up"`。一个字段说清三件事，
运维不用记两条规则，也不会误摘流量。

## 部署到测试机

现行事实：**测试机 `152.136.108.28` 上没有 Node**（所以 `node:http` 这条路要先装运行时）；PG 在**同机的 5432**；
Redis 在 `101.43.155.108:36379`，**Redis 6.2.6 / standalone / CentOS 7（`Linux 3.10.0-1160`）**，
`uptime_in_days` 已 700+ 天（说明这台机器上的 Redis 长期没重启过）。

**开发机到那台 Redis 的可达性会变**：曾经长期 `ECONNREFUSED`（安全组/白名单挡的，不是服务挂了——
`uptime` 反证了进程一直在跑），2026-11-24 23:47 放通后变 OPEN。注意**客户端看到的 `RST` 不能用来判断
"端口上有没有进程"**：防火墙 `REJECT` 也是立刻回 RST，和"没监听"在客户端完全一样（我们为此误判过一次）。

那台机器上 `db0` / `db6` 里有别人的键（`dbsize` 分别 79 / 63），**`db9` 是空的，冒烟一律用 db9**，
不许碰 db0/db6、不许 `FLUSHDB`。

版本已确认：开发期在**本机 `127.0.0.1:6379`（`redis_version 3.0.504`）**与**测试机 `36379`（`6.2.6`）**
两个版本上都跑过全套冒烟（`97/0`、`98/0`），`PEXPIRE` 与 `DECR` 在两端行为一致；
6.2.6 上跑完 db9 是 **0 键、无 `TTL=-1`**，说明"`DECR` 归零即 `DEL`"那条修法在跨版本上成立。

1. **运行时只能走容器**（这一条是实测结论，别按网上教程装 Node）
   测试机是 **CentOS 7 / glibc 2.17**，Node 20+ 的官方 linux-x64 二进制**跑不起来**（要求 glibc ≥ 2.28），
   `apt-get` 也不适用（那是 Debian/Ubuntu 的包管理）。可用的路只有一条：

   ```bash
   mkdir -p /opt/yiwen/kongshan-sync/current
   # 放代码 + 装依赖（在容器里装，宿主机不需要 node）
   docker run --rm -v /opt/yiwen/kongshan-sync/current:/app -w /app node:22 npm install --omit=dev
   docker run -d --restart=always --name anlewo-sync \
     --network host \
     -v /opt/yiwen/kongshan-sync/current:/app -w /app \
     --env-file /opt/yiwen/kongshan-sync/current/.env.local \
     node:22 node index.mjs
   ```
   `--network host` 是为了让容器里连**同机**的 PG（`127.0.0.1:5432`）与对测试机网段可达的 Redis；
   服务仍然只听 `127.0.0.1:3830`，由 Caddy 反代。容器模式下**不要**再用 `yiwen-anlewo-sync.service`（那是给有 Node 的机器准备的）。
2. **放代码**：把 `server/sync/` 拷到 `/opt/yiwen/kongshan-sync/current`，`npm install --omit=dev`
3. **写配置**：`/opt/yiwen/kongshan-sync/current/.env.local`（`chmod 600`，属主 `kongshan`）。`DATABASE_URL` 用**同机**的
   `127.0.0.1:5432/yiwen_anlewo`，`REDIS_URL` 用 `101.43.155.108:36379`（从测试机可达）
4. **补表**：`npm run migrate`（幂等），或手工 `psql -f db/V2__anlewo_sync_key.sql`
5. **systemd**：`cp yiwen-anlewo-sync.service /etc/systemd/system/` → `systemctl daemon-reload` → `enable --now`
6. **Caddy**：把 `Caddyfile.snippet` 里那两行加到现有 kongshan 站点块里（**放在 `handle /ws*` 旁边、`file_server` 之前**），
   先 `caddy validate`（在 /tmp 的副本上）再 `systemctl reload caddy`
7. **验收**：`curl -s https://kongshan.169-58-39-104.nip.io/api/anlewo/health` → `db:"up"`；同机 `curl 127.0.0.1:3830/api/anlewo/health` 一样
8. **CORS**：把真正在用的来源写进 `ANLEWO_CORS`（默认已含 GitHub Pages 与 nip.io 两个站）

回滚：`systemctl disable --now yiwen-anlewo-sync` + 撤掉 Caddy 里的 `handle /api/anlewo/*` 即可，
前端行为回到纯 localStorage（`VITE_ANLEWO_SYNC` 不设就是关）。

## 部署到正式 K8s（`anlewo.iwenxuai.com`）

清单在 `deploy/k8s/`：`sync-migrate-job.yaml.tmpl`（库迁移）→ `sync.yaml.tmpl`（同步服务）→ `deployment.yaml.tmpl`（静态站 + Ingress）。

**顺序不能反：先迁移，再起服务。** 新库上直接起 Deployment 也能活（`/health` 200），但写档会 503 `db_migration_missing`。

1. **镜像**：`server/sync/Dockerfile` 构建上下文是**仓库根目录**（`docker build -f server/sync/Dockerfile .`）。镜像里已带 `db/`（`MIGRATIONS_DIR=/app/db`）与 `migrate.mjs`，所以迁移不需要宿主机有 psql、也不需要另做镜像。
2. **secret**：`anlewo-sync-env` 至少给 `DATABASE_URL`（`sync.yaml.tmpl` 与 Job 都从这里取）。
3. **迁移**：
   ```bash
   envsubst '${IMAGE_TAG}' < deploy/k8s/sync-migrate-job.yaml.tmpl | kubectl apply -f -
   kubectl -n yiwen wait --for=condition=complete job/anlewo-sync-migrate --timeout=180s
   kubectl -n yiwen logs job/anlewo-sync-migrate   # 逐份 V*.sql + “六张表：齐 / payload 上限约束：在”
   ```
   失败时 Job 非 0 退出（`backoffLimit: 1`）；修好再重跑前先 `kubectl -n yiwen delete job anlewo-sync-migrate --ignore-not-found`（Job 的 spec 不可变更）。
4. **服务与站点**：`envsubst '${IMAGE_TAG}' < deploy/k8s/sync.yaml.tmpl | kubectl apply -f -`，再 apply `deployment.yaml.tmpl`。
5. **验收**：`curl -s https://anlewo.iwenxuai.com/api/anlewo/health` 应看到
   `{"ok":true,"db":"up","schema":{"tables":"ok","payloadLimit":"ok"},"redis":"memory","identity":"off"}`。
   `schema.tables` 是 `missing:…` 就回第 3 步看 Job 日志；`redis:"memory"` 是清单里没给 `REDIS_URL` 的正常形态（单副本时才安全，见 K9）。

改了 `db/` 里的 SQL：必须重跑第 3 步（Job 会幂等地把 V1→V… 全跑一遍），不要只重启 Deployment。

### 上限放宽（V5：1MB → 4MB）的滚动顺序

**先跑迁移，再发带新上限的服务端与前端**，顺序反了会出现“界面看着在同步、其实一次都没推上去”：

1. 目标库执行到 V5：K8s 走上面的 `anlewo-sync-migrate` Job，测试机/本地 `cd server/sync && npm run migrate`（= `node migrate.mjs`）。日志与 `/health` 都要看到 `payload 上限约束：在` / `schema.payloadLimit:"ok"`。
2. 再发镜像（`server/sync/Dockerfile`，含 `MAX_PAYLOAD_BYTES=4MB`、`BODY_LIMIT` 默认 6MB）与 `deployment.yaml.tmpl`（Ingress `proxy-body-size: 6m`），最后发前端（`SYNC_PUSH_LIMIT=4MB`）。
3. 只发一半的后果：老服务端仍按 1MB 回 413 `payload_too_large`，或库还是旧 CHECK——客户端超限时只在 `console.debug` 留一行、面板上挂“超上限停推”，不会有别的报错。
4. 回滚方向相反：先退代码、确认库里没有超过 1MB 的行，再把约束改回 1048576。

## 契约对照（docs/DB_SPLIT_FINAL.md §7）

| # | 兑现方式 |
| --- | --- |
| C1 | uid 只作标识：每个业务请求都要凭证；匿名期用独立 `sync_key`（只存 sha256）；OIDC 路径写库前必须 `/userinfo` 认过 |
| C2 | 接续码本期不做（无此功能，代码里没有相应路径） |
| C3 | `revision` 只由服务端 `revision+1` 分配，CAS 0 行即冲突 |
| C4 | 冲突（409）时客户端**不动本地**，改用服务端版本号重推本地那份；覆盖前由 `snapshotBefore` 在**同一事务**里把被替换的那一版存进 `save_snapshot(reason='sync')`。已对齐时不空写 |
| C5 | link + sync_key（+ device）同事务；绑定 = 快照 + 改 link 同事务 |
| C6 | 恢复只是把 JSON 原样写回 localStorage，不 assign 到内存；**随后本会话停止推送并重载一次**，由 `store.ts` 的 `load()` 逐字段校验接住（不重载会被内存空档反推回去） |
| C7 | `crypto.randomUUID ?? getRandomValues 手拼 v4`，没有安全随机源就放弃同步，不退到 `Math.random` |
| C8 | 独立目录／独立依赖／独立 systemd unit；`server/relay.mjs` 与 `server/package.json` 未改；CORS 白名单显式列两个正式站 |
| C9 | 前端一切失败只 `console.debug`，不改 UI，绝不回写覆盖 localStorage |
| C10 | `local_uid` / `identity_uid` 不进 `Saved`；`v:1` 不变，同步层不增删字段，主分支新增字段（如 `masterChosen`）随整包往返；flag 关时零请求、零新键 |
| C11 | issuer 走常量配置；`/userinfo` 15s 超时，失败降级不写库 |

明确留给后续的：接续码（C2）、凭证轮换、多设备按 `identity_uid` 归集、`/userinfo` 以外的 JWT 自验签。

## 已知限制（Known Issues，别按"没有"验收）

| # | 限制 | 影响 | 将来的解法 |
| --- | --- | --- | --- |
| K1 | **本期身份绑定是 1:1**：`anlewo_identity_link_subject_uq` 是 `(provider,issuer,subject)` 唯一，第二台设备拿同一个统一身份绑会 `409 identity_already_bound` | 多设备共享同一统一身份暂不可能 | 合并流程落地时放宽该唯一索引 / 把 `subject` 换成设备级标识 |
| K2 | 笔迹**只能备份不能恢复**（`GET /ink` 不回 `chars`，无单篇读取端点） | 换设备拿不回笔迹 | 加 `GET /ink/:pieceHash` |
| K3 | 写库**没有字节预算**：单 IP 限流 120/分，每个请求仍可写 ≤4MB | 极端情况下能写胖库（同实例还有身份库） | 加 `WRITE_BYTES_PER_MIN` 或按 uid 的存储配额 |
| K4 | ~~`save_snapshot` 没有自动清理任务~~ **已收口**：每次写快照后按用户删旧（`sync` 留最近 10 版、`pre_bind` 留最近 3 版，同一事务里做） | 以前每次"覆盖前留底"都多一行，上限放宽到 4MB 后一行可达 4MB | 剩余风险在 K3：没有按字节的写库预算 |
| K5 | 首次注册无凭证（`/link` 谁先来谁占这个 uuid） | uid 是 122bit 随机、不出现在 URL/日志，猜不到；但被抢先占掉后真机会 401 | 配合 K6 的受控重建 + 人工换 uid |
| K6 | 凭证行丢失的自动重建只覆盖"`created_at` 早于 10 分钟且还没有存档"的行 | 已有存档又丢了 `sync_key` 时仍需人工处理（见下） | 凭证轮换 + 审计 |
| K7 | `SIGTERM` 优雅退出只在 Linux 上有效，Windows 走 `TerminateProcess` | 本机开发时测不出来 | 部署后 `systemctl restart` 看日志那一行 |
| K8 | `db/V1__anlewo_core.sql` 头注释里的库名/列名（`yiwen_identity`、`users.user_id`）**待实机确认** | 只影响注释口径，不影响 DDL | 生产确认后统一改注释 |
| K9 | **Redis 降级对运维不可见**：启动期降级时 `/health` 报 `"memory"`，运行期降级时 `/health` **仍报 `"up"`**（`kind` 不变、闩锁不参与），日志只有 `warn` 级、`ok` 恒等于 `db === 'up'` | 单实例部署影响为零；一旦横向扩到 N 个实例：三个桶各算各的、额度放大 N 倍，且 `/link` 的**原子预留-退还跨进程失效**（建行上限实际失守）。降级单向、Redis 恢复后进程不会自愈，只能重启 | `/health` 增 `redis:"down"` 或 `degraded:true`（探针 `limiter.degraded()` 已就位，见「降级到底是什么语义」末表），并给 `warn` 文案配告警 |

### 人工恢复（P1-B / K6）

**先判"客户端手里还有没有 id"，再动手——两种故障的正确操作完全相反，搞反会毁数据。**
客户端的三样东西：`anlewo:id:v1`（uid + key）、`anlewo:v1`（存档）、服务端那份。

| # | 服务端 | 客户端 | `anlewo_save` 是什么 | 怎么办 |
| --- | --- | --- | --- | --- |
| **1** | 丢了 `anlewo_sync_key` 行 | 还有 `anlewo:id:v1` | 冗余副本（本地也有） | 可删服务端这一支，让客户端带自己的 key 重推 |
| **2** | 还有存档 | **连 id 都没了** | **唯一副本** | **禁止删除**。导出 payload → 粘回 localStorage（同一句里刷新） |
| **3** | `sync_key` 行还在 | 丢了 key、记得 uid | 冗余副本 | 服务端轮换 `key_hash`，客户端写回同 uid + 新 key |
| **4** | 都在 | 都在 | 都在 | 不是恢复问题：查凭证形状/限流/体积（见下面几节） |

#### 情况 1：服务端丢了 `anlewo_sync_key` 行，客户端还握着 id

客户端会用自己的 key 重新注册，首轮对账走 `push-first` 把本地那份推上来。删之前先留证：

```sql
SELECT revision, payload, updated_at FROM anlewo_save WHERE user_id = :'uid';

BEGIN;  -- 必须按外键反序，否则 ON DELETE RESTRICT 会挡在半路
DELETE FROM anlewo_save_snapshot WHERE user_id    = :'uid';
DELETE FROM anlewo_ink           WHERE user_id    = :'uid';
DELETE FROM anlewo_device        WHERE user_id    = :'uid';
DELETE FROM anlewo_save          WHERE user_id    = :'uid';
DELETE FROM anlewo_sync_key      WHERE local_uid  = :'uid';
DELETE FROM anlewo_identity_link WHERE local_uid  = :'uid';
COMMIT;
```

> 删完客户端下次开页面会用**同一个 uid** 重新注册，拿到指定的 key 行（新哈希），再把本地整包推上来。

#### 情况 2：客户端清了站点数据 / 换了浏览器，服务端还有存档

> ⚠️ **绝对不要执行情况 1 的脚本。** 此时 `anlewo_save` 是**唯一副本**，删掉即永久丢失；
> 而客户端会带着一个**新 uid** 注册，永远读不到老 uid 的数据。

1. 先导出（这就是全部家当）：
   ```sql
   SELECT payload FROM anlewo_save WHERE user_id = :'uid';
   ```
2. 交给用户在控制台执行——**粘贴、删锚、刷新必须在同一句里**：
   ```js
   localStorage['anlewo:v1'] = '<第 1 步导出的 payload JSON>'; delete localStorage['anlewo:sync:v1']; location.reload()
   ```
   为什么必须同一句：`store.ts` 在模块加载时就把 `anlewo:v1` 读进内存，之后每次状态变更都 300ms 防抖回写。
   先粘贴、隔一会儿再刷新，中间任何一次变动都会用内存里的默认值把刚粘贴的盖掉。

   **操作纪律**：整句**一次粘进去、一次回车**，执行完之前不做别的（不点页面、不按 F5）。刷新已经包含在那一句里了，
   再手动刷一次等于在"写入"与"重载"之间插进一次模块加载，刚粘贴的内容会被默认档盖掉，白跑一趟。

   为什么要删锚（`anlewo:sync:v1`）：不删的话，如果用户已经在新 uid 上玩过、并且成功推过一次档，
   那把锚就存在且 `anchor.revision` 正好等于服务端当前版本 → 首轮对账判成"本地改了、服务端没动"
   → `push` 且 **`snapshotBefore = false`**，服务端那份**不带留底**就被覆盖，新 uid 那段进度真丢。
   删掉锚之后判据变成 `no-anchor`（`reconcile.ts:105`），`snapshotNext` 为 `true`，覆盖前必留底。
   **这一行不是保险，是这支流程不丢数据的前提。**
3. 刷新后首轮对账只可能是两支，**按上面的写法两支都不丢**：
   - 服务端（此时是新 uid）还没有存档 → `push-first`，直接 `INSERT`，没有任何东西被覆盖；
   - 服务端已有一份 → `no-anchor` → `push`，**覆盖前在 `anlewo_save_snapshot` 留底**（`reason='sync'`），
     新 uid 那一版随时能查回来：
     ```sql
     SELECT revision, payload FROM anlewo_save_snapshot WHERE user_id = :'new_uid' ORDER BY snapshot_id DESC LIMIT 1;
     ```
   - **粘贴的内容解析失败**（少个引号、被聊天软件截断）时，`store.ts` 会回落成默认档，看起来像"档没恢复还倒退"。
     别急着重来：那一版同样会走进 `push` + 留底，上面那条 SQL 能把**粘贴前**的新 uid 版本捞回来，
     再从 `anlewo_save`/更早的快照里重新取正确 payload 重做一次即可。
   - **粘贴的内容与服务端原本一致**时，仍然会 `push` 一次（锚被删了，判据是 `no-anchor`，无从知道"内容一样"），
     `revision` +1 并多一行快照。**这是预期行为，不是故障**——它只是白推一次，代价一行快照。
4. **老 uid 的行留着当留档，不要删。**

#### 情况 3：`sync_key` 行还在，但客户端丢了 key（记得 uid）

库里只有 sha256，**还原不出原 key**，只能换一把（由运维在确认本人身份后执行）：

```sql
UPDATE anlewo_sync_key
   SET key_hash = encode(digest(:'new_key', 'sha256'), 'hex'), rotated_at = now()
 WHERE local_uid = :'uid';
```

客户端随后把 `{"v":1,"uid":"<同一个 uid>","key":"<新 key>","createdAt":<毫秒>}` 写回 `localStorage['anlewo:id:v1']`。
新 key 只能由客户端生成、经安全信道交给用户，**不要**写进文件/工单/日志。
（`digest()` 来自 `pgcrypto`，V1 已 `CREATE EXTENSION IF NOT EXISTS pgcrypto`。）

### 信任边界：`X-Forwarded-For` 取**最后一段**

`http.mjs::clientIp()` 只在 remote 是本机回环（也就是请求确实来自 Caddy）时才采信 `x-forwarded-for`，
并且取**最后一段**——Caddy 是**追加**，最后一段永远是它看到的真实来源；客户端自己伪造的前缀只会被挤到前面。
**不要"顺手"改成取第一段**，那等于把限流键交给客户端控制，是一个真洞。

### 冒烟脚本别对着线上库跑

`node server/sync/smoke.mjs` 会在**同一分钟内**打掉几十次 `/link` 与 `/health`，把那一分钟的 IP 桶额度用光
（后续真实用户会被 429），并且会往库里写/删几十行测试数据。只在测试库、且最好在没有真实流量时跑。
（它连的是 `.env.local` 指向的库，**不会自己判断是不是生产**。）

### 两种模式必须显式声明，项数就是凭据

`smoke.mjs` 会在启动后第一行打印它**期望**的 Redis 模式：

```
[smoke] 期望 redis 模式：up（按是否配 REDIS_URL 推断）
[smoke] 期望 redis 模式：memory（SMOKE_REDIS_MODE 显式指定）
```

优先级：`SMOKE_REDIS_MODE` > 按"是否配了 `REDIS_URL`"推断（用 dotenv 之后的生效值）。
取值只能是 `up` / `memory`，其他值直接 `exit 1`，连库都不连。

**`memory` 是"强制"不是"期望"**：显式声明 `memory` 时，套件会把传给 7 个实例的
`redisUrl` 一律清空（派生自同一个 `runtimeBase`），所以**同一条命令不会因为
`.env.local` 里的 Redis 通或断而给出不同答案**。不清掉的话同一个命令会给出
99 / 98 / 红 三种结果，而三种都"看起来正常"——这是踩过的坑，不是假想。

```bash
# 内存维度：强制走内存，与 .env.local 里的 Redis 通不通无关
SMOKE_REDIS_MODE=memory node server/sync/smoke.mjs

# 真 Redis 维度（本机实例；测试机那条见「部署到测试机」，口令从 .env.local 借，别写进 argv）
SMOKE_REDIS_MODE=up REDIS_URL=redis://127.0.0.1:6379/9 node server/sync/smoke.mjs
```

**附带一条结构性核对**（比"99/0"更能证明模式真的是模式）：`createLimiter` 在 `url` 为空时
每个实例打一行 `未配置 REDIS_URL：限流走内存实现`，所以

| 跑法 | `grep -c '未配置 REDIS_URL'` | 含义 |
| --- | --- | --- |
| `SMOKE_REDIS_MODE=memory` | **7** | 7 个实例**全部**走内存 |
| `SMOKE_REDIS_MODE=up` | **0** | 7 个全在 Redis 上 |

只清主实例、漏了另外 6 个的派生源时，这个数是 **1** —— 而那一跑照样 99/0、
照样打"降级 0 个 / 共 7 个"，是个看不出问题的混合态。**所以项数之外还要数这一行。**

**为什么非得显式**：`/health` 的 `redis` 字段只反映**构造期**的 `limiter.kind`（`http.mjs`），
而 `kind` 只有 `'redis'` / `'memory'` 两值。早先那条断言写成 `redis === 'up' || redis === 'memory'`
——**枚举全覆盖、语法上不可能失败**，于是"以为在验 Redis、其实启动时就降级成内存"会静默全绿。
现在断言改成"必须等于期望值"，所以：`.env.local` 里有 `REDIS_URL` 但连不上 → **红**，红在唯一该红的那条上。

**项数注册表（改断言/加断言前先读这张表）**

| 模式 | 默认 | `--keep` |
| --- | --- | --- |
| 内存 | **99** | 97 |
| 真 Redis | **98** | 96 |

- 真 Redis 比内存少 1：真后端没有 `size()`，`坏头没有建出限流键` 那条分支不执行。
- `--keep` 少 2：`ok(按逆序删完…)` 与 `check(测试造的行一行不剩)` 都在清理分支里。
- **`failed=0` 但项数少于表里这个数 = 结构变了**（有人删了 `check` 或 `ok`），
  **不许重新解释成"正常波动"**。这条纪律是写在这里给下一个人看的，也是我们自己踩过的坑。
- `--keep` 两格是静态推导（`96 check + 2 ok() = 98`，再扣 Redis 的 `size()` 与清理的 2 条），**未实测**。

**跑中断了会留残行**：清理是按 `cleanupUids` 逐 uid 删的，看不到别人留下的行。
所以中断（Ctrl-C、断言中途抛错）之后必须**人工按 uid 显式清**，别指望下一跑顺手带走：

```sql
-- 找出来
SELECT local_uid, created_at FROM anlewo_identity_link
 WHERE created_at > now() - interval '2 hours' ORDER BY created_at;
-- 确认是测试行后，按外键反序删（见「人工恢复·情况 1」的顺序）
```

