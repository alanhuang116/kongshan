/**
 * 全村的名册：谁、叫什么、怎么称呼先生、做什么的、多大、住哪家、家里有谁、什么脾气、喜欢什么、一天怎么过。
 *
 * 这一份同时是村里人「真的怎么过日子」的出处：src/world/life/ 里每个人的日程就是照着 plan 走的
 * （plan 里每一步的 act 是那件事在 people.ts / villagers.ts 里的名字；没有 act 的那一步是人在家里或不在村里）。
 * 所以改一个人的日子，改这里就行；要添一件新的事，这里写上 act，那边写上那段脚本——两处一起改（见 docs/LIFE.md）。
 *
 * 人与人之间临时的事（货郎来了孩子们跑去看、路上碰见了停下说两句、给老人端茶、木匠递板）不写在 plan 里，
 * 是那边的脚本自己看着办的；plan 只说「这个钟点他该在哪、做什么」。
 *
 * 钟点是 0–24 的小时。各季的日出日落：春 6.0–18.2，夏 5.1–19.1，秋 6.3–17.5，冬 7.0–17.0（与 env/atmos.ts 一致）。
 * 「雨雪天」（wet）是雨或雪下到五成以上。名字、称呼、活计都按北宋洛阳一带乡间；话里不占卜、不断吉凶。
 */
import type { Season } from '../world/env/atmos';

export interface FolkPlanStep {
  /** 从几点到几点（含 from，不含 to） */
  from: number; to: number;
  /** 在哪（人话，如「甲家门前」「井田当中那一畦」） */
  where: string;
  /** 在做什么（人话，如「扶犁耕地」「睡下了」） */
  doing: string;
  /** 只在这几季（不给就是四季） */
  seasons?: Season[];
  /** 只在晴天 / 只在雨雪天（不给就是都这样） */
  weather?: 'fair' | 'wet';
  /** 这一步在代码里是哪件事（people.ts / villagers.ts 里那段脚本的名字）；不给就是在家里、或不在村里 */
  act?: string;
}
export interface FolkDef {
  id: string;
  /** 名字（村里人怎么叫他） */
  name: string;
  /** 他怎么称呼先生 */
  call: string;
  /** 身份、活计 */
  role: string;
  age: number;
  sex: 'm' | 'f';
  /** 住哪家：SITE.houses 的 id（a 甲·王家、b 乙·李家、d 丁·赵家、e 戊·孙家酒家、f 己·陈篾匠家、g 庚·陶家），或「村外」「渔船」 */
  home: string;
  /** 家里有谁（别人的 id） */
  family?: string[];
  /** 脾气，一句话 */
  temper: string;
  /** 喜欢什么（送礼用）：bag.ts 里 ITEMS 的 id，或几个字 */
  likes: string[];
  /** 一天的日程（四季、晴雨分开写；夜里睡觉也写上） */
  plan: FolkPlanStep[];
}

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
/** 日出、日落（与 env/atmos.ts 那张表一致） */
export const SUN: Record<Season, [number, number]> = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] };

// —— 写日程用的小办法 ——
/** 一行：[从, 到, 在哪, 做什么, 事的名字?] */
type Row = [number, number, string, string, string?];
type Rows = (sr: number, ss: number, s: Season) => Array<Row | null | false>;
const r2 = (h: number) => Math.round(Math.max(0, Math.min(24, h)) * 100) / 100;
/**
 * 按季节各写一份：fair 是晴天的，wet 是雨雪天的（不给就是晴雨一样）。
 * 每一季里的各行按钟点排；行与行之间的空当、一天的头尾自动补成「在家」（doing 用 home 给的话）。
 */
function days(o: { fair: Rows; wet?: Rows; home?: string; homeDoing?: (h: number, s: Season) => string; only?: Season[] }): FolkPlanStep[] {
  const out: FolkPlanStep[] = [];
  for (const s of o.only ?? SEASONS) {
    const [sr, ss] = SUN[s];
    for (const [w, fn] of [['fair', o.fair], ['wet', o.wet]] as Array<['fair' | 'wet', Rows | undefined]>) {
      if (w === 'wet' && !fn) continue;
      const rows = (fn!(sr, ss, s).filter(Boolean) as Row[]).map(([a, b, where, doing, act]) => [r2(a), r2(b), where, doing, act] as Row).filter((x) => x[1] > x[0]).sort((p, q) => p[0] - q[0]);
      const weather = o.wet ? w : undefined;
      let t = 0;
      // 空当在这几个钟点上切开，一段一段地说在家做什么（睡、起来吃饭、歇晌、点灯……），说法一样的再并起来
      const cuts = [sr - 0.6, sr - 0.2, sr, sr + 1.2, sr + 1.6, sr + 1.8, 8, 11, 13.6, ss - 1.5, ss - 1.4, ss + 0.4, ss + 1, 21, 22, ss + 3, ss + 3.2].map(r2);
      const gap = (a: number, b: number) => {
        if (b - a < 0.01) return;
        const at = [a, ...cuts.filter((x) => x > a + 0.01 && x < b - 0.01).sort((p, q) => p - q), b];
        for (let i = 0; i < at.length - 1; i++) {
          const mid = (at[i] + at[i + 1]) / 2, doing = o.homeDoing ? o.homeDoing(mid, s) : homeDoing(mid, sr, ss), last = out[out.length - 1];
          if (last && last.to === at[i] && !last.act && last.doing === doing && last.weather === weather && last.seasons?.[0] === s) last.to = at[i + 1];
          else out.push({ from: at[i], to: at[i + 1], where: o.home ?? '家里', doing, seasons: [s], weather });
        }
      };
      for (const [a, b, where, doing, act] of rows) {
        gap(t, a);
        out.push({ from: Math.max(a, t), to: b, where, doing, seasons: [s], weather, ...(act ? { act } : {}) });
        t = Math.max(t, b);
      }
      gap(t, 24);
    }
  }
  return out;
}
/** 在家的时候大致在做什么（按钟点） */
function homeDoing(h: number, sr: number, ss: number): string {
  if (h < sr - 0.6 || h >= ss + 3.2) return '睡下了';
  if (h < sr + 1.6) return '起来了，在家里吃早饭';
  if (h >= 11 && h < 13.6) return '在家吃午饭、歇晌';
  if (h >= ss - 1.4 && h < ss + 1) return '回家了，吃晚饭';
  if (h >= ss + 1) return '在家里，点着灯';
  return '在家里';
}

// —— 几处地名（plan 里的 where 用同一套说法） ——
const A = '甲家（王家）', B = '乙家（李家）', D = '丁家（赵家）', E = '戊家（孙家酒家）', F = '己家（陈篾匠家）', G = '庚家（陶家）';
const ELM = '槐树下', FIELD = '井田当中那一畦', REAP = '石桥南边王家那片麦', SCHOOL = '村塾', YARD = '晒场';
const STORY: Season[] = ['spring', 'summer', 'autumn'];
/** 说书的晚上（春夏秋的晴天）：日落后来，说一个多时辰。听的人各自收了工过来 */
const storyRow = (ss: number, s: Season, who = '在槐树下听韩翁说书'): Row | null => (STORY.includes(s) ? [ss + 0.8, ss + 2.2, ELM, s === 'summer' ? `${who}（夏夜，也是乘凉）` : who, 'listen'] : null);

export const FOLK: FolkDef[] = [
  // ———————————————————————— 甲家·王家（种田的） ————————————————————————
  {
    id: 'farmer', name: '王伯', call: '先生', role: '农夫（王家当家的，村里小辈都叫他王伯）', age: 47, sex: 'm', home: 'a', family: ['farmwife', 'picker', 'farmson', 'lunch', 'kid1'],
    temper: '话少，肯下死力气；一说起庄稼就停不住。', likes: ['wine', 'seedWheat', '旱地里的雨'],
    plan: days({
      home: A,
      fair: (sr, ss, s) => s === 'winter' ? [
        [9, 11.5, `${A}门前`, '坐在矮凳上磨锄、修农具', 'mend'],
        [13, 16, `${A}门前`, '坐在矮凳上磨锄、修农具', 'mend'],
      ] : [
        s === 'spring' ? [6.6, 11.5, FIELD, '扶犁跟着牛，一垄一垄地耕', 'plough'] : s === 'summer' ? [6.6, 11.5, REAP, '弯着腰割麦', 'reap'] : [6.6, 11.5, FIELD, '在场上抡连枷打谷', 'thresh'],
        [11.5, 13, s === 'summer' ? `${REAP}的地头` : `${FIELD}的田埂上`, '坐在田埂上歇晌，等家里送饭来', 'noon'],
        s === 'spring' ? [13, ss + 0.1, FIELD, '扶犁耕地', 'plough'] : s === 'summer' ? [13, ss + 0.1, REAP, '割麦', 'reap'] : [13, ss + 0.1, FIELD, '打谷', 'thresh'],
        storyRow(ss, s),
      ],
      wet: () => [
        [7, 11.5, `${A}檐下`, '坐在檐下搓草绳', 'rope'],
        [13, 17, `${A}檐下`, '坐在檐下搓草绳', 'rope'],
      ],
    }),
  },
  {
    id: 'farmwife', name: '王大娘', call: '先生', role: '农夫的老伴', age: 45, sex: 'f', home: 'a', family: ['farmer', 'picker', 'farmson', 'lunch', 'kid1', 'aunt'],
    temper: '嘴快心热，见了谁都要往人手里塞点吃的。', likes: ['thread', 'greens', 'egg'],
    plan: days({
      home: A,
      fair: (sr, ss, s) => [
        [sr - 0.1, sr + 0.7, `${A}门前`, '喂鸡、扫院子', 'feed'],
        s === 'spring' ? [8, 11.2, '路东的菜地', '蹲着锄草、间苗', 'weed'] : s === 'summer' ? [8, 11.2, REAP, '跟在后头拾麦穗', 'glean'] : s === 'autumn' ? [8.5, 11.2, YARD, '在晒场上翻晒谷子', 'sun'] : [9.5, 11.2, `${A}门前`, '晒着太阳纳鞋底', 'sew'],
        (s === 'spring' || s === 'autumn') ? [13.4, 15.8, `${A}门前`, '和来串门的妹子二姨说话', 'chat'] : null,
        s === 'spring' ? [15.8, ss - 1.3, '路东的菜地', '锄草、间苗', 'weed'] : s === 'summer' ? [13.4, ss - 1.4, REAP, '拾麦穗', 'glean'] : s === 'autumn' ? [15.8, ss - 1.2, YARD, '翻晒谷子', 'sun'] : [13.4, 15.6, `${A}门前`, '纳鞋底', 'sew'],
        storyRow(ss, s),
      ],
      wet: () => [],
      homeDoing: (h, s) => { const [sr, ss] = SUN[s]; return h < sr - 0.2 || h >= ss + 3 ? '睡下了' : h < sr + 1.8 ? '生火做早饭' : h >= 11 && h < 13.6 ? '做午饭' : h >= ss - 1.5 && h < ss + 1 ? '做晚饭' : h >= ss + 1 ? '在灯下纺线、缝补' : '在屋里纺线、缝补'; },
    }),
  },
  {
    id: 'farmson', name: '二郎', call: '先生', role: '农夫的小儿子，跟着爹下地', age: 15, sex: 'm', home: 'a', family: ['farmer', 'farmwife', 'picker', 'lunch', 'kid1'],
    temper: '憨，手脚勤快，见了先生有点腼腆。', likes: ['peach', 'fish', '一把好镰'],
    plan: days({
      home: A,
      fair: (sr, ss, s) => s === 'winter' ? [
        [sr + 0.2, sr + 1.2, '井边', '挑着担子去井上打水', 'water'],
        [9.5, 11.5, `${A}门前`, '劈柴、码柴', 'chop'],
        [13.5, 15.8, `${A}门前`, '劈柴、码柴', 'chop'],
      ] : [
        [sr - 0.2, sr + 0.9, '井边', '挑着担子去井上打水', 'water'],
        s === 'spring' ? [6.6, 11.5, FIELD, '跟在犁后头碎土', 'hoe'] : s === 'summer' ? [6.6, 11.5, REAP, '跟在爹后头捆麦、码麦个子', 'bind'] : [6.6, 11.5, FIELD, '在场上扬场', 'winnow'],
        [11.5, 13, s === 'summer' ? `${REAP}的地头` : `${FIELD}的田埂上`, '挨着爹坐着，等饭', 'noon'],
        s === 'spring' ? [13, ss + 0.1, FIELD, '碎土', 'hoe'] : s === 'summer' ? [13, ss + 0.1, REAP, '捆麦', 'bind'] : [13, ss + 0.1, FIELD, '扬场', 'winnow'],
        storyRow(ss, s),
      ],
      wet: () => [
        [7.5, 11.5, `${A}檐下`, '帮爹搓草绳', 'rope'],
        [13, 17, `${A}檐下`, '帮爹搓草绳', 'rope'],
      ],
    }),
  },
  {
    id: 'picker', name: '桂姐', call: '先生', role: '采桑女，王家的大女儿', age: 17, sex: 'f', home: 'a', family: ['farmer', 'farmwife', 'farmson', 'lunch', 'kid1'],
    temper: '利落，爱干净，不大说话，一笑就红脸。', likes: ['flower', 'thread'],
    plan: days({
      home: A,
      fair: (sr, ss, s) => (s === 'spring' || s === 'summer') ? [
        [7, 11.6, '桑园', '挎着篮子一株一株地采桑叶', 'pick'],
        [11.6, 13, '桑园的树荫下', '坐在桑树下歇晌', 'shade'],
        [13, ss - 0.7, '桑园', '采桑叶', 'pick'],
        storyRow(ss, s),
      ] : s === 'autumn' ? [
        [9, 11.4, YARD, '拿木耙翻晒谷子', 'sun'],
        [13.4, 16, YARD, '翻晒谷子', 'sun'],
        storyRow(ss, s),
      ] : [
        [9, 11.4, `${A}门前东头`, '坐着纺线', 'spin'],
        [13.4, 16, `${A}门前东头`, '纺线', 'spin'],
      ],
      wet: () => [],
      homeDoing: (h, s) => { const [sr, ss] = SUN[s]; return h < sr || h >= ss + 3 ? '睡下了' : h < 8 ? '梳头，帮娘做早饭' : h >= ss + 1 ? '在灯下理丝' : '在屋里理丝、纺线'; },
    }),
  },
  {
    id: 'lunch', name: '阿秀', call: '先生', role: '王家的小女儿，晌午给地里送饭', age: 13, sex: 'f', home: 'a', family: ['farmer', 'farmwife', 'farmson', 'picker', 'kid1'],
    temper: '机灵，嘴甜，走路一蹦一跳的。', likes: ['candy', 'flower', 'peach'],
    plan: days({
      home: A,
      fair: (sr, ss, s) => s === 'winter' ? [
        [9, 11, `${A}门前`, '扫院子', 'sweep'],
        [13.5, 15.6, `${A}门前`, '挨着娘学做针线', 'sew'],
      ] : [
        [8, 10.8, `${A}门前`, '扫院子、帮娘择菜', 'sweep'],
        [11, 13.2, s === 'summer' ? REAP : FIELD, '提着饭篮水罐给地里送饭', 'bring'],
        s === 'summer' ? [14, ss - 1.4, REAP, '跟着娘拾麦穗', 'glean'] : [14, ss - 1.4, `${A}门前`, '挨着娘学做针线', 'sew'],
        storyRow(ss, s),
      ],
      wet: () => [],
    }),
  },
  {
    id: 'kid1', name: '三郎', call: '先生', role: '王家的小儿子，在村塾念书', age: 8, sex: 'm', home: 'a', family: ['farmer', 'farmwife', 'farmson', 'picker', 'lunch'],
    temper: '爱问，什么都要问个为什么；天一黑就想看星星。', likes: ['candy', 'peach', '先生讲的星星'],
    plan: days({
      home: A,
      fair: (sr, ss) => [
        [7, 11, SCHOOL, '坐在席上摇头晃脑地念书', 'school'],
        [13, Math.min(17, ss - 0.4), '槐树南边的空地', '和伙伴们追着跑', 'play'],
        [Math.min(17, ss - 0.4), ss + 2.3, '石桥上', '趴在桥边看水，天黑了仰头看星星', 'bridge'],
      ],
      wet: () => [[7, 11, SCHOOL, '念书（下雨天书声最齐）', 'school']],
    }),
  },
  // ———————————————————————— 乙家·李家 ————————————————————————
  {
    id: 'elder', name: '李公', call: '先生', role: '村里最年长的老人', age: 73, sex: 'm', home: 'b', family: ['watchman', 'neighbor', 'washer', 'kid2'],
    temper: '慢性子，爱晒太阳，爱讲古；棋下得不好，悔棋。', likes: ['tea', 'wine', 'jujube'],
    plan: days({
      home: B,
      fair: (sr, ss, s) => [
        s === 'winter' ? [10, 11.6, ELM, '坐在石凳上拄着杖晒太阳、打盹', 'sit'] : [8, 11.6, ELM, '坐在石凳上拄着杖打盹、喝茶', 'sit'],
        [13.8, 14, ELM, '坐在石凳上喝茶', 'sit'],
        s === 'winter' ? [14, 15, ELM, '和赵老在槐树下对弈', 'go'] : [14, 17, ELM, '和赵老在槐树下对弈', 'go'],
        storyRow(ss, s, '坐在矮凳上，坐在最当中听韩翁说书'),
      ],
      wet: () => [],
    }),
  },
  {
    id: 'basketman', name: '陈篾匠', call: '先生', role: '篾匠（己家，住村西头，屋后不远就是竹林）', age: 44, sex: 'm', home: 'f', family: [],
    temper: '手巧话少，编东西时不爱人打扰，编完了却爱拿给人看。', likes: ['wine', '好竹子'],
    plan: days({
      home: F,
      fair: (sr, ss, s) => [
        [8, 11.5, `${F}门前`, '坐在小板凳上破篾、编筐，隔一阵起来晾篾片', 'basket'],
        [13.4, 17, `${F}门前`, '破篾、编筐', 'basket'],
        storyRow(ss, s),
      ],
      wet: () => [
        [8, 11.5, `${F}檐下`, '坐在檐下编小筐', 'basket'],
        [13.4, 17, `${F}檐下`, '坐在檐下编小筐', 'basket'],
      ],
    }),
  },
  {
    id: 'neighbor', name: '李二嫂', call: '先生', role: '邻家妇人（打更的李二的媳妇）', age: 40, sex: 'f', home: 'b', family: ['watchman', 'elder', 'washer', 'kid2'],
    temper: '热心，什么事都要张罗；隔一阵就给公公端碗茶。', likes: ['flower', 'thread', 'greens'],
    plan: days({
      home: B,
      fair: (sr, ss, s) => [
        [Math.max(6.4, sr + 0.4), 8, `${B}门前`, '端着簸箕喂鸡', 'feed'],
        [8, 11.4, `${B}门前`, '扫地；隔一阵给槐树下的公公端碗茶', 'sweep'],
        // 午后在东头披屋下的织机前织一阵布（织机是屋舍那边摆的，脚本见 life/people.ts 的 weave）
        [13.4, 16, `${B}东头披屋下`, '坐在织机前织布', 'weave'],
        [16, 17.4, `${B}门前`, '收拾；给公公端茶', 'sweep'],
        storyRow(ss, s),
      ],
      wet: () => [],
    }),
  },
  {
    id: 'washer', name: '小莲', call: '先生', role: '浣衣女（李二的女儿）', age: 16, sex: 'f', home: 'b', family: ['watchman', 'neighbor', 'elder', 'kid2'],
    temper: '爱笑，一边捶衣一边哼歌。', likes: ['flower', 'peach', 'thread'],
    plan: days({
      home: B,
      fair: (sr, ss, s) => [
        [s === 'winter' ? 8.4 : 7, 10, '洗衣埠', '跪在石板上捣衣、漂衣', 'wash'],
        (s === 'spring' || s === 'summer') ? [14, ss - 1, '桑园', '帮桂姐采桑叶', 'pick'] : s === 'autumn' ? [14, 16, YARD, '帮着翻晒谷子', 'sun'] : null,
        storyRow(ss, s),
      ],
      wet: () => [],
    }),
  },
  {
    id: 'kid2', name: '虎子', call: '先生', role: '李家的小孙子，在村塾念书', age: 9, sex: 'm', home: 'b', family: ['watchman', 'neighbor', 'elder', 'washer'],
    temper: '淘气，爬树掏鸟，跑得最快。', likes: ['candy', 'peach', 'persimmon'],
    plan: days({
      home: B,
      fair: (sr, ss, s) => [
        [7, 11, SCHOOL, '念书', 'school'],
        [13, Math.min(17, ss - 0.4), '槐树南边的空地', '追着伙伴跑', 'play'],
        storyRow(ss, s, '蹲在最前头听韩翁说书'),
      ],
      wet: () => [[7, 11, SCHOOL, '念书', 'school']],
    }),
  },
  // ———————————————————————— 丁家·赵家 ————————————————————————
  {
    id: 'elder2', name: '赵老', call: '先生', role: '老木匠，如今只下棋', age: 68, sex: 'm', home: 'd', family: ['carpenter1', 'teacher', 'weaver', 'kid3', 'swinger'],
    temper: '棋下得慢，输了也笑；看儿子干活总忍不住指点两句。', likes: ['tea', 'wine'],
    plan: days({
      home: D,
      fair: (sr, ss, s) => [
        [9, 11.5, '东头修桥的地方', '坐在岸上看儿子修桥，指点两句', 'oversee'],
        s === 'winter' ? [14, 15, ELM, '和李公对弈', 'go'] : [14, 17, ELM, '和李公对弈', 'go'],
        storyRow(ss, s),
      ],
      wet: () => [],
    }),
  },
  {
    id: 'carpenter1', name: '赵大', call: '先生', role: '木匠，正修着东头的木桥', age: 45, sex: 'm', home: 'd', family: ['elder2', 'teacher', 'weaver', 'kid3', 'swinger'],
    temper: '讲究，活儿不对宁可拆了重做。', likes: ['wine', '老榆木'],
    plan: days({
      home: D,
      fair: (sr, ss, s) => [
        [7.5, 11.7, '东头修着的木桥', '刨板、上桥钉板', 'work'],
        [11.7, 13, '木桥南头的岸上', '坐着歇晌', 'lunch'],
        [13, 17.4, '东头修着的木桥', '刨板、钉板', 'work'],
        storyRow(ss, s),
      ],
      wet: () => [
        [8, 11.5, `${D}檐下`, '在檐下刨木头、修家什', 'shed'],
        [13, 17, `${D}檐下`, '在檐下刨木头、修家什', 'shed'],
      ],
    }),
  },
  {
    id: 'carpenter2', name: '小乙', call: '先生', role: '木匠的徒弟（外村来的，跟着赵大学手艺，住在师傅家）', age: 19, sex: 'm', home: 'd', family: [],
    temper: '老实，力气大，师傅说一句他应一句。', likes: ['candy', 'wine'],
    plan: days({
      home: D,
      fair: (sr, ss, s) => [
        [7.5, 11.7, '东头修着的木桥', '从板垛扛板往桥上送', 'work'],
        [11.7, 13, '木桥南头的岸上', '坐着歇晌', 'lunch'],
        [13, 17.4, '东头修着的木桥', '扛板', 'work'],
        storyRow(ss, s, '站在后头听说书'),
      ],
      wet: () => [
        [8, 11.5, `${D}檐下`, '在檐下帮师傅扶着木料', 'shed'],
        [13, 17, `${D}檐下`, '帮师傅扶着木料', 'shed'],
      ],
    }),
  },
  {
    id: 'weaver', name: '赵大嫂', call: '先生', role: '织布的媳妇（赵大的妻子）', age: 41, sex: 'f', home: 'd', family: ['carpenter1', 'elder2', 'teacher', 'kid3', 'swinger'],
    temper: '安静，手不停；织机一响一整天。', likes: ['thread', 'flower'],
    plan: days({
      home: D,
      fair: (sr, ss, s) => [
        [sr + 0.3, sr + 1, `${D}门前`, '喂鹅、扫院子', 'feed'],
        [8, 11.4, `${D}檐下`, '坐在织机前织布', 'weave'],
        [13.4, ss - 0.8, `${D}檐下`, '织布', 'weave'],
        storyRow(ss, s),
      ],
      wet: () => [
        [8, 11.4, `${D}檐下`, '在檐下织布', 'weave'],
        [13.4, 17, `${D}檐下`, '织布', 'weave'],
      ],
    }),
  },
  {
    id: 'teacher', name: '赵先生', call: '先生', role: '村塾的塾师（赵老的小儿子）', age: 36, sex: 'm', home: 'd', family: ['elder2', 'carpenter1', 'weaver', 'kid3', 'swinger'],
    temper: '迂，好学，常拿着书来向先生请教。', likes: ['poem', 'tea', '书'],
    plan: days({
      home: D,
      fair: (sr, ss, s) => [
        [6.8, 11.2, SCHOOL, '坐在高桌后教孩子们念书', 'teach'],
        s !== 'winter' ? [14, 16.8, `${SCHOOL}前檐下`, '坐在檐下看书', 'read'] : null,
        s === 'winter' ? [17.6, 20.4, SCHOOL, '点着灯在塾里读书', 'night'] : [ss + 0.6, ss + 2.6, SCHOOL, '点着灯在塾里读书', 'night'],
      ],
      wet: (sr, ss) => [
        [6.8, 11.2, SCHOOL, '教书', 'teach'],
        [14, 16.6, SCHOOL, '坐在桌后批孩子们的字', 'night'],
        [ss + 0.4, ss + 2.4, SCHOOL, '点着灯读书', 'night'],
      ],
    }),
  },
  {
    id: 'kid3', name: '石头', call: '先生', role: '赵家的小孙子，在村塾念书', age: 7, sex: 'm', home: 'd', family: ['carpenter1', 'weaver', 'elder2', 'teacher', 'swinger'],
    temper: '蔫儿，不爱跑，爱蹲着看蚂蚁、看爷爷下棋。', likes: ['candy', 'jujube'],
    plan: days({
      home: D,
      fair: (sr, ss, s) => [
        [7, 11, SCHOOL, '念书（先生是他二叔）', 'school'],
        [13, 14, '槐树南边的空地', '蹲着看蚂蚁', 'play'],
        [14, s === 'winter' ? 15 : Math.min(17, ss - 0.4), ELM, '站在石桌边看爷爷下棋', 'watch'],
        storyRow(ss, s, '挨着娘听说书'),
      ],
      wet: () => [[7, 11, SCHOOL, '念书', 'school']],
    }),
  },
  {
    id: 'swinger', name: '杏儿', call: '先生', role: '赵家的小孙女', age: 6, sex: 'f', home: 'd', family: ['carpenter1', 'weaver', 'elder2', 'teacher', 'kid3'],
    temper: '胆小，爱跟着娘；坐上秋千就不肯下来。', likes: ['candy', 'flower', 'peach'],
    plan: days({
      home: D,
      fair: (sr, ss, s) => [
        [8.4, 11, `${D}檐下`, '坐在娘的织机旁看娘织布', 'by'],
        [11, 12.6, '村塾前的秋千', '坐在秋千上', 'swing'],
        [13.6, 15, `${D}檐下`, '挨着娘玩线团', 'by'],
        [15, Math.min(17.2, ss - 0.3), '村塾前的秋千', '坐在秋千上', 'swing'],
        storyRow(ss, s, '偎在娘怀里听说书'),
      ],
      wet: () => [[8.4, 11.4, `${D}檐下`, '挨着娘看织布', 'by'], [13.6, 16.6, `${D}檐下`, '挨着娘玩线团', 'by']],
    }),
  },
  // ———————————————————————— 戊家·孙家（酒家） ————————————————————————
  {
    id: 'keeper', name: '孙掌柜', call: '先生', role: '酒家掌柜', age: 52, sex: 'm', home: 'e', family: ['tofu', 'miller'],
    temper: '和气，会算账，好客；记账只记大数。', likes: ['fish', 'egg', '好米'],
    plan: days({
      home: E,
      fair: (sr, ss) => [[9.5, ss + 1.3, '酒家门口', '抹桌、筛酒、招呼客人', 'serve']],
      wet: (sr, ss) => [[9.5, ss + 0.6, '酒家门口檐下', '没有客，袖着手坐在门口看雨', 'idle']],
    }),
  },
  {
    id: 'tofu', name: '孙嫂', call: '先生', role: '做豆腐的（孙掌柜的妻子）', age: 48, sex: 'f', home: 'e', family: ['keeper', 'miller'],
    temper: '起得最早，说话爽利，豆腐点得嫩。', likes: ['bean', 'seedBean'],
    plan: days({
      home: E,
      fair: (sr, ss, s) => [
        [Math.max(4.6, sr - 1.2), sr + 1.2, `${E}门前`, '天不亮就推磨磨豆子', 'grind'],
        [8.5, 11, '村里各家门前', '挑着豆腐挨家去卖', 'sell'],
        [13.6, 16.4, '酒家门口', '坐在凳上拣豆子', 'beans'],
        storyRow(ss, s),
      ],
      wet: (sr) => [[Math.max(4.6, sr - 1.2), sr + 1.2, `${E}门前檐下`, '推磨磨豆子', 'grind']],
    }),
  },
  {
    id: 'miller', name: '柱子', call: '先生', role: '舂米人（孙家的儿子）', age: 23, sex: 'm', home: 'e', family: ['keeper', 'tofu'],
    temper: '一身力气，饭量大，见人就笑。', likes: ['wine', 'flour'],
    plan: days({
      home: E,
      fair: (sr, ss, s) => [
        [sr - 0.4, sr + 0.9, '井边', '挑水，给娘点豆腐、给酒家添水', 'water'],
        [8.2, 11.4, '水碓', '扛着谷袋往来于晒场与水碓，蹲在碓屋里照看', 'mill'],
        [13.4, 16.8, '水碓', '舂米', 'mill'],
        storyRow(ss, s),
      ],
      wet: () => [],
    }),
  },
  // ———————————————————————— 村外来的、过路的 ————————————————————————
  {
    id: 'fisher', name: '老许', call: '先生', role: '渔父（住在渡口的乌篷船上）', age: 61, sex: 'm', home: '渔船', family: [],
    temper: '不急不躁，鱼不咬钩就看云；与樵夫老刘最说得来。', likes: ['wine', 'tea'],
    plan: days({
      home: '渡口的船上',
      fair: (sr, ss) => [
        [sr - 0.2, 11.5, '渡口的船尾', '坐在船尾垂钓', 'fish'],
        [11.5, 13, '渡口的晒网架前', '站在网前补网', 'net'],
        [13, ss + 0.45, '渡口的船尾', '垂钓', 'fish'],
      ],
      wet: (sr, ss) => [[sr - 0.2, ss + 0.45, '渡口的船尾', '披着蓑衣照样垂钓', 'fish']],
      homeDoing: (h, s) => { const [sr, ss] = SUN[s]; return h >= ss + 0.4 && h < 22 ? '在篷里，船头挑着一盏渔灯' : h < sr - 0.2 || h >= 22 ? '在篷里睡下了' : '在篷里'; },
    }),
  },
  {
    id: 'woodcutter', name: '老刘', call: '先生', role: '樵夫（住在伊水南边的山里）', age: 50, sex: 'm', home: '村外', family: [],
    temper: '爽快，山里的路闭着眼也认得；砍枯枝，留活树。', likes: ['wine', 'fish'],
    plan: days({
      home: '南山里',
      fair: (sr, ss) => [[14, Math.min(17, ss - 0.3), '渡口东边的岸上', '挑柴来，放下担子，坐着和渔父说话', 'rest']],
      wet: () => [],
      homeDoing: (h) => (h < 5 || h > 21 ? '在山里的家中睡下了' : '在山里砍柴'),
    }),
  },
  {
    id: 'herdboy', name: '牛儿', call: '先生', role: '牧童（西边张家庄的）', age: 11, sex: 'm', home: '村外', family: [],
    temper: '野，爱吹笛；牛走到哪他就睡到哪。', likes: ['candy', 'peach', '一支新笛'],
    plan: days({
      home: '西边张家庄',
      fair: (sr, ss, s) => s === 'winter' ? [] : [[13.5, ss - 0.2, '溪南的草地', '横坐在水牛背上吹笛', 'herd']],
      wet: () => [],
      homeDoing: (h) => (h < 6 || h > 20.5 ? '在家睡下了' : '在庄上'),
    }),
  },
  {
    id: 'drinker', name: '钱三', call: '先生', role: '酒客（东边过来的脚夫）', age: 38, sex: 'm', home: '村外', family: [],
    temper: '豪爽，三碗下肚就爱唱两句。', likes: ['wine'],
    plan: days({
      home: '东边',
      fair: (sr, ss) => [[16.4, ss + 1.1, '酒家门口', '坐在凳上喝酒', 'drink']],
      wet: () => [],
      homeDoing: () => '不在村里',
    }),
  },
  {
    id: 'peddler', name: '吴四', call: '先生', role: '货郎（走村串巷的）', age: 35, sex: 'm', home: '村外', family: [],
    temper: '嘴甜，记性好，谁家要什么他都记得。', likes: ['tea', 'coin'],
    plan: days({
      home: '路上',
      fair: () => [[14.4, 16.6, '村路、茶亭', '挑着担摇着鼓过村，在茶亭歇脚', 'round']],
      wet: () => [],
      homeDoing: () => '在别的村子',
    }),
  },
  {
    id: 'guest', name: '郑先生', call: '先生', role: '客（城里来访的读书朋友）', age: 50, sex: 'm', home: '村外', family: [],
    temper: '清雅，好谈诗论易，一盏茶能坐一下午。', likes: ['tea', 'poem', 'wine'],
    plan: days({
      home: '洛阳城里',
      fair: () => [[15, 17, '院里石桌旁', '坐在石凳上喝茶说话', 'visit']],
      wet: () => [],
      homeDoing: () => '在城里',
    }),
  },
  // ———————————————————————— 后来添的几位 ————————————————————————
  {
    id: 'potter', name: '陶大', call: '先生', role: '陶工（庚家，住村东头的溪岸上，屋东南一座窑）', age: 50, sex: 'm', home: 'g', family: [],
    temper: '手稳话慢，一只罐拉得不圆宁可揉了重来；开窑那天谁来都给一只碗。', likes: ['wine', 'firewood', 'tea'],
    plan: days({
      home: G,
      fair: (sr, ss, s) => s === 'winter' ? [
        [10, 11.5, `${G}的坯棚`, '歇窑了，在棚里揉泥', 'clay'],
        [13.4, 15.6, `${G}的坯棚`, '揉泥', 'clay'],
      ] : [
        [8, 11.5, `${G}的坯棚`, '坐在陶车边拉坯', 'throw'],
        [13.4, 16.8, `${G}的窑前`, '往窑里添柴，把阴好的坯摆上架', 'kiln'],
        storyRow(ss, s, '站在后头听说书'),
      ],
      wet: (sr, ss, s) => s === 'winter' ? [] : [[8, 11.5, `${G}的坯棚`, '在棚里拉坯（坯怕雨，都收在屋里）', 'throw'], [13.4, 16.5, `${G}的坯棚`, '拉坯', 'throw']],
    }),
  },
  {
    id: 'herbalist', name: '孟老', call: '先生', role: '药农（上山采药，回来晒药）', age: 59, sex: 'm', home: '村外', family: [],
    temper: '识得百草，脾气有点古怪，最烦人踩他的药匾。', likes: ['herb', 'wine', 'tea'],
    plan: days({
      home: '北山脚的草屋',
      fair: (sr, ss, s) => s === 'winter' ? [[10, 15, '茶亭边', '摊开药匾晒药、拣药', 'dry']] : [
        [7, 11, '村北的山坡上', '背着篓子，蹲着刨药', 'herb'],
        [13.5, 16.5, '茶亭边', '摊开药匾晒药、拣药', 'dry'],
      ],
      wet: () => [],
      homeDoing: (h) => (h < 5.5 || h > 21 ? '睡下了' : '在草屋里切药、碾药'),
    }),
  },
  {
    id: 'shepherd', name: '冯老汉', call: '先生', role: '放羊的老汉（替赵家和几户人家放羊，住村东头外的草棚）', age: 64, sex: 'm', home: '村外', family: [],
    temper: '一个人惯了，跟羊说的话比跟人说的多。', likes: ['wine', 'tea'],
    plan: days({
      home: '村东头外的草棚',
      fair: (sr, ss, s) => s === 'winter' ? [[10, 15, '村路东头南边的草地', '把羊从丁家的圈里放出来，赶着吃草', 'sheep']] : [
        [8, 11.5, '村路东头南边的草地', '把羊从丁家的圈里放出来，赶着吃草', 'sheep'],
        [11.5, 13, '草地边的树下', '坐着歇晌，羊卧在跟前', 'sheepRest'],
        [13, ss - 0.6, '村路东头南边的草地', '赶着羊吃草，傍晚赶回圈', 'sheep'],
      ],
      wet: () => [],
      homeDoing: (h) => (h < 5.5 || h > 20.5 ? '睡下了' : '在羊圈里'),
    }),
  },
  {
    id: 'watchman', name: '李二', call: '先生', role: '打更的（李公的儿子）', age: 44, sex: 'm', home: 'b', family: ['elder', 'neighbor', 'washer', 'kid2'],
    temper: '夜里眼尖耳灵，白天困得睁不开眼。', likes: ['wine', 'tea', '一盏好灯'],
    plan: days({
      home: B,
      fair: (sr, ss) => [
        [0, 4.6, '村里各条路上', '提着灯笼、敲着梆子绕村打更', 'watch'],
        [14, 16.4, '茶亭', '坐在茶亭里喝茶、打盹', 'teaShed'],
        [Math.max(19, ss + 1), 24, '村里各条路上', '提着灯笼、敲着梆子绕村打更', 'watch'],
      ],
      wet: (sr, ss) => [
        [0, 4.6, '村里各条路上', '披着蓑衣打更', 'watch'],
        [Math.max(19, ss + 1), 24, '村里各条路上', '披着蓑衣打更', 'watch'],
      ],
      homeDoing: (h) => (h >= 4.6 && h < 13 ? '打完更，回家睡觉' : '在家里'),
    }),
  },
  {
    id: 'teller', name: '韩翁', call: '先生', role: '说书的盲翁（负鼓，邻村来）', age: 66, sex: 'm', home: '村外', family: [],
    temper: '眼看不见，耳朵极灵；一开口满村都静下来。', likes: ['wine', 'tea'],
    plan: days({
      home: '邻村',
      only: SEASONS,
      fair: (sr, ss, s) => STORY.includes(s) ? [[ss + 0.1, ss + 2.3, ELM, '坐在槐树下，敲着鼓说书', 'tell']] : [],
      wet: () => [],
      homeDoing: () => '不在村里',
    }),
  },
  {
    id: 'monk', name: '了然', call: '施主', role: '行脚僧（过路，在茶亭歇脚）', age: 45, sex: 'm', home: '村外', family: [],
    temper: '和气，话少，见人先合十。', likes: ['tea', 'water'],
    plan: days({
      home: '路上',
      fair: (sr, ss, s) => s === 'winter' ? [] : [[9, 11.4, '茶亭', '自西边来，在茶亭歇脚讨碗茶，再往东去', 'pass']],
      wet: () => [],
      homeDoing: () => '云游在外',
    }),
  },
  {
    id: 'aunt', name: '刘二姐', call: '先生', role: '王大娘的娘家妹子（东边刘家庄的，王家孩子叫她二姨）', age: 42, sex: 'f', home: '村外', family: ['farmwife'],
    temper: '爱说爱笑，来一趟要把两个庄子的新闻都说完。', likes: ['egg', 'thread', 'flower'],
    plan: days({
      home: '东边刘家庄',
      fair: (sr, ss, s) => (s === 'spring' || s === 'autumn') ? [[13.4, 15.8, `${A}门前`, '挎着一篮鸡蛋来串门，和姐姐说话', 'visit']] : [],
      wet: () => [],
      homeDoing: () => '在刘家庄',
    }),
  },
];

export const FOLK_BY_ID: Record<string, FolkDef> = Object.fromEntries(FOLK.map((f) => [f.id, f]));

/**
 * 此刻（几点、哪一季、是不是雨雪天）这个人该在哪、做什么。在家里那几步也有（doing 说在家做什么）；
 * 名册里没有这个人就是 null。
 */
export function planNow(id: string, hour: number, season: Season, wet: boolean): FolkPlanStep | null {
  const f = FOLK_BY_ID[id];
  if (!f) return null;
  const h = ((hour % 24) + 24) % 24, w = wet ? 'wet' : 'fair';
  for (const s of f.plan) if (h >= s.from && h < s.to && (!s.seasons || s.seasons.includes(season)) && (!s.weather || s.weather === w)) return s;
  return null;
}
