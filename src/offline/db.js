import Dexie from 'dexie';

export const db = new Dexie('1RadOfflineDB');

db.version(1).stores({
  // outbox stores pending mutations (POST/PATCH/PUT/DELETE)
  // id is auto-incrementing to ensure FIFO processing
  outbox: '++id, url, method, timestamp'
});
