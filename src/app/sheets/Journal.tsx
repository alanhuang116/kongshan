import { cn, keyOf, today } from '../calendar';
import { patch, saved, useStore, type Entry } from '../store';
import Sheet from './Sheet';

/**
 * 起居注：在园里做过的事、观到的象，按日子一笔一笔记着。只记在这台设备上；不评、不计分。
 * 世界每做完一件事会报来一笔（kind 是事的种类，n 是几声、几杯、几丛，text 是随它记下的字）；
 * 这里把认得的写成一句平常话，不认得的照 text 原样写。
 * 田里的活（kind farm，text 是做完的那件：割麦、打场……）一天并成一行「今日农事：割麦、打场、扬场」，句前一个小小的「田」字。
 */
/** 「两」声、「两」杯（别的数照常） */
const num = (n: number) => (n === 2 ? '两' : cn(n));
function word(e: Entry): string {
  const t = (e.text ?? '').trim(), n = Math.max(0, Math.round(e.n ?? 0));
  switch (e.kind) {
    case 'xiang': return t ? `观得一象：${t}` : '观得一象';
    case 'poem': return t ? `写了两句：${t}` : '写了两句';
    case 'read': {
      const m = /^(\S+?)\s*(\d+)\s*页$/.exec(t);
      if (m) return `读《${m[1]}》${num(Number(m[2]))}页`;
      if (t === '小车') return '在小车上坐了一会儿';
      return t ? `读${t}` : '读书';
    }
    case 'qin': return n > 0 ? `抚琴${num(n)}声` : '抚琴';
    case 'tea': return '煮茶一壶';
    case 'wine': return n >= 3 ? `自斟${num(n)}杯，微醉即止` : n > 0 ? `自斟${num(n)}杯` : '自斟';
    case 'rest': return '在榻上歇了一觉';
    case 'guan': return t || '观物';
    case 'bagua': return '在八卦盘上环视八方';
    case 'mums': return n > 0 ? `浇菊${num(n)}丛` : '浇菊';
    case 'roadTea': return '在茶亭喝了一碗茶';
    case 'talk': return t ? (t.startsWith('问') ? t : `与${t}说了几句`) : '与人说了几句';
    case 'dipper': return t ? `认北斗，${t}` : '认北斗';
    // 托事办成了：text 是托事的名字
    case 'favor': return t ? `替人办成：${t}` : '替人办成了一件事';
    default: {
      // 不认得的事：有字就照字写
      let s = t || e.kind;
      if (n > 1) s += `　${num(n)}回`;
      if (e.minutes != null && e.minutes >= 1) s += `　${cn(Math.round(e.minutes))}分`;
      return s;
    }
  }
}
interface Line { text: string; farm?: boolean }
export default function Journal() {
  const journal = useStore(saved, (s) => s.journal), visits = useStore(saved, (s) => s.visits);
  const days = new Map<string, Line[]>(), farm = new Map<string, string[]>();
  // 同一天里一样的话只记一行；田里的活另收一处，并成一行（放在那一天头一件农活的位置）
  for (const e of journal) {
    const k = keyOf(new Date(e.t)), d = days.get(k) ?? [];
    if (e.kind === 'farm') {
      const t = (e.text ?? '').trim() || '田里的活', f = farm.get(k) ?? [];
      if (!f.length) d.push({ text: '', farm: true });
      if (!f.includes(t)) f.push(t);
      farm.set(k, f);
    } else { const w = word(e); if (!d.some((x) => !x.farm && x.text === w)) d.push({ text: w }); }
    days.set(k, d);
  }
  const todayKey = keyOf(new Date());
  for (const [k, f] of farm) for (const x of days.get(k) ?? []) if (x.farm) x.text = `${k === todayKey ? '今日农事' : '农事'}：${f.join('、')}`;
  const keys = [...days.keys()].sort().reverse();
  return (
    <Sheet title="起居注" sub={`来过${cn(Math.max(1, visits))}回`}>
      {keys.length === 0 && <p className="journal-empty">还没有记下什么。<br />在园里做过的事、观到的象，会一笔一笔记在这里。</p>}
      {keys.map((k) => {
        const t = today(new Date(k + 'T12:00:00'));
        return (
          <section key={k} className="day">
            <h4>{t.lunar.split(' ')[1] ?? k}<small>{k.replace(/-/g, '.')}{t.term ? `　${t.term}` : ''}</small></h4>
            <ul>{days.get(k)!.map((w, i) => <li key={i} className={w.farm ? 'is-farm' : undefined}>{w.text}</li>)}</ul>
          </section>
        );
      })}
      <div className="journal-foot">
        <p>只记在这台设备上，清掉浏览器的数据就没有了。</p>
        {keys.length > 0 && <button className="link" onClick={() => { if (confirm('把起居注清空？（观象册不动）')) patch({ journal: [] }); }}>清空</button>}
      </div>
    </Sheet>
  );
}
