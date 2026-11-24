/**
 * 担子往哪儿挑。行囊里有麦捆、谷穗、水时，人右肩上挑着扁担（index.ts 的 updateCarry）；这里告诉他挑到哪儿去、怎么走：
 *
 *   去处 —— 麦捆、谷穗挑到晒场去打；水挑去浇此刻缺水的那一畦（几畦都缺就挑近的）。
 *           没有去处（地里都不缺水、下着雨、天黑了、冬天地冻）就说为什么，请他放下。
 *   认路 —— 找一条路（walk.ts 的 findPath：挑起来时找一回，走偏了再找），顺着它说「往东北，踩汀步过溪，约九十步」，
 *           走着走着跟着变；画里目的地上空立一笔淡墨（顶上一点朱，远远就看得见；在后头被挡着也淡淡地透出来），走到跟前隐去。
 *   到了 —— 走进那件事的圈子、站住（手离了摇杆、方向键），那件事就开始（打场、浇水）。
 *           开始过一回的（比如下雨没打成），走开再回来才再开始。
 *   放下 —— 担子放在脚边（扁担两头着地），走过去「挑起」再挑；在晒场边放下的码在场边，打场时先用它。
 *           进草堂前，担子放在门外。过了一夜、或挑着走远了：水倒了，麦捆、谷穗邻家帮着挑到场边码好。
 *
 * 界面只读这里：view（下面那一行提示）、beaconTop()（画里那一笔的顶，好把名字写在旁边）、mapView()（村图上的去处与路）；
 * 按「放下」调 setDown('drop')。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from '../acts/types';
import { FX_LAYER, FX_PARS, INK_PARS, U } from '../ink/ink';
import { findPath, groundAt, placeAt, standable } from '../walk';
import { SITE, ground } from '../site';
import { cn } from '../../util/cn';
import { BED_GEO, FLOOR } from './layout';
import { carryPole } from './props';
import { PILES_MAX, addPile, takePile, type Load, type Pile } from './model';
import { along, compass, nextTurn, passes, routeLen, stepsText, type Mark, type P2 } from './way';
import type { Farm } from './index';

/** 要去的那一处 */
export interface Dest {
  key: string;
  /** 画里、村图上写的名字 */ name: string;
  /** 到了就开始的那件事 */ act: string;
  /** 那一处（立那一笔墨的地方） */ x: number; y: number; z: number;
  /** 人该走到的那一点（那件事的 spot） */ tx: number; tz: number;
  /** 到了做什么（「打场」「浇」） */ verb: string;
  /** 那件事此刻做不了：为什么、该怎么办 */ why: string | null;
}
/** 给界面的：此刻挑着什么、去哪、怎么走 */
export interface CarryView {
  item: Load; n: number;
  /** 「十二捆麦」「两桶水」 */ what: string;
  /** 头一行：挑到晒场去打场 / 挑去浇东畦 / 挑着两桶水 */ title: string;
  /** 第二行：往东北，踩汀步过溪，约九十步 / 到了，站住就打场 / 地里这会儿都不缺水 */ line: string;
  /** 第二行拆开的几截（界面上只在截与截之间折行，「约九十步」不拆开） */ parts: string[];
  /** 再一句小字（为什么做不了、怎么办）；没有是 null */ note: string | null;
  dest: { key: string; name: string } | null;
  /** 该往哪个方向走（世界里的方向角 atan2(东, 南)）；不必指的时候 null */ heading: number | null;
  /** 还有多远（米，顺着路） */ left: number;
  /** 已经在那件事的圈子里了 */ at: boolean;
}

const LIANG = (n: number) => (n === 2 ? '两' : cn(n));
/** 「十二捆麦」「两桶水」「八把谷穗」 */
export function what(item: Load, n: number): string {
  return item === 'sheaf' ? `${LIANG(n)}捆麦` : item === 'water' ? `${LIANG(n)}桶水` : `${LIANG(n)}把谷穗`;
}
/** 路上会过的几处 */
const MARKS: Mark[] = [
  { x: SITE.bridge.x, z: SITE.bridge.z, r: 2.6, say: '过石桥' },
  { x: SITE.stones.x, z: SITE.stones.z, r: 3.2, say: '踩汀步过溪' },
  { x: SITE.gate.x, z: SITE.gate.z, r: 1.9, say: '过柴门' },
  { x: SITE.sideGate.x, z: SITE.sideGate.z, r: 1.7, say: '过西边小门' },
];
/** 晒场边上码麦捆的地方（场西头，不挡打场、扬场、推磨） */
const STACK = { x: FLOOR.x - 2.7, z: FLOOR.z + 0.5 };
/** 离晒场多近算「在场边」（在这里放下的码到场边去） */
const AT_FLOOR = 6.5;
/** 挑着走出多远算走远了（离去处）、走远了多久就放下 */
const FAR = 130, FAR_T = 8;
/** 扁担放在地上时，扁担离地多高（两头的东西着地） */
const LIFT: Record<Load, number> = { sheaf: 1.03, milletEar: 0.6, water: 0.66 };
const POLE_KIND: Record<Load, 'sheaf' | 'water' | 'ear'> = { sheaf: 'sheaf', milletEar: 'ear', water: 'water' };
const pendingOf = (k: Anlewo) => (k as unknown as { pending?: string | null }).pending ?? null;
const gy = (x: number, z: number) => groundAt(x, z) ?? ground(x, z);

// —— 画里那一笔：一道竖着的墨，起笔处圆、往下收成一丝没进地里，顶上一点朱；身后衬一窄条淡淡的粉（像一面幡，深的树前也认得出）；
//    慢慢地一浓一淡。远了按比例放大（一百米外也有画幅的五分之一高），被山、树、屋挡着时淡淡地透出来 ——
const BEACON_W = 2.4, BEACON_H = 7.6;
const BEACON_V = /* glsl */ `
varying vec2 vUv; varying float vZ;
void main() {
  vUv = uv;
  vec4 v = modelViewMatrix * vec4(position, 1.0);
  vZ = -v.z;
  gl_Position = projectionMatrix * v;
}
`;
const BEACON_F = /* glsl */ `
${INK_PARS}
${FX_PARS}
uniform vec3 uInk; uniform float uA; uniform vec2 uSize; uniform float uSeed;
/** x 墨有几成浓，y 被挡着时还剩几成（远了都高些） */
uniform vec2 uK;
varying vec2 vUv; varying float vZ;
vec4 over(vec4 t, vec4 b) { float a = t.a + b.a * (1.0 - t.a); return vec4((t.rgb * t.a + b.rgb * b.a * (1.0 - t.a)) / max(a, 1e-4), a); }
void main() {
  vec2 p = vec2((vUv.x - 0.5) * uSize.x, vUv.y * uSize.y);
  float top = uSize.y - 0.95, y = p.y;
  // 中线微微地弯、慢慢地摆
  float cx = 0.07 * sin(y * 0.9 + uSeed) + 0.03 * sin(y * 2.3 + uTime * 0.6 + uSeed * 2.0);
  // 宽：脚下一丝，往上渐渐饱满；起笔处一团圆墨
  float hw = mix(0.06, 0.3, smoothstep(0.0, top * 0.7, y));
  float d = abs(p.x - cx) / hw;
  float body = (1.0 - smoothstep(0.6, 1.0, d)) * smoothstep(0.0, 0.3, y) * (1.0 - smoothstep(top - 0.05, top + 0.12, y));
  vec2 hq = vec2((p.x - cx) / 0.37, (y - (top - 0.16)) / 0.48);
  body = max(body, 1.0 - smoothstep(0.65, 1.0, length(hq) + 0.12 * in3(vec3(hq * 2.0, uSeed))));
  // 飞白：顺着笔走的几道丝，越往下越干
  float n = in3(vec3((p.x - cx) * 18.0, y * 0.8, uSeed));
  body *= 1.0 - 0.6 * smoothstep(top * 0.45, 0.0, y) * smoothstep(0.45, 0.75, n);
  float inkA = body * (0.72 + 0.28 * (1.0 - min(1.0, d)));
  // 身后一窄条淡粉（像幡）：两边软，脚下、顶上收掉
  float band = (1.0 - smoothstep(1.0, 2.5, d)) * smoothstep(0.2, 1.4, y) * (1.0 - smoothstep(top - 0.2, top + 0.7, y));
  // 顶上一点朱（夜里是金）
  vec2 sq = vec2(p.x - cx, y - (top + 0.55)) / 0.36;
  float seal = 1.0 - smoothstep(0.72, 1.0, length(sq) + 0.1 * in3(vec3(sq * 3.0, uSeed + 4.0)));
  vec3 inkC = mix(uInk, uLight * 0.94, uNight), bandC = mix(uLight, uInk * 1.6, uNight * 0.85);
  vec3 zhu = mix(vec3(0.69, 0.24, 0.18), vec3(0.86, 0.77, 0.57), uNight);
  float pulse = 0.82 + 0.18 * sin(uTime * 1.7);
  // 在山、树、屋后头：淡淡地透出来（远远地也认得出方向）
  float seen = mix(uK.y, 1.0, fxSeen(vZ, 0.8)), k = uA * seen;
  vec4 c = over(vec4(inkC, inkA * uK.x * pulse * k), vec4(bandC, band * 0.42 * k));
  c = over(vec4(zhu, seal * 0.95 * k), c);
  if (c.a < 0.01) discard;
  gl_FragColor = c;
}
`;

export class Guide {
  /** 给界面的（不挑着、正做着事、在雾里时是 null） */
  view: CarryView | null = null;
  dest: Dest | null = null;
  /** 正顺着走的那条路（头一个点是找路时人站的地方） */
  route: P2[] | null = null;
  private routeKey = ''; private routeAt = -1e9;
  private lastX = NaN; private lastZ = NaN;
  private beacon: THREE.Mesh; private beaconA = 0; private beaconMat: THREE.ShaderMaterial;
  private poles: Array<ReturnType<typeof carryPole>> = [];
  private pilesDirty = true;
  private farT = 0; private planT = 0;
  /** 到了以后开始过的那一处（走开七米再回来才再开始） */
  private arrived: string | null = null;
  private hadLoad = false;
  private tmp = new THREE.Vector3();

  constructor(private k: Anlewo, private F: Farm) {
    const g = new THREE.PlaneGeometry(BEACON_W, BEACON_H).translate(0, BEACON_H / 2, 0);
    this.beaconMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uA: { value: 0 }, uSize: { value: new THREE.Vector2(BEACON_W, BEACON_H) }, uSeed: { value: 1.3 }, uK: { value: new THREE.Vector2(0.6, 0.5) } },
      vertexShader: BEACON_V, fragmentShader: BEACON_F, transparent: true, depthTest: false, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(g, this.beaconMat);
    this.beacon.name = 'farm:beacon'; this.beacon.layers.set(FX_LAYER); this.beacon.frustumCulled = false; this.beacon.renderOrder = 6; this.beacon.visible = false;
    k.world.scene.add(this.beacon);
  }

  // —— 挑着什么 ——
  /** 肩上那一副（跟扁担上画的一样：麦捆、水、谷穗，先有哪样是哪样） */
  load(): { item: Load; n: number } | null {
    const B = this.k.bag;
    for (const item of ['sheaf', 'water', 'milletEar'] as Load[]) { const n = B.count(item); if (n > 0) return { item, n }; }
    return null;
  }

  // —— 去处 ——
  private act(id: string): (Act & { on?(): boolean }) | null { return (this.k.acts[id] as Act & { on?(): boolean }) ?? null; }
  private floorDest(item: Load): Dest {
    const a = this.act('farm:thresh'), at = this.k.atmos;
    const why = at.night > 0.72 ? '天黑了，场上看不清，明天再打；先放在场边' : at.w.rain > 0.45 ? '下着雨，场上打不了；先放在场边，雨住了再打' : null;
    return { key: 'floor', name: '晒场', act: 'farm:thresh', x: FLOOR.x, y: FLOOR.y, z: FLOOR.z, tx: a?.spot.x ?? FLOOR.x, tz: a?.spot.z ?? FLOOR.z + 2, verb: item === 'sheaf' ? '打场' : '打谷', why };
  }
  /** 水挑去哪一畦：此刻能浇（缺水）的那几畦里最近的；正去着的那一畦，别的要近出八米才换 */
  private bedDest(): Dest | null {
    const p = this.k.player.pos;
    let best: Dest | null = null, bd = Infinity;
    for (const g of Object.values(BED_GEO)) {
      const a = this.act(`farm:water:${g.id}`);
      if (!a?.on?.()) continue;
      const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2, d = Math.hypot(a.spot.x - p.x, a.spot.z - p.z) - (this.dest?.key === `bed:${g.id}` ? 8 : 0);
      if (d < bd) { bd = d; best = { key: `bed:${g.id}`, name: g.name, act: a.id, x: cx, y: g.y(cx, cz), z: cz, tx: a.spot.x, tz: a.spot.z, verb: '浇', why: null }; }
    }
    return best;
  }
  /** 挑着这一样该去哪 */
  plan(item: Load): Dest | null { return item === 'water' ? this.bedDest() : this.floorDest(item); }
  /** 水没处浇：为什么 */
  private dryWhy(): string {
    const k = this.k;
    if (k.season === 'winter') return '冬天地冻着，不用浇';
    if (k.atmos.w.rain > 0.4) return '下着雨，地不用浇';
    if (k.atmos.night > 0.62) return '天黑了，明天再浇';
    return '地里这会儿都不缺水';
  }
  /** 一句话：挑起来那一刻面板上说的（照直线估个方向、步数） */
  tell(item: Load, n: number): string {
    const d = this.plan(item), p = this.k.player.pos;
    if (!d) return `${what(item, n)}挑在肩上。${this.dryWhy()}，用不着就放下。`;
    const dx = d.tx - p.x, dz = d.tz - p.z, m = Math.hypot(dx, dz);
    const way = m < 9 ? '就在跟前' : `往${compass(dx, dz)}，${stepsText(m * 1.15)}`;
    return d.key === 'floor'
      ? `挑到晒场去${d.verb}（${way}），走到场上站住就打。${d.why ? d.why + '。' : ''}`
      : `挑去浇${d.name}（${way}），走到畦边站住就浇。`;
  }

  // —— 每帧（要算的隔一小会儿算一回；那一笔每帧跟着镜头转） ——
  private stepT = 0; private stepAcc = 0; private planItem: Load | null = null;
  update(dt: number, _t: number) {
    const k = this.k, p = k.player.pos;
    if (this.pilesDirty) this.drawPiles();
    const ld = this.load();
    const show = !!ld && !k.act && !k.nav.busy && k.veil < 0.5;
    if (ld && !this.hadLoad) this.arrived = null;
    this.hadLoad = !!ld;
    this.stepAcc += dt;
    // 换了一样挑（水浇完了，肩上换成谷穗）：马上换去处
    const changed = (ld?.item ?? null) !== this.planItem;
    if (changed || (this.stepT -= dt) <= 0) {
      this.stepT = 0.12;
      const el = this.stepAcc; this.stepAcc = 0;
      this.planItem = ld?.item ?? null;
      if (!ld) { this.dest = null; this.route = null; this.routeKey = ''; this.farT = 0; this.view = null; }
      else this.step(ld, show, el, changed);
    }
    const d = ld ? this.dest : null;
    this.drawBeacon(dt, show && !!d && !!this.view && !this.view.at && Math.hypot(p.x - (d?.x ?? 0), p.z - (d?.z ?? 0)) > 6.5, d);
  }
  private step(ld: { item: Load; n: number }, show: boolean, el: number, force: boolean) {
    const k = this.k, p = k.player.pos, now = performance.now() / 1000;
    if ((this.planT -= el) <= 0 || this.dest == null || force) { this.planT = 0.3; this.dest = this.plan(ld.item); }
    const d = this.dest;
    // 路：换了去处、人一下子到了别处（换处）、走偏了（隔几秒再找）
    const jumped = Number.isFinite(this.lastX) && Math.hypot(p.x - this.lastX, p.z - this.lastZ) > 8;
    this.lastX = p.x; this.lastZ = p.z;
    let a = d && this.route ? along(this.route, p.x, p.z) : null;
    if (d && show && (d.key !== this.routeKey || jumped || (a && a.off > 6 && now - this.routeAt > 3.5))) { this.findRoute(d); a = this.route ? along(this.route, p.x, p.z) : null; }
    // 给界面的一行
    this.view = show ? this.say(ld, d, a) : null;
    // 到了：站住就开始那件事
    if (d && show) this.arrive(d);
    // 进草堂前放在门外；挑着走远了
    if (!k.act && !k.nav.busy && k.veil < 0.5) {
      if (placeAt(p.x, p.z).indoor >= 1) { this.setDown('hall'); return; }
      const ref = d ?? this.nearestBed();
      const far = !!ref && Math.hypot(p.x - ref.x, p.z - ref.z) > FAR && !(ld.item === 'water' && this.waterFavor());
      this.farT = far ? this.farT + el : 0;
      if (this.farT > FAR_T) { this.farT = 0; this.setDown('far'); }
    }
  }

  private findRoute(d: Dest) {
    const p = this.k.player.pos;
    this.routeKey = d.key; this.routeAt = performance.now() / 1000;
    let pts: P2[] | null = null;
    try { pts = findPath(p.x, p.z, gy(p.x, p.z), d.tx, d.tz); } catch { pts = null; }
    this.route = [[p.x, p.z], ...(pts && pts.length ? pts : [[d.tx, d.tz] as P2])];
  }

  private say(ld: { item: Load; n: number }, d: Dest | null, a: ReturnType<typeof along> | null): CarryView {
    const k = this.k, p = k.player.pos, w = what(ld.item, ld.n);
    if (!d) { const why = this.dryWhy(); return { item: ld.item, n: ld.n, what: w, title: `挑着${w}`, line: why, parts: [why], note: '用不着就放下', dest: null, heading: null, left: 0, at: false }; }
    const title = d.key === 'floor' ? `挑到晒场去${d.verb}` : `挑去浇${d.name}`;
    const act = this.act(d.act), r = Math.min(act?.radius ?? 3, 3.2);
    const toSpot = Math.hypot(d.tx - p.x, d.tz - p.z), at = toSpot < r;
    const route = this.route;
    const left = a && route ? a.left + a.off : toSpot;
    let parts: string[], heading: number | null = null;
    if (at) parts = d.why ? ['到了'] : ['到了', `站住就${d.verb}`];
    else {
      let hx = d.tx, hz = d.tz;
      if (a && route) [hx, hz] = nextTurn(route, a, p.x, p.z);
      if (Math.hypot(hx - p.x, hz - p.z) < 0.5) { hx = d.tx; hz = d.tz; }
      heading = Math.atan2(hx - p.x, hz - p.z);
      const via = a && route ? passes(route, a, MARKS) : [];
      parts = left < 9 ? ['就在前头', '几步'] : [`往${compass(hx - p.x, hz - p.z)}`, ...via, stepsText(left)];
    }
    return { item: ld.item, n: ld.n, what: w, title, line: parts.join('，'), parts, note: d.why, dest: { key: d.key, name: d.name }, heading, left, at };
  }

  private arrive(d: Dest) {
    const k = this.k, p = k.player, a = this.act(d.act);
    if (!a) return;
    const dd = Math.hypot(a.spot.x - p.pos.x, a.spot.z - p.pos.z);
    if (dd > 7) { if (this.arrived === d.key) this.arrived = null; return; }
    if (this.arrived === d.key || dd > Math.min(a.radius ?? 3, 3.2)) return;
    if (k.act || k.nav.busy || pendingOf(k) || p.input.lengthSq() > 0.0009 || a.on?.() === false) return;
    this.arrived = d.key;
    k.enterAct(d.act);
  }

  /** 自己顺着路走过去（挑麦、挑起时面板上的「挑到场上」）；到了就开始那件事。走不成（没有去处）返回 false */
  walkThere(): boolean {
    const ld = this.load(), k = this.k;
    const d = ld ? this.plan(ld.item) : null;
    if (!d) return false;
    this.dest = d;
    this.findRoute(d);
    const pts = (this.route ?? []).slice(1);
    const p = k.player;
    let i = 0;
    const leg = () => {
      if (i >= pts.length) { if (!k.act) k.enterAct(d.act); return; }
      const [x, z] = pts[i++];
      p.goTo(x, z, { r: i >= pts.length ? 0.4 : 0.6, then: leg, fail: () => { if (Math.hypot(p.pos.x - x, p.pos.z - z) < 2.5) leg(); } });
    };
    leg();
    return true;
  }

  // —— 放下、挑起 ——
  /** 人脚边、面朝的方向（扁担顺着身子，一头在前一头在后） */
  private feet(): { x: number; z: number; yaw: number } { const p = this.k.player; return { x: p.pos.x, z: p.pos.z, yaw: p.yaw }; }
  /** 草堂门外（台基下、院里）能站人的一处 */
  private door(): { x: number; z: number; yaw: number } {
    const H = SITE.hall;
    for (const [dx, dz] of [[1.9, 1.9], [-1.9, 1.9], [2.4, 2.6], [-2.4, 2.6], [0, 3.1], [3.2, 3.4]]) {
      const x = H.x + dx, z = H.z + H.d / 2 + dz;
      if (standable(x, z) != null && placeAt(x, z).indoor < 0.5) return { x, z, yaw: Math.PI / 2 };
    }
    return { x: SITE.gate.x + 1.6, z: SITE.gate.z - 2.2, yaw: Math.PI / 2 };
  }
  /** 场边码麦捆的那一处（站不住人就往旁边挪一点） */
  private stackAt(): { x: number; z: number; yaw: number } {
    for (const [dx, dz] of [[0, 0], [-0.6, 0.8], [-0.8, -0.8], [0.6, 1.4], [-1.4, 0]]) if (standable(STACK.x + dx, STACK.z + dz) != null) return { x: STACK.x + dx, z: STACK.z + dz, yaw: 0.2 };
    return { x: STACK.x, z: STACK.z, yaw: 0.2 };
  }
  /** 场边码着的那一副（麦捆或谷穗）在 piles 里是第几（没有是 −1） */
  floorPile(item?: Load): number {
    return this.F.st.piles.findIndex((q) => q.item !== 'water' && (!item || q.item === item) && Math.hypot(q.x - STACK.x, q.z - STACK.z) < 2.6);
  }
  /** 从场边码着的里拿 n 捆（把）：返回拿了几 */
  takeFloor(item: Load, n: number): number {
    const i = this.floorPile(item);
    if (i < 0) return 0;
    const got = takePile(this.F.st, i, n);
    if (got) { this.pilesDirty = true; this.F.saveSoon(); }
    return got;
  }
  private put(p: Pile) { addPile(this.F.st, p); this.pilesDirty = true; }
  /**
   * 放下肩上的担子：
   *   drop 自己放下（在脚边；在晒场边就码到场边）· hall 进草堂前（放在门外）
   *   far 挑着走远了 · night 过了一夜（水倒了；麦捆、谷穗邻家帮着挑到场边）
   * 返回放下了没有
   */
  setDown(why: 'drop' | 'hall' | 'far' | 'night'): boolean {
    const k = this.k, B = k.bag, list = (['sheaf', 'milletEar', 'water'] as Load[]).map((item) => ({ item, n: B.count(item) })).filter((o) => o.n > 0);
    if (!list.length) return false;
    const said: string[] = [];
    const here = why === 'hall' ? this.door() : this.feet();
    const atFloor = Math.hypot(here.x - FLOOR.x, here.z - FLOOR.z) < AT_FLOOR;
    for (const { item, n } of list) {
      B.take(item, n, { quiet: true });
      const w = what(item, n);
      if (why === 'drop' || why === 'hall') {
        if (item !== 'water' && atFloor) { this.put({ item, n, ...this.stackAt() }); said.push(`${w}码在了场边，打场时先打它`); }
        else { this.put({ item, n, ...here }); said.push(why === 'hall' ? `进屋前，${w}放在了门外` : `${w}放下了，要挑时走过去「挑起」`); }
      } else if (item === 'water') said.push(why === 'far' ? '走得远了，把水倒了' : '隔了一夜，桶里的水倒了');
      else { this.put({ item, n, ...this.stackAt() }); said.push(why === 'far' ? `挑着${w}走远了。邻家看见，帮你挑到了场边，码好了` : `昨天挑着的${w}，邻家帮你挑到了场边，码好了`); }
    }
    if (why === 'drop' || why === 'hall') { k.sfx('pole', { vel: 0.35 }); k.player.av.reach('R', null); }
    k.note(said.join('；') + '。', 'farm');
    this.F.saveSoon();
    this.arrived = null; this.farT = 0;
    return true;
  }
  /** 过了一夜：肩上的放下；放在路边的水倒了、麦捆谷穗邻家帮着挑到场边 */
  overnight() {
    this.setDown('night');
    const st = this.F.st, moved: Load[] = [];
    for (let i = st.piles.length - 1; i >= 0; i--) {
      const q = st.piles[i];
      if (q.item === 'water') { st.piles.splice(i, 1); continue; }
      if (Math.hypot(q.x - STACK.x, q.z - STACK.z) < 2.6) continue;
      st.piles.splice(i, 1);
      this.put({ ...q, ...this.stackAt() });
      moved.push(q.item);
    }
    if (moved.length) this.k.note(`放在路边的${moved.includes('sheaf') ? '麦捆' : '谷穗'}，夜里邻家也帮着挑到了场边。`, 'farm');
    this.pilesDirty = true;
  }
  /** 离 (x, z) 最近的一副担子（maxD 米以内）：下标与那一副 */
  nearestPile(x: number, z: number, maxD = 40): { i: number; pile: Pile } | null {
    let best: { i: number; pile: Pile } | null = null, bd = maxD;
    this.F.st.piles.forEach((q, i) => { const d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = { i, pile: q }; } });
    return best;
  }
  /** 挑起第 i 副：收进行囊（水最多两桶，多的留在地上）。返回挑起了什么 */
  pickUp(i: number): { item: Load; n: number } | null {
    const q = this.F.st.piles[i];
    if (!q) return null;
    const got = this.k.bag.add(q.item, q.n, { quiet: true });
    if (got <= 0) return null;
    const item = q.item;
    takePile(this.F.st, i, got);
    this.pilesDirty = true; this.F.saveSoon();
    this.arrived = null;
    return { item, n: got };
  }
  /** 挑起时人站在哪（扁担侧边、面朝扁担） */
  static besidePile(q: Pile): { x: number; z: number; yaw: number } {
    const sx = Math.cos(q.yaw), sz = -Math.sin(q.yaw);
    for (const s of [0.62, -0.62, 0.9, -0.9]) { const x = q.x + sx * s, z = q.z + sz * s; if (standable(x, z) != null) return { x, z, yaw: Math.atan2(q.x - x, q.z - z) }; }
    return { x: q.x + sx * 0.62, z: q.z + sz * 0.62, yaw: Math.atan2(-sx, -sz) };
  }

  // —— 画 ——
  private drawPiles() {
    this.pilesDirty = false;
    const piles = this.F.st.piles;
    while (this.poles.length < Math.min(piles.length, PILES_MAX)) { const c = carryPole(); c.group.name = 'farm:pile'; this.F.group.add(c.group); this.poles.push(c); }
    this.poles.forEach((c, i) => {
      const q = piles[i];
      c.group.visible = !!q;
      if (!q) return;
      c.set(POLE_KIND[q.item], q.n);
      c.group.position.set(q.x, gy(q.x, q.z) + LIFT[q.item], q.z);
      // 扁担顺着放下时身子的方向，微微斜一点（一头先着地）
      c.group.rotation.set(0.04, q.yaw, 0.05);
    });
  }
  private drawBeacon(dt: number, on: boolean, d: Dest | null) {
    this.beaconA += ((on ? 1 : 0) - this.beaconA) * Math.min(1, dt * 2.6);
    const b = this.beacon, cam = this.k.world.camera.position;
    b.visible = this.beaconA > 0.01 && !!d;
    this.beaconMat.uniforms.uA.value = this.beaconA;
    if (!b.visible || !d) return;
    b.position.set(d.x, d.y, d.z);
    b.rotation.set(0, Math.atan2(cam.x - d.x, cam.z - d.z), 0);
    // 远了按比例放大（三十六米以外，在画里差不多一样高）；墨也浓些、被挡着时透出来的多些
    const dist = Math.hypot(cam.x - d.x, cam.z - d.z), s = Math.max(1, Math.min(5, dist / 36)), f = Math.max(0, Math.min(1, (dist - 15) / 65));
    b.scale.setScalar(s);
    (this.beaconMat.uniforms.uK.value as THREE.Vector2).set(0.5 + 0.38 * f, 0.5 + 0.32 * f);
  }
  /** 那一笔的顶（名字写在它旁边）；没立着时 null */
  beaconTop(out = this.tmp): THREE.Vector3 | null {
    if (!this.beacon.visible || this.beaconA < 0.2 || !this.dest) return null;
    return out.set(this.dest.x, this.dest.y + (BEACON_H - 0.2) * this.beacon.scale.y, this.dest.z);
  }
  /** 那一笔此刻有几成浓（0…1；界面上的名字跟着淡入淡出） */
  get beaconAlpha() { return this.beacon.visible ? this.beaconA : 0; }

  // —— 村图 ——
  /** 村图上画的：要去的那一处、从人到那里的路、地上放着的担子 */
  mapView(): { dest: { name: string; x: number; z: number } | null; route: P2[]; piles: Array<{ item: Load; n: number; x: number; z: number }> } {
    const p = this.k.player.pos, d = this.load() ? this.dest : null;
    let route: P2[] = [];
    if (d && this.route) {
      const a = along(this.route, p.x, p.z);
      route = [[p.x, p.z], [a.px, a.pz], ...this.route.slice(a.i + 1)];
    } else if (d) route = [[p.x, p.z], [d.tx, d.tz]];
    return { dest: d ? { name: d.name, x: d.x, z: d.z } : null, route, piles: this.F.st.piles.map((q) => ({ item: q.item, n: q.n, x: q.x, z: q.z })) };
  }

  // —— 杂 ——
  private nearestBed(): { x: number; z: number } | null {
    const p = this.k.player.pos;
    let best: { x: number; z: number } | null = null, bd = Infinity;
    for (const g of Object.values(BED_GEO)) { const x = (g.x0 + g.x1) / 2, z = (g.z0 + g.z1) / 2, dd = Math.hypot(x - p.x, z - p.z); if (dd < bd) { bd = dd; best = { x, z }; } }
    return best;
  }
  /** 村里有人托你送水（人情那一路记在 k.mem 的 'folk'）：挑着水走远了也不倒 */
  private waterFavor(): boolean {
    try { const f = this.k.mem.get<{ f?: Record<string, { s?: string }> }>('folk', {}); return f?.f?.water?.s === 'on'; } catch { return false; }
  }
  /** 路有多长（给测试看） */
  get routeLength() { return this.route ? routeLen(this.route) : 0; }
}
