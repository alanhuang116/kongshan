/**
 * 田里的两样：麦田里的草人，田间小路边看青的窝棚。
 */
import { M, box, lathe, prism, tint, type Geo } from '../core/geo';
import { ground } from '../site';
import { INK, dye, pole, tube, v3, wobble, type Ctx } from './kit';
import { thatchRoof } from './thatch';

export function buildFields(c: Ctx, sub?: string[]): void {
  const on = (k: string) => !sub || sub.includes(k);
  const b = c.far;
  // 小物件直接进当前的摊（带着当时的摆位）
  const obj = { push: (...gs: Geo[]) => { for (const g of gs) b.add('obj', g); } };

  // ———————————— 草人：十字的木架，披一身草，扣一顶破斗笠；略歪 ————————————
  if (on('scarecrow')) {
    const x = 10.6, z = 60, gy = ground(x, z), ry = Math.PI / 2 - 0.2;
    b.push(M.mul(M.t(x, gy, z), M.ry(ry), M.rz(0.06)));
    b.add('wood', pole(v3(0, -0.4, 0), v3(0.02, 1.86, 0), 0.03, 0.024, 6, 2));
    b.add('bamboo', pole(v3(-0.78, 1.42, 0), v3(0.8, 1.5, 0.02), 0.02, 0.016, 6));
    // 草身：两层草披；两只袖口各垂一把草
    b.add('thatch', tint(wobble(lathe([[0.36, 0.55], [0.26, 0.95], [0.13, 1.44]], 9), 0.03, 2.5, 741, 0), 0.94, 0.93, 0.9));
    b.add('thatch', tint(wobble(lathe([[0.3, 0.98], [0.22, 1.26], [0.1, 1.5]], 9), 0.025, 2.5, 742, 0), 1.0, 0.99, 0.94));
    for (const s of [-1, 1]) b.add('thatch', tint(wobble(lathe([[0.13, -0.42], [0.09, -0.15], [0.03, 0.02]], 6), 0.02, 3, 743 + s, 0), 0.97, 0.96, 0.92).applyMatrix4(M.mul(M.t(s * 0.72, 1.47 + (s > 0 ? 0.03 : -0.03), 0), M.rz(s * 0.25))));
    // 头：一团草；斗笠歪扣着
    b.add('thatch', tint(wobble(lathe([[0.001, 1.52], [0.1, 1.56], [0.14, 1.68], [0.1, 1.8], [0.001, 1.84]], 8), 0.012, 4, 745, 0), 1.02, 1.0, 0.95));
    const hat = lathe([[0.29, 0], [0.16, 0.07], [0.05, 0.14], [0.001, 0.16]], 12);
    obj.push(dye(hat, INK.hemp, 1.35).applyMatrix4(M.mul(M.t(0.02, 1.76, 0.01), M.rz(-0.2), M.rx(0.12))));
    b.pop();
    c.solid({ id: '草人', kind: 'disc', x, z, r: 0.35 });
    c.anchor('scarecrow', x, gy, z, ry);
  }

  // ———————————— 窝棚：两面草披直落到地的人字棚，西头敞着朝小路；里面一张板铺 ————————————
  if (on('hut')) {
    const x = 25.2, z = 69.6, gy = ground(x, z), L = 3.0, D = 2.9, H = 1.95;
    b.push(M.t(x, gy, z));
    const th = thatchRoof({ w: L, d: D, rise: H - 0.22, hip: 0, thick: 0.17, sag: 0.02, lift: 0.04, ridgeSag: 0.06, droop: 0.04, courses: 3, step: 0.045, rag: 0.07, cell: 0.14, seed: 751, roll: 0.1, cross: 0, tone: 0.95 });
    b.add('thatch', th.thatch.translate(0, 0.24, 0));
    // 两头各一副人字架，脊上一根檩
    for (const s of [-1, 1]) for (const e of [-1, 1]) b.add('wood', pole(v3(s * (L / 2 - 0.12), -0.1, e * (D / 2 - 0.18)), v3(s * (L / 2 - 0.12), H + 0.22, -e * 0.16), 0.04, 0.03, 6));
    b.add('wood', pole(v3(-L / 2 - 0.2, H + 0.02, 0), v3(L / 2 + 0.22, H + 0.03, 0), 0.04, 0.036, 6));
    // 东头用草帘堵上；棚里是暗的
    const tri: Array<[number, number]> = [[-D / 2 + 0.2, 0], [D / 2 - 0.2, 0], [0, H - 0.12]];
    b.add('thatch', tint(prism(tri, 0.06).rotateY(Math.PI / 2).translate(L / 2 - 0.2, 0, 0), 0.9, 0.89, 0.86));
    b.add('dark', prism(tri.map(([a, y]) => [a * 0.9, y * 0.9] as [number, number]), 0.03).rotateY(Math.PI / 2).translate(-L / 2 + 1.1, 0, 0));
    // 板铺的一头、一只瓦罐、靠着的锄
    b.add('wood', wobble(box(1.0, 0.05, 0.8, 'x').translate(-L / 2 + 0.75, 0.3, -0.12), 0.006, 2, 752));
    for (const e of [-1, 1]) b.add('wood', box(0.08, 0.28, 0.7, 'z').translate(-L / 2 + 0.4 + (e + 1) * 0.3, 0.14, -0.12));
    b.add('thatch', tint(box(0.9, 0.05, 0.7, 'x').translate(-L / 2 + 0.78, 0.35, -0.12), 1.03, 1.02, 0.96));
    obj.push(dye(lathe([[0.001, 0], [0.09, 0], [0.14, 0.1], [0.13, 0.2], [0.07, 0.26], [0.08, 0.3], [0.06, 0.3], [0.05, 0.26], [0.001, 0.24]], 10).translate(-L / 2 + 0.25, 0, 0.75), INK.glaze, 1.6));
    b.add('wood', pole(v3(-L / 2 - 0.1, 0, 1.05), v3(-L / 2 + 0.25, 1.45, 0.62), 0.018, 0.016, 5));
    obj.push(dye(box(0.13, 0.19, 0.012).translate(0, -0.07, 0.03).applyMatrix4(M.mul(M.t(-L / 2 - 0.1, 0.07, 1.07), M.rx(1.2))), INK.iron, 2.1));
    // 压在草披上的两根竹竿
    for (const e of [-1, 1]) b.add('bamboo', tube([v3(-L / 2 - 0.1, 0.26 + th.top(0, e * 0.75), e * 0.78), v3(0, 0.3 + th.top(0, e * 0.75), e * 0.76), v3(L / 2 + 0.1, 0.26 + th.top(0, e * 0.75), e * 0.78)], 0.02, 5, true));
    b.pop();
    c.solid({ id: '窝棚', kind: 'rect', x, z, w: L + 0.2, d: D + 0.2 });
    c.anchor('hut', x - L / 2 - 0.7, gy, z, -Math.PI / 2);
  }
}
