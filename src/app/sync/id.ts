/**
 * 同步用的本地身份：一个 uid（**只是标识**）与一把 key（**凭证**），两者分开存。
 *
 * 为什么分开（docs/DB_SPLIT_FINAL.md §7 契约 C1）：
 *   uid 要进请求头、要作存档外键，迟早会出现在日志或截图里；
 *   若它就是凭证，"知道 uuid 就是本人"。所以凭证另起一把 32 字节随机 key，
 *   服务端只存它的 sha256。key 不叫 anon:*、也不与 uid 有任何派生关系。
 *
 * 这里**不读 import.meta.env**：这个文件只认浏览器能给的东西（crypto / localStorage / IDB），
 * 好在 node 下直接单测（tests/sync-id.test.ts）。
 *
 * 三种运行时都要活：
 *   · https 或 localhost：crypto.randomUUID 有，直接给 v4；
 *   · 局域网 http：randomUUID 是 undefined，退回 crypto.getRandomValues 自己拼 v4（C7，
 *     **绝不退化到 Math.random**——那是可预测的，等于没有 ID）；
 *   · 连 getRandomValues 都没有：返回 null，调用方放弃同步（本地照旧玩）。
 *
 * IndexedDB 只做**只读兜底**：localStorage 里没有这把键时才去 IDB 找一次（清站点数据的
 * 边界情况）；写 IDB 只是顺手备份，不等待、失败全静默。
 */

/**
 * 本文件写的 localStorage 键（**只有这一个**）。
 *
 * 同步层整体在 flag 打开时会用到三个键，分工是刻意分开的（C10 只禁"存身份到存档里"，
 * 不禁止为了同步本身记账；三个键都不含任何存档内容与身份字段的混装）：
 *   · `anlewo:id:v1`     —— 身份：uid（标识）+ key（凭证）。本文件独占。
 *   · `anlewo:sync:v1`   —— 会话锚：上次对齐的 revision 与本地文本摘要，**不含档案内容**。见 sync/reconcile.ts。
 *   · `anlewo:v1`        —— 存档本体，由 store.ts 自己读写的那个键（不归同步层所有）。
 * flag 关着时这三个键一个都不会被创建（同步层根本不会被加载）。
 */
const KEY = 'anlewo:id:v1';
const IDB_NAME = 'anlewo';
const IDB_STORE = 'id';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SYNC_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 一把同步身份：v 是格式版本；key 是凭证明文，只在请求头里出现，不上报任何地方 */
export interface SyncId {
  v: 1;
  uid: string;
  key: string;
  createdAt: number;
}

/** 是不是 v4 uuid（小写、带连字符） */
export const isV4Uuid = (v: unknown): v is string => typeof v === 'string' && UUID_V4_RE.test(v);

/** 是不是我们认的凭证形状：32 字节 base64url，不带填充，43 字符 */
export const isSyncKey = (v: unknown): v is string => typeof v === 'string' && SYNC_KEY_RE.test(v);

// ---------------------------------------------------------------- 存储

let storageOverride: Storage | null | undefined;

/** 单测用：换掉/关掉 localStorage（undefined 表示回到真实环境） */
export function setStorageForTest(s: Storage | null | undefined): void {
  storageOverride = s;
}

/** 单测用：清掉模块上的测试替身 */
export function resetForTest(): void {
  storageOverride = undefined;
}

/** 拿得到就用，拿不到（隐身窗口、被禁用、非浏览器）就 null */
function storage(): Storage | null {
  if (storageOverride !== undefined) return storageOverride;
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null;
    return localStorage;
  } catch {
    // Safari 隐私模式下访问 localStorage 本身就会抛
    return null;
  }
}

/** 把任意来源的东西认成 SyncId；哪一样不对就整条不认 */
function normalize(v: unknown): SyncId | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (!isV4Uuid(o.uid) || !isSyncKey(o.key)) return null;
  if (o.uid === o.key) return null;
  const createdAt = typeof o.createdAt === 'number' && Number.isFinite(o.createdAt) ? o.createdAt : Date.now();
  return { v: 1, uid: o.uid, key: o.key, createdAt };
}

// ---------------------------------------------------------------- 随机

function randomBytes(n: number): Uint8Array | null {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') return null;
  const b = new Uint8Array(n);
  try {
    c.getRandomValues(b);
  } catch {
    return null;
  }
  return b;
}

/** 32 字节 → base64url（不带 '='）：32 字节正好 43 字符。自己算，免得 btoa 在有的运行时里没有 */
function toBase64Url(b: Uint8Array): string {
  const pad = (3 - (b.length % 3)) % 3;
  const buf = new Uint8Array(b.length + pad);
  buf.set(b);
  let out = '';
  for (let i = 0; i < buf.length; i += 3) {
    const x = buf[i];
    const y = buf[i + 1];
    const z = buf[i + 2];
    out += B64URL[x >> 2] + B64URL[((x & 3) << 4) | (y >> 4)] + B64URL[((y & 15) << 2) | (z >> 6)] + B64URL[z & 63];
  }
  return out.slice(0, out.length - pad);
}

/**
 * 造一个 v4 uuid。
 * 先问 crypto.randomUUID（安全上下文才有），没有就自己用 getRandomValues 拼：
 * 第 7 字节的高 4 位定成 0100（版本 4），第 9 字节的高 2 位定成 10（RFC 4122 变体）。
 * 两者都没有 → null（宁可不同步，也不要一个猜得出来的 id）。
 */
export function newUuid(): string | null {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    try {
      const u = c.randomUUID();
      if (isV4Uuid(u)) return u;
    } catch {
      // 落到下面自己拼
    }
  }
  const b = randomBytes(16);
  if (!b) return null;
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  let hex = '';
  for (let i = 0; i < b.length; i += 1) hex += b[i].toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 造一把 32 字节的凭证（43 字符 base64url）；与 uid 无任何关系 */
export function newSyncKey(): string | null {
  const b = randomBytes(32);
  if (!b) return null;
  return toBase64Url(b);
}

// ---------------------------------------------------------------- IndexedDB（只读兜底 + 顺手备份）

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return resolve(null);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        } catch {
          // 建不了就算了：只影响这一回
        }
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

/** 只有 localStorage 里没有这把键时才被调用 */
async function readIdbId(): Promise<SyncId | null> {
  const db = await openIdb();
  if (!db) return null;
  try {
    return await new Promise<SyncId | null>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const g = tx.objectStore(IDB_STORE).get(KEY);
        g.onerror = () => resolve(null);
        g.onsuccess = () => resolve(normalize(g.result));
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  } finally {
    try {
      db.close();
    } catch {
      // 关不上也无所谓
    }
  }
}

/** 顺手往 IDB 放一份：不等结果、不报错（localStorage 才是主存储） */
function writeIdbBestEffort(id: SyncId): void {
  void openIdb().then((db) => {
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(id, KEY);
      tx.oncomplete = () => {
        try {
          db.close();
        } catch {
          /* 关不上 */
        }
      };
      tx.onerror = () => {
        try {
          db.close();
        } catch {
          /* 关不上 */
        }
      };
    } catch {
      try {
        db.close();
      } catch {
        /* 关不上 */
      }
    }
  });
}

// ---------------------------------------------------------------- 对外

/** 读本机已有的身份；没有/坏了就是 null（坏掉的不删，交给 ensureId 覆盖） */
export function loadId(): SyncId | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * 保证有一把身份：localStorage 有就用（**原样不动**），没有就看一眼 IDB，再没有才新造。
 * 造不出来（没有安全随机源）返回 null —— 调用方据此放弃同步，游戏照玩。
 */
export async function ensureId(): Promise<SyncId | null> {
  const existing = loadId();
  if (existing) return existing;

  const fromIdb = await readIdbId();
  if (fromIdb) {
    persist(fromIdb);
    return fromIdb;
  }

  const uid = newUuid();
  const key = newSyncKey();
  if (!uid || !key) return null;

  const id: SyncId = { v: 1, uid, key, createdAt: Date.now() };
  persist(id);
  writeIdbBestEffort(id);
  return id;
}

/** 写进 localStorage：存不下（配额满、隐身窗口）也不影响这一回的使用 */
function persist(id: SyncId): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(id));
  } catch {
    // 存不下就算了：下一回会重新造一个（服务端那边就成了另一台设备）
  }
}

/** 这把身份的凭证（给 client 用，省得每次翻对象） */
export const credentialOf = (id: SyncId): string => id.key;
