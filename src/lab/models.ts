/**
 * 台子上能看的模型：名字 → 造出来的东西。
 * 每一类模型在 src/lab/models/ 下自己放一个文件，默认导出 Record<名字, Make>，这里自动收集（各人改各人的文件，不会撞）。
 */
import type * as THREE from 'three';
import type { World, Quality } from '../world/core/World';
import type { Mats } from '../world/core/mats';
import type { Textures } from '../world/core/tex';
import type { Atmos } from '../world/env/atmos';

export interface LabCtx { world: World; mats: Mats; T: Textures; atmos: Atmos; q: Quality }
export type Make = (c: LabCtx) => THREE.Object3D | Promise<THREE.Object3D>;

const files = import.meta.glob<{ default: Record<string, Make> }>('./models/*.ts', { eager: true });
export const MODELS: Record<string, Make> = Object.assign({}, ...Object.values(files).map((f) => f.default));
