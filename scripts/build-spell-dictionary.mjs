#!/usr/bin/env node
/**
 * Build the general-English dictionary asset for the NarrativeEditor's live
 * spell-checker (the wavy-red underline).
 *
 * This is the ONE piece the editor was missing: the backend RadLex corpus knows
 * radiology terms but not plain English ("the/patient/unremarkable"), so a
 * checker built on it alone would underline normal prose. This asset supplies
 * the English half; the medical half is derived at runtime from the already
 * loaded radlex_ranked.json (see src/data/spellDictionary.js).
 *
 * Source: `wordlist-english` (MIT) — SCOWL-derived, inflection-rich. We union the
 * variant-neutral base with the American + British (+ Australian + Canadian)
 * buckets so BOTH 'tumour' and 'tumor' pass — only genuine typos underline.
 * House-style en-GB enforcement stays the RadAI formatter's job, not the
 * spell-checker's (a variant choice isn't a misspelling).
 *
 * Output: public/data/spell_en.json
 *   { meta, words: "word1\nword2\n…" }  — newline-packed (smaller than a JSON
 *   array; the client splits it into a Set once on load).
 *
 * Run: node scripts/build-spell-dictionary.mjs
 */
import english from 'wordlist-english';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PATH = join(ROOT, 'public', 'data', 'spell_en.json');

// Variant-neutral base + every English variant we want to accept. Including AU/CA
// on top of US/GB costs ~a few thousand words and only ever REDUCES false flags
// (Indian English largely follows British conventions, so accept the lot).
const BUCKETS = [
  'english',
  'english/american',
  'english/british',
  'english/australian',
  'english/canadian',
];

// Keep only plain lexical words: letters with optional internal hyphens. This
// matches the editor's tokenizer ([A-Za-z][A-Za-z-]*), so apostrophe forms
// ("don't", "G'day") and any space/digit entries — which could never match a
// token anyway — are dropped rather than bloating the asset. Contractions are
// vanishingly rare in formal report prose and are handled in the checker.
const KEEP = /^[a-z][a-z-]*$/;

const words = new Set();
let scanned = 0;
for (const bucket of BUCKETS) {
  const list = english[bucket];
  if (!Array.isArray(list)) { console.warn(`[spell] missing bucket "${bucket}" — skipped`); continue; }
  for (const raw of list) {
    scanned++;
    const w = String(raw).trim().toLowerCase();
    if (KEEP.test(w)) words.add(w);
  }
}

// Sort for reproducible output + better gzip locality (client builds a Set, so
// order is irrelevant to it, but a stable file makes diffs/caching sane).
const sorted = [...words].sort();

const out = {
  meta: {
    generated: new Date().toISOString(),
    count: sorted.length,
    buckets: BUCKETS,
    source: 'wordlist-english (MIT, SCOWL-derived)',
    note: 'en-GB ∪ en-US (∪ AU/CA) accepted — only true typos flag. Medical terms merged at runtime from radlex_ranked.json.',
  },
  words: sorted.join('\n'),
};

writeFileSync(OUT_PATH, JSON.stringify(out));
const mb = (out.words.length / 1e6).toFixed(2);
console.log(`[spell] scanned ${scanned} entries across ${BUCKETS.length} buckets → ${sorted.length} unique words`);
console.log(`[spell] wrote ${OUT_PATH} (${mb} MB raw)`);

// Sanity: a few en-GB spellings, en-US spellings, and common report words should
// all be present; some obvious typos should be absent.
const has = (w) => words.has(w);
const present = ['oedema', 'edema', 'tumour', 'tumor', 'haemorrhage', 'hemorrhage',
  'unremarkable', 'normal', 'grey', 'gray', 'fibre', 'fiber', 'calcification'];
const absent = ['hemorhage', 'unremarkible', 'calcificaton', 'effusionn'];
console.log('  present? ', present.map((w) => `${w}:${has(w) ? '✓' : '✗'}`).join('  '));
console.log('  absent?  ', absent.map((w) => `${w}:${has(w) ? 'STILL-PRESENT!' : 'ok'}`).join('  '));
