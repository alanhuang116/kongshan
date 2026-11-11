import { useEffect, useRef } from 'react';
// 字体：自己托管，按 unicode-range 分片；fonts.css 由 tools/fonts.mjs 生成
import './styles/fonts.css';
import './styles/base.css';
import './styles/hud.css';
import './styles/sheets.css';
import './styles/acts.css';
import './styles/acts2.css';
import { boot, getKs } from './ks';
import { ui, useStore } from './store';
import Title from './Title';
import Hud from './Hud';
import Sheets from './sheets/Sheets';
import ActLayer from './acts/ActLayer';

export default function App() {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = useStore(ui, (s) => s.phase);
  const error = useStore(ui, (s) => s.error);
  const quiet = useStore(ui, (s) => s.quiet);
  const hideUi = typeof location !== 'undefined' && new URLSearchParams(location.search).get('ui') === '0';
  useEffect(() => {
    let dead = false;
    if (ref.current && !getKs()) void boot(ref.current).then(() => { if (dead) getKs()?.dispose(); });
    return () => { dead = true; };
  }, []);
  return (
    <div className={`ks${quiet ? ' is-quiet' : ''}`} data-phase={phase}>
      <canvas ref={ref} className="ks-canvas" tabIndex={-1} />
      {!hideUi && <div className="scrim scrim-top" />}
      {!hideUi && <div className="scrim scrim-bot" />}
      {!hideUi && phase !== 'roam' && <Title />}
      {!hideUi && phase === 'roam' && <Hud />}
      {!hideUi && phase === 'roam' && <ActLayer />}
      {!hideUi && <Sheets />}
      {error && <div className="fatal"><p>这台设备没能把山画出来。</p><small>{error}</small></div>}
    </div>
  );
}
