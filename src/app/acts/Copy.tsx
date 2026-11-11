import { useCallback, useEffect, useRef, useState } from 'react';
import { audio } from '../../audio';
import { HEART, HEART_BY, HEART_INDEX, HEART_TEXT, HEART_TITLE } from '../../data/sutra';
import { cn, today } from '../calendar';
import { actCmd } from '../ks';
import { addEntry, patch, saved, useStore } from '../store';
import { Brush, drawStrokes, packChar, unpackChar } from './brush';

/**
 * 抄经：一张宣纸，朱丝栏；当前这个字淡淡地印在格子里（描红），照着写。写完停一停，自己翻到下一个字。
 * 写过的字按你的笔迹留着，二百六十个字写完是一卷，可以存成图。字写得像不像不评。
 */
const KEY = 'kongshan:copy:v1';
const TOTAL = HEART_TEXT.length;
const KAI = '"LXGW WenKai", "Kaiti SC", "STKaiti", "KaiTi", serif';
function loadAll(): string[] {
  try { const a = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]; if (Array.isArray(a)) return Array.from({ length: TOTAL }, (_, i) => a[i] ?? ''); } catch { /* 没有就从头写 */ }
  return Array.from({ length: TOTAL }, () => '');
}
const saveAll = (a: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* 存不下：这一遍只留在眼前 */ } };

function Thumb({ data, ch, size, here }: { data: string; ch: string; size: number; here?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const d = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = Math.round(size * d);
    const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height);
    if (data) drawStrokes(g, unpackChar(data), 0, 0, c.width);
    else { g.font = `${c.width * 0.74}px ${KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = here ? 'rgba(168,58,43,0.5)' : 'rgba(40,36,32,0.2)'; g.fillText(ch, c.width / 2, c.width * 0.53); }
  }, [data, ch, size, here]);
  return <canvas ref={ref} className={`copy-thumb${here ? ' is-here' : ''}`} style={{ width: size, height: size }} />;
}

/** 整卷：十七字一行，自右而左 */
function renderScroll(all: string[], cell: number): HTMLCanvasElement {
  const rows = 17, cols = Math.ceil(TOTAL / rows), padX = cell * 1.1, padY = cell * 1.2;
  const W = Math.round((cols + 3.2) * cell + padX * 2), H = Math.round(rows * cell + padY * 2);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#efefec'; g.fillRect(0, 0, W, H);
  // 纸的纤维
  for (let i = 0; i < W * H / 900; i++) { g.fillStyle = `rgba(90,86,80,${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 12, 1); }
  const x0 = W - padX - cell * 1.6;      // 正文第一行的右边
  g.strokeStyle = 'rgba(168,58,43,0.42)'; g.lineWidth = 1;
  for (let k = 0; k <= cols; k++) { const x = Math.round(x0 - k * cell) + 0.5; g.beginPath(); g.moveTo(x, padY - cell * 0.2); g.lineTo(x, H - padY + cell * 0.2); g.stroke(); }
  g.strokeRect(Math.round(x0 - cols * cell) + 0.5, Math.round(padY - cell * 0.2) + 0.5, cols * cell, rows * cell + cell * 0.4);
  // 题
  g.fillStyle = '#191613'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${cell * 0.62}px ${KAI}`;
  [...HEART_TITLE].forEach((ch, i) => g.fillText(ch, x0 + cell * 0.95, padY + cell * (i + 0.5)));
  for (let i = 0; i < TOTAL; i++) {
    const col = Math.floor(i / rows), row = i % rows, x = x0 - (col + 1) * cell, y = padY + row * cell;
    if (all[i]) drawStrokes(g, unpackChar(all[i]), x, y, cell);
    else { g.font = `${cell * 0.7}px ${KAI}`; g.fillStyle = 'rgba(40,36,32,0.16)'; g.fillText(HEART_TEXT[i], x + cell / 2, y + cell * 0.53); }
  }
  // 款：年月日 敬书，一枚印
  const t = today(), tail = `${t.lunar.replace(' ', '')}　敬书`;
  g.fillStyle = '#191613'; g.font = `${cell * 0.4}px ${KAI}`;
  const tx = x0 - cols * cell - cell * 0.9;
  [...tail].forEach((ch, i) => g.fillText(ch, tx, padY + cell * 2 + i * cell * 0.5));
  const sy = padY + cell * 2 + [...tail].length * cell * 0.5 + cell * 0.3, ss = cell * 0.62;
  g.fillStyle = '#a83a2b'; g.fillRect(tx - ss / 2, sy, ss, ss * 1.5);
  g.fillStyle = '#f4ebe2'; g.font = `600 ${ss * 0.6}px "Noto Serif SC", serif`;
  g.fillText('空', tx, sy + ss * 0.42); g.fillText('山', tx, sy + ss * 1.08);
  return c;
}

export default function Copy() {
  const at0 = useStore(saved, (s) => s.copy.at);
  const [at, setAt] = useState(Math.min(at0, TOTAL - 1));
  const [all, setAll] = useState<string[]>(loadAll);
  const [cell, setCell] = useState(320);
  const [roll, setRoll] = useState<string | null>(null);
  const [done, setDone] = useState(at0 >= TOTAL);
  const modelRef = useRef<HTMLCanvasElement>(null), inkRef = useRef<HTMLCanvasElement>(null);
  const brush = useRef<Brush | null>(null), timer = useRef(0), wrote = useRef(0), penAt = useRef<[number, number]>([0.5, 0.5]);
  const allRef = useRef(all); allRef.current = all;
  const atRef = useRef(at); atRef.current = at;

  useEffect(() => {
    const fit = () => setCell(Math.round(Math.max(150, Math.min(window.innerHeight * (window.innerHeight < 520 ? 0.5 : 0.54), window.innerWidth * (window.innerWidth < 640 ? 0.66 : 0.4), 430))));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  // 记进功课簿：这一回写了几个字
  useEffect(() => () => { if (wrote.current > 0) addEntry({ kind: 'copy', n: wrote.current }); }, []);

  const drawModel = useCallback(() => {
    const c = modelRef.current; if (!c) return;
    const g = c.getContext('2d')!, S = c.width;
    g.clearRect(0, 0, S, S);
    // 米字格
    g.strokeStyle = 'rgba(168,58,43,0.2)'; g.lineWidth = Math.max(1, S / 420); g.setLineDash([S / 60, S / 60]);
    g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.stroke();
    g.setLineDash([]);
    g.font = `${S * 0.76}px ${KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(168,58,43,0.3)';
    g.fillText(HEART_TEXT[atRef.current], S / 2, S * 0.535);
  }, []);

  useEffect(() => {
    const m = modelRef.current, i = inkRef.current; if (!m || !i) return;
    const d = Math.min(2, window.devicePixelRatio || 1), S = Math.round(cell * d);
    m.width = m.height = i.width = i.height = S;
    const b = new Brush(i);
    b.onStroke = (ph, len) => { if (ph === 'start') audio.play('brush', { dur: 0.3, vel: 0.5, space: 'near' }); else if (len > 0.25) audio.play('brush', { dur: Math.min(0.6, 0.15 + len * 0.3), vel: 0.35, space: 'near' }); };
    brush.current = b;
    // 这个字先前写过：把旧迹淡淡地留着？不，重来就是重写
    void document.fonts.load(`64px ${KAI}`, HEART_TEXT[atRef.current]).then(drawModel, drawModel);
    drawModel();
  }, [cell, at, drawModel]);

  const next = useCallback(() => {
    const b = brush.current; if (!b) return;
    clearTimeout(timer.current);
    const i = atRef.current, a = allRef.current.slice();
    if (b.strokes.length) { a[i] = packChar(b.strokes); wrote.current++; }
    setAll(a); saveAll(a);
    audio.play('paper', { vel: 0.4, space: 'near' });
    if (i + 1 >= TOTAL) { patch({ copy: { at: TOTAL, done: (saved.get().copy.done ?? 0) + 1 } }); setDone(true); audio.play('chime', { vel: 0.5 }); return; }
    patch({ copy: { at: i + 1, done: saved.get().copy.done ?? 0 } });
    setAt(i + 1);
  }, []);
  const redo = () => { clearTimeout(timer.current); brush.current?.clear(); };
  const restart = () => { if (!confirm('把这一卷收起，另起一卷从头写？')) return; const a = Array.from({ length: TOTAL }, () => ''); setAll(a); saveAll(a); patch({ copy: { at: 0, done: saved.get().copy.done ?? 0 } }); setAt(0); setDone(false); setRoll(null); };

  const pos = (e: React.PointerEvent) => { const r = inkRef.current!.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height] as const; };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault(); clearTimeout(timer.current);
    try { inkRef.current!.setPointerCapture(e.pointerId); } catch { /* 无妨 */ }
    const [x, y] = pos(e); brush.current?.begin(x, y, e.timeStamp, e.pointerType === 'pen' ? e.pressure : 0);
    // 案前的人也跟着落笔
    penAt.current = [x, y]; actCmd('pen', { x, y, down: true });
  };
  const onMove = (e: React.PointerEvent) => {
    const b = brush.current; if (!b?.writing) return;
    const evs = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent as PointerEvent];
    const r = inkRef.current!.getBoundingClientRect();
    for (const ev of evs) b.move((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height, ev.timeStamp, ev.pointerType === 'pen' ? ev.pressure : 0);
    penAt.current = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; actCmd('pen', { x: penAt.current[0], y: penAt.current[1], down: true });
  };
  const onUp = () => {
    const b = brush.current; if (!b?.writing) return;
    b.end();
    actCmd('pen', { x: penAt.current[0], y: penAt.current[1], down: false });
    // 停笔一会儿：盖住了范字的大半，就算写完，翻到下一个字
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const m = modelRef.current; if (!m || !brush.current || brush.current.writing) return;
      const c = brush.current.coverage(m);
      if (c.cover >= 0.4 && c.stray < 0.8) next();
    }, 1250);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const idx = HEART_INDEX[at], phrase = HEART[idx.para][idx.phrase];
  let first = at; while (first > 0 && HEART_INDEX[first - 1].para === idx.para && HEART_INDEX[first - 1].phrase === idx.phrase) first--;
  const ts = Math.max(22, Math.min(40, Math.floor((cell + 30) / Math.max(5, [...phrase].length)) - 4));
  const written = all.filter(Boolean).length;

  const openRoll = () => { const c = renderScroll(allRef.current, 56); setRoll(c.toDataURL('image/png')); audio.play('open', { vel: 0.5 }); };
  const saveImg = () => { if (!roll) return; const a = document.createElement('a'); a.href = roll; a.download = `空山抄经-${today().key}.png`; a.click(); };

  if (roll) {
    return (
      <div className="copy copy-roll">
        <div className="roll-wrap"><img src={roll} alt="你抄的《心经》" /></div>
        <div className="copy-tools">
          <button className="ink-btn" onClick={() => setRoll(null)}>{done ? '收起' : '接着写'}</button>
          <button className="ink-btn" onClick={saveImg}>存为图片</button>
          <button className="ink-btn is-soft" onClick={restart}>另起一卷</button>
        </div>
      </div>
    );
  }
  return (
    <div className="copy">
      <div className="copy-sheet">
        <header className="copy-head">
          <h4>{HEART_TITLE}</h4>
          <p>{done ? `一卷写完　共${cn(TOTAL)}字` : `第${cn(at + 1)}字　已写${cn(written)}`}</p>
        </header>
        {done ? (
          <div className="copy-done">
            <p>写完了。</p>
            <small>{HEART_BY}　{cn(TOTAL)}字　你写的这一卷</small>
          </div>
        ) : (
          <div className="copy-body">
            <div className="copy-cell" style={{ width: cell, height: cell }}>
              <canvas ref={modelRef} />
              <canvas ref={inkRef} className="copy-ink" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="copy-ink" />
            </div>
            <div className="copy-col" aria-hidden>
              {[...phrase].map((ch, i) => <Thumb key={first + i} data={first + i === at ? '' : all[first + i]} ch={ch} size={ts} here={first + i === at} />)}
            </div>
          </div>
        )}
        <div className="copy-tools">
          {!done && <button className="ink-btn is-soft" onClick={redo} data-testid="copy-redo">重写</button>}
          {!done && <button className="ink-btn" onClick={next} data-testid="copy-next">下一字</button>}
          <button className="ink-btn is-soft" onClick={openRoll} data-testid="copy-roll">看全卷</button>
        </div>
      </div>
    </div>
  );
}
