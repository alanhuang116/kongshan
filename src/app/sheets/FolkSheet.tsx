import { useEffect, useMemo, useRef, useState } from 'react';
import { PLACES } from '../../world/site';
import { folkView, seek, type FolkCard } from '../../world/acts/favor';
import { cn } from '../calendar';
import { getKs, openSheet } from '../ks';
import { legacyPref, pref, setPref, ui, useStore } from '../store';
import Sheet from './Sheet';

/**
 * 村人簿：全村的人。按家分（王家、李家、赵家、孙家、陈篾匠家、陶家、村外的），或按此刻在哪一处分；最上面一小栏是在办的托事。
 * 每人一行：名字、身份、此刻在哪做什么、跟你的情分（几个字：初识、相熟、相得、知交）；在外头的名字前一点朱。
 * 点开一行：住哪、家里有谁（点名字跳到那人）、今天的日程（此刻那一段点亮）、喜欢什么（熟了才知道）、托你的事、送过什么；
 * 「去找他」——近的走过去，远的画淡成一片雾，人就站在他跟前；不在外头的，到他家门口去。
 * 数据都从世界那边现取（world/acts/favor.ts 的 folkView），这里只管摆。
 */
type By = 'home' | 'place';
const HOME_ORDER = ['a', 'b', 'd', 'e', 'f', 'g'];
const HOME_NAME: Record<string, [string, string]> = { a: ['甲家', '王家'], b: ['乙家', '李家'], d: ['丁家', '赵家'], e: ['戊家', '孙家酒家'], f: ['己家', '陈篾匠家'], g: ['庚家', '陶家'] };
const PLACE_ORDER = [...PLACES.map((p) => p.name), '外头', '在家', '村外'];
/** 按家还是按处：跟着存档走（旧版本只在本机存过的那一份，初次读时兜底） */
const byPref = (): By => (pref('folkBy', legacyPref('anlewo:folk:by') ?? 'home') === 'place' ? 'place' : 'home');

function groups(cards: FolkCard[], by: By): Array<{ key: string; name: string; sub: string; cards: FolkCard[] }> {
  if (by === 'home') {
    const out = HOME_ORDER.map((h) => ({ key: h, name: HOME_NAME[h][0], sub: HOME_NAME[h][1], cards: cards.filter((c) => c.home === h) }));
    out.push({ key: 'out', name: '村外', sub: '渡口、山里、过路的', cards: cards.filter((c) => !HOME_ORDER.includes(c.home)) });
    return out.filter((g) => g.cards.length);
  }
  const names = [...new Set(cards.map((c) => c.place))].sort((a, b) => (PLACE_ORDER.indexOf(a) + 1 || 99) - (PLACE_ORDER.indexOf(b) + 1 || 99));
  return names.map((n) => ({ key: n, name: n, sub: n === '在家' ? '这会儿不在外头' : n === '村外' ? '不在村里' : '', cards: cards.filter((c) => c.place === n) }));
}

/** 托事的几种情形：在办（一点朱）、快办成了（半点）、办成了（一道勾）、要找他（别人托的，落在他身上） */
const stateClass = (s: string) => (s === '办成了' ? 'is-done' : s === '快办成了' ? 'is-half' : s === '要找他' ? 'is-via' : 'is-on');

function Row({ c, open, onToggle, onJump }: { c: FolkCard; open: boolean; onToggle(): void; onJump(id: string): void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [open]);
  const go = () => {
    const k = getKs();
    if (!k) return;
    openSheet(null);
    void seek(k, c.id).then((ok) => { if (!ok) k.note(`${c.name}那边这会儿过不去`, 'folk'); });
  };
  const canGo = c.here || !!HOME_NAME[c.home];
  const now = [c.where, c.doing].filter(Boolean).join('，');
  return (
    <li ref={ref} className={`folk-row${open ? ' is-open' : ''}${c.here ? ' is-here' : ''}`} data-testid={`folk-${c.id}`}>
      <button className="folk-head" onClick={onToggle} aria-expanded={open}>
        <span className="folk-name"><b>{c.name}</b><small>{c.tag}</small></span>
        <span className={`folk-bond b${c.bond}`}>{c.bondName}</span>
        <span className="folk-now">{now}</span>
      </button>
      {open && (
        <div className="folk-more">
          <dl>
            <dt>住</dt><dd>{c.homeText}{c.age ? <small>　{cn(c.age)}岁</small> : null}</dd>
            {c.family.length > 0 && (<><dt>家</dt><dd className="folk-kin">{c.family.map((f) => <button key={f.id} className="key folk-kin-key" onClick={() => onJump(f.id)} data-testid={`folk-kin-${f.id}`}>{f.name}<small>{f.tag}</small></button>)}</dd></>)}
            {c.temper && (<><dt>性情</dt><dd>{c.temper}</dd></>)}
            {c.plan.length > 0 && (
              <><dt>今日</dt><dd><ol className="folk-plan">{c.plan.map((s, i) => <li key={i} className={s.on ? 'is-on' : ''}><i>{s.when}</i><span>{s.where}，{s.doing}</span></li>)}</ol></dd></>
            )}
            <dt>所好</dt><dd>{c.likes ? c.likes.join('、') : <span className="folk-dim">还不知道。送对了东西、熟了，才知道</span>}</dd>
            {c.favors.length > 0 && (
              <><dt>托事</dt><dd className="folk-favors">{c.favors.map((f) => <p key={f.id}><b>{f.name}</b><em className={stateClass(f.state)}>{f.state}</em>{f.note && <small>{f.note}</small>}</p>)}</dd></>
            )}
            {(c.gave.length > 0 || c.got.length > 0) && (
              <><dt>往来</dt><dd>{c.gave.length > 0 && <span>送过他：{c.gave.join('、')}</span>}{c.gave.length > 0 && c.got.length > 0 && '；'}{c.got.length > 0 && <span>他给过你：{c.got.join('、')}</span>}</dd></>
            )}
          </dl>
          <div className="folk-foot">
            <span>{c.met ? `说过${c.met === 2 ? '两' : cn(c.met)}回话，上回是${c.last}` : '还没说过话'}{c.you ? `　他叫你「${c.you}」` : ''}</span>
            {canGo
              ? <span className="well"><button className="key is-main" onClick={go} data-testid={`folk-go-${c.id}`}>{c.here ? '去找他' : '去他家门口'}</button></span>
              : <button className="key" disabled data-testid={`folk-go-${c.id}`}>不在村里</button>}
          </div>
        </div>
      )}
    </li>
  );
}

export default function FolkSheet() {
  const hour = useStore(ui, (s) => s.hour);
  const [by, setBy] = useState<By>(byPref);
  const [open, setOpen] = useState<string | null>(null);
  // 村里人走动着：隔两秒重看一眼
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 2000); return () => clearInterval(t); }, []);
  const cards = useMemo(() => { const k = getKs(); return k ? folkView(k) : []; }, [tick, hour]);
  // 按此刻在哪分时，人走动着会换组：分组隔十五秒才重排、点开了一个人时不重排，免得名单在眼前跳（每人那一行「此刻在哪、做什么」照样两秒一更新）
  const [placeOf, setPlaceOf] = useState<Record<string, string>>({});
  const grouped = useRef(0);
  useEffect(() => {
    if (by !== 'place' || !cards.length) return;
    const now = Date.now();
    if (!grouped.current || (now - grouped.current > 15000 && !open)) { grouped.current = now; setPlaceOf(Object.fromEntries(cards.map((c) => [c.id, c.place]))); }
  }, [cards, by, open]);
  const gs = useMemo(() => groups(by === 'place' ? cards.map((c) => (placeOf[c.id] ? { ...c, place: placeOf[c.id] } : c)) : cards, by), [cards, by, placeOf]);
  const out = cards.filter((c) => c.here).length;
  const pick = (b: By) => { setBy(b); setPref('folkBy', b); grouped.current = 0; };
  // 在办的托事（托事的人那一行里的）：放在最上面，点一件就翻到那个人
  const tasks = cards.flatMap((c) => c.favors.filter((f) => f.state === '在办' || f.state === '快办成了').map((f) => ({ ...f, who: c.id })));
  const doing = tasks.length;
  return (
    <Sheet title="村人簿" sub={`${cn(cards.length)}人${out ? `，${cn(out)}人在外头` : '，都在家'}${doing ? `　托事${cn(doing)}件` : ''}`} wide>
      <div className="seg folk-by" role="group" aria-label="怎么分">
        <button className={by === 'home' ? 'is-on' : ''} onClick={() => pick('home')} aria-pressed={by === 'home'} data-testid="folk-by-home">按家</button>
        <button className={by === 'place' ? 'is-on' : ''} onClick={() => pick('place')} aria-pressed={by === 'place'} data-testid="folk-by-place">按此刻在哪</button>
      </div>
      {cards.length === 0 && <p className="sheet-note">村里还没有人出来。</p>}
      {tasks.length > 0 && (
        <section className="folk-tasks" aria-label="在办的托事">
          <h4>托事</h4>
          <ul>
            {tasks.map((f) => (
              <li key={f.id}>
                <button onClick={() => setOpen(f.who)} data-testid={`folk-task-${f.id}`}>
                  <b>{f.name}</b><em className={stateClass(f.state)}>{f.state}</em>
                  {f.note && <small>{f.note}</small>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {gs.map((g) => (
        <section className="folk-group" key={g.key}>
          <h4>{g.name}{g.sub && <small>{g.sub}</small>}<span className="folk-count">{cn(g.cards.length)}人</span></h4>
          <ul>
            {g.cards.map((c) => <Row key={c.id} c={c} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} onJump={(id) => setOpen(id)} />)}
          </ul>
        </section>
      ))}
      <p className="sheet-note">情分不记数，只记几个字：初识、相熟、相得、知交。常来说说话，送对了东西，帮人办成一件事，都会近一些。名字前一点朱的，此刻在外头。</p>
    </Sheet>
  );
}
