/**
 * 人手里的东西、身边的活计：锄、连枷、桑篮、杖、纸鸢、钓竿、柴担、碗、木板、锤、刨、帚、耙、纺车……
 * 每样是一个网格（一次绘制），颜色写在顶点上，共用两种材质（木竹草这类淡彩的、纸瓷这类粉的）。
 * 握在手里的东西：原点在手握的地方，杆身沿 +y（小人掌心的挂点 +y 指向指尖，见 docs/AVATAR.md）。
 * 细东西按真实粗细建——它们主要靠勾线显出来。
 */
import * as THREE from 'three';
import { M, V, box, boxUp, cyl, cylUp, lathe, merge, sphere, sweep, type Geo } from '../core/geo';
import { mulberry32 } from '../core/rng';
import { PIG, wash, type RGB } from '../ink/ink';
import { paint, tone } from './rig';

export const C = {
  wood: tone([0.78, 0.66, 0.54], 1.6), woodPale: tone([0.93, 0.86, 0.72], 1.1), woodDark: tone([0.7, 0.6, 0.52], 2.4),
  bamboo: tone([0.86, 0.82, 0.58], 1.3), straw: tone(PIG.mao, 1.25), strawDark: tone(PIG.mao, 2.1), rope: tone([0.85, 0.78, 0.62], 1.6),
  iron: tone(PIG.mo, 2.7), leaf: tone(PIG.cao, 1.5), grain: tone(PIG.huang, 0.9), paper: [0.97, 0.96, 0.92] as RGB, china: [0.9, 0.94, 0.93] as RGB,
  red: tone(PIG.zhu, 1), cloth: tone([0.62, 0.68, 0.76], 1.5), twig: tone([0.7, 0.62, 0.56], 2.0),
};
let mats: { wood: THREE.ShaderMaterial; pale: THREE.ShaderMaterial } | null = null;
/** 两种材质（大家共用）：木竹草——淡彩，带一点干笔；纸、瓷——粉的 */
export function propMats() {
  return (mats ??= {
    wood: wash({ pig: [1, 1, 1], dens: 1, shade: 1.5, grain: 2.2, body: 0.1, streak: [26, 2.5, 0.28] }),
    pale: wash({ pig: [1, 1, 1], dens: 1, shade: 1.3, grain: 2.2, body: 1 }),
  });
}
const mesh = (g: Geo, name: string, pale = false) => { const m = new THREE.Mesh(g, pale ? propMats().pale : propMats().wood); m.name = name; return m; };
/** 一根杆：沿 +y，自 y0 到 y1，两头的粗细 */
const pole = (y0: number, y1: number, r0: number, r1: number, c: RGB, seg = 5) => paint(cyl(r1, r0, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0), c);
/** 一根从 a 到 b 的细杆 */
const rodAB = (a: THREE.Vector3, b: THREE.Vector3, r: number, c: RGB, seg = 5) => paint(cyl(r, r, 1, seg).applyMatrix4(M.span(a, b)), c);
/** 一个圈（箍、篮沿、轮辋）：躺在 xz 平面里，圆心在原点。three 自带的几何，补上顶点色才能与别的并在一起 */
function hoop(R: number, r: number, c: RGB, seg = 14): Geo {
  const g = new THREE.TorusGeometry(R, r, 4, seg).rotateX(Math.PI / 2).toNonIndexed();
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return paint(g, c);
}

/** 锄：握处在原点，柄尾在身后（−y），锄头在 +y 的尽头、朝手背一侧（−z）勾下去 */
export function hoe(): THREE.Mesh {
  return mesh(merge([
    pole(-0.3, 1.18, 0.016, 0.014, C.wood),
    paint(box(0.13, 0.012, 0.2).applyMatrix4(M.mul(M.t(0, 1.17, -0.1), M.rx(0.25))), C.iron),
    paint(box(0.03, 0.05, 0.04).translate(0, 1.17, -0.01), C.iron),
  ]), 'hoe');
}

/** 连枷：长柄沿 +y，梢上一个轴，轴上挂一排竹条（beater 绕自己的 x 轴甩） */
export function flail(): { obj: THREE.Mesh; beater: THREE.Mesh } {
  const obj = mesh(merge([pole(-0.35, 1.25, 0.016, 0.013, C.bamboo), paint(cyl(0.008, 0.008, 0.16, 5).applyMatrix4(M.mul(M.t(0.05, 1.25, 0), M.rz(Math.PI / 2))), C.woodDark)]), 'flail');
  const strips: Geo[] = [];
  for (let i = 0; i < 4; i++) strips.push(paint(box(0.022, 0.62, 0.008).translate(0.07 + i * 0.026, 0.31, 0), C.bamboo));
  strips.push(paint(box(0.12, 0.012, 0.014).translate(0.11, 0.2, 0), C.rope), paint(box(0.12, 0.012, 0.014).translate(0.11, 0.5, 0), C.rope));
  const beater = mesh(merge(strips), 'flail:beater');
  beater.position.set(0, 1.25, 0);
  obj.add(beater);
  return { obj, beater };
}

/** 桑篮：提梁的顶在原点，篮身垂在下面（挂点 +y 朝下时它是正的，所以这里沿 +y 往「下」建），篮里半篮桑叶 */
export function basket(): THREE.Mesh {
  // 轮廓：先自篮底的里面沿里壁到篮沿（面朝里），再自篮沿沿外壁到篮底（面朝外）
  const body = paint(lathe([[0.001, 0.41], [0.1, 0.405], [0.14, 0.35], [0.16, 0.26], [0.155, 0.22], [0.165, 0.22], [0.17, 0.26], [0.15, 0.36], [0.11, 0.42], [0.001, 0.425]], 12), C.bamboo);
  const arch: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arch.push(V(Math.cos(a) * 0.165, 0.22 - Math.sin(a) * 0.22, 0)); }
  const handle = paint(sweep(arch, [[-0.008, -0.006], [0.008, -0.006], [0.008, 0.006], [-0.008, 0.006]], { up: V(0, 0, 1) }), C.bamboo);
  const leaves = paint(sphere(1, 9, 5).scale(0.15, 0.05, 0.15).translate(0, 0.255, 0), C.leaf);
  return mesh(merge([body, handle, leaves, hoop(0.168, 0.009, C.strawDark).translate(0, 0.222, 0)]), 'basket');
}

/** 杖：一根略弯的木杖，底在原点，沿 +y 立着 */
export function staff(len = 1.22): THREE.Mesh {
  const pts = [V(0, 0, 0), V(0.012, len * 0.35, 0.004), V(-0.008, len * 0.7, -0.006), V(0.006, len, 0.004)];
  const s = paint(sweep(pts, [[-0.012, -0.012], [0.012, -0.012], [0.014, 0.012], [-0.012, 0.014]], { scale: (t) => 1 - 0.25 * t }), C.woodDark);
  return mesh(merge([s, paint(sphere(0.024, 7, 5).scale(1, 0.8, 1.3).translate(0.006, len + 0.012, 0.004), C.woodDark)]), 'staff');
}

/** 纸鸢：一只沙燕，素纸、墨骨、胸口一点朱。面朝 +z，头朝 +y；两条尾（各是一个子物体，随风摆） */
export function kite(): { obj: THREE.Mesh; tails: THREE.Mesh[] } {
  const tri = (a: [number, number], b: [number, number], c: [number, number], col: RGB) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a[0], a[1], 0, b[0], b[1], 0, c[0], c[1], 0, a[0], a[1], 0, c[0], c[1], 0, b[0], b[1], 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(12), 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(18).fill(1), 3));
    return paint(g, col);
  };
  const ochre = tone(PIG.tu, 0.8), parts: Geo[] = [];
  // 身：一个长菱形；两翅：朝两边张开、梢往后掠；尾：燕尾的两叉
  parts.push(tri([0, 0.34], [-0.09, 0.06], [0.09, 0.06], C.paper), tri([-0.09, 0.06], [0, -0.2], [0.09, 0.06], C.paper));
  for (const s of [-1, 1]) {
    parts.push(tri([0, 0.2], [s * 0.46, 0.14], [s * 0.08, 0.02], ochre), tri([s * 0.46, 0.14], [s * 0.36, -0.02], [s * 0.08, 0.02], ochre));
    parts.push(tri([0, -0.14], [s * 0.16, -0.42], [s * 0.03, -0.2], C.paper));
  }
  parts.push(paint(sphere(0.035, 6, 4).scale(1, 1, 0.2).translate(0, 0.12, 0.004), C.red));
  parts.push(rodAB(V(0, 0.34, 0.003), V(0, -0.2, 0.003), 0.004, C.iron, 4), rodAB(V(-0.46, 0.14, 0.003), V(0.46, 0.14, 0.003), 0.004, C.iron, 4));
  const obj = mesh(merge(parts), 'kite', true), tails: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const t = mesh(merge([tri([-0.012, 0], [0.012, 0], [0, -0.75], C.red)]), 'kite:tail', true);
    t.position.set(s * 0.14, -0.4, 0); obj.add(t); tails.push(t);
  }
  return { obj, tails };
}

/** 钓竿：一根竹竿，握处在原点，沿 +y 伸出去，梢略垂。返回竿与竿梢在它自己坐标里的位置 */
export function fishingRod(len = 3.3): { obj: THREE.Mesh; tip: THREE.Vector3 } {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V(0, -0.25 + t * (len + 0.25), -0.16 * t * t * t)); }
  const g = paint(sweep(pts, [[-0.009, -0.009], [0.009, -0.009], [0.009, 0.009], [-0.009, 0.009]], { scale: (t) => 1.25 - 0.95 * t, up: V(0, 0, 1) }), C.bamboo);
  return { obj: mesh(g, 'rod'), tip: pts[8].clone() };
}
/** 一根单位长的细线（沿 +y，底在原点）：钓线、风筝线、缰绳都用它拉 */
export function lineMesh(r = 0.0035, c: RGB = C.iron): THREE.Mesh {
  const m = mesh(paint(cylUp(r, r, 1, 3), c), 'line');
  m.matrixAutoUpdate = false;
  return m;
}
/** 浮子 */
export const floatBob = () => mesh(merge([paint(sphere(0.022, 6, 4), C.red), pole(0, 0.07, 0.004, 0.003, C.paper, 4)]), 'float', true);

/** 柴担：一根扁担（沿 x，中点在原点），两头各一捆柴 */
export function firewood(): THREE.Mesh {
  const R = mulberry32(41), parts: Geo[] = [paint(box(1.5, 0.022, 0.045, 'x'), C.bamboo)];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const a = R() * 6.28, d = Math.sqrt(R()) * 0.1, len = 0.62 + 0.2 * R();
      parts.push(paint(cyl(0.012 + 0.008 * R(), 0.014 + 0.008 * R(), len, 4).applyMatrix4(M.mul(M.t(s * 0.62 + Math.cos(a) * d, -0.26 + Math.sin(a) * d * 0.9, (R() - 0.5) * 0.06), M.rx(Math.PI / 2 + (R() - 0.5) * 0.14))), C.twig));
    }
    for (const z of [-0.16, 0.16]) parts.push(hoop(0.125, 0.008, C.rope, 10).applyMatrix4(M.mul(M.t(s * 0.62, -0.26, z), M.rx(Math.PI / 2))));
    parts.push(rodAB(V(s * 0.62, -0.14, 0), V(s * 0.66, 0, 0), 0.006, C.rope, 3));
  }
  return mesh(merge(parts), 'firewood');
}

/** 碗：口朝 +y，底在原点 */
export const bowl = (r = 0.062) => mesh(paint(lathe([[0.001, 0], [r * 0.55, 0], [r, r * 0.72], [r * 0.96, r * 0.72], [r * 0.55, 0.016], [0.001, 0.014]], 10), C.china), 'bowl', true);

/** 木板：长向沿 z，中心在原点 */
export const plank = (len = 2.4) => mesh(paint(box(0.22, 0.04, len, 'z'), C.woodPale), 'plank');
/** 一垛木板（垫在两根枕木上）与旁边的一副木马（上面架着正在刨的那一块）。原点在垛的正中的地面 */
export function plankYard(): THREE.Mesh {
  const parts: Geo[] = [];
  for (const z of [-0.8, 0.8]) parts.push(paint(boxUp(0.9, 0.08, 0.1, 'x').translate(0, 0, z), C.woodDark));
  const R = mulberry32(9);
  for (let i = 0; i < 6; i++) parts.push(paint(box(0.22, 0.04, 2.4, 'z').applyMatrix4(M.mul(M.t(-0.24 + (i % 3) * 0.24 + (R() - 0.5) * 0.03, 0.1 + Math.floor(i / 3) * 0.042, (R() - 0.5) * 0.12), M.ry((R() - 0.5) * 0.05))), C.woodPale));
  return mesh(merge(parts), 'plank-yard');
}
/** 木马一副，架着一块板（板面高 0.62）。原点在两只木马正中的地面，板的长向沿 z */
export function trestle(): THREE.Mesh {
  const parts: Geo[] = [];
  for (const z of [-0.75, 0.75]) {
    parts.push(paint(box(0.5, 0.05, 0.06, 'x').translate(0, 0.575, z), C.wood));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(rodAB(V(sx * 0.2, 0.56, z), V(sx * 0.3, 0, z + sz * 0.14), 0.018, C.wood, 4));
  }
  parts.push(paint(box(0.22, 0.04, 2.3, 'z').translate(0, 0.62, 0), C.woodPale));
  return mesh(merge(parts), 'trestle');
}
/** 锤：柄沿 +y，握处在原点 */
export const hammer = () => mesh(merge([pole(-0.06, 0.26, 0.012, 0.011, C.wood), paint(box(0.045, 0.05, 0.11).translate(0, 0.26, 0), C.iron)]), 'hammer');
/** 刨：一块长方的木头带两只把手；原点在刨身正中的底面，长向沿 z */
export const planeTool = () => mesh(merge([paint(boxUp(0.065, 0.055, 0.32, 'z'), C.woodDark), paint(cyl(0.011, 0.011, 0.26, 5).applyMatrix4(M.mul(M.t(0, 0.05, 0.02), M.rz(Math.PI / 2))), C.wood)]), 'plane');

/** 帚：握处在原点，柄沿 −y 往下，底下一把散开的竹枝 */
export function broom(): THREE.Mesh {
  const R = mulberry32(5), parts: Geo[] = [pole(-0.82, 0.3, 0.013, 0.012, C.bamboo)];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.28, sp = 0.05 + 0.1 * R(); parts.push(rodAB(V(Math.cos(a) * 0.015, -0.78, Math.sin(a) * 0.015), V(Math.cos(a) * sp, -1.18 - 0.08 * R(), Math.sin(a) * sp * 0.5), 0.005, C.twig, 3)); }
  parts.push(paint(cyl(0.024, 0.02, 0.05, 6).translate(0, -0.8, 0), C.rope));
  return mesh(merge(parts), 'broom');
}
/** 耙（摊谷用的木耙）：握处在原点，柄沿 +y，尽头一横带齿 */
export function rake(): THREE.Mesh {
  const parts: Geo[] = [pole(-0.4, 1.3, 0.015, 0.013, C.wood), paint(box(0.5, 0.035, 0.03, 'x').translate(0, 1.3, 0), C.wood)];
  for (let i = 0; i < 6; i++) parts.push(paint(box(0.014, 0.014, 0.08).translate(-0.21 + i * 0.084, 1.3, -0.05), C.wood));
  return mesh(merge(parts), 'rake');
}
/** 晒着的谷：一领席，上面摊着薄薄一层谷，耙出几道垄。原点在席正中的地面，长向沿 x */
export function grainMat(w = 3.2, d = 2.2): THREE.Mesh {
  const parts: Geo[] = [paint(boxUp(w, 0.012, d, 'x'), C.straw)];
  for (let i = 0; i < 9; i++) parts.push(paint(sphere(1, 6, 3).scale(w * 0.46, 0.022, 0.07).translate(0, 0.018, -d * 0.4 + (i * d * 0.8) / 8), C.grain));
  return mesh(merge(parts), 'grain-mat');
}
/** 禾束三把攒成一堆，旁边铺一领席（打谷用）。原点在席的正中 */
export function threshFloor(): THREE.Mesh {
  const R = mulberry32(17), parts: Geo[] = [paint(boxUp(2.2, 0.012, 1.7, 'x'), C.straw)];
  for (let i = 0; i < 16; i++) parts.push(paint(box(0.5 + 0.3 * R(), 0.012, 0.02).applyMatrix4(M.mul(M.t((R() - 0.5) * 1.5, 0.022 + 0.01 * R(), (R() - 0.5) * 1.0), M.ry((R() - 0.5) * 1.2))), C.grain));
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * 6.28, x = 1.7 + Math.cos(a) * 0.22, z = -0.5 + Math.sin(a) * 0.22;
    parts.push(paint(lathe([[0.2, 0], [0.09, 0.42], [0.07, 0.5], [0.16, 0.86], [0.001, 0.8]], 8).applyMatrix4(M.mul(M.t(x, 0, z), M.rz(-Math.cos(a) * 0.3), M.rx(Math.sin(a) * 0.3))), C.grain));
    parts.push(paint(cyl(0.085, 0.085, 0.03, 8).applyMatrix4(M.mul(M.t(x, 0, z), M.rz(-Math.cos(a) * 0.3), M.rx(Math.sin(a) * 0.3), M.t(0, 0.47, 0))), C.rope));
  }
  return mesh(merge(parts), 'thresh-floor');
}
/** 纺车：一只大轮（wheel，绕自己的 x 轴转）架在木座上，另一头是锭子。原点在座正中的地面，轮在 −x 一头 */
export function spinningWheel(): { obj: THREE.Mesh; wheel: THREE.Mesh } {
  const parts: Geo[] = [paint(boxUp(1.0, 0.05, 0.12, 'x'), C.wood), paint(boxUp(0.06, 0.05, 0.5, 'z').translate(-0.3, 0, 0), C.wood), paint(boxUp(0.06, 0.05, 0.36, 'z').translate(0.42, 0, 0), C.wood)];
  for (const z of [-0.1, 0.1]) parts.push(paint(boxUp(0.04, 0.52, 0.03).translate(-0.3, 0.05, z), C.wood));
  parts.push(paint(boxUp(0.03, 0.3, 0.03).translate(0.42, 0.05, 0), C.wood), paint(cyl(0.006, 0.006, 0.22, 4).applyMatrix4(M.mul(M.t(0.42, 0.34, 0), M.rx(Math.PI / 2))), C.iron), paint(cyl(0.02, 0.012, 0.09, 6).applyMatrix4(M.mul(M.t(0.42, 0.34, 0.06), M.rx(Math.PI / 2))), C.paper));
  const obj = mesh(merge(parts), 'spinning-wheel'), wp: Geo[] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI; wp.push(rodAB(V(0, Math.cos(a) * 0.3, Math.sin(a) * 0.3), V(0, -Math.cos(a) * 0.3, -Math.sin(a) * 0.3), 0.007, C.bamboo, 3)); }
  for (const x of [-0.035, 0.035]) wp.push(hoop(0.3, 0.008, C.bamboo, 20).applyMatrix4(M.mul(M.t(x, 0, 0), M.rz(Math.PI / 2))));
  wp.push(paint(cyl(0.012, 0.012, 0.22, 5).applyMatrix4(M.rz(Math.PI / 2)), C.wood));
  const wheel = mesh(merge(wp), 'spinning-wheel:wheel');
  wheel.position.set(-0.3, 0.5, 0);
  obj.add(wheel);
  return { obj, wheel };
}
/** 簸箕（盛鸡食的）：浅浅一只，后沿高、前口敞。原点在底的正中 */
export const tray = () => mesh(merge([paint(lathe([[0.001, 0.01], [0.15, 0.0], [0.2, 0.05], [0.19, 0.05], [0.145, 0.012], [0.001, 0.02]], 10).scale(1, 1, 0.8), C.bamboo), paint(sphere(1, 7, 3).scale(0.11, 0.018, 0.09).translate(0, 0.02, 0), C.grain)]), 'tray');
/** 书：一册线装的书，握在手里（原点在书脊的中点，书面朝 +z） */
export const book = () => mesh(merge([paint(box(0.15, 0.21, 0.018).translate(0.075, 0, 0), C.paper), paint(box(0.012, 0.21, 0.02), C.cloth)]), 'book', true);
/** 戒尺 */
export const ruler = () => mesh(pole(-0.05, 0.3, 0.008, 0.008, C.woodDark, 4), 'ruler');
/** 鱼篓：口小肚大，底在原点 */
export const creel = () => mesh(paint(lathe([[0.001, 0], [0.12, 0], [0.15, 0.1], [0.13, 0.22], [0.07, 0.27], [0.085, 0.31], [0.07, 0.31], [0.055, 0.27], [0.001, 0.26]], 10), C.bamboo), 'creel');
/** 鞭：一根细竹枝，握处在原点，沿 +y */
export const switchRod = () => mesh(pole(-0.08, 0.85, 0.007, 0.003, C.bamboo, 4), 'switch');

// —— 后添的几样 ——
/** 捣衣杵：一根一头粗的短木棒，握处在原点，沿 +y */
export const washBat = () => mesh(merge([pole(-0.06, 0.14, 0.015, 0.016, C.wood, 6), pole(0.14, 0.42, 0.03, 0.036, C.wood, 7)]), 'wash-bat');
/** 一件湿衣（搭在石板上、攥在手里的一团布）。原点在正中 */
export const washCloth = () => mesh(paint(sphere(1, 7, 4).scale(0.17, 0.035, 0.11), C.paper), 'cloth', true);
/** 短笛：一截竹管，握处在原点，沿 +y（横着吹：手指向一侧） */
export const flute = () => mesh(pole(-0.2, 0.2, 0.011, 0.011, C.bamboo, 6), 'flute');
/** 饭篮：带盖的圆竹篮，一道提梁。提梁的顶在原点，篮身沿 +y 往「下」垂（同桑篮） */
export function foodBasket(): THREE.Mesh {
  const body = paint(lathe([[0.001, 0.2], [0.12, 0.2], [0.14, 0.24], [0.145, 0.34], [0.12, 0.4], [0.001, 0.405]], 12), C.bamboo);
  const lid = paint(lathe([[0.001, 0.165], [0.06, 0.168], [0.13, 0.19], [0.135, 0.205], [0.001, 0.205]], 12), C.strawDark);
  const arch: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arch.push(V(Math.cos(a) * 0.132, 0.2 - Math.sin(a) * 0.2, 0)); }
  return mesh(merge([body, lid, paint(sweep(arch, [[-0.007, -0.005], [0.007, -0.005], [0.007, 0.005], [-0.007, 0.005]], { up: V(0, 0, 1) }), C.bamboo)]), 'food-basket');
}
/** 水罐：小口的陶罐，颈上系一道绳提着。提手在原点，罐身沿 +y 往「下」垂 */
export const jug = () => mesh(merge([paint(lathe([[0.001, 0.36], [0.07, 0.36], [0.105, 0.3], [0.11, 0.2], [0.07, 0.12], [0.045, 0.09], [0.055, 0.07], [0.001, 0.075]], 10), tone([0.78, 0.7, 0.62], 1.9)), pole(0, 0.09, 0.004, 0.004, C.rope, 3)]), 'jug');
/** 一袋谷：扛在肩上的麻袋。原点在袋的正中，长向沿 z */
export const sack = () => mesh(paint(sphere(1, 9, 6).scale(0.17, 0.13, 0.33), tone([0.9, 0.84, 0.7], 1.4)), 'sack');
/** 货郎担：一根扁担（沿 x，中点在原点）挑两只带格的货箱，箱上插着几样小玩意 */
export function peddlerLoad(): THREE.Mesh {
  const parts: Geo[] = [paint(box(1.55, 0.022, 0.045, 'x'), C.bamboo)];
  for (const s of [-1, 1]) {
    const x = s * 0.66;
    parts.push(paint(boxUp(0.34, 0.3, 0.3).translate(x, -0.74, 0), C.wood), paint(boxUp(0.36, 0.03, 0.32).translate(x, -0.44, 0), C.woodDark), paint(boxUp(0.3, 0.16, 0.26).translate(x, -0.41, 0), C.woodPale));
    for (const e of [-1, 1]) parts.push(rodAB(V(x + e * 0.15, -0.26, 0), V(x, 0, 0), 0.005, C.rope, 3));
    // 箱上的小东西：拨浪鼓、风车、糖葫芦似的几点颜色
    parts.push(rodAB(V(x - 0.08, -0.25, 0.05), V(x - 0.1, 0.02, 0.07), 0.004, C.bamboo, 3), paint(sphere(0.03, 6, 4).translate(x - 0.1, 0.03, 0.07), C.red));
    parts.push(rodAB(V(x + 0.08, -0.25, -0.05), V(x + 0.1, -0.02, -0.06), 0.004, C.bamboo, 3), paint(box(0.09, 0.09, 0.006).applyMatrix4(M.mul(M.t(x + 0.1, -0.01, -0.06), M.rz(0.6))), C.paper));
    parts.push(paint(sphere(0.022, 5, 4).translate(x + 0.02, -0.23, 0.1), tone(PIG.huang, 1.2)), paint(sphere(0.022, 5, 4).translate(x - 0.03, -0.23, -0.09), C.cloth));
  }
  return mesh(merge(parts), 'peddler-load');
}
/** 拨浪鼓：一面小鼓插在柄上，握处在原点，沿 +y */
export const rattle = () => mesh(merge([pole(-0.05, 0.13, 0.006, 0.006, C.wood, 4), paint(cyl(0.045, 0.045, 0.026, 9).applyMatrix4(M.mul(M.t(0, 0.17, 0), M.rx(Math.PI / 2))), C.red), paint(sphere(0.008, 4, 3).translate(0.06, 0.15, 0), C.woodDark), paint(sphere(0.008, 4, 3).translate(-0.06, 0.15, 0), C.woodDark)]), 'rattle');
/** 酒注：一把带流的小壶，提手在原点（壶在掌下） */
export const winePot = () => mesh(paint(lathe([[0.001, -0.17], [0.04, -0.17], [0.06, -0.12], [0.055, -0.07], [0.025, -0.03], [0.03, 0], [0.001, 0]], 10), C.china), 'wine-pot', true);
/** 一块抹布 */
export const rag = () => mesh(paint(sphere(1, 6, 4).scale(0.07, 0.018, 0.055), tone([0.8, 0.8, 0.76], 1.4)), 'rag');
