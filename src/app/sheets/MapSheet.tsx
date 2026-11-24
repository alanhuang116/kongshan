import { useEffect, useMemo, useRef, useState } from 'react';
import { PATHS, PLACES, PLOTS, RIVER_PTS, SITE, STREAM, TREES } from '../../world/site';
import { farm } from '../../world/farm';
import { getKs, go } from '../ks';
import { ui, useStore } from '../store';
import { TRI, XIANTIAN_SOURCE, type TrigramId } from '../texts';
import Sheet from './Sheet';

/**
 * 村图：照着总图（world/site.ts）现画的一张小图——溪、伊水、路、一畦畦田、草堂与院、池与亭、桥、邻家。上北下南，右东左西。
 * 四边八角淡淡地写着八卦：这片地方的八方合着先天方位（南乾北坤、东离西坎、东南兑、东北震、西南巽、西北艮）。
 * 「你」是一滴朱墨（尖头是面朝的方向），外面一圈慢慢晕开；挑着担子时，一道朱色的点线连到要去的地方（立一根小旗、写着名字），
 * 放在地上的担子画成一根扁担两头两点。这几样按屏上的像素定大小（图在手机上缩得很小也看得清）。
 * 点一处的名字，画淡成一片雾，人就到了。
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

/** 放在地上的担子：挑的什么 */
const PILE_NAME: Record<string, string> = { sheaf: '麦捆', milletEar: '谷穗', water: '水' };
/** 各处名字在图上大约占的那一块（按手机上那一档字号估：13.5） */
const LABEL_BOX = PLACES.map((s) => {
  const [dx, dz, anchor] = LABEL[s.id] ?? [8, 4, 'start'], x = s.spawn[0] + dx, z = s.spawn[1] + dz, w = s.name.length * 14 + 2;
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return { x0, x1: x0 + w, z0: z - 7, z1: z + 7 };
});
/** 去处的名字写在小旗哪一边：右上、左上、右下、左下，挑第一处不压着各处名字、不压着「你」的 */
function destLabel(d: { x: number; z: number; name: string }, u: number, me: { x: number; z: number } | null, R: number) {
  const fs = 13 * u, w = d.name.length * fs * 1.12, h = fs * 1.3, top = d.z - 17 * u;
  const tries: Array<{ x: number; y: number; anchor: 'start' | 'end' }> = [
    { x: d.x + 6.5 * u, y: top, anchor: 'start' }, { x: d.x - 6.5 * u, y: top, anchor: 'end' },
    { x: d.x + 5 * u, y: d.z + 2 * u, anchor: 'start' }, { x: d.x - 5 * u, y: d.z + 2 * u, anchor: 'end' },
  ];
  const hit = (t: (typeof tries)[number]) => {
    const x0 = t.anchor === 'start' ? t.x : t.x - w, x1 = x0 + w, z0 = t.y - h / 2, z1 = t.y + h / 2;
    if (LABEL_BOX.some((b) => x0 < b.x1 && x1 > b.x0 && z0 < b.z1 && z1 > b.z0)) return true;
    return !!me && Math.max(x0 - me.x, me.x - x1, 0) ** 2 + Math.max(z0 - me.z, me.z - z1, 0) ** 2 < (R * 2.2) ** 2;
  };
  return tries.find((t) => !hit(t)) ?? tries[0];
}
/** 「你」字写在那一滴的哪一边：右上、左上、右下、左下，挑第一处不压着各处名字（与去处的名字）的 */
function meLabel(me: { x: number; z: number }, R: number, u: number, avoid: Array<{ x0: number; x1: number; z0: number; z1: number }>) {
  const fs = 12.5 * u, w = fs * 1.15, h = fs * 1.3, dx = R * 2.3;
  const tries: Array<{ x: number; y: number; anchor: 'start' | 'end' | 'middle' }> = [
    { x: me.x + dx, y: me.z - R * 1.7, anchor: 'start' }, { x: me.x - dx, y: me.z - R * 1.7, anchor: 'end' },
    { x: me.x + dx, y: me.z + R * 1.9, anchor: 'start' }, { x: me.x - dx, y: me.z + R * 1.9, anchor: 'end' },
    { x: me.x, y: me.z - R * 3.4, anchor: 'middle' }, { x: me.x, y: me.z + R * 3.4, anchor: 'middle' },
    { x: me.x + dx * 1.1, y: me.z, anchor: 'start' }, { x: me.x - dx * 1.1, y: me.z, anchor: 'end' },
  ];
  const boxes = [...LABEL_BOX, ...avoid];
  return tries.find((t) => {
    const x0 = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - w : t.x - w / 2, x1 = x0 + w, z0 = t.y - h / 2, z1 = t.y + h / 2;
    return !boxes.some((b) => x0 < b.x1 && x1 > b.x0 && z0 < b.z1 && z1 > b.z0);
  }) ?? tries[0];
}
/** 「你」那一滴：r 是半径；尖头朝上（−z，北），整组再转到面朝的方向 */
const drop = (r: number) => `M0 ${n1(-2.3 * r)}C${n1(0.55 * r)} ${n1(-1.6 * r)} ${n1(r)} ${n1(-0.8 * r)} ${n1(r)} 0A${n1(r)} ${n1(r)} 0 1 1 ${n1(-r)} 0C${n1(-r)} ${n1(-0.8 * r)} ${n1(-0.55 * r)} ${n1(-1.6 * r)} 0 ${n1(-2.3 * r)}Z`;

export default function MapSheet() {
  const place = useStore(ui, (s) => s.place);
  const g = useMemo(draw, []);
  // 人此刻在图上的哪里、朝哪边；挑着担子时要去哪、路怎么走；地上放着的担子
  const read = () => { const k = getKs(); return k ? { x: k.player.pos.x, z: k.player.pos.z, yaw: k.player.yaw, carry: farm()?.guide.mapView() ?? null } : null; };
  const [me, setMe] = useState(read);
  useEffect(() => { const t = setInterval(() => setMe(read()), 350); return () => clearInterval(t); }, []);
  // 图上一个像素是几个单位（「你」、去处按像素定大小：手机上图缩得小，它们不跟着缩没）
  const svg = useRef<SVGSVGElement>(null);
  const [u, setU] = useState(1);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const fit = () => { const w = el.getBoundingClientRect().width; if (w > 40) setU((X1 - X0) / w); };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const H = SITE.hall, G = SITE.wing, Y = SITE.yard, P = SITE.pond, V = SITE.pavilion, B = SITE.bridge, W = SITE.well, E = SITE.elm, K = SITE.plank, F = SITE.ferry, S = SITE.stones;
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  // 「你」：半径六个半像素（电脑上图大些时也不小于四个单位）
  const R = Math.max(6.5 * u, 4.2), carry = me?.carry ?? null, dest = carry?.dest ?? null;
  // 去处的名字写在哪；「你」字避开它与各处名字
  const destL = dest && seen(dest.x, dest.z) ? destLabel(dest, u, me, R) : null;
  const destBox = destL && dest ? (() => { const w = dest.name.length * 13 * u * 1.12, x0 = destL.anchor === 'start' ? destL.x : destL.x - w; return [{ x0, x1: x0 + w, z0: destL.y - 9 * u, z1: destL.y + 9 * u }]; })() : [];
  const meL = me ? meLabel(me, R, u, destBox) : null;
  const route = carry && carry.route.length > 1 ? carry.route.map(([x, z], i) => `${i ? 'L' : 'M'}${n1(x)} ${n1(z)}`).join('') : '';
  return (
    <Sheet title="村图" sub="上北下南" wide>
      <svg ref={svg} className="map" viewBox={`${X0} ${Z0} ${X1 - X0} ${Z1 - Z0}`} role="img" aria-label="安乐窝一带的地图，点一处的名字即可到那里">
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
          {/* 挑着担子：从你到要去的地方，一道朱色的点线（也抖一抖，像手画的） */}
          {route && <g filter="url(#ks-rough)"><path className="map-route" d={route} style={{ strokeWidth: 2.8 * u, strokeDasharray: `${n1(0.1 * u)} ${n1(4.6 * u)}` }} data-testid="map-route" /></g>}
          {/* 放在地上的担子：一根扁担两头两点 */}
          {carry?.piles.filter((q) => seen(q.x, q.z)).map((q, i) => (
            <g key={i} className="map-pile" transform={`translate(${n1(q.x)} ${n1(q.z)})`} data-testid="map-pile">
              <title>{`放在这里的担子：${PILE_NAME[q.item] ?? ''}`}</title>
              <path d={`M${n1(-4.6 * u)} 0H${n1(4.6 * u)}`} style={{ strokeWidth: 1.5 * u }} />
              <circle cx={n1(-4.6 * u)} r={n1(2 * u)} style={{ strokeWidth: 0.8 * u }} /><circle cx={n1(4.6 * u)} r={n1(2 * u)} style={{ strokeWidth: 0.8 * u }} />
            </g>
          ))}
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
        {/* 要去的地方：一根小旗，顶上一点朱，旁边写着名字 */}
        {dest && destL && (
          <g className="map-dest" data-testid="map-dest">
            <path className="map-dest-pole" d={`M${n1(dest.x)} ${n1(dest.z)}V${n1(dest.z - 17 * u)}`} style={{ strokeWidth: 1.7 * u }} />
            <circle className="map-dest-dot" cx={n1(dest.x)} cy={n1(dest.z - 17 * u)} r={n1(3.8 * u)} style={{ strokeWidth: 1.1 * u }} />
            <text x={n1(destL.x)} y={n1(destL.y)} textAnchor={destL.anchor} style={{ fontSize: `${n1(13 * u)}px`, strokeWidth: 3.2 * u }}>{dest.name}</text>
          </g>
        )}
        {me && seen(me.x, me.z) && (
          <g className="map-me" data-testid="map-me">
            <g transform={`translate(${n1(me.x)} ${n1(me.z)}) rotate(${(180 - (me.yaw * 180) / Math.PI).toFixed(0)})`}>
              <circle className="map-me-halo" r={n1(R * 2.15)} />
              <circle className="map-me-ring" r={n1(R * 1.45)} style={{ ['--me-w' as string]: `${n1(1.6 * u)}px` }} />
              <path className="map-me-body" d={drop(R)} style={{ ['--me-w' as string]: `${n1(1.3 * u)}px` }} />
              <circle className="map-me-eye" r={n1(R * 0.36)} />
            </g>
            {meL && <text x={n1(meL.x)} y={n1(meL.y)} textAnchor={meL.anchor} style={{ fontSize: `${n1(12.5 * u)}px`, strokeWidth: 3 * u }}>你</text>}
          </g>
        )}
      </svg>
      <div className="map-list" role="group" aria-label="去一处">
        {PLACES.map((s) => (
          <button key={s.id} className={s.id === place ? 'is-on' : ''} onClick={() => go(s.id)} title={s.note} aria-current={s.id === place ? 'location' : undefined} data-testid={`go-${s.id}`}>{s.name}</button>
        ))}
      </div>
      <p className="sheet-note">朱色的一滴是你（外面一圈慢慢晕开），尖头是你面朝的方向。{dest ? `挑着担子：朱色的点线连到${dest.name}，那里立着一根小旗。` : ''}平时自己走着去；路远了，点一处，画淡成一片雾，人就到了。</p>
      <p className="sheet-note">四边的八卦是这片地方的八方，合着先天方位：南是长空与伊阙（乾为天），北是邙山（坤为地），东边日出（离为火），西边溪水出山（坎为水）。</p>
      {XIANTIAN_SOURCE && <p className="sheet-note sheet-quote">「{XIANTIAN_SOURCE.text}」{XIANTIAN_SOURCE.source ? `——${XIANTIAN_SOURCE.source}` : ''}</p>}
    </Sheet>
  );
}
