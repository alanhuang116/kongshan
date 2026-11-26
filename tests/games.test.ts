// 四样比试的规矩（src/world/play/games）：两边各自算、算出来一样。斗鸡的招与气力、鞠的飞与接、箭的飞与中、绕村一圈的记圈、同游的邀与应。
import { describe, expect, it } from 'vitest';
import { dice, hash, roll } from '../src/world/play/games/dice';
import { COST, DODGE, LI_MAX, PECK, POUNCE, ROUNDS, apply, can, fresh, legal, pick, resolve, verdict, type Bird, type Move } from '../src/world/play/games/cock';
import { R, TOUCH_Y, apexTime, bounce, fromInts, hitTime, judge, kick, posAt, toInts, touchWindow, type V3 } from '../src/world/play/games/ball';
import { HOU, crossTarget, loose, ring, shotFrom, shotInts, speedOf, arrowAt, type Target } from '../src/world/play/games/arrow';
import { Lap, type Mark } from '../src/world/play/games/lap';
import { Match, OP, type TgLike } from '../src/world/play/games/match';

describe('骰子', () => {
  it('同一个种子掷出来一样，不同的种子不一样', () => {
    const a = dice(42), b = dice(42), c = dice(43);
    const xa = [a(), a(), a()], xb = [b(), b(), b()], xc = [c(), c(), c()];
    expect(xa).toEqual(xb);
    expect(xa).not.toEqual(xc);
    for (const x of xa) expect(x).toBeGreaterThanOrEqual(0), expect(x).toBeLessThan(1);
  });
  it('hash 稳定、对每一个数都敏感', () => {
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3));
    expect(hash(1, 2, 3)).not.toBe(hash(1, 2, 4));
    expect(hash(1, 2, 3)).not.toBe(hash(3, 2, 1));
    expect(roll(7, 1, 2)).toBe(roll(7, 1, 2));
  });
});

describe('斗鸡', () => {
  const B = (qi: number, li: number): Bird => ({ qi, li });
  it('扑压得住啄、啄啄得着闪、闪让得开扑', () => {
    const r1 = resolve(fresh(), fresh(), POUNCE, PECK, 1, 0);
    expect(r1.win).toBe(1); expect(r1.kind).toBe('pounce'); expect(r1.qb).toBe(2); expect(r1.qa).toBe(0);
    const r2 = resolve(fresh(), fresh(), PECK, DODGE, 1, 0);
    expect(r2.win).toBe(1); expect(r2.kind).toBe('peck'); expect(r2.qb).toBe(1);
    const r3 = resolve(fresh(), fresh(), DODGE, POUNCE, 1, 0);
    expect(r3.win).toBe(1); expect(r3.kind).toBe('dodge'); expect(r3.qb).toBe(1);
    // 扑空的再折一点力：扑本身费二，再折一；闪的缓一口气
    expect(r3.lb).toBe(COST[POUNCE] + 1); expect(r3.la).toBe(-1);
    // 反过来也一样
    const r4 = resolve(fresh(), fresh(), PECK, POUNCE, 1, 0);
    expect(r4.win).toBe(-1); expect(r4.qa).toBe(2);
  });
  it('两闪绕着转：都不减气，都缓一口力（不过顶）', () => {
    const A = B(5, 3), Bb = B(5, LI_MAX), c = resolve(A, Bb, DODGE, DODGE, 9, 2);
    expect(c.win).toBe(0); expect(c.kind).toBe('circle');
    apply(A, Bb, c);
    expect(A).toEqual({ qi: 5, li: 4 }); expect(Bb).toEqual({ qi: 5, li: LI_MAX });
  });
  it('两扑相撞：力足的占上风；一样足时看种子，两边算出来一样', () => {
    const c = resolve(B(5, 6), B(5, 4), POUNCE, POUNCE, 3, 0);
    expect(c.win).toBe(1); expect(c.qb).toBe(1);
    const wins = new Set<number>();
    for (let s = 0; s < 40; s++) { const x = resolve(B(5, 6), B(5, 6), POUNCE, POUNCE, s, 1), y = resolve(B(5, 6), B(5, 6), POUNCE, POUNCE, s, 1); expect(x).toEqual(y); wins.add(x.win); }
    expect(wins.has(1) && wins.has(-1)).toBe(true);
  });
  it('力不够的招当作闪', () => {
    expect(legal(B(5, 1), POUNCE)).toBe(DODGE);
    expect(legal(B(5, 1), PECK)).toBe(PECK);
    expect(legal(B(5, 0), PECK)).toBe(DODGE);
    expect(legal(B(5, 6), 7)).toBe(DODGE);
    expect(can(B(5, 2), POUNCE)).toBe(true);
    const c = resolve(B(5, 1), fresh(), POUNCE, PECK, 1, 0);
    expect(c.a).toBe(DODGE);
  });
  it('气尽者负；九回合未分以气定，同气为和', () => {
    expect(verdict(B(0, 3), B(2, 3), 3)).toBe(-1);
    expect(verdict(B(2, 3), B(0, 3), 3)).toBe(1);
    expect(verdict(B(2, 3), B(2, 3), 3)).toBe(null);
    expect(verdict(B(3, 3), B(2, 3), ROUNDS)).toBe(1);
    expect(verdict(B(2, 3), B(2, 3), ROUNDS)).toBe(0);
  });
  it('两边按同一个种子各自算一整场：每一回合一样，九回合内一定完', () => {
    for (let seed = 1; seed < 200; seed++) {
      const run = () => {
        const A = fresh(), Bb = fresh(), log: number[] = [];
        let la = -1, lb = -1, r = 0, v: 1 | -1 | 0 | null = null;
        while (v == null) {
          const a = pick(A, Bb, lb, seed, r, 0, 0.6), b = pick(Bb, A, la, seed, r, 1, 0.5);
          const c = resolve(A, Bb, a, b, seed, r);
          apply(A, Bb, c); la = c.a; lb = c.b; r++;
          log.push(c.a, c.b, c.win, A.qi, A.li, Bb.qi, Bb.li);
          v = verdict(A, Bb, r);
          expect(A.li).toBeGreaterThanOrEqual(0); expect(A.li).toBeLessThanOrEqual(LI_MAX);
        }
        return { log, v, r };
      };
      const x = run(), y = run();
      expect(x).toEqual(y);
      expect(x.r).toBeLessThanOrEqual(ROUNDS);
    }
  });
  it('村里人出的招都出得出来；没力了多半闪', () => {
    let dodge = 0;
    for (let s = 0; s < 300; s++) {
      const me = B(4, 1), m = pick(me, fresh(), PECK, s, 0, 1);
      expect(can(me, m)).toBe(true);
      if (m === DODGE) dodge++;
    }
    expect(dodge).toBeGreaterThan(150);
    // 各招都出过
    const seen = new Set<Move>();
    for (let s = 0; s < 300; s++) seen.add(pick(fresh(), fresh(), -1, s, s % 9, 0));
    expect(seen.size).toBe(3);
  });
});

describe('鞠', () => {
  const at: V3 = [0, 0, 0];
  it('踢到哪就落到哪（取整以后差不到三厘米），最高处与要的差不多', () => {
    for (const [from, to, apex] of [[[10, TOUCH_Y, 50], [15, TOUCH_Y, 50.4], 2.6], [[15, 0.5, 50], [10.6, TOUCH_Y, 49.2], 3.2], [[12, 0.45, 51], [12.1, TOUCH_Y, 51.05], 1.4]] as Array<[V3, V3, number]>) {
      const f = kick(from, to, apex);
      const T = hitTime(f, to[1]);
      expect(Number.isFinite(T)).toBe(true);
      posAt(f, T, at);
      expect(Math.hypot(at[0] - to[0], at[2] - to[2])).toBeLessThan(0.03);
      expect(Math.abs(at[1] - to[1])).toBeLessThan(0.002);
      expect(Math.abs(posAt(f, apexTime(f))[1] - apex)).toBeLessThan(0.03);
    }
  });
  it('发出去的整数收回来，两边算的弧一模一样', () => {
    const f = kick([10.3, 0.44, 50.1], [14.8, TOUCH_Y, 50.6], 2.9), g = fromInts(toInts(f));
    expect(g).toEqual(f);
    for (const t of [0, 0.3, 0.77, 1.2]) expect(posAt(g, t)).toEqual(posAt(f, t));
    expect(hitTime(g, TOUCH_Y)).toBe(hitTime(f, TOUCH_Y));
  });
  it('飞得像鞠：一脚两米多高，在天上一秒多', () => {
    const f = kick([10, 0.42, 50], [15, TOUCH_Y, 50], 2.8);
    const T = hitTime(f, TOUCH_Y);
    expect(T).toBeGreaterThan(1.1); expect(T).toBeLessThan(1.8);
  });
  it('接：正好那一段里才踢得着，越准越好；连踢越久越窄', () => {
    expect(judge(0, 0)).toBe(1);
    expect(judge(0.1, 0)).toBeGreaterThan(0);
    expect(judge(-0.25, 0)).toBe(-1);
    expect(judge(0.12, 40)).toBe(-1);
    expect(touchWindow(40)).toBeLessThan(touchWindow(0));
    expect(touchWindow(1000)).toBeGreaterThan(0.08);
  });
  it('落地弹几下、滚一滚，会停', () => {
    const r = bounce([10, R, 50], [2, -5, 0], 0, 0.1);
    expect(r.done).toBe(false);
    const e = bounce([10, R, 50], [2, -5, 0], 0, 30);
    expect(e.done).toBe(true);
    expect(e.at[1]).toBeCloseTo(R, 5);
    expect(e.at[0]).toBeGreaterThan(10); expect(e.at[0]).toBeLessThan(14);
  });
});

describe('箭', () => {
  // 侯在南边二十米，正对射位（侯面朝北）
  const T: Target = { c: [113, 7.2, 36.5], n: [0, -1] };
  const P: [number, number, number] = [113, 9.6, 16.5];
  it('满弓、无风：瞄哪中哪', () => {
    for (const aim of [[113, 7.2, 36.5], [113.3, 7.5, 36.5], [112.6, 6.9, 36.5]] as Array<[number, number, number]>) {
      const s = loose(P, aim, 1, [0, 0]), x = crossTarget(s, T)!;
      expect(x).not.toBeNull();
      // 从射位看往右是西（−x）：侯上的 u 与世界的 x 反着
      expect(Math.abs(-x.u - (aim[0] - T.c[0]))).toBeLessThan(0.02);
      expect(Math.abs(x.v - (aim[1] - T.c[1]))).toBeLessThan(0.02);
    }
  });
  it('看得见的弧：在天上半秒多，箭比侯心高过一截', () => {
    const s = loose(P, T.c, 1, [0, 0]), x = crossTarget(s, T)!;
    expect(x.t).toBeGreaterThan(0.6); expect(x.t).toBeLessThan(0.8);
    const mid = arrowAt(s, x.t / 2);
    expect(mid[1] - P[1]).toBeGreaterThan(-1.2);
    expect(mid[1]).toBeGreaterThan(T.c[1] + 1.0);
  });
  it('风推着走、没引满的落得低', () => {
    const still = crossTarget(loose(P, T.c, 1, [0, 0]), T)!;
    const east = crossTarget(loose(P, T.c, 1, [3, 0]), T)!;
    // 风往东吹（+x）：箭往东偏，从射位看是偏左（u 变小）
    expect(east.u).toBeLessThan(still.u - 0.05);
    const weak = crossTarget(loose(P, T.c, 0.8, [0, 0]), T)!;
    expect(weak.v).toBeLessThan(still.v - 0.3);
    expect(speedOf(1)).toBeGreaterThan(speedOf(0.5));
  });
  it('筹：鹄三、正二、侯一、不中零', () => {
    expect(ring(0, 0)).toBe(3);
    expect(ring(HOU.hu + 0.01, 0)).toBe(2);
    expect(ring(0.6, 0.6)).toBe(1);
    expect(ring(0.95, 0)).toBe(0);
    expect(ring(0, -1)).toBe(0);
  });
  it('发出去的整数收回来，两边算的中处一样', () => {
    const s = loose(P, [113.2, 7.4, 36.5], 0.93, [1.7, -0.6]), t = shotFrom(shotInts(s));
    expect(t).toEqual(s);
    expect(crossTarget(t, T)).toEqual(crossTarget(s, T));
  });
});

describe('绕村一圈', () => {
  const ring: Mark[] = ['甲', '乙', '丙', '丁'].map((name, i) => ({ id: name, name, x: Math.cos((i / 4) * Math.PI * 2) * 50, z: Math.sin((i / 4) * Math.PI * 2) * 50, r: 4 }));
  const go = (lap: Lap, x: number, z: number, dt = 1) => lap.update(x, z, dt);
  it('出发后才起表；顺着走，挨个经过，回到出发处停表', () => {
    const lap = new Lap(ring, 0);
    expect(go(lap, 50, 0)).toBeNull();
    expect(go(lap, 40, 0)?.kind).toBe('go');
    expect(go(lap, 0, 50)).toEqual({ kind: 'pass', mark: ring[1], n: 1 });
    // 跳过了丙直接去丁：不算
    expect(go(lap, -50, 0)).toEqual({ kind: 'pass', mark: ring[2], n: 2 });
    expect(go(lap, 0, -50)).toEqual({ kind: 'pass', mark: ring[3], n: 3 });
    const e = go(lap, 50, 0);
    expect(e?.kind).toBe('done');
    expect(lap.done).toBe(true);
  });
  it('倒着绕也行；没经过别处回到原处不算', () => {
    const lap = new Lap(ring, 0);
    go(lap, 40, 0);
    expect(go(lap, 50, 0)).toBeNull();
    expect(go(lap, 0, -50)).toEqual({ kind: 'pass', mark: ring[3], n: 1 });
    expect(lap.next()).toEqual([ring[2]]);
    go(lap, -50, 0); go(lap, 0, 50);
    expect(go(lap, 50, 0)?.kind).toBe('done');
  });
});

describe('同游时的邀与应', () => {
  /** 两个假的同游：发出去的消息直接交给对面（照中转的样子：不发给自己） */
  function pair() {
    type Fn = (fr: number, d: number[], to: number) => void;
    const mk = (id: number) => {
      const subs = new Set<Fn>(), peers = new Set<(ev: 'in' | 'out', id: number) => void>();
      const tg = {
        canPlay: true, myId: id, remotes: new Map(), sent: [] as number[][],
        label: (x: number) => `游人${x}`,
        sendGame: (_k: string, to: number, d: number[]) => { tg.sent.push(d); other().recv(id, d, to); return true; },
        onGame: (_k: string, f: Fn) => { subs.add(f); return () => subs.delete(f); },
        onPeer: (f: (ev: 'in' | 'out', id: number) => void) => { peers.add(f); return () => peers.delete(f); },
        recv: (fr: number, d: number[], to: number) => { for (const f of subs) f(fr, d, to); },
        out: (x: number) => { for (const f of peers) f('out', x); },
      };
      return tg;
    };
    const A = mk(1), B = mk(2);
    const other = () => (cur === A ? B : A);
    let cur = A;
    // 发消息的是谁，对面就是另一个
    const wrap = (t: ReturnType<typeof mk>) => { const send = t.sendGame; t.sendGame = (k, to, d) => { cur = t; return send(k, to, d); }; return t; };
    wrap(A); wrap(B);
    return { A, B };
  }
  it('邀、应：邀的是先手，两边的种子一样；对面的招传得过来', () => {
    const { A, B } = pair();
    const log: string[] = [], got: number[][] = [];
    const ma = new Match('cock', 'cock', { start: (p, s, seed) => log.push(`A:${p}:${s}:${seed}`) }, () => A as unknown as TgLike);
    const mb = new Match('cock', 'cock', { invited: (fr) => log.push(`B邀:${fr}`), start: (p, s, seed) => log.push(`B:${p}:${s}:${seed}`), msg: (op, d) => got.push([op, ...d.slice(2)]) }, () => B as unknown as TgLike);
    ma.tick(0); mb.tick(0);
    expect(ma.invite(2)).toBe(true);
    expect(log).toEqual(['B邀:1']);
    expect(mb.inbox?.fr).toBe(1);
    expect(mb.accept()).toBe(true);
    const seed = ma.seed;
    expect(log.slice().sort()).toEqual([`A:2:0:${seed}`, `B:1:1:${seed}`, 'B邀:1'].sort());
    expect(ma.side).toBe(0); expect(mb.side).toBe(1); expect(mb.seed).toBe(seed);
    ma.send(10, 2, 7);
    expect(got).toEqual([[10, 2, 7]]);
  });
  it('两边同时邀了对方：只开一场', () => {
    const { A, B } = pair();
    const starts: string[] = [];
    const ma = new Match('cuju', 'cuju', { start: (_p, s) => starts.push(`A${s}`) }, () => A as unknown as TgLike);
    const mb = new Match('cuju', 'cuju', { start: (_p, s) => starts.push(`B${s}`) }, () => B as unknown as TgLike);
    ma.tick(0); mb.tick(0);
    // 乙的邀请先发出去，甲那边正等着自己的
    mb.out = { to: 1, mid: 77, at: performance.now() };
    ma.invite(2);
    // 编号大的（乙）让：应下甲的那一份，甲是先手
    expect(starts.sort()).toEqual(['A0', 'B1']);
    expect(ma.cur && mb.cur && ma.seed === mb.seed).toBe(true);
  });
  it('对面走了、不玩了：收场', () => {
    const { A, B } = pair();
    const ends: string[] = [];
    const ma = new Match('archery', 'archery', { end: (w) => ends.push(`A:${w}`) }, () => A as unknown as TgLike);
    const mb = new Match('archery', 'archery', { end: (w) => ends.push(`B:${w}`) }, () => B as unknown as TgLike);
    ma.tick(0); mb.tick(0);
    ma.invite(2); mb.accept();
    mb.leave();
    expect(ends).toEqual(['A:quit']);
    expect(ma.cur).toBeNull();
    ma.invite(2); mb.accept();
    A.out(2);
    expect(ends).toEqual(['A:quit', 'A:left']);
    // 正忙着的人被邀：回一声「正忙」
    const { A: A2, B: B2 } = pair();
    const e2: string[] = [];
    const m1 = new Match('cock', 'cock', { end: (w) => e2.push(w) }, () => A2 as unknown as TgLike), m2 = new Match('cock', 'cock', {}, () => B2 as unknown as TgLike);
    m1.tick(0); m2.tick(0);
    m2.cur = { peer: 9, mid: 5, side: 0, heard: performance.now(), sent: performance.now(), off: 0 };
    m1.invite(2);
    expect(e2).toEqual(['busy']);
    expect(B2.sent.at(-1)?.[0]).toBe(OP.DECLINE);
  });
});
