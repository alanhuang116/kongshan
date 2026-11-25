/**
 * store.ts 的 load()：存着的存档一样一样认过再用（老版本存的、手改坏了的，那一项就用默认的）。
 *
 * 这里盯的是 main cccc786 之后新增的 `masterChosen`：老档（20 字段、没有这个标记）里存的总音量
 * 多半是旧的默认 0.8，不能当成"玩家自己调过"，一律回到当前默认；只有标过 masterChosen 的才保留。
 * 另外确认整包 payload（同步层 `JSON.stringify(saved.get())`，服务端 JSONB 原样往返）读回来
 * 仍是 21 个字段、一个不少，值也不变。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const KEY = 'anlewo:v1';

/** 21 个顶层字段各给一个非默认值（含 v），用来验整包往返 */
const FULL = {
  v: 1, time: 'dusk', weather: 'rain', season: 'autumn', master: 0.93, muted: true, sound: { wind: 0.4, water: 0.2 },
  haptics: false, quality: 'high', visits: 7, journal: [{ t: 11, kind: 'farm', text: '打了麦' }], found: ['乾', '坤'],
  walked: true, runTold: true, world: { bag: { seed: 3 }, folk: { 王婶: 2 }, stars: [1, 2] }, flow: 1 / 20, day: 12,
  spot: { x: 1.5, z: -2.5, yaw: 0.3, zone: 'ground', place: '草堂', t: 99 }, guided: true, flowChosen: true, masterChosen: true,
};

/** 把 raw 放进假的 localStorage，再从头加载 store（load() 在模块求值时跑） */
async function loadWith(raw: string | null): Promise<Record<string, unknown>> {
  vi.resetModules();
  const mem = new Map<string, string>();
  if (raw != null) mem.set(KEY, raw);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v); },
    removeItem: (k: string) => { mem.delete(k); },
  });
  const m = await import('../src/app/store');
  return m.saved.get() as unknown as Record<string, unknown>;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('load()', () => {
  it('老档（20 字段、无 masterChosen、master=0.8）：音量归到新默认 0.45，其余原样', async () => {
    const old: Record<string, unknown> = { ...FULL };
    delete old.masterChosen;
    old.master = 0.8;
    const s = await loadWith(JSON.stringify(old));
    expect(s.master).toBe(0.45);
    expect(s.masterChosen).toBe(false);
    expect(s.visits).toBe(7);
    expect(s.world).toEqual(FULL.world);
    expect(s.spot).toEqual(FULL.spot);
    expect(s.day).toBe(12);
    expect(s.flow).toBe(1 / 20);
    expect(Object.keys(s).length).toBe(21);
  });

  it('带 masterChosen 的档：保留自己调过的音量', async () => {
    const s = await loadWith(JSON.stringify(FULL));
    expect(s.master).toBe(0.93);
    expect(s.masterChosen).toBe(true);
  });

  it('masterChosen 不是严格 true（字符串 / 数字 / null）也算没调过', async () => {
    for (const v of ['true', 1, 0, null]) {
      const s = await loadWith(JSON.stringify({ ...FULL, masterChosen: v, master: 0.9 }));
      expect(s.master).toBe(0.45);
      expect(s.masterChosen).toBe(false);
    }
  });

  it('21 字段整包往返（同步 payload 的 stringify → 读档）不丢字段、不改值', async () => {
    const pushed = JSON.stringify(FULL); // 同步层就是 JSON.stringify(saved.get()) 整包推
    const s = await loadWith(pushed);
    expect(Object.keys(s).sort()).toEqual(Object.keys(FULL).sort());
    expect(Object.keys(s).length).toBe(21);
    expect(s).toEqual(FULL);
    // 再往返一次（服务端 JSONB 回来 → 写回本地 → 重载页面）
    const s2 = await loadWith(JSON.stringify(s));
    expect(s2).toEqual(FULL);
  });

  it('没有任何存档：全默认，21 字段，master 0.45', async () => {
    const s = await loadWith(null);
    expect(Object.keys(s).length).toBe(21);
    expect(s.master).toBe(0.45);
    expect(s.masterChosen).toBe(false);
    expect(s.v).toBe(1);
  });
});
