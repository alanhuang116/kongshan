/**
 * 托事：村里人有求于先生的几件事（大小都有，跨人跨地方）。话都是本应用自撰的家常，不是古书里的。
 *
 * 每件事写清楚：谁托的、什么时候会提、怎么算做成、做成了回什么礼、画面下方轻轻提一句什么。
 * 怎么算做成（goal.kind）：
 *   bring —— 把行囊里的某样东西带给他（任一样即可）
 *   fetch —— 先到另一个人那里讨来一样东西，再带给托事的人
 *   act   —— 去做一件事（认北斗、守网……），做完回来跟他说一声
 *   tell  —— 去跟另一个人带句话（或叫个人回家），回来说一声
 *   hen   —— 乙家走散的母鸡：找着了抱回乙家门前放下（「抱鸡」「放鸡」是生灵那一路的事），回来说一声
 *   now   —— 当场就办（替人读一封信）
 * 话里的「{某人的 id}」显示时换成那人的名字（王大、老刘……）。
 * 用到别处的人、事、东西的，写在 needs 里：那些不在时，这件事就不提（不报错）。
 * 逻辑在 src/world/acts/favor.ts；这里只有话与条件。
 */

export type FavorGoal =
  | { kind: 'bring'; items: string[]; n?: number }
  | { kind: 'fetch'; at: string; item: string; n: number; /** 先生对那人说的（签上的字） */ ask: string; /** 那人答的 */ reply: string }
  | { kind: 'act'; acts: string[]; night?: boolean; /** 至少做了几秒（那件事自己说做完了也算） */ secs?: number; /** 回来跟托事的人说的（签上的字） */ report: string }
  | { kind: 'tell'; to: string; ask: string; reply: string; report: string }
  | { kind: 'hen'; report: string }
  | { kind: 'now'; /** 当场办的那件事的内容（读信：信上的话） */ text: string };

export interface FavorDef {
  id: string;
  /** 谁托的（村人的 id） */
  from: string;
  /** 村人簿上怎么写这件事（几个字） */
  name: string;
  /** 情分到了几分他才托（1 初识 2 相熟 3 相得 4 知交；默认 1） */
  bond?: number;
  /** 他什么时候会提：哪几季、几点到几点、要不要晴天、他此刻在做哪几件事（日程里事的名字） */
  when?: { seasons?: string[]; from?: number; to?: number; fair?: boolean; acts?: string[] };
  /** 先生问「可要帮手？」时，他说的 */
  ask: string;
  /** 答应、推辞的签（不给就是「好，我去」「改日吧」） */
  yes?: string; no?: string;
  /** 答应了他说的、推辞了他说的 */
  ok: string; nope: string;
  goal: FavorGoal;
  /** 交东西时签上的字（bring、fetch 用） */
  hand?: string;
  /** 办成了，他说的谢 */
  thanks: string;
  /** 回礼（行囊里添的） */
  gift?: Array<{ item: string; n: number }>;
  /** 画面下方的提示：接下时、东西带上了 / 半路上那一步做完时、办成了 */
  note: { on: string; got?: string; half?: string; done: string };
  /** 要用到的别处的东西：这些人、这几件事（id 或前缀）、这些物品都在，他才提 */
  needs?: { npcs?: string[]; acts?: string[]; items?: string[] };
}

export const FAVORS: FavorDef[] = [
  {
    id: 'tea', from: 'elder', name: '给槐树下的{elder}端一碗热茶',
    when: { from: 8, to: 14, fair: true, acts: ['sit'] },
    ask: '嘴里淡。听说先生草堂里的茶香，几时赏老汉一碗？',
    yes: '这就去煮', no: '改日吧',
    ok: '不急，不急。老汉就在这凳上等着，哪儿也不去。',
    nope: '不妨事。茶是要闲了才吃得出味儿。',
    goal: { kind: 'bring', items: ['tea'] },
    hand: '茶来了，趁热',
    thanks: '烫手，好。先吹一口……这茶有山里的味儿。先生有心了，这捧枣你拿着。',
    gift: [{ item: 'jujube', n: 1 }],
    note: { on: '去草堂煮一壶茶，带一碗给槐树下的{elder}', got: '带着一碗茶，给槐树下的{elder}送去', done: '{elder}记下了你的好' },
    needs: { npcs: ['elder'], acts: ['tea'] },
  },
  {
    id: 'stars', from: 'teacher', name: '晚上给孩子们讲讲星星',
    when: { from: 6.8, to: 17 },
    ask: '孩子们天天问我天上的星叫什么，我也说不全。先生得空，晚上到桥头给他们讲讲？',
    yes: '今晚就去', no: '过几日吧',
    ok: '好极了。黄昏时{kid1}总在石桥上等星星，先生到那里便是。',
    nope: '不急。星星年年都在，等先生得空。',
    goal: { kind: 'act', acts: ['stars', 'dipper'], night: true, secs: 20, report: '星星讲过了' },
    thanks: '听说了。{kid1}回来比划了一早上，说勺子把儿朝哪边。比我教十天还管用。',
    note: { on: '夜里天清时，到溪桥南头认北斗、讲星星', half: '星星讲过了，得空跟{teacher}说一声', done: '{teacher}记下了你的好' },
    needs: { npcs: ['teacher'] },
  },
  {
    id: 'wood', from: 'carpenter1', name: '替修桥的{carpenter1}讨一捆柴',
    when: { from: 7.5, to: 17.4, fair: true, acts: ['work', 'lunch'] },
    ask: '熬胶的火快灭了，柴没带够。{woodcutter}后晌在渡口歇脚，先生路过，替我讨一捆来？',
    yes: '我去讨', no: '今日不顺路',
    ok: '劳烦。他人实在，开口就给。',
    nope: '那我再将就一阵，刨花也烧得。',
    goal: { kind: 'fetch', at: 'woodcutter', item: 'firewood', n: 1, ask: '{carpenter1}托我讨捆柴', reply: '修桥的事，该帮。拣一捆干的，先生拿去。' },
    hand: '柴讨来了',
    thanks: '是干柴，好烧。这胶熬得成了。拿着，竹子削的，给孩子们吹着玩。',
    gift: [{ item: 'whistle', n: 1 }],
    note: { on: '{woodcutter}后晌在渡口歇脚，向他讨一捆柴', half: '得了一捆柴，给修桥的{carpenter1}送去', done: '{carpenter1}记下了你的好' },
    needs: { npcs: ['carpenter1', 'woodcutter'] },
  },
  {
    id: 'candy', from: 'peddler', name: '拿一升新粮换{peddler}的饴糖',
    when: { from: 14.4, to: 16.6, fair: true },
    ask: '先生家里有新打的粮么？一升换三块饴糖。城里不是这个价，先生是先生。',
    yes: '回头拿来', no: '家里没有',
    ok: '我天天这时候在茶亭歇脚，先生来就是。',
    nope: '不打紧，不打紧。生意是生意，人情是人情。',
    goal: { kind: 'bring', items: ['wheat', 'millet', 'flour', 'bean'] },
    hand: '新粮带来了',
    thanks: '好粮，颗颗饱。三块饴糖，先生收好，孩子们见了要跟着你跑。',
    gift: [{ item: 'candy', n: 3 }],
    note: { on: '拿一升新粮到茶亭，换{peddler}三块饴糖', got: '带着新粮，到茶亭找{peddler}', done: '{peddler}记下了你的好' },
    needs: { npcs: ['peddler'] },
  },
  {
    id: 'girl', from: 'swinger', name: '给{swinger}一块糖',
    when: { from: 8.4, to: 17.2, fair: true },
    ask: '先生……货郎的糖，我没有钱。哥哥们都吃了，就我没吃上。',
    yes: '我去给你找', no: '下回吧',
    ok: '真的？那我在这儿等着，不走开。',
    nope: '嗯。那我再坐一会儿。',
    goal: { kind: 'bring', items: ['candy'] },
    hand: '给，一块糖',
    thanks: '甜的！先生，这朵花给你，我在篱笆边摘的。',
    gift: [{ item: 'flower', n: 1 }],
    note: { on: '找一块饴糖给赵家的{swinger}', got: '带着饴糖，去找{swinger}（秋千上，或丁家檐下）', done: '{swinger}记下了你的好' },
    needs: { npcs: ['swinger'] },
  },
  {
    id: 'water', from: 'farmer', name: '给田里的{farmer}送口水',
    when: { seasons: ['summer', 'autumn'], from: 13, to: 17.5, fair: true, acts: ['reap', 'thresh', 'plough', 'hoe'] },
    ask: '罐里的水早喝干了，嗓子冒烟。先生要是回去，捎一口来？茶也成。',
    yes: '这就去', no: '一时走不开',
    ok: '我不走，就在这地里。',
    nope: '那我挨到日头落再说，不碍事。',
    goal: { kind: 'bring', items: ['water', 'tea'] },
    hand: '喝的来了',
    thanks: '活过来了。地头篮里还有两个煮鸡蛋，先生揣着，路上吃。',
    gift: [{ item: 'egg', n: 2 }],
    note: { on: '带一桶水或一碗茶，给田里的{farmer}', got: '带着喝的，给田里的{farmer}送去', done: '{farmer}记下了你的好' },
    needs: { npcs: ['farmer'] },
  },
  {
    id: 'fish', from: 'keeper', name: '替{keeper}向{fisher}要两尾鱼',
    bond: 2,
    when: { from: 9.5, to: 17 },
    ask: '晚上有两桌客，下酒的只有豆子，寒碜。先生到渡口，替我跟{fisher}要两尾鲜鱼？',
    yes: '我去说', no: '今日不往那边',
    ok: '他认得我的账，记上就是。',
    nope: '那就煮豆子，客人也不挑。',
    goal: { kind: 'fetch', at: 'fisher', item: 'fish', n: 2, ask: '{keeper}托我要两尾鱼', reply: '刚起的，还活着。两尾，记在他账上。' },
    hand: '鱼要来了',
    thanks: '还蹦着呢！这一壶是今年的新酒，先生拿去，不记账。',
    gift: [{ item: 'wine', n: 1 }],
    note: { on: '到渡口找{fisher}，替{keeper}要两尾鱼', half: '得了两尾鱼，给酒家的{keeper}送去', done: '{keeper}记下了你的好' },
    needs: { npcs: ['keeper', 'fisher'] },
  },
  {
    id: 'home', from: 'farmwife', name: '叫贪玩的{kid1}早些回家',
    when: { from: 13.4, to: 17.6 },
    ask: '我家{kid1}，一放学就没了影，天擦黑才回。先生见着他，叫他早些回家吃饭。',
    yes: '见着就说', no: '怕是碰不上',
    ok: '他听先生的，比听我的还灵。',
    nope: '也是，他跑得比兔子还快。',
    goal: { kind: 'tell', to: 'kid1', ask: '你娘叫你早些回家', reply: '知道啦！再看一会儿水……就一会儿！', report: '话带到了' },
    thanks: '回来了，鞋上全是泥。先生，菜地里刚拔的青菜，拿一把回去下面。',
    gift: [{ item: 'greens', n: 1 }],
    note: { on: '找着王家的{kid1}，叫他早些回家', half: '话带到了，回去跟{farmwife}说一声', done: '{farmwife}记下了你的好' },
    needs: { npcs: ['farmwife', 'kid1'] },
  },
  {
    id: 'letter', from: 'tofu', name: '替{tofu}念一封信',
    when: { from: 8.5, to: 16.4 },
    ask: '城里捎来一封信，是我娘家兄弟写的。我认不得几个字，先生给念念？',
    yes: '拿来我看', no: '等会儿再念',
    ok: '先生念，我听着。',
    nope: '不急，揣在怀里也是暖的。',
    goal: { kind: 'now', text: '信上写着：姐姐、姐夫：城里米价平，铺子里活计不重，东家待人宽厚。开春得空回来看你们，给{miller}捎一顶毡帽。勿念。' },
    thanks: '都好就好，都好就好。先生，这块豆腐是今早点的，嫩，拿着。',
    gift: [{ item: 'tofu', n: 1 }],
    note: { on: '替{tofu}念信', done: '{tofu}记下了你的好' },
    needs: { npcs: ['tofu'] },
  },
  {
    id: 'net', from: 'fisher', name: '替{fisher}守一会儿晒着的网',
    bond: 2,
    when: { acts: ['fish'], fair: true },
    ask: '岸上晒着网，前日给狗拖下水一回。先生不忙，替我在网架边守一会儿？',
    yes: '我去守着', no: '一会儿还有事',
    ok: '守一会儿就好。看看水，看看鹭鸶，也不闷。',
    nope: '那我隔一阵回头望一眼就是。',
    goal: { kind: 'act', acts: ['favor:net'], secs: 25, report: '网好好的' },
    thanks: '一根线也没少。今早网着的，先生拿一尾回去熬汤。',
    gift: [{ item: 'fish', n: 1 }],
    note: { on: '到渡口岸上的晒网架边，替{fisher}守一会儿网', half: '网守过了，跟{fisher}说一声', done: '{fisher}记下了你的好' },
    needs: { npcs: ['fisher'] },
  },
  {
    id: 'verse', from: 'teller', name: '念两句诗给说书的{teller}听',
    when: { seasons: ['spring', 'summer', 'autumn'], fair: true, acts: ['tell'] },
    ask: '老汉眼睛不中用，耳朵还灵。先生写了好诗，念两句给我听听？我编进书里，说给大伙。',
    yes: '写好了念给你', no: '我那几句不成样子',
    ok: '先生写好了来，老汉夜夜都在这槐树下。',
    nope: '先生客气。好话不怕慢。',
    goal: { kind: 'bring', items: ['poem'] },
    hand: '念给你听',
    thanks: '好，好。这两句有骨头。明晚开书，我先念它，再说书。',
    note: { on: '在草堂书案上写两句，夜里到槐树下念给{teller}听', got: '带着诗笺，夜里去槐树下找{teller}', done: '{teller}记下了你的好' },
    needs: { npcs: ['teller'], acts: ['book'] },
  },
  {
    id: 'hen', from: 'neighbor', name: '找回{neighbor}走散的母鸡',
    when: { from: 6.4, to: 16, fair: true },
    ask: '我家那只芦花母鸡又不见了，准是溜到哪片竹林、桑园里去了。先生走动的时候，帮我留个神？',
    yes: '我去找找', no: '怕是找不着',
    ok: '它认生，抱的时候轻些。找着了放回我家门前就成。',
    nope: '也是，它野惯了，天黑自己会回来。',
    goal: { kind: 'hen', report: '鸡送回来了' },
    thanks: '是它！又胖了一圈。先生，这两个蛋就是它下的，拿着。',
    gift: [{ item: 'egg', n: 2 }],
    note: { on: '{neighbor}家的芦花母鸡走散了，找着了抱回乙家门前', half: '母鸡送回去了，跟{neighbor}说一声', done: '{neighbor}记下了你的好' },
    needs: { npcs: ['neighbor'] },
  },
];

/** 说话、托事里用到的新东西（行囊里登记的）：回礼、熟人回赠的 */
export const FAVOR_ITEMS = [
  { id: 'whistle', name: '竹哨', unit: '支', kind: 'gift' as const, note: '赵大拿竹子削的哨，一吹就响，孩子们最爱。' },
  { id: 'bun', name: '麦馍', unit: '个', kind: 'food' as const, note: '灶上蒸的新麦馍，还热着。' },
  { id: 'tofu', name: '豆腐', unit: '块', kind: 'food' as const, note: '孙嫂天不亮点的豆腐，嫩。' },
  { id: 'bowl', name: '陶碗', unit: '只', kind: 'gift' as const, note: '陶大窑里烧的粗碗，敲一敲，声音清亮。' },
];
