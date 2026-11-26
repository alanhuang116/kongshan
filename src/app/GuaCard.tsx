import { useLayoutEffect, useRef } from 'react';
import { sceneOf } from '../data/gua64';
import { GuaGlyph } from './Gua';
import { useBrush } from './face';
import type { Gua } from './texts';
import { bodyOf } from './yi';

/**
 * 象卡（观象时的面板里、观象册里都用）。自上而下：
 *   一卦的六爻（draw 时自下而上一爻一爻写出来）、卦名、由哪两个三画卦叠成；
 *   古人的话——卦辞（《周易》经文）、大象（《象传》），楷字，各注出处；
 *   本应用自己的话——白话、所见（站在那一处、赶上那个时候眼前是什么），字小一号，与上面隔一道细线；
 *   full（观象册里）再添一句说明。
 * 卦辞、大象、白话从 texts（yi.ts）来；所见与说明从 data/gua64.ts 来（都是照录的原文）。文字没备好的那一项就不出。
 */
export default function GuaCard({ gua, draw, full, plain }: { gua: Gua; draw?: boolean; /** 观象册里：连说明一起 */ full?: boolean; /** 只有卦本身（取一象、路标：那是游人自己取的象，不是园里那一处的「所见」） */ plain?: boolean }) {
  const brush = useBrush(gua.name);
  const sc = sceneOf(gua.key);
  const ref = useRef<HTMLElement>(null);
  // 面板里显出一卦时从头看起：同一件事前一步的话（书页、诗）若往下滚过，板子不会自己回到顶上
  useLayoutEffect(() => { if (draw) { const box = ref.current?.closest('.panel-body'); if (box) box.scrollTop = 0; } }, [draw]);
  const ours: Array<[string, string]> = [];
  if (gua.gloss) ours.push(['白话', gua.gloss]);
  if (sc?.view && !plain) ours.push(['所见', sc.view]);
  if (full && sc?.note && !plain) ours.push(['说明', sc.note]);
  return (
    <article ref={ref} className={`xiang${draw ? ' is-draw' : ''}${full ? ' is-full' : ''}`} data-testid="gua-card">
      <div className="xiang-top">
        <GuaGlyph lines={gua.lines} draw={draw} label={`${gua.name}卦的卦画`} />
        <div className="xiang-name">
          <h4 className={brush ? '' : 'is-kai'}>{gua.name}</h4>
          <p>{bodyOf(gua)}</p>
        </div>
      </div>
      {(gua.judgment || gua.image) && (
        <div className="xiang-jing">
          {gua.judgment && (
            <figure className="xiang-quote xiang-judg">
              <blockquote><p>{gua.judgment}</p></blockquote>
              <figcaption>——《周易·{gua.name}》</figcaption>
            </figure>
          )}
          {gua.image && (
            <figure className="xiang-quote xiang-image">
              <blockquote><p><i>象曰</i>{gua.image}</p></blockquote>
              <figcaption>——《周易·象传》</figcaption>
            </figure>
          )}
        </div>
      )}
      {ours.length > 0 && (
        <dl className="xiang-ours">
          {ours.map(([k, v]) => (
            <div key={k} className={`xiang-row is-${k === '白话' ? 'gloss' : k === '所见' ? 'view' : 'note'}`}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
