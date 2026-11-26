/**
 * 外乡客穿着什么（Wear）：男女、一件衣、一样冠（髻）、几样簪饰、几样佩——换算成一身 Look（figure 照着画）；
 * 同游时编成几个小整数报给中转（net 的 setLook），别人那边照着画成同样的一身。
 *
 * 单子在 data/attire.ts（只往后添；序号是同游两边的约定）。穿着存在世界的存档里（mem 'player' 的 wear）。
 */
import { ATTIRE, ATTIRE_BY_ID, CAT_MAX, type AttireCat, type AttireItem } from '../../data/attire';
import type { Look, OrnId } from './types';

export interface Wear {
  sex: 'm' | 'f';
  yi: string;
  guan: string;
  zan: string[];
  pei: string[];
}

/** 带着来的那一身 */
export const DEFAULT_WEAR: Record<'m' | 'f', Wear> = {
  m: { sex: 'm', yi: 'm-zhiduo', guan: 'm-jin', zan: [], pei: ['hebao'] },
  f: { sex: 'f', yi: 'f-beizi', guan: 'f-panji', zan: ['zan-yin'], pei: [] },
};
/** 选人那一页给的三身（都是带着来的、不要钱的） */
export const STARTERS: Record<'m' | 'f', Wear[]> = {
  m: [
    DEFAULT_WEAR.m,
    { sex: 'm', yi: 'm-beizi', guan: 'm-futou', zan: [], pei: ['hebao'] },
    { sex: 'm', yi: 'm-duanhe', guan: 'm-shu', zan: [], pei: ['hebao'] },
  ],
  f: [
    DEFAULT_WEAR.f,
    { sex: 'f', yi: 'f-ruqun', guan: 'f-panji', zan: ['zan-yin'], pei: ['hebao'] },
    { sex: 'f', yi: 'f-qingbu', guan: 'f-baoji', zan: [], pei: ['hebao'] },
  ],
};

/** 男女的身子：女子肩窄些、个子矮一点；都没有须（年轻的外乡客） */
const BODY: Record<'m' | 'f', Partial<Look>> = {
  m: { build: 'm', scale: 1, head: 1, beard: 0, hairDens: 2.1, shade: 1.45 },
  f: { build: 'f', scale: 0.95, head: 0.97, beard: 0, hairDens: 2.0, hair: [0.2, 0.19, 0.2], shade: 1.4 },
};

/** 这一样他（她）能不能穿戴 */
export const fits = (a: AttireItem | undefined, sex: 'm' | 'f'): a is AttireItem => !!a && (a.sex === 'u' || a.sex === sex);
const pick = (id: unknown, cat: AttireCat, sex: 'm' | 'f'): AttireItem | null => {
  const a = typeof id === 'string' ? ATTIRE_BY_ID.get(id) : undefined;
  return a && a.cat === cat && fits(a, sex) ? a : null;
};

/**
 * 理一理：认不得的、男女不合的、超过件数的拿掉，衣与冠空着就补上带着来的那一样。
 * owned 给了的话，没有的（没买的）也拿掉
 */
export function cleanWear(w: Partial<Wear> | null | undefined, owned?: (id: string) => boolean): Wear {
  const sex: 'm' | 'f' = w?.sex === 'f' ? 'f' : 'm';
  const d = DEFAULT_WEAR[sex], ok = (a: AttireItem | null) => !!a && (!owned || a.price === 0 || owned(a.id));
  const yi = pick(w?.yi, 'yi', sex), guan = pick(w?.guan, 'guan', sex);
  const list = (ids: unknown, cat: AttireCat) => [...new Set(Array.isArray(ids) ? ids : [])].map((id) => pick(id, cat, sex)).filter((a): a is AttireItem => ok(a)).slice(0, CAT_MAX[cat]).map((a) => a.id);
  return { sex, yi: ok(yi) ? yi!.id : d.yi, guan: ok(guan) ? guan!.id : d.guan, zan: list(w?.zan, 'zan'), pei: list(w?.pei, 'pei') };
}

/** 穿着 → 一身打扮 */
export function lookOfWear(w: Wear): Partial<Look> {
  const c = cleanWear(w);
  const yi = ATTIRE_BY_ID.get(c.yi), guan = ATTIRE_BY_ID.get(c.guan);
  const orn: OrnId[] = [];
  for (const id of [...c.zan, ...c.pei]) { const o = ATTIRE_BY_ID.get(id)?.orn; if (o) orn.push(o); }
  return { ...BODY[c.sex], ...(yi?.look ?? {}), ...(guan?.look ?? {}), orn };
}

/** 一样东西在单子上的序号（同游里报的是序号加一；0 是空着） */
const IDX = new Map(ATTIRE.map((a, i) => [a.id, i + 1]));
/** 同游里的样子：[1（这一套的版本）, 男 0 / 女 1, 衣, 冠, 簪 ×3, 佩 ×2]（序号加一，0 是空着） */
export function wearToWire(w: Wear): number[] {
  const c = cleanWear(w), n = (id: string | undefined) => (id ? IDX.get(id) ?? 0 : 0);
  return [1, c.sex === 'f' ? 1 : 0, n(c.yi), n(c.guan), n(c.zan[0]), n(c.zan[1]), n(c.zan[2]), n(c.pei[0]), n(c.pei[1])];
}
/** 同游里报来的样子 → 穿着（认不得的那几样空着；整个认不得返回 null，画成读书人） */
export function wearFromWire(d: number[] | null | undefined): Wear | null {
  if (!d || d.length < 4 || d[0] !== 1 || (d[1] !== 0 && d[1] !== 1)) return null;
  const id = (i: number) => (d[i] && d[i] <= ATTIRE.length ? ATTIRE[d[i] - 1].id : '');
  return cleanWear({ sex: d[1] === 1 ? 'f' : 'm', yi: id(2), guan: id(3), zan: [id(4), id(5), id(6)].filter(Boolean), pei: [id(7), id(8)].filter(Boolean) });
}
/** 两身穿着一样不一样 */
export const sameWear = (a: Wear, b: Wear) => wearToWire(a).join() === wearToWire(b).join();
