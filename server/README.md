# 同游的中转（relay）

安乐窝的「同游」：同一间屋子（至多 24 人）里的游人互相看得见、作揖、说一句现成的话、同行。网页本身仍是纯静态的（GitHub Pages 与服务器上同一份），只有这一个很小的 WebSocket 服务要跑在服务器上。客户端那一半在 `src/world/net/`，说明见 `docs/NET.md`。

- **不存任何东西**：没有账号、没有数据库、没有日志里的地址；进程一停，屋子与人都没了，客户端过一会儿自己重连。
- **没有任何密钥**：不需要环境文件。
- **线上没有一个自由写的字**：名字、衣色、话、处、事、姿态都是 `proto.json` 里各张单子的序号；数要有限、在范围里。认不得的整条不要，不对的太多就断开。

| 文件 | 管什么 |
| --- | --- |
| `relay.mjs` | 进程本身：HTTP（`/health`）+ WebSocket（`/ws`）、来源放行、连接上限、心跳、停时告别 |
| `core.mjs` | 不碰网络的那一半：认字段、分屋子、限速、一拍一拍地发（单元测试 `tests/net.test.ts` 直接驱动它） |
| `proto.json` | 两边共用的单子（客户端 `src/world/net/proto.ts` 读同一个文件）。**只往后添，不改前面的次序** |
| `check.mjs` | 看一眼通不通：连上、报名字、等「进门」 |
| `yiwen-kongshan-relay.service` | systemd 单元 |
| `Caddyfile.snippet` | 加进现有 kongshan 站点那一块的 `handle /ws*` |
| `package.json`、`package-lock.json` | 只为线上装 `ws`（与仓库根上的版本一致：8.23.0） |

## 本机跑

```
node server/relay.mjs                         # 听 127.0.0.1:3820；KS_RELAY_LOG=1 多打几行
node server/check.mjs                         # 另开一个窗口：ok … 进了 r1
```

再开两页（开发服务器默认不连，要在网址上给）：`http://localhost:3800/?ws=ws://localhost:3820/ws`。手机在同一个局域网里试：`KS_RELAY_HOST=0.0.0.0 KS_RELAY_ORIGINS=http://<电脑的地址>:3800 node server/relay.mjs`，网址给 `?ws=ws://<电脑的地址>:3820/ws`。

自动检查：`KS_URL=http://localhost:3800/ node tests/play/together.mjs`（它自己起中转、开几页、放十个机器人进来量开销，见 `tests/play/README.md` 的写法）。

环境变量（都可不给）：`KS_RELAY_PORT`（3820）、`KS_RELAY_HOST`（127.0.0.1）、`KS_RELAY_ROOM`（24）、`KS_RELAY_MAX`（240）、`KS_RELAY_PER_IP`（12）、`KS_RELAY_ORIGINS`（另外放行的来源，逗号分开；两个正式的站与 localhost、127.0.0.1 总是放行）、`KS_RELAY_LOG`。

## 规矩（中转这边守着的）

| 项 | 怎样 |
| --- | --- |
| 来源 | `https://alanhuang116.github.io`、`https://kongshan.169-58-39-104.nip.io`、`http(s)://localhost:*`、`127.0.0.1:*`，另加 `KS_RELAY_ORIGINS`；别的来源 403（只防别的网站拿它去用，非浏览器能冒充来源——反正什么也拿不走） |
| 连接 | 总共 240；同一个地址 12（经 Caddy 来的按 `X-Forwarded-For` 的最后一段，只信本机转来的）；满了先握手再用 4002 断开（客户端等半分钟再来），超过 240+32 连握手都不做（503） |
| 一条消息 | 至多 512 字节（`ws` 的 maxPayload，超了它自己断开）；不收二进制 |
| 快慢 | 每个连接：所有消息每秒 25 条（攒得下 40）；位置每秒 12 条（客户端每秒至多 8 条，多的丢掉不算错）；作揖、说话、同行每 1.25 秒一回（攒得下 3）；换名字 4 秒一回 |
| 不对 | 不是 JSON、字段不对、不认得的种类、太快、太长：记一笔，十秒里过了 12 笔用 4000 断开 |
| 作揖、说话 | 只给同屋、按两人最后报来的位置在 40 米以内的人（客户端那边只在 12 米内给按） |
| 心跳 | 20 秒一 ping，上一回的 pong 没回来就断开；连上了 8 秒不报名字的断开（4004） |
| 屋子 | 进人最多、还没满的那间；断线重连可以要回原来那间（还在、有空的话）；走光了就没了 |
| 发 | 每 100 毫秒一拍：这一拍里动过的人打成一条发给同屋各人；某人的连接慢（排队过 64 KB）先不发位置，好了补一整份；排队过 1 MB 断开 |
| 版本 | 报上来的 `v` 与 `proto.json` 的不同：回一句 `no`、用 4001 断开（客户端不再连，等用户重开页面换新的一版） |

消息的样子见 `core.mjs`（客户端那边 `src/world/net/wire.ts` 一一对应）。

## 部署（还没部署；要用户当次明说再做）

服务器（与一念、时藏等同机）：用户 `kongshan`，代码在 `/opt/yiwen/kongshan-relay/<commit>/`，`current` 指着当前那一版；systemd `yiwen-kongshan-relay.service` 只听 `127.0.0.1:3820`；Caddy 在现有的 kongshan 站点那一块里把 `/ws*` 转过去。静态站那一半（`/opt/yiwen/kongshan/current`）不动。

第一次：

```bash
# 本机（仓库根，提交之后）：只打 server/ 这一个目录
git -c core.autocrlf=false archive --format=tar.gz HEAD:server > kongshan-relay-<c>.tgz
scp kongshan-relay-<c>.tgz root@<服务器>:/opt/yiwen/

# 服务器上
id kongshan >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin kongshan
mkdir -p /opt/yiwen/kongshan-relay/<c> && tar -xzf /opt/yiwen/kongshan-relay-<c>.tgz -C /opt/yiwen/kongshan-relay/<c>
cd /opt/yiwen/kongshan-relay/<c> && npm ci --omit=dev --no-audit --no-fund      # 只装 ws
chown -R root:root /opt/yiwen/kongshan-relay/<c> && chmod -R a+rX /opt/yiwen/kongshan-relay/<c>
ln -sfn /opt/yiwen/kongshan-relay/<c> /opt/yiwen/kongshan-relay/current
mkdir -p /var/log/yiwen && touch /var/log/yiwen/yiwen-kongshan-relay.log && chown kongshan:kongshan /var/log/yiwen/yiwen-kongshan-relay.log
cp /opt/yiwen/kongshan-relay/current/yiwen-kongshan-relay.service /etc/systemd/system/
sed -i 's/\r$//' /etc/systemd/system/yiwen-kongshan-relay.service     # 从 Windows 过去的文件先去掉回车
systemctl daemon-reload && systemctl enable --now yiwen-kongshan-relay
curl -s http://127.0.0.1:3820/health                                  # {"ok":true,"v":1,"rooms":0,"players":0}
node /opt/yiwen/kongshan-relay/current/check.mjs                      # ok … 进了 r1

# Caddy：把 Caddyfile.snippet 里的 handle /ws* 加进 kongshan 那一块（file_server 之前）
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)
cp /etc/caddy/Caddyfile /tmp/Caddyfile.new && <编辑 /tmp/Caddyfile.new> && caddy validate --config /tmp/Caddyfile.new --adapter caddyfile
cp /tmp/Caddyfile.new /etc/caddy/Caddyfile && systemctl reload caddy
```

核对（在本机）：

```
curl -s https://kongshan.169-58-39-104.nip.io/ws/health                # {"ok":true,…}
node server/check.mjs wss://kongshan.169-58-39-104.nip.io/ws           # ok … 进了 r1
curl -s -o /dev/null -w "%{http_code}\n" https://kongshan.169-58-39-104.nip.io/   # 200：静态站照旧
```

再用两台设备（或电脑开两个窗口，一个用隐身窗口——各有各的名字）打开线上地址，右上「同游」那一枚写着「一位」，互相看得见。GitHub Pages 上那一份连的也是这个中转（`src/world/net/words.ts` 的 `DEFAULT_RELAY`），所以两边的人能遇见。

更新：解到新的 `/opt/yiwen/kongshan-relay/<新c>/`，`npm ci --omit=dev`，`ln -sfn` 指过去，`systemctl restart yiwen-kongshan-relay`（各人断一下，一两秒后自己连回来）。单元改了才要重新 `cp` 与 `daemon-reload`。回滚：`current` 指回旧目录再 restart。旧目录留两三个。

`proto.json` 改了（单子添了几项）：中转与网页最好同时更新——中转先更新也不妨（旧网页报的序号仍在范围里）；网页先更新、用了新添的序号，旧中转会当作不对丢掉那一条。只有改了消息的样子才把 `v` 加一（旧网页会被请去重开）。

## 还没有的

- 没有在真正的服务器上跑过（只在本机跑过，Node 20）；Caddy 2.6 转 WebSocket 时与 `encode` 同在一块里应当无妨，部署后用 `check.mjs` 核一遍。
- 没有「屏蔽某人」：线上没有自由写的字，最多是有人一直作揖——每 1.25 秒一回的上限挡着；以后要加，就在客户端记一张「不理会」的单子。
- 一台进程：人多到几百人以上要分到几台、或按处分屋子，眼下用不着。
