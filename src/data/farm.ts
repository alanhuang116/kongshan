/**
 * 农事：行者自己那几畦地种什么、什么时候种、什么时候收；做农活时浮出来的几句话。
 *
 * 农时按北宋洛阳一带的旱作来定（与 almanac.ts 的节气农事一致）：
 *   冬小麦  秋分前后下种，出苗后越冬（雪盖着苗），开春返青、拔节、抽穗，芒种前后黄熟开镰；
 *   粟（谷子）春种秋收（清明、谷雨前后下种，白露、秋分前后掐穗）；麦收后就着麦茬种的晚谷也是秋收；
 *   豆      夏播（麦收以后点种），秋天豆荚黄了拔豆；
 *   菜      春、夏、秋都能种，长得快，一季里就能吃上；冬天地冻，不种。
 * 不写宋代还没有的作物，也不写稻作。
 *
 * QUOTES 是古人的原话，逐字对过两种底本（出处与异文见 docs/SOURCES.md「十、农事」）；
 * 其余（CROPS 的 note、TIPS、各件事里的提示）是本应用自己写的话，界面上不配书名号、不署古人的名。
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
/** 一畦地此刻的样子：荒、翻过、下了种、出苗、长高、成熟、收过（留茬） */
export type Stage = 'wild' | 'tilled' | 'sown' | 'sprout' | 'growing' | 'ripe' | 'stubble';
export const STAGE_CN: Record<Stage, string> = { wild: '荒着', tilled: '翻过了', sown: '下了种', sprout: '出了苗', growing: '长高了', ripe: '熟了', stubble: '收过了' };
/** 长的那几步（下种以后） */
export const GROW: Stage[] = ['sown', 'sprout', 'growing', 'ripe'];

export type CropId = 'wheat' | 'millet' | 'bean' | 'greens';
export interface CropDef {
  id: CropId;
  /** 叫什么 */ name: string;
  /** 哪几季能下种 */ sow: Season[];
  /** 下了种以后活在哪几季（最后一季就是收的那季）。按下种那季算起（sow 里的每一季各给一串） */
  life: Partial<Record<Season, Season[]>>;
  /** 每一季最多长到哪一步（在 life 里的季才算） */
  cap: Partial<Record<Season, Stage>>;
  /** 从这一步长到下一步要几天（照看得好的话） */
  days: { sown: number; sprout: number; growing: number };
  /** 认哪几样种子（行囊里的 id；麦粒、谷子、豆本身就能当种） */
  seeds: string[];
  /** 收下来的是什么、一垄约收几（照看得好时多些） */
  yield: { item: string; perRow: number };
  /** 收这一样叫什么 */ reap: string;
  /** 一句话（自撰） */ note: string;
}

export const CROPS: Record<CropId, CropDef> = {
  wheat: {
    id: 'wheat', name: '冬麦', sow: ['autumn'],
    life: { autumn: ['autumn', 'winter', 'spring', 'summer'] },
    cap: { autumn: 'sprout', winter: 'sprout', spring: 'growing', summer: 'ripe' },
    days: { sown: 0.7, sprout: 1.1, growing: 1.5 },
    seeds: ['seedWheat', 'wheat'], yield: { item: 'sheaf', perRow: 3 }, reap: '割麦',
    note: '秋分前后下种，雪底下过冬，开春返青，芒种前后开镰。',
  },
  millet: {
    id: 'millet', name: '谷子', sow: ['spring', 'summer'],
    life: { spring: ['spring', 'summer', 'autumn'], summer: ['summer', 'autumn'] },
    cap: { spring: 'growing', summer: 'growing', autumn: 'ripe' },
    days: { sown: 0.6, sprout: 1.0, growing: 1.4 },
    seeds: ['seedMillet', 'gu'], yield: { item: 'milletEar', perRow: 4 }, reap: '掐穗',
    note: '春天下种，秋天穗子沉了、黄了，一穗一穗掐下来。麦收后补种的晚谷也是秋收。',
  },
  bean: {
    id: 'bean', name: '豆', sow: ['summer'],
    life: { summer: ['summer', 'autumn'] },
    cap: { summer: 'growing', autumn: 'ripe' },
    days: { sown: 0.5, sprout: 0.9, growing: 1.3 },
    seeds: ['seedBean', 'bean'], yield: { item: 'bean', perRow: 2 }, reap: '拔豆',
    note: '麦收以后就着麦茬点下去，秋天豆荚黄了，连秧拔起来。',
  },
  greens: {
    id: 'greens', name: '菜', sow: ['spring', 'summer', 'autumn'],
    life: { spring: ['spring'], summer: ['summer'], autumn: ['autumn'] },
    cap: { spring: 'ripe', summer: 'ripe', autumn: 'ripe' },
    days: { sown: 0.35, sprout: 0.55, growing: 0.8 },
    seeds: ['seedGreens'], yield: { item: 'greens', perRow: 5 }, reap: '摘菜',
    note: '春夏秋都能种，长得快。春天是小白菜、菠薐，夏天苋菜，秋天白菜、萝卜。',
  },
};

/** 一畦地的样子：哪几样能种 */
export type BedKind = 'grain' | 'veg';
export const BED_CROPS: Record<BedKind, CropId[]> = { grain: ['wheat', 'millet', 'bean'], veg: ['greens'] };

/** 农事链：每样庄稼从翻地到吃上嘴要走的几步（界面的 steps） */
export const CHAIN: Record<CropId, string[]> = {
  wheat: ['翻地', '下种', '浇水', '锄草', '割麦', '捆麦', '挑', '打场', '扬场', '磨面'],
  millet: ['翻地', '下种', '浇水', '锄草', '掐穗', '打谷', '舂米'],
  bean: ['翻地', '下种', '浇水', '锄草', '拔豆'],
  greens: ['翻地', '下种', '浇水', '锄草', '摘菜'],
};

/** 季节的名字 */
export const SEASON_CN: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

// —— 古人的原话（逐字核过；出处、异文见 docs/SOURCES.md「十、农事」）——
export interface FarmQuote { id: string; text: string; source: string; note?: string }
export const QUOTES: Record<string, FarmQuote> = {
  /** 邵雍在洛阳：朋友替他置了园宅，他自己岁时耕稼 */
  song: { id: 'song', text: '富弼、司马光、吕公著诸贤退居洛中，雅敬雍，恒相从游，为市园宅。雍岁时耕稼，仅给衣食。名其居曰「安乐窝」，因自号安乐先生。', source: '《宋史·道学一·邵雍传》' },
  /** 锄草 */
  hoe: { id: 'hoe', text: '锄不厌数，周而复始，勿以无草而暂停。', source: '《齐民要术·种谷第三》' },
  /** 收：熟了就割，干了就垛 */
  reap: { id: 'reap', text: '熟，速刈。干，速积。', source: '《齐民要术·种谷第三》', note: '原书小注：刈早则镰伤，刈晚则穗折，遇风则收减。湿积则藁烂，积晚则损耗，连雨则生耳。' },
  /** 抢收 */
  rush: { id: 'rush', text: '力耕数耘，收获如寇盗之至。', source: '《汉书·食货志》（《齐民要术·种谷第三》引）' },
  /** 麦熟在夏至前后 */
  ripe: { id: 'ripe', text: '浡然而生，至于日至之时，皆熟矣。', source: '《孟子·告子上》（《齐民要术·大小麦第十》引）' },
  /** 麦子入窖前要晒透 */
  store: { id: 'store', text: '窖麦法：必须日曝令干，及热埋之。', source: '《齐民要术·大小麦第十》（小注）' },
  /** 筑场、纳禾稼 */
  field: { id: 'field', text: '九月筑场圃，十月纳禾稼。', source: '《诗经·豳风·七月》' },
  /** 打枣 */
  jujube: { id: 'jujube', text: '八月剥枣，十月获稻。', source: '《诗经·豳风·七月》' },
  /** 采桑 */
  mulberry: { id: 'mulberry', text: '春日载阳，有鸣仓庚。女执懿筐，遵彼微行，爰求柔桑。', source: '《诗经·豳风·七月》' },
  mulberry2: { id: 'mulberry2', text: '蚕月条桑，取彼斧斨，以伐远扬，猗彼女桑。', source: '《诗经·豳风·七月》' },
  /** 邵雍自己的诗句 */
  autumn: { id: 'autumn', text: '村落桑榆晚，田家禾黍秋。', source: '邵雍《游洛川初出厚载门》（《伊川击壤集》卷三）' },
  harvest: { id: 'harvest', text: '八月延秋禾熟天，农家富贵在丰年。', source: '邵雍《七日溯洛夜宿延秋庄上》（《伊川击壤集》卷五）' },
  millet: { id: 'millet', text: '黄黍秋正熟，黄鸡秋正肥。', source: '邵雍《秋怀三十六首》其十四（《伊川击壤集》卷三）' },
  nest: { id: 'nest', text: '安莫安于王政平，乐莫乐于年谷登。', source: '邵雍《安乐窝铭》（《伊川击壤集》卷十三）' },
  ready: { id: 'ready', text: '收成时正好，寒暖气初匀。', source: '邵雍《依韵和王安之少卿秋约吟》（《伊川击壤集》卷十六）' },
  peace: { id: 'peace', text: '太平时世园亭内，丰稔岁年村落间。', source: '邵雍《太平吟》（《伊川击壤集》卷十八）' },
};

// —— 本应用自己写的话（提示、旁白）——
export const TIPS = {
  /** 头一回要下种、行囊里没有种子时 */
  gift: '灶屋梁上挂着去年留的种：麦种、谷种、豆种，还有几包菜籽。',
  winter: '地冻着，翻不动，也种不下去。麦苗在雪底下睡着。',
  night: '天黑了，看不清垄，明天再做。',
  rain: '下着雨，场上的麦打不得、扬不得，等天晴。',
  noSeed: '这一季能下的种，行囊里一样也没有。',
  noWater: '桶是空的。去溪边或井上打一担水来。',
  rest: '活做完了。歇一歇。',
};
