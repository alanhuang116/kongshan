/**
 * 光柱：日光从殿门斜射进来，照见空气里的浮尘。
 * 假的体积光：每个门洞沿着光的方向拉出几片半透明的面（越往里越淡），叠加混合。只在晴天、日在殿前时出现。
 */
import * as THREE from 'three';

export interface Opening { x0: number; x1: number; y0: number; y1: number; z: number; floor: number }

export class Shafts {
  mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private pos: Float32Array; private col: Float32Array;
  private last = new THREE.Vector3();
  private readonly K = 9;
  constructor(private openings: Opening[]) {
    const quads = openings.length * this.K * 2;
    this.pos = new Float32Array(quads * 18); this.col = new Float32Array(quads * 24);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.Mesh(this.geo, m);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 10; this.mesh.name = 'shafts';
  }
  /** dir：指向日的方向；color：日色；k：强度 0…1 */
  update(dir: THREE.Vector3, color: THREE.Color, k: number) {
    const m = this.mesh.material as THREE.MeshBasicMaterial;
    const s = k * Math.max(0, Math.min(1, (dir.z - 0.12) * 2.2));
    this.mesh.visible = s > 0.01;
    if (!this.mesh.visible) return;
    m.color.copy(color).multiplyScalar(0.03 * s);
    if (this.last.distanceToSquared(dir) < 1e-5) return;
    this.last.copy(dir);
    let q = 0;
    const P = this.pos, C = this.col;
    const quad = (a: number[], b: number[], c: number[], d: number[], a0: number, a1: number) => {
      const vs = [a, b, c, a, c, d], al = [a0, a0, a1, a0, a1, a1];
      for (let i = 0; i < 6; i++) { P.set(vs[i], q * 18 + i * 3); C.set([1, 1, 1, al[i]], q * 24 + i * 4); }
      q++;
    };
    const quad2 = (a: number[], b: number[], c: number[], d: number[], al: number[]) => {
      const vs = [a, b, c, a, c, d], as = [al[0], al[1], al[2], al[0], al[2], al[3]];
      for (let i = 0; i < 6; i++) { P.set(vs[i], q * 18 + i * 3); C.set([1, 1, 1, as[i]], q * 24 + i * 4); }
      q++;
    };
    void quad;
    for (const o of this.openings) {
      // 光往 -dir 走；门楣处的光线落到地面要走多远
      const len = Math.min(13, (o.y1 - o.floor) / Math.max(0.12, dir.y) * 1.02);
      const dx = -dir.x * len, dy = -dir.y * len, dz = -dir.z * len;
      const at = (x: number, y: number, t: number) => [x + dx * t, Math.max(o.floor + 0.01, y + dy * t), o.z + dz * t];
      const ym = (o.y0 + o.y1) / 2;
      for (let i = 0; i < this.K; i++) {
        const u = (i + 0.5) / this.K, x = o.x0 + (o.x1 - o.x0) * u;
        // 靠门边的几片更淡；每片上下两半，中间实、上下沿虚
        const a = 0.9 * Math.sin(Math.PI * u);
        quad2(at(x, o.y1, 0), at(x, ym, 0), at(x, ym, 1), at(x, o.y1, 1), [0.05 * a, a, 0, 0]);
        quad2(at(x, ym, 0), at(x, o.y0, 0), at(x, o.y0, 1), at(x, ym, 1), [a, 0.05 * a, 0, 0]);
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
}
