/**
 * 柴门：不用点。人走近了，两扇柴扉「吱呀」一声朝院里开；走过去了，隔一会儿轻轻掩上，碰在门桩上「嗒」的一下。
 * 村里有人（来客、送饭的）走到门口也开。读门联的时候门是掩着的——「闭门即是深山」。
 * 门扇是屋舍那边做的（k.build.parts.gateL / gateR，原点在门轴脚下，userData.open / closed 是开、合时的 rotation.y），
 * 这里只管转它。门扇开着时占的那一条（挡路）是屋舍那边报的，掩上时门洞里不挡——人一走近它就开了。
 */
import type { Anlewo } from '../Anlewo';
import { SITE } from '../site';
import type { Act } from './types';
import { onFrame, sfx } from '../play/kit';

/** 一扇门：角度（0 合 … 1 开）与速度，弹簧推着走 */
interface Leaf { o: { rotation: { y: number } }; open: number; shut: number; a: number; v: number; lag: number; want: number }

export function create(k: Anlewo): Act | null {
  const L = k.build?.parts.gateL, R = k.build?.parts.gateR;
  if (!L || !R) return null;
  const G = SITE.gate;
  const leaf = (o: typeof L, lag: number): Leaf => ({ o, open: Number(o.userData.open ?? 1.8), shut: Number(o.userData.closed ?? 0), a: 1, v: 0, lag, want: 1 });
  const leaves = [leaf(L, 0), leaf(R, 0.14)];
  let first = true, isOpen = true, away = 0, npcT = 0, npcNear = false, since = 0;
  /** 村里有没有人走到门口（隔一会儿看一回） */
  const npcAt = () => {
    const n = k.life?.npcs;
    if (!n) return false;
    for (const id in n) { const p = n[id]; if (p.present && Math.abs(p.pos.x - G.x) < 2.2 && Math.abs(p.pos.z - G.z) < 2.6) return true; }
    return false;
  };
  onFrame(k, 'gate', (dt) => {
    const p = k.player.pos, sp = k.player.speed;
    // 走得快，老远就开（跑过来时门已经开了）
    const reach = 2.6 + Math.min(2.4, sp * 0.55);
    const meP = Math.abs(p.x - G.x) < 2.4 && Math.abs(p.z - G.z) < reach;
    if ((npcT -= dt) <= 0) { npcT = 0.25; npcNear = npcAt(); }
    const reading = k.act?.id === 'couplet';
    const want = !reading && (meP || npcNear);
    if (first) {
      // 开场：人不在门口，门本来就是掩着的（不出声）
      first = false; isOpen = want;
      for (const f of leaves) { f.a = want ? 1 : 0; f.v = 0; f.want = f.a; f.o.rotation.y = f.shut + (f.open - f.shut) * f.a; }
      return;
    }
    if (want) away = 0; else away += dt;
    if (want && !isOpen) { isOpen = true; since = 0; sfx(k, 'gate', { variant: 'open', vel: 0.5, x: G.x, z: G.z }); }
    else if (!want && isOpen && away > 1.4) { isOpen = false; since = 0; sfx(k, 'gate', { vel: 0.42, x: G.x, z: G.z }); }
    since += dt;
    for (const f of leaves) {
      if (since >= f.lag) f.want = isOpen ? 1 : 0;
      // 开：推得快一点；掩：慢慢地合上，碰到门桩轻轻一弹
      const kk = isOpen ? 5.2 : 2.9, z = isOpen ? 0.86 : 0.8;
      const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
      for (let i = 0; i < n; i++) {
        f.v += (kk * kk * (f.want - f.a) - 2 * z * kk * f.v) * h;
        f.a += f.v * h;
        if (f.a < 0) { f.a = 0; f.v = -f.v * 0.22; }
        if (f.a > 1.04) { f.a = 1.04; f.v = 0; }
      }
      f.o.rotation.y = f.shut + (f.open - f.shut) * f.a;
    }
  });
  return null;
}
