/**
 * 斗鸡的器物（土地庙南边、茶亭东南的空地上）：
 *   场 —— 地上一圈草绳围的圆，两只竹编的鸡罩搁在场南边（不斗时鸡在罩里）。
 *   鸡 —— 斗鸡比家里的公鸡高挑：腿长、颈长、身子立得直，冠小（斗鸡的冠剪过），尾羽不长；
 *     赤羽：赭红的身子、金黄的颈羽、黑胸、墨绿的尾；芦花：灰白相间的横斑。
 *     画法照 life/fauna/hens.ts 的鸡（一块一块的小件，两只并成一个几何，一次绘制）；这里另捏了斗鸡的形，并且每一块都能动：
 *     颈羽炸开（对峙时一圈蓑羽竖起来）、伸颈一啄、腾身一扑（双翅张开、两爪往前蹬）、侧身一让、挨了一下往后退、怯了掉头扑着翅膀跑、胜了引颈一啼。
 * 不见血、不伤：输了只是斗志没了，退走。
 */
import * as THREE from 'three';
import { M, V, box, cyl, merge, type Geo } from '../core/geo';
import { PIG, type RGB } from '../ink/ink';
import { Parts, child, creatureMat, loftZ, paint, tone, trs } from '../life/rig';
import { footY } from '../life/spots';
import { OCHRE, RED, beak, ell, lerp, mottle, mul, rod, shadeBy } from '../life/fauna/kit';
import { dye, pole, tube, v3 } from '../build/kit';
import { inkGeo } from './kit';

/** 斗鸡站着时髋离地多高（比母鸡高出一截） */
export const HIP = 0.17;
export interface CockLook { name: string; body: RGB; neck: RGB; breast: RGB; wing: RGB; tail: RGB; bars?: boolean }
export const COCKS: [CockLook, CockLook] = [
  { name: '赤羽', body: tone([0.84, 0.5, 0.36], 1.35), neck: tone([0.96, 0.78, 0.44], 1.2), breast: tone(PIG.jiao, 2.4), wing: tone([0.72, 0.42, 0.32], 1.5), tail: tone([0.46, 0.5, 0.5], 2.2) },
  { name: '芦花', body: tone([0.86, 0.86, 0.84], 1.25), neck: tone([0.9, 0.9, 0.88], 1.15), breast: tone([0.8, 0.8, 0.78], 1.35), wing: tone([0.82, 0.82, 0.8], 1.35), tail: tone([0.6, 0.62, 0.64], 1.8), bars: true },
];

interface CockGeo { body: Geo; neck: Geo; ruff: Geo; head: Geo; wingL: Geo; wingR: Geo; tail: Geo; leg: Geo }
/** 一只斗鸡的几块（各自的原点在关节上） */
function cockGeo(L: CockLook, seed: number): CockGeo {
  const bar = (g: Geo) => (L.bars ? shadeBy(g, (_x, y, z, o) => { const k = Math.sin(y * 140 + z * 36) > 0.2 ? 0.66 : 1.04; o[0] *= k; o[1] *= k; o[2] *= k; }) : g);
  // 身：原点在髋，自尾根到胸；胸挺着（另一色），背上深
  const secs: Array<[number, number, number, number]> = [[-0.12, 0.1, 0.028, 0.034], [-0.085, 0.085, 0.055, 0.06], [-0.025, 0.07, 0.07, 0.072], [0.035, 0.075, 0.07, 0.076], [0.085, 0.1, 0.056, 0.064], [0.112, 0.126, 0.034, 0.04]];
  const body = bar(mottle(shadeBy(loftZ(secs, 11, 1.1), (_x, y, z, o) => {
    const c = z > 0.03 && y < 0.1 ? L.breast : L.body, k = Math.max(0, Math.min(1, (y - 0.02) / 0.12));
    o[0] = c[0] * lerp(1.05, 0.92, k); o[1] = c[1] * lerp(1.05, 0.92, k); o[2] = c[2] * lerp(1.05, 0.92, k);
  }), 0.07, seed));
  // 腿根的「裤」
  const thighs = [-1, 1].map((s) => ell(0.026, 0.036, 0.034, mul(L.body, 0.94)).translate(s * 0.036, 0.02, 0.005));
  // 颈：原点在颈根，朝上略前，长 0.15
  const neck = bar(rod([V(0, 0, 0), V(0, 0.06, 0.02), V(0, 0.12, 0.03), V(0, 0.15, 0.035)], 0.03, 0.019, L.neck));
  // 蓑羽（颈羽）：一圈披下来的长羽，原点在颈根往上一点——炸开时整块放大
  const ruffParts: Geo[] = [];
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.2; ruffParts.push(ell(0.016, 0.05, 0.022, i % 2 ? L.neck : mul(L.neck, 0.9)).applyMatrix4(M.mul(M.ry(a), M.t(0, -0.005, 0.026), M.rx(0.45)))); }
  const ruff = bar(merge(ruffParts));
  // 头：原点在颈顶；小头、短喙、豆冠（剪过的）、一点肉垂
  const hp: Geo[] = [
    ell(0.024, 0.024, 0.03, L.neck).translate(0, 0.008, 0.012),
    beak(0.009, 0.03, OCHRE).applyMatrix4(M.mul(M.t(0, 0.004, 0.044), M.rx(0.25))),
    ell(0.005, 0.005, 0.004, tone(PIG.jiao, 2.6)).translate(0.02, 0.014, 0.022), ell(0.005, 0.005, 0.004, tone(PIG.jiao, 2.6)).translate(-0.02, 0.014, 0.022),
    ell(0.006, 0.012, 0.008, RED).translate(0, -0.014, 0.03),
    ell(0.006, 0.008, 0.02, RED).translate(0, 0.03, 0.016),
  ];
  const head = merge(hp);
  // 翅：原点在肩，收着时贴在身侧朝后
  const wing = (s: number) => bar(shadeBy(ell(0.018, 0.045, 0.085, L.wing, 8, 5).translate(s * 0.008, -0.015, -0.065), (_x, _y, z, o) => { const k = z < -0.1 ? 0.78 : 1; o[0] = L.wing[0] * k; o[1] = L.wing[1] * k; o[2] = L.wing[2] * k; }));
  // 尾：几根短镰羽，拱起再垂下
  const tp: Geo[] = [];
  for (let i = 0; i < 5; i++) {
    const a = 0.5 + i * 0.16, r = 0.1 + 0.016 * i, sx = (i - 2) * 0.01;
    tp.push(rod([0, 0.35, 0.7, 1].map((t) => V(sx * (1 + t), Math.sin(a + t * 1.8) * r * (0.4 + 0.6 * t), -(1 - Math.cos(t * 1.9)) * r * 0.9)), 0.012, 0.004, i % 2 ? L.tail : mul(L.tail, 1.15)));
  }
  const tail = merge(tp);
  // 腿：原点在髋，黄色的跖、三个朝前一个朝后的趾，后头一个距
  const lg: Geo[] = [paint(cyl(0.0065, 0.008, HIP, 5).translate(0, -HIP / 2, 0), OCHRE)];
  for (const a of [-0.45, 0, 0.45]) lg.push(paint(box(0.0075, 0.004, 0.05).translate(0, 0, 0.024).applyMatrix4(M.mul(M.t(0, -HIP + 0.003, 0.004), M.ry(a))), OCHRE));
  lg.push(paint(box(0.006, 0.004, 0.022).translate(0, -HIP + 0.003, -0.012), OCHRE));
  lg.push(paint(cyl(0.001, 0.004, 0.018, 4).applyMatrix4(M.mul(M.t(0, -HIP + 0.03, -0.01), M.rx(-1.9))), mul(OCHRE, 0.9)));
  return { body: merge([body, ...thighs]), neck, ruff, head, wingL: wing(1), wingR: wing(-1), tail, leg: merge(lg) };
}

/** 一只鸡此刻的样子：外面（act）照着时间线改这些数，Roosters.update 照着摆 */
export interface Rig {
  x: number; z: number; yaw: number;
  /** 离地多高（扑起来）；身子往前探多少（弧度）；往下蹲几成 */ lift: number; lean: number; crouch: number;
  /** 颈往前伸几成（啄）、颈俯仰（弧度）、头左右转 */ neck: number; nod: number; turn: number;
  /** 颈羽炸开几成；翅张开几成；扇得多急（0 不扇） */ flare: number; wing: number; flap: number;
  /** 走得多快（米/秒，给腿）；侧滚 */ walk: number; roll: number;
  /** 收着（不画） */ hidden: boolean;
  /** 抱在手里：给了就照这个矩阵摆（身子的世界矩阵），腿收起来 */ held: THREE.Matrix4 | null;
}
export const newRig = (): Rig => ({ x: 0, z: 0, yaw: 0, lift: 0, lean: 0, crouch: 0, neck: 0, nod: 0, turn: 0, flare: 0, wing: 0, flap: 0, walk: 0, roll: 0, hidden: true, held: null });

const _B = new THREE.Matrix4(), _L = new THREE.Matrix4(), _m = new THREE.Matrix4(), _n = new THREE.Matrix4();
export class Roosters {
  parts: Parts;
  rigs: Rig[] = [];
  private k: Array<{ body: number; neck: number; ruff: number; head: number; wingL: number; wingR: number; tail: number; legs: [number, number] }> = [];
  private ph: number[] = [];
  constructor(looks: CockLook[], name = 'games:cocks') {
    const P = (this.parts = new Parts(creatureMat({ body: 0.12, shade: 1.5 }), name));
    looks.forEach((L, i) => {
      const g = cockGeo(L, 7 + i * 13);
      this.k.push({ body: P.add(g.body), neck: P.add(g.neck), ruff: P.add(g.ruff), head: P.add(g.head), wingL: P.add(g.wingL), wingR: P.add(g.wingR), tail: P.add(g.tail), legs: [P.add(g.leg), P.add(g.leg)] });
      this.rigs.push(newRig()); this.ph.push(i * 0.5);
    });
    P.build();
    for (const K of this.k) for (const idx of [K.body, K.neck, K.ruff, K.head, K.wingL, K.wingR, K.tail, ...K.legs]) P.hide(idx);
    P.commit();
  }
  /** 摆：t 是总时（扇翅、颈羽的抖用）。gy 给了就用它当地面高（遥远的同游那边用），不给按脚下的地 */
  update(dt: number, t: number, gy?: (x: number, z: number) => number) {
    const P = this.parts;
    this.rigs.forEach((R, i) => {
      const K = this.k[i];
      if (R.hidden) { for (const idx of [K.body, K.neck, K.ruff, K.head, K.wingL, K.wingR, K.tail, ...K.legs]) P.hide(idx); return; }
      this.ph[i] += dt * (R.walk / 0.12) * Math.PI;
      const ph = this.ph[i], walk = Math.min(1, R.walk / 0.25);
      if (R.held) _B.copy(R.held);
      else {
        const g = gy ? gy(R.x, R.z) : footY(R.x, R.z), up = HIP * (1 - 0.35 * R.crouch) + R.lift + 0.008 * walk * Math.abs(Math.sin(ph));
        // 斗鸡身子立得直：胸高尾低（往前探时放平）
        trs(_B, R.x, g + up, R.z, R.yaw, -0.42 + R.lean, 0, 1);
        if (R.roll) _B.multiply(_m.makeRotationZ(R.roll));
      }
      P.place(K.body, _B);
      // 颈：伸颈时往前放平；颈羽跟着颈根，炸开时大一圈
      const ext = R.neck;
      child(_m, _B, 0, 0.12, 0.085, R.turn * 0.6, 0.25 + 0.95 * ext + R.nod, 0);
      P.place(K.neck, _m);
      const shake = R.flare > 0.3 ? 0.04 * Math.sin(t * 31) * R.flare : 0;
      P.place(K.ruff, child(_n, _m, 0, 0.05, 0, shake, -0.15 * R.flare, 0, 1 + 0.75 * R.flare));
      P.place(K.head, child(_n, _m, 0, 0.15, 0.035, R.turn * 0.5, -0.25 - 0.85 * ext - R.nod * 0.6, 0));
      // 翅：张开（扑、扇、跑）时往外往上抬，扇得急时一上一下
      const f = R.flap > 0 ? Math.sin(t * (18 + 10 * R.flap)) : 0, open = Math.min(1, R.wing + 0.35 * R.flap);
      for (const [idx, s] of [[K.wingL, 1], [K.wingR, -1]] as Array<[number, number]>) {
        P.place(idx, child(_n, _B, s * 0.058, 0.1, 0.045, s * open * 0.5, -open * 0.35, s * (open * 1.15 + R.flap * 0.6 * f)));
      }
      P.place(K.tail, child(_n, _B, 0, 0.1, -0.12, 0, 0.12 + 0.2 * R.flare - 0.1 * R.lean, 0));
      // 腿：不随身子俯仰；走时一前一后，扑起来往前蹬，抱着时收起
      if (R.held) { for (const idx of K.legs) P.place(idx, child(_n, _B, 0, -0.02, -0.02, 0, 1.2, 0, 0.7)); }
      else {
        const g = gy ? gy(R.x, R.z) : footY(R.x, R.z);
        trs(_L, R.x, g + HIP * (1 - 0.35 * R.crouch) + R.lift, R.z, R.yaw, 0, R.roll * 0.5);
        const kick = Math.min(1, R.lift * 4);
        for (let j = 0; j < 2; j++) {
          const s = j ? -1 : 1, sw = walk * 0.5 * Math.sin(ph + j * Math.PI);
          P.place(K.legs[j], child(_n, _L, s * 0.036, 0, 0.004, 0, -sw - kick * 0.9 + 0.2 * R.crouch, s * 0.04, 1 - 0.3 * R.crouch));
        }
      }
    });
    P.commit();
  }
}

/** 斗鸡场（草绳一圈）与两只鸡罩（世界坐标，一块）：c 场心，r 半径；cages 两只罩的地方 */
export function ringGeo(c: { x: number; z: number }, r: number, cages: Array<{ x: number; z: number }>): Geo {
  const parts: Geo[] = [], straw: RGB = [0.9, 0.82, 0.62], bamboo: RGB = [0.85, 0.81, 0.6];
  // 草绳：一整根，贴着地绕一圈（接头处压着一小截）；绳上一道道拧出来的深浅
  const N = 72, path: THREE.Vector3[] = [];
  for (let i = 0; i <= N + 2; i++) {
    const a = (i / N) * Math.PI * 2, w = 1 + 0.025 * Math.sin(a * 3 + 0.7) + 0.015 * Math.sin(a * 7);
    const x = c.x + Math.cos(a) * r * w, z = c.z + Math.sin(a) * r * w;
    path.push(v3(x, footY(x, z) + 0.026, z));
  }
  const rope = inkGeo(tube(path, 0.03, 6));
  const rp = rope.attributes.position as THREE.BufferAttribute, rc = rope.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < rc.count; i++) { const a = Math.atan2(rp.getZ(i) - c.z, rp.getX(i) - c.x), k = 0.86 + 0.14 * Math.sin(a * 64 + rp.getY(i) * 90); rc.setXYZ(i, k, k, k); }
  parts.push(dye(rope, straw, 1.25));
  for (const g of cages) {
    const y = footY(g.x, g.z), R = 0.26, H = 0.36;
    // 罩：一圈竹篾，上头收成一个顶，顶上一个提手
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, bx = g.x + Math.cos(a) * R, bz = g.z + Math.sin(a) * R, tx = g.x + Math.cos(a) * 0.07, tz = g.z + Math.sin(a) * 0.07;
      parts.push(dye(inkGeo(pole(v3(bx, y, bz), v3(g.x + Math.cos(a) * R * 0.86, y + H * 0.7, g.z + Math.sin(a) * R * 0.86), 0.006, 0.006, 3)), bamboo, 1.4));
      parts.push(dye(inkGeo(pole(v3(g.x + Math.cos(a) * R * 0.86, y + H * 0.7, g.z + Math.sin(a) * R * 0.86), v3(tx, y + H, tz), 0.006, 0.006, 3)), bamboo, 1.4));
    }
    for (const [hy, rr] of [[0.02, R], [H * 0.36, R * 0.97], [H * 0.7, R * 0.86]] as Array<[number, number]>) {
      for (let i = 0; i < 16; i++) {
        const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
        parts.push(dye(inkGeo(pole(v3(g.x + Math.cos(a0) * rr, y + hy, g.z + Math.sin(a0) * rr), v3(g.x + Math.cos(a1) * rr, y + hy, g.z + Math.sin(a1) * rr), 0.008, 0.008, 3)), bamboo, 1.55));
      }
    }
    parts.push(dye(inkGeo(new THREE.TorusGeometry(0.05, 0.007, 4, 10).rotateY(0.4).translate(g.x, y + H + 0.04, g.z)), bamboo, 1.5));
  }
  return merge(parts);
}
