# 在浏览器里跑的检查

用无头 Chrome（走显卡）打开真的页面，用真实的按键、点按、拖动去操作，量数值、截图。不进 `npm test`（那是纯逻辑的单元测试），要另外跑。

## 准备

1. 本机要有 Chrome；`npm install` 会装上 `playwright-core`（只是驱动，不下载浏览器）。
2. 另起一个**不带热更新**的开发服务器在 3801 端口（带热更新的话，别处一改文件页面就重载，数值就乱了）：

   ```
   # PowerShell
   $env:KS_NOHMR="1"; npx vite --port 3801 --strictPort --host
   # bash
   KS_NOHMR=1 npx vite --port 3801 --strictPort --host
   ```

3. 跑的时候别同时做别的重活（打包、别的测试）：帧一卡，脚滑、手跟不跟得上这类数值就不准。

截图与连环画落在仓库根下的 `shots/`（已在 .gitignore 里）。想换服务器地址：环境变量 `KS_URL`。

## 各个脚本

| 脚本 | 看什么 |
| --- | --- |
| `node tests/play/motion.mjs [--shots]` | **人的动态**（58 项）：按键方向、步频步幅、着地的脚滑不滑、身子起伏、摆臂、起停、掉头、上下台阶（身子连贯、脚不陷进踏面）、撞墙、跪坐蹲不穿地、镜头不进墙 |
| `node tests/play/acts.mjs [活动,活动…] [--mobile]` | **人与器物**（81 项）：十二件事各自从几步之外走过去做一遍——走到位、手够没够到、东西在不在该在的地方、做完站不站得起来。沿途截图 |
| `node tests/play/strip.mjs [walk,run,turn,stairs,bow,sit…]` | **连环画**：把一段连续动作逐帧截下来拼成一张图，用眼睛看过渡 |
| `node tests/play/ui.mjs [--mobile] [名字…]` | 带界面的截图：主按钮、标记、摇杆、各项活动的面板挡不挡人；报告出界的元素 |
| `node tests/play/flow.mjs [网址] [--mobile]` | 真实流程：开场 → 入山 → 走上石阶 → 找路到香炉 → 上香 → 毕 → 寺图换处 |
| `node tests/play/offline.mjs <网址>` | 正式构建：来过一次之后断网重开 |
| `node tests/play/serve.mjs dist [端口] [子路径]` | 把 `dist/` 当成子目录下的静态站托管（模拟 GitHub Pages 的 `/kongshan/`）。Git Bash 里别传第三个参数（`/kongshan/` 会被它改写成本机路径），用默认值 |
| `node tests/play/smoke.mjs [活动…]` | 冒烟：每件事进去看一眼、截一张 |

`probe.js` 是注到页面里的探针：每帧记下小人的位置、速度、两脚（脚跟与前掌）、胯、头、两手、手要去够的目标、镜头。

## 怎么读结果

- 「手离要够的地方」超过五六厘米，多半是**够不到**（手臂从肩到掌心只有 0.53 米）：改站位、探身的幅度、器物的摆法，别让东西自己飞到手里。
- 台阶上「脚陷进踏面」是拿脚的位置去比 `walk.ts` 的地面：先确认 `walk.ts` 里那一级的高度与实际的几何一致。
- 数值都过了不等于看着自然：`strip.mjs` 的连环画要真的打开看。
