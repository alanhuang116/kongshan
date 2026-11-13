/**
 * 观物亭：池西岸一座矮矮的方草亭。八根木柱（四角、四边正中各一），四面都敞着；北、西两边柱间架着板凳；
 * 东檐下一块小小的素木牌「观物」；亭心地上嵌一方圆石，石面浅浅刻着先天八卦（按真方位：乾南、坤北、离东、坎西）。
 * 亭前池边一块平石。
 */
import * as THREE from 'three';
import { M, box, cyl, lathe, norm, shade, tint, type Geo } from '../core/geo';
import { SITE, ground } from '../site';
import { INK, blankUV, dye, flatRock, panel, pole, renormal, rnd, sbox, tube, v3, wobble, type Ctx, type V3 } from './kit';
import { post } from './hall';
import { thatchRoof } from './thatch';

const at = (g: Geo, x: number, y: number, z: number, ry = 0) => g.applyMatrix4(M.mul(M.t(x, y, z), M.ry(ry)));

export function buildPavilion(c: Ctx): void {
  const P = SITE.pavilion, b = c.home, R = rnd(9103), g0 = ground(P.x, P.z), fl = P.floor, hf = P.half, e = hf - 0.16;
  const obj = { push: (...gs: Geo[]) => { for (const g of gs) b.add('obj', g); } }, lab = { push: (...gs: Geo[]) => { for (const g of gs) b.add('label', g); } };
  b.push(M.t(P.x, g0, P.z));

  // —— 台：一圈毛石镶边，当中填土夯平 ——
  b.add('earth', shade(wobble(sbox(2 * hf - 0.3, fl + 0.4, 2 * hf - 0.3, 0.6).translate(0, (fl - 0.4) / 2, 0), 0.012, 0.8, 91, 40, 0.2), () => 1.04));
  for (let s = 0; s < 4; s++) {
    let t = -hf;
    while (t < hf - 0.05) {
      const l = Math.min(hf - t, R.r(0.55, 1.15)), g = sbox(l - 0.02, fl + 0.36, 0.3, 0.4).translate(t + l / 2, (fl - 0.36) / 2 + R.pm(0.012), hf - 0.15 + R.pm(0.015));
      b.add('stone', tint(renormal(wobble(g, 0.016, 1.6, 910 + s * 20 + Math.round(t * 5), 0, 0.5), 42).applyMatrix4(M.ry((s * Math.PI) / 2)), R.r(0.95, 1.12)));
      t += l;
    }
  }
  c.solid({ id: '观物亭·台', kind: 'rect', x: P.x, z: P.z, w: 2 * hf, d: 2 * hf, top: g0 + fl, walk: true });

  // —— 亭心的圆石：先天八卦。画的上边朝北（-z）、右边朝东（+x）——
  {
    const r = 0.75, n = c.low ? 20 : 32, rc = c.rect('compass'), ty = fl + 0.014;
    const pos: number[] = [], uv: number[] = [], nor: number[] = [];
    const U = (x: number, z: number): [number, number] => [rc[0] + (x / (2 * r) + 0.5) * (rc[2] - rc[0]), rc[3] + (z / (2 * r) + 0.5) * (rc[1] - rc[3])];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
      pos.push(0, ty, 0, x1, ty, z1, x0, ty, z0); nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0); uv.push(...U(0, 0), ...U(x1, z1), ...U(x0, z0));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    lab.push(dye(norm(g), INK.slate, 0.62));
    lab.push(blankUV(dye(cyl(r + 0.012, r + 0.02, 0.07, n, true).translate(0, ty - 0.035, 0), INK.slate, 1.1), c.blank));
    const a = c.anchor('compass', P.x, g0 + ty, P.z, 0);
    a.userData = { r };
  }

  // —— 八根柱：四角、四边正中；柱脚各垫一块石 ——
  const beamY = fl + 2.2;
  const spots: Array<[number, number]> = [[-e, -e], [e, -e], [e, e], [-e, e], [0, -e], [e, 0], [0, e], [-e, 0]];
  spots.forEach(([x, z], i) => {
    b.add('wood', post(x, z, fl - 0.02, beamY - 0.02, i < 4 ? 0.09 : 0.08, 920 + i));
    b.add('stone', at(flatRock(930 + i, 0.17, 0.05, 0.16, 1), x, fl - 0.012, z, R() * 6));
    c.solid({ id: `观物亭·柱${i + 1}`, kind: 'disc', x: P.x + x, z: P.z + z, r: 0.11 });
  });
  // 柱头一圈圆枋（四根，头出在角柱之外，一高一低地搭着）
  for (let s = 0; s < 4; s++) {
    const y = beamY - 0.08 + (s % 2 ? 0.08 : 0), m = M.ry((s * Math.PI) / 2);
    b.add('wood', renormal(wobble(pole(v3(-e - 0.12, y, e), v3(e + 0.12, y + 0.01, e), 0.07, 0.066, 8, 5), 0.008, 1.4, 940 + s, 0), 60).applyMatrix4(m));
  }
  // 椽：四根角椽、每面三根，攒到顶心一根短柱上
  const apexY = fl + 3.42;
  b.add('wood', cyl(0.07, 0.06, 0.5, 7).translate(0, apexY - 0.05, 0));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.add('wood', pole(v3(x * (e + 0.2), fl + 1.96, z * (e + 0.2)), v3(x * 0.04, apexY, z * 0.04), 0.045, 0.04, 6));
  for (let s = 0; s < 4; s++) for (const t of [-0.5, 0, 0.5]) b.add('wood', pole(v3(t * 2 * e, fl + 2.06, e + 0.5), v3(t * 0.08, apexY - 0.03, 0.05), 0.036, 0.03, 5).applyMatrix4(M.ry((s * Math.PI) / 2)));

  // —— 草顶：攒尖，檐口压得低；顶上扎一个草把 ——
  {
    const over = 0.85, eb = fl + 1.92, th = thatchRoof({ w: 2 * (e + over), d: 2 * (e + over), rise: 2.02, hip: e + over, thick: 0.24, sag: 0.3, round: 0.75, droop: 0.17, courses: 3, step: 0.05, rag: 0.075, cell: c.low ? 0.2 : 0.12, seed: 23, roll: 0, patches: [{ x: 0.6, z: 1.5, w: 1.0, l: 0.8 }] });
    b.add('thatch', th.thatch.translate(0, eb + 0.24, 0));
    const ky = eb + 0.24 + 2.02 - 0.16;
    const knot = lathe([[0.3, 0], [0.2, 0.1], [0.13, 0.2], [0.1, 0.3], [0.15, 0.37], [0.1, 0.52], [0.03, 0.66], [0.001, 0.68]], 9);
    b.add('thatch', tint(wobble(knot, 0.02, 2.5, 95, 0), 0.9, 0.9, 0.9).translate(0, ky, 0));
    const ring: V3[] = [];
    for (let i = 0; i <= 10; i++) ring.push(v3(Math.cos((i / 10) * 6.2832) * 0.108, ky + 0.3, Math.sin((i / 10) * 6.2832) * 0.108));
    obj.push(dye(tube(ring, 0.012, 4), INK.hemp, 1.7));
    c.solid({ id: '观物亭·檐口', kind: 'rect', x: P.x, z: P.z, w: 2 * (e + over), d: 2 * (e + over), top: g0 + eb });
  }

  // —— 北、西两边的板凳（柱间架一块厚板，底下几只矮脚），背后一道竹栏 ——
  {
    const sh = fl + 0.44, sw = 0.36;
    // 北
    b.add('wood', at(wobble(box(2 * e - 0.2, 0.05, sw, 'x'), 0.005, 1.6, 96, 40, 0.5), 0, sh - 0.025, -e + 0.27));
    for (const x of [-e + 0.5, -0.02, e - 0.5]) b.add('wood', at(wobble(box(0.09, sh - fl - 0.05, sw - 0.06, 'y'), 0.004, 3, 97 + x), x, (sh - 0.05 + fl) / 2, -e + 0.27));
    c.solid({ id: '观物亭·北凳', kind: 'rect', x: P.x, z: P.z - e + 0.27, w: 2 * e - 0.2, d: sw, top: g0 + sh });
    // 西（让开西北角，不与北凳叠）
    const z0 = -e + 0.5, z1 = e - 0.1, zc = (z0 + z1) / 2;
    b.add('wood', at(wobble(box(sw, 0.05, z1 - z0, 'z'), 0.005, 1.6, 98, 40, 0.5), -e + 0.27, sh - 0.025, zc));
    for (const z of [z0 + 0.35, zc + 0.1, z1 - 0.3]) b.add('wood', at(wobble(box(sw - 0.06, sh - fl - 0.05, 0.09, 'y'), 0.004, 3, 99 + z), -e + 0.27, (sh - 0.05 + fl) / 2, z));
    c.solid({ id: '观物亭·西凳', kind: 'rect', x: P.x - e + 0.27, z: P.z + zc, w: sw, d: z1 - z0, top: g0 + sh });
    c.anchor('pavilionSeat', P.x - e + 0.27, g0 + sh, P.z + 0.5, Math.PI / 2);
    c.anchor('pavilionSeatN', P.x + 0.6, g0 + sh, P.z - e + 0.27, 0);
    for (const [ax, az, bx, bz] of [[-e, -e, e, -e], [-e, -e, -e, e]]) for (const y of [0.88, 0.62]) b.add('bamboo', pole(v3(ax, fl + y, az), v3(bx, fl + y + 0.01, bz), 0.019, 0.017, 6, 3));
  }

  // —— 东檐下的小木牌「观物」（朝东，朝着池）——
  {
    const m = M.mul(M.t(e + 0.36, fl + 1.64, -e / 2), M.ry(Math.PI / 2), M.rx(0.16));
    lab.push(blankUV(dye(wobble(box(0.66, 0.33, 0.024), 0.0012, 3, 101), [0.88, 0.85, 0.78], 1.3), c.blank).applyMatrix4(m));
    lab.push(dye(panel(0.64, 0.31, c.rect('guanwu')), [0.88, 0.85, 0.78], 1.05).translate(0, 0, 0.016).applyMatrix4(m));
    for (const s of [-1, 1]) obj.push(dye(pole(v3(s * 0.25, 0.165, 0), v3(s * 0.25, 0.52, -0.08), 0.005, 0.005, 4), INK.hemp, 1.5).applyMatrix4(m));
    c.anchor('board', P.x + e + 0.38, g0 + fl + 1.64, P.z - e / 2, Math.PI / 2);
    // 牌下这一间不走人：柱间拦一道矮竹栏（东面的出入口在南边那一间）
    for (const y of [0.86, 0.6]) b.add('bamboo', pole(v3(e, fl + y, -e), v3(e, fl + y + 0.01, 0), 0.019, 0.017, 6, 3));
    c.solid({ id: '观物亭·东北间的矮栏', kind: 'rect', x: P.x + e, z: P.z - e / 2, w: 0.1, d: e });
  }

  // —— 踏步石：东、南各一块 ——
  for (const [x, z, ry, id] of [[hf + 0.32, e / 2, Math.PI / 2, '东'], [-e / 2, hf + 0.32, 0, '南']] as Array<[number, number, number, string]>) {
    const gy = ground(P.x + x, P.z + z) - g0;
    b.add('stone', at(flatRock(940 + x * 3, 0.58, 0.17 - gy + 0.02, 0.3), x, gy - 0.02, z, ry));
    c.solid({ id: `观物亭·踏步石${id}`, kind: 'rect', x: P.x + x, z: P.z + z, w: ry ? 0.56 : 1.1, d: ry ? 1.1 : 0.56, top: g0 + 0.17, walk: true });
  }
  b.pop();
  c.anchor('pavilion', P.x - e / 2, g0, P.z + hf + 0.9, 0);

  // —— 亭前池边的一块平石（半探在水上）——
  {
    const pond = SITE.pond, z = P.z + 0.4;
    let x = P.x + hf;
    while (x < pond.x && ground(x, z) > pond.y - 0.04) x += 0.05;
    const sx = x - 0.35, gy = ground(sx, z), top = pond.y + 0.2;
    c.home.add('stone', tint(at(flatRock(951, 0.85, 0.5, 0.7, 2, 0.62), sx, top - 0.5, z, 0.3), 1.08));
    c.home.add('stone', at(flatRock(952, 0.3, 0.2, 0.24, 1), sx - 0.5, ground(sx - 0.5, z + 0.75) - 0.04, z + 0.75, 1.1));
    c.solid({ id: '池边平石', kind: 'disc', x: sx, z, r: 0.45, top, walk: true });
    c.anchor('pondStone', sx, top, z, -Math.PI / 2);
  }
}
