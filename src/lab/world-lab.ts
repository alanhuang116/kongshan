/**
 * 整景的台子（只在开发时用；正式的界面在 src/app）：把整个安乐窝装起来走一走。
 *   /world.html?s=<处>&t=<now|dawn|day|dusk|night|几点>&season=&w=&q=&act=<事>&hud=0
 *   s：grove bridge yard hall pavilion fields village ferry
 * WASD 走、拖动转镜头、滚轮远近、点地面走过去、走近一件事按 E 做、Esc 作罢。
 * 1 2 3 4 换晨昼昏夜，5 6 7 8 换四季，9 0 - = 换晴雾雨雪。
 * window.__ready 为真时可以截图；window.__ks 是整个世界（测试脚本用），window.__walk 是行走图。
 */
import '../app/styles/fonts.css';
import { Anlewo, type TimeMode } from '../world/Anlewo';
import type { Season, Weather } from '../world/env/atmos';
import * as walk from '../world/walk';

const qs = new URLSearchParams(location.search);
const hud = document.getElementById('hud')!, marks = document.getElementById('marks')!, actEl = document.getElementById('act')!;

async function main() {
  const tq = qs.get('t') ?? 'day';
  const time: TimeMode | number = /^[\d.]+$/.test(tq) ? Number(tq) : (tq as TimeMode);
  const season = (qs.get('season') as Season) ?? 'spring';
  let place = '', near = '';
  const ks = await Anlewo.create(document.getElementById('c') as HTMLCanvasElement, {
    quality: qs.get('q'), season, weather: (qs.get('w') as Weather) ?? 'clear', hour: 9, moonPhase: 0.42, start: qs.get('s') ?? 'grove',
    events: {
      progress: (k, s) => { hud.textContent = `${Math.round(k * 100)}%  ${s}`; },
      place: (id) => { place = id; },
      near: (th) => { near = th ? `${th.label}（E）` : ''; },
      act: (id, st) => { actEl.style.display = id ? 'block' : 'none'; actEl.textContent = id ? `${id}\n${String(st.hint ?? '')}\n${String(st.text ?? '')}` : ''; },
    },
  });
  ks.setTime(time, true);
  ks.veil = 0;
  if (qs.get('over') === '1') ks.setOverview(true);
  const W = window as unknown as Record<string, unknown>;
  W.__ks = ks; W.__walk = walk;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ks.exitAct();
    const T: Record<string, TimeMode> = { 1: 'dawn', 2: 'day', 3: 'dusk', 4: 'night' }, S: Record<string, Season> = { 5: 'spring', 6: 'summer', 7: 'autumn', 8: 'winter' }, WW: Record<string, Weather> = { 9: 'clear', 0: 'mist', '-': 'rain', '=': 'snow' };
    if (T[e.key]) ks.setTime(T[e.key]); else if (S[e.key]) ks.setSeason(S[e.key]); else if (WW[e.key]) ks.setWeather(WW[e.key]);
  });
  const els = new Map<string, HTMLSpanElement>();
  ks.world.tick.push(() => {
    for (const m of ks.markers) {
      let el = els.get(m.id);
      if (!el) { el = document.createElement('span'); el.textContent = m.label; marks.appendChild(el); els.set(m.id, el); }
      el.style.display = m.visible ? 'block' : 'none';
      el.className = m.near ? 'near' : '';
      el.style.left = `${m.x}px`; el.style.top = `${m.y - 26}px`;
    }
    if (qs.get('hud') !== '0') {
      const p = ks.player.pos, w = ks.world;
      hud.textContent = `${place}  (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})  ${near}\n三角 ${w.stats.tris}  绘制 ${w.stats.calls}  ${w.frameMs.toFixed(1)}ms  ${ks.q.tier}\n${Object.entries(ks.timings).map(([a, b]) => `${a} ${b}`).join('  ')}`;
    } else hud.textContent = '';
  });
  ks.start();
  if (qs.get('act')) setTimeout(() => ks.enterAct(qs.get('act')!, true), 400);
  setTimeout(() => { W.__ready = true; }, 900);
}
main().catch((e) => { hud.textContent = String(e?.stack ?? e); console.error(e); });
