/**
 * 别的几路在做的册页：村人簿（FolkSheet.tsx，说话那一路）、星图（StarSheet.tsx，观星那一路）。
 * 文件有了才有那一页——没有时简册上不出那一枚，世界请界面翻开它也不理。用到时才去取（不拖慢开门）。
 * 那两页各自默认导出一个不带参数的组件，外面套 Sheet（见 Sheet.tsx）。
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type Mod = { default: ComponentType };
const FOLK = import.meta.glob<Mod>('./FolkSheet.tsx');
const STARS = import.meta.glob<Mod>('./StarSheet.tsx');
const make = (mods: Record<string, () => Promise<Mod>>): LazyExoticComponent<ComponentType> | null => {
  const load = Object.values(mods)[0];
  return load ? lazy(load) : null;
};
export const EXTRA: Record<'folk' | 'stars', LazyExoticComponent<ComponentType> | null> = { folk: make(FOLK), stars: make(STARS) };
export const hasSheet = (id: string): boolean => (id === 'folk' || id === 'stars' ? !!EXTRA[id] : true);
