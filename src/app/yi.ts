/**
 * 界面里用到的几样「易」的排法：先天方图、十二消息卦配时辰与四季、一卦由哪两个三画卦叠成。只是排，不占。
 */
import type { Season } from '../world/env/atmos';
import { branchOf } from './calendar';
import { GUA, TRI, TRIGRAMS, XIAOXI, type Gua, type Trigram, type TrigramId, type Xiaoxi } from './texts';

/**
 * 先天方图（邵雍所传）：八行八列。同一行的下卦相同，同一列的上卦相同；
 * 自上而下各行的下卦是 坤艮坎巽震离兑乾，自左而右各列的上卦也是这个次序——所以乾在右下角，坤在左上角，泰在左下，否在右上。
 * （GUA 是按 乾兑离震巽坎艮坤 排的：倒过来取就是。）
 */
export const FANGTU: Gua[][] = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => GUA[(7 - r) * 8 + (7 - c)]));
/** 方图各行的下卦（自上而下）、各列的上卦（自左而右） */
export const FANGTU_AXIS: Trigram[] = Array.from({ length: 8 }, (_, i) => TRIGRAMS[7 - i]);

/** 这个钟点是哪个时辰、配哪一卦 */
export const xiaoxiAt = (hour: number): Xiaoxi => XIAOXI[branchOf(hour)];
/** 每一季的三个月各配哪一卦（孟、仲、季）：春 泰 大壮 夬，夏 乾 姤 遁，秋 否 观 剥，冬 坤 复 临 */
export const SEASON_GUA: Record<Season, Xiaoxi[]> = {
  spring: [2, 3, 4].map((i) => XIAOXI[i]), summer: [5, 6, 7].map((i) => XIAOXI[i]),
  autumn: [8, 9, 10].map((i) => XIAOXI[i]), winter: [11, 0, 1].map((i) => XIAOXI[i]),
};

/**
 * 同一个三画卦，在不同的卦里取的象不一样：巽在「井」「鼎」里是木（木上有水、木上有火），坎在「屯」「需」里是云，
 * 离在「晋」「明夷」里是明、在「噬嗑」「丰」里是电。这里列的是《大象传》里用到的那几种。
 */
const ALSO: Partial<Record<TrigramId, string[]>> = { xun: ['木'], kan: ['云', '雨', '泉'], li: ['电', '明'] };
/** 这一卦的《大象传》头一句（到卦名之前）里，这个三画卦取的是什么象；文字没备好、或认不出，就用它通常的象 */
function imageIn(g: Gua, id: TrigramId): string {
  const t = TRI[id], head = g.image.split(/[，。]/)[0] ?? '';
  if (!head || head.includes(t.image)) return t.image;
  return ALSO[id]?.find((x) => head.includes(x)) ?? t.image;
}
/** 「上坎为水，下巽为木」：一卦由哪两个三画卦叠成（这是卦体，是本应用的说明，不是引文） */
export function bodyOf(g: Gua): string {
  const u = TRI[g.upper], l = TRI[g.lower];
  if (u.id === l.id) return `上下皆${u.name}，${u.name}为${imageIn(g, u.id)}`;
  return `上${u.name}为${imageIn(g, u.id)}，下${l.name}为${imageIn(g, l.id)}`;
}
