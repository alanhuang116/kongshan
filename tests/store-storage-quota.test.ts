/**
 * store.ts 的 persist()：localStorage 配额满了的时候会发生什么。
 *
 * 以前的写法是一句 catch 吞掉——玩一整晚、关页全没，界面上还看不出来。
 * 现在配额满（QuotaExceededError）时只丢**最老的**起居注，而且二分找回“还能写进去的最大条数”，
 * 能少丢就少丢；其余字段（天时、行囊、村人、星图…）一条不动。这里钉四件事：
 *   1. 丢的是最老的起居注，留下的必须是最新那几条（顺序不能反）；
 *   2. storageState() 把 ok / bytes / trimmed 报对；
 *   3. 彻底写不下时 ok=false 且 lastError 报得出来，而不是悄悄成功；
 *   4. 裁完之后 `saved.set(snap)` 引起的那一次写回**只多写一次**，不会自己转起来、也不会再裁；
 *   5. 预算只差一点时只丢必要的几条（不是按比例整段砍）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'anlewo:v1';

let calls: string[] = [];

/**
 * 起一个假的 localStorage：`setItem` 超过 budget 个字符就抛 QuotaExceededError（真浏览器就是这么抛的）。
 * 同时把 window 补上——store.ts 的防抖用 `window.setTimeout`，node 环境里没有。
 */
async function boot(budget: number, seed: string | null = null) {
  vi.resetModules();
  calls = [];
  const mem = new Map<string, string>();
  if (seed != null) mem.set(KEY, seed);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      calls.push(v);
      if (v.length > budget) {
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
  });
  vi.stubGlobal('window', { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) });
  const mod = await import('../src/app/store');
  return { mod, mem };
}

/** 写一批起居注：每条 60 个字的正文，300 条大约 33k 字符（远超下面的预算） */
function fill(mod: { addEntry: (e: { kind: string; text: string }) => void }, n: number): void {
  for (let i = 0; i < n; i += 1) mod.addEntry({ kind: 'farm', text: `第${i}日：去田里锄草，麦子又黄了一分。` + '一'.repeat(50) });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('persist() 的配额兜底', () => {
  it('只裁最老的起居注：留下的还是最新那几条，trimmed 与落盘字数都报得对', async () => {
    const budget = 20_000;
    const { mod, mem } = await boot(budget);
    fill(mod, 300);
    const before = mod.saved.get().journal.length;
    expect(before).toBe(300);

    vi.advanceTimersByTime(300);

    const state = mod.storageState();
    const kept = mod.saved.get().journal;
    const stored = mem.get(KEY);

    // 写进去了、报的是正常
    expect(state.ok).toBe(true);
    expect(state.lastError).toBeNull();
    expect(typeof stored).toBe('string');
    expect(stored!.length).toBeLessThanOrEqual(budget);
    expect(state.bytes).toBe(stored!.length);

    // 确实裁了，而且丢的是最老的：留下的条数 + 裁掉的条数 = 原来的条数
    expect(state.trimmed).toBeGreaterThan(0);
    expect(kept.length).toBe(before - state.trimmed);
    expect(kept.length).toBeLessThan(before);

    // 顺序没被弄反：留下的第一条是“第 (300 - 留下条数) 日”，最后一条还是第 299 日
    const firstKept = Number(/^第(\d+)日/.exec(String(kept[0].text))?.[1]);
    expect(firstKept).toBe(state.trimmed);
    expect(String(kept[kept.length - 1].text).startsWith('第299日')).toBe(true);

    // 落盘的就是内存里这一份（不是裁之前那份）
    expect(JSON.parse(stored!).journal.length).toBe(kept.length);
  });

  it('彻底写不下：ok=false、lastError 报得出来，存储里一个字都没写', async () => {
    const { mod, mem } = await boot(1);
    fill(mod, 300);

    vi.advanceTimersByTime(300);

    const state = mod.storageState();
    expect(state.ok).toBe(false);
    expect(state.lastError).toBe('QuotaExceededError');
    expect(mem.has(KEY)).toBe(false);
    // 八轮之后仍写不下：内存里一条也不该被丢掉（什么都没落盘，裁了也白裁）——
    // trimmed 只记“真的因为落盘而丢掉的”，所以这时必须是 0
    expect(state.trimmed).toBe(0);
    expect(mod.saved.get().journal.length).toBe(300);
  });

  it('预算只差一点：只丢最老的几条，不是整段砍', async () => {
    // 先量出 300 条的整包大小，再把它减 400 字符（≈ 三四条）当预算
    const full = await boot(1_000_000);
    fill(full.mod, 300);
    vi.advanceTimersByTime(300);
    const fullLength = (full.mem.get(KEY) ?? '').length;
    expect(fullLength).toBeGreaterThan(10_000);

    const tight = await boot(fullLength - 400);
    fill(tight.mod, 300);
    vi.advanceTimersByTime(300);

    const state = tight.mod.storageState();
    expect(state.ok).toBe(true);
    expect(state.trimmed).toBeGreaterThan(0);
    expect(state.trimmed).toBeLessThanOrEqual(12);
    expect(tight.mod.saved.get().journal.length).toBeGreaterThanOrEqual(288);
  });

  it('裁完之后不会写回循环，也不会重复裁剪', async () => {
    const { mod } = await boot(20_000);
    fill(mod, 300);

    vi.advanceTimersByTime(300); // 第一次：失败若干轮 → 裁 → 成功
    const afterTrim = mod.storageState();
    const callsAfterTrim = calls.length;
    const keptAfterTrim = mod.saved.get().journal.length;

    // saved.set(snap) 会再排一次防抖：只该多写一次，且这次不该再裁
    vi.advanceTimersByTime(300);
    expect(calls.length).toBe(callsAfterTrim + 1);
    expect(mod.storageState().trimmed).toBe(afterTrim.trimmed);

    // 再空转十秒：不该再有新的写入被排出来（链在这里就断了）
    vi.advanceTimersByTime(10_000);
    expect(calls.length).toBe(callsAfterTrim + 1);
    expect(mod.storageState().trimmed).toBe(afterTrim.trimmed);
    expect(mod.saved.get().journal.length).toBe(keptAfterTrim);
    expect(mod.storageState().ok).toBe(true);
  });
});
