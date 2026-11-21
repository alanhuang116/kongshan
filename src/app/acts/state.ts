/**
 * 做事时界面认的 state —— 写一件事的人看这一页就够了。
 *
 * 世界里的一件事把自己的状态写进 act.state，再 k.emitAct()；界面（ActLayer、Panel 与这一层的几样小器物）只看这张表，
 * 不认具体是哪一件事。下面每一样都可以不给；给了什么就出什么，哪一样都没有时只剩左上的名字与右下的「毕」。
 * 界面上的按键点了，用 k.cmd(name, arg) 把话发回给这件事（act.cmd(name, arg)）。
 *
 * —— 名字与提示 ——
 *   title: '收麦'                      左上竖写的名字（不给就用这件事的 name）
 *   count: 3 / total: 16              名字旁的计数：「三」「十六之三」；count 也可以直接给字
 *   steps: ['割', '捆', '挑', '打', '扬'], step: 1
 *                                     几步里走到第几步（从 0 数）：名字旁竖写一行，做过的淡、眼下这一步实、带一点朱
 *   hint: '按住，一镰一镰地割'          下面当中的一句提示（夜里也看得清；长了自己折行）
 *   progress: 0.4                     进度（0…1）：提示下一道慢慢写过去的墨线；有面板时画在面板里
 *   quiet: true                       只是看着、歇着：提示出一会儿就退下去，只留名字（观物、小憩本来就这样）
 *   keys: [{ key: '空格', label: '割' }, { key: 'E', label: '捆' }]
 *                                     键盘上怎么按（只在有键盘、鼠标的设备上出，手机上不出）
 *
 * —— 一道表（meter）——
 *   meter: { v: 0.62, lo: 0.55, hi: 0.75, label: '火候' }
 *                                     一道横着的表：v 是指针（0…1），lo…hi 那一段标出来（落在段里时指针添朱）。
 *                                     每变一次就 emitAct 一次即可（界面自己把指针缓缓挪过去，一秒十几次也扛得住）。
 *
 * —— 按住的大键（hold）——
 *   hold: { id: 'cut', label: '割', v: 0.3 }
 *                                     一枚按住的大键：按下发 cmd(id, 'down')，松开发 cmd(id, 'up')（手指滑出去、
 *                                     切到别的窗口、这一枚换掉了，都会补发 'up'）。键盘上空格同。v（0…1）是按住时的进度环。
 *                                     手机上落在右下拇指够得着的地方（「毕」这时挪到右上角）。label 宜一两个字，最多四个。
 *
 * —— 钉在画里的小签（tags）——
 *   tags: [{ id: 'plot3', text: '三畦', x: 12.5, y: 0.6, z: 40.2, sub: '麦熟了', kind: 'hot', on: false }, …]
 *                                     钉在三维里某一点上的小签，跟着画面走；点了发 cmd('tag', id)。
 *                                     sub 是签下一行小字；on 为真是「选中的这一枚」（实的，带朱点）；
 *                                     kind：'hot' 该做的（朱点）、'dim' 暂时做不了（淡，点不了）、'done' 做过了（淡，带一道勾）。
 *                                     签多了互相压着时会挪开、用一根细线连回那一点；实在放不下就只留近的、选中的。
 *                                     不会压在面板、提示、按键底下。几十枚也扛得住（每帧不经 React 直接摆）。
 *
 * —— 面板里的东西（有其中一样就出一块面板）——
 *   who: '王婶'                        谁在说话（面板头上一行）
 *   said: '这一捆麦，给你。'            先生方才说的那句：who 下面淡淡一行，像引语（比正文浅一档、小一号；长了折成两行，再长在第二行末尾省略）
 *   compact: true                     面板收紧：贴底一条，提示挪进面板顶上一行，话最多两行（「全文」展开），签排成一行（观星时自动这样）
 *   text: '一段话\n可以分行'            一段话（\n 分段；长了面板里自己滚）
 *   lines: ['闭门即是深山', '读书随处净土']
 *                                     诗句：五言七言这样的短句竖写，长的横排
 *   gua: '井' / found: true           出象卡（六爻自下而上写出来）；found 说这一象是不是已在观象册里
 *   source: '邵雍《击壤集》' / gloss: '一句白话'
 *   choices: [{ id: 'yi', label: '翻《周易》' }, { id: 'done', label: '起身' }]
 *                                     几枚签。点了发 cmd(id)。可选的字段：
 *                                       main: true    这一枚是这一步的主操作（落在下凹的底座上，最显眼；一屏只该有一枚）
 *                                       sub: '要一升麦种'  签下一行小字
 *                                       off: true     暂时点不了（淡；sub 里写为什么）
 *                                     没标 main 时：只有一两枚、头一枚不是「做完了」的，头一枚当主操作。
 *                                     id 是 done / bye / keep 的是「做完了，起身」：排在最后，是一行字的链接；
 *                                     state 里只有这一枚、别无可放时，它落到右下角去当「毕」。签多了自己折成几行。
 *   items: [{ id: 'egg', n: 3 }, { id: 'tea', n: 1 }]
 *                                     从行囊里挑一样（送人、下种、喂鸡……）：名字、量词从 world/bag.ts 的 ITEMS 取，
 *                                     n 是有几个（0 就是没有，淡着点不了）；点了发 cmd('item', id)。要问一句「送什么？」写在 text 或 hint 里。
 *
 * —— 其余 ——
 *   kind: 'write' + model: ['…', '…'] + from / source + hint
 *                                     写字：出一张纸照着写（见 Copy.tsx）
 *   done: true                        右下那一枚添朱（这件事做成了）
 *   doneLabel: '放下'                  右下那一枚不叫「毕」时
 *
 * 开发时想看看这些东西：网址带 ?auto&s=yard&flow=0，在控制台里
 *   __ks.enterAct('book', true); __ks.act.state = { title: '试', hold: { id: 'h', label: '割', v: 0.4 }, meter: { v: 0.5, lo: 0.4, hi: 0.6 } }; __ks.emitAct();
 * tests/play/uikit.mjs 里的 fakeAct() 就是这么做的。
 */
import { ITEMS } from '../../world/bag';

type State = Record<string, unknown>;
export interface Choice { id: string; label: string; main?: boolean; sub?: string; off?: boolean }
export interface Meter { v: number; lo: number | null; hi: number | null; label: string | null }
export interface Hold { id: string; label: string; v: number | null }
export interface Tag { id: string; text: string; x: number; y: number; z: number; sub: string | null; kind: string | null; on: boolean }
export interface ItemPick { id: string; n: number; name: string; unit: string; note: string | null }
export interface KeyHint { key: string; label: string }

export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const unit01 = (v: unknown): number | null => { const n = num(v); return n == null ? null : Math.max(0, Math.min(1, n)); };

export const choicesOf = (v: unknown): Choice[] => (Array.isArray(v) ? v.flatMap((c) => {
  const o = obj(c);
  if (!o || typeof o.id !== 'string' || typeof o.label !== 'string') return [];
  return [{ id: o.id, label: o.label, main: o.main === true || undefined, sub: str(o.sub) ?? undefined, off: o.off === true || undefined }];
}) : []);
/** 这几个 id 是「做完了，起身」的意思（别的是这件事里头的下一步） */
export const EXITS = new Set(['done', 'bye', 'keep']);
export const exitOf = (cs: Choice[]): Choice | null => cs.find((c) => EXITS.has(c.id)) ?? null;

export function meterOf(v: unknown): Meter | null {
  const o = obj(v), x = o ? unit01(o.v) : null;
  if (!o || x == null) return null;
  let lo = unit01(o.lo), hi = unit01(o.hi);
  if (lo != null && hi != null && hi < lo) [lo, hi] = [hi, lo];
  return { v: x, lo, hi, label: str(o.label) };
}
export function holdOf(v: unknown): Hold | null {
  const o = obj(v);
  if (!o || typeof o.id !== 'string' || !o.id) return null;
  return { id: o.id, label: str(o.label) ?? '按住', v: unit01(o.v) };
}
export function tagsOf(v: unknown): Tag[] {
  if (!Array.isArray(v)) return [];
  const out: Tag[] = [], seen = new Set<string>();
  for (const t of v) {
    const o = obj(t);
    if (!o || typeof o.id !== 'string' || seen.has(o.id)) continue;
    const x = num(o.x), y = num(o.y), z = num(o.z), text = str(o.text);
    if (x == null || y == null || z == null || !text) continue;
    seen.add(o.id);
    out.push({ id: o.id, text, x, y, z, sub: str(o.sub), kind: str(o.kind), on: o.on === true });
  }
  return out;
}
export function itemsOf(v: unknown): ItemPick[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((it) => {
    const o = obj(it);
    if (!o || typeof o.id !== 'string') return [];
    const d = ITEMS[o.id], n = Math.max(0, Math.floor(num(o.n) ?? 0));
    return [{ id: o.id, n, name: d?.name ?? o.id, unit: d?.unit ?? '', note: d?.note ?? null }];
  });
}
export const keysOf = (v: unknown): KeyHint[] => (Array.isArray(v) ? v.flatMap((k) => { const o = obj(k); return o && str(o.key) && str(o.label) ? [{ key: String(o.key), label: String(o.label) }] : []; }) : []);
export const stepsOf = (st: State): { list: string[]; at: number } | null => {
  const list = strList(st.steps);
  if (!list.length) return null;
  const at = Math.max(0, Math.min(list.length, Math.floor(num(st.step) ?? 0)));
  return { list, at };
};
