import { useEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../../audio';
import { HEART, HEART_INDEX, HEART_TEXT } from '../../data/sutra';
import { QUOTES, VERSES, type Verse } from '../../data/verses';
import { today } from '../calendar';
import { actCmd, leaveAct } from '../ks';
import { addEntry, patch, saved, setUi, ui, useStore } from '../store';

// —— 静坐 ——
const DUR: Array<[number, string]> = [[5, '五分'], [10, '十分'], [15, '一刻'], [30, '两刻'], [0, '不计时']];
export function Sit() {
  const st = useStore(ui, (s) => s.actState);
  const phase = (st.phase as string) ?? 'choose';
  const breath = useStore(saved, (s) => s.breath);
  const [m, setM] = useState(() => saved.get().sitMinutes);
  const [peek, setPeek] = useState(false);
  const peekAt = st.peekAt as number | undefined;
  const sitting = phase === 'opening' || phase === 'sitting';
  useEffect(() => {
    setUi({ quiet: sitting });
    audio.keepAlive(sitting);
    let lock: { release(): Promise<void> } | null = null;
    if (sitting) void (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => { /* 不给就算了 */ });
    return () => { void lock?.release().catch(() => { /* 无妨 */ }); audio.keepAlive(false); setUi({ quiet: false }); };
  }, [sitting]);
  useEffect(() => {
    if (!peekAt) return;
    setPeek(true);
    const t = setTimeout(() => setPeek(false), 5200);
    return () => clearTimeout(t);
  }, [peekAt]);
  if (phase === 'choose') {
    return (
      <div className="sit-panel">
        <p>坐多久</p>
        <div className="sit-opts">
          {DUR.map(([v, label]) => <button key={v} className={`opt${v === m ? ' is-on' : ''}`} onClick={() => setM(v)} aria-pressed={v === m}>{label}</button>)}
        </div>
        <div className="sit-row">
          <button className={`opt${breath ? ' is-on' : ''}`} onClick={() => patch({ breath: !breath })} aria-pressed={breath}>呼吸引导</button>
          <button className="opt" onClick={leaveAct}>不坐了</button>
        </div>
        <button className="go-btn" onClick={() => { patch({ sitMinutes: m }); actCmd('start', m); }} data-testid="sit-start"><span>止静</span></button>
        <p style={{ fontSize: 12, opacity: 0.8 }}>三声引磬起，香尽一声止。点一下画面，可随时起身。</p>
      </div>
    );
  }
  if (phase === 'done') {
    return (
      <div className="sit-end">
        <h4>{(st.full as boolean) ? '香尽' : '起身'}</h4>
        <p>{QUOTES.sit.text}<small>{QUOTES.sit.from}</small></p>
        <button className="go-btn" onClick={leaveAct} data-testid="sit-leave"><span>出静</span></button>
      </div>
    );
  }
  return (
    <>
      <div className={`breath${breath && phase === 'sitting' ? ' is-on' : ''}`} aria-hidden><i><b>吸</b><b>呼</b></i></div>
      <div className={`sit-rise${peek ? ' is-on' : ''}`}>
        <button className="chip" onClick={() => actCmd('stop')} data-testid="sit-stop"><span>起身</span></button>
      </div>
    </>
  );
}

// —— 木鱼：跟着敲到的字 ——
export function Sutra() {
  const st = useStore(ui, (s) => s.actState);
  const n = (st.struck as number) ?? 0;
  const on = (st.sutra as boolean) ?? true;
  if (!on) return null;
  const cur = Math.min(HEART_TEXT.length - 1, Math.max(0, n - 1));
  const para = n === 0 ? 0 : HEART_INDEX[Math.min(HEART_TEXT.length - 1, n)].para === HEART_INDEX[cur].para ? HEART_INDEX[cur].para : HEART_INDEX[Math.min(HEART_TEXT.length - 1, n)].para;
  let base = 0;
  for (let p = 0; p < para; p++) base += HEART[p].join('').length;
  let k = base;
  return (
    <div className="sutra" aria-live="off">
      {HEART[para].map((ph, i) => {
        const start = k; k += [...ph].length;
        return (
          <span key={`${para}-${i}`} className={n >= k && n - k > 6 ? 'is-old' : ''}>
            {[...ph].map((ch, j) => <i key={j} className={start + j < n ? (start + j === n - 1 ? 'is-on is-now' : 'is-on') : ''}>{ch}</i>)}
          </span>
        );
      })}
    </div>
  );
}

// —— 拈一则 ——
export function VerseCard() {
  const st = useStore(ui, (s) => s.actState);
  const drawn = st.phase === 'drawn';
  const nonce = st.nonce as number | undefined;
  const [v, setV] = useState<Verse | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!drawn) { setV(null); return; }
    const t = today(), sv = saved.get().verse;
    // 今天第一次拈到的那一则记下来；再拈，就换一则
    const pool = VERSES.filter((x) => x.id !== last.current);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    last.current = pick.id;
    setV(pick);
    if (!sv || sv.day !== t.key) patch({ verse: { day: t.key, id: pick.id } });
    addEntry({ kind: 'lots', text: `「${pick.lines[0]}」` });
  }, [drawn, nonce]);
  if (!drawn || !v) return null;
  return (
    <>
      <div className="verse-back" />
      <article className="verse" key={v.id}>
        <div className="verse-lines">{v.lines.map((l, i) => <span key={i}>{l}</span>)}</div>
        <div className="verse-text">
          <p className="verse-from">{v.by && <b>{v.by}</b>}{v.era ? `${v.era}　` : ''}{v.from}</p>
          <p className="verse-gloss">{v.gloss}</p>
          <p className="verse-ask">{v.ask}</p>
          <div className="verse-acts">
            <button className="opt is-on" onClick={leaveAct} data-testid="verse-keep">收下</button>
            <button className="opt" onClick={() => actCmd('again')} data-testid="verse-again">放回去，再拈一则</button>
          </div>
        </div>
      </article>
    </>
  );
}

// —— 放灯 ——
export function Lamp() {
  const st = useStore(ui, (s) => s.actState);
  const [text, setText] = useState('');
  const hints = useMemo(() => ['愿你平安', '愿此刻长一点', '愿我放下', '不写也好'], []);
  if (st.phase !== 'write') return null;
  return (
    <div className="lamp-panel">
      <label htmlFor="lamp-text">灯上写一句</label>
      <input id="lamp-text" className="lamp-input" maxLength={20} value={text} placeholder={hints[Math.floor(Date.now() / 6000) % hints.length]} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { actCmd('light', text.trim()); setText(''); } }} autoComplete="off" enterKeyHint="done" />
      <button className="go-btn" onClick={() => { actCmd('light', text.trim()); setText(''); }} data-testid="lamp-light"><span>点灯</span></button>
      <small>写的字只留在这台设备上。不写，也可以放。</small>
    </div>
  );
}
