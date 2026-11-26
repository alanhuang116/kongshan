/**
 * 斗鸡的规矩（只有数，没有画）：两只鸡各有「气」（斗志，五）与「力」（六）。一回合两边同时出一招：
 *   啄 —— 伸颈一啄，费力一；扑 —— 腾身一扑，费力二；闪 —— 侧身一让，不费力，反倒缓过一口气（力添一）。
 *   扑压得住啄（对面气减二），啄啄得着闪的（气减一），闪让得开扑（扑的落空，气减一、力再减一）。
 *   同招：两啄对啄、两扑相撞，力足的占上风（气减一）；力差不多，看这一下谁先缩（种子定，两边一样）；两闪绕着转，都缓一口气。
 *   力不够出那一招的，只能闪。哪一只气尽了就怯了——掉头扑着翅膀跑开，那一场就输了。九个回合还没分出来，气多的胜，一样多是和。
 * 不见血、不伤：鸡只是斗志被压下去，退走了事。
 * 两边各自按同样的种子与两边的招算（resolve），算出来一样；村里人怎么出招也用这个种子（pick）。
 */
import { roll } from './dice';

export type Move = 0 | 1 | 2;
export const PECK = 0 as Move, POUNCE = 1 as Move, DODGE = 2 as Move;
export const MOVE_NAME = ['啄', '扑', '闪'] as const;
/** 每一招费多少力 */
export const COST = [1, 2, 0] as const;
export const QI0 = 5, LI0 = 6, LI_MAX = 6, ROUNDS = 9;

export interface Bird { qi: number; li: number }
export const fresh = (): Bird => ({ qi: QI0, li: LI0 });
/** 这一招此刻出得出来（力够） */
export const can = (b: Bird, m: Move) => b.li >= COST[m];
/** 出不来的招当作闪（对面发来的、超时代出的，都先过这一道） */
export const legal = (b: Bird, m: number): Move => (m === PECK || m === POUNCE || m === DODGE) && can(b, m as Move) ? (m as Move) : DODGE;

/** 一回合的结果：两边出的招、谁占上风（1 是甲、−1 是乙、0 不分）、各减了多少气与力、是哪一种交手 */
export interface Clash {
  a: Move; b: Move; win: -1 | 0 | 1;
  qa: number; qb: number; la: number; lb: number;
  /** pounce 扑压住了啄 · peck 啄中了闪 · dodge 闪开了扑 · pecks 对啄 · clash 两扑相撞 · circle 两闪绕着转 */
  kind: 'pounce' | 'peck' | 'dodge' | 'pecks' | 'clash' | 'circle';
}

/** 谁克谁：a 克 b 返回 true */
const beats = (a: Move, b: Move) => (a === POUNCE && b === PECK) || (a === PECK && b === DODGE) || (a === DODGE && b === POUNCE);

/**
 * 算一回合（不改 A、B；返回结果，用 apply 改）。seed 是这一场的种子，round 是第几回合（从 0 数）——平手时谁先缩由它们定。
 */
export function resolve(A: Bird, B: Bird, a0: number, b0: number, seed: number, round: number): Clash {
  const a = legal(A, a0), b = legal(B, b0);
  const c: Clash = { a, b, win: 0, qa: 0, qb: 0, la: COST[a], lb: COST[b], kind: 'circle' };
  // 出了招以后各剩多少力（同招时比的是这个）
  const ra = A.li - COST[a], rb = B.li - COST[b];
  if (a !== b) {
    const w = beats(a, b) ? 1 : -1, win = w > 0 ? a : b;
    c.win = w;
    c.kind = win === POUNCE ? 'pounce' : win === PECK ? 'peck' : 'dodge';
    const hurt = win === POUNCE ? 2 : 1;
    if (w > 0) c.qb = hurt; else c.qa = hurt;
    // 扑了个空：落地踉跄，再折一点力
    if (win === DODGE) { if (w > 0) c.lb += 1; else c.la += 1; }
  } else if (a === DODGE) {
    c.kind = 'circle';
  } else {
    c.kind = a === PECK ? 'pecks' : 'clash';
    const d = ra - rb;
    if (Math.abs(d) >= 2 || (a === POUNCE && d !== 0)) c.win = d > 0 ? 1 : -1;
    else {
      // 差不多：看这一下谁先缩。对啄的有一半是各有进退、不分上下
      const r = roll(seed, round, a);
      if (a === PECK && r < 0.5) c.win = 0;
      else c.win = (a === PECK ? r < 0.75 : r < 0.5) ? 1 : -1;
    }
    if (c.win > 0) c.qb = 1; else if (c.win < 0) c.qa = 1;
  }
  // 闪是缓一口气：力添一
  if (a === DODGE) c.la -= 1;
  if (b === DODGE) c.lb -= 1;
  return c;
}

/** 把一回合的结果记到两只鸡身上 */
export function apply(A: Bird, B: Bird, c: Clash) {
  A.qi = Math.max(0, A.qi - c.qa); B.qi = Math.max(0, B.qi - c.qb);
  A.li = Math.max(0, Math.min(LI_MAX, A.li - c.la)); B.li = Math.max(0, Math.min(LI_MAX, B.li - c.lb));
}

/** 这一场完了没有：1 甲胜、−1 乙胜、0 和、null 还没完。round 是已经斗过几个回合 */
export function verdict(A: Bird, B: Bird, round: number): 1 | -1 | 0 | null {
  if (A.qi <= 0 && B.qi <= 0) return 0;
  if (B.qi <= 0) return 1;
  if (A.qi <= 0) return -1;
  if (round >= ROUNDS) return A.qi > B.qi ? 1 : A.qi < B.qi ? -1 : 0;
  return null;
}

/** 克这一招的那一招 */
export const counter = (m: Move): Move => (m === PECK ? POUNCE : m === POUNCE ? DODGE : PECK);

/**
 * 村里人（或替没出招的人代出）出哪一招：看自己与对面的力、对面上一招，带一点随性（种子定）。
 * me 是出招的这一只，foe 是对面；last 是对面上一招（头一回合给 −1）；skill 0…1 越大越会看。
 */
export function pick(me: Bird, foe: Bird, last: number, seed: number, round: number, side: number, skill = 0.6): Move {
  const w = [0.38, 0.34, 0.28];
  // 自己没力了：多半闪着缓一口
  if (me.li <= 1) { w[0] = 0.3; w[1] = 0; w[2] = 0.7; }
  // 对面扑不起来：闪是白闪
  if (foe.li < COST[POUNCE]) { w[2] *= 0.25; w[1] += 0.12; }
  // 对面力多、自己力少：别硬扑
  if (me.li <= 2 && foe.li >= 4) w[1] *= 0.5;
  // 对面上一招：人爱照着来，克它
  if (last === PECK || last === POUNCE || last === DODGE) w[counter(last as Move)] += 0.3 * skill;
  for (let m = 0; m < 3; m++) if (!can(me, m as Move)) w[m] = 0;
  const sum = w[0] + w[1] + w[2];
  if (sum <= 0) return DODGE;
  let r = roll(seed, round, 101 + side) * sum;
  for (let m = 0; m < 3; m++) { if (r < w[m]) return m as Move; r -= w[m]; }
  return DODGE;
}
