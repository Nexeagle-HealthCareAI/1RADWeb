/**
 * PrefetchSettings
 * Per-user-device preferences for background DICOM prefetch.
 *
 * Persisted in localStorage so they survive reloads. Listeners are notified
 * synchronously when a value changes — used by the prefetcher to re-evaluate
 * its guardrails when the user toggles cellular permission.
 */

const STORAGE_KEY = '1rad_prefetch_settings';

const defaults = {
  allowCellular: false,
  paused: false,
};

function readFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (e) {
    return { ...defaults };
  }
}

function writeToStorage(values) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch (e) {
    console.warn('[PREFETCH] Failed to persist settings', e);
  }
}

let current = readFromStorage();
const listeners = new Set();

export const PrefetchSettings = {
  get() {
    return { ...current };
  },

  set(patch) {
    current = { ...current, ...patch };
    writeToStorage(current);
    const snapshot = { ...current };
    listeners.forEach(fn => {
      try { fn(snapshot); } catch (e) { /* swallow */ }
    });
  },

  subscribe(fn) {
    listeners.add(fn);
    fn({ ...current });
    return () => listeners.delete(fn);
  },
};
