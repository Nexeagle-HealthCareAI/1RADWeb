/** Small helpers for the Partners screens. */

/**
 * Where one open commission row stands for the partner:
 *  'owed'    - a negative row: money the partner owes back (clawback, over-concession);
 *  'ready'   - can be paid now (patient paid the bill in full, or a manual line with no visit);
 *  'waiting' - the patient has not paid in full yet.
 * Same rule as the server's payout gate (PatientPaymentStatus.IsPayable).
 */
export function rowState(r) {
  const amount = Number(r.amount || 0);
  if (amount < 0) return 'owed';
  if (!r.appointmentId) return 'ready';
  return String(r.patientPaymentStatus || '').toUpperCase() === 'PAID' ? 'ready' : 'waiting';
}

export function shortDate(v) {
  if (!v) return '';
  const d = new Date(String(v).length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function longDate(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Digits only, Indian 10-digit form when it is one. */
export function mobileDigits(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}

/** Initials + test only: what may travel on WhatsApp (no names, no IDs). */
export function initials(name) {
  return String(name || '').split(/\s+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 3).join('.') + (name ? '.' : '');
}

/** Current Indian financial year label, e.g. 2026-27. */
export function currentFy(now = new Date()) {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
