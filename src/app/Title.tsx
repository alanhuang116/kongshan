import { enter } from './ks';
import { ui, useStore } from './store';

/** 开场：空山二字，苏轼的八个字，一枚「入山」。山还没画好时，下面是一条慢慢走的墨线。 */
export default function Title() {
  const phase = useStore(ui, (s) => s.phase);
  const progress = useStore(ui, (s) => s.progress);
  const stage = useStore(ui, (s) => s.stage);
  const ready = phase === 'title';
  return (
    <div className={`title${phase === 'intro' ? ' is-leaving' : ''}`}>
      <div className="title-center">
        <div className="title-motto" aria-label="空山无人，水流花开。苏轼">
          <span>空山无人</span>
          <span>水流花开</span>
          <em>苏轼</em>
        </div>
        <h1 className="title-name">空山</h1>
        <i className="title-seal" aria-hidden>山寺</i>
      </div>
      <div className="title-foot">
        {ready ? (
          <button className="enter" onClick={() => void enter()} data-testid="enter">
            <span>入山</span>
          </button>
        ) : phase === 'boot' ? (
          <div className="loading" role="status">
            <div className="loading-line"><b style={{ transform: `scaleX(${Math.max(0.02, progress)})` }} /></div>
            <span>{stage || '　'}</span>
          </div>
        ) : null}
        <p className="title-note">宜静处　宜耳机</p>
      </div>
    </div>
  );
}
