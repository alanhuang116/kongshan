/**
 * 把屋舍与器物攒起来：各件（草堂、院、桥、亭、村、田间、渡口）往同一摊（Ctx）里添料，最后按「哪一处 × 哪种材质」并成网格。
 * 正式的入口在 index.ts（createBuildings）；这里另留一个 assemble(…, 只要哪几件)，给看模型的台子单看一件用。
 */
import * as THREE from 'three';
import type { Quality } from '../core/World';
import { Builder, merge, type Geo } from '../core/geo';
import { FX_LAYER, FX_PARS, INK_PARS, U, wash } from '../ink/ink';
import { SITE } from '../site';
import { makeAtlas } from './atlas';
import { GLOW_PAPER, GLOW_ROOM, makeMats, type Ctx, type Mats, type Solid } from './kit';
import { buildHall } from './hall';
import { buildYard } from './yard';
import { buildWaterside } from './waterside';
import { buildPavilion } from './pavilion';
import { buildVillage } from './village';
import { buildFields } from './fields';
import { buildMore } from './more';

export interface BuildOpts { q: Quality }
export interface Buildings {
  group: THREE.Group;
  /** 草堂的屋顶、南墙（连门窗）：人进了屋要隐去，好看见屋里——所以各自是独立的一组 */
  hallRoof: THREE.Object3D; hallFront: THREE.Object3D;
  /** 交互用的挂点：位置、朝向都在世界坐标里（Object3D，+z 是「面朝」的方向） */
  anchors: Record<string, THREE.Object3D>;
  /** 能被拿起来、摆弄的东西（各自是独立的 Object3D，原点在好拿的地方） */
  parts: Record<string, THREE.Object3D>;
  /** 灯火亮几成（0…1）：窗纸透出的暖光、屋里的一盏灯 */
  setLamp(k: number): void;
  update(dt: number, t: number): void;
}

/** 各件的名字（台子上单看时用） */
export type Piece = 'hall' | 'yard' | 'waterside' | 'pavilion' | 'village' | 'fields' | 'more';
const PIECES: Record<Piece, (c: Ctx, sub?: string[]) => void> = { hall: buildHall, yard: buildYard, waterside: buildWaterside, pavilion: buildPavilion, village: buildVillage, fields: buildFields, more: buildMore };

/** 灯晕：画在勾完线之后的一团暖光（朝着看画人的一张片），自己比深度——墙挡着就看不见，开着的门里看得见 */
function haloMesh(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, uCol: { value: new THREE.Color(1, 0.72, 0.36) }, uK: { value: 0 }, uSize: { value: 2.6 } },
    vertexShader: /* glsl */ `
      uniform float uSize; varying vec2 vP; varying float vZ;
      void main() {
        vec4 v = viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        v.xy += position.xy * uSize;
        vZ = -v.z; vP = position.xy * 2.0;
        gl_Position = projectionMatrix * v;
      }`,
    fragmentShader: /* glsl */ `
      ${INK_PARS}${FX_PARS}
      uniform vec3 uCol; uniform float uK; varying vec2 vP; varying float vZ;
      void main() {
        float r = length(vP);
        float a = (pow(max(0.0, 1.0 - r), 2.4) * 0.5 + pow(max(0.0, 1.0 - r * 3.2), 2.0) * 0.5) * uK * uNight * fxSeen(vZ - 0.25, 0.3);
        gl_FragColor = vec4(uCol, a);
      }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.layers.set(FX_LAYER);
  m.frustumCulled = false;
  m.name = 'lampHalo';
  return m;
}

export async function assemble(o: BuildOpts, only?: Piece[], sub?: string[]): Promise<Buildings> {
  const q = o.q, atlas = await makeAtlas(q.tex, SITE.gnomon);
  const mats = makeMats(atlas.map);
  const group = new THREE.Group(), hallRoof = new THREE.Group(), hallFront = new THREE.Group();
  group.name = 'buildings'; hallRoof.name = 'hallRoof'; hallFront.name = 'hallFront';
  group.add(hallRoof, hallFront);
  const B = { home: new Builder(), village: new Builder(), far: new Builder(), roof: new Builder(), front: new Builder() };
  const anchors: Record<string, THREE.Object3D> = {}, parts: Record<string, THREE.Object3D> = {}, solids: Solid[] = [];
  const anchorRoot = new THREE.Group();
  anchorRoot.name = 'anchors';
  group.add(anchorRoot);
  const c: Ctx = {
    q, low: q.tier === 'low', mats, rect: atlas.rect, blank: atlas.blank, ...B, anchors, parts, solids, root: group, frontRoot: hallFront,
    anchor(name, x, y, z, yaw = 0) {
      const a = new THREE.Object3D();
      a.name = `anchor:${name}`;
      a.position.set(x, y, z); a.rotation.y = yaw;
      anchorRoot.add(a); anchors[name] = a;
      return a;
    },
    part(name, mat, geos: Geo[], pos, rot, parent) {
      const m = new THREE.Mesh(merge(geos), mats[mat as keyof Mats]);
      m.name = `part:${name}`;
      m.position.copy(pos);
      if (rot) m.rotation.copy(rot);
      (parent ?? group).add(m); parts[name] = m;
      return m;
    },
    solid(s) { solids.push(s); },
    tick: [],
  };
  for (const p of only ?? (Object.keys(PIECES) as Piece[])) PIECES[p](c, sub);
  const M = mats as unknown as Record<string, THREE.Material>;
  group.add(B.home.build(M, { name: 'home' }), B.village.build(M, { name: 'village' }), B.far.build(M, { name: 'far' }));
  hallRoof.add(B.roof.build(M, { name: 'hallRoof' }));
  hallFront.add(B.front.build(M, { name: 'hallFront' }));
  for (const m of [group, hallRoof, hallFront]) m.traverse((x) => { x.castShadow = false; x.receiveShadow = false; if ((x as THREE.Mesh).isMesh) (x as THREE.Mesh).geometry.computeBoundingSphere(); });

  // —— 灯：案上那一盏的火苗与灯晕；窗纸、屋里的墙面跟着亮 ——
  const lampAt = anchors.lamp, halo = haloMesh();
  const flame = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6).scale(0.011, 0.024, 0.011), wash({ pig: [1, 0.93, 0.7], dens: 1, body: 1, flat: 1, line: 0, glow: [0.9, 0.62, 0.25], snow: 0, vertexColors: false }));
  flame.name = 'lampFlame';
  if (lampAt) { halo.position.copy(lampAt.position); flame.position.copy(lampAt.position); group.add(halo, flame); }
  let lamp = 0;
  const apply = (f: number) => {
    const k = lamp;
    mats.paper.uniforms.uGlow.value.setRGB(GLOW_PAPER[0] * k, GLOW_PAPER[1] * k, GLOW_PAPER[2] * k);
    mats.inner.uniforms.uGlow.value.setRGB(GLOW_ROOM[0] * k * f, GLOW_ROOM[1] * k * f, GLOW_ROOM[2] * k * f);
    (halo.material as THREE.ShaderMaterial).uniforms.uK.value = k * f;
    halo.visible = flame.visible = k > 0.02 && !!lampAt;
    flame.scale.setScalar(0.85 + 0.3 * f * k);
  };
  apply(1);

  // 数一数：三角、绘制
  let tris = 0, calls = 0;
  group.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh && m.geometry) { calls++; const g = m.geometry, n = g.index ? g.index.count : g.attributes.position.count; tris += (n / 3) * ((m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1); } });
  group.userData = { solids, stats: { tris: Math.round(tris), calls } };

  return {
    group, hallRoof, hallFront, anchors, parts,
    setLamp(k: number) { lamp = Math.max(0, Math.min(1, k)); apply(1); },
    update(dt: number, t: number) {
      for (const f of c.tick) f(dt, t);
      if (lamp <= 0.02) return;
      // 灯火轻轻地跳
      apply(1 + 0.05 * Math.sin(t * 7.3) + 0.035 * Math.sin(t * 12.7 + 1.3) + 0.025 * Math.sin(t * 23.1 + 0.4));
    },
  };
}
