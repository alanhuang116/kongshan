/**
 * 毛笔体（马善政楷书）收的字不全（比如「姤」「夬」就没有）。一行里有的字是毛笔体、有的落到楷体上，很难看——
 * 所以要用毛笔体写的一段字，先看它是不是每个字都有；缺一个，整段都改用楷体。
 */
import { useEffect, useState } from 'react';

const BRUSH = '"Ma Shan Zheng"', KAI = '"LXGW WenKai"';
const cache = new Map<string, boolean>();
let g2d: CanvasRenderingContext2D | null = null;
/**
 * 把一个字用某套字体画出来，取它的样子（比两种画法是不是同一个样子用）。
 * 基线用 alphabetic：别的基线要看排在头里那套字体的尺寸，同一个字会画在不同的高度上，就比不准了。
 */
function look(font: string, ch: string): string {
  if (!g2d) { const c = document.createElement('canvas'); c.width = c.height = 32; g2d = c.getContext('2d', { willReadFrequently: true }); }
  const g = g2d;
  if (!g) return '';
  g.clearRect(0, 0, 32, 32); g.font = font; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = '#000';
  g.fillText(ch, 4, 24);
  const d = g.getImageData(0, 0, 32, 32).data;
  let s = '';
  for (let i = 3; i < d.length; i += 4) s += d[i] > 96 ? '1' : '0';
  return s;
}
async function has(ch: string): Promise<boolean> {
  const hit = cache.get(ch);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    // 哪一片的范围里都没有这个字：肯定没有。范围里列了的也未必真有：
    // 画两遍——「毛笔体，没有就楷体」与「只用楷体」——样子一样，就是毛笔体里没有
    const [faces] = await Promise.all([document.fonts.load(`24px ${BRUSH}`, ch), document.fonts.load(`24px ${KAI}`, ch)]);
    ok = faces.length > 0 && look(`24px ${BRUSH}, ${KAI}, serif`, ch) !== look(`24px ${KAI}, serif`, ch);
  } catch { ok = false; }
  cache.set(ch, ok);
  return ok;
}
const hanOf = (text: string) => [...new Set([...text].filter((c) => /\p{Script=Han}/u.test(c)))];
/** 这段字里的汉字毛笔体是不是都有 */
async function brushCovers(text: string): Promise<boolean> {
  return (await Promise.all(hanOf(text).map(has))).every(Boolean);
}
/** 这段字能不能用毛笔体写（先当它能，查出缺字再改成楷体） */
export function useBrush(text: string): boolean {
  const known = () => hanOf(text).every((c) => cache.get(c) !== false);
  const [ok, setOk] = useState(known);
  useEffect(() => {
    let live = true;
    setOk(known());
    void brushCovers(text).then((v) => { if (live) setOk(v); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return ok;
}
