/**
 * 树上的各层在四季里的样子。一层是一次绘制（一种颜料的笔）；换季不重建，只把这一层的
 * 颜料、点缀色、浓淡、笔的大小与「画次序在几成以内的笔」慢慢过渡到新的一季（Layer.go / blend）。
 *
 * 四时各有一样花是主：春桃、夏莲、秋菊、冬梅——所以桃花只在春、梅花只在冬（开春剩寥寥几朵），别的季节它们是安静的叶与枝。
 */
import * as THREE from 'three';
import type { Season } from '../atmos';
import { dabMat, dabMesh, type RGB } from '../../ink/ink';
import type { Atlas } from '../../ink/brush';
import type { LayerId, RDab } from './sink';

/** 一层在一季里的样子：颜料、点缀色、浓淡、画次序在几成以内的笔、笔放大几倍 */
export interface Look { pig: RGB; accent?: RGB; dens: number; frac: number; size?: number }
export type AtlasId = 'tree' | 'bloom' | 'ever' | 'field';
export interface LayerDef { atlas: AtlasId; body?: number; shade: number; snow: number; look: Record<Season, Look | null> }
const ALL = 1.01;
const YOUNG: RGB = [0.8, 0.88, 0.6], DEEP: RGB = [0.58, 0.7, 0.56];
const same = (l: Look): Record<Season, Look> => ({ spring: l, summer: l, autumn: l, winter: l });

export const DEFS: Record<LayerId, LayerDef> = {
  // 桃花：春天全画最艳的一样。粉（body）：夜里、远处都留着颜色
  peachBloom: { atlas: 'bloom', body: 0.75, shade: 1.55, snow: 0.15, look: { spring: { pig: [0.99, 0.82, 0.865], accent: [0.84, 0.3, 0.42], dens: 0.95, frac: ALL }, summer: null, autumn: null, winter: null } },
  // 梅：冬天的花（红梅——雪里才看得见）；开春还剩寥寥几朵
  plumBloom: { atlas: 'bloom', body: 0.8, shade: 1.3, snow: 0, look: { spring: { pig: [0.97, 0.6, 0.62], accent: [0.66, 0.12, 0.2], dens: 1, frac: 0.06 }, summer: null, autumn: null, winter: { pig: [0.97, 0.6, 0.62], accent: [0.66, 0.12, 0.2], dens: 1, frac: ALL } } },
  // 桃、梅的叶：春天只有梢上几片嫩的（次序排在最前的那些）
  fruitLeaf: { atlas: 'tree', shade: 1.6, snow: 0.6, look: {
    spring: { pig: YOUNG, accent: [0.88, 0.62, 0.48], dens: 0.95, frac: 0.13 }, summer: { pig: [0.6, 0.72, 0.56], dens: 1.25, frac: ALL },
    autumn: { pig: [0.9, 0.8, 0.55], accent: [0.86, 0.62, 0.46], dens: 1.1, frac: 0.5 }, winter: null } },
  willow: { atlas: 'tree', shade: 1.45, snow: 0.6, look: {
    spring: { pig: [0.84, 0.9, 0.62], dens: 0.8, frac: 0.82, size: 0.94 }, summer: { pig: [0.62, 0.76, 0.56], dens: 1.15, frac: ALL },
    autumn: { pig: [0.92, 0.85, 0.56], dens: 0.95, frac: 0.72 }, winter: null } },
  // 杂树分三色：夏天都是绿（深浅略异），秋天一黄、一赭、一苍
  broadA: { atlas: 'tree', shade: 1.7, snow: 0.7, look: {
    spring: { pig: YOUNG, dens: 0.9, frac: 0.62, size: 0.9 }, summer: { pig: DEEP, dens: 1.3, frac: ALL },
    autumn: { pig: [0.94, 0.85, 0.57], dens: 1.05, frac: 0.8 }, winter: null } },
  broadB: { atlas: 'tree', shade: 1.7, snow: 0.7, look: {
    spring: { pig: [0.78, 0.87, 0.64], dens: 0.95, frac: 0.6, size: 0.9 }, summer: { pig: [0.6, 0.72, 0.6], dens: 1.25, frac: ALL },
    autumn: { pig: [0.89, 0.75, 0.61], dens: 1.0, frac: 0.75 }, winter: null } },
  broadC: { atlas: 'tree', shade: 1.7, snow: 0.7, look: {
    spring: { pig: [0.76, 0.86, 0.62], dens: 1.0, frac: 0.66, size: 0.9 }, summer: { pig: [0.55, 0.69, 0.6], dens: 1.4, frac: ALL },
    autumn: { pig: [0.82, 0.76, 0.56], dens: 1.25, frac: 0.85 }, winter: null } },
  // 枯枝：颜料写在每一笔上（跟各自的干同色）。夏天叶密，不画
  twig: { atlas: 'tree', shade: 1.25, snow: 0.5, look: { spring: { pig: [1, 1, 1], dens: 1.6, frac: ALL }, summer: null, autumn: { pig: [1, 1, 1], dens: 1.6, frac: ALL }, winter: { pig: [1, 1, 1], dens: 1.6, frac: ALL } } },
  // 冬柳光的垂条（秋天叶疏了，露出一些）
  whip: { atlas: 'tree', shade: 1.2, snow: 0.3, look: { spring: null, summer: null, autumn: { pig: [1, 1, 1], dens: 1.5, frac: 0.3 }, winter: { pig: [1, 1, 1], dens: 1.5, frac: ALL } } },
  // 松、竹常青：只是冬天略苍
  pine: { atlas: 'ever', shade: 1.6, snow: 0.9, look: { ...same({ pig: [0.56, 0.68, 0.58], dens: 1.7, frac: ALL }), spring: { pig: [0.58, 0.7, 0.58], dens: 1.6, frac: ALL }, winter: { pig: [0.57, 0.66, 0.6], dens: 1.7, frac: ALL } } },
  bamboo: { atlas: 'ever', shade: 1.55, snow: 0.9, look: { ...same({ pig: [0.6, 0.72, 0.56], dens: 1.5, frac: ALL }), spring: { pig: [0.62, 0.74, 0.56], dens: 1.45, frac: ALL }, winter: { pig: [0.64, 0.71, 0.58], dens: 1.4, frac: ALL } } },
  // 地上的草：疏疏几笔。秋枯、冬稀
  grass: { atlas: 'field', shade: 1.3, snow: 1, look: { spring: { pig: [0.74, 0.84, 0.6], dens: 1.0, frac: 0.85 }, summer: { pig: [0.64, 0.76, 0.56], dens: 1.15, frac: ALL }, autumn: { pig: [0.88, 0.8, 0.58], dens: 1.0, frac: 0.8 }, winter: { pig: [0.86, 0.8, 0.66], dens: 0.9, frac: 0.45 } } },
};

interface State { pig: THREE.Color; accent: THREE.Color; dens: number; frac: number; size: number }
const col = (c: RGB) => new THREE.Color(c[0], c[1], c[2]);
/** 一层：一次绘制，记着此刻的样子（c）与从哪（a）变到哪（b） */
export class Layer {
  mesh: THREE.Mesh; n: number;
  /** 排好的次序：画「次序小于 frac」的那些 */
  private ks: Float32Array;
  private a: State; private b: State; private c: State;
  constructor(public id: string, public def: LayerDef, dabs: RDab[], A: Atlas, season: Season) {
    dabs.sort((p, q) => p.k - q.k);
    const L = def.look[season] ?? def.look.spring ?? def.look.summer ?? def.look.autumn ?? def.look.winter!;
    this.mesh = dabMesh(dabs, dabMat({ ...A, pig: L.pig, accent: L.accent ?? L.pig, dens: L.dens, shade: def.shade, body: def.body ?? 0, snow: def.snow, sway: 1 }));
    this.mesh.name = `flora:${id}`;
    this.n = dabs.length;
    this.ks = Float32Array.from(dabs, (d) => d.k);
    this.c = { pig: col(L.pig), accent: col(L.accent ?? L.pig), dens: L.dens, frac: 0, size: L.size ?? 1 };
    this.a = this.c; this.b = this.c;
    this.go(season, true);
  }
  private target(s: Season): State {
    const L = this.def.look[s], c = this.c;
    // 这一季没有它：颜色不动，疏到没有
    if (!L) return { pig: c.pig.clone(), accent: c.accent.clone(), dens: c.dens, frac: 0, size: c.size };
    return { pig: col(L.pig), accent: col(L.accent ?? L.pig), dens: L.dens, frac: L.frac, size: L.size ?? 1 };
  }
  private apply(s: State) {
    const u = (this.mesh.material as THREE.ShaderMaterial).uniforms;
    (u.uPig.value as THREE.Color).copy(s.pig); (u.uAccent.value as THREE.Color).copy(s.accent);
    (u.uP.value as THREE.Vector4).x = s.dens; (u.uAtlas.value as THREE.Vector4).w = s.size;
    let lo = 0, hi = this.n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.ks[m] < s.frac) lo = m + 1; else hi = m; }
    (this.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = lo;
    this.mesh.visible = lo > 0;
  }
  /** 往这一季去（now 为真则立刻到） */
  go(s: Season, now: boolean) {
    const to = this.target(s), c = this.c;
    // 从无到有：颜色直接用新的，只是由疏到密
    if (c.frac <= 0) { c.pig.copy(to.pig); c.accent.copy(to.accent); c.dens = to.dens; c.size = to.size; }
    this.a = { pig: c.pig.clone(), accent: c.accent.clone(), dens: c.dens, frac: c.frac, size: c.size };
    this.b = to;
    if (now) this.blend(1);
  }
  blend(t: number) {
    const a = this.a, b = this.b, c = this.c;
    c.pig.copy(a.pig).lerp(b.pig, t); c.accent.copy(a.accent).lerp(b.accent, t);
    c.dens = a.dens + (b.dens - a.dens) * t; c.frac = a.frac + (b.frac - a.frac) * t; c.size = a.size + (b.size - a.size) * t;
    this.apply(c);
  }
  /** 粉的成色（夜里调淡） */
  set body(v: number) { ((this.mesh.material as THREE.ShaderMaterial).uniforms.uP.value as THREE.Vector4).w = v; }
  /** 整层的不透明（每季一套的那些，换季时一套淡出、一套淡入） */
  set alpha(v: number) { ((this.mesh.material as THREE.ShaderMaterial).uniforms.uQ.value as THREE.Vector4).z = v; this.mesh.visible = v > 0.01 && (this.mesh.geometry as THREE.InstancedBufferGeometry).instanceCount > 0; }
}
