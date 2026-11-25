/**
 * 羊群：一只黑山羊领头（长角、一撮胡子、短尾翘着），六只绵羊（毛团团的，脸上有的带墨点，耳朵耷拉在两边，肥尾巴垂着），
 * 开春另有两只羊羔跟着母羊。
 * 白天在东头村外那片草地上吃草：低着头一步一挪，嚼着，隔一阵抬头张望；晌午卧下反刍；羊羔撒欢、四蹄离地地蹦，钻到母羊肚子底下吃奶。
 * 走的时候头羊在前，别的松松地跟成一串，落后的小跑几步追上；人慢慢走近，近处的几只让开；人跑过来，整群挤成一团跑开。
 * 清早出圈、黄昏回圈（圈在丁家屋东头）。放羊的人来了，交给他：sheep.follow(人) / lead(x, z) / graze(x, z, r)，见 api.ts。
 */
import * as THREE from 'three';
import { M, V, cyl, merge, type Geo } from '../../core/geo';
import { mulberry32 } from '../../core/rng';
import { PIG, type RGB } from '../../ink/ink';
import { blocked } from '../../walk';
import type { Ctx } from '../person';
import { Parts, creatureMat, loftZ, paint, tone } from '../rig';
import { atHouse, clearOfTrees, footY } from '../spots';
import { route } from '../route';
import type { Mover, SheepApi } from './api';
import { bump, camDist, ell, inView, lerp, lumpy, mottle, rod, sfx, shadeBy, turnTo, wrap, type Day } from './kit';
import { Quad, limb, pose, type Pose, type QuadDims } from './quad';

const WOOL: RGB = [0.95, 0.93, 0.87], WOOL_D = tone([0.9, 0.86, 0.77], 1.15), LEG = tone([0.8, 0.77, 0.72], 1.5), HOOF = tone(PIG.jiao, 2.2), FACE: RGB = [0.94, 0.92, 0.88], SPOT = tone(PIG.mo, 1.9);
const GOAT = tone(PIG.mo, 3.2), GOAT_B = tone([0.62, 0.6, 0.58], 2.4), HORN = tone([0.8, 0.74, 0.62], 1.8);

const DS: QuadDims = { bodyY: 0.58, sh: [0.1, -0.05, 0.25], hip: [0.1, -0.04, -0.27], neck: [0.13, 0.37], tail: [0.08, -0.43], fu: 0.27, fl: 0.25, hu: 0.26, hl: 0.27, ear: [0.05, 0.135, 0.1] };
const DG: QuadDims = { bodyY: 0.6, sh: [0.085, -0.04, 0.23], hip: [0.085, -0.03, -0.25], neck: [0.11, 0.33], tail: [0.07, -0.4], fu: 0.29, fl: 0.27, hu: 0.28, hl: 0.29, ear: [0.045, 0.13, 0.1] };

function sheepGeo(spots: boolean, seed: number) {
  const body = lumpy(shadeBy(loftZ([[-0.47, 0.02, 0.06, 0.07], [-0.42, 0.03, 0.14, 0.15], [-0.28, 0.03, 0.19, 0.2], [-0.06, 0.02, 0.2, 0.21], [0.14, 0.03, 0.19, 0.2], [0.29, 0.06, 0.15, 0.165], [0.38, 0.1, 0.09, 0.1]], 10, 1.05), (_x, y, _z, o) => { const c = y < -0.1 ? WOOL_D : WOOL; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; }), 0.016, 38, seed);
  mottle(body, 0.06, seed);
  const face = (y: number, z: number, o: [number, number, number]) => { const c = spots && ((z > 0.2 && y < 0.11) || (Math.abs(z - 0.14) < 0.035 && y > 0.12)) ? SPOT : FACE; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; };
  const head = merge([
    lumpy(ell(0.1, 0.12, 0.12, WOOL, 8, 6).applyMatrix4(M.mul(M.t(0, 0.03, 0.03), M.rx(-0.5))), 0.012, 40, seed + 1),
    shadeBy(ell(0.064, 0.072, 0.125, FACE, 10, 7).applyMatrix4(M.mul(M.t(0, 0.12, 0.165), M.rx(0.55))), (_x, y, z, o) => face(y, z, o)),
    ell(0.022, 0.016, 0.014, HOOF).translate(0, 0.072, 0.255),
    lumpy(ell(0.065, 0.04, 0.06, WOOL, 7, 5).translate(0, 0.175, 0.12), 0.01, 50, seed + 2),
  ]);
  const ear = paint(ell(0.016, 0.055, 0.028, spots ? SPOT : FACE, 6, 4).translate(0, 0.04, 0), spots ? SPOT : FACE);
  // 肥尾：一团垂着
  const tail = lumpy(ell(0.06, 0.09, 0.045, WOOL, 7, 5).translate(0, -0.07, -0.015), 0.01, 40, seed + 3);
  const fu = limb(DS.fu, 0.026, 0.02, LEG, { mass: [0.055, 0.075, 0.06, 0.02, 0], massC: WOOL, seg: 5 });
  const fl = limb(DS.fl, 0.019, 0.017, LEG, { foot: [0.02, 0.018, 0.026, 0.006], footC: HOOF, seg: 5 });
  const hu = limb(DS.hu, 0.03, 0.021, LEG, { mass: [0.06, 0.085, 0.065, 0.025, 0.01], massC: WOOL, seg: 5 });
  const hl = limb(DS.hl, 0.018, 0.016, LEG, { foot: [0.02, 0.018, 0.026, 0.006], footC: HOOF, seg: 5 });
  return { body, head, tail, fu, fl, hu, hl, ear };
}
function goatGeo() {
  const body = shadeBy(loftZ([[-0.43, 0.04, 0.05, 0.06], [-0.37, 0.04, 0.11, 0.13], [-0.22, 0.03, 0.14, 0.17], [0.0, 0.01, 0.14, 0.18], [0.16, 0.03, 0.14, 0.18], [0.28, 0.07, 0.11, 0.14], [0.36, 0.11, 0.07, 0.09]], 10, 1.05), (_x, y, _z, o) => { const c = y < -0.12 ? GOAT_B : GOAT; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
  mottle(body, 0.08, 9);
  const head = merge([
    ell(0.07, 0.11, 0.08, GOAT, 8, 6).applyMatrix4(M.mul(M.t(0, 0.04, 0.04), M.rx(-0.45))),
    ell(0.05, 0.058, 0.11, GOAT, 10, 7).applyMatrix4(M.mul(M.t(0, 0.13, 0.16), M.rx(0.6))),
    ell(0.018, 0.014, 0.012, HOOF).translate(0, 0.085, 0.245),
    // 胡子：下巴底下一撮
    paint(cyl(0.004, 0.018, 0.08, 5).translate(0, -0.04, 0), GOAT).applyMatrix4(M.mul(M.t(0, 0.075, 0.2), M.rx(-0.25))),
    // 角：自额顶朝后弯
    ...[-1, 1].map((sx) => rod([V(sx * 0.025, 0.18, 0.13), V(sx * 0.045, 0.25, 0.08), V(sx * 0.06, 0.28, 0.0), V(sx * 0.07, 0.25, -0.07)], 0.016, 0.005, HORN)),
  ]);
  const ear = paint(ell(0.014, 0.05, 0.025, GOAT, 6, 4).translate(0, 0.035, 0), GOAT);
  const tail = paint(cyl(0.006, 0.02, 0.09, 5).translate(0, 0.045, 0), GOAT).applyMatrix4(M.rx(-0.5));
  const fu = limb(DG.fu, 0.026, 0.018, GOAT, { mass: [0.05, 0.09, 0.06, 0.06, 0], seg: 5 });
  const fl = limb(DG.fl, 0.017, 0.015, GOAT, { foot: [0.018, 0.016, 0.024, 0.006], footC: HOOF, seg: 5 });
  const hu = limb(DG.hu, 0.03, 0.019, GOAT, { mass: [0.06, 0.11, 0.07, 0.07, 0.01], seg: 5 });
  const hl = limb(DG.hl, 0.016, 0.014, GOAT, { foot: [0.018, 0.016, 0.024, 0.006], footC: HOOF, seg: 5 });
  return { body, head, tail, fu, fl, hu, hl, ear };
}
const STAND_S = pose({ y: 0.58, f: [0.06, -0.06, 0.06, -0.06], h: [-0.25, 0.42, -0.25, 0.42], ear: 0.55, tp: 0.1 });
const GRAZE_S = pose({ ...STAND_S, y: 0.56, pitch: 0.08, np: 1.05, f: [-0.05, 0.02, 0.08, -0.06] });
const LIE_S = pose({ y: 0.22, f: [-1.5, 2.9, -1.5, 2.9], h: [-1.45, 2.85, -1.45, 2.85], out: 0.3, roll: 0.08, np: 0.15, ear: 0.6, tp: 0.2 });
const STAND_G = pose({ y: 0.6, f: [0.06, -0.06, 0.06, -0.06], h: [-0.25, 0.42, -0.25, 0.42], ear: 0.2, tp: 0 });
const GRAZE_G = pose({ ...STAND_G, y: 0.58, pitch: 0.06, np: 1.0 });
const LIE_G = pose({ ...LIE_S, y: 0.24, ear: 0.2 });
/** 台子上看用 */
export const SHEEP = { DS, DG, STAND_S, GRAZE_S, LIE_S, STAND_G, GRAZE_G, LIE_G, sheepGeo, goatGeo };

const enum S { Graze, Walk, Look, Lie, Frisk, Nurse, Flee, Pen }
interface Sheep { q: Quad; kind: 'goat' | 'ewe' | 'lamb'; st: S; t: number; tx: number; tz: number; ox: number; oz: number; mum: Sheep | null; bleat: number; chew: number; i: number }

export class SheepFlock implements SheepApi {
  parts: Parts;
  private sh: Sheep[] = [];
  private R = mulberry32(606);
  center = new THREE.Vector3(); leader = new THREE.Vector3();
  home: { x: number; z: number };
  manual = false;
  /** 此刻的去处：graze 在一处散着吃；lead 赶到一处；follow 跟着人；pen 回圈 */
  private mode: 'graze' | 'lead' | 'follow' | 'pen' = 'pen';
  private ax = 0; private az = 0; private ar = 8; private who: Mover | null = null;
  private inPen = true; private alarm = 0; private last = 0;
  /** 整群歇着不叫的秒数：一只叫过，别的隔一阵再叫（一群九只各叫各的，在羊群边上几秒就是一声，太吵） */
  private hush = 0;
  /** 默认的草地（东头村外，村路北边那一片） */
  pasture = { x: 137.5, z: 22, r: 8 };
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.6, shade: 1.36 }), 'sheep'));
    const gG = goatGeo(), gS = [sheepGeo(false, 1), sheepGeo(true, 2), sheepGeo(false, 3)];
    const mk = (kind: Sheep['kind'], i: number, mum: Sheep | null = null): Sheep => {
      const q = kind === 'goat' ? new Quad(P, gG, DG) : new Quad(P, gS[i % 3], DS, kind === 'lamb' ? 0.55 : 0.92 + 0.12 * this.R());
      q.snap(kind === 'goat' ? STAND_G : STAND_S);
      return { q, kind, st: S.Graze, t: this.R() * 3, tx: 0, tz: 0, ox: 0, oz: 0, mum, bleat: 5 + this.R() * 30, chew: this.R() * 6, i };
    };
    this.sh.push(mk('goat', 0));
    for (let i = 0; i < 6; i++) this.sh.push(mk('ewe', i + 1));
    this.sh.push(mk('lamb', 7, this.sh[2]), mk('lamb', 8, this.sh[4]));
    P.build();
    const h = atHouse('d', 5.6, -0.6); this.home = { x: h.x, z: h.z };
    this.pickPasture();
    // 各自在群里大致的位置（松松地一团）
    this.sh.forEach((s, i) => { const a = i * 2.4, r = i === 0 ? 0 : 1.2 + 0.5 * (i % 3); s.ox = Math.cos(a) * r; s.oz = Math.sin(a) * r; s.q.x = this.home.x; s.q.z = this.home.z; s.q.hide(); });
    this.ax = this.pasture.x; this.az = this.pasture.z;
  }
  /** 挑一片空着的草地（别人在那里搭了棚、堆了东西就换一处） */
  private pickPasture() {
    const cands: Array<[number, number]> = [[146.5, 1.5], [138, 22], [112, -25], [62, -26], [146, 30]];
    let best = cands[0], bn = -1;
    for (const [x, z] of cands) {
      let n = 0;
      for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.283, r = 2 + (i % 4) * 1.5; if (!blocked(x + Math.cos(a) * r, z + Math.sin(a) * r, 'ground', 0.4)) n++; }
      if (n > bn) { bn = n; best = [x, z]; }
      if (n >= 15) break;
    }
    this.pasture.x = best[0]; this.pasture.z = best[1];
  }
  get present() { return !this.inPen; }
  get count() { return this.sh.filter((s) => s.kind !== 'lamb' || this.lambs).length; }
  private lambs = true;

  // —— 给放羊的人用（api.ts） ——
  lead(x: number, z: number) { this.mode = 'lead'; this.ax = x; this.az = z; this.ar = 3; this.outIfPenned(); }
  follow(who: Mover | null) { this.who = who; if (who) { this.mode = 'follow'; this.outIfPenned(); } else { this.mode = 'graze'; this.ax = this.center.x; this.az = this.center.z; this.ar = 5; } }
  graze(x: number, z: number, r = 7) { this.mode = 'graze'; this.ax = x; this.az = z; this.ar = r; this.outIfPenned(); }
  pen() { this.mode = 'pen'; if (this.manual) this.heldIn = true; }
  /** 放羊的人今天已经把羊赶回圈了：交还之后当天不再自己出圈 */
  private heldIn = false;
  out() { this.outIfPenned(); if (this.mode === 'pen') this.graze(this.pasture.x, this.pasture.z, this.pasture.r); }
  private outIfPenned() {
    if (!this.inPen) return;
    this.inPen = false;
    for (const s of this.sh) { s.q.x = this.home.x + (this.R() - 0.5) * 1.5; s.q.z = this.home.z + (this.R() - 0.5) * 1.5; s.st = S.Walk; s.t = 1 + this.R() * 2; }
  }

  update(c: Ctx, day: Day, pv: number) {
    const P = this.parts, R = this.R;
    this.lambs = c.season === 'spring' || c.season === 'summer';
    // 按时辰自己出圈、回圈（没交给别人管的时候）
    if (c.hour < day.sr || c.hour > day.ss + 1) this.heldIn = false;
    if (!this.manual) {
      const outT = day.fine && c.hour > day.sr + 1.2 && c.hour < day.ss - 0.6 && !this.heldIn;
      if (outT && this.inPen) { this.out(); }
      else if (!outT && !this.inPen && this.mode !== 'pen') this.pen();
      if (outT && this.mode === 'pen') this.graze(this.pasture.x, this.pasture.z, this.pasture.r);
    }
    // 中心
    let n = 0; this.center.set(0, 0, 0);
    for (const s of this.sh) if (s.st !== S.Pen && (s.kind !== 'lamb' || this.lambs)) { this.center.x += s.q.x; this.center.z += s.q.z; n++; }
    if (n) this.center.multiplyScalar(1 / n); else this.center.set(this.home.x, 0, this.home.z);
    this.leader.set(this.sh[0].q.x, 0, this.sh[0].q.z);
    const dist = camDist(c, this.center.x, this.center.z);
    if (this.inPen || dist > 190) {
      if (!this.sh[0].q.hidden) { for (const s of this.sh) s.q.hide(); P.commit(); }
      P.mesh.visible = false;
      if (c.wound || dist > 190) this.snap(c);
      return;
    }
    P.mesh.visible = true;
    const seen = inView(c, this.center.x, footY(this.center.x, this.center.z) + 0.5, this.center.z, 6);
    const stride = !seen ? 5 : dist < 40 ? 1 : dist < 90 ? 2 : 3;
    this.last += c.dt;
    if (c.frame % stride && !c.wound) return;
    const dt = Math.min(0.25, this.last); this.last = 0;
    this.alarm -= dt; this.hush -= dt;
    // 去处：跟人时在他身后，赶的时候朝着那一点
    let gx = this.ax, gz = this.az, gr = this.ar, moving = false;
    if (this.mode === 'follow' && this.who) {
      const w = this.who.pos, wy = this.who.yaw ?? Math.atan2(w.x - this.center.x, w.z - this.center.z);
      const wv = Math.hypot(w.x - this.fx, w.z - this.fz) / Math.max(dt, 1e-3); this.fx = w.x; this.fz = w.z;
      moving = wv > 0.2;
      gx = w.x - Math.sin(wy) * (moving ? 4.5 : 0); gz = w.z - Math.cos(wy) * (moving ? 4.5 : 0); gr = moving ? 2.2 : 4.5;
    } else if (this.mode === 'pen') { gx = this.home.x; gz = this.home.z; gr = 1.2; moving = true; }
    else if (this.mode === 'lead') { moving = Math.hypot(gx - this.center.x, gz - this.center.z) > 3; if (!moving) { this.mode = 'graze'; this.ar = 6; } }
    const run = pv > 2.2 && Math.hypot(c.player.x - this.center.x, c.player.z - this.center.z) < 9;
    if (run && this.alarm < 0) { this.alarm = 6; sfx(c, 'sheep', this.center.x, this.center.z, 0.6); }
    let inside = 0;
    for (const s of this.sh) {
      if (s.kind === 'lamb' && !this.lambs) { if (!s.q.hidden) s.q.hide(); continue; }
      if (s.st === S.Pen) { inside++; continue; }
      this.think(s, c, dt, gx, gz, gr, moving, run);
      const gy = footY(s.q.x, s.q.z);
      s.q.place(gy, dt, c.t, s.kind === 'lamb' ? 0.55 : 0.95);
    }
    if (this.mode === 'pen' && inside >= this.sh.filter((s) => s.kind !== 'lamb' || this.lambs).length) { this.inPen = true; for (const s of this.sh) s.st = S.Pen; }
    P.commit();
  }
  private fx = 0; private fz = 0;
  /** 头羊远行的路（沿总图的路网认的） */
  private path: Array<{ x: number; z: number }> = []; private pathTo = { x: 1e9, z: 1e9 };
  private waypoint(x: number, z: number, gx: number, gz: number, frame: number): [number, number] {
    if (Math.hypot(gx - this.pathTo.x, gz - this.pathTo.z) > 3) {
      if (Math.hypot(gx - x, gz - z) < 14) { this.path = []; this.pathTo = { x: gx, z: gz }; }
      else { const r = route(x, z, gx, gz, frame); if (r) { this.path = r.map((p) => ({ x: p[0], z: p[1] })); this.pathTo = { x: gx, z: gz }; } }
    }
    while (this.path.length && Math.hypot(this.path[0].x - x, this.path[0].z - z) < 1.5) this.path.shift();
    return this.path.length ? [this.path[0].x, this.path[0].z] : [gx, gz];
  }
  /** 时辰被拨过去了、或远了：直接到该在的地方 */
  private snap(c: Ctx) {
    if (this.inPen) return;
    // 跟着人的时候就在他周围；不然在吃草的那一处
    const ax = this.mode === 'follow' && this.who ? this.who.pos.x : this.ax, az = this.mode === 'follow' && this.who ? this.who.pos.z : this.az;
    for (const s of this.sh) { s.q.x = ax + s.ox * 1.5 + (this.R() - 0.5); s.q.z = az + s.oz * 1.5 + (this.R() - 0.5); s.st = S.Graze; s.t = this.R() * 4; s.q.snap(s.kind === 'goat' ? GRAZE_G : GRAZE_S); s.q.v = 0; }
    void c;
  }
  private walk(s: Sheep, tx: number, tz: number, speed: number, dt: number, stop = 0.2): number {
    const q = s.q, dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz);
    if (d < stop) { q.v = Math.max(0, q.v - dt * 2); return d; }
    const goal = Math.atan2(dx, dz);
    q.yaw = turnTo(q.yaw, goal, 2.2, dt);
    q.v += (speed * Math.max(0.15, Math.cos(wrap(goal - q.yaw))) * Math.min(1, 0.3 + d * 0.6) - q.v) * Math.min(1, dt * 3);
    const nx = q.x + Math.sin(q.yaw) * q.v * dt, nz = q.z + Math.cos(q.yaw) * q.v * dt;
    if (!blocked(nx, nz, 'ground', 0.25)) { q.x = nx; q.z = nz; } else { q.v *= 0.3; q.yaw += 0.6 * dt * (s.i % 2 ? 1 : -1); }
    _v.set(q.x, 0, q.z); clearOfTrees(_v); q.x = _v.x; q.z = _v.z;
    q.gait = q.v > 1.0 ? 1 : 0;
    return d;
  }
  private think(s: Sheep, c: Ctx, dt: number, gx: number, gz: number, gr: number, moving: boolean, run: boolean) {
    const q = s.q, R = this.R, goat = s.kind === 'goat';
    s.t -= dt; s.bleat -= dt;
    const STAND = goat ? STAND_G : STAND_S, GRAZE = goat ? GRAZE_G : GRAZE_S, LIE = goat ? LIE_G : LIE_S;
    // 叫一声：人在四十来米以内、整群这一阵没叫过才叫；叫过整群歇十几二十秒
    if (s.bleat < 0) {
      s.bleat = 30 + R() * 60;
      if (this.hush <= 0 && Math.hypot(c.player.x - q.x, c.player.z - q.z) < 45) { this.hush = 14 + R() * 18; sfx(c, s.kind === 'lamb' ? 'lamb' : goat ? 'goat' : 'sheep', q.x, q.z, s.kind === 'lamb' ? 0.32 : 0.4); }
    }
    // 回圈：走到圈门，不见了
    if (this.mode === 'pen') {
      q.goal = STAND;
      if (this.walk(s, this.home.x + s.ox * 0.3, this.home.z + s.oz * 0.3, 0.75, dt, 0.6) < 0.7) { s.st = S.Pen; q.hide(); }
      return;
    }
    // 人：慢慢走近，近处的让开；跑过来，整群跑开
    const px = c.player.x, pz = c.player.z, pd = Math.hypot(px - q.x, pz - q.z);
    if (run) { const a = Math.atan2(q.x - px, q.z - pz); s.st = S.Flee; s.tx = this.center.x + Math.sin(a) * 6 + s.ox * 0.5; s.tz = this.center.z + Math.cos(a) * 6 + s.oz * 0.5; s.t = 4; }
    else if (pd < 2.8 && s.st !== S.Flee) { const a = Math.atan2(q.x - px, q.z - pz); s.st = S.Walk; s.tx = q.x + Math.sin(a) * 2.5; s.tz = q.z + Math.cos(a) * 2.5; s.t = 3; }
    // 自己的位置：头羊在最前；羊羔跟着妈妈
    let tx = gx + s.ox, tz = gz + s.oz;
    if (goat && moving) { const w = this.waypoint(q.x, q.z, gx, gz, c.frame); tx = w[0]; tz = w[1]; }
    if (moving && !goat) { const L = this.sh[0].q, ly = L.yaw; tx = L.x - Math.sin(ly) * (1.2 + 0.7 * s.i) + Math.cos(ly) * s.ox * 0.5; tz = L.z - Math.cos(ly) * (1.2 + 0.7 * s.i) - Math.sin(ly) * s.ox * 0.5; }
    if (s.mum) { tx = s.mum.q.x + (s.i % 2 ? 0.5 : -0.5); tz = s.mum.q.z - 0.4; }
    const far = Math.hypot(tx - q.x, tz - q.z);
    switch (s.st) {
      case S.Flee: q.goal = STAND; this.walk(s, s.tx, s.tz, 1.6, dt, 0.4); if (s.t < 0) { s.st = S.Look; s.t = 2 + R() * 2; } break;
      case S.Walk: q.goal = STAND; if (this.walk(s, s.tx, s.tz, moving ? 0.9 : 0.55, dt) < 0.25 || s.t < 0) { s.st = S.Graze; s.t = 3 + R() * 5; } break;
      case S.Look:
        // 抬头张望、嚼着
        q.v = Math.max(0, q.v - dt * 2); q.goal = STAND; q.lookYaw = 0.5 * Math.sin(c.t * 0.5 + s.i);
        if (s.t < 0) { s.st = S.Graze; s.t = 4 + R() * 6; q.lookYaw = 0; }
        break;
      case S.Lie:
        q.v = 0; q.goal = LIE;
        if (s.t < 0 || moving) { s.st = S.Look; s.t = 2; }
        break;
      case S.Frisk: {
        // 羊羔撒欢：四蹄离地地蹦
        q.goal = STAND; const k = (s.t % 0.5) / 0.5; q.lift = 0.12 * bump(k); q.cur.pitch = 0.15 * Math.sin(k * Math.PI * 2);
        this.walk(s, s.tx, s.tz, 1.3, dt, 0.3);
        if (s.t < 0) { q.lift = 0; s.st = S.Graze; s.t = 2; }
        break;
      }
      case S.Nurse:
        // 钻到母羊肚子底下吃奶，尾巴直摇
        if (s.mum) { const m = s.mum.q; this.walk(s, m.x + Math.cos(m.yaw) * 0.18, m.z - Math.sin(m.yaw) * 0.18, 0.5, dt, 0.08); q.yaw = turnTo(q.yaw, m.yaw + Math.PI * 0.9, 2, dt); }
        q.goal = GRAZE; q.cur.np = -0.4; q.wag = 0.5; q.wagRate = 16;
        if (s.t < 0) { s.st = S.Graze; s.t = 3; q.wag = 0; }
        break;
      default: {
        // 吃草：低着头一步一挪；离自己的位置远了就走过去
        q.goal = GRAZE; q.lookYaw = 0;
        if (far > (moving ? 1.2 : gr * 0.6 + 1.5)) { s.st = S.Walk; s.tx = tx + (R() - 0.5) * 1.2; s.tz = tz + (R() - 0.5) * 1.2; s.t = 8; break; }
        // 一步一挪
        if (R() < dt * 0.35) { s.tx = q.x + Math.sin(q.yaw + (R() - 0.5)) * 0.35; s.tz = q.z + Math.cos(q.yaw + (R() - 0.5)) * 0.35; }
        if (s.tx) this.walk(s, s.tx, s.tz, 0.18, dt, 0.08);
        // 嚼
        q.cur.nr = 0.02 * Math.sin(c.t * 5 + s.i);
        if (s.t < 0) {
          const r = R(); s.t = 4 + R() * 8;
          const noon = c.hour > 11.5 && c.hour < 14;
          if (noon && r < 0.4 && !moving) { s.st = S.Lie; s.t = 20 + R() * 30; }
          else if (r < 0.25) { s.st = S.Look; s.t = 2 + R() * 3; }
          else if (s.kind === 'lamb' && r < 0.55) { s.st = S.Frisk; s.t = 1.5 + R() * 1.5; const a = R() * 6.28; s.tx = q.x + Math.cos(a) * 2.5; s.tz = q.z + Math.sin(a) * 2.5; }
          else if (s.kind === 'lamb' && r < 0.75) { s.st = S.Nurse; s.t = 5 + R() * 5; }
        }
      }
    }
  }
}
const _v = new THREE.Vector3();
export type { Pose };
void lerp;
