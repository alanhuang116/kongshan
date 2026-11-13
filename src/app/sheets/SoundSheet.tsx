import { setLevel, setMaster, setMuted } from '../ks';
import { channels, defaultLevel } from '../sound';
import { patch, saved, ui, useStore } from '../store';
import Sheet from './Sheet';

/**
 * 声音：总的大小与静音；下面是几样环境声各自的大小（声音那一层有哪几样，这里就列哪几样）。
 * 各样声音平时自己跟着人走到哪、什么时辰、什么天气起落——这里的「四成」是「照原样」，往下是调小，到头是关。
 */
const LABEL: Record<string, [string, string]> = {
  wind: ['风', '松、竹、桃林里的风'], water: ['水', '溪声、池上、伊水'], birds: ['禽', '鸟、燕子、秋天的雁'], insects: ['虫', '蝉、蛙、夜里的蟋蟀'],
  weather: ['雨', '雨、檐滴、落雪'], village: ['村', '鸡犬、书声、锤与锯'], qin: ['琴', '偶尔远远的几声'],
};
export default function SoundSheet() {
  const master = useStore(saved, (s) => s.master), muted = useStore(saved, (s) => s.muted), levels = useStore(saved, (s) => s.sound), haptics = useStore(saved, (s) => s.haptics);
  const ready = useStore(ui, (s) => s.sound);
  const list = ready ? channels() : [];
  const canBuzz = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return (
    <Sheet title="声音">
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
      <p className="sheet-note">{ready ? '这里的声音都是现算出来的，没有一段录音。风、水、鸟、虫、村里的动静，平时跟着你走到哪里、是什么时辰与天气自己起落；这里调的只是它们各自的大小。' : '声音还没有备好——画照常可以看。'}</p>
    </Sheet>
  );
}
