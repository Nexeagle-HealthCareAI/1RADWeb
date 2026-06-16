// Radiology-aware spell-checking dictionary for the NarrativeEditor.
//
// Detection is a pure set-membership test, so it runs LIVE in the ProseMirror
// plugin on every keystroke-debounce with no network and no engine:
//
//   valid(word) = englishDict ∪ medicalWords ∪ customDict ∪ ignored ∪ isProtected
//
//   • englishDict  — /data/spell_en.json (en-GB ∪ en-US, ~115k; built by
//                    scripts/build-spell-dictionary.mjs)
//   • medicalWords — derived at runtime from the already-loaded radlex_ranked.json
//                    (src/data/radiologyData.getMedicalWords)
//   • customDict   — clinic-shared "Add to dictionary" words (localStorage cache
//                    now; hydrated from the backend in a later increment)
//   • isProtected  — numbers, measurements (3.2cm), MR sequences (T2), levels
//                    (L4-L5), ALL-CAPS abbreviations (MRI/FLAIR) — never flagged
//
// Suggestions (getSuggestions) are on-demand only — fired when the user opens a
// squiggle's menu — so they can afford a bounded edit-distance scan.
//
// Lenient by design: both 'tumour' and 'tumor' pass; only genuine typos flag.
// en-GB house-style enforcement stays the RadAI formatter's job.

import { warmRadiologyData, getMedicalWords, getWordFrequency } from './radiologyData';

const EN_URL = '/data/spell_en.json';
const CUSTOM_KEY = 'narrative-editor:custom-dict';

// Common English contractions — whitelisted so the apostrophe-free dictionary
// doesn't have to validate them. (Possessives like "patient's" are validated by
// stem instead — see isWordValid — so a misspelled stem like "recieve's" still
// flags.)
const CONTRACTIONS = new Set([
  "don't", "doesn't", "didn't", "isn't", "wasn't", "aren't", "weren't",
  "can't", "cannot", "couldn't", "won't", "wouldn't", "shouldn't", "mustn't",
  "hasn't", "haven't", "hadn't", "it's", "that's", "there's", "here's",
  "they're", "we're", "you're", "i'm", "i've", "we've", "they've", "you've",
  "i'll", "we'll", "they'll", "you'll", "let's", "who's", "what's",
]);

let _english = null;     // Set<string> — general English (lowercased)
let _medical = null;     // Set<string> — RadLex words (lowercased)
let _custom = null;      // Set<string> — learned words (lowercased)
const _ignored = new Set(); // session-only "ignore once" (lowercased)
let _initPromise = null;
let _firstCharBuckets = null; // lazy: firstChar -> string[] for suggestion scan

// ── Custom dictionary (localStorage cache) ─────────────────────────────────
function loadCustom() {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.map((w) => String(w).toLowerCase()) : []);
  } catch { return new Set(); }
}
function persistCustom() {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify([..._custom])); } catch { /* quota/unavailable */ }
}

// ── Init / warm ────────────────────────────────────────────────────────────
export function warmSpellDictionary() {
  if (_english && _medical) return Promise.resolve();
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    _custom = loadCustom();
    // English dict + RadLex corpus load in parallel.
    const [enJson] = await Promise.all([
      fetch(EN_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      warmRadiologyData(),               // ensures the corpus word index is built
    ]);
    _english = new Set(
      (enJson?.words ? String(enJson.words).split('\n') : []).filter(Boolean),
    );
    _medical = getMedicalWords() || new Set();
    console.info(`[spellDictionary] english=${_english.size} medical=${_medical.size} custom=${_custom.size}`);
  })();
  return _initPromise;
}

export function isReady() {
  return !!(_english && _medical);
}

// ── Token classification ───────────────────────────────────────────────────
// Tokens that must NEVER be flagged regardless of dictionary membership. Mirrors
// the backend IRadiologyCorpus.IsProtected intent on the client.
//   • anything containing a digit — measurements (3.2cm), MR sequences (T2),
//     vertebral levels (L4-L5), counts, dates
//   • short ALL-CAPS / mixed-caps abbreviations — MRI, CT, USG, FLAIR, STIR,
//     DWI, ADC, HU, AP, PA, BI-RADS, TI-RADS
//   • single characters
export function isProtected(token) {
  if (!token) return true;
  if (token.length < 3) return true;            // a, an, of, T1 handled elsewhere
  if (/\d/.test(token)) return true;            // any digit → measurement/level/sequence
  // ALL-CAPS (optionally hyphenated) up to 6 letters → abbreviation/acronym.
  const caps = token.replace(/-/g, '');
  if (caps.length <= 6 && caps === caps.toUpperCase() && /[A-Z]/.test(caps)) return true;
  return false;
}

// Strip a trailing possessive and surrounding punctuation, lowercase.
function normalize(token) {
  let w = token.toLowerCase();
  w = w.replace(/^[^a-z]+/, '').replace(/[^a-z-]+$/, ''); // trim non-letters at ends
  if (w.endsWith("'s")) w = w.slice(0, -2);
  return w;
}

// Is this (original-cased) token correctly spelled / not worth flagging?
export function isWordValid(token) {
  if (isProtected(token)) return true;
  // Apostrophe forms: validate possessive stems ("patient's" → check "patient")
  // and whitelist common contractions; any other apostrophe usage stays lenient.
  // This catches a misspelled possessive stem ("recieve's") that the old
  // blanket-skip let through, without flagging legitimate contractions.
  if (/['’]/.test(token)) {
    const low = token.toLowerCase().replace(/^[^a-z'’]+/, '').replace(/[^a-z'’]+$/, '');
    if (CONTRACTIONS.has(low.replace('’', "'"))) return true;
    const poss = low.match(/^([a-z][a-z-]*)['’]s$/);
    if (poss) return isWordValid(poss[1]);       // validate the stem
    return true;                                  // other apostrophe usage
  }
  const w = normalize(token);
  if (w.length < 3) return true;
  if (!_english) return true;                    // not loaded yet → never flag
  if (_english.has(w) || _medical.has(w) || _custom.has(w) || _ignored.has(w)) return true;
  // Hyphenated compound: valid only if every part ≥2 chars is itself valid
  // ("well-defined", "post-contrast"). Single-char parts are accepted; a
  // 2+-char part that isn't a real word ("liver-lesoin") now flags.
  if (w.includes('-')) {
    const parts = w.split('-').filter(Boolean);
    if (parts.length > 1 && parts.every((p) => p.length < 2 || _english.has(p) || _medical.has(p) || _custom.has(p))) {
      return true;
    }
  }
  return false;
}

// ── Mutations: ignore / add / remove ───────────────────────────────────────
export function ignoreWord(token) { _ignored.add(normalize(token)); }

export function addToCustom(token) {
  if (!_custom) _custom = loadCustom();
  const w = normalize(token);
  if (!w) return;
  _custom.add(w);
  persistCustom();
  _firstCharBuckets = null; // invalidate suggestion index (cheap, rebuilt lazily)
}

export function removeFromCustom(token) {
  if (!_custom) return;
  _custom.delete(normalize(token));
  persistCustom();
}

export function isCustom(token) {
  return !!_custom && _custom.has(normalize(token));
}

// Replace the whole custom set (used when the backend clinic dictionary loads).
export function hydrateCustom(words) {
  _custom = new Set((words || []).map((w) => String(w).toLowerCase()).filter(Boolean));
  persistCustom();
  _firstCharBuckets = null;
}

// ── Suggestions (on-demand) ────────────────────────────────────────────────
// Bucket the dictionaries by first character once, so a correction scan only
// touches words sharing the typo's initial letter (most typos preserve it) —
// turning a 185k-word scan into a few-thousand-word one.
function ensureBuckets() {
  if (_firstCharBuckets) return;
  _firstCharBuckets = new Map();
  const add = (w) => {
    const c = w[0];
    let arr = _firstCharBuckets.get(c);
    if (!arr) { arr = []; _firstCharBuckets.set(c, arr); }
    arr.push(w);
  };
  if (_english) for (const w of _english) add(w);
  if (_medical) for (const w of _medical) if (!_english || !_english.has(w)) add(w);
  if (_custom) for (const w of _custom) add(w);
}

// Damerau-Levenshtein with an early-exit ceiling. Returns a distance > max as
// `max + 1` so the caller can cheaply reject.
function boundedDistance(a, b, max) {
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  let prevPrev = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      // transposition
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2] + 1);
      }
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;            // whole row exceeds ceiling → bail
    const tmp = prevPrev; prevPrev = prev; prev = curr; curr = tmp;
  }
  return prev[bl];
}

/**
 * Up to `limit` correction suggestions for a misspelled token, nearest first.
 * Scans only same-initial candidates within a small edit distance, with a tighter
 * ceiling for short words. Returns [] until the dictionaries have loaded.
 */
export function getSuggestions(token, limit = 5) {
  const w = normalize(token);
  if (w.length < 3 || !_english) return [];
  ensureBuckets();
  const max = w.length <= 5 ? 1 : 2;
  const candidates = [];
  // Same first letter is the common case; also peek at the bucket for the second
  // letter in case the first char itself was the typo.
  const buckets = new Set([w[0], w[1]].filter(Boolean));
  for (const c of buckets) {
    const arr = _firstCharBuckets.get(c);
    if (!arr) continue;
    for (const cand of arr) {
      if (Math.abs(cand.length - w.length) > max) continue;
      const d = boundedDistance(w, cand, max);
      if (d <= max) candidates.push({ cand, d, f: getWordFrequency(cand) });
    }
  }
  // Nearest edit distance first; among equally-near words prefer the clinically
  // more frequent term (RadLex freq), then the shorter word.
  candidates.sort((a, b) => a.d - b.d || b.f - a.f || a.cand.length - b.cand.length);
  const seen = new Set();
  const out = [];
  for (const { cand } of candidates) {
    if (cand === w || seen.has(cand)) continue;
    seen.add(cand);
    out.push(cand);
    if (out.length >= limit) break;
  }
  return out;
}
