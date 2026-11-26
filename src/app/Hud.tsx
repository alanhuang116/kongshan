import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PLACES } from '../world/site';
import { GuaGlyph } from './Gua';
import { branchOf, cn } from './calendar';
import { useBrush, useGlyphKey } from './face';
import { doAct, getKs, openSheet, setRun, setStick, SUN, toggleMenu } from './ks';
import { hasSheet } from './sheets/extra';
import { patch, saved, ui, useStore, type Sheet } from './store';
import { XIAOXI, YUE } from './texts';

const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

/**
 * 画面上的标记：近处可以做的事，各是一枚小小的签，签下一根细线指着那样东西。位置每帧直接写到元素上（不经过 React）。
 * 走近了的那一枚添一点朱砂，并写上怎么做（按 E / 轻点）；点哪一枚，人就走过去做。
 * 签多了互相压着时，只留近的那一枚；也不压在右上那一条、简册、摇杆、「疾」、做事的印与走法的提示底下。
 * 走近了的那件事若不在画面里（在身后、或被挡着），下面另出一枚签。
 */
const KEEP_CLEAR = '.corner-bar, .menu, .stick, .run-key, .act-key, .walk-hint:not(.is-gone), .notes .note, .sky-card, .carry:not(.is-hidden) .carry-hint, .tg-key, .tg-panel';
function Markers({ touch }: { touch: boolean }) {
  const box = useRef<HTMLDivElement>(null), prompt = useRef<HTMLButtonElement>(null);
  const [list, setList] = useState<Array<{ id: string; label: string }>>([]);
  const near = useStore(ui, (s) => s.near);
  useEffect(() => {
    let raf = 0, sig = '', frame = 0;
    const widths = new Map<string, number>();
    const order: number[] = [], placed: Array<[number, number, number, number]> = [];
    let clear: Array<[number, number, number, number]> = [];
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
      // 界面上的几样东西占着的地方（隔几帧量一次）
      if (frame++ % 15 === 0) {
        clear = [];
        for (const n of document.querySelectorAll<HTMLElement>(KEEP_CLEAR)) {
          const r = n.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || getComputedStyle(n).opacity === '0') continue;
          clear.push([r.left - 6, r.right + 6, r.top - 6, r.bottom + 6]);
        }
      }
      // 抬着头看天的时候（往上拖过了平时的最低处）：画里的小签、下面那一枚都不出，天上干干净净
      const up = k.nav.pitch < -0.3;
      // 先摆走近了的那一枚，再由近及远；与已经摆下的压着了就不出
      order.length = 0;
      for (let i = 0; i < kids.length && i < ms.length; i++) { if (!up && ms[i].visible && ms[i].id === (kids[i] as HTMLElement).dataset.id) order.push(i); else hide(kids[i] as HTMLElement); }
      order.sort((a, b) => (ms[a].near ? -1 : ms[b].near ? 1 : ms[a].dist - ms[b].dist));
      placed.length = 0;
      for (const c of clear) placed.push(c);
      let nearSeen = false;
      for (const i of order) {
        const m = ms[i], c = kids[i] as HTMLElement;
        let w = widths.get(m.id);
        if (!w) { w = c.offsetWidth || 60; widths.set(m.id, w); }
        // 贴着屏边的：签往里挪，不让屏边裁掉半个字；签下那根线仍指着那样东西
        const ww = m.near ? w + 46 : w, half = ww / 2 + 8, cx = Math.max(half, Math.min(innerWidth - half, m.x));
        const x0 = cx - ww / 2 - 6, x1 = cx + ww / 2 + 6, y0 = m.y - 52, y1 = m.y + 4;
        let hit = false;
        for (const p of placed) if (x0 < p[1] && x1 > p[0] && y0 < p[3] && y1 > p[2]) { hit = true; break; }
        if (hit) { hide(c); continue; }
        placed.push([x0, x1, y0, y1]);
        if (m.near) nearSeen = true;
        // 远的淡一些；走近了的那个是实的
        c.style.opacity = m.near ? '1' : Math.max(0.56, Math.min(0.9, 1.25 - m.dist / 18)).toFixed(2);
        c.style.pointerEvents = 'auto';
        c.style.transform = `translate3d(${cx.toFixed(1)}px, ${m.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        const stem = c.lastElementChild as HTMLElement | null, dx = Math.max(-ww / 2 + 8, Math.min(ww / 2 - 8, m.x - cx));
        if (stem) { const t = Math.abs(dx) > 0.5 ? `translateX(${dx.toFixed(1)}px)` : ''; if (stem.style.transform !== t) stem.style.transform = t; }
        if (c.classList.contains('is-near') !== m.near) c.classList.toggle('is-near', m.near);
      }
      const pr = prompt.current;
      if (pr) { const on = !nearSeen && !!k.near && !up; if (pr.classList.contains('is-on') !== on) pr.classList.toggle('is-on', on); }
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

/** 摇杆（触屏）：左下一圈下凹的底座，里面一枚凸起的钮；按住往哪边推，人就往哪边走；推到头是快走。 */
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

/** 「疾」（触屏）：摇杆旁一枚小键，点一下一直跑，再点一下放开；跑着的时候亮（跟着世界报来的 run 走）。环下一行小字写着它是做什么的 */
function RunKey() {
  const run = useStore(ui, (s) => s.run);
  return (
    <button className={`run-key${run ? ' is-on' : ''}`} onClick={() => setRun(!getKs()?.runLock)} aria-pressed={run} aria-label={run ? '在跑，点一下放慢' : '跑：点一下跑起来'} data-testid="run-key">
      <span>疾</span>
      <small aria-hidden>{run ? '慢下' : '跑'}</small>
    </button>
  );
}

/** 会走了之后，提示一回怎么跑：电脑上是「Shift」，手机上是「疾」那一枚（跑过一回、或过一会儿就收起，以后不再出） */
function RunHint({ touch }: { touch: boolean }) {
  const told = useStore(saved, (s) => s.runTold), walked = useStore(saved, (s) => s.walked);
  const run = useStore(ui, (s) => s.run);
  const [on, setOn] = useState(false), [gone, setGone] = useState(false);
  useEffect(() => {
    if (told || !walked) return;
    const a = setTimeout(() => setOn(true), 1600), b = setTimeout(() => setGone(true), 11000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [told, walked]);
  useEffect(() => { if (on && run) setGone(true); }, [on, run]);
  useEffect(() => {
    if (!gone) return;
    const t = setTimeout(() => patch({ runTold: true }), 1500);
    return () => clearTimeout(t);
  }, [gone]);
  if (told || !walked || !on) return null;
  return (
    <p className={`walk-hint run-hint glass${gone ? ' is-gone' : ''}`} role="note" data-testid="run-hint">
      {touch
        ? <><span><b>「疾」</b>点一下跑起来</span><span><b>再点一下</b>慢下来走</span></>
        : <><span><kbd className="is-wide">Shift</kbd>按住，快步跑</span><span><b>点一下</b>一直跑，再点放开</span></>}
    </p>
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

/**
 * 右上的简册：两卷竹简，一枚一页。右边一卷是在园里随手要用的（今日、村图、天时、行囊、衣饰、村人簿、星图），
 * 左边一卷是记下的与设置（观象册、修为、起居注、声音、关于）。屏窄放不下并排的两卷时，第二卷落到第一卷下面。
 * 村人簿、星图、修为、衣饰那几页的文件还没有时，那一枚不出。
 */
const ROLLS: Array<Array<[Exclude<Sheet, null>, string]>> = [
  [['today', '今日'], ['map', '村图'], ['sky', '天时'], ['bag', '行囊'], ['wardrobe', '衣饰'], ['folk', '村人簿'], ['stars', '星图']],
  [['xiang', '观象册'], ['xiu', '修为'], ['journal', '起居注'], ['sound', '声音'], ['about', '关于']],
];
const rolls = () => ROLLS.map((r) => r.filter(([id]) => hasSheet(id))).filter((r) => r.length > 0);
function Menu() {
  // 竹简上的字体晚到时重画（iPhone 的磨砂层里会留空白）
  const gk = useGlyphKey(rolls().flat().map(([, n]) => n).join(''));
  return (
    <>
      <div className="menu-back" onClick={() => toggleMenu(false)} />
      <nav className="menu" aria-label="册" key={gk} style={{ '--nmax': Math.max(...rolls().map((r) => r.length)) } as CSSProperties}>
        {rolls().map((r, i) => (
          <div className="roll" key={i}>
            {r.map(([id, name]) => (
              <button key={id} className="slip" onClick={() => openSheet(id)} data-testid={`key-${id}`}><span>{name}</span></button>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}

/**
 * 时辰牌底下一道细线：一天二十四个钟头从左到右，白天那一段是实的墨线、夜里是点线；
 * 一点朱砂（夜里是一圈金，像月）走在线上——此刻走到一天的哪里、离天黑还有多远，一眼看得见。
 */
function DayLine() {
  const h = useStore(ui, (s) => Math.round(s.hour * 20) / 20);
  const season = useStore(saved, (s) => s.season);
  const [rise, set] = SUN[season];
  const night = h < rise - 0.3 || h > set + 0.3;
  const style = { '--rise': rise / 24, '--set': set / 24, '--at': h / 24 } as CSSProperties;
  return <i className={`when-line${night ? ' is-night' : ''}`} style={style} aria-hidden data-testid="day-line" />;
}

export default function Hud() {
  const place = useStore(ui, (s) => s.place);
  const busy = useStore(ui, (s) => s.busy);
  const act = useStore(ui, (s) => s.act);
  const near = useStore(ui, (s) => s.near);
  const arrivedAt = useStore(ui, (s) => s.arrivedAt);
  const sheet = useStore(ui, (s) => s.sheet);
  // 星笺开着（夜里点了天）：触屏上摇杆、「疾」、印先收起来，笺落在下面
  const skyOn = useStore(ui, (s) => !!s.sky);
  const menu = useStore(ui, (s) => s.menu);
  // 只看时辰（画里的钟点每秒都在走，时辰换了才重画这一角）
  const branch = useStore(ui, (s) => branchOf(s.hour));
  const day = useStore(ui, (s) => s.day);
  // 十二消息卦：按月（默认）显这一月之卦，按时辰显这一时之卦（天时那一页上切换）
  const xx = useStore(ui, (s) => s.xx), month = useStore(ui, (s) => s.month);
  const [touch] = useState(coarse);
  useEffect(() => {
    if (!menu) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') toggleMenu(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [menu]);
  const byMonth = xx === 'month', now = XIAOXI[byMonth ? month : branch], tag = byMonth ? YUE[now.i] : now.branch;
  // 扫叶这样的事，做的时候人照常走动：摇杆得留着
  const free = !!(act && getKs()?.acts[act]?.free);
  const dayName = `第${cn(day + 1)}日`;
  // 时辰、卦名的字体晚到时让它们重画（iPhone 的磨砂层里会留空白）
  const gk = useGlyphKey(`${dayName}${tag}·${now.gua.name}册`);
  return (
    <div className={`hud${busy ? ' is-busy' : ''}${act ? ' is-act' : ''}${free ? ' is-free' : ''}${sheet ? ' has-sheet' : ''}${touch ? ' is-touch' : ''}${skyOn ? ' has-sky' : ''}`}>
      <Markers touch={touch} />
      <PlaceName key={`${place}:${arrivedAt}`} id={place} />
      <div className="corner">
        <div className="corner-bar">
          {/* 「第几日」单独一格：点它看今天能做什么（「今日」）；时辰与卦那一格看天时 */}
          <button className="when-day" onClick={() => openSheet('today')} aria-label={`${dayName}。今天能做什么`} data-testid="hud-day" key={`d${gk}`}>{dayName}</button>
          <button className="when" onClick={() => openSheet('sky')} aria-label={byMonth ? `${now.month}之卦，${now.gua.name}。看天时` : `${now.branch}时，${now.gua.name}卦。看天时`} data-testid="key-when" data-xx={xx}>
            <span key={`s${gk}`}>{tag}<i>·</i>{now.gua.name}</span>
            <GuaGlyph lines={now.gua.lines} />
            <DayLine />
          </button>
          <button className={`menu-key${menu ? ' is-on' : ''}`} onClick={() => toggleMenu()} aria-expanded={menu} aria-label={`册：${rolls().flat().map(([, n]) => n).join('、')}`} data-testid="key-menu">册</button>
        </div>
        {menu && <Menu />}
      </div>
      <footer className="dock">
        <WalkHint touch={touch} />
        <RunHint touch={touch} />
      </footer>
      {touch && <Stick />}
      {touch && <RunKey />}
      {touch && near && (
        <button key={near.id} className="act-key glass" onClick={() => doAct()} data-testid="act-key" aria-label={near.label}>
          <span>{near.label}</span>
        </button>
      )}
    </div>
  );
}
