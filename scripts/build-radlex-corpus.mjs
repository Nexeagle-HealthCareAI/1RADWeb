#!/usr/bin/env node
/**
 * Build a FREQUENCY-RANKED RadLex corpus for the editor's autocomplete.
 *
 * Merges three sources into one ranked, prefix-indexable corpus:
 *   1. The full RadLex 68k term labels   (backend Resources/Radiology/radlex_terms.json)
 *   2. The 1,621 curated common terms     (public/data/autocomplete_light.json) — these
 *      are editorially-chosen high-frequency terms, so they get a big base boost.
 *   3. (Optional) report-derived frequency (public/data/radlex_frequency.json) produced
 *      by the backend term-frequency job from the clinic's own reports — REAL usage.
 *
 * Output: public/data/radlex_ranked.json
 *   { meta, terms: [labels sorted A–Z (normalized)], freq: [score aligned] }
 *   The client binary-searches `terms` for a prefix range, then ranks that range
 *   by `freq` — so common/used terms float to the top instead of alphabetical.
 *
 * Run: node scripts/build-radlex-corpus.mjs
 *   RADLEX_PATH=... overrides the 68k source location.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const RADLEX_PATH = process.env.RADLEX_PATH
  || join(ROOT, '..', '..', 'EasyHMS', '1RadAPI', '1RadAPI', 'Resources', 'Radiology', 'radlex_terms.json');
const CURATED_PATH = join(ROOT, 'public', 'data', 'autocomplete_light.json');
const FREQ_PATH    = join(ROOT, 'public', 'data', 'radlex_frequency.json'); // optional
const OUT_PATH     = join(ROOT, 'public', 'data', 'radlex_ranked.json');

const norm = (s) => String(s || '').trim().toLowerCase();

// 1. Full RadLex (flat array of label strings, or { terms: [...] }).
const radlex = JSON.parse(readFileSync(RADLEX_PATH, 'utf8'));
const radlexTerms = Array.isArray(radlex) ? radlex : (radlex.terms || []);

// 2. Curated 1,621 (rich shape { label, cat, ... }) — high base frequency.
const curated = JSON.parse(readFileSync(CURATED_PATH, 'utf8'));
const curatedTerms = (curated.terms || []).map((t) => t.label).filter(Boolean);
const curatedSet = new Set(curatedTerms.map(norm));

// 3. Optional report-derived frequency { "term": count }.
let reportFreq = {};
if (existsSync(FREQ_PATH)) {
  try {
    reportFreq = JSON.parse(readFileSync(FREQ_PATH, 'utf8')) || {};
    console.log(`[corpus] merged report frequency for ${Object.keys(reportFreq).length} terms`);
  } catch (e) {
    console.warn('[corpus] radlex_frequency.json present but unreadable — ignoring:', e.message);
  }
}

// Union (RadLex ∪ curated) keyed by normalized label, keep first display form.
const all = new Map();
for (const t of radlexTerms) { const n = norm(t); if (n) all.set(n, String(t)); }
for (const t of curatedTerms) { const n = norm(t); if (n && !all.has(n)) all.set(n, String(t)); }

// Tie-breaker: shorter, fewer-word terms rank slightly higher (a 1-word term
// beats a 6-word phrase when neither is curated/used). Bounded so it never
// outweighs a curated boost or real usage.
function heuristic(label) {
  const words = label.trim().split(/\s+/).length;
  return Math.max(0, 40 - (words - 1) * 8 - Math.floor(label.length / 12));
}

function score(n, label) {
  const used = reportFreq[n] || reportFreq[label] || 0; // real usage dominates
  const curatedBoost = curatedSet.has(n) ? 500 : 0;
  return used * 1000 + curatedBoost + heuristic(label);
}

// Alphabetical (normalized) so the client can binary-search a prefix range.
const entries = [...all.entries()]
  .map(([n, label]) => ({ n, label, f: score(n, label) }))
  .sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));

const out = {
  meta: {
    generated: new Date().toISOString(),
    count: entries.length,
    curated: curatedSet.size,
    withReportFreq: Object.keys(reportFreq).length,
    note: 'terms sorted A–Z (normalized) for prefix binary-search; freq[] aligned for relevance ranking.',
  },
  terms: entries.map((e) => e.label),
  freq:  entries.map((e) => e.f),
};

writeFileSync(OUT_PATH, JSON.stringify(out));
const mb = (JSON.stringify(out).length / 1e6).toFixed(2);
console.log(`[corpus] wrote ${out.terms.length} terms → ${OUT_PATH} (${mb} MB, curated boost on ${curatedSet.size})`);

// Quick sanity: show how a few common prefixes now rank (top 5 by freq).
for (const prefix of ['ca', 'pleu', 'effus', 'nodul']) {
  const hits = entries
    .filter((e) => e.n.startsWith(prefix))
    .sort((a, b) => b.f - a.f)
    .slice(0, 5)
    .map((e) => e.label);
  console.log(`  "${prefix}" → ${hits.join(' | ')}`);
}
