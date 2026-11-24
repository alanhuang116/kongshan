/**
 * 一个人：一袭长衫（或短褐）的小小身影——你操纵着走动的邵雍，村里的农夫、童子、老人，都是这一副身子换一身打扮（Look）。
 * 画法是水墨淡彩（docs/INK.md）：颜色写在一张贴图与顶点色里，整个人一个材质、一次绘制，轮廓由画法自己勾。
 *
 * 做法（混合）：
 *   长衫与两袖不是蒙皮，也不是刚性件，而是「每帧现摆的筒」（loft.ts）：
 *     衣身自下摆到领口二十几圈，每一圈是一个前后可不等的超椭圆。上身的圈串在一条会弯的脊上（鞠躬、叩拜时脊弯下去）；
 *     下摆的圈站立时裹着两条腿（腿往前迈，那一侧的布被顶出去，带一点滞后），跪、坐、蹲时按各自的样子铺在地上——
 *     姿态之间只是这些圈的参数在过渡，所以衣摆会自己「铺开」，也没有关节的缝。
 *     袖子是套在臂上的宽筒：臂越平，筒越往下垂成一只袋；臂垂下时筒就绕在臂上、长过手腕。袋的方向带惯性，走动、抬手时会晃。
 *     袜筒也在这张网里：自脚踝顺着小腿的方向（跪着时小腿是贴地的，所以它不会戳到地下去）。
 *   头、手、鞋、斗笠是刚性件，位置由脊与两段臂的反向运动学给出；它们也收在同一个几何里，每帧整块搬过去（loft.ts 的 place）。
 *   短衣的人（Look.hem 高）露出小腿：袜筒那两张筒就改作小腿，自鞋口到膝、再往衣摆里探一截。
 * 步态只看速度：慢是走（总有一只脚在地上），快到 2.2–3 米/秒由走变跑（两脚有同时离地的一瞬、屈肘摆臂、身子前倾）；
 *   跑起来两臂都屈肘、一前一后地摆，手擦着胯边过去、不插进衣身；长衫被腿顶起、往后扬，露出裤腿——布始终裹着两条腿
 *   （腿顶到哪布就立刻撑到哪，抬起的脚也裹着），腿不会从布里穿出来。孩子按身量折算（腿短的步子碎、步频密）。
 * 闲时的小动作（理袖、望天、回头、伸懒腰、捻须、遮雨）是叠在姿态上的一层，只在没被别的事占着时做（gesture、engaged）。
 * 所有量都在小人自己的坐标里算（原点在两脚之间的地面，+z 朝前，+x 是他的左手边）；身量（Look.scale）是整个 root 的缩放。
 */
import * as THREE from 'three';
import type { Quality } from '../core/World';
import { wash } from '../ink/ink';
import { LoftGeo } from './loft';
import { ATLAS, CAPE, HEAD_UP, RAIN_HAT, TEX, bodyV, buildBack, buildFoot, buildHand, buildHead, buildRainCape, buildRainHat, buildWrist, paintAtlas, resolveLook, tones } from './parts';
import type { Avatar, GestureName, HandsName, Look, PoseName, ReachOpts, Seat, Side } from './types';

export type { Seat } from './types';
export type GroundFn = (x: number, z: number) => number | null;

const POSES = ['stand', 'kneel', 'sit', 'crouch', 'bench', 'lie'] as const;
type W4 = Record<PoseName, number>;
/**
 * 仰卧（lie）的几样尺寸（他自己的坐标：root 在臀下的席面上，头朝 −z、脚朝 +z）。
 * 脊放平：骨盆心离席面 LIE_Y（后背最厚处是胯那一圈，后半径 0.128，正好贴着席）；
 * 两腿伸直、脚跟着席、脚尖朝天略往外撇；右手垫在脑后当枕，左手搭在腹上；头枕着手略抬起。
 */
const LIE_Y = 0.134, LIE_LEAN = -1.572, LIE_HEAD = 0.035, LIE_NOD = 0.22;
const LIE_FOOT = { x: 0.1, y: 0.06, z: 0.85, pitch: -1.42, splay: 0.32 };

// —— 骨架的几个尺寸（米） ——
const PELVIS = 0.86, HEM = 0.085;
const SH_X = 0.138, L_UP = 0.245, L_FORE = 0.215, PALM = 0.07;
const HIP_X = 0.08, L_TH = 0.375, L_SH = 0.37, ANKLE = 0.07;
const FOOT_X = 0.076;
/** 坐凳：默认的凳高、凳心在脚后多远；坐着时骨盆心比凳面高多少 */
const BENCH_H = 0.44, BENCH_Z = -0.34, SIT_UP = 0.1;

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
  // 坐凳：这里是凳高 BENCH_H、凳心在脚后 BENCH_Z 时的数；setSeat 给了别的高与前后，骨盆跟着挪（见 update）
  bench: { py: BENCH_H + SIT_UP, pz: BENCH_Z, lean: 0.02 },
  // 仰卧：上身往后放平（整条脊一样平，见 update）
  lie: { py: LIE_Y, pz: 0, lean: LIE_LEAN },
};
/** 俯身到底时：胯折多少、脊弯多少、颈再低多少，骨盆抬起与前移多少 */
const BOW: Record<PoseName, { hip: number; sp: number; neck: number; dy: number; dz: number }> = {
  stand: { hip: 0.8, sp: 0.24, neck: 0.2, dy: 0, dz: -0.07 },
  kneel: { hip: 1.55, sp: 0.6, neck: 0.04, dy: 0.02, dz: 0.03 },
  sit: { hip: 0.12, sp: 0.16, neck: 0.3, dy: 0, dz: 0 },
  crouch: { hip: 0.26, sp: 0.2, neck: 0.1, dy: 0, dz: 0 },
  bench: { hip: 0.55, sp: 0.2, neck: 0.25, dy: 0, dz: 0 },
  lie: { hip: 0, sp: 0, neck: 0, dy: 0, dz: 0 },
};
/** 露着的小腿各圈的粗细：踝、腿肚、膝、探进衣摆里的那一截大腿 */
const CALF = [0.04, 0.05, 0.046, 0.06];
/**
 * 裤腿：站着时袜筒一直接到膝下（各圈在袜筒上的位置 0 鞋口 … 1 膝下，与粗细）——衣摆被腿顶起、跑起来扬起时，露出来的是裤腿，不是一截空。
 * 比布要裹住的那条腿（HIP_R…ANKLE_R 再加 LEG_PAD）细一圈，所以上半截总在布里。
 */
const HOSE_T = [0, 0.42, 0.84, 1], HOSE_R = [0.036, 0.05, 0.054, 0.028];
/**
 * 跑起来摆脚往上缩：跑到最快时整圈缩 RIDE；哪一边的腿叉得远、布要撑出 STRETCH 还裹不住，那一边再顺着腿往上缩，
 * 缩到裹得住为止（最多 RIDE_MAX；量的是最下一圈与它上面 RIDE_DY 处两层，中间按直线算）。往上各圈按 1−u 递减，圈与圈不会叠。
 */
const RIDE = 0.08, STRETCH = 0.12, RIDE_MAX = 0.32, RIDE_DY = 0.3;
// （走路时不缩：步子小，布撑得住；只在由走变跑起——RUN_A 稍前——才量）
/** 布要裹住的腿：胯、膝、踝处的粗细，再留一点余量 */
const HIP_R = 0.082, KNEE_R = 0.058, ANKLE_R = 0.046, LEG_PAD = 0.016;
/** 抬起来的脚也要裹住：鞋跟、鞋心、鞋尖三个球（在脚自己的坐标里：y 上、z 朝鞋尖）与半径 */
const FOOT_BALL = [[0, 0.03, -0.035, 0.045], [0, 0.026, 0.045, 0.042], [0, 0.018, 0.12, 0.035]] as const;
/** 腿上的球隔多远一个（比腿最细处的半径还小：球与球之间凹下去不到一厘米，LEG_PAD 盖得住）；最多几个 */
const BALL_STEP = 0.05, MAX_BALL = 64;
/** 垂着、摆着的手离衣身至少多远：掌心、指尖（往指尖方向多远算指尖） */
const HAND_GAP = 0.04, TIP_GAP = 0.022, TIP_LEN = 0.065;
/** 攥着一根杆时，掌心离杆的中线多远（掌厚一半加杆的粗细） */
const GRIP_OFF = 0.026;
/** 落脚点正压在台阶的棱上时，往前或往后挪开多少（依次试） */
const EDGE_TRY = [0.06, -0.06, 0.12, -0.12, 0.18, -0.18];
const HEM_N = 8;                  // 沿下摆量几个点的地面（只在台阶、坡上量）
/** 由走变跑的速度（米/秒，按成年人的身量；孩子按弗劳德数折算，见 update） */
const RUN_A = 2.15, RUN_B = 2.95;
/** 各个小动作做多久（秒）；shade 是一直举着的 */
const G_DUR: Record<GestureName, number> = { tidy: 3.4, sky: 5.6, glance: 2.8, stretch: 4.4, beard: 4.8, look: 2.3, shade: 1e9 };

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease3 = (t: number) => t * t * (3 - 2 * t);
const ease5 = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const V = () => new THREE.Vector3();

interface Sk { y: number; cz: number; a: number; bF: number; bB: number; rise: number; riseW: number }
const newSk = (): Sk => ({ y: 0, cz: 0, a: 0, bF: 0, bB: 0, rise: 0, riseW: 0 });
/**
 * 下摆某一圈在某个姿态下的样子。u：0 是摆脚，1 是胯。hy、hz：胯那一圈的高与前后。
 * hem：站着时下摆离地多高（长衫 0.085；短褐高得多）；fl：摆张开几成（短衣的摆不成钟）。
 */
function skirt(p: PoseName, u: number, hy: number, hz: number, o: Sk, hem: number, fl: number) {
  const v = 1 - u, g = 0.012;
  o.rise = 0; o.riseW = 0;
  if (p === 'stand') {
    // 道袍的摆本来就大：站着时垂成一口钟，多出来的布收在褶里
    const w = fl * Math.pow(v, 1.25);
    o.y = hem + (hy - hem) * u; o.cz = hz * u;
    o.a = 0.17 + 0.068 * w; o.bF = 0.118 + 0.082 * w; o.bB = 0.128 + 0.07 * w;
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
  } else if (p === 'crouch') {
    // 蹲：两膝在身前顶起一道，身后的布垂到地
    o.y = g + (hy - g) * u; o.cz = lerp(0.03, hz, Math.pow(u, 1.2));
    o.a = lerp(0.255, 0.17, Math.pow(u, 1.3)); o.bF = lerp(0.3, 0.118, Math.pow(u, 2.8)); o.bB = lerp(0.285, 0.128, Math.pow(u, 0.95));
    o.rise = 0.19 * Math.sin(Math.PI * Math.pow(u, 0.72));
  } else {
    // 坐凳：布自腰搭过两条平放的大腿，到膝头折下去，垂到脚面。
    // 上半（u 0.5…1）是「怀」：圈绕着骨盆，前面一圈比一圈探得远，直到盖过膝头，前沿抬在腿面上（rise），两侧与身后落在凳面上；
    // 下半（u 0…0.5）是套着两条小腿垂下去的一筒：圈心自骨盆挪到小腿，身后的布自臀后收到腿肚后头。
    const S = hy - (SIT_UP - 0.04), kz = hz + L_TH, kneeTop = S + 0.135, seatY = S + 0.012;
    if (u >= 0.5) {
      const s = (u - 0.5) / 0.5;
      o.y = lerp(seatY, hy, Math.pow(s, 0.8)); o.cz = hz + 0.05 * (1 - s);
      o.a = lerp(0.2, 0.17, s); o.bB = lerp(0.14, 0.128, s); o.bF = lerp(kz + 0.085 - (hz + 0.05), 0.118, Math.pow(s, 1.5));
      o.rise = lerp(kneeTop, S + 0.145, s) - o.y;
    } else {
      const s = u / 0.5, k = smooth(0.7, 1, s);
      // 短衣只盖到膝下；长衫垂到脚面
      const hemY = lerp(Math.max(0.07, Math.min(hem, 0.12)), S - 0.09, clamp((hem - 0.12) / 0.3, 0, 1));
      o.y = lerp(hemY, lerp(S - 0.07, seatY, k), Math.pow(s, 0.85));
      o.cz = lerp(lerp(0.035, kz - 0.045, Math.min(1, s / 0.7)), hz + 0.05, k);
      o.a = lerp(0.205, 0.2, s); o.bF = lerp(0.118, kz + 0.085 - (hz + 0.05), k); o.bB = lerp(0.125, 0.14, k);
      o.rise = (kneeTop - o.y) * smooth(0.5, 1, s);
    }
  }
}

/**
 * 一只脚。z 是它相对身子的前后：着地时每帧按地面速度往后退（所以不打滑），摆动时从抬脚处迈到身前。
 * 有真实的地面时（setGround）：yw 是它此刻的世界高度——着地时就是落脚那一点踏面的高度。
 */
interface Foot {
  s: number; x: number; y: number; z: number; lift: number; pitch: number; /** 脚掌顺着脚下坡面的那一点倾斜（弧度，脚尖抬起为负） */ tilt: number;
  air: boolean; wasAir: boolean; s0: number; z0: number; k: number;
  c: number; cz0: number; cl0: number; cy0: number;
  has: boolean; yw: number; y0w: number; y1w: number; adj: number; adjS: number; rising: boolean; off: boolean;
  /** 往下迈时托着脚的那一点（没迈过台沿就不落） */
  hold: number;
}
const newFoot = (s: number): Foot => ({ s, x: s * FOOT_X, y: 0, z: 0, lift: 0, pitch: 0, tilt: 0, air: false, wasAir: false, s0: 0, z0: 0, k: 0, c: -1, cz0: 0, cl0: 0, cy0: 0, has: false, yw: 0, y0w: 0, y1w: 0, adj: 0, adjS: 0, rising: false, off: false, hold: 0 });

interface Arm {
  s: number;                       // +1 左（+x），−1 右
  reach: THREE.Vector3 | null; rDir: THREE.Vector3 | null; rPalm: THREE.Vector3 | null; rate: number; rw: number; rpos: THREE.Vector3; rd: THREE.Vector3; rn: THREE.Vector3;
  /** 攥着的那根杆的方向（世界；见 ReachOpts.grip） */ rGrip: THREE.Vector3 | null;
  S: THREE.Vector3; E: THREE.Vector3; W: THREE.Vector3; P: THREE.Vector3; D: THREE.Vector3; prevW: THREE.Vector3;
  bagU: THREE.Vector3; bagF: THREE.Vector3; init: boolean;
  joint: THREE.Object3D;
}
/** 袖子的一圈：s 在臂上的位置（0 肩 … 0.5 肘 … 1 袖口）；k 粗细的倍数；h 沿臂往回退多少（肩头的收口）；lining 折进去的里子 */
interface SRing { s: number; k: number; h: number; lining: boolean }
const SR = (s: number, k = 1, h = 0, lining = false): SRing => ({ s, k, h, lining });

/** 整块搬的部件在几何里的次序 */
const CH = { head: 0, handL: 1, handR: 2, footL: 3, footR: 4, back: 5 };

export class Figure implements Avatar {
  root = new THREE.Group();
  readonly height: number;
  readonly eyeY: number;
  /** 这一身打扮（造好之后不再变） */
  readonly look: Look;
  joints: Avatar['joints'];
  bow = 0;
  /** 上身另外扭多少（弧度，正是往左转；外面给目标值，这里带一点缓冲） */
  twist = 0; private twistS = 0;
  onStep: ((foot: Side) => void) | null = null;
  /** 三角数、绘制次数 */
  stats = { triangles: 0, draws: 0 };
  /** 此刻哪只脚撑着地（撑地的后半程脚跟已经抬起，只有前掌着地） */
  contact = { L: true, R: true };

  private poseName: PoseName = 'stand';
  private w: W4 = { stand: 1, kneel: 0, sit: 0, crouch: 0, bench: 0, lie: 0 };
  private w0: W4 = { stand: 1, kneel: 0, sit: 0, crouch: 0, bench: 0, lie: 0 };
  private w1: W4 = { stand: 1, kneel: 0, sit: 0, crouch: 0, bench: 0, lie: 0 };
  private wT = 1; private wDur = 0.9;
  /** 躺下、起身要经过坐：先换到 sit，这一段走完再接着换到它 */
  private poseNext: { p: PoseName; dur: number } | null = null;
  private hands0: HandsName = 'free'; private hands1: HandsName = 'free'; private hT = 1; private hDur = 0.45;
  private seat: Seat | null = null;
  private ground: GroundFn | null = null; private rootY = 0; private hemG = new Float32Array(HEM_N); private hemOn = false;
  private phase = 0.3; private amp = 0; private wasMoving = false;
  private fL = newFoot(1); private fR = newFoot(-1);
  private bowX = 0; private bowV = 0;
  private lookT: THREE.Vector3 | null = null; private lookW = 0; private lookYaw = 0; private lookPitch = 0;
  /** 躺着时往哪看（在躺平的身子里量的左右、俯仰） */
  private lieYaw = 0; private liePitch = 0;
  private climbS = 0; private rollS = 0; private speedS = 0;
  /** 平滑过的加速度（给起跑前探、急停后坐）；折算成成年人的速度；跑了几成（衣摆往后飘）；里子提亮了几成 */
  private accS = 0; private ga = 0; private runS = 0; private linK = 0;
  /** 身量的平方根（孩子的步频按它折算） */
  private sqS: number;
  /** 闲时的小动作：哪一个、做了多久、偏哪只手、收没收；整体的分量 */
  private gst: { name: GestureName; t: number; side: 1 | -1; out: boolean } | null = null; private gW = 0;
  /** 小动作在这一刻给的：头的俯仰与左右、胸往后仰、上身扭；两手要不要负到身后、按小动作给的去处（胸的坐标：x 左、y 上、z 前，原点胸心） */
  private gO = { headP: 0, headY: 0, arch: 0, twist: 0, lift: 0, backL: 0, backR: 0, wL: 0, wR: 0, pL: V(), dL: V(), nL: V(), pR: V(), dR: V(), nR: V(), brimL: 0, brimR: 0 };
  private lastPos = V(); private hasLast = false; private vel = V(); private vLoc = V();
  private iq = new THREE.Quaternion();
  private hatSwing = 0; private hatV = 0;

  private loft: LoftGeo; private garment: THREE.Mesh;
  private head: THREE.Object3D; private hat: THREE.Object3D; private feet: { L: THREE.Object3D; R: THREE.Object3D };
  private arms: { L: Arm; R: Arm };
  private mats: THREE.Material[] = []; private texs: THREE.Texture[] = [];
  /** 衣长、摆张开几成、袖子的肥瘦、是不是露着小腿、背上有没有东西 */
  private hem: number; private flare: number; private sleeveK: number; private bare: boolean; private hasBack = false;
  /** 两腕那两块在几何里排第几（左、右挨着） */
  private chWrist = 0;
  /**
   * 雨具（斗笠、蓑衣）：gear 是外面要的成数（0…1，下雨下雪在外头给 1），gearS 是此刻穿戴到几成（约一秒穿好、卸下）。
   * 斗笠、蓑衣各是几何里的一块（本来就戴着斗笠、披着蓑衣的人不另加：chHat / chCape 为 −1）；hatFromBack：斗笠本来背在背上（樵夫、放羊的），
   * 戴的时候就是把背上那顶翻上头。hatM：斗笠此刻摆在哪（小人的坐标）；donW：右手扶着笠沿跟过去的分量
   */
  gear = 0; private gearS = 0; private chHat = -1; private chCape = -1; private hatFromBack = false;
  private hatOn = false; private capeOn = false; private hatM = new THREE.Matrix4(); private donW = 0; private gearLast = 0;
  /** 斗笠戴在头上（颈的坐标）、背在背上（胸的坐标）时的摆法 */
  private hatHead = new THREE.Matrix4(); private hatBack = new THREE.Matrix4();

  // 圈与表
  private segs: number; private nlow: number; private srs: SRing[]; private segS: number; private segK: number;
  private sn: Float32Array; private cs: Float32Array;                // 衣身一圈上各点的 sin / cos
  private sPu: Float32Array[] = []; private cPu: Float32Array[] = []; // 上身各圈 |sin|^n、|cos|^n
  private sPl: Float32Array[] = []; private cPl: Float32Array[] = []; private nl: number[] = [];
  private rho: Float32Array; private rhoInit = false;                // 下摆各圈各点的半径（往回收带滞后，往外撑是立刻的）
  private rc: Float32Array; private rtw: Float32Array;              // 下摆各圈的圈心（x、y、z）与扭转——给下一帧量手离布多远
  private rideL: Float32Array; private rideT: Float32Array; private rideU: Float32Array; // 摆脚各处顺着腿往上缩了多少（最下一圈的；往上递减）
  /** 两只脚上的三个球此刻的位置（小人的坐标）与要不要裹（抬起来了几成） */
  private footP = new Float32Array(18); private footW = [0, 0];
  /** 布要裹住的腿：一串球（每个五个数：x、y、z、半径、哪条腿） */
  private balls = new Float32Array(MAX_BALL * 5); private nBall = 0;
  /**
   * 下摆每一圈管的那一层（站着时各圈的高，上下各半个圈距）里两条腿（与抬起的脚）的横截面，每帧先量好：
   * 每层最多 MAX_BALL 个圆，每个圆四个数（小人坐标里的 x、z，半径，哪条腿）；各层几个圆。抬起来的点到它所在的那一层去取
   */
  private slab: Float32Array; private slabN: Uint8Array;
  /** 各层里每条腿的那几个圆合起来的外接圆（x、z、半径；没有就是半径 −1）：这一点的方向上连它都够不着布，就不必一个个圆去比 */
  private slabB: Float32Array;
  private fold: Float32Array;                                        // 下摆一圈上的褶（固定的起伏）
  private s3: Float32Array; private c3: Float32Array;                // 跑起来下摆的抖（三个起伏绕着转）
  private snS: Float32Array; private csS: Float32Array;
  // 脊上各站的位置与朝向
  private stC = new Float32Array(NUP * 3); private stP = new Float32Array(NUP); private stT = new Float32Array(NUP);
  private sk = newSk(); private skB = newSk();
  // 临时量
  private t1 = V(); private t2 = V(); private t3 = V(); private t4 = V(); private t5 = V(); private t6 = V();
  private q1 = new THREE.Quaternion(); private q2 = new THREE.Quaternion(); private e1 = new THREE.Euler(); private m1 = new THREE.Matrix4();
  private legK = [V(), V()]; private legH = [V(), V()]; private legA = [V(), V()];
  private cX = V(); private cF = V(); private cU = V();

  /** q.tier 定这个人的网有多细（low 约四千三角，其余约九千）；q.tex 定贴图多大。look 不给就是读书人那一身 */
  constructor(q: Quality, look?: Partial<Look>) {
    const low = q.tier === 'low', lk = (this.look = resolveLook(look));
    this.root.name = 'avatar';
    this.root.scale.setScalar(lk.scale);
    this.sqS = Math.sqrt(Math.max(0.3, lk.scale));
    this.height = 1.58 * lk.scale; this.eyeY = 1.45 * lk.scale;
    this.hem = lk.hem; this.bare = lk.hem > 0.2; this.sleeveK = Math.max(0, Math.min(1, lk.sleeve));
    // 短衣的摆不张成钟：衣越短越收
    this.flare = Math.max(0.25, Math.min(1, (0.86 - lk.hem) / (0.86 - HEM)));
    this.segs = low ? 28 : 48; this.nlow = low ? 8 : 13; this.segS = low ? 12 : 20; this.segK = low ? 6 : 8;
    this.srs = low
      ? [SR(0, 0.04, 0.026), SR(0, 0.8, 0.014), SR(0), SR(0.2), SR(0.38), SR(0.5), SR(0.62), SR(0.82), SR(1), SR(0.95, 0.86, 0, true), SR(0.86, 0.03, 0, true)]
      : [SR(0, 0.03, 0.026), SR(0, 0.55, 0.022), SR(0, 0.86, 0.013), SR(0), SR(0.09), SR(0.19), SR(0.3), SR(0.4), SR(0.5), SR(0.6), SR(0.71), SR(0.82), SR(0.92), SR(1), SR(0.97, 0.9, 0, true), SR(0.875, 0.5, 0, true), SR(0.865, 0.03, 0, true)];
    const S = this.segs, NL = this.nlow;
    this.sn = new Float32Array(S + 1); this.cs = new Float32Array(S + 1); this.fold = new Float32Array(S + 1);
    this.s3 = new Float32Array(S + 1); this.c3 = new Float32Array(S + 1);
    for (let i = 0; i <= S; i++) {
      const a = -Math.PI + (2 * Math.PI * i) / S;
      this.sn[i] = Math.sin(a); this.cs[i] = Math.cos(a);
      this.fold[i] = 0.5 * Math.sin(7 * a + 0.6) + 0.3 * Math.sin(11 * a + 2.1) + 0.3 * Math.sin(4 * a + 4.0);
      this.s3[i] = Math.sin(3 * a); this.c3[i] = Math.cos(3 * a);
    }
    const pw = (n: number) => {
      const s = new Float32Array(S + 1), c = new Float32Array(S + 1);
      for (let i = 0; i <= S; i++) { s[i] = Math.pow(Math.abs(this.sn[i]), n); c[i] = Math.pow(Math.abs(this.cs[i]), n); }
      return [s, c] as const;
    };
    for (let k = 0; k < NUP; k++) { const [s, c] = pw(UP[k][4]); this.sPu.push(s); this.cPu.push(c); }
    for (let j = 0; j < NL; j++) { const n = 2.0 + 0.25 * (j / NL); this.nl.push(n); const [s, c] = pw(n); this.sPl.push(s); this.cPl.push(c); }
    this.rho = new Float32Array(NL * (S + 1));
    this.rc = new Float32Array(NL * 3); this.rtw = new Float32Array(NL);
    this.rideL = new Float32Array(S + 1); this.rideT = new Float32Array(S + 1); this.rideU = new Float32Array(S + 1);
    this.slab = new Float32Array(NL * MAX_BALL * 4); this.slabN = new Uint8Array(NL); this.slabB = new Float32Array(NL * 6);
    const SS = this.segS;
    this.snS = new Float32Array(SS + 1); this.csS = new Float32Array(SS + 1);
    for (let i = 0; i <= SS; i++) { const a = -Math.PI + (2 * Math.PI * i) / SS; this.snS[i] = Math.sin(a); this.csS[i] = Math.cos(a); }

    // —— 长衫、两袖、两只袜筒（短衣的人是两条小腿）：一张网；头、手、鞋、背上的东西各是一块，收在同一个几何里 ——
    const bodyRings = 2 + NL + NUP + 1, slRings = this.srs.length, SK = this.segK;
    const backG = buildBack(lk, low), footG = buildFoot(lk, low);
    const rigid = [buildHead(lk, low), buildHand(lk, low, 1), buildHand(lk, low, -1), footG, footG];
    if (backG) { rigid.push(backG); this.hasBack = true; }
    // 两腕（顺着小臂摆的那一截）：排在后头，前面几块的次序不变（tests/play/clip.js 按次序找手、脚）
    const wristG = buildWrist(lk, low);
    this.chWrist = rigid.length; rigid.push(wristG, wristG);
    // 雨具：本来戴着斗笠的不另加斗笠，本来披着蓑衣的不另加蓑衣
    if (!(lk.hat === 'li' && lk.hatWorn)) { this.chHat = rigid.length; rigid.push(buildRainHat(low)); this.hatFromBack = lk.hat === 'li'; }
    if (!lk.cape) { this.chCape = rigid.length; rigid.push(buildRainCape(low)); }
    // 戴着：沿压到眉上一点、略往后仰，露出脸来（髻、巾顶都在笠里）；背着：笠面朝后贴着背，与背斗笠的人那一顶一样
    this.hatHead.makeScale(lk.head, lk.head, lk.head).multiply(new THREE.Matrix4().makeTranslation(0, HEAD_UP, 0.008))
      .multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, 0.034, -0.014), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.1, 0, 0)), new THREE.Vector3(1, 1, 1)));
    this.hatBack.compose(new THREE.Vector3(0.012, -0.03, -0.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(-(Math.PI / 2 - 0.2), 0.06, 0.14, 'YXZ')), new THREE.Vector3(0.86, 0.86, 0.86));
    const L = (this.loft = new LoftGeo([{ rings: bodyRings, segs: S }, { rings: slRings, segs: SS }, { rings: slRings, segs: SS }, { rings: 4, segs: SK }, { rings: 4, segs: SK }], rigid));
    for (const g of new Set(rigid)) g.dispose();
    // 雨具平时收着（收成一点，看不见）
    if (this.chHat >= 0) L.place(this.chHat, null);
    if (this.chCape >= 0) L.place(this.chCape, null);
    // 里子（下摆、袖口、领口往里折的那几圈）压成深色：衣里是暗的，人才有分量
    const dark = [0.26, 0.275, 0.3], RU = ATLAS.robeU;
    for (let r = 0; r < bodyRings; r++) {
      const lining = r < 2 || r === bodyRings - 1;
      const y = r < 2 ? Math.max(0.3, this.hem + 0.2) : r < 2 + NL ? this.hem + (UP[0][0] - this.hem) * ((r - 2) / NL) : r === bodyRings - 1 ? 1.34 : UP[r - 2 - NL][0];
      for (let i = 0; i <= S; i++) {
        const o = L.at(0, r, i);
        L.uv[o * 2] = (RU * i) / S; L.uv[o * 2 + 1] = bodyV(y);
        if (lining) { L.col[o * 3] = dark[0]; L.col[o * 3 + 1] = dark[1]; L.col[o * 3 + 2] = dark[2]; }
      }
    }
    for (const p of [1, 2]) for (let r = 0; r < slRings; r++) {
      const R = this.srs[r];
      for (let i = 0; i <= SS; i++) {
        const o = L.at(p, r, i);
        L.uv[o * 2] = (RU * i) / SS; L.uv[o * 2 + 1] = R.lining ? TEX.sleeve0 + 0.02 : TEX.sleeve0 + (TEX.sleeve1 - TEX.sleeve0) * R.s;
        if (R.lining) { L.col[o * 3] = dark[0]; L.col[o * 3 + 1] = dark[1]; L.col[o * 3 + 2] = dark[2]; }
      }
    }
    // 袜（或露着的小腿）：指到贴图的白处，颜色写在顶点上
    const legC = tones(lk).leg;
    for (const p of [3, 4]) for (let r = 0; r < 4; r++) for (let i = 0; i <= SK; i++) {
      const o = L.at(p, r, i);
      L.uv[o * 2] = ATLAS.white[0]; L.uv[o * 2 + 1] = ATLAS.white[1];
      L.col[o * 3] = legC[0]; L.col[o * 3 + 1] = legC[1]; L.col[o * 3 + 2] = legC[2];
    }
    const px = Math.max(128, Math.min(512, 2 ** Math.round(Math.log2(512 * q.tex))));
    const atlas = paintAtlas(lk, px);
    this.texs.push(atlas);
    // 颜料全在贴图与顶点色里：材质的颜料是纯白、浓度 1，只管「粉不粉」与明暗
    // 两面都画：衣摆扬起来时看得见衣里（同一块布，背着光），不是一个洞
    const gm = wash({ pig: [1, 1, 1], dens: 1, shade: lk.shade, body: lk.body, map: atlas, grain: 2.2, line: 1, side: THREE.DoubleSide });
    this.garment = new THREE.Mesh(L.geo, gm);
    this.garment.name = 'avatar:body';
    this.root.add(this.garment);
    this.mats.push(gm);

    // —— 关节（挂点）。头、手、脚、背上的东西不再各是一个网格，只留着它们的位置，每帧把那几块搬过去 ——
    const hips = new THREE.Group(), chest = new THREE.Group(), neck = new THREE.Group(), headJ = new THREE.Group(), handL = new THREE.Group(), handR = new THREE.Group();
    const back = new THREE.Group(), footL = new THREE.Group(), footR = new THREE.Group();
    hips.name = 'hips'; chest.name = 'chest'; headJ.name = 'head'; handL.name = 'handL'; handR.name = 'handR';
    headJ.position.set(0, HEAD_UP * lk.head, 0.008 * lk.head); neck.add(headJ);
    chest.add(back);
    this.root.add(hips, chest, neck, handL, handR, footL, footR);
    this.head = neck; this.hat = back; this.feet = { L: footL, R: footR };
    this.joints = { hips, chest, head: headJ, handL, handR };
    const arm = (s: number, joint: THREE.Object3D): Arm => ({ s, reach: null, rDir: null, rPalm: null, rGrip: null, rate: 10, rw: 0, rpos: V(), rd: new THREE.Vector3(0, -1, 0), rn: new THREE.Vector3(-s, 0, 0), S: V(), E: V(), W: V(), P: V(), D: new THREE.Vector3(0, -1, 0), prevW: V(), bagU: new THREE.Vector3(0, -0.2, -1).normalize(), bagF: new THREE.Vector3(0, -0.2, -1).normalize(), init: false, joint });
    this.arms = { L: arm(1, handL), R: arm(-1, handR) };
    this.stats.triangles = Math.round(L.triangles);
    this.stats.draws = 1;
    this.update(0, 0, { speed: 0 });
  }

  get pose() { return this.poseName; }
  /** 步态此刻的相位（0…1；0 是左脚跟着地，0.5 是右脚跟着地） */
  get gaitPhase() { return this.phase; }
  setPose(p: PoseName, dur = 0.9) {
    // 躺下与起身都经过盘腿坐：站着（或跪、蹲、坐凳）要躺，先坐下再躺；躺着要站（或别的），先坐起再换。dur 两段分着用
    const W = this.w, lying = W.lie > 0.05 || this.poseName === 'lie';
    if (dur > 0 && p === 'lie' && !lying && W.sit < 0.95) { this.poseNext = { p: 'lie', dur: dur * 0.6 }; this.go('sit', dur * 0.55); return; }
    if (dur > 0 && p !== 'lie' && p !== 'sit' && lying) { this.poseNext = { p, dur: dur * 0.65 }; this.go('sit', Math.max(0.6, dur * 0.6)); return; }
    this.poseNext = null;
    this.go(p, dur);
  }
  private go(p: PoseName, dur: number) {
    if (p === this.poseName && this.wT >= 1) return;
    this.poseName = p;
    for (const k of POSES) { this.w0[k] = this.w[k]; this.w1[k] = k === p ? 1 : 0; }
    this.wT = dur <= 0 ? 1 : 0; this.wDur = Math.max(0.05, dur);
    if (dur <= 0) for (const k of POSES) this.w[k] = this.w1[k];
  }
  /** 站好了、能迈步了（姿态是 stand，过渡走完了，没有接着要换的） */
  get ready(): boolean { return this.poseName === 'stand' && !this.poseNext && this.w.stand > 0.97; }
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
    if (!target) { a.reach = null; a.rDir = null; a.rPalm = null; a.rGrip = null; return; }
    if (!a.reach) { a.reach = V(); if (a.rw < 0.02) { a.rpos.copy(a.P); a.rd.copy(a.D); } }
    a.reach.copy(target);
    a.rDir = o.dir ? (a.rDir ?? V()).copy(o.dir) : null;
    a.rPalm = o.palm ? (a.rPalm ?? V()).copy(o.palm) : null;
    a.rGrip = o.grip && o.grip.lengthSq() > 1e-8 ? (a.rGrip ?? V()).copy(o.grip).normalize() : null;
    a.rate = o.rate ?? 10;
  }
  lookAt(p: THREE.Vector3 | null) { this.lookT = p ? (this.lookT ?? V()).copy(p) : null; }
  setVisible(v: boolean) { this.root.visible = v; }
  /** 此刻（要换成的）手的摆法 */
  get hands(): HandsName { return this.hands1; }
  /** 雨具：要戴几成（0…1）；instant 为真就直接戴好、卸下（没人看着、刚换了处的时候不演那一下） */
  setGear(v: number, instant = false) { this.gear = clamp(v || 0, 0, 1); if (instant) this.gearS = this.gear; }
  /** 此刻雨具穿戴到几成（0…1） */
  get gearK(): number { return this.gearS; }
  /** 头上有没有斗笠（本来戴着的，或雨天戴上了大半的） */
  private get hatted(): boolean { return (this.look.hat === 'li' && this.look.hatWorn) || (this.chHat >= 0 && this.gearS > 0.6); }
  /** 闲时的一个小动作（见 types.ts 的 GestureName）。被占着时不做；null 收住（shade 只有这样才放下） */
  gesture(name: GestureName | null, side?: 1 | -1) {
    if (!name) { if (this.gst) this.gst.out = true; return; }
    if (this.engaged) return;
    if (this.gst && this.gst.name === name && !this.gst.out) return;
    // 正做着别的：先收住它，新的从头来（分量从此刻的接着长，不会跳）
    this.gst = { name, t: 0, side: side ?? (Math.random() < 0.5 ? 1 : -1), out: false };
  }
  get gesturing(): GestureName | null { return this.gst ? this.gst.name : null; }
  /** 正被「外面」占着（做事时）：不是站着、在俯身、手伸着或拿着东西、头看着某处、身下垫着东西、合十或叠手 */
  get engaged(): boolean {
    const a = this.arms;
    return this.poseName !== 'stand' || this.w.stand < 0.99 || this.bow > 0.02 || this.bowX > 0.03 || !!this.lookT || this.seat != null
      || !!a.L.reach || !!a.R.reach || a.L.rw > 0.03 || a.R.rw > 0.03 || a.L.joint.children.length > 0 || a.R.joint.children.length > 0
      || this.hands1 === 'pray' || this.hands1 === 'lap';
  }
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
    // （躺着的人整个铺在席上：席外那一截不往下落）
    return -st.h * smooth(-0.015 - 0.05 * soft, 0.05 + 0.08 * soft, d) * Math.max(0, 1 - this.w.stand - this.w.bench - this.w.lie);
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
    // 经过坐的那一段走完了：接着换到要去的姿态
    if (this.wT >= 1 && this.poseNext) { const n = this.poseNext; this.poseNext = null; this.go(n.p, n.dur); }
    if (this.hT < 1) this.hT = Math.min(1, this.hT + dt / this.hDur);
    const trans = Math.sin(Math.PI * this.wT);
    let py = 0, pz = 0, lean = 0;
    for (const p of POSES) { py += W[p] * BASE[p].py; pz += W[p] * BASE[p].pz; lean += W[p] * BASE[p].lean; }
    // 坐凳：凳有多高、凳心在脚后多远由 setSeat 给（不给就是默认的那只凳）
    if (W.bench > 0.001 && this.seat) { py += W.bench * (this.seat.h - BENCH_H); pz += W.bench * ((this.seat.cz ?? BENCH_Z) - BENCH_Z); }
    lean += 0.2 * trans * (1 - Math.abs(W.stand * 2 - 1));          // 起身、蹲下的半途身子先往前探

    // —— 步态 ——
    const sp = Math.max(0, move.speed || 0), moving = sp > 0.08 && W.stand > 0.6;
    const sp0 = this.speedS;
    this.speedS += (sp - this.speedS) * Math.min(1, dt * 8);
    // 加速、减速（起跑时身子往前探，急停时往后坐一点）
    if (dt > 0) this.accS += (clamp((this.speedS - sp0) / dt, -10, 10) - this.accS) * Math.min(1, dt * 7);
    // 步子的样子按成年人的速度来定（同样的弗劳德数：速度按身量的平方根折算）——孩子腿短，同样快时步子碎、步频密
    const ga = (this.ga = this.speedS * this.sqS);
    this.climbS += (clamp(move.climb ?? 0, -0.7, 0.7) * (moving ? 1 : 0) - this.climbS) * Math.min(1, dt * 6);
    this.amp += ((moving ? 1 : 0) - this.amp) * Math.min(1, dt * (moving ? 6.5 : 5));
    const run = smooth(RUN_A, RUN_B, ga);                            // 快到一定程度就是跑：两脚有同时离地的一瞬
    // 转弯时身子向内倾：走着只略倾；跑起来按离心力倾（世界里的速度 × 转得多快）
    const turn = move.turn ?? 0, lim = lerp(0.11, 0.24, run);
    this.rollS += (clamp(lerp(turn * 0.04 * Math.min(1.6, ga / 1.9), 0.8 * Math.atan((turn * this.speedS * this.look.scale) / 9.8), run), -lim, lim) - this.rollS) * Math.min(1, dt * 5);
    const A = this.amp * W.stand, climb = this.climbS, roll = this.rollS * W.stand;
    // 一步里脚着地的时间占比：走 0.62（换脚时两脚都在地上）；跑 0.44 → 0.35（越快腾空越长）
    const beta = lerp(0.62, clamp(0.44 - 0.08 * (ga - 3), 0.3, 0.45), run);
    // 步幅：走是 0.4 + 0.19 × 速度；跑按步频（每秒 3.2–3.5 步、越快略密——穿长衫的人步子不放得太开）定。台阶、坡上收小
    const stepLen = lerp(clamp(0.4 + 0.19 * ga, 0.36, 1.05), ga / (2.85 + 0.13 * ga), run) * (1 - lerp(0.26, 0.38, run) * Math.min(1, Math.abs(climb) * lerp(1.6, 1.9, run)));
    // 跑：落脚在身子前面不远（不是远远伸出去），撑地的这一程整个往后错一点——身子在两脚的前头
    const reachF = beta * stepLen, back = run * Math.max(0, reachF - (0.27 + 0.025 * (ga - 3))), zLand = reachF - back;
    const liftH = lerp(0.036 + 0.03 * Math.min(1, ga / 1.5) + 0.07 * Math.max(0, climb), 0.06 + 0.038 * ga + 0.05 * Math.max(0, climb), run);
    // 下摆的里子：跑起来摆脚被腿顶起、往后扬，躺着时脚边那一圈敞着——都看得见衣里，提亮些（不然是一团墨）
    const linT = Math.max(0.8 * this.runS, 0.7 * W.lie);
    if (Math.abs(linT - this.linK) > 0.04 || (linT < 0.005 && this.linK > 0)) this.liningTone(linT < 0.005 ? 0 : linT);
    this.runS += (run * A - this.runS) * Math.min(1, dt * 4);
    const FL = this.fL, FR = this.fR;
    if (moving) {
      if (!this.wasMoving) {
        // 起步：正在半空的那只脚接着迈；两脚都着地就让后面那只先迈
        const a = FL.c >= 0 || FL.air ? FL : FR.c >= 0 || FR.air ? FR : null;
        if (a) { const pa = beta + (1 - beta) * 0.3; this.phase = a === FL ? pa : (pa + 0.5) % 1; a.air = false; a.c = -1; }
        else { const fr = FL.z >= FR.z ? FL : FR, pf = beta * clamp((zLand - fr.z) / (2 * reachF), 0.05, 0.92); this.phase = fr === FL ? pf : (pf + 0.5) % 1; }
      }
      const before = this.phase;
      // 急着收住（减速得猛）时步子碎而勤：步频不随速度一起落下去（着地的脚照样按真实的速度往后退，所以不滑）
      const brake = smooth(1.5, 4, -this.accS) * (1 - smooth(1.5, 3, sp));
      this.phase = (this.phase + Math.max(sp / (2 * stepLen), 0.85 * brake) * dt) % 1;
      if (this.phase < before) this.onStep?.('L');
      else if (before < 0.5 && this.phase >= 0.5) this.onStep?.('R');
      this.stepFoot(FL, this.phase, dt, sp, beta, run, liftH, zLand);
      this.stepFoot(FR, (this.phase + 0.5) % 1, dt, sp, beta, run, liftH, zLand);
    } else {
      // 停步：两脚一先一后收回来并拢（着地的那只不动，所以不滑）。
      // 跑着停下时两脚可能隔得远：前一只快落定了，后一只就跟着收（不在弓步里干站着）；隔得远的一步迈得稍久些
      const wide = Math.abs(FL.z - FR.z) > 0.45, gate = wide ? 0.7 : 0.8;
      const busy = (FL.c >= 0 && FL.c < gate) || (FR.c >= 0 && FR.c < gate);
      if (!busy) {
        const a = FL.c < 0 ? FL : null, bF = FR.c < 0 ? FR : null;
        // 先收悬着的那只；隔得远（弓步）时先收远的那只——除非另一只还高高悬着
        const far = (p: Foot, q: Foot) => (Math.abs(p.z) >= Math.abs(q.z) ? p : q);
        const c = a && bF ? (wide && !(a.air && a.lift > 0.05) && !(bF.air && bF.lift > 0.05) ? far(a, bF) : a.air ? a : bF.air ? bF : far(a, bF)) : a ?? bF;
        if (c && (c.air || Math.abs(c.z) > 0.02)) { c.c = 0; c.cz0 = c.z; c.cl0 = c.lift; c.cy0 = c.yw; c.air = true; }
      }
      for (const f of [FL, FR]) {
        if (f.c >= 0) {
          f.c = Math.min(1, f.c + dt / (0.36 + 0.15 * Math.min(1, Math.max(0, Math.abs(f.cz0) - 0.25) / 0.35)));
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
    // 起伏。走：两脚都着地时身子最低；跑：单脚撑地（膝屈着）时最低、腾空时最高，平均也略低一点（膝不伸直）
    const bobA = lerp(0.008 + 0.024 * (stepLen / 0.7) * (stepLen / 0.7), clamp(0.028 + 0.004 * ga, 0.03, 0.05), run);
    const bob = A * bobA * 0.5 * (1 - Math.cos(4 * Math.PI * (ph - beta / 2)) * (1 - 2 * run)) + A * 0.02 * run;
    const sway = A * 0.013 * (1 - 0.5 * run) * Math.sin(2 * Math.PI * (ph - 0.05));
    // 骨盆与肩反着扭；跑起来两臂摆得大，肩扭得也多
    const yawP = -A * (0.085 + 0.02 * run) * Math.cos(2 * Math.PI * ph), yawS = A * (0.06 + 0.05 * run) * Math.cos(2 * Math.PI * ph);
    const gaitLean = A * (0.03 + 0.03 * Math.min(1.8, ga / 1.9) + 0.03 * run + 0.025 * run * clamp(ga - 3, 0, 2));
    lean += gaitLean + A * (climb > 0 ? 0.26 : 0.14) * climb + A * clamp(this.accS * lerp(0.012, 0.022, run), -0.1, 0.13);
    const idle = 1 - this.amp, breath = Math.sin(t * 1.3), drift = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.23 + 1.3) * 0.5;
    // 跑起来两脚落得近中线一些
    const fx = lerp(FOOT_X, 0.05, run);
    FL.x = fx + sway * 0.3; FR.x = -fx + sway * 0.3;
    this.footY(FL, ph, dt, moving, stepLen, beta, liftH, climb, zLand);
    this.footY(FR, (ph + 0.5) % 1, dt, moving, stepLen, beta, liftH, climb, zLand);
    // 闲时的小动作：这一刻头、脊、两手该怎样
    this.gestureStep(dt, t);
    const G = this.gO;

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
    py += -bob + idle * W.stand * 0.0015 * breath + G.lift;
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
      if (W.lie > 0.001) {
        // 躺着看：把方向换到「躺平的身子」里量——脸朝天是正前，头顶朝身后是上；左右是绕着身子的长轴转头，俯仰是往脚那边点头、往头顶那边仰
        const ey = py + LIE_HEAD + 0.03, ez = pz - 0.6, ex = lt.x - px, ey2 = lt.y - ey, ez2 = lt.z - ez;
        const ly = clamp(Math.atan2(ex, Math.max(0.05, ey2)), -1.05, 1.05), lp = clamp(Math.atan2(ez2, Math.hypot(ex, ey2)) - LIE_NOD, -0.45, 0.7);
        this.lieYaw += (ly - this.lieYaw) * k; this.liePitch += (lp - this.liePitch) * k;
      }
    }
    const lkY = this.lookYaw * this.lookW;

    // —— 脊：自胯往上各站的位置、前倾、扭转 ——
    const C = this.stC, SP = this.stP, ST = this.stT;
    const baseP = lean + bHip, Wl = W.lie;
    // 外面要的上身扭转（扫地时腰带着帚走）：带一点缓冲
    this.twistS += (clamp(this.twist || 0, -0.6, 0.6) - this.twistS) * Math.min(1, dt * 9);
    const tw = this.twistS * (1 - Wl);
    for (let k = 0; k < NUP; k++) {
      const y = UP[k][0];
      // （躺着整条脊一样平；别的姿态腰以下弯得少）
      SP[k] = baseP * lerp(0.3 + 0.7 * smooth(0.8, 0.955, y), 1, Wl) + (bSp + G.arch) * smooth(0.985, 1.215, y);
      ST[k] = lerp(yawP, yawS, smooth(0.82, 1.25, y)) + 0.28 * lkY * (1 - Wl) * smooth(1.0, 1.25, y) + G.twist * smooth(0.9, 1.25, y) + tw * smooth(0.86, 1.22, y);
    }
    // 第一站在骨盆心往下（躺平时是往脚那边）四厘米
    C[0] = px; C[1] = py - 0.04 * (1 - Wl); C[2] = pz + 0.04 * Wl;
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
    let headP = topP - 0.65 * gaitLean - W.crouch * 0.34 * (1 - b) + bNeck + idle * 0.01 * Math.sin(t * 0.5) + G.headP;
    if (this.lookW > 0.001) headP = lerp(headP, topP + clamp(this.lookPitch - topP, -0.61, 0.61), this.lookW);
    this.head.position.set(C[nk] + roll * 0.01, C[nk + 1] - 0.004 + LIE_HEAD * Wl, C[nk + 2]);
    this.head.rotation.set(headP, yawS * 0.3 + lkY + G.headY, -roll * 0.5 + A * 0.01 * Math.sin(2 * Math.PI * ph), 'YXZ');
    if (Wl > 0.001) {
      // 躺着：头随着脊放平、枕在手上略点下来（脸朝天、略朝脚那边）；看哪里就在躺平的身子里转头、点头
      // （躺下、坐起的半途收着下巴，头不跟着脊一路仰过去）
      const q = this.q1.setFromAxisAngle(_ax, topP + LIE_NOD * Wl + 0.45 * Math.sin(Math.PI * Wl) * (1 - W.stand));
      q.multiply(this.q2.setFromAxisAngle(_ay, this.lieYaw * this.lookW)).multiply(_q3.setFromAxisAngle(_ax, this.liePitch * this.lookW));
      this.head.quaternion.slerp(q, Wl);
    }

    // —— 雨具：成数往要的那边走；斗笠此刻摆在哪（右手空着就扶着笠沿跟过去） ——
    this.gearStep(dt, W);

    // —— 两臂（左臂随右腿摆）。走：跟着对侧那只脚的前后；跑：按步态的相位匀匀地摆（左臂在右脚落地时最前） ——
    const sw = 1 / Math.max(0.2, reachF), pr = 2 * Math.PI * (ph - 0.04);
    this.solveArm(this.arms.L, dt, A, lerp((FR.z + back) * sw, -Math.cos(pr), run), run, b);
    this.solveArm(this.arms.R, dt, A, lerp((FL.z + back) * sw, Math.cos(pr), run), run, b);

    // —— 脚 ——
    this.placeFoot(this.feet.L, FL, b);
    this.placeFoot(this.feet.R, FR, b);

    // —— 长衫、袖子、袜筒 ——
    this.shapeBody(dt, t, swayAll, px, py, pz, yawP, roll, climb, br);
    this.shapeSleeve(1, this.arms.L); this.shapeSleeve(2, this.arms.R);
    this.shapeSock(3, this.feet.L, FL, 0); this.shapeSock(4, this.feet.R, FR, 1);
    this.placeRigid();
    this.loft.normals(); this.loft.commit();
  }

  /**
   * 闲时的小动作走一帧，把这一刻的样子写进 gO。
   * 被占着（做事）就很快收住；除了「走着往旁边看」「遮雨」，走起来也收住。整体的分量起落都有缓冲，所以从什么摆法进来都不跳。
   * 两手的去处写在胸的坐标里（x 左、y 上、z 前，原点在胸心）：小动作跟着身子的起伏与前倾走。
   */
  private gestureStep(dt: number, t: number) {
    const o = this.gO, g = this.gst;
    o.headP = o.headY = o.arch = o.twist = o.lift = 0; o.backL = o.backR = o.wL = o.wR = 0; o.brimL = o.brimR = 0;
    if (!g) { this.gW = 0; return; }
    g.t += dt;
    // （头上有斗笠时，shade 是扶一扶笠沿：做一会儿就放下）
    const walking = g.name === 'look' || g.name === 'shade', dur = g.name === 'shade' && this.hatted ? 2.6 : G_DUR[g.name];
    const stop = g.out || g.t >= dur || this.engaged || (!walking && this.amp > 0.2) || (g.name === 'shade' && this.ga > RUN_A);
    this.gW = stop ? Math.max(0, this.gW - dt / 0.4) : Math.min(1, this.gW + dt / 0.35);
    if (stop && this.gW <= 0) { this.gst = null; return; }
    const T = g.t, s = g.side, W = ease3(this.gW);
    /** 自身的起落：tin 秒进来，最后 tout 秒出去 */
    const env = (tin: number, tout: number) => ease3(clamp(T / tin, 0, 1)) * (dur > 1e8 ? 1 : 1 - ease3(clamp((T - (dur - tout)) / tout, 0, 1)));
    /** 一只手（m = 1 是「主」手：side 为 1 时是左手）去胸坐标里的 p，指尖朝 d、手心朝 n（都按 side 镜像） */
    const hand = (main: boolean, w: number, px: number, py: number, pz: number, dx: number, dy: number, dz: number, nx: number, ny: number, nz: number) => {
      const left = main ? s > 0 : s < 0, m = s;
      if (left) { o.wL = w; o.pL.set(px * m, py, pz); o.dL.set(dx * m, dy, dz).normalize(); o.nL.set(nx * m, ny, nz); }
      else { o.wR = w; o.pR.set(px * m, py, pz); o.dR.set(dx * m, dy, dz).normalize(); o.nR.set(nx * m, ny, nz); }
    };
    switch (g.name) {
      case 'glance': {
        // 回头看一眼：头转过去七成、肩扭过去三成，停一停再转回来
        const e = env(0.65, 0.85) * W;
        o.headY = s * 1.12 * e; o.twist = s * 0.36 * e; o.headP = -0.04 * e;
        break;
      }
      case 'look': {
        // 走着往旁边看一眼（左顾右盼）
        const e = env(0.6, 0.75) * W;
        o.headY = s * 0.62 * e; o.headP = -0.05 * e;
        break;
      }
      case 'sky': {
        // 抬头望天：两手背到身后，胸略挺，头慢慢仰起来、左右看一看
        const e = env(1.1, 1.2) * W;
        o.headP = -0.5 * e; o.arch = -0.07 * e; o.headY = 0.22 * Math.sin(T * 0.55) * e;
        o.backL = o.backR = env(0.8, 0.9) * W;
        break;
      }
      case 'tidy': {
        // 理袖：主手的小臂横到身前，另一只手拈住它的袖口，扯两下；末了抖一抖
        const e = env(0.65, 0.75) * W, tug = T > 0.85 && T < 2.45 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (T - 0.85)) / 0.8) : 0;
        const shake = T > 2.3 && T < 2.9 ? 0.014 * Math.sin(2 * Math.PI * 7 * T) * Math.sin((Math.PI * (T - 2.3)) / 0.6) : 0;
        hand(true, e, 0.065, -0.17 + shake, 0.27, -0.55, -0.08, 0.83, 0, -1, 0);
        hand(false, e, 0.115 - 0.045 * tug, -0.255 - 0.02 * tug, 0.2 + 0.01 * tug, 0.75, 0.35, 0.55, 0.45, 0.85, 0.1);
        o.headP = 0.34 * e; o.headY = s * 0.16 * e;
        break;
      }
      case 'stretch': {
        // 伸懒腰：两手从身前举过头顶、十指相扣掌心朝上，胸往后仰、头仰起来，停一停，两手从两边放下
        const e = env(0.4, 0.55) * W;
        // 关键的几个时刻（胸坐标，左手；右手镜像）
        const K: Array<[number, number, number, number, number, number, number, number, number, number]> = [
          [0.0, 0.16, -0.38, 0.1, 0, -1, 0.1, -1, 0, 0],
          [0.9, 0.08, 0.2, 0.3, 0, 0.6, 0.8, -1, 0, 0],
          [1.6, 0.035, 0.56, 0.04, -1, 0.25, 0, 0, 1, 0],
          [2.6, 0.035, 0.57, 0.02, -1, 0.25, 0, 0, 1, 0],
          [3.4, 0.42, 0.18, 0.02, 0.9, 0.3, 0, 0, -1, 0],
          [4.4, 0.16, -0.38, 0.08, 0, -1, 0.1, -1, 0, 0],
        ];
        let i = 0; while (i < K.length - 2 && T > K[i + 1][0]) i++;
        const a = K[i], c = K[i + 1], u = ease3(clamp((T - a[0]) / (c[0] - a[0]), 0, 1)), L = (j: number) => lerp(a[j], c[j], u);
        for (const main of [true, false]) {
          const m = main === s > 0 ? 1 : -1;      // 左手按表，右手镜像
          const left = m > 0;
          const px = L(1) * m, dx = L(4) * m, nx = L(7) * m;
          if (left) { o.wL = e; o.pL.set(px, L(2), L(3)); o.dL.set(dx, L(5), L(6)).normalize(); o.nL.set(nx, L(8), L(9)); }
          else { o.wR = e; o.pR.set(px, L(2), L(3)); o.dR.set(dx, L(5), L(6)).normalize(); o.nR.set(nx, L(8), L(9)); }
        }
        const bell = smooth(1.1, 1.8, T) * (1 - smooth(2.7, 3.5, T));
        o.arch = -0.16 * bell * W; o.headP = -0.3 * bell * W; o.lift = 0.008 * bell * W; o.twist = 0.05 * Math.sin(T * 2.2) * bell * W;
        break;
      }
      case 'beard': {
        // 捻须：一手抬到颔下，顺着须往下捋两回；另一只手负在身后；头略仰，若有所思
        const e = env(0.85, 0.9) * W, st = T > 1.0 && T < 3.8 ? (((T - 1.0) / 1.4) % 1) : 0, stroke = st < 0.7 ? ease3(st / 0.7) : 1 - ease3((st - 0.7) / 0.3);
        hand(true, e, -0.012, 0.165 - 0.05 * stroke, 0.135, 0.25, 0.85, 0.45, 0.1, -0.2, -1);
        if (s > 0) o.backR = env(0.8, 0.9) * W; else o.backL = env(0.8, 0.9) * W;
        o.headP = (-0.1 + 0.05 * stroke) * e;
        break;
      }
      case 'shade': {
        if (this.hatted) {
          // 头上有斗笠：一只手抬起来扶一扶笠沿（往下压一压，雨大风斜时那样），头略低，一会儿就放下
          const e = env(0.6, 0.7) * W;
          if (s > 0) o.brimL = e; else o.brimR = e;
          o.headP = 0.1 * e;
          break;
        }
        // 抬袖遮雨：一只小臂斜横在额前略高处，大袖垂下来挡着头脸；头低一点
        const e = env(0.6, 0.5) * W;
        hand(true, e, -0.03, 0.42, 0.21, -1, 0.28, 0.22, 0, -1, 0.25);
        o.headP = 0.18 * e;
        break;
      }
    }
    void t;
  }

  /**
   * 下摆里子的深浅：平时衣里是暗的（人才有分量）；提着衣摆跑时前面掀开、看得见衣裳里面，那时把里子提亮些，不然是一团墨。
   * 只改下摆那两圈的顶点色，只传那一小段。
   */
  private liningTone(k: number) {
    const L = this.loft, S = this.segs, col = L.col;
    for (let r = 0; r < 2; r++) for (let i = 0; i <= S; i++) {
      const o = L.at(0, r, i) * 3;
      col[o] = lerp(0.26, 0.47, k); col[o + 1] = lerp(0.275, 0.49, k); col[o + 2] = lerp(0.3, 0.53, k);
    }
    const a = L.geo.attributes.color as THREE.BufferAttribute;
    a.clearUpdateRanges(); a.addUpdateRange(0, 2 * (S + 1) * 3); a.needsUpdate = true;
    this.linK = k;
  }

  /** 把头、手、脚、背上的东西这几块搬到各自关节此刻的位置上 */
  private placeRigid() {
    const L = this.loft, a = this.arms, f = this.feet;
    this.head.updateMatrix(); L.place(CH.head, this.head.matrix);
    a.L.joint.updateMatrix(); L.place(CH.handL, a.L.joint.matrix);
    a.R.joint.updateMatrix(); L.place(CH.handR, a.R.joint.matrix);
    this.placeWrist(this.chWrist, a.L); this.placeWrist(this.chWrist + 1, a.R);
    f.L.updateMatrix(); L.place(CH.footL, f.L.visible ? f.L.matrix : null);
    f.R.updateMatrix(); L.place(CH.footR, f.R.visible ? f.R.matrix : null);
    // 背上的东西（背着的斗笠、蓑衣）；背着的那顶斗笠被翻上头去了（雨天），背上就空了
    if (this.hasBack) {
      if (this.hatFromBack && this.gearS > 0.001) L.place(CH.back, null);
      else { const c = this.joints.chest; c.updateMatrix(); this.hat.updateMatrix(); L.place(CH.back, this.m1.multiplyMatrices(c.matrix, this.hat.matrix)); }
    }
    // 雨具：斗笠（gearStep 里摆好的那一处）、蓑衣；不戴时收成一点（收过了就不再每帧去收）
    if (this.chHat >= 0) {
      if (this.gearS > 0.001) { L.place(this.chHat, this.hatM); this.hatOn = true; }
      else if (this.hatOn) { L.place(this.chHat, null); this.hatOn = false; }
    }
    this.placeCape();
  }

  /**
   * 雨具走一帧：成数往 gear 走（穿约一秒、卸略快一点）；斗笠此刻在哪——背上那一处与头上那一处之间，中途往上、往后让开头，
   * 像是从背后翻上来（本来不背斗笠的人，头一成里斗笠在背后由小长到原样）。右手空着、站着时，戴与摘的那一下扶着笠沿。
   */
  private gearStep(dt: number, W: W4) {
    const want = clamp(this.gear || 0, 0, 1), g0 = this.gearS;
    if (g0 !== want) this.gearS = want > g0 ? Math.min(want, g0 + dt / 1.05) : Math.max(want, g0 - dt / 0.85);
    const moving = this.gearS !== this.gearLast;
    this.gearLast = this.gearS;
    if (this.chHat >= 0 && this.gearS > 0.001) {
      const e = ease3(clamp(this.gearS, 0, 1));
      this.head.updateMatrix();
      _hm1.multiplyMatrices(this.head.matrix, this.hatHead).decompose(_hp1, _hq1, _hs1);
      const c = this.joints.chest; c.updateMatrix(); this.hat.updateMatrix();
      _hm0.multiplyMatrices(c.matrix, this.hat.matrix).multiply(this.hatBack).decompose(_hp0, _hq0, _hs0);
      const arc = Math.sin(Math.PI * e);
      _hp.lerpVectors(_hp0, _hp1, e); _hp.y += 0.12 * arc; _hp.addScaledVector(this.cF, -0.06 * arc);
      _hq.slerpQuaternions(_hq0, _hq1, e);
      const s = lerp(_hs0.x, _hs1.x, e) * (this.hatFromBack ? 1 : smooth(0, 0.16, this.gearS));
      this.hatM.compose(_hp, _hq, _hs.set(s, s, s));
    }
    const R = this.arms.R, free = !R.reach && R.rw < 0.05 && R.joint.children.length === 0 && this.gW < 0.05 && W.stand > 0.9;
    const w = this.chHat >= 0 && moving && free ? Math.pow(Math.sin(Math.PI * clamp(this.gearS, 0, 1)), 0.6) : 0;
    this.donW += (w - this.donW) * Math.min(1, dt * 9);
  }
  /**
   * 笠沿上偏 s 那一侧（1 左、−1 右）前方的一点，与扶着它的手：掌心在沿下略靠外、朝里朝上托着，手指顺着沿往前。
   * 头上有斗笠才有（雨天戴上的那顶，或本来就戴着的）；没有返回 false
   */
  private brimPoint(s: number, P: THREE.Vector3, D: THREE.Vector3, N: THREE.Vector3): boolean {
    let m: THREE.Matrix4, r: number;
    if (this.chHat >= 0 && this.gearS > 0.001) { m = this.hatM; r = RAIN_HAT.r; }
    else if (this.look.hat === 'li' && this.look.hatWorn) {
      this.head.updateMatrix();
      m = _hm0.multiplyMatrices(this.head.matrix, _hm1.makeScale(this.look.head, this.look.head, this.look.head)).multiply(_hm2.makeTranslation(0, HEAD_UP, 0.008)).multiply(_hm2.compose(_hp.set(0, 0.018, -0.012), _hq.setFromEuler(this.e1.set(-0.13, 0, 0.03)), _hs.set(1, 1, 1)));
      r = 0.262;
    } else return false;
    const a = 0.75, sx = s * Math.sin(a), cz = Math.cos(a);
    P.set(sx * (r + 0.012), -0.022, cz * (r + 0.012)).applyMatrix4(m);
    _hq.setFromRotationMatrix(_hm2.extractRotation(m));
    D.set(-s * cz, 0.1, Math.abs(sx)).normalize().applyQuaternion(_hq);
    N.set(-sx * 0.6, 0.8, -cz * 0.6).normalize().applyQuaternion(_hq);
    return true;
  }
  /**
   * 蓑衣：自领口往下披（穿的时候一成成落下来、张开），跟着胸走；袖子（臂）顶到哪里，那一片就撑出去盖在袖子上，
   * 不让臂、袖从草里穿出来（量的是肩 → 肘 → 袖口两段，按袖子的肥瘦当一根胶囊）。
   */
  private placeCape() {
    const L = this.loft, ci = this.chCape;
    if (ci < 0) return;
    if (this.gearS <= 0.001) { if (this.capeOn) { L.place(ci, null); this.capeOn = false; } return; }
    this.capeOn = true;
    const ch = L.chunks[ci], P = L.pos, N = L.nor, S = ch.src, SN = ch.srcN;
    // （坐着、跪着、蹲着时下沿收上去一截：不插进铺在地上的衣摆里）
    const e = ease3(clamp(this.gearS / 0.9, 0, 1)), drop = lerp(0.1, 1, e) * (1 - 0.38 * (1 - this.w.stand)), sc = lerp(0.6, 1, e), y0 = CAPE.top;
    const c = this.joints.chest; c.updateMatrix();
    const m = c.matrix.elements, aL = this.arms.L, aR = this.arms.R, full = this.sleeveK;
    for (let i = 0, q = 0, o = ch.off * 3; i < ch.n; i++, q += 3, o += 3) {
      const lx = S[q] * sc, ly = y0 + (S[q + 1] - y0) * drop, lz = S[q + 2] * sc;
      _cp.set(m[0] * lx + m[4] * ly + m[8] * lz + m[12], m[1] * lx + m[5] * ly + m[9] * lz + m[13], m[2] * lx + m[6] * ly + m[10] * lz + m[14]);
      for (const a of [aL, aR]) { this.pushOff(_cp, a.S, a.E, 0, full); this.pushOff(_cp, a.E, a.W, 0.5, full); }
      P[o] = _cp.x; P[o + 1] = _cp.y; P[o + 2] = _cp.z;
      const nx = SN[q], ny = SN[q + 1], nz = SN[q + 2];
      N[o] = m[0] * nx + m[4] * ny + m[8] * nz; N[o + 1] = m[1] * nx + m[5] * ny + m[9] * nz; N[o + 2] = m[2] * nx + m[6] * ny + m[10] * nz;
    }
  }
  /** 把点 p 推到 a→b 这一段（袖子）外头：袖子在臂上 s0 起（0 肩、0.5 肘），越近袖口越肥 */
  private pushOff(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, s0: number, full: number) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz;
    if (l2 < 1e-8) return;
    const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2, 0, 1);
    const cx = a.x + abx * t, cy = a.y + aby * t, cz = a.z + abz * t;
    let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    const r = lerp(0.055, 0.068 + 0.075 * (s0 + 0.5 * t), full) + 0.014, d = Math.hypot(dx, dy, dz);
    if (d >= r) return;
    if (d < 1e-5) { dx = cx - this.stC[0]; dy = 0; dz = cz - this.stC[2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; p.set(cx + dx * r, cy, cz + dz * r); return; }
    const k = r / d;
    p.set(cx + dx * k, cy + dy * k, cz + dz * k);
  }

  /** 腕那一截：原点在腕上，+y 顺着小臂（肘 → 腕）；手心那一面跟着手 */
  private placeWrist(ch: number, a: Arm) {
    const y = _wy.subVectors(a.W, a.E);
    if (y.lengthSq() < 1e-8) y.copy(a.D);
    y.normalize();
    const z = _wz.set(0, 0, 1).applyQuaternion(a.joint.quaternion);
    z.addScaledVector(y, -z.dot(y));
    if (z.lengthSq() < 1e-6) z.set(1, 0, 0).addScaledVector(y, -y.x);
    z.normalize();
    this.m1.makeBasis(_wx.crossVectors(y, z), y, z).setPosition(a.W);
    this.loft.place(ch, this.m1);
  }

  /** 一只脚走一帧。pf：这只脚自己的相位（0 是脚跟着地）；zLand：落脚时在身前多远 */
  private stepFoot(f: Foot, pf: number, dt: number, sp: number, beta: number, run: number, liftH: number, zLand: number) {
    const up = -0.24 * (1 - 0.6 * run), down = 0.42 + 0.3 * run;
    if (pf < beta) {
      const s = pf / beta, hs = 0.72 - 0.17 * run;                 // 跑：前掌着地的时候多，脚跟早些抬起
      f.air = false; f.c = -1;
      f.z -= sp * dt; f.lift = 0;
      f.pitch = s < 0.14 ? up * (1 - s / 0.14) : s > hs ? down * Math.pow((s - hs) / (1 - hs), 1.6) : 0;
    } else {
      const s = (pf - beta) / (1 - beta);
      if (!f.air) { f.air = true; f.s0 = Math.min(s, 0.8); f.z0 = f.z; f.c = -1; f.adj = f.adjS = 0; }
      const k = clamp((s - f.s0) / (1 - f.s0), 0, 1), part = 1 - 0.55 * f.s0;
      // 走：前后匀着迈（上台阶先抬起来再往前送，免得脚尖踢在立面上）
      const ew = 0.5 - 0.5 * Math.cos(Math.PI * (f.rising ? Math.pow(k, 1.25) : k));
      // 跑：蹬地后脚跟先往后上方收（小腿折起来），再随大腿往前甩，甩过了头、落地前略往回收（不是伸着脚去够地）
      const k1 = Math.pow(k, 1.12), er = k1 * k1 * (3 - 2 * k1) + (k > 0.55 ? 0.08 * Math.pow(Math.sin((Math.PI * (k - 0.55)) / 0.45), 1.5) : 0);
      f.k = k;
      f.adjS += (f.adj - f.adjS) * Math.min(1, dt * 12);
      f.z = lerp(f.z0, zLand + f.adjS, lerp(ew, er, run));
      // 抬脚：走是一道匀的弧；跑是蹬地后很快抬到最高（脚跟踢向身后），往前甩时落下来
      f.lift = liftH * part * lerp(Math.pow(Math.sin(Math.PI * k), 0.85), Math.pow(Math.sin(Math.PI * Math.pow(k, 0.62)), 1.3), run);
      // 脚尖：蹬离时朝下，跑的时候踢起来那一阵更朝下，往前甩时翘回来
      f.pitch = (lerp(down, up, smooth(0.1 + 0.25 * run, 0.92, k)) + 0.35 * run * Math.sin(Math.PI * Math.min(1, k / 0.55))) * part;
    }
  }

  /**
   * 一只脚的高低。没有真实的地面：按坡摆（climb × 前后）。
   * 有（setGround）：着地的脚停在落脚那一点踏面的高度上；摆动的脚自抬脚处的高度迈到落脚处的高度，
   * 中间抬过两处里较高的那一处；落脚点若正压着台阶的棱，就往前或往后挪开。
   */
  private footY(f: Foot, pf: number, dt: number, moving: boolean, l: number, beta: number, liftH: number, climb: number, zLand: number) {
    const slope = f.lift + climb * f.z;
    if (!this.ground || this.w.stand < 0.5) { f.y = slope; f.has = false; f.wasAir = f.air; f.rising = false; f.off = false; f.tilt *= Math.max(0, 1 - dt * 8); return; }
    const rootY = this.rootY, MID = 0.045;                          // 量脚心底下
    if (!f.has) { f.yw = this.groundW(f.x, f.z + MID) ?? rootY + climb * f.z; f.y0w = f.y1w = f.yw; f.has = true; }
    if (!f.air) {
      if (f.wasAir || !moving) {
        // 刚落地：量一次，撑地的这一程里就不变了（脚在世界里是不动的）；站定时一直量着，脚下的地面变了就跟过去
        const g = this.groundW(f.x, f.z + MID);
        if (g != null) f.yw = f.wasAir ? g : f.yw + (g - f.yw) * Math.min(1, dt * 14);
      }
      f.y = f.yw - rootY; f.rising = false; f.off = Math.abs(f.y) > 0.03;
      // 脚掌贴着脚下的坡（前后各量一点；差得太多是踩在台阶的棱上，不算）
      const g0 = this.groundW(f.x, f.z - 0.07), g1 = this.groundW(f.x, f.z + 0.15);
      const want = g0 != null && g1 != null && Math.abs(g1 - g0) < 0.14 ? -Math.atan2(g1 - g0, 0.22) : 0;
      f.tilt += (want - f.tilt) * Math.min(1, dt * 12);
    } else if (f.c >= 0) {
      // 停步时收脚：落到两脚并拢处的地面
      const g = this.groundW(f.x, MID) ?? rootY;
      f.yw = lerp(f.cy0, g, ease3(f.c));
      f.y = f.yw - rootY + 0.03 * Math.sin(Math.PI * f.c); f.off = Math.abs(g - rootY) > 0.03;
    } else {
      if (!f.wasAir) { f.y0w = f.yw; f.hold = 0; }
      // 这只脚将落在身前多远：落脚时在身前 zLand，身子还要往前走 (1 − pf) × 一个整步周期的路
      const zL = zLand + (1 - pf) * 2 * l;
      const edge = (a: number) => { const h = this.groundW(f.x, zL + a - 0.05), tt = this.groundW(f.x, zL + a + 0.14); return h == null || tt == null ? 0 : Math.abs(h - tt); };
      if (edge(f.adj) > 0.03) for (const c of EDGE_TRY) if (edge(c) <= 0.03) { f.adj = c; break; }
      f.y1w = this.groundW(f.x, zL + f.adj + MID) ?? rootY + climb * zLand;
      const d = f.y1w - f.y0w, k = f.k;
      // 是坡还是台阶：落脚处前后各量一下——地面是连着斜上去（斜下去）的，这一步的高差又正合这个坡度，就是坡
      const gA = this.groundW(f.x, zL + f.adj - 0.16), gB = this.groundW(f.x, zL + f.adj + 0.2);
      const sl = gA != null && gB != null ? (gB - gA) / 0.36 : 0;
      const ramp = gA != null && gB != null && Math.abs(d - sl * 2 * l) < 0.08 + 0.35 * Math.abs(d);
      f.rising = !ramp && d > 0.03;
      if (ramp) {
        // 坡：脚顺着坡面迈过去，上面只加平地上那一点抬脚（不像上台阶那样先高高抬起、下台阶那样悬着再落）
        f.yw = lerp(f.y0w, f.y1w, k * k * (3 - 2 * k)) + f.lift;
        f.tilt += (-Math.atan(sl) - f.tilt) * Math.min(1, dt * 7);
      } else {
        const top = Math.max(f.y0w, f.y1w) + liftH + (Math.abs(d) > 0.03 ? 0.035 : 0);
        const a = smooth(0, f.rising ? 0.26 : 0.38, k), bq = smooth(d < -0.03 ? 0.62 : 0.55, 1, k);
        f.yw = lerp(lerp(f.y0w, top, a), f.y1w, bq);
        f.tilt *= Math.max(0, 1 - dt * 8);
      }
      // 往下迈（下台阶，或矮的一级被当成了坡）：脚还没迈过台沿就别往下落——脚掌底下量两点，低了就托住（立刻）；
      // 迈过了台沿再落下去（几帧之内，不是一下子掉下去）
      if (d < -0.03) {
        // （差一两厘米不管：真的坡上脚掌前后本来就有这点高低，托了反倒落地时一顿）
        const g1 = this.groundW(f.x, f.z + 0.12), g2 = this.groundW(f.x, f.z - 0.02), n0 = Math.max(g1 ?? -1e9, g2 ?? -1e9) + 0.012 - f.yw, need = n0 > 0.02 ? n0 : 0;
        f.hold = need > f.hold ? need : f.hold + (need - f.hold) * Math.min(1, dt * 25);
        if (f.hold > 0) f.yw += f.hold;
      } else f.hold = 0;
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
    } else if (h === 'back') {
      // 负手：两手背在身后腰下，左手在里（手指朝下），右手在外握着左腕；走起来也不摆
      if (s > 0) { P.copy(hp).addScaledVector(X, 0.012).addScaledVector(U, 0.07).addScaledVector(F, -0.162); D.copy(X).multiplyScalar(-0.5).addScaledVector(U, -0.86); N.copy(F).multiplyScalar(-1); }
      else { P.copy(hp).addScaledVector(X, 0.03).addScaledVector(U, 0.112).addScaledVector(F, -0.18); D.copy(X).multiplyScalar(0.92).addScaledVector(U, -0.3); N.copy(F); }
    } else {
      // free：站着自然下垂、随步子前后摆；跪着搭在腿上；坐着搭在膝头；蹲着搭在膝上
      const sw = swing * A * 0.085 * Math.min(1.5, 0.6 + this.speedS / 3.2);
      P.set(0, 0, 0); D.set(0, 0, 0); N.set(0, 0, 0);
      if (W.stand > 0.001) {
        const w = W.stand, r = run * A;
        // 走：垂着随步子摆
        let x = a.S.x + s * 0.075, y = a.S.y - (L_UP + L_FORE + PALM - 0.022 - Math.abs(sw) * 0.12), z = a.S.z + 0.035 + sw, dy = -1, dz = 0.1 + sw * 1.2, dx = 0;
        if (r > 0.001) {
          // 跑：两臂都屈肘，手在胯与胸之间前后摆——往前时手抬高、靠里，往后时落到胯边（胯外侧，不往胯里收）
          const q = swing * A, f = Math.max(0, q), amp = 0.17 + 0.05 * clamp(this.ga - 3, 0, 1.5);
          x = lerp(x, a.S.x + s * (0.07 - 0.105 * f), r); y = lerp(y, a.S.y - 0.4 + 0.12 * f - 0.025 * Math.max(0, -q), r); z = lerp(z, a.S.z + 0.05 + amp * q, r);
          dx = lerp(dx, -s * 0.3 * f, r); dy = lerp(dy, -0.5 + 0.38 * f - 0.2 * Math.max(0, -q), r); dz = lerp(dz, 0.85, r);
        }
        // 手别插进衣身：摆到胯边、垂在身侧时，掌心与指尖都离布留一点（按上一帧摆好的衣身；在里头就水平地往外挪）
        if (this.rhoInit) { this.clearBody(x, y, z, dx, dy, dz); x = _cb.x; z = _cb.z; }
        P.x += w * x; P.y += w * y; P.z += w * z;
        D.x += w * dx; D.y += w * dy; D.z += w * dz; N.x -= w * s;
      }
      if (W.kneel > 0.001) { const w = W.kneel; P.x += w * (hp.x + s * 0.105); P.y += w * (hp.y - 0.04); P.z += w * (hp.z + 0.2); D.z += w; D.y -= w * 0.3; D.x -= w * s * 0.15; N.y -= w; }
      if (W.sit > 0.001) { const w = W.sit; P.x += w * s * 0.275; P.y += w * 0.19; P.z += w * 0.135; D.z += w * 0.8; D.y -= w * 0.45; D.x += w * s * 0.35; N.y -= w; }
      if (W.crouch > 0.001) { const w = W.crouch; P.x += w * s * 0.135; P.y += w * 0.47; P.z += w * 0.24; D.z += w; D.y -= w * 0.5; N.y -= w; }
      // 坐凳：两手平放在大腿上
      if (W.bench > 0.001) { const w = W.bench; P.x += w * (hp.x + s * 0.105); P.y += w * (hp.y + 0.08); P.z += w * (hp.z + 0.24); D.z += w; D.y -= w * 0.1; D.x -= w * s * 0.12; N.y -= w; }
      // （躺着的那一份在 solveArm 里统一给：这里按其余几个姿态的份量摊满）
      if (W.lie > 0.001 && W.lie < 0.99) P.multiplyScalar(1 / (1 - W.lie));
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
    // 仰卧：右手垫在脑后当枕（掌心朝上托着后脑），左手搭在腹上；不管原来是什么摆法
    const lw = W.lie, prop = 4 * W.sit * W.lie * (1 - W.stand);
    if (lw > 0.001) {
      const hp = this.joints.hips.position, nk = K_NECK * 3;
      if (s < 0) { _p0.set(C[nk] - 0.005, 0.048, C[nk + 2] - 0.13); _d0.set(1, 0, -0.15); _n0.set(0, 1, 0); }
      else { _p0.set(hp.x + 0.04, hp.y + 0.122, hp.z - 0.13); _d0.set(-0.55, 0, -0.84); _n0.set(0, -1, 0); }
      P.lerp(_p0, lw); D.lerp(_d0, lw); N.lerp(_n0, lw);
    }
    // 坐与躺之间换的那一段：两手往身后撑一下（指尖朝前、掌心按席），身子才慢慢放下去、撑起来
    if (prop > 0.001) { const hp = this.joints.hips.position; P.lerp(_p0.set(hp.x + s * 0.2, 0.025, hp.z - 0.2), prop); D.lerp(_d0.set(0, -0.15, 1), prop); N.lerp(_n0.set(0, -1, 0), prop); }
    // 跪着叩拜：两手前伸按地，在头的两侧
    const wb = W.kneel * smooth(0.2, 0.8, b);
    if (wb > 0.001) {
      const hx = s * 0.172, hz = 0.45 + 0.04 * b;
      P.lerp(_p.set(hx, 0.034 + this.groundAt(hx, hz), hz), wb);
      D.lerp(_p.set(-s * 0.18, 0, 1), wb); N.lerp(_p.set(0, -1, 0), wb);
    }
    // 闲时的小动作：这只手负到身后，或去小动作给的地方（胸的坐标换成身子的）
    const G = this.gO, gb = s > 0 ? G.backL : G.backR, gw = s > 0 ? G.wL : G.wR;
    if (gb > 0.001) { this.handTarget('back', a, A, swing, run, _p0, _d0, _n0); P.lerp(_p0, gb); D.lerp(_d0, gb); N.lerp(_n0, gb); }
    if (gw > 0.001) {
      const gp = s > 0 ? G.pL : G.pR, gd = s > 0 ? G.dL : G.dR, gn = s > 0 ? G.nL : G.nR, X = this.cX, U = this.cU, F = this.cF, cc = K_CHEST * 3;
      _p0.set(C[cc], C[cc + 1], C[cc + 2]).addScaledVector(X, gp.x).addScaledVector(U, gp.y).addScaledVector(F, gp.z);
      _d0.set(0, 0, 0).addScaledVector(X, gd.x).addScaledVector(U, gd.y).addScaledVector(F, gd.z);
      _n0.set(0, 0, 0).addScaledVector(X, gn.x).addScaledVector(U, gn.y).addScaledVector(F, gn.z);
      P.lerp(_p0, gw); D.lerp(_d0, gw); N.lerp(_n0, gw);
    }
    // 戴、摘斗笠的那一下（右手），扶笠（shade，头上有笠时）：手扶着笠沿前侧那一点
    const bw = Math.max(s < 0 ? this.donW : 0, s > 0 ? G.brimL : G.brimR);
    if (bw > 0.001 && this.brimPoint(s, _p0, _d0, _n0)) { P.lerp(_p0, bw); D.lerp(_d0, bw); N.lerp(_n0, bw); }
    D.normalize();
    // 被 reach 占着：伸向世界里的那一点
    a.rw += ((a.reach ? 1 : 0) - a.rw) * (a.init ? Math.min(1, dt * (a.reach ? 7 : 4.5)) : 1);
    if (a.reach) {
      const k = a.init ? 1 - Math.exp(-a.rate * dt) : 1;
      if (a.rGrip) {
        // 满把攥着一根杆：手指是小臂的接续（上一帧肘 → 腕、垂直于杆的那一份；刚伸过去时取肩 → 杆），绕过杆往掌心蜷一点；
        // 掌心朝着杆，掌心落在杆靠小臂的那一侧（杆横在掌心前，不穿过手）——腕不折，从袖口里出来的是手，不是一截歪着的腕
        const ax = _ga.copy(a.rGrip).applyQuaternion(this.iq).normalize();
        const tgt = this.root.worldToLocal(_gt.copy(a.reach));
        const fa = _gf.subVectors(a.W, a.E);
        if (!a.init || a.rw < 0.3 || fa.lengthSq() < 1e-6) fa.subVectors(tgt, a.S);
        fa.addScaledVector(ax, -fa.dot(ax));
        if (fa.lengthSq() < 1e-8) fa.set(0, -1, 0).addScaledVector(ax, ax.y);
        fa.normalize();
        const n = _gn.crossVectors(ax, fa).normalize();
        if (a.rPalm) { if (n.dot(_p.copy(a.rPalm).applyQuaternion(this.iq)) < 0) n.negate(); } else if (n.y > 0) n.negate();
        // （只蜷一点：蜷多了，手里那截腕就从袖子的另一边戳出来）
        fa.addScaledVector(n, 0.12).normalize();
        a.rpos.lerp(tgt.addScaledVector(n, -GRIP_OFF), k);
        a.rd.lerp(fa, k).normalize(); a.rn.lerp(n, k);
      } else {
        a.rpos.lerp(this.root.worldToLocal(_p.copy(a.reach)), k);
        if (a.rDir) a.rd.lerp(_p.copy(a.rDir).applyQuaternion(this.iq).normalize(), k).normalize();
        else a.rd.lerp(_p.subVectors(a.rpos, a.S).normalize(), k).normalize();
        if (a.rPalm) a.rn.lerp(_p.copy(a.rPalm).applyQuaternion(this.iq), k);
        else a.rn.lerp(_p.set(-s * 0.6, -0.8, 0), k);
      }
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
    // 跑：肘朝后、贴着身子
    const fr = ((this.hands1 === 'free' ? e1 : 0) + (this.hands0 === 'free' ? 1 - e1 : 0)) * run * A * W.stand * (1 - a.rw) * (1 - Math.max(gb, gw));
    if (fr > 0.001) pole.lerp(_p.set(s * 0.3, -0.3, -0.92), fr);
    // 躺着：枕头的那只肘朝外、朝头顶那边，搭在腹上的那只肘落在身侧席上；撑着的时候肘朝后
    const lwr = lw * (1 - a.rw);
    if (lwr > 0.001) pole.lerp(s < 0 ? _p.set(-1, 0.25, -0.45) : _p.set(1, -0.35, 0.05), lwr);
    if (prop > 0.001) pole.lerp(_p.set(s * 0.55, 0.05, -0.85), prop * (1 - a.rw));
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

  /**
   * 垂着、摆着的手（掌心 x,y,z，指向 dx,dy,dz）：掌心离衣身至少 HAND_GAP、指尖至少 TIP_GAP，在里头就水平地往外挪出来。结果写在 _cb（x、z）。
   * 衣身按上一帧摆好的样子量（下摆各圈的圈心与半径；胯以上按上身的表）——差一帧看不出来。
   */
  private clearBody(x: number, y: number, z: number, dx: number, dy: number, dz: number) {
    const l = TIP_LEN / (Math.hypot(dx, dy, dz) || 1);
    let nx = x, nz = z;
    for (let q = 0; q < 2; q++) {
      const ox = q ? dx * l : 0, oy = q ? dy * l : 0, oz = q ? dz * l : 0, gap = q ? TIP_GAP : HAND_GAP;
      const px = nx + ox, pz = nz + oz;
      this.bodyAt(y + oy, px, pz);
      const ex = px - _bc.x, ez = pz - _bc.z, d = Math.hypot(ex, ez), need = _bc.y + gap;
      if (d < need && d > 1e-4) { const k = need / d; nx = _bc.x + ex * k - ox; nz = _bc.z + ez * k - oz; }
    }
    _cb.set(nx, 0, nz);
  }
  /** 衣身在 y 高处：圈心（_bc.x、_bc.z）与朝 (qx, qz) 那一边的半径（_bc.y） */
  private bodyAt(y: number, qx: number, qz: number) {
    const NL = this.nlow, rc = this.rc, C = this.stC, top = (NL - 1) * 3;
    if (y <= rc[top + 1]) {
      let j = 0;
      while (j < NL - 2 && rc[(j + 1) * 3 + 1] < y) j++;
      const t = clamp((y - rc[j * 3 + 1]) / Math.max(1e-4, rc[j * 3 + 4] - rc[j * 3 + 1]), 0, 1);
      const cx = lerp(rc[j * 3], rc[j * 3 + 3], t), cz = lerp(rc[j * 3 + 2], rc[j * 3 + 5], t);
      _bc.set(cx, lerp(this.ringR(j, qx - cx, qz - cz), this.ringR(j + 1, qx - cx, qz - cz), t), cz);
    } else if (y <= C[1]) {
      // 下摆最上一圈与胯那一圈之间
      const t = clamp((y - rc[top + 1]) / Math.max(1e-4, C[1] - rc[top + 1]), 0, 1);
      const cx = lerp(rc[top], C[0], t), cz = lerp(rc[top + 2], C[2], t);
      _bc.set(cx, lerp(this.ringR(NL - 1, qx - cx, qz - cz), this.upR(0, qx - cx, qz - cz), t), cz);
    } else {
      let k = 0;
      while (k < NUP - 2 && C[(k + 1) * 3 + 1] < y) k++;
      const t = clamp((y - C[k * 3 + 1]) / Math.max(1e-4, C[k * 3 + 4] - C[k * 3 + 1]), 0, 1);
      const cx = lerp(C[k * 3], C[k * 3 + 3], t), cz = lerp(C[k * 3 + 2], C[k * 3 + 5], t);
      _bc.set(cx, lerp(this.upR(k, qx - cx, qz - cz), this.upR(k + 1, qx - cx, qz - cz), t), cz);
    }
  }
  /** 下摆第 j 圈（上一帧的）朝 (dx, dz) 那一边的半径 */
  private ringR(j: number, dx: number, dz: number) {
    const S = this.segs;
    let f = ((Math.atan2(dx, dz) - this.rtw[j] + Math.PI) / (2 * Math.PI)) * S;
    f = ((f % S) + S) % S;
    const i = Math.floor(f), ro = j * (S + 1);
    return lerp(this.rho[ro + i], this.rho[ro + i + 1], f - i);
  }
  /** 上身第 k 圈朝 (dx, dz) 那一边的半径（站着时的宽窄，扭转按脊） */
  private upR(k: number, dx: number, dz: number) {
    const a = Math.atan2(dx, dz) - this.stT[k], cs = Math.cos(a), n = UP[k][4];
    return Math.pow(Math.pow(Math.abs(Math.sin(a)) / UP[k][1], n) + Math.pow(Math.abs(cs) / (cs >= 0 ? UP[k][2] : UP[k][3]), n), -1 / n);
  }
  /**
   * 布要裹住的腿，摆成一串球：每条腿自胯到膝、膝到踝（踝以下按 legT 顺着小腿再探一截），球心隔不过 BALL_STEP，粗细自 HIP_R 收到 ANKLE_R；
   * 抬起来的脚再加鞋跟、鞋心、鞋尖三个球。脚底下不再往下垂一根柱：那样后脚一踢起来，布就从脚上一直挂到地，拖成一条尾巴。
   * 不用「这一高度上腿在哪一点」的一个圆：腿斜着时横截面是长的（斜 60° 时长一倍），膝弯处又在两圈之间顶出一个尖，一个圆都裹不住。
   */
  private buildBalls(legT: number) {
    let n = 0;
    for (let l = 0; l < 2; l++) {
      const H = this.legH[l], K = this.legK[l], A = this.legA[l];
      n = this.chain(n, H.x, H.y, H.z, K.x, K.y, K.z, HIP_R, KNEE_R, l, 0);
      n = this.chain(n, K.x, K.y, K.z, A.x, A.y, A.z, KNEE_R, ANKLE_R, l, 1);
      const e = legT - 1;
      if (e > 0.001) n = this.chain(n, A.x, A.y, A.z, A.x + (A.x - K.x) * e, A.y + (A.y - K.y) * e, A.z + (A.z - K.z) * e, ANKLE_R, ANKLE_R, l, 1);
      const fw = this.footW[l];
      if (fw >= 0.01) for (let q = 0; q < 3; q++) { const o = (l * 3 + q) * 3; n = this.ball(n, this.footP[o], this.footP[o + 1], this.footP[o + 2], FOOT_BALL[q][3] * fw, l); }
    }
    this.nBall = n;
  }
  /** a → b 一段上摆一串球（skip：第一个已经有了就跳过） */
  private chain(n: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, ra: number, rb: number, l: number, skip: number) {
    const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / BALL_STEP));
    for (let i = skip; i <= k; i++) { const t = i / k; n = this.ball(n, lerp(ax, bx, t), lerp(ay, by, t), lerp(az, bz, t), lerp(ra, rb, t), l); }
    return n;
  }
  private ball(n: number, x: number, y: number, z: number, r: number, l: number) {
    if (n >= MAX_BALL) return n;
    const B = this.balls, o = n * 5;
    B[o] = x; B[o + 1] = y; B[o + 2] = z; B[o + 3] = r; B[o + 4] = l;
    return n + 1;
  }
  /**
   * y 高处、上下各 half 厚的这一层里，腿（与抬起的脚）的横截面：每个球在这一层里的那一片是一个圆。四个数一组自 out[off] 写起：
   * 小人坐标里的 x、z，半径（加了余量），哪条腿（0 左 1 右）。返回几个。
   * （按一层而不是一个平面量：两圈之间的布是直的，膝弯顶出来的尖落在两圈中间也得裹住）
   */
  private legCircles(y: number, half: number, out: Float32Array, off: number) {
    const B = this.balls; let n = 0;
    for (let i = 0; i < this.nBall; i++) {
      const o = i * 5, r = B[o + 3], d = Math.abs(B[o + 1] - y) - half;
      if (d >= r) continue;
      const w = off + n * 4;
      out[w] = B[o]; out[w + 1] = B[o + 2]; out[w + 2] = (d <= 0 ? r : Math.sqrt(r * r - d * d)) + LEG_PAD; out[w + 3] = B[o + 4]; n++;
    }
    // 被别的圆整个包住的圆不要（腿直着时，这一层里的几个球几乎同心，只留最粗的那个）——每一点都要和每个圆比，少几个省得多
    let m = 0;
    for (let a = 0; a < n; a++) {
      const wa = off + a * 4, ax = out[wa], az = out[wa + 1], ar = out[wa + 2];
      let inside = false;
      for (let b = 0; b < n && !inside; b++) {
        if (b === a) continue;
        const wb = off + b * 4, gap = out[wb + 2] - ar + 1e-4;
        if (gap <= 0 || (gap < 2e-4 && b > a)) continue;
        const ex = ax - out[wb], ez = az - out[wb + 1];
        inside = ex * ex + ez * ez <= gap * gap;
      }
      if (inside) continue;
      if (m !== a) { const wm = off + m * 4; out[wm] = ax; out[wm + 1] = az; out[wm + 2] = ar; out[wm + 3] = out[wa + 3]; }
      m++;
    }
    return m;
  }
  /** 第 q 层两条腿各自的外接圆（写进 slabB） */
  private bound(q: number) {
    const S = this.slab, o = q * MAX_BALL * 4, n = this.slabN[q], B = this.slabB;
    for (let l = 0; l < 2; l++) {
      let mx = 0, mz = 0, k = 0;
      for (let c = 0; c < n; c++) { const w = o + c * 4; if ((S[w + 3] < 0.5 ? 0 : 1) !== l) continue; mx += S[w]; mz += S[w + 1]; k++; }
      const b = q * 6 + l * 3;
      if (!k) { B[b + 2] = -1; continue; }
      mx /= k; mz /= k;
      let r = 0;
      for (let c = 0; c < n; c++) { const w = o + c * 4; if ((S[w + 3] < 0.5 ? 0 : 1) !== l) continue; const v = Math.hypot(S[w] - mx, S[w + 1] - mz) + S[w + 2]; if (v > r) r = v; }
      B[b] = mx; B[b + 1] = mz; B[b + 2] = r;
    }
  }
  /** 第 q 层的腿在 (dx, dz) 方向上、离圈心 (cx, cz) 最远到哪（两条腿取大的）；连外接圆都不过 atLeast 就不细算，直接给外接圆的（不会大过它） */
  private legReach(q: number, cx: number, cz: number, dx: number, dz: number, atLeast = -1) {
    const S = this.slab, o = q * MAX_BALL * 4, n = this.slabN[q], Bb = this.slabB, b = q * 6;
    const b0 = Bb[b + 2] < 0 ? 0 : (Bb[b] - cx) * dx + (Bb[b + 1] - cz) * dz + Bb[b + 2], b1 = Bb[b + 5] < 0 ? 0 : (Bb[b + 3] - cx) * dx + (Bb[b + 4] - cz) * dz + Bb[b + 5];
    if (Math.max(b0, b1) <= atLeast) return Math.max(b0, b1);
    let h = 0;
    for (let c = 0; c < n; c++) { const w = o + c * 4, v = (S[w] - cx) * dx + (S[w + 1] - cz) * dz + S[w + 2]; if (v > h) h = v; }
    return h;
  }
  /**
   * 最下一圈各处要不要顺着腿往上缩、缩多少（写进 rideL，左右抹匀）：布在这个方向上撑到「本来的半径 + STRETCH」还裹不住腿，
   * 就往上找裹得住的高度——腿往胯收，越高越近。量最下一层与它上面约 RIDE_DY 处（第 qd 层，高出 dy）两层，中间按直线算。返回有没有缩。
   * 往上缩是立刻的；放下来带滞后，跟布往回收一样慢（不然腿一收回去，摆脚先落下来、宽度还没收，就在身后拖成一条尾巴）。
   */
  private rideUp(on: boolean, qd: number, dy: number, cx: number, cz: number, ia: number, ibF: number, ibB: number, inv: number, sP: Float32Array, cP: Float32Array, ws: number, dt: number) {
    const S = this.segs, sn = this.sn, cs = this.cs, L = this.rideU, T = this.rideT, R = this.rideL, Bb = this.slabB;
    // 两条腿在最下一层里离圈心最远也够不着「最窄处 + STRETCH」：哪儿都不用缩
    if (on) {
      let far = 0;
      for (let l = 0; l < 2; l++) if (Bb[l * 3 + 2] > 0) far = Math.max(far, Math.hypot(Bb[l * 3] - cx, Bb[l * 3 + 1] - cz) + Bb[l * 3 + 2]);
      if (far <= Math.pow(Math.max(ia, ibF, ibB), inv) + STRETCH) on = false;
    }
    let any = false;
    for (let i = 0; i < S; i++) {
      L[i] = 0;
      if (!on) continue;
      const s0 = sn[i], c0 = cs[i], lim = Math.pow(sP[i] * ia + cP[i] * (c0 >= 0 ? ibF : ibB), inv) + STRETCH;
      const na = this.legReach(0, cx, cz, s0, c0);
      if (na <= lim) continue;
      const nb = this.legReach(qd, cx, cz, s0, c0);
      L[i] = nb < na ? Math.min(RIDE_MAX, (dy * (na - lim)) / (na - nb)) : RIDE_MAX;
      any = true;
    }
    if (any) {
      // 先往两边各撑开两格（不然一抹，窄窄的一处就只剩四成），再左右抹匀两遍（摆脚是一整圈布，不会只在一点上尖起来）
      for (let i = 0; i < S; i++) T[i] = Math.max(L[(i + S - 2) % S], L[(i + S - 1) % S], L[i], L[(i + 1) % S], L[(i + 2) % S]);
      L.set(T.subarray(0, S));
      for (let p = 0; p < 2; p++) {
        for (let i = 0; i < S; i++) T[i] = 0.25 * L[(i + S - 1) % S] + 0.5 * L[i] + 0.25 * L[(i + 1) % S];
        for (let i = 0; i < S; i++) L[i] = T[i] * (p === 1 ? ws : 1);
      }
    }
    const k = Math.min(1, dt * 7);
    let up = false;
    for (let i = 0; i < S; i++) { const v = any ? L[i] : 0, o = R[i]; R[i] = v >= o ? v : o + (v - o) * k; if (R[i] < 1e-4) R[i] = 0; else up = true; }
    R[S] = R[0];
    return up;
  }
  /** 第 l 条腿在 y 高处的前后（只给「前后扯开时两侧收一点」用） */
  private legZ(l: number, y: number) {
    const H = this.legH[l], K = this.legK[l], A = this.legA[l];
    if (y >= K.y) return lerp(H.z, K.z, clamp((H.y - y) / Math.max(0.02, H.y - K.y), 0, 1));
    return lerp(K.z, A.z, clamp((K.y - y) / Math.max(0.02, K.y - A.y), 0, 1));
  }

  private placeFoot(m: THREE.Object3D, f: Foot, b: number) {
    const W = this.w, s = f.s;
    // 站：步态给的位置；脚尖着地、脚跟抬起时把脚整体抬一点（等于绕脚尖转）
    const toe = Math.max(0, f.pitch), heel = Math.max(0, -f.pitch);
    let x = W.stand * f.x, y = W.stand * (f.y + Math.sin(toe) * 0.11 + Math.sin(heel) * 0.03), z = W.stand * (f.z - 0.004);
    // 跪：脚背贴地、脚尖朝后、脚底朝上；叩拜时臀离脚跟，脚略立起
    if (W.kneel > 0.001) { const kx = s * 0.086, kz = -0.125; x += W.kneel * kx; y += W.kneel * (0.073 + 0.012 * b + this.groundAt(kx, kz - 0.1)); z += W.kneel * kz; }
    x += W.sit * s * 0.07 + W.crouch * s * 0.1 + W.bench * s * 0.088; y += W.sit * 0.05 + W.crouch * 0.004; z += W.sit * 0.17 + W.crouch * 0.03 + W.bench * 0.012;
    // 仰卧：两腿伸直，脚跟着席、脚尖朝天
    x += W.lie * s * LIE_FOOT.x; y += W.lie * LIE_FOOT.y; z += W.lie * LIE_FOOT.z;
    m.position.set(x, y, z);
    const qs = this.q1.setFromEuler(this.e1.set(f.pitch + f.tilt * W.stand, s * 0.13, 0, 'YXZ'));
    if (W.kneel > 0.001) qs.slerp(this.q2.setFromEuler(this.e1.set(Math.PI - 0.27 + 0.1 * b, s * 0.1, 0, 'YXZ')), W.kneel);
    if (W.crouch > 0.001) qs.slerp(this.q2.setFromEuler(this.e1.set(0.02, s * 0.3, 0, 'YXZ')), W.crouch);
    if (W.sit > 0.001) qs.slerp(this.q2.setFromEuler(this.e1.set(0.5, -s * 1.2, 0, 'YXZ')), W.sit);
    if (W.bench > 0.001) qs.slerp(this.q2.setFromEuler(this.e1.set(0, s * 0.17, 0, 'YXZ')), W.bench);
    // （脚尖朝天，再绕身子的长轴往外撇一点）
    if (W.lie > 0.001) qs.slerp(this.q2.setFromAxisAngle(_az, -s * LIE_FOOT.splay).multiply(_q3.setFromAxisAngle(_ax, LIE_FOOT.pitch)), W.lie);
    m.quaternion.copy(qs);
    const sc = 1 - 0.999 * smooth(0.3, 0.75, W.sit);
    m.scale.setScalar(sc); m.visible = sc > 0.01;
  }

  /** 把衣身的每一圈摆好 */
  private shapeBody(dt: number, t: number, sway: number, px: number, py: number, pz: number, yawP: number, roll: number, climb: number, br: number) {
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
    // 跑：衣摆被风兜着往后飘、后摆扬起一点，摆脚抖着（三个起伏绕着身子转）。
    // 布始终裹着两条腿，前后都不收（收了，腿就从布里穿出来）：腿顶到哪，布立刻撑到哪；顶出去的地方摆脚被带起来、扬起来，所以不拖成一条「尾巴」
    // （飘与抖跟着平滑过的 runS 慢慢起落；摆脚被带起多少跟着此刻的步子——快走、起跑的那几大步也带，不等 runS 跟上来）
    const runK = this.runS * ws, drag = 0.03 * runK, s3 = this.s3, c3 = this.c3;
    // （两脚前后隔得很开时——跑着急停的那一下弓步——摆脚也带得多，不然后摆撑成一口大钟）
    const legK = Math.max(runK, smooth(1.8, 2.8, this.ga) * this.amp * ws, smooth(0.5, 0.85, Math.abs(FL.z - FR.z)) * ws), legT = lerp(1.25, 1, legK);
    const pushK = lerp(0.32, 0.75, legK), pushMax = lerp(0.11, 0.26, legK);
    // 跑得快、两腿前后叉得开：整圈摆脚顺着腿往上缩一截（布裹不住叉开的两腿）——后脚蹬地时布就不一直撑到地上、拖成一条尾巴，露出来的是裤腿
    const ride = ws * this.amp * (RIDE * smooth(2.4, 4.2, this.ga) + 0.04 * smooth(0.55, 1, Math.abs(FL.z - FR.z)));
    // 抬起来的脚也裹着：鞋跟、鞋心、鞋尖三个球（落在地上的脚不裹——摆脚本来就搭在鞋面上）
    this.footW[0] = this.footW[1] = 0;
    if (legs) for (let l = 0; l < 2; l++) {
      const f = l === 0 ? FL : FR, m = l === 0 ? this.feet.L : this.feet.R;
      this.footW[l] = ws * (f.air ? smooth(0.02, 0.07, f.lift) : 0);
      if (this.footW[l] < 0.01) continue;
      for (let q = 0; q < 3; q++) {
        const b = FOOT_BALL[q], v = this.t3.set(b[0], b[1], b[2]).applyQuaternion(m.quaternion).add(m.position), fo = (l * 3 + q) * 3;
        this.footP[fo] = v.x; this.footP[fo + 1] = v.y; this.footP[fo + 2] = v.z;
      }
    }
    if (legs) this.buildBalls(legT); else this.nBall = 0;
    // 每一圈管它上下各半个圈距的那一层：各层里腿的横截面先量好（按站着时各圈的高）；抬起来的点到它所在的那一层去取
    const half = 0.5 * Math.max(0.02, hy - this.hem - ride) / NL, Y0 = this.hem + ride, SN = this.slabN;
    for (let q = 0; q < NL; q++) { SN[q] = legs ? this.legCircles(Y0 + 2 * half * q, half, this.slab, q * MAX_BALL * 4) : 0; this.bound(q); }
    const qd = Math.min(NL - 1, Math.round(RIDE_DY / (2 * half))), invSpan = 1 / Math.max(0.1, hy - this.hem - ride);
    let rideAny = false;
    // 仰卧：下摆不是一圈圈横着的，是顺着伸直的两腿铺开的一段段竖着的截面——上面盖着腿，两边垂到席上，底下贴着席。
    // 换姿态的半途按 lie 的份量在两种摆法之间逐点过渡
    const Wl = W.lie, nW = 1 - Wl, flatOnly = nW < 0.001;
    let o = L.at(0, 2, 0) * 3;
    for (let j = 0; j < NL; j++) {
      const u = j / NL;
      B.y = B.cz = B.a = B.bF = B.bB = B.rise = B.riseW = 0;
      for (const p of POSES) {
        const w = p === 'lie' ? 0 : W[p] / Math.max(nW, 1e-3); if (w < 0.001) continue;
        skirt(p, u, hy, hz, sk, this.hem, this.flare);
        B.y += w * sk.y; B.cz += w * (sk.cz + (p === 'stand' ? hemZ * (1 - u) : 0)); B.a += w * sk.a; B.bF += w * sk.bF; B.bB += w * sk.bB; B.rise += w * sk.rise; B.riseW += w * sk.riseW;
      }
      if (ride > 1e-4) B.y += (ride / Math.max(nW, 1e-3)) * (1 - u);
      if (flatOnly) { B.y = hy; B.a = B.bF = B.bB = 0.17; B.cz = hz; }
      // 躺着这一截：在腿上哪里（胯 → 脚踝）、盖得多高、多宽
      const lz = pz + 0.04 + (1 - u) * 0.74, lTop = lerp(0.112, 0.252, Math.pow(u, 1.6)), lW = lerp(0.205, 0.172, u * u);
      const lo = (1 - u) * (1 - u), flA = 0.045 * runK * lo, fph = 10.5 * t + 2.4 * u, fc = Math.cos(fph), fs = Math.sin(fph), backUp = 0.045 * runK * lo;
      const cx = sway * (0.35 + 0.65 * u) + roll * (B.y - 0.09), cy = B.y, cz = B.cz - drag * Math.pow(1 - u, 1.5);
      const n = this.nl[j], ia = Math.pow(B.a, -n), ibF = Math.pow(B.bF, -n), ibB = Math.pow(B.bB, -n), inv = -1 / n;
      const sP = this.sPl[j], cP = this.cPl[j];
      const tw = yawP * u, ctw = Math.cos(tw), stw = Math.sin(tw);
      // （记下这一圈的圈心与扭转：下一帧量手离布多远用）
      this.rc[j * 3] = cx; this.rc[j * 3 + 1] = cy; this.rc[j * 3 + 2] = cz; this.rtw[j] = tw;
      // 这一圈的高度上两条腿（与抬起的脚）在哪、多粗；前后扯开时两侧收一点（按两条腿本身）
      const nc = legs && cy < py - 0.03 ? SN[j] : 0;
      const tens = nc ? 1 - 0.28 * Math.min(1, Math.max(0, Math.abs(this.legZ(0, cy) - this.legZ(1, cy)) - 0.1) / 0.5) * ws : 1;
      // （缩上去的地方按那个高度上钟的宽窄收：这一圈本来的那份先算好，(1−u)^1.25）
      const w1 = this.flare * (1 - u) * Math.sqrt(Math.sqrt(1 - u));
      // 最下一圈：哪一边的腿叉得太远，那一边的摆脚顺着腿往上缩（量一次，往上各圈按 1−u 递减）
      if (j === 0) rideAny = this.rideUp(nc > 0 && ws > 0.3 && this.ga > RUN_A - 0.2, qd, 2 * half * qd, cx, cz, ia, ibF, ibB, inv, sP, cP, ws, filt ? dt : 1);
      const rate = filt ? Math.min(1, dt * lerp(9, 32, u)) : 1;
      const kS = 55, hemUp = Math.pow(1 - u, 1.5), foldA = (0.075 * ws + 0.025 * (1 - ws)) * Math.pow(1 - u, 1.2), fold = this.fold;
      const stepClamp = this.hemOn && j <= 3, gPad = 0.015 + j * 0.012;
      const ro = j * (S + 1);
      for (let i = 0; i <= S; i++) {
        const s0 = sn[i], c0 = cs[i];
        if (flatOnly) {
          // 躺平了：只算躺着的截面（别的姿态那一套不必算）
          const fz = 1 + 0.05 * fold[i] * (1 - u);
          P[o] = px + s0 * lW * fz * (1 + 0.12 * Math.max(0, -c0)); P[o + 1] = 0.006 + (lTop - 0.006) * fz * Math.pow((1 + c0) * 0.5, 1.15); P[o + 2] = lz + 0.012 * fold[i] * (1 - u); o += 3;
          continue;
        }
        let r = Math.pow(sP[i] * ia + cP[i] * (c0 >= 0 ? ibF : ibB), inv) * (1 + foldA * fold[i] + (flA > 1e-5 ? flA * (s3[i] * fc - c3[i] * fs) : 0));
        const dxn = s0 * ctw + c0 * stw, dzn = c0 * ctw - s0 * stw;      // 这一点的方向（含骨盆的扭转）
        // 这一处顺着腿缩上去了：布按缩到的那个高度上钟的宽窄（越往上越收，不是整片平着抬起来成一圈帽檐），腿也在那个高度上量
        const lift = rideAny ? this.rideL[i] * (1 - u) : 0;
        if (lift > 0.01 && ws > 0.02) {
          const v2 = Math.max(0, 1 - u - lift * invSpan), w2 = this.flare * v2 * Math.sqrt(Math.sqrt(v2));
          const ra = (0.17 + 0.068 * w2) / (0.17 + 0.068 * w1), rb = c0 >= 0 ? (0.118 + 0.082 * w2) / (0.118 + 0.082 * w1) : (0.128 + 0.07 * w2) / (0.128 + 0.07 * w1);
          r *= lerp(1, lerp(rb, ra, Math.abs(s0)), ws);
        }
        let base = r, need = 0;
        if (nc) {
          base = r * (1 - (1 - tens) * Math.abs(s0));
          // 两条腿各取它的圆（腿、抬起的脚）在这个方向上最远的那一点（缩上去了的点到它所在的那一层去取）
          const q = lift > 0.01 ? Math.min(NL - 1, Math.round((cy + lift - Y0) / (2 * half))) : j, SL = this.slab, ob = q * MAX_BALL * 4, nv = SN[q], SB = this.slabB, qb = q * 6;
          let h0 = SB[qb + 2] < 0 ? -1 : (SB[qb] - cx) * dxn + (SB[qb + 1] - cz) * dzn + SB[qb + 2];
          let h1 = SB[qb + 5] < 0 ? -1 : (SB[qb + 3] - cx) * dxn + (SB[qb + 4] - cz) * dzn + SB[qb + 5];
          // （外接圆都离布还远：不必一个个圆去比，拿外接圆当上限就够了）
          if (Math.max(h0, h1) > base - 0.08) {
            h0 = h1 = -1;
            for (let c = 0; c < nv; c++) {
              const w = ob + c * 4, h = (SL[w] - cx) * dxn + (SL[w + 1] - cz) * dzn + SL[w + 2];
              if (SL[w + 3] < 0.5) { if (h > h0) h0 = h; } else if (h > h1) h1 = h;
            }
          }
          // （腿在这个方向上离布还远：抹圆那一下可以不算，差不到一毫米）
          if (Math.max(h0, h1) > base - 0.08) {
            const m = Math.max(base, h0, h1);
            const sm = m + Math.log(Math.exp(kS * (base - m)) + Math.exp(kS * (h0 - m)) + Math.exp(kS * (h1 - m))) / kS;
            r = lerp(r, sm, ws);
          } else r = lerp(r, base, ws);
          need = Math.max(h0, h1) * ws;
        }
        // 往回收带滞后（布有分量）；往外是腿顶的，至少立刻撑到裹得住腿——不然腿比布快，就从布里穿出来
        let k: number;
        if (i === S) k = this.rho[ro];
        else { let v = this.rho[ro + i] + (r - this.rho[ro + i]) * rate; if (v < need) v = need; k = this.rho[ro + i] = v; }
        let x = cx + k * dxn, z = cz + k * dzn;
        let y = cy + lift + B.rise * (c0 > 0 ? Math.pow(c0, 1.5) : 0) + B.riseW * kneeDown * Math.pow(0.5 + 0.5 * c0, 0.55);
        // 站着：坡上下摆随地面斜；腿把布顶出去多少，摆脚就被带起来一点
        if (ws > 0.02) y += ws * (climb * (z - pz) * (1 - u) + clamp((k - base) * pushK, 0, pushMax) * hemUp);
        if (backUp > 1e-4 && dzn < 0) y -= backUp * dzn;
        if (nc && Math.abs(y - cy - lift) > 0.012) {
          // 摆脚被带起来（或在坡上斜下去）了：在它此刻的高度上再量一次腿——腿是斜的，换了高度就换了地方，布还得裹得住
          const h = this.legReach(clamp(Math.round((y - Y0) / (2 * half)), 0, NL - 1), cx, cz, dxn, dzn, k / Math.max(ws, 1e-3)) * ws;
          if (h > k) { k = h; if (i < S) this.rho[ro + i] = k; x = cx + k * dxn; z = cz + k * dzn; }
        }
        if (seated) y += this.groundAt(x, z, soft) * Math.pow(1 - u, dropE);
        if (stepClamp) {
          const fq = ((i % S) / S) * HEM_N, q0 = Math.floor(fq), g = lerp(hemG[q0], hemG[(q0 + 1) % HEM_N], fq - q0) + gPad;
          if (y < g) y = g;
        }
        if (Wl > 0.001) {
          // 躺着的截面：正面（c0 为正）朝天盖在腿上，两侧垂到半高、底下收拢贴着席（衣褶在边上起伏一点）
          const fz = 1 + 0.05 * fold[i] * (1 - u), ly = 0.006 + (lTop - 0.006) * fz * Math.pow((1 + c0) * 0.5, 1.15), lx = px + s0 * lW * fz * (1 + 0.12 * Math.max(0, -c0));
          const lzz = lz + 0.012 * fold[i] * (1 - u);
          x = flatOnly ? lx : lerp(x, lx, Wl); y = flatOnly ? ly : lerp(y, ly, Wl);
          P[o] = x; P[o + 1] = y; P[o + 2] = flatOnly ? lzz : lerp(z, lzz, Wl); o += 3;
          continue;
        }
        P[o] = x; P[o + 1] = y; P[o + 2] = z; o += 3;
      }
    }
    this.rhoInit = true;
    // 下摆的里子：往里收一圈，再贴着衣里往上一截（深色的贴边）。不再收成一点封住底：
    // 那样后摆一扬，这一片就从摆脚斜着拉到当中，成了两腿之间的一张膜；衣裳两面都画，从底下也看不穿
    {
      const hem = L.at(0, 2, 0) * 3, a1 = L.at(0, 1, 0) * 3, a0 = L.at(0, 0, 0) * 3;
      let mx = 0, mz = 0;
      for (let i = 0; i < S; i++) { mx += P[hem + i * 3]; mz += P[hem + i * 3 + 2]; }
      mx /= S; mz /= S;
      for (let i = 0; i <= S; i++) {
        const x = P[hem + i * 3], y = P[hem + i * 3 + 1], z = P[hem + i * 3 + 2];
        P[a1 + i * 3] = mx + (x - mx) * 0.93; P[a1 + i * 3 + 1] = y + 0.012; P[a1 + i * 3 + 2] = mz + (z - mz) * 0.93;
        P[a0 + i * 3] = mx + (x - mx) * 0.88; P[a0 + i * 3 + 1] = y + 0.035; P[a0 + i * 3 + 2] = mz + (z - mz) * 0.88;
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
    const fore = _t.subVectors(a.W, E).normalize(), full = this.sleeveK;
    // （窄袖：袖口挽在腕上一截，不垂成袋）
    const ext = lerp(-0.07, fore.y < 0 ? lerp(0.03, 0.125, smooth(0.15, 0.9, -fore.y)) : lerp(0.03, -0.085, smooth(0.15, 0.85, fore.y)), full);
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
      if (full < 1) rBag = lerp(Math.max(rTop, rSide) * 1.08, rBag, full);
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
  private shapeSock(patch: number, m: THREE.Object3D, f: Foot, l: number) {
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
    if (W.bench > 0.001) { const hp = this.joints.hips.position; K.addScaledVector(_p.set(s * 0.092, hp.y - 0.04, hp.z + L_TH - 0.03), W.bench); wsum += W.bench; }
    // 仰卧：膝在两脚与胯之间，贴着席
    if (W.lie > 0.001) { K.addScaledVector(_p.set(s * 0.092, 0.075, 0.43), W.lie); wsum += W.lie; }
    // 站着时袜筒往上接成裤腿，到膝下：衣摆被腿顶起、跑起来扬起时露出来的是裤腿；上半截总裹在布里
    const bare = this.bare, th = _p, hk = bare ? 0 : W.stand * (1 - W.lie);
    let thighUp = 0;
    const up = this.t4.set(0, 1, 0).applyQuaternion(q), dir = this.t5;
    if (wsum > 0.01) dir.copy(K).multiplyScalar(1 / wsum).sub(ank).normalize(); else dir.copy(up);
    dir.lerp(up, 0.3 * W.stand * (1 - hk)).normalize();          // 短袜：鞋口处还顺着脚
    let len = 0.215;
    if (hk > 0.001 && W.stand > 0.02) {
      // 裤腿的上沿落在布裹着的那条腿的轴上、膝下一点（不然腿一斜，上沿就从布里戳出来）
      const top = _p0.copy(this.legA[l]).lerp(this.legK[l], 0.92).sub(base), tl = top.length();
      if (tl > 0.05) { dir.lerp(top.multiplyScalar(1 / tl), hk).normalize(); len = lerp(0.215, tl, hk); }
      // 最上一圈过了膝、顺着大腿往布里再探一截（摆脚扬到膝上时也接得上）
      th.subVectors(this.legH[l], this.legK[l]).normalize(); thighUp = 0.1 * hk;
    }
    len *= vis;
    // 短衣露着小腿：筒自鞋口正对着膝（三圈），最上一圈再顺着大腿往衣摆里探一截
    let kneeLen = 0;
    if (bare) {
      if (wsum > 0.01) K.multiplyScalar(1 / wsum); else K.copy(ank).addScaledVector(up, 0.37);
      dir.subVectors(K, base); kneeLen = dir.length(); dir.multiplyScalar(1 / (kneeLen || 1));
      if (W.stand > 0.5) th.subVectors(this.legH[l], K).normalize(); else if (W.bench > 0.5) th.set(0, 0.12, -1).normalize(); else th.copy(dir);
    }
    const ex = this.t6.set(1, 0, 0).applyQuaternion(q); ex.addScaledVector(dir, -ex.dot(dir)).normalize();
    const ez = _q.crossVectors(ex, dir);
    const flat = W.stand < 0.98;
    for (let r = 0; r < 4; r++) {
      // （裤腿上宽下收，束在袜口；最上一圈收拢——万一露出衣摆，也是收进布里的样子，不是一截切开的管子）
      const t = bare ? Math.min(1, r / 2) : lerp(r / 3, HOSE_T[r], hk), ln = bare ? kneeLen : len, up2 = r === 3 ? (bare ? 0.17 : thighUp) : 0;
      const rad = (bare ? CALF[r] : lerp(lerp(0.041, 0.037, t), HOSE_R[r], hk)) * vis;
      const cx = base.x + dir.x * ln * t + th.x * up2, cy = base.y + dir.y * ln * t + th.y * up2, cz = base.z + dir.z * ln * t + th.z * up2;
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
const _p = V(), _q = V(), _fp = V(), _fd = V(), _fn = V(), _p0 = V(), _d0 = V(), _n0 = V(), _w = V(), _pole = V(), _z = V(), _x = V(), _wv = V(), _t = V(), _bc = V(), _cb = V();
const _ga = V(), _gt = V(), _gf = V(), _gn = V(), _wx = V(), _wy = V(), _wz = V();
const _hm0 = new THREE.Matrix4(), _hm1 = new THREE.Matrix4(), _hm2 = new THREE.Matrix4(), _hp = V(), _hp0 = V(), _hp1 = V(), _hs = V(), _hs0 = V(), _hs1 = V(), _cp = V();
const _hq = new THREE.Quaternion(), _hq0 = new THREE.Quaternion(), _hq1 = new THREE.Quaternion();
const _ax = new THREE.Vector3(1, 0, 0), _ay = new THREE.Vector3(0, 1, 0), _az = new THREE.Vector3(0, 0, 1), _q3 = new THREE.Quaternion();
