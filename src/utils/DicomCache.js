/**
 * DICOM Persistent Cache Utility
 * Leverages IndexedDB to store hydrated DICOM series (blobs) across sessions.
 * 
 * Storage Schema:
 * - Database: 1Rad_ClinicalCache
 * - Store: assets
 * - Key: assetId (string)
 * - Value: { id, name, type, remoteUrl, series: [ { name, rawFiles: [Blob] } ], timestamp }
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

export const DicomCache = {
  /**
   * Retrieves a cached asset by its unique identifier.
   */
  async get(assetId) {
    if (!assetId) return null;
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(assetId);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (err) {
      console.warn('[CACHE] Retrieval failed', err);
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
        
        const record = {
          ...assetData,
          id: assetId,
          timestamp: Date.now()
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
   * Clears old assets to manage storage quota (LRU logic can be added here).
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
