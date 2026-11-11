/**
 * 行者：一袭素色长衫的小小身影——寺里由你操纵着走动的那个人。
 *
 * 做法（混合）：
 *   长衫与两袖不是蒙皮，也不是刚性件，而是「每帧现摆的筒」（loft.ts）：
 *     衣身自下摆到领口二十几圈，每一圈是一个前后可不等的超椭圆。上身的圈串在一条会弯的脊上（鞠躬、叩拜时脊弯下去）；
 *     下摆的圈站立时裹着两条腿（腿往前迈，那一侧的布被顶出去，带一点滞后），跪、坐、蹲时按各自的样子铺在地上——
 *     姿态之间只是这些圈的参数在过渡，所以衣摆会自己「铺开」，也没有关节的缝。
 *     袖子是套在臂上的宽筒：臂越平，筒越往下垂成一只袋；臂垂下时筒就绕在臂上、长过手腕。袋的方向带惯性，走动、抬手时会晃。
 *     袜筒也在这张网里：自脚踝顺着小腿的方向（跪着时小腿是贴地的，所以它不会戳到地下去）。
 *   头、手、鞋、斗笠是刚性件，位置由脊与两段臂的反向运动学给出。
 * 所有量都在小人自己的坐标里算（原点在两脚之间的地面，+z 朝前，+x 是他的左手边）。
 */
import * as THREE from 'three';
import { enhance, type Mats } from '../core/mats';
import type { Quality } from '../core/World';
import { LoftGeo } from './loft';
import { HEAD_UP, TEX, bodyV, buildFeet, buildHands, buildHat, buildHead, garmentTexture } from './parts';
import type { Avatar, HandsName, PoseName, ReachOpts, Seat, Side } from './types';

export type { Seat } from './types';
export type GroundFn = (x: number, z: number) => number | null;

const POSES = ['stand', 'kneel', 'sit', 'crouch'] as const;
type W4 = Record<PoseName, number>;

// —— 骨架的几个尺寸（米） ——
const PELVIS = 0.86, HEM = 0.085;
const SH_X = 0.138, L_UP = 0.245, L_FORE = 0.215, PALM = 0.07;
const HIP_X = 0.08, L_TH = 0.375, L_SH = 0.37, ANKLE = 0.07;
const FOOT_X = 0.076;

/** 上身各圈（自胯往上）：站立时的高、半宽、前半径、后半径、方圆的程度 */
const UP: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0.820, 0.170, 0.118, 0.128, 2.25],
  [0.892, 0.158, 0.114, 0.116, 2.2],
  [0.945, 0.146, 0.105, 0.104, 2.15],
  [0.985, 0.143, 0.103, 0.101, 2.15],
  [1.040, 0.149, 0.108, 0.105, 2.2],
  [1.100, 0.157, 0.113, 0.110, 2.25],
  [1.160, 0.163, 0.118, 0.114, 2.3],
  [1.208, 0.164, 0.112, 0.114, 2.4],
  [1.245, 0.152, 0.096, 0.104, 2.6],
  [1.272, 0.112, 0.076, 0.088, 2.4],
  [1.292, 0.070, 0.060, 0.068, 2.1],
  [1.316, 0.055, 0.050, 0.058, 2.0],
];
const K_CHEST = 6, K_SHOULDER = 8, K_NECK = 10, NUP = UP.length;

/** 各姿态：骨盆心的高与前后、上身前倾 */
const BASE: Record<PoseName, { py: number; pz: number; lean: number }> = {
  stand: { py: PELVIS, pz: 0, lean: 0 },
  kneel: { py: 0.305, pz: -0.085, lean: 0.03 },
  sit: { py: 0.122, pz: -0.04, lean: 0.012 },
  crouch: { py: 0.37, pz: -0.15, lean: 0.5 },
};
/** 俯身到底时：胯折多少、脊弯多少、颈再低多少，骨盆抬起与前移多少 */
const BOW: Record<PoseName, { hip: number; sp: number; neck: number; dy: number; dz: number }> = {
  stand: { hip: 0.8, sp: 0.24, neck: 0.2, dy: 0, dz: -0.07 },
  kneel: { hip: 1.55, sp: 0.6, neck: 0.04, dy: 0.02, dz: 0.03 },
  sit: { hip: 0.12, sp: 0.16, neck: 0.3, dy: 0, dz: 0 },
  crouch: { hip: 0.26, sp: 0.2, neck: 0.1, dy: 0, dz: 0 },
};
/** 落脚点正压在台阶的棱上时，往前或往后挪开多少（依次试） */
const EDGE_TRY = [0.06, -0.06, 0.12, -0.12, 0.18, -0.18];
const HEM_N = 8;                  // 沿下摆量几个点的地面（只在台阶、坡上量）

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease3 = (t: number) => t * t * (3 - 2 * t);
const ease5 = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const V = () => new THREE.Vector3();

interface Sk { y: number; cz: number; a: number; bF: number; bB: number; rise: number; riseW: number }
const newSk = (): Sk => ({ y: 0, cz: 0, a: 0, bF: 0, bB: 0, rise: 0, riseW: 0 });
/** 下摆某一圈在某个姿态下的样子。u：0 是摆脚，1 是胯。hy、hz：胯那一圈的高与前后 */
function skirt(p: PoseName, u: number, hy: number, hz: number, o: Sk) {
  const v = 1 - u, g = 0.012;
  o.rise = 0; o.riseW = 0;
  if (p === 'stand') {
    // 道袍的摆本来就大：站着时垂成一口钟，多出来的布收在褶里
    o.y = HEM + (hy - HEM) * u; o.cz = hz * u;
    o.a = 0.17 + 0.068 * Math.pow(v, 1.25); o.bF = 0.118 + 0.082 * Math.pow(v, 1.25); o.bB = 0.128 + 0.07 * Math.pow(v, 1.25);
  } else if (p === 'kneel') {
    // 跪坐：布自胯搭过大腿到膝前落地，身后盖住脚踝
    o.y = g + (hy - g) * Math.pow(u, 0.82); o.cz = lerp(0.04, hz, Math.pow(u, 1.4));
    o.a = lerp(0.3, 0.17, Math.pow(u, 1.7)); o.bF = lerp(0.335, 0.118, Math.pow(u, 2.3)); o.bB = lerp(0.275, 0.128, Math.pow(u, 1.15));
    o.rise = 0.03 * Math.sin(Math.PI * u);
  } else if (p === 'sit') {
    // 盘坐：两膝在两侧撑开，腿叠在身前，衣摆铺成一个矮而宽的丘
    o.y = g + (hy - g) * Math.pow(u, 0.9); o.cz = lerp(0.085, hz, Math.pow(u, 1.25));
    o.a = lerp(0.365, 0.17, Math.pow(u, 2.0)); o.bF = lerp(0.29, 0.118, Math.pow(u, 1.9)); o.bB = lerp(0.235, 0.128, Math.pow(u, 1.05));
    o.riseW = 0.105 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.9);
  } else {
    // 蹲：两膝在身前顶起一道，身后的布垂到地
    o.y = g + (hy - g) * u; o.cz = lerp(0.03, hz, Math.pow(u, 1.2));
    o.a = lerp(0.255, 0.17, Math.pow(u, 1.3)); o.bF = lerp(0.3, 0.118, Math.pow(u, 2.8)); o.bB = lerp(0.285, 0.128, Math.pow(u, 0.95));
    o.rise = 0.19 * Math.sin(Math.PI * Math.pow(u, 0.72));
  }
}

/**
 * 一只脚。z 是它相对身子的前后：着地时每帧按地面速度往后退（所以不打滑），摆动时从抬脚处迈到身前。
 * 有真实的地面时（setGround）：yw 是它此刻的世界高度——着地时就是落脚那一点踏面的高度。
 */
interface Foot {
  s: number; x: number; y: number; z: number; lift: number; pitch: number;
  air: boolean; wasAir: boolean; s0: number; z0: number; k: number;
  c: number; cz0: number; cl0: number; cy0: number;
  has: boolean; yw: number; y0w: number; y1w: number; adj: number; adjS: number; rising: boolean; off: boolean;
}
const newFoot = (s: number): Foot => ({ s, x: s * FOOT_X, y: 0, z: 0, lift: 0, pitch: 0, air: false, wasAir: false, s0: 0, z0: 0, k: 0, c: -1, cz0: 0, cl0: 0, cy0: 0, has: false, yw: 0, y0w: 0, y1w: 0, adj: 0, adjS: 0, rising: false, off: false });

interface Arm {
  s: number;                       // +1 左（+x），−1 右
  reach: THREE.Vector3 | null; rDir: THREE.Vector3 | null; rPalm: THREE.Vector3 | null; rate: number; rw: number; rpos: THREE.Vector3; rd: THREE.Vector3; rn: THREE.Vector3;
  S: THREE.Vector3; E: THREE.Vector3; W: THREE.Vector3; P: THREE.Vector3; D: THREE.Vector3; prevW: THREE.Vector3;
  bagU: THREE.Vector3; bagF: THREE.Vector3; init: boolean;
  joint: THREE.Object3D;
}
/** 袖子的一圈：s 在臂上的位置（0 肩 … 0.5 肘 … 1 袖口）；k 粗细的倍数；h 沿臂往回退多少（肩头的收口）；lining 折进去的里子 */
interface SRing { s: number; k: number; h: number; lining: boolean }
const SR = (s: number, k = 1, h = 0, lining = false): SRing => ({ s, k, h, lining });

export class Figure implements Avatar {
  root = new THREE.Group();
  readonly height = 1.58;
  readonly eyeY = 1.45;
  joints: Avatar['joints'];
  bow = 0;
  onStep: ((foot: Side) => void) | null = null;
  /** 三角数、绘制次数 */
  stats = { triangles: 0, draws: 0 };
  /** 此刻哪只脚撑着地（撑地的后半程脚跟已经抬起，只有前掌着地） */
  contact = { L: true, R: true };

  private poseName: PoseName = 'stand';
  private w: W4 = { stand: 1, kneel: 0, sit: 0, crouch: 0 };
  private w0: W4 = { stand: 1, kneel: 0, sit: 0, crouch: 0 };
  private w1: W4 = { stand: 1, kneel: 0, sit: 0, crouch: 0 };
  private wT = 1; private wDur = 0.9;
  private hands0: HandsName = 'free'; private hands1: HandsName = 'free'; private hT = 1; private hDur = 0.45;
  private seat: Seat | null = null;
  private ground: GroundFn | null = null; private rootY = 0; private hemG = new Float32Array(HEM_N); private hemOn = false;
  private phase = 0.3; private amp = 0; private wasMoving = false;
  private fL = newFoot(1); private fR = newFoot(-1);
  private bowX = 0; private bowV = 0;
  private lookT: THREE.Vector3 | null = null; private lookW = 0; private lookYaw = 0; private lookPitch = 0;
  private climbS = 0; private rollS = 0; private speedS = 0;
  private lastPos = V(); private hasLast = false; private vel = V(); private vLoc = V();
  private iq = new THREE.Quaternion();
  private hatSwing = 0; private hatV = 0;

  private loft: LoftGeo; private garment: THREE.Mesh;
  private head: THREE.Object3D; private hat: THREE.Mesh; private feet: { L: THREE.Mesh; R: THREE.Mesh };
  private arms: { L: Arm; R: Arm };
  private mats: THREE.Material[] = []; private texs: THREE.Texture[] = [];

  // 圈与表
  private segs: number; private nlow: number; private srs: SRing[]; private segS: number; private segK: number;
  private sn: Float32Array; private cs: Float32Array;                // 衣身一圈上各点的 sin / cos
  private sPu: Float32Array[] = []; private cPu: Float32Array[] = []; // 上身各圈 |sin|^n、|cos|^n
  private sPl: Float32Array[] = []; private cPl: Float32Array[] = []; private nl: number[] = [];
  private rho: Float32Array; private rhoInit = false;                // 下摆各圈各点的半径（带滞后）
  private fold: Float32Array;                                        // 下摆一圈上的褶（固定的起伏）
  private snS: Float32Array; private csS: Float32Array;
  // 脊上各站的位置与朝向
  private stC = new Float32Array(NUP * 3); private stP = new Float32Array(NUP); private stT = new Float32Array(NUP);
  private sk = newSk(); private skB = newSk();
  // 临时量
  private t1 = V(); private t2 = V(); private t3 = V(); private t4 = V(); private t5 = V(); private t6 = V();
  private q1 = new THREE.Quaternion(); private q2 = new THREE.Quaternion(); private e1 = new THREE.Euler(); private m1 = new THREE.Matrix4();
  private legK = [V(), V()]; private legH = [V(), V()]; private legA = [V(), V()];
  private cX = V(); private cF = V(); private cU = V();

  constructor(mats: Mats, q: Quality) {
    const low = q.tier === 'low';
    this.root.name = 'avatar';
    this.segs = low ? 28 : 48; this.nlow = low ? 8 : 13; this.segS = low ? 12 : 20; this.segK = low ? 6 : 8;
    this.srs = low
      ? [SR(0, 0.04, 0.026), SR(0, 0.8, 0.014), SR(0), SR(0.2), SR(0.38), SR(0.5), SR(0.62), SR(0.82), SR(1), SR(0.95, 0.86, 0, true), SR(0.86, 0.03, 0, true)]
      : [SR(0, 0.03, 0.026), SR(0, 0.55, 0.022), SR(0, 0.86, 0.013), SR(0), SR(0.09), SR(0.19), SR(0.3), SR(0.4), SR(0.5), SR(0.6), SR(0.71), SR(0.82), SR(0.92), SR(1), SR(0.97, 0.9, 0, true), SR(0.875, 0.5, 0, true), SR(0.865, 0.03, 0, true)];
    const S = this.segs, NL = this.nlow;
    this.sn = new Float32Array(S + 1); this.cs = new Float32Array(S + 1); this.fold = new Float32Array(S + 1);
    for (let i = 0; i <= S; i++) {
      const a = -Math.PI + (2 * Math.PI * i) / S;
      this.sn[i] = Math.sin(a); this.cs[i] = Math.cos(a);
      this.fold[i] = 0.5 * Math.sin(7 * a + 0.6) + 0.3 * Math.sin(11 * a + 2.1) + 0.3 * Math.sin(4 * a + 4.0);
    }
    const pw = (n: number) => {
      const s = new Float32Array(S + 1), c = new Float32Array(S + 1);
      for (let i = 0; i <= S; i++) { s[i] = Math.pow(Math.abs(this.sn[i]), n); c[i] = Math.pow(Math.abs(this.cs[i]), n); }
      return [s, c] as const;
    };
    for (let k = 0; k < NUP; k++) { const [s, c] = pw(UP[k][4]); this.sPu.push(s); this.cPu.push(c); }
    for (let j = 0; j < NL; j++) { const n = 2.0 + 0.25 * (j / NL); this.nl.push(n); const [s, c] = pw(n); this.sPl.push(s); this.cPl.push(c); }
    this.rho = new Float32Array(NL * (S + 1));
    const SS = this.segS;
    this.snS = new Float32Array(SS + 1); this.csS = new Float32Array(SS + 1);
    for (let i = 0; i <= SS; i++) { const a = -Math.PI + (2 * Math.PI * i) / SS; this.snS[i] = Math.sin(a); this.csS[i] = Math.cos(a); }

    // —— 长衫、两袖、两只袜筒：一张网 ——
    const bodyRings = 2 + NL + NUP + 1, slRings = this.srs.length, SK = this.segK;
    const L = (this.loft = new LoftGeo([{ rings: bodyRings, segs: S }, { rings: slRings, segs: SS }, { rings: slRings, segs: SS }, { rings: 4, segs: SK }, { rings: 4, segs: SK }]));
    const dark = [0.2, 0.215, 0.235];
    for (let r = 0; r < bodyRings; r++) {
      const lining = r < 2 || r === bodyRings - 1;
      const y = r < 2 ? 0.3 : r < 2 + NL ? HEM + (UP[0][0] - HEM) * ((r - 2) / NL) : r === bodyRings - 1 ? 1.34 : UP[r - 2 - NL][0];
      for (let i = 0; i <= S; i++) {
        const o = L.at(0, r, i);
        L.uv[o * 2] = i / S; L.uv[o * 2 + 1] = bodyV(y);
        if (lining) { L.col[o * 3] = dark[0]; L.col[o * 3 + 1] = dark[1]; L.col[o * 3 + 2] = dark[2]; }
      }
    }
    for (const p of [1, 2]) for (let r = 0; r < slRings; r++) {
      const R = this.srs[r];
      for (let i = 0; i <= SS; i++) {
        const o = L.at(p, r, i);
        L.uv[o * 2] = i / SS; L.uv[o * 2 + 1] = R.lining ? TEX.sleeve0 + 0.02 : TEX.sleeve0 + (TEX.sleeve1 - TEX.sleeve0) * R.s;
        if (R.lining) { L.col[o * 3] = dark[0]; L.col[o * 3 + 1] = dark[1]; L.col[o * 3 + 2] = dark[2]; }
      }
    }
    // 袜：用袖子上那块素布，把颜色提成白的
    for (const p of [3, 4]) for (let r = 0; r < 4; r++) for (let i = 0; i <= SK; i++) {
      const o = L.at(p, r, i);
      L.uv[o * 2] = 0.3 + (0.1 * i) / SK; L.uv[o * 2 + 1] = TEX.sleeve0 + 0.03 + 0.02 * r;
      L.col[o * 3] = 1.6; L.col[o * 3 + 1] = 1.4; L.col[o * 3 + 2] = 1.22;
    }
    const gtex = garmentTexture(low);
    const nm = mats.clothGrey.normalMap ? mats.clothGrey.normalMap.clone() : null;
    if (nm) { nm.repeat.set(30, 64); nm.needsUpdate = true; this.texs.push(nm); }
    this.texs.push(gtex);
    const gm = enhance(new THREE.MeshStandardMaterial({ map: gtex, normalMap: nm, normalScale: new THREE.Vector2(0.55, 0.55), vertexColors: true, roughness: 0.93, metalness: 0 }), { wet: true });
    this.garment = new THREE.Mesh(L.geo, gm);
    this.garment.frustumCulled = false; this.garment.castShadow = true; this.garment.receiveShadow = true; this.garment.name = 'avatar:robe';
    this.root.add(this.garment);
    this.mats.push(gm);

    // —— 刚性件 ——
    const hd = buildHead(low), hn = buildHands(low), ft = buildFeet(low), ht = buildHat(low);
    this.mats.push(hd.mat, hn.mat, ft.mat, ht.mat);
    for (const m of [hd.mat, ht.mat]) if (m.map) this.texs.push(m.map);
    const hips = new THREE.Group(), chest = new THREE.Group(), neck = new THREE.Group(), headJ = new THREE.Group(), handL = new THREE.Group(), handR = new THREE.Group();
    hips.name = 'hips'; chest.name = 'chest'; headJ.name = 'head'; handL.name = 'handL'; handR.name = 'handR';
    neck.add(hd.mesh); headJ.position.set(0, HEAD_UP, 0.008); neck.add(headJ);
    chest.add(ht.mesh);
    handL.add(hn.L); handR.add(hn.R);
    this.root.add(hips, chest, neck, handL, handR, ft.L, ft.R);
    this.head = neck; this.hat = ht.mesh; this.feet = ft;
    this.joints = { hips, chest, head: headJ, handL, handR };
    const arm = (s: number, joint: THREE.Object3D): Arm => ({ s, reach: null, rDir: null, rPalm: null, rate: 10, rw: 0, rpos: V(), rd: new THREE.Vector3(0, -1, 0), rn: new THREE.Vector3(-s, 0, 0), S: V(), E: V(), W: V(), P: V(), D: new THREE.Vector3(0, -1, 0), prevW: V(), bagU: new THREE.Vector3(0, -0.2, -1).normalize(), bagF: new THREE.Vector3(0, -0.2, -1).normalize(), init: false, joint });
    this.arms = { L: arm(1, handL), R: arm(-1, handR) };
    const tris = (m: THREE.Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    this.stats.triangles = Math.round(L.triangles + [hd.mesh, hn.L, hn.R, ft.L, ft.R, ht.mesh].reduce((a, m) => a + tris(m), 0));
    this.stats.draws = 7;
    this.update(0, 0, { speed: 0 });
  }

  get pose() { return this.poseName; }
  /** 步态此刻的相位（0…1；0 是左脚跟着地，0.5 是右脚跟着地） */
  get gaitPhase() { return this.phase; }
  setPose(p: PoseName, dur = 0.9) {
    if (p === this.poseName && this.wT >= 1) return;
    this.poseName = p;
    for (const k of POSES) { this.w0[k] = this.w[k]; this.w1[k] = k === p ? 1 : 0; }
    this.wT = dur <= 0 ? 1 : 0; this.wDur = Math.max(0.05, dur);
    if (dur <= 0) for (const k of POSES) this.w[k] = this.w1[k];
  }
  setHands(h: HandsName, dur = 0.45) {
    if (h === this.hands1) return;
    // 上一次还没换完：就从半路上的样子接着换（差别很小，不另记）
    this.hands0 = this.hT > 0.5 ? this.hands1 : this.hands0; this.hands1 = h;
    this.hT = dur <= 0 ? 1 : 0; this.hDur = Math.max(0.05, dur);
  }
  /** 身下垫着东西（root 在垫子的顶面上）：垫子外面的衣摆、脚、按地的手落到地面去。null 即平地 */
  setSeat(s: Seat | null) { this.seat = s; }
  /** 脚下真实的地面（世界坐标 x、z → 世界高度，界外 null）。有了它，脚落在踏面上；没有就按 update 给的坡度摆 */
  setGround(fn: GroundFn | null) { this.ground = fn; this.fL.has = this.fR.has = false; }
  reach(side: Side, target: THREE.Vector3 | null, o: ReachOpts = {}) {
    const a = this.arms[side];
    if (!target) { a.reach = null; a.rDir = null; a.rPalm = null; return; }
    if (!a.reach) { a.reach = V(); if (a.rw < 0.02) { a.rpos.copy(a.P); a.rd.copy(a.D); } }
    a.reach.copy(target);
    a.rDir = o.dir ? (a.rDir ?? V()).copy(o.dir) : null;
    a.rPalm = o.palm ? (a.rPalm ?? V()).copy(o.palm) : null;
    a.rate = o.rate ?? 10;
  }
  lookAt(p: THREE.Vector3 | null) { this.lookT = p ? (this.lookT ?? V()).copy(p) : null; }
  setVisible(v: boolean) { this.root.visible = v; }
  dispose() {
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.root.removeFromParent();
  }

  /** 垫子外面的地面比 root 低多少（负数）；没有垫子就是 0。soft：坐着时两腿是斜着落下去的（缓），跪着时布沿垫子的边垂下去（陡） */
  private groundAt(x: number, z: number, soft = 0): number {
    const st = this.seat;
    if (!st) return 0;
    const dx = x - (st.cx ?? 0), dz = z - (st.cz ?? 0);
    const d = st.r != null ? Math.hypot(dx, dz) - st.r : Math.max(Math.abs(dx) - (st.hx ?? 0.39), Math.abs(dz) - (st.hz ?? 0.26));
    return -st.h * smooth(-0.015 - 0.05 * soft, 0.05 + 0.08 * soft, d) * (1 - this.w.stand);
  }
  /** 自己坐标里的一点 (x, z) 处真实地面的世界高度 */
  private groundW(x: number, z: number): number | null {
    const e = this.root.matrixWorld.elements;
    return this.ground!(e[0] * x + e[8] * z + e[12], e[2] * x + e[10] * z + e[14]);
  }

  update(dt: number, t: number, move: { speed: number; climb?: number; turn?: number }) {
    dt = clamp(dt || 0, 0, 0.05);
    const W = this.w, root = this.root;
    root.updateWorldMatrix(true, false);
    this.rootY = root.matrixWorld.elements[13];
    // 自己在世界里走得多快（给袖子、斗笠的惯性用）
    const wp = this.t1.setFromMatrixPosition(root.matrixWorld);
    if (this.hasLast && dt > 0) {
      this.vel.subVectors(wp, this.lastPos).divideScalar(dt);
      if (this.vel.lengthSq() > 64) { this.vel.set(0, 0, 0); this.fL.has = this.fR.has = false; }      // 被搬到别处去了：脚下的地面重新量
    } else this.vel.set(0, 0, 0);
    this.lastPos.copy(wp); this.hasLast = true;
    this.iq.setFromRotationMatrix(root.matrixWorld).invert();
    const vLoc = this.vLoc.copy(this.vel).applyQuaternion(this.iq);

    // —— 姿态、手的摆法的过渡 ——
    if (this.wT < 1) { this.wT = Math.min(1, this.wT + dt / this.wDur); const k = ease5(this.wT); for (const p of POSES) W[p] = lerp(this.w0[p], this.w1[p], k); }
    if (this.hT < 1) this.hT = Math.min(1, this.hT + dt / this.hDur);
    const trans = Math.sin(Math.PI * this.wT);
    let py = 0, pz = 0, lean = 0;
    for (const p of POSES) { py += W[p] * BASE[p].py; pz += W[p] * BASE[p].pz; lean += W[p] * BASE[p].lean; }
    lean += 0.2 * trans * (1 - Math.abs(W.stand * 2 - 1));          // 起身、蹲下的半途身子先往前探

    // —— 步态 ——
    const sp = Math.max(0, move.speed || 0), moving = sp > 0.08 && W.stand > 0.6;
    this.speedS += (sp - this.speedS) * Math.min(1, dt * 8);
    this.climbS += (clamp(move.climb ?? 0, -0.7, 0.7) * (moving ? 1 : 0) - this.climbS) * Math.min(1, dt * 6);
    this.rollS += (clamp((move.turn ?? 0) * 0.04 * Math.min(1.6, sp / 1.9), -0.11, 0.11) - this.rollS) * Math.min(1, dt * 5);
    this.amp += ((moving ? 1 : 0) - this.amp) * Math.min(1, dt * (moving ? 6.5 : 5));
    const A = this.amp * W.stand, climb = this.climbS, roll = this.rollS * W.stand;
    const run = smooth(2.2, 3.0, this.speedS);                       // 快到一定程度就是小跑：两脚有同时离地的一瞬
    const beta = lerp(0.62, 0.44, run);                              // 一步里脚着地的时间占比
    const stepLen = clamp(0.4 + 0.19 * this.speedS, 0.36, 1.05) * (1 - 0.32 * Math.min(1, Math.abs(climb) * 2));
    const liftH = 0.036 + 0.03 * Math.min(1, this.speedS / 1.5) + 0.05 * run + 0.13 * Math.max(0, climb);
    const FL = this.fL, FR = this.fR;
    if (moving) {
      if (!this.wasMoving) {
        // 起步：正在半空的那只脚接着迈；两脚都着地就让后面那只先迈
        const a = FL.c >= 0 || FL.air ? FL : FR.c >= 0 || FR.air ? FR : null;
        if (a) { const pa = beta + (1 - beta) * 0.3; this.phase = a === FL ? pa : (pa + 0.5) % 1; a.air = false; a.c = -1; }
        else { const fr = FL.z >= FR.z ? FL : FR, pf = beta * clamp((1 - fr.z / (beta * stepLen)) / 2, 0.05, 0.92); this.phase = fr === FL ? pf : (pf + 0.5) % 1; }
      }
      const before = this.phase;
      this.phase = (this.phase + (sp / (2 * stepLen)) * dt) % 1;
      if (this.phase < before) this.onStep?.('L');
      else if (before < 0.5 && this.phase >= 0.5) this.onStep?.('R');
      this.stepFoot(FL, this.phase, dt, sp, stepLen, beta, run, liftH);
      this.stepFoot(FR, (this.phase + 0.5) % 1, dt, sp, stepLen, beta, run, liftH);
    } else {
      // 停步：两脚一先一后收回来并拢（着地的那只不动，所以不滑）
      const busy = FL.c >= 0 || FR.c >= 0;
      if (!busy) {
        const c = FL.air ? FL : FR.air ? FR : Math.abs(FL.z) >= Math.abs(FR.z) ? FL : FR;
        if (c.air || Math.abs(c.z) > 0.02) { c.c = 0; c.cz0 = c.z; c.cl0 = c.lift; c.cy0 = c.yw; c.air = true; }
      }
      for (const f of [FL, FR]) {
        if (f.c >= 0) {
          f.c = Math.min(1, f.c + dt / 0.36);
          f.z = lerp(f.cz0, 0, ease3(f.c));
          f.lift = Math.max(0, f.cl0 * (1 - f.c * 1.6)) + 0.03 * Math.min(1, Math.abs(f.cz0) / 0.12) * Math.sin(Math.PI * f.c);
          f.pitch *= Math.max(0, 1 - dt * 12);
          if (f.c >= 1) { f.c = -1; f.air = false; f.lift = 0; f.pitch = 0; f.z = 0; if (Math.abs(f.cz0) > 0.06) this.onStep?.(f === FL ? 'L' : 'R'); }
        } else f.pitch *= Math.max(0, 1 - dt * 10);
      }
    }
    this.wasMoving = moving;
    this.contact.L = !FL.air; this.contact.R = !FR.air;
    const ph = this.phase;
    const bobA = (0.008 + 0.024 * (stepLen / 0.7) * (stepLen / 0.7)) * (1 - 0.35 * run);
    // 走：两脚都着地时身子最低；跑：单脚撑地时最低
    const bob = A * bobA * 0.5 * (1 - Math.cos(4 * Math.PI * (ph - beta / 2)) * (1 - 2 * run));
    const sway = A * 0.013 * (1 - 0.5 * run) * Math.sin(2 * Math.PI * (ph - 0.05));
    const yawP = -A * 0.085 * Math.cos(2 * Math.PI * ph), yawS = A * 0.06 * Math.cos(2 * Math.PI * ph);
    const gaitLean = A * (0.03 + 0.03 * Math.min(1.8, this.speedS / 1.9) + 0.03 * run);
    lean += gaitLean + A * (climb > 0 ? 0.26 : 0.14) * climb;
    const idle = 1 - this.amp, breath = Math.sin(t * 1.3), drift = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.23 + 1.3) * 0.5;
    FL.x = FOOT_X + sway * 0.3; FR.x = -FOOT_X + sway * 0.3;
    this.footY(FL, ph, dt, moving, stepLen, beta, liftH, climb);
    this.footY(FR, (ph + 0.5) % 1, dt, moving, stepLen, beta, liftH, climb);

    // —— 俯身（临界阻尼的弹簧：起落从容） ——
    {
      const k = 4.3, n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n, g = clamp(this.bow, 0, 1);
      for (let i = 0; i < n; i++) { this.bowV += (k * k * (g - this.bowX) - 2 * k * this.bowV) * h; this.bowX += this.bowV * h; }
    }
    const b = clamp(this.bowX, 0, 1.03);
    let bHip = 0, bSp = 0, bNeck = 0;
    for (const p of POSES) { const B = BOW[p]; bHip += W[p] * B.hip * b; bSp += W[p] * B.sp * b; bNeck += W[p] * B.neck * b; py += W[p] * B.dy * b; pz += W[p] * B.dz * Math.sin(b * Math.PI * 0.5); }
    if (this.seat && W.kneel > 0.01) {
      // 跪在垫子上叩拜：额头要落到垫子前面更低的地上，身子伏得更深，臀抬起、往前送
      const deep = -this.groundAt(0, 0.47) * W.kneel * smooth(0.45, 1, b);
      bHip += deep * 2.4; bNeck -= deep * 1.2; py += deep * 0.35; pz += deep * 0.45;
    }
    py += -bob + idle * W.stand * 0.0015 * breath;
    const swayAll = sway + idle * W.stand * 0.004 * drift;
    const px = swayAll + roll * (py - 0.09);

    // —— 看 ——
    this.lookW += ((this.lookT ? 1 : 0) - this.lookW) * Math.min(1, dt * 5);
    if (this.lookT) {
      const lt = root.worldToLocal(this.t3.copy(this.lookT));
      const hy = py + (1.45 - PELVIS) * Math.cos(lean + bHip), hz = pz + (1.45 - PELVIS) * Math.sin(lean + bHip);
      const dx = lt.x - px, dy = lt.y - hy, dz = lt.z - hz;
      const yw = clamp(Math.atan2(dx, Math.max(0.05, dz)), -1.22, 1.22), pt = -Math.atan2(dy, Math.hypot(dx, dz));
      const k = Math.min(1, dt * 6);
      this.lookYaw += (yw - this.lookYaw) * k; this.lookPitch += (pt - this.lookPitch) * k;
    }
    const lkY = this.lookYaw * this.lookW;

    // —— 脊：自胯往上各站的位置、前倾、扭转 ——
    const C = this.stC, SP = this.stP, ST = this.stT;
    const baseP = lean + bHip;
    for (let k = 0; k < NUP; k++) {
      const y = UP[k][0];
      SP[k] = baseP * (0.3 + 0.7 * smooth(0.8, 0.955, y)) + bSp * smooth(0.985, 1.215, y);
      ST[k] = lerp(yawP, yawS, smooth(0.82, 1.25, y)) + 0.28 * lkY * smooth(1.0, 1.25, y);
    }
    C[0] = px; C[1] = py - 0.04; C[2] = pz;
    for (let k = 1; k < NUP; k++) {
      const dh = UP[k][0] - UP[k - 1][0], p = (SP[k] + SP[k - 1]) * 0.5;
      C[k * 3] = C[k * 3 - 3] + roll * dh * 1.25; C[k * 3 + 1] = C[k * 3 - 2] + Math.cos(p) * dh; C[k * 3 + 2] = C[k * 3 - 1] + Math.sin(p) * dh;
    }
    // 呼吸：肩略起
    const br = 0.0022 * (0.4 + 0.6 * idle) * breath;
    for (let k = K_CHEST; k < NUP; k++) C[k * 3 + 1] += br * smooth(K_CHEST - 1, K_SHOULDER, k);

    // —— 关节：胯、胸、颈与头 ——
    const J = this.joints;
    J.hips.position.set(px, py, pz); J.hips.rotation.set(SP[0], yawP, -roll, 'YXZ');
    const cc = K_CHEST * 3;
    J.chest.position.set(C[cc], C[cc + 1], C[cc + 2]); J.chest.rotation.set(SP[K_CHEST], ST[K_CHEST], -roll * 1.25, 'YXZ');
    {
      // 胸的三个轴（给手的摆法用）
      const cp = SP[K_CHEST], ct = ST[K_CHEST];
      this.cX.set(Math.cos(ct), 0, -Math.sin(ct));
      this.cF.set(Math.sin(ct) * Math.cos(cp), -Math.sin(cp), Math.cos(ct) * Math.cos(cp));
      this.cU.set(Math.sin(ct) * Math.sin(cp), Math.cos(cp), Math.cos(ct) * Math.sin(cp));
    }
    // 斗笠：跟着胸，带一点滞后的晃
    {
      const drive = -vLoc.x * 0.012 + A * 0.02 * Math.sin(4 * Math.PI * ph + 0.8) - roll * 0.3;
      const k = 9, z = 0.35;
      this.hatV += (k * k * (drive - this.hatSwing) - 2 * z * k * this.hatV) * dt; this.hatSwing = clamp(this.hatSwing + this.hatV * dt, -0.12, 0.12);
      this.hat.rotation.set(A * 0.012 * Math.sin(4 * Math.PI * ph), 0, this.hatSwing);
    }
    const nk = K_NECK * 3, topP = SP[NUP - 1];
    let headP = topP - 0.65 * gaitLean - W.crouch * 0.34 * (1 - b) + bNeck + idle * 0.01 * Math.sin(t * 0.5);
    if (this.lookW > 0.001) headP = lerp(headP, topP + clamp(this.lookPitch - topP, -0.61, 0.61), this.lookW);
    this.head.position.set(C[nk] + roll * 0.01, C[nk + 1] - 0.004, C[nk + 2]);
    this.head.rotation.set(headP, yawS * 0.3 + lkY, -roll * 0.5 + A * 0.01 * Math.sin(2 * Math.PI * ph), 'YXZ');

    // —— 两臂（左臂随右腿摆） ——
    const sw = 1 / Math.max(0.2, beta * stepLen);
    this.solveArm(this.arms.L, dt, A, FR.z * sw, run, b);
    this.solveArm(this.arms.R, dt, A, FL.z * sw, run, b);

    // —— 脚 ——
    this.placeFoot(this.feet.L, FL, b);
    this.placeFoot(this.feet.R, FR, b);

    // —— 长衫、袖子、袜筒 ——
    this.shapeBody(dt, swayAll, px, py, pz, yawP, roll, climb, br);
    this.shapeSleeve(1, this.arms.L); this.shapeSleeve(2, this.arms.R);
    this.shapeSock(3, this.feet.L, FL, 0); this.shapeSock(4, this.feet.R, FR, 1);
    this.loft.normals(); this.loft.commit();
  }

  /** 一只脚走一帧。pf：这只脚自己的相位（0 是脚跟着地） */
  private stepFoot(f: Foot, pf: number, dt: number, sp: number, l: number, beta: number, run: number, liftH: number) {
    const up = -0.24 * (1 - 0.6 * run), down = 0.42 + 0.3 * run;
    if (pf < beta) {
      const s = pf / beta;
      f.air = false; f.c = -1;
      f.z -= sp * dt; f.lift = 0;
      f.pitch = s < 0.14 ? up * (1 - s / 0.14) : s > 0.72 ? down * Math.pow((s - 0.72) / 0.28, 1.6) : 0;
    } else {
      const s = (pf - beta) / (1 - beta);
      if (!f.air) { f.air = true; f.s0 = Math.min(s, 0.8); f.z0 = f.z; f.c = -1; f.adj = f.adjS = 0; }
      // 上台阶：先抬起来再往前送，免得脚尖踢在立面上
      const k = clamp((s - f.s0) / (1 - f.s0), 0, 1), e = 0.5 - 0.5 * Math.cos(Math.PI * (f.rising ? Math.pow(k, 1.25) : k)), part = 1 - 0.55 * f.s0;
      f.k = k;
      f.adjS += (f.adj - f.adjS) * Math.min(1, dt * 12);
      f.z = lerp(f.z0, beta * l + f.adjS, e);
      f.lift = liftH * part * Math.pow(Math.sin(Math.PI * Math.pow(k, 1 - 0.2 * run)), 0.85);
      f.pitch = lerp(down, up, smooth(0.1, 0.92, k)) * part;
    }
  }

  /**
   * 一只脚的高低。没有真实的地面：按坡摆（climb × 前后）。
   * 有（setGround）：着地的脚停在落脚那一点踏面的高度上；摆动的脚自抬脚处的高度迈到落脚处的高度，
   * 中间抬过两处里较高的那一处；落脚点若正压着台阶的棱，就往前或往后挪开。
   */
  private footY(f: Foot, pf: number, dt: number, moving: boolean, l: number, beta: number, liftH: number, climb: number) {
    const slope = f.lift + climb * f.z;
    if (!this.ground || this.w.stand < 0.5) { f.y = slope; f.has = false; f.wasAir = f.air; f.rising = false; f.off = false; return; }
    const rootY = this.rootY, MID = 0.045;                          // 量脚心底下
    if (!f.has) { f.yw = this.groundW(f.x, f.z + MID) ?? rootY + climb * f.z; f.y0w = f.y1w = f.yw; f.has = true; }
    if (!f.air) {
      if (f.wasAir || !moving) {
        // 刚落地：量一次，撑地的这一程里就不变了（脚在世界里是不动的）；站定时一直量着，脚下的地面变了就跟过去
        const g = this.groundW(f.x, f.z + MID);
        if (g != null) f.yw = f.wasAir ? g : f.yw + (g - f.yw) * Math.min(1, dt * 14);
      }
      f.y = f.yw - rootY; f.rising = false; f.off = Math.abs(f.y) > 0.03;
    } else if (f.c >= 0) {
      // 停步时收脚：落到两脚并拢处的地面
      const g = this.groundW(f.x, MID) ?? rootY;
      f.yw = lerp(f.cy0, g, ease3(f.c));
      f.y = f.yw - rootY + 0.03 * Math.sin(Math.PI * f.c); f.off = Math.abs(g - rootY) > 0.03;
    } else {
      if (!f.wasAir) f.y0w = f.yw;
      // 这只脚将落在身前多远：身子还要往前走 (1 − pf) × 一个整步周期的路
      const zL = beta * l + (1 - pf) * 2 * l;
      const edge = (a: number) => { const h = this.groundW(f.x, zL + a - 0.05), tt = this.groundW(f.x, zL + a + 0.14); return h == null || tt == null ? 0 : Math.abs(h - tt); };
      if (edge(f.adj) > 0.03) for (const c of EDGE_TRY) if (edge(c) <= 0.03) { f.adj = c; break; }
      f.y1w = this.groundW(f.x, zL + f.adj + MID) ?? rootY + climb * (beta * l);
      const d = f.y1w - f.y0w, k = f.k;
      f.rising = d > 0.03;
      const top = Math.max(f.y0w, f.y1w) + liftH + (Math.abs(d) > 0.03 ? 0.035 : 0);
      const a = smooth(0, f.rising ? 0.26 : 0.38, k), bq = smooth(d < -0.03 ? 0.62 : 0.55, 1, k);
      f.yw = lerp(lerp(f.y0w, top, a), f.y1w, bq);
      f.y = f.yw - rootY; f.off = Math.abs(f.y0w - rootY) > 0.03 || Math.abs(f.y1w - rootY) > 0.03;
    }
    f.wasAir = f.air;
  }

  /** 某种摆法下一只手该在哪：掌心 P、指向 D、手心 N（小人自己的坐标） */
  private handTarget(h: HandsName, a: Arm, A: number, swing: number, run: number, P: THREE.Vector3, D: THREE.Vector3, N: THREE.Vector3) {
    const W = this.w, C = this.stC, s = a.s, X = this.cX, F = this.cF, U = this.cU, cc = K_CHEST * 3, hp = this.joints.hips.position;
    if (h === 'pray') {
      P.set(C[cc], C[cc + 1], C[cc + 2]).addScaledVector(X, s * 0.0125).addScaledVector(U, 0.088).addScaledVector(F, 0.2);
      D.copy(U).multiplyScalar(0.93).addScaledVector(F, 0.36); N.copy(X).multiplyScalar(-s);
    } else if (h === 'sleeve') {
      // 拢袖：两手各探进对面的袖口里
      P.set(C[cc], C[cc + 1], C[cc + 2]).addScaledVector(X, -s * 0.1).addScaledVector(U, -0.158 - (s > 0 ? 0.012 : 0)).addScaledVector(F, 0.137 - (s > 0 ? 0.008 : 0));
      D.copy(X).multiplyScalar(-s); N.copy(F).multiplyScalar(-1);
    } else if (h === 'lap') {
      P.copy(hp).addScaledVector(X, s * 0.02).addScaledVector(U, 0.085 + (s < 0 ? 0.013 : 0)).addScaledVector(F, 0.19);
      D.copy(X).multiplyScalar(-s).addScaledVector(F, 0.28); N.copy(U);
    } else {
      // free：站着自然下垂、随步子前后摆（跑起来臂微屈）；跪着搭在腿上；坐着搭在膝头；蹲着搭在膝上
      const sw = swing * A * (0.085 + 0.04 * run) * Math.min(1.5, 0.6 + this.speedS / 3.2);
      P.set(0, 0, 0); D.set(0, 0, 0); N.set(0, 0, 0);
      if (W.stand > 0.001) {
        const w = W.stand, r = run * A;
        P.x += w * (a.S.x + s * 0.075); P.y += w * (a.S.y - lerp(L_UP + L_FORE + PALM - 0.022 - Math.abs(sw) * 0.12, 0.44, r)); P.z += w * (a.S.z + lerp(0.035, 0.09, r) + sw);
        D.y -= w * lerp(1, 0.85, r); D.z += w * (lerp(0.1, 0.5, r) + sw * 1.2); N.x -= w * s;
      }
      if (W.kneel > 0.001) { const w = W.kneel; P.x += w * (hp.x + s * 0.105); P.y += w * (hp.y - 0.04); P.z += w * (hp.z + 0.2); D.z += w; D.y -= w * 0.3; D.x -= w * s * 0.15; N.y -= w; }
      if (W.sit > 0.001) { const w = W.sit; P.x += w * s * 0.275; P.y += w * 0.19; P.z += w * 0.135; D.z += w * 0.8; D.y -= w * 0.45; D.x += w * s * 0.35; N.y -= w; }
      if (W.crouch > 0.001) { const w = W.crouch; P.x += w * s * 0.135; P.y += w * 0.47; P.z += w * 0.24; D.z += w; D.y -= w * 0.5; N.y -= w; }
    }
  }

  /** 一只手：按摆法（或被 reach 占着）定出掌心与朝向，再用两段臂的反向运动学解出肘与腕 */
  private solveArm(a: Arm, dt: number, A: number, swing: number, run: number, b: number) {
    const W = this.w, C = this.stC, s = a.s;
    // 肩
    const sh = K_SHOULDER * 3, st = this.stT[K_SHOULDER];
    a.S.set(C[sh] + Math.cos(st) * s * SH_X, C[sh + 1] - 0.022, C[sh + 2] - Math.sin(st) * s * SH_X);
    // 摆法（换摆法时在新旧之间过渡）
    const P = _fp, D = _fd, N = _fn;
    this.handTarget(this.hands1, a, A, swing, run, P, D, N);
    if (this.hT < 1) { this.handTarget(this.hands0, a, A, swing, run, _p0, _d0, _n0); const e = ease3(this.hT); P.lerpVectors(_p0, P, e); D.lerpVectors(_d0, D, e); N.lerpVectors(_n0, N, e); }
    // 坐在垫子上：搭在膝头的手随膝落下去
    if (W.sit > 0.001 && this.seat && this.hands1 === 'free') P.y += this.groundAt(P.x, P.z, 1) * 0.75;
    // 跪着叩拜：两手前伸按地，在头的两侧
    const wb = W.kneel * smooth(0.2, 0.8, b);
    if (wb > 0.001) {
      const hx = s * 0.172, hz = 0.45 + 0.04 * b;
      P.lerp(_p.set(hx, 0.034 + this.groundAt(hx, hz), hz), wb);
      D.lerp(_p.set(-s * 0.18, 0, 1), wb); N.lerp(_p.set(0, -1, 0), wb);
    }
    D.normalize();
    // 被 reach 占着：伸向世界里的那一点
    a.rw += ((a.reach ? 1 : 0) - a.rw) * (a.init ? Math.min(1, dt * (a.reach ? 7 : 4.5)) : 1);
    if (a.reach) {
      const k = a.init ? 1 - Math.exp(-a.rate * dt) : 1;
      a.rpos.lerp(this.root.worldToLocal(_p.copy(a.reach)), k);
      if (a.rDir) a.rd.lerp(_p.copy(a.rDir).applyQuaternion(this.iq).normalize(), k).normalize();
      else a.rd.lerp(_p.subVectors(a.rpos, a.S).normalize(), k).normalize();
      if (a.rPalm) a.rn.lerp(_p.copy(a.rPalm).applyQuaternion(this.iq), k);
      else a.rn.lerp(_p.set(-s * 0.6, -0.8, 0), k);
    }
    if (a.rw > 0.001) { P.lerp(a.rpos, a.rw); D.lerp(a.rd, a.rw).normalize(); N.lerp(a.rn, a.rw); }
    a.D.copy(D);
    // 腕 = 掌心 − 指向 × 半掌长；解两段臂
    const d = _w.copy(P).addScaledVector(D, -PALM).sub(a.S); let dist = d.length();
    const maxR = L_UP + L_FORE - 0.003, minR = 0.08;
    if (dist < 1e-4) { d.set(0, -1, 0); dist = 1; }
    const use = clamp(dist, minR, maxR);
    const nrm = d.multiplyScalar(1 / dist);
    a.W.copy(a.S).addScaledVector(nrm, use);
    const al = (L_UP * L_UP - L_FORE * L_FORE + use * use) / (2 * use), hh = Math.sqrt(Math.max(0, L_UP * L_UP - al * al));
    // 肘朝外、朝下、略朝后；手举得高时更朝外；拢袖时肘在身前（小臂才横得过来）
    const up = smooth(-0.1, 0.25, a.W.y - a.S.y);
    const e1 = ease3(this.hT), fwd = ((this.hands1 === 'sleeve' ? e1 : 0) + (this.hands0 === 'sleeve' ? 1 - e1 : 0)) * (1 - a.rw) * (1 - wb);
    const pole = _pole.set(s * lerp(0.72, 0.95, up), lerp(lerp(-0.6, -0.12, up), -0.5, fwd), lerp(lerp(-0.42, -0.25, up), 0.36, fwd));
    pole.addScaledVector(nrm, -pole.dot(nrm));
    if (pole.lengthSq() < 1e-6) pole.set(s, 0, 0).addScaledVector(nrm, -s * nrm.x);
    pole.normalize();
    a.E.copy(a.S).addScaledVector(nrm, al).addScaledVector(pole, hh);
    // 手：掌心的挂点（+y 指尖、+z 手心）
    a.P.copy(a.W).addScaledVector(D, PALM);
    const z = _z.copy(N).addScaledVector(D, -N.dot(D));
    if (z.lengthSq() < 1e-6) z.set(-s, 0, 0).addScaledVector(D, s * D.x);
    z.normalize();
    a.joint.position.copy(a.P); a.joint.quaternion.setFromRotationMatrix(this.m1.makeBasis(_x.crossVectors(D, z), D, z));
    // 袖袋的方向：重力在臂的垂面里的那一份；臂垂直时袋在身后；再减一点手腕的速度（惯性）
    const wv = _wv.subVectors(a.W, a.prevW); if (dt > 0 && a.init) wv.divideScalar(dt); else wv.set(0, 0, 0);
    if (wv.lengthSq() > 100) wv.set(0, 0, 0);
    wv.add(this.vLoc); a.prevW.copy(a.W);
    const k = a.init ? Math.min(1, dt * 8) : 1;
    this.bag(_t.subVectors(a.E, a.S).normalize(), a.bagU, s, wv, 0.03, k);
    this.bag(_t.subVectors(a.W, a.E).normalize(), a.bagF, s, wv, 0.06, k);
    a.init = true;
  }
  private bag(T: THREE.Vector3, cur: THREE.Vector3, s: number, wv: THREE.Vector3, kI: number, k: number) {
    const gp = _p.set(0, -1, 0).addScaledVector(T, T.y), m = gp.length();
    gp.addScaledVector(_q.set(0.1 * s, 0, -1), 0.4 * (1 - m) * (1 - m)).addScaledVector(wv, -kI);
    gp.addScaledVector(T, -gp.dot(T));
    if (gp.lengthSq() < 1e-6) gp.set(0, 0, -1);
    cur.lerp(gp.normalize(), k).normalize();
  }

  private placeFoot(m: THREE.Mesh, f: Foot, b: number) {
    const W = this.w, s = f.s;
    // 站：步态给的位置；脚尖着地、脚跟抬起时把脚整体抬一点（等于绕脚尖转）
    const toe = Math.max(0, f.pitch), heel = Math.max(0, -f.pitch);
    let x = W.stand * f.x, y = W.stand * (f.y + Math.sin(toe) * 0.11 + Math.sin(heel) * 0.03), z = W.stand * (f.z - 0.004);
    // 跪：脚背贴地、脚尖朝后、脚底朝上；叩拜时臀离脚跟，脚略立起
    if (W.kneel > 0.001) { const kx = s * 0.086, kz = -0.125; x += W.kneel * kx; y += W.kneel * (0.073 + 0.012 * b + this.groundAt(kx, kz - 0.1)); z += W.kneel * kz; }
    x += W.sit * s * 0.07 + W.crouch * s * 0.1; y += W.sit * 0.05 + W.crouch * 0.004; z += W.sit * 0.17 + W.crouch * 0.03;
    m.position.set(x, y, z);
    const qs = this.q1.setFromEuler(this.e1.set(f.pitch, s * 0.13, 0, 'YXZ'));
    if (W.kneel > 0.001) qs.slerp(this.q2.setFromEuler(this.e1.set(Math.PI - 0.27 + 0.1 * b, s * 0.1, 0, 'YXZ')), W.kneel);
    if (W.crouch > 0.001) qs.slerp(this.q2.setFromEuler(this.e1.set(0.02, s * 0.3, 0, 'YXZ')), W.crouch);
    if (W.sit > 0.001) qs.slerp(this.q2.setFromEuler(this.e1.set(0.5, -s * 1.2, 0, 'YXZ')), W.sit);
    m.quaternion.copy(qs);
    const sc = 1 - 0.999 * smooth(0.3, 0.75, W.sit);
    m.scale.setScalar(sc); m.visible = sc > 0.01;
  }

  /** 把衣身的每一圈摆好 */
  private shapeBody(dt: number, sway: number, px: number, py: number, pz: number, yawP: number, roll: number, climb: number, br: number) {
    const L = this.loft, P = L.pos, S = this.segs, NL = this.nlow, W = this.w, C = this.stC;
    const sn = this.sn, cs = this.cs;
    const hy = py - 0.04, hz = pz;
    const FL = this.fL, FR = this.fR, ws = W.stand;
    // 两条腿（看不见，只用来把布顶出去）：胯 → 膝 → 踝
    const legs = ws > 0.02;
    if (legs) {
      for (let l = 0; l < 2; l++) {
        const s = l === 0 ? 1 : -1, f = l === 0 ? FL : FR;
        const H = this.legH[l].set(px + s * HIP_X * Math.cos(yawP), py - 0.045, pz - s * HIP_X * Math.sin(yawP));
        const A = this.legA[l].set(f.x, f.y + ANKLE + Math.sin(Math.max(0, f.pitch)) * 0.11, f.z - 0.02);
        const d = this.t1.subVectors(A, H); let dist = d.length();
        const maxR = L_TH + L_SH - 0.002; if (dist > maxR) dist = maxR;
        const n = d.normalize();
        const al = (L_TH * L_TH - L_SH * L_SH + dist * dist) / (2 * dist), hh = Math.sqrt(Math.max(0, L_TH * L_TH - al * al));
        const pole = this.t2.set(0, 0.15, 1); pole.addScaledVector(n, -pole.dot(n)).normalize();
        this.legK[l].copy(H).addScaledVector(n, al).addScaledVector(pole, hh);
      }
    }
    const hemZ = legs ? 0.3 * (FL.z + FR.z) * 0.5 : 0;
    const seated = this.seat != null && ws < 0.999, soft = W.sit, dropE = lerp(1.2, 0.5, W.sit);
    const kneeDown = seated ? 1 - 0.85 * W.sit * Math.min(1, this.seat!.h / 0.14) : 1;      // 坐在垫子上：两膝是落下去的
    // 台阶、坡：摆脚别插进前面那一级——沿上一帧的下摆取几个点量地面
    const hemG = this.hemG;
    this.hemOn = this.ground != null && ws > 0.5 && (Math.abs(climb) > 0.02 || FL.off || FR.off);
    if (this.hemOn) {
      const hem = L.at(0, 2, 0) * 3;
      for (let q = 0; q < HEM_N; q++) { const i = Math.round((q * S) / HEM_N), g = this.groundW(P[hem + i * 3] * 1.06, P[hem + i * 3 + 2] * 1.06); hemG[q] = g == null ? -1e6 : g - this.rootY; }
    }
    const sk = this.sk, B = this.skB;
    const filt = this.rhoInit && dt > 0;
    let o = L.at(0, 2, 0) * 3;
    for (let j = 0; j < NL; j++) {
      const u = j / NL;
      B.y = B.cz = B.a = B.bF = B.bB = B.rise = B.riseW = 0;
      for (const p of POSES) {
        const w = W[p]; if (w < 0.001) continue;
        skirt(p, u, hy, hz, sk);
        B.y += w * sk.y; B.cz += w * (sk.cz + (p === 'stand' ? hemZ * (1 - u) : 0)); B.a += w * sk.a; B.bF += w * sk.bF; B.bB += w * sk.bB; B.rise += w * sk.rise; B.riseW += w * sk.riseW;
      }
      const cx = sway * (0.35 + 0.65 * u) + roll * (B.y - 0.09), cy = B.y, cz = B.cz;
      const n = this.nl[j], ia = Math.pow(B.a, -n), ibF = Math.pow(B.bF, -n), ibB = Math.pow(B.bB, -n), inv = -1 / n;
      const sP = this.sPl[j], cP = this.cPl[j];
      const tw = yawP * u, ctw = Math.cos(tw), stw = Math.sin(tw);
      // 这一圈的高度上两条腿在哪、多粗
      let l0x = 0, l0z = 0, l0r = 0, l1x = 0, l1z = 0, l1r = 0, tens = 1;
      const useLegs = legs && cy < py - 0.03;
      if (useLegs) {
        for (let l = 0; l < 2; l++) {
          const H = this.legH[l], K = this.legK[l], A = this.legA[l];
          let x: number, z: number, r: number;
          if (cy >= K.y) { const t = clamp((H.y - cy) / Math.max(0.02, H.y - K.y), 0, 1); x = lerp(H.x, K.x, t); z = lerp(H.z, K.z, t); r = lerp(0.082, 0.058, t); }
          else { const t = clamp((K.y - cy) / Math.max(0.02, K.y - A.y), 0, 1.25); x = lerp(K.x, A.x, t); z = lerp(K.z, A.z, t); r = lerp(0.058, 0.046, Math.min(1, t)); }
          if (l === 0) { l0x = x - cx; l0z = z - cz; l0r = r + 0.012; } else { l1x = x - cx; l1z = z - cz; l1r = r + 0.012; }
        }
        // 前后扯开时两侧收一点
        tens = 1 - 0.28 * Math.min(1, Math.max(0, Math.abs(l0z - l1z) - 0.1) / 0.5) * ws;
      }
      const rate = filt ? Math.min(1, dt * lerp(9, 32, u)) : 1;
      const kS = 55, hemUp = Math.pow(1 - u, 1.5), foldA = (0.075 * ws + 0.025 * (1 - ws)) * Math.pow(1 - u, 1.2), fold = this.fold;
      const stepClamp = this.hemOn && j <= 3, gPad = 0.015 + j * 0.012;
      const ro = j * (S + 1);
      for (let i = 0; i <= S; i++) {
        const s0 = sn[i], c0 = cs[i];
        let r = Math.pow(sP[i] * ia + cP[i] * (c0 >= 0 ? ibF : ibB), inv) * (1 + foldA * fold[i]);
        const dxn = s0 * ctw + c0 * stw, dzn = c0 * ctw - s0 * stw;      // 这一点的方向（含骨盆的扭转）
        let base = r;
        if (useLegs) {
          base = r * (1 - (1 - tens) * Math.abs(s0));
          const h0 = l0x * dxn + l0z * dzn + l0r, h1 = l1x * dxn + l1z * dzn + l1r;
          const m = Math.max(base, h0, h1);
          const sm = m + Math.log(Math.exp(kS * (base - m)) + Math.exp(kS * (h0 - m)) + Math.exp(kS * (h1 - m))) / kS;
          r = lerp(r, sm, ws);
        }
        const k = i === S ? this.rho[ro] : (this.rho[ro + i] += (r - this.rho[ro + i]) * rate);
        const x = cx + k * dxn, z = cz + k * dzn;
        let y = cy + B.rise * (c0 > 0 ? Math.pow(c0, 1.5) : 0) + B.riseW * kneeDown * Math.pow(0.5 + 0.5 * c0, 0.55);
        // 站着：坡上下摆随地面斜；腿把布顶出去多少，摆脚就被带起来一点
        if (ws > 0.02) y += ws * (climb * (z - pz) * (1 - u) + clamp((k - base) * 0.32, 0, 0.11) * hemUp);
        if (seated) y += this.groundAt(x, z, soft) * Math.pow(1 - u, dropE);
        if (stepClamp) {
          const fq = ((i % S) / S) * HEM_N, q0 = Math.floor(fq), g = lerp(hemG[q0], hemG[(q0 + 1) % HEM_N], fq - q0) + gPad;
          if (y < g) y = g;
        }
        P[o] = x; P[o + 1] = y; P[o + 2] = z; o += 3;
      }
    }
    this.rhoInit = true;
    // 下摆的里子：往里收一圈，再在里面封住（从下面看不穿）
    {
      const hem = L.at(0, 2, 0) * 3, a1 = L.at(0, 1, 0) * 3, a0 = L.at(0, 0, 0) * 3;
      let mx = 0, my = 0, mz = 0;
      for (let i = 0; i < S; i++) { mx += P[hem + i * 3]; my += P[hem + i * 3 + 1]; mz += P[hem + i * 3 + 2]; }
      mx /= S; my /= S; mz /= S;
      const up = Math.min(0.22, Math.max(0.02, (hy - my) * 0.5));
      for (let i = 0; i <= S; i++) {
        const x = P[hem + i * 3], y = P[hem + i * 3 + 1], z = P[hem + i * 3 + 2];
        P[a1 + i * 3] = mx + (x - mx) * 0.93; P[a1 + i * 3 + 1] = y + 0.012; P[a1 + i * 3 + 2] = mz + (z - mz) * 0.93;
        P[a0 + i * 3] = mx + (x - mx) * 0.04; P[a0 + i * 3 + 1] = my + up; P[a0 + i * 3 + 2] = mz + (z - mz) * 0.04;
      }
    }
    // 上身各圈：串在脊上
    const SP = this.stP, ST = this.stT;
    o = L.at(0, 2 + NL, 0) * 3;
    for (let k = 0; k < NUP; k++) {
      const p = SP[k], tw = ST[k], cp = Math.cos(p), spn = Math.sin(p), ct = Math.cos(tw), stn = Math.sin(tw);
      const Xx = ct, Xz = -stn, Fx = stn * cp, Fy = -spn, Fz = ct * cp;
      const sc = 1 + (k >= 4 && k <= 8 ? br * 4.5 : 0);
      const n = UP[k][4], ia = Math.pow(UP[k][1] * sc, -n), ibF = Math.pow(UP[k][2] * sc, -n), ibB = Math.pow(UP[k][3], -n), inv = -1 / n;
      const sP = this.sPu[k], cP = this.cPu[k], cx = C[k * 3], cy = C[k * 3 + 1], cz = C[k * 3 + 2];
      const dip = k >= NUP - 2 ? (k === NUP - 1 ? 0.03 : 0.016) : 0;        // 领口前低后高
      for (let i = 0; i <= S; i++) {
        const s0 = sn[i], c0 = cs[i];
        const r = Math.pow(sP[i] * ia + cP[i] * (c0 >= 0 ? ibF : ibB), inv);
        const a = r * s0, bq = r * c0, d = dip > 0 && c0 > 0 ? dip * c0 * c0 : 0;
        P[o] = cx + Xx * a + Fx * bq - spn * stn * d; P[o + 1] = cy + Fy * bq - cp * d; P[o + 2] = cz + Xz * a + Fz * bq - spn * ct * d; o += 3;
      }
    }
    // 领口往里折一圈
    {
      const top = L.at(0, 2 + NL + NUP - 1, 0) * 3, k = NUP - 1, cx = C[k * 3], cz = C[k * 3 + 2];
      const p = SP[k], dy = -0.03 * Math.cos(p), dz = -0.03 * Math.sin(p);
      for (let i = 0; i <= S; i++) { P[o] = cx + (P[top + i * 3] - cx) * 0.8; P[o + 1] = P[top + i * 3 + 1] + dy; P[o + 2] = cz + (P[top + i * 3 + 2] - cz) * 0.8 + dz; o += 3; }
    }
  }

  /** 把一只袖子的每一圈摆好：肩 → 肘 → 腕（肘处抹圆），越近袖口越宽，往下垂成袋 */
  private shapeSleeve(patch: number, a: Arm) {
    const L = this.loft, P = L.pos, SS = this.segS, srs = this.srs, n = srs.length;
    const S0 = a.S, E = a.E;
    // 袖口：臂垂着时长过手腕、只露指尖；手举起来袖子就褪下去，露出手腕
    const fore = _t.subVectors(a.W, E).normalize();
    const ext = fore.y < 0 ? lerp(0.03, 0.125, smooth(0.15, 0.9, -fore.y)) : lerp(0.03, -0.085, smooth(0.15, 0.85, fore.y));
    const cuff = this.t1.copy(a.W).addScaledVector(fore, ext);
    const c = this.t2, T = this.t3, Bd = this.t4, Av = this.t5, b = this.t6;
    const k0 = 0.35, k1 = 0.65;
    const p0 = _p.lerpVectors(S0, E, k0 * 2), p2 = _q.lerpVectors(E, cuff, (k1 - 0.5) * 2);
    const ground = this.w.stand < 0.98;
    let o = L.at(patch, 0, 0) * 3;
    for (let r = 0; r < n; r++) {
      const R = srs[r], s = R.s;
      if (s <= k0) { c.lerpVectors(S0, E, s * 2); T.subVectors(E, S0); }
      else if (s >= k1) { c.lerpVectors(E, cuff, (s - 0.5) * 2); T.subVectors(cuff, E); }
      else {
        const t = (s - k0) / (k1 - k0), u = 1 - t;
        c.set(0, 0, 0).addScaledVector(p0, u * u).addScaledVector(E, 2 * u * t).addScaledVector(p2, t * t);
        T.set(0, 0, 0).addScaledVector(p0, -u).addScaledVector(E, u - t).addScaledVector(p2, t);
      }
      T.normalize();
      if (R.h > 0) { c.addScaledVector(T, -R.h); c.x -= a.s * 0.016 * (R.h / 0.026); }
      // 这一圈的「袋」朝哪：上臂与前臂各有一个方向，中间过渡
      b.copy(a.bagU).lerp(a.bagF, smooth(0.3, 0.7, s));
      Bd.copy(b).addScaledVector(T, -b.dot(T));
      if (Bd.lengthSq() < 1e-6) Bd.set(0, 0, -1).addScaledVector(T, T.z);
      Bd.normalize();
      Av.crossVectors(Bd, T);
      const m = Math.hypot(T.x, T.z);                         // 臂有多平：0 垂直 … 1 水平
      const rr = lerp(0.06, 0.066, Math.min(1, s * 2)) + 0.014 * smooth(0.5, 1, s);
      const hang = lerp(0.072, 0.105, Math.min(1, s * 2)) + 0.105 * Math.pow(Math.max(0, s * 2 - 1), 1.3);
      let rTop = lerp(rr * 0.84, 0.043 + 0.01 * (1 - s), m), rBag = lerp(rr * 1.32 + 0.022 * s * s, hang, m), rSide = lerp(rr * 0.8, 0.05 + 0.014 * s, m);
      if (s < 0.1) { const k = s / 0.1; rBag = lerp(0.066, rBag, k); rTop = lerp(0.05, rTop, k); rSide = lerp(0.056, rSide, k); }
      rTop *= R.k; rBag *= R.k; rSide *= R.k;
      for (let i = 0; i <= SS; i++) {
        const sn = this.snS[i], cs = this.csS[i];
        const tt = 0.5 - 0.5 * cs, rv = lerp(rTop, rBag, tt * tt * (3 - 2 * tt));
        const ax = rSide * sn, bx = -rv * cs;              // 沿 A、沿 Bd（cs>0 是上沿，朝 −Bd）
        const x = c.x + Av.x * ax + Bd.x * bx, z = c.z + Av.z * ax + Bd.z * bx;
        let y = c.y + Av.y * ax + Bd.y * bx;
        if (ground) { const g = this.groundAt(x, z) + 0.007; if (y < g) y = g; }
        P[o] = x; P[o + 1] = y; P[o + 2] = z; o += 3;
      }
    }
  }

  /** 袜筒：自鞋口顺着小腿的方向。站着朝膝，跪着贴地朝前，蹲着朝身前的膝；坐着收起来（盘着的腿在衣摆底下） */
  private shapeSock(patch: number, m: THREE.Mesh, f: Foot, l: number) {
    const L = this.loft, P = L.pos, SK = this.segK, W = this.w, s = f.s;
    let o = L.at(patch, 0, 0) * 3;
    const vis = 1 - smooth(0.3, 0.75, W.sit);
    if (vis < 0.01) { const C = this.stC; for (let i = 0; i < 4 * (SK + 1); i++) { P[o] = C[0]; P[o + 1] = C[1]; P[o + 2] = C[2]; o += 3; } return; }
    const q = m.quaternion;
    const base = this.t1.set(0, 0.028, -0.014).applyQuaternion(q).add(m.position), ank = this.t2.set(0, ANKLE, -0.014).applyQuaternion(q).add(m.position);
    // 膝在哪
    const K = this.t3.set(0, 0, 0); let wsum = 0;
    if (W.stand > 0.02) { K.addScaledVector(this.legK[l], W.stand); wsum += W.stand; }
    if (W.kneel > 0.001) { K.addScaledVector(_p.set(s * 0.09, 0.075, ank.z + 0.37), W.kneel); wsum += W.kneel; }
    if (W.crouch > 0.001) { K.addScaledVector(_p.set(s * 0.12, 0.43, 0.26), W.crouch); wsum += W.crouch; }
    const up = this.t4.set(0, 1, 0).applyQuaternion(q), dir = this.t5;
    if (wsum > 0.01) dir.copy(K).multiplyScalar(1 / wsum).sub(ank).normalize(); else dir.copy(up);
    dir.lerp(up, 0.3 * W.stand).normalize();                    // 站着：鞋口处还顺着脚
    const ex = this.t6.set(1, 0, 0).applyQuaternion(q); ex.addScaledVector(dir, -ex.dot(dir)).normalize();
    const ez = _q.crossVectors(ex, dir);
    const flat = W.stand < 0.98, len = 0.215 * vis;
    for (let r = 0; r < 4; r++) {
      const t = r / 3, rad = lerp(0.041, 0.037, t) * vis, cx = base.x + dir.x * len * t, cy = base.y + dir.y * len * t, cz = base.z + dir.z * len * t;
      for (let i = 0; i <= SK; i++) {
        const a = -Math.PI + (2 * Math.PI * i) / SK, sa = Math.sin(a) * rad, ca = Math.cos(a) * rad;
        const x = cx + ex.x * sa + ez.x * ca, z = cz + ex.z * sa + ez.z * ca;
        let y = cy + ex.y * sa + ez.y * ca;
        if (flat) { const g = this.groundAt(x, z) + 0.004; if (y < g) y = g; }
        P[o] = x; P[o + 1] = y; P[o + 2] = z; o += 3;
      }
    }
  }
}
const _p = V(), _q = V(), _fp = V(), _fd = V(), _fn = V(), _p0 = V(), _d0 = V(), _n0 = V(), _w = V(), _pole = V(), _z = V(), _x = V(), _wv = V(), _t = V();
