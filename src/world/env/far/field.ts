/**
 * 山形：远山怎么起伏、怎么铺成网、墨怎么上。
 *
 *   峰 —— 一片山由若干座峰合成（峰与峰之间连成鞍）；每座峰往四下放出几条支脉，脊与脊之间是沟
 *         （山的「脉络」：远看是一道道顺坡而下的褶，披麻皴就皴在这些褶上）。
 *   网 —— 远山只会从安乐窝这一小块地方望过去，所以网是朝着看画人铺的「扇面」：方位上匀而细
 *         （轮廓线就不会一格一格的），由近及远在山坡陡处加密。起伏的细节不比网格更细（细了只会变成锯齿）。
 *   墨 —— 积墨事先算好记在顶点上（aInk）：每一点沿着视线往上找到自己这一重山的山脊，离山脊越近墨越重
 *         （层峦叠嶂靠它；材质在 stone.ts，罩过雾之后才压上去）。沟里的墨、缓坡上林木的一点绿意写在顶点色里。
 *         不用满屏的那一遍去找山脊——那一遍在前后两重山挨得近处、山前有细东西（松、竹叶、塔尖）处会留下一格一格的印子。
 */
import * as THREE from 'three';
import { PIG, type RGB } from '../../ink/ink';
import { fbm, ridged, smooth } from '../../core/rng';

export type Field = (x: number, z: number) => number;

/** 方位角（度）与远近 → 平面上的点。0 正南（+z），90 正东（+x），180 正北，270 正西 */
export const polar = (azDeg: number, d: number): [number, number] => { const a = (azDeg * Math.PI) / 180; return [Math.sin(a) * d, Math.cos(a) * d]; };
/** 平面上的点 → 方位角（度，0…360） */
export const azOf = (x: number, z: number) => ((Math.atan2(x, z) * 180) / Math.PI + 360) % 360;
const pw = (p: RGB, d: number): RGB => [Math.pow(p[0], d), Math.pow(p[1], d), Math.pow(p[2], d)];
const h1 = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

export interface Peak {
  x: number; z: number; h: number; r: number;
  /** 山形：大于 1 是尖峰（山腰内收），小于 1 是浑圆的 */ p?: number;
  /** 顶上平的一块占半径的几成 */ flat?: number;
  /** 壁立的程度：1 是寻常的山，2 以上是顶圆壁陡的峰 */ sq?: number;
  /** 这座峰放出几条支脉（不给用整片山的；0 不要） */ spurs?: number;
}
export interface ReliefOpts {
  peaks: Peak[]; seed: number;
  /** 山形被扭动多少（米） */ warp?: number;
  /** 脊与沟的起伏占几成、脊的间距（米）、叠几层（一层比一层细一半；最细的一层别比网格细） */ detail?: number; lam?: number; oct?: number;
  /** 层层叠叠的断崖：分几层（0 没有） */ terrace?: number;
  /** 支脉：[每座峰几条, 沟切进去几成] */ spur?: [number, number];
}

/** 一片山的高度 */
export function relief(o: ReliefOpts): Field {
  const lam = o.lam ?? 600, warp = o.warp ?? 200, det = o.detail ?? 0.5, oct = o.oct ?? 3;
  const top = Math.max(...o.peaks.map((p) => p.h));
  const sp = o.spur, n = o.peaks.length;
  // 各峰的支脉：条数、起头的角度、弯多少，各不相同
  const sN = new Float32Array(n), sA = new Float32Array(n), sB = new Float32Array(n);
  for (let i = 0; i < n; i++) { sN[i] = o.peaks[i].spurs ?? (sp ? Math.max(3, Math.round(sp[0] * (0.75 + 0.5 * h1(i + o.seed)))) : 0); sA[i] = h1(i * 3.1 + o.seed * 1.7); sB[i] = 6.28 * h1(i * 5.3 + o.seed); }
  return (x, z) => {
    const wx = x + warp * (fbm(x / (lam * 1.7) + o.seed, z / (lam * 1.7), 3, o.seed) - 0.5) * 2;
    const wz = z + warp * (fbm(x / (lam * 1.7) + 31, z / (lam * 1.7) + o.seed, 3, o.seed + 7) - 0.5) * 2;
    let m = 0, s = 0;
    for (let i = 0; i < n; i++) {
      const pk = o.peaks[i], dx = wx - pk.x, dz = wz - pk.z;
      let t = Math.hypot(dx, dz) / pk.r;
      if (t >= 1) continue;
      let cut = 1;
      if (sp && sN[i] > 0) {
        // 绕峰一周 N 道脊；脊线自己带点弯，越往山脚沟越深，半山以下每道脊再分一道小的
        const u = (Math.atan2(dz, dx) / 6.2832) * sN[i] + sA[i] + 0.3 * Math.sin(t * 5.5 + sB[i]);
        const tri = Math.abs(2 * (u - Math.floor(u)) - 1), tri2 = Math.abs(2 * (2 * u + 0.37 - Math.floor(2 * u + 0.37)) - 1);
        cut = 1 - sp[1] * ((1 - Math.pow(tri, 1.25)) * smooth(0.05, 0.5, t) + 0.35 * (1 - tri2) * smooth(0.35, 0.8, t));
      }
      if (pk.flat) t = Math.max(0, (t - pk.flat) / (1 - pk.flat));
      if (pk.sq) t = Math.pow(t, pk.sq);
      const v = pk.h * Math.pow(1 - t, pk.p ?? 1.8) * (1 + 0.5 * t) * cut;
      if (v > m) m = v;
      s += v * v;
    }
    if (m <= 0) return 0;
    // 几座峰之间连成鞍，不是硬生生地取大
    const base = 0.62 * m + 0.38 * Math.sqrt(s);
    let y = base * (1 - det * 0.55 + det * ridged(wx / lam + o.seed * 0.37, wz / lam, oct, o.seed));
    if (o.terrace) { const k = o.terrace; y += ((top / k) * Math.sin((y / top) * k * Math.PI * 2) * 0.5) / (Math.PI * 2); }
    return y;
  };
}

/** 沿一条山脊线撒一串小峰（「三十六峰」：天际线参差）。line 是脊线上的几个点 [x, z, 高] */
export function crestPeaks(seed: number, line: Array<[number, number, number]>, count: number, o: { h: [number, number]; r: [number, number]; off?: number; p?: number; sq?: number }): Peak[] {
  const out: Peak[] = [];
  for (let k = 0; k < count; k++) {
    const f = ((k + 0.2 + 0.6 * h1(k * 7.7 + seed)) / count) * (line.length - 1), i = Math.min(line.length - 2, Math.floor(f)), t = f - i;
    const a = line[i], b = line[i + 1], off = (o.off ?? 120) * (h1(k * 3.3 + seed * 2) - 0.5) * 2;
    const nx = -(b[1] - a[1]), nz = b[0] - a[0], l = Math.hypot(nx, nz) || 1;
    const hh = a[2] + (b[2] - a[2]) * t;
    out.push({ x: a[0] + (b[0] - a[0]) * t + (nx / l) * off, z: a[1] + (b[1] - a[1]) * t + (nz / l) * off, h: hh * (o.h[0] + (o.h[1] - o.h[0]) * h1(k * 1.9 + seed)), r: o.r[0] + (o.r[1] - o.r[0]) * h1(k * 9.1 + seed), p: o.p ?? 1.0, sq: o.sq ?? 2.0, spurs: 0 });
  }
  return out;
}

export interface InkOpts {
  /** 配这张网的材质的浓度（顶点色按它折算成「几层墨」） */ dens: number;
  /** 通体的墨色再加几层（可负：更淡） */ base?: number;
  /** 积墨：从山脊往下多少度淡到没有。记在顶点的 aInk 上（山脊处 1），几层墨由材质定（stone.ts） */ crest?: number;
  /** 沟里墨重、脊上留白的多少 */ gully?: number;
  /** 缓坡上林木的墨色与绿意 */ veg?: number;
  /** 墨色随高度的变化：[山脚淡去几层（没在雾里）, 到多高为止] */ foot?: [number, number];
  /** 另外再加的墨（几层；按位置给） */ extra?: (x: number, y: number, z: number, i: number, j: number) => number;
  /** 另外乘上去的颜色（按位置给） */ tint?: (x: number, y: number, z: number, slope: number, out: RGB) => void;
}
export interface SheetOpts {
  nu: number; nv: number;
  /** 第 i 列第 j 排在平面上哪里。j 越大离看画的人越远（积墨沿着 j 往上找山脊） */
  at: (i: number, j: number) => [number, number];
  H: Field;
  /** 整片往下沉多少（山脚埋到平畴底下） */ sink?: number;
  /** 看画的人离这一点多远（水平距离）；不给就是到原点的距离 */ dist?: (x: number, z: number) => number;
  /** 看画的人眼睛多高 */ eyeY?: number;
  ink: InkOpts;
  /** 只留看得见的面（背着人、被前面的山挡死的不要）。给的是留多宽的余地（度） */ cull?: number;
}
export interface Sheet { geo: THREE.BufferGeometry; H: Field; sink: number; tris: number }

/**
 * 把一片山铺成网，墨色算好写进顶点色。
 * 网格带索引（顶点少得多）；属性是 position / normal / uv / color，外加 aInk（积墨）。
 */
export function sheet(o: SheetOpts): Sheet {
  const nu = o.nu, nv = o.nv, n = (nu + 1) * (nv + 1), sink = o.sink ?? 0, eyeY = o.eyeY ?? 10;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const D = new Float32Array(n), E = new Float32Array(n);
  const dist = o.dist ?? ((x: number, z: number) => Math.hypot(x, z));
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const k = i * (nv + 1) + j, [x, z] = o.at(i, j), y = o.H(x, z) - sink;
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    uv[k * 2] = x * 0.01; uv[k * 2 + 1] = z * 0.01;
    D[k] = Math.max(1, dist(x, z)); E[k] = (y - eyeY) / D[k];
  }
  const K = (i: number, j: number) => Math.max(0, Math.min(nu, i)) * (nv + 1) + Math.max(0, Math.min(nv, j));
  // 朝向：由相邻格点的差
  const slope = new Float32Array(n), curv = new Float32Array(n);
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const k = K(i, j), a = K(i - 1, j), b = K(i + 1, j), c = K(i, j - 1), d = K(i, j + 1);
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const vx = pos[d * 3] - pos[c * 3], vy = pos[d * 3 + 1] - pos[c * 3 + 1], vz = pos[d * 3 + 2] - pos[c * 3 + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    slope[k] = Math.hypot(nx, nz) / Math.max(1e-4, ny);
    // 凹凸：坡度沿两个方向各变了多少（沟为正、脊为负）
    const lu = Math.hypot(ux, uz) * 0.5 || 1, lv = Math.hypot(vx, vz) * 0.5 || 1, y = pos[k * 3 + 1];
    curv[k] = 0.5 * ((pos[a * 3 + 1] + pos[b * 3 + 1] - 2 * y) / lu + (pos[c * 3 + 1] + pos[d * 3 + 1] - 2 * y) / lv);
  }
  // 积墨：每一列（一条视线）由下往上找山脊
  const crest = new Float32Array(n), ink = o.ink;
  if (ink.crest) {
    const reach0 = ink.crest * (Math.PI / 180);
    for (let i = 0; i <= nu; i++) {
      const b = i * (nv + 1);
      for (let j = 0; j <= nv; j++) {
        // 往上（往远）走到一处「再往上反而低下去」的地方：那是一道脊；要是脊后头紧跟着又升起来（只隔一点点远），不算，接着找
        let c = j;
        for (let k = j; k < nv; k++) {
          if (E[b + k + 1] > E[b + k]) { c = k + 1; continue; }
          c = k;
          let q = k + 1;
          while (q <= nv && E[b + q] <= E[b + k]) q++;
          if (q > nv || D[b + q] > D[b + k] * 1.035) break;
          k = q - 1; c = q;
        }
        const k = b + j, x = pos[k * 3], z = pos[k * 3 + 2];
        const reach = reach0 * (0.7 + 0.6 * fbm(x * 0.0011 + 3, z * 0.0011, 2, 5));
        const dA = Math.atan(E[b + c]) - Math.atan(E[k]);
        crest[k] = Math.pow(Math.max(0, 1 - dA / reach), 1.6);
      }
    }
    // 相邻几列之间抹一抹（脊线在列与列之间跳的地方不要一刀切）
    const tmp = crest.slice();
    for (let i = 1; i < nu; i++) for (let j = 0; j <= nv; j++) { const k = K(i, j); crest[k] = 0.25 * tmp[K(i - 1, j)] + 0.5 * tmp[k] + 0.25 * tmp[K(i + 1, j)]; }
  }
  const tint: RGB = [1, 1, 1];
  for (let k = 0; k < n; k++) {
    const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
    let L = ink.base ?? 0;
    if (ink.gully) L += ink.gully * Math.max(-0.22, Math.min(1.3, curv[k] * 1.6)) * (0.6 + 0.8 * fbm(x * 0.003, z * 0.003, 2, 11));
    if (ink.foot) L -= ink.foot[0] * smooth(ink.foot[1], 0, y);
    if (ink.extra) L += ink.extra(x, y, z, Math.floor(k / (nv + 1)), k % (nv + 1));
    // 几层墨 → 乘在颜料上的顶点色（不淡过纸）
    const e = Math.max(-0.75, L / ink.dens), a = pw(PIG.mo, e);
    let r = a[0], g = a[1], b = a[2];
    if (ink.veg) {
      const v = ink.veg * smooth(1.3, 0.4, slope[k]) * (0.35 + 0.9 * fbm(x * 0.006 + 9, z * 0.006, 2, 17));
      r *= Math.pow(0.74, v); g *= Math.pow(0.9, v); b *= Math.pow(0.72, v);
    }
    if (ink.tint) { tint[0] = tint[1] = tint[2] = 1; ink.tint(x, y, z, slope[k], tint); r *= tint[0]; g *= tint[1]; b *= tint[2]; }
    col[k * 3] = r; col[k * 3 + 1] = g; col[k * 3 + 2] = b;
  }
  // 面：背着人、又被前面的山挡死的不要（看画的人只在安乐窝那一小块地方）
  let keep: Uint8Array | null = null;
  if (o.cull !== undefined) {
    keep = new Uint8Array(n);
    const pad = o.cull * (Math.PI / 180);
    for (let i = 0; i <= nu; i++) {
      const b = i * (nv + 1);
      // 平视与登高（高出七十米）两样都算：有一样看得见就留
      let lo = -1e9, hi = -1e9;
      for (let j = 0; j <= nv; j++) {
        const e0 = Math.atan(E[b + j]), e1 = Math.atan((pos[(b + j) * 3 + 1] - eyeY - 70) / D[b + j]);
        if (e0 > lo - pad || e1 > hi - pad) keep[b + j] = 1;
        lo = Math.max(lo, e0); hi = Math.max(hi, e1);
      }
    }
    // 左右各放宽几列（人往两边走，山后面会露出来一点）
    const k2 = keep.slice(), w = Math.max(1, Math.round(nu * 0.012));
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) if (!k2[K(i, j)]) { for (let a = -w; a <= w; a++) if (k2[K(i + a, j)]) { keep[K(i, j)] = 1; break; } }
  }
  const idx: number[] = [];
  // 三角形的绕向：看 at() 给的 i、j 是左手还是右手
  const p00 = o.at(0, 0), p10 = o.at(1, 0), p01 = o.at(0, 1);
  const flip = (p10[0] - p00[0]) * (p01[1] - p00[1]) - (p10[1] - p00[1]) * (p01[0] - p00[0]) > 0;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = K(i, j), b = K(i + 1, j), c = K(i + 1, j + 1), d = K(i, j + 1);
    if (keep && !(keep[a] || keep[b] || keep[c] || keep[d])) continue;
    if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aInk', new THREE.BufferAttribute(crest, 1));
  geo.setIndex(n > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  return { geo, H: o.H, sink, tris: idx.length / 3 };
}

export interface FanOpts {
  /** 方位从几度到几度、由近及远从多远到多远（都从原点算） */ az: [number, number]; d: [number, number];
  /** 方位上分几格、远近上分几排 */ nAz: number; nD: number;
  H: Field; sink?: number; ink: InkOpts; cull?: number;
  /** 远近上按坡的陡缓加密的程度（0 匀排） */ adapt?: number;
}
/** 朝着安乐窝铺开的扇面网：方位上匀，远近上在山坡陡处加密 */
export function fan(o: FanOpts): Sheet {
  const [a0, a1] = o.az, [d0, d1] = o.d, nAz = Math.max(8, Math.round(o.nAz)), nD = Math.max(6, Math.round(o.nD));
  // 先粗看一遍：哪一段远近上山坡陡（那里多排几排）
  const M = nD * 4, w = new Float32Array(M), probes = 24, ad = o.adapt ?? 2.5;
  let prev = new Float32Array(probes);
  for (let m = 0; m <= M; m++) {
    const d = d0 + ((d1 - d0) * m) / M, cur = new Float32Array(probes);
    let s = 0;
    for (let p = 0; p < probes; p++) { const [x, z] = polar(a0 + ((a1 - a0) * (p + 0.5)) / probes, d); cur[p] = o.H(x, z); if (m > 0) s += Math.abs(cur[p] - prev[p]); }
    if (m > 0) w[m - 1] = 1 + ad * Math.min(3, s / probes / ((d1 - d0) / M));
    prev = cur;
  }
  const cum = new Float32Array(M + 1);
  for (let m = 0; m < M; m++) cum[m + 1] = cum[m] + w[m];
  const rows = new Float32Array(nD + 1);
  for (let j = 0, m = 0; j <= nD; j++) {
    const target = (cum[M] * j) / nD;
    while (m < M - 1 && cum[m + 1] < target) m++;
    rows[j] = d0 + ((d1 - d0) * (m + (target - cum[m]) / (cum[m + 1] - cum[m] || 1))) / M;
  }
  return sheet({ nu: nAz, nv: nD, at: (i, j) => polar(a0 + ((a1 - a0) * i) / nAz, rows[j]), H: o.H, sink: o.sink, ink: o.ink, cull: o.cull });
}

/** 一块方的网（近处的冈峦）：x 从 x0 到 x1，z 从 zNear 往 zFar 排（离看画的人越来越远） */
export function quilt(o: { x: [number, number]; z: [number, number]; cell: number; H: Field; sink?: number; ink: InkOpts; eye?: [number, number]; eyeY?: number }): Sheet {
  const nu = Math.max(2, Math.round(Math.abs(o.x[1] - o.x[0]) / o.cell)), nv = Math.max(2, Math.round(Math.abs(o.z[1] - o.z[0]) / o.cell));
  const eye = o.eye ?? [0, 0];
  return sheet({ nu, nv, at: (i, j) => [o.x[0] + ((o.x[1] - o.x[0]) * i) / nu, o.z[0] + ((o.z[1] - o.z[0]) * j) / nv], H: o.H, sink: o.sink, ink: o.ink, eyeY: o.eyeY, dist: (x, z) => Math.hypot(x - eye[0], z - eye[1]) });
}
