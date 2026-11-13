import { useEffect, useState } from 'react';
import { useBrush } from './face';
import { enter } from './ks';
import { ui, useStore } from './store';
import { WORDS } from './texts';

/** 一句话按标点分成几截：要折行只折在标点后面（不把一个词拆在两行） */
export function Phrases({ text }: { text: string }) {
  const parts = text.match(/[^，。；！？、：]+[，。；！？、：」』）]*/g) ?? [text];
  return <>{parts.map((p, i) => <span key={i} className="ph">{p}</span>)}</>;
}

/**
 * 题名页：一枚题签——大字题名，左下一行小字的款与一方印——贴在画的左边；画（从桃林上空望出去的整片山水）在后面缓缓地移。
 * 签下一句相邀的话，与一个「入」字。画还没画好时，那里是一条慢慢走的墨线与正在做的那一步（铺纸、远山、种桃……）。
 */
export default function Title() {
  const phase = useStore(ui, (s) => s.phase);
  const progress = useStore(ui, (s) => s.progress);
  const stage = useStore(ui, (s) => s.stage);
  const brush = useBrush(WORDS.title);
  const ready = phase === 'title';
  // 回车也是「入」（挂在捕获那一程：题名页上的键不往画里传，见 ks.ts）
  useEffect(() => {
    if (!ready) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); void enter(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [ready]);
  return (
    <div className={`title${phase === 'intro' ? ' is-leaving' : ''}`}>
      <div className="title-col">
        <header className="title-slip glass">
          <div className="title-sign">
            <p>{WORDS.subtitle}</p>
            <i className="seal" aria-hidden>{WORDS.seal}</i>
          </div>
          <h1 className={`title-name${brush ? '' : ' is-kai'}`}>{WORDS.title}</h1>
        </header>
        <div className="title-foot">
          {ready ? (
            <>
              <button className="enter glass" onClick={() => void enter()} data-testid="enter" aria-label="入"><span>入</span></button>
              <p className="title-invite"><Phrases text={WORDS.entry[0]} /></p>
            </>
          ) : phase === 'boot' ? (
            <div className="loading" role="status" aria-label="正在把画铺开">
              <div className="loading-line"><b style={{ transform: `scaleX(${Math.max(0.02, progress)})` }} /></div>
              <span key={stage}>{stage || '　'}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * 「入」之后、画还在雾里的那一会儿：进门的另外几句话一句一句浮出来，画显出来时它们退下去。
 * （WORDS.entry 的第一句在题名页上，其余的在这里。）
 */
export function Intro() {
  const phase = useStore(ui, (s) => s.phase);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (phase === 'intro') { setShow(true); return; }
    const t = setTimeout(() => setShow(false), 1800);
    return () => clearTimeout(t);
  }, [phase]);
  const lines = WORDS.entry.slice(1);
  if (!show || !lines.length) return null;
  return (
    <div className={`intro${phase === 'intro' ? '' : ' is-out'}`} aria-live="polite">
      {lines.map((l, i) => <p key={i} style={{ animationDelay: `${(0.8 + i * 0.75).toFixed(2)}s` }}><Phrases text={l} /></p>)}
    </div>
  );
}
