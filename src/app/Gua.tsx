import { useMemo, type CSSProperties } from 'react';

/**
 * 卦画：六爻（或三爻）自下而上，一笔一笔。阳爻一横，阴爻断成两截；
 * 每一笔两头略重、中间略提、微微不平，各不一样——是写出来的，不是印的。
 * draw 为真时，一爻一爻自下而上写出来（象卡上用）。大小由样式里的 width 定。
 */
const W = 30, PITCH = 5.6, THICK = 2.5;
const f = (v: number) => v.toFixed(2);
function rng(seed: number) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
/** 一横：x0 到 x1，中线在 y */
function stroke(x0: number, x1: number, y: number, r: () => number): string {
  const h = THICK / 2, m = (x0 + x1) / 2, tilt = (r() - 0.5) * 0.5;
  const hl = h * (0.98 + r() * 0.26), hr = h * (0.8 + r() * 0.3), a = (r() - 0.5) * 0.7, b = (r() - 0.5) * 0.7;
  return `M${f(x0)} ${f(y - hl + tilt)}Q${f(m)} ${f(y - h * 0.78 + a)} ${f(x1)} ${f(y - hr - tilt)}Q${f(x1 + hr * 0.95)} ${f(y - tilt)} ${f(x1)} ${f(y + hr - tilt)}Q${f(m)} ${f(y + h * 0.84 + b)} ${f(x0)} ${f(y + hl + tilt)}Q${f(x0 - hl * 1.15)} ${f(y + tilt)} ${f(x0)} ${f(y - hl + tilt)}Z`;
}

export function GuaGlyph({ lines, className, draw, label }: { lines: number[]; className?: string; draw?: boolean; label?: string }) {
  const key = lines.join('');
  const { rows, H } = useMemo(() => {
    const n = lines.length, H = PITCH * n, r = rng(parseInt(key || '0', 2) * 97 + n * 13 + 5);
    const rows = lines.map((v, i) => {
      const y = H - PITCH * (i + 0.5);
      return v ? [stroke(2.6, W - 2.6, y, r)] : [stroke(2.6, W / 2 - 2.7, y, r), stroke(W / 2 + 2.7, W - 2.6, y, r)];
    });
    return { rows, H };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <svg className={`gua${draw ? ' gua-draw' : ''}${className ? ' ' + className : ''}`} viewBox={`0 0 ${W} ${f(H)}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {rows.map((ps, i) => <g key={i} style={{ ['--i' as string]: i } as CSSProperties}>{ps.map((d, j) => <path key={j} d={d} />)}</g>)}
    </svg>
  );
}
