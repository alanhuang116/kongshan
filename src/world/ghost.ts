/**
 * 人被挡住时透出一个淡影：门柱、篱笆、树干、屋角这些东西挡在镜头与人之间的时候，人在它们后面透出一层淡墨的影子，
 * 手机上看得见自己在哪（镜头不为一根细柱子猛地往前一跳）。
 *
 * 做法：把行者那一张网（衣、头、手、鞋都在同一个几何里，见 avatar/loft.ts）再画一遍，画在最后那一层（FX_LAYER），
 * 每一点去比那一帧画好的深度：前面有东西、而且离得比人自己身上的起伏远（半米以上）才画——自己的手臂、衣袖挡着身子不算。
 * 影子是一层淡墨、带一道道斜的干笔（远看是影，近看是墨）。人隐去时（镜头贴到眼前、躺着看天）影子跟着隐去。
 */
import * as THREE from 'three';
import { FX_LAYER, FX_PARS, U } from './ink/ink';

const V = /* glsl */ `
varying float vZ;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const F = /* glsl */ `
${FX_PARS}
uniform vec3 uInk; uniform vec3 uLight; uniform float uNight; uniform float uA;
varying float vZ;
void main() {
  // 前面有东西、而且在人身前半米以外：被挡住了（自己的手臂、袖子挡着身子不算）
  float hidden = 1.0 - fxSeen(vZ - 0.5, 0.12);
  if (hidden < 0.02) discard;
  // 斜的干笔：一道浓一道淡，远看是一层影
  float k = fract((gl_FragCoord.x + gl_FragCoord.y) * 0.16);
  float a = uA * hidden * (0.55 + 0.45 * smoothstep(0.35, 0.6, k));
  // 昼是淡墨，夜里换成月白（墨色压在夜色上看不见）
  gl_FragColor = vec4(mix(uInk, uLight * 0.92, smoothstep(0.3, 0.8, uNight)), a);
}
`;

export interface Ghost { update(visible: boolean): void; dispose(): void }

/** root：行者的根节点（影子挂在它底下，跟着走、跟着转）；body：行者那一张网 */
export function createGhost(root: THREE.Object3D): Ghost | null {
  const body = root.getObjectByName('avatar:body') as THREE.Mesh | undefined;
  if (!body?.geometry) return null;
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uA: { value: 0.55 } },
    vertexShader: V, fragmentShader: F,
    transparent: true, depthTest: false, depthWrite: false, side: THREE.FrontSide,
  });
  const ghost = new THREE.Mesh(body.geometry, mat);
  ghost.name = 'avatar:ghost';
  ghost.layers.set(FX_LAYER);
  ghost.frustumCulled = false;
  ghost.renderOrder = 5;
  // 与那张网同一处、同一个变换（网本身就挂在根上）
  ghost.position.copy(body.position); ghost.quaternion.copy(body.quaternion); ghost.scale.copy(body.scale);
  (body.parent ?? root).add(ghost);
  return {
    update(visible: boolean) { ghost.visible = visible && body.visible && root.visible; },
    dispose() { ghost.removeFromParent(); mat.dispose(); },
  };
}
