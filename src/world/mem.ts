/**
 * 世界自己记着的事：各畦地种了什么、长到哪一步，行囊里有什么，村里人跟你熟到几分、托你的事办没办……
 * 按名字（ns）分成一份一份的 JSON。世界只管读写；存到本机是界面的事（events.mem → localStorage），所以这里没有 localStorage。
 *
 *   const farm = k.mem.get('farm', { plots: [] });   // 没有就用给的那份
 *   k.mem.set('farm', next);                          // 整份换掉（会告诉界面去存）
 *
 * 约定：每份只放能 JSON 的东西（数、字、数组、对象）；各模块用自己的名字，不去动别人的那份。
 * 现有的名字：bag 行囊 · farm 田里 · folk 村人（情分、托事）· stars 观过的星 · play 玩过的 · day 第几日（由总装记）
 */
export class Mem {
  private data: Record<string, unknown>;
  /** 有一份变了：界面据此存下来（总装接到 events.mem） */
  onSave: ((ns: string, v: unknown) => void) | null = null;
  constructor(init?: Record<string, unknown> | null) {
    this.data = {};
    if (init && typeof init === 'object') for (const [k, v] of Object.entries(init)) this.data[k] = v;
  }
  get<T>(ns: string, fallback: T): T {
    const v = this.data[ns];
    return v === undefined || v === null ? fallback : (v as T);
  }
  set(ns: string, v: unknown) {
    this.data[ns] = v;
    this.onSave?.(ns, v);
  }
  /** 改一份里的一部分（浅合并）：k.mem.patch('folk', { met: [...] }) */
  patch<T extends Record<string, unknown>>(ns: string, part: Partial<T>) {
    const cur = this.get<Record<string, unknown>>(ns, {});
    this.set(ns, { ...cur, ...part });
  }
  has(ns: string) { return this.data[ns] !== undefined; }
  /** 整个存档（给调试看） */
  all(): Readonly<Record<string, unknown>> { return this.data; }
}
