import { describe, expect, it } from 'vitest';
import { HALL_Y, PAV_Y, SIDE_Y, TOWER_Y, boom, clearLine, findPath, move, passable, placeAt, standable } from '../src/world/walk';
import { L } from '../src/world/layout';

/** 从山脚出发，把能走到的地方灌一遍（0.2 米一格，四邻，高差不超过一级台阶） */
function flood() {
  const G = 0.2, key = (i: number, j: number) => i * 100000 + j;
  const seen = new Map<number, number>();
  const i0 = 0, j0 = Math.round(90.4 / G), y0 = standable(i0 * G, j0 * G);
  if (y0 == null) throw new Error('山脚站不住人');
  const q: Array<[number, number]> = [[i0, j0]];
  seen.set(key(i0 + 5000, j0 + 5000), y0);
  while (q.length) {
    const [i, j] = q.pop()!, y = seen.get(key(i + 5000, j + 5000))!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj, k = key(a + 5000, b + 5000);
      if (seen.has(k)) continue;
      const ny = passable(a * G, b * G, y);
      if (ny == null) continue;
      seen.set(k, ny); q.push([a, b]);
    }
  }
  return { reach: (x: number, z: number) => seen.get(key(Math.round(x / G) + 5000, Math.round(z / G) + 5000)), size: seen.size };
}

describe('哪里能走', () => {
  const f = flood();
  it('从山脚能一路走到各处', () => {
    const spots: Array<[string, number, number, number]> = [
      ['山门外', 0, 51.2, 0], ['山门里', 0, 46, 0.72], ['桥顶', 0, 32, L.bridge.rise], ['香炉前', 0, 23.4, 0], ['石灯旁', 1.6, 13.4, 0],
      ['殿前月台', 0, 6, HALL_Y], ['拜垫后', 0, L.hall.z + L.kneeler.dz + 0.6, HALL_Y], ['木鱼旁', -2.2, -1.2, HALL_Y], ['磬旁', 2.2, -1.2, HALL_Y], ['签筒旁', 4.9, 2.6, HALL_Y],
      ['经房里', -21.6, -1, SIDE_Y], ['茶寮里', 22.8, 3, SIDE_Y], ['亭里', 35.6, -15.5, PAV_Y], ['云台崖边', 42, -12, 0], ['月洞门里', 26, -15.6, 0.16],
      ['池岸', -7.2, 39, 0], ['银杏下', -8.2, 9.8, 0], ['钟楼门口', 13.3, 19, 0], ['鼓楼门口', -13.3, 19, 0], ['后院', 10, -15, 0], ['东侧踏跺下', 17.6, 1.5, 0],
    ];
    for (const [name, x, z, y] of spots) {
      const got = f.reach(x, z);
      expect(got, `${name} (${x}, ${z}) 走不到`).not.toBeUndefined();
      expect(Math.abs(got! - y), `${name} 的高度 ${got} 不是 ${y}`).toBeLessThan(0.21);
    }
  });
  it('池里、墙外、墙里、佛座里走不到', () => {
    for (const [name, x, z] of [['拜垫上（垫子不踩）', 0, L.hall.z + L.kneeler.dz], ['蒲团上', L.seat.sit.x, L.seat.sit.z], ['池心', -6, 32], ['池东', 8, 30], ['西墙外', -30, 0], ['北墙外', 0, -30], ['佛座', 0, L.hall.z - 3.5], ['钟楼砖台里', 17.5, 19], ['经房背后', -25.5, -1], ['山道外', 6, 70], ['云台外', 46, -15], ['竹丛里', 0, -24.5]] as const) {
      expect(f.reach(x, z), `${name} 不该走得到`).toBeUndefined();
    }
  });
  it('平台只能从踏跺上', () => {
    // 殿的月台西北角：下面是院子（0），上面是月台（1.55），不能直接上去
    const w = { x: -14.6, y: 0, z: -5, zone: 'ground' as const };
    const m = move(w, -13.6, -5);
    expect(m.y).toBe(0);
    expect(m.x).toBeLessThan(-14);
    // 站在月台沿上也掉不下去
    const up = { x: -13.8, y: HALL_Y, z: -5, zone: 'ground' as const };
    const d = move(up, -14.4, -5);
    expect(d.y).toBe(HALL_Y);
  });
  it('贴着墙走会顺着滑', () => {
    const w = { x: 0, y: 0, z: 45.2, zone: 'ground' as const };
    const m = move({ ...w, x: 12 }, 12.3, 45.9);
    expect(m.z).toBeLessThan(45.6);
    expect(m.x).toBeGreaterThan(12.2);
  });
  it('楼上是单独的一小块', () => {
    expect(standable(L.bell.x - 1.4, L.bell.z, 'bell')).toBe(TOWER_Y);
    expect(standable(L.bell.x, L.bell.z, 'bell')).toBeNull();          // 钟
    expect(standable(L.bell.x - 2.6, L.bell.z, 'bell')).toBeNull();    // 栏外
    expect(standable(L.drum.x + 1.5, L.drum.z, 'drum')).toBe(TOWER_Y);
    expect(standable(L.drum.x, L.drum.z, 'drum')).toBeNull();          // 鼓
  });
  it('池南的石埠能下到水边，再往前是水', () => {
    const P = L.pond, WH = L.wharf, edge = P.z1 - 0.36 - WH.d;
    const y = f.reach(WH.x, edge + 0.3);
    expect(y, '水边的平台走不到').not.toBeUndefined();
    expect(Math.abs(y! - WH.y)).toBeLessThan(0.01);
    expect(f.reach(WH.x, edge - 0.4), '平台外是水').toBeUndefined();
    expect(f.reach(WH.x - 1.2, P.z1 - 0.6), '石埠西边还是水').toBeUndefined();
    expect(f.reach(WH.x + 1.2, P.z1 - 0.6), '石埠东边还是水').toBeUndefined();
    // 做几件事时人站的地方（数字与 scene.ts、acts/ 里的一致）：都得站得住
    // 蒲团后面（人先站在这里，再坐上去）都得站得住；香炉前那一步紧挨着炉，本身站不住，旁边得有站得住的地方
    expect(standable(L.seat.tea.x + 0.44, L.seat.tea.z), '茶寮的蒲团后').not.toBeNull();
    expect(standable(L.seat.study.x + 0.44, L.seat.study.z), '经房的蒲团后').not.toBeNull();
    expect(standable(L.seat.sit.x - 0.44, L.seat.sit.z), '云台的蒲团后').not.toBeNull();
    const nearby = (x: number, z: number) => [[0, 0], [0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]].some(([a, b]) => standable(x + a, z + b) != null);
    expect(nearby(L.censer.x, L.censer.z + 0.95), '香炉前').toBe(true);
  });
  it('找路：直着能到就直着走，挡着了会绕', () => {
    /** 顺着一条路一段段走，确认每一段都真的走得通；返回路的总长 */
    const walkable = (ax: number, az: number, ay: number, pts: Array<[number, number]>, zone: 'ground' | 'bell' | 'drum' = 'ground') => {
      let x = ax, z = az, y = ay, len = 0;
      for (const [px, pz] of pts) {
        const ny = clearLine(x, z, y, px, pz, zone);
        expect(ny, `从 (${x.toFixed(2)}, ${z.toFixed(2)}) 到 (${px.toFixed(2)}, ${pz.toFixed(2)}) 走不通`).not.toBeNull();
        len += Math.hypot(px - x, pz - z); x = px; z = pz; y = ny!;
      }
      return { len, x, z, y };
    };
    // 空地上：一个点
    expect(findPath(-10, 40, 0, 10, 40)).toEqual([[10, 40]]);
    // 池南到池北：只能过桥
    const a = findPath(-6, 39.5, 0, -6, 24.5)!;
    expect(a, '池南到池北没找到路').not.toBeNull();
    // 这条路越过 z = 32（池心那条线）时，人在桥上
    const full: Array<[number, number]> = [[-6, 39.5], ...a];
    const k = full.findIndex(([, z], i) => i > 0 && (full[i - 1][1] - 32) * (z - 32) <= 0);
    expect(k, '应当越过池心那条线').toBeGreaterThan(0);
    const t = (32 - full[k - 1][1]) / (full[k][1] - full[k - 1][1]);
    expect(Math.abs(full[k - 1][0] + (full[k][0] - full[k - 1][0]) * t), '应当从桥上过').toBeLessThan(1.7);
    const ra = walkable(-6, 39.5, 0, a);
    expect(Math.hypot(ra.x + 6, ra.z - 24.5)).toBeLessThan(0.05);
    expect(ra.len).toBeLessThan(34);
    // 茶寮门口到茶几后面的蒲团：绕过茶几
    const b = findPath(L.tea.x - 1.9, L.tea.z, SIDE_Y, L.seat.tea.x + 0.44, L.seat.tea.z)!;
    expect(b, '茶寮里没找到路').not.toBeNull();
    expect(b.length).toBeGreaterThan(1);
    const rb = walkable(L.tea.x - 1.9, L.tea.z, SIDE_Y, b);
    expect(Math.hypot(rb.x - (L.seat.tea.x + 0.44), rb.z - L.seat.tea.z)).toBeLessThan(0.05);
    expect(rb.len).toBeLessThan(4.5);
    // 院子里到殿内拜垫后面：上踏跺、进殿门，停在垫子后头（垫子本身站不上去）
    const c = findPath(6, 14, 0, 0, L.hall.z + L.kneeler.dz + 0.42)!;
    expect(c, '进殿没找到路').not.toBeNull();
    const rc = walkable(6, 14, 0, c);
    expect(rc.y).toBeCloseTo(HALL_Y, 2);
    expect(Math.hypot(rc.x, rc.z - (L.hall.z + L.kneeler.dz + 0.42))).toBeLessThan(0.25);
    // 站不住的终点（紧挨香炉）：走到它旁边
    const d = findPath(3, 24, 0, L.censer.x, L.censer.z + 0.5)!;
    expect(d, '香炉旁没找到路').not.toBeNull();
    const rd = walkable(3, 24, 0, d);
    expect(Math.hypot(rd.x - L.censer.x, rd.z - (L.censer.z + 0.5))).toBeLessThan(0.9);
    // 楼上：从上楼处到撞木旁，绕开钟
    const e = findPath(L.bell.x - 1.6, L.bell.z + 0.6, TOWER_Y, L.bell.x - 0.46, L.bell.z + 1.9, 'bell')!;
    expect(e, '钟楼上没找到路').not.toBeNull();
    walkable(L.bell.x - 1.6, L.bell.z + 0.6, TOWER_Y, e, 'bell');
    // 水里没有路
    expect(findPath(-6, 39.5, 0, -6, 32)?.at(-1)?.[1] ?? 99).toBeGreaterThan(37.5);
  });
  it('镜头的杆被高墙挡住，矮的东西不挡', () => {
    expect(boom(0, 44, 0, 48)).toBe(1);                       // 穿山门的门洞
    expect(boom(12, 44.5, 12, 48)).toBeLessThan(0.6);         // 南墙
    expect(boom(0, 24, 0, 16)).toBe(1);                       // 越过香炉
  });
  it('认得出人在哪一处', () => {
    expect(placeAt(0, L.hall.z).id).toBe('hall');
    expect(placeAt(0, 6).id).toBe('steps');
    expect(placeAt(0, 32).id).toBe('court');
    expect(placeAt(-8, 39).id).toBe('pond');
    expect(placeAt(0, 23.5).id).toBe('censer');
    expect(placeAt(35.6, -15.5).id).toBe('terrace');
    expect(placeAt(0, 80).id).toBe('foot');
    expect(placeAt(L.study.x, L.study.z).id).toBe('study');
    expect(placeAt(L.tea.x, L.tea.z).id).toBe('tea');
    expect(placeAt(0, 0, 'bell').id).toBe('bell');
    expect(f.size).toBeGreaterThan(60000);
  });
});
