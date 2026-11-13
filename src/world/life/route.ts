/**
 * 认路：村里人走远路是沿着总图上的路（site.ts 的 PATHS）走的——过溪走石桥、走踏石，进出院子走院门，绕开槐树下的石凳棋桌。
 *
 *   路网 —— PATHS 的各个折点是结点，相邻两点是一段；另添几处总图上没画、人却要走的（各家门前、牛棚、槐树两侧的绕行）。
 *          这些段是写的时候对着屋舍报上来的东西一段段查过的（shots/life/routes.mjs），走的时候不再查。
 *   上路、下路 —— 从人站的地方到路网、从路网到要去的地方，是现查的：用 walk.ts 的「能不能直着走过去」
 *          （与行者用的是同一张图：屋舍、篱、树、石、深水都在里面）。直着走得到就不绕路网。
 *   查不通 —— 身边没有一个直着走得到的结点，就用 walk.ts 的找路在近处找一小段；还不行就直着走（宁可穿帮也别站着不动）。
 *
 * 人坐着、跪着的地方常常贴着凳、在船上、在屋里——起步的头一小段、收脚的最后半米不算挡。
 */
import { PATHS, SITE, ground } from '../site';
import { STEP_MAX, blocked, findPath, groundAt } from '../walk';

type Pt = [number, number];
interface Node { x: number; z: number; to: number[]; len: number[] }

const NODES: Node[] = [], KEY = new Map<string, number>();
const key = (x: number, z: number) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
function node(x: number, z: number): number {
  const k = key(x, z);
  let i = KEY.get(k);
  if (i === undefined) { i = NODES.length; NODES.push({ x, z, to: [], len: [] }); KEY.set(k, i); }
  return i;
}
function link(a: number, b: number) {
  if (a === b || NODES[a].to.includes(b)) return;
  const l = Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z);
  NODES[a].to.push(b); NODES[a].len.push(l); NODES[b].to.push(a); NODES[b].len.push(l);
}
function unlink(a: number, b: number) {
  for (const [p, q] of [[a, b], [b, a]]) { const k = NODES[p].to.indexOf(q); if (k >= 0) { NODES[p].to.splice(k, 1); NODES[p].len.splice(k, 1); } }
}
/** 一串点连成一条路 */
const chain = (...pts: Pt[]) => { for (let i = 0; i < pts.length - 1; i++) link(node(pts[i][0], pts[i][1]), node(pts[i + 1][0], pts[i + 1][1])); };

// —— 总图上的路 ——
for (const p of PATHS) chain(...p.pts);

// —— 总图上没画的 ——
const H = (id: string) => SITE.houses.find((h) => h.id === id)!;
/** 某一户屋前的一点（lx 朝它自己的 +x，lz 朝屋前） */
const front = (id: string, lx: number, lz: number): Pt => { const h = H(id), c = Math.cos(h.yaw), s = Math.sin(h.yaw); return [h.x + lx * c + lz * s, h.z - lx * s + lz * c]; };
const E = SITE.elm, OX = SITE.more.oxShed, oxc = Math.cos(OX.yaw), oxs = Math.sin(OX.yaw);
/** 各处的名字（people.ts、spots.ts 里要用的几点） */
export const AT = {
  /** 甲家矮墙的口子：墙里、墙外 */ gateAIn: front('a', 0.1, 4.6), gateAOut: front('a', 0.15, 7.0),
  /** 牛棚门口；绕过甲家矮墙西侧的两点 */ oxShed: [OX.x + 0.3 * oxc + 2.6 * oxs, OX.z - 0.3 * oxs + 2.6 * oxc] as Pt, westA1: front('a', -8.3, 0.9), westA2: front('a', -8.8, 8.3),
  /** 乙家门前（独轮车与箩筐之间出来的那一点） */ frontB: front('b', -0.55, 5.8),
  /** 丁家门前 */ frontD: front('d', 0.55, 6.0),
  /** 酒家（戊）门前、桌的东头外面 */ frontE: front('e', -1.5, 5.3),
  /** 村塾前 */ school: front('school', 0, 4.3),
  /** 槐树：路正从树下过。北边绕（石凳背后）、南边绕（棋桌以南）；树西是到石凳前、棋桌旁去的口子 */
  elmN1: [E.x - 3.0, E.z - 3.1] as Pt, elmN2: [E.x + 3.6, E.z - 3.2] as Pt,
  elmS0: [E.x - 3.7, E.z + 2.5] as Pt, elmS2: [E.x + 0.6, E.z + 3.9] as Pt, elmS3: [E.x + 3.9, E.z + 3.7] as Pt,
  elmW: [E.x - 1.6, E.z - 0.2] as Pt, elmSW: [E.x - 0.8, E.z + 1.9] as Pt, elmNW: [E.x - 1.35, E.z - 1.75] as Pt,
  /** 秋千与村塾东南角之间的那条窄道（丁家的孩子上学走这里） */ swingN: [SITE.more.swing.x + 1.6, SITE.more.swing.z - 2.6] as Pt,
};
{
  const lane = PATHS.find((p) => p.id === '村路')!.pts, peach = PATHS.find((p) => p.id === '桃林')!.pts;
  const at = (pts: Pt[], x: number): Pt => { for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; if ((x - a[0]) * (x - b[0]) <= 0) return [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]; } return pts[pts.length - 1]; };
  // 甲家：门 → 墙口 → 村路（往西、往东各一段）；牛棚在墙西，绕墙外走
  chain(AT.gateAIn, AT.gateAOut, lane[3]); chain(AT.gateAOut, lane[4]); chain(AT.gateAOut, AT.westA2);
  chain(AT.oxShed, AT.westA1, AT.westA2, at(lane, AT.westA2[0] + 0.3));
  // 乙家：门前 → 往南上村路；往东南到槐树北侧
  const laneB = at(lane, AT.frontB[0] + 1.6);
  chain(AT.frontB, laneB); chain(AT.frontB, AT.elmN1);
  // 丁家、酒家、村塾
  chain(AT.frontD, lane[7]); chain(AT.frontE, lane[5]); chain(AT.school, lane[6]); chain(AT.school, AT.elmN2); chain(lane[7], AT.swingN, AT.school);
  // 槐树下：原来那一段直穿树身，拿掉，换成南北两条绕行
  unlink(node(lane[5][0], lane[5][1]), node(lane[6][0], lane[6][1]));
  chain(lane[5], AT.elmN1, AT.elmN2, lane[6]);
  chain(lane[5], AT.elmS0, AT.elmS2, AT.elmS3, lane[6]);
  chain(lane[5], AT.elmW, AT.elmSW, AT.elmS2); chain(AT.elmSW, AT.elmS0); chain(AT.elmN1, AT.elmNW, AT.elmW);
  // 井田的两条纵路，北头接到桃林那条路上
  for (const x of [-42, -13]) chain([x, 45.5], at(peach, x));
}
// 一条路的折点落在另一条路的半中腰（田间路上的岔口、村路的起点……）：把那一段从这里断开接上
for (let again = true; again; ) {
  again = false;
  for (let n = 0; n < NODES.length && !again; n++) for (let a = 0; a < NODES.length && !again; a++) for (const b of NODES[a].to) {
    if (b < a || n === a || n === b) continue;
    const A = NODES[a], B = NODES[b], N = NODES[n], dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz, t = ((N.x - A.x) * dx + (N.z - A.z) * dz) / l2;
    if (t <= 0.02 || t >= 0.98 || Math.hypot(A.x + dx * t - N.x, A.z + dz * t - N.z) > 0.6) continue;
    unlink(a, b); link(a, n); link(n, b); again = true; break;
  }
}

/** 村里人的身子（找路时）算多宽 */
const R = 0.2;
/** 从高 y 处能不能迈到 (x, z)：没东西挡着、不是深水、高差迈得过去。能则返回那里的高度 */
const step = (x: number, z: number, y: number): number | null => { if (blocked(x, z, 'ground', R)) return null; const g = groundAt(x, z); return g == null || Math.abs(g - y) > STEP_MAX ? null : g; };
/**
 * 从 a 能不能直着走到 b。起步处若本就在挡着的东西里（坐在凳边、船上、屋里），先走出来再算；
 * 最后 slack 米不算（要去的地方常贴着凳、桌）。
 */
export function clear(ax: number, az: number, bx: number, bz: number, slack = 0.7): boolean {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.3));
  let y = groundAt(ax, az) ?? ground(ax, az), out = false;
  for (let s = 0; s <= n; s++) {
    const t = s / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, g = step(x, z, y);
    if (g != null) { y = g; out = true; continue; }
    if (d - t * d < slack) return true;
    if (out || t * d > 3) return false;
    y = groundAt(x, z) ?? y;
  }
  return true;
}

const memo = new Map<string, Pt[]>();
const cost = new Float64Array(512), prev = new Int16Array(512), done = new Uint8Array(512);
let busy = -1;
/**
 * 从 a 到 b 途中要依次走过的点（不含 a、b）。直着走得到，或很近，就是空的。
 * 认一条新路要花几毫秒：给了 frame（这是第几帧），同一帧里只认一条——这一帧已经认过了就返回 null，下一帧再来问
 * （清早几个人同时出门，各错开一帧，画面不顿）。走过的路记着，再走不用重认。
 */
export function route(ax: number, az: number, bx: number, bz: number, frame?: number): Pt[] | null {
  const d = Math.hypot(bx - ax, bz - az);
  if (d < 2.2) return [];
  const mk = `${Math.round(ax * 2)},${Math.round(az * 2)},${Math.round(bx * 2)},${Math.round(bz * 2)}`, hit = memo.get(mk);
  if (hit) return hit;
  if (frame != null) { if (busy === frame) return null; busy = frame; }
  const out = plan(ax, az, bx, bz, d);
  if (memo.size > 600) memo.clear();
  memo.set(mk, out);
  return out;
}
function plan(ax: number, az: number, bx: number, bz: number, d: number): Pt[] {
  if (d < 45 && clear(ax, az, bx, bz)) return [];
  // 近处被什么挡了一下（树干、桌角）：就地绕过去
  if (d < 16) {
    const y = groundAt(ax, az), p = y == null ? null : findPath(ax, az, y, bx, bz, 'ground', 1800);
    if (p && p.length && Math.hypot(p[p.length - 1][0] - bx, p[p.length - 1][1] - bz) < 0.9) return p.slice(0, -1);
  }
  // 上路、下路的结点：各取近处直着走得到的几个
  const near = (x: number, z: number, from: boolean): Array<[number, number]> => {
    const all = NODES.map((n, i) => [i, Math.hypot(n.x - x, n.z - z)] as [number, number]).sort((p, q) => p[1] - q[1]);
    const ok: Array<[number, number]> = [];
    let tried = 0;
    for (const c of all) {
      if (c[1] > 60 || ok.length >= 3 || tried++ >= 7 || (ok.length && c[1] > ok[0][1] + 25)) break;
      const n = NODES[c[0]];
      if (from ? clear(x, z, n.x, n.z, 0.3) : clear(n.x, n.z, x, z)) ok.push(c);
    }
    return ok.length ? ok : all.slice(0, 1);
  };
  const A = near(ax, az, true), B = near(bx, bz, false);
  // 最短的一条（结点不过百来个，直接扫）
  const N = NODES.length;
  cost.fill(Infinity, 0, N); prev.fill(-1, 0, N); done.fill(0, 0, N);
  for (const [i, l] of A) cost[i] = l;
  const end = new Map(B);
  let best = -1, bc = Infinity;
  for (;;) {
    let u = -1, uc = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && cost[i] < uc) { uc = cost[i]; u = i; }
    if (u < 0 || uc >= bc) break;
    done[u] = 1;
    const tail = end.get(u);
    if (tail !== undefined && uc + tail < bc) { bc = uc + tail; best = u; }
    const n = NODES[u];
    for (let k = 0; k < n.to.length; k++) { const v = n.to[k], c = uc + n.len[k]; if (c < cost[v]) { cost[v] = c; prev[v] = u; } }
  }
  if (best < 0) return [];
  const ids: number[] = [];
  for (let u = best; u >= 0; u = prev[u]) ids.push(u);
  ids.reverse();
  const pts: Pt[] = ids.map((i) => [NODES[i].x, NODES[i].z]);
  // 起头、收尾能抄近的抄近：已经站在头一段路上（要去的地方就在最后一段路边），或者下一个结点就在十来米内、直着走得到。
  // 远的不抄——不然人就斜穿过别家的庄稼地了
  const on = (x: number, z: number, p: Pt, q: Pt) => { const dx = q[0] - p[0], dz = q[1] - p[1], t = ((x - p[0]) * dx + (z - p[1]) * dz) / (dx * dx + dz * dz); return t > 0 && t < 1 && Math.hypot(p[0] + dx * t - x, p[1] + dz * t - z) < 1.5; };
  while (pts.length > 1 && (on(ax, az, pts[0], pts[1]) || (Math.hypot(pts[1][0] - ax, pts[1][1] - az) < 14 && clear(ax, az, pts[1][0], pts[1][1], 0.3)))) pts.shift();
  for (let n = pts.length; n > 1 && (on(bx, bz, pts[n - 2], pts[n - 1]) || (Math.hypot(pts[n - 2][0] - bx, pts[n - 2][1] - bz) < 14 && clear(pts[n - 2][0], pts[n - 2][1], bx, bz))); n = pts.length) pts.pop();
  if (pts.length === 1 && clear(ax, az, bx, bz)) return [];
  // 上路那一小段直着走不通（人在院角、树丛里）：在近处找一找
  const join = (x0: number, z0: number, x1: number, z1: number): Pt[] => {
    if (Math.hypot(x1 - x0, z1 - z0) > 14) return [];
    const y = groundAt(x0, z0);
    return (y == null ? null : findPath(x0, z0, y, x1, z1, 'ground', 1800))?.slice(0, -1) ?? [];
  };
  const head = clear(ax, az, pts[0][0], pts[0][1], 0.3) ? [] : join(ax, az, pts[0][0], pts[0][1]);
  const last = pts[pts.length - 1], tail = clear(last[0], last[1], bx, bz) ? [] : join(last[0], last[1], bx, bz);
  return [...head, ...pts, ...tail];
}

/** 给查路网的脚本用（shots/life/routes.mjs）：所有的段 */
export const _edges = (): Array<[number, number, number, number]> => { const out: Array<[number, number, number, number]> = []; NODES.forEach((n, i) => n.to.forEach((j) => { if (j > i) out.push([n.x, n.z, NODES[j].x, NODES[j].z]); })); return out; };
