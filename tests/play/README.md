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
| `motion.mjs [--shots]` | 人的动态（66 项）：按键方向、步态（步幅、步频、脚滑不滑、单双支撑、起伏、摆臂）、快走有腾空、起停、掉头；**坡与台阶**（院前到溪边的缓坡、草堂的踏步石与台基、石桥、观物亭的踏步、汀步）身子升降连贯、脚不陷；顶着篱笆停住、斜着顺着滑；跪、盘坐、坐凳、蹲不穿地；镜头不进墙、不钻地 |
| `acts.mjs [id,id…] [--mobile]` | 每一件事从几步之外走过去、站定开始、按流程做完、站起来能走、观象记进册子、没有报错；截图在 `shots/acts/` |
| `flow.mjs [网址] [--mobile]` | 真实流程：题名页 → 入 → 走 → 走近一件事按 E → 毕 → 村图换处 → 本机存档 |
| `offline.mjs <网址>` | 正式构建：来过一次之后断网重开还进得来 |
| `smoke.mjs` | 每件事进去看一眼、截一张、出来 |
| `shot.mjs <目录> 名字=网址 …` | 等 `window.__ready` 再截图，打印页面报错（`--w --h --dpr --mobile --wait --eval=`） |
| `audio*.mjs` | 声音的离线渲染与数值（见 `docs/AUDIO.md`） |

网址参数：`s=grove|bridge|yard|hall|pavilion|fields|village|ferry`、`t=dawn|day|dusk|night|几点`、`w=clear|mist|rain|snow`、`season=`、`q=low|mid|high`、`act=<事的 id>`。页面好了会置 `window.__ready`；`window.__ks` 是整个世界（`Anlewo`），`window.__walk` 是行走图（`walk.ts` 的函数，外加 `_debug`）。

`probe.js` 是注到页面里的探针：每帧记人的位置、脚、胯、头、两手、手要去够的目标、镜头。

正式构建放在子目录下验证：`node tests/play/serve.mjs dist 3899`（Git Bash 里别传第三个参数，`/kongshan/` 会被改写成本机路径），再 `node tests/play/flow.mjs http://localhost:3899/kongshan/`、`node tests/play/offline.mjs http://localhost:3899/kongshan/`。
