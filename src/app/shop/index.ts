/**
 * 衣饰铺：买过的（衣箱里有的）、怎么付钱。
 *
 * 收真钱：付款要服务器那边开通（微信支付、支付宝之类的收款，下单、验签、回调都在服务器上）。这里只留一个接口——
 *   setPayAdapter({ buy(item) { …开付款页、等服务器说付成了… }, owned() { …服务器记着的买过的… }, label: '微信支付' })
 * 接上了，铺子里「买」就走它；没接上（此刻线上就是这样），「买」会说付款还没开通，可以先试穿。
 * 开发服务器（vite dev）与网址带 ?shop=test 时有一个不收钱的「试用」付法，好在本机把买、穿、存走一遍。
 *
 * 买过的先记在世界的存档里（mem 'wardrobe' 的 owned：本机）；接了服务器以后以服务器那一份为准（owned() 拉回来并进去），
 * 换了手机、清了缓存也找得回来。默认不发任何网络请求。
 */
import { ATTIRE_BY_ID, type AttireItem } from '../../data/attire';
import type { Anlewo } from '../../world/Anlewo';

export interface PayResult { ok: boolean; why?: string; receipt?: string }
export interface PayAdapter {
  /** 付这一样的钱：开付款页、等服务器说付成了。付成了 ok 为真 */
  buy(item: AttireItem): Promise<PayResult>;
  /** 服务器那边记着的买过的（id 的单子） */
  owned?(): Promise<string[]>;
  /** 用什么付（铺子里写在「付款」旁边，如「微信支付」） */
  label?: string;
}

let adapter: PayAdapter | null = null;
/** 接上付款（服务器那一路调） */
export function setPayAdapter(a: PayAdapter | null) { adapter = a; }
const testMode = () => {
  try { return !!import.meta.env?.DEV || (typeof location !== 'undefined' && /[?&]shop=test(&|$)/.test(location.search)); } catch { return false; }
};
const TEST: PayAdapter = {
  label: '试用（不收钱）',
  async buy() { await new Promise((r) => setTimeout(r, 500)); return { ok: true, receipt: `test-${Date.now()}` }; },
};
/** 此刻能不能付：接上了的那一个；开发、?shop=test 时是不收钱的试用；都没有是 null */
export const payAdapter = (): PayAdapter | null => adapter ?? (testMode() ? TEST : null);

const NS = 'wardrobe';
interface Mem { owned?: string[]; log?: Array<[string, number, string]> }
/** 衣箱里有的（买过的；带着来的不在这里，一概算有） */
export function ownedSet(k: Anlewo): Set<string> {
  const m = k.mem.get<Mem>(NS, {});
  return new Set((Array.isArray(m.owned) ? m.owned : []).filter((id) => ATTIRE_BY_ID.has(id)));
}
export const owns = (k: Anlewo, id: string) => (ATTIRE_BY_ID.get(id)?.price ?? 1) === 0 || ownedSet(k).has(id);
/** 收进衣箱（付成了以后） */
export function grant(k: Anlewo, id: string, receipt = '') {
  const m = k.mem.get<Mem>(NS, {}), set = ownedSet(k);
  if (set.has(id)) return;
  set.add(id);
  const log = (Array.isArray(m.log) ? m.log : []).slice(-60);
  log.push([id, Date.now(), receipt.slice(0, 64)]);
  k.mem.set(NS, { ...m, owned: [...set], log });
}
/** 买一样：付成了就收进衣箱。返回付的结果（没开通：ok 假、why 'closed'） */
export async function buy(k: Anlewo, item: AttireItem): Promise<PayResult> {
  if (owns(k, item.id)) return { ok: true };
  const a = payAdapter();
  if (!a) return { ok: false, why: 'closed' };
  let r: PayResult;
  try { r = await a.buy(item); } catch (e) { r = { ok: false, why: String((e as Error)?.message ?? e).slice(0, 80) }; }
  if (r.ok) grant(k, item.id, r.receipt ?? '');
  return r;
}
/** 接了服务器的：把那边记着的买过的并进来（衣饰那一页打开时调一回） */
export async function syncOwned(k: Anlewo): Promise<void> {
  const a = adapter;
  if (!a?.owned) return;
  try { for (const id of await a.owned()) if (ATTIRE_BY_ID.has(id)) grant(k, id, 'server'); } catch { /* 连不上就用本机那一份 */ }
}
/** 价钱怎么写 */
export const priceText = (p: number) => (p > 0 ? `¥${p}` : '');
