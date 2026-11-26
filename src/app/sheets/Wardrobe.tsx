import { useEffect, useState } from 'react';
import { ATTIRE, ATTIRE_BY_ID, CAT_MAX, CAT_NAME, type AttireCat, type AttireItem } from '../../data/attire';
import { DEFAULT_WEAR, cleanWear, fits, sameWear, type Wear } from '../../world/avatar/dress';
import { getTogether } from '../../world/net';
import { nameOf } from '../../world/net/proto';
import { cn } from '../calendar';
import { getKs } from '../ks';
import { buy, owns, ownedSet, payAdapter, priceText, syncOwned } from '../shop';
import AttireIcon from '../shop/icons';
import { addNote } from '../store';
import Sheet from './Sheet';

/**
 * 衣饰：一只衣箱、一间铺子，在同一页里。分四栏：衣、冠髻、簪饰、佩。
 *   点一样就试穿——画里的人转过身来（镜头到他正面：看衣是全身，看冠、簪凑近头上，看佩凑近腰间），那一样就在身上；
 *   再点一下簪、佩是摘下来。衣箱里有的（带着来的、买过的）点「穿上这一身」就换好了（存下来，同游的人也看得见）；
 *   没有的写着价钱，点「买」——付成了收进衣箱。付款要服务器那边开通（shop/index.ts）；没开通时说一声，可以先试穿着看。
 *   收起这一页：没穿上的试穿都还回去。
 * 底下一行小字链接可以改换男女（郎君、娘子）。
 */
const CATS: AttireCat[] = ['yi', 'guan', 'zan', 'pei'];
const FOCUS: Record<AttireCat, 'body' | 'head' | 'waist'> = { yi: 'body', guan: 'head', zan: 'head', pei: 'waist' };
const qty = (n: number) => (n === 2 ? '两' : cn(n));

/** 册页在哪：手机竖着从底下升起（矮一些，人在上头），横着与宽屏在右边（人在左边） */
function frameFor(): { x: number; y: number; fill: number } {
  const w = window.innerWidth, h = Math.max(1, window.innerHeight);
  if (h <= 520) return { x: -0.6, y: 0, fill: 0.74 };
  if ((w <= 720 && h >= 521) || (w / h < 0.75 && w <= 900)) return { x: 0, y: 0.52, fill: 0.38 };
  return { x: -0.33, y: 0, fill: 0.66 };
}

/** 试穿：点了这一样——衣、冠换成它；簪、佩戴上（满了摘下最早戴的那一样），再点是摘下 */
function toggle(w: Wear, a: AttireItem): Wear {
  if (a.cat === 'yi') return { ...w, yi: a.id };
  if (a.cat === 'guan') return { ...w, guan: a.id };
  const key = a.cat, list = w[key];
  if (list.includes(a.id)) return { ...w, [key]: list.filter((x) => x !== a.id) };
  const next = [...list, a.id];
  while (next.length > CAT_MAX[a.cat]) next.shift();
  return { ...w, [key]: next };
}
const wornIn = (w: Wear, id: string) => w.yi === id || w.guan === id || w.zan.includes(id) || w.pei.includes(id);

export default function Wardrobe() {
  const k = getKs();
  const [cat, setCat] = useState<AttireCat>('yi');
  const [draft, setDraft] = useState<Wear>(() => k?.wear ?? cleanWear(null));
  const [sel, setSel] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [ask, setAsk] = useState<AttireItem | null>(null);
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState('');
  const [swap, setSwap] = useState(false);
  const sex = draft.sex;

  // 打开：接了服务器的，把那边记着的买过的并进来；收起：镜头回到身后，没穿上的试穿还回去
  useEffect(() => {
    if (k) void syncOwned(k).then(() => setTick((t) => t + 1));
    return () => { const kk = getKs(); if (!kk) return; kk.setMirror(null); kk.setWear(kk.wear, false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 镜头：看衣是全身，看冠、簪凑近头，看佩凑近腰；转了屏重新取景
  useEffect(() => {
    const f = () => getKs()?.setMirror({ focus: FOCUS[cat], frame: frameFor() });
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, [cat]);
  // 试穿：草稿穿在身上（不存）
  useEffect(() => { getKs()?.setWear(draft, false); }, [draft]);

  if (!k) return null;
  const has = ownedSet(k), own = (id: string) => owns(k, id);
  const items = ATTIRE.filter((a) => a.cat === cat && fits(a, sex));
  const selItem = sel ? ATTIRE_BY_ID.get(sel) ?? null : null;
  const changed = !sameWear(draft, k.wear);
  const missing = [draft.yi, draft.guan, ...draft.zan, ...draft.pei].map((id) => ATTIRE_BY_ID.get(id)).filter((a): a is AttireItem => !!a && !own(a.id));
  const boxN = ATTIRE.filter((a) => fits(a, sex) && (a.price === 0 || has.has(a.id))).length;
  const pay = payAdapter();

  const pick = (a: AttireItem) => { setSel(a.id); setMsg(''); setDraft((w) => cleanWear(toggle(w, a))); };
  const wearIt = () => {
    if (missing.length) { setSel(missing[0].id); setCat(missing[0].cat); setMsg(`还差${qty(missing.length)}样没买：${missing.map((a) => a.name).join('、')}`); return; }
    k.setWear(draft);
    addNote('换好了这一身', 'wear');
    setMsg('');
  };
  const revert = () => { setDraft(k.wear); setSel(null); setMsg(''); };
  const doBuy = async (a: AttireItem) => {
    setPaying(true); setMsg('');
    const r = await buy(k, a);
    setPaying(false); setAsk(null);
    if (r.ok) { setTick((t) => t + 1); addNote(`「${a.name}」收进衣箱了`, 'wear'); }
    else if (r.why === 'closed') setMsg('付款还没开通：开通以后在这里付（要服务器那边接上收款）。先试穿着看。');
    else setMsg(`没付成：${r.why ?? '再试一回'}`);
  };
  const doSwap = () => {
    const other: 'm' | 'f' = sex === 'm' ? 'f' : 'm', w = DEFAULT_WEAR[other];
    const tg = getTogether();
    if (tg && !tg.nameFits(other)) tg.reroll(other);
    k.setPersona({ sex: other, name: tg ? nameOf(tg.me.n) : k.persona.name });
    k.setWear(w);
    setDraft(w); setSel(null); setSwap(false); setCat('yi');
    addNote(other === 'f' ? '换作了娘子' : '换作了郎君', 'wear');
  };

  return (
    <Sheet title="衣饰" sub={`衣箱 · ${cn(boxN)}样`} cls="sheet-wardrobe">
      <div className="wd" data-testid="wardrobe">
        <div className="seg wd-tabs" role="tablist" aria-label="衣饰分栏">
          {CATS.map((c) => (
            <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'is-on' : ''} onClick={() => setCat(c)} data-testid={`wd-cat-${c}`}>{CAT_NAME[c]}</button>
          ))}
        </div>

        {selItem && selItem.cat === cat && (
          <section className="wd-detail" key={selItem.id} data-testid="wd-detail">
            <div className="wd-detail-art"><AttireIcon item={selItem} /></div>
            <div className="wd-detail-text">
              <h4>{selItem.name}{own(selItem.id) ? <small className="wd-own">{selItem.price === 0 ? '带着来的' : '衣箱里有'}</small> : <small className="wd-price">{priceText(selItem.price)}</small>}</h4>
              <p>{selItem.note}</p>
              {!own(selItem.id) && (
                <button className="key is-main wd-buy" onClick={() => setAsk(selItem)} data-testid="wd-buy"><span>买 {priceText(selItem.price)}</span></button>
              )}
            </div>
          </section>
        )}

        <ul className="wd-grid" data-testid="wd-grid">
          {items.map((a) => {
            const on = wornIn(draft, a.id), mine = own(a.id);
            return (
              <li key={a.id}>
                <button className={`wd-item${on ? ' is-on' : ''}${sel === a.id ? ' is-sel' : ''}`} onClick={() => pick(a)} aria-pressed={on} data-testid={`wd-item-${a.id}`}>
                  <span className="wd-art"><AttireIcon item={a} /></span>
                  <span className="wd-name">{a.name}</span>
                  <small className={mine ? 'wd-tag' : 'wd-tag is-price'}>{on ? '试穿着' : mine ? (a.price === 0 ? '带着来的' : '衣箱里有') : priceText(a.price)}</small>
                </button>
              </li>
            );
          })}
        </ul>

        {msg && <p className="wd-msg" role="status" data-testid="wd-msg">{msg}</p>}

        <div className="wd-foot">
          {changed ? (
            <>
              <button className="key is-main" onClick={wearIt} data-testid="wd-wear"><span>{missing.length ? `穿上（还差${qty(missing.length)}样没买）` : '穿上这一身'}</span></button>
              <button className="link" onClick={revert} data-testid="wd-revert">换回原来的</button>
            </>
          ) : <p className="wd-hint">点一样，穿在身上看看；簪、佩再点一下是摘下来。</p>}
          {swap ? (
            <p className="wd-swap">
              换作{sex === 'm' ? '娘子' : '郎君'}？身上换回带着来的那一身，买过的都还在衣箱里。
              <button className="link" onClick={doSwap} data-testid="wd-swap-yes">换</button>
              <button className="link" onClick={() => setSwap(false)}>不换</button>
            </p>
          ) : <button className="link wd-swap-link" onClick={() => setSwap(true)} data-testid="wd-swap">换作{sex === 'm' ? '娘子' : '郎君'}</button>}
        </div>

        {ask && (
          <div className="wd-ask" role="dialog" aria-label={`买${ask.name}`} data-testid="wd-ask">
            <div className="wd-ask-card glass">
              <div className="wd-ask-art"><AttireIcon item={ask} /></div>
              <h4>{ask.name}</h4>
              <p className="wd-ask-price">{priceText(ask.price)}</p>
              <p className="wd-ask-note">{pay ? `用${pay.label ?? '线上付款'}付。付成了收进衣箱，换了地方也穿得出来。` : '付款还没开通：开通以后在这里付（要服务器那边接上收款）。先试穿着看。'}</p>
              <div className="wd-ask-keys">
                {pay ? <button className="key is-main" disabled={paying} onClick={() => void doBuy(ask)} data-testid="wd-pay"><span>{paying ? '正在付……' : '付款'}</span></button> : null}
                <button className="link" onClick={() => setAsk(null)} data-testid="wd-ask-close">{pay ? '再想想' : '知道了'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
