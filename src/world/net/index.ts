/**
 * 同游：园子里遇见别的游人。
 *
 *   连到中转（server/relay.mjs，线上是 wss://kongshan.169-58-39-104.nip.io/ws）：同一间屋子（至多二十四人）里的人互相看得见——
 *   各人画成一位穿不同衣色的读书人，头上一枚小小的名签（雅号）；走近了可以作揖（对方若闲着会还礼）、说一句现成的话、同行。
 *   各人一秒报八回自己在哪、朝哪、多快、在哪一处、做什么事、什么姿态（没变就不报）；别人那边按报来的钟插值着画（interp.ts）。
 *   连不上、断了：照样一个人玩，过一会儿自己再连（client.ts）。没有一个字是自己写的：名字、话都是单子上的（proto.ts）。
 *   天时（晨昏、四季、晴雨）各人各是各的：你这里是黄昏，他那里也许是早上——别人照样画在你的天时里。
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
import { loadIdentity, roll, saveIdentity, type Identity } from './identity';
import { PHRASES, NEAR, BOUNDS, actIndex, actLabel, nameOf, phraseText, placeIndex, poseIndex, robeName, type Name } from './proto';
import { Remote, type Line } from './remote';
import type { State, WireIn } from './wire';
import { cnNum, farText, labels, relayUrl } from './words';

export { DEFAULT_RELAY, cnNum, farText, labels, relayUrl } from './words';

/** 作揖、说话、同行要走到多近（米；中转那边宽一些，按 NEAR） */
export const CLOSE = 12;

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
export interface NetView {
  /** 有没有可连的中转（没有时界面什么也不出） */ enabled: boolean;
  on: boolean; status: Status;
  me: { label: string; robe: string; c: number; n: Name };
  peers: PeerView[];
  /** 同屋另有几位；画面近处几位 */ others: number; near: number;
  following: number | null;
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
  private fo: { id: number; t: number; goal: [number, number] | null; told: boolean; ran: boolean; lost: number } | null = null;
  private bowTimer = 0; private socialAt = 0;
  /** 没有界面（?ui=0、world.html 那个台子）又明说了要连：画一淡开就算走动着 */
  private autoPlay: boolean;

  constructor(private k: Anlewo, loc: { search: string; dev: boolean; webdriver: boolean; path?: string }) {
    const r = relayUrl(loc.search, loc.dev, loc.webdriver);
    this.url = r.url; this.explicit = r.explicit;
    this.autoPlay = r.explicit && (new URLSearchParams(loc.search).get('ui') === '0' || /world\.html$/.test(loc.path ?? ''));
    this.budget = k.q.tier === 'low' || k.q.mobile ? 3 : 5;
    this.me = loadIdentity();
    this.snapshot = this.build();
    if (this.url) this.client = new NetClient(this.url, () => ({ n: this.me.n, c: this.me.c }), { status: (s) => this.onStatus(s), message: (m) => this.onMessage(m) });
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
    if (!on) this.follow(null);
    this.sync(); this.emit();
  }
  /** 换一个雅号（衣色跟着换） */
  reroll() {
    this.me = roll(this.me); saveIdentity(this.me);
    this.client?.send({ t: 'nm', n: this.me.n, c: this.me.c });
    this.emit();
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
    this.fo = id == null || !this.remotes.has(id) ? null : prev?.id === id ? prev : { id, t: 1, goal: null, told: false, ran: false, lost: 0 };
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
  }
  private add(id: number, n: Name, c: number): Remote {
    let r = this.remotes.get(id);
    if (r) { r.rename(n, c); return r; }
    r = new Remote(this.k.world.scene, this.k.q, id, n, c, this.seq++);
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
        if (!this.welcomed && m.ps.length) this.k.note(`园中另有${cnNum(m.ps.length)}位游人`, 'net');
        this.welcomed = true;
        // 进门时本来就在近处的，不再说「走近了」
        this.quietUntil = now + 2500;
        break;
      }
      case 'in': this.add(m.id, m.n, m.c); break;
      case 'nm': this.remotes.get(m.id)?.rename(m.n, m.c); break;
      case 'out': {
        const r = this.remotes.get(m.id);
        if (!r) break;
        if (r.shown && r.dist < 15) this.k.note(`${this.label(m.id)}别过`, 'net');
        if (this.following === m.id) this.follow(null);
        if (this.invite?.id === m.id) this.invite = null;
        r.dispose(); this.remotes.delete(m.id);
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
    // 自己动了手（键盘、摇杆、点了别处、去做一件事）：不跟了
    const tookOver = p.input.lengthSq() > 0.0009 || !!k.act || k.nav.busy || (f.goal && p.walking && (() => { const path = p.path; const e = path?.[path.length - 1]; return !e || Math.hypot(e[0] - f.goal![0], e[1] - f.goal![1]) > 0.35; })());
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
    const me = this.me, ls = labels(this.list());
    const peers: PeerView[] = [];
    for (const r of this.remotes.values()) {
      if (!r.seen) continue;
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
      peers, others: this.remotes.size, near: peers.filter((p) => !p.hidden && p.dist < 40).length, following: this.following,
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
  const tg = new Together(k, { search: loc?.search ?? '', path: loc?.pathname ?? '', dev: !!import.meta.env?.DEV, webdriver: typeof navigator !== 'undefined' && !!navigator.webdriver });
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
