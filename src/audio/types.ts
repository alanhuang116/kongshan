/** 安乐窝的声音：全部现场合成。这里只有类型、名字的清单与默认值。 */

// ———————————————————————————— 一击的声音 ————————————————————————————
export type Shot =
  // 书房与院里
  | 'qin' | 'page' | 'paper' | 'brush' | 'inkstone' | 'pour' | 'kettle' | 'fan' | 'cup' | 'bowl' | 'stone' | 'lamp' | 'ignite' | 'ash'
  | 'broom' | 'water' | 'gate' | 'door' | 'knock' | 'dew' | 'drip' | 'plop' | 'ripple'
  // 村里
  | 'rooster' | 'hen' | 'chick' | 'duck' | 'goose' | 'dog' | 'cat' | 'ox' | 'recite' | 'flute' | 'sparrow' | 'cuckoo'
  | 'hammer' | 'saw' | 'plane' | 'hoe' | 'plough' | 'bucket' | 'pound' | 'millThump' | 'rattle' | 'swing' | 'oar' | 'net'
  // 村里后来添的小声音，与两个别名（cluck＝hen、quack＝duck）
  | 'flap' | 'chirp' | 'tumble' | 'thresh' | 'laugh' | 'cluck' | 'quack'
  // 农事（farm.ts）
  | 'sickle' | 'sheaf' | 'flail' | 'winnow' | 'millstone' | 'sow' | 'dig' | 'pluck' | 'grain' | 'windlass' | 'chop' | 'split' | 'loom' | 'pull' | 'pole' | 'rustle' | 'fruitFall' | 'scoop' | 'stir'
  // 禽兽虫鱼（animals.ts）；cackle 是母鸡下蛋后那一串（＝hen 的 egg）
  | 'frog' | 'oriole' | 'magpie' | 'crow' | 'geese' | 'deer' | 'goat' | 'donkey' | 'bee' | 'wings' | 'fishJump' | 'purr' | 'peck' | 'squirrel' | 'frogPlop' | 'cackle'
  // 绵羊、羊羔、鹤、牛嚼草、狗撒娇
  | 'sheep' | 'lamb' | 'crane' | 'munch' | 'dogWhine'
  // 器物与游戏（things.ts）；chime 现在是檐下的风铃
  | 'cast' | 'strike' | 'fishSplash' | 'flop' | 'reel' | 'bite' | 'kite' | 'shuttle' | 'arrowPot' | 'arrowMiss' | 'potRim' | 'potEar' | 'toss' | 'catch' | 'swish' | 'skip' | 'snowCrunch' | 'chime' | 'lantern'
  // 观星、铺席卷席、船
  | 'starTap' | 'starLight' | 'matUnroll' | 'matRoll' | 'boatBump'
  // 纸鸢、堆雪人
  | 'flutter' | 'kiteFall' | 'snap' | 'snowPat'
  // 人（folk.ts）
  | 'clapper' | 'gong' | 'wood' | 'murmur' | 'kidsLaugh' | 'greet' | 'whip'
  // 天上
  | 'thunder' | 'gust' | 'meteor'
  // 脚步
  | 'foot' | 'step' | 'woodstep'
  // 界面
  | 'tick' | 'open' | 'close'
  // 旧（空山留下来的寺里的声音，新的场景不用）；引磬原先叫 chime，现在叫 yinqing
  | 'bell' | 'qing' | 'yinqing' | 'muyu' | 'drum' | 'drumrim' | 'bead' | 'beadturn' | 'sticks' | 'stickfall' | 'windbell';

/** 脚下是什么：土路、草、石板（桥）、木板、屋里的夯土地、浅水、积雪 */
export type Ground = 'earth' | 'grass' | 'stone' | 'plank' | 'floor' | 'water' | 'snow';
/** 抚琴的指法：散音、按音、泛音、撮（八度同弹）、滚（自高而低连拨）、拂（自低而高）、一个现编的小句 */
export type QinTech = 'open' | 'press' | 'harmonic' | 'cuo' | 'gun' | 'fu' | 'phrase';

/** open 野外；room 草堂里（小屋，余响很短）；near 贴近（几乎全干）；hall 旧：大殿 */
export type Space = 'open' | 'room' | 'near' | 'hall';

export interface PlayOpts {
  /** 力度 0…1（默认 0.7）：响度与明亮度。0.25 以下（又没给 dist / at）不是「更轻的一下」而是「更远」——世界把远近折进力度里传来时用，见 docs/AUDIO.md */
  vel?: number;
  /** 声像 −1…1 */
  pan?: number;
  /** 音高：移几个半音（0 是原样，12 高一个八度，可以有小数）。qin、pour 另有讲法，见 docs/AUDIO.md */
  pitch?: number;
  /** 音高的倍率（默认 1）：层里自己排声音时用。与 pitch 同时给就相乘 */
  rate?: number;
  /** 秒：一笔、一帚、注水、研墨、拉锯、犁、雷……有长短的声音用 */
  dur?: number;
  /** 不给则按当前场景的 indoor 定 */
  space?: Space;
  /** 延后多少秒 */
  delay?: number;
  /** 远近 0…1：0 就在身边，1 远到快听不见。越远越轻、高处越少、回声越多。far 是它的另一个名字 */
  dist?: number;
  far?: number;
  /** 世界里的位置 [x, z]（米）。给了就按 setListener 的位置与朝向自己算 pan 与 dist（各种声音传多远见 RANGE） */
  at?: readonly [number, number];
  /** 同一种声音里的哪一样（见 docs/AUDIO.md 各条） */
  variant?: string;
  /** 脚步：踩在什么上；地有多湿（0…1，不给就看场景里的雨）；是不是在跑、跑多快（米/秒） */
  ground?: Ground;
  wet?: number;
  run?: boolean;
  speed?: number;
  /** 琴：第几弦（1–7）、在这根弦上往上数几个五声音级、指法、吟（揉弦）、起音从下方（负）或上方滑入的音分、按音之后滑到相邻的音级（±1、±2） */
  string?: number;
  step?: number;
  tech?: QinTech;
  vib?: boolean;
  slide?: number;
  glide?: number;
  /** 书声：这一句几个字（4–7）、几个孩子（3–5）。梆子、更锣：敲几下（不给按此刻是第几更） */
  n?: number;
  voices?: number;
}

// ———————————————————————————— 环境 ————————————————————————————
/** 环境的底：每一层自己一路增益，由场景（setScene）去调 */
export type Bed =
  | 'air' | 'pines' | 'bamboo' | 'leaves' | 'fieldwind'
  | 'brook' | 'pond' | 'river' | 'waterfall'
  | 'birds' | 'swallows' | 'cicadas' | 'frogs' | 'crickets' | 'geese' | 'wild'
  | 'rain' | 'drips' | 'snow' | 'night'
  | 'village' | 'school' | 'work' | 'mill';

/** 用户能调的几组（界面上的滑块）：每一组是乘在场景算出来的量上的一个 0…1 */
export type Group = 'wind' | 'water' | 'birds' | 'insects' | 'weather' | 'village';

/**
 * 一直响着、由一个开关管的声音：setLoop(name, level)。
 * 煮水、研墨、拉锯、犁地；推磨、辘轳、一片蛙鸣、蜂箱边的蜂、纸鸢的线、远处几个人说话、钓线吃劲、船底下的水、推着雪球滚
 */
export type Loop = 'kettle' | 'inkstone' | 'saw' | 'plough' | 'millstone' | 'windlass' | 'frog' | 'bee' | 'kite' | 'murmur' | 'line' | 'boatWater' | 'snowRoll';

/**
 * 旧的九层的名字。界面上的声音面板（还没改）仍然按这九个名字调 setLayer：
 *   wind / birds / stream / rain / insects —— 现在是上面那几组的别名（见 LAYER_GROUP）；
 *   qin —— 远远的几声琴（现编的），可以开；
 *   chant / bellfar / eaves —— 旧：寺里的诵经、远钟、风铎，默认都关着，新的场景不会自己打开它们。
 */
export type Layer = 'wind' | 'birds' | 'stream' | 'rain' | 'insects' | 'chant' | 'qin' | 'bellfar' | 'eaves';
/** 九层里真的还是「一层」的那四个 */
export type Extra = 'chant' | 'qin' | 'bellfar' | 'eaves';
export type SlotId = Bed | Extra | Loop;

export type Weather = 'clear' | 'mist' | 'rain' | 'snow';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** 离各样东西多近（0 听不到 … 1 就在跟前）。怎么算见 docs/AUDIO.md「near 怎么算」 */
export interface Near {
  /** 溪 */ stream: number;
  /** 屋后小池 */ pond: number;
  /** 伊水 */ river: number;
  /** 远处的瀑布 */ waterfall: number;
  /** 竹林 */ bamboo: number;
  /** 松 */ pines: number;
  /** 桃林（以及桑园、柳：阔叶的树） */ grove: number;
  /** 田畴 */ fields: number;
  /** 邻家（鸡犬） */ village: number;
  /** 村塾（书声） */ school: number;
  /** 修桥的地方（锤、锯、刨） */ work: number;
  /** 水碓（水轮的吱呀与泼水） */ mill: number;
}
export type NearKey = keyof Near;

/**
 * 场景：世界每帧（或有变化时）把它交给 audio.setScene。只给变了的几项也行。
 * 带「?」的都可以不给：night / dawn / dusk 按时刻与季节自己算；rain / snow / mist 看 weather；near 按 place 取一份大概的。
 */
export interface Scene {
  /** 人在哪一处（world/site.ts 的 placeId：grove bridge yard hall pavilion fields village ferry） */
  place: string;
  /** 0–24 当地时刻 */
  hour: number;
  /** 夜、晨、昏各占几成 0…1（Atmos.night / dawn / dusk） */
  night?: number;
  dawn?: number;
  dusk?: number;
  season: Season;
  /** 此刻的雨、雪、雾 0…1（Atmos.w.rain / snow / mist，渐变着的） */
  rain?: number;
  snow?: number;
  mist?: number;
  /** 雷雨 0…1：大于 0 时雨层自己隔一阵排一声远雷（世界若自己跟着闪电放 thunder，就别给它） */
  storm?: number;
  /** 风：Atmos.wind 的原值（平日 0.03–0.19，雨天到 0.34） */
  wind?: number;
  /** 0 室外 … 1 屋里（草堂 1，观物亭 0.2 上下） */
  indoor: number;
  near?: Partial<Near>;
  /** 各样东西在人的哪一边：−1 正左 … 1 正右（不给就是正中）。用 bearingOf 算 */
  bearing?: Partial<Record<NearKey, number>>;
  /**
   * 正凝神听什么（观物亭里「听蝉鸣」「听雨」）：'cicada' 蝉、'rain' 雨；也认 'stream' 'birds' 'frogs' 'crickets' 'bamboo' 'pines' 'river' 'recite'。
   * 给了它，那一层在三秒里提上来（约 +7 分贝），别的环境声退下去；回到 null 再三秒里还原。
   * 'stars'（观星）不一样：不提哪一层，是整个夜更静——风更轻、虫声更细，偶尔远处一声犬吠、一阵更梆。
   */
  focus?: string | null;
  /** 地上的积雪 0…1（Atmos.snowCover）。不给就由引擎自己按下雪多久估（与 Atmos 的涨落一样快慢）：踩雪的脚步、雪后的静跟着它 */
  cover?: number;
  /** 旧：天气（没给 rain / snow / mist 时才看它） */
  weather?: Weather;
  /** 旧：离水多近（没给 near 时当作 near.stream） */
  water?: number;
  /** 旧：高处风大（现在只让风多三成） */
  height?: number;
}
/** 算好的场景：缺的都补上了，层里只读这个 */
export interface SceneState {
  place: string;
  hour: number;
  night: number;
  dawn: number;
  dusk: number;
  /** 1 − night */
  day: number;
  season: Season;
  rain: number;
  snow: number;
  mist: number;
  storm: number;
  /** 0…1：Atmos.wind 除以 0.25 之后的（平日 0.35 上下，雨天能到 1） */
  wind: number;
  indoor: number;
  near: Near;
  bearing: Record<NearKey, number>;
  /** 正凝神听的那一样（没有是 null） */
  focus: string | null;
  /** 雨后还湿着几成（引擎自己记着：下雨时涨，雨停后一两分钟慢慢干） */
  wet: number;
  /** 地上的积雪几成（世界给的，或引擎按下雪多久估的） */
  cover: number;
}

/** 旧：诵经层的选项 */
export interface ChantOpts {
  /** 每分钟多少字（默认 72） */
  bpm?: number;
  /** 每句字数，循环；不给就是《心经》五十二小句 */
  phrases?: number[];
  /** 每字一击木鱼（默认 true） */
  fish?: boolean;
  /** 每一遍起头一声磬（默认 true） */
  bowl?: boolean;
}

// ———————————————————————————— 名字的清单 ————————————————————————————
/** 试听台上分的几组，外加界面与旧的 */
export const SHOT_GROUPS: Record<'study' | 'village' | 'farm' | 'animals' | 'things' | 'folk' | 'sky' | 'steps' | 'ui' | 'legacy', Shot[]> = {
  study: ['qin', 'page', 'paper', 'brush', 'inkstone', 'pour', 'kettle', 'fan', 'cup', 'bowl', 'stone', 'lamp', 'ignite', 'ash', 'broom', 'water', 'gate', 'door', 'knock', 'dew', 'drip', 'plop', 'ripple'],
  village: ['rooster', 'hen', 'chick', 'duck', 'goose', 'dog', 'cat', 'ox', 'recite', 'flute', 'sparrow', 'cuckoo', 'hammer', 'saw', 'plane', 'hoe', 'plough', 'bucket', 'pound', 'millThump', 'rattle', 'swing', 'oar', 'net', 'flap', 'chirp', 'tumble', 'thresh', 'laugh', 'cluck', 'quack'],
  farm: ['sickle', 'sheaf', 'flail', 'winnow', 'millstone', 'sow', 'dig', 'pluck', 'grain', 'windlass', 'chop', 'split', 'loom', 'pull', 'pole', 'rustle', 'fruitFall', 'scoop', 'stir'],
  animals: ['frog', 'oriole', 'magpie', 'crow', 'geese', 'deer', 'goat', 'donkey', 'bee', 'wings', 'fishJump', 'purr', 'peck', 'squirrel', 'frogPlop', 'cackle', 'sheep', 'lamb', 'crane', 'munch', 'dogWhine'],
  things: ['cast', 'strike', 'fishSplash', 'flop', 'reel', 'bite', 'kite', 'shuttle', 'arrowPot', 'arrowMiss', 'potRim', 'potEar', 'toss', 'catch', 'swish', 'skip', 'snowCrunch', 'chime', 'lantern', 'starTap', 'starLight', 'matUnroll', 'matRoll', 'boatBump', 'flutter', 'kiteFall', 'snap', 'snowPat'],
  folk: ['clapper', 'gong', 'wood', 'murmur', 'kidsLaugh', 'greet', 'whip'],
  sky: ['thunder', 'gust', 'meteor'],
  steps: ['foot', 'step', 'woodstep'],
  ui: ['tick', 'open', 'close'],
  legacy: ['bell', 'qing', 'yinqing', 'muyu', 'drum', 'drumrim', 'bead', 'beadturn', 'sticks', 'stickfall', 'windbell'],
};
export const SHOT_NAMES: Shot[] = Object.values(SHOT_GROUPS).flat();

export const BED_NAMES: Bed[] = [
  'air', 'pines', 'bamboo', 'leaves', 'fieldwind', 'brook', 'pond', 'river', 'waterfall',
  'birds', 'swallows', 'cicadas', 'frogs', 'crickets', 'geese', 'wild', 'rain', 'drips', 'snow', 'night', 'village', 'school', 'work', 'mill',
];
export const GROUP_NAMES: Group[] = ['wind', 'water', 'birds', 'insects', 'weather', 'village'];
export const LOOP_NAMES: Loop[] = ['kettle', 'inkstone', 'saw', 'plough', 'millstone', 'windlass', 'frog', 'bee', 'kite', 'murmur', 'line', 'boatWater', 'snowRoll'];
export const GROUND_NAMES: Ground[] = ['earth', 'grass', 'stone', 'plank', 'floor', 'water', 'snow'];
export const NEAR_KEYS: NearKey[] = ['stream', 'pond', 'river', 'waterfall', 'bamboo', 'pines', 'grove', 'fields', 'village', 'school', 'work', 'mill'];
/** 旧的九层（界面上的声音面板在用） */
export const LAYER_NAMES: Layer[] = ['wind', 'birds', 'stream', 'rain', 'insects', 'chant', 'qin', 'bellfar', 'eaves'];
export const EXTRA_NAMES: Extra[] = ['chant', 'qin', 'bellfar', 'eaves'];

/** 每一层归哪一组 */
export const GROUP_OF: Record<Bed, Group> = {
  air: 'wind', pines: 'wind', bamboo: 'wind', leaves: 'wind', fieldwind: 'wind', night: 'wind',
  brook: 'water', pond: 'water', river: 'water', waterfall: 'water',
  birds: 'birds', swallows: 'birds', geese: 'birds', wild: 'birds',
  cicadas: 'insects', frogs: 'insects', crickets: 'insects',
  rain: 'weather', drips: 'weather', snow: 'weather',
  village: 'village', school: 'village', work: 'village', mill: 'village',
};
/** 旧的层名 → 组（setLayer('stream', v) 就是 setGroup('water', v)） */
export const LAYER_GROUP: Partial<Record<Layer, Group>> = { wind: 'wind', birds: 'birds', stream: 'water', rain: 'weather', insects: 'insects' };

/** 各组默认的用户音量：1 就是「按场景算出来的原样」 */
export const DEFAULT_GROUPS: Record<Group, number> = { wind: 1, water: 1, birds: 1, insects: 1, weather: 1, village: 1 };

/**
 * 世界自己放的一击归哪一组——用户调的音量也管它们，不只管层（不然把「村」关了，看得见的那只鸡照样在叫）：
 * 鸟与林子里的松鼠、远山的鹿归「鸟」（与「野」那一层同组），蛙与蜂归「虫」，禽畜、牧笛、别人的活计归「村」，远雷归「雨」。
 * 玩家自己手上的声音（纸笔、茶酒、琴、门、脚步……）不在这里，只跟着总音量走。见 engine.ts 的 userGain。
 */
export const SHOT_GROUP: Partial<Record<Shot, Group>> = {
  oriole: 'birds', magpie: 'birds', crow: 'birds', geese: 'birds', crane: 'birds', cuckoo: 'birds', sparrow: 'birds', chirp: 'birds', tumble: 'birds', wings: 'birds', squirrel: 'birds', deer: 'birds',
  frog: 'insects', frogPlop: 'insects', bee: 'insects',
  fishJump: 'water',
  rooster: 'village', hen: 'village', cluck: 'village', cackle: 'village', chick: 'village', duck: 'village', quack: 'village', goose: 'village', dog: 'village', dogWhine: 'village', cat: 'village', purr: 'village',
  ox: 'village', munch: 'village', goat: 'village', sheep: 'village', lamb: 'village', donkey: 'village', peck: 'village', flap: 'village', flute: 'village',
  hammer: 'village', saw: 'village', plane: 'village', hoe: 'village', plough: 'village', pound: 'village', millThump: 'village', rattle: 'village', whip: 'village', clapper: 'village', gong: 'village', wood: 'village', drum: 'village',
  loom: 'village', chop: 'village', split: 'village', flail: 'village', thresh: 'village', winnow: 'village', sickle: 'village', sheaf: 'village', sow: 'village', dig: 'village', pull: 'village', pole: 'village',
  scoop: 'village', stir: 'village', grain: 'village', millstone: 'village', windlass: 'village', bucket: 'village', net: 'village', oar: 'village', swing: 'village', shuttle: 'village',
  thunder: 'weather',
};
/**
 * 上面那些里头玩家自己也会做的活计（割麦、锄地、打水、摇橹……）：没给位置的（玩家手上那一下）、离听的人三米半以内的，都不归组——
 * 「村」关了，自己割麦照样有声；村里别人在干的才跟着「村」走。禽畜鸟兽也一样：摸到跟前的那一只（三米半以内）照常出声。
 */
export const WORK_SHOTS: ReadonlySet<Shot> = new Set<Shot>([
  'hammer', 'saw', 'plane', 'hoe', 'plough', 'pound', 'loom', 'chop', 'split', 'flail', 'thresh', 'winnow', 'sickle', 'sheaf', 'sow', 'dig', 'pull', 'pole', 'scoop', 'stir', 'grain', 'millstone', 'windlass', 'bucket', 'net', 'oar', 'swing', 'shuttle', 'wood',
]);
/**
 * 人声：合成的人的声音——书声、远处说话、孩子笑、一声「嗯」（也连着一直响着的 murmur）。另有一个开关（audio.setVoices），不在六组里。
 * 引擎这边默认是 1（原样）；界面上默认关着（src/app/sound.ts）：人声最容易听着不像、听着瘆人，没有人用耳朵听过之前宁可不出。
 * 书声关着时，村塾那里换成不出人声的动静：偶尔翻一页书，先生的戒尺在案上轻轻嗒两下（recite.ts 的 lessonCue）。
 */
export const VOICE_SHOTS: readonly Shot[] = ['recite', 'murmur', 'laugh', 'kidsLaugh', 'greet'];
/** 一直响着的里头归组的：池边的一片蛙、蜂箱归「虫」；远处人声归人声 */
export const LOOP_GROUP: Partial<Record<Loop, Group | 'voices'>> = { frog: 'insects', bee: 'insects', murmur: 'voices' };
/** 旧九层默认的用户音量：前五个是组（1＝原样），后四个是真的层（默认关） */
export const DEFAULT_LAYERS: Record<Layer, number> = { wind: 1, birds: 1, stream: 1, rain: 1, insects: 1, chant: 0, qin: 0, bellfar: 0, eaves: 0 };

export const ZERO_NEAR: Near = { stream: 0, pond: 0, river: 0, waterfall: 0, bamboo: 0, pines: 0, grove: 0, fields: 0, village: 0, school: 0, work: 0, mill: 0 };
export const DEFAULT_SCENE: Scene = { place: 'grove', hour: 9, season: 'spring', indoor: 0 };

/** 各样声音能传多远（米）：到这么远就是 dist = 1。给了 at（世界里的位置）的按它算；把远近折进力度里传来的（vel < 0.25）也按它倒推 */
export const RANGE: Partial<Record<Shot, number>> = {
  // 书声原先给了 110 米：人在草堂里（离村塾九十多米）也听得见一班孩子在念，和屋里的整个环境声一样响——太远了。现在 55 米
  rooster: 160, dog: 240, goose: 160, cuckoo: 300, flute: 320, thunder: 4000, ox: 140, recite: 55, hammer: 100, millThump: 130, pound: 110, rattle: 130, saw: 70, plane: 50,
  hen: 45, cluck: 45, chick: 25, duck: 60, quack: 60, thresh: 80, laugh: 60, chirp: 40, cat: 40, sparrow: 40, hoe: 70, plough: 80, bucket: 50, swing: 35, oar: 120, net: 110, knock: 60, gate: 50, door: 40, gust: 120, stone: 14, bowl: 12,
  // 农事
  sickle: 30, sheaf: 18, flail: 90, winnow: 50, millstone: 45, sow: 18, dig: 55, pluck: 20, grain: 25, windlass: 60, water: 30, chop: 110, split: 25, loom: 40, pull: 18, pole: 20, rustle: 60, fruitFall: 25, scoop: 30, stir: 18,
  // 禽兽虫鱼：鹿、驴、雁、寒鸦叫得远；猫的呼噜、蜂、鸡啄食要凑近了才有
  frog: 120, oriole: 130, magpie: 130, crow: 220, geese: 900, deer: 500, goat: 90, donkey: 320, bee: 9, wings: 60, fishJump: 55, purr: 3.5, peck: 12, squirrel: 45, frogPlop: 30, cackle: 70,
  // 绵羊一群在河滩上，传得不如山羊远；鹤唳能传一两里；牛嚼草、狗撒娇要凑近了才有
  sheep: 80, lamb: 55, crane: 1500, munch: 9, dogWhine: 14,
  // 器物与游戏
  cast: 30, strike: 25, fishSplash: 55, flop: 14, reel: 14, bite: 12, kite: 40, shuttle: 30, arrowPot: 40, arrowMiss: 30, potRim: 45, potEar: 40, toss: 16, catch: 16, swish: 12, skip: 70, snowCrunch: 22, chime: 45, lantern: 14, matUnroll: 18, matRoll: 18, boatBump: 60, flutter: 40, kiteFall: 30, snap: 30, snowPat: 14, windbell: 50,
  // 人：更梆、更锣是要传遍全村的
  clapper: 700, gong: 900, wood: 60, murmur: 70, kidsLaugh: 90, greet: 16, whip: 260,
  // 说书人的书鼓（旧的 drum 现在是它）
  drum: 110, drumrim: 70,
  meteor: 100000,
};
/** 没列在上面的声音能传多远 */
export const RANGE_DEFAULT = 36;
