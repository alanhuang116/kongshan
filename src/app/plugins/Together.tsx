import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { getKs, go } from '../ks';
import { ui, useStore } from '../store';
import { getTogether, type NetView, type PeerView, type Together as Tg } from '../../world/net';
import { tzDiff } from '../calendar';
import { robeCss } from '../../world/net/looks';
import { PHRASES, PLACE_IDS, phraseText } from '../../world/net/proto';
import type { Remote } from '../../world/net/remote';

/**
 * 同游：园子里遇见别的游人。
 *   右上（时辰那一条下面）一枚纸签：「同游 · 三位」——园中连你一共几位（暂离的几分钟里也算）；「独游」是自己不连。点开是一张纸：
 *     自己的雅号（换一个）、独游 / 同游、此刻连上没有；底下是园中的各位，由近及远：在哪、在做什么；
 *     走到跟前（十来步内）可以作揖、说一句现成的话；同行（跟着他走）、远的「去寻」。
 *   画里：别人头上一枚小名签（墨字，像画里那些事的签）；说的话浮在名签上面一会儿；自己说的浮在自己头上。
 *   有人向你作揖、对你说话：下面浮一句（世界那边的 note）。
 * 没有可连的中转（开发服务器、自动测试默认不连）时，这里什么也不出。
 * 手机上那张纸差不多盖住半个画面：点了作揖、说一句、同行，纸就自己收起来——好看见自己向他作的那一揖、头上浮着的那句话
 * （试玩的人说手机上纸挡着，看不见给对面的人做了什么）。电脑上纸在右边一条，不挡，照旧开着。
 */

const EMPTY: NetView = { enabled: false, on: false, status: 'off', me: { label: '', robe: '', c: 0, n: [0, 0] }, peers: [], others: 0, near: 0, total: 1, away: [], sky: null, following: null, ext: false, marks: 0 };
const noop = () => () => {};
const coarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

function useTogether(): [Tg | null, NetView] {
  // 世界建好之前（不会发生：插件只在走动时画）先当没有
  const [tg, setTg] = useState<Tg | null>(getTogether);
  useEffect(() => {
    if (tg) return;
    const t = setInterval(() => { const g = getTogether(); if (g) { setTg(g); clearInterval(t); } }, 300);
    return () => clearInterval(t);
  }, [tg]);
  const view = useSyncExternalStore(tg?.subscribe ?? noop, () => tg?.view ?? EMPTY);
  return [tg, view];
}

const STATUS: Record<NetView['status'], string> = {
  off: '独游：别人看不见你，你也看不见别人。',
  connecting: '正在看看园中还有谁……',
  online: '',
  retry: '一时连不上，过一会儿自己再试。照样可以独自走走。',
  full: '园中人多，一时进不来，过一会儿再试。',
  old: '这是旧的一版。重新打开一次，就能与人同游。',
};
function statusText(v: NetView): string {
  if (!v.on) return STATUS.off;
  if (v.status !== 'online') return STATUS[v.status === 'off' ? 'connecting' : v.status];
  if (!v.others && !v.away.length) return '园中此刻只有你一位。有人来了，这里会写上。';
  const away = v.away.length ? `；${v.away.map((a) => a.label).join('、')}暂离，回来还在` : '';
  return `园中连你${cn(v.total)}位${v.near ? `，近处${v.near === v.others ? '的都在' : `有${cn(v.near)}位`}` : ''}${away}。走到跟前，可以作揖、说一句话。`;
}
/** 园中天时随谁（同游时同屋的人看同一个时辰、节气、天气） */
function skyText(v: NetView): string {
  if (!v.on) return '独游时，天时自己拨（「天时」那一页）。';
  if (!v.sky) return '';
  if (v.sky.self) return '同游时，园中天时随最早来的一位——此刻是你：按你这里真实的钟点与节气走，天气也随你。';
  const d = tzDiff(v.sky.tz);
  return `同游时，园中天时随最早来的一位「${v.sky.host}」：按那里真实的钟点与节气走，天气也随那一位${d ? `（${d}）` : ''}。要自己拨，改成独游。`;
}
const DIG = '零一二三四五六七八九';
const cn = (n: number) => (n < 10 ? DIG[n] : n < 20 ? `十${n % 10 ? DIG[n % 10] : ''}` : `${DIG[Math.floor(n / 10)]}十${n % 10 ? DIG[n % 10] : ''}`);

/** 此刻可说的话：平常的几句，加上合这一季（与夜里）的一句 */
function phrasesNow(): number[] {
  const k = getKs(), season = k?.season ?? 'spring', night = (k?.atmos.night ?? 0) > 0.5;
  const out: number[] = [];
  PHRASES.forEach((p, i) => { if (!p.when || p.when === season || (p.when === 'night' && night)) out.push(i); });
  return out;
}

// —— 画里的名签 ——
const KEEP_CLEAR = '.corner-bar, .menu, .stick, .run-key, .act-key, .tg-key, .tg-panel, .sky-card, .act-done, .hold-base';
interface TagItem { id: number; c: number }
function Tags({ tg, list, faint, onPick }: { tg: Tg; list: TagItem[]; faint: boolean; onPick: (id: number) => void }) {
  const box = useRef<HTMLDivElement>(null), mine = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0, frame = 0;
    const v = new THREE.Vector3(), proj = { x: 0, y: 0, visible: false, dist: 0 };
    let clear: Array<[number, number, number, number]> = [];
    const placed: Array<[number, number, number, number]> = [];
    const items: Array<{ c: HTMLElement; r: Remote; x: number; y: number; w: number; h: number }> = [];
    // 收起：淡出去（不点得着：走近了才有的 is-close 一并拿掉）
    const hide = (c: HTMLElement) => { if (c.style.opacity !== '0') c.style.opacity = '0'; if (c.classList.contains('is-close')) c.classList.remove('is-close'); };
    const text = (el: Element | null, s: string) => { if (el && el.textContent !== s) el.textContent = s; };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const k = getKs(), el = box.current;
      if (!k || !el) return;
      if (frame++ % 15 === 0) {
        clear = [];
        for (const n of document.querySelectorAll<HTMLElement>(KEEP_CLEAR)) {
          const r = n.getBoundingClientRect();
          if (r.width < 2 || r.height < 2 || getComputedStyle(n).opacity === '0') continue;
          clear.push([r.left - 4, r.right + 4, r.top - 4, r.bottom + 4]);
        }
      }
      const up = k.nav.pitch < -0.3, W = innerWidth;
      placed.length = 0;
      for (const c of clear) placed.push(c);
      // 自己说的话：浮在自己头上
      const me = mine.current;
      if (me) {
        const line = tg.selfLine;
        if (line && !up) {
          const root = k.player.av.root;
          k.nav.project(v.set(root.position.x, root.position.y + 2.05, root.position.z), proj);
          if (proj.visible) {
            text(me.firstElementChild, phraseText(line.k));
            me.style.transform = `translate3d(${Math.max(70, Math.min(W - 70, proj.x)).toFixed(1)}px, ${proj.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
            me.style.opacity = '1';
            const r = me.getBoundingClientRect(); placed.push([r.left, r.right, r.top, r.bottom]);
          } else hide(me);
        } else hide(me);
      }
      // 别人：先摆说着话的、再由近及远；与已经摆下的压着了就不出
      items.length = 0;
      for (const c of el.children as HTMLCollectionOf<HTMLElement>) {
        const r = tg.remotes.get(Number(c.dataset.id));
        if (!r || !r.shown || !r.inView || r.camDist > 45 || up) { hide(c); continue; }
        const h = (r.fig?.height ?? 1.58) + (r.pose === 'stand' ? 0.2 : r.pose === 'lie' ? -1.05 : -0.42);
        k.nav.project(v.set(r.pos.x, r.pos.y + h, r.pos.z), proj);
        if (!proj.visible) { hide(c); continue; }
        // 先把字写好（写），再一并量大小（读），最后摆（写）：一帧只排一回版
        const line = r.line ? phraseText(r.line.k) : '';
        text(c.querySelector('.tg-tag-name'), tg.label(r.id));
        const say = c.querySelector<HTMLElement>('.tg-line');
        if (say) { text(say, line); if (say.hidden !== !line) say.hidden = !line; }
        const close = r.dist <= 12 && !r.hidden;
        if (c.classList.contains('is-close') !== close) c.classList.toggle('is-close', close);
        items.push({ c, r, x: proj.x, y: proj.y, w: 0, h: 0 });
      }
      for (const it of items) { it.w = it.c.offsetWidth || 90; it.h = it.c.offsetHeight || 30; }
      items.sort((a, b) => (!!b.r.line === !!a.r.line ? a.r.camDist - b.r.camDist : b.r.line ? 1 : -1));
      for (const it of items) {
        // 贴着屏边的往里挪，不让屏边裁掉半个字
        const cx = Math.max(it.w / 2 + 8, Math.min(W - it.w / 2 - 8, it.x));
        const x0 = cx - it.w / 2, x1 = cx + it.w / 2, y0 = it.y - it.h, y1 = it.y;
        let hit = false;
        for (const p of placed) if (x0 < p[1] && x1 > p[0] && y0 < p[3] && y1 > p[2]) { hit = true; break; }
        if (hit) { hide(it.c); continue; }
        placed.push([x0, x1, y0, y1]);
        const o = Math.max(0, Math.min(1, (45 - it.r.camDist) / 20)) * (faint ? 0.6 : 1);
        it.c.style.opacity = o.toFixed(2);
        it.c.style.transform = `translate3d(${cx.toFixed(1)}px, ${it.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tg, faint]);
  return (
    <div className="tg-tags">
      <div className="tg-tag-list" ref={box}>
        {list.map((p) => {
          return (
            <div key={p.id} className="tg-tag" data-id={p.id} data-testid={`tg-tag-${p.id}`}>
              <p className="tg-line" hidden />
              <button className="tg-tag-key" onClick={() => onPick(p.id)} tabIndex={-1} aria-label={`${tg.label(p.id)}：看同游的人`}>
                <i style={{ background: robeCss(p.c) }} aria-hidden />
                <span className="tg-tag-name">{tg.label(p.id)}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="tg-tag tg-self" ref={mine} data-testid="tg-self-line"><p className="tg-line" /></div>
    </div>
  );
}

// —— 一位 ——
/**
 * 同行 / 去寻：近的直接跟上去；远得很的（一百二十米外，比如他在渡口、你在桃林）先像村图上点一处那样换到他那一处（画面淡成雾），再走过去。
 */
function seek(tg: Tg, id: number) {
  const r = tg.remotes.get(id);
  if (!r || r.dist <= 120 || r.place < 0 || !PLACE_IDS[r.place]) { tg.follow(id); return; }
  go(PLACE_IDS[r.place]);
  const t0 = Date.now();
  const iv = window.setInterval(() => {
    const k = getKs();
    if (!k || Date.now() - t0 > 9000) { window.clearInterval(iv); return; }
    if (Date.now() - t0 > 300 && !k.nav.busy) { window.clearInterval(iv); tg.follow(id); }
  }, 150);
}
function Row({ tg, p, open, onOpen, onAct }: { tg: Tg; p: PeerView; open: boolean; onOpen: () => void; onAct: () => void }) {
  const says = useMemo(phrasesNow, [open]);
  return (
    <li className={`tg-row${open ? ' is-open' : ''}${p.hidden ? ' is-hidden' : ''}`} data-testid={`tg-row-${p.id}`}>
      <button className="tg-who" onClick={onOpen} aria-expanded={open}>
        <i className="tg-swatch" style={{ background: robeCss(p.c) }} aria-hidden />
        <span className="tg-name">{p.label}</span>
        <small className="tg-where">{p.far}{p.doing ? `，${p.doing}` : ''}</small>
      </button>
      <div className="tg-acts">
        {p.close && <button className={`key${p.invite ? ' is-main' : ''}`} onClick={() => { tg.greet(p.id); onAct(); }} data-testid={`tg-bow-${p.id}`}>{p.invite ? '还礼' : '作揖'}</button>}
        {!p.hidden && <button className={`key${p.following ? ' is-on' : ''}`} onClick={() => { if (p.following) tg.follow(null); else { seek(tg, p.id); onAct(); } }} aria-pressed={p.following} data-testid={`tg-follow-${p.id}`}>{p.following ? '不跟了' : p.dist > 30 ? '去寻' : '同行'}</button>}
      </div>
      {open && p.close && (
        <div className="tg-say" role="group" aria-label={`对${p.label}说`}>
          {says.map((i) => <button key={i} className="key tg-ph" onClick={() => { tg.say(p.id, i); onAct(); }} data-testid={`tg-say-${p.id}-${PHRASES[i].id}`}>{PHRASES[i].text}</button>)}
        </div>
      )}
      {open && !p.close && !p.hidden && <p className="tg-hint">走到十来步以内，才好作揖、说话。</p>}
    </li>
  );
}

function Panel({ tg, v, pick, setPick, onClose, onAct }: { tg: Tg; v: NetView; pick: number | null; setPick: (id: number | null) => void; onClose: () => void; onAct: () => void }) {
  // 打开的那一位：点过的；没点过就是最近的、走得到跟前的那一位
  const openId = pick ?? v.peers.find((p) => p.close)?.id ?? null;
  return (
    <section className="tg-panel board" role="dialog" aria-label="同游" data-testid="tg-panel">
      <header className="tg-head">
        <h3 className="tg-title">同游</h3>
        <div className="seg tg-seg" role="radiogroup" aria-label="独游或同游">
          <button className={!v.on ? 'is-on' : ''} role="radio" aria-checked={!v.on} onClick={() => tg.setOnline(false)} data-testid="tg-off">独游</button>
          <button className={v.on ? 'is-on' : ''} role="radio" aria-checked={v.on} onClick={() => tg.setOnline(true)} data-testid="tg-on">同游</button>
        </div>
        <button className="tg-close" onClick={onClose} aria-label="收起同游" data-testid="tg-close">收</button>
      </header>
      <div className="tg-body">
        <p className="tg-me">
          <i className="tg-swatch" style={{ background: robeCss(v.me.c) }} aria-hidden />
          <span>你是<b data-testid="tg-me">{v.me.label}</b>{v.me.label.includes(v.me.robe) ? null : <small>（{v.me.robe}）</small>}</span>
          <button className="link" onClick={() => tg.reroll()} data-testid="tg-reroll">换一个</button>
        </p>
        {statusText(v) && <p className="tg-status" data-testid="tg-status">{statusText(v)}</p>}
        {v.on && v.status === 'online' && (v.peers.length > 0 || v.away.length > 0) && (
          <ul className="tg-list">
            {v.peers.map((p) => <Row key={p.id} tg={tg} p={p} open={openId === p.id} onOpen={() => setPick(openId === p.id ? -1 : p.id)} onAct={onAct} />)}
            {v.away.map((a) => (
              <li key={a.key} className="tg-row is-away" data-testid={`tg-away-${a.key}`}>
                <div className="tg-who">
                  <i className="tg-swatch" style={{ background: robeCss(a.c) }} aria-hidden />
                  <span className="tg-name">{a.label}</span>
                  <small className="tg-where">暂离</small>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="tg-foot" data-testid="tg-sky">{skyText(v)}名字与话都是现成的，不必打字。</p>
      </div>
    </section>
  );
}

/**
 * 右上时辰那一条底下这块地方，别的几路有时也放一张小纸（挑担子时的「往哪儿挑」）：压着了，那一枚与纸就往下让到它底下。
 * 隔一会儿量一回，让多少写进 --tg-shift。别的几路要它让的，给元素加 data-tg-avoid 即可。
 */
const AVOID = '.carry-hint, [data-tg-avoid]';
function useShift(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const t = window.setInterval(() => {
      const el = root.current, key = el?.querySelector<HTMLElement>('.tg-key');
      if (!el || !key) return;
      const cur = parseFloat(el.style.getPropertyValue('--tg-shift')) || 0, kr = key.getBoundingClientRect(), top = kr.top - cur;
      let shift = 0;
      for (const n of document.querySelectorAll<HTMLElement>(AVOID)) {
        if (n.closest('.tg')) continue;
        const cs = getComputedStyle(n), r = n.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || r.width < 2 || r.height < 2) continue;
        if (r.left < kr.right && r.right > kr.left && r.top < top + kr.height && r.bottom > top) shift = Math.max(shift, r.bottom + 8 - top);
      }
      const v = `${Math.max(0, Math.round(shift))}px`;
      if (el.style.getPropertyValue('--tg-shift') !== v) el.style.setProperty('--tg-shift', v);
    }, 400);
    return () => window.clearInterval(t);
  }, [root]);
}

export default function Together() {
  const [tg, v] = useTogether();
  const sheet = useStore(ui, (s) => !!s.sheet);
  const menu = useStore(ui, (s) => s.menu);
  const act = useStore(ui, (s) => !!s.act);
  const busy = useStore(ui, (s) => s.busy);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [touch] = useState(coarse);
  const root = useRef<HTMLDivElement>(null);
  useShift(root);
  // 界面在走动的那一段才算「在园中」（题名页上不连）
  useEffect(() => { tg?.setPlaying(true); return () => tg?.setPlaying(false); }, [tg]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  // 纸开着：body 上挂一个 data-tg-open，画面下方的走法提示先让开（它在纸的下沿底下，会从纸下透出来、把下面那句话也顶上来）
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (open) document.body.dataset.tgOpen = ''; else delete document.body.dataset.tgOpen;
    return () => { delete document.body.dataset.tgOpen; };
  }, [open]);
  // 点过的那位走了：回到默认
  useEffect(() => { if (pick != null && pick >= 0 && !v.peers.some((p) => p.id === pick)) setPick(null); }, [v.peers, pick]);
  const list = useMemo(() => v.peers.map((p) => ({ id: p.id, c: p.c })), [v.peers.map((p) => `${p.id}:${p.c}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tg || !v.enabled) return null;
  const away = sheet || menu || act || busy;
  const live = v.on && v.status === 'online';
  const word = v.on ? '同游' : '独游';
  return (
    <div className={`tg${touch ? ' is-touch' : ''}${act ? ' is-act' : ''}`} data-status={v.status} ref={root}>
      {!sheet && !busy && live && <Tags tg={tg} list={list} faint={act} onPick={(id) => { setPick(id); setOpen(true); }} />}
      {!away && (
        <button className={`tg-key${open ? ' is-on' : ''}${v.on ? '' : ' is-off'}`} onClick={() => setOpen(!open)} aria-expanded={open}
          aria-label={`${word}${live ? `：园中连你${cn(v.total)}位` : ''}。看同游的人`} data-testid="tg-key">
          <span>{word}</span>
          {live && v.total > 1 && <small data-testid="tg-count">{cn(v.total)}位</small>}
          {v.on && !live && <i className="tg-wait" aria-hidden />}
        </button>
      )}
      {!away && open && <Panel tg={tg} v={v} pick={pick} setPick={setPick} onClose={() => setOpen(false)} onAct={() => { if (touch || innerWidth <= 560) setOpen(false); }} />}
    </div>
  );
}
