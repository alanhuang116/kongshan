/**
 * 炊烟、茶烟。一缕烟是一笔：细细地从屋脊起，越高越宽越淡，被风带斜，到顶上顺着风平铺开去，化进纸里。
 *
 * 不是一团团的粒子。每一缕是一条始终侧对着看画人的带子：中线是算出来的（升、斜、左右摆，全在顶点着色器里），
 * 带子里画的是三两根烟丝——起处并成一笔，往上各自游走、分开，时浓时淡、时断时续，丝与丝之间露出纸（飞白）；
 * 烟丝的样子跟着烟一起往上走。到了顶上带子压扁（横里宽、竖里薄），顺着风拉成平平的一层。
 * 烟有头有尾：刚点着时烟头一点点升上去；灭了以后起处先断，余烟接着走完——所以每一缕记着「此刻从哪到哪」。
 * 柴烟白天是带一点赭的淡墨（比纸深），夜里是比夜色浅的一抹；水汽（茶炉）是比纸白的雾色，只在深色的东西前面看得见。
 * 所有的烟并成一次绘制。
 */
import * as THREE from 'three';
import { FX_LAYER, FX_PARS, INK_PARS, U } from '../ink/ink';

/** 一缕分几段 */
const SEG = 28;

const SMOKE_V = /* glsl */ `
${INK_PARS}
uniform vec4 uWind;
attribute vec4 aSrc; attribute vec4 aShape; attribute vec4 aLife;
varying vec2 vUv; varying vec4 vA; varying vec3 vF; varying float vZ;
// 一缕烟走的路（s 从 0 起处到 1 散尽处）：x 往上几成、y 顺风出去几成（都以「升多高」为一）。
// 往上是先快后慢（热气散了就不再升），顺风是先慢后快（渐渐被风带上）：起处近乎直立，越高越斜，到顶上平平地铺出去。
// big：是一缕炊烟（1）还是屋里的一小缕水汽（0，几乎不受风）
vec2 track(float s, float big) {
  float rise = (1.0 - exp(-3.4 * s)) / 0.9666;
  return vec2(rise, mix(0.2, 0.45 + 3.0 * uWind.z, big) * (s - 0.92 * rise * 0.2843) + big * (0.35 + 2.0 * uWind.z) * pow(smoothstep(0.5, 1.0, s), 2.0));
}
// 中线。pl：顺着烟走了多远（米）；flow：烟的样子（摆、烟丝）往上走了多远
vec3 centre(float s, float big, float ph0, float flow, out float pl) {
  float h = aShape.y;
  vec2 tr = track(s, big);
  pl = h * (tr.x + tr.y);
  // 摆：烟走的不是直线，袅袅地上去
  float ph = (pl - flow) / mix(0.35, 4.5, big) + ph0;
  vec2 wob = vec2(in3(vec3(ph, ph0, 0.5)), in3(vec3(ph * 0.83 + 9.0, 0.5, ph0))) - 0.5;
  float amp = (aShape.x + h * (0.02 + 0.065 * tr.x)) * smoothstep(0.0, 0.08, s);
  vec3 c = aSrc.xyz + vec3(0.0, h * tr.x + wob.y * amp * 0.4, 0.0);
  c.xz += uWind.xy * (h * tr.y + wob.y * amp) + vec2(-uWind.y, uWind.x) * (wob.x * amp * 2.0);
  return c;
}
void main() {
  float s = position.y, h = aShape.y;
  float big = smoothstep(1.5, 8.0, h), ph0 = aSrc.w * 37.0, pl, p1;
  // 样子往上走的快慢：取这一缕从头走到尾的平均
  vec2 end = track(1.0, big);
  float flow = h * (end.x + end.y) * uTime / aShape.w;
  vec3 c = centre(s, big, ph0, flow, pl);
  vec3 t = normalize(centre(s + 0.03, big, ph0, flow, p1) - centre(s - 0.03, big, ph0, flow, p1));
  // 粗细：起处细，越高越粗；到顶上压扁了平铺出去（横里宽、竖里薄）
  float rad = aShape.x * (1.0 + 1.2 * s) + h * (0.045 * s + 0.09 * pow(s, 2.2));
  float fl = smoothstep(0.35, 0.9, s) * big;
  float ra = rad * (1.0 + 1.5 * fl), rb = rad * (1.0 - 0.6 * fl);
  vec3 hz = cross(t, vec3(0.0, 1.0, 0.0));
  float hl = length(hz);
  hz = hl > 1e-3 ? hz / hl : vec3(1.0, 0.0, 0.0);
  vec3 bz = cross(t, hz);
  vec3 toCam = normalize(cameraPosition - c);
  vec3 side = cross(t, toCam);
  float sl = length(side);
  side /= max(sl, 1e-4);
  float da = ra * dot(side, hz), db = rb * dot(side, bz);
  float hw = sqrt(da * da + db * db);
  vec3 w = c + side * (hw * position.x);
  vec4 v = viewMatrix * vec4(w, 1.0);
  vZ = -v.z;
  gl_Position = projectionMatrix * v;
  vUv = vec2(position.x, s);
  // 烟丝的样子顺着烟走的坐标（炊烟的烟丝三米上下一个起伏，水汽的二十几厘米）；z：升到几成高了
  vF = vec3((pl - flow) / mix(0.25, 3.0, big), aSrc.w * 61.0, track(s, big).x);
  // 浓淡：起处一点点显出来（头二十来厘米；不然像是齐根切断的），越散越淡；烟头、烟尾
  float a = aLife.z * smoothstep(0.0, clamp(0.06 / h, 0.012, 0.12), s) * pow(1.0 - s, 0.55);
  a *= mix(1.0, smoothstep(aLife.x, aLife.x + 0.12, s), step(0.0005, aLife.x)) * (1.0 - smoothstep(aLife.y - min(0.25, aLife.y * 0.6), aLife.y, s));
  // 顺着烟看过去时带子没有宽度：淡掉
  a *= smoothstep(0.03, 0.25, sl);
  // 远了化进雾里
  float fog = inkFogK(c);
  vA = vec4(a * (1.0 - 0.75 * fog), aShape.z, fog, s);
}
`;
const SMOKE_F = /* glsl */ `
${INK_PARS}
${FX_PARS}
uniform vec3 uPig;
varying vec2 vUv; varying vec4 vA; varying vec3 vF; varying float vZ;
void main() {
  if (vA.x < 0.004) discard;
  float x = vUv.x, s = vUv.y, f = vF.x, sd = vF.y;
  // 起处是一整笔，升到三四成高就分成几根各走各的烟丝
  float open = smoothstep(0.03, 0.42, vF.z), keep = 1.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // 这一丝在带子里左右游走
    float c = (in3(vec3(f * 0.55 + fi * 7.3, sd + fi * 3.1, 0.5)) - 0.5) * (1.1 + 0.35 * fi) * open;
    // 头一根是主笔：粗一些、不断；另两根细，时浓时淡、时断时续（越往上断得越多）
    float wd = mix(0.72, i == 0 ? 0.42 : 0.2 + 0.07 * fi, open);
    float k = in3(vec3(f * 1.25 + 11.0 + fi * 5.7, sd * 1.7, 3.0 + fi));
    k = smoothstep(0.22 + 0.2 * s, 0.66 + 0.1 * s, k + 0.4 * (1.0 - open));
    if (i == 0) k = 0.62 + 0.38 * k;
    float d = (x - c) / wd;
    keep *= 1.0 - exp(-d * d * 2.4) * k * 0.85;
  }
  // 两层：底下一层淡淡的白（烟本身——衬着深色的山、树、屋看得见，这是留白），
  // 上面几根淡墨的烟丝（衬着天、衬着纸看得见）。先染一道，再提几根丝
  float w = 1.0 - x * x, fil = 1.0 - keep, veil = (0.35 + 0.65 * open) * exp(-x * x * 1.6);
  float a = max(fil * 0.8, veil * 0.5) * w * w * vA.x * fxSeen(vZ, 0.3 + 1.5 * s);
  if (a < 0.004) discard;
  // 柴烟的烟丝：纸 × 淡墨（丝心浓一点）；夜里整缕是比夜色浅的一抹。水汽：比纸白
  vec3 pale = mix(uMist, uLight, 0.4);
  vec3 wood = mix(mix(pale, uPaper * pow(uPig, vec3(0.6 + 0.8 * fil)), smoothstep(0.08, 0.5, fil)), mix(uMist, uLight, 0.22), uNight);
  vec3 col = mix(pale, wood, vA.y);
  col = mix(col, uMist, vA.z);
  gl_FragColor = vec4(col, a);
}
`;

export interface WispOpts {
  /** 起处多粗（米） */ size?: number;
  /** 升多高（米） */ rise?: number;
  /** 多少（0…1） */ amount?: number;
  /** 0 冷白的水汽 … 1 柴烟 */ warm?: number;
}
export interface Wisp { on: boolean; amount: number; pos: THREE.Vector3; dispose(): void }

interface Strand { s0: number; s1: number; amt: number; seed: number; k: number; dx: number; dz: number }
class WispImpl implements Wisp {
  on = true; dead = false;
  strands: Strand[] = [];
  constructor(public pos: THREE.Vector3, public amount: number, public size: number, public rise: number, public warm: number, public life: number) {}
  dispose() { this.dead = true; this.on = false; }
}

export class Plumes {
  mesh: THREE.Mesh;
  private wisps: WispImpl[] = [];
  private src: Float32Array; private shape: Float32Array; private life: Float32Array;
  private geo: THREE.InstancedBufferGeometry; private mat: THREE.ShaderMaterial;
  private seed = 0.137;
  constructor(private max = 24) {
    const g = new THREE.InstancedBufferGeometry();
    const pos = new Float32Array((SEG + 1) * 2 * 3), idx: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      // 起处的几段密一些（那里弯得急）
      const s = Math.pow(i / SEG, 1.25);
      pos.set([-1, s, 0, 1, s, 0], i * 6);
      if (i < SEG) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    this.src = new Float32Array(max * 4); this.shape = new Float32Array(max * 4); this.life = new Float32Array(max * 4);
    g.setAttribute('aSrc', new THREE.InstancedBufferAttribute(this.src, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aShape', new THREE.InstancedBufferAttribute(this.shape, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.InstancedBufferAttribute(this.life, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uPig: { value: new THREE.Color(0.81, 0.79, 0.76) } },
      vertexShader: SMOKE_V, fragmentShader: SMOKE_F,
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.layers.set(FX_LAYER);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'smoke';
  }
  get tris() { return this.geo.instanceCount * SEG * 2; }

  /**
   * 起一缕。strands：这一缕由几笔合成（炊烟两笔：一粗一细，各摆各的）；steady：一出场就已经升到顶了（不是从零冒起）
   */
  add(pos: THREE.Vector3, o: WispOpts = {}, strands = 1, steady = false): Wisp {
    let used = 0;
    for (const w of this.wisps) used += w.strands.length;
    // 满了：给一个什么都不做的
    if (used + strands > this.max) return { on: false, amount: 0, pos: pos.clone(), dispose() { /* 无 */ } };
    const size = o.size ?? 0.07, rise = o.rise ?? 0.7;
    // 一缕从生到散多久：小的水汽两三秒，炊烟二十来秒
    const w = new WispImpl(pos, o.amount ?? 1, size, rise, o.warm ?? 0, 1.6 + rise * 1.5);
    for (let i = 0; i < strands; i++) {
      this.seed = (this.seed * 7.31 + 0.173) % 1;
      w.strands.push({ s0: 0, s1: steady ? 1 : 0, amt: steady ? w.amount : 0, seed: this.seed, k: i ? 0.72 : 1, dx: i ? (this.seed - 0.5) * size * 1.6 : 0, dz: i ? (((this.seed * 3.7) % 1) - 0.5) * size * 1.6 : 0 });
    }
    this.wisps.push(w);
    return w;
  }

  update(dt: number) {
    let n = 0;
    const S = this.src, H = this.shape, L = this.life;
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      const w = this.wisps[i], rate = dt / w.life;
      let live = false;
      for (let j = 0; j < w.strands.length; j++) {
        const st = w.strands[j], on = w.on && w.amount > 0.004;
        if (on && st.s0 <= 0) st.s1 = Math.min(1, st.s1 + rate);
        else if (st.s1 > 0) {
          // 灭了：起处先断，余烟接着往上走完；走完了才能再起
          st.s0 += rate;
          if (st.s0 >= st.s1) { st.s0 = 0; st.s1 = 0; }
        }
        if (on) st.amt += (w.amount - st.amt) * Math.min(1, dt * 1.2);
        if (st.s1 <= 0) continue;
        live = true;
        const k = n * 4;
        S[k] = w.pos.x + st.dx; S[k + 1] = w.pos.y; S[k + 2] = w.pos.z + st.dz; S[k + 3] = st.seed;
        // 着色器里要的是半径
        H[k] = w.size * 0.5 * st.k; H[k + 1] = w.rise * (st.k < 1 ? 0.86 : 1); H[k + 2] = w.warm; H[k + 3] = w.life;
        L[k] = st.s0; L[k + 1] = st.s1; L[k + 2] = st.amt * (st.k < 1 ? 0.8 : 1); L[k + 3] = 0;
        n++;
      }
      if (w.dead && !live) this.wisps.splice(i, 1);
    }
    const g = this.geo;
    g.instanceCount = n;
    if (n) { g.attributes.aSrc.needsUpdate = true; g.attributes.aShape.needsUpdate = true; g.attributes.aLife.needsUpdate = true; }
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
