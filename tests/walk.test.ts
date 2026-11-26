// 行走图：各处走得到；水里、墙里、菊圃里走不进；桥与踏石过得去。
import { describe, expect, it } from 'vitest';
import { PLACES, SITE, streamAt, streamZ } from '../src/world/site';
import { BRIDGE_Y, HALL_Y, findPath, groundAt, placeAt, standable, waterDepth } from '../src/world/walk';

describe('行走图', () => {
  it('村图上的每一处都站得住人', () => {
    for (const p of PLACES) expect(standable(p.spawn[0], p.spawn[1]), `${p.id} (${p.spawn[0]}, ${p.spawn[1]})`).not.toBeNull();
  });
  it('从入口一处一处走得通', () => {
    const order = ['grove', 'bridge', 'yard', 'hall', 'yard', 'pavilion', 'yard', 'bridge', 'fields', 'ferry', 'fields', 'village'];
    let [x, z] = PLACES.find((p) => p.id === order[0])!.spawn;
    for (const id of order.slice(1)) {
      const t = PLACES.find((p) => p.id === id)!.spawn, y = groundAt(x, z)!;
      const path = findPath(x, z, y, t[0], t[1], 'ground', 2_000_000);
      expect(path, `${x.toFixed(0)},${z.toFixed(0)} → ${id}`).not.toBeNull();
      const end = path![path!.length - 1];
      expect(Math.hypot(end[0] - t[0], end[1] - t[1]), `到 ${id} 差多远`).toBeLessThan(0.6);
      [x, z] = [t[0], t[1]];
    }
  }, 120000);
  it('溪心、池心不能走，桥上、踏石上能走', () => {
    // 村南那一段溪（石桥以西）
    expect(waterDepth(-30, streamZ(-30))).toBeGreaterThan(0.3);
    expect(groundAt(-32, streamZ(-32))).toBeNull();
    expect(groundAt(SITE.pond.x, SITE.pond.z)).toBeNull();
    expect(standable(SITE.bridge.x, SITE.bridge.z)).toBeCloseTo(BRIDGE_Y, 3);
    expect(standable(SITE.stones.x, SITE.stones.z)).not.toBeNull();
  });
  it('屋里是屋里的地面，墙里、菊圃里站不住', () => {
    expect(standable(0, 0.5)).toBeCloseTo(HALL_Y, 3);
    expect(placeAt(0, 0.5).indoor).toBe(1);
    expect(standable(SITE.hall.w / 2 - 0.1, 0)).toBeNull();
    expect(standable((SITE.mums.x0 + SITE.mums.x1) / 2, (SITE.mums.z0 + SITE.mums.z1) / 2)).toBeNull();
    expect(standable(SITE.table.x, SITE.table.z)).toBeNull();
  });
  it('过了界就没有地面', () => {
    expect(groundAt(SITE.bounds.x0 - 2, 40)).toBeNull();
    expect(groundAt(0, SITE.bounds.z1 + 2)).toBeNull();
  });
});

// 行者走远路（travel.ts）：隔着溪、桥又在几十米外时，以前格子找路找不完就直着朝溪走过去，卡在岸边
describe('走远路过溪', async () => {
  const { travel, wetLine, streamSide } = await import('../src/world/travel');
  /** 一条路（从 a 起）上有没有一处要蹚深水：水深过能蹚的地方，得是桥面或踏石（站得住） */
  const dry = (a: [number, number], pts: Array<[number, number]>) => {
    let [x, z] = a;
    for (const p of pts) {
      const n = Math.max(1, Math.ceil(Math.hypot(p[0] - x, p[1] - z) / 0.3));
      for (let i = 1; i <= n; i++) { const u = i / n, sx = x + (p[0] - x) * u, sz = z + (p[1] - z) * u; if (waterDepth(sx, sz) > 0.3 && standable(sx, sz, 'ground', 0.05) == null) return `${sx.toFixed(1)},${sz.toFixed(1)} 要蹚深水`; }
      [x, z] = p;
    }
    return '';
  };
  const CASES: Array<[string, [number, number], [number, number]]> = [
    ['西坡 → 桃林路（桥在百来米外）', [-96, 20], [-98, 36.5]],
    ['桃林口 → 院中（过板桥）', [-150, 37.5], [1.2, 13.6]],
    ['园前 → 井田（过石桥）', [-34, 40.6], [-27, 86]],
    ['碓房 → 溪南东（走汀步）', [98, 11.5], [100, 66]],
    ['东村 → 东田', [136, 6], [122, 93]],
    ['茶亭 → 对岸', [33.6, 23.4], [30, 72]],
  ];
  for (const [name, a, b] of CASES) {
    it(name, () => {
      expect(wetLine(a[0], a[1], b[0], b[1]), '直线本来要过溪').toBe(true);
      expect(streamSide(a[0], a[1])).not.toBe(streamSide(b[0], b[1]));
      const pts = travel(a[0], a[1], groundAt(a[0], a[1])!, b[0], b[1]);
      expect(pts, '找得到路').not.toBeNull();
      expect(dry(a, pts!), '一路不蹚深水（过桥或踩汀步）').toBe('');
      const end = pts![pts!.length - 1];
      expect(Math.hypot(end[0] - b[0], end[1] - b[1]), '走到了').toBeLessThan(1.2);
    }, 60000);
  }
  it('给出来的路不是空的：要么没有路（null），要么至少一个点（贴着墙、桌、篱笆的短路也一样）', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let n = 0;
    for (const [cx, cz] of [[4.2, 0], [-4.2, -1], [0, 2.4], [6, 9], [-6, 9], [2.6, 12.8]] as Array<[number, number]>) {
      for (let i = 0; i < 30; i++) {
        const ax = cx + (rnd() - 0.5) * 2, az = cz + (rnd() - 0.5) * 2, ay = groundAt(ax, az);
        if (ay == null) continue;
        const p = travel(ax, az, ay, ax + (rnd() - 0.5) * 0.6, az + (rnd() - 0.5) * 0.6);
        expect(p === null || p.length > 0, `${ax.toFixed(2)},${az.toFixed(2)}`).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(60);
  });
  it('不过溪的近路照旧是格子找路（直着走得到就一步）', () => {
    const pts = travel(0, 12, groundAt(0, 12)!, 3, 13);
    expect(pts).toEqual([[3, 13]]);
  });
});
