/** Small helpers for the Partners screens. */

// The centre's rule (Money ▸ Setup, migration 118): a share can be paid once the
// bill is made (default), or only after the patient has paid in full. The Partners
// page sets this from the server's answer before any sheet opens.
let payWhenBilled = true;
export function setPayWhenBilled(v) { payWhenBilled = v !== false; }
export function getPayWhenBilled() { return payWhenBilled; }

/**
 * Where one open commission row stands for the partner:
 *  'owed'    - a negative row: money the partner owes back (clawback, over-concession);
 *  'ready'   - can be paid now (a bill exists — or is paid in full, under the stricter
 *              rule — or a manual line with no visit);
 *  'waiting' - not payable yet (no bill, or the patient hasn't paid under the stricter rule).
 * Same rule as the server's payout gate (PatientPaymentStatus.IsPayable).
 */
export function rowState(r) {
  const amount = Number(r.amount || 0);
  if (amount < 0) return 'owed';
  if (!r.appointmentId) return 'ready';
  const st = String(r.patientPaymentStatus || '').toUpperCase();
  if (payWhenBilled) return ['PAID', 'PARTIAL', 'PENDING'].includes(st) ? 'ready' : 'waiting';
  return st === 'PAID' ? 'ready' : 'waiting';
}

/** A payable row on a bill the patient hasn't paid in full yet. */
export function patientOwes(r) {
  const st = String(r.patientPaymentStatus || '').toUpperCase();
  return Number(r.amount || 0) > 0 && !!r.appointmentId && (st === 'PARTIAL' || st === 'PENDING');
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
