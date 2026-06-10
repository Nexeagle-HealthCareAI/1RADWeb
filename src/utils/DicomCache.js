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
// Per-slice compressed-bytes store for the manifest (Option C) path. Each
// record is one DICOM instance's compressed bytes keyed by its (immutable)
// slice URL — so re-opening a study serves from disk instead of re-fetching
// every slice. `assets` keeps the legacy whole-ZIP series records.
const SLICE_STORE = 'slices';
const DB_VERSION = 2;

// A single shared connection. Opening IndexedDB is a handshake we don't want
// to repeat on every get/set/delete — so the open promise is cached and
// reused. It's reset to null if the connection ever goes away (another tab's
// version upgrade, browser-initiated close) so the next call transparently
// reopens instead of throwing InvalidStateError on a dead handle.
let dbPromise = null;

const openDB = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      // v2: per-slice compressed-bytes store. `lastAccessed` index lets
      // eviction stream the oldest keys WITHOUT deserialising the blobs.
      if (!db.objectStoreNames.contains(SLICE_STORE)) {
        const sliceStore = db.createObjectStore(SLICE_STORE, { keyPath: 'key' });
        sliceStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // Drop the cached handle when the connection closes so we reopen lazily.
      db.onclose = () => { dbPromise = null; };
      db.onversionchange = () => { try { db.close(); } catch { /* noop */ } dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  // A failed open must not poison every future call.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
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
        } catch { /* not fatal */ }
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
   * Deletes many assets in a SINGLE transaction. Eviction previously opened
   * the DB and a fresh readwrite transaction per entry (N round trips); this
   * collapses an N-entry eviction into one transaction commit.
   */
  async deleteMany(assetIds) {
    const list = (assetIds || []).filter(Boolean);
    if (list.length === 0) return;
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const id of list) store.delete(id);
        // Resolve on the transaction commit, not per-request — one round trip.
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[CACHE] Bulk delete failed', err);
    }
  },

  // ── Per-slice compressed cache (manifest / Option C path) ───────────────

  /**
   * Returns the cached compressed Blob for a slice URL, or null on miss.
   * No LRU touch here — we use write-time recency (see putSlices), which
   * avoids re-writing the blob on every read (IndexedDB has no partial update).
   */
  async getSlice(key) {
    if (!key) return null;
    try {
      const db = await openDB();
      const rec = await new Promise((resolve, reject) => {
        const tx = db.transaction(SLICE_STORE, 'readonly');
        const req = tx.objectStore(SLICE_STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return rec?.blob || null;
    } catch (err) {
      console.warn('[CACHE] getSlice failed', err);
      return null;
    }
  },

  /**
   * Persists many slices' compressed bytes in a SINGLE transaction. The viewer
   * buffers freshly-fetched slices and flushes them here per series, so a
   * 200-slice study is a handful of commits, not 200.
   *   records: [{ key, blob, size? }]
   */
  async putSlices(records) {
    const list = (records || []).filter((r) => r && r.key && r.blob);
    if (list.length === 0) return;
    try {
      const db = await openDB();
      const now = Date.now();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(SLICE_STORE, 'readwrite');
        const store = tx.objectStore(SLICE_STORE);
        for (const r of list) {
          store.put({ key: r.key, blob: r.blob, size: r.size ?? r.blob.size ?? 0, lastAccessed: now });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[CACHE] putSlices failed', err);
    }
  },

  /**
   * Deletes many slices in one transaction (used by eviction).
   */
  async deleteManySlices(keys) {
    const list = (keys || []).filter(Boolean);
    if (list.length === 0) return;
    try {
      const db = await openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(SLICE_STORE, 'readwrite');
        const store = tx.objectStore(SLICE_STORE);
        for (const k of list) store.delete(k);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[CACHE] Bulk slice delete failed', err);
    }
  },

  /**
   * Lightweight slice listing for eviction: {key, lastAccessed} for every
   * slice, oldest first — read via a key cursor on the lastAccessed index so
   * the (large) blobs are never deserialised into memory.
   */
  async _getSliceMetaLite() {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const out = [];
        const tx = db.transaction(SLICE_STORE, 'readonly');
        const cursorReq = tx.objectStore(SLICE_STORE).index('lastAccessed').openKeyCursor();
        cursorReq.onsuccess = (e) => {
          const cur = e.target.result;
          if (cur) {
            out.push({ key: cur.primaryKey, lastAccessed: cur.key });
            cur.continue();
          } else {
            resolve(out);
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });
    } catch (err) {
      console.warn('[CACHE] slice meta scan failed', err);
      return [];
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
    const freedBytes = toEvict.reduce((sum, m) => sum + (m.bytes || 0), 0);
    await this.deleteMany(toEvict.map(m => m.id));
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
      } catch { /* fall through */ }
    }

    let free = estimateAvailable ? (quota - usage) : 0;
    if (estimateAvailable && free >= targetFreeBytes) {
      return { evictedCount: 0, freedBytes: 0 };
    }

    // Build ONE oldest-first list across both stores so eviction is true LRU
    // over everything we hold — whole-ZIP series (assets) and per-slice bytes
    // (slices) — instead of starving one store while the other grows.
    const assetMeta = await this.getAllMeta();         // {id, bytes, lastAccessed}
    const sliceMeta = await this._getSliceMetaLite();  // {key, lastAccessed} (no bytes)
    const combined = [
      ...assetMeta.map(m => ({ kind: 'asset', ref: m.id, bytes: m.bytes || 0, lastAccessed: m.lastAccessed || 0 })),
      ...sliceMeta.map(m => ({ kind: 'slice', ref: m.key, bytes: 0, lastAccessed: m.lastAccessed || 0 })),
    ].sort((a, b) => a.lastAccessed - b.lastAccessed);

    const assetIds = [];
    const sliceKeys = [];
    let evictedCount = 0;
    let freedBytes = 0;
    let sinceRecheck = 0;
    for (const m of combined) {
      if (estimateAvailable && free >= targetFreeBytes) break;
      if (m.kind === 'asset') assetIds.push(m.ref); else sliceKeys.push(m.ref);
      evictedCount++;
      freedBytes += m.bytes || 0;
      free += m.bytes || 0; // local accounting for assets; slices use the estimate
      // Slice byte sizes aren't in the lite scan, so re-poll the real estimate
      // periodically to know when we've freed enough.
      if (estimateAvailable && ++sinceRecheck >= 50) {
        sinceRecheck = 0;
        try {
          const e = await navigator.storage.estimate();
          free = (e.quota || 0) - (e.usage || 0);
        } catch { /* keep local accounting */ }
      }
    }
    if (assetIds.length) await this.deleteMany(assetIds);
    if (sliceKeys.length) await this.deleteManySlices(sliceKeys);
    if (evictedCount > 0) {
      console.log(`[CACHE] LRU evicted ${assetIds.length} series + ${sliceKeys.length} slices to free space`);
    }
    return { evictedCount, freedBytes };
  },

  /**
   * Clears the entire cache (both stores). Called on logout for PHI hygiene.
   */
  async clear() {
    try {
      const db = await openDB();
      await new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME, SLICE_STORE], 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.objectStore(SLICE_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();   // best-effort
        tx.onabort = () => resolve();
      });
    } catch (err) {
      console.warn('[CACHE] Clear failed', err);
    }
  }
};
