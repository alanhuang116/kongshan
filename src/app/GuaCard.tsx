import { GuaGlyph } from './Gua';
import { useBrush } from './face';
import type { Gua } from './texts';
import { bodyOf } from './yi';

/**
 * 象卡：一卦的六爻（draw 时自下而上一爻一爻写出来）、卦名、由哪两个三画卦叠成，
 * 下面是《大象传》的那一句与一句白话。文字还没备好时只有卦画、卦名与卦体。
 */
export default function GuaCard({ gua, draw }: { gua: Gua; draw?: boolean }) {
  const brush = useBrush(gua.name);
  return (
    <article className="xiang">
      <div className="xiang-top">
        <GuaGlyph lines={gua.lines} draw={draw} label={`${gua.name}卦的卦画`} />
        <div className="xiang-name">
          <h4 className={brush ? '' : 'is-kai'}>{gua.name}</h4>
          <p>{bodyOf(gua)}</p>
        </div>
      </div>
      {gua.image && <p className="xiang-image"><i>象曰</i>{gua.image}</p>}
      {gua.gloss && <p className="xiang-gloss">{gua.gloss}</p>}
    </article>
  );
}
