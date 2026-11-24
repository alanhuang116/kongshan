import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { farm } from '../../world/farm';
import { getKs } from '../ks';
import { ui, useStore } from '../store';

/**
 * 挑着担子时（farm/guide.ts 给的）：右上那一条底下一张小纸——挑到哪儿去、往哪边走（一枚墨环里的箭头，照着镜头转：朝上就是往前）、
 * 还有多远；一枚「放下」（电脑上也可以按 G）。画里目的地那一笔墨的上头，竖写那一处的名字（每帧跟着画面走，不经 React）。
 * 做事时、册页与简册开着时、换处的雾里都不出。
 */
interface Snap { title: string; parts: string[]; note: string | null; name: string | null; heading: boolean; at: boolean }
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
/** 放下肩上的担子（没挑着、正做着事时不放） */
function drop(): boolean {
  const k = getKs(), g = farm()?.guide;
  if (!k || k.act || k.nav.busy || !g) return false;
  return g.setDown('drop');
}
const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export default function FarmCarry() {
  const sheet = useStore(ui, (s) => !!s.sheet), act = useStore(ui, (s) => !!s.act), busy = useStore(ui, (s) => s.busy), menu = useStore(ui, (s) => s.menu);
  const [v, setV] = useState<Snap | null>(null);
  const [touch] = useState(coarse);
  const arrow = useRef<HTMLSpanElement>(null), tag = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, sig = '', ang = 0, first = true, frame = 0, limit = 140;
    const out = { x: 0, y: 0, visible: false, dist: 0 }, at = new THREE.Vector3();
    const hideTag = (t: HTMLElement) => { if (t.style.opacity !== '0') t.style.opacity = '0'; };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const k = getKs(), g = farm()?.guide, view = g?.view ?? null;
      const s = view ? `${view.title}|${view.line}|${view.note ?? ''}|${view.dest?.name ?? ''}|${view.heading == null ? 0 : 1}|${view.at ? 1 : 0}` : '';
      if (s !== sig) { sig = s; setV(view ? { title: view.title, parts: view.parts, note: view.note, name: view.dest?.name ?? null, heading: view.heading != null, at: view.at } : null); }
      // 箭头：要去的方向落在镜头里是哪边（朝上是往前、朝右是往右手边），缓缓转过去
      const ar = arrow.current;
      if (k && ar && view?.heading != null) {
        const cy = k.nav.camYaw, dx = Math.sin(view.heading), dz = Math.cos(view.heading);
        const want = Math.atan2(dx * Math.cos(cy) - dz * Math.sin(cy), -dx * Math.sin(cy) - dz * Math.cos(cy));
        ang = first ? want : ang + wrap(want - ang) * 0.18; first = false;
        ar.style.transform = `rotate(${((ang * 180) / Math.PI).toFixed(1)}deg)`;
      } else first = true;
      // 画里那一笔上头的名字：顶在画外了，就往下挪到那一笔还看得见的地方
      const t = tag.current;
      if (!t) return;
      const top = g?.beaconTop(at), alpha = g?.beaconAlpha ?? 0, s0 = ui.get();
      if (!k || !top || !view || alpha < 0.2 || s0.sheet || s0.act || s0.busy || s0.menu) { hideTag(t); return; }
      // 名字不压在上头那一张小纸上（隔一会儿量一次它有多高）
      if (frame++ % 20 === 0) limit = (bar.current?.getBoundingClientRect().bottom ?? 70) + 70;
      const y0 = top.y, foot = y0 - (y0 - (g?.dest?.y ?? y0)) * 0.96;
      let ok = false;
      for (const f of [0, 0.35, 0.6]) {
        at.y = y0 - (y0 - foot) * f;
        k.nav.project(at, out);
        // 贴着屏边的不出（左上是处名、右上是那一条；名字只写在画里看得见那一笔的地方）
        if (out.visible && out.y > limit && out.y < innerHeight - 40 && out.x > 64 && out.x < innerWidth - 64) { ok = true; break; }
      }
      if (!ok) { hideTag(t); return; }
      const x = out.x;
      t.style.opacity = Math.min(1, alpha * 1.1).toFixed(2);
      t.style.transform = `translate3d(${x.toFixed(1)}px, ${out.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  // 电脑上：G 是「放下」（打字、做事、册页开着时不算）
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'g') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const s = ui.get();
      if (s.phase !== 'roam' || s.sheet || s.menu || s.act) return;
      if (drop()) e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const hidden = !v || act || sheet || busy || menu;
  return (
    <div className={`carry${hidden ? ' is-hidden' : ''}`} data-testid="carry">
      {v && (
        <div className="carry-hint" ref={bar} role="status" aria-live="polite" data-testid="carry-hint">
          <span className={`carry-way${v.at ? ' is-at' : ''}`} aria-hidden>
            {v.heading && <span className="carry-arrow" ref={arrow}><svg viewBox="0 0 24 24"><path className="carry-shaft" d="M12 20.5C11.6 16 12.4 11 12 6.2" /><path className="carry-head" d="M7.2 10.6 12 5.2l4.8 5.4" /></svg></span>}
          </span>
          <span className="carry-text">
            <b>{v.title}</b>
            <span className="carry-line">{v.parts.map((x, i) => <i key={i}>{x}{i < v.parts.length - 1 ? '，' : ''}</i>)}</span>
            {v.note && <small>{v.note}</small>}
          </span>
          <button className="key carry-drop" onClick={() => drop()} data-testid="carry-drop" aria-label="放下担子" title={touch ? undefined : '放下（G）'}>
            <span>放下</span>{!touch && <kbd>G</kbd>}
          </button>
        </div>
      )}
      <div className="carry-tag" ref={tag} aria-hidden data-testid="carry-tag"><span>{v?.name ?? ''}</span></div>
    </div>
  );
}
