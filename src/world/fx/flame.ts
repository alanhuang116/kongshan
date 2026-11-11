/**
 * 火：烛焰、灯芯、香头的一点红。都是朝着镜头的小片（Sprite），亮度超过 1，经泛光后自己会晕开；
 * 每一朵各自摇曳，带一圈很淡的光晕。真正照亮周围的点光只有几盏（由调用者放），其亮度跟着这里的 flicker 走。
 */
import * as THREE from 'three';
import { enhance } from '../core/mats';
import { canvas, canvasTex, softSprite } from '../core/tex';

function flameTex(): THREE.Texture {
  const [c, g] = canvas(64, 128);
  // 外焰：橙；内焰：黄白；焰根：一点蓝
  const body = (x: number, y: number, rx: number, ry: number, stops: Array<[number, string]>) => {
    g.save(); g.translate(x, y); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0.15, 0, 0, 0, 1);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.beginPath();
    g.moveTo(0, -1.5); g.bezierCurveTo(0.55, -0.6, 0.95, 0.1, 0.62, 0.72); g.bezierCurveTo(0.35, 1.05, -0.35, 1.05, -0.62, 0.72); g.bezierCurveTo(-0.95, 0.1, -0.55, -0.6, 0, -1.5);
    g.fill(); g.restore();
  };
  g.globalCompositeOperation = 'lighter';
  body(32, 76, 22, 38, [[0, 'rgba(255,190,90,0.95)'], [0.6, 'rgba(255,120,30,0.5)'], [1, 'rgba(255,80,10,0)']]);
  body(32, 84, 12, 26, [[0, 'rgba(255,250,225,1)'], [0.7, 'rgba(255,225,140,0.7)'], [1, 'rgba(255,200,90,0)']]);
  body(32, 108, 9, 9, [[0, 'rgba(120,160,255,0.55)'], [1, 'rgba(60,90,255,0)']]);
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
function dotTex(): THREE.Texture {
  const [c, g] = canvas(32, 32);
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return canvasTex(c);
}

interface Item { s: THREE.Sprite; halo: THREE.Sprite | null; size: number; seed: number; on: number; goal: number; ember: boolean; haloSize: number }

export class Flames {
  group = new THREE.Group();
  /** 0…1：此刻整体的明暗起伏（给点光用） */
  flicker = 1;
  private items: Item[] = [];
  private mFlame: THREE.SpriteMaterial; private mEmber: THREE.SpriteMaterial; private mHalo: THREE.SpriteMaterial;
  constructor() {
    this.group.name = 'flames';
    const mk = (map: THREE.Texture, col: [number, number, number]) => enhance(new THREE.SpriteMaterial({ map, color: new THREE.Color().setRGB(...col), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.mFlame = mk(flameTex(), [2.6, 2.0, 1.2]);
    this.mEmber = mk(dotTex(), [4.0, 1.1, 0.25]);
    this.mHalo = mk(softSprite(64, 3, 0.05), [0.9, 0.5, 0.2]);
  }
  /** 加一朵火。size 是焰高（米）；ember 为真则只是香头那一点红；halo 是光晕的直径（0 不要） */
  add(pos: THREE.Vector3, size = 0.06, o: { ember?: boolean; halo?: number; on?: boolean } = {}): number {
    const s = new THREE.Sprite((o.ember ? this.mEmber : this.mFlame).clone());
    s.center.set(0.5, o.ember ? 0.5 : 0.1);
    s.position.copy(pos);
    s.renderOrder = 9;
    let halo: THREE.Sprite | null = null;
    const hs = o.halo ?? (o.ember ? 0 : size * 9);
    if (hs > 0) { halo = new THREE.Sprite(this.mHalo.clone()); halo.position.copy(pos); halo.position.y += o.ember ? 0 : size * 0.4; halo.renderOrder = 7; this.group.add(halo); }
    this.group.add(s);
    const on = o.on === false ? 0 : 1;
    this.items.push({ s, halo, size, seed: Math.random() * 100, on, goal: on, ember: !!o.ember, haloSize: hs });
    return this.items.length - 1;
  }
  /** 点着 / 熄灭（渐变） */
  set(id: number, on: boolean) { const it = this.items[id]; if (it) it.goal = on ? 1 : 0; }
  move(id: number, pos: THREE.Vector3) { const it = this.items[id]; if (!it) return; it.s.position.copy(pos); if (it.halo) { it.halo.position.copy(pos); if (!it.ember) it.halo.position.y += it.size * 0.4; } }
  isOn(id: number) { return (this.items[id]?.on ?? 0) > 0.5; }
  update(dt: number, t: number, wind = 0) {
    let f = 0, n = 0;
    for (const it of this.items) {
      it.on += Math.max(-dt * 2.5, Math.min(dt * 2.5, it.goal - it.on));
      const a = t * 9 + it.seed, k = 0.86 + 0.09 * Math.sin(a) + 0.06 * Math.sin(a * 2.7 + 1.3) + 0.05 * Math.sin(a * 0.31);
      const vis = it.on > 0.01;
      it.s.visible = vis; if (it.halo) it.halo.visible = vis;
      if (!vis) continue;
      if (it.ember) {
        const sz = it.size * (0.85 + 0.25 * Math.sin(t * 2.3 + it.seed)) * it.on;
        it.s.scale.set(sz, sz, 1);
      } else {
        const sway = (Math.sin(a * 0.7) * 0.06 + Math.sin(a * 1.9) * 0.03) * (1 + wind * 4);
        it.s.scale.set(it.size * 0.52 * (1 + sway * 0.6), it.size * (0.92 + 0.16 * k) * it.on, 1);
        it.s.material.rotation = -sway * 0.8;
        f += k; n++;
      }
      it.s.material.opacity = Math.min(1, it.on * 1.4);
      if (it.halo) { const hs = it.haloSize * (0.9 + 0.14 * k); it.halo.scale.set(hs, hs, 1); it.halo.material.opacity = 0.5 * it.on * k; }
    }
    this.flicker = n ? f / n : 1;
  }
}
