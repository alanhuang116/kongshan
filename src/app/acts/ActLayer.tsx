import { useEffect, useRef, useState } from 'react';
import { cn } from '../calendar';
import { useBrush } from '../face';
import { actCmd, frame, getKs, leaveAct } from '../ks';
import { ui, useStore } from '../store';
import Copy from './Copy';
import Panel, { choicesOf, exitOf, hasPanel, num, str, strList } from './Panel';

/**
 * 做事时的那一层界面：左上是这件事的名字（与计数），下面一句提示（与一道进度的墨线），右下一枚「毕」。
 * 有话要读、有象要看、有签要选时，旁边出一块面板（Panel，全看世界交来的 state）；要写字时出一张纸（Copy）。
 * 这一层自己不接指针——画面上的东西（天上的星、琴弦、炉火、菊丛）照常点得到；只有面板、纸与右下那一枚接。Esc 也是「做完了」。
 *
 * 右下那一枚：state 里只带着一枚「做完了」的签（罢、起身……）而别无可放时，那枚签就落在这里（点了把它的 id 发回去）；
 * 面板里已经有「做完了」的签时这里不出；别的时候是「毕」（直接起身）。
 */
const isWide = () => typeof innerWidth === 'undefined' || (innerWidth >= 760 && innerWidth > innerHeight * 1.15);
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
/** 这几样事做着的时候只是看着、歇着：提示出一会儿就退下去，只留名字与一道极细的进度 */
const QUIET = new Set(['guan', 'rest']);

export default function ActLayer() {
  const act = useStore(ui, (s) => s.act);
  const st = useStore(ui, (s) => s.actState);
  const covered = useStore(ui, (s) => !!s.sheet || s.menu);
  const [wide, setWide] = useState(isWide);
  const [touch] = useState(coarse);
  useEffect(() => { const f = () => setWide(isWide()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const kind = str(st.kind) ?? '', model = strList(st.model), cs = choicesOf(st.choices), exit = exitOf(cs);
  const writing = !!act && kind === 'write' && model.length > 0;
  const panel = !!act && !writing && hasPanel(st);
  const hint = str(st.hint);
  const quiet = !!act && QUIET.has(kind) && !panel && !writing && cs.length === 0;
  // 有面板、有纸的时候把人让开：宽屏时它们在右，人让到左；竖屏时它们在下，人让到上
  useEffect(() => {
    let x = 0, y = 0;
    if (writing) { if (wide) x = -0.2; else y = 0.27; }
    else if (panel) { if (wide) x = -0.13; else y = 0.17; }
    frame(x, y);
    return () => frame(0, 0);
  }, [writing, panel, wide]);
  // Esc：这件事自己带着「做完了」的签时，Esc 就是点那枚签（它要记一笔、要先显一象的，都照常）；没有就直接起身。
  // 连按两下是「不管怎样都起身」——免得哪件事的那枚签此刻不让走。
  const exitId = exit?.id ?? '', lastEsc = useRef(0);
  useEffect(() => {
    if (!act || covered) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return;
      const now = performance.now(), again = now - lastEsc.current < 1200;
      lastEsc.current = now;
      if (exitId && !again) actCmd(exitId); else leaveAct();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [act, covered, exitId]);
  // 只是看着、歇着的时候：提示出一会儿就退下去
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    setFaded(false);
    if (!quiet) return;
    const t = setTimeout(() => setFaded(true), 5200);
    return () => clearTimeout(t);
  }, [quiet, hint]);
  const title = str(st.title) ?? (act ? getKs()?.acts[act]?.name : '') ?? '';
  const brush = useBrush(title);
  if (!act) return null;
  const p = num(st.progress), n = num(st.count), total = num(st.total);
  // 计数：「三」；有总数时是「十六之三」
  const count = n != null ? (n > 0 ? (total ? `${cn(total)}之${cn(n)}` : cn(n)) : '') : str(st.count) ?? '';
  // 进度：没有面板时跟在提示下面（只是看着的时候是单独的一道细线）；有面板时画在面板里
  const bar = !panel && !writing && p != null && p < 1 ? Math.max(0, p) : null;
  const free = !!getKs()?.acts[act]?.free;
  const from = str(st.from), head = from ? (/[《「]/.test(from) ? from : `《${from}》`) : str(st.source) ?? title;
  // 右下那一枚
  const corner = panel && exit ? null : !panel && !writing && exit ? exit : { id: '', label: str(st.doneLabel) ?? '毕' };
  const foot = !writing && !!(hint || (bar != null && !quiet));
  return (
    <div className={`act${writing ? ' is-write' : ''}${panel ? ' has-panel' : ''}${corner ? '' : ' no-done'}${quiet ? ' is-quiet' : ''}${foot ? ' has-foot' : ''}${free ? ' is-free' : ''}${touch ? ' is-touch' : ''}`} data-kind={kind}>
      <header className="act-head">
        <h3 className={brush ? '' : 'is-kai'}>{title}</h3>
        {count && <p>{count}</p>}
      </header>
      <div className="act-main">
        {writing ? <Copy key={model.join('/')} model={model} head={head} hint={hint ?? undefined} /> : panel ? <Panel st={st} /> : null}
        {foot && (
          <div className={`act-foot${quiet && faded ? ' is-faded' : ''}`}>
            {hint && <p className="act-hint">{hint}</p>}
            {bar != null && !quiet && <i className="act-bar"><b style={{ transform: `scaleX(${bar.toFixed(3)})` }} /></i>}
          </div>
        )}
      </div>
      {quiet && bar != null && <i className="act-bar is-bare"><b style={{ transform: `scaleX(${bar.toFixed(3)})` }} /></i>}
      {corner && (
        <button className={`act-done glass${st.done ? ' is-done' : ''}`} onClick={() => (corner.id ? actCmd(corner.id) : leaveAct())} data-testid="act-done" aria-label={corner.id ? corner.label : '做完了，起身'}>{corner.label}</button>
      )}
    </div>
  );
}
