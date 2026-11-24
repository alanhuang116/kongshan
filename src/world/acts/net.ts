/**
 * 同游（src/world/net/）的挂钩：acts/index.ts 在世界建好时调每个文件的 create(k)，这里借这一下把同游装上——
 * 别人的身子放进画里、每帧的事推进主循环。它本身不是一件「事」，所以返回 null（画面上不出签）。
 */
import type { Anlewo } from '../Anlewo';
import { startNet } from '../net';

export function create(k: Anlewo): null {
  startNet(k);
  return null;
}
