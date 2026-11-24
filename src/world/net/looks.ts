/**
 * 同游的人穿什么：都是读书人那一身（长衫、软巾，与自己操纵的那位一样的身子），换一种衣色——
 * 衣色从八种里取（黛、赭、苍、缃、藕、青、墨、檀：都是淡彩，透在纸上，与村里人的靛灰、赭、素白放在一起不跳）；
 * 雅号的后半截定几样小处：钓叟、渔父戴斗笠，樵子背着斗笠，野老、老圃须发花白，书生、游子没有须。
 * 自己是月白，别人没有月白：一眼认得出哪个是自己。
 */
import type { Look } from '../avatar/types';
import type { RGB } from '../ink/ink';
import { NAME_B, type Name } from './proto';

interface Robe { robe: RGB; dens: number; body: number; trim: RGB; trimDens: number; sash: RGB; sashDens: number; hat: RGB; hatDens: number }
/** 与 proto.json 的 robes 一一对应：黛衫、赭衫、苍衫、缃衫、藕衫、青衫、墨衫、檀衫 */
export const ROBE_LOOKS: Robe[] = [
  { robe: [0.62, 0.67, 0.77], dens: 1.25, body: 0.3, trim: [0.5, 0.54, 0.63], trimDens: 1.9, sash: [0.88, 0.82, 0.7], sashDens: 1.4, hat: [0.46, 0.49, 0.56], hatDens: 2 },
  { robe: [0.9, 0.79, 0.66], dens: 1.15, body: 0.35, trim: [0.66, 0.6, 0.54], trimDens: 1.8, sash: [0.56, 0.6, 0.68], sashDens: 2, hat: [0.52, 0.5, 0.5], hatDens: 1.9 },
  { robe: [0.74, 0.8, 0.77], dens: 1.2, body: 0.35, trim: [0.55, 0.62, 0.6], trimDens: 1.8, sash: [0.62, 0.58, 0.54], sashDens: 1.9, hat: [0.5, 0.54, 0.54], hatDens: 1.9 },
  { robe: [0.96, 0.91, 0.76], dens: 1.05, body: 0.5, trim: [0.72, 0.64, 0.5], trimDens: 1.6, sash: [0.55, 0.58, 0.66], sashDens: 2.1, hat: [0.5, 0.52, 0.58], hatDens: 1.9 },
  { robe: [0.93, 0.86, 0.87], dens: 1.05, body: 0.5, trim: [0.66, 0.58, 0.62], trimDens: 1.7, sash: [0.58, 0.6, 0.66], sashDens: 2, hat: [0.5, 0.5, 0.56], hatDens: 1.9 },
  { robe: [0.78, 0.86, 0.77], dens: 1.12, body: 0.4, trim: [0.55, 0.64, 0.56], trimDens: 1.75, sash: [0.88, 0.8, 0.64], sashDens: 1.5, hat: [0.48, 0.54, 0.5], hatDens: 1.9 },
  { robe: [0.64, 0.65, 0.68], dens: 1.6, body: 0.15, trim: [0.5, 0.5, 0.53], trimDens: 2.2, sash: [0.9, 0.86, 0.78], sashDens: 1.3, hat: [0.44, 0.44, 0.46], hatDens: 2.3 },
  { robe: [0.87, 0.73, 0.67], dens: 1.15, body: 0.3, trim: [0.62, 0.54, 0.52], trimDens: 1.8, sash: [0.6, 0.62, 0.66], sashDens: 1.9, hat: [0.5, 0.48, 0.48], hatDens: 1.9 },
];
/** 衣色在界面上画成的一小点（与画里的颜色同一个意思，略深一点好认） */
export const robeCss = (c: number): string => {
  const r = ROBE_LOOKS[c] ?? ROBE_LOOKS[0];
  const t = r.robe.map((v) => Math.round(255 * Math.pow(v, r.dens + 0.35)));
  return `rgb(${t[0]}, ${t[1]}, ${t[2]})`;
};

const STRAW: RGB = [0.9, 0.82, 0.62];
export function lookFor(n: Name, c: number): Partial<Look> {
  const r = ROBE_LOOKS[c] ?? ROBE_LOOKS[0], role = NAME_B[n[1]] ?? '';
  const old = /野老|老圃|钓叟|渔父/.test(role), young = /书生|游子/.test(role);
  const look: Partial<Look> = {
    robe: r.robe, robeDens: r.dens, body: r.body, trim: r.trim, trimDens: r.trimDens, sash: r.sash, sashDens: r.sashDens,
    hat: 'jin', hatWorn: true, hatPig: r.hat, hatDens: r.hatDens,
    beard: young ? 0 : old ? 0.9 : 0.25 + 0.25 * ((n[0] + n[1]) % 3),
    scale: 0.98 + 0.03 * (((n[0] * 7 + n[1] * 3) % 5) / 4),
  };
  if (old) { look.hair = [0.84, 0.84, 0.83]; look.hairDens = 1.25; }
  if (/钓叟|渔父/.test(role)) { look.hat = 'li'; look.hatWorn = true; look.hatPig = STRAW; look.hatDens = 1.35; }
  else if (/樵子/.test(role)) { look.hat = 'li'; look.hatWorn = false; look.hatPig = STRAW; look.hatDens = 1.35; }
  else if (/老圃/.test(role)) look.hat = 'none';
  return look;
}
