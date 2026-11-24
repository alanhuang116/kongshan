import { useEffect, useState } from 'react';
import { branchOf, cn } from './calendar';
import { useBrush } from './face';
import { enter, placeName, resumeSpot } from './ks';
import { saved, ui, useStore, type Saved } from './store';
import { WORDS, XIAOXI } from './texts';

/**
 * 回来的人：上回停在哪、是哪一日的什么时辰，再加一两样记得的事（观象几象、认得几个星官、手上几件托事）——题名页上替「入」那一句相邀的话。
 */
function recapOf(s: Saved): { where: string; more: string } | null {
  if (!s.spot || s.visits < 1) return null;
  const name = placeName(s.spot.place) || '村里';
  const when = typeof s.time === 'number' ? `${XIAOXI[branchOf(s.time)].branch}时` : '';
  const where = `上回停在${name}，第${cn(s.day + 1)}日${when}。`;
  const bits: string[] = [];
  if (s.found.length) bits.push(`观象册里有${cn(s.found.length)}象`);
  const stars = (s.world.stars as { seen?: unknown[] } | undefined)?.seen;
  if (Array.isArray(stars) && stars.length) bits.push(`认得${cn(stars.length)}个星官`);
  const favors = (s.world.folk as { f?: Record<string, { s?: string }> } | undefined)?.f;
  const open = favors ? Object.values(favors).filter((x) => x && (x.s === 'on' || x.s === 'half')).length : 0;
  if (open) bits.push(`手上还有${cn(open)}件托事`);
  return { where, more: bits.length ? bits.join('，') + '。' : '' };
}

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
  // 回来的人：从上回停下的地方接着走（那一处还站得住才算）
  const s = useStore(saved, (x) => x);
  const recap = ready && resumeSpot() ? recapOf(s) : null;
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
              <button className="enter" onClick={() => void enter()} data-testid="enter" aria-label={recap ? '入：回到上回停下的地方' : '入'}><span>入</span></button>
              {recap ? (
                <div className="title-invite title-recap" data-testid="recap">
                  <p><Phrases text={recap.where} /></p>
                  {recap.more && <p className="title-recap-more"><Phrases text={recap.more} /></p>}
                  <button className="link title-from-grove" onClick={() => void enter(false, 'grove')} data-testid="enter-grove">从桃林走进来</button>
                </div>
              ) : <p className="title-invite"><Phrases text={WORDS.entry[0]} /></p>}
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
