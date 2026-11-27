import { useEffect, useState } from 'react';
import { useBrush } from '../face';
import { patch, saved, useStore } from '../store';

/**
 * 「初到」：头一回进来、画从雾里显出来之后，一张纸上的五页小字——这是哪里、怎么走、怎么做事、时辰会走（今天能做什么在哪里找）、声音（大小在哪里调）。
 * 可以一页一页翻，也可以「不看了」；看过（或说了不看）就记下，以后不再自己出来。「关于」「今日」里可以再看一遍（发一个 ks:guide 事件）。
 * 开着时画面下方的走法提示先让开（body 上挂一个 data-guide，值是第几页）；右上那一条浮在纸的上面，说到「册」的那两页，「册」上那一圈墨环转成朱色。
 */
const touch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
interface Page { title: string; lines: string[]; more?: string }
/** net：园里能遇见别的游人（右上有「同游」那一枚）时，「做」那一页多一句 */
const pages = (t: boolean, net = false): Page[] => [
  { title: '初到', lines: ['这里是邵雍的安乐窝：洛阳城南，伊水北岸。主人出门访友去了。', '你是外乡来的客人，借住在这里，替他照看草堂、园子和借你种的两畦地。慢慢走，慢慢看，这里不争输赢，也没有输赢。'] },
  {
    title: '行',
    lines: t
      ? ['左下的环推着走；拖动画面，转看四周；点地上哪里，就走过去。', '「疾」点一下跑起来，再点一下慢下来走。']
      : ['W A S D 走；拖动画面，转看四周；点地上哪里，就走过去。', '按住 Shift 跑；点一下 Shift，一直跑。'],
  },
  {
    title: '做',
    lines: t
      ? ['走近有名字的东西，点右下那一方印，就做起来：读书、煮茶、浇菊、种地、观星，和村里人说说话……', '做完了点右上的「毕」。']
      : ['走近有名字的东西，按 E（或点那个名字），就做起来：读书、煮茶、浇菊、种地、观星，和村里人说说话……', '做完了点「毕」，或按 Esc。'],
    ...(net ? { more: '园里也会遇见别的游人：走到跟前，可以作揖、说一句话（右上的「同游」）。' } : {}),
  },
  { title: '时', lines: ['时辰会走：画里一个钟头，这里两分钟（「天时」里可以改）。天黑了，屋里点上灯；晴夜往上拖，抬头看星。', '今天能做什么：点右上角写着「第几日」的那一格，或「册」里的「今日」。'] },
  // 声音：初来时先放得轻（store 里总音量的默认），这一页告诉人在哪里调
  { title: '听', lines: ['这里的声音都是现算出来的：风、水、鸟、虫，村里的鸡犬人家，跟着你走到哪里、什么时辰、什么天气自己起落。', '嫌轻、嫌响，或想换一种（山居、纯自然、冥想、人间、静）：点右上的「册」，翻到「声与画」。'] },
];

export default function Guide() {
  const guided = useStore(saved, (s) => s.guided);
  const [open, setOpen] = useState(false), [i, setI] = useState(0);
  const [t] = useState(touch);
  // 右上有没有「同游」：每回打开时看一眼（连不上中转、或自动检查时不出那一枚）
  const [net, setNet] = useState(false);
  const P = pages(t, net), p = P[Math.min(i, P.length - 1)];
  const brush = useBrush(p.title);
  // 头一回：画显出来以后再出（雾散、处名浮出之后）。跳过题名页直接进来的（网址带 auto，调试、自动检查用）不自己出
  useEffect(() => {
    if (guided || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('auto'))) return;
    const a = setTimeout(() => { setNet(!!document.querySelector('.tg-key')); setI(0); setOpen(true); }, 3600);
    return () => clearTimeout(a);
  }, [guided]);
  // 别处要再看一遍
  useEffect(() => {
    const again = () => { setNet(!!document.querySelector('.tg-key')); setI(0); setOpen(true); };
    window.addEventListener('ks:guide', again);
    return () => window.removeEventListener('ks:guide', again);
  }, []);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (open) document.body.dataset.guide = String(i); else delete document.body.dataset.guide;
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  });
  const close = () => { setOpen(false); if (!saved.get().guided) patch({ guided: true }); };
  const next = () => { if (i >= P.length - 1) close(); else setI(i + 1); };
  if (!open) return null;
  const last = i >= P.length - 1;
  return (
    <div className="guide" role="dialog" aria-label={`初到：${p.title}`} data-testid="guide">
      <div className="guide-back" onClick={close} />
      <section className="guide-card" key={i}>
        <header className="guide-head">
          <h3 className={brush ? '' : 'is-kai'}>{p.title}</h3>
          <ol className="guide-dots" aria-label={`第${i + 1}页，共${P.length}页`}>
            {P.map((_, j) => <li key={j} className={j === i ? 'is-on' : j < i ? 'is-past' : ''} />)}
          </ol>
        </header>
        <div className="guide-body">{[...p.lines, ...(p.more ? [p.more] : [])].map((l, j) => <p key={j}>{l}</p>)}</div>
        <footer className="guide-foot">
          {i > 0 ? <button className="link" onClick={() => setI(i - 1)} data-testid="guide-prev">上一页</button> : <button className="link" onClick={close} data-testid="guide-skip">不看了</button>}
          <span className="well"><button className="key is-main" onClick={next} data-testid="guide-next">{last ? '开始走' : '下一页'}</button></span>
        </footer>
      </section>
    </div>
  );
}
