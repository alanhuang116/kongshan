/**
 * 同游：园子里遇见别的游人。
 *
 *   连到中转（server/relay.mjs，线上是 wss://kongshan.169-58-39-104.nip.io/ws）：同一间屋子（至多二十四人）里的人互相看得见——
 *   各人画成一位穿不同衣色的读书人，头上一枚小小的名签（雅号）；走近了可以作揖（对方若闲着会还礼）、说一句现成的话、同行。
 *   各人一秒报八回自己在哪、朝哪、多快、在哪一处、做什么事、什么姿态（没变就不报）；别人那边按报来的钟插值着画（interp.ts）。
 *   连不上、断了：照样一个人玩，过一会儿自己再连（client.ts）。没有一个字是自己写的：名字、话都是单子上的（proto.ts）。
 *   天时：同游时同屋的人看同一个时辰、节气、天气——随屋里最早进来的那一位：按他那里的真实钟点与节气走，天气随他（他报时区与天气，
 *   中转记着、转给大家；钟点各人按「此刻 + 那个时区」自己算）。他走了换下一位。独游时天时各自拨（world 的 setShared）。
 *   有人手机收起、切到别处，连线断了：先记作「暂离」，几分钟内回来还认得是那一位（人数不跟着少一位）。
 *   样子（setLook：男女、穿戴）、名片（setCard：修为、各样玩法最好的成绩）：进门报上，变了再报；同屋的人那边照着画、排榜。
 *   玩法（sendGame / onGame）：斗鸡、蹴鞠、抢座……一条是 GAMES 的一种加至多十六个整数，发给同屋某一位或同屋的人。
 *   路标（placeMark / marks）：在某处留下自己取的一卦，人人看得见（中转在内存里留三天）。
 *   这几样要中转认得（进门时 wel 的 x ≥ 1）；旧的一版中转不认得，就只在自己这边（样子照旧画成读书人，路标只自己看得见）。
 *
 * 网址：默认连线上的中转（GitHub Pages 上那一份与服务器上那一份都是）；?ws=ws://localhost:3820/ws 连本机的（试的时候），?ws=0 不连，?ws=1 用默认的。
 * 开发服务器（vite dev）与自动测试（navigator.webdriver）默认不连，要连就给 ?ws=。
 *
 * 由 acts/net.ts 在世界建好时装上（不必改总装）：把别人的身子放进 k.world.scene，每帧的事推进 k.world.tick。
 * 界面（app/plugins/Together.tsx）用 getTogether() 取它：subscribe / view 是给 React 的，remotes、selfLine 是给每帧摆名签的。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { NetClient, type Status } from './client';
import { localTz } from '../env/months';
import type { Weather } from '../env/atmos';
import { loadIdentity, nameFits, roll, rollFor, saveIdentity, type Identity } from './identity';
import { PHRASES, NEAR, BOUNDS, WEATHERS, actIndex, actLabel, nameOf, phraseText, placeIndex, poseIndex, robeName, type Name } from './proto';
import { Remote, type Line } from './remote';
import type { State, WireIn, WireMark } from './wire';
import { GAMES, LOOK_N, CARD_N, GAME_N, type GameKind } from './proto';
import { cnNum, farText, labels, relayUrl } from './words';

export { DEFAULT_RELAY, SAME_ORIGIN_HOSTS, defaultRelay, cnNum, farText, labels, relayUrl } from './words';

/** 作揖、说话、同行要走到多近（米；中转那边宽一些，按 NEAR） */
export const CLOSE = 12;
/** 暂离的人认多久（毫秒）：这么久里回来还是那一位 */
export const AWAY_MS = 5 * 60 * 1000;
const awayKey = (n: Name, c: number) => `${n[0]}.${n[1]}.${c}`;

const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export interface PeerView {
  id: number; n: Name; c: number;
  /** 名字（同名时后面添衣色，以资分别） */ label: string;
  robe: string; dist: number; far: string; doing: string; hidden: boolean;
  /** 走得到跟前（作揖、说话） */ close: boolean;
  following: boolean;
  /** 向你作揖了、等你还礼 */ invite: boolean;
}
/** 名片上的一位（排榜用）：自己是 id 0 */
export interface CardRow { id: number; label: string; c: number; cd: number[]; me: boolean }
export interface NetView {
  /** 有没有可连的中转（没有时界面什么也不出） */ enabled: boolean;
  on: boolean; status: Status;
  me: { label: string; robe: string; c: number; n: Name };
  peers: PeerView[];
  /** 同屋另有几位；画面近处几位（都只数报了位置的，与 peers 同一个口径） */ others: number; near: number;
  /** 园中连你一共几位（暂离的几分钟里也算） */ total: number;
  /** 暂离的（手机收起、切到别处，连线断了）：几分钟内回来还认他 */ away: Array<{ key: string; label: string; robe: string; c: number }>;
  /** 园中天时随谁：self 是你自己最早来（或只有你）；host 是那一位的名字；tz 是那里的时区（分钟）；own 是你此刻拨的是自己的天时。独游是 null */
  sky: { self: boolean; host: string; tz: number; own: boolean } | null;
  following: number | null;
  /** 中转认得样子、名片、玩法、路标 */ ext: boolean;
  /** 路标的枚数（变了界面重画） */ marks: number;
}

export class Together {
  readonly url: string | null; readonly explicit: boolean;
  me: Identity;
  client: NetClient | null = null;
  remotes = new Map<number, Remote>();
  status: Status = 'off';
  /** 走动着（界面在走动的那一段才说「在了」；题名页上不连） */
  playing = false;
  following: number | null = null;
  /** 自己头上浮着的那句话 */
  selfLine: Line | null = null;
  /** 谁向你作揖了、你正忙着没还礼（界面上那一行出「还礼」） */
  invite: { id: number; until: number } | null = null;
  /** 每帧花了多少毫秒（平滑过的），这一帧重摆了几个身子；累计的（测性能用） */
  ms = 0; perf = { frames: 0, ms: 0, figs: 0 };
  /** 这一帧插值用的这边的钟（毫秒；测试量匀不匀用它，不用自己再取一回） */
  clock = 0;
  private subs = new Set<() => void>();
  private snapshot: NetView;
  private viewT = 0; private dirty = true;
  private lastSent: State | null = null; private lastSentAt = -1e9; private ct0 = 0;
  private frame = 0; private seq = 0;
  private frustum = new THREE.Frustum(); private pm = new THREE.Matrix4(); private due: Remote[] = [];
  /** 一帧至多重摆几个身子（手机上少些）。一个粗档的身子摆一回约 0.1 毫秒（开发机） */
  budget: number;
  private met = new Set<number>();
  private welcomed = false; private quietUntil = 0;
  private fo: { id: number; t: number; goal: [number, number] | null; seq: number; told: boolean; ran: boolean; lost: number } | null = null;
  /** 同屋的人按进门的先后（自己也在里头）：排第一的那一位定园中天时 */
  private order: number[] = [];
  /** 那一位报来的天时 */
  private skyIn: { by: number; tz: number; w: number } | null = null;
  private skySent = ''; private skySentAt = -1e9;
  /** 暂离的人：名字＋衣色 → 走的时候 */
  private away = new Map<string, { n: Name; c: number; label: string; at: number }>();
  private bowTimer = 0; private socialAt = 0;
  /** 没有界面（?ui=0、world.html 那个台子）又明说了要连：画一淡开就算走动着 */
  private autoPlay: boolean;
  /** 同游时天时随园中（默认）；?share=0 不随（自动测试里要定在某个时辰、某一季时用） */
  private shareSky: boolean;
  /** 同游时自己拨了天时（拨了季、时辰、月、流转，或拨了别人定的天气）：这时画里是自己的天时，同屋的人看到的仍是园中此刻；「回到此刻」放开 */
  private ownSky = false;
  /** 自己拨天时 / 回到园中此刻 */
  setOwnSky(on: boolean) { if (on === this.ownSky) return; this.ownSky = on; this.dirty = true; }
  get skyOwn(): boolean { return this.ownSky; }
  /** 中转认得新添的几样（wel 的 x） */
  ext = false;
  /** 自己的样子、名片（还没给是 null：中转那边就不报） */
  private lookD: number[] | null = null; private cardD: number[] | null = null;
  private lookSent = ''; private cardSent = ''; private lookAt = -1e9; private cardAt = -1e9;
  /** 同屋各人的名片 */
  private cardsIn = new Map<number, number[]>();
  /** 路标：编号 → 那一枚（中转来的；没连上时是空的——自己这边的另由玩法自己存） */
  marks = new Map<number, WireMark>();
  /** 路标留几分钟（中转说的） */
  markTtl = 4320;
  private gameSubs = new Map<number, Set<(fr: number, d: number[], to: number) => void>>();
  private peerSubs = new Set<(ev: 'in' | 'out', id: number) => void>();
  private markAt = new Map<number, number>();

  constructor(private k: Anlewo, loc: { search: string; dev: boolean; webdriver: boolean; path?: string; host?: string; secure?: boolean }) {
    const r = relayUrl(loc.search, loc.dev, loc.webdriver, loc.host, loc.secure);
    this.url = r.url; this.explicit = r.explicit;
    this.autoPlay = r.explicit && (new URLSearchParams(loc.search).get('ui') === '0' || /world\.html$/.test(loc.path ?? ''));
    this.budget = k.q.tier === 'low' || k.q.mobile ? 3 : 5;
    this.shareSky = new URLSearchParams(loc.search).get('share') !== '0';
    this.me = loadIdentity();
    this.snapshot = this.build();
    if (this.url) this.client = new NetClient(this.url, () => ({ n: this.me.n, c: this.me.c, lk: this.lookD, cd: this.cardD }), { status: (s) => this.onStatus(s), message: (m) => this.onMessage(m) });
  }

  // —— 给界面的 ——
  subscribe = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  get view(): NetView { return this.snapshot; }
  private emit() { this.dirty = false; this.snapshot = this.build(); for (const f of this.subs) f(); }

  /** 界面在走动的那一段（plugins 只在 roam 时画）：在了才连 */
  setPlaying(on: boolean) { if (on === this.playing) return; this.playing = on; this.sync(); }
  /** 同游 / 独游 */
  setOnline(on: boolean) {
    if (on === this.me.on) return;
    this.me = { ...this.me, on }; saveIdentity(this.me);
    // 换了独游、同游：自己拨的那一回作罢（再同游时先随园中此刻）
    this.ownSky = false;
    if (!on) this.follow(null);
    this.sync(); this.emit();
  }
  /** 换一个雅号（衣色跟着换）；给了男女就按男女挑（女子不叫钓叟、樵子） */
  reroll(sex?: 'm' | 'f') {
    this.me = sex ? rollFor(sex, this.me) : roll(this.me); saveIdentity(this.me);
    this.client?.send({ t: 'nm', n: this.me.n, c: this.me.c });
    this.nameToWorld();
    this.emit();
  }
  /** 雅号换了：世界里你叫什么（榜上写的）跟着换——选过人的才跟（还没选人时选人那一页自己定） */
  private nameToWorld() { if (this.k.chosen) this.k.setPersona({ name: nameOf(this.me.n) }); }
  /** 定下一个雅号（选人那一页挑好的） */
  setName(n: Name) {
    if (n[0] === this.me.n[0] && n[1] === this.me.n[1]) return;
    this.me = { ...this.me, n: [n[0], n[1]] }; saveIdentity(this.me);
    this.client?.send({ t: 'nm', n: this.me.n, c: this.me.c });
    this.nameToWorld();
    this.emit();
  }
  /** 此刻的雅号合不合这个男女（换了女子、雅号还是「钓叟」：选人那一页另起一个） */
  nameFits(sex: 'm' | 'f'): boolean { return nameFits(this.me.n[1], sex); }
  /**
   * 自己的样子（至多十六个 0…255：男女、衣、冠、饰的序号，由换装那边编）。变了就报给同屋的人（一分钟至多三四回；
   * 试衣时别调它，穿上了再调）。没连上时记着，进门时一并报上
   */
  setLook(d: number[] | null) {
    const v = d ? d.slice(0, LOOK_N).map((x) => clamp(Math.round(x) || 0, 0, 255)) : null;
    this.lookD = v;
    this.flushLook(performance.now());
  }
  private flushLook(now: number) {
    const v = this.lookD, key = v ? v.join(',') : '';
    if (!v || key === this.lookSent || !this.ext || !this.client?.online || now - this.lookAt < 2000) return;
    if (this.client.send({ t: 'lk', d: v })) { this.lookSent = key; this.lookAt = now; }
  }
  /** 自己的名片（至多十六个 0…999999：修为、各样玩法最好的成绩，由排榜那边编）。变了就报 */
  setCard(d: number[] | null) {
    const v = d ? d.slice(0, CARD_N).map((x) => clamp(Math.round(x) || 0, 0, 999999)) : null;
    this.cardD = v;
    this.flushCard(performance.now());
  }
  private flushCard(now: number) {
    const v = this.cardD, key = v ? v.join(',') : '';
    if (!v || key === this.cardSent || !this.ext || !this.client?.online || now - this.cardAt < 2000) return;
    if (this.client.send({ t: 'cd', d: v })) { this.cardSent = key; this.cardAt = now; }
  }
  /** 他的样子（没报过是 null：画成读书人） */
  lookOf(id: number): number[] | null { return this.remotes.get(id)?.lk ?? null; }
  /** 同屋各人的名片（连自己；没报过名片的不在里头） */
  cards(): CardRow[] {
    const ls = labels(this.list()), out: CardRow[] = [];
    if (this.cardD) out.push({ id: 0, label: ls.get(0) ?? nameOf(this.me.n), c: this.me.c, cd: this.cardD, me: true });
    for (const [id, cd] of this.cardsIn) { const r = this.remotes.get(id); if (r) out.push({ id, label: ls.get(id) ?? nameOf(r.n), c: r.c, cd, me: false }); }
    return out;
  }
  /** 同游开着、连上了、中转认得玩法：玩法这时才能找别人一起（不然只和村里人玩） */
  get canPlay(): boolean { return this.ext && !!this.client?.online && this.me.on; }
  /** 自己在中转上的编号（没连上是 0） */
  get myId(): number { return this.client?.online ? this.client.id : 0; }
  /**
   * 玩法里的一条：kind 是哪一样（GAMES），to 是同屋的某一位（0：同屋的人），d 至多十六个整数（±9999999，坐标这类乘一百再发）。
   * 发出去了返回 true（没连上、中转不认得、太勤了：false——玩法自己看着办，比如对面就当是村里人）
   */
  sendGame(kind: GameKind, to: number, d: number[]): boolean {
    const k = GAMES.indexOf(kind);
    if (k < 0 || !this.canPlay || d.length > GAME_N || !d.every((v) => Number.isInteger(v) && Math.abs(v) <= 9999999)) return false;
    if (to && !this.remotes.has(to)) return false;
    return this.client!.send({ t: 'g', to, k, d });
  }
  /** 收这一样玩法的消息：f(谁发的, 那几个数, 发给谁——0 是发给同屋的人)。返回取消的函数 */
  onGame(kind: GameKind, f: (fr: number, d: number[], to: number) => void): () => void {
    const k = GAMES.indexOf(kind);
    if (k < 0) return () => {};
    let set = this.gameSubs.get(k);
    if (!set) this.gameSubs.set(k, (set = new Set()));
    set.add(f);
    return () => { set!.delete(f); };
  }
  /** 有人进门、走了（暂离也算走了）：玩法据此收场。返回取消的函数 */
  onPeer(f: (ev: 'in' | 'out', id: number) => void): () => void { this.peerSubs.add(f); return () => { this.peerSubs.delete(f); }; }
  private firePeer(ev: 'in' | 'out', id: number) { for (const f of this.peerSubs) { try { f(ev, id); } catch (e) { console.warn('同游：玩法收场出错', e); } } }
  /**
   * 留一枚路标：在哪（x, z）、哪一卦（GUA 的序号 0…63）、此刻几月、几时、什么天气。中转收下了会发回来（marks 里就有了、mine 为真）。
   * 一个人同时至多三枚，再留就收回最早的；一分钟至多一枚。没连上、中转不认得：false（玩法自己存在本机）
   */
  placeMark(m: { x: number; z: number; g: number; mo: number; h: number; w: number }): boolean {
    if (!this.canPlay) return false;
    const d = [r2(clamp(m.x, BOUNDS.x[0], BOUNDS.x[1])), r2(clamp(m.z, BOUNDS.z[0], BOUNDS.z[1])), clamp(Math.round(m.g), 0, 63), clamp(Math.round(m.mo), 1, 12), clamp(Math.round(m.h), 0, 23), clamp(Math.round(m.w), 0, WEATHERS.length - 1)];
    return this.client!.send({ t: 'mk', d });
  }
  /** 收回自己留的一枚 */
  unmark(id: number): boolean {
    const k = this.marks.get(id);
    if (!k?.mine || !this.canPlay) return false;
    return this.client!.send({ t: 'mkx', id });
  }
  /** 一枚路标还剩几分钟（按收到时的「留了几分钟」与这边过了多久算） */
  markLeft(id: number): number {
    const k = this.marks.get(id), at = this.markAt.get(id);
    if (!k || at == null) return 0;
    return Math.max(0, this.markTtl - k.age - (performance.now() - at) / 60000);
  }

  private sync() {
    const want = !!this.client && this.playing && this.me.on;
    this.client?.setWant(want);
    if (!want) this.clear();
  }

  /** 自己闲着（没在做事、站着、没在换处）：作揖时身子才躬得下去 */
  private free(): boolean {
    const k = this.k, av = k.player.av;
    return !k.act && !k.nav.busy && av.pose === 'stand' && !k.player.locked;
  }
  /** 自己躬身一下（朝着那个人） */
  private bowAt(p: THREE.Vector3) {
    const k = this.k, pl = k.player, av = pl.av;
    if (!this.free()) return;
    pl.stop();
    pl.faceTo = Math.atan2(p.x - pl.pos.x, p.z - pl.pos.z);
    av.setHands('sleeve', 0.3);
    av.bow = 0.85;
    window.clearTimeout(this.bowTimer);
    this.bowTimer = window.setTimeout(() => { if (!this.k.act && av.bow > 0.5) av.bow = 0; }, 1150);
  }
  private social(now: number) { if (now - this.socialAt < 1300) return false; this.socialAt = now; return true; }

  /** 向他作揖 */
  greet(id: number): boolean {
    const r = this.remotes.get(id), now = performance.now();
    if (!r || !this.client?.online || r.hidden || r.dist > CLOSE || !this.social(now)) return false;
    const re = this.invite?.id === id ? 1 : 0;
    if (!this.client.send({ t: 'bow', to: id, re })) return false;
    if (re) this.invite = null;
    this.bowAt(r.pos);
    this.dirty = true;
    return true;
  }
  /** 对他说一句（k 是 PHRASES 的序号）；id 给 0 是对近处的人说 */
  say(id: number, k: number): boolean {
    const now = performance.now();
    if (!this.client?.online || !PHRASES[k] || !this.social(now)) return false;
    if (id) { const r = this.remotes.get(id); if (!r || r.hidden || r.dist > CLOSE) return false; }
    if (!this.client.send({ t: 'say', to: id, k })) return false;
    this.selfLine = { k, until: now + 4800 };
    return true;
  }
  /** 同行：跟着他走（null 不跟了）。halt：正往他那里走的那一程也停下（自己动了手时不停——那是自己要去的路） */
  follow(id: number | null, halt = true) {
    const prev = this.fo;
    if (prev && prev.id !== id) {
      if (prev.told) this.client?.send({ t: 'fo', to: prev.id, on: 0 });
      if (prev.ran) this.k.setRun(false);
      const p = this.k.player, path = p.path, e = path?.[path.length - 1];
      if (halt && p.walking && prev.goal && e && Math.hypot(e[0] - prev.goal[0], e[1] - prev.goal[1]) < 0.35) p.stop();
    }
    // 开始跟一位时，自己正走着的那一程先停下（不然下面一看「在走，又不是同行派的」，就当是自己动了手）
    const fresh = id != null && this.remotes.has(id) && prev?.id !== id;
    if (fresh && this.k.player.walking) this.k.player.stop();
    this.fo = id == null || !this.remotes.has(id) ? null : prev?.id === id ? prev : { id, t: 1, goal: null, seq: -1, told: false, ran: false, lost: 0 };
    this.following = this.fo?.id ?? null;
    this.dirty = true;
  }

  // —— 线上来的 ——
  private onStatus(s: Status) {
    this.status = s;
    if (s !== 'online') this.clear();
    this.emit();
  }
  /** 断了、独游：别人都从画里拿掉 */
  private clear() {
    for (const r of this.remotes.values()) r.dispose();
    if (this.remotes.size) this.dirty = true;
    this.remotes.clear();
    this.met.clear();
    if (this.fo) this.follow(null);
    this.invite = null;
    this.order = []; this.skyIn = null; this.away.clear(); this.skySent = '';
    this.cardsIn.clear(); this.lookSent = ''; this.cardSent = '';
    if (this.marks.size) { this.marks.clear(); this.markAt.clear(); }
  }
  /** 园中天时随谁：同屋排第一的那一位（没连上时是自己） */
  private hostId(): number {
    const c = this.client, me = c?.id ?? 0;
    return c?.online && this.order.length ? this.order[0] : me;
  }
  /**
   * 此刻园中天时的那一份：同游开着就有（题名页上也是：先随自己这里的此刻，进园时不必再换一回天色）；独游、没有可连的中转时是 null（各自拨）。
   * 排第一的不是自己、他也报来了：随他（时区、天气）；不然按自己这里的此刻，天气是自己的。
   */
  private skyNow(): { tz: number; weather: Weather | null; host: number; self: boolean } | null {
    const c = this.client;
    if (!c || !this.me.on || !this.shareSky) return null;
    const me = c.id ?? 0, host = this.hostId();
    if (c.online && host !== me && this.skyIn && this.skyIn.by === host) return { tz: this.skyIn.tz, weather: (WEATHERS[this.skyIn.w] ?? 'clear') as Weather, host, self: false };
    return { tz: localTz(), weather: null, host: me, self: true };
  }
  private add(id: number, n: Name, c: number, lk: number[] | null = null): Remote {
    let r = this.remotes.get(id);
    if (r) { r.rename(n, c); if (lk) r.setLook(lk); return r; }
    r = new Remote(this.k.world.scene, this.k.q, id, n, c, this.seq++);
    if (lk) r.setLook(lk);
    this.remotes.set(id, r);
    return r;
  }
  private onMessage(m: WireIn) {
    const now = performance.now(), me = this.client?.id ?? 0;
    switch (m.t) {
      case 'wel': {
        this.clear();
        this.lastSent = null; this.ct0 = now;
        for (const p of m.ps) { const r = this.add(p.id, p.n, p.c); if (p.st) r.push(p.st, now, false); }
        // 进门的先后：名单是按先后排的，自己排在最后
        this.order = [...m.ps.map((p) => p.id), m.id];
        this.skyIn = m.sky ? { by: m.sky[0], tz: m.sky[1], w: m.sky[2] } : null;
        this.skySent = '';
        // 新添的几样：中转认得才有
        this.ext = m.x >= 1;
        for (const p of m.px) { const r = this.remotes.get(p.id); if (!r) continue; if (p.lk.length) r.setLook(p.lk); if (p.cd.length) this.cardsIn.set(p.id, p.cd); }
        this.markTtl = m.mt;
        this.marks.clear(); this.markAt.clear();
        for (const k of m.mk) { this.marks.set(k.id, k); this.markAt.set(k.id, now); }
        // 进门时报的样子、名片就是此刻的（之后变了再报）
        this.lookSent = this.lookD ? this.lookD.join(',') : ''; this.cardSent = this.cardD ? this.cardD.join(',') : '';
        for (const p of m.ps) this.firePeer('in', p.id);
        // 只数进门时带着位置的（同 build() 的人数）：连接还在、一份位置也不报的那几位，纸上没有他们
        const came = m.ps.filter((p) => p.st).length;
        if (!this.welcomed && came) this.k.note(`园中另有${cnNum(came)}位游人`, 'net');
        this.welcomed = true;
        // 进门时本来就在近处的，不再说「走近了」
        this.quietUntil = now + 2500;
        break;
      }
      case 'in': {
        this.order.push(m.id);
        this.add(m.id, m.n, m.c, m.lk);
        if (m.cd) this.cardsIn.set(m.id, m.cd);
        this.firePeer('in', m.id);
        // 暂离的那一位回来了（名字、衣色都对得上）
        const key = awayKey(m.n, m.c), was = this.away.get(key);
        if (was) { this.away.delete(key); this.met.add(m.id); this.k.note(`${was.label}回来了`, 'net'); }
        break;
      }
      case 'sky': if (m.fr === this.hostId()) this.skyIn = { by: m.fr, tz: m.d[0], w: m.d[1] }; break;
      case 'nm': this.remotes.get(m.id)?.rename(m.n, m.c); break;
      case 'lk': this.remotes.get(m.id)?.setLook(m.d); break;
      case 'cd': if (this.remotes.has(m.id)) this.cardsIn.set(m.id, m.d); break;
      case 'g': {
        if (m.fr === me || !this.remotes.has(m.fr) || (m.to !== 0 && m.to !== me)) return;
        const set = this.gameSubs.get(m.k);
        if (set) for (const f of set) { try { f(m.fr, m.d, m.to); } catch (e) { console.warn('同游：玩法出错', e); } }
        return;
      }
      case 'mk': this.marks.set(m.m.id, m.m); this.markAt.set(m.m.id, now); break;
      case 'mkx': this.marks.delete(m.id); this.markAt.delete(m.id); break;
      case 'out': {
        const r = this.remotes.get(m.id);
        this.order = this.order.filter((x) => x !== m.id);
        if (this.skyIn?.by === m.id) this.skyIn = null;
        if (!r) break;
        // 先记作暂离：手机收起、切到别处也会断开，几分钟内回来还是他
        const lb = this.label(m.id);
        if (r.seen) this.away.set(awayKey(r.n, r.c), { n: r.n, c: r.c, label: lb, at: now });
        if (r.shown && r.dist < 15) this.k.note(`${lb}暂离`, 'net');
        if (this.following === m.id) this.follow(null);
        if (this.invite?.id === m.id) this.invite = null;
        r.dispose(); this.remotes.delete(m.id);
        this.cardsIn.delete(m.id);
        this.firePeer('out', m.id);
        break;
      }
      case 'st': for (const [id, st] of m.ps) if (id !== me) this.remotes.get(id)?.push(st, now); return;
      case 'bow': {
        const r = this.remotes.get(m.fr);
        if (!r || m.fr === me) break;
        r.bow();
        if (m.to !== me) break;
        if (m.re) { this.k.note(`${this.label(m.fr)}还了一礼`, 'net'); break; }
        // 闲着就还一礼（对方那边看得见），忙着就记下，界面上出「还礼」
        if (this.free() && this.k.player.speed < 0.3) {
          this.k.note(`${this.label(m.fr)}向你作揖，你还了一礼`, 'net');
          window.setTimeout(() => {
            const rr = this.remotes.get(m.fr);
            if (!rr || !this.client?.online) return;
            if (this.client.send({ t: 'bow', to: m.fr, re: 1 })) this.bowAt(rr.pos);
          }, 650);
        } else {
          this.k.note(`${this.label(m.fr)}向你作揖`, 'net');
          this.invite = { id: m.fr, until: now + 15000 };
        }
        break;
      }
      case 'say': {
        const r = this.remotes.get(m.fr);
        if (!r || m.fr === me) break;
        r.line = { k: m.k, until: now + 4800 };
        if (m.to === me) this.k.note(`${this.label(m.fr)}：${phraseText(m.k)}`, 'net');
        break;
      }
      case 'fo': if (m.on) this.k.note(`${this.label(m.fr)}与你同行`, 'net'); break;
      case 'no': break;
    }
    this.dirty = true;
  }

  /** 这个人在界面上叫什么（同名的添衣色） */
  label(id: number): string { return this.snapshot.peers.find((p) => p.id === id)?.label ?? labels(this.list()).get(id) ?? nameOf(this.remotes.get(id)?.n); }
  private list() { return [{ id: 0, n: this.me.n, c: this.me.c }, ...[...this.remotes.values()].map((r) => ({ id: r.id, n: r.n, c: r.c }))]; }

  /** 自己此刻的样子 */
  private state(now: number): State {
    const k = this.k, p = k.player, av = p.av, root = av.root;
    const carried = root.parent !== k.world.scene;
    const src = carried ? p.pos : root.position;
    const hidden = carried || k.nav.busy || !this.playing || k.veil > 0.5;
    return [
      Math.max(0, Math.floor(now - this.ct0)),
      r2(clamp(src.x, BOUNDS.x[0], BOUNDS.x[1])), r2(clamp(src.y, BOUNDS.y[0], BOUNDS.y[1])), r2(clamp(src.z, BOUNDS.z[0], BOUNDS.z[1])),
      r3(clamp(wrap(p.yaw), -3.1415, 3.1415)), r2(clamp(p.speed, 0, BOUNDS.speed)),
      placeIndex(k.nav.place.id), actIndex(k.act?.id), poseIndex(av.pose), hidden ? 1 : 0,
    ];
  }
  private changed(a: State, b: State | null): boolean {
    if (!b) return true;
    if (Math.abs(a[1] - b[1]) > 0.009 || Math.abs(a[2] - b[2]) > 0.009 || Math.abs(a[3] - b[3]) > 0.009) return true;
    if (Math.abs(wrap(a[4] - b[4])) > 0.009) return true;
    for (let i = 6; i < 10; i++) if (a[i] !== b[i]) return true;
    return Math.abs(a[5] - b[5]) > 0.2 || (a[5] === 0) !== (b[5] === 0);
  }

  // —— 每帧 ——
  tick(dt: number, t: number) {
    const t0 = performance.now(), now = t0, k = this.k;
    // 此刻读到的位置是上一帧走完时的（这一份 tick 排在总装的 update 前头）：钟也记上一帧的
    const stamp = this.clock || now;
    this.clock = now;
    if (this.autoPlay && !this.playing && k.veil < 0.5) this.setPlaying(true);
    const c = this.client;
    // 报自己的样子：一秒至多八回，没变就不报
    if (c?.online && now - this.lastSentAt >= 124) {
      const st = this.state(stamp);
      if (this.changed(st, this.lastSent) && c.send({ t: 's', d: st })) { this.lastSent = st; this.lastSentAt = now; }
    }
    // 别人：人人插一下位置（便宜）；重摆身子（贵）按份额来——一帧至多摆几个，急的（刚跳过去、在作揖）、近的先摆，
    // 没轮上的下一帧先轮（于是二十几个人挤在一处时，开销是有顶的：远的、多的只是摆得疏一点）
    let figs = 0;
    if (this.remotes.size) {
      const cam = k.world.camera;
      this.frustum.setFromProjectionMatrix(this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      this.frame++;
      const due = this.due;
      due.length = 0;
      for (const r of this.remotes.values()) {
        r.prepare(dt, now, k.player.pos, cam, this.frustum, this.frame);
        if (r.want) due.push(r);
      }
      if (due.length > 1) due.sort((a, b) => a.urge - b.urge);
      let made = false;
      for (const r of due) {
        // 份额用完了；新身子一帧至多做一个（做一个要几毫秒，一下子来了十个人别卡一下）
        if (figs >= this.budget || (!r.fig && made)) { r.defer(); continue; }
        if (!r.fig) made = true;
        if (r.refresh(t)) figs++;
      }
      for (const r of this.remotes.values()) {
        if (r.line && r.line.until < now) r.line = null;
        // 头一回走近（十五步以内）：提一句
        // （人多了不一个个说；隔十五秒才说下一个）
        if (r.shown && r.dist < 15 && !this.met.has(r.id)) {
          this.met.add(r.id);
          if (now > this.quietUntil && this.remotes.size <= 4) { this.quietUntil = now + 15000; this.k.note(`${this.label(r.id)}走近了`, 'net'); }
        }
      }
    }
    if (this.selfLine && this.selfLine.until < now) this.selfLine = null;
    if (this.invite && this.invite.until < now) { this.invite = null; this.dirty = true; }
    for (const [key, a] of this.away) if (now - a.at > AWAY_MS) { this.away.delete(key); this.dirty = true; }
    // 样子、名片：变了、没来得及报的（刚连上、隔得太近），这时补报
    if (c?.online && this.ext) { this.flushLook(now); this.flushCard(now); }
    // 园中天时：自己排第一，就报自己这里的时区与天气（变了就报，一分钟再报一回，好让后来的人一进门就拿到）；人人照那一份走
    const sky = this.skyNow();
    if (c?.online && sky?.self && this.order.length) {
      const d: [number, number] = [localTz(), Math.max(0, WEATHERS.indexOf(k.atmos.weather))], key = d.join(',');
      if ((key !== this.skySent || now - this.skySentAt > 60000) && c.send({ t: 'sky', d })) { this.skySent = key; this.skySentAt = now; }
    }
    k.setShared(sky && !this.ownSky ? { tz: sky.tz, weather: sky.weather } : null);
    this.stepFollow(dt);
    // 给界面的：一秒四回（距离在变），有事立刻
    this.viewT -= dt;
    if (this.dirty || (this.viewT <= 0 && this.remotes.size)) { this.viewT = 0.25; this.emit(); }
    const ms = performance.now() - t0;
    this.ms += (ms - this.ms) * 0.05;
    this.perf.frames++; this.perf.ms += ms; this.perf.figs += figs;
  }

  /** 同行：隔一小会儿看一眼他在哪，走到他身后一步半；他跑远了就跑；自己一动手、做起事来、他走了，就不跟了 */
  private stepFollow(dt: number) {
    const f = this.fo;
    if (!f) return;
    const k = this.k, p = k.player, r = this.remotes.get(f.id);
    if (!r || !this.client?.online) { this.follow(null); return; }
    // 自己动了手（键盘、摇杆、点了别处、去做一件事）：不跟了。
    // 「点了别处」按人这一程是谁派的来分：不是同行派的（goals 对不上）就是自己点的——
    // 先前只比路的终点，离他两三步以内、同行没派路时，自己点的路刚起步就被下面「站住」叫停，点什么都像没反应（试玩：学堂「灯火」点了没反应）
    const tookOver = p.input.lengthSq() > 0.0009 || !!k.act || !!k.pendingAct || k.nav.busy || (p.walking && p.goals !== f.seq);
    if (tookOver) { this.follow(null, false); return; }
    f.t -= dt;
    if (f.t > 0) return;
    f.t = r.dist > 25 ? 0.9 : 0.35;
    if (r.hidden || !r.seen) { f.lost += 0.35; if (f.lost > 25) this.follow(null); return; }
    f.lost = 0;
    const d = r.dist;
    if (d > 150) { this.follow(null); return; }
    if (!f.told && d < NEAR - 5) { f.told = this.client.send({ t: 'fo', to: f.id, on: 1 }); }
    const dx = r.pos.x - p.pos.x, dz = r.pos.z - p.pos.z;
    if (d > 2.6) {
      const gx = r.pos.x - (dx / d) * 1.6, gz = r.pos.z - (dz / d) * 1.6;
      if (!p.walking || !f.goal || Math.hypot(gx - f.goal[0], gz - f.goal[1]) > 0.8) {
        p.goTo(gx, gz, { r: 0.4 });
        f.seq = p.goals;
        const path = p.path, e = path?.[path.length - 1];
        f.goal = e ? [e[0], e[1]] : [gx, gz];
      }
      // 他跑远了：跑着跟（跟上了放开）
      if (d > 10 && !k.runLock) { k.setRun(true); f.ran = true; }
    } else {
      if (p.walking) { p.stop(); f.goal = null; }
      if (!p.walking) p.faceTo = Math.atan2(dx, dz);
    }
    if (f.ran && d < 5) { k.setRun(false); f.ran = false; }
  }

  private build(): NetView {
    const me = this.me, ls = labels(this.list()), sky = this.skyNow();
    const peers: PeerView[] = [];
    // 园中人数只数报过位置的（与下面那份名单同一个口径）：手机锁屏、切到后台、另一个标签页被冻住的连接，
    // socket 还连着（中转那边也算一人），但它的画面停了、一份位置也不报；先前按连接数报「二位」，纸上却一个人也没有
    let here = 0;
    for (const r of this.remotes.values()) {
      if (!r.seen) continue;
      here++;
      peers.push({
        id: r.id, n: r.n, c: r.c, label: ls.get(r.id) ?? nameOf(r.n), robe: robeName(r.c),
        dist: r.dist, far: r.hidden ? farText(99, r.place) : farText(r.dist, r.place), doing: actLabel(r.act), hidden: r.hidden,
        close: !r.hidden && r.dist <= CLOSE, following: this.following === r.id, invite: this.invite?.id === r.id,
      });
    }
    peers.sort((a, b) => (a.hidden === b.hidden ? a.dist - b.dist : a.hidden ? 1 : -1));
    return {
      enabled: !!this.client, on: me.on, status: this.status,
      me: { label: ls.get(0) ?? nameOf(me.n), robe: robeName(me.c), c: me.c, n: me.n },
      peers, others: here, near: peers.filter((p) => !p.hidden && p.dist < 40).length, following: this.following,
      total: 1 + here + this.away.size,
      away: [...this.away.entries()].map(([key, a]) => ({ key, label: a.label, robe: robeName(a.c), c: a.c })),
      sky: sky ? { self: sky.self, host: sky.self ? (ls.get(0) ?? nameOf(me.n)) : (ls.get(sky.host) ?? nameOf(this.remotes.get(sky.host)?.n)), tz: sky.tz, own: this.ownSky } : null,
      ext: this.ext && !!this.client?.online, marks: this.marks.size,
    };
  }

  dispose() { this.clear(); this.client?.dispose(); this.client = null; this.subs.clear(); }
}

let current: Together | null = null;
/** 世界里的「同游」（世界还没建好、或没装上时是 null） */
export const getTogether = () => current;

/** acts/net.ts 调：装上（每帧的事推进世界的主循环；出错三次就停掉它自己，园子照常） */
export function startNet(k: Anlewo): Together {
  current?.dispose();
  const loc = typeof location === 'undefined' ? null : location;
  const tg = new Together(k, { search: loc?.search ?? '', path: loc?.pathname ?? '', dev: !!import.meta.env?.DEV, webdriver: typeof navigator !== 'undefined' && !!navigator.webdriver, host: loc?.host ?? '', secure: loc?.protocol === 'https:' });
  current = tg;
  // 出错三次就停掉它自己（断开连接：别人那边他就走了，不会站成一个不动的人），园子照常
  let errs = 0;
  k.world.tick.push((dt, t) => {
    if (errs >= 3) return;
    try { tg.tick(dt, t); } catch (e) {
      errs++;
      console.warn(`同游出错（第 ${errs} 次）`, e);
      if (errs >= 3) { try { tg.dispose(); } catch { /* 无妨 */ } if (current === tg) current = null; }
    }
  });
  if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__net = tg;
  return tg;
}
