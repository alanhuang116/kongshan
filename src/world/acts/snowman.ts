/**
 * 堆雪人（冬天，下过雪、地上积着雪的时候，院里）：
 *   先滚一个大雪球当底座——人推着它走，越滚越大，够大了「立住」；再滚一个小些的，推到底座跟前「叠上去」；
 *   捏个头，插两根树枝当手，点两点炭当眼，戴一顶小斗笠。人一直可以走动（推着雪球走）。
 *   堆好了就留在院里（存在 mem 里），天晴了、过了几天慢慢化掉，化完了才没有。
 * 雪人的样子在这里（几只雪球一张实例化的网、树枝斗笠炭眼一张网）。
 * 记（mem 'play' 的 snowman）：堆过几个；此刻院里那一个的位置、大小、哪一天堆的、化到几成。
 */
import * as THREE from 'three';
import type { Anlewo } from '../Anlewo';
import { lathe, merge } from '../core/geo';
import { INK, dye, pole, v3 } from '../build/kit';
import { SITE } from '../site';
import { groundAt } from '../walk';
import type { Act } from './types';
import { V, clamp, inkGeo, mats, onFrame, playGet, playSet, sfx, stateOf } from '../play/kit';

interface Man { day: number; x: number; z: number; r: [number, number, number]; twigs: boolean; hat: boolean; eyes: boolean; melt: number; yaw: number }

export function create(k: Anlewo): Act | null {
  const { state, set, put, flush } = stateOf(k);
  // —— 模型 ——
  const ballGeo = (() => {
    const g = inkGeo(new THREE.IcosahedronGeometry(1, 2));
    // 雪球不是正圆：揉得有点扁、有点不匀
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.05 * Math.sin(x * 5.1 + z * 3.7) + 0.035 * Math.sin(y * 7.3 + x * 2.1); p.setXYZ(i, x * n, y * n * 0.93, z * n); }
    g.computeVertexNormals();
    return g;
  })();
  const balls = new THREE.InstancedMesh(ballGeo, mats().snow, 4);
  balls.name = 'play:snowballs'; balls.frustumCulled = false; balls.count = 0;
  /** 树枝两根、炭眼两点、小斗笠（原点在雪人脚下，各件按 r 摆好再并） */
  const decoGeo = (m: Man) => {
    const [r0, r1, r2] = m.r, y1 = r0 * 1.7 + r1 * 0.9, y2 = y1 + r1 * 0.85 + r2 * 0.9, gs: THREE.BufferGeometry[] = [];
    if (m.twigs) for (const s of [-1, 1]) {
      const a = v3(s * r1 * 0.75, y1 + r1 * 0.15, 0), b = v3(s * (r1 + 0.42), y1 + r1 * 0.55, 0.05), c2 = v3(s * (r1 + 0.32), y1 + r1 * 0.42, 0);
      gs.push(dye(pole(a, b, 0.012, 0.006, 4), INK.darkwood, 2.2), dye(pole(c2, c2.clone().add(v3(s * 0.08, 0.1, -0.03)), 0.006, 0.003, 3), INK.darkwood, 2.2));
    }
    if (m.eyes) for (const s of [-1, 1]) gs.push(dye(inkGeo(new THREE.SphereGeometry(0.018, 5, 4).translate(s * r2 * 0.36, y2 + r2 * 0.18, r2 * 0.9)), INK.ink, 2.6));
    if (m.hat) gs.push(dye(lathe([[0.001, 0.13], [0.04, 0.11], [r2 * 1.35, 0.02], [r2 * 1.4, 0.0], [r2 * 1.3, -0.005], [0.001, 0.04]], 12).translate(0, y2 + r2 * 0.72, 0), [0.88, 0.8, 0.6], 1.5));
    return gs.length ? merge(gs) : new THREE.BufferGeometry();
  };
  const deco = new THREE.Mesh(new THREE.BufferGeometry(), mats().obj);
  deco.name = 'play:snowdeco';
  k.world.scene.add(balls, deco);
  // 雪人挡路：挂进村人那一路「会动的圆」里（化了就把半径归零）
  const block = { x: 1e6, z: 1e6, r: 0 };
  const addBlock = () => { const b = k.life?.blockers; if (b && !b.includes(block)) b.push(block); };

  let man: Man | null = playGet<{ man?: Man | null }>(k, 'snowman', {}).man ?? null;
  const tm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(), pos = V();
  /** 院里那个雪人摆出来（化到几成就缩几成） */
  const showMan = () => {
    if (!man) { balls.count = 0; deco.visible = false; block.r = 0; return; }
    const m = man, k0 = 1 - 0.6 * m.melt, g0 = groundAt(m.x, m.z) ?? SITE.yard.z0;
    const [r0, r1, r2] = m.r.map((r) => r * k0) as [number, number, number];
    const ys = [r0 * 0.9, r0 * 1.7 + r1 * 0.9, r0 * 1.7 + r1 * 1.75 + r2 * 0.9];
    [r0, r1, r2].forEach((r, i) => { q.setFromAxisAngle(V(0, 1, 0), m.yaw + i); tm.compose(pos.set(m.x, g0 + ys[i] - 0.03 * m.melt * (i + 1), m.z), q, sc.set(r, r * (1 - 0.15 * m.melt), r)); balls.setMatrixAt(i, tm); });
    balls.count = 3; balls.instanceMatrix.needsUpdate = true;
    deco.geometry.dispose(); deco.geometry = decoGeo({ ...m, r: [r0, r1, r2] }); deco.position.set(m.x, g0, m.z); deco.rotation.y = m.yaw; deco.visible = true;
    deco.rotation.z = 0.12 * m.melt;
    block.x = m.x; block.z = m.z; block.r = r0 * 0.9; addBlock();
  };
  showMan();
  // 过一夜：不是冬天、或地上没雪了，化一截；化完了就没了
  k.onDay.push((day) => {
    if (!man) return;
    const cold = k.season === 'winter' && k.atmos.snowCover > 0.2;
    man.melt = clamp(man.melt + (cold ? 0.12 : 0.4));
    if (day - man.day > 6) man.melt = Math.max(man.melt, 0.8);
    if (man.melt >= 0.99) man = null;
    playSet(k, 'snowman', { ...playGet(k, 'snowman', {}), man });
    showMan();
  });

  // —— 堆的时候 ——
  type Phase = 'roll0' | 'roll1' | 'head' | 'trim' | 'done' | 'off';
  let phase: Phase = 'off', t = 0, r = 0, built: Man | null = null, moved = 0;
  const ballP = V();
  const prev = V(), fwd = V(), tmp = V(), axis = V();
  const rollQ = new THREE.Quaternion(), dq = new THREE.Quaternion();
  const steps = ['滚底座', '滚身子', '捏头', '收拾'];
  const MAX = [0.46, 0.33, 0.21];
  const hint = () => phase === 'roll0' ? (r < 0.3 ? '推着雪球走，越滚越大' : '够大了，可以立住了') : phase === 'roll1' ? (r < 0.2 ? '再滚一个小些的' : built && Math.hypot(ballP.x - built.x, ballP.z - built.z) > 1.4 ? '推到底座跟前去' : '可以叠上去了') : '';
  const choicesFor = () => {
    if (phase === 'roll0') return [{ id: 'stand', label: '立住', main: true, off: r < 0.3, sub: r < 0.3 ? '还小' : undefined }, { id: 'done', label: '罢' }];
    if (phase === 'roll1') { const near = !!built && Math.hypot(ballP.x - built.x, ballP.z - built.z) < 1.4; return [{ id: 'stack', label: '叠上去', main: true, off: r < 0.2 || !near }, { id: 'done', label: '罢' }]; }
    if (phase === 'trim' && built) return [
      { id: 'twigs', label: '插两根树枝', off: built.twigs }, { id: 'eyes', label: '点两点炭', off: built.eyes }, { id: 'hat', label: '戴斗笠', off: built.hat },
      { id: 'finish', label: '堆好了', main: true },
    ];
    return [{ id: 'done', label: '罢' }];
  };
  const show = () => set({ title: '堆雪人', hint: hint(), steps, step: phase === 'roll0' ? 0 : phase === 'roll1' ? 1 : phase === 'head' ? 2 : 3, choices: choicesFor() });

  const act: Act & { on(): boolean } = {
    id: 'snowman', name: '堆雪人', anchor: V(-1.6, (groundAt(-1.6, 12.6) ?? 8) + 1.0, 12.6), spot: { x: -1.6, z: 12.6, yaw: Math.PI }, radius: 3, state, free: true,
    on: () => k.season === 'winter' && k.atmos.snowCover > 0.25 && (!man || man.melt > 0.5),
    enter() {
      phase = 'roll0'; t = 0; r = 0.1; moved = 0; built = null;
      // 旧的那个（化了大半的）推倒重来
      man = null; showMan();
      prev.copy(k.player.pos);
      fwd.set(Math.sin(k.player.yaw), 0, Math.cos(k.player.yaw));
      ballP.copy(k.player.pos).addScaledVector(fwd, 0.5);
      rollQ.identity();
      k.player.av.setHands('free');
      show();
    },
    exit() {
      const av = k.player.av; av.reach('L', null); av.reach('R', null); av.bow = 0;
      k.events.loop?.('snowRoll', 0);
      if (phase !== 'done' && built) { man = built; finishSave(false); }
      phase = 'off';
      showMan();
    },
    update(dt) {
      t += dt; flush();
      if (phase !== 'roll0' && phase !== 'roll1') return;
      const p = k.player.pos, d = Math.hypot(p.x - prev.x, p.z - prev.z);
      if (d > 1e-4) { fwd.set(p.x - prev.x, 0, p.z - prev.z).normalize(); }
      prev.copy(p);
      // 雪球在人前头，推着走；地上有雪就越滚越大
      const want = tmp.copy(p).addScaledVector(fwd, r + 0.38);
      const mv = Math.hypot(want.x - ballP.x, want.z - ballP.z);
      ballP.lerp(want, Math.min(1, dt * 8));
      if (mv > 0.002) {
        const max = MAX[phase === 'roll0' ? 0 : 1];
        r = Math.min(max, r + mv * 0.035 * (1 - r / max) * (0.5 + k.atmos.snowCover));
        axis.set(fwd.z, 0, -fwd.x).normalize();
        dq.setFromAxisAngle(axis, mv / Math.max(0.05, r)); rollQ.premultiply(dq);
        moved += mv;
      }
      k.events.loop?.('snowRoll', clamp(k.player.speed / 1.4) * 0.8);
      if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) put({ hint: hint(), choices: choicesFor() });
    },
    cmd(c) {
      if (c === 'stand' && phase === 'roll0' && r >= 0.3) {
        built = { day: k.day, x: ballP.x, z: ballP.z, r: [r, 0, 0], twigs: false, hat: false, eyes: false, melt: 0, yaw: k.player.yaw };
        sfx(k, 'snowPat', { vel: 0.5 });
        phase = 'roll1'; r = 0.1; ballP.copy(k.player.pos).addScaledVector(fwd, 0.5);
        // 换一个方向推：人退开一步
        show();
      } else if (c === 'stack' && phase === 'roll1' && built && r >= 0.2 && Math.hypot(ballP.x - built.x, ballP.z - built.z) < 1.4) {
        built.r[1] = r; phase = 'head'; t = 0;
        sfx(k, 'snowPat', { vel: 0.6 });
        k.events.loop?.('snowRoll', 0);
        set({ title: '堆雪人', hint: '抱起来叠上去', steps, step: 2, choices: [{ id: 'head', label: '捏个头', main: true }, { id: 'done', label: '罢' }] });
      } else if (c === 'head' && phase === 'head' && built) {
        built.r[2] = MAX[2] * (0.85 + Math.random() * 0.2); phase = 'trim';
        sfx(k, 'snowPat', { vel: 0.4 });
        show();
      } else if ((c === 'twigs' || c === 'eyes' || c === 'hat') && phase === 'trim' && built) {
        (built as unknown as Record<string, boolean>)[c] = true; sfx(k, c === 'hat' ? 'paper' : 'snowPat', { vel: 0.35 });
        show();
      } else if (c === 'finish' && phase === 'trim' && built) { man = built; finishSave(true); }
      else if (c === 'done') k.exitAct();
    },
  };
  function finishSave(full: boolean) {
    if (!built) return;
    const rr = playGet<{ n?: number }>(k, 'snowman', {});
    playSet(k, 'snowman', { ...rr, n: (rr.n ?? 0) + 1, man: built });
    k.log({ kind: 'play', text: full ? '院里堆了一个雪人，戴着斗笠' : '院里堆了半个雪人' });
    if (full) {
      phase = 'done';
      const h = built.r[0] * 1.7 + built.r[1] * 1.75 + built.r[2] * 2;
      set({ title: '堆雪人', text: `院里立起一个雪人，${h > 1.2 ? '快齐胸高' : '半人来高'}${built.hat ? '，戴着小斗笠' : ''}${built.twigs ? '，两根树枝伸着' : ''}。天晴了、过几天，它就慢慢化了。`, steps, step: 4, choices: [{ id: 'done', label: '拍拍手上的雪' }], done: true });
    }
    showMan();
  }

  // —— 每帧：堆的时候雪球、手；院里的雪人 ——
  onFrame(k, 'snowman', () => {
    const on = act === k.act;
    if (!on || phase === 'off') return;
    const av = k.player.av, g = (x: number, z: number) => groundAt(x, z) ?? ballP.y;
    // 已经立住的底座 + 正在滚的这一个 + （捏好的）头
    let n = 0;
    if (built) {
      const g0 = g(built.x, built.z);
      tm.compose(pos.set(built.x, g0 + built.r[0] * 0.9, built.z), q.setFromAxisAngle(V(0, 1, 0), built.yaw), sc.setScalar(built.r[0])); balls.setMatrixAt(n++, tm);
      if (built.r[1] > 0) { tm.compose(pos.set(built.x, g0 + built.r[0] * 1.7 + built.r[1] * 0.9, built.z), q.setFromAxisAngle(V(0, 1, 0), built.yaw + 1), sc.setScalar(built.r[1])); balls.setMatrixAt(n++, tm); }
      if (built.r[2] > 0) { tm.compose(pos.set(built.x, g0 + built.r[0] * 1.7 + built.r[1] * 1.75 + built.r[2] * 0.9, built.z), q.setFromAxisAngle(V(0, 1, 0), built.yaw + 2), sc.setScalar(built.r[2])); balls.setMatrixAt(n++, tm); }
      if (phase === 'trim' || phase === 'done') { deco.geometry.dispose(); deco.geometry = decoGeo(built); deco.position.set(built.x, g0, built.z); deco.rotation.set(0, built.yaw, 0); deco.visible = true; }
    }
    if (phase === 'roll0' || phase === 'roll1') {
      ballP.y = g(ballP.x, ballP.z) + r * 0.93;
      tm.compose(ballP, rollQ, sc.setScalar(r)); balls.setMatrixAt(n++, tm);
      // 两手按在雪球顶上推
      av.reach('R', tmp.copy(ballP).add(V(0, r * 0.75, 0)).addScaledVector(V(fwd.z, 0, -fwd.x), -0.12), { rate: 12 });
      av.reach('L', tmp.copy(ballP).add(V(0, r * 0.75, 0)).addScaledVector(V(fwd.z, 0, -fwd.x), 0.12), { rate: 12 });
      av.bow = clamp(0.5 - r * 0.6, 0.2, 0.5);
    } else { av.reach('R', null); av.reach('L', null); av.bow = 0; }
    balls.count = n; balls.instanceMatrix.needsUpdate = true;
  });
  return act;
}
