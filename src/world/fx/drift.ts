/**
 * 落花、落叶、水花、露珠：一片一片的小东西。
 *
 * 位置在主线程里一片片地算（只有几百片，数组是开场时一次开好的，每帧不新建东西）：
 * 从花最盛处落下来，飘着、打着旋，风大时一阵一阵；落到地上的躺一会儿淡去，落进溪里的顺水漂走，落在池里的浮着不动。
 * 画的时候每一片是一小笔粉彩（夜里也留着一点颜色），没有贴图，形状在片元里现算。
 * 分两次画：躺着、漂着的画在雾之前（溪上的雾会罩住水面的落花），飞着的画在雾之后。两次用同一份数据。
 */
import * as THREE from 'three';
import { FX_LAYER, FX_PARS, INK_PARS, U } from '../ink/ink';
import { mulberry32 } from '../core/rng';

export const PETAL = 0, LEAF = 1, SPLASH = 2, DEW = 3;
const DEAD = 0, FLY = 1, REST = 2, FLOAT = 3, POND = 4, SHOT = 5;

const DRIFT_V = /* glsl */ `
${INK_PARS}
attribute vec4 aPos; attribute vec4 aArg;
uniform float uPass; uniform vec4 uDab; uniform vec4 uView;
uniform vec3 uKindPig[4]; uniform vec3 uKindAlt[4]; uniform vec4 uKindArg[4];
varying vec2 vUv; varying vec4 vP; varying vec4 vQ; varying float vZ;
void main() {
  // aArg：x 朝向（相位），y 翻转的快慢（0 就是落定了的），z 透明，w 类别（整数）+ 深浅（小数）
  float air = step(0.0005, abs(aArg.y));
  if (aArg.z < 0.004 || abs(air - uPass) > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 v = viewMatrix * vec4(aPos.xyz, 1.0);
  float dist = max(-v.z, 0.1), size = aPos.w, alpha = aArg.z;
  // 远处小得不足一两个像素的：放大到一两个像素，同时调淡（不然一闪一闪）
  float px = size * projectionMatrix[1][1] * 0.5 / (uView.y * dist);
  float k = max(1.0, uDab.x / px);
  size *= k; alpha /= sqrt(k);
  // 贴着镜头飞过的不画（不然一大团粉色糊在眼前）
  alpha *= (1.0 - smoothstep(uDab.y, uDab.z, dist)) * smoothstep(0.8, 2.6, dist);
  float kind = floor(aArg.w), tone = fract(aArg.w) * 1.1;
  float ang = aArg.x + uTime * aArg.y, cs = cos(ang), sn = sin(ang);
  vec2 q = position.xy * size;
  if (air > 0.5) {
    // 飞着：一面转一面侧过身（窄的那一向时宽时窄）
    q.y *= mix(0.45, 1.0, abs(cos(ang * 0.71 + aArg.x * 3.0)));
    q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
  } else {
    // 落定：平躺着，按看过去的角度压扁（不压到成一条线）
    q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
    q.y *= clamp(abs(normalize(cameraPosition - aPos.xyz).y) * 1.3, 0.5, 1.0);
  }
  v.xy += q;
  gl_Position = projectionMatrix * v;
  vUv = position.xy * 2.0;
  int ki = int(kind);
  vec4 ka = uKindArg[ki];
  vP = vec4(mix(uKindPig[ki], uKindAlt[ki], tone), alpha * (1.0 - ka.z * uNight));
  vQ = vec4(kind, ka.x, ka.y * (0.85 + 0.3 * tone), inkFogK(aPos.xyz));
  // 躺着的贴着地：比深度时往前让一点
  vZ = dist - (air > 0.5 ? 0.0 : 0.1 + size);
}
`;
const DRIFT_F = /* glsl */ `
${INK_PARS}
${FX_PARS}
varying vec2 vUv; varying vec4 vP; varying vec4 vQ; varying float vZ;
void main() {
  vec2 p = vUv;
  float r;
  if (vQ.x < 0.5) r = length(vec2(p.x, p.y * (1.16 + 0.26 * p.x)));                         // 花瓣：一头圆、一头略尖
  else if (vQ.x < 1.5) r = max(abs(p.x), abs(p.y) / max(0.03, 0.6 * (1.0 - p.x * p.x)));     // 叶：两头尖
  else r = length(p);                                                                         // 水花、露珠：圆点
  // 边上软一个像素
  float aa = min(0.9, fwidth(r) + 0.02);
  float a = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * vP.a * fxSeen(vZ, 0.07);
  if (a < 0.012) discard;
  // 根上深、尖上淡
  float dens = vQ.z * (0.82 + 0.4 * (0.5 - 0.5 * p.x));
  vec3 c = mix(uPaper, uLight, vQ.y) * pow(vP.rgb, vec3(dens));
  c = mix(c, uMist, vQ.w);
  gl_FragColor = vec4(c, a);
}
`;

/** 一片要落下去时问的：这一处地面多高、是不是水 */
export interface DriftSite {
  ground(x: number, z: number): number;
  /** 溪的中线：位置、半宽、水面高（自上游而下） */
  stream: ReadonlyArray<{ x: number; z: number; w: number; y?: number }>;
  pond: { x: number; z: number; rx: number; rz: number; y: number } | null;
  /** 在水面上起一圈涟漪 */
  ripple?(x: number, z: number, size: number): void;
}
export interface DriftFrame { player: THREE.Vector3; wind: number; windDir: THREE.Vector2; /** 给了镜头，花就多落在看得见的那一边 */ camera?: THREE.Camera }

export class Drift {
  /** 躺着、漂着的（画在雾之前）；飞着的（画在雾之后） */
  rest: THREE.Mesh; fly: THREE.Mesh;
  readonly n: number;
  /** 此刻飞着、躺着、漂着的各有多少 */
  nFly = 0; nRest = 0; nFloat = 0;
  private P: Float32Array; private A: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private age: Float32Array; private life: Float32Array; private gy: Float32Array; private ph: Float32Array;
  private u: Float32Array; private off: Float32Array; private sz: Float32Array;
  private st: Uint8Array; private kd: Uint8Array;
  private cur = 0; private checks = 0;
  /** 镜头在哪、朝哪（水平方向） */
  private eye = new THREE.Vector3(); private look = new THREE.Vector3(0, 0, -1); private hasEye = false;
  /** 此刻用着几个位子；留给「落一阵」的位子 */
  private live = 0; private spare: number;
  private R = mulberry32(20261113);
  // 溪（抄成数组，找最近处时不新建东西）
  private SX: Float32Array; private SZ: Float32Array; private SY: Float32Array; private SW: Float32Array; private SL: Float32Array; private sn: number;
  /** near() 的结果：离中线多远（带左右）、在第几段的哪里、那里的半宽与水面高 */
  private nd = 0; private nu = 0; private nw = 0; private ny = 0;
  // 花（叶）从哪里起：每处 x y z r 与底下的地面高
  private kind = PETAL; private src: Float32Array = new Float32Array(0); private srcG: Float32Array = new Float32Array(0); private srcN = 0;
  private nearI = new Int16Array(160); private nearN = 0; private ref = new THREE.Vector3(1e9, 0, 0); private refT = 0;
  /** 花落得到的那一段溪（点列上的第几点到第几点）；人最近的是第几点 */
  private uLo = 0; private uHi = -1; private uP = 0;
  private spawnAcc = 0; private floatAcc = 0; private ripT = 0; private warmed = false; private pDist = 1e9;
  private geos: THREE.InstancedBufferGeometry[] = []; private mats: THREE.ShaderMaterial[] = [];
  private aP: THREE.InstancedBufferAttribute; private aA: THREE.InstancedBufferAttribute;

  constructor(count: number, private site: DriftSite) {
    const n = (this.n = Math.max(16, Math.round(count)));
    this.spare = Math.max(12, Math.round(n * 0.1));
    this.P = new Float32Array(n * 4); this.A = new Float32Array(n * 4);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.age = new Float32Array(n); this.life = new Float32Array(n); this.gy = new Float32Array(n); this.ph = new Float32Array(n);
    this.u = new Float32Array(n); this.off = new Float32Array(n); this.sz = new Float32Array(n);
    this.st = new Uint8Array(n); this.kd = new Uint8Array(n);
    const S = site.stream, m = (this.sn = S.length);
    this.SX = new Float32Array(m); this.SZ = new Float32Array(m); this.SY = new Float32Array(m); this.SW = new Float32Array(m); this.SL = new Float32Array(Math.max(1, m - 1));
    for (let i = 0; i < m; i++) { this.SX[i] = S[i].x; this.SZ[i] = S[i].z; this.SY[i] = S[i].y ?? 0; this.SW[i] = S[i].w; if (i) this.SL[i - 1] = Math.hypot(S[i].x - S[i - 1].x, S[i].z - S[i - 1].z) || 1; }

    // 两次绘制各有一份几何（各自管画不画），里面的数据是同一份
    const quad = new THREE.PlaneGeometry(1, 1);
    this.aP = new THREE.InstancedBufferAttribute(this.P, 4).setUsage(THREE.DynamicDrawUsage);
    this.aA = new THREE.InstancedBufferAttribute(this.A, 4).setUsage(THREE.DynamicDrawUsage);
    const mk = (pass: number, order: number, name: string) => {
      const g = new THREE.InstancedBufferGeometry();
      g.index = quad.index; g.setAttribute('position', quad.attributes.position);
      g.setAttribute('aPos', this.aP); g.setAttribute('aArg', this.aA);
      g.instanceCount = 0;
      this.geos.push(g);
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          ...U, uPass: { value: pass },
          /** x 最小几个像素；y…z 多远以外淡出 */
          uDab: { value: new THREE.Vector4(3.2, 46, 62, 0) },
          // 各类（花瓣、叶、水花、露珠）的颜料、另一头的颜料（每片在两者之间取一个深浅），与：x 粉（不透明）几成、y 浓度、z 夜里淡去几成。
          // 水花、露珠是几点淡花青的墨点（水是留白、纸是白的，白点落在上面看不见）；露珠更淡一些
          uKindPig: { value: [new THREE.Color(0.975, 0.72, 0.76), new THREE.Color(0.93, 0.8, 0.55), new THREE.Color(0.62, 0.7, 0.8), new THREE.Color(0.7, 0.78, 0.86)] },
          uKindAlt: { value: [new THREE.Color(0.95, 0.58, 0.65), new THREE.Color(0.86, 0.64, 0.48), new THREE.Color(0.7, 0.76, 0.84), new THREE.Color(0.76, 0.83, 0.9)] },
          uKindArg: { value: [new THREE.Vector4(0.74, 0.95, 0.35, 0), new THREE.Vector4(0.3, 1.2, 0.2, 0), new THREE.Vector4(0.5, 1.6, 0.1, 0), new THREE.Vector4(0.6, 1.1, 0.1, 0)] },
        },
        vertexShader: DRIFT_V, fragmentShader: DRIFT_F,
        transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      });
      this.mats.push(mat);
      const mesh = new THREE.Mesh(g, mat);
      mesh.layers.set(FX_LAYER); mesh.frustumCulled = false; mesh.renderOrder = order; mesh.name = name;
      return mesh;
    };
    this.rest = mk(0, -5, 'drift-rest');
    this.fly = mk(1, 4, 'drift-fly');
  }
  get tris() { return this.n * 2; }

  /** 离溪最近的地方（结果放在 nd nu nw ny 里） */
  private near(x: number, z: number) {
    const X = this.SX, Z = this.SZ, m = this.sn;
    let bi = 0, bd = 1e18;
    for (let i = 0; i < m; i++) { const dx = X[i] - x, dz = Z[i] - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bi = i; } }
    let best = 1e18;
    for (let j = bi - 1; j <= bi; j++) {
      if (j < 0 || j >= m - 1) continue;
      const ex = X[j + 1] - X[j], ez = Z[j + 1] - Z[j], l = this.SL[j];
      const t = Math.max(0, Math.min(1, ((x - X[j]) * ex + (z - Z[j]) * ez) / (l * l)));
      const px = x - (X[j] + ex * t), pz = z - (Z[j] + ez * t), d = Math.hypot(px, pz);
      if (d < best) { best = d; this.nu = j + t; this.nd = (px * -ez + pz * ex) / l; this.nw = this.SW[j] + (this.SW[j + 1] - this.SW[j]) * t; this.ny = this.SY[j] + (this.SY[j + 1] - this.SY[j]) * t; }
    }
    if (best > 1e17) { this.nu = bi; this.nd = 1e9; this.nw = 0; this.ny = 0; }
  }
  /** 溪上第 u 点（可带小数）偏开 off 米处 → 写进第 i 片的位置 */
  private onStream(i: number, uu: number, off: number) {
    const j = Math.max(0, Math.min(this.sn - 2, Math.floor(uu))), t = uu - j, X = this.SX, Z = this.SZ, l = this.SL[j];
    const ex = (X[j + 1] - X[j]) / l, ez = (Z[j + 1] - Z[j]) / l, k = i * 4;
    this.P[k] = X[j] + (X[j + 1] - X[j]) * t - ez * off; this.P[k + 2] = Z[j] + (Z[j + 1] - Z[j]) * t + ex * off;
    this.P[k + 1] = this.SY[j] + (this.SY[j + 1] - this.SY[j]) * t + 0.012;
  }

  /**
   * 找一个空位。平常的落花（ambient）要给「落一阵」留出一些位子，满了就不给；
   * 「落一阵」是有人摇了树、踩了水，一定要给：实在没有空位就顶掉一片躺得最久的。
   */
  private alloc(ambient: boolean): number {
    const n = this.n, st = this.st;
    if (ambient && this.live >= n - this.spare) return -1;
    if (this.live < n) for (let k = 0; k < n; k++) { const i = (this.cur + k) % n; if (st[i] === DEAD) { this.cur = (i + 1) % n; this.live++; return i; } }
    if (ambient) return -1;
    let oi = -1, ot = -1;
    for (let i = 0; i < n; i++) if (st[i] === REST || st[i] === POND || st[i] === FLOAT) { const q = this.age[i] / this.life[i]; if (q > ot) { ot = q; oi = i; } }
    return oi;
  }
  private init(i: number, kind: number, state: number, x: number, y: number, z: number, size: number) {
    const k = i * 4, r = this.R;
    this.st[i] = state; this.kd[i] = kind; this.age[i] = 0; this.ph[i] = r();
    this.P[k] = x; this.P[k + 1] = y; this.P[k + 2] = z; this.P[k + 3] = this.sz[i] = size;
    this.A[k] = r() * 6.283; this.A[k + 1] = 0; this.A[k + 2] = 0; this.A[k + 3] = kind + r() * 0.9;
    this.vx[i] = this.vy[i] = this.vz[i] = 0;
  }
  /** 画里的花瓣比真的大（树上的花也是）：真的那么小，走在林子里就看不见了 */
  private sizeOf(kind: number) { const r = this.R(); return kind === PETAL ? 0.075 + 0.05 * r : kind === LEAF ? 0.11 + 0.07 * r : kind === SPLASH ? 0.035 + 0.04 * r : 0.03 + 0.015 * r; }

  /** 放一片飞着的。floorY：估计底下的地面有多高（快到了再细问） */
  spawnFly(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, floorY: number, ambient = false): number {
    const i = this.alloc(ambient);
    if (i < 0) return -1;
    this.init(i, kind, FLY, x, y, z, this.sizeOf(kind));
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz; this.gy[i] = floorY + 0.9; this.life[i] = 60;
    this.A[i * 4 + 1] = (kind === LEAF ? 1.6 : 2.6) * (0.6 + 0.8 * this.R()) * (this.R() < 0.5 ? -1 : 1);
    return i;
  }
  /** 放一粒抛出去的（水花、露珠）：只受重力，落回 floorY 就没了 */
  spawnShot(kind: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, floorY: number, life: number): number {
    const i = this.alloc(false);
    if (i < 0) return -1;
    this.init(i, kind, SHOT, x, y, z, this.sizeOf(kind));
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz; this.gy[i] = floorY; this.life[i] = life;
    this.A[i * 4 + 1] = 0.01;
    return i;
  }
  /** 落定在 (x, z)：看底下是地、是溪、还是池 */
  private settle(i: number, x: number, z: number, g: number, quiet: boolean) {
    const k = i * 4, r = this.R, pd = this.site.pond;
    this.A[k + 1] = 0; this.age[i] = 0; this.vx[i] = 0;
    this.near(x, z);
    if (Math.abs(this.nd) < this.nw - 0.12 && this.ny > g) {
      this.st[i] = FLOAT; this.u[i] = this.nu; this.off[i] = this.nd; this.life[i] = 34 + 30 * r();
      this.onStream(i, this.nu, this.nd);
    } else if (pd && ((x - pd.x) / pd.rx) ** 2 + ((z - pd.z) / pd.rz) ** 2 < 0.93 && pd.y > g) {
      this.st[i] = POND; this.P[k + 1] = pd.y + 0.012; this.life[i] = 30 + 30 * r();
    } else {
      this.st[i] = REST; this.P[k + 1] = g + 0.018; this.life[i] = 9 + 10 * r();
      return;
    }
    if (!quiet && this.ripT <= 0 && this.site.ripple) { this.site.ripple(x, z, 0.3 + 0.2 * r()); this.ripT = 2.2; }
  }

  /** 花（叶）从哪些地方起：spots 每处四个数 x y z r（r 是这一团花的半径） */
  setSources(kind: number, spots: Float32Array) {
    this.kind = kind; this.src = spots; this.srcN = Math.floor(spots.length / 4);
    this.srcG = new Float32Array(this.srcN).fill(NaN);
    this.nearN = 0; this.ref.set(1e9, 0, 0); this.warmed = false;
    // 花落得到的那一段溪：最上游的一处花，到最下游的一处花再往下漂一程
    let lo = 1e9, hi = -1;
    for (let s = 0; s < this.srcN; s++) { this.near(spots[s * 4], spots[s * 4 + 2]); if (Math.abs(this.nd) < 26) { lo = Math.min(lo, this.nu); hi = Math.max(hi, this.nu); } }
    this.uLo = lo; this.uHi = hi < 0 ? -1 : Math.min(this.sn - 1.01, hi + 34);
  }
  private refresh(p: THREE.Vector3) {
    this.ref.copy(p); this.refT = 2;
    // 近处的花（太多就隔几处取一处，别只取到排在前头的那几棵树）
    const S = this.src, cap = this.nearI.length; let m = 0, n = 0;
    for (let s = 0; s < this.srcN; s++) { const dx = S[s * 4] - p.x, dz = S[s * 4 + 2] - p.z; if (dx * dx + dz * dz < 38 * 38) m++; }
    const stride = Math.max(1, Math.ceil(m / cap));
    m = 0;
    for (let s = 0; s < this.srcN && n < cap; s++) { const dx = S[s * 4] - p.x, dz = S[s * 4 + 2] - p.z; if (dx * dx + dz * dz < 38 * 38 && m++ % stride === 0) this.nearI[n++] = s; }
    this.nearN = n;
    this.near(p.x, p.z); this.uP = this.nu; this.pDist = Math.abs(this.nd);
  }
  private srcGround(s: number) { let g = this.srcG[s]; if (g !== g) g = this.srcG[s] = this.site.ground(this.src[s * 4], this.src[s * 4 + 2]); return g; }
  /** 从近处挑一团花：人身边的挑得勤些（花要落在看得见的地方） */
  private pick(f: DriftFrame): number {
    const r = this.R, S = this.src, L = this.look;
    let s = 0;
    for (let tries = 0; tries < 6; tries++) {
      s = this.nearI[Math.floor(r() * this.nearN) % this.nearN];
      const dx = S[s * 4] - f.player.x, dz = S[s * 4 + 2] - f.player.z;
      // 镜头背后的少落（没人看）；眼前的多落
      const ex = S[s * 4] - this.eye.x, ez = S[s * 4 + 2] - this.eye.z, front = this.hasEye ? (ex * L.x + ez * L.z) / (Math.hypot(ex, ez) || 1) : 1;
      if (r() < Math.max(0.12, 1.2 - Math.hypot(dx, dz) / 24) * (front > 0.35 ? 1 : 0.22)) break;
    }
    return s;
  }
  /** 从近处一团花上落一片。pre：0…1，已经落到半路上（开场时铺一批用） */
  private drop(f: DriftFrame, pre: number): number {
    const r = this.R, S = this.src, s = this.pick(f);
    const k = s * 4, a = r() * 6.283, d = Math.sqrt(r()) * S[k + 3], g = this.srcGround(s);
    const x = S[k] + Math.cos(a) * d, z = S[k + 2] + Math.sin(a) * d, y = S[k + 1] + (r() - 0.45) * S[k + 3] * 0.7;
    const wv = f.wind * 6.5, i = this.spawnFly(this.kind, x, y, z, f.windDir.x * wv * 0.5, -0.2, f.windDir.y * wv * 0.5, g, true);
    if (i >= 0 && pre > 0) {
      // 已经落了一程：顺着风挪过去一些
      const drop = (y - g - 0.4) * pre, tt = drop / 0.75;
      this.P[i * 4] += f.windDir.x * wv * tt * 0.8; this.P[i * 4 + 2] += f.windDir.y * wv * tt * 0.8; this.P[i * 4 + 1] -= drop;
      this.age[i] = 1 + tt; this.vy[i] = -0.7;
    }
    return i;
  }
  /** 开场（或换了地方）：先铺上已经落在地上、漂在水上、飞在半空的 */
  private prewarm(f: DriftFrame, flyTarget: number, floatTarget: number) {
    const r = this.R, S = this.src;
    if (this.nearN) {
      for (let j = 0; j < flyTarget * 0.85; j++) this.drop(f, r());
      const lying = Math.min(this.n * 0.42, this.nearN * 9);
      for (let j = 0; j < lying; j++) {
        const s = this.pick(f), k = s * 4, a = r() * 6.283, d = Math.sqrt(r()) * S[k + 3] * 1.9;
        const x = S[k] + Math.cos(a) * d + f.windDir.x * 1.2, z = S[k + 2] + Math.sin(a) * d + f.windDir.y * 1.2;
        const i = this.alloc(true);
        if (i < 0) break;
        this.init(i, this.kind, REST, x, 0, z, this.sizeOf(this.kind));
        this.settle(i, x, z, this.site.ground(x, z), true);
        this.age[i] = this.life[i] * r() * 0.8;
      }
    }
    for (let j = 0; j < floatTarget * 0.9; j++) this.floatOne(r() * 0.8);
  }
  /** 往人附近的溪面上放一片漂着的（上游漂下来的） */
  private floatOne(aged: number) {
    if (this.uHi < 0) return;
    const r = this.R, lo = Math.max(this.uLo, this.uP - 11), hi = Math.min(this.uHi, this.uP + 11);
    if (hi <= lo) return;
    const i = this.alloc(true);
    if (i < 0) return;
    const uu = lo + (hi - lo) * r(), j = Math.min(this.sn - 2, Math.floor(uu)), w = this.SW[j];
    this.init(i, this.kind, FLOAT, 0, 0, 0, this.sizeOf(this.kind));
    this.u[i] = uu; this.off[i] = (r() * 2 - 1) * (w - 0.3) * 0.9; this.life[i] = 34 + 30 * r(); this.age[i] = this.life[i] * aged;
    this.vx[i] = aged > 0 ? 0 : 1;
    this.onStream(i, uu, this.off[i]);
  }

  /** 在某处落一阵 */
  burst(kind: number, pos: THREE.Vector3, count: number) {
    const r = this.R;
    if (kind === SPLASH || kind === DEW) {
      // 底下是地还是水（溪、池）：水花、露珠落到那里为止；是水就荡一圈
      const g = this.site.ground(pos.x, pos.z), pd = this.site.pond;
      this.near(pos.x, pos.z);
      let floor = g, wet = false;
      if (Math.abs(this.nd) < this.nw && this.ny > g) { floor = this.ny; wet = true; }
      else if (pd && ((pos.x - pd.x) / pd.rx) ** 2 + ((pos.z - pd.z) / pd.rz) ** 2 < 1 && pd.y > g) { floor = pd.y; wet = true; }
      for (let j = 0; j < count; j++) {
        const a = r() * 6.283;
        if (kind === SPLASH) { const sp = 0.35 + 0.9 * r(); this.spawnShot(kind, pos.x, pos.y + 0.02, pos.z, Math.cos(a) * sp, 1.3 + 1.5 * r(), Math.sin(a) * sp, pos.y - 0.02, 0.9); }
        else { const d = 0.25 * Math.sqrt(r()); this.spawnShot(kind, pos.x + Math.cos(a) * d, pos.y - 0.1 * r(), pos.z + Math.sin(a) * d, 0, -0.3 * r(), 0, floor, 2.5); }
      }
      if (wet && this.site.ripple) { this.site.ripple(pos.x, pos.z, kind === SPLASH ? 1 : 0.4); this.ripT = 1.5; }
      return;
    }
    const g = this.site.ground(pos.x, pos.z);
    for (let j = 0; j < count; j++) {
      const a = r() * 6.283, sp = 0.2 + 0.9 * r(), d = 0.35 * Math.sqrt(r());
      this.spawnFly(kind, pos.x + Math.cos(a) * d, pos.y + (r() - 0.5) * 0.5, pos.z + Math.sin(a) * d, Math.cos(a) * sp, 0.1 + 0.7 * r(), Math.sin(a) * sp, g);
    }
  }

  /**
   * amount：这一季落花（叶）的多少（0 不落）；gust：阵风（0 平常 … 1 一阵大的）。
   */
  update(dt: number, f: DriftFrame, amount: number, gust: number) {
    const n = this.n, P = this.P, A = this.A, st = this.st, r = this.R, site = this.site, pd = site.pond;
    const px = f.player.x, pz = f.player.z;
    this.ripT -= dt; this.refT -= dt;
    this.hasEye = !!f.camera;
    if (f.camera) { this.eye.copy(f.camera.position); f.camera.getWorldDirection(this.look); this.look.y = 0; if (this.look.lengthSq() > 1e-6) this.look.normalize(); else this.hasEye = false; }
    // —— 这一季的落花 ——
    if (this.srcN && amount > 0.01) {
      const moved = Math.hypot(px - this.ref.x, pz - this.ref.z);
      if (moved > 6 || this.refT <= 0) {
        // 一下子换了地方（传送）：重新铺
        if (moved > 40 && this.warmed) { let kept = 0; for (let i = 0; i < n; i++) { if (st[i] !== DEAD && st[i] !== SHOT) st[i] = DEAD; else if (st[i] === SHOT) kept++; } this.live = kept; this.warmed = false; }
        this.refresh(f.player);
      }
      // 近处花越多落得越多；有风时一阵一阵
      const flyTarget = Math.min(n * 0.45, 9 * this.nearN) * amount * (0.6 + 1.5 * gust), floatTarget = this.uHi >= 0 && this.pDist < 60 ? Math.min(n * 0.08, 26) * amount : 0;
      if (!this.warmed) { this.warmed = true; this.prewarm(f, flyTarget, floatTarget); }
      if (this.nearN) {
        this.spawnAcc += (flyTarget / 5.5) * dt;
        let guard = 6;
        while (this.spawnAcc >= 1 && guard-- > 0) { this.spawnAcc -= 1; if (this.nFly < flyTarget * 1.5) this.drop(f, 0); }
        if (this.spawnAcc > 4) this.spawnAcc = 4;
      }
      if (floatTarget > 0 && this.nFloat < floatTarget) { this.floatAcc += dt * floatTarget / 20; if (this.floatAcc >= 1) { this.floatAcc = 0; this.floatOne(0); } }
    }
    // —— 一片片地走 ——
    const wv = f.wind * 6.5 * (1 + 0.6 * gust), wx = f.windDir.x * wv, wz = f.windDir.y * wv, relax = Math.min(1, dt * 2.4);
    let nf = 0, nr = 0, nw = 0;
    this.checks = 0;
    for (let i = 0; i < n; i++) {
      const s = st[i];
      if (s === DEAD) continue;
      const k = i * 4, age = (this.age[i] += dt);
      let a = 1;
      if (s === FLY) {
        nf++;
        const leaf = this.kd[i] === LEAF, p = this.ph[i];
        const sw = Math.sin(age * (leaf ? 1.7 : 2.4) * (0.8 + 0.4 * p) + p * 6.283), sw2 = Math.cos(age * (leaf ? 1.15 : 1.7) + p * 11);
        const da = p * 19, amp = leaf ? 0.95 : 0.55, fall = (leaf ? 1.0 : 0.7) * (0.78 + 0.45 * p);
        this.vx[i] += (wx + Math.cos(da) * sw * amp - this.vx[i]) * relax;
        this.vz[i] += (wz + Math.sin(da) * sw * amp - this.vz[i]) * relax;
        this.vy[i] += (-fall * (0.62 + 0.38 * Math.abs(sw2)) - this.vy[i]) * relax;
        P[k] += this.vx[i] * dt; P[k + 1] += this.vy[i] * dt; P[k + 2] += this.vz[i] * dt;
        a = Math.min(1, age * 2.5);
        if (P[k + 1] < this.gy[i] && this.checks < 8) {
          // 快到地了：问问底下多高、是不是水
          this.checks++;
          const x = P[k], z = P[k + 2], g = site.ground(x, z);
          let floor = g;
          this.near(x, z);
          if (Math.abs(this.nd) < this.nw - 0.12 && this.ny > g) floor = this.ny;
          else if (pd && ((x - pd.x) / pd.rx) ** 2 + ((z - pd.z) / pd.rz) ** 2 < 0.93 && pd.y > g) floor = pd.y;
          if (P[k + 1] <= floor + 0.03) this.settle(i, x, z, g, Math.hypot(x - px, z - pz) > 30);
          else this.gy[i] = Math.max(floor + 0.03, P[k + 1] - 0.4);
        }
        if (age > this.life[i]) st[i] = DEAD;
      } else if (s === SHOT) {
        nf++;
        const dew = this.kd[i] === DEW;
        this.vy[i] -= (dew ? 7 : 9.8) * dt;
        P[k] += this.vx[i] * dt; P[k + 1] += this.vy[i] * dt; P[k + 2] += this.vz[i] * dt;
        const q = age / this.life[i];
        a = dew ? Math.min(1, age * 8) : 1 - q * q;
        if (P[k + 1] < this.gy[i] || q >= 1) st[i] = DEAD;
      } else {
        // vx 在这里借来记「是不是凭空放上去的」（那样的要慢慢显出来；飞着落定的本来就看得见）
        const left = this.life[i] - age;
        a = Math.min(1, this.vx[i] > 0 ? age * 0.8 : 1, left / 2.5);
        if (s === FLOAT) {
          nw++;
          const j = Math.max(0, Math.min(this.sn - 2, Math.floor(this.u[i]))), w = this.SW[j] - 0.3, o = this.off[i] / Math.max(0.3, w);
          // 中流快、岸边慢；一面漂一面左右荡一点
          this.u[i] += (0.36 * (1 - 0.55 * o * o) * dt) / this.SL[j];
          this.off[i] = Math.max(-w, Math.min(w, this.off[i] + Math.sin(age * 0.37 + this.ph[i] * 40) * 0.05 * dt));
          if (this.u[i] >= this.sn - 1.02) st[i] = DEAD; else this.onStream(i, this.u[i], this.off[i]);
          A[k] += dt * 0.12 * (this.ph[i] - 0.5);
        } else if (s === POND) { nw++; A[k] += dt * 0.05 * (this.ph[i] - 0.5); } else nr++;
        if (left <= 0) st[i] = DEAD;
        else { const dx = P[k] - px, dz = P[k + 2] - pz; if (dx * dx + dz * dz > 78 * 78) st[i] = DEAD; }
      }
      A[k + 2] = st[i] === DEAD ? 0 : a;
    }
    this.nFly = nf; this.nRest = nr; this.nFloat = nw; this.live = nf + nr + nw;
    // 一片都没有的那一次就不画（几何还在，着色器开场时就编好了）
    this.geos[0].instanceCount = nr + nw > 0 ? n : 0; this.geos[1].instanceCount = nf > 0 ? n : 0;
    if (nf + nr + nw > 0 || this.dirty) { this.aP.needsUpdate = true; this.aA.needsUpdate = true; }
    this.dirty = nf + nr + nw > 0;
  }
  private dirty = false;
  dispose() { for (const g of this.geos) g.dispose(); for (const m of this.mats) m.dispose(); }
}
