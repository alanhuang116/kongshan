/**
 * 观物得象。
 *
 * 《周易》的卦象本来就是从这样一片天地里取来的——「仰则观象于天，俯则观法于地」。这里把它还回去：
 * 井台上是「木上有水，井」，村塾里是「山下出泉，蒙」，灶屋的炊烟是「风自火出，家人」，月夜池上的风是「风行水上，涣」……
 * 人走到那一处、赶上那个时候，站定看一会儿，那一卦就在画面上写出来，收进册子（界面上的「观象册」，先天方图）。不占，不问吉凶。
 *
 * 每一条：卦名、标记上的两三个字（只说景，不说卦）、站在哪、看哪里、什么时候有。
 * 位置都是总图上的数；看远处的（天、山、日月）给一个很远的点。
 * 有五卦不在这张表上，是在做事的时候显出来的（IN_ACTS）：煮茶时「水在火上，既济」，抚琴时「雷出地奋，豫」，
 * 自斟时「云上于天，需」（君子以饮食宴乐），读书时「天在山中，大畜」（多识前言往行），与客对坐说话时「丽泽，兑」（朋友讲习）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Season } from '../env/atmos';
import { PLOTS, RIVER_Y, SITE, YARD_Y, streamAt } from '../site';
import { HALL_Y, groundAt, standable } from '../walk';
import type { Act } from './types';

interface Cond { hour: number; night: number; dawn: number; dusk: number; lamp: number; season: Season; rain: number; snow: number; mist: number; k: Anlewo }
type Look = [number, number, number] | ((k: Anlewo) => THREE.Vector3 | null);
interface Def { gua: string; label: string; at: [number, number]; look: Look; when?: (c: Cond) => boolean; /** 走近到多远就提（默认 2.4 米） */ radius?: number }

/** 很远的一点：az 是方位（度：0 正南，90 正东，180 正北，−90 正西），h 是那一点的高度 */
const far = (az: number, h: number): [number, number, number] => [Math.sin((az * Math.PI) / 180) * 3000, h, Math.cos((az * Math.PI) / 180) * 3000];
const P = SITE.pond, I = SITE.inside, G = SITE.gnomon, T = SITE.table;
const clear = (c: Cond) => c.rain + c.snow + c.mist < 0.35;
const day = (c: Cond) => c.night < 0.25;
const between = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
const plot = (crop: string, i = 0) => PLOTS.filter((p) => p.crop === crop)[i] ?? PLOTS[0];
const mid = (p: { x0: number; x1: number; z0: number; z1: number; y: number }, h = 0.3): [number, number, number] => [(p.x0 + p.x1) / 2, p.y + h, (p.z0 + p.z1) / 2];
const npc = (id: string, h = 1.1) => (k: Anlewo): THREE.Vector3 | null => { const n = k.life?.npcs[id]; return n && n.present ? n.pos.clone().setY(n.pos.y + h) : null; };
const here = (k: Anlewo, id: string) => k.life?.npcs[id]?.present ?? true;

const DEFS: Def[] = [
  { gua: '乾', label: '长空', at: [G.x, G.z + 1.9], look: far(0, 1500), when: (c) => between(c.hour, 10.5, 13.5) && clear(c) },
  { gua: '坤', label: '大地', at: [22, 86], look: mid(plot('plough')) },
  { gua: '屯', label: '春耕', at: [-13, 93], look: (k) => npc('farmer')(k) ?? new THREE.Vector3(...mid(plot('plough'))), when: (c) => c.season === 'spring' && day(c) && c.rain < 0.5 && here(c.k, 'farmer') },
  { gua: '蒙', label: '书声', at: [99, 6.9], look: [99, 0, 2], when: (c) => between(c.hour, 7, 11) && c.rain < 0.5 },
  { gua: '讼', label: '说理', at: [90.6, 15.6], look: (k) => npc('elder')(k) ?? new THREE.Vector3(SITE.elm.x, 0, SITE.elm.z), when: (c) => day(c) && c.rain < 0.5 && here(c.k, 'elder') },
  { gua: '师', label: '沟渠', at: [22, 43.4], look: [22, streamAt(22, 33).y, 34.5] },
  { gua: '比', label: '邻家', at: [75.6, -2.4], look: [74, 0, -8], when: day },
  { gua: '小畜', label: '密云', at: [-1.2, -21.4], look: far(-90, 900), when: (c) => c.mist > 0.5 && day(c) },
  { gua: '履', label: '踏石', at: [SITE.stones.x, SITE.stones.z + 4.2], look: [SITE.stones.x, streamAt(SITE.stones.x, SITE.stones.z).y, SITE.stones.z] },
  { gua: '泰', label: '开春', at: [0.6, 18.8], look: far(25, 500), when: (c) => c.season === 'spring' && between(c.hour, 6, 12) && clear(c) },
  { gua: '否', label: '秋深', at: [22.5, 128], look: mid(plot('fallow')), when: (c) => c.season === 'autumn' && c.hour > 15 && c.night < 0.6 },
  { gua: '同人', label: '灯火', at: [80, 15.2], look: [99, 0, 2], when: (c) => c.lamp > 0.5 },
  { gua: '大有', label: '秋收', at: [22, 82], look: mid(plot('wheat', 3)), when: (c) => c.season === 'autumn' && day(c) && c.rain < 0.5 },
  { gua: '谦', label: '低冈', at: [-14.8, -9.6], look: far(180, 40) },
  { gua: '随', label: '向晚', at: [0, 4.4], look: [0, HALL_Y + 1.3, 0], when: (c) => c.dusk > 0.25 || (c.night > 0.2 && c.night < 0.9 && c.hour > 12) },
  { gua: '蛊', label: '修桥', at: [124.4, 46.2], look: [SITE.plank.x, 0, SITE.plank.z], when: (c) => day(c) && c.rain < 0.5 },
  { gua: '临', label: '池岸', at: [P.x + P.rx + 1.3, P.z], look: [P.x, P.y, P.z] },
  { gua: '观', label: '原上风', at: [-70.6, 93], look: far(-50, 60), when: day },
  { gua: '噬嗑', label: '雷电', at: [0, 2.0], look: far(0, 900), when: (c) => c.season === 'summer' && c.rain > 0.6 },
  { gua: '贲', label: '夕照', at: [SITE.bridge.x, SITE.bridge.z + 1.2], look: far(-90, 320), when: (c) => c.dusk > 0.35 && clear(c) },
  { gua: '剥', label: '落叶', at: [92.6, 15.1], look: [SITE.elm.x, 4.5, SITE.elm.z], when: (c) => c.season === 'autumn' },
  { gua: '复', label: '闭关', at: [-1.1, 14.4], look: [0, YARD_Y + 1.4, SITE.gate.z + 0.3], when: (c) => c.season === 'winter' && between(c.hour, 22.5, 1.5) },
  { gua: '无妄', label: '时雨', at: [22, 54], look: mid(plot('veg')), when: (c) => c.season === 'spring' && c.rain > 0.5 },
  { gua: '颐', label: '灶屋', at: [SITE.wing.x - SITE.wing.w / 2 - 1.2, SITE.wing.z], look: [SITE.wing.x, YARD_Y + 1.5, SITE.wing.z], when: (c) => between(c.hour, 11, 13) },
  { gua: '大过', label: '卧柳', at: [-9.2, 22.6], look: [-12, 0, 25.4] },
  { gua: '坎', label: '溪声', at: [SITE.bridge.x - 0.3, SITE.bridge.z - 0.6], look: [-30, streamAt(-30, 28.5).y, 28.5] },
  { gua: '离', label: '窗灯', at: [-3.2, 6.6], look: [-3.2, YARD_Y + 1.6, 2.7], when: (c) => c.lamp > 0.5 },
  { gua: '咸', label: '山上之泽', at: [P.x - P.rx - 0.9, P.z + 2.6], look: [P.x, P.y, P.z] },
  { gua: '恒', label: '双松', at: [10.3, 11.8], look: [(SITE.pines[0].x + SITE.pines[1].x) / 2, YARD_Y + 4.2, (SITE.pines[0].z + SITE.pines[1].z) / 2] },
  { gua: '遁', label: '门外山', at: [0.8, 13], look: far(8, 260) },
  { gua: '大壮', label: '春雷', at: [-42, 62], look: far(-45, 700), when: (c) => c.season === 'spring' && c.rain > 0.5 },
  { gua: '晋', label: '日出', at: [16, 22.6], look: far(90, 140), when: (c) => c.dawn > 0.4 && clear(c) },
  { gua: '明夷', label: '日入', at: [-34, 37.4], look: far(-90, 90), when: (c) => c.hour > 12 && c.night > 0.3 && c.night < 0.95 },
  { gua: '家人', label: '炊烟', at: [5.6, 8.4], look: [SITE.wing.x, YARD_Y + 5.6, SITE.wing.z], when: (c) => c.dawn > 0.2 || c.dusk > 0.2 || between(c.hour, 11, 12.6) },
  { gua: '睽', label: '池上霞', at: [P.x - P.rx - 0.2, P.z - 4.2], look: [P.x + 2, P.y + 0.6, P.z], when: (c) => c.dusk > 0.4 && clear(c) },
  { gua: '蹇', label: '山泉', at: [SITE.entry.x + 4, SITE.entry.z], look: far(-92, 260), when: day },
  { gua: '解', label: '雨后', at: [-98, 36.6], look: [-104, 0, 30], when: (c) => c.season === 'spring' && c.rain > 0.4 },
  { gua: '损', label: '伊阙', at: [SITE.ferry.x - 3, SITE.ferry.z - 3.2], look: [-362, 160, 2575], when: (c) => c.mist < 0.5 && c.rain < 0.5 },
  { gua: '益', label: '麦风', at: [-13, 60], look: mid(plot('wheat', 1)), when: (c) => (c.season === 'spring' || c.season === 'summer') && day(c) && c.rain < 0.4 },
  { gua: '夬', label: '欲雨', at: [22, 108.4], look: far(-60, 900), when: (c) => c.mist > 0.4 || (c.rain > 0.08 && c.rain < 0.6) },
  { gua: '姤', label: '南风', at: [22, 117.4], look: far(0, 300), when: (c) => c.season === 'summer' && between(c.hour, 10, 14) && clear(c) },
  { gua: '萃', label: '群鸭', at: [4.6, 36.6], look: [14, streamAt(14, 31.5).y, 31.6], when: day },
  { gua: '升', label: '桑', at: [90, 45.3], look: [92, 0, 52.5], when: (c) => c.season === 'spring' || c.season === 'summer' },
  { gua: '困', label: '涸池', at: [P.x, P.z - P.rz - 1.3], look: [P.x, P.y, P.z], when: (c) => c.season === 'winter' },
  { gua: '井', label: '井', at: [SITE.well.x, SITE.well.z + 1.9], look: [SITE.well.x, 0, SITE.well.z] },
  { gua: '革', label: '圭表', at: [G.x + 1.25, G.z + 0.4], look: [G.x, YARD_Y + 0.25, G.z - 0.7], when: (c) => day(c) && clear(c) },
  { gua: '鼎', label: '酒家灶', at: [79.4, 18.6], look: [82, 0, 22], when: (c) => c.night < 0.7 },
  { gua: '震', label: '飞瀑', at: [112, 6.6], look: far(135, 420), when: day },
  { gua: '艮', label: '兼山', at: [-9.2, -17.2], look: far(-135, 430) },
  { gua: '渐', label: '鸿雁', at: [112, 214], look: far(-30, 900), when: (c) => c.season === 'autumn' && day(c) },
  { gua: '归妹', label: '泽上雷', at: [126, 220], look: far(40, 320), when: (c) => c.rain > 0.5 },
  { gua: '丰', label: '日中', at: [22, 69.6], look: mid(plot('wheat', 1)), when: (c) => c.season === 'summer' && between(c.hour, 11, 13) && clear(c) },
  { gua: '旅', label: '行人', at: [-150, 37.6], look: far(88, 70) },
  { gua: '巽', label: '竹风', at: [-8.6, -25.3], look: [-10, 0, -33] },
  { gua: '涣', label: '风来水面', at: [P.x - P.rx - 0.6, P.z - 0.9], look: [P.x, P.y, P.z], when: (c) => c.night > 0.6 && clear(c) },
  { gua: '节', label: '荷塘', at: [P.x, P.z + P.rz + 1.2], look: [P.x, P.y, P.z], when: (c) => c.season === 'summer' },
  { gua: '中孚', label: '鹭', at: [SITE.ferry.x + 4, SITE.ferry.z - 1.5], look: [150, RIVER_Y, 240], when: (c) => day(c) && c.rain < 0.5 },
  { gua: '小过', label: '雀', at: [7.5, 12.3], look: [SITE.plum.x, YARD_Y + 2.6, SITE.plum.z], when: day },
  { gua: '未济', label: '渡口夕照', at: [SITE.ferry.x, SITE.ferry.z - 1.2], look: far(-78, 70), when: (c) => c.dusk > 0.35 && clear(c) },
];

/** 离 (x, z) 最近的能站的地方（一圈一圈往外找） */
function nearStand(x: number, z: number): [number, number] | null {
  if (standable(x, z) != null) return [x, z];
  for (let r = 0.25; r <= 2.6; r += 0.25) for (let a = 0; a < 12; a++) { const px = x + Math.cos((a / 12) * Math.PI * 2) * r, pz = z + Math.sin((a / 12) * Math.PI * 2) * r; if (standable(px, pz) != null) return [px, pz]; }
  return null;
}

/** 在做事的时候显出来的那几卦 */
export const IN_ACTS = ['既济', '豫', '需', '兑', '大畜'];
/** 显出一卦：没观过的记进册子。返回给界面的那几项（gua、found） */
export function reveal(k: Anlewo, gua: string): { gua: string; found: boolean } {
  const isNew = !k.found.has(gua);
  k.found.add(gua);
  if (isNew) { k.log({ kind: 'xiang', text: gua }); k.sfx('page', { vel: 0.5 }); k.buzz(10); }
  return { gua, found: !isNew };
}

function make(k: Anlewo, d: Def): Act | null {
  const st = nearStand(d.at[0], d.at[1]);
  if (!st) { console.warn(`观象「${d.label}」没有地方站`, d.at); return null; }
  const gy = groundAt(st[0], st[1]) ?? 0;
  const target = new THREE.Vector3();
  /** 看的那一点（y 给 0 的是「贴着那里的地面」） */
  const aim = () => {
    const v = typeof d.look === 'function' ? d.look(k) : new THREE.Vector3(...d.look);
    if (v) { target.copy(v); if (Array.isArray(d.look) && d.look[1] === 0) target.y = (groundAt(v.x, v.z) ?? gy) + 1.1; }
    return target;
  };
  aim();
  const yaw = Math.atan2(target.x - st[0], target.z - st[1]);
  const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), right = new THREE.Vector3(-dir.z, 0, dir.x);
  const cond = (): Cond => { const a = k.atmos; return { hour: a.hour, night: a.night, dawn: a.dawn, dusk: a.dusk, lamp: a.lamp, season: k.season, rain: a.w.rain, snow: a.w.snow, mist: a.w.mist, k }; };
  let t = 0;
  const act: Act & { on(): boolean } = {
    id: `xiang:${d.gua}`, name: d.label,
    anchor: new THREE.Vector3(st[0] + dir.x * 0.9, gy + 1.9, st[1] + dir.z * 0.9),
    spot: { x: st[0], z: st[1], yaw },
    radius: d.radius ?? 2.4,
    state: {},
    on: () => (d.when ? d.when(cond()) : true),
    enter() {
      t = 0;
      const av = k.player.av, dist = Math.hypot(target.x - st[0], target.z - st[1]);
      av.setHands('sleeve'); av.lookAt(aim());
      // 机位：退到人的侧后方，人在画面一角，他看的东西在画面当中
      const back = dist > 30 ? 5.2 : 3.6, pos = new THREE.Vector3(st[0], gy + (dist > 30 ? 2.1 : 2.3), st[1]).addScaledVector(dir, -back).addScaledVector(right, 1.7);
      const look = dist > 30 ? new THREE.Vector3(st[0], gy + 1.75, st[1]).addScaledVector(dir, 16).setY(gy + 1.75 + Math.min(7, (target.y - gy) * (16 / dist))) : target.clone();
      k.nav.setPose({ pos, look, fov: 40, yaw: 26, up: 16, down: 8 });
      act.state = { kind: 'xiang', title: d.label, hint: '站定，看一会儿', found: k.found.has(d.gua), progress: 0 };
      k.emitAct();
    },
    exit() { k.player.av.lookAt(null); },
    update(dt) {
      if (act.state.gua) return;
      t += dt;
      k.player.av.lookAt(aim());
      const p = Math.min(1, t / 2.6);
      if (p >= 1) { show(); return; }
      if (Math.abs(p - (act.state.progress as number)) > 0.02) { act.state.progress = p; k.emitAct(); }
    },
    input: { tap: () => { if (!act.state.gua && t > 0.5) show(); return true; } },
    cmd(name) { if (name === 'keep' || name === 'done') k.exitAct(); },
  };
  const show = () => {
    const r = reveal(k, d.gua);
    act.state = { kind: 'xiang', title: d.label, gua: d.gua, found: r.found, progress: 1, choices: [{ id: 'keep', label: r.found ? '毕' : '记下' }] };
    k.emitAct();
  };
  return act;
}

export function create(k: Anlewo): Act[] {
  return DEFS.map((d) => make(k, d)).filter((a): a is Act => !!a);
}
/** 这张表上有哪些卦（测试用） */
export const XIANG_GUA = DEFS.map((d) => d.gua);
