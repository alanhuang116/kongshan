/**
 * 这地方的人说的话，和界面上要用的几句。
 *
 * LINES、WORDS 是本应用自己写的（自撰），不是古书里的话，界面上不要配书名号、不要署古人的名。
 * 只有 YUQIAO 是古书原文：《渔樵问对》里可以拿来当渔樵对话的几段短问答，逐句核对过，见 docs/SOURCES.md。
 * 这里没有占卜，谁也不替人断吉凶。
 */

export interface Line {
  id: string;
  /**
   * farmer 农夫 · picker 采桑女 · kid 童子 · elder 老翁 · teacher 塾师 · carpenter 木匠 · fisher 渔者 · woodcutter 樵者 · neighbor 邻人 ·
   * washer 浣衣女（溪边）· herdboy 牧童（牛背上，带一支笛）· keeper 酒家掌柜 · peddler 货郎 · miller 水碓旁舂米的人 ·
   * guest 客（来访的朋友，坐在石桌旁）
   */
  who: 'farmer' | 'picker' | 'kid' | 'elder' | 'teacher' | 'carpenter' | 'fisher' | 'woodcutter' | 'neighbor' | 'washer' | 'herdboy' | 'keeper' | 'peddler' | 'miller' | 'guest';
  /** 可无：只在这些时令/时辰说（spring summer autumn winter dawn noon dusk night rain snow）。写了几个的，合乎其中一个就可以说 */
  when?: string[];
  text: string;
  /** 可无：主人（先生）接的一句。只有 guest 的话配了；界面不用它，text 也单独成句 */
  reply?: string;
}

/**
 * 招呼、手里的活、天时、家常。全部自撰，每句不超过 30 字。
 * 最初的九人每人 6–10 句；后来添的五人（浣衣女、牧童、掌柜、货郎、舂米人）每人 5–8 句；客 8–10 句。
 * 只有「客」的对话里引了古书：引的部分用「」标出，都是 shaoyong.ts 里核对过的原文；「」以外是本应用的话。
 */
export const LINES: Line[] = [
  // —— 农夫 ——
  { id: 'farmer-1', who: 'farmer', when: ['dawn'], text: '先生早。地里的活，赶早不赶晚。' },
  { id: 'farmer-2', who: 'farmer', text: '问收成？一半看老天，一半看锄头。' },
  { id: 'farmer-3', who: 'farmer', when: ['spring'], text: '春上多锄一遍，秋后多收一斗。' },
  { id: 'farmer-4', who: 'farmer', when: ['summer'], text: '麦子黄了，这几天就怕下雨。' },
  { id: 'farmer-5', who: 'farmer', when: ['autumn'], text: '谷穗沉了，雀儿也知道，天天来。' },
  { id: 'farmer-6', who: 'farmer', when: ['winter'], text: '地冻上了，人歇，牛也歇。' },
  { id: 'farmer-7', who: 'farmer', when: ['rain'], text: '下吧，下透了才好，省得我挑水。' },
  { id: 'farmer-8', who: 'farmer', when: ['dusk'], text: '日头落了，回家吃饭。先生也回吧。' },
  { id: 'farmer-9', who: 'farmer', text: '这块地我爹种过，我种，往后我儿子种。' },
  // —— 采桑女 ——
  { id: 'picker-1', who: 'picker', when: ['dawn'], text: '等露水干了再采，蚕吃了湿叶要闹病。' },
  { id: 'picker-2', who: 'picker', when: ['spring'], text: '蚕睡过三眠了，这几天叶子吃得正猛。' },
  { id: 'picker-3', who: 'picker', text: '先生让一让，筐满了，沉。' },
  { id: 'picker-4', who: 'picker', when: ['summer'], text: '今年桑椹结得密，孩子们嘴都吃紫了。' },
  { id: 'picker-5', who: 'picker', when: ['summer'], text: '茧收了，该缫丝了，夜里灯要点到很晚。' },
  { id: 'picker-6', who: 'picker', when: ['autumn'], text: '桑叶黄了，剪过枝，明年发得旺。' },
  { id: 'picker-7', who: 'picker', when: ['rain'], text: '下雨天不采叶，在屋里理丝。' },
  { id: 'picker-8', who: 'picker', text: '一筐叶，蚕一夜就吃光，听着像下小雨。' },
  // —— 童子 ——
  { id: 'kid-1', who: 'kid', when: ['night'], text: '先生先生，那颗最亮的是什么星？' },
  { id: 'kid-2', who: 'kid', when: ['night'], text: '勺子星的把儿，今晚指着哪边？' },
  { id: 'kid-3', who: 'kid', text: '我会数了：一、二、三……到十，再从头来。' },
  { id: 'kid-4', who: 'kid', when: ['summer'], text: '我捉了一只蝈蝈，先生听它叫。' },
  { id: 'kid-5', who: 'kid', when: ['autumn'], text: '柿子红了，我够不着，先生帮我摘一个。' },
  { id: 'kid-6', who: 'kid', when: ['snow'], text: '下雪了！先生快出来看！' },
  { id: 'kid-7', who: 'kid', when: ['dawn'], text: '先生，露水是从哪里来的？' },
  { id: 'kid-8', who: 'kid', when: ['dusk'], text: '我娘说，天黑前要回家。' },
  { id: 'kid-9', who: 'kid', text: '先生的小车，让我推一推好不好？' },
  // —— 老翁 ——
  { id: 'elder-1', who: 'elder', when: ['noon'], text: '坐，坐。日头好，晒晒背。' },
  { id: 'elder-2', who: 'elder', text: '我活了七十多年，没见过哪年不开花。' },
  { id: 'elder-3', who: 'elder', text: '年轻时嫌日子慢，如今嫌它快。' },
  { id: 'elder-4', who: 'elder', text: '先生的小车一响，半个村子都听得见。' },
  { id: 'elder-5', who: 'elder', when: ['dawn'], text: '人老了觉少，鸡还没叫我就醒了。' },
  { id: 'elder-6', who: 'elder', when: ['snow'], text: '一冬的雪下足了，开春就不愁。' },
  { id: 'elder-7', who: 'elder', when: ['autumn'], text: '今年雨水匀，仓里是满的。' },
  // —— 塾师 ——
  { id: 'teacher-1', who: 'teacher', text: '孩子们才认到一百个字，先生莫笑。' },
  { id: 'teacher-2', who: 'teacher', text: '最小的那个，写一个字要舔三回笔。' },
  { id: 'teacher-3', who: 'teacher', when: ['spring'], text: '今日放学早，天好，让他们放纸鸢去。' },
  { id: 'teacher-4', who: 'teacher', when: ['summer'], text: '窗外蝉一叫，一屋子的眼睛都往外看。' },
  { id: 'teacher-5', who: 'teacher', when: ['rain'], text: '下雨天书声最齐，没处跑。' },
  { id: 'teacher-6', who: 'teacher', when: ['night'], text: '先生得空，来给孩子们讲讲星星。' },
  { id: 'teacher-7', who: 'teacher', when: ['winter'], text: '天冷墨冻，叫他们先呵一呵手再写。' },
  // —— 木匠 ——
  { id: 'carpenter-1', who: 'carpenter', text: '这根梁是老榆木，再用一百年也不走样。' },
  { id: 'carpenter-2', who: 'carpenter', text: '活儿不能赶，赶出来的榫头不严。' },
  { id: 'carpenter-3', who: 'carpenter', text: '刨花先生拿些回去，引火好烧。' },
  { id: 'carpenter-4', who: 'carpenter', text: '亭子的栏杆松了？明日我带家伙来。' },
  { id: 'carpenter-5', who: 'carpenter', text: '先生那辆小车的轴，我上过油了。' },
  { id: 'carpenter-6', who: 'carpenter', when: ['rain'], text: '雨天木头涨，晴天木头缩，做门要留一线缝。' },
  { id: 'carpenter-7', who: 'carpenter', when: ['winter'], text: '冬天胶冻得快，手也冻得快。' },
  // —— 渔者 ——
  { id: 'fisher-1', who: 'fisher', text: '水清，鱼看得见钩，也看得见我。' },
  { id: 'fisher-2', who: 'fisher', text: '鱼不咬钩，我便看云。' },
  { id: 'fisher-3', who: 'fisher', text: '这条小，放了，明年再见。' },
  { id: 'fisher-4', who: 'fisher', text: '今日风大，不下网，坐着看水。' },
  { id: 'fisher-5', who: 'fisher', when: ['spring'], text: '春水涨了，鱼往上游走。' },
  { id: 'fisher-6', who: 'fisher', when: ['night'], text: '月亮上来了，水面比白天还亮。' },
  { id: 'fisher-7', who: 'fisher', when: ['winter'], text: '河封了，凿个窟窿也能钓。' },
  // —— 樵者 ——
  { id: 'woodcutter-1', who: 'woodcutter', text: '山上的路，我闭着眼也认得。' },
  { id: 'woodcutter-2', who: 'woodcutter', text: '柴砍枯枝，活树留着。' },
  { id: 'woodcutter-3', who: 'woodcutter', text: '放下担子歇一歇，听他说会儿话。' },
  { id: 'woodcutter-4', who: 'woodcutter', text: '一担柴换一斗米，够了。' },
  { id: 'woodcutter-5', who: 'woodcutter', when: ['rain'], text: '下过雨，蘑菇出来了，顺手采一篮。' },
  { id: 'woodcutter-6', who: 'woodcutter', when: ['autumn'], text: '霜一打，山就红了。' },
  { id: 'woodcutter-7', who: 'woodcutter', when: ['snow'], text: '雪封了山，就在家劈柴。' },
  // —— 邻人 ——
  { id: 'neighbor-1', who: 'neighbor', when: ['dawn'], text: '我家的鸡，又吵着先生了吧？' },
  { id: 'neighbor-2', who: 'neighbor', text: '新酿的酒开坛了，给先生送一壶来。' },
  { id: 'neighbor-3', who: 'neighbor', text: '先生门没关，我就进来了。' },
  { id: 'neighbor-4', who: 'neighbor', when: ['summer'], text: '墙头的桃熟了，伸过来的都算先生的。' },
  { id: 'neighbor-5', who: 'neighbor', when: ['summer'], text: '灶上蒸了新麦馍，趁热。' },
  { id: 'neighbor-6', who: 'neighbor', when: ['night'], text: '今晚月亮好，搬张凳子出来坐坐。' },
  { id: 'neighbor-7', who: 'neighbor', when: ['autumn'], text: '天凉了，先生添件衣裳。' },
  { id: 'neighbor-8', who: 'neighbor', when: ['winter'], text: '过年的对子，还得请先生写。' },
  // —— 浣衣女（溪边）——
  { id: 'washer-1', who: 'washer', text: '这水是后山石缝里出来的，冬天也不冰手。' },
  { id: 'washer-2', who: 'washer', text: '上游淘米，下游洗衣，是村里的规矩。' },
  { id: 'washer-3', who: 'washer', text: '先生的长衫我顺手捶了，晾在竹竿上。' },
  { id: 'washer-4', who: 'washer', text: '水清，衣裳一漂就干净，不费皂角。' },
  { id: 'washer-5', who: 'washer', when: ['spring'], text: '桃花瓣漂下来，沾在衣裳上，舍不得抖。' },
  { id: 'washer-6', who: 'washer', when: ['summer'], text: '日头毒，趁早洗完，石板还凉着。' },
  { id: 'washer-7', who: 'washer', when: ['autumn'], text: '水凉了，洗完手是红的，呵一呵就好。' },
  { id: 'washer-8', who: 'washer', when: ['rain'], text: '要下雨了，我得把晾着的收回去。' },
  // —— 牧童（牛背上，一支笛）——
  { id: 'herdboy-1', who: 'herdboy', text: '牛认得路，我只管吹笛子。' },
  { id: 'herdboy-2', who: 'herdboy', text: '这支笛是我自己削的，只会三个调。' },
  { id: 'herdboy-3', who: 'herdboy', text: '它吃饱了就卧下，要等它嚼完才肯走。' },
  { id: 'herdboy-4', who: 'herdboy', text: '先生要不要骑一骑？它很稳的。' },
  { id: 'herdboy-5', who: 'herdboy', when: ['spring'], text: '草才冒头，它一口一口啃得可仔细。' },
  { id: 'herdboy-6', who: 'herdboy', when: ['summer'], text: '晌午它泡在水里不出来，我就睡在树下。' },
  { id: 'herdboy-7', who: 'herdboy', when: ['rain'], text: '下雨不怕，我有斗笠，牛有皮。' },
  { id: 'herdboy-8', who: 'herdboy', when: ['dusk'], text: '日头压山了，该赶牛回栏了。' },
  // —— 酒家掌柜 ——
  { id: 'keeper-1', who: 'keeper', text: '今年的新酒，米好水也好，先生尝一碗。' },
  { id: 'keeper-2', who: 'keeper', text: '不忙给钱，记在账上，秋后一总结。' },
  { id: 'keeper-3', who: 'keeper', text: '先生只喝三四杯，我是知道的，不多筛。' },
  { id: 'keeper-4', who: 'keeper', text: '下酒的只有煮豆、腌菜，将就着。' },
  { id: 'keeper-5', who: 'keeper', when: ['winter'], text: '天冷，酒要温着喝，我给先生烫一壶。' },
  { id: 'keeper-6', who: 'keeper', when: ['autumn'], text: '新谷下来了，过几日就开酿。' },
  { id: 'keeper-7', who: 'keeper', when: ['rain'], text: '下雨没客，正好陪先生坐一会儿。' },
  { id: 'keeper-8', who: 'keeper', when: ['night'], text: '要上门板了，这盏灯先生提着照路。' },
  // —— 货郎 ——
  { id: 'peddler-1', who: 'peddler', text: '针头线脑、麦芽糖、拨浪鼓，都在担子里。' },
  { id: 'peddler-2', who: 'peddler', text: '我这鼓一摇，孩子们就从巷子里跑出来。' },
  { id: 'peddler-3', who: 'peddler', text: '麦芽糖掰一块给孩子，不要钱。' },
  { id: 'peddler-4', who: 'peddler', text: '走了七个村子，数这里的水最甜。' },
  { id: 'peddler-5', who: 'peddler', text: '大嫂要的花线，我下回从城里带来。' },
  { id: 'peddler-6', who: 'peddler', when: ['rain'], text: '雨来了，借屋檐下歇歇担子。' },
  { id: 'peddler-7', who: 'peddler', when: ['dusk'], text: '天不早了，赶到前村还有十里。' },
  { id: 'peddler-8', who: 'peddler', when: ['winter'], text: '年底了，红纸、灯芯都添了货。' },
  // —— 水碓旁舂米的人 ——
  { id: 'miller-1', who: 'miller', text: '水来了碓就动，不用我使力气。' },
  { id: 'miller-2', who: 'miller', text: '舂一石谷要大半天，急不得。' },
  { id: 'miller-3', who: 'miller', text: '糠留着喂猪，一点也不糟蹋。' },
  { id: 'miller-4', who: 'miller', text: '先生听，这碓一下一下，比更鼓还准。' },
  { id: 'miller-5', who: 'miller', text: '舂好了，我叫孩子给先生送去。' },
  { id: 'miller-6', who: 'miller', when: ['rain'], text: '山水大了，碓跳得快，我得去闸一闸。' },
  { id: 'miller-7', who: 'miller', when: ['autumn'], text: '新谷下来，各家排着来舂，忙到半夜。' },
  { id: 'miller-8', who: 'miller', when: ['winter'], text: '水小了，碓也懒，一天舂不了多少。' },
  // —— 客（坐在石桌旁；不谈升官发财，只谈阴阳消长、四时消息。「」里是核对过的原文）——
  { id: 'guest-1', who: 'guest', text: '今年桃花比去年早了三日，先生看见没有？', reply: '看见了。早三日，晚三日，都在这个月里。' },
  { id: 'guest-2', who: 'guest', when: ['winter'], text: '冬至了，夜长到头了吧？', reply: '到头就回头。「一阳初起处，万物未生时。」' },
  { id: 'guest-3', who: 'guest', text: '人都说盛极必衰，我看月亮也是这样。', reply: '易上说：「日中则昃，月盈则食；天地盈虚，与时消息。」' },
  { id: 'guest-4', who: 'guest', when: ['autumn', 'winter'], text: '叶子落尽了，倒看得清树的样子。', reply: '落尽了才要发。「复，其见天地之心乎！」' },
  { id: 'guest-5', who: 'guest', text: '先生这里一坐，半日就过去了。', reply: '「静处乾坤大，闲中日月长。」不觉得就对了。' },
  { id: 'guest-6', who: 'guest', text: '城里人问我先生近来谈些什么，我说谈天气。', reply: '「寒往则暑来，暑往则寒来。」够谈一辈子。' },
  { id: 'guest-7', who: 'guest', when: ['spring'], text: '雪才化，墙根的草已经青了。', reply: '阳气是从底下上来的，先到根，后到梢。' },
  { id: 'guest-8', who: 'guest', when: ['summer'], text: '夏至一过，白日就一天短一线了。', reply: '长到头就短，短到头就长，没有停的时候。' },
  { id: 'guest-9', who: 'guest', when: ['night'], text: '斗柄比上个月又转过去一些了。', reply: '它转它的，我们跟着添减衣裳。' },
  { id: 'guest-10', who: 'guest', text: '「水流任急境常静，花落虽频意自闲。」这两句我抄去了。', reply: '抄去无妨，溪水和花不是我的。' },
];

/**
 * 《渔樵问对》原文里可以拿来当渔樵对话的几段短问答。q 是樵者问，a 是渔者答（都是原文，标点今加）。
 * 同一段里相连的几问几答按原书次序排在一起，界面可以连着用。
 */
export const YUQIAO: Array<{ q: string; a: string; source: string }> = [
  { q: '鱼可钩取乎？', a: '然。', source: '《渔樵问对》开篇' },
  { q: '钩非饵可乎？', a: '否。', source: '《渔樵问对》开篇' },
  { q: '鱼可生食乎？', a: '烹之可也。', source: '《渔樵问对》' },
  { q: '必吾薪济子之鱼乎？', a: '然。', source: '《渔樵问对》' },
  { q: '火能焚水乎？', a: '火之性，能迎而不能随，故灭。水之体，能随而不能迎，故热。', source: '《渔樵问对》' },
  { q: '圣人既不能传之以言，则六经非言也耶？', a: '时然后言，何言之有？', source: '《渔樵问对》' },
  { q: '何谓我，何谓物？', a: '以我徇物，则我亦物也；以物徇我，则物亦我也。我物皆致，意由是明。', source: '《渔樵问对》（「以我徇物」从《说郛》《性理大全》本）' },
  { q: '天何依？', a: '依乎地。', source: '《渔樵问对》' },
  { q: '地何附？', a: '附乎天。', source: '《渔樵问对》' },
  { q: '然则天地何依何附？', a: '自相依附。天依形，地附气。其形也有涯，其气也无涯。', source: '《渔樵问对》' },
  { q: '子以何道而得鱼？', a: '吾以六物具而得鱼。', source: '《渔樵问对》' },
  { q: '六物具也，岂由天乎？', a: '具六物而得鱼者，人也。具六物而所以得鱼者，非人也。', source: '《渔樵问对》' },
  { q: '樵者未达，请问其方。', a: '六物者，竿也，纶也，浮也，沉也，钩也，饵也。一不具，则鱼不可得。', source: '《渔樵问对》（q 是原书的叙述，不是问话）' },
  { q: '人有祷鬼神而求福者，福可祷而求耶？', a: '语善恶者，人也；祸福者，天也。天道福善而祸淫，鬼神其能违天乎？', source: '《渔樵问对》（「祸福」「其能」从《说郛》《性理大全》本）' },
  { q: '复何以见天地之心乎？', a: '先阳已尽，后阳始生，则天地始生之际，中则当日月始周之际，末则当星辰始终之际。', source: '《渔樵问对》（「始终」《性理大全》本作「终始」）' },
];

/** 渔樵相遇的开头与结尾（原文的叙述），界面可用来起、收这段对话 */
export const YUQIAO_SCENE = {
  open: '渔者垂钓于伊水之上。樵者过之，弛担息肩，坐于磐石之上，而问于渔者。',
  meal: '乃析薪烹鱼而食之，饫而论《易》。',
  close: '樵者曰：「吾闻古有伏羲，今日如睹其面焉。」拜而谢之，及旦而去。',
  source: '《渔樵问对》',
} as const;

/** 《渔樵问对》的来历（一句说明，界面上引用时可附） */
export const YUQIAO_NOTE = '《渔樵问对》一卷，旧题邵雍撰：《宋史》本传把它列在邵雍的著作里，宋人晁公武《郡斋读书志》的一种本子却题张载撰，《四库全书总目》说「未详孰是」，疑是后人摭拾邵子的话编成。书里有大段文字与《皇极经世·观物内篇》相同。';

/** 这地方的几句话（界面上用）：题名、题下一句、印文、入口一句、关于页的几段、如实说明 */
export const WORDS: { title: string; subtitle: string; seal: string; entry: string[]; about: string[]; honest: string[] } = {
  title: '安乐窝',
  subtitle: '心能安处即桃源',
  seal: '观物',
  entry: [
    '柴门没有上闩，推开就是。',
    '这里不问吉凶，只看花开叶落、斗转星移。',
    '慢慢走，不赶时辰。',
  ],
  about: [
    '邵雍，字尧夫，北宋人，生于大中祥符四年十二月（1011年底，按公历已是1012年1月），卒于熙宁十年（1077）七月，六十七岁。祖上是范阳人，幼年随父迁到共城（今河南辉县），在苏门山百源之上读书，从李之才受《易》学。去世后朝廷赐谥「康节」，所以后人也叫他邵康节。',
    '皇祐元年（1049），他奉父亲迁居洛阳。起初「蓬荜环堵，不芘风雨」，自己打柴做饭奉养父母。嘉祐七年（1062），西京留守王拱辰在天津桥南给他盖了三十间屋，富弼叫门客买下对面一座园子；后来官府要发卖这块地，司马光等二十多家凑钱替他买了下来。他作诗道谢：「七千来步平流水，二十余家争出钱。」他把住处叫「安乐窝」，自号安乐先生。',
    '春秋两季天气好的时候，他坐一辆小车出门，一个人拉着，想去哪里去哪里。走到谁家，谁家的大人孩子都高兴，说「吾家先生至也」。有十几户人家照着安乐窝的样子另盖了屋等他来住，叫「行窝」。朝廷两次授他官职，他推辞不掉才受了命，终究称病没有去上任。',
    '他的书有《皇极经世》，用元、会、运、世把天地古今排成一张大历，其中《观物篇》讲「以物观物」——不拿自己的好恶去看，让物照它本来的样子显出来。诗集叫《伊川击壤集》，他自己说是「自乐之诗」。临终前他写道：「生于太平世，长于太平世。老于太平世，死于太平世。客问年几何，六十有七岁。俯仰天地间，浩然无所愧。」',
    '这里的安乐窝，不是洛阳天津桥南那一座的复原。它是照着邵雍诗文里的意思想出来的一处桃花源：有桃，有溪，有亭，有田，有邻人。可以读两页书，看一会儿云，问问农夫地里的事，教孩子认北斗。',
    '邵雍在后世被说成能知未来的术士，托他名字的占卜书很多。这里一概不用：不起卦，不断吉凶。六十四卦在这里只当「象」看——井边是井，灶上是鼎，风吹水面是涣。',
  ],
  honest: [
    '「心能安处即桃源」是为这个地方写的一句话，意思从邵雍来，字句不是他的。他自己的话是「何处是仙乡，仙乡不离房」「心安身自安，身安室自宽」。古人相近的句子有白居易「我生本无乡，心安是归处」「无论海角与天涯，大抵心安即是家」「心泰身宁是归处，故乡何独在长安」，苏轼「此心安处是吾乡」。',
    '「春种秋收，便是大吉」也是为这里的先生设的一句话，不出于哪一本书。邵雍自己写田家，是《力穑吟》：「春时耕种，夏时耘耨。秋时收治，冬时用受。」',
    '柴门上的联「闭门即是深山，读书随处净土」是明代陈继儒的话，不是宋人的。明人李乐《见闻杂记》、吴应箕《读书止观录》都把它记在陈继儒名下，《古今图书集成》所录陈继儒《长者言》（即《安得长者言》）里也有；陆绍珩把它辑入《醉古堂剑扫》卷四，这部书清代被改题《小窗幽记》、署陈继儒撰，所以通常说它出自《小窗幽记》。它比邵雍晚五百多年，是今人为这扇门选的。',
    '《山村咏怀》（「一去二三里」）旧题邵雍，但他的诗集各本都不载，能查到的最早引用在清代，都不署作者。放在这里，只当孩子们数数的歌。',
    '村里人说的话都是为这里写的，不是古书里的。古书原文旁边都注了出处；白话的解说是今人的话。',
    '「观物亭」这个名字和这里的屋舍陈设是想象的。邵雍的安乐窝在洛阳城里，不在山野；他确实写过大量「观物」的诗文，《皇极经世》的篇名就叫「观物」。',
    '二十四节气下的农事，是按洛阳一带的旱作写的今人的话；物候三候与所引古书是原文。',
  ],
};
