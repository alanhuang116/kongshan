import { setLevel, setMaster, setMuted } from '../ks';
import { channels, defaultLevel, PRESETS, presetOf, setLevel as fadeLevel, type Preset } from '../sound';
import { patch, saved, ui, useStore } from '../store';
import Sheet from './Sheet';

/**
 * 声音：上头是几套现成的（山居、纯自然、冥想、人间、静），点一下各样的大小一齐换过去；
 * 下面是总的大小与静音，再下面是几样环境声各自的大小（声音那一层有哪几样，这里就列哪几样）。
 * 各样声音平时自己跟着人走到哪、什么时辰、什么天气起落——这里的「四成」是「照原样」，往下是调小，到头是关。
 * 选了哪一套不另记：各样的大小本来就存在本机，正好是哪一套，那一套就亮着；自己再调过，就哪一套都不亮。
 */
const LABEL: Record<string, [string, string]> = {
  wind: ['风', '松、竹、桃林里的风'], water: ['水', '溪声、池上、伊水'], birds: ['禽', '鸟、燕子、秋天的雁'], insects: ['虫', '蝉、蛙、夜里的蟋蟀'],
  weather: ['雨', '雨、檐滴、落雪'], village: ['村', '鸡犬牛羊、锤锯、牧笛'], people: ['人', '书声、说话、孩子笑（默认不出）'], qin: ['琴', '偶尔远远的几声，调轻了更稀'],
};
/** 换一套时各样慢慢过去（秒） */
const PRESET_FADE = 2.5;
export default function SoundSheet() {
  const master = useStore(saved, (s) => s.master), muted = useStore(saved, (s) => s.muted), levels = useStore(saved, (s) => s.sound), haptics = useStore(saved, (s) => s.haptics);
  const ready = useStore(ui, (s) => s.sound);
  const list = ready ? channels() : [];
  const cur = presetOf(levels, list);
  const choose = (p: Preset) => {
    const next = { ...levels };
    for (const id of list) next[id] = p.levels[id] ?? defaultLevel(id);
    patch({ sound: next });
    for (const id of list) fadeLevel(id, next[id], PRESET_FADE);
  };
  const canBuzz = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return (
    <Sheet title="声音">
      {list.length > 0 && (
        <div className="presets-wrap">
          <div className="seg presets" role="radiogroup" aria-label="几套现成的声音">
            {PRESETS.map((p) => (
              <button key={p.id} role="radio" aria-checked={cur?.id === p.id} className={cur?.id === p.id ? 'is-on' : ''} onClick={() => choose(p)} data-testid={`sound-preset-${p.id}`}>{p.name}</button>
            ))}
          </div>
          <p className="preset-note" aria-live="polite">{cur ? cur.note : '自己调过的：下面各样的大小照你调的。点上面任一套，就一齐换过去。'}</p>
        </div>
      )}
      <div className="vol">
        <button className={`opt${muted ? '' : ' is-on'}`} onClick={() => setMuted(!muted)} aria-pressed={!muted} data-testid="sound-mute">{muted ? '静着' : '有声'}</button>
        <input type="range" min={0} max={1} step={0.01} value={master} onChange={(e) => setMaster(Number(e.target.value))} aria-label="总音量" style={{ ['--v' as string]: master }} />
      </div>
      {list.length > 0 && (
        <ul className="layers">
          {list.map((id) => {
            const v = levels[id] ?? defaultLevel(id), [mark, sub] = LABEL[id] ?? [id.slice(0, 1), id], k = Math.round(Math.min(1, v) * 4);
            return (
              <li key={id}>
                <i className="pick-mark">{mark}</i>
                <span className="layer-sub">{sub}</span>
                <div className="steps" role="slider" aria-label={sub} aria-valuemin={0} aria-valuemax={4} aria-valuenow={k}>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <button key={n} className={n > 0 && k >= n ? 'is-on' : n === 0 && k === 0 ? 'is-zero' : ''} onClick={() => setLevel(id, n / 4)} aria-label={n === 0 ? '关' : `${n} 成`} />
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canBuzz && (
        <div className="pick">
          <i className="pick-mark">触</i>
          <div className="pick-opts"><button className={`opt${haptics ? ' is-on' : ''}`} onClick={() => patch({ haptics: !haptics })} aria-pressed={haptics}>{haptics ? '手上有轻轻的一振' : '不振'}</button></div>
        </div>
      )}
      <p className="sheet-note">{ready ? '这里的声音都是现算出来的，没有一段录音。风、水、鸟、虫、村里的动静，平时跟着你走到哪里、是什么时辰与天气自己起落；这里调的只是它们各自的大小。人声最难算得像，所以平常不出；想听村塾的书声、村人说话，选「人间」，或把「人」调上来。' : '声音还没有备好——画照常可以看。'}</p>
    </Sheet>
  );
}
