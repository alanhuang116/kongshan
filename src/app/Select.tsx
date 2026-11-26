import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ATTIRE_BY_ID } from '../data/attire';
import { STARTERS, type Wear } from '../world/avatar/dress';
import { getTogether } from '../world/net';
import { nameOf } from '../world/net/proto';
import { chooseAndEnter, getKs, leaveSelect } from './ks';
import { useBrush } from './face';
import { Phrases } from './Title';

/**
 * 选人（头一回来时「入」之后）：桃林里两位并肩站着——一位郎君、一位娘子（画里真的三维的人，会呼吸、理袖、回头）。
 * 点哪一位，镜头就近过去；下面三身带着来的衣着，点一身那一位就换上、慢慢转一圈给你看；雅号可以换一个；「入」——那一位行个礼，进园。
 *
 * 排法：宽屏两位都在画里，签落在各自脚下，衣着与「入」在下方一条；竖着的手机一次只看一位（上方「郎君 · 娘子」两枚切换），
 * 衣着与「入」在下面；横着的手机屋矮，衣着那一块靠右竖着排。
 */
type Sex = 'm' | 'f';
const SEX: Array<{ id: Sex; name: string; i: 0 | 1 }> = [{ id: 'm', name: '郎君', i: 0 }, { id: 'f', name: '娘子', i: 1 }];
const WORDS = { title: '来客', line: '邵先生出门访友去了，安乐窝暂托你照看。', hint: '点一位，看看衣着', name: '雅号', reroll: '换一个', back: '回到题名' };

const css = (c: readonly number[] | undefined) => (c ? `rgb(${Math.round(255 * c[0])}, ${Math.round(255 * c[1])}, ${Math.round(255 * c[2])})` : 'transparent');
const label = () => { const tg = getTogether(); return tg ? nameOf(tg.me.n) : ''; };
const narrowNow = () => typeof window !== 'undefined' && window.innerWidth / Math.max(1, window.innerHeight) < 0.8;

/**
 * 取景（给世界的 showFrame）：人落在画面的哪里、占画面高的几成——面板在下（竖屏）就让人往上，面板在右（横屏、宽屏选了一位）就让人落在左边
 */
function frameFor(sex: Sex | null): { x: number; y: number; fill: number } {
  const w = window.innerWidth, h = Math.max(1, window.innerHeight), a = w / h;
  if (a < 0.8) return h < 600 ? { x: 0, y: 0.12, fill: 0.4 } : { x: 0, y: 0.17, fill: 0.4 };
  if (h <= 520) return { x: -0.46, y: 0.02, fill: 0.8 };
  return sex ? { x: -0.32, y: 0.02, fill: 0.76 } : { x: 0, y: 0.1, fill: 0.6 };
}

function useNarrow(): boolean {
  const [n, setN] = useState(narrowNow);
  useEffect(() => {
    const f = () => setN(narrowNow());
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return n;
}

/** 一身衣着的那一枚：一个圆的色块（上衣与裙、衣缘两色，一笔墨圈），下面衣名 */
function WearKey({ w, on, onPick }: { w: Wear; on: boolean; onPick(): void }) {
  const yi = ATTIRE_BY_ID.get(w.yi), guan = ATTIRE_BY_ID.get(w.guan);
  const style = { '--c1': css(yi?.swatch), '--c2': css(yi?.swatch2 ?? yi?.swatch), '--c3': css(guan?.swatch) } as CSSProperties;
  return (
    <button className={`ke-wear${on ? ' is-on' : ''}`} onClick={onPick} aria-pressed={on} data-testid={`pick-wear-${w.yi}`}>
      <i className="ke-chip" style={style} aria-hidden><b /></i>
      <span>{yi?.name ?? ''}</span>
      <small>{guan?.name ?? ''}</small>
    </button>
  );
}

export default function Select() {
  const narrow = useNarrow();
  const [sex, setSex] = useState<Sex | null>(() => (narrowNow() ? 'm' : null));
  const [pick, setPick] = useState<Record<Sex, number>>({ m: 0, f: 0 });
  const [name, setName] = useState(label);
  const [going, setGoing] = useState(false);
  const [pts, setPts] = useState<Array<{ x: number; y: number; top: number } | null>>([null, null]);
  const brush = useBrush(WORDS.title);
  const last = useRef('');
  const focus = sex === null ? null : sex === 'm' ? 0 : 1;

  // 两位上场（一回）；收场由「入」（世界的 begin）或「回到题名」做
  useEffect(() => {
    getKs()?.setShowcase({ wears: [STARTERS.m[0], STARTERS.f[0]], focus });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 竖着的手机一次只看一位：宽屏转成竖屏时没选的给一位
  useEffect(() => { if (narrow && sex === null) setSex('m'); }, [narrow, sex]);
  useEffect(() => { getKs()?.showFocus(focus); }, [focus]);
  // 取景跟着排法：选了一位、转了屏
  useEffect(() => {
    const f = () => getKs()?.showFrame(frameFor(sex));
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [sex]);
  useEffect(() => { const k = getKs(); k?.showWear(0, STARTERS.m[pick.m]); k?.showWear(1, STARTERS.f[pick.f]); }, [pick]);
  // 雅号合不合男女（换成娘子、雅号还是「钓叟」：另起一个）
  useEffect(() => {
    const tg = getTogether();
    if (tg && sex && !tg.nameFits(sex)) { tg.reroll(sex); setName(label()); }
  }, [sex]);
  // 两位此刻在画面上的哪里：签跟着落在脚下（镜头在动时每帧挪，停了就不重画）
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = getKs()?.showcaseScreen() ?? [null, null];
      const key = p.map((q) => (q ? `${Math.round(q.x)},${Math.round(q.y)},${Math.round(q.top)}` : '-')).join('|');
      if (key !== last.current) { last.current = key; setPts(p); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const reroll = () => { const tg = getTogether(); if (!tg) return; tg.reroll(sex ?? undefined); setName(label()); };
  const go = () => {
    if (!sex || going) return;
    setGoing(true);
    getKs()?.showChoose(sex === 'm' ? 0 : 1);
    // 那一位行完礼（一息半），再淡进雾里
    window.setTimeout(() => void chooseAndEnter(STARTERS[sex][pick[sex]]), 1500);
  };
  const cur = sex ? STARTERS[sex][pick[sex]] : null;
  const note = cur ? ATTIRE_BY_ID.get(cur.yi)?.note ?? '' : '';

  return (
    <div className={`ke${going ? ' is-going' : ''}${narrow ? ' is-narrow' : ''}`} data-testid="pick">
      <header className="ke-head glass">
        <h2 className={`ke-title${brush ? '' : ' is-kai'}`}>{WORDS.title}</h2>
        <p className="ke-line"><Phrases text={WORDS.line} /></p>
      </header>

      {narrow ? (
        <div className="ke-seg" role="tablist" aria-label="郎君或娘子">
          {SEX.map((s) => (
            <button key={s.id} role="tab" aria-selected={sex === s.id} className={`ke-seg-key${sex === s.id ? ' is-on' : ''}`} onClick={() => setSex(s.id)} data-testid={`pick-${s.id}`}>{s.name}</button>
          ))}
        </div>
      ) : SEX.map((s) => {
        const p = pts[s.i];
        if (!p) return null;
        return (
          <button key={s.id} className={`ke-tag${sex === s.id ? ' is-on' : ''}${sex && sex !== s.id ? ' is-off' : ''}`} style={{ left: p.x, top: p.y }} onClick={() => setSex(s.id)} aria-pressed={sex === s.id} data-testid={`pick-${s.id}`}>
            <span>{s.name}</span>
          </button>
        );
      })}

      <footer className={`ke-panel glass${sex ? ' is-side' : ' is-empty'}`}>
        {sex && cur ? (
          <>
            <div className="ke-wears" role="radiogroup" aria-label="衣着">
              {STARTERS[sex].map((w, i) => <WearKey key={w.yi} w={w} on={pick[sex] === i} onPick={() => setPick((p) => ({ ...p, [sex]: i }))} />)}
            </div>
            <p className="ke-note" key={cur.yi}>{note}</p>
            <div className="ke-row">
              <div className="ke-name">
                <span className="ke-label">{WORDS.name}</span>
                <b data-testid="pick-name">{name}</b>
                <button className="link" onClick={reroll} data-testid="pick-reroll">{WORDS.reroll}</button>
              </div>
              <button className="enter ke-enter" onClick={go} disabled={going} data-testid="pick-enter" aria-label="入"><span>入</span></button>
            </div>
          </>
        ) : <p className="ke-hint"><Phrases text={WORDS.hint} /></p>}
        <button className="link ke-back" onClick={() => leaveSelect()} data-testid="pick-back">{WORDS.back}</button>
      </footer>
    </div>
  );
}
