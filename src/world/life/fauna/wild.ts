/**
 * 野物（合在一个几何里，一次绘制）：
 *   野兔：田边、草垛旁各一只。伏着不动、竖起耳朵直着身子张望、低头啃两口、慢慢一纵一纵地挪；
 *     人走近了先愣住、耳朵竖直，再近一步就后腿一蹬窜出去，左一拐右一拐，跑出二三十步才又伏下。
 *   松鼠：院里两株松下各一只。地上一蹦一蹦、坐起来两只前爪捧着松子啃，尾巴在背后卷成一个弯；
 *     一受惊就蹿到树干上绕着往上爬，爬到树干背着人的那一面贴着不动，过一阵才探出头来。
 *   鹿：天刚亮的时候，北坡林边远远的两三只梅花鹿（雄的头上有角），低头吃草，一只抬头望着；
 *     人走得近了、太阳高了，就几纵跳进林子里不见了。（《诗经·小雅·鹿鸣》「呦呦鹿鸣，食野之苹」）
 */
import * as THREE from 'three';
import { M, V, cyl, merge, type Geo } from '../../core/geo';
import { mulberry32 } from '../../core/rng';
import { PIG, type RGB } from '../../ink/ink';
import { SITE, ground, plotAt, pathDist } from '../../site';
import { blocked } from '../../walk';
import type { Ctx } from '../person';
import { Parts, child, creatureMat, loftZ, paint, tone, trs } from '../rig';
import { clearOfTrees, footY } from '../spots';
import { bump, camDist, ell, inView, lerp, mottle, rod, sfx, shadeBy, turnTo, wrap, type Day } from './kit';
import { Quad, limb, pose, type QuadDims } from './quad';

const _b = new THREE.Matrix4(), _m = new THREE.Matrix4(), _v = new THREE.Vector3();
const HARE: RGB = tone([0.86, 0.78, 0.66], 1.45), HARE_D = tone([0.74, 0.66, 0.56], 1.7), CREAM: RGB = [0.95, 0.93, 0.88], INKC = tone(PIG.jiao, 2.5);
const SQ: RGB = tone([0.78, 0.72, 0.66], 1.7), SQ_B: RGB = [0.93, 0.9, 0.84];

function hareGeo() {
  const body = shadeBy(loftZ([[-0.17, 0.12, 0.05, 0.05], [-0.11, 0.13, 0.085, 0.09], [0.0, 0.12, 0.08, 0.085], [0.09, 0.13, 0.06, 0.07], [0.14, 0.15, 0.04, 0.05]], 9, 1.1), (_x, y, _z, o) => { const c = y < 0.08 ? CREAM : y > 0.18 ? HARE_D : HARE; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
  mottle(body, 0.1, 5);
  const head = merge([ell(0.04, 0.042, 0.06, HARE, 8, 6).translate(0, 0.02, 0.04), ell(0.008, 0.009, 0.006, INKC).translate(0.028, 0.035, 0.06), ell(0.008, 0.009, 0.006, INKC).translate(-0.028, 0.035, 0.06), ell(0.01, 0.008, 0.008, tone([0.9, 0.7, 0.68], 1.3)).translate(0, 0.012, 0.098)]);
  const ear = shadeBy(ell(0.016, 0.075, 0.01, HARE, 6, 4).translate(0, 0.07, 0), (_x, y, _z, o) => { const c = y > 0.12 ? INKC : HARE; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
  const hind = merge([ell(0.03, 0.06, 0.07, HARE, 7, 5).translate(0, -0.03, 0), paint(cyl(0.012, 0.016, 0.1, 5).translate(0, -0.05, 0), HARE).applyMatrix4(M.mul(M.t(0, -0.06, -0.04), M.rx(1.2))), ell(0.016, 0.01, 0.05, HARE_D).translate(0, -0.105, 0.0)]);
  const front = merge([paint(cyl(0.008, 0.01, 0.1, 5).translate(0, -0.05, 0), HARE), ell(0.011, 0.008, 0.016, HARE_D).translate(0, -0.1, 0.008)]);
  const tail = ell(0.02, 0.02, 0.016, CREAM, 6, 5);
  return { body, head, ear, hind, front, tail };
}
function squirrelGeo() {
  const body = shadeBy(loftZ([[-0.09, 0.07, 0.03, 0.035], [-0.05, 0.075, 0.042, 0.048], [0.03, 0.08, 0.036, 0.042], [0.08, 0.09, 0.025, 0.03]], 8, 1.05), (_x, y, _z, o) => { const c = y < 0.055 ? SQ_B : SQ; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
  const head = merge([ell(0.024, 0.024, 0.032, SQ, 7, 5).translate(0, 0.012, 0.022), ell(0.005, 0.006, 0.004, INKC).translate(0.016, 0.02, 0.034), ell(0.005, 0.006, 0.004, INKC).translate(-0.016, 0.02, 0.034),
    // 耳尖一撮毛
    ...[-1, 1].map((sx) => paint(cyl(0.001, 0.008, 0.024, 4), SQ).translate(sx * 0.012, 0.04, 0.012))]);
  // 尾：蓬松的一大把，在背后卷起来
  const tail = shadeBy(rod([V(0, 0, 0), V(0, 0.05, -0.06), V(0, 0.13, -0.07), V(0, 0.19, -0.03), V(0, 0.2, 0.02)], 0.034, 0.022, SQ), (_x, y, _z, o) => { const c = y > 0.16 ? tone([0.72, 0.66, 0.6], 1.9) : SQ; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
  const leg = merge([paint(cyl(0.006, 0.008, 0.05, 4).translate(0, -0.025, 0), SQ), ell(0.008, 0.005, 0.012, SQ).translate(0, -0.05, 0.004)]);
  return { body, head, tail, leg };
}
// —— 梅花鹿 ——
const DEER: RGB = tone([0.9, 0.74, 0.58], 1.45), DEER_B: RGB = [0.95, 0.92, 0.86], SPOT: RGB = [0.97, 0.95, 0.9], ANTLER = tone([0.84, 0.76, 0.64], 1.7);
const DD: QuadDims = { bodyY: 0.86, sh: [0.085, -0.05, 0.33], hip: [0.085, -0.03, -0.34], neck: [0.1, 0.42], tail: [0.08, -0.47], fu: 0.42, fl: 0.4, hu: 0.42, hl: 0.44, ear: [0.04, 0.28, 0.17] };
function deerGeo(stag: boolean) {
  const body = shadeBy(loftZ([[-0.48, 0.03, 0.06, 0.08], [-0.42, 0.03, 0.14, 0.16], [-0.25, 0.02, 0.15, 0.18], [0.0, 0.0, 0.14, 0.18], [0.2, 0.02, 0.14, 0.19], [0.34, 0.06, 0.11, 0.15], [0.42, 0.1, 0.07, 0.09]], 10, 1.05), (x, y, z, o) => {
    // 背上一行行的白点（梅花）、腹下浅
    const h = Math.sin(x * 61.7 + z * 37.3) * Math.sin(z * 53.1 - x * 21.7), spot = y > 0.02 && h > 0.72;
    const c = y < -0.12 ? DEER_B : spot ? SPOT : DEER; o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  const head = merge([
    rod([V(0, -0.06, -0.06), V(0, 0.1, 0.05), V(0, 0.24, 0.13), V(0, 0.3, 0.16)], 0.085, 0.05, DEER),
    ell(0.055, 0.06, 0.13, DEER, 9, 6).applyMatrix4(M.mul(M.t(0, 0.29, 0.25), M.rx(0.6))),
    ell(0.022, 0.018, 0.016, INKC).translate(0, 0.21, 0.36),
    ...(stag ? [-1, 1].map((sx) => merge([rod([V(sx * 0.03, 0.34, 0.18), V(sx * 0.08, 0.46, 0.14), V(sx * 0.12, 0.6, 0.1), V(sx * 0.13, 0.7, 0.04)], 0.014, 0.006, ANTLER), rod([V(sx * 0.08, 0.46, 0.14), V(sx * 0.1, 0.55, 0.22)], 0.009, 0.004, ANTLER), rod([V(sx * 0.12, 0.6, 0.1), V(sx * 0.17, 0.66, 0.15)], 0.008, 0.004, ANTLER)])) : []),
  ]);
  const ear = ell(0.022, 0.07, 0.012, DEER, 6, 4).translate(0, 0.06, 0);
  const tail = merge([ell(0.035, 0.06, 0.02, DEER, 6, 4).translate(0, -0.04, -0.01), ell(0.03, 0.05, 0.012, DEER_B).translate(0, -0.045, -0.025)]);
  const fu = limb(DD.fu, 0.032, 0.02, DEER, { mass: [0.05, 0.12, 0.07, 0.07, 0], seg: 5 });
  const fl = limb(DD.fl, 0.016, 0.014, DEER, { foot: [0.018, 0.02, 0.026, 0.006], footC: INKC, seg: 5 });
  const hu = limb(DD.hu, 0.036, 0.022, DEER, { mass: [0.06, 0.14, 0.08, 0.08, 0.01], seg: 5 });
  const hl = limb(DD.hl, 0.016, 0.014, DEER, { foot: [0.018, 0.02, 0.026, 0.006], footC: INKC, seg: 5 });
  return { body, head, tail, fu, fl, hu, hl, ear };
}
const D_STAND = pose({ y: 0.86, f: [0.05, -0.05, 0.05, -0.05], h: [-0.25, 0.42, -0.25, 0.42], tp: 0.3 });
const D_GRAZE = pose({ ...D_STAND, y: 0.84, pitch: 0.06, np: 1.3, f: [-0.08, 0.02, 0.12, -0.08] });
const D_ALERT = pose({ ...D_STAND, np: -0.25, ear: 0, tp: -0.4 });
export const DEER_POSES = { DD, D_STAND, D_GRAZE, D_ALERT, deerGeo };

interface Hare { home: [number, number]; x: number; z: number; yaw: number; st: number; t: number; k: number[]; hop: number; hx: number; hz: number; tx: number; tz: number; v: number; ear: number; up: number; flee: number }
interface Squirrel { tree: { x: number; z: number; r: number; gy: number }; x: number; z: number; y: number; yaw: number; st: number; t: number; k: number[]; a: number; h: number; hop: number }

export class Wild {
  parts: Parts;
  private R = mulberry32(777);
  private hares: Hare[] = [];
  private sqs: Squirrel[] = [];
  private deer: Quad[] = []; private deerSt = 0; private deerT = 0; private deerDay = -1; private deerAt = { x: 0, z: 0, yaw: 0 }; private dayN = 0; private lastH = 0;
  private last = 0;
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.25, shade: 1.45 }), 'wild'));
    const hg = hareGeo(), sg = squirrelGeo();
    // 兔：田边、草垛旁（挑草地上的、不在路上的地方）
    const homes: Array<[number, number]> = [];
    for (const [x, z] of [[-47.5, 46.6], [72.5, 92.6], [24.6, 121], [-72, 92]] as Array<[number, number]>) {
      let best: [number, number] | null = null;
      for (let i = 0; i < 20 && !best; i++) { const a = i * 1.3, r = i * 0.2; const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!blocked(px, pz, 'ground', 0.3) && pathDist(px, pz) > 1.2 && !plotAt(px, pz)) best = [px, pz]; }
      if (best) homes.push(best);
    }
    for (const h of homes.slice(0, 3)) this.hares.push({ home: h, x: h[0], z: h[1], yaw: this.R() * 6.28, st: 0, t: this.R() * 4, k: [P.add(hg.body), P.add(hg.head), P.add(hg.ear), P.add(hg.ear), P.add(hg.hind), P.add(hg.hind), P.add(hg.front), P.add(hg.front), P.add(hg.tail)], hop: -1, hx: 0, hz: 0, tx: 0, tz: 0, v: 0, ear: 0, up: 0, flee: 0 });
    // 松鼠：院里两株松
    for (const p of SITE.pines) {
      const tr = { x: p.x, z: p.z, r: 0.3, gy: footY(p.x, p.z) };
      this.sqs.push({ tree: tr, x: p.x + 1.2, z: p.z + 0.6, y: tr.gy, yaw: 0, st: 0, t: this.R() * 6, k: [P.add(sg.body), P.add(sg.head), P.add(sg.tail), P.add(sg.leg), P.add(sg.leg), P.add(sg.leg), P.add(sg.leg)], a: this.R() * 6.28, h: 0, hop: 0 });
    }
    // 鹿：一雄两雌
    const gS = deerGeo(true), gF = deerGeo(false);
    this.deer.push(new Quad(P, gS, DD), new Quad(P, gF, DD, 0.92), new Quad(P, gF, DD, 0.7));
    P.build();
    for (let k = 0; k < P.count; k++) P.hide(k);
  }

  update(c: Ctx, day: Day, pv: number) {
    const P = this.parts;
    if (c.hour < this.lastH - 12) this.dayN++;
    this.lastH = c.hour;
    this.last += c.dt;
    if (c.frame % 2 && !c.wound) return;
    const dt = Math.min(0.25, this.last); this.last = 0;
    let shown = false;
    for (const h of this.hares) shown = this.hare(h, c, dt, pv, day) || shown;
    for (const s of this.sqs) shown = this.squirrel(s, c, dt, pv, day) || shown;
    shown = this.stepDeer(c, dt, day) || shown;
    P.mesh.visible = shown;
    if (shown) P.commit();
  }

  // —— 兔 ——
  private hare(h: Hare, c: Ctx, dt: number, pv: number, day: Day): boolean {
    const P = this.parts, R = this.R, K = h.k;
    const out = c.night < 0.75 && c.snow < 0.6 && c.rain < 0.5;
    const dist = camDist(c, h.x, h.z);
    if (!out || dist > 150) { if (!P.hidden(K[0])) for (const k of K) P.hide(k); if (!out) { h.x = h.home[0]; h.z = h.home[1]; h.st = 0; } return false; }
    h.t -= dt;
    const pd = Math.hypot(c.player.x - h.x, c.player.z - h.z);
    // 0 伏着、1 坐起张望、2 啃、3 慢挪、4 窜
    if (h.st !== 4) {
      if (pd < 7 || (pv > 2.2 && pd < 16)) { h.st = 4; h.flee = 2.2 + R(); const a = Math.atan2(h.x - c.player.x, h.z - c.player.z); h.tx = h.x + Math.sin(a) * 28; h.tz = h.z + Math.cos(a) * 28; h.hop = -1; sfx(c, 'swish', h.x, h.z, 0.3); }
      else if (pd < 12) { h.st = 1; h.t = 1.5; }
    }
    if (h.st === 4) {
      // 后腿一蹬一纵，左一拐右一拐
      if (h.hop < 0) { h.hop = 0; h.hx = h.x; h.hz = h.z; const a = Math.atan2(h.tx - h.x, h.tz - h.z) + (R() - 0.5) * 1.1; h.yaw = a; }
      h.hop += dt / 0.32;
      const k = Math.min(1, h.hop), L = 1.7;
      h.x = h.hx + Math.sin(h.yaw) * L * k; h.z = h.hz + Math.cos(h.yaw) * L * k;
      if (h.hop >= 1) { h.hop = -1; if (blocked(h.x, h.z, 'ground', 0.2)) { h.x = h.hx; h.z = h.hz; } if (Math.hypot(h.tx - h.x, h.tz - h.z) < 2 || Math.hypot(h.x - h.home[0], h.z - h.home[1]) > 40) { h.st = 1; h.t = 4 + R() * 3; h.home = [h.x, h.z]; } }
      h.ear += (0.15 - h.ear) * Math.min(1, dt * 8);
    } else if (h.st === 1) { h.up += (1 - h.up) * Math.min(1, dt * 5); h.ear += (1 - h.ear) * Math.min(1, dt * 6); if (h.t < 0) { h.st = 0; h.t = 3 + R() * 6; } }
    else {
      h.up += (0 - h.up) * Math.min(1, dt * 4);
      if (h.st === 3) { if (h.hop < 0) { h.hop = 0; h.hx = h.x; h.hz = h.z; h.yaw += (R() - 0.5) * 1.5; } h.hop += dt / 0.45; const k = Math.min(1, h.hop); h.x = h.hx + Math.sin(h.yaw) * 0.32 * k; h.z = h.hz + Math.cos(h.yaw) * 0.32 * k; if (h.hop >= 1) { h.hop = -1; if (R() < 0.4 || Math.hypot(h.x - h.home[0], h.z - h.home[1]) > 4) { h.yaw = Math.atan2(h.home[0] - h.x, h.home[1] - h.z); } if (R() < 0.35) { h.st = 2; h.t = 2 + R() * 4; } } }
      h.ear += ((h.st === 0 ? 0.35 : 0.6) - h.ear) * Math.min(1, dt * 3);
      if (h.t < 0) { const r = R(); h.st = r < 0.35 ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : 3; h.t = 2 + R() * 5; }
    }
    // 摆
    const gy = footY(h.x, h.z), hopK = h.hop >= 0 ? bump(Math.min(1, h.hop)) : 0, fast = h.st === 4 ? 1 : 0;
    const lift = (fast ? 0.32 : 0.06) * hopK, pitch = -0.55 * h.up + (h.hop >= 0 ? (fast ? 0.3 : 0.15) * Math.sin(Math.min(1, h.hop) * Math.PI * 2) : 0), nib = h.st === 2 ? 0.35 + 0.08 * Math.sin(c.t * 9) : 0;
    trs(_b, h.x, gy + lift + 0.03 * h.up, h.z, h.yaw, pitch, 0);
    P.place(K[0], _b);
    P.place(K[1], child(_m, _b, 0, 0.17, 0.13, 0, nib + 0.3 * h.up, 0));
    for (let i = 0; i < 2; i++) { const sx = i ? -1 : 1; P.place(K[2 + i], child(_m, _b, sx * 0.022, 0.2, 0.13, sx * 0.15, -1.25 * (1 - h.ear) + 0.1 * Math.sin(c.t * 0.7 + i), sx * 0.12)); }
    const ext = h.hop >= 0 ? Math.sin(Math.min(1, h.hop) * Math.PI) : 0;
    for (let i = 0; i < 2; i++) { const sx = i ? -1 : 1; P.place(K[4 + i], child(_m, _b, sx * 0.055, 0.1, -0.09, 0, 0.9 * ext * (fast ? 1 : 0.5) - 0.2 * h.up, 0)); }
    for (let i = 0; i < 2; i++) { const sx = i ? -1 : 1; P.place(K[6 + i], child(_m, _b, sx * 0.03, 0.1, 0.09, 0, -0.8 * ext * (fast ? 1 : 0.5) + 0.55 * h.up, 0)); }
    P.place(K[8], child(_m, _b, 0, 0.14, -0.18));
    return true;
  }

  // —— 松鼠 ——
  private squirrel(s: Squirrel, c: Ctx, dt: number, pv: number, day: Day): boolean {
    const P = this.parts, R = this.R, K = s.k, T = s.tree;
    const out = day.up && c.rain < 0.4 && c.snow < 0.5;
    const dist = camDist(c, T.x, T.z);
    if (!out || dist > 70) { if (!P.hidden(K[0])) for (const k of K) P.hide(k); return false; }
    s.t -= dt;
    const pd = Math.hypot(c.player.x - s.x, c.player.z - s.z), pa = Math.atan2(c.player.z - T.z, c.player.x - T.x);
    // 0 地上蹦、1 坐起啃、2 爬上树、3 贴在树干背面、4 下树、5 藏在树冠里
    if ((s.st === 0 || s.st === 1) && (pd < 4 || (pv > 2.2 && pd < 9))) { s.st = 2; s.t = 0; sfx(c, 'squirrel', s.x, s.z, 0.45); }
    if (s.st === 0) {
      if (s.hop <= 0 && R() < dt * 1.2) { s.hop = 1; s.yaw += (R() - 0.5) * 2; const dx = s.x - T.x, dz = s.z - T.z, d = Math.hypot(dx, dz); if (d > 3) s.yaw = Math.atan2(-dx, -dz); }
      if (s.hop > 0) { s.hop -= dt / 0.28; s.x += Math.sin(s.yaw) * 0.9 * dt; s.z += Math.cos(s.yaw) * 0.9 * dt; }
      s.y = footY(s.x, s.z);
      if (s.t < 0) { s.st = R() < 0.6 ? 1 : 2; s.t = 3 + R() * 4; }
    } else if (s.st === 1) { s.y = footY(s.x, s.z); if (s.t < 0) { s.st = R() < 0.7 ? 0 : 2; s.t = 3 + R() * 5; } }
    else if (s.st === 2) {
      // 先蹿到树根，再绕着树干往上爬
      const bx = T.x + Math.cos(s.a) * T.r, bz = T.z + Math.sin(s.a) * T.r;
      if (s.h <= 0.01 && Math.hypot(bx - s.x, bz - s.z) > 0.08) { const g = Math.atan2(bx - s.x, bz - s.z); s.yaw = g; s.x += Math.sin(g) * 3 * dt; s.z += Math.cos(g) * 3 * dt; s.y = footY(s.x, s.z); }
      else { s.h += 1.6 * dt; s.a += 1.8 * dt; s.x = T.x + Math.cos(s.a) * T.r; s.z = T.z + Math.sin(s.a) * T.r; s.y = T.gy + s.h;
        const away = pa + Math.PI;
        if (s.h > 1.8 && Math.abs(wrap(s.a - away)) < 0.4 && pd < 9) { s.st = 3; s.t = 6 + R() * 6; }
        if (s.h > 3.6) { s.st = 5; s.t = 14 + R() * 20; } }
    } else if (s.st === 3) {
      // 贴在背着人的那一面：人绕过来，它也绕
      const away = pa + Math.PI; s.a += Math.max(-2 * dt, Math.min(2 * dt, wrap(away - s.a)));
      s.x = T.x + Math.cos(s.a) * T.r; s.z = T.z + Math.sin(s.a) * T.r; s.y = T.gy + s.h;
      if (s.t < 0) { s.st = pd < 5 ? 2 : 4; }
    } else if (s.st === 4) {
      s.h -= 1.2 * dt; s.a -= 1.2 * dt; s.x = T.x + Math.cos(s.a) * T.r; s.z = T.z + Math.sin(s.a) * T.r; s.y = T.gy + s.h;
      if (s.h <= 0) { s.h = 0; s.st = 0; s.t = 4; s.x = T.x + Math.cos(s.a) * (T.r + 0.3); s.z = T.z + Math.sin(s.a) * (T.r + 0.3); }
    } else { if (s.t < 0 && pd > 6) { s.st = 4; s.h = 3.4; } }
    if (s.st === 5) { if (!P.hidden(K[0])) for (const k of K) P.hide(k); return true; }
    // 摆
    const climbing = s.st >= 2 && s.st <= 4 && s.h > 0.05;
    if (climbing) {
      // 竖在树干上：头朝上（下树时头朝下），肚子贴着树
      const outA = s.a, nx = Math.cos(outA), nz = Math.sin(outA), yaw = Math.atan2(nx, nz) + Math.PI;
      trs(_b, s.x + nx * 0.03, s.y, s.z + nz * 0.03, yaw, s.st === 4 ? 1.5 : -1.5, 0);
    } else {
      const hop = s.hop > 0 ? 0.06 * Math.sin(Math.PI * (1 - s.hop)) : 0, sit = s.st === 1 ? -1.0 : 0;
      trs(_b, s.x, s.y + hop + (s.st === 1 ? 0.04 : 0), s.z, s.yaw, sit, 0);
    }
    P.place(K[0], _b);
    P.place(K[1], child(_m, _b, 0, 0.085, 0.085, 0.3 * Math.sin(c.t * 1.7), s.st === 1 ? 0.9 + 0.15 * Math.sin(c.t * 10) : 0.1, 0));
    P.place(K[2], child(_m, _b, 0, 0.07, -0.09, 0, climbing ? 0.6 : 0.15 * Math.sin(c.t * 2), 0.2 * Math.sin(c.t * 1.3)));
    for (let i = 0; i < 4; i++) { const front = i < 2, sx = i % 2 ? -1 : 1, sw = climbing ? 0.6 * Math.sin(c.t * 14 + i * 1.6) : s.hop > 0 ? 0.6 * Math.sin(Math.PI * (1 - s.hop)) * (front ? -1 : 1) : 0;
      P.place(K[3 + i], child(_m, _b, sx * 0.025, 0.06, front ? 0.05 : -0.05, 0, (s.st === 1 && front ? -1.2 : 0) + sw, sx * 0.1)); }
    return true;
  }

  // —— 鹿（清早林边） ——
  private stepDeer(c: Ctx, dt: number, day: Day): boolean {
    const R = this.R, D = this.deer;
    const dawn = c.hour > day.sr - 0.45 && c.hour < day.sr + 1.3 && c.rain < 0.5 && c.snow < 0.7;
    if (this.deerSt === 0 && dawn && this.deerDay !== this.dayN) {
      // 两处林边挑离人远、看得见的那一处
      const spots = [{ x: -128, z: -39, yaw: 0.6 }, { x: 78, z: -45, yaw: -0.4 }];
      const s = spots.sort((a, b) => Math.abs(Math.hypot(a.x - c.player.x, a.z - c.player.z) - 75) - Math.abs(Math.hypot(b.x - c.player.x, b.z - c.player.z) - 75))[0];
      this.deerAt = s; this.deerSt = 1; this.deerT = 0; this.deerDay = this.dayN;
      D.forEach((q, i) => { q.x = s.x + (i - 1) * 2.4 + (R() - 0.5); q.z = s.z + (R() - 0.5) * 2 + (i === 2 ? 1.2 : 0); q.yaw = s.yaw + (R() - 0.5) * 1.5; q.snap(i === 0 ? D_ALERT : D_GRAZE); q.v = 0; });
    }
    if (this.deerSt === 0) { if (!D[0].hidden) for (const q of D) q.hide(); return false; }
    this.deerT += dt;
    const pd = Math.hypot(c.player.x - this.deerAt.x, c.player.z - this.deerAt.z);
    if (this.deerSt === 1) {
      D.forEach((q, i) => { q.goal = (i === 0 && Math.sin(this.deerT * 0.4) > 0) || pd < 60 ? D_ALERT : D_GRAZE; q.v = 0; if (pd < 60) q.yaw = turnTo(q.yaw, Math.atan2(c.player.x - q.x, c.player.z - q.z), 1.5, dt); });
      if (pd < 45 || !dawn || this.deerT > 180) { this.deerSt = 2; this.deerT = 0; if (pd < 120) sfx(c, 'deer', this.deerAt.x, this.deerAt.z, 0.5); }
    } else if (this.deerSt === 2) {
      // 几纵跳进林子（往北），不见了
      D.forEach((q, i) => { if (this.deerT < i * 0.3) return; q.yaw = turnTo(q.yaw, Math.PI + (i - 1) * 0.3, 3, dt); q.v = Math.min(5, q.v + dt * 6); q.gait = 2; q.x += Math.sin(q.yaw) * q.v * dt; q.z += Math.cos(q.yaw) * q.v * dt; q.goal = D_STAND; });
      if (this.deerT > 7) { this.deerSt = 0; for (const q of D) q.hide(); return true; }
    }
    const dist = camDist(c, this.deerAt.x, this.deerAt.z);
    if (dist > 320) return false;
    for (const q of D) { _v.set(q.x, 0, q.z); clearOfTrees(_v); q.x = _v.x; q.z = _v.z; q.place(ground(q.x, q.z), dt, c.t, 1.6); }
    void inView; void lerp;
    return true;
  }
}
