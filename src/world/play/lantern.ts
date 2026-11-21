/**
 * 院里的三盏纸灯笼：草堂檐下门东、门西各一盏，柴门楣头东端一盏。一盏一盏由人点亮（不点就暗着）。
 *   纸罩：画法的「窗纸」那一种（带三分粉），夜里亮多少由每个顶点自己带的一个量（aLit）定——
 *         三盏的纸并成一块网格（一次绘制），各亮各的：材质的着色器在编的时候把「乘上夜色的灯光」再乘上这个量。
 *   木盖、提绳：一块网格（obj）。灯晕：烟雨那一路的 Glow（一次绘制），只罩着点亮的那几盏。
 */
import * as THREE from 'three';
import { lathe, merge } from '../core/geo';
import { INK, dye, pole, v3 } from '../build/kit';
import { wash } from '../ink/ink';
import { Glow } from '../fx/glow';
import { SITE, YARD_Y } from '../site';

export interface LanternSpot { id: string; name: string; /** 挂绳的顶 */ top: THREE.Vector3; /** 纸罩的中心 */ c: THREE.Vector3 }
/** 三盏灯挂在哪 */
export function lanternSpots(): LanternSpot[] {
  const H = SITE.hall, G = SITE.gate, eaveY = YARD_Y + 2.24, gateY = YARD_Y + 2.16;
  const mk = (id: string, name: string, x: number, y: number, z: number, drop: number): LanternSpot => ({ id, name, top: v3(x, y, z), c: v3(x, y - drop, z) });
  return [
    mk('hallE', '檐下东', H.x + 1.55, eaveY, H.z + H.d / 2 + 0.62, 0.5),
    mk('hallW', '檐下西', H.x - 1.55, eaveY, H.z + H.d / 2 + 0.62, 0.5),
    mk('gate', '柴门', G.x + G.w / 2 + 0.36, gateY, G.z + 0.05, 0.46),
  ];
}

/** 一盏灯（原点在纸罩中心）：纸罩（鼓形）、上下木盖、提绳 */
function paperGeo(): THREE.BufferGeometry { return lathe([[0.05, -0.15], [0.1, -0.11], [0.125, -0.03], [0.125, 0.04], [0.1, 0.11], [0.05, 0.15]], 12); }
function capsGeo(drop: number): THREE.BufferGeometry {
  const gs = [
    dye(lathe([[0.001, -0.17], [0.055, -0.17], [0.058, -0.15], [0.05, -0.145], [0.001, -0.145]], 10), INK.darkwood, 2.0),
    dye(lathe([[0.001, 0.145], [0.05, 0.145], [0.058, 0.15], [0.055, 0.17], [0.001, 0.17]], 10), INK.darkwood, 2.0),
    dye(pole(v3(0, 0.17, 0), v3(0, drop, 0), 0.004, 0.004, 4), INK.hemp, 1.6),
    // 底下一绺穗子
    dye(lathe([[0.001, -0.17], [0.012, -0.18], [0.016, -0.26], [0.001, -0.27]], 6), [0.9, 0.6, 0.52], 1.3),
  ];
  return merge(gs);
}

export function makeLanterns(spots: LanternSpot[]) {
  // 纸罩：带三分粉；灯光的颜色比窗纸更暖一点
  const paper = wash({ pig: [0.97, 0.93, 0.84], dens: 1, body: 0.32, shade: 1.12, grain: 1.4, line: 0.4, glow: [0.85, 0.5, 0.17], snow: 0 });
  let patched = false;
  paper.onBeforeCompile = (sh) => {
    const v0 = sh.vertexShader, f0 = sh.fragmentShader;
    sh.vertexShader = v0.replace('varying vec3 vC;', 'varying vec3 vC; attribute float aLit; varying float vLit;').replace('vUv = uv;', 'vUv = uv; vLit = aLit;');
    sh.fragmentShader = f0.replace('varying vec3 vC;', 'varying vec3 vC; varying float vLit;').replace('c += uGlow * uNight;', 'c += uGlow * uNight * vLit;');
    patched = sh.vertexShader !== v0 && sh.fragmentShader.includes('uNight * vLit');
  };
  paper.customProgramCacheKey = () => 'play-lantern-paper';
  const ps: THREE.BufferGeometry[] = [], cs: THREE.BufferGeometry[] = [], counts: number[] = [];
  for (const s of spots) {
    const p = paperGeo().translate(s.c.x, s.c.y, s.c.z);
    counts.push(p.attributes.position.count);
    p.setAttribute('aLit', new THREE.BufferAttribute(new Float32Array(p.attributes.position.count), 1));
    ps.push(p);
    cs.push(capsGeo(s.top.y - s.c.y).translate(s.c.x, s.c.y, s.c.z));
  }
  const paperMesh = new THREE.Mesh(merge(ps), paper);
  paperMesh.name = 'play:lanternPaper';
  // 木盖、提绳是不动的：交给院里那一块不动的小器物去并
  const capsAll = merge(cs);
  const glow = new Glow(4);
  glow.mesh.name = 'play:lanternGlow';
  const lit = new Float32Array(spots.length);
  const attr = paperMesh.geometry.attributes.aLit as THREE.BufferAttribute;
  /** 各盏亮几成（0…1）：改纸上的量、灯晕只罩亮着的 */
  const at: THREE.Vector3[] = [];
  let lastSig = '';
  const setLit = (k: number[], flick = 1) => {
    let o = 0, any = false;
    at.length = 0;
    for (let i = 0; i < spots.length; i++) {
      const v = Math.max(0, Math.min(1, k[i])) * flick;
      if (Math.abs(v - lit[i]) > 0.004) { for (let j = 0; j < counts[i]; j++) attr.setX(o + j, v); attr.needsUpdate = true; lit[i] = v; }
      o += counts[i];
      if (v > 0.05) { any = true; at.push(spots[i].c); }
    }
    // 灯晕只在亮着的那几盏变了时才重摆
    const sig = at.length + ':' + at.map((p) => p.x).join(',');
    if (sig !== lastSig) { lastSig = sig; glow.set(at, 1.5); }
    glow.update(any ? 1 : 0);
    // 着色器没改成（画法的着色器换了写法）：只在全亮时才让纸透光，免得没点的也亮
    const warm = patched || k.every((x) => x > 0.5);
    paper.uniforms.uGlow.value.setRGB(warm ? 0.85 : 0, warm ? 0.5 : 0, warm ? 0.17 : 0);
  };
  setLit(spots.map(() => 0));
  return { paperMesh, capsGeo: capsAll, glow, setLit };
}
