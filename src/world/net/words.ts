/**
 * 同游里几样不碰画面的小事：连哪里、中文数、离多远怎么说、同名的怎么分。（单独一个文件：单元测试不必带上身子与画法）
 */
import { PLACES } from '../site';
import { PLACE_IDS, nameOf, robeName, type Name } from './proto';

/** 法国的中转：GitHub Pages 那一份、法国服务器上的那一份连它 */
export const DEFAULT_RELAY = 'wss://kongshan.169-58-39-104.nip.io/ws';

/**
 * 国内正式站：同源 `/ws` 由 Ingress 反代到集群里的 kongshan-relay（见 deploy/k8s/relay.yaml.tmpl），
 * 不必绕到法国，延迟从两三百毫秒降到二三十毫秒。别的站（GitHub Pages、法国）仍连 DEFAULT_RELAY。
 * 只认这一个域名：开发服务器、预览、别的域名都不走这条路。
 */
export const SAME_ORIGIN_HOSTS = ['anlewo.iwenxuai.com'];

/** 默认连哪里：给了网址上的 host（与是否 https）就按它判；没给就当是法国那一份——与从前一样 */
export function defaultRelay(host = '', secure = true): string {
  return SAME_ORIGIN_HOSTS.includes(host) ? `${secure ? 'wss' : 'ws'}://${host}/ws` : DEFAULT_RELAY;
}

/**
 * 连哪里：网址里的 ?ws= 说了算（0 不连、1 默认的、ws:// 或 wss:// 开头的就连它）；
 * 没说的话，正式的一版连默认的（同源的或法国的，见 defaultRelay），开发服务器（dev）与自动测试（webdriver）不连。
 * explicit：网址里明说了。
 */
export function relayUrl(search: string, dev: boolean, webdriver: boolean, host = '', secure = true): { url: string | null; explicit: boolean } {
  const def = defaultRelay(host, secure);
  const q = new URLSearchParams(search).get('ws');
  if (q != null) {
    if (q === '0' || q === 'off' || q === 'false') return { url: null, explicit: true };
    if (q === '' || q === '1' || q === 'on') return { url: def, explicit: true };
    if (/^wss?:\/\/[\w.\-[\]:]+(\/[\w\-./]*)?$/i.test(q)) return { url: q, explicit: true };
    return { url: null, explicit: true };
  }
  return { url: dev || webdriver ? null : def, explicit: false };
}

const DIG = '零一二三四五六七八九';
/** 零到九十九的中文数 */
export function cnNum(n: number): string {
  n = Math.max(0, Math.min(99, Math.round(n)));
  if (n < 10) return DIG[n];
  const t = Math.floor(n / 10), u = n % 10;
  return (t > 1 ? DIG[t] : '') + '十' + (u ? DIG[u] : '');
}

/** 离多远，说成人话：就在身边、十二步外（一步按一米四）、在草堂 */
export function farText(d: number, place: number): string {
  if (d < 2.2) return '就在身边';
  if (d < 40) return `${cnNum(Math.max(2, Math.round(d / 1.4)))}步外`;
  const p = PLACES.find((x) => x.id === PLACE_IDS[place]);
  return p ? `在${p.name}` : '在远处';
}

/** 界面上怎么称呼各人：同一个名字的，后面添衣色（「伊川散人（黛衫）」）；衣色也一样的，再添一二三 */
export function labels(list: Array<{ id: number; n: Name; c: number }>): Map<number, string> {
  const by = new Map<string, Array<{ id: number; c: number }>>();
  for (const p of list) { const k = nameOf(p.n); (by.get(k) ?? by.set(k, []).get(k)!).push(p); }
  const out = new Map<number, string>();
  for (const [name, ps] of by) {
    if (ps.length === 1) { out.set(ps[0].id, name); continue; }
    const byRobe = new Map<number, number[]>();
    for (const p of ps) (byRobe.get(p.c) ?? byRobe.set(p.c, []).get(p.c)!).push(p.id);
    for (const [c, ids] of byRobe) {
      ids.sort((a, b) => a - b);
      ids.forEach((id, i) => out.set(id, `${name}（${robeName(c)}${ids.length > 1 ? cnNum(i + 1) : ''}）`));
    }
  }
  return out;
}
