// Voice-dictation data layer.
//
// Loads /data/speech_dictionary.json once: the 58 vetted radiology
// misheard→correct pairs ("hype arrest" → "hyperintense", etc.). Builds a
// pre-compiled regex array so applyCorrections() over a transcript is O(n)
// in the corrections list, not O(n×m) with a fresh RegExp per call.
//
// Also fetches /data/speech_grammar.jsgf — the JSGF grammar list with
// ~500 radiology terms. SpeechRecognition.grammars accepts this via
// SpeechGrammarList.addFromString() and primes the engine, giving better
// transcripts BEFORE any correction layer runs. Chrome/Edge accept it;
// Safari/Firefox don't ship SpeechGrammarList — we degrade silently.
//
// Public API:
//   warmVoiceData()        - fire-and-forget cache priming
//   applyCorrections(text) - misheard→correct (returns same shape)
//   getGrammarText()       - JSGF body for grammars attachment, or null

const DICT_URL    = '/data/speech_dictionary.json';
const GRAMMAR_URL = '/data/speech_grammar.jsgf';

let _corrections = null;  // [{re: RegExp, replace: string}]
let _grammarText = null;  // string | '' (loaded but empty if fetch failed)
let _initPromise = null;

function escapeRx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureInit() {
  if (_corrections && _grammarText !== null) return Promise.resolve();
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    // Corrections — non-fatal if the file is missing; useVoiceDictation
    // already has a small hardcoded fallback so dictation still works.
    try {
      const res = await fetch(DICT_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const pairs = Array.isArray(json?.corrections) ? json.corrections : [];
      _corrections = pairs
        .filter(p => p?.misheard && p?.correct)
        .map(p => ({
          // Word-bound case-insensitive global match. We escape the misheard
          // phrase rather than treating it as a regex so multi-word phrases
          // like "hype a dense" match as written.
          re: new RegExp(`\\b${escapeRx(p.misheard)}\\b`, 'gi'),
          replace: p.correct,
        }));
    } catch (err) {
      console.warn('[voiceCorrections] dictionary load failed', err?.message || err);
      _corrections = [];
    }
    // Grammar - non-fatal. If the file is unreachable or SpeechGrammarList
    // doesn't exist (Safari), useVoiceDictation skips the attachment step.
    try {
      const res = await fetch(GRAMMAR_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _grammarText = await res.text();
    } catch (err) {
      console.warn('[voiceCorrections] grammar load failed', err?.message || err);
      _grammarText = '';
    }
  })();
  return _initPromise;
}

export function warmVoiceData() {
  ensureInit().catch(() => { /* already logged */ });
}

export function isReady() {
  return _corrections != null && _grammarText != null;
}

// Apply the JSON corrections to a transcript chunk. Cheap; the regexes are
// pre-compiled once. Returns the input unchanged if the data hasn't loaded
// yet so dictation never blocks waiting for the fetch.
export function applyCorrections(text) {
  if (!text || !_corrections) return text;
  let out = text;
  for (const { re, replace } of _corrections) {
    if (re.test(out)) out = out.replace(re, replace);
  }
  return out;
}

// Returns the JSGF body string for SpeechGrammarList.addFromString, or
// null if not loaded / fetch failed.
export function getGrammarText() {
  return _grammarText || null;
}
