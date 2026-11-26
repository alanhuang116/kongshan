/**
 * 路标挨得近时并成一盏（只有数）：一个挨一个地看，落在已有一盏一米二之内的就并进去（那一盏的位置取几枚的平均）。
 * 次序给定了结果就定了（两边看见的一样）。
 */
export interface At { x: number; z: number }
export interface Cluster<T extends At> { x: number; z: number; items: T[] }

export function cluster<T extends At>(pts: readonly T[], r = 1.2): Array<Cluster<T>> {
  const out: Array<Cluster<T>> = [];
  for (const p of pts) {
    let hit: Cluster<T> | null = null;
    for (const c of out) if (Math.hypot(c.x - p.x, c.z - p.z) < r) { hit = c; break; }
    if (!hit) { out.push({ x: p.x, z: p.z, items: [p] }); continue; }
    hit.items.push(p);
    const n = hit.items.length;
    hit.x += (p.x - hit.x) / n; hit.z += (p.z - hit.z) / n;
  }
  return out;
}
/** 离 (x, z) 最近的至多 n 盏（远过 far 的不要），近的在前 */
export function nearest<T extends At>(cs: ReadonlyArray<Cluster<T>>, x: number, z: number, n: number, far = Infinity): Array<Cluster<T>> {
  return cs.map((c) => ({ c, d: Math.hypot(c.x - x, c.z - z) })).filter((e) => e.d <= far).sort((a, b) => a.d - b.d).slice(0, n).map((e) => e.c);
}
