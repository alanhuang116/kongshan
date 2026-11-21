/**
 * 田外的几件：
 *   打水（溪边） —— 蹲在岸上，按住把桶按进溪里，满了提上来；打满一担（两桶）。
 *   打水（井）   —— 按住摇辘轳，桶一点一点升上来；一松手桶往下滑。升到井口，提过来倒进自己的桶里。
 *   摘桃 —— 夏天，石桥边那株桃结了桃。按住，伸手够一个、拧下来。
 *   打枣 —— 秋天，邻家甲门前的枣树。拿竹竿往树上打，枣子落一地，再蹲下去拾。
 *   摘柿 —— 秋天，乙家屋旁的柿树。竹竿梢上的杈子夹住柿子一拧，柿子落进手里。
 *   采桑 —— 春夏，桑园西北角那一株。挎着篮子，一把一把地采。
 * 水、桃、枣、柿、桑叶都收进行囊。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import type { Act } from './types';
import { QUOTES } from '../../data/farm';
import { farmOf, type Farm } from '../farm';
import { DIPS, FRUIT, MULBERRY, PEACH, WELL, type TreeAt } from '../farm/layout';
import { bucketGeo, longPole, mats, seedBasket } from '../farm/props';
import { ground } from '../site';
import { standable } from '../walk';
import { BYE, Cam, Press, base, clearView, dirL, ease, grip, lerp, loc, why, type FAct } from '../farm/actkit';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
/** 离树 r 米、能站人、离 toward 那一点最近的地方；面朝树 */
function besideTree(t: { x: number; z: number }, r: number, toward: { x: number; z: number }) {
  let best = { x: t.x + r, z: t.z, yaw: -PI / 2 }, bd = 1e9;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * PI * 2, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
    if (standable(x, z) == null) continue;
    const d = Math.hypot(x - toward.x, z - toward.z);
    if (d < bd) { bd = d; best = { x, z, yaw: Math.atan2(t.x - x, t.z - z) }; }
  }
  return best;
}

// ———————————————————————————— 溪边打水 ————————————————————————————
function dip(k: Anlewo, F: Farm, d: (typeof DIPS)[number]): Act {
  const { state, set, put, undo, restore } = base(k);
  const pail = new THREE.Mesh(bucketGeo(0.15, 0.18, 0.32, 0), mats().wood); pail.name = 'farm:dip-pail'; pail.visible = false;
  const full = new THREE.Mesh(bucketGeo(0.15, 0.18, 0.32, 0.82), mats().wood); full.name = 'farm:dip-full'; full.visible = false;
  const cam = new Cam(k), press = new Press();
  const wp = V(d.water.x, d.water.y, d.water.z);
  let fill = 0, phase: 'dip' | 'lift' | 'done' | 'no' = 'dip', t = 0, splashed = false;
  const ui = (extra: Record<string, unknown> = {}) => set({ title: '打水', hint: fill === 0 && k.bag.count('water') === 0 ? '按住，把桶按进水里；满了自己提上来' : '', hold: { id: 'dip', label: '舀', v: fill }, meter: { v: fill, lo: 0.85, hi: 1, label: '桶' }, count: k.bag.count('water'), total: 2, choices: [BYE], ...extra });
  const act: FAct = {
    id: `farm:${d.id}`, name: '打水', anchor: wp.clone().add(V(0, 1.1, 0)), spot: { x: d.x, z: d.z, yaw: d.yaw }, radius: 2.6, state, noZoom: true,
    on() { return k.bag.count('water') < 2 && k.atmos.night < 0.7; },
    enter() {
      press.reset(); fill = 0; t = 0; splashed = false;
      const v = clearView(wp.clone().lerp(k.player.pos, 0.5), d.yaw + PI + 1.1, 3.6, 1.5, 0.1); cam.start(v.pos, v.look, 44, 1.4);
      const w = why(k, { night: 0.7 });
      if (w) { phase = 'no'; set({ title: '打水', text: w, choices: [BYE] }); return; }
      phase = 'dip';
      k.player.av.setPose('crouch', 0.7); k.player.av.setHands('free');
      grip(k, undo, pail, 'R', [0, -0.02, 0.02], [PI, 0, 0]);
      const sp = loc(k, 0.45, 0, 0.1); full.position.set(sp.x, ground(sp.x, sp.z), sp.z); full.visible = k.bag.count('water') > 0; k.world.scene.add(full);
      undo.push(() => { full.removeFromParent(); full.visible = false; });
      ui();
    },
    exit() { restore(); const av = k.player.av; av.reach('R', null); av.bow = 0; av.setPose('stand', 0.7); },
    update(dt) {
      press.step(dt);
      cam.update(dt);
      if (phase === 'no' || phase === 'done') return;
      const av = k.player.av;
      t += dt;
      if (phase === 'lift') {
        const u = ease(t / 0.7);
        av.reach('R', wp.clone().add(V(0, 0.05 + 0.55 * u, 0)).lerp(loc(k, -0.25, 0.35, 0.35), u), { rate: 10 }); av.bow = lerp(0.5, 0.2, u);
        if (t >= 0.7) {
          k.bag.add('water', 1, { quiet: true });
          k.sfx('pour', { variant: 'water', vel: 0.3 } as unknown as { vel: number });
          fill = 0; splashed = false; full.visible = true;
          if (k.bag.count('water') >= 2) {
            phase = 'done'; av.reach('R', null); av.bow = 0;
            F.worked();
            set({ title: '打水', text: '打满了一担水，挑去浇地。', done: true, choices: [BYE] });
            return;
          }
          phase = 'dip'; ui();
        }
        return;
      }
      if (press.down) {
        // 伸下去，桶口按进水里；按着就灌
        av.bow = 0.5;
        av.reach('R', wp.clone().add(V(0, 0.05, 0)), { rate: 7 });
        // 伸下去半秒多，桶口就进了水（够不够得着由小人自己尽量伸）
        if (press.t > 0.55) {
          if (!splashed) { splashed = true; k.fx?.burst('splash', wp, 8); k.land.ripple(wp.x, wp.z, 1); k.sfx('dip', { vel: 0.5 }); }
          fill = Math.min(1, fill + dt / 1.2);
          if (Math.random() < dt * 6) k.land.ripple(wp.x + (Math.random() - 0.5) * 0.3, wp.z + (Math.random() - 0.5) * 0.3, 0.4);
          put({ meter: { v: fill, lo: 0.85, hi: 1, label: '桶' }, hold: { id: 'dip', label: '舀', v: fill } }, true);
          if (fill >= 1) { phase = 'lift'; t = 0; }
        }
      } else { av.reach('R', loc(k, -0.25, 0.4, 0.4), { rate: 6 }); av.bow = 0.2; }
    },
    input: { tap() { return true; } },
    cmd(c, arg) { if (c === 'dip') press.cmd(arg); else if (c === 'done') k.exitAct(); },
  };
  return act;
}

// ———————————————————————————— 井上打水（辘轳） ————————————————————————————
function well(k: Anlewo, F: Farm): Act {
  const { state, set, put, undo, restore } = base(k);
  const cam = new Cam(k), press = new Press();
  const W = WELL, bucket = k.build?.parts.bucket ?? null, crank = k.build?.parts.windlass ?? null;
  const own = new THREE.Mesh(bucketGeo(0.15, 0.18, 0.32, 0), mats().wood); own.name = 'farm:well-pail'; own.visible = false;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 4).translate(0, -0.5, 0).toNonIndexed(), mats().wood); rope.name = 'farm:rope'; rope.visible = false;
  rope.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(rope.geometry.attributes.position.count * 3).fill(0.62), 3));
  let up = 0, ang = 0, phase: 'crank' | 'take' | 'done' | 'no' = 'crank', t = 0, creak = 0;
  const DEPTH = 2.8;
  const bucketPos = () => V(W.x + 0.03, W.top + 0.85 - DEPTH * (1 - up), W.z);
  const ui = (extra: Record<string, unknown> = {}) => set({ title: '打水', hint: up < 0.05 && k.bag.count('water') === 0 ? '按住摇辘轳；一松手桶就往下滑' : '', hold: { id: 'crank', label: '摇', v: up }, meter: { v: up, lo: 0.94, hi: 1, label: '井绳' }, count: k.bag.count('water'), total: 2, choices: [BYE], ...extra });
  const act: FAct = {
    id: 'farm:well', name: '打水', anchor: V(W.x, W.top + 1.6, W.z), spot: { x: W.spot.x, z: W.spot.z, yaw: W.spot.yaw }, radius: 2.4, state, noZoom: true,
    on() { return k.bag.count('water') < 2 && k.atmos.night < 0.75; },
    enter() {
      press.reset(); up = 0; t = 0; ang = 0;
      const v = clearView(V(W.x + 0.8, W.top, W.z), PI * 0.2, 4.3, 1.7, 0.9); cam.start(v.pos, v.look, 46, 1.4);
      const w = why(k, { night: 0.75 });
      if (w) { phase = 'no'; set({ title: '打水', text: w, choices: [BYE] }); return; }
      phase = 'crank';
      k.player.av.setHands('free');
      // 井台上那只桶系到绳上，放下井去
      if (bucket) {
        const home = { parent: bucket.parent, p: bucket.position.clone(), q: bucket.quaternion.clone() };
        k.world.scene.attach(bucket); bucket.rotation.set(0, 0.7, 0);
        undo.push(() => { if (home.parent) home.parent.attach(bucket); bucket.position.copy(home.p); bucket.quaternion.copy(home.q); });
      }
      rope.visible = true; k.world.scene.add(rope); undo.push(() => { rope.removeFromParent(); rope.visible = false; });
      const sp = loc(k, 0.5, 0, 0.3); own.position.set(sp.x, W.top - 0.12, sp.z); own.visible = true; k.world.scene.add(own); undo.push(() => { own.removeFromParent(); own.visible = false; });
      k.sfx('bucket', { variant: 'splash', vel: 0.5 } as unknown as { vel: number });
      ui();
    },
    exit() { restore(); const av = k.player.av; av.reach('L', null); av.reach('R', null); av.bow = 0; if (crank) crank.rotation.x = 0; },
    update(dt) {
      press.step(dt);
      cam.update(dt);
      if (phase === 'no' || phase === 'done') return;
      const av = k.player.av;
      t += dt;
      if (phase === 'crank') {
        if (press.down) { up = Math.min(1, up + dt / 3.4); ang += dt * 4.2; creak += dt; if (creak > 0.75) { creak = 0; k.sfx('bucket', { variant: 'creak', vel: 0.35 } as unknown as { vel: number }); } }
        else if (up > 0) { up = Math.max(0, up - dt / 2.6); ang -= dt * 3.2; }
        // 曲柄绕 x 转：把手在 (axle − r·cos, z + r·sin)，与下面手的位置一致（three 的转向与它相反，所以取负）
        if (crank) crank.rotation.x = -ang;
        // 两手握着曲柄的把，跟着转
        const hy = W.axle - Math.cos(ang) * W.crankR, hz = W.z + Math.sin(ang) * W.crankR;
        av.reach('R', V(W.crankX + 0.1, hy, hz), { rate: 16 }); av.reach('L', V(W.crankX - 0.02, hy, hz), { rate: 16 });
        av.bow = 0.1 + 0.08 * Math.max(0, Math.cos(ang));
        put({ meter: { v: up, lo: 0.94, hi: 1, label: '井绳' }, hold: { id: 'crank', label: '摇', v: up } }, true);
        if (up >= 1) { phase = 'take'; t = 0; }
      } else if (phase === 'take') {
        // 提过来，倒进自己的桶里
        const bp = bucketPos();
        av.reach('R', t < 0.6 ? bp.clone().add(V(0, -0.02, 0)) : own.position.clone().add(V(0, 0.55, 0)), { rate: 8 }); av.reach('L', null);
        if (t > 0.6 && t - dt <= 0.6) { k.sfx('pour', { variant: 'water', vel: 0.4 } as unknown as { vel: number }); }
        if (t >= 1.4) {
          k.bag.add('water', 1, { quiet: true });
          own.geometry.dispose(); own.geometry = bucketGeo(0.15, 0.18, 0.32, 0.82);
          if (k.bag.count('water') >= 2) {
            phase = 'done'; av.reach('R', null); av.reach('L', null);
            F.worked();
            set({ title: '打水', text: '一担水打满了。井水凉，浇地、煮茶都好。', done: true, choices: [BYE] });
            return;
          }
          up = 0; phase = 'crank'; k.sfx('bucket', { variant: 'splash', vel: 0.4 } as unknown as { vel: number });
          ui();
        }
      }
      // 桶与绳
      const bp = bucketPos();
      if (bucket) bucket.position.copy(bp);
      const top = V(W.x + 0.03, W.axle - 0.14, W.z), len = Math.max(0.05, top.y - bp.y);
      rope.position.copy(top); rope.scale.set(1, len, 1);
    },
    input: { tap() { return true; } },
    cmd(c, arg) { if (c === 'crank') press.cmd(arg); else if (c === 'done') k.exitAct(); },
  };
  return act;
}

// ———————————————————————————— 摘桃 ————————————————————————————
function peachAct(k: Anlewo, F: Farm): Act {
  const { state, set, put } = base(k);
  const cam = new Cam(k), press = new Press();
  const sp = besideTree(PEACH, 1.05, { x: 0, z: 30 });
  // 近的放在后头：摘一个少一个，先摘够得着的
  F.peaches.sort((a, b) => Math.hypot(b.x - sp.x, b.z - sp.z) + b.y * 0.3 - (Math.hypot(a.x - sp.x, a.z - sp.z) + a.y * 0.3));
  F.fruitChanged();
  let t = 0, picked = 0, phase: 'pick' | 'done' = 'pick', target: THREE.Vector3 | null = null;
  const reach = () => { const i = F.peachLeft - 1; if (i < 0) return null; const p = F.peaches[i]; return Math.hypot(p.x - k.player.pos.x, p.z - k.player.pos.z) < 2.0 && p.y < k.player.pos.y + 2.25 ? p : null; };
  const act: FAct = {
    id: 'farm:peach', name: '摘桃', anchor: V(PEACH.x, ground(PEACH.x, PEACH.z) + 2.4, PEACH.z), spot: { x: sp.x, z: sp.z, yaw: sp.yaw }, radius: 2.6, state, noZoom: true,
    on() { return k.season === 'summer' && F.peachLeft > 0 && k.atmos.night < 0.7; },
    enter() {
      press.reset(); picked = 0; t = 0; phase = 'pick'; target = null;
      const c = V(PEACH.x, ground(PEACH.x, PEACH.z), PEACH.z), v = clearView(c.clone().lerp(k.player.pos, 0.5), sp.yaw + PI + 0.8, 4.2, 1.6, 1.4); cam.start(v.pos, v.look, 44, 1.4);
      k.player.av.setHands('free');
      set({ title: '摘桃', hint: '按住，伸手够一个桃，拧下来', hold: { id: 'pick', label: '摘' }, count: 0, choices: [BYE] });
    },
    exit() { const av = k.player.av; av.reach('R', null); av.reach('L', null); av.lookAt(null); if (picked) k.note(`摘了${picked}个桃`, 'farm'); },
    update(dt) {
      press.step(dt);
      cam.update(dt);
      if (phase !== 'pick') return;
      const av = k.player.av;
      if (!target) {
        av.reach('R', null);
        if (!press.down) return;
        target = reach(); t = 0;
        if (!target) { finish(); return; }
      }
      t += dt;
      av.lookAt(target);
      av.reach('R', t < 0.7 ? target : target.clone().lerp(loc(k, -0.2, 1.0, 0.3), ease((t - 0.7) / 0.4)), { rate: 9 });
      if (t >= 0.7 && t - dt < 0.7) {
        F.peachLeft--; F.fruitChanged();
        picked += k.bag.add('peach', 1, { quiet: true });
        F.bits.emit('leaf', target, V(0, 0.3, 0), 3, 0.5, ground(target.x, target.z));
        k.sfx('pluck', { vel: 0.45 });
        put({ count: picked });
      }
      if (t >= 1.15) { target = null; if (picked >= 5 || !reach()) finish(); }
    },
    input: { tap() { return true; } },
    cmd(c, arg) { if (c === 'pick') press.cmd(arg); else if (c === 'done') k.exitAct(); },
  };
  const finish = () => {
    phase = 'done'; press.reset(); k.player.av.reach('R', null);
    F.worked();
    set({ title: '摘桃', text: picked ? `摘了${picked}个桃，毛茸茸的，有一点红。${F.peachLeft > 0 ? '高处的够不着，留给鸟吃。' : ''}` : '够得着的都摘完了。', done: picked > 0, choices: [BYE] });
  };
  return act;
}

// ———————————————————————————— 打枣、摘柿（竹竿） ————————————————————————————
function poleAct(k: Anlewo, F: Farm, tree: TreeAt | null, kind: 'jujube' | 'persimmon'): Act | null {
  if (!tree) return null;
  const { state, set, put, undo, restore } = base(k);
  const pole = longPole(); pole.visible = false;
  const cam = new Cam(k), press = new Press();
  const gy = ground(tree.x, tree.z), crown = V(tree.x, gy + 2.6 * tree.s, tree.z);
  const sp = besideTree(tree, 1.7, { x: tree.x + 3, z: tree.z + 3 });
  const J = kind === 'jujube';
  const C: [number, number, number] = J ? [0.92, 0.45, 0.38] : [1, 0.62, 0.32];
  let t = 0, strikes = 0, got = 0, phase: 'hit' | 'gather' | 'done' | 'no' = 'hit', swingT = -1;
  const ui = () => set({ title: J ? '打枣' : '摘柿', hint: strikes === 0 ? (J ? '按住，竹竿往枝上打' : '按住，竹竿梢的杈子夹住柿子一拧') : '', hold: { id: 'hit', label: J ? '打' : '够' }, count: got, choices: [BYE] });
  const act: FAct = {
    id: `farm:${kind}`, name: J ? '打枣' : '摘柿', anchor: crown.clone().add(V(0, 0.6, 0)), spot: { x: sp.x, z: sp.z, yaw: sp.yaw }, radius: 3, state, noZoom: true,
    on() { return k.season === 'autumn' && k.atmos.night < 0.7; },
    enter() {
      press.reset(); t = 0; strikes = 0; got = 0; swingT = -1;
      // 稍低一点往上看：树冠（枣、柿子）与举着竹竿的人都在画里
      const c0 = crown.clone().lerp(k.player.pos, 0.55), v = clearView(c0.clone().setY(k.player.pos.y), sp.yaw + PI + 0.7, 4.6, 1.15, 1.9); cam.start(v.pos, v.look, 50, 1.4);
      phase = 'hit';
      k.player.av.setHands('free');
      grip(k, undo, pole, 'R', [0, 0, 0], [0, 0, 0]);
      F.fallen = []; F.fruitChanged();
      ui();
    },
    exit() { restore(); const av = k.player.av; av.reach('L', null); av.reach('R', null); av.setPose('stand', 0.6); av.lookAt(null); if (got) k.note(J ? `拾了${got}捧枣` : `得柿子${got}个`, 'farm'); F.fallen = []; F.fruitChanged(); },
    update(dt) {
      const e = press.step(dt);
      cam.update(dt);
      if (phase === 'no' || phase === 'done') return;
      const av = k.player.av;
      t += dt;
      if (phase === 'hit') {
        // 竹竿斜着往上举；打一下：往上一送，再收回来
        const aim = crown.clone().add(dirL(k, 0, 0, -0.3)), base0 = loc(k, -0.1, 1.0, 0.25);
        const s = swingT < 0 ? 0 : Math.sin(Math.min(1, swingT / 0.45) * PI);
        const dir = aim.clone().sub(base0).normalize();
        av.reach('R', base0.clone().addScaledVector(dir, 0.15 * s), { dir, rate: 14 });
        av.reach('L', base0.clone().addScaledVector(dir, 0.55 + 0.15 * s), { dir, rate: 14 });
        av.lookAt(crown);
        if (swingT >= 0) {
          swingT += dt;
          if (swingT >= 0.22 && swingT - dt < 0.22) {
            strikes++;
            if (J) {
              const n = 6 + Math.floor(Math.random() * 5);
              for (let i = 0; i < n; i++) {
                const a = Math.random() * PI * 2, r = Math.random() * 1.3 * tree.s, from = crown.clone().add(V(Math.cos(a) * r, (Math.random() - 0.5) * 0.8, Math.sin(a) * r));
                F.bits.emit('fruit', from, V(0, 0.2, 0), 1, 0.4, ground(from.x, from.z), C);
                F.fallen.push({ x: from.x, y: ground(from.x, from.z), z: from.z, item: 'jujube', c: C });
              }
              F.bits.emit('leaf', crown, V(0, 0.2, 0), 6, 1.2, gy);
              k.sfxAt('rustle', { x: crown.x, z: crown.z, vel: 0.5 }); k.sfx('fruitFall', { vel: 0.5 });
              setTimeout(() => F.fruitChanged(), 650);
            } else {
              got += k.bag.add('persimmon', 1, { quiet: true });
              F.bits.emit('leaf', crown, V(0, 0.2, 0), 3, 0.8, gy);
              k.sfx('pluck', { vel: 0.45 });
            }
            put({ count: J ? F.fallen.length : got });
          }
          if (swingT >= 0.6) swingT = -1;
        } else if (e.pressed || press.down) swingT = 0;
        if (swingT < 0 && ((J && strikes >= 3) || (!J && got >= 3))) {
          if (J) { phase = 'gather'; t = 0; set({ title: '打枣', hint: '枣落了一地。按住，蹲下去拾', hold: { id: 'hit', label: '拾' }, count: 0, choices: [BYE] }); restore(); av.reach('L', null); }
          else finish();
        }
      } else if (phase === 'gather') {
        if (!press.down) { av.setPose('stand', 0.5); av.reach('R', null); return; }
        av.setPose('crouch', 0.5);
        const f = F.fallen[F.fallen.length - 1];
        if (f) av.reach('R', V(f.x, f.y + 0.05, f.z), { rate: 10 });
        if (t > 0.35) {
          t = 0;
          const n = Math.min(4, F.fallen.length);
          F.fallen.splice(F.fallen.length - n, n); F.fruitChanged();
          k.sfx('pluck', { vel: 0.3 });
          if (!F.fallen.length) { got += k.bag.add('jujube', Math.max(1, Math.round(strikes * 0.7)), { quiet: true }); finish(); }
        }
      }
    },
    input: { tap() { return true; } },
    cmd(c, arg) { if (c === 'hit') press.cmd(arg); else if (c === 'done') k.exitAct(); },
  };
  const finish = () => {
    phase = 'done'; press.reset();
    const av = k.player.av; av.reach('R', null); av.reach('L', null); av.setPose('stand', 0.6);
    F.worked(J ? '打枣' : '摘柿子');
    set(J ? { title: '打枣', text: `拾了${got}捧红枣。`, lines: [QUOTES.jujube.text], source: QUOTES.jujube.source, done: true, choices: [BYE] } : { title: '摘柿', text: `摘了${got}个柿子，放几天就软了、甜了。`, done: true, choices: [BYE] });
  };
  return act;
}

// ———————————————————————————— 采桑 ————————————————————————————
function mulberry(k: Anlewo, F: Farm): Act {
  const { state, set, put, undo, restore } = base(k);
  const basket = seedBasket(); basket.visible = false;
  const cam = new Cam(k), press = new Press();
  const gy = ground(MULBERRY.x, MULBERRY.z), sp = besideTree(MULBERRY, 1.0, { x: MULBERRY.x - 4, z: MULBERRY.z - 4 });
  let t = 0, picks = 0, got = 0, phase: 'pick' | 'done' = 'pick', target: THREE.Vector3 | null = null;
  const act: FAct = {
    id: 'farm:mulberry', name: '采桑', anchor: V(MULBERRY.x, gy + 2.4, MULBERRY.z), spot: { x: sp.x, z: sp.z, yaw: sp.yaw }, radius: 2.6, state, noZoom: true,
    on() { return (k.season === 'spring' || k.season === 'summer') && k.atmos.night < 0.7; },
    enter() {
      press.reset(); t = 0; picks = 0; got = 0; phase = 'pick'; target = null;
      const c = V(MULBERRY.x, gy, MULBERRY.z), v = clearView(c.clone().lerp(k.player.pos, 0.5), sp.yaw + PI + 0.8, 4.0, 1.5, 1.2); cam.start(v.pos, v.look, 44, 1.4);
      k.player.av.setHands('free');
      grip(k, undo, basket, 'L', [0, 0.02, 0.06], [0, 0, 0]);
      set({ title: '采桑', hint: '按住，一把一把地采', hold: { id: 'pick', label: '采' }, count: 0, choices: [BYE] });
    },
    exit() { restore(); const av = k.player.av; av.reach('R', null); av.lookAt(null); if (got) k.note(`采了桑叶${got}把`, 'farm'); },
    update(dt) {
      press.step(dt);
      cam.update(dt);
      if (phase !== 'pick') return;
      const av = k.player.av;
      if (!target) {
        av.reach('R', null);
        if (!press.down) return;
        const a = sp.yaw + PI + (Math.random() - 0.5) * 1.6, r = 0.35 + 0.4 * Math.random();
        target = V(MULBERRY.x - Math.sin(a) * r * -1, gy + 1.45 + 0.45 * Math.random(), MULBERRY.z - Math.cos(a) * r * -1).lerp(k.player.pos.clone().setY(gy + 1.7), 0.35);
        t = 0;
      }
      t += dt;
      av.lookAt(target);
      const bp = av.joints.handL.getWorldPosition(new THREE.Vector3()).add(V(0, 0.08, 0));
      av.reach('R', t < 0.55 ? target : target.clone().lerp(bp, ease((t - 0.55) / 0.35)), { rate: 10 });
      if (t >= 0.55 && t - dt < 0.55) { picks++; F.bits.emit('leaf', target, V(0, 0.2, 0), 2, 0.5, gy); k.sfx('pluck', { vel: 0.35 }); if (picks % 2 === 0) { got += k.bag.add('mulberryLeaf', 1, { quiet: true }); put({ count: got }); } }
      if (t >= 0.95) { target = null; if (picks >= 6) finish(); }
    },
    input: { tap() { return true; } },
    cmd(c, arg) { if (c === 'pick') press.cmd(arg); else if (c === 'done') k.exitAct(); },
  };
  const finish = () => {
    phase = 'done'; press.reset(); k.player.av.reach('R', null);
    F.worked('采了桑叶');
    set({ title: '采桑', text: `采了${got}把嫩桑叶。`, lines: [QUOTES.mulberry.text], source: QUOTES.mulberry.source, done: true, choices: [BYE] });
  };
  return act;
}

export function create(k: Anlewo): Act[] {
  const F = farmOf(k);
  return [...DIPS.map((d) => dip(k, F, d)), well(k, F), peachAct(k, F), poleAct(k, F, FRUIT.jujube, 'jujube'), poleAct(k, F, FRUIT.persimmon, 'persimmon'), mulberry(k, F)].filter((a): a is Act => !!a);
}
