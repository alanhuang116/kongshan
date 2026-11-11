/** 空山的声音：全部现场合成。这里只有类型与默认值。 */

export type Shot =
  | 'bell' | 'bowl' | 'chime' | 'muyu' | 'drum' | 'drumrim'
  | 'bead' | 'beadturn' | 'ignite' | 'ash' | 'sticks' | 'stickfall'
  | 'brush' | 'paper' | 'broom' | 'plop' | 'ripple' | 'lamp'
  | 'step' | 'woodstep' | 'door' | 'tick' | 'open' | 'close'
  | 'windbell' | 'drip' | 'pour' | 'cup';

export type Layer = 'wind' | 'birds' | 'stream' | 'rain' | 'insects' | 'chant' | 'qin' | 'bellfar' | 'eaves';

export type Weather = 'clear' | 'mist' | 'rain' | 'snow';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface Scene {
  /** 0–24 当地时刻 */
  hour: number;
  weather: Weather;
  season: Season;
  /** 0 室外 … 1 殿内 */
  indoor: number;
  /** 0…1 离水多近 */
  water: number;
  /** 0…1 高处（钟楼、云台）风更大 */
  height: number;
}

export type Space = 'open' | 'hall' | 'near';

export interface PlayOpts {
  /** 力度 0…1（默认 0.7）：响度与明亮度 */
  vel?: number;
  /** 声像 −1…1 */
  pan?: number;
  /** 音高倍率（默认 1） */
  pitch?: number;
  /** 秒，只对 brush / broom / pour 有用 */
  dur?: number;
  /** 不给则按当前 Scene.indoor 定 */
  space?: Space;
  /** 延后多少秒 */
  delay?: number;
}

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

export const SHOT_NAMES: Shot[] = [
  'bell', 'bowl', 'chime', 'muyu', 'drum', 'drumrim', 'bead', 'beadturn', 'ignite', 'ash', 'sticks', 'stickfall',
  'brush', 'paper', 'broom', 'plop', 'ripple', 'lamp', 'step', 'woodstep', 'door', 'tick', 'open', 'close',
  'windbell', 'drip', 'pour', 'cup',
];
export const LAYER_NAMES: Layer[] = ['wind', 'birds', 'stream', 'rain', 'insects', 'chant', 'qin', 'bellfar', 'eaves'];

/** 各层默认的用户音量 */
export const DEFAULT_LAYERS: Record<Layer, number> = {
  wind: 0.6, birds: 0.5, stream: 0.35, rain: 0, insects: 0, chant: 0, qin: 0, bellfar: 0.4, eaves: 0.4,
};
export const DEFAULT_SCENE: Scene = { hour: 9, weather: 'clear', season: 'autumn', indoor: 0, water: 0, height: 0 };
