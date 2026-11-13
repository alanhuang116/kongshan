/**
 * 一帧是怎么画出来的（四步）：
 *   一、设色 —— 把三维的东西画进两张图：一张是颜色（各材质按 ink.ts 的画法自己着色），一张记着每一点的朝向与「勾不勾线」；另有深度。
 *   二、勾线、积墨 —— 山：每一重山从山脊往下由浓到淡（层峦叠嶂靠它）。再在远近突变处（轮廓）与朝向突变处（转折）落墨线。线的粗细、浓淡、抖动、飞白跟着物上的位置变（不是屏幕上一层均匀的描边）；
 *              线归前面那个东西管（花叶这类「没骨」的不勾）；远处、雾里的线淡下去。颜色那一层略微晕开，色块的边上积一点水痕。
 *   三、罩染 —— 雾、烟、光晕、飞絮这些画在线之上（雾会把后面的线也罩淡），它们自己去比深度。
 *   四、装裱 —— 纸纹压在整张画上；画心的四边不齐地褪进纸里；转场时整幅淡成一片雾色。
 */
import * as THREE from 'three';
import { FX_LAYER, INK_PARS, U, setA2C } from './ink';

const AUX_CLEAR = new Float32Array([0.5, 0.5, 0, 0]);
const QUAD_V = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const LINE_F = /* glsl */ `
${INK_PARS}
uniform sampler2D tColor; uniform sampler2D tAux; uniform sampler2D tDepth;
uniform vec4 uView; uniform mat4 uProjInv; uniform mat4 uCamWorld; uniform vec3 uInk; uniform vec4 uLine; uniform float uSoft; uniform vec2 uCrest;
varying vec2 vUv;
vec3 nrm(vec4 a) { vec2 n = a.xy * 2.0 - 1.0; return vec3(n, sqrt(max(0.0, 1.0 - dot(n, n)))); }
// 钉在物上的起伏；远处按距离一级一级放大（两级之间过渡），不然缩成一片杂点
float lod3(vec3 wa, float fr, float f, float o) { return mix(in3(wa * f + o), in3(wa * 0.5 * f + o), fr); }
vec3 worldAt(vec2 uv, float d) {
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
}
void main() {
  vec2 px = uView.xy;
  float dC = texture2D(tDepth, vUv).x;
  vec3 w = worldAt(vUv, dC);
  float dist = distance(w, cameraPosition);
  // 笔的轻重、抖动：随物上的位置变
  float sl = log2(max(1.0, dist * 0.03)), lv = floor(sl), fr = sl - lv;
  vec3 wa = w * exp2(-lv);
  float press = lod3(wa, fr, 0.6, 1.3);
  vec2 uv = vUv + (vec2(lod3(wa, fr, 2.6, 11.0), lod3(wa, fr, 2.6, 37.0)) - 0.5) * px * uLine.z;
  vec2 o = px * uLine.x * mix(0.6, 1.5, press) * clamp(1.7 - dist * 0.014, 0.8, 1.6);
  float d0 = texture2D(tDepth, uv).x;
  float d1 = texture2D(tDepth, uv + vec2(o.x, 0.0)).x, d2 = texture2D(tDepth, uv - vec2(o.x, 0.0)).x;
  float d3 = texture2D(tDepth, uv + vec2(0.0, o.y)).x, d4 = texture2D(tDepth, uv - vec2(0.0, o.y)).x;
  vec4 a0 = texture2D(tAux, uv);
  vec4 a1 = texture2D(tAux, uv + vec2(o.x, 0.0)), a2 = texture2D(tAux, uv - vec2(o.x, 0.0));
  vec4 a3 = texture2D(tAux, uv + vec2(0.0, o.y)), a4 = texture2D(tAux, uv - vec2(0.0, o.y));
  // 线归五点里最近的那个东西
  float dn = d0, lw = a0.a;
  if (d1 < dn) { dn = d1; lw = a1.a; } if (d2 < dn) { dn = d2; lw = a2.a; }
  if (d3 < dn) { dn = d3; lw = a3.a; } if (d4 < dn) { dn = d4; lw = a4.a; }
  // 轮廓：深度在屏幕上的二阶差（平面上恒为零，斜着看地面也不会误勾），换算成相对的远近差
  float lap = (abs(d1 + d2 - 2.0 * d0) + abs(d3 + d4 - 2.0 * d0)) / max(1.0 - dn, 1e-6);
  float eD = smoothstep(0.045, 0.15, lap);
  // 转折：朝向差得多的地方
  vec3 n0 = nrm(a0);
  float nd = max(max(1.0 - dot(n0, nrm(a1)), 1.0 - dot(n0, nrm(a2))), max(1.0 - dot(n0, nrm(a3)), 1.0 - dot(n0, nrm(a4))));
  // （远山只勾轮廓，不勾山身上的转折）
  float eN = smoothstep(0.24, 0.5, nd) * min(min(a0.a, a1.a), min(a2.a, a3.a)) * 0.8 * (1.0 - smoothstep(700.0, 2200.0, dist));
  float e = max(eD * lw, eN);
  // 远处、雾里的线淡（远山无皴、远水无波）
  vec3 wn = worldAt(uv, dn);
  float a = e * uLine.y * (1.0 - inkFogK(wn)) * mix(0.6, 1.0, press);
  // 飞白：笔干的地方断断续续
  a *= mix(1.0, smoothstep(0.2, 0.52, lod3(wa, fr, 10.0, 0.0) + press * 0.45), uLine.w);

  // 颜色那一层：略微晕开；色块的边上积一点水痕
  vec3 c0 = texture2D(tColor, vUv).rgb;
  vec2 s = px * uSoft;
  vec3 cl = texture2D(tColor, vUv - vec2(s.x, 0.0)).rgb, cr = texture2D(tColor, vUv + vec2(s.x, 0.0)).rgb;
  vec3 cu = texture2D(tColor, vUv + vec2(0.0, s.y)).rgb, cd = texture2D(tColor, vUv - vec2(0.0, s.y)).rgb;
  vec3 c = (c0 * 2.0 + cl + cr + cu + cd) / 6.0;
  float pool = length(cl - cr) + length(cu - cd);
  c *= 1.0 - min(0.035, pool * 0.12);
  // 积墨：往上找自己这一重山的山脊（上面那一点忽然远了一截），离山脊越近墨越重
  float crest = texture2D(tAux, vUv).z;
  if (crest > 0.02) {
    float reach = uCrest.x * mix(0.6, 1.4, press), lo = 0.0, hi = -1.0;
    // 这一点上深度沿竖直方向的斜率（取上下两边里平顺的那一边）
    float s1 = texture2D(tDepth, vUv + vec2(0.0, px.y)).x - dC, s2 = dC - texture2D(tDepth, vUv - vec2(0.0, px.y)).x;
    float slope = abs(s1) < abs(s2) ? s1 : s2, dPrev = dC;
    for (int i = 1; i <= 8; i++) {
      float fi = float(i) / 8.0, off = reach * fi * fi;
      float dq = texture2D(tDepth, vUv + vec2(0.0, px.y * off)).x;
      float zq = 1.0 - dq, zpred = max(1.0 - (dPrev + slope * (off - lo)), 1e-7);
      if (zq > zpred * 1.06) break;
      if (zq < zpred * 0.965) { hi = off; break; }
      slope = mix(slope, (dq - dPrev) / (off - lo), 0.7);
      dPrev = dq; lo = off;
    }
    if (hi > 0.0) {
      float l2 = lo;
      for (int i = 0; i < 3; i++) {
        float mid = 0.5 * (l2 + hi);
        float zq = 1.0 - texture2D(tDepth, vUv + vec2(0.0, px.y * mid)).x, zpred = max(1.0 - (dPrev + slope * (mid - lo)), 1e-7);
        if (zq < zpred * 0.965) hi = mid; else l2 = mid;
      }
      float cw = pow(max(0.0, 1.0 - hi / reach), 1.6) * crest * (1.0 - inkFogK(w));
      c *= pow(vec3(0.6, 0.61, 0.635), vec3(cw * uCrest.y));
    }
  }
  c *= mix(vec3(1.0), uInk, clamp(a, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}
`;

const MOUNT_F = /* glsl */ `
uniform vec3 uPaper; uniform vec3 uFadeCol; uniform vec4 uMount; uniform vec2 uRes;
varying vec2 vUv;
float h2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 fc = vUv * uRes;
  // 纸纹：细颗粒、云一样的不匀、几根横着的长纤维
  float g = n2(fc * 0.9) * 0.45 + n2(fc * 0.21) * 0.3 + n2(vec2(fc.x * 0.035, fc.y * 0.8) + 9.0) * 0.25;
  float grain = 1.0 - uMount.y * (g - 0.42) * 1.6;
  // 画心的边：四边不齐地褪进纸里
  vec2 e = min(vUv, 1.0 - vUv) * uRes / uRes.y;
  float nb = n2(vUv * uRes / uRes.y * 5.0) * 0.6 + n2(vUv * uRes / uRes.y * 17.0) * 0.4;
  float m = uMount.x > 0.0005 ? smoothstep(0.0, uMount.x, min(e.x, e.y) - (nb - 0.25) * uMount.x * 0.8) : 1.0;
  // 结果 = 纸 ×（1 − m）+ 画 × 纸纹 × m，再整幅淡成雾色（转场）
  vec3 rgb = uPaper * grain * (1.0 - m);
  float a = grain * m;
  gl_FragColor = vec4(mix(rgb, uFadeCol, uMount.z), a * (1.0 - uMount.z));
}
`;

export class Painter {
  private rt: THREE.WebGLRenderTarget;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private line: THREE.ShaderMaterial; private mount: THREE.ShaderMaterial;
  private size = new THREE.Vector2();
  /** 线：粗细（像素，按一倍屏算）、浓淡、抖动、飞白 */
  lineW = 1.0; lineK = 0.92; wobble = 1.6; dry = 0.55;
  /** 颜色晕开的半径（像素） */
  soft = 1.1;
  /** 积墨：从山脊往下淡到没有的距离（像素，按 900 高算）、浓度 */
  crestReach = 120; crestK = 2.4;
  /** 画心四边褪进纸里的宽度（占画面高的几成）；纸纹的深浅；整幅淡成雾色（0…1） */
  border = 0.05; grain = 0.07; fade = 0;
  fadeColor = new THREE.Color(0.93, 0.935, 0.94);

  constructor(private renderer: THREE.WebGLRenderer, public samples: number) {
    setA2C(samples > 0);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { count: 2, samples, depthBuffer: true, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.rt.depthTexture = new THREE.DepthTexture(4, 4);
    this.rt.depthTexture.type = THREE.UnsignedIntType;
    this.rt.depthTexture.minFilter = this.rt.depthTexture.magFilter = THREE.NearestFilter;
    for (const t of this.rt.textures) t.colorSpace = THREE.NoColorSpace;
    this.line = new THREE.ShaderMaterial({
      uniforms: {
        ...U, tColor: { value: this.rt.textures[0] }, tAux: { value: this.rt.textures[1] }, tDepth: { value: this.rt.depthTexture },
        uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uLine: { value: new THREE.Vector4() }, uSoft: { value: 1 }, uCrest: { value: new THREE.Vector2() },
      },
      vertexShader: QUAD_V, fragmentShader: LINE_F, depthTest: false, depthWrite: false,
    });
    this.mount = new THREE.ShaderMaterial({
      uniforms: { uPaper: U.uPaper, uFadeCol: { value: this.fadeColor }, uMount: { value: new THREE.Vector4() }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: QUAD_V, fragmentShader: MOUNT_F, depthTest: false, depthWrite: false, transparent: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.SrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    });
    this.quad.frustumCulled = false;
    U.tDepth.value = this.rt.depthTexture;
  }

  setSize(w: number, h: number) {
    if (this.size.x === w && this.size.y === h) return;
    this.size.set(w, h);
    this.rt.setSize(w, h);
  }

  /** 先把着色器都编好（对着「画进两张图」这个去处编，否则头一帧要重编一遍） */
  async compile(scene: THREE.Scene, camera: THREE.Camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    try { await r.compileAsync(scene, camera); } catch { /* 老浏览器没有异步编译 */ }
    r.setRenderTarget(null);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const r = this.renderer, buf = r.getDrawingBufferSize(new THREE.Vector2());
    this.setSize(buf.x, buf.y);
    U.uView.value.set(1 / buf.x, 1 / buf.y, camera.near, camera.far);
    const mask = camera.layers.mask;
    // 一、设色
    camera.layers.mask = mask & ~(1 << FX_LAYER);
    r.setRenderTarget(this.rt);
    r.setClearColor(U.uPaper.value as THREE.Color, 1);
    r.clear();
    // 第二张图（朝向、积墨、勾线）清成「朝着看画人、不积墨、不勾线」
    (r.getContext() as WebGL2RenderingContext).clearBufferfv(0x1800, 1, AUX_CLEAR);
    r.render(scene, camera);
    // 二、勾线（直接落到屏幕上）
    r.setRenderTarget(null);
    const u = this.line.uniforms;
    (u.uProjInv.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (u.uCamWorld.value as THREE.Matrix4).copy(camera.matrixWorld);
    const k = buf.y / 900;
    (u.uLine.value as THREE.Vector4).set(this.lineW * Math.max(0.8, k), this.lineK, this.wobble * Math.max(0.8, k), this.dry);
    u.uSoft.value = this.soft * Math.max(0.8, k);
    (u.uCrest.value as THREE.Vector2).set(this.crestReach * k, this.crestK);
    this.quad.material = this.line;
    // 勾线的着色器里要用 cameraPosition：借主镜头来画这张满屏的面（顶点着色器不用它的矩阵）
    r.render(this.quad, camera);
    // 三、罩染
    const auto = r.autoClear;
    r.autoClear = false;
    camera.layers.set(FX_LAYER);
    r.render(scene, camera);
    camera.layers.mask = mask;
    // 四、装裱
    const m = this.mount.uniforms;
    (m.uMount.value as THREE.Vector4).set(this.border, this.grain, this.fade, 0);
    (m.uRes.value as THREE.Vector2).copy(buf);
    this.quad.material = this.mount;
    r.render(this.quad, this.cam);
    r.autoClear = auto;
  }

  dispose() { this.rt.dispose(); this.line.dispose(); this.mount.dispose(); }
}
