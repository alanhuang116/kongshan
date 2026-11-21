/**
 * 界面与声音之间隔的一层。
 *
 * 声音（src/audio）是另一路在做的，接口还会变，所以界面不直接依赖它：到时候再去取；取不到、少了哪个函数、哪一下出了错，
 * 就少那一样声音，界面与画面照常。认新的接口（按「组」调音量、按脚下是什么出脚步声、把整份「现场」交给它），
 * 没有就退回旧的叫法。
 */
type Bag = Record<string, unknown>;
type Fn = (...a: unknown[]) => unknown;
const MODS = import.meta.glob<Bag>('../audio/index.ts');

export interface SoundPrefs { master: number; muted: boolean; levels: Record<string, number> }

/** 整个模块（看它导出了哪些清单）与那个单例 */
let mod: Bag | null = null, au: Bag | null = null;
let loading: Promise<boolean> | null = null;
/** 已经有过一次手势：模块到了就解锁 */
let wanted: SoundPrefs | null = null;
const warned = new Set<string>();
/** 世界要出、声音那边却不认得的名字（调试时看：window.__ui.sound.unknown） */
export const unknown = new Set<string>();

const has = (name: string) => typeof au?.[name] === 'function';
const list = (name: string): string[] | null => { const v = mod?.[name]; return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null; };
function call(name: string, ...args: unknown[]): unknown {
  const f = au?.[name];
  if (typeof f !== 'function') return undefined;
  try { return (f as Fn).apply(au, args); } catch (e) { if (!warned.has(name)) { warned.add(name); console.warn(`声音：${name} 没做成`, e); } return undefined; }
}

/** 去取声音那一层（开场时就取，不等它）。取不到返回 false */
export function loadSound(): Promise<boolean> {
  loading ??= (async () => {
    const load = Object.values(MODS)[0];
    if (!load) return false;
    try {
      const m = await load(), a = m.audio;
      if (!a || typeof a !== 'object') return false;
      mod = m; au = a as Bag;
      if (wanted) open(wanted);
      return true;
    } catch (e) { console.warn('声音没能备好', e); return false; }
  })();
  return loading;
}
/** 能调的几样环境声：新的是六组（风、水、禽、虫、雨雪、村），旧的只有五层；外加可以开的「远琴」 */
export function channels(): string[] {
  if (!au) return [];
  const groups = list('GROUP_NAMES'), out: string[] = [];
  if (has('setGroup') && groups?.length) out.push(...groups);
  else if (has('setLayer')) out.push(...Object.keys(LEGACY));
  if (has('setExtra') || has('setLayer')) out.push('qin');
  return out;
}
/** 旧接口里各组叫什么 */
const LEGACY: Record<string, string> = { wind: 'wind', water: 'stream', birds: 'birds', insects: 'insects', weather: 'rain' };
/** 每一样默认的音量：各组 1（按场景算出来的原样），远琴不开 */
export const defaultLevel = (id: string) => (id === 'qin' ? 0 : 1);

function open(p: SoundPrefs) {
  const after = () => {
    setMaster(p.master); setMuted(p.muted);
    for (const id of channels()) setLevel(id, p.levels[id] ?? defaultLevel(id), 3);
  };
  const r = call('unlock');
  if (r && typeof (r as Promise<unknown>).then === 'function') void (r as Promise<unknown>).then(after, (e) => console.warn('声音没能打开', e));
  else after();
}
/** 必须在用户的一次点按里调用（「入」）：之后才出声 */
export function unlock(p: SoundPrefs) { wanted = p; if (au) open(p); }

/**
 * 世界那边的叫法 → 声音认得的名字（只收意思明白无误的）。带变体的写成 [名, 变体]：世界那边的 sfx 传不了 variant，
 * 所以「下了蛋的母鸡」「一群寒鸦」这样的另给一个名字。
 */
const ALIAS: Record<string, string | readonly [string, string]> = {
  cluck: 'hen', quack: 'duck', henEgg: ['hen', 'egg'], eggHen: ['hen', 'egg'], crows: ['crow', 'flock'], jackdaws: ['crow', 'flock'],
  frogs: 'frog', bees: 'bee', magpies: 'magpie', ewe: 'sheep', mule: 'donkey', fish: 'fishJump', cranes: 'crane', chew: 'munch', whine: 'dogWhine',
  geeseFly: 'geese', snowball: ['snowCrunch', 'roll'], snow: 'snowCrunch', windchime: 'chime', watch: 'clapper', gavel: 'wood', chat: 'murmur', chatter: 'murmur',
  henLaid: ['hen', 'egg'], arrowLand: 'arrowMiss', potIn: 'arrowPot', bind: 'sheaf', eaveBell: 'windbell', dip: ['bucket', 'dip'],
  kids: 'kidsLaugh', hum: 'greet', nod: 'greet', knocker: 'knock', knuckle: ['knock', 'knuckle'], bucketWell: ['bucket', 'well'], well: ['bucket', 'well'], bucketDip: ['bucket', 'dip'], bucketLift: ['bucket', 'lift'], sack: ['grain', 'sack'],
};
/** 不认得的名字：只在头一回记一句（调试时看 window.__ui.sound.unknown），之后安静地略过 */
function skip(kind: string, name: string) {
  if (unknown.has(kind + name)) return;
  unknown.add(kind + name);
  console.warn(`声音：不认得的${kind ? '持续声' : '声音'}「${name}」，略过`);
}
/**
 * 一击的声音。名字声音那边不认得的就不出（记在 unknown 里，头一回记一句警告）。
 * 世界给的 vel、pan 已经把远近与左右算进去了，照它的；x、z 不往下传——
 * 只有给了位置却没给 pan 的，才把位置交给声音去算（at）。别的（pitch 是半音数、dur、delay、variant……）原样交过去。
 */
/**
 * 先不出声的：合成的一声「嗯」（打招呼）是声音那一路自己最没把握的，没有人用耳朵听过之前宁可不要。
 * 听过觉得可以，把它从这里删掉就出声了（hum、nod 是它的别名，也一并静着）。
 */
const HUSH = new Set(['greet', 'hum', 'nod']);
export function play(shot: string, opts?: Bag) {
  if (!au || HUSH.has(shot)) return;
  const names = list('SHOT_NAMES');
  let name = shot, variant: string | undefined;
  if (names && !names.includes(name)) {
    const al = ALIAS[shot];
    name = typeof al === 'string' ? al : al ? al[0] : '';
    variant = typeof al === 'object' ? al[1] : undefined;
    if (!name || !names.includes(name)) { skip('', shot); return; }
  }
  let o = opts;
  if (o && ('x' in o || 'z' in o)) {
    const { x, z, ...rest } = o;
    o = rest;
    if (rest.pan == null && typeof x === 'number' && typeof z === 'number' && mod?.RANGE) o = { ...rest, at: [x, z] };
  }
  if (variant && o?.variant == null) o = { ...o, variant };
  call('play', name, o);
}
/** 世界说的脚下 → 声音认的脚下 */
const GROUND: Record<string, string> = { earth: 'earth', grass: 'grass', stone: 'stone', wood: 'plank', floor: 'floor', wet: 'water' };
/**
 * 落一步。surface 是世界给的：earth grass stone wood floor wet（也认 snow）。
 * 「wet」有两种——真踩在浅水里，或只是雨里的湿地；后一种还是土路，只是湿（wading 说是不是真在水里）。
 * speed 是此刻多快（米/秒：走 1.4、夜里慢一成，快走 3.0，跑 4.6）：一步的轻重、急缓跟着它连着变；
 * run 是真在跑（速度过了 2.2）；没给 speed 时看 run / fast 估一个。
 */
export function step(surface: string, o: { wading?: boolean; fast?: boolean; run?: boolean; speed?: number } = {}) {
  if (!au) return;
  const speed = typeof o.speed === 'number' && Number.isFinite(o.speed) ? o.speed : o.run ? 4.5 : o.fast ? 3 : undefined;
  // 走 1.4 米一秒时 0.3 上下，快走 3.0 时 0.42，跑 4.6 时 0.54（再加一点随机）
  const vel = (speed != null ? Math.min(0.62, Math.max(0.26, 0.3 + 0.075 * (speed - 1.4))) : 0.3) + Math.random() * 0.16;
  // 新接口：直接认世界的叫法
  if (has('step')) {
    const a: Bag = { vel };
    if (o.wading != null) a.wading = o.wading;
    if (o.run) a.run = true;
    if (speed != null) a.speed = speed;
    call('step', surface, a);
    return;
  }
  const grounds = list('GROUND_NAMES');
  if (grounds) {
    let g = GROUND[surface] ?? 'earth', wet: number | undefined;
    if (surface === 'wet' && !o.wading) { g = 'earth'; wet = 1; }
    if (!grounds.includes(g)) g = 'earth';
    const names = list('SHOT_NAMES');
    call('play', !names || names.includes('foot') ? 'foot' : 'step', wet == null ? { ground: g, vel } : { ground: g, wet, vel });
  } else call('play', surface === 'wood' ? 'woodstep' : 'step', { vel });
}
/**
 * 此刻的「现场」。scene 是世界给的整份（处、时辰、晨昏夜、雨雪雾、风、离各样声源多近）；
 * 声音那边还是旧的时，只认 legacy 里那几样。
 */
export function setScene(scene: Bag, legacy: Bag) {
  if (!au) return;
  call('setScene', list('NEAR_KEYS') ? scene : legacy);
}
/** 听的人在哪、朝哪（有方位的声音靠它分左右） */
export function setListener(x: number, z: number, fx: number, fz: number) { call('setListener', x, z, fx, fz); }
export function setMaster(v: number) { call('setMaster', v); }
export function setMuted(m: boolean) { call('setMuted', m); }
/** 一样环境声的音量（0 关 … 1 原样） */
export function setLevel(id: string, v: number, fade = 1.2) {
  if (id === 'qin') { if (has('setExtra')) call('setExtra', 'qin', v, fade); else call('setLayer', 'qin', v, fade); return; }
  if (has('setGroup')) call('setGroup', id, v, fade);
  else if (LEGACY[id]) call('setLayer', LEGACY[id], v, fade);
}
/** 环境声压低（0…1） */
export function duck(amount: number, fade?: number) { call('duck', amount, fade); }
/**
 * 一样持续的声音（壶里的水、研墨、推磨、辘轳、一片蛙、蜂、纸鸢、远处的人声……）开到几成；0 停。
 * 可以另给它在世界里的位置（o.x、o.z）：声音按听的人去算左右远近。名字声音那边不认得的就不出（头一回记一句警告）。
 */
export function loop(name: string, level: number, o?: { x?: number; z?: number; pan?: number; fade?: number }) {
  if (!au || !has('setLoop')) return;
  const names = list('LOOP_NAMES'), n = names && !names.includes(name) ? (LOOP_ALIAS[name] ?? '') : name;
  if (names && (!n || !names.includes(n))) { if (level > 0) skip('loop:', name); return; }
  const v = typeof level === 'number' && Number.isFinite(level) ? level : 0;
  if (!o) { call('setLoop', n, v); return; }
  const opts: Bag = {};
  if (typeof o.x === 'number' && typeof o.z === 'number' && Number.isFinite(o.x) && Number.isFinite(o.z)) opts.at = [o.x, o.z];
  if (typeof o.pan === 'number') opts.pan = o.pan;
  if (typeof o.fade === 'number') opts.fade = o.fade;
  call('setLoop', n, v, opts);
}
/** 持续声的别名 */
const LOOP_ALIAS: Record<string, string> = { frogs: 'frog', bees: 'bee', hive: 'bee', mill: 'millstone', quern: 'millstone', chat: 'murmur', chatter: 'murmur', boil: 'kettle', kiteWind: 'kite' };
