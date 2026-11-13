// 行走图：各处走得到；水里、墙里、菊圃里走不进；桥与踏石过得去。
import { describe, expect, it } from 'vitest';
import { PLACES, SITE, streamAt } from '../src/world/site';
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
    expect(waterDepth(-60, streamAt(-60, 31.5).d < 1 ? 31.5 : 31.5)).toBeGreaterThan(0.3);
    expect(groundAt(-62, 31.5)).toBeNull();
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
