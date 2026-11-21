/**
 * 天上点着一处，说它是什么：观星那件事（acts/stars.ts）与平时夜里在外面点天（Anlewo.skyTap）共用这一套。
 *
 *   星 / 星官的连线 —— 那个星官的连线描出来、星名写在旁边；说它属于哪一垣、哪一宿、此刻在哪个方向多高，配一两句古书里的话与白话。
 *   五星 —— 别名、此刻在哪一宿、多高。
 *   月 —— 今夜是朔是望、月在哪一宿、多高，配邵雍的诗。
 *   天汉 —— 点在银河上：这一段在哪个星官、哪一宿一带；银心那一头、天津的暗隙、对着银河外边最淡的那一段各有一句。
 *   不在三垣二十八宿里的小星 —— 「嘒彼小星」。
 *
 * 话的来历见 src/data/starlore.ts（古书原话逐字核对过；白话是本应用自己写的，与原话分开摆）。这里只拼话、点亮天上那一处，不碰界面。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Picked, Sky } from '../env/sky';
import { altAz, app3, D2R, EQ_TO_GAL, PLANETS } from '../env/stars/astro';
import { cnNum, mansionOf, xiangOf, type Asterism } from '../env/stars/catalog';
import { milky } from '../env/stars/milkyway';
import { HAN, NOTES, PLANET_NOTE, QUOTES, REGION_NOTE, type Quote } from '../../data/starlore';
import { PAIRS, poemOf } from './lib';

/** 一张星笺（界面上那一小页）：题、一行方位、原话与出处、白话；月是两句诗 */
export interface SkyCard {
  kind: 'star' | 'planet' | 'moon' | 'han' | 'small';
  title: string; hint: string;
  text?: string; source?: string; gloss?: string; lines?: string[];
}

/** 北斗七星的名（星表里叫北斗一……） */
export const DIPPER_NAMES = ['天枢', '天璇', '天玑', '天权', '玉衡', '开阳', '摇光'];
/** 观星录：存在 k.mem 的 'stars' 那一份里（星图那一页也读它） */
export interface StarBook { seen: string[]; planets: string[]; xiang: string[]; nights: number; meteors: number; [k: string]: unknown }

const book = (k: Anlewo) => k.mem.get<StarBook>('stars', { seen: [], planets: [], xiang: [], nights: 0, meteors: 0 });
/** 记一笔；头一回认得的，返回它是第几个（认得过的返回 0） */
export function noteSeen(k: Anlewo, key: 'seen' | 'planets' | 'xiang', name: string): number {
  const b = book(k), list = Array.isArray(b[key]) ? (b[key] as string[]) : [];
  if (list.includes(name)) return 0;
  k.mem.patch('stars', { [key]: [...list, name] });
  return list.length + 1;
}
export const quoteOf = (qs: Quote[] | undefined) => (qs?.length ? qs[Math.floor(Math.random() * qs.length)] : null);
/** 属哪里：三垣直说；二十八宿说「某宿·某象」 */
export function regionOf(sky: Sky, a: Asterism): string {
  const R = sky.data.regions[a.region], x = xiangOf(a.region);
  if (a.region < 3) return R;
  return a.name === R ? (x?.name ?? '') : `${R}·${x?.name ?? ''}`;
}
/** 在哪个方向、多高（五度一档） */
export function fmtAlt(w: THREE.Vector3): string {
  const { alt, az } = altAz([w.x, w.y, w.z]), dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  return `在${dirs[Math.round(az / 45) % 8]}方，高${cnNum(Math.max(1, Math.round(alt / 5) * 5))}度`;
}
const tmp = new THREE.Vector3();

/** 天上那几处亮着的都熄掉（连线回到 allA 那一层淡） */
export function clearSky(sky: Sky, allA: number) {
  sky.stars.highlight(null);
  for (let i = 0; i < PLANETS.length; i++) sky.stars.highlightPlanet(i, 0);
  sky.labels.hideAll('sel'); sky.labels.hideAll('star'); sky.labels.hideAll('han-');
  sky.lines.setAll(allA, 0.8);
}

/** 一个星官（点着的是其中 star 那一颗，或点在连线上 star 为 null）：描出来，说它 */
export function asterismCard(k: Anlewo, a: Asterism, star: number | null, allA: number): SkyCard {
  const sky = k.atmos.sky;
  sky.labels.hideAll('han-');
  sky.lines.setAll(allA * 0.7, 1.2);
  sky.lines.set(a.i, 0.85, 2.4, true);
  const hi = new Map<number, number>(); for (const s of a.stars) hi.set(s, 0.7); if (star != null) hi.set(star, 1);
  sky.stars.highlight(hi);
  sky.labels.show('sel', a.name, a.center, { sub: regionOf(sky, a) });
  // 星自己的名（织女一、天枢）：写在星的左边，小一号
  let sname: string | null = null;
  if (star != null) {
    const di = sky.data.dipper.indexOf(star);
    sname = di >= 0 && di < 7 ? DIPPER_NAMES[di] : sky.data.starName(star);
    if (sname && sname !== a.name) {
      const S = sky.data.stars.dir;
      sky.labels.show('star', sname, [S[star * 3], S[star * 3 + 1], S[star * 3 + 2]], { big: false, side: 'left' });
    } else sky.labels.hide('star');
  } else sky.labels.hide('star');
  const q = quoteOf(QUOTES[a.name]);
  const where = star != null ? fmtAlt(sky.dir(star, tmp)) : fmtAlt(sky.toWorld(a.center, tmp));
  const note = (sname && NOTES[sname]) || NOTES[a.name] || (a.region < 3 && a.name.includes('垣') ? REGION_NOTE[sky.data.regions[a.region]] : '') || '';
  const nth = noteSeen(k, 'seen', a.name);
  if (nth) k.note(`认得了一个星官：${a.name}（第${cnNum(nth)}个）`, 'stars');
  k.sfx('starTap', { vel: 0.4 }); k.buzz(6);
  return {
    kind: 'star', title: a.name, hint: `${sname && sname !== a.name ? sname + '，' : ''}属${regionOf(sky, a)}。${where}。`,
    text: q ? q.text : note || undefined, source: q?.source, gloss: q ? [q.gloss, note].filter(Boolean).join('\n') || undefined : undefined,
  };
}

/** 五星之一 */
export function planetCard(k: Anlewo, i: number, allA: number): SkyCard {
  const sky = k.atmos.sky, p = PLANETS[i], eq = sky.planetEq(i), info = PLANET_NOTE[p.id];
  sky.labels.hideAll('han-');
  sky.lines.setAll(allA * 0.7, 1.2);
  sky.stars.highlight(null);
  for (let j = 0; j < PLANETS.length; j++) sky.stars.highlightPlanet(j, j === i ? 1 : 0);
  const xiu = mansionOf(eq);
  sky.labels.show('sel', p.name, eq, { sub: `${p.alias}　在${xiu}` });
  sky.labels.hide('star');
  const q = info.quote;
  if (noteSeen(k, 'planets', p.name)) k.note(`认得了${p.name}`, 'stars');
  k.sfx('starTap', { vel: 0.45 }); k.buzz(6);
  return { kind: 'planet', title: p.name, hint: `${p.alias}，此刻在${xiu}。${fmtAlt(sky.toWorld(eq, tmp))}。`, text: q?.text, source: q?.source, gloss: [q?.gloss, info.note].filter(Boolean).join('\n') };
}

/** 月 */
export function moonCard(k: Anlewo): SkyCard {
  const sky = k.atmos.sky, ph = k.atmos.moonPhase;
  const name = ph < 0.03 || ph > 0.97 ? '朔' : ph < 0.22 ? '新月' : ph < 0.28 ? '上弦' : ph < 0.47 ? '盈凸' : ph < 0.53 ? '望' : ph < 0.72 ? '亏凸' : ph < 0.78 ? '下弦' : '残月';
  const m = sky.moonDraw, xiu = mansionOf(sky.toEq(m));
  const poem = poemOf(['qingye'], '清夜吟'), pair = PAIRS.find((p) => p.id === 'c09');
  k.sfx('starTap', { vel: 0.35 });
  return {
    kind: 'moon', title: '月', hint: `今夜是${name}，月在${xiu}。${fmtAlt(m)}。`,
    lines: poem ? poem.lines : pair ? [pair.a, pair.b] : undefined, source: poem ? `邵雍《${poem.title}》` : pair ? `邵雍《${pair.from}》` : undefined,
    gloss: pair && poem ? `${pair.a}，${pair.b}。——邵雍《${pair.from}》` : undefined,
  };
}

/** 不在三垣二十八宿里的小星 */
export function smallCard(k: Anlewo, star: number): SkyCard {
  const sky = k.atmos.sky;
  sky.stars.highlight(new Map([[star, 1]]));
  sky.labels.hideAll('sel'); sky.labels.hide('star'); sky.labels.hideAll('han-');
  k.sfx('starTap', { vel: 0.25 });
  return { kind: 'small', title: '小星', hint: `${fmtAlt(sky.dir(star, tmp))}。不在三垣二十八宿的星官里`, text: '嘒彼小星，三五在东。', source: '《诗经·召南·小星》' };
}

/** 这个方向（世界里）的银经、银纬（度）与天汉在那里有多亮 */
export function galactic(k: Anlewo, w: THREE.Vector3): { l: number; b: number; bright: number } {
  const g = app3(EQ_TO_GAL, ...k.atmos.sky.toEq(w));
  const l = ((Math.atan2(g[1], g[0]) / D2R) % 360 + 360) % 360, b = Math.asin(Math.max(-1, Math.min(1, g[2]))) / D2R;
  return { l, b, bright: Math.abs(b) < 36 ? milky(l, b)[0] : 0 };
}
/** 点在天汉上 */
export function hanCard(k: Anlewo, w: THREE.Vector3, l: number, b: number): SkyCard {
  const sky = k.atmos.sky, eq = sky.toEq(w), xiu = mansionOf(eq);
  // 这一段最近的那个星官（中心离点着的地方最近的），名字写在天上
  let best: Asterism | null = null, bd = 1e9;
  for (const a of sky.data.asterisms) {
    const d = Math.acos(Math.max(-1, Math.min(1, a.center[0] * eq[0] + a.center[1] * eq[1] + a.center[2] * eq[2])));
    if (d < bd) { bd = d; best = a; }
  }
  sky.stars.highlight(null);
  for (let j = 0; j < PLANETS.length; j++) sky.stars.highlightPlanet(j, 0);
  sky.labels.show('sel', '天汉', eq, { sub: best && bd < 12 * D2R ? `${best.name}一带` : xiu });
  sky.labels.hide('star');
  // 河的两岸：牵牛（河鼓二）与织女（织女一）在天上的话，淡淡点亮、写上名字——看得出它们隔着这条河
  const bank = new Map<number, number>();
  for (const [name, label, side] of [['河鼓', '牵牛', 'right'], ['织女', '织女', 'left']] as const) {
    const a = sky.data.find(name); if (!a) continue;
    const S = sky.data.stars; let bi = -1, bm = 99;
    for (const s of a.stars) if (S.mag[s] < bm) { bm = S.mag[s]; bi = s; }
    if (bi < 0 || sky.dir(bi, tmp).y < 0.05) continue;
    bank.set(bi, 0.8);
    sky.labels.show(`han-${name}`, label, [S.dir[bi * 3], S.dir[bi * 3 + 1], S.dir[bi * 3 + 2]], { big: false, side, alpha: 0.85 });
  }
  if (bank.size) sky.stars.highlight(bank);
  const q = quoteOf(HAN);
  const dl = (x: number) => { let d = Math.abs(l - x) % 360; return d > 180 ? 360 - d : d; };
  // 这一段的样子（只说看得见的，不说吉凶）
  const part = dl(0) < 25 ? '这一头朝着银河的中心（斗宿、尾宿一带），是天汉最亮、最宽的地方；夏秋的黄昏横在南天。'
    : l > 55 && l < 90 && Math.abs(b) < 8 ? '天津（天鹅座）这一段，天汉被一道暗隙劈成两股，一直往南伸到斗宿。'
    : dl(180) < 35 ? '这一段对着银河的外边（五车、天关一带），是天汉最淡的地方，冬夜里要细看才看得出。'
    : '';
  k.sfx('starTap', { vel: 0.3 });
  return {
    kind: 'han', title: '天汉',
    hint: `也叫云汉、河汉。这一段${best && bd < 12 * D2R ? `在${best.name}一带、` : ''}属${xiu}，${fmtAlt(w)}。`,
    text: q?.text, source: q?.source,
    gloss: [q?.gloss, part, '那一道淡白的光，是数不清的远星挤在一起；中间暗下去的几道，是尘埃挡住了后面的星。牵牛、织女就隔着它。'].filter(Boolean).join('\n'),
  };
}

/**
 * 平时夜里点了天上这个方向（w，世界里的单位向量）：月、五星、星、星官的连线、天汉，先近后远；什么都没点着返回 null。
 * tol 是点按的容差（弧度，约二十几个像素）。点着了就把那一处点亮、返回要给界面看的星笺。
 */
export function pickSky(k: Anlewo, w: THREE.Vector3, tol: number): SkyCard | null {
  const sky = k.atmos.sky;
  if (w.y < 0.02) return null;
  const m = sky.moonDraw;
  if (m.y > 0.02 && w.angleTo(m) < Math.max(0.05, tol)) { clearSky(sky, 0); return moonCard(k); }
  const pk: Picked | null = sky.pick(w.clone(), tol, { lines: true });
  if (pk) {
    if (pk.kind === 'planet') return planetCard(k, pk.planet, 0);
    if (pk.kind === 'line') return asterismCard(k, sky.data.asterisms[pk.asterism], null, 0);
    if (pk.asterism != null) return asterismCard(k, sky.data.asterisms[pk.asterism], pk.star, 0);
    return smallCard(k, pk.star);
  }
  const g = galactic(k, w);
  if (g.bright > 0.16) { clearSky(sky, 0); return hanCard(k, w, g.l, g.b); }
  return null;
}
