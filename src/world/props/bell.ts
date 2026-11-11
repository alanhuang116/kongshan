/**
 * 钟楼与鼓楼里的两件：
 *   bigBell —— 梵钟：通高 2.1（连钮）、口径 1.45。钟身略上收，平口厚唇；袈裟纹（横带、纵带）把钟面分成几区，
 *              上区每面三排乳钉，中带正前、正后各一枚莲花撞座；顶上蒲牢钮（一道拱起的龙身），铁环吊着。原点在钮顶。
 *   bellLog —— 撞木：两根绳吊着的一段圆木，原点在两绳上端的中点；整组绕 x 轴摆就是撞钟。
 *   drum    —— 大鼓：朱漆鼓身、两面蒙皮、两圈泡钉，横架在黑漆鼓架上。
 */
import * as THREE from 'three';
import { M, V, colorize, extrude, lathe4, shade, sphere, sweep, tint } from '../core/geo';
import type { Mats } from '../core/mats';
import { clamp } from '../core/rng';
import type { Quality } from '../core/World';
import { Builder, blob, curve3, disc, dyed, finish, type P2, part, pmats, prof, rib, ring, sg, spl, table, tube, turn } from './kit';

const BELL = { H: 2.1, body: 1.74, R: 0.705 };
/** 钟身外壁在高度 y（自钟口起）处的半径 */
function bellR(y: number): number {
  if (y <= 1.35) return BELL.R - 0.105 * Math.pow(y / 1.35, 1.25);
  const t = (y - 1.35) / (BELL.body - 1.35);
  return 0.6 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.1))) * (1 - 0.06 * t) + 0.0005;
}

export function bigBell(mats: Mats, q: Quality): THREE.Group {
  const b = new Builder(), n = sg(q, 60), Hb = BELL.body;
  // 外壁：厚唇、几道横带（各两条弦纹），肩部圆收到顶
  const band = (y: number): P2[] => [...rib(bellR(y - 0.022), y - 0.022, 0.02, 0.011), ...rib(bellR(y + 0.022), y + 0.022, 0.02, 0.011)];
  const wall = (y0: number, y1: number, k = 6): P2[] => { const o: P2[] = []; for (let i = 0; i <= k; i++) { const y = y0 + ((y1 - y0) * i) / k; o.push([bellR(y), y]); } return o; };
  const outer: P2[] = prof(
    [[0.655, 0.004], [0.662, 0], [0.716, 0], [0.727, 0.008]],
    [[0.727, 0.008], [0.727, 0.085], [0.72, 0.098], [bellR(0.11), 0.11]],
    wall(0.11, 0.165, 2), band(0.2), wall(0.236, 0.404, 3), band(0.44), wall(0.476, 0.484, 1), band(0.52), wall(0.556, 0.764, 4), band(0.8), wall(0.836, 1.204, 6), band(1.24), wall(1.276, 1.34, 2),
    wall(1.36, Hb, 16),
  );
  b.add('bronze', shade(turn(outer, n, { tile: 0.8 }), (_x, y) => 0.8 + 0.2 * clamp((y + 0.2) / 0.9)));
  // 内壁（朝里）
  b.add('bronze', tint(turn(spl([[0.001, Hb - 0.07], [0.3, Hb - 0.11], [0.5, 1.5], [0.56, 1.2], [0.625, 0.5], [0.652, 0.1], [0.655, 0.004]], 18), sg(q, 48), { tile: 0.8 }), 0.42));
  // 纵带：前后左右四道，各两条棱
  for (let k = 0; k < 4; k++) {
    const az = (k * Math.PI) / 2, rad = new THREE.Vector3(Math.sin(az), 0, Math.cos(az));
    for (const off of [-0.052, 0.052]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 14; i++) {
        const y = 0.225 + ((1.215 - 0.225) * i) / 14, r = bellR(y) - 0.002, a = az + off / r;
        pts.push(V(Math.sin(a) * r, y, Math.cos(a) * r));
      }
      b.add('bronze', sweep(pts, [[-0.014, 0], [0.014, 0], [0.01, 0.01], [0.004, 0.014], [-0.004, 0.014], [-0.01, 0.01]], { up: rad, caps: false }));
    }
  }
  // 乳钉：四面各三排四列
  const nip = () => turn([[0.03, 0], [0.03, 0.005], [0.02, 0.012], [0.016, 0.026], [0.009, 0.036], [0.001, 0.039]], sg(q, 9)).rotateX(Math.PI / 2);
  for (let k = 0; k < 4; k++) for (const row of [0.9, 1.0, 1.1]) for (const c of [-0.36, -0.13, 0.13, 0.36]) {
    const az = Math.PI / 4 + (k * Math.PI) / 2 + c, r = bellR(row), slope = Math.atan((bellR(row + 0.05) - bellR(row - 0.05)) / 0.1);
    b.inst('bellNip', 'bronze', nip, M.mul(M.ry(az), M.t(0, row, r - 0.003), M.rx(slope)));
  }
  // 撞座：八瓣莲，前后各一
  const seatY = 0.48, seatR = bellR(seatY);
  for (const az of [0, Math.PI]) {
    b.push(M.mul(M.ry(az), M.t(0, seatY, seatR - 0.006), M.rx(Math.atan((bellR(seatY + 0.05) - bellR(seatY - 0.05)) / 0.1))));
    b.add('bronze', turn(prof([[0.132, 0], [0.132, 0.01], [0.124, 0.016]], [[0.124, 0.016], [0.058, 0.016]], spl([[0.058, 0.016], [0.056, 0.03], [0.04, 0.04], [0.001, 0.043]], 6)), sg(q, 32)).rotateX(Math.PI / 2));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.add('bronze', blob(10, 8, (v) => { v.set(v.x * 0.03, v.y * (0.036 + 0.008 * Math.max(0, v.y)), v.z * 0.012 + 0.016); }).applyMatrix4(M.mul(M.rz(a), M.t(0, 0.09, 0))));
    }
    for (let i = 0; i < 7; i++) { const a = (i / 6) * Math.PI * 2, rr = i === 6 ? 0 : 0.026; b.add('bronze', sphere(0.007, 6, 5).translate(Math.cos(a) * rr, Math.sin(a) * rr, 0.043)); }
    b.pop();
  }
  // 蒲牢钮：一道拱起的龙身，两头粗、背上一排脊
  const arch = curve3([[-0.2, Hb - 0.05, 0], [-0.19, Hb + 0.1, 0], [-0.12, Hb + 0.24, 0], [0, Hb + 0.295, 0], [0.12, Hb + 0.24, 0], [0.19, Hb + 0.1, 0], [0.2, Hb - 0.05, 0]], 28);
  b.add('bronze', tube(arch, (t) => 0.062 + 0.03 * Math.pow(Math.abs(t - 0.5) * 2, 2.2), sg(q, 14)));
  for (let i = 3; i <= 25; i += 2) {
    const p = arch[i], t = i / 28, rr = 0.062 + 0.03 * Math.pow(Math.abs(t - 0.5) * 2, 2.2);
    const out = new THREE.Vector3(p.x, p.y - (Hb + 0.02), 0).normalize();
    b.add('bronze', blob(6, 5, (v) => { v.set(v.x * 0.014, v.y * 0.028 + 0.012, v.z * 0.02); }).applyMatrix4(M.mul(M.t(p.x + out.x * rr, p.y + out.y * rr, 0), M.rz(Math.atan2(-out.x, out.y)))));
  }
  for (const s of [-1, 1]) b.add('bronze', blob(10, 8, (v) => { v.set(v.x * 0.085, v.y * 0.06, v.z * 0.1); }).translate(s * 0.2, Hb - 0.035, 0));
  // 铁环与吊钩：穿过钮下，往上挂到梁上
  b.add('ironPlain', ring(0.115, 0.022, sg(q, 28), 8).rotateZ(Math.PI / 2).translate(0, Hb + 0.326, 0));
  b.add('ironPlain', tube([V(0, Hb + 0.45, 0), V(0, Hb + 0.62, 0)], 0.02, 8));
  const top = Hb + 0.36;
  const g = finish(b, mats, q, 'bigBell');
  // 上面的零件都是以钟口为 y=0 搭的；整体下移，让钮顶落在原点
  for (const c of g.children) { c.position.y = -top; }
  g.userData = { strike: new THREE.Vector3(0, seatY - top, seatR + 0.036), radius: seatR, height: top, mouthY: -top, mouthR: 0.727, hook: 0.26 };
  return g;
}

/** 撞木：两根绳吊着的圆木，沿 z 横着，撞击端朝 −z。原点在两根吊绳上端的中点 */
export function bellLog(mats: Mats, q: Quality, ropeLen = 1.6): THREE.Group {
  const b = new Builder(), L = 2.3, R = 0.095, yc = -(ropeLen + R + 0.012), n = sg(q, 20);
  // 木：一头略粗；端面一圈圈年轮靠贴图，撞击端磨得发亮
  const pr: P2[] = prof([[0.001, -L / 2 - 0.012], [R * 0.6, -L / 2 - 0.008], [R * 0.93, -L / 2 + 0.006], [R, -L / 2 + 0.03]], [[R, -L / 2 + 0.03], [R * 0.985, 0], [R * 0.96, L / 2 - 0.02], [R * 0.9, L / 2 - 0.004], [0.001, L / 2]]);
  b.add('oldWood', shade(turn(pr, n).rotateX(Math.PI / 2).translate(0, yc, 0), (_x, _y, z) => (z < -L / 2 + 0.04 ? 1.5 : 1)));
  // 铜箍三道、尾端铁环
  for (const z of [-L / 2 + 0.08, -L / 2 + 0.2, L / 2 - 0.12]) b.add('bronze', turn([[R + 0.001, -0.024], [R + 0.008, -0.02], [R + 0.008, 0.02], [R + 0.001, 0.024]], n).rotateX(Math.PI / 2).translate(0, yc, z));
  // 吊绳：绕木一圈，往上到梁
  for (const z of [-0.62, 0.62]) {
    b.add('rope', ring(R + 0.011, 0.011, n, 8).rotateX(Math.PI / 2).translate(0, yc, z));
    b.add('rope', tube([V(0, yc + R + 0.006, z), V(0, -0.4, z), V(0, 0, z)], 0.011, 8));
    b.add('ironPlain', ring(0.03, 0.007, 12, 6).rotateX(Math.PI / 2).translate(0, 0.024, z));
  }
  // 拉绳：从尾端垂下，末了一个结
  const pz = L / 2 - 0.12, pend = V(0.0, yc - 1.02, pz + 0.05);
  b.add('ironPlain', ring(0.026, 0.006, 12, 6).rotateZ(Math.PI / 2).translate(0, yc - R - 0.026, pz));
  b.add('rope', tube(curve3([[0, yc - R - 0.04, pz], [0.004, yc - 0.45, pz + 0.02], [0, yc - 0.8, pz + 0.045], [pend.x, pend.y, pend.z]], 10), 0.009, 7));
  b.add('rope', sphere(0.022, 8, 6).scale(1, 1.3, 1).translate(pend.x, pend.y - 0.01, pend.z));
  b.add('rope', turn([[0.012, -0.11], [0.017, -0.06], [0.01, 0]], 8).translate(pend.x, pend.y - 0.03, pend.z));
  const g = finish(b, mats, q, 'bellLog');
  g.userData = { head: new THREE.Vector3(0, yc, -L / 2 - 0.012), pull: pend.clone().add(V(0, -0.1, 0)), length: L, radius: R };
  return g;
}

/** 大鼓：鼓身径 1.5、长 1.25，朱漆；横架在黑漆鼓架上，鼓心离地 1.75，鼓面朝 ±z */
export function drum(mats: Mats, q: Quality): THREE.Group {
  const grp = new THREE.Group(), T = table(mats, q), b = new Builder();
  grp.name = 'drum';
  const Lh = 0.625, cy = 1.75, n = sg(q, 64);
  const rr = (a: number) => 0.62 + 0.13 * Math.pow(Math.cos((Math.PI * a) / (Lh * 2)), 0.85);
  const pr: P2[] = [];
  for (let i = 0; i <= 20; i++) { const a = -Lh + (Lh * 2 * i) / 20; pr.push([rr(a), a]); }
  b.push(M.mul(M.t(0, cy, 0), M.rx(Math.PI / 2)));
  b.add('lacquerRed', shade(turn(pr, n, { tile: 0.7 }), (x, _y, z) => 0.82 + 0.18 * clamp(0.5 - z / 1.5 + x * 0)));
  // 蒙皮：包过鼓边的一圈，上面两排泡钉
  for (const s of [1, -1]) {
    const wrap: P2[] = [[rr(Lh) + 0.004, Lh - 0.085], [rr(Lh - 0.04) + 0.0055, Lh - 0.04], [rr(Lh) + 0.005, Lh - 0.006], [rr(Lh) - 0.004, Lh + 0.003]];
    b.add('hide', turn(s > 0 ? wrap : wrap.map(([r, y]) => [r, -y] as P2).reverse(), n));
    for (const [d, off] of [[0.03, 0], [0.066, 0.5]] as Array<[number, number]>) {
      const cnt = q.tier === 'low' ? 30 : 48;
      for (let i = 0; i < cnt; i++) {
        const az = ((i + off) / cnt) * Math.PI * 2, a = s * (Lh - d);
        b.inst('drumStud', 'gilt', () => turn([[0.016, 0], [0.014, 0.005], [0.007, 0.0105], [0.001, 0.012]], 6).rotateX(Math.PI / 2), M.mul(M.ry(az), M.t(0, a, rr(a) + 0.005)));
      }
    }
    if (s < 0) b.add('hide', drumSkin(q).rotateX(Math.PI).translate(0, -Lh - 0.003, 0));
  }
  // 铜环：两侧各一，带座
  for (const s of [1, -1]) {
    b.add('brass', turn(spl([[0.05, 0], [0.048, 0.006], [0.03, 0.012], [0.02, 0.026], [0.001, 0.03]], 6), sg(q, 16)).rotateX(Math.PI / 2).applyMatrix4(M.mul(M.ry((s * Math.PI) / 2), M.t(0, 0, rr(0) - 0.002))));
    b.add('brass', ring(0.06, 0.009, sg(q, 20), 8).rotateZ(Math.PI / 2).translate(s * (rr(0) + 0.016), 0, 0.058));
  }
  b.pop();
  // 鼓架：四柱、两道托着鼓腹的弧形托木、地栿、横枨
  const px = 0.6, pz = 0.4, ph = 1.3;
  for (const sz of [1, -1]) {
    // 托木：上沿是合着鼓腹的一道弧
    const s = new THREE.Shape(), R0 = rr(sz * pz) + 0.012, half = 0.66;
    const yAt = (x: number) => cy - Math.sqrt(Math.max(0, R0 * R0 - x * x));
    s.moveTo(-half, 0.94); s.lineTo(half, 0.94); s.lineTo(half, 1.26); s.lineTo(0.56, 1.26);
    for (let i = 0; i <= 24; i++) { const x = 0.56 - (1.12 * i) / 24; s.lineTo(x, Math.min(1.26, yAt(x))); }
    s.lineTo(-half, 1.26); s.closePath();
    b.add('lacquer', extrude(s, 0.07, 'x', 4, 0.006).translate(0, 0, sz * pz));
    b.add('lacquer', extrude(new THREE.Shape([new THREE.Vector2(-half, 0.42), new THREE.Vector2(half, 0.42), new THREE.Vector2(half, 0.52), new THREE.Vector2(-half, 0.52)]), 0.05, 'x', 2, 0.005).translate(0, 0, sz * pz));
  }
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      b.add('lacquer', shade(lathe4([[0.05, 0], [0.05, ph - 0.02], [0.056, ph], [0.056, ph + 0.02], [0.035, ph + 0.04], [0.04, ph + 0.075], [0.028, ph + 0.11], [0.001, ph + 0.125]]).translate(sx * px, 0.06, sz * pz), (_x, y) => 0.85 + 0.15 * clamp(y / 0.6)));
    }
    // 地栿：两头卷起
    const f = new THREE.Shape(), fl = 0.66;
    f.moveTo(-fl, 0); f.lineTo(fl, 0); f.quadraticCurveTo(fl + 0.07, 0.01, fl + 0.06, 0.09); f.quadraticCurveTo(fl - 0.02, 0.07, fl - 0.1, 0.1); f.lineTo(-fl + 0.1, 0.1); f.quadraticCurveTo(-fl + 0.02, 0.07, -fl - 0.06, 0.09); f.quadraticCurveTo(-fl - 0.07, 0.01, -fl, 0);
    b.add('lacquer', extrude(f, 0.13, 'x', 6, 0.006).rotateY(Math.PI / 2).translate(sx * px, 0, 0));
    b.add('lacquer', extrude(new THREE.Shape([new THREE.Vector2(-pz, 0.72), new THREE.Vector2(pz, 0.72), new THREE.Vector2(pz, 0.8), new THREE.Vector2(-pz, 0.8)]), 0.045, 'x', 2, 0.005).rotateY(Math.PI / 2).translate(sx * px, 0, 0));
  }
  grp.add(b.build(T, { name: 'drumBody' }));
  // 朝前的鼓面：单独一件（敲的时候主代理让它颤）
  const skin = part(drumSkin(q), pmats(mats, q).hide, 'drumSkin');
  skin.position.set(0, cy, Lh + 0.003);
  skin.rotation.x = Math.PI / 2;
  grp.add(skin);
  // 两支鼓槌：靠在前面的横枨上
  const sticks: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const st = new THREE.Group();
    st.name = 'drumStick';
    st.add(part(dyed([
      [turn(spl([[0.001, 0], [0.012, 0.003], [0.0135, 0.02], [0.0115, 0.1], [0.0105, 0.44]], 10), sg(q, 10)), 0x9a7d5c],
      [blob(sg(q, 12), sg(q, 10), (v) => { v.set(v.x * 0.03, v.y * 0.045 + 0.475, v.z * 0.03); }), 0x8a2a20],
      [ring(0.0125, 0.003, 12, 5).translate(0, 0.438, 0), 0xcfa94e],
    ]), pmats(mats, q).tool, 'drumStickMesh'));
    st.position.set(sx * 0.2, 0.012, pz + 0.31);
    st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(sx * -0.06, 0.52, -0.27).normalize());
    sticks.push(st); grp.add(st);
  }
  grp.userData = { skin, center: new THREE.Vector3(0, cy, Lh + 0.003), radius: 0.61, sticks };
  return grp;
}
/** 鼓面：一张绷紧的皮，中心敲得略深。朝 +y，中心在原点 */
function drumSkin(q: Quality) {
  const dk = [0.72, 0.6, 0.44];
  return colorize(disc(0.618, 0, sg(q, 48), 0, 6), (x, _y, z, _nx, _ny, _nz, o) => {
    const r = Math.hypot(x, z) / 0.618, k = Math.exp(-(r * r) / 0.09) * 0.55;
    o[0] = 1 - (1 - dk[0]) * k; o[1] = 1 - (1 - dk[1]) * k; o[2] = 1 - (1 - dk[2]) * k;
    const e = 0.9 + 0.1 * (1 - r * r); o[0] *= e; o[1] *= e; o[2] *= e;
  });
}
