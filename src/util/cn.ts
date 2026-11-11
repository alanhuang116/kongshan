/** 中文数字（十、二十一、一百零八……），一万以内 */
const CN = '〇一二三四五六七八九';
export function cn(n: number): string {
  n = Math.floor(n);
  if (n < 0) return '';
  if (n < 10) return CN[n];
  if (n < 20) return '十' + (n % 10 ? CN[n % 10] : '');
  if (n < 100) return CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : '');
  if (n < 1000) { const h = Math.floor(n / 100), r = n % 100; return CN[h] + '百' + (r === 0 ? '' : r < 10 ? '零' + CN[r] : (r < 20 ? '一' : '') + cn(r)); }
  if (n < 10000) { const k = Math.floor(n / 1000), r = n % 1000; return CN[k] + '千' + (r === 0 ? '' : r < 100 ? '零' + cn(r) : cn(r)); }
  return String(n);
}
