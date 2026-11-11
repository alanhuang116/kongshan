/**
 * 香炉与烛台：
 *   courtCenser —— 院中大香炉：三足圆鼎式的铜炉（双立耳、鼓腹、兽蹄足，腹上两道弦纹夹一圈乳钉），立在方石座上；一足朝前。
 *   lampStand   —— 高足铜烛台（上香时在它的火上点香）。
 *   incenseHolder —— 静坐时插那一炷香的小瓷炉。
 * 立耳立在口沿上、顺着口沿走（耳孔朝左右），自下而上向外撇 —— 正面看是两道外扬的弧，斜着看才见耳孔。
 */
import * as THREE from 'three';
import { M, box, colorize, cylUp, extrude, lathe4, shade, sphere } from '../core/geo';
import type { Mats } from '../core/mats';
import { mulberry32 } from '../core/rng';
import type { Quality } from '../core/World';
import { Builder, blob, disc, finish, type P2, prof, rib, sg, spl, turn } from './kit';

const LIN = (hex: number) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b] as [number, number, number]; };

/** 一支燃过的残香：下面是香杆的土黄，顶上一小截灰白，交界处一圈焦黑。底在 y=0，高 1（用实例矩阵拉长短） */
function stub() {
  const a = LIN(0x9a6b3a), ash = LIN(0xb9b6ae), ch = LIN(0x241a14);
  return colorize(cylUp(0.0034, 0.0034, 1, 5, false, 6), (_x, y, _z, _nx, _ny, _nz, o) => {
    const c = y > 0.93 ? ash : y > 0.86 ? ch : a;
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
}

export function courtCenser(mats: Mats, q: Quality): THREE.Group {
  const b = new Builder(), n = sg(q, 56), ys = 0.42;
  const Y = (y: number) => ys + y;
  // 方石座：下枋、束腰、上枋
  b.add('stone', shade(lathe4([[0.8, 0], [0.8, 0.085], [0.785, 0.1], [0.7, 0.115], [0.66, 0.14], [0.66, 0.28], [0.7, 0.305], [0.78, 0.32], [0.795, 0.335], [0.795, 0.405], [0.78, 0.42]]),
    (_x, y) => (y > 0.12 && y < 0.3 ? 0.8 : 1)));
  b.add('stone', box(1.56, 0.01, 1.56, 'x').translate(0, 0.415, 0));
  // 炉身：圜底、鼓腹、束颈、撇口、平沿，接着翻进去的内壁
  const body: P2[] = prof(
    spl([[0.001, Y(0.34)], [0.2, Y(0.346)], [0.42, Y(0.392)], [0.6, Y(0.505)], [0.69, Y(0.64)], [0.706, Y(0.72)], [0.704, Y(0.758)]], 16),
    rib(0.703, Y(0.773), 0.03, 0.013),
    [[0.701, Y(0.8)], [0.694, Y(0.842)]],
    rib(0.69, Y(0.857), 0.03, 0.013),
    spl([[0.686, Y(0.874)], [0.66, Y(0.918)], [0.628, Y(0.955)], [0.624, Y(0.978)], [0.646, Y(1.004)], [0.672, Y(1.022)], [0.68, Y(1.03)]], 12),
    [[0.68, Y(1.03)], [0.676, Y(1.04)], [0.612, Y(1.04)], [0.604, Y(1.032)]],
    [[0.604, Y(1.032)], [0.598, Y(0.99)], [0.602, Y(0.95)]],
  );
  b.add('bronze', shade(turn(body, n, { tile: 0.8 }), (_x, y) => 0.82 + 0.18 * Math.min(1, Math.max(0, (y - Y(0.34)) / 0.4))));
  // 乳钉一圈
  const stud = () => turn([[0.024, 0], [0.022, 0.008], [0.013, 0.017], [0.001, 0.02]], 10).rotateX(Math.PI / 2);
  for (let i = 0; i < 28; i++) b.inst('censerStud', 'bronze', stud, M.mul(M.ry(((i + 0.5) / 28) * Math.PI * 2), M.t(0, Y(0.815), 0.694)));
  // 三足：兽蹄足，一足朝前；上粗下收，蹄处再放开；略向外撇
  const leg = spl([[0.001, 0], [0.066, 0], [0.09, 0.014], [0.094, 0.05], [0.076, 0.1], [0.058, 0.175], [0.06, 0.24], [0.082, 0.32], [0.118, 0.39], [0.142, 0.47]], 20);
  // 足根的兽面：只取个意思 —— 一块鼓起的额、一道鼻梁、两道眉、两只眼
  const mask = (g: Builder) => {
    g.add('bronze', blob(12, 10, (v) => { v.set(v.x * 0.082, v.y * 0.075 + 0.385, v.z * 0.034 + 0.1); }));
    g.add('bronze', blob(8, 8, (v) => { v.set(v.x * 0.015, v.y * 0.05 + 0.368, v.z * 0.022 + 0.122); }));
    for (const s of [-1, 1]) {
      g.add('bronze', blob(8, 6, (v) => { v.set(v.x * 0.034 + s * 0.04, v.y * 0.011 + 0.413 + v.x * s * 0.012, v.z * 0.014 + 0.124); }));
      g.add('bronze', blob(8, 6, (v) => { v.set(v.x * 0.013 + s * 0.037, v.y * 0.011 + 0.388, v.z * 0.012 + 0.127); }));
    }
  };
  for (let i = 0; i < 3; i++) {
    b.push(M.mul(M.ry((i * Math.PI * 2) / 3), M.t(0, ys, 0.558), M.rx(-0.19)));
    b.add('bronze', shade(turn(leg, sg(q, 20)), (_x, y) => 0.8 + 0.2 * Math.min(1, y / 0.2)));
    mask(b);
    b.pop();
  }
  // 双立耳
  const ear = () => {
    const s = new THREE.Shape();
    s.moveTo(-0.17, -0.03); s.lineTo(-0.17, 0.235); s.quadraticCurveTo(-0.17, 0.33, -0.085, 0.33); s.lineTo(0.085, 0.33); s.quadraticCurveTo(0.17, 0.33, 0.17, 0.235); s.lineTo(0.17, -0.03);
    s.lineTo(0.092, -0.03); s.lineTo(0.092, 0.2); s.quadraticCurveTo(0.092, 0.25, 0.045, 0.25); s.lineTo(-0.045, 0.25); s.quadraticCurveTo(-0.092, 0.25, -0.092, 0.2); s.lineTo(-0.092, -0.03); s.closePath();
    const g = extrude(s, 0.072, 'y', sg(q, 10), 0.012);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const y = Math.max(0, p.getY(i)); p.setZ(i, p.getZ(i) + 0.105 * Math.pow(y / 0.33, 1.7)); }
    g.computeVertexNormals();
    return g;
  };
  for (const s of [1, -1]) b.add('bronze', ear().applyMatrix4(M.mul(M.t(s * 0.642, Y(1.036), 0), M.ry((s * Math.PI) / 2))));
  // 香灰：中间略高
  const ay = Y(0.955);
  b.add('ash', disc(0.602, ay, sg(q, 32), 0.024, 4));
  // 残香
  const r = mulberry32(77);
  const count = q.tier === 'low' ? 14 : 30;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.46, h = 0.035 + r() * r() * 0.2;
    b.inst('censerStub', 'joss', stub, M.mul(M.t(Math.cos(a) * d, ay + 0.012 * (1 - d / 0.6), Math.sin(a) * d), M.rx((r() - 0.5) * 0.34), M.rz((r() - 0.5) * 0.34), M.s(1, h, 1)));
  }
  const g = finish(b, mats, q, 'courtCenser', ['joss']);
  g.userData = { ashY: ay + 0.012, ashR: 0.46 };
  return g;
}

/** 烛：粗烛一支，顶上烧出一个浅窝，边上挂两道烛泪。底在 y=0。返回烛芯顶端的高度 */
export function candle(b: Builder, r: number, h: number, mat: 'wax' | 'waxRed', seg = 20): number {
  b.add(mat, turn(prof(
    [[0.001, 0], [r * 0.96, 0], [r, 0.004]],
    [[r, 0.004], [r, h - 0.006], [r * 0.93, h], [r * 0.72, h - 0.002], [r * 0.3, h - 0.012], [0.001, h - 0.014]],
  ), seg));
  // 烛泪
  b.add(mat, sphere(1, 8, 8).scale(r * 0.2, h * 0.16, r * 0.16).translate(r * 0.93, h * 0.84, r * 0.2));
  b.add(mat, sphere(1, 8, 8).scale(r * 0.16, h * 0.09, r * 0.14).translate(-r * 0.7, h * 0.9, -r * 0.66));
  b.add('wick', cylUp(0.0016, 0.002, 0.016, 5).translate(0, h - 0.014, 0));
  return h + 0.002;
}

/** 高足铜烛台，高约 1.25（连烛） */
export function lampStand(mats: Mats, q: Quality, red = false): THREE.Group {
  const b = new Builder(), n = sg(q, 40);
  const p: P2[] = prof(
    // 覆盆式的足
    spl([[0.001, 0], [0.19, 0], [0.2, 0.012], [0.196, 0.03], [0.15, 0.052], [0.09, 0.085], [0.05, 0.14], [0.034, 0.2]], 18),
    // 柄：三道竹节
    [[0.034, 0.2], [0.03, 0.34]], rib(0.03, 0.36, 0.036, 0.016), [[0.03, 0.38], [0.028, 0.56]], rib(0.028, 0.58, 0.036, 0.016), [[0.028, 0.6], [0.027, 0.78]], rib(0.027, 0.8, 0.03, 0.012),
    // 承盘
    spl([[0.027, 0.82], [0.032, 0.845], [0.07, 0.862], [0.118, 0.872], [0.13, 0.884]], 8),
    [[0.13, 0.884], [0.127, 0.892], [0.118, 0.886], [0.06, 0.878], [0.03, 0.882]],
    // 上柄与烛座
    spl([[0.03, 0.882], [0.024, 0.92], [0.026, 0.96], [0.044, 0.985], [0.054, 1.0]], 8),
    [[0.054, 1.0], [0.052, 1.008], [0.04, 1.004], [0.001, 1.004]],
  );
  b.add('bronze', shade(turn(p, n, { tile: 0.8 }), (_x, y) => 0.85 + 0.15 * Math.min(1, y / 0.3)));
  b.push(M.t(0, 1.004, 0));
  const top = candle(b, 0.036, 0.23, red ? 'waxRed' : 'wax', sg(q, 20));
  b.pop();
  const g = finish(b, mats, q, 'lampStand');
  g.userData = { flame: new THREE.Vector3(0, 1.004 + top, 0) };
  return g;
}

/** 小瓷炉（青瓷三足）：径约 0.11、高约 0.07，里面是香灰 */
export function incenseHolder(mats: Mats, q: Quality): THREE.Group {
  const b = new Builder(), n = sg(q, 40), f = 0.012;
  b.add('celadon', turn(prof(
    spl([[0.001, f], [0.022, f], [0.04, f + 0.008], [0.053, f + 0.024], [0.055, f + 0.036], [0.049, f + 0.047], [0.048, f + 0.052], [0.054, f + 0.058]], 14),
    [[0.054, f + 0.058], [0.053, f + 0.0605], [0.0475, f + 0.0605], [0.046, f + 0.058]],
    [[0.046, f + 0.058], [0.0455, f + 0.05], [0.047, f + 0.044]],
  ), n));
  for (let i = 0; i < 3; i++) b.add('celadon', turn([[0.001, 0], [0.006, 0], [0.009, 0.004], [0.012, 0.016], [0.013, 0.022]], 12).applyMatrix4(M.mul(M.ry((i * Math.PI * 2) / 3), M.t(0, 0, 0.034))));
  const ay = f + 0.046;
  b.add('ash', disc(0.047, ay, sg(q, 16), 0.004, 2));
  const g = finish(b, mats, q, 'incenseHolder');
  g.userData = { ashY: ay + 0.003, ashR: 0.034 };
  return g;
}
