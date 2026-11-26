import { useEffect, useMemo, useState } from 'react';
import { boards, onBoard, rows, type BoardKey } from '../../world/play/board';
import { DAXUE_FROM, DAXUE_GLOSS, DAXUE_LINES, LEVELS, XIU_WAYS, levelOf, onXiu, readXiu } from '../../world/play/xiuwei';
import { TIERS, fmtSit } from '../../world/play/study/vision';
import { lectureOf, nextGroupWhen } from '../../world/play/lecture';
import { SLOT_MIN } from '../../world/play/study/schedule';
import { GUA } from '../../data/yi';
import { getTogether } from '../../world/net';
import { cn } from '../calendar';
import { getKs, goDo } from '../ks';
import { legacyPref, pref, setPref, ui, useStore } from '../store';
import Sheet from './Sheet';

/**
 * 修为：在园里读书、听讲、答问、静坐、观象攒起来的工夫（world/play/xiuwei.ts）。
 *   上头 —— 此刻在第几重（《大学》「知止而后有定……」那一句里的字），离下一重还差几分；
 *   怎么长 —— 几样学的事各长几分（一日的上限）；
 *   学堂 —— 邵先生什么时候在村塾讲卦、此刻讲到哪里、下一讲讲哪一卦；
 *   打坐 —— 一时、一夜、一月、一岁、入定：修为到哪一重能深到哪一境，自己到过几境；
 *   榜 —— 修为、答题、打坐，连同各样玩法自己登记的榜（射箭、蹴鞠……），一张一张翻：自己、村里人、同游同屋的人。
 * 数都从世界现取；修为、榜有变就重画，学堂的那一行一秒看一回。
 */
const RANK = (i: number) => cn(i + 1);
const pad = (n: number) => String(n).padStart(2, '0');

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

/** 学堂那一段：此刻有没有讲、讲到哪；什么时候讲 */
function School() {
  useTick(1000);
  const k = getKs(), L = lectureOf();
  const act = useStore(ui, (s) => s.act);
  if (!k || !L) return null;
  const v = L.view(), ph = v.phase, group = v.group;
  const m = readXiu(k), heard = m.heard.length;
  let now = '';
  if (v.plan && v.on) {
    const name = v.plan.lesson.gua.name;
    now = ph.kind === 'gather' ? `邵先生正往村塾来，这一讲说「${name}」` : ph.kind === 'line' ? `邵先生在村塾讲「${name}」（第${cn(ph.i + 1)}句）` : ph.kind === 'ask' ? `邵先生讲完「${name}」，正在问` : `「${name}」讲完了，正说谁答得好`;
  }
  let next = '';
  if (group && k.shared) {
    const n = nextGroupWhen(Date.now(), k.shared.tz);
    next = n ? `下一讲在 ${n}` : '园中这会儿是夜里，天亮以后再讲';
  } else {
    const i = heard >= 64 ? (m.last + 1) % 64 : (() => { const s = new Set(m.heard); for (let j = 0; j < 64; j++) if (!s.has(j)) return j; return 0; })();
    const rest = Math.max(0, L.restUntil - Date.now());
    next = `下一讲说「${GUA[i].name}」${rest > 0 ? `（先生歇着，${cn(Math.ceil(rest / 60000))}分钟后再来）` : ''}`;
  }
  return (
    <section className="xiu-sec" data-testid="xiu-school">
      <h4>学堂</h4>
      {now && (
        <p className="xiu-now">
          <span>{now}</span>
          {act !== 'lecture' && <button className="key" onClick={() => void goDo('lecture')} data-testid="xiu-go-lecture">去听</button>}
        </p>
      )}
      <p className="xiu-line">{group
        ? `同游：园中白天（辰时到申时），钟上逢整${cn(SLOT_MIN)}分（:00、:${pad(SLOT_MIN)}……）开讲一回，同屋的人听的是同一讲。`
        : '独游：白天走到村塾前站一站，先生就回来开讲；讲完歇三分钟（没来听的歇十分钟）。'}</p>
      <p className="xiu-line">{next}。{heard ? `已听过${cn(heard)}卦。` : '还没有听过。'}先生从乾讲起，一卦一卦往下讲；六领席三领是孩子们的，空着的谁先坐谁得。</p>
    </section>
  );
}

/** 一张榜 */
function Board({ k: key }: { k: BoardKey }) {
  const ks = getKs();
  const def = boards().find((b) => b.key === key);
  if (!ks || !def) return null;
  const rs = rows(ks, key);
  return (
    <div className="xiu-board" data-testid={`xiu-board-${key}`}>
      {def.note && <p className="xiu-board-note">{def.note}</p>}
      {rs.length ? (
        <ol className="xiu-rows">
          {rs.map((r, i) => (
            <li key={`${r.name}-${i}`} className={r.me ? 'is-me' : ''} data-testid={r.me ? 'xiu-me' : undefined}>
              <span className="xiu-rank">{RANK(i)}</span>
              <span className="xiu-name">{r.name}<small>{r.me ? '你' : r.folk ? '村里' : '同游'}</small></span>
              <span className="xiu-score">{r.text}</span>
            </li>
          ))}
        </ol>
      ) : <p className="xiu-board-note">榜上还没有人。</p>}
      {!rs.some((r) => r.me) && <p className="xiu-board-note">你还没有上这张榜。</p>}
    </div>
  );
}

export default function XiuSheet() {
  const [, bump] = useState(0);
  useEffect(() => { const a = onXiu(() => bump((n) => n + 1)), b = onBoard(() => bump((n) => n + 1)); const t = setInterval(() => bump((n) => n + 1), 4000); return () => { a(); b(); clearInterval(t); }; }, []);
  const k = getKs();
  const m = k ? readXiu(k) : null;
  const pts = m?.pts ?? 0;
  const { level, next, toNext, frac } = levelOf(pts);
  const list = boards();
  const [tab, setTab] = useState<BoardKey>(() => pref('xiuTab', legacyPref('anlewo:xiu:tab') ?? 'xiu') as BoardKey);
  const cur = list.some((b) => b.key === tab) ? tab : list[0]?.key ?? 'xiu';
  const pick = (key: BoardKey) => { setTab(key); setPref('xiuTab', key); };
  const tiers = useMemo(() => new Set(m?.tiers ?? []), [m?.tiers]);
  const sitBest = k ? rows(k, 'sit').find((r) => r.me) : null;
  const used = m?.used ?? {};
  return (
    <Sheet title="修为" sub={`${level.name} · ${cn(pts)}分`} wide>
      <div className="xiu" data-testid="xiu">
        <section className="xiu-head">
          <b className="xiu-char" aria-label={`此刻在「${level.name}」`}>{level.name}</b>
          <div className="xiu-head-r">
            <p className="xiu-pts">{cn(pts)}分</p>
            {next ? <p className="xiu-next">再长{cn(toNext)}分，到「{next.name}」</p> : <p className="xiu-next">到了顶</p>}
            <i className="xiu-bar" aria-hidden><b style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, frac)).toFixed(3)})` }} /></i>
          </div>
        </section>
        <ol className="xiu-steps" aria-label="六重">
          {LEVELS.map((l) => <li key={l.i} className={l.i < level.i ? 'is-past' : l.i === level.i ? 'is-cur' : ''}><span>{l.name}</span><small>{cn(l.at)}</small></li>)}
        </ol>
        {DAXUE_LINES.length > 0 && (
          <figure className="xiu-quote">
            <blockquote>
              <p>{DAXUE_LINES.map((l, i) => <span key={i} className={i === Math.max(0, level.i - 1) ? 'is-cur' : ''}>{l}{i < DAXUE_LINES.length - 1 ? '，' : '。'}</span>)}</p>
            </blockquote>
            <figcaption>——{DAXUE_FROM}</figcaption>
            {DAXUE_GLOSS && <p className="xiu-gloss"><i>白话</i>{DAXUE_GLOSS}</p>}
          </figure>
        )}

        <section className="xiu-sec">
          <h4>怎么长</h4>
          <ul className="xiu-ways">
            {XIU_WAYS.map((w) => <li key={w.name}><b>{w.name}</b><span>{w.how}</span></li>)}
          </ul>
          <p className="xiu-line">今日：打坐长了{cn(used.sit ?? 0)}分（至多十五），听讲{cn(used.lecture ?? 0)}回，读书{cn(used.book ?? 0)}回、抚琴{cn(used.qin ?? 0)}回。射箭、蹴鞠这些玩法有自己的榜，不长修为。</p>
        </section>

        <School />

        <section className="xiu-sec" data-testid="xiu-sit">
          <h4>打坐</h4>
          <p className="xiu-now">
            <span>溪边柳下的平石上，盘腿坐着不动，便一境一境地深下去；动一动就慢慢出来。{sitBest ? `最深一回：${fmtSit(sitBest.v)}。` : ''}</span>
            <button className="key" onClick={() => void goDo('sit')} data-testid="xiu-go-sit">去坐</button>
          </p>
          <ol className="xiu-tiers">
            {TIERS.map((t, i) => {
              const ok = level.i >= t.need, been = tiers.has(i);
              return (
                <li key={t.id} className={`${ok ? 'is-ok' : ''}${been ? ' is-been' : ''}`}>
                  <b>{t.name}</b>
                  <span>{t.note}</span>
                  <small>{been ? '到过' : ok ? '能到' : `修为到「${LEVELS[t.need].name}」`}</small>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="xiu-sec">
          <h4>榜</h4>
          <div className="xiu-tabs" role="tablist" aria-label="哪一张榜">
            {list.map((b) => <button key={b.key} role="tab" aria-selected={cur === b.key} className={cur === b.key ? 'is-on' : ''} onClick={() => pick(b.key)} data-testid={`xiu-tab-${b.key}`}>{b.name}</button>)}
          </div>
          <Board k={cur} />
          {getTogether()?.view.ext ? null : <p className="xiu-board-note">同游连上了，同屋的人也在榜上。</p>}
        </section>
        <p className="sheet-note">几重的名字取《礼记·大学》那一句；打坐时眼前的天象跟着修为走。先生讲卦时，卦辞、大象是《周易》原文，白话与先生连缀的话是本应用写的——这里不起卦，不问吉凶，卦只当象看。</p>
      </div>
    </Sheet>
  );
}
