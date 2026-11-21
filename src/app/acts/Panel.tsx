import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GuaGlyph } from '../Gua';
import GuaCard from '../GuaCard';
import { useBrush } from '../face';
import { actCmd } from '../ks';
import { TRIGRAMS, guaOf } from '../texts';
import { pieceFor, savePiece } from './Copy';
import { EXITS, choicesOf, itemsOf, num, str, strList, type Choice } from './state';
import { ItemList } from './Widgets';

export { choicesOf, exitOf, num, str, strList } from './state';
export type { Choice } from './state';

/**
 * 做事时的那一块面板：一块有厚度的板，全看世界交来的 state 里有什么（每一样怎么写见 state.ts）——
 *   who 谁在说话 · said 先生方才说的那句（who 下面淡淡一行）· lines 诗句（短句竖写，毛笔字）· gua 一卦（出象卡）·
 *   text 一段话 · source 出处 · gloss 一句白话 · progress 进度 · items 从行囊挑一样 · choices 几枚签。
 * 哪一样都没有，就没有面板。事是别人写的，这里不认具体是哪一件；只有两处看了内容：
 *   kind 是 bagua（八卦盘）时在话的左边添上那一卦的三画；lines 与方才亲手写的那两句一样时，用你自己的笔迹，不用排出来的字。
 *
 * 签的排法（一屏只有一个主操作）：主操作落在下凹的底座上；别的签是凸起的键；三枚以上排成一列（一行一枚，不排成格子）；
 * 「做完了」（done / bye / keep）是最后一行字的链接。只有「做完了」一枚、又没有别的可做时，它就是主操作（如「记下」）。
 *
 * 收紧的面板（compact：观星时；state.compact 为真时也是）：贴底一条，把天让出来——
 *   最上一行小字是提示（hint 挪进来，不另出一块板），话最多两行（点「全文」展开，白话 gloss 也在展开里），出处跟在下面一行；
 *   签排成一行（不排成一列；放不下就在这一行里横着滚），「做完了」是这一行末尾的字。点着星时没有签，就只有话。
 */
type State = Record<string, unknown>;
/** 有没有要用面板来放的东西。只有一枚「罢」的不算——那一枚落到右下角去，免得为它单出一块板 */
export const hasPanel = (st: State) => !!(str(st.text) || strList(st.lines).length || guaOf(st.gua) || itemsOf(st.items).length || choicesOf(st.choices).some((c) => !EXITS.has(c.id)));
const hanOf = (lines: string[]) => lines.map((l) => [...l].filter((c) => /\p{Script=Han}/u.test(c)).join('')).join('/');

/** 一枚签：主操作（底座里的墨键）、寻常的凸键、或一行里的一项 */
function Key({ c, cls }: { c: Choice; cls: string }) {
  return (
    <button className={cls} disabled={c.off} onClick={() => actCmd(c.id)} data-testid={`choice-${c.id}`}>
      <span>{c.label}</span>
      {c.sub && <small>{c.sub}</small>}
    </button>
  );
}
function Choices({ cs, hint, picking, row }: {
  cs: Choice[]; hint: boolean;
  /** 面板里还有「从行囊挑一样」：那才是这一步的主操作，签就不自己当主操作了 */ picking: boolean;
  /** 排成一行（收紧的面板）：不排成一列，「做完了」接在这一行末尾 */ row?: boolean;
}) {
  const rest = cs.filter((c) => !EXITS.has(c.id)), exits = cs.filter((c) => EXITS.has(c.id));
  const marked = rest.find((c) => c.main && !c.off) ?? null;
  // 没标主操作时：只有一两枚、头一枚不是「做完了」的，头一枚就是
  const main = marked ?? (!picking && !rest.some((c) => c.main) && cs.length <= 2 && rest.length > 0 && !EXITS.has(cs[0].id) && !rest[0].off ? rest[0] : null);
  // 只有「做完了」的签：它就是这一步的主操作（画面上另有可做的、有提示时除外）
  const mainExit = !picking && !rest.length && exits.length === 1 && !hint ? exits[0] : null;
  const list = !row && rest.length >= 3;
  const links = exits.filter((c) => c !== mainExit);
  const exitLinks = links.map((c) => <button key={c.id} className="exit-link" onClick={() => actCmd(c.id)} data-testid={`choice-${c.id}`}>{c.label}</button>);
  return (
    <div className={`choices${list ? ' is-list' : ''}${row ? ' is-row' : ''}`}>
      {list ? (
        <ul className="choice-list">
          {rest.map((c) => <li key={c.id}><Key c={c} cls={`choice-row${c === main ? ' is-main' : ''}`} /></li>)}
        </ul>
      ) : (rest.length > 0 || mainExit || (row && links.length > 0)) && (
        <div className="panel-acts">
          {main && <span className="well"><Key c={main} cls="key is-main" /></span>}
          {mainExit && <span className="well"><Key c={mainExit} cls="key is-main" /></span>}
          {rest.filter((c) => c !== main).map((c) => <Key key={c.id} c={c} cls="key" />)}
          {row && links.length > 0 && <span className="choice-exits">{exitLinks}</span>}
        </div>
      )}
      {!row && links.length > 0 && <div className="choice-exits">{exitLinks}</div>}
    </div>
  );
}

/** 先生方才说的那句：who 下面淡淡一行，像一句引语；长了折成两行，再长才在第二行末尾省略 */
function Said({ text }: { text: string }) {
  return <p className="panel-said" data-clamp title={text} data-testid="act-said">{text}</p>;
}

/** 收紧的面板（观星）：提示一行、话两行（可展开）、出处一行、签一行 */
function Compact({ st, lead }: { st: State; lead: string | null }) {
  const verse = strList(st.lines), text = str(st.text), source = str(st.source), gloss = str(st.gloss), said = str(st.said), who = str(st.who), cs = choicesOf(st.choices);
  const items = itemsOf(st.items);
  const paras = text ? text.split('\n').filter((t) => t.trim()) : verse.length ? [verse.join('，') + '。'] : [];
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const words = useRef<HTMLDivElement>(null);
  const sig = `${paras.join('/')}|${gloss ?? ''}`;
  useEffect(() => setOpen(false), [sig]);
  // 两行放不放得下：放不下才给「全文」
  useLayoutEffect(() => {
    const el = words.current;
    setClipped(!!el && !open && el.scrollHeight > el.clientHeight + 1);
  }, [sig, open]);
  const more = clipped || (!!gloss && !open) || open;
  const body = !!(lead || who || said || paras.length || source);
  return (
    <section className={`panel is-compact${open ? ' is-open' : ''}`} data-testid="act-panel">
      {body && (
        <div className="panel-body">
          {(lead || who) && <p className="panel-lead">{who ? <b>{who}</b> : null}{lead}</p>}
          {said && <Said text={said} />}
          {paras.length > 0 && (
            <div className="panel-words" ref={words} data-clamp={open ? undefined : ''} onClick={() => (clipped || gloss) && setOpen(true)}>
              {open ? paras.map((t, i) => <p key={i}>{t}</p>) : <p>{paras.join('　')}</p>}
            </div>
          )}
          {open && gloss && <p className="panel-gloss">{gloss}</p>}
          {(source || more) && (
            <p className="panel-meta">
              {source ? <span className="panel-source">{/^[—–-]/.test(source) ? source : `——${source}`}</span> : <span />}
              {more && <button className="panel-more" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="act-more">{open ? '收起' : '全文'}</button>}
            </p>
          )}
        </div>
      )}
      {(items.length > 0 || cs.length > 0) && (
        <div className="panel-foot">
          {items.length > 0 && <ItemList items={items} />}
          {cs.length > 0 && <Choices cs={cs} hint={!!lead} picking={items.length > 0} row />}
        </div>
      )}
    </section>
  );
}

export default function Panel({ st, compact, lead }: { st: State; /** 收紧的面板（观星） */ compact?: boolean; /** 收紧时挪进来的提示 */ lead?: string | null }) {
  const verse = strList(st.lines), text = str(st.text), source = str(st.source), gloss = str(st.gloss), who = str(st.who), said = str(st.said), gua = guaOf(st.gua), cs = choicesOf(st.choices), p = num(st.progress);
  const items = itemsOf(st.items);
  const brush = useBrush(verse.join(''));
  if (compact) return <Compact st={st} lead={lead ?? null} />;
  // 五言、七言这样的短句竖着写（自右而左）；带空格的、长的就一行一行横排
  const tall = verse.length > 0 && verse.length <= 10 && verse.every((l) => [...l].length <= 9 && !/\s/.test(l.trim()));
  const size = verse.length <= 4 ? 'l' : verse.length <= 6 ? 'm' : verse.length <= 8 ? 's' : 'xs';
  // 方才亲手写的那两句：用自己的笔迹
  const piece = verse.length ? pieceFor(hanOf(verse)) : null;
  const tri = st.kind === 'bagua' ? TRIGRAMS.find((t) => t.name === str(st.title)) : undefined;
  const paras = text ? text.split('\n').filter((t) => t.trim()) : [];
  const body = !!(who || said || verse.length || gua || paras.length || source || gloss || (p != null && p < 1));
  const foot = items.length > 0 || cs.length > 0;
  return (
    <section className={`panel${gua ? ' panel-xiang' : ''}`} data-testid="act-panel">
      {body && <div className="panel-body">
        {who && <p className="panel-who">{who}</p>}
        {said && <Said text={said} />}
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
      </div>}
      {/* 签与「从行囊挑一样」在板的下截：话再长也不把它们挤到看不见的地方（话在上截里滚） */}
      {foot && (
        <div className="panel-foot">
          {items.length > 0 && <ItemList items={items} />}
          {cs.length > 0 && <Choices cs={cs} hint={!!str(st.hint)} picking={items.length > 0} />}
        </div>
      )}
    </section>
  );
}
