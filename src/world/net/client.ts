/**
 * 与中转之间的那根线：连上、报名字、收发消息；断了就安静地等一会儿再连（一秒、两秒、四秒……至多一分钟，带一点随机，免得大家同时挤上来）。
 * 连不上的时候什么也不耽误——园子照样是一个人的园子。
 *   满了（4002）、太快（4003）：等久一点；版本不合（4001）：不再连（要重开页面换新的一版）。
 *   页面切到后台半分钟：先断开（别人看见他走了），回来再连。
 */
import { PROTO_V, type Name } from './proto';
import type { WireIn } from './wire';
import { readIn } from './wire';

export type Status = 'off' | 'connecting' | 'online' | 'retry' | 'full' | 'old';

export interface ClientEvents {
  status(s: Status): void;
  message(m: WireIn): void;
}

const CODE = { ver: 4001, full: 4002, busy: 4003 };

export class NetClient {
  status: Status = 'off';
  /** 想不想连着（独游时 false） */
  private want = false;
  private ws: WebSocket | null = null;
  private retryT = 0; private tries = 0; private openedAt = 0;
  private hideT = 0; private paused = false;
  /** 上一回在哪一间（重连时要回去） */
  room: string | null = null;
  id = 0;
  /** 收到的、发出的消息数（看看线上有多忙） */
  stats = { in: 0, out: 0, bytesIn: 0 };

  constructor(public url: string, private who: () => { n: Name; c: number; lk?: number[] | null; cd?: number[] | null }, private ev: ClientEvents) {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVis);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('pagehide', this.onHide);
      window.addEventListener('pageshow', this.onShow);
    }
  }

  get online() { return this.status === 'online'; }

  /** 同游 / 独游 */
  setWant(on: boolean) {
    if (on === this.want) return;
    this.want = on;
    if (on) { this.tries = 0; this.connect(); }
    else { this.drop(1000, 'off'); this.setStatus('off'); }
  }

  send(m: object): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1 || this.status !== 'online') return false;
    // 发不出去、堆了太多（网太慢）：位置这一类就先不发了
    if (ws.bufferedAmount > 16384) return false;
    try { ws.send(JSON.stringify(m)); this.stats.out++; return true; } catch { return false; }
  }

  private setStatus(s: Status) { if (s !== this.status) { this.status = s; this.ev.status(s); } }

  private connect() {
    window.clearTimeout(this.retryT); this.retryT = 0;
    if (!this.want || this.paused || this.ws) return;
    if (typeof WebSocket === 'undefined') { this.setStatus('retry'); return; }
    this.setStatus('connecting');
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch { this.later(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.openedAt = performance.now();
      const w = this.who();
      // 样子、名片一并报上（旧的一版中转不看这两样）
      try { ws.send(JSON.stringify({ t: 'hi', v: PROTO_V, n: w.n, c: w.c, ...(this.room ? { rm: this.room } : {}), ...(w.lk ? { lk: w.lk } : {}), ...(w.cd ? { cd: w.cd } : {}) })); } catch { /* 断开会另外报来 */ }
    };
    ws.onmessage = (e) => {
      if (ws !== this.ws || typeof e.data !== 'string' || e.data.length > 65536) return;
      this.stats.in++; this.stats.bytesIn += e.data.length;
      let raw: unknown;
      try { raw = JSON.parse(e.data); } catch { return; }
      const m = readIn(raw);
      if (!m) return;
      if (m.t === 'wel') { this.id = m.id; this.room = m.rm; this.tries = 0; this.setStatus('online'); }
      this.ev.message(m);
    };
    ws.onclose = (e) => {
      if (ws !== this.ws) return;
      this.ws = null;
      const was = this.status === 'online';
      if (!this.want || this.paused) { this.setStatus(this.want ? 'retry' : 'off'); return; }
      if (e.code === CODE.ver) { this.setStatus('old'); return; }
      // 连了好一阵才断的：从头数（一秒后再连）
      if (was && performance.now() - this.openedAt > 20000) this.tries = 0;
      this.later(e.code === CODE.full || e.code === CODE.busy ? 30000 : 0);
    };
    ws.onerror = () => { /* 接着会有 onclose */ };
  }

  /** 过一会儿再连 */
  private later(min = 0) {
    window.clearTimeout(this.retryT);
    this.setStatus(min >= 30000 ? 'full' : 'retry');
    const base = Math.min(60000, 1000 * 2 ** Math.min(this.tries, 6)), wait = Math.max(min, base) * (0.75 + Math.random() * 0.5);
    this.tries++;
    this.retryT = window.setTimeout(() => this.connect(), wait);
  }

  private drop(code: number, why: string) {
    window.clearTimeout(this.retryT); this.retryT = 0;
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(code, why); } catch { /* 无妨 */ } }
  }

  private onVis = () => {
    if (document.visibilityState === 'hidden') {
      window.clearTimeout(this.hideT);
      this.hideT = window.setTimeout(() => {
        this.paused = true;
        if (this.ws) { this.drop(1000, 'away'); this.setStatus(this.want ? 'retry' : 'off'); }
      }, 30000);
    } else {
      window.clearTimeout(this.hideT);
      if (this.paused) { this.paused = false; this.tries = 0; this.connect(); }
    }
  };
  private onOnline = () => { if (this.want && !this.ws) { this.tries = 0; this.connect(); } };
  // 关页面、切走（进了往返缓存）：说一声再走；从缓存里回来（pageshow）再连
  private onHide = () => { this.drop(1000, 'bye'); if (this.status === 'online') this.setStatus('retry'); };
  private onShow = (e: PageTransitionEvent) => { if (e.persisted && this.want && !this.ws) { this.tries = 0; this.connect(); } };

  dispose() {
    this.want = false; this.drop(1000, 'bye');
    window.clearTimeout(this.hideT);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVis);
    if (typeof window !== 'undefined') { window.removeEventListener('online', this.onOnline); window.removeEventListener('pagehide', this.onHide); window.removeEventListener('pageshow', this.onShow); }
  }
}
