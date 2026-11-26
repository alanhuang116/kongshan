import { useEffect, useMemo, useRef, useState } from 'react';
import { GuaGlyph } from '../Gua';
import GuaCard from '../GuaCard';
import { saved, useStore } from '../store';
import { guaOf } from '../texts';
import { FANGTU, FANGTU_AXIS } from '../yi';
import Sheet from './Sheet';
import { cn } from '../calendar';
import { getKs, openSheet, placeName } from '../ks';
import { GUA } from '../../data/yi';
import { placeId } from '../../world/site';
import { takeHere } from '../../world/acts/marks';
import { marksOf } from '../../world/play/marks';

/**
 * 观象册：邵雍所传的先天方图，八八六十四卦。在园里观到的象，墨色落在它自己的那一格里，写上名字；没观到的只是淡淡的卦画。
 * 点一格已观的，下面出它的象卡（卦辞、大象注出处；白话、所见之外，册子里再添一句说明）。不计分、不催人——上面那行小字只是说到如今看过多少。
 */
export default function XiangSheet() {
  const found = useStore(saved, (s) => s.found);
  const has = useMemo(() => new Set(found.map((n) => guaOf(n)?.key ?? n)), [found]);
  // 打开时先看最近观到的那一象
  const [sel, setSel] = useState<string | null>(() => guaOf(found[found.length - 1])?.key ?? null);
  const cur = sel ? guaOf(sel) : null;
  // 点了一格：象卡在方图下面，手机上常在屏外——滚到看得见它（打开册子时不滚，先看方图）
  const wrap = useRef<HTMLDivElement>(null), picked = useRef(false);
  useEffect(() => {
    const el = wrap.current, box = el?.closest<HTMLElement>('.sheet-body');
    if (!picked.current || !el || !box) return;
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    // 只滚册页自己：卡比看得见的那一截高，上沿对到顶上；不然下沿对到底下
    if (r.bottom > b.bottom + 1) box.scrollBy({ top: r.height > b.height - 16 ? r.top - b.top - 8 : r.bottom - b.bottom + 12, behavior: 'smooth' });
  }, [sel]);
  const n = FANGTU.flat().filter((g) => has.has(g.key)).length;
  return (
    <Sheet title="观象册" sub={`已观 ${n} / 64`} wide>
      <div className="fangtu" role="grid" aria-label="先天方图">
        {FANGTU.map((row, r) => (
          <div className="fangtu-row" role="row" key={r}>
            <span className="fangtu-axis" aria-hidden><GuaGlyph lines={FANGTU_AXIS[r].lines} /><i>{FANGTU_AXIS[r].name}</i></span>
            {row.map((g) => {
              const on = has.has(g.key);
              return (
                <button key={g.key} role="gridcell" className={`cell${on ? ' is-on' : ''}${sel === g.key ? ' is-sel' : ''}`} disabled={!on} onClick={() => { picked.current = true; setSel(g.key); }} aria-label={on ? `${g.name}卦，已观` : '未观的一卦'} data-testid={`gua-${g.key}`}>
                  <GuaGlyph lines={g.lines} />
                  <span>{on ? g.name : '　'}</span>
                </button>
              );
            })}
          </div>
        ))}
        <div className="fangtu-row fangtu-foot" aria-hidden>
          <span className="fangtu-axis" />
          {FANGTU_AXIS.map((t) => <span className="fangtu-axis" key={t.id}><GuaGlyph lines={t.lines} /><i>{t.name}</i></span>)}
        </div>
      </div>
      <p className="fangtu-key">横看一行，下卦相同（左边所标）；竖看一列，上卦相同（下边所标）。乾在右下，坤在左上。</p>
      <TakeOne />
      {cur && has.has(cur.key)
        ? <div className="xiang-wrap" key={cur.key} ref={wrap}><GuaCard gua={cur} full /></div>
        : <p className="sheet-note">{n === 0 ? '册上还是空的。' : ''}《易》的卦象本是从天地间取来的。在园里走到一处、赶上那个时候，站定看一会儿，那一卦就落在这张图上它自己的位置；点一格已观的，可以再看。这里不占，不问吉凶。</p>}
    </Sheet>
  );
}

/**
 * 取一象（world/acts/marks.ts）：在外头站定，仰观取上卦、俯察取下卦，在脚下留一盏灯，路过的人看得见。
 * 下面列着自己留的灯（在哪一处、哪一象），可以收回。屋里时那一枚点不了。
 */
function TakeOne() {
  const k = getKs(), M = marksOf();
  const [, bump] = useState(0);
  useEffect(() => (M ? M.subscribe(() => bump((x) => x + 1)) : undefined), [M]);
  const out = !!k && k.nav.place.indoor < 0.5;
  const mine = M?.mine() ?? [];
  return (
    <div className="xiang-take" data-testid="xiang-take">
      <button className="key" disabled={!out} onClick={() => { if (k && takeHere(k)) openSheet(null); }} data-testid="xiang-take-go">取一象</button>
      <p>{out ? '仰观取上卦，俯察取下卦，两卦叠成一象；可以在脚下留一盏灯，路过的人看得见。观物取象，不是起卦。' : '到外头去，才好仰观俯察。'}</p>
      {mine.length > 0 && (
        <ul>
          {mine.map((m) => (
            <li key={m.key}>
              <span>{`留在${placeName(placeId(m.x, m.z)) || '园里'}的一盏：「${GUA[m.g]?.name ?? ''}」${m.local ? '（只你看得见）' : ''}`}</span>
              <button className="link" onClick={() => M?.take(m)} data-testid={`xiang-unmark-${m.key}`}>收回</button>
            </li>
          ))}
        </ul>
      )}
      {mine.length > 0 && <p className="xiang-take-n">{`一人至多留三盏，三日后自己熄。你留了${cn(mine.length)}盏。`}</p>}
    </div>
  );
}
