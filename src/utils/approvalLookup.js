// Approval-request visibility helper.
//
// Fetches the hospital's approval requests once and builds a lookup so any board
// (Revenue, Referral Hub, Appointment) can show, per invoice / appointment,
// whether a sensitive change is awaiting admin sign-off — and the outcome.
import apiClient from '../api/apiClient';

// Returns { byInvoice, byAppointment, rows }. Keys are the Guid invoiceId /
// appointmentId; each holds the LATEST request (rows arrive newest-first).
export async function fetchApprovalMap() {
  try {
    const res = await apiClient.get('/approvals?status=ALL');
    const rows = Array.isArray(res.data) ? res.data : [];
    const byInvoice = {};
    const byAppointment = {};
    for (const r of rows) {
      if (r.invoiceId && !byInvoice[r.invoiceId]) byInvoice[r.invoiceId] = r;
      if (r.appointmentId && !byAppointment[r.appointmentId]) byAppointment[r.appointmentId] = r;
    }
    return { byInvoice, byAppointment, rows };
  } catch {
    return { byInvoice: {}, byAppointment: {}, rows: [] };
  }
}

// The latest approval request tied to an invoice (by its Guid invoiceId, else by
// its appointmentId). Returns null when there's none.
export function approvalForInvoice(map, inv) {
  if (!map || !inv) return null;
  return (inv.invoiceId && map.byInvoice?.[inv.invoiceId])
    || (inv.appointmentId && map.byAppointment?.[inv.appointmentId])
    || null;
}

// The latest approval request tied to an appointment (by its Guid).
export function approvalForAppointment(map, appointmentId) {
  if (!map || !appointmentId) return null;
  return map.byAppointment?.[appointmentId] || null;
}

// Small visual config for a status, shared by the badges.
export function approvalBadge(status) {
  switch ((status || '').toUpperCase()) {
    case 'PENDING':  return { label: 'Approval awaited', short: 'AWAITING', icon: '⏳', color: '#b45309', bg: '#fffbeb', bd: '#fde68a' };
    case 'APPROVED': return { label: 'Admin approved',   short: 'APPROVED', icon: '✅', color: '#166534', bg: '#ecfdf5', bd: '#a7f3d0' };
    case 'REJECTED': return { label: 'Admin rejected',   short: 'REJECTED', icon: '⛔', color: '#991b1b', bg: '#fef2f2', bd: '#fecaca' };
    default:         return null;
  }
}
