import type { AttireItem } from '../../data/attire';

/**
 * 衣饰的小画：每一样一幅（衣、冠髻、簪、佩），像图录里的白描加一层淡彩——线是墨（随昼夜的墨色），色是那一样自己的颜色。
 * 只在册页上用；穿在身上的样子看画里的人（镜头会转到正面、凑近头上或腰间）。
 */
const css = (c: readonly number[] | undefined, a = 1) => (c ? `rgba(${Math.round(255 * c[0])}, ${Math.round(255 * c[1])}, ${Math.round(255 * c[2])}, ${a})` : 'none');
const INK = 'var(--ink)';

function Robe({ it }: { it: AttireItem }) {
  const L = it.look ?? {}, c1 = css(it.swatch), c2 = css(it.swatch2 ?? it.swatch);
  const skirt = !!L.skirt, coat = !!L.coat, short = (L.hem ?? 0.085) > 0.3, collar = L.collar ?? 'cross';
  const hemY = short ? 31 : 42;
  // 衣身与两袖（宽袖垂着）
  const body = `M18 9 L24 8 L30 9 L39 14 C41.5 19 42.5 24 42 ${short ? 26 : 29} L36.5 ${short ? 27 : 30} L34.5 21 L35 ${hemY} L13 ${hemY} L13.5 21 L11.5 ${short ? 27 : 30} L6 ${short ? 26 : 29} C5.5 24 6.5 19 9 14 Z`;
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="ai">
      <path d={body} fill={coat ? css(L.coat) : c1} stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
      {/* 裙：腰以下另一色 */}
      {skirt && !coat && <path d={`M13.4 24 L34.6 24 L35 ${hemY} L13 ${hemY} Z`} fill={css(L.skirt)} stroke={INK} strokeWidth="1" />}
      {/* 褙子：下摆以下露出里面的长衣或裙 */}
      {coat && <path d={`M13.2 34 L34.8 34 L35 ${hemY} L13 ${hemY} Z`} fill={skirt ? css(L.skirt) : c2} stroke={INK} strokeWidth="1" />}
      {coat && <path d="M22.6 11 L22.6 34 M25.4 11 L25.4 34" stroke={css(L.trim) === 'none' ? INK : css(L.trim)} strokeWidth="1.6" />}
      {coat && <path d="M23 12 L25 12 L25 33 L23 33 Z" fill={css(L.robe ?? [0.96, 0.96, 0.96])} />}
      {collar === 'cross' && <path d="M19 9.5 L27 18.5 M29 9.5 L21.5 19.5" stroke={css(L.trim) === 'none' ? INK : css(L.trim)} strokeWidth="1.7" fill="none" />}
      {collar === 'round' && <path d="M19.5 9.6 C20 13.5 28 13.5 28.5 9.6" stroke={css(L.trim) === 'none' ? INK : css(L.trim)} strokeWidth="1.8" fill="none" />}
      {/* 襕：膝下一道 */}
      {L.lan && <path d="M13.1 33 L34.9 33" stroke={css(L.trim)} strokeWidth="1.6" />}
      {/* 带 */}
      {!coat && <path d="M13.6 22.6 L34.4 22.6" stroke={css(L.sash)} strokeWidth="1.5" />}
      {/* 下摆的边、袖口的边 */}
      <path d={`M13 ${hemY - 0.6} L35 ${hemY - 0.6}`} stroke={css(L.trim) === 'none' ? INK : css(L.trim)} strokeWidth="1.2" />
      <path d={`M6.1 ${short ? 25.4 : 28.4} L11.6 ${short ? 26.4 : 29.4} M41.9 ${short ? 25.4 : 28.4} L36.4 ${short ? 26.4 : 29.4}`} stroke={css(L.trim) === 'none' ? INK : css(L.trim)} strokeWidth="1.4" />
      {short && <path d="M18 31 L18 42 M30 31 L30 42" stroke={css(L.leg ?? [0.4, 0.42, 0.46])} strokeWidth="4" strokeLinecap="round" />}
    </svg>
  );
}

/** 头（淡淡一个轮廓）＋冠、髻 */
function Hat({ it }: { it: AttireItem }) {
  const h = it.look?.hat ?? 'none', c = css(it.swatch), hair = 'rgba(46, 44, 46, 0.92)';
  const head = <ellipse cx="24" cy="30" rx="9" ry="10.5" fill="rgba(250, 236, 222, 0.9)" stroke={INK} strokeWidth="1" />;
  const hairCap = <path d="M15.2 28 C15 20 19 17.5 24 17.5 C29 17.5 33 20 32.8 28 C30 24.5 27 23.5 24 23.5 C21 23.5 18 24.5 15.2 28 Z" fill={hair} />;
  switch (h) {
    case 'jin': return <svg viewBox="0 0 48 48" aria-hidden className="ai">{head}<path d="M14.6 28.5 C14 18 18.5 14 24 14 C29.5 14 34 18 33.4 28.5 C30 25 27 24 24 24 C21 24 18 25 14.6 28.5 Z" fill={c} stroke={INK} strokeWidth="1" /><path d="M20 15 C21 11.5 27 11.5 28 15" fill={c} stroke={INK} strokeWidth="1" /><path d="M30 30 C33 34 34 38 33 42 M28 31 C30 35 30.5 39 29.5 42" stroke={c} strokeWidth="1.8" fill="none" /></svg>;
    case 'futou': return <svg viewBox="0 0 48 48" aria-hidden className="ai">{head}<path d="M14.8 27 C14.4 19 18.5 15.5 24 15.5 C29.5 15.5 33.6 19 33.2 27 C30 24 27 23.2 24 23.2 C21 23.2 18 24 14.8 27 Z" fill={c} stroke={INK} strokeWidth="1" /><ellipse cx="25.5" cy="14.6" rx="6" ry="5" fill={c} stroke={INK} strokeWidth="1" /><path d="M31 25 C36 27 39 31 40 37 M17 25 C12 27 9 31 8 37" stroke={c} strokeWidth="2.4" fill="none" strokeLinecap="round" /></svg>;
    case 'dongpo': return <svg viewBox="0 0 48 48" aria-hidden className="ai">{head}{hairCap}<rect x="16.5" y="6" width="15" height="17" fill={c} stroke={INK} strokeWidth="1" /><path d="M14 12 L24 9.5 L34 12 L34 23 L14 23 Z" fill={css(it.swatch, 0.82)} stroke={INK} strokeWidth="1" /><path d="M24 9.5 L24 23" stroke="rgba(255,255,255,0.35)" strokeWidth="1" /></svg>;
    case 'guan': return <svg viewBox="0 0 48 48" aria-hidden className="ai">{head}{hairCap}<ellipse cx="24" cy="17.5" rx="5" ry="3.6" fill={hair} /><path d="M19.5 17 C19.5 11 22 8 24 7.5 C26 8 28.5 11 28.5 17 Z" fill={c} stroke={INK} strokeWidth="1" /><path d="M14 13 L34 13" stroke="rgba(236, 228, 204, 1)" strokeWidth="1.4" /></svg>;
    case 'li': return <svg viewBox="0 0 48 48" aria-hidden className="ai">{head}<path d="M4 25 L24 9 L44 25 C38 27 10 27 4 25 Z" fill={c} stroke={INK} strokeWidth="1" /><path d="M9 22 L39 22 M14 18 L34 18 M19 14 L29 14" stroke={INK} strokeWidth="0.6" opacity="0.5" /></svg>;
    case 'bun': return <svg viewBox="0 0 48 48" aria-hidden className="ai">{head}{hairCap}<ellipse cx="29" cy="17" rx="6.5" ry="5.4" fill={hair} /><path d="M20 15 L38 19.5" stroke="rgba(230, 220, 184, 1)" strokeWidth="1.3" /></svg>;
    case 'baoji': return <svg viewBox="0 0 48 48" aria-hidden className="ai">{head}{hairCap}<ellipse cx="25" cy="16.5" rx="8" ry="6" fill={c} stroke={INK} strokeWidth="1" /><path d="M22 13 L19 9.5 M26 13 L29.5 9.5" stroke={c} strokeWidth="2.4" strokeLinecap="round" /><circle cx="24" cy="13.2" r="1.8" fill={css(it.swatch, 0.8)} stroke={INK} strokeWidth="0.8" /></svg>;
    case 'gaoji': return <svg viewBox="0 0 48 48" aria-hidden className="ai">{head}{hairCap}<ellipse cx="24" cy="18" rx="7" ry="3.8" fill={hair} /><path d="M19.5 17.5 C18.5 8 21 4.5 24 4.5 C27 4.5 29.5 8 28.5 17.5 L26 17 C26.5 10 25.5 7.5 24 7.5 C22.5 7.5 21.5 10 22 17 Z" fill={hair} /><path d="M19 20 C21 18.6 27 18.6 29 20" stroke="rgba(236, 226, 200, 1)" strokeWidth="1.6" fill="none" /></svg>;
    case 'huaguan': {
      const f = css(it.look?.flower ?? it.swatch), f2 = css([0.98, 0.93, 0.86]), leaf = css(it.swatch2 ?? [0.4, 0.55, 0.4]);
      const pts: Array<[number, number, number, string]> = [[13, 18, 3.2, f2], [17.5, 13, 3.8, f], [24, 10.5, 4.4, f], [30.5, 13, 3.8, f], [35, 18, 3.2, f2]];
      return <svg viewBox="0 0 48 48" aria-hidden className="ai">{head}{hairCap}<ellipse cx="24" cy="18.5" rx="7" ry="4" fill={hair} /><path d="M14 20 C19 16 29 16 34 20" stroke="rgba(209, 184, 128, 1)" strokeWidth="1.4" fill="none" />{pts.map(([x, y, r, col], i) => <g key={i}><circle cx={x} cy={y} r={r} fill={col} stroke={INK} strokeWidth="0.7" /><circle cx={x} cy={y} r={r * 0.32} fill="rgba(240, 206, 110, 1)" /></g>)}<path d="M20.5 15.5 C19.5 17 18.5 17.5 17 17.4 M27.5 15.5 C28.5 17 29.5 17.5 31 17.4" stroke={leaf} strokeWidth="1.6" fill="none" /></svg>;
    }
    default: return <svg viewBox="0 0 48 48" aria-hidden className="ai">{head}{hairCap}<ellipse cx="24" cy="16.5" rx="5" ry="4" fill={hair} /><path d="M19.4 18 C21 19.2 27 19.2 28.6 18" stroke={css(it.swatch2 ?? [0.6, 0.66, 0.76])} strokeWidth="1.4" fill="none" /></svg>;
  }
}

function Orn({ it }: { it: AttireItem }) {
  const c = css(it.swatch), c2 = css(it.swatch2 ?? it.swatch), cord = 'rgba(184, 71, 61, 1)';
  switch (it.orn) {
    case 'zanYin': case 'zanYu': case 'zanJin': return (
      <svg viewBox="0 0 48 48" aria-hidden className="ai">
        <path d="M9 40 L37 12" stroke={c} strokeWidth="2.6" strokeLinecap="round" /><path d="M9 40 L37 12" stroke={INK} strokeWidth="0.6" opacity="0.5" />
        {it.orn === 'zanJin' ? [0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return <ellipse key={i} cx={38.5 + Math.cos(a) * 3.2} cy={10.5 + Math.sin(a) * 3.2} rx="2.6" ry="1.7" transform={`rotate(${(a * 180) / Math.PI} ${38.5 + Math.cos(a) * 3.2} ${10.5 + Math.sin(a) * 3.2})`} fill={c} stroke={INK} strokeWidth="0.6" />; })
          : it.orn === 'zanYu' ? <path d="M35 14 C33 9 37 6.5 40 8.5 C42.5 10.5 41 14 38.5 13.5" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" />
            : <circle cx="38.5" cy="10.5" r="4" fill={c} stroke={INK} strokeWidth="0.8" />}
        {it.orn === 'zanJin' && <circle cx="38.5" cy="10.5" r="1.6" fill="rgba(200, 150, 60, 1)" />}
      </svg>);
    case 'buyao': return (
      <svg viewBox="0 0 48 48" aria-hidden className="ai">
        <path d="M6 30 L34 10" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
        {[0, 1, 2, 3, 4].map((i) => { const a = (i / 5) * Math.PI * 2; return <ellipse key={i} cx={36 + Math.cos(a) * 3} cy={8.5 + Math.sin(a) * 3} rx="2.4" ry="1.6" transform={`rotate(${(a * 180) / Math.PI} ${36 + Math.cos(a) * 3} ${8.5 + Math.sin(a) * 3})`} fill={c} stroke={INK} strokeWidth="0.6" />; })}
        <path d="M36 12 L36 34" stroke={c} strokeWidth="0.9" />
        {[17, 23, 29].map((y, i) => <circle key={y} cx="36" cy={y} r="2" fill={i === 1 ? 'rgba(204, 230, 212, 1)' : c2} stroke={INK} strokeWidth="0.6" />)}
        <path d="M36 34 C33 37 33 41 36 43 C39 41 39 37 36 34 Z" fill={c} stroke={INK} strokeWidth="0.7" />
      </svg>);
    case 'huazan': return (
      <svg viewBox="0 0 48 48" aria-hidden className="ai">
        <path d="M24 26 C18 34 13 38 8 40 M24 26 C30 32 36 34 41 34" stroke={c2} strokeWidth="2" fill="none" strokeLinecap="round" />
        {[0, 1, 2, 3, 4].map((i) => { const a = -Math.PI / 2 + (i / 5) * Math.PI * 2; return <ellipse key={i} cx={24 + Math.cos(a) * 6} cy={20 + Math.sin(a) * 6} rx="6" ry="4.2" transform={`rotate(${(a * 180) / Math.PI} ${24 + Math.cos(a) * 6} ${20 + Math.sin(a) * 6})`} fill={c} stroke={INK} strokeWidth="0.8" />; })}
        <circle cx="24" cy="20" r="3" fill="rgba(240, 206, 110, 1)" stroke={INK} strokeWidth="0.6" />
      </svg>);
    case 'zhuhua': return (
      <svg viewBox="0 0 48 48" aria-hidden className="ai">
        <ellipse cx="24" cy="27" rx="13" ry="5" fill={c2} stroke={INK} strokeWidth="0.8" />
        {[[24, 20, 4], [17, 22, 3.4], [31, 22, 3.4], [20.5, 27, 3.2], [27.5, 27, 3.2], [13, 26.5, 2.8], [35, 26.5, 2.8], [24, 14.5, 3]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill={c} stroke={INK} strokeWidth="0.7" />)}
      </svg>);
    case 'erdang': return (
      <svg viewBox="0 0 48 48" aria-hidden className="ai">
        {[16, 32].map((x) => <g key={x}><path d={`M${x} 8 C${x + 4} 8 ${x + 4} 14 ${x} 14 L${x} 22`} stroke="rgba(214, 170, 90, 1)" strokeWidth="1.2" fill="none" /><circle cx={x} cy="27" r="4.6" fill={c} stroke={INK} strokeWidth="0.8" /><circle cx={x - 1.5} cy="25.5" r="1.2" fill="rgba(255,255,255,0.9)" /></g>)}
      </svg>);
    case 'hebao': return (
      <svg viewBox="0 0 48 48" aria-hidden className="ai">
        <path d="M24 4 L24 14" stroke="rgba(110, 98, 92, 1)" strokeWidth="1.2" />
        <path d="M17 18 C14 24 13 34 18 40 C21 43 27 43 30 40 C35 34 34 24 31 18 C28 16 20 16 17 18 Z" fill={c} stroke={INK} strokeWidth="1" />
        <path d="M18 18.5 C21 21 27 21 30 18.5" stroke="rgba(110, 98, 92, 1)" strokeWidth="1.4" fill="none" />
      </svg>);
    case 'pei': return (
      <svg viewBox="0 0 48 48" aria-hidden className="ai">
        <path d="M24 2 L24 12" stroke={cord} strokeWidth="1.3" /><ellipse cx="24" cy="13" rx="3.4" ry="2.4" fill={cord} />
        <circle cx="24" cy="24" r="8.5" fill={c} stroke={INK} strokeWidth="0.9" /><circle cx="24" cy="24" r="3" fill="var(--paper)" stroke={INK} strokeWidth="0.7" />
        <path d="M24 32.5 L24 35 M21.5 35.5 L20 46 M23 35.5 L22.5 46 M24.5 35.5 L25 46 M26.5 35.5 L28 46" stroke={c2} strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="24" cy="34.5" r="1.8" fill={cord} />
      </svg>);
    case 'nang': return (
      <svg viewBox="0 0 48 48" aria-hidden className="ai">
        <path d="M24 2 L24 10" stroke={cord} strokeWidth="1.3" />
        <path d="M24 10 C15 12 12 22 15.5 29 C18 33.5 30 33.5 32.5 29 C36 22 33 12 24 10 Z" fill={c} stroke={INK} strokeWidth="1" />
        <circle cx="24" cy="21.5" r="4.2" fill={c2} /><circle cx="24" cy="21.5" r="1.6" fill={c} />
        <path d="M24 32.5 L24 34.5 M22 35 L21 46 M24 35 L24 46 M26 35 L27 46" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
      </svg>);
    case 'jinbu': return (
      <svg viewBox="0 0 48 48" aria-hidden className="ai">
        <path d="M24 1 L24 40" stroke={cord} strokeWidth="1" />
        <path d="M14 12 C18 17 30 17 34 12" stroke={c} strokeWidth="3.4" fill="none" strokeLinecap="round" />
        <circle cx="24" cy="21" r="2.2" fill={c2} stroke={INK} strokeWidth="0.6" /><circle cx="24" cy="26" r="2.2" fill={c} stroke={INK} strokeWidth="0.6" />
        <path d="M16.5 31 C19.5 35 28.5 35 31.5 31" stroke={c} strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M22 38 L20.5 47 M24 38 L24 47 M26 38 L27.5 47" stroke={cord} strokeWidth="1.2" strokeLinecap="round" />
      </svg>);
    case 'shan': return (
      <svg viewBox="0 0 48 48" aria-hidden className="ai">
        <path d="M20 44 L15 12 C17 8 31 8 33 12 L28 44 Z" fill={c2} stroke={INK} strokeWidth="0.9" />
        <path d="M15.6 15 C18 12 30 12 32.4 15 L31.2 22 C29 20 19 20 16.8 22 Z" fill={c} stroke={INK} strokeWidth="0.8" />
        <path d="M18.5 16.5 L21 15.6 M23 15.4 L26 15.6" stroke={INK} strokeWidth="0.7" opacity="0.7" />
        <circle cx="24" cy="42" r="1.5" fill={INK} />
      </svg>);
    default: return null;
  }
}

export default function AttireIcon({ item }: { item: AttireItem }) {
  if (item.cat === 'yi') return <Robe it={item} />;
  if (item.cat === 'guan') return <Hat it={item} />;
  return <Orn it={item} />;
}
