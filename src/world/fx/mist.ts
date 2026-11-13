/**
 * 烟（贴着水、贴着地的雾）。山水画里的「烟」是留出来的白：溪上一带、田上薄薄一层，
 * 把树脚、对岸、屋基淹掉，只露出上半截。
 *
 * 不是一张张朝着镜头的片。每一片雾是一块平躺着的「厚板」（底贴着水面或地面，有一两米厚），
 * 网格画的是板的顶面；片元里算这条视线在板里走了多长、走到多深——
 *   斜着看走得长就浓，俯看走得短就淡；
 *   雾是底下浓、顶上薄：视线碰到树干、岸坡时只算到那里为止，所以树干是从上往下一点点没进雾里的，
 *   雾与东西相接处自然是虚的；
 *   再乘上一缕一缕（顺着溪、顺着田垄拉长）慢慢走的疏密，浓的地方雾顶也高一些。
 * 这样平视是一带横烟、俯看是伏在水上的几片，镜头转动时不会跟着转。
 * 人走进雾里时板顶压到眼睛底下（近处的雾交给 ink.ts 里那层随距离的雾）。
 *
 * 全部的雾并成一个网格（一次绘制）。每个顶点记着：这一处多厚、离边多远、属于哪一片；
 * 疏密取在哪（溪上按「顺流多远、离中线多远」取，所以一缕缕是顺着溪的）、一缕多长多宽。
 */
import * as THREE from 'three';
import { FX_LAYER, FX_PARS, INK_PARS, U } from '../ink/ink';

const MIST_V = /* glsl */ `
attribute vec4 aM; attribute vec4 aN; attribute vec2 aS;
uniform vec4 uAmt;
varying vec3 vW; varying vec4 vM; varying vec4 vN; varying vec2 vS; varying float vZ;
void main() {
  float amt = aM.z < 0.5 ? uAmt.x : aM.z < 1.5 ? uAmt.y : aM.z < 2.5 ? uAmt.z : uAmt.w;
  // 雾多的时候也厚一些（到晨雾那么厚为止；雾天是更浓、更连片，不是更高）
  float thick = aM.x * (0.5 + 0.5 * min(amt, 1.0));
  vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
  // 板顶不高过眼睛
  float top = min(w.y + thick, cameraPosition.y - 0.45);
  vM = vec4(max(0.0, top - w.y), aM.y, amt, aM.w);
  vN = aN; vS = aS;
  w.y = top;
  vW = w;
  vec4 v = viewMatrix * vec4(w, 1.0);
  vZ = -v.z;
  gl_Position = projectionMatrix * v;
}
`;
const MIST_F = /* glsl */ `
${INK_PARS}
${FX_PARS}
uniform vec4 uMistP; uniform vec2 uDrift;
varying vec3 vW; varying vec4 vM; varying vec4 vN; varying vec2 vS; varying float vZ;
void main() {
  float amt = vM.z;
  if (vM.x < 0.03 || amt < 0.004) discard;
  vec3 ray = vW - cameraPosition;
  float dist = length(ray);
  vec3 V = ray / dist;
  float d = texture2D(tDepth, gl_FragCoord.xy * uView.xy).x, zn = d * 2.0 - 1.0;
  float scene = 2.0 * uView.z * uView.w / (uView.w + uView.z - zn * (uView.w - uView.z));
  // 视线过了板顶以后，到碰上东西还有多远
  float behind = (scene - vZ) * dist / vZ;
  if (behind <= 0.0) discard;
  // 先粗算在板里走多长，疏密、边缘、远近都取在这段路的中间
  // （雾在板「里面」：板顶那一点往往就在脚边，雾其实在前面十几米处）
  float vy = max(-V.y, 0.035);
  float Lr = min(min(vM.x / vy, behind), uMistP.y);
  vec3 off = V * (Lr * 0.5);
  vec2 pm = vN.xy + vec2(dot(off.xz, vN.zw), dot(off.xz, vec2(-vN.w, vN.z)));
  // 边：一带雾（溪、河）按离中线多远淡出，网格最外一圈再收一收；成片的按顶点上记的
  float e = vM.w > 0.5 ? vM.y * (1.0 - smoothstep(0.3, 1.0, abs(pm.y) / vM.w)) * smoothstep(0.0, 0.22, 1.0 - abs(vN.y) / vM.w) : smoothstep(0.0, 1.0, vM.y);
  if (e < 0.004) discard;
  // 大的疏密（一缕一缕，略带弯）：浓处雾顶高，淡处低
  vec2 q0 = (pm + uDrift) * vS;
  q0 += 0.3 * sin(q0.yx * 1.9 + vec2(1.3, 4.1));
  float n1 = in3(vec3(q0, uTime * 0.011 + vS.y * 40.0));
  // 溪上、河上的雾偏爱水面正上方
  if (vM.w > 0.5) n1 += 0.16 * (1.0 - 2.0 * abs(pm.y) / vM.w);
  // 雾少：只剩几缕；晨雾：成带；雾天：连成一片
  float th = mix(0.6, 0.2, clamp(amt, 0.0, 1.0)) - 0.16 * clamp(amt - 1.0, 0.0, 1.0);
  float big = smoothstep(th, th + 0.5, n1);
  float hT = vM.x * (0.62 + 0.38 * big);
  // 从板顶到这一处的雾顶还空着一截；进了雾以后到碰上东西是 inside，走到底是 full
  float inside = behind - (vM.x - hT) / vy, full = hT / vy;
  if (inside <= 0.0) discard;
  float L = min(min(full, inside), uMistP.y);
  float n = big;
  #ifndef MIST_LOW
    n *= 0.45 + 1.1 * in3(vec3(q0 * 2.9 + 7.0 + uDrift * vS * 0.9, off.y * vS.y * 2.0 + uTime * 0.021));
  #endif
  // 雾顶是虚的：最上面一层薄，往下几十厘米才到足浓——树干是从上往下一点点没进雾里的
  float depthK = clamp(inside * vy / (0.25 + 0.3 * hT), 0.0, 1.0);
  float a = 1.0 - exp(-uMistP.x * (0.35 + 0.65 * min(amt, 2.0)) * n * e * L * depthK);
  // 近处不罩（人身边要看得清）
  a *= smoothstep(uMistP.z, uMistP.w, dist + Lr * 0.5) * 0.9;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uMist, a);
}
`;

export interface MistPatch {
  /** 这一处雾有多厚（米） */ thick: number;
  /** 属于哪一片（0…3，各片的多少分开给） */ region: number;
  /** 一缕多长、多宽（米） */ long: number; wide: number;
}

/** 攒雾的网格：一带、一片、一圈 */
export class MistGeo {
  private pos: number[] = []; private arg: number[] = []; private dom: number[] = []; private sc: number[] = []; private idx: number[] = [];
  /** u、v：疏密取在哪；tx、tz：u 朝着世界里的哪个方向 */
  private v(x: number, y: number, z: number, edge: number, u: number, vv: number, tx: number, tz: number, o: MistPatch, half = 0): number {
    this.pos.push(x, y, z); this.arg.push(o.thick, edge, o.region, half); this.dom.push(u, vv, tx, tz); this.sc.push(1 / o.long, 1 / o.wide);
    return this.pos.length / 3 - 1;
  }
  /** 沿一条线铺一带（溪、河）：每个点给中线、往两边各铺多宽、底面的高。两头收尖；一缕缕顺着线走 */
  ribbon(pts: Array<{ x: number; z: number; y: number; half: number }>, o: MistPatch) {
    const n = pts.length, T = [-1, -0.5, 0, 0.5, 1];
    let prev = -1, s = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], p = pts[i];
      let tx = b.x - a.x, tz = b.z - a.z;
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      const end = Math.min(1, Math.min(i, n - 1 - i) / 3);
      const row = this.pos.length / 3;
      for (let k = 0; k < 5; k++) this.v(p.x - tz * p.half * T[k], p.y, p.z + tx * p.half * T[k], end, s, p.half * T[k], tx, tz, o, p.half);
      if (prev >= 0) for (let k = 0; k < 4; k++) this.idx.push(prev + k, row + k, row + k + 1, prev + k, row + k + 1, prev + k + 1);
      prev = row;
    }
  }
  /** 一大片（田、滩）：按格点铺，底面的高现取；keep 给 0…1（这一处要几成），边上一圈自己淡出。一缕缕东西向 */
  sheet(x0: number, x1: number, z0: number, z1: number, cell: number, yAt: (x: number, z: number) => number, o: MistPatch, keep?: (x: number, z: number) => number) {
    const nx = Math.max(2, Math.round((x1 - x0) / cell)), nz = Math.max(2, Math.round((z1 - z0) / cell)), base = this.pos.length / 3;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz;
      const edge = Math.min(1, Math.min(i, nx - i, j, nz - j) / 1.5) * (keep ? keep(x, z) : 1);
      this.v(x, yAt(x, z), z, edge, x, z, 1, 0, o);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const a = base + i * (nz + 1) + j, b = a + nz + 1;
      this.idx.push(a, b + 1, b, a, a + 1, b + 1);
    }
  }
  /** 一圈（池上）：椭圆，外面再淡出 pad 米 */
  disc(x: number, z: number, rx: number, rz: number, y: number, pad: number, o: MistPatch) {
    const seg = 20, c = this.v(x, y, z, 1, x, z, 1, 0, o), ring: number[][] = [[], []];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      ring[0].push(this.v(x + ca * rx * 0.6, y, z + sa * rz * 0.6, 1, x + ca * rx * 0.6, z + sa * rz * 0.6, 1, 0, o));
      ring[1].push(this.v(x + ca * (rx + pad), y, z + sa * (rz + pad), 0, x + ca * (rx + pad), z + sa * (rz + pad), 1, 0, o));
    }
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      this.idx.push(c, ring[0][k1], ring[0][k], ring[0][k], ring[0][k1], ring[1][k1], ring[0][k], ring[1][k1], ring[1][k]);
    }
  }
  get tris() { return this.idx.length / 3; }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aM', new THREE.Float32BufferAttribute(this.arg, 4));
    g.setAttribute('aN', new THREE.Float32BufferAttribute(this.dom, 4));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(this.sc, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

export interface MistOpts {
  /** 手机上省一层疏密 */ low?: boolean;
  /** 浓度（每米淡去多少）；一条视线在雾里最多算多长（米） */ dens?: number; reach?: number;
  /** 近处从多远到多远渐渐罩上 */ near?: [number, number];
}
export class Mist {
  mesh: THREE.Mesh;
  /** 各片此刻的多少（0 没有，1 晨雾那么多，再往上是雾天） */
  amount = new THREE.Vector4(0, 0, 0, 0);
  private drift = new THREE.Vector2();
  private mat: THREE.ShaderMaterial;
  constructor(geo: THREE.BufferGeometry, o: MistOpts = {}) {
    this.mat = new THREE.ShaderMaterial({
      defines: o.low ? { MIST_LOW: 1 } : {},
      uniforms: {
        ...U,
        uAmt: { value: this.amount },
        uMistP: { value: new THREE.Vector4(o.dens ?? 0.5, o.reach ?? 10, o.near?.[0] ?? 3.5, o.near?.[1] ?? 13) },
        uDrift: { value: this.drift },
      },
      vertexShader: MIST_V, fragmentShader: MIST_F,
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.layers.set(FX_LAYER);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.mesh.name = 'mist';
  }
  /** 雾慢慢地走：溪上的顺着溪往下游挪，田上的往东挪；有风时快一点 */
  update(dt: number, wind: number) {
    const sp = 0.14 + wind * 1.3;
    this.drift.x -= sp * dt; this.drift.y += sp * 0.12 * dt;
    this.mesh.visible = this.amount.x + this.amount.y + this.amount.z + this.amount.w > 0.004;
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
