// ════════════════════════════════════════════════════════════════════════
// Duplicate detection — shared fuzzy-matching engine for patients & referrers.
//
// Goal: catch "Mohammed" vs "Mohammad" (spelling drift) and shared-phone
// family members, WITHOUT auto-merging two genuinely different people. The
// caller decides what to do with the ranked candidates; this module only
// scores and tiers them.
//
// Runs entirely client-side over the offline Dexie cache, so duplicate hints
// work instantly and with no network. The backend keeps an authoritative
// safety net (exact phone + normalized name) for the cross-device case.
// ════════════════════════════════════════════════════════════════════════

// Honorifics / relational prefixes that carry no identity and only add noise
// to a name comparison. Stripped from the FRONT of the token list.
const HONORIFICS = new Set([
  'dr', 'mr', 'mrs', 'ms', 'md', 'mohd', 'smt', 'sri', 'shri', 'kumari',
  'master', 'baby', 'mast', 'late', 'col', 'capt', 'prof',
]);

// Relational suffixes like s/o, d/o, w/o, c/o, b/o — everything from here on
// is the guardian's name, not the patient's, so we cut the comparison there.
const RELATIONAL = new Set(['s', 'd', 'w', 'c', 'b']);

export function digitsOnly(s) {
  return String(s ?? '').replace(/\D/g, '');
}

// lowercase → strip punctuation → drop honorifics → cut at relational markers.
export function normalizeName(raw) {
  if (!raw) return '';
  let s = String(raw).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  let tokens = s.split(' ').filter(Boolean);

  // Strip any leading honorifics (can stack: "dr md ...").
  while (tokens.length > 1 && HONORIFICS.has(tokens[0])) tokens.shift();

  // Cut at the first relational marker (s/o → s, o tokens after punctuation
  // removal). We detect a lone 'o' preceded by one of s/d/w/c/b.
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'o' && out.length && RELATIONAL.has(out[out.length - 1])) {
      out.pop();
      break;
    }
    out.push(tokens[i]);
  }
  return out.join(' ');
}

// Order-independent comparison: "ram kumar" === "kumar ram".
function tokenSort(s) {
  return s.split(' ').filter(Boolean).sort().join(' ');
}

// Classic Levenshtein edit distance (iterative, O(n·m), tiny strings).
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// 0..1 similarity on normalized, token-sorted names. 1 = identical.
export function nameSimilarity(a, b) {
  const na = tokenSort(normalizeName(a));
  const nb = tokenSort(normalizeName(b));
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 0 : 1 - levenshtein(na, nb) / maxLen;
}

// Tier ordering for sorting (higher = surfaced first).
const TIER_RANK = { high: 3, medium: 2, family: 1 };

// Thresholds — deliberately conservative so we suggest, never silently merge.
const SIM_STRONG = 0.86; // clear spelling-variant match (Mohammed/Mohammad)
const SIM_PHONE  = 0.70; // looser when the phone already matches exactly

/**
 * Rank probable duplicate patients for a being-entered registration.
 * @param query      { name, mobile, age, gender }
 * @param candidates array of cached patients ({ fullName|name, mobile, age, gender, ... })
 * @returns ranked [{ patient, similarity, phoneExact, tier }]
 */
export function rankPatientDuplicates(query, candidates, { limit = 4 } = {}) {
  const qName = query?.name || '';
  const qMobile = digitsOnly(query?.mobile);
  const qGender = (query?.gender || '').toLowerCase();
  const qAge = String(query?.age ?? '').trim();
  if (normalizeName(qName).length < 2) return [];

  const out = [];
  for (const c of candidates || []) {
    if (!c) continue;
    const cName = c.fullName || c.name || '';
    const sim = nameSimilarity(qName, cName);
    const cMobile = digitsOnly(c.mobile);
    const phoneExact = !!qMobile && !!cMobile && qMobile === cMobile;

    // Cheap demographic agreement boosters for the no-phone case.
    const genderAgrees = !qGender || !c.gender || qGender === String(c.gender).toLowerCase();
    const ageAgrees = !qAge || !c.age || String(c.age).replace(/\D/g, '') === qAge.replace(/\D/g, '');

    let tier = null;
    if (phoneExact && sim >= SIM_PHONE) tier = 'high';
    else if (phoneExact) tier = 'family';          // same phone, different name
    else if (sim >= 0.94) tier = 'high';           // near-identical name, no phone
    else if (sim >= SIM_STRONG && genderAgrees && ageAgrees) tier = 'medium';

    if (tier) out.push({ patient: c, similarity: sim, phoneExact, tier });
  }

  out.sort((a, b) => (TIER_RANK[b.tier] - TIER_RANK[a.tier]) || (b.similarity - a.similarity));
  return out.slice(0, limit);
}

/**
 * Rank probable duplicate referrers for a being-typed referral source.
 * Referrers have no phone requirement, so this is name-similarity only.
 * @returns ranked [{ referrer, similarity, tier }]
 */
export function rankReferrerDuplicates(name, candidates, { limit = 4 } = {}) {
  if (normalizeName(name).length < 2) return [];
  const out = [];
  for (const r of candidates || []) {
    if (!r) continue;
    const sim = nameSimilarity(name, r.name || '');
    if (sim >= 1) continue; // exact (already selected) — nothing to suggest
    let tier = null;
    if (sim >= 0.92) tier = 'high';
    else if (sim >= SIM_STRONG) tier = 'medium';
    if (tier) out.push({ referrer: r, similarity: sim, tier });
  }
  out.sort((a, b) => (TIER_RANK[b.tier] - TIER_RANK[a.tier]) || (b.similarity - a.similarity));
  return out.slice(0, limit);
}
