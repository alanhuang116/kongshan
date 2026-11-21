import { ITEMS, type ItemDef } from '../../world/bag';
import { cn } from '../calendar';
import { getKs } from '../ks';
import { ui, useStore } from '../store';
import Sheet from './Sheet';

/**
 * 行囊：身上带着的东西，按收成、种子、吃食、礼物、家什、杂物分几栏；一栏一道细线，一样一行：
 * 名字、有多少（「三捆」），下面一句小字（东西自己的那句 note）。空着的时候是一只扎好的包袱与一句话。
 * 东西是什么、叫什么、论什么登记在 world/bag.ts 的 ITEMS（各路自己添的也在那里）；数目跟着世界报来的 bag 走。
 */
const KINDS: Array<[NonNullable<ItemDef['kind']>, string]> = [['crop', '收成'], ['seed', '种子'], ['food', '吃食'], ['gift', '礼物'], ['tool', '家什'], ['thing', '杂物']];
const qty = (n: number) => (n === 2 ? '两' : cn(n));

export default function BagSheet() {
  const bag = useStore(ui, (s) => s.bag);
  // 世界刚开门、还没报过时，直接问行囊
  const items = Object.keys(bag).length ? bag : (getKs()?.bag.items ?? {});
  const order = Object.keys(ITEMS);
  const list = Object.entries(items).filter(([, n]) => n > 0).map(([id, n]) => ({ def: ITEMS[id] ?? { id, name: id, unit: '' }, n }));
  list.sort((a, b) => (order.indexOf(a.def.id) + 1 || 999) - (order.indexOf(b.def.id) + 1 || 999));
  const groups = KINDS.map(([k, name]) => ({ k, name, rows: list.filter((x) => (x.def.kind ?? 'thing') === k) })).filter((g) => g.rows.length > 0);
  const kinds = list.length;
  return (
    <Sheet title="行囊" sub={kinds ? `${cn(kinds)}样` : undefined}>
      {kinds === 0 ? (
        <div className="bag-empty">
          {/* 一只扎好的包袱：几笔淡墨 */}
          <svg viewBox="0 0 120 92" aria-hidden className="bag-bundle">
            <path d="M18 70 C14 52 26 36 46 33 C52 32 56 30 60 26 C64 30 68 32 74 33 C94 36 106 52 102 70 C99 82 84 86 60 86 C36 86 21 82 18 70 Z" />
            <path d="M48 33 C44 24 38 18 30 16 M72 33 C76 24 82 18 90 16" />
            <path d="M54 28 C57 22 63 22 66 28" />
            <path d="M30 56 C46 62 74 62 90 56" className="bag-fold" />
          </svg>
          <p>行囊还是空的。</p>
          <p className="bag-empty-sub">田里收的、路上摘的、村里人送的，都放在这里；要送人、要下种，也从这里拿。</p>
        </div>
      ) : (
        groups.map((g) => (
          <section className="bag-group" key={g.k}>
            <h4>{g.name}</h4>
            <ul>
              {g.rows.map(({ def, n }) => (
                <li key={def.id} data-testid={`bag-${def.id}`}>
                  <b>{def.name}</b>
                  <span className="bag-n">{qty(n)}<small>{def.unit}</small></span>
                  {def.note && <p>{def.note}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="sheet-note">东西多了带不下的，就不收了；放在这里的都记在这台设备上。</p>
    </Sheet>
  );
}
