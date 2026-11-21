/**
 * 毛驴：一头灰驴——灰毛，嘴头子、肚皮发白，背上一道黑脊、肩上一道黑横纹（驴身上都有的十字），两只长耳朵，尾梢一撮黑。
 * 白天拴在碓房东头的木桩上（舂米的人用它驮谷袋），绳够得着的地方低头啃草；站着打盹时脑袋耷拉、耳朵撇向两边、一条后腿虚点着地；
 * 尾巴一甩一甩赶虫，两只耳朵各转各的；隔一阵扬起脖子「昂——昂——」叫一声。夜里、雨天牵回戊家。
 * 给别处用（api.ts）：拴（tether）、拉磨（circle：蒙上眼绕着磨盘转）、牵着走（follow）、驮东西（load）。
 */
import * as THREE from 'three';
import { M, V, box, cyl, cylUp, lathe, merge } from '../../core/geo';
import { mulberry32 } from '../../core/rng';
import { PIG, type RGB } from '../../ink/ink';
import { pathDist, waterAt } from '../../site';
import { blocked } from '../../walk';
import type { Ctx } from '../person';
import { Parts, child, creatureMat, loftZ, paint, span, tone, trs } from '../rig';
import { MILL, clearOfTrees, footY } from '../spots';
import type { DonkeyApi, Mover } from './api';
import { camDist, ell, inView, mottle, rod, sfx, shadeBy, turnTo, wrap, type Day } from './kit';
import { Quad, limb, pose, type QuadDims } from './quad';

const COAT = tone([0.82, 0.8, 0.77], 1.7), PALE: RGB = [0.93, 0.91, 0.86], DARK = tone(PIG.jiao, 2.3), HOOF = tone(PIG.jiao, 2.6);
const WOOD = tone([0.78, 0.66, 0.54], 1.7), ROPE = tone([0.86, 0.79, 0.64], 1.5), SACK = tone([0.9, 0.84, 0.7], 1.35), FAG = tone(PIG.mao, 1.6), CLOTH = tone([0.6, 0.66, 0.78], 2.0);
const D: QuadDims = { bodyY: 0.86, sh: [0.105, -0.07, 0.35], hip: [0.105, -0.05, -0.37], neck: [0.12, 0.44], tail: [0.1, -0.57], fu: 0.4, fl: 0.36, hu: 0.38, hl: 0.42, ear: [0.055, 0.33, 0.17] };

export function donkeyGeo() {
  const body = shadeBy(loftZ([[-0.6, 0.04, 0.06, 0.08], [-0.53, 0.04, 0.16, 0.18], [-0.37, 0.03, 0.2, 0.22], [-0.1, 0.0, 0.19, 0.225], [0.15, 0.02, 0.19, 0.225], [0.34, 0.06, 0.16, 0.2], [0.46, 0.12, 0.1, 0.13]], 11, 1.05), (x, y, z, o) => {
    const c = y < -0.14 ? PALE : (Math.abs(x) < 0.028 && y > 0.17) || (Math.abs(z - 0.3) < 0.025 && y > 0.12) ? DARK : COAT;
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  mottle(body, 0.05, 7);
  const head = merge([
    // 颈：粗，自肩斜着往上前伸
    rod([V(0, -0.1, -0.1), V(0, 0.08, 0.04), V(0, 0.25, 0.14), V(0, 0.33, 0.18)], 0.13, 0.075, COAT),
    // 鬃：颈背上一道短而立的黑毛
    paint(box(0.024, 0.075, 0.36), DARK).applyMatrix4(M.mul(M.t(0, 0.2, 0.0), M.rx(-0.85))),
    // 头：长，自颈顶朝前下方垂着；嘴头子发白
    shadeBy(ell(0.082, 0.098, 0.23, COAT, 10, 7).applyMatrix4(M.mul(M.t(0, 0.2, 0.31), M.rx(0.85))), (_x, y, _z, o) => { const c = y < 0.14 ? PALE : COAT; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; }),
    ell(0.068, 0.064, 0.074, PALE, 9, 6).translate(0, 0.07, 0.45),
    ell(0.013, 0.011, 0.006, DARK).translate(0.032, 0.075, 0.518), ell(0.013, 0.011, 0.006, DARK).translate(-0.032, 0.075, 0.518),
    ell(0.012, 0.012, 0.006, DARK).translate(0.075, 0.26, 0.255), ell(0.012, 0.012, 0.006, DARK).translate(-0.075, 0.26, 0.255),
  ]);
  const ear = shadeBy(ell(0.03, 0.13, 0.04, COAT, 7, 5).translate(0, 0.12, 0), (_x, y, _z, o) => { const c = y > 0.2 ? DARK : COAT; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
  const tail = merge([rod([V(0, 0, 0), V(0, -0.15, -0.04), V(0, -0.32, -0.05)], 0.016, 0.01, COAT), ell(0.03, 0.09, 0.03, DARK, 6, 5).translate(0, -0.4, -0.05)]);
  const fu = limb(D.fu, 0.04, 0.026, COAT, { mass: [0.07, 0.14, 0.09, 0.08, 0], seg: 6 });
  const fl = limb(D.fl, 0.024, 0.021, COAT, { foot: [0.03, 0.03, 0.036, 0.008], footC: HOOF, seg: 6 });
  const hu = limb(D.hu, 0.045, 0.028, COAT, { mass: [0.08, 0.17, 0.11, 0.1, 0.01], seg: 6 });
  const hl = limb(D.hl, 0.023, 0.02, COAT, { foot: [0.03, 0.03, 0.036, 0.008], footC: HOOF, seg: 6 });
  return { body, head, tail, fu, fl, hu, hl, ear };
}
const STAND = pose({ y: 0.86, f: [0.06, -0.06, 0.06, -0.06], h: [-0.25, 0.42, -0.25, 0.42], ear: 0.05, tp: 0.25 });
/** 打盹：头低、耳朵撇向两边、右后腿虚点着 */
const DOZE = pose({ ...STAND, np: 0.6, ear: 0.55, h: [-0.25, 0.42, -0.1, 0.9], roll: 0.03 });
const GRAZE = pose({ ...STAND, y: 0.84, pitch: 0.06, np: 1.25, f: [-0.06, 0.02, 0.1, -0.08] });
const BRAY = pose({ ...STAND, np: -0.55, ear: 0.9 });
export const DONKEY = { D, STAND, DOZE, GRAZE, BRAY };

const enum S { Tether, Circle, Follow, Home }
export class Donkey implements DonkeyApi {
  parts: Parts; q: Quad;
  pos = new THREE.Vector3();
  manual = false;
  private st: S = S.Home; private present_ = false;
  private tx = 0; private tz = 0; private rope = 1.6;
  private cx = 0; private cz = 0; private cr = 1.6; private ang = 0;
  private who: Mover | null = null;
  private loadKind: 'sack' | 'wood' | null = null;
  private k: { post: number; rope: number; sacks: number; wood: number; blind: number };
  private R = mulberry32(919); private t = 3; private act: 'graze' | 'doze' | 'stand' | 'bray' = 'graze'; private gx = 0; private gz = 0;
  private bray_ = 40; private earT = 1; private tail = 0; private last = 0;
  /** 平日拴在哪（碓房东头） */
  home = { x: 0, z: 0 };
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.15, shade: 1.5 }), 'donkey'));
    this.q = new Quad(P, donkeyGeo(), D);
    // 木桩、缰绳、驮子（两只粮袋 / 两捆柴）、拉磨时蒙眼的布
    const post = merge([paint(cylUp(0.045, 0.055, 0.85, 7), WOOD), paint(cyl(0.05, 0.05, 0.04, 7).translate(0, 0.78, 0), ROPE)]);
    const rope = paint(cylUp(0.008, 0.008, 1, 4), ROPE);
    const saddle = paint(box(0.42, 0.05, 0.36), WOOD).translate(0, 0.25, 0);
    const sacks = merge([saddle, ...[-1, 1].map((sx) => ell(0.12, 0.19, 0.2, SACK, 9, 7).translate(sx * 0.26, 0.08, 0)), ...[-1, 1].map((sx) => paint(lathe([[0.001, 0], [0.04, 0.0], [0.04, 0.05], [0.001, 0.06]], 6), ROPE).translate(sx * 0.26, 0.26, 0))]);
    const wood = merge([saddle, ...[-1, 1].flatMap((sx) => [0, 1, 2].map((k) => paint(cyl(0.04, 0.04, 0.62, 6), FAG).applyMatrix4(M.mul(M.t(sx * (0.25 + 0.03 * k), 0.06 + 0.08 * (k % 2), -0.02 + 0.03 * k), M.rx(Math.PI / 2 + 0.06 * k)))))]);
    const blind = paint(box(0.19, 0.065, 0.13), CLOTH).applyMatrix4(M.mul(M.t(0, 0.25, 0.27), M.rx(0.85)));
    this.k = { post: P.add(post), rope: P.add(rope), sacks: P.add(sacks), wood: P.add(wood), blind: P.add(blind) };
    P.build();
    this.q.snap(STAND);
    this.findHome();
    this.tx = this.home.x; this.tz = this.home.z;
    this.q.x = this.home.x + 1; this.q.z = this.home.z; this.q.hide();
    for (const k of Object.values(this.k)) P.hide(k);
  }
  /** 碓房东头一块空地：离路、离水、离墙都有一点 */
  private findHome() {
    const [cx, cz] = MILL.way[1];
    for (let r = 2.5; r < 9; r += 0.8) for (let a = 0; a < 12; a++) {
      const x = cx + Math.cos(a * 0.524 + 0.3) * r, z = cz + Math.sin(a * 0.524 + 0.3) * r;
      if (blocked(x, z, 'ground', 1.3) || pathDist(x, z) < 1.4 || waterAt(x, z) || waterAt(x + 1.5, z) || waterAt(x - 1.5, z) || waterAt(x, z + 1.5) || waterAt(x, z - 1.5)) continue;
      this.home = { x, z }; return;
    }
    this.home = { x: cx + 3, z: cz - 3 };
  }
  get present() { return this.present_; }

  // —— 给别处用（api.ts） ——
  tether(x: number, z: number, rope = 1.6) { this.st = S.Tether; this.tx = x; this.tz = z; this.rope = rope; this.show(); }
  circle(cx: number, cz: number, r = 1.6) { this.st = S.Circle; this.cx = cx; this.cz = cz; this.cr = r; this.ang = Math.atan2(this.q.z - cz, this.q.x - cx); this.show(); }
  stop() { if (this.st === S.Circle || this.st === S.Follow) { this.st = S.Tether; this.tx = this.q.x; this.tz = this.q.z; this.rope = 0.6; } }
  follow(who: Mover | null) { this.who = who; if (who) { this.st = S.Follow; this.show(); } else this.stop(); }
  load(kind: 'sack' | 'wood' | null) { this.loadKind = kind; }
  bray() { this.bray_ = 0; }
  private show() { if (!this.present_) { this.present_ = true; this.q.x = this.tx + 0.8; this.q.z = this.tz; } }

  update(c: Ctx, day: Day) {
    const q = this.q, P = this.parts, R = this.R;
    // 按时辰：白天拴出来，夜里、雨天牵回去
    if (!this.manual) {
      const out = day.fine && c.hour > 7.4 && c.hour < 17.6;
      if (out && !this.present_) { this.tether(this.home.x, this.home.z, 1.6); }
      else if (!out && this.present_ && this.st === S.Tether) { this.present_ = false; }
    }
    const dist = camDist(c, q.x, q.z);
    if (!this.present_ || dist > 200) {
      if (!q.hidden) { q.hide(); for (const k of Object.values(this.k)) P.hide(k); P.commit(); }
      P.mesh.visible = false; return;
    }
    P.mesh.visible = true;
    const seen = inView(c, q.x, footY(q.x, q.z) + 0.8, q.z, 1.5);
    const stride = !seen ? 6 : dist < 40 ? 1 : dist < 90 ? 2 : 4;
    this.last += c.dt;
    if (c.frame % stride && !c.wound) return;
    const dt = Math.min(0.25, this.last); this.last = 0;
    this.t -= dt; this.bray_ -= dt; this.earT -= dt;
    let walking = false;
    if (this.st === S.Circle) {
      // 拉磨：蒙着眼一圈一圈地转
      this.ang += (0.7 / this.cr) * dt;
      const x = this.cx + Math.cos(this.ang) * this.cr, z = this.cz + Math.sin(this.ang) * this.cr;
      q.yaw = Math.atan2(x - q.x, z - q.z); q.v = 0.7; q.x = x; q.z = z; walking = true;
      q.goal = STAND; q.cur.np = 0.25;
    } else if (this.st === S.Follow && this.who) {
      const w = this.who.pos, d = Math.hypot(w.x - q.x, w.z - q.z);
      if (d > 1.5) { const g = Math.atan2(w.x - q.x, w.z - q.z); q.yaw = turnTo(q.yaw, g, 2.5, dt); q.v += (Math.min(1.3, 0.4 + (d - 1.5)) - q.v) * Math.min(1, dt * 3); walking = true; }
      else q.v = Math.max(0, q.v - dt * 2);
      const nx = q.x + Math.sin(q.yaw) * q.v * dt, nz = q.z + Math.cos(q.yaw) * q.v * dt;
      if (!blocked(nx, nz, 'ground', 0.4)) { q.x = nx; q.z = nz; }
      q.goal = STAND;
    } else {
      // 拴着：绳够得着的一圈里啃草、站着打盹、甩尾、扬脖子叫
      if (this.t < 0) {
        const r = R(); this.t = 6 + R() * 12;
        this.act = r < 0.5 ? 'graze' : r < 0.8 ? 'doze' : 'stand';
        if (this.act === 'graze') { const a = R() * 6.28, rr = R() * this.rope * 0.9; this.gx = this.tx + Math.cos(a) * rr; this.gz = this.tz + Math.sin(a) * rr; }
      }
      if (this.bray_ < 0) { this.bray_ = 70 + R() * 110; this.act = 'bray'; this.t = 2.6; sfx(c, 'donkey', q.x, q.z, 0.7); }
      if (this.act === 'graze') {
        const d = Math.hypot(this.gx - q.x, this.gz - q.z);
        if (d > 0.3) { const g = Math.atan2(this.gx - q.x, this.gz - q.z); q.yaw = turnTo(q.yaw, g, 1.4, dt); q.v += (0.3 - q.v) * Math.min(1, dt * 2); walking = true; q.goal = STAND; }
        else { q.v = Math.max(0, q.v - dt); q.goal = GRAZE; q.cur.nr = 0.03 * Math.sin(c.t * 4); }
        const nx = q.x + Math.sin(q.yaw) * q.v * dt, nz = q.z + Math.cos(q.yaw) * q.v * dt;
        if (!blocked(nx, nz, 'ground', 0.4)) { q.x = nx; q.z = nz; }
      } else { q.v = Math.max(0, q.v - dt * 2); q.goal = this.act === 'doze' ? DOZE : this.act === 'bray' ? BRAY : STAND; }
      // 绳子拉住
      const rx = q.x - this.tx, rz = q.z - this.tz, rd = Math.hypot(rx, rz);
      if (rd > this.rope + 0.9) { q.x = this.tx + (rx / rd) * (this.rope + 0.9); q.z = this.tz + (rz / rd) * (this.rope + 0.9); }
    }
    _v.set(q.x, 0, q.z); clearOfTrees(_v); q.x = _v.x; q.z = _v.z;
    q.gait = 0;
    if (!walking && this.st !== S.Circle) q.v = Math.max(0, q.v - dt);
    // 耳朵各转各的；尾巴一甩一甩
    if (this.earT < 0) { this.earT = 0.8 + R() * 3; this.earL = (R() - 0.5) * 1.2; this.earR = (R() - 0.5) * 1.2; }
    q.earTw[0] += (this.earL - q.earTw[0]) * Math.min(1, dt * 6); q.earTw[1] += (this.earR - q.earTw[1]) * Math.min(1, dt * 6);
    this.tail -= dt; if (this.tail < 0) this.tail = 2 + R() * 5;
    q.cur.ty = this.tail > 1.4 ? 0 : 0.6 * Math.sin(c.t * 9) * Math.sin(Math.PI * (this.tail / 1.4));
    const gy = footY(q.x, q.z);
    const body = q.place(gy, dt, c.t, 1.3);
    // 驮子、蒙眼布、木桩与缰绳
    const sh = this.loadKind === 'sack' ? this.k.sacks : this.loadKind === 'wood' ? this.k.wood : -1;
    for (const k of [this.k.sacks, this.k.wood]) if (k !== sh) P.hide(k);
    if (sh >= 0) P.place(sh, child(_m, body, 0, 0.08, 0.02));
    if (this.st === S.Circle) P.place(this.k.blind, child(_m, body, 0, D.neck[0], D.neck[1], q.cur.ny, q.cur.np, q.cur.nr)); else P.hide(this.k.blind);
    if (this.st === S.Tether) {
      const py = footY(this.tx, this.tz);
      P.place(this.k.post, trs(_m, this.tx, py - 0.05, this.tz));
      // 缰绳：桩顶到笼头（头的下巴那里）
      _h.set(0, 0.1, 0.4).applyMatrix4(child(_n, body, 0, D.neck[0], D.neck[1], q.cur.ny + q.lookYaw, q.cur.np, q.cur.nr));
      P.place(this.k.rope, span(_m, this.tx, py + 0.72, this.tz, _h.x, _h.y, _h.z));
    } else { P.hide(this.k.post); P.hide(this.k.rope); }
    this.pos.set(q.x, gy, q.z);
    P.commit();
  }
  private earL = 0; private earR = 0;
}
const _v = new THREE.Vector3(), _h = new THREE.Vector3(), _m = new THREE.Matrix4(), _n = new THREE.Matrix4();
void wrap;
