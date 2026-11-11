import { useEffect, useState } from 'react';
import { frame, leaveAct, getKs } from '../ks';
import { ui, useStore } from '../store';
import Copy from './Copy';
import { Lamp, Sit, Sutra, VerseCard } from './Panels';

/**
 * 做事时的那一层界面：左上是这件事的名字与计数，下面一句提示，右下一枚「毕」。
 * 各项活动特有的界面（静坐选时长、抄经的纸、拈得的那一则、灯上写的字、木鱼跟着亮的经文）各是一个组件。
 */
export default function ActLayer() {
  const act = useStore(ui, (s) => s.act);
  const st = useStore(ui, (s) => s.actState);
  const quiet = useStore(ui, (s) => s.quiet);
  // 有面板的时候把人让开：宽屏时面板在一侧，人让到另一侧；竖屏时面板在下面，人让到上面
  const [wide, setWide] = useState(() => typeof innerWidth === 'undefined' || innerWidth >= 900 && innerWidth > innerHeight * 1.15);
  useEffect(() => { const f = () => setWide(innerWidth >= 900 && innerWidth > innerHeight * 1.15); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const phase = st.phase as string | undefined;
  useEffect(() => {
    let x = 0, y = 0;
    if (act === 'sit' && (phase ?? 'choose') === 'choose') { if (wide) x = -0.13; else y = 0.2; }
    else if (act === 'lamp' && (phase ?? 'write') === 'write') { if (wide) x = 0.1; else y = 0.2; }
    else if (act === 'copy') { if (wide) x = -0.2; else y = 0.27; }
    else if (act === 'lots' && phase === 'drawn') { if (wide) x = -0.12; }
    frame(x, y);
    return () => frame(0, 0);
  }, [act, phase, wide]);
  if (!act) return null;
  const ks = getKs();
  const name = ks?.acts[act]?.name ?? '';
  const hint = (st.hint as string) ?? '';
  const count = st.count as string | undefined;
  return (
    <div className={`act act-${act}${quiet ? ' is-quiet' : ''}`}>
      <div className="act-head">
        <h3>{name}</h3>
        {count && <p className="act-count">{count}</p>}
      </div>
      {hint && <p className="act-hint" key={hint}>{hint}</p>}
      {act === 'muyu' && <Sutra />}
      {act === 'copy' && <Copy />}
      {act === 'sit' && <Sit />}
      {act === 'lots' && <VerseCard />}
      {act === 'lamp' && <Lamp />}
      <button className="act-done" onClick={leaveAct} data-testid="act-done" aria-label="做完了，起身">{(st.doneLabel as string) ?? '毕'}</button>
    </div>
  );
}
