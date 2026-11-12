import apiClient from '../apiClient';

/**
 * Money (redesign, Nov 2026): the calls the new Bills and Collect screens make.
 * Collecting still goes through POST /finance/payments; a split payment sends
 * `tenders` and the server writes one row per part under one receipt number.
 */

/** One page of bills. status: '' | 'DUE' | 'PAID' | 'CANCELLED'. Dates are IST 'YYYY-MM-DD'. */
export const fetchBills = async ({ search, status, startDate, endDate, cursor, pageSize = 30 } = {}) => {
  const params = { pageSize };
  if (search) params.search = search;
  if (status) params.status = status;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (cursor) params.cursor = cursor;
  const res = await apiClient.get('/finance/invoices', { params, suppressErrorToast: true });
  const d = res.data;
  return Array.isArray(d) ? { items: d, nextCursor: null, totalCount: d.length } : d;
};

/** The bill as the list shows it (needed for printing), found by its number. */
export const fetchBillByNumber = async (number) => {
  const { items } = await fetchBills({ search: number, pageSize: 5 });
  return (items || []).find(i => i.displayId === number) || null;
};

/** The bill and its money history: made, payments, refunds, credit notes, approvals. */
export const fetchBillHistory = async (invoiceId) => {
  const res = await apiClient.get(`/finance/invoices/${invoiceId}/history`, { suppressErrorToast: true });
  return res.data;
};

/**
 * Take money: tenders = [{ mode: 'CASH'|'UPI'|'CARD'|'BANK', amount, reference }].
 * centreDiscount is the whole centre discount on the bill (not just the new part).
 */
export const takePayment = async ({ invoiceId, tenders, centreDiscount, discountReason, rowVersion }, idempotencyKey) => {
  const body = { invoiceId, amount: 0, tenders, rowVersion };
  if (centreDiscount != null) body.centreDiscount = centreDiscount;
  if (discountReason) body.discountReason = discountReason;
  const res = await apiClient.post('/finance/payments', body,
    { headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}, suppressErrorToast: true });
  return res.data;
};

/**
 * Ask the owner (Admin approval) for a discount above the asker's limit, or for a
 * correction to a bill that already has money on it. Approving it applies the new
 * discount; on a paid bill the server then issues a credit note.
 */
export const askOwner = async ({ bill, centreDiscount, reason, title }) => {
  const res = await apiClient.post('/approvals', {
    type: 'EDIT_PAYMENT',
    invoiceId: bill.invoiceId || bill.id,
    title: title || `${bill.displayId || bill.number || ''} · ${bill.patientName || ''}`.trim(),
    payload: JSON.stringify({
      centreDiscount: Math.max(0, Math.round(Number(centreDiscount) || 0)),
      referrerDiscount: Number(bill.referrerDiscount) || 0,
      deduction: Number(bill.institutionalDeduction ?? bill.deduction) || 0,
    }),
    reason,
  }, { suppressErrorToast: true });
  return res.data;
};
