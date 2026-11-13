// 总图的几条规矩：加一倍法的数目、水往低处流、路与田不落在水里。
import { describe, expect, it } from 'vitest';
import { PATHS, PLOTS, SITE, STREAM, TREES, ground, plotAt, streamAt, waterAt } from '../src/world/site';

describe('总图', () => {
  it('一梅、两松、三十二丛竹、六十四株桃', () => {
    const n = (k: string) => TREES.filter((t) => t.kind === k).length;
    expect(n('plum')).toBe(1);
    expect(n('pine')).toBe(2);
    expect(n('bamboo')).toBe(32);
    expect(n('peach')).toBe(64);
  });
  it('溪水一路往低处流', () => {
    for (let i = 1; i < STREAM.length; i++) expect(STREAM[i].y).toBeLessThanOrEqual(STREAM[i - 1].y + 1e-9);
  });
  it('井田是九畦，当中一畦在耕', () => {
    const jing = PLOTS.filter((p) => p.x1 < 20);
    expect(jing.length).toBe(9);
    expect(plotAt(-27, 92)?.crop).toBe('plough');
  });
  it('路不在水里（桥与踏石除外）', () => {
    for (const p of PATHS) for (const [x, z] of p.pts) {
      if (p.id === '过桥进门' || p.id === '踏石') continue;
      const w = waterAt(x, z);
      expect(w ? w.depth : 0, `${p.id} (${x}, ${z})`).toBeLessThan(0.12);
    }
  });
  it('院子是平的，溪比两岸低', () => {
    expect(Math.abs(ground(0, 10) - ground(6, 12))).toBeLessThan(0.05);
    const s = streamAt(0, 30);
    expect(ground(0, 30)).toBeLessThan(s.y - 0.3);
    expect(ground(SITE.gate.x, SITE.gate.z)).toBeGreaterThan(s.y + 1);
  });
});
