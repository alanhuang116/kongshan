/**
 * 山石的画法（远山、冈峦、石峰共用）。底子与 ink.ts 的淡彩一样——纸 × 颜料^浓度、阴阳两分、顺坡而下的皴——
 * 多一样：积墨是事先算好、记在顶点上的（aInk：山脊处 1，往下淡到 0），在罩过雾之后再压上去。
 * 所以山头从云雾里露出来的那一截仍是浓的（云断山腰、层峦叠嶂），又不必靠满屏的那一遍去找山脊。
 *
 * 顶点色仍是乘在颜料上的（沟里的墨、林木的绿意）；另有 keep：远了以后留几成颜色（石绿、花青那一点意思）。
 */
import * as THREE from 'three';
import { INK_PARS, PIG, U, type RGB } from '../../ink/ink';

const STONE_V = /* glsl */ `
attribute float aInk;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vInk; varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vC = color;
  vInk = aInk;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const STONE_F = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${INK_PARS}
uniform vec3 uPig; uniform vec4 uP; uniform vec4 uQ; uniform vec4 uC; uniform vec3 uInkPig; uniform vec4 uK; uniform vec4 uM;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vInk; varying vec2 vUv;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  // 水渍：一粗一细两层不匀
  float n0 = in3(vW * uQ.y), n1 = in3(vW * uQ.y * 0.21 + 7.3);
  // 阴阳向背：两分，交界跟着水渍走
  float lit = smoothstep(-0.2, 0.24, dot(N, uKey) + (n0 - 0.5) * 0.5);
  lit = mix(lit, 1.0, uP.z);
  float dens = uP.x * mix(uP.y, 1.0, lit) * (0.8 + 0.42 * n1) * (1.0 + 0.3 * uWet);
  float extra = 0.0;
  // 皴：顺着坡往下的长线，时断时续，背光处密（与 ink.ts 的一样；uC.y 是笔触的大小）
  if (uC.x > 0.0) {
    float sc = 1.0 / max(uC.y, 1e-3);
    vec2 t = normalize(N.zx * vec2(1.0, -1.0) + vec2(1e-4));
    vec3 q = vW * sc;
    float a1 = dot(q.xz, t), a2 = dot(q.xz, N.xz);
    float ph = a1 * 1.7 + (in3(vec3(a1 * 0.45, q.y * 0.3, a2 * 0.4)) - 0.5) * 2.4 + n1 * 1.3;
    float w1 = fwidth(ph) * 0.8 + 0.035, id = floor(ph);
    float ln = (1.0 - smoothstep(w1 * 0.35, w1, abs(fract(ph) - 0.5))) * smoothstep(0.34, 0.58, in3(vec3(id * 3.7, q.y * 0.8 + id * 1.3, 2.0)) + 0.3 * (1.0 - lit));
    float ph2 = a1 * 4.9 + (in3(vec3(a1 * 1.1 + 4.0, q.y * 0.7, a2)) - 0.5) * 2.0;
    float w2 = fwidth(ph2) * 0.8 + 0.05, id2 = floor(ph2);
    ln += 0.55 * (1.0 - smoothstep(w2 * 0.35, w2, abs(fract(ph2) - 0.5))) * smoothstep(0.45, 0.66, in3(vec3(id2 * 5.1, q.y * 1.7 + id2, 7.0)) + 0.3 * (1.0 - lit));
    // 笔断开：一笔只拉一小段（uM.z 每米几断）
    if (uM.z > 0.0) ln *= smoothstep(0.42, 0.62, in3(vec3(id * 2.3, vW.y * uM.z + id * 0.7, 9.0)));
    // 笔缩得比一个像素还细时淡掉（远山无皴）
    extra += uC.x * min(ln, 1.3) * uP.x * uP.y * (0.95 - 0.55 * lit) * smoothstep(0.99, 0.75, N.y) * (1.0 - smoothstep(0.35, 0.9, fwidth(ph2)));
  }
  // 横的层缝（石峰）：每条棱（uv 的 u 取整是第几条）各在各的高度上断开几道，缝不贯通；上下两层石略有深浅。uC.z 层多厚，uC.w 深浅
  if (uC.w > 0.0) {
    float rib = floor(vUv.x), fx = fract(vUv.x), face = step(fx, 0.95);
    float ly = vW.y / uC.z + ih(vec3(rib, 3.0, 7.0)) * 5.0, k = floor(ly + 0.5);
    float seam = 1.0 - smoothstep(0.0, fwidth(vW.y) / uC.z * 1.3 + 0.025, abs(ly - k));
    vec3 hk = ih3(vec3(k * 1.37 + 0.5, rib * 2.11 + 0.5, 5.0));
    float x0 = hk.y * 0.62, has = step(0.4, hk.x) * smoothstep(x0 - 0.05, x0, fx) * (1.0 - smoothstep(x0 + 0.28 + hk.z * 0.5, x0 + 0.33 + hk.z * 0.5, fx));
    extra += uC.w * seam * has * face * uP.x * uP.y * 1.7;
    dens *= 1.0 + uC.w * 0.7 * (ih(vec3(floor(ly), rib, 2.0)) - 0.5) * face;
  }
  // 点苔：石上一簇簇的墨点——聚在棱顶、台沿、积墨重的地方（uM.x 点多大，uM.y 多少）
  if (uM.y > 0.0) {
    vec2 ce = inkCell(vW / uM.x * vec3(1.0, 1.35, 1.0));
    float patchy = smoothstep(0.5, 0.72, in3(vW / (uM.x * 9.0) + 2.7)) * smoothstep(0.12, 0.6, vInk + 0.25 * n1);
    extra += uM.y * step(0.4, ce.y) * smoothstep(0.42, 0.56, ce.x) * patchy * uP.x * uP.y * 2.6;
  }
  vec3 c = uPaper * pow(clamp(uPig * vC, vec3(0.002), vec3(1.0)), vec3(max(dens, 0.0))) * pow(uPig, vec3(extra));
  // 雪：朝上的面留白
  float sn = 0.0;
  if (uSnow > 0.001 && uQ.w > 0.0) {
    sn = smoothstep(0.62 - uSnow * 0.3, 0.9 - uSnow * 0.25, N.y + (n0 - 0.5) * 0.35) * min(1.0, uSnow * 1.5) * uQ.w;
    c = mix(c, uLight * vec3(0.975, 0.98, 0.99), sn);
  }
  c = inkFar(c, vW, uP.w);
  float fk = inkFogK(vW);
  c = mix(c, uMist, fk);
  // 积墨：罩在雾之后。uK.x 山脊处几层，uK.y 被雾淡去几成，uK.z 近处减几成（走到山脚下不要一片黑）
  float nearK = 1.0 - uK.z * (1.0 - smoothstep(uK.w * 0.4, uK.w, distance(vW, cameraPosition)));
  c *= pow(uInkPig, vec3(vInk * uK.x * (1.0 - fk * uK.y) * (1.0 - 0.8 * sn) * nearK));
  gl_FragColor = vec4(c, 1.0);
  gAux = vec4(normalize(mat3(viewMatrix) * N).xy * 0.5 + 0.5, 0.0, uQ.x);
}
`;

export interface StoneOpts {
  /** 颜料与浓度（同 wash） */ pig?: RGB; dens?: number;
  /** 背光面是受光面的几倍浓；flat 1 即平涂 */ shade?: number; flat?: number;
  /** 远了以后留几成颜色（0 全褪成墨色） */ keep?: number;
  /** 勾线的轻重 */ line?: number;
  /** 水渍的粗细（每米几个起伏） */ grain?: number;
  /** 皴的深浅、笔触的大小（米） */ cun?: number; cunSize?: number;
  /** 横的层缝（石峰；几何的 uv.x 取整要是「第几条棱」）：[每层多厚（米）, 深浅] */ strata?: [number, number];
  /** 点苔：[点多大（米）, 多少] */ moss?: [number, number];
  /** 皴的笔断得勤不勤（每米几断；0 不断——远山用长线，石柱用短笔） */ cunBreak?: number;
  /** 积雪 */ snow?: number;
  /** 积墨的墨色（偏花青）；山脊处几层；被雾淡去几成（1 全随雾，0 不随） */ inkPig?: RGB; ink?: number; inkFog?: number;
  /** 走近了积墨减几成、从多远起减 */ inkNear?: [number, number];
  side?: THREE.Side;
}
/** 山石的材质。几何上要有 aInk（每个顶点一个数：积墨几成） */
export function stoneMat(o: StoneOpts = {}): THREE.ShaderMaterial {
  const p = o.pig ?? PIG.mo, ip = o.inkPig ?? [0.6, 0.61, 0.635];
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uPig: { value: new THREE.Color(p[0], p[1], p[2]) },
      uP: { value: new THREE.Vector4(o.dens ?? 0.3, o.shade ?? 1.9, o.flat ?? 0, o.keep ?? 0) },
      uQ: { value: new THREE.Vector4(o.line ?? 1, o.grain ?? 0.01, 0, o.snow ?? 0.7) },
      uC: { value: new THREE.Vector4(o.cun ?? 0, o.cunSize ?? 1, o.strata?.[0] ?? 1, o.strata?.[1] ?? 0) },
      uInkPig: { value: new THREE.Color(ip[0], ip[1], ip[2]) },
      uK: { value: new THREE.Vector4(o.ink ?? 2.4, o.inkFog ?? 1, o.inkNear?.[0] ?? 0, o.inkNear?.[1] ?? 1) },
      uM: { value: new THREE.Vector4(o.moss?.[0] ?? 1, o.moss?.[1] ?? 0, o.cunBreak ?? 0, 0) },
    },
    vertexShader: STONE_V, fragmentShader: STONE_F,
    vertexColors: true,
    side: o.side ?? THREE.FrontSide,
  });
}
