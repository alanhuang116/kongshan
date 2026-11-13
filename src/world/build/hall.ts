/**
 * 草堂：三间，坐北朝南。土墙不粉（版筑的层痕露着），木柱木枋露明，板门两扇敞着，直棂窗后面糊纸，矮矮一圈土台，
 * 上面一个又厚又软的茅草顶，檐口压得低。门上无匾。
 *
 * 屋顶（roof）与南墙连门窗（front）各自一组：人进了屋，这两组隐去，从南边俯看屋里。其余（三面墙、台基、屋里的陈设）留着。
 * 这里的坐标都是相对草堂正中、院子地面（y=0）说的；屋里地面在 y=fl。
 */
import * as THREE from 'three';
import { M, box, boxUp, cyl, cylUp, grid, shade, tint, type Geo } from '../core/geo';
import { fbm, smooth } from '../core/rng';
import { SITE, YARD_Y } from '../site';
import { flatRock, pole, renormal, rnd, sbox, tube, v3, wobble, type Ctx } from './kit';
import { thatchRoof } from './thatch';
import { furnish } from './inside';

/**
 * 一段版筑的土墙：略有不齐，一块深一块浅；檐下的一截暗一些（sky：从多高起算在檐下），墙脚受潮也深一点（foot：墙脚的高度）。
 * 版筑的横纹是材质自己按高度画的。
 */
export function earthWall(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, seed: number, sky = y1 - 0.8, foot = y0, tone = 1): Geo {
  const g = sbox(x1 - x0, y1 - y0, z1 - z0, 0.36).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  wobble(g, 0.016, 0.8, seed, 40, 0.5);
  return shade(g, (x, y, z) => tone * (1 - 0.22 * smooth(sky, sky + 0.8, y) - 0.1 * smooth(foot + 0.6, foot, y) - 0.09 * (fbm((x + z) * 0.7 + seed, y * 0.7, 2, seed) - 0.5) * 2));
}
/** 一根立柱：圆料，上头略细，带一点歪 */
export function post(x: number, z: number, y0: number, y1: number, r: number, seed: number, sides = 8): Geo {
  const R = rnd(seed), lean = 0.014;
  return pole(v3(x, y0, z), v3(x + R.pm(lean), y1, z + R.pm(lean)), r, r * 0.88, sides, 3);
}
/** three 自带的几何补齐四个属性（顶点色全 1） */
export function raw(g: THREE.BufferGeometry): Geo {
  const o = g.index ? g.toNonIndexed() : g, n = o.attributes.position.count;
  if (!o.attributes.uv) o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  o.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) o.deleteAttribute(k);
  o.clearGroups();
  return o;
}

/**
 * 一樘直棂窗（朝 +z，中心在原点）：木框、窗台板、破子棂、当中一道横串，棂后糊纸。
 * 返回 [木, 纸]。w × h 是窗洞；depth 是墙厚。
 */
export function lattice(w: number, h: number, depth: number, seed: number, bars = Math.round(w / 0.135)): [Geo[], Geo[]] {
  const wood: Geo[] = [], paper: Geo[] = [], zf = depth / 2 - 0.08;
  wood.push(wobble(box(w + 0.2, 0.07, depth + 0.1, 'x').translate(0, -h / 2 - 0.035, 0.04), 0.004, 3, seed));
  wood.push(wobble(box(w + 0.16, 0.09, 0.2, 'x').translate(0, h / 2 + 0.045, zf - 0.02), 0.004, 3, seed + 1));
  for (const e of [-1, 1]) wood.push(box(0.07, h, 0.16, 'y').translate(e * (w / 2 - 0.035), 0, zf - 0.02));
  for (let i = 0; i < bars; i++) wood.push(cyl(0.026, 0.026, h, 4).translate(-w / 2 + 0.07 + ((w - 0.14) * (i + 0.5)) / bars, 0, zf));
  wood.push(box(w - 0.14, 0.04, 0.03, 'x').translate(0, h * 0.04, zf - 0.03));
  const pp = new THREE.PlaneGeometry(w - 0.14, h, 6, 4);
  // 纸：旧了，深浅不匀，有一两处补过
  paper.push(shade(raw(pp.clone()), (x, y) => 0.99 - 0.035 * smooth(0.25, 0.6, fbm(x * 2.1 + seed, y * 2.1, 2, seed))).translate(0, 0, zf - 0.07));
  paper.push(tint(raw(pp.rotateY(Math.PI)), 0.9).translate(0, 0, zf - 0.08));
  return [wood, paper];
}

/**
 * 一扇板门（原点在门轴脚下；s = -1 门轴在西、门板朝 +x 伸出去，s = 1 反之；朝 +z 的一面是外面）：
 * 几块竖板拼的，背后三道穿带，一只铁环。
 */
export function doorLeaf(w: number, h: number, s: number, seed: number): Geo[] {
  const gs: Geo[] = [], R = rnd(seed), n = Math.max(3, Math.round(w / 0.21));
  let x = 0;
  for (let i = 0; i < n; i++) {
    const pw = i === n - 1 ? w - x : (w / n) * R.r(0.88, 1.12), k = R.r(0.84, 1.05), short = R.r(0, i === n - 1 ? 0.035 : 0.014);
    gs.push(tint(wobble(box(pw - 0.006, h - short, 0.036, 'y').translate(-s * (x + pw / 2), short + (h - short) / 2, R.pm(0.003)), 0.003, 2, seed + i), k, k * 0.99, k * 0.97));
    x += pw;
  }
  for (const y of [0.16, 0.5, 0.85]) gs.push(tint(box(w - 0.08, 0.07, 0.03, 'x').translate(-s * (w / 2 + 0.01), y * h, -0.032), 0.82));
  gs.push(cylUp(0.028, 0.028, h + 0.08, 6).translate(-s * 0.012, -0.03, -0.01));
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) ring.push(v3(Math.cos((i / 8) * 6.283) * 0.045, Math.sin((i / 8) * 6.283) * 0.045, 0));
  gs.push(tint(tube(ring, 0.006, 5).translate(-s * (w - 0.11), h * 0.53, 0.03), 0.3));
  return gs;
}

export interface HallDims { W: number; D: number; wt: number; fl: number; top: number; door: number; doorH: number; winW: number; winX: number; sill: number; head: number; eave: number }
export function hallDims(): HallDims {
  const H = SITE.hall;
  // 窗开在两次间的正中；门头、窗头一样高，正好藏在檐口底下
  return { W: H.w, D: H.d, wt: 0.4, fl: H.floor, top: H.floor + H.wall, door: H.door, doorH: 1.92, winW: 1.5, winX: 3.15, sill: 0.95, head: 1.92, eave: H.floor + 2.02 };
}

export function buildHall(c: Ctx): void {
  const H = SITE.hall, dm = hallDims(), { W, D, wt, fl, top } = dm;
  const x0 = W / 2, z0 = D / 2, xi = x0 - wt, zi = z0 - wt, ox = H.x, oy = YARD_Y, oz = H.z;
  const b = c.home, bf = c.front, br = c.roof, T = M.t(ox, oy, oz);
  for (const k of [b, bf, br]) k.push(T);
  const R = rnd(4101), sky = top - 0.85, base = fl - 0.06;

  // —— 台基：一圈矮土台（边沿塌着、不直），零星几块毛石；门前一块踏步石 ——
  {
    const pw = W + 1.2, pd = D + 1.2, ph = fl - 0.02, g = sbox(pw, ph, pd, 0.5).translate(0, ph / 2, 0);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.05) { p.setX(i, p.getX(i) + Math.sign(p.getX(i)) * (Math.abs(p.getX(i)) > pw / 2 - 0.01 ? 0.16 : 0)); p.setZ(i, p.getZ(i) + Math.sign(p.getZ(i)) * (Math.abs(p.getZ(i)) > pd / 2 - 0.01 ? 0.16 : 0)); }
    wobble(g, 0.045, 0.6, 77, 50, 0.25);
    b.add('earth', shade(g, (_x, y, _z, _nx, ny) => (ny > 0.7 ? 1.06 : 0.92 + 0.1 * smooth(0, fl, y))));
    for (let i = 0; i < 10; i++) {
      const front = i < 6, sx = front ? -pw / 2 + 0.5 + (i * (pw - 1)) / 5 + R.pm(0.45) : (i % 2 ? 1 : -1) * (pw / 2 + 0.05), sz = front ? pd / 2 + 0.06 : -pd / 2 + 1.2 + (i - 6) * 1.1 + R.pm(0.3);
      if (front && Math.abs(sx) < 1.25) continue;
      b.add('stone', flatRock(300 + i, R.r(0.17, 0.3), fl * R.r(0.6, 0.95), R.r(0.13, 0.2), 1).applyMatrix4(M.mul(M.t(sx, 0, sz), M.ry(front ? R.pm(0.25) : Math.PI / 2 + R.pm(0.25)))));
    }
    b.add('stone', flatRock(31, 0.82, 0.15, 0.3).applyMatrix4(M.t(0.03, 0, pd / 2 + 0.34)));
    c.solid({ id: '草堂·台基', kind: 'rect', x: ox, z: oz, w: pw, d: pd, top: oy + ph, walk: true });
    c.solid({ id: '草堂·踏步石', kind: 'rect', x: ox + 0.03, z: oz + pd / 2 + 0.34, w: 1.5, d: 0.56, top: oy + 0.15, walk: true });
  }

  // —— 三面土墙（东、西两山通进深，北墙夹在当中）——
  b.add('earth', earthWall(-xi, xi, base, top, -z0, -zi, 11, sky, fl));
  b.add('earth', earthWall(-x0, -xi, base, top, -z0, z0, 12, sky, fl));
  b.add('earth', earthWall(xi, x0, base, top, -z0, z0, 13, sky, fl));
  c.solid({ id: '草堂·北墙', kind: 'rect', x: ox, z: oz - z0 + wt / 2, w: W, d: wt });
  c.solid({ id: '草堂·西墙', kind: 'rect', x: ox - x0 + wt / 2, z: oz, w: wt, d: D });
  c.solid({ id: '草堂·东墙', kind: 'rect', x: ox + x0 - wt / 2, z: oz, w: wt, d: D });
  // 四角与北墙上的露明柱（半嵌在墙里），柱脚各垫一块石
  const posts: Array<[number, number, number]> = [[-x0 + 0.17, z0 - 0.02, 1], [x0 - 0.17, z0 - 0.02, 2], [-x0 + 0.17, -z0 + 0.02, 3], [x0 - 0.17, -z0 + 0.02, 4], [-1.7, -z0 + 0.01, 5], [1.7, -z0 + 0.01, 6]];
  for (const [px, pz, s] of posts) {
    b.add('wood', post(px, pz, fl - 0.04, top - 0.02, 0.115, 500 + s));
    b.add('stone', flatRock(520 + s, 0.21, fl + 0.02, 0.2, 1).applyMatrix4(M.t(px, -0.02, pz + Math.sign(pz) * 0.03)));
  }
  // 山墙上各开一个小小的气窗（几根木棂，里面是黑的）
  for (const s of [-1, 1]) {
    b.add('dark', box(0.02, 0.4, 0.5).translate(s * (x0 + 0.004), fl + 2.02, 0));
    for (let i = -2; i <= 2; i++) b.add('wood', cyl(0.016, 0.016, 0.42, 4).translate(s * (x0 + 0.02), fl + 2.02, i * 0.1));
    for (const y of [1.79, 2.25]) b.add('wood', box(0.05, 0.05, 0.62, 'z').translate(s * (x0 + 0.015), fl + y, 0));
  }

  // —— 屋里的墙面与地面：略深的一层；夜里点了灯泛暖 ——
  {
    const wallIn = (len: number, m: THREE.Matrix4, seed: number) => {
      // 一张立着的面（朝 +z），底边在 y=fl，上到墙头；上头、两角暗些
      const nx = Math.max(2, Math.round(len / 0.5)), ny = 6, pts: THREE.Vector3[][] = [];
      for (let i = 0; i <= nx; i++) { pts.push([]); for (let j = 0; j <= ny; j++) pts[i].push(v3(-len / 2 + (len * i) / nx, fl + ((top - fl) * j) / ny, 0)); }
      const g = grid(pts, (_i, _j, p) => [p.x, p.y]);
      shade(g, (x, y) => 1 - 0.14 * smooth(fl + 1.5, top, y) - 0.1 * smooth(len / 2 - 0.9, len / 2, Math.abs(x)) - 0.06 * smooth(fl + 0.5, fl, y) - 0.07 * (fbm(x * 0.8 + seed, y * 0.8, 2, seed) - 0.5) * 2);
      return g.applyMatrix4(m);
    };
    // （衬面要离土墙远一点：土墙是歪的，贴太近会一块一块地鼓出来）
    b.add('inner', wallIn(2 * xi, M.t(0, 0, -zi + 0.03), 1));
    b.add('inner', wallIn(D, M.mul(M.t(-xi + 0.03, 0, 0), M.ry(Math.PI / 2)), 2));
    b.add('inner', wallIn(D, M.mul(M.t(xi - 0.03, 0, 0), M.ry(-Math.PI / 2)), 3));
    // 地面：夯过的土地，比墙面浅、灰一点。门口进来的一路踩得发亮（色浅），墙根深
    const nx = 22, nz = 13, pts: THREE.Vector3[][] = [];
    for (let i = 0; i <= nx; i++) { pts.push([]); for (let j = 0; j <= nz; j++) pts[i].push(v3(-xi + (2 * xi * i) / nx, fl, z0 - (D - wt) * (j / nz))); }
    const g = grid(pts, (_i, _j, p) => [p.x, p.z]);
    shade(g, (x, _y, z) => 1.07 - 0.13 * smooth(1.2, 0, Math.min(xi - Math.abs(x), z + zi)) + 0.06 * smooth(1.8, 0.2, Math.hypot(x * 0.9, (z - z0) * 0.5)) - 0.06 * (fbm(x * 0.9, z * 0.9, 2, 5) - 0.5) * 2);
    b.add('inner', tint(g, 0.985, 1, 1.03));
  }

  // —— 南墙（连门窗）：这一组在人进屋后隐去 ——
  {
    const dj = dm.door / 2 + 0.06, wa = dm.winX - dm.winW / 2, wb = dm.winX + dm.winW / 2;
    const xs = [-xi, -wb, -wa, -dj, dj, wa, wb, xi];
    const inside = (g: Geo) => shade(g, (_x, _y, _z, _nx, _ny, nz) => (nz < -0.5 ? 0.76 : 1));
    xs.forEach((xa, i) => {
      if (i === xs.length - 1) return;
      const xb = xs[i + 1];
      if (i === 1 || i === 5) {
        // 窗下的槛墙、窗上的一截
        bf.add('earth', inside(earthWall(xa, xb, base, fl + dm.sill - 0.05, zi, z0, 20 + i, sky, fl)));
        bf.add('earth', inside(earthWall(xa, xb, fl + dm.head + 0.07, top, zi, z0, 30 + i, sky, fl)));
      } else if (i === 3) bf.add('earth', inside(earthWall(xa, xb, fl + dm.doorH + 0.13, top, zi, z0, 40, sky, fl)));
      else bf.add('earth', inside(earthWall(xa, xb, base, top, zi, z0, 50 + i, sky, fl)));
    });
    c.solid({ id: '草堂·南墙西段', kind: 'rect', x: ox - (xi + dj) / 2, z: oz + z0 - wt / 2, w: xi - dj, d: wt });
    c.solid({ id: '草堂·南墙东段', kind: 'rect', x: ox + (xi + dj) / 2, z: oz + z0 - wt / 2, w: xi - dj, d: wt });
    // 明间两根檐柱
    for (const s of [-1, 1]) {
      bf.add('wood', post(s * 1.7, z0 - 0.02, fl - 0.04, top - 0.02, 0.115, 540 + s));
      bf.add('stone', flatRock(545 + s, 0.21, fl + 0.02, 0.2, 1).applyMatrix4(M.t(s * 1.7, -0.02, z0 + 0.03)));
    }
    // 门框：两根门梃、一道门额（搭在两柱之间）、一条矮门槛
    const zf = z0 - 0.08;
    for (const s of [-1, 1]) bf.add('wood', wobble(boxUp(0.1, dm.doorH + 0.02, 0.2, 'y').translate(s * (dm.door / 2 + 0.05), fl, zf - 0.04), 0.004, 3, 60 + s));
    bf.add('wood', wobble(box(3.4, 0.15, 0.2, 'x').translate(0, fl + dm.doorH + 0.075, zf - 0.02), 0.006, 2, 63));
    bf.add('wood', wobble(boxUp(dm.door + 0.02, 0.085, 0.12, 'x').translate(0, fl - 0.005, z0 - 0.07), 0.004, 3, 64));
    // 两樘直棂窗
    for (const s of [-1, 1]) {
      const [wd, pp] = lattice(dm.winW, dm.head - dm.sill, wt, 70 + s), m = M.t(s * dm.winX, fl + (dm.sill + dm.head) / 2, z0 - wt / 2);
      for (const g of wd) bf.add('wood', g.applyMatrix4(m));
      for (const g of pp) bf.add('paper', g.applyMatrix4(m));
    }
  }

  // —— 门扇两扇（可开合）：原点在门轴脚下；现在敞着 ——
  {
    const lw = dm.door / 2 - 0.012, lh = dm.doorH - 0.03, zh = z0 - 0.16;
    const L = c.part('doorL', 'wood', doorLeaf(lw, lh, -1, 900), v3(ox - dm.door / 2, oy + fl + 0.012, oz + zh), new THREE.Euler(0, 1.95, 0), c.frontRoot);
    L.userData = { open: 1.95, closed: 0, width: lw };
    const Rr = c.part('doorR', 'wood', doorLeaf(lw, lh, 1, 910), v3(ox + dm.door / 2, oy + fl + 0.012, oz + zh), new THREE.Euler(0, -2.02, 0), c.frontRoot);
    Rr.userData = { open: -2.02, closed: 0, width: lw };
  }

  // —— 屋顶 ——
  {
    const over = 0.98, overX = 0.92, eaveTop = dm.eave + 0.3;
    const th = thatchRoof({
      w: W + overX * 2, d: D + over * 2, rise: 2.9, hip: 2.0, thick: 0.3, sag: 0.3, lift: 0.2, ridgeSag: 0.13, round: 0.85, droop: 0.2,
      courses: 3, step: 0.06, rag: 0.085, cell: c.low ? 0.2 : 0.115, seed: 11, roll: 0.2,
      patches: [{ x: -2.7, z: 1.9, w: 1.5, l: 1.25 }, { x: 3.3, z: 2.75, w: 1.1, l: 0.9 }, { x: 1.2, z: -2.2, w: 1.4, l: 1.2 }],
    });
    br.add('thatch', th.thatch.translate(0, eaveTop, 0));
    if (th.bamboo) br.add('bamboo', th.bamboo.translate(0, eaveTop, 0));
    // 椽：檐下露出的一排圆椽
    const under = (x: number, z: number) => eaveTop + th.top(x, z) - 0.31;
    for (const s of [-1, 1]) for (let x = -x0 + 0.1; x <= x0 - 0.05; x += 0.44) {
      const xx = x + R.pm(0.03), za = s * (zi - 0.3), zb = s * (z0 + over - 0.2);
      br.add('wood', pole(v3(xx, under(xx, za) - 0.03, za), v3(xx, under(xx, zb) - 0.05, zb), 0.036, 0.03, 6));
    }
    for (const s of [-1, 1]) for (let z = -z0 + 0.3; z <= z0 - 0.25; z += 0.5) {
      const xa = s * (xi - 0.2), xb = s * (x0 + overX - 0.2);
      br.add('wood', pole(v3(xa, under(xa, z) - 0.03, z), v3(xb, under(xb, z) - 0.05, z), 0.036, 0.03, 6));
    }
    // 梁：明间两缝，头出在檐墙外；檐檩搭在柱头上（前后各一根通长的圆木）
    for (const x of [-1.7, 1.7]) br.add('wood', renormal(wobble(pole(v3(x, top - 0.02, -z0 - 0.26), v3(x, top - 0.02, z0 + 0.26), 0.12, 0.115, 8, 6), 0.012, 1.1, 31 + x, 0), 60));
    for (const s of [-1, 1]) br.add('wood', pole(v3(-x0 - 0.2, top - 0.03, s * (z0 - 0.13)), v3(x0 + 0.2, top - 0.03, s * (z0 - 0.13)), 0.085, 0.08, 8, 4));
    c.solid({ id: '草堂·檐口', kind: 'rect', x: ox, z: oz, w: W + overX * 2, d: D + over * 2, top: oy + dm.eave });
  }

  furnish(c, dm);
  for (const k of [b, bf, br]) k.pop();

  c.anchor('hallDoor', ox, oy + fl, oz + z0 - 0.1, 0);
}
