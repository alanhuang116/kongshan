/**
 * 观星时点到一处，旁边出的话。
 *
 *   QUOTES —— 古书里的原话，逐字对过维基文库的录文（繁体转简体、去标点后原样连续出现），出处与核对记在 docs/SOURCES.md 的「星空」一节。
 *   NOTES、REGION_NOTE、PLANET_NOTE、XIANG_NOTE …… —— 本应用自己写的白话（星的今名、颜色、什么时候在哪），不是古人的话：
 *     界面上与原话分开摆，不配书名号、不署古人名。
 * 这里不占卜、不说吉凶：《史记·天官书》里那些「见则……」的话一概不收。
 */
export interface Quote { text: string; source: string; gloss?: string }

const DADONG = '《诗经·小雅·大东》', TGS = '《史记·天官书》', YAO = '《尚书·尧典》';
const Q = {
  liuhuo: { text: '七月流火，九月授衣。', source: '《诗经·豳风·七月》', gloss: '流火：大火星（心宿二）在黄昏时一天天往西沉下去，天快凉了。' },
  han: { text: '维天有汉，监亦有光。', source: DADONG, gloss: '天上的银河，看着也有光。' },
  zhinv: { text: '跂彼织女，终日七襄。', source: DADONG },
  qianniu: { text: '虽则七襄，不成报章。睆彼牵牛，不以服箱。', source: DADONG, gloss: '织女星一天移七次位，却织不成布；牵牛星明亮，却不能拉车。' },
  qiming: { text: '东有启明，西有长庚。', source: DADONG, gloss: '启明、长庚都是金星：早晨在东方，傍晚在西方。' },
  bi: { text: '有捄天毕，载施之行。', source: DADONG, gloss: '毕宿像一把长柄的捕兔网，横在天上。' },
  jidou: { text: '维南有箕，不可以簸扬。维北有斗，不可以挹酒浆。', source: DADONG, gloss: '南边的箕宿不能簸米，北边的斗宿（南斗）不能舀酒。' },
  shenmao: { text: '嘒彼小星，维参与昴。', source: '《诗经·召南·小星》' },
  sanwu: { text: '嘒彼小星，三五在东。', source: '《诗经·召南·小星》' },
  sanxing: { text: '绸缪束薪，三星在天。', source: '《诗经·唐风·绸缪》', gloss: '三星，旧说多指参宿中间那三颗。' },
  ding: { text: '定之方中，作于楚宫。', source: '《诗经·鄘风·定之方中》', gloss: '定就是营室（室宿）。它黄昏时正在南方，正是筑屋的时节。' },
  libi: { text: '月离于毕，俾滂沱矣。', source: '《诗经·小雅·渐渐之石》', gloss: '离：经过。诗里说月亮经过毕宿，雨就大了。' },
  yunhan: { text: '倬彼云汉，昭回于天。', source: '《诗经·大雅·云汉》', gloss: '云汉就是银河，明亮地在天上回转。' },
  tiaotiao: { text: '迢迢牵牛星，皎皎河汉女。', source: '《古诗十九首》' },
  qianjin: { text: '河汉清且浅，相去复几许。盈盈一水间，脉脉不得语。', source: '《古诗十九首·迢迢牵牛星》' },
  niao: { text: '日中星鸟，以殷仲春。', source: YAO, gloss: '昼夜一般长、黄昏时鸟星正南，就是仲春。' },
  huo: { text: '日永星火，以正仲夏。', source: YAO, gloss: '白天最长、黄昏时大火正南，就是仲夏。' },
  xu: { text: '宵中星虚，以殷仲秋。', source: YAO, gloss: '昼夜一般长、黄昏时虚宿正南，就是仲秋。' },
  mao: { text: '日短星昴，以正仲冬。', source: YAO, gloss: '白天最短、黄昏时昴宿正南，就是仲冬。' },
  shenshang: { text: '人生不相见，动如参与商。', source: '杜甫《赠卫八处士》', gloss: '参宿在西，商星（心宿）在东，一个升起，另一个已经落下，永不同时在天上。' },
  long: { text: '东宫苍龙，房、心。', source: TGS },
  que: { text: '南宫朱鸟，权、衡。', source: TGS, gloss: '权是轩辕，衡是太微。' },
  hu: { text: '西宫咸池，曰天五潢。', source: TGS },
  baihu: { text: '参为白虎。', source: TGS },
  wu: { text: '北宫玄武，虚、危。', source: TGS },
  diche: { text: '斗为帝车，运于中央，临制四乡。', source: TGS },
  wuxing: { text: '天有五星，地有五行。', source: TGS },
  laoren: { text: '狼比地有大星，曰南极老人。', source: TGS, gloss: '天狼星往下、贴近地平的地方有一颗大星，叫南极老人。' },
  tianlang: { text: '举长矢兮射天狼。', source: '屈原《九歌·东君》' },
  tianlang2: { text: '会挽雕弓如满月，西北望，射天狼。', source: '苏轼《江城子·密州出猎》' },
  beichen: { text: '为政以德，譬如北辰，居其所而众星共之。', source: '《论语·为政》' },
  liuxing: { text: '夜，恒星不见。夜中，星陨如雨。', source: '《春秋·庄公七年》', gloss: '这是世上最早的流星雨记录之一。' },
} satisfies Record<string, Quote>;

/** 星官名 → 几句原话（按 src/data/xingguan.ts 里的名） */
export const QUOTES: Record<string, Quote[]> = {
  心宿: [Q.liuhuo, Q.huo, Q.shenshang, Q.long], 房宿: [Q.long],
  参宿: [Q.shenmao, Q.sanxing, Q.baihu, Q.shenshang], 觜宿: [Q.baihu],
  昴宿: [Q.mao, Q.shenmao], 毕宿: [Q.bi, Q.libi],
  箕宿: [Q.jidou], 斗宿: [Q.jidou],
  织女: [Q.zhinv, Q.tiaotiao, Q.qianjin], 河鼓: [Q.tiaotiao, Q.qianniu, Q.qianjin], 牛宿: [Q.qianniu],
  室宿: [Q.ding], 虚宿: [Q.xu, Q.wu], 危宿: [Q.wu], 星宿: [Q.niao], 轩辕: [Q.que], 太微左垣: [Q.que], 太微右垣: [Q.que],
  咸池: [Q.hu], 天潢: [Q.hu],
  北斗: [Q.diche], 北极: [Q.beichen], 勾陈: [Q.beichen],
  天狼: [Q.tianlang, Q.tianlang2], 弧矢: [Q.tianlang], 老人: [Q.laoren],
  天津: [Q.han, Q.yunhan],
};

/** 几颗常说起的星：本应用自己写的一两句（今名、颜色、什么时候在哪） */
export const NOTES: Record<string, string> = {
  织女一: '就是织女星。夏夜近天顶，全天第五亮的星，白里带一点青。',
  河鼓二: '民间叫牛郎星。两边各有一颗小星（河鼓一、河鼓三），俗说是牛郎挑着的担子。',
  天津四: '在银河当中。与织女星、牛郎星合成一个大三角，夏秋之夜一抬头就是。',
  心宿二: '红色的亮星，古人叫它大火，也叫商星。夏天黄昏在南方低空。',
  参宿四: '参宿左上角那一颗，偏红。',
  参宿七: '参宿右下角那一颗，青白色，比参宿四还亮一点。',
  天狼: '全天最亮的恒星，冬春之夜在南方。',
  老人: '南极老人星。在洛阳只在冬春的夜里贴着南方地平线露一露，很难看到。',
  大角: '春夏之夜一颗橙黄的亮星，在北斗斗柄延长下去的地方。',
  轩辕十四: '轩辕的第十四颗，春天黄昏在南方高处。',
  角宿一: '春夜南方的白色亮星。角宿是二十八宿的头一宿。',
  北河三: '北河的第三颗，与北河二并排，冬春之夜很好认。',
  北河二: '北河的第二颗，与北河三并排。',
  南河三: '南河的第三颗，冬春之夜在天狼星的东北边。',
  五车二: '黄色的亮星，冬夜在头顶附近。',
  毕宿五: '毕宿的第五颗，橙红色，在昴宿东边不远。',
  北落师门: '秋夜南方低空最亮的一颗，四周没有别的亮星。',
  勾陈一: '就是今天的北极星，离北天极不到一度，一夜不怎么动。',
  天枢: '北斗的头一颗。天枢、天璇连线往前延长五倍，就到北极星。',
  天璇: '北斗的第二颗，与天枢合称「指极星」。',
  玉衡: '北斗里最亮的一颗。',
  开阳: '斗柄中间那一颗，紧挨着它有一颗小星，古人叫「辅」。',
  摇光: '斗柄的末梢。',
};

/** 三垣（本应用的话） */
export const REGION_NOTE: Record<string, string> = {
  紫微垣: '北天极周围的一大片，左右两道垣墙围着，古人看作天帝的宫城。在洛阳，这一片终夜不落。',
  太微垣: '春夜南方的一片，轩辕之东，古人看作朝廷。',
  天市垣: '夏夜头顶偏南的一片，两道垣墙围着，古人看作集市。',
};
/** 四象：所辖七宿、它们大约哪个季节的黄昏在南天（本应用的话），配一句《天官书》、一句《尧典》 */
export const XIANG_NOTE: Record<string, { note: string; quotes: Quote[] }> = {
  long: { note: '东方苍龙七宿：角、亢、氐、房、心、尾、箕，连起来像一条龙。春天黄昏龙角从东方升起，夏天黄昏大火正南。', quotes: [Q.long, Q.huo] },
  wu: { note: '北方玄武七宿：斗、牛、女、虚、危、室、壁，玄武是龟蛇。秋天黄昏在南天。', quotes: [Q.wu, Q.xu] },
  hu: { note: '西方白虎七宿：奎、娄、胃、昴、毕、觜、参，参宿是虎身。冬天黄昏在南天。', quotes: [Q.baihu, Q.mao] },
  que: { note: '南方朱雀七宿：井、鬼、柳、星、张、翼、轸，柳是鸟嘴、星是鸟颈、张是嗉、翼是翅。春天黄昏在南天。', quotes: [Q.que, Q.niao] },
};
/** 五星（本应用的话；配一句原话） */
export const PLANET_NOTE: Record<string, { note: string; quote?: Quote }> = {
  jupiter: { note: '岁星，今叫木星。约十二年走一周天，一年走一次（一个星次），古人用它纪年。', quote: Q.wuxing },
  mars: { note: '荧惑，今叫火星。色红，忽快忽慢，有时还往回走。', quote: Q.wuxing },
  saturn: { note: '镇星，又叫填星，今叫土星。约二十九年走一周天，差不多一年走过一宿。', quote: Q.wuxing },
  venus: { note: '太白，今叫金星。除了日月，天上数它最亮；只在黎明的东方、黄昏的西方出现。', quote: Q.qiming },
  mercury: { note: '辰星，今叫水星。总在太阳近旁，只在日出前、日落后贴着地平线露一会儿。', quote: Q.wuxing },
};
/** 银河、流星、月 */
export const HAN: Quote[] = [Q.han, Q.yunhan, Q.qianjin];
export const METEOR: Quote = Q.liuxing;

/**
 * 几场每年都来的流星雨：极盛那天（一年里的第几天）、前后各几天、辐射点（J2000 赤经、赤纬，度）、一个时辰大约几颗。
 * （据国际流星组织的常见数值，取整；只给画里「这几夜流星多」用，不报名字——名字是今天的西洋叫法。）
 */
export const SHOWERS: Array<{ peak: number; before: number; after: number; ra: number; dec: number; rate: number }> = [
  { peak: 3, before: 6, after: 9, ra: 230, dec: 49, rate: 40 },
  { peak: 112, before: 6, after: 3, ra: 271, dec: 34, rate: 12 },
  { peak: 224, before: 26, after: 12, ra: 48, dec: 58, rate: 60 },
  { peak: 294, before: 19, after: 17, ra: 95, dec: 16, rate: 18 },
  { peak: 321, before: 11, after: 13, ra: 152, dec: 22, rate: 12 },
  { peak: 348, before: 10, after: 3, ra: 112, dec: 33, rate: 70 },
];
