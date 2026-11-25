// 同游：中转里分屋子、认字段、限速、攒一拍再发（server/core.mjs）；客户端这边认消息、插值、连哪里、同名怎么分。
import { describe, expect, it } from 'vitest';
import { CLOSE, Hub, MAX_BYTES, PROTO, readName, readRoom, readState, type Conn, type HubClient } from '../server/core.mjs';
import { Track, type View } from '../src/world/net/interp';
import { readIn } from '../src/world/net/wire';
import { DEFAULT_RELAY, cnNum, farText, labels, relayUrl } from '../src/world/net/words';
import { ACTS, NAME_A, NAME_B, PHRASES, PLACE_IDS, POSES, ROBES, actIndex, nameOf } from '../src/world/net/proto';
import { ROBE_LOOKS, lookFor } from '../src/world/net/looks';
import { PLACES } from '../src/world/site';

/** 一个假连接：记下发给它的、断开的码 */
function fake(buffered = 0) {
  const c = { got: [] as Array<Record<string, unknown>>, closed: null as null | number, buf: buffered };
  const conn: Conn = { send: (s) => c.got.push(JSON.parse(s)), close: (code) => { c.closed = code; }, buffered: () => c.buf };
  return { c, conn };
}
function hub(o: ConstructorParameters<typeof Hub>[0] = {}) {
  let now = 1000;
  const h = new Hub({ now: () => now, ...o });
  return { h, tick: (ms: number) => { now += ms; }, at: () => now };
}
const hi = (n: [number, number] = [0, 0], c = 0, extra: Record<string, unknown> = {}) => JSON.stringify({ t: 'hi', v: PROTO.v, n, c, ...extra });
const st = (ct: number, x = 0, z = 10, more: Partial<Record<'y' | 'yaw' | 'v' | 'pl' | 'a' | 'po' | 'h', number>> = {}) =>
  JSON.stringify({ t: 's', d: [ct, x, more.y ?? 0.5, z, more.yaw ?? 0, more.v ?? 1.4, more.pl ?? 2, more.a ?? -1, more.po ?? 0, more.h ?? 0] });
function join(h: Hub, name: [number, number] = [0, 0], ip = '1.1.1.1', extra: Record<string, unknown> = {}) {
  const f = fake();
  const cl = h.open(f.conn, ip);
  h.message(cl, hi(name, 0, extra));
  return { cl, ...f };
}

describe('中转：认字段', () => {
  it('名字是两张名单里的序号，别的一概不要', () => {
    expect(readName([0, 0])).toEqual([0, 0]);
    expect(readName([NAME_A.length - 1, NAME_B.length - 1])).toEqual([NAME_A.length - 1, NAME_B.length - 1]);
    for (const bad of [[NAME_A.length, 0], [0, NAME_B.length], [-1, 0], [0.5, 1], ['伊川', '散人'], [0], [0, 0, 0], null, '伊川散人', { 0: 0, 1: 0 }]) expect(readName(bad)).toBeNull();
  });
  it('一个人的样子：数要有限、在范围里，坐标落到厘米，钟只增不减', () => {
    expect(readState([5, 1.23456, 0.5, 13.6789, 3.14159, 1.4, 2, -1, 0, 0])).toEqual([5, 1.23, 0.5, 13.68, 3.142, 1.4, 2, -1, 0, 0]);
    const ok = [5, 1, 0.5, 13, 0, 1.4, 2, -1, 0, 0];
    const bad: unknown[][] = [
      [5, Infinity, 0.5, 13, 0, 1, 2, -1, 0, 0], [5, NaN, 0.5, 13, 0, 1, 2, -1, 0, 0], [5, 1e6, 0.5, 13, 0, 1, 2, -1, 0, 0], [5, 1, 0.5, 13, 4, 1, 2, -1, 0, 0],
      [5, 1, 0.5, 13, 0, 99, 2, -1, 0, 0], [5, 1, 0.5, 13, 0, 1, PLACE_IDS.length, -1, 0, 0], [5, 1, 0.5, 13, 0, 1, 2, ACTS.length, 0, 0],
      [5, 1, 0.5, 13, 0, 1, 2, -1, POSES.length, 0], [5, 1, 0.5, 13, 0, 1, 2, -1, 0, 2], [5.5, 1, 0.5, 13, 0, 1, 2, -1, 0, 0], [-1, 1, 0.5, 13, 0, 1, 2, -1, 0, 0],
      [5, '1', 0.5, 13, 0, 1, 2, -1, 0, 0], [5, 1, 0.5, 13, 0, 1, 2, -1, 0], [...ok, 0],
    ];
    for (const d of bad) expect(readState(d), JSON.stringify(d)).toBeNull();
    expect(readState(ok, 6)).toBeNull();
    expect(readState(ok, 5)).not.toBeNull();
    expect(readRoom('r1')).toBe('r1');
    expect(readRoom('r1; drop')).toBeNull();
  });
});

describe('中转：屋子', () => {
  it('来了人先进人最多、还没满的那间；满了开新的；走光了屋子就没了', () => {
    const { h } = hub({ roomSize: 3 });
    const a = join(h), b = join(h), c = join(h), d = join(h);
    expect(a.cl.room!.id).toBe(b.cl.room!.id);
    expect(c.cl.room!.id).toBe(a.cl.room!.id);
    expect(d.cl.room!.id).not.toBe(a.cl.room!.id);
    expect(h.rooms.size).toBe(2);
    // 第二间里只有一个：再来的人仍进人最多（还没满）的那间——第一间满着，就进第二间
    const e = join(h);
    expect(e.cl.room!.id).toBe(d.cl.room!.id);
    h.close(d.cl); h.close(e.cl);
    expect(h.rooms.size).toBe(1);
  });
  it('进门给一份同屋的名单；别人收到「来了」「走了」', () => {
    const { h } = hub();
    const a = join(h, [1, 2]);
    h.message(a.cl, st(10, 1, 2));
    const b = join(h, [3, 4]);
    const wel = b.c.got[0] as { t: string; id: number; ps: unknown[][] };
    expect(wel.t).toBe('wel');
    expect(wel.id).toBe(b.cl.id);
    expect(wel.ps).toEqual([[a.cl.id, 1, 2, 0, [10, 1, 0.5, 2, 0, 1.4, 2, -1, 0, 0]]]);
    expect(a.c.got.at(-1)).toEqual({ t: 'in', id: b.cl.id, n: [3, 4], c: 0 });
    h.close(b.cl);
    expect(a.c.got.at(-1)).toEqual({ t: 'out', id: b.cl.id });
  });
  it('断线重连可以要回原来那一间（那间还在、还有空的话）', () => {
    const { h } = hub({ roomSize: 3 });
    for (let i = 0; i < 3; i++) join(h);                 // 第一间满了
    const d = join(h), e = join(h), f = join(h);          // 第二间也满了
    const g = join(h);                                    // 第三间
    expect(d.cl.room).toBe(f.cl.room);
    const r3 = g.cl.room!.id;
    h.close(e.cl);                                        // 第二间空出一个（两人），第三间一人
    expect(join(h).cl.room).toBe(d.cl.room);              // 不说要哪间：进人多的那间
    h.close(f.cl);
    expect(join(h, [0, 0], 'x', { rm: r3 }).cl.room!.id).toBe(r3);   // 说了要第三间：就进第三间
    expect(join(h, [0, 0], 'x', { rm: 'r99' }).cl.room).toBe(d.cl.room);   // 要的那间没了：照常挑
  });
  it('版本不合：说一声「no」，用 4001 断开；名字不对：4000', () => {
    const { h } = hub();
    const f = fake(), cl = h.open(f.conn, 'x');
    h.message(cl, JSON.stringify({ t: 'hi', v: PROTO.v + 1, n: [0, 0], c: 0 }));
    expect(f.c.got[0]).toEqual({ t: 'no', why: 'ver' });
    expect(f.c.closed).toBe(CLOSE.ver);
    const g = fake(), c2 = h.open(g.conn, 'x');
    h.message(c2, JSON.stringify({ t: 'hi', v: PROTO.v, n: ['伊川', '散人'], c: 0 }));
    expect(g.c.closed).toBe(CLOSE.bad);
    expect(h.clients.size).toBe(0);
  });
  it('总连接数、同一个地址的连接数有上限；连上了不报名字的，八秒后断开', () => {
    const { h, tick } = hub({ maxConn: 3, perIp: 2 });
    h.open(fake().conn, 'a'); h.open(fake().conn, 'a');
    expect(h.admit('a')).toBe('ip');
    expect(h.admit('b')).toBe('ok');
    const silent = fake(); h.open(silent.conn, 'b');
    expect(h.admit('c')).toBe('full');
    tick(9000); h.sweep();
    expect(silent.c.closed).toBe(CLOSE.hello);
    expect(h.clients.size).toBe(0);
  });
});

describe('中转：位置一拍一拍地发', () => {
  it('这一拍里动过的人打成一条，发给同屋各人；没动的不发', () => {
    const { h } = hub();
    const a = join(h), b = join(h), c = join(h);
    for (const x of [a, b, c]) x.c.got.length = 0;
    h.message(a.cl, st(10, 1, 2));
    h.message(b.cl, st(10, 3, 4));
    h.tick();
    const m = c.c.got[0] as { t: string; ps: number[][] };
    expect(m.t).toBe('st');
    expect(m.ps.map((p) => p[0]).sort()).toEqual([a.cl.id, b.cl.id].sort());
    c.c.got.length = 0;
    h.tick();
    expect(c.c.got.length).toBe(0);
  });
  it('他那边的钟往回走的、字段不对的，不收', () => {
    const { h } = hub();
    const a = join(h);
    expect(h.message(a.cl, st(10))).toBe(true);
    expect(h.message(a.cl, st(9))).toBe(false);
    expect(h.message(a.cl, st(11, 1e9))).toBe(false);
    expect(a.cl.st![0]).toBe(10);
  });
  it('发得太勤的位置丢掉（不算不对）；慢的连接先不发位置，好了再补一整份', () => {
    const { h, tick } = hub();
    const a = join(h), b = join(h);
    let took = 0;
    for (let i = 0; i < 30; i++) if (h.message(a.cl, st(100 + i))) took++;
    expect(took).toBeLessThanOrEqual(9);
    expect(a.c.closed).toBeNull();
    tick(1000);
    b.c.buf = 100000;
    h.message(a.cl, st(500, 5, 5));
    b.c.got.length = 0;
    h.tick();
    expect(b.c.got.length).toBe(0);
    b.c.buf = 0;
    h.tick();
    const m = b.c.got[0] as { t: string; ps: number[][] };
    expect(m.t).toBe('st');
    expect(m.ps.find((p) => p[0] === a.cl.id)?.[1]).toBe(500);
  });
});

describe('中转：作揖、说话', () => {
  it('同屋、在近处的人才行；不能对自己；话是单子上的序号', () => {
    const { h } = hub();
    const a = join(h), b = join(h);
    h.message(a.cl, st(1, 0, 10)); h.message(b.cl, st(1, 3, 10));
    b.c.got.length = 0;
    expect(h.message(a.cl, JSON.stringify({ t: 'bow', to: b.cl.id }))).toBe(true);
    expect(b.c.got.at(-1)).toEqual({ t: 'bow', fr: a.cl.id, to: b.cl.id, re: 0 });
    expect(h.message(a.cl, JSON.stringify({ t: 'bow', to: a.cl.id }))).toBe(false);
    expect(h.message(a.cl, JSON.stringify({ t: 'say', to: b.cl.id, k: PHRASES.length }))).toBe(false);
    expect(h.message(a.cl, JSON.stringify({ t: 'say', to: b.cl.id, k: 'hello' }))).toBe(false);
    // 走远了（超过 near）：不送
    h.message(b.cl, st(2, 3 + PROTO.near + 5, 10));
    expect(h.message(a.cl, JSON.stringify({ t: 'say', to: b.cl.id, k: 0 }))).toBe(false);
  });
  it('一个人说得太勤：多出来的不送（三句之后要等）', () => {
    const { h } = hub();
    const a = join(h), b = join(h);
    h.message(a.cl, st(1, 0, 10)); h.message(b.cl, st(1, 1, 10));
    let sent = 0;
    for (let i = 0; i < 8; i++) if (h.message(a.cl, JSON.stringify({ t: 'say', to: b.cl.id, k: 0 }))) sent++;
    expect(sent).toBe(3);
  });
  it('同行只告诉被跟的那个人；换名字告诉同屋的人', () => {
    const { h } = hub();
    const a = join(h), b = join(h), c = join(h);
    for (const x of [a, b, c]) h.message(x.cl, st(1, 0, 10));
    for (const x of [a, b, c]) x.c.got.length = 0;
    h.message(a.cl, JSON.stringify({ t: 'fo', to: b.cl.id, on: 1 }));
    expect(b.c.got).toEqual([{ t: 'fo', fr: a.cl.id, on: 1 }]);
    expect(c.c.got).toEqual([]);
    h.message(a.cl, JSON.stringify({ t: 'nm', n: [5, 6], c: 3 }));
    expect(c.c.got.at(-1)).toEqual({ t: 'nm', id: a.cl.id, n: [5, 6], c: 3 });
  });
  it('乱发的（不是 JSON、太长、二进制、不认得的种类）记一笔，多了断开', () => {
    const { h } = hub();
    const a = join(h);
    expect(h.message(a.cl, 'not json')).toBe(false);
    expect(h.message(a.cl, 'x'.repeat(MAX_BYTES + 1))).toBe(false);
    expect(h.message(a.cl, new Uint8Array([1, 2, 3]), true)).toBe(false);
    expect(h.message(a.cl, JSON.stringify({ t: 'shout', text: '……' }))).toBe(false);
    expect(a.c.closed).toBeNull();
    for (let i = 0; i < 12; i++) h.message(a.cl, '{');
    expect(a.c.closed).toBe(CLOSE.bad);
    expect(h.clients.has(a.cl as HubClient)).toBe(false);
  });
});

describe('客户端：收到的消息再认一遍', () => {
  it('认得的规整成一份；越界、缺字段的整条或那一项不要', () => {
    expect(readIn({ t: 'in', id: 3, n: [1, 2], c: 1 })).toEqual({ t: 'in', id: 3, n: [1, 2], c: 1 });
    expect(readIn({ t: 'in', id: 3, n: [999, 2], c: 1 })).toBeNull();
    expect(readIn({ t: 'say', fr: 3, to: 0, k: 1 })).toEqual({ t: 'say', fr: 3, to: 0, k: 1 });
    expect(readIn({ t: 'say', fr: 3, to: 0, k: 999 })).toBeNull();
    expect(readIn({ t: 'bow', fr: 3, to: 4, re: 2 })).toBeNull();
    const m = readIn({ t: 'st', ps: [[3, 10, 1, 0.5, 2, 0, 1, 2, -1, 0, 0], [4, 10, 1e9, 0.5, 2, 0, 1, 2, -1, 0, 0], 'x'] });
    expect(m).toEqual({ t: 'st', ps: [[3, [10, 1, 0.5, 2, 0, 1, 2, -1, 0, 0]]] });
    expect(readIn({ t: 'eval', code: '…' })).toBeNull();
    expect(readIn(null)).toBeNull();
    expect(readIn([1, 2])).toBeNull();
  });
});

describe('客户端：按他那边的钟插值', () => {
  const v = (): View => ({ x: 0, y: 0, z: 0, yaw: 0, pl: 0, a: 0, po: 0, h: 0, live: false });
  const S = (t: number, x: number, more: Partial<{ yaw: number; h: number }> = {}) => ({ t, x, y: 0, z: 0, yaw: more.yaw ?? 0, pl: 0, a: -1, po: 0, h: more.h ?? 0 });
  it('匀着走的人画出来也是匀的：每帧走的一样多', () => {
    const tr = new Track();
    // 他那边每 125 毫秒报一回，一秒走 1.4 米；到这边晚 1000 毫秒，路上抖 0–90 毫秒
    const steps: number[] = [];
    let last = NaN, now = 0;
    const jitter = [0, 60, 20, 90, 10, 40, 70, 30];
    let sent = 0;
    for (let f = 0; f < 600; f++) {
      now = f * (1000 / 60);
      while (sent * 125 + 1000 + jitter[sent % 8] <= now) { tr.push(S(sent * 125, sent * 0.175), sent * 125 + 1000 + jitter[sent % 8]); sent++; }
      const o = tr.at(now, 280, v());
      if (o && f > 120) { if (!Number.isNaN(last)) steps.push(o.x - last); last = o.x; }
    }
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    expect(mean).toBeCloseTo(1.4 / 60, 3);
    for (const s of steps) expect(Math.abs(s - mean)).toBeLessThan(mean * 0.02);
  });
  it('离得太远（换处）：不插，到了时候一步过去', () => {
    const tr = new Track();
    tr.push(S(0, 0), 1000); tr.push(S(125, 20), 1125);
    const o = tr.at(1125 + 280 - 60, 280, v())!;
    expect(o.x).toBe(0);
    expect(tr.at(1125 + 280 + 1, 280, v())!.x).toBe(20);
  });
  it('进门时给的旧账不拿来量 lag：头一份刚报来的到了，就照它', () => {
    const tr = new Track();
    tr.push(S(1, 0), 50000, false);
    expect(tr.at(50000, 280, v())!.x).toBe(0);
    for (let i = 1; i <= 8; i++) tr.push(S(10000 + i * 125, i * 0.175), 20000 + i * 125);
    const o = tr.at(20000 + 8 * 125, 280, v())!;
    // 画的是大约 280 毫秒以前的那一刻：第 8 份之前两份多
    expect(o.x).toBeGreaterThan(0.175 * 5);
    expect(o.x).toBeLessThan(0.175 * 7);
  });
  it('来不及了往前推一小段就停，不一直往前滑；他真停下了不推', () => {
    const tr = new Track();
    for (let i = 0; i <= 8; i++) tr.push(S(i * 125, i * 0.175), 1000 + i * 125);
    const far = tr.at(1000 + 8 * 125 + 280 + 2000, 280, v())!;
    expect(far.x).toBeCloseTo(8 * 0.175, 5);
    const near = tr.at(1000 + 8 * 125 + 280 + 100, 280, v())!;
    expect(near.x).toBeGreaterThan(8 * 0.175);
    expect(near.x).toBeLessThan(8 * 0.175 + 0.15 * 1.4 + 1e-6);
    const st2 = new Track();
    st2.push(S(0, 0), 1000); st2.push(S(125, 0.02), 1125);
    expect(st2.at(1125 + 280 + 100, 280, v())!.x).toBeCloseTo(0.02, 5);
  });
  it('朝向走最短的那一边（过 ±π 不绕一圈）', () => {
    const tr = new Track();
    tr.push(S(0, 0, { yaw: 3.1 }), 1000); tr.push(S(125, 0.1, { yaw: -3.1 }), 1125);
    const o = tr.at(1000 + 62.5 + 280, 280, v())!;
    expect(Math.abs(Math.abs(o.yaw) - Math.PI)).toBeLessThan(0.05);
  });
});

describe('客户端：连哪里、怎么称呼', () => {
  it('?ws= 说了算；正式的一版默认连线上的中转，开发服务器与自动测试不连', () => {
    expect(relayUrl('', false, false)).toEqual({ url: DEFAULT_RELAY, explicit: false });
    expect(relayUrl('', true, false).url).toBeNull();
    expect(relayUrl('', false, true).url).toBeNull();
    expect(relayUrl('?ws=ws://localhost:3820/ws', true, true)).toEqual({ url: 'ws://localhost:3820/ws', explicit: true });
    expect(relayUrl('?ws=0', false, false).url).toBeNull();
    expect(relayUrl('?ws=1', true, false).url).toBe(DEFAULT_RELAY);
    expect(relayUrl('?ws=javascript:alert(1)', false, false).url).toBeNull();
    expect(relayUrl('?ws=wss://a.b/ws"><x>', false, false).url).toBeNull();
  });
  it('国内正式站连同源的 /ws（Ingress 反代到 kongshan-relay），别处仍连法国的中转', () => {
    // 网址上给了 host：anlewo.iwenxuai.com 走同源，GitHub Pages、法国、别的域名都还是默认的
    expect(relayUrl('', false, false, 'anlewo.iwenxuai.com')).toEqual({ url: 'wss://anlewo.iwenxuai.com/ws', explicit: false });
    expect(relayUrl('', false, false, 'alanhuang116.github.io')).toEqual({ url: DEFAULT_RELAY, explicit: false });
    expect(relayUrl('', false, false, 'kongshan.169-58-39-104.nip.io')).toEqual({ url: DEFAULT_RELAY, explicit: false });
    expect(relayUrl('', false, false, 'evil-anlewo.iwenxuai.com.evil.tld')).toEqual({ url: DEFAULT_RELAY, explicit: false });
    // 明文（本机用 IP 试）不该拼出 wss://anlewo.iwenxuai.com 以外的怪东西：http 就是 ws
    expect(relayUrl('', false, false, 'anlewo.iwenxuai.com', false).url).toBe('ws://anlewo.iwenxuai.com/ws');
    // ?ws=1、?ws= 与「没说」同一个默认
    expect(relayUrl('?ws=1', false, false, 'anlewo.iwenxuai.com').url).toBe('wss://anlewo.iwenxuai.com/ws');
    expect(relayUrl('?ws=', false, false, 'anlewo.iwenxuai.com').url).toBe('wss://anlewo.iwenxuai.com/ws');
    // 明说了别的地址就连那个，不受上面这一条影响
    expect(relayUrl('?ws=ws://localhost:3820/ws', false, false, 'anlewo.iwenxuai.com').url).toBe('ws://localhost:3820/ws');
    // 开发服务器照旧不连（哪怕在 anlewo.iwenxuai.com 上）
    expect(relayUrl('', true, false, 'anlewo.iwenxuai.com').url).toBeNull();
  });
  it('中文数、离多远', () => {
    expect([0, 3, 10, 12, 20, 35, 99].map(cnNum)).toEqual(['零', '三', '十', '十二', '二十', '三十五', '九十九']);
    expect(farText(1, 2)).toBe('就在身边');
    expect(farText(14, 2)).toBe('十步外');
    expect(farText(80, PLACE_IDS.indexOf('hall'))).toBe('在草堂');
    expect(farText(80, -1)).toBe('在远处');
  });
  it('同名的按衣色分，衣色也一样的再添一二三', () => {
    const l = labels([{ id: 0, n: [0, 0], c: 1 }, { id: 5, n: [0, 0], c: 2 }, { id: 7, n: [0, 0], c: 2 }, { id: 9, n: [1, 1], c: 0 }]);
    expect(l.get(9)).toBe(nameOf([1, 1]));
    expect(l.get(0)).toBe(`${nameOf([0, 0])}（${ROBES[1]}）`);
    expect(l.get(5)).toBe(`${nameOf([0, 0])}（${ROBES[2]}一）`);
    expect(l.get(7)).toBe(`${nameOf([0, 0])}（${ROBES[2]}二）`);
  });
});

describe('单子', () => {
  it('名单、衣色、话、处、事各不重样；处与总图一一对应；衣色都有画法', () => {
    expect(new Set(NAME_A).size).toBe(NAME_A.length);
    expect(new Set(NAME_B).size).toBe(NAME_B.length);
    expect(new Set(PHRASES.map((p) => p.id)).size).toBe(PHRASES.length);
    expect(new Set(ACTS.map((a) => a[0])).size).toBe(ACTS.length);
    expect([...PLACE_IDS].sort()).toEqual(PLACES.map((p) => p.id).sort());
    expect(ROBE_LOOKS.length).toBe(ROBES.length);
    for (const p of PHRASES) expect(p.text.length).toBeLessThanOrEqual(6);
    expect(actIndex('farm:till:west')).toBe(ACTS.findIndex((a) => a[0] === 'farm'));
    expect(actIndex('nothing')).toBe(-1);
  });
  it('雅号的后半截定几样小处：钓叟戴斗笠、书生没有须', () => {
    const fisher = NAME_B.indexOf('钓叟'), scholar = NAME_B.indexOf('书生');
    expect(lookFor([0, fisher], 0).hat).toBe('li');
    expect(lookFor([0, scholar], 0).beard).toBe(0);
    expect(lookFor([0, 0], 3).robe).toEqual(ROBE_LOOKS[3].robe);
  });
});
