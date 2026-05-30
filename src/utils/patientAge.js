// Patient age helpers — encode the unit (year / month / day) as a single
// trailing letter suffix on the existing string field. No backend / schema
// change needed.
//
// Storage shape:
//   "25"   → 25 years  (legacy plain-number records keep working as "years")
//   "25y"  → 25 years  (explicit)
//   "6m"   → 6 months
//   "15d"  → 15 days
//
// Display normalises to a single uppercase suffix: 25Y / 6M / 15D.

const UNITS = ['Y', 'M', 'D'];

// Parse stored value into { value, unit }. Unknown / empty / malformed
// inputs fall back to { value: '', unit: 'Y' } so the booking form opens
// cleanly even when an existing patient has no age recorded.
export function parsePatientAge(stored) {
  if (stored == null) return { value: '', unit: 'Y' };
  const s = String(stored).trim().toLowerCase();
  if (!s) return { value: '', unit: 'Y' };

  const match = s.match(/^([0-9]+(?:\.[0-9]+)?)\s*([ymd])?$/i);
  if (!match) return { value: '', unit: 'Y' };

  const value = match[1];
  const unit = (match[2] || 'y').toUpperCase();
  return { value, unit: UNITS.includes(unit) ? unit : 'Y' };
}

// Build the canonical stored value. Years drop the suffix to stay
// backward-compatible with legacy data; months/days carry an explicit
// lowercase suffix so the parser round-trips.
export function buildPatientAge(value, unit) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (unit === 'M') return `${v}m`;
  if (unit === 'D') return `${v}d`;
  // Y or unknown → plain number (legacy-compatible)
  return v;
}

// Human-readable display. "25" → "25Y", "6m" → "6M", "15d" → "15D".
// Empty or malformed inputs render as the supplied dash so worklist rows
// don't show a confusing "0Y" or blank cell.
export function formatPatientAge(stored, dash = '—') {
  const { value, unit } = parsePatientAge(stored);
  if (!value) return dash;
  return `${value}${unit}`;
}
