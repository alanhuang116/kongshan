/**
 * 《心经》二百六十字的读音（不带声调的拼音，按五十二小句分）。
 * 只给合成的诵经声用：每个字取它的声母类别与韵母里的元音，诵出来的共振峰就跟着经文走，
 * 听上去是「在念这部经」的起伏，而不是随机的啊哦呜。字音不求可懂。
 */
export const XINJING = [
  'guan zi zai pu sa', 'xing shen bo re bo luo mi duo shi', 'zhao jian wu yun jie kong', 'du yi qie ku e',
  'she li zi', 'se bu yi kong', 'kong bu yi se', 'se ji shi kong', 'kong ji shi se', 'shou xiang xing shi', 'yi fu ru shi',
  'she li zi', 'shi zhu fa kong xiang', 'bu sheng bu mie', 'bu gou bu jing', 'bu zeng bu jian',
  'shi gu kong zhong wu se', 'wu shou xiang xing shi', 'wu yan er bi she shen yi', 'wu se sheng xiang wei chu fa',
  'wu yan jie', 'nai zhi wu yi shi jie', 'wu wu ming', 'yi wu wu ming jin', 'nai zhi wu lao si', 'yi wu lao si jin',
  'wu ku ji mie dao', 'wu zhi yi wu de', 'yi wu suo de gu', 'pu ti sa duo', 'yi bo re bo luo mi duo gu',
  'xin wu gua ai', 'wu gua ai gu', 'wu you kong bu', 'yuan li dian dao meng xiang', 'jiu jing nie pan',
  'san shi zhu fo', 'yi bo re bo luo mi duo gu', 'de a nou duo luo san miao san pu ti',
  'gu zhi bo re bo luo mi duo', 'shi da shen zhou', 'shi da ming zhou', 'shi wu shang zhou', 'shi wu deng deng zhou',
  'neng chu yi qie ku', 'zhen shi bu xu', 'gu shuo bo re bo luo mi duo zhou', 'ji shuo zhou yue',
  'jie di jie di', 'bo luo jie di', 'bo luo seng jie di', 'pu ti sa po he',
].map((p) => p.split(' '));

/** 每小句的字数（合计 260） */
export const XINJING_PHRASES: number[] = XINJING.map((p) => p.length);

/** 元音：a o e（ɤ）E（ê，ie / üe / ian 里的 e）i y（zi、shi 的舌尖元音）u v（ü） */
export type Vowel = 'a' | 'o' | 'e' | 'E' | 'i' | 'y' | 'u' | 'v';
/**
 * 字头：v 元音起头；n 鼻音、边音（m n l r）；p 不送气塞音（b d g）；P 送气塞音（p t k）；
 * h 轻擦音（f h）；s 咝音（s x sh）；z 不送气塞擦（z zh j）；c 送气塞擦（c ch q）
 */
export type Onset = 'v' | 'n' | 'p' | 'P' | 'h' | 's' | 'z' | 'c';
export interface Syllable { onset: Onset; /** 字头噪声的中心频率（咝音才有） */ hiss: number; vowels: Vowel[]; nasal: boolean }

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
const ONSET: Record<string, Onset> = {
  '': 'v', m: 'n', n: 'n', l: 'n', r: 'n', b: 'p', d: 'p', g: 'p', p: 'P', t: 'P', k: 'P', f: 'h', h: 'h',
  s: 's', x: 's', sh: 's', z: 'z', zh: 'z', j: 'z', c: 'c', ch: 'c', q: 'c',
};
const HISS: Record<string, number> = { s: 6500, z: 6500, c: 6500, x: 4800, j: 4800, q: 4800, sh: 3200, zh: 3200, ch: 3200, f: 5000, h: 1800, p: 2000, t: 3000, k: 2200 };

export function parseSyllable(py: string): Syllable {
  let ini = INITIALS.find((i) => py.startsWith(i)) ?? '';
  let fin = py.slice(ini.length);
  if (ini === 'y') { ini = ''; fin = fin.startsWith('u') ? 'v' + fin.slice(1) : fin.startsWith('i') ? fin : 'i' + fin; }
  else if (ini === 'w') { ini = ''; fin = fin.startsWith('u') ? fin : 'u' + fin; }
  if ((ini === 'j' || ini === 'q' || ini === 'x') && fin.startsWith('u')) fin = 'v' + fin.slice(1);
  if (fin === 'er') fin = 'e';
  if (fin === 'un') fin = 'uen';
  if (fin === 'ui') fin = 'uei';
  if (fin === 'iu') fin = 'iou';
  if (fin === 'o' && ['b', 'p', 'm', 'f'].includes(ini)) fin = 'uo';
  // ie、üe、ei、uei 里的 e，ian、üan 里的 a，实际都是前元音 ê
  const front = fin === 'ian' || fin === 'van';
  let nasal = false;
  if (fin.endsWith('ng')) { nasal = true; fin = fin.slice(0, -2); } else if (fin.endsWith('n')) { nasal = true; fin = fin.slice(0, -1); }
  if (fin === 'i' && ['z', 'c', 's', 'zh', 'ch', 'sh', 'r'].includes(ini)) fin = 'y';
  if (fin === 'ie' || fin === 've' || fin === 'ei' || fin === 'uei') fin = fin.replace('e', 'E');
  if (front) fin = fin.replace('a', 'E');
  const vowels = fin.split('').filter((c): c is Vowel => 'aoeEiyuv'.includes(c));
  return { onset: ONSET[ini] ?? 'v', hiss: HISS[ini] ?? 0, vowels: vowels.length ? vowels : ['e'], nasal };
}

export const XINJING_SYLLABLES: Syllable[] = XINJING.flat().map(parseSyllable);
