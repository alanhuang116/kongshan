/**
 * 摇橹（渡口，栈桥西边泊着的一叶小划子）：从栈桥上跨进船尾，解缆，沿着北岸摇出去，绕过插在水里的那根竹篙，再摇回来泊好。
 *   摇：按住「摇」（空格）是推橹、松开是拉回——橹柄推到头、拉到头的那一刻换手最得劲；推着不放、拉着不放，橹不动，船就慢慢停了。
 *   转向：左右拖动画面（键盘 ← →），像压着橹往一边带。
 *   橹是绕着橹桩左右摆的，橹叶在水里一来一回，同时顺着橹身转过一个角——橹叶走的是一个「8」字，船就往前走。
 * 到了竹篙那里停一停，南望伊阙；回到栈桥边，船自己靠上去。
 * 器物在 play/boat.ts；水纹在 play/ripples.ts。记（mem 'play' 的 boat）：摇过几趟、最快一趟几秒。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { RIVER_Y, SITE, ground } from '../site';
import { waterDepth } from '../walk';
import type { Act } from './types';
import type { Pose } from '../nav';
import { Carrier } from '../play/carry';
import { BOAT, makeBoat } from '../play/boat';
import { Rings } from '../play/ripples';
import { PAIRS } from './lib';
import { V, camFar, clamp, cnNum, mats, onFrame, playGet, playSet, sfx, stateOf, wrap } from '../play/kit';
import { pole, v3 } from '../build/kit';

const THMAX = 0.36;
export function create(k: Anlewo): Act | null {
  const fa = k.build?.anchors.ferry;
  if (!fa) return null;
  const { state, set, put, flush } = stateOf(k);
  // 栈桥：自岸边朝水里伸出去（与屋舍那边同一算法）
  const F = SITE.ferry, jy = fa.rotation.y - Math.PI;
  const W = (lx: number, lz: number) => V(F.x + lx * Math.cos(jy) + lz * Math.sin(jy), 0, F.z - lx * Math.sin(jy) + lz * Math.cos(jy));
  let L = 4;
  while (L < 11 && ground(W(0, L).x, W(0, L).z) > RIVER_Y - 0.3) L += 0.25;
  const JETTY_Y = RIVER_Y + 0.4, BOAT_Y = RIVER_Y - BOAT.draft, DECK_Y = BOAT_Y + BOAT.floor;
  // 船泊在栈桥西边，船头朝外
  const moor = W(-1.55, L - 1.7), moorYaw = jy;
  const { group: boat, yuloh } = makeBoat();
  boat.position.set(moor.x, BOAT_Y, moor.z); boat.rotation.y = moorYaw;
  k.world.scene.add(boat);
  boat.updateMatrixWorld(true);
  const rest = new THREE.Matrix4().compose(boat.position.clone(), boat.quaternion.clone(), V(1, 1, 1)), restInv = rest.clone().invert();
  const carry = new Carrier(k, 'boat');
  const rings = new Rings(20);
  k.world.scene.add(rings.mesh);
  /** 船上一点（船自己的坐标）此刻在世界的哪里 */
  const onBoat = (p: THREE.Vector3, out = V()) => out.copy(p).applyMatrix4(boat.matrixWorld);

  // —— 竹篙（回头处）：沿北岸往西南七十来米、离岸十来米的深水里 ——
  const bankDir = V(-Math.cos(jy), 0, Math.sin(jy)), outDir = V(Math.sin(jy), 0, Math.cos(jy));
  const mark = (() => {
    const e = W(0, L).addScaledVector(bankDir, 70);
    let m = 0; while (m < 40 && waterDepth(e.x + outDir.x * m, e.z + outDir.z * m) < 0.9) m += 1;
    return e.addScaledVector(outDir, m + 5).setY(RIVER_Y);
  })();
  const stake = new THREE.Mesh(pole(v3(0, -1.2, 0), v3(0.18, 2.6, 0.08), 0.03, 0.022, 6, 3), mats().bamboo);
  stake.position.copy(mark);
  k.world.scene.add(stake);

  // —— 船的动静 ——
  const S = { x: moor.x, z: moor.z, psi: moorYaw, u: 0, r: 0 };
  let th = 0, thV = 0, tw = 0, push = false, steer = 0, keySteer = 0, strokeDir = 0, bob = 0;
  type Phase = 'board' | 'row' | 'view' | 'dock' | 'off';
  let phase: Phase = 'off', t = 0, leg: 'out' | 'back' = 'out', trip = 0, wakeT = 0, docked = 0, grounded = 0;
  const dockFrom = { x: 0, z: 0, psi: 0 };
  const m4 = new THREE.Matrix4(), cam: Pose = { pos: V(), look: V(), fov: 50, yaw: 14, up: 8, down: 8 };
  const tmp = V(), tmp2 = V(), hand = V(), fwd = V(), side = V();
  const spot = (() => { const s = W(-0.42, L - 1.7 - 1.45); return { x: s.x, z: s.z, yaw: jy - Math.PI / 2 }; })();
  const standW = () => onBoat(BOAT.stand, tmp2);
  const target = () => (leg === 'out' ? mark : V(moor.x, RIVER_Y, moor.z));
  const tag = () => (leg === 'out' ? { id: 'mark', text: '竹篙', sub: '绕过它回头', x: mark.x, y: RIVER_Y + 2.7, z: mark.z, kind: 'hot' } : { id: 'home', text: '栈桥', sub: '摇回去泊好', x: moor.x, y: JETTY_Y + 1.2, z: moor.z, kind: 'hot' });
  const zone = () => (thV >= 0 ? { lo: 0.86, hi: 1 } : { lo: 0, hi: 0.14 });
  const meter = () => ({ v: (th / THMAX + 1) / 2, ...zone(), label: '橹' });
  const keys = [{ key: '空格', label: '按住推、松开拉' }, { key: '左右键', label: '转向' }];
  const show = (hint: string) => set({ title: '摇橹', hint, meter: meter(), hold: { id: 'row', label: '摇' }, keys, tags: [tag()], progress: 0, choices: [{ id: 'done', label: '靠岸' }] });

  const act: Act = {
    id: 'boat', name: '摇橹', anchor: moor.clone().setY(JETTY_Y + 1.0), spot, radius: 2.6, state, noZoom: true,
    enter() {
      const p = k.player, av = p.av;
      phase = 'board'; t = 0; leg = 'out'; trip = 0; th = 0; thV = 0; tw = 0; push = false; steer = 0; keySteer = 0; grounded = 0;
      Object.assign(S, { x: moor.x, z: moor.z, psi: moorYaw, u: 0, r: 0 });
      // 船的世界矩阵先摆准（刚开场就来做时，画面还没画过一帧）
      placeBoat();
      av.setHands('free');
      // 一步跨下船尾：脚落在船板上（比栈桥低）
      const s = standW();
      p.slideTo(s.x, s.z, 0.9); p.lift = DECK_Y - p.pos.y;
      p.faceTo = moorYaw - Math.PI / 2 + 0.55;
      k.nav.setPose({ pos: V(moor.x, JETTY_Y + 2.2, moor.z).addScaledVector(bankDir, -3.5).addScaledVector(outDir, -4.5), look: V(moor.x, DECK_Y + 0.6, moor.z), fov: 46, yaw: 14, up: 8, down: 8 }, 1.4);
      set({ title: '摇橹', hint: '跨进船尾，解开缆' });
      sfx(k, 'boatBump', { vel: 0.35 });
      window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey);
    },
    exit() {
      window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey);
      const p = k.player, av = p.av;
      carry.detach();
      av.reach('L', null); av.reach('R', null); av.lookAt(null);
      k.events.loop?.('boatWater', 0);
      // 没摇回来就作罢的：船漂回栈桥边，人回到栈桥上
      Object.assign(S, { x: moor.x, z: moor.z, psi: moorYaw, u: 0, r: 0 });
      th = 0; tw = 0; placeBoat();
      if (phase !== 'off' && phase !== 'board') p.teleport(spot.x, spot.z, spot.yaw);
      phase = 'off';
    },
    update(dt) {
      t += dt; flush();
      if (phase === 'board' && t > 1.1) {
        carry.attach(); phase = 'row'; t = 0; trip = 0;
        cam.pos.copy(camPos()); cam.look.copy(camLook()); k.nav.setPose(cam, 1.8);
        show('按住「摇」推橹，松开拉回');
      }
      if (phase === 'row') {
        trip += dt;
        const tg = target(), d = Math.hypot(S.x - tg.x, S.z - tg.z);
        put({ meter: meter(), hold: { id: 'row', label: '摇', v: clamp(S.u / 1.6) }, progress: leg === 'out' ? clamp(1 - d / 75) : clamp(1 - d / 75) });
        if (leg === 'out' && d < 7) { phase = 'view'; t = 0; viewPair(); }
        else if (leg === 'back' && d < 5.5) { phase = 'dock'; t = 0; Object.assign(dockFrom, { x: S.x, z: S.z, psi: S.psi }); set({ title: '摇橹', hint: '靠上栈桥' }); }
      } else if (phase === 'view') {
        // 停一停：南望伊阙
        S.u *= Math.exp(-dt * 0.8);
        if (t > 7) { leg = 'back'; phase = 'row'; cam.fov = 50; show('掉头，往栈桥摇'); }
      } else if (phase === 'dock') {
        // 船自己慢慢靠上去，人跨回栈桥
        const u = Math.min(1, t / 2.6), e = u * u * (3 - 2 * u);
        S.x = dockFrom.x + (moor.x - dockFrom.x) * e; S.z = dockFrom.z + (moor.z - dockFrom.z) * e; S.psi = dockFrom.psi + wrap(moorYaw - dockFrom.psi) * e; S.u = 0;
        if (u >= 1 && docked === 0) { docked = 1; sfx(k, 'boatBump', { vel: 0.4 }); finish(); }
      }
    },
    input: {
      move(p) { if (phase !== 'row') return false; steer = clamp(steer - p.dx * 0.004, -1, 1); return true; },
      tap: () => true,
    },
    cmd(c, arg) {
      if (c === 'row') push = arg === 'down';
      else if (c === 'done') k.exitAct();
    },
  };

  function onKey(e: KeyboardEvent) {
    const d = e.type === 'keydown';
    if (e.key === 'ArrowLeft') { keySteer = d ? 1 : keySteer === 1 ? 0 : keySteer; e.preventDefault(); }
    else if (e.key === 'ArrowRight') { keySteer = d ? -1 : keySteer === -1 ? 0 : keySteer; e.preventDefault(); }
  }
  function viewPair() {
    const want = k.atmos.night > 0.5 ? 'c01' : k.atmos.w.rain > 0.4 ? 'c59' : k.season === 'autumn' ? 'c27' : 'c66';
    const p = PAIRS.find((x) => x.id === want) ?? PAIRS.find((x) => x.id === 'c66');
    sfx(k, 'swish', { vel: 0.15 });
    set({ title: '摇橹', hint: '南望伊阙', lines: p ? [p.a, p.b] : undefined, source: p ? `邵雍《${p.from}》` : undefined, tags: [], quiet: true });
  }
  function finish() {
    const secs = Math.round(trip);
    const r = playGet<{ n?: number; best?: number }>(k, 'boat', {});
    const better = r.best == null || secs < r.best;
    playSet(k, 'boat', { ...r, n: (r.n ?? 0) + 1, best: better ? secs : r.best });
    k.log({ kind: 'play', text: `摇橹出去绕过竹篙，一个来回${minSec(secs)}` });
    if (better && r.best != null) k.note('这一趟比以往都快');
    // 人跨回栈桥
    const p = k.player;
    carry.detach();
    p.av.reach('L', null); p.av.reach('R', null);
    p.slideTo(spot.x, spot.z, 0.8); p.lift = 0; p.faceTo = spot.yaw;
    phase = 'off';
    set({ title: '摇橹', text: `沿北岸摇出去，绕过竹篙回来，一个来回${minSec(secs)}。缆系回桩上了。`, choices: [{ id: 'done', label: '上岸' }], done: true });
  }
  const minSec = (s: number) => (s >= 60 ? `${cnNum(Math.floor(s / 60))}分${s % 60 ? cnNum(s % 60) + '秒' : ''}` : `${cnNum(s)}秒`);

  /** 船摆到 S 那里（加一点随波的起伏） */
  function placeBoat() {
    boat.position.set(S.x, BOAT_Y + 0.012 * Math.sin(bob * 1.3), S.z);
    boat.rotation.set(0.012 * Math.sin(bob * 0.9), S.psi, 0.018 * Math.sin(bob * 1.1 + 0.6) + 0.04 * tw * 0.3, 'YXZ');
    boat.updateMatrixWorld(true);
  }
  function camPos() { fwd.set(Math.sin(S.psi), 0, Math.cos(S.psi)); side.set(Math.cos(S.psi), 0, -Math.sin(S.psi)); return tmp.set(S.x, DECK_Y + 2.9, S.z).addScaledVector(fwd, -7.2).addScaledVector(side, 1.6); }
  function camLook() { fwd.set(Math.sin(S.psi), 0, Math.cos(S.psi)); return tmp2.set(S.x, DECK_Y + 0.9, S.z).addScaledVector(fwd, 9); }

  // —— 每帧（排在总装之前）：橹、船、人、镜头 ——
  onFrame(k, 'boat', (dt) => {
    const on = act === k.act;
    boat.visible = stake.visible = on || camFar(k, moor.x, moor.z) < 160;
    rings.update();
    bob += dt;
    if (!on || phase === 'off') { if (boat.visible) placeBoat(); return; }
    // 橹：推着走向一头，拉着走回另一头；到了头就停（不换手橹就不动）
    if (phase === 'row') {
      const goal = push ? THMAX : -THMAX, sp = 0.85;
      const want = clamp((goal - th) * 6, -sp, sp);
      thV += (want - thV) * Math.min(1, dt * 10);
      th = clamp(th + thV * dt, -THMAX, THMAX);
      if ((th >= THMAX && thV > 0) || (th <= -THMAX && thV < 0)) thV = 0;
    } else { thV *= Math.exp(-dt * 6); th += thV * dt; th *= Math.exp(-dt * 1.5); }
    // 橹叶的角：顺着摆的方向翻过去（换向时有一下翻不过来，那一下不得劲）
    const dirNow = Math.abs(thV) > 0.05 ? Math.sign(thV) : 0;
    tw += (0.5 * dirNow - tw) * Math.min(1, dt * 7);
    if (dirNow && dirNow !== strokeDir) {
      strokeDir = dirNow;
      if (dirNow > 0) { sfx(k, 'oar', { vel: 0.35 + 0.3 * Math.min(1, Math.abs(thV) / 0.85) }); }
      // 橹叶换向处，水上起一圈
      onBoat(tmp.set(-Math.sin(th) * BOAT.outboard * 0.9 + BOAT.pin.x, 0, BOAT.pin.z - BOAT.outboard * 0.85), tmp);
      rings.add(tmp.x, RIVER_Y, tmp.z, 0.8, 0.5);
    }
    // 船：橹叶扫得快、角翻得正就往前推；水的阻力随速度加大
    const thrust = phase === 'row' ? 1.25 * Math.abs(thV) * Math.min(1, Math.abs(tw) / 0.42) : 0;
    S.u += (thrust - 0.32 * S.u - 0.22 * S.u * Math.abs(S.u)) * dt;
    const st = clamp(keySteer || steer, -1, 1);
    if (!keySteer) steer *= Math.exp(-dt * 0.8);
    S.r += (st * 0.38 * (0.25 + Math.abs(S.u)) + 0.05 * Math.sign(thV) * Math.abs(thV) - S.r * 1.6) * dt;
    if (phase === 'row' || phase === 'view') {
      S.psi = wrap(S.psi + S.r * dt);
      const nx = S.x + Math.sin(S.psi) * S.u * dt, nz = S.z + Math.cos(S.psi) * S.u * dt;
      // 船头、船尾的水够不够深：浅了搁住，往回退一点
      const bx = nx + Math.sin(S.psi) * BOAT.len * 0.45, bz = nz + Math.cos(S.psi) * BOAT.len * 0.45, sx = nx - Math.sin(S.psi) * BOAT.len * 0.45, sz = nz - Math.cos(S.psi) * BOAT.len * 0.45;
      const okBow = waterDepth(bx, bz) > 0.32 || Math.hypot(bx - moor.x, bz - moor.z) < 4, okStern = waterDepth(sx, sz) > 0.3 || Math.hypot(sx - moor.x, sz - moor.z) < 4;
      const far = Math.hypot(nx - F.x, nz - F.z) > 170;
      if ((S.u > 0 && !okBow) || (S.u < 0 && !okStern) || far) {
        if (grounded <= 0) { sfx(k, 'boatBump', { vel: 0.5 }); put({ hint: far ? '再远就出了这一带水面，掉头吧' : '船头搁在浅处了，往深水里带' }, true); grounded = 1.2; }
        S.u = -S.u * 0.25;
        // 船头自己往深水那边偏开一点（浅处在岸那边）
        const away = far ? Math.atan2(F.x - S.x, F.z - S.z) : Math.atan2(outDir.x, outDir.z);
        S.r += clamp(wrap(away - S.psi), -1, 1) * 0.5;
      } else { S.x = nx; S.z = nz; }
      grounded -= dt;
      // 船尾拖出的水纹
      wakeT += dt * Math.abs(S.u);
      if (wakeT > 1.4) { wakeT = 0; rings.add(sx, RIVER_Y, sz, 0.6 + 0.3 * Math.abs(S.u), 0.35); }
    }
    k.events.loop?.('boatWater', clamp(Math.abs(S.u) / 1.6) * 0.9);
    placeBoat();
    // 橹：绕橹桩摆（th）、顺着橹身转（tw）
    yuloh.rotation.set(0, -th, tw, 'YXZ');
    yuloh.updateMatrixWorld(true);
    // 人：挂在船上一起走；两手握着橹柄（右手在柄头，左手在后一点），身子随着推拉前后送
    if (carry.on) { m4.multiplyMatrices(boat.matrixWorld, restInv); carry.set(m4); }
    const av = k.player.av;
    if (phase === 'row' || phase === 'view' || phase === 'dock') {
      const grip = tmp.set(0, 0.42, BOAT.inboard - 0.04).applyMatrix4(yuloh.matrixWorld);
      av.reach('R', grip, { rate: 40 });
      av.reach('L', hand.set(0, 0.36, BOAT.inboard - 0.3).applyMatrix4(yuloh.matrixWorld), { rate: 40 });
      av.bow = 0.12 + 0.12 * ((th / THMAX + 1) / 2);
      av.lookAt(phase === 'view' ? tmp2.set(S.x - 30, DECK_Y + 6, S.z + 200) : onBoat(tmp2.set(0, 1.2, 8)));
    }
    // 镜头：跟在船后头；停下望伊阙时转向南边
    if (phase === 'row' || phase === 'dock') { cam.pos.copy(camPos()); cam.look.copy(camLook()); }
    else if (phase === 'view') {
      const u = Math.min(1, t / 2.5), e = u * u * (3 - 2 * u);
      const p0 = camPos().clone(), l0 = camLook().clone();
      const p1 = V(S.x, DECK_Y + 2.4, S.z).addScaledVector(outDir, -5).addScaledVector(bankDir, 2), l1 = V(S.x - 40, DECK_Y + 22, S.z + 300);
      cam.pos.lerpVectors(p0, p1, e); cam.look.lerpVectors(l0, l1, e); cam.fov = 50 - 6 * e;
    }
  });
  return act;
}
