/**
 * 同游（src/world/net/）的挂钩：acts/index.ts 在世界建好时调每个文件的 create(k)，这里借这一下把同游装上——
 * 别人的身子放进画里、每帧的事推进主循环。它本身不是一件「事」，所以返回 null（画面上不出签）。
 * 装上以后把自己的名片（榜上的成绩、修为，play/board.ts）交给它：进门时一并报上。
 */
import type { Anlewo } from '../Anlewo';
import { startNet } from '../net';
import { startBoard } from '../play/board';
import { wearToWire } from '../avatar/dress';

export function create(k: Anlewo): null {
  const tg = startNet(k);
  startBoard(k);
  // 自己的穿着：进门时一并报上，换了再报（同屋的人那边照着画）
  tg.setLook(wearToWire(k.wear));
  k.wearSubs.add((w) => tg.setLook(wearToWire(w)));
  return null;
}
