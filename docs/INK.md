# 画法（安乐窝的美术与渲染约定）

这一版不是「照着光算出来」的三维，是「画出来」的：一幅会动、可以走进去的山水。凡是往画里添东西（草木、屋舍、人物、烟雨），都按这里的约定来，画面才是一幅画而不是几种风格的拼贴。

## 一、要的是什么样子

- **近处淡彩，远景水墨。** 人身边几十米是淡淡的设色（土墙的赭、新叶的汁绿、桃花的胭脂）；越远越褪成偏花青的墨色，几百米外就是黑白山水。全画最艳的只有两样：桃花，和天上那一点淡朱的日头。
- **纸。** 底是带一点暖的旧纸色；天就是纸，不涂蓝。雾比纸白。夜里纸是深青，白衣、花、水、窗纸浮出来。
- **留白。** 天、水、雾、路面、受光的石面大片不画。宁可少画。
- **线。** 轮廓与转折处有墨线（自动勾的），粗细浓淡有变化、时有飞白。花、叶、草不勾线（没骨）。
- **格局要大。** 远处是立体的群山（嵩山、伊阙、石峰），山脚没在游动的云雾里，山头露在外面；峰顶立松。
- 参考：传统浅绛、小青绿山水；动画《山水情》；用户给的一支虚幻引擎「国风水墨画」短片（暖色旧纸、淡青绿的山石上勾墨线、峰顶立松、层层淡蓝远山、淡朱的日、江上帆影）。借它的意思，不照抄它的写实模型。
- 不要：写实贴图、高光、投影、发光描边、饱和的颜色、卡通的粗黑边、把纸涂满。

## 二、一帧怎么画出来（`src/world/ink/painter.ts`）

1. **设色**：三维的东西画进两张图——颜色，和「朝向 / 积墨 / 勾线轻重」（外加深度）。四倍多重采样。
2. **积墨、勾线**（满屏一遍）：山（`crest`）从每一道山脊往下由浓到淡；远近突变处、朝向突变处落墨线，线归前面那个东西管。
3. **罩染**：水、雾、烟、雨雪、光晕这些半透明的东西画在线之上（第 `FX_LAYER` 层），自己去比深度。
4. **装裱**：纸纹，画心四边不齐地褪进纸里。

没有灯、没有影子、没有色调映射、没有环境贴图。`THREE.ColorManagement` 是关的：所有颜色都按屏幕上看到的样子给（0…1），贴图一律 `NoColorSpace`。

**因此有一条硬规矩**：主画面里的每一个材质都必须是这套画法的材质（`wash`、`dabMat`，或自己写的、照下面模板输出两张图的着色器）。用 `MeshStandardMaterial / MeshBasicMaterial / LineBasicMaterial / PointsMaterial / Sprite` 会把第二张图写坏（勾线乱掉）。半透明的东西一律走第三步（见第五节）。

## 三、怎么上色（`src/world/ink/ink.ts`）

颜色不是「物体色 × 光」，是「纸 × 颜料^浓度」：

- **颜料 `pig`**：薄薄一层透在白纸上的颜色，每个分量 0…1（越小越深、越偏那个色的补色）。`PIG` 里有一套国画颜料：`mo` 墨、`jiao` 焦墨、`zhe` 赭石、`tu` 土黄、`qing` 花青、`huang` 藤黄、`zhi` 胭脂、`zhu` 朱砂、`shiqing` 石青、`shilv` 石绿、`cao` 草绿、`zhi_lv` 汁绿、`lao` 老绿、`mao` 茅草。也可以自己给 `[r, g, b]`，但别太艳——一层颜料的三个分量一般都在 0.5 以上。
- **浓度 `dens`**：叠几层。0.2 极淡的一抹，1 中等，2.5 以上很深（树干、深色的木）。
- **`shade`**：背光面是受光面的几倍浓（只分阴阳两面，交界带水渍似的不齐）。`flat: 1` 则平涂。
- **`body`**：0 是透在纸上的淡彩（夜里跟着纸一起暗下去，远了褪成墨色）；1 是不透明的粉彩（白衣、花、雪、纸窗——夜里、远处都留着自己的颜色）。
- **笔触**：`streak: [沿u每米几丝, 沿v每米几丝, 深浅]` 干笔（茅草、木纹、树皮；几何的 uv 以米计）；`cun` 皴（顺坡而下的长线：石、土坡、山，`cunSize` 是笔触的尺度）；`strata: [每米几版, 深浅]` 版筑土墙；`crack: [块多大, 深浅]` 石面的块缝；`grain` 水渍的粗细（每米几个起伏：小物件 1~2，墙 0.5~1，地 0.3，山 0.005~0.03）。
- **`line`**：勾线的轻重（1 实，0 不勾）。**`crest`**：积墨（只有山、大的冈峦用）。**`snow`**：积雪几成。**`glow: [r,g,b]`**：夜里自己亮多少（窗纸、灯笼）。**`sway`**：随风摆（几何上要有 `sway` 属性，`FGeo` 会带）。**`map`**：贴图的 rgb 当颜料乘上去，`cut: true` 按透明度镂空。

```ts
import { PIG, wash, rewash } from '../ink/ink';
const earth = wash({ pig: PIG.tu, dens: 1.1, shade: 1.45, grain: 0.9, strata: [2.6, 0.5] });   // 土墙
const wood  = wash({ pig: [0.72, 0.6, 0.5], dens: 1.9, shade: 1.5, streak: [22, 1.2, 0.35] }); // 木
const stone = wash({ pig: PIG.mo, dens: 0.8, shade: 2.0, cun: 1.1, grain: 1.2 });              // 石
const white = wash({ pig: [0.95, 0.95, 0.93], dens: 1, body: 1, shade: 1.25 });                // 白衣
const dark  = rewash(wood, { dens: 2.6 });   // 由一种派生另一种。不要 material.clone()（会把共用的量拆开）
```

- 几何**必须**有 `position / normal / uv / color` 四个属性（`core/geo.ts` 出来的都有；自己用 three 的几何要补 `color`，全填 1）。顶点色乘在颜料上：小于 1 更深；也可以用它在一块网格上分出不同的颜料（地面就是 `pig: [1,1,1]`，颜料全写在顶点色里）。
- 所有材质共用 `U` 里的一组量（纸色、雾、风、夜……由天时 `env/atmos.ts` 每帧写）。不要自己改 `U`。

### 点叶、点花（没骨）

叶、花、草、远树不建模，是一笔一笔点上去的：每一笔是一张永远朝着看画人的小方片，形状来自现画的笔触图集。

```ts
import { dabMat, dabMesh, type Dab } from '../ink/ink';
import { atlas, TILES, stroke, blob, leaf, flower5, ink, type Tile } from '../ink/brush';
const A = atlas([TILES.blossom, TILES.bloom, myTile], 2, Math.round(192 * q.tex), seed);   // 现画一张图集（几格、每行几格、每格像素）
const dabs: Dab[] = [{ x, y, z, size: 0.4, nx, ny, nz, tile: 0, r: 1, g: 1, b: 1, rot: 0, sway: 0.6 }];
scene.add(dabMesh(dabs, dabMat({ ...A, pig: [0.97, 0.7, 0.74], accent: [0.78, 0.22, 0.3], dens: 0.95, shade: 1.35, body: 0.72, sway: 0.5 })));
```

- 图集每格里：红通道是这一处着色多浓，绿通道是点缀色（花蕊、嫩芽）占几成，透明度是形状。画的时候颜色用 `ink(浓, 点缀)`；坐标按一格 1×1、原点在左上、y 朝下。`brush.ts` 里有 `stroke`（一笔，宽度随行程变）、`blob`（墨团）、`leaf`（尖叶）、`flower5`（五瓣花）和一批现成的格 `TILES`。新的笔触在自己的模块里画，不必改 `brush.ts`。
- 一笔的 `nx ny nz` 是「朝外」的方向（从树心指向它），定这一笔在阴面还是阳面。`rot` 是在画面里转多少；草、垂柳、松盖这类有上下的笔 `rot` 只给很小的值。`r g b` 乘在颜料上（每笔略有深浅）。`size` 是边长（米）。
- **笔要肥**：图案的细节别小于格宽的 6%，太细的在远处会糊成一个方片。远树用成团的大笔。
- 一种颜料一个 `dabMesh`（一次绘制）；一整片林子的同一种笔并成一个，不要一棵树一个。`dabMesh` 之后要改某些笔，改它几何里的 `aPos/aDir/aCol` 再置 `needsUpdate`；整体显隐、淡入淡出改材质的 `uniforms.uQ.value.z`（0…1）。

### 自己写着色器时的模板

主画面（第一步）里的：
```glsl
// 片元着色器。不要设 glslVersion；照常写 gl_FragColor
layout(location = 1) out highp vec4 gAux;
${INK_PARS}                      // 共用的量、in3() 噪声、inkFogK() 雾、inkFar() 远处褪墨
void main() {
  vec3 c = uPaper * pow(pig, vec3(dens));        // 纸 × 颜料^浓度（粉彩把 uPaper 换成 uLight）
  c = inkFar(c, vWorld, 0.0);                      // 远处褪成墨色（第三个参数：粉彩给 1）
  c = mix(c, uMist, inkFogK(vWorld));              // 雾
  gl_FragColor = vec4(c, 1.0);
  gAux = vec4(viewNormal.xy * 0.5 + 0.5, 0.0 /* 积墨 */, 1.0 /* 勾线轻重 */);
}
```
uniforms 里要展开 `...U`。GLSL ES 3 的保留字别拿来当变量名（`patch`、`sample`、`smooth`、`flat`、`input`、`output`、`filter`、`common`、`active`、`partition` 等）。

## 四、几何怎么搭（`src/world/core/geo.ts`、`src/world/env/flora/kit.ts`）

- `box / boxUp / cyl / cylUp / sphere / lathe / lathe4 / prism / extrude / sweep / grid`：出来的几何都不带索引、四个属性齐全，uv 以米计（木纹沿 v）。`tint / shade / colorize / under` 改顶点色。`rockGeo` 一块石头。`M.t / M.ry / M.mul / M.trs / M.span` 摆位置。
- `Builder`：`b.add('材质名', 几何)`、`b.inst(key, '材质名', 造几何, 矩阵)`、`b.push(m)/pop()`，最后 `b.build({材质名: 材质})` ——同一种材质并成一块网格，一栋屋只有几次绘制。
- `FGeo / tube / limb / smoothPath / along / rand`：树的干、枝、茎（沿折线扫出的管，带随风摆的权重），`tube` 返回每一环的位置，好往上接枝、落花点。样例见 `src/lab/ink/sample.ts`。
- 细东西（竹竿、篱笆、窗棂、琴弦、钓竿）就按真实粗细建，它们主要靠勾线显出来；别为了「看得见」加粗。
- 没有影子：东西落在地上的「分量」靠贴地处略深的一圈（地面的顶点色、或压一片极淡的墨）和遮住的线，别做假影子贴片。屋里靠深色的内衬（见样例里的 `dark`）。

## 五、半透明的东西：水、雾、烟、雨雪、光晕

画在勾完线的画面之上。材质 `transparent: true, depthTest: false, depthWrite: false`，网格 `mesh.layers.set(FX_LAYER)`；片元里用 `${INK_PARS}${FX_PARS}` 的 `fxSeen(viewZ, soft)` 自己判断被没被挡（`viewZ` 是这一点到镜头的深度，顶点着色器里 `-(viewMatrix * world).z`；`soft` 是贴近实物处渐隐的距离，米）。这一层不输出 `gAux`。现成的水在 `env/water.ts`（`waterMat / waterMesh / ripple`）。雾、烟的颜色用 `uMist`（比纸白），夜里跟着暗。

## 六、总图（`src/world/site.ts`）

哪里是什么都在 `site.ts`：`SITE`（草堂、院、柴门、菊圃、石桌、池、观物亭、桥、邻家、村塾、渡口…）、`ground(x,z)` 地面高度、`STREAM` 溪、`RIVER` 伊水、`PLOTS` 田、`PATHS` 路、`TREES` 每一棵树的位置（画树的和「哪里能走」用同一份）、`waterAt`、`pathDist`、`plotAt`。坐标 +x 东、+z 南，原点是草堂正中。要挪位置先改总图，别在各自的模块里另写一套数。

## 七、在台子上看（`/ink.html`）

```
$env:KS_NOHMR="1"; npx vite --port <各自的端口> --strictPort --host     # 要在 PowerShell、盘符大写的路径里起：Set-Location "D:\_work_Liuyao\yiwen-kongshan"
http://localhost:<端口>/ink.html?m=<模型名>&t=9&season=spring&w=clear&az=25&el=10&d=12
node tests/play/shot.mjs <输出目录> --w=1600 --h=900 --wait=1500 名字=网址 名字=网址 …   # 等 window.__ready 再截图，并打印控制台报错
npx tsc --noEmit 2>&1 | grep "src/你的目录"                                 # 只看自己的（别处有旧代码在清理中）
```

- 模型登记在 `src/lab/ink/<你的文件>.ts`：`export const MODELS: Record<string, LabMake> = { 名字: (ctx) => 物体 或 { obj, update, view } }`。每人一个文件。
- 参数：`t` 几点（6 晨、9 上午、18 黄昏、22 夜）、`season`、`w`（clear/mist/rain/snow）、`far=0` 不要远景、`ground=0` 不要素地、`q=low|mid|high`。`window.__lab` 里有 `world / atmos / painter / U`，可以用 `--eval=` 现场改。
- **每样东西至少看四张**：上午、黄昏、夜里、雾天；有季相的再看四季。夜里不能成一团黑：该亮的（窗、花、白衣、水）用 `body` / `glow`。
- 看的时候问自己：缩成拇指大还像不像一幅画？线是不是太多太黑？颜色是不是比旁边的东西艳？留白还在不在？
- 截图放 `shots/` 下自己的子目录（不进版本库）。Bash 里长的 heredoc 容易出错，补丁、长文件用写文件的工具。

## 八、分量与性能

整幅画（桌面高画质）大约：三角 ≤ 90 万、绘制 ≤ 250 次。各模块自觉：同材质并块、重复件实例化、笔并成一个网格；数量乘 `q.density`（low 0.5 / mid 0.75 / high 1），图集像素乘 `q.tex`。每帧不要新建对象、不要重建几何。手机也要跑得动（`q=low` 看一眼）。
