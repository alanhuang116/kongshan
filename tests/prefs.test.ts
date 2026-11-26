/**
 * 界面与同游偏好（村人簿「按家 / 按处」、修为「看哪一张榜」、同游的雅号 / 衣色 / 独游开关）要随存档走：
 * 存在 `Saved.world.ui`，跟着 payload 同步到别的设备；旧档没有这一份时用默认值，旧的本机键只作读取兜底。
 * 这里盯着三件事：偏好确实写进了 `Saved`、旧键能一次纳进存档、没有悄悄新增 `Saved` 顶层字段。
 */
import { beforeAll, describe, expect, it } from 'vitest';

type Store = typeof import('../src/app/store');
type IdentityMod = typeof import('../src/world/net/identity');
let store: Store;
let identity: IdentityMod;

/** node 环境里补一个最小的 localStorage（identity 读旧键时用） */
function stubLocalStorage(value: string | null) {
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => (k === 'anlewo:net:v1' ? value : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  };
}

beforeAll(async () => {
  store = await import('../src/app/store');
  identity = await import('../src/world/net/identity');
});

describe('界面偏好', () => {
  it('没存过时用调用方给的默认值', () => {
    expect(store.pref('folkBy', 'home')).toBe('home');
    expect(store.pref('xiuTab', 'xiu')).toBe('xiu');
  });

  it('写进 Saved.world.ui，随存档一起进 payload', () => {
    store.setPref('folkBy', 'place');
    store.setPref('xiuTab', 'archery');
    expect(store.pref('folkBy', 'home')).toBe('place');
    expect(store.pref('xiuTab', 'xiu')).toBe('archery');
    // 序列化后就是推给服务端的那一份 payload
    const payload = JSON.parse(JSON.stringify(store.saved.get())) as { world: { ui?: Record<string, string> } };
    expect(payload.world.ui).toMatchObject({ folkBy: 'place', xiuTab: 'archery' });
  });

  it('没有新增 Saved 顶层字段', () => {
    expect(Object.keys(store.saved.get()).length).toBe(21);
  });
});

describe('同游身份', () => {
  it('雅号、衣色、独游开关写进存档并原样读回', () => {
    stubLocalStorage(null);
    store.setPrefValue('net', undefined);
    const id = { n: [1, 2] as [number, number], c: 3, on: false };
    identity.saveIdentity(id);
    expect(identity.loadIdentity()).toEqual(id);
    const payload = JSON.parse(JSON.stringify(store.saved.get())) as { world: { ui?: { net?: unknown } } };
    expect(payload.world.ui?.net).toEqual({ n: [1, 2], c: 3, on: false });
  });

  it('旧键有值时一次性纳进存档', () => {
    stubLocalStorage(JSON.stringify({ n: [4, 5], c: 2, on: true }));
    store.setPrefValue('net', undefined);
    expect(identity.loadIdentity()).toEqual({ n: [4, 5], c: 2, on: true });
    // 纳进来之后，存档里的这一份就成了以后各设备的依据
    expect(store.prefValue('net', null)).toEqual({ n: [4, 5], c: 2, on: true });
  });

  it('存档里的坏数据不认，旧键不可用时新起一个', () => {
    stubLocalStorage(null);
    store.setPrefValue('net', { n: [999, -1], c: 0, on: true });
    const id = identity.loadIdentity();
    expect(id.n[0]).toBeGreaterThanOrEqual(0);
    expect(id.n[0]).toBeLessThan(1e6);
    expect(id.on).toBe(true);
    expect(store.prefValue('net', null)).toEqual({ n: [id.n[0], id.n[1]], c: id.c, on: id.on });
  });
});
