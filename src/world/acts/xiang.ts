/**
 * 观物得象。
 *
 * 《周易》的卦象本来就是从这样一片天地里取来的——「仰则观象于天，俯则观法于地」。这里把它还回去：
 * 井台上是「木上有水，井」，村塾里是「山下出泉，蒙」，灶屋的炊烟是「风自火出，家人」，月夜池上的风是「风行水上，涣」……
 * 人走到那一处、赶上那个时候，站定看一会儿，那一卦就在画面上写出来，收进册子（界面上的「观象册」，先天方图）。不占，不问吉凶。
 * 显出来的是一张象卡：卦辞、大象（注出处）、白话，和「所见」——站在这一处看见的（data/gua64.ts，照录的原文）。
 *
 * 每一条：卦名、标记上的两三个字（只说景，不说卦）、站在哪、看哪里、什么时候有。
 * 位置都是总图上的数；看远处的（天、山、日月）给一个很远的点。
 * 站在哪、朝哪看、什么时辰季节天气，照《观象册 · 意象整理》《六十四卦 · 完整文档》两份文档里的触发条件；
 * 文档里写的地方在这片地上对不准的，取最近、最合那一句「所见」的一处（每一处为什么这样取，写在那一行后面）。
 * 有五卦不在这张表上，是在做事的时候显出来的（IN_ACT）：煮茶时「水在火上，既济」，抚琴时「雷出地奋，豫」，
 * 自斟时「云上于天，需」（君子以饮食宴乐；文档写「夜间，灯火亮时」），读书时「天在山中，大畜」（多识前言往行），与客对坐说话时「丽泽，兑」（朋友讲习）。
 *
 * 机位：退到人的侧后方，人在画面一角，他看的东西在画面当中。退之前先看一眼挡不挡——
 * 右后、左后，再一步步收近、抬高，取头一处「看得见他、也看得见他看的东西」的（见 frame）：
 * 树按总图上的位置与大小估一团冠、一根干（不去碰画树的那几万笔），地按地势一段段比，屋舍拿视线去碰网格（只在站定的那一下碰几回）。
 *
 * 有几卦站定时那一处要添点什么（on / tick）：讼——槐下来一个与李公说理的人；旅——桃林路上走过一个背包袱的；
 * 比——邻家屋上起一缕炊烟；鼎——酒家门边灶上的鼎冒热气；噬嗑——远山上打一个闪；渐——一行雁从头顶往南去；涣——池面一圈圈荡开。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Season } from '../env/atmos';
import { siteExtras } from '../env/flora/extras';
import { lateWheat } from '../env/flora/field';
import { seatTalker, startTraveller } from '../life/passer';
import { PLUM_PERCH, egretSpots } from '../life/spots';
import { MOUND, PLOTS, RIVER_Y, RILLS, SITE, TREES, YARD_Y, ground, houseY, streamAt, streamZ } from '../site';
import { HALL_Y, groundAt, standable, terrainY } from '../walk';
import type { Act } from './types';

interface Cond { hour: number; night: number; dawn: number; dusk: number; lamp: number; season: Season; rain: number; snow: number; mist: number; k: Anlewo }
type Look = [number, number, number] | ((k: Anlewo) => THREE.Vector3 | null);
/** 站定时这一处的事：t 站了几秒，n 下一回的时刻（给打闪、荡圈用），at 站处，target 看的那一点 */
interface Here { t: number; n: number; at: [number, number]; target: THREE.Vector3; data: Record<string, unknown> }
interface Def {
  gua: string; label: string; at: [number, number]; look: Look; when?: (c: Cond) => boolean;
  /** 走近到多远就提（默认 2.4 米） */ radius?: number;
  /** 站定的那一下：添点什么（叫个人来、起一缕烟……）；返回走开时收拾的 */ on?: (k: Anlewo, h: Here) => (() => void) | void;
  /** 站着的时候每帧（象卡出来以后也接着） */ tick?: (k: Anlewo, dt: number, h: Here) => void;
  /** 镜头摆在哪（要侧着看的那几处自己定，不照 frame 退到人的侧后方去找） */ cam?: [number, number, number];
}

/** 很远的一点：az 是方位（度：0 正南，90 正东，180 正北，−90 正西），h 是那一点的高度 */
const far = (az: number, h: number): [number, number, number] => [Math.sin((az * Math.PI) / 180) * 3000, h, Math.cos((az * Math.PI) / 180) * 3000];
const P = SITE.pond, I = SITE.inside, G = SITE.gnomon, T = SITE.table;
/** 晴（无雨雾雪） */
const clear = (c: Cond) => c.rain + c.snow + c.mist < 0.35;
/** 晴（无雨）：雾、雪不论 */
const dry = (c: Cond) => c.rain < 0.1;
/** 白天 */
const day = (c: Cond) => c.night < 0.25;
/** 夜间（灯火亮时） */
const lamp = (c: Cond) => c.lamp > 0.5;
const between = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
const plot = (crop: string, i = 0) => PLOTS.filter((p) => p.crop === crop)[i] ?? PLOTS[0];
const mid = (p: { x0: number; x1: number; z0: number; z1: number; y: number }, h = 0.3): [number, number, number] => [(p.x0 + p.x1) / 2, p.y + h, (p.z0 + p.z1) / 2];
const npc = (id: string, h = 1.1) => (k: Anlewo): THREE.Vector3 | null => { const n = k.life?.npcs[id]; return n && n.present ? n.pos.clone().setY(n.pos.y + h) : null; };
const here = (k: Anlewo, id: string) => k.life?.npcs[id]?.present ?? true;
/** 屋舍那边的一个挂点（往上 dy 米）；没有就 null */
const anc = (k: Anlewo, name: string, dy = 0) => { const a = k.build?.anchors[name]; return a ? a.position.clone().setY(a.position.y + dy) : null; };
/** 秋天还没割的那一畦麦（黄熟的；草木、地色那边也照它画） */
const LATE = PLOTS.find(lateWheat) ?? plot('wheat', 4);
/** 讼：槐下李公对面，说理的那人坐的小板凳 */
const TALK: [number, number] = [90.55, 12.2];
/** 渠上涵洞的南口 */
const CULVERT = RILLS.culvert;
/** 渡口的白鹭站在哪（三只的当中） */
const EGRET = (() => { const s = egretSpots(); return s.reduce((a, b) => [a[0] + b.x / s.length, a[1] + b.z / s.length], [0, 0]); })();

type Npc = { present: boolean; pos: THREE.Vector3; act?: string | null; attend(p: THREE.Vector3 | null): void };
const elderOf = (k: Anlewo) => k.life?.npcs.elder as Npc | undefined;

const DEFS: Def[] = [
  { gua: '乾', label: '长空', at: [G.x, G.z + 1.9], look: far(0, 1500), when: (c) => between(c.hour, 10.5, 13.5) && clear(c) },
  // 井田横一上，朝南：脚下是当中那一畦新翻的深色的地，再往南一畦畦平铺到河滩、伊水（乾那一面最空阔）（原先在田间路上朝西看那一畦）
  { gua: '坤', label: '大地', at: [-27.5, 100.4], look: far(0, 22) },
  { gua: '屯', label: '春耕', at: [-13, 117], look: (k) => npc('farmer')(k) ?? new THREE.Vector3(...mid(plot('plough'))), when: (c) => c.season === 'spring' && day(c) && c.rain < 0.5 && here(c.k, 'farmer') },
  // 塾前偏西，斜着看进塾里（先生、学童），右边是东山墙外坡脚下那一眼泉，一线细流顺着墙根淌下来（山下出泉）
  {
    gua: '蒙', label: '书声', at: [101.8, 8.4], look: [RILLS.spring.x - 0.8, terrainY(101.8, 8.4) + 0.5, RILLS.spring.z + 0.5],
    cam: [101.0, terrainY(101.8, 8.4) + 2.5, 11.2], when: (c) => between(c.hour, 7, 11) && c.rain < 0.5,
  },
  // 站到槐树干的东边（原先站在干的东南，干正挡在画当中）；上午李公独坐时，对面小板凳上来一个人与他说理，午后看两位老人对弈（李公棋下得不好，爱悔棋）
  {
    gua: '讼', label: '说理', at: [94.5, 11.5],
    look: (k) => {
      const e = elderOf(k), C = SITE.more.chess;
      if (e?.present && e.act === 'go') return new THREE.Vector3(C.x, (groundAt(C.x, C.z) ?? 7) + 0.85, C.z);
      if (e?.present) return new THREE.Vector3((e.pos.x + TALK[0]) / 2, e.pos.y + 1.0, (e.pos.z + TALK[1]) / 2);
      return new THREE.Vector3(SITE.elm.x, (groundAt(SITE.elm.x, SITE.elm.z) ?? 7) + 1.5, SITE.elm.z);
    },
    when: (c) => day(c) && c.rain < 0.5 && here(c.k, 'elder'),
    on: (k) => {
      const e = elderOf(k);
      if (!e?.present || e.act !== 'sit' || Math.hypot(e.pos.x - TALK[0], e.pos.z - TALK[1]) > 2.6) return;
      const face = e.pos.clone().setY(e.pos.y + 1.05), man = seatTalker(k, TALK[0], TALK[1], face);
      e.attend(man.head);
      const tick = (dt: number, t: number) => man.talk(dt, t);
      k.world.tick.push(tick);
      return () => { const i = k.world.tick.indexOf(tick); if (i >= 0) k.world.tick.splice(i, 1); man.dispose(); e.attend(null); };
    },
  },
  // 溪南小路边：一道石砌的小渠从溪里引出来，钻进路底下的涵洞，在这一头冒出来，顺着田边往南去（水在地底下流着，看不见）
  { gua: '师', label: '沟渠', at: [19.6, 72.6], look: [CULVERT.x - 0.1, 6.15, CULVERT.z0 + 0.3] },
  // 抬高一点，带上屋顶上那一缕炊烟；门前那道浇菜的小水沟也在画里（水流过地面）
  {
    gua: '比', label: '邻家', at: [75.0, 1.2], look: [73.2, houseY('b') + 2.35, -7.0], when: day,
    on: (k) => { const c = anc(k, 'chimneyB', -1.0); if (!c || !k.fx) return; const w = k.fx.smoke(c, { size: 0.3, rise: 11, amount: 0.7, warm: 1 }); return () => w.dispose(); },
  },
  // 观物亭西南边坡上，往西望（站开亭子几步，镜头不钻进亭檐，竹林让到右边）：雾天西山上压着一带墨云，遮了半边天（env/sky.ts 的密云）
  { gua: '小畜', label: '密云', at: [SITE.pavilion.x - 7.2, SITE.pavilion.z + 3.4], look: far(-96, 440), when: (c) => c.mist > 0.5 && day(c) },
  // 站在溪心偏北那块汀步上，朝东南望下游：镜头在上游五米、侧着看过去，一溜汀步横在画底、人立在石上，水在脚下流，
  // 远处田畴、山，上头三分之一是天（原先镜头在人背后，前头的石头叫人自己挡了，画里只剩岸）
  {
    gua: '履', label: '踏石', at: [SITE.stones.x, SITE.stones.z - 0.5],
    look: [SITE.stones.x + 2, streamAt(SITE.stones.x, SITE.stones.z).y + 1.2, SITE.stones.z + 1.7],
    cam: [SITE.stones.x - 5, streamAt(SITE.stones.x, SITE.stones.z).y + 2.0, SITE.stones.z - 0.9],
  },
  // 院中偏东：石桌南、投壶东，隔着竹篱望伊水（原先站在柴门外）
  { gua: '泰', label: '开春', at: [6.9, 15.1], look: far(25, 500), when: (c) => c.season === 'spring' && between(c.hour, 6, 12) && clear(c) },
  // 站到荒地西北角外（原先隔着两畦、五十米外看）：秋天是一行行的麦茬
  { gua: '否', label: '秋深', at: [71.2, 141.6], look: [92, 0, 151], when: (c) => c.season === 'autumn' && c.hour > 15 && c.night < 0.6 },
  // 村塾外：挪到村塾跟前（原先在二十米外的酒家门口，槐树挡着）
  // 夜里（天黑透、灯点着）：村塾前排矮桌上那一盏灯（原先黄昏点灯就算，天还亮着，塾里也没有灯）
  { gua: '同人', label: '灯火', at: [95, 9.2], look: [97.5, 0, 3.6], when: (c) => lamp(c) && c.night > 0.5 },
  // 田间路东那一畦晚收的麦，黄熟着；站在地头，看进麦里、往上看天（原先隔着几畦、六十米外看井田西南那一块）
  { gua: '大有', label: '秋收', at: [23.2, (LATE.z0 + LATE.z1) / 2 - 0.4], look: mid(LATE, 2.4), when: (c) => c.season === 'autumn' && day(c) && dry(c) },
  // 药圃西边那座低冈，站在冈顶朝东南望：脚前冈坡的一道边缓缓落下去，药圃、田、柳、远处的水平平地铺开，什么都不显眼，山远远地伏在天边
  // （原先朝北：冈只有两米多，越不过竹梢，画里是平地与一堵竹林，又与「艮」那一张差不多）
  {
    gua: '谦', label: '低冈', at: [MOUND.x - 0.5, MOUND.z - 1.7], look: [MOUND.x + 13, 0, MOUND.z + 32.5],
    cam: [MOUND.x - 2.5, terrainY(MOUND.x - 0.5, MOUND.z - 1.7) + 2.35, MOUND.z - 6.0],
  },
  // 黄昏或夜间（12 点后）：天黑透了直到子夜也有（原先夜深了九成就没有了）
  { gua: '随', label: '向晚', at: [0, 4.4], look: [0, HALL_Y + 1.3, 0], when: (c) => c.dusk > 0.25 || (c.night > 0.2 && c.hour > 12) },
  // 修着的木桥北岸看过去（溪改道以后桥在 (128, 44) 一带）
  { gua: '蛊', label: '修桥', at: [SITE.plank.x - 3, streamZ(SITE.plank.x - 3) - 5.4], look: [SITE.plank.x, 0, SITE.plank.z], when: (c) => day(c) && c.rain < 0.5 },
  // 池北岸叠石后头，镜头从岸上高处俯下去：脚前一层层叠石落到水边，再下去是近岸的水面（原先在东岸平视，柳干、芦苇横在当中）
  { gua: '临', label: '池岸', at: [P.x + 1.6, P.z - 7.6], look: [P.x + 0.2, P.y - 0.1, P.z - 3.3], cam: [P.x + 2.7, P.y + 3.9, P.z - 10.5] },
  { gua: '观', label: '原上风', at: [-70.6, 93], look: far(-50, 60), when: day },
  // 院中，仰天：站到院子当中（原先在草堂门里，镜头退到墙里去了）。站定时南边远山上打一个闪（env/atmos.ts 的 strike）
  {
    gua: '噬嗑', label: '雷电', at: [0.6, 9.6], look: far(0, 650), when: (c) => c.season === 'summer' && c.rain > 0.6,
    tick: (k, _dt, h) => { if (!h.n) h.n = 3.05; if (h.t >= h.n) { k.atmos.strike((Math.random() - 0.5) * 34); h.n = h.t + 5.5 + Math.random() * 3.5; } },
  },
  { gua: '贲', label: '夕照', at: [SITE.bridge.x, SITE.bridge.z + 1.2], look: far(-90, 320), when: (c) => c.dusk > 0.35 && clear(c) },
  // 退开几步看整株槐：冠底离地四米多（树冠秋天疏了，枝子露出来；树下一层落叶）
  { gua: '剥', label: '落叶', at: [96.0, 17.6], look: [SITE.elm.x, 11.4, SITE.elm.z], when: (c) => c.season === 'autumn' },
  { gua: '复', label: '闭关', at: [-1.1, 14.4], look: [0, YARD_Y + 1.4, SITE.gate.z + 0.3], when: (c) => c.season === 'winter' && between(c.hour, 22.5, 1.5) },
  { gua: '无妄', label: '时雨', at: [22, 78], look: mid(plot('veg')), when: (c) => c.season === 'spring' && day(c) && c.rain > 0.5 },
  { gua: '颐', label: '灶屋', at: [SITE.wing.x - SITE.wing.w / 2 - 1.2, SITE.wing.z], look: [SITE.wing.x, YARD_Y + 1.5, SITE.wing.z], when: (c) => between(c.hour, 11, 13) },
  // 塘边老柳：门前塘东南岸水线上那一株，干朝池心斜出去，冠探在水面上（site.ts 的 TREES 里带 lean 的那一株）；站在它东北，侧着看它斜
  { gua: '大过', label: '卧柳', at: [-0.6, 29.4], look: [-6.6, P.y + 1.7, 33.4] },
  // 石桥上往西看溪（溪改道以后石桥在村南，溪在这里东西向）
  { gua: '坎', label: '溪声', at: [SITE.bridge.x - 0.3, SITE.bridge.z - 0.6], look: [-30, streamAt(-30, streamZ(-30)).y, streamZ(-30)] },
  // 文档写「屋内窗边，看窗内火光」：屋里看不见窗里的火光，仍站在院里西窗前看；入夜＝点灯以后到亥时（22 点）
  { gua: '离', label: '窗灯', at: [-3.2, 6.6], look: [-3.2, YARD_Y + 1.6, 2.7], when: (c) => lamp(c) && c.night > 0.35 && c.hour > 12 && c.hour < 22 },
  // 池西岸低处，朝东北：池子落在北岸一溜叠石、坡地的怀里，坡上去是院子、草堂、观物亭那道冈、邙山（山上有一汪泽）；东南岸那株卧柳让到画的右边
  { gua: '咸', label: '山上之泽', at: [P.x - P.rx - 1.6, P.z + 0.6], look: [P.x + 3.6, P.y + 2.6, P.z - 8.2] },
  // 站在双松以西九米望过去（原先站在松下，镜头退进松针与梅枝里）
  { gua: '恒', label: '双松', at: [3.5, 12.2], look: [(SITE.pines[0].x + SITE.pines[1].x) / 2, YARD_Y + 3, (SITE.pines[0].z + SITE.pines[1].z) / 2] },
  // 院门外，远望北山：出了柴门回身朝北，山在草堂、竹林后头，天在山上（原先站在门里朝南看）
  { gua: '遁', label: '门外山', at: [1.6, 20.6], look: far(180, 480) },
  // 东北方向：朝东北的绝壁与大瀑（先天震位）上的雷云（原先朝西南）
  { gua: '大壮', label: '春雷', at: [-42, streamZ(-42) - 6.5], look: far(135, 700), when: (c) => c.season === 'spring' && c.rain > 0.5 },
  // 东望东峰那道缺（日头从缺旁边出来）；站处往北挪到院东篱外，茶亭边那株老柳让到画边（原先正对着柳冠）
  { gua: '晋', label: '日出', at: [16.6, 15.4], look: far(93, 150), when: (c) => c.dawn > 0.4 && clear(c) },
  { gua: '明夷', label: '日入', at: [-34, 37.4], look: far(-90, 90), when: (c) => c.hour > 12 && c.night > 0.3 && c.night < 0.95 },
  { gua: '家人', label: '炊烟', at: [5.6, 8.4], look: [SITE.wing.x, YARD_Y + 5.6, SITE.wing.z], when: (c) => c.dawn > 0.2 || c.dusk > 0.2 || between(c.hour, 11, 12.6) },
  // 池东岸朝西：日头落在池后，霞在天边，池面一片暖色（塘挪到柴门前以后；原先镜头卡在亭子里）
  { gua: '睽', label: '池上霞', at: [P.x + P.rx + 1.1, P.z - 0.4], look: [P.x - 2, P.y + 0.5, P.z + 0.4], when: (c) => c.dusk > 0.4 && clear(c) },
  // 园口，往西看：站在桃林土路的尽头，往西是一段乱石路（石板歪缺、倒树横在路上），直到一座小石崖脚下，崖上一线泉挂下来；
  // 再远是西口北峡的飞泉（env/trail.ts）。看的是泉落处。崖近，雾里雨里雪里都看得见，所以天气不论（文档：任意）
  // （原先站在园口东边四米，朝正西望：一片平地、西口的石门，山上没有水，路也是平的）
  { gua: '蹇', label: '山泉', at: [SITE.entry.x - 6.5, SITE.entry.z + 0.1], look: [-217.5, 10, 22.5], when: day },
  // 文档写「雨大于四成」，所见却是「雨刚停」：条件照文档；路边几处水洼映着天（下着雨的时候也映着，env/land.ts）
  { gua: '解', label: '雨后', at: [-98, 36.6], look: [-101.5, 0, 38.6], when: (c) => c.season === 'spring' && c.rain > 0.4 },
  { gua: '损', label: '伊阙', at: [SITE.ferry.x - 3, SITE.ferry.z - 3.2], look: [-362, 160, 2575], when: (c) => day(c) && c.mist < 0.5 && c.rain < 0.5 },
  { gua: '益', label: '麦风', at: [-13, 84], look: mid(plot('wheat', 1)), when: (c) => (c.season === 'spring' || c.season === 'summer') && day(c) && c.rain < 0.4 },
  // 远望西南：看得压低一些，地与天各半，西山上压着一带低低的墨云（原先抬头看一片白）
  { gua: '夬', label: '欲雨', at: [22, 132.4], look: far(-60, 260), when: (c) => c.mist > 0.4 || (c.rain > 0.08 && c.rain < 0.6) },
  { gua: '姤', label: '南风', at: [22, 141.4], look: far(0, 300), when: (c) => c.season === 'summer' && between(c.hour, 10, 14) && clear(c) },
  // 石桥东边的溪北岸看鸭（鸭在石桥以东那一段溪里）
  { gua: '萃', label: '群鸭', at: [7, streamZ(7) - 5], look: [16, streamAt(16, streamZ(16)).y, streamZ(16)], when: day },
  // 桑园北头（桑园随田挪到溪南以后）
  { gua: '升', label: '桑', at: [90, SITE.mulberry.z0 - 3.2], look: [92, 0, SITE.mulberry.z0 + 5.5], when: (c) => (c.season === 'spring' || c.season === 'summer') && day(c) },
  // 冬天池水落下去半尺多，岸边露出一圈泥、石头、枯叶（env/land.ts）；站在池南岸，低头看池底（北岸是叠石）
  { gua: '困', label: '涸池', at: [P.x - 1.5, P.z + P.rz + 1.3], look: [P.x - 0.5, P.y - 0.65, P.z - 0.5], when: (c) => c.season === 'winter' },
  { gua: '井', label: '井', at: [SITE.well.x, SITE.well.z + 1.9], look: [SITE.well.x, 0, SITE.well.z] },
  // 站在圭西（原先站在圭东，镜头退进灶屋西檐的茅草里）；午时前后日影才落在圭上
  { gua: '革', label: '圭表', at: [G.x - 1.25, G.z + 0.4], look: [G.x, YARD_Y + 0.25, G.z - 0.7], when: (c) => day(c) && clear(c) && between(c.hour, 11, 13) },
  // 酒家门边一座露天的灶，灶上一口三足的鼎，柴火在灶里，鼎里冒着热气（build/more.ts）
  {
    gua: '鼎', label: '酒家灶', at: [78.7, 17.2], look: (k) => anc(k, 'wineStove', 0.45) ?? new THREE.Vector3(80.9, 7.3, 19.2), when: (c) => c.night < 0.7,
    on: (k) => { const p = anc(k, 'wineStove', 0.62); if (!p || !k.fx) return; const w = k.fx.smoke(p, { size: 0.14, rise: 1.7, amount: 0.85, warm: 0.15 }); return () => w.dispose(); },
  },
  // 溪上游，远望瀑布：桃林西头溪的南岸，望西口北峡里那一线飞泉——溪水就从那里落下来（原先在村东望东北的大瀑）
  { gua: '震', label: '飞瀑', at: [-178, 4], look: [-410, 70, -150], when: day },
  // 园外北，远望北山：池西北正北是竹林，看不见山；挪到竹林西头，往北偏西望，几重山叠在一处（原先在池西北朝西北）
  { gua: '艮', label: '兼山', at: [-38, -16], look: far(-160, 430) },
  // 溪上游，望雁南飞：桃林西头溪南，朝南望天；站定时一行雁从头顶过去，斜斜地往西南去（life/fauna/sky.ts）
  {
    gua: '渐', label: '鸿雁', at: [-171, 13], look: far(-15, 520), when: (c) => c.season === 'autumn' && day(c),
    on: (k) => { (k.life as unknown as { fauna?: { sky?: { geeseAcross?(x: number, z: number, az: number): void } } } | null)?.fauna?.sky?.geeseAcross?.(-171, 13, -15); },
  },
  // 溪上游，远望：桃林里溪的南岸，顺着溪水往东南望（原先在渡口）
  { gua: '归妹', label: '泽上雷', at: [-165, 21], look: far(60, 320), when: (c) => c.rain > 0.5 },
  // （窝棚在田间路东 (25.2, 93.6)：站在它北边，别让草顶挡着）
  { gua: '丰', label: '日中', at: [22, 86], look: mid(plot('wheat', 1)), when: (c) => c.season === 'summer' && between(c.hour, 11, 13) && clear(c) },
  // 桃林路上往东看：路就在眼前，一个背着包袱的过路人在前面走，不停留（life/passer.ts；站定时他正走过）
  {
    gua: '旅', label: '行人', at: [-150, 37.6], look: [-127, 0, 39.3],
    on: (k, h) => { startTraveller(k, h.at[0], h.at[1], 13); },
  },
  { gua: '巽', label: '竹风', at: [-8.6, -25.3], look: [-10, 0, -33] },
  // 池西南岸，夜里朝东北看池面：风来，一圈圈的波纹散开（站定时池面上隔一会儿荡开一圈）
  {
    gua: '涣', label: '风来水面', at: [P.x - 7.0, P.z + 4.4], look: [P.x + 0.5, P.y, P.z - 0.4], when: (c) => c.night > 0.6 && clear(c),
    tick: (k, _dt, h) => { if (h.t < h.n) return; h.n = h.t + 0.7 + Math.random() * 0.9; const a = Math.random() * Math.PI * 2, q = Math.sqrt(Math.random()) * 0.75; k.land.ripple(P.x + Math.cos(a) * P.rx * q, P.z + Math.sin(a) * P.rz * q, 0.8 + 0.5 * Math.random()); },
  },
  { gua: '节', label: '荷塘', at: [P.x, P.z + P.rz + 1.2], look: [P.x, P.y, P.z], when: (c) => c.season === 'summer' },
  // 渡口：站在晒网架西边，朝西边岸上看，白鹭站在水边（原先朝东看，鹭在背后）
  { gua: '中孚', label: '鹭', at: [SITE.ferry.x - 1.4, SITE.ferry.z + 1.2], look: [EGRET[0], RIVER_Y + 0.45, EGRET[1]], when: (c) => day(c) && c.rain < 0.5 },
  // 看梅枝上的雀子（雀在哪看哪；不在就看它们常落的那一枝）
  { gua: '小过', label: '雀', at: [7.5, 12.3], look: (k) => npc('sparrows', 0.06)(k) ?? new THREE.Vector3(PLUM_PERCH.x, PLUM_PERCH.y + 0.1, PLUM_PERCH.z), when: day },
  // 站在栈桥头，低头看水：夕照落在西南的河面上一片金红，渡船就泊在身边（原先站在岸上，晒网架挡在当中）
  { gua: '未济', label: '渡口夕照', at: [134.3, 231.6], look: far(-58, 24), when: (c) => c.dusk > 0.35 && clear(c) },
];

/** 离 (x, z) 最近的能站的地方（一圈一圈往外找） */
function nearStand(x: number, z: number): [number, number] | null {
  if (standable(x, z) != null) return [x, z];
  for (let r = 0.25; r <= 2.6; r += 0.25) for (let a = 0; a < 12; a++) { const px = x + Math.cos((a / 12) * Math.PI * 2) * r, pz = z + Math.sin((a / 12) * Math.PI * 2) * r; if (standable(px, pz) != null) return [px, pz]; }
  return null;
}

/** 此刻的天时 */
const condOf = (k: Anlewo): Cond => { const a = k.atmos; return { hour: a.hour, night: a.night, dawn: a.dawn, dusk: a.dusk, lamp: a.lamp, season: k.season, rain: a.w.rain, snow: a.w.snow, mist: a.w.mist, k }; };

// —— 机位：别叫树干、树冠、坡、屋檐挡着 ——
/**
 * 各种树挡视线的那一团（都乘树的 s）：[冠心离地多高, 冠的横半径, 竖半径, 干到多高]。照草木那边的长法估的（env/flora/*.ts 的 H、cy、rx、ry），
 * 只要个大概：冠只算里头七成密的那一团，干放宽两分。竹是一丛竿，当作一根高而细的冠。
 */
const CROWN: Record<string, readonly [number, number, number, number]> = {
  peach: [2.5, 2.4, 1.3, 1.2], willow: [5.0, 4.0, 3.4, 3.2], pine: [6.4, 3.6, 2.6, 4.2], plum: [2.4, 2.0, 1.2, 1.3], mulberry: [2.2, 1.6, 1.0, 1.1],
  elm: [6.0, 5.6, 2.8, 2.4], wood: [5.6, 3.0, 2.6, 2.8], bamboo: [4.6, 1.5, 4.6, 0],
  jujube: [4.5, 2.3, 2.2, 2.0], persimmon: [4.3, 3.0, 2.2, 1.7], apricot: [2.6, 2.8, 1.5, 1.3], pomegranate: [2.2, 1.6, 1.3, 0.6], toona: [6.6, 2.3, 2.5, 3.6], gleditsia: [6.4, 4.3, 2.8, 2.6], firmiana: [6.3, 2.9, 2.3, 3.0],
};
interface Blob { x: number; z: number; y: number; cy: number; rx: number; ry: number; th: number; tr: number }
let BLOBS: Blob[] | null = null;
/** 总图上的树、草木自己添的果树与老柳，各估成一团（头一回站定时算一次） */
function blobs(): Blob[] {
  if (BLOBS) return BLOBS;
  const list: Array<{ kind: string; x: number; z: number; s: number; r: number }> = [...TREES];
  try { list.push(...siteExtras().trees); } catch { /* 没有就只算总图上的 */ }
  BLOBS = list.map((t) => {
    const c = CROWN[t.kind] ?? CROWN.wood, gy = ground(t.x, t.z), bam = t.kind === 'bamboo';
    // 卧柳的冠探到水面上：冠心挪到斜出去的那一边
    const lean = (t as { lean?: number }).lean ?? 0, wx = lean ? (P.x - t.x) / Math.hypot(P.x - t.x, P.z - t.z) : 0, wz = lean ? (P.z - t.z) / Math.hypot(P.x - t.x, P.z - t.z) : 0;
    return { x: t.x + wx * 4.6, z: t.z + wz * 4.6, y: gy, cy: gy + c[0] * t.s * (lean ? 0.85 : 1), rx: c[1] * t.s * (lean ? 1.15 : 1), ry: c[2] * t.s, th: bam ? gy : gy + c[3] * t.s, tr: bam || lean ? 0 : t.r * t.s };
  });
  return BLOBS;
}
/** 看的就是这一棵（冠、干把看的那一点罩住了）：这一棵不算挡 */
function skipFor(p: THREE.Vector3): Set<Blob> {
  const s = new Set<Blob>();
  for (const o of blobs()) {
    const dx = (p.x - o.x) / (o.rx + 1), dy = (p.y - o.cy) / (o.ry + 1), dz = (p.z - o.z) / (o.rx + 1);
    if (dx * dx + dy * dy + dz * dz < 1 || (Math.hypot(p.x - o.x, p.z - o.z) < o.tr + 1.2 && p.y < o.th + 1)) s.add(o);
  }
  return s;
}
/** 树：a → b 这条线头一回碰上哪一团，返回碰上在几成处（没碰上是 1） */
function treeHit(a: THREE.Vector3, b: THREE.Vector3, skip: Set<Blob>): number {
  let best = 1;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  for (const o of blobs()) {
    if (skip.has(o)) continue;
    const m = Math.max(o.rx, o.tr) + 0.3;
    if (o.x < x0 - m || o.x > x1 + m || o.z < z0 - m || o.z > z1 + m) continue;
    // 干：平面上离线最近的那一处落在干里、那里的视线又低过干顶
    if (o.tr > 0) {
      const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / l2)) : 0;
      const ex = a.x + dx * t - o.x, ez = a.z + dz * t - o.z, R = o.tr + 0.22;
      if (ex * ex + ez * ez < R * R && a.y + dy * t < o.th && t < best) best = t;
    }
    // 冠：缩到七成的椭球
    const sx = 1 / (o.rx * 0.72), sy = 1 / (o.ry * 0.72);
    const px = (a.x - o.x) * sx, py = (a.y - o.cy) * sy, pz = (a.z - o.z) * sx, qx = dx * sx, qy = dy * sy, qz = dz * sx;
    const A = qx * qx + qy * qy + qz * qz, B = 2 * (px * qx + py * qy + pz * qz), C = px * px + py * py + pz * pz - 1;
    if (C < 0) return 0;
    const disc = B * B - 4 * A * C;
    if (disc < 0 || A < 1e-12) continue;
    const t1 = (-B - Math.sqrt(disc)) / (2 * A);
    if (t1 >= 0 && t1 <= 1 && t1 < best) best = t1;
  }
  return best;
}
/** 地：视线一段段比下去，低过地面（坡、岸）就算挡 */
function groundHit(a: THREE.Vector3, b: THREE.Vector3): number {
  const n = Math.max(6, Math.ceil(a.distanceTo(b) / 1.1));
  for (let i = 1; i < n; i++) { const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (a.y + (b.y - a.y) * t < terrainY(x, z) + 0.12) return t; }
  return 1;
}
/** 屋舍：拿视线去碰看得见的网格（两面都算：屋檐底下是背面）。点上去的笔（瓶花）、后画的那一层不算 */
const rc = new THREE.Raycaster(), _d = new THREE.Vector3();
let MESHES: THREE.Mesh[] = [];
function buildHit(a: THREE.Vector3, b: THREE.Vector3): number {
  _d.subVectors(b, a);
  const L = _d.length();
  if (L < 1e-3 || !MESHES.length) return 1;
  rc.set(a, _d.multiplyScalar(1 / L)); rc.near = 0; rc.far = L;
  let best = 1;
  for (const m of MESHES) {
    const mat = m.material as THREE.Material, side = mat.side;
    mat.side = THREE.DoubleSide;
    const h = rc.intersectObject(m, false);
    mat.side = side;
    if (h.length && h[0].distance / L < best) best = h[0].distance / L;
  }
  return best;
}
/**
 * 镜头钻在哪一处屋檐、亭顶底下没有（屋舍报上来的檐口：在那一块里、又低过檐口）；
 * 或者就杵在一件东西里头（晒网架、墙、棚：报上来的占地里，那东西又比镜头高或不知道多高）
 */
type Foot = { x: number; z: number; hw: number; hd: number; c: number; s: number; r: number; top: number };
let EAVES: Foot[] | null = null, SOLIDS: Foot[] | null = null;
function wedged(k: Anlewo, p: THREE.Vector3): boolean {
  if (!EAVES || !SOLIDS) {
    const sol = (k.build?.group.userData.solids ?? []) as Array<{ id: string; kind: string; x: number; z: number; w?: number; d?: number; r?: number; yaw?: number; top?: number; roof?: number; walk?: boolean }>;
    const foot = (s: (typeof sol)[number], pad: number, top: number): Foot => ({ x: s.x, z: s.z, hw: (s.w ?? 0) / 2 + pad, hd: (s.d ?? 0) / 2 + pad, c: Math.cos(s.yaw ?? 0), s: Math.sin(s.yaw ?? 0), r: s.kind === 'disc' ? (s.r ?? 0.2) + pad : 0, top });
    EAVES = sol.filter((s) => s.kind === 'rect' && (/檐/.test(s.id) || s.roof != null) && (s.top ?? s.roof) != null).map((s) => foot(s, 0.35, (s.top ?? s.roof)! + 0.7));
    SOLIDS = sol.filter((s) => !s.walk && !/檐/.test(s.id)).map((s) => foot(s, 0.3, s.top ?? 1e9));
  }
  for (const e of EAVES) { const dx = p.x - e.x, dz = p.z - e.z, lx = dx * e.c - dz * e.s, lz = dx * e.s + dz * e.c; if (Math.abs(lx) < e.hw && Math.abs(lz) < e.hd && p.y < e.top) return true; }
  for (const e of SOLIDS) {
    if (p.y > e.top + 0.5) continue;
    const dx = p.x - e.x, dz = p.z - e.z;
    if (e.r > 0 ? dx * dx + dz * dz < e.r * e.r : Math.abs(dx * e.c - dz * e.s) < e.hw && Math.abs(dx * e.s + dz * e.c) < e.hd) return true;
  }
  return false;
}
/** 右后、左后、再收近、抬高：退几成、偏几米、抬几米 */
const TRIES: Array<[number, number, number]> = [[1.7, 1, 0], [-1.7, 1, 0], [1.3, 0.72, 0.15], [-1.3, 0.72, 0.15], [1.0, 0.5, 0.4], [-1.0, 0.5, 0.4], [0.55, 0.33, 0.7], [-0.55, 0.33, 0.7]];
/**
 * 找一个看得清的机位：照 TRIES 依次试，头一处看得见人（胸口）、也看得见他看的东西的就用它；都不全清就取挡得最远、最少的那一处。
 * 近处的东西：视线到那一点前半米为止，看的那棵树本身不算挡。远处（天、山）：顺着视线量四十米，左右再各偏十度量两条（只量树、地）。
 */
function frame(k: Anlewo, st: [number, number], gy: number, dir: THREE.Vector3, right: THREE.Vector3, target: THREE.Vector3, farView: boolean): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const back = farView ? 5.2 : 3.6, h0 = farView ? 2.1 : 2.3, dist = Math.hypot(target.x - st[0], target.z - st[1]);
  const look = farView ? new THREE.Vector3(st[0], gy + 1.75, st[1]).addScaledVector(dir, 16).setY(gy + 1.75 + Math.min(7, (target.y - gy) * (16 / dist))) : target.clone();
  const chest = new THREE.Vector3(st[0], gy + 1.3, st[1]);
  MESHES = [];
  k.build?.group.traverseVisible((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.layers.isEnabled(0) && !(m.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) MESHES.push(m); });
  const skip = farView ? new Set<Blob>() : skipFor(target);
  const pos = new THREE.Vector3(), end = new THREE.Vector3(), v = new THREE.Vector3(), aside = new THREE.Vector3();
  let best: THREE.Vector3 | null = null, bestScore = -1;
  for (const [side, mul, lift] of TRIES) {
    pos.set(st[0], gy + h0 + lift, st[1]).addScaledVector(dir, -back * mul).addScaledVector(right, side);
    pos.y = Math.max(pos.y, terrainY(pos.x, pos.z) + 0.8);
    // 钻在屋檐、亭顶底下的、杵在架子墙棚里头的不要（画面上半截全是檐底，或几根竿子横在眼前）
    if (wedged(k, pos)) continue;
    // 看的那一条（远的顺着视线量四十米，近的到那一点前半米）；再往上偏十来度量一条，量画面上半截有没有檐、顶压着
    let see = 1;
    if (farView) {
      v.subVectors(look, pos).normalize();
      for (const yaw of [0, 0.18, -0.18]) {
        aside.copy(v).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        end.copy(pos).addScaledVector(aside, 40);
        see = Math.min(see, treeHit(pos, end, skip), groundHit(pos, end));
        if (see < 0.999) break;
      }
      if (see >= 0.999) see = Math.min(see, buildHit(pos, end.copy(pos).addScaledVector(v, 40)));
      if (see >= 0.999) { aside.copy(v).setY(v.y + 0.22).normalize(); see = Math.min(see, buildHit(pos, end.copy(pos).addScaledVector(aside, 30))); }
    } else {
      const L = pos.distanceTo(target);
      end.copy(pos).lerp(target, Math.max(0, (L - 0.6) / L));
      see = Math.min(treeHit(pos, end, skip), groundHit(pos, end));
      if (see >= 0.999) see = Math.min(see, buildHit(pos, end));
      if (see >= 0.999) { v.subVectors(target, pos).normalize(); v.y += 0.22; v.normalize(); see = Math.min(see, buildHit(pos, end.copy(pos).addScaledVector(v, Math.min(12, L)))); }
    }
    // 看人的那一条（看得见他胸口）
    let man = Math.min(treeHit(pos, chest, new Set()), groundHit(pos, chest));
    if (man >= 0.999) man = Math.min(man, buildHit(pos, chest));
    if (see >= 0.999 && man >= 0.999) return { pos: pos.clone(), look };
    const score = 2 * see + man - 0.02 * TRIES.findIndex((x) => x[0] === side && x[1] === mul);
    if (score > bestScore) { bestScore = score; best = pos.clone(); }
  }
  return { pos: best ?? pos.clone(), look };
}

/**
 * 在做事的时候显出来的那几卦：做什么事时显；when 是文档里写的时候（没写的，做那件事就显）。
 * 需：两份文档都写「夜间（灯火亮时）」——自斟到第三杯，又是点了灯以后，才显出来（做事的那一边问 inActNow）。
 */
export const IN_ACT: ReadonlyArray<{ gua: string; act: string; when?: (c: Cond) => boolean }> = [
  { gua: '既济', act: '煮茶' }, { gua: '豫', act: '抚琴' }, { gua: '需', act: '自斟', when: lamp }, { gua: '兑', act: '与客对坐' }, { gua: '大畜', act: '读书' },
];
export const IN_ACTS = IN_ACT.map((x) => x.gua);
/** 做事时的那一卦，此刻的时候对不对（不是做事时显的卦，一律是对的） */
export function inActNow(k: Anlewo, gua: string): boolean {
  const e = IN_ACT.find((x) => x.gua === gua);
  return !e?.when || e.when(condOf(k));
}
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
  let t = 0, undo: (() => void) | void;
  const hereNow: Here = { t: 0, n: 0, at: st, target, data: {} };
  const act: Act & { on(): boolean } = {
    id: `xiang:${d.gua}`, name: d.label,
    anchor: new THREE.Vector3(st[0] + Math.sin(yaw) * 0.9, gy + 1.9, st[1] + Math.cos(yaw) * 0.9),
    spot: { x: st[0], z: st[1], yaw },
    radius: d.radius ?? 2.4,
    state: {},
    on: () => (d.when ? d.when(condOf(k)) : true),
    enter() {
      t = 0; hereNow.t = 0; hereNow.n = 0; hereNow.data = {};
      // 先添上这一处的事（来的人坐好了，看的那一点才对得准）
      try { undo = d.on?.(k, hereNow); } catch (e) { console.warn(`观象「${d.label}」添景出错`, e); undo = undefined; }
      const av = k.player.av;
      aim();
      av.setHands('sleeve'); av.lookAt(target);
      // 看的方向按此刻那一点重算（看人的那几卦，人会走动）
      const y2 = Math.atan2(target.x - st[0], target.z - st[1]), dir = new THREE.Vector3(Math.sin(y2), 0, Math.cos(y2)), right = new THREE.Vector3(-dir.z, 0, dir.x);
      const dist = Math.hypot(target.x - st[0], target.z - st[1]);
      // 机位：退到人的侧后方，人在画面一角，他看的东西在画面当中；挡着就换一处（frame）
      const f = d.cam ? { pos: new THREE.Vector3(...d.cam), look: target.clone() } : frame(k, st, gy, dir, right, target, dist > 30);
      k.nav.setPose({ pos: f.pos, look: f.look, fov: 40, yaw: 26, up: 16, down: 8 });
      act.state = { kind: 'xiang', title: d.label, hint: '站定，看一会儿', found: k.found.has(d.gua), progress: 0 };
      k.emitAct();
    },
    exit() { k.player.av.lookAt(null); try { undo?.(); } catch (e) { console.warn(`观象「${d.label}」收拾出错`, e); } undo = undefined; },
    update(dt) {
      hereNow.t += dt;
      if (d.tick) { try { d.tick(k, dt, hereNow); } catch (e) { console.warn(`观象「${d.label}」出错`, e); } }
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
/** 这张表本身：站在哪、什么时候有（测试拿文档里的触发条件来对；look 是函数的给 null） */
export const XIANG_DEFS: ReadonlyArray<{ gua: string; label: string; at: [number, number]; look: [number, number, number] | null; when?: (c: Cond) => boolean }> =
  DEFS.map((d) => ({ gua: d.gua, label: d.label, at: d.at, look: Array.isArray(d.look) ? d.look : null, when: d.when }));
export type { Cond as XiangCond };
