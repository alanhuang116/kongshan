/**
 * 田里的账：行者那几畦地此刻是什么样、长到哪一步，晒场上摊着什么。只是数，不碰三维（测试里直接跑）。
 *
 * 一畦地（Bed）：
 *   stage   荒（wild）→ 翻过（tilled）→ 下了种（sown）→ 出苗（sprout）→ 长高（growing）→ 熟了（ripe）→ 收过留茬（stubble）
 *   grow    这一步长了几成（满 1 就到下一步；但每一季有个上限——秋天种下的麦，秋天只长到出苗，开春才返青，到夏天才黄熟）
 *   water   土墒（0 干 … 1 透）；weed 草（0 净 … 1 荒）；care 照看得好不好（定收成）
 *   op/rows 正在一垄一垄做的那件事（翻、种、收）每一垄做到哪儿了（0…1，偶数垄自西往东、奇数垄自东往西）
 *   bound   收麦：每一垄割下的已经捆到哪儿了；sheaves 捆好立在地里、还没挑走的麦捆
 *   left    过了季没收的庄稼，邻家帮着收了，放在地头（下回来挑走）
 *
 * 时间怎么走：
 *   过一夜（k.onDay）长一天；时辰流转着也一点一点长；时辰停着时，每做完一件农活也推一点（「做着做着，日头就偏了」）。
 *   换季（界面上随时能换）一律当作「往后过了几季」：一季一季地过，到了哪一季就照那一季的样子——
 *   庄稼长到那一季的上限；熟了没收的过了季，邻家帮着收了放在地头；没人管的地长满了草。
 */
import { BED_CROPS, CROPS, GROW, SEASONS, type BedKind, type CropId, type Season, type Stage } from '../../data/farm';

export type Op = 'till' | 'sow' | 'reap' | null;
export interface Bed {
  id: string;
  crop: CropId | null;
  stage: Stage;
  grow: number;
  water: number;
  weed: number;
  care: number;
  sownIn: Season | null;
  /** 下种以后过了几季（下种那一季是 0） */
  age: number;
  op: Op;
  rows: number[];
  bound: number[];
  sheaves: number;
  left: { item: string; n: number } | null;
}
/** 晒场：摊着几捆（或几把谷穗）、打到几成、打下来还没扬的有几升、秸秆堆在边上 */
export interface Floor { crop: 'wheat' | 'millet' | null; spread: number; beaten: number; heap: number; straw: number }
export interface FarmState {
  v: 1;
  /** 这份账是照哪一季记的 */
  season: Season;
  /** 记到第几日 */
  day: number;
  beds: Record<string, Bed>;
  /** 挨着行者那两畦的那片麦（邻家王伯的）：夏天每一垄割到哪儿了（0…1，自西往东） */
  village: number[];
  floor: Floor;
  /** 头一回的种子给过没有 */
  gift: boolean;
  /** 家里缸里存的去年的麦、谷子取过没有（冬天推磨、舂米头一回用） */
  pantry: { wheat: boolean; gu: boolean };
  /** 一共做过几件农活；帮邻家割过几垄 */
  work: number;
  helped: number;
}

/** 行者的几畦：名字、哪一类、几垄（位置在 layout.ts） */
export interface BedSpec { id: string; name: string; kind: BedKind; rows: number }
export const BEDS: BedSpec[] = [
  { id: 'west', name: '西畦', kind: 'grain', rows: 4 },
  { id: 'east', name: '东畦', kind: 'grain', rows: 4 },
  { id: 'vegE', name: '菜畦东头', kind: 'veg', rows: 2 },
  { id: 'vegW', name: '菜畦西头', kind: 'veg', rows: 2 },
];
export const spec = (id: string): BedSpec => BEDS.find((b) => b.id === id) ?? BEDS[0];
/** 邻家那片麦有几垄 */
export const VILLAGE_ROWS = 19;

const ORDER: Record<Stage, number> = { wild: 0, tilled: 1, sown: 2, sprout: 3, growing: 4, ripe: 5, stubble: 6 };
export const stageIndex = (s: Stage) => ORDER[s];
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const next = (s: Stage): Stage => GROW[Math.min(GROW.length - 1, GROW.indexOf(s) + 1)];
/** 换季时土墒回到这一季寻常的样子 */
const SEASON_WATER: Record<Season, number> = { spring: 0.45, summer: 0.6, autumn: 0.5, winter: 0.7 };
/** 一天干多少、草长多少 */
const DRY: Record<Season, number> = { spring: 0.32, summer: 0.42, autumn: 0.28, winter: 0.05 };
const WEEDS: Record<Season, number> = { spring: 0.2, summer: 0.26, autumn: 0.12, winter: 0 };
/** 做完一件农活，田里的苗长多少（按天算） */
export const WORK_PUSH = 0.22;

/** 这样庄稼、这一季下的种，到了 season 那一季（下种后头一回碰上它）最多长到哪一步；不在它的季里返回 null */
export function capOf(crop: CropId, sownIn: Season, season: Season): Stage | null {
  const life = CROPS[crop].life[sownIn];
  if (!life || !life.includes(season)) return null;
  return CROPS[crop].cap[season] ?? null;
}
/** 这一畦的庄稼此刻（下种后第 age 季）最多长到哪一步；过了它的季返回 null */
export function capNow(b: Bed): Stage | null {
  if (!b.crop || !b.sownIn) return null;
  const life = CROPS[b.crop].life[b.sownIn];
  if (!life || b.age < 0 || b.age >= life.length) return null;
  return CROPS[b.crop].cap[life[b.age]] ?? null;
}
/** 这一畦此刻能下哪几样种 */
export function sowable(kind: BedKind, season: Season): CropId[] {
  return BED_CROPS[kind].filter((c) => CROPS[c].sow.includes(season));
}
/** 一垄收几（照看得好收得多） */
export function perRow(b: Bed): number {
  if (!b.crop) return 0;
  return Math.max(1, Math.round(CROPS[b.crop].yield.perRow * (0.6 + 0.6 * b.care)));
}
/** 这样庄稼收下来要不要捆（麦要捆成捆、挑到场上；谷穗、豆、菜直接装走） */
export const binds = (crop: CropId | null) => crop === 'wheat';
/** 第 i 垄往哪边做：偶数垄自西往东（+1），奇数垄自东往西（−1） */
export const rowDir = (i: number) => (i % 2 === 0 ? 1 : -1);

function emptyBed(id: string): Bed {
  const n = spec(id).rows;
  return { id, crop: null, stage: 'wild', grow: 0, water: 0.45, weed: 0.7, care: 0.5, sownIn: null, age: 0, op: null, rows: new Array(n).fill(0), bound: new Array(n).fill(0), sheaves: 0, left: null };
}
const grown = (id: string, crop: CropId, stage: Stage, sownIn: Season, now: Season, o: Partial<Bed> = {}): Bed => ({ ...emptyBed(id), crop, stage, sownIn, age: Math.max(0, (CROPS[crop].life[sownIn] ?? []).indexOf(now)), grow: 0.3, water: 0.6, weed: 0.12, care: 0.6, ...o });
const stubble = (id: string, crop: CropId): Bed => ({ ...emptyBed(id), crop, stage: 'stubble', weed: 0.3, water: 0.4 });

/**
 * 头一回来时的样子（按此刻的季节）：
 *   春  西畦是去秋种下的麦，正返青；东畦是去年的谷茬，等着翻地种谷；菜畦东头的小白菜能摘了，西头荒着
 *   夏  西畦麦黄了（开镰！）；东畦春谷长高了；菜畦东头苋菜正长，西头荒着
 *   秋  西畦麦早收过了、留着茬（该翻地种麦了）；东畦谷子熟了（掐穗）；菜畦东头白菜熟了
 *   冬  西畦麦苗在雪底下；东畦谷茬；菜畦都歇着
 */
export function freshState(season: Season, day = 0): FarmState {
  const beds: Record<string, Bed> = {};
  for (const s of BEDS) beds[s.id] = emptyBed(s.id);
  if (season === 'spring') {
    beds.west = grown('west', 'wheat', 'growing', 'autumn', season);
    beds.east = stubble('east', 'millet');
    beds.vegE = grown('vegE', 'greens', 'ripe', 'spring', season);
  } else if (season === 'summer') {
    beds.west = grown('west', 'wheat', 'ripe', 'autumn', season, { weed: 0.2 });
    beds.east = grown('east', 'millet', 'growing', 'spring', season, { weed: 0.45, water: 0.35 });
    beds.vegE = grown('vegE', 'greens', 'growing', 'summer', season, { water: 0.3 });
  } else if (season === 'autumn') {
    beds.west = stubble('west', 'wheat');
    beds.east = grown('east', 'millet', 'ripe', 'spring', season);
    beds.vegE = grown('vegE', 'greens', 'ripe', 'autumn', season);
  } else {
    beds.west = grown('west', 'wheat', 'sprout', 'autumn', season, { weed: 0, water: 0.7 });
    beds.east = stubble('east', 'millet');
    beds.vegE = { ...emptyBed('vegE'), weed: 0.4 };
  }
  return { v: 1, season, day, beds, village: new Array(VILLAGE_ROWS).fill(0), floor: { crop: null, spread: 0, beaten: 0, heap: 0, straw: 0 }, gift: false, pantry: { wheat: false, gu: false }, work: 0, helped: 0 };
}

const num = (v: unknown, d: number, a = 0, b = 1) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d);
const isSeason = (v: unknown): v is Season => typeof v === 'string' && (SEASONS as string[]).includes(v);
const isStage = (v: unknown): v is Stage => typeof v === 'string' && v in ORDER;
const isCrop = (v: unknown): v is CropId => typeof v === 'string' && v in CROPS;
const arr = (v: unknown, n: number) => { const a = Array.isArray(v) ? v : []; return Array.from({ length: n }, (_, i) => num(a[i], 0)); };

/** 存档里读出来的那一份：缺的补上、坏的换掉；季节对不上就往后过到此刻这一季 */
export function loadState(raw: unknown, season: Season, day = 0): FarmState {
  const r = raw as Partial<FarmState> | null;
  if (!r || typeof r !== 'object' || r.v !== 1 || !isSeason(r.season) || !r.beds || typeof r.beds !== 'object') return freshState(season, day);
  const st = freshState(r.season, num(r.day, day, 0, 1e9));
  for (const s of BEDS) {
    const b = (r.beds as Record<string, Partial<Bed>>)[s.id];
    if (!b || typeof b !== 'object') continue;
    const e = st.beds[s.id];
    const crop = isCrop(b.crop) && BED_CROPS[s.kind].includes(b.crop) ? b.crop : null;
    const stage = isStage(b.stage) ? b.stage : 'wild';
    const growing = GROW.includes(stage) || stage === 'stubble';
    st.beds[s.id] = {
      ...e, crop: growing ? crop : null, stage: growing && !crop ? 'wild' : stage,
      grow: num(b.grow, 0), water: num(b.water, 0.45, 0, 1.2), weed: num(b.weed, 0.5), care: num(b.care, 0.5),
      sownIn: isSeason(b.sownIn) ? b.sownIn : null, age: Math.floor(num(b.age, 0, 0, 8)), op: b.op === 'till' || b.op === 'sow' || b.op === 'reap' ? b.op : null,
      rows: arr(b.rows, s.rows), bound: arr(b.bound, s.rows), sheaves: Math.floor(num(b.sheaves, 0, 0, 99)),
      left: b.left && typeof b.left.item === 'string' && typeof b.left.n === 'number' && b.left.n > 0 ? { item: b.left.item, n: Math.floor(b.left.n) } : null,
    };
    const nb = st.beds[s.id];
    if (GROW.includes(nb.stage) && (!nb.crop || !nb.sownIn)) Object.assign(nb, emptyBed(s.id));
  }
  st.village = arr(r.village, VILLAGE_ROWS);
  const f = (r.floor ?? {}) as Partial<Floor>;
  st.floor = { crop: f.crop === 'wheat' || f.crop === 'millet' ? f.crop : null, spread: Math.floor(num(f.spread, 0, 0, 99)), beaten: num(f.beaten, 0), heap: Math.floor(num(f.heap, 0, 0, 999)), straw: num(f.straw, 0) };
  if (!st.floor.crop) { st.floor.spread = 0; st.floor.beaten = 0; }
  st.gift = !!r.gift;
  { const pa = (r.pantry ?? {}) as Partial<FarmState['pantry']>; st.pantry = { wheat: !!pa.wheat, gu: !!pa.gu }; } st.work = Math.floor(num(r.work, 0, 0, 1e9)); st.helped = Math.floor(num(r.helped, 0, 0, 1e9));
  if (st.season !== season) changeSeason(st, season);
  return st;
}
/** 存档用的一份（就是 JSON 能装下的那个对象） */
export const save = (st: FarmState): FarmState => JSON.parse(JSON.stringify(st)) as FarmState;

// —— 时间 ——
export interface Sky { rain?: number; snow?: number }
/** 过了 days 天（可以是零点几）：土干一点、草长一点、庄稼长一点 */
export function advance(st: FarmState, days: number, sky: Sky = {}) {
  if (!(days > 0)) return;
  for (const b of Object.values(st.beds)) {
    // 先长（按这一段开头的土墒、草），再干、再长草
    if ((sky.rain ?? 0) > 0.5) b.water = Math.min(1, b.water + days * 3);
    if (b.crop && GROW.includes(b.stage) && b.stage !== 'ripe') growBed(b, days, st.season, true);
    if ((sky.rain ?? 0) <= 0.5) b.water = Math.max(0, b.water - days * DRY[st.season]);
    const wr = WEEDS[st.season] * (b.stage === 'wild' ? 1.5 : b.stage === 'tilled' || b.stage === 'sown' ? 0.4 : 1);
    b.weed = Math.min(1, b.weed + days * wr);
  }
}
/** 长：按土墒、草的多少打折，到这一季的上限为止 */
function growBed(b: Bed, days: number, season: Season, careToo: boolean) {
  if (!b.crop || !b.sownIn) return;
  const c = CROPS[b.crop], cap = capNow(b) ?? b.stage;
  const ok = b.water > 0.3, clean = b.weed < 0.5;
  if (careToo) b.care = clamp(b.care + days * (ok && clean ? 0.12 : -0.1));
  let left = days * (ok ? 1 : 0.45) * (clean ? 1 : 0.65) * (season === 'winter' ? 0.15 : 1);
  while (left > 1e-9 && ORDER[b.stage] < ORDER[cap] && b.stage !== 'ripe') {
    const need = c.days[b.stage as 'sown' | 'sprout' | 'growing'], room = (1 - b.grow) * need;
    if (left >= room) { left -= room; b.stage = next(b.stage); b.grow = 0; }
    else { b.grow += left / need; left = 0; }
  }
  if (ORDER[b.stage] >= ORDER[cap]) b.grow = Math.min(b.grow, 0.98);
}
/** 过了一夜 */
export function newDay(st: FarmState, day: number, sky: Sky = {}) {
  advance(st, 1, sky);
  st.day = day;
}
/** 做完一件农活：记一笔；田里正长着的都长一点（时辰停着时，庄稼也跟着活计一点点长） */
export function work(st: FarmState) {
  st.work++;
  for (const b of Object.values(st.beds)) if (b.crop && GROW.includes(b.stage) && b.stage !== 'ripe') growBed(b, WORK_PUSH, st.season, false);
}

/** 换季：一季一季往后过，直到 to */
export function changeSeason(st: FarmState, to: Season) {
  for (let guard = 0; st.season !== to && guard < 4; guard++) {
    const nx = SEASONS[(SEASONS.indexOf(st.season) + 1) % 4];
    for (const b of Object.values(st.beds)) seasonBed(b, nx);
    st.village = st.village.map(() => 0);
    st.season = nx;
  }
}
function addLeft(b: Bed, item: string, n: number) {
  if (n <= 0) return;
  if (b.left && b.left.item === item) b.left.n += n; else b.left = { item, n };
}
function resetOp(b: Bed) { b.op = null; b.rows = b.rows.map(() => 0); b.bound = b.bound.map(() => 0); }
/** 一畦地过到下一季 s */
function seasonBed(b: Bed, s: Season) {
  const kind = spec(b.id).kind;
  if (b.crop && GROW.includes(b.stage)) {
    b.age++;
    const cap = capNow(b);
    if (cap) {
      // 还在它的季里：长到这一季的上限；隔了一季，草也长了些
      if (ORDER[cap] > ORDER[b.stage]) { b.stage = cap; b.grow = 0; resetOp(b); }
      b.weed = clamp(b.weed + 0.25); b.water = SEASON_WATER[s]; b.care = clamp(b.care * 0.92 + 0.04);
    } else if (b.stage === 'ripe') {
      // 熟了没人收，过了季：邻家帮着收了，放在地头。割了一半的，剩下的也替你收了；割下没捆的替你捆了
      const pr = perRow(b), crop = b.crop;
      let rest = 0;
      for (let i = 0; i < b.rows.length; i++) rest += 1 - (b.op === 'reap' ? b.rows[i] : 0);
      if (binds(crop)) {
        for (let i = 0; i < b.rows.length && b.op === 'reap'; i++) b.sheaves += Math.round((b.rows[i] - b.bound[i]) * pr);
        addLeft(b, CROPS[crop].yield.item, Math.round(rest * pr * 0.8));
      } else addLeft(b, CROPS[crop].yield.item, Math.round(rest * pr * 0.8));
      b.stage = 'stubble'; b.weed = 0.35; resetOp(b);
    } else {
      // 没熟就过了季（种晚了）：枯在地里
      Object.assign(b, { crop: null, stage: 'wild', grow: 0, weed: 0.7, sownIn: null });
      resetOp(b);
    }
  } else if (b.stage === 'stubble') {
    // 茬子没人翻：长满了草
    Object.assign(b, { crop: null, stage: 'wild', weed: s === 'winter' ? 0.55 : 0.85, sownIn: null });
    resetOp(b);
  } else if (b.stage === 'tilled') {
    // 翻过没种：冬天冻着还是翻过的样子，别的季又长了草
    if (s !== 'winter') { b.stage = 'wild'; b.weed = 0.55; resetOp(b); }
  } else {
    b.weed = s === 'winter' ? Math.min(b.weed, 0.6) : clamp(b.weed + 0.3);
    if (b.op === 'till') resetOp(b);
  }
  if (kind === 'veg' && b.stage === 'stubble') { b.stage = 'wild'; b.crop = null; }
  b.water = clamp(b.water, 0, 1);
}

// —— 一样一样的活计（各件事调用；返回值给画面与行囊用）——
/** 开始（或接着）一垄一垄地做某件事 */
export function begin(b: Bed, op: Exclude<Op, null>) {
  if (b.op !== op) { b.op = op; b.rows = b.rows.map(() => 0); b.bound = b.bound.map(() => 0); }
}
/** 下一垄没做完的是第几垄（都做完了是 −1） */
export function nextRow(b: Bed): number { return b.rows.findIndex((v) => v < 0.999); }
/** 这件事做完了没有 */
export const opDone = (b: Bed) => b.rows.every((v) => v >= 0.999);

/** 翻：第 row 垄翻到 frac。都翻完了就是「翻过了」 */
export function till(b: Bed, row: number, frac: number): boolean {
  begin(b, 'till');
  b.rows[row] = Math.max(b.rows[row], clamp(frac));
  if (!opDone(b)) return false;
  Object.assign(b, { stage: 'tilled' as Stage, crop: null, sownIn: null, weed: 0, grow: 0, water: Math.min(1, b.water + 0.08) });
  resetOp(b);
  return true;
}
/** 种：第 row 垄撒到 frac。都撒完了就是「下了种」 */
export function sow(b: Bed, row: number, frac: number, crop: CropId, season: Season): boolean {
  begin(b, 'sow');
  b.rows[row] = Math.max(b.rows[row], clamp(frac));
  if (!opDone(b)) return false;
  Object.assign(b, { stage: 'sown' as Stage, crop, sownIn: season, age: 0, grow: 0, weed: 0, care: clamp(0.5 + (b.water > 0.3 ? 0.08 : 0)) });
  resetOp(b);
  return true;
}
/** 浇：土墒加 amount（浇过了头，地就涝了一点——照看分减一点） */
export function water(b: Bed, amount: number): { over: boolean } {
  const before = b.water;
  b.water = Math.min(1.15, b.water + amount);
  const over = b.water > 1.02 && before <= 1.02;
  if (b.crop && GROW.includes(b.stage)) b.care = clamp(b.care + (over ? -0.05 : 0.05));
  return { over };
}
/** 锄：草少 amount */
export function weed(b: Bed, amount: number) {
  b.weed = Math.max(0, b.weed - amount);
  if (b.crop && GROW.includes(b.stage)) b.care = clamp(b.care + 0.03);
}
/**
 * 收：第 row 垄割（掐、拔、摘）到 frac。返回这一下收进行囊的东西有几（麦要捆，这里返回 0）。
 * 都收完（麦还要都捆好）就是「收过了」。
 */
export function reap(b: Bed, row: number, frac: number): number {
  if (!b.crop) return 0;
  begin(b, 'reap');
  const was = b.rows[row], now = Math.max(was, clamp(frac));
  b.rows[row] = now;
  let got = 0;
  if (!binds(b.crop)) { const pr = perRow(b); got = Math.floor(now * pr + 1e-6) - Math.floor(was * pr + 1e-6); }
  finishReap(b);
  return got;
}
/** 第 row 垄割下来铺着的，捆一捆（够一捆的量才捆；垄割完了，剩下的零头也捆成一捆）。返回捆成了没有 */
export function bind(b: Bed, row: number): boolean {
  if (!binds(b.crop) || b.op !== 'reap') return false;
  const pr = perRow(b), one = 1 / pr, lying = b.rows[row] - b.bound[row];
  if (lying < one - 1e-6 && !(b.rows[row] >= 0.999 && lying > 0.02)) return false;
  b.bound[row] = Math.min(b.rows[row], b.bound[row] + one);
  if (b.rows[row] >= 0.999 && b.rows[row] - b.bound[row] < 0.02) b.bound[row] = b.rows[row];
  b.sheaves++;
  finishReap(b);
  return true;
}
/** 某一垄有没有铺着够捆一捆的麦 */
export function bindable(b: Bed, row: number): boolean {
  if (!binds(b.crop) || b.op !== 'reap') return false;
  const lying = b.rows[row] - b.bound[row];
  return lying >= 1 / perRow(b) - 1e-6 || (b.rows[row] >= 0.999 && lying > 0.02);
}
function finishReap(b: Bed) {
  if (b.op !== 'reap' || !opDone(b)) return;
  if (binds(b.crop) && b.rows.some((v, i) => v - b.bound[i] > 0.02)) return;
  b.stage = 'stubble'; b.grow = 0; b.weed = Math.min(b.weed, 0.3);
  resetOp(b);
}
/** 挑：地里立着的麦捆挑走 max 捆（连同邻家帮收、放在地头的）。返回挑了几 */
export function loadSheaves(b: Bed, max: number): number {
  const n = Math.min(b.sheaves, Math.max(0, max));
  b.sheaves -= n;
  return n;
}
/** 地头邻家放下的那些（取走） */
export function takeLeft(b: Bed): { item: string; n: number } | null {
  const l = b.left; b.left = null; return l;
}

// —— 邻家那片麦 ——
/** 下一垄还没割完的（都割完了是 −1） */
export const villageNext = (st: FarmState) => st.village.findIndex((v) => v < 0.999);
/** 第 row 垄割到 frac（村里人、行者都用它） */
export function villageCut(st: FarmState, row: number, frac: number): boolean {
  if (row < 0 || row >= st.village.length) return false;
  const was = st.village[row];
  st.village[row] = Math.max(was, clamp(frac));
  return st.village[row] >= 0.999 && was < 0.999;
}

// —— 晒场 ——
/** 把麦捆（或谷穗）摊在场上 */
export function spread(st: FarmState, crop: 'wheat' | 'millet', n: number) {
  const f = st.floor;
  if (f.crop && f.crop !== crop && f.spread > 0) return false;
  f.crop = crop; f.spread += n; f.beaten = f.spread > n ? f.beaten * (f.spread - n) / f.spread : 0;
  return true;
}
/** 连枷打一下：打到几成加 amount。打完了，麦变成场上一堆连糠带粒的（heap 升），谷穗直接打成谷子（返回升数，进行囊） */
export function beat(st: FarmState, amount: number): { done: boolean; grain: number } {
  const f = st.floor;
  if (!f.crop || f.spread <= 0) return { done: false, grain: 0 };
  f.beaten = Math.min(1, f.beaten + amount);
  if (f.beaten < 1) return { done: false, grain: 0 };
  const n = f.spread, crop = f.crop;
  f.spread = 0; f.beaten = 0; f.straw = 1;
  if (crop === 'wheat') { f.heap += Math.round(n * 1.6); f.crop = null; return { done: true, grain: 0 }; }
  f.crop = null;
  return { done: true, grain: n };
}
/** 打一捆要打几下（摊得多，打得多些） */
export const beatsFor = (spreadN: number) => 8 + Math.round(spreadN * 0.6);
/**
 * 扬一锨：风合适（good）——一升麦粒落在干净的那一堆，收进行囊；风太小——糠扬不走，白扬了；
 * 风太大——麦粒也刮跑了一些。返回这一锨得了几升
 */
export function winnow(st: FarmState, wind: 'good' | 'weak' | 'strong'): number {
  const f = st.floor;
  if (f.heap <= 0) return 0;
  if (wind === 'weak') return 0;
  f.heap--;
  if (f.heap <= 0) f.straw = Math.max(0, f.straw - 0.5);
  return wind === 'good' ? 1 : 0;
}

/** 这一畦此刻该做哪一步（农事链上的第几步；给界面的 steps 用） */
export function chainStep(b: Bed): number {
  if (!b.crop || b.stage === 'wild' || b.stage === 'stubble') return 0;
  switch (b.stage) {
    case 'tilled': return 1;
    case 'sown': return 2;
    case 'sprout': case 'growing': return b.weed > 0.3 ? 3 : 2;
    case 'ripe': return binds(b.crop) && b.op === 'reap' && b.rows.some((v, i) => v - b.bound[i] > 0.02) ? 5 : 4;
    default: return 0;
  }
}
