import { useEffect, useRef, useState } from 'react';
import { cn } from '../calendar';
import { useBrush } from '../face';
import { actCmd, frame, getKs, leaveAct } from '../ks';
import { ui, useStore } from '../store';
import Copy from './Copy';
import Panel, { hasPanel } from './Panel';
import { choicesOf, exitOf, holdOf, keysOf, meterOf, num, stepsOf, str, strList, tagsOf } from './state';
import { HoldKey, KeyHints, MeterBar, SteerKeys, StepList, Tags, hasKeyboard } from './Widgets';

/**
 * 做事时的那一层界面（state 怎么写见 state.ts）：
 *   左上竖写这件事的名字（与计数、几步里的第几步）；下面当中一块薄板放提示、一道表、进度与键盘上怎么按；右下一枚「毕」。
 *   有话要读、有象要看、有签要选、要从行囊里挑东西时，旁边出一块面板（Panel）；要写字时出一张纸（Copy）。
 *   要按住的事，右下是一枚落在底座里的大键（HoldKey，空格同），「毕」挪到右上；钉在画里的小签（Tags）跟着画面走。
 *   触屏上要转向的事（摇橹，state.steer 为真），左边另有「左」「右」两枚（SteerKeys）。
 * 这一层自己不接指针——画面上的东西（天上的星、琴弦、炉火、菊丛）照常点得到；只有面板、纸、小签与几枚键接。Esc 也是「做完了」。
 *
 * 右下那一枚：state 里只带着一枚「做完了」的签（罢、起身……）而别无可放时，那枚签就落在这里（点了把它的 id 发回去）；
 * 面板里已经有「做完了」的签时这里不出；别的时候是「毕」（直接起身）。
 */
/** 宽屏（含横着的手机）：面板、纸在右，人让到左（与 acts.css、write.css 里的断点一致） */
const isWide = () => typeof innerWidth === 'undefined' || (innerWidth >= 600 && innerWidth > innerHeight * 1.15);
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
/** 这几样事做着的时候只是看着、歇着：提示出一会儿就退下去，只留名字与一道极细的进度 */
const QUIET = new Set(['guan', 'rest']);
/** 这几件事做着时面板收紧、贴底一条，把画（天）让出来（state.compact 为真也是） */
const COMPACT = new Set(['stars']);

export default function ActLayer() {
  const act = useStore(ui, (s) => s.act);
  const st = useStore(ui, (s) => s.actState);
  const covered = useStore(ui, (s) => !!s.sheet || s.menu);
  const [wide, setWide] = useState(isWide);
  const [touch] = useState(coarse);
  const [kb] = useState(hasKeyboard);
  useEffect(() => { const f = () => setWide(isWide()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const kind = str(st.kind) ?? '', model = strList(st.model), cs = choicesOf(st.choices), exit = exitOf(cs);
  const writing = !!act && kind === 'write' && model.length > 0;
  const panel = !!act && !writing && hasPanel(st);
  const hint = str(st.hint);
  const meter = writing ? null : meterOf(st.meter), hold = writing ? null : holdOf(st.hold), tags = writing ? [] : tagsOf(st.tags);
  const keys = kb && !writing ? keysOf(st.keys) : [], steps = stepsOf(st);
  const steer = touch && !writing && st.steer === true;
  const quiet = !!act && (QUIET.has(kind) || st.quiet === true) && !panel && !writing && cs.length === 0 && !hold && !meter;
  // 收紧的面板（观星）：贴底一条，提示挪进面板里，不另出一块板；画不让开（天就在那里）
  const compact = !!act && !writing && panel && (COMPACT.has(act) || st.compact === true);
  // 有面板、有纸的时候把人让开：宽屏时它们在右，人让到左；竖屏时它们在下，人让到上
  useEffect(() => {
    let x = 0, y = 0;
    if (writing) { if (wide) x = -0.2; else y = 0.27; }
    else if (panel && !compact) { if (wide) x = -0.13; else y = 0.21; }
    frame(x, y);
    return () => frame(0, 0);
  }, [writing, panel, wide, compact]);
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
  // 右下那一枚（有按住的大键时它挪到右上）
  const corner = panel && exit ? null : !panel && !writing && exit ? exit : { id: '', label: str(st.doneLabel) ?? '毕' };
  const foot = !writing && !!((hint && !compact) || (bar != null && !quiet) || meter || keys.length);
  const cls = ['act', writing && 'is-write', panel && 'has-panel', compact && 'is-compact', !corner && 'no-done', quiet && 'is-quiet', foot && 'has-foot', free && 'is-free', touch && 'is-touch', hold && 'has-hold', tags.length && 'has-tags'].filter(Boolean).join(' ');
  return (
    <div className={cls} data-kind={kind}>
      {tags.length > 0 && <Tags tags={tags} />}
      <header className="act-head">
        <h3 className={brush ? '' : 'is-kai'}>{title}</h3>
        {count && <p>{count}</p>}
        {steps && <StepList list={steps.list} at={steps.at} />}
      </header>
      <div className="act-main">
        {writing ? <Copy key={model.join('/')} model={model} head={head} hint={hint ?? undefined} /> : panel ? <Panel st={st} compact={compact} lead={compact ? hint : null} /> : null}
        {steer && <SteerKeys />}
        {foot && (
          <div className={`act-foot${quiet && faded ? ' is-faded' : ''}`} data-testid="act-foot">
            {hint && <p className="act-hint">{hint}</p>}
            {meter && <MeterBar m={meter} />}
            {bar != null && !quiet && <i className="act-bar"><b style={{ transform: `scaleX(${bar.toFixed(3)})` }} /></i>}
            {keys.length > 0 && <KeyHints keys={keys} />}
          </div>
        )}
      </div>
      {quiet && bar != null && <i className="act-bar is-bare"><b style={{ transform: `scaleX(${bar.toFixed(3)})` }} /></i>}
      {hold && <HoldKey hold={hold} kb={kb} />}
      {corner && (
        <button className={`act-done${st.done ? ' is-done' : ''}`} onClick={() => (corner.id ? actCmd(corner.id) : leaveAct())} data-testid="act-done" aria-label={corner.id ? corner.label : '做完了，起身'}>{corner.label}</button>
      )}
    </div>
  );
}
