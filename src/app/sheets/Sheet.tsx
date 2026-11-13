import { useEffect, useRef, type ReactNode } from 'react';
import { useBrush } from '../face';
import { openSheet } from '../ks';

/**
 * 一页册子：压在画上的一片磨砂。电脑上靠右，手机上从底下升起来。
 * 题名用毛笔字，下面一道细线；内容放不下就在里面滚（不裁）。点画面别处、按 Esc、点「收」都收起。
 */
export default function Sheet({ title, sub, wide, children }: { title: string; sub?: ReactNode; wide?: boolean; children: ReactNode }) {
  const brush = useBrush(title);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') openSheet(null); };
    window.addEventListener('keydown', k);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <>
      <div className="sheet-back" onClick={() => openSheet(null)} />
      <aside ref={ref} className={`sheet${wide ? ' sheet-wide' : ''}`} role="dialog" aria-label={title} tabIndex={-1}>
        <header className="sheet-head">
          <h3 className={brush ? '' : 'is-kai'}>{title}</h3>
          {sub ? <p className="sheet-sub">{sub}</p> : <span />}
          <button className="sheet-close" onClick={() => openSheet(null)} data-testid="sheet-close" aria-label="收起">收</button>
        </header>
        <div className="sheet-body">{children}</div>
      </aside>
    </>
  );
}
