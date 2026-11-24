import { useEffect, useRef, type ReactNode } from 'react';
// 字体：自己托管，按 unicode-range 分片；fonts.css 由 tools/fonts.mjs 生成
import './styles/fonts.css';
import './styles/base.css';
// 水墨的几样料（宣纸纹、墨环、墨块、笔线、落墨、印边、墨点），各处的样式拿来用；ink.css 由 tools/ink.mjs 生成
import './styles/ink.css';
import './styles/title.css';
import './styles/hud.css';
import './styles/sheets.css';
import './styles/acts.css';
import './styles/write.css';
import { boot, getKs } from './ks';
import { inkTouch } from './ink';
import { ui, useStore } from './store';
import Title, { Intro } from './Title';
import Hud from './Hud';
import Notes from './Notes';
import SkyCard from './SkyCard';
import Sheets from './sheets/Sheets';
import ActLayer from './acts/ActLayer';

// 别的几路的册页样式（村人簿、星图）：文件有了就带上
import.meta.glob(['./styles/folk.css', './styles/stars.css'], { eager: true });
// 各路后加的样式：放进 styles/extra/ 就带上（排在上面这些后头，同样的选择器以它为准）
import.meta.glob('./styles/extra/*.css', { eager: true });
// 各路后加的界面件：放进 plugins/ 的 .tsx，默认导出一个组件，走动时（roam）画在别的界面之上、册页之下
const PLUGINS = Object.entries(import.meta.glob<{ default: () => ReactNode }>('./plugins/*.tsx', { eager: true }))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, m]) => ({ key: path, C: m.default }))
  .filter((p) => typeof p.C === 'function');

/**
 * 画在最底下（一整幅画布），界面一层层压在上面：题名页 → 走动时的四角 → 做事时的面板 → 下方浮着的话 → 册页。
 * 网址带 ui=0 时什么界面都不出（只截画用）。
 */
export default function App() {
  const ref = useRef<HTMLCanvasElement>(null), root = useRef<HTMLDivElement>(null);
  const phase = useStore(ui, (s) => s.phase);
  const error = useStore(ui, (s) => s.error);
  const hideUi = typeof location !== 'undefined' && new URLSearchParams(location.search).get('ui') === '0';
  useEffect(() => {
    let dead = false;
    if (ref.current && !getKs()) void boot(ref.current).then(() => { if (dead) getKs()?.dispose(); });
    return () => { dead = true; };
  }, []);
  // 按下去的地方落一滴墨
  useEffect(() => (root.current ? inkTouch(root.current) : undefined), []);
  return (
    <div className="ks" data-phase={phase} ref={root}>
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
      {!hideUi && phase === 'roam' && <Notes />}
      {!hideUi && phase === 'roam' && <SkyCard />}
      {!hideUi && phase === 'roam' && PLUGINS.map(({ key, C }) => <C key={key} />)}
      {!hideUi && <Sheets />}
      {error && <div className="fatal"><p>这台设备没能把画铺开。</p><small>{error}</small></div>}
    </div>
  );
}
