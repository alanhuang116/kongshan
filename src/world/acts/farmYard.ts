/**
 * 场上的事：
 *   打场 —— 挑来的麦捆（或谷穗）解开、一圈一圈摊在场上，拿连枷打。表的指针随着连枷一起一落，
 *           举到顶（朱色那一段）时按下去，一枷拍在麦上最实；麦打完了，场上一堆连糠带粒的；谷穗打下来就是谷子。
 *   扬场 —— 借风把糠扬走：看着风那道表，风合适时（朱色那一段）一锨扬上去，糠顺风飘走、麦粒落回来。
 *           风小了糠扬不走，风大了麦粒也刮跑。下雨天场上不打不扬。
 *   推磨 —— 场边一盘石磨。按住，扶着磨棍一圈一圈地推，麦子磨成面。
 *   舂米 —— 溪上的水碓自己一下一下地舂；把谷子倒进石臼，趁碓头抬起来的空当伸手翻一翻（碓头落下来时别伸手）。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from './types';
import { QUOTES } from '../../data/farm';
import { farmOf, type Farm } from '../farm';
import * as Mo from '../farm/model';
import { FLOOR, HEAP, MILL } from '../farm/layout';
import { shovel } from '../farm/props';
import { flail as flailMesh } from '../life/props';
import { addDisc } from '../walk';
import { streamAt } from '../site';
import { BYE, Cam, Press, UPV, base, chain, clamp01, dirL, ease, grip, lerp, loc, view, why, type FAct } from '../farm/actkit';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

// ———————————————————————————— 打场 ————————————————————————————
function thresh(k: Anlewo, F: Farm): Act {
  const { state, set, put, undo, restore } = base(k);
  const fl = flailMesh(); fl.obj.visible = false;
  const cam = new Cam(k), press = new Press();
  let phase: 'unload' | 'beat' | 'done' | 'no' = 'beat', t = 0, ph = 0, strike = -1, lifted = 0, good = 0, hits = 0, need = 10, crop: 'wheat' | 'millet' = 'wheat';
  const center = V(FLOOR.x, FLOOR.y, FLOOR.z);
  /** 连枷的姿势：kk 0 落在身前、1 举过头；beat 是拍子甩到哪儿 */
  const swing = (kk: number, beat: number) => {
    const av = k.player.av, r = loc(k, -0.1, 0.98 + 0.34 * kk, 0.2 - 0.06 * kk), d = new THREE.Vector3(0.03, lerp(-0.42, 0.93, kk), lerp(0.905, -0.36, kk * kk)).normalize();
    const wd = dirL(k, d.x, d.y, d.z);
    av.reach('R', r, { dir: wd, palm: UPV, rate: 20 });
    av.reach('L', r.clone().addScaledVector(wd, 0.42), { dir: wd, palm: UPV, rate: 20 });
    av.bow = lerp(0.36, 0, kk);
    fl.beater.rotation.x = beat;
  };
  const meter = (v: number) => ({ v, lo: 0.74, hi: 1, label: '起落' });
  const beatUi = () => set({ title: crop === 'wheat' ? '打场' : '打谷', ...chain(crop, crop === 'wheat' ? '打场' : '打谷'), hint: hits === 0 ? '连枷举到顶（朱色那一段）时按下去' : '', hold: { id: 'beat', label: '打' }, meter: meter(0), progress: F.st.floor.beaten, keys: [{ key: '空格', label: '举到顶时按' }], choices: [BYE] });
  const act: FAct = {
    id: 'farm:thresh', name: '打场', anchor: V(FLOOR.x, FLOOR.y + 1.3, FLOOR.z), spot: { x: FLOOR.x, z: FLOOR.z + FLOOR.r + 0.6, yaw: PI }, radius: 3.2, state, noZoom: true,
    on() { return k.atmos.night < 0.72 && (k.bag.has('sheaf') || k.bag.has('milletEar') || F.st.floor.spread > 0); },
    enter() {
      press.reset(); t = 0; ph = 0; strike = -1; good = 0; hits = 0;
      const v = view(center.clone().lerp(k.player.pos, 0.4), PI * 0.78, 5.4, 2.6, 0.5); cam.start(v.pos, v.look, 42, 1.5);
      const w = why(k, { night: 0.72, rain: true });
      if (w) { phase = 'no'; set({ title: '打场', text: w, choices: [BYE] }); return; }
      const f = F.st.floor;
      if (f.spread > 0 && f.crop) { crop = f.crop; startBeat(); return; }
      // 解开挑来的麦捆，一圈摊开；没有麦就摊谷穗
      crop = k.bag.has('sheaf') ? 'wheat' : 'millet';
      const id = crop === 'wheat' ? 'sheaf' : 'milletEar', n = Math.min(16, k.bag.count(id));
      k.bag.take(id, n, { quiet: true });
      Mo.spread(F.st, crop, n);
      F.yardChanged();
      phase = 'unload'; t = 0;
      set({ title: crop === 'wheat' ? '打场' : '打谷', ...chain(crop, crop === 'wheat' ? '打场' : '打谷'), hint: crop === 'wheat' ? `解开麦捆，${n}捆摊成一圈` : `${n}把谷穗摊开` });
    },
    exit() { restore(); const av = k.player.av; av.reach('L', null); av.reach('R', null); av.bow = 0; av.setPose('stand', 0.6); },
    update(dt) {
      const e = press.step(dt);
      cam.update(dt);
      t += dt;
      const av = k.player.av;
      if (phase === 'unload') {
        av.setPose('crouch', 0.5);
        const s = Math.sin(t * 4.5) * 0.35;
        av.reach('L', loc(k, 0.2 + s, 0.15, 0.55), { rate: 8 }); av.reach('R', loc(k, -0.2 + s, 0.15, 0.55), { rate: 8 });
        if (t > 1.8) { av.setPose('stand', 0.6); av.reach('L', null); av.reach('R', null); startBeat(); }
        return;
      }
      if (phase !== 'beat') return;
      if (strike >= 0) {
        // 一枷落下：0.3 秒甩下去，拍子翻过来拍在麦上
        strike += dt;
        const u = ease(strike / 0.3);
        swing(lifted * (1 - u), lerp(-2.1, 0.35, u * u));
        if (strike >= 0.3) {
          const q = lifted >= 0.74 ? 1 : 0.35;
          const hit = loc(k, 0, 0.05, 1.6);
          F.bits.emit('grain', hit, V(0, 1.6, 0), 4 + Math.round(4 * q), 1.0, FLOOR.y + 0.02);
          F.bits.emit('chaff', hit, V(0, 1.2, 0), 5 + Math.round(5 * q), 1.0, FLOOR.y + 0.02);
          k.sfxAt('thresh', { x: hit.x, z: hit.z, vel: 0.45 + 0.4 * q }); k.buzz(q > 0.9 ? 16 : 6);
          hits++; if (q > 0.9) good++;
          const r = Mo.beat(F.st, q / need + 1e-6);
          F.yardChanged();
          strike = -1; ph = 0;
          if (r.done) { finish(r.grain); return; }
          put({ progress: F.st.floor.beaten, hint: q < 0.9 ? '举到顶再落，打得实' : '' });
        }
        return;
      }
      // 举：指针跟着连枷慢慢起落（1.4 秒一个来回）
      ph += dt;
      const v = 0.5 - 0.5 * Math.cos((ph / 1.4) * PI * 2);
      lifted = v;
      swing(v, lerp(0.5, -2.1, v));
      put({ meter: meter(v) }, true);
      if (e.pressed) { strike = 0; }
    },
    input: { tap() { if (phase === 'beat') press.cmd('down'), press.cmd('up'); return true; } },
    cmd(c, arg) {
      if (c === 'beat') press.cmd(arg);
      else if (c === 'winnow') { k.exitAct(); setTimeout(() => k.enterAct('farm:winnow'), 60); }
      else if (c === 'done') k.exitAct();
    },
  };
  const startBeat = () => {
    phase = 'beat'; ph = 0; strike = -1;
    need = Mo.beatsFor(Math.max(1, F.st.floor.spread));
    grip(k, undo, fl.obj, 'R');
    beatUi();
  };
  const finish = (grain: number) => {
    phase = 'done'; press.reset();
    swing(0, 0.4); k.player.av.bow = 0.05;
    if (crop === 'wheat') {
      F.worked('打了一场麦');
      set({ title: '打场', ...chain('wheat', '扬场'), text: `打完了。秸秆挑到一边，场上剩一堆连糠带粒的${F.st.floor.heap}升。\n扬一扬，借风把糠扬走。`, lines: [QUOTES.field.text], source: QUOTES.field.source, done: true, choices: [{ id: 'winnow', label: '扬场', main: true }, BYE] });
    } else {
      const got = k.bag.add('gu', grain, { quiet: true });
      F.worked(`打了谷子${got}升`);
      set({ title: '打谷', ...chain('millet', '舂米'), text: `谷子打下来了，拢起来装了${got}升。\n拿到溪上的水碓去舂一舂，簸去糠就是小米。`, lines: [QUOTES.millet.text], source: QUOTES.millet.source, done: true, choices: [BYE] });
    }
  };
  return act;
}

// ———————————————————————————— 扬场 ————————————————————————————
function winnow(k: Anlewo, F: Farm): Act {
  const { state, set, put, undo, restore } = base(k);
  const sh = shovel(); sh.visible = false;
  const cam = new Cam(k), press = new Press();
  let phase: 'scoop' | 'ready' | 'throw' | 'idle' | 'done' | 'no' = 'idle', t = 0, got = 0, throws = 0, gust = 0, wv = 0, lastQ = '';
  const heapP = V(HEAP.x, FLOOR.y, HEAP.z);
  const windNow = (tt: number) => clamp01(k.atmos.wind / 0.2 + 0.1 * Math.sin(tt * 1.7) + 0.07 * Math.sin(tt * 3.3 + 1.2) + gust);
  /** 木锨：kk 0 插在堆里、1 扬到头顶 */
  const pose = (kk: number) => {
    const av = k.player.av;
    const r = loc(k, -0.12, lerp(0.55, 1.35, kk), lerp(0.25, 0.3, kk)), d = new THREE.Vector3(0.05, lerp(-0.55, 0.85, kk), lerp(0.85, 0.5, kk)).normalize(), wd = dirL(k, d.x, d.y, d.z);
    av.reach('R', r, { dir: wd, palm: UPV, rate: 16 });
    av.reach('L', r.clone().addScaledVector(wd, 0.55), { dir: wd, palm: UPV, rate: 16 });
    av.bow = lerp(0.45, 0.02, kk);
  };
  const meter = () => ({ v: wv, lo: 0.4, hi: 0.82, label: '风' });
  const ui = (extra: Record<string, unknown> = {}) => set({ title: '扬场', ...chain('wheat', '扬场'), hint: throws === 0 ? '按住铲一锨；看着风，风到朱色那一段时松手扬出去' : '', hold: { id: 'throw', label: '扬' }, meter: meter(), count: got, keys: [{ key: '空格', label: '按住铲，松开扬' }], choices: [BYE], ...extra });
  const act: FAct = {
    id: 'farm:winnow', name: '扬场', anchor: V(HEAP.x, FLOOR.y + 1.2, HEAP.z), spot: { x: HEAP.x, z: HEAP.z + 1.05, yaw: PI }, radius: 3, state, noZoom: true,
    on() { return F.st.floor.heap > 0 && k.atmos.night < 0.72; },
    enter() {
      press.reset(); got = 0; throws = 0; t = 0; lastQ = '';
      const v = view(heapP, -PI * 0.3, 5.6, 2.4, 0.9); cam.start(v.pos, v.look, 44, 1.5);
      const w = why(k, { night: 0.72, rain: true });
      if (w) { phase = 'no'; set({ title: '扬场', text: w, choices: [BYE] }); return; }
      phase = 'idle';
      grip(k, undo, sh, 'R');
      F.heaps.clean.visible = false; F.heaps.chaff.visible = false;
      ui();
    },
    exit() { restore(); const av = k.player.av; av.reach('L', null); av.reach('R', null); av.bow = 0; F.heaps.clean.visible = false; F.yardChanged(); },
    update(dt) {
      const e = press.step(dt);
      cam.update(dt);
      t += dt;
      gust = Math.max(0, gust - dt * 0.2);
      if (Math.random() < dt * 0.06) gust = 0.25 * Math.random();
      wv += (windNow(t) - wv) * Math.min(1, dt * 3);
      if (phase === 'no' || phase === 'done') return;
      put({ meter: meter() }, true);
      if (phase === 'idle') { pose(0.12 + 0.03 * Math.sin(t * 2)); if (press.down) { phase = 'scoop'; t = 0; } return; }
      if (phase === 'scoop') {
        pose(0.0); k.player.av.bow = 0.55;
        if (t > 0.45) { phase = 'ready'; k.sfx('scoop', { vel: 0.4 }); }
        if (e.released) { phase = 'idle'; }
        return;
      }
      if (phase === 'ready') { pose(0.12); if (!press.down) { phase = 'throw'; t = 0; } return; }
      if (phase === 'throw') {
        const u = ease(t / 0.32);
        pose(u);
        if (t >= 0.32) {
          throws++;
          const q: 'good' | 'weak' | 'strong' = wv < 0.4 ? 'weak' : wv > 0.82 ? 'strong' : 'good';
          const n = Mo.winnow(F.st, q);
          if (n > 0) got += k.bag.add('wheat', n, { quiet: true });
          const top = loc(k, -0.05, 2.0, 0.6), w = new THREE.Vector3(F.bits.wind.x, 0, F.bits.wind.z).normalize();
          F.bits.emit('grain', top, V(0, 1.2, 0).addScaledVector(dirL(k, 0, 0, 1), 0.5), 10, 0.5, FLOOR.y + 0.03);
          F.bits.emit('chaff', top, V(0, 1.6, 0).addScaledVector(w, q === 'weak' ? 0.2 : 1.6), 14, 0.6, FLOOR.y + 0.03);
          k.sfx('winnow', { vel: 0.55 });
          // 扬净的那一堆渐渐高起来；糠落在下风头
          const cl = F.heaps.clean, s = 0.35 + 0.5 * Math.min(1, got / 12);
          cl.visible = got > 0; cl.position.copy(loc(k, 0.1, 0, 1.25)); cl.position.y = FLOOR.y; cl.scale.set(s, s * 0.8, s);
          const ch = F.heaps.chaff, s2 = 0.3 + 0.5 * Math.min(1, throws / 12);
          ch.visible = true; ch.position.set(heapP.x + w.x * 2.2, FLOOR.y, heapP.z + w.z * 2.2); ch.scale.set(s2 * 1.3, s2 * 0.5, s2 * 1.3);
          F.yardChanged();
          lastQ = q;
          if (F.st.floor.heap <= 0) { finish(); return; }
          phase = 'idle';
          ui({ hint: q === 'weak' ? '风太小，糠扬不走' : q === 'strong' ? '风太大，麦粒也刮跑了些' : '好风，糠飘走了', count: got });
        }
      }
    },
    input: { tap() { return true; } },
    cmd(c, arg) {
      if (c === 'throw') press.cmd(arg);
      else if (c === 'grind') { k.exitAct(); setTimeout(() => k.enterAct('farm:grind'), 60); }
      else if (c === 'done') k.exitAct();
    },
  };
  const finish = () => {
    phase = 'done'; press.reset(); pose(0.1);
    F.worked(`扬了一场麦，得${got}升`);
    void lastQ;
    set({ title: '扬场', ...chain('wheat', '磨面'), text: `扬净了，得麦${got}升，装进口袋。\n场边那盘石磨，推一推就是面。`, lines: [QUOTES.store.text], source: QUOTES.store.source, done: true, choices: [{ id: 'grind', label: '推磨', main: true }, BYE] });
  };
  return act;
}

// ———————————————————————————— 推磨 ————————————————————————————
function grind(k: Anlewo, F: Farm): Act {
  const { state, set, put } = base(k);
  const cam = new Cam(k), press = new Press();
  const C = V(MILL.x, MILL.y, MILL.z), R = MILL.walk, LEAD = 0.36;
  let phase: 'push' | 'done' | 'none' = 'push', theta = PI / 2, turned = 0, flour = 0, mv: { done: boolean } | null = null, retarget = 0, sound = 0;
  addDisc(MILL.x, MILL.z, MILL.base + 0.05);
  const ang = () => Math.atan2(k.player.pos.z - C.z, k.player.pos.x - C.x);
  const ui = () => set({ title: '推磨', ...chain('wheat', '磨面'), hint: turned === 0 ? '按住，扶着磨棍一圈一圈地推' : '', hold: { id: 'push', label: '推', v: (turned % (PI * 2)) / (PI * 2) }, count: flour, progress: null, keys: [{ key: '空格', label: '按住推' }], choices: [BYE] });
  const act: FAct = {
    id: 'farm:grind', name: '推磨', anchor: V(MILL.x, MILL.y + 1.3, MILL.z), spot: { x: MILL.x + Math.cos(PI / 2) * R, z: MILL.z + Math.sin(PI / 2) * R, yaw: Math.atan2(-Math.sin(PI / 2), Math.cos(PI / 2)) }, radius: 2.8, state, noZoom: true,
    on() { return (k.bag.has('wheat') || !F.st.pantry.wheat) && k.atmos.night < 0.9; },
    enter() {
      press.reset(); turned = 0; flour = 0; retarget = 0;
      if (!k.bag.has('wheat')) F.pantry('wheat');
      theta = ang();
      F.mill.rotor.rotation.y = -(theta + LEAD);
      const v = view(C, PI * 0.22, 5.2, 2.7, 0.6); cam.start(v.pos, v.look, 44, 1.5);
      k.player.av.setHands('free');
      phase = 'push';
      ui();
    },
    exit() { const av = k.player.av; av.reach('L', null); av.reach('R', null); av.bow = 0; k.events.loop?.('millstone', 0); k.player.stop(); },
    update(dt) {
      press.step(dt);
      cam.update(dt);
      if (phase !== 'push') return;
      const av = k.player.av, p = k.player;
      // 磨棍跟着人：棍梢总在人身前一点
      const a = ang();
      let d = a - theta; while (d > PI) d -= PI * 2; while (d < -PI) d += PI * 2;
      if (d > 0) turned += d;
      theta = a;
      F.mill.rotor.rotation.y = -(theta + LEAD);
      const tip = F.mill.barTip();
      av.reach('R', tip.clone().add(dirL(k, -0.1, -0.02, 0)), { rate: 14 }); av.reach('L', tip.clone().add(dirL(k, 0.1, -0.02, 0)), { rate: 14 });
      av.bow = 0.22;
      if (press.down) {
        retarget -= dt;
        if (retarget <= 0 || !mv || mv.done) {
          const nx = C.x + Math.cos(theta + 0.62) * R, nz = C.z + Math.sin(theta + 0.62) * R;
          p.goTo(nx, nz, { r: 0.05 }); mv = { done: false }; retarget = 0.25;
        }
        sound = Math.min(1, sound + dt * 2);
      } else { if (mv) { p.stop(); mv = null; } sound = Math.max(0, sound - dt * 3); }
      k.events.loop?.('millstone', sound * Math.min(1, p.speed / 0.8));
      // 推满一圈：一升麦磨成一升面
      if (turned >= PI * 2) {
        turned -= PI * 2;
        if (k.bag.take('wheat', 1, { quiet: true })) {
          flour += k.bag.add('flour', 1, { quiet: true });
          F.mill.flour.visible = true; F.mill.flour.scale.setScalar(0.9 + 0.2 * Math.min(1, flour / 8));
          k.sfx('grain', { vel: 0.3 });
          put({ count: flour });
        }
        if (!k.bag.has('wheat')) { finish(); return; }
      }
      put({ hold: { id: 'push', label: '推', v: turned / (PI * 2) } }, true);
    },
    input: { tap() { return true; } },
    cmd(c, arg) { if (c === 'push') press.cmd(arg); else if (c === 'done') k.exitAct(); },
  };
  const finish = () => {
    phase = 'done'; press.reset(); k.player.stop();
    k.events.loop?.('millstone', 0);
    F.worked(`推磨，得面${flour}升`);
    set({ title: '推磨', ...chain('wheat', '磨面'), text: `磨好了，罗下来细细的面${flour}升。`, lines: [QUOTES.nest.text], source: QUOTES.nest.source, done: true, choices: [BYE] });
  };
  return act;
}

// ———————————————————————————— 舂米（水碓） ————————————————————————————
function pound(k: Anlewo, F: Farm): Act | null {
  const a = k.build?.anchors.mill, ham = k.build?.parts.millHammer;
  if (!a || !ham) return null;
  const { state, set, put } = base(k);
  const cam = new Cam(k), press = new Press();
  // 碓头的杵尖（锤子自己坐标里最低的那一点）：落下时就在臼里
  const tipL = (() => {
    const m = ham as THREE.Mesh, pos = (m.geometry as THREE.BufferGeometry | undefined)?.attributes?.position;
    let best = new THREE.Vector3(-2, -0.7, 0), by = 1e9;
    if (pos) for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); if (x < -1.6 && y < by) { by = y; best = new THREE.Vector3(x, y, pos.getZ(i)); } }
    return best;
  })();
  const mortar = () => { const w = ham.localToWorld(tipL.clone()); return w; };
  let phase: 'stir' | 'done' | 'no' = 'stir', stir = -1, loaded = 0, ok = 0, NEED = 6, warn = 0;
  const lift = () => (ham.userData.lift as number) ?? 0;
  const ui = (extra: Record<string, unknown> = {}) => set({ title: '舂米', ...chain('millet', '舂米'), hint: ok === 0 ? '碓头抬起来时（朱色那一段）伸手翻一翻；落下来时别伸手' : '', hold: { id: 'stir', label: '翻' }, meter: { v: lift(), lo: 0.55, hi: 1, label: '碓头' }, count: ok, total: NEED, progress: ok / NEED, keys: [{ key: '空格', label: '翻' }], choices: [BYE], ...extra });
  const act: FAct = {
    id: 'farm:pound', name: '舂米', anchor: a.position.clone().add(V(0, 1.2, 0)), spot: { x: a.position.x, z: a.position.z, yaw: a.rotation.y }, radius: 2.4, state, noZoom: true,
    on() { return (k.bag.has('gu') || !F.st.pantry.gu) && k.atmos.night < 0.9; },
    enter() {
      press.reset(); ok = 0; stir = -1; warn = 0;
      if (!k.bag.has('gu')) F.pantry('gu');
      // 镜头在碓屋敞着的那一边（朝溪、往下游退一点），看着石臼与蹲着的人
      const m = mortar(), f = new THREE.Vector3(Math.sin(a.rotation.y), 0, Math.cos(a.rotation.y)), side = new THREE.Vector3(-f.z, 0, f.x);
      if (streamAt(a.position.x + side.x, a.position.z + side.z).d > streamAt(a.position.x - side.x, a.position.z - side.z).d) side.negate();
      const cp = a.position.clone().addScaledVector(f, -1.3).addScaledVector(side, 2.4).add(V(0, 1.75, 0));
      cam.start(cp, m.clone().lerp(k.player.pos, 0.35).add(V(0, 0.15, 0)), 46, 1.5);
      loaded = Math.min(6, k.bag.count('gu'));
      k.bag.take('gu', loaded, { quiet: true });
      k.player.av.setPose('crouch', 0.8); k.player.av.setHands('free');
      phase = 'stir';
      ui({ text: `倒了${loaded}升谷子在臼里。` });
    },
    exit() { const av = k.player.av; av.reach('R', null); av.setPose('stand', 0.6); if (phase === 'stir' && loaded > 0) k.bag.add('gu', loaded, { quiet: true }); },
    update(dt) {
      const e = press.step(dt);
      cam.update(dt);
      if (phase !== 'stir') return;
      const av = k.player.av, m = mortar(), L = lift();
      put({ meter: { v: L, lo: 0.55, hi: 1, label: '碓头' } }, true);
      if (ham.userData.thump) F.bits.emit('chaff', m.clone().add(V(0, 0.2, 0)), V(0, 1.1, 0), 5, 0.6, m.y - 0.2);
      warn = Math.max(0, warn - dt);
      if (stir >= 0) {
        stir += dt;
        const u = stir < 0.35 ? ease(stir / 0.35) : 1 - ease((stir - 0.35) / 0.3);
        av.reach('R', loc(k, -0.05, 0.55, 0.3).lerp(m.clone().add(V(0, 0.06, 0)), u), { rate: 18 });
        if (stir >= 0.65) { stir = -1; av.reach('R', null); }
        return;
      }
      av.reach('R', null);
      if (e.pressed) {
        if (L >= 0.5) {
          stir = 0; ok++;
          k.sfx('stir', { vel: 0.4 });
          if (ok >= NEED) { finish(); return; }
          put({ count: ok, progress: ok / NEED, hint: '' });
        } else {
          // 碓头正往下落（或正落在臼里）：缩手
          warn = 1.2; k.buzz([30, 40, 30]);
          put({ hint: '险！碓头落下来了，等它抬起来' });
        }
      }
    },
    input: { tap() { if (phase === 'stir') { press.cmd('down'); press.cmd('up'); } return true; } },
    cmd(c, arg) { if (c === 'stir') press.cmd(arg); else if (c === 'done') k.exitAct(); },
  };
  const finish = () => {
    phase = 'done'; press.reset();
    const got = k.bag.add('millet', loaded, { quiet: true });
    loaded = 0;
    k.player.av.reach('R', null);
    F.worked(`舂了小米${got}升`);
    set({ title: '舂米', ...chain('millet', '舂米'), text: `舂好了，簸去糠，黄澄澄的小米${got}升。`, lines: [QUOTES.harvest.text], source: QUOTES.harvest.source, done: true, choices: [BYE] });
  };
  return act;
}

export function create(k: Anlewo): Act[] {
  const F = farmOf(k);
  return [thresh(k, F), winnow(k, F), grind(k, F), pound(k, F)].filter((a): a is Act => !!a);
}
