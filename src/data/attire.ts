/**
 * 衣饰：外乡客能穿戴的衣、冠（髻）、簪、佩。带着来的几样不要钱；别的在「衣饰」那一页的铺子里买（价钱是元）。
 *
 * 次序只往后添、不改前面的：同游时两边按这张单子的序号认对方穿的是什么（world/avatar/dress.ts 的 wearToWire）。
 * 每一样的说明是本应用自己的话，只说什么样子、宋人怎么穿，不引古书。颜色按画法给（颜料与浓度，见 docs/INK.md）。
 */
import type { RGB } from '../world/ink/ink';
import type { Look, OrnId } from '../world/avatar/types';

export type AttireCat = 'yi' | 'guan' | 'zan' | 'pei';
export const CAT_NAME: Record<AttireCat, string> = { yi: '衣', guan: '冠髻', zan: '簪饰', pei: '佩' };
export interface AttireItem {
  id: string;
  name: string;
  cat: AttireCat;
  /** m 男子、f 女子、u 都能戴 */
  sex: 'm' | 'f' | 'u';
  /** 价钱（元）；0 是带着来的 */
  price: number;
  /** 一两句：什么样子、宋人怎么穿 */
  note: string;
  /** 衣、冠给这一身的几样 */
  look?: Partial<Look>;
  /** 簪、佩：戴上的是哪一样小物件 */
  orn?: OrnId;
  /** 册页上那一点颜色（衣的主色、簪佩的质地） */
  swatch: RGB;
  /** 第二色（裙、衣缘），册页上画成一小条 */
  swatch2?: RGB;
}

const MOON: RGB = [0.9, 0.93, 0.965], WHITE: RGB = [0.95, 0.95, 0.94], INKY: RGB = [0.2, 0.2, 0.22], GOLD: RGB = [0.93, 0.79, 0.45];
const SILVER: RGB = [0.86, 0.87, 0.9], JADE: RGB = [0.8, 0.9, 0.83], PEARL: RGB = [0.97, 0.96, 0.93];

export const ATTIRE: AttireItem[] = [
  // —— 男子的衣 ——
  { id: 'm-zhiduo', name: '月白直裰', cat: 'yi', sex: 'm', price: 0, swatch: MOON, swatch2: [0.6, 0.66, 0.76],
    note: '交领、直身，两侧开衩的一领长衣。出门、读书都穿它，月白素净。',
    look: { robe: MOON, robeDens: 1, body: 1, trim: [0.6, 0.66, 0.76], trimDens: 1.7, sash: [0.5, 0.55, 0.66], sashDens: 2.4, collar: 'cross', sleeve: 1, hem: 0.085 } },
  { id: 'm-duanhe', name: '青布短褐', cat: 'yi', sex: 'm', price: 0, swatch: [0.66, 0.72, 0.8], swatch2: [0.4, 0.42, 0.46],
    note: '上衣到膝，下着裤、打绑腿，袖子窄。赶路、帮人做活都利落。',
    look: { robe: [0.66, 0.72, 0.8], robeDens: 1.3, body: 0.3, trim: [0.45, 0.5, 0.58], trimDens: 1.8, sash: [0.55, 0.45, 0.36], sashDens: 1.8, collar: 'cross', sleeve: 0.4, hem: 0.42, leg: [0.4, 0.42, 0.46], legDens: 1.4 } },
  { id: 'm-beizi', name: '皂色褙子', cat: 'yi', sex: 'm', price: 0, swatch: [0.38, 0.4, 0.45], swatch2: WHITE,
    note: '对襟、直领，两侧开衩，罩在一领白衫外头。家居、待客、出门访友都相宜。',
    look: { robe: WHITE, robeDens: 1, body: 1, collar: 'duijin', coat: [0.38, 0.4, 0.45], coatDens: 1.5, coatHem: 0.2, trim: INKY, trimDens: 1.6, sash: [0.5, 0.55, 0.66], sashDens: 2.2, sleeve: 0.9, hem: 0.085 } },
  { id: 'm-lanshan', name: '天水碧襕衫', cat: 'yi', sex: 'm', price: 18, swatch: [0.82, 0.9, 0.9], swatch2: [0.3, 0.33, 0.4],
    note: '圆领、大袖，膝下一道横襕。天水碧是雨过天青的那一点淡青绿，宋人极爱。',
    look: { robe: [0.82, 0.9, 0.9], robeDens: 1, body: 0.6, collar: 'round', lan: 0.42, trim: [0.3, 0.33, 0.4], trimDens: 1.8, sash: [0.3, 0.33, 0.4], sashDens: 2, sleeve: 1, hem: 0.085 } },
  { id: 'm-daofu', name: '茶褐道服', cat: 'yi', sex: 'm', price: 18, swatch: [0.8, 0.7, 0.58], swatch2: [0.35, 0.3, 0.28],
    note: '交领大袖，衣缘深一色。闲居、游山、访友，文人多穿道服。',
    look: { robe: [0.8, 0.7, 0.58], robeDens: 1.2, body: 0.4, collar: 'cross', trim: [0.35, 0.3, 0.28], trimDens: 1.8, sash: [0.94, 0.9, 0.82], sashDens: 1.3, sleeve: 1, hem: 0.085 } },
  { id: 'm-hechang', name: '素白鹤氅', cat: 'yi', sex: 'm', price: 30, swatch: [0.97, 0.97, 0.96], swatch2: INKY,
    note: '长到脚面的一领对襟大氅，袖宽，衣缘一道黑，像鹤的羽色。披着看雪、看月最好。',
    look: { robe: [0.86, 0.89, 0.92], robeDens: 1, body: 1, collar: 'duijin', coat: [0.97, 0.97, 0.96], coatDens: 1, coatHem: 0.11, trim: INKY, trimDens: 2.1, sash: [0.5, 0.55, 0.66], sashDens: 2.2, sleeve: 1, hem: 0.085 } },
  { id: 'm-yaqing', name: '鸦青直裰', cat: 'yi', sex: 'm', price: 12, swatch: [0.42, 0.47, 0.56], swatch2: [0.3, 0.32, 0.38],
    note: '深青近墨，压得住一路风尘。',
    look: { robe: [0.42, 0.47, 0.56], robeDens: 1.3, body: 0.2, collar: 'cross', trim: [0.3, 0.32, 0.38], trimDens: 1.9, sash: [0.9, 0.86, 0.78], sashDens: 1.3, sleeve: 1, hem: 0.085 } },
  { id: 'm-jiangpao', name: '绛纱圆领', cat: 'yi', sex: 'm', price: 30, swatch: [0.8, 0.36, 0.34], swatch2: GOLD,
    note: '绛红的圆领袍，金色衣缘。上元看灯、中秋赏月，穿出去亮眼。',
    look: { robe: [0.8, 0.36, 0.34], robeDens: 1.05, body: 0.5, collar: 'round', trim: GOLD, trimDens: 1.2, sash: [0.32, 0.3, 0.3], sashDens: 2, sleeve: 1, hem: 0.085 } },
  // —— 女子的衣 ——
  { id: 'f-beizi', name: '藕荷褙子', cat: 'yi', sex: 'f', price: 0, swatch: [0.92, 0.82, 0.86], swatch2: [0.8, 0.86, 0.93],
    note: '褙子是宋时女子最寻常的外衣：对襟，长过膝，两侧开衩，里面衫与长裙。藕荷是粉里带一点灰。',
    look: { robe: [0.96, 0.96, 0.96], robeDens: 1, body: 1, skirt: [0.8, 0.86, 0.93], collar: 'duijin', coat: [0.92, 0.82, 0.86], coatDens: 1.1, coatHem: 0.32, trim: [0.7, 0.55, 0.62], trimDens: 1.5, sash: [0.62, 0.66, 0.78], sashDens: 1.6, sleeve: 0.75, hem: 0.085 } },
  { id: 'f-ruqun', name: '葱白衫缃裙', cat: 'yi', sex: 'f', price: 0, swatch: [0.86, 0.93, 0.9], swatch2: [0.96, 0.9, 0.78],
    note: '交领短衫束在裙里，裙长曳地。葱白是嫩葱那一点青白，缃是浅浅的杏黄。',
    look: { robe: [0.86, 0.93, 0.9], robeDens: 1, body: 0.8, skirt: [0.96, 0.9, 0.78], collar: 'cross', trim: [0.55, 0.62, 0.6], trimDens: 1.5, sash: [0.7, 0.55, 0.5], sashDens: 1.5, sleeve: 0.6, hem: 0.085 } },
  { id: 'f-qingbu', name: '青布衫裙', cat: 'yi', sex: 'f', price: 0, swatch: [0.6, 0.67, 0.76], swatch2: [0.36, 0.4, 0.48],
    note: '窄袖青衫、深色长裙。乡里做活的妇人这样穿，走得远路。',
    look: { robe: [0.6, 0.67, 0.76], robeDens: 1.25, body: 0.3, skirt: [0.36, 0.4, 0.48], skirtDens: 1.3, collar: 'cross', trim: [0.88, 0.88, 0.85], trimDens: 1.2, sash: [0.88, 0.86, 0.8], sashDens: 1.2, sleeve: 0.45, hem: 0.085 } },
  { id: 'f-tianshui', name: '天水碧褙子', cat: 'yi', sex: 'f', price: 18, swatch: [0.8, 0.9, 0.9], swatch2: [0.95, 0.95, 0.97],
    note: '天水碧的褙子配月白长裙，衣缘青灰。清清爽爽，像雨刚停。',
    look: { robe: [0.96, 0.96, 0.96], robeDens: 1, body: 1, skirt: [0.94, 0.95, 0.97], collar: 'duijin', coat: [0.8, 0.9, 0.9], coatDens: 1.05, coatHem: 0.3, trim: [0.45, 0.56, 0.6], trimDens: 1.6, sash: [0.45, 0.56, 0.6], sashDens: 1.6, sleeve: 0.75, hem: 0.085 } },
  { id: 'f-jiang', name: '绛红褙子', cat: 'yi', sex: 'f', price: 30, swatch: [0.78, 0.32, 0.32], swatch2: [0.97, 0.9, 0.62],
    note: '年节里的一身：绛红褙子，金色衣缘，鹅黄长裙。',
    look: { robe: [0.97, 0.95, 0.9], robeDens: 1, body: 1, skirt: [0.97, 0.9, 0.62], collar: 'duijin', coat: [0.78, 0.32, 0.32], coatDens: 1.1, coatHem: 0.38, trim: GOLD, trimDens: 1.15, sash: GOLD, sashDens: 1.2, sleeve: 0.8, hem: 0.085 } },
  { id: 'f-shiliu', name: '杏黄衫石榴裙', cat: 'yi', sex: 'f', price: 18, swatch: [0.97, 0.86, 0.6], swatch2: [0.78, 0.3, 0.3],
    note: '石榴裙是红裙的老名字，配一领杏黄衫子，亮而不艳。',
    look: { robe: [0.97, 0.86, 0.6], robeDens: 1, body: 0.7, skirt: [0.78, 0.3, 0.3], skirtDens: 1.1, collar: 'cross', trim: [0.6, 0.35, 0.3], trimDens: 1.5, sash: [0.6, 0.35, 0.3], sashDens: 1.5, sleeve: 0.65, hem: 0.085 } },
  { id: 'f-susha', name: '素纱褙子', cat: 'yi', sex: 'f', price: 30, swatch: [0.97, 0.97, 0.97], swatch2: [0.8, 0.82, 0.86],
    note: '白纱褙子，银灰衣缘，长裙浅蓝灰。月下站着，像一枝梨花。',
    look: { robe: [0.97, 0.97, 0.97], robeDens: 1, body: 1, skirt: [0.88, 0.9, 0.93], collar: 'duijin', coat: [0.985, 0.985, 0.98], coatDens: 1, coatHem: 0.22, trim: [0.76, 0.79, 0.84], trimDens: 1.5, sash: [0.76, 0.79, 0.84], sashDens: 1.5, sleeve: 0.85, hem: 0.085 } },
  { id: 'f-daxiu', name: '鸦青大袖', cat: 'yi', sex: 'f', price: 45, swatch: [0.36, 0.4, 0.5], swatch2: GOLD,
    note: '大袖衫是礼服：袖宽过膝，长到脚面，衣缘织金，里面一条米色长裙。',
    look: { robe: [0.95, 0.93, 0.88], robeDens: 1, body: 1, skirt: [0.9, 0.86, 0.78], collar: 'duijin', coat: [0.36, 0.4, 0.5], coatDens: 1.4, coatHem: 0.14, trim: GOLD, trimDens: 1.15, sash: GOLD, sashDens: 1.2, sleeve: 1, hem: 0.085 } },
  // —— 男子的冠巾 ——
  { id: 'm-jin', name: '幅巾', cat: 'guan', sex: 'm', price: 0, swatch: [0.52, 0.55, 0.62],
    note: '一方软巾裹着发髻，脑后垂两条带。', look: { hat: 'jin', hatWorn: true, hatPig: [0.52, 0.55, 0.62], hatDens: 1.75 } },
  { id: 'm-futou', name: '软脚幞头', cat: 'guan', sex: 'm', price: 0, swatch: [0.22, 0.22, 0.25],
    note: '黑纱裹头，脑后高起一个巾子，两条软脚垂到肩上。宋时男子最常戴的。', look: { hat: 'futou', hatWorn: true, hatPig: [0.22, 0.22, 0.25], hatDens: 1.6 } },
  { id: 'm-shu', name: '束发', cat: 'guan', sex: 'm', price: 0, swatch: [0.25, 0.24, 0.25],
    note: '只把发髻束起来，系一条带。', look: { hat: 'none', hatWorn: true } },
  { id: 'm-li', name: '斗笠', cat: 'guan', sex: 'm', price: 0, swatch: [0.9, 0.82, 0.62],
    note: '竹篾编的斗笠，遮日头、遮雨。', look: { hat: 'li', hatWorn: true, hatPig: [0.9, 0.82, 0.62], hatDens: 1.35 } },
  { id: 'm-dongpo', name: '东坡巾', cat: 'guan', sex: 'm', price: 12, swatch: [0.25, 0.25, 0.28],
    note: '高而方的一顶巾，里外两重墙，外墙矮一些、四角对着前后左右。相传苏东坡爱戴，文人纷纷仿它。', look: { hat: 'dongpo', hatWorn: true, hatPig: [0.25, 0.25, 0.28], hatDens: 1.6 } },
  { id: 'm-yuguan', name: '玉冠', cat: 'guan', sex: 'm', price: 18, swatch: [0.85, 0.9, 0.86],
    note: '发髻上一顶小小的玉冠，横贯一根簪。居家、会友，清贵而不张扬。', look: { hat: 'guan', hatWorn: true, hatPig: [0.85, 0.9, 0.86], hatDens: 1 } },
  // —— 女子的髻 ——
  { id: 'f-panji', name: '盘髻', cat: 'guan', sex: 'f', price: 0, swatch: [0.22, 0.21, 0.22],
    note: '发盘在脑后，插一根簪。', look: { hat: 'bun', hatWorn: true } },
  { id: 'f-baoji', name: '包髻', cat: 'guan', sex: 'f', price: 0, swatch: [0.62, 0.7, 0.78],
    note: '髻上包一方帕子，打一个结。出门、做活都不乱。', look: { hat: 'baoji', hatWorn: true, hatPig: [0.62, 0.7, 0.78], hatDens: 1.2 } },
  { id: 'f-gaoji', name: '高髻', cat: 'guan', sex: 'f', price: 12, swatch: [0.2, 0.19, 0.2],
    note: '发自四面梳上去，头顶立起一道髻环，髻前插一把小梳。', look: { hat: 'gaoji', hatWorn: true } },
  { id: 'f-huaguan', name: '花冠', cat: 'guan', sex: 'f', price: 30, swatch: [0.95, 0.6, 0.62], swatch2: [0.4, 0.55, 0.4],
    note: '髻上一圈花冠，四季的花各一两朵，宋人叫它「一年景」。', look: { hat: 'huaguan', hatWorn: true, flower: [0.95, 0.6, 0.62] } },
  // —— 簪饰（头上） ——
  { id: 'zan-yin', name: '银簪', cat: 'zan', sex: 'u', price: 0, swatch: SILVER, orn: 'zanYin', note: '素面银簪，簪头一颗圆珠。' },
  { id: 'zan-yu', name: '玉簪', cat: 'zan', sex: 'u', price: 6, swatch: JADE, orn: 'zanYu', note: '青白玉的簪，簪头琢成如意。' },
  { id: 'zan-jin', name: '金簪', cat: 'zan', sex: 'f', price: 12, swatch: GOLD, orn: 'zanJin', note: '簪头一朵小金花，五瓣。' },
  { id: 'buyao', name: '金步摇', cat: 'zan', sex: 'f', price: 30, swatch: GOLD, swatch2: PEARL, orn: 'buyao', note: '簪头垂一串珠子，末梢一片金叶，走一步摇一下。' },
  { id: 'huazan', name: '簪花', cat: 'zan', sex: 'u', price: 6, swatch: [0.95, 0.6, 0.62], swatch2: [0.4, 0.55, 0.4], orn: 'huazan', note: '鬓边一朵花。宋人不论男女，节日里都簪花。' },
  { id: 'zhuhua', name: '珠花', cat: 'zan', sex: 'f', price: 18, swatch: PEARL, swatch2: GOLD, orn: 'zhuhua', note: '髻前一簇小珍珠，攒在一片金托上。' },
  { id: 'erdang', name: '珍珠耳珰', cat: 'zan', sex: 'f', price: 12, swatch: PEARL, orn: 'erdang', note: '两耳各垂一颗珠，跟着头轻轻晃。' },
  // —— 佩（腰间） ——
  { id: 'hebao', name: '荷包', cat: 'pei', sex: 'u', price: 0, swatch: [0.5, 0.56, 0.6], orn: 'hebao', note: '小小一只布荷包，装几文钱、一点茶叶。' },
  { id: 'pei', name: '玉佩', cat: 'pei', sex: 'u', price: 18, swatch: JADE, swatch2: [0.72, 0.28, 0.24], orn: 'pei', note: '绦上系一枚青白玉璧，下垂红流苏。君子佩玉，走路就慢下来了。' },
  { id: 'nang', name: '香囊', cat: 'pei', sex: 'u', price: 12, swatch: [0.72, 0.3, 0.32], swatch2: GOLD, orn: 'nang', note: '绣一团金线花的小囊，里头装着香草。' },
  { id: 'jinbu', name: '禁步', cat: 'pei', sex: 'f', price: 30, swatch: JADE, swatch2: PEARL, orn: 'jinbu', note: '女子压裙的一串玉：一片珩、两颗珠、一枚璜，下垂长流苏。走急了玉相碰，叮当作响。' },
  { id: 'shan', name: '折扇', cat: 'pei', sex: 'u', price: 12, swatch: [0.93, 0.92, 0.88], swatch2: [0.55, 0.43, 0.33], orn: 'shan', note: '竹骨纸面的折扇，合着插在腰带上。' },
];
export const ATTIRE_BY_ID = new Map(ATTIRE.map((a) => [a.id, a]));
/** 每一类至多戴几样：衣一件、冠一样、簪三样、佩两样 */
export const CAT_MAX: Record<AttireCat, number> = { yi: 1, guan: 1, zan: 3, pei: 2 };
