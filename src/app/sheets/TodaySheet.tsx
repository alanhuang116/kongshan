import { FAVORS } from '../../data/favors';
import { FOLK } from '../../data/folk';
import type { Act } from '../../world/acts/types';
import { placeAt } from '../../world/walk';
import { branchOf, cn } from '../calendar';
import { getKs, goDo, openSheet, placeName, SUN } from '../ks';
import { saved, ui, useStore } from '../store';
import { XIAOXI } from '../texts';
import Sheet from './Sheet';

/**
 * 「今日」：今天能做什么。
 *   此刻宜 —— 按此刻的时辰、季节、天气挑几件合时的事（那件事此刻做不了的不列），每件一句话说它是什么、在哪里，点「去」就走过去做起来；
 *   田里   —— 此刻田里、场上能做的活（翻地、下种、浇水、打场、推磨……）；
 *   托事   —— 村里人托的、还没办完的事（谁托的、怎么算办成）；
 *   慢慢来 —— 观象册、星图记到了几成。
 * 话都是本应用自撰的。底下一行可以再看一遍「初到」。
 */

/** 每件事一句话：它是什么（地方另外写） */
const LINES: Record<string, string> = {
  couplet: '门上一副联，出门前读一读', book: '书案上摊着书，翻几页', qin: '抚一曲琴，望着院子', tea: '生火，煮一壶茶', wine: '自斟一杯，看天色慢慢暗下来',
  couch: '榻上歪一会儿', scroll: '看墙上那幅先天图', mums: '院里的菊，浇一浇', broom: '扫一扫院里的落叶', cart: '推那辆小车出去走走', roadTea: '路边讨一碗茶',
  guan: '亭上坐看云起', nap: '亭上打个盹', bagua: '转一转亭里的八卦盘', dipper: '晴夜里认一认北斗', stars: '抬头观星，点一处问它是什么', lantern: '天暗了，把灯点上',
  chime: '檐下的风铃，听一听', kite: '起风了，放纸鸢', swing: '荡一回秋千', fishing: '溪边垂钓', skip: '水边打几个水漂', boat: '摇橹出去，在水上转转',
  pitchpot: '投壶：拉开、松手，看投不投得中', snowman: '下雪了，堆一个雪人', hens: '撒一把谷喂鸡', eggs: '鸡窝里捡蛋', fishFeed: '池边喂鱼', dog: '摸摸门口的狗',
  cat: '逗一逗猫', ducks: '把鸭子赶回去', ants: '蹲下来看蚂蚁搬家', oxHay: '给牛添一把草', henCatch: '把走散的母鸡抱回来',
};
/** 田里、场上的活：一句话说它是什么 */
const FARM: Record<string, string> = {
  翻地: '田里翻地（翻过的地才好下种）', 下种: '翻过的地里下种', 浇水: '挑着水去浇地', 锄草: '苗间的草锄一锄', 挑麦: '割下的麦捆挑到场上', 取回: '把落在路上的担子挑回来',
  挑起: '把放下的担子重新挑起来', 帮割: '麦田里帮着割麦', 打水: '井边、溪边打水（浇地用）', 摘桃: '桃熟了，摘几个', 采桑: '桑树上采桑叶', 打场: '场上打麦（连枷）',
  扬场: '迎着风扬场，把糠扬走', 推磨: '推磨，把麦磨成面', 舂米: '舂米，把谷舂成米',
};
/** 一天里的几段：每段先提哪几件 */
const BANDS: Array<{ name: string; to: number; ids: string[] }> = [
  { name: '清晨', to: 7.5, ids: ['couplet', 'broom', 'hens', 'eggs', 'mums', 'tea', 'qin', 'dog'] },
  { name: '上午', to: 11.5, ids: ['book', 'mums', 'kite', 'fishing', 'pitchpot', 'swing', 'cart', 'guan', 'fishFeed', 'snowman'] },
  { name: '晌午', to: 14, ids: ['nap', 'tea', 'roadTea', 'couch', 'ants', 'fishFeed', 'chime', 'snowman'] },
  { name: '午后', to: 17, ids: ['qin', 'boat', 'skip', 'fishing', 'pitchpot', 'ducks', 'oxHay', 'kite', 'swing', 'snowman'] },
  { name: '傍晚', to: 19.5, ids: ['wine', 'lantern', 'dog', 'cat', 'hens', 'mums', 'chime', 'qin'] },
  { name: '夜里', to: 99, ids: ['stars', 'dipper', 'lantern', 'wine', 'scroll', 'bagua', 'book', 'couch'] },
];
/** 下雨、下雪时先提屋里、檐下的事 */
const WET = ['tea', 'qin', 'book', 'scroll', 'wine', 'couch', 'chime', 'bagua'];
const OUT = new Set(['kite', 'swing', 'boat', 'skip', 'pitchpot', 'fishing', 'cart', 'ants', 'ducks', 'guan', 'nap', 'stars', 'dipper', 'mums', 'broom']);
const SEASON: Record<string, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

const on = (a: Act) => { const f = (a as Act & { on?(): boolean }).on; try { return f ? !!f.call(a) : true; } catch { return false; } };
const where = (a: Act) => placeName(placeAt(a.spot.x, a.spot.z).id);
const npc = (id: string) => FOLK.find((f) => f.id === id)?.name ?? '';
const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, id: string) => npc(id) || '村里人');

interface Item { id: string; name: string; line: string; at: string; d: number }

function plan(): { band: string; now: Item[]; farm: Item[] } {
  const k = getKs();
  if (!k) return { band: '', now: [], farm: [] };
  const h = k.atmos.hour, s = k.season, rain = k.atmos.w.rain > 0.45, snow = k.atmos.w.snow > 0.45;
  const [rise] = SUN[s];
  // 天亮之前也算「夜里」
  const hh = h < rise - 0.6 ? h + 24 : h;
  const band = BANDS.find((b) => hh < b.to) ?? BANDS[BANDS.length - 1];
  const p = k.player.pos, dist = (a: Act) => Math.hypot(a.spot.x - p.x, a.spot.z - p.z);
  const order = rain || snow ? [...(snow ? ['snowman'] : []), ...WET, ...band.ids] : band.ids;
  const seen = new Set<string>(), now: Item[] = [];
  for (const id of order) {
    if (seen.has(id) || now.length >= 6) continue;
    seen.add(id);
    const a = k.acts[id];
    if (!a || !LINES[id] || ((rain || snow) && OUT.has(id) && id !== 'snowman') || !on(a)) continue;
    now.push({ id, name: a.name, line: LINES[id], at: where(a), d: dist(a) });
  }
  // 田里：同名的活（几块地都能浇水）只列最近的那一处
  const farm = new Map<string, Item>();
  for (const a of Object.values(k.acts)) {
    if (!a.id.startsWith('farm:') || !FARM[a.name] || !on(a)) continue;
    const it = { id: a.id, name: a.name, line: FARM[a.name], at: where(a), d: dist(a) };
    const was = farm.get(a.name);
    if (!was || it.d < was.d) farm.set(a.name, it);
  }
  return { band: band.name, now, farm: [...farm.values()].sort((x, y) => x.d - y.d).slice(0, 6) };
}

function favors(): Array<{ id: string; name: string; line: string; who: string }> {
  const f = (saved.get().world.folk as { f?: Record<string, { s?: string }> } | undefined)?.f ?? {};
  return FAVORS.filter((d) => f[d.id]?.s === 'on' || f[d.id]?.s === 'half').map((d) => ({
    id: d.id, name: fill(d.name), who: npc(d.from), line: fill(f[d.id]?.s === 'half' && d.note.half ? d.note.half : d.note.on),
  }));
}

/** 远近：不报米数，只说个大概 */
const howFar = (d: number) => (d < 6 ? '就在跟前' : d < 25 ? '几步路' : d < 70 ? '要走一会儿' : '要走一阵');
function Row({ it, here }: { it: Item; here: boolean }) {
  return (
    <li className="today-row">
      <div className="today-what">
        <b>{it.name}</b>
        <span className="today-line">{it.line}</span>
        <small>{it.at ? `在${it.at}，` : ''}{howFar(it.d)}</small>
      </div>
      <button className="key" onClick={() => void goDo(it.id)} disabled={here} data-testid={`today-go-${it.id}`} aria-label={`去${it.name}`}>{here ? '在做' : '去'}</button>
    </li>
  );
}

export default function TodaySheet() {
  // 时辰换了重排（画里的钟点每秒都在走）
  const branch = useStore(ui, (s) => branchOf(s.hour));
  const day = useStore(ui, (s) => s.day);
  const act = useStore(ui, (s) => s.act);
  const found = useStore(saved, (s) => s.found.length);
  const stars = useStore(saved, (s) => { const v = (s.world.stars as { seen?: unknown[] } | undefined)?.seen; return Array.isArray(v) ? v.length : 0; });
  useStore(saved, (s) => s.world.folk);
  const k = getKs();
  const { band, now, farm } = plan();
  const fav = favors();
  const season = k ? SEASON[k.season] : '';
  return (
    <Sheet title="今日" sub={`第${cn(day + 1)}日 · ${season}${band ? ` · ${band}` : ''} · ${XIAOXI[branch].branch}时`}>
      <div className="today" data-testid="today">
        <section className="today-sec">
          <h4>此刻宜</h4>
          {now.length ? <ul>{now.map((it) => <Row key={it.id} it={it} here={act === it.id} />)}</ul> : <p className="today-none">此刻没有合时的事。四处走走，走近有名字的东西就能做。</p>}
        </section>
        {farm.length > 0 && (
          <section className="today-sec">
            <h4>田里</h4>
            <ul>{farm.map((it) => <Row key={it.id} it={it} here={act === it.id} />)}</ul>
          </section>
        )}
        <section className="today-sec">
          <h4>托事</h4>
          {fav.length ? (
            <ul>
              {fav.map((f) => (
                <li className="today-row" key={f.id}>
                  <div className="today-what"><b>{f.name}</b><span className="today-line">{f.line}</span><small>{f.who}托的</small></div>
                </li>
              ))}
            </ul>
          ) : <p className="today-none">手上没有托事。跟村里人说说话，熟了，他们会托你一些小事。</p>}
          <p className="today-more"><button className="link" onClick={() => openSheet('folk')} data-testid="today-folk">村人簿：谁在哪里、跟谁熟</button></p>
        </section>
        <section className="today-sec">
          <h4>慢慢来</h4>
          <ul className="today-grow">
            <li><button className="link" onClick={() => openSheet('xiang')} data-testid="today-xiang">观象册</button><span>{found ? `已经观了${cn(found)}象` : '还没有观过象'}：做事、看景时，遇到合卦的情形会记下一象。</span></li>
            <li><button className="link" onClick={() => openSheet('stars')}>星图</button><span>{stars ? `认得${cn(stars)}个星官` : '还没有认过星官'}：晴夜抬头，点天上一处。</span></li>
          </ul>
        </section>
        <p className="today-foot"><button className="link" onClick={() => { openSheet(null); window.dispatchEvent(new Event('ks:guide')); }} data-testid="today-guide">再看一遍「初到」：怎么走、怎么做事</button></p>
      </div>
    </Sheet>
  );
}
