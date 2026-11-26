/**
 * 行囊里每样东西的「用处」：做什么用、在哪儿用、谁要（行囊页、头一回得到时浮的那一句都用它）；
 * 与送人时一回送多少、递过去是个什么样子（说话那一路的「送东西」）。
 * 都是本应用自撰的话，不是古书里的。话里的「{某人的 id}」显示时换成名册里的名字（名字会改，这里不写死）。
 *
 * 谁喜欢什么照名册（folk.ts 的 likes），谁不肯收什么照 talk2.ts 的 META.no；tests/talk.test.ts 对着查：
 * 这里说「某某爱这个」的，名册里他真的喜欢；名册里有人喜欢的东西，都送得出去（GIFTS 里有它）。
 * 各模块后添的东西（自己文件里 defineItems）在这里按 id 补一句用处就行；没写的按归类垫一句（bag.ts 的 useOf）。
 */
import { FOLK_BY_ID } from './folk';

/** 用处：一句话，四十字以内，句末有句号 */
export const ITEM_USES: Record<string, string> = {
  sheaf: '挑到晒场上打场，打下来就是麦粒。',
  wheat: '石磨上推成面；秋天也能当麦种下；喂鸡时抓一把。',
  flour: '做面食；送人也好，舂米的{miller}饭量大，最爱面。',
  milletEar: '铺在晒场上打下谷子，再到水碓上舂成小米。',
  gu: '到水碓上舂成小米；春夏也能当谷种下。',
  millet: '熬粥做饭；喂鸡时抓一把；送人也成。',
  bean: '做豆腐的{tofu}最要好豆子；夏天也能当豆种下。',
  greens: '下锅做菜；{farmwife}、{neighbor}都爱青菜。',
  peach: '孩子们爱吃，碰见{kid1}、{kid2}他们，给几个。',
  persimmon: '甜，{kid2}最馋这个。',
  jujube: '{elder}爱嚼几颗；{kid3}他们也爱。',
  mulberryLeaf: '喂蚕的。王家的{picker}养着蚕，送她正好。',
  seedWheat: '秋天在田畴的畦里下种；{farmer}最看重好麦种。',
  seedMillet: '春天、夏天在田畴的畦里下种。',
  seedBean: '夏天在田畴的畦里下种；{tofu}也要好豆种。',
  seedGreens: '菜畦里下种，春夏秋都种得。',
  water: '浇地浇菜用。溪边舀、井上摇，一回最多挑两桶。',
  firewood: '烧火用；陶家的{potter}烧窑，最缺柴。',
  tea: '送人解渴：{elder}、{fisher}、{peddler}他们都爱喝茶。',
  wine: '送人：{farmer}、{carpenter1}、{woodcutter}这些出力气的都爱喝两盅；孩子、出家人不收。',
  egg: '送人：{farmwife}、{keeper}、{aunt}都喜欢；出家人不收。',
  fish: '送人：{keeper}拿去下酒，{woodcutter}也爱吃；出家人不收。',
  candy: '孩子们最爱：碰见{lunch}、{swinger}、{herdboy}他们，给一块。',
  thread: '送媳妇、姑娘们：{farmwife}、{picker}、{weaver}都用得着。',
  herb: '药农{herbalist}识得百草，送他正好；自己别乱吃。',
  flower: '送姑娘、媳妇们戴；{farmer}那样的粗人不要。',
  poem: '送懂诗的人：塾里的{teacher}、来访的{guest}最爱。',
  coin: '零用的钱；村里多是拿东西换东西。',
  whistle: '吹着玩，送孩子们最好。',
  bun: '路上充饥；送过路的{monk}师父也好。',
  tofu: '下锅做菜；送人也成。',
  bowl: '盛茶盛饭；送人也体面。',
};

/** 没写用处的（别的模块后添的）：按归类垫一句 */
export const KIND_USES: Record<string, string> = {
  crop: '收成：自家吃，也可以送人。',
  seed: '在田畴的畦里下种时用。',
  food: '吃食：自家吃，也可以送人。',
  gift: '送人用。',
  tool: '干活时用。',
  thing: '杂物，用得着的时候自然用上。',
};

/**
 * 递过去是个什么样子（world/acts/gift.ts 照它现做一件小器物）：
 *   basket 一只小竹篮（fill：里头是鸡蛋、桃、柿子还是枣）· sack 一只扎口的小布袋（面、麦粒、小米、豆、种子）· bowl 一只碗（fill tea 是一碗茶）·
 *   jar 一把酒壶 · fish 草绳穿着的鱼 · faggot 一捆柴 · bunch 一把（青菜、桑叶、草药）· flower 一枝花 · packet 一小包（糖、针线、菜籽）·
 *   paper 一张诗笺 · whistle 竹哨 · bun 麦馍 · tofu 荷叶托着的一块豆腐
 */
export type GiftLook = 'basket' | 'sack' | 'bowl' | 'jar' | 'fish' | 'faggot' | 'bunch' | 'flower' | 'packet' | 'paper' | 'whistle' | 'bun' | 'tofu';
export interface GiftDef {
  /** 送人时一回送多少（行囊里不够，就有多少送多少） */ n: number;
  look: GiftLook;
  /** 篮里、袋里、碗里是什么（颜色、个数由它定） */ fill?: string;
  /** 你递过去时说的（男客女客都说得出口；不给就是「这四个鸡蛋，给你。」） */ say?: string;
}
/**
 * 送得出去的东西。不在这里的不送人：水（浇地的，论桶）、铜钱、还没打的麦捆与谷穗、带壳的谷子。
 * 麦粒、小米、面这些论升的，一回送一升（不是把一囊都给人）。
 */
export const GIFTS: Record<string, GiftDef> = {
  egg: { n: 4, look: 'basket', fill: 'egg' },
  peach: { n: 3, look: 'basket', fill: 'peach' },
  persimmon: { n: 3, look: 'basket', fill: 'persimmon' },
  jujube: { n: 1, look: 'basket', fill: 'jujube' },
  flour: { n: 1, look: 'sack', fill: 'flour' },
  wheat: { n: 1, look: 'sack', fill: 'grain' },
  millet: { n: 1, look: 'sack', fill: 'millet' },
  bean: { n: 1, look: 'sack', fill: 'bean' },
  seedWheat: { n: 1, look: 'sack', fill: 'grain' },
  seedMillet: { n: 1, look: 'sack', fill: 'millet' },
  seedBean: { n: 1, look: 'sack', fill: 'bean' },
  seedGreens: { n: 1, look: 'packet', fill: 'seed' },
  greens: { n: 1, look: 'bunch', fill: 'greens' },
  mulberryLeaf: { n: 2, look: 'bunch', fill: 'leaf' },
  herb: { n: 1, look: 'bunch', fill: 'herb' },
  firewood: { n: 1, look: 'faggot' },
  tea: { n: 1, look: 'bowl', fill: 'tea', say: '刚煮的茶，趁热喝。' },
  bowl: { n: 1, look: 'bowl' },
  wine: { n: 1, look: 'jar', say: '这壶酒，给你解乏。' },
  fish: { n: 1, look: 'fish', say: '这尾鱼，拿回去熬汤。' },
  candy: { n: 1, look: 'packet', fill: 'candy' },
  thread: { n: 1, look: 'packet', fill: 'thread' },
  flower: { n: 1, look: 'flower' },
  poem: { n: 1, look: 'paper', say: '写了两句，给你看看。' },
  whistle: { n: 1, look: 'whistle' },
  bun: { n: 2, look: 'bun' },
  tofu: { n: 1, look: 'tofu' },
};
/** 村里人回赠、见面塞给你时一回给多少（鸡蛋、桃这些论个的给两个，别的一份） */
export const backN = (id: string) => Math.max(1, Math.min(2, GIFTS[id]?.n ?? 1));

/** 话里的「{某人的 id}」换成名册里的名字 */
export const named = (t: string) => t.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, id: string) => FOLK_BY_ID[id]?.name ?? '');
