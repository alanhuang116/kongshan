// 同游：中转里分屋子、认字段、限速、攒一拍再发（server/core.mjs）；客户端这边认消息、插值、连哪里、同名怎么分。
import { describe, expect, it } from 'vitest';
import { CLOSE, EXT, Hub, MARK_PER, MAX_BYTES, PROTO, readCard, readGame, readLook, readMark, readName, readRoom, readSky, readState, type Conn, type HubClient } from '../server/core.mjs';
import { Track, type View } from '../src/world/net/interp';
import { readIn } from '../src/world/net/wire';
import { DEFAULT_RELAY, cnNum, farText, labels, relayUrl } from '../src/world/net/words';
import { ACTS, GAMES, NAME_A, NAME_B, PHRASES, PLACE_IDS, POSES, ROBES, actIndex, nameOf } from '../src/world/net/proto';
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
  it('座位按报过位置的人算；坐满了开新的；走光了屋子就没了', () => {
    const { h } = hub({ roomSize: 3 });
    const sit = (x: ReturnType<typeof join>) => h.message(x.cl, st(1));
    const a = join(h), b = join(h), c = join(h);
    for (const x of [a, b, c]) expect(sit(x)).toBe(true);        // 三个都报了位置：三个座位坐满
    const d = join(h);
    expect(d.cl.room!.id).not.toBe(a.cl.room!.id);               // 第一间坐满了：另开一间
    expect(h.rooms.size).toBe(2);
    expect(sit(d)).toBe(true);
    // 第一间坐满着：再来的人进第二间（坐了一个、还坐得下）
    const e = join(h);
    expect(e.cl.room!.id).toBe(d.cl.room!.id);
    h.close(d.cl); h.close(e.cl);
    expect(h.rooms.size).toBe(1);
  });
  it('只连上不报位置的尸位连接不占座位：新人仍进有人的那一间', () => {
    const { h } = hub({ roomSize: 3 });
    const a = join(h);
    h.message(a.cl, st(1, 1, 2));
    join(h); join(h); join(h);                                  // 三个尸位连接，一份位置也不报
    const b = join(h);
    expect(b.cl.room).toBe(a.cl.room);                           // 座位还空着：进同一间，见得到人
    expect(h.stats()).toEqual({ rooms: 1, players: 5, seated: 1, conns: 5, marks: 0 });
    h.message(b.cl, st(1, 3, 4));
    expect(h.seated(a.cl.room!)).toBe(2);
  });
  it('一间屋里的连接数有硬顶：尸位连接再多也另开一间', () => {
    const { h } = hub({ roomSize: 2 });                          // 硬顶是两个座位的两倍：四个连接
    const four = [join(h), join(h), join(h), join(h)];
    expect(new Set(four.map((x) => x.cl.room!.id)).size).toBe(1);
    const more = join(h);
    expect(more.cl.room!.id).not.toBe(four[0].cl.room!.id);
  });
  it('进了屋子一分钟还一份位置不报：断开（1001），同屋的人看见他走了', () => {
    const { h, tick } = hub({ ghostMs: 60000 });
    const a = join(h), ghost = join(h, [1, 1]);
    h.message(a.cl, st(1));
    expect(ghost.cl.room).toBe(a.cl.room);
    tick(59000); h.sweep();
    expect(ghost.c.closed).toBeNull();                           // 还没到一分钟：留着
    tick(2000); h.sweep();
    expect(ghost.c.closed).toBe(CLOSE.bye);
    expect(a.c.got.at(-1)).toEqual({ t: 'out', id: ghost.cl.id });
    expect(h.clients.size).toBe(1);
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
  it('断线重连可以要回原来那一间（那间还在、还坐得下的话）', () => {
    const { h } = hub({ roomSize: 3 });
    const sit = (x: ReturnType<typeof join>) => h.message(x.cl, st(1));
    for (let i = 0; i < 3; i++) sit(join(h));             // 第一间三个座位坐满
    const d = join(h), e = join(h), f = join(h);          // 第二间也坐满
    for (const x of [d, e, f]) sit(x);
    const g = join(h); sit(g);                            // 第三间一人
    expect(d.cl.room).toBe(f.cl.room);
    const r3 = g.cl.room!.id;
    h.close(e.cl);                                        // 第二间空出一个座位（两人），第三间一人
    expect(join(h).cl.room).toBe(d.cl.room);              // 不说要哪间：进坐得多的那间
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

describe('中转：园中天时', () => {
  const sky = (d: unknown) => JSON.stringify({ t: 'sky', d });
  it('屋里排第一的那一位报时区与天气：转给同屋的人、记着；后进门的在 wel 里拿到', () => {
    const { h } = hub();
    const a = join(h, [0, 0]), b = join(h, [1, 1]);
    expect(h.message(a.cl, sky([480, 2]))).toBe(true);
    expect(b.c.got.at(-1)).toEqual({ t: 'sky', fr: a.cl.id, d: [480, 2] });
    expect(a.c.got.some((m) => m.t === 'sky')).toBe(false);
    const c = join(h, [2, 2]);
    expect(c.c.got.find((m) => m.t === 'wel')?.sky).toEqual([a.cl.id, 480, 2]);
  });
  it('别人报的不收，也不算不对；不对的（时区越界、天气不在单子上）记一笔', () => {
    const { h } = hub();
    const a = join(h), b = join(h, [1, 1]);
    const n = a.c.got.length;
    expect(h.message(b.cl, sky([60, 0]))).toBe(false);
    expect(a.c.got.length).toBe(n);
    expect(b.cl.strikes).toBe(0);
    for (const bad of [[900, 0], [-721, 0], [480, 4], [480.5, 0], [480], 'x', null]) expect(h.message(a.cl, sky(bad))).toBe(false);
    expect(a.cl.strikes).toBe(7);
    expect(readSky([480, 0])).toEqual([480, 0]);
    expect(readSky([-720, 3])).toEqual([-720, 3]);
  });
  it('那一位走了，那一份作废；下一位排第一的报了就换成他的', () => {
    const { h } = hub();
    const a = join(h), b = join(h, [1, 1]);
    h.message(a.cl, sky([480, 1]));
    h.close(a.cl);
    const c = join(h, [2, 2]);
    expect(c.c.got.find((m) => m.t === 'wel')?.sky).toBeUndefined();
    expect(h.message(b.cl, sky([60, 3]))).toBe(true);
    expect(c.c.got.at(-1)).toEqual({ t: 'sky', fr: b.cl.id, d: [60, 3] });
  });
  it('报得太勤：多出来的不收（四回之后要等）', () => {
    const { h, tick } = hub();
    const a = join(h);
    let ok = 0;
    for (let i = 0; i < 8; i++) if (h.message(a.cl, sky([480, i % 4]))) ok++;
    expect(ok).toBe(4);
    tick(4100);
    expect(h.message(a.cl, sky([480, 0]))).toBe(true);
  });
  it('客户端：wel 里的天时、sky 消息认得；越界的不要', () => {
    expect(readIn({ t: 'sky', fr: 3, d: [480, 2] })).toEqual({ t: 'sky', fr: 3, d: [480, 2] });
    expect(readIn({ t: 'sky', fr: 3, d: [999, 2] })).toBeNull();
    expect(readIn({ t: 'sky', fr: 0, d: [480, 2] })).toBeNull();
    const wel = readIn({ t: 'wel', id: 5, rm: 'r1', cap: 24, ps: [], sky: [2, 480, 1] });
    expect(wel?.t === 'wel' ? wel.sky : 'x').toEqual([2, 480, 1]);
    const wel2 = readIn({ t: 'wel', id: 5, rm: 'r1', cap: 24, ps: [], sky: [2, 480, 9] });
    expect(wel2?.t === 'wel' ? wel2.sky : 'x').toBeNull();
    const wel3 = readIn({ t: 'wel', id: 5, rm: 'r1', cap: 24, ps: [] });
    expect(wel3?.t === 'wel' ? wel3.sky : 'x').toBeNull();
  });
});

describe('中转：样子、名片、玩法、路标', () => {
  const msg = (o: Record<string, unknown>) => JSON.stringify(o);
  it('进门时报上样子与名片：同屋的人在 in 里拿到；后进门的在 wel 的 px 里拿到；x 说认得', () => {
    const { h } = hub();
    const a = join(h, [0, 0], '1.1.1.1', { lk: [1, 3, 5], cd: [2, 0, 17] });
    expect(a.c.got[0].x).toBe(EXT);
    const b = join(h, [1, 1]);
    const wel = b.c.got.find((m) => m.t === 'wel')!;
    expect(wel.px).toEqual([[a.cl.id, [1, 3, 5], [2, 0, 17]]]);
    expect(wel.mk).toEqual([]);
    const c = join(h, [2, 2], '1.1.1.2', { lk: [0, 2] });
    expect(a.c.got.at(-1)).toEqual({ t: 'in', id: c.cl.id, n: [2, 2], c: 0, lk: [0, 2] });
    // 不对的样子只当没给（不断开）
    const d = join(h, [3, 3], '1.1.1.3', { lk: [999], cd: ['x'] });
    expect(d.cl.lk).toBeNull(); expect(d.cl.cd).toBeNull(); expect(d.c.closed).toBeNull();
  });
  it('换了样子、名片：转给同屋的人（自己不收）；太勤的不收；不对的记一笔', () => {
    const { h, tick } = hub();
    const a = join(h), b = join(h, [1, 1]);
    expect(h.message(a.cl, msg({ t: 'lk', d: [1, 4, 4, 9] }))).toBe(true);
    expect(b.c.got.at(-1)).toEqual({ t: 'lk', id: a.cl.id, d: [1, 4, 4, 9] });
    expect(a.c.got.some((m) => m.t === 'lk')).toBe(false);
    let ok = 1;
    for (let i = 0; i < 6; i++) if (h.message(a.cl, msg({ t: 'lk', d: [i] }))) ok++;
    expect(ok).toBe(4);
    tick(10100);
    expect(h.message(a.cl, msg({ t: 'lk', d: [0] }))).toBe(true);
    expect(h.message(a.cl, msg({ t: 'cd', d: [5, 120] }))).toBe(true);
    expect(b.c.got.at(-1)).toEqual({ t: 'cd', id: a.cl.id, d: [5, 120] });
    for (const bad of [[256], [-1], [0.5], new Array(17).fill(0), 'x']) expect(h.message(a.cl, msg({ t: 'lk', d: bad }))).toBe(false);
    expect(h.message(a.cl, msg({ t: 'cd', d: [1e6] }))).toBe(false);
    expect(a.cl.strikes).toBe(6);
    expect(readLook([0, 255])).toEqual([0, 255]);
    expect(readCard([999999])).toEqual([999999]);
  });
  it('玩法：发给同屋某一位（远近不论）只他收到；发给 0 是同屋的人；别屋的、自己、不认得的种类不行', () => {
    const { h } = hub({ roomSize: 2 });
    const a = join(h), b = join(h, [1, 1]);
    h.message(a.cl, st(1, 0, 10)); h.message(b.cl, st(1, 150, 240));   // 两个座位坐满
    const c = join(h, [2, 2]);
    expect(c.cl.room).not.toBe(a.cl.room);
    for (const x of [a, b, c]) x.c.got.length = 0;
    const k = GAMES.indexOf('cock');
    expect(k).toBeGreaterThanOrEqual(0);
    expect(h.message(a.cl, msg({ t: 'g', to: b.cl.id, k, d: [1, 2, -3] }))).toBe(true);
    expect(b.c.got).toEqual([{ t: 'g', fr: a.cl.id, to: b.cl.id, k, d: [1, 2, -3] }]);
    expect(h.message(b.cl, msg({ t: 'g', to: 0, k, d: [7] }))).toBe(true);
    expect(a.c.got.at(-1)).toEqual({ t: 'g', fr: b.cl.id, to: 0, k, d: [7] });
    expect(b.c.got.length).toBe(1);
    // 别屋的人：不送（不算不对）；自己、不认得的种类、不是整数：记一笔
    expect(h.message(a.cl, msg({ t: 'g', to: c.cl.id, k, d: [] }))).toBe(false);
    expect(c.c.got).toEqual([]);
    const s0 = a.cl.strikes;
    expect(h.message(a.cl, msg({ t: 'g', to: a.cl.id, k, d: [] }))).toBe(false);
    expect(h.message(a.cl, msg({ t: 'g', to: 0, k: GAMES.length, d: [] }))).toBe(false);
    expect(h.message(a.cl, msg({ t: 'g', to: 0, k, d: [1.5] }))).toBe(false);
    expect(h.message(a.cl, msg({ t: 'g', to: 0, k, d: [1e8] }))).toBe(false);
    expect(a.cl.strikes - s0).toBe(4);
    expect(readGame([-9999999, 9999999])).toEqual([-9999999, 9999999]);
  });
  it('玩法发得太勤：多出来的不送（发给同屋的人算两条）', () => {
    const { h, tick } = hub();
    const a = join(h), b = join(h, [1, 1]);
    const k = GAMES.indexOf('cuju');
    let ok = 0;
    for (let i = 0; i < 30; i++) if (h.message(a.cl, msg({ t: 'g', to: 0, k, d: [i] }))) ok++;
    expect(ok).toBe(12);
    tick(1000);
    ok = 0;
    for (let i = 0; i < 30; i++) if (h.message(a.cl, msg({ t: 'g', to: b.cl.id, k, d: [i] }))) ok++;
    expect(ok).toBe(8);
    expect(a.c.closed).toBeNull();
  });
  it('路标：人人看得见（不分屋子）；留标的那一位收到的那份带 me；后进门的在 wel 里拿到', () => {
    const { h } = hub({ roomSize: 1 });
    const a = join(h);
    h.message(a.cl, st(1));                              // 唯一的座位坐上了
    const b = join(h, [1, 1]);
    expect(b.cl.room).not.toBe(a.cl.room);
    expect(h.message(a.cl, msg({ t: 'mk', d: [12.346, 40.5, 58, 8, 17, 1] }))).toBe(true);
    const m = a.c.got.at(-1)!;
    expect(m.t).toBe('mk'); expect(m.me).toBe(1);
    expect(m.m).toEqual([1, 12.35, 40.5, 58, 8, 17, 1, 0, 0, 0, 0]);
    expect(b.c.got.at(-1)).toEqual({ t: 'mk', m: [1, 12.35, 40.5, 58, 8, 17, 1, 0, 0, 0, 0] });
    const c = join(h, [2, 2]);
    expect(c.c.got.find((x) => x.t === 'wel')!.mk).toEqual([[1, 12.35, 40.5, 58, 8, 17, 1, 0, 0, 0, 0]]);
    // 客户端认它
    const w = readIn(c.c.got.find((x) => x.t === 'wel'));
    expect(w?.t === 'wel' ? w.mk[0] : null).toEqual({ id: 1, x: 12.35, z: 40.5, g: 58, mo: 8, h: 17, w: 1, n: [0, 0], c: 0, age: 0 });
    expect(readIn(m)).toEqual({ t: 'mk', m: { id: 1, x: 12.35, z: 40.5, g: 58, mo: 8, h: 17, w: 1, n: [0, 0], c: 0, age: 0, mine: true } });
  });
  it('路标：一个人同时至多三枚（再留收回最早的）；一分钟一枚；只收得回自己的；三天后没了', () => {
    const { h, tick } = hub({ markTtl: 3600 * 1000 });
    const a = join(h), b = join(h, [1, 1]);
    const put = (x: number) => h.message(a.cl, msg({ t: 'mk', d: [x, 10, 0, 1, 0, 0] }));
    expect(put(1)).toBe(true); expect(put(2)).toBe(true);
    expect(put(3)).toBe(false);
    for (let i = 3; i <= MARK_PER + 1; i++) { tick(61000); expect(put(i)).toBe(true); }
    expect(h.marks.length).toBe(MARK_PER);
    expect(h.marks.map((k) => k.d[0])).toEqual([2, 3, 4]);
    expect(b.c.got.some((m) => m.t === 'mkx' && m.id === 1)).toBe(true);
    // 别人的收不回；自己的收得回
    expect(h.message(b.cl, msg({ t: 'mkx', id: h.marks[0].id }))).toBe(false);
    expect(h.message(a.cl, msg({ t: 'mkx', id: h.marks[0].id }))).toBe(true);
    expect(h.marks.length).toBe(MARK_PER - 1);
    // 不对的：越界、卦不对、月不对
    for (const bad of [[999, 0, 0, 1, 0, 0], [0, 0, 64, 1, 0, 0], [0, 0, 0, 13, 0, 0], [0, 0, 0, 1, 24, 0], [0, 0, 0, 1, 0, 9], [0, 0, 0, 1, 0]]) expect(readMark(bad)).toBeNull();
    // 过了留的时候：没了
    tick(3600 * 1000 + 1);
    h.sweep();
    expect(h.marks.length).toBe(0);
    expect(h.stats().marks).toBe(0);
  });
  it('路标总数有顶：满了收回全园最早的那一枚', () => {
    const { h, tick } = hub({ markMax: 4 });
    const xs = [join(h), join(h, [1, 1]), join(h, [2, 2]), join(h, [3, 3]), join(h, [4, 4])];
    for (const [i, x] of xs.entries()) { h.message(x.cl, msg({ t: 'mk', d: [i, 0, 0, 1, 0, 0] })); tick(10); }
    expect(h.marks.length).toBe(4);
    expect(h.marks.map((k) => k.d[0])).toEqual([1, 2, 3, 4]);
  });
  it('客户端：样子、名片、玩法认得；越界的、不认得的种类不要；旧的一版中转（没有 x）照旧认得', () => {
    expect(readIn({ t: 'lk', id: 3, d: [1, 2] })).toEqual({ t: 'lk', id: 3, d: [1, 2] });
    expect(readIn({ t: 'lk', id: 3, d: [300] })).toBeNull();
    expect(readIn({ t: 'cd', id: 3, d: [1, 2] })).toEqual({ t: 'cd', id: 3, d: [1, 2] });
    expect(readIn({ t: 'g', fr: 3, to: 0, k: 0, d: [1, -2] })).toEqual({ t: 'g', fr: 3, to: 0, k: 0, d: [1, -2] });
    expect(readIn({ t: 'g', fr: 3, to: 0, k: GAMES.length, d: [] })).toBeNull();
    expect(readIn({ t: 'mkx', id: 4 })).toEqual({ t: 'mkx', id: 4 });
    const old = readIn({ t: 'wel', id: 5, rm: 'r1', cap: 24, ps: [[2, 0, 0, 1, null]] });
    expect(old?.t === 'wel' ? [old.x, old.px, old.mk, old.ps.length] : null).toEqual([0, [], [], 1]);
    const neu = readIn({ t: 'wel', id: 5, rm: 'r1', cap: 24, ps: [[2, 0, 0, 1, null]], x: 1, px: [[2, [1, 2], [3]], [9, [999], []]], mk: [[1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 5], [2, 0, 0, 70, 1, 0, 0, 0, 0, 0, 5]], mt: 4320 });
    expect(neu?.t === 'wel' ? [neu.x, neu.px, neu.mk.length, neu.mt] : null).toEqual([1, [{ id: 2, lk: [1, 2], cd: [3] }], 1, 4320]);
  });
});

describe('客户端：收到的消息再认一遍', () => {
  it('认得的规整成一份；越界、缺字段的整条或那一项不要', () => {
    expect(readIn({ t: 'in', id: 3, n: [1, 2], c: 1 })).toEqual({ t: 'in', id: 3, n: [1, 2], c: 1, lk: null, cd: null });
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
