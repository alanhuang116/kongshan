/**
 * 行者自己走过去的路（点了远处的地、点「去」、走到一件事跟前）。
 *
 * walk.ts 的找路是 0.2 米一格的 A*：近处最准（绕桌角、树干、篱笆），可隔着溪、桥又在几十米外时，绕的那一大圈找不完
 * （找到六万格就停）——以前于是直着朝溪走过去，卡在岸边。这里先看直线过不过溪：
 *   不过溪（或两头在溪的同一边、只是直线擦过一道溪湾）—— 照旧用格子找路；找不完再沿总图上的路走（life/route.ts 的路网）。
 *   过溪 —— 挑一处过溪的地方（石桥、汀步、板桥；东头的木桥还在修，过不去），分三段：走到这一头、过去、从那一头走到要去的地方。
 *           每一段都在溪的同一边，格子找路找得完。哪一处近走哪一处（按三段直线的长短估）。
 * 返回要依次走到的点（不含起点），至少一个；实在没有路返回 null（行者就直着走，被挡住了说一声）。
 * （walk.ts 的 findPath 在起点、终点落在同一格时会给一条空的路——这里一律当作没有，免得用的人去取第一个点时取个空）
 */
import { route } from './life/route';
import { SITE, STREAM } from './site';
import { WADE, findPath, groundAt, waterDepth, type Zone } from './walk';

type Pt = [number, number];

/**
 * 过溪的地方：一头、（中间踩的几处）、另一头（两头都在岸上，离桥头、汀步一步）——按总图上的桥、汀步算。
 * 石桥在村南（柴门往南）、汀步在村口往南、板桥在桃林路上（溪从这里折向南）；东头的木桥在修，过不去。
 */
const CROSS: Array<{ name: string; ends: [Pt, Pt]; mid: Pt[] }> = [];
{
  const B = SITE.bridge, hb = B.len / 2 + 1.2;
  CROSS.push({ name: '石桥', ends: [[B.x, B.z + hb], [B.x, B.z - hb]], mid: [] });
  const S = SITE.stones;
  CROSS.push({ name: '汀步', ends: [[S.x, S.z + 3.6], [S.x + 0.6, S.z - 3.6]], mid: [[S.x, S.z]] });
  const D = SITE.board, ux = Math.sin(D.yaw), uz = Math.cos(D.yaw), hd = D.len / 2 + 1.2;
  CROSS.push({ name: '板桥', ends: [[D.x - ux * hd, D.z - uz * hd], [D.x + ux * hd, D.z + uz * hd]], mid: [] });
}

/** 在溪的哪一边：顺着水流看，左手边 +1、右手边 −1（按离这一点最近的那一段溪算） */
export function streamSide(x: number, z: number): number {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < STREAM.length - 1; i++) {
    const a = STREAM[i], b = STREAM[i + 1], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2)), dx = a.x + ex * t - x, dz = a.z + ez * t - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; bi = i; }
  }
  const a = STREAM[bi], b = STREAM[bi + 1];
  return (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x) >= 0 ? 1 : -1;
}

/** 直线上有没有蹚不过去的水（比 WADE 深） */
export function wetLine(ax: number, az: number, bx: number, bz: number): boolean {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.4));
  for (let s = 1; s < n; s++) { const t = s / n; if (waterDepth(ax + (bx - ax) * t, az + (bz - az) * t) > WADE) return true; }
  return false;
}

/** 溪的同一边的一段：格子找路；找不完就沿路网走；都不行返回 null */
function leg(ax: number, az: number, ay: number, bx: number, bz: number): Pt[] | null {
  const g = findPath(ax, az, ay, bx, bz, 'ground');
  if (g && g.length) return g;
  const via = route(ax, az, bx, bz);
  if (!via || !via.length) return null;
  const out: Pt[] = [];
  // 上路、下路那两小段：直着走不通就在近处找一找（路网的结点之间是查过的，人沿着走）
  const f = via[0];
  if (Math.hypot(f[0] - ax, f[1] - az) > 0.3) { const h = findPath(ax, az, ay, f[0], f[1], 'ground', 20000); if (h) out.push(...h.slice(0, -1)); }
  out.push(...via);
  const l = via[via.length - 1], t = findPath(l[0], l[1], groundAt(l[0], l[1]) ?? ay, bx, bz, 'ground', 30000);
  out.push(...(t ?? [[bx, bz] as Pt]));
  return out;
}

/** 过溪：挑一处，分三段 */
function over(ax: number, az: number, ay: number, bx: number, bz: number): Pt[] | null {
  const sa = streamSide(ax, az), sb = streamSide(bx, bz);
  let best: { p: Pt; q: Pt; mid: Pt[] } | null = null, bc = Infinity;
  for (const c of CROSS) for (const flip of [false, true]) {
    const p = flip ? c.ends[1] : c.ends[0], q = flip ? c.ends[0] : c.ends[1];
    if (streamSide(p[0], p[1]) !== sa || streamSide(q[0], q[1]) !== sb) continue;
    const cost = Math.hypot(p[0] - ax, p[1] - az) + Math.hypot(q[0] - p[0], q[1] - p[1]) + Math.hypot(bx - q[0], bz - q[1]);
    if (cost < bc) { bc = cost; best = { p, q, mid: flip ? [...c.mid].reverse() : c.mid }; }
  }
  if (!best) return null;
  const { p, q, mid } = best;
  const head = leg(ax, az, ay, p[0], p[1]) ?? [p];
  const tail = leg(q[0], q[1], groundAt(q[0], q[1]) ?? ay, bx, bz) ?? [[bx, bz] as Pt];
  return [...head, ...mid, q, ...tail];
}

/** 从 a（脚下高 ay）走到 b 的路：一串要依次走到的点（不含起点）。没有路返回 null */
export function travel(ax: number, az: number, ay: number, bx: number, bz: number, zone: Zone = 'ground'): Pt[] | null {
  if (zone !== 'ground') { const g = findPath(ax, az, ay, bx, bz, zone); return g && g.length ? g : null; }
  if (wetLine(ax, az, bx, bz) && streamSide(ax, az) !== streamSide(bx, bz)) {
    const o = over(ax, az, ay, bx, bz);
    if (o) return o;
  }
  return leg(ax, az, ay, bx, bz);
}
