/**
 * 甲家的黄狗：一条中华田园犬——土黄的毛，胸腹、嘴筒子浅，立耳，尾巴卷在背上，身子精瘦、腿细。
 * 平日卧在甲家矮墙口外的墙根下：头搁在前爪上，耳朵时不时一抖，隔一阵起来伸个懒腰（前腿伸直、塌腰、屁股翘起）、
 * 坐着用后腿挠挠耳根、抖一抖毛，或者绕着墙根低头嗅一圈再回来卧下；夜里、冬天、晌午蜷成一团睡。
 * 认得行者（常来往的先生）：人走近了它起身迎过来，后半截身子跟着尾巴一起扭，在跟前坐下仰着头看；
 * 人走开它跟着走一段（跑起来它也撒开腿跟着跑），离家远了、跟久了自己回去。下雨卧到甲家檐下。
 * 「摸狗」那件事：它过来蹭腿，摸得舒服了就往地上一倒、翻出肚皮。
 */
import * as THREE from 'three';
import { M, V, cyl, merge, type Geo } from '../../core/geo';
import { mulberry32 } from '../../core/rng';
import { PIG, type RGB } from '../../ink/ink';
import type { Ctx } from '../person';
import { Parts, creatureMat, loftZ, paint, tone } from '../rig';
import { DOG_BED, atHouse, clearOfTrees, footY } from '../spots';
import { blocked } from '../../walk';
import { camDist, ell, inView, lerp, mottle, rod, shadeBy, turnTo, wrap, type Day } from './kit';
import { Quad, limb, pose, type Pose, type QuadDims } from './quad';

const COAT: RGB = tone([0.93, 0.85, 0.68], 1.35), CREAM: RGB = [0.97, 0.94, 0.86], NOSE = tone(PIG.jiao, 2.6), SADDLE = tone([0.9, 0.8, 0.62], 1.5);
const D: QuadDims = { bodyY: 0.41, sh: [0.058, -0.012, 0.17], hip: [0.06, 0.0, -0.225], neck: [0.06, 0.275], tail: [0.04, -0.33], fu: 0.2, fl: 0.19, hu: 0.195, hl: 0.215, ear: [0.04, 0.19, 0.125] };

export function dogGeo() {
  // 身子：臀、收着的腰、深的胸，到颈根
  const body = shadeBy(loftZ([[-0.355, 0.0, 0.03, 0.035], [-0.32, 0.002, 0.066, 0.072], [-0.25, 0.006, 0.09, 0.096], [-0.15, 0.004, 0.08, 0.088], [-0.05, 0.008, 0.074, 0.08], [0.05, 0.002, 0.086, 0.108], [0.14, 0.012, 0.092, 0.122], [0.22, 0.032, 0.082, 0.112], [0.28, 0.058, 0.064, 0.085], [0.315, 0.075, 0.045, 0.055]], 12, 1.04), (_x, y, z, o) => {
    const c = y < -0.068 || (z > 0.15 && y < -0.015) ? CREAM : y > 0.065 ? SADDLE : COAT;
    o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
  });
  mottle(body, 0.05, 2);
  const head = merge([
    ell(0.054, 0.08, 0.062, COAT, 10, 8).applyMatrix4(M.mul(M.t(0, 0.035, 0.03), M.rx(-0.65))), ell(0.047, 0.052, 0.052, COAT, 10, 8).translate(0, 0.105, 0.088),
    shadeBy(ell(0.06, 0.056, 0.07, COAT, 12, 9), (_x, y, _z, o) => { const c = y > 0.03 ? SADDLE : COAT; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; }).translate(0, 0.155, 0.135),
    ell(0.045, 0.034, 0.04, CREAM, 10, 7).translate(0, 0.125, 0.168),
    shadeBy(paint(cyl(0.023, 0.034, 0.105, 9).applyMatrix4(M.mul(M.t(0, 0.138, 0.215), M.rx(Math.PI / 2 + 0.12))), CREAM), (_x, y, z, o) => { const c = y > 0.152 && z < 0.24 ? COAT : CREAM; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; }),
    ell(0.016, 0.013, 0.012, NOSE).translate(0, 0.143, 0.27),
    ell(0.008, 0.008, 0.005, NOSE).translate(0.033, 0.17, 0.19), ell(0.008, 0.008, 0.005, NOSE).translate(-0.033, 0.17, 0.19),
  ]);
  // 立耳：一片三角（自耳根朝上）
  const ear = shadeBy(paint(cyl(0.002, 0.03, 0.068, 4).scale(1, 1, 0.36).translate(0, 0.034, 0), COAT), (_x, y, _z, o) => { const c = y > 0.04 ? SADDLE : COAT; o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; });
  // 尾：自尾根翘起、卷到背上
  const tail = rod([V(0, 0, 0), V(0, 0.08, -0.055), V(0, 0.165, -0.045), V(0, 0.21, 0.02), V(0, 0.195, 0.075)], 0.024, 0.011, SADDLE);
  // 腿：上臂、大腿是一团肉埋在身子里；下节细，到爪
  const fu = limb(D.fu, 0.027, 0.021, COAT, { mass: [0.037, 0.075, 0.047, 0.04, 0.0] });
  const fl = limb(D.fl, 0.0195, 0.016, COAT, { foot: [0.024, 0.015, 0.032, 0.012], footC: CREAM });
  const hu = limb(D.hu, 0.03, 0.021, COAT, { mass: [0.046, 0.1, 0.066, 0.07, 0.012] });
  const hl = limb(D.hl, 0.018, 0.0155, COAT, { foot: [0.024, 0.015, 0.032, 0.016], footC: CREAM });
  return { body, head, tail, fu, fl, hu, hl, ear } satisfies Record<string, Geo>;
}

// —— 姿态 ——
const STAND = pose({ y: 0.41, f: [0.1, -0.1, 0.1, -0.1], h: [-0.28, 0.5, -0.28, 0.5], tp: 0 });
const SIT = pose({ y: 0.29, pitch: -0.75, f: [0.75, 0, 0.75, 0], h: [-0.32, 2.75, -0.32, 2.75], np: 0.45, tp: -1.45, ty: 0.5 });
const LIE = pose({ y: 0.15, pitch: 0.04, roll: 0.08, f: [-1.42, -0.06, -1.38, -0.08], h: [-1.45, 2.85, -1.45, 2.85], out: 0.38, np: 0.25, tp: -1.35, ty: 0.45 });
const LIE_DOWN = pose({ ...LIE, np: 0.62, f: [-1.45, -0.05, -1.4, -0.06] });
const CURL = pose({ y: 0.13, pitch: 0.05, roll: 0.4, ny: 1.25, np: 1.0, nr: 0.45, tp: -1.25, ty: 1.3, f: [-1.05, 1.3, -1.1, 1.25], h: [-1.35, 2.6, -1.3, 2.6], out: 0.28, ear: 0.55 });
const BELLY = pose({ y: 0.2, roll: 2.45, np: 0.25, ny: 0.4, f: [-0.7, 1.6, -0.95, 1.35], h: [-0.85, 1.4, -0.5, 1.25], tp: -0.2, ear: 0.85 });
const BOW = pose({ y: 0.33, pitch: 0.32, f: [-1.0, -0.15, -1.0, -0.15], h: [-0.32, 0.6, -0.32, 0.6], tp: -0.25, np: -0.25 });
const SNIFF = pose({ ...STAND, y: 0.4, pitch: 0.1, np: 0.95 });
/** 台子上看用 */
export const DOG = { D, STAND, SIT, LIE, LIE_DOWN, CURL, BELLY, BOW, SNIFF };

const enum S { Bed, Greet, Sit, Follow, Home, Wander, Scratch, Shake, Stretch, Pet, Belly, Shelter }
const _v = new THREE.Vector3();

export class Dog {
  parts: Parts;
  q: Quad;
  /** 在哪（世界坐标） */
  pos = new THREE.Vector3(DOG_BED.x, 0, DOG_BED.z);
  private st: S = S.Bed; private t = 3; private cool = 4; private follow = 0; private R = mulberry32(5);
  private ear = 0; private earT = 2; private sleep = false; private shelter = atHouse('a', 1.4, 3.1, Math.PI);
  /** 做「摸狗」时站在哪、朝哪（外面给） */
  private petAt: { x: number; z: number; yaw: number } | null = null;
  private petMode: 'come' | 'lean' | 'belly' = 'come';
  private wagK = 0; private last = 0;
  constructor() {
    this.parts = new Parts(creatureMat({ body: 0.22, shade: 1.48 }), 'dog');
    this.q = new Quad(this.parts, dogGeo(), D);
    this.parts.build();
    const q = this.q; q.x = DOG_BED.x; q.z = DOG_BED.z; q.yaw = DOG_BED.yaw; q.snap(LIE);
  }
  /** 摸狗：come 叫它过来坐在 at 跟前；lean 蹭（头往手上拱、闭着眼、尾巴摇得欢）；belly 翻肚皮；null 放它走 */
  pet(mode: 'come' | 'lean' | 'belly' | null, at?: { x: number; z: number; yaw: number }) {
    if (!mode) { this.petAt = null; if (this.st === S.Pet || this.st === S.Belly) { this.st = S.Sit; this.t = 4; } return; }
    if (at) this.petAt = at;
    this.petMode = mode;
    this.st = mode === 'belly' ? S.Belly : S.Pet;
  }
  /** 此刻在不在跟前、蹲好了没有（摸狗用） */
  get settled() { return (this.st === S.Pet || this.st === S.Belly) && this.q.v < 0.05; }
  get state() { return this.st; }
  get awake() { return !this.sleep; }

  update(c: Ctx, day: Day, pv: number) {
    const q = this.q, P = this.parts, R = this.R;
    const dist = camDist(c, q.x, q.z);
    if (dist > 220) { if (!q.hidden) { q.hide(); P.commit(); } P.mesh.visible = false; this.reset(c, day); return; }
    P.mesh.visible = true;
    const seen = inView(c, q.x, footY(q.x, q.z) + 0.4, q.z, 1);
    // 远了、看不见的少动
    const stride = !seen ? 6 : dist < 40 ? 1 : dist < 90 ? 2 : 4;
    this.last += c.dt;
    if (c.frame % stride && !c.wound) return;
    const dt = Math.min(0.25, this.last); this.last = 0;
    this.think(c, day, pv, dt);
    // 走
    const gy = footY(q.x, q.z);
    q.wag = lerp(q.wag, this.wagK, Math.min(1, dt * 4));
    q.wagRate = this.st === S.Pet ? 14 : 11;
    // 耳朵：一会儿一抖
    this.earT -= dt;
    if (this.earT < 0) { this.earT = 1.5 + R() * 5; this.ear = 1; }
    this.ear = Math.max(0, this.ear - dt * 5);
    q.earTw[0] = 0.35 * this.ear * Math.sin(c.t * 40); q.earTw[1] = R() < 0.5 ? 0 : q.earTw[0];
    // 抖毛：身子左右急甩
    if (this.st === S.Shake) q.cur.roll = 0.35 * Math.sin(c.t * 28) * Math.min(1, this.t);
    // 挠痒：左后腿急急地蹬
    if (this.st === S.Scratch) { q.cur.h[0] = -0.75 + 0.25 * Math.sin(c.t * 26); q.cur.h[1] = 1.3; }
    // 呼吸
    q.lift = 0.004 * Math.sin(c.t * (this.sleep ? 1.4 : 2.4));
    q.place(gy, dt, c.t, this.q.gait === 2 ? 1.5 : 0.7);
    this.pos.set(q.x, gy, q.z);
    P.commit();
  }
  /** 时辰被一下子拨过去：直接到该在的地方 */
  private reset(c: Ctx, day: Day) {
    if (!c.wound) return;
    const q = this.q, rain = c.rain > 0.45 || c.snow > 0.55;
    const s = rain ? this.shelter : DOG_BED;
    q.x = s.x; q.z = s.z; q.yaw = s.yaw; this.st = rain ? S.Shelter : S.Bed; this.sleep = c.night > 0.5 || !day.fine;
    q.snap(this.sleep ? CURL : LIE); q.v = 0;
  }
  private goTo(tx: number, tz: number, speed: number, dt: number, stopAt = 0.15): number {
    const q = this.q, dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz);
    if (d < stopAt) { q.v = Math.max(0, q.v - dt * 4); return d; }
    const goal = Math.atan2(dx, dz), off = wrap(goal - q.yaw);
    q.yaw = turnTo(q.yaw, goal, speed > 2 ? 4 : 5, dt);
    const want = speed * Math.max(0.12, Math.cos(off)) * Math.min(1, 0.25 + (d - stopAt) * 1.2);
    q.v += (want - q.v) * Math.min(1, dt * 4);
    const nx = q.x + Math.sin(q.yaw) * q.v * dt, nz = q.z + Math.cos(q.yaw) * q.v * dt;
    if (!blocked(nx, nz, 'ground', 0.18)) { q.x = nx; q.z = nz; } else q.v *= 0.5;
    _v.set(q.x, 0, q.z); clearOfTrees(_v); q.x = _v.x; q.z = _v.z;
    q.gait = q.v > 2.0 ? 2 : q.v > 0.9 ? 1 : 0;
    return d;
  }
  private think(c: Ctx, day: Day, pv: number, dt: number) {
    const q = this.q, R = this.R, px = c.player.x, pz = c.player.z, pd = Math.hypot(px - q.x, pz - q.z);
    const pBed = Math.hypot(px - DOG_BED.x, pz - DOG_BED.z), fromBed = Math.hypot(q.x - DOG_BED.x, q.z - DOG_BED.z);
    const rain = c.rain > 0.45 || c.snow > 0.55, cold = c.season === 'winter' && c.snow > 0.2;
    const awakeHours = c.night < 0.55 && !rain;
    this.t -= dt; this.cool -= dt;
    const faceP = Math.atan2(px - q.x, pz - q.z);
    this.wagK = 0.06;
    switch (this.st) {
      case S.Bed: case S.Shelter: {
        const home = this.st === S.Shelter ? this.shelter : DOG_BED;
        this.goTo(home.x, home.z, 1.0, dt);
        if (q.v < 0.05) q.yaw = turnTo(q.yaw, home.yaw, 2, dt);
        this.sleep = c.night > 0.55 || (c.hour > 12 && c.hour < 13.4) || cold;
        q.goal = this.sleep ? CURL : Math.sin(c.t * 0.13) > 0.3 ? LIE_DOWN : LIE;
        // 抬头看看来人
        q.lookYaw = !this.sleep && pd < 9 ? Math.max(-1, Math.min(1, wrap(faceP - q.yaw))) * 0.7 : 0;
        if (rain && this.st === S.Bed) { this.st = S.Shelter; break; }
        if (!rain && this.st === S.Shelter) { this.st = S.Bed; break; }
        // 认得人：迎过去
        if (awakeHours && !this.sleep && this.cool < 0 && pd < 12 && pBed < 16) { this.st = S.Greet; this.t = 14; if (R() < 0.5) c.sfx('dog', q.x, q.z, 0.35); break; }
        // 起来动一动
        if (this.t < 0 && !this.sleep && q.v < 0.05) {
          const r = R(); this.t = 14 + R() * 26;
          if (r < 0.3) { this.st = S.Wander; this.t = 10 + R() * 8; }
          else if (r < 0.5) { this.st = S.Stretch; this.t = 2.6; }
          else if (r < 0.7) { this.st = S.Scratch; this.t = 1.6; }
          else if (r < 0.8) { this.st = S.Shake; this.t = 0.9; }
        }
        break;
      }
      case S.Greet: {
        // 小跑过来，后半截身子跟着尾巴一起扭；到跟前坐下
        const tx = px - ((px - q.x) / (pd || 1)) * 1.25, tz = pz - ((pz - q.z) / (pd || 1)) * 1.25;
        const d = this.goTo(tx, tz, pd > 4 ? 1.6 : 0.9, dt, 0.25);
        q.goal = STAND; this.wagK = pd < 5 ? 0.75 : 0.35;
        q.cur.ty = 0.25 * Math.sin(c.t * 9) * (pd < 4 ? 1 : 0);
        if (d < 0.3) { this.st = S.Sit; this.t = 10 + R() * 8; this.follow = 0; }
        if (this.t < 0 || pBed > 26) { this.st = S.Home; this.cool = 40; }
        break;
      }
      case S.Sit: {
        q.v = Math.max(0, q.v - dt * 4);
        q.yaw = turnTo(q.yaw, faceP, 3, dt);
        q.goal = SIT; this.wagK = 0.5; q.lookYaw = 0; q.lookPitch = -0.2;
        // 人走开了：跟上去
        if (pd > 2.6 && pd < 14) { this.st = S.Follow; this.t = 40 + R() * 20; }
        else if (pd >= 14 || this.t < 0 || c.night > 0.6) { this.st = S.Home; this.cool = 30 + R() * 30; q.lookPitch = 0; }
        break;
      }
      case S.Follow: {
        // 跟在人身后一侧一步多；人跑起来它也撒开腿跑
        const side = 0.9, back = 1.5, yaw = Math.atan2(px - q.x, pz - q.z);
        const tx = px - Math.sin(yaw) * back + Math.cos(yaw) * side, tz = pz - Math.cos(yaw) * back - Math.sin(yaw) * side;
        const run = pv > 2;
        this.goTo(tx, tz, run ? Math.min(4.2, pv + 0.6) : Math.min(1.9, Math.max(0.8, pv + 0.3)), dt, 0.35);
        q.goal = run ? STAND : pd < 2.2 && q.v < 0.3 ? SNIFF : STAND; this.wagK = 0.4;
        q.lookPitch = 0;
        this.follow += dt;
        if (fromBed > 30 || this.t < 0 || c.night > 0.6 || rain) { this.st = S.Home; this.cool = 50 + R() * 40; }
        else if (pd < 1.9 && pv < 0.2 && q.v < 0.2) { this.st = S.Sit; this.t = 8 + R() * 6; }
        break;
      }
      case S.Home: {
        q.goal = STAND; q.lookPitch = 0;
        const home = rain ? this.shelter : DOG_BED;
        if (this.goTo(home.x, home.z, 1.4, dt) < 0.2) { this.st = rain ? S.Shelter : S.Bed; this.t = 10 + R() * 20; }
        break;
      }
      case S.Wander: {
        // 绕着墙根低头嗅一圈
        if (this.t > 0) {
          if (q.v < 0.1 && R() < dt * 0.8) { const a = R() * 6.28, r = 1.5 + R() * 3; const tx = DOG_BED.x + Math.cos(a) * r, tz = DOG_BED.z + Math.sin(a) * r; if (!blocked(tx, tz, 'ground', 0.25)) { this.sx = tx; this.sz = tz; } }
          this.goTo(this.sx, this.sz, 0.55, dt, 0.3);
          q.goal = SNIFF; q.cur.ny = 0.3 * Math.sin(c.t * 2.2);
        } else { this.st = S.Home; }
        if (awakeHours && pd < 9 && this.cool < 0) { this.st = S.Greet; this.t = 12; }
        break;
      }
      case S.Stretch:
        // 伸懒腰：前腿伸直塌腰、屁股翘着，再站直
        q.v = 0; q.goal = this.t > 1.2 ? BOW : STAND; q.rate = 3;
        if (this.t < 0) { this.st = S.Bed; this.t = 20 + R() * 20; q.rate = 4; }
        break;
      case S.Scratch:
        q.v = 0; q.goal = SIT; q.cur.ny = 0.5; q.cur.nr = 0.35;
        if (this.t < 0) { this.st = S.Bed; this.t = 15 + R() * 20; }
        break;
      case S.Shake:
        q.v = 0; q.goal = STAND;
        if (this.t < 0) { this.st = S.Bed; this.t = 15 + R() * 15; }
        break;
      case S.Pet: case S.Belly: {
        const at = this.petAt;
        if (!at) { this.st = S.Sit; break; }
        // 走到人跟前：面朝他，坐下；蹭的时候头往手上拱、闭着眼；翻肚皮时躺倒、四脚朝天
        const tx = at.x + Math.sin(at.yaw) * 0.72, tz = at.z + Math.cos(at.yaw) * 0.72;
        const d = this.goTo(tx, tz, 1.0, dt, 0.1);
        if (d < 0.2) q.yaw = turnTo(q.yaw, at.yaw + Math.PI + (this.st === S.Belly ? 1.3 : 0), 3, dt);
        q.goal = this.st === S.Belly && d < 0.25 ? BELLY : d < 0.25 ? SIT : STAND;
        this.wagK = this.st === S.Belly ? 0.35 : this.petMode === 'lean' ? 0.9 : 0.6;
        q.lookPitch = this.petMode === 'lean' ? -0.05 : -0.25;
        q.cur.nr = this.petMode === 'lean' ? 0.25 * Math.sin(c.t * 1.3) : q.cur.nr;
        break;
      }
    }
    if (this.st !== S.Sit && this.st !== S.Pet) q.lookPitch *= 0.9;
  }
  private sx = DOG_BED.x; private sz = DOG_BED.z;
}
export type { Pose };
