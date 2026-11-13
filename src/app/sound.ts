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

/** 世界那边的叫法 → 声音认得的名字（只收意思明白无误的） */
const ALIAS: Record<string, string> = { cluck: 'hen', quack: 'duck' };
/**
 * 一击的声音。名字声音那边不认得的就不出（记在 unknown 里）。
 * 世界给的 vel、pan 已经把远近与左右算进去了，照它的；x、z 不往下传——
 * 只有给了位置却没给 pan 的，才把位置交给声音去算（at）。别的（pitch 是半音数、dur、delay……）原样交过去。
 */
export function play(shot: string, opts?: Bag) {
  if (!au) return;
  const names = list('SHOT_NAMES');
  let name = shot;
  if (names && !names.includes(name)) {
    name = ALIAS[shot] ?? '';
    if (!name || !names.includes(name)) { unknown.add(shot); return; }
  }
  let o = opts;
  if (o && ('x' in o || 'z' in o)) {
    const { x, z, ...rest } = o;
    o = rest;
    if (rest.pan == null && typeof x === 'number' && typeof z === 'number' && mod?.RANGE) o = { ...rest, at: [x, z] };
  }
  call('play', name, o);
}
/** 世界说的脚下 → 声音认的脚下 */
const GROUND: Record<string, string> = { earth: 'earth', grass: 'grass', stone: 'stone', wood: 'plank', floor: 'floor', wet: 'water' };
/**
 * 落一步。surface 是世界给的：earth grass stone wood floor wet。
 * 「wet」有两种——真踩在浅水里，或只是雨里的湿地；后一种还是土路，只是湿（wading 说是不是真在水里）。
 */
export function step(surface: string, o: { wading?: boolean; fast?: boolean } = {}) {
  if (!au) return;
  const vel = (o.fast ? 0.44 : 0.3) + Math.random() * 0.18;
  // 新接口：直接认世界的叫法
  if (has('step')) { call('step', surface, o.wading == null ? { vel } : { vel, wading: o.wading }); return; }
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
/** 一样持续的声音（壶里的水、研墨……）开到几成；0 停 */
export function loop(name: string, level: number) { if (au && has('setLoop')) call('setLoop', name, level); }
