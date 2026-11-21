/**
 * 星空：星表与星官的数据、日月星斗的位置。几件可以拿常识核对的事——
 *   夏夜织女星近天顶；春天黄昏斗柄朝东（夏南、秋西、冬北）；冬夜参宿在南天；北极星的高度就是洛阳的纬度；
 *   日出日落与 atmos 的表对得上；月望时与日相对；二十八宿的距星都在各自那一宿里，由西往东排……
 */
import { describe, expect, it } from 'vitest';
import { altAz, app3, D2R, EQ_TO_GAL, LAT, planets, sceneSky, skyDay, sun, daysJ2000, vecEq, warpHour, halfDay } from '../src/world/env/stars/astro';
import { loadSky, mansionOf, nearest, XIANG, xiangOf } from '../src/world/env/stars/catalog';
import { HAN, METEOR, NOTES, PLANET_NOTE, QUOTES, SHOWERS, XIANG_NOTE } from '../src/data/starlore';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STAR_HIP_B64 } from '../src/data/stars-hip';
import { STAR_DATA } from '../src/data/stars';
import { XINGGUAN } from '../src/data/xingguan';

// 与 src/world/env/atmos.ts 的两张表一致（那边改了，这里也要改）
const SUN: Record<string, [number, number, number]> = { spring: [6.0, 18.2, 56], summer: [5.1, 19.1, 74], autumn: [6.3, 17.5, 52], winter: [7.0, 17.0, 34] };
const DAY: Record<string, number> = { spring: 95, summer: 185, autumn: 280, winter: 5 };

const sky = loadSky(), S = sky.stars;
const hips = (() => { const b = Buffer.from(STAR_HIP_B64, 'base64'); return new Uint32Array(b.buffer, b.byteOffset, b.byteLength / 4); })();
const idx = (hip: number) => { const i = hips.indexOf(hip); if (i < 0) throw new Error('星表里没有 HIP ' + hip); return i; };
const at = (season: string, hour: number, o: { kday?: number; phase?: number; year?: number } = {}) =>
  sceneSky({ year: o.year ?? 2026, season, base: DAY[season], sr: SUN[season][0], ss: SUN[season][1], kday: o.kday ?? 0, hour, phase: o.phase ?? 0.42 });
const w = (now: ReturnType<typeof at>, i: number) => app3(now.M, S.dir[i * 3], S.dir[i * 3 + 1], S.dir[i * 3 + 2], [0, 0, 0]);
const sep = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / D2R;
/** 斗柄所指（「认北斗」里同一个判法）：面朝北看，从天极到斗柄末梢（摇光）——横着偏多是东西，竖着偏多是南（朝上）北 */
const handle = (now: ReturnType<typeof at>) => {
  const b = w(now, sky.dipper[6]), h = [b[0], b[1] - Math.sin(LAT * D2R), b[2] + Math.cos(LAT * D2R)];
  return Math.abs(h[0]) > Math.abs(h[1]) ? (h[0] > 0 ? '东' : '西') : h[1] > 0 ? '南' : '北';
};
const VEGA = 91262, DENEB = 102098, ALTAIR = 97649, POLARIS = 11767, MINTAKA = 25930, BETELGEUSE = 27989, ANTARES = 80763, SIRIUS = 32349;

describe('星表', () => {
  it('五千多颗，亮于 6 等的都在，按星等排好', () => {
    expect(S.n).toBeGreaterThan(5000);
    expect(S.n).toBeLessThan(5400);
    expect(S.mag.filter((m) => m <= 6).length).toBeGreaterThan(5000);
    for (let i = 1; i < S.n; i++) expect(S.mag[i]).toBeGreaterThanOrEqual(S.mag[i - 1] - 1e-6);
    // 最亮的是天狼星
    expect(hips[0]).toBe(SIRIUS);
    expect(S.mag[0]).toBeCloseTo(-1.44, 1);
  });
  it('解出来的位置、星等、颜色对得上（织女星、心宿二）', () => {
    const v = idx(VEGA), [ra, de] = vecEq([S.dir[v * 3], S.dir[v * 3 + 1], S.dir[v * 3 + 2]]);
    expect(ra / D2R).toBeCloseTo(279.23, 1);
    expect(de / D2R).toBeCloseTo(38.78, 1);
    expect(S.mag[v]).toBeCloseTo(0.03, 1);
    expect(S.bv[idx(ANTARES)]).toBeGreaterThan(1.5);     // 大火是红的
    expect(S.bv[idx(VEGA)]).toBeLessThan(0.1);
  });
  it('数据不大（几十 KB）', () => {
    expect(STAR_DATA.length).toBeLessThan(48 * 1024);
    expect(JSON.stringify(XINGGUAN).length).toBeLessThan(48 * 1024);
  });
});

describe('星官', () => {
  it('三垣二十八宿齐全，二十八宿的星官都在', () => {
    expect(sky.regions.length).toBe(31);
    for (let r = 3; r < 31; r++) expect(sky.find(sky.regions[r]), sky.regions[r]).toBeTruthy();
    expect(sky.asterisms.length).toBeGreaterThan(270);
    for (const a of sky.asterisms) { expect(a.region).toBeGreaterThanOrEqual(0); expect(a.region).toBeLessThan(31); expect(a.stars.length).toBeGreaterThan(0); }
  });
  it('距星在各自那一宿里；二十八宿由西往东一宿接一宿（赤经逐宿增加，绕一圈）', () => {
    expect(sky.ju.length).toBe(28);
    let turn = 0;
    for (let k = 0; k < 28; k++) {
      const a = sky.find(sky.regions[k + 3])!;
      expect(a.stars, sky.regions[k + 3]).toContain(sky.ju[k]);
      const j = sky.ju[k], n = sky.ju[(k + 1) % 28];
      const ra0 = vecEq([S.dir[j * 3], S.dir[j * 3 + 1], S.dir[j * 3 + 2]])[0], ra1 = vecEq([S.dir[n * 3], S.dir[n * 3 + 1], S.dir[n * 3 + 2]])[0];
      let dr = (ra1 - ra0) / D2R; if (dr < -180) dr += 360; if (dr > 180) dr -= 360;
      // 觜、参两宿的距星今天前后颠倒了一点（「觜参颠倒」），差不到两度；别的都往东走
      if (sky.regions[k + 3] !== '觜宿') expect(dr, `${sky.regions[k + 3]}→${sky.regions[(k + 1) % 28 + 3]}`).toBeGreaterThan(0);
      turn += dr;
    }
    expect(Math.round(turn)).toBe(360);
  });
  it('北斗七星依次、北极星；几颗常说的星的名字', () => {
    expect(sky.dipper.map((i) => hips[i])).toEqual([54061, 53910, 58001, 59774, 62956, 65378, 67301, POLARIS]);
    expect(sky.find('北斗')!.stars.length).toBe(7);
    expect(sky.starName(idx(VEGA))).toBe('织女一');
    expect(sky.starName(idx(ALTAIR))).toBe('河鼓二');
    expect(sky.starName(idx(ANTARES))).toBe('心宿二');
    expect(sky.starName(idx(BETELGEUSE))).toBe('参宿四');
    expect(sky.starName(idx(POLARIS))).toBe('勾陈一');
    expect(sky.starName(idx(SIRIUS))).toBe('天狼');
    expect(sky.byStar.get(idx(VEGA))!.map((a) => sky.asterisms[a].name)).toContain('织女');
  });
  it('所属：织女、河鼓在牛宿，北斗在紫微垣，轩辕在星宿，大角在亢宿', () => {
    const reg = (n: string) => sky.regions[sky.find(n)!.region];
    expect(reg('织女')).toBe('牛宿');
    expect(reg('河鼓')).toBe('牛宿');
    expect(reg('北斗')).toBe('紫微垣');
    expect(reg('轩辕')).toBe('星宿');
    expect(reg('大角')).toBe('亢宿');
    expect(reg('天狼')).toBe('井宿');
    expect(xiangOf(sky.find('心宿')!.region)!.name).toBe('东方苍龙');
    expect(xiangOf(sky.find('参宿')!.region)!.name).toBe('西方白虎');
    expect(XIANG.map((x) => sky.regions[x.from])).toEqual(['角宿', '斗宿', '奎宿', '井宿']);
  });
  it('点一个方向，找得到那颗显眼的星', () => {
    const v = idx(VEGA), d = [S.dir[v * 3] + 0.01, S.dir[v * 3 + 1], S.dir[v * 3 + 2] + 0.01], l = Math.hypot(d[0], d[1], d[2]);
    expect(nearest(S, [d[0] / l, d[1] / l, d[2] / l], 3 * D2R)).toBe(v);
  });
});

describe('观星时的话（starlore）', () => {
  const doc = readFileSync(join(__dirname, '..', 'docs', 'SOURCES.md'), 'utf8');
  const all = [...Object.values(QUOTES).flat(), ...Object.values(XIANG_NOTE).flatMap((x) => x.quotes), ...Object.values(PLANET_NOTE).map((p) => p.quote).filter(Boolean) as Array<{ text: string; source: string }>, ...HAN, METEOR];
  it('每一句原话都记在 docs/SOURCES.md 的「星空」一节，出处带书名号或作者', () => {
    expect(all.length).toBeGreaterThan(25);
    for (const q of all) {
      expect(doc, q.text).toContain(q.text);
      expect(q.source, q.text).toMatch(/《.+》/);
      expect(q.text, q.text).not.toMatch(/[A-Za-z]/);
      expect(q.text, q.text).toMatch(/[。！？]$/);
    }
  });
  it('配话的星官、星名都在数据里', () => {
    for (const n of Object.keys(QUOTES)) expect(sky.find(n), n).toBeTruthy();
    const names = new Set<string>(); for (let i = 0; i < S.n; i++) { const s = sky.starName(i); if (s) names.add(s); }
    for (const n of Object.keys(NOTES)) expect(names.has(n) || !!sky.find(n) || ['天枢', '天璇', '天玑', '天权', '玉衡', '开阳', '摇光'].includes(n), n).toBe(true);
  });
  it('不说吉凶：没有占辞', () => {
    for (const q of all) expect(q.text, q.text).not.toMatch(/吉|凶|兵起|治安|见则|其国/);
  });
  it('流星雨：日期在一年之内，辐射点合理', () => {
    for (const s of SHOWERS) { expect(s.peak).toBeGreaterThan(0); expect(s.peak).toBeLessThan(366); expect(Math.abs(s.dec)).toBeLessThan(90); }
  });
  it('月在哪一宿：二十八宿首尾相接，每个方向都有一宿', () => {
    const got = new Set<string>();
    for (let ra = 0; ra < 360; ra += 2) got.add(mansionOf([Math.cos(ra * D2R), Math.sin(ra * D2R), 0]));
    expect(got.size).toBeGreaterThanOrEqual(26);
    // 角宿一（室女座 α）就在角宿
    const v = idx(65474);
    expect(mansionOf([S.dir[v * 3], S.dir[v * 3 + 1], S.dir[v * 3 + 2]])).toBe('角宿');
  });
});

describe('日月星斗在画里的位置（洛阳）', () => {
  it('北极星的高度约等于洛阳的纬度，在正北', () => {
    const p = altAz(w(at('autumn', 21), idx(POLARIS)));
    expect(Math.abs(p.alt - LAT)).toBeLessThan(1.2);
    expect(Math.min(p.az, 360 - p.az)).toBeLessThan(2);
  });
  it('夏夜织女星近天顶', () => {
    const p = altAz(w(at('summer', 23), idx(VEGA)));
    expect(p.alt).toBeGreaterThan(75);
  });
  it('天顶附近最亮的星：夏夜是织女，秋夜是天津四', () => {
    const top = (now: ReturnType<typeof at>) => { let b = -1; for (let i = 0; i < S.n && i < 400; i++) { const p = w(now, i); if (p[1] > Math.cos(16 * D2R)) { b = i; break; } } return b; };
    expect(hips[top(at('summer', 23.5))]).toBe(VEGA);
    expect(hips[top(at('autumn', 20))]).toBe(DENEB);
  });
  it('斗柄：春天黄昏朝东，夏南，秋西，冬北', () => {
    expect(handle(at('spring', SUN.spring[1] + 1.2))).toBe('东');
    expect(handle(at('summer', SUN.summer[1] + 1.2))).toBe('南');
    expect(handle(at('autumn', SUN.autumn[1] + 1.2))).toBe('西');
    expect(handle(at('winter', SUN.winter[1] + 1.2))).toBe('北');
  });
  it('冬夜参宿在南天', () => {
    const p = altAz(w(at('winter', 22), idx(MINTAKA)));
    expect(p.alt).toBeGreaterThan(35);
    expect(p.az).toBeGreaterThan(130);
    expect(p.az).toBeLessThan(230);
  });
  it('参与商不相见：参宿四在天上时，心宿二在地下', () => {
    for (const [s, h] of [['winter', 22], ['spring', 20]] as const) {
      const now = at(s, h);
      expect(altAz(w(now, idx(BETELGEUSE))).alt).toBeGreaterThan(10);
      expect(altAz(w(now, idx(ANTARES))).alt).toBeLessThan(0);
    }
  });
  it('日出日落正落在 atmos 那张表的时刻上', () => {
    for (const s of ['spring', 'summer', 'autumn', 'winter']) {
      const [sr, ss, maxEl] = SUN[s];
      expect(altAz(at(s, sr).sunW).alt, s + ' 日出').toBeCloseTo(-0.83, 0);
      expect(altAz(at(s, ss).sunW).alt, s + ' 日落').toBeCloseTo(-0.83, 0);
      // 日中最高：与表里的仰角差不过七度；在正南
      const noon = at(s, (sr + ss) / 2), p = altAz(noon.sunW);
      expect(Math.abs(p.alt - maxEl), s + ' 日中').toBeLessThan(7);
      expect(Math.abs(p.az - 180)).toBeLessThan(1);
      // 早上在东边升起，傍晚在西边落下
      expect(at(s, sr + 0.5).sunW[0]).toBeGreaterThan(0);
      expect(at(s, ss - 0.5).sunW[0]).toBeLessThan(0);
    }
  });
  it('拉过的钟点首尾相接、一路往前走', () => {
    for (const s of ['spring', 'summer', 'autumn', 'winter']) {
      const [sr, ss] = SUN[s], H0 = halfDay(sun(daysJ2000(2026, DAY[s], 12)).dec);
      let prev = warpHour(0, sr, ss, H0);
      for (let h = 0.05; h < 24; h += 0.05) {
        const x = warpHour(h, sr, ss, H0);
        let dx = x - prev; if (dx < -12) dx += 24;
        expect(dx).toBeGreaterThan(0); expect(dx).toBeLessThan(0.1);
        prev = x;
      }
    }
  });
  it('月：望时与日相对；上弦的黄昏在南天', () => {
    const full = at('autumn', 21, { phase: 0.5 });
    expect(sep(full.moonW, full.sunW)).toBeGreaterThan(170);
    const q = at('spring', SUN.spring[1], { phase: 0.25 }), p = altAz(q.moonW);
    expect(p.alt).toBeGreaterThan(25);
    expect(p.az).toBeGreaterThan(130); expect(p.az).toBeLessThan(230);
    // 新月（初三）黄昏在西边低处
    const n = altAz(at('spring', SUN.spring[1] + 0.3, { phase: 0.1 }).moonW);
    expect(n.az).toBeGreaterThan(230); expect(n.az).toBeLessThan(320); expect(n.alt).toBeGreaterThan(0);
  });
  it('第几日往后推，天跟着日子走，不跑出这一季', () => {
    expect(skyDay('spring', 95, 0)).toBe(95);
    expect(skyDay('spring', 95, 10)).toBe(105);
    for (let k = 0; k < 400; k += 7) {
      const d = skyDay('winter', 5, k);
      expect(d >= 312 || d < 35, `冬 ${k} → ${d}`).toBe(true);
      const e = skyDay('summer', 185, k);
      expect(e >= 126 && e < 219).toBe(true);
    }
  });
  it('银心在人马座（赤经 266.4°、赤纬 −28.9°）', () => {
    const g = [EQ_TO_GAL[0], EQ_TO_GAL[1], EQ_TO_GAL[2]], [ra, de] = vecEq(g);
    expect(ra / D2R).toBeCloseTo(266.4, 0);
    expect(de / D2R).toBeCloseTo(-28.94, 0);
  });
  it('五星：金星离日不过四十八度，水星不过二十八度，亮度在常见的范围里', () => {
    for (let doy = 1; doy < 366; doy += 9) {
      const p = Object.fromEntries(planets(daysJ2000(2026, doy, 21)).map((x) => [x.id, x]));
      expect(p.venus.elong / D2R).toBeLessThan(48);
      expect(p.mercury.elong / D2R).toBeLessThan(28.5);
      expect(p.venus.mag).toBeLessThan(-3.7); expect(p.venus.mag).toBeGreaterThan(-5);
      expect(p.jupiter.mag).toBeLessThan(-1.5); expect(p.jupiter.mag).toBeGreaterThan(-3);
      expect(p.saturn.mag).toBeLessThan(1.6); expect(p.saturn.mag).toBeGreaterThan(-0.7);
      expect(p.mars.mag).toBeLessThan(2); expect(p.mars.mag).toBeGreaterThan(-3);
    }
  });
});
