// Radiology terminology — frequency-ranked 68k RadLex corpus for autocomplete.
//
// Loads /data/radlex_ranked.json (built by scripts/build-radlex-corpus.mjs):
//   { terms: string[] sorted A–Z, freq: number[] aligned }
// and builds a WORD-PREFIX index — every word in every term, not just the
// first — so "effus" finds "Pleural effusion", and matches are ranked by the
// frequency score (curated/used terms first), not alphabetically.
//
// Why client-side: instant (no per-keystroke network), works offline in the
// Electron app, and the ranking is ours to control. The corpus is a static
// asset, so the browser HTTP-caches it after the first load; the word index is
// built once on warm-up (the reporting page calls warmRadiologyData on mount).
//
// Failure mode: if the corpus fetch fails, search() falls back to a small
// hardcoded list so the editor's autocomplete never goes silent.

import { MEDICAL_TERMS as FALLBACK_TERMS } from '../components/NarrativeEditor/extensions/medicalTerms';

const DATA_URL = (import.meta.env.BASE_URL || '/') + 'data/radlex_ranked.json';

let _terms = null;       // string[] — display labels, aligned with _freq
let _freq = null;        // number[] — frequency/relevance score per term
let _wordIndex = null;   // [{ w, i }] sorted by w — word → term-index postings
let _initPromise = null; // single-flight init

// Build the word-prefix index: one entry per distinct word (≥2 chars) in each
// term label, sorted by word so a prefix range is a contiguous slice.
function buildWordIndex(terms) {
  const idx = [];
  for (let i = 0; i < terms.length; i++) {
    const seen = new Set();
    for (const w of String(terms[i]).toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 2 && !seen.has(w)) { seen.add(w); idx.push({ w, i }); }
    }
  }
  idx.sort((a, b) => (a.w < b.w ? -1 : a.w > b.w ? 1 : 0));
  return idx;
}

function ensureInit() {
  if (_terms && _wordIndex) return Promise.resolve();
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      _terms = Array.isArray(json?.terms) ? json.terms : [];
      _freq = Array.isArray(json?.freq) ? json.freq : _terms.map(() => 0);
    } catch (err) {
      console.warn('[radiologyData] corpus load failed, using fallback list', err?.message || err);
      _terms = FALLBACK_TERMS.slice();
      _freq = _terms.map(() => 0);
    }
    _wordIndex = buildWordIndex(_terms);
    console.info(`[radiologyData] indexed ${_terms.length} terms, ${_wordIndex.length} word postings`);
  })();
  return _initPromise;
}

// Warm the cache + index (the reporting page calls this on mount so the data is
// ready by the time the user types). Safe to call repeatedly.
export function warmRadiologyData() {
  ensureInit().catch(() => { /* already logged */ });
}

// Sync "is the index ready?" probe.
export function isReady() {
  return !!(_terms && _wordIndex);
}

// Lower-bound binary search: first index in _wordIndex whose word >= q.
function lowerBound(q) {
  let lo = 0, hi = _wordIndex.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (_wordIndex[mid].w < q) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/**
 * Search: terms where ANY word starts with `query`, ranked by relevance.
 * Returns [{ id, label }] (id = corpus index, usable with getById). Empty until
 * the index has loaded (the plugin warms it on mount, so it's ready by typing).
 */
export function search(query, limit = 12) {
  const q = (query || '').trim().toLowerCase();
  if (q.length < 2 || !_wordIndex) return [];

  // Walk the contiguous prefix range in the sorted word index, scoring each
  // candidate term once (best of its matching words).
  const scoreByTerm = new Map();
  for (let k = lowerBound(q); k < _wordIndex.length; k++) {
    const e = _wordIndex[k];
    if (!e.w.startsWith(q)) break;
    const label = _terms[e.i];
    const base = _freq[e.i] || 0;
    // Boosts: a first-word (label prefix) match is more relevant than a
    // mid-phrase word match; an exact word hit ("nodule" == "nodule") beats a
    // partial ("nodul" → "nodular").
    const firstWord = label.toLowerCase().startsWith(q) ? 2000 : 0;
    const exactWord = e.w === q ? 500 : 0;
    const s = base + firstWord + exactWord;
    const prev = scoreByTerm.get(e.i);
    if (prev === undefined || s > prev) scoreByTerm.set(e.i, s);
  }

  return [...scoreByTerm.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([i]) => ({ id: i, label: _terms[i] }));
}

// Return a term by its corpus index.
export function getById(id) {
  if (!_terms || id == null || id < 0 || id >= _terms.length) return null;
  return { id, label: _terms[id] };
}

// The medical half of the spell-checker's dictionary: every distinct word (≥3
// alphabetic chars, internal hyphens allowed) that appears in any RadLex term
// label. Built straight off the word-prefix index so it costs nothing extra.
// Returns null until the corpus has loaded (callers warm it first, then read).
// 2-char tokens (ct, ap) are intentionally dropped — those are caught by the
// checker's ALL-CAPS abbreviation rule instead.
export function getMedicalWords() {
  if (!_wordIndex) return null;
  const set = new Set();
  for (const e of _wordIndex) {
    if (e.w.length >= 3 && /^[a-z][a-z-]*$/.test(e.w)) set.add(e.w);
  }
  return set;
}

// Per-word relevance score: the highest term frequency among all RadLex terms
// that contain this word. Used to rank spell-correction suggestions so the
// clinically common term surfaces first (e.g. "effusion" over "effuse"). Built
// lazily off the word index; returns 0 for unknown words / before load.
let _wordFreq = null;
export function getWordFrequency(word) {
  if (!_wordIndex || !_freq) return 0;
  if (!_wordFreq) {
    _wordFreq = new Map();
    for (const e of _wordIndex) {
      const f = _freq[e.i] || 0;
      const prev = _wordFreq.get(e.w);
      if (prev === undefined || f > prev) _wordFreq.set(e.w, f);
    }
  }
  return _wordFreq.get(word) || 0;
}
