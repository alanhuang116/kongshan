import { cn, keyOf, today } from '../calendar';
import { patch, saved, useStore, type Entry } from '../store';
import Sheet from './Sheet';

/**
 * 起居注：在园里做过的事、观到的象，按日子一笔一笔记着。只记在这台设备上；不评、不计分。
 * 世界每做完一件事会报来一笔（kind 是事的种类，n 是几声、几杯、几丛，text 是随它记下的字）；
 * 这里把认得的写成一句平常话，不认得的照 text 原样写。
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
    default: {
      // 不认得的事：有字就照字写
      let s = t || e.kind;
      if (n > 1) s += `　${num(n)}回`;
      if (e.minutes != null && e.minutes >= 1) s += `　${cn(Math.round(e.minutes))}分`;
      return s;
    }
  }
}
export default function Journal() {
  const journal = useStore(saved, (s) => s.journal), visits = useStore(saved, (s) => s.visits);
  const days = new Map<string, string[]>();
  // 同一天里一样的话只记一行
  for (const e of journal) { const k = keyOf(new Date(e.t)), w = word(e); const d = days.get(k) ?? []; if (!d.includes(w)) d.push(w); days.set(k, d); }
  const keys = [...days.keys()].sort().reverse();
  return (
    <Sheet title="起居注" sub={`来过${cn(Math.max(1, visits))}回`}>
      {keys.length === 0 && <p className="journal-empty">还没有记下什么。<br />在园里做过的事、观到的象，会一笔一笔记在这里。</p>}
      {keys.map((k) => {
        const t = today(new Date(k + 'T12:00:00'));
        return (
          <section key={k} className="day">
            <h4>{t.lunar.split(' ')[1] ?? k}<small>{k.replace(/-/g, '.')}{t.term ? `　${t.term}` : ''}</small></h4>
            <ul>{days.get(k)!.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </section>
        );
      })}
      <div className="journal-foot">
        <p>只记在这台设备上，清掉浏览器的数据就没有了。</p>
        {keys.length > 0 && <button className="opt" onClick={() => { if (confirm('把起居注清空？（观象册不动）')) patch({ journal: [] }); }}>清空</button>}
      </div>
    </Sheet>
  );
}
