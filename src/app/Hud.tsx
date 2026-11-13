import { useEffect, useRef, useState } from 'react';
import { PLACES } from '../world/site';
import { GuaGlyph } from './Gua';
import { useBrush } from './face';
import { doAct, getKs, openSheet, setStick, toggleMenu } from './ks';
import { patch, saved, ui, useStore, type Sheet } from './store';
import { xiaoxiAt } from './yi';

const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/**
 * 画面上的标记：近处可以做的事，各是一枚小小的签，签下一根细线指着那样东西。位置每帧直接写到元素上（不经过 React）。
 * 走近了的那一枚添一点朱砂，并写上怎么做（按 E / 轻点）；点哪一枚，人就走过去做。
 * 签多了互相压着时，只留近的那一枚。走近了的那件事若不在画面里（在身后），下面另出一枚签。
 */
function Markers({ touch }: { touch: boolean }) {
  const box = useRef<HTMLDivElement>(null), prompt = useRef<HTMLButtonElement>(null);
  const [list, setList] = useState<Array<{ id: string; label: string }>>([]);
  const near = useStore(ui, (s) => s.near);
  useEffect(() => {
    let raf = 0, sig = '';
    const widths = new Map<string, number>();
    const order: number[] = [], placed: Array<[number, number, number, number]> = [];
    const hide = (c: HTMLElement) => { if (c.style.opacity !== '0') { c.style.opacity = '0'; c.style.pointerEvents = 'none'; } };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const k = getKs(), el = box.current;
      if (!k || !el) return;
      const ms = k.markers;
      // 事的清单变了（世界后来又添了几件）：重排一遍，下一帧再摆
      const s = `${ms.length}:${ms[0]?.id ?? ''}:${ms[ms.length - 1]?.id ?? ''}`;
      if (s !== sig) { sig = s; widths.clear(); setList(ms.map((m) => ({ id: m.id, label: m.label }))); return; }
      const kids = el.children;
      // 先摆走近了的那一枚，再由近及远；与已经摆下的压着了就不出
      order.length = 0;
      for (let i = 0; i < kids.length && i < ms.length; i++) { if (ms[i].visible && ms[i].id === (kids[i] as HTMLElement).dataset.id) order.push(i); else hide(kids[i] as HTMLElement); }
      order.sort((a, b) => (ms[a].near ? -1 : ms[b].near ? 1 : ms[a].dist - ms[b].dist));
      placed.length = 0;
      let nearSeen = false;
      for (const i of order) {
        const m = ms[i], c = kids[i] as HTMLElement;
        let w = widths.get(m.id);
        if (!w) { w = c.offsetWidth || 60; widths.set(m.id, w); }
        const ww = m.near ? w + 46 : w, x0 = m.x - ww / 2 - 6, x1 = m.x + ww / 2 + 6, y0 = m.y - 52, y1 = m.y + 4;
        let hit = false;
        for (const p of placed) if (x0 < p[1] && x1 > p[0] && y0 < p[3] && y1 > p[2]) { hit = true; break; }
        if (hit) { hide(c); continue; }
        placed.push([x0, x1, y0, y1]);
        if (m.near) nearSeen = true;
        // 远的淡一些；走近了的那个是实的
        c.style.opacity = m.near ? '1' : Math.max(0.56, Math.min(0.9, 1.25 - m.dist / 18)).toFixed(2);
        c.style.pointerEvents = 'auto';
        c.style.transform = `translate3d(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        if (c.classList.contains('is-near') !== m.near) c.classList.toggle('is-near', m.near);
      }
      const pr = prompt.current;
      if (pr) { const on = !nearSeen && !!k.near; if (pr.classList.contains('is-on') !== on) pr.classList.toggle('is-on', on); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <>
      <div className="markers" ref={box}>
        {list.map((m) => (
          <button key={m.id} data-id={m.id} className="mk" onClick={() => doAct(m.id)} data-testid={`mk-${m.id}`} tabIndex={-1}>
            <span className="mk-tag"><i aria-hidden /><span>{m.label}</span><em>{touch ? '轻点' : '按 E'}</em></span>
            <b className="mk-stem" aria-hidden />
          </button>
        ))}
      </div>
      <button className="prompt" ref={prompt} onClick={() => doAct()} data-testid="use" data-thing={near?.id ?? ''} tabIndex={near ? 0 : -1}>
        <span className="mk-tag"><i aria-hidden /><span>{near?.label ?? ''}</span><em>{touch ? '轻点' : '按 E'}</em></span>
      </button>
    </>
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

/** 头一回进来时教怎么走、怎么看：走出几步就收起，以后不再出 */
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
      if (far > 4) { setGone(true); setTimeout(() => patch({ walked: true }), 1800); clearInterval(t); }
    }, 400);
    return () => clearInterval(t);
  }, [walked]);
  if (walked) return null;
  return (
    <p className={`walk-hint glass${gone ? ' is-gone' : ''}`} role="note">
      {touch
        ? <><span><b>左下的环</b>推着走</span><span><b>拖动</b>转看四周</span><span><b>双指</b>远近</span><span><b>点地面</b>也走过去</span></>
        : <><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>走</span><span><b>拖动</b>转看四周</span><span><b>滚轮</b>远近</span><span><b>点地面</b>也走过去</span></>}
    </p>
  );
}

/** 处名：走到另一处时浮出来——竖写的名字、一句小字——过一会儿自己退下去，把画让出来 */
function PlaceName({ id }: { id: string }) {
  const pl = PLACES.find((p) => p.id === id);
  const brush = useBrush(pl?.name ?? '');
  const [on, setOn] = useState(false);
  useEffect(() => {
    const a = requestAnimationFrame(() => setOn(true)), b = setTimeout(() => setOn(false), 6800);
    return () => { cancelAnimationFrame(a); clearTimeout(b); };
  }, []);
  if (!pl) return null;
  return (
    <header className={`place${on ? ' is-on' : ''}`} aria-live="polite">
      <h2 className={brush ? '' : 'is-kai'}>{pl.name}</h2>
      <p>{pl.note}</p>
    </header>
  );
}

/** 右上那一卷简册：六枚竹简，一枚一页 */
const LEAVES: Array<[Exclude<Sheet, null>, string]> = [['map', '村图'], ['sky', '天时'], ['xiang', '观象册'], ['sound', '声音'], ['journal', '起居注'], ['about', '关于']];
function Menu() {
  return (
    <>
      <div className="menu-back" onClick={() => toggleMenu(false)} />
      <nav className="menu glass" aria-label="册">
        {LEAVES.map(([id, name]) => (
          <button key={id} className="slip" onClick={() => openSheet(id)} data-testid={`key-${id}`}><span>{name}</span></button>
        ))}
      </nav>
    </>
  );
}

export default function Hud() {
  const place = useStore(ui, (s) => s.place);
  const busy = useStore(ui, (s) => s.busy);
  const act = useStore(ui, (s) => s.act);
  const near = useStore(ui, (s) => s.near);
  const arrivedAt = useStore(ui, (s) => s.arrivedAt);
  const sheet = useStore(ui, (s) => s.sheet);
  const menu = useStore(ui, (s) => s.menu);
  const hour = useStore(ui, (s) => s.hour);
  const [touch] = useState(coarse);
  useEffect(() => {
    if (!menu) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') toggleMenu(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [menu]);
  const now = xiaoxiAt(hour);
  // 扫叶这样的事，做的时候人照常走动：摇杆得留着
  const free = !!(act && getKs()?.acts[act]?.free);
  return (
    <div className={`hud${busy ? ' is-busy' : ''}${act ? ' is-act' : ''}${free ? ' is-free' : ''}${sheet ? ' has-sheet' : ''}${touch ? ' is-touch' : ''}`}>
      <Markers touch={touch} />
      <PlaceName key={`${place}:${arrivedAt}`} id={place} />
      <div className="corner">
        <div className="corner-bar glass">
          <button className="when" onClick={() => openSheet('sky')} aria-label={`${now.branch}时，${now.gua.name}卦。看天时`} data-testid="key-when">
            <span>{now.branch}<i>·</i>{now.gua.name}</span>
            <GuaGlyph lines={now.gua.lines} />
          </button>
          <button className={`menu-key${menu ? ' is-on' : ''}`} onClick={() => toggleMenu()} aria-expanded={menu} aria-label="册：村图、天时、观象册、声音、起居注、关于" data-testid="key-menu">册</button>
        </div>
        {menu && <Menu />}
      </div>
      <footer className="dock">
        <WalkHint touch={touch} />
      </footer>
      {touch && <Stick />}
      {touch && near && (
        <button key={near.id} className="act-key glass" onClick={() => doAct()} data-testid="act-key" aria-label={near.label}>
          <span>{near.label}</span>
        </button>
      )}
    </div>
  );
}
