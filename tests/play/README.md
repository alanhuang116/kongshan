# 浏览器里跑的检查

都用 `playwright-core` 开本机的 Chrome（`channel: 'chrome'`，启动参数 `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist`，无头也能用上显卡），用真实的按键、点按、拖动去走、去做。

先另起一个**不做热更新**的开发服务器（别处一改文件，页面就会重载，数值就不准）：

```
# PowerShell，在盘符大写的路径里
Set-Location "D:\_work_Liuyao\yiwen-kongshan"; $env:KS_NOHMR="1"; npx vite --port 3801 --strictPort --host
```

默认打开 `http://localhost:3801/`（正式的界面，带 `?auto=1&ui=0`）。只想看世界、不要界面时用开发的台子：`KS_URL=http://localhost:3801/world.html node tests/play/…`。测试时别同时跑别的重活，帧一卡数值就不准。

| 脚本 | 看什么 |
| --- | --- |
| `all.mjs [名字…] [--skip=…]` | **一次把下面的都跑一遍**，最后列一张表（约一个钟头；`KS_HOST` 换服务器） |
| `core.mjs` | 大家共用的底子：时辰流转过子夜是新的一天、榻上睡到天亮也算一夜；键盘散步、Shift 跑、松手停；屋顶遮罩（草堂、亭都登记了，屋里遮着、院里露天，进草堂时屋顶剖开） |
| `talk.mjs [时辰…]` | 说话：三个时辰把在外头的人一个个走过去说话、送东西、做成三件托事；面板在三种尺寸下放得下（约 10 分钟） |
| `stars.mjs [--shots]` | 观星：走到席边、躺下、镜头抬起、点星认星官、四象、候星移、流星、起身；认北斗；雨夜白天没有观星 |
| `farm.mjs [spring,summer,autumn] [--mobile]` | 农事整条链：翻地到磨面舂米，行囊里的数目对；换季（约 10 分钟） |
| `beasts.mjs` | 生灵：鸟兽虫鱼在不在、动得自然不自然、喂鸡摸狗那些互动 |
| `games.mjs` | 器物与玩：秋千、摇橹、垂钓、纸鸢、投壶、打水漂、堆雪人、点灯、扫院、风铃，每样从头玩到尾、记分对、退出后站得起来能走；柴门开合（约 15 分钟） |
| `day.mjs [--season=…] [--wet=0,1] [--no-shots]` | 村里的一天：四季晴雨八种一天全跑，没人穿墙、进深水、卡住、叠在一起（约 6 分钟一轮） |
| `ui.mjs [尺寸,…\|all] [--only=…]` | 界面：六种尺寸（电脑、笔记本、平板、iPhone、SE、横屏手机）各走三十来屏（夜里另有抬头点星、点天汉出的两张星笺，与点「收」收起），查出界、截断、落进安全区、键太小、两键相叠、字与底的对比；截图在 `shots/ui/<尺寸>/`（用正式界面的网址） |
| `motion.mjs [--shots]` | 人的动态（136 项）：走、快走、跑时腿不从衣裳里穿出来、手不插进衣身、两只手都在摆（`clip.js` 逐帧量）；走、快走、跑（起跑、急停、转弯内倾、跑上坡台阶）、闲时小动作、仰卧、挑担放慢；按键方向、步态（步幅、步频、脚滑不滑、单双支撑、起伏、摆臂）、快走有腾空、起停、掉头；**坡与台阶**（院前到溪边的缓坡、草堂的踏步石与台基、石桥、观物亭的踏步、汀步）身子升降连贯、脚不陷；顶着篱笆停住、斜着顺着滑；跪、盘坐、坐凳、蹲不穿地；镜头不进墙、不钻地 |
| `acts.mjs [id,id…] [--mobile]` | 每一件事从几步之外走过去、站定开始、按流程做完、站起来能走、观象记进册子、没有报错；截图在 `shots/acts/` |
| `flow.mjs [desk|phone|land|<尺寸>]` | 真实流程：题名页 → 入 → 走 → 走近一件事按 E → 毕 → 村图换处 → 本机存档（网址用 `KS_URL=…` 给，默认 3801 的正式界面） |
| `together.mjs` | 同游：自己在本机起中转（`server/relay.mjs`，3820），开两页正式界面互相看见、名签对得上；走动在对方那里匀速平滑、停得准；作揖与回礼、几句话、同行、换雅号、独游再同游；关掉一页人就散；中转停了两边照常玩、再起来自己连回去；面板六种尺寸昼夜不出界（见 `docs/NET.md`） |
| `steer.mjs [尺寸,…]` | 触屏摇橹的「左」「右」两枚转向键：竖着、横着的手机上都出来、不压着别的键；按住往那边转、松开舵回正 |
| `offline.mjs <网址>` | 正式构建：来过一次之后断网重开还进得来 |
| `smoke.mjs` | 每件事进去看一眼、截一张、出来 |
| `shot.mjs <目录> 名字=网址 …` | 等 `window.__ready` 再截图，打印页面报错（`--w --h --dpr --mobile --wait --eval=`） |
| `audio*.mjs` | 声音的离线渲染与数值（见 `docs/AUDIO.md`） |

网址参数：`s=grove|bridge|yard|hall|pavilion|fields|village|ferry`、`t=dawn|day|dusk|night|几点`、`w=clear|mist|rain|snow`、`season=`、`q=low|mid|high`、`act=<事的 id>`、`flow=<每秒几个钟头>`（台子上不给就停着；正式界面里 `flow=0` 停着）、`run=1`（台子上一直跑）。页面好了会置 `window.__ready`；`window.__ks` 是整个世界（`Anlewo`），`window.__walk` 是行走图（`walk.ts` 的函数，外加 `_debug`）。

`probe.js` 是注到页面里的探针：每帧记人的位置、脚、胯、头、两手、手要去够的目标、镜头。`clip.js` 量这一帧袜筒、鞋有没有和衣身相交（穿出布），手在不在衣身里头。

正式构建放在子目录下验证：`node tests/play/serve.mjs dist 3899`（Git Bash 里别传第三个参数，`/kongshan/` 会被改写成本机路径），再 `KS_URL=http://localhost:3899/kongshan/ node tests/play/flow.mjs desk`（与 `phone`）、`node tests/play/offline.mjs http://localhost:3899/kongshan/`。
