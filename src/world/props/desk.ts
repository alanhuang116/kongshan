/**
 * 案头两套：
 *   sutraDesk —— 抄经的矮案（人坐在蒲团上写，坐在 +z 一侧）：毡、宣纸、镇尺、砚与墨、笔山上的笔、水盂、灯、一卷经。
 *   teaSet    —— 茶寮的一套：矮几上红泥小炉、铁壶、盏与托、茶罐、茶则、水盂。
 */
import * as THREE from 'three';
import { M, V, box, colorize, cylUp, extrude, grid, norm, shade, sphere, tint } from '../core/geo';
import { enhance, variant, type Mats } from '../core/mats';
import { clamp } from '../core/rng';
import type { Quality } from '../core/World';
import { lowTable, slab } from './furniture';
import { Builder, blob, curve3, disc, dyed, finish, part, pmats, prof, ring, sg, spl, table, tube, turn } from './kit';

/** 小灯盏：瓷的高足盏，盏沿搭一根灯芯。底在 y=0。返回灯芯顶端 */
function oilLamp(b: Builder, q: Quality): THREE.Vector3 {
  b.add('celadon', turn(prof(
    spl([[0.001, 0], [0.034, 0], [0.037, 0.005], [0.02, 0.014], [0.009, 0.03], [0.008, 0.07], [0.016, 0.088], [0.04, 0.1], [0.047, 0.108]], 16),
    [[0.047, 0.108], [0.0455, 0.11], [0.036, 0.101], [0.012, 0.094], [0.001, 0.093]],
  ), sg(q, 28)));
  b.add('ink', tint(disc(0.035, 0.1, sg(q, 16)), 0.9, 0.7, 0.3));
  b.add('ink', tube([V(0.012, 0.099, 0), V(0.034, 0.103, 0), V(0.044, 0.113, 0)], 0.0018, 5));
  return new THREE.Vector3(0.045, 0.116, 0);
}

export function sutraDesk(mats: Mats, q: Quality): THREE.Group {
  const grp = new THREE.Group(), T = table(mats, q), b = new Builder(), W = 1.5, D = 0.62, H = 0.4, tt = 0.036;
  grp.name = 'sutraDesk';
  // 案：平头案，两端小翘头；板足开一个如意云头的透光；足下托泥
  b.add('walnut', slab(W, tt, D, 0.006).translate(0, H, 0));
  for (const s of [1, -1]) {
    // 翘头
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(0.05, 0); sh.quadraticCurveTo(0.052, 0.02, 0.03, 0.028); sh.quadraticCurveTo(0.012, 0.03, 0, 0.012); sh.closePath();
    b.add('walnut', extrude(sh, D, 'z', 6).scale(s, 1, 1).translate(s * (W / 2 - 0.05), H - 0.002, 0));
    // 板足
    const ps = new THREE.Shape(), hh = H - tt, hd = D / 2 - 0.05;
    ps.moveTo(-hd, 0.03); ps.lineTo(hd, 0.03); ps.lineTo(hd, hh); ps.lineTo(-hd, hh); ps.closePath();
    const hole = new THREE.Path();
    hole.moveTo(0, 0.1); hole.bezierCurveTo(0.09, 0.1, 0.16, 0.13, 0.15, 0.19); hole.bezierCurveTo(0.14, 0.24, 0.08, 0.22, 0.06, 0.25);
    hole.bezierCurveTo(0.04, 0.28, 0.02, 0.3, 0, 0.3); hole.bezierCurveTo(-0.02, 0.3, -0.04, 0.28, -0.06, 0.25);
    hole.bezierCurveTo(-0.08, 0.22, -0.14, 0.24, -0.15, 0.19); hole.bezierCurveTo(-0.16, 0.13, -0.09, 0.1, 0, 0.1);
    ps.holes.push(hole);
    b.add('walnut', extrude(ps, 0.03, 'y', 8, 0.004).rotateY(Math.PI / 2).translate(s * (W / 2 - 0.2), 0, 0));
    b.add('walnut', slab(0.07, 0.03, D - 0.04, 0.005).translate(s * (W / 2 - 0.2), 0.03, 0));
  }
  b.add('walnut', shade(box(W - 0.44, 0.045, 0.018, 'x').translate(0, H - tt - 0.0225, D / 2 - 0.09), () => 0.85));
  b.add('walnut', shade(box(W - 0.44, 0.045, 0.018, 'x').translate(0, H - tt - 0.0225, -D / 2 + 0.09), () => 0.85));
  // 毡
  b.add('felt', box(0.66, 0.004, 0.42, 'x').translate(-0.08, H + 0.002, 0.06));
  // 镇尺一对
  for (const s of [-1, 1]) b.add('walnut', tint(slab(0.022, 0.012, 0.24, 0.003).translate(-0.08 + s * 0.262, H + 0.0175, 0.06), 0.55));
  // 砚：石的，砚池里有墨；墨锭搁在砚边
  const ix = 0.44, iz = 0.06;
  b.add('inkstone', slab(0.115, 0.016, 0.175, 0.003, 0.012).translate(ix, H + 0.016, iz));
  for (const [w, d, x, z] of [[0.115, 0.012, 0, 0.0815], [0.115, 0.012, 0, -0.0815], [0.012, 0.151, 0.0515, 0], [0.012, 0.151, -0.0515, 0]] as Array<[number, number, number, number]>) {
    b.add('inkstone', slab(w, 0.008, d, 0.002).translate(ix + x, H + 0.024, iz + z));
  }
  b.add('ink', box(0.089, 0.002, 0.066, 'x').translate(ix, H + 0.0185, iz - 0.04));
  b.add('ink', slab(0.018, 0.011, 0.082, 0.002).rotateZ(0.0).rotateX(-0.12).rotateY(0.5).translate(ix + 0.012, H + 0.036, iz + 0.068));
  // 笔山：三峰
  const mt = new THREE.Shape();
  mt.moveTo(-0.05, 0); mt.lineTo(0.05, 0); mt.lineTo(0.05, 0.008); mt.quadraticCurveTo(0.04, 0.03, 0.03, 0.014); mt.quadraticCurveTo(0.018, 0.012, 0.01, 0.03);
  mt.quadraticCurveTo(0, 0.052, -0.012, 0.028); mt.quadraticCurveTo(-0.02, 0.012, -0.03, 0.016); mt.quadraticCurveTo(-0.04, 0.03, -0.05, 0.008); mt.closePath();
  // 笔山搁在右手边、靠人这一侧：坐在案前伸手就拿得到笔
  const rx = 0.3, rz = 0.2;
  b.add('celadon', extrude(mt, 0.02, 'y', 8, 0.004).rotateY(Math.PI / 2).translate(rx, H, rz));
  // 水盂与小铜勺
  b.push(M.t(0.47, H, -0.2));
  b.add('porcelain', turn(prof(spl([[0.001, 0.002], [0.016, 0.002], [0.02, 0], [0.03, 0.01], [0.034, 0.022], [0.028, 0.034], [0.022, 0.038]], 14), [[0.022, 0.038], [0.02, 0.0385], [0.026, 0.03], [0.03, 0.02], [0.02, 0.008], [0.001, 0.006]]), sg(q, 24)));
  b.add('water', disc(0.027, 0.028, sg(q, 16)));
  b.add('walnut', tube([V(0.012, 0.03, 0.004), V(0.03, 0.045, 0.01), V(0.06, 0.058, 0.02)], 0.0016, 5));
  b.add('walnut', blob(8, 6, (v) => { v.set(v.x * 0.007, Math.min(0, v.y) * 0.004 + 0.029, v.z * 0.007 + 0.002); v.x += 0.008; }));
  b.pop();
  // 灯
  b.push(M.t(-0.6, H, -0.2));
  const fl = oilLamp(b, q).add(V(-0.6, H, -0.2));
  b.pop();
  // 一卷经：纸卷、木轴头、一道系带
  b.push(M.mul(M.t(-0.46, H + 0.02, -0.21), M.ry(0.16), M.rz(Math.PI / 2)));
  b.add('paper', tint(turn([[0.001, -0.14], [0.0185, -0.14], [0.0185, 0.14], [0.001, 0.14]], sg(q, 16)), 0.78, 0.76, 0.7));
  for (const s of [-1, 1]) b.add('walnut', turn(spl([[0.006, 0], [0.007, 0.006], [0.01, 0.012], [0.006, 0.02], [0.001, 0.021]], 6), 10).scale(1, s, 1).translate(0, s * 0.14, 0));
  b.add('paper', tint(turn([[0.019, -0.006], [0.0194, 0], [0.019, 0.006]], sg(q, 16)), 0.42, 0.06, 0.04));
  b.pop();
  grp.add(b.build(new Proxy(T, { get: (t, k: string) => (k === 'inkstone' ? inkstoneMat(mats) : t[k]) }), { name: 'sutraDeskMesh', noCast: ['water'] }));
  // 纸：单独一件，uv 铺满 0…1（主代理可换成抄到一半的经）
  const pg = norm(new THREE.PlaneGeometry(0.56, 0.34).rotateX(-Math.PI / 2));
  const pm = variant(mats.paper, { color: 0xe9e6dd });
  if (pm.map) { pm.map = pm.map.clone(); pm.map.repeat.set(0.93, 0.57); pm.map.needsUpdate = true; pm.normalMap = null; }
  const paper = part(pg, pm, 'paper', false);
  paper.position.set(-0.08, H + 0.0048, 0.06);
  grp.add(paper);
  // 笔：笔毫蘸了墨，竹管，顶上一个小挂环。原点在笔尖，+y 沿笔杆
  const brush = new THREE.Group();
  brush.name = 'brush';
  const ink = new THREE.Color(0x0b0a0a), hair = new THREE.Color(0x5a4a3a);
  const hairG = colorize(turn(spl([[0.0003, 0], [0.0024, 0.008], [0.0052, 0.02], [0.0058, 0.03], [0.0046, 0.04]], 10), sg(q, 12)), (_x, y, _z, _nx, _ny, _nz, o) => {
    const t = clamp((y - 0.014) / 0.02); o[0] = ink.r + (hair.r - ink.r) * t; o[1] = ink.g + (hair.g - ink.g) * t; o[2] = ink.b + (hair.b - ink.b) * t;
  });
  brush.add(part(dyed([
    [hairG, 0xffffff],
    [turn(prof([[0.0049, 0.038], [0.0052, 0.04], [0.0052, 0.05]], [[0.0052, 0.05], [0.0044, 0.052], [0.0042, 0.225]], [[0.0042, 0.225], [0.0046, 0.227], [0.0046, 0.233], [0.001, 0.235]]), sg(q, 10)), 0xb39552],
    [ring(0.006, 0.0008, 10, 4).rotateX(Math.PI / 2).translate(0, 0.241, 0), 0x7a6a4a],
  ]), pmats(mats, q).tool, 'brushMesh'));
  brush.position.set(rx - 0.075, H + 0.021, rz + 0.012);
  brush.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.975, 0.12, -0.16).normalize());
  grp.add(brush);
  grp.userData = { top: H, paper, brush, flame: fl, sheet: { w: 0.56, h: 0.34 } };
  return grp;
}
const inkM = new WeakMap<Mats, THREE.Material>();
function inkstoneMat(mats: Mats): THREE.Material {
  let m = inkM.get(mats);
  if (!m) { m = variant(mats.stone, { color: 0x24252a, roughness: 0.5 }); inkM.set(mats, m); }
  return m;
}

const emberM = new WeakMap<Mats, THREE.MeshStandardMaterial>();
/** 茶寮的一套：矮几 0.9 × 0.5、高 0.32 */
export function teaSet(mats: Mats, q: Quality): THREE.Group {
  const grp = new THREE.Group(), T = table(mats, q), b = new Builder(), H = 0.32;
  grp.name = 'teaSet';
  lowTable(b, 0.9, 0.5, H, 'walnut');
  let ember = emberM.get(mats);
  if (!ember) { ember = enhance(new THREE.MeshStandardMaterial({ color: 0x1a0d08, emissive: 0xff5a1c, emissiveIntensity: 1.5, roughness: 1, vertexColors: true })); emberM.set(mats, ember); }
  // 红泥小炉：前面开一个风口，看得见里面的炭火
  const sx = -0.24, sz = 0.0, sr = 0.085, sh = 0.13, w = 0.95;
  b.push(M.t(sx, H, sz));
  b.add('clay', turn(prof(spl([[0.001, 0], [sr * 0.86, 0], [sr * 0.92, 0.006], [sr * 0.95, 0.024]], 6)), sg(q, 32)));
  b.add('clay', turn([[sr * 0.95, 0.024], [sr * 1.0, 0.05], [sr * 1.0, 0.078]], sg(q, 28), { phi0: w / 2, arc: Math.PI * 2 - w }));
  b.add('clay', turn(prof(spl([[sr * 1.0, 0.078], [sr * 0.98, 0.1], [sr * 0.92, 0.118], [sr * 0.96, sh]], 6), [[sr * 0.96, sh], [sr * 0.9, sh + 0.002], [sr * 0.8, sh - 0.004], [sr * 0.82, 0.1]]), sg(q, 32)));
  // 内壁（暗）与炭
  b.add('clay', tint(turn([[sr * 0.82, 0.1], [sr * 0.86, 0.026], [0.001, 0.022]], sg(q, 24)), 0.25));
  b.add('ember', disc(sr * 0.84, 0.03, sg(q, 16), 0.012));
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3, r = i < 5 ? 0.04 : 0; b.add('ember', tint(blob(6, 5, (v) => { v.set(v.x * 0.018, v.y * 0.012 + 0.046, v.z * 0.024); }).applyMatrix4(M.mul(M.ry(a), M.t(0, 0, r))), i % 2 ? 0.25 : 1)); }
  for (let i = 0; i < 3; i++) b.add('clay', blob(6, 5, (v) => { v.set(v.x * 0.012, v.y * 0.008 + sh + 0.004, v.z * 0.014); }).applyMatrix4(M.mul(M.ry((i * Math.PI * 2) / 3 + 0.5), M.t(0, 0, sr * 0.9))));
  b.pop();
  // 茶盏的托、茶罐、茶则、水盂
  const cx = 0.2, cz = 0.07;
  b.push(M.t(cx, H, cz));
  b.add('lacquer', turn(prof(spl([[0.001, 0.003], [0.03, 0.003], [0.034, 0], [0.038, 0.004], [0.04, 0.012], [0.07, 0.018], [0.082, 0.024]], 12), [[0.082, 0.024], [0.08, 0.027], [0.068, 0.022], [0.044, 0.019]], [[0.044, 0.019], [0.043, 0.03], [0.039, 0.031], [0.037, 0.02], [0.001, 0.018]]), sg(q, 32), { tile: 0.7 }));
  b.pop();
  b.push(M.t(0.34, H, -0.14));
  b.add('blackGlaze', turn(prof(spl([[0.001, 0], [0.03, 0], [0.036, 0.008], [0.038, 0.04], [0.033, 0.058], [0.026, 0.064]], 12), [[0.026, 0.064], [0.027, 0.066], [0.03, 0.066]], spl([[0.03, 0.066], [0.031, 0.074], [0.02, 0.082], [0.008, 0.084], [0.007, 0.09], [0.001, 0.092]], 8)), sg(q, 24)));
  b.pop();
  // 茶则：半片竹
  const rows: THREE.Vector3[][] = [];
  for (let i = 0; i <= 6; i++) { const row: THREE.Vector3[] = [], t = i / 6; for (let j = 0; j <= 6; j++) { const a = (-0.5 + j / 6) * 2.4, r = 0.017 * (1 - 0.35 * t * t); row.push(V(-0.08 + 0.16 * t, r - Math.cos(a) * r + 0.0012, Math.sin(a) * r)); } rows.push(row); }
  b.add('bamboo', grid(rows, (i, j) => [i * 0.027, j * 0.005], true).applyMatrix4(M.mul(M.t(0.1, H, -0.17), M.ry(0.35))));
  b.add('bamboo', tint(grid(rows, (i, j) => [i * 0.027, j * 0.005]).applyMatrix4(M.mul(M.t(0.1, H - 0.0006, -0.17), M.ry(0.35))), 0.8));
  b.push(M.t(-0.02, H, -0.15));
  b.add('celadon', turn(prof(spl([[0.001, 0.003], [0.03, 0.003], [0.036, 0], [0.04, 0.004], [0.062, 0.024], [0.074, 0.05]], 12), [[0.074, 0.05], [0.072, 0.052], [0.058, 0.026], [0.03, 0.01], [0.001, 0.009]]), sg(q, 28)));
  b.add('water', disc(0.066, 0.04, sg(q, 20)));
  b.pop();
  grp.add(b.build(new Proxy(T, { get: (t, k: string) => (k === 'ember' ? ember! : t[k]) }), { name: 'teaSetMesh', noCast: ['water', 'ember'] }));
  // 盏：斗笠形的青瓷盏，里面有茶汤。单独一件
  const cup = new THREE.Group(), cb = new Builder();
  cup.name = 'cup';
  cb.add('celadon', turn(prof(spl([[0.001, 0.003], [0.015, 0.003], [0.018, 0], [0.02, 0.004], [0.022, 0.01], [0.045, 0.034], [0.06, 0.047]], 12), [[0.06, 0.047], [0.0585, 0.0485], [0.043, 0.032], [0.02, 0.013], [0.001, 0.011]]), sg(q, 32)));
  cb.add('tea', disc(0.049, 0.038, sg(q, 20)));
  const tea = enhance(new THREE.MeshStandardMaterial({ color: 0x8c7a2c, roughness: 0.05, transparent: true, opacity: 0.82 }));
  cup.add(cb.build(new Proxy(T, { get: (t, k: string) => (k === 'tea' ? tea : t[k]) }), { name: 'cupMesh', noCast: ['tea'] }));
  cup.position.set(cx, H + 0.031, cz);
  grp.add(cup);
  // 铁壶：扁圆的身、盖、短嘴、提梁。单独一件，原点在提梁握处
  const kettle = new THREE.Group(), kb = new Builder(), kr = 0.078, kh = 0.092, hy = 0.19;
  kettle.name = 'kettle';
  kb.push(M.t(0, -hy, 0));
  kb.add('iron', turn(prof(
    spl([[0.001, 0], [kr * 0.6, 0], [kr * 0.72, 0.006], [kr * 0.98, 0.034], [kr, 0.052], [kr * 0.86, 0.076], [kr * 0.58, kh - 0.004], [kr * 0.52, kh]], 20),
    [[kr * 0.52, kh], [kr * 0.5, kh + 0.004], [kr * 0.46, kh + 0.004]],
    spl([[kr * 0.46, kh + 0.004], [kr * 0.4, kh + 0.012], [kr * 0.2, kh + 0.018], [0.008, kh + 0.019], [0.006, kh + 0.026], [0.011, kh + 0.032], [0.006, kh + 0.038], [0.001, kh + 0.039]], 12),
  ), sg(q, 32), { tile: 0.3 }));
  // 壶嘴：朝 +x，略上扬
  const sp = curve3([[kr * 0.86, 0.05, 0], [kr * 1.2, 0.058, 0], [kr * 1.42, 0.078, 0], [kr * 1.55, 0.098, 0]], 8);
  kb.add('iron', tube(sp, (t) => 0.014 - 0.007 * t, sg(q, 10)));
  // 提梁：两耳之间一道拱
  for (const s of [-1, 1]) kb.add('iron', blob(8, 6, (v) => { v.set(v.x * 0.008, v.y * 0.012 + kh - 0.004, v.z * 0.012 + s * kr * 0.62); }));
  kb.add('iron', tube(curve3([[0, kh - 0.004, -kr * 0.62], [0, kh + 0.05, -kr * 0.6], [0, hy - 0.005, -kr * 0.25], [0, hy, 0], [0, hy - 0.005, kr * 0.25], [0, kh + 0.05, kr * 0.6], [0, kh - 0.004, kr * 0.62]], 20), 0.0048, 8));
  kb.pop();
  kettle.add(kb.build(T, { name: 'kettleMesh' }));
  kettle.position.set(sx, H + sh + 0.008 + hy, sz);
  grp.add(kettle);
  const spoutLocal = new THREE.Vector3(kr * 1.55, 0.098 - hy, 0);
  grp.userData = {
    kettle, spout: spoutLocal, cup, cupTop: new THREE.Vector3(cx, H + 0.031 + 0.047, cz),
    steam: spoutLocal.clone().add(kettle.position), ember, top: H, stoveTop: new THREE.Vector3(sx, H + sh + 0.008, sz),
  };
  return grp;
}
void sphere; void cylUp; void pmats;
