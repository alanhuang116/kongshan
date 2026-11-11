import { useEffect, type ReactNode } from 'react';
import { LAYER_NAMES, type Layer } from '../../audio';
import { PLACES } from '../../world/nav';
import { L } from '../../world/layout';
import type { TimeMode } from '../../world/Kongshan';
import type { Season, Weather } from '../../world/env/atmos';
import { cn, keyOf, shichen, today } from '../calendar';
import { getKs, go, openSheet, setLayer, setMaster, setMuted, setSeason, setTime, setWeather } from '../ks';
import { patch, saved, ui, useStore, type Entry } from '../store';
import About from './About';

function Sheet({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') openSheet(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <>
      <div className="sheet-back" onClick={() => openSheet(null)} />
      <aside className={`sheet${wide ? ' sheet-wide' : ''}`} role="dialog" aria-label={title}>
        <header className="sheet-head">
          <h3>{title}</h3>
          <button className="sheet-close" onClick={() => openSheet(null)} data-testid="sheet-close">收起</button>
        </header>
        <div className="sheet-body">{children}</div>
      </aside>
    </>
  );
}

// —— 寺图 ——
const LABEL: Record<string, [number, number, 'l' | 'r' | 't' | 'b']> = {
  foot: [0, 88, 'r'], gate: [0, 48.5, 'r'], court: [0, 32, 'r'], pond: [-9.6, 34.5, 'l'], censer: [0, 20.6, 'r'], tree: [-11.5, 6.5, 'l'],
  bell: [17.5, 19, 'r'], drum: [-17.5, 19, 'l'], steps: [0, 8.2, 'r'], hall: [0, -2, 't'], study: [-21.9, -1, 'l'], tea: [21.9, 3, 'r'], terrace: [36.2, -15.5, 't'],
};
function MapSheet() {
  const place = useStore(ui, (s) => s.place);
  const W = L.wall, P = L.pond, T = L.terrace;
  // 人此刻在图上的哪里、朝哪边（打开寺图时取一次）
  const ks = getKs(), me = ks ? { x: ks.player.pos.x, z: ks.player.pos.z, yaw: ks.player.yaw, up: ks.player.zone !== 'ground' } : null;
  const roof = (cx: number, cz: number, hw: number, hd: number, r: number, key: string) => (
    <g key={key} className="map-roof">
      <rect x={cx - hw} y={cz - hd} width={hw * 2} height={hd * 2} />
      {r > 0 ? <path d={`M${cx - r} ${cz}H${cx + r}M${cx - hw} ${cz - hd}L${cx - r} ${cz}L${cx - hw} ${cz + hd}M${cx + hw} ${cz - hd}L${cx + r} ${cz}L${cx + hw} ${cz + hd}`} /> : <path d={`M${cx - hw} ${cz - hd}L${cx + hw} ${cz + hd}M${cx + hw} ${cz - hd}L${cx - hw} ${cz + hd}`} />}
    </g>
  );
  return (
    <Sheet title="寺图">
      <svg className="map" viewBox="-40 -42 92 136" role="img" aria-label="寺院的平面图，点一处即可到那里">
        <g className="map-hill">
          <path d="M-52 -30 Q-40 -44 -28 -33 T-4 -36 T20 -32 T44 -38 T58 -30" />
          <path d="M-52 -22 Q-44 -30 -36 -24 T-20 -27" />
          <path d="M-50 2 Q-44 -6 -40 2 T-34 8" /><path d="M-51 30 Q-45 22 -40 30" />
          <path d="M47 -2 q3 -2 6 0 t6 0" /><path d="M44 8 q3 -2 6 0 t6 0" /><path d="M48 18 q3 -2 6 0 t6 0" /><path d="M45 -30 q3 -2 6 0 t6 0" />
        </g>
        <text className="map-far" x={-33} y={-33}>塔</text>
        <text className="map-far" x={47} y={-2}>云海</text>
        <rect className="map-wall" x={W.x0} y={W.z0} width={W.x1 - W.x0} height={W.z1 - W.z0} />
        <rect className="map-terrace" x={T.x0} y={T.z0} width={T.x1 - T.x0} height={T.z1 - T.z0} />
        <path className="map-path" d={`M0 ${W.z1 - 4}V10M26 ${L.moonGate.z}H33`} />
        <g className="map-stair">{Array.from({ length: 13 }, (_, i) => <path key={i} d={`M-2.2 ${52 + i * 3}H2.2`} />)}<path d="M-2.2 51.5V88M2.2 51.5V88" /></g>
        <rect className="map-pond" x={P.x0} y={P.z0} width={P.x1 - P.x0} height={P.z1 - P.z0} rx={2} />
        <path className="map-wave" d="M-10 30q1.5 -1 3 0t3 0M5 34q1.5 -1 3 0t3 0M-8 35q1.5 -1 3 0t3 0M6 29q1.5 -1 3 0t3 0" />
        <rect className="map-bridge" x={-1.7} y={P.z0 - 0.6} width={3.4} height={P.z1 - P.z0 + 1.2} />
        {roof(L.hall.x, L.hall.z, 14.7, 9.7, 7, 'hall')}
        {roof(L.gate.x, L.gate.z, 7.7, 4.4, 4.9, 'gate')}
        {roof(L.bell.x, L.bell.z, 4, 4, 0, 'bell')}
        {roof(L.drum.x, L.drum.z, 4, 4, 0, 'drum')}
        {roof(L.study.x, L.study.z, 3.9, 6.85, 0.01, 'study')}
        {roof(L.tea.x, L.tea.z, 3.9, 6.85, 0.01, 'tea')}
        {roof(T.cx, T.cz, 3.3, 3.3, 0, 'pav')}
        <circle className="map-tree" cx={L.ginkgo.x} cy={L.ginkgo.z} r={4.2} />
        <circle className="map-censer" cx={L.censer.x} cy={L.censer.z} r={0.9} />
        {PLACES.filter((s) => s.spawn).map((s) => {
          const [x, z, side] = LABEL[s.id] ?? [s.spawn![0], s.spawn![1], 'r'];
          const dx = side === 'l' ? -2.4 : side === 'r' ? 2.4 : 0, dy = side === 't' ? -3.4 : side === 'b' ? 5 : 0.3;
          return (
            <g key={s.id} className={`map-st${s.id === place ? ' is-here' : ''}`} onClick={() => go(s.id)} data-testid={`map-${s.id}`}>
              <rect x={x - 8} y={z - 4.2} width={16} height={8.4} className="map-hit" />
              <circle cx={x} cy={z} r={1.25} />
              <text x={x + dx} y={z + dy} textAnchor={side === 'l' ? 'end' : side === 'r' ? 'start' : 'middle'}>{s.name}</text>
            </g>
          );
        })}
        {me && (
          <g className="map-me" transform={`translate(${me.x.toFixed(1)} ${me.z.toFixed(1)}) rotate(${(180 - (me.yaw * 180) / Math.PI).toFixed(0)})`}>
            <circle r={1.5} /><path d="M0 -3.4L1.5 -1.3H-1.5Z" />
          </g>
        )}
      </svg>
      <p className="sheet-note">朱点是你。平时自己走着去；路远了，点图上一处，画面暗一下就到。</p>
    </Sheet>
  );
}

// —— 天时 ——
function Row<T extends string>({ mark, value, options, onPick }: { mark: string; value: T; options: Array<[T, string]>; onPick: (v: T) => void }) {
  return (
    <div className="pick">
      <i className="pick-mark">{mark}</i>
      <div className="pick-opts">
        {options.map(([v, label]) => (
          <button key={v} className={`opt${v === value ? ' is-on' : ''}`} onClick={() => onPick(v)} aria-pressed={v === value}>{label}</button>
        ))}
      </div>
    </div>
  );
}
function SkySheet() {
  const time = useStore(saved, (s) => s.time), weather = useStore(saved, (s) => s.weather), season = useStore(saved, (s) => s.season);
  const t = today(), hour = getKs()?.atmos.hour ?? 12;
  return (
    <Sheet title="天时">
      <p className="sky-date">{t.lunar}<br />{t.term}　{shichen(hour)}</p>
      <Row<TimeMode> mark="时" value={time} onPick={setTime} options={[['now', '此刻'], ['dawn', '晨'], ['day', '昼'], ['dusk', '暮'], ['night', '夜']]} />
      <Row<Weather | 'auto'> mark="天" value={weather} onPick={setWeather} options={[['auto', '随缘'], ['clear', '晴'], ['mist', '雾'], ['rain', '雨'], ['snow', '雪']]} />
      <Row<Season | 'auto'> mark="季" value={season} onPick={setSeason} options={[['auto', '随时令'], ['spring', '春'], ['summer', '夏'], ['autumn', '秋'], ['winter', '冬']]} />
      <p className="sheet-note">「此刻」跟着你那里的钟点走：清晨来是晨光，夜里来有月——月的盈亏按今天的农历。「随缘」的天气一天一个样。</p>
    </Sheet>
  );
}

// —— 声 ——
const LAYER_LABEL: Record<Layer, [string, string]> = {
  wind: ['风', '山风与松涛'], birds: ['鸟', '清晨最密，夜里没有'], stream: ['泉', '近水处自然会有'], rain: ['雨', '晴天也可以听雨'], insects: ['虫', '夜里的虫鸣'],
  chant: ['诵', '远处的诵经声'], qin: ['琴', '疏疏的几声古琴'], bellfar: ['钟', '隔很久，远远一声'], eaves: ['铎', '檐角的风铃'],
};
function SoundSheet() {
  const master = useStore(saved, (s) => s.master), muted = useStore(saved, (s) => s.muted), layers = useStore(saved, (s) => s.layers);
  const def: Record<Layer, number> = { wind: 0.6, birds: 0.5, stream: 0.35, rain: 0, insects: 0, chant: 0, qin: 0, bellfar: 0.4, eaves: 0.4 };
  return (
    <Sheet title="声">
      <div className="vol">
        <button className={`opt${muted ? '' : ' is-on'}`} onClick={() => setMuted(!muted)}>{muted ? '已静音' : '有声'}</button>
        <input type="range" min={0} max={1} step={0.01} value={master} onChange={(e) => setMaster(Number(e.target.value))} aria-label="总音量" style={{ ['--v' as string]: master }} />
      </div>
      <ul className="layers">
        {LAYER_NAMES.map((l) => {
          const v = layers[l] ?? def[l];
          return (
            <li key={l}>
              <i className="pick-mark">{LAYER_LABEL[l][0]}</i>
              <span className="layer-sub">{LAYER_LABEL[l][1]}</span>
              <div className="steps" role="slider" aria-label={LAYER_LABEL[l][1]} aria-valuemin={0} aria-valuemax={4} aria-valuenow={Math.round(v * 4)}>
                {[0, 1, 2, 3, 4].map((k) => (
                  <button key={k} className={Math.round(v * 4) >= k && k > 0 ? 'is-on' : k === 0 && v === 0 ? 'is-zero' : ''} onClick={() => setLayer(l, k / 4)} aria-label={k === 0 ? '关' : `${k} 成`} />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="sheet-note">这里的声音都是现场合成的，没有录音：钟、磬、木鱼按器物的发声原理算出来，风、鸟、泉、雨是一直在变的。诵经声也是合成的，只取「远处有人在诵」的意思。</p>
    </Sheet>
  );
}

// —— 功课簿 ——
const WORD: Record<string, (e: Entry) => string> = {
  incense: () => '上香三炷',
  bow: (e) => `礼佛${cn(e.n ?? 3)}拜`,
  muyu: (e) => `木鱼${cn(e.n ?? 0)}声${e.text ? `　${e.text}` : ''}`,
  beads: (e) => `念珠${cn(e.n ?? 0)}颗`,
  sit: (e) => `静坐${cn(Math.max(1, Math.round(e.minutes ?? 0)))}分`,
  bell: (e) => `撞钟${cn(e.n ?? 1)}声`,
  drum: (e) => `击鼓${cn(e.n ?? 1)}通`,
  copy: (e) => `抄经${cn(e.n ?? 0)}字`,
  lamp: (e) => `放灯一盏${e.text ? `　「${e.text}」` : ''}`,
  lots: (e) => `拈得一则${e.text ? `　${e.text}` : ''}`,
  sweep: () => '扫了一地落叶',
  tea: () => '吃茶一盏',
};
function Journal() {
  const journal = useStore(saved, (s) => s.journal), visits = useStore(saved, (s) => s.visits);
  const days = new Map<string, Entry[]>();
  for (const e of journal) { const k = keyOf(new Date(e.t)); if (!days.has(k)) days.set(k, []); days.get(k)!.push(e); }
  const keys = [...days.keys()].sort().reverse();
  /** 同一天同一种事合成一行（声数、颗数、分钟相加） */
  const fold = (es: Entry[]) => {
    const out: Entry[] = [];
    for (const e of es) {
      const p = out.find((x) => x.kind === e.kind && !e.text && !x.text);
      if (p && (e.n != null || e.minutes != null)) { p.n = (p.n ?? 0) + (e.n ?? 0); p.minutes = (p.minutes ?? 0) + (e.minutes ?? 0); }
      else out.push({ ...e });
    }
    return out;
  };
  return (
    <Sheet title="功课簿">
      {keys.length === 0 && <p className="journal-empty">簿上还是空的。<br />在寺里做过的事，会一笔一笔记在这里；只记在这台设备上。</p>}
      {keys.map((k) => {
        const d = new Date(k + 'T12:00:00'), t = today(d);
        return (
          <section key={k} className="day">
            <h4>{t.lunar.split(' ')[1] ?? k}<small>{k.replace(/-/g, '.')}{t.term ? `　${t.term}` : ''}</small></h4>
            <ul>{fold(days.get(k)!).map((e, i) => <li key={i}>{(WORD[e.kind] ?? (() => e.kind))(e)}</li>)}</ul>
          </section>
        );
      })}
      <div className="journal-foot">
        <p>来过{cn(Math.max(1, visits))}次。簿上只记数，不记功德。</p>
        <div className="journal-links">
          <button className="opt" onClick={() => openSheet('about')}>缘起</button>
          {keys.length > 0 && <button className="opt" onClick={() => { if (confirm('把功课簿清空？')) patch({ journal: [] }); }}>清空</button>}
        </div>
      </div>
    </Sheet>
  );
}

export default function Sheets() {
  const sheet = useStore(ui, (s) => s.sheet);
  if (sheet === 'map') return <MapSheet />;
  if (sheet === 'sky') return <SkySheet />;
  if (sheet === 'sound') return <SoundSheet />;
  if (sheet === 'journal') return <Journal />;
  if (sheet === 'about') return <Sheet title="缘起" wide><About /></Sheet>;
  return null;
}
