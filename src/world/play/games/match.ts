/**
 * 同游时两个人一起玩（射箭、蹴鞠、斗鸡、骑）：邀、应、开始、两边各自的招、谁走了、谁久不应。
 *
 *   一条消息是 [op, 这一场的编号, …]：op 1 邀、2 应、3 谢（或正忙）、4 不玩了、5 还在；10 以上是各样玩法自己的（出了一箭、踢了一脚、出了一招……）。
 *   邀的那一方是先手（side 0），应的那一方是后手（side 1）；这一场的种子就是编号，两边一样。
 *   两边同时邀了对方：编号大的那一位让——应下对面的那一份，自己那一份作罢（于是不会开出两场）。
 *   没连上、中转是旧的一版（tg.canPlay 为假）：一个人也照样玩，只是不出「邀」。
 *   对面走了（onPeer 'out'）、不在这件事里了（他那边的事换了）、二十五秒没一点音信：这一场收场，告诉玩法（村里人接着陪你）。
 * 只往自己那一位发（不发给整屋），一回合一两条，远在中转的限速（一秒八条）以内。
 */
import { getTogether, type Together } from '../../net';

/** 用到的同游的那几样（Together 的一部分；测试里给一份假的） */
export type TgLike = Pick<Together, 'canPlay' | 'myId' | 'label' | 'sendGame' | 'onGame' | 'onPeer'> & { remotes: Map<number, { id: number; hidden: boolean; seen: boolean; dist: number; act: number }> };
import { actIndex, type GameKind } from '../../net/proto';
import { matchId } from './dice';

export const OP = { INVITE: 1, ACCEPT: 2, DECLINE: 3, LEAVE: 4, ALIVE: 5 } as const;
/** 邀了多久没人应就作罢（毫秒）；一场里多久没音信算走了 */
export const INVITE_MS = 60000, STALL_MS = 25000, ALIVE_MS = 6000;

export interface Peer { id: number; label: string; dist: number }
export type EndWhy = 'left' | 'timeout' | 'quit' | 'declined' | 'busy';

export interface MatchHooks {
  /** 谁可以邀（默认：看得见、在 range 米以内） */
  range?: number;
  /** 有人邀你了（界面上出「应邀」） */
  invited?(fr: number, label: string): void;
  /** 开始了：对面是谁、自己是先手（0）还是后手（1）、这一场的种子 */
  start?(peer: number, side: 0 | 1, seed: number): void;
  /** 这一场里对面发来的（op ≥ 10） */
  msg?(op: number, d: number[], fr: number): void;
  /** 收场了（对面走了、久不应、不玩了、谢绝了） */
  end?(why: EndWhy, label: string): void;
}

export class Match {
  /** 自己邀了谁、还在等 */
  out: { to: number; mid: number; at: number } | null = null;
  /** 谁邀了自己、还没应 */
  inbox: { fr: number; mid: number; at: number } | null = null;
  /** 正在进行的这一场 */
  cur: { peer: number; mid: number; side: 0 | 1; heard: number; sent: number; off: number } | null = null;
  private tg: TgLike | null = null;
  private offs: Array<() => void> = [];

  private acts: number[];
  /** getTg：取同游的那一份（测试时给一份假的） */
  constructor(private kind: GameKind, actIds: string | string[], private h: MatchHooks = {}, private getTg: () => TgLike | null = getTogether as () => TgLike | null) { this.acts = (Array.isArray(actIds) ? actIds : [actIds]).map((a) => actIndex(a)); }

  /** 同游开着、连上了、中转认得玩法 */
  get online(): boolean { this.bind(); return !!this.tg?.canPlay; }
  get peer(): number { return this.cur?.peer ?? 0; }
  get side(): 0 | 1 { return this.cur?.side ?? 0; }
  get seed(): number { return this.cur?.mid ?? 0; }
  label(id: number): string { return this.tg?.label(id) || '那一位'; }

  /** 接上同游（世界建好以后才有；换了一份就重接） */
  private bind() {
    const tg = this.getTg();
    if (tg === this.tg) return;
    for (const f of this.offs) f();
    this.offs = [];
    this.tg = tg;
    if (!tg) return;
    this.offs.push(tg.onGame(this.kind, (fr, d) => this.recv(fr, d)));
    this.offs.push(tg.onPeer((ev, id) => { if (ev === 'out') this.gone(id); }));
  }

  /** 近处可以邀的人（看得见、在 range 以内），近的在前 */
  near(max = 2): Peer[] {
    this.bind();
    const tg = this.tg;
    if (!tg?.canPlay) return [];
    const R = this.h.range ?? 24, out: Peer[] = [];
    for (const r of tg.remotes.values()) if (!r.hidden && r.seen && r.dist <= R) out.push({ id: r.id, label: tg.label(r.id), dist: r.dist });
    out.sort((a, b) => a.dist - b.dist);
    return out.slice(0, max);
  }

  invite(id: number): boolean {
    this.bind();
    if (!this.tg?.canPlay || this.cur) return false;
    const mid = matchId();
    // 先记下再发：对面若一下子就应了（同一台机器上试的时候），回来的那一声认得出
    this.out = { to: id, mid, at: performance.now() };
    if (!this.tg.sendGame(this.kind, id, [OP.INVITE, mid])) { this.out = null; return false; }
    return true;
  }
  /** 应下邀请 */
  accept(): boolean {
    const b = this.inbox;
    if (!b || !this.tg?.canPlay) return false;
    if (!this.tg.sendGame(this.kind, b.fr, [OP.ACCEPT, b.mid])) return false;
    this.inbox = null; this.out = null;
    this.begin(b.fr, b.mid, 1);
    return true;
  }
  decline() {
    const b = this.inbox;
    if (!b) return;
    this.tg?.sendGame(this.kind, b.fr, [OP.DECLINE, b.mid, 0]);
    this.inbox = null;
  }
  /** 撤回自己的邀请 */
  cancel() { this.out = null; }

  /** 这一场里发一条（op ≥ 10）：发不出去（太勤、断了）返回 false */
  send(op: number, ...d: number[]): boolean {
    const c = this.cur;
    if (!c || !this.tg?.canPlay) return false;
    const ok = this.tg.sendGame(this.kind, c.peer, [op, c.mid, ...d]);
    if (ok) c.sent = performance.now();
    return ok;
  }
  /** 自己不玩了（退出、换别的事） */
  leave() {
    const c = this.cur;
    if (c) this.tg?.sendGame(this.kind, c.peer, [OP.LEAVE, c.mid]);
    this.cur = null; this.out = null;
  }
  /** 收场（不告诉对面，比如对面先走了） */
  private finish(why: EndWhy, id: number) {
    const label = this.label(id);
    this.cur = null;
    this.h.end?.(why, label);
  }
  private begin(peer: number, mid: number, side: 0 | 1) {
    const now = performance.now();
    this.cur = { peer, mid, side, heard: now, sent: now, off: 0 };
    this.h.start?.(peer, side, mid);
  }

  private recv(fr: number, d: number[]) {
    const op = d[0], mid = d[1], now = performance.now();
    if (op === OP.INVITE) {
      if (this.cur) { this.tg?.sendGame(this.kind, fr, [OP.DECLINE, mid, 1]); return; }
      // 两边同时邀了对方：编号大的让，应下对面那一份
      if (this.out?.to === fr) {
        if ((this.tg?.myId ?? 0) > fr) { this.out = null; this.inbox = { fr, mid, at: now }; this.accept(); }
        return;
      }
      this.inbox = { fr, mid, at: now };
      this.h.invited?.(fr, this.label(fr));
      return;
    }
    if (op === OP.ACCEPT) {
      if (this.out && this.out.mid === mid && this.out.to === fr && !this.cur) { this.out = null; this.begin(fr, mid, 0); }
      return;
    }
    if (op === OP.DECLINE) {
      if (this.out && this.out.mid === mid) { this.out = null; this.h.end?.(d[2] ? 'busy' : 'declined', this.label(fr)); }
      return;
    }
    const c = this.cur;
    if (!c || c.mid !== mid || c.peer !== fr) return;
    c.heard = now;
    if (op === OP.LEAVE) { this.finish('quit', fr); return; }
    if (op === OP.ALIVE) return;
    this.h.msg?.(op, d, fr);
  }
  private gone(id: number) {
    if (this.out?.to === id) this.out = null;
    if (this.inbox?.fr === id) this.inbox = null;
    if (this.cur?.peer === id) this.finish('left', id);
  }

  /** 每帧：邀请过时、一场里报一声「还在」、对面久不应或走开了 */
  tick(dt: number) {
    this.bind();
    const now = performance.now();
    if (this.out && now - this.out.at > INVITE_MS) this.out = null;
    if (this.inbox && now - this.inbox.at > INVITE_MS) this.inbox = null;
    const c = this.cur;
    if (!c) return;
    if (!this.tg?.canPlay) { this.finish('left', c.peer); return; }
    if (now - c.sent > ALIVE_MS && this.tg.sendGame(this.kind, c.peer, [OP.ALIVE, c.mid])) c.sent = now;
    if (now - c.heard > STALL_MS) { this.finish('timeout', c.peer); return; }
    // 对面那边的事不是这一样了（他退出了、去做别的）：等几秒再算
    const r = this.tg.remotes.get(c.peer);
    if (r && r.seen && !this.acts.includes(r.act)) { c.off += dt; if (c.off > 6) this.finish('quit', c.peer); } else c.off = 0;
  }

  dispose() { this.leave(); for (const f of this.offs) f(); this.offs = []; this.tg = null; }
}

/** 「邀」那几枚签：近处的人各一枚（id 是 inv:编号） */
export const inviteChoices = (m: Match, verb: string) => m.near().map((p) => ({ id: `inv:${p.id}`, label: `邀${p.label}${verb}`, sub: m.out?.to === p.id ? '等他应' : undefined, off: m.out?.to === p.id || undefined }));
/** 有人邀着自己：「应邀」「谢」两枚签 */
export const inboxChoices = (m: Match, verb: string) => (m.inbox ? [{ id: 'accept', label: `应${m.label(m.inbox.fr)}之邀`, sub: verb, main: true }, { id: 'decline', label: '谢' }] : []);
