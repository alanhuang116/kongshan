/**
 * 纸鸢：一只纸糊的鹞（两翅平张、尾羽散开），竹篾的骨，墨笔勾几道羽；两条长长的纸尾随风摆。
 * 原点在提线结上（鸢身前面一点），鸢面朝 +z（朝着放的人），头朝 +y。
 * 另有 kiteInTree：挂在树上的一只（给村人那一路的托事用：孩子的纸鸢挂在树上了）。
 */
import * as THREE from 'three';
import { merge } from '../core/geo';
import { pole, v3 } from '../build/kit';
import type { Anlewo } from '../Anlewo';
import { Line, onFrame } from './kit';
import { wash } from '../ink/ink';

/** 一片双面的三角（顶点色给颜料的深浅） */
function tri(a: [number, number], b: [number, number], c: [number, number], k: number, z = 0): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a[0], a[1], z, b[0], b[1], z, c[0], c[1], z, a[0], a[1], z, c[0], c[1], z, b[0], b[1], z], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([a[0], a[1], b[0], b[1], c[0], c[1], a[0], a[1], c[0], c[1], b[0], b[1]], 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(18).fill(k), 3));
  return g;
}
/** 鹞：两翅（翼尖往后掠）、身、扇形的尾；墨色由翼根到翼尖渐深 */
export function kiteGeo(): THREE.BufferGeometry {
  const gs: THREE.BufferGeometry[] = [];
  // 身：头尖、胸宽、腰收
  gs.push(tri([0, 0.36], [-0.07, 0.18], [0.07, 0.18], 0.78), tri([-0.07, 0.18], [-0.06, -0.12], [0.07, 0.18], 0.9), tri([0.07, 0.18], [-0.06, -0.12], [0.06, -0.12], 0.9));
  for (const s of [-1, 1]) {
    // 翅：三片，翼根浅、翼尖深（墨笔点的羽）
    gs.push(tri([s * 0.07, 0.17], [s * 0.3, 0.2], [s * 0.06, 0.0], 0.92));
    gs.push(tri([s * 0.3, 0.2], [s * 0.52, 0.12], [s * 0.06, 0.0], 0.82));
    gs.push(tri([s * 0.52, 0.12], [s * 0.6, 0.02], [s * 0.3, 0.02], 0.62));
    gs.push(tri([s * 0.3, 0.02], [s * 0.52, 0.12], [s * 0.06, 0.0], 0.86));
  }
  // 尾：扇形五片
  for (let i = -2; i <= 2; i++) { const a = i * 0.22; gs.push(tri([0, -0.1], [Math.sin(a - 0.1) * 0.3, -0.1 - Math.cos(a - 0.1) * 0.3], [Math.sin(a + 0.1) * 0.3, -0.1 - Math.cos(a + 0.1) * 0.3], i === 0 ? 0.8 : 0.88)); }
  // 竹篾的骨：一根脊、一根横梁（略弯）
  const bone = (a: THREE.Vector3, b: THREE.Vector3) => { const g = pole(a, b, 0.004, 0.004, 4); const c = g.attributes.color as THREE.BufferAttribute; for (let i = 0; i < c.count; i++) c.setXYZ(i, 0.55, 0.5, 0.4); return g; };
  gs.push(bone(v3(0, 0.36, 0.006), v3(0, -0.3, 0.006)), bone(v3(-0.6, 0.04, 0.008), v3(0, 0.17, 0.008)), bone(v3(0, 0.17, 0.008), v3(0.6, 0.04, 0.008)));
  return merge(gs);
}

export function makeKite() {
  // 纸面：带三分粉，夜里也辨得出；不积雪
  const paper = wash({ pig: [0.95, 0.93, 0.87], dens: 1.05, body: 0.4, shade: 1.12, grain: 3, line: 0.6, side: THREE.DoubleSide, snow: 0 });
  const kite = new THREE.Mesh(kiteGeo(), paper);
  kite.name = 'play:kite';
  kite.frustumCulled = false;
  // 两条纸尾：淡朱
  const tailMat = wash({ pig: [0.93, 0.62, 0.55], dens: 0.9, body: 0.5, flat: 1, line: 0, side: THREE.DoubleSide, snow: 0 });
  const tails = [new Line(10, 0.035, tailMat), new Line(10, 0.035, tailMat)];
  const line = new Line(28, 0.004);
  line.mesh.name = 'play:kiteline';
  return { kite, tails, line, paper };
}

/**
 * 一只挂在树上的纸鸢（村人那一路的托事用）：k.play?.kiteInTree({ x, y, z }) 挂上，返回的 remove() 取下来。
 * 挂着的时候纸尾随风轻轻地摆；一截断线垂下来。
 */
export function kiteInTree(k: Anlewo, at: { x: number; y: number; z: number }, yaw = 0.6) {
  const { kite, tails, line } = makeKite();
  kite.position.set(at.x, at.y, at.z); kite.rotation.set(0.5, yaw, 0.9);
  k.world.scene.add(kite, tails[0].mesh, tails[1].mesh, line.mesh);
  const pts = Array.from({ length: 28 }, () => v3()), tp = Array.from({ length: 10 }, () => v3());
  const base = kite.position.clone();
  let alive = true;
  const tick = (t: number) => {
    if (!alive) return;
    const cam = k.world.camera.position;
    kite.updateMatrixWorld(true);
    for (let s = 0; s < 2; s++) {
      const root = v3((s ? 1 : -1) * 0.06, -0.28, 0).applyMatrix4(kite.matrixWorld);
      for (let i = 0; i < 10; i++) { const u = i / 9; tp[i].copy(root).add(v3(0.12 * Math.sin(t * 1.7 + u * 3 + s), -u * 0.9, 0.08 * Math.cos(t * 1.3 + u * 2))); }
      tails[s].set(tp, cam);
    }
    for (let i = 0; i < 28; i++) { const u = i / 27; pts[i].copy(base).add(v3(0.05 * Math.sin(t + u * 4), -u * 1.6, 0.02 * u)); }
    line.set(pts, cam);
  };
  onFrame(k, 'kiteInTree', (_dt, t) => tick(t));
  return {
    obj: kite,
    remove() { alive = false; for (const m of [kite, tails[0].mesh, tails[1].mesh, line.mesh]) { m.removeFromParent(); m.geometry.dispose(); } },
  };
}
