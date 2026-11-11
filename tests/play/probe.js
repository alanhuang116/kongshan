// 注到页面里的探针：每帧记下小人的位置、速度、脚、胯、头、两手、手要去够的目标、镜头。
(() => {
  const k = window.__ks;
  if (!k || window.__probe) return;
  const av = k.player.av, V3 = k.player.pos.constructor;
  const tmp = new V3();
  const w = (o) => { if (!o) return null; o.getWorldPosition(tmp); return [tmp.x, tmp.y, tmp.z]; };
  /** 鞋的前掌（鞋自己的坐标里往前 10 厘米）在世界的哪里：脚跟抬起后撑着地的是这里 */
  const ball = (o) => { if (!o) return null; o.updateWorldMatrix(true, false); tmp.set(0, 0, 0.1).applyMatrix4(o.matrixWorld); return [tmp.x, tmp.y, tmp.z]; };
  const P = { rows: [], steps: [], on: false, last: { L: null, R: null } };
  P.start = () => { P.rows = []; P.steps = []; P.on = true; };
  P.stop = () => { P.on = false; return { rows: P.rows, steps: P.steps }; };
  const st0 = k.player.onStep;
  k.player.onStep = (f) => { if (P.on) P.steps.push({ t: performance.now(), f, x: k.player.pos.x, y: k.player.pos.y, z: k.player.pos.z }); st0?.(f); };
  const reach0 = av.reach.bind(av);
  av.reach = (s, t, o) => { P.last[s] = t ? [t.x, t.y, t.z] : null; return reach0(s, t, o); };
  k.world.tick.push((dt) => {
    if (!P.on) return;
    const p = k.player, c = k.world.camera.position;
    P.rows.push({
      t: performance.now(), dt, pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, speed: p.speed,
      fl: w(av.feet?.L), fr: w(av.feet?.R), bl: ball(av.feet?.L), br: ball(av.feet?.R), hips: w(av.joints.hips), head: w(av.joints.head), chest: w(av.joints.chest),
      hl: w(av.joints.handL), hr: w(av.joints.handR), tl: P.last.L, tr: P.last.R, cam: [c.x, c.y, c.z], cl: av.contact ? !!av.contact.L : null, cr: av.contact ? !!av.contact.R : null,
    });
  });
  /** 小人此刻所有网格的包围盒（按当前顶点算） */
  P.box = () => {
    const B = k.world.scene.constructor; void B;
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    av.root.updateWorldMatrix(true, true);
    av.root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const a = o.geometry.attributes.position, n = o.geometry.drawRange.count < Infinity && o.geometry.index ? Math.min(o.geometry.index.count, o.geometry.drawRange.count) : 0;
      const idx = o.geometry.index;
      const each = (i) => { tmp.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); lo = [Math.min(lo[0], tmp.x), Math.min(lo[1], tmp.y), Math.min(lo[2], tmp.z)]; hi = [Math.max(hi[0], tmp.x), Math.max(hi[1], tmp.y), Math.max(hi[2], tmp.z)]; };
      if (idx && n) for (let i = 0; i < n; i++) each(idx.getX(i)); else for (let i = 0; i < a.count; i++) each(i);
    });
    return { lo, hi };
  };
  window.__probe = P;
})();
