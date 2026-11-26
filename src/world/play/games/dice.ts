/**
 * 两边一样的骰子：同一个种子、同一步，掷出来一样。
 * 同游时两边各自算（斗鸡平手谁先怯、村里人出哪一招、一脚鞠偏多少），只要种子、步数对得上，结果就对得上——不必把每一个数都发过去。
 */

/** 几个整数揉成一个（32 位，非负） */
export function hash(...xs: number[]): number {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    let v = Math.floor(x) | 0;
    for (let i = 0; i < 4; i++) { h ^= v & 255; h = Math.imul(h, 16777619) >>> 0; v >>>= 8; }
  }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return h >>> 0;
}

/** 一串 0…1 的数（mulberry32） */
export function dice(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 某一步的一个数（0…1）：dice(hash(seed, …step))() */
export const roll = (seed: number, ...step: number[]) => dice(hash(seed, ...step))();

/** 一回比试的编号（1…999999；随手取，两边以发起的那一方为准） */
export const matchId = () => 1 + Math.floor(Math.random() * 999998);
