import { useEffect, useRef } from 'react';
import { NOTE_MS, ui, useStore } from './store';

/**
 * 画面下方浮着的几句话（世界说的：「得麦三捆」「王婶记下了你的好」）：直接写在画上，身后垫一团没有边的纸色——
 * 不是签，也不能点，不挡手（指针穿过去）。新的从下面浮起来，旧的往上让、淡下去；最多三句。
 * 下面当中有东西占着（提示、面板、大键、走法的提示……）时，浮在它们上面；
 * 右边立着一块高高的面板（宽屏做事时）时，挪到面板左边那一片的当中；竖着的手机上左下是摇杆与它上面的「疾」，话挪到它们右边那一片，
 * 不必为了让它们浮到半屏高（浮高了会压着「同游」那张纸、压着人）；无论怎样都不出屏。册页开着时先不出。
 */
const OCCUPY = '.act-foot, .panel, .hold-base, .act-done, .prompt.is-on, .walk-hint:not(.is-gone), .act-key, .copy-sheet, .copy-piece, .stick, .run-key, .sky-card';
/** 从上面垂下来的纸（「同游」那一张）：宽屏时在右边一条，话挪到它左边；窄屏时铺满一行宽，话只在它下沿底下出（放不下的旧话先不出） */
const HANG = '.tg-panel';
const shown = (o: HTMLElement) => { const cs = getComputedStyle(o); return cs.visibility !== 'hidden' && Number(cs.opacity) >= 0.05; };

export default function Notes() {
  const notes = useStore(ui, (s) => s.notes);
  const hidden = useStore(ui, (s) => !!s.sheet || s.phase !== 'roam');
  const ref = useRef<HTMLDivElement>(null);
  const any = notes.length > 0;
  useEffect(() => {
    if (!any) return;
    let raf = 0, n = 0;
    const fit = () => {
      raf = requestAnimationFrame(fit);
      if (n++ % 8) return;
      const el = ref.current;
      if (!el) return;
      const W = innerWidth, H = innerHeight, box = el.getBoundingClientRect(), half = Math.max(110, box.width / 2) + 8;
      const occ = [...document.querySelectorAll<HTMLElement>(OCCUPY)].map((o) => ({ o, r: o.getBoundingClientRect() })).filter(({ o, r }) => r.width >= 2 && r.height >= 2 && r.bottom >= H * 0.5 && shown(o));
      // 右边立着的高面板：话挪到它左边那一片（够宽才挪）
      let right = W;
      for (const { r } of occ) if (r.top < H * 0.35 && r.left > W * 0.3 && r.left < W / 2 + half) right = Math.min(right, r.left);
      if (right < W && right < 260) right = W;
      // 左下立着的摇杆、「疾」（竖着的手机）：话挪到它们右边那一片（够宽才挪）
      let left = 0;
      if (W <= 560) for (const { o, r } of occ) if (o.matches('.stick, .run-key') && r.right < W * 0.45) left = Math.max(left, r.right + 4);
      // 垂下来的纸
      let floor = 0;
      for (const o of document.querySelectorAll<HTMLElement>(HANG)) {
        const r = o.getBoundingClientRect();
        if (r.width < 2 || r.height < 2 || !shown(o)) continue;
        if (r.left > W * 0.3) right = Math.min(right, r.left - 8); else floor = Math.max(floor, r.bottom + 6);
      }
      if (right - left < 220) left = 0;
      const cx = (left + right) / 2;
      let top = Infinity;
      for (const { r } of occ) {
        if (r.left >= right - 1 || r.right <= left + 1) continue;
        if (r.left < cx + half && r.right > cx - half) top = Math.min(top, r.top);
      }
      // 上面没地方了（面板几乎顶满）：落回屏里，宁可压在面板的上沿
      const want = Number.isFinite(top) ? `${Math.round(Math.min(H - top + 12, H - box.height - 10))}px` : '';
      const r = right < W ? `${Math.round(W - right)}px` : '', l = left ? `${Math.round(left)}px` : '';
      if (el.style.bottom !== want) el.style.bottom = want;
      if (el.style.right !== r) el.style.right = r;
      if (el.style.left !== l) el.style.left = l;
      // 话落到了垂下来的纸上：那几句（多半是旧的、在上面的）先不出
      for (const c of el.children as HTMLCollectionOf<HTMLElement>) {
        const v = floor > 0 && c.getBoundingClientRect().top < floor ? 'hidden' : '';
        if (c.style.visibility !== v) c.style.visibility = v;
      }
    };
    raf = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(raf);
  }, [any]);
  return (
    <div className={`notes${hidden ? ' is-hidden' : ''}`} ref={ref} aria-live="polite" data-testid="notes" style={{ ['--note-ms' as string]: `${NOTE_MS}ms` }}>
      {notes.map((x) => <p key={x.id} className="note" data-kind={x.kind ?? undefined}><span>{x.text}</span></p>)}
    </div>
  );
}
