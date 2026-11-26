/**
 * 钓鱼（石桥西边的溪岸上，柳树下一块平石）：盘腿坐下，竿伸到溪心。
 *   抛竿：按住「抛」蓄劲，松手把浮子甩出去——落在溪心最好，太近水浅，太远挂在对岸草里。
 *   等：浮子轻轻点两下是鱼在试饵，别动；猛地一沉才是咬钩——这一刻提竿（点画面、或按「提」）。提早了鱼吓跑，晚了饵被偷吃。
 *   遛鱼：按住「提」把竿往上提，松手放一放——劲（表）要在中间那一段：劲太大丝会断，太松鱼就脱钩。鱼拉到岸边就上来了。
 *   上来了：收进篓里（行囊里添一尾鱼），或者放回溪里。
 * 鱼口随时辰、时令、天气：清早、傍晚最好；晌午日头毒，鱼都沉下去了；冬天口迟；夜里少有。
 * 器物在 play/rod.ts。记（mem 'play' 的 fish）：坐过几回、钓上几尾、放了几尾、最大的几寸、各样鱼各几尾。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { SITE, streamAt } from '../site';
import { groundAt, waterDepth } from '../walk';
import type { Act } from './types';
import { makeRodKit, seatGeo } from '../play/rod';
import { wash } from '../ink/ink';
import { V, clamp, cnNum, lerp, onFrame, playGet, playSet, sfx, smooth, stateOf } from '../play/kit';

/** 各样鱼：名字、几寸到几寸、劲多大、颜色 */
const KINDS = {
  ji: { name: '鲫鱼', lo: 3, hi: 7, pull: 0.9, tint: [0.93, 0.93, 0.9] },
  tiao: { name: '白鲦', lo: 2, hi: 4, pull: 0.6, tint: [0.97, 0.98, 0.98] },
  li: { name: '鲤鱼', lo: 7, hi: 15, pull: 1.35, tint: [0.97, 0.88, 0.7] },
  gui: { name: '鳜鱼', lo: 6, hi: 11, pull: 1.15, tint: [0.88, 0.85, 0.74] },
} as const;
type Kind = keyof typeof KINDS;

export function create(k: Anlewo): Act | null {
  const { state, set, put, flush } = stateOf(k);
  // 钓处：溪北岸，石桥西七米，柳树下（溪在这里是东西向，人面朝南）
  const sx = SITE.bridge.x - 7, z0 = SITE.bridge.z - 6.2, gy0 = groundAt(sx, z0);
  if (gy0 == null) return null;
  let wz = z0;
  while (wz < z0 + 8 && waterDepth(sx, wz) <= 0.02) wz += 0.05;
  const S = V(sx, groundAt(sx, wz - 1.15) ?? gy0, wz - 1.15);      // 坐的石头
  const F = V(0, 0, 1), Rt = V(-1, 0, 0);                         // 面朝南（溪），右手是西
  const st = streamAt(sx, wz + 2), waterY = st.y;
  const flow = V(st.tx, 0, st.tz);

  // —— 器物：竿、丝、浮子、鱼（做的时候才出来）；石头、鱼篓一直在那里 ——
  const { rod, line, float, fish } = makeRodKit();
  const seats = seatGeo();
  /** 鱼篓：竹篾编的，经纬两路笔丝 */
  const CREEL = wash({ pig: [0.86, 0.8, 0.62], dens: 1.45, shade: 1.5, grain: 3, streak: [34, 26, 0.5], line: 0.8 });
  const creel = new THREE.Mesh(seats.creel, CREEL);
  creel.position.copy(S).addScaledVector(Rt, 0.52).addScaledVector(F, -0.18); creel.position.y = (groundAt(creel.position.x, creel.position.z) ?? S.y) - 0.01;
  // 就坐在岸上的草里（不另垫石头）；鱼篓钓的时候才放在身边
  const seatTop = S.y + 0.02;
  k.world.scene.add(creel, rod.mesh, line.mesh, float, fish);
  rod.mesh.visible = line.mesh.visible = float.visible = fish.visible = creel.visible = false;

  // —— 一回 ——
  type Phase = 'sit' | 'ready' | 'charge' | 'cast' | 'wait' | 'fight' | 'up' | 'off';
  let phase: Phase = 'off', t = 0, power = 0, castT = 0, snag = false, shallow = false;
  let biteIn = 0, nibbles = 0, biteT = -1, dip = 0, landAt = V(), floatP = V(), drift = 0;
  let kind: Kind = 'ji', size = 4, tension = 0, hold = false, fishD = 1, stamina = 1, run = 0, runT = 0, highT = 0, lowT = 0, fishP = V();
  let caught = 0, sessions = 0;
  const pts: THREE.Vector3[] = Array.from({ length: 10 }, () => V()), lpts: THREE.Vector3[] = Array.from({ length: 18 }, () => V());
  const butt = V(), tip = V(), rdir = V(), tmp = V(), tmp2 = V();
  let lift = 0, liftV = 0, bend = 0;

  /** 此刻的鱼口：几秒来一回 */
  const mouth = () => {
    const a = k.atmos, h = a.hour, S0 = { spring: [6.0, 18.2], summer: [5.1, 19.1], autumn: [6.3, 17.5], winter: [7.0, 17.0] }[k.season];
    let m = 9;
    if (a.night > 0.6) m *= 3.2;
    else if (h < S0[0] + 2.2) m *= 0.5;
    else if (h > S0[1] - 2.2) m *= 0.55;
    else if (h > 11 && h < 14.5) m *= k.season === 'summer' ? 2.6 : 1.7;
    m *= { spring: 0.9, summer: 1, autumn: 0.85, winter: 2.2 }[k.season];
    if (a.w.rain > 0.4) m *= 0.8; if (a.w.snow > 0.4) m *= 1.4;
    return m * (shallow ? 2.5 : 1);
  };
  const mouthWord = () => {
    const a = k.atmos, h = a.hour;
    if (a.night > 0.6) return '夜里鱼少，静静坐着罢';
    if (k.season === 'winter') return '天冷，鱼口迟';
    if (a.dawn > 0.3 || h < 8) return '清早，鱼口正好';
    if (a.dusk > 0.3) return '傍晚，鱼出来觅食';
    if (h > 11 && h < 14.5) return k.season === 'summer' ? '晌午日头毒，鱼都沉在深处' : '晌午，鱼口慢些';
    if (a.w.rain > 0.4) return '雨里垂钓，鱼反倒肯咬';
    return '溪水清浅，看得见水底的石子';
  };
  const pickKind = (): Kind => {
    const r = Math.random(), a = k.atmos, edge = a.dawn > 0.3 || a.dusk > 0.3;
    if (k.season === 'spring') return r < 0.15 ? 'gui' : r < 0.25 + (edge ? 0.08 : 0) ? 'li' : r < 0.5 ? 'tiao' : 'ji';
    if (k.season === 'summer') return r < (edge ? 0.25 : 0.1) ? 'li' : r < 0.55 ? 'tiao' : 'ji';
    if (k.season === 'autumn') return r < 0.25 ? 'li' : r < 0.5 ? 'tiao' : 'ji';
    return r < 0.15 ? 'li' : 'ji';
  };
  const sched = (k0 = 1) => { biteIn = mouth() * (0.4 + Math.random() * 1.2) * k0; nibbles = 1 + Math.floor(Math.random() * 3); biteT = -1; };
  const keysCast = [{ key: '空格', label: '按住蓄劲，松手抛' }];
  /** 抛多大劲落在溪心深处：沿着竿的方向量水深 */
  const ZONE = (() => {
    rodPose(0);
    let lo = -1, hi = -1;
    const dep = (p: number) => waterDepth(tip.x + F.x * (0.3 + 2.4 * p - 1.1), tip.z + F.z * (0.3 + 2.4 * p - 1.1));
    let top = 0; for (let i = 0; i <= 50; i++) top = Math.max(top, dep(i / 50));
    for (let i = 0; i <= 50; i++) { const p = i / 50; if (dep(p) > top * 0.86) { if (lo < 0) lo = p; hi = p; } }
    return lo < 0 ? [0.4, 0.66] : [lo, Math.max(hi, lo + 0.12)];
  })();

  const ready = (hint?: string) => { phase = 'ready'; power = 0; set({ title: '钓鱼', hint: hint ?? mouthWord(), meter: { v: 0, lo: ZONE[0], hi: ZONE[1], label: '劲' }, hold: { id: 'cast', label: '抛' }, keys: keysCast, choices: [{ id: 'done', label: '收竿' }] }); };

  const act: Act = {
    id: 'fishing', name: '垂钓', anchor: S.clone().add(V(0, 1.1, 0.6)), spot: { x: S.x - F.x * 0.45, z: S.z - F.z * 0.45, yaw: 0 }, radius: 2.4, state, noZoom: true,
    enter() {
      const av = k.player.av, p = k.player;
      phase = 'sit'; t = 0; caught = 0; sessions++; lift = 0; liftV = 0; bend = 0;
      av.setSeat?.({ h: seatTop - p.pos.y, r: 0.3 });
      av.setPose('sit', 1.3); av.setHands('free');
      p.slideTo(S.x, S.z, 1.1); p.lift = seatTop - p.pos.y;
      rod.mesh.visible = line.mesh.visible = float.visible = creel.visible = true; fish.visible = false;
      // 镜头：在他右后方高一点，越过肩看溪心
      k.nav.setPose({ pos: S.clone().add(V(2.5, 1.35, -0.9)), look: V(S.x - 0.7, waterY + 0.45, S.z + 2.7), fov: 46, yaw: 14, up: 8, down: 8 }, 1.6);
      set({ title: '钓鱼', hint: '在石上坐稳，把竿伸到溪心' });
    },
    exit() {
      const av = k.player.av;
      av.reach('L', null); av.reach('R', null); av.lookAt(null); av.setSeat?.(null);
      rod.mesh.visible = line.mesh.visible = float.visible = fish.visible = creel.visible = false;
      k.events.loop?.('line', 0);
      if (phase !== 'off') record();
      phase = 'off';
    },
    update(dt) {
      t += dt; flush();
      if (phase === 'sit' && t > 1.4) { ready(); sched(); }
      if (phase === 'charge') {
        // 蓄劲：越按越满，满了就停在满处（手会抖：在满处晃）
        power = Math.min(1, power + dt / 1.15);
        put({ meter: { v: power, lo: ZONE[0], hi: ZONE[1], label: '劲' }, hold: { id: 'cast', label: '抛', v: power } });
      }
      if (phase === 'wait') tickWait(dt);
      if (phase === 'fight') tickFight(dt);
    },
    input: { tap: () => { if (phase === 'wait') strike(); return true; } },
    cmd(c, arg) {
      if (c === 'cast') {
        if (phase === 'ready' && arg === 'down') { phase = 'charge'; power = 0; }
        else if (phase === 'charge' && arg === 'up') cast();
        else if (phase === 'wait' && arg === 'down') strike();
      } else if (c === 'lift') { if (phase === 'fight') hold = arg === 'down'; }
      else if (c === 'recast') { snag = false; ready('再抛一回'); sched(); }
      else if (c === 'creel' && phase === 'up') keep(true);
      else if (c === 'free' && phase === 'up') keep(false);
      else if (c === 'done') { if (phase === 'fight') { phase = 'ready'; } k.exitAct(); }
    },
  };

  function cast() {
    phase = 'cast'; castT = 0;
    // 落点：竿梢正下方再往前 0.3…2.7 米；溪心最深
    const reach = 0.3 + 2.4 * power;
    rodPose(0); landAt.set(tip.x, waterY, tip.z).addScaledVector(F, reach - 1.1);
    const d = waterDepth(landAt.x, landAt.z);
    snag = d < 0.03 && landAt.z > S.z + 2.5;
    shallow = d < 0.25;
    sfx(k, 'cast', { vel: 0.35 + 0.3 * power });
    put({ meter: undefined, hold: undefined, hint: '' }, true);
  }
  function tickWait(dt: number) {
    // 浮子在水上轻轻地漂、点
    drift = Math.min(0.9, drift + dt * 0.035);
    if (biteT < 0) {
      biteIn -= dt;
      if (biteIn <= 0) {
        if (nibbles > 0) { nibbles--; dip = 1; biteIn = 1.2 + Math.random() * 2.2; sfx(k, 'drip', { vel: 0.25, x: floatP.x, z: floatP.z }); k.land.ripple(floatP.x, floatP.z, 0.35); }
        else { biteT = 0; kind = pickKind(); const K = KINDS[kind]; size = Math.round(lerp(K.lo, K.hi, Math.pow(Math.random(), 1.6))); sfx(k, 'plop', { vel: 0.35, x: floatP.x, z: floatP.z }); k.land.ripple(floatP.x, floatP.z, 0.7); put({ meter: { v: 1, lo: 0.55, hi: 1, label: '沉' } }, true); }
      }
    } else {
      // 咬钩：浮子一沉，留给你提竿的工夫不到一秒
      biteT += dt;
      put({ meter: { v: clamp(1 - biteT / 0.85), lo: 0.55, hi: 1, label: '沉' } });
      if (biteT > 0.85) {
        biteT = -1; sched(1.2);
        set({ title: '钓鱼', hint: '浮子浮上来了——饵被偷吃了', choices: [{ id: 'recast', label: '换饵再抛' }, { id: 'done', label: '收竿' }] });
        phase = 'ready';
        state.hold = undefined;
      }
    }
  }
  function strike() {
    liftV += 6;
    sfx(k, 'strike', { vel: 0.55, x: floatP.x, z: floatP.z });
    if (biteT >= 0 && biteT < 0.85) {
      // 中了
      phase = 'fight'; biteT = -1; tension = 0.5; fishD = 1; stamina = 1; run = 0; runT = 0.8; highT = 0; lowT = 0; hold = false;
      fishP.copy(floatP).setY(waterY - 0.25);
      k.buzz([12, 30, 12]);
      set({ title: '钓鱼', hint: '上钩了！按住提竿，松手放一放', meter: { v: tension, lo: 0.36, hi: 0.76, label: '劲' }, hold: { id: 'lift', label: '提' }, keys: [{ key: '空格', label: '按住提竿' }], progress: 0, choices: [{ id: 'done', label: '收竿' }] });
    } else {
      // 提早了
      sched(1.6);
      put({ hint: '提早了，鱼吓跑了。再等等' }, true);
    }
  }
  function tickFight(dt: number) {
    const K = KINDS[kind], pull = K.pull * (0.6 + size / 12);
    // 鱼一阵一阵地挣：猛冲一下，再歇一歇
    runT -= dt;
    if (runT <= 0) { run = Math.random() < 0.55 * stamina + 0.1 ? 0.6 + Math.random() * 0.6 : 0; runT = run ? 0.5 + Math.random() * 0.9 : 0.6 + Math.random() * 1.2; if (run) { sfx(k, 'fishSplash', { vel: 0.3 + 0.3 * run, x: fishP.x, z: fishP.z }); k.land.ripple(fishP.x, fishP.z, 0.5); } }
    // 劲：提着就往上走；鱼冲的时候猛涨；松手就落
    const want = (hold ? 0.62 + 0.25 * run * pull : 0.16 + 0.42 * run * pull) * (0.6 + 0.4 * stamina);
    tension += (want - tension) * Math.min(1, dt * (hold ? 3.2 : 4));
    tension = clamp(tension + (Math.random() - 0.5) * 0.02);
    const inBand = tension >= 0.36 && tension <= 0.76;
    if (hold && inBand) { fishD = Math.max(0, fishD - dt * (0.13 / pull) * (1.2 - run)); stamina = Math.max(0, stamina - dt * 0.09); }
    else if (!hold) fishD = Math.min(1, fishD + dt * 0.05 * run * pull);
    highT = tension > 0.9 ? highT + dt : Math.max(0, highT - dt * 2);
    lowT = tension < 0.14 ? lowT + dt : Math.max(0, lowT - dt);
    k.events.loop?.('line', clamp((tension - 0.3) * 1.4));
    put({ meter: { v: tension, lo: 0.36, hi: 0.76, label: '劲' }, hold: { id: 'lift', label: '提', v: 1 - fishD }, progress: 1 - fishD, hint: tension > 0.82 ? '丝绷得太紧了，放一放！' : tension < 0.2 ? '太松了，鱼要脱钩' : run ? '鱼在挣' : '好，慢慢往岸边带' });
    if (highT > 0.45) lose('啪的一声，丝断了。鱼带着钩跑了');
    else if (lowT > 1.6) lose('丝一松，鱼脱钩跑了');
    else if (fishD <= 0) landed();
  }
  function lose(why: string) {
    k.events.loop?.('line', 0);
    phase = 'ready'; sched(1.3);
    set({ title: '钓鱼', hint: why, choices: [{ id: 'recast', label: '再抛一回' }, { id: 'done', label: '收竿' }] });
    k.log({ kind: 'play', text: `垂钓，${why.includes('断') ? '断了丝' : '跑了一尾'}` });
  }
  function landed() {
    k.events.loop?.('line', 0);
    phase = 'up'; t = 0;
    const K = KINDS[kind];
    // 鱼的颜色、大小
    const c = fish.geometry.attributes.color as THREE.BufferAttribute, p = fish.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < c.count; i++) { const y = p.getY(i) / 0.052, kk = y > 0.1 ? 0.6 : y > -0.15 ? 0.8 : 0.96; c.setXYZ(i, kk * K.tint[0], kk * K.tint[1], kk * K.tint[2]); }
    c.needsUpdate = true;
    fish.scale.setScalar((size * 0.0312 * 1.25) / 0.2);
    fish.visible = true;
    sfx(k, 'fishSplash', { vel: 0.6, x: fishP.x, z: fishP.z }); k.land.ripple(fishP.x, fishP.z, 1);
    set({ title: '钓鱼', text: `上来一尾${K.name}，${cnNum(size)}寸来长。`, choices: [{ id: 'creel', label: '收进鱼篓' }, { id: 'free', label: '放回溪里' }], done: true });
  }
  function keep(yes: boolean) {
    const K = KINDS[kind];
    const r = playGet<{ n?: number; got?: number; freed?: number; best?: number; kinds?: Record<string, number> }>(k, 'fish', {});
    const kinds = { ...(r.kinds ?? {}) }; kinds[K.name] = (kinds[K.name] ?? 0) + 1;
    playSet(k, 'fish', { ...r, got: (r.got ?? 0) + (yes ? 1 : 0), freed: (r.freed ?? 0) + (yes ? 0 : 1), best: Math.max(r.best ?? 0, size), kinds });
    caught++;
    if (yes) { k.bag.add('fish', 1); sfx(k, 'flop', { vel: 0.4 }); k.log({ kind: 'play', text: `垂钓，得${K.name}一尾（${cnNum(size)}寸）` }); }
    else { sfx(k, 'plop', { vel: 0.5, x: fishP.x, z: fishP.z }); k.land.ripple(S.x + F.x * 1.3, S.z + 1.3, 0.8); k.log({ kind: 'play', text: `垂钓，钓上一尾${K.name}，又放回溪里` }); }
    fish.visible = false;
    ready(yes ? '鱼在篓里扑腾了两下' : '鱼尾一摆，游回水里去了');
    sched();
  }
  function record() {
    const r = playGet<{ n?: number }>(k, 'fish', {});
    playSet(k, 'fish', { ...playGet(k, 'fish', {}), n: (r.n ?? 0) + 1 });
  }

  /** 竿此刻的样子：粗头在右手，往前上斜伸出去；lift 是提起来多少，bend 是梢头被丝拽弯多少 */
  function rodPose(lf: number) {
    butt.copy(S).addScaledVector(Rt, 0.2).addScaledVector(F, 0.2); butt.y = seatTop + 0.3;
    const pitch = 0.42 + 0.5 * lf;
    rdir.copy(F).multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch)).addScaledVector(Rt, -0.06).normalize();
    tip.copy(butt).addScaledVector(rdir, 3.5);
  }

  // —— 每帧：竿、丝、浮子、鱼 ——
  onFrame(k, 'fishing', (dt) => {
    const on = act === k.act;
    if (!on || phase === 'off') return;
    const av = k.player.av, cam = k.world.camera.position;
    // 提竿：一下子提起来再慢慢落
    liftV += (-(lift - (phase === 'fight' ? (hold ? 0.55 : 0.25) : phase === 'up' ? 0.9 : phase === 'charge' ? -0.25 * power : 0)) * 30 - liftV * 9) * dt;
    lift += liftV * dt;
    if (phase === 'cast') castT += dt;
    // 抛：竿往后一扬再往前送
    const swing = phase === 'cast' ? Math.sin(Math.PI * Math.min(1, castT / 0.4)) * 0.6 : 0;
    rodPose(lift + swing);
    // 弯：遛鱼时梢头朝鱼拽下去
    const wantBend = phase === 'fight' ? tension * 0.9 : phase === 'up' ? 0.35 : 0.05;
    bend += (wantBend - bend) * Math.min(1, dt * 6);
    // 浮子 / 鱼此刻在哪
    if (phase === 'cast') {
      const u = Math.min(1, castT / 0.75), from = tmp.copy(tip).add(V(0, -1.2, 0));
      floatP.lerpVectors(from, landAt, u); floatP.y += Math.sin(Math.PI * u) * 0.9;
      if (u >= 1) {
        drift = 0;
        if (snag) { phase = 'ready'; set({ title: '钓鱼', hint: '甩过头了，挂在对岸的草里', choices: [{ id: 'recast', label: '扯回来再抛' }, { id: 'done', label: '收竿' }] }); }
        else { phase = 'wait'; sfx(k, 'plop', { vel: 0.3, x: landAt.x, z: landAt.z }); k.land.ripple(landAt.x, landAt.z, 0.6); set({ title: '钓鱼', hint: shallow ? '落得近了，这里水浅' : '浮子立住了。轻点是试饵，猛一沉才提', keys: [{ key: '空格', label: '提竿' }], hold: { id: 'cast', label: '提' }, choices: [{ id: 'done', label: '收竿' }] }); }
      }
    } else if (phase === 'wait' || phase === 'ready' || phase === 'charge') {
      if (phase === 'wait') {
        dip = Math.max(0, dip - dt * 3.5);
        const sink = biteT >= 0 ? 0.06 + 0.02 * Math.sin(biteT * 30) : 0;
        floatP.copy(landAt).addScaledVector(flow, drift);
        floatP.y = waterY - 0.005 + 0.004 * Math.sin(t * 2.1) - dip * 0.018 * Math.max(0, Math.sin(dip * 9)) - sink;
        if (biteT >= 0) floatP.addScaledVector(Rt, 0.05 * biteT);
      } else if (!snag) {
        // 没抛出去：浮子挂在竿梢底下
        floatP.copy(tip).add(V(0, -1.35 + 0.04 * Math.sin(t * 1.3), 0));
      } else floatP.copy(landAt).setY(groundAt(landAt.x, landAt.z) ?? waterY);
    } else if (phase === 'fight') {
      // 鱼在水下：远近随 fishD，左右乱窜
      const out = 0.6 + 2.1 * fishD;
      tmp.copy(S).addScaledVector(F, out + 1.1).addScaledVector(Rt, Math.sin(t * 1.3) * 0.6 * (0.4 + run) + Math.sin(t * 3.1) * 0.12);
      fishP.lerp(tmp.setY(waterY - 0.15 - 0.1 * fishD), Math.min(1, dt * 3));
      floatP.copy(fishP).setY(waterY - 0.01);
      if (Math.random() < dt * (0.8 + 3 * run)) k.land.ripple(fishP.x, fishP.z, 0.35 + 0.3 * run);
    } else if (phase === 'up') {
      // 鱼出了水，挂在丝头上扑腾，慢慢甩到岸边
      const u = Math.min(1, t / 1.2);
      tmp.copy(S).addScaledVector(F, lerp(1.6, 0.55, u)).addScaledVector(Rt, -0.3 * u);
      tmp.y = lerp(waterY + 0.25, seatTop + 0.55, smooth(0, 1, u));
      fishP.copy(tmp);
      floatP.copy(fishP).add(V(0, 0.14, 0));
      fish.position.copy(fishP);
      fish.rotation.set(-Math.PI / 2 + 0.3 * Math.sin(t * 11), t * 0.7, 0.4 * Math.sin(t * 13));
    }
    // 竿：从粗头到梢，梢头往丝的方向弯
    const toLine = tmp2.subVectors(floatP, tip).normalize();
    for (let i = 0; i < 10; i++) {
      const s = i / 9;
      pts[i].copy(butt).addScaledVector(rdir, 3.5 * s).addScaledVector(toLine, bend * 0.9 * s * s);
    }
    rod.set(pts);
    // 丝：从梢头垂到浮子（或鱼），中间略垂
    const tipP = pts[9], sag = phase === 'fight' ? 0.05 * (1 - tension) : phase === 'cast' ? 0.25 : 0.12;
    for (let i = 0; i < 18; i++) {
      const s = i / 17;
      lpts[i].lerpVectors(tipP, floatP, s); lpts[i].y -= Math.sin(Math.PI * s) * sag * tipP.distanceTo(floatP) * 0.25;
    }
    line.set(lpts, cam);
    float.position.copy(floatP);
    float.visible = phase !== 'up' && phase !== 'fight';
    // 手：右手握着粗头，左手在前面托着竿
    av.reach('R', tmp.copy(butt).addScaledVector(rdir, 0.12), { dir: rdir, rate: 25 });
    av.reach('L', tmp2.copy(butt).addScaledVector(rdir, 0.55), { dir: rdir, palm: V(0, 1, 0), rate: 25 });
    av.lookAt(phase === 'up' ? fishP : floatP);
    av.bow = phase === 'fight' ? 0.12 + 0.1 * tension : 0.06;
  });
  return act;
}

