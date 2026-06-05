// Referrer name formatting helpers.
//
// Doctors are conventionally written with a "Dr." prefix. Billers often forget
// it, so we add it automatically at the point a referral is saved (booking,
// edit, or change-referrer) — but only when the referrer is actually a doctor,
// never for "Self" / walk-ins or "Other person" (agent) referrers, and never
// when a prefix is already present.

export function withDoctorPrefix(name, isDoctor) {
  const n = String(name || '').trim();
  if (!n) return n;
  if (isDoctor === false) return n;                 // agent / non-doctor — leave as-is
  if (n.toLowerCase() === 'self') return n;          // walk-in — no prefix
  if (/^dr\.?(\s|$)/i.test(n) || /^doctor(\s|$)/i.test(n)) return n; // already prefixed
  return `Dr. ${n}`;
}
