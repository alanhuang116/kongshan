/**
 * 村里人的打扮。都是同一副身子（avatar/）换一身衣裳：布色只在靛灰、赭、素白之间，
 * 干活的人是短褐（露着小腿）、窄袖；读书的、年老的是长衫。只有一个童子身上有一点红。
 */
import { PIG, type RGB } from '../ink/ink';
import type { Look } from '../avatar/types';

/** 日头底下干活的人的肤色（比读书人深一点） */
const TAN: RGB = [0.96, 0.85, 0.73];
const STRAW: RGB = [0.9, 0.82, 0.62];
/** 干活的人共有的几样：短衣、窄袖、淡彩（透在纸上） */
const WORK: Partial<Look> = { body: 0.12, hem: 0.5, sleeve: 0.3, beard: 0, skin: TAN, leg: TAN, legDens: 1, shoes: STRAW, shoesDens: 1.6, folds: 0.8, shade: 1.5, trim: [0.62, 0.66, 0.72], trimDens: 1.5 };
const CHILD: Partial<Look> = { body: 0.2, hem: 0.36, sleeve: 0.5, beard: 0, hat: 'tufts', head: 1.24, leg: [0.98, 0.9, 0.82], shoes: PIG.mo, shoesDens: 2.6, folds: 0.6, shade: 1.35, skin: [0.99, 0.91, 0.83] };

export const LOOKS = {
  /** 农夫：斗笠、靛青的短褐、裤脚卷着 */
  farmer: { ...WORK, robe: [0.6, 0.66, 0.75], robeDens: 2.1, sash: [0.86, 0.76, 0.6], sashDens: 1.5, hat: 'li', hatWorn: true, hatPig: STRAW, hatDens: 1.3, scale: 1.03 },
  /** 采桑女：素白的短襦、青裙、高髻 */
  picker: { body: 0.25, robe: [0.97, 0.95, 0.9], robeDens: 1, skirt: [0.66, 0.74, 0.78], skirtDens: 1.45, trim: [0.62, 0.68, 0.76], trimDens: 1.6, sash: [0.88, 0.74, 0.62], sashDens: 1.4, hat: 'bun', sleeve: 0.55, hem: 0.1, beard: 0, skin: [0.99, 0.91, 0.83], shoes: [0.62, 0.66, 0.74], shoesDens: 2, scale: 0.96, folds: 0.9, shade: 1.4 },
  /** 童子三个：一个素白（腰里一点红）、一个土黄、一个淡青 */
  kid1: { ...CHILD, robe: [0.97, 0.95, 0.9], robeDens: 1, sash: PIG.zhu, sashDens: 1, accent: PIG.zhu, trim: [0.7, 0.74, 0.8], trimDens: 1.3, scale: 0.7 },
  kid2: { ...CHILD, robe: [0.93, 0.85, 0.68], robeDens: 1.3, sash: [0.6, 0.66, 0.76], sashDens: 1.7, accent: [0.6, 0.66, 0.76], trim: [0.8, 0.72, 0.58], trimDens: 1.4, scale: 0.74 },
  kid3: { ...CHILD, robe: [0.7, 0.77, 0.85], robeDens: 1.25, sash: [0.88, 0.76, 0.6], sashDens: 1.5, accent: [0.88, 0.76, 0.6], trim: [0.6, 0.66, 0.76], trimDens: 1.5, scale: 0.64 },
  /** 塾师：灰蓝的长衫、软巾、三绺须 */
  teacher: { body: 0.3, robe: [0.68, 0.74, 0.82], robeDens: 1.25, trim: [0.56, 0.6, 0.7], trimDens: 1.8, sash: [0.5, 0.52, 0.6], sashDens: 2.2, beard: 0.75, scale: 1.0, sleeve: 1, shade: 1.45 },
  /** 老人：赭灰的长衫，须发皆白 */
  elder: { body: 0.35, robe: [0.88, 0.82, 0.72], robeDens: 1.15, trim: [0.72, 0.66, 0.58], trimDens: 1.6, sash: [0.66, 0.6, 0.54], sashDens: 1.8, hat: 'none', hair: [0.93, 0.93, 0.92], hairDens: 1, beard: 1, scale: 0.95, sleeve: 0.9, skin: [0.98, 0.88, 0.79], shade: 1.4 },
  /** 邻家妇人：赭色的短襦、深青的裙 */
  neighbor: { body: 0.2, robe: [0.9, 0.78, 0.64], robeDens: 1.15, skirt: [0.6, 0.66, 0.76], skirtDens: 1.7, trim: [0.6, 0.62, 0.7], trimDens: 1.6, sash: [0.94, 0.92, 0.86], sashDens: 1, hat: 'bun', sleeve: 0.5, hem: 0.1, beard: 0, skin: [0.98, 0.89, 0.8], shoes: [0.6, 0.62, 0.68], shoesDens: 2.2, scale: 0.97, folds: 0.9, shade: 1.4 },
  /** 木匠两个：一个赭褐、一个灰 */
  carpenter1: { ...WORK, robe: [0.84, 0.72, 0.58], robeDens: 1.6, sash: [0.6, 0.64, 0.72], sashDens: 1.8, hat: 'none', leg: [0.84, 0.84, 0.8], legDens: 1.2, shoes: PIG.mo, shoesDens: 2.4, scale: 1.02 },
  carpenter2: { ...WORK, robe: [0.66, 0.68, 0.72], robeDens: 1.5, sash: [0.86, 0.74, 0.58], sashDens: 1.5, hat: 'none', leg: [0.86, 0.82, 0.74], legDens: 1.2, shoes: PIG.mo, shoesDens: 2.4, scale: 0.99 },
  /** 渔父：箬笠、蓑衣 */
  fisher: { ...WORK, robe: [0.8, 0.76, 0.66], robeDens: 1.5, sash: [0.7, 0.66, 0.56], sashDens: 1.6, hat: 'li', hatWorn: true, hatPig: [0.88, 0.8, 0.6], hatDens: 1.45, cape: true, hem: 0.44, beard: 0.6, hair: [0.8, 0.8, 0.8], hairDens: 1.6, shoes: TAN, shoesDens: 1.1, scale: 1.0 },
  /** 樵夫：赭褐的短褐，斗笠挂在背后 */
  woodcutter: { ...WORK, robe: [0.8, 0.68, 0.56], robeDens: 1.9, sash: [0.62, 0.62, 0.6], sashDens: 1.8, hat: 'li', hatWorn: false, hatPig: STRAW, hatDens: 1.35, beard: 0.35, scale: 1.02 },
  /** 浣衣女：淡青的短襦、素裙，袖子挽着 */
  washer: { body: 0.25, robe: [0.72, 0.8, 0.84], robeDens: 1.15, skirt: [0.95, 0.93, 0.87], skirtDens: 1, trim: [0.6, 0.66, 0.74], trimDens: 1.5, sash: [0.62, 0.68, 0.76], sashDens: 1.6, hat: 'bun', sleeve: 0.3, hem: 0.1, beard: 0, skin: [0.99, 0.91, 0.83], shoes: [0.62, 0.66, 0.74], shoesDens: 2, scale: 0.95, folds: 0.9, shade: 1.4 },
  /** 牧童：赭黄的短衣，光着脚 */
  herdboy: { ...CHILD, robe: [0.9, 0.8, 0.62], robeDens: 1.5, sash: [0.66, 0.68, 0.7], sashDens: 1.6, trim: [0.74, 0.66, 0.54], trimDens: 1.5, hem: 0.4, sleeve: 0.35, skin: TAN, leg: TAN, shoes: TAN, shoesDens: 1.05, scale: 0.76, head: 1.2 },
  /** 送饭的女儿：靛青的短襦、素裙 */
  lunch: { body: 0.2, robe: [0.64, 0.7, 0.78], robeDens: 1.5, skirt: [0.94, 0.9, 0.82], skirtDens: 1.05, trim: [0.86, 0.76, 0.62], trimDens: 1.4, sash: [0.9, 0.78, 0.64], sashDens: 1.3, hat: 'bun', sleeve: 0.5, hem: 0.12, beard: 0, skin: [0.99, 0.9, 0.82], shoes: [0.6, 0.62, 0.68], shoesDens: 2.2, scale: 0.9, head: 1.06, folds: 0.9, shade: 1.4 },
  /** 弈棋的另一位老人：灰青的长衫，花白的须发，头上一方巾 */
  elder2: { body: 0.3, robe: [0.74, 0.78, 0.8], robeDens: 1.25, trim: [0.6, 0.62, 0.66], trimDens: 1.7, sash: [0.58, 0.56, 0.54], sashDens: 1.9, hat: 'jin', hatPig: [0.6, 0.6, 0.62], hatDens: 1.9, hair: [0.86, 0.86, 0.85], hairDens: 1.2, beard: 0.7, scale: 0.97, sleeve: 0.9, skin: [0.98, 0.88, 0.79], shade: 1.4 },
  /** 酒家掌柜：赭色的长衫挽着袖，腰里系一条围布 */
  keeper: { body: 0.2, robe: [0.86, 0.76, 0.62], robeDens: 1.35, trim: [0.66, 0.6, 0.54], trimDens: 1.6, sash: [0.95, 0.94, 0.9], sashDens: 1, hat: 'none', beard: 0.3, sleeve: 0.4, hem: 0.2, scale: 1.0, skin: [0.98, 0.88, 0.78], shade: 1.45, leg: [0.84, 0.84, 0.8], legDens: 1.2 },
  /** 酒客：灰褐的短褐 */
  drinker: { ...WORK, robe: [0.76, 0.72, 0.66], robeDens: 1.7, sash: [0.6, 0.64, 0.7], sashDens: 1.7, hat: 'none', leg: [0.86, 0.84, 0.78], legDens: 1.2, shoes: PIG.mo, shoesDens: 2.4, beard: 0.4, scale: 1.01 },
  /** 货郎：青灰的短褐，头上一顶斗笠 */
  peddler: { ...WORK, robe: [0.68, 0.74, 0.76], robeDens: 1.6, sash: [0.88, 0.76, 0.6], sashDens: 1.5, hat: 'li', hatWorn: true, hatPig: STRAW, hatDens: 1.2, leg: [0.9, 0.88, 0.82], legDens: 1.1, shoes: PIG.mo, shoesDens: 2.2, scale: 1.0 },
  /** 客：一位读书的朋友——淡青灰的长衫、软巾、须 */
  guest: { body: 0.85, robe: [0.84, 0.88, 0.86], robeDens: 1.15, trim: [0.6, 0.66, 0.66], trimDens: 1.7, sash: [0.56, 0.6, 0.62], sashDens: 2.2, hatPig: [0.56, 0.58, 0.6], hatDens: 2.0, beard: 0.6, scale: 1.02 },
  /** 舂米人：土黄的短褐 */
  miller: { ...WORK, robe: [0.9, 0.84, 0.7], robeDens: 1.5, sash: [0.62, 0.66, 0.72], sashDens: 1.7, hat: 'none', leg: [0.88, 0.86, 0.8], legDens: 1.1, shoes: PIG.mo, shoesDens: 2.2, scale: 1.04 },
  /** 荡秋千的小女孩：淡胭脂色的短襦 */
  kid4: { ...CHILD, robe: [0.97, 0.86, 0.84], robeDens: 1.1, sash: [0.66, 0.74, 0.78], sashDens: 1.4, accent: [0.9, 0.5, 0.46], trim: [0.86, 0.72, 0.7], trimDens: 1.3, hem: 0.22, scale: 0.62, head: 1.26 },
} satisfies Record<string, Partial<Look>>;
export type LookName = keyof typeof LOOKS;
