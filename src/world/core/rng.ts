/** 可重复的随机数（同一个种子，寺里每一片瓦、每一棵树每次都长在同一处） */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rr = (r: Rng, a: number, b: number) => a + (b - a) * r();
export const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

// —— 值噪声（可周期，给能平铺的贴图用） ——
function hash2(x: number, y: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 0…1。px、py 非 0 时在该周期上首尾相接 */
export function vnoise(x: number, y: number, seed = 0, px = 0, py = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = px ? mod(xi, px) : xi, x1 = px ? mod(xi + 1, px) : xi + 1;
  const y0 = py ? mod(yi, py) : yi, y1 = py ? mod(yi + 1, py) : yi + 1;
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed), c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 分形噪声 0…1 */
export function fbm(x: number, y: number, oct = 4, seed = 0, px = 0, py = 0): number {
  let s = 0, a = 0.5, n = 0;
  for (let o = 0; o < oct; o++) {
    s += a * vnoise(x, y, seed + o * 17, px, py);
    n += a; a *= 0.5; x *= 2; y *= 2; px *= 2; py *= 2;
  }
  return s / n;
}
/** 山脊状（尖峰）噪声 0…1 */
export function ridged(x: number, y: number, oct = 4, seed = 0): number {
  let s = 0, a = 0.5, n = 0, w = 1;
  for (let o = 0; o < oct; o++) {
    let v = 1 - Math.abs(vnoise(x, y, seed + o * 31) * 2 - 1);
    v *= v * w; w = Math.min(1, v * 1.6 + 0.25);
    s += a * v; n += a; a *= 0.5; x *= 2.03; y *= 2.03;
  }
  return s / n;
}
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
