/**
 * 同游的中转（relay）里不碰网络的那一半：认字段、分屋子、限速、攒一拍再发。relay.mjs 把 ws 的连接接到这里；测试（tests/net.test.ts）直接用假连接驱动它。
 *
 * 规矩：
 *   - 不存任何东西：没有账号、没有名字的原文、没有位置的记录；进程一停全都没了。
 *   - 线上没有一个自由写的字：名字是两张名单里的两个序号，衣色、说的话、在哪一处、做什么事、姿态都是 proto.json 里各张单子的序号；
 *     数要是有限的、在范围里的，坐标落到厘米。哪一样不对，这一条整个不要；不对的太多，断开。
 *   - 一间屋子至多 roomSize 人（默认 24）。来了人先进人最多、还没满的那间（好遇见人）；断线重连时可以要回原来那间。
 *   - 各人的位置随来随收，每一拍（relay 里 100 毫秒一拍）把这一拍里动过的人一并发给同屋的人。
 */
import { readFileSync } from 'node:fs';

/** 两边共用的单子（客户端也读同一个文件） */
export const PROTO = JSON.parse(readFileSync(new URL('./proto.json', import.meta.url), 'utf8'));

const NA = PROTO.names.a.length, NB = PROTO.names.b.length, NR = PROTO.robes.length, NK = PROTO.phrases.length;
const NPL = PROTO.places.length, NPO = PROTO.poses.length, NAC = PROTO.acts.length;
const BX = PROTO.bounds.x, BY = PROTO.bounds.y, BZ = PROTO.bounds.z, VMAX = PROTO.bounds.speed;

/** 一条消息最长多少字节（relay 里 ws 的 maxPayload 也是它） */
export const MAX_BYTES = 512;
/** 自定的断开码：客户端据此知道是该等一等再连，还是别连了 */
export const CLOSE = { bad: 4000, ver: 4001, full: 4002, busy: 4003, hello: 4004, bye: 1001 };

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** 名字：[第一张单子的序号, 第二张单子的序号] */
export function readName(n) {
  return Array.isArray(n) && n.length === 2 && isInt(n[0], 0, NA - 1) && isInt(n[1], 0, NB - 1) ? [n[0], n[1]] : null;
}
export const readRobe = (c) => (isInt(c, 0, NR - 1) ? c : null);
/** 屋子的名字（服务器自己起的：r 加几位数） */
export const readRoom = (r) => (typeof r === 'string' && /^r[0-9a-z]{1,6}$/.test(r) ? r : null);
/**
 * 一个人此刻的样子：[ct, x, y, z, yaw, 速度, 处, 事, 姿态, 藏]。
 *   ct 是他那边的钟（毫秒，整数，只增不减——别人那边按它插值）；x y z 世界坐标（米）；yaw 朝向（弧度）；
 *   处、事、姿态是 proto 里 places、acts、poses 的序号（处与事可以是 −1：不在单子上）；藏是 1 时别人那边不画他（荡秋千、摇橹、正换处）。
 * 不对就返回 null；对就返回规整过的一份（坐标到厘米、朝向到千分之一）。
 */
export function readState(d, prevCt = -1) {
  if (!Array.isArray(d) || d.length !== 10) return null;
  const [ct, x, y, z, yaw, v, pl, a, po, h] = d;
  if (!isInt(ct, 0, 2147483647) || ct < prevCt) return null;
  if (!isNum(x, BX[0], BX[1]) || !isNum(y, BY[0], BY[1]) || !isNum(z, BZ[0], BZ[1])) return null;
  if (!isNum(yaw, -3.1416, 3.1416) || !isNum(v, 0, VMAX)) return null;
  if (!isInt(pl, -1, NPL - 1) || !isInt(a, -1, NAC - 1) || !isInt(po, 0, NPO - 1) || (h !== 0 && h !== 1)) return null;
  return [ct, r2(x), r2(y), r2(z), r3(yaw), r2(v), pl, a, po, h];
}

/** 令牌桶：cap 枚，每秒回 rate 枚 */
export class Bucket {
  constructor(cap, rate, now) { this.cap = cap; this.rate = rate; this.n = cap; this.t = now; }
  take(now, k = 1) {
    this.n = Math.min(this.cap, this.n + ((now - this.t) / 1000) * this.rate); this.t = now;
    if (this.n < k) return false;
    this.n -= k; return true;
  }
}

/** 往外发的消息排队到多少字节就先不发位置（慢的连接）、到多少就断开 */
const SLOW = 64 * 1024, STUCK = 1024 * 1024;

/**
 * 一个连接（relay 给的）：send(文字)、close(码, 原因)、buffered() 此刻还没发出去的字节数。
 * @typedef {{ send(s: string): void; close(code: number, why: string): void; buffered(): number }} Conn
 */

export class Hub {
  /**
   * @param {{ roomSize?: number; maxConn?: number; perIp?: number; near?: number; now?: () => number; log?: (...a: unknown[]) => void }} [o]
   */
  constructor(o = {}) {
    this.roomSize = o.roomSize ?? 24;
    this.maxConn = o.maxConn ?? 240;
    this.perIp = o.perIp ?? 12;
    /** 作揖、说话只给这么近（米）的人：按两人最后报来的位置量（客户端那边也只在近处才给按） */
    this.near = o.near ?? PROTO.near ?? 40;
    this.now = o.now ?? (() => Date.now());
    this.log = o.log ?? (() => {});
    /** @type {Map<string, { id: string; members: Set<any> }>} */
    this.rooms = new Map();
    /** @type {Set<any>} */
    this.clients = new Set();
    this.byId = new Map();
    this.ips = new Map();
    this.seq = 0; this.roomSeq = 0;
  }

  /** 这个地址还能不能再连一个：'ok'、'full'（满了）、'ip'（同一个地址连得太多） */
  admit(ip) {
    if (this.clients.size >= this.maxConn) return 'full';
    if ((this.ips.get(ip) ?? 0) >= this.perIp) return 'ip';
    return 'ok';
  }

  /** 接上一个连接（先 admit 过）。返回这个人（之后的消息、断开都拿它来找） */
  open(conn, ip = '') {
    const now = this.now();
    let id = this.seq;
    do { id = (id % 999999) + 1; } while (this.byId.has(id));
    this.seq = id;
    const c = {
      id, conn, ip, room: null, name: null, robe: 0, st: null, dirty: false, need: false, t0: now, gone: false,
      strikes: 0, strikeT: now,
      b: { all: new Bucket(40, 25, now), st: new Bucket(8, 12, now), soc: new Bucket(3, 0.8, now), nm: new Bucket(2, 0.25, now) },
    };
    this.clients.add(c); this.byId.set(id, c);
    this.ips.set(ip, (this.ips.get(ip) ?? 0) + 1);
    return c;
  }

  /** 断开了（不论哪一边断的）：从屋子里拿掉，告诉同屋的人 */
  close(c) {
    if (c.gone) return;
    c.gone = true;
    this.clients.delete(c); this.byId.delete(c.id);
    const n = (this.ips.get(c.ip) ?? 1) - 1;
    if (n > 0) this.ips.set(c.ip, n); else this.ips.delete(c.ip);
    const room = c.room;
    c.room = null;
    if (room) {
      room.members.delete(c);
      if (!room.members.size) this.rooms.delete(room.id);
      else this.toRoom(room, { t: 'out', id: c.id });
    }
  }

  /** 主动断开（不对、太快、版本不合、满了） */
  kick(c, code, why) {
    try { c.conn.close(code, why); } catch { /* 已经断了 */ }
    this.close(c);
  }

  /** 记一笔「不对」：十秒里不对超过 12 次就断开 */
  strike(c, why) {
    const now = this.now();
    if (now - c.strikeT > 10000) { c.strikes = 0; c.strikeT = now; }
    if (++c.strikes > 12) { this.log('kick', c.id, why); this.kick(c, CLOSE.bad, 'bad'); }
    return false;
  }

  /** 收到一条消息（data 是文字或 Buffer）。返回 true 是收下了 */
  message(c, data, isBinary = false) {
    if (c.gone) return false;
    const now = this.now();
    if (isBinary) return this.strike(c, 'binary');
    const len = typeof data === 'string' ? data.length : data?.length ?? 0;
    if (len > MAX_BYTES) return this.strike(c, 'size');
    if (!c.b.all.take(now)) return this.strike(c, 'rate');
    let m;
    try { m = JSON.parse(typeof data === 'string' ? data : data.toString('utf8')); } catch { return this.strike(c, 'json'); }
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return this.strike(c, 'shape');
    if (!c.room) return m.t === 'hi' ? this.hello(c, m) : this.strike(c, 'early');
    switch (m.t) {
      case 's': return this.state(c, m, now);
      case 'bow': return this.bow(c, m, now);
      case 'say': return this.say(c, m, now);
      case 'fo': return this.follow(c, m, now);
      case 'nm': return this.rename(c, m, now);
      default: return this.strike(c, 'type');
    }
  }

  /** 进门：报上名字与衣色（可以说想回哪一间），回他一份「同屋有谁、各在哪」 */
  hello(c, m) {
    if (m.v !== PROTO.v) { this.send(c, { t: 'no', why: 'ver' }); this.kick(c, CLOSE.ver, 'ver'); return false; }
    const n = readName(m.n), r = readRobe(m.c);
    if (!n || r == null) { this.kick(c, CLOSE.bad, 'hello'); return false; }
    c.name = n; c.robe = r;
    const room = this.pick(readRoom(m.rm));
    const others = [...room.members];
    room.members.add(c); c.room = room;
    this.send(c, { t: 'wel', v: PROTO.v, id: c.id, rm: room.id, cap: this.roomSize, ps: others.map((o) => [o.id, o.name[0], o.name[1], o.robe, o.st]) });
    this.toRoom(room, { t: 'in', id: c.id, n, c: r }, c);
    return true;
  }

  /** 挑一间：要的那间还有空就进那间，不然进人最多、没满的那间；都满了开一间新的 */
  pick(want) {
    const w = want ? this.rooms.get(want) : null;
    if (w && w.members.size < this.roomSize) return w;
    let best = null;
    for (const r of this.rooms.values()) if (r.members.size < this.roomSize && (!best || r.members.size > best.members.size)) best = r;
    if (best) return best;
    const id = `r${(++this.roomSeq).toString(36)}`;
    const room = { id, members: new Set() };
    this.rooms.set(id, room);
    return room;
  }

  state(c, m, now) {
    const st = readState(m.d, c.st ? c.st[0] : -1);
    if (!st) return this.strike(c, 'state');
    // 发得太勤：这一条不要（不算不对，网络抖一下会挤在一起）
    if (!c.b.st.take(now)) return false;
    c.st = st; c.dirty = true;
    return true;
  }

  /** 同屋、在近处的另一个人 */
  target(c, to) {
    if (!isInt(to, 1, 999999) || to === c.id) return null;
    const o = this.byId.get(to);
    if (!o || o.room !== c.room || !c.st || !o.st) return null;
    return Math.hypot(o.st[1] - c.st[1], o.st[3] - c.st[3]) <= this.near ? o : null;
  }

  /** 作揖（re 是 1：还礼）。同屋的人都收到（近处的人看得见他躬身），对方另记一句 */
  bow(c, m, now) {
    const o = this.target(c, m.to), re = m.re === 1 ? 1 : 0;
    if (!o || (m.re !== undefined && m.re !== 0 && m.re !== 1)) return this.strike(c, 'bow');
    if (!c.b.soc.take(now)) return false;
    this.toRoom(c.room, { t: 'bow', fr: c.id, to: o.id, re });
    return true;
  }

  /** 说一句（k 是 phrases 的序号）；to 是对谁说（0：对近处的人） */
  say(c, m, now) {
    if (!isInt(m.k, 0, NK - 1)) return this.strike(c, 'say');
    const o = m.to === 0 ? null : this.target(c, m.to);
    if (m.to !== 0 && !o) return this.strike(c, 'say');
    if (!c.b.soc.take(now)) return false;
    this.toRoom(c.room, { t: 'say', fr: c.id, to: o ? o.id : 0, k: m.k });
    return true;
  }

  /** 同行（on 1 跟上、0 不跟了）：只告诉被跟的那个人 */
  follow(c, m, now) {
    const o = this.target(c, m.to);
    if (!o || (m.on !== 0 && m.on !== 1)) return this.strike(c, 'fo');
    if (!c.b.soc.take(now)) return false;
    this.send(o, { t: 'fo', fr: c.id, on: m.on });
    return true;
  }

  /** 换一个名字（「换一个」） */
  rename(c, m, now) {
    const n = readName(m.n), r = readRobe(m.c);
    if (!n || r == null) return this.strike(c, 'nm');
    if (!c.b.nm.take(now)) return false;
    c.name = n; c.robe = r;
    this.toRoom(c.room, { t: 'nm', id: c.id, n, c: r }, c);
    return true;
  }

  /** 发给一个人。drop：是位置这类可以丢的，那人的连接慢就先不发、记着下一回补一整份 */
  send(c, msg, drop = false) {
    if (c.gone) return;
    let b = 0;
    try { b = c.conn.buffered(); } catch { /* 无妨 */ }
    if (b > STUCK) { this.log('stuck', c.id); this.kick(c, CLOSE.busy, 'slow'); return; }
    if (drop && b > SLOW) { c.need = true; return; }
    try { c.conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch { /* 断开会另外报来 */ }
  }
  toRoom(room, msg, except = null) {
    const s = JSON.stringify(msg);
    for (const m of room.members) if (m !== except) this.send(m, s);
  }

  /**
   * 一拍：每间屋子里这一拍动过的人，打成一条发给同屋的人（自己的那一份也在里头，客户端认得自己的 id，丢掉就是）。
   * 先前因为连接慢没发成的，补发一整份。
   */
  tick() {
    for (const room of this.rooms.values()) {
      const ps = [];
      for (const m of room.members) if (m.dirty && m.st) { ps.push([m.id, ...m.st]); m.dirty = false; }
      const s = ps.length ? JSON.stringify({ t: 'st', ps }) : null;
      let full = null;
      for (const m of room.members) {
        if (m.need) {
          let b = 0;
          try { b = m.conn.buffered(); } catch { /* 无妨 */ }
          if (b > SLOW) continue;
          full ??= JSON.stringify({ t: 'st', ps: [...room.members].filter((o) => o.st).map((o) => [o.id, ...o.st]) });
          m.need = false;
          this.send(m, full);
        } else if (s) this.send(m, s, true);
      }
    }
  }

  /** 隔几秒扫一遍：连上了却一直不报名字的，断开 */
  sweep() {
    const now = this.now();
    for (const c of [...this.clients]) if (!c.room && now - c.t0 > 8000) this.kick(c, CLOSE.hello, 'hello');
  }

  stats() {
    let players = 0;
    for (const r of this.rooms.values()) players += r.members.size;
    return { rooms: this.rooms.size, players, conns: this.clients.size };
  }
}
