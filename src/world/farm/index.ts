/**
 * 农事：行者自己那几畦地，与晒场上打场、扬场、推磨的那一套。
 *
 *   model.ts  田里的账（几畦地长到哪一步、晒场上摊着什么）——只是数，测试里直接跑
 *   layout.ts 在哪（从总图算出来）
 *   soil.ts / paint.ts / props.ts / tiles.ts  画：畦面、庄稼与草的笔、家什、石磨、麦堆
 *   acts/farm*.ts  各件事（翻地、下种、浇水、锄草、割麦、捆麦、挑、打场、扬场、推磨、舂米、打水、摘果、采桑……）
 *
 * 这里把它们装在一起：从 k.mem 的 'farm' 读出账、换季跟着走、过夜与时辰流转时庄稼长、改了就画、隔一会儿存一次；
 * 行囊里有麦捆、水、谷穗时，人肩上挑着扁担（不跑，走得慢些）；挑到哪儿去、怎么走、怎么放下，见 guide.ts。
 *
 * 给别人的（见 docs/FARM.md）：farmPlotState(i)、farmPlots()、farmReapSpot()、farmReapStep()、FARM_SITE；
 * 界面读 farm()?.guide（担子往哪儿挑：view、beaconTop()、mapView()、setDown('drop')）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { atlas } from '../ink/brush';
import { U, dabMat } from '../ink/ink';
import { defineItems } from '../bag';
import { CROPS, STAGE_CN, type Season, type Stage } from '../../data/farm';
import * as Mo from './model';
import { BEDS, type Bed, type FarmState } from './model';
import { BED_GEO, FARM_SITE, FLOOR, HEAP, MILL, PEACH, PLOT, VILLAGE } from './layout';
import { Soil } from './soil';
import { Bits, DabPool, drawField, drawYard, fieldMat, h3 } from './paint';
import { FARM_TILES, T } from './tiles';
import { carryPole, COL, heap, millstone } from './props';
import { Guide } from './guide';
import { peach as growPeach } from '../env/flora/peach';
import { Sink } from '../env/flora/sink';
import { rand } from '../env/flora/kit';
import { ground as groundOf } from '../site';

// 农事这一路新添的东西
defineItems([
  { id: 'gu', name: '谷子', unit: '升', kind: 'crop', note: '打下来的谷粒，带着壳；到水碓上舂过才是小米。' },
]);

export { FARM_SITE };
export type { FarmState, Bed };
export type { CarryView, Dest } from './guide';
export type { Load, Pile } from './model';

/** 夜里长得快些：过一夜另加的（按天算） */
const NIGHT_BONUS = 1.0;

export class Farm {
  st: FarmState;
  group = new THREE.Group();
  soil: Soil;
  field: DabPool; yard: DabPool; fruit: DabPool;
  bits: Bits;
  mill: ReturnType<typeof millstone>;
  heaps: { mixed: THREE.Mesh; clean: THREE.Mesh; chaff: THREE.Mesh };
  pole = carryPole();
  /** 树上还剩几只桃（这一季）；地上掉着的果子（枣、柿） */
  peaches: THREE.Vector3[] = [];
  peachLeft = 0;
  fallen: Array<{ x: number; y: number; z: number; item: string; c: [number, number, number] }> = [];
  private dirtyBeds = new Set<string>();
  private dirtyField = false; private dirtyYard = false; private dirtyFruit = false;
  private saveT = 0; private wantSave = false;
  private lastHour = -1; private hourAcc = 0;
  private carrying = false;
  private marginSeason: Season | null = null;
  /** 正在做的那件农事要不要肩上的扁担（做事时由那件事自己管家什）；holdKind 是那时扁担上挑的什么（不给就看行囊） */
  holdPole = false;
  holdKind: 'sheaf' | 'water' | 'ear' | null = null;
  /** 担子往哪儿挑、放下、挑起（guide.ts） */
  guide: Guide;
  /** 正在锄草的那一畦：草在哪、拔了没有（锄草那件事给） */
  weedOverride = new Map<string, Array<{ x: number; y: number; z: number; alive: boolean }>>();

  constructor(public k: Anlewo) {
    this.group.name = 'farm';
    this.st = Mo.loadState(k.mem.get('farm', null), k.season, k.day);
    const A = atlas(FARM_TILES.tiles, FARM_TILES.cols, Math.round(160 * k.q.tex), 4141);
    // 两畦外头的走道：一直铺到这一块地的边上（连田埂），盖住底下麦地的底色
    this.soil = new Soil(Object.values(BED_GEO), { x0: PLOT.x0 - 0.25, x1: PLOT.x1 + 0.25, z0: PLOT.z0 - 0.25, z1: VILLAGE.z0 + 0.6, y: groundOf });
    this.group.add(this.soil.mesh);
    // 田里的笔：两畦、邻家麦、菜畦都在这一池里（包围球罩住这几块）
    const fieldC = new THREE.Vector3((VILLAGE.x0 + VILLAGE.x1) / 2 - 8, 6, 38);
    this.field = new DabPool(2600, fieldMat(A), 'farm:field', fieldC, 47);
    this.yard = new DabPool(140, fieldMat(A), 'farm:yard', new THREE.Vector3(FLOOR.x, FLOOR.y, FLOOR.z), 5);
    this.fruit = new DabPool(64, dabMat({ ...A, pig: [1, 1, 1], accent: [1, 0.93, 0.8], dens: 1, shade: 1.25, body: 0.8, snow: 0.2, sway: 0.4 }), 'farm:fruit', new THREE.Vector3(30, 8, 15), 80);
    this.bits = new Bits(A);
    this.group.add(this.field.mesh, this.yard.mesh, this.fruit.mesh, this.bits.pool.mesh);
    this.mill = millstone(MILL.x, MILL.y, MILL.z, MILL.base);
    this.group.add(this.mill.group);
    this.heaps = { mixed: heap(COL.chaff, 'farm:heap'), clean: heap(COL.grain, 'farm:grain'), chaff: heap([0.97, 0.94, 0.84], 'farm:chaff') };
    for (const h of Object.values(this.heaps)) this.group.add(h);
    this.heaps.mixed.position.set(HEAP.x, FLOOR.y, HEAP.z);
    k.world.scene.add(this.group);
    this.guide = new Guide(k, this);
    this.peaches = peachSpots(k.q.density < 0.7);
    this.resetFruit();
    for (const b of BEDS) this.dirtyBeds.add(b.id);
    this.dirtyField = this.dirtyYard = true;
    this.redraw();
    k.onDay.push((d) => this.onDay(d));
    this.wantSave = true;
  }

  // —— 账 ——
  bed(id: string): Bed { return this.st.beds[id]; }
  /** 某一畦改了（各件事调用）：重画、过一会儿存 */
  changed(bedId?: string) {
    if (bedId) this.dirtyBeds.add(bedId); else for (const b of BEDS) this.dirtyBeds.add(b.id);
    this.dirtyField = true; this.wantSave = true;
  }
  yardChanged() { this.dirtyYard = true; this.wantSave = true; }
  /** 做完一件农活：记一笔、田里的苗跟着长一点 */
  worked(text?: string) {
    const before = Object.values(this.st.beds).map((b) => b.stage + b.grow.toFixed(2)).join();
    Mo.work(this.st);
    if (Object.values(this.st.beds).map((b) => b.stage + b.grow.toFixed(2)).join() !== before) this.changed();
    this.wantSave = true;
    if (text) this.k.log({ kind: 'farm', text });
  }
  /** 头一回要种子、缸里要粮时：去年留的种 */
  gift(): boolean {
    if (this.st.gift) return false;
    this.st.gift = true; this.wantSave = true;
    const B = this.k.bag;
    this.k.note('灶屋梁上挂着去年留的种：麦种、谷种、豆种，还有几包菜籽。', 'farm');
    B.add('seedWheat', 3, { quiet: true }); B.add('seedMillet', 2, { quiet: true }); B.add('seedBean', 2, { quiet: true }); B.add('seedGreens', 3, { quiet: true });
    return true;
  }
  /** 家里缸里存的去年的粮（只取一回）：推磨、舂米时行囊里没有就先舀一些。返回取了没有 */
  pantry(item: 'wheat' | 'gu'): boolean {
    if (this.st.pantry[item]) return false;
    this.st.pantry[item] = true; this.wantSave = true;
    this.k.bag.add(item, 4, { quiet: true });
    this.k.note(item === 'wheat' ? '缸里还有去年的麦子，舀了四升。' : '囤里还有去年的谷子，舀了四升。', 'farm');
    return true;
  }
  save() { this.k.mem.set('farm', Mo.save(this.st)); this.wantSave = false; this.saveT = 0; }
  /** 账改了（地上放的担子之类，不必重画田）：过一会儿存 */
  saveSoon() { this.wantSave = true; }

  // —— 时间 ——
  private onDay(day: number) {
    // 过了一夜：肩上、路边的担子先安顿好（水倒了，麦捆谷穗邻家帮着挑到场边）
    this.guide.overnight();
    Mo.advance(this.st, NIGHT_BONUS, { rain: this.k.atmos.w.rain });
    this.st.day = day;
    this.resetFruitDaily();
    this.changed();
    this.save();
  }
  private grow(dt: number) {
    const h = this.k.atmos.hour;
    if (this.lastHour >= 0) { let dh = h - this.lastHour; if (dh < 0) dh += 24; if (dh > 0 && dh < 6) this.hourAcc += dh; }
    this.lastHour = h;
    // 下着雨：地慢慢湿透（不必等时辰）
    const rain = this.k.atmos.w.rain;
    if (rain > 0.5) { for (const b of Object.values(this.st.beds)) if (b.water < 1) { b.water = Math.min(1, b.water + dt * 0.02); this.dirtyBeds.add(b.id); } }
    if (this.hourAcc >= 0.5) {
      const before = Object.values(this.st.beds).map((b) => `${b.stage}${Math.round(b.weed * 8)}${Math.round(b.water * 6)}`).join();
      Mo.advance(this.st, this.hourAcc / 24, { rain });
      this.hourAcc = 0;
      if (Object.values(this.st.beds).map((b) => `${b.stage}${Math.round(b.weed * 8)}${Math.round(b.water * 6)}`).join() !== before) this.changed();
      this.wantSave = true;
    }
  }
  /** 换季（界面上换的、或存档里记的季对不上） */
  private syncSeason() {
    if (this.k.season === this.st.season) return;
    // 正做着田里的事就换了季：先放下（田里的样子要变了）
    if (this.k.act?.id.startsWith('farm:')) this.k.exitAct();
    Mo.changeSeason(this.st, this.k.season);
    this.resetFruit();
    this.changed(); this.yardChanged();
    this.save();
  }

  // —— 果子 ——
  private fruitSeason: Season | null = null;
  private resetFruit() {
    if (this.fruitSeason === this.k.season) return;
    this.fruitSeason = this.k.season;
    this.peachLeft = this.k.season === 'summer' ? this.peaches.length : 0;
    this.fallen = [];
    this.dirtyFruit = true;
  }
  private resetFruitDaily() { if (this.k.season === 'summer') this.peachLeft = Math.min(this.peaches.length, this.peachLeft + 4); this.dirtyFruit = true; }
  fruitChanged() { this.dirtyFruit = true; }

  // —— 画 ——
  private redraw() {
    const se = this.st.season;
    if (this.marginSeason !== se) { this.soil.drawMargin(se); this.marginSeason = se; }
    for (const id of this.dirtyBeds) { const b = this.st.beds[id]; if (b) this.soil.draw(b, se); }
    this.dirtyBeds.clear();
    this.soil.flush();
    if (this.dirtyField) { drawField(this.field, this.st, { season: se, density: this.k.q.density, snow: this.k.atmos.snowCover, weeds: this.weedOverride }); this.dirtyField = false; }
    if (this.dirtyYard) { drawYard(this.yard, this.st.floor); this.drawHeaps(); this.dirtyYard = false; }
    if (this.dirtyFruit) { this.drawFruit(); this.dirtyFruit = false; }
  }
  private drawHeaps() {
    const f = this.st.floor, m = this.heaps.mixed;
    const s = f.heap > 0 ? 0.55 + 0.45 * Math.min(1, f.heap / 16) : 0;
    m.visible = s > 0; m.scale.set(s * 1.1, s * (0.8 + 0.4 * Math.min(1, f.heap / 16)), s);
  }
  private drawFruit() {
    const P = this.fruit;
    P.begin();
    for (let i = 0; i < this.peachLeft && i < this.peaches.length; i++) { const p = this.peaches[i], u = h3(17, i, 0); P.put(p.x, p.y, p.z, 0.15 + 0.04 * u, T.fruit, [1, 0.8 - 0.06 * u, 0.72 - 0.05 * u], (u - 0.5) * 0.6, 0.3); }
    for (const f of this.fallen) P.put(f.x, f.y + 0.05, f.z, f.item === 'jujube' ? 0.1 : 0.15, T.fruit, f.c, 0, 0);
    P.end();
  }

  // —— 扁担 ——
  private poleOn = false;
  private updateCarry(t: number) {
    const k = this.k, B = k.bag, inAct = !!k.act;
    const sheaf = B.count('sheaf'), water = B.count('water'), ear = B.count('milletEar');
    const want = !inAct && (sheaf > 0 || water > 0 || ear > 0);
    const show = want || this.holdPole;
    if (show !== this.poleOn) {
      this.poleOn = show;
      // 扁担搭在右肩上：挂在小人的根上（+z 朝前、+x 是左手），一头在前、一头在后
      const root = k.player.av.root;
      if (show) {
        root.add(this.pole.group);
        const s = root.getWorldScale(new THREE.Vector3());
        this.pole.group.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
        this.pole.group.position.set(-0.16 / s.x, 1.3 / s.y, 0.03 / s.z);
        this.pole.base = this.pole.group.position.y;
      } else { this.pole.group.removeFromParent(); k.player.av.reach('R', null); }
    }
    if (show) {
      // 挑什么：麦捆、水、谷穗（挑麦、挑起那几件事里刚上肩、行囊还没记上时，照那件事说的挑）
      const hk = this.holdPole ? this.holdKind : null;
      if (hk === 'water') this.pole.set('water', Math.max(1, water)); else if (hk === 'ear') this.pole.set('ear', Math.max(2, ear));
      else if (sheaf > 0 || (this.holdPole && !water && !ear)) this.pole.set('sheaf', Math.max(2, sheaf)); else if (water > 0) this.pole.set('water', water); else this.pole.set('ear', ear);
      this.pole.bob(t, k.player.speed);
      // 右手扶着扁担前头
      const front = this.pole.group.localToWorld(new THREE.Vector3(0, 0, 0.42));
      k.player.av.reach('R', front, { rate: 12 });
    }
    // 挑着担子不跑（上肩时把「疾」也关了）；走得慢些（行者那边给了「步子快慢」的钩子就用上）
    const p = k.player as unknown as { run: boolean; pace?: number };
    if (want && !this.carrying && k.runLock) k.setRun(false);
    if (want) { if (p.run) p.run = false; if ('pace' in p) p.pace = 0.72; }
    else if (this.carrying && 'pace' in p) p.pace = 1;
    this.carrying = want;
  }
  get loaded() { return this.carrying; }

  // —— 每帧 ——
  tick(dt: number, t: number) {
    this.syncSeason();
    this.grow(dt);
    this.updateCarry(t);
    this.guide.update(dt, t);
    const w = U.uWind.value;
    this.bits.wind.set(w.x, Math.min(1, this.k.atmos.wind * 5), w.y);
    this.bits.update(dt);
    if (this.dirtyBeds.size || this.dirtyField || this.dirtyYard || this.dirtyFruit) this.redraw();
    this.saveT += dt;
    if (this.wantSave && this.saveT > 2.5) this.save();
  }

  // —— 给别人看的 ——
  /** 某一畦此刻是什么样（i 是 BEDS 里的次序或 id） */
  plotState(i: number | string) {
    const b = typeof i === 'number' ? this.st.beds[BEDS[i]?.id] : this.st.beds[i];
    if (!b) return null;
    const g = BED_GEO[b.id];
    return { id: b.id, name: g.name, crop: b.crop, cropName: b.crop ? CROPS[b.crop].name : '', stage: b.stage as Stage, stageName: STAGE_CN[b.stage], ripe: b.stage === 'ripe', water: b.water, weed: b.weed, sheaves: b.sheaves, rect: { x0: g.x0, x1: g.x1, z0: g.z0, z1: g.z1 } };
  }
  /** 邻家那片麦此刻该从哪里接着割（夏天才有；割完了 null） */
  reapSpot() {
    if (this.st.season !== 'summer') return null;
    const row = Mo.villageNext(this.st);
    if (row < 0) return null;
    const f = this.st.village[row], len = VILLAGE.x1 - VILLAGE.x0;
    return { x: VILLAGE.x0 + 0.6 + (len - 1.2) * f, z: VILLAGE.lines[row] + 0.45, yaw: Math.PI / 2, row, f };
  }
  /** 往前割 meters 米（村里人、行者都用）：返回这一下割完了一垄没有 */
  reapStep(meters: number, who: 'farmer' | 'player' = 'farmer') {
    const s = this.reapSpot();
    if (!s) return false;
    const len = VILLAGE.x1 - VILLAGE.x0 - 1.2, done = Mo.villageCut(this.st, s.row, s.f + meters / len);
    if (who === 'player' && done) this.st.helped++;
    this.dirtyField = true; this.wantSave = true;
    return done;
  }
}

/**
 * 离石桥最近那株桃的叶在哪（照草木那边长那株桃的法子，用同样的随机数再长一遍，取它夏天的叶）：桃子挂在叶底下。
 * 草木那边的长法变了，这里跟着变；取不到就在树冠上估一圈。
 */
function peachSpots(lite: boolean): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  try {
    const S = new Sink(), R = rand(PEACH.seed), y = groundOf(PEACH.x, PEACH.z);
    S.place(PEACH.x, y, PEACH.z, R.r(0, 6.283), PEACH.s);
    const bloom = R.r(0.78, 1.15), d = R.r(0.84, 1.03);
    growPeach(S, R, { tint: [1, d, d * R.r(0.98, 1.03)], bloom, lite });
    const leaves = S.dabs.fruitLeaf.filter((l) => l.y > y + 0.9 && l.y < y + 2.6).sort((a, b) => a.k - b.k);
    for (let i = 0; i < leaves.length && out.length < 16; i += Math.max(1, Math.floor(leaves.length / 16))) { const l = leaves[i]; out.push(new THREE.Vector3(l.x, l.y - l.size * 0.35, l.z)); }
  } catch { /* 取不到：下面估一圈 */ }
  if (out.length < 6) { const y = groundOf(PEACH.x, PEACH.z); for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; out.push(new THREE.Vector3(PEACH.x + Math.cos(a) * 1.2 * PEACH.s, y + 1.6 + 0.3 * Math.sin(i * 1.7), PEACH.z + Math.sin(a) * 1.2 * PEACH.s)); } }
  return out;
}
// —— 世界里只有一个安乐窝：农事挂在它身上 ——
let FARM: Farm | null = null;
const OWNER = new WeakMap<Anlewo, Farm>();
/** 取（没有就建）这一处安乐窝的农事 */
export function farmOf(k: Anlewo): Farm {
  let f = OWNER.get(k);
  if (!f) {
    const t0 = performance.now();
    f = new Farm(k); OWNER.set(k, f); FARM = f;
    k.timings.farm = Math.round(performance.now() - t0);
    k.world.tick.push((dt, t) => k.safe('farm', () => f!.tick(dt, t)));
    // 给调试与测试看（tests/play/farm.mjs）：账、模型的几样活计
    if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__farm = { farm: f, model: Mo };
  }
  return f;
}
/** 此刻的农事（还没建好是 null） */
export const farm = (): Farm | null => FARM;

/** 行者的某一畦此刻是什么样：{ id, name, crop, stage, ripe, … }；i 是 0…3 或 'west' 'east' 'vegE' 'vegW' */
export function farmPlotState(i: number | string) { return FARM?.plotState(i) ?? null; }
/** 行者的几畦在哪、此刻什么样 */
export function farmPlots() { return BEDS.map((b) => farmPlotState(b.id) ?? { id: b.id, name: BED_GEO[b.id].name, crop: null, cropName: '', stage: 'wild' as Stage, stageName: STAGE_CN.wild, ripe: false, water: 0, weed: 0, sheaves: 0, rect: { x0: BED_GEO[b.id].x0, x1: BED_GEO[b.id].x1, z0: BED_GEO[b.id].z0, z1: BED_GEO[b.id].z1 } }); }
/** 邻家那片麦该从哪儿接着割（夏天；割完了、不是夏天都是 null）：{ x, z, yaw, row, f } */
export function farmReapSpot() { return FARM?.reapSpot() ?? null; }
/** 往前割 meters 米：返回割完了一垄没有 */
export function farmReapStep(meters: number, who: 'farmer' | 'player' = 'farmer') { return FARM?.reapStep(meters, who) ?? false; }
