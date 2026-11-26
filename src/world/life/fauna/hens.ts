/**
 * 鸡。三群：
 *   草堂自家的三只母鸡——东厢北边、院子东北角有一座鸡埘（土墙、草顶，前面一个门洞，里面一个草窝），清早出埘、黄昏进埘，
 *     上午挨个钻进去下蛋，下完了出来「咯咯哒」地叫；埘边一只瓦盆，盛着糠，搁着一把瓢（喂鸡那件事从这里抓）。
 *   甲家门前：一只公鸡领着三只母鸡、一只抱窝的母鸡带四只小鸡（春夏）。公鸡天亮打鸣，刨到吃的「咯咯」地招母鸡来。
 *   乙家门前：四只母鸡，清早邻家妇人喂它们（folk.feedAt）。
 * 鸡的样子：身子是一个前高后翘的蛋，胸挺着，尾羽朝上翘（公鸡是几根拱起再垂下的长镰羽），一截颈、小头、红冠、肉垂，翅收在身侧，
 * 黄脚、三趾。动作照着真鸡：走路时头一顿一顿（头在空中定住、身子赶上去，再往前一探），啄食一下一下地点，
 * 两脚轮着往后刨土、退一步再啄；梳羽（头扭到背后）、伸懒腰（一侧的翅和腿一起往后伸）、扑翅、晌午卧着打盹、晴天的午后刨个坑洗沙浴；
 * 人慢慢走近只是让开几步，人跑过来就惊得扑着翅膀四散、咯咯乱叫；母鸡护雏，小鸡钻到它翅膀底下。下雨躲进檐下（自家的钻进埘里）。
 */
import * as THREE from 'three';
import { M, V, box, cyl, lathe, merge, type Geo } from '../../core/geo';
import { mulberry32 } from '../../core/rng';
import { PIG, wash, type RGB } from '../../ink/ink';
import { SITE, YARD_Y } from '../../site';
import { addOBox, blocked } from '../../walk';
import { sbox, wobble } from '../../build/kit';
import type { Ctx } from '../person';
import { Parts, child, creatureMat, loftZ, paint, tone, trs } from '../rig';
import { COOPS, atHouse, footY } from '../spots';
import type { HensApi, StrayHen } from './api';
import { OCHRE, RED, beak, bump, camDist, clamp01, ell, lerp, mottle, mul, rod, shadeBy, sm, turnTo, wrap, type Day } from './kit';

// ———————————————————————— 样子 ————————————————————————
/** 母鸡站着时髋（两腿根）离地多高；身子、颈、翅、腿都以这里为准 */
const HIP = 0.115;
const NECK = { y: 0.255 - HIP, z: 0.105 }, SH = { x: 0.062, y: 0.248 - HIP, z: 0.055 }, LEG = { x: 0.034, y: 0 };
interface HenLook { body: RGB; wing: RGB; tail: RGB; neck?: RGB; breast?: RGB; cock?: boolean; /** 芦花：一道道深浅相间的横斑 */ bars?: boolean }
interface HenGeo { body: Geo; head: Geo; wing: Geo; wingR: Geo; leg: Geo }
function henGeo(L: HenLook, seed: number): HenGeo {
  const cock = !!L.cock;
  // 身子：自尾根（后、高）经腹（最宽）到胸（前、挺起）
  const secs: Array<[number, number, number, number]> = cock
    ? [[-0.13, 0.27, 0.03, 0.04], [-0.095, 0.235, 0.062, 0.07], [-0.03, 0.21, 0.085, 0.086], [0.035, 0.212, 0.086, 0.09], [0.088, 0.238, 0.07, 0.078], [0.112, 0.268, 0.045, 0.05]]
    : [[-0.135, 0.255, 0.032, 0.04], [-0.1, 0.226, 0.066, 0.072], [-0.035, 0.205, 0.09, 0.09], [0.03, 0.206, 0.09, 0.09], [0.085, 0.226, 0.074, 0.08], [0.114, 0.255, 0.048, 0.052]];
  const body = shadeBy(loftZ(secs, 11, 1.12), (_x, y, z, o) => {
    // 背上深、腹下浅；胸前另一色（公鸡是黑胸）
    const k = clamp01((y - 0.16) / 0.12), c = L.breast && z > 0.05 && y < 0.24 ? L.breast : L.body;
    o[0] = c[0] * lerp(1.06, 0.94, k); o[1] = c[1] * lerp(1.06, 0.94, k); o[2] = c[2] * lerp(1.06, 0.94, k);
  });
  mottle(body, 0.07, seed);
  if (L.bars) shadeBy(body, (_x, y, z, o) => { const k = Math.sin(y * 150 + z * 40) > 0.25 ? 0.7 : 1.04; o[0] *= k; o[1] *= k; o[2] *= k; });
  const parts: Geo[] = [body];
  if (cock) {
    // 公鸡的尾：几根拱起来再垂下去的长镰羽，外加蓑羽
    for (let i = 0; i < 5; i++) {
      const a = 0.25 + i * 0.22, r = 0.16 + 0.03 * i, sx = (i - 2) * 0.011;
      const pts = [0, 0.3, 0.6, 1].map((t) => V(sx * (1 + t), 0.27 + Math.sin(a + t * 2.0) * r * (0.45 + 0.55 * t), -0.12 - (1 - Math.cos(t * 2.1)) * r * 0.8));
      parts.push(rod(pts, 0.014, 0.004, i % 2 ? L.tail : mul(L.tail, 1.12)));
    }
    for (const s of [-1, 1]) parts.push(ell(0.03, 0.04, 0.07, L.neck ?? L.body).applyMatrix4(M.mul(M.t(s * 0.045, 0.25, -0.07), M.rx(-0.5))));
  } else {
    // 母鸡的尾：一小撮朝上翘的扇
    parts.push(ell(0.017, 0.07, 0.048, L.tail).applyMatrix4(M.mul(M.t(0, 0.3, -0.15), M.rx(-0.42))));
    parts.push(ell(0.022, 0.05, 0.04, mul(L.tail, 1.08)).applyMatrix4(M.mul(M.t(0, 0.285, -0.135), M.rx(-0.7))));
  }
  // 腿根的「裤」（羽毛蓬着，盖住大腿）
  for (const s of [-1, 1]) parts.push(ell(0.03, 0.034, 0.04, mul(L.body, 0.96)).translate(s * 0.04, 0.14, 0.0));
  const bodyG = merge(parts).translate(0, -HIP, 0);

  // 头颈：原点在颈根（身子上的 NECK 处）。颈朝上略前，头在顶上
  const neckC = L.neck ?? L.body, nr = cock ? 0.036 : 0.031;
  const hp: Geo[] = [
    rod([V(0, -0.01, -0.01), V(0, 0.05, 0.022), V(0, 0.1, 0.034), V(0, 0.122, 0.04)], nr, nr * 0.62, neckC),
    ell(0.029, 0.029, 0.034, neckC).translate(0, 0.128, 0.048),
    beak(0.011, 0.034, OCHRE).applyMatrix4(M.mul(M.t(0, 0.122, 0.09), M.rx(0.22))),
    ell(0.006, 0.006, 0.004, tone(PIG.jiao, 2.6)).translate(0.024, 0.133, 0.058), ell(0.006, 0.006, 0.004, tone(PIG.jiao, 2.6)).translate(-0.024, 0.133, 0.058),
    // 肉垂
    ell(0.007, cock ? 0.022 : 0.012, 0.01, RED).translate(0, 0.098, 0.074),
  ];
  // 冠：公鸡的大，锯齿一样立着；母鸡的小
  const n = cock ? 5 : 3;
  for (let i = 0; i < n; i++) { const t = i / (n - 1), h = cock ? 0.026 + 0.012 * Math.sin(Math.PI * t) : 0.011; hp.push(ell(0.0065, h, 0.011, RED).translate(0, 0.152 + h * 0.55, 0.02 + t * (cock ? 0.055 : 0.03))); }
  if (cock) for (const s of [-1, 1]) hp.push(ell(0.016, 0.05, 0.03, neckC).applyMatrix4(M.mul(M.t(s * 0.018, 0.03, -0.012), M.rx(0.25))));   // 颈上披下来的金黄的蓑
  const head = merge(hp);

  // 翅：收着时贴在身侧朝后；原点在肩
  const wing = shadeBy(ell(0.02, 0.048, 0.088, L.wing, 8, 5).translate(0, -0.018, -0.07), (_x, y, z, o) => { const k = (z < -0.1 ? 0.82 : 1) * (L.bars && Math.sin(z * 120 + y * 30) > 0.3 ? 0.72 : 1); o[0] = L.wing[0] * k; o[1] = L.wing[1] * k; o[2] = L.wing[2] * k; });
  const wingR = wing.clone();
  // 腿：原点在髋，黄色的跖、三个朝前的趾和一个朝后的
  const lc = OCHRE, lg: Geo[] = [paint(cyl(0.0062, 0.0075, HIP, 5).translate(0, -HIP / 2, 0), lc)];
  for (const a of [-0.45, 0, 0.45]) lg.push(paint(box(0.007, 0.004, 0.045).translate(0, 0, 0.022).applyMatrix4(M.mul(M.t(0, -HIP + 0.003, 0.004), M.ry(a))), lc));
  lg.push(paint(box(0.006, 0.004, 0.022).translate(0, -HIP + 0.003, -0.012), lc));
  return { body: bodyG, head, wing, wingR, leg: merge(lg) };
}
/** 小鸡：一团绒，一个圆头，一点喙（一块） */
function chickGeo(c: RGB, back: RGB): Geo {
  const b = shadeBy(ell(0.04, 0.036, 0.048, c, 8, 6), (_x, y, _z, o) => { const k = y > 0.02 ? 1 : 0; o[0] = lerp(c[0], back[0], k); o[1] = lerp(c[1], back[1], k); o[2] = lerp(c[2], back[2], k); });
  return merge([b.translate(0, 0.045, 0), ell(0.026, 0.026, 0.027, c).translate(0, 0.088, 0.034), beak(0.006, 0.018, OCHRE).translate(0, 0.085, 0.064),
    ell(0.004, 0.004, 0.003, tone(PIG.jiao, 2.6)).translate(0.017, 0.093, 0.048), ell(0.004, 0.004, 0.003, tone(PIG.jiao, 2.6)).translate(-0.017, 0.093, 0.048),
    paint(cyl(0.004, 0.004, 0.03, 4).translate(0.016, 0.012, 0), OCHRE), paint(cyl(0.004, 0.004, 0.03, 4).translate(-0.016, 0.012, 0), OCHRE)]);
}

/** 鸡埘（自己的坐标：原点在地面正中，门洞朝 +z）。另有草窝里的蛋、盛糠的瓦盆与瓢 */
const COOP = { w: 1.0, d: 0.76, h: 0.62 };
/** 鸡埘的三样料：土坯墙（版筑的一道道）、草顶（干笔的草丝）、别的（里头的深色、跳板、草窝、瓦盆与瓢） */
function coopGeo(): { mud: Geo; thatch: Geo; other: Geo } {
  const mud = tone(PIG.tu, 1.25), thatch = tone(PIG.mao, 1.4), dark = tone(PIG.jiao, 2.8), wood = tone([0.78, 0.66, 0.54], 1.7), straw = tone([0.93, 0.85, 0.62], 1.3);
  const W = COOP.w, D = COOP.d, H = COOP.h, t = 0.075, gm: Geo[] = [], gt: Geo[] = [], go: Geo[] = [];
  // 土坯墙：手抹的，面上不平、棱角是圆的
  const wall = (w: number, h: number, d: number, x: number, y: number, z: number) => gm.push(mottle(paint(wobble(sbox(w, h, d, 0.1), 0.014, 6, Math.round(x * 70 + z * 30 + 5), 50), mud).translate(x, y, z), 0.16, x * 7 + z * 3));
  wall(W + 0.04, 0.08, D + 0.04, 0, 0.04, 0);
  wall(W, H, t, 0, H / 2, -D / 2 + t / 2);
  for (const sx of [-1, 1]) wall(t, H, D, sx * (W / 2 - t / 2), H / 2, 0);
  const ow = 0.42, oy0 = 0.08, oy1 = 0.4;
  for (const sx of [-1, 1]) wall((W - ow) / 2, H + 0.06, t, sx * (ow / 2 + (W - ow) / 4), (H + 0.06) / 2, D / 2 - t / 2);
  wall(ow, H + 0.06 - oy1, t, 0, (oy1 + H + 0.06) / 2, D / 2 - t / 2);
  // 里头深
  go.push(paint(box(W - 2 * t - 0.01, H - 0.1, 0.01), dark).translate(0, H / 2, -D / 2 + t + 0.006));
  for (const sx of [-1, 1]) go.push(paint(box(0.01, H - 0.1, D - 2 * t), dark).translate(sx * (W / 2 - t - 0.006), H / 2, 0));
  go.push(paint(box(W - 2 * t, 0.01, D - 2 * t), tone(PIG.jiao, 2.0)).translate(0, H - 0.04, 0));
  // 草顶：前高后低的一面坡，厚厚一层，四面出檐；檐口垂下一溜草
  gt.push(mottle(paint(wobble(sbox(W + 0.3, 0.13, D + 0.36, 0.08), 0.02, 5, 907, 50), thatch).applyMatrix4(M.mul(M.t(0, H + 0.1, 0.0), M.rx(0.16))), 0.12, 5));
  for (let i = 0; i < 9; i++) gt.push(paint(sbox(0.13 + 0.03 * (i % 3), 0.06, 0.05, 0.05), mul(thatch, 0.95)).applyMatrix4(M.mul(M.t(-W / 2 - 0.1 + (i * (W + 0.2)) / 8, H + 0.06, D / 2 + 0.2), M.rx(0.5))));
  // 门洞前一块斜搭的板；草窝
  go.push(paint(box(0.26, 0.018, 0.34), wood).applyMatrix4(M.mul(M.t(0, oy0 / 2 + 0.005, D / 2 + 0.15), M.rx(0.2))));
  go.push(mottle(paint(lathe([[0.001, 0], [0.13, 0], [0.165, 0.045], [0.15, 0.07], [0.1, 0.045], [0.001, 0.035]], 12), straw).translate(0.05, 0.08, D / 2 - 0.22), 0.15, 8));
  return { mud: merge(gm), thatch: merge(gt), other: merge(go) };
}
function basinGeo(): Geo {
  const clay = tone([0.82, 0.68, 0.58], 1.6), bran = tone([0.94, 0.86, 0.66], 1.25), gourd = tone([0.93, 0.84, 0.6], 1.45);
  return merge([
    paint(lathe([[0.001, 0], [0.13, 0], [0.19, 0.09], [0.205, 0.13], [0.19, 0.13], [0.17, 0.095], [0.001, 0.09]], 14), clay),
    mottle(paint(cyl(0.175, 0.175, 0.012, 14), bran).translate(0, 0.104, 0), 0.2, 3),
    // 瓢：半只葫芦，柄搭在盆沿上
    paint(lathe([[0.001, -0.05], [0.05, -0.04], [0.07, -0.01], [0.072, 0.005], [0.001, 0.0]], 10), gourd).applyMatrix4(M.mul(M.t(-0.04, 0.13, 0.02), M.rz(0.25))),
    rod([V(0.02, 0.13, 0.02), V(0.12, 0.15, 0.03), V(0.2, 0.15, 0.04)], 0.012, 0.009, gourd),
  ]);
}
const EGG: RGB = [0.97, 0.93, 0.85];

// ———————————————————————— 行为 ————————————————————————
const enum S { Idle, Walk, Forage, Peck, Preen, Stretch, Dust, Rest, Flee, Flap, Crow, Tidbit, Chase, Feed, Shelter, Home, Inside, Stray, Held, Lay, Hide }
interface Bird {
  i: number; kind: 0 | 1 | 2; flock: number; k: number[]; s: number;
  x: number; z: number; yaw: number; v: number; tx: number; tz: number; speed: number;
  st: S; t: number; sub: number; n: number;
  // 姿态（平滑的）
  pk: number; pkT: number; nyaw: number; nyawG: number; nroll: number; crouch: number; fluff: number; wing: number; wingG: number; flap: number; ph: number; scr: number; scrT: number; lean: number; tuck: number; hop: number;
  bold: number; lazy: number; mum: Bird | null; foe: Bird | null; layAt: number;
}
interface Flock {
  id: 'home' | 'a' | 'b'; birds: Bird[];
  /** 散着觅食的那一片里随便挑一处 */
  roam(R: () => number): [number, number];
  cx: number; cz: number;
  /** 夜里回哪（走到那里不见）；下雨躲哪 */
  roost: [number, number]; shelter: Array<[number, number]>;
  out: boolean; alarm: number; seen: boolean; dist: number;
}
const _b = new THREE.Matrix4(), _m = new THREE.Matrix4(), _y = new THREE.Matrix4(), _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class Hens implements HensApi {
  parts: Parts;
  /** 鸡埘、瓦盆（不动的几样） */
  group = new THREE.Group();
  private flocks: Flock[] = [];
  private R = mulberry32(88);
  private nextCrow = 3; private nextCluck = 6;
  /** 地上撒的食：位置、还剩几粒 */
  private food: Array<{ x: number; z: number; n: number; r: number; k: number[]; age: number }> = [];
  private grainK: number[] = [];
  private eggK: number[] = [];
  /** 鸡埘（世界坐标）：门洞前那一点、里头草窝、瓦盆 */
  coop = { x: 0, z: 0, yaw: 0, door: { x: 0, z: 0 }, nest: new THREE.Vector3(), basin: new THREE.Vector3(), ok: false };
  /** 门洞里头一点：进埘的走完斜板到这里才不见，出埘的从这里出来 */
  private inner: [number, number] = [0, 0];
  /** 今天这窝下几个、已经下了几个、拿走了几个（由「捡蛋」那件事从存档里给，按钟点算） */
  lay = { day: -1, n: 0, laid: 0, taken: 0, hours: [7.4, 8.3, 9.4] };
  /** 下了一个蛋（给存档） */
  onLaid: ((laid: number) => void) | null = null;
  onHome: (() => void) | null = null;
  private strayB: Bird | null = null;
  private strayAt = { x: 0, z: 0 };
  private held: THREE.Object3D | null = null;
  lost: StrayHen;
  private lostState: StrayHen['state'] = 'none';
  private lostPos = new THREE.Vector3();

  constructor() {
    const P = (this.parts = new Parts(creatureMat({ body: 0.5, shade: 1.42 }), 'hens'));
    const looks: HenLook[] = [
      { body: tone([0.88, 0.79, 0.66], 1.3), wing: tone([0.82, 0.71, 0.58], 1.4), tail: tone(PIG.jiao, 1.6) },              // 麻
      { body: [0.95, 0.94, 0.9], wing: [0.9, 0.89, 0.85], tail: [0.86, 0.85, 0.82] },                                        // 白
      { body: tone(PIG.mo, 2.3), wing: tone(PIG.mo, 2.6), tail: tone(PIG.jiao, 2.6), neck: tone([0.7, 0.66, 0.6], 1.9) },    // 黑
      { body: tone([0.94, 0.87, 0.7], 1.22), wing: tone([0.9, 0.8, 0.62], 1.32), tail: tone([0.74, 0.64, 0.52], 1.7) },   // 黄
      { body: tone([0.84, 0.64, 0.52], 1.45), wing: tone([0.8, 0.6, 0.48], 1.55), tail: tone([0.52, 0.57, 0.6], 2.5), neck: tone([0.94, 0.8, 0.56], 1.3), breast: tone(PIG.jiao, 1.9), cock: true },
      { body: tone([0.88, 0.88, 0.86], 1.3), wing: tone([0.84, 0.84, 0.82], 1.4), tail: tone(PIG.mo, 2.0), bars: true },                // 芦花（乙家那只爱乱跑的）
    ];
    const geos = looks.map((L, i) => henGeo(L, i + 3));
    const chicks = [chickGeo(tone(PIG.huang, 0.72), tone(PIG.huang, 0.85)), chickGeo(tone([0.9, 0.8, 0.62], 1.2), tone([0.66, 0.55, 0.45], 1.6))];
    const R = this.R;
    const mk = (flock: number, kind: 0 | 1 | 2, look: number, mum: Bird | null = null): Bird => {
      const g = geos[look], s = kind === 1 ? 1.16 : kind === 2 ? 1 : 0.95 + 0.1 * R();
      const b: Bird = {
        i: 0, kind, flock, k: kind === 2 ? [P.add(chicks[look % 2])] : [P.add(g.body), P.add(g.head), P.add(g.wing), P.add(g.wingR), P.add(g.leg), P.add(g.leg)], s,
        x: 0, z: 0, yaw: R() * 6.28, v: 0, tx: 0, tz: 0, speed: 0, st: S.Idle, t: R() * 3, sub: 0, n: 0,
        pk: 0, pkT: -1, nyaw: 0, nyawG: 0, nroll: 0, crouch: 0, fluff: 0, wing: 0, wingG: 0, flap: 0, ph: R() * 6, scr: 0, scrT: -1, lean: 0, tuck: 0, hop: 0,
        bold: R(), lazy: R(), mum, foe: null, layAt: -1,
      };
      return b;
    };
    // —— 三群 ——
    const yard = (R2: () => number): [number, number] => R2() < 0.75 ? [6.9 + R2() * 6.5, -4.6 + R2() * 7.8] : [6.0 + R2() * 2.0, 3.6 + R2() * 5.4];
    const front = (id: 'a' | 'b', home: { x: number; z: number; yaw: number }) => (R2: () => number): [number, number] => {
      const lx = (R2() - 0.5) * 8, lz = -1.2 + R2() * 5.4, c = Math.cos(home.yaw), s = Math.sin(home.yaw);
      void id;
      return [home.x + lx * c + lz * s, home.z - lx * s + lz * c];
    };
    const hA = SITE.houses.find((h) => h.id === 'a')!, hB = SITE.houses.find((h) => h.id === 'b')!;
    const side = (id: string, w: number): [number, number] => { const p = atHouse(id, -w / 2 - 0.9, 0.2); return [p.x, p.z]; };
    const eave = (id: string, d: number): Array<[number, number]> => [-1.6, -0.6, 0.6, 1.6, 2.4].map((lx) => { const p = atHouse(id, lx + 1.6, d / 2 + 0.55); return [p.x, p.z] as [number, number]; });
    this.flocks.push({ id: 'home', birds: [], roam: yard, cx: 10.4, cz: -0.6, roost: [0, 0], shelter: [], out: true, alarm: 0, seen: false, dist: 1e9 });
    this.flocks.push({ id: 'a', birds: [], roam: front('a', COOPS[0]), cx: COOPS[0].x, cz: COOPS[0].z, roost: side('a', hA.w), shelter: eave('a', hA.d), out: true, alarm: 0, seen: false, dist: 1e9 });
    this.flocks.push({ id: 'b', birds: [], roam: front('b', COOPS[1]), cx: COOPS[1].x, cz: COOPS[1].z, roost: side('b', hB.w), shelter: eave('b', hB.d), out: true, alarm: 0, seen: false, dist: 1e9 });
    const F = this.flocks;
    F[0].birds.push(mk(0, 0, 0), mk(0, 0, 1), mk(0, 0, 3));
    F[1].birds.push(mk(1, 1, 4), mk(1, 0, 0), mk(1, 0, 1));
    const mum = mk(1, 0, 3); F[1].birds.push(mum);
    for (let i = 0; i < 4; i++) F[1].birds.push(mk(1, 2, i % 2, mum));
    F[2].birds.push(mk(2, 0, 0), mk(2, 0, 1), mk(2, 0, 2), mk(2, 0, 5));
    let n = 0;
    for (const f of F) for (const b of f.birds) { b.i = n++; [b.x, b.z] = f.roam(R); for (let k = 0; k < 8 && blocked(b.x, b.z, 'ground', 0.16); k++) [b.x, b.z] = f.roam(R); b.tx = b.x; b.tz = b.z; }
    // —— 鸡埘、蛋、瓦盆、撒在地上的食 ——
    this.placeCoop();
    const C = this.coop, cg = coopGeo(), bg = basinGeo();
    // 鸡埘、瓦盆不动：各用各的画法（土墙有版筑的一道道、草顶有草丝），摆一次就不再动
    const place = (g: Geo, x: number, z: number, yaw: number) => g.applyMatrix4(trs(new THREE.Matrix4(), x, footY(x, z), z, yaw));
    const mudM = new THREE.Mesh(place(cg.mud, C.x, C.z, C.yaw), wash({ pig: [1, 1, 1], dens: 1, shade: 1.45, grain: 1.0, strata: [9, 0.35] }));
    const thatchM = new THREE.Mesh(place(cg.thatch, C.x, C.z, C.yaw), wash({ pig: [1, 1, 1], dens: 1, shade: 1.5, grain: 1.6, streak: [3, 40, 0.45] }));
    for (const m of [mudM, thatchM]) { m.name = 'coop'; this.group.add(m); }
    // 里头的深色、跳板、草窝、瓦盆与瓢：与鸡同一块（摆一次）
    const ok = P.add(cg.other), bk = P.add(bg);
    for (let i = 0; i < 3; i++) this.eggK.push(P.add(ell(0.021, 0.027, 0.021, EGG, 7, 5)));
    const grain = ell(0.006, 0.004, 0.008, tone([0.95, 0.86, 0.6], 1.2), 4, 3);
    for (let i = 0; i < 24; i++) this.grainK.push(P.add(grain));
    P.build();
    // 不动的几样摆一次就不再动
    P.place(ok, trs(_m, C.x, footY(C.x, C.z), C.z, C.yaw));
    P.place(bk, trs(_m, C.basin.x, footY(C.basin.x, C.basin.z), C.basin.z, C.yaw + 0.6));
    for (const k of this.eggK) P.hide(k);
    for (const k of this.grainK) P.hide(k);
    // 抱窝的、小鸡
    const self = this;
    this.lost = { get state() { return self.lostState; }, get pos() { return self.lostPos; }, get home() { return { x: COOPS[1].x, z: COOPS[1].z }; } };
  }

  /** 鸡埘摆在院子东北角、东厢北边，门朝西；那里若被别的东西占了，往南北挪一挪 */
  private placeCoop() {
    const C = this.coop, yaw = -Math.PI / 2;
    // 后墙离东篱半米：篱脚那一线野草（花木那一路的 cover.ts，篱内 0.18–0.4 米）长在鸡埘背后，不钻进埘里
    const x = SITE.yard.x1 - 0.5 - COOP.d / 2;
    for (const z of [-1.6, -0.6, -2.6, 0.4, -3.6]) {
      // 鸡埘占的那一块（篱笆不算）、门洞前、瓦盆那里都要空着
      if ([-0.45, 0, 0.45].some((dz) => blocked(x - 0.08, z + dz, 'ground', 0.22)) || blocked(x - 1.2, z, 'ground', 0.3) || blocked(x - 0.15, z + 1.75, 'ground', 0.25)) continue;
      C.x = x; C.z = z; C.yaw = yaw; C.ok = true; break;
    }
    if (!C.ok) { C.x = SITE.yard.x1 - 0.6; C.z = -1.6; C.yaw = yaw; }
    const fx = Math.sin(C.yaw), fz = Math.cos(C.yaw);
    C.door.x = C.x + fx * (COOP.d / 2 + 0.42); C.door.z = C.z + fz * (COOP.d / 2 + 0.42);
    // 草窝在门洞里头（coopGeo 里：x 0.05，z D/2 − 0.22，高 0.07）
    const nl = { x: 0.05, z: COOP.d / 2 - 0.22 }, c = Math.cos(C.yaw), s = Math.sin(C.yaw);
    C.nest.set(C.x + nl.x * c + nl.z * s, footY(C.x, C.z) + 0.1, C.z - nl.x * s + nl.z * c);
    C.basin.set(C.x - 0.15, 0, C.z + 1.75); C.basin.y = footY(C.basin.x, C.basin.z);
    // 进埘：走到门洞前那一点就算进去了（鸡埘本身是挡路的，别让它往墙里钻）
    this.flocks[0].roost = [C.door.x - fx * 0.1, C.door.z - fz * 0.1];
    this.inner = [C.x + fx * (COOP.d / 2 - 0.14), C.z + fz * (COOP.d / 2 - 0.14)];
    this.flocks[0].shelter = [[C.door.x, C.door.z]];
    addOBox(C.x, C.z, COOP.d + 0.1, COOP.w + 0.1, C.yaw + Math.PI / 2);
    addOBox(C.basin.x, C.basin.z, 0.42, 0.42, 0);
  }

  // —— 给别处用的 ——
  /** 撒一把食：附近的鸡围过来抢 */
  scatter(x: number, z: number, n = 14) {
    const r = 0.45, ks: number[] = [];
    for (let i = 0; i < Math.min(8, this.grainK.length); i++) { const k = this.grainK.pop(); if (k != null) ks.push(k); }
    const f = { x, z, n, r, k: ks, age: 0 };
    for (let i = 0; i < ks.length; i++) { const a = this.R() * 6.28, d = Math.sqrt(this.R()) * r; this.parts.place(ks[i], trs(_m, x + Math.cos(a) * d, footY(x, z) + 0.004, z + Math.sin(a) * d, this.R() * 3)); }
    this.food.push(f);
    for (const fl of this.flocks) for (const b of fl.birds) {
      if (b.st === S.Inside || b.st === S.Held || b.st === S.Hide || b.st === S.Stray || b.st === S.Home || (b.st === S.Feed && b.n !== -1)) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < 16) { b.st = S.Feed; b.t = 8 + 6 * this.R(); b.tx = x + (this.R() - 0.5) * r * 2; b.tz = z + (this.R() - 0.5) * r * 2; b.speed = d > 3 ? 1.6 : 0.8; b.n = 0; }
    }
  }
  /** 地上还有几处食、几粒 */
  get grains() { let n = 0; for (const f of this.food) n += f.n; return n; }
  /** 托事：乙家的一只母鸡走散 */
  stray(x?: number, z?: number): { x: number; z: number } {
    const fl = this.flocks[2], b = fl.birds[3];
    const spots: Array<[number, number]> = [[-21.5, 24.5], [-24, -22], [88, 46.5], [36.5, 27.6], [64, 26.4]];
    const p = x != null && z != null ? [x, z] : spots[Math.floor(this.R() * spots.length)];
    this.strayB = b; this.strayAt.x = p[0]; this.strayAt.z = p[1];
    b.st = S.Stray; b.t = 0; b.x = p[0] + 1.2; b.z = p[1]; b.tx = p[0]; b.tz = p[1];
    this.lostState = 'wander';
    this.lostPos.set(b.x, footY(b.x, b.z), b.z);
    return { x: p[0], z: p[1] };
  }
  /** 抱起那只走散的鸡：hand 是挂在行者身上的一点（每帧跟着它）；给 null 放下（放在那一点的脚下） */
  carry(hand: THREE.Object3D | null) {
    const b = this.strayB;
    if (!b) return;
    if (hand) { this.held = hand; b.st = S.Held; this.lostState = 'held'; return; }
    const h = this.held;
    this.held = null;
    if (h) { h.getWorldPosition(_v); b.x = _v.x; b.z = _v.z; }
    const home = this.lost.home;
    // 放在乙家门前那一片里：回群；别处：又溜达开
    if (Math.hypot(b.x - home.x, b.z - home.z) < 7) { b.st = S.Flap; b.t = 0.9; b.flock = 2; this.lostState = 'back'; this.strayB = null; this.onHome?.(); }
    else { b.st = S.Stray; b.t = 0; this.strayAt.x = b.x; this.strayAt.z = b.z; this.lostState = 'wander'; }
  }
  /** 那只走散的鸡（抱鸡那件事用：她在哪、蹲没蹲下） */
  strayBird(): { x: number; z: number; yaw: number; crouch: number } | null { const b = this.strayB; return b ? b : null; }
  /** 让走散的那只蹲下（人伸手抱她时，母鸡多半就地一蹲） */
  squat(on: boolean) { const b = this.strayB; if (b && b.st === S.Stray) b.sub = on ? 1 : 0; }
  /** 新的一天：今天下 n 个（下蛋的钟点各不同），已下 laid、已拿 taken（从存档来） */
  newLay(day: number, n: number, laid = 0, taken = 0) {
    const R = mulberry32(day * 7919 + 13), L = this.lay;
    L.day = day; L.n = Math.max(0, Math.min(3, n)); L.laid = Math.min(L.n, laid); L.taken = Math.min(L.laid, taken);
    L.hours = [6.9 + R() * 0.6, 7.9 + R() * 0.7, 9.0 + R() * 0.9];
    for (const b of this.flocks[0].birds) b.layAt = -1;
    // 已经下过的那几只不再进去
    for (let i = 0; i < L.laid; i++) { const b = this.flocks[0].birds[i]; if (b) b.layAt = i; }
    this.showEggs();
  }
  /** 自家鸡埘里此刻有几个蛋 */
  get eggs() { return Math.max(0, this.lay.laid - this.lay.taken); }
  /** 拿走一个（返回还剩几个） */
  takeEgg(): number { if (this.eggs > 0) this.lay.taken++; this.showEggs(); return this.eggs; }
  /** 蛋在哪（世界坐标）：第 i 个 */
  eggPos(i: number, out = new THREE.Vector3()) { const C = this.coop, a = i * 2.1 + 0.4, r = i === 0 ? 0.02 : 0.055; return out.set(C.nest.x + Math.cos(a) * r, C.nest.y + 0.012, C.nest.z + Math.sin(a) * r); }
  private showEggs() {
    const n = Math.min(3, this.eggs);
    for (let i = 0; i < 3; i++) {
      if (i < n) { this.eggPos(i, _v); this.parts.place(this.eggK[i], trs(_m, _v.x, _v.y, _v.z, i, 1.2 + i * 0.3, 0.2)); }
      else this.parts.hide(this.eggK[i]);
    }
  }
  /** 自家那三只（看鸡、喂鸡用） */
  homeBirds(): Array<{ x: number; z: number; st: number }> { return this.flocks[0].birds; }
  /** 第 i 只（三群连着数）此刻在外头走着的话，它在哪（雪地脚印用） */
  birdAt(i: number): { x: number; z: number } | null { let n = 0; for (const f of this.flocks) for (const b of f.birds) { if (n++ === i) return b.st !== S.Inside && b.st !== S.Hide && b.st !== S.Held && b.kind !== 2 ? b : null; } return null; }
  get birdCount() { let n = 0; for (const f of this.flocks) n += f.birds.length; return n; }
  /** 某一处附近有几只在外头 */
  near(x: number, z: number, r: number): number { let n = 0; for (const f of this.flocks) for (const b of f.birds) if (b.st !== S.Inside && b.st !== S.Hide && Math.hypot(b.x - x, b.z - z) < r) n++; return n; }

  // ———————————————————————— 每帧 ————————————————————————
  update(c: Ctx, day: Day, pv: number, feedAt: { x: number; z: number } | null) {
    const P = this.parts, R = this.R;
    const { sr, ss } = day;
    // 出、回：清早天亮前后出来，黄昏回去；大雨大雪天不出
    const outHours = c.hour > sr - 0.45 && c.hour < ss + 0.25;
    // 下蛋：按钟点算今天下到第几个了（时辰被一下子拨过去也对得上）
    const L = this.lay;
    if (L.day >= 0) {
      let laid = 0;
      for (let i = 0; i < L.n; i++) if (c.hour >= L.hours[i]) laid++;
      if (laid > L.laid) {
        const was = L.laid; L.laid = laid;
        if (!c.wound && laid === was + 1) { const C = this.coop; c.sfx('cackle', C.x, C.z, 0.7); }
        this.onLaid?.(laid);
      }
    }
    if (c.frame % 30 === 0 || c.wound) this.showEggs();
    // 没人吃的食，过一阵就不见了（被风吹散、被雀叼走）
    for (let i = this.food.length - 1; i >= 0; i--) { const fd = this.food[i]; fd.age += c.dt; if (fd.age > 90) { for (const k of fd.k) { this.parts.hide(k); this.grainK.push(k); } this.food.splice(i, 1); } }
    // 鸡鸣：天亮前后，公鸡伸长了脖子朝天叫
    const cock = this.flocks[1].birds[0];
    this.nextCrow -= c.dt;
    if (c.hour > sr - 0.7 && c.hour < sr + 0.8 && this.nextCrow < 0 && cock.st !== S.Inside) { this.nextCrow = 16 + R() * 16; if (cock.st !== S.Flee) { cock.st = S.Flap; cock.t = 1.0; cock.sub = 1; } }
    this.nextCluck -= c.dt;
    let anyShown = false;
    for (const f of this.flocks) {
      f.dist = camDist(c, f.cx, f.cz);
      f.out = outHours && (f.id === 'home' ? c.rain < 0.55 && c.snow < 0.7 : c.rain < 0.6 && c.snow < 0.75);
      const far = f.dist > 150;
      f.alarm -= c.dt;
      if (far && !(f.id === 'b' && this.strayB)) {
        // 远了：不画、不动；时辰对上了就直接到位
        for (const b of f.birds) { if (!P.hidden(b.k[0])) for (const k of b.k) P.hide(k); this.snapState(b, f, c); }
        continue;
      }
      if (this.nextCluck < 0 && f.dist < 40) { this.nextCluck = 7 + R() * 12; const b = f.birds[Math.floor(R() * f.birds.length)]; if (b.st !== S.Inside && b.st !== S.Hide) c.sfx(b.kind === 2 ? 'chick' : 'hen', b.x, b.z, 0.25 + 0.3 * R()); }
      const stride = f.dist < 30 ? 1 : f.dist < 70 ? 2 : 4;
      if (c.frame % stride && !c.wound) { anyShown = true; continue; }
      const dt = Math.min(0.25, c.dt * stride);
      for (const b of f.birds) {
        if (c.wound) this.snapState(b, f, c);
        this.think(b, f, c, dt, pv, feedAt, day);
        this.pose(b, c, dt);
        anyShown = true;
      }
    }
    // 托事那只（在别处时也要动）
    const sb = this.strayB;
    if (sb) { this.lostPos.set(sb.x, footY(sb.x, sb.z), sb.z); }
    P.mesh.visible = anyShown || this.food.length > 0 || camDist(c, this.coop.x, this.coop.z) < 120;
    P.commit();
  }

  /** 没人看着、时辰一下子拨过去时：直接到该在的地方 */
  private snapState(b: Bird, f: Flock, c: Ctx) {
    if (b.st === S.Stray || b.st === S.Held) return;
    if (!f.out) { if (b.st !== S.Inside) { b.st = S.Inside; [b.x, b.z] = f.roost; } }
    else if (b.st === S.Inside || b.st === S.Home || b.st === S.Shelter) { b.st = S.Idle; b.t = this.R() * 2; [b.x, b.z] = this.free(f); b.tx = b.x; b.tz = b.z; }
    void c;
  }

  /** 挑下一件事 */
  private choose(b: Bird, f: Flock, c: Ctx, day: Day) {
    const R = this.R, r = R();
    const leader = f.id === 'a' ? f.birds[0] : null;
    b.n = 0; b.sub = 0;
    if (b.kind === 2 && b.mum) {
      // 小鸡：跟着妈妈，在她脚边啄
      const m = b.mum;
      if (Math.hypot(m.x - b.x, m.z - b.z) > 0.5 || r < 0.5) { b.st = S.Walk; b.tx = m.x + (R() - 0.5) * 0.7; b.tz = m.z + (R() - 0.5) * 0.7; b.speed = 0.5; b.t = 3; }
      else { b.st = S.Peck; b.t = 0.6 + R() * 1.4; }
      return;
    }
    const noon = c.hour > 11.6 && c.hour < 13.4, sunny = day.fine && c.hour > 12.5 && c.hour < 16 && c.season !== 'winter' && c.rain < 0.1;
    // 自家母鸡上午下蛋：轮到她了就钻进埘里
    if (f.id === 'home' && this.lay.day >= 0) {
      const L = this.lay, i = f.birds.indexOf(b);
      if (i < L.n && c.hour > L.hours[i] - 0.14 && c.hour < L.hours[i] - 0.01 && b.layAt !== i) { b.layAt = i; b.st = S.Lay; b.tx = f.roost[0]; b.tz = f.roost[1]; b.speed = 0.45; b.t = 30; return; }
    }
    if (noon && r < 0.35 + 0.4 * b.lazy) { b.st = S.Rest; b.t = 8 + R() * 16; return; }
    if (sunny && r < 0.08) { b.st = S.Dust; b.t = 7 + R() * 7; return; }
    if (r < 0.42) { b.st = S.Forage; b.t = 3 + R() * 4; b.scrT = 0; b.n = 2 + Math.floor(R() * 3); return; }
    if (r < 0.62) {
      b.st = S.Walk; b.speed = 0.28 + 0.12 * R(); b.t = 6;
      if (leader && leader !== b && R() < 0.75) { b.tx = leader.x + (R() - 0.5) * 3; b.tz = leader.z + (R() - 0.5) * 3; }
      else [b.tx, b.tz] = this.free(f);
      if (!this.clear(b.x, b.z, b.tx, b.tz)) { b.st = S.Idle; b.t = 1; }
      return;
    }
    if (r < 0.72) { b.st = S.Peck; b.t = 1 + R() * 2.5; return; }
    if (r < 0.8) { b.st = S.Preen; b.t = 2.5 + R() * 3; b.sub = R() < 0.5 ? 1 : -1; return; }
    if (r < 0.84) { b.st = S.Stretch; b.t = 2.2; b.sub = R() < 0.5 ? 1 : -1; return; }
    if (r < 0.87) { b.st = S.Flap; b.t = 0.9; return; }
    if (b.kind === 1 && r < 0.93) { b.st = S.Tidbit; b.t = 3.2; return; }
    if (r < 0.95 && b.kind === 0) {
      // 啄一下旁边的那只（争）：被啄的跳开
      let foe: Bird | null = null, bd = 1.2;
      for (const o of f.birds) if (o !== b && o.kind === 0 && o.st !== S.Inside) { const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < bd) { bd = d; foe = o; } }
      if (foe) { b.st = S.Chase; b.foe = foe; b.t = 1.4; b.speed = 0.9; return; }
    }
    b.st = S.Idle; b.t = 1 + R() * 2.5;
  }
  /** 在这一群散着觅食的那一片里挑一处空地（别人在院里添的畦、柴垛、水缸都绕开） */
  private free(f: Flock): [number, number] {
    let p = f.roam(this.R);
    for (let i = 0; i < 8 && blocked(p[0], p[1], 'ground', 0.16); i++) p = f.roam(this.R);
    return p;
  }
  /** 从 a 直着到 b 走不走得过去（看三处） */
  private clear(ax: number, az: number, bx: number, bz: number): boolean {
    for (const k of [0.25, 0.5, 0.75, 1]) if (blocked(lerp(ax, bx, k), lerp(az, bz, k), 'ground', 0.12)) return false;
    return true;
  }
  /** 朝目标走一步；到了返回 true */
  private walk(b: Bird, dt: number, speed: number, turn = 7): boolean {
    const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { b.v = Math.max(0, b.v - dt * 3); return true; }
    const goal = Math.atan2(dx, dz), off = wrap(goal - b.yaw);
    b.yaw = turnTo(b.yaw, goal, turn, dt);
    const want = speed * Math.max(0.15, Math.cos(off)) * Math.min(1, 0.35 + d * 1.5);
    b.v += (want - b.v) * Math.min(1, dt * 8);
    b.x += Math.sin(b.yaw) * b.v * dt; b.z += Math.cos(b.yaw) * b.v * dt;
    return false;
  }

  private think(b: Bird, f: Flock, c: Ctx, dt: number, pv: number, feedAt: { x: number; z: number } | null, day: Day) {
    const R = this.R;
    b.t -= dt;
    if (b.st === S.Held) { this.heldPose(b); return; }
    if (b.st === S.Hide) {
      // 小鸡钻在妈妈翅膀底下：过一会儿探出来
      if (b.t < 0) { b.st = S.Walk; b.speed = 0.5; b.t = 2; if (b.mum) { b.x = b.mum.x; b.z = b.mum.z; b.tx = b.x + (R() - 0.5) * 0.6; b.tz = b.z + (R() - 0.5) * 0.6; } }
      return;
    }
    if (b.st === S.Inside) {
      // 在埘里 / 屋后：天亮了、雨停了出来（进去下蛋的，等下完）
      const laying = f.id === 'home' && b.layAt >= 0 && b.layAt < this.lay.n && c.hour < this.lay.hours[b.layAt];
      const dry = f.id !== 'home' || (c.rain < 0.3 && c.snow < 0.5);
      if (f.out && dry && !laying) {
        if (b.t < 0 && f.id === 'home') {
          // 从门洞里出来，顺着斜板下到门前一两步远的地方，再散开
          const C = this.coop, fx = Math.sin(C.yaw), fz = Math.cos(C.yaw), l = (R() - 0.5) * 0.6;
          b.st = S.Walk; [b.x, b.z] = this.inner; b.tx = C.door.x + fx * 0.5 + fz * l; b.tz = C.door.z + fz * 0.5 - fx * l; b.yaw = C.yaw; b.speed = 0.32; b.t = 6; b.wingG = 0;
        }
        else if (b.t < 0) { b.st = S.Walk; [b.x, b.z] = f.roost; [b.tx, b.tz] = this.free(f); b.speed = 0.4; b.t = 6; b.wingG = 0; if (b.kind !== 2 && R() < 0.5) { b.st = S.Flap; b.t = 0.8; } }
      } else if (b.t < 0) b.t = 0.5 + R() * 2;
      return;
    }
    const pdx = b.x - c.player.x, pdz = b.z - c.player.z, pd = Math.hypot(pdx, pdz);
    // 走散的那只：在那一处附近转悠，不回家；人跑近了扑腾着躲开几步
    if (b.st === S.Stray) {
      if (pd < 3.5 && pv > 2.2 && b.sub === 0) { this.fleeFrom(b, pdx, pdz, pd, 2.2); b.st = S.Stray; }
      if (b.sub === 1) { b.v = 0; b.crouch += (1 - b.crouch) * Math.min(1, dt * 5); return; }
      if (b.t < 0) { b.t = 2 + R() * 3; const a = R() * 6.28, rr = R() * 1.8; b.tx = this.strayAt.x + Math.cos(a) * rr; b.tz = this.strayAt.z + Math.sin(a) * rr; b.n = R() < 0.6 ? 1 : 0; }
      if (this.walk(b, dt, 0.3) && b.n) { b.pkT = b.pkT < 0 ? 0 : b.pkT; }
      this.peckTick(b, dt, 0.7);
      return;
    }
    // —— 人：慢慢走近只让开几步；跑过来就惊散 ——
    const scare = 1.25 + 0.7 * (1 - b.bold) + (b.kind === 2 ? 0.4 : 0);
    if (b.st !== S.Flee && b.st !== S.Home && b.st !== S.Lay) {
      if (pv > 2.2 && pd < 4.5) {
        this.fleeFrom(b, pdx, pdz, pd, 2.6 + R());
        if (f.alarm < 0) { f.alarm = 2.5; c.sfx('flap', b.x, b.z, 0.6); c.sfx('hen', b.x, b.z, 0.65); }
        // 抱窝的母鸡：张开翅膀，小鸡钻到底下
        if (f.id === 'a') for (const o of f.birds) if (o.kind === 2 && o.mum) { o.st = S.Hide; o.t = 3 + R() * 2; }
      } else if (pd < scare && b.st !== S.Feed) {
        // 让开：朝人走的方向的一侧挪开
        const side = (pdx * Math.cos(b.yaw) - pdz * Math.sin(b.yaw)) > 0 ? 1 : -1;
        const ax = pdx / (pd || 1), az = pdz / (pd || 1), px = -az * side, pz = ax * side;
        b.tx = b.x + (ax * 0.8 + px * 0.9) * 1.6; b.tz = b.z + (az * 0.8 + pz * 0.9) * 1.6;
        if (!blocked(b.tx, b.tz, 'ground', 0.1)) { b.st = S.Walk; b.speed = b.kind === 2 ? 0.7 : 0.62; b.t = 2.5; }
      }
    }
    // —— 天时 ——
    if (!f.out && b.st !== S.Home) { b.st = S.Home; [b.tx, b.tz] = f.roost; b.speed = b.kind === 2 ? 0.55 : 0.45; b.t = 60; }
    else if (f.out && (c.rain > 0.3 || c.snow > 0.5) && b.st !== S.Shelter && b.st !== S.Flee && f.shelter.length && f.id !== 'home') {
      b.st = S.Shelter; const s = f.shelter[b.i % f.shelter.length]; b.tx = s[0] + (R() - 0.5) * 0.4; b.tz = s[1] + (R() - 0.5) * 0.3; b.speed = 0.75; b.t = 30;
    } else if (f.out && f.id === 'home' && (c.rain > 0.3 || c.snow > 0.5) && b.st !== S.Home) { b.st = S.Home; [b.tx, b.tz] = f.roost; b.speed = 0.7; b.t = 60; }
    // 乙家门前有人在喂
    if (f.id === 'b' && feedAt && b.st !== S.Feed && b.st !== S.Flee && b.st !== S.Home && b.st !== S.Shelter) { b.st = S.Feed; b.t = 6 + R() * 4; b.tx = feedAt.x + (R() - 0.5) * 1.2; b.tz = feedAt.z + (R() - 0.5) * 1.2; b.speed = 1.0; b.n = -1; }

    switch (b.st) {
      case S.Idle:
        b.v = Math.max(0, b.v - dt * 3);
        // 东张西望：头一下一下地转，有时歪着头看
        if (R() < dt * 1.2) { b.nyawG = (R() - 0.5) * 1.6; b.nroll = R() < 0.3 ? (R() - 0.5) * 0.9 : 0; }
        if (b.t < 0) this.choose(b, f, c, day);
        break;
      case S.Walk: case S.Lay: case S.Home: case S.Shelter: {
        // 自家的鸡要进埘，人正在埘门前（捡蛋、看）：在一步开外站住，转过头看人，人走开了再进去
        if (f.id === 'home' && (b.st === S.Home || b.st === S.Lay) && Math.hypot(c.player.x - this.coop.door.x, c.player.z - this.coop.door.z) < 1.1 && pd < 1.5) {
          b.v = Math.max(0, b.v - dt * 3); b.t = Math.max(b.t, 1);
          b.yaw = turnTo(b.yaw, Math.atan2(-pdx, -pdz), 3, dt);
          break;
        }
        const arrived = this.walk(b, dt, b.speed);
        b.nyawG = 0;
        if (b.st === S.Walk && (arrived || b.t < 0)) this.choose(b, f, c, day);
        else if ((b.st === S.Home || b.st === S.Lay) && arrived && f.id === 'home' && b.tx === f.roost[0] && b.tz === f.roost[1]) { [b.tx, b.tz] = this.inner; b.speed = 0.3; }
        else if ((b.st === S.Home || b.st === S.Lay) && (arrived || b.t < 0)) { b.st = S.Inside; b.t = 2 + R() * 3; b.v = 0; for (const k of b.k) this.parts.hide(k); return; }
        else if (b.st === S.Shelter && arrived) { b.v = 0; b.fluff += (1 - b.fluff) * Math.min(1, dt * 2); if (c.rain < 0.15 && c.snow < 0.3) { b.st = S.Idle; b.t = 1; } }
        break;
      }
      case S.Forage: {
        // 刨：两脚轮着往后一蹬，退一步，低头啄刨开的地方
        b.v = Math.max(0, b.v - dt * 4);
        if (b.scrT >= 0) {
          b.scrT += dt;
          if (b.scrT > 0.85) { b.scrT = -1; b.pkT = 0; b.sub = 2 + Math.floor(R() * 3); const bx = b.x - Math.sin(b.yaw) * 0.04, bz = b.z - Math.cos(b.yaw) * 0.04; if (!blocked(bx, bz, 'ground', 0.06) && !(b.flock === 0 && this.rampY(bx, bz) > 0)) { b.x = bx; b.z = bz; } }
        } else {
          this.peckTick(b, dt, 0.9);
          if (b.pkT < 0 && b.sub <= 0) { if (--b.n > 0) b.scrT = 0; else this.choose(b, f, c, day); }
        }
        if (b.t < 0 && b.scrT < 0 && b.pkT < 0) this.choose(b, f, c, day);
        break;
      }
      case S.Peck:
        b.v = Math.max(0, b.v - dt * 4);
        this.peckTick(b, dt, 0.8);
        if (b.t < 0 && b.pkT < 0) this.choose(b, f, c, day);
        break;
      case S.Preen: case S.Stretch: case S.Rest: case S.Dust: case S.Crow:
        b.v = Math.max(0, b.v - dt * 4);
        if (b.t < 0) { if (b.st === S.Rest || b.st === S.Dust) { b.st = S.Flap; b.t = 0.8; } else this.choose(b, f, c, day); }
        break;
      case S.Flap:
        b.v = Math.max(0, b.v - dt * 4);
        if (b.t < 0) {
          // 公鸡扑完翅接着打鸣
          if (b.kind === 1 && b.sub === 1) { b.st = S.Crow; b.t = 2.6; b.sub = 0; c.sfx('rooster', b.x, b.z, 0.8); }
          else this.choose(b, f, c, day);
        }
        break;
      case S.Tidbit:
        // 公鸡刨到吃的：低头一啄一啄、「咯咯」地招呼，母鸡跑过来
        b.v = 0;
        if (b.t > 2.9 && b.t - dt <= 2.9) { c.sfx('hen', b.x, b.z, 0.4); for (const o of f.birds) if (o !== b && o.kind === 0 && o.st !== S.Flee && R() < 0.7) { o.st = S.Walk; o.tx = b.x + Math.sin(b.yaw) * 0.25 + (R() - 0.5) * 0.4; o.tz = b.z + Math.cos(b.yaw) * 0.25 + (R() - 0.5) * 0.4; o.speed = 0.85; o.t = 4; } }
        if (b.t < 0) this.choose(b, f, c, day);
        break;
      case S.Chase: {
        const o = b.foe;
        if (!o || o.st === S.Inside) { this.choose(b, f, c, day); break; }
        b.tx = o.x; b.tz = o.z;
        this.walk(b, dt, b.speed);
        if (Math.hypot(o.x - b.x, o.z - b.z) < 0.28 && o.st !== S.Flee) { this.fleeFrom(o, o.x - b.x, o.z - b.z, 0.3, 1.0); o.speed = 1.2; b.pkT = 0; }
        if (b.t < 0) this.choose(b, f, c, day);
        break;
      }
      case S.Flee: {
        const arrived = this.walk(b, dt, b.speed, 9);
        b.wingG = 0.55 + 0.45 * Math.max(0, Math.sin(c.t * 3 + b.i));
        if (arrived || b.t < 0) { b.st = S.Idle; b.t = 0.6 + R(); b.wingG = 0; b.nyawG = (R() - 0.5) * 1.5; }
        break;
      }
      case S.Feed: {
        // 去抢食：跑到撒食的地方，一下一下啄（每啄一下吃掉一粒），旁边挤着的会被啄开
        const food = b.n === -1 ? null : this.nearestFood(b.x, b.z);
        if (b.n !== -1 && !food) { this.choose(b, f, c, day); break; }
        if (food && Math.hypot(b.tx - food.x, b.tz - food.z) > food.r + 0.3) { b.tx = food.x + (R() - 0.5) * food.r * 2; b.tz = food.z + (R() - 0.5) * food.r * 2; }
        const arrived = this.walk(b, dt, b.speed, 9);
        if (arrived || Math.hypot(b.x - b.tx, b.z - b.tz) < 0.25) {
          const before = b.pkT;
          this.peckTick(b, dt, 0.25);
          if (before >= 0 && b.pkT < 0 && food) {
            food.n--;
            if (R() < 0.25 && Math.hypot(c.player.x - b.x, c.player.z - b.z) < 8) c.sfx('peck', b.x, b.z, 0.35);
            if (food.k.length && food.n < food.k.length) { const k = food.k.pop()!; this.parts.hide(k); this.grainK.push(k); }
            if (food.n <= 0) this.food.splice(this.food.indexOf(food), 1);
            // 挪一小步换个地方啄
            if (R() < 0.35 && food.n > 0) { b.tx = food.x + (R() - 0.5) * food.r * 2; b.tz = food.z + (R() - 0.5) * food.r * 2; b.speed = 0.4; }
            // 挤：啄一下旁边那只
            if (R() < 0.12) for (const o of f.birds) if (o !== b && o.kind === 0 && o.st === S.Feed && Math.hypot(o.x - b.x, o.z - b.z) < 0.3) { this.fleeFrom(o, o.x - b.x, o.z - b.z, 0.2, 0.6); o.st = S.Feed; o.t = 3; break; }
          }
          if (b.pkT < 0) b.pkT = 0.06 * R();
        }
        if (b.t < 0 && b.n === -1) this.choose(b, f, c, day);
        break;
      }
    }
    // 别走进墙、桌、篱里去：碰到了就停下换一件事
    if (b.v > 0.05 && b.st !== S.Home && b.st !== S.Lay && b.st !== S.Flee && c.frame % 3 === b.i % 3 && !(f.id === 'home' && this.rampY(b.x, b.z) > 0) && blocked(b.x, b.z, 'ground', 0.06)) { b.x -= Math.sin(b.yaw) * 0.12; b.z -= Math.cos(b.yaw) * 0.12; b.v = 0; b.st = S.Idle; b.t = 0.5; }
  }
  /** 鸡埘门前那块斜板、里头垫高的土台：脚下比地面高多少（门洞宽窄以内才算） */
  private rampY(x: number, z: number): number {
    const C = this.coop, fx = Math.sin(C.yaw), fz = Math.cos(C.yaw), dx = x - C.x, dz = z - C.z;
    const s = dx * fx + dz * fz, l = Math.abs(dx * fz - dz * fx);
    if (l > 0.3 || s > COOP.d / 2 + 0.34 || s < -COOP.d / 2) return 0;
    return 0.08 * clamp01((COOP.d / 2 + 0.34 - s) / 0.34);
  }
  private nearestFood(x: number, z: number) { let best: (typeof this.food)[number] | null = null, bd = 1e9; for (const f of this.food) { const d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; best = f; } } return best; }
  /** 惊开：朝离人远的方向跑一段（挡着就偏一偏） */
  private fleeFrom(b: Bird, dx: number, dz: number, d: number, dist: number) {
    const a0 = Math.atan2(dx / (d || 1), dz / (d || 1));
    for (const da of [0, 0.6, -0.6, 1.2, -1.2, 2.0, -2.0]) {
      const a = a0 + da + (this.R() - 0.5) * 0.4, tx = b.x + Math.sin(a) * dist, tz = b.z + Math.cos(a) * dist;
      if (!blocked(tx, tz, 'ground', 0.1)) { b.tx = tx; b.tz = tz; break; }
    }
    b.st = S.Flee; b.speed = b.kind === 2 ? 1.2 : 1.9 + 0.4 * this.R(); b.t = 2.5; b.pkT = -1; b.scrT = -1;
    if (b.kind !== 2 && this.R() < 0.4) b.hop = 0.45;
  }
  /** 一阵一阵地啄：每一下快快地点下去、停一停、抬起来 */
  private peckTick(b: Bird, dt: number, gap: number) {
    if (b.pkT >= 0) {
      b.pkT += dt;
      if (b.pkT > 0.26) { b.pkT = -gap * (0.4 + this.R()); if (b.sub > 0) b.sub--; }
    } else {
      b.pkT += dt;
      if (b.pkT > -0.02 && b.pkT < 0) b.pkT = 0;
    }
  }
  /** 被抱着：翅收紧、脚缩起，头东张西望 */
  private heldPose(b: Bird) {
    const h = this.held;
    if (!h) return;
    h.getWorldPosition(_v);
    b.x = _v.x; b.z = _v.z; b.v = 0;
  }

  // ———————————————————————— 摆姿势 ————————————————————————
  private pose(b: Bird, c: Ctx, dt: number) {
    const P = this.parts, K = b.k, s = b.s, t = c.t;
    if (b.st === S.Inside) return;
    if (b.st === S.Held) {
      // 抱在怀里：身子随着那一点，翅收紧、脚缩起，头一转一转地看
      const h = this.held;
      if (!h) return;
      h.getWorldPosition(_v); h.getWorldDirection(_d);
      const yaw = Math.atan2(_d.x, _d.z) + 0.3;
      if (c.frame % 50 === 0) b.nyawG = (this.R() - 0.5) * 1.4;
      b.nyaw += (b.nyawG - b.nyaw) * Math.min(1, dt * 10);
      trs(_b, _v.x, _v.y - 0.12, _v.z, yaw, -0.1, 0, s * 1.04);
      P.place(K[0], _b);
      P.place(K[1], child(_m, _b, 0, NECK.y, NECK.z, b.nyaw, 0.05 * Math.sin(t * 1.7), 0));
      for (let n = 0; n < 2; n++) P.place(K[2 + n], child(_m, _b, (n ? -1 : 1) * SH.x, SH.y, SH.z, 0, 0, 0));
      P.hide(K[4]); P.hide(K[5]);
      return;
    }
    const k6 = Math.min(1, dt * 6), k3 = Math.min(1, dt * 3);
    // 各项姿态往目标走
    const resting = b.st === S.Rest || b.st === S.Dust || (b.st === S.Stray && b.sub === 1) || (b.st === S.Shelter && b.v < 0.05);
    b.crouch += ((resting ? 1 : 0) - b.crouch) * k3;
    b.fluff += ((b.st === S.Shelter || b.st === S.Rest || (b.st === S.Idle && c.season === 'winter') ? 1 : b.st === S.Dust ? 1.4 : 0) - b.fluff) * k3;
    b.wing += ((b.st === S.Flap ? 1 : b.st === S.Flee ? b.wingG : b.st === S.Dust ? 0.35 : b.st === S.Stretch ? 0.6 : 0) - b.wing) * Math.min(1, dt * 10);
    b.nyaw += (((b.st === S.Preen ? b.sub * 2.5 : b.st === S.Idle || b.st === S.Shelter ? b.nyawG : 0)) - b.nyaw) * Math.min(1, dt * 14);
    b.hop = Math.max(0, b.hop - dt * 1.2);
    if (b.v > 0.02) b.ph += b.v * dt * (b.kind === 2 ? 40 : 26);
    const walkK = Math.min(1, b.v / 0.3), step = Math.sin(b.ph);
    const gy = footY(b.x, b.z) + (b.flock === 0 ? this.rampY(b.x, b.z) : 0);
    if (b.kind === 2) {
      // 小鸡：一团，走起来一颠一颠，啄的时候整个往前一点
      if (b.st === S.Hide) { const m = b.mum!; b.x += (m.x - b.x) * k6; b.z += (m.z - b.z) * k6; P.hide(K[0]); return; }
      const pk = b.pkT >= 0 ? bump(b.pkT / 0.26) : 0;
      P.place(K[0], trs(_b, b.x, gy + 0.008 * Math.abs(step) * walkK, b.z, b.yaw, 0.5 * pk, 0));
      return;
    }
    // 啄：颈往下一探
    const pk = b.pkT >= 0 ? bump(Math.min(1, b.pkT / 0.24)) : 0;
    const crow = b.st === S.Crow ? sm(Math.min(1, (2.6 - b.t) * 3)) * sm(b.t * 2.2) : 0;
    const tid = b.st === S.Tidbit ? Math.max(0, Math.sin(t * 9)) * 0.8 : 0;
    // 走路时头一顿一顿：头在空中定住，身子赶上去，再一探
    const bob = b.v > 0.05 && b.st !== S.Flee ? 0.022 * walkK * ((b.ph / Math.PI) % 1 < 0.7 ? 1 - 2 * (((b.ph / Math.PI) % 1) / 0.7) : -1 + 2 * ((((b.ph / Math.PI) % 1) - 0.7) / 0.3)) : 0;
    const stretchK = b.st === S.Stretch ? bump(clamp01((2.2 - b.t) / 2.0)) : 0;
    const dust = b.st === S.Dust ? 1 : 0;
    const drop = (HIP - 0.035) * b.crouch * s;
    const hop = b.hop > 0 ? 0.25 * bump(1 - b.hop / 0.45) : 0;
    const roll = dust * 0.25 * Math.sin(t * 2.3 + b.i) + (b.st === S.Stretch ? b.sub * 0.12 * stretchK : 0);
    const bodyPitch = 0.55 * pk - 0.3 * crow - 0.12 * b.wing * (b.st === S.Flap ? 1 : 0) + 0.25 * tid + (b.st === S.Flee ? 0.18 : 0);
    const fl = 1 + 0.07 * b.fluff;
    trs(_y, b.x, gy, b.z, b.yaw);
    child(_b, _y, 0, HIP * s - drop + 0.004 * Math.abs(step) * walkK + hop, 0, 0, bodyPitch, roll, s * fl);
    P.place(K[0], _b);
    // 头颈
    const tuck = b.crouch * (b.st === S.Rest ? 1 : 0.5);
    const npitch = 1.35 * pk - 0.8 * crow + 0.7 * tid - 0.35 * tuck + (b.st === S.Preen ? 0.6 : 0) + (b.st === S.Flee ? -0.25 : 0) + 0.04 * Math.sin(t * 1.3 + b.i);
    P.place(K[1], child(_m, _b, 0, NECK.y - 0.03 * tuck, NECK.z + bob - 0.025 * tuck, b.nyaw, npitch, b.nroll * (b.st === S.Idle ? 1 : 0)));
    // 翅：收着贴在身侧；张开朝两边平伸、上下扇
    const flapA = b.wing > 0.05 ? Math.sin(t * (b.st === S.Flee ? 22 : 26) + b.i) : 0;
    for (let n = 0; n < 2; n++) {
      const sd = n ? -1 : 1, w = b.st === S.Stretch ? (sd === b.sub ? stretchK : 0) : b.wing;
      const shiver = dust * 0.15 * Math.sin(t * 30 + n);
      child(_m, _b, sd * SH.x, SH.y, SH.z, sd * lerp(0, 0.35, w) + shiver * sd, lerp(0, -0.5, w) + (b.st === S.Stretch ? 0.9 * w : 0), sd * lerp(0, 1.1 + 0.5 * flapA, w * (b.st === S.Stretch ? 0.3 : 1)));
      P.place(K[2 + n], _m);
    }
    // 腿：站着走着都落在地上；卧下时收起来
    if (b.crouch > 0.6) { P.hide(K[4]); P.hide(K[5]); }
    else {
      for (let n = 0; n < 2; n++) {
        const sd = n ? -1 : 1;
        let a = b.v > 0.02 ? 0.55 * walkK * (n ? -step : step) : 0;
        if (b.st === S.Forage && b.scrT >= 0) { const q = b.scrT / 0.85, which = q < 0.5 ? 0 : 1; if (which === n) a = 0.9 * bump((q % 0.5) / 0.5); }
        if (b.st === S.Stretch && sd === b.sub) a = 0.8 * stretchK;
        child(_m, _y, sd * LEG.x * s, HIP * s - drop + hop, 0, 0, a, 0, s);
        P.place(K[4 + n], _m);
      }
    }
  }
}
