import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn, today } from '../calendar';
import { actCmd } from '../ks';
import * as snd from '../sound';
import { WORDS } from '../texts';
import { Brush, drawStrokes, packChar, unpackChar } from './brush';

/**
 * 写字：一张纸，当前这个字淡淡地印在米字格里（描红），照着写。写完停一停，自己翻到下一个字。
 * 写什么由那件事给（state.model：一行一行的字，标点不写）；写过的字按你的笔迹留着。
 * 整篇写完，告诉那件事一声（cmd('written')），并把全篇——竖排、自右而左，落年月与一方印——留下：
 * 那件事接着把这两句显出来时，面板上用的就是你自己的笔迹（见 Panel），可以存成图。字写得像不像不评。
 */
const KEY = 'anlewo:write:v1';
const KAI = '"LXGW WenKai", "Kaiti SC", "STKaiti", "KaiTi", serif';
const INK = '#1c1a17', ZHU = '177, 57, 43';
const isHan = (c: string) => /\p{Script=Han}/u.test(c);
/** 上回没写完的那一篇（同一篇字才接着写） */
function load(key: string, total: number): string[] {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { key?: string; chars?: string[] } | null;
    if (o && o.key === key && Array.isArray(o.chars) && o.chars.filter(Boolean).length < total) return Array.from({ length: total }, (_, i) => o.chars![i] ?? '');
  } catch { /* 没有就从头写 */ }
  return Array.from({ length: total }, () => '');
}
const save = (key: string, chars: string[]) => { try { localStorage.setItem(KEY, JSON.stringify({ key, chars })); } catch { /* 存不下：这一遍只留在眼前 */ } };

/** 最近写完的那一篇（只在这一回来访里记着）：是哪些字、画成的图 */
let last: { key: string; url: string } | null = null;
/** 这几行字（只算汉字，行间用 / 隔开）是不是方才亲手写的那一篇；是就给那张图 */
export const pieceFor = (key: string): string | null => (last && last.key === key ? last.url : null);
export function savePiece(url: string) { const a = document.createElement('a'); a.href = url; a.download = `${WORDS.title}-${today().key}.png`; a.click(); }

function Thumb({ data, ch, size, here }: { data: string; ch: string; size: number; here?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const d = Math.min(2, window.devicePixelRatio || 1); c.width = c.height = Math.round(size * d);
    const g = c.getContext('2d')!; g.clearRect(0, 0, c.width, c.height);
    if (data) drawStrokes(g, unpackChar(data), 0, 0, c.width, INK);
    else { g.font = `${c.width * 0.74}px ${KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = here ? `rgba(${ZHU}, 0.55)` : 'rgba(40, 36, 32, 0.22)'; g.fillText(ch, c.width / 2, c.width * 0.53); }
  }, [data, ch, size, here]);
  return <canvas ref={ref} className={`copy-thumb${here ? ' is-here' : ''}`} style={{ width: size, height: size }} />;
}

/** 全篇：一行字一列，自右而左；右边一列小字是题，左边落年月与印 */
function renderPiece(cols: string[][], all: string[], head: string, cell: number): HTMLCanvasElement {
  const rows = Math.max(...cols.map((c) => c.length), 4), pad = cell * 0.9, gap = cell * 0.28;
  const W = Math.round(cols.length * (cell + gap) + cell * 2.3 + pad * 2), H = Math.round(rows * cell + pad * 2);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f1e9'; g.fillRect(0, 0, W, H);
  // 纸的纤维
  for (let i = 0; i < (W * H) / 900; i++) { g.fillStyle = `rgba(96, 88, 76, ${Math.random() * 0.05})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 12, 1); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  // 题
  let x = W - pad - cell * 0.36;
  if (head) { g.fillStyle = INK; g.font = `${cell * 0.34}px ${KAI}`; [...head].forEach((ch, i) => g.fillText(ch, x, pad + cell * 0.3 + i * cell * 0.42)); }
  x -= cell * 0.44;
  let k = 0;
  for (const col of cols) {
    x -= cell + gap;
    col.forEach((ch, r) => {
      const y = pad + r * cell, s = all[k++];
      if (s) drawStrokes(g, unpackChar(s), x, y, cell, INK);
      else { g.font = `${cell * 0.7}px ${KAI}`; g.fillStyle = 'rgba(40, 36, 32, 0.16)'; g.fillText(ch, x + cell / 2, y + cell * 0.53); }
    });
  }
  // 款：年月，一方印
  const tail = `${today().lunar.replace(' ', '')}　书`, tx = x - cell * 0.46;
  g.fillStyle = INK; g.font = `${cell * 0.3}px ${KAI}`;
  [...tail].forEach((ch, i) => g.fillText(ch, tx, pad + cell * 0.5 + i * cell * 0.37));
  const seal = [...WORDS.seal].slice(0, 2), ss = cell * 0.46, sy = pad + cell * 0.5 + [...tail].length * cell * 0.37 + cell * 0.08;
  g.fillStyle = `rgb(${ZHU})`; g.fillRect(tx - ss / 2, sy, ss, ss * (seal.length > 1 ? 1.62 : 1));
  g.fillStyle = '#fbf4ec'; g.font = `600 ${ss * 0.62}px "Noto Serif SC", serif`;
  seal.forEach((ch, i) => g.fillText(ch, tx, sy + ss * (0.45 + i * 0.72)));
  return c;
}

export default function Copy({ model, head, hint }: { model: string[]; /** 写的是哪一首（纸上的题） */ head: string; /** 一句提示（纸脚的小字） */ hint?: string }) {
  const text = model.join('\n');
  const { cols, flat, colOf } = useMemo(() => {
    const cols = text.split('\n').map((l) => [...l].filter(isHan)).filter((c) => c.length > 0), colOf: number[] = [];
    cols.forEach((c, i) => c.forEach(() => colOf.push(i)));
    return { cols, flat: cols.flat(), colOf };
  }, [text]);
  const total = flat.length;
  const [all, setAll] = useState<string[]>(() => load(text, total));
  const [at, setAt] = useState(() => { const i = all.findIndex((s) => !s); return i < 0 ? 0 : i; });
  const [cell, setCell] = useState(300);
  const [piece, setPiece] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const modelRef = useRef<HTMLCanvasElement>(null), inkRef = useRef<HTMLCanvasElement>(null);
  const brush = useRef<Brush | null>(null), timer = useRef(0), penAt = useRef<[number, number]>([0.5, 0.5]);
  const allRef = useRef(all); allRef.current = all;
  const atRef = useRef(at); atRef.current = at;

  useEffect(() => {
    const fit = () => setCell(Math.round(Math.max(150, Math.min(window.innerHeight * 0.5, window.innerWidth * (window.innerWidth < 640 ? 0.64 : 0.36), 400))));
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const drawModel = useCallback(() => {
    const c = modelRef.current; if (!c) return;
    const g = c.getContext('2d')!, S = c.width;
    g.clearRect(0, 0, S, S);
    // 米字格
    g.strokeStyle = `rgba(${ZHU}, 0.22)`; g.lineWidth = Math.max(1, S / 420); g.setLineDash([S / 60, S / 60]);
    g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.stroke();
    g.setLineDash([]);
    g.font = `${S * 0.76}px ${KAI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = `rgba(${ZHU}, 0.3)`;
    g.fillText(flat[atRef.current] ?? '', S / 2, S * 0.535);
  }, [flat]);

  useEffect(() => {
    const m = modelRef.current, i = inkRef.current; if (!m || !i) return;
    const d = Math.min(2, window.devicePixelRatio || 1), S = Math.round(cell * d);
    m.width = m.height = i.width = i.height = S;
    const b = new Brush(i);
    b.onStroke = (ph, len) => { if (ph === 'start') snd.play('brush', { dur: 0.3, vel: 0.5, space: 'near' }); else if (len > 0.25) snd.play('brush', { dur: Math.min(0.6, 0.15 + len * 0.3), vel: 0.35, space: 'near' }); };
    brush.current = b;
    void document.fonts.load(`64px ${KAI}`, flat[atRef.current] ?? '').then(drawModel, drawModel);
    drawModel();
  }, [cell, at, done, piece, drawModel, flat]);

  const next = useCallback(() => {
    const b = brush.current; if (!b) return;
    clearTimeout(timer.current);
    const i = atRef.current, a = allRef.current.slice();
    if (b.strokes.length) a[i] = packChar(b.strokes);
    setAll(a); save(text, a);
    snd.play('paper', { vel: 0.4, space: 'near' });
    if (i + 1 >= total) {
      // 整篇写完：留下全篇的样子，再告诉那件事（它多半立刻换成别的面板，这张纸就收起来了）
      const url = a.some(Boolean) ? renderPiece(cols, a, head, 76).toDataURL('image/png') : null;
      last = url ? { key: cols.map((c) => c.join('')).join('/'), url } : null;
      setDone(true); setPiece(url);
      actCmd('written', { chars: a.filter(Boolean).length, total });
      return;
    }
    setAt(i + 1);
  }, [cols, head, text, total]);
  const redo = () => { clearTimeout(timer.current); brush.current?.clear(); };
  const again = () => { const a = Array.from({ length: total }, () => ''); setAll(a); save(text, a); setAt(0); setDone(false); setPiece(null); };

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

  if (total === 0) return null;
  const col = cols[colOf[at]] ?? [], first = colOf.indexOf(colOf[at]);
  const ts = Math.max(22, Math.min(40, Math.floor((cell + 30) / Math.max(5, col.length)) - 4));
  const written = all.filter(Boolean).length;
  const look = () => { setPiece(renderPiece(cols, allRef.current, head, 76).toDataURL('image/png')); snd.play('open', { vel: 0.5 }); };

  if (piece) {
    return (
      <div className="copy copy-piece" data-testid="copy-piece">
        <div className="piece-wrap"><img src={piece} alt="你写的这一篇" /></div>
        <div className="copy-tools">
          {!done && <button className="ink-btn" onClick={() => setPiece(null)}>接着写</button>}
          <button className="ink-btn" onClick={() => savePiece(piece)}>存为图片</button>
          {done && <button className="ink-btn is-soft" onClick={again}>再写一遍</button>}
        </div>
      </div>
    );
  }
  return (
    <div className="copy">
      <div className="copy-sheet">
        <header className="copy-head">
          <h4>{head}</h4>
          <p>第{cn(at + 1)}字　共{cn(total)}字</p>
        </header>
        <div className="copy-body">
          <div className="copy-cell" style={{ width: cell, height: cell }}>
            <canvas ref={modelRef} />
            <canvas ref={inkRef} className="copy-ink" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} data-testid="copy-ink" />
          </div>
          <div className="copy-col" aria-hidden>
            {col.map((ch, i) => <Thumb key={first + i} data={first + i === at ? '' : all[first + i]} ch={ch} size={ts} here={first + i === at} />)}
          </div>
        </div>
        <div className="copy-tools">
          <button className="ink-btn is-soft" onClick={redo} data-testid="copy-redo">重写</button>
          <button className="ink-btn" onClick={next} data-testid="copy-next">{at + 1 >= total ? '写完' : '下一字'}</button>
          {written > 0 && <button className="ink-btn is-soft" onClick={look} data-testid="copy-look">看全篇</button>}
        </div>
        {hint && <p className="copy-hint">{hint}</p>}
      </div>
    </div>
  );
}
