/**
 * 农事的家什与场上的东西：镰、木锨、种子篮、瓢、扁担（两头挑麦捆或水桶）、竹竿，晒场边的一盘石磨，场上的麦堆、糠堆。
 * 锄与连枷借村里人那一套（life/props.ts）。都按真粗细建，靠勾线显出来（docs/INK.md）。
 * 握在手里的：原点在手握的地方，杆身沿 +y（小人掌心的挂点 +y 指向指尖）。颜色写在顶点上，共用两种材质。
 */
import * as THREE from 'three';
import { M, V, box, boxUp, colorize, cyl, lathe, merge, sphere, sweep, type Geo } from '../core/geo';
import { PIG, wash, type RGB } from '../ink/ink';

const tone = (p: RGB, d = 1): RGB => [Math.pow(p[0], d), Math.pow(p[1], d), Math.pow(p[2], d)];
const paint = (g: Geo, c: RGB): Geo => colorize(g, (_x, _y, _z, _nx, _ny, _nz, o) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
export const COL = {
  wood: tone([0.78, 0.66, 0.54], 1.6), pale: tone([0.93, 0.86, 0.72], 1.1), dark: tone([0.7, 0.6, 0.52], 2.4), bamboo: tone([0.86, 0.82, 0.58], 1.3),
  iron: tone(PIG.mo, 2.6), rope: tone([0.85, 0.78, 0.62], 1.6), straw: tone([0.93, 0.86, 0.64], 1.0), strawDark: tone([0.9, 0.82, 0.6], 1.5),
  stone: tone([0.82, 0.82, 0.8], 1.3), stoneDark: tone([0.74, 0.74, 0.72], 1.8), flour: [0.97, 0.96, 0.92] as RGB, grain: tone([0.92, 0.8, 0.55], 1.1),
  chaff: tone([0.95, 0.9, 0.74], 0.9), water: tone([0.78, 0.86, 0.9], 1.2), gourd: tone([0.95, 0.88, 0.62], 1.4),
};
let MATS: { wood: THREE.ShaderMaterial; stone: THREE.ShaderMaterial; pale: THREE.ShaderMaterial; heap: THREE.ShaderMaterial } | null = null;
/** 三种材质：木竹草（淡彩带干笔）、石（皴）、粉（面、水） */
export function mats() {
  return (MATS ??= {
    wood: wash({ pig: [1, 1, 1], dens: 1, shade: 1.5, grain: 2.2, body: 0.1, streak: [26, 2.5, 0.28], snow: 0.5 }),
    stone: wash({ pig: [1, 1, 1], dens: 1, shade: 1.9, grain: 1.6, cun: 0.7, cunSize: 0.4, snow: 0.8 }),
    pale: wash({ pig: [1, 1, 1], dens: 1, shade: 1.25, grain: 2, body: 0.85, snow: 0.6 }),
    // 场上的粮堆：颗粒似的细笔、线淡些
    heap: wash({ pig: [1, 1, 1], dens: 1, shade: 1.4, grain: 4, line: 0.35, streak: [14, 40, 0.3], snow: 0.7 }),
  });
}
const mesh = (g: Geo, name: string, m: 'wood' | 'stone' | 'pale' | 'heap' = 'wood') => { const o = new THREE.Mesh(g, mats()[m]); o.name = name; return o; };
const pole = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, c: RGB, seg = 5) => paint(cyl(r1, r0, 1, seg).applyMatrix4(M.span(a, b)), c);
function hoop(R: number, r: number, c: RGB, seg = 14): Geo {
  const g = new THREE.TorusGeometry(R, r, 4, seg).rotateX(Math.PI / 2).toNonIndexed();
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return paint(g, c);
}

/** 镰：短木把沿 +y，梢上一片弯弯的铁刃，朝手心那边（+z）勾过去 */
export function sickle(): THREE.Mesh {
  const blade: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, a = t * 1.9; blade.push(V(0, 0.3 + Math.sin(a) * 0.17, Math.cos(a) * 0.17 - 0.17 + 0.17 * 0)); }
  return mesh(merge([
    pole(V(0, -0.07, 0), V(0, 0.31, 0), 0.016, 0.015, COL.wood, 6),
    paint(sweep(blade.map((p) => V(p.x, p.y, -p.z)), [[-0.002, -0.022], [0.002, -0.022], [0.002, 0.012], [-0.002, 0.012]], { up: V(1, 0, 0), scale: (t) => 1 - 0.55 * t }), COL.iron),
  ]), 'sickle');
}
/** 木锨：长把沿 +y，梢上一片宽而平的木板（扬场用） */
export function shovel(): THREE.Mesh {
  return mesh(merge([
    pole(V(0, -0.35, 0), V(0, 1.15, 0), 0.016, 0.015, COL.wood, 6),
    paint(box(0.3, 0.38, 0.02).translate(0, 1.32, 0.02).applyMatrix4(M.rx(0.0)), COL.pale),
    paint(box(0.06, 0.08, 0.04).translate(0, 1.13, 0.0), COL.dark),
  ]), 'shovel');
}
/** 种子篮：挎在左臂上（提梁的顶在原点，篮身沿 +y 往下垂），篮里半篮种子 */
export function seedBasket(): THREE.Mesh {
  const body = paint(lathe([[0.001, 0.31], [0.08, 0.305], [0.12, 0.27], [0.13, 0.2], [0.125, 0.17], [0.135, 0.17], [0.14, 0.2], [0.13, 0.28], [0.09, 0.32], [0.001, 0.325]], 12), COL.bamboo);
  const arch: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arch.push(V(Math.cos(a) * 0.135, 0.17 - Math.sin(a) * 0.17, 0)); }
  return mesh(merge([body, paint(sweep(arch, [[-0.007, -0.005], [0.007, -0.005], [0.007, 0.005], [-0.007, 0.005]], { up: V(0, 0, 1) }), COL.bamboo), paint(sphere(1, 8, 4).scale(0.11, 0.035, 0.11).translate(0, 0.19, 0), COL.grain), hoop(0.135, 0.007, COL.strawDark).translate(0, 0.172, 0)]), 'seed-basket');
}
/** 葫芦瓢：握处在原点，柄沿 +y，瓢在梢上、口朝 +z */
export function ladle(): THREE.Mesh {
  const cup = lathe([[0.001, -0.075], [0.06, -0.06], [0.085, -0.02], [0.088, 0.0], [0.08, 0.0], [0.075, -0.018], [0.055, -0.052], [0.001, -0.064]], 10);
  return mesh(merge([pole(V(0, -0.03, 0), V(0, 0.2, 0), 0.014, 0.012, COL.gourd, 5), paint(cup.rotateX(Math.PI / 2).translate(0, 0.27, 0), COL.gourd)]), 'ladle');
}
/** 竹竿：打枣、够柿子。握处在原点，沿 +y 长 3.2 米，梢上一个小杈 */
export function longPole(): THREE.Mesh {
  return mesh(merge([pole(V(0, -0.4, 0), V(0, 2.8, 0), 0.02, 0.012, COL.bamboo, 5), pole(V(0, 2.6, 0), V(0.08, 2.95, 0.02), 0.008, 0.006, COL.bamboo, 4), pole(V(0, 2.6, 0), V(-0.06, 2.92, -0.02), 0.008, 0.006, COL.bamboo, 4)]), 'long-pole');
}
/** 一只木桶（底在 y=0）；water 是装了几成水 */
export function bucketGeo(r0: number, r1: number, h: number, water = 0): Geo {
  const gs: Geo[] = [paint(lathe([[0.001, 0.012], [r0, 0], [r1, h], [r1 - 0.014, h], [r0 - 0.012, 0.03], [0.001, 0.03]], 12), COL.wood)];
  for (const t of [0.2, 0.78]) gs.push(hoop(r0 + (r1 - r0) * t + 0.003, 0.006, COL.bamboo, 12).translate(0, h * t, 0));
  if (water > 0) gs.push(paint(cyl(r0 + (r1 - r0) * water - 0.012, r0 + (r1 - r0) * water - 0.012, 0.006, 12).translate(0, h * water * 0.92, 0), COL.water));
  return merge(gs);
}
/** 一捆麦（挑在扁担上的）：腰里扎着，穗朝下垂、根头朝上（挂法：绳拴在腰上）。原点在拴绳处 */
function bundleGeo(size: number): Geo {
  const s = size;
  const b = lathe([[0.001, -0.46 * s], [0.12 * s, -0.42 * s], [0.15 * s, -0.25 * s], [0.07 * s, -0.04 * s], [0.08 * s, 0.03 * s], [0.13 * s, 0.22 * s], [0.1 * s, 0.32 * s], [0.001, 0.33 * s]], 9);
  return merge([paint(b, COL.straw), hoop(0.075 * s, 0.012, COL.rope, 9)]);
}

/**
 * 扁担：搭在右肩上（挂到胸口的挂点，再往右肩挪），一前一后两头挑着东西（麦捆或水桶）。
 * 返回一组：pole 扁担本身、front / back 两头挂着的（换货时换它们的几何）、bob(t) 每帧让两头随着步子颤。
 */
export function carryPole() {
  const group = new THREE.Group(); group.name = 'farm:pole';
  const beam = mesh(merge([paint(box(0.05, 0.026, 1.62, 'z'), COL.bamboo), paint(box(0.06, 0.03, 0.06).translate(0, 0, 0.78), COL.dark), paint(box(0.06, 0.03, 0.06).translate(0, 0, -0.78), COL.dark)]), 'pole:beam');
  group.add(beam);
  // 两头：绳与挂着的东西并成一块（一头一次绘制）
  const ropeGeo = () => merge([pole(V(-0.04, 0, 0), V(-0.02, -0.34, 0), 0.004, 0.004, COL.rope, 3), pole(V(0.04, 0, 0), V(0.02, -0.34, 0), 0.004, 0.004, COL.rope, 3)]);
  const ends = [0.74, -0.74].map((z) => {
    const g = new THREE.Group(); g.position.set(0, 0, z); group.add(g);
    const load = new THREE.Mesh(ropeGeo(), mats().wood); load.name = 'pole:load'; g.add(load);
    return { g, load };
  });
  let kind = '', amount = -1;
  return {
    group,
    /** 扁担在肩上的高度（颤的时候围着它上下） */
    base: 0,
    /** 挑什么、多少：sheaf（麦捆几捆）、water（几桶水）、ear（谷穗几把，装在两只筐里） */
    set(k: 'sheaf' | 'water' | 'ear', n: number) {
      const a = k === 'water' ? Math.min(2, n) : Math.min(12, n);
      if (k === kind && a === amount) return;
      kind = k; amount = a;
      ends.forEach((e, i) => {
        e.load.geometry.dispose();
        if (k === 'water') e.load.geometry = merge([ropeGeo(), bucketGeo(0.15, 0.18, 0.32, i < a ? 0.82 : 0).translate(0, -0.66, 0)]);
        else if (k === 'ear') e.load.geometry = merge([ropeGeo(), paint(lathe([[0.001, 0.0], [0.16, 0.02], [0.2, 0.22], [0.19, 0.22], [0.15, 0.04], [0.001, 0.03]], 10).translate(0, -0.6, 0), COL.bamboo), paint(sphere(1, 8, 4).scale(0.17, 0.08, 0.17).translate(0, -0.4, 0), COL.grain)]);
        else {
          // 一头挑几捆：两三捆并着拴在一起
          const m = Math.max(1, Math.ceil(a / 2)), gs: Geo[] = [ropeGeo()];
          for (let j = 0; j < Math.min(m, 4); j++) { const ang = (j / Math.min(m, 4)) * Math.PI * 2; gs.push(bundleGeo(0.9 + 0.05 * j).translate(Math.cos(ang) * 0.09 * (m > 1 ? 1 : 0), -0.62, Math.sin(ang) * 0.09 * (m > 1 ? 1 : 0))); }
          e.load.geometry = merge(gs);
        }
      });
    },
    /** 随着步子：扁担中间往下一沉一起，两头的东西晃 */
    bob(t: number, speed: number) {
      const k = Math.min(1, speed / 1.2), ph = t * 7.2;
      group.position.y = this.base - 0.014 * k * Math.abs(Math.sin(ph));
      ends.forEach((e, i) => { e.g.rotation.x = 0.06 * k * Math.sin(ph + i * 1.3); e.g.position.y = -0.02 * k * Math.sin(ph * 2 + i); });
    },
  };
}

/**
 * 石磨：一块圆的磨台（下面垫几块石），台上两扇磨：下扇不动，上扇连着一根推杆（磨棍）转。磨台边上落着面。
 * 返回 group（摆在 MILL 那里）、rotor（上扇与磨棍，绕 y 转）、flour（磨台上那一圈面，按多少显）、
 * bar(θ) 磨棍梢在世界里的位置（人手扶的地方）。
 */
export function millstone(x: number, y: number, z: number, base: number) {
  const group = new THREE.Group(); group.name = 'farm:mill'; group.position.set(x, y, z);
  const H = 0.62, R = 0.3, gs: Geo[] = [];
  // 磨台：一块厚圆石，立在三块垫石上
  gs.push(paint(lathe([[0.001, H - 0.12], [base, H - 0.12], [base + 0.02, H - 0.07], [base - 0.01, H], [0.001, H]], 18), COL.stone));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.4; gs.push(paint(boxUp(0.32, H - 0.12, 0.26).applyMatrix4(M.mul(M.t(Math.cos(a) * base * 0.55, 0, Math.sin(a) * base * 0.55), M.ry(-a))), COL.stoneDark)); }
  // 下扇
  gs.push(paint(cyl(R, R + 0.01, 0.13, 16).translate(0, H + 0.065, 0), COL.stone));
  const fixed = mesh(merge(gs), 'mill:base', 'stone');
  group.add(fixed);
  // 上扇（带一个下料的眼）与磨棍
  const rotor = new THREE.Group(); rotor.position.y = H + 0.13; group.add(rotor);
  // 上扇与磨棍并成一块（一次绘制；木头的颜色写在顶点上）
  const barLen = 1.05;
  const top = mesh(merge([
    paint(lathe([[0.05, 0], [R, 0], [R, 0.15], [0.08, 0.15], [0.06, 0.12], [0.05, 0.06]], 16), COL.stone),
    paint(box(0.09, 0.07, 0.12).translate(R + 0.03, 0.08, 0), COL.stoneDark),
    pole(V(R + 0.02, 0.08, 0), V(R + barLen, 0.28, 0), 0.026, 0.022, COL.wood, 6), paint(cyl(0.035, 0.035, 0.08, 6).rotateZ(Math.PI / 2).translate(R + 0.06, 0.08, 0), COL.dark),
  ]), 'mill:top', 'stone');
  rotor.add(top);
  // 磨台上那一圈面
  const flour = mesh(paint(lathe([[R + 0.02, 0], [R + 0.16, 0.012], [R + 0.26, 0.004], [R + 0.3, 0]], 18).translate(0, H + 0.002, 0), COL.flour), 'mill:flour', 'pale');
  flour.visible = false;
  group.add(flour);
  const tip = new THREE.Vector3();
  return {
    group, rotor, flour, radius: R + barLen,
    /** 磨棍梢（人手扶处）此刻在世界里的哪儿 */
    barTip(out = tip): THREE.Vector3 { const a = rotor.rotation.y; return out.set(x + Math.cos(a) * (R + barLen - 0.08), y + H + 0.13 + 0.26, z - Math.sin(a) * (R + barLen - 0.08)); },
  };
}

/** 场上的一堆（连糠带粒的、扬净的麦粒、糠）：一只圆圆的馒头，按多少缩放。原点在堆底中心 */
export function heap(c: RGB, name: string): THREE.Mesh {
  // 堆脚不齐：一圈里高低、远近略有起伏
  const g = paint(lathe([[0.001, -0.02], [0.58, -0.02], [0.52, 0.07], [0.4, 0.19], [0.22, 0.29], [0.001, 0.33]], 16), c);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), w = 1 + 0.07 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7); p.setXYZ(i, x * w, p.getY(i) * (1 + 0.1 * Math.sin(a * 2)), z * w); }
  g.computeVertexNormals();
  const m = mesh(g, name, 'heap');
  m.visible = false;
  return m;
}
