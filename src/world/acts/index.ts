import type { Anlewo } from '../Anlewo';
import type { Act } from './types';

/**
 * 这里能做的事。每个文件（acts/ 下除了 index、types、util）导出 create(k)：返回一件或几件事。
 * 哪一件的器物没备好（屋舍还没建、挂点没找到），就只少那一件，别的照常。
 * ORDER 是「两件事一样近时先提哪件」的顺序，没列出的排在后面。
 */
const MODS = import.meta.glob<{ create?: (k: Anlewo) => Act | Act[] | null }>(['./*.ts', '!./index.ts', '!./types.ts', '!./util.ts'], { eager: true });
const ORDER = ['couplet', 'book', 'write', 'qin', 'tea', 'wine', 'nap', 'guan', 'dipper', 'mums', 'sweep', 'gnomon', 'well', 'ask', 'yuqiao'];

export function createActs(k: Anlewo): Record<string, Act> {
  const all: Act[] = [];
  for (const [file, m] of Object.entries(MODS)) {
    if (!m.create) continue;
    try { const r = m.create(k); if (r) all.push(...(Array.isArray(r) ? r : [r])); } catch (e) { console.warn(`${file} 里的事没能备好`, e); }
  }
  const rank = (id: string) => { const i = ORDER.indexOf(id.split(':')[0]); return i < 0 ? 99 : i; };
  all.sort((a, b) => rank(a.id) - rank(b.id));
  const out: Record<string, Act> = {};
  for (const a of all) out[a.id] = a;
  return out;
}
