/**
 * 程序化贴图：木、粉墙、石、青砖地、瓦、铜、金、树皮、土、布、纸……全部现算，可平铺。
 * 每张贴图逐像素算出「颜色 + 高度 + 粗糙 + 金属」，高度再求出法线贴图。颜色按 sRGB 写（0…1）。
 * uv 的单位是米：材质上再用 repeat 决定一张贴图铺多大。
 */
import * as THREE from 'three';
import { clamp, fbm, lerp, mulberry32, smooth, vnoise } from './rng';

export interface TexSet { map: THREE.Texture; normalMap: THREE.Texture; orm: THREE.Texture }
type Painter = (u: number, v: number, o: Float32Array) => void;

/** 贴图尺寸的倍率：手机上取 0.5 */
let SCALE = 1;
export const setTexScale = (s: number) => { SCALE = s; };

function dataTex(data: Uint8Array, size: number, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 逐像素烘一套贴图。o = [r, g, b, 高度, 粗糙, 金属] */
export function bake(size: number, paint: Painter, normalStrength = 2): TexSet {
  size = Math.max(64, Math.round(size * SCALE));
  const n = size * size;
  const col = new Uint8Array(n * 4), orm = new Uint8Array(n * 4), nor = new Uint8Array(n * 4);
  const H = new Float32Array(n), o = new Float32Array(6);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    o[0] = o[1] = o[2] = 0.5; o[3] = 0.5; o[4] = 0.8; o[5] = 0;
    paint((x + 0.5) / size, (y + 0.5) / size, o);
    const k = y * size + x;
    col[k * 4] = clamp(o[0]) * 255; col[k * 4 + 1] = clamp(o[1]) * 255; col[k * 4 + 2] = clamp(o[2]) * 255; col[k * 4 + 3] = 255;
    H[k] = o[3];
    orm[k * 4] = 255; orm[k * 4 + 1] = clamp(o[4]) * 255; orm[k * 4 + 2] = clamp(o[5]) * 255; orm[k * 4 + 3] = 255;
  }
  const s = normalStrength * (size / 256);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = (x + size - 1) % size, xr = (x + 1) % size, yd = (y + size - 1) % size, yu = (y + 1) % size;
    const dx = (H[y * size + xr] - H[y * size + xl]) * s, dy = (H[yu * size + x] - H[yd * size + x]) * s;
    const il = 1 / Math.hypot(dx, dy, 1), k = (y * size + x) * 4;
    nor[k] = (-dx * il * 0.5 + 0.5) * 255; nor[k + 1] = (-dy * il * 0.5 + 0.5) * 255; nor[k + 2] = (il * 0.5 + 0.5) * 255; nor[k + 3] = 255;
  }
  return { map: dataTex(col, size, true), normalMap: dataTex(nor, size, false), orm: dataTex(orm, size, false) };
}

const mix3 = (o: Float32Array, r: number, g: number, b: number, k: number) => { o[0] = lerp(o[0], r, k); o[1] = lerp(o[1], g, k); o[2] = lerp(o[2], b, k); };
const set3 = (o: Float32Array, r: number, g: number, b: number) => { o[0] = r; o[1] = g; o[2] = b; };
const P = (u: number, v: number, fu: number, fv: number, oct: number, seed: number) => fbm(u * fu, v * fv, oct, seed, fu, fv);

/** 上过漆又旧了的木料：灰度（颜色由材质给），木纹沿 v。一张铺 1 米见方 */
export function timber(): TexSet {
  return bake(512, (u, v, o) => {
    const g1 = P(u, v, 28, 2, 3, 11), g2 = P(u, v, 120, 5, 2, 12), m = P(u, v, 3, 3, 4, 13);
    const ck = 1 - Math.abs(P(u, v, 18, 1, 2, 14) * 2 - 1);
    const crack = smooth(0.975, 0.997, ck) * smooth(0.45, 0.7, P(u, v, 2, 3, 2, 15));
    const worn = smooth(0.62, 0.86, P(u, v, 5, 2, 3, 16));
    let t = 0.84 + 0.07 * (g1 - 0.5) * 2 + 0.03 * (g2 - 0.5) * 2 + 0.09 * (m - 0.5) * 2;
    t = t * (1 - 0.3 * crack) * (1 - 0.10 * worn);
    set3(o, t, t * 0.985, t * 0.965);
    o[3] = 0.5 + 0.2 * (g1 - 0.5) + 0.12 * (g2 - 0.5) - 0.35 * crack;
    o[4] = 0.62 + 0.16 * g2 + 0.14 * worn;
  }, 1.6);
}

/** 粉墙：白里带雨痕与一点斑驳。一张铺 3 米见方 */
export function plaster(): TexSet {
  return bake(512, (u, v, o) => {
    const m = P(u, v, 3, 3, 4, 21), s = P(u, v, 70, 70, 2, 22);
    const st = P(u, v, 26, 1, 3, 23), stm = smooth(0.56, 0.78, st) * (0.35 + 0.65 * P(u, v, 2, 2, 2, 24));
    const blot = smooth(0.62, 0.82, P(u, v, 5, 4, 3, 25));
    const ck = 1 - Math.abs(P(u, v, 3, 3, 2, 26) * 2 - 1), crack = smooth(0.992, 0.999, ck) * 0.12 * smooth(0.5, 0.7, P(u, v, 2, 2, 2, 27));
    const t = 0.935 + 0.05 * (m - 0.5) * 2 - 0.09 * stm - 0.05 * blot - 0.012 * s - 0.25 * crack;
    // 雨痕偏一点冷灰（墨色），不偏黄
    set3(o, t, t * 1.0, t * (1.0 + 0.012 * stm));
    o[3] = 0.5 + 0.18 * (m - 0.5) + 0.06 * s - 0.4 * crack;
    o[4] = 0.92;
  }, 0.9);
}

/** 石料（台基、栏、石灯）：青灰，带粒与苔。一张铺 1.5 米见方 */
export function stone(): TexSet {
  return bake(512, (u, v, o) => {
    const m = P(u, v, 5, 5, 4, 31), sp = P(u, v, 90, 90, 2, 32), mo = P(u, v, 4, 4, 4, 33), pit = P(u, v, 40, 40, 2, 34);
    const t = 0.60 + 0.16 * (m - 0.5) * 2 + 0.10 * (sp - 0.5) * 2 - 0.10 * smooth(0.68, 0.8, pit);
    set3(o, t * 0.975, t * 0.99, t * 1.005);
    mix3(o, 0.30, 0.36, 0.24, smooth(0.58, 0.78, mo) * 0.42);
    o[3] = 0.5 + 0.2 * (sp - 0.5) + 0.12 * (m - 0.5) - 0.25 * smooth(0.68, 0.8, pit);
    o[4] = 0.86;
  }, 0.7);
}

/** 青砖地：一张是 4×4 块方砖（每块 0.6 米），错缝；缝里有苔。一张铺 2.4 米见方 */
export function paving(): TexSet {
  const N = 4;
  return bake(1024, (u, v, o) => {
    const row = Math.floor(v * N), fz = v * N - row;
    const uu = u * N + (row % 2) * 0.5, col = Math.floor(uu), fx = uu - col;
    const edge = Math.min(fx, 1 - fx, fz, 1 - fz);
    const joint = 1 - smooth(0.010, 0.030, edge);
    const slab = 0.86 + 0.14 * vnoise(((col % N) + N) % N + 0.5, row + 0.5, 41, N, N);
    const m = P(u, v, 9, 9, 4, 42), sp = P(u, v, 130, 130, 2, 43), wear = P(u, v, 3, 3, 3, 44);
    const t = (0.47 + 0.10 * (m - 0.5) * 2 + 0.07 * (sp - 0.5) * 2 + 0.05 * (wear - 0.5) * 2) * slab;
    set3(o, t * 0.955, t * 0.985, t * 1.0);
    const creep = smooth(0.50, 0.74, P(u, v, 7, 7, 4, 45)) * (1 - smooth(0.0, 0.22, edge));
    mix3(o, 0.19, 0.25, 0.13, Math.min(1, joint * 0.85 + creep * 0.6));
    o[3] = 0.62 + 0.14 * (sp - 0.5) + 0.1 * (m - 0.5) - 0.5 * joint - 0.12 * (1 - smooth(0.0, 0.06, edge));
    o[4] = 0.84 - 0.06 * wear;
  }, 2.2);
}

/** 条石（台阶、桥面、路心石）：长条石，缝少。一张铺 2 米见方：2 列 × 5 行 */
export function flagstone(): TexSet {
  return bake(512, (u, v, o) => {
    const row = Math.floor(v * 5), fz = v * 5 - row;
    const uu = u * 2 + (row % 2) * 0.37, col = Math.floor(uu), fx = uu - col;
    const edge = Math.min(fx * 2.5, (1 - fx) * 2.5, fz, 1 - fz);
    const joint = 1 - smooth(0.012, 0.04, edge);
    const slab = 0.88 + 0.12 * vnoise(((col % 2) + 2) % 2 + 0.5, row + 0.5, 51, 2, 5);
    const m = P(u, v, 6, 6, 4, 52), sp = P(u, v, 100, 100, 2, 53);
    const t = (0.56 + 0.12 * (m - 0.5) * 2 + 0.08 * (sp - 0.5) * 2) * slab;
    set3(o, t * 0.97, t * 0.99, t);
    mix3(o, 0.2, 0.26, 0.14, joint * 0.7 + smooth(0.6, 0.8, P(u, v, 5, 5, 3, 54)) * 0.25);
    o[3] = 0.6 + 0.2 * (sp - 0.5) - 0.5 * joint;
    o[4] = 0.85;
  }, 2);
}

/** 瓦：u 一个单位是一垄，v 一个单位是一片瓦的露明长；一张 4 垄 × 4 片。垄的起伏由几何给，这里给每片瓦的深浅、叠压的影与苔 */
export function rooftile(): TexSet {
  const N = 4;
  return bake(256, (u, v, o) => {
    const row = Math.floor(v * N), fy = v * N - row, col = Math.floor(u * N);
    const tone = 0.80 + 0.20 * vnoise(col + 0.5, row + 0.5, 61, N, N);
    const lip = smooth(0.80, 0.97, fy), sh = 1 - smooth(0.0, 0.16, fy);
    const m = P(u, v, 6, 6, 3, 62), sp = P(u, v, 60, 60, 2, 63);
    const k = tone * (0.92 + 0.16 * (m - 0.5) * 2) * (1 - 0.5 * sh) + 0.05 * lip;
    set3(o, 0.235 * k, 0.25 * k, 0.27 * k);
    mix3(o, 0.25, 0.30, 0.19, smooth(0.62, 0.84, P(u, v, 4, 5, 4, 64)) * 0.28);
    mix3(o, 0.50, 0.51, 0.46, smooth(0.78, 0.9, P(u, v, 22, 22, 2, 65)) * 0.35);
    o[3] = fy * 0.75 + 0.10 * sp;
    o[4] = 0.78 - 0.12 * lip;
  }, 2.6);
}

/** 铜（钟、炉、磬）：深铜色，凹处生绿锈。金属度写在 orm 里 */
export function bronze(): TexSet {
  return bake(512, (u, v, o) => {
    const m = P(u, v, 5, 5, 4, 71), p = P(u, v, 26, 26, 4, 72), sp = P(u, v, 90, 90, 2, 73), dr = P(u, v, 44, 3, 3, 74);
    const k = smooth(0.52, 0.8, p * 0.7 + dr * 0.3) * 0.62;
    set3(o, 0.30, 0.215, 0.13);
    mix3(o, 0.52, 0.39, 0.22, smooth(0.55, 0.9, m) * 0.5);
    mix3(o, 0.25, 0.38, 0.33, k * 0.5);
    o[3] = 0.5 + 0.18 * (sp - 0.5) + 0.2 * k;
    o[4] = 0.40 + 0.38 * k + 0.08 * sp;
    o[5] = 1 - 0.65 * k;
  }, 1.2);
}

/** 贴金（佛像、匾上的字）：暖金，薄处透出底色，积灰处暗 */
export function gold(): TexSet {
  return bake(512, (u, v, o) => {
    const m = P(u, v, 4, 4, 4, 81), d = P(u, v, 14, 14, 3, 82), sp = P(u, v, 100, 100, 2, 83);
    const leaf = Math.abs(((u * 9) % 1) - 0.5) < 0.012 || Math.abs(((v * 9) % 1) - 0.5) < 0.012 ? 1 : 0; // 金箔一张张贴上去的接缝
    const k = 0.90 + 0.10 * (m - 0.5) * 2;
    set3(o, 0.98 * k, 0.74 * k, 0.33 * k);
    mix3(o, 0.42, 0.26, 0.10, smooth(0.62, 0.86, d) * 0.4 + leaf * 0.12);
    o[3] = 0.5 + 0.1 * (sp - 0.5) - 0.12 * leaf;
    o[4] = 0.26 + 0.22 * smooth(0.5, 0.85, d) + 0.06 * sp;
    o[5] = 1;
  }, 0.6);
}

/** 松皮：鳞片状的块，裂缝深 */
export function bark(): TexSet {
  return bake(512, (u, v, o) => {
    const w = P(u, v, 3, 2, 3, 91) * 1.6;
    const r1 = 1 - Math.abs(P(u + w * 0.05, v, 9, 3, 3, 92) * 2 - 1), r2 = 1 - Math.abs(P(u, v + w * 0.04, 5, 9, 3, 93) * 2 - 1);
    const crack = Math.max(smooth(0.86, 0.985, r1), smooth(0.9, 0.99, r2) * 0.7);
    const m = P(u, v, 30, 12, 3, 94);
    const t = 0.55 + 0.4 * (m - 0.5) * 2;
    set3(o, 0.36 * t, 0.25 * t, 0.19 * t);
    mix3(o, 0.52, 0.33, 0.24, smooth(0.5, 0.8, P(u, v, 6, 3, 3, 95)) * 0.4);
    mix3(o, 0.08, 0.06, 0.05, crack * 0.85);
    o[3] = 0.6 + 0.2 * (m - 0.5) - 0.6 * crack;
    o[4] = 0.95;
  }, 3);
}

/** 山石（崖、池岸、假山）：有层理 */
export function rock(): TexSet {
  return bake(512, (u, v, o) => {
    const w = P(u, v, 3, 3, 4, 101);
    const st = P(u, v + w * 0.18, 3, 14, 4, 102), m = P(u, v, 7, 7, 4, 103), sp = P(u, v, 90, 90, 2, 104);
    const ck = 1 - Math.abs(P(u + w * 0.1, v, 6, 5, 3, 105) * 2 - 1), crack = smooth(0.93, 0.99, ck);
    const t = 0.44 + 0.18 * (st - 0.5) * 2 + 0.12 * (m - 0.5) * 2 + 0.06 * (sp - 0.5) * 2;
    set3(o, t * 0.98, t * 0.985, t * 1.0);
    mix3(o, 0.05, 0.05, 0.055, crack * 0.8);
    o[3] = 0.5 + 0.3 * (st - 0.5) + 0.2 * (m - 0.5) - 0.5 * crack;
    o[4] = 0.9;
  }, 2.6);
}

/** 山地：苔、土、松针 */
export function ground(): TexSet {
  return bake(1024, (u, v, o) => {
    const a = P(u, v, 4, 4, 5, 111), b = P(u, v, 13, 13, 4, 112), sp = P(u, v, 160, 160, 2, 113), c = P(u, v, 2, 2, 3, 114);
    set3(o, 0.20, 0.25, 0.13);
    mix3(o, 0.29, 0.33, 0.16, smooth(0.35, 0.7, b));
    mix3(o, 0.30, 0.24, 0.16, smooth(0.52, 0.72, a) * 0.8);
    mix3(o, 0.14, 0.18, 0.10, smooth(0.55, 0.8, c) * 0.5);
    const k = 0.82 + 0.36 * (sp - 0.5);
    o[0] *= k; o[1] *= k; o[2] *= k;
    o[3] = 0.5 + 0.3 * (sp - 0.5) + 0.2 * (b - 0.5);
    o[4] = 0.95;
  }, 2);
}

/** 布（蒲团、幡、桌围）：平纹，灰度 */
export function cloth(): TexSet {
  return bake(256, (u, v, o) => {
    const wx = Math.sin(u * Math.PI * 2 * 48), wy = Math.sin(v * Math.PI * 2 * 48);
    const w = wx * wy * 0.5 + 0.5, m = P(u, v, 5, 5, 3, 121), f = P(u, v, 80, 80, 2, 122);
    const t = 0.84 + 0.08 * (w - 0.5) + 0.08 * (m - 0.5) * 2 + 0.04 * (f - 0.5);
    set3(o, t, t, t);
    o[3] = 0.5 + 0.35 * (w - 0.5) + 0.1 * (f - 0.5);
    o[4] = 0.96;
  }, 1.2);
}

/** 纸（宣纸、窗纸、灯罩）：有纤维，灰度偏白 */
export function paper(): TexSet {
  return bake(512, (u, v, o) => {
    const m = P(u, v, 4, 4, 4, 131), f = P(u, v, 60, 9, 2, 132), f2 = P(u, v, 9, 60, 2, 133), sp = P(u, v, 140, 140, 2, 134);
    const fib = smooth(0.7, 0.9, f) * 0.5 + smooth(0.72, 0.9, f2) * 0.5;
    const t = 0.955 + 0.03 * (m - 0.5) * 2 - 0.03 * fib - 0.012 * sp;
    set3(o, t, t, t * 0.995);
    o[3] = 0.5 + 0.2 * fib + 0.08 * sp;
    o[4] = 0.94;
  }, 0.6);
}

/** 黑漆（供桌、匾底、木鱼）：很平，带一点橘皮与旧 */
export function lacquer(): TexSet {
  return bake(256, (u, v, o) => {
    const m = P(u, v, 5, 5, 4, 141), sp = P(u, v, 70, 70, 2, 142), g1 = P(u, v, 24, 2, 3, 143);
    const t = 0.9 + 0.1 * (m - 0.5) * 2 + 0.05 * (g1 - 0.5);
    set3(o, t, t, t);
    o[3] = 0.5 + 0.1 * (sp - 0.5) + 0.12 * (g1 - 0.5);
    o[4] = 0.30 + 0.22 * smooth(0.45, 0.8, m) + 0.05 * sp;
  }, 0.7);
}

/** 夯土 / 香灰 / 沙：细粒 */
export function ash(): TexSet {
  return bake(256, (u, v, o) => {
    const m = P(u, v, 6, 6, 4, 151), sp = P(u, v, 110, 110, 2, 152);
    const t = 0.72 + 0.12 * (m - 0.5) * 2 + 0.16 * (sp - 0.5) * 2;
    set3(o, t, t * 0.985, t * 0.96);
    o[3] = 0.5 + 0.4 * (sp - 0.5) + 0.2 * (m - 0.5);
    o[4] = 1;
  }, 1.6);
}

// —— 画布：字、柔光斑 ——
export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}
export function canvasTex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** 一团柔光 / 一团雾：中间实、边上散，带一点不匀 */
export function softSprite(size = 128, seed = 1, wisp = 0.5): THREE.CanvasTexture {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size), r = mulberry32(seed), ox = r() * 50, oy = r() * 50;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1, d = Math.hypot(dx, dy);
    const n = fbm(x / size * 4 + ox, y / size * 4 + oy, 4, seed);
    let a = Math.pow(clamp(1 - d), 1.6) * (1 - wisp + wisp * 1.8 * n);
    a = clamp(a);
    const k = (y * size + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export interface TextOpts {
  /** 字号（像素） */
  size?: number;
  font?: string;
  color?: string;
  bg?: string | null;
  /** 竖排（每个字一行，多列时从右往左） */
  vertical?: boolean;
  pad?: number;
  gap?: number;
  weight?: number | string;
  /** 描一圈（做字的凹凸时用） */
  stroke?: { color: string; width: number };
}
/** 把字画到画布上（匾、联、签、经卷）。lines：横排时是各行，竖排时是各列 */
export function textCanvas(lines: string[], o: TextOpts = {}): HTMLCanvasElement {
  const size = o.size ?? 96, pad = o.pad ?? size * 0.3, gap = o.gap ?? size * 0.18;
  const font = `${o.weight ?? 400} ${size}px ${o.font ?? '"Ma Shan Zheng", "LXGW WenKai", "Noto Serif SC", serif'}`;
  const cell = size + gap;
  const longest = Math.max(...lines.map((l) => [...l].length));
  const w = o.vertical ? lines.length * cell + pad * 2 - gap : longest * cell + pad * 2 - gap;
  const h = o.vertical ? longest * cell + pad * 2 - gap : lines.length * cell + pad * 2 - gap;
  const [c, g] = canvas(Math.ceil(w), Math.ceil(h));
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, c.width, c.height); }
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = o.color ?? '#fff';
  if (o.stroke) { g.strokeStyle = o.stroke.color; g.lineWidth = o.stroke.width; g.lineJoin = 'round'; }
  lines.forEach((line, li) => {
    [...line].forEach((ch, ci) => {
      const x = o.vertical ? w - pad - size / 2 - li * cell : pad + size / 2 + ci * cell;
      const y = o.vertical ? pad + size / 2 + ci * cell : pad + size / 2 + li * cell;
      if (o.stroke) g.strokeText(ch, x, y);
      g.fillText(ch, x, y + size * 0.02);
    });
  });
  return c;
}

/** 等这几种字体里要用的字到齐（三维里的匾、联是画在画布上的，字体没到会画成系统字） */
export async function fontsReady(chars: string, families = ['Ma Shan Zheng', 'LXGW WenKai', 'Noto Serif SC']): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.race([
      Promise.all(families.map((f) => document.fonts.load(`64px "${f}"`, chars))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch { /* 用系统字也行 */ }
}

export type Textures = ReturnType<typeof createTextures>;
export function createTextures() {
  return {
    timber: timber(), plaster: plaster(), stone: stone(), paving: paving(), flagstone: flagstone(), rooftile: rooftile(),
    bronze: bronze(), gold: gold(), bark: bark(), rock: rock(), ground: ground(), cloth: cloth(), paper: paper(), lacquer: lacquer(), ash: ash(),
  };
}
