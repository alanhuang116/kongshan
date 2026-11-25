/**
 * store.ts 的 load()：存档里的东西一样一样认过再用（老版本存的、手改坏了的，那一项就用默认）。
 *
 * 只钉两件真会静默出事的口径：
 *   1. main cccc786 新增 `masterChosen` —— 老档（没有这个标记）里存的总音量多半是旧的默认 0.8，
 *      不能当成"玩家自己调过"，要回到当前默认；标过 `masterChosen` 的才保留自己那一档。
 *   2. `Saved` 整包往返 —— 同步层推的就是 `JSON.stringify(saved.get())`，服务端 JSONB 原样存、
 *      原样写回 localStorage 再读一遍；读回来必须一个字段不丢、值不变。
 * 字段数（21，含 `v`）是 AGENTS / DB_SPLIT_FINAL 里的红线，一并钉住：加字段要先升版本写迁移。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const KEY = 'anlewo:v1';

/** 21 个顶层字段各给一个非默认值（含 v）：一往返就能看出哪一项被丢掉或改了 */
const FULL = {
  v: 1, time: 'dusk', weather: 'rain', season: 'autumn', master: 0.93, muted: true, sound: { wind: 0.4, water: 0.2 },
  haptics: false, quality: 'high', visits: 7, journal: [{ t: 11, kind: 'farm', text: '打了麦' }], found: ['乾', '坤'],
  walked: true, runTold: true, world: { bag: { seed: 3 }, folk: { 王婶: 2 }, stars: [1, 2] }, flow: 1 / 20, day: 12,
  spot: { x: 1.5, z: -2.5, yaw: 0.3, zone: 'ground', place: '草堂', t: 99 }, guided: true, flowChosen: true, masterChosen: true,
};

/** 把 raw 放进假的 localStorage，再从头加载 store（load() 在模块求值时跑，与浏览器同一条路） */
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
  it('老档没有 masterChosen（master 存的是旧的默认 0.8）：音量回到当前默认 0.45', async () => {
    const old: Record<string, unknown> = { ...FULL, master: 0.8 };
    delete old.masterChosen;
    const s = await loadWith(JSON.stringify(old));
    expect(s.master).toBe(0.45);
    expect(s.masterChosen).toBe(false);
  });

  it('标过 masterChosen 的档：自己调过的音量保留', async () => {
    const s = await loadWith(JSON.stringify(FULL));
    expect(s.master).toBe(0.93);
    expect(s.masterChosen).toBe(true);
  });

  it('21 字段整包往返（同步 payload 的 stringify → 读档）一个不丢、值不变', async () => {
    const s = await loadWith(JSON.stringify(FULL)); // 与同步推出去、再原样放回 localStorage 的那条路一致
    expect(s).toEqual(FULL);
    expect(Object.keys(s)).toHaveLength(21);
  });
});
