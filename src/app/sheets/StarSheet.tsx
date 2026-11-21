import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { D2R, eclVec, EQ_TO_GAL, LAT } from '../../world/env/stars/astro';
import { cnNum, loadSky, mansionOf, nearest, segDist, xiangOf } from '../../world/env/stars/catalog';
import { NOTES, PLANET_NOTE, QUOTES, REGION_NOTE } from '../../data/starlore';
import { getKs } from '../ks';
import { ui, useStore } from '../store';
import Sheet from './Sheet';
import '../styles/stars.css';

/**
 * 星图：册子里的一页。按画里此刻的天，画一幅盖天式的圆图——北极在中，三道圆是内规（终夜不落的那一圈）、赤道、外规（洛阳看得见的最南），
 * 一道朱线是黄道，二十八宿按距星分作二十八条界线，银河一抹淡墨；此刻地平之下的那一部分罩一层淡墨。
 * 面朝南仰看：中天（正南）在下，东在左、西在右。拖动可以转；点一颗星、一段连线，下面出它的名、属哪一垣哪一宿、一两句古书里的话。
 *
 * 挂到界面上（界面那一路来做）：
 *   Sheets.tsx 里加一行 `if (sheet === 'stars') return <StarSheet />;`，store.ts 的 Sheet 类型添 'stars'，简册里添一项「星图」。
 *   世界那边可以用 events.open('stars') 请界面翻到这一页（观星时也许用得上）。
 * 数据从哪来：
 *   getKs().atmos.sky.chart() —— 此刻的天：M（J2000 赤道 → 世界的矩阵，按行存的 9 个数）、lst、lat、日月五星的方向（都是 J2000）。
 *   world/env/stars/catalog.ts 的 loadSky() —— 星表、星官、星名、距星；mansionOf() 一个方向在哪一宿。
 *   data/starlore.ts —— 古书里的话（QUOTES）与本应用自己写的白话（NOTES、REGION_NOTE、PLANET_NOTE）。
 * 世界还没建好（或在测试里）时按「春夜九点」画。
 */
const R = 186, C = 200;
/** 盖天图的半径：北极 0，外规（赤纬 −(90° − 纬度)）到 R */
const SOUTH = 90 - LAT;
const rOf = (dec: number) => ((90 - dec / D2R) / (90 + SOUTH)) * R;
/** 显示到几等星 */
const MAG = 4.9;
const XIU_NAMES = new Set(['角宿', '亢宿', '氐宿', '房宿', '心宿', '尾宿', '箕宿', '斗宿', '牛宿', '女宿', '虚宿', '危宿', '室宿', '壁宿', '奎宿', '娄宿', '胃宿', '昴宿', '毕宿', '觜宿', '参宿', '井宿', '鬼宿', '柳宿', '星宿', '张宿', '翼宿', '轸宿']);
/** 除了二十八宿，图上常写着名字的几个 */
const NAMED = ['北斗', '北极', '织女', '河鼓', '天津', '轩辕', '大角', '天狼', '老人', '五车', '北河', '南河', '北落师门', '王良'];

type V3 = [number, number, number];
const app = (m: ArrayLike<number>, v: ArrayLike<number>): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const appT = (m: ArrayLike<number>, v: ArrayLike<number>): V3 => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
const raOf = (v: ArrayLike<number>) => Math.atan2(v[1], v[0]);
const decOf = (v: ArrayLike<number>) => Math.asin(Math.max(-1, Math.min(1, v[2])));

/** 此刻的天（世界没建好时给一个春夜） */
function now(): { M: number[]; sun: V3; moon: V3; planets: Array<{ name: string; alias: string; id: string; dir: V3; mag: number }> } {
  const sky = getKs()?.atmos.sky, c = sky?.chart();
  if (sky?.now && c) {
    const M = Array.from(sky.now.M), toJ2000 = (w: ArrayLike<number>) => appT(M, w);
    return { M, sun: toJ2000(c.sunW), moon: toJ2000(c.moonW), planets: c.planets.map((p) => ({ name: p.name, alias: p.alias, id: p.id, dir: p.dir, mag: p.mag })) };
  }
  // 春分前后、晚上九点：恒星时约十点
  const lst = 10 * 15 * D2R, lat = LAT * D2R, cL = Math.cos(lst), sL = Math.sin(lst), cP = Math.cos(lat), sP = Math.sin(lat);
  return { M: [-sL, cL, 0, cP * cL, cP * sL, sP, sP * cL, sP * sL, -cP], sun: [1, 0, 0], moon: [0, 1, 0], planets: [] };
}

export default function StarSheet() {
  const hour = useStore(ui, (s) => s.hour);
  const sky = useMemo(() => loadSky(), []);
  const [turn, setTurn] = useState(0);
  const [sel, setSel] = useState<{ kind: 'star' | 'ast' | 'planet'; i: number; star?: number } | null>(null);
  const drag = useRef<{ a: number; t: number; moved: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  // 此刻的天：钟点变了就重取（一秒一次足够）
  const sk = useMemo(() => now(), [Math.round(hour * 60)]);
  // 观星录：观星时认得的星官（k.mem 'stars'），图上也写出名字来
  const seen = useMemo(() => { const b = getKs()?.mem.get<{ seen?: string[] }>('stars', {}); return new Set(Array.isArray(b?.seen) ? b.seen : []); }, [sk]);
  // 中天的赤经（J2000）：正南地平那一点
  const south = appT(sk.M, [0, 0, 1]), zen = appT(sk.M, [0, 1, 0]);
  const lst = raOf(south) + turn;
  const proj = (v: ArrayLike<number>): [number, number] => {
    const r = rOf(decOf(v)), d = raOf(v) - lst;
    return [C - r * Math.sin(d), C + r * Math.cos(d)];
  };
  const S = sky.stars;
  const geo = useMemo(() => {
    const dir = (i: number): V3 => [S.dir[i * 3], S.dir[i * 3 + 1], S.dir[i * 3 + 2]];
    const p = (v: ArrayLike<number>) => { const r = rOf(decOf(v)), d = raOf(v) - lst; return [C - r * Math.sin(d), C + r * Math.cos(d)] as [number, number]; };
    const f = (n: number) => n.toFixed(1);
    // 星
    const stars: Array<{ x: number; y: number; r: number; i: number }> = [];
    for (let i = 0; i < S.n; i++) { if (S.mag[i] > MAG) continue; const v = dir(i); if (decOf(v) / D2R < -SOUTH - 1) continue; const [x, y] = p(v); stars.push({ x, y, r: Math.max(0.45, 2.5 - 0.42 * (S.mag[i] + 0.5)), i }); }
    // 连线
    let lines = '';
    for (const a of sky.asterisms) for (let k = 0; k + 1 < a.segs.length; k += 2) {
      const A = dir(a.segs[k]), B = dir(a.segs[k + 1]);
      if (decOf(A) / D2R < -SOUTH || decOf(B) / D2R < -SOUTH) continue;
      const [x1, y1] = p(A), [x2, y2] = p(B); lines += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
    }
    // 二十八宿的界线：从内规到外规，过距星
    const xiu = sky.ju.map((s, k) => { const ra = raOf(dir(s)), d = ra - lst, a0 = rOf(SOUTH * D2R), a1 = R; return { k, d: `M${f(C - a0 * Math.sin(d))} ${f(C + a0 * Math.cos(d))}L${f(C - a1 * Math.sin(d))} ${f(C + a1 * Math.cos(d))}`, ra }; });
    // 黄道
    let ecl = '';
    for (let l = 0; l <= 360; l += 4) { const [x, y] = p(eclVec(l * D2R, 0, 23.43928 * D2R)); ecl += `${l ? 'L' : 'M'}${f(x)} ${f(y)}`; }
    // 银河：沿银道一笔淡墨（宽）
    let han = '';
    for (let l = 0; l <= 360; l += 4) {
      const g: V3 = [Math.cos(l * D2R), Math.sin(l * D2R), 0], v = appT(EQ_TO_GAL, g);
      if (decOf(v) / D2R < -SOUTH) { han += ' '; continue; }
      const [x, y] = p(v); han += `${han === '' || han.endsWith(' ') ? 'M' : 'L'}${f(x)} ${f(y)}`;
    }
    // 地平：一圈地平线上的方向换回 J2000
    let hor = '';
    for (let A = 0; A <= 360; A += 5) { const w: V3 = [Math.sin(A * D2R), 0, -Math.cos(A * D2R)], v = appT(sk.M, w); const [x, y] = p(v); hor += `${A ? 'L' : 'M'}${f(x)} ${f(y)}`; }
    // 名字
    const names = sky.asterisms.filter((a) => XIU_NAMES.has(a.name) || NAMED.includes(a.name) || seen.has(a.name)).filter((a) => decOf(a.center) / D2R > -SOUTH + 2).map((a) => { const [x, y] = p(a.center); return { x, y, name: a.name, xiu: XIU_NAMES.has(a.name), seen: seen.has(a.name) && !XIU_NAMES.has(a.name), i: a.i }; });
    // 三垣：各写一个名，在两道垣墙的当中
    const yuan = [0, 1, 2].map((r) => { const ws = sky.asterisms.filter((a) => a.region === r && /垣$/.test(a.name)); let v: V3 = [0, 0, 0]; for (const a of ws) v = [v[0] + a.center[0], v[1] + a.center[1], v[2] + a.center[2]]; const l = Math.hypot(...v) || 1; const [x, y] = p([v[0] / l, v[1] / l, v[2] / l]); return { x, y, name: sky.regions[r] }; });
    return { stars, lines, xiu, ecl, han, hor, names, yuan };
  }, [lst, sk, sky, seen]);
  const [zx, zy] = proj(zen);
  const planets = sk.planets.map((p, i) => ({ ...p, i, xy: proj(p.dir) })).filter((p) => p.mag < 3 && decOf(p.dir) / D2R > -SOUTH);
  const [sx, sy] = proj(sk.sun), [mx, my] = proj(sk.moon);
  const sunUp = app(sk.M, sk.sun)[1] > 0, moonUp = app(sk.M, sk.moon)[1] > 0;
  const midXiu = mansionOf(south);

  // 点：换回赤经赤纬，找最近的星、连线、行星
  const pick = (cx: number, cy: number) => {
    const el = svg.current; if (!el) return;
    const b = el.getBoundingClientRect(), x = ((cx - b.left) / b.width) * 400 - C, y = ((cy - b.top) / b.height) * 400 - C;
    const r = Math.hypot(x, y); if (r > R + 4) { setSel(null); return; }
    const dec = (90 - (r / R) * (90 + SOUTH)) * D2R, ra = lst + Math.atan2(-x, y);
    const v: V3 = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
    const tol = (14 / R) * (90 + SOUTH) * D2R;
    for (const p of planets) { const d = Math.acos(Math.min(1, p.dir[0] * v[0] + p.dir[1] * v[1] + p.dir[2] * v[2])); if (d < tol * 0.8) { setSel({ kind: 'planet', i: p.i }); return; } }
    const s = nearest(S, v, tol, MAG);
    if (s >= 0) { const as = sky.byStar.get(s) ?? []; const a = as.find((i) => sky.asterisms[i].segs.includes(s)) ?? as[0]; if (a != null) { setSel({ kind: 'star', i: a, star: s }); return; } }
    let best = -1, bd = tol * 0.6;
    for (const a of sky.asterisms) for (let k = 0; k + 1 < a.segs.length; k += 2) { const A = a.segs[k] * 3, B = a.segs[k + 1] * 3, d = segDist(v, [S.dir[A], S.dir[A + 1], S.dir[A + 2]], [S.dir[B], S.dir[B + 1], S.dir[B + 2]]); if (d < bd) { bd = d; best = a.i; } }
    setSel(best >= 0 ? { kind: 'ast', i: best } : null);
  };
  const down = (e: RPointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    drag.current = { a: Math.atan2(e.clientY - b.top - b.height / 2, e.clientX - b.left - b.width / 2), t: turn, moved: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const b = e.currentTarget.getBoundingClientRect(), a = Math.atan2(e.clientY - b.top - b.height / 2, e.clientX - b.left - b.width / 2);
    let da = a - d.a; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
    d.moved += Math.abs(da);
    // 屏上顺时针转（东在左，赤经往左增）：图跟着手转
    setTurn(d.t - da);
  };
  const up = (e: RPointerEvent<SVGSVGElement>) => { const d = drag.current; drag.current = null; if (d && d.moved < 0.03) pick(e.clientX, e.clientY); };

  // 选中的那一个
  let info: { title: string; line: string; quote?: { text: string; source: string; gloss?: string }; note?: string } | null = null;
  const hiAst = sel && sel.kind !== 'planet' ? sky.asterisms[sel.i] : null;
  if (sel?.kind === 'planet') {
    const p = sk.planets[sel.i], pn = PLANET_NOTE[p.id];
    info = { title: p.name, line: `${p.alias}　在${mansionOf(p.dir)}`, quote: pn?.quote, note: pn?.note };
  } else if (hiAst) {
    const x = xiangOf(hiAst.region), rn = sky.regions[hiAst.region];
    const star = sel?.star != null ? sky.starName(sel.star) : null;
    const qs = QUOTES[hiAst.name];
    info = {
      title: hiAst.name,
      line: `${star && star !== hiAst.name ? star + '　' : ''}${hiAst.region < 3 ? rn : hiAst.name === rn ? x?.name ?? '' : `${rn}　${x?.name ?? ''}`}`,
      quote: qs?.[0], note: (star && NOTES[star]) || NOTES[hiAst.name] || (hiAst.region < 3 && hiAst.name.includes('垣') ? REGION_NOTE[rn] : undefined),
    };
  }
  let hiLines = '';
  if (hiAst) for (let k = 0; k + 1 < hiAst.segs.length; k += 2) { const [x1, y1] = proj(S.dir.subarray(hiAst.segs[k] * 3, hiAst.segs[k] * 3 + 3)), [x2, y2] = proj(S.dir.subarray(hiAst.segs[k + 1] * 3, hiAst.segs[k + 1] * 3 + 3)); hiLines += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`; }
  const hiXY = hiAst ? proj(hiAst.center) : sel?.kind === 'planet' ? planets.find((p) => p.i === sel.i)?.xy ?? null : null;

  return (
    <Sheet title="星图" sub={`此刻${midXiu}中天`}>
      <div className="starmap-wrap">
        <svg ref={svg} className="starmap" viewBox="0 0 400 400" role="img" aria-label="盖天式星图：北极在中，中天在下，东在左" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} data-testid="starmap">
          <defs>
            <clipPath id="starmap-clip"><circle cx={C} cy={C} r={R} /></clipPath>
            <mask id="starmap-below">
              <rect x="0" y="0" width="400" height="400" fill="#fff" />
              <path d={geo.hor + 'Z'} fill="#000" />
            </mask>
          </defs>
          <circle className="sm-paper" cx={C} cy={C} r={R} />
          <g clipPath="url(#starmap-clip)">
            <path className="sm-han" d={geo.han} />
            {/* 地平之下：罩一层淡墨 */}
            <rect className="sm-below" x="0" y="0" width="400" height="400" mask="url(#starmap-below)" />
            <path className="sm-hor" d={geo.hor + 'Z'} />
            {geo.xiu.map((x) => <path key={x.k} className="sm-xiu" d={x.d} />)}
            <circle className="sm-ring" cx={C} cy={C} r={rOf(SOUTH * D2R)} />
            <circle className="sm-ring sm-eq" cx={C} cy={C} r={rOf(0)} />
            <path className="sm-ecl" d={geo.ecl} />
            <path className="sm-lines" d={geo.lines} />
            {hiLines && <path className="sm-lines is-hi" d={hiLines} />}
            {geo.stars.map((s) => <circle key={s.i} className="sm-star" cx={s.x.toFixed(1)} cy={s.y.toFixed(1)} r={s.r.toFixed(2)} />)}
            {geo.names.map((n) => <text key={n.i} className={`sm-name${n.xiu ? ' is-xiu' : ''}${n.seen ? ' is-seen' : ''}`} x={n.x.toFixed(1)} y={(n.y - 4).toFixed(1)}>{n.name.replace(/宿$/, '')}</text>)}
            {geo.yuan.map((n) => <text key={n.name} className="sm-yuan" x={n.x.toFixed(1)} y={n.y.toFixed(1)}>{n.name}</text>)}
            {planets.map((p) => (
              <g key={p.id} className="sm-planet"><circle cx={p.xy[0].toFixed(1)} cy={p.xy[1].toFixed(1)} r="2.6" /><text x={(p.xy[0] + 4.5).toFixed(1)} y={(p.xy[1] + 3.5).toFixed(1)}>{p.name}</text></g>
            ))}
            {moonUp && <g className="sm-moon"><circle cx={mx.toFixed(1)} cy={my.toFixed(1)} r="4.2" /><text x={(mx + 6).toFixed(1)} y={(my + 3.5).toFixed(1)}>月</text></g>}
            {sunUp && <g className="sm-sun"><circle cx={sx.toFixed(1)} cy={sy.toFixed(1)} r="4.2" /></g>}
            {hiXY && <circle className="sm-hi" cx={hiXY[0].toFixed(1)} cy={hiXY[1].toFixed(1)} r="13" />}
            <g className="sm-zenith"><path d={`M${(zx - 3).toFixed(1)} ${zy.toFixed(1)}h6M${zx.toFixed(1)} ${(zy - 3).toFixed(1)}v6`} /></g>
          </g>
          <circle className="sm-rim" cx={C} cy={C} r={R} />
          <circle className="sm-pole" cx={C} cy={C} r="1.6" />
          <text className="sm-dir" x={C} y={C + R + 11}>南</text>
          <text className="sm-dir" x={C - R - 9} y={C + 4}>东</text>
          <text className="sm-dir" x={C + R + 9} y={C + 4}>西</text>
          <text className="sm-dir" x={C} y={C - R - 4}>北</text>
        </svg>
        {turn !== 0 && <button className="opt starmap-now" onClick={() => setTurn(0)} data-testid="starmap-now">回到此刻</button>}
      </div>
      {info ? (
        <div className="starmap-info" data-testid="starmap-info">
          <p className="sm-title"><b>{info.title}</b><span>{info.line}</span></p>
          {info.quote && <p className="sheet-note sheet-quote">{info.quote.text}<small>——{info.quote.source}</small></p>}
          {info.quote?.gloss && <p className="sheet-note">{info.quote.gloss}</p>}
          {info.note && <p className="sheet-note">{info.note}</p>}
        </div>
      ) : (
        <p className="sheet-note">北极在中，正南（中天）在下，东在左、西在右，像面朝南把这张图举过头顶看。三道圆：里面一道是内规（这一圈里的星在洛阳终夜不落），中间是赤道，外边是外规；朱线是黄道，日月五星都在它附近走；细的放射线是二十八宿的界，从各宿的距星划开。罩着淡墨的是此刻地平以下。拖动可以转，点一颗星看它的名。</p>
      )}
      {seen.size > 0 && <p className="sheet-note">观星时已认得{cnNum(seen.size)}个星官（三垣二十八宿共{cnNum(sky.asterisms.length)}个），图上都写着名字。</p>}
      <p className="sheet-note">星表：依巴谷星表（ESA 1997），画到{cnNum(5)}等星；星官连线与星名据 Stellarium 天空文化「chinese」（CC BY-SA），三垣二十八宿的分属以丹元子《步天歌》为准，据中文维基百科整理（CC BY-SA）。古书里的话出处见「关于」。</p>
    </Sheet>
  );
}
