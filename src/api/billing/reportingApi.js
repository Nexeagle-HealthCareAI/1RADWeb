/**
 * reportingApi.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All HTTP calls for financial reporting, analytics, and data export.
 *
 * Single Responsibility: read-only aggregation and export only.
 * No state, no React — pure async functions.
 */

import apiClient from '../apiClient';

/**
 * Fetch high-level financial summary stats (revenue, pending count, etc).
 */
export const fetchFinanceStats = async () => {
  const res = await apiClient.get('/finance/stats');
  return res.data;
};

/**
 * Fetch the financial analytics matrix (daily/weekly/monthly breakdown).
 * @param {{ startDate?: string, endDate?: string }} params
 */
export const fetchFinancialMatrix = async ({ startDate, endDate } = {}) => {
  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate)   params.endDate   = endDate;

  const res = await apiClient.get('/finance/matrix', { params });
  return res.data;
};

/**
 * Trigger server-side Excel export and return the blob.
 * @param {{ startDate?: string, endDate?: string }} params
 * @returns {Blob}
 */
export const exportFinancials = async ({ startDate, endDate } = {}) => {
  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate)   params.endDate   = endDate;

  const res = await apiClient.get('/finance/export', {
    params,
    responseType: 'blob',
  });
  return res.data;
};

