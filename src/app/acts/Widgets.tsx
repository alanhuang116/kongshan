import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { cn } from '../calendar';
import { actCmd, getKs } from '../ks';
import type { Hold, ItemPick, KeyHint, Meter, Tag } from './state';

/**
 * 做事时的几样小器物（state 怎么写见 state.ts）：
 *   Meter 一道表 · HoldKey 按住的大键 · Tags 钉在画里的小签 · Items 从行囊挑一样 · Steps 几步里的第几步 · Keys 键盘上怎么按
 * 都只管「显出来、把手上的动作发回去」，不认是哪一件事。
 */

/** 这台设备有键盘、鼠标（键盘提示只给它们看） */
export const hasKeyboard = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
/** 「两捆」「三个」：量词前的数 */
export const qty = (n: number, unit: string) => (n <= 0 ? '没有了' : `${n === 2 ? '两' : cn(n)}${unit}`);

/** 一道表：一条凹下去的槽，lo…hi 那一段标出来，指针是一枚小小的凸起；指针落在段里时添朱 */
export function MeterBar({ m }: { m: Meter }) {
  const zone = m.lo != null && m.hi != null && m.hi > m.lo;
  const inZone = zone && m.v >= m.lo! && m.v <= m.hi!;
  return (
    <div className={`meter${inZone ? ' is-in' : ''}`} role="meter" aria-label={m.label ?? '表'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(m.v * 100)} data-testid="act-meter">
      {m.label && <span className="meter-label">{m.label}</span>}
      <span className="meter-track">
        {zone && <i className="meter-zone" style={{ left: `${(m.lo! * 100).toFixed(2)}%`, width: `${((m.hi! - m.lo!) * 100).toFixed(2)}%` }} />}
        <b className="meter-needle" style={{ left: `${(m.v * 100).toFixed(2)}%` }} />
      </span>
    </div>
  );
}

/**
 * 按住的大键：落在一圈下凹的底座里；按下发 cmd(id, 'down')，松开发 cmd(id, 'up')。键盘上空格同。
 * 手指滑出去、切到别的窗口、这一枚换了 id、整个收起来，都补发一次 'up'——那件事不会以为还按着。
 */
/**
 * 转向的两枚键（触屏上摇橹时，state.steer 为真）：按住「左」「右」转，松开回正；两枚都按着时以后按下的那一枚为准。
 * 发给那件事的是 cmd('steer', 'L' | 'R' | 0)。竖屏在提示上面靠左、宽屏在左下——左手转向，右手按「摇」。
 */
export function SteerKeys() {
  const down = useRef<Array<'L' | 'R'>>([]);
  const on = (s: 'L' | 'R', v: boolean, el: HTMLElement) => {
    const was = down.current.includes(s);
    if (was === v) return;
    down.current = v ? [...down.current.filter((x) => x !== s), s] : down.current.filter((x) => x !== s);
    el.classList.toggle('is-down', v);
    const d = down.current;
    actCmd('steer', d.length ? d[d.length - 1] : 0);
  };
  useEffect(() => () => { if (down.current.length) { down.current = []; actCmd('steer', 0); } }, []);
  const key = (s: 'L' | 'R', label: string) => (
    <button
      className="steer-key" data-testid={`act-steer-${s}`} aria-label={`按住：往${label}转`}
      onPointerDown={(e) => { if (e.button !== 0 && e.pointerType === 'mouse') return; e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 无妨 */ } on(s, true, e.currentTarget); }}
      onPointerUp={(e) => on(s, false, e.currentTarget)} onPointerCancel={(e) => on(s, false, e.currentTarget)} onLostPointerCapture={(e) => on(s, false, e.currentTarget)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>{label}</span>
    </button>
  );
  return <div className="act-steer" role="group" aria-label="转向">{key('L', '左')}{key('R', '右')}</div>;
}

export function HoldKey({ hold, kb }: { hold: Hold; kb: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  // 正按着的是哪一枚（id）；没按着是 null
  const down = useRef<string | null>(null);
  const idRef = useRef(hold.id); idRef.current = hold.id;
  const set = (on: boolean) => {
    if (on) {
      if (down.current === idRef.current) return;
      if (down.current) actCmd(down.current, 'up');
      down.current = idRef.current; actCmd(idRef.current, 'down');
    } else {
      if (!down.current) return;
      actCmd(down.current, 'up'); down.current = null;
    }
    ref.current?.classList.toggle('is-down', on);
  };
  const setRef = useRef(set); setRef.current = set;
  // 换了一枚（id 变了）：先前那一枚若还按着，补一声 'up'
  useEffect(() => () => { if (down.current && down.current !== idRef.current) setRef.current(false); }, [hold.id]);
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) => e.code === 'Space' || e.key === ' ';
    const kd = (e: KeyboardEvent) => { if (!isSpace(e)) return; e.preventDefault(); if (!e.repeat) setRef.current(true); };
    const ku = (e: KeyboardEvent) => { if (!isSpace(e)) return; e.preventDefault(); setRef.current(false); };
    const off = () => setRef.current(false);
    const vis = () => { if (document.hidden) off(); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', off); document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', off); document.removeEventListener('visibilitychange', vis); off(); };
  }, []);
  const v = hold.v ?? 0, C = 2 * Math.PI * 45;
  const len = [...hold.label].length;
  return (
    <div className="hold-base" data-testid="act-hold-base">
      <button
        ref={ref} className={`hold${len > 2 ? ' is-long' : ''}${len > 4 ? ' is-longer' : ''}`} data-testid="act-hold" aria-label={`按住：${hold.label}`}
        onPointerDown={(e) => { if (e.button !== 0 && e.pointerType === 'mouse') return; e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 无妨 */ } set(true); }}
        onPointerUp={() => set(false)} onPointerCancel={() => set(false)} onLostPointerCapture={() => set(false)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat) set(true); }} onKeyUp={(e) => { if (e.key === 'Enter') set(false); }}
      >
        <svg className="hold-ring" viewBox="0 0 100 100" aria-hidden>
          <circle className="hold-track" cx="50" cy="50" r="45" />
          <circle className="hold-arc" cx="50" cy="50" r="45" style={{ strokeDasharray: C.toFixed(1), strokeDashoffset: (C * (1 - v)).toFixed(1), opacity: v > 0.001 ? 1 : 0 }} />
        </svg>
        <span className="hold-label">{hold.label}</span>
      </button>
      {kb && <kbd className="hold-kbd" aria-hidden>空格</kbd>}
    </div>
  );
}

/**
 * 几步里走到第几步：名字旁竖写的一行；做过的带一道勾、眼下这一步实、带一点朱。
 * 步数多（农事一整条链有十步）时只写眼下这一步的前一步与后三步，两头各一个「…」，免得一长列压在画上。
 */
const STEP_WIN = 6;
export function StepList({ list, at }: { list: string[]; at: number }) {
  const long = list.length > STEP_WIN;
  const a = long ? Math.max(0, Math.min(at - 1, list.length - 5)) : 0, b = long ? Math.min(list.length, a + 5) : list.length;
  return (
    <ol className="act-steps" aria-label={`第${cn(Math.min(at + 1, list.length))}步，共${cn(list.length)}步：${list.join('、')}`} data-testid="act-steps">
      {a > 0 && <li className="is-gap" aria-hidden />}
      {list.slice(a, b).map((s, j) => { const i = a + j; return <li key={i} className={i < at ? 'is-past' : i === at ? 'is-now' : ''}>{s}</li>; })}
      {b < list.length && <li className="is-gap" aria-hidden />}
    </ol>
  );
}

/** 键盘上怎么按（只在有键盘的设备上出） */
export function KeyHints({ keys }: { keys: KeyHint[] }) {
  return (
    <p className="act-keys" data-testid="act-keys">
      {keys.map((k, i) => <span key={i}><kbd>{k.key}</kbd>{k.label}</span>)}
    </p>
  );
}

/** 从行囊里挑一样：一枚一枚的凸签，名字大、量小；没有的淡着点不了 */
export function ItemList({ items }: { items: ItemPick[] }) {
  return (
    <div className="panel-items" role="group" aria-label="从行囊里挑一样">
      {items.map((it) => (
        <button key={it.id} className="key item-key" disabled={it.n <= 0} onClick={() => actCmd('item', it.id)} data-testid={`item-${it.id}`} title={it.note ?? undefined}>
          <b>{it.name}</b><small>{qty(it.n, it.unit)}</small>
        </button>
      ))}
    </div>
  );
}

/**
 * 钉在画里的小签：每帧把各自那一点投到屏上，直接写位置（不经 React）。
 * 先摆选中的、该做的，再由近及远；与已经摆下的（还有面板、提示、按键）压着了，就往上、往两边挪开，用一根细线连回那一点；
 * 实在没处放的这一帧不出。上一帧放在哪个位置，这一帧先试那里（不来回跳）。
 */
const STEM = 12, GAP = 6, PAD = 3;
const AVOID = '.act-head, .panel, .act-foot, .hold-base, .act-done, .copy-sheet, .copy-piece, .stick, .run-key';
export function Tags({ tags }: { tags: Tag[] }) {
  const box = useRef<HTMLDivElement>(null);
  const cur = useRef(tags); cur.current = tags;
  // 签上的字一变，量过的宽高就作废
  const sig = tags.map((t) => `${t.id}|${t.text}|${t.sub ?? ''}|${t.on ? 1 : 0}`).join('/');
  const sizes = useRef(new Map<string, [number, number]>());
  useEffect(() => { sizes.current.clear(); }, [sig]);
  useEffect(() => {
    let raf = 0, frame = 0;
    let obs: Array<[number, number, number, number]> = [];
    const v = new THREE.Vector3(), out = { x: 0, y: 0, visible: false, dist: 0 };
    const last = new Map<string, number>();
    // 出不出由 data-on 管（样式里没有它就是不出）
    const hide = (n: HTMLElement) => { if (n.dataset.on === '1') n.dataset.on = '0'; };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const k = getKs(), el = box.current;
      if (!k || !el) return;
      const list = cur.current, kids = el.children as HTMLCollectionOf<HTMLElement>;
      const W = innerWidth, H = innerHeight;
      // 界面上占着的地方（面板、提示、按键……）：签不压在它们底下。隔几帧量一次
      if (frame++ % 12 === 0) {
        obs = [];
        for (const n of document.querySelectorAll<HTMLElement>(AVOID)) {
          const r = n.getBoundingClientRect(), cs = getComputedStyle(n);
          if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
          obs.push([r.left - 4, r.top - 4, r.right + 4, r.bottom + 4]);
        }
      }
      const pts: Array<{ x: number; y: number; d: number; ok: boolean }> = [];
      const order: number[] = [];
      for (let i = 0; i < list.length && i < kids.length; i++) {
        const t = list[i];
        v.set(t.x, t.y, t.z); k.nav.project(v, out);
        pts.push({ x: out.x, y: out.y, d: out.dist, ok: out.visible });
        if (out.visible) order.push(i); else hide(kids[i]);
      }
      const rank = (t: Tag) => (t.on ? 0 : t.kind === 'hot' ? 1 : t.kind === 'dim' || t.kind === 'done' ? 3 : 2);
      order.sort((a, b) => rank(list[a]) - rank(list[b]) || pts[a].d - pts[b].d);
      const placed = obs.slice();
      for (const i of order) {
        const t = list[i], node = kids[i], p = pts[i];
        const keyEl = node.firstElementChild as HTMLElement | null, lead = node.children[1] as HTMLElement | undefined, dot = node.children[2] as HTMLElement | undefined;
        if (!keyEl || !lead || !dot) continue;
        let sz = sizes.current.get(t.id);
        if (!sz) { sz = [keyEl.offsetWidth || 60, keyEl.offsetHeight || 26]; sizes.current.set(t.id, sz); }
        const [w, h] = sz, up = STEM + h;
        // 几个位置（签的下沿正中落在哪）：正上方、再高一层、左上、右上、更高、左右远一些、正下方
        const cands: Array<[number, number]> = [
          [p.x, p.y - STEM], [p.x, p.y - STEM - (h + GAP)], [p.x - w / 2 - 12, p.y - up / 2 - 2], [p.x + w / 2 + 12, p.y - up / 2 - 2],
          [p.x, p.y - STEM - 2 * (h + GAP)], [p.x - w - 16, p.y - STEM - (h + GAP)], [p.x + w + 16, p.y - STEM - (h + GAP)], [p.x, p.y + STEM + h + 4],
        ];
        const prev = last.get(t.id);
        const tryOrder = prev != null ? [prev, ...cands.keys()].filter((c, j, a) => a.indexOf(c) === j) : [...cands.keys()];
        let pick = -1, cx = 0, by = 0;
        for (const c of tryOrder) {
          let [x, y] = cands[c];
          x = Math.max(8 + w / 2, Math.min(W - 8 - w / 2, x));
          if (y - h < 6 || y > H - 6) continue;
          const r: [number, number, number, number] = [x - w / 2 - PAD, y - h - PAD, x + w / 2 + PAD, y + PAD];
          let hit = false;
          for (const q of placed) if (r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]) { hit = true; break; }
          if (hit) continue;
          pick = c; cx = x; by = y; placed.push(r);
          break;
        }
        if (pick < 0) { hide(node); last.delete(t.id); continue; }
        last.set(t.id, pick);
        if (node.dataset.on !== '1') node.dataset.on = '1';
        keyEl.style.transform = `translate3d(${(cx - w / 2).toFixed(1)}px, ${(by - h).toFixed(1)}px, 0)`;
        // 细线：从那一点连到签的下沿正中（签在那一点下面时连到上沿）
        const ty = by > p.y ? by - h : by, dx = cx - p.x, dy = ty - p.y, L = Math.hypot(dx, dy);
        lead.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) rotate(${Math.atan2(dy, dx).toFixed(4)}rad) scaleX(${Math.max(0, L).toFixed(1)})`;
        dot.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="tags" ref={box} data-testid="act-tags">
      {tags.map((t) => (
        <div key={t.id} className={`tag${t.on ? ' is-on' : ''}`} data-kind={t.kind ?? undefined}>
          <button className="tag-key" onClick={() => actCmd('tag', t.id)} disabled={t.kind === 'dim'} data-testid={`tag-${t.id}`} aria-pressed={t.on}>
            <span className="tag-text">{t.text}</span>
            {t.sub && <small>{t.sub}</small>}
          </button>
          <i className="tag-lead" aria-hidden />
          <b className="tag-dot" aria-hidden />
        </div>
      ))}
    </div>
  );
}
