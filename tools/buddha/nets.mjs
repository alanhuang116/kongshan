// 距离场 → 网格（surface nets）。
//   1. 先在粗格（B 倍）上算一遍，只在离表面近的粗格里细算；
//   2. 每个被表面穿过的细格放一个点（各条被穿过的棱的交点取平均）；
//   3. 把点沿梯度推到表面上；法线取「细节场」的梯度（细节可以只进法线、不进几何）；
//   4. 可选：丢掉切口上的封盖面（三个点都在实体内部的三角形）。

const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

export function surfaceNets(f, min, max, h, B = 4) {
  const cells = (a, b) => Math.ceil((b - a) / h / B) * B;
  const cx = cells(min[0], max[0]), cy = cells(min[1], max[1]), cz = cells(min[2], max[2]);
  const nx = cx + 1, ny = cy + 1, nz = cz + 1;
  const val = new Float32Array(nx * ny * nz).fill(NaN);
  const at = (i, j, k) => {
    const n = i + nx * (j + ny * k);
    let v = val[n];
    if (v !== v) { v = f(min[0] + i * h, min[1] + j * h, min[2] + k * h); val[n] = v; }
    return v;
  };
  const bx = cx / B, by = cy / B, bz = cz / B;
  const thr = B * h * Math.sqrt(3) * 0.5 * 1.5;
  const marked = [];
  for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
    let neg = false, pos = false, near = false;
    for (let c = 0; c < 8; c++) {
      const v = at((I + (c & 1)) * B, (J + ((c >> 1) & 1)) * B, (K + ((c >> 2) & 1)) * B);
      if (v < 0) neg = true; else pos = true;
      if (Math.abs(v) < thr) near = true;
    }
    if (near || (neg && pos)) marked.push(I, J, K);
  }
  const cellVert = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [], vcell = [];
  const corner = new Float64Array(8);
  for (let m = 0; m < marked.length; m += 3) {
    const I = marked[m], J = marked[m + 1], K = marked[m + 2];
    for (let k = K * B; k < K * B + B; k++) for (let j = J * B; j < J * B + B; j++) for (let i = I * B; i < I * B + B; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const v = at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1));
        corner[c] = v;
        if (v < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of EDGES) {
        const va = corner[a], vb = corner[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += (a & 1) + ((b & 1) - (a & 1)) * t;
        sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
        sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
        n++;
      }
      cellVert[i + cx * (j + cy * k)] = pos.length / 3;
      pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
      vcell.push(i, j, k);
    }
  }
  const idx = [];
  const cv = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= cx || j >= cy || k >= cz ? -1 : cellVert[i + cx * (j + cy * k)]);
  const d2 = (a, b) => { const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2]; return dx * dx + dy * dy + dz * dz; };
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    if (d2(a, c) <= d2(b, d)) idx.push(a, b, c, a, c, d); else idx.push(a, b, d, b, c, d);
  };
  for (let v = 0; v < vcell.length / 3; v++) {
    const i = vcell[v * 3], j = vcell[v * 3 + 1], k = vcell[v * 3 + 2];
    const inside = at(i, j, k) < 0;
    if ((at(i + 1, j, k) < 0) !== inside) quad(cv(i, j, k), cv(i, j - 1, k), cv(i, j - 1, k - 1), cv(i, j, k - 1), !inside);
    if ((at(i, j + 1, k) < 0) !== inside) quad(cv(i, j, k), cv(i, j, k - 1), cv(i - 1, j, k - 1), cv(i - 1, j, k), !inside);
    if ((at(i, j, k + 1) < 0) !== inside) quad(cv(i, j, k), cv(i - 1, j, k), cv(i - 1, j - 1, k), cv(i, j - 1, k), !inside);
  }
  return { pos, idx };
}

/**
 * 收尾：推到表面、求法线、去封盖、压实。
 *   f      —— 出网格用的场（可以是被切过的）
 *   g      —— 求法线用的场（没切过、带全部细节的）
 *   solid  —— 判断「在实体里」用的场（没切过的）；给了就丢掉三个点都在里面的三角形
 */
export function finish(raw, f, g, h, o = {}) {
  const nv = raw.pos.length / 3;
  const P = new Float32Array(raw.pos), N = new Float32Array(nv * 3);
  const e = o.eps ?? h * 0.3;
  for (let v = 0; v < nv; v++) {
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    for (let it = 0; it < 3; it++) {
      const d = f(x, y, z);
      const gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e), gy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e), gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-8) break;
      let s = d / g2;
      const step = Math.abs(s) * Math.sqrt(g2);
      if (step > h * 0.75) s *= (h * 0.75) / step;
      x -= gx * s; y -= gy * s; z -= gz * s;
    }
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    const en = o.neps ?? e;
    let nx = g(x + en, y, z) - g(x - en, y, z), ny = g(x, y + en, z) - g(x, y - en, z), nz = g(x, y, z + en) - g(x, y, z - en);
    const l = Math.hypot(nx, ny, nz) || 1;
    N[v * 3] = nx / l; N[v * 3 + 1] = ny / l; N[v * 3 + 2] = nz / l;
  }
  // 去封盖
  let idx = raw.idx;
  if (o.solid) {
    const s = new Float32Array(nv);
    for (let v = 0; v < nv; v++) s[v] = o.solid(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
    const thr = -(o.capThr ?? h * 0.45), keep = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (s[a] < thr && s[b] < thr && s[c] < thr) continue;
      keep.push(a, b, c);
    }
    idx = keep;
  }
  // 朝向：与法线一致
  let agree = 0;
  for (let t = 0; t < idx.length; t += 3 * 17) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    agree += Math.sign(fx * N[a] + fy * N[a + 1] + fz * N[a + 2]);
  }
  if (agree < 0) for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
  // 压实：去掉没用到的点
  const map = new Int32Array(nv).fill(-1);
  let n = 0;
  for (const i of idx) if (map[i] < 0) map[i] = n++;
  const P2 = new Float32Array(n * 3), N2 = new Float32Array(n * 3);
  for (let v = 0; v < nv; v++) {
    const m = map[v];
    if (m < 0) continue;
    P2[m * 3] = P[v * 3]; P2[m * 3 + 1] = P[v * 3 + 1]; P2[m * 3 + 2] = P[v * 3 + 2];
    N2[m * 3] = N[v * 3]; N2[m * 3 + 1] = N[v * 3 + 1]; N2[m * 3 + 2] = N[v * 3 + 2];
  }
  const I2 = new Uint32Array(idx.length);
  for (let t = 0; t < idx.length; t++) I2[t] = map[idx[t]];
  return { positions: P2, normals: N2, indices: I2 };
}
