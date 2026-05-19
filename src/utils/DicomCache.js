/**
 * DICOM Persistent Cache Utility
 * Leverages IndexedDB to store hydrated DICOM series (blobs) across sessions.
 *
 * Storage Schema:
 * - Database: 1Rad_ClinicalCache
 * - Store: assets
 * - Key: assetId (string)
 * - Value: {
 *     id, name, type, remoteUrl,
 *     series: [ { name, rawFiles: [Blob|File], ... } ],
 *     timestamp,           // when cached (creation)
 *     lastAccessed         // when last read for viewing (LRU key)
 *   }
 *
 * Eviction:
 * - Manual via evictOldest(n) or evictUntilFree(targetFreeBytes).
 * - The prefetcher calls evictUntilFree when storage tightens; nothing evicts on its own.
 */

const DB_NAME = '1Rad_ClinicalCache';
const STORE_NAME = 'assets';
const DB_VERSION = 1;

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Sum the byte size of all File/Blob objects in a record. Used for eviction accounting.
function recordBytes(record) {
  let bytes = 0;
  for (const s of record?.series || []) {
    for (const f of s?.rawFiles || []) {
      if (typeof f?.size === 'number') bytes += f.size;
    }
  }
  return bytes;
}

export const DicomCache = {
  /**
   * Retrieves a cached asset by its unique identifier and updates lastAccessed.
   * Use peek(id) when you only want to check existence without touching LRU.
   */
  async get(assetId) {
    if (!assetId) return null;
    try {
      const db = await openDB();
      const record = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(assetId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (record) {
        // Update lastAccessed (fire-and-forget so reads stay fast)
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put({ ...record, lastAccessed: Date.now() });
        } catch (e) { /* not fatal */ }
      }
      return record;
    } catch (err) {
      console.warn('[CACHE] Retrieval failed', err);
      return null;
    }
  },

  /**
   * Like get() but does NOT update lastAccessed. Use for existence checks
   * (e.g. the prefetcher's "should I skip this one?") so cache freshness reflects
   * actual user views, not background scans.
   */
  async peek(assetId) {
    if (!assetId) return null;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(assetId);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[CACHE] Peek failed', err);
      return null;
    }
  },

  /**
   * Persists a hydrated asset to the local database.
   */
  async set(assetId, assetData) {
    if (!assetId || !assetData) return;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const now = Date.now();
        const record = {
          ...assetData,
          id: assetId,
          timestamp: assetData.timestamp || now,
          lastAccessed: now,
        };

        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('[CACHE] Storage failed', err);
    }
  },

  /**
   * Removes a single asset.
   */
  async delete(assetId) {
    if (!assetId) return;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).delete(assetId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('[CACHE] Delete failed', err);
    }
  },

  /**
   * Lightweight scan: returns metadata for every entry (no rawFiles), sorted by
   * lastAccessed ASCENDING (oldest first). Suitable for eviction planning and
   * diagnostic UIs.
   */
  async getAllMeta() {
    try {
      const db = await openDB();
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      const meta = records.map(r => ({
        id: r.id,
        name: r.name,
        timestamp: r.timestamp || 0,
        lastAccessed: r.lastAccessed || r.timestamp || 0,
        bytes: recordBytes(r),
        seriesCount: (r.series || []).length,
      }));
      meta.sort((a, b) => a.lastAccessed - b.lastAccessed);
      return meta;
    } catch (err) {
      console.warn('[CACHE] Meta scan failed', err);
      return [];
    }
  },

  /**
   * Drops the N oldest entries by lastAccessed.
   * Returns { evictedCount, freedBytes }.
   */
  async evictOldest(count) {
    if (!count || count <= 0) return { evictedCount: 0, freedBytes: 0 };
    const meta = await this.getAllMeta();
    const toEvict = meta.slice(0, count);
    let freedBytes = 0;
    for (const m of toEvict) {
      await this.delete(m.id);
      freedBytes += m.bytes || 0;
    }
    if (toEvict.length > 0) {
      console.log(`[CACHE] LRU evicted ${toEvict.length} entries (~${(freedBytes / 1e6).toFixed(1)} MB)`);
    }
    return { evictedCount: toEvict.length, freedBytes };
  },

  /**
   * Evict oldest entries until storage has at least targetFreeBytes free, or
   * we run out of evictable entries. Returns { evictedCount, freedBytes }.
   *
   * Uses navigator.storage.estimate() to gauge progress; falls back to summing
   * our own per-record byte counts when the estimate is unavailable.
   */
  async evictUntilFree(targetFreeBytes) {
    let quota = 0;
    let usage = 0;
    let estimateAvailable = false;
    if (navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        quota = est.quota || 0;
        usage = est.usage || 0;
        estimateAvailable = quota > 0;
      } catch (e) { /* fall through */ }
    }

    let free = estimateAvailable ? (quota - usage) : 0;
    if (estimateAvailable && free >= targetFreeBytes) {
      return { evictedCount: 0, freedBytes: 0 };
    }

    const meta = await this.getAllMeta();
    let evictedCount = 0;
    let freedBytes = 0;
    for (const m of meta) {
      if (estimateAvailable && free >= targetFreeBytes) break;
      await this.delete(m.id);
      evictedCount++;
      freedBytes += m.bytes || 0;
      free += m.bytes || 0; // local accounting in case estimate lags
    }
    if (evictedCount > 0) {
      console.log(`[CACHE] LRU evicted ${evictedCount} entries (~${(freedBytes / 1e6).toFixed(1)} MB) to free space`);
    }
    return { evictedCount, freedBytes };
  },

  /**
   * Clears the entire cache. Called on logout for PHI hygiene.
   */
  async clear() {
    try {
      const db = await openDB();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
    } catch (err) {
      console.warn('[CACHE] Clear failed', err);
    }
  }
};
