import { useEffect, useMemo, useState } from 'react';
import { PATHS, PLACES, PLOTS, RIVER_PTS, SITE, STREAM, TREES } from '../../world/site';
import { getKs, go } from '../ks';
import { ui, useStore } from '../store';
import { TRI, XIANTIAN_SOURCE, type TrigramId } from '../texts';
import Sheet from './Sheet';

/**
 * 村图：照着总图（world/site.ts）现画的一张小图——溪、伊水、路、一畦畦田、草堂与院、池与亭、桥、邻家。上北下南，右东左西。
 * 四边八角淡淡地写着八卦：这片地方的八方合着先天方位（南乾北坤、东离西坎、东南兑、东北震、西南巽、西北艮）。
 * 朱点是你；点一处的名字，画淡成一片雾，人就到了。
 */
const X0 = -206, X1 = 176, Z0 = -84, Z1 = 266;
const n1 = (v: number) => v.toFixed(1);
/** 折线画成一条顺的线（拐弯处取中点做二次曲线） */
function smoothLine(pts: Array<[number, number]>): string {
  if (pts.length < 3) return pts.map(([x, z], i) => `${i ? 'L' : 'M'}${n1(x)} ${n1(z)}`).join('');
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) d += `Q${n1(pts[i][0])} ${n1(pts[i][1])} ${n1((pts[i][0] + pts[i + 1][0]) / 2)} ${n1((pts[i][1] + pts[i + 1][1]) / 2)}`;
  const e = pts[pts.length - 1];
  return d + `L${n1(e[0])} ${n1(e[1])}`;
}
/** 一批小点（每个是一段长度为零、圆头的线） */
const dots = (ps: Array<{ x: number; z: number }>) => ps.map((p) => `M${n1(p.x)} ${n1(p.z)}h0`).join('');
const seen = (x: number, z: number, pad = 0) => x > X0 - pad && x < X1 + pad && z > Z0 - pad && z < Z1 + pad;

function draw() {
  // 溪：中线
  const stream = smoothLine(STREAM.filter((p, i) => i % 2 === 0 && seen(p.x, p.z, 40)).map((p) => [p.x, p.z]));
  // 伊水：只有北岸那一道水边进得了图（在东南角）。水边比河心线的半宽再出去十几米——河滩是缓缓落进水里的
  const bank: Array<[number, number]> = [];
  for (let i = 0; i < RIVER_PTS.length; i++) {
    const p = RIVER_PTS[i];
    const a = RIVER_PTS[Math.max(0, i - 1)], b = RIVER_PTS[Math.min(RIVER_PTS.length - 1, i + 1)], tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1, off = p.w + 16;
    bank.push([p.x + (tz / l) * off, p.z - (tx / l) * off]);
  }
  // 只取落在图里（外加一圈）的那一段，两头各多带一个点：水边从图的下边进来、从右边出去，水在它的右下
  const near = (q: [number, number]) => seen(q[0], q[1], 70);
  const i0 = bank.findIndex(near), i1 = bank.length - 1 - [...bank].reverse().findIndex(near);
  const shore = i0 < 0 ? [] : bank.slice(Math.max(0, i0 - 1), i1 + 2);
  const shoreLine = smoothLine(shore);
  const river = shore.length ? `${shoreLine}L${n1(shore[shore.length - 1][0])} ${Z1 + 170}L${n1(shore[0][0])} ${Z1 + 170}Z` : '';
  // 路
  const paths = PATHS.map((p) => smoothLine(p.pts)).join('');
  // 田：一畦一个方框，里面几道垄
  let plots = '', furrows = '';
  for (const p of PLOTS) {
    plots += `M${p.x0} ${p.z0}H${p.x1}V${p.z1}H${p.x0}Z`;
    const n = p.crop === 'plough' ? 7 : 4;
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      furrows += p.rows ? `M${n1(p.x0 + (p.x1 - p.x0) * t)} ${p.z0 + 2.5}V${p.z1 - 2.5}` : `M${p.x0 + 2.5} ${n1(p.z0 + (p.z1 - p.z0) * t)}H${p.x1 - 2.5}`;
    }
  }
  // 草木：桃是一点一点的淡朱；竹、桑、杂树、北坡的林是淡墨的点
  const tree = (k: string) => TREES.filter((t) => t.kind === k && seen(t.x, t.z, -6));
  const peach = dots(tree('peach')), bamboo = dots(tree('bamboo')), wood = dots([...tree('wood'), ...tree('mulberry')]), big = dots([...tree('willow'), ...tree('pine'), ...tree('plum'), ...tree('elm')]);
  // 邻家几户：小方块，各有各的朝向
  const houses = SITE.houses.map((h) => ({ ...h, deg: (-h.yaw * 180) / Math.PI }));
  // 北边的冈峦（邙山脚）：几笔山形，大小不一
  let hills = '';
  for (const [x, z, w] of [[-150, -60, 24], [-122, -65, 16], [-90, -62, 28], [-58, -66, 18], [28, -64, 20], [58, -61, 30], [92, -66, 18], [122, -62, 24]]) hills += `M${n1(x - w / 2)} ${n1(z + w * 0.22)}Q${n1(x - w * 0.2)} ${n1(z - w * 0.3)} ${x} ${n1(z - w * 0.36)}Q${n1(x + w * 0.24)} ${n1(z - w * 0.18)} ${n1(x + w / 2)} ${n1(z + w * 0.22)}`;
  return { stream, shoreLine, river, paths, plots, furrows, peach, bamboo, wood, big, houses, hills };
}

/** 图边上的一个卦：三画与名字，下面小字是方位 */
function Edge({ id, dir, x, y }: { id: TrigramId; dir: string; x: number; y: number }) {
  const t = TRI[id];
  return (
    <g className="map-tri" transform={`translate(${x} ${y})`} aria-label={`${dir}，${t.name}`}>
      {t.lines.map((v, i) => { const yy = 3 - i * 3; return v ? <path key={i} d={`M-5.2 ${yy}H5.2`} /> : <path key={i} d={`M-5.2 ${yy}H-1.3M1.3 ${yy}H5.2`} />; })}
      <text y={15.5}>{t.name}<tspan className="map-dir" dx={2.5}>{dir}</tspan></text>
    </g>
  );
}

/** 各处的名字写在哪（相对那一处的落脚点）：屋舍那几处挤在一起，左右错开 */
const LABEL: Record<string, [number, number, 'start' | 'end' | 'middle']> = {
  grove: [0, -12, 'middle'], bridge: [8, 4.5, 'start'], yard: [-17, 3, 'end'], hall: [19, 1, 'start'], pavilion: [-9, -3, 'end'],
  fields: [8, 5, 'start'], village: [6, -30, 'middle'], ferry: [-9, 2, 'end'],
};

export default function MapSheet() {
  const place = useStore(ui, (s) => s.place);
  const g = useMemo(draw, []);
  // 人此刻在图上的哪里、朝哪边
  const read = () => { const k = getKs(); return k ? { x: k.player.pos.x, z: k.player.pos.z, yaw: k.player.yaw } : null; };
  const [me, setMe] = useState(read);
  useEffect(() => { const t = setInterval(() => setMe(read()), 350); return () => clearInterval(t); }, []);
  const H = SITE.hall, G = SITE.wing, Y = SITE.yard, P = SITE.pond, V = SITE.pavilion, B = SITE.bridge, W = SITE.well, E = SITE.elm, K = SITE.plank, F = SITE.ferry, S = SITE.stones;
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  return (
    <Sheet title="村图" sub="上北下南" wide>
      <svg className="map" viewBox={`${X0} ${Z0} ${X1 - X0} ${Z1 - Z0}`} role="img" aria-label="安乐窝一带的地图，点一处的名字即可到那里">
        <defs><clipPath id="map-clip"><rect x={X0} y={Z0} width={X1 - X0} height={Z1 - Z0} /></clipPath></defs>
        <g clipPath="url(#map-clip)">
          <g filter="url(#ks-rough)">
            <path className="map-water" d={g.river} />
            <path className="map-shore" d={g.shoreLine} />
            <path className="map-wave" d="M104 258q3-2 6 0t6 0M132 247q3-2 6 0t6 0M162 250q3-2 6 0t6 0M158 236q3-2 6 0t6 0" />
            <path className="map-stream-wash" d={g.stream} />
            <path className="map-stream" d={g.stream} />
            <path className="map-plot" d={g.plots} />
            <path className="map-furrow" d={g.furrows} />
            <path className="map-path" d={g.paths} />
            {/* 北边的冈峦（邙山脚） */}
            <path className="map-hill" d={g.hills} />
            <path className="map-wood" d={g.wood} />
            <path className="map-bamboo" d={g.bamboo} />
            <path className="map-big" d={g.big} />
            <path className="map-peach" d={g.peach} />
            {/* 院：竹篱一圈；草堂、东厢 */}
            <rect className="map-fence" x={Y.x0} y={Y.z0} width={Y.x1 - Y.x0} height={Y.z1 - Y.z0} />
            <rect className="map-roof" x={H.x - H.w / 2} y={H.z - H.d / 2} width={H.w} height={H.d} />
            <rect className="map-roof" x={G.x - G.w / 2} y={G.z - G.d / 2} width={G.w} height={G.d} />
            {/* 屋后的池与亭 */}
            <ellipse className="map-pond" cx={P.x} cy={P.z} rx={P.rx} ry={P.rz} />
            <path className="map-wave" d={`M${P.x - 4} ${P.z}q1.5-1.2 3 0t3 0`} />
            <rect className="map-pav" x={V.x - V.half} y={V.z - V.half} width={V.half * 2} height={V.half * 2} />
            {/* 石桥、踏石、修着的木桥 */}
            <path className="map-bridge" d={`M${B.x - 1.2} ${B.z - B.len / 2}V${B.z + B.len / 2}M${B.x + 1.2} ${B.z - B.len / 2}V${B.z + B.len / 2}`} />
            <path className="map-stone" d={`M${S.x} ${S.z - 2.4}h0M${S.x} ${S.z}h0M${S.x} ${S.z + 2.4}h0`} />
            <path className="map-plank" d={`M${n1(K.x - Math.sin(K.yaw) * K.len / 2)} ${n1(K.z - Math.cos(K.yaw) * K.len / 2)}L${n1(K.x + Math.sin(K.yaw) * K.len / 2)} ${n1(K.z + Math.cos(K.yaw) * K.len / 2)}`} />
            {/* 邻家、大槐树、井 */}
            {g.houses.map((h) => <rect key={h.id} className={h.id === 'school' ? 'map-roof map-school' : 'map-roof'} x={-h.w / 2} y={-h.d / 2} width={h.w} height={h.d} transform={`translate(${h.x} ${h.z}) rotate(${n1(h.deg)})`} />)}
            <circle className="map-elm" cx={E.x} cy={E.z} r={4.6} />
            <path className="map-well" d={`M${W.x - 1.6} ${W.z - 1.6}h3.2v3.2h-3.2ZM${W.x} ${W.z}h0`} />
            {/* 渡口的一叶舟 */}
            <path className="map-boat" d={`M${F.x + 3} ${F.z + 9}q5 3.4 10 0`} />
          </g>
          <text className="map-far" x={146} y={259}>伊水</text>
        </g>
        <Edge id="kun" dir="北" x={cx} y={Z0 + 9} />
        <Edge id="qian" dir="南" x={cx - 44} y={Z1 - 24} />
        <Edge id="li" dir="东" x={X1 - 15} y={cz - 4} />
        <Edge id="kan" dir="西" x={X0 + 15} y={cz - 4} />
        <Edge id="zhen" dir="东北" x={X1 - 19} y={Z0 + 9} />
        <Edge id="gen" dir="西北" x={X0 + 19} y={Z0 + 9} />
        <Edge id="dui" dir="东南" x={X1 - 19} y={Z1 - 80} />
        <Edge id="xun" dir="西南" x={X0 + 19} y={Z1 - 24} />
        {PLACES.map((s) => {
          const [dx, dz, anchor] = LABEL[s.id] ?? [8, 4, 'start'];
          const x = s.spawn[0], z = s.spawn[1], tx = x + dx, tz = z + dz, w = s.name.length * 13 + 8;
          const hx = anchor === 'start' ? tx - 5 : anchor === 'end' ? tx - w + 5 : tx - w / 2;
          return (
            <g key={s.id} className={`map-st${s.id === place ? ' is-here' : ''}`} onClick={() => go(s.id)} data-testid={`map-${s.id}`} role="button" aria-label={`去${s.name}`}>
              <rect className="map-hit" x={Math.min(hx, x - 6)} y={Math.min(tz - 12, z - 6)} width={Math.max(w, Math.abs(tx - x) + 12)} height={Math.max(20, Math.abs(tz - z) + 14)} />
              <circle cx={x} cy={z} r={1.9} />
              <text x={tx} y={tz} textAnchor={anchor}>{s.name}</text>
            </g>
          );
        })}
        {me && seen(me.x, me.z) && (
          <g className="map-me" transform={`translate(${n1(me.x)} ${n1(me.z)}) rotate(${(180 - (me.yaw * 180) / Math.PI).toFixed(0)})`}>
            <path d="M0 -7.4L2.9 -2.6H-2.9Z" /><circle r={3.1} />
          </g>
        )}
      </svg>
      <div className="map-list" role="group" aria-label="去一处">
        {PLACES.map((s) => (
          <button key={s.id} className={`opt${s.id === place ? ' is-on' : ''}`} onClick={() => go(s.id)} title={s.note} data-testid={`go-${s.id}`}>{s.name}</button>
        ))}
      </div>
      <p className="sheet-note">朱点是你，尖头是你面朝的方向。平时自己走着去；路远了，点一处，画淡成一片雾，人就到了。</p>
      <p className="sheet-note">四边的八卦是这片地方的八方，合着先天方位：南是长空与伊阙（乾为天），北是邙山（坤为地），东边日出（离为火），西边溪水出山（坎为水）。</p>
      {XIANTIAN_SOURCE && <p className="sheet-note sheet-quote">「{XIANTIAN_SOURCE.text}」{XIANTIAN_SOURCE.source ? `——${XIANTIAN_SOURCE.source}` : ''}</p>}
    </Sheet>
  );
}
