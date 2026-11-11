/** 场景 → 各层该有多少：鸟的疏密、夜虫的起落、蝉。纯函数，便宜。 */
import type { Layer, Scene } from './types';
import { smooth } from './util';

const bump = (x: number, a: number, b: number, c: number, d: number) => smooth(a, b, x) * (1 - smooth(c, d, x));

/** 鸟的疏密 0…1.2：清晨 5–8 点最密，白天稀，傍晚归巢稍密，夜里没有；雨雪天少，冬天少、春天多 */
export function birdDensity(s: Scene): number {
  const h = ((s.hour % 24) + 24) % 24;
  const dawn = bump(h, 4.6, 5.6, 7.6, 9.2);
  const day = bump(h, 7.5, 9.5, 16, 17.5) * 0.3;
  const dusk = bump(h, 16.2, 17.2, 18.4, 19.3) * 0.55;
  let d = Math.max(dawn, day, dusk);
  d *= s.weather === 'rain' ? 0.25 : s.weather === 'snow' ? 0.15 : s.weather === 'mist' ? 0.7 : 1;
  d *= s.season === 'winter' ? 0.5 : s.season === 'spring' ? 1.2 : s.season === 'autumn' ? 0.85 : 1;
  return d;
}
/** 夜 0…1：19 点后渐起，清晨收 */
export function night(s: Scene): number {
  const h = ((s.hour % 24) + 24) % 24;
  return 1 - bump(h, 4.3, 5.6, 18.6, 20.3);
}
/** 蟋蟀一类 0…1：只在夜里；冬天没有，秋天近满，雨夜少 */
export function cricketAmount(s: Scene): number {
  const season = s.season === 'winter' ? 0 : s.season === 'spring' ? 0.35 : s.season === 'summer' ? 1 : 0.8;
  const w = s.weather === 'rain' ? 0.4 : s.weather === 'snow' ? 0 : s.weather === 'mist' ? 0.9 : 1;
  return night(s) * season * w;
}
/** 极远的蝉 0…1：只在夏天的白天、不下雨时 */
export function cicadaAmount(s: Scene): number {
  if (s.season !== 'summer' || s.weather === 'rain' || s.weather === 'snow') return 0;
  const h = ((s.hour % 24) + 24) % 24;
  return bump(h, 8.5, 10.5, 17, 18.5);
}

/** 天气 / 场景自己带出来的量（用户把这层关到 0 也有） */
export function sceneBase(l: Layer, s: Scene): number {
  switch (l) {
    case 'rain': return s.weather === 'rain' ? 0.6 : 0;
    case 'stream': return 0.5 * s.water;
    case 'insects': return 0.35;
    default: return 0;
  }
}
/** 场景修正（乘在 max(基础量, 用户量) 上） */
export function sceneMod(l: Layer, s: Scene): number {
  switch (l) {
    case 'wind': return (0.75 + 0.55 * s.height) * (s.weather === 'snow' ? 0.6 : s.weather === 'mist' ? 0.8 : s.weather === 'rain' ? 1.1 : 1);
    case 'birds': { const d = birdDensity(s); return d > 0.01 ? 0.6 + 0.4 * Math.min(1, d) : 0; }
    case 'stream': return 0.45 + 0.75 * s.water;
    case 'insects': return Math.max(cricketAmount(s), cicadaAmount(s) * 0.5);
    case 'eaves': return 0.7 + 0.5 * s.height;
    case 'bellfar': return s.weather === 'snow' ? 0.7 : 1;
    default: return 1;
  }
}
