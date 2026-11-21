// 注进页面的探针：这一帧小人的腿（袜筒、鞋）有没有穿过衣裳、手（手、袖子下半）有没有插进衣身（motion.mjs 第二节之后用）。
// 衣身 = patch 0 的第 2 圈（摆脚）到领口那一圈（不算里子与领口折边）。
// 腿：袜筒顺着长的每一条棱、鞋心到鞋上各点的线段，和衣身的三角形有交点 → 穿过布了（从摆脚底下伸出来不会和布相交）。
// 手：顶点在衣身里头 → 插进去了。里外用水平射线数穿过衣身几次（奇数在里）。
window.__clipProbe = () => {
  const av = window.__ks.player.av, L = av.loft, P = L.pos, S = av.segs;
  const body = L.patches[0], w = S + 1;
  const r0 = 2, r1 = body.rings - 2;
  const tris = [];
  for (let j = r0; j < r1; j++) for (let i = 0; i < S; i++) {
    const a = body.off + j * w + i, b = a + 1, c = a + w + 1, d = a + w;
    tris.push(a, b, c, a, c, d);
  }
  // 射线 o + t·d 与衣身各三角形的交点（t > 0；tmax 给了就只要 t < tmax）
  const hits = (ox, oy, oz, dx, dy, dz, tmax = Infinity) => {
    const out = [];
    for (let k = 0; k < tris.length; k += 3) {
      const ia = tris[k] * 3, ib = tris[k + 1] * 3, ic = tris[k + 2] * 3;
      const ax = P[ia], ay = P[ia + 1], az = P[ia + 2];
      const e1x = P[ib] - ax, e1y = P[ib + 1] - ay, e1z = P[ib + 2] - az;
      const e2x = P[ic] - ax, e2y = P[ic + 1] - ay, e2z = P[ic + 2] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-14) continue;
      const inv = 1 / det, tx = ox - ax, ty = oy - ay, tz = oz - az;
      const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-6 && t < tmax) out.push(t);
    }
    return out;
  };
  const cross = (a, b) => { const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2]; return hits(P[a], P[a + 1], P[a + 2], dx, dy, dz, 1).length > 0; };
  const hp = av.joints.hips.position, C = av.stC;
  const axis = (y) => { let bx = hp.x, bz = hp.z; if (y > C[1]) { let k = 0; while (k < C.length / 3 - 1 && C[(k + 1) * 3 + 1] < y) k++; bx = C[k * 3]; bz = C[k * 3 + 2]; } return [bx, bz]; };
  const inside = (o) => {
    const x = P[o], y = P[o + 1], z = P[o + 2], [ax, az] = axis(y); let dx = x - ax, dz = z - az; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const hs = hits(x, y, z, dx, 0, dz);
    return hs.length % 2 === 1 ? Math.min(...hs) : 0;
  };
  const leg = { n: 0, L: 0, R: 0, ys: [] }, hand = { L: 0, R: 0, max: 0, ys: [] }, sleeve = { L: 0, R: 0, max: 0 };
  // 袜筒：每一列自鞋口到上沿的三段
  for (const [pi, side] of [[3, 'L'], [4, 'R']]) {
    const p = L.patches[pi], sw = p.segs + 1;
    for (let i = 0; i < p.segs; i++) for (let j = 0; j < p.rings - 1; j++) {
      const a = (p.off + j * sw + i) * 3, b = (p.off + (j + 1) * sw + i) * 3;
      if (cross(a, b)) { leg.n++; leg[side]++; if (leg.ys.length < 4) leg.ys.push(`${side}袜${j}@${P[b + 1].toFixed(2)}`); }
    }
  }
  // 鞋：鞋上各点的中心到各点
  for (const [ci, side] of [[3, 'L'], [4, 'R']]) {
    const c = L.chunks[ci]; let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < c.n; i++) { const o = (c.off + i) * 3; mx += P[o]; my += P[o + 1]; mz += P[o + 2]; }
    mx /= c.n; my /= c.n; mz /= c.n;
    for (let i = 0; i < c.n; i += 4) {
      const o = (c.off + i) * 3;
      if (hits(mx, my, mz, P[o] - mx, P[o + 1] - my, P[o + 2] - mz, 1).length) { leg.n++; leg[side]++; if (leg.ys.length < 4) leg.ys.push(`${side}鞋@${my.toFixed(2)}`); }
    }
  }
  for (const [ci, side] of [[1, 'L'], [2, 'R']]) {
    const c = L.chunks[ci];
    for (let i = 0; i < c.n; i += 2) { const o = (c.off + i) * 3, d = inside(o); if (d > 0.005) { hand[side]++; if (d > hand.max) hand.max = d; if (hand.ys.length < 3) hand.ys.push(`${side}手@${P[o + 1].toFixed(2)}`); } }
  }
  for (const [pi, side] of [[1, 'L'], [2, 'R']]) {
    const p = L.patches[pi], half = Math.floor(p.rings / 2);
    for (let j = half; j < p.rings; j++) for (let i = 0; i < p.segs; i += 2) { const o = (p.off + j * (p.segs + 1) + i) * 3, d = inside(o); if (d > 0.008) { sleeve[side]++; if (d > sleeve.max) sleeve.max = d; } }
  }
  const a = av;
  return { leg, hand, sleeve, speed: window.__ks.player.speed, hl: [a.arms.L.P.x, a.arms.L.P.y, a.arms.L.P.z], hr: [a.arms.R.P.x, a.arms.R.P.y, a.arms.R.P.z] };
};
