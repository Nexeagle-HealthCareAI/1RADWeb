// Radiology terminology data layer.
//
// Loads the 1,621-term corpus from /data/autocomplete_light.json on first
// use, builds a Fuse.js fuzzy-search index, and exposes a `search(query)`
// API that the editor's autocomplete plugin consumes.
//
// Why a dedicated module:
//   - The catalogue is 329 KB JSON. Loading it eagerly at boot would inflate
//     first-paint and bloat the offline cache. Lazy-fetch keeps the cold
//     login fast.
//   - The Fuse index build is ~30-80ms for 1,621 entries; doing it once
//     here means every search() call is sub-millisecond.
//   - Centralised so future surfaces (search-by-impression, normal-findings
//     picker, etc.) can reuse the same corpus + index.
//
// Failure mode: if the fetch fails (offline, missing file), search() falls
// back to a minimal hardcoded list so the editor's autocomplete never
// goes completely silent. The fallback is a small subset of the corpus
// so the UI still works, just less rich.

import Fuse from 'fuse.js';
import { MEDICAL_TERMS as FALLBACK_TERMS } from '../components/NarrativeEditor/extensions/medicalTerms';

const DATA_URL = '/data/autocomplete_light.json';

let _terms = null;       // [{ id, label, cat, short, key, alt }]
let _fuse = null;        // Fuse instance
let _initPromise = null; // Single-flight init

// Initialise once. Subsequent callers await the same promise.
function ensureInit() {
  if (_terms && _fuse) return Promise.resolve();
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      _terms = Array.isArray(json?.terms) ? json.terms : [];
    } catch (err) {
      console.warn('[radiologyData] Failed to load corpus, using fallback list', err?.message || err);
      // Adapt the flat-string fallback to the same {label, cat, short} shape so
      // downstream code doesn't branch on shape.
      _terms = FALLBACK_TERMS.map((label, idx) => ({
        id: -idx,
        label,
        cat: 'Term',
        short: '',
        key: label.toLowerCase(),
        alt: '',
      }));
    }
    // Fuse index. Weighted to favour label matches; key (lowercased label)
    // catches typos that hit consonants out of order; alt covers short-def
    // matches so a radiologist searching "fluid in pleural space" finds
    // "Pleural effusion" via its alt text.
    _fuse = new Fuse(_terms, {
      keys: [
        { name: 'label', weight: 0.6 },
        { name: 'key',   weight: 0.3 },
        { name: 'alt',   weight: 0.1 },
      ],
      threshold: 0.35,
      includeScore: true,
      minMatchCharLength: 2,
      ignoreLocation: true,
    });
  })();
  return _initPromise;
}

// Eager-init helper exported for callers that want to warm the cache (e.g.
// when the user opens the reporting page — autocomplete is one keystroke
// away). Safe to call multiple times.
export function warmRadiologyData() {
  ensureInit().catch(() => { /* already logged */ });
}

// Synchronous "is the data ready?" probe — used by the autocomplete plugin
// so it can decide whether to fall back to a startsWith filter on the cached
// fallback while the fetch is in flight.
export function isReady() {
  return !!(_terms && _fuse);
}

// Sync search — returns [] if data hasn't loaded yet. The plugin warms the
// cache on first mount so by the time the user types, results are ready.
// Falls through to a simple startsWith filter on the in-memory list before
// Fuse is ready so the user isn't staring at an empty popup on first
// keystrokes after a cold boot.
export function search(query, limit = 12) {
  if (!query || query.length < 2) return [];
  if (!_fuse) {
    // Fast best-effort fallback while the corpus is still loading.
    if (!_terms) return [];
    const q = query.toLowerCase();
    return _terms
      .filter(t => (t.label || '').toLowerCase().startsWith(q))
      .slice(0, limit);
  }
  return _fuse
    .search(query, { limit })
    .map(r => r.item);
}

// Return a term by its corpus id (used by the popup to fetch a richer
// definition when a row is hovered/expanded).
export function getById(id) {
  if (!_terms) return null;
  return _terms.find(t => t.id === id) || null;
}
