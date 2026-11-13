/**
 * 草堂里的陈设：有书数架，《易》与《皇极经世》放在近手处，诗稿散在案上；有酒一瓮，有茶一炉，有琴一张而不常弹。
 *
 *   东间 —— 北墙两架书（线装书平放成摞，书根朝外；几卷轴、一只函套），窗下一张素木书案、一只方凳；
 *           案上：稿纸、两张诗稿、砚、墨、笔山上的笔、笔筒、一盏灯，手边一册合着的《周易》、一册摊开的《皇极经世》（页上一幅先天八卦小图）。
 *   明间 —— 正对着门的北墙上挂一轴先天图（六十四卦方圆图），下面一张窄条几，一只小香炉；西北角一瓮酒。
 *   西间 —— 靠北墙一张榻（席卷、木枕、叠着的被），榻上方一幅水墨小景；榻前矮琴几上一张琴；地上一领芦席、一只蒲团；近门处一只小泥炉、一把壶、两只盏。
 *
 * 坐标同 hall.ts：相对草堂正中，y=0 是院子地面，屋里地面在 y=fl。可拿的东西另成一件（c.part），原点在好拿的地方。
 */
import * as THREE from 'three';
import { M, box, boxUp, cyl, cylUp, grid, lathe, shade, tint, type Geo } from '../core/geo';
import { smooth } from '../core/rng';
import { SITE, YARD_Y } from '../site';
import { INK, blankUV, decal, dye, facing, flatRock, panel, pole, rnd, sbox, tube, v3, wobble, type Ctx, type Rand } from './kit';
import type { HallDims } from './hall';

const at = (g: Geo, x: number, y: number, z: number, ry = 0) => g.applyMatrix4(M.mul(M.t(x, y, z), M.ry(ry)));
/** 一块板：略有不平 */
const plank = (w: number, t: number, d: number, seed: number) => wobble(box(w, t, d), 0.0035, 2.2, seed, 40, 0.4);

/** 一摞线装书（书根朝 +z）：n 册，底在 y=0。返回摞的高 */
export function bookStack(out: { push(...gs: Geo[]): void }, R: Rand, x: number, y: number, z: number, n: number, ry = 0): number {
  let h = 0;
  const covers = [INK.indigo, [0.8, 0.74, 0.62], [0.72, 0.7, 0.66], INK.indigo, [0.84, 0.8, 0.7]] as Array<[number, number, number]>;
  const cv = R.pick(covers);
  for (let i = 0; i < n; i++) {
    const th = R.r(0.011, 0.021), w = R.r(0.165, 0.18), d = R.r(0.25, 0.265), tone = R.r(0.9, 1);
    const g = box(w, th, d);
    // 侧面是纸色，上下是书衣
    const cc = g.attributes.color as THREE.BufferAttribute, nn = g.attributes.normal as THREE.BufferAttribute;
    for (let k = 0; k < cc.count; k++) {
      const top = Math.abs(nn.getY(k)) > 0.5, p = top ? cv : INK.page, dn = top ? 1.25 : 0.9;
      cc.setXYZ(k, Math.pow(p[0], dn) * tone, Math.pow(p[1], dn) * tone, Math.pow(p[2], dn) * tone);
    }
    out.push(at(g, x + R.pm(0.006), y + h + th / 2, z + R.pm(0.008), ry + R.pm(0.05)));
    h += th + 0.0008;
  }
  return h;
}

/** 一件敞口的器皿：外轮廓自下而上、口沿、内壁自上而下。pts 是 [半径, 高] */
const pot = (pts: Array<[number, number]>, seg = 16) => lathe(pts, seg);

export function furnish(c: Ctx, dm: HallDims): void {
  const H = SITE.hall, I = SITE.inside, { W, D, wt, fl } = dm, xi = W / 2 - wt, zi = D / 2 - wt;
  const ox = H.x, oy = YARD_Y, oz = H.z, b = c.home, R = rnd(7301);
  const wp = (x: number, y: number, z: number) => v3(ox + x, oy + y, oz + z);
  const seg = (n: number) => (c.low ? Math.max(8, Math.round(n * 0.6)) : n);
  // 小物件、带字的面直接进当前的摊
  const obj = { push: (...gs: Geo[]) => { for (const g of gs) b.add('obj', g); } };
  const L = (g: Geo) => { b.add('label', g); return g; };

  // ———————————— 东间：书架两架 ————————————
  I.shelves.forEach((s, si) => {
    const w = 1.2, d = 0.3, h = 1.76, zc = -zi + d / 2 + 0.01, levels = [0.1, 0.5, 0.9, 1.3, 1.73];
    for (const e of [-1, 1]) b.add('wood', at(plank(0.034, h, d, 40 + si + e), s.x + e * (w / 2 - 0.017), fl + h / 2, zc));
    for (const [i, y] of levels.entries()) b.add('wood', at(plank(w - 0.07 + (i === 4 ? 0.1 : 0), 0.028, d + (i === 4 ? 0.02 : 0), 50 + si * 7 + i), s.x, fl + y, zc));
    // 背后两根斜撑（不封板）
    b.add('wood', pole(v3(s.x - w / 2 + 0.03, fl + 0.12, zc - d / 2 + 0.012), v3(s.x + w / 2 - 0.03, fl + 1.7, zc - d / 2 + 0.012), 0.012, 0.012, 4));
    // 书：每层三四摞，高矮不一；偶尔空一格放别的
    for (let lv = 0; lv < 4; lv++) {
      const y = fl + levels[lv] + 0.014, nst = 4;
      for (let k = 0; k < nst; k++) {
        const x = s.x - w / 2 + 0.17 + k * 0.287 + R.pm(0.012), slot = si * 100 + lv * 10 + k;
        if (slot === 12 || slot === 133) {
          // 一堆卷轴：三二一地码着，轴头朝外
          for (const [dx, dy] of [[-0.05, 0], [0, 0], [0.05, 0], [-0.025, 0.043], [0.025, 0.043], [0, 0.086]]) {
            obj.push(dye(at(cyl(0.023, 0.023, 0.27, 8).rotateX(Math.PI / 2), x + dx, y + 0.023 + dy, zc + R.pm(0.01)), INK.page, R.r(0.8, 1.3)));
            obj.push(dye(at(cyl(0.008, 0.008, 0.31, 6).rotateX(Math.PI / 2), x + dx, y + 0.023 + dy, zc), INK.darkwood, 2));
          }
        } else if (slot === 101) {
          // 蓝布函套
          obj.push(dye(at(wobble(box(0.2, 0.1, 0.27), 0.003, 3, 5), x, y + 0.05, zc), INK.indigo, 1.7));
          obj.push(dye(at(box(0.03, 0.07, 0.004), x - 0.05, y + 0.05, zc + 0.136), INK.page, 1));
        } else if (slot === 30) {
          // 一只小陶罐
          obj.push(dye(at(pot([[0.001, 0], [0.05, 0], [0.075, 0.05], [0.07, 0.11], [0.04, 0.14], [0.045, 0.155], [0.035, 0.15], [0.001, 0.148]], seg(14)), x, y, zc), INK.glaze, 1.5));
        } else if (slot !== 2 && slot !== 123) bookStack(obj, R, x, y, zc + 0.005, 3 + R.i(lv === 3 ? 4 : 8));
      }
    }
    // 架顶：一只葫芦、一卷纸
    if (si === 0) {
      obj.push(dye(at(pot([[0.001, 0], [0.05, 0.01], [0.075, 0.06], [0.06, 0.115], [0.03, 0.14], [0.045, 0.18], [0.035, 0.215], [0.012, 0.235], [0.008, 0.27], [0.001, 0.272]], seg(14)), s.x - 0.3, fl + h, zc), INK.gourd, 1.25));
    } else obj.push(dye(at(cyl(0.035, 0.035, 0.42, 10).rotateZ(Math.PI / 2), s.x + 0.1, fl + h + 0.036, zc + 0.02, 0.12), INK.page, 1));
    c.solid({ id: `草堂·书架${si + 1}`, kind: 'rect', x: ox + s.x, z: oz + zc, w, d });
  });
  c.anchor('shelf', ox + (I.shelves[0].x + I.shelves[1].x) / 2, oy + fl + 1.0, oz - zi + 0.34, 0);

  // ———————————— 东间：书案、方凳 ————————————
  {
    const dx = I.desk.x, dz = I.desk.z, dw = 1.5, dd = 0.66, T = fl + 0.74;
    b.add('wood', at(plank(dw, 0.04, dd, 61), dx, T - 0.02, dz));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', at(wobble(boxUp(0.058, 0.7, 0.058, 'y'), 0.003, 3, 62 + sx + sz * 3), dx + sx * (dw / 2 - 0.09), fl, dz + sz * (dd / 2 - 0.07)));
    for (const sz of [-1, 1]) b.add('wood', at(box(dw - 0.2, 0.075, 0.022, 'x'), dx, T - 0.08, dz + sz * (dd / 2 - 0.07)));
    for (const sx of [-1, 1]) {
      b.add('wood', at(box(0.022, 0.075, dd - 0.16, 'z'), dx + sx * (dw / 2 - 0.09), T - 0.08, dz));
      b.add('wood', at(box(0.03, 0.035, dd - 0.16, 'z'), dx + sx * (dw / 2 - 0.09), fl + 0.16, dz));
    }
    b.add('wood', at(box(dw - 0.2, 0.035, 0.03, 'x'), dx, fl + 0.16, dz));
    c.solid({ id: '草堂·书案', kind: 'rect', x: ox + dx, z: oz + dz, w: dw, d: dd, top: oy + T });
    // 方凳（案北，人坐在这里面朝南窗）
    const sx0 = dx, sz0 = dz - dd / 2 - 0.34;
    b.add('wood', at(plank(0.36, 0.035, 0.3, 66), sx0, fl + 0.44 - 0.0175, sz0));
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) b.add('wood', pole(v3(sx0 + ex * 0.15, fl, sz0 + ez * 0.125), v3(sx0 + ex * 0.13, fl + 0.425, sz0 + ez * 0.105), 0.022, 0.02, 6));
    for (const ez of [-1, 1]) b.add('wood', at(box(0.26, 0.025, 0.02, 'x'), sx0, fl + 0.14, sz0 + ez * 0.118));
    c.solid({ id: '草堂·方凳', kind: 'rect', x: ox + sx0, z: oz + sz0, w: 0.36, d: 0.3, top: oy + fl + 0.44 });
    c.anchor('desk', ox + dx, oy + T, oz + dz, Math.PI);
    c.anchor('deskSeat', ox + sx0, oy + fl + 0.44, oz + sz0, 0);

    // —— 案上（人在北边，面朝南：纸的「上」朝南）——
    const Y = T + 0.001;
    // 稿纸一张（可拿），上头压一条镇尺
    const sheet = c.part('sheet', 'label', [dye(decal(0.26, 0.36, c.rect('sheet')), INK.white, 0.9)], wp(dx - 0.06, Y + 0.002, dz - 0.03), new THREE.Euler(0, Math.PI + 0.04, 0));
    sheet.userData = { w: 0.26, h: 0.36 };
    obj.push(dye(at(box(0.2, 0.014, 0.024), dx - 0.06, Y + 0.011, dz + 0.125, 0.04), INK.darkwood, 2.2));
    // 两张诗稿：斜放着，一张压着一张
    L(dye(at(decal(0.25, 0.35, c.rect('poem0')), dx - 0.36, Y + 0.0008, dz + 0.1, Math.PI + 0.46), INK.page, 0.8));
    L(dye(at(decal(0.25, 0.35, c.rect('poem1')), dx + 0.13, Y + 0.0014, dz + 0.16, Math.PI - 0.3), INK.page, 0.7));
    // 砚（可拿）：一方石砚，砚池里有墨；旁边一锭墨
    {
      const g: Geo[] = [dye(wobble(box(0.115, 0.024, 0.17).translate(0, 0.012, 0), 0.002, 4, 3), INK.slate, 1.5)];
      for (const [w, d, x, z] of [[0.115, 0.012, 0, 0.079], [0.115, 0.012, 0, -0.079], [0.012, 0.146, 0.0515, 0], [0.012, 0.146, -0.0515, 0]] as Array<[number, number, number, number]>) g.push(dye(box(w, 0.006, d).translate(x, 0.027, z), INK.slate, 1.5));
      g.push(dye(box(0.088, 0.002, 0.06).translate(0, 0.0252, 0.036), INK.ink, 3));
      c.part('inkstone', 'obj', g, wp(dx - 0.5, Y, dz - 0.13), new THREE.Euler(0, 0.1, 0));
      obj.push(dye(at(box(0.018, 0.012, 0.085), dx - 0.6, Y + 0.006, dz - 0.1, 0.5), INK.ink, 3.2));
    }
    // 笔山，笔一支搁在上面（可拿；原点在握处，+y 沿笔杆朝笔顶）
    {
      const rx = dx - 0.33, rz = dz - 0.21;
      const mt = new THREE.Shape();
      mt.moveTo(-0.05, 0); mt.lineTo(0.05, 0); mt.lineTo(0.05, 0.008); mt.quadraticCurveTo(0.04, 0.03, 0.03, 0.014); mt.quadraticCurveTo(0.018, 0.012, 0.01, 0.03);
      mt.quadraticCurveTo(0, 0.05, -0.012, 0.028); mt.quadraticCurveTo(-0.02, 0.012, -0.03, 0.016); mt.quadraticCurveTo(-0.04, 0.03, -0.05, 0.008); mt.closePath();
      const eg = new THREE.ExtrudeGeometry(mt, { depth: 0.02, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.01);
      obj.push(dye(at(blank(eg), rx, Y, rz, 0.2), INK.white, 1.1));
      const br: Geo[] = [dye(cyl(0.0048, 0.0052, 0.2, 6).translate(0, 0.03, 0), INK.bamboo, 1.3)];
      br.push(dye(lathe([[0.001, -0.117], [0.0035, -0.105], [0.0062, -0.085], [0.0055, -0.07], [0.0052, -0.068]], 6), INK.ink, 2.6));
      br.push(dye(cyl(0.0056, 0.0056, 0.012, 6).translate(0, -0.064, 0), INK.darkwood, 2));
      const brush = c.part('brush', 'obj', br, wp(rx + 0.02, Y + 0.036, rz - 0.005), new THREE.Euler(0, 0.2, Math.PI / 2 + 0.1));
      brush.userData = { tip: v3(0, -0.117, 0), top: v3(0, 0.13, 0) };
    }
    // 笔筒：一截竹筒，插着三支笔
    {
      const px = dx - 0.63, pz = dz + 0.2;
      obj.push(dye(at(pot([[0.001, 0], [0.045, 0], [0.047, 0.004], [0.046, 0.12], [0.04, 0.12], [0.04, 0.012], [0.001, 0.012]], seg(12)), px, Y, pz), INK.bamboo, 1.5));
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; obj.push(dye(pole(v3(px + Math.cos(a) * 0.015, Y + 0.012, pz + Math.sin(a) * 0.015), v3(px + Math.cos(a) * 0.036, Y + 0.2 + i * 0.012, pz + Math.sin(a) * 0.036), 0.0045, 0.0045, 5), INK.bamboo, 1.2)); }
    }
    // 《周易》一册（合着，可拿）：蓝布书衣，左上一条书签
    {
      const g: Geo[] = [], w = 0.17, d = 0.26, th = 0.02;
      const blk = box(w - 0.004, th - 0.003, d - 0.004);
      g.push(blankUV(dye(blk, INK.page, 0.9), c.blank));
      for (const s of [-1, 1]) g.push(blankUV(dye(box(w, 0.0016, d).translate(0, s * (th / 2 - 0.0008), 0), INK.indigo, 1.6), c.blank));
      // 订线的一边（书脑）在右手
      g.push(blankUV(dye(box(0.006, th, d).translate(w / 2 - 0.003, 0, 0), INK.indigo, 1.8), c.blank));
      g.push(dye(decal(0.032, 0.085, c.rect('yi')), INK.page, 0.6).translate(-w / 2 + 0.028, th / 2 + 0.0006, -d / 2 + 0.058));
      const bk = c.part('bookYi', 'label', g, wp(dx + 0.6, Y + th / 2, dz + 0.1), new THREE.Euler(0, Math.PI - 0.16, 0));
      bk.userData = { w, d, th, title: '周易' };
    }
    // 《皇极经世》一册（摊开，可拿）：两页微微拱起，左页一幅先天八卦
    {
      const w = 0.36, d = 0.27, g: Geo[] = [], r = c.rect('book'), nx = 12;
      const pts: THREE.Vector3[][] = [];
      for (let i = 0; i <= nx; i++) { const u = i / nx, x = (u - 0.5) * w, e = Math.abs(u - 0.5) * 2; pts.push([v3(x, 0.006 + 0.012 * Math.sin(Math.PI * Math.min(1, e * 1.15)) * (1 - 0.35 * e), d / 2), v3(x, 0.006 + 0.012 * Math.sin(Math.PI * Math.min(1, e * 1.15)) * (1 - 0.35 * e), -d / 2)]); }
      g.push(dye(facing(grid(pts, (i, j) => [r[0] + (i / nx) * (r[2] - r[0]), j === 0 ? r[1] : r[3]]), () => [0, 1, 0]), INK.page, 0.75));
      // 书身：两叠纸、底下的书衣
      for (const s of [-1, 1]) g.push(blankUV(dye(box(w / 2 - 0.004, 0.008, d - 0.004).translate(s * (w / 4), 0.004, 0), INK.page, 1.1), c.blank));
      g.push(blankUV(dye(box(w + 0.004, 0.0016, d + 0.002).translate(0, 0.0008, 0), INK.indigo, 1.6), c.blank));
      const bk = c.part('bookHuangji', 'label', g, wp(dx + 0.33, Y, dz - 0.02), new THREE.Euler(0, Math.PI + 0.07, 0));
      bk.userData = { w, d, title: '皇极经世' };
    }
    c.anchor('books', ox + dx + 0.46, oy + Y, oz + dz + 0.03, Math.PI);
    // 一盏灯：木灯檠上一只陶盏；灯芯处是「屋里的一盏灯」
    {
      const lx = dx + 0.64, lz = dz - 0.24;
      obj.push(dye(at(lathe([[0.001, 0], [0.05, 0], [0.052, 0.012], [0.014, 0.024], [0.011, 0.2], [0.03, 0.215], [0.001, 0.215]], seg(12)), lx, Y, lz), INK.darkwood, 1.8));
      obj.push(dye(at(pot([[0.001, 0.215], [0.03, 0.215], [0.05, 0.237], [0.047, 0.24], [0.028, 0.224], [0.001, 0.223]], seg(12)), lx, Y, lz), INK.clay, 1.4));
      c.anchor('lamp', ox + lx + 0.04, oy + Y + 0.25, oz + lz, 0);
    }
  }

  // ———————————— 明间：先天图一轴，条几，酒瓮 ————————————
  {
    const zw = -zi + 0.042, sw = 0.94, top = fl + 2.52, ph = 0.8, pw = 0.8, sl = 1.4, py = top - 0.36 - ph / 2;
    // 裱：上头天杆、下头地轴；画心居中偏上
    const mount = box(sw, sl, 0.004).translate(0, top - sl / 2, zw);
    obj.push(dye(mount, [0.9, 0.88, 0.8], 1.1));
    obj.push(dye(box(pw + 0.05, ph + 0.05, 0.002).translate(0, py, zw + 0.003), [0.78, 0.8, 0.8], 1.3));
    L(dye(panel(pw, ph, c.rect('xiantian')).translate(0, py, zw + 0.0055), INK.page, 0.7));
    obj.push(dye(cyl(0.011, 0.011, sw + 0.02, 6).rotateZ(Math.PI / 2).translate(0, top, zw + 0.008), INK.darkwood, 2));
    obj.push(dye(cyl(0.02, 0.02, sw + 0.1, 8).rotateZ(Math.PI / 2).translate(0, top - sl, zw + 0.018), INK.darkwood, 2));
    obj.push(dye(tube([v3(-0.3, top, zw + 0.01), v3(0, top + 0.13, zw + 0.004), v3(0.3, top, zw + 0.01)], 0.003, 4), INK.hemp, 1.4));
    c.anchor('scroll', ox, oy + py, oz + zw, 0);
    // 条几：一块长板、四条腿，上面一只小香炉、几册书
    const tx = 0.22, tz = -zi + 0.19, tw = 1.25, th = fl + 0.76;
    b.add('wood', at(plank(tw, 0.035, 0.3, 71), tx, th - 0.0175, tz));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', at(boxUp(0.045, 0.725, 0.045, 'y'), tx + sx * (tw / 2 - 0.1), fl, tz + sz * 0.1));
    for (const sx of [-1, 1]) b.add('wood', at(box(0.025, 0.03, 0.2, 'z'), tx + sx * (tw / 2 - 0.1), fl + 0.2, tz));
    b.add('wood', at(box(tw - 0.2, 0.05, 0.02, 'x'), tx, th - 0.07, tz + 0.1));
    // 香炉：三足小炉，插一炷香
    obj.push(dye(at(pot([[0.001, 0.02], [0.03, 0.02], [0.052, 0.04], [0.055, 0.065], [0.045, 0.078], [0.05, 0.086], [0.042, 0.084], [0.04, 0.07], [0.001, 0.068]], seg(14)), tx, th, tz), [0.6, 0.62, 0.56], 2));
    for (let i = 0; i < 3; i++) obj.push(dye(at(cylUp(0.006, 0.009, 0.03, 5), tx + Math.cos(i * 2.094 + 0.5) * 0.032, th, tz + Math.sin(i * 2.094 + 0.5) * 0.032), [0.6, 0.62, 0.56], 2));
    obj.push(dye(at(cylUp(0.0012, 0.0012, 0.15, 4), tx, th + 0.068, tz), INK.clay, 1.6));
    c.anchor('incense', ox + tx, oy + th + 0.218, oz + tz, 0);
    bookStack(obj, R, tx + 0.42, th, tz + 0.01, 3, 0.08);
    c.solid({ id: '草堂·条几', kind: 'rect', x: ox + tx, z: oz + tz, w: tw, d: 0.3, top: oy + th });

    // 酒瓮：大肚、小口，肩上一圈弦纹；口上斜盖着一块木盖，盖上一只酒盏；提子挂在口沿里
    const jx = I.jar.x, jz = I.jar.z, mouth = 0.74;
    const jar = pot([[0.001, 0], [0.15, 0], [0.17, 0.02], [0.25, 0.16], [0.305, 0.34], [0.3, 0.46], [0.25, 0.58], [0.17, 0.665], [0.142, 0.69], [0.15, 0.725], [0.165, 0.74], [0.15, 0.745], [0.128, 0.72], [0.128, 0.67], [0.2, 0.56], [0.22, 0.42], [0.001, 0.4]], seg(22));
    shade(jar, (x, y, z) => { const r = Math.hypot(x, z); return r < 0.14 && y > 0.35 && y < 0.6 ? 0.4 : y < 0.12 ? 1.25 : 1 - 0.08 * smooth(0.2, 0.6, y); });
    obj.push(dye(at(jar, jx, fl, jz), INK.glaze, 1.75));
    for (const y of [0.56, 0.6]) obj.push(dye(at(tube(ringPts(y > 0.58 ? 0.24 : 0.262, 16), 0.006, 4).translate(0, y, 0), jx, fl, jz), INK.glaze, 2.1));
    const lid = [dye(plank(0.36, 0.022, 0.36, 72), INK.wood, 1.5), dye(box(0.3, 0.03, 0.045).translate(0, 0.026, 0), INK.wood, 1.7)];
    // 把方板削成圆的：四角各切一刀（八边）
    obj.push(...lid.map((g) => at(clipOct(g, 0.18), jx - 0.13, fl + mouth + 0.012, jz - 0.03, 0.5)));
    c.anchor('jar', ox + jx, oy + fl + mouth, oz + jz, 0);
    const cup = c.part('wineCup', 'obj', [dye(pot([[0.001, 0], [0.018, 0], [0.02, 0.006], [0.036, 0.03], [0.038, 0.034], [0.034, 0.032], [0.016, 0.01], [0.001, 0.009]], seg(12)), INK.white, 1.2)], wp(jx - 0.2, fl + mouth + 0.05, jz - 0.02));
    cup.userData = { rim: 0.034 };
    // 酒提：竹筒做的小勺、一根长柄，柄头弯成钩挂在口沿上。原点在柄的握处
    {
      const g: Geo[] = [dye(pot([[0.001, -0.3], [0.026, -0.3], [0.027, -0.24], [0.023, -0.24], [0.023, -0.292], [0.001, -0.292]], seg(10)), INK.bamboo, 1.6)];
      g.push(dye(tube([v3(0.026, -0.27, 0), v3(0.028, -0.1, 0), v3(0.026, 0.02, 0), v3(0.04, 0.045, 0), v3(0.062, 0.03, 0), v3(0.064, 0.0, 0)], 0.005, 5, true), INK.bamboo, 1.5));
      const ld = c.part('ladle', 'obj', g, wp(jx + 0.082, fl + mouth + 0.012, jz + 0.07), new THREE.Euler(0, -0.7, 0));
      ld.userData = { bowl: v3(0, -0.24, 0) };
    }
    c.solid({ id: '草堂·酒瓮', kind: 'disc', x: ox + jx, z: oz + jz, r: 0.33, top: oy + fl + mouth });
  }

  // ———————————— 西间：榻、琴、席、茶炉 ————————————
  {
    // 榻：四腿一圈枨、五块面板；上面一领席，西头一卷席、东头一只木枕、一床叠着的被
    const kx = I.couch.x, kw = 1.8, kd = 0.68, kz = -zi + kd / 2 + 0.02, kh = fl + 0.42;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', at(wobble(boxUp(0.07, 0.39, 0.07, 'y'), 0.003, 3, 80 + sx + sz * 3), kx + sx * (kw / 2 - 0.06), fl, kz + sz * (kd / 2 - 0.05)));
    for (const sz of [-1, 1]) b.add('wood', at(box(kw - 0.1, 0.085, 0.035, 'x'), kx, kh - 0.075, kz + sz * (kd / 2 - 0.035)));
    for (const sx of [-1, 1]) b.add('wood', at(box(0.035, 0.085, kd - 0.08, 'z'), kx + sx * (kw / 2 - 0.045), kh - 0.075, kz));
    for (let i = 0; i < 5; i++) b.add('wood', at(tint(plank(kw, 0.03, kd / 5 - 0.006, 84 + i), R.r(0.9, 1.04)), kx, kh - 0.015, kz - kd / 2 + (i + 0.5) * (kd / 5)));
    b.add('thatch', at(tint(matGeo(1.1, 0.6, 85), 1.03, 1.02, 0.97), kx + 0.1, kh + 0.004, kz));
    const roll = tube([v3(0, 0, -0.3), v3(0, 0, 0.3)], 0.072, 12, true);
    b.add('thatch', at(tint(roll, 1.0, 0.99, 0.93), kx - kw / 2 + 0.13, kh + 0.075, kz));
    for (const z of [-0.18, 0.17]) obj.push(dye(at(tube(ringPts(0.075, 12), 0.005, 4).rotateX(Math.PI / 2), kx - kw / 2 + 0.13, kh + 0.075, kz + z), INK.hemp, 1.6));
    obj.push(dye(at(wobble(sbox(0.3, 0.085, 0.13, 0.1), 0.005, 5, 86), kx + kw / 2 - 0.2, kh + 0.05, kz - 0.18, 0.06), INK.wood, 1.9));
    obj.push(dye(at(wobble(sbox(0.46, 0.11, 0.36, 0.09), 0.016, 4, 87, 55), kx + kw / 2 - 0.3, kh + 0.06, kz + 0.1, -0.04), INK.indigo, 1.25));
    c.anchor('couch', ox + kx, oy + kh, oz + kz, 0);
    c.solid({ id: '草堂·榻', kind: 'rect', x: ox + kx, z: oz + kz, w: kw, d: kd, top: oy + kh });
    // 榻上方：一幅水墨小景
    const sy = fl + 2.5, zw = -zi + 0.042;
    obj.push(dye(box(0.44, 1.12, 0.004).translate(kx + 0.1, sy - 0.56, zw), [0.9, 0.88, 0.8], 1.1));
    L(dye(panel(0.33, 0.77, c.rect('scene')).translate(kx + 0.1, sy - 0.2 - 0.385, zw + 0.004), INK.page, 0.6));
    obj.push(dye(cyl(0.016, 0.016, 0.52, 8).rotateZ(Math.PI / 2).translate(kx + 0.1, sy - 1.12, zw + 0.014), INK.darkwood, 2));

    // 琴几：一块板、两块板足，矮矮的；人坐在南边的席上弹
    const qx = I.qin.x, qz = I.qin.z, qh = fl + 0.3;
    b.add('wood', at(plank(1.34, 0.03, 0.36, 88), qx, qh - 0.015, qz));
    for (const sx of [-1, 1]) b.add('wood', at(plank(0.03, 0.27, 0.3, 89 + sx), qx + sx * 0.5, fl + 0.135, qz));
    b.add('wood', at(box(1.0, 0.05, 0.022, 'x'), qx, fl + 0.14, qz));
    c.solid({ id: '草堂·琴几', kind: 'rect', x: ox + qx, z: oz + qz, w: 1.34, d: 0.36, top: oy + qh });
    // 琴（可拿；原点在琴底正中）：琴首在东（弹的人的右手），七弦、岳山、十三徽
    {
      const g: Geo[] = [], st: Array<[number, number]> = [[0.61, 0.092], [0.5, 0.094], [0.44, 0.079], [0.37, 0.1], [0.1, 0.093], [-0.14, 0.086], [-0.24, 0.074], [-0.33, 0.083], [-0.56, 0.072], [-0.61, 0.066]];
      const sec = (hw: number, x: number): THREE.Vector3[] => { const o: THREE.Vector3[] = []; for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI; o.push(v3(x, 0.03 + 0.02 * Math.sin(a), -Math.cos(a) * hw)); } o.push(v3(x, 0, hw * 0.94), v3(x, 0, -hw * 0.94), o[0].clone()); return o; };
      const body = facing(grid(st.map(([x, hw]) => sec(hw, x)), (i, j) => [j * 0.03, st[i][0]]), (x, y, z) => [0, y - 0.02, z]);
      g.push(dye(body, INK.darkwood, 3.0));
      for (const e of [0, st.length - 1]) { const [x, hw] = st[e]; g.push(dye(box(0.004, 0.046, hw * 1.9).translate(x, 0.024, 0), INK.darkwood, 3.2)); }
      g.push(dye(box(0.012, 0.014, 0.17).translate(0.52, 0.056, 0), INK.darkwood, 2.4));
      for (let i = 0; i < 7; i++) { const z = -0.06 + i * 0.02; g.push(dye(pole(v3(0.52, 0.064, z), v3(-0.607, 0.052, z * 0.86), 0.0011, 0.0011, 3), [0.96, 0.93, 0.84], 0.6)); }
      for (let i = 0; i < 13; i++) { const u = [0.125, 0.167, 0.2, 0.25, 0.333, 0.4, 0.5, 0.6, 0.667, 0.75, 0.8, 0.833, 0.875][i]; g.push(dye(cyl(0.0045, 0.0045, 0.002, 6).translate(0.52 - u * 1.127, 0.049 + 0.0005, -0.082 + u * 0.012), INK.white, 0.5)); }
      const qin = c.part('qinBody', 'obj', g, wp(qx, qh + 0.001, qz), new THREE.Euler(0, 0.03, 0));
      qin.userData = { len: 1.22, strings: v3(-0.04, 0.058, 0) };
      c.anchor('qin', ox + qx - 0.04, oy + qh + 0.06, oz + qz, 0);
    }
    // 一块叠着的琴囊，搁在琴几西头
    obj.push(dye(at(wobble(sbox(0.2, 0.03, 0.14, 0.06), 0.006, 6, 90, 55), qx - 0.55, qh + 0.07, qz + 0.02, 0.2), [0.78, 0.74, 0.66], 1.3));

    // 地上一领芦席，席上一只蒲团
    const mx = -3.15, mz = -0.1, mw = 2.0, md = 1.55;
    b.add('thatch', at(tint(matGeo(mw, md, 91), 0.98, 0.98, 0.95), mx, fl + 0.006, mz));
    for (const sz of [-1, 1]) obj.push(dye(at(box(mw + 0.01, 0.014, 0.05), mx, fl + 0.008, mz + sz * (md / 2 - 0.02)), INK.indigo, 1.9));
    const pu = lathe([[0.001, 0], [0.22, 0], [0.26, 0.022], [0.262, 0.05], [0.235, 0.072], [0.001, 0.078]], seg(18));
    swapUV(pu);
    b.add('thatch', at(tint(pu, 0.96, 0.95, 0.9), mx + 0.05, fl + 0.014, mz + 0.1));
    c.anchor('mat', ox + mx + 0.05, oy + fl + 0.092, oz + mz + 0.1, 0);
    c.anchor('qinSeat', ox + qx - 0.04, oy + fl + 0.014, oz + qz + 0.62, Math.PI);

    // 茶炉：小泥炉，三个支钉托着壶；炉前一个风口。旁边一块小托板放两只盏，一只茶罐、一把蒲扇
    const tx = I.stove.x, tz = I.stove.z, sh = 0.27;
    obj.push(dye(at(flatRock(41, 0.24, 0.035, 0.22, 1), tx, fl - 0.003, tz), INK.slate, 1.2));
    const stove = pot([[0.001, 0], [0.12, 0], [0.135, 0.03], [0.158, 0.12], [0.15, 0.2], [0.128, 0.255], [0.132, sh], [0.108, sh], [0.105, 0.24], [0.125, 0.16], [0.11, 0.1], [0.001, 0.095]], seg(18));
    shade(stove, (x, y, z) => (Math.hypot(x, z) < 0.12 && y > 0.09 ? 0.45 : 1 - 0.1 * smooth(0.16, sh, y)));
    obj.push(dye(at(stove, tx, fl + 0.03, tz), INK.clay, 1.45));
    obj.push(dye(at(box(0.085, 0.07, 0.01), tx, fl + 0.085, tz, 0).applyMatrix4(M.mul(M.t(tx, 0, tz), M.ry(-0.7), M.t(-tx, 0, -tz + 0.146))), INK.ink, 2.6));
    for (let i = 0; i < 3; i++) obj.push(dye(at(box(0.022, 0.02, 0.04), tx + Math.cos(i * 2.094) * 0.118, fl + 0.03 + sh + 0.008, tz + Math.sin(i * 2.094) * 0.118, -i * 2.094 + Math.PI / 2), INK.clay, 1.6));
    c.solid({ id: '草堂·茶炉', kind: 'disc', x: ox + tx, z: oz + tz, r: 0.2, top: oy + fl + 0.03 + sh });
    // 壶（可拿；原点在提梁顶上握的地方）
    {
      const g: Geo[] = [], by = -0.2;
      const body = pot([[0.001, 0], [0.055, 0], [0.085, 0.03], [0.092, 0.07], [0.07, 0.105], [0.045, 0.115], [0.001, 0.115]], seg(16));
      g.push(dye(body.translate(0, by, 0), INK.iron, 2.0));
      g.push(dye(lathe([[0.001, 0.115], [0.047, 0.113], [0.044, 0.123], [0.014, 0.13], [0.014, 0.14], [0.02, 0.15], [0.001, 0.154]], seg(12)).translate(0, by, 0), INK.iron, 2.2));
      g.push(dye(tube([v3(0.08, by + 0.055, 0), v3(0.115, by + 0.075, 0), v3(0.14, by + 0.11, 0)], (t) => 0.016 - 0.007 * t, 6, true), INK.iron, 2.0));
      g.push(dye(tube([v3(0, by + 0.1, -0.065), v3(0, by + 0.16, -0.06), v3(0, -0.004, 0), v3(0, by + 0.16, 0.06), v3(0, by + 0.1, 0.065)].map((p) => p), 0.0055, 5), INK.iron, 2.2));
      const k = c.part('kettle', 'obj', g, wp(tx, fl + 0.03 + sh + 0.018 + 0.2, tz), new THREE.Euler(0, -0.7 + Math.PI, 0));
      k.userData = { spout: v3(0.14, by + 0.11, 0), bottom: by };
      c.anchor('stove', ox + tx, oy + fl + 0.03 + sh + 0.018, oz + tz, yawOf(-0.5, 0.6));
    }
    const px = tx - 0.42, pz = tz + 0.12;
    b.add('wood', at(plank(0.34, 0.02, 0.2, 93), px, fl + 0.03, pz, 0.25));
    for (const sx of [-1, 1]) b.add('wood', at(box(0.02, 0.022, 0.18, 'z'), px + sx * 0.13 * Math.cos(0.25), fl + 0.011, pz - sx * 0.13 * Math.sin(0.25), 0.25));
    const cupG = () => [dye(pot([[0.001, 0], [0.019, 0], [0.021, 0.006], [0.043, 0.036], [0.045, 0.04], [0.041, 0.038], [0.018, 0.011], [0.001, 0.01]], seg(12)), INK.white, 1.0)];
    c.part('cup1', 'obj', cupG(), wp(px - 0.07, fl + 0.041, pz + 0.04)).userData = { rim: 0.04 };
    c.part('cup2', 'obj', cupG(), wp(px + 0.065, fl + 0.041, pz - 0.0)).userData = { rim: 0.04 };
    obj.push(dye(at(pot([[0.001, 0], [0.04, 0], [0.052, 0.03], [0.05, 0.085], [0.034, 0.1], [0.034, 0.11], [0.001, 0.115]], seg(12)), tx - 0.34, fl, tz - 0.2), INK.glaze, 1.5));
    // 蒲扇：一片桃形的叶、一根柄，平放在地上
    {
      const sh2 = new THREE.Shape();
      sh2.moveTo(0, 0); sh2.bezierCurveTo(0.12, 0.02, 0.17, 0.16, 0.12, 0.27); sh2.bezierCurveTo(0.08, 0.33, -0.08, 0.33, -0.12, 0.27); sh2.bezierCurveTo(-0.17, 0.16, -0.12, 0.02, 0, 0);
      const fan = blank(new THREE.ExtrudeGeometry(sh2, { depth: 0.004, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2));
      obj.push(dye(at(fan, tx + 0.3, fl + 0.004, tz + 0.3, 2.4), INK.hemp, 1.1));
      obj.push(dye(pole(v3(tx + 0.3, fl + 0.012, tz + 0.3), v3(tx + 0.3 - Math.sin(2.4) * -0.16, fl + 0.012, tz + 0.3 - Math.cos(2.4) * -0.16), 0.008, 0.007, 5), INK.bamboo, 1.4));
    }
    // 西墙南头一只木箱
    const cx2 = -xi + 0.3, cz2 = 1.55;
    b.add('wood', at(wobble(sbox(0.46, 0.4, 0.78, 0.4).translate(0, 0.2, 0), 0.005, 2, 95), cx2, fl + 0.02, cz2));
    b.add('wood', at(tint(plank(0.5, 0.03, 0.82, 96), 0.92), cx2, fl + 0.435, cz2));
    for (const sz of [-1, 1]) b.add('wood', at(box(0.4, 0.03, 0.05, 'x'), cx2, fl + 0.015, cz2 + sz * 0.3));
    c.solid({ id: '草堂·木箱', kind: 'rect', x: ox + cx2, z: oz + cz2, w: 0.5, d: 0.82, top: oy + fl + 0.45 });
  }

  // 东南角一只插卷轴的陶缸
  {
    const jx = xi - 0.34, jz = zi - 0.4;
    const jar = pot([[0.001, 0], [0.13, 0], [0.17, 0.08], [0.18, 0.3], [0.15, 0.4], [0.158, 0.42], [0.14, 0.415], [0.15, 0.3], [0.14, 0.1], [0.001, 0.08]], seg(16));
    shade(jar, (x, y, z) => (Math.hypot(x, z) < 0.14 && y > 0.07 ? 0.5 : 1));
    obj.push(dye(at(jar, jx, fl, jz), [0.8, 0.8, 0.78], 1.3));
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.3, r = 0.03 + 0.05 * R(); obj.push(dye(pole(v3(jx + Math.cos(a) * r * 0.5, fl + 0.1, jz + Math.sin(a) * r * 0.5), v3(jx + Math.cos(a) * (r + 0.07), fl + 0.62 + 0.14 * R(), jz + Math.sin(a) * (r + 0.07)), 0.02, 0.02, 7), INK.page, R.r(0.8, 1.3))); }
    c.solid({ id: '草堂·卷缸', kind: 'disc', x: ox + jx, z: oz + jz, r: 0.2 });
  }

}

/** 一圈点（给箍、环用）：半径 r，平放在 y=0 */
function ringPts(r: number, n: number): THREE.Vector3[] { const o: THREE.Vector3[] = []; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; o.push(v3(Math.cos(a) * r, 0, Math.sin(a) * r)); } return o; }
/** three 自带的几何：补齐四个属性 */
function blank(g: THREE.BufferGeometry): Geo {
  const o = g.index ? g.toNonIndexed() : g, n = o.attributes.position.count;
  if (!o.attributes.uv) o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  o.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) o.deleteAttribute(k);
  o.clearGroups();
  return o;
}
/** 把一块方板削成八边（当圆板用）：离中心超过 r 的角往里收 */
function clipOct(g: Geo, r: number): Geo {
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), d = Math.abs(x) + Math.abs(z); if (d > r * 1.42) { const k = (r * 1.42) / d; p.setX(i, x * k); p.setZ(i, z * k); } }
  return g;
}
/** 一领席：w × d 的薄片，草丝顺着 d（uv 的 v）；四角略翘 */
function matGeo(w: number, d: number, seed: number): Geo {
  const nx = 8, nz = 6, pts: THREE.Vector3[][] = [];
  for (let i = 0; i <= nx; i++) { pts.push([]); for (let j = 0; j <= nz; j++) { const x = (i / nx - 0.5) * w, z = (j / nz - 0.5) * d, e = Math.pow(Math.abs(i / nx - 0.5) * 2, 4) * Math.pow(Math.abs(j / nz - 0.5) * 2, 4); pts[i].push(v3(x, 0.004 + 0.012 * e * (1 + Math.sin(seed + i + j)), z)); } }
  return facing(grid(pts, (_i, _j, p) => [p.x + seed, p.z * 0.35]), () => [0, 1, 0]);
}
/** uv 对调（让草丝绕着圈走） */
function swapUV(g: Geo): Geo { const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i)); return g; }
const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);
