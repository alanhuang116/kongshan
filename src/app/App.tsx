import { useEffect, useRef } from 'react';
// 字体：自己托管，按 unicode-range 分片；fonts.css 由 tools/fonts.mjs 生成
import './styles/fonts.css';
import './styles/base.css';
import './styles/title.css';
import './styles/hud.css';
import './styles/sheets.css';
import './styles/acts.css';
import './styles/write.css';
import { boot, getKs } from './ks';
import { ui, useStore } from './store';
import Title, { Intro } from './Title';
import Hud from './Hud';
import Sheets from './sheets/Sheets';
import ActLayer from './acts/ActLayer';

/**
 * 画在最底下（一整幅画布），界面一层层压在上面：题名页 → 走动时的四角 → 做事时的面板 → 册页。
 * 网址带 ui=0 时什么界面都不出（只截画用）。
 */
export default function App() {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = useStore(ui, (s) => s.phase);
  const error = useStore(ui, (s) => s.error);
  const hideUi = typeof location !== 'undefined' && new URLSearchParams(location.search).get('ui') === '0';
  useEffect(() => {
    let dead = false;
    if (ref.current && !getKs()) void boot(ref.current).then(() => { if (dead) getKs()?.dispose(); });
    return () => { dead = true; };
  }, []);
  return (
    <div className="ks" data-phase={phase}>
      <canvas ref={ref} className="ks-canvas" tabIndex={-1} />
      {/* 村图上的线用它抖一抖：像手画的，不像尺子画的 */}
      <svg className="ks-defs" aria-hidden>
        <filter id="ks-rough" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {!hideUi && phase !== 'roam' && <Title />}
      {!hideUi && <Intro />}
      {!hideUi && phase === 'roam' && <Hud />}
      {!hideUi && phase === 'roam' && <ActLayer />}
      {!hideUi && <Sheets />}
      {error && <div className="fatal"><p>这台设备没能把画铺开。</p><small>{error}</small></div>}
    </div>
  );
}
