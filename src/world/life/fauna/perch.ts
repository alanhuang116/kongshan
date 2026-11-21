/**
 * 落在枝头、水边的小东西（合在一个几何里，一次绘制）：
 *   黄鹂（春）：一对，在石桥两头的柳树间——落在柳丝里，叫一句「黄鹂」，忽地一起一伏地飞到另一棵上去。
 *   喜鹊（冬天在老梅、大槐的枝上；别的时候在槐树下的空地上一跳一跳地找吃的）：长尾巴一翘一翘，「喳喳喳」；大槐上一个枯枝搭的窝（冬天叶落了才看得见）。
 *   蝉（夏）：桥头柳树干上趴着一只，人走近了「吱」地一声飞走，过一阵又飞回来。（蝉声是声音那一层自己的。）
 *   蛙（夏，春末）：池边水沿上蹲着几只，喉咙一鼓一鼓；黄昏、夜里叫几声；人近了扑通一声跳进水里，过一阵在水面露出个头，再爬回岸上。
 */
import * as THREE from 'three';
import { M, V, box, cyl, merge, sphere, type Geo } from '../../core/geo';
import { mulberry32 } from '../../core/rng';
import { PIG, type RGB } from '../../ink/ink';
import { SITE, TREES, ground } from '../../site';
import { waterDepth } from '../../walk';
import type { Ctx } from '../person';
import { Parts, child, creatureMat, paint, tone, trs } from '../rig';
import { PLUM_PERCH } from '../spots';
import { WHITE, beak, bump, camDist, ell, lerp, lumpy, mottle, rod, sfx, shadeBy, type Day } from './kit';

const _b = new THREE.Matrix4(), _m = new THREE.Matrix4();
const INKC = tone(PIG.jiao, 2.6);

/** 一只小鸟（身、两翅；尾另一块好翘）：c 身色、d 翅色、尾色 */
function birdGeo(o: { body: RGB; back?: RGB; wing: RGB; tail: RGB; head?: RGB; bill: RGB; len: number; tailLen: number; mask?: boolean; belly?: RGB }) {
  const L = o.len, back = o.back ?? o.body;
  const b = shadeBy(ell(L * 0.32, L * 0.3, L * 0.5, o.body, 9, 7), (_x, y, _z, c) => { const k = y > L * 0.08 ? back : y < -L * 0.1 && o.belly ? o.belly : o.body; c[0] = k[0]; c[1] = k[1]; c[2] = k[2]; });
  const head = ell(L * 0.24, L * 0.23, L * 0.26, o.head ?? back, 8, 6).translate(0, L * 0.28, L * 0.42);
  const parts: Geo[] = [b, head, beak(L * 0.07, L * 0.24, o.bill).translate(0, L * 0.27, L * 0.68), ell(L * 0.035, L * 0.035, L * 0.02, INKC).translate(L * 0.15, L * 0.32, L * 0.55), ell(L * 0.035, L * 0.035, L * 0.02, INKC).translate(-L * 0.15, L * 0.32, L * 0.55)];
  if (o.mask) for (const sx of [-1, 1]) parts.push(ell(L * 0.04, L * 0.05, L * 0.16, INKC).translate(sx * L * 0.19, L * 0.31, L * 0.47));
  const tail = paint(box(L * 0.2, L * 0.03, o.tailLen).translate(0, 0, -o.tailLen / 2), o.tail);
  const wing = ell(L * 0.42, L * 0.04, L * 0.28, o.wing, 7, 4).translate(L * 0.4, 0, -L * 0.06);
  return { body: merge(parts), tail, wing, wingR: wing.clone().scale(-1, 1, 1) };
}
interface Wee { x: number; y: number; z: number; yaw: number; flap: number; tail: number; k: number[]; hop: number }
function placeWee(P: Parts, w: Wee, t: number, L: number) {
  trs(_b, w.x, w.y + w.hop, w.z, w.yaw, w.flap > 0.05 ? -0.15 : 0, 0);
  P.place(w.k[0], _b);
  P.place(w.k[1], child(_m, _b, 0, L * 0.05, -L * 0.42, 0, -0.35 - w.tail, 0));
  for (let n = 0; n < 2; n++) {
    const s = n ? -1 : 1;
    if (w.flap > 0.05) P.place(w.k[2 + n], child(_m, _b, s * L * 0.1, L * 0.12, 0.0, 0, 0, s * (0.2 + 1.1 * Math.sin(t * 34 + n * 0.3)) * w.flap));
    else P.place(w.k[2 + n], child(_m, _b, s * L * 0.18, L * 0.08, -L * 0.08, s * 0.25, 0, s * 1.35, 0.8));
  }
}

export class Perched {
  parts: Parts;
  private R = mulberry32(55);
  // 黄鹂
  private ori: Wee[] = []; private oriTree: Array<{ x: number; z: number; s: number; gy: number }> = []; private oriAt = [0, 1]; private oriFly = -1; private oriFrom = new THREE.Vector3(); private oriTo = new THREE.Vector3(); private oriT = 8; private oriSong = 4;
  // 喜鹊
  private mag: Wee[] = []; private magT = [3, 7]; private magPerch: THREE.Vector3[] = []; private magAt = [0, 2]; private magFly = [-1, -1]; private magFrom = [new THREE.Vector3(), new THREE.Vector3()]; private magTo = [new THREE.Vector3(), new THREE.Vector3()]; private chatter = 6;
  private nest = -1; private nestPos = new THREE.Vector3();
  // 蝉
  private cic = { k: [] as number[], x: 0, y: 0, z: 0, yaw: 0, away: 0, fly: -1, fx: 0, fy: 0, fz: 0 };
  // 蛙
  private frogs: Array<{ x: number; z: number; y: number; yaw: number; k: number; st: number; t: number; jx: number; jz: number; croak: number; wx: number; wz: number }> = [];
  /** 池塘那一片蛙声开到几成（给持续的 frog 声；远近由声音那边按听的人算） */
  chorus = { level: 0, x: SITE.pond.x, z: SITE.pond.z };
  private last = 0;
  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.45, shade: 1.36 }), 'perched'));
    // —— 黄鹂：鲜黄身、黑翅黑尾、一道黑眉穿过眼睛、粉红的喙 ——
    const og = birdGeo({ body: tone([0.97, 0.88, 0.5], 1.15), wing: tone(PIG.jiao, 2.2), tail: tone(PIG.jiao, 2.0), bill: tone([0.94, 0.66, 0.62], 1.2), len: 0.12, tailLen: 0.09, mask: true });
    for (let i = 0; i < 2; i++) this.ori.push({ x: 0, y: -500, z: 0, yaw: 0, flap: 0, tail: 0, hop: 0, k: [P.add(og.body), P.add(og.tail), P.add(og.wing), P.add(og.wingR)] });
    for (const w of TREES.filter((t) => t.kind === 'willow')) if (Math.hypot(w.x - 0, w.z - 30) < 22) this.oriTree.push({ x: w.x, z: w.z, s: w.s, gy: ground(w.x, w.z) });
    // —— 喜鹊：黑头黑背、白肩白腹、长尾 ——
    const mg = birdGeo({ body: WHITE, back: INKC, wing: tone(PIG.mo, 2.6), tail: tone(PIG.mo, 2.9), head: INKC, bill: INKC, len: 0.17, tailLen: 0.24, belly: WHITE });
    for (let i = 0; i < 2; i++) this.mag.push({ x: 0, y: -500, z: 0, yaw: 0, flap: 0, tail: 0, hop: 0, k: [P.add(mg.body), P.add(mg.tail), P.add(mg.wing), P.add(mg.wingR)] });
    const pl = PLUM_PERCH, gyElm = ground(SITE.elm.x, SITE.elm.z);
    this.magPerch.push(new THREE.Vector3(pl.x + 0.5, pl.y + 0.55, pl.z - 0.3), new THREE.Vector3(SITE.plum.x - 0.2, pl.y + 0.9, SITE.plum.z + 0.1),
      new THREE.Vector3(SITE.elm.x + 1.6, gyElm + 7.4, SITE.elm.z - 0.8), new THREE.Vector3(SITE.elm.x - 1.2, gyElm + 8.2, SITE.elm.z + 1.4), new THREE.Vector3(SITE.elm.x + 0.4, gyElm + 0.02, SITE.elm.z + 6.5), new THREE.Vector3(SITE.elm.x + 3.2, gyElm + 0.02, SITE.elm.z + 5));
    // 鹊巢：一团枯枝
    const nestG = lumpy(paint(sphere(1, 9, 7).scale(0.42, 0.34, 0.4), tone([0.62, 0.56, 0.5], 2.2)), 0.06, 28, 3);
    mottle(nestG, 0.25, 9);
    this.nest = P.add(merge([nestG, ...[0, 1, 2, 3, 4, 5].map((i) => paint(cyl(0.012, 0.012, 0.7, 3), tone([0.6, 0.54, 0.48], 2.3)).applyMatrix4(M.mul(M.t(0, 0.05 * (i % 3), 0), M.ry(i * 1.05), M.rz(1.2 + 0.2 * (i % 2)))))]));
    this.nestPos.set(SITE.elm.x + 0.3, gyElm + 7.9, SITE.elm.z - 0.2);
    // —— 蝉：墨色的身子、两片透亮的翅 ——
    const cg = merge([ell(0.012, 0.01, 0.024, tone(PIG.jiao, 2.2), 6, 4), ell(0.011, 0.009, 0.01, tone(PIG.jiao, 2.4)).translate(0, 0.002, 0.024), ...[-1, 1].map((sx) => paint(box(0.014, 0.002, 0.036), [0.9, 0.92, 0.9]).applyMatrix4(M.mul(M.t(sx * 0.008, 0.008, -0.006), M.ry(sx * 0.18))))]);
    this.cic.k.push(P.add(cg));
    const cw = TREES.find((t) => t.kind === 'willow' && Math.abs(t.x + 12) < 2) ?? TREES.find((t) => t.kind === 'willow')!;
    const a0 = 2.6; this.cic.x = cw.x + Math.cos(a0) * (cw.r * cw.s + 0.02); this.cic.z = cw.z + Math.sin(a0) * (cw.r * cw.s + 0.02); this.cic.y = ground(cw.x, cw.z) + 1.7; this.cic.yaw = Math.atan2(cw.x - this.cic.x, cw.z - this.cic.z);
    // —— 蛙：青绿的背、浅的肚、两条折着的后腿（一块） ——
    const frogC = tone([0.68, 0.78, 0.6], 1.6), belly = tone([0.92, 0.9, 0.78], 1.1);
    const fg = merge([shadeBy(ell(0.035, 0.022, 0.045, frogC, 8, 6), (_x, y, _z, c) => { const k = y < -0.006 ? belly : frogC; c[0] = k[0]; c[1] = k[1]; c[2] = k[2]; }).translate(0, 0.024, 0), ell(0.024, 0.016, 0.022, frogC).translate(0, 0.03, 0.035), ell(0.007, 0.007, 0.006, tone(PIG.jiao, 2.4)).translate(0.015, 0.042, 0.04), ell(0.007, 0.007, 0.006, tone(PIG.jiao, 2.4)).translate(-0.015, 0.042, 0.04),
      ...[-1, 1].map((sx) => ell(0.014, 0.012, 0.036, mottleC(frogC)).applyMatrix4(M.mul(M.t(sx * 0.03, 0.012, -0.02), M.ry(sx * 0.4)))), ...[-1, 1].map((sx) => ell(0.006, 0.014, 0.006, frogC).translate(sx * 0.022, 0.012, 0.03))]);
    const Pd = SITE.pond, R = this.R;
    // 池边：从池心往外找水沿（水浅处），蹲在那里朝着水
    for (let i = 0; i < 6; i++) {
      const a = 0.4 + i * 1.05 + R() * 0.3;
      let r = 0.6; while (r < 1.4 && waterDepth(Pd.x + Math.cos(a) * Pd.rx * r, Pd.z + Math.sin(a) * Pd.rz * r) > 0.02) r += 0.01;
      const x = Pd.x + Math.cos(a) * Pd.rx * (r + 0.02), z = Pd.z + Math.sin(a) * Pd.rz * (r + 0.02);
      this.frogs.push({ x, z, y: ground(x, z), yaw: Math.atan2(Pd.x - x, Pd.z - z), k: P.add(fg), st: 0, t: R() * 5, jx: 0, jz: 0, croak: 5 + R() * 20, wx: Pd.x + Math.cos(a) * Pd.rx * (r - 0.12), wz: Pd.z + Math.sin(a) * Pd.rz * (r - 0.12) });
    }
    P.build();
    for (let k = 0; k < P.count; k++) P.hide(k);
  }
  /** 喜鹊、黄鹂此刻停在哪（给观物、说话用） */
  get magpie() { return this.mag[0]; }

  update(c: Ctx, day: Day, ripple: ((x: number, z: number, s: number) => void) | undefined) {
    const P = this.parts, R = this.R, t = c.t;
    this.last += c.dt;
    const dO = this.oriTree.length ? camDist(c, this.oriTree[0].x, this.oriTree[0].z) : 1e9, dM = Math.min(camDist(c, SITE.plum.x, SITE.plum.z), camDist(c, SITE.elm.x, SITE.elm.z)), dP = camDist(c, SITE.pond.x, SITE.pond.z), dC = camDist(c, this.cic.x, this.cic.z);
    const near = Math.min(dO, dM, dP, dC);
    if (near > 130) { P.mesh.visible = false; this.chorus.level = 0; return; }
    const stride = near < 40 ? 1 : 2;
    if (c.frame % stride && !c.wound) return;
    const dt = Math.min(0.25, this.last); this.last = 0;
    P.mesh.visible = true;
    const fine = c.rain < 0.45 && c.snow < 0.6;
    // —— 黄鹂（春天，白天） ——
    const oriOn = c.season === 'spring' && day.up && fine && this.oriTree.length >= 2 && dO < 120;
    if (!oriOn) { for (const w of this.ori) for (const k of w.k) P.hide(k); }
    else {
      const perch = (i: number, out: THREE.Vector3) => { const T = this.oriTree[this.oriAt[i] % this.oriTree.length], a = i * 2.3 + this.oriAt[i] * 1.1; return out.set(T.x + Math.cos(a) * 1.6 * T.s, T.gy + (3.4 + 0.6 * i) * T.s, T.z + Math.sin(a) * 1.4 * T.s); };
      this.oriT -= dt; this.oriSong -= dt;
      if (this.oriFly < 0 && this.oriT < 0) { this.oriFly = 0; perch(0, this.oriFrom); this.oriAt[0]++; this.oriAt[1]++; perch(0, this.oriTo); this.oriT = 14 + R() * 20; }
      if (this.oriSong < 0) { this.oriSong = 5 + R() * 9; const w = this.ori[Math.floor(R() * 2)]; sfx(c, 'oriole', w.x, w.z, 0.55); }
      this.ori.forEach((w, i) => {
        if (this.oriFly >= 0) {
          // 一起一伏地飞（黄鹂飞起来是波浪形的）；后面那只隔一会儿跟上
          const k = Math.max(0, Math.min(1, (this.oriFly - i * 0.12) / 1)), dx = this.oriTo.x - this.oriFrom.x, dz = this.oriTo.z - this.oriFrom.z;
          w.x = this.oriFrom.x + dx * k + i * 0.4; w.z = this.oriFrom.z + dz * k; w.y = lerp(this.oriFrom.y, this.oriTo.y, k) + 0.6 * Math.sin(k * Math.PI * 4) * bump(k) + 1.2 * bump(k);
          w.yaw = Math.atan2(dx, dz); w.flap = Math.sin(k * Math.PI * 4) > 0 ? 1 : 0.2;
        } else { perch(i, _v); w.x = _v.x; w.y = _v.y; w.z = _v.z; w.flap = 0; if (R() < dt * 0.6) w.yaw = R() * 6.28; w.tail = 0.15 * Math.max(0, Math.sin(t * 3 + i)); }
        placeWee(P, w, t, 0.12);
      });
      if (this.oriFly >= 0) { this.oriFly += dt / Math.max(2.5, Math.hypot(this.oriTo.x - this.oriFrom.x, this.oriTo.z - this.oriFrom.z) / 7); if (this.oriFly > 1.15) this.oriFly = -1; }
    }
    // —— 喜鹊 ——
    const magOn = day.up && c.snow < 0.8 && dM < 120;
    if (!magOn) { for (const w of this.mag) for (const k of w.k) P.hide(k); }
    else {
      const winter = c.season === 'winter';
      this.chatter -= dt;
      this.mag.forEach((w, i) => {
        this.magT[i] -= dt;
        if (this.magFly[i] < 0 && this.magT[i] < 0) {
          // 冬天在梅、槐的枝上换着落；别的时候在槐树下地上跳
          const opts = winter ? [0, 1, 2, 3] : [2, 3, 4, 5];
          this.magFrom[i].copy(this.magPerch[this.magAt[i]]); this.magAt[i] = opts[Math.floor(R() * opts.length)]; this.magTo[i].copy(this.magPerch[this.magAt[i]]); if (this.magAt[i] >= 4) { this.magTo[i].x += (R() - 0.5) * 3; this.magTo[i].z += (R() - 0.5) * 3; }
          this.magFly[i] = this.magFrom[i].distanceTo(this.magTo[i]) < 0.5 ? -1 : 0; this.magT[i] = 10 + R() * 18;
          if (this.chatter < 0) { this.chatter = 6 + R() * 10; sfx(c, 'magpie', this.magTo[i].x, this.magTo[i].z, 0.55); }
        }
        if (this.magFly[i] >= 0) {
          const k = Math.min(1, this.magFly[i]), A = this.magFrom[i], B = this.magTo[i];
          w.x = lerp(A.x, B.x, k); w.z = lerp(A.z, B.z, k); w.y = lerp(A.y, B.y, k) + 1.5 * bump(k);
          w.yaw = Math.atan2(B.x - A.x, B.z - A.z); w.flap = Math.sin(t * 2) > -0.3 || k > 0.8 ? 1 : 0.2; w.tail = 0; w.hop = 0;
          this.magFly[i] += dt / Math.max(1.5, A.distanceTo(B) / 6);
          if (this.magFly[i] >= 1) this.magFly[i] = -1;
        } else {
          const p = this.magTo[i];
          w.flap = 0;
          if (this.magAt[i] >= 4) {
            // 地上：双脚一跳一跳，尾巴一翘
            if (R() < dt * 0.9) { w.yaw += (R() - 0.5) * 2; }
            const hop = Math.max(0, Math.sin(t * 5 + i)) ; w.hop = 0.05 * hop * hop;
            if (hop > 0.95) { p.x += Math.sin(w.yaw) * 0.06; p.z += Math.cos(w.yaw) * 0.06; }
            w.x = p.x; w.z = p.z; w.y = ground(p.x, p.z);
          } else { w.x = p.x; w.y = p.y; w.z = p.z; w.hop = 0; if (R() < dt * 0.4) w.yaw = R() * 6.28; }
          w.tail = 0.4 * Math.max(0, Math.sin(t * 2.4 + i * 2)) ** 6;
        }
        placeWee(P, w, t, 0.17);
      });
    }
    if (dM < 130) P.place(this.nest, trs(_m, this.nestPos.x, this.nestPos.y, this.nestPos.z, 0.6)); else P.hide(this.nest);
    // —— 蝉 ——
    const C = this.cic, cicOn = c.season === 'summer' && day.up && c.rain < 0.3 && dC < 60;
    if (!cicOn) P.hide(C.k[0]);
    else {
      const pd = Math.hypot(c.player.x - C.x, c.player.z - C.z);
      if (C.fly < 0 && C.away <= 0 && pd < 3) { C.fly = 0; C.fx = C.x; C.fy = C.y; C.fz = C.z; sfx(c, 'wings', C.x, C.z, 0.25); }
      if (C.fly >= 0) { C.fly += dt; const k = C.fly / 1.2; P.place(C.k[0], trs(_m, C.fx - Math.sin(C.yaw) * 6 * k, C.fy + 4 * k, C.fz - Math.cos(C.yaw) * 6 * k, C.yaw + Math.PI, -0.3, 0, 1)); if (k > 1) { C.fly = -1; C.away = 50 + R() * 40; P.hide(C.k[0]); } }
      else if (C.away > 0) { C.away -= dt; P.hide(C.k[0]); }
      else P.place(C.k[0], trs(_m, C.x, C.y, C.z, C.yaw, -1.45, 0));
    }
    // —— 蛙 ——
    const frogOn = (c.season === 'summer' || (c.season === 'spring' && c.hour > 12)) && dP < 70 && c.snow < 0.3;
    const evening = c.night > 0.25 || day.light < 0.75;
    for (const f of this.frogs) {
      if (!frogOn) { P.hide(f.k); continue; }
      f.t -= dt;
      const pd = Math.hypot(c.player.x - f.x, c.player.z - f.z);
      if (f.st === 0) {
        // 蹲着，喉咙一鼓一鼓；黄昏、夜里叫几声
        if (pd < 2.3) { f.st = 1; f.t = 0.45; sfx(c, 'frogPlop', f.wx, f.wz, 0.5); }
        f.croak -= dt;
        if (evening && f.croak < 0 && pd < 40) { f.croak = 6 + R() * 18; sfx(c, 'frog', f.x, f.z, 0.45); }
        const puff = evening && f.croak > 0 && f.croak < 1.2 ? 1 + 0.25 * Math.abs(Math.sin(t * 18)) : 1;
        P.place(f.k, trs(_m, f.x, f.y, f.z, f.yaw, 0, 0, puff));
      } else if (f.st === 1) {
        // 扑通：一跳进水
        const k = 1 - Math.max(0, f.t) / 0.45;
        P.place(f.k, trs(_m, lerp(f.x, f.wx, k), lerp(f.y, SITE.pond.y, k) + 0.25 * bump(k), lerp(f.z, f.wz, k), f.yaw, 0.6 - 1.2 * k, 0));
        if (f.t < 0) { f.st = 2; f.t = 18 + R() * 20; ripple?.(f.wx, f.wz, 0.7); P.hide(f.k); }
      } else if (f.st === 2) {
        // 在水里：过一阵露个头
        if (f.t < 5 && f.t > 0) P.place(f.k, trs(_m, f.wx, SITE.pond.y - 0.028, f.wz, f.yaw + Math.PI, 0, 0)); else P.hide(f.k);
        if (f.t < 0 && pd > 4) { f.st = 0; f.t = 5; }
      }
    }
    // 一片蛙声：岸上蹲着的越多越响；人走近了近处的就不叫了，跳下水的也不叫
    let sit = 0, nearF = 1e9;
    for (const f of this.frogs) if (f.st === 0) { sit++; nearF = Math.min(nearF, Math.hypot(c.player.x - f.x, c.player.z - f.z)); }
    const hush = Math.min(1, Math.max(0, (nearF - 2.5) / 6));
    this.chorus.level = frogOn && evening && this.frogs.length ? (c.season === 'summer' ? 0.6 : 0.35) * (sit / this.frogs.length) * hush * (1 + 0.3 * Math.min(1, c.rain)) : 0;
    P.commit();
  }
}
const _v = new THREE.Vector3();
function mottleC(c: RGB): RGB { return [c[0] * 0.92, c[1] * 0.95, c[2] * 0.9]; }
void V;
