/**
 * 修为：在园里读书、听讲、答问、静坐、观象，一点一点攒起来的那一点工夫。玩法（射箭、蹴鞠……）不算。
 *
 * 几重的名字取《礼记·大学》那一句（原文在 data/verses.ts 的 v73，逐字核对过）：
 *   「知止而后有定，定而后能静，静而后能安，安而后能虑，虑而后能得。」
 *   知止 → 定 → 静 → 安 → 虑 → 得，六重。名字与各重引的那半句都从那一条里取，不另写。
 * 打坐时眼前的天象跟着修为走（study/vision.ts）：知止一时、定一夜、静一月、安一岁、虑与得入定。
 *
 * 怎么长（一日的上限按本机的日子算——时辰停着、同游随园中，都一样）：
 *   听讲：入座听完一讲 6，站着听完 4；头一回听到的卦再 2（一日至多八讲算数）
 *   答问：答对一题 2，答得快再 1
 *   打坐：静坐一分钟 1（一回至多 5，一日至多 15）；头一回到某一境 3
 *   观象：新得一象 3
 *   读书、抚琴：一回（二十秒以上）1，各一日至多三回
 * 存在世界的存档里（mem 'xiu'）；名片上的修为（play/board.ts 的 setStanding）跟着变。
 */
import type { Anlewo } from '../Anlewo';
import { GUA } from '../../data/yi';
import { cn } from '../../util/cn';
import { registerBoard, setStanding } from './board';
import { TIERS } from './study/vision';
import { levelOf } from './study/levels';

// —— 几重（study/levels.ts：名字与引的半句都从 verses.ts 的《大学》那一条里取） ——
export { DAXUE_FROM, DAXUE_GLOSS, DAXUE_LINES, LEVELS, LEVEL_AT, levelOf, type Level } from './study/levels';

// —— 从哪里来 ——
export type XiuSrc = 'lecture' | 'quiz' | 'sit' | 'xiang' | 'book' | 'qin' | 'tier' | 'new';
/** 怎么长（册页上列的；都是本应用的话） */
export const XIU_WAYS: Array<{ name: string; how: string }> = [
  { name: '听讲', how: '村塾里邵先生讲卦：入座听完一讲长六分，站着听完长四分；头一回听到的卦再长两分（一日至多八讲算数）' },
  { name: '答问', how: '讲完先生问三句：答对一题长两分，答得快再长一分' },
  { name: '打坐', how: '溪边柳下的平石上静坐：静一分钟长一分（一回至多五分，一日至多十五分）；头一回到某一境再长三分' },
  { name: '观象', how: '园里新观到一象，长三分' },
  { name: '读书、抚琴', how: '草堂里读书、抚琴，一回长一分（各一日至多三回）' },
];
/** 一日的上限（分；lecture 是讲数） */
const CAP: Partial<Record<XiuSrc, number>> = { sit: 15, book: 3, qin: 3, lecture: 8 };

interface Mem {
  pts: number;
  /** 最近几笔：[从哪来, 几分, 本机的日子] */
  log: Array<[XiuSrc, number, string]>;
  /** 今日各样攒了多少（按本机的日子；换了一天就清） */
  day: string; used: Partial<Record<XiuSrc, number>>;
  /** 听过的卦（通行本序号）、上回讲到哪一卦 */
  heard: number[]; last: number;
  /** 记过修为的象（卦名）：册子里早有的，头一回开这一页时一并算上 */
  xiang: string[];
  /** 打坐到过的几境（TIERS 的序号） */
  tiers: number[];
}
const NS = 'xiu';
const today = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; };
export function readXiu(k: Anlewo): Mem {
  const m = k.mem.get<Partial<Mem>>(NS, {});
  const day = today();
  return {
    pts: typeof m.pts === 'number' && Number.isFinite(m.pts) ? Math.max(0, m.pts) : 0,
    log: Array.isArray(m.log) ? m.log.slice(-30) : [],
    day, used: m.day === day && m.used && typeof m.used === 'object' ? { ...m.used } : {},
    heard: Array.isArray(m.heard) ? m.heard.filter((x) => Number.isInteger(x) && x >= 0 && x < 64) : [],
    last: typeof m.last === 'number' ? m.last : -1,
    xiang: Array.isArray(m.xiang) ? m.xiang.filter((x) => typeof x === 'string') : [],
    tiers: Array.isArray(m.tiers) ? m.tiers.filter((x) => Number.isInteger(x)) : [],
  };
}
const subs = new Set<() => void>();
/** 修为变了（册页据此重画）。返回取消的函数 */
export function onXiu(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; }
function save(k: Anlewo, m: Mem) { k.mem.set(NS, m); setStanding(k, 'xiu', m.pts); for (const f of subs) f(); }

/**
 * 记一笔修为。src 是从哪来；n 是几分。一日有上限的，过了上限就只记到上限为止（lecture 按讲数算，n 照给）。
 * 返回真正长了几分。到了新的一重，画面下方说一声。
 */
export function addXiu(k: Anlewo, src: XiuSrc, n: number): number {
  if (!(n > 0)) return 0;
  const m = readXiu(k), cap = CAP[src];
  let add = Math.round(n);
  if (cap != null) {
    const used = m.used[src] ?? 0;
    if (src === 'lecture') { if (used >= cap) return 0; m.used[src] = used + 1; }
    else { add = Math.max(0, Math.min(add, cap - used)); if (!add) return 0; m.used[src] = used + add; }
  }
  const before = levelOf(m.pts).level;
  m.pts += add;
  m.log.push([src, add, m.day]);
  if (m.log.length > 30) m.log.splice(0, m.log.length - 30);
  save(k, m);
  const after = levelOf(m.pts).level;
  if (after.i > before.i) k.note(`修为到了「${after.name}」——${after.cite}`, 'xiu');
  return add;
}
/** 此刻的修为：分数、在第几重 */
export function xiuOf(k: Anlewo) { const m = readXiu(k); return { pts: m.pts, ...levelOf(m.pts), mem: m }; }
/** 听了一讲：记下这一卦（头一回听的返回 true） */
export function noteHeard(k: Anlewo, gua: number): boolean {
  const m = readXiu(k), isNew = !m.heard.includes(gua);
  if (isNew) m.heard.push(gua);
  m.last = gua;
  save(k, m);
  return isNew;
}
/** 打坐到了第 i 境（头一回的返回 true） */
export function noteTier(k: Anlewo, i: number): boolean {
  const m = readXiu(k);
  if (m.tiers.includes(i)) return false;
  m.tiers.push(i);
  save(k, m);
  return true;
}

// —— 榜：修为 ——
registerBoard({
  key: 'xiu', name: '修为', order: 0,
  fmt: (v) => `${levelOf(v).level.name} · ${cn(v)}`,
  // 村里人：邵先生的读书朋友、行脚僧、塾师、药农、村塾里最用功的那个孩子
  folk: [['郑先生', 520], ['了然', 410], ['赵先生', 300], ['孟老', 140], ['三郎', 40]],
  note: '读书、听讲、答问、静坐、观象攒起来的；玩法不算',
});

// —— 每帧看一眼：读书、抚琴做了多久；观象册里有没有新的象 ——
let started: Anlewo | null = null;
/** 世界建好时调一回（几件学的事里谁先建好谁调；重复调不要紧） */
export function startXiu(k: Anlewo) {
  if (started === k) return;
  started = k;
  quietUntil = performance.now() + 5000;
  // 名片上的修为对上存档（榜那一份被清过、或这一套刚装上时）
  { const pts = readXiu(k).pts; if (pts > 0) setStanding(k, 'xiu', pts); }
  let cur: string | null = null, curT = 0, seenT = 0;
  k.world.tick.push((dt) => {
    try {
      const id = k.act?.id ?? null;
      if (id !== cur) {
        // 读书、抚琴做完了（做了二十秒以上）：长一分
        if ((cur === 'book' || cur === 'qin') && curT >= 20) addXiu(k, cur, 1);
        cur = id; curT = 0;
      } else if (id) curT += dt;
      // 观象：册子里的象（界面放进 k.found 的，连同异写）一秒对一回
      if ((seenT += dt) > 1) { seenT = 0; creditXiang(k); }
    } catch (e) { console.warn('修为出错', e); }
  });
}
/** 开场后这一会儿里记上的象是存档里早有的（界面刚把册子放进 k.found）：只记分，不浮话 */
let quietUntil = 0;
/** 观象册里新得的象各记三分（存档里早有的头一回也算上） */
export function creditXiang(k: Anlewo) {
  if (!k.found.size) return;
  const m = readXiu(k), had = new Set(m.xiang), fresh: string[] = [];
  for (const name of k.found) if (GUA_NAMES.has(name) && !had.has(name)) fresh.push(name);
  if (!fresh.length) return;
  m.xiang.push(...fresh);
  k.mem.set(NS, m);
  addXiu(k, 'xiang', fresh.length * 3);
  if (fresh.length === 1 && performance.now() > quietUntil) k.note('观得一象，修为长了三分', 'xiu');
}
const GUA_NAMES = new Set(GUA.map((g) => g.name));
/** 打坐几境的名字（册页用） */
export const TIER_NAMES = TIERS.map((t) => t.name);
