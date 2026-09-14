/**
 * invoiceApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls related to invoice read/write operations.
 * Centralises the API contract so changes to endpoints only happen here.
 *
 * Single Responsibility: invoice data only.
 * No state, no React — pure async functions.
 */

import apiClient from '../apiClient';

/**
 * Fetch invoices with optional filters.
 * Returns raw response data (array OR paged envelope).
 */
export const fetchInvoices = async ({
  search,
  status,
  startDate,
  endDate,
  updatedAfter,
  appointmentId,
  includeDeleted = false,
  pageSize = 0,
  cursor = null,
} = {}) => {
  const params = {};
  if (search)        params.search        = search;
  if (status)        params.status        = status;
  if (startDate)     params.startDate     = startDate;
  if (endDate)       params.endDate       = endDate;
  if (updatedAfter)  params.updatedAfter  = updatedAfter;
  if (appointmentId) params.appointmentId = appointmentId;
  if (includeDeleted) params.includeDeleted = includeDeleted;
  if (pageSize)      params.pageSize      = pageSize;
  if (cursor)        params.cursor        = cursor;

  const res = await apiClient.get('/finance/invoices', { params });
  return res.data;
};

/**
 * Generate a new manual invoice.
 * @returns {{ invoiceId: string }}
 */
export const generateInvoice = async (command, idempotencyKey = null) => {
  const config = idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {};
  const res = await apiClient.post('/finance/invoices', command, config);
  return res.data;
};

/**
 * Delete an invoice by ID.
 * @param {string} id
 * @param {string|null} commissionId
 */
export const deleteInvoice = async (id, commissionId = null) => {
  const params = commissionId ? { commissionId } : {};
  const res = await apiClient.delete(`/finance/invoices/${id}`, { params });
  return res.data;
};

/**
 * Fetch unbilled services for a patient (for "Add to bill" flow).
 * @param {string} patientId
 */
export const fetchPendingBillables = async (patientId) => {
  const res = await apiClient.get(`/finance/pending-billables/${patientId}`);
  return res.data;
};
