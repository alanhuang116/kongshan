/**
 * 材质，以及所有材质共用的三样东西：
 *   雾 —— 不用 three 自带的雾。山里的雾是沉在低处的：按高度衰减（越高越薄），朝着日 / 月的方向染上光的颜色；
 *   风 —— 枝叶、幡、许愿带按顶点上的 sway 权重随风摆；
 *   雪与雨 —— 朝上的面积雪（uSnow）、淋湿（uWet：颜色变深、变亮滑）。
 * 做法是给每个材质的着色器里插几段（enhance），所有材质引用同一组 uniform（shared），改一处全场都变。
 */
import * as THREE from 'three';
import type { Textures, TexSet } from './tex';

export const shared = {
  uTime: { value: 0 },
  /** xy 风向（单位向量），z 强度，w 阵风的相位速度 */
  uWind: { value: new THREE.Vector4(0.8, 0.6, 0.12, 1) },
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uFogColor: { value: new THREE.Color(0.8, 0.84, 0.88) },
  uFogSun: { value: new THREE.Color(1, 0.95, 0.85) },
  /** x 低处的浓度，y 随高度衰减的快慢（1/米），z 雾面的高度，w 最浓能遮到几成 */
  uFogP: { value: new THREE.Vector4(0.0042, 0.04, -14, 0.97) },
  /** 不随高度变的那一点薄霭 */
  uFogDist: { value: 0.0012 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.5).normalize() },
  /** 屋里：天光照不进去的地方。A = (中心 x, 中心 z, 半宽, 半深)，B = (底, 顶, 暗几成, 0)。最多四间 */
  uRoomA: { value: [new THREE.Vector4(0, 0, -1, -1), new THREE.Vector4(0, 0, -1, -1), new THREE.Vector4(0, 0, -1, -1), new THREE.Vector4(0, 0, -1, -1)] },
  uRoomB: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
};

/** 登记一间屋子（世界坐标的盒子）：盒子里的面只受直射的日光与灯，天光压到 1−dark */
export function setRoom(i: number, cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, dark: number) {
  shared.uRoomA.value[i].set(cx, cz, hx, hz);
  shared.uRoomB.value[i].set(y0, y1, dark, 0);
}

const FOG_PARS_V = /* glsl */ `varying vec3 vFogPos;`;
const FOG_V = /* glsl */ `vFogPos = mvPosition.xyz;`;
export const FOG_PARS_F = /* glsl */ `
varying vec3 vFogPos;
uniform vec3 uFogColor; uniform vec3 uFogSun; uniform vec4 uFogP; uniform float uFogDist; uniform vec3 uSunDir;
vec3 ksFogAt(vec3 col, vec3 w) {
  float d = length(w);
  vec3 rd = w / max(d, 1e-4);
  float ry = abs(rd.y) < 2e-3 ? (rd.y < 0.0 ? -2e-3 : 2e-3) : rd.y;
  float a = uFogP.x * exp(-clamp((cameraPosition.y - uFogP.z) * uFogP.y, -6.0, 40.0)) * (1.0 - exp(-clamp(d * ry * uFogP.y, -40.0, 40.0))) / (ry * uFogP.y);
  a = max(a, 0.0) + d * uFogDist;
  float f = 1.0 - exp(-a);
  float s = pow(max(dot(rd, uSunDir), 0.0), 5.0);
  return mix(col, mix(uFogColor, uFogSun, s * 0.8), min(f, uFogP.w));
}
vec3 ksFog(vec3 col, vec3 viewPos) { return ksFogAt(col, transpose(mat3(viewMatrix)) * viewPos); }
`;
const FOG_F = /* glsl */ `gl_FragColor.rgb = ksFog(gl_FragColor.rgb, vFogPos);`;

const WIND_PARS = /* glsl */ `
attribute float sway;
uniform float uTime; uniform vec4 uWind;
`;
const WIND = /* glsl */ `
{
  vec3 wp = transformed;
  #ifdef USE_INSTANCING
    wp += instanceMatrix[3].xyz;
  #endif
  float ph = dot(wp.xz, vec2(0.11, 0.17));
  float t = uTime * uWind.w;
  float g = sin(t * 0.55 + ph) * 0.55 + sin(t * 1.43 + ph * 2.3 + wp.y * 0.21) * 0.3 + sin(t * 3.7 + ph * 6.1 + wp.y * 1.3) * 0.12;
  float k = uWind.z * sway * KS_WIND;
  transformed.xz += uWind.xy * k * (0.55 + g);
  transformed.y -= abs(g) * k * 0.22;
}
`;
const ROOM_PARS = /* glsl */ `
uniform vec4 uRoomA[4]; uniform vec4 uRoomB[4];
float ksRoom(vec3 p) {
  float k = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 d = abs(p.xz - uRoomA[i].xy) - uRoomA[i].zw;
    float inside = (1.0 - smoothstep(-0.06, -0.01, max(d.x, d.y))) * step(uRoomB[i].x, p.y) * (1.0 - smoothstep(uRoomB[i].y - 0.3, uRoomB[i].y, p.y));
    k = max(k, inside * uRoomB[i].z);
  }
  return k;
}
`;
const ROOM = /* glsl */ `
{
  float kr = ksRoom(cameraPosition + transpose(mat3(viewMatrix)) * vFogPos);
  reflectedLight.indirectDiffuse *= 1.0 - kr;
  reflectedLight.indirectSpecular *= 1.0 - kr * 0.8;
}
`;
const SURF_PARS = /* glsl */ `
uniform float uSnow; uniform float uWet;
float ksHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ksN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ksHash(i), ksHash(i + vec2(1, 0)), f.x), mix(ksHash(i + vec2(0, 1)), ksHash(i + vec2(1, 1)), f.x), f.y); }
`;
const SURF = /* glsl */ `
{
  mat3 ksIV = transpose(mat3(viewMatrix));
  vec3 ksWN = normalize(ksIV * normal);
  vec3 ksWP = cameraPosition + ksIV * vFogPos;
  #ifdef KS_SNOW
  if (uSnow > 0.001) {
    float n = ksN(ksWP.xz * 1.3) * 0.5 + ksN(ksWP.xz * 5.1) * 0.25;
    float s = smoothstep(0.82 - uSnow * 0.55, 0.98 - uSnow * 0.4, ksWN.y + n * 0.35) * min(1.0, uSnow * 1.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.925, 0.955), s);
    #ifdef STANDARD
      roughnessFactor = mix(roughnessFactor, 0.82, s); metalnessFactor *= 1.0 - s;
    #endif
    normal = normalize(mix(normal, normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)), s * 0.6));
  }
  #endif
  #ifdef KS_WET
  if (uWet > 0.001) {
    float up = smoothstep(0.25, 0.85, ksWN.y);
    float pud = smoothstep(0.42, 0.7, ksN(ksWP.xz * 0.45) * 0.7 + ksN(ksWP.xz * 1.9) * 0.3) * smoothstep(0.965, 0.995, ksWN.y);
    float w = uWet * (0.35 + 0.65 * up);
    diffuseColor.rgb *= mix(1.0, 0.56, w);
    #ifdef STANDARD
      roughnessFactor = mix(roughnessFactor, mix(0.34, 0.06, pud * up), w);
    #endif
    normal = normalize(mix(normal, normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0)), w * up * pud * 0.85));
  }
  #endif
}
`;

export interface Enhance { wind?: number; snow?: boolean; wet?: boolean }

/** 给一个内置材质加上寺里的雾（一定加）、风、雪、湿。可叠在已有的 onBeforeCompile 上 */
export function enhance<T extends THREE.Material>(m: T, o: Enhance = {}): T {
  if (m.userData.ks) return m;
  m.userData.ks = o;
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  const std = (m as unknown as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
  const surf = (o.snow || o.wet) && ((m as unknown as THREE.MeshLambertMaterial).isMeshLambertMaterial || std || (m as unknown as THREE.MeshPhongMaterial).isMeshPhongMaterial);
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uFogColor = shared.uFogColor; sh.uniforms.uFogSun = shared.uFogSun; sh.uniforms.uFogP = shared.uFogP;
    sh.uniforms.uFogDist = shared.uFogDist; sh.uniforms.uSunDir = shared.uSunDir;
    sh.vertexShader = sh.vertexShader.replace('#include <fog_pars_vertex>', FOG_PARS_V).replace('#include <fog_vertex>', FOG_V);
    const lit = sh.fragmentShader.includes('#include <lights_fragment_end>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_pars_fragment>', FOG_PARS_F + (surf ? SURF_PARS : '') + (lit ? ROOM_PARS : '')).replace('#include <fog_fragment>', FOG_F);
    if (lit) {
      sh.uniforms.uRoomA = shared.uRoomA; sh.uniforms.uRoomB = shared.uRoomB;
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
${ROOM}`);
    }
    if (o.wind) {
      sh.uniforms.uTime = shared.uTime; sh.uniforms.uWind = shared.uWind;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n#define KS_WIND ${o.wind.toFixed(3)}\n${WIND_PARS}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND}`);
    }
    if (surf) {
      sh.uniforms.uSnow = shared.uSnow; sh.uniforms.uWet = shared.uWet;
      sh.fragmentShader = `${o.snow ? '#define KS_SNOW\n' : ''}${o.wet ? '#define KS_WET\n' : ''}` + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${SURF}`);
    }
  };
  const key = `ks:${o.wind ?? 0}:${o.snow ? 1 : 0}:${o.wet ? 1 : 0}`;
  m.customProgramCacheKey = () => key + prevKey.call(m);
  return m;
}

/** 别处（子模块）做好的一组东西接进寺里：把里面所有内置材质都接上雾 */
export function adopt(obj: THREE.Object3D, o: Enhance = {}): THREE.Object3D {
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.material) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if ((m as THREE.ShaderMaterial).isShaderMaterial && !(m as THREE.RawShaderMaterial).isRawShaderMaterial && m.type === 'ShaderMaterial') continue;
      enhance(m, { ...o, ...(m.userData.enhance as Enhance | undefined) });
    }
  });
  return obj;
}

function withRepeat(s: TexSet, meters: number): TexSet {
  const f = (t: THREE.Texture) => { const c = t.clone(); c.repeat.set(1 / meters, 1 / meters); c.needsUpdate = true; return c; };
  return { map: f(s.map), normalMap: f(s.normalMap), orm: f(s.orm) };
}

export type Mats = ReturnType<typeof createMats>;
export function createMats(T: Textures) {
  const std = (set: TexSet | null, meters: number, p: THREE.MeshStandardMaterialParameters, e: Enhance = {}, useOrm = false, nScale = 1) => {
    const s = set ? withRepeat(set, meters) : null;
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.8, metalness: 0,
      ...(s ? { map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(nScale, nScale) } : {}),
      ...(s && useOrm ? { roughnessMap: s.orm, metalnessMap: s.orm, roughness: 1, metalness: 1 } : {}),
      ...p,
    });
    return enhance(m, e);
  };
  const out = { snow: true, wet: true };
  const mats = {
    /** 朱：柱、枋、斗栱 */
    wood: std(T.timber, 1, { color: 0x772b20, roughness: 0.76 }, { wet: true }),
    /** 深褐：门扇、椽望、窗棂、室内梁架 */
    woodDark: std(T.timber, 1, { color: 0x3a2a22, roughness: 0.8 }, { wet: true }),
    /** 素木：案、架、栏、扫帚 */
    woodPale: std(T.timber, 0.6, { color: 0x9a7d5c, roughness: 0.7 }),
    /** 椽头、栱眼壁上的白 */
    woodWhite: std(T.timber, 1, { color: 0xd9d4c8, roughness: 0.85 }),
    plaster: std(T.plaster, 3, { color: 0xf0efeb, roughness: 0.93 }, { wet: true }, false, 0.6),
    /** 殿内的壁：旧了的赭色（壁画褪尽后的底子） */
    mural: std(T.plaster, 3, { color: 0x8a6a4c, roughness: 0.95 }, {}, false, 0.6),
    /** 砖塔 */
    pagoda: std(T.plaster, 3, { color: 0xc9bca6, roughness: 0.95 }, { snow: true, wet: true }, false, 0.8),
    stone: std(T.stone, 1.5, { color: 0xffffff, roughness: 0.88 }, out, false, 0.55),
    flag: std(T.flagstone, 2, { color: 0xffffff, roughness: 0.86 }, out),
    paving: std(T.paving, 2.4, { color: 0xe9e6e0 }, out, true),
    /** 瓦：uv 由屋面几何直接给（u 一垄一格、v 一片一格），一张 4×4 */
    tile: (() => { const m = std(T.rooftile, 4, { color: 0xffffff }, out, true); return m; })(),
    /** 脊、瓦当、鸱尾：青灰的陶 */
    ridge: std(T.stone, 1.2, { color: 0x7c8187, roughness: 0.92, envMapIntensity: 0.5 }, out),
    bronze: std(T.bronze, 0.8, { color: 0xffffff }, { wet: true }, true),
    gold: std(T.gold, 0.9, { color: 0xffffff, envMapIntensity: 1.2 }, {}, true, 0.5),
    /** 贴金的字、钉、铺首：亮一些 */
    gilt: std(T.gold, 0.4, { color: 0xffe9b8, envMapIntensity: 1.4 }, {}, true, 0.3),
    lacquer: std(T.lacquer, 0.7, { color: 0x1a1513 }, {}, true, 0.5),
    lacquerRed: std(T.lacquer, 0.7, { color: 0x6f1c15 }, {}, true, 0.5),
    bark: std(T.bark, 1.2, { color: 0xffffff, roughness: 0.95 }, { snow: true, wet: true }),
    rock: std(T.rock, 3, { color: 0xb9bbb6, roughness: 0.92 }, out),
    ground: std(T.ground, 5, { color: 0xffffff, roughness: 0.96 }, out),
    clothYellow: std(T.cloth, 0.5, { color: 0xb07c33, roughness: 0.95 }),
    clothBrown: std(T.cloth, 0.5, { color: 0x5b3d2b, roughness: 0.95 }),
    clothGrey: std(T.cloth, 0.5, { color: 0x77756f, roughness: 0.95 }),
    clothRed: std(T.cloth, 0.5, { color: 0x8a2a20, roughness: 0.95 }),
    paper: std(T.paper, 0.6, { color: 0xe4e2dc, roughness: 0.94 }),
    ash: std(T.ash, 0.5, { color: 0xb9b3a8, roughness: 1 }),
    /** 窗纸、灯罩：自己发一点光（夜里随灯亮起来，由 atmos 调 emissiveIntensity） */
    lampPaper: std(T.paper, 0.6, { color: 0xf3ead8, emissive: 0xffb061, emissiveIntensity: 0, roughness: 0.9 }),
    /** 殿里的暗处（顶棚之上）：不反光的黑 */
    dark: enhance(new THREE.MeshBasicMaterial({ color: 0x050505 })),
  };
  return mats;
}

/** 由已有材质派生一个换了颜色 / 参数的（共用贴图） */
export function variant<T extends THREE.MeshStandardMaterial>(base: T, p: THREE.MeshStandardMaterialParameters): T {
  const m = base.clone() as T;
  m.setValues(p);
  m.userData = {};
  return enhance(m, (base.userData.ks as Enhance) ?? {});
}
