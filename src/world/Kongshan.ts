/**
 * 空山：把天时、山、寺、草木、器物、烟火水雾、行者、镜头与各项活动装在一起的那个东西。界面（React）只和它说话。
 */
import * as THREE from 'three';
import { World, detectQuality, type Pointer, type Quality } from './core/World';
import { createTextures, fontsReady, setTexScale, type Textures } from './core/tex';
import { adopt, createMats, setRoom, shared, type Mats } from './core/mats';
import { Atmos, type Season, type Weather } from './env/atmos';
import { createTerrain, groundY, scatterRocks, type Terrain } from './env/terrain';
import { createTemple, type Temple } from './arch/temple';
import { Pond } from './fx/water';
import { Smoke } from './fx/smoke';
import { Flames } from './fx/flame';
import { Ambient } from './fx/ambient';
import { Shafts } from './fx/shafts';
import { Nav, PLACE } from './nav';
import { Player } from './player';
import { L } from './layout';
import { buildScene, type SceneParts } from './scene';
import type { Act, Spot } from './acts/types';
import { createActs } from './acts';
import { createStubAvatar } from './avatar/stub';
import type { Avatar } from './avatar/types';
import { placeAt, type Zone } from './walk';

export type TimeMode = 'now' | 'dawn' | 'day' | 'dusk' | 'night';
/** 画面上的一个标记：走近了可以做的事（或上下楼） */
export interface Marker { id: string; label: string; x: number; y: number; visible: boolean; dist: number; near: boolean }
/** 走近了可以做的一件事 */
export interface Thing { id: string; label: string; anchor: THREE.Vector3; spot: Spot; radius: number; /** 多远就看得见它的标记 */ see: number; kind: 'act' | 'door'; run(): void }
export interface KsEvents {
  progress?(k: number, label: string): void;
  /** 人走到了另一处（处的 id） */
  place?(id: string): void;
  /** 走近 / 离开了一件可以做的事 */
  near?(thing: { id: string; label: string; kind: 'act' | 'door' } | null): void;
  /** 活动的状态变了（界面据此显示提示、计数等） */
  act?(id: string | null, state: Record<string, unknown>): void;
  /** 一件事做完，记进功课簿 */
  log?(entry: { kind: string; n?: number; text?: string; minutes?: number }): void;
  step?(wood: boolean): void;
  /** 出一声（器物的声音）；振一下（手机） */
  sfx?(shot: string, opts?: { vel?: number; pan?: number; pitch?: number; dur?: number; delay?: number; space?: 'open' | 'hall' | 'near' }): void;
  buzz?(ms: number | number[]): void;
  /** 环境声压低（0…1） */
  duck?(amount: number, fade?: number): void;
}
export interface KsOpts { quality?: string | null; season: Season; weather: Weather; hour: number; moonPhase: number; start?: string; events: KsEvents }

const pause = () => new Promise<void>((r) => setTimeout(r, 0));
// 小人的正式模型在 avatar/index.ts（有就用，没有就用替身）
const AVATAR = import.meta.glob<{ createAvatar?: (mats: Mats, q: Quality) => Avatar; Figure?: new (mats: Mats, q: Quality) => Avatar }>(['./avatar/index.ts', './avatar/figure.ts'], { eager: true });

export class Kongshan {
  world!: World; q!: Quality; T!: Textures; mats!: Mats; atmos!: Atmos; terrain!: Terrain; temple!: Temple;
  pond!: Pond; flames!: Flames; ambient!: Ambient; shafts!: Shafts; nav!: Nav; parts!: SceneParts; player!: Player;
  smokes: Smoke[] = [];
  timings: Record<string, number> = {};
  acts: Record<string, Act> = {};
  act: Act | null = null;
  /** 走近了能做的事：十二项活动，加上钟鼓楼的上下楼 */
  things: Thing[] = [];
  near: Thing | null = null;
  events: KsEvents;
  markers: Marker[] = [];
  /** 开场时界面压在画面上的黑（0…1） */
  veil = 1;
  season: Season; timeMode: TimeMode = 'now';
  /** 殿里的灯（点光） */
  private hallLights: THREE.PointLight[] = [];
  private smokeTint = new THREE.Color();
  private proj = { x: 0, y: 0, visible: false, dist: 0 };
  private keys = new Set<string>();
  private pending: string | null = null;
  private expo = 1;
  private tapRing!: THREE.Mesh; private tapT = 9;
  private pinch0 = 0;
  private avMats: Array<{ m: THREE.MeshStandardMaterial; c: THREE.Color }> = [];
  private seatT = 0; private riseT = 0;
  /** 走到一件事跟前、正在站定转身（站好了就开始） */
  private arrive: { t: number; start(): void } | null = null;

  private constructor(o: KsOpts) { this.events = o.events; this.season = o.season; }

  static async create(canvas: HTMLCanvasElement, o: KsOpts): Promise<Kongshan> {
    const k = new Kongshan(o);
    let tPrev = performance.now();
    /** 每一段花了多少毫秒（看哪里慢） */
    const mark = (name: string) => { const n = performance.now(); k.timings[name] = Math.round(n - tPrev); tPrev = n; };
    const prog = (v: number, s: string) => o.events.progress?.(v, s);
    k.q = detectQuality(o.quality);
    setTexScale(k.q.tex);
    k.world = new World(canvas, k.q);
    k.world.camera.layers.enable(1);
    prog(0.05, '研墨');
    mark('renderer');
    await fontsReady('空山大雄宝殿溪声便是广长舌山色岂非清净身竹径通幽处禅房花木深如是静观自在般若波罗蜜多心经');
    await pause();
    mark('fonts');
    k.T = createTextures();
    mark('textures');
    prog(0.3, '采石伐木');
    await pause();
    k.mats = createMats(k.T);
    k.atmos = new Atmos(k.world.scene, k.q.shadow);
    k.atmos.moonPhase = o.moonPhase;
    k.atmos.setSeason(o.season); k.atmos.setHour(o.hour, true); k.atmos.setWeather(o.weather, true);
    k.terrain = createTerrain(k.mats, k.q);
    k.world.scene.add(k.terrain.group, scatterRocks(k.mats, k.q));
    mark('terrain');
    prog(0.42, '起殿');
    await pause();
    k.temple = createTemple(k.mats, k.q);
    k.temple.group.traverse((ob) => { if (ob.userData.ground) ob.position.y = groundY(L.pagoda.x, L.pagoda.z) - 0.6; });
    k.world.scene.add(k.temple.group);
    mark('temple');
    // 屋里（天光照不进去）：大殿、经房、茶寮、山门
    setRoom(0, L.hall.x, L.hall.z, 11.0 + 0.03, 6.0 + 0.03, 1.2, 9.5, 0.9);
    setRoom(1, L.study.x, L.study.z, 2.5 + 0.03, 5.4 + 0.03, 0.3, 5.6, 0.82);
    setRoom(2, L.tea.x, L.tea.z, 2.5 + 0.03, 5.4 + 0.03, 0.3, 5.6, 0.55);
    setRoom(3, L.gate.x, L.gate.z, 5.6 + 0.03, 2.3 + 0.03, 0.5, 6.2, 0.6);
    prog(0.55, '种树');
    await pause();
    k.pond = new Pond(L.pond.x0, L.pond.x1, L.pond.z0, L.pond.z1, L.pond.y, k.atmos.sky, k.q.reflect);
    k.world.scene.add(k.pond.mesh);
    k.world.pre.push((r) => k.pond.pre(r, k.world.scene, k.world.camera));
    k.flames = new Flames();
    k.ambient = new Ambient(k.q.density, L.pond.y, (x, z) => k.pond.inside(x, z));
    k.ambient.onSplash = (x, z) => k.pond.ripple(x, z, 0.35);
    k.world.scene.add(k.flames.group, k.ambient.group);
    k.parts = await buildScene(k, prog);
    mark('scene');
    prog(0.86, '行者');
    await pause();
    // 行者：正式的小人没备好就用替身
    let av: Avatar;
    const mods = Object.values(AVATAR), make = mods.find((m) => m.createAvatar)?.createAvatar, Fig = mods.find((m) => m.Figure)?.Figure;
    try { if (!make && !Fig) throw new Error('avatar/ 里还没有小人'); av = make ? make(k.mats, k.q) : new Fig!(k.mats, k.q); adopt(av.root); } catch (e) { console.warn('小人没备好，用替身', e); av = createStubAvatar(k.mats); }
    k.player = new Player(k.world.scene, av);
    // 夜里人不能成了一团黑影（看不见自己在哪）：记下他身上的材质，按夜色给一点点自己的微光
    // （微光按各自的贴图 / 底色来：衣衫映得亮些，发髻、绦带、鞋仍是暗的——不然整个人一片灰白，像个影子）
    av.root.traverse((o) => {
      const mm = (o as THREE.Mesh).material;
      for (const x of (Array.isArray(mm) ? mm : mm ? [mm] : []) as THREE.MeshStandardMaterial[]) {
        if (!x.emissive || k.avMats.some((e) => e.m === x)) continue;
        if (x.map) { x.emissiveMap = x.map; k.avMats.push({ m: x, c: new THREE.Color(0.78, 0.86, 1) }); }
        else if (!x.vertexColors) k.avMats.push({ m: x, c: x.color.clone().multiply(new THREE.Color(0.78, 0.86, 1)) });
      }
    });
    k.player.onStep = () => k.events.step?.(k.nav.place.id === 'study' || k.nav.place.id === 'tea' || k.player.zone !== 'ground');
    k.nav = new Nav(k.world, k.player);
    k.nav.onPlace = (id) => k.events.place?.(id);
    k.placeAt(o.start ?? 'foot');
    k.tapRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2efe6, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    k.tapRing.renderOrder = 3; k.tapRing.visible = false;
    k.world.scene.add(k.tapRing);
    mark('avatar');
    prog(0.9, '焚香');
    await pause();
    k.acts = createActs(k);
    k.buildThings();
    k.bindInput();
    k.world.tick.push((dt, t) => k.update(dt, t));
    // 先把着色器都编好，免得第一次转头时卡一下
    k.update(0.016, 0);
    mark('acts');
    // 着色器是按「画到哪里」分别编的：有后期时主画面先画进一张浮点的中间图（不做色调映射），所以要对着那张图来预编，
    // 否则第一帧会把所有着色器重编一遍，卡上好几秒。
    const rt = k.world.composer?.readBuffer ?? null;
    try {
      k.world.renderer.setRenderTarget(rt);
      await k.world.renderer.compileAsync(k.world.scene, k.world.camera);
    } catch { /* 老浏览器没有异步编译 */ }
    k.world.renderer.setRenderTarget(null);
    mark('compile');
    prog(1, '');
    return k;
  }

  // —— 天时 ——
  setTime(mode: TimeMode, instant = false) {
    this.timeMode = mode;
    this.atmos.setHour(this.hourFor(mode), instant);
  }
  hourFor(mode: TimeMode): number {
    if (mode === 'now') { const d = new Date(); return d.getHours() + d.getMinutes() / 60; }
    const s = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] }[this.season];
    return mode === 'dawn' ? s[0] + 0.32 : mode === 'day' ? 10.4 : mode === 'dusk' ? s[1] - 0.2 : 21.5;
  }
  setWeather(w: Weather, instant = false) { this.atmos.setWeather(w, instant); }
  setSeason(s: Season) {
    this.season = s; this.atmos.setSeason(s);
    this.parts.setSeason(s);
    (this.acts.sweep as (Act & { setSeason?(): void }) | undefined)?.setSeason?.();
    if (this.timeMode !== 'now') this.atmos.setHour(this.hourFor(this.timeMode));
  }

  // —— 行 ——
  /** 把人直接放到某一处（不带过场；开场、调试用） */
  placeAt(id: string) {
    const p = PLACE.get(id);
    if (!p?.spawn) return;
    this.player.teleport(p.spawn[0], p.spawn[1], p.spawn[2], p.zone ?? 'ground');
    this.nav.snapBehind();
  }
  /** 去某一处（寺图上点的）：画面暗一下，人就到了 */
  async go(id: string) {
    const p = PLACE.get(id);
    if (!p?.spawn || this.nav.busy) return;
    if (this.act) this.exitAct();
    this.pending = null;
    if (this.arrive) { this.arrive = null; this.player.locked = false; }
    await this.nav.travel(() => this.player.teleport(p.spawn![0], p.spawn![1], p.spawn![2], p.zone ?? 'ground'));
  }
  /** 做走近了的那件事（界面上的主按钮、键盘 E） */
  use(id?: string) {
    const th = id ? this.things.find((x) => x.id === id) : this.near;
    if (!th || this.nav.busy) return;
    th.run();
  }
  /**
   * 开始一项活动：人先走到做这件事的位置（走不到、或 instant 时直接站过去），站定转身，再开始。
   * 路上手一动（自己走开了）就作罢。
   */
  enterAct(id: string, instant = false) {
    const a = this.acts[id];
    if (!a || this.nav.busy || this.act === a) return;
    if (this.act) this.exitAct();
    const p = this.player, s = a.spot, zone: Zone = s.zone ?? 'ground';
    /** 真的开始做：人已经站在位置上、面朝该朝的方向 */
    const start = () => {
      if (this.pending !== id) return;
      this.pending = null; this.arrive = null;
      window.clearTimeout(this.seatT);
      p.av.setSeat?.(null);                       // 要坐要跪的活动，自己再告诉他身下垫着什么
      p.locked = !a.free;
      this.act = a;
      a.enter();
      this.events.act?.(id, a.state);
    };
    /** 走到跟前了：先迈最后那一小步站准、转过身，站定了再开始（不边转身边往下跪） */
    const begin = () => {
      if (this.pending !== id) return;
      p.locked = true; p.stop(); p.settleAt(s.x, s.z); p.faceTo = s.yaw;
      this.arrive = { t: 0, start };
    };
    this.pending = id;
    const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
    if (instant || p.zone !== zone || d > 60) { p.teleport(s.x, s.z, s.yaw, zone); this.nav.snapBehind(); start(); }
    else if (d < 0.12) begin();
    // 一路走到跟前（找得到路就绕着走）；最后站不到的那一点点（比如紧挨着香炉）由 settleAt 迈过去
    else p.goTo(s.x, s.z, { r: 0.07, then: begin, fail: () => { if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < 1.2) begin(); else this.pending = null; } });
  }
  exitAct() {
    if (!this.act) return;
    const a = this.act;
    a.exit();
    this.act = null;
    const p = this.player, av = p.av, down = av.pose !== 'stand';
    av.setPose('stand'); av.setHands('free'); av.bow = 0; av.reach('L', null); av.reach('R', null); av.lookAt(null);
    p.lift = 0; p.setVisible(true);
    // 跪着、坐着的：等他站起来了才能走（不然是半蹲着滑出去的）
    p.locked = down;
    window.clearTimeout(this.riseT);
    if (down) this.riseT = window.setTimeout(() => { if (!this.act && !this.arrive) p.locked = false; }, 950);
    // 跪上、坐上垫子时身子往前送过一段：起身时退回垫子后面（站起来脚不踩在垫上）
    if (!a.free && (a.spot.zone ?? 'ground') === p.zone && Math.hypot(p.pos.x - a.spot.x, p.pos.z - a.spot.z) > 0.03) p.slideTo(a.spot.x, a.spot.z, 0.9);
    // 等他站起来了，再把「身下的垫子」撤掉
    window.clearTimeout(this.seatT);
    this.seatT = window.setTimeout(() => av.setSeat?.(null), 1300);
    this.world.fpsCap = 0;
    this.nav.setPose(null);
    this.events.act?.(null, {});
  }
  /** 活动把自己的状态告诉界面 */
  emitAct() { if (this.act) this.events.act?.(this.act.id, this.act.state); }

  private buildThings() {
    // 屋里的事，走到门口才看得见标记；院里的远一些就看得见
    for (const a of Object.values(this.acts)) {
      const indoor = placeAt(a.spot.x, a.spot.z, a.spot.zone ?? 'ground').indoor > 0.3;
      this.things.push({ id: a.id, label: a.name, anchor: a.anchor, spot: a.spot, radius: a.radius ?? 2.7, see: indoor ? 9 : 15, kind: 'act', run: () => this.enterAct(a.id) });
    }
    // 钟鼓楼：楼下的门「上楼」，楼上「下楼」
    const TY = L.tower.h + 0.3;
    for (const [id, c, sx] of [['bell', L.bell, -1], ['drum', L.drum, 1]] as const) {
      const door = { x: c.x + sx * 4.35, z: c.z }, top = PLACE.get(id)!.spawn!;
      this.things.push({
        id: `${id}-up`, label: id === 'bell' ? '上钟楼' : '上鼓楼', anchor: new THREE.Vector3(c.x + sx * 3.5, 1.9, c.z), spot: { x: door.x, z: door.z, yaw: sx < 0 ? Math.PI / 2 : -Math.PI / 2 }, radius: 2.1, see: 17, kind: 'door',
        run: () => { this.events.sfx?.('door', { vel: 0.5 }); void this.nav.travel(() => this.player.teleport(top[0], top[1], top[2], id)); },
      });
      this.things.push({
        id: `${id}-down`, label: '下楼', anchor: new THREE.Vector3(c.x + sx * 1.75, TY + 1.0, c.z - 1.55), spot: { x: c.x + sx * 1.5, z: c.z - 1.4, yaw: 0, zone: id }, radius: 1.5, see: 8, kind: 'door',
        run: () => { if (this.act) this.exitAct(); this.events.sfx?.('door', { vel: 0.5 }); void this.nav.travel(() => this.player.teleport(door.x + sx * 0.6, door.z, sx < 0 ? -Math.PI / 2 : Math.PI / 2, 'ground')); },
      });
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
      this.player.fast = this.keys.has('shift');
      this.keyTurn = 0;
      for (const kk of this.keys) this.keyTurn += TURN[kk] ?? 0;
    };
    window.addEventListener('keydown', (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      // 走近了一件事时，E 是「做」；平时 E 是往右转镜头
      if ((key === 'f' || key === 'enter' || (key === 'e' && this.near)) && !e.repeat && !this.act) { this.use(); e.preventDefault(); return; }
      if (MOVE[key] || TURN[key] || key === 'shift') { this.keys.add(key); sync(); if (key !== 'shift') e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); sync(); });
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
  /** 键盘给的行走方向；摇杆给的另放在 player.input 上（两者相加） */
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
    if (this.player.zone === 'ground' && ray.direction.y < -0.02) {
      const t = (L.pond.y - ray.origin.y) / ray.direction.y;
      const x = ray.origin.x + ray.direction.x * t, z = ray.origin.z + ray.direction.z * t;
      if (t > 0 && this.pond.inside(x, z)) { this.pond.ripple(x, z, 1); this.events.sfx?.('ripple', { vel: 0.4 }); return; }
    }
    const g = this.player.pickGround(ray);
    if (!g) return;
    this.pending = null;
    this.player.goTo(g.x, g.z, { r: 0.12 });
    this.tapRing.position.set(g.x, g.y + 0.02, g.z); this.tapT = 0;
  }

  // —— 每帧 ——
  update(dt: number, t: number) {
    const w = this.world, a = this.atmos, p = this.player;
    if (this.timeMode === 'now' && !a.transitioning && Math.floor(t) % 30 === 0 && Math.floor(t - dt) % 30 !== 0) a.setHour(this.hourFor('now'));
    a.update(dt);
    if (a.shadowDirty) { w.shadowDirty = true; a.shadowDirty = false; }
    a.bakeEnv(w.renderer);
    w.scene.environmentIntensity = a.envI;
    // 行者与镜头
    p.input.copy(this.keyMove).add(this.stick).clampLength(0, 1);
    if (this.pending && p.input.lengthSq() > 0.0009) {                          // 自己走开了：那件事作罢
      this.pending = null;
      if (this.arrive) { this.arrive = null; p.locked = false; p.faceTo = null; }
    }
    if (this.arrive) {
      this.arrive.t += dt;
      if (p.settled || this.arrive.t > 1.8) this.arrive.start();
    }
    if (this.keyTurn && !this.act) this.nav.turn(this.keyTurn * 1.7, dt);
    p.update(dt, t, this.nav.camYaw);
    this.nav.update(dt, t);
    const pl = this.nav.place, indoor = pl.indoor;
    // 进了屋，眼睛会慢慢适应暗处
    this.expo += ((1 + 0.95 * indoor * (1 - 0.35 * a.night)) - this.expo) * Math.min(1, dt * 1.2);
    w.exposure = a.exposure * this.expo;
    w.bloom = a.bloom * (1 + 0.5 * indoor);
    w.fade = Math.max(this.nav.fade, this.veil);
    // 夜里（屋外）月白的衣衫映一点天光：只够看清人在哪，不到「发光」的程度
    const glow = 0.085 * a.night * (1 - 0.55 * indoor);
    for (const e of this.avMats) e.m.emissive.copy(e.c).multiplyScalar(glow);
    // 人在动时，高画质下影子跟着重算（静的影子贴图里没有人）
    if (this.q.tier === 'high' && (p.moving || this.act?.dynamicShadow)) w.shadowDirty = true;
    // 风：慢慢变向、时强时弱
    const wd = shared.uWind.value, wa = 0.6 + Math.sin(t * 0.021) * 0.5 + Math.sin(t * 0.0073) * 0.4;
    wd.x = Math.cos(wa); wd.y = Math.sin(wa);
    wd.z = (0.09 + 0.06 * Math.sin(t * 0.13) + 0.04 * Math.sin(t * 0.31 + 2)) * (1 + 0.8 * a.w.rain + 0.4 * a.w.snow);
    // 烟的颜色：白天受天光，夜里受灯
    const day = 1 - a.night;
    this.smokeTint.copy(shared.uFogColor.value).multiplyScalar(0.55).addScalar(0.32 * day + 0.05).lerp(new THREE.Color(0.9, 0.62, 0.36), a.lamp * 0.35);
    for (const s of this.smokes) s.update(dt, t, w.camera, this.smokeTint);
    this.flames.update(dt, t, wd.z);
    // 殿里的灯随烛火摇曳
    for (const l of this.hallLights) l.intensity = (l.userData.base as number) * (0.82 + 0.18 * this.flames.flicker) * (0.55 + 0.45 * Math.max(a.night, a.w.rain));
    const sunUp = a.sun.intensity / 3.9;
    this.ambient.update(dt, t, w.camera, { rain: a.w.rain, snow: a.w.snow, night: a.night, sun: sunUp * day, indoor, fog: shared.uFogColor.value });
    this.shafts?.update(a.lightDir, a.sun.color, sunUp * day * (1 - a.w.rain) * (1 - a.w.snow) * (1 - 0.6 * a.w.mist));
    this.parts.update(dt, t);
    this.act?.update?.(dt, t);
    this.updateThings();
    // 点地面时落下的那一圈
    if (this.tapT < 1.2) {
      this.tapT += dt;
      const k = Math.min(1, this.tapT / 1.1);
      this.tapRing.visible = true; this.tapRing.scale.setScalar(0.7 + 1.3 * k);
      (this.tapRing.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k) * (1 - k);
    } else this.tapRing.visible = false;
  }

  /** 走近了哪件事；它们在画面上的位置 */
  private updateThings() {
    const p = this.player;
    let best: Thing | null = null, bd = 1e9;
    const free = !this.act && !this.nav.busy && !this.pending;
    if (this.markers.length !== this.things.length) this.markers = this.things.map((th) => ({ id: th.id, label: th.label, x: 0, y: 0, visible: false, dist: 0, near: false }));
    for (let i = 0; i < this.things.length; i++) {
      const th = this.things[i], m = this.markers[i];
      const same = (th.spot.zone ?? 'ground') === p.zone;
      const d = same ? Math.hypot(th.spot.x - p.pos.x, th.spot.z - p.pos.z) : 1e9;
      // 楼上那件事（撞钟、击鼓）的标记从楼下看不见；楼下的门从院里老远就看得见
      this.nav.project(th.anchor, this.proj);
      m.x = this.proj.x; m.y = this.proj.y; m.dist = d;
      m.visible = free && same && this.proj.visible && d < th.see;
      m.near = false;
      if (free && d < th.radius && d < bd) { bd = d; best = th; }
    }
    if (best) this.markers[this.things.indexOf(best)].near = true;
    if (best !== this.near) { this.near = best; this.events.near?.(best ? { id: best.id, label: best.label, kind: best.kind } : null); }
  }

  addSmoke(s: Smoke) { this.smokes.push(s); this.world.scene.add(s.mesh); return s; }
  addHallLight(pos: THREE.Vector3, color: number, intensity: number, dist: number) {
    const l = new THREE.PointLight(color, intensity, dist, 1.6);
    l.position.copy(pos); l.userData.base = intensity;
    this.world.scene.add(l); this.hallLights.push(l);
    return l;
  }
  adopt<T extends THREE.Object3D>(o: T): T { adopt(o); return o; }
  log(entry: { kind: string; n?: number; text?: string; minutes?: number }) { this.events.log?.(entry); }
  sfx(shot: string, opts?: Parameters<NonNullable<KsEvents['sfx']>>[1]) { this.events.sfx?.(shot, opts); }
  buzz(ms: number | number[] = 8) { this.events.buzz?.(ms); }
  start() { this.world.start(); }
  dispose() { this.world.dispose(); this.atmos.dispose(); }
}
