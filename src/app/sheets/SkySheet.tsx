import type { TimeMode } from '../../world/Anlewo';
import type { Season, Weather } from '../../world/env/atmos';
import { GuaGlyph } from '../Gua';
import { branchOf, cn, hourOfBranch, today } from '../calendar';
import { SUN, getKs, setFlow, setSeason, setTime, setWeather } from '../ks';
import { FLOWS, saved, ui, useStore } from '../store';
import { HOU_SOURCE, TERMS, XIAOXI, XIAOXI_NOTE } from '../texts';
import { SEASON_GUA } from '../yi';
import Sheet from './Sheet';

/**
 * 天时：一圈十二消息卦，就是一日的十二个时辰（午在上、子在下，顺时针走；左半边阳爻一爻一爻地长，右半边阴爻一爻一爻地长）。
 * 点哪一卦，画里就到那个时辰；也可以随此刻的钟点，或只说晨、昼、昏、夜。时辰流转有停、缓、常、疾四档。
 * 下面是四时（各有一花、三个月各一卦）与晴雾雨雪。几排选项都是一道凹槽，选中的那一格凸起来。
 *
 * 时辰流转着、或点过圆上某一时辰时，画里的时辰是一个数，不再是「晨昼昏夜」里的哪一样：
 * 这时那一排里没有凸起的一格，此刻落在哪一段（晨、昼、昏、夜），那一格下面点一个小点。
 */
const MODES: Array<[TimeMode, string]> = [['now', '随此刻'], ['dawn', '晨'], ['day', '昼'], ['dusk', '昏'], ['night', '夜']];
/** 此刻落在晨、昼、昏、夜的哪一段（按这一季的日出日落） */
function periodOf(h: number, s: Season): TimeMode {
  const [sr, ss] = SUN[s];
  if (h >= sr - 1 && h < sr + 1.5) return 'dawn';
  if (h >= sr + 1.5 && h < ss - 1) return 'day';
  if (h >= ss - 1 && h < ss + 1.2) return 'dusk';
  return 'night';
}
const SEASONS: Array<[Season, string, string]> = [['spring', '春', '桃'], ['summer', '夏', '莲'], ['autumn', '秋', '菊'], ['winter', '冬', '梅']];
const WEATHERS: Array<[Weather, string]> = [['clear', '晴'], ['mist', '雾'], ['rain', '雨'], ['snow', '雪']];
/** 一天里的钟点落在圆上的哪里（子在正下，卯在左，午在正上，酉在右；r 是半径占几成） */
const at = (h: number, r: number): [number, number] => [50 - Math.sin((h / 24) * Math.PI * 2) * r, 50 + Math.cos((h / 24) * Math.PI * 2) * r];

export default function SkySheet() {
  const picked = useStore(saved, (s) => s.time), weather = useStore(saved, (s) => s.weather), season = useStore(saved, (s) => s.season), flow = useStore(saved, (s) => s.flow);
  const hour = useStore(ui, (s) => s.hour), day = useStore(ui, (s) => s.day);
  // 画里此刻是按什么走的时辰（睡了一觉、打了个盹、时辰流转着，世界自己换过时辰，就不再是先前选的那一样了）
  const time = getKs()?.timeMode ?? picked;
  const t = today(), cur = branchOf(hour), now = XIAOXI[cur];
  const [sr, ss] = SUN[season];
  // 日在圆上的位置；夜的那一段弧（日落到日出，过子时）
  const [sx, sy] = at(hour, 31), [ax, ay] = at(ss, 31), [bx, by] = at(sr, 31);
  const term = TERMS.find((x) => x.name === t.termName);
  const period = typeof time === 'number' ? periodOf(hour, season) : null;
  const flowAt = FLOWS.reduce((best, f, i) => (Math.abs(f[0] - flow) < Math.abs(FLOWS[best][0] - flow) ? i : best), 0);
  const followNow = time === 'now';
  return (
    <Sheet title="天时" sub={t.lunar ? `${t.lunar}　${t.term}` : undefined}>
      <div className="dial">
        <svg className="dial-ring" viewBox="0 0 100 100" aria-hidden>
          <circle className="dial-path" cx="50" cy="50" r="31" />
          <path className="dial-night" d={`M${ax.toFixed(2)} ${ay.toFixed(2)}A31 31 0 ${24 - ss + sr > 12 ? 1 : 0} 1 ${bx.toFixed(2)} ${by.toFixed(2)}`} />
          <circle className="dial-sun" cx={sx.toFixed(2)} cy={sy.toFixed(2)} r="1.7" />
        </svg>
        {XIAOXI.map((x) => {
          const [px, py] = at(hourOfBranch(x.i), 42.5);
          return (
            <button key={x.i} className={`dial-gua${x.i === cur ? ' is-now' : ''}`} style={{ left: `${px.toFixed(2)}%`, top: `${py.toFixed(2)}%` }} onClick={() => setTime(hourOfBranch(x.i))} aria-label={`${x.branch}时，${x.gua.name}卦`} aria-pressed={x.i === cur} data-testid={`dial-${x.i}`}>
              <GuaGlyph lines={x.gua.lines} />
              <span>{x.branch}</span>
            </button>
          );
        })}
        <div className="dial-mid" aria-live="polite">
          <b>{now.branch}<small>时</small></b>
          <span>{now.gua.name}</span>
          <em>{now.month}之卦{now.qi ? `　${now.qi}` : ''}</em>
          <em className="dial-day">第{cn(day + 1)}日</em>
        </div>
      </div>
      <div className="seg seg-modes" role="group" aria-label="时辰">
        {MODES.map(([v, label]) => (
          <button key={v} className={`${time === v ? 'is-on' : ''}${period === v ? ' is-cur' : ''}`} onClick={() => setTime(v)} aria-pressed={time === v} data-testid={`time-${v}`}>{label}</button>
        ))}
      </div>
      <div className="pick">
        <i className="pick-mark">流</i>
        <div className={`pick-col${followNow ? ' is-idle' : ''}`}>
          <div className="seg" role="group" aria-label="时辰流转">
            {FLOWS.map(([v, label], i) => (
              <button key={label} className={i === flowAt ? 'is-on' : ''} onClick={() => setFlow(v)} aria-pressed={i === flowAt} data-testid={`flow-${i}`}>{label}</button>
            ))}
          </div>
          <p className="pick-note">{followNow ? '随此刻时，跟着你那里的钟点走；选一档会走的，就从此刻起照那一档走' : FLOWS[flowAt][2]}</p>
        </div>
      </div>
      <div className="pick">
        <i className="pick-mark">季</i>
        <div className="seasons">
          {SEASONS.map(([v, name, flower]) => (
            <button key={v} className={`season${season === v ? ' is-on' : ''}`} onClick={() => setSeason(v)} aria-pressed={season === v} aria-label={`${name}，${flower}花，${SEASON_GUA[v].map((x) => x.month + x.gua.name).join('、')}`} data-testid={`season-${v}`}>
              <b>{name}<small>{flower}</small></b>
              <span>{SEASON_GUA[v].map((x) => <GuaGlyph key={x.i} lines={x.gua.lines} />)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="pick">
        <i className="pick-mark">天</i>
        <div className="seg" role="group" aria-label="天气">
          {WEATHERS.map(([v, label]) => <button key={v} className={weather === v ? 'is-on' : ''} onClick={() => setWeather(v)} aria-pressed={weather === v} data-testid={`weather-${v}`}>{label}</button>)}
        </div>
      </div>
      <p className="sheet-note">{XIAOXI_NOTE[0]}</p>
      <p className="sheet-note">圆上的朱点是此刻的日头，粗的一段弧是夜。四时之下的三卦，是那一季三个月各配的一卦。「随此刻」跟着你那里的钟点走，月的盈亏按今天的农历。过了子夜、或在榻上睡到天亮，就是又一日。</p>
      {term?.hou?.length ? <p className="sheet-note">今日在{term.name}。{term.name}三候：{term.hou.join('；')}。{HOU_SOURCE ? `——${HOU_SOURCE}` : ''}</p> : null}
      {XIAOXI_NOTE.length > 1 && (
        <details className="more">
          <summary>这套配法的来历</summary>
          {XIAOXI_NOTE.slice(1).map((p, i) => <p key={i}>{p}</p>)}
        </details>
      )}
    </Sheet>
  );
}
