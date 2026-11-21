import { useBrush } from './face';
import { closeSky } from './ks';
import { ui, useStore } from './store';

/**
 * 星笺：夜里在外头点了天上一处（星、星官的连线、五星、月、天汉），浮出的一小页——题是那一处的名字（毛笔字），
 * 下面一行是它属于哪一垣哪一宿、此刻在哪个方向多高；再下面是古书里的一两句（楷字，出处在右）与本应用写的白话（小一号的宋字）。
 * 天上那一处同时点亮（连线描出来、旁边写着名字）。电脑上浮在下面当中，手机上在上头（下面有摇杆）。
 * 走开、进屋、做起事来、天亮，世界会把它收起；也可以点「收」。
 */
export default function SkyCard() {
  const c = useStore(ui, (s) => s.sky);
  const act = useStore(ui, (s) => s.act), sheet = useStore(ui, (s) => s.sheet);
  const brush = useBrush(c?.title ?? '');
  if (!c || act || sheet) return null;
  return (
    <aside className="sky-card" role="dialog" aria-label={c.title} data-testid="sky-card" data-kind={c.kind} key={c.title + c.hint}>
      <header className="sky-head">
        <h3 className={brush ? '' : 'is-kai'}>{c.title}</h3>
        <button className="sky-close" onClick={closeSky} aria-label="收起星笺" data-testid="sky-close">收</button>
      </header>
      <p className="sky-hint">{c.hint}</p>
      {c.lines && c.lines.length > 0
        ? <p className="sky-lines">{c.lines.map((l, i) => <span key={i}>{l}</span>)}</p>
        : c.text && <p className="sky-text">{c.text}</p>}
      {c.source && <p className="sky-source">——{c.source}</p>}
      {c.gloss && <div className="sky-gloss">{c.gloss.split('\n').map((g, i) => <p key={i}>{g}</p>)}</div>}
    </aside>
  );
}
