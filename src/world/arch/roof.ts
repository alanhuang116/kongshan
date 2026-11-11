/**
 * 屋顶：庑殿、歇山、悬山、攒尖，都由同一个「檐口矩形上的高度场」生成。
 *
 *   s = 从檐口往里走了几成（0 在檐口，1 在正脊）；高度 y = y0 + 举高·f(s) + 翼角起翘。
 *   f(s) = a·s + (1−a)·s² —— 檐口平缓、近脊陡，就是举折那条凹曲线。
 *   翼角起翘：只在四个角附近（离两条檐口都近的地方）往上抬，沿檐口看是一条从明间起就缓缓上扬的线（唐风：平缓舒展，不是明清的陡翘）。
 *
 * 瓦是真做出来的几何：一垄筒瓦（凸）、一沟板瓦（凹），顺着坡面走；檐口有瓦当、滴水、连檐，檐下有椽（翼角处成扇形）、角梁。
 * 脊：正脊两端鸱尾，垂脊 / 戗脊末端上翘。
 */
import * as THREE from 'three';
import { Builder, type Geo, M, V, box, cyl, extrude, grid, lathe, prism, shade, sweep, tint } from '../core/geo';
import { clamp, fbm, smooth } from '../core/rng';

export interface RoofSpec {
  /** 檐口半宽（x）、半深（z） */
  W: number; D: number;
  /** 檐口瓦面的高度 */
  y0: number;
  /** 举高：檐口到正脊 */
  rise: number;
  /** 正脊半长（攒尖为 0） */
  Rg: number;
  /** 山面的坡到几成高为止：1 庑殿，0…1 歇山，0 悬山（没有山面坡） */
  sg?: number;
  /** 坡面的直线成分，越小越凹（0.35…0.7） */
  a?: number;
  /** 翼角起翘的高度，及从离角多远起翘 */
  lift?: number; liftX?: number; liftZ?: number;
  /** 瓦垄间距 */
  tile?: number;
  /** 椽从离檐口多远的地方出来（撩檐枋的位置） */
  purlin: number;
  /** 飞椽（檐口多一层方椽） */
  flying?: boolean;
  /** 脊端：鸱尾 / 素 */
  ends?: 'chiwei' | 'plain';
  /** 攒尖顶的宝顶高度（Rg 为 0 时） */
  finial?: number;
  /** 脊的粗细倍率 */
  ridgeScale?: number;
  /** 细致程度 0…1 */
  detail?: number;
  /** 不做椽（很小的顶、远处的塔） */
  noRafters?: boolean;
  /** 墙帽：不要山面的博风、悬鱼、垂脊，也不要望板 */
  bare?: boolean;
  /** 坡面沿坡向分几段（默认按 detail 定；很窄的顶给 2–3 就够） */
  rows?: number;
}

export interface Roof { heightAt(x: number, z: number): number; top: number }

const RIDGE: Array<[number, number]> = [[-0.26, 0], [0.26, 0], [0.26, 0.12], [0.2, 0.16], [0.2, 0.5], [0.26, 0.56], [0.25, 0.66], [0.17, 0.74], [0.06, 0.78], [-0.06, 0.78], [-0.17, 0.74], [-0.25, 0.66], [-0.26, 0.56], [-0.2, 0.5], [-0.2, 0.16], [-0.26, 0.12]];
const HIP: Array<[number, number]> = [[-0.17, 0], [0.17, 0], [0.17, 0.1], [0.13, 0.13], [0.13, 0.32], [0.17, 0.36], [0.16, 0.43], [0.09, 0.49], [0.0, 0.51], [-0.09, 0.49], [-0.16, 0.43], [-0.17, 0.36], [-0.13, 0.32], [-0.13, 0.13], [-0.17, 0.1]];

/** 鸱尾：立在正脊尽头，尾尖向内卷。side = +1 是 +x 那一端 */
function chiwei(side: number, h: number): Geo {
  const s = new THREE.Shape();
  const k = h / 1.7;
  s.moveTo(0.5 * k, 0);
  s.bezierCurveTo(0.74 * k, 0.45 * k, 0.72 * k, 1.05 * k, 0.3 * k, 1.42 * k);
  s.bezierCurveTo(0.1 * k, 1.6 * k, -0.2 * k, 1.72 * k, -0.52 * k, 1.66 * k);
  s.bezierCurveTo(-0.3 * k, 1.52 * k, -0.12 * k, 1.34 * k, -0.06 * k, 1.1 * k);
  s.bezierCurveTo(-0.02 * k, 0.9 * k, -0.2 * k, 0.72 * k, -0.42 * k, 0.6 * k);
  s.bezierCurveTo(-0.55 * k, 0.5 * k, -0.6 * k, 0.25 * k, -0.6 * k, 0);
  s.closePath();
  const g = extrude(s, 0.34 * k, 'y', 10, 0.05 * k);
  if (side < 0) g.scale(-1, 1, 1);
  // 鳍上的几道棱：外缘一排小凸
  return g;
}

export function buildRoof(b: Builder, sp: RoofSpec): Roof {
  const { W, D, y0, rise, Rg } = sp;
  const sg = sp.sg ?? 1, a = sp.a ?? 0.5, det = sp.detail ?? 1;
  const L = sp.lift ?? 0.6, ax = sp.liftX ?? W * 0.72, az = sp.liftZ ?? D * 0.72;
  const tw0 = sp.tile ?? 0.28, rs = sp.ridgeScale ?? 1;
  const tubeH = tw0 * 0.26, panDip = tw0 * 0.07;
  const ns = sp.rows ?? Math.round(8 + 8 * det);
  const f = (s: number) => a * s + (1 - a) * s * s;
  const lift = (x: number, z: number) => {
    if (sg <= 0 || L === 0) return 0;
    const cx = clamp((Math.abs(x) - (W - ax)) / ax), cz = clamp((Math.abs(z) - (D - az)) / az);
    return L * Math.pow(cx, 2.3) * Math.pow(cz, 2.3);
  };
  const sSide = (x: number) => (sg <= 0 ? 2 : (sg * (W - Math.abs(x))) / Math.max(1e-6, W - Rg));
  const sOf = (x: number, z: number) => {
    const sf = 1 - Math.abs(z) / D;
    return sg <= 0 || Math.abs(x) <= Rg ? sf : Math.min(sf, sSide(x));
  };
  const H = (x: number, z: number) => y0 + rise * f(clamp(sOf(x, z))) + lift(x, z);
  const OFF = det > 0.5 ? [-0.5, -0.3, -0.17, 0, 0.17, 0.3] : [-0.5, -0.27, 0, 0.27];
  const bump = (o: number) => (Math.abs(o) <= 0.3 ? tubeH * Math.pow(Math.cos((o / 0.3) * Math.PI * 0.5), 0.7) : -panDip * smooth(0.3, 0.5, Math.abs(o)));
  const slopeLen = Math.hypot(D, rise) * 1.04, rowLen = 0.3;
  const no = OFF.length;
  /** 屋面的旧：整片屋面上慢慢变化的深浅、近脊处的水痕（贴图会重复，这个不会） */
  const weather = (g: Geo) => shade(g, (x, y, z) => {
    const n = fbm(x * 0.21 + 31, z * 0.21 + 7, 3, 5), n2 = fbm(x * 1.6 + 3, z * 0.3 + 11, 2, 9);
    const up = clamp((y - y0) / rise);
    return 0.74 + 0.36 * n + 0.14 * (n2 - 0.5) - 0.08 * up * up;
  });

  // —— 前后坡 ——
  const nx = Math.max(2, Math.round((2 * W) / tw0)), twx = (2 * W) / nx;
  for (const front of [1, -1]) {
    const cols: THREE.Vector3[][] = [], us: number[] = [], vs: number[][] = [];
    for (let k = 0; k <= nx * no; k++) {
      const c = Math.floor(k / no), oi = k % no;
      const x = -W + (c + 0.5 + OFF[oi]) * twx;
      const sTop = sg <= 0 || Math.abs(x) <= Rg ? 1 : clamp(sSide(x));
      const col: THREE.Vector3[] = [], vv: number[] = [];
      for (let j = 0; j <= ns; j++) {
        const s = (sTop * j) / ns, z = front * D * (1 - s);
        col.push(V(x, H(x, z) + bump(OFF[oi]), z));
        vv.push((s * slopeLen) / rowLen);
      }
      cols.push(col); us.push(c + 0.5 + OFF[oi]); vs.push(vv);
    }
    b.add('tile', weather(grid(cols, (i, j) => [us[i], vs[i][j]], front < 0)));
  }
  // —— 山面坡 ——
  const nz = Math.max(2, Math.round((2 * D) / tw0)), twz = (2 * D) / nz;
  if (sg > 0) {
    for (const side of [1, -1]) {
      const cols: THREE.Vector3[][] = [], us: number[] = [], vs: number[][] = [];
      for (let k = 0; k <= nz * no; k++) {
        const c = Math.floor(k / no), oi = k % no;
        const z = -D + (c + 0.5 + OFF[oi]) * twz;
        const sTop = Math.min(sg, 1 - Math.abs(z) / D);
        const col: THREE.Vector3[] = [], vv: number[] = [];
        for (let j = 0; j <= ns; j++) {
          const s = (sTop * j) / ns, x = side * (W - ((W - Rg) * s) / sg);
          col.push(V(x, H(x, z) + bump(OFF[oi]), z));
          vv.push((s * slopeLen) / rowLen);
        }
        cols.push(col); us.push(c + 0.5 + OFF[oi]); vs.push(vv);
      }
      b.add('tile', weather(grid(cols, (i, j) => [us[i], vs[i][j]], side > 0)));
    }
  }

  // —— 脊 ——
  const top = y0 + rise;
  const scl = (p: Array<[number, number]>, k: number) => p.map(([x, y]) => [x * k, y * k] as [number, number]);
  if (Rg > 0.3) {
    const pts: THREE.Vector3[] = [];
    const n = Math.max(6, Math.round(Rg * 2));
    for (let i = 0; i <= n; i++) { const x = -Rg + (2 * Rg * i) / n; pts.push(V(x, top - 0.06 + 0.22 * rs * Math.pow(Math.abs(x) / Rg, 2.6), 0)); }
    b.add('ridge', sweep(pts, scl(RIDGE, rs)));
    if ((sp.ends ?? 'chiwei') === 'chiwei') {
      for (const side of [1, -1]) b.add('ridge', chiwei(side, 1.75 * rs).translate(side * (Rg - 0.28 * rs), top + 0.1 * rs, 0));
    }
  } else if (sp.finial) {
    // 攒尖：宝顶（覆钵、相轮、宝珠）
    const h = sp.finial;
    b.add('ridge', lathe([[0.42 * h, 0], [0.44 * h, 0.06 * h], [0.3 * h, 0.1 * h], [0.34 * h, 0.2 * h], [0.3 * h, 0.34 * h], [0.14 * h, 0.42 * h], [0.1 * h, 0.5 * h], [0.17 * h, 0.56 * h], [0.1 * h, 0.62 * h], [0.15 * h, 0.68 * h], [0.08 * h, 0.74 * h], [0.12 * h, 0.82 * h], [0.1 * h, 0.9 * h], [0.0, h]], 16).translate(0, top - 0.08, 0));
  }
  const hipPath = (sx: number, sz: number): THREE.Vector3[] => {
    const pts: THREE.Vector3[] = [], n = 14, s1 = sg;
    for (let i = 0; i <= n; i++) {
      const s = s1 * (1 - i / n) * 0.985 + 0.012;
      const x = W - ((W - Rg) * s) / sg, z = D * (1 - s);
      const tip = 0.3 * rs * Math.pow(clamp(1 - s / 0.16), 2);
      pts.push(V(sx * x, H(x, z) + tip - 0.02, sz * z));
    }
    // 末端再往外探一点、向上卷
    const e = pts[pts.length - 1], d = new THREE.Vector3().subVectors(e, pts[pts.length - 2]).normalize();
    pts.push(e.clone().addScaledVector(d, 0.22 * rs).add(V(0, 0.16 * rs, 0)));
    return pts;
  };
  if (sg > 0) {
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const path = hipPath(sx, sz);
      b.add('ridge', sweep(path, scl(HIP, rs), { scale: (t) => 1 - 0.25 * smooth(0.8, 1, t) }));
      // 脊端一枚小兽（只是个蹲着的剪影）
      const e = path[path.length - 3];
      b.add('ridge', shade(lathe([[0.1 * rs, 0], [0.12 * rs, 0.1 * rs], [0.07 * rs, 0.2 * rs], [0.09 * rs, 0.28 * rs], [0.0, 0.36 * rs]], 8), () => 0.9).translate(e.x, e.y + 0.42 * rs, e.z));
    }
  }
  if (sg > 0 && sg < 1) {
    // 歇山：垂脊（沿山花的边）、博脊（山面坡的上沿）、博风板、悬鱼、山花
    const zg = D * (1 - sg);
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) { const s = 1 - (i / 10) * (1 - sg) * 0.96; const z = D * (1 - s); pts.push(V(sx * (Rg - 0.2 * rs), H(Rg - 0.3, z) - 0.02, sz * z)); }
        b.add('ridge', sweep(pts, scl(HIP, rs)));
        // 博风板
        const bp: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) { const s = 1 - (i / 10) * (1 - sg); const z = D * (1 - s); bp.push(V(sx * (Rg + 0.03), H(Rg - 0.3, z) - 0.1, sz * z)); }
        b.add('wood', sweep(bp, [[-0.035, -0.44], [0.035, -0.44], [0.035, 0], [-0.035, 0]]));
      }
      b.add('ridge', sweep([V(sx * (Rg + 0.02), H(Rg + 0.05, 0) - 0.02, -zg), V(sx * (Rg + 0.02), H(Rg + 0.05, 0) - 0.02, zg)], scl(HIP, rs * 0.85)));
      // 山花：白壁 + 叉手
      const xg = sx * (Rg - 0.42), rows: THREE.Vector3[][] = [];
      for (let i = 0; i <= 8; i++) { const s = sg + ((1 - sg) * i) / 8, z = D * (1 - s) * 0.98; const y = H(Rg - 0.5, z) - 0.12; rows.push([V(xg, y, z), V(xg, y, -z)]); }
      b.add('plaster', grid(rows, (_i, _j, p) => [p.z, p.y], sx > 0));
      const yb = H(Rg + 0.05, 0), apex = V(xg + sx * 0.06, top - 0.5, 0);
      for (const sz of [1, -1]) b.add('wood', box(0.2, 1, 0.2, 'y').applyMatrix4(M.span(V(xg + sx * 0.06, yb + 0.12, sz * zg * 0.86), apex, 1)));
      b.add('wood', box(0.22, top - 0.5 - yb, 0.22, 'y').translate(xg + sx * 0.06, (top - 0.5 + yb) / 2, 0));
      b.add('wood', box(0.22, 0.26, zg * 1.9, 'z').translate(xg + sx * 0.06, yb + 0.14, 0));
      // 悬鱼
      b.add('wood', prism([[0, 0], [0.22, -0.3], [0.1, -0.5], [0.16, -0.78], [0, -0.95], [-0.16, -0.78], [-0.1, -0.5], [-0.22, -0.3]], 0.05).rotateY(Math.PI / 2).translate(sx * (Rg + 0.07), top - 0.32, 0));
    }
  }
  if (sg <= 0 && !sp.bare) {
    // 悬山：两头的垂脊、博风板、悬鱼
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const pts: THREE.Vector3[] = [], bp: THREE.Vector3[] = [];
        for (let i = 0; i <= 10; i++) {
          const s = 1 - (i / 10) * 0.985, z = D * (1 - s), tip = 0.2 * rs * Math.pow(clamp(1 - s / 0.14), 2);
          pts.push(V(sx * (W - 0.2 * rs), H(0, z) - 0.02 + tip, sz * z));
          bp.push(V(sx * (W + 0.03), H(0, z) - 0.1, sz * z));
        }
        b.add('ridge', sweep(pts, scl(HIP, rs)));
        b.add('wood', sweep(bp, [[-0.035, -0.4], [0.035, -0.4], [0.035, 0], [-0.035, 0]]));
      }
      b.add('wood', prism([[0, 0], [0.2, -0.28], [0.09, -0.46], [0.14, -0.7], [0, -0.86], [-0.14, -0.7], [-0.09, -0.46], [-0.2, -0.28]], 0.05).rotateY(Math.PI / 2).translate(sx * (W + 0.07), top - 0.3, 0));
    }
  }

  // —— 檐口：瓦当、滴水、连檐 ——
  const wd = () => shade(cyl(0.3 * tw0 * 0.98, 0.3 * tw0 * 0.98, 0.035, 10).rotateX(Math.PI / 2), () => 1);
  const ds = () => prism([[-0.2 * tw0, 0.02], [0.2 * tw0, 0.02], [0.0, -0.3 * tw0]], 0.02);
  const eave = (count: number, tw: number, at: (t: number) => { p: THREE.Vector3; ry: number }) => {
    for (let c = 0; c < count; c++) {
      const e = at(-1 + ((c + 0.5) * tw) / (count * tw / 2));
      b.inst('wadang', 'ridge', wd, M.mul(M.t(e.p.x, e.p.y + tubeH * 0.5, e.p.z), M.ry(e.ry), M.t(0, 0, 0.012)));
      if (det > 0.5 && c > 0) {
        const d2 = at(-1 + (c * tw) / (count * tw / 2));
        b.inst('dishui', 'ridge', ds, M.mul(M.t(d2.p.x, d2.p.y - panDip, d2.p.z), M.ry(d2.ry), M.t(0, 0, 0.01)));
      }
    }
  };
  eave(nx, twx, (t) => ({ p: V(t * W, H(t * W, D), D), ry: 0 }));
  eave(nx, twx, (t) => ({ p: V(t * W, H(t * W, D), -D), ry: Math.PI }));
  if (sg > 0) {
    eave(nz, twz, (t) => ({ p: V(W, H(W, t * D), t * D), ry: Math.PI / 2 }));
    eave(nz, twz, (t) => ({ p: V(-W, H(-W, t * D), t * D), ry: -Math.PI / 2 }));
  }
  const fascia = (p0: (t: number) => THREE.Vector3, len: number) => {
    const n = Math.max(8, Math.round(len / 0.8)), pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) pts.push(p0(-1 + (2 * i) / n));
    b.add('wood', sweep(pts, [[-0.035, -0.13], [0.035, -0.13], [0.035, 0.0], [-0.035, 0.0]]));
  };
  if (!sp.bare) {
    fascia((t) => V(t * W, H(t * W, D) - panDip - 0.02, D - 0.05), 2 * W);
    fascia((t) => V(t * W, H(t * W, D) - panDip - 0.02, -D + 0.05), 2 * W);
  }
  if (sg > 0) {
    fascia((t) => V(W - 0.05, H(W, t * D) - panDip - 0.02, t * D), 2 * D);
    fascia((t) => V(-W + 0.05, H(-W, t * D) - panDip - 0.02, t * D), 2 * D);
  }

  // —— 望板（瓦下的底板，朝下） ——
  if (!sp.bare) {
    const step = 0.8, gx = Math.max(2, Math.round((2 * W) / step)), gz = Math.max(2, Math.round((2 * D) / step));
    const pts: THREE.Vector3[][] = [];
    for (let i = 0; i <= gx; i++) {
      const row: THREE.Vector3[] = [];
      for (let j = 0; j <= gz; j++) { const x = -W + (2 * W * i) / gx, z = -D + (2 * D * j) / gz; row.push(V(x * 0.998, H(x, z) - 0.15, z * 0.998)); }
      pts.push(row);
    }
    b.add('woodDark', tint(grid(pts, (_i, _j, p) => [p.x, p.z]), 0.6));
  }

  // —— 椽、角梁 ——
  if (!sp.noRafters) {
    const pd = sp.purlin, sp0 = 0.27, fly = sp.flying ? Math.min(0.9, pd * 0.36) : 0.05;
    const round = () => cyl(0.062, 0.062, 1, 7, false);
    const square = () => box(0.085, 1, 0.085, 'y');
    const under = (x: number, z: number, d: number) => V(x, H(x, z) - 0.15 - d, z);
    const edgeIn = (w: number) => w - fly, edgeOut = (w: number) => w - 0.045;
    const straight = (alongX: boolean, sgn: number) => {
      const half = alongX ? W : D, depth = alongX ? D : W;
      const lim = sg > 0 ? half - pd : half - 0.15;
      for (let t = -lim + sp0 / 2; t < lim; t += sp0) {
        const P = (d: number, off: number) => (alongX ? under(t, sgn * d, off) : under(sgn * d, t, off));
        b.inst('rafter', 'wood', round, M.span(P(depth - pd - 0.25, 0.07), P(edgeIn(depth), 0.07)));
        if (sp.flying) b.inst('flyrafter', 'wood', square, M.span(P(edgeIn(depth) - 0.32, 0.055), P(edgeOut(depth), 0.045)));
      }
    };
    straight(true, 1); straight(true, -1);
    if (sg > 0) {
      straight(false, 1); straight(false, -1);
      for (const sx of [1, -1]) for (const sz of [1, -1]) {
        const C = (d: number) => under(sx * (W - pd - 0.1), sz * (D - pd - 0.1), d);
        for (let t = sp0 * 0.6; t < pd; t += sp0 * 1.15) {
          b.inst('rafter', 'wood', round, M.span(C(0.07), under(sx * (W - pd + t), sz * edgeOut(D), 0.07)));
          b.inst('rafter', 'wood', round, M.span(C(0.07), under(sx * edgeOut(W), sz * (D - pd + t), 0.07)));
        }
        const out = under(sx * (W + 0.1), sz * (D + 0.1), 0.2);
        out.y = H(sx * W, sz * D) - 0.3;
        b.add('wood', box(0.24, 1, 0.24, 'y').applyMatrix4(M.span(C(0.22), out, 1)));
      }
    }
  }
  return { heightAt: H, top };
}
