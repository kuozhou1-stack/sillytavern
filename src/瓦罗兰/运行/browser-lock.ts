import { randomUUID } from './browser-crypto';

export type BrowserLock = { assertHeld(): void };
type Options = { ifAvailable?: boolean; onLost?: (error: Error) => void };
type Lease = { owner: string; until: number };
const databaseName = 'valoran-browser-locks-v1';
const leaseDuration = 120_000;
const renewalInterval = 10_000;
let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('locks');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? Error('无法打开浏览器互斥存储'));
    request.onblocked = () => reject(Error('浏览器互斥存储被旧页面占用，请关闭旧页面后重试'));
  }).catch(error => { database = undefined; throw error; });
  return database;
}

/** readwrite transactions arbitrate between both iframes and browser tabs. */
async function changeLease(name: string, owner: string, operation: 'acquire' | 'renew' | 'release') {
  const db = await openDatabase();
  return new Promise<number>((resolve, reject) => {
    const transaction = db.transaction('locks', 'readwrite');
    const store = transaction.objectStore('locks');
    const request = store.get(name);
    let deadline = 0;
    request.onsuccess = () => {
      const current = request.result as Lease | undefined;
      const now = Date.now();
      if (operation === 'release') {
        // A late unload must never release a newer owner's lock.
        if (current?.owner === owner) store.delete(name);
      } else if (operation === 'acquire' ? !current || current.until <= now : current?.owner === owner && current.until > now) {
        deadline = now + leaseDuration;
        store.put({ owner, until: deadline } satisfies Lease, name);
      }
    };
    transaction.oncomplete = () => resolve(deadline);
    transaction.onabort = () => reject(transaction.error ?? Error('浏览器互斥存储事务失败'));
    transaction.onerror = () => reject(transaction.error ?? Error('浏览器互斥存储不可用'));
  });
}

/** Native Web Locks require a secure context; LAN HTTP uses an expiring, guarded lease. */
export async function requestBrowserLock<T>(name: string, options: Options, callback: (lock: BrowserLock | null) => T | Promise<T>): Promise<T> {
  if (typeof navigator.locks?.request === 'function') {
    return navigator.locks.request(name, { ifAvailable: options.ifAvailable ?? false }, lock =>
      callback(lock ? { assertHeld() {} } : null));
  }
  if (typeof indexedDB === 'undefined') throw Error('浏览器不支持写入保护存储，请允许站点存储或使用 HTTPS 访问');
  const owner = randomUUID();
  let deadline = 0;
  let ended = false;
  let lost: Error | undefined;
  let renewing = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const release = () => changeLease(name, owner, 'release').catch(error => {
    console.warn('[瓦洛兰写入保护] 释放失败，将等待租约过期', error);
  });
  const lose = (error: Error) => {
    if (ended || lost) return;
    lost = error;
    if (timer) clearInterval(timer);
    options.onLost?.(error);
  };
  const assertHeld = () => {
    if (!lost && (ended || Date.now() >= deadline))
      lose(Error('页面暂停过久，写入保护已失效；请重新打开聊天后继续'));
    if (lost) throw lost;
    if (ended) throw Error('本次写入保护已结束');
  };
  const unload = () => {
    lose(Error('页面已关闭，本次写入已停止'));
    ended = true;
    if (timer) clearInterval(timer);
    void release();
  };
  window.addEventListener('pagehide', unload, { once: true });
  try {
    const waitingSince = Date.now();
    do {
      if (ended) throw Error('页面已关闭，已取消等待写入保护');
      deadline = await changeLease(name, owner, 'acquire');
      if (ended || lost) throw lost ?? Error('页面已关闭，已取消等待写入保护');
      if (deadline) break;
      if (options.ifAvailable) return await callback(null);
      if (Date.now() - waitingSince >= leaseDuration + renewalInterval)
        throw Error('其他页面仍在保存设置，请稍后重试');
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (!deadline);
    assertHeld();
    timer = setInterval(() => {
      if (ended || lost || renewing) return;
      try { assertHeld(); } catch { return; }
      renewing = true;
      void changeLease(name, owner, 'renew').then(next => {
        // Do not revive a lease after suspension or a failed ownership check.
        assertHeld();
        if (!next) throw Error('写入保护已被其他页面接管，请重新打开聊天');
        deadline = next;
      }).catch(error => lose(error instanceof Error ? error : Error(String(error))))
        .finally(() => { renewing = false; });
    }, renewalInterval);
    const result = await callback({ assertHeld });
    assertHeld();
    return result;
  } finally {
    ended = true;
    if (timer) clearInterval(timer);
    window.removeEventListener('pagehide', unload);
    await release();
  }
}
