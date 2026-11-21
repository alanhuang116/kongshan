/**
 * 鸭。
 *   溪上一群五只（三只白鸭、一对麻鸭）：白天在石桥下游那一段，排成松松的一溜跟着领头的游，时而扎个猛子屁股朝天、
 *     扭头理羽、在水上立起来扑扇翅膀抖水；人到岸边近了就划开。日头偏西了顺水往下游的鸭栏那边去，
 *     黄昏上岸，在栏西边的岸上摇摇摆摆地找吃的，天擦黑自己钻进栏里；清早从栏口下水，再游回桥下。
 *     「赶鸭」那件事：黄昏时绕到它们后头慢慢往栏口赶；跑急了它们扑通扑通跳回水里，过一会儿才又上岸。
 *   屋后池里一对鸳鸯：雄的头上一道白眉、背上一对橘黄的「帆」，雌的灰褐、眼后一道白；一前一后地游，晌午在岸边歇。
 */
import * as THREE from 'three';
import { M, V, box, merge, type Geo } from '../../core/geo';
import { mulberry32 } from '../../core/rng';
import { PIG, type RGB } from '../../ink/ink';
import { SITE, STREAM, streamAt } from '../../site';
import { blocked, waterDepth } from '../../walk';
import type { Ctx } from '../person';
import { Parts, child, creatureMat, loftZ, paint, tone, trs } from '../rig';
import { DUCK_REACH, footY } from '../spots';
import { OCHRE, WHITE, bump, camDist, clamp01, ell, lerp, mottle, mul, rod, shadeBy, sm, turnTo, wrap, type Day } from './kit';

interface DuckLook { body: RGB; back?: RGB; head: RGB; neck?: RGB; bill: RGB; ring?: boolean; brow?: boolean; sail?: RGB }
function duckGeo(L: DuckLook, s = 1) {
  const back = L.back ?? L.body;
  const body = shadeBy(loftZ([[-0.175, 0.055, 0.02, 0.022], [-0.14, 0.04, 0.055, 0.042], [-0.07, 0.03, 0.088, 0.062], [0.02, 0.03, 0.095, 0.066], [0.1, 0.036, 0.082, 0.064], [0.155, 0.055, 0.052, 0.05], [0.18, 0.072, 0.03, 0.032]], 11, 1.0), (_x, y, _z, o) => {
    const c = y > 0.06 ? back : L.body; o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  mottle(body, L.back ? 0.08 : 0.03, 4);
  const parts: Geo[] = [body];
  // 鸳鸯雄的背上一对竖起来的「帆」：橘黄的小扇，贴着背的两侧
  if (L.sail) for (const sx of [-1, 1]) parts.push(ell(0.007, 0.036, 0.03, L.sail, 7, 5).applyMatrix4(M.mul(M.t(sx * 0.04, 0.095, -0.03), M.rx(0.35), M.rz(sx * 0.18))));
  // 头颈：原点在颈根（胸前上方）
  const nc = L.neck ?? L.head;
  const hp: Geo[] = [
    rod([V(0, -0.01, -0.01), V(0, 0.05, 0.012), V(0, 0.1, 0.02)], 0.03, 0.024, nc),
    ell(0.034, 0.034, 0.043, L.head, 10, 7).translate(0, 0.115, 0.035),
    paint(box(0.032, 0.011, 0.058), L.bill).applyMatrix4(M.mul(M.t(0, 0.104, 0.092), M.rx(0.12))),
    ell(0.005, 0.005, 0.004, tone(PIG.jiao, 2.6)).translate(0.026, 0.122, 0.05), ell(0.005, 0.005, 0.004, tone(PIG.jiao, 2.6)).translate(-0.026, 0.122, 0.05),
  ];
  if (L.ring) hp.push(ell(0.027, 0.006, 0.026, WHITE).translate(0, 0.03, 0.01));
  // 眼后一道白眉，往脑后拖去
  if (L.brow) for (const sx of [-1, 1]) hp.push(ell(0.004, 0.007, 0.026, WHITE).applyMatrix4(M.mul(M.t(sx * 0.031, 0.128, 0.022), M.rx(-0.25))));
  const head = merge(hp);
  const wing = shadeBy(ell(0.03, 0.022, 0.11, back, 8, 5).translate(0, 0, -0.07), (_x, _y, z, o) => { const k = z < -0.12 ? 0.85 : 1; o[0] = back[0] * k; o[1] = back[1] * k; o[2] = back[2] * k; });
  // 脚：橘黄的跖与蹼（上岸才露出来）
  const legC = tone([0.95, 0.72, 0.42], 1.3);
  const leg = merge([paint(box(0.008, 0.07, 0.008).translate(0, -0.035, 0), legC), paint(box(0.04, 0.004, 0.05).translate(0, -0.07, 0.02), legC)]);
  const k = s;
  return { body: body.scale(k, k, k), head: head.scale(k, k, k), wing: wing.scale(k, k, k), leg: leg.scale(k, k, k), sails: parts.length > 1 ? merge(parts.slice(1)).scale(k, k, k) : null };
}

/** 溪上某个里程处的一点（lat 偏离中线多少，朝左岸为正）：位置、水面高、水流方向 */
function onStream(s: number, lat: number, out: { x: number; z: number; y: number; tx: number; tz: number }) {
  let i = 1; while (i < STREAM.length - 1 && STREAM[i].s < s) i++;
  const a = STREAM[i - 1], b = STREAM[i], k = Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s || 1))), l = Math.hypot(b.x - a.x, b.z - a.z) || 1, tx = (b.x - a.x) / l, tz = (b.z - a.z) / l;
  out.x = lerp(a.x, b.x, k) - tz * lat; out.z = lerp(a.z, b.z, k) + tx * lat; out.y = lerp(a.y, b.y, k); out.tx = tx; out.tz = tz;
}
/** 溪上离 (x, z) 最近处的里程 */
function streamS(x: number, z: number): number { let bs = 0, bd = 1e9; for (const p of STREAM) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; bs = p.s; } } return bs; }

const enum M_ { Swim, Land, Pen, Dive }
interface Duck {
  i: number; k: number[]; mode: M_; x: number; z: number; y: number; yaw: number; v: number;
  s: number; lat: number; ts: number; tl: number; tx: number; tz: number;
  t: number; dab: number; preen: number; flap: number; ph: number; climb: number; cx: number; cz: number; cy: number; cyaw: number;
  bold: number;
}
const _o = { x: 0, z: 0, y: 0, tx: 0, tz: 0 }, _b = new THREE.Matrix4(), _m = new THREE.Matrix4();

export class Ducks {
  parts: Parts;
  private flock: Duck[] = [];
  private pair: Duck[] = [];
  private R = mulberry32(31); private quack = 9;
  /** 鸭栏：栏心、栏口（朝水那一面）；栏西边黄昏上岸找吃的那一片 */
  pen = { x: SITE.more.duckPen.x, z: SITE.more.duckPen.z + 0.6, r: 1.5, gate: { x: SITE.more.duckPen.x, z: SITE.more.duckPen.z + 0.6 + 1.25 } };
  bank = { x0: 48.6, x1: 53.6, z0: 25.6, z1: 27.7 };
  private penS = 0; private gateLat = 0;
  /** 有人在赶（赶鸭那件事开着） */
  herding = false;
  /** 进栏了几只 */
  get inPen() { return this.flock.filter((d) => d.mode === M_.Pen).length; }
  get total() { return this.flock.length; }
  /** 此刻在岸上（等着进栏）的有几只 */
  get onBank() { return this.flock.filter((d) => d.mode === M_.Land).length; }
  /** 鸭群在哪（赶鸭用） */
  center(out: THREE.Vector3) { let n = 0; out.set(0, 0, 0); for (const d of this.flock) if (d.mode !== M_.Pen) { out.x += d.x; out.z += d.z; n++; } if (n) out.multiplyScalar(1 / n); else out.set(this.pen.x, 0, this.pen.z); out.y = footY(out.x, out.z); return out; }

  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.8, shade: 1.38 }), 'ducks'));
    const bill = tone([0.96, 0.8, 0.45], 1.25);
    const looks: DuckLook[] = [
      { body: WHITE, head: WHITE, bill },
      { body: tone([0.88, 0.8, 0.68], 1.35), back: tone([0.78, 0.68, 0.56], 1.55), head: tone([0.8, 0.7, 0.58], 1.6), bill: tone([0.86, 0.72, 0.5], 1.5) },
      { body: tone([0.86, 0.85, 0.82], 1.4), back: tone([0.74, 0.72, 0.68], 1.6), head: tone([0.62, 0.74, 0.64], 2.0), neck: tone([0.62, 0.74, 0.64], 2.0), bill, ring: true },
      // 鸳鸯：雄、雌
      { body: tone([0.9, 0.82, 0.68], 1.3), back: tone([0.6, 0.58, 0.56], 2.0), head: tone([0.58, 0.6, 0.58], 2.2), neck: tone([0.74, 0.62, 0.62], 1.9), bill: tone(PIG.zhu, 1.1), brow: true, sail: tone([0.94, 0.68, 0.42], 1.35) },
      { body: tone([0.84, 0.8, 0.74], 1.5), back: tone([0.72, 0.68, 0.62], 1.7), head: tone([0.76, 0.74, 0.7], 1.8), bill: tone([0.7, 0.66, 0.6], 1.8), brow: true },
    ];
    const G = looks.map((L, i) => duckGeo(L, i >= 3 ? 0.82 : 1));
    const R = this.R;
    const mk = (look: number, pond: boolean): Duck => {
      const g = G[look];
      const k = [P.add(g.body), P.add(g.head), P.add(g.wing), P.add(g.wing.clone().scale(-1, 1, 1)), P.add(g.leg), P.add(g.leg)];
      if (g.sails) k.push(P.add(g.sails));
      const d: Duck = { i: 0, k, mode: M_.Swim, x: 0, z: 0, y: 0, yaw: R() * 6.28, v: 0, s: lerp(DUCK_REACH.s0, DUCK_REACH.s1, R()), lat: (R() - 0.5) * 1.4, ts: 0, tl: 0, tx: 0, tz: 0, t: R() * 5, dab: 0, preen: 0, flap: 0, ph: R() * 6, climb: -1, cx: 0, cz: 0, cy: 0, cyaw: 0, bold: R() };
      if (pond) { d.s = R() * 6.28; d.lat = 0.3 + 0.3 * R(); }
      d.ts = d.s; d.tl = d.lat;
      return d;
    };
    this.flock.push(mk(0, false), mk(2, false), mk(0, false), mk(1, false), mk(0, false));
    this.pair.push(mk(3, true), mk(4, true));
    this.flock.forEach((d, i) => { d.i = i; d.s = DUCK_REACH.s0 + 3 + i * 1.6; });
    this.pair.forEach((d, i) => { d.i = i; });
    P.build();
    this.penS = streamS(this.pen.gate.x, this.pen.gate.z + 1.2);
    onStream(this.penS, 0, _o); this.gateLat = Math.max(-1.3, Math.min(1.3, (this.pen.gate.x - _o.x) * -_o.tz + (this.pen.gate.z - _o.z) * _o.tx));
  }

  update(c: Ctx, day: Day, pv: number) {
    const P = this.parts, R = this.R;
    const dS = camDist(c, (DUCK_REACH.s0 > 0 ? 18 : 0), 31), dP = camDist(c, SITE.pond.x, SITE.pond.z), dPen = camDist(c, this.pen.x, this.pen.z);
    const near = Math.min(dS, dPen, Math.hypot(c.camPos.x - this.flock[0].x, c.camPos.z - this.flock[0].z));
    const { sr, ss } = day;
    // 一天里的几段：清早出栏下水 → 白天在桥下 → 偏西了往下游 → 黄昏上岸 → 天黑进栏
    const h = c.hour;
    const phase = h < sr + 0.25 || h > ss + 0.45 ? 'pen' : h < ss - 1.3 ? 'day' : h < ss - 0.55 ? 'down' : 'bank';
    this.quack -= c.dt;
    if (this.quack < 0) { this.quack = 12 + R() * 22; const d = this.flock[Math.floor(R() * this.flock.length)]; if (d.mode !== M_.Pen && Math.hypot(c.player.x - d.x, c.player.z - d.z) < 45) c.sfx('duck', d.x, d.z, 0.3 + 0.3 * R()); }
    let shown = false;
    if (near < 200 || c.wound) {
      const stride = near < 35 ? 1 : near < 80 ? 2 : 4;
      if (c.frame % stride === 0 || c.wound) {
        const dt = Math.min(0.25, c.dt * stride);
        for (const d of this.flock) this.stepFlock(d, c, dt, phase, pv);
      }
      shown = true;
    } else for (const d of this.flock) this.snapFlock(d, phase);
    if (dP < 140 || c.wound) {
      const stride = dP < 35 ? 1 : 3;
      if (c.frame % stride === 0 || c.wound) { const dt = Math.min(0.25, c.dt * stride); for (const d of this.pair) this.stepPond(d, c, dt, day); }
      shown = true;
    }
    P.mesh.visible = shown;
    if (!shown) return;
    for (const d of this.flock) this.place(d, c);
    for (const d of this.pair) this.place(d, c);
    P.commit();
  }

  /** 远了、没人看着：直接到这一段该在的地方 */
  private snapFlock(d: Duck, phase: string) {
    if (phase === 'pen') { if (d.mode !== M_.Pen) { d.mode = M_.Pen; d.x = this.pen.x; d.z = this.pen.z; } return; }
    if (phase === 'bank') { if (d.mode !== M_.Pen && d.mode !== M_.Land) { d.mode = M_.Land; d.x = lerp(this.bank.x0, this.bank.x1, this.R()); d.z = lerp(this.bank.z0, this.bank.z1, this.R()); d.tx = d.x; d.tz = d.z; } return; }
    if (d.mode === M_.Pen || d.mode === M_.Land) { d.mode = M_.Swim; d.s = phase === 'down' ? this.penS - 4 - d.i * 1.5 : DUCK_REACH.s0 + 3 + d.i * 1.6; d.lat = (this.R() - 0.5) * 1.2; d.ts = d.s; d.tl = d.lat; }
  }

  private stepFlock(d: Duck, c: Ctx, dt: number, phase: string, pv: number) {
    const R = this.R, prev = d.i > 0 ? this.flock[d.i - 1] : null;
    if (c.wound) this.snapFlock(d, phase);
    d.t -= dt; d.dab = Math.max(0, d.dab - dt); d.preen = Math.max(0, d.preen - dt); d.flap = Math.max(0, d.flap - dt);
    const pdx = d.x - c.player.x, pdz = d.z - c.player.z, pd = Math.hypot(pdx, pdz);
    if (d.mode === M_.Pen) {
      // 清早出栏：从栏口下水
      if (phase === 'day' || phase === 'down') { d.mode = M_.Swim; d.s = this.penS + (R() - 0.5) * 2; d.lat = (R() - 0.5) * 1; d.ts = phase === 'day' ? lerp(DUCK_REACH.s0, DUCK_REACH.s1, R()) : this.penS - 3; d.tl = d.lat; }
      return;
    }
    if (d.climb >= 0) {
      // 上岸、下水的那一下：一扑一扭
      d.climb += dt / 0.8;
      const k = Math.min(1, d.climb);
      d.x = lerp(d.cx, d.tx, k); d.z = lerp(d.cz, d.tz, k);
      if (k >= 1) { d.climb = -1; if (d.mode === M_.Swim) { d.s = streamS(d.x, d.z); onStream(d.s, 0, _o); d.lat = Math.max(-1.3, Math.min(1.3, (d.x - _o.x) * -_o.tz + (d.z - _o.z) * _o.tx)); d.ts = d.s; d.tl = d.lat; } }
      return;
    }
    if (d.mode === M_.Swim) {
      // —— 水上 ——
      const scared = pd < 2.6;
      let goalS = d.ts, goalL = d.tl;
      if (phase === 'day') {
        if (d.t < 0) {
          d.t = 4 + R() * 7;
          if (!prev || R() < 0.35) { d.ts = lerp(DUCK_REACH.s0, DUCK_REACH.s1, R()); d.tl = (R() - 0.5) * 1.8; }
          const r = R(); if (r < 0.25) d.dab = 2.4; else if (r < 0.4) d.preen = 3; else if (r < 0.47) { d.flap = 1.2; if (pd < 30) c.sfx('flap', d.x, d.z, 0.4); }
        }
        // 跟着前面那只：松松地一溜
        if (prev && prev.mode === M_.Swim && R() < 0.85) { goalS = prev.s - 0.9 - 0.3 * (d.i % 2); goalL = prev.lat + (d.i % 2 ? 0.35 : -0.3); }
      } else if (phase === 'down' || phase === 'bank' || phase === 'pen') {
        // 顺水往下游的鸭栏去；到了栏口一带就上岸
        goalS = this.penS - 1.5 - d.i * 0.9; goalL = -1.0 + 0.4 * (d.i % 3);
        // 有人在赶：水里的径直游到栏口进去
        if (this.herding && phase !== 'down') { goalS = this.penS; goalL = this.gateLat; if (Math.hypot(d.x - this.pen.gate.x, d.z - this.pen.gate.z) < 2.2) { this.enterPen(d); return; } }
        if (phase !== 'down' && !this.herding && Math.abs(d.s - goalS) < 3 && d.t < 0) {
          const bx = lerp(this.bank.x0, this.bank.x1, R()), bz = lerp(this.bank.z0, this.bank.z1 - 0.3, R());
          if (phase === 'pen' || (this.herding && Math.hypot(d.x - this.pen.gate.x, d.z - this.pen.gate.z) < 2.2)) { this.enterPen(d); return; }
          d.mode = M_.Land; d.climb = 0; d.cx = d.x; d.cz = d.z; d.cy = d.y; d.tx = bx; d.tz = bz; d.cyaw = footY(bx, bz); d.t = 2 + R() * 3;
          return;
        }
      }
      if (scared) {
        // 人在哪一侧，就往另一侧划
        onStream(d.s, 0, _o);
        const lp = (c.player.x - _o.x) * -_o.tz + (c.player.z - _o.z) * _o.tx;
        goalL = Math.max(-1.3, Math.min(1.3, d.lat - Math.sign(lp - d.lat || 1) * 0.9)); goalS = d.s + 0.4; d.dab = 0;
      }
      goalL = Math.max(-1.3, Math.min(1.3, goalL));
      // 朝要去的里程、偏移慢慢划
      const ds = goalS - d.s, dl = goalL - d.lat, dist = Math.hypot(ds, dl);
      if (d.dab <= 0 && dist > 0.15) {
        const sp = (scared ? 0.7 : phase === 'day' ? 0.22 : 0.4) * Math.min(1, dist);
        d.s += (ds / dist) * sp * dt; d.lat += (dl / dist) * sp * dt * 0.6;
        d.v = sp;
      } else d.v *= Math.max(0, 1 - dt * 2);
      // 顺水漂一点
      d.s += 0.02 * dt;
      onStream(d.s, d.lat, _o);
      const want = Math.atan2(_o.tx * Math.sign(ds || 1) - _o.tz * (dl * 0.3), _o.tz * Math.sign(ds || 1) + _o.tx * (dl * 0.3));
      if (d.v > 0.03) d.yaw = turnTo(d.yaw, want, 1.6, dt);
      d.x = _o.x; d.z = _o.z; d.y = _o.y;
      return;
    }
    // —— 岸上（黄昏，栏西边）——
    d.y = footY(d.x, d.z);
    // 人跑过来：扑通扑通跳回水里
    if (pv > 2.2 && pd < 5) { this.toWater(d); c.sfx('duck', d.x, d.z, 0.6); return; }
    if (phase === 'pen' && !this.herding && d.t < 0) { d.tx = this.pen.gate.x - 0.6; d.tz = this.pen.gate.z - 0.4; d.t = 99; }
    // 赶：人在身后就往前（往栏口）走；人在 4 米内就躲开他
    let fx = 0, fz = 0;
    if (pd < 4.2) { const k = (4.2 - pd) / 4.2; fx += (pdx / (pd || 1)) * k * 1.6; fz += (pdz / (pd || 1)) * k * 1.6; }
    const gx = this.pen.gate.x - 0.5 - d.x, gz = this.pen.gate.z - 0.35 - d.z, gd = Math.hypot(gx, gz);
    if (pd < 4.2 && (fx * gx + fz * gz) > -0.3 * gd) { fx += (gx / (gd || 1)) * 0.8; fz += (gz / (gd || 1)) * 0.8; }
    // 合群：往大伙儿那里靠
    let mx = 0, mz = 0, n = 0;
    for (const o of this.flock) if (o !== d && o.mode === M_.Land) { mx += o.x; mz += o.z; n++; const ox = d.x - o.x, oz = d.z - o.z, od = Math.hypot(ox, oz); if (od < 0.35 && od > 1e-3) { fx += (ox / od) * 0.6; fz += (oz / od) * 0.6; } }
    if (n) { mx /= n; mz /= n; const cd = Math.hypot(mx - d.x, mz - d.z); if (cd > 1.2) { fx += ((mx - d.x) / cd) * 0.3; fz += ((mz - d.z) / cd) * 0.3; } }
    const push = Math.hypot(fx, fz);
    if (push > 0.25) { d.tx = d.x + (fx / push) * 0.8; d.tz = d.z + (fz / push) * 0.8; d.t = 1.5; }
    else if (d.t < 0) {
      // 自己找吃的：东一嘴西一嘴，也有不听话的往西溜
      d.t = 2 + R() * 4;
      if (R() < 0.6) { d.tx = Math.max(this.bank.x0 - 2, Math.min(this.bank.x1, d.x + (R() - 0.6) * 1.2)); d.tz = Math.max(this.bank.z0, Math.min(this.bank.z1, d.z + (R() - 0.5) * 1)); }
      else { d.dab = 1.2; }
    }
    // 走（摇摇摆摆）
    const dx = d.tx - d.x, dz = d.tz - d.z, dist = Math.hypot(dx, dz);
    if (dist > 0.06 && d.dab <= 0) {
      const sp = (push > 0.25 ? 0.75 : 0.3) * Math.min(1, dist * 2);
      d.yaw = turnTo(d.yaw, Math.atan2(dx, dz), 5, dt);
      const nx = d.x + Math.sin(d.yaw) * sp * dt, nz = d.z + Math.cos(d.yaw) * sp * dt;
      if (!blocked(nx, nz, 'ground', 0.08) || Math.hypot(nx - this.pen.gate.x, nz - this.pen.gate.z) < 1.2) { d.x = nx; d.z = nz; } else d.t = 0;
      d.v = sp;
      // 走进了水里：就游
      if (waterDepth(d.x, d.z) > 0.08 && Math.hypot(d.x - this.pen.gate.x, d.z - this.pen.gate.z) > 1.4) { this.toWater(d); return; }
    } else d.v *= Math.max(0, 1 - dt * 4);
    // 到了栏口：一摇一摆进去
    if (Math.hypot(d.x - this.pen.gate.x, d.z - this.pen.gate.z) < 1.15 || Math.hypot(d.x - this.pen.x, d.z - this.pen.z) < this.pen.r + 0.2) this.enterPen(d);
  }
  private enterPen(d: Duck) { d.mode = M_.Pen; d.v = 0; d.x = this.pen.x; d.z = this.pen.z; for (const k of d.k) this.parts.hide(k); }
  private toWater(d: Duck) {
    // 最近的水面
    let best: [number, number] | null = null, bd = 1e9;
    for (let a = 0; a < 12; a++) for (const r of [1, 1.8, 2.6]) { const x = d.x + Math.cos(a * 0.52) * r, z = d.z + Math.sin(a * 0.52) * r; if (waterDepth(x, z) > 0.15) { const dd = r; if (dd < bd) { bd = dd; best = [x, z]; } } }
    if (!best) { const s = streamS(d.x, d.z); onStream(s, 0, _o); best = [_o.x, _o.z]; }
    d.mode = M_.Swim; d.climb = 0; d.cx = d.x; d.cz = d.z; d.cy = footY(d.x, d.z); d.tx = best[0]; d.tz = best[1]; d.cyaw = streamAt(best[0], best[1]).y; d.t = 6 + this.R() * 5; d.flap = 0.6;
  }
  /** 赶鸭那件事一开：岸上的不再自己进栏，等人赶 */
  herd(on: boolean) { this.herding = on; }

  private stepPond(d: Duck, c: Ctx, dt: number, day: Day) {
    const R = this.R, Pd = SITE.pond, mate = this.pair[1 - d.i];
    d.t -= dt; d.dab = Math.max(0, d.dab - dt); d.preen = Math.max(0, d.preen - dt);
    const out = c.hour > day.sr - 0.2 && c.hour < day.ss + 0.4;
    if (!out) { d.mode = M_.Pen; return; }
    if (d.mode === M_.Pen) { d.mode = M_.Swim; }
    if (d.t < 0) {
      d.t = 5 + R() * 9;
      if (d.i === 1) { d.ts = R() * 6.28; d.tl = 0.15 + 0.5 * R(); } // 雌的领着
      const r = R(); if (r < 0.2) d.dab = 2.2; else if (r < 0.4) d.preen = 3;
    }
    let gx: number, gz: number;
    if (d.i === 0) { gx = mate.x - Math.sin(mate.yaw) * 0.55 + Math.cos(mate.yaw) * 0.18; gz = mate.z - Math.cos(mate.yaw) * 0.55 - Math.sin(mate.yaw) * 0.18; }
    else { gx = Pd.x + Math.cos(d.ts) * Pd.rx * d.tl; gz = Pd.z + Math.sin(d.ts) * Pd.rz * d.tl; }
    if (d.x === 0 && d.z === 0) { d.x = gx + (R() - 0.5); d.z = gz; }
    const pd = Math.hypot(c.player.x - d.x, c.player.z - d.z);
    if (pd < 2.4) { gx = d.x + (d.x - c.player.x) * 1.5; gz = d.z + (d.z - c.player.z) * 1.5; }
    const dx = gx - d.x, dz = gz - d.z, dist = Math.hypot(dx, dz);
    if (d.dab <= 0 && dist > 0.12) { const sp = (pd < 2.4 ? 0.6 : 0.2) * Math.min(1, dist); d.yaw = turnTo(d.yaw, Math.atan2(dx, dz), 1.4, dt); d.x += Math.sin(d.yaw) * sp * dt; d.z += Math.cos(d.yaw) * sp * dt; d.v = sp; }
    else d.v *= 0.95;
    // 别出了池
    const e = Math.hypot((d.x - Pd.x) / Pd.rx, (d.z - Pd.z) / Pd.rz);
    if (e > 0.82) { d.x = Pd.x + (d.x - Pd.x) * 0.82 / e; d.z = Pd.z + (d.z - Pd.z) * 0.82 / e; }
    d.y = Pd.y;
  }

  private place(d: Duck, c: Ctx) {
    const P = this.parts, K = d.k, t = c.t;
    if (d.mode === M_.Pen) { if (!P.hidden(K[0])) for (const k of K) P.hide(k); return; }
    const land = d.mode === M_.Land;
    d.ph += c.dt * (1.2 + d.v * (land ? 18 : 6));
    let y = d.y;
    if (d.climb >= 0) { const k = Math.min(1, d.climb); y = lerp(d.cy, d.cyaw, k) + 0.12 * bump(k); }
    const tip = d.dab > 0 ? sm(Math.min(1, (2.4 - d.dab) * 2.5)) * sm(d.dab * 2.5) : 0;
    const flap = d.flap > 0 ? bump(1 - d.flap / 1.2) : 0;
    const waddle = land ? 0.16 * Math.sin(d.ph) * Math.min(1, d.v * 4) : 0;
    const lift = land ? 0.075 : 0;
    trs(_b, d.x, y + lift + 0.006 * Math.sin(d.ph) - 0.03 * tip + 0.07 * flap, d.z, d.yaw, 1.1 * tip - 0.5 * flap + 0.03 * Math.sin(d.ph * 0.7), waddle + 0.03 * Math.sin(d.ph * 0.9));
    P.place(K[0], _b);
    const pre = d.preen > 0 ? bump(Math.min(1, (3 - d.preen) / 3)) : 0;
    P.place(K[1], child(_m, _b, 0, 0.065, 0.165, 0.25 * Math.sin(t * 0.5 + d.ph) * (1 - tip) + 2.3 * pre * (d.i % 2 ? 1 : -1), 0.5 * tip + 0.05 * Math.sin(d.ph * 1.3) + 0.5 * pre - 0.4 * flap, 0));
    for (let n = 0; n < 2; n++) {
      const sx = n ? -1 : 1, fl = flap > 0 ? 1.1 + 0.6 * Math.sin(t * 24) : 0;
      P.place(K[2 + n], child(_m, _b, sx * 0.062, 0.07, 0.04, 0, -0.08 - 0.3 * flap, sx * (0.05 + fl * flap)));
    }
    if (land || d.climb >= 0) {
      for (let n = 0; n < 2; n++) { const sx = n ? -1 : 1; P.place(K[4 + n], child(_m, _b, sx * 0.035, 0.0, -0.01, 0, 0.5 * Math.sin(d.ph + n * Math.PI) * Math.min(1, d.v * 4), -waddle)); }
    } else { P.hide(K[4]); P.hide(K[5]); }
    if (K[6] != null) P.place(K[6], _b);
  }
}
void clamp01; void mul; void OCHRE; void wrap;
