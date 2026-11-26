/**
 * 出园口往西：桃林里那条土路到了园口就没了，再往西是乱石——
 *
 *   路   —— 几块歪着、翘着、缺了的石板，板缝里是碎石；一棵倒了的老树横在路上，根盘翻起来；越往西石头越大。
 *   石崖 —— 路到头是一座平顶的小石崖，崖头一线泉挂下来，跌过一道石坎，落在崖脚的乱石上，水气濛濛，崖脚的石头是湿的；
 *           路贴着崖脚往西南绕，几级磴歪歪斜斜，从崖与两块大石之间挤过去，翻过坡就看不见了。
 *   再远是西口的石门与北峡的飞泉（env/far.ts）。观象「蹇」站在园口往西看的就是这一段：山上有水，路不好走。
 *
 * 除了路头贴地的几块石板、碎石，都在能走到的地方之外（site.ts 的 bounds 西到 −188），只是景：不挡路、不改地势、不进行走图。
 * 高度取画出来的地面（land.ts 的 height），石头才落在地上。
 */
import * as THREE from 'three';
import type { Quality } from '../core/World';
import { Builder, M, V, rockGeo, sweep, tint } from '../core/geo';
import { mulberry32 } from '../core/rng';
import { wash } from '../ink/ink';
import { SITE } from '../site';
import { Crag } from './far/crag';
import { stoneMat } from './far/stone';
import { FallGeo, puffs, type Puff } from './far/veil';

/** 路的中线：自园口往西北，直奔崖脚泉落处，贴着崖脚往西南绕过去，翻过坡 */
export const TRAIL: Array<[number, number]> = [[-186, 41.4], [-191.5, 38.9], [-197.5, 36], [-203.5, 32.6], [-209, 29.2], [-213.5, 26], [-217, 23.8], [-221, 24.4], [-225.5, 25.4], [-230.5, 27]];
/** 小石崖：柱脚的中心、高出地面几米、半径；泉从朝着园口的那一面（TH：方位，弧度，x = cos、z = sin）下来 */
export const CLIFF = { x: -224.4, z: 15.8, h: 15, r: 6 };
/** 泉挂在朝着园口（观象「蹇」站的那一处）的一面 */
const TH = Math.atan2(41.6 - CLIFF.z, -182.5 - CLIFF.x);

/** 沿折线每隔 step 米取一点：位置、朝向（弧度，同 atan2(dx, dz)）、自起点的里程 */
function along(pts: Array<[number, number]>, step: number): Array<{ x: number; z: number; yaw: number; s: number }> {
  const out: Array<{ x: number; z: number; yaw: number; s: number }> = [];
  let s = 0, next = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    while (next <= s + l) { const t = (next - s) / l; out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw, s: next }); next += step; }
    s += l;
  }
  return out;
}

export function createTrail(q: Quality, height: (x: number, z: number) => number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'trail';
  const R = mulberry32(39011), rr = (a: number, b: number) => a + (b - a) * R();
  const dn = q.tier === 'low' ? 0.6 : 1;
  const b = new Builder();
  /** 一块石：中心 (x, z)，半径、高；sink 埋下去几成；tilt 歪多少（弧度，绕顺路与横路两轴） */
  const stone = (x: number, z: number, r: number, h: number, yaw: number, o: { sink?: number; tilt?: [number, number]; long?: number; wet?: number } = {}) => {
    const seed = Math.floor(R() * 1e5), sink = o.sink ?? 0.22, y = height(x, z) - h * sink;
    // 能走到的那两步（西到 SITE.bounds.x0）只放贴地的：高过脚背的石头行走图里没有，人会从里头穿过去
    if (x > SITE.bounds.x0 - 0.4 && h * (1 - sink) > 0.12) return;
    // 碎石小，面少一些就够了
    const g = rockGeo(seed, r * (o.long ?? 1), h, r, q.tier === 'low' || r < 0.25 ? 1 : 2);
    if (o.wet) tint(g, 1 - 0.3 * o.wet, 1 - 0.28 * o.wet, 1 - 0.24 * o.wet);
    b.add('stone', g.applyMatrix4(M.mul(M.t(x, y, z), M.ry(yaw), M.rx(o.tilt?.[0] ?? 0), M.rz(o.tilt?.[1] ?? 0))));
  };

  // —— 石崖：一座主崖（带竖槽，泉从槽里下来），背后靠着两座矮些的 ——
  const c = new Crag(0.6), g0 = height(CLIFF.x, CLIFF.z);
  c.shaft({ x: CLIFF.x - 5.5, z: CLIFF.z - 5, h: g0 + 10.5, r: 4.4, y0: g0 - 8, seed: 7903, squash: 1.2, turn: 1.1, crownStyle: 'dome', ribs: 0.9, green: 0.7, fade: 0.05, warm: 0.4 });
  c.shaft({ x: CLIFF.x + 3.5, z: CLIFF.z - 4.5, h: g0 + 6.5, r: 3.4, y0: g0 - 8, seed: 7905, squash: 1.3, turn: 0.2, crownStyle: 'flat', ribs: 0.9, green: 0.7, fade: 0.05, warm: 0.4 });
  c.shaft({ x: CLIFF.x, z: CLIFF.z, h: g0 + CLIFF.h, r: CLIFF.r, y0: g0 - 8, seed: 7901, squash: 1.3, turn: TH + 1.7, crownStyle: 'flat', tilt: [TH + 2.6, 0.12], taper: 0.34, ribs: 1, count: 8, lean: [0.012, -0.01], overhang: 0.2, notch: [TH, 0.15], green: 0.7, fade: 0.05, warm: 0.4 });
  // 泉：从崖头漫下来，贴着槽往下（照 far.ts 的 fallOn：遇到悬岩不往里收，水是直落的）；一大股，旁边一细股从崖腰的缝里出来
  const falls = new FallGeo(), [bx, bz] = c.lastBase, foot = g0 + 0.15, side: [number, number] = [-Math.sin(TH), Math.cos(TH)];
  const strand = (top: number, off: number, wide: (t: number) => number) => {
    const pts: THREE.Vector3[] = [];
    let dPrev = 0;
    for (let k = 0, n = 14; k <= n; k++) {
      const t = k / n, y = top - (top - foot) * Math.pow(t, 0.92);
      let [x, z] = c.lastAt(TH, y, 0.55 + 1.1 * t * t);
      const d = Math.hypot(x - bx, z - bz);
      if (d < dPrev && d > 1e-3) { x = bx + ((x - bx) * dPrev) / d; z = bz + ((z - bz) * dPrev) / d; }
      dPrev = Math.max(dPrev, d);
      pts.push(V(x + side[0] * off * (1 - 0.5 * t), y, z + side[1] * off * (1 - 0.5 * t)));
    }
    falls.ribbon(pts, wide, side);
    return pts[pts.length - 1];
  };
  const fallFoot = strand(c.lastTop - 0.4, 0, (t) => 1.1 + 1.4 * t);
  strand(c.lastTop - CLIFF.h * 0.4, 0.8, (t) => 0.35 + 0.5 * t);
  // 近的石浓（近浓远淡）：比后面西口的石门深两成，泉的一道白才显得出来
  const cliff = new THREE.Mesh(c.build(), stoneMat({ pig: [0.62, 0.62, 0.6], dens: 0.45, shade: 2.1, grain: 0.14, cun: 1, cunSize: 2.2, cunBreak: 0.6, strata: [1.6, 0.3], moss: [0.5, 0.7], line: 1, snow: 0.8, ink: 2.2, inkPig: [0.52, 0.56, 0.62], keep: 0.6 }));
  cliff.name = 'trail:崖';
  // 瀑的着色器是按几十上百米的大瀑配的（丝的疏密、往下走的快慢都以米计）：这一线泉只有十来米，把里程放大五倍、宽放大四倍，丝才细、走得才不太快
  const fm = falls.build(), aF = fm.geometry.getAttribute('aF') as THREE.BufferAttribute;
  for (let i = 0; i < aF.count; i++) aF.setXYZW(i, aF.getX(i), aF.getY(i), aF.getZ(i) * 4, aF.getW(i) * 5);
  fm.name = 'trail:泉';
  group.add(cliff, fm);
  // 泉脚的水气
  const mist: Puff[] = [{ x: fallFoot.x + Math.cos(TH) * 1.2, y: foot + 1.2, z: fallFoot.z + Math.sin(TH) * 1.2, w: 5.5, h: 2.6, amount: 0.75 }, { x: fallFoot.x + Math.cos(TH) * 2.6 + 1.2, y: foot + 0.6, z: fallFoot.z + Math.sin(TH) * 2.6 - 1.5, w: 6, h: 1.6, amount: 0.5 }];
  group.add(puffs(mist, { near: [5, 18] }));

  // —— 泉落下来的地方：一堆湿石，水从石缝里漫到路上 ——
  for (let i = 0; i < 9 * dn; i++) {
    const a = TH + rr(-1.1, 1.1), d = rr(0.4, 2.6), x = fallFoot.x + Math.cos(a) * d, z = fallFoot.z + Math.sin(a) * d;
    stone(x, z, rr(0.25, 0.7), rr(0.2, 0.5), R() * 6.28, { wet: 1 - d / 3.2 });
  }

  // —— 路面：石板（越往西越缺、越歪），板缝里碎石 ——
  const path = along(TRAIL, 1.05), end = path[path.length - 1].s;
  for (const p of path) {
    const k = p.s / end, wet = Math.max(0, 1 - Math.hypot(p.x - fallFoot.x, p.z - fallFoot.z) / 5.5);
    const sx = Math.cos(p.yaw), sz = -Math.sin(p.yaw);
    // 石板：缺的、翘的、裂成两半的
    if (R() > 0.16 + 0.3 * k) {
      const off = rr(-0.32, 0.32), x = p.x + sx * off, z = p.z + sz * off, broken = R() < 0.25 + 0.35 * k;
      const tilt: [number, number] = broken ? [rr(-0.32, 0.32), rr(-0.4, 0.4)] : [rr(-0.08, 0.08), rr(-0.1, 0.1)];
      if (broken && R() < 0.5) {
        for (const e of [-1, 1]) stone(x + sx * e * 0.24, z + sz * e * 0.24, rr(0.2, 0.3), rr(0.1, 0.17), p.yaw + rr(-0.5, 0.5), { sink: 0.3, tilt: [tilt[0] * e, tilt[1]], long: 1.3, wet });
      } else stone(x, z, rr(0.36, 0.55), rr(0.1, 0.18), p.yaw + rr(-0.35, 0.35), { sink: broken ? 0.15 : 0.35, tilt, long: rr(1.1, 1.45), wet });
    }
    // 碎石：板缝里、路边
    for (let i = 0, n = Math.round((1 + 3 * k) * dn); i < n; i++) {
      const off = rr(-1.1, 1.1);
      stone(p.x + sx * off + rr(-0.4, 0.4), p.z + sz * off + rr(-0.4, 0.4), rr(0.08, 0.2 + 0.12 * k), rr(0.08, 0.2), R() * 6.28, { sink: 0.3, wet });
    }
    // 路两边的石：越往西越大、越密
    if (R() < 0.35 + 0.45 * k) {
      const side = R() < 0.5 ? -1 : 1, off = side * rr(1.4, 2.6 + 1.6 * k), r = rr(0.35, 0.8) + 1.1 * k * R();
      stone(p.x + sx * off, p.z + sz * off, r, r * rr(0.55, 0.9), R() * 6.28, { wet });
    }
  }
  // 两块大石：与崖夹着路，只容一人侧身过去；泉落处路北一块
  stone(-220.6, 28.4, 2.0, 1.9, 0.6, { tilt: [0.08, -0.12] });
  stone(-226.4, 29.8, 2.5, 2.5, 2.2, { tilt: [-0.1, 0.06] });
  stone(-214.2, 21.4, 1.2, 1.0, 1.3, { wet: 0.4 });
  // 磴：贴着崖脚往西绕过去的几级，一级比一级高，歪的
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4, x = -220.2 - 5.2 * t, z = 24.2 + 1.1 * t, y0 = height(x, z), up = 0.16 + 0.24 * i;
    const g = rockGeo(4100 + i, 0.75, 0.22 + up, 0.5, 2);
    b.add('stone', g.applyMatrix4(M.mul(M.t(x, y0 - 0.12, z), M.ry(Math.atan2(-5, 1) + rr(-0.2, 0.2)), M.rx(rr(-0.08, 0.08)), M.rz(rr(-0.1, 0.1)))));
  }

  // —— 倒了的老树：横在路上，根盘翻起来，几根断枝 ——
  {
    const a = V(-198, 0, 37.7), e = V(-202.8, 0, 31.3);
    for (const p of [a, e]) p.y = height(p.x, p.z);
    const n = 9, trunk: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) { const t = i / n, p = a.clone().lerp(e, t); p.y = height(p.x, p.z) + 0.3 - 0.12 * t + 0.05 * Math.sin(t * 7); p.x += 0.18 * Math.sin(t * 4.2); trunk.push(p); }
    const ring = (r: number): Array<[number, number]> => Array.from({ length: 9 }, (_, j) => { const th = (j / 9) * Math.PI * 2, w = 1 + 0.08 * Math.sin(j * 2.7); return [Math.cos(th) * r * w, Math.sin(th) * r * w]; });
    b.add('wood', sweep(trunk, ring(0.36), { scale: (t) => 1 - 0.5 * t }));
    // 根盘：翻起来的一饼带土的根，立在树根那一头；根从饼边上伸出来，往外、往下弯
    const dir = a.clone().sub(e).setY(0).normalize(), side = V(-dir.z, 0, dir.x), base = trunk[0];
    const clod = rockGeo(4201, 1.05, 0.42, 0.95, 2).applyMatrix4(M.mul(M.t(base.x + dir.x * 0.2, base.y + 0.35, base.z + dir.z * 0.2), M.ry(Math.atan2(dir.x, dir.z)), M.rx(Math.PI / 2)));
    b.add('wood', tint(clod, 0.78, 0.74, 0.7));
    for (let i = 0; i < 13; i++) {
      const th = (i / 13) * Math.PI * 2 + rr(-0.2, 0.2), len = rr(0.5, 1.1), root: THREE.Vector3[] = [];
      for (let j = 0; j <= 5; j++) { const t = j / 5, rad = 0.7 + len * t; root.push(base.clone().addScaledVector(dir, 0.3 + 0.25 * t).addScaledVector(side, Math.cos(th) * rad).add(V(0, Math.sin(th) * rad * 0.8 + 0.35 - 0.45 * t * t, 0))); }
      b.add('wood', sweep(root, ring(0.1), { scale: (t) => 1 - 0.75 * t }));
    }
    // 断枝
    for (const [t, ang, len] of [[0.45, 0.9, 1.1], [0.62, -1.2, 0.8], [0.8, 0.5, 1.3]] as Array<[number, number, number]>) {
      const p = trunk[Math.round(t * n)], d = V(Math.cos(ang) * side.x + 0.3 * dir.x, 0.55, Math.cos(ang) * side.z + 0.3 * dir.z).normalize();
      b.add('wood', sweep([p.clone(), p.clone().addScaledVector(d, len * 0.6), p.clone().addScaledVector(d, len).add(V(0, -0.1, 0))], ring(0.08), { scale: (u) => 1 - 0.7 * u }));
    }
  }

  const mats = {
    stone: wash({ pig: [0.66, 0.67, 0.68], dens: 0.5, shade: 2.3, cun: 1.0, grain: 1.1, crack: [0.9, 0.45] }),
    wood: wash({ pig: [0.74, 0.66, 0.58], dens: 1.1, shade: 2.2, grain: 2.2, streak: [0.4, 5, 0.3], line: 1 }),
  };
  group.add(b.build(mats, { name: 'trail' }));
  return group;
}
