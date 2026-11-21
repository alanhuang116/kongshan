/**
 * 夏天的麦收：王家三口在王家那一片麦里（spots.ts 的 REAP）——王伯弯着腰一垄一垄地割，自西往东；
 * 二郎跟在后头捆麦（弯腰拢起、拧腰子、立起来）；王大娘和阿秀挎着篮在割过的垄上拾麦穗。
 *
 * 地是农事那一路的（src/world/farm，接口见 docs/FARM.md）：割到哪由它记（farmReapSpot 问从哪接着割，farmReapStep 往前割几米），
 * 割过的茬、隔一段立着的麦个子也由它画；行者也可以去帮着割，割的是同一片。
 * 农事那一块没装上时（台子上、或那边出了错），这里自己记割到哪、自己摆放倒的麦与麦个子（各是一张网，rig.ts 的 Parts），一天从头割起。
 */
import * as THREE from 'three';
import type { Season } from '../env/atmos';
import { Parts, trs } from './rig';
import type { Act, Ctx } from './person';
import * as P from './props';
import { REAP, footY } from './spots';
import { DOWN, UPV, during } from './chores';
import type { Kit } from './people';

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), M4 = new THREE.Matrix4();

/** 农事那一路给的（没装上就是 null）：从哪接着割、往前割几米、此刻那一片各垄割到几成 */
interface FarmApi {
  farmReapSpot(): { x: number; z: number; yaw: number; row: number; f: number } | null;
  farmReapStep(meters: number, who?: 'farmer' | 'player'): boolean;
  farm(): { st: { village: number[] } } | null;
}
let FARM: FarmApi | null = null;
for (const load of Object.values(import.meta.glob<FarmApi>('../farm/index.ts'))) load().then((m) => { FARM = m; }).catch(() => undefined);
/** 农事那一路此刻管着那一片麦没有 */
const farmOn = () => !!FARM?.farm?.();

export interface Harvest {
  /** 王伯割麦、二郎捆麦、拾麦穗（王大娘、阿秀） */
  reap: Act; bind: Act; glean: Act;
  /** 每帧：过了夜从头来；不是夏天就收起 */
  tend(c: Ctx): void;
  /** 割了几成（给说话那一路：「割了一半了」） */
  readonly progress: number;
}

/** 自己记的时候：放倒的麦最多同时有几抱、麦个子最多立几个 */
const NC = 18, NS = 64;

export function makeHarvest(k: Kit): Harvest {
  const mat = P.propMats().wood;
  const cuts = new Parts(mat, 'cut-wheat'), sheaves = new Parts(mat, 'sheaves');
  const cg = P.cutWheatGeo(), sg = P.sheafGeo();
  for (let i = 0; i < NC; i++) cuts.add(cg);
  for (let i = 0; i < NS; i++) sheaves.add(sg);
  cuts.build(); sheaves.build();
  for (let i = 0; i < NC; i++) cuts.hide(i);
  for (let i = 0; i < NS; i++) sheaves.hide(i);
  cuts.commit(); sheaves.commit();
  k.group.add(cuts.mesh, sheaves.mesh);

  /** 自己记的那一份：割到第几垄、垄上哪里（0 西头 … 1 东头）；地上放倒的麦（等着捆）；立了几个麦个子 */
  const H = { lane: 0, u: 0.02, lying: [] as Array<{ x: number; z: number; slot: number }>, free: Array.from({ length: NC }, (_, i) => i), nSheaf: 0, started: false, lastHour: 0, season: '' as Season | '' };
  const dirty = { c: false, s: false };
  const reset = () => {
    H.lane = 0; H.u = 0.02; H.lying.length = 0; H.free = Array.from({ length: NC }, (_, i) => i); H.nSheaf = 0; H.started = false;
    for (let i = 0; i < NC; i++) cuts.hide(i);
    for (let i = 0; i < NS; i++) sheaves.hide(i);
    dirty.c = dirty.s = true;
  };
  /** 立一个麦个子（略歪一点） */
  const stand = (x: number, z: number) => {
    const i = H.nSheaf % NS; H.nSheaf++;
    sheaves.place(i, trs(M4, x, footY(x, z) - 0.02, z, (x * 7.3 + z * 3.1) % 6.28, ((x * 13.7) % 1 - 0.5) * 0.16, ((z * 11.3) % 1 - 0.5) * 0.16));
    dirty.s = true;
  };
  /** 按钟点估割了几垄：早上 6.6 开镰、晌午歇一个半时辰，一个时辰割一垄多 */
  const guess = (h: number) => Math.max(0, Math.min(REAP.lanes - 1, Math.floor((h - 6.6 - (h > 13 ? 1.5 : h > 11.5 ? h - 11.5 : 0)) * 1.2)));
  const prefill = (h: number) => {
    const n = guess(h);
    for (let l = 0; l < n; l++) if (l % 2 === 0) for (let u = 0.06; u < 0.98; u += 3 / REAP.len) { const a = REAP.lane(l, u); stand(a.x, a.z + 0.05); }
    H.lane = n; H.u = 0.02; H.started = true;
  };
  /** 此刻接着割的那一点：农事那一路管着就问它，不然看自己记的 */
  const next = (): { x: number; z: number; yaw: number; row: number; f: number } | null => {
    if (farmOn()) return FARM!.farmReapSpot();
    if (H.lane >= REAP.lanes) return null;
    const a = REAP.lane(H.lane, H.u);
    return { x: a.x, z: a.z, yaw: REAP.dir, row: H.lane, f: H.u };
  };
  /** 往前割了 m 米：返回割完了一垄没有 */
  const step = (m: number): boolean => {
    if (farmOn()) return FARM!.farmReapStep(m, 'farmer');
    H.u += m / REAP.len;
    if (H.u >= 0.98) { H.u = 0.02; H.lane++; return true; }
    return false;
  };
  /** 某一垄割到了几成（拾穗、捆麦找地方用） */
  const cutOf = (row: number): number => { if (farmOn()) return FARM!.farm()!.st.village[row] ?? 0; return row < H.lane ? 1 : row === H.lane ? H.u : 0; };
  const begin = (p: { snap: boolean }, c: Ctx) => { if (!H.started && !farmOn()) { if (p.snap && c.hour > 7) prefill(c.hour); H.started = true; } };

  const sickle = P.sickle(), earBaskets = [P.earBasket(), P.earBasket()];
  sickle.visible = false; for (const b of earBaskets) b.visible = false;

  /** 王伯割麦：左手揽住一把麦秆，右手的镰贴着地一拉；三把攒成一抱放倒在身后，往前挪半步；一垄到头直起腰，到下一垄的西头接着割 */
  const reap: Act = function* (p, c) {
    const f = p.fig;
    begin(p, c);
    let s = next();
    if (!s) {
      // 割完了：坐在地头歇着，看看麦个子
      yield* k.toField(p, c, REAP.bund);
      yield* p.sit();
      yield* p.forever((t) => { f.bow = 0.08 + 0.05 * Math.sin(t * 0.3); });
      return;
    }
    yield* k.toField(p, c, { x: s.x, z: s.z, yaw: s.yaw });
    p.pose('stand'); p.hold(sickle, 'R');
    const grab = (u: number) => f.reach('L', p.loc(lerp(0.1, 0.16, u), lerp(0.55, 0.32, u), lerp(0.4, 0.5, u), v1), { dir: p.dir(-0.3, -0.5, 0.8, v2), palm: p.dir(-1, 0, 0, v3), rate: 12 });
    const cut = (u: number) => f.reach('R', p.loc(lerp(-0.34, 0.12, u), 0.22 + 0.06 * Math.sin(u * Math.PI), lerp(0.42, 0.5, u), v1), { dir: p.dir(lerp(0.2, 0.9, u), -0.2, 0.6, v2), palm: p.dir(0.3, 0.2, 1, v3), rate: 16 });
    p.rest = () => { f.reach('L', null); f.reach('R', null); f.bow = 0.25; };
    for (let n = 0; ; n++) {
      for (let i = 0; i < 3; i++) {
        yield* p.tween(0.55, (u) => { f.bow = lerp(f.bow, 0.78, u); grab(u); cut(0); });
        yield* p.tween(0.32, (u) => { grab(1); cut(u); });
        c.sfx('sickle', p.pos.x, p.pos.z, 0.45 + 0.2 * k.R());
        yield* p.wait(0.15);
      }
      // 一抱放倒在身后
      yield* p.tween(0.7, (u) => { f.reach('L', p.loc(lerp(0.16, -0.36, u), lerp(0.32, 0.12, u), lerp(0.5, 0.0, u), v1), { dir: DOWN, rate: 10 }); cut(1); });
      if (!farmOn()) {
        const d = p.loc(-0.5, 0, -0.1, v4), slot = H.free.shift();
        if (slot != null) { cuts.place(slot, trs(M4, d.x, footY(d.x, d.z), d.z, p.yaw + Math.PI / 2 + 0.3 * Math.sin(n), 0, 0)); H.lying.push({ x: d.x, z: d.z, slot }); dirty.c = true; }
      }
      f.reach('L', null);
      const done = step(0.55);
      s = next();
      if (!s) { yield* p.tween(1.2, (u) => { f.bow = lerp(0.78, 0.05, u); }); f.reach('R', null); yield* p.forever(() => undefined); return; }
      if (done) {
        // 一垄到了头：直起腰，抬手擦把汗，走到下一垄的西头
        yield* p.tween(1.2, (u) => { f.bow = lerp(0.78, 0.05, u); });
        yield* p.tween(2.2, () => { f.reach('L', p.loc(0.07, 1.47, 0.13, v1), { dir: p.dir(-0.7, 0.5, 0.2, v2), rate: 7 }); });
        f.reach('L', null);
        yield* p.wait(1.5);
        yield* p.go({ x: s.x, z: s.z, yaw: s.yaw }, 0.8, undefined, true);
      } else yield* during(p.go({ x: s.x, z: s.z, yaw: s.yaw }, 0.35, undefined, true), () => { f.bow = 0.6; cut(0.2); });
    }
  };

  /** 二郎捆麦：跟在爹后头，走到放倒的那一抱跟前，弯腰拢起来，抽两根麦秆拧成腰子一捆，立起来；没有可捆的就站着等一等 */
  const bind: Act = function* (p, c) {
    const f = p.fig;
    begin(p, c);
    const behind = () => { const s = next(); if (!s) return null; const a = REAP.lane(s.row, Math.max(0, s.f - 0.1)); return { x: a.x - 0.1, z: a.z + 0.9 }; };
    const b0 = behind();
    yield* p.go(b0 ?? REAP.bund2, 1.0);
    p.pose('stand');
    p.rest = () => { f.reach('L', null); f.reach('R', null); f.bow = 0.1; };
    for (;;) {
      let at: { x: number; z: number } | null = null;
      if (farmOn()) {
        // 农事那一路管着：割过的那一截上，爹身后两三米处就有放倒的麦
        const b = behind();
        if (b && Math.hypot(b.x - p.pos.x, b.z - p.pos.z) > 1.2) at = b;
        else if (b) at = { x: p.pos.x + 0.05, z: p.pos.z };
      } else {
        const it = H.lying.shift();
        if (it) { at = { x: it.x + 0.45, z: it.z + 0.05 }; cuts.hide(it.slot); H.free.push(it.slot); dirty.c = true; stand(it.x, it.z); }
      }
      if (!at) { for (let t = 0, T = k.rnd(3, 6); t < T; t += p.dt) { f.bow = 0.08; yield; } continue; }
      if (Math.hypot(at.x - p.pos.x, at.z - p.pos.z) > 0.4) yield* p.go({ x: at.x, z: at.z, yaw: -Math.PI / 2 }, 0.85, undefined, true);
      yield* p.tween(0.9, (u) => { f.bow = 0.8 * u; });
      // 两手拢起来
      yield* p.tween(0.8, (u) => { f.reach('L', p.loc(0.18 - 0.1 * u, 0.12 + 0.1 * u, 0.42, v1), { dir: DOWN, palm: p.dir(-1, 0, 0, v2), rate: 12 }); f.reach('R', p.loc(-0.18 + 0.1 * u, 0.12 + 0.1 * u, 0.42, v3), { dir: DOWN, palm: p.dir(1, 0, 0, v2), rate: 12 }); });
      // 拧腰子：两手绕着转两圈
      for (let t = 0; t < 1.6; t += p.dt) {
        const a = t * 7;
        f.reach('L', p.loc(0.06 + 0.06 * Math.cos(a), 0.3 + 0.05 * Math.sin(a), 0.42, v1), { dir: DOWN, rate: 18 });
        f.reach('R', p.loc(-0.06 - 0.06 * Math.cos(a), 0.3 - 0.05 * Math.sin(a), 0.42, v3), { dir: DOWN, rate: 18 });
        yield;
      }
      c.sfx('sheaf', p.pos.x, p.pos.z, 0.4);
      // 立起来
      yield* p.tween(0.9, (u) => { f.bow = lerp(0.8, 0.35, u); f.reach('L', p.loc(0.08, lerp(0.3, 0.55, u), 0.42, v1), { dir: DOWN, rate: 12 }); f.reach('R', p.loc(-0.08, lerp(0.3, 0.55, u), 0.42, v3), { dir: DOWN, rate: 12 }); });
      f.reach('L', null); f.reach('R', null);
      yield* p.tween(0.7, (u) => { f.bow = lerp(0.35, 0.05, u); });
      yield* p.wait(k.rnd(1.5, 4));
    }
  };

  /** 拾麦穗：左臂挎着篮，在割过的垄上慢慢走，看见一个就弯腰拾起来放进篮里 */
  let gl = 0;
  const glean: Act = function* (p, c) {
    const f = p.fig, basket = earBaskets[gl++ % earBaskets.length];
    begin(p, c);
    p.pose('stand'); p.hold(basket, 'L');
    const carry = () => f.reach('L', p.loc(0.2, 0.94, 0.2, v4), { dir: DOWN, palm: p.dir(-1, 0, 0.2, v3), rate: 16 });
    p.rest = () => { carry(); f.reach('R', null); };
    for (;;) {
      // 拾的地方：已经割过的垄上（一垄还没割完，就在割过的那一截上）
      const s = next(), row0 = s ? s.row : REAP.lanes - 1;
      let row = Math.max(0, row0 - Math.floor(k.R() * Math.min(4, row0 + 1)));
      if (cutOf(row) < 0.05) row = Math.max(0, row - 1);
      const span = Math.max(0.05, cutOf(row)), a = REAP.lane(row, span * (0.1 + 0.85 * k.R()));
      yield* during(p.go({ x: a.x + (k.R() - 0.5) * 0.4, z: a.z + (k.R() - 0.5) * 0.5, yaw: k.R() < 0.5 ? Math.PI / 2 : -Math.PI / 2 }, 0.6, undefined, Math.hypot(a.x - p.pos.x, a.z - p.pos.z) < 30), carry);
      for (let n = 0, N = 2 + Math.floor(k.R() * 3); n < N; n++) {
        const lx = -0.1 + 0.2 * k.R(), lz = 0.35 + 0.15 * k.R();
        yield* p.tween(0.9, (w) => { carry(); f.bow = 0.82 * w; f.reach('R', p.loc(lx - 0.12, lerp(0.7, 0.06, w), lz, v1), { dir: p.dir(0, -0.8, 0.5, v2), rate: 10 }); });
        yield* p.wait(0.3);
        if (n === 0) c.sfx('pluck', p.pos.x, p.pos.z, 0.2);
        yield* p.tween(0.9, (w) => { carry(); f.bow = 0.82 * (1 - w) + 0.1; f.reach('R', p.loc(lerp(lx - 0.12, 0.12, w), lerp(0.06, 0.95, w), lerp(lz, 0.25, w), v1), { dir: DOWN, palm: UPV, rate: 10 }); });
        f.reach('R', null);
        yield* p.wait(0.4);
      }
      f.bow = 0.05;
      yield* during(p.wait(k.rnd(0.8, 2.5)), carry);
    }
  };

  return {
    reap, bind, glean,
    get progress() { let sum = 0; for (let r = 0; r < REAP.lanes; r++) sum += cutOf(r); return Math.min(1, sum / Math.max(1, REAP.lanes)); },
    tend(c) {
      // 自己记的那一份：过了夜（钟点倒回去）、或换了季，地里收拾干净，第二天从头割
      if (c.hour < H.lastHour - 12 || (H.season && H.season !== c.season)) reset();
      H.lastHour = c.hour; H.season = c.season;
      if ((c.season !== 'summer' || farmOn()) && (H.started || H.nSheaf)) reset();
      if (dirty.c) { cuts.commit(); dirty.c = false; }
      if (dirty.s) { sheaves.commit(); dirty.s = false; }
      cuts.mesh.visible = sheaves.mesh.visible = c.season === 'summer' && !farmOn();
    },
  };
}
