/**
 * 与村里人说话。
 *
 * 走到跟前作个揖，对方停下手里的活、转过身来（attend）。他先招呼一声——看时辰、天气，看跟你熟到几分；
 * 然后有三四样可说：问他在忙什么、问农事问手艺、闲话家常、他托你的事、送他样东西、告辞。
 * 签上的字是你说的那一句，他接一句；有时他也回问你一句，你再答。
 * 你是外乡来的客人（k.persona.sex：男客、女客）：他怎么叫你，看情分、看男女（favor.ts 的 callOf：名册的 call、talk2.ts 的 calls）；
 * 话里的 {你} 换成这个叫法，{他|她} 这样的一对按男女取一半（favor.ts 的 fill）。
 * 熟了以后不一样：招呼的话、叫法变了，话多了，会主动说家里的事，见面塞东西给你，远远看见会招手（人情账在 favor.ts）。
 *
 * 东西是真的过手的（gift.ts）：送人时你从袖里取出来、走近一步递过去，他伸手接住的那一刻才算交出（行囊里少了、他记下了），
 * 他那句话也在那一刻出来；递的那一会儿面板上还是方才那句问话，签先收着。他给你的（回赠、见面塞的、讨来的、回礼）也一样递过来，
 * 「得……」在你接住的那一刻浮出来。送人时一回送多少、哪些不送人（水、铜钱、没打的麦捆）在 src/data/itemUses.ts。
 *
 * 话在 src/data/talk2.ts（各人自己的话）、talk.ts（原先的家常话 LINES、渔樵问对）、almanac.ts（节气农事）；托事在 favors.ts。
 * 这里不问吉凶——有人问年景，你只说「春种秋收，便是大吉」。
 */
import * as THREE from 'three';
import type { Anlewo, NpcLike } from '../Anlewo';
import type { Season } from '../env/atmos';
import { ITEMS, giftN, giftOf, qtyCn } from '../bag';
import { blocked, groundAt, setDynamic, standable } from '../walk';
import { Person as Folk } from '../life/person';
import type { Act } from './types';
import { reveal } from './xiang';
import { POEMS } from './lib';
import { Exchange } from './gift';
import { callOf, fill, folkOf, people, person, stepAt, wetNow, type Person, type Turn } from './favor';
import { BOOKS, type Book, type L, type O } from '../../data/talk2';
import { LINES, YUQIAO, YUQIAO_SCENE } from '../../data/talk';
import { TERMS } from '../../data/almanac';

/** 每一季里取哪几个节气的话（农夫说的是「这个时节」） */
const SEASON_TERMS: Record<Season, string[]> = { spring: ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨'], summer: ['立夏', '小满', '芒种', '夏至', '小暑', '大暑'], autumn: ['立秋', '处暑', '白露', '秋分', '寒露', '霜降'], winter: ['立冬', '小雪', '大雪', '冬至', '小寒', '大寒'] };
type Npc = NpcLike & { act?: string | null; doing?: string };
interface Choice { id: string; label: string; main?: boolean; sub?: string }

/** 此刻的时令、时辰、天气（话的 when 里用的那些字） */
function tagsOf(k: Anlewo): Set<string> {
  const a = k.atmos, h = a.hour, s = new Set<string>([k.season, 'any']);
  if (a.night > 0.5) s.add('night');
  else { s.add('day'); s.add(a.dawn > 0.35 || h < 7 ? 'dawn' : a.dusk > 0.35 || h >= 17.5 ? 'dusk' : h >= 11 && h < 13.5 ? 'noon' : h < 11 ? 'am' : 'pm'); }
  if (a.w.rain > 0.5) s.add('rain'); else if (a.w.snow > 0.5) s.add('snow'); else s.add('fair');
  if (a.w.mist > 0.5) s.add('mist');
  if (k.term && SEASON_TERMS[k.season].includes(k.term)) s.add(k.term);
  return s;
}

/** 一句话合不合此刻：时令时辰、情分、说到的家里人、话里提到的人都在、他此刻做的事 */
interface Ctx { tags: Set<string>; lv: number; family: string[]; act: string | null }
const textOf = (l: L) => (typeof l === 'string' ? l : l[0]);
const optOf = (l: L): O => (typeof l === 'string' ? {} : l[1]);
const refsOf = (t: string) => [...t.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]);
function fitsNow(l: L, c: Ctx): boolean {
  const o = optOf(l);
  if (o.when?.length && !o.when.some((w) => c.tags.has(w))) return false;
  if ((o.bond ?? 0) > c.lv) return false;
  if (o.fam?.some((f) => !c.family.includes(f))) return false;
  if (o.act?.length && (!c.act || !o.act.includes(c.act))) return false;
  if (o.about?.some((id) => !person(id))) return false;
  return refsOf(textOf(l)).every((id) => !!person(id));
}
/** 从一组话里挑一句：合此刻的、这一阵没说过的；时令时辰对得上的、正合这一档情分的更可能被挑中 */
function pick(list: L[] | undefined, c: Ctx, used: Set<string>): L | null {
  const ok = (list ?? []).filter((l) => fitsNow(l, c));
  if (!ok.length) return null;
  const fresh = ok.filter((l) => !used.has(textOf(l))), pool = fresh.length ? fresh : ok;
  const w = pool.map((l) => { const o = optOf(l); return 1 + (o.when?.length ? 2 : 0) + ((o.bond ?? 0) === c.lv && c.lv > 1 ? 1.5 : 0); });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** 没给他写话时垫着的几句（按男女老少；{你} 是他此刻怎么叫你） */
function spare(P: Person, what: 'greet' | 'bye' | 'like' | 'ok' | 'no' | 'idle' | 'busy'): L[] {
  const kid = (P.age ?? 30) < 14, old = (P.age ?? 30) >= 60;
  switch (what) {
    case 'greet': return kid ? ['{你}！', '{你}来啦。'] : old ? ['{你}来了，坐。', '{你}好兴致。'] : ['{你}。', '{你}来了。'];
    case 'bye': return kid ? ['{你}再来！', '{你}慢走！'] : ['{你}慢走。', '{你}得空再来。'];
    case 'like': return kid ? ['给我的？{你}真好！'] : ['这怎么好意思……正是我想要的。', '{你}怎知道我好这一口？'];
    case 'ok': return kid ? ['谢谢{你}！'] : ['{你}客气了，那我收下。', '多谢{你}惦记。'];
    case 'no': return kid ? ['我娘不让我收这个。'] : ['这个我用不上，{你}留着自己用。'];
    case 'idle': return old ? ['人老了，话就多。{你}别嫌。'] : kid ? ['{你}，你看那边！'] : ['这几日天气还好。'];
    case 'busy': return ['手上一点活，不碍事。'];
  }
}

/**
 * 说话时镜头放哪：两个人的侧面（左右两边、远近两档）、斜后方、从你肩后看过去——挑一处看得见两个人的
 * （中间没有树干、墙、桌凳挡着，镜头也不钻进坡里、屋里）。同样看得清时取侧面。
 */
function talkShot(k: Anlewo, npc: Npc) {
  const p = k.player.pos, q = npc.pos, dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, nx = -uz, nz = ux;
  const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, y = p.y;
  // 竖着的手机画面窄：张角放大些、侧面的机位往后退，两个人都进画（横屏不变）
  const aspect = (k.world.camera as THREE.PerspectiveCamera).aspect || 1.6, fov = aspect < 1.1 ? 48 : 38;
  const half = Math.atan(Math.tan(((fov * Math.PI) / 180) / 2) * aspect), s = Math.max(1, (l / 2 + 0.55) / Math.tan(half) / 4.4);
  // [x, z, 高, 看哪里：0 两人当中，1 偏向他]
  const C: Array<[number, number, number, number]> = [
    [mx + nx * 4.4 * s, mz + nz * 4.4 * s, 1.9, 0], [mx - nx * 4.4 * s, mz - nz * 4.4 * s, 1.9, 0],
    [mx + (nx * 3.6 - ux * 1.8) * s, mz + (nz * 3.6 - uz * 1.8) * s, 1.85, 0.3], [mx - (nx * 3.6 + ux * 1.8) * s, mz - (nz * 3.6 + uz * 1.8) * s, 1.85, 0.3],
    [mx + nx * 2.9 * s, mz + nz * 2.9 * s, 1.7, 0], [mx - nx * 2.9 * s, mz - nz * 2.9 * s, 1.7, 0],
    // 从你肩后看过去：往旁边让开一米半，递东西时两人之间的手不叫你的背挡住
    [p.x - ux * 2.4 + nx * 1.5, p.z - uz * 2.4 + nz * 1.5, 1.75, 0.6], [p.x - ux * 2.4 - nx * 1.5, p.z - uz * 2.4 - nz * 1.5, 1.75, 0.6],
  ];
  let best = C[0], bs = Infinity;
  // 他朝着哪（坐着干活的不转身）：镜头别在他背后，递东西时他的手、他的脸才看得见
  const fy = npc.root?.rotation.y ?? 0, fx = Math.sin(fy), fz = Math.cos(fy);
  setDynamic([]);                                                   // 只看不动的东西：人自己不算挡
  try {
    C.forEach((c, i) => {
      let s = i * 0.05;
      const cx = c[0] - q.x, cz = c[1] - q.z, cl = Math.hypot(cx, cz) || 1;
      s += 2.5 * Math.max(0, -(cx * fx + cz * fz) / cl);
      // 你的身子挡在镜头与他之间（从你正背后看过去）：他的脸、两人之间的手都看不见
      { const ax = q.x - c[0], az = q.z - c[1], al = ax * ax + az * az || 1, t = Math.max(0, Math.min(1, ((p.x - c[0]) * ax + (p.z - c[1]) * az) / al)), od = Math.hypot(c[0] + ax * t - p.x, c[1] + az * t - p.z); if (t > 0.05 && t < 0.97 && od < 0.5) s += (0.5 - od) * 14; }
      if (blocked(c[0], c[1], 'ground', 0.3)) s += 40;
      const g = groundAt(c[0], c[1]);
      if (g != null && g > y + c[2] - 0.7) s += 25;
      for (const [tx, tz, w] of [[q.x, q.z, 3], [p.x, p.z, 1]] as Array<[number, number, number]>) {
        for (let j = 1; j <= 9; j++) { const t = (j / 10) * 0.86, x = c[0] + (tx - c[0]) * t, z = c[1] + (tz - c[1]) * t; if (blocked(x, z, 'ground', 0.05)) s += w; }
      }
      if (s < bs) { bs = s; best = c; }
    });
  } finally { setDynamic(k.life?.blockers ?? []); }
  const lx = mx + (q.x - mx) * best[3], lz = mz + (q.z - mz) * best[3];
  return { pos: new THREE.Vector3(best[0], y + best[2], best[1]), look: new THREE.Vector3(lx, y + 1.15, lz), fov, yaw: 30, up: 12, down: 8 };
}

/** 你递东西时说的那句：「这四个鸡蛋，给你。」「这一升麦粒，给你。」（data/itemUses.ts 里给了的照它说） */
function giftSaid(item: string, n: number): string {
  const g = giftOf(item), d = ITEMS[item];
  if (g?.say && n === g.n) return g.say;
  if (!d) return '这个给你。';
  const cnt = n > 1 ? qtyCn(n) : /^[升捧把捆包]$/.test(d.unit) ? '一' : '';
  return `这${cnt}${d.unit}${d.name}，给你。`;
}

/** 这一句之后，你怎么告辞（签上的字） */
function byeLabel(P: Person, tags: Set<string>, lv: number): string {
  if ((P.age ?? 30) < 14) return tags.has('night') ? '快回家吧' : '去玩吧';
  if (tags.has('night')) return '早些歇着';
  return lv >= 3 ? '改日再来' : '你忙，我走了';
}

function make(k: Anlewo, P: Person, npc: Npc, B: Book): Act {
  const F = folkOf(k), id = P.id, tmp = new THREE.Vector3();
  const kindLines = P.kind ? LINES.filter((l) => l.who === P.kind) : [];
  const used = new Set<string>();
  let asked = new Set<string>(), backQ: [string, string] | null = null, yesno: Turn['yesno'] | null = null, gifting = false;
  let ai = 0, sub = 0, chatN = 0, turns = 0, yq = Math.floor(Math.random() * Math.max(1, YUQIAO.length)), frame = Math.floor(Math.random() * 8);
  /** 东西过手（这一场说话里）：他是村人那一路的人才有；没有就照旧一下子交了 */
  const folk = Folk.of(npc.root);
  let ex: Exchange | null = null;
  const ctx = (): Ctx => ({ tags: tagsOf(k), lv: F.level(id), family: P.family, act: actNow() });
  const actNow = (): string | null => (typeof npc.act === 'string' ? npc.act : stepAt(P, k.atmos.hour, k.season, wetNow(k))?.act ?? null);
  /** 你是男客还是女客（选人那一页定的；没定就当男客） */
  const sex = (): 'm' | 'f' => (k.persona?.sex === 'f' ? 'f' : 'm');
  /** 他此刻怎么叫你（看情分、看男女） */
  const you = () => callOf(id, F.level(id), sex());
  /** 一句话里的 {某人}、{你}、{他|她} 换掉 */
  const fl = (t: string) => fill(t, you(), sex());
  /** 挑一句、记下说过、把 {某人}、{你} 换掉；带着回问的，记下等你答 */
  const say = (list: L[] | undefined, fb?: L[]): string | null => {
    const l = pick(list, ctx(), used) ?? (fb ? pick(fb, ctx(), used) : null);
    if (!l) return null;
    used.add(textOf(l));
    const o = optOf(l);
    if (o.back) backQ = o.back;
    return fl(textOf(l));
  };
  /** 签：你此刻可说的三四样 */
  const menu = (): Choice[] => {
    const cs: Choice[] = [], tags = tagsOf(k), lv = F.level(id);
    if (backQ) cs.push({ id: 'back', label: fl(backQ[0]), main: true });
    for (const c of F.favorChoices(id, asked)) if (cs.length < 3) cs.push(c);
    if (cs.length < 3 && !asked.has('offer')) { const o = F.offer(id); if (o) cs.push({ id: `fv:${o.id}:ask`, label: lv >= 3 ? '什么事？' : '可要帮手？' }); }
    const giftable = !asked.has('gift') && k.bag.list().some((x) => giftN(x.def.id, x.n) > 0);
    const room = 3 - (giftable ? 1 : 0);
    const topics: Choice[] = [];
    if (!asked.has('busy')) topics.push({ id: 'busy', label: busyLabel() });
    const q = B.ask?.[ai];
    if (q && sub < 3) topics.push({ id: 'ask', label: sub > 0 ? (q.more ?? '还有呢？') : fl(q.q) });
    if (!asked.has('home') && B.home.some((l) => fitsNow(l, ctx()))) topics.push({ id: 'home', label: B.homeQ ?? '家里都好？' });
    if (kindLines.length || B.idle?.length) topics.push({ id: 'chat', label: chatN ? '再说说' : '说会儿闲话' });
    for (const t of topics) if (cs.length < room) cs.push(t);
    if (giftable && cs.length < 3) cs.push({ id: 'gift', label: '带了样东西给你' });
    cs.push({ id: 'bye', label: byeLabel(P, tags, lv) });
    return cs;
  };
  const busyLabel = () => {
    const a = actNow();
    if (a && B.busyQ?.[a]) return B.busyQ[a];
    if (a && /noon|lunch|shade|rest|sheepRest|teaShed|idle/.test(a)) return '歇着呢？';
    if (a === 'listen') return '今晚说的哪一段？';
    return (P.age ?? 30) < 14 ? '做什么呢？' : '忙什么呢？';
  };
  /** 把这一轮的话交给界面 */
  const show = (said: string | null, text: string, extra: Record<string, unknown> = {}) => {
    turns++;
    act.state = { kind: 'talk', title: P.name, who: `${P.tag} · ${F.bondName(id)}`, said, text, choices: yesno ? [{ id: `fv:${yesno.fid}:yes`, label: yesno.yes, main: true }, { id: `fv:${yesno.fid}:no`, label: yesno.no }] : menu(), ...extra };
    k.emitAct();
  };
  /** 东西正递着：话不变（方才那句还在），签与行囊先收着 */
  const hush = () => { act.state = { ...act.state, items: undefined, choices: [] }; k.emitAct(); };
  /** 他接着说一句（递东西时；你已经说起别的了就不接） */
  const append = (line: string, seq: number) => {
    if (!line || seq !== turns || k.act !== act) return;
    act.state = { ...act.state, text: [String(act.state.text ?? ''), line].filter(Boolean).join('\n') };
    k.emitAct();
  };
  /**
   * 他这一阵给你的东西（回赠、见面塞的、讨来的、托事的回礼）：一样样递过来，接住了才浮「得……」。
   * line：他递头一样时接着说的那句；wait：先等几秒（见面就塞的，等他转过身来）
   */
  const takeGot = (line: string | null = null, wait = 0) => {
    const list = F.drainGot(), seq = turns;
    if (!ex) { for (const g of list) k.bag.announce(g.item, g.n); if (line) append(line, seq); return; }
    if (!list.length) { if (line) append(line, seq); return; }
    if (wait > 0) ex.pause(wait);
    list.forEach((g, i) => ex!.take(g.item, g.n, { onStart: i === 0 && line ? () => append(line, seq) : undefined, onTake: () => k.bag.announce(g.item, g.n) }));
  };

  // —— 头一句：招呼 ——
  const greet = () => {
    const met = F.meet(id), lv = F.level(id), parts: string[] = [];
    let g = met.again ? say(B.again, ['又见着{你}了。']) : met.gap >= 3 && B.long ? say(B.long) : null;
    if (!g) g = say(B.greet, spare(P, 'greet'));
    if (g) parts.push(g);
    // 熟了：主动说说家里的事；见面塞一样东西
    if (lv >= 3 && !met.again && Math.random() < 0.45) { const h = say(B.home); if (h) { parts.push(h); asked.add('home'); } }
    if (!met.again) {
      const gift = F.treat(id);
      if (gift) parts.push(fl((say(B.treat, ['{你}拿着这个。']) ?? '').replace(/\{物\}/g, ITEMS[gift]?.name ?? '')));
    }
    // 相得以后，有求于你的会自己开口
    if (lv >= 3 && F.offer(id)) parts.push(fl(B.favorHint ?? '{你}，正好有件事想求你。'));
    show(null, parts.join('\n'));
    // 见面塞的那一样：等他转过身来，取出来递给你
    takeGot(null, 0.9);
  };

  // —— 各样话 ——
  const busy = () => {
    asked.add('busy');
    const a = actNow(), s = stepAt(P, k.atmos.hour, k.season, wetNow(k));
    // 他自己的话；日程之外临时做的事（货郎来了跑去看……）没写话的，就照村人那一路给的 doing 说
    let t = a && B.busy[a] ? say(B.busy[a]) : null;
    if (!t && a) { const d = typeof npc.doing === 'string' && npc.doing ? npc.doing : s?.doing; if (d) t = `${d.replace(/[。，]$/, '')}呢。`; }
    if (!t) t = say(B.busy['*']) ?? say(spare(P, 'busy'));
    show(busyLabel(), t ?? '……');
  };
  const ask = () => {
    const q = B.ask?.[ai];
    if (!q) return;
    const label = sub > 0 ? (q.more ?? '还有呢？') : fl(q.q);
    let text = '', extra: Record<string, unknown> = {};
    if (q.special === 'almanac') {
      // 农事：这个节气田里做什么；再问是古书里的一句、三候
      const names = SEASON_TERMS[k.season], want = k.term && names.includes(k.term) ? k.term : names[((k.day % names.length) + names.length) % names.length];
      const t = TERMS.find((x) => x.name === want);
      if (!t) { ai++; sub = 0; return ask(); }
      if (sub === 0) text = `${t.name}。${t.work.join('')}`;
      else if (sub === 1 && t.quote) { text = `老辈人传下来一句：${t.quote.text}`; extra = { source: t.quote.source }; }
      else { text = `${t.name}三候：${t.hou.join('；')}。这是看天看物看出来的，错不了几天。`; sub = 2; }
      sub++;
      if (sub >= 3) { ai++; sub = 0; }
    } else if (q.special === 'yuqiao' && YUQIAO.length) {
      // 渔樵：樵者问，渔者答（原文）。两个人都在跟前时，头一回先说一说那一幕
      const y = YUQIAO[yq++ % YUQIAO.length], both = !!k.life?.npcs.fisher?.present && !!k.life?.npcs.woodcutter?.present;
      text = `${sub === 0 && both ? `${YUQIAO_SCENE.open}\n` : ''}樵者问：${y.q}\n渔者答：${y.a}`;
      extra = { source: y.source };
      sub++;
      if (sub >= 3) { ai++; sub = 0; }
    } else if (q.special === 'verse') {
      // 童子背书：《山村咏怀》（数数的歌）
      const p = POEMS.find((x) => x.id === 'shancun');
      text = say(q.a) ?? '我背给你听。';
      if (p) extra = { lines: p.lines, source: `${p.author}《${p.title}》` };
      ai++; sub = 0;
    } else {
      text = say(q.a) ?? '……';
      // 还有没说过的，就留着「还有呢？」；说完了换下一个问题
      if (q.more && sub < 2 && q.a.some((l) => fitsNow(l, ctx()) && !used.has(textOf(l)))) sub++; else { ai++; sub = 0; }
    }
    show(label, text, extra);
  };
  const home = () => {
    asked.add('home');
    show(B.homeQ ?? '家里都好？', say(B.home) ?? '都好，都好。');
  };
  const chat = () => {
    chatN++;
    // 原先的家常话（客的话带着你接的那一句）与各人自己的闲话
    const pool: L[] = [...kindLines.map((l) => [l.reply ? `${l.text}\n——${l.reply}` : l.text, { when: l.when }] as L), ...(B.idle ?? [])];
    show(chatN > 1 ? '再说说' : '说会儿闲话', say(pool, spare(P, 'idle')) ?? '……');
  };
  /** 挑一样送他：只列送得出去的（水、铜钱、没打的麦捆不列），签上是这一回送多少（「鸡蛋 四个」「麦粒 一升」） */
  const gift = () => {
    gifting = true;
    const items = k.bag.list().map((x) => ({ id: x.def.id, n: giftN(x.def.id, x.n) })).filter((x) => x.n > 0);
    const ask = B.giftAsk ?? ((P.age ?? 30) < 14 ? '给我的？是什么？' : '{你}太客气了。是什么？');
    act.state = { kind: 'talk', title: P.name, who: `${P.tag} · ${F.bondName(id)}`, said: '带了样东西给你', text: fl(ask), items, choices: [{ id: 'menu', label: '先不了' }] };
    k.emitAct();
  };
  /** 送出去：你取出来递过去；他接住（或推辞）的那一刻才真的交出、话才出来 */
  const give = (item: string) => {
    if (!gifting) return;
    const n = giftN(item, k.bag.count(item));
    if (n <= 0) return;
    gifting = false; asked.add('gift');
    const plan = F.plan(id, item, n), said = giftSaid(item, plan.n);
    const run = () => {
      const d = ITEMS[item], r = F.give(id, item, n), parts: string[] = [];
      if (r.kind === 'favor' && r.turn) { show(said, r.turn.text, r.turn.lines?.length ? { lines: r.turn.lines, source: r.turn.source } : {}); takeGot(); return; }
      if (r.kind === 'no') parts.push(say(B.no, spare(P, 'no')) ?? '');
      else {
        const kind = r.kind === 'like' ? 'like' : 'ok';
        parts.push(say(B.got?.[item]) ?? say(kind === 'like' ? B.like : B.ok, spare(P, kind)) ?? '');
        if (r.learned) k.note(`${P.name}喜欢${d?.name ?? item}`, 'folk');
      }
      const extra = item === 'poem' && r.kind !== 'no' && F.poem ? { lines: F.poem.lines, source: F.poem.source } : {};
      show(said, parts.filter(Boolean).join('\n'), extra);
      // 回赠：他放好了你的东西，再取一样递过来，递的时候接一句
      takeGot(r.back ? fl((say(B.back, ['{你}拿着这个，别嫌弃。']) ?? '').replace(/\{物\}/g, ITEMS[r.back.item]?.name ?? '')) : null);
    };
    if (!ex) { run(); return; }
    hush();
    ex.give(item, plan.n, { refuse: plan.kind === 'no', onTake: run });
  };
  /** 托事的一枚签。交东西的那一枚：东西真递过去，他接住了才算交到 */
  const favor = (c: string) => {
    const h = ex && c.endsWith(':hand') ? F.handInfo(c, id) : null;
    if (h && ex) { hush(); ex.give(h.item, h.n, { onTake: () => runFavor(c) }); return; }
    runFavor(c);
  };
  const runFavor = (c: string) => {
    const t = F.run(c, id);
    // 签是旧的（事已经变了）：话不变，签重新排一遍
    if (!t) { yesno = null; show(typeof act.state.said === 'string' ? act.state.said : null, String(act.state.text ?? '')); return; }
    if (c.endsWith(':ask')) asked.add('offer');
    if (c.endsWith(':where')) asked.add(c);
    yesno = t.yesno ?? null;
    show(t.said, t.text, t.lines?.length ? { lines: t.lines, source: t.source } : {});
    // 讨来的、办成了回的礼：他递过来
    takeGot();
  };
  const bye = () => {
    // 朋友讲习：与客说过话，显出「丽泽，兑」
    if (id === 'guest' && turns >= 2 && !k.found.has('兑') && act.state.kind !== 'xiang') { const r = reveal(k, '兑'); act.state = { kind: 'xiang', title: '对坐', gua: r.gua, found: r.found, choices: [{ id: 'bye', label: '毕' }] }; k.emitAct(); return; }
    const line = say(B.bye, spare(P, 'bye'));
    k.log({ kind: 'talk', text: P.name });
    k.exitAct();
    if (line) k.note(`${P.name}：${line}`, 'talk');
  };

  const act: Act & { on(): boolean } = {
    id: `talk:${id}`, name: P.name,
    anchor: new THREE.Vector3(), spot: { x: npc.pos.x, z: npc.pos.z + 1.3, yaw: Math.PI },
    radius: 3.2, state: {},
    on: () => npc.present,
    enter() {
      asked = new Set(); backQ = null; yesno = null; gifting = false; ai = 0; sub = 0; chatN = 0; turns = 0;
      npc.attend(k.player.pos);
      const p = k.player, av = p.av;
      av.setHands('sleeve'); av.bow = 0.32; av.lookAt(tmp.copy(npc.pos).setY(npc.pos.y + 1.3));
      window.setTimeout(() => { if (k.act === act && !ex?.busy) av.bow = 0; }, 900);
      // 机位：两个人的侧面（挑一处看得见两个人的）；递东西时你走近，不挡在这个镜头与他之间
      let shot = talkShot(k, npc);
      k.nav.setPose(shot);
      ex = folk ? new Exchange(k, folk, () => shot.pos, () => { if (k.act !== act) return; shot = talkShot(k, npc); k.nav.setPose(shot, 1.5); }) : null;
      // 他转过来，「嗯」一声（声音那一路的 greet；没有这一声就不出）
      k.sfxAt('greet', { vel: 0.5, x: npc.pos.x, z: npc.pos.z });
      greet();
    },
    exit() {
      // 正递着东西：一下子收到头（没递到手的作罢，递到了的放好、「得……」浮出来）；你走近过的，就站在那里起身，不滑回去
      if (ex) { if (ex.busy) { act.spot.x = k.player.pos.x; act.spot.z = k.player.pos.z; } ex.finish(); ex = null; }
      npc.attend(null); k.player.av.lookAt(null); k.player.av.bow = 0; gifting = false; yesno = null;
    },
    update(dt: number) {
      // 说着话他走了（回家了、走远了）：就作罢。说着话的时候站位不动（递东西时你自己走近一步）
      if (k.act === act) { if (!npc.present) k.exitAct(); else ex?.update(dt); return; }
      act.anchor.set(npc.pos.x, npc.pos.y + 1.95, npc.pos.z);
      const p = k.player.pos, q = npc.pos, dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      // 已经在他跟前（三米以内；他被人围着、骑在牛上时四米多）：就近站着说，不必再挤过去（听书时人挤在一起，走不进去）。
      // 站位只朝他挪一小步——人堆里几个人都够得着时，离得最近的那个最先被「走近」
      const crowded = d > 3 && d <= 4.4 && (k.life?.blockers ?? []).some((b) => { if (!(b.r > 0)) return false; const e = Math.hypot(b.x - q.x, b.z - q.z); return e > 0.05 && e < 1.6; });
      if (d <= 3 || crowded) { act.spot.x = p.x - dx * 0.12; act.spot.z = p.z - dz * 0.12; act.spot.yaw = Math.atan2(-dx, -dz); return; }
      // 站在他朝着你来的那一侧：先找一米多远处站不站得住，站不住就往你这边退一退、再往两边让一让。
      // 离得远时不必每帧找（隔几帧找一回，远的只取那条线上的一点）
      if (++frame % (d < 8 ? 1 : 8) !== 0) return;
      let sx = q.x + ux * 1.3, sz = q.z + uz * 1.3;
      if (d < 26) {
        let ok = standable(sx, sz) != null;
        for (const r of [1.8, 2.4, 3.0, 3.6]) { if (ok || r > d - 0.4) break; sx = q.x + ux * r; sz = q.z + uz * r; ok = standable(sx, sz) != null; }
        for (const a of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
          if (ok) break;
          const c = Math.cos(a), s = Math.sin(a), vx = ux * c - uz * s, vz = ux * s + uz * c;
          sx = q.x + vx * 1.6; sz = q.z + vz * 1.6; ok = standable(sx, sz) != null;
        }
        // 他那一圈都站不住（坐在屋里桌后、船上）：离得不远就在你站的地方朝他说，远了先往他那边走
        if (!ok) { if (d < 6.5) { sx = p.x - dx * 0.12; sz = p.z - dz * 0.12; } else { sx = q.x + ux * 1.3; sz = q.z + uz * 1.3; } }
      }
      act.spot.x = sx; act.spot.z = sz; act.spot.yaw = Math.atan2(q.x - sx, q.z - sz);
    },
    cmd(name, arg) {
      // 东西正往他手里递：先递完再说别的（别过、走开照常）
      if (ex?.pending && name !== 'bye' && name !== 'done') return;
      if (name !== 'menu' && name !== 'bye' && name !== 'done') k.sfx('page', { vel: 0.2 });
      // 他回问的那一句，你没接、说起别的了：就不再等
      const pending = backQ;
      if (name !== 'back' && name !== 'item') backQ = null;
      if (name === 'back' && pending) { backQ = null; show(fl(pending[0]), fl(pending[1])); }
      else if (name.startsWith('fv:')) favor(name);
      else if (name === 'busy') busy();
      else if (name === 'ask') ask();
      else if (name === 'home') home();
      else if (name === 'chat') chat();
      else if (name === 'gift') gift();
      else if (name === 'item' && typeof arg === 'string') give(arg);
      else if (name === 'menu') { gifting = false; show(null, fl(B.after ?? '{你}还有什么话？')); }
      else if (name === 'bye' || name === 'done') bye();
    },
  };
  // 测试、截图看得见东西正在谁手上（act.ex.holder / act.ex.prop）
  Object.defineProperty(act, 'ex', { get: () => ex, enumerable: false });
  act.update!(0, 0);
  return act;
}

export function create(k: Anlewo): Act[] {
  const out: Act[] = [];
  for (const P of people()) {
    const n = k.life?.npcs[P.id] as Npc | undefined, B = BOOKS[P.id];
    if (n && B) out.push(make(k, P, n, B));
  }
  // 人在走动：没在说话时也要每帧把标记挪到他身上
  if (out.length) k.world.tick.push(() => { for (const a of out) if (k.act !== a) a.update?.(0, 0); });
  return out;
}
