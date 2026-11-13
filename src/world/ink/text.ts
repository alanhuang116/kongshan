/**
 * 字：门联、亭额、书签、诗稿上的字，都是开场时用笔意的字体现写在画布上的（没有图片素材）。
 *
 * 写出来的是「颜料图」——给 wash({ map }) 用：贴图的 rgb 乘在颜料上，所以白底黑字就是「素底上的墨字」，
 * 底留白（1,1,1）的地方露出物件自己的颜色（木板、纸、石）。贴图一律 NoColorSpace。
 *
 * 字体是 src/app/styles/fonts.css 里带的三种：'Ma Shan Zheng'（毛笔）、'LXGW WenKai'（楷）、'Noto Serif SC'（宋）。
 * 用之前先 await fontsReady(要写的字)——字体是按字分包的，没到就会落成系统字。
 */
import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

export const BRUSH = '"Ma Shan Zheng", "LXGW WenKai", "Noto Serif SC", serif';
export const KAI = '"LXGW WenKai", "Noto Serif SC", serif';

/** 等这些字的字体到齐（最多等 4 秒；到不了就用系统字，不拦着开场） */
export async function fontsReady(chars: string, families: string[] = ['Ma Shan Zheng', 'LXGW WenKai', 'Noto Serif SC']): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts || !chars) return;
  try {
    await Promise.race([
      Promise.all(families.map((f) => document.fonts.load(`64px "${f}"`, chars))),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  } catch { /* 用系统字也行 */ }
}

export interface TextOpts {
  /** 字号（像素）。不给就按格子的大小自己定 */
  size?: number;
  font?: string;
  weight?: number | string;
  /** 墨色（rgb 乘在颜料上：越黑字越重） */
  color?: string;
  /** 底色。默认纯白（＝露出物件本色）；null 不涂底 */
  bg?: string | null;
  /** 竖排：每个字一行，多列时从右往左 */
  vertical?: boolean;
  /** 横排时从右往左读（匾额的老读法） */
  rtl?: boolean;
  /** 四边留多少（占字号的几成） */
  pad?: number;
  /** 字与字之间（占字号的几成） */
  gap?: number;
  /** 手写的不齐：每个字的大小、歪斜、位置、浓淡各差一点（0 板正 … 1 很随意） */
  hand?: number;
  /** 飞白：笔干处露底（0…1） */
  dry?: number;
  /** 笔画加重：描一圈的宽度（占字号的几成，如 0.03） */
  bold?: number;
  seed?: number;
  /** 做成贴图时每个字多少像素（textTexture 用；默认 96） */
  px?: number;
}

/**
 * 把几行字写进画布上的一个方框里（图集里的一格）。lines：横排时是各行，竖排时是各列（第一列在最右）。
 * 字号不给时，取「刚好排得下」的大小。
 */
export function paintText(g: CanvasRenderingContext2D, lines: string[], x: number, y: number, w: number, h: number, o: TextOpts = {}): void {
  const cols = lines.map((l) => [...l]), longest = Math.max(1, ...cols.map((c) => c.length)), n = Math.max(1, lines.length);
  const padK = o.pad ?? 0.3, gapK = o.gap ?? 0.16, lineK = o.vertical ? 0.34 : 0.3;
  // 一行（列）里 longest 个字，n 行（列）
  const along = o.vertical ? h : w, across = o.vertical ? w : h;
  const fit = Math.min(along / (longest + (longest - 1) * gapK + 2 * padK), across / (n + (n - 1) * lineK + 2 * padK));
  const size = o.size ?? fit, gap = size * gapK, lead = size * lineK;
  const R = mulberry32((o.seed ?? 1) * 7919 + 13), hand = o.hand ?? 0.5;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (o.bg !== null) { g.fillStyle = o.bg ?? '#fff'; g.fillRect(x, y, w, h); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const ink = o.color ?? '#1c1b1d';
  const runLen = longest * size + (longest - 1) * gap, blockAcross = n * size + (n - 1) * lead;
  cols.forEach((chars, li) => {
    // 这一行（列）自己居中还是顶头：竖排顶头（联、书签都是从上写起），横排居中
    const own = chars.length * size + (chars.length - 1) * gap;
    chars.forEach((ch, ci) => {
      let cx: number, cy: number;
      if (o.vertical) {
        cx = x + w / 2 + blockAcross / 2 - size / 2 - li * (size + lead);
        cy = y + (h - runLen) / 2 + size / 2 + ci * (size + gap);
      } else {
        const k = o.rtl ? chars.length - 1 - ci : ci;
        cx = x + (w - own) / 2 + size / 2 + k * (size + gap);
        cy = y + h / 2 - blockAcross / 2 + size / 2 + li * (size + lead);
      }
      const s = size * (1 + (R() - 0.5) * 0.12 * hand), rot = (R() - 0.5) * 0.09 * hand;
      g.save();
      g.translate(cx + (R() - 0.5) * size * 0.07 * hand, cy + (R() - 0.5) * size * 0.07 * hand);
      g.rotate(rot);
      g.font = `${o.weight ?? 400} ${s}px ${o.font ?? BRUSH}`;
      g.globalAlpha = 1 - 0.22 * hand * R();
      g.fillStyle = ink;
      // 笔画加重一点（bold）：细笔的字缩小了会断
      if (o.bold) { g.strokeStyle = ink; g.lineJoin = 'round'; g.lineWidth = s * o.bold; g.strokeText(ch, 0, size * 0.03); }
      g.fillText(ch, 0, size * 0.03);
      g.restore();
    });
  });
  // 飞白：几道斜着的干痕，把墨擦回底色
  const dry = o.dry ?? 0;
  if (dry > 0 && o.bg !== null) {
    g.strokeStyle = o.bg ?? '#fff';
    const nSt = Math.round((w * h) / (size * size) * 26 * dry);
    for (let i = 0; i < nSt; i++) {
      const px = x + R() * w, py = y + R() * h, len = size * (0.12 + 0.3 * R()), a = -0.5 + (R() - 0.5) * 0.7;
      g.globalAlpha = 0.25 + 0.5 * R();
      g.lineWidth = Math.max(0.6, size * 0.012 * (0.5 + R()));
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); g.stroke();
    }
  }
  g.restore();
}

/** 画布做成贴图（颜料图：不做色彩管理） */
export function inkTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  return t;
}

/**
 * 写几行字，做成一张贴图。给 wash({ map, pig: 板的颜色 }) 用：白底处是板的本色，字是墨。
 * 贴图的宽高比就是这块字该有的宽高比（userData.aspect = 宽 / 高）。
 */
export function textTexture(lines: string[], opts: TextOpts = {}): THREE.CanvasTexture {
  const px = opts.px ?? 96, padK = opts.pad ?? 0.3, gapK = opts.gap ?? 0.16, lineK = opts.vertical ? 0.34 : 0.3;
  const longest = Math.max(1, ...lines.map((l) => [...l].length)), n = Math.max(1, lines.length);
  const along = Math.ceil(px * (longest + (longest - 1) * gapK + 2 * padK)), across = Math.ceil(px * (n + (n - 1) * lineK + 2 * padK));
  const c = document.createElement('canvas');
  c.width = opts.vertical ? across : along; c.height = opts.vertical ? along : across;
  const g = c.getContext('2d')!;
  paintText(g, lines, 0, 0, c.width, c.height, { ...opts, size: px });
  const t = inkTexture(c);
  t.userData.aspect = c.width / c.height;
  return t;
}
