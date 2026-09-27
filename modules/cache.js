// modules/cache.js —— 本地素材缓存（IndexedDB，raw 与 ocr 分离）
window.Cache = (function () {
  const DB_NAME = 'xhs-collector';
  const DB_VERSION = 1;
  const STORES = ['raw', 'ocr'];

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'key' }); });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(store, key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put({ key, value, ts: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(store, key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const r = tx.objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result ? r.result.value : null);
      r.onerror = () => reject(r.error);
    });
  }

  async function count(store) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const r = tx.objectStore(store).count();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  async function clear(store) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    putRaw: (key, v) => put('raw', key, v),
    putOcr: (key, v) => put('ocr', key, v),
    getRaw: (key) => get('raw', key),
    getOcr: (key) => get('ocr', key),
    rawCount: () => count('raw'),
    ocrCount: () => count('ocr'),
    clearRaw: () => clear('raw'),
    clearOcr: () => clear('ocr'),
    clearAll: async () => { await clear('raw'); await clear('ocr'); }
  };
})();
