/**
 * 田里的事（行者自己那几畦，与挨着的邻家麦）：
 *   翻地 —— 按住举锄、松手落下；举到朱色那一段再落，一锄翻得深。一锄一步，顺着垄翻过去，一垄翻完掉头翻下一垄。
 *   下种 —— 先从行囊里挑种（这一季能下的那几样），挎上篮子；按住，一边走一边一把一把撒。
 *   浇水 —— 行囊里得有水（溪边、井上打来）；按住，拿瓢一瓢一瓢地泼，看着土墒那道表，到朱色那一段就够了。
 *   锄草 —— 垄沟里的草上各钉一枚小签；点哪一棵，人走过去蹲下拔掉。
 *   割麦 —— 按住，一镰一镰割过去，割下的顺着垄铺成一溜；一垄割完，按住「捆」，一捆一捆捆好立在地里。
 *   掐穗、拔豆、摘菜 —— 按住，顺着垄一穗一穗掐、一棵一棵拔、一棵一棵摘，收进篮里（行囊）。
 *   挑麦 —— 捆好的麦挑上肩（行囊里的麦捆），挑到晒场上去打。地头邻家帮着收下的，「取回」。
 *   挑起 —— 放在地上的担子（自己「放下」的、进屋前放在门外的、邻家码在场边的）重新挑上肩。挑到哪儿、怎么走见 farm/guide.ts。
 *   帮割 —— 夏天邻家王伯的麦熟了，帮着割一截。
 * 各件事做到一半走开，下回从做到的地方接着做（spot 跟着挪）。夜里看不清、冬天地冻，不做。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from './types';
import { BED_CROPS, CROPS, QUOTES, TIPS, type CropId } from '../../data/farm';
import { itemText, qtyCn } from '../bag';
import { farmOf, type Farm } from '../farm';
import * as Mo from '../farm/model';
import { spec } from '../farm/model';
import { BED_GEO, FLOOR, PLOT, rowAt, rowLen, rowPoint, type BedGeo } from '../farm/layout';
import { h3 } from '../farm/paint';
import { ladle, seedBasket, sickle, bucketGeo, mats } from '../farm/props';
import { Guide, what } from '../farm/guide';
import { hoe as hoeMesh } from '../life/props';
import { ground as groundOf } from '../site';
import { BYE, Cam, Press, UPV, base, chain, clamp01, dirL, ease, grip, lerp, loc, movable, view, walk, walkVia, type FAct } from '../farm/actkit';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
/** 镜头从哪一边看这一畦（0 南、π 北、π/2 东） */
const CAM_SIDE: Record<string, number> = { west: PI, east: PI, vegE: PI / 2, vegW: -PI / 2 };
const bedCenter = (g: BedGeo) => V((g.x0 + g.x1) / 2, g.y((g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2), (g.z0 + g.z1) / 2);
const cropName = (c: CropId | null) => (c ? CROPS[c].name : '');
/** 从田里到晒场：石桥南头 → 北头 → 村路 → 晒场南边 */
const ROUTE_TO_FLOOR: Array<[number, number]> = [[0.3, 35.6], [0.3, 23.5], [16, 22.4], [34, 21], [50, 17.2], [FLOOR.x + 0.5, FLOOR.z + 4.2]];

/** 做一垄一垄的活时，镜头从侧面跟着人，略往前看 */
function rowCam(k: Anlewo, cam: Cam, g: BedGeo, dist = 5.4, h = 2.3) {
  const p = k.player.pos, fy = CAM_SIDE[g.id] ?? PI, f = dirL(k, 0, 0, 1);
  const c = V(p.x + f.x * 0.9, p.y, p.z + f.z * 0.9), v = view(c, fy, dist, h, 0.55);
  return v;
}

// ———————————————————————————— 翻地 ————————————————————————————
function till(k: Anlewo, F: Farm, g: BedGeo): Act {
  const { state, set, put, undo, restore } = base(k);
  const tool = hoeMesh(); tool.visible = false;
  const cam = new Cam(k), press = new Press();
  let row = 0, phase: 'ready' | 'raise' | 'strike' | 'step' | 'done' = 'ready', t = 0, power = 0, strikes = 0, mv: { done: boolean } | null = null;
  const b = () => F.bed(g.id);
  const total = () => b().rows.reduce((a, v) => a + v, 0) / g.rows;
  /** 锄的姿势：kk = 0 锄头落在身前地上，1 举到头前 */
  const swing = (kk: number) => {
    const av = k.player.av, r = loc(k, -0.13, 0.9 + 0.12 * kk, 0.2), d = new THREE.Vector3(0.16, lerp(-0.74, 0.36, kk), lerp(0.655, 0.92, kk)).normalize();
    const wd = dirL(k, d.x, d.y, d.z);
    av.reach('R', r, { dir: wd, palm: UPV, rate: 18 });
    av.reach('L', r.clone().addScaledVector(wd, 0.5), { dir: wd, palm: UPV, rate: 18 });
    av.bow = lerp(0.42, 0.14, kk);
  };
  const ui = (extra: Record<string, unknown> = {}) => set({
    title: '翻地', ...chain(null, '翻地'), hint: strikes === 0 ? '按住举锄，松手落下；举到朱色那一段再落，翻得深' : '',
    hold: { id: 'hoe', label: '锄', v: power }, meter: { v: power, lo: 0.62, hi: 0.94, label: '力道' }, progress: total(),
    keys: [{ key: '空格', label: '按住举锄，松开落锄' }], choices: [BYE], ...extra,
  });
  const spotNow = () => {
    const bb = b(), r = bb.op === 'till' ? Math.max(0, Mo.nextRow(bb)) : 0, f = bb.op === 'till' ? bb.rows[r] : 0, s = rowPoint(g, r, f);
    const c = bedCenter(g);
    movable(act, s.x, s.z, s.yaw, c.x - (g.x1 - g.x0) * 0.2, c.y + 1.3, c.z);
  };
  const act: FAct = {
    id: `farm:till:${g.id}`, name: '翻地', anchor: V(0, 0, 0), spot: { x: 0, z: 0, yaw: 0 }, radius: 4.5, state, noZoom: true,
    on() {
      const bb = b();
      if (k.season === 'winter' || k.atmos.night > 0.62) return false;
      const ok = bb.stage === 'wild' || bb.stage === 'stubble' || (bb.op === 'till' && !Mo.opDone(bb));
      if (ok && !k.act) spotNow();
      return ok;
    },
    enter() {
      press.reset(); power = 0; strikes = 0; phase = 'ready';
      const bb = b();
      Mo.begin(bb, 'till');
      row = Math.max(0, Mo.nextRow(bb));
      k.player.av.setHands('free');
      grip(k, undo, tool, 'R');
      swing(0);
      const v = rowCam(k, cam, g); cam.start(v.pos, v.look, 40, 1.5);
      ui();
    },
    exit() { restore(); const av = k.player.av; av.reach('L', null); av.reach('R', null); av.bow = 0; spotNow(); act.spot.x = k.player.pos.x; act.spot.z = k.player.pos.z; F.changed(g.id); },
    update(dt) {
      const e = press.step(dt), bb = b();
      t += dt;
      const v = rowCam(k, cam, g); cam.aim(v.pos, v.look); cam.update(dt);
      if (phase === 'done') return;
      if (phase === 'step') { swing(0.12); if (!mv || mv.done) phase = 'ready'; }
      if (phase === 'ready') {
        swing(0.05 + 0.03 * Math.sin(t * 2));
        if (press.down) { phase = 'raise'; power = 0; }
      }
      if (phase === 'raise') {
        // 举：按得越久举得越高；举过了头（过了朱色那一段）就往回落一点
        const hold = press.t;
        power = hold < 0.85 ? ease(hold / 0.85) * 0.97 : Math.max(0.7, 0.97 - (hold - 0.85) * 0.35);
        swing(power);
        put({ meter: { v: power, lo: 0.62, hi: 0.94, label: '力道' }, hold: { id: 'hoe', label: '锄', v: power } }, true);
        if (e.released || !press.down) { phase = 'strike'; t = 0; }
      }
      if (phase === 'strike') {
        const kk = 1 - ease(t / 0.24);
        swing(power * kk);
        if (t >= 0.24) {
          // 落锄：翻多少看力道
          const q = power >= 0.62 && power <= 0.94 ? 1 : power < 0.62 ? 0.35 + power * 0.6 : 0.7;
          const L = rowLen(g), was = bb.rows[row], f = Math.min(1, was + (1.25 * (0.55 + 0.45 * q)) / L);
          const hit = loc(k, 0.02, 0.05, 0.62);
          F.bits.emit('clod', hit, V(0, 1.4 + q, 0), 4 + Math.round(q * 4), 0.9, hit.y - 0.05);
          k.sfxAt('hoe', { x: hit.x, z: hit.z, vel: 0.45 + 0.4 * q }); k.buzz(q > 0.9 ? 14 : 6);
          strikes++;
          const done = Mo.till(bb, row, f);
          F.changed(g.id);
          power = 0;
          if (done) {
            phase = 'done'; F.worked(`翻了${g.name}`);
            k.player.av.bow = 0.1;
            set({ title: '翻地', ...chain(null, '下种'), text: `${g.name}翻好了，土是新的，起了垄。${k.season === 'winter' ? '' : '这一季能下的种：' + Mo.sowable(spec(g.id).kind, k.season).map((c) => CROPS[c].name).join('、') + '。'}`, progress: 1, done: true, choices: Mo.sowable(spec(g.id).kind, k.season).length ? [{ id: 'sow', label: '就下种', main: true }, BYE] : [BYE] });
            return;
          }
          // 往前挪一步；这一垄翻完了，挪到下一垄的头上（掉过头来）
          const nr = Mo.nextRow(bb);
          if (nr !== row) row = nr;
          const s = rowPoint(g, row, bb.rows[row]);
          mv = walk(k, s.x, s.z, s.yaw);
          phase = 'step';
          ui({ hint: q >= 1 ? '' : power > 0.94 ? '举过了头，早一点松手' : '举高些再落' });
        }
      }
    },
    input: { tap() { if (phase === 'ready') { press.cmd('down'); setTimeout(() => press.cmd('up'), 650); } return true; } },
    cmd(c, arg) {
      if (c === 'hoe') press.cmd(arg);
      else if (c === 'sow') { k.exitAct(); setTimeout(() => k.enterAct(`farm:sow:${g.id}`), 60); }
      else if (c === 'done') k.exitAct();
    },
  };
  spotNow();
  return act;
}

// ———————————————————————————— 下种 ————————————————————————————
function sowAct(k: Anlewo, F: Farm, g: BedGeo): Act {
  const { state, set, put, undo, restore } = base(k);
  const basket = seedBasket(); basket.visible = false;
  const cam = new Cam(k), press = new Press();
  const kind = spec(g.id).kind;
  let crop: CropId | null = null, row = 0, phase: 'pick' | 'walk' | 'done' | 'none' = 'pick', t = 0, castT = 0, casts = 0, mv: { done: boolean } | null = null;
  const b = () => F.bed(g.id);
  const seedsNow = () => Mo.sowable(kind, k.season).flatMap((c) => CROPS[c].seeds.map((id) => ({ id, crop: c })));
  const total = () => b().rows.reduce((a, v) => a + v, 0) / g.rows;
  const spotNow = () => {
    const bb = b(), r = bb.op === 'sow' ? Math.max(0, Mo.nextRow(bb)) : 0, s = rowPoint(g, r, bb.op === 'sow' ? bb.rows[r] : 0), c = bedCenter(g);
    movable(act, s.x, s.z, s.yaw, c.x, c.y + 1.3, c.z);
  };
  const pickUi = () => {
    const list = seedsNow();
    const items = list.map((s) => ({ id: s.id, n: k.bag.count(s.id) }));
    if (!items.some((i) => i.n > 0)) { phase = 'none'; set({ title: '下种', ...chain(null, '下种'), text: `${TIPS.noSeed}这一季${g.name}能种${Mo.sowable(kind, k.season).map((c) => CROPS[c].name).join('、') || '的没有'}。`, choices: [BYE] }); return; }
    set({ title: '下种', ...chain(Mo.sowable(kind, k.season)[0], '下种'), text: `种这一畦要用一升种子；行囊里有${list.filter((s) => k.bag.has(s.id)).map((s) => itemText(s.id, k.bag.count(s.id))).join('、')}。\n这一季能下：${Mo.sowable(kind, k.season).map((c) => `${CROPS[c].name}（${CROPS[c].note}）`).join('\n')}`, hint: '挑一样种子', items, choices: [BYE] });
  };
  const walkUi = () => set({ title: `种${cropName(crop)}`, ...chain(crop, '下种'), hint: casts === 0 ? '按住，一边走一边撒；松手停下' : '', hold: { id: 'sow', label: '撒', v: total() }, progress: total(), keys: [{ key: '空格', label: '按住撒种' }], choices: [BYE] });
  const startWalk = () => {
    const bb = b();
    Mo.begin(bb, 'sow');
    row = Math.max(0, Mo.nextRow(bb));
    phase = 'walk'; casts = 0;
    grip(k, undo, basket, 'L', [0, 0.02, 0.06], [0, 0, 0]);
    walkUi();
  };
  const act: FAct = {
    id: `farm:sow:${g.id}`, name: '下种', anchor: V(0, 0, 0), spot: { x: 0, z: 0, yaw: 0 }, radius: 4.5, state, noZoom: true,
    on() {
      const bb = b();
      if (k.atmos.night > 0.62 || !Mo.sowable(kind, k.season).length) return false;
      const ok = bb.stage === 'tilled';
      if (ok && !k.act) spotNow();
      return ok;
    },
    enter() {
      press.reset(); t = 0;
      if (!seedsNow().some((s) => k.bag.has(s.id))) F.gift();
      k.player.av.setHands('free');
      const v = rowCam(k, cam, g, 5.0, 2.2); cam.start(v.pos, v.look, 40, 1.5);
      const bb = b();
      // 撒了一半走开的：接着撒同一样
      if (bb.op === 'sow' && crop && Mo.nextRow(bb) >= 0) { startWalk(); return; }
      crop = null; phase = 'pick'; pickUi();
    },
    exit() { restore(); k.player.av.reach('L', null); k.player.av.reach('R', null); spotNow(); act.spot.x = k.player.pos.x; act.spot.z = k.player.pos.z; },
    update(dt) {
      const e = press.step(dt), av = k.player.av, bb = b();
      void e;
      t += dt;
      const v = rowCam(k, cam, g, 5.0, 2.2); cam.aim(v.pos, v.look); cam.update(dt);
      if (phase !== 'walk' || !crop) return;
      const L = rowLen(g);
      // 撒：右手伸进篮里抓一把，往右前方一扬
      const bp = av.joints.handL.getWorldPosition(new THREE.Vector3()).add(V(0, 0.05, 0));
      if (press.down) {
        castT += dt;
        const u = (castT % 0.95) / 0.95;
        const out = loc(k, -0.55, 1.0, 0.5);
        const tgt = u < 0.4 ? bp : bp.clone().lerp(out, ease((u - 0.4) / 0.35));
        av.reach('R', tgt, { rate: 14 });
        av.bow = 0.12;
        if (u >= 0.62 && (castT - dt) % 0.95 / 0.95 < 0.62) {
          casts++;
          const hand = av.joints.handR.getWorldPosition(new THREE.Vector3());
          F.bits.emit('seed', hand, dirL(k, -1.2, 0.8, 1.4).multiplyScalar(2.2), 9, 0.9, g.y(hand.x, hand.z) + 0.04);
          k.sfx('sow', { vel: 0.4 });
        }
        // 人顺着垄往前走；走到哪儿撒到哪儿
        const here = rowAt(g, k.player.pos.x, k.player.pos.z);
        if (here && here.row === row) { const f = Math.max(bb.rows[row], here.f); if (f > bb.rows[row] + 0.02) { Mo.sow(bb, row, f, crop, k.season); F.changed(g.id); put({ progress: total(), hold: { id: 'sow', label: '撒', v: total() } }, true); } }
        if (!mv || mv.done) {
          if (bb.rows[row] >= 0.97) {
            if (Mo.sow(bb, row, 1, crop, k.season)) { finish(); return; }
            row = Math.max(0, Mo.nextRow(bb));
            const s = rowPoint(g, row, 0); mv = walk(k, s.x, s.z, s.yaw);
          } else { const s = rowPoint(g, row, Math.min(1, bb.rows[row] + 0.9 / L)); mv = walk(k, s.x, s.z, s.yaw); }
        }
      } else {
        castT = 0; av.reach('R', null); av.bow = 0;
        if (mv && !mv.done) { k.player.stop(); mv = null; }
      }
    },
    cmd(c, arg) {
      if (c === 'item' && phase === 'pick') {
        const s = seedsNow().find((x) => x.id === arg);
        if (!s || !k.bag.take(s.id, 1, { verb: '用了' })) return;
        crop = s.crop;
        startWalk();
      } else if (c === 'sow') press.cmd(arg);
      else if (c === 'done') k.exitAct();
    },
  };
  const finish = () => {
    phase = 'done'; press.reset();
    k.player.stop(); k.player.av.reach('R', null); k.player.av.bow = 0;
    F.changed(g.id); F.worked(`种下${g.name}的${cropName(crop)}`);
    set({ title: `种${cropName(crop)}`, ...chain(crop, '浇水'), text: `${g.name}种上了${cropName(crop)}。${crop ? CROPS[crop].note : ''}\n浇一遍水，出苗快些；睡一夜，或者再做几件活，苗就出来了。`, progress: 1, done: true, choices: [BYE] });
  };
  spotNow();
  return act;
}

// ———————————————————————————— 浇水 ————————————————————————————
function waterAct(k: Anlewo, F: Farm, g: BedGeo): Act {
  const { state, set, put, undo, restore } = base(k);
  const gourd = ladle(); gourd.visible = false;
  const pail = new THREE.Mesh(bucketGeo(0.15, 0.18, 0.32, 0.82), mats().wood); pail.name = 'farm:pail'; pail.visible = false;
  const cam = new Cam(k), press = new Press();
  let phase: 'pour' | 'done' | 'none' = 'pour', t = 0, pours = 0, inPail = 0;
  const b = () => F.bed(g.id);
  const spotNow = () => {
    const c = bedCenter(g), out = g.axis === 'x' ? V(c.x + 1.2, 0, g.z0 - 0.55) : V(g.id === 'vegE' ? g.x1 + 0.55 : g.x0 - 0.55, 0, c.z);
    const yaw = Math.atan2(c.x - out.x, c.z - out.z);
    movable(act, out.x, out.z, yaw, c.x + (g.x1 - g.x0) * 0.22, c.y + 1.3, c.z);
  };
  const meter = () => ({ v: clamp01(b().water / 1.1), lo: 0.64, hi: 0.93, label: '土墒' });
  const ui = (extra: Record<string, unknown> = {}) => set({ title: '浇水', ...chain(b().crop, '浇水'), hint: pours === 0 ? `用行囊里的${qtyCn(k.bag.count('water'))}桶水：按住，一瓢一瓢地泼；表到朱色那一段就够了` : '', hold: { id: 'pour', label: '浇' }, meter: meter(), count: k.bag.count('water'), keys: [{ key: '空格', label: '按住浇' }], choices: [BYE], ...extra });
  const act: FAct = {
    id: `farm:water:${g.id}`, name: '浇水', anchor: V(0, 0, 0), spot: { x: 0, z: 0, yaw: 0 }, radius: 4.5, state, noZoom: true,
    on() {
      const bb = b();
      if (k.atmos.night > 0.62 || k.season === 'winter' || k.atmos.w.rain > 0.4) return false;
      const ok = !!bb.crop && (bb.stage === 'sown' || bb.stage === 'sprout' || bb.stage === 'growing') && bb.water < 0.62;
      if (ok && !k.act) spotNow();
      return ok;
    },
    enter() {
      press.reset(); pours = 0; t = 0;
      const c = bedCenter(g), v = view(c.clone().lerp(k.player.pos, 0.45), (CAM_SIDE[g.id] ?? PI) + 0.5, 5.6, 2.6, 0.4);
      cam.start(v.pos, v.look, 42, 1.5);
      if (!k.bag.has('water')) { phase = 'none'; set({ title: '浇水', ...chain(b().crop, '浇水'), text: TIPS.noWater + (g.axis === 'x' ? '石桥西边的溪岸就能打。' : '菜畦往南，过了院前的坡就是溪。'), meter: meter(), choices: [BYE] }); return; }
      phase = 'pour';
      k.player.av.setHands('free');
      grip(k, undo, gourd, 'R');
      // 一桶水放在身旁的地上
      const sp = loc(k, 0.42, 0, 0.05); pail.position.set(sp.x, k.player.pos.y, sp.z); pail.visible = true; k.world.scene.add(pail);
      undo.push(() => { pail.removeFromParent(); pail.visible = false; });
      inPail = 1;
      ui();
    },
    exit() { restore(); const av = k.player.av; av.reach('R', null); av.bow = 0; F.changed(g.id); spotNow(); },
    update(dt) {
      press.step(dt);
      cam.update(dt);
      if (phase !== 'pour') return;
      const av = k.player.av, bb = b();
      t += dt;
      if (press.down) {
        // 一瓢：弯腰在桶里舀，直起来往畦里一泼
        const u = (press.t % 1.15) / 1.15, prev = ((press.t - dt) % 1.15) / 1.15;
        const dip = pail.position.clone().add(V(0, 0.28, 0)), fling = loc(k, -0.05, 1.05, 0.62);
        av.reach('R', u < 0.38 ? dip : dip.clone().lerp(fling, ease((u - 0.38) / 0.3)), { rate: 12 });
        av.bow = u < 0.38 ? 0.45 : 0.12;
        gourd.rotation.x = u > 0.62 && u < 0.85 ? -1.2 : 0;
        if (u >= 0.66 && prev < 0.66) {
          pours++;
          const hand = av.joints.handR.getWorldPosition(new THREE.Vector3()), f = dirL(k, (Math.random() - 0.5) * 0.6, 0.6, 1);
          F.bits.emit('drop', hand, f.multiplyScalar(3.4), 12, 0.7, g.y(hand.x, hand.z) + 0.04);
          k.sfx('water', { vel: 0.5 });
          const { over } = Mo.water(bb, 0.075);
          inPail -= 1 / 7;
          F.changed(g.id);
          put({ meter: meter() });
          if (over) put({ hint: '浇多了，地里汪着水了' });
          if (inPail <= 0.001) {
            k.bag.take('water', 1, { quiet: true });
            if (k.bag.has('water') && bb.water < 1) { inPail = 1; k.note('换一桶', 'farm'); }
            else { done(); return; }
          }
          if (bb.water >= 0.93 && bb.water <= 1.02 && pours > 2) { done(); return; }
        }
      } else { av.reach('R', null); av.bow = 0; gourd.rotation.x = 0; }
      if (press.released) put({ meter: meter() });
    },
    input: { tap() { return true; } },
    cmd(c, arg) { if (c === 'pour') press.cmd(arg); else if (c === 'done') k.exitAct(); },
  };
  const done = () => {
    phase = 'done'; press.reset();
    const bb = b(), ok = bb.water >= 0.64;
    k.player.av.reach('R', null); k.player.av.bow = 0;
    F.worked(`浇了${g.name}`);
    set({ title: '浇水', ...chain(bb.crop, '锄草'), text: ok ? `${g.name}浇透了。${bb.water > 1.02 ? '浇得多了些，过一两天就渗下去了。' : ''}` : '水用完了，还没浇透。再去打一担来。', meter: meter(), done: ok, choices: [BYE] });
  };
  spotNow();
  return act;
}

// ———————————————————————————— 锄草 ————————————————————————————
function weedAct(k: Anlewo, F: Farm, g: BedGeo): Act {
  const { state, set, put } = base(k);
  const cam = new Cam(k);
  let weeds: Array<{ x: number; y: number; z: number; alive: boolean }> = [], w0 = 0, busy = -1, t = 0, mv: { done: boolean } | null = null, phase: 'pick' | 'done' = 'pick';
  const b = () => F.bed(g.id);
  const spotNow = () => {
    const c = bedCenter(g), out = g.axis === 'x' ? V(c.x - 1.2, 0, g.z0 - 0.5) : V(g.id === 'vegE' ? g.x1 + 0.5 : g.x0 - 0.5, 0, c.z + 1.5);
    movable(act, out.x, out.z, Math.atan2(c.x - out.x, c.z - out.z), c.x - (g.x1 - g.x0) * 0.22, c.y + 1.3, c.z);
  };
  const tags = () => weeds.map((w, i) => ({ id: `w${i}`, text: '草', x: w.x, y: w.y + 0.45, z: w.z, kind: w.alive ? (i === busy ? 'hot' : 'hot') : 'done', on: i === busy }));
  const left = () => weeds.filter((w) => w.alive).length;
  const ui = () => set({ title: '锄草', ...chain(b().crop, '锄草'), hint: left() === weeds.length ? '点垄沟里的草，人走过去拔掉' : '', count: weeds.length - left(), total: weeds.length, tags: tags(), progress: 1 - left() / Math.max(1, weeds.length), choices: [BYE] });
  const pull = (i: number) => {
    const w = weeds[i];
    if (!w || !w.alive || busy >= 0) return;
    busy = i; t = 0;
    // 走到草旁边（站在垄沟里）
    const at = rowAt(g, w.x, w.z), side = g.axis === 'x' ? V(w.x - 0.45, 0, w.z) : V(w.x, 0, w.z - 0.45);
    void at;
    mv = walk(k, side.x, side.z, Math.atan2(w.x - side.x, w.z - side.z));
    put({ tags: tags() });
  };
  const act: FAct = {
    id: `farm:weed:${g.id}`, name: '锄草', anchor: V(0, 0, 0), spot: { x: 0, z: 0, yaw: 0 }, radius: 4.5, state, noZoom: true,
    on() {
      const bb = b();
      if (k.atmos.night > 0.62 || k.season === 'winter') return false;
      const ok = !!bb.crop && (bb.stage === 'sprout' || bb.stage === 'growing') && bb.weed > 0.28;
      if (ok && !k.act) spotNow();
      return ok;
    },
    enter() {
      const bb = b();
      w0 = bb.weed; busy = -1; phase = 'pick';
      const n = Math.max(3, Math.min(9, Math.round(bb.weed * 10))), bi = g.id.charCodeAt(0) * 7 + g.id.length * 131;
      weeds = [];
      for (let i = 0; i < n; i++) {
        const u1 = h3(bi + 61, i, 1), u2 = h3(bi + 62, i, 2), row = Math.min(g.rows - 1, Math.floor(h3(bi + 63, i, 3) * g.rows));
        const p = rowPoint(g, row, 0.08 + 0.84 * u1, (u2 < 0.5 ? -0.5 : 0.5) * g.pitch * 0.8);
        weeds.push({ x: p.x, y: g.y(p.x, p.z), z: p.z, alive: true });
      }
      F.weedOverride.set(g.id, weeds);
      F.changed(g.id);
      k.player.av.setHands('free');
      const c = bedCenter(g), v = view(c, (CAM_SIDE[g.id] ?? PI) + 0.35, g.axis === 'x' ? 8.5 : 7, 4.6, 0);
      cam.start(v.pos, v.look, 42, 1.5);
      ui();
    },
    exit() {
      const bb = b(), alive = left();
      Mo.weed(bb, Math.max(0, w0 - (weeds.length ? (w0 * alive) / weeds.length : w0)));
      F.weedOverride.delete(g.id);
      F.changed(g.id);
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.setPose('stand', 0.6); av.bow = 0;
      spotNow(); act.spot.x = k.player.pos.x; act.spot.z = k.player.pos.z;
    },
    update(dt) {
      cam.update(dt);
      if (busy < 0) return;
      const w = weeds[busy], av = k.player.av;
      if (mv && !mv.done) return;
      t += dt;
      const ground = V(w.x, w.y + 0.06, w.z);
      if (t < 0.5) { av.setPose('crouch', 0.5); av.reach('R', ground, { rate: 8 }); av.reach('L', ground.clone().add(V(0.08, 0.02, 0.05)), { rate: 8 }); av.lookAt(ground); }
      else if (t < 1.0) { const up = ground.clone().add(V(0, 0.45 * ease((t - 0.5) / 0.5), 0)); av.reach('R', up, { rate: 14 }); av.reach('L', up.clone().add(V(0.06, 0, 0)), { rate: 14 }); }
      if (t >= 0.62 && t - dt < 0.62) {
        w.alive = false;
        F.changed(g.id);
        F.bits.emit('bit', ground.clone().add(V(0, 0.3, 0)), V(0, 1.2, 0), 6, 0.8, w.y);
        F.bits.emit('clod', ground, V(0, 1, 0), 3, 0.6, w.y);
        k.sfxAt('pull', { x: w.x, z: w.z, vel: 0.5 });
      }
      if (t >= 1.15) {
        av.reach('R', null); av.reach('L', null); av.lookAt(null); av.setPose('stand', 0.6);
        busy = -1;
        if (left() === 0) {
          phase = 'done';
          const bb = b(); Mo.weed(bb, 1); F.weedOverride.delete(g.id); F.changed(g.id); F.worked(`锄了${g.name}的草`);
          set({ title: '锄草', ...chain(bb.crop, '锄草'), text: `草拔干净了。`, lines: [QUOTES.hoe.text], source: QUOTES.hoe.source, done: true, choices: [BYE] });
          return;
        }
        ui();
      }
    },
    input: {
      tap(p) {
        if (phase !== 'pick') return true;
        const ray = k.world.ray(p.nx, p.ny).ray;
        if (Math.abs(ray.direction.y) < 1e-4) return true;
        const y0 = g.y((g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2) + 0.2, s = (y0 - ray.origin.y) / ray.direction.y;
        if (s <= 0) return true;
        const hx = ray.origin.x + ray.direction.x * s, hz = ray.origin.z + ray.direction.z * s;
        let bi = -1, bd = 1.1;
        weeds.forEach((w, i) => { if (!w.alive) return; const d = Math.hypot(w.x - hx, w.z - hz); if (d < bd) { bd = d; bi = i; } });
        if (bi >= 0) pull(bi);
        return true;
      },
    },
    cmd(c, arg) {
      if (c === 'tag' && typeof arg === 'string') pull(Number(arg.slice(1)));
      else if (c === 'done') k.exitAct();
    },
  };
  spotNow();
  return act;
}

// ———————————————————————————— 收（割麦、掐穗、拔豆、摘菜） ————————————————————————————
const REAP_KEY: Record<CropId, { hold: string; label: string; hint: string; cycle: number; step: number }> = {
  wheat: { hold: 'cut', label: '割', hint: '按住，一镰一镰割过去；割下的铺在身后', cycle: 1.0, step: 0.62 },
  millet: { hold: 'pick', label: '掐', hint: '按住，顺着垄一穗一穗地掐', cycle: 0.85, step: 0.55 },
  bean: { hold: 'pull', label: '拔', hint: '按住，一棵一棵连秧拔起来', cycle: 1.05, step: 0.6 },
  greens: { hold: 'pick', label: '摘', hint: '按住，一棵一棵地摘', cycle: 0.9, step: 0.5 },
};
function reapAct(k: Anlewo, F: Farm, g: BedGeo, crop: CropId): Act {
  const { state, set, put, undo, restore } = base(k);
  const blade = sickle(); blade.visible = false;
  const basket = seedBasket(); basket.visible = false;
  const cam = new Cam(k), press = new Press();
  const K = REAP_KEY[crop], item = CROPS[crop].yield.item;
  let row = 0, phase: 'cut' | 'bind' | 'done' = 'cut', t = 0, strokeT = 0, got = 0, mv: { done: boolean } | null = null, strokes = 0, binding = -1, bindT = 0;
  const b = () => F.bed(g.id);
  const total = () => b().rows.reduce((a, v) => a + v, 0) / g.rows;
  const spotNow = () => {
    const bb = b(), r = bb.op === 'reap' ? Math.max(0, firstWork(bb)) : 0, s = rowPoint(g, r, bb.op === 'reap' ? bb.rows[r] : 0), c = bedCenter(g);
    movable(act, s.x, s.z, s.yaw, c.x + (g.x1 - g.x0) * 0.05, c.y + 1.55, c.z);
  };
  /** 先捆完还铺着的，再割没割的 */
  const firstWork = (bb: Mo.Bed) => { for (let i = 0; i < g.rows; i++) if (Mo.bindable(bb, i)) return i; return Mo.nextRow(bb); };
  const cutUi = () => set({ title: CROPS[crop].reap, ...chain(crop, CROPS[crop].reap), hint: strokes === 0 ? K.hint : '', hold: { id: K.hold, label: K.label, v: total() }, progress: total(), count: Mo.binds(crop) ? b().sheaves : got, keys: [{ key: '空格', label: `按住${K.label}` }], choices: [BYE] });
  const bindUi = () => set({ title: '捆麦', ...chain(crop, '捆麦'), hint: b().sheaves === 0 ? '割下的够一捆了。按住，拢起来、拧一道腰捆上' : '', hold: { id: 'bind', label: '捆', v: 0 }, count: b().sheaves, progress: total(), keys: [{ key: '空格', label: '按住捆' }], choices: [BYE] });
  /** 割麦的一镰：u 0…1。左手往前抓一把，右手的镰从右往左一带，割下来往身后一放 */
  const strokePose = (u: number) => {
    const av = k.player.av;
    if (crop === 'wheat') {
      av.bow = 0.55;
      const grab = loc(k, 0.12, 0.42, 0.55), lay = loc(k, 0.5, 0.35, -0.05);
      av.reach('L', u < 0.7 ? grab : grab.clone().lerp(lay, ease((u - 0.7) / 0.3)), { rate: 14 });
      const a = u < 0.35 ? -0.4 : u < 0.7 ? lerp(-0.4, 0.2, ease((u - 0.35) / 0.35)) : 0.2;
      av.reach('R', loc(k, a, 0.3 + 0.06 * Math.abs(a), 0.5), { dir: dirL(k, 0.8, -0.2, 0.6), palm: dirL(k, 1, 0, 0), rate: 16 });
    } else if (crop === 'millet') {
      av.bow = 0.12;
      const ear = loc(k, -0.12 + 0.1 * Math.sin(strokes * 1.7), 0.95, 0.55), bp = av.joints.handL.getWorldPosition(new THREE.Vector3()).add(V(0, 0.06, 0));
      av.reach('R', u < 0.5 ? ear : ear.clone().lerp(bp, ease((u - 0.5) / 0.4)), { rate: 13 });
    } else {
      av.bow = crop === 'bean' ? 0.58 : 0.5;
      const low = loc(k, 0, 0.18, 0.48), up = loc(k, 0.05, 0.75, 0.35);
      const tg = u < 0.45 ? low : low.clone().lerp(up, ease((u - 0.45) / 0.35));
      av.reach('R', tg, { rate: 14 }); av.reach('L', tg.clone().add(dirL(k, 0.12, 0, 0)), { rate: 14 });
    }
  };
  const bindPose = (u: number) => {
    const av = k.player.av;
    av.bow = 0.6;
    const spread = 0.42 * (1 - ease(Math.min(1, u / 0.5)));
    const c = loc(k, 0, 0.2 + 0.4 * ease(Math.max(0, (u - 0.6) / 0.4)), 0.5);
    av.reach('L', c.clone().add(dirL(k, spread + 0.06, 0, 0)), { rate: 12 });
    av.reach('R', c.clone().add(dirL(k, -spread - 0.06, 0, 0)), { rate: 12 });
  };
  const act: FAct = {
    id: `farm:reap:${g.id}:${crop}`, name: CROPS[crop].reap, anchor: V(0, 0, 0), spot: { x: 0, z: 0, yaw: 0 }, radius: 4.5, state, noZoom: true,
    on() {
      const bb = b();
      if (k.atmos.night > 0.62 || bb.crop !== crop) return false;
      const ok = bb.stage === 'ripe';
      if (ok && !k.act) spotNow();
      return ok;
    },
    enter() {
      press.reset(); got = 0; strokes = 0; strokeT = 0;
      const bb = b();
      Mo.begin(bb, 'reap');
      row = Math.max(0, firstWork(bb));
      k.player.av.setHands('free');
      if (crop === 'wheat') grip(k, undo, blade, 'R', [0, 0.01, 0], [0, 0, 0]);
      if (crop === 'millet' || crop === 'greens') grip(k, undo, basket, 'L', [0, 0.02, 0.06], [0, 0, 0]);
      const v = rowCam(k, cam, g, 5.2, 2.2); cam.start(v.pos, v.look, 40, 1.5);
      if (Mo.binds(crop) && Mo.bindable(bb, row)) { phase = 'bind'; bindUi(); } else { phase = 'cut'; cutUi(); }
    },
    exit() {
      restore();
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.bow = 0;
      if (got > 0) k.note(`收了${CROPS[crop].name}，得${got}${item === 'milletEar' ? '把谷穗' : item === 'bean' ? '升豆' : '把菜'}`, 'farm');
      F.changed(g.id); spotNow(); act.spot.x = k.player.pos.x; act.spot.z = k.player.pos.z;
    },
    update(dt) {
      press.step(dt);
      t += dt;
      const v = rowCam(k, cam, g, 5.2, 2.2); cam.aim(v.pos, v.look); cam.update(dt);
      const bb = b(), av = k.player.av, L = rowLen(g);
      if (phase === 'done') return;
      if (mv && !mv.done) { if (phase === 'cut') strokePose(0); return; }
      if (phase === 'cut') {
        if (!press.down && strokeT === 0) { strokePose(0); av.bow = crop === 'millet' ? 0.05 : 0.3; return; }
        strokeT += dt;
        const u = Math.min(1, strokeT / K.cycle);
        strokePose(u);
        if (u >= 0.6 && (strokeT - dt) / K.cycle < 0.6) {
          strokes++;
          const was = bb.rows[row], f = Math.min(1, was + K.step / L);
          const n = Mo.reap(bb, row, f);
          if (n > 0) { got += k.bag.add(item, n, { quiet: true }); }
          const hp = loc(k, 0, crop === 'millet' ? 0.95 : 0.35, 0.5);
          F.bits.emit(crop === 'millet' ? 'chaff' : crop === 'wheat' ? 'bit' : 'leaf', hp, V(0, 0.8, 0), 5, 0.7, g.y(hp.x, hp.z));
          k.sfxAt(crop === 'wheat' ? 'sickle' : crop === 'millet' ? 'pluck' : crop === 'bean' ? 'pull' : 'pluck', { x: hp.x, z: hp.z, vel: 0.5 + 0.2 * Math.random() });
          F.changed(g.id);
          put({ progress: total(), hold: { id: K.hold, label: K.label, v: total() }, count: Mo.binds(crop) ? bb.sheaves : got, hint: '' }, true);
        }
        if (u >= 1) {
          strokeT = 0;
          if (bb.stage === 'stubble') { finish(); return; }
          // 割下的够一捆了：就地捆起来（割几把、捆一捆）
          if (Mo.binds(crop) && Mo.bindable(bb, row)) { phase = 'bind'; binding = row; startBind(); return; }
          if (bb.rows[row] >= 0.999) {
            const nr = firstWork(bb);
            if (nr < 0) { finish(); return; }
            row = nr; const s = rowPoint(g, row, bb.rows[row]); mv = walk(k, s.x, s.z, s.yaw);
          } else { const s = rowPoint(g, row, bb.rows[row]); mv = walk(k, s.x, s.z, s.yaw); }
        }
      } else if (phase === 'bind') {
        if (!press.down) { bindT = 0; bindPose(0); av.bow = 0.35; put({ hold: { id: 'bind', label: '捆', v: 0 } }, true); return; }
        bindT += dt;
        const u = Math.min(1, bindT / 1.1);
        bindPose(u);
        put({ hold: { id: 'bind', label: '捆', v: u } }, true);
        if (u >= 1) {
          bindT = 0;
          if (Mo.bind(bb, binding)) {
            k.sfxAt('bind', { x: k.player.pos.x, z: k.player.pos.z, vel: 0.5 }); k.buzz(10);
            F.bits.emit('bit', loc(k, 0, 0.5, 0.5), V(0, 0.6, 0), 4, 0.5, k.player.pos.y);
            F.changed(g.id);
          }
          if (bb.stage === 'stubble') { finish(); return; }
          if (Mo.bindable(bb, binding)) { startBind(); return; }
          // 捆好了：接着割（这一垄割完了就挪到下一垄）
          const nr = firstWork(bb);
          if (nr < 0) { finish(); return; }
          row = nr; phase = Mo.bindable(bb, row) ? 'bind' : 'cut';
          if (phase === 'bind') { binding = row; startBind(); return; }
          const s = rowPoint(g, row, bb.rows[row]); mv = walk(k, s.x, s.z, s.yaw);
          strokes = Math.max(strokes, 1);
          cutUi();
        }
      }
    },
    input: { tap() { return true; } },
    cmd(c, arg) {
      if (c === K.hold || c === 'bind') press.cmd(arg);
      else if (c === 'load') { k.exitAct(); setTimeout(() => k.enterAct(`farm:load:${g.id}`), 60); }
      else if (c === 'go') { k.exitAct(); setTimeout(() => F.guide.walkThere(), 120); }
      else if (c === 'done') k.exitAct();
    },
  };
  /** 就地捆：侧过身对着身后铺着的那一溜（离得远了才挪过去） */
  const startBind = () => {
    const bb = b(), pr = Mo.perRow(bb), f = Math.min(1, bb.bound[binding] + 0.5 / pr);
    const s = rowPoint(g, binding, f, 0.3), p = k.player.pos;
    if (Math.hypot(s.x - p.x, s.z - p.z) > 1.6) mv = walk(k, s.x, s.z, s.yaw + 0.6);
    else k.player.faceTo = Math.atan2(s.x - p.x, s.z - p.z);
    bindUi();
  };
  const finish = () => {
    phase = 'done'; press.reset();
    const bb = b(), av = k.player.av;
    av.reach('L', null); av.reach('R', null); av.bow = 0;
    F.changed(g.id);
    const q = crop === 'wheat' ? QUOTES.reap : crop === 'millet' ? QUOTES.harvest : crop === 'bean' ? QUOTES.autumn : QUOTES.ready;
    if (Mo.binds(crop)) {
      F.worked(`割了${g.name}的麦，捆了${bb.sheaves}捆`);
      set({ title: '割麦', ...chain(crop, '挑'), text: `${g.name}的麦割完了，${bb.sheaves}捆立在地里。挑到晒场上去打。`, lines: [q.text], source: q.source, gloss: q.note, done: true, choices: [{ id: 'load', label: '挑起来', main: true }, BYE] });
    } else {
      F.worked(`${CROPS[crop].reap}，得${got}`);
      const ears = k.bag.count('milletEar');
      set({ title: CROPS[crop].reap, ...chain(crop, crop === 'millet' ? '打谷' : CROPS[crop].reap), text: crop === 'millet' ? `谷穗掐完了，两筐沉甸甸的（${got}把），挑在肩上。\n${F.guide.tell('milletEar', ears)}` : `收完了，得${got}${item === 'bean' ? '升豆' : '把菜'}。`, lines: [q.text], source: q.source, done: true, choices: crop === 'millet' ? [{ id: 'go', label: '挑到场上', main: true }, BYE] : [BYE] });
    }
  };
  spotNow();
  return act;
}

// ———————————————————————————— 挑麦 / 取回 ————————————————————————————
function loadAct(k: Anlewo, F: Farm, g: BedGeo): Act {
  const { state, set } = base(k);
  const cam = new Cam(k);
  let t = -1, n = 0;
  const b = () => F.bed(g.id);
  const has = () => b().sheaves + (b().left?.item === 'sheaf' ? b().left!.n : 0);
  const spotNow = () => {
    const bb = b(), c = bedCenter(g);
    if (bb.sheaves > 0) { const s = rowPoint(g, 0, 0.15, -0.45); movable(act, s.x, s.z, s.yaw, s.x, c.y + 1.3, s.z); }
    else { const x = c.x + 0.9, z = g.z0 - 0.9; movable(act, x, z, -PI / 2, c.x, c.y + 1.3, g.z0 - 0.75); }
  };
  const act: FAct = {
    id: `farm:load:${g.id}`, name: '挑麦', anchor: V(0, 0, 0), spot: { x: 0, z: 0, yaw: 0 }, radius: 4.5, state, noZoom: true,
    on() { const ok = has() > 0 && k.atmos.night < 0.75; if (ok && !k.act) spotNow(); return ok; },
    enter() {
      const bb = b(), cap = Math.max(0, 16 - k.bag.count('sheaf'));
      n = Mo.loadSheaves(bb, cap);
      if (n < cap && bb.left?.item === 'sheaf') { const m = Math.min(cap - n, bb.left.n); bb.left.n -= m; n += m; if (bb.left.n <= 0) bb.left = null; }
      F.changed(g.id);
      t = 0;
      const c = k.player.pos.clone(), v = view(c, k.player.yaw + 2.3, 4.2, 1.8, 0.7);
      cam.start(v.pos, v.look, 42, 1.3);
      F.holdPole = true;
      set({ title: '挑麦', ...chain('wheat', '挑'), hint: '' });
    },
    exit() { F.holdPole = false; t = -1; spotNow(); act.spot.x = k.player.pos.x; act.spot.z = k.player.pos.z; },
    update(dt) {
      cam.update(dt);
      if (t < 0) return;
      t += dt;
      const av = k.player.av;
      // 蹲下去、把扁担搭上肩、站起来
      if (t < 1.0) { av.setPose('crouch', 0.6); } else if (t < 1.2) { if (n > 0) k.bag.add('sheaf', n); k.sfx('pole', { vel: 0.5 }); av.setPose('stand', 0.8); t = 1.2; }
      if (t >= 1.2 && t - dt < 1.2 + 1e-6) {
        F.worked();
        const all = k.bag.count('sheaf');
        set({ title: '挑麦', ...chain('wheat', '打场'), text: `挑起来了：${what('sheaf', n)}${all > n ? `（肩上一共${what('sheaf', all)}）` : ''}。${b().sheaves > 0 || b().left ? '地里还剩一些，再来一趟。' : ''}\n${F.guide.tell('sheaf', all)}\n晒场在村里，两户人家中间那块夯平的地，井的北边。挑着担子走不快，也跑不动；挑累了，随处可以放下。`, done: true, choices: [{ id: 'go', label: '挑到场上', main: true }, BYE] });
        t = 99;
      }
    },
    cmd(c) {
      // 挑到场上：顺着认好的路（过石桥或汀步、顺着村路，一段一段地找路）走到晒场，到了就打场
      if (c === 'go') { k.exitAct(); setTimeout(() => { if (!F.guide.walkThere()) walkVia(k, ROUTE_TO_FLOOR, () => k.enterAct('farm:thresh')); }, 120); }
      else if (c === 'done') k.exitAct();
    },
  };
  spotNow();
  return act;
}
function takeAct(k: Anlewo, F: Farm, g: BedGeo): Act {
  const { state, set } = base(k);
  const b = () => F.bed(g.id);
  const spotNow = () => { const c = bedCenter(g), x = g.axis === 'x' ? c.x + 0.9 : (g.id === 'vegE' ? g.x1 + 0.6 : g.x0 - 0.6), z = g.axis === 'x' ? g.z0 - 0.9 : g.z0 - 0.3; movable(act, x, z, Math.atan2(c.x - x, c.z - z), c.x, c.y + 1.2, g.axis === 'x' ? g.z0 - 0.75 : g.z0); };
  const NAME: Record<string, string> = { milletEar: '谷穗', bean: '豆', greens: '菜' };
  const act: FAct = {
    id: `farm:take:${g.id}`, name: '取回', anchor: V(0, 0, 0), spot: { x: 0, z: 0, yaw: 0 }, radius: 3.5, state,
    on() { const l = b().left; const ok = !!l && l.item !== 'sheaf' && l.n > 0 && k.atmos.night < 0.75; if (ok && !k.act) spotNow(); return ok; },
    enter() {
      const l = Mo.takeLeft(b());
      F.changed(g.id);
      const av = k.player.av; av.setPose('crouch', 0.6); setTimeout(() => av.setPose('stand', 0.7), 900);
      if (!l) { set({ title: '取回', text: '地头空了。', choices: [BYE] }); return; }
      const got = k.bag.add(l.item, l.n);
      F.worked();
      set({ title: '取回', text: `地头放着一堆${NAME[l.item] ?? ''}，是邻家趁着天好替你收下的。收进行囊：${got}。改天谢谢人家。`, done: true, choices: [BYE] });
    },
    exit() { spotNow(); },
    cmd(c) { if (c === 'done') k.exitAct(); },
  };
  spotNow();
  return act;
}

// ———————————————————————————— 挑起（放在地上的担子） ————————————————————————————
function liftAct(k: Anlewo, F: Farm): Act {
  const { state, set } = base(k);
  const cam = new Cam(k);
  const KIND = { sheaf: 'sheaf', milletEar: 'ear', water: 'water' } as const;
  let t = -1, idx = -1;
  /** 签立在离人最近的那一副上；人走到扁担侧边、面朝它 */
  const spotNow = () => {
    const near = F.guide.nearestPile(k.player.pos.x, k.player.pos.z);
    if (!near) return null;
    const s = Guide.besidePile(near.pile);
    movable(act, s.x, s.z, s.yaw, near.pile.x, groundOf(near.pile.x, near.pile.z) + 1.3, near.pile.z);
    return near;
  };
  const act: FAct = {
    id: 'farm:lift', name: '挑起', anchor: V(0, -60, 0), spot: { x: 0, z: -400, yaw: 0 }, radius: 2.6, state, noZoom: true,
    on() { return k.act ? F.st.piles.length > 0 : !!spotNow(); },
    enter() {
      const near = F.guide.nearestPile(k.player.pos.x, k.player.pos.z, 4);
      idx = near?.i ?? -1; t = 0;
      const c = k.player.pos.clone(), v = view(c, k.player.yaw + 2.3, 4.2, 1.8, 0.7);
      cam.start(v.pos, v.look, 42, 1.3);
      if (near) { F.holdPole = true; F.holdKind = KIND[near.pile.item]; }
      set({ title: '挑起', hint: '' });
    },
    exit() { F.holdPole = false; F.holdKind = null; t = -1; spotNow(); },
    update(dt) {
      cam.update(dt);
      if (t < 0 || t > 50) return;
      t += dt;
      const av = k.player.av;
      // 蹲下去、扁担搭上肩、站起来
      if (t < 1.0) { av.setPose('crouch', 0.6); return; }
      t = 99;
      av.setPose('stand', 0.8);
      const got = idx >= 0 ? F.guide.pickUp(idx) : null;
      if (!got) { F.holdPole = false; set({ title: '挑起', text: k.bag.count('water') >= 2 ? '肩上已经挑着一担水了，再挑不下。' : '地上空了。', choices: [BYE] }); return; }
      k.sfx('pole', { vel: 0.5 });
      F.worked();
      const all = k.bag.count(got.item), d = F.guide.plan(got.item), p = k.player.pos;
      const close = !!d && Math.hypot(d.tx - p.x, d.tz - p.z) < 7;
      const go = d ? { id: 'go', label: got.item === 'water' ? `挑去浇${d.name}` : close ? '就打场' : '挑到场上', main: true } : null;
      set({ title: '挑起', text: `挑起来了：${what(got.item, all)}。\n${F.guide.tell(got.item, all)}`, done: true, choices: go ? [go, BYE] : [BYE] });
    },
    cmd(c) {
      if (c === 'go') { k.exitAct(); setTimeout(() => F.guide.walkThere(), 120); }
      else if (c === 'done') k.exitAct();
    },
  };
  return act;
}

// ———————————————————————————— 帮割（邻家王伯的麦） ————————————————————————————
function helpAct(k: Anlewo, F: Farm): Act {
  const { state, set, put, undo, restore } = base(k);
  const blade = sickle(); blade.visible = false;
  const cam = new Cam(k), press = new Press();
  let strokeT = 0, strokes = 0, round = 0, mv: { done: boolean } | null = null, phase: 'cut' | 'done' = 'cut';
  const ROUND = 14;
  const spotNow = () => {
    const s = F.reapSpot();
    if (!s) return;
    movable(act, s.x - 0.6, s.z, PI / 2, s.x + 1.5, PLOT_Y() + 1.6, s.z - 0.45);
  };
  const PLOT_Y = () => PLOT.y;
  const ui = () => set({ title: '帮割', who: '王伯的麦', hint: strokes === 0 ? '按住，一镰一镰割过去' : '', hold: { id: 'cut', label: '割', v: round / ROUND }, progress: round / ROUND, keys: [{ key: '空格', label: '按住割' }], choices: [BYE] });
  const act: FAct = {
    id: 'farm:help', name: '帮割', anchor: V(0, 0, 0), spot: { x: 0, z: 0, yaw: 0 }, radius: 4.5, state, noZoom: true,
    on() { const ok = k.season === 'summer' && k.atmos.night < 0.62 && k.atmos.w.rain < 0.5 && !!F.reapSpot(); if (ok && !k.act) spotNow(); return ok; },
    enter() {
      press.reset(); strokes = 0; round = 0; strokeT = 0; phase = 'cut';
      k.player.av.setHands('free');
      grip(k, undo, blade, 'R');
      const p = k.player.pos, v = view(V(p.x + 1, p.y, p.z), PI + 0.25, 5.4, 2.3, 0.55);
      cam.start(v.pos, v.look, 40, 1.5);
      ui();
    },
    exit() { restore(); const av = k.player.av; av.reach('L', null); av.reach('R', null); av.bow = 0; spotNow(); act.spot.x = k.player.pos.x; act.spot.z = k.player.pos.z; },
    update(dt) {
      press.step(dt);
      const p = k.player.pos, v = view(V(p.x + 1, p.y, p.z), PI + 0.25, 5.4, 2.3, 0.55); cam.aim(v.pos, v.look); cam.update(dt);
      if (phase === 'done') return;
      const av = k.player.av;
      if (mv && !mv.done) return;
      if (!press.down && strokeT === 0) { av.bow = 0.3; av.reach('L', null); return; }
      strokeT += dt;
      const u = Math.min(1, strokeT / 1.0);
      av.bow = 0.55;
      const grab = loc(k, 0.12, 0.42, 0.55);
      av.reach('L', grab, { rate: 14 });
      const a = u < 0.35 ? -0.4 : u < 0.7 ? lerp(-0.4, 0.2, ease((u - 0.35) / 0.35)) : 0.2;
      av.reach('R', loc(k, a, 0.32, 0.5), { dir: dirL(k, 0.8, -0.2, 0.6), palm: dirL(k, 1, 0, 0), rate: 16 });
      if (u >= 0.6 && (strokeT - dt) < 0.6) {
        strokes++; round++;
        const doneRow = F.reapStep(0.62, 'player');
        const hp = loc(k, 0, 0.35, 0.5);
        F.bits.emit('bit', hp, V(0, 0.8, 0), 5, 0.7, PLOT_Y());
        k.sfxAt('sickle', { x: hp.x, z: hp.z, vel: 0.55 });
        put({ progress: round / ROUND, hold: { id: 'cut', label: '割', v: round / ROUND } }, true);
        if (doneRow) k.note('割完一垄', 'farm');
      }
      if (u >= 1) {
        strokeT = 0;
        if (round >= ROUND || !F.reapSpot()) {
          phase = 'done'; press.reset(); av.bow = 0; av.reach('L', null); av.reach('R', null);
          const gift = k.bag.add('wheat', 1, { quiet: true });
          F.worked('帮王伯割了一截麦');
          set({ title: '帮割', who: '王伯', text: `「劳驾先生了。」\n王伯直起腰，擦一把汗，从地头的口袋里抓了一把新麦塞给你。${gift ? '' : ''}`, lines: [QUOTES.rush.text], source: QUOTES.rush.source, done: true, choices: [{ id: 'more', label: '再割一截' }, BYE] });
          return;
        }
        const s = F.reapSpot(); if (s) mv = walk(k, s.x - 0.6, s.z, PI / 2);
      }
    },
    input: { tap() { return true; } },
    cmd(c, arg) {
      if (c === 'cut') press.cmd(arg);
      else if (c === 'more') { round = 0; phase = 'cut'; const s = F.reapSpot(); if (s) mv = walk(k, s.x - 0.6, s.z, PI / 2); ui(); }
      else if (c === 'done') k.exitAct();
    },
  };
  spotNow();
  return act;
}

export function create(k: Anlewo): Act[] {
  const F = farmOf(k), out: Act[] = [];
  for (const g of Object.values(BED_GEO)) {
    out.push(till(k, F, g), sowAct(k, F, g), waterAct(k, F, g), weedAct(k, F, g));
    for (const c of BED_CROPS[spec(g.id).kind]) out.push(reapAct(k, F, g, c));
    if (spec(g.id).kind === 'grain') out.push(loadAct(k, F, g));
    out.push(takeAct(k, F, g));
  }
  out.push(helpAct(k, F), liftAct(k, F));
  return out;
}
