/**
 * 安乐窝：把天时、远景、地与水、草木、屋舍、人物生灵、烟雨、行者、镜头与各样可做的事装在一起的那个东西。界面（React）只和它说话。
 *
 * 各部分各在各的模块里，这里按「有就装上、没有就空着」来装（哪一部分出了错，只少那一部分）：
 *   env/atmos 天时 · env/far 远景 · env/land 地与水 · env/flora 草木 · build 屋舍器物 · life 人物生灵 · fx 烟雨花瓣 · avatar 行者 · acts 可做的事
 */
import * as THREE from 'three';
import { World, detectQuality, type Pointer, type Quality } from './core/World';
import { FX_LAYER, PIG, U, setRoofs, wash, type Roof } from './ink/ink';
import { Atmos, SUN, type Season, type Weather } from './env/atmos';
import { createLand, type Land } from './env/land';
import { Nav, PLACE } from './nav';
import { Player } from './player';
import { SITE, YARD_Y, ground, pathDist, riverAt, streamAt } from './site';
import type { Act, Spot } from './acts/types';
import { createActs } from './acts';
import { clearSky, pickSky, type SkyCard } from './acts/skyinfo';
import { createGhost, type Ghost } from './ghost';
import type { Avatar, PoseName } from './avatar/types';
import { addDisc, placeAt, setDynamic, setTerrain, standable, useSolids, waterDepth, type SolidLike, type Zone } from './walk';
import { Mem } from './mem';
import { Bag } from './bag';

export type TimeMode = 'now' | 'dawn' | 'day' | 'dusk' | 'night';
/** 画面上的一个标记：走近了可以做的事 */
export interface Marker { id: string; label: string; x: number; y: number; visible: boolean; dist: number; near: boolean }
/** 走近了可以做的一件事 */
export interface Thing { id: string; label: string; anchor: THREE.Vector3; spot: Spot; radius: number; /** 多远就看得见它的标记 */ see: number; kind: 'act' | 'door'; /** 此刻有没有（有的事只在某些时辰、时令有） */ on?(): boolean; run(): void }
export interface KsEvents {
  progress?(k: number, label: string): void;
  /** 人走到了另一处（处的 id） */
  place?(id: string): void;
  /** 走近 / 离开了一件可以做的事 */
  near?(thing: { id: string; label: string; kind: 'act' | 'door' } | null): void;
  /** 活动的状态变了（界面据此显示提示、文字等） */
  act?(id: string | null, state: Record<string, unknown>): void;
  /** 一件事做完，记进册子 */
  log?(entry: { kind: string; n?: number; text?: string; minutes?: number }): void;
  /** 落一步：脚下是什么（earth grass stone wood floor wet）；run 是不是真在跑（速度过了 2.2 米/秒），speed 是此刻的速度 */
  step?(surface: string, o?: { run: boolean; speed: number }): void;
  /** 出一声；振一下（手机） */
  sfx?(shot: string, opts?: { vel?: number; pan?: number; pitch?: number; dur?: number; delay?: number; x?: number; z?: number }): void;
  buzz?(ms: number | number[]): void;
  /** 环境声压低（0…1） */
  duck?(amount: number, fade?: number): void;
  /** 一样持续的声音（kettle 壶里的水声、inkstone 研墨……）开到几成；0 停 */
  loop?(name: string, level: number, o?: { x?: number; z?: number }): void;
  /** 请界面打开某一页（album 观象册、map 村图、time 天时……） */
  open?(sheet: string): void;
  /** 世界自己把时辰拨了（榻上一觉到天亮、亭中小睡、时辰流转着）：界面好让存档跟上 */
  clock?(hour: number): void;
  /** 过了一夜，到了第几日（从头一回来算起，第一天是 0） */
  day?(n: number): void;
  /** 世界的存档里有一份变了（k.mem）：界面存到本机 */
  mem?(ns: string, v: unknown): void;
  /** 行囊里的东西变了 */
  bag?(items: Record<string, number>): void;
  /** 画面下方浮一句话（「得麦三捆」「王婶记下了你的好」）；kind 给界面挑样式 */
  note?(text: string, kind?: string): void;
  /** 跑起来了 / 停下了（界面上「疾」那一枚跟着亮） */
  run?(on: boolean): void;
  /** 夜里点了天上一处：出一张星笺（null 收起） */
  skyCard?(card: SkyCard | null): void;
}
/** 此刻该是什么声音：给声音那一层的一份「现场」（每隔一小会儿取一次） */
export interface Soundscape {
  place: string; hour: number; night: number; dawn: number; dusk: number; season: Season; rain: number; snow: number; mist: number; wind: number; indoor: number;
  /** 地上的积雪 0…1（Atmos.snowCover）：踩雪的脚步、雪后的静跟着它 */
  cover: number;
  /** 正在专心听什么（观物亭里听蝉、听雨时）：声音那一层把它提起来、别的压下去 */
  focus: string | null;
  /** 离各样声源多近（0…1） */
  near: { stream: number; pond: number; river: number; bamboo: number; pines: number; grove: number; fields: number; village: number; school: number; work: number; waterfall: number; mill: number };
  /** 雷雨（0…1）：夏天下大雨时，声音自己安排远处的雷 */
  storm: number;
}
export interface KsOpts {
  quality?: string | null; season: Season; weather: Weather; hour: number; moonPhase: number; start?: string; events: KsEvents;
  /** 世界的存档（上回 events.mem 存下的那些份） */
  mem?: Record<string, unknown> | null;
  /** 时辰流转得多快：每过一秒画里过多少个钟头（0 停着；1/60 是一秒一分钟——一个钟头一分钟） */
  flow?: number;
}

/** 别的几路做的模块：这里只认它们的形状 */
interface FloraLike { group: THREE.Group; setSeason(s: Season): void; update(dt: number, t: number, o: { night: number; wind: number; player: THREE.Vector3 }): void; bloomSpots: THREE.Vector3[] }
export interface BuildLike { group: THREE.Group; hallRoof: THREE.Object3D; hallFront: THREE.Object3D; anchors: Record<string, THREE.Object3D>; parts: Record<string, THREE.Object3D>; setLamp(k: number): void; update(dt: number, t: number): void; setSeason?(s: Season): void }
export interface NpcLike { id: string; name: string; root: THREE.Object3D; pos: THREE.Vector3; present: boolean; attend(p: THREE.Vector3 | null): void; avatar?: Avatar }
export interface LifeLike { group: THREE.Group; npcs: Record<string, NpcLike>; blockers: Array<{ x: number; z: number; r: number }>; setSeason(s: Season): void; update(dt: number, t: number, o: { hour: number; night: number; rain: number; snow: number; player: THREE.Vector3; camera: THREE.Camera }): void }
export interface FxLike {
  group: THREE.Group; setSeason(s: Season): void; setBloomSpots(p: THREE.Vector3[]): void;
  update(dt: number, t: number, f: { camera: THREE.PerspectiveCamera; player: THREE.Vector3; hour: number; night: number; dawn: number; dusk: number; rain: number; snow: number; mist: number; wind: number; windDir: THREE.Vector2; indoor: number; lamp: number }): void;
  smoke(pos: THREE.Vector3, o?: { size?: number; rise?: number; amount?: number; warm?: number }): { on: boolean; amount: number; pos: THREE.Vector3; dispose(): void };
  burst(kind: 'petal' | 'leaf' | 'splash' | 'dew', pos: THREE.Vector3, n?: number): void;
}
interface FarLike { group: THREE.Group; update(dt: number, t: number, o: { camera: THREE.PerspectiveCamera; hour: number; night: number; season: Season; wind: number }): void; setSeason(s: Season): void }

const pause = () => new Promise<void>((r) => setTimeout(r, 0));
// 各部分都是「到时候再去取」：还没做好、或出了错，就当它没有
const M_FAR = import.meta.glob<Record<string, unknown>>('./env/far.ts');
const M_FLORA = import.meta.glob<Record<string, unknown>>('./env/flora/index.ts');
const M_BUILD = import.meta.glob<Record<string, unknown>>('./build/index.ts');
const M_LIFE = import.meta.glob<Record<string, unknown>>('./life/index.ts');
const M_FX = import.meta.glob<Record<string, unknown>>('./fx/index.ts');
const M_AVATAR = import.meta.glob<Record<string, unknown>>('./avatar/index.ts');
async function part<T>(mods: Record<string, () => Promise<Record<string, unknown>>>, name: string, use: (m: Record<string, unknown>) => T | Promise<T>): Promise<T | null> {
  const load = Object.values(mods)[0];
  if (!load) return null;
  try { return await use(await load()); } catch (e) { console.warn(`${name} 没能备好`, e); return null; }
}

export class Anlewo {
  world!: World; q!: Quality; atmos!: Atmos; land!: Land; nav!: Nav; player!: Player;
  far: FarLike | null = null; flora: FloraLike | null = null; build: BuildLike | null = null; life: LifeLike | null = null; fx: FxLike | null = null;
  /** 陶家窑口的烟（冬天歇窑时关上） */
  kiln: { on: boolean } | null = null;
  timings: Record<string, number> = {};
  acts: Record<string, Act> = {};
  act: Act | null = null;
  things: Thing[] = [];
  near: Thing | null = null;
  events: KsEvents;
  markers: Marker[] = [];
  /** 开场时界面压在画面上的一层雾（0…1） */
  veil = 1;
  season: Season; timeMode: TimeMode | number = 'day';
  private proj = { x: 0, y: 0, visible: false, dist: 0 };
  private keys = new Set<string>();
  private pending: string | null = null;
  private tapRing!: THREE.Mesh; private tapT = 9;
  private pinch0 = 0;
  private seatT = 0; private riseT = 0;
  /** 走到一件事跟前、正在站定转身（站好了就开始） */
  private arrive: { t: number; start(): void } | null = null;
  private inHall = false; private outPitch = 0.14; private outDist = 8;
  /** 题名页背后的俯瞰（镜头在高处缓缓移着，看得见整片山水） */
  private over: { pos: THREE.Vector3; look: THREE.Vector3; t: number } | null = null;
  /** 题名页那幅俯瞰正开着 */
  get overview() { return !!this.over; }
  /** 「入」时从哪里接着走（上回停下的地方；界面给，空着就从桃林进来） */
  resumeAt: { x: number; z: number; yaw: number; zone: string } | null = null;
  private startId = 'grove';
  /** 已经观过的象（卦名）：界面从存档里读出来放进这里，观到新的就添上 */
  found = new Set<string>();
  /** 正在专心听什么（给声音用；观物亭里设） */
  focus: string | null = null;
  /** 今天的节气名（界面按日历给；农夫说话时用。不给就按季节轮着说） */
  term: string | null = null;
  private gnomon: THREE.Mesh | null = null;
  private windDir = new THREE.Vector2();
  /** 世界的存档（各模块按名字取自己那一份）、行囊 */
  mem!: Mem; bag!: Bag;
  /** 时辰流转：每秒过多少个钟头（0 停）。'now'（随此刻）时不用它 */
  flow = 0;
  /** 第几日（头一回来是第 0 日）；过了子夜、榻上睡一觉都加一 */
  day = 0;
  /** 过了一夜时要做的（庄稼长一截、村里人的日子翻一页……）：各模块 push 进来 */
  onDay: Array<(day: number) => void> = [];
  private clockT = 0;
  /** 跑：按住 Shift、点一下 Shift 锁住、或界面上的「疾」 */
  runLock = false;
  private shiftAt = 0; private shiftUsed = false;

  private constructor(o: KsOpts) { this.events = o.events; this.season = o.season; }

  static async create(canvas: HTMLCanvasElement, o: KsOpts): Promise<Anlewo> {
    const k = new Anlewo(o);
    let tPrev = performance.now();
    /** 每一段花了多少毫秒（看哪里慢） */
    const mark = (name: string) => { const n = performance.now(); k.timings[name] = Math.round(n - tPrev); tPrev = n; };
    const prog = (v: number, s: string) => o.events.progress?.(v, s);
    k.q = detectQuality(o.quality);
    k.mem = new Mem(o.mem);
    k.mem.onSave = (ns, v) => o.events.mem?.(ns, v);
    k.bag = new Bag(k.mem);
    k.bag.onChange = (it) => o.events.bag?.(it);
    k.bag.onNote = (t) => k.note(t, 'bag');
    k.day = Math.max(0, Math.floor(k.mem.get('day', 0)));
    k.flow = Math.max(0, o.flow ?? 0);
    k.world = new World(canvas, k.q);
    const scene = k.world.scene;
    prog(0.05, '铺纸');
    k.atmos = new Atmos(scene, k.world.painter);
    k.atmos.moonPhase = o.moonPhase;
    k.atmos.setSeason(o.season); k.atmos.setHour(o.hour, true); k.atmos.setWeather(o.weather, true);
    mark('renderer');
    await pause();
    prog(0.12, '远山');
    k.far = await part(M_FAR, '远景', (m) => {
      if (typeof m.createFar === 'function') return (m.createFar as (a: unknown) => FarLike)({ density: k.q.density, tex: k.q.tex, season: o.season });
      const g = (m.buildFar as (a: unknown) => THREE.Group)({ density: k.q.density, tex: k.q.tex });
      return { group: g, update() { /* 静的 */ }, setSeason() { /* 无 */ } } as FarLike;
    });
    if (k.far) scene.add(k.far.group);
    mark('far');
    await pause();
    prog(0.3, '地与水');
    k.land = createLand(k.q, o.season);
    scene.add(k.land.group);
    setTerrain(k.land.height);
    mark('land');
    await pause();
    prog(0.42, '结庐');
    k.build = await part(M_BUILD, '屋舍', (m) => (m.createBuildings as (a: unknown) => Promise<BuildLike>)({ q: k.q, season: o.season }));
    if (k.build) { scene.add(k.build.group); const sol = k.build.group.userData.solids as SolidLike[] | undefined; if (sol?.length) { useSolids(sol); setRoofs(roofsFrom(sol)); } }
    mark('build');
    await pause();
    prog(0.58, '种桃');
    k.flora = await part(M_FLORA, '草木', (m) => (m.createFlora as (a: unknown) => FloraLike)({ q: k.q, season: o.season }));
    if (k.flora) { scene.add(k.flora.group); for (const t of (k.flora as FloraLike & { extraTrunks?: Array<{ x: number; z: number; r: number }> }).extraTrunks ?? []) addDisc(t.x, t.z, t.r); }
    mark('flora');
    await pause();
    prog(0.74, '鸡犬桑麻');
    k.life = await part(M_LIFE, '人物', (m) => (m.createLife as (a: unknown) => LifeLike)({ q: k.q, season: o.season, sfx: (s: string, a?: { vel?: number; x?: number; z?: number }) => k.sfxAt(s, a) }));
    if (k.life) scene.add(k.life.group);
    k.fx = await part(M_FX, '烟雨', (m) => (m.createFx as (a: unknown) => FxLike)({ q: k.q, season: o.season, ripple: (x: number, z: number, s: number) => k.land.ripple(x, z, s) }));
    if (k.fx) {
      scene.add(k.fx.group);
      // 落花不用草木给的那十几处：烟雨那边自己按六十四株桃落，更匀
      const A = k.build?.anchors, fx = k.fx as FxLike & { setChimneys?(p: Array<{ id: string; pos: THREE.Vector3 }>): void; setLamps?(p: THREE.Vector3[], size?: number): void };
      if (A) {
        const ch: Array<{ id: string; pos: THREE.Vector3 }> = [];
        if (A.chimney) ch.push({ id: 'wing', pos: A.chimney.position.clone() });
        for (const id of ['a', 'b', 'd', 'e', 'f', 'g']) { const c = A['chimney' + id.toUpperCase()]; if (c) ch.push({ id, pos: c.position.clone() }); }
        k.safe('fx', () => fx.setChimneys?.(ch));
        // 夜里亮着的：草堂案上那盏、两扇窗，各家门口的灯笼
        const H = SITE.hall, lamps: THREE.Vector3[] = [];
        if (A.lamp) lamps.push(A.lamp.position.clone());
        for (const s of [-1, 1]) lamps.push(new THREE.Vector3(H.x + (s * H.w) / 3, YARD_Y + H.floor + 1.6, H.z + H.d / 2 + 0.25));
        for (const id of ['A', 'B', 'D', 'E', 'F', 'G']) { const d = A['door' + id]; if (d) lamps.push(d.position.clone().add(new THREE.Vector3(0, 1.9, 0))); }
        k.safe('fx', () => fx.setLamps?.(lamps, 2.2));
        // 陶家的馒头窑：春夏秋烧着，冬天歇窑（setSeason 里关）
        if (A.kilnSmoke) k.safe('fx', () => { k.kiln = k.fx!.smoke(A.kilnSmoke.position, { size: 0.42, rise: 15, amount: 0.85, warm: 0.5 }); k.kiln.on = o.season !== 'winter'; });
      }
    }
    mark('life');
    await pause();
    prog(0.86, '行者');
    const av = (await part(M_AVATAR, '行者', (m) => (m.createAvatar as (q: Quality) => Avatar)(k.q))) ?? plainFigure();
    k.player = new Player(scene, av);
    // 人被门柱、篱笆、树干挡住时透出一层淡影（ghost.ts）
    k.safe('ghost', () => { k.ghost = createGhost(av.root); });
    // 脚步声要知道的是「真在跑」（速度过了 2.2），不是按着 Shift 的意思
    k.player.onStep = () => k.events.step?.(k.surface(), { run: k.player.running, speed: k.player.speed });
    // 正在做一件事（哪怕是自己走动着做的）：行者不冒出负手、伸懒腰那些闲时动作
    k.player.busy = () => !!k.act;
    k.nav = new Nav(k.world, k.player);
    k.nav.onPlace = (id) => k.events.place?.(id);
    k.startId = o.start ?? 'grove';
    k.placeAt(k.startId);
    // 点地面时落下的一圈墨晕：像界面上的墨环一样是一笔绕成的——环身浓淡不匀、两边晕开、留一道口；圭表的日影
    k.tapRing = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.22, 48).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: { uInk: U.uInk, uA: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uInk; uniform float uA; varying vec2 vP;
        void main() {
          float t = (length(vP) - 0.13) / 0.09, a = atan(vP.y, vP.x);
          float edge = smoothstep(0.0, 0.4, t) * smoothstep(1.0, 0.55, t);
          float body = 0.72 + 0.28 * sin(a * 3.0 + 1.3) * sin(a * 5.0 + 0.4);
          float gap = smoothstep(0.12, 0.7, abs(mod(a - 0.8 + 3.14159, 6.28318) - 3.14159));
          gl_FragColor = vec4(uInk, uA * edge * body * gap);
        }`,
    }));
    k.tapRing.layers.set(FX_LAYER); k.tapRing.visible = false;
    scene.add(k.tapRing);
    {
      const N = SITE.gnomon, g = new THREE.PlaneGeometry(0.045, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5).toNonIndexed();
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      k.gnomon = new THREE.Mesh(g, wash({ pig: PIG.mo, dens: 1.5, flat: 1, line: 0, snow: 0 }));
      k.gnomon.position.set(N.x, YARD_Y + 0.02, N.z);
      scene.add(k.gnomon);
    }
    mark('avatar');
    prog(0.92, '备茶');
    await pause();
    k.acts = createActs(k);
    k.buildThings();
    k.bindInput();
    k.world.tick.push((dt, t) => k.update(dt, t));
    k.update(0.016, 0);
    mark('acts');
    // 先把着色器都编好，免得第一次转头时卡一下
    await k.world.compile();
    mark('compile');
    prog(1, '');
    return k;
  }

  // —— 天时 ——
  /** 时辰：'now' 跟着此刻的钟点；'dawn' 'day' 'dusk' 'night' 是这一季的晨、昼、昏、夜；也可以直接给几点 */
  setTime(mode: TimeMode | number, instant = false) {
    this.timeMode = mode;
    this.atmos.setHour(this.hourFor(mode), instant);
  }
  /** 做事时把时辰拨到某一刻（并告诉界面）。往前拨过了子夜（夜里睡到天亮）就是过了一夜 */
  passTo(hour: number) {
    const h0 = this.atmos.hour;
    if (hour < h0 - 1e-6 && h0 - hour > 0.01) this.newDay();
    this.setTime(hour, true); this.events.clock?.(hour);
  }
  /** 过了一夜 */
  newDay() {
    this.day++;
    this.mem.set('day', this.day);
    this.events.day?.(this.day);
    this.note('又是新的一天。点右上角的「第几日」，看看今天能做什么', 'time');
    for (const f of this.onDay) { try { f(this.day); } catch (e) { console.warn('过夜时出错', e); } }
  }
  /**
   * 时辰走过几个要紧的时候，画面下方说一句：天亮、日中、日头偏西、太阳快落山、天黑、夜深。
   * 按这一季的日出日落（atmos 的 SUN）定；只在时辰自己走过去时说（拨时辰、睡一觉跳过去的不说）；在做事、在换处时也说（话不挡手）。
   */
  private timeCue(h0: number, h1: number) {
    if (this.over || this.veil > 0.5) return;
    const [sr, ss] = SUN[this.season], wet = this.atmos.w.rain + this.atmos.w.snow > 0.4, out = this.nav.place.indoor < 0.5;
    const cues: Array<[number, string]> = [
      [sr - 0.5, '东边亮了。村里人起来了'],
      [12, '日头正中。半天过去了'],
      [ss - 2.5, '日头偏西了'],
      [ss - 0.7, wet ? '天色暗下来了，再过一会儿就黑了' : '太阳快落山了。天黑以前，田里、外头的事收一收'],
      [ss + 1.2, wet || !out ? '天黑了，屋里点上了灯' : '天黑了，屋里点上了灯；晴夜往上拖，抬头看看星'],
      [23.4, '夜深了。草堂的榻上睡一觉，就到天亮'],
    ];
    for (const [at, text] of cues) {
      const t = ((at % 24) + 24) % 24;
      if (h0 < t && h1 >= t) this.note(text, 'time');
    }
  }
  /** 时辰流转得多快（每秒过多少钟头；0 停） */
  setFlow(rate: number) { this.flow = Math.max(0, rate); }
  /** 画面下方浮一句话 */
  note(text: string, kind?: string) { this.events.note?.(text, kind); }

  /** 人被挡住时透出的淡影 */
  ghost: Ghost | null = null;
  /** 平时夜里点天：开着的那张星笺（点的时候人在哪、开了多久） */
  private skyOpen: { x: number; z: number; t: number } | null = null;
  /** 头一个晴夜在外头时提一句「可以抬头点星」（存档里记过就不再提） */
  private skyHinted = false; private skyHintT = 0;
  /** 此刻在外头、是晴夜（点天、提那一句的前提） */
  private starNight(): boolean {
    const a = this.atmos;
    // （题名页那幅俯瞰、画还在雾里的时候不算）
    return !this.act && !this.over && this.veil < 0.5 && a.night > 0.5 && a.w.rain + a.w.snow + a.w.mist < 0.4 && this.nav.place.indoor < 0.5;
  }
  /**
   * 夜里在外头点了天上这个方向（世界里的单位向量）：月、五星、星、星官的连线、天汉——点着了就把那一处点亮，请界面出一张星笺，返回那张笺；
   * 没点着（或不是晴夜、在屋里、正做着事）返回 null。tol 是点按的容差（弧度，约二十几个像素）。
   */
  skyTap(w: THREE.Vector3, tol = 0.035): SkyCard | null {
    if (!this.starNight()) return null;
    const card = pickSky(this, w.clone().normalize(), tol);
    if (!card) { this.skyClose(); return null; }
    this.skyOpen = { x: this.player.pos.x, z: this.player.pos.z, t: 0 };
    this.events.skyCard?.(card);
    return card;
  }
  /** 收起星笺：天上点亮的那一处熄掉 */
  skyClose() {
    if (!this.skyOpen) return;
    this.skyOpen = null;
    clearSky(this.atmos.sky, 0);
    this.events.skyCard?.(null);
  }
  /** 「疾」：锁住跑 / 放开 */
  setRun(on: boolean) { this.runLock = on; this.syncRun(); }
  private syncRun() {
    const on = this.runLock || this.keys.has('shift');
    if (on !== this.player.run) { this.player.run = on; this.events.run?.(on); }
  }
  hourFor(mode: TimeMode | number): number {
    if (typeof mode === 'number') return mode;
    if (mode === 'now') { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
    const s = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] }[this.season];
    return mode === 'dawn' ? s[0] + 0.3 : mode === 'day' ? 9.2 : mode === 'dusk' ? s[1] - 0.25 : 21.5;
  }
  setWeather(w: Weather, instant = false) { this.atmos.setWeather(w, instant); }
  setSeason(s: Season) {
    this.season = s; this.atmos.setSeason(s);
    this.land.setSeason(s); this.flora?.setSeason(s); this.life?.setSeason(s); this.fx?.setSeason(s); this.far?.setSeason(s);
    this.safe('build', () => this.build?.setSeason?.(s));
    if (this.kiln) this.kiln.on = s !== 'winter';
    for (const a of Object.values(this.acts)) (a as Act & { setSeason?(s: Season): void }).setSeason?.(s);
    if (typeof this.timeMode !== 'number' && this.timeMode !== 'now') this.atmos.setHour(this.hourFor(this.timeMode));
  }

  // —— 开场 ——
  /** 俯瞰：题名页背后用。镜头升到桃林上空，朝东南望过溪、草堂、田畴、伊水到嵩山，缓缓地移 */
  setOverview(on: boolean) {
    if (on === !!this.over) return;
    if (on) {
      const pos = new THREE.Vector3(-150, 50, -34), look = new THREE.Vector3(26, 22, 78);
      this.over = { pos, look, t: 0 };
      this.nav.setPose({ pos, look, fov: 46, yaw: 0, up: 0, down: 0 }, 0.01);
      this.player.setVisible(false); this.player.locked = true;
    } else {
      this.over = null;
      this.nav.setPose(null, 0.01); this.nav.snapBehind();
      this.player.setVisible(true); this.player.locked = false;
    }
  }
  /** 「入」：画面淡成一片雾，人已站在入口（桃林最西头），再显出来 */
  async begin() {
    if (!this.over) return;
    await this.nav.travel(() => {
      this.setOverview(false);
      const r = this.resumeAt;
      // 上回停的地方还站得住就放在那里（朝向照旧），不然从入口进来
      if (r && standable(r.x, r.z, r.zone as Zone) != null) { this.player.teleport(r.x, r.z, r.yaw, r.zone as Zone); this.nav.snapBehind(); }
      else this.placeAt(this.startId);
    });
  }

  // —— 行 ——
  /** 把人直接放到某一处（不带过场；开场、调试用） */
  placeAt(id: string) {
    const p = PLACE.get(id);
    if (!p?.spawn) return;
    this.player.teleport(p.spawn[0], p.spawn[1], p.spawn[2]);
    this.nav.snapBehind();
  }
  /** 去某一处（村图上点的）：画面淡成一片雾，人就到了 */
  async go(id: string) {
    const p = PLACE.get(id);
    if (!p?.spawn || this.nav.busy) return;
    if (this.act) this.exitAct();
    this.pending = null;
    if (this.arrive) { this.arrive = null; this.player.locked = false; }
    await this.nav.travel(() => this.player.teleport(p.spawn![0], p.spawn![1], p.spawn![2]));
  }
  /** 做走近了的那件事（界面上的主按钮、键盘 E） */
  use(id?: string) {
    const th = id ? this.things.find((x) => x.id === id) : this.near;
    if (!th || this.nav.busy) return;
    th.run();
  }
  /**
   * 开始一件事：人先走到做这件事的位置（走不到、或 instant 时直接站过去），站定转身，再开始。
   * 路上手一动（自己走开了）就作罢。
   */
  enterAct(id: string, instant = false) {
    const a = this.acts[id];
    if (!a || this.nav.busy || this.act === a) return;
    if (this.act) this.exitAct();
    const p = this.player, s = a.spot, zone: Zone = 'ground';
    /** 真的开始做：人已经站在位置上、面朝该朝的方向 */
    const start = () => {
      if (this.pending !== id) return;
      this.pending = null; this.arrive = null;
      window.clearTimeout(this.seatT);
      p.av.setSeat?.(null);
      p.locked = !a.free;
      this.act = a;
      a.enter();
      this.events.act?.(id, a.state);
    };
    /** 走到跟前了：先迈最后那一小步站准、转过身，站定了再开始 */
    const begin = () => {
      if (this.pending !== id) return;
      p.locked = true; p.stop(); p.settleAt(s.x, s.z); p.faceTo = s.yaw;
      this.arrive = { t: 0, start };
    };
    this.pending = id;
    const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
    if (instant || d > 90) { p.teleport(s.x, s.z, s.yaw, zone); this.nav.snapBehind(); start(); }
    else if (d < 0.12) begin();
    else p.goTo(s.x, s.z, { r: 0.07, then: begin, fail: () => { if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 1.2) begin(); else this.pending = null; } });
  }
  exitAct() {
    if (!this.act) return;
    const a = this.act;
    a.exit();
    this.act = null;
    const p = this.player, av = p.av, down = av.pose !== 'stand';
    av.setPose('stand'); av.setHands('sleeve'); av.bow = 0; av.reach('L', null); av.reach('R', null); av.lookAt(null);
    p.lift = 0; p.setVisible(true);
    // 跪着、坐着的：等他站起来了才能走
    p.locked = down;
    window.clearTimeout(this.riseT);
    if (down) this.riseT = window.setTimeout(() => { if (!this.act && !this.arrive) p.locked = false; }, 950);
    if (!a.free && Math.hypot(p.pos.x - a.spot.x, p.pos.z - a.spot.z) > 0.03) p.slideTo(a.spot.x, a.spot.z, 0.9);
    window.clearTimeout(this.seatT);
    this.seatT = window.setTimeout(() => av.setSeat?.(null), 1300);
    this.world.fpsCap = 0;
    this.nav.setPose(null);
    this.events.act?.(null, {});
  }
  /** 活动把自己的状态告诉界面 */
  emitAct() { if (this.act) this.events.act?.(this.act.id, this.act.state); }
  /** 界面上的按钮发给正在做的那件事的指令 */
  cmd(name: string, arg?: unknown) { this.act?.cmd?.(name, arg); }

  /** 此刻的「现场」，给声音用 */
  soundscape(): Soundscape {
    const a = this.atmos, p = this.player.pos, pl = this.nav.place;
    const k = (d: number, r0: number, r1: number) => Math.max(0, Math.min(1, 1 - (d - r0) / (r1 - r0)));
    const st = streamAt(p.x, p.z), P = SITE.pond, rv = riverAt(p.x, p.z);
    const sc = SITE.houses.find((h) => h.id === 'school')!;
    const hr = a.hour, schoolOn = hr > 7 && hr < 11 && a.w.rain < 0.5 ? 1 : 0, workOn = a.night < 0.3 && a.w.rain < 0.5 ? 1 : 0;
    return {
      place: pl.id, focus: this.focus, hour: hr, night: a.night, dawn: a.dawn, dusk: a.dusk, season: this.season, rain: a.w.rain, snow: a.w.snow, mist: a.w.mist, wind: a.wind, indoor: pl.indoor,
      // 地上积了多少雪：踩雪的脚步、雪后的静跟画面上的一样
      cover: a.snowCover,
      near: {
        stream: k(st.d - st.w, 1, 26), pond: k(Math.hypot(p.x - P.x, p.z - P.z) - P.rx, 0, 16), river: k(rv.d - rv.w, 5, 120),
        bamboo: k(Math.hypot(p.x, p.z + 38), 8, 40), pines: k(Math.hypot(p.x - SITE.pines[0].x, p.z - SITE.pines[0].z), 2, 16),
        grove: k(Math.max(0, p.x + 30), 0, 40) * k(Math.abs(p.z - 34), 6, 40), fields: p.z > 44 ? k(Math.abs(p.z - 95), 30, 70) : 0,
        village: k(Math.hypot(p.x - 86, p.z - 6), 14, 70), school: schoolOn * k(Math.hypot(p.x - sc.x, p.z - sc.z), 5, 46), work: workOn * k(Math.hypot(p.x - SITE.plank.x, p.z - SITE.plank.z), 4, 50),
        waterfall: k(Math.hypot(p.x - 150, p.z + 46), 0, 220) * 0.6,
        mill: k(Math.hypot(p.x - SITE.more.mill.x, p.z - SITE.more.mill.z), 3, 50),
      },
      storm: this.season === 'summer' ? Math.max(0, (a.w.rain - 0.35) / 0.65) : 0,
    };
  }

  /** 脚下是什么（脚步声用） */
  surface(): string {
    const p = this.player.pos, pl = this.nav.place;
    if (pl.indoor >= 1) return 'floor';
    if (pl.indoor > 0) return 'wood';
    if (Math.abs(p.x - SITE.bridge.x) < SITE.bridge.w / 2 && Math.abs(p.z - SITE.bridge.z) < SITE.bridge.len / 2) return 'stone';
    if (Math.hypot(p.x - SITE.stones.x, p.z - SITE.stones.z) < 3.4) return 'stone';
    if (waterDepth(p.x, p.z) > 0.02 || this.atmos.w.rain > 0.5) return 'wet';
    return pathDist(p.x, p.z) < 0.15 || pl.id === 'yard' ? 'earth' : 'grass';
  }

  private buildThings() {
    for (const a of Object.values(this.acts)) {
      const indoor = placeAt(a.spot.x, a.spot.z).indoor >= 1;
      const on = (a as Act & { on?(): boolean }).on;
      this.things.push({ id: a.id, label: a.name, anchor: a.anchor, spot: a.spot, radius: a.radius ?? 2.7, see: indoor ? 7 : 16, kind: 'act', on: on ? () => on.call(a) : undefined, run: () => this.enterAct(a.id) });
    }
  }

  // —— 输入 ——
  private bindInput() {
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
    // W A S D 是相对镜头的前后左右；方向键的上下也是前后，左右（和 Q / E）是转镜头——只用键盘也能拐弯
    const MOVE: Record<string, [number, number]> = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], d: [1, 0] };
    const TURN: Record<string, number> = { q: -1, arrowleft: -1, e: 1, arrowright: 1 };
    const sync = () => {
      let x = 0, y = 0;
      for (const kk of this.keys) { const m = MOVE[kk]; if (m) { x += m[0]; y += m[1]; } }
      const l = Math.hypot(x, y) || 1;
      this.keyMove.set(x / l, y / l);
      this.syncRun();
      this.keyTurn = 0;
      for (const kk of this.keys) this.keyTurn += TURN[kk] ?? 0;
    };
    window.addEventListener('keydown', (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // 走近了一件事时，E 是「做」；平时 E 是往右转镜头
      if ((key === 'f' || key === 'enter' || (key === 'e' && this.near)) && !e.repeat && !this.act) { this.use(); e.preventDefault(); return; }
      if (key === 'shift' && !e.repeat) { this.shiftAt = performance.now(); this.shiftUsed = false; }
      else if (this.keys.has('shift')) this.shiftUsed = true;
      if (MOVE[key] || TURN[key] || key === 'shift') { this.keys.add(key); sync(); if (key !== 'shift') e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      // 点一下 Shift（没跟别的键一起按、不到四分之一秒）：锁住跑 / 放开。按住 Shift 是只在按着时跑
      if (key === 'shift' && !this.shiftUsed && performance.now() - this.shiftAt < 260 && !this.act) this.runLock = !this.runLock;
      this.keys.delete(key); sync();
    });
    window.addEventListener('blur', () => { this.keys.clear(); sync(); });
    this.world.input = {
      down: (p, e) => { if (this.world.pointers.size === 2) this.pinch0 = this.pinchDist(); this.act?.input?.down?.(p, e); },
      move: (p, e) => {
        if (this.world.pointers.size === 2) { const d = this.pinchDist(); if (this.pinch0 > 0 && d > 0) this.nav.pinch(d / this.pinch0); this.pinch0 = d; return; }
        if (this.act?.input?.move) { if (this.act.input.move(p, e) !== false) return; }
        this.nav.drag(p.dx, p.dy);
      },
      up: (p, e) => { this.pinch0 = 0; this.act?.input?.up?.(p, e); },
      tap: (p, e) => { if (this.act?.input?.tap) { if (this.act.input.tap(p, e) !== false) return; } this.tapWorld(p); },
      hover: (p, e) => this.act?.input?.hover?.(p, e),
      wheel: (dy) => { if (!this.act?.noZoom) this.nav.wheel(dy); },
    };
  }
  /** 键盘给的行走方向；摇杆给的另放（两者相加） */
  keyMove = new THREE.Vector2();
  /** 键盘转镜头：−1 左、+1 右 */
  private keyTurn = 0;
  /** 摇杆（界面上的）：x 右、y 前，长度 ≤ 1 */
  stick = new THREE.Vector2();
  private pinchDist() { const ps = [...this.world.pointers.values()]; return ps.length >= 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0; }
  /** 点画面：点到水面荡一圈涟漪；点到地面，人走过去 */
  private tapWorld(p: Pointer) {
    if (this.nav.busy || this.player.locked) return;
    const ray = this.world.ray(p.nx, p.ny).ray;
    const g = this.player.pickGround(ray);
    if (!g) {
      // 夜里点在天上：说那是什么（容差约二十四个像素）
      if (ray.direction.y > 0.02 && this.skyTap(ray.direction, (24 * this.world.camera.fov * Math.PI) / 180 / (this.world.size.y || 700))) return;
      // 点在水上：荡一圈
      if (ray.direction.y < -0.02) for (let s = 2; s < 70; s += 0.5) {
        const x = ray.origin.x + ray.direction.x * s, z = ray.origin.z + ray.direction.z * s, y = ray.origin.y + ray.direction.y * s;
        if (y < ground(x, z) + 0.9 && waterDepth(x, z) > 0.12) { this.land.ripple(x, z, 1); this.events.sfx?.('ripple', { vel: 0.4, x, z }); break; }
        if (y < ground(x, z) - 0.2) break;
      }
      return;
    }
    this.pending = null;
    this.player.goTo(g.x, g.z, { r: 0.12 });
    this.tapRing.position.set(g.x, g.y + 0.03, g.z); this.tapT = 0;
  }

  // —— 每帧 ——
  update(dt: number, t: number) {
    const w = this.world, a = this.atmos, p = this.player;
    // 淡影只在走动时出（做事时镜头是摆好的，不要它）
    this.ghost?.update(!this.act && !this.nav.busy && this.veil < 0.5);
    // 星笺：走开了、进屋了、做起事来、天亮了、开了好一会儿，就收起
    if (this.skyOpen) {
      const o = this.skyOpen; o.t += dt;
      if (!this.starNight() || Math.hypot(p.pos.x - o.x, p.pos.z - o.z) > 2.5 || o.t > 40) this.skyClose();
    }
    // 头一个晴夜在外头：提一句可以抬头看、点一颗星（两秒看一次）
    if (!this.skyHinted && (this.skyHintT += dt) > 2) {
      this.skyHintT = 0;
      if (this.starNight() && a.night > 0.8 && this.veil < 0.5 && !this.nav.busy) {
        this.skyHinted = true;
        if (!this.mem.get<{ hinted?: boolean }>('stars', {}).hinted) {
          this.mem.patch('stars', { hinted: true });
          this.note('夜里的星斗都是真的：往上拖，抬头看；点一颗星，看它是哪一官', 'stars');
        }
      }
    }
    if (this.timeMode === 'now' && !a.transitioning && Math.floor(t) % 30 === 0 && Math.floor(t - dt) % 30 !== 0) a.setHour(this.hourFor('now'));
    else if (this.flow > 0 && this.timeMode !== 'now' && !this.over && !this.nav.busy && !a.transitioning && this.veil < 0.5) {
      // 时辰流转：一帧一帧往前推（不走「慢慢过渡」那条路），过了子夜就是新的一天
      const h0 = a.hour;
      let h = a.hour + this.flow * Math.min(dt, 0.1);
      this.timeCue(h0, h);
      if (h >= 24) { h -= 24; this.newDay(); }
      a.setHour(h, true); this.timeMode = h;
      this.clockT += dt;
      if (this.clockT > 8) { this.clockT = 0; this.events.clock?.(h); }
    }
    a.update(dt, t);
    // 行者与镜头
    p.input.copy(this.keyMove).add(this.stick).clampLength(0, 1);
    // 快走只给摇杆推到头的时候；键盘走路是从容地散步（要快就 Shift 跑）
    p.fast = this.stick.lengthSq() > 0.94 * 0.94;
    if (this.pending && p.input.lengthSq() > 0.0009) {                          // 自己走开了：那件事作罢
      this.pending = null;
      if (this.arrive) { this.arrive = null; p.locked = false; p.faceTo = null; }
    }
    if (this.arrive) {
      this.arrive.t += dt;
      if (p.settled || this.arrive.t > 1.8) this.arrive.start();
    }
    if (this.keyTurn && !this.act) this.nav.turn(this.keyTurn * 1.5, dt);
    if (this.life) setDynamic(this.life.blockers ?? []);
    p.snow = a.w.snow;
    p.update(dt, t, this.nav.camYaw);
    // 进了草堂：屋顶、南墙隐去，镜头从南面高处往里看；出来再还原
    const pl = this.nav.place, indoor = pl.indoor >= 1;
    if (indoor !== this.inHall) {
      this.inHall = indoor;
      const n = this.nav;
      if (indoor) { this.outPitch = n.pitch; this.outDist = n.dist; n.open = true; n.yaw = 0; n.pitch = 0.66; n.dist = 9.2; }
      else { n.open = false; n.pitch = this.outPitch; n.dist = this.outDist; }
      if (this.build) { this.build.hallRoof.visible = !indoor; this.build.hallFront.visible = !indoor; }
      U.uRoofCut.value = indoor ? 1 : 0;
    }
    if (this.over) {
      const o = this.over; o.t += dt;
      const a = o.t * 0.011;
      o.pos.set(-150 + 70 * Math.sin(a), 50 + 5 * Math.sin(a * 1.7), -34 - 26 * (1 - Math.cos(a)));
      o.look.set(26 + 30 * Math.sin(a), 22, 78);
    }
    this.nav.update(dt, t);
    w.fade = Math.max(this.nav.fade, this.veil);
    // 镜头高了，「远处褪成墨色」的起点也往远处推（不然从高处看下去近处也是一片灰白）
    const camH = Math.max(0, w.camera.position.y - p.pos.y - 3);
    U.uFar.value.y = 70 + camH * 2.2; U.uFar.value.z = 420 + camH * 5 - 120 * Math.max(a.w.mist, a.w.rain);
    const wind = U.uWind.value;
    this.windDir.set(wind.x, wind.y);
    // 各部分各自出错只停它自己（记一次），别的照常
    this.safe('far', () => this.far?.update(dt, t, { camera: w.camera, hour: a.hour, night: a.night, season: this.season, wind: a.wind }));
    this.safe('flora', () => this.flora?.update(dt, t, { night: a.night, wind: a.wind, player: p.pos }));
    this.safe('build', () => {
      this.build?.setLamp(a.lamp); this.build?.update(dt, t);
      const hm = this.build?.parts.millHammer;
      if (hm?.userData.thump) this.sfxAt('millThump', { vel: 0.6, x: SITE.more.mill.x, z: SITE.more.mill.z });
    });
    this.safe('life', () => this.life?.update(dt, t, { hour: a.hour, night: a.night, rain: a.w.rain, snow: a.w.snow, player: p.pos, camera: w.camera }));
    this.safe('fx', () => this.fx?.update(dt, t, { camera: w.camera, player: p.pos, hour: a.hour, night: a.night, dawn: a.dawn, dusk: a.dusk, rain: a.w.rain, snow: a.w.snow, mist: a.w.mist, wind: a.wind, windDir: this.windDir, indoor: pl.indoor, lamp: a.lamp }));
    this.safe('act', () => this.act?.update?.(dt, t));
    this.updateThings();
    // 圭表的日影：朝着背日的方向，日头越低越长（夜里、阴雨天没有）
    if (this.gnomon) {
      const s = a.sunDir, up = Math.max(0.12, s.y), len = Math.min(5.2, (SITE.gnomon.h * Math.hypot(s.x, s.z)) / up);
      this.gnomon.visible = s.y > 0.04 && a.night < 0.5 && a.w.rain + a.w.snow + a.w.mist < 0.5;
      this.gnomon.rotation.y = Math.atan2(-s.x, -s.z);
      this.gnomon.scale.set(1, 1, len);
    }
    // 点地面时落下的那一圈墨晕
    if (this.tapT < 1.2) {
      this.tapT += dt;
      const k = Math.min(1, this.tapT / 1.1);
      this.tapRing.visible = true; this.tapRing.scale.setScalar(0.7 + 1.5 * k);
      (this.tapRing.material as THREE.ShaderMaterial).uniforms.uA.value = 0.5 * (1 - k) * (1 - k);
    } else this.tapRing.visible = false;
  }

  /** 跑一段；出错就记下来，同一部分错了三次就把它停掉（人物、烟雨……少了它，园子照样在） */
  private bad: Record<string, number> = {};
  safe(name: string, fn: () => void) {
    if ((this.bad[name] ?? 0) >= 3) return;
    try { fn(); } catch (e) {
      this.bad[name] = (this.bad[name] ?? 0) + 1;
      console.warn(`${name} 出错（第 ${this.bad[name]} 次）`, e);
      if (this.bad[name] >= 3) {
        if (name === 'life' && this.life) { this.life.group.visible = false; setDynamic([]); this.life = null; }
        else if (name === 'fx' && this.fx) { this.fx.group.visible = false; this.fx = null; }
        else if (name === 'act' && this.act) { try { this.exitAct(); } catch { this.act = null; } this.bad.act = 0; }
      }
    }
  }

  /** 走近了哪件事；它们在画面上的位置 */
  private updateThings() {
    const p = this.player;
    let best: Thing | null = null, bd = 1e9;
    const free = !this.act && !this.nav.busy && !this.pending;
    if (this.markers.length !== this.things.length) this.markers = this.things.map((th) => ({ id: th.id, label: th.label, x: 0, y: 0, visible: false, dist: 0, near: false }));
    for (let i = 0; i < this.things.length; i++) {
      const th = this.things[i], m = this.markers[i];
      const on = th.on ? th.on() : true;
      const d = on ? Math.hypot(th.spot.x - p.pos.x, th.spot.z - p.pos.z) : 1e9;
      this.nav.project(th.anchor, this.proj);
      m.x = this.proj.x; m.y = this.proj.y; m.dist = d;
      m.visible = free && on && this.proj.visible && d < th.see;
      m.near = false;
      if (free && d < th.radius && d < bd) { bd = d; best = th; }
    }
    if (best) this.markers[this.things.indexOf(best)].near = true;
    if (best !== this.near) { this.near = best; this.events.near?.(best ? { id: best.id, label: best.label, kind: best.kind } : null); }
  }

  log(entry: { kind: string; n?: number; text?: string; minutes?: number }) { this.events.log?.(entry); }
  sfx(shot: string, opts?: Parameters<NonNullable<KsEvents['sfx']>>[1]) { this.events.sfx?.(shot, opts); }
  /** 世界里某处出的一声：把位置原样交给声音——远近、左右、能传多远，由声音按听的人与这一声自己的传远去算 */
  sfxAt(shot: string, o: { vel?: number; x?: number; z?: number } = {}) {
    if (o.x == null || o.z == null) { this.events.sfx?.(shot, o); return; }
    const p = this.player.pos;
    if (Math.hypot(o.x - p.x, o.z - p.z) > 360) return;
    this.events.sfx?.(shot, { vel: o.vel ?? 0.6, x: o.x, z: o.z });
  }
  buzz(ms: number | number[] = 8) { this.events.buzz?.(ms); }
  start() { this.world.start(); }
  dispose() { this.world.dispose(); }
}

/**
 * 屋顶遮着的地方（给画法：屋里不积雪、不打湿，雨雪落花不飘进来）。从屋舍报上来的占地里取：
 *   草堂两块——墙围着的那块到墙头，连出檐的那一圈到檐口；观物亭、茶亭到檐口；各家、村塾、碓房、牛棚、窝棚到墙头。
 */
function roofsFrom(sol: SolidLike[]): Roof[] {
  const out: Roof[] = [], H = SITE.hall;
  const box = (s: SolidLike, y1: number, pad = 0, y0?: number) => out.push({ x: s.x, z: s.z, hw: (s.w ?? 0) / 2 + pad, hd: (s.d ?? 0) / 2 + pad, yaw: s.yaw ?? 0, y0: y0 ?? ground(s.x, s.z) - 0.6, y1 });
  for (const s of sol) {
    if (s.kind !== 'rect' || !s.w || !s.d) continue;
    if (s.id === '草堂·檐口') {
      box({ ...s, w: H.w, d: H.d }, YARD_Y + H.floor + H.wall + 0.08, 0, YARD_Y - 0.4);
      box(s, (s.top ?? YARD_Y + 2.3) - 0.12, 0, YARD_Y - 0.4);
    } else if (s.id === '观物亭·檐口') box(s, (s.top ?? YARD_Y + 2.4) - 0.1);
    else if (s.id === '茶亭·台') box(s, (s.top ?? ground(s.x, s.z)) + 2.0, 0.25);
    else if (/^邻家·|^村塾$|^碓房$|^牛棚$|^窝棚$/.test(s.id)) box(s, ground(s.x, s.z) + 2.25);
    // 敞着的小棚（坯棚、晒药棚……）：屋舍在占地上直接写了檐口多高
    else if (s.roof != null) box(s, s.roof);
  }
  if (out.length > 16) console.warn(`屋顶遮罩只放得下 16 处，多出 ${out.length - 16} 处没登记`);
  return out.slice(0, 16);
}

/** 行者还没备好时的替身：一个着长衫的简单人形（会走，不会别的） */
function plainFigure(): Avatar {
  const root = new THREE.Group();
  const robe = wash({ pig: [0.93, 0.94, 0.93], dens: 1, body: 1, shade: 1.3 }), dark = wash({ pig: PIG.jiao, dens: 2.2, shade: 1.3 });
  const geo = (g: THREE.BufferGeometry) => { const n = g.toNonIndexed(); n.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 3).fill(1), 3)); return n; };
  const body = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.15, 0.3, 1.25, 12)), robe); body.position.y = 0.63;
  const head = new THREE.Mesh(geo(new THREE.SphereGeometry(0.105, 12, 10)), wash({ pig: [0.96, 0.9, 0.84], dens: 1, body: 1, shade: 1.2 })); head.position.y = 1.4;
  const knot = new THREE.Mesh(geo(new THREE.SphereGeometry(0.05, 8, 6)), dark); knot.position.y = 1.52;
  root.add(body, head, knot);
  const joint = (y: number, x = 0) => { const o = new THREE.Object3D(); o.position.set(x, y, 0.05); root.add(o); return o; };
  let ph = 0, pose: PoseName = 'stand';
  const av: Avatar = {
    root, height: 1.58, eyeY: 1.42,
    joints: { hips: joint(0.85), chest: joint(1.15), head: joint(1.4), handL: joint(0.95, 0.2), handR: joint(0.95, -0.2) },
    setPose(p) { pose = p; body.scale.y = p === 'stand' ? 1 : 0.62; body.position.y = 0.63 * body.scale.y; head.position.y = p === 'stand' ? 1.4 : 0.9; knot.position.y = head.position.y + 0.12; },
    get pose() { return pose; },
    setHands() { /* 替身没有手 */ }, bow: 0, reach() { /* 无 */ }, lookAt() { /* 无 */ },
    update(dt, _t, m) {
      const before = Math.floor(ph);
      ph += dt * m.speed * 1.25;
      root.children[0].position.x = Math.sin(ph * Math.PI) * 0.015 * Math.min(1, m.speed);
      if (Math.floor(ph) !== before) av.onStep?.(Math.floor(ph) % 2 ? 'L' : 'R');
    },
    onStep: null,
    setVisible(v) { root.visible = v; },
    dispose() { /* 无 */ },
  };
  return av;
}
