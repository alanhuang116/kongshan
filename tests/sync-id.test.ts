// 同步身份：uid 是 v4 uuid、key 是 43 字符 base64url，两者分开，本机已有的原样不动。
// 这一层不碰界面、不碰存档：它只负责"这台机器是谁"。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureId, isSyncKey, isV4Uuid, loadId, newSyncKey, newUuid, resetForTest, setStorageForTest } from '../src/app/sync/id';

/** 最小可用的 localStorage 替身（node 环境里没有） */
class MemoryStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  key(i: number): string | null {
    const keys = [...this.m.keys()];
    return i >= 0 && i < keys.length ? keys[i] : null;
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
}

const KEY = 'anlewo:id:v1';
const asStorage = (s: MemoryStorage): Storage => s as unknown as Storage;

describe('同步身份', () => {
  let store: MemoryStorage;

  beforeEach(() => {
    store = new MemoryStorage();
    setStorageForTest(asStorage(store));
  });

  afterEach(() => {
    resetForTest();
  });

  it('造出来的 uid 是 v4 uuid', async () => {
    const id = await ensureId();
    expect(id).not.toBeNull();
    expect(isV4Uuid(id?.uid)).toBe(true);
    // 版本位与变体位要真的对：不是"长得像"就算
    expect(id?.uid[14]).toBe('4');
    expect('89ab').toContain(id?.uid[19] as string);
    expect(newUuid()).not.toBe(id?.uid);
  });

  it('key 是 43 字符 base64url，且与 uid 不同', async () => {
    const id = await ensureId();
    const key = id?.key ?? '';
    expect(key).toHaveLength(43);
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isSyncKey(key)).toBe(true);
    expect(key).not.toBe(id?.uid);
    expect(key).not.toContain('=');
  });

  it('key 不带 anon: 前缀（凭证就是凭证，不是 uid 的变体）', async () => {
    const id = await ensureId();
    expect(id?.key.startsWith('anon:')).toBe(false);
    expect(id?.key).not.toContain(':');
    expect(newSyncKey()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('localStorage 里没有时会生成并写进去', async () => {
    expect(store.getItem(KEY)).toBeNull();
    const id = await ensureId();
    const raw = store.getItem(KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as { v: number; uid: string; key: string; createdAt: number };
    expect(parsed.v).toBe(1);
    expect(parsed.uid).toBe(id?.uid);
    expect(parsed.key).toBe(id?.key);
    expect(typeof parsed.createdAt).toBe('number');
    expect(loadId()?.uid).toBe(id?.uid);
  });

  it('已经有了就原样不动（不换 uid、不换 key）', async () => {
    const first = await ensureId();
    const raw1 = store.getItem(KEY);
    const second = await ensureId();
    expect(second?.uid).toBe(first?.uid);
    expect(second?.key).toBe(first?.key);
    expect(store.getItem(KEY)).toBe(raw1);
  });

  it('坏掉的内容当作没有，重新造一把并覆盖', async () => {
    store.setItem(KEY, '{不是 json');
    expect(loadId()).toBeNull();
    const id = await ensureId();
    expect(id).not.toBeNull();
    expect(isV4Uuid(id?.uid)).toBe(true);

    // 形状不对的（uid 不是 v4、key 长度不对）也不认
    store.setItem(KEY, JSON.stringify({ v: 1, uid: 'not-a-uuid', key: '123', createdAt: 1 }));
    expect(loadId()).toBeNull();
    const again = await ensureId();
    expect(isSyncKey(again?.key)).toBe(true);
  });

  it('存不下 localStorage 时也给得出一把（这一回照样能同步）', async () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    } as unknown as Storage;
    setStorageForTest(broken);
    const id = await ensureId();
    expect(isV4Uuid(id?.uid)).toBe(true);
    expect(isSyncKey(id?.key)).toBe(true);
    expect(loadId()).toBeNull();
  });
});
