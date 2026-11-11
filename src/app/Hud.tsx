import { useEffect, useRef, useState } from 'react';
import { PLACE } from '../world/nav';
import { partOfDay, shichen, today } from './calendar';
import { doAct, getKs, openSheet, setStick } from './ks';
import { patch, saved, ui, useStore } from './store';

const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/** 画面上的标记：近处能做的事、钟鼓楼的门。位置每帧直接写到元素上（不经过 React）。点一个，人就走过去做。 */
function Markers() {
  const box = useRef<HTMLDivElement>(null);
  const ks = getKs();
  const list = ks ? ks.things.map((t) => ({ id: t.id, kind: t.kind, label: t.label })) : [];
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const k = getKs(), el = box.current;
      if (!k || !el) return;
      const kids = el.children;
      for (let i = 0; i < kids.length; i++) {
        const m = k.markers[i], c = kids[i] as HTMLElement;
        if (!m || m.id !== c.dataset.id || !m.visible) { if (c.style.opacity !== '0') { c.style.opacity = '0'; c.style.pointerEvents = 'none'; } continue; }
        // 远的淡一些；走近了的那个亮起来
        c.style.opacity = m.near ? '1' : String(Math.max(0.42, Math.min(0.92, 1.25 - m.dist / 14)).toFixed(2));
        c.style.pointerEvents = 'auto';
        c.style.transform = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
        if (c.classList.contains('is-near') !== m.near) c.classList.toggle('is-near', m.near);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="markers" ref={box}>
      {list.map((m) => (
        <button key={m.id} data-id={m.id} className={`mk mk-${m.kind}`} onClick={() => doAct(m.id)} data-testid={`mk-${m.id}`} tabIndex={-1}>
          <i /><span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

/** 摇杆（触屏）：左下一只浅浅的环，按住往哪边推，人就往哪边走；推到头是快走。 */
function Stick() {
  const base = useRef<HTMLDivElement>(null), knob = useRef<HTMLElement>(null);
  const id = useRef<number | null>(null);
  const set = (e: React.PointerEvent | null) => {
    const b = base.current, kn = knob.current;
    if (!b || !kn) return;
    if (!e) { kn.style.transform = 'translate(-50%, -50%)'; b.classList.remove('is-on'); setStick(0, 0); return; }
    const r = b.getBoundingClientRect(), R = r.width / 2;
    const x = (e.clientX - (r.left + R)) / R, y = (e.clientY - (r.top + R)) / R;
    const l = Math.hypot(x, y), m = Math.min(1, l), ux = l > 1e-4 ? x / l : 0, uy = l > 1e-4 ? y / l : 0;
    kn.style.transform = `translate(calc(-50% + ${(ux * m * R * 0.62).toFixed(1)}px), calc(-50% + ${(uy * m * R * 0.62).toFixed(1)}px))`;
    // 中间留一小圈不动的；往上推是往前
    const k = m < 0.14 ? 0 : (m - 0.14) / 0.86;
    setStick(ux * k, -uy * k);
  };
  useEffect(() => () => setStick(0, 0), []);
  return (
    <div
      className="stick" ref={base} data-testid="stick" aria-label="摇杆：按住推动来行走"
      onPointerDown={(e) => { e.preventDefault(); id.current = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 无妨 */ } base.current?.classList.add('is-on'); set(e); }}
      onPointerMove={(e) => { if (id.current === e.pointerId) set(e); }}
      onPointerUp={(e) => { if (id.current === e.pointerId) { id.current = null; set(null); } }}
      onPointerCancel={() => { id.current = null; set(null); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <b ref={knob} />
    </div>
  );
}

/** 头一回进来时教怎么走：走出几步就收起，以后不再出 */
function WalkHint({ touch }: { touch: boolean }) {
  const walked = useStore(saved, (s) => s.walked);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (walked) return;
    const k = getKs();
    if (!k) return;
    const x0 = k.player.pos.x, z0 = k.player.pos.z;
    let far = 0;
    const t = setInterval(() => {
      far = Math.max(far, Math.hypot(k.player.pos.x - x0, k.player.pos.z - z0));
      if (far > 4) { setGone(true); setTimeout(() => patch({ walked: true }), 1600); clearInterval(t); }
    }, 400);
    return () => clearInterval(t);
  }, [walked]);
  if (walked) return null;
  return (
    <p className={`walk-hint${gone ? ' is-gone' : ''}`} role="note">
      {touch ? <><span>左下的环，推着走</span><span>拖动画面，转头看</span><span>点地面，也走过去</span></> : <><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 走动</span><span><kbd>Shift</kbd> 快走</span><span>拖动画面，转头看</span><span>点地面，也走过去</span></>}
    </p>
  );
}

export default function Hud() {
  const place = useStore(ui, (s) => s.place);
  const busy = useStore(ui, (s) => s.busy);
  const act = useStore(ui, (s) => s.act);
  const near = useStore(ui, (s) => s.near);
  const arrivedAt = useStore(ui, (s) => s.arrivedAt);
  const sheet = useStore(ui, (s) => s.sheet);
  const [fresh, setFresh] = useState(true);
  const [clock, setClock] = useState(0);
  const [touch] = useState(coarse);
  useEffect(() => { setFresh(true); const t = setTimeout(() => setFresh(false), 7000); return () => clearTimeout(t); }, [arrivedAt]);
  useEffect(() => { const t = setInterval(() => setClock((c) => c + 1), 20000); return () => clearInterval(t); }, []);
  const pl = PLACE.get(place) ?? PLACE.get('yard')!;
  const ks = getKs();
  const hour = ks?.atmos.hour ?? new Date().getHours();
  const t = today();
  void clock;
  // 扫叶这样的事，做的时候人照常走动：摇杆得留着
  const free = !!(act && ks?.acts[act]?.free);
  return (
    <div className={`hud${busy ? ' is-busy' : ''}${act ? ' is-act' : ''}${free ? ' is-free' : ''}${sheet ? ' has-sheet' : ''}${touch ? ' is-touch' : ''}`}>
      <Markers />
      <header className="place" key={place}>
        <i className="seal" aria-hidden>空山</i>
        <div className="place-text">
          <h2>{pl.name}</h2>
          <p className={fresh ? '' : 'is-dim'}>{pl.sub}</p>
        </div>
      </header>
      <div className="corner">
        <p className="when" onClick={() => openSheet('sky')}>{t.term ? `${t.term}　` : ''}{shichen(hour)}<small>{partOfDay(hour)}</small></p>
        <nav className="keys" aria-label="寺里的几样东西">
          <button className="key" onClick={() => openSheet('map')} aria-label="寺图" data-testid="key-map">图</button>
          <button className="key" onClick={() => openSheet('sky')} aria-label="天时" data-testid="key-sky">时</button>
          <button className="key" onClick={() => openSheet('sound')} aria-label="声音" data-testid="key-sound">声</button>
          <button className="key" onClick={() => openSheet('journal')} aria-label="功课簿" data-testid="key-journal">簿</button>
        </nav>
      </div>
      <footer className="dock">
        {near && (
          <button key={near.id} className={`chip chip-act${near.kind === 'door' ? ' chip-door' : ''}`} onClick={() => doAct()} data-testid="use" data-thing={near.id}>
            <span>{near.label}</span>
            {!touch && <kbd aria-hidden>E</kbd>}
          </button>
        )}
        <WalkHint touch={touch} />
      </footer>
      {touch && <Stick />}
    </div>
  );
}
