import { GuaGlyph } from '../Gua';
import GuaCard from '../GuaCard';
import { useBrush } from '../face';
import { actCmd } from '../ks';
import { TRIGRAMS, guaOf } from '../texts';
import { pieceFor, savePiece } from './Copy';

/**
 * 做事时的那一块面板：全看世界交来的 state 里有什么——
 *   who 谁在说话 · lines 诗句（短句竖写，毛笔字）· gua 一卦的名字（出象卡：六爻自下而上写出来、卦名、《大象传》、白话）·
 *   text 一段话（可以分行）· source 出处 · gloss 一句白话 · progress 进度（一道墨线）· choices 几枚签（点了把 id 发回给那件事）。
 * 哪一样都没有，就没有面板。事是别人写的，这里不认具体是哪一件；只有两处看了内容：
 *   kind 是 bagua（八卦盘）时在话的左边添上那一卦的三画；lines 与方才亲手写的那两句一样时，用你自己的笔迹，不用排出来的字。
 */
type State = Record<string, unknown>;
export interface Choice { id: string; label: string }
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []);
export const choicesOf = (v: unknown): Choice[] => (Array.isArray(v) ? v.filter((c): c is Choice => !!c && typeof c === 'object' && typeof (c as Choice).id === 'string' && typeof (c as Choice).label === 'string') : []);
/** 这几个 id 是「做完了，起身」的意思（别的是这件事里头的下一步） */
const EXITS = new Set(['done', 'bye', 'keep']);
export const exitOf = (cs: Choice[]): Choice | null => cs.find((c) => EXITS.has(c.id)) ?? null;
/** 有没有要用面板来放的东西。只有一枚「罢」的不算——那一枚落到右下角去，免得为它单出一块板 */
export const hasPanel = (st: State) => !!(str(st.text) || strList(st.lines).length || guaOf(st.gua) || choicesOf(st.choices).some((c) => !EXITS.has(c.id)));
const hanOf = (lines: string[]) => lines.map((l) => [...l].filter((c) => /\p{Script=Han}/u.test(c)).join('')).join('/');

export default function Panel({ st }: { st: State }) {
  const verse = strList(st.lines), text = str(st.text), source = str(st.source), gloss = str(st.gloss), who = str(st.who), gua = guaOf(st.gua), cs = choicesOf(st.choices), p = num(st.progress);
  const brush = useBrush(verse.join(''));
  // 五言、七言这样的短句竖着写（自右而左）；带空格的、长的就一行一行横排
  const tall = verse.length > 0 && verse.length <= 10 && verse.every((l) => [...l].length <= 9 && !/\s/.test(l.trim()));
  const size = verse.length <= 4 ? 'l' : verse.length <= 6 ? 'm' : verse.length <= 8 ? 's' : 'xs';
  // 方才亲手写的那两句：用自己的笔迹
  const piece = verse.length ? pieceFor(hanOf(verse)) : null;
  const tri = st.kind === 'bagua' ? TRIGRAMS.find((t) => t.name === str(st.title)) : undefined;
  const paras = text ? text.split('\n').filter((t) => t.trim()) : [];
  // 头一枚签蘸满墨（是这一步该点的）。只有一枚「罢」、而画面上另有可做的（有提示）时，它不抢眼
  const lead = cs.length > 0 && cs.length <= 2 && !(EXITS.has(cs[0].id) && str(st.hint)) ? cs[0].id : null;
  return (
    <section className={`panel${gua ? ' panel-xiang' : ''}`} data-testid="act-panel">
      <div className="panel-body">
        {who && <p className="panel-who">{who}</p>}
        {piece ? (
          <figure className="panel-piece">
            <img src={piece} alt={`你写的：${verse.join('，')}`} />
            <button className="panel-link" onClick={() => savePiece(piece)}>存为图片</button>
          </figure>
        ) : verse.length > 0 && (
          <div className={`verse verse-${size}${tall ? ' is-tall' : ''}${brush ? '' : ' is-kai'}`}>{verse.map((l, i) => <span key={i}>{l}</span>)}</div>
        )}
        {gua && <GuaCard gua={gua} draw key={gua.key} />}
        {gua && typeof st.found === 'boolean' && <p className="panel-found">{st.found ? '这一象已在观象册里' : '头一回见，收进观象册'}</p>}
        {paras.length > 0 && (
          <div className={`panel-text${tri ? ' has-tri' : ''}`} key={text}>
            {tri && <GuaGlyph lines={tri.lines} label={`${tri.name}卦的三画`} />}
            <div>{paras.map((t, i) => <p key={i}>{t}</p>)}</div>
          </div>
        )}
        {source && <p className="panel-source">{/^[—–-]/.test(source) ? source : `——${source}`}</p>}
        {gloss && <p className="panel-gloss">{gloss}</p>}
        {p != null && p < 1 && <i className="act-bar"><b style={{ transform: `scaleX(${Math.max(0, p).toFixed(3)})` }} /></i>}
        {cs.length > 0 && (
          <div className="panel-acts">
            {cs.map((c) => <button key={c.id} className={`opt${c.id === lead ? ' is-on' : ''}`} onClick={() => actCmd(c.id)} data-testid={`choice-${c.id}`}>{c.label}</button>)}
          </div>
        )}
      </div>
    </section>
  );
}
